'use strict';
/**
 * lib.js —— 文件管家纯逻辑层（零依赖，可离线单测；不触碰 fs/网络）
 *
 * 设计约束（同 net-sentinel/service/lib.js）：所有函数输入输出均为纯数据。
 * 服务层负责真实 fs（walk / rename / hash），本文件负责：
 *   - 设置 / 根目录 / 规则的规范化（防御面板与 MCP 写入的脏数据）
 *   - 目标路径模板渲染（{name}{ext}{yyyy}{mm}{dd}），Windows 非法字符净化
 *   - 匹配判定（扩展名 / 名称正则 / 大小 / 年龄 / 子目录 / 新文件护栏 / 部分文件排除）
 *   - 计划生成 planForRoot（优先级先到先得 + stopOnMatch + 目的子树排除）
 *   - 去重分组 planDedupe（服务层算好内容指纹后由本层产出 ops）
 *   - 撤销计划 planUndoOps（to 仍在 & from 已空 才回移，其余如实报告）
 *   - 保留清扫计划 retentionPlan
 *
 * 安全不变式（本层强制，服务层不得绕过）：
 *   - 永不产生删除类 op（recycle = 移入 <root>/_FileFlow回收站/）
 *   - 目的路径解析后不得逃逸出根目录（相对模板按根内解析；绝对路径必须
 *     rule.action.allowOutsideRoot === true，且 plan 内标记 safe=false，
 *     自动模式只执行 safe 的 op）
 *   - 模板渲染后的每一段路径剔除 Windows 非法字符与「..」
 */

const VERSION = '0.1.0';

const RECYCLE_DIR = '_FileFlow回收站';
const DEDUPE_SUBDIR = '重复文件';

/** 部分下载文件后缀（浏览器/下载器未完成的文件，永不整理） */
const PARTIAL_EXTS = ['.crdownload', '.part', '.tmp', '.download', '.partial', '.!ut', '.opdownload'];

// ── 设置 ───────────────────────────────────────────────────────────────────
const SETTING_LIMITS = {
  guardMinutes: [1, 120, 5],
  maxOpsPerRun: [10, 2000, 500],
  dedupeMaxFiles: [10, 2000, 300],
  dedupeMaxSizeMB: [1, 4096, 512],
  sweepMinutes: [5, 240, 15],
};

function normalizeSettings(raw) {
  const out = {};
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw ? raw[k] : NaN);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  out.watchEnabled = typeof (raw && raw.watchEnabled) === 'boolean' ? raw.watchEnabled : true;
  return out;
}

// ── 根目录 ─────────────────────────────────────────────────────────────────
const ROOTS_MAX = 8;
const AUTOS = ['off', 'new', 'all'];

/** win 路径语法校验（不 stat，存在性由服务层验证） */
function isValidAbsPath(p) {
  if (typeof p !== 'string' || p.length < 3 || p.length > 240) return false;
  if (!/^[a-zA-Z]:[\\/]/.test(p) && !p.startsWith('\\\\')) return false; // 盘符或 UNC
  if (/[<>"|?*\u0000-\u001f]/.test(p.replace(/^\\\\[^\\]+/, ''))) return false; // UNC 机器名允许
  if (/(^|[\\/])\.\.($|[\\/])/.test(p)) return false;
  return true;
}

function normalizeRoots(raw) {
  const list = raw && Array.isArray(raw.roots) ? raw.roots : [];
  const out = [];
  const seenPath = new Set();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const p = String(r.path || '').trim();
    if (!isValidAbsPath(p)) continue;
    const key = p.toLowerCase().replace(/\//g, '\\');
    if (seenPath.has(key)) continue;
    seenPath.add(key);
    out.push({
      id: String(r.id || '').slice(0, 32) || slugId(p),
      path: p.replace(/\//g, '\\'),
      label: String(r.label || '').trim().slice(0, 24) || pathBase(p),
      auto: AUTOS.includes(r.auto) ? r.auto : 'off',
      addedAt: Number(r.addedAt) > 0 ? Number(r.addedAt) : Date.now(),
    });
    if (out.length >= ROOTS_MAX) break;
  }
  return { v1: 1, roots: out };
}

function slugId(p) {
  const base = pathBase(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16);
  let h = 0;
  for (let i = 0; i < p.length; i++) h = ((h << 5) - h + p.charCodeAt(i)) | 0;
  return `${base || 'root'}-${Math.abs(h) % 1000}`;
}

function pathBase(p) {
  const parts = String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

// ── 规则 ───────────────────────────────────────────────────────────────────
const RULES_MAX = 40;
const ACTIONS = ['move', 'recycle', 'dedupe', 'rename'];
const EXT_RE = /^[a-z0-9]{1,12}$/;

function compileRegex(src) {
  try {
    const re = new RegExp(src);
    return re;
  } catch (_) {
    return null;
  }
}

/**
 * 单条规则规范化。返回 { error } 或规则对象。
 * match.subDir 为根内相对目录前缀（不含首尾斜杠，禁 ..）。
 */
function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') return { error: '规则缺失' };
  const action = ACTIONS.includes(raw.action && raw.action.type) ? raw.action.type : null;
  if (!action) return { error: '动作非法（move/recycle/dedupe/rename）' };

  const matchIn = raw.match || {};
  const exts = (Array.isArray(matchIn.exts) ? matchIn.exts : [])
    .map((e) => String(e || '').toLowerCase().replace(/^\./, '').trim())
    .filter((e) => EXT_RE.test(e))
    .slice(0, 16);
  let nameRegex = '';
  if (typeof matchIn.nameRegex === 'string' && matchIn.nameRegex.trim()) {
    const src = matchIn.nameRegex.trim().slice(0, 160);
    if (!compileRegex(src)) return { error: `名称正则无法编译：${src}` };
    nameRegex = src;
  }
  const num = (v, min, max) => {
    // null/undefined/'' 是「未设置」，不得经 Number(null)=0 变成 0 边界
    //（否则 maxSizeMB:0 会把所有文件都排除——kv 回读再规范化时必踩）
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const subDir = typeof matchIn.subDir === 'string' ? cleanRelSeg(matchIn.subDir) : '';
  if (matchIn.subDir && !subDir) return { error: 'subDir 非法（禁 .. 与空段）' };

  const dest = raw.action && typeof raw.action.dest === 'string' ? raw.action.dest.trim().slice(0, 300) : '';
  if (action === 'move' && !dest) return { error: 'move 动作需要目的模板 dest' };
  if (action === 'rename' && !(raw.action && typeof raw.action.pattern === 'string' && raw.action.pattern.trim())) {
    return { error: 'rename 动作需要 pattern 模板' };
  }
  if (dest && !validTemplate(dest)) return { error: `dest 模板非法：${dest}` };
  const pattern = action === 'rename' ? raw.action.pattern.trim().slice(0, 200) : '';

  return {
    id: String(raw.id || '').slice(0, 32) || `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: String(raw.name || '').trim().slice(0, 24) || '未命名规则',
    enabled: raw.enabled !== false,
    rootId: String(raw.rootId || '').slice(0, 32),
    priority: num(raw.priority, 1, 999) || 100,
    stopOnMatch: raw.stopOnMatch !== false,
    match: {
      exts,
      nameRegex,
      subDir,
      minAgeDays: num(matchIn.minAgeDays, 0, 3650),
      maxAgeDays: num(matchIn.maxAgeDays, 0, 3650),
      minSizeMB: num(matchIn.minSizeMB, 0, 1e6),
      maxSizeMB: num(matchIn.maxSizeMB, 0, 1e6),
    },
    action: {
      type: action,
      dest,
      pattern,
      allowOutsideRoot: !!(raw.action && raw.action.allowOutsideRoot),
    },
  };
}

function normalizeRules(raw) {
  const list = raw && Array.isArray(raw.rules) ? raw.rules : [];
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const n = normalizeRule(r);
    if (n.error || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    if (out.length >= RULES_MAX) break;
  }
  out.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { v1: 1, rules: out };
}

/** 规则补丁合并（rules_update 用）：只合并白名单字段，再走一遍全量规范化 */
function mergeRule(rule, patch) {
  if (!rule || typeof rule !== 'object') return { error: '规则缺失' };
  const p = patch && typeof patch === 'object' ? patch : {};
  const merged = {
    id: rule.id,
    name: p.name !== undefined ? p.name : rule.name,
    enabled: p.enabled !== undefined ? p.enabled : rule.enabled,
    rootId: p.rootId !== undefined ? p.rootId : rule.rootId,
    priority: p.priority !== undefined ? p.priority : rule.priority,
    stopOnMatch: p.stopOnMatch !== undefined ? p.stopOnMatch : rule.stopOnMatch,
    match: {
      ...rule.match,
      ...(p.match && typeof p.match === 'object' ? p.match : {}),
    },
    action: {
      ...rule.action,
      ...(p.action && typeof p.action === 'object' ? p.action : {}),
    },
  };
  return normalizeRule(merged);
}

// ── 模板渲染 ───────────────────────────────────────────────────────────────
const TEMPLATE_VARS = ['name', 'base', 'ext', 'yyyy', 'mm', 'dd'];

function validTemplate(t) {
  if (!t || typeof t !== 'string') return false;
  if (/(^|[\\/])\.\.($|[\\/])/.test(t)) return false;
  // 只允许已知变量，避免用户写出 {names} 这类拼错后静默渲染为空
  const used = t.match(/\{([a-z]+)\}/g) || [];
  return used.every((v) => TEMPLATE_VARS.includes(v.slice(1, -1)));
}

function cleanSeg(s) {
  return String(s)
    .replace(/[<>:"|?*\u0000-\u001f\\/]/g, '')
    .replace(/\.+$/, '')
    .trim();
}

/** 相对段净化：'a/../../b' → null；'a//b' → 'a/b' */
function cleanRelSeg(s) {
  const segs = String(s).split(/[\\/]+/).filter(Boolean);
  if (!segs.length) return '';
  if (segs.some((x) => x === '.' || x === '..')) return '';
  const cleaned = segs.map(cleanSeg).filter(Boolean);
  return cleaned.length ? cleaned.join('\\') : '';
}

/**
 * 渲染目的目录模板。返回 { destRel, destAbs, outside, error }。
 * 相对模板按 root 内解析；绝对模板 outside=true（须 allowOutsideRoot）。
 * 含变量的绝对模板只在变量段内净化，静态段严格校验。
 */
function renderDest(template, rootPath, ctx) {
  const t = String(template || '').trim();
  const d = new Date(ctx.nowMs);
  const vars = {
    name: cleanSeg(ctx.name),
    base: cleanSeg(ctx.name.replace(/\.[^.]+$/, '')),
    ext: cleanSeg((ctx.name.match(/\.[^.]+$/) || [''])[0].replace(/^\./, '')),
    yyyy: String(d.getFullYear()),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    dd: String(d.getDate()).padStart(2, '0'),
  };
  const rendered = t.replace(/\{([a-z]+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
  const isAbs = /^[a-zA-Z]:[\\/]/.test(rendered) || rendered.startsWith('\\\\');
  const norm = rendered.replace(/\//g, '\\');
  if (isAbs) {
    const cleaned = norm.split('\\').map((s, i) => (i === 0 ? s : cleanSeg(s))).filter((s, i) => i === 0 || s).join('\\');
    if (cleaned.length < 3) return { error: '绝对目的路径渲染后为空' };
    if (/(^|[\\/])\.\.($|[\\/])/.test(cleaned)) return { error: '目的路径禁止 ..' };
    return { destAbs: cleaned, destRel: null, outside: true };
  }
  const rel = cleanRelSeg(norm);
  if (!rel) return { error: '相对目的路径渲染后为空' };
  return { destRel: rel, destAbs: joinPath(rootPath, rel), outside: false };
}

function joinPath(root, rel) {
  const r = String(root).replace(/[\\/]+$/, '');
  return `${r}\\${rel}`;
}

/** 目的冲突自动改名：name(1).ext / name(2).ext（taken 谓词由服务层提供） */
function conflictName(destAbs, taken) {
  const m = destAbs.match(/^(.*?)(\.[^.\\]+)?$/);
  const stem = m ? m[1] : destAbs;
  const ext = m && m[2] ? m[2] : '';
  for (let i = 1; i < 1000; i++) {
    const cand = `${stem}(${i})${ext}`;
    if (!taken(cand)) return cand;
  }
  return `${stem}-${Date.now().toString(36)}${ext}`;
}

// ── 匹配与计划 ─────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 规则目的子树前缀（根内相对路径，静态段）。
 * '安装包/{yyyy}-{mm}' → ['安装包']；'冷存' → ['冷存']；绝对 dest 不产生前缀。
 * 这些子树不参与匹配（防递归搬家）。
 */
function destPrefixes(rules) {
  const out = new Set([RECYCLE_DIR]);
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.action.type === 'move' && r.action.dest && !/^[a-zA-Z]:/.test(r.action.dest) && !r.action.dest.startsWith('\\\\')) {
      const first = cleanRelSeg(r.action.dest).split('\\')[0];
      if (first) out.add(first);
    }
    if (r.action.type === 'dedupe' && r.action.dest) {
      const first = cleanRelSeg(r.action.dest).split('\\')[0];
      if (first) out.add(first);
    }
  }
  return out;
}

function fileExt(name) {
  const m = String(name).match(/\.([a-z0-9]{1,12})$/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * 单文件 × 单规则匹配判定。entry: {rel, name, size, mtime}。
 * 返回 null（不匹配）或 { why }（命中说明）。
 */
function matchRule(entry, rule, nowMs) {
  const m = rule.match;
  const relNorm = String(entry.rel).replace(/\//g, '\\');
  const name = entry.name || relNorm.split('\\').pop();
  if (m.subDir && !relNorm.startsWith(m.subDir + '\\')) return null;
  if (m.exts && m.exts.length) {
    const ext = fileExt(name);
    if (!m.exts.includes(ext)) return null;
  }
  if (m.nameRegex) {
    const re = compileRegex(m.nameRegex);
    if (!re || !re.test(name)) return null;
  }
  if (Number.isFinite(m.minSizeMB) && entry.size < m.minSizeMB * 1024 * 1024) return null;
  if (Number.isFinite(m.maxSizeMB) && entry.size > m.maxSizeMB * 1024 * 1024) return null;
  const ageDays = (nowMs - entry.mtime) / DAY_MS;
  if (Number.isFinite(m.minAgeDays) && ageDays < m.minAgeDays) return null;
  if (Number.isFinite(m.maxAgeDays) && ageDays > m.maxAgeDays) return null;
  return { why: rule.name };
}

/**
 * 对一个根目录生成计划。
 * entries 由服务层 walk 而来（lib 不碰 fs）：
 *   [{ rel, name, size, mtime }]
 * dedupeNeeds：需要服务层算指纹的文件清单（dedupe 规则命中者）。
 * 返回 { ops, skipped, dedupeNeeds, counts }。
 *   op: { fromRel, toRel|null(rename), toAbsHint, ruleId, action, safe, rename? }
 */
function planForRoot({ root, rules, entries, nowMs, settings, rulesAll }) {
  const guardMs = (settings.guardMinutes || 5) * 60 * 1000;
  const guardUntil = nowMs - guardMs;
  const prefixes = destPrefixes(rulesAll !== undefined ? rulesAll : rules);
  const mine = rules
    .filter((r) => r.enabled && (!r.rootId || r.rootId === root.id))
    .sort((a, b) => a.priority - b.priority);

  const ops = [];
  const skipped = [];
  const dedupeNeeds = [];
  const counts = { matched: 0, guard: 0, partial: 0, hidden: 0, inDest: 0, noRule: 0, maxOps: 0 };
  const planned = new Set();

  for (const e of entries) {
    if (planned.has(e.rel)) continue;
    const name = e.name || e.rel.split(/[\\/]/).pop();
    if (name.startsWith('.') || /(^|\\)\./.test(e.rel.split(/[\\/]/).slice(0, -1).join('\\'))) {
      counts.hidden++;
      skipped.push({ rel: e.rel, reason: '隐藏文件' });
      continue;
    }
    const ext = fileExt(name);
    if (!ext || PARTIAL_EXTS.includes('.' + ext)) {
      counts.partial++;
      skipped.push({ rel: e.rel, reason: '部分下载/无后缀' });
      continue;
    }
    if (e.mtime > guardUntil) {
      counts.guard++;
      skipped.push({ rel: e.rel, reason: `新文件护栏（<${settings.guardMinutes}min）` });
      continue;
    }
    const relNorm = e.rel.replace(/\//g, '\\');
    const topSeg = relNorm.split('\\')[0];
    if (prefixes.has(topSeg)) {
      counts.inDest++;
      continue; // 目的子树内不统计为 skipped（属正常归档内容）
    }

    let hit = null;
    let matchedAny = false;
    for (const r of mine) {
      const m = matchRule({ rel: e.rel, name, size: e.size, mtime: e.mtime }, r, nowMs);
      if (!m) continue;
      matchedAny = true;
      if (r.action.type === 'dedupe') {
        // dedupe 是集合动作：记录候选但「不消费」该文件——继续让后续
        // move/recycle/rename 规则给它出动作；重复者由 assembleOps 让位
        if (e.size <= (settings.dedupeMaxSizeMB || 512) * 1024 * 1024) {
          dedupeNeeds.push({ rel: e.rel, size: e.size, mtime: e.mtime, ruleId: r.id });
        } else {
          skipped.push({ rel: e.rel, reason: '超过去重大小上限' });
        }
        continue;
      }
      hit = { rule: r, why: m.why };
      break;
    }
    if (!hit) {
      // 只被 dedupe 规则命中（无后续动作规则）也算「有规则」文件
      if (matchedAny) counts.matched++;
      else counts.noRule++;
      continue;
    }
    counts.matched++;
    const r = hit.rule;

    if (ops.length >= (settings.maxOpsPerRun || 500)) {
      counts.maxOps++;
      continue;
    }

    if (r.action.type === 'rename') {
      const dir = relNorm.split('\\').slice(0, -1).join('\\');
      const d = new Date(nowMs);
      const rendered = r.action.pattern
        .replace(/\{name\}/g, () => cleanSeg(name))
        .replace(/\{base\}/g, () => cleanSeg(name.replace(/\.[^.]+$/, '')))
        .replace(/\{ext\}/g, () => cleanSeg((name.match(/\.[^.]+$/) || [''])[0].replace(/^\./, '')))
        .replace(/\{yyyy\}/g, String(d.getFullYear()))
        .replace(/\{mm\}/g, String(d.getMonth() + 1).padStart(2, '0'))
        .replace(/\{dd\}/g, String(d.getDate()).padStart(2, '0'));
      const newName = cleanSeg(rendered);
      if (!newName) {
        skipped.push({ rel: e.rel, reason: 'rename 模板渲染为空' });
        continue;
      }
      ops.push({
        fromRel: relNorm,
        toRel: dir ? `${dir}\\${newName}` : newName,
        ruleId: r.id,
        action: 'rename',
        safe: true,
        why: hit.why,
      });
      planned.add(e.rel);
      continue;
    }

    // move / recycle
    let template = r.action.dest;
    if (r.action.type === 'recycle') template = `${RECYCLE_DIR}`;
    const rd = renderDest(template, root.path, { name, nowMs });
    if (rd.error) {
      skipped.push({ rel: e.rel, reason: rd.error });
      continue;
    }
    if (rd.outside) {
      // 根外目的：目的模板是目录，文件名追加在其后；绝对路径挂 op.toAbs，
      // safe=false（自动模式不执行）
      ops.push({
        fromRel: relNorm,
        toRel: null,
        toAbs: joinPath(rd.destAbs, name),
        ruleId: r.id,
        action: r.action.type,
        safe: false,
        why: hit.why,
      });
      planned.add(e.rel);
      continue;
    }
    // 目的模板渲染出的是目录，最终 toRel = 目录 + 文件名
    // （recycle 的 template 即 RECYCLE_DIR，rd.destRel 已是回收站目录）
    const destRel = `${rd.destRel}\\${name}`;
    ops.push({
      fromRel: relNorm,
      toRel: destRel,
      ruleId: r.id,
      action: r.action.type,
      safe: true,
      why: hit.why,
    });
    planned.add(e.rel);
  }

  return { ops, skipped, dedupeNeeds, counts };
}

/**
 * 去重阶段：fingerprints 由服务层计算 [{ rel, fp }]（fp 相同视为同内容）。
 * 同组内保留 mtime 最新者，其余产出到 回收站/重复文件/ 的 op。
 * ruleDest 为 dedupe 规则的 dest（空 = 回收站根）。
 */
function planDedupe({ fingerprints, ruleId, ruleDest, rootPath, settings }) {
  const groups = new Map();
  for (const f of fingerprints) {
    if (!f || !f.rel || !f.fp) continue;
    if (!groups.has(f.fp)) groups.set(f.fp, []);
    groups.get(f.fp).push(f);
  }
  const ops = [];
  let dupes = 0;
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    members.sort((a, b) => b.mtime - a.mtime);
    for (const dup of members.slice(1)) {
      if (ops.length >= (settings.maxOpsPerRun || 500)) break;
      dupes++;
      const name = dup.rel.split(/[\\/]/).pop();
      const destBase = ruleDest ? `${cleanRelSeg(ruleDest)}\\${DEDUPE_SUBDIR}` : `${RECYCLE_DIR}\\${DEDUPE_SUBDIR}`;
      ops.push({
        fromRel: dup.rel.replace(/\//g, '\\'),
        toRel: `${destBase}\\${cleanSeg(name)}`,
        ruleId,
        action: 'dedupe',
        safe: true,
        why: '同内容重复文件（保留最新）',
      });
    }
  }
  return { ops, dupes };
}

/** 计划去重（同名 dest 冲突在服务层执行时解决，这里只防 from 重复） */
function dedupeOps(ops) {
  const seen = new Set();
  return ops.filter((o) => {
    const k = o.fromRel.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 组装最终计划：去重 op 在前（趁文件还在原位收走重复者），
 * 被 dedupe 判定为重复的文件让位——它的类别 move op 移除（它进 重复文件/
 * 而不是归档目录），保留最新者照常归档。
 * ruleOps: planForRoot 的 ops；dedupe: planDedupe 的返回值。
 */
function assembleOps(ruleOps, dedupe) {
  const dd = dedupe && Array.isArray(dedupe.ops) ? dedupe.ops : [];
  const losers = new Set(dd.map((o) => o.fromRel.toLowerCase()));
  const kept = (ruleOps || []).filter((o) => !losers.has(o.fromRel.toLowerCase()));
  return [...dd, ...kept];
}

// ── 撤销 ───────────────────────────────────────────────────────────────────
/**
 * 生成撤销 op 列表。existence: { 'fromAbs': bool, 'toAbs': bool }（服务层 stat 而来）。
 * 只有 to 仍在、from 已空 才回移；其余如实标记，绝不覆盖既有文件。
 */
function planUndoOps(batchOps, existence) {
  const out = [];
  for (const op of batchOps) {
    if (op.status !== 'done') continue;
    const toKey = (op.toAbs || '').toLowerCase();
    const fromKey = (op.fromAbs || '').toLowerCase();
    if (!toKey || !fromKey) continue;
    if (!existence[toKey]) { out.push({ fromRel: op.toRel, toRel: op.fromRel, state: 'gone', why: '目的文件已不在（可能被再次整理）' }); continue; }
    if (existence[fromKey]) { out.push({ fromRel: op.toRel, toRel: op.fromRel, state: 'blocked', why: '原位置已存在同名文件，拒绝覆盖' }); continue; }
    out.push({ fromRel: op.toRel, toRel: op.fromRel, state: 'ready' });
  }
  return out;
}

// ── 保留清扫 ───────────────────────────────────────────────────────────────
const RETENTION = {
  planTtlMs: 24 * 60 * 60 * 1000,
  planKeep: 10,
  batchKeep: 60,
  resultTtlMs: 30 * 60 * 1000,
  cmdTtlMs: 60 * 60 * 1000,
};

function retentionPlan(keys, nowMs) {
  const del = [];
  const plans = [];
  const batches = [];
  for (const k of keys) {
    const m = k.match(/\d{13}/); // 首个 13 位十进制时间戳（cmd/result/plan/batch 键均内嵌）
    const ts = m ? Number(m[0]) : 0;
    if (k.startsWith('fileflow.result.') && ts && nowMs - ts > RETENTION.resultTtlMs) del.push(k);
    else if (k.startsWith('fileflow.cmd.') && ts && nowMs - ts > RETENTION.cmdTtlMs) del.push(k);
    else if (k.startsWith('fileflow.plan.') && ts) plans.push({ k, ts });
    else if (k.startsWith('fileflow.batch.') && ts) batches.push({ k, ts });
  }
  plans.sort((a, b) => b.ts - a.ts);
  batches.sort((a, b) => b.ts - a.ts);
  for (const p of plans) {
    if (nowMs - p.ts > RETENTION.planTtlMs || plans.indexOf(p) >= RETENTION.planKeep) del.push(p.k);
  }
  for (const b of batches) {
    if (batches.indexOf(b) >= RETENTION.batchKeep) del.push(b.k);
  }
  return del;
}

// ── 概览分类（面板统计用）─────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'installs', label: '安装包', exts: ['exe', 'msi', 'msix', 'apk', 'dmg', 'appx'] },
  { key: 'archives', label: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'bz2', 'iso'] },
  { key: 'docs', label: '文档', exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'epub', 'mobi', 'md', 'txt'] },
  { key: 'images', label: '图片', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp', 'avif'] },
  { key: 'media', label: '媒体', exts: ['mp4', 'mkv', 'mov', 'avi', 'mp3', 'wav', 'flac', 'm4a', 'ts'] },
  { key: 'code', label: '代码', exts: ['js', 'ts', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'json', 'html', 'css', 'sh', 'ps1'] },
];

function categorize(entries) {
  const counts = { other: 0, partial: 0 };
  const bytes = { other: 0 };
  for (const c of CATEGORIES) { counts[c.key] = 0; bytes[c.key] = 0; }
  for (const e of entries) {
    const ext = fileExt(e.name || e.rel);
    const cat = CATEGORIES.find((c) => c.exts.includes(ext));
    if (cat) { counts[cat.key]++; bytes[cat.key] += e.size || 0; }
    else if (!ext || PARTIAL_EXTS.includes('.' + ext)) counts.partial++;
    else { counts.other++; bytes.other += e.size || 0; }
  }
  return { counts, bytes };
}

// ── 预置规则包 ─────────────────────────────────────────────────────────────
const PRESET_PACKS = [
  {
    id: 'downloads',
    name: '下载文件夹起步包',
    desc: '安装包/压缩包/文档/图片/媒体按月归档，重复下载收进回收站，30 天以上旧文件进冷存。',
    rules: [
      { name: '重复下载收走', priority: 10, match: { exts: ['zip', 'rar', '7z', 'exe', 'msi'] }, action: { type: 'dedupe' } },
      { name: '安装包按月归档', priority: 20, match: { exts: ['exe', 'msi', 'msix', 'apk', 'dmg'] }, action: { type: 'move', dest: '安装包\\{yyyy}-{mm}' } },
      { name: '压缩包归档', priority: 30, match: { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'iso'] }, action: { type: 'move', dest: '压缩包' } },
      { name: '文档归档', priority: 40, match: { exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'epub'] }, action: { type: 'move', dest: '文档' } },
      { name: '图片归档', priority: 50, match: { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'] }, action: { type: 'move', dest: '图片' } },
      { name: '媒体归档', priority: 60, match: { exts: ['mp4', 'mkv', 'mov', 'avi', 'mp3', 'wav', 'flac', 'm4a'] }, action: { type: 'move', dest: '媒体' } },
      { name: '旧文件冷存', priority: 900, match: { minAgeDays: 30 }, action: { type: 'move', dest: '冷存\\{yyyy}-{mm}' } },
    ],
  },
];

/** 把预置包展开为该根的完整规则（normalizeRule 补 id/rootId） */
function presetRules(packId, rootId) {
  const pack = PRESET_PACKS.find((p) => p.id === packId);
  if (!pack) return null;
  const out = [];
  for (const r of pack.rules) {
    const n = normalizeRule({ ...r, rootId, enabled: true, stopOnMatch: true });
    if (!n.error) out.push(n);
  }
  return out;
}

module.exports = {
  VERSION,
  RECYCLE_DIR,
  DEDUPE_SUBDIR,
  PARTIAL_EXTS,
  TEMPLATE_VARS,
  RETENTION,
  CATEGORIES,
  PRESET_PACKS,
  normalizeSettings,
  normalizeRoots,
  isValidAbsPath,
  slugId,
  normalizeRule,
  normalizeRules,
  mergeRule,
  validTemplate,
  renderDest,
  cleanRelSeg,
  cleanSeg,
  conflictName,
  destPrefixes,
  matchRule,
  planForRoot,
  planDedupe,
  dedupeOps,
  assembleOps,
  planUndoOps,
  retentionPlan,
  categorize,
  fileExt,
  presetRules,
  joinPath,
  pathBase,
};
