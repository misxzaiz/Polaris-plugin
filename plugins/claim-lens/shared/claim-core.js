'use strict';
/**
 * claim-core.js —— AI 声明提取引擎（纯函数，三端同源：面板 / 服务 / MCP）
 *
 * 零 node 内置依赖（会被 esbuild 打进面板 browser bundle —— exec-sandbox 实证纪律）。
 * 职责：把一段 AI 回答文本解析成「可证伪声明清单」。五类：
 *   file     文件路径声明（含裸文件名，如 `tsconfig.json`）
 *   symbol   符号声明（函数/类/常量；file 定位或全库 grep）
 *   package  依赖声明（import/require/包管理器安装行）
 *   cli      命令/flag 声明（代码块命令行 + 句内 flag）
 *   config   配置键声明（点路径；尽量挂上同句配置文件）
 *   version  运行时版本声明（Node >= 18 等）
 *
 * 提取纪律（假阳性控制）：
 *   - 代码块与反引号 span 是高精度信号源；裸 prose 不做无上下文的路径/符号猜测。
 *   - 全库符号（file=null）的裁决上限是「unverifiable/partial/verified」，绝不 refuted
 *     （可能是全局/第三方 API）——refuted 只在有硬证据（文件存在但无此符号等）时给出。
 */

const VERDICTS = ['verified', 'refuted', 'partial', 'unverifiable'];

const VERDICT_LABEL = {
  verified: '✓ 已证实',
  refuted: '✗ 已证伪',
  partial: '◐ 部分核实',
  unverifiable: '? 无法核验',
};

// 提取词表（比执行 allowlist 宽：词表外命令提取为声明，但执行端按 allowlist 判 unverifiable）
const CLI_KNOWN = new Set([
  'git', 'npm', 'pnpm', 'yarn', 'node', 'deno', 'bun', 'npx', 'tsc', 'vite', 'webpack', 'eslint', 'prettier',
  'cargo', 'rustc', 'rustup', 'go', 'python', 'python3', 'pip', 'pip3', 'uv', 'poetry',
  'docker', 'kubectl', 'helm', 'make', 'cmake', 'curl', 'wget', 'ssh', 'scp',
  'jest', 'vitest', 'pytest', 'gradle', 'mvn', 'dotnet', 'java', 'javac',
  'code', 'rg', 'grep', 'find', 'sed', 'awk', 'chmod', 'tar', 'zip', 'unzip',
]);

// 包管理器安装动作（→ package 声明）
const PKG_INSTALL = new Set(['install', 'i', 'add', 'install-save', 'save']);

// node 内置模块（require/import 这些不算依赖声明）
const NODE_BUILTIN = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util', 'child_process', 'stream',
  'zlib', 'events', 'buffer', 'process', 'querystring', 'string_decoder', 'timers', 'tls', 'net', 'dns', 'readline', 'assert', 'worker_threads', 'perf_hooks', 'v8', 'vm', 'cluster', 'dgram', 'domain', 'module', 'repl', 'inspector', 'async_hooks', 'http2', 'constants', 'punycode', 'sys', 'tty', 'vhs',
]);

const FILE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'py', 'pyi', 'rs', 'go', 'java', 'kt', 'kts', 'rb', 'php',
  'cs', 'cpp', 'cc', 'c', 'h', 'hpp', 'hh', 'swift', 'dart', 'scala', 'vue', 'svelte', 'astro',
  'md', 'mdx', 'txt', 'json', 'jsonc', 'json5', 'ya', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'lock',
  'css', 'scss', 'sass', 'less', 'html', 'htm', 'xml', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'psm1',
  'sql', 'proto', 'graphql', 'gql', 'prisma', 'dockerfile', 'gitignore', 'editorconfig', 'csv', 'tsv',
]);

const CONFIG_EXT = new Set(['json', 'jsonc', 'json5', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties']);

const MAX_CLAIMS = 200;
const MAX_TEXT = 2 * 1024 * 1024;

const isStr = (v) => typeof v === 'string';

// ── 基础工具 ────────────────────────────────────────────────────────────────

function extOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function baseName(p) {
  const s = String(p).replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}

/** 任意 JS/TS/Py/Rust/Go 标识符正则源（转义安全，符号名先经此校验） */
function safeIdentSrc(name) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
  return name.replace(/\$/g, '\\$');
}

/** 句子切分（中英标点 + 换行；保留索引） */
function splitSentences(text) {
  const out = [];
  const re = /[^。；;;\n]+[。；;;\n]?/g;
  let m;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: m[0], start: idx });
    idx += m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function lineAt(text, charIdx) {
  let line = 1;
  for (let i = 0; i < charIdx && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

// ── 声明收集器（去重 + 上限）────────────────────────────────────────────────

function createCollector() {
  const seen = new Map();
  const claims = [];
  function add(c) {
    if (claims.length >= MAX_CLAIMS) return false;
    const key = `${c.type}|${c.target || ''}|${c.file || ''}|${(c.flags || []).join(' ')}|${c.constraint || ''}`;
    if (seen.has(key)) {
      const prev = seen.get(key);
      if (c.quote && !prev.quote) prev.quote = c.quote; // 补证据引文
      return false;
    }
    seen.set(key, c);
    claims.push(c);
    return true;
  }
  return { add, claims };
}

// ── token 分类（反引号 span / 路径 token）──────────────────────────────────

function isFilePathToken(tok) {
  const t = tok.replace(/\\/g, '/');
  if (!t || t.includes('://') || t.includes('..') || /\s/.test(t)) return false;
  // 域名守卫：example.com/a.json 是 URL 不是文件（TLD 白名单式排除）
  if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|dev|cn|edu|gov|me|app|co|ai|info|xyz|sh|so)(?:\/|$)/i.test(t)) return false;
  const ext = extOf(baseName(t));
  if (!ext || !FILE_EXT.has(ext)) return false;
  if (t.includes('/')) return true; // 带目录 → 路径
  // 裸文件名：需「名字.扩展名」整体像文件（排除句子缩写 e.g. 等）
  return /^[A-Za-z0-9][A-Za-z0-9_.\-]*$/.test(baseName(t));
}

/** 反引号 token 分类 → 声明候选（可能 null） */
function classifyBacktickToken(tok, ctx) {
  const t = tok.trim();
  if (!t || t.length > 200) return null;
  if (t.startsWith('!--') || /\s/.test(t)) {
    if (/\s/.test(t)) return null;
  }
  // flag：--xxx / -x
  if (/^--[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t) || /^-[A-Za-z]$/.test(t)) {
    return { type: 'cli', target: ctx.cmd || null, flags: [t], raw: t };
  }
  // 路径/文件名
  if (isFilePathToken(t)) {
    const ext = extOf(baseName(t));
    return { type: 'file', target: t, raw: t, configish: CONFIG_EXT.has(ext) };
  }
  // 配置点路径（2+ 段全标识符）→ config
  if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(t) && !isFilePathToken(t)) {
    return { type: 'config', target: t, raw: t };
  }
  // 符号：ident() 或含驼峰/下划线的标识符（≥4 字符，非全大写缩写）
  const mParen = /^([A-Za-z_$][A-Za-z0-9_$]*)\(\)$/.exec(t);
  if (mParen) return { type: 'symbol', target: mParen[1], raw: t };
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t) && t.length >= 4) {
    const hasCamel = /[a-z][A-Z]/.test(t);
    const hasSnake = /[a-z0-9]_/i.test(t);
    const isUpperAbbrev = /^[A-Z0-9_]+$/.test(t);
    if ((hasCamel || hasSnake || /^[A-Z][a-z]/.test(t)) && !isUpperAbbrev) {
      return { type: 'symbol', target: t, raw: t };
    }
  }
  return null;
}

/** 命令行 token 解析：返回 {cmd, subcmd[], flags[], pkgSpecs[]} */
function parseCommandLine(line) {
  const raw = line.trim().replace(/^\$\s*/, '');
  // 去 env 前缀 / sudo
  let toks = raw.split(/\s+/).filter(Boolean);
  while (toks.length && /^(?:sudo|env|NO_COLOR=1|NODE_ENV=\w+)$/i.test(toks[0])) toks = toks.slice(1);
  while (toks.length && /^[A-Z_]+=\S+$/.test(toks[0])) toks = toks.slice(1);
  if (!toks.length) return null;
  const cmd = toks[0];
  if (!CLI_KNOWN.has(cmd)) return null;
  const rest = toks.slice(1);
  const subcmd = [];
  const flags = [];
  const pkgSpecs = [];
  for (const tk of rest) {
    if (/^--[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tk) || /^-[A-Za-z]$/.test(tk)) {
      flags.push(tk);
      continue;
    }
    if (!/^[A-Za-z@][A-Za-z0-9@/._-]*$/.test(tk)) continue; // 含怪字符的 token 不收
    if (PKG_INSTALL.has(subcmd[0] || '') && cmd && ['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) {
      // install 动词之后的非 flag token 一律是包名（-D/-g 是布尔 flag，不吃参数）
      pkgSpecs.push(tk);
      continue;
    }
    if (flags.length === 0 && subcmd.length < 2) {
      subcmd.push(tk);
      continue;
    }
  }
  return { cmd, subcmd, flags, pkgSpecs };
}

function pkgFromSpec(spec) {
  let s = spec.replace(/^(https?:\/\/[^/]+\/)/, ''); // git/url 简化
  if (s.includes(':')) return null; // npm 包名不含冒号：node:fs / git+ssh: 类一律拒绝
  s = s.split('@').length && s.startsWith('@')
    ? (() => { const i = s.indexOf('@', 1); return i === -1 ? s : s.slice(0, i); })()
    : s.split('@')[0];
  if (!s || s.startsWith('.') || s.startsWith('/') || s.startsWith('~')) return null;
  if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(s)) return null;
  return s;
}

function pkgFromImport(spec) {
  if (!isStr(spec) || !spec) return null;
  if (spec.startsWith('node:')) return null;
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~/')) return null;
  let base = spec;
  if (spec.startsWith('@')) {
    const i = spec.indexOf('/', 1);
    if (i === -1) return null;
    base = spec.slice(0, spec.indexOf('/', i + 1) === -1 ? spec.length : spec.indexOf('/', i + 1));
  } else {
    base = spec.split('/')[0];
  }
  if (NODE_BUILTIN.has(base)) return null;
  if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(base)) return null;
  return base;
}

// ── 主提取 ──────────────────────────────────────────────────────────────────

function extractClaims(text, opts) {
  const options = opts || {};
  const src = isStr(text) ? text.slice(0, MAX_TEXT) : '';
  const col = createCollector();
  if (!src.trim()) return { claims: col.claims, stats: { chars: 0, codeBlocks: 0 } };

  // 1) 分割代码块
  const blocks = [];
  const lines = src.split('\n');
  let inCode = false;
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(```|~~~)\s*([A-Za-z0-9+#-]*)\s*$/.exec(lines[i]);
    if (fence) {
      if (inCode && cur) { cur.end = i; blocks.push(cur); cur = null; }
      else if (!inCode) { cur = { lang: (fence[2] || '').toLowerCase(), start: i + 1, lines: [] }; inCode = true; continue; }
      inCode = cur ? true : false;
      if (cur) continue;
      continue;
    }
    if (inCode && cur) cur.lines.push({ no: i + 1, text: lines[i] });
  }
  if (cur) blocks.push(cur);

  const proseLines = [];
  {
    let bi = 0;
    for (let i = 0; i < lines.length; i++) {
      while (bi < blocks.length && blocks[bi].end === i) bi++;
      const inBlock = blocks.some((b) => i >= b.start && (b.end == null || i <= b.end) && i !== b.start - 1);
      if (!inBlock) proseLines.push({ no: i + 1, text: lines[i] });
    }
  }

  // 2) 代码块内：import/命令/路径
  for (const b of blocks) {
    for (const ln of b.lines) {
      const t = ln.text.trim();
      if (!t) continue;
      // 包导入
      const importRe = /(?:import\s[^'"]*?from\s*|import\s+|export\s+[^'"]*?from\s*|require\s*\(\s*|from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
      let im;
      const isPy = b.lang === 'python' || b.lang === 'py';
      while ((im = importRe.exec(t)) !== null) {
        const spec = im[1];
        const isPyStyle = isPy || /^\s*from\s/.test(t);
        const pkg = isPyStyle ? pyPkgFromSpec(spec) : pkgFromImport(spec);
        if (pkg) {
          col.add({ type: 'package', target: pkg, raw: spec, quote: t, line: ln.no, source: 'code' });
        }
      }
      // 命令行（非 import 行）
      if (!/^(?:import|export|from|require|const|let|var)\b/.test(t)) {
        const cmdParsed = parseCommandLine(t);
        if (cmdParsed) {
          col.add({
            type: 'cli', target: cmdParsed.cmd, subcmd: cmdParsed.subcmd, flags: cmdParsed.flags,
            raw: t, quote: t, line: ln.no, source: 'code',
          });
          for (const spec of cmdParsed.pkgSpecs) {
            const pkg = pkgFromSpec(spec);
            if (pkg) col.add({ type: 'package', target: pkg, raw: spec, quote: t, line: ln.no, source: 'code' });
          }
        }
      }
      // 代码里的路径 token（lookbehind：排除紧跟 : / \w 的命中——URL 场景 https://x.com/a.json）
      const pathRe = /(?<![:/\w.])(?:[A-Za-z]:\\(?:[A-Za-z0-9_.\- \\]+)?|[\w@.-]+(?:\/[\w@.-]+)+\.[A-Za-z0-9]{1,6})/g;
      let pm;
      while ((pm = pathRe.exec(t)) !== null) {
        if (isFilePathToken(pm[0])) {
          col.add({ type: 'file', target: pm[0], raw: pm[0], quote: t, line: ln.no, source: 'code' });
        }
      }
    }
  }

  // 3) prose：反引号 token 分类（带句内上下文）
  const proseText = proseLines.map((l) => l.text).join('\n');
  const sentences = splitSentences(proseText);
  const btRe = /`([^`\n]{1,200})`/g;
  let bt;
  while ((bt = btRe.exec(proseText)) !== null) {
    const tok = bt[1];
    const charIdx = bt.index;
    const line = lineAt(proseText, charIdx);
    const sent = sentences.find((s) => charIdx >= s.start && charIdx < s.start + s.text.length) || { text: '' }; // 句界开区间：边界索引归下一句（off-by-one 实证）
    // 反引号 span 本身是 import/require 语句 → package 声明（prose 高频形态：`import { z } from "zod"`）
    if (/import|require|from\s+['"]/.test(tok)) {
      const importRe2 = /(?:import\s[^'"]*?from\s*|import\s+|require\s*\(\s*|from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
      let im2;
      while ((im2 = importRe2.exec(tok)) !== null) {
        const pkg = pkgFromImport(im2[1]);
        if (pkg) col.add({ type: 'package', target: pkg, raw: tok, quote: tok, line, source: 'prose' });
      }
    }
    // scoped 包（@x/y）或句中有依赖语境的裸包名 → package 声明
    // 文件路径 token 优先排除（src/auth.ts 不是 'src' 包）
    const pkgCandidate = pkgFromImport(tok);
    if (pkgCandidate && !isFilePathToken(tok) && (tok.startsWith('@') || /安装|依赖|导入|import|require|package|安装包|npm|pnpm/.test(sent.text))) {
      col.add({ type: 'package', target: pkgCandidate, quote: tok, line, source: 'prose' });
      continue;
    }
    // 反引号 span 是整条命令（prose 高频形态：`git switch --orphan` 可行）→ cli 声明
    if (/\s/.test(tok)) {
      const cmdParsed = parseCommandLine(tok);
      if (cmdParsed) {
        col.add({
          type: 'cli', target: cmdParsed.cmd, subcmd: cmdParsed.subcmd, flags: cmdParsed.flags,
          raw: tok, quote: tok, line, source: 'prose',
        });
        for (const spec of cmdParsed.pkgSpecs) {
          const pkg = pkgFromSpec(spec);
          if (pkg) col.add({ type: 'package', target: pkg, raw: spec, quote: tok, line, source: 'prose' });
        }
        continue;
      }
    }
    // 句内命令上下文（给孤 flag 归属）
    const cmdInSentence = /(?:^|[^`\w])(git|npm|pnpm|yarn|node|cargo|python3?|docker|kubectl|go|pip3?)\b/.exec(sent.text);
    // 句内配置文件（给 config 键挂文件）
    const cfgFileInSentence = /([\w@./\\-]+\.(?:json|jsonc|ya?ml|toml|ini|cfg|conf|env))\b/i.exec(sent.text);
    const cls = classifyBacktickToken(tok, { cmd: cmdInSentence ? cmdInSentence[1] : null });
    if (!cls) continue;
    if (cls.type === 'config' && cfgFileInSentence) cls.file = cfgFileInSentence[1];
    if (cls.type === 'symbol') {
      const fileInSentence = /([\w@./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|cs|vue|svelte))\b/i.exec(sent.text);
      if (fileInSentence) cls.file = fileInSentence[1];
    }
    col.add({ ...cls, quote: tok, line, source: 'prose' });
  }

  // 4) 版本声明：Node/npm/python... >= 18.x（Node(?:\.?js)? —— \.?js? 写法会让 j 必选，裸 Node 永不命中）
  const verRe = /\b(Node(?:\.?js)?|npm|pnpm|python3?|git|cargo|rustc|docker|kubectl|go(?:lang)?|deno|bun)\s*(?:版本\s*)?(?:>=|≥|以上|v|版本)?\s*v?(\d{1,3}(?:\.\d{1,3}){0,2})/gi;
  let vm;
  while ((vm = verRe.exec(proseText)) !== null) {
    const word = vm[1].toLowerCase();
    const cmd = word === 'nodeljs' || word === 'nodel' ? 'node' : word.replace('golang', 'go');
    col.add({ type: 'version', target: cmd, constraint: vm[2], raw: vm[0], line: lineAt(proseText, vm.index), source: 'prose' });
  }

  // 5) prose 里的裸路径（带目录分隔符的才收；裸文件名只在反引号里收；lookbehind 排除 URL）
  const pathRe = /(?<![:/\w.])(?:[A-Za-z]:\\(?:[A-Za-z0-9_.\- \\]+)?|[\w@.-]+(?:\/[\w@.-]+)+\.[A-Za-z0-9]{1,6})/g;
  let pm2;
  while ((pm2 = pathRe.exec(proseText)) !== null) {
    if (isFilePathToken(pm2[0])) {
      col.add({ type: 'file', target: pm2[0], raw: pm2[0], line: lineAt(proseText, pm2.index), source: 'prose' });
    }
  }

  // 6) 顺序整理 + id
  const order = { file: 0, symbol: 1, package: 2, cli: 3, config: 4, version: 5 };
  col.claims.sort((a, b) => (order[a.type] - order[b.type]) || String(a.target).localeCompare(String(b.target)));
  col.claims.forEach((c, i) => { c.id = i + 1; });

  return { claims: col.claims, stats: { chars: src.length, codeBlocks: blocks.length } };
}

function pyPkgFromSpec(spec) {
  if (!spec || spec.startsWith('.')) return null;
  const base = spec.split('/')[0].split('.')[0];
  if (!base || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) return null;
  return base;
}

// ── 外部声明输入的校验（claim_verify_batch / 服务 /api 用）──────────────────

const CLAIM_TYPES = new Set(['file', 'symbol', 'package', 'cli', 'config', 'version']);

/** 校验并归一化一条外部声明；不合法抛 {user:true} 错误 */
function normalizeClaim(raw, idx) {
  const c = raw && typeof raw === 'object' ? raw : {};
  if (!CLAIM_TYPES.has(c.type)) fail(`claims[${idx}].type 必须是 ${[...CLAIM_TYPES].join('/')} 之一`);
  const target = isStr(c.target) ? c.target.trim() : '';
  if (!target) fail(`claims[${idx}].target 不能为空`);
  const out = {
    type: c.type,
    target: target.slice(0, 400),
    file: isStr(c.file) && c.file.trim() ? c.file.trim().slice(0, 400) : null,
    subcmd: Array.isArray(c.subcmd) ? c.subcmd.filter(isStr).map((s) => String(s).trim()).filter(Boolean).slice(0, 3) : [],
    flags: Array.isArray(c.flags) ? c.flags.filter(isStr).map((s) => String(s).trim()).filter(Boolean).slice(0, 8) : [],
    constraint: isStr(c.constraint) ? c.constraint.trim().slice(0, 40) : null,
    quote: isStr(c.quote) ? c.quote.slice(0, 300) : '',
    id: idx + 1,
  };
  if (c.type === 'symbol' && !safeIdentSrc(out.target)) fail(`claims[${idx}].target 不是合法标识符: ${out.target}`);
  if (c.type === 'package' && !pkgFromImport(out.target) && !pkgFromSpec(out.target)) fail(`claims[${idx}].target 不是合法包名: ${out.target}`);
  if (c.type === 'cli' && !/^[a-z][a-z0-9._-]*$/i.test(out.target)) fail(`claims[${idx}].target 不是合法命令名: ${out.target}`);
  if (c.type === 'version' && !/^\d{1,3}(\.\d{1,3}){0,2}$/.test(out.constraint || '')) fail(`claims[${idx}].constraint 必须是 x.y.z 形式`);
  if (c.type === 'config') {
    const segs = out.target.split('.');
    if (segs.length < 1 || !segs.every((s) => /^[A-Za-z0-9_$-]+$/.test(s))) fail(`claims[${idx}].target 必须是点路径: ${out.target}`);
  }
  if (c.type === 'file' && (out.target.includes('..') || out.target.includes('://'))) fail(`claims[${idx}].target 疑似路径穿越/URL: ${out.target}`);
  return out;
}

function fail(msg) {
  const e = new Error(msg);
  e.user = true;
  throw e;
}

/** 批量输入归一化（数组 + 上限 + 全部 normalizeClaim） */
function normalizeClaims(list) {
  if (!Array.isArray(list)) fail('claims 必须是数组');
  if (list.length === 0) fail('claims 为空');
  if (list.length > 300) fail('单次核验声明数 ≤ 300');
  return list.map((c, i) => normalizeClaim(c, i));
}

// ── 报告格式化（人类可读；MCP 与服务共用同一权威）───────────────────────────

function formatReport(report) {
  const L = [];
  const s = report.summary;
  L.push(`核验报告 —— ${report.root}`);
  L.push(`共 ${s.total} 条声明：${VERDICT_LABEL.verified} ${s.verified} · ${VERDICT_LABEL.refuted} ${s.refuted} · ${VERDICT_LABEL.partial} ${s.partial} · ${VERDICT_LABEL.unverifiable} ${s.unverifiable}`);
  if (report.gitStatusNote) L.push(`git status：${report.gitStatusNote}`);
  L.push('');
  for (const c of report.claims) {
    const loc = c.file ? ` @${c.file}` : '';
    L.push(`[${VERDICT_LABEL[c.verdict]}] #${c.id} ${c.type}: ${c.target}${loc}${(c.flags || []).length ? ' ' + c.flags.join(' ') : ''}${c.constraint ? ' (>= ' + c.constraint + ')' : ''}`);
    if (c.quote) L.push(`    原文: ${c.quote.length > 120 ? c.quote.slice(0, 117) + '…' : c.quote}`);
    for (const ev of c.evidence || []) L.push(`    证据: ${ev}`);
    if (c.hint) L.push(`    说明: ${c.hint}`);
  }
  return L.join('\n');
}

function summarize(claims) {
  const s = { total: claims.length, verified: 0, refuted: 0, partial: 0, unverifiable: 0 };
  for (const c of claims) s[c.verdict] = (s[c.verdict] || 0) + 1;
  return s;
}

module.exports = {
  VERDICTS, VERDICT_LABEL, CLI_KNOWN, NODE_BUILTIN, FILE_EXT, CONFIG_EXT,
  extractClaims, normalizeClaim, normalizeClaims, formatReport, summarize,
  isFilePathToken, classifyBacktickToken, parseCommandLine, pkgFromImport, pkgFromSpec, safeIdentSrc,
  MAX_CLAIMS,
};
