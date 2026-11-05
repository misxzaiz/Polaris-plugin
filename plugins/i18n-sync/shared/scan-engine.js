'use strict';
/**
 * scan-engine.js —— node fs 层：locale 目录扫描 / undo 快照 / 恢复。
 * service 与 MCP bundle 共用；面板不 import（面板无 fs）。
 * core（shared/i18n-core.js）保持零依赖；本文件是唯一的 fs 边界。
 */
const fs = require('fs');
const path = require('path');
const core = require('./i18n-core');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.next', '.nuxt', '.output',
  'target', 'coverage', '.turbo', '.cache', 'Pods', 'Carthage',
]);

/** 有界递归走目录：收集 locale 扩展名文件（含 caps 防呆）。 */
function walkLocaleFiles(rootDir, caps = {}) {
  const maxFiles = caps.maxFiles || core.SCAN_MAX_FILES;
  const maxFileBytes = caps.maxFileBytes || core.SCAN_MAX_FILE_BYTES;
  const maxTotal = caps.maxTotalBytes || core.SCAN_MAX_TOTAL_BYTES;
  const maxDepth = caps.maxDepth || 8;
  const found = [];
  const warnings = [];
  let totalBytes = 0;
  let truncated = false;

  const visit = (dir, depth) => {
    if (truncated || depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
      warnings.push(`目录不可读：${dir}（${e.message}）`);
      return;
    }
    for (const ent of entries) {
      if (truncated) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        visit(full, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (ext !== '.json' && ext !== '.jsonc' && ext !== '.yaml' && ext !== '.yml') continue;
      let st;
      try { st = fs.statSync(full); } catch (_) { continue; }
      if (st.size > maxFileBytes) {
        warnings.push(`跳过超大文件（${st.size} 字节 > ${maxFileBytes}）：${path.relative(rootDir, full)}`);
        continue;
      }
      if (found.length >= maxFiles) { truncated = true; warnings.push(`文件数达上限 ${maxFiles}，扫描截断`); return; }
      if (totalBytes + st.size > maxTotal) { truncated = true; warnings.push(`总字节数达上限 ${maxTotal}，扫描截断`); return; }
      found.push({ absPath: full, relPath: path.relative(rootDir, full), size: st.size });
      totalBytes += st.size;
    }
  };
  visit(rootDir, 0);
  return { found, warnings, truncated };
}

/**
 * 扫描一个 locale 根目录：读+解析+分类+奇偶矩阵。
 * @param {string} rootDir 绝对路径
 * @param {{ baseLocale?: string, yaml?: {load: Function, dump: Function} }} opts
 */
function scanDir(rootDir, opts = {}) {
  const yaml = opts.yaml || null;
  const rootStat = fs.statSync(rootDir); // 不存在时抛错，调用方转业务错误
  if (!rootStat.isDirectory()) throw new Error(`不是目录：${rootDir}`);
  const { found, warnings, truncated } = walkLocaleFiles(rootDir);
  const classify = core.classifyLocalePaths(found.map((f) => f.relPath));

  const parsedFiles = [];
  const parseErrors = [];
  let totalBytes = 0;
  for (const f of classify.files) {
    const meta = found.find((x) => x.relPath === f.relPath);
    const abs = path.join(rootDir, f.relPath);
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch (e) {
      parseErrors.push({ relPath: f.relPath, error: `读取失败：${e.message}` });
      continue;
    }
    totalBytes += meta ? meta.size : Buffer.byteLength(text);
    try {
      const parse = core.parseLocaleText(text, f.ext, { yamlLoad: yaml && yaml.load });
      parsedFiles.push({ relPath: f.relPath, absPath: abs, locale: f.locale, ns: f.ns, ext: f.ext, size: meta ? meta.size : 0, parse });
    } catch (e) {
      parseErrors.push({ relPath: f.relPath, error: e.message });
    }
  }

  const baseLocale = core.inferBaseLocale(classify.locales, opts.baseLocale);
  const { matrix, totals, nsList } = core.buildParityMatrix(parsedFiles, baseLocale);
  totals.parseErrors = parseErrors.length;
  totals.files = parsedFiles.length + parseErrors.length; // 发现的 locale 文件总数（含解析失败）

  // 矩阵内值截断（UI 展示用 300 字符；工作表走 MCP i18n_missing 全量）
  const VCAP = 300;
  for (const ns of Object.keys(matrix)) {
    const entry = matrix[ns];
    if (!entry || entry._error) continue;
    for (const locale of Object.keys(entry)) {
      const c = entry[locale];
      if (!c || c._parseError) continue;
      for (const m of c.missing) {
        if (typeof m.baseValue === 'string' && m.baseValue.length > VCAP) {
          m.baseValue = m.baseValue.slice(0, VCAP - 1) + '…';
          m.truncated = true;
        }
      }
    }
  }

  return {
    root: rootDir,
    layout: classify.layout,
    baseLocale,
    locales: classify.locales,
    nsList,
    files: parsedFiles.map((f) => ({ relPath: f.relPath, locale: f.locale, ns: f.ns, ext: f.ext, size: f.size, keys: Object.keys(core.flattenLocale(f.parse.data).map).length, hasComments: f.parse.hasComments, format: f.parse.format })),
    // 完整解析条目：apply-engine 内部用（含 parse/absPath）；HTTP 面板响应须剔除（见 service）
    entries: parsedFiles,
    matrix,
    totals,
    parseErrors,
    ambiguous: classify.ambiguous,
    warnings,
    truncated,
    scannedAt: new Date().toISOString(),
  };
}

// ────────────────────────── undo 快照 ──────────────────────────

function undoDir(appConfigDir) {
  const d = path.join(appConfigDir || '.', 'i18n-sync-undo');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function safeFileToken(absPath) {
  return absPath.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-160);
}

/**
 * 写前快照：把将改文件的原文本与将写入的新文本都存下来。
 * @returns {{ batchId: string, file: string }} 快照文件路径
 */
function writeSnapshot(appConfigDir, batchId, items) {
  // items: [{absPath, beforeText, afterText}]
  const dir = undoDir(appConfigDir);
  const file = path.join(dir, `${batchId}.json`);
  const payload = {
    batchId,
    at: new Date().toISOString(),
    items: items.map((it) => ({ absPath: it.absPath, token: safeFileToken(it.absPath), beforeText: it.beforeText, afterText: it.afterText })),
  };
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return { batchId, file };
}

/** 恢复：校验当前内容仍等于 afterText（期间没被别人改过）才回写 beforeText。 */
function restoreSnapshot(appConfigDir, batchId) {
  const file = path.join(undoDir(appConfigDir), `${String(batchId).replace(/[^\w.-]/g, '')}.json`);
  if (!fs.existsSync(file)) throw new Error(`快照不存在：${batchId}（可能已被清理）`);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const results = [];
  for (const it of payload.items) {
    let current;
    try { current = fs.readFileSync(it.absPath, 'utf8'); } catch (e) {
      results.push({ file: it.absPath, ok: false, error: `读取失败：${e.message}` });
      continue;
    }
    if (current !== it.afterText) {
      results.push({ file: it.absPath, ok: false, error: '文件在应用后又被修改过，拒绝盲目撤销（请手工比对）' });
      continue;
    }
    fs.writeFileSync(it.absPath, it.beforeText, 'utf8');
    results.push({ file: it.absPath, ok: true });
  }
  return { batchId: payload.batchId, at: payload.at, results };
}

/** 清理旧快照（保留最近 keep 个，按 mtime） */
function pruneSnapshots(appConfigDir, keep = 20) {
  const dir = undoDir(appConfigDir);
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const full = path.join(dir, f);
    return { full, m: fs.statSync(full).mtimeMs };
  }); } catch (_) { return; }
  files.sort((a, b) => b.m - a.m);
  for (const f of files.slice(keep)) {
    try { fs.unlinkSync(f.full); } catch (_) { /* 尽力而为 */ }
  }
}

module.exports = { walkLocaleFiles, scanDir, writeSnapshot, restoreSnapshot, pruneSnapshots, safeFileToken, SKIP_DIRS };
