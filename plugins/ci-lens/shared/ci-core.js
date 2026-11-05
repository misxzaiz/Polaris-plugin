'use strict';
/**
 * ci-core.js —— CI 体检台共享核心（单一权威，运行时零依赖、零 node 内置模块）。
 *
 * 被 MCP server（esbuild bundle）与面板（browser bundle）共用；双方同一口径。
 *
 * 职责：
 *  1. lintDockerfile(text)：行状态机解析（续行 \ + BuildKit heredoc 感知），~15 条规则。
 *  2. lintWorkflow(text, doc, yamlError)：raw 行扫描（行级精确）+ 解析树走查（结构校验），
 *     doc 由调用方用 js-yaml 解析后传入（本文件不 require 任何解析器），~18 条规则。
 *  3. detectKind / scoreOf / renderReport / ruleCatalog。
 *
 * 严重级：error（会导致 CI 失败/构建错误）> warn（高度可疑/安全风险）> info（最佳实践）。
 * 评分：10 - error×2 - warn×0.7 - info×0.2，下限 0。
 *
 * 边界（如实声明）：
 *  - 不做 shellcheck 级 RUN 体内分析；heredoc 体不扫规则（视为 shell 原文）。
 *  - 不校验 actions 的输入参数（只做结构与表达式级检查）。
 *  - workflow 行号：raw 扫描类发现行级精确；解析树类发现按 job id 缩进定位（尽力而为）。
 *  - secrets 值永远只看引用名，不解析任何密钥内容。
 */

const SEV = { ERROR: 'error', WARN: 'warn', INFO: 'info' };
const DEDUCT = { error: 2, warn: 0.7, info: 0.2 };

function mk(rule, level, line, message, fix) {
  return { rule, level, line, message, fix: fix || '' };
}

/* ============================== 工具函数 ============================== */

function round1(n) { return Math.round(n * 10) / 10; }

/** 编辑距离（≤2 视为疑似拼写；仅用于 runs-on 标签近邻提示，输出与已知标签对照） */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** vixie 式 5 段 cron 字段校验（schedule.cron 专用；月/星期支持英文名；7=0 均为周日） */
const CRON_BOUNDS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const CRON_NAMES = [
  { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 },
  { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 },
];
function validateCron(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return { ok: false, detail: 'cron 为空' };
  if (expr.trim().startsWith('@')) return { ok: false, detail: `GitHub Actions 不支持 @${expr.trim().slice(1)} 简写，需 5 段 cron` };
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return { ok: false, detail: `应为 5 段（分 时 日 月 星期），实际 ${fields.length} 段` };
  for (let f = 0; f < 5; f++) {
    const [lo, hi] = CRON_BOUNDS[f];
    for (const item of fields[f].split(',')) {
      const m = /^(\*|\d+|[A-Za-z]{3})(?:-(\d+|[A-Za-z]{3}))?(?:\/(\d+))?$/.exec(item);
      if (!m) return { ok: false, detail: `第 ${f + 1} 段「${item}」格式无法识别` };
      const names = CRON_NAMES[f === 3 ? 0 : (f === 4 ? 1 : null)] || null;
      const num = (tok) => {
        if (/^\d+$/.test(tok)) return parseInt(tok, 10);
        if (names && names[tok.toUpperCase()] !== undefined) return names[tok.toUpperCase()];
        return NaN;
      };
      const a = num(m[1]);
      if (m[1] !== '*') {
        if (Number.isNaN(a)) return { ok: false, detail: `第 ${f + 1} 段「${item}」含无效数值/名称` };
        if (a < lo || a > hi && !(f === 4 && a === 7)) return { ok: false, detail: `第 ${f + 1} 段「${item}」超出范围 ${lo}-${hi}` };
        if (f === 4 && a === 7) { /* 7=周日，合法 */ }
      }
      if (m[2]) {
        const b = num(m[2]);
        if (Number.isNaN(b)) return { ok: false, detail: `第 ${f + 1} 段「${item}」范围终点无效` };
        if (b < lo || (b > hi && !(f === 4 && b === 7))) return { ok: false, detail: `第 ${f + 1} 段「${item}」范围超出 ${lo}-${hi}` };
        if (m[1] !== '*' && a > b) return { ok: false, detail: `第 ${f + 1} 段「${item}」范围起点大于终点` };
      }
      if (m[3] && parseInt(m[3], 10) < 1) return { ok: false, detail: `第 ${f + 1} 段「${item}」步长须 ≥1` };
    }
  }
  return { ok: true, detail: '' };
}

/* ============================== Dockerfile 引擎 ============================== */

const DOCKER_INSTRUCTIONS = new Set([
  'FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY',
  'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL',
  'HEALTHCHECK', 'SHELL',
]);

/**
 * Dockerfile 行状态机解析：
 *  - 全行注释 / 空行跳过；
 *  - 行尾 `\` 续行合并为一个逻辑指令（保留起始行号）；
 *  - BuildKit heredoc（<<EOF / <<-EOF）体视为 shell 原文跳过（边界：引号内伪 heredoc 标记忽略）。
 * 返回 { instructions: [{name,text,start,end}], lines }
 */
function parseDockerfile(text) {
  const lines = text.split(/\r?\n/);
  const instructions = [];
  let heredoc = null; // { delim, strip }
  let i = 0;
  while (i < lines.length) {
    if (heredoc) {
      const t = lines[i].trim();
      if (t === heredoc.delim) heredoc = null;
      i++;
      continue;
    }
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) { i++; continue; }

    // 续行合并（`\` 为行尾最后非空白字符）
    let j = i;
    const parts = [];
    for (;;) {
      const cur = lines[j];
      parts.push(cur.replace(/\\\s*$/, ''));
      if (/\\\s*$/.test(cur) && j + 1 < lines.length) { j++; } else { break; }
    }
    const joined = parts.join(' ').replace(/\s+/g, ' ').trim();

    // heredoc 标记检测（跳过引号内伪标记）
    let q = null; let marker = null;
    for (let k = 0; k < joined.length; k++) {
      const c = joined[k];
      if (q) { if (c === q) q = null; continue; }
      if (c === '\'' || c === '"') { q = c; continue; }
      if (c === '<' && joined[k + 1] === '<') {
        const m = /^<<(-?)\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(joined.slice(k));
        if (m) { marker = { delim: m[2], strip: m[1] === '-' }; break; }
      }
    }
    const mInst = /^([A-Za-z]+)(?:\s+(.*))?$/.exec(joined);
    const name = mInst ? mInst[1].toUpperCase() : '';
    if (DOCKER_INSTRUCTIONS.has(name)) {
      instructions.push({ name, text: joined.slice(name.length).trim(), start: i + 1, end: j + 1 });
    }
    if (marker) heredoc = marker;
    i = j + 1;
  }
  return { instructions, lines: lines.length };
}

// 按阶段切分（FROM 边界）；末阶段为运行时阶段（CMD/ENTRYPOINT/USER 语义归属末阶段）
function splitStages(instructions) {
  const stages = [];
  for (const inst of instructions) {
    if (inst.name === 'FROM') stages.push({ from: inst, instructions: [] });
    else if (stages.length) stages[stages.length - 1].instructions.push(inst);
    else stages.push({ from: null, instructions: [inst] }); // FROM 前的 ARG 等全局指令
  }
  return stages;
}

/** RUN 指令体内 sudo 词检测（排除 apt-get install … sudo 之类的包名与旗标） */
function findSudoUsage(text) {
  const pkgCtx = new Set(['install', 'add', 'remove', 'purge', 'autoremove', 'apt-get', 'apt', 'apk', 'yum', 'dnf', 'get', 'want', 'reinstall', 'mark']);
  const tokens = text.split(/\s+/);
  for (let k = 0; k < tokens.length; k++) {
    const clean = tokens[k].replace(/[^A-Za-z0-9_-]/g, '');
    if (clean === 'sudo') {
      // 回扫到最近的非旗标 token 作为上下文（-y / --no-install-recommends 等不是包名上下文）
      let prev = '';
      for (let j = k - 1; j >= 0; j--) {
        if (tokens[j].startsWith('-')) continue;
        prev = tokens[j].replace(/[^A-Za-z0-9_-]/g, '');
        break;
      }
      if (prev === '') return true; // RUN sudo …
      if (!pkgCtx.has(prev) && prev !== 'export' && prev !== 'useradd') return true;
    }
  }
  return false;
}

/** RUN 体内 curl/wget 管道直执行检测 */
function hasPipeToShell(text) {
  return /(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/.test(text);
}

/** apt-get install 后的包 token 是否含版本钉子（pkg=1.2.3 / pkg:arch=ver） */
function aptInstallUnpinned(text) {
  const m = /(?:apt-get\s+install|apt\s+install)([^&|;]*)/.exec(text);
  if (!m) return true;
  const pkgs = m[1].split(/\s+/).filter(Boolean);
  for (const p of pkgs) {
    if (p.startsWith('-')) continue;          // -y / --no-install-recommends 等旗标
    if (p.includes('=')) return false;        // pkg=version
  }
  return pkgs.length > 0;
}

const DOCKER_RULES = [
  { id: 'from_unpinned', level: 'warn', title: '基础镜像未钉版本', fix: 'FROM 指向明确 tag（如 node:20-alpine）或 digest（@sha256:…）；latest 会随上游漂移，同一 Dockerfile 两次构建可能得到不同结果。' },
  { id: 'apt_no_recommends', level: 'warn', title: 'apt-get install 缺 --no-install-recommends', fix: 'apt-get install -y --no-install-recommends …，避免拉入推荐包膨胀镜像。' },
  { id: 'apt_no_cache_cleanup', level: 'warn', title: 'apt 缓存未清理', fix: '同一条 RUN 内接 rm -rf /var/lib/apt/lists/*，缓存留在层里会让镜像平白变大。' },
  { id: 'apt_get_upgrade', level: 'warn', title: 'RUN 中执行 apt-get upgrade/dist-upgrade', fix: '删除该 upgrade：基础镜像内已含所需更新；无钉升级不可复现。按需 apt-get install 明确包。' },
  { id: 'apt_version_unpinned', level: 'info', title: 'apt 包未钉版本', fix: 'apt-get install pkg=1.2.3 钉版本，保证构建可复现；Debian 安全更新常改版本号，可在 Dependabot 里跟进。' },
  { id: 'apk_no_cache', level: 'warn', title: 'apk add 缺 --no-cache', fix: 'apk add --no-cache …，避免索引缓存留在镜像层。' },
  { id: 'sudo_used', level: 'warn', title: 'RUN 中使用 sudo', fix: '容器内默认已是 root，sudo 无意义且引入额外层；直接执行命令即可。' },
  { id: 'curl_pipe_sh', level: 'warn', title: 'curl/wget 管道直执行远程脚本', fix: '先下载到文件、校验 checksum/签名后再执行；管道直执行无法审计脚本内容，供应链风险高。' },
  { id: 'add_remote_url', level: 'warn', title: 'ADD 用于远程 URL', fix: '改用 RUN curl -fsSL -o file url && 校验和；ADD 远程 URL 不解压、无缓存校验，且层的校验和会随远端变化。' },
  { id: 'add_instead_of_copy', level: 'info', title: '本地路径建议 COPY 而非 ADD', fix: 'ADD 的隐式 tar 自动解包易引入意外行为；除非确实需要解包 tar，否则统一用 COPY。' },
  { id: 'copy_broad_dot', level: 'info', title: '全量 COPY（COPY . .）', fix: '配合 .dockerignore 排除 .git/secrets/node_modules，防止敏感文件进入镜像层。' },
  { id: 'multiple_cmd', level: 'error', title: '同一阶段出现多个 CMD', fix: '仅最后一个 CMD 生效，其余为无效配置；合并为一条或删除多余项。' },
  { id: 'multiple_entrypoint', level: 'error', title: '同一阶段出现多个 ENTRYPOINT', fix: '仅最后一个 ENTRYPOINT 生效；如需包装入口，用 exec-form ENTRYPOINT ["wrapper"] + CMD。' },
  { id: 'maintainer_deprecated', level: 'warn', title: 'MAINTAINER 已弃用', fix: '改用 LABEL org.opencontainers.image.authors="…"' },
  { id: 'env_legacy_space', level: 'warn', title: 'ENV 空格分隔旧语法', fix: '改为 ENV key=value；旧语法只支持单键且与值中的空格歧义。' },
  { id: 'workdir_relative', level: 'warn', title: 'WORKDIR 相对路径且无前置绝对 WORKDIR', fix: '先写绝对路径（WORKDIR /app），否则会隐式创建 /<name>。' },
  { id: 'no_user', level: 'info', title: '运行时阶段未声明 USER', fix: '末尾添加 USER appuser 并提前创建账号；容器默认以 root 运行扩大逃逸风险。' },
  { id: 'json_form_prefer', level: 'info', title: 'CMD/ENTRYPOINT 建议 exec 形式', fix: 'shell 形式经 /bin/sh -c 包装，无法接收 SIGTERM 导致 10s 后被强杀；改 ["executable","arg"] 形式。' },
  { id: 'no_healthcheck', level: 'info', title: '有 EXPOSE 但未声明 HEALTHCHECK', fix: '添加 HEALTHCHECK 指令，编排层才能感知容器真实健康状态（可选实践）。' },
  { id: 'run_cd', level: 'info', title: 'RUN 中 cd 切目录', fix: '用 WORKDIR /path 替代 cd；cd 只影响当前层命令，易在后续层失效。' },
];

/**
 * Dockerfile 体检。
 * 返回 { kind:'dockerfile', findings, stats:{lines,instructions,stages}, score, grade }
 */
function lintDockerfile(text) {
  const findings = [];
  const { instructions, lines } = parseDockerfile(text);
  const stages = splitStages(instructions);
  const lastStage = stages.length ? stages[stages.length - 1] : null;

  // 全局规则（任何阶段都算）
  let cmdCount = 0; let epCount = 0; // 末阶段计数
  let hasUser = false; let hasHealthcheck = false; let hasExpose = false; let exposeLine = 0;
  let seenAbsWorkdir = false; let seenWorkdir = false;
  const stageScoped = lastStage ? lastStage.instructions : [];

  for (const inst of instructions) {
    const L = inst.start;
    const t = inst.text;
    const tl = t.toLowerCase();

    if (inst.name === 'FROM') {
      let arg = t.replace(/--platform=\S+\s*/i, '').trim();
      const imgPart = arg.split(/\s+/)[0] || '';
      const img = imgPart.toLowerCase();
      if (img && img !== 'scratch') {
        if (!img.includes(':') && !img.includes('@')) {
          findings.push(mk('from_unpinned', SEV.WARN, L, `基础镜像未钉版本：FROM ${imgPart} 没有显式 tag（latest 等价物）`, `改为 ${imgPart}:<明确 tag>，或 @sha256: digest 锁死内容`));
        } else if (/:latest($|@)/.test(img)) {
          findings.push(mk('from_unpinned', SEV.WARN, L, `基础镜像 tag 为 latest：FROM ${imgPart} 内容随上游漂移`, `钉到具体版本 tag 或 digest`));
        }
      }
      seenAbsWorkdir = false; seenWorkdir = false; // 每阶段重置 WORKDIR 上下文
    }

    if (inst.name === 'MAINTAINER') {
      findings.push(mk('maintainer_deprecated', SEV.WARN, L, 'MAINTAINER 指令已弃用', 'LABEL org.opencontainers.image.authors="you@example.com"'));
    }

    if (inst.name === 'ENV' && !t.includes('=') && t.trim()) {
      findings.push(mk('env_legacy_space', SEV.WARN, L, `ENV 使用空格分隔旧语法：ENV ${t.split(/\s+/)[0]} …`, 'ENV key=value（= 号形式）'));
    }

    if (inst.name === 'WORKDIR') {
      seenWorkdir = true;
      const arg = t.trim();
      if (arg && !arg.startsWith('/') && !arg.includes('$')) {
        if (!seenAbsWorkdir) findings.push(mk('workdir_relative', SEV.WARN, L, `WORKDIR ${arg} 为相对路径且本阶段无前置绝对 WORKDIR`, '先写 WORKDIR /app 之类的绝对路径'));
      } else if (arg.startsWith('/')) seenAbsWorkdir = true;
    }

    if (inst.name === 'ADD') {
      const arg = t.replace(/--from=\S+\s*/i, '').trim();
      if (/https?:\/\//i.test(arg)) {
        findings.push(mk('add_remote_url', SEV.WARN, L, 'ADD 用于远程 URL', 'RUN curl -fsSL -o 文件 && echo 校验和 | sha256sum -c -'));
      } else if (!/\.tar($|\.)/i.test(arg.split(/\s+/)[0] || '')) {
        findings.push(mk('add_instead_of_copy', SEV.INFO, L, `ADD ${arg.split(/\s+/)[0]}：本地路径不需要自动解包时统一用 COPY`, 'COPY src dest'));
      }
    }

    if (inst.name === 'COPY' || inst.name === 'ADD') {
      const arg = t.replace(/--from=\S+\s*/i, '').trim();
      const parts = arg.split(/\s+/).filter((p) => p && !p.startsWith('--'));
      if (parts.length >= 2 && parts.slice(0, -1).some((p) => p === '.' || p === './')) {
        findings.push(mk('copy_broad_dot', SEV.INFO, L, `${inst.name} . . 全量复制构建上下文`, '补一个 .dockerignore（至少排除 .git、node_modules、*.env），或只 COPY 需要的子目录'));
      }
    }

    if (inst.name === 'RUN') {
      if (/\bapt-get\s+(dist-)?upgrade\b|\bapt\s+(dist-)?upgrade\b|\bapt-get\s+dist-upgrade\b/.test(tl)) {
        findings.push(mk('apt_get_upgrade', SEV.WARN, L, 'RUN 中执行 apt-get upgrade/dist-upgrade', '删除该语句；需要新版本包时显式 apt-get install pkg=版本'));
      }
      const aptInstall = /\bapt-get\s+install\b|\bapt\s+install\b/.test(tl);
      const aptUpdate = /\bapt-get\s+update\b|\bapt\s+update\b/.test(tl);
      if (aptInstall && !/--no-install-recommends/.test(tl)) {
        findings.push(mk('apt_no_recommends', SEV.WARN, L, 'apt-get install 未加 --no-install-recommends', 'apt-get install -y --no-install-recommends …'));
      }
      if (aptUpdate && !/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(tl)) {
        findings.push(mk('apt_no_cache_cleanup', SEV.WARN, L, 'apt-get update 后未清理 lists 缓存', '同条 RUN 结尾接 && rm -rf /var/lib/apt/lists/*'));
      }
      if (aptInstall && aptInstallUnpinned(tl)) {
        findings.push(mk('apt_version_unpinned', SEV.INFO, L, 'apt 安装的包未钉版本（pkg=1.2.3）', '钉版本保证可复现；或接受 Debian 点版本由基础镜像统一管理'));
      }
      if (/\bapk\s+add\b/.test(tl) && !/--no-cache/.test(tl)) {
        findings.push(mk('apk_no_cache', SEV.WARN, L, 'apk add 未加 --no-cache', 'apk add --no-cache …'));
      }
      if (findSudoUsage(tl)) {
        findings.push(mk('sudo_used', SEV.WARN, L, 'RUN 中使用 sudo（容器内已是 root）', '去掉 sudo 直接执行'));
      }
      if (hasPipeToShell(tl)) {
        findings.push(mk('curl_pipe_sh', SEV.WARN, L, 'curl/wget 输出经管道直接交给 sh 执行', '下载后校验 checksum/签名，再单独执行脚本'));
      }
      if (/(^|\s|&&|\|\||;)\s*cd\s+[^\s;|&]+\s*(&&|\s|$)/.test(tl)) {
        findings.push(mk('run_cd', SEV.INFO, L, 'RUN 中用 cd 切换目录', '改用 WORKDIR /path（对后续层持续生效）'));
      }
    }

    if (inst.name === 'USER') hasUser = true;
    if (inst.name === 'HEALTHCHECK') hasHealthcheck = true;
    if (inst.name === 'EXPOSE') { hasExpose = true; exposeLine = L; }
  }

  // 末阶段（运行时阶段）规则
  for (const inst of stageScoped) {
    if (inst.name === 'CMD') {
      cmdCount++;
      if (cmdCount > 1) findings.push(mk('multiple_cmd', SEV.ERROR, inst.start, `末阶段出现第 ${cmdCount} 个 CMD（只有最后一个生效）`, '删除多余 CMD 或合并为一条'));
      else if (!inst.text.trim().startsWith('[') && inst.text.trim()) {
        findings.push(mk('json_form_prefer', SEV.INFO, inst.start, 'CMD 为 shell 形式（经 /bin/sh -c 包装，收不到 SIGTERM）', 'CMD ["executable","arg1"] exec 形式'));
      }
    }
    if (inst.name === 'ENTRYPOINT') {
      epCount++;
      if (epCount > 1) findings.push(mk('multiple_entrypoint', SEV.ERROR, inst.start, `末阶段出现第 ${epCount} 个 ENTRYPOINT（只有最后一个生效）`, '删除多余 ENTRYPOINT'));
      else if (!inst.text.trim().startsWith('[') && inst.text.trim()) {
        findings.push(mk('json_form_prefer', SEV.INFO, inst.start, 'ENTRYPOINT 为 shell 形式（PID 1 语义问题）', 'ENTRYPOINT ["executable","arg1"] exec 形式'));
      }
    }
    if (inst.name === 'WORKDIR') { /* 末阶段重复检查已在全局 */ }
  }
  const lastStageFromLine = lastStage && lastStage.from ? lastStage.from.start : 1;
  if (!hasUser && stageScoped.some((s) => s.name === 'FROM' || s.name)) {
    findings.push(mk('no_user', SEV.INFO, lastStageFromLine, '运行时阶段未声明 USER（默认以 root 运行）', '创建普通用户并在末阶段声明 USER'));
  }
  if (hasExpose && !hasHealthcheck) {
    findings.push(mk('no_healthcheck', SEV.INFO, exposeLine, '声明了 EXPOSE 但没有 HEALTHCHECK', 'HEALTHCHECK CMD curl -fsS http://localhost:PORT/health || exit 1（可选实践）'));
  }

  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  const score = scoreOf(findings);
  return {
    kind: 'dockerfile',
    findings,
    stats: { lines, instructions: instructions.length, stages: stages.length, rules: DOCKER_RULES.length, error: countSev(findings, 'error'), warn: countSev(findings, 'warn'), info: countSev(findings, 'info') },
    score, grade: gradeOf(score),
  };
}

/* ============================== GitHub Actions 引擎 ============================== */

const WF_EVENTS = new Set([
  'branch_protection_rule', 'check_run', 'check_suite', 'create', 'delete', 'deployment',
  'deployment_status', 'discussion', 'discussion_comment', 'fork', 'gollum', 'issue_comment',
  'issues', 'label', 'merge_group', 'milestone', 'page_build', 'project', 'project_card',
  'project_column', 'public', 'pull_request', 'pull_request_review', 'pull_request_review_comment',
  'pull_request_target', 'push', 'registry_package', 'release', 'repository_dispatch',
  'schedule', 'status', 'watch', 'workflow_call', 'workflow_dispatch', 'workflow_run',
]);

const WF_TOP_KEYS = new Set(['name', 'run-name', 'on', 'true', 'permissions', 'env', 'defaults', 'concurrency', 'jobs']);

const WF_PERMISSION_SCOPES = new Set([
  'actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions', 'id-token',
  'issues', 'models', 'packages', 'pages', 'pull-requests', 'repository-projects', 'security-events',
]);

const RUNNER_KNOWN = [
  'ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04', 'ubuntu-20.04', 'ubuntu-18.04',
  'windows-latest', 'windows-2025', 'windows-2022', 'windows-2019',
  'macos-latest', 'macos-15', 'macos-14', 'macos-13', 'macos-12', 'self-hosted',
];

const WORKFLOW_RULES = [
  { id: 'wf_yaml_syntax', level: 'error', title: 'YAML 语法错误', fix: '先让 YAML 能解析；常见坑：Tab 缩进、冒号后没空格、中文引号、未加引号的 * 或 { 开头值。' },
  { id: 'wf_unknown_top_key', level: 'warn', title: '顶层出现未知键', fix: '检查拼写（如 job↔jobs、envs↔env）；未知顶层键会被 GitHub 静默忽略。' },
  { id: 'wf_unknown_event', level: 'warn', title: '未知触发事件名', fix: '对照官方事件清单修正拼写（如 pul_request↔pull_request）；错误事件名等于工作流永不触发。' },
  { id: 'wf_cron_invalid', level: 'warn', title: 'schedule.cron 表达式无效', fix: '5 段 cron（分 时 日 月 星期）；UTC 时间；日与星期同时受限时是 OR 语义。' },
  { id: 'wf_input_type', level: 'warn', title: 'workflow_dispatch 输入类型未知', fix: '合法类型：string / boolean / number / choice / environment。' },
  { id: 'wf_choice_no_options', level: 'warn', title: 'choice 输入缺 options', fix: 'choice 类型必须提供非空 options 数组，否则运行面板无可选项。' },
  { id: 'wf_permissions_value', level: 'warn', title: 'permissions 取值无效', fix: '顶层用 read-all/write-all；scope 级用 read/write/none；scope 名单见官方文档（contents/issues/pull-requests 等）。' },
  { id: 'wf_no_jobs', level: 'error', title: '缺少 jobs 定义', fix: 'jobs: 下至少定义一个 job。' },
  { id: 'wf_job_id_format', level: 'warn', title: 'job id 不符合命名规范', fix: 'job id 只能含字母数字 - _ 且不以数字开头；作为 needs/表达式引用键必须合法。' },
  { id: 'wf_missing_runs_on', level: 'error', title: 'job 缺 runs-on', fix: '为每个普通 job 指定 runs-on（如 ubuntu-latest）；可复用 job（job 级 uses:）除外。' },
  { id: 'wf_runner_label', level: 'warn', title: 'runs-on 标签疑似拼写错误', fix: '对照官方标签（ubuntu-latest/ubuntu-22.04/windows-latest/macos-14…）；自定义标签请确认是自托管池。' },
  { id: 'wf_needs_unknown', level: 'error', title: 'needs 引用了不存在的 job', fix: '修正 job id；needs 只能引用同一 workflow 内的 job。' },
  { id: 'wf_needs_cycle', level: 'error', title: 'needs 依赖成环', fix: '打破循环：工作流是 DAG，循环依赖会在启动时整体报错。' },
  { id: 'wf_missing_steps', level: 'warn', title: 'job 缺 steps', fix: '普通 job 必须有 steps 数组（或整体改为 job 级 uses: 复用）。' },
  { id: 'wf_no_timeout', level: 'info', title: 'job 未设 timeout-minutes', fix: '默认 360 分钟；卡死任务会烧满 6 小时计费额度。建议按经验值显式设置（如 timeout-minutes: 15）。' },
  { id: 'wf_uses_malformed', level: 'warn', title: 'uses 引用格式错误', fix: '外部 action：owner/repo@ref（或 owner/repo/path@ref）；本地 action：./path（必须以 ./ 开头）。' },
  { id: 'wf_uses_unpinned', level: 'info', title: 'action 未锚定 commit SHA', fix: '外部 action 用完整 40 位 SHA 锚定（tag 可变、SHA 不可变），防供应链投毒；可用 Dependabot 自动跟进更新。' },
  { id: 'wf_expr_unclosed', level: 'error', title: '${{ }} 表达式未闭合', fix: '补齐 }}；表达式解析失败会让步骤启动即失败。' },
  { id: 'wf_secrets_case', level: 'error', title: 'secrets.github_token 小写引用不存在', fix: '自动 token 是 secrets.GITHUB_TOKEN（全大写，大小写敏感）；自定义 secret 同理必须大小写完全一致。' },
  { id: 'wf_step_ref_unknown', level: 'error', title: 'steps.<id> 引用了不存在的步骤 id', fix: '检查目标步骤是否写了 id:；表达式引用的 id 区分大小写。' },
  { id: 'wf_output_step_missing', level: 'error', title: 'outputs 引用了不存在的步骤 id', fix: 'job outputs 映射指向的 steps.<id>.outputs.<k> 要求该步骤确实声明了 id。' },
  { id: 'wf_needs_output_unknown', level: 'error', title: 'needs.<job>.outputs.<k> 引用了未声明的输出', fix: '被依赖 job 的 outputs: 映射中必须显式声明该键，否则取到空串。' },
  { id: 'wf_needs_ref_unknown', level: 'error', title: '表达式引用了不存在的 needs job', fix: '检查 needs.<id> 中的 id 是否在 needs 列表与 jobs 定义中一致。' },
  { id: 'wf_pr_target_untrusted', level: 'error', title: 'pull_request_target + 检出 PR head 代码（危险组合）', fix: 'pull_request_target 以 base 分支权限运行外部 PR 触发；检出并执行 PR head 代码等于把仓库 secrets 交给不可信代码。改用 pull_request，或把不可信代码隔离在无 secrets 的 job。' },
  { id: 'wf_pr_target', level: 'warn', title: '使用 pull_request_target 触发', fix: '确认工作流不检出/不执行 PR 作者可控代码；只需跑自家代码时用 pull_request 更安全。' },
  { id: 'wf_redundant_if', level: 'info', title: 'if: ${{ success() }} 是冗余条件', fix: '步骤默认仅在之前步骤成功时运行，直接省略 if。' },
];

function countSev(findings, sev) { return findings.filter((f) => f.level === sev).length; }
function scoreOf(findings) {
  let s = 10;
  for (const f of findings) s -= DEDUCT[f.level] || 0;
  return round1(Math.max(0, s));
}
function gradeOf(score) {
  if (score >= 9) return '优';
  if (score >= 7.5) return '良';
  if (score >= 5) return '中';
  return '需整改';
}

/** 在 raw 文本中定位 jobs: 下缩进恰为 N 的键 → 行号映射（尽力而为，解析树无 span） */
function mapJobIdLines(lines) {
  const jobsStart = lines.findIndex((l) => /^\s*jobs\s*:/.test(l));
  if (jobsStart === -1) return new Map();
  const map = new Map();
  for (let i = jobsStart + 1; i < lines.length; i++) {
    const m = /^  ([^\s#][^:]*):\s*(?:#.*)?$/.exec(lines[i]);
    if (!m) continue;
    if (!map.has(m[1])) map.set(m[1].trim(), i + 1);
  }
  return map;
}
function lineOfPattern(lines, re) {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return null;
}

/** 扫描对象中所有字符串值（含嵌套），收集正则命中（用于 steps./needs. 引用检查） */
function collectExprRefs(node, out) {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/\bsteps\.([A-Za-z0-9_-]+)\s*\./g)) out.stepRefs.add(m[1]);
    for (const m of node.matchAll(/\bneeds\.([A-Za-z0-9_-]+)\s*\.\s*outputs\s*\.\s*([A-Za-z0-9_-]+)/g)) out.needsOutputRefs.push([m[1], m[2]]);
    for (const m of node.matchAll(/\bneeds\.([A-Za-z0-9_-]+)\b/g)) out.needsRefs.add(m[1]);
    return;
  }
  if (Array.isArray(node)) { for (const x of node) collectExprRefs(x, out); return; }
  if (node && typeof node === 'object') { for (const k of Object.keys(node)) collectExprRefs(node[k], out); }
}

/**
 * GitHub Actions 工作流体检。
 * @param text raw 文本（行级扫描用）
 * @param doc js-yaml load 产物（调用方解析；null 表示解析失败）
 * @param yamlError {line,message} | null
 */
function lintWorkflow(text, doc, yamlError) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const lineOf = (re) => lineOfPattern(lines, re);
  const jobLines = mapJobIdLines(lines);
  const jobsLine = lineOf(/^\s*jobs\s*:/);
  const onLine = lineOf(/^\s*on\s*:/) || lineOf(/^\s*true\s*:/) || 1;

  // ---------- raw 行级扫描（无论 YAML 是否解析成功都执行） ----------
  let sawCheckoutHead = false; let checkoutHeadLine = 0; let sawPrTargetInDoc = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith('#')) continue;

    // uses 引用（行级精确）
    const um = /\buses:\s*(['"]?)([^'"\s]+)\1/.exec(raw);
    if (um) {
      const ref = um[2];
      const L = i + 1;
      if (!ref.startsWith('docker://')) {
        if (ref.startsWith('./') || ref.startsWith('.\\')) {
          /* 本地 action，合法 */
        } else if (!ref.includes('@')) {
          findings.push(mk('wf_uses_malformed', SEV.WARN, L, `uses: ${ref} 缺少 @ref`, '外部 action 写 owner/repo@vN 或 owner/repo@SHA'));
        } else {
          const at = ref.indexOf('@');
          const rev = ref.slice(at + 1);
          if (!/^[0-9a-f]{40}$/i.test(rev)) {
            findings.push(mk('wf_uses_unpinned', SEV.INFO, L, `action 未锚定 SHA：${ref.split('@')[0]}@${rev}`, '锚定完整 40 位 commit SHA（Dependabot 可自动跟进 tag 更新）'));
          }
        }
      }
    }

    // secrets.github_token 小写（大小写敏感，必错）
    if (/\bsecrets\.github_token\b/.test(raw)) {
      findings.push(mk('wf_secrets_case', SEV.ERROR, i + 1, '引用了 secrets.github_token（不存在）', '自动 token 是 secrets.GITHUB_TOKEN；大小写必须完全一致'));
    }

    // pull_request head 检出标记
    if (/github\.event\.pull_request\.head/.test(raw)) {
      if (!sawCheckoutHead) { sawCheckoutHead = true; checkoutHeadLine = i + 1; }
    }

    if (/^\s*if:\s*\$\{\{\s*success\(\)\s*\}\}\s*$/.test(trimmed)) {
      findings.push(mk('wf_redundant_if', SEV.INFO, i + 1, 'if: ${{ success() }} 与默认行为等价', '直接删除该 if'));
    }
  }

  // ${{ … }} 配对扫描（跨行栈式配对；未闭合的 ${{ 行级定位）
  {
    const tokenRe = /\$\{\{|\}\}/g;
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      tokenRe.lastIndex = 0;
      let m;
      while ((m = tokenRe.exec(lines[i])) !== null) {
        if (m[0] === '${{') stack.push(i + 1);
        else stack.pop();
      }
    }
    const seenLines = new Set();
    for (const ln of stack) {
      if (!seenLines.has(ln)) {
        seenLines.add(ln);
        findings.push(mk('wf_expr_unclosed', SEV.ERROR, ln, '该行的 ${{ 表达式没有闭合 }}', '补齐 }}（跨行书写也允许，但必须闭合）'));
      }
    }
  }

  // ---------- 解析树走查（YAML 解析成功才执行） ----------
  if (yamlError) {
    findings.push(mk('wf_yaml_syntax', SEV.ERROR, yamlError.line || null, `YAML 解析失败：${yamlError.message}`, WORKFLOW_RULES.find((r) => r.id === 'wf_yaml_syntax').fix));
  } else if (doc && typeof doc === 'object') {
    // 顶层键
    for (const key of Object.keys(doc)) {
      if (!WF_TOP_KEYS.has(key)) {
        findings.push(mk('wf_unknown_top_key', SEV.WARN, lineOf(new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`)) || 1, `顶层键「${key}」不是合法 workflow 键`, '检查拼写；合法顶层键：name/on/permissions/env/defaults/concurrency/jobs'));
      }
    }

    // 触发事件
    const triggers = doc.on !== undefined ? doc.on : doc.true;
    let events = [];
    if (typeof triggers === 'string') events = [triggers];
    else if (Array.isArray(triggers)) events = triggers;
    else if (triggers && typeof triggers === 'object') events = Object.keys(triggers);
    for (const ev of events) {
      if (!WF_EVENTS.has(ev)) {
        findings.push(mk('wf_unknown_event', SEV.WARN, onLine, `未知触发事件「${ev}」`, '对照官方事件清单修正（pull_request / push / workflow_dispatch / schedule …）'));
      }
      if (ev === 'pull_request_target') sawPrTargetInDoc = true;
    }

    // schedule.cron
    if (triggers && typeof triggers === 'object' && triggers.schedule) {
      const items = Array.isArray(triggers.schedule) ? triggers.schedule : [triggers.schedule];
      for (const item of items) {
        const cron = item && item.cron;
        const v = validateCron(cron);
        if (!v.ok) {
          findings.push(mk('wf_cron_invalid', SEV.WARN, onLine, `schedule.cron「${String(cron)}」无效：${v.detail}`, '5 段 cron；注意 UTC 时区与日/星期的 OR 语义'));
        }
      }
    }

    // workflow_dispatch inputs
    const wd = triggers && typeof triggers === 'object' ? triggers.workflow_dispatch : null;
    if (wd && typeof wd === 'object' && wd.inputs && typeof wd.inputs === 'object') {
      for (const [name, spec] of Object.entries(wd.inputs)) {
        if (!spec || typeof spec !== 'object') continue;
        const type = spec.type;
        if (type !== undefined && !['string', 'boolean', 'number', 'choice', 'environment'].includes(type)) {
          findings.push(mk('wf_input_type', SEV.WARN, onLine, `输入「${name}」类型「${String(type)}」不合法`, 'string / boolean / number / choice / environment'));
        }
        if (type === 'choice') {
          const opts = spec.options;
          if (!Array.isArray(opts) || opts.length === 0) {
            findings.push(mk('wf_choice_no_options', SEV.WARN, onLine, `choice 输入「${name}」缺少 options`, '补非空 options 数组'));
          }
        }
      }
    }

    // permissions（顶层与 job 级）
    const checkPerms = (perms, L, where) => {
      if (typeof perms === 'string') {
        if (!['read-all', 'write-all'].includes(perms)) {
          findings.push(mk('wf_permissions_value', SEV.WARN, L, `${where} permissions「${perms}」不合法`, '顶层整体授权用 read-all / write-all'));
        }
        return;
      }
      if (perms && typeof perms === 'object') {
        for (const [scope, val] of Object.entries(perms)) {
          if (!WF_PERMISSION_SCOPES.has(scope) || !['read', 'write', 'none'].includes(val)) {
            findings.push(mk('wf_permissions_value', SEV.WARN, L, `${where} permissions「${scope}: ${String(val)}」不合法`, 'scope 见官方名单；值为 read/write/none'));
          }
        }
      }
    };
    if (doc.permissions !== undefined) checkPerms(doc.permissions, lineOf(/^\s*permissions\s*:/) || 1, '顶层');
    const hasTopPerms = doc.permissions !== undefined;

    // jobs 结构
    const jobs = doc.jobs;
    if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs) || Object.keys(jobs).length === 0) {
      findings.push(mk('wf_no_jobs', SEV.ERROR, jobsLine || 1, '缺少 jobs 定义（或为空）', 'jobs: 下至少定义一个 job'));
    } else {
      const jobIds = Object.keys(jobs);
      // 依赖图
      const graph = new Map();
      for (const id of jobIds) {
        const job = jobs[id];
        if (!job || typeof job !== 'object') continue;
        const L = jobLines.get(id) || jobsLine || 1;
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) {
          findings.push(mk('wf_job_id_format', SEV.WARN, L, `job id「${id}」不符合命名规范`, '仅字母数字 - _ 且不以数字开头'));
        }
        const needs = job.needs === undefined ? [] : (Array.isArray(job.needs) ? job.needs : [job.needs]);
        graph.set(id, needs.filter((n) => typeof n === 'string'));
        for (const n of needs) {
          if (n === id) {
            findings.push(mk('wf_needs_unknown', SEV.ERROR, L, `job「${id}」needs 引用了自身`, '依赖图不能自环'));
          } else if (!jobIds.includes(n)) {
            findings.push(mk('wf_needs_unknown', SEV.ERROR, L, `job「${id}」needs 引用了不存在的 job「${n}」`, `实际存在的 job：${jobIds.join('、')}`));
          }
        }
        const isCall = typeof job.uses === 'string';
        if (!isCall) {
          if (job['runs-on'] === undefined) {
            findings.push(mk('wf_missing_runs_on', SEV.ERROR, L, `job「${id}」缺少 runs-on`, 'runs-on: ubuntu-latest（可复用 job 除外）'));
          } else {
            const labels = Array.isArray(job['runs-on']) ? job['runs-on'] : [job['runs-on']];
            for (const lb of labels) {
              if (typeof lb !== 'string' || lb.includes('${{')) continue;
              if (RUNNER_KNOWN.includes(lb)) continue;
              const near = RUNNER_KNOWN.map((k) => [k, levenshtein(lb, k)]).sort((a, b) => a[1] - b[1])[0];
              if (near[1] <= 2) {
                findings.push(mk('wf_runner_label', SEV.WARN, L, `runs-on「${lb}」不是官方标签，疑似「${near[0]}」拼写错误`, `改为 ${near[0]}`));
              } else if (/^(ubuntu|windows|macos)-\d{2}(\.\d+)?$/.test(lb)) {
                findings.push(mk('wf_runner_label', SEV.WARN, L, `runs-on「${lb}」不是官方托管的版本标签`, '官方标签形如 ubuntu-22.04 / windows-2022 / macos-14；自托管标签请确认池内存在'));
              }
            }
          }
          if (job.steps === undefined || !Array.isArray(job.steps)) {
            findings.push(mk('wf_missing_steps', SEV.WARN, L, `job「${id}」缺少 steps`, 'steps: 列出要执行的步骤；或整 job 改为 uses: 复用'));
          }
          if (job['timeout-minutes'] === undefined) {
            findings.push(mk('wf_no_timeout', SEV.INFO, L, `job「${id}」未设 timeout-minutes（默认 360 分钟）`, '按经验值显式设置，避免卡死烧满 6 小时'));
          }
        }
        if (job.permissions !== undefined && !hasTopPerms) checkPerms(job.permissions, L, `job「${id}」`);
        if (job.permissions !== undefined && hasTopPerms) checkPerms(job.permissions, L, `job「${id}」`);

        // outputs → steps.<id> 存在性
        if (job.outputs && typeof job.outputs === 'object') {
          const stepIds = new Set(Array.isArray(job.steps) ? job.steps.filter((s) => s && typeof s === 'object' && s.id).map((s) => String(s.id)) : []);
          for (const val of Object.values(job.outputs)) {
            if (typeof val !== 'string') continue;
            for (const m of val.matchAll(/\bsteps\.([A-Za-z0-9_-]+)\s*\./g)) {
              if (!stepIds.has(m[1])) {
                findings.push(mk('wf_output_step_missing', SEV.ERROR, L, `outputs 引用了不存在的步骤 id「steps.${m[1]}」`, '给目标步骤补 id:，或修正引用'));
              }
            }
          }
        }

        // steps.<id> / needs.<id>.outputs.<k> 引用检查
        const refs = { stepRefs: new Set(), needsOutputRefs: [], needsRefs: new Set() };
        collectExprRefs(job, refs);
        const stepIds2 = new Set(Array.isArray(job.steps) ? job.steps.filter((s) => s && typeof s === 'object' && s.id).map((s) => String(s.id)) : []);
        for (const sid of refs.stepRefs) {
          if (sid !== '*' && !stepIds2.has(sid)) {
            findings.push(mk('wf_step_ref_unknown', SEV.ERROR, L, `job「${id}」引用了不存在的步骤 id「steps.${sid}」`, '检查拼写/补 id:'));
          }
        }
        for (const [jid, key] of refs.needsOutputRefs) {
          if (!jobIds.includes(jid)) {
            findings.push(mk('wf_needs_ref_unknown', SEV.ERROR, L, `表达式引用了不存在的 job「needs.${jid}」`, '检查 needs 列表与引用是否一致'));
          } else {
            const decl = jobs[jid] && jobs[jid].outputs;
            if (!decl || typeof decl !== 'object' || !(key in decl)) {
              findings.push(mk('wf_needs_output_unknown', SEV.ERROR, L, `needs.${jid}.outputs.${key} 未在上游 job 的 outputs: 中声明`, `上游 job「${jid}」需显式 outputs: { ${key}: \${{ steps.<id>.outputs.<k> }} }`));
            }
          }
        }
        // needs 引用（表达式内）未知 job
        for (const jid of refs.needsRefs) {
          if (!jobIds.includes(jid)) {
            findings.push(mk('wf_needs_ref_unknown', SEV.ERROR, L, `表达式引用了不存在的 job「needs.${jid}」`, '检查拼写与 needs 依赖'));
          }
        }
      }

      // 环检测（DFS）
      const state = new Map(); // 0=visiting 1=done
      const path = [];
      const dfs = (id) => {
        state.set(id, 0);
        path.push(id);
        for (const dep of graph.get(id) || []) {
          if (!graph.has(dep)) continue;
          if (state.get(dep) === 0) {
            const cyc = path.slice(path.indexOf(dep)).concat(dep).join(' → ');
            findings.push(mk('wf_needs_cycle', SEV.ERROR, jobLines.get(id) || jobsLine || 1, `needs 依赖成环：${cyc}`, '重新编排 job 顺序，打破循环'));
          } else if (!state.get(dep)) {
            dfs(dep);
          }
        }
        path.pop();
        state.set(id, 1);
      };
      for (const id of jobIds) if (!state.get(id)) dfs(id);
    }
  }

  // pull_request_target 危险组合（raw 标记 × doc 事件，两者都执行过）
  if (sawPrTargetInDoc && sawCheckoutHead) {
    findings.push(mk('wf_pr_target_untrusted', SEV.ERROR, checkoutHeadLine, 'pull_request_target 工作流中引用了 PR head 代码（github.event.pull_request.head.*）', 'pull_request_target 拥有仓库 secrets/写权限：检出并执行 PR head 代码 = 不可信代码提权。改用 pull_request 触发，或让不可信 job 与 secrets 隔离'));
  } else if (sawPrTargetInDoc) {
    findings.push(mk('wf_pr_target', SEV.WARN, onLine, '工作流使用 pull_request_target 触发（以 base 权限运行外部 PR）', '确认未检出/未执行 PR 作者可控代码；仅跑自家代码时改 pull_request'));
  }

  findings.sort((a, b) => (a.line || 0) - (b.line || 0) || a.rule.localeCompare(b.rule));
  const score = scoreOf(findings);
  return {
    kind: 'workflow',
    findings,
    stats: { lines: lines.length, rules: WORKFLOW_RULES.length, error: countSev(findings, 'error'), warn: countSev(findings, 'warn'), info: countSev(findings, 'info') },
    score, grade: gradeOf(score),
  };
}

/* ============================== 自动识别 / 报告 / 目录 ============================== */

/** 依内容自动识别配置类型（确定性启发式：信号计分，tie → unknown） */
function detectKind(text) {
  const t = text || '';
  let df = 0; let wf = 0;
  if (/^\s*FROM\s+\S+/im.test(t)) df += 3;
  if (/^\s*RUN\s+\S+/im.test(t)) df += 1;
  if (/^\s*ENTRYPOINT\s+|^\s*CMD\s+["\[]/im.test(t)) df += 1;
  if (/^\s*COPY\s+|^\s*ADD\s+\S+/im.test(t)) df += 1;
  if (/^\s*(ENV|WORKDIR|EXPOSE|ARG)\s+\S+/im.test(t)) df += 1;
  if (/^\s*jobs\s*:/m.test(t)) wf += 3;
  if (/^\s*on\s*:\s*$/m.test(t) || /^\s*on\s*:\s*\S/m.test(t)) wf += 2;
  if (/^\s*runs-on\s*:/m.test(t)) wf += 2;
  if (/^\s*steps\s*:\s*$/m.test(t)) wf += 1;
  if (/\buses:\s*\S+@\S+/.test(t)) wf += 1;
  if (df === 0 && wf === 0) return 'unknown';
  return df > wf ? 'dockerfile' : (wf > df ? 'workflow' : 'unknown');
}

/** 统一报告渲染（markdown，中文） */
function renderReport(r, fileLabel) {
  const s = r.stats;
  const head = fileLabel ? `**${fileLabel}**` : (r.kind === 'dockerfile' ? '**Dockerfile**' : '**GitHub Actions 工作流**');
  const linesOut = [];
  linesOut.push(`### CI 体检 —— ${head}`);
  linesOut.push(`评分 **${r.score}/10（${r.grade}）** · error ${s.error} · warn ${s.warn} · info ${s.info}`);
  if (s.lines !== undefined) linesOut.push(`扫描 ${s.lines} 行${s.instructions !== undefined ? ` · ${s.instructions} 条指令 · ${s.stages} 个构建阶段` : ''} · 内置规则 ${s.rules} 条`);
  if (!r.findings.length) {
    linesOut.push('✅ 未发现问题。');
    return linesOut.join('\n');
  }
  const groups = [['error', '❌ error（会导致构建/CI 失败）'], ['warn', '⚠️ warn（高度可疑 / 安全风险）'], ['info', '💡 info（最佳实践建议）']];
  for (const [sev, label] of groups) {
    const items = r.findings.filter((f) => f.level === sev);
    if (!items.length) continue;
    linesOut.push('');
    linesOut.push(`**${label}**`);
    for (const f of items) {
      const ln = f.line ? `行 ${f.line} · ` : '';
      linesOut.push(`- \`${f.rule}\` · ${ln}${f.message}${f.fix ? `　→ 修复：${f.fix}` : ''}`);
    }
  }
  return linesOut.join('\n');
}

/** 规则目录（MCP cil_rules / 面板规则视图共用） */
function ruleCatalog(kind) {
  const render = (rules, title) => {
    const out = [`**${title}（${rules.length} 条）**`];
    for (const r of rules) {
      const lv = r.level === 'error' ? '❌' : r.level === 'warn' ? '⚠️' : '💡';
      out.push(`- ${lv} \`${r.id}\` ${r.title} —— ${r.fix}`);
    }
    return out.join('\n');
  };
  if (kind === 'dockerfile') return render(DOCKER_RULES, 'Dockerfile 规则');
  if (kind === 'workflow') return render(WORKFLOW_RULES, 'GitHub Actions 工作流规则');
  return render(DOCKER_RULES, 'Dockerfile 规则') + '\n\n' + render(WORKFLOW_RULES, 'GitHub Actions 工作流规则');
}

/** 统一入口：kind=auto 时自动识别；kind=workflow 需要 parseYaml 由调用方注入 */
function lint(text, kind, deps) {
  if (kind === 'dockerfile' || (kind === 'auto' && detectKind(text) === 'dockerfile')) {
    return lintDockerfile(text);
  }
  if (kind === 'workflow' || (kind === 'auto' && detectKind(text) === 'workflow')) {
    const d = deps || {};
    let doc = null; let yamlError = null;
    if (typeof d.parseYaml === 'function') {
      try { doc = d.parseYaml(text); } catch (e) {
        yamlError = { line: e && e.mark ? (e.mark.line + 1) : null, message: (e && e.message ? String(e.message).split('\n')[0] : '未知 YAML 错误') };
      }
    } else {
      yamlError = { line: null, message: '无 YAML 解析器（仅行级扫描）' };
    }
    return lintWorkflow(text, doc, yamlError);
  }
  return null; // unknown
}

module.exports = {
  SEV, DEDUCT,
  parseDockerfile, lintDockerfile,
  lintWorkflow, detectKind, validateCron, levenshtein,
  scoreOf, gradeOf, renderReport, ruleCatalog, lint,
  DOCKER_RULES, WORKFLOW_RULES, WF_EVENTS, RUNNER_KNOWN, WF_PERMISSION_SCOPES,
};
