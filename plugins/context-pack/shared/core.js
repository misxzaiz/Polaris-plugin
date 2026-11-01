'use strict';
/**
 * core.js —— 上下文打包台业务核（纯函数；service 与 mcp 两侧复用，单测全覆盖）
 *
 * 职责：忽略引擎（内置默认 + .gitignore 子集 + 用户追加）、二进制判定、
 * token 估算（启发式，如实标注）、目录扫描（流式 + 护栏）、树渲染、
 * 上下文包格式化（XML / Markdown）、仓库元信息（读 .git 文件，不依赖 git 二进制）、
 * 预算裁剪、kv 分块序列化。
 *
 * 设计边界：
 *   - 不碰网络、不碰 kv；输入输出全部纯数据（service/mcp 负责副作用）。
 *   - token 估算为启发式（ascii/4 + 非 ascii×0.7 + 行开销），精度目标 ±20%，
 *     所有 UI/输出必须携带「估算」字样，不得宣称精确。
 *   - .gitignore 支持实用子集：注释/空行/`!` 否定/尾 `/` 目录/`*` `?` `**`/前导 `/` 锚定。
 *     已忽略目录整体剪枝（不做「忽略目录内再否定」的 git 冷僻语义，见 README 已知边界）。
 */
const path = require('path');
const fs = require('fs');

const VERSION = '0.1.0';

// ── 常量 ───────────────────────────────────────────────────────────────────
/** 内置默认忽略（目录名或 glob；始终生效，用户可在设置追加但无法关闭 .git/node_modules） */
const ALWAYS_IGNORE = ['.git', 'node_modules'];
/** 默认忽略（构建产物/依赖缓存类；.gitignore 未覆盖时兜底） */
const DEFAULT_IGNORES = [
  'dist', 'build', 'out', 'target', '__pycache__', '.next', '.nuxt',
  'coverage', '.venv', 'venv', 'env', '.idea', '.gradle', 'bin', 'obj',
  '.turbo', '.cache', 'vendor',
];
const DEFAULT_FILE_IGNORES = ['*.pyc', '*.class', '*.o', '*.so', '*.dll', '*.exe', '.DS_Store', 'Thumbs.db'];
const LOCKFILE_PATTERNS = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'poetry.lock', 'composer.lock', 'Gemfile.lock'];

const TEXT_EXTS = new Set(([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'md', 'mdx', 'txt', 'css', 'scss', 'less',
  'html', 'htm', 'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'swift',
  'sql', 'graphql', 'gql', 'vue', 'svelte', 'astro', 'dart', 'lua', 'pl', 'r', 'bat', 'ps1',
  'gitignore', 'gitattributes', 'editorconfig', 'env', 'properties', 'lock', 'proto', 'csv', 'tsv',
  'dockerfile', 'makefile', 'cmake', 'npmrc', 'babelrc', 'eslintrc', 'prettierrc',
]).map((e) => e.toLowerCase()));
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tif', 'tiff', 'avif',
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'mp4', 'avi', 'mkv', 'mov', 'webm',
  'zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz', 'zst',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'wasm', 'node', 'pdb', 'dylib', 'jar', 'pyd', 'class',
  'db', 'sqlite', 'sqlite3', 'mdb', 'bin', 'dat', 'iso', 'dmg', 'msi',
]);

const MAX_TREE_LINES = 2000;         // 目录树渲染上限（超出截断注记）
const SNIFF_BYTES = 8192;            // 二进制嗅探读取字节数

// ── 工具 ───────────────────────────────────────────────────────────────────
/** 统一为 posix 风格相对路径（Windows 反斜杠 → /） */
function toPosix(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isBinaryExt(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!ext) {
    // 无扩展名的常见文本文件名
    const base = path.basename(name).toLowerCase();
    if (['dockerfile', 'makefile', 'license', 'readme', 'changelog', '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.nvmrc', '.env'].includes(base) || base.startsWith('.env')) return false;
    return false; // 无扩展名不判二进制，交给嗅探
  }
  return BINARY_EXTS.has(ext);
}

/** 前 SNIFF_BYTES 字节嗅探：NUL 字节即二进制；控制字符（除 \t\n\r）占比 > 10% 判二进制 */
function sniffBinary(buf) {
  const n = Math.min(buf.length, SNIFF_BYTES);
  if (n === 0) return false;
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32)) ctrl++;
  }
  return ctrl / n > 0.1;
}

/**
 * token 估算（启发式）：
 *   ascii 字符 ≈ 4 字符/token；CJK 等非 ascii ≈ 0.7 token/字符；另加行结构开销。
 * 精度目标 ±20%（对标 GPT 系 tokenizer 的混合语料经验值），只用于预算决策。
 */
function estimateTokens(text) {
  if (!text) return 0;
  const s = typeof text === 'string' ? text : String(text);
  let ascii = 0;
  let nonAscii = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 128) ascii++;
    else nonAscii++;
  }
  const lines = (s.match(/\n/g) || []).length + 1;
  return Math.ceil(ascii / 4 + nonAscii * 0.7 + lines * 0.1);
}

/** 由文件大小粗估（不读内容时兜底；按 ascii 均值 4.2 B/token 保守折算） */
function estimateTokensFromSize(size) {
  return Math.ceil(size / 4.2);
}

function fmtBytes(n) {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ── 忽略引擎 ───────────────────────────────────────────────────────────────
/**
 * 把一行 .gitignore 规则编译为 { negate, dirOnly, anchored, re }；无法解析返回 null。
 * glob 语义：`**` 跨段、`*` `?` 段内；含非前导 `/` 视为锚定（相对 .gitignore 所在目录）。
 */
function compileIgnoreLine(raw) {
  let line = raw.replace(/\r$/, '');
  if (!line.trim() || line.trim().startsWith('#')) return null;
  let negate = false;
  if (line.startsWith('!')) { negate = true; line = line.slice(1); }
  // 尾随空格按 git 规则剥离（除非转义——本子集不处理转义空格）
  line = line.replace(/\s+$/, '');
  if (!line) return null;
  let dirOnly = false;
  if (line.endsWith('/')) { dirOnly = true; line = line.slice(0, -1); }
  let anchored = false;
  if (line.startsWith('/')) { anchored = true; line = line.slice(1); }
  else if (line.includes('/')) anchored = true; // 含非前导斜杠 → 相对锚定
  if (!line) return null;
  const re = globToRegex(line, anchored);
  if (!re) return null;
  return { negate, dirOnly, anchored, re, src: raw };
}

function globToRegex(glob, anchored) {
  try {
    let re = '';
    let i = 0;
    while (i < glob.length) {
      const c = glob[i];
      if (c === '*') {
        if (glob[i + 1] === '*') {
          // `**` ：跨段。允许 `**/`、`/**`、`/**/`
          if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 3; continue; }
          re += '.*'; i += 2; continue;
        }
        re += '[^/]*'; i++; continue;
      }
      if (c === '?') { re += '[^/]'; i++; continue; }
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
    // dirOnly 的匹配由调用方处理（目录本身 + 前缀）；此处匹配完整段路径
    return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${re}$`);
  } catch (_) {
    return null;
  }
}

/**
 * 构建忽略引擎。规则来源（优先级从低到高，git 语义「后匹配者优先」）：
 *   1. 内置 ALWAYS_IGNORE（.git / node_modules —— 不可关）
 *   2. 内置 DEFAULT_IGNORES + DEFAULT_FILE_IGNORES
 *   3. lockfile（includeLockfiles=false 时启用，默认忽略锁文件）
 *   4. 用户设置 ignoreExtra（每行一条，同 gitignore 语法）
 *   5. 各级 .gitignore 文件（scanDirectory 按目录深度并入，更深者优先）
 */
function createIgnoreEngine(opts) {
  const o = opts || {};
  const lines = [];
  for (const p of ALWAYS_IGNORE) lines.push(p);
  for (const p of DEFAULT_IGNORES) lines.push(p);
  for (const p of DEFAULT_FILE_IGNORES) lines.push(p);
  if (!o.includeLockfiles) for (const p of LOCKFILE_PATTERNS) lines.push(p);
  for (const l of String(o.extraIgnores || '').split('\n')) lines.push(l);
  const rules = lines.map(compileIgnoreLine).filter(Boolean);
  return {
    /** 判定一个 posix 相对路径；isDir 影响尾 `/` 目录规则。matches 数组=该目录已并入的 .gitignore 规则（更深者在前） */
    ignored(relPath, isDir, gitRules) {
      const p = toPosix(relPath);
      if (!p) return false;
      const all = gitRules && gitRules.length ? gitRules.concat(rules) : rules;
      // 候选：完整路径 + 各祖先目录前缀（git 语义：模式可命中父目录）
      const segs = p.split('/');
      const candidates = [];
      for (let i = 1; i <= segs.length; i++) {
        const sub = segs.slice(0, i).join('/');
        const isDirCandidate = i < segs.length || isDir;
        candidates.push({ p: sub, isDir: isDirCandidate });
        if (i === segs.length) break;
      }
      let result = false;
      for (const r of all) {
        for (const cand of candidates) {
          if (r.dirOnly && !cand.isDir) continue;
          if (r.re.test(cand.p)) { result = !r.negate; break; }
        }
      }
      return result;
    },
    rulesCount: rules.length,
  };
}

// ── 仓库元信息（读 .git 文件，不依赖 git 二进制）────────────────────────────
function readGitMeta(root) {
  try {
    const headPath = path.join(root, '.git', 'HEAD');
    const head = fs.readFileSync(headPath, 'utf8').trim();
    let branch = null;
    let commit = null;
    const m = head.match(/^ref:\s*(.+)$/);
    if (m) {
      branch = m[1].replace(/^refs\/heads\//, '');
      const refPath = path.join(root, '.git', ...m[1].split('/'));
      try {
        commit = fs.readFileSync(refPath, 'utf8').trim() || null;
      } catch (_) {
        // packed-refs 兜底
        try {
          const packed = fs.readFileSync(path.join(root, '.git', 'packed-refs'), 'utf8');
          const line = packed.split('\n').find((l) => l.trim().endsWith(` ${m[1]}`));
          if (line) commit = line.split(' ')[0].trim();
        } catch (_2) { /* 无 commit 信息，允许 */ }
      }
    } else if (/^[0-9a-f]{7,40}$/i.test(head)) {
      commit = head; // detached HEAD
    }
    return { branch, commit: commit ? commit.slice(0, 12) : null };
  } catch (_) {
    return null; // 非仓库或不可读 —— 允许，不视为错误
  }
}

// ── 目录扫描（流式 + 护栏）─────────────────────────────────────────────────
/**
 * 扫描目录 → { entries, stats }。
 * entries 行格式（紧凑数组，直接用于 kv 分块）：
 *   [relPath(posix), isDir(0/1), size, tokens, flags]
 *   flags 字符串：'b'=二进制 'L'=超单文件上限 'T'=内容截断估算 'I'=被忽略(仅 emitIgnored 时出现)
 * opts: { includeLockfiles, extraIgnores, maxFileKb(默认512), maxFiles(默认20000), emitIgnored }
 * onProgress({ files, dirs, bytes }) 每 ~200 文件回调一次。
 */
async function scanDirectory(root, opts, onProgress) {
  const o = opts || {};
  const maxFileKb = Number.isFinite(o.maxFileKb) && o.maxFileKb > 0 ? o.maxFileKb : 512;
  const maxFiles = Number.isFinite(o.maxFiles) && o.maxFiles > 0 ? o.maxFiles : 20000;
  const engine = createIgnoreEngine(o);
  const entries = [];
  const stats = { fileCount: 0, dirCount: 0, totalBytes: 0, totalTokens: 0, skipped: 0, truncated: false, ignored: 0 };
  let sinceYield = 0;

  const fsPromises = fs.promises;

  /** 读目录栈项：{ abs, rel, rules }（rules=该目录 .gitignore 编译结果，前缀相对其所在目录） */
  async function readGitignore(absDir, relPrefix) {
    try {
      const raw = await fsPromises.readFile(path.join(absDir, '.gitignore'), 'utf8');
      const compiled = [];
      for (const line of raw.split('\n')) {
        const r = compileIgnoreLine(line);
        if (!r) continue;
        // 规则相对其所在目录：把「未锚定」规则转成带前缀的锚定规则
        const prefix = relPrefix ? `${relPrefix}/` : '';
        if (r.anchored) {
          compiled.push({ ...r, re: new RegExp(`^${escapeRe(prefix)}${r.re.source.slice(1)}`) });
        } else {
          compiled.push(r); // 未锚定规则可命中任意层级（globToRegex 已带 (?:.*/)? 前缀）
        }
      }
      return compiled;
    } catch (_) {
      return [];
    }
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  async function walk(absDir, relPrefix, parentRules) {
    if (stats.truncated) return;
    let dirents;
    try {
      dirents = await fsPromises.readdir(absDir, { withFileTypes: true });
    } catch (_) {
      stats.skipped++;
      return; // 不可读目录：计 skipped 继续
    }
    const myRules = parentRules.slice();
    const own = await readGitignore(absDir, relPrefix);
    if (own.length) myRules.unshift(...own); // 深度越深优先级越高（unshift 在前）

    for (const de of dirents) {
      if (stats.truncated) return;
      const name = de.name;
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      const isDir = de.isDirectory();
      const isFile = de.isFile();
      if (!isDir && !isFile) { stats.skipped++; continue; } // 符号链接等跳过（防环）
      // 忽略判定（目录可整体剪枝）
      if (engine.ignored(rel, isDir, myRules)) {
        stats.ignored++;
        if (o.emitIgnored && isDir) { /* 忽略目录不入树，仅计数 */ }
        continue;
      }
      if (isDir) {
        stats.dirCount++;
        entries.push([rel, 1, 0, 0, '']);
        sinceYield += 1;
        await walk(path.join(absDir, name), rel, myRules);
        continue;
      }
      // 文件
      let size = 0;
      try {
        const st = await fsPromises.stat(path.join(absDir, name));
        size = st.size;
      } catch (_) { /* stat 失败按 0 处理 */ }
      let flags = '';
      let tokens = 0;
      if (isBinaryExt(name)) {
        flags = 'b';
      } else if (size > maxFileKb * 1024) {
        flags = 'L'; // 超单文件上限：不读内容，按大小粗估
        tokens = estimateTokensFromSize(size);
      } else if (size === 0) {
        tokens = 0;
      } else {
        try {
          const buf = await fsPromises.readFile(path.join(absDir, name));
          if (sniffBinary(buf)) {
            flags = 'b';
          } else {
            const text = buf.toString('utf8');
            tokens = estimateTokens(text);
            if (buf.length >= maxFileKb * 1024) flags = 'T';
          }
        } catch (_) {
          flags = 'b';
        }
      }
      stats.fileCount++;
      stats.totalBytes += size;
      stats.totalTokens += tokens;
      entries.push([rel, 0, size, tokens, flags]);
      sinceYield += 1;
      if (sinceYield >= 200) {
        sinceYield = 0;
        if (onProgress) { try { onProgress({ files: stats.fileCount, dirs: stats.dirCount, bytes: stats.totalBytes }); } catch (_) {} }
        await new Promise((r) => setImmediate(r)); // 让出事件循环，保服务 tick 活着
      }
      if (stats.fileCount >= maxFiles) {
        stats.truncated = true;
        return;
      }
    }
  }

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`目录不存在或不是目录: ${root}`);
  }
  await walk(path.resolve(root), '', []);
  if (onProgress) { try { onProgress({ files: stats.fileCount, dirs: stats.dirCount, bytes: stats.totalBytes }); } catch (_) {} }
  return { entries, stats, engineRules: engine.rulesCount };
}

// ── 树渲染 ────────────────────────────────────────────────────────────────
/** 由 entries 渲染 ASCII 树（含目录折叠结构）；超 MAX_TREE_LINES 行截断注记 */
function renderTree(entries, opts) {
  const o = opts || {};
  const withTokens = o.withTokens !== false;
  const lines = [];
  // entries 已是先序（walk 顺序）；直接渲染
  for (const e of entries) {
    const [rel, isDir, size, tokens] = e;
    const depth = rel.split('/').length - 1;
    const name = rel.split('/').pop();
    const indent = '  '.repeat(depth);
    const isLast = true; // 简化：不画 ├/└ 连线，保持紧凑（大仓可读性优先）
    void isLast;
    if (isDir) {
      lines.push(`${indent}${name}/`);
    } else if (withTokens && tokens > 0) {
      lines.push(`${indent}${name}  (~${tokens} tok)`);
    } else {
      lines.push(`${indent}${name}`);
    }
    void size;
    if (lines.length >= MAX_TREE_LINES) {
      lines.push(`…（树超过 ${MAX_TREE_LINES} 行，已截断。完整结构请看打包文件内的 directory_structure 段）`);
      break;
    }
  }
  return lines.join('\n');
}

// ── 预算裁剪 ──────────────────────────────────────────────────────────────
/**
 * 贪心裁剪到预算：从最大的文件开始排除，直到 tokens ≤ budget。
 * entries 为文件行数组 [rel,0,size,tokens,flags]；返回 { kept, removed, tokens }
 */
function fitToBudget(fileEntries, budget) {
  const files = fileEntries.filter((e) => !e[1]);
  const sorted = files.slice().sort((a, b) => b[3] - a[3]);
  const removed = [];
  let total = files.reduce((s, e) => s + (e[3] || 0), 0);
  let i = 0;
  const kept = new Set(files.map((e) => e[0]));
  while (total > budget && i < sorted.length) {
    const e = sorted[i];
    if ((e[3] || 0) <= 0) { i++; continue; }
    total -= e[3];
    kept.delete(e[0]);
    removed.push([e[0], e[3]]);
    i++;
  }
  return {
    kept: files.filter((e) => kept.has(e[0])).map((e) => e[0]),
    removed,
    tokens: total,
  };
}

// ── 打包 ──────────────────────────────────────────────────────────────────
/**
 * 打包选中文件为上下文包文本。
 * @param root 绝对路径根
 * @param relFiles 选中文件相对路径数组（posix）
 * @param opts { format:'xml'|'md', header, treeText, maxFileKb, gitMeta }
 * @returns { text, stats:{files, bytes, tokens, treeLines, truncatedFiles[]} }
 */
function packBundle(root, relFiles, opts) {
  const o = opts || {};
  const format = o.format === 'md' ? 'md' : 'xml';
  const maxFileKb = Number.isFinite(o.maxFileKb) && o.maxFileKb > 0 ? o.maxFileKb : 512;
  const files = (relFiles || []).map(toPosix).filter(Boolean);
  const truncatedFiles = [];
  const parts = [];
  let bytes = 0;
  let tokens = 0;
  const seen = new Set();
  for (const rel of files) {
    if (seen.has(rel)) continue; // 判重
    seen.add(rel);
    const abs = path.join(root, rel);
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch (e) {
      truncatedFiles.push(rel);
      parts.push(formatFile(format, rel, `（读取失败：${e.code || e.message}）`, true));
      continue;
    }
    if (sniffBinary(buf)) {
      truncatedFiles.push(rel);
      parts.push(formatFile(format, rel, `（二进制文件，不打包内容；大小 ${fmtBytes(buf.length)}）`, true));
      continue;
    }
    let text = buf.toString('utf8');
    if (buf.length > maxFileKb * 1024) {
      text = text.slice(0, maxFileKb * 1024);
      truncatedFiles.push(rel);
      parts.push(formatFile(format, rel, `${text}\n\n（…内容超过单文件上限 ${maxFileKb}KB，已截断。完整文件: ${abs}）`, true));
      bytes += maxFileKb * 1024;
      tokens += estimateTokens(text);
      continue;
    }
    parts.push(formatFile(format, rel, text, false));
    bytes += buf.length;
    tokens += estimateTokens(text);
  }
  const treeText = o.treeText || '';
  const header = buildHeader(root, o);
  const body = parts.join(format === 'md' ? '\n\n' : '\n');
  const text = format === 'md'
    ? `${header}\n\n## 目录结构\n\n\`\`\`\n${treeText}\n\`\`\`\n\n## 文件内容\n\n${body}\n`
    : `${header}\n\n<directory_structure>\n${treeText}\n</directory_structure>\n\n<files>\n${body}\n</files>\n`;
  return {
    text,
    stats: {
      files: seen.size - truncatedFiles.length,
      bytes,
      tokens: tokens + estimateTokens(header) + (treeText ? estimateTokens(treeText) : 0),
      treeLines: treeText ? treeText.split('\n').length : 0,
      truncatedFiles,
    },
  };
}

function buildHeader(root, o) {
  const git = o.gitMeta || readGitMeta(root);
  const lines = [];
  lines.push(o.header || '本文件是代码库上下文打包（由 Polaris 上下文打包台生成）。请基于以下代码回答问题；引用代码时注明文件路径。');
  lines.push('');
  lines.push(`目录: ${root}`);
  if (git && (git.branch || git.commit)) lines.push(`仓库: ${git.branch || '?'}${git.commit ? ` @ ${git.commit}` : ''}`);
  lines.push(`生成时间: ${new Date().toISOString()}`);
  lines.push('注: 文件 token 数为启发式估算（非精确 tokenizer 结果）。');
  return lines.join('\n');
}

function formatFile(format, rel, content, isNote) {
  if (format === 'md') {
    const ext = path.extname(rel).slice(1) || 'text';
    return `### ${rel}\n\n\`\`\`${isNote ? '' : ext}\n${content.replace(/\s+$/, '')}\n\`\`\``;
  }
  return `<file path="${rel}">\n${content.replace(/\s+$/, '')}\n</file>`;
}

// ── kv 分块 ───────────────────────────────────────────────────────────────
/**
 * 校验并过滤 include 文件清单：posix 化、去重、剔除目录/不存在/越界（`..` 或绝对路径）。
 * 返回 { files, rejected }（rejected 为剔除原因摘要，供调用方提示）。
 */
function filterExistingFiles(rootAbs, list, statFn) {
  const st = statFn || ((p) => fs.statSync(p));
  const out = [];
  const rejected = [];
  const seen = new Set();
  for (const raw of (Array.isArray(list) ? list : [])) {
    const rel = toPosix(raw);
    if (!rel) continue;
    if (seen.has(rel)) continue;
    if (rel.split('/').includes('..')) { rejected.push([rel, '非法路径']); continue; }
    if (path.isAbsolute(rel)) { rejected.push([rel, '须为相对路径']); continue; }
    let s = null;
    try { s = st(path.join(rootAbs, rel)); } catch (_) { /* 不存在 */ }
    if (!s || !s.isFile()) { rejected.push([rel, '不存在或不是文件']); continue; }
    seen.add(rel);
    out.push(rel);
    if (out.length >= 20000) break;
  }
  return { files: out, rejected };
}


/** 字符串 → 定长分块（空串返回单块 ['']，保证 chunkCount≥1 语义一致） */
function chunkString(s, size) {
  const out = [];
  const n = Math.max(1, size | 0);
  if (!s) return [''];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

/** entries 行 → kv 文本（每行一个 JSON 数组） */
function serializeEntries(entries) {
  return entries.map((e) => JSON.stringify(e)).join('\n');
}
/** kv 文本 → entries 行（容忍空行/坏行） */
function deserializeEntries(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr) && arr.length >= 4) out.push(arr);
    } catch (_) { /* 坏行跳过 */ }
  }
  return out;
}

module.exports = {
  VERSION,
  ALWAYS_IGNORE,
  DEFAULT_IGNORES,
  LOCKFILE_PATTERNS,
  toPosix,
  isBinaryExt,
  sniffBinary,
  estimateTokens,
  estimateTokensFromSize,
  fmtBytes,
  compileIgnoreLine,
  globToRegex,
  createIgnoreEngine,
  readGitMeta,
  scanDirectory,
  renderTree,
  fitToBudget,
  packBundle,
  filterExistingFiles,
  chunkString,
  serializeEntries,
  deserializeEntries,
  MAX_TREE_LINES,
};
