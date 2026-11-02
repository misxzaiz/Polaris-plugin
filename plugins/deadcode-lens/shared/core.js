'use strict';
/**
 * core.js —— 死代码透视台纯函数引擎（CJS 同构；fs 仅经注入的 vfs 访问）
 *
 * 被 service/main.js(require)、mcp/server.js(require)、test/(node --test) 与
 * 离线自检共用，保证「解析/解析顺序/发现口径」全端一致。
 *
 * 数据流：
 *   walk（vfs.listFiles）→ parseModule（es-module-lexer + require/glob 正则补扫）
 *   → resolveSpecifier（相对/别名/裸名/内建/资产）→ edges/externalRefs
 *   → guessEntries（入口启发）→ BFS 可达性 → 四类发现：
 *      死文件（no-importer / only-dead-importers）
 *      未使用导出（消费链沿 re-export 回溯；namespace/动态导入保守全标记）
 *      未使用依赖（import 零引用 + 配置/脚本零信号；@types 联动）
 *      悬空导入（解析失败 = 真 bug）+ 循环依赖（Tarjan SCC，静态边）
 *
 * 保守性原则（宁漏报不误报——发现会驱动 AI 删代码，误报代价高）：
 *   - namespace 导入 / 动态 import / import.meta.glob 命中 → 目标文件全部导出视为已用
 *   - side-effect 导入 / require() → 文件视为已用，但不消费导出
 *   - `export *` 歧义（同一名多处可解析）→ 全部候选记为已消费
 *   - 测试文件是入口（knip 同款默认）；测试引用计为使用
 *   - 自文件内他处引用的未消费导出 → 建议「去 export 关键字」而非「删除」
 *   - 死文件自身的未使用导出不再重复报告（文件级发现已覆盖）
 */

const VERSION = '0.1.0';

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 不进入扫描的目录名（依赖目录/构建产物/VCS） */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'target', 'dist', 'build', 'out', '.next', '.nuxt',
  '.output', 'coverage', '.turbo', '.cache', '.parcel-cache', '__pycache__', '.venv', 'venv',
  '.pnpm-store', '.idea', 'tmp', '.tmp',
]);

/** 不进入扫描的文件名（锁文件/构建信息，避免超大 json 拖垮） */
const SKIP_FILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'tsconfig.tsbuildinfo']);

const SRC_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const JSON_EXT = '.json';

/** 资产类扩展：可被导入、标记文件已用，但无导出概念 */
const ASSET_EXTS = new Set([
  '.css', '.scss', '.sass', '.less', '.styl', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.wav', '.glb',
  '.gltf', '.wasm', '.txt', '.md', '.html', '.yml', '.yaml', '.toml', '.csv', '.graphql', '.gql',
]);

/** 相对/别名解析时尝试的扩展（.js → .ts 的 TS 风格映射含在内） */
const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];

/** 上限（超出截断并在 warnings 明示，不静默） */
const CAPS = {
  FILES: 8000,
  FILE_BYTES: 2 * 1024 * 1024,
  WALK_DEPTH: 12,
  ORPHANS: 400,
  EXPORTS: 800,
  DEPS: 200,
  UNRESOLVED: 400,
  CYCLES: 60,
  CYCLE_FILES: 12,
  IMPORTERS_EVIDENCE: 8,
  WARNINGS: 60,
  SCAN_MS: 10 * 60_000,
};

/** 已知内建模块（node: 显式前缀单独处理；这里兜裸内建名） */
const BUILTIN_MODS = new Set([
  'fs', 'path', 'os', 'url', 'util', 'crypto', 'http', 'https', 'net', 'tls', 'dns', 'zlib',
  'stream', 'readline', 'events', 'assert', 'buffer', 'child_process', 'cluster', 'querystring',
  'string_decoder', 'timers', 'tty', 'v8', 'vm', 'worker_threads', 'async_hooks', 'perf_hooks',
  'process', 'punycode', 'sys', 'constants', 'module', 'inspector', 'trace_events', 'http2',
  'diagnostics_channel', 'sqlite',
]);

const CONFIG_FILE_RE = /(^|\/)([^/]+\.)?config\.(js|ts|mjs|cjs|mts|cts)$/;

/** 常见工具链依赖（几乎从不被 import；经 CLI/CI/hook/配置生效）——报告里单独标注 */
const TOOLING_DEPS = new Set([
  'typescript', 'eslint', 'prettier', 'vitest', 'jest', 'mocha', 'playwright', '@playwright/test',
  'husky', 'lint-staged', 'esbuild', 'vite', 'rollup', 'webpack', 'knip', 'tsx', 'ts-node',
  'nodemon', 'jsdom', 'happy-dom', 'globals', '@eslint/js', 'typescript-eslint', 'npm-run-all',
  'cross-env', 'dotenv-cli', 'concurrently', 'rimraf', 'shx', 'serve', 'http-server',
]);

// ── 小工具 ──────────────────────────────────────────────────────────────────

/** 统一为 POSIX 相对路径（win32 反斜杠折叠） */
function toPosix(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function extOf(rel) {
  const i = rel.lastIndexOf('.');
  const slash = rel.lastIndexOf('/');
  return i > slash ? rel.slice(i).toLowerCase() : '';
}

function dirnamePosix(rel) {
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(0, i) : '';
}

function joinPosix(a, b) {
  if (!a) return toPosix(b);
  if (a.endsWith('/')) return toPosix(a + b);
  return toPosix(a + '/' + b);
}

/** 规范化 a/b/../c（不查盘） */
function normalizeRel(p) {
  const parts = [];
  for (const seg of toPosix(p).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join('/');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pushWarn(list, msg) {
  if (list.length < CAPS.WARNINGS) list.push(msg);
  else if (list.length === CAPS.WARNINGS) list.push(`（警告达 ${CAPS.WARNINGS} 条上限，后续省略）`);
}

// ── 虚拟文件系统（测试/服务共用口径） ────────────────────────────────────────

/** @param {Map<string,string>} filesMap relPath(POSIX) → content */
function makeVfs(filesMap) {
  const dirs = new Set();
  for (const rel of filesMap.keys()) {
    let d = dirnamePosix(rel);
    while (d) { dirs.add(d); d = dirnamePosix(d); }
  }
  return {
    files: filesMap,
    dirs,
    exists(rel) { return filesMap.has(toPosix(rel)) || dirs.has(toPosix(rel)); },
    /** 未走查文件（资产等）存在性；虚拟 vfs 只有 map */
    statAny(rel) { return filesMap.has(toPosix(rel)); },
    readText(rel) {
      const v = filesMap.get(toPosix(rel));
      if (v === undefined) throw new Error(`vfs: 缺文件 ${rel}`);
      return v;
    },
    list() { return [...filesMap.keys()]; },
  };
}

/** 真实 fs → vfs（service 用；跳过 SKIP_DIRS/点目录，深度/数量/单文件大小设上限） */
function makeFsVfs(rootDir, { onWarn } = {}) {
  const fs = require('fs');
  const path = require('path');
  const rootAbs = String(rootDir || '');
  const files = new Map();
  const warnings = [];
  let truncated = false;

  const stack = [{ rel: '', depth: 0 }];
  while (stack.length) {
    const { rel, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(rel ? path.join(rootAbs, rel) : rootAbs, { withFileTypes: true });
    } catch (e) {
      pushWarn(warnings, `目录不可读 ${rel || '.'}: ${e.message}`);
      continue;
    }
    for (const ent of entries) {
      const name = ent.name;
      const childRel = rel ? `${rel}/${name}` : name;
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
        if (depth + 1 > CAPS.WALK_DEPTH) { truncated = true; continue; }
        stack.push({ rel: childRel, depth: depth + 1 });
        continue;
      }
      if (!ent.isFile()) continue;
      if (SKIP_FILES.has(name)) continue;
      const ext = extOf(name);
      if (!SRC_EXTS.has(ext) && ext !== JSON_EXT) continue;
      if (files.size >= CAPS.FILES) { truncated = true; break; }
      let size = 0;
      try { size = fs.statSync(path.join(rootAbs, childRel)).size; } catch (_) { continue; }
      if (size > CAPS.FILE_BYTES) { pushWarn(warnings, `超大文件跳过 ${childRel}（${size}B > ${CAPS.FILE_BYTES}B 上限）`); continue; }
      try {
        files.set(toPosix(childRel), fs.readFileSync(path.join(rootAbs, childRel), 'utf8'));
      } catch (e) {
        pushWarn(warnings, `文件不可读 ${childRel}: ${e.message}`);
      }
    }
  }
  if (truncated) pushWarn(warnings, `文件数达到上限 ${CAPS.FILES}，扫描不完整（结果偏保守：倾向漏报）`);
  if (onWarn) for (const w of warnings) onWarn(w);

  // 向上查找 tsconfig/jsconfig 与 package.json（扫描根常是 src 子目录，配置在仓库根）
  const rootResolved = path.resolve(rootAbs);
  let tsconfigExternal = null;
  let pkgAbove = null;
  let dir = rootResolved;
  for (let up = 0; up < 4; up++) {
    dir = path.dirname(dir);
    if (dir === path.dirname(dir)) break; // 到盘根
    if (!tsconfigExternal) {
      for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const p = path.join(dir, name);
        try {
          if (fs.statSync(p).isFile()) { tsconfigExternal = { text: fs.readFileSync(p, 'utf8'), dirAbs: dir, rootAbs: rootResolved }; break; }
        } catch (_) { /* 继续 */ }
      }
    }
    if (!pkgAbove) {
      const p = path.join(dir, 'package.json');
      try {
        if (fs.statSync(p).isFile()) {
          pkgAbove = { text: fs.readFileSync(p, 'utf8'), dirAbs: dir, rootAbs: rootResolved, configTexts: [] };
          // 父目录层的工具链配置（eslint/vite/tailwind/CI 等）——依赖信号扫描要用
          const CONFIG_NAMES = [
            'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
            '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
            'commitlint.config.js', 'commitlint.config.mjs', 'commitlint.config.cjs',
            'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'postcss.config.cjs',
            'vite.config.ts', 'vite.config.js', 'vitest.config.ts', 'vitest.config.js',
            '.prettierrc', '.prettierrc.js', '.prettierrc.json', 'knip.json', 'knip.ts',
          ];
          for (const cn of CONFIG_NAMES) {
            try {
              const cp = path.join(dir, cn);
              if (fs.statSync(cp).isFile()) pkgAbove.configTexts.push(fs.readFileSync(cp, 'utf8'));
            } catch (_) { /* 继续 */ }
          }
          try {
            const wfDir = path.join(dir, '.github', 'workflows');
            if (fs.statSync(wfDir).isDirectory()) {
              for (const wf of fs.readdirSync(wfDir)) {
                if (wf.endsWith('.yml') || wf.endsWith('.yaml')) {
                  try { pkgAbove.configTexts.push(fs.readFileSync(path.join(wfDir, wf), 'utf8')); } catch (_) { /* 继续 */ }
                }
              }
            }
          } catch (_) { /* 继续 */ }
        }
      } catch (_) { /* 继续 */ }
    }
    if (tsconfigExternal && pkgAbove) break;
  }

  const vfs = makeVfs(files);
  if (tsconfigExternal) vfs.tsconfigExternal = tsconfigExternal;
  if (pkgAbove) vfs.pkgAbove = pkgAbove;
  // 资产存在性走查盘（makeVfs 默认只认 map；真实扫描要能发现「导入的图片/样式不存在」）
  vfs.statAny = (rel) => {
    try { return fs.statSync(path.join(rootAbs, toPosix(rel))).isFile(); } catch (_) { return false; }
  };
  return { vfs, warnings };
}

// ── import 子句解析 ─────────────────────────────────────────────────────────

/**
 * 从 import 语句切片解析子句形态。
 * stmt 是 lexer 给出的完整语句（importStart..importEnd），如：
 *   `import {a as A, b} from "./x"` / `import type {T} from "./t"` /
 *   `import * as NS from "./ns"` / `import "./side"` / `import D, {c} from "./m"`
 */
function parseImportClause(stmt) {
  let s = stmt.trim().replace(/^import\b/, '').trim();
  s = s.replace(/^type\s+/, ''); // import type X / import type {T}
  const out = { names: [], namespace: false, side: false, def: null };
  if (/^['"]/.test(s)) { out.side = true; return out; } // import 'x'
  const ns = s.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (ns) { out.namespace = true; return out; }
  const named = s.match(/^\{([\s\S]*)\}\s*(?:from\b|$)/);
  if (named) { out.names = splitNamedList(named[1]); return out; }
  // default（可带 named）
  const dm = s.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*\{([\s\S]*)\})?\s*(?:from\b|$)/);
  if (dm) {
    out.def = dm[1];
    if (dm[2] != null) out.names = splitNamedList(dm[2]);
  } else {
    out.side = true; // 兜底：解析不了当 side-effect（保守）
  }
  return out;
}

function splitNamedList(inner) {
  const names = [];
  for (const pieceRaw of inner.split(',')) {
    const piece = pieceRaw.trim();
    if (!piece) continue;
    const m = piece.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    // imported = 源导出名（消费链解析用）；local = 本地绑定名
    if (m) names.push({ imported: m[1], local: m[2] || m[1] });
  }
  return names;
}

// ── 模块解析（自研状态机扫描器） ────────────────────────────────────────────
/**
 * 为什么不用 es-module-lexer：它按 ECMAScript 词法解析，遇到 JSX（裸 .tsx 的主体
 * 语法）即抛 Parse error——React 仓恰是本插件的主场景。Vite 能用是因为先经
 * esbuild 转译。故自研扫描器：只关心 import/export/require/import.meta.glob
 * 语句骨架，用四态状态机（code / 行注释 / 块注释 / 字符串+模板）跳过一切非语句
 * 内容；正则字面量用「前一有效符」启发式判定并在换行未闭合时自愈（当除法）。
 * 语义保守：解析不了的子句当 side-effect（文件用、不消费导出）。
 */

const REGEX_PREV_OK = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>', 'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await', 'throw']);

/** 读取 [start,end) 区间内第 idx 个非空白字符之前的状态辅助（正则判定用） */

/**
 * 扫描模块源码，产出与解析口径一致的 imports/exports/globs。
 * 单遍 + 模式栈；不构造 AST，语句骨架识别为准。
 */
function scanModule(source) {
  const res = { imports: [], exports: [], globs: [], ok: true, error: '' };
  const n = source.length;
  let i = 0;
  let prevSig = '';                 // 前一有效 token（字符或标识符），供正则/除法判定

  const isIdStart = (c) => /[A-Za-z_$]/.test(c);
  const isIdChar = (c) => /[A-Za-z0-9_$]/.test(c);
  const ws = (p) => { while (p < n && /\s/.test(source[p])) p++; return p; };

  function readWord(p) {
    const s = p;
    while (p < n && isIdChar(source[p])) p++;
    return { word: source.slice(s, p), end: p };
  }

  /** 跳过正则字面量（启发式入口已判）；换行未闭合自愈（当除法） */
  function skipRegex(p) {
    p++; // 跳过 /
    let inClass = false;
    while (p < n) {
      const c = source[p];
      if (c === '\\') { p += 2; continue; }
      if (c === '\n') return p; // 自愈：当除法处理
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) return p + 1;
      p++;
    }
    return p;
  }

  /** 从 p 起取字符串字面量内容（引号已定位）；返回 {text, end} 或 null */
  function readStringAt(p) {
    if (p >= n) return null;
    const q = source[p];
    if (q !== '\'' && q !== '"') return null;
    p++;
    let text = '';
    while (p < n) {
      const c = source[p];
      if (c === '\\') { text += source[p + 1] === 'n' ? '\n' : source[p + 1]; p += 2; continue; }
      if (c === q) return { text, end: p + 1 };
      if (c === '\n') return null;
      text += c; p++;
    }
    return null;
  }

  /** 深度感知地扫描到 depth=0 的 stop 集合之一；返回 {end, token, depthEnd}；嵌套串/注释/模板安全 */
  function scanBalanced(p, stopChars) {
    let depth = 0;
    while (p < n) {
      const c = source[p];
      if (c === '/' && source[p + 1] === '/') { while (p < n && source[p] !== '\n') p++; continue; }
      if (c === '/' && source[p + 1] === '*') { p += 2; while (p < n && !(source[p] === '*' && source[p + 1] === '/')) p++; p += 2; continue; }
      if (c === '\'' || c === '"') { const r = readStringAt(p); if (r) { p = r.end; continue; } p++; continue; }
      if (c === '`') { p++; while (p < n) { if (source[p] === '\\') { p += 2; continue; } if (source[p] === '`') break; if (source[p] === '$' && source[p + 1] === '{') { // 模板插值：递归平衡到 }
          let d = 1; p += 2;
          while (p < n && d > 0) {
            const c2 = source[p];
            if (c2 === '/' && source[p + 1] === '/') { while (p < n && source[p] !== '\n') p++; continue; }
            if (c2 === '/' && source[p + 1] === '*') { p += 2; while (p < n && !(source[p] === '*' && source[p + 1] === '/')) p++; p += 2; continue; }
            if (c2 === '\'' || c2 === '"') { const r2 = readStringAt(p); if (r2) { p = r2.end; continue; } p++; continue; }
            if (c2 === '`') { // 嵌套模板
              p++;
              while (p < n) { if (source[p] === '\\') { p += 2; continue; } if (source[p] === '`') break; if (source[p] === '$' && source[p + 1] === '{') { let d3 = 1; p += 2; while (p < n && d3 > 0) { if (source[p] === '{') d3++; else if (source[p] === '}') d3--; if (source[p] === '\\') p++; p++; } continue; } p++; }
              continue; }
            if (c2 === '{') d++;
            else if (c2 === '}') d--;
            if (c2 === '\\') p++;
            p++;
          }
          continue; } p++; }
        continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0 && stopChars.has(c)) return { end: p, token: c, depth }; depth--; }
      else if (depth === 0 && stopChars.has(c)) return { end: p, token: c, depth };
      p++;
    }
    return { end: n, token: '', depth };
  }

  /** 从 p 找 depth=0 的 `from` 关键字 + 其后的字符串字面量 */
  function findFromSpec(p) {
    let depth = 0;
    while (p < n) {
      const c = source[p];
      if (c === '/' && source[p + 1] === '/') { while (p < n && source[p] !== '\n') p++; continue; }
      if (c === '/' && source[p + 1] === '*') { p += 2; while (p < n && !(source[p] === '*' && source[p + 1] === '/')) p++; p += 2; continue; }
      if (c === '\'' || c === '"') { const r = readStringAt(p); if (r) { p = r.end; continue; } p++; continue; }
      if (c === '`') { p = skipTemplateBody(p); continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; p++; continue; }
      if (c === ')' || c === ']' || c === '}') { depth--; p++; continue; }
      if (depth === 0 && isIdStart(c)) {
        const { word, end } = readWord(p);
        if (word === 'from') {
          const q = ws(end);
          const r = readStringAt(q);
          if (r) return { clauseEnd: p, spec: r.text, after: r.end };
          return null; // from 后非字符串：怪异，放弃
        }
        p = end; continue;
      }
      p++;
    }
    return null;
  }

  function skipTemplateBody(p) { // p 在模板开始反引号处
    p++;
    while (p < n) {
      const c = source[p];
      if (c === '\\') { p += 2; continue; }
      if (c === '`') return p + 1;
      if (c === '$' && source[p + 1] === '{') {
        let d = 1; p += 2;
        while (p < n && d > 0) {
          const c2 = source[p];
          if (c2 === '\'' || c2 === '"') { const r = readStringAt(p); if (r) { p = r.end; continue; } p++; continue; }
          if (c2 === '`') { p = skipTemplateBody(p); continue; }
          if (c2 === '{') d++;
          else if (c2 === '}') d--;
          p++;
        }
        continue;
      }
      p++;
    }
    return p;
  }

  while (i < n) {
    const c = source[i];
    // 注释
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }
    // 字符串
    if (c === '\'' || c === '"') { const r = readStringAt(i); i = r ? r.end : i + 1; prevSig = c; continue; }
    // 模板
    if (c === '`') { i = skipTemplateBody(i); prevSig = c; continue; }
    // 正则 vs 除法（启发式 + 换行自愈）
    if (c === '/') {
      if (REGEX_PREV_OK.has(prevSig)) { i = skipRegex(i); prevSig = 'regexp'; }
      else { i++; prevSig = '/'; }
      continue;
    }
    // 标识符
    if (isIdStart(c)) {
      const { word, end } = readWord(i);
      prevSig = word;
      if (word === 'import') {
        let p = ws(end);
        if (source[p] === '(') {
          // 动态 import
          const q = ws(p + 1);
          const r = readStringAt(q);
          if (r) res.imports.push({ kind: 'dynamic', spec: r.text, names: null, namespace: false, side: false, def: null });
          else res.imports.push({ kind: 'dynamic', spec: null, names: null, namespace: false, side: false, def: null });
          i = p + 1; continue;
        }
        if (source[p] === '.') {
          // import.meta.glob(...) / import.meta.globEager(...)
          const m = /^\s*meta\s*\.\s*(?:glob|globEager|globLazy)\s*\(/.exec(source.slice(p + 1));
          if (m) {
            const q = ws(p + 1 + m[0].length);
            const r = readStringAt(q);
            if (r) res.globs.push(r.text);
          }
          i = p + 1; continue;
        }
        if (source[p] === '\'' || source[p] === '"') {
          const r = readStringAt(p);
          if (r) { res.imports.push({ kind: 'static', spec: r.text, names: [], namespace: false, side: true, def: null, typeOnly: false, starReexport: false }); i = r.end; continue; }
        }
        // 子句 import：找 depth0 的 from + 字符串
        const f = findFromSpec(end);
        if (f) {
          const clause = parseImportClause(source.slice(i, f.clauseEnd));
          res.imports.push({
            kind: 'static', spec: f.spec, names: clause.names, namespace: clause.namespace,
            side: clause.side, def: clause.def, typeOnly: false, starReexport: false,
          });
          i = f.after; continue;
        }
        i = end; continue;
      }
      if (word === 'export') {
        let p = ws(end);
        if (source[p] === '*') {
          // export * (as N)? from 'x'
          let q = ws(p + 1);
          let nsName = null;
          const w1 = readWord(q);
          if (w1.word === 'as') { const w2 = readWord(ws(w1.end)); nsName = w2.word; q = w2.end; }
          const f = findFromSpec(q);
          if (f) {
            if (nsName) res.exports.push({ type: 'reexport', name: nsName, from: f.spec, importName: null, typeOnly: false });
            else res.exports.push({ type: 'reexport-all', from: f.spec, typeOnly: false });
            // 模块请求也要进 imports（文件级边 + BFS 可达性）
            res.imports.push({ kind: 'static', spec: f.spec, names: [], namespace: false, side: false, def: null, typeOnly: false, starReexport: true });
            i = f.after; continue;
          }
          i = p + 1; continue;
        }
        if (source[p] === '{') {
          // export { A, B as C } (from 'x')? / export type {..}
          // 从 { 之后起扫（scanBalanced 遇到 depth0 的 '}' 收口）
          const bal = scanBalanced(p + 1, new Set(['}']));
          const inner = source.slice(p + 1, bal.end);
          let typeOnly = false;
          {
            let b = p - 1;
            while (b >= 0 && /\s/.test(source[b])) b--;
            const wBack = (() => { const e2 = b + 1; let s2 = b; while (s2 >= 0 && isIdChar(source[s2])) s2--; return source.slice(s2 + 1, e2); })();
            if (wBack === 'type') typeOnly = true;
          }
          const f = findFromSpec(bal.end + 1);
          const names = splitNamedList(inner);
          if (f) {
            for (const nm of names) res.exports.push({ type: 'reexport', name: nm.local, from: f.spec, importName: nm.imported, typeOnly });
            res.imports.push({ kind: 'static', spec: f.spec, names: [], namespace: false, side: false, def: null, typeOnly, starReexport: true });
            i = f.after; continue;
          }
          for (const nm of names) res.exports.push({ type: 'direct', name: nm.local, typeOnly });
          i = bal.end; continue;
        }
        // export import A = require('x')：TS 互操作，跳过（记录不解析）
        if (isIdStart(source[p])) {
          const w2 = readWord(p);
          if (w2.word === 'import') { i = w2.end; continue; }
          // 声明类导出：逐步吃修饰符（async/abstract/declare；const enum 连吃两个）
          let wp = ws(p);
          let w = readWord(wp);
          while (w.word === 'async' || w.word === 'abstract' || w.word === 'declare' || (w.word === 'const' && readWord(ws(w.end)).word === 'enum')) {
            wp = ws(w.end); w = readWord(wp);
          }
          if (w.word === 'default') {
            res.exports.push({ type: 'direct', name: 'default', typeOnly: false });
            i = w.end; continue;
          }
          if (['function', 'class', 'interface', 'enum', 'namespace', 'type', 'module'].includes(w.word)) {
            const wName = readWord(ws(w.end));
            if (isIdStart(source[ws(w.end)])) {
              res.exports.push({ type: 'direct', name: wName.word, typeOnly: w.word === 'type' || w.word === 'interface' });
              i = wName.end; continue;
            }
            i = w.end; continue;
          }
          if (w.word === 'const' || w.word === 'let' || w.word === 'var') {
            // 声明符序列：name[, name2] [= ...] ;
            let q2 = ws(w.end);
            for (;;) {
              q2 = ws(q2);
              if (source[q2] === '{' || source[q2] === '[') {
                const closer = source[q2] === '{' ? '}' : ']';
                const bal = scanBalanced(q2 + 1, new Set([closer]));
                const inner = source.slice(q2 + 1, bal.end);
                // 解构导出：{a, b: c} → 导出 a 与 c（本地绑定名）
                for (const pieceRaw of inner.split(',')) {
                  const piece = pieceRaw.trim();
                  if (!piece) continue;
                  const mm = piece.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/);
                  if (mm) res.exports.push({ type: 'direct', name: mm[2] || mm[1], typeOnly: false });
                }
                q2 = bal.end;
              } else if (isIdStart(source[q2] || '')) {
                const wName = readWord(q2);
                if (!['from', 'in', 'of', 'const', 'let', 'var', 'function', 'class'].includes(wName.word)) {
                  res.exports.push({ type: 'direct', name: wName.word, typeOnly: false });
                }
                q2 = wName.end;
              } else break;
              // 跳到 = 或 , 或 ;（= 时还要看初始化器后有没有逗号续声明）
              const stop = scanBalanced(q2, new Set(['=', ',', ';', '\n']));
              if (stop.token === ',') { q2 = stop.end + 1; continue; }
              if (stop.token === '=') {
                const stop2 = scanBalanced(stop.end + 1, new Set([',', ';', '\n']));
                if (stop2.token === ',') { q2 = stop2.end + 1; continue; }
              }
              break;
            }
            i = q2; continue;
          }
          i = w.end; continue;
        }
        i = end; continue;
      }
      if (word === 'require') {
        const p = ws(end);
        if (source[p] === '(') {
          const q = ws(p + 1);
          const r = readStringAt(q);
          if (r) res.imports.push({ kind: 'require', spec: r.text, names: null, namespace: false, side: true, def: null });
          i = p + 1; continue;
        }
      }
      i = end; continue;
    }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return res;
}

/**
 * 解析单个源文件（对外接口与旧 lexer 版一致）。
 * @returns {{imports: Array, exports: Array, globs: string[], ok: boolean, error?: string, cjs: boolean}}
 */
function parseModule(rel, source) {
  try {
    const rec = scanModule(source);
    rec.cjs = extOf(rel) === '.cjs';
    // .cjs 的 require 已由扫描器覆盖；ESM 文件里的 require 同样计边（保守）
    return rec;
  } catch (e) {
    return { imports: [], exports: [], globs: [], ok: false, error: String((e && e.message) || e), cjs: extOf(rel) === '.cjs' };
  }
}

// ── 解析器 ──────────────────────────────────────────────────────────────────

/** JSONC 注释剥离（字符串感知——正则版会被 "@/*" 这类键值里的 /* 意外吞掉后续内容） */
function stripJsonComments(text) {
  const s = String(text);
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '"') {
      // 字符串原样保留（含转义）
      out += c; i++;
      while (i < n) {
        out += s[i];
        if (s[i] === '\\') { out += s[i + 1] || ''; i += 2; continue; }
        if (s[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/** 读 tsconfig.json（容忍注释与尾逗号），返回 {paths, baseUrl} */
function parseTsconfig(text) {
  if (!text) return { paths: {}, baseUrl: '' };
  const t = stripJsonComments(String(text)).replace(/,(\s*[}\]])/g, '$1');
  let cfg;
  try { cfg = JSON.parse(t); } catch (_) { return { paths: {}, baseUrl: '' }; }
  const co = cfg.compilerOptions || {};
  const paths = {};
  if (co.paths && typeof co.paths === 'object') {
    for (const k of Object.keys(co.paths)) {
      const v = co.paths[k];
      if (Array.isArray(v)) paths[k] = v.map(String);
    }
  }
  return { paths, baseUrl: typeof co.baseUrl === 'string' ? co.baseUrl : '' };
}

/** glob 串（vite import.meta.glob 首参）→ 正则（仅 * / ** 与字面段；花括号等不支持返回 null） */
function globToRe(pattern) {
  if (/[{?[\\]/.test(pattern)) return null;
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') { re += '(?:[^/]*/)*'; i += 2; }
        else { re += '[\\s\\S]*'; i += 1; }
      } else re += '[^/]*';
    } else re += escapeRe(c);
  }
  return new RegExp(re + '$');
}

/**
 * 解析 import 说明符。
 * @returns {{kind:'file'|'external'|'builtin'|'missing'|'skip', target?:string, pkgName?:string, note?:string}}
 */
function resolveSpecifier(spec, importerRel, ctx) {
  let s = String(spec || '').split('#')[0].trim();
  if (!s) return { kind: 'skip', note: '空说明符' };
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) return { kind: 'skip', note: 'URL/数据' };
  if (s.startsWith('node:')) return { kind: 'builtin' };
  s = s.replace(/\?[^?]*$/, ''); // vite ?raw/?url 等查询后缀
  if (!s) return { kind: 'skip', note: '纯查询导入' };

  if (s.startsWith('.')) {
    return resolveFromFileSet(joinPosix(dirnamePosix(importerRel), s), ctx);
  }
  if (s.startsWith('/')) {
    return resolveFromFileSet(s.slice(1), ctx);
  }
  const alias = matchAlias(s, ctx);
  if (alias) return resolveFromFileSet(alias, ctx);
  if (s.startsWith('~/')) {
    const r = resolveFromFileSet(normalizeRel(joinPosix('src', s.slice(2))), ctx);
    if (r.kind === 'file') return r;
    return resolveFromFileSet(s.slice(2), ctx);
  }
  // 裸名：内建 / workspace 包 / 外部依赖
  const pkgName = pkgNameOf(s);
  if (BUILTIN_MODS.has(pkgName) && !s.includes('/')) return { kind: 'builtin' };
  if (ctx.internalPackages && ctx.internalPackages.has(pkgName)) return { kind: 'skip', note: 'workspace 包' };
  return { kind: 'external', pkgName };
}

/** 相对/别名解析落地：资产直查 → 精确 → +扩展 → /index → TS 风格扩展映射 */
function resolveFromFileSet(base, ctx) {
  base = normalizeRel(base);
  const ext = extOf(base);
  const isKnownSrc = SRC_EXTS.has(ext) || ext === JSON_EXT;
  const tries = [];
  if (isKnownSrc) {
    tries.push(base);
    if (SRC_EXTS.has(ext)) {
      const stem = base.slice(0, -ext.length);
      if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
        // TS 风格：import './x.js' 实指 './x.ts'
        tries.push(stem + (ext === '.js' ? '.ts' : '.mts'), stem + (ext === '.js' ? '.tsx' : '.cts'));
      }
    }
  } else if (ext && ASSET_EXTS.has(ext)) {
    // 资产：精确存在即命中（不尝试 +.ts）
    if (ctx.vfs.exists(base) || (ctx.vfs.statAny && ctx.vfs.statAny(base))) {
      return { kind: 'file', target: base, note: 'asset' };
    }
    return { kind: 'missing', note: `资产未找到 ${base}` };
  } else if (ext) {
    // 未知扩展（如 './x.types'）：先查盘精确，再尝试 +.ts / +.tsx / +.d.ts
    if ((ctx.vfs.statAny && ctx.vfs.statAny(base)) || ctx.vfs.exists(base)) {
      return { kind: 'file', target: base, note: 'asset' };
    }
    tries.push(`${base}.ts`, `${base}.tsx`, `${base}.d.ts`);
  } else {
    // 无扩展：+扩展 / /index
    for (const e of RESOLVE_EXTS) tries.push(base + e);
    for (const e of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']) tries.push(`${base}/index${e}`);
  }
  for (const t of tries) {
    if (ctx.vfs.exists(t) && ctx.vfs.files && ctx.vfs.files.has(toPosix(t))) {
      return { kind: 'file', target: toPosix(t) };
    }
  }
  return { kind: 'missing', note: `未解析到 ${base}` };
}

/** tsconfig paths 别名（最长前缀优先） */
function matchAlias(spec, ctx) {
  const { paths, baseUrl } = ctx.tsconfig || { paths: {}, baseUrl: '' };
  const keys = Object.keys(paths).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const star = key.indexOf('*');
    const prefix = star >= 0 ? key.slice(0, star) : key;
    if (!spec.startsWith(prefix)) continue;
    if (star < 0 && spec !== key) continue;
    const rest = star >= 0 ? spec.slice(prefix.length) : '';
    for (const target of paths[key]) {
      const t = star >= 0 ? target.replace(/\*$/, rest) : target;
      return baseUrl ? normalizeRel(joinPosix(baseUrl, t)) : normalizeRel(t);
    }
  }
  return null;
}

/** 裸名 → 包名（@scope/pkg 两段式归并） */
function pkgNameOf(spec) {
  const parts = String(spec).split('/');
  if (parts[0].startsWith('@')) return parts.slice(0, 2).join('/');
  return parts[0];
}

// ── 模型构建 ────────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.vfs              makeVfs / makeFsVfs 产物
 * @param {string} p.root
 * @param {string[]} p.extraEntries   用户/工具补充入口（rel 文件或目录）
 * @returns {object} model
 */
function buildModel({ vfs, root = '', extraEntries = [] }) {
  const t0 = Date.now();
  const warnings = [];
  const allFiles = vfs.list().map(toPosix).sort();
  const srcFiles = allFiles.filter((f) => SRC_EXTS.has(extOf(f)) || extOf(f) === JSON_EXT);

  // package.json（根；扫描根内没有则用上层目录的——扫描根常是 src 子目录）
  let pkg = null;
  let pkgFrom = '';
  const internalPackages = new Set();
  for (const f of srcFiles) {
    if (!f.endsWith('package.json')) continue;
    try {
      const j = JSON.parse(vfs.readText(f));
      if (j && typeof j.name === 'string') internalPackages.add(j.name);
      if (f === 'package.json') pkg = j;
    } catch (e) { pushWarn(warnings, `package.json 解析失败 ${f}: ${e.message}`); }
  }
  if (!pkg && vfs.pkgAbove) {
    try {
      pkg = JSON.parse(vfs.pkgAbove.text);
      pkgFrom = 'above';
    } catch (_) { /* 忽略 */ }
  }

  // tsconfig paths：先看扫描根内，再看上层（扫描根常是 src 子目录）；别名目标换算为根相对
  let tsconfig = { paths: {}, baseUrl: '' };
  for (const cand of ['tsconfig.json', 'jsconfig.json']) {
    if (vfs.exists(cand)) {
      try { tsconfig = parseTsconfig(vfs.readText(cand)); } catch (_) { /* 已保守兜底 */ }
      break;
    }
  }
  if (!Object.keys(tsconfig.paths).length && vfs.tsconfigExternal) {
    const pathmod = require('path');
    const ext = vfs.tsconfigExternal;
    const parsed2 = parseTsconfig(ext.text);
    const baseDir = parsed2.baseUrl ? pathmod.resolve(ext.dirAbs, parsed2.baseUrl) : ext.dirAbs;
    const paths = {};
    const dropped = [];
    for (const k of Object.keys(parsed2.paths)) {
      const conv = [];
      for (const t of parsed2.paths[k]) {
        const abs = pathmod.resolve(baseDir, t);
        const rel = pathmod.relative(ext.rootAbs, abs).replace(/\\/g, '/');
        if (!rel || rel.startsWith('..')) { dropped.push(`${k} → ${t}`); continue; }
        conv.push(rel);
      }
      if (conv.length) paths[k] = conv;
    }
    tsconfig = { paths, baseUrl: '' };
    for (const d of dropped) pushWarn(warnings, `tsconfig 别名 ${d} 指向扫描根之外，命中它的导入按跳过处理`);
  }
  if (!Object.keys(tsconfig.paths).length && vfs.exists('src')) {
    tsconfig.paths = { '@/*': ['src/*'], '~/': ['src/*'] };
  }

  const ctx = { vfs, tsconfig, internalPackages };

  // 解析所有源文件
  const parsed = new Map(); // rel → parseModule 结果
  let lexerFailures = 0;
  for (const rel of srcFiles) {
    if (extOf(rel) === JSON_EXT) continue;
    const rec = parseModule(rel, vfs.readText(rel));
    if (!rec.ok) { lexerFailures++; pushWarn(warnings, `语法解析退化为正则兜底 ${rel}: ${rec.error}`); }
    parsed.set(rel, rec);
  }

  // 边 + 外部引用 + 悬空 + 正出边邻接
  const edges = new Map();        // targetRel → [edge]
  const outMap = new Map();       // fromRel → Set(targetRel)（BFS/环用）
  const externalRefs = new Map(); // pkgName → Set(fromRel)
  const missing = [];

  const addEdge = (from, target, e) => {
    if (!edges.has(target)) edges.set(target, []);
    edges.get(target).push({ from, ...e });
    if (!outMap.has(from)) outMap.set(from, new Set());
    outMap.get(from).add(target);
  };

  for (const [rel, rec] of parsed) {
    for (const im of rec.imports) {
      if (im.spec == null) continue; // 非字面量动态 import：保守跳过（宁漏报）
      const r = resolveSpecifier(im.spec, rel, ctx);
      if (r.kind === 'file') {
        addEdge(rel, r.target, {
          spec: im.spec, kind: im.kind, names: im.names || [], namespace: im.namespace,
          side: im.side || im.kind === 'require', def: im.def, dynamic: im.kind === 'dynamic',
          fuzzy: !!im.fuzzy,
        });
      } else if (r.kind === 'external') {
        if (!externalRefs.has(r.pkgName)) externalRefs.set(r.pkgName, new Set());
        externalRefs.get(r.pkgName).add(rel);
      } else if (r.kind === 'missing') {
        missing.push({ from: rel, spec: im.spec, note: r.note || '' });
      }
      // builtin / skip：不产生边
    }
  }

  // import.meta.glob 展开命中（保守视为已用）
  const globCovered = new Set();
  const globUnmatched = [];
  for (const [rel, rec] of parsed) {
    for (const pattern of rec.globs) {
      let base;
      if (pattern.startsWith('.')) base = normalizeRel(joinPosix(dirnamePosix(rel), pattern));
      else if (pattern.startsWith('/')) base = normalizeRel(pattern.slice(1));
      else base = normalizeRel(pattern); // vite 语义：非相对 → 项目根
      const re = globToRe(base);
      if (!re) { pushWarn(globUnmatched, `${rel} 的 glob "${pattern}" 含高级语法，未展开（保守不标记）`); continue; }
      let hit = 0;
    for (const f of srcFiles) {
      if (extOf(f) === JSON_EXT) continue;
      if (re.test(f)) { globCovered.add(f); hit++; }
    }
      if (!hit) pushWarn(globUnmatched, `${rel} 的 glob "${pattern}" 零命中（目录为空或模式不支持）`);
    }
  }

  // 入口
  const entries = guessEntries({ srcFiles, vfs, pkg, extraEntries, warnings });

  // 可达性 BFS（入口 + glob 命中文件沿解析出的文件边；动态加载也算可达）
  const reachable = new Set();
  const queue = [];
  for (const [e] of entries) {
    if (vfs.files.has(e) && !reachable.has(e)) { reachable.add(e); queue.push(e); }
  }
  for (const g of globCovered) {
    if (!reachable.has(g)) { reachable.add(g); queue.push(g); }
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const t of outMap.get(cur) || []) {
      if (!reachable.has(t)) { reachable.add(t); queue.push(t); }
    }
  }

  const model = {
    root, warnings, entries, reachable, edges, outMap, externalRefs, missing,
    parsed, srcFiles, pkg, tsconfig, globCovered, globUnmatched, ctx, vfs,
    lexerFailures,
    meta: {
      startedAt: t0, files: srcFiles.length,
      edgesTotal: [...edges.values()].reduce((n, a) => n + a.length, 0),
      externalPkgs: externalRefs.size, parseMs: Date.now() - t0, pkgFrom,
    },
  };
  return model;
}

// ── 入口启发 ────────────────────────────────────────────────────────────────

const TEST_FILE_RE = /(^|\/)(__tests?__|__mocks__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * 入口 = package.json main/module/browser/exports/bin + 根 index.html script
 * + 配置文件 + 测试文件 + 常见 app 入口 + 用户补充。
 * @returns {Map<string,string>} rel → 来源标签
 */
function guessEntries({ srcFiles, vfs, pkg, extraEntries = [], warnings }) {
  const entries = new Map();
  const add = (rel, src) => {
    const p = toPosix(rel);
    if (vfs.files.has(p)) entries.set(p, src);
  };

  // 1) package.json 字段
  if (pkg) {
    for (const k of ['main', 'module', 'browser', 'types', 'typings']) {
      if (typeof pkg[k] === 'string') add(pkg[k], 'package.json');
    }
    const walkExports = (v) => {
      if (typeof v === 'string') add(v, 'package.json');
      else if (v && typeof v === 'object') for (const kk of Object.keys(v)) walkExports(v[kk]);
    };
    if (pkg.exports) walkExports(pkg.exports);
    if (typeof pkg.bin === 'string') add(pkg.bin, 'package.json');
    else if (pkg.bin && typeof pkg.bin === 'object') for (const v of Object.values(pkg.bin)) add(v, 'package.json');
  }

  // 2) index.html script
  if (vfs.files.has('index.html')) {
    try {
      const html = vfs.readText('index.html');
      const re = /<script[^>]+src=["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const spec = m[1].split('?')[0];
        if (/^(https?:)?\/\//.test(spec)) continue;
        add(spec.replace(/^\//, ''), 'index.html');
      }
    } catch (_) { /* 忽略 */ }
  }

  // 3) 配置文件
  for (const f of srcFiles) {
    const base = f.split('/').pop();
    if (CONFIG_FILE_RE.test(f) || /^\.?eslintrc/.test(base) || f === 'tsconfig.json'
      || f === 'jsconfig.json') {
      add(f, 'config');
    }
  }

  // 3b) 环境声明文件（*.d.ts 从不被 import，属编译期注入）
  for (const f of srcFiles) {
    if (/\.d\.[cm]?ts$/.test(f)) add(f, 'ambient');
  }

  // 4) 测试文件与测试目录全算入口（knip 同款默认）
  for (const f of srcFiles) {
    if (TEST_FILE_RE.test(f) || /^(test|tests|__tests__)\//.test(f)) add(f, 'test');
  }

  // 4b) package.json scripts/bin 引用的文件（node build.mjs 等）
  if (pkg && pkg.scripts) {
    const scriptText = Object.values(pkg.scripts).join(' ');
    const re = /(?:^|[\s=&])((?:[\w@.-]+\/)*[\w@.-]+\.(?:mjs|cjs|[cm]?[jt]sx?))(?![\w.-])/g;
    let m;
    while ((m = re.exec(scriptText)) !== null) add(m[1], 'script');
  }

  // 4c) house 契约路径：插件服务/MCP 入口（本仓生态的运行契约，import 图看不见）
  for (const f of srcFiles) {
    if (f === 'service/main.js' || f === 'mcp/server.js') add(f, 'house');
  }

  // 5) 常见 app 入口
  const HEURISTIC = [
    /^index\.[cm]?[jt]sx?$/, /^main\.[cm]?[jt]sx?$/, /^server\.[cm]?[jt]sx?$/, /^app\.[cm]?[jt]sx?$/,
    /^src\/index\.[cm]?[jt]sx?$/, /^src\/main\.[cm]?[jt]sx?$/, /^src\/server\.[cm]?[jt]sx?$/, /^src\/app(\.|-)/,
    /^app\/.*\/page\.[cm]?[jt]sx?$/, /^pages\/.*\.[cm]?[jt]sx?$/, /^src\/pages\/.*\.[cm]?[jt]sx?$/,
  ];
  for (const f of srcFiles) {
    if (extOf(f) === JSON_EXT) continue;
    for (const re of HEURISTIC) { if (re.test(f)) { add(f, 'heuristic'); break; } }
  }

  // 6) 用户补充（文件或目录——目录时其下 index.* 算入口）
  for (const e of extraEntries || []) {
    const p = toPosix(e);
    if (vfs.files.has(p) || vfs.dirs.has(p)) {
      if (!p.includes('.') || vfs.files.has(p)) {
        if (vfs.files.has(p)) { add(p, 'user'); continue; }
      }
      for (const f of srcFiles) {
        if (f.startsWith(p + '/') && /^index\.[cm]?[jt]sx?$/.test(f.slice(p.length + 1))) add(f, 'user');
      }
    }
  }

  if (!entries.size) pushWarn(warnings, '未发现任何入口（package.json/index/常见约定/测试文件）——死文件与导出维度将跳过并如实标注');
  return entries;
}

// ── 导出消费链 ──────────────────────────────────────────────────────────────

/**
 * 消费「file 导出的 name」：沿 re-export 链回溯到终端并记 consumed。
 * name='*'（namespace 消费）→ 全部导出记为已消费。
 */
function consumeExport(model, file, name, depth = 0, seen = null) {
  if (depth > 25) return;
  seen = seen || new Set();
  const key = `${file}::${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  const rec = model.parsed.get(file);
  if (!rec) return;
  if (name === '*' || name === null || name === undefined) {
    markAllConsumed(model, file, depth, seen);
    return;
  }
  if (rec.exports.some((e) => e.type === 'direct' && e.name === name)) {
    model.consumed.add(`${file}::${name}`);
    return;
  }
  // 命名转发 / namespace 转发
  for (const ex of rec.exports) {
    if (ex.type === 'reexport' && ex.name === name) {
      const target = resolveSpecifier(ex.from, file, model.ctx);
      if (target.kind !== 'file') continue;
      if (ex.importName === null) { markAllConsumed(model, target.target, depth + 1, seen); continue; }
      consumeExport(model, target.target, ex.importName, depth + 1, seen);
      return;
    }
  }
  // reexport-all：在星源中找这个名字（可能多层）
  const origins = starSources(model, file, 0, new Set());
  for (const o of origins) {
    const orec = model.parsed.get(o);
    if (!orec) continue;
    if (orec.exports.some((e) => e.type === 'direct' && e.name === name)) {
      model.consumed.add(`${o}::${name}`);
      continue;
    }
    // 星源本身也可能是命名转发
    for (const ex of orec.exports) {
      if (ex.type === 'reexport' && ex.name === name) {
        const target = resolveSpecifier(ex.from, o, model.ctx);
        if (target.kind !== 'file') continue;
        if (ex.importName === null) markAllConsumed(model, target.target, depth + 1, seen);
        else consumeExport(model, target.target, ex.importName, depth + 1, seen);
      }
    }
  }
}

/** file 的全部 reexport-all 星源（递归，含去重与深度上限） */
function starSources(model, file, depth = 0, seen = null) {
  seen = seen || new Set();
  if (seen.has(file) || depth > 25) return [];
  seen.add(file);
  const rec = model.parsed.get(file);
  if (!rec) return [];
  const out = [];
  for (const ex of rec.exports) {
    if (ex.type !== 'reexport-all') continue;
    const target = resolveSpecifier(ex.from, file, model.ctx);
    if (target.kind !== 'file') continue;
    out.push(target.target);
    for (const sub of starSources(model, target.target, depth + 1, seen)) out.push(sub);
  }
  return [...new Set(out)];
}

function markAllConsumed(model, file, depth = 0, seen = null) {
  seen = seen || new Set();
  if (seen.has(`all:${file}`) || depth > 25) return;
  seen.add(`all:${file}`);
  const rec = model.parsed.get(file);
  if (!rec) return;
  for (const ex of rec.exports) {
    if (ex.type === 'direct') model.consumed.add(`${file}::${ex.name}`);
    else if (ex.type === 'reexport') {
      const target = resolveSpecifier(ex.from, file, model.ctx);
      if (target.kind !== 'file') continue;
      if (ex.importName === null) markAllConsumed(model, target.target, depth + 1, seen);
      else consumeExport(model, target.target, ex.importName, depth + 1, seen);
    }
    // reexport-all 的 namespace 消费递归展开星源
    else if (ex.type === 'reexport-all') {
      const target = resolveSpecifier(ex.from, file, model.ctx);
      if (target.kind !== 'file') continue;
      markAllConsumed(model, target.target, depth + 1, seen);
    }
  }
}

// ── 分析 ────────────────────────────────────────────────────────────────────

/**
 * 在 model 上跑全部分析，返回报告（含 caps 截断与 warnings）。
 * @param {object} opts {ignorePrefixes?: string[]}
 */
function analyze(model, { ignorePrefixes = [] } = {}) {
  const t0 = Date.now();
  model.consumed = new Set();
  const { reachable, edges, parsed, entries, srcFiles, vfs } = model;

  const ignored = (rel) => ignorePrefixes.some((p) => rel === p || rel.startsWith(p.endsWith('/') ? p : `${p}/`));

  // 1) 消费标记（只从可达文件出发——死文件引用不算真使用）
  for (const [target, list] of edges) {
    for (const e of list) {
      if (!reachable.has(e.from)) continue;
      if (e.dynamic || e.namespace) { markAllConsumed(model, target); continue; }
      if (e.side && !(e.names && e.names.length) && !e.def) continue; // side-effect 只算文件用
      for (const n of e.names || []) consumeExport(model, target, n.imported);
      if (e.def) consumeExport(model, target, 'default');
    }
  }
  // glob 命中文件：运行时动态访问，导出保守全标记
  for (const g of model.globCovered) markAllConsumed(model, g);

  // 2) 死文件
  const orphanFiles = [];
  for (const f of srcFiles) {
    if (extOf(f) === JSON_EXT) continue;
    if (entries.has(f) || reachable.has(f)) continue;
    if (model.globCovered.has(f)) continue; // import.meta.glob 命中 → 保守不报死
    if (ignored(f)) continue;
    const importerList = [...(edges.get(f) || [])].map((e) => e.from);
    const liveImporters = importerList.filter((x) => reachable.has(x));
    const reason = importerList.length === 0 ? 'no-importer'
      : liveImporters.length === 0 ? 'only-dead-importers' : null;
    if (!reason) continue; // 有活引用却不可达（防御，BFS 已保证不会走到）
    const source = vfs.files.get(f) || '';
    orphanFiles.push({
      path: f, reason,
      importers: importerList.slice(0, CAPS.IMPORTERS_EVIDENCE),
      importerCount: importerList.length,
      bytes: Buffer.byteLength(source, 'utf8'),
      loc: source ? source.split('\n').length : 0,
      glob: model.globCovered.has(f),
    });
  }
  orphanFiles.sort((a, b) => (a.reason === 'no-importer' ? 0 : 1) - (b.reason === 'no-importer' ? 0 : 1) || a.path.localeCompare(b.path));
  const orphanTruncated = Math.max(0, orphanFiles.length - CAPS.ORPHANS);
  const deadSet = new Set(orphanFiles.map((o) => o.path));
  model.deadFiles = deadSet;

  // 3) 未使用导出（死文件的导出跳过——文件级发现已覆盖）
  const unusedExports = [];
  for (const [rel, rec] of parsed) {
    if (!reachable.has(rel) || deadSet.has(rel)) continue;
    if (ignored(rel)) continue;
    const isEntry = entries.has(rel);
    const seenName = new Set();
    for (const ex of rec.exports) {
      if (ex.type !== 'direct') continue; // 转发链的终端在源文件判
      if (seenName.has(ex.name)) continue;
      seenName.add(ex.name);
      if (model.consumed.has(`${rel}::${ex.name}`)) continue;
      // 入口文件的 default 导出是启动语义，不报
      if (ex.name === 'default' && isEntry && entries.get(rel) !== 'test') continue;
      unusedExports.push({
        path: rel, name: ex.name, typeOnly: !!ex.typeOnly,
        suggestion: suggestForExport(rel, ex.name, vfs.files.get(rel) || ''),
      });
    }
  }
  unusedExports.sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
  const exportTruncated = Math.max(0, unusedExports.length - CAPS.EXPORTS);

  // 4) 依赖
  const depsReport = analyzeDeps(model, ignored);

  // 5) 悬空导入
  const unresolvedImports = [];
  for (const m of model.missing) {
    if (ignored(m.from)) continue;
    unresolvedImports.push({ importer: m.from, specifier: m.spec, note: m.note });
  }
  unresolvedImports.sort((a, b) => a.importer.localeCompare(b.importer) || a.specifier.localeCompare(b.specifier));
  const unresolvedTruncated = Math.max(0, unresolvedImports.length - CAPS.UNRESOLVED);

  // 6) 循环（Tarjan，静态边）
  const cycles = findCycles(model);
  const cycleTruncated = Math.max(0, cycles.length - CAPS.CYCLES);

  const report = {
    meta: {
      ...model.meta, durationMs: Date.now() - t0, version: VERSION,
      entries: [...entries].slice(0, 300).map(([rel, src]) => ({ path: rel, via: src })),
      entriesTotal: entries.size,
      globCovered: model.globCovered.size,
      noEntryMode: entries.size === 0,
    },
    counts: {
      files: model.meta.files,
      orphanFiles: orphanFiles.length,
      unusedExports: unusedExports.length,
      unusedDeps: depsReport.unused.length,
      unlistedDeps: depsReport.unlisted.length,
      unresolvedImports: unresolvedImports.length,
      cycles: cycles.length,
    },
    orphanFiles: orphanFiles.slice(0, CAPS.ORPHANS),
    unusedExports: unusedExports.slice(0, CAPS.EXPORTS),
    deps: {
      unused: depsReport.unused.slice(0, CAPS.DEPS),
      unlisted: depsReport.unlisted.slice(0, CAPS.DEPS),
      checked: depsReport.checked,
    },
    unresolvedImports: unresolvedImports.slice(0, CAPS.UNRESOLVED),
    cycles: cycles.slice(0, CAPS.CYCLES),
    warnings: [
      ...model.warnings,
      ...model.globUnmatched,
      orphanTruncated > 0 ? `死文件达到上限 ${CAPS.ORPHANS}，截断 ${orphanTruncated} 条` : '',
      exportTruncated > 0 ? `未使用导出达到上限 ${CAPS.EXPORTS}，截断 ${exportTruncated} 条` : '',
      unresolvedTruncated > 0 ? `悬空导入达到上限 ${CAPS.UNRESOLVED}，截断 ${unresolvedTruncated} 条` : '',
      cycleTruncated > 0 ? `循环依赖达到上限 ${CAPS.CYCLES}，截断 ${cycleTruncated} 条` : '',
    ].filter(Boolean),
  };
  return report;
}

/** 自文件内是否另有引用（决定「删」还是「去 export」） */
function suggestForExport(rel, name, source) {
  if (name === 'default') return 'review';
  let s = String(source);
  // 先剥 export{...} 子句（含 export 字样整体移除），再去行首 export 关键字；
  // 顺序不能反——否则子句剩 `{ x }` 会被当成引用，把「可删」误判成「去 export」。
  s = s.replace(/export\s*\{[^}]*\}\s*(?:from\s*['"][^'"]*['"])?\s*;?/g, '');
  s = s.replace(/^\s*export\s+/gm, '');
  const re = new RegExp(`(^|[^.\\w$'"])${escapeRe(name)}\\b`, 'g');
  let count = 0;
  let m;
  while ((m = re.exec(s)) !== null) { count++; if (count >= 2) return 'unexport'; }
  return 'delete';
}

/** 依赖分析：imports 零引用 + 配置/脚本零信号；@types 联动；unlisted 反查 */
function analyzeDeps(model, ignored) {
  const { pkg, externalRefs, vfs, srcFiles } = model;
  const unused = [];
  const unlisted = [];
  if (!pkg) return { unused, unlisted, checked: '（无根 package.json，依赖维度跳过）' };

  // 配置信号：package.json 只取 scripts/bin/engines（整文件含 dependencies 自己会自引用），
  // 其余配置文件取全文；扫描根上层目录的工具链配置一并计入（子目录扫描场景）。
  let signalText = '';
  try {
    signalText += `\n${JSON.stringify({ scripts: pkg.scripts || {}, bin: pkg.bin || {}, engines: pkg.engines || {} })}`;
  } catch (_) { /* 忽略 */ }
  if (model.vfs.pkgAbove && model.vfs.pkgAbove.configTexts) {
    for (const t of model.vfs.pkgAbove.configTexts) signalText += `\n${t}`;
  }
  let signalFileCount = 0;
  for (const f of srcFiles) {
    const base = f.split('/').pop();
    if (CONFIG_FILE_RE.test(f) || /^\.?eslintrc/.test(base)
      || f === 'tsconfig.json' || f === 'jsconfig.json' || /^\.prettierrc/.test(base)
      || /^\.babelrc/.test(base) || f.startsWith('.github/')) {
      signalFileCount++;
      try { signalText += `\n${vfs.readText(f)}`; } catch (_) { /* 忽略 */ }
    }
  }
  const hasTsconfig = vfs.exists('tsconfig.json') || vfs.exists('jsconfig.json') || !!vfs.tsconfigExternal;

  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};
  const depNames = [...new Set([...Object.keys(deps), ...Object.keys(devDeps)])];
  const peerOpt = new Set([
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ]);

  const refNames = new Set(externalRefs.keys());

  for (const dep of depNames) {
    if (peerOpt.has(dep)) continue;
    let usedVia = null;
    if (refNames.has(dep)) usedVia = 'import';
    else if (dep.startsWith('@types/') && refNames.has(dep.slice('@types/'.length))) usedVia = 'import（类型联动）';
    else if (dep === 'typescript' && hasTsconfig) usedVia = 'tsconfig 存在';
    if (!usedVia && signalText) {
      try {
        if (new RegExp(`(^|[^\\w@$./-])${escapeRe(dep)}([^\\w-]|$)`).test(signalText)) usedVia = '配置/脚本/CI 引用';
      } catch (_) { /* 正则构造失败忽略 */ }
    }
    if (!usedVia) {
      // 交叉提示：是否仅被死文件引用
      const refs = externalRefs.get(dep);
      let deadOnly = false;
      if (refs && refs.size && model.deadFiles && model.deadFiles.size) {
        deadOnly = [...refs].every((f) => model.deadFiles.has(f));
      }
      // 工具链依赖几乎从不被 import（经 CLI/CI/hook/配置生效）——如实标注，不武断说「可删」
      const isTooling = TOOLING_DEPS.has(dep) || /(^|\/)(eslint|prettier|vitest|jest|commitlint|lint-staged|husky|playwright|postcss|tailwindcss|autoprefixer|esbuild|vite|rollup|webpack|knip|tsx|ts-node|nodemon)$/.test(dep);
      unused.push({
        name: dep,
        kind: Object.prototype.hasOwnProperty.call(deps, dep) ? 'dep' : 'devDep',
        tooling: isTooling,
        suggestion: 'review',
        note: deadOnly ? '仅被死文件引用' : '',
      });
    }
  }

  // unlisted：外部引用了但没登记
  const known = new Set([...depNames, ...peerOpt]);
  for (const name of refNames) {
    if (known.has(name) || name.startsWith('@types/')) continue;
    unlisted.push({ name, usedBy: [...(externalRefs.get(name) || [])].slice(0, 5) });
  }

  return {
    unused, unlisted,
    checked: `${depNames.length} 个依赖 × import 引用 + ${signalFileCount} 个配置/脚本文件信号`,
  };
}

// ── 循环依赖（Tarjan SCC，静态边，可达子图） ────────────────────────────────

function findCycles(model) {
  const { outMap, reachable } = model;
  const graph = new Map();
  for (const [target, list] of model.edges) {
    for (const e of list) {
      if (e.dynamic || e.kind === 'require') continue;
      if (!reachable.has(e.from) || !reachable.has(target)) continue;
      if (!graph.has(e.from)) graph.set(e.from, new Set());
      graph.get(e.from).add(target);
    }
  }
  // 预展开邻接（迭代 Tarjan 每帧复用，避免 O(V·E)）
  const adj = new Map();
  for (const [k, v] of graph) adj.set(k, [...v].sort());

  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let idx = 0;

  for (const start of adj.keys()) {
    if (index.has(start)) continue;
    const work = [[start, adj.get(start) || [], 0]];
    index.set(start, idx); low.set(start, idx); idx++;
    stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, succ, i0] = frame;
      let advanced = false;
      for (let i = i0; i < succ.length; i++) {
        const w = succ[i];
        if (!index.has(w)) {
          frame[2] = i + 1;
          index.set(w, idx); low.set(w, idx); idx++;
          stack.push(w); onStack.add(w);
          work.push([w, adj.get(w) || [], 0]);
          advanced = true;
          break;
        }
        if (onStack.has(w)) low.set(node, Math.min(low.get(node), index.get(w)));
      }
      if (advanced) continue;
      if (low.get(node) === index.get(node)) {
        const scc = [];
        for (;;) {
          const w = stack.pop();
          onStack.delete(w);
          scc.push(w);
          if (w === node) break;
        }
        if (scc.length > 1) sccs.push(scc);
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
    }
  }

  sccs.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  return sccs.slice(0, CAPS.CYCLES).map((scc) => {
    const sorted = [...scc].sort();
    return {
      size: scc.length,
      files: sorted.slice(0, CAPS.CYCLE_FILES),
      truncated: scc.length > CAPS.CYCLE_FILES ? `共 ${scc.length} 个文件` : '',
    };
  });
}

// ── 端到端 ──────────────────────────────────────────────────────────────────

/** 一次完整扫描（vfs 已就位时）。两遍分析：先定死文件集合，再做依赖交叉提示。 */
function scanVfs({ vfs, root = '', extraEntries = [], ignorePrefixes = [] }) {
  const model = buildModel({ vfs, root, extraEntries });
  analyze(model, { ignorePrefixes }); // 第一遍：填充 model.deadFiles
  return analyze(model, { ignorePrefixes });
}

// ── 离线自检（零网络零盘：内建虚拟 fixture 验证全管道） ─────────────────────

function selfTest() {
  const vfs = makeVfs(buildFixtureMap());
  const report = scanVfs({ vfs, root: 'fixture', extraEntries: [] });
  const find = (list, path, name) => list.find((x) => x.path === path && (!name || x.name === name));
  const checks = [
    {
      name: '死文件·零引用', expect: 'src/orphan2.ts（无人引用）→ no-importer',
      got: find(report.orphanFiles, 'src/orphan2.ts')?.reason || '未检出',
      ok: find(report.orphanFiles, 'src/orphan2.ts')?.reason === 'no-importer',
    },
    {
      name: '死文件·仅被死文件引用', expect: 'src/orphan.ts（仅被 orphan2 引用）→ only-dead-importers',
      got: find(report.orphanFiles, 'src/orphan.ts')?.reason || '未检出',
      ok: find(report.orphanFiles, 'src/orphan.ts')?.reason === 'only-dead-importers',
    },
    {
      name: '活文件不误报', expect: 'src/used.ts 不在死文件',
      got: find(report.orphanFiles, 'src/used.ts') ? '被误报' : '未误报',
      ok: !find(report.orphanFiles, 'src/used.ts'),
    },
    {
      name: '未使用导出·可删', expect: 'src/used.ts::deadFn → delete',
      got: find(report.unusedExports, 'src/used.ts', 'deadFn')?.suggestion || '未检出',
      ok: find(report.unusedExports, 'src/used.ts', 'deadFn')?.suggestion === 'delete',
    },
    {
      name: '未使用导出·自用去export', expect: 'src/used.ts::innerOnly → unexport',
      got: find(report.unusedExports, 'src/used.ts', 'innerOnly')?.suggestion || '未检出',
      ok: find(report.unusedExports, 'src/used.ts', 'innerOnly')?.suggestion === 'unexport',
    },
    {
      name: 'barrel 消费链', expect: 'src/lib/deep.ts::realValue 经 export* 消费不报',
      got: find(report.unusedExports, 'src/lib/deep.ts', 'realValue') ? '误报' : '未误报',
      ok: !find(report.unusedExports, 'src/lib/deep.ts', 'realValue'),
    },
    {
      name: 'barrel 内死导出仍检出', expect: 'src/lib/deep.ts::unusedDeep 检出',
      got: find(report.unusedExports, 'src/lib/deep.ts', 'unusedDeep')?.suggestion || '未检出',
      ok: !!find(report.unusedExports, 'src/lib/deep.ts', 'unusedDeep'),
    },
    {
      name: '未使用依赖', expect: 'lodash-unused 检出',
      got: report.deps.unused.some((d) => d.name === 'lodash-unused') ? '检出' : '未检出',
      ok: report.deps.unused.some((d) => d.name === 'lodash-unused'),
    },
    {
      name: '配置信号依赖不误报', expect: 'eslint-config-x 不检出（.eslintrc 引用）',
      got: report.deps.unused.some((d) => d.name === 'eslint-config-x') ? '误报' : '未误报',
      ok: !report.deps.unused.some((d) => d.name === 'eslint-config-x'),
    },
    {
      name: '@types 联动', expect: '@types/react 不检出（react 被引用）',
      got: report.deps.unused.some((d) => d.name === '@types/react') ? '误报' : '未误报',
      ok: !report.deps.unused.some((d) => d.name === '@types/react'),
    },
    {
      name: '悬空导入', expect: 'src/used.ts 导入 ./no-such-file 检出',
      got: report.unresolvedImports.some((u) => u.specifier === './no-such-file') ? '检出' : '未检出',
      ok: report.unresolvedImports.some((u) => u.specifier === './no-such-file'),
    },
    {
      name: '循环依赖', expect: 'cycle-a/cycle-b 双文件 SCC',
      got: report.cycles.length ? report.cycles[0].files.join(',') : '未检出',
      ok: report.cycles.length === 1 && report.cycles[0].files.length === 2,
    },
    {
      name: 'import.meta.glob 保守覆盖', expect: 'src/stores/one.ts 不报死',
      got: find(report.orphanFiles, 'src/stores/one.ts') ? '误报' : '未误报',
      ok: !find(report.orphanFiles, 'src/stores/one.ts'),
    },
    {
      name: '动态 import 保守覆盖', expect: 'src/lazy/Widget.tsx 不报死',
      got: find(report.orphanFiles, 'src/lazy/Widget.tsx') ? '误报' : '未误报',
      ok: !find(report.orphanFiles, 'src/lazy/Widget.tsx'),
    },
    {
      name: '入口启发', expect: 'src/main.tsx 经 index.html 识别为入口',
      got: report.meta.entries.some((e) => e.path === 'src/main.tsx') ? '识别' : '未识别',
      ok: report.meta.entries.some((e) => e.path === 'src/main.tsx'),
    },
  ];
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, total: checks.length, failed: failed.length, checks, version: VERSION };
}

/** 自检 fixture（单测共用同一份已知答案） */
function buildFixtureMap() {
  const m = new Map();
  m.set('package.json', JSON.stringify({
    name: 'fixture', version: '1.0.0',
    dependencies: { react: '^18.0.0', 'lodash-unused': '^4.0.0' },
    devDependencies: { typescript: '^5.0.0', 'eslint-config-x': '^1.0.0', '@types/react': '^18.0.0' },
    scripts: { lint: 'eslint .' },
  }));
  m.set('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['src/*'] } } }));
  m.set('.eslintrc.json', JSON.stringify({ extends: 'eslint-config-x' }));
  m.set('index.html', '<html><script type="module" src="/src/main.tsx"></script></html>');
  m.set('src/main.tsx', [
    "import React from 'react';",
    "import { realValue, usedTwice } from './used';",
    "import { realValue as deepReal } from '@/lib';",
    "import type { Shape } from './types';",
    "import './side';",
    "import stores from './stores/registry';",
    "import CycleA from './cycle-a';",
    "const w = () => import('./lazy/Widget');",
    "export default main;",
    "function main() { return React.createElement('div', null, String(stores + usedTwice + CycleA + Shape.x + deepReal + realValue)); }",
  ].join('\n'));
  m.set('src/used.ts', [
    "import { ghost } from './no-such-file';",
    'export const realValue = 1;',
    'export function deadFn() { return 2; }',
    'function innerOnly() { return 3; }',
    'const helper = () => innerOnly();',
    'export { innerOnly };',
    'export const usedTwice = 4;',
    'export const unusedGhost = ghost;',
  ].join('\n'));
  m.set('src/types.ts', 'export interface Shape { x: number }');
  m.set('src/side.ts', "console.log('side effect');");
  m.set('src/lib/index.ts', "export * from './deep';");
  m.set('src/lib/deep.ts', 'export const realValue = 42;\nexport const unusedDeep = 43;');
  m.set('src/stores/registry.ts', "const mods = import.meta.glob('./*.ts'); export default Object.keys(mods).length;");
  m.set('src/stores/one.ts', 'export default 1;');
  m.set('src/stores/two.ts', 'export default 2;');
  m.set('src/lazy/Widget.tsx', 'export default function Widget() { return null; }');
  m.set('src/orphan.ts', 'export const nobody = 1;');
  m.set('src/orphan2.ts', "import { nobody } from './orphan'; export const meToo = nobody;");
  m.set('src/cycle-a.ts', "import B from './cycle-b'; export default { a: 1, getB: B };");
  m.set('src/cycle-b.ts', "import A from './cycle-a'; export default { b: A };");
  return m;
}

module.exports = {
  VERSION, CAPS, SKIP_DIRS, SKIP_FILES, SRC_EXTS, ASSET_EXTS,
  toPosix, extOf, makeVfs, makeFsVfs, parseModule, parseTsconfig, globToRe,
  resolveSpecifier, buildModel, guessEntries, analyze, scanVfs, selfTest, buildFixtureMap,
  pkgNameOf, matchAlias,
};
