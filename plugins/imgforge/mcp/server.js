#!/usr/bin/env node
'use strict';
/**
 * imgforge MCP Server —— 图片工坊（本地批量图片变换引擎）的 AI 工具层
 *
 * 把 AI 的「处理图片」意图变成真实落盘文件：路径/目录进 → sharp 引擎处理 →
 * 输出自动命名落盘（永不覆盖）→ 返回路径与节省统计。与面板服务共用同一引擎
 * （service/engine.js），口径不漂移。
 *
 * 工具一览（4 个）：
 *   imgforge_scan    扫描目录：图片清单概览（数量/格式分布/总大小/GPS 计数/Top 大文件）
 *   imgforge_info    单图元信息（格式/尺寸/大小/GPS/相机/拍摄时间）
 *   imgforge_process 批量变换：转格式/压缩/缩放/剥 EXIF/目标体积，输出永不覆盖
 *   imgforge_jobs    最近任务历史（与面板共用同一份 cap.kv 台账）
 *
 * 安全底线：输入永不修改/删除；输出永不覆盖（自动 -2/-3）；零外网请求；
 * EXIF 默认剥离（keepMetadata=true 才保留）；MCP 单批默认 50 张（硬顶 200）。
 * 历史登记经 cap.kv（降级容忍，核心操作不依赖桥）。
 *
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/core.js');
const engine = require('../service/engine.js');
const { createKvClient } = require('../service/kvclient.js');

const SERVER_NAME = 'imgforge';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const MCP_DEFAULT_BATCH = 50;
const MCP_MAX_BATCH = 200;
const MAX_INPUT_BYTES = 1024 * 1024 * 1024; // 引擎硬顶
const RESULT_LINES_CAP = 40;

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const APP_CONFIG_DIR = process.argv[2] || '';
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const KEY_HISTORY = 'imgforge.history.';
const KEY_SETTINGS = 'imgforge.settings';

// ── 输入读取与输出落盘 ──────────────────────────────────────────────────────

function assertAbsolutePath(p, label) {
  return core.guardAbsolute(p, label || '图片');
}

/** 收集输入：paths 数组优先，其次目录扫描；魔数预筛（假扩展名不算图片）；返回 { items, skipped } */
function collectInputs(args, maxBatch) {
  const paths = Array.isArray(args.paths) ? args.paths : [];
  if (paths.length) {
    const items = [];
    const skipped = [];
    for (const p of paths.slice(0, maxBatch)) {
      try {
        const abs = assertAbsolutePath(p);
        const st = fs.statSync(abs);
        if (!st.isFile()) throw new Error('不是文件');
        const ext = path.extname(abs).toLowerCase();
        if (core.SUPPORTED_SCAN_EXTS.indexOf(ext) < 0) throw new Error('不支持的扩展名 ' + ext);
        if (st.size > 0) {
          const fd = fs.openSync(abs, 'r');
          try {
            const head = Buffer.alloc(Math.min(st.size, 4096));
            const got = fs.readSync(fd, head, 0, head.length, 0);
            if (!core.imageKind(got === head.length ? head : head.subarray(0, got))) {
              throw new Error('扩展名是图片但内容不是（魔数不匹配）');
            }
          } finally {
            fs.closeSync(fd);
          }
        }
        items.push({ path: abs, name: path.basename(abs), ext, size: st.size });
      } catch (e) {
        skipped.push(String(p) + '（' + String((e && e.message) || e) + '）');
      }
    }
    if (!items.length) throw new Error('全部输入路径无效，第一条原因：' + (skipped[0] || '未知'));
    return { items, skipped };
  }
  if (args.dir) {
    const dir = assertAbsolutePath(args.dir, '目录');
    let st;
    try { st = fs.statSync(dir); } catch (_) { throw new Error('目录不存在：' + dir); }
    if (!st.isDirectory()) throw new Error('不是目录：' + dir);
    const { files, skippedNonImage } = engine.listImageFiles(dir, { recursive: !!args.recursive, maxScan: maxBatch });
    if (!files.length) {
      throw new Error('目录里没有找到可处理的图片（支持 ' + core.SUPPORTED_SCAN_EXTS.join(' ') + '）' + (args.recursive ? '' : '；如需包含子目录请加 recursive=true'));
    }
    return { items: files, skipped: skippedNonImage };
  }
  throw new Error('缺少输入：请提供 dir（目录）或 paths（文件绝对路径数组）');
}

/** MCP 输出目录优先级：参数 outputDir > 面板设置 outDir > 输入目录/imgforge-out（自动创建）> 桌面 > home */
async function resolveOutDir(explicit, inputDir) {
  const candidates = [];
  const creatable = new Set();
  if (explicit) candidates.push(assertAbsolutePath(explicit, '输出目录'));
  try {
    const settings = core.normalizeSettings(await kv.kvGet(KEY_SETTINGS));
    if (settings.outDir) candidates.push(settings.outDir);
  } catch (_) { /* 降级：跳过设置候选 */ }
  if (inputDir) {
    const derived = path.join(inputDir, 'imgforge-out');
    candidates.push(derived);
    creatable.add(derived); // 派生目录允许自动创建（其余候选必须已存在）
  }
  const home = os.homedir();
  candidates.push(path.join(home, 'Desktop'), path.join(home, 'OneDrive', 'Desktop'), home);
  for (const c of candidates) {
    try {
      if (creatable.has(c)) {
        fs.mkdirSync(c, { recursive: true });
        return c;
      }
      if (c && path.isAbsolute(c) && fs.statSync(c).isDirectory()) return c;
    } catch (_) { /* 下一个候选 */ }
  }
  throw new Error('找不到可用的输出目录：请用 outputDir 参数指定一个已存在的目录');
}

function writeOutput(outDir, stem, ext, bytes) {
  const exists = (p) => { try { fs.statSync(p); return true; } catch (_) { return false; } };
  const target = core.pickOutputName(outDir, core.sanitizeStem(stem), ext, exists);
  fs.writeFileSync(target, bytes);
  return { name: path.basename(target), path: target, size: bytes.length };
}

async function registerHistory(record) {
  try {
    await kv.kvSet(KEY_HISTORY + record.id, record);
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith(KEY_HISTORY)).sort();
    let cap = 100;
    try { cap = core.normalizeSettings(await kv.kvGet(KEY_SETTINGS)).historyCap; } catch (_) { /* 默认 100 */ }
    const over = keys.length - cap;
    for (let i = 0; i < over; i++) await kv.kvDel(keys[i]).catch(() => { });
  } catch (e) {
    log('warn', '历史登记失败（不影响输出）: ' + e.message);
  }
}

// ── 工具定义（description 写「适用句式」，AI 靠它匹配意图）──────────────────

const TOOLS = [
  {
    name: 'imgforge_scan',
    description: '扫描一个目录里的图片并给概览：张数、总大小、格式分布、含 GPS 定位的张数、最大的 8 张。适用：「看看这个文件夹里有多少图片/多大」「有没有带位置信息的照片」「这个目录的图片是什么格式」。只读，不产生文件。',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '目录绝对路径（如 C:\\Users\\me\\Pictures）' },
        recursive: { type: 'boolean', description: '是否包含子目录（默认 false）' },
      },
      required: ['dir'],
    },
    async run(args) {
      const dir = assertAbsolutePath(args.dir, '目录');
      let st;
      try { st = fs.statSync(dir); } catch (_) { throw new Error('目录不存在：' + dir); }
      if (!st.isDirectory()) throw new Error('不是目录：' + dir);
      const r = await engine.scanDir(dir, { recursive: !!args.recursive, maxScan: 2000, probeLimit: 500 });
      const s = r.summary;
      const fmtLine = Object.entries(s.byFormat).map(([k, n]) => k + '×' + n).join('，') || '无';
      const top = r.files.slice().sort((a, b) => b.size - a.size).slice(0, 8)
        .map((f) => `  ${f.name} — ${core.formatBytes(f.size)}${f.width ? `（${f.width}×${f.height}）` : ''}${f.hasGps === true ? ' [含GPS]' : ''}`);
      return [
        `目录：${r.dir}${args.recursive ? '（含子目录）' : ''}`,
        `图片：${s.count} 张，共 ${core.formatBytes(s.totalSize)}${r.truncated ? `（扫描到 2000 张截断）` : ''}`,
        `格式分布：${fmtLine}`,
        `GPS 定位：${s.gpsCount} 张含 GPS${s.gpsUnknown ? `，${s.gpsUnknown} 张无法判定` : ''}（其余无）`,
        top.length ? '最大的文件：\n' + top.join('\n') : '',
      ].filter(Boolean).join('\n');
    },
  },
  {
    name: 'imgforge_info',
    description: '查看单张图片的元信息：格式、像素尺寸、文件大小、是否含 GPS 定位、相机品牌型号、拍摄时间。适用:「这张图多大/什么格式」「这张照片有没有位置隐私」「这张图是什么相机拍的」。只读，不产生文件。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '图片文件绝对路径' } },
      required: ['path'],
    },
    async run(args) {
      const abs = assertAbsolutePath(args.path);
      let st;
      try { st = fs.statSync(abs); } catch (_) { throw new Error('文件不存在：' + abs); }
      if (!st.isFile()) throw new Error('不是文件（可能是目录）：' + abs);
      const p = await engine.probeImage({ path: abs, name: path.basename(abs), ext: path.extname(abs).toLowerCase(), size: st.size });
      const ex = p.exif || {};
      const lines = [
        `文件：${p.name}`,
        `格式：${p.format || '未知'}；尺寸：${p.width ? p.width + '×' + p.height : '未知'}；大小：${core.formatBytes(p.size)}`,
        `GPS 定位：${p.hasGps === true ? '有（外发前建议剥离）' : p.hasGps === false ? '无' : '未知（容器不携带可解析的 EXIF）'}`,
      ];
      if (ex.make || ex.model) lines.push(`设备：${[ex.make, ex.model].filter(Boolean).join(' ')}`);
      if (ex.dateTime) lines.push(`拍摄时间：${ex.dateTime}`);
      if (ex.software) lines.push(`软件：${ex.software}`);
      if (p.error) lines.push(`注意：${p.error}`);
      return lines.join('\n');
    },
  },
  {
    name: 'imgforge_process',
    description: '批量处理图片并落盘（输出永不覆盖，输入绝不修改）：转格式（webp/jpeg/png/avif/tiff）、按质量压缩、限制最大宽/高、剥离 EXIF/GPS 隐私（默认剥离）、压到目标体积（如 200KB）。适用：「把这个文件夹的 PNG 全部转成 WebP」「这批截图压到 200KB 以内」「这些照片外发前抹掉位置信息」「把图片最长边限制到 1920」。输出默认到 <输入目录>/imgforge-out/。',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '目录绝对路径（处理其中全部图片）' },
        paths: { type: 'array', items: { type: 'string' }, description: '或：图片文件绝对路径数组（最多 200 张）' },
        recursive: { type: 'boolean', description: 'dir 模式下是否包含子目录（默认 false）' },
        format: { type: 'string', enum: ['keep', 'webp', 'jpeg', 'png', 'avif', 'tiff'], description: '输出格式；keep=保持原格式（默认 keep）' },
        quality: { type: 'number', description: '质量 1-100（默认按格式：webp/jpeg 82、avif 50、png 82）' },
        maxWidth: { type: 'number', description: '最大宽度像素（等比缩小，不放大）' },
        maxHeight: { type: 'number', description: '最大高度像素（等比缩小，不放大）' },
        targetKB: { type: 'number', description: '目标体积 KB：自动二分质量逼近（如 200）；达不到时自动降尺寸并如实说明' },
        keepMetadata: { type: 'boolean', description: 'true=保留 EXIF（含 GPS）；默认 false 一律剥离' },
        maxFiles: { type: 'number', description: '本次最多处理张数（默认 50，上限 200）；目录图片更多时请分批' },
        outputDir: { type: 'string', description: '可选：输出目录（默认 <输入目录>/imgforge-out/）' },
      },
    },
    async run(args) {
      const pipeline = core.normalizePipeline({
        format: args.format,
        quality: args.quality,
        maxWidth: args.maxWidth,
        maxHeight: args.maxHeight,
        targetKB: args.targetKB,
        stripMetadata: args.keepMetadata !== true,
      });
      const maxFiles = Math.min(Math.max(1, Math.round(Number(args.maxFiles) || MCP_DEFAULT_BATCH)), MCP_MAX_BATCH);
      const { items, skipped } = collectInputs(args, maxFiles);
      if (items.length > maxFiles) items.length = maxFiles;
      const outDir = await resolveOutDir(args.outputDir, args.dir || path.dirname(items[0].path));
      const started = Date.now();
      const { results, summary } = await engine.runPipeline(items, pipeline, {
        outDir,
        concurrency: 3,
        maxFileMB: 100,
      });
      const ms = Date.now() - started;
      await registerHistory({
        id: started.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        at: new Date().toISOString(),
        source: 'mcp',
        pipeline: core.pipelineLabel(pipeline),
        total: summary.total,
        ok: summary.ok,
        fail: summary.fail,
        inBytes: summary.inBytes,
        outBytes: summary.outBytes,
        savedBytes: summary.savedBytes,
        outDir,
        ms,
        results: results.slice(0, 50),
        okState: true,
      });
      const head = [
        `处理完成：${summary.ok}/${summary.total} 张成功${summary.fail ? `，${summary.fail} 张失败` : ''}`,
        skipped.length ? `跳过 ${skipped.length} 张（非图片/无效）：${skipped.slice(0, 5).join('；')}${skipped.length > 5 ? ' 等' : ''}` : '',
        `体积：${core.formatBytes(summary.inBytes)} → ${core.formatBytes(summary.outBytes)}（${summary.savedBytes >= 0 ? '节省 ' + core.formatBytes(summary.savedBytes) : '增大 ' + core.formatBytes(-summary.savedBytes)}，${summary.inBytes ? Math.round(summary.savedBytes / summary.inBytes * 100) : 0}%）`,
        `输出目录：${outDir}`,
        `管道：${core.pipelineLabel(pipeline)}`,
        `耗时：${(ms / 1000).toFixed(1)}s`,
      ].filter(Boolean).join('\n');
      const lines = results.slice(0, RESULT_LINES_CAP).map((r) => r.ok
        ? `  ✓ ${r.name} → ${r.outName}（${core.formatBytes(r.inSize)} → ${core.formatBytes(r.outSize)}${r.scaled ? '，缩至' + Math.round(r.scaled * 100) + '%' : ''}）`
        : `  ✗ ${r.name}：${r.error}`);
      const tail = results.length > RESULT_LINES_CAP ? `\n（其余 ${results.length - RESULT_LINES_CAP} 张结果从略，全部文件已落盘）` : '';
      const failed = results.filter((r) => !r.ok);
      const failNote = failed.length ? '\n失败原因与建议：' + failed.slice(0, 3).map((r) => r.name + '：' + r.error).join('；') : '';
      return head + '\n' + lines.join('\n') + tail + failNote;
    },
  },
  {
    name: 'imgforge_jobs',
    description: '查看图片工坊最近的任务历史（与面板共用）：每次处理的管道、张数、体积变化、输出目录。适用:「刚才处理了多少张/省了多少」「上次图片处理的结果在哪」。只读。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数（默认 10，上限 50）' },
      },
    },
    async run(args) {
      const limit = Math.min(Math.max(1, Math.round(Number(args.limit) || 10)), 50);
      let keys = [];
      try {
        keys = (await kv.kvKeys()).filter((k) => k.startsWith(KEY_HISTORY)).sort().reverse();
      } catch (e) {
        return '历史不可用（宿主桥离线）：' + String((e && e.message) || e);
      }
      if (!keys.length) return '暂无任务历史（面板或 AI 处理过图片后会出现在这里）。';
      const out = [];
      for (const k of keys.slice(0, limit)) {
        try {
          const v = await kv.kvGet(k);
          if (v && typeof v === 'object') {
            out.push(`  ${String(v.at || '').replace('T', ' ').slice(0, 16)} [${v.source}] ${v.pipeline}：${v.ok}/${v.total} 成功，${core.formatBytes(v.inBytes || 0)} → ${core.formatBytes(v.outBytes || 0)}（省 ${core.formatBytes(Math.max(0, v.savedBytes || 0))}），输出 ${v.outDir || '?'}${v.okState === false ? '，失败：' + String(v.error || '') : ''}`);
          }
        } catch (_) { /* 单条读取失败跳过 */ }
      }
      return `最近 ${out.length} 条任务（新→旧）：\n` + out.join('\n');
    },
  },
];

// ── stdio JSON-RPC（协议数据只走 stdout，日志全走 stderr）──────────────────

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    handleMessage(line).catch((e) => log('error', 'handleMessage: ' + (e && e.stack || e)));
  }
});
process.stdin.on('end', () => process.exit(0));

function writeMsg(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg || {};
  try {
    if (method === 'initialize') {
      writeMsg({
        id, result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
    } else if (method === 'notifications/initialized') {
      // 无响应
    } else if (method === 'tools/list') {
      writeMsg({
        id, result: {
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        },
      });
    } else if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === (params && params.name));
      if (!tool) {
        writeMsg({ id, result: { content: [{ type: 'text', text: '未知工具：' + (params && params.name) }], isError: true } });
        return;
      }
      try {
        const text = await tool.run((params && params.arguments) || {});
        writeMsg({ id, result: { content: [{ type: 'text', text: String(text) }], isError: false } });
      } catch (e) {
        // 业务失败走 isError（AI 能读并自纠），不抛进程异常
        writeMsg({ id, result: { content: [{ type: 'text', text: '失败：' + String((e && e.message) || e) }], isError: true } });
        log('warn', `tools/call ${params && params.name} 业务失败: ${e && e.message}`);
      }
    } else if (method !== undefined && id !== undefined) {
      writeMsg({ id, error: { code: -32601, message: 'method not found: ' + method } });
    }
  } catch (e) {
    if (id !== undefined) writeMsg({ id, error: { code: -32603, message: String((e && e.message) || e) } });
    log('error', 'handler error: ' + (e && e.stack || e));
  }
}

log('info', `imgforge MCP server v${SERVER_VERSION} ready (${APP_CONFIG_DIR || 'no-config-dir'})`);
