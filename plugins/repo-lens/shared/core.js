'use strict';
/**
 * core.js —— 仓库体检台纯函数层（CJS 同构，零依赖零 IO）
 *
 * service（git 输出解析 → 分析编排）、mcp（结果裁剪）、面板（类型对齐）、
 * 单测（离线 fixture）四方共用。所有函数入参出参均为纯数据。
 *
 * 分析口径（与 docs/repo-lens-plan.md 对齐，README 同步明示）：
 *   - 复杂度 = 分支关键词计数 + 2×(最大嵌套深度-1)，**启发式近似**，非精确圈复杂度
 *   - 热点分 = 0.25×churnN + 0.25×cxN + 0.5×√(churnN×cxN)（两高才热，线性归一）
 *   - 时间耦合 = coCount≥3 且 coCount/min(degA,degB)≥0.5 的共变文件对
 *   - 重复 = 归一化行 6 行窗口哈希，≥2 处且合并后 ≥6 行
 *   - 健康分 = 热点集中度 25% + 重复率 20% + 提交卫生 25% + 巴士因子 15% + 历史大对象 15%
 */
const crypto = require('crypto');

const VERSION = '0.1.0';

// ── 常量与豁免规则 ───────────────────────────────────────────────────────────

/** 历史统计时跳过的目录（churn 与复杂度都不看；vendored/产物代码污染热点） */
const SKIP_DIR_RE = /(^|\/)(node_modules|dist|build|target|vendor|out|coverage|\.next|\.nuxt|__pycache__|site-packages|\.venv|venv|\.git)($|\/)/;
/** 压缩/产物文件：churn 仍计入，但不读内容不算复杂度/重复 */
const MINIFIED_RE = /([-.\s]min\.(js|mjs|cjs|css)|\.(bundle|chunk)\.[cm]?js)$/i;
const LOCKFILE_NAMES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'go.sum', 'poetry.lock', 'Pipfile.lock', 'composer.lock', 'Gemfile.lock',
]);
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
const TEXT_META_EXT = new Set(['json', 'md', 'markdown', 'txt', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'xml', 'html', 'css', 'scss', 'less', 'sql', 'graphql', 'gql', 'proto', 'csv']);

const EXT_LANG = {
  ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', vue: 'js', svelte: 'js',
  py: 'py', pyi: 'py',
  rb: 'rb', rake: 'rb',
  go: 'go', rs: 'rust', java: 'java', cs: 'cs', php: 'php',
  swift: 'swift', kt: 'kt', kts: 'kt', scala: 'scala',
  c: 'cfam', h: 'cfam', cpp: 'cfam', cc: 'cfam', cxx: 'cfam', hpp: 'cfam', hh: 'cfam', ino: 'cfam',
  sh: 'sh', bash: 'sh', ps1: 'sh', psm1: 'sh', zsh: 'sh',
  lua: 'lua', dart: 'dart',
};
/** 缩进即层级的语言（嵌套深度按前导空白估） */
const INDENT_LANG = new Set(['py', 'rb', 'lua', 'sh', 'yaml']);
/** 行注释前缀（归一化用，按语言族） */
const LINE_COMMENT = { py: '#', rb: '#', sh: '#', lua: '--', yaml: '#' };

function detectLanguage(p) {
  const base = String(p || '').split('/').pop().toLowerCase();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  if (LOCKFILE_NAMES.has(base)) return { lang: 'lockfile', kind: 'skip-content', ext };
  if (BINARY_EXT.has(ext)) return { lang: 'binary', kind: 'binary', ext };
  // 压缩产物判定必须先于扩展名表（foo.min.js 的 ext 是 js，否则永远判不中）
  if (MINIFIED_RE.test(base)) return { lang: 'minified', kind: 'skip-content', ext };
  if (EXT_LANG[ext]) return { lang: EXT_LANG[ext], kind: 'code', ext };
  if (TEXT_META_EXT.has(ext)) return { lang: ext, kind: 'text', ext };
  return { lang: ext || 'unknown', kind: ext ? 'text' : 'unknown', ext };
}

/** 是否应跳过该路径的内容分析（目录豁免/锁文件/压缩产物）。churn 统计不受影响。 */
function skipContent(p) {
  const s = String(p || '').replace(/\\/g, '/');
  if (SKIP_DIR_RE.test(s)) return true;
  const d = detectLanguage(s);
  return d.kind === 'binary' || d.kind === 'skip-content';
}

// ── git log --numstat 解析 ──────────────────────────────────────────────────

const COMMIT_MARK = '\u0002';
const FIELD_SEP = '\u0001';

/** 解析 rename 语法：`a => b`、`dir/{old => new}/x.ts` → {old, new}；无 rename 返回 null */
function parseRename(p) {
  const idx = p.indexOf(' => ');
  if (idx < 0) return null;
  const before = p.slice(0, idx);
  const after = p.slice(idx + 4);
  const braceL = before.indexOf('{');
  if (braceL >= 0) {
    const braceR = after.indexOf('}');
    if (braceR >= 0) {
      const pre = before.slice(0, braceL);
      const oldMid = before.slice(braceL + 1);
      const newMid = after.slice(0, braceR);
      const post = after.slice(braceR + 1);
      // 空段（如 dir/{ => sub}/f）拼接会产生 //，git 语义下路径不含 //，折叠归一
      const fix = (s) => s.replace(/\/\/+/g, '/');
      return { old: fix(pre + oldMid + post), new: fix(pre + newMid + post) };
    }
  }
  return { old: before, new: after };
}

/**
 * 解析 `git log --numstat` 全文。
 * 约定（service 侧 spawn 参数产生）：提交头行 = \u0002 + %H%01%an%01%ae%01%at%01%s，
 * numstat 行 = `adds\tdels\tpath`（二进制为 `-`）。
 * merge 提交默认无 numstat 行（git 对 merge 不出 diff），文件表为空。
 * 返回 {commits:[{hash,author,email,date,subject,files:[{path,oldPath,adds,dels,binary}]}], warnings[]}
 */
function parseNumstatLog(text) {
  const commits = [];
  const warnings = [];
  if (!text) return { commits, warnings };
  const lines = String(text).split('\n');
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (!raw) continue;
    if (raw.charCodeAt(0) === 0x02) { // 提交头：\x02 hash \x01 author \x01 email \x01 date \x01 subject
      const parts = raw.slice(1).split(FIELD_SEP);
      if (parts.length < 5) { warnings.push(`跳过格式异常提交头（行 ${i + 1}）`); continue; }
      cur = {
        hash: parts[0], author: parts[1], email: parts[2],
        date: Number(parts[3]) || 0, subject: parts.slice(4).join(FIELD_SEP), files: [],
      };
      commits.push(cur);
      continue;
    }
    if (!cur) continue; // 头之前的杂散行（如 --since 边界提示）
    const tab1 = raw.indexOf('\t');
    const tab2 = tab1 >= 0 ? raw.indexOf('\t', tab1 + 1) : -1;
    if (tab2 < 0) { warnings.push(`跳过格式异常 numstat 行（行 ${i + 1}）`); continue; }
    const adds = raw.slice(0, tab1);
    const dels = raw.slice(tab1 + 1, tab2);
    const rawPath = raw.slice(tab2 + 1);
    const ren = parseRename(rawPath);
    const binary = adds === '-' || dels === '-';
    cur.files.push({
      path: ren ? ren.new : rawPath,
      oldPath: ren ? ren.old : undefined,
      adds: binary ? 0 : (parseInt(adds, 10) || 0),
      dels: binary ? 0 : (parseInt(dels, 10) || 0),
      binary,
    });
  }
  return { commits, warnings };
}

// ── 近似复杂度 ──────────────────────────────────────────────────────────────

const BRANCH_RE = {
  ts: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  js: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  go: /\b(if|for|case)\b|&&|\|\|/g,
  rust: /\b(if|while|for|match)\b|&&|\|\|/g,
  java: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  cs: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  cfam: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  php: /\b(if|elseif|for|while|case|catch)\b|&&|\|\|/g,
  swift: /\b(if|else\s+if|for|while|case|catch|guard)\b|&&|\|\|/g,
  kt: /\b(if|else\s+if|for|while|when|catch)\b|&&|\|\|/g,
  scala: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  dart: /\b(if|else\s+if|for|while|case|catch)\b|&&|\|\|/g,
  py: /\b(if|elif|for|while|except|and|or)\b/g,
  rb: /\b(if|elsif|unless|while|until|rescue)\b|&&|\|\|/g,
  sh: /\b(if|elif|for|while)\b|&&|\|\|/g,
};

/** 单文件近似复杂度：{lines,codeLines,blankLines,maxDepth,branchCount,cxRaw,cxScore} */
function analyzeComplexity(path, content) {
  const d = detectLanguage(path);
  const text = String(content || '');
  const lines = text.split('\n');
  let codeLines = 0; let blankLines = 0; let maxDepth = 0; let branchCount = 0;
  let braceDepth = 0;
  const isIndent = INDENT_LANG.has(d.lang);
  const branchRe = BRANCH_RE[d.lang];
  // 缩进语言按「文件内最小正缩进」为单位（ruby/sh 常用 2 空格，python 4 空格，写死 4 会吃掉层级）
  const indents = [];
  for (const rawLine of lines) {
    if (!rawLine.trim()) { blankLines++; continue; }
    codeLines++;
    if (branchRe) {
      branchRe.lastIndex = 0;
      branchCount += (rawLine.match(branchRe) || []).length;
    }
    if (isIndent) {
      const m = rawLine.match(/^[ \t]*/);
      const w = (m ? m[0] : '').replace(/\t/g, '  ').length; // tab 按 2 空格（常见编辑器配置的下限）
      indents.push(w);
    } else {
      // 花括号深度（近似：不解析字符串/注释中的括号，工程上够用）
      for (const ch of rawLine) {
        if (ch === '{') { braceDepth++; if (braceDepth > maxDepth) maxDepth = braceDepth; }
        else if (ch === '}') { braceDepth = Math.max(0, braceDepth - 1); }
      }
    }
  }
  if (isIndent) {
    const positives = indents.filter((w) => w > 0);
    const unit = positives.length ? Math.min(...positives) : 4;
    if (unit > 0) {
      for (const w of indents) {
        const depth = Math.round(w / unit) + 1;
        if (depth > maxDepth) maxDepth = depth;
      }
    }
  }
  if (maxDepth < 1) maxDepth = 1;
  const cxRaw = branchCount + 2 * Math.max(0, maxDepth - 1);
  return {
    lang: d.lang, lines: lines.length, codeLines, blankLines,
    maxDepth, branchCount, cxRaw, cxScore: Math.min(100, Math.round(cxRaw * 2)),
  };
}

// ── churn 归并与热点评分 ────────────────────────────────────────────────────

/**
 * 从 commits 归并每文件 churn。
 * rename 归因到新路径；二进制只计提交次数。
 * 返回 Map path → {commits,adds,dels,binaryCommits,authors:{name:count},firstTouch,lastTouch}
 */
function buildChurn(commits) {
  const map = new Map();
  for (const c of commits) {
    for (const f of c.files) {
      let e = map.get(f.path);
      if (!e) {
        e = { commits: 0, adds: 0, dels: 0, binaryCommits: 0, authors: Object.create(null), firstTouch: c.date, lastTouch: c.date };
        map.set(f.path, e);
      }
      e.commits++;
      if (f.binary) e.binaryCommits++;
      else { e.adds += f.adds; e.dels += f.dels; }
      const a = c.author || c.email || 'unknown';
      e.authors[a] = (e.authors[a] || 0) + 1;
      if (c.date < e.firstTouch) e.firstTouch = c.date;
      if (c.date > e.lastTouch) e.lastTouch = c.date;
    }
  }
  return map;
}

/**
 * 热点合并：churn（次/行）× 复杂度。
 * filesCx: Map path → analyzeComplexity 结果（已跳过豁免路径的文件才有）。
 * 归一：churnN = commits/maxCommits、cxN = cxRaw/maxCxRaw（线性，可解释）。
 * score = round(100×(0.25×churnN + 0.25×cxN + 0.5×√(churnN×cxN)))
 */
function buildHotspots(churnMap, filesCx, locMap, opts) {
  const maxCommits = Math.max(1, ...[...churnMap.values()].map((e) => e.commits));
  let maxCx = 1;
  for (const cx of filesCx.values()) if (cx.cxRaw > maxCx) maxCx = cx.cxRaw;
  const maxCommitsCapped = Math.min(maxCommits, opts && opts.maxCommitsNorm ? opts.maxCommitsNorm : maxCommits);
  const rows = [];
  for (const [path, e] of churnMap) {
    if (skipContent(path)) continue; // 产物/vendored 不进热点
    const cx = filesCx.get(path) || null;
    const churnN = Math.min(1, e.commits / maxCommitsCapped);
    const cxN = cx ? Math.min(1, cx.cxRaw / maxCx) : 0;
    const score = Math.round(100 * (0.25 * churnN + 0.25 * cxN + 0.5 * Math.sqrt(churnN * cxN)));
    const authors = Object.entries(e.authors);
    authors.sort((a, b) => b[1] - a[1]);
    rows.push({
      path,
      commits: e.commits,
      addedLines: e.adds,
      deletedLines: e.dels,
      churnLines: e.adds + e.dels,
      binaryCommits: e.binaryCommits,
      authors: authors.length,
      topAuthor: authors[0] ? authors[0][0] : 'unknown',
      topAuthorShare: authors[0] && e.commits > 0 ? authors[0][1] / e.commits : 0,
      lang: cx ? cx.lang : detectLanguage(path).lang,
      loc: locMap && locMap.get ? (locMap.get(path) || 0) : 0,
      cxRaw: cx ? cx.cxRaw : 0,
      cxScore: cx ? cx.cxScore : 0,
      complexityKnown: !!cx,
      lastTouch: e.lastTouch,
      score,
    });
  }
  rows.sort((a, b) => b.score - a.score || b.commits - a.commits);
  return rows;
}

/** 健康分分量：top10 热点吞掉的 churn 提交占比（集中度越高分越低） */
function hotspotConcentration(rows) {
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + r.commits, 0);
  if (!total) return 0;
  const top10 = rows.slice(0, 10).reduce((s, r) => s + r.commits, 0);
  return top10 / total;
}

// ── 时间耦合 ────────────────────────────────────────────────────────────────

/**
 * 共变文件对（temporal coupling）。只在 topChurn 集合内统计（防平方爆炸）。
 * commits: [{files:[{path}]}]；degrees: Map path→提交数（来自 buildChurn）。
 * minCo / minRatio 见文件头口径。返回 [{a,b,co,ratio}]，按 co*ratio 降序。
 */
function buildCoChange(commits, churnMap, opts) {
  const topN = (opts && opts.topFiles) || 150;
  const minCo = (opts && opts.minCo != null) ? opts.minCo : 3;
  const minRatio = (opts && opts.minRatio != null) ? opts.minRatio : 0.5;
  const maxPairs = (opts && opts.maxPairs) || 100;
  const top = [...churnMap.entries()]
    .filter(([p]) => !skipContent(p))
    .sort((x, y) => y[1].commits - x[1].commits)
    .slice(0, topN);
  const inSet = new Set(top.map(([p]) => p));
  const pairCount = new Map();
  for (const c of commits) {
    const ps = [...new Set(c.files.map((f) => f.path))].filter((p) => inSet.has(p)).sort();
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const key = ps[i] + '\u0000' + ps[j];
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }
  }
  const out = [];
  for (const [key, co] of pairCount) {
    if (co < minCo) continue;
    const [a, b] = key.split('\u0000');
    const degA = churnMap.get(a) ? churnMap.get(a).commits : 0;
    const degB = churnMap.get(b) ? churnMap.get(b).commits : 0;
    const denom = Math.min(degA, degB);
    if (!denom) continue;
    const ratio = co / denom;
    if (ratio < minRatio) continue;
    out.push({ a, b, co, ratio: Math.round(ratio * 100) / 100 });
  }
  out.sort((x, y) => (y.co * y.ratio) - (x.co * x.ratio));
  return out.slice(0, maxPairs);
}

// ── 重复代码 ────────────────────────────────────────────────────────────────

const DUP_WINDOW = 6;

/** 归一化一行：剥注释 → 折叠空白 → 小写；无意义行返回 null */
function normalizeLine(line, lang) {
  let s = String(line);
  const lc = LINE_COMMENT[lang];
  if (lc) {
    const i = s.indexOf(lc);
    if (i >= 0) s = s.slice(0, i);
  } else {
    // C 族：剥行尾 // 注释（不动 http:// 协议头）
    s = s.replace(/(^|[^:])\/\/.*$/, '$1');
  }
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (s.length < 4) return null;
  return s;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * 重复代码检测：归一化行滑窗哈希 → 同哈希 ≥2 处 → 按文件对合并重叠区间。
 * files: [{path, content, lang}]（调用方已完成豁免过滤与大小截断）。
 * 返回 {pairs:[{a,b,lines,preview}], fileDupLines:{}, totalDupLines, truncated}
 */
function findDuplication(files, opts) {
  const maxWindows = (opts && opts.maxWindows) || 120_000;
  const maxPairs = (opts && opts.maxPairs) || 100;
  const k = DUP_WINDOW;
  const truncated = { filesSkipped: 0, windowsCapped: false };
  // 1) 每文件归一化行数组（记录原行号）
  const norm = new Map(); // path → [{n, lineNo}]
  let windowBudget = maxWindows;
  for (const f of files) {
    const lines = String(f.content || '').split('\n');
    if (lines.length > 20_000) { truncated.filesSkipped++; continue; }
    const arr = [];
    for (let i = 0; i < lines.length; i++) {
      const n = normalizeLine(lines[i], f.lang);
      if (n) arr.push({ n, lineNo: i + 1 });
    }
    if (arr.length >= k) norm.set(f.path, arr);
  }
  // 2) 滑窗哈希 → 位置列表
  const byHash = new Map(); // hash → [{path, startIdx}]
  outer:
  for (const [path, arr] of norm) {
    for (let i = 0; i + k <= arr.length; i++) {
      if (windowBudget-- <= 0) { truncated.windowsCapped = true; break outer; }
      const h = fnv1a(arr.slice(i, i + k).map((x) => x.n).join('§'));
      let list = byHash.get(h);
      if (!list) { list = []; byHash.set(h, list); }
      list.push({ path, startIdx: i });
    }
  }
  // 3) 同哈希 ≥2 处 → 文件对候选区间
  const rangesByPair = new Map(); // "a|b" → {aR:[[s,e]], bR:[[s,e]], sample}
  for (const list of byHash.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i]; const B = list[j];
        if (A.path === B.path && Math.abs(A.startIdx - B.startIdx) < k + 4) continue; // 平移窗口噪声
        const key = A.path < B.path ? A.path + '|' + B.path : B.path + '|' + A.path;
        let e = rangesByPair.get(key);
        if (!e) { e = { aR: [], bR: [], sample: null }; rangesByPair.set(key, e); }
        const ra = A.path < B.path ? A : B;
        const rb = A.path < B.path ? B : A;
        e.aR.push([ra.startIdx, ra.startIdx + k]);
        e.bR.push([rb.startIdx, rb.startIdx + k]);
        if (!e.sample) e.sample = norm.get(ra.path).slice(ra.startIdx, ra.startIdx + 3).map((x) => x.n);
      }
    }
  }
  // 4) 合并区间 → 行数
  function merge(rs) {
    if (!rs.length) return 0;
    rs.sort((x, y) => x[0] - y[0]);
    let total = 0; let cs = rs[0][0]; let ce = rs[0][1];
    for (let i = 1; i < rs.length; i++) {
      if (rs[i][0] <= ce + 2) ce = Math.max(ce, rs[i][1]); // 间隔≤2 视为连续
      else { total += ce - cs; cs = rs[i][0]; ce = rs[i][1]; }
    }
    total += ce - cs;
    return total;
  }
  const pairs = [];
  const fileDupLines = Object.create(null);
  for (const [key, e] of rangesByPair) {
    const [a, b] = key.split('|');
    const lines = merge(e.aR); // a、b 窗口数相同，行数一致
    if (lines < k) continue;
    pairs.push({ a, b, lines, preview: e.sample || [] });
    fileDupLines[a] = (fileDupLines[a] || 0) + lines;
    fileDupLines[b] = (fileDupLines[b] || 0) + lines;
  }
  pairs.sort((x, y) => y.lines - x.lines);
  const top = pairs.slice(0, maxPairs);
  let totalDupLines = 0;
  for (const p of pairs) totalDupLines += p.lines; // 全量口径（不受 maxPairs 截断影响）
  return { pairs: top, fileDupLines, totalDupLines, truncated };
}

// ── 提交卫生 / 巴士因子 ─────────────────────────────────────────────────────

const CONVENTIONAL_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|release)(\([^)]*\))?!?:\s/i;
const MERGE_RE = /^merge\b/i;
const SLOPPY_RE = /^(wip|tmp|temp|update|save|asdf|test|fix bug|修改|更新|提交|修复)\b/i;

/** 提交卫生画像。merge 单列（不算违规也不算 conventional）。 */
function analyzeHygiene(commits) {
  const total = commits.length;
  let conventional = 0; let merges = 0; let sloppy = 0; let big = 0; let subjectLenSum = 0;
  for (const c of commits) {
    const s = (c.subject || '').trim();
    subjectLenSum += s.length;
    if (MERGE_RE.test(s)) { merges++; continue; }
    if (CONVENTIONAL_RE.test(s)) conventional++;
    if (SLOPPY_RE.test(s) || s.length < 10) sloppy++;
    if (c.files.length >= 20) big++;
  }
  const nonMerge = Math.max(1, total - merges);
  return {
    total, merges,
    conventional,
    conventionalRate: Math.round((conventional / nonMerge) * 100) / 100,
    sloppy,
    sloppyRate: Math.round((sloppy / nonMerge) * 100) / 100,
    bigCommits: big,
    bigRate: Math.round((big / Math.max(1, total)) * 100) / 100,
    avgSubjectLen: total ? Math.round(subjectLenSum / total) : 0,
  };
}

/** 巴士因子：贡献 ≥50% 提交的最少作者数（1 = 单点风险最高） */
function buildBusFactor(commits) {
  const byAuthor = new Map();
  for (const c of commits) {
    const a = c.author || c.email || 'unknown';
    byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
  }
  const authors = [...byAuthor.entries()].map(([name, c]) => ({ name, commits: c }))
    .sort((x, y) => y.commits - x.commits);
  const total = commits.length;
  let acc = 0; let busFactor = 0;
  for (const a of authors) {
    acc += a.commits; busFactor++;
    a.share = total ? Math.round((a.commits / total) * 100) / 100 : 0;
    if (acc >= total * 0.5) break;
  }
  return {
    authors: authors.slice(0, 10).map((a) => ({ name: a.name, commits: a.commits, share: a.share })),
    totalAuthors: authors.length,
    busFactor: busFactor || (authors.length ? 1 : 0),
    topAuthorShare: authors.length ? Math.round((authors[0].commits / Math.max(1, total)) * 100) / 100 : 0,
  };
}

// ── git 其余输出解析（纯函数，service 传原文进来） ──────────────────────────

/** `git for-each-ref --format='%(committerdate:unix)%09%(refname:short)%09%(authorname)%09%(subject)'` */
function parseBranches(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    out.push({
      branch: parts[1], date: Number(parts[0]) || 0,
      author: parts[2], subject: parts[3],
    });
  }
  out.sort((x, y) => x.date - y.date); // 最陈旧在前
  return out;
}

/** `git rev-list --objects --all`：行 = `sha path`（path 可能缺省） */
function parseRevObjects(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    const sp = line.indexOf(' ');
    if (sp <= 0) continue;
    out.push({ sha: line.slice(0, sp), path: line.slice(sp + 1) });
  }
  return out;
}

/** `git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(rest)'` */
function parseBatchCheck(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    const parts = line.split(' ');
    if (parts.length < 3) continue;
    out.push({ sha: parts[0], type: parts[1], size: Number(parts[2]) || 0, path: parts.slice(3).join(' ') });
  }
  return out;
}

/**
 * 路径归并：同一文件历史改名的多个 blob 归到现路径，取最大尺寸。
 * 注意：这里故意不用 skipContent——「历史大对象」要抓的正是二进制资产膨胀
 * （png/zip/apk），按扩展名过滤会把维度抓瞎。只要求有路径即可。
 */
function aggregateBlobs(objects, checks, opts) {
  const cap = (opts && opts.topN) || 30;
  const sizeBySha = new Map();
  for (const c of checks) if (c.type === 'blob') sizeBySha.set(c.sha, c.size);
  const byPath = new Map();
  for (const o of objects) {
    if (!o.path) continue;
    const size = sizeBySha.get(o.sha);
    if (!size) continue;
    const cur = byPath.get(o.path) || { path: o.path, maxBlob: 0, versions: 0 };
    cur.versions++;
    if (size > cur.maxBlob) cur.maxBlob = size;
    byPath.set(o.path, cur);
  }
  const rows = [...byPath.values()].map((r) => ({ ...r, mb: Math.round((r.maxBlob / 1048576) * 100) / 100 }));
  rows.sort((x, y) => y.maxBlob - x.maxBlob);
  return rows.slice(0, cap);
}

// ── 健康分与投影裁剪 ────────────────────────────────────────────────────────

function clamp01(v) { return Math.max(0, Math.min(100, Math.round(v))); }

/**
 * 综合健康分（0-100，越高越健康）。分量与权重见文件头口径。
 * 输入从报告中取：hotspotRows（全量排序后）、duplication.totalDupLines、totalCodeLines、
 * hygiene.conventionalRate、busFactor.busFactor、blobs（topN 的 maxBlob 之和）。
 */
function healthScore(input) {
  const conc = hotspotConcentration(input.hotspotRows);
  const hc = clamp01(100 - conc * 150);
  const dupRatio = input.totalCodeLines > 0 ? input.totalDupLines / input.totalCodeLines : 0;
  const dup = clamp01(100 - dupRatio * 400);
  const hyg = clamp01((input.conventionalRate || 0) * 100);
  const bus = clamp01((input.busFactor || 0) * 20);
  const mb = (input.blobs || []).reduce((s, b) => s + b.mb, 0);
  const blob = clamp01(100 - mb * 2);
  const total = Math.round(0.25 * hc + 0.20 * dup + 0.25 * hyg + 0.15 * bus + 0.15 * blob);
  return {
    total,
    parts: { hotspot: hc, duplication: dup, hygiene: hyg, busFactor: bus, bigBlobs: blob },
    weights: { hotspot: 0.25, duplication: 0.20, hygiene: 0.25, busFactor: 0.15, bigBlobs: 0.15 },
  };
}

/** kv 投影裁剪：只保留面板/MCP 需要的字段并封顶（与 service 内存权威解耦） */
function projectReport(report) {
  const clipStr = (s, n) => String(s == null ? '' : s).slice(0, n);
  return {
    runId: report.runId,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    status: report.status,
    error: report.error ? clipStr(report.error, 500) : undefined,
    repo: report.repo ? {
      top: report.repo.top, branch: report.repo.branch, commitHead: report.repo.commitHead,
    } : undefined,
    window: report.window,
    totals: report.totals,
    languages: (report.languages || []).slice(0, 15),
    health: report.health,
    hotspots: (report.hotspots || []).slice(0, 300).map((h) => ({
      ...h, path: clipStr(h.path, 260), topAuthor: clipStr(h.topAuthor, 60),
    })),
    couples: (report.couples || []).slice(0, 100).map((c) => ({
      ...c, a: clipStr(c.a, 260), b: clipStr(c.b, 260),
    })),
    duplications: (report.duplications && report.duplications.pairs || []).slice(0, 100).map((p) => ({
      a: clipStr(p.a, 260), b: clipStr(p.b, 260), lines: p.lines,
      preview: (p.preview || []).slice(0, 3).map((s) => clipStr(s, 120)),
    })),
    dupSummary: report.dupSummary,
    blobs: (report.blobs || []).slice(0, 30),
    branches: (report.branches || []).slice(0, 100).map((b) => ({
      ...b, branch: clipStr(b.branch, 120), author: clipStr(b.author, 60), subject: clipStr(b.subject, 120),
    })),
    hygiene: report.hygiene,
    busFactor: report.busFactor,
    warnings: (report.warnings || []).slice(0, 30).map((w) => clipStr(w, 300)),
  };
}

// ── 离线自检 ────────────────────────────────────────────────────────────────

/** 用内置 fixture 走通「解析→分析→评分」主链，不触任何 IO。返回 {ok, total, failed[]} */
function selftest() {
  const checks = [];
  function check(name, fn) {
    try { fn(); checks.push({ name, ok: true }); }
    catch (e) { checks.push({ name, ok: false, error: String(e && e.message || e) }); }
  }
  function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || '不等'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); }

  const logText = [
    COMMIT_MARK + ['abc123', '张三', 'z@x.com', '1700000000', 'feat(core): add parser'].join(FIELD_SEP),
    '10\t2\tsrc/parser.ts',
    '5\t0\tsrc/util.ts',
    COMMIT_MARK + ['def456', '李四', 'l@x.com', '1700001000', 'wip'].join(FIELD_SEP),
    '-\t-\tassets/logo.png',
    '3\t1\tsrc/{old => new}name.ts',
    '8\t4\tsrc/util.ts',
  ].join('\n');

  check('numstat：提交/文件/rename/二进制', () => {
    const { commits } = parseNumstatLog(logText);
    eq(commits.length, 2, '提交数');
    eq(commits[0].files.length, 2, '首提交文件数');
    const rf = commits[1].files[1];
    eq(rf.path, 'src/newname.ts', 'rename 新路径');
    eq(rf.oldPath, 'src/oldname.ts', 'rename 旧路径');
    eq(commits[1].files[0].binary, true, '二进制判定');
  });

  check('复杂度：分支计数与嵌套深度', () => {
    const cx = analyzeComplexity('a.ts', [
      'function f(x) {',
      '  if (x > 0) {',
      '    for (let i = 0; i < x; i++) {',
      '      while (x && i > 0) { x--; }',
      '    }',
      '  }',
      '  return x || 0;',
      '}',
    ].join('\n'));
    if (cx.branchCount !== 5) throw new Error(`分支数 ${cx.branchCount} ≠ 5`); // if for while && ||
    if (cx.maxDepth !== 4) throw new Error(`深度 ${cx.maxDepth} ≠ 4`);
    if (cx.cxRaw !== 5 + 2 * 3) throw new Error(`cxRaw ${cx.cxRaw}`);
  });

  check('复杂度：python 缩进深度', () => {
    const cx = analyzeComplexity('a.py', [
      'def f(x):',
      '    if x:',
      '        for i in range(x):',
      '            if x and i:',
      '                pass',
    ].join('\n'));
    if (cx.maxDepth !== 5) throw new Error(`py 深度 ${cx.maxDepth} ≠ 5`); // pass 行缩进 16 空格 → floor(16/4)+1
    if (cx.branchCount !== 4) throw new Error(`py 分支 ${cx.branchCount} ≠ 4`); // if / for / if / and（\b 边界使 for 不再命中 or）
  });

  check('churn 归并 + rename 归因', () => {
    const { commits } = parseNumstatLog(logText);
    const churn = buildChurn(commits);
    const u = churn.get('src/util.ts');
    if (!u || u.commits !== 2 || u.adds !== 13 || u.dels !== 4) throw new Error('util.ts churn 错');
    if (!churn.has('src/newname.ts')) throw new Error('rename 未归因到新路径');
    if (churn.get('assets/logo.png').binaryCommits !== 1) throw new Error('二进制提交未计数');
  });

  check('热点：两高才热 + 豁免目录不进榜', () => {
    const commits = [
      { hash: '1', author: 'a', date: 1, files: [{ path: 'node_modules/x.js', adds: 5, dels: 1 }] },
      { hash: '2', author: 'a', date: 2, files: [{ path: 'src/parser.ts', adds: 5, dels: 1 }] },
      { hash: '3', author: 'a', date: 3, files: [{ path: 'src/parser.ts', adds: 5, dels: 1 }] },
    ];
    const churn = buildChurn(commits);
    const cx = new Map([['src/parser.ts', analyzeComplexity('src/parser.ts', 'if (a && b) { while (c) {} }')]]);
    const rows = buildHotspots(churn, cx, new Map([['src/parser.ts', 50]]));
    if (rows.some((r) => r.path.includes('node_modules'))) throw new Error('豁免目录进了热点');
    const top = rows[0];
    if (!top || top.path !== 'src/parser.ts') throw new Error('热点排序异常');
    if (top.score <= 0 || top.score > 100) throw new Error('分数越界');
  });

  check('时间耦合：共现对过滤', () => {
    const commits = [
      { hash: '1', date: 1, files: [{ path: 'a.ts' }, { path: 'b.ts' }] },
      { hash: '2', date: 2, files: [{ path: 'a.ts' }, { path: 'b.ts' }] },
      { hash: '3', date: 3, files: [{ path: 'a.ts' }, { path: 'b.ts' }] },
      { hash: '4', date: 4, files: [{ path: 'a.ts' }, { path: 'c.ts' }] },
    ];
    const churn = buildChurn(commits);
    const pairs = buildCoChange(commits, churn, { minCo: 3, minRatio: 0.5 });
    const ab = pairs.find((p) => (p.a === 'a.ts' && p.b === 'b.ts') || (p.a === 'b.ts' && p.b === 'a.ts'));
    if (!ab || ab.co !== 3) throw new Error('a-b 耦合缺失');
    if (pairs.some((p) => (p.a === 'c.ts' || p.b === 'c.ts'))) throw new Error('c.ts 不该入选（ratio 1/3 < 0.5）');
  });

  check('重复：跨文件复制的函数', () => {
    const snippet = [
      'function calcTotal(items) {',
      '  let total = 0;',
      '  for (const item of items) {',
      '    if (!item.price) continue;',
      '    total += item.price * item.count;',
      '  }',
      '  return total;',
      '}',
    ].join('\n');
    const r = findDuplication([
      { path: 'a.ts', content: snippet + '\n\nexport { calcTotal }', lang: 'ts' },
      { path: 'b.ts', content: '// copy\n' + snippet, lang: 'ts' },
      { path: 'c.ts', content: 'export const x = 1\n', lang: 'ts' },
    ]);
    if (!r.pairs.length) throw new Error('未检出重复');
    const hit = r.pairs.find((p) => (p.a === 'a.ts' && p.b === 'b.ts') || (p.a === 'b.ts' && p.b === 'a.ts'));
    if (!hit || hit.lines < 6) throw new Error('重复对行数不足');
  });

  check('卫生 + 巴士因子', () => {
    const { commits } = parseNumstatLog(logText);
    const h = analyzeHygiene(commits);
    if (h.total !== 2 || h.merges !== 0) throw new Error('卫生统计错');
    if (!h.sloppy) throw new Error('wip 应判草率');
    const bf = buildBusFactor(commits);
    if (bf.busFactor !== 1) throw new Error('两提交两作者各 50% → 巴士因子应为 1');
  });

  check('健康分 + kv 投影封顶', () => {
    const hs = healthScore({ hotspotRows: [], totalCodeLines: 1000, totalDupLines: 50, conventionalRate: 0.8, busFactor: 3, blobs: [{ mb: 5 }] });
    if (hs.total < 0 || hs.total > 100) throw new Error('健康分越界');
    const proj = projectReport({ runId: 'r', hotspots: Array.from({ length: 400 }, (_, i) => ({ path: 'p' + i, score: i })), couples: Array.from({ length: 200 }, (_, i) => ({ a: 'x', b: 'y', co: i, ratio: 1 })) });
    if (proj.hotspots.length !== 300) throw new Error('热点投影未封顶 300');
    if (proj.couples.length !== 100) throw new Error('耦合投影未封顶 100');
  });

  check('for-each-ref / batch-check 解析', () => {
    const br = parseBranches('1700000000\tfeat/x\t张三\twip test\n1700010000\tmain\t李四\tfeat: y');
    if (br[0].branch !== 'feat/x') throw new Error('分支排序应最旧在前');
    const bc = parseBatchCheck('abc blob 1048576 big/asset.psd\ndef commit 200');
    if (bc[0].size !== 1048576 || bc[0].type !== 'blob') throw new Error('batch-check 解析错');
  });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, total: checks.length, failed, checks };
}

module.exports = {
  VERSION,
  SKIP_DIR_RE, LOCKFILE_NAMES, BINARY_EXT,
  detectLanguage, skipContent,
  parseRename, parseNumstatLog,
  analyzeComplexity, buildChurn, buildHotspots, hotspotConcentration,
  buildCoChange, normalizeLine, findDuplication,
  analyzeHygiene, buildBusFactor,
  parseBranches, parseRevObjects, parseBatchCheck, aggregateBlobs,
  healthScore, projectReport,
  COMMIT_MARK, FIELD_SEP, DUP_WINDOW,
  selftest,
};
