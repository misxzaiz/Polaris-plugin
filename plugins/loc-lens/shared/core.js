'use strict';
/**
 * core.js —— 行数透视台纯函数层（CJS 同构，零依赖零 IO）
 *
 * service（文件系统扫描）、面板（类型/展示对齐）、单测（离线 fixture）三方共用。
 * 所有函数入参出参均为纯数据；本文件不做任何 fs / http / kv 操作。
 *
 * 统计口径（v1，README 同步明示）：
 *   - 行数 = 物理行：在 Buffer 上数 0x0A，末字节非 \n 则 +1（对 UTF-8/GBK/任意
 *     单字节兼容编码精确，无需解码；\r\n 的 \r 随 \n 一起消掉，不受影响）
 *   - 二进制文件（扩展名黑名单 + 首块空字节嗅探）计入 skippedBinary，不计行
 *   - 忽略目录：node_modules/.git/dist 等构建产物与第三方目录整树跳过
 *   - 聚合：按根目录下第 N 级目录（depth，默认 1）分桶；根下散文件入「(根文件)」
 *   - 语言分布：按扩展名映射到语言族，行数降序
 */

const VERSION = '0.1.0';

/** 整树跳过的目录名（大小写不敏感；与 repo-lens SKIP_DIR_RE 口径对齐并补齐） */
const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'target',
  'vendor', 'coverage', '.next', '.nuxt', '.output', '__pycache__',
  'site-packages', '.venv', 'venv', 'env', '.idea', '.vscode', '.polaris',
  '.workbuddy', '.gradle', 'Pods', 'Carthage', '.terraform', '.cache',
  '.claude', '.agents', '.zcode', '.cursor', '.codex', '.polaris-handoff',
  'temp', 'tmp', 'logs', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  'bower_components', '.pnpm-store', '.turbo', '.svelte-kit', '.angular',
]);

/** 二进制扩展名（这些文件计入 skippedBinary，不读内容） */
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'svgz',
  'zip', 'gz', 'tgz', 'bz2', '7z', 'rar', 'xz', 'zst',
  'exe', 'dll', 'so', 'dylib', 'msi', 'apk', 'aab', 'bin', 'o', 'obj', 'a', 'lib',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'avi', 'mov', 'mkv', 'wav', 'flac', 'ogg', 'webm',
  'db', 'sqlite', 'sqlite3', 'pdb', 'wasm', 'node', 'pyd',
  'jar', 'class', 'pyc', 'rlib', 'deb', 'rpm',
]);

/** 锁文件与产物文件：文本但无统计意义，跳过（计入 skippedOther） */
const SKIP_FILE_NAMES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'cargo.lock', 'go.sum', 'poetry.lock', 'pipfile.lock', 'composer.lock', 'gemfile.lock',
  'bun.lockb', 'deno.lock',
]);
const MINIFIED_RE = /([-.\s]min\.(js|mjs|cjs|css)|\.(bundle|chunk)\.[cm]?js)$/i;

/** 扩展名 → 语言族（展示用） */
const EXT_LANG = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  vue: 'Vue', svelte: 'Svelte',
  py: 'Python', pyi: 'Python',
  rb: 'Ruby', rake: 'Ruby',
  go: 'Go', rs: 'Rust', java: 'Java', cs: 'C#', php: 'PHP',
  swift: 'Swift', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  c: 'C/C++', h: 'C/C++', cpp: 'C/C++', cc: 'C/C++', cxx: 'C/C++',
  hpp: 'C/C++', hh: 'C/C++', ino: 'C/C++',
  sh: 'Shell', bash: 'Shell', ps1: 'Shell', psm1: 'Shell', zsh: 'Shell', bat: 'Shell', cmd: 'Shell',
  lua: 'Lua', dart: 'Dart', r: 'R', jl: 'Julia', ex: 'Elixir', exs: 'Elixir',
  erl: 'Erlang', hs: 'Haskell', ml: 'OCaml', fs: 'F#', fsx: 'F#',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  json: 'JSON', md: 'Markdown', markdown: 'Markdown', txt: 'Text',
  yaml: 'YAML', yml: 'YAML', toml: 'TOML', ini: 'INI', cfg: 'INI',
  xml: 'XML', sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL', proto: 'Protobuf',
  csv: 'CSV', svg: 'SVG', astro: 'Astro', prisma: 'Prisma', sol: 'Solidity',
  zig: 'Zig', nim: 'Nim', v: 'Verilog', pl: 'Perl', pm: 'Perl', tcl: 'Tcl',
};

const ROOT_FILES_BUCKET = '(根文件)';
/** 单文件读入上限（字节）：超限计为 skippedLarge，不数行 */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** 二进制嗅探首块大小 */
const SNIFF_BYTES = 4096;

function extOf(p) {
  const base = String(p || '').split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).pop();
}

function isBinaryExt(p) { return BINARY_EXT.has(extOf(p)); }
function isSkipFileName(p) {
  const b = baseName(p).toLowerCase();
  return SKIP_FILE_NAMES.has(b) || MINIFIED_RE.test(b);
}
function isSkipDirName(name) { return SKIP_DIR_NAMES.has(String(name).toLowerCase()); }

function langOf(p) {
  const ext = extOf(p);
  if (EXT_LANG[ext]) return EXT_LANG[ext];
  return ext ? `.${ext}` : '(无扩展名)';
}

/**
 * 在 Buffer 上数物理行：数 0x0A；末字节非 \n 则 +1。空 Buffer = 0 行。
 * 对 CRLF 精确（\r 属于行内容字节，\n 计数正确）；末尾无换行的最后一行补 1。
 */
function countLines(buf) {
  if (!buf || buf.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0A) n++;
  }
  if (buf[buf.length - 1] !== 0x0A) n++;
  return n;
}

/** 首块空字节嗅探：含 0x00 视为二进制（文本文件几乎不含 NUL） */
function looksBinary(buf) {
  const end = Math.min(buf.length, SNIFF_BYTES);
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** 单文件判定：返回 'count' | 'binary' | 'skipName' | 'large' */
function classifyFile(relPath, size) {
  if (isSkipFileName(relPath)) return 'skipName';
  if (isBinaryExt(relPath)) return 'binary';
  if (Number.isFinite(size) && size > MAX_FILE_BYTES) return 'large';
  return 'count';
}

/**
 * 从 root 提取 relPath 的第 depth 级目录桶名。
 * depth=1：src/a.ts → src；README.md → (根文件)。
 * depth=2：src/x/a.ts → src/x；src/a.ts → src（不足层级归到最深的现有目录）。
 * relPath 必须是 POSIX 风格相对路径。
 */
function bucketOf(relPath, depth) {
  const parts = relPath.split('/');
  const d = Math.max(1, depth | 0);
  if (parts.length === 1) return ROOT_FILES_BUCKET;
  const segs = parts.slice(0, Math.min(d, parts.length - 1));
  return segs.join('/') || ROOT_FILES_BUCKET;
}

function emptyBucket() {
  return { files: 0, lines: 0, nonEmptyLines: 0, bytes: 0 };
}

function newStats() {
  return {
    root: '',
    scannedAt: 0,
    durationMs: 0,
    totals: { files: 0, lines: 0, nonEmptyLines: 0, bytes: 0 },
    modules: {},          // bucket → {files, lines, nonEmptyLines, bytes}
    languages: {},        // lang → {files, lines}
    skippedBinary: 0,     // 二进制文件数
    skippedOther: 0,      // 锁文件/压缩产物文件数
    skippedLarge: 0,      // 超大文件数
    truncated: false,     // 达到扫描上限被截断
    errors: [],           // 不可读文件/目录（cap 20）
  };
}

function addToBucket(stats, bucket, lines, nonEmpty, bytes) {
  if (!stats.modules[bucket]) stats.modules[bucket] = emptyBucket();
  const m = stats.modules[bucket];
  m.files += 1; m.lines += lines; m.nonEmptyLines += nonEmpty; m.bytes += bytes;
  stats.totals.files += 1; stats.totals.lines += lines;
  stats.totals.nonEmptyLines += nonEmpty; stats.totals.bytes += bytes;
}

function addLanguage(stats, lang, lines) {
  if (!stats.languages[lang]) stats.languages[lang] = { files: 0, lines: 0 };
  stats.languages[lang].files += 1;
  stats.languages[lang].lines += lines;
}

/** 记一个已读文件（Buffer 已读出） */
function recordFile(stats, relPath, buf) {
  const lines = countLines(buf);
  let nonEmpty = 0;
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0A) {
      if (i > start) nonEmpty++;
      start = i + 1;
    }
  }
  addToBucket(stats, bucketOf(relPath, 1), lines, nonEmpty, buf.length);
  addLanguage(stats, langOf(relPath), lines);
}

/** 把一次扫描结果合并进累计 stats（增量更新用；srcRoot 为该批文件的根） */
function mergeFileBatch(stats, srcRoot, batch) {
  // batch: [{ relPath, buf }]
  for (const item of batch) {
    const rel = relFromRoot(srcRoot, item.absPath || item.relPath, item.relPath != null);
    recordFile(stats, rel, item.buf);
  }
}

/** absPath 相对 root 的 POSIX 路径（file 已知相对时直接用） */
function relFromRoot(root, absPath, isRel) {
  if (isRel) return String(absPath).split('\\').join('/');
  const rp = path.relativeCompat(root, absPath);
  return rp.split('\\').join('/');
}

// 极简 path.relative（避免本文件依赖 node:path，保持可在任意 JS 环境复用）
const path = {
  relativeCompat(from, to) {
    const norm = (p) => String(p).split(/[\\/]+/).filter(Boolean);
    const a = norm(from), b = norm(to);
    let i = 0;
    while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
    return b.slice(i).join('/');
  },
};

/** modules → 展示数组（行数降序） */
function moduleRows(stats) {
  return Object.entries(stats.modules || {})
    .map(([name, m]) => ({ name, ...m }))
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}

/** languages → 展示数组（行数降序，cap 12） */
function languageRows(stats, cap) {
  const n = cap == null ? 12 : cap;
  return Object.entries(stats.languages || {})
    .map(([name, m]) => ({ name, files: m.files, lines: m.lines }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, n);
}

/** 数值格式化：1234 → 1.2k；1234567 → 1.2M */
function fmtCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(v);
}

module.exports = {
  VERSION, SKIP_DIR_NAMES, BINARY_EXT, SKIP_FILE_NAMES, MINIFIED_RE, EXT_LANG,
  ROOT_FILES_BUCKET, MAX_FILE_BYTES,
  extOf, baseName, isBinaryExt, isSkipFileName, isSkipDirName, langOf,
  countLines, looksBinary, classifyFile, bucketOf,
  newStats, recordFile, mergeFileBatch, addToBucket, addLanguage,
  moduleRows, languageRows, fmtCount,
};
