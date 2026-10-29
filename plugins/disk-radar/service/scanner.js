'use strict';
/**
 * scanner.js —— 磁盘分析扫描引擎（零依赖，node >= 18）
 *
 * 单次遍历同时产出：目录聚合树（记录 depth ≤ recordDepth）+ 开发垃圾清单
 * （命中规则的目录作为垃圾帧，帧完成取子树聚合，帧内不再嵌套计条）+
 * 无权限/占用计数。全流程有预算与取消位，周期让出事件循环保健康端点。
 *
 * 设计约束（见主仓 plans/disk-radar-plugin-spec.md）：
 *   - 不跟随 symlink；junction 靠深度硬上限兜底 + Windows 旧版 junction 名单跳过
 *   - 任何单条目失败（EBUSY/EPERM/长路径）都降级为 denied 计数，绝不中断整棵树
 *   - .DiskRadarTrash 与 excludeNames 永不进入垃圾/隔离/树
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const core = require('../shared/disk-core');

const YIELD_EVERY = 512;      // 每 N 个条目 setImmediate 让出
const CHECK_EVERY = 256;      // 每 N 个条目查一次预算/取消
const STAT_CONSECUTIVE_ERR_ABORT = 4096; // 连续 stat 失败该数（盘掉了）才放弃整树

class ScanAbort extends Error {
  constructor(kind) { super(kind); this.kind = kind; } // 'cancelled' | 'budget'
}

function isDeniedCode(code) {
  return code === 'EACCES' || code === 'EPERM' || code === 'EBUSY' || code === 'ELOOP';
}

/** 卷剩余/总空间：statfs 优先，失败退 fsutil，再失败 null */
async function volumeFree(rootPath) {
  try {
    const st = await fs.promises.statfs(rootPath);
    const free = Number(st.bavail) * Number(st.bsize);
    const total = Number(st.blocks) * Number(st.bsize);
    if (Number.isFinite(free) && Number.isFinite(total) && total > 0) return { free, total };
  } catch (_) { /* 走 fsutil 兜底 */ }
  if (process.platform === 'win32') {
    const drive = path.parse(rootPath).root;
    if (/^[a-zA-Z]:\\?$/.test(drive)) {
      const out = await new Promise((resolve) => {
        execFile('fsutil', ['volume', 'diskfree', drive.trimEnd('\\')], { timeout: 8000, windowsHide: true }, (err, stdout) => {
          resolve(err ? '' : String(stdout || ''));
        });
      });
      return core.parseFsutilOutput(out);
    }
  }
  return null;
}

/**
 * 遍历一个根目录。
 * @param opts {{
 *   rootPath: string, recordDepth: number, budgetMs: number, collectJunk: boolean,
 *   settings: {extraJunkDirs?: string[], excludeNames?: string[]},
 *   shouldCancel?: () => boolean,
 *   onProgress?: (p: {bytes:number, files:number, currentPath:string}) => void,
 * }}
 * @returns {Promise<{total:number, files:number, dirs:Array, junkItems:Array,
 *   deniedFiles:number, deniedDirs:number, skippedLinks:number, partial:boolean,
 *   cancelled:boolean, elapsedMs:number, volume:{free,total}|null}>}
 */
async function walkRoot(opts) {
  const {
    rootPath, recordDepth, budgetMs, collectJunk = true,
    settings = {}, shouldCancel = null, onProgress = null,
  } = opts;
  const startedAt = Date.now();
  const exclude = new Set([core.TRASH_DIR, ...(settings.excludeNames || [])].map((n) => String(n).toLowerCase()));
  // excludeNames 按名匹配任意层级；隔离区目录按名匹配即可（根下唯一）
  const excludeHas = (name) => exclude.has(String(name).toLowerCase());

  const junkItems = [];
  let deniedFiles = 0;
  let deniedDirs = 0;
  let skippedLinks = 0;
  let partial = false;
  let cancelled = false;
  let statErrStreak = 0;

  // 帧结构：path/rel/depth/agg(子树聚合)/recNode(记录节点，depth>recordDepth 为 null)/junkItem
  const rootAgg = { b: 0, f: 0, maxM: 0 };
  const rootNode = { n: path.basename(rootPath) || rootPath, b: 0, f: 0, c: recordDepth >= 1 ? [] : undefined };
  const stack = [{
    path: rootPath, rel: '', depth: 0, agg: rootAgg,
    recNode: recordDepth >= 1 ? rootNode : null,
    junkItem: null,
  }];

  const newAgg = () => ({ b: 0, f: 0, maxM: 0 });
  const rollUp = (frame) => {
    // 帧完成：聚合滚入父帧；记录节点挂到父记录节点
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.agg.b += frame.agg.b;
      parent.agg.f += frame.agg.f;
      if (frame.agg.maxM > parent.agg.maxM) parent.agg.maxM = frame.agg.maxM;
      if (frame.recNode && parent.recNode) {
        frame.recNode.b = frame.agg.b;
        frame.recNode.f = frame.agg.f;
        if (!parent.recNode.c) parent.recNode.c = [];
        parent.recNode.c.push(frame.recNode);
      } else if (frame.recNode && !parent.recNode && frame.depth === 1) {
        // recordDepth<1 时不会发生（rootNode.c 为 undefined）
      }
    }
    if (frame.junkItem && frame.junkItem.collect) {
      junkItems.push({
        id: core.junkItemId(frame.junkItem.relPath),
        relPath: frame.junkItem.relPath,
        name: frame.junkItem.name,
        kind: frame.junkItem.kind,
        note: frame.junkItem.note,
        bytes: frame.agg.b,
        files: frame.agg.f,
        lastWrite: Math.round(frame.agg.maxM),
      });
    }
  };

  let entriesSinceCheck = 0;
  let entriesSinceYield = 0;
  const budgetHit = () => budgetMs > 0 && Date.now() - startedAt > budgetMs;

  async function processDirFrame() {
    // walk 标签：目录条目入栈子帧后必须直接 continue 外层（顶栈=子帧）。
    // 若只 break 内层，会落到同轮外层的「完成检查」——用陈旧 frame 绑定把
    // 刚 push 的子帧 pop 掉、并 rollUp(父帧) 到父帧自身（成环+聚合翻倍）。
    walk: while (stack.length) {
      if (shouldCancel && shouldCancel()) throw new ScanAbort('cancelled');
      if (budgetHit()) throw new ScanAbort('budget');
      const frame = stack[stack.length - 1];
      if (frame.nextIndex === undefined) {
        // 首次进入：读目录
        let dirents;
        try {
          dirents = await fs.promises.readdir(core.longPath(frame.path), { withFileTypes: true });
          statErrStreak = 0;
        } catch (e) {
          if (isDeniedCode(e.code)) {
            deniedDirs += 1;
            if (frame.recNode) frame.recNode.d = 1;
          } else {
            throw e;
          }
          stack.pop();
          rollUp(frame);
          continue;
        }
        frame.entries = dirents;
        frame.nextIndex = 0;
        // 兄弟名单（垃圾判定锚定用）
        frame.siblings = dirents.map((d) => d.name);
      }

      let processed = 0;
      const list = frame.entries;
      while (frame.nextIndex < list.length && processed < YIELD_EVERY) {
        const ent = list[frame.nextIndex];
        frame.nextIndex += 1;
        processed += 1;
        entriesSinceCheck += 1;
        entriesSinceYield += 1;

        if (entriesSinceCheck >= CHECK_EVERY) {
          entriesSinceCheck = 0;
          if (shouldCancel && shouldCancel()) throw new ScanAbort('cancelled');
          if (budgetHit()) throw new ScanAbort('budget');
        }
        if (entriesSinceYield >= YIELD_EVERY) {
          entriesSinceYield = 0;
          if (onProgress) {
            onProgress({ bytes: rootAgg.b, files: rootAgg.f, currentPath: frame.rel || '.' });
          }
          await new Promise((r) => setImmediate(r));
          if (shouldCancel && shouldCancel()) throw new ScanAbort('cancelled');
          if (budgetHit()) throw new ScanAbort('budget');
        }

        const name = ent.name;
        if (excludeHas(name)) continue;
        if (ent.isSymbolicLink()) { skippedLinks += 1; continue; }
        if (frame.depth === 0 && core.isLegacyJunctionName(name)) { skippedLinks += 1; continue; }

        const childPath = path.join(frame.path, name);
        const childRel = frame.rel ? `${frame.rel}/${name}` : name;

        if (ent.isDirectory()) {
          if (frame.depth >= core.MAX_WALK_DEPTH) { skippedLinks += 1; continue; }
          const childRecNode = frame.recNode && frame.recNode.c !== undefined
            ? { n: name, b: 0, f: 0, c: frame.depth + 1 < recordDepth ? [] : undefined }
            : null;
          const agg = newAgg();
          let junkMeta = null;
          if (collectJunk && !frame.junkItem) {
            const hit = core.classifyJunkDir({ name, siblings: frame.siblings, extraDirs: settings.extraJunkDirs });
            if (hit.hit) junkMeta = { relPath: childRel, name, kind: hit.kind, note: hit.note, collect: true };
          }
          stack.push({
            path: childPath, rel: childRel, depth: frame.depth + 1,
            agg, recNode: childRecNode, junkItem: junkMeta,
          });
          continue walk; // 深入子帧（DFS）——绝不落到本轮的完成检查
        } else if (ent.isFile()) {
          let size = 0;
          let mtime = 0;
          try {
            const st = await fs.promises.lstat(core.longPath(childPath));
            size = Number(st.size) || 0;
            mtime = Number(st.mtimeMs) || 0;
            statErrStreak = 0;
          } catch (e) {
            if (isDeniedCode(e.code)) deniedFiles += 1;
            else if (e.code === 'ENOENT') { /* 竞态删除，忽略 */ }
            else {
              statErrStreak += 1;
              if (statErrStreak > STAT_CONSECUTIVE_ERR_ABORT) throw e;
            }
          }
          frame.agg.b += size;
          frame.agg.f += 1;
          if (mtime > frame.agg.maxM) frame.agg.maxM = mtime;
        } else {
          // FIFO/设备等非常规条目：只计数不计量
          skippedLinks += 1;
        }
      }

      if (frame.nextIndex >= list.length) {
        stack.pop();
        rollUp(frame);
        if (onProgress && stack.length === 0) {
          onProgress({ bytes: rootAgg.b, files: rootAgg.f, currentPath: '' });
        }
      }
    }
  }

  let elapsedMs = 0;
  try {
    await processDirFrame();
  } catch (e) {
    if (e instanceof ScanAbort) {
      if (e.kind === 'cancelled') cancelled = true;
      else partial = true;
      // 中止时栈上未完成帧的聚合不回滚——总量按已扫部分计（partial 语义）
      let rb = 0;
      let rf = 0;
      for (const f of stack) { rb += f.agg.b; rf += f.agg.f; }
      rootAgg.b += rb;
      rootAgg.f += rf;
    } else {
      throw e;
    }
  }
  elapsedMs = Date.now() - startedAt;

  core.sortTree(rootNode.c || []);
  // 中止时挂着的帧因 rollUp 未执行而不在树里，未完成部分天然不出现——partial 标记已表明不完整

  const volume = await volumeFree(rootPath).catch(() => null);

  return {
    total: rootAgg.b,
    files: rootAgg.f,
    dirs: rootNode.c || [],
    junkItems,
    deniedFiles,
    deniedDirs,
    skippedLinks,
    partial,
    cancelled,
    elapsedMs,
    volume,
  };
}

/**
 * 一次性「快速细查」（面板下钻 / MCP disk_report）：
 * 不登记根、预算严格、recordDepth 即 maxDepth，返回同一形状的子树。
 */
async function probeDir({ dirPath, maxDepth = 2, budgetMs = 15000, settings }) {
  const r = await walkRoot({
    rootPath: dirPath,
    recordDepth: Math.max(0, Math.min(4, Number(maxDepth) || 2)),
    budgetMs: Math.min(30000, Math.max(2000, Number(budgetMs) || 15000)),
    collectJunk: true,
    settings: settings || {},
  });
  return r;
}

module.exports = { walkRoot, probeDir, volumeFree };
