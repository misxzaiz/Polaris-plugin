'use strict';
/**
 * verify-prims.js —— 声明核验原语（node 侧；服务与 MCP 共用同一权威）
 *
 * 安全红线（本文件是唯一 exec 入口）：
 *   - 命令白名单 EXEC_ALLOWLIST，只允许 --help/-h/--version/version 探测形态与
 *     `git status --porcelain` 精确形态；spawn shell:false；逐 token 正则校验；
 *     8s 超时；256KB 输出上限；cwd 固定在用户指定 root。
 *   - fs 全部只读。日志/证据只记录路径与行号，不落文件内容全文（截断 160 字符）。
 *   - 裁决纪律（claim-core 同源）：refuted 必须有硬证据；全库符号查询上限
 *     verified/partial/unverifiable，绝不因「全库没搜到」而证伪（可能是全局/第三方）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const core = require('../shared/claim-core.js');

const PROBE_TIMEOUT_MS = 8000;
const PROBE_MAX_BUFFER = 256 * 1024;
const READ_MAX = 2 * 1024 * 1024;
const GREP_MAX_FILES = 20000;
const GREP_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', '.venv', 'venv',
  '__pycache__', '.next', '.nuxt', '.turbo', 'coverage', '.idea', '.vscode', '.gradle',
]);

// 执行白名单：cmd → 允许的探测形态
const EXEC_ALLOWLIST = new Set([
  'git', 'node', 'npm', 'pnpm', 'yarn', 'deno', 'bun', 'cargo', 'rustc', 'go',
  'python', 'python3', 'pip', 'pip3', 'docker', 'kubectl', 'make', 'tsc',
]);

const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FLAG_RE = /^--[A-Za-z0-9][A-Za-z0-9._-]*$|^-[A-Za-z]$/;

function fail(msg) {
  const e = new Error(msg);
  e.user = true;
  throw e;
}

// ── 受控执行 ────────────────────────────────────────────────────────────────

function validateProbeArgs(cmd, args) {
  if (!EXEC_ALLOWLIST.has(cmd)) return { ok: false, reason: `命令不在安全探测清单: ${cmd}` };
  for (const a of args) {
    if (!TOKEN_RE.test(a) && !FLAG_RE.test(a)) return { ok: false, reason: `参数含非法字符: ${a}` };
  }
  return { ok: true };
}

/** 探测执行：cmd + args（必须全部过校验）。返回 {ok, denied, code, stdout, stderr, error} */
function runProbe(root, cmd, args) {
  const v = validateProbeArgs(cmd, args);
  if (!v.ok) return Promise.resolve({ ok: false, denied: true, error: v.reason });
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd: root, shell: false, windowsHide: true });
    } catch (e) {
      resolve({ ok: false, denied: false, error: String(e && e.message || e) });
      return;
    }
    const timer = setTimeout(() => {
      if (!done) { try { child.kill(); } catch (_) { /* 忽略 */ } }
    }, PROBE_TIMEOUT_MS);
    child.stdout.on('data', (c) => { if (out.length < PROBE_MAX_BUFFER) out += c; });
    child.stderr.on('data', (c) => { if (err.length < PROBE_MAX_BUFFER) err += c; });
    child.on('error', (e) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ ok: false, denied: false, error: String(e && e.message || e) });
    });
    child.on('close', (code) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ ok: true, denied: false, code, stdout: out, stderr: err });
    });
  });
}

const HELP_MIN_BYTES = 40;

/** 探测某命令的帮助输出（flag 是否存在的 ground truth）。
 * Windows 上 `git xxx --help` 会拉起浏览器且 stdout 为空（实测）——一律先 `-h`（短帮助，
 * 直出 stdout、不开浏览器），输出不足再退 `--help`。 */
async function probeHelp(root, cmd, subcmd) {
  const attempt = async (flag) => runProbe(root, cmd, [...(subcmd || []), flag]);
  const len = (x) => ((x && x.stdout || '').length + (x && x.stderr || '').length);
  let r = await attempt('-h');
  if (!r.ok || len(r) < HELP_MIN_BYTES) {
    const r2 = await attempt('--help');
    if (r2.ok && len(r2) > len(r)) r = { ...r2, via: '--help' };
  }
  return r;
}

// ── 工具：git status / 仓库 grep ────────────────────────────────────────────

async function gitStatusLines(root) {
  try {
    if (!fs.existsSync(path.join(root, '.git'))) return null;
  } catch (_) { return null; }
  const r = await runProbe(root, 'git', ['status', '--porcelain']);
  if (!r.ok || r.code !== 0) return null;
  return r.stdout.split('\n').filter(Boolean).map((l) => l.trim());
}

/** ripgrep 优先，缺了退化 node 走目录（返回 [{file,line,text}]，≤limit 条） */
async function repoSearch(root, needle, opts) {
  const o = opts || {};
  const limit = Math.min(o.limit || 20, 100);
  // 1) ripgrep（-F 字面量；'--' 防注入；--glob 排除）
  const rg = await runProbe(root, 'rg', [
    '-n', '--no-heading', '-F', '--max-count', '3',
    '--glob', '!node_modules/**', '--glob', '!.git/**', '--glob', '!dist/**', '--glob', '!build/**',
    '--', needle, '.',
  ]);
  if (rg.ok && rg.code === 0) {
    const out = [];
    for (const line of rg.stdout.split('\n')) {
      if (!line) continue;
      const i1 = line.indexOf(':');
      const i2 = line.indexOf(':', i1 + 1);
      if (i1 === -1 || i2 === -1) continue;
      out.push({ file: path.resolve(root, line.slice(0, i1)), line: Number(line.slice(i1 + 1, i2)), text: line.slice(i2 + 1).slice(0, 160) });
      if (out.length >= limit) break;
    }
    if (out.length || rg.stdout.trim()) return out;
  }
  // 2) node 兜底 walk
  const results = [];
  let seen = 0;
  const needleLower = needle;
  async function walk(dir) {
    if (results.length >= limit || seen >= GREP_MAX_FILES) return;
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      if (results.length >= limit || seen >= GREP_MAX_FILES) return;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!GREP_SKIP_DIRS.has(ent.name) && !ent.name.startsWith('.')) await walk(p);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase().replace('.', '');
      if (!core.FILE_EXT.has(ext)) continue;
      seen++;
      let st;
      try { st = await fs.promises.stat(p); } catch (_) { continue; }
      if (st.size > READ_MAX) continue;
      let text;
      try { text = await fs.promises.readFile(p, 'utf8'); } catch (_) { continue; }
      if (text.slice(0, 8192).includes('\0')) continue;
      const lines = text.split('\n');
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needleLower)) {
          results.push({ file: p, line: i + 1, text: lines[i].trim().slice(0, 160) });
          if (++count >= 3 || results.length >= limit) break;
        }
      }
    }
  }
  try { await walk(root); } catch (_) { /* 忽略 */ }
  return results;
}

// ── 五类核验 ────────────────────────────────────────────────────────────────

function resolveTargetPath(root, target) {
  const norm = String(target).replace(/\//g, path.sep);
  if (path.isAbsolute(norm)) return norm;
  return path.join(root, norm);
}

async function verifyFileClaim(root, claim, gitLines) {
  const ev = [];
  const p = resolveTargetPath(root, claim.target);
  let st = null;
  try { st = await fs.promises.stat(p); } catch (_) { /* 走 miss 分支 */ }
  if (st && st.isFile()) {
    // Windows 大小写不敏感：stat 命中 ≠ 大小写一致——比对父目录真实文件名
    try {
      const entries = await fs.promises.readdir(path.dirname(p));
      const want = path.basename(p);
      if (!entries.includes(want)) {
        const ci = entries.find((s) => s.toLowerCase() === want.toLowerCase());
        if (ci) {
          return { verdict: 'partial', evidence: [`文件存在但大小写不同: 实际为 ${path.join(path.dirname(p), ci)}，声明为 ${p}`, 'Windows 不区分大小写所以能命中，但 Linux/CI 会 404——按实际大小写修正'], hint: '跨平台大小写陷阱（典型 AI 改名失配）' };
        }
      }
    } catch (_) { /* 比对失败不影响主判定 */ }
    ev.push(`文件存在: ${p}（${st.size} 字节, mtime ${st.mtime.toISOString().slice(0, 19)}）`);
    // git 交叉核对
    if (gitLines) {
      const norm = claim.target.replace(/\\/g, '/');
      const hit = gitLines.find((l) => l.endsWith(norm) || l.includes(norm));
      if (hit) ev.push(`git status: ${hit}`);
      else {
        return { verdict: 'partial', evidence: ev, hint: '文件存在，但不在 git status 中——若声明为「已修改/新增」则工作区无对应改动（可能已提交或声明失实）' };
      }
    }
    return { verdict: 'verified', evidence: ev };
  }
  if (st && st.isDirectory()) {
    return { verdict: 'refuted', evidence: [`${p} 存在但它是目录，不是文件`] };
  }
  // 大小写不敏感匹配（Windows 常见失配）
  const parent = path.dirname(p);
  const base = path.basename(p);
  try {
    const siblings = await fs.promises.readdir(parent);
    const ci = siblings.find((s) => s.toLowerCase() === base.toLowerCase() && s !== base);
    if (ci) {
      return { verdict: 'partial', evidence: [`目录存在但大小写不同: ${path.join(parent, ci)}`], hint: 'Windows 不区分大小写，跨平台脚本/CI 会挂——建议按实际大小写修正声明' };
    }
    // 同扩展名近似建议
    const ext = path.extname(base);
    const near = siblings.filter((s) => path.extname(s) === ext && path.basename(s, ext).toLowerCase().includes(path.basename(base, ext).slice(0, 4).toLowerCase())).slice(0, 4);
    const parentExists = await fs.promises.stat(parent).then(() => true, () => false);
    if (parentExists) {
      return {
        verdict: 'refuted',
        evidence: [`父目录存在但无此文件: ${parent}`, near.length ? `疑似相近文件: ${near.join(', ')}` : `目录内共 ${siblings.length} 项，无一匹配`].filter(Boolean),
      };
    }
    return { verdict: 'refuted', evidence: [`父目录不存在: ${parent}`] };
  } catch (_) {
    return { verdict: 'refuted', evidence: [`无法访问父目录: ${parent}`] };
  }
}

const DEF_PATTERNS = (sym) => {
  const src = core.safeIdentSrc(sym);
  if (!src) return [];
  const s = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`\\bfunction\\s+${s}\\b`),
    new RegExp(`\\b(?:const|let|var)\\s+${s}\\b`),
    new RegExp(`\\bclass\\s+${s}\\b`),
    new RegExp(`\\bexport\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+${s}\\b`),
    new RegExp(`\\binterface\\s+${s}\\b`),
    new RegExp(`\\btype\\s+${s}\\s*=`),
    new RegExp(`\\benum\\s+${s}\\b`),
    new RegExp(`\\bdef\\s+${s}\\b`),
    new RegExp(`\\bfn\\s+${s}\\b`),
    new RegExp(`\\bstruct\\s+${s}\\b`),
    new RegExp(`\\btrait\\s+${s}\\b`),
    new RegExp(`\\bfunc\\s+(?:\\([^)]*\\)\\s*)?${s}\\b`),
    new RegExp(`\\bpublic\\s+(?:static\\s+)?[\\w<>\\[\\]]+\\s+${s}\\s*\\(`),
  ];
};

const WORD_RE = (sym) => {
  const s = core.safeIdentSrc(sym);
  return s ? new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) : null;
};

async function findDefinition(root, fileAbs, sym) {
  let text;
  try { text = await fs.promises.readFile(fileAbs, 'utf8'); } catch (e) { return { error: String(e && e.message || e) }; }
  if (text.length > READ_MAX) return { error: '文件超过 2MB，未读取' };
  const lines = text.split('\n');
  const defs = DEF_PATTERNS(sym);
  const word = WORD_RE(sym);
  const defHits = [];
  const useHits = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (defs.some((re) => re.test(L))) defHits.push({ line: i + 1, text: L.trim().slice(0, 160) });
    else if (word && word.test(L)) useHits.push({ line: i + 1, text: L.trim().slice(0, 160) });
  }
  return { defHits, useHits };
}

async function verifySymbolClaim(root, claim) {
  const sym = claim.target;
  if (claim.file) {
    const fp = resolveTargetPath(root, claim.file);
    let st = null;
    try { st = await fs.promises.stat(fp); } catch (_) { /* miss */ }
    if (!st || !st.isFile()) {
      return { verdict: 'refuted', evidence: [`声明的宿主文件不存在: ${fp}`], hint: '文件不存在时符号无从谈起；先用 file 类声明核验文件本身' };
    }
    const r = await findDefinition(root, fp, sym);
    if (r.error) return { verdict: 'unverifiable', evidence: [`读取失败: ${r.error}`] };
    if (r.defHits.length) {
      return { verdict: 'verified', evidence: r.defHits.slice(0, 3).map((h) => `${claim.file}:${h.line}  ${h.text}`) };
    }
    if (r.useHits.length) {
      return {
        verdict: 'partial',
        evidence: r.useHits.slice(0, 3).map((h) => `${claim.file}:${h.line}  ${h.text}`),
        hint: '文件里有此名字的引用，但没有定义形态（function/const/class/def/fn…）——可能是导入重导出、动态定义或声明失实',
      };
    }
    return { verdict: 'refuted', evidence: [`文件存在（${claim.file}）但全文无此标识符`] };
  }
  // 全库：上限 verified/partial/unverifiable，绝不 refuted
  const hits = await repoSearch(root, sym, { limit: 24 });
  if (!hits.length) {
    return { verdict: 'unverifiable', evidence: [], hint: `全库搜索（node_modules/.git/dist 已排除）未见「${sym}」的定义或引用——可能是全局 API、运行时注入或第三方包成员，本工具不下证伪结论` };
  }
  // 命中里找定义形态
  const withDefs = [];
  const onlyUse = [];
  for (const h of hits.slice(0, 12)) {
    const r = await findDefinition(root, h.file, sym);
    if (r.defHits && r.defHits.length) withDefs.push(h);
    else onlyUse.push(h);
  }
  if (withDefs.length) {
    return { verdict: 'verified', evidence: withDefs.slice(0, 3).map((h) => `${path.relative(root, h.file).replace(/\\/g, '/')}:${h.line}  ${h.text}`) };
  }
  return {
    verdict: 'partial',
    evidence: onlyUse.slice(0, 3).map((h) => `${path.relative(root, h.file).replace(/\\/g, '/')}:${h.line}  ${h.text}`),
    hint: `仓库中仅见引用（共 ${hits.length} 处命中）未见定义——可能是重导出/第三方成员/全局`,
  };
}

async function readJsonish(fileAbs) {
  let text;
  try { text = await fs.promises.readFile(fileAbs, 'utf8'); } catch (e) { return { error: String(e && e.message || e) }; }
  if (text.length > READ_MAX) return { error: '文件超过 2MB' };
  // JSONC 剥离（字符串感知；regex 字面量风险可接受——package.json/config 类无 regex）
  let out = '';
  let inS = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inS) {
      out += ch;
      if (ch === '\\') { out += text[i + 1] || ''; i++; }
      else if (ch === inS) inS = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inS = ch; out += ch; continue; }
    if (ch === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (ch === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2); i = j === -1 ? text.length : j + 1; out += ' '; continue; }
    out += ch;
  }
  try { return { value: JSON.parse(out) }; } catch (e) { return { error: `不是合法 JSON: ${String(e && e.message || e).slice(0, 120)}` }; }
}

function walkPath(obj, segs) {
  let cur = obj;
  for (const seg of segs) {
    if (cur == null || typeof cur !== 'object') return { miss: true };
    if (Array.isArray(cur)) {
      const i = Number(seg);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { miss: true };
      cur = cur[i];
      continue;
    }
    if (!(seg in cur)) return { miss: true };
    cur = cur[seg];
  }
  return { value: cur };
}

async function verifyConfigClaim(root, claim) {
  const segs = claim.target.split('.');
  let fileAbs = claim.file ? resolveTargetPath(root, claim.file) : null;
  const ext = fileAbs ? path.extname(fileAbs).toLowerCase().replace('.', '') : '';

  // 未挂文件：先在根目录找同名键文件（package.json 的键 / 常见配置名）
  if (!fileAbs) {
    const first = segs[0];
    const candidates = [
      `${first}.json`, `${first}.jsonc`, `${first}.config.json`, `${first}.config.mjs`, `${first}.config.js`,
      `.${first}.json`, `.${first}rc`, `${first}.config.yaml`, `${first}.config.yml`, `${first}.config.toml`,
    ];
    for (const cand of candidates) {
      const p = path.join(root, cand);
      try { const st = await fs.promises.stat(p); if (st.isFile()) { fileAbs = p; break; } } catch (_) { /* next */ }
    }
    if (!fileAbs && fs.existsSync(path.join(root, 'package.json'))) {
      const pkg = await readJsonish(path.join(root, 'package.json'));
      if (pkg.value) {
        const r = walkPath(pkg.value, segs);
        if (!r.miss) return { verdict: 'verified', evidence: [`package.json: ${claim.target} = ${JSON.stringify(r.value).slice(0, 120)}`] };
      }
    }
    if (!fileAbs) {
      return { verdict: 'unverifiable', evidence: [], hint: `未指定配置文件，且根目录找不到 ${candidates.join('/')} 等；用 claim_verify_batch 指定 file 后可精确核验` };
    }
  }

  let st = null;
  try { st = await fs.promises.stat(fileAbs); } catch (_) { /* miss */ }
  if (!st || !st.isFile()) {
    return { verdict: 'refuted', evidence: [`配置文件不存在: ${fileAbs}`] };
  }
  const rel = path.relative(root, fileAbs).replace(/\\/g, '/');

  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') {
    const r = await readJsonish(fileAbs);
    if (r.error) return { verdict: 'unverifiable', evidence: [`${rel} 解析失败: ${r.error}`] };
    const w = walkPath(r.value, segs);
    if (w.miss) return { verdict: 'refuted', evidence: [`${rel} 存在且为合法 JSON，但无键路径 ${claim.target}`] };
    return { verdict: 'verified', evidence: [`${rel}: ${claim.target} = ${JSON.stringify(w.value).slice(0, 120)}`] };
  }
  // YAML/TOML/ini/env：行式弱证据（末段键名匹配 [:=]）
  const key = segs[segs.length - 1];
  let text;
  try { text = await fs.promises.readFile(fileAbs, 'utf8'); } catch (e) { return { verdict: 'unverifiable', evidence: [`读取失败: ${e}`] }; }
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^\\s*#?\\s*(?:export\\s+)?["']?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*[:=]`).test(lines[i])) {
      hits.push(`${rel}:${i + 1}  ${lines[i].trim().slice(0, 160)}`);
      if (hits.length >= 3) break;
    }
  }
  if (hits.length) return { verdict: 'partial', evidence: hits, hint: `${ext.toUpperCase()} 无精确解析（零依赖边界）：行式匹配到末段键名，嵌套/作用域语义未验证` };
  return { verdict: 'unverifiable', evidence: [`${rel} 存在，但行式扫描未见键「${key}」`], hint: 'YAML/TOML/ini 类不做精确核验（避免误判嵌套作用域）；可转为 JSON 后用 file 类型精确核验' };
}

async function verifyPackageClaim(root, claim) {
  const name = claim.target;
  let st;
  try { st = await fs.promises.stat(path.join(root, 'package.json')); } catch (_) { st = null; }
  let nodeModules = false;
  try { nodeModules = (await fs.promises.stat(path.join(root, 'node_modules'))).isDirectory(); } catch (_) { /* no */ }
  if (!st && !nodeModules) {
    return { verdict: 'unverifiable', evidence: [], hint: '根目录无 package.json 也无 node_modules——不是 JS 项目或根选错，依赖声明无从核验' };
  }
  const ev = [];
  if (st) {
    const pkg = await readJsonish(path.join(root, 'package.json'));
    if (pkg.error) return { verdict: 'unverifiable', evidence: [`package.json 解析失败: ${pkg.error}`] };
    const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    for (const sec of sections) {
      const m = pkg.value && pkg.value[sec];
      if (m && Object.prototype.hasOwnProperty.call(m, name)) {
        ev.push(`package.json ${sec}: "${name}": "${m[name]}"`);
        return { verdict: 'verified', evidence: ev };
      }
    }
    ev.push('package.json 存在，但四段依赖均未声明该包');
  }
  // node_modules 实测（已装未声明 = partial）
  const nmPkg = path.join(root, 'node_modules', name, 'package.json');
  try {
    const st2 = await fs.promises.stat(nmPkg);
    if (st2.isFile()) {
      let ver = '';
      try { ver = JSON.parse(await fs.promises.readFile(nmPkg, 'utf8')).version || ''; } catch (_) { /* 忽略 */ }
      ev.push(`node_modules/${name}${ver ? `@${ver}` : ''} 已安装`);
      return { verdict: 'partial', evidence: ev, hint: '已安装但未在 package.json 声明——换机器/重装后会消失（幽灵依赖）' };
    }
  } catch (_) { /* 未安装 */ }
  return { verdict: 'refuted', evidence: ev.length ? ev : [`node_modules 中无 ${name}`], hint: ev.length ? 'package.json 与 node_modules 均无——import 该包会直接构建/运行失败' : undefined };
}

function cmpSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function verifyVersionClaim(root, claim) {
  const cmd = claim.target;
  const constraint = claim.constraint || '0';
  const v = validateProbeArgs(cmd, ['--version']);
  if (!v.ok) return { verdict: 'unverifiable', evidence: [], hint: v.reason };
  const r = await runProbe(root, cmd, ['--version']);
  if (!r.ok || r.code !== 0) {
    return { verdict: 'refuted', evidence: [`${cmd} --version 探测失败${r.error ? `: ${r.error.slice(0, 120)}` : `（exit ${r.code}）`}`, r.stdout ? `输出: ${r.stdout.slice(0, 120)}` : ''].filter(Boolean) };
  }
  const m = /(\d{1,3}\.\d{1,3}(?:\.\d{1,3})?)/.exec(r.stdout + ' ' + r.stderr);
  if (!m) return { verdict: 'unverifiable', evidence: [`${cmd} --version 输出无法解析: ${(r.stdout || r.stderr).slice(0, 120)}`] };
  const actual = m[1];
  if (cmpSemver(actual, constraint) >= 0) {
    return { verdict: 'verified', evidence: [`${cmd} 实际版本 ${actual} ≥ 声明的 ${constraint}`] };
  }
  return { verdict: 'refuted', evidence: [`${cmd} 实际版本 ${actual} < 声明的 ${constraint}`] };
}

async function verifyCliClaim(root, claim) {
  const cmd = claim.target;
  const subcmd = claim.subcmd || [];
  const flags = claim.flags || [];
  for (const f of flags) {
    if (!FLAG_RE.test(f)) return { verdict: 'unverifiable', evidence: [], hint: `flag 含非法字符: ${f}` };
  }
  const v = validateProbeArgs(cmd, subcmd);
  if (!v.ok) return { verdict: 'unverifiable', evidence: [], hint: v.reason };
  const probe = await probeHelp(root, cmd, subcmd);
  const sub = subcmd.length ? ` ${subcmd.join(' ')}` : '';
  if (!probe.ok && probe.denied) {
    return { verdict: 'unverifiable', evidence: [], hint: `「${cmd}${sub} --help」探测被安全策略拒绝（非白名单形态）` };
  }
  if (!probe.ok) {
    return { verdict: 'refuted', evidence: [`${cmd}${sub} 探测失败（进程启动错误）: ${(probe.error || '').slice(0, 120)}`], hint: '命令可能未安装' };
  }
  const text = (probe.stdout || '') + '\n' + (probe.stderr || '');
  const flagInHelp = (f) => {
    if (text.includes(f)) return true;
    // git 2.43+ 的 usage 把布尔开关打成 --[no-]flag 形态
    return f.startsWith('--') && text.includes(`--[no-]${f.slice(2)}`);
  };
  if (probe.code !== 0 && text.trim().length < HELP_MIN_BYTES) {
    return { verdict: 'refuted', evidence: [`${cmd}${sub} --help 探测无输出且退出码 ${probe.code}`], hint: '命令可能未安装或不可用' };
  }
  if (text.trim().length < HELP_MIN_BYTES) {
    return { verdict: 'unverifiable', evidence: [`${cmd}${sub} 帮助输出过短（${text.trim().length} 字节，可能拉起了浏览器/分页器）`], hint: '帮助文本不可靠，flag 无从核验；可人工 `--help` 后再下结论' };
  }
  if (!flags.length) {
    return { verdict: 'verified', evidence: [`${cmd}${sub} --help 正常输出 ${text.length} 字节（命令可用）`] };
  }
  const missing = [];
  const found = [];
  for (const f of flags) {
    if (flagInHelp(f)) found.push(f);
    else missing.push(f);
  }
  const ev = [];
  for (const f of found) {
    const line = text.split('\n').find((l) => l.includes(f));
    if (line) ev.push(`--help 输出命中: ${line.trim().slice(0, 160)}`);
  }
  if (missing.length) {
    return { verdict: 'refuted', evidence: [...ev, `--help 输出中未见: ${missing.join(' ')}`].filter(Boolean), hint: found.length ? `部分 flag 存在（${found.join(' ')}）但 ${missing.join(' ')} 无——混用失实 flag 是典型 AI 幻觉` : undefined };
  }
  return { verdict: 'verified', evidence: ev };
}

// ── 调度 ────────────────────────────────────────────────────────────────────

async function verifyClaims(root, claims, opts) {
  const options = opts || {};
  if (!isDir(root)) fail(`仓库根不存在或不是目录: ${root}`);
  const gitLines = options.skipGit ? null : await gitStatusLines(root);
  const out = [];
  for (const claim of claims) {
    let r;
    try {
      switch (claim.type) {
        case 'file': r = await verifyFileClaim(root, claim, gitLines); break;
        case 'symbol': r = await verifySymbolClaim(root, claim); break;
        case 'package': r = await verifyPackageClaim(root, claim); break;
        case 'cli': r = await verifyCliClaim(root, claim); break;
        case 'config': r = await verifyConfigClaim(root, claim); break;
        case 'version': r = await verifyVersionClaim(root, claim); break;
        default: r = { verdict: 'unverifiable', evidence: [], hint: '未知声明类型' };
      }
    } catch (e) {
      r = { verdict: 'unverifiable', evidence: [`核验器内部错误: ${String(e && e.message || e).slice(0, 160)}`] };
    }
    out.push({ ...claim, verdict: r.verdict, evidence: r.evidence || [], hint: r.hint || null });
  }
  return {
    root,
    scannedAt: new Date().toISOString(),
    gitStatusNote: gitLines ? `${gitLines.length} 条工作区改动` : '非 git 仓库（跳过 git 交叉核对）',
    summary: core.summarize(out),
    claims: out,
  };
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

module.exports = {
  EXEC_ALLOWLIST, verifyClaims, runProbe, validateProbeArgs,
  verifyFileClaim, verifySymbolClaim, verifyPackageClaim, verifyCliClaim, verifyConfigClaim, verifyVersionClaim,
  gitStatusLines, repoSearch, readJsonish, walkPath, resolveTargetPath, cmpSemver,
  findDefinition, probeHelp, isDir,
  PROBE_TIMEOUT_MS, tmpdir: os.tmpdir,
};
