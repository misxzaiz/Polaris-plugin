'use strict';
/**
 * cert-lens MCP server 源码（esbuild bundle → mcp/server.js，发布 zip 零 node_modules）。
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 五工具：cert_parse / tls_probe / tls_diagnose / cert_expiry_check / cert_selftest
 * 业务与面板/服务同一权威：service/logic.js + service/selftest.js + shared/*。
 *
 * 隐私口径：证书/私钥输入只在内存比对，stderr 日志不记录任何 PEM 内容，
 * 只记尺寸/耗时/目标 host:port。
 */
const fs = require('fs');
const path = require('path');
const api = require('../shared/engine-api.js');
const logic = require('../service/logic.js');
const { doSelftest } = require('../service/selftest.js');
const { tlsProbe } = require('../service/probe.js');

const SERVER_INFO = { name: 'cert-lens', version: '0.1.0' };
const log = (level, msg) => {
  try { process.stderr.write(`[cert-lens-mcp:${level}] ${new Date().toISOString()} ${msg}\n`); } catch (_) { /* ignore */ }
};

function userErr(msg) { return Object.assign(new Error(msg), { user: true }); }
function truncate(text, max) {
  const s = String(text == null ? '' : text);
  if (s.length <= max) return s;
  return s.slice(0, Math.floor(max * 0.7)) + `\n…（中段截断，全文 ${s.length} 字符）…\n` + s.slice(-Math.floor(max * 0.2));
}

const TOOLS = [
  {
    name: 'cert_parse',
    description:
      '解析 X.509 证书（PEM 文本或文件，支持整条证书链一起粘）并逐张体检：主体/签发者/SAN/有效期与剩余天数/' +
      '密钥算法与强度/签名算法/指纹/CA 位/自签判定，多张证书自动做链拼装验签（缺中间证书/乱序/假链检测），' +
      '可选传私钥做证书↔私钥配对检查（只在内存比对后即弃）。' +
      '适合：排查「浏览器能开 curl 报错」（缺中间证书）、核对部署的证书是否为新签、验证 SAN 是否覆盖目标主机名。',
    inputSchema: {
      type: 'object',
      properties: {
        pem: { type: 'string', description: 'PEM 文本（证书/证书链/公钥均可，多块自动拆分）；与 pemFile 二选一' },
        pemFile: { type: 'string', description: '证书文件绝对路径（≤2MB，如 fullchain.pem/server.crt）；与 pem 二选一' },
        key: { type: 'string', description: '私钥 PEM 文本（可选）——做证书↔私钥配对检查；与 keyFile 二选一' },
        keyFile: { type: 'string', description: '私钥文件绝对路径（可选，如 privkey.pem）' },
        host: { type: 'string', description: '可选：目标主机名/IP，会额外核对 SAN 是否覆盖' },
      },
    },
  },
  {
    name: 'tls_probe',
    description:
      '对 host:port 做真实 TLS 握手探测并出诊断报告：协商协议版本/密码套件/ALPN、实际收到的证书链（逐张体检）、' +
      '系统信任库校验结果、SAN 是否覆盖目标、每级证书到期倒计时；失败时给出中文根因与修复建议。' +
      '本地桌面工具可探测内网/自签端点（在线检查工具够不到）。适合：SSL 握手失败排障、证书部署核验、到期巡检。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '"host:port"（缺省端口 443；支持 [::1]:443 IPv6 形态；容许粘整段 URL）' },
        host: { type: 'string', description: '主机名或 IP；与 target 二选一' },
        port: { type: 'number', description: '端口，缺省 443' },
        serverName: { type: 'string', description: '可选：SNI/校验用主机名（调试 CDN 按域名路由、IP 端点校验域名证书时用）' },
        timeoutMs: { type: 'number', description: '握手超时毫秒，缺省 8000，上限 15000' },
      },
    },
  },
  {
    name: 'tls_diagnose',
    description:
      '把 TLS/证书错误翻译成中文根因+修复建议：接受 Node 错误码（如 UNABLE_TO_VERIFY_LEAF_SIGNATURE、' +
      'ERR_TLS_CERT_ALTNAME_INVALID）、浏览器报错（NET::ERR_CERT_AUTHORITY_INVALID 等）或任意含错误码的错误文本。' +
      '规则表覆盖 19 类高频错误（缺中间证书/自签链/过期/SAN 不匹配/协议套件不匹配/网络层…）。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Node/OpenSSL 错误码' },
        message: { type: 'string', description: '错误文本（含错误码的整段报错均可）；与 code 至少给一个' },
        text: { type: 'string', description: '同 message（别名）' },
      },
    },
  },
  {
    name: 'cert_expiry_check',
    description:
      '批量到期速查：对若干 host:port 逐个做 TLS 握手取叶证书剩余天数，输出分色表（>30 天 ok / ≤30 天 warn / ' +
      '≤7 天 crit / 已过期）。目标来源三选一：targets（逗号分隔）、file（每行一个目标的文本文件）、useWatch（读本插件盯守清单）。',
    inputSchema: {
      type: 'object',
      properties: {
        targets: { type: 'string', description: '逗号分隔的 host:port 列表，如 "api.example.com:443,internal.local:8443"' },
        file: { type: 'string', description: '文本文件绝对路径，每行一个 host:port（# 注释行跳过）' },
        useWatch: { type: 'boolean', description: 'true 时读取插件盯守清单（面板「盯守」页维护）' },
        timeoutMs: { type: 'number', description: '每个端点握手超时，缺省 8000' },
      },
    },
  },
  {
    name: 'cert_selftest',
    description: '试金石自检：fixture 证书矩阵断言（解析/过期/链拼装/乱序/配对/错误映射）+ 本地 hermetic TLS 服务器全链路握手。引擎行为异常时先跑这个。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── 渲染 ───────────────────────────────────────────────────────────────────
function fmtDate(iso) { return String(iso || '').replace('T', ' ').slice(0, 19) + ' UTC'; }

function renderFindings(findings) {
  const icon = { crit: '✗', warn: '▲', info: 'ℹ', ok: '✓' };
  return findings
    .filter((f) => f.severity !== 'ok' || f.id.startsWith('expiry.ok') || f.id.startsWith('key.') || f.id.startsWith('sig.ok'))
    .map((f) => `  ${icon[f.severity] || '·'} [${f.severity}] ${f.title}${f.detail ? ` — ${f.detail}` : ''}`)
    .join('\n');
}

function renderCertCard(c, idx) {
  const L = [];
  L.push(`#${idx + 1} ${c.cn || c.subjectText}${c.isCA ? '（CA 证书）' : ''}${c.selfSigned ? '（自签）' : ''}`);
  L.push(`   有效期：${fmtDate(c.notBefore)} → ${fmtDate(c.notAfter)}（${api.humanDays(c.daysLeft)}）`);
  if (c.san && (c.san.dns.length || c.san.ips.length)) {
    L.push(`   SAN：${[...c.san.dns, ...c.san.ips].join(', ')}`);
  } else {
    L.push('   SAN：（无——现代客户端只看 SAN，CN 已忽略）');
  }
  L.push(`   密钥：${c.keyInfo.algo}${c.keyInfo.bits ? `-${c.keyInfo.bits}` : ''}${c.keyInfo.curve ? `（${c.keyInfo.curve}）` : ''} | 签名：${c.sigAlg || '未知'}`);
  L.push(`   序列号：${c.serial} | 指纹(SHA-256)：${c.sha256Fp}`);
  if (c.findings && c.findings.length) L.push(renderFindings(c.findings));
  return L.join('\n');
}

async function toolCertParse(args) {
  const r = logic.doParse(args || {}, Date.now());
  const L = [];
  if (r.kind.certs === 0 && r.kind.pubkeys === 0) {
    L.push('没有解析出证书/公钥。');
    for (const e of r.errors) L.push(`  ✗ 块${e.index + 1}${e.label ? `(${e.label})` : ''}：${e.error}`);
    return L.join('\n');
  }
  L.push(`解析出 ${r.kind.certs} 张证书${r.kind.pubkeys ? `、${r.kind.pubkeys} 把公钥` : ''}：`);
  const order = r.chain ? r.chain.ordered : r.certs.map((_, i) => i);
  for (const idx of order) L.push(renderCertCard(r.certs[idx], idx));
  if (r.chain && r.chain.issues.length) {
    L.push('链体检：');
    for (const iss of r.chain.issues) L.push(`  ▲ ${iss.detail}`);
  }
  for (const f of r.chainFindings || []) {
    if (f.severity !== 'ok') L.push(`  [${f.severity}] ${f.title} — ${f.detail}`);
  }
  if (r.certs.find((c) => c.daysLeft < 0)) L.push('⚠ 存在已过期证书');
  if (r.keyMatch) {
    L.push(r.keyMatch.matched
      ? `✓ 私钥配对：匹配（${r.keyMatch.keyInfo ? `${r.keyMatch.keyInfo.algo}-${r.keyMatch.keyInfo.bits}` : ''}）`
      : `✗ 私钥配对：不匹配——${r.keyMatch.error}`);
  }
  for (const k of ['csrNote', 'crlNote', 'encryptedKeyNote', 'privkeyNote']) if (r[k]) L.push(`ℹ ${r[k]}`);
  for (const e of r.errors) L.push(`✗ ${e.label ? `${e.label}：` : ''}${e.error}`);
  return truncate(L.join('\n'), 12000);
}

async function toolTlsProbe(args) {
  const r = await logic.doProbe(args || {}, Date.now());
  const L = [];
  L.push(`探测 ${r.target.host}:${r.target.port}${r.target.serverName && r.target.serverName !== r.target.host ? `（SNI=${r.target.serverName}）` : ''}：${r.verified ? '✓ 校验通过' : '✗ 校验失败'}（${r.ms}ms）`);
  if (r.strict && r.strict.ok) {
    L.push('系统信任库校验：通过');
  } else if (r.strict && r.strict.error) {
    L.push(`系统信任库校验：失败（${r.strict.error.code}：${truncate(r.strict.error.message, 200)}）`);
  }
  if (r.relaxed) {
    L.push(`协商：${r.relaxed.protocol} | 套件 ${r.relaxed.cipher ? r.relaxed.cipher.name : '?'}${r.relaxed.alpn ? ` | ALPN ${r.relaxed.alpn}` : ''}`);
  }
  if (r.chain.length) {
    L.push(`收到链 ${r.chain.length} 级（叶在前）：`);
    const order = r.chainAudit.ordered.length ? r.chainAudit.ordered : r.chain.map((_, i) => i);
    for (const idx of order) L.push(renderCertCard(r.chain[idx], idx));
    L.push(`主机匹配：${r.hostMatch.matched === true ? '✓' : r.hostMatch.matched === false ? '✗' : '·'} ${r.hostMatch.reason}`);
  }
  if (r.diagnosis.length) {
    L.push('');
    L.push('诊断：');
    for (const d of r.diagnosis) {
      L.push(`  [${d.severity}] ${d.title}`);
      if (d.cause) L.push(`    ${truncate(d.cause, 260)}`);
      for (const f of d.fixes.slice(0, 4)) L.push(`    → ${f}`);
    }
  }
  return truncate(L.join('\n'), 14000);
}

async function toolTlsDiagnose(args) {
  const r = logic.doDiagnose(args || {});
  return r.rendered;
}

async function toolCertExpiryCheck(args) {
  const a = args || {};
  let targets = [];
  if (a.targets) {
    targets = String(a.targets).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  } else if (a.file) {
    if (!path.isAbsolute(String(a.file))) throw userErr('file 必须是绝对路径');
    targets = fs.readFileSync(String(a.file), 'utf8').split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
  } else if (a.useWatch) {
    // 读 kv 盯守清单：MCP 进程自行经 kvclient（与 service 同一发现逻辑）
    const { createKvClient } = require('../service/kvclient.js');
    const kv = createKvClient({ appConfigDir: '', log });
    const eps = (await kv.kvGet('cert-lens.endpoints')) || [];
    targets = eps.map((e) => `${e.host}:${e.port}`);
  } else {
    throw userErr('需要 targets（逗号分隔）、file（每行一个目标）或 useWatch=true');
  }
  if (!targets.length) throw userErr('目标列表为空');
  if (targets.length > api.LIMITS.WATCH_MAX_ENDPOINTS) throw userErr(`目标数超过上限 ${api.LIMITS.WATCH_MAX_ENDPOINTS}`);
  const now = Date.now();
  const timeoutMs = api.clampTimeoutMs(a.timeoutMs);
  const rows = [];
  let i = 0;
  const CONCURRENCY = 4;
  async function worker() {
    while (i < targets.length) {
      const idx = i++;
      const t = targets[idx];
      try {
        const r = await logic.doProbe({ target: t, timeoutMs }, now);
        const leaf = r.chain.length ? r.chain[r.chainAudit.leafIndex != null ? r.chainAudit.leafIndex : 0] : null;
        rows[idx] = { target: t, ok: r.verified, daysLeft: leaf ? leaf.daysLeft : null, notAfter: leaf ? leaf.notAfter : null, cn: leaf ? leaf.cn : null, severity: leaf ? api.expirySeverity(leaf.daysLeft) : 'crit', errorCode: r.error ? r.error.code : null };
      } catch (e) {
        rows[idx] = { target: t, ok: false, severity: 'crit', errorCode: 'INVALID', errorDetail: String((e && e.message) || e).slice(0, 120) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, targets.length)) }, worker));
  const icon = { ok: '✓', info: 'ℹ', warn: '▲', crit: '✗', expired: '✗' };
  const L = [`到期速查（${rows.length} 个端点，${new Date(now).toISOString().slice(0, 10)}）：`];
  for (const row of rows) {
    if (row.daysLeft != null) {
      L.push(`  ${icon[row.severity]} ${row.target.padEnd(34)} ${String(row.daysLeft).padStart(6)} 天  ${row.cn || ''}  ${fmtDate(row.notAfter)}`);
    } else {
      L.push(`  ${icon[row.severity]} ${row.target.padEnd(34)} 无法取得证书${row.errorCode ? `（${row.errorCode}${row.errorDetail ? '：' + row.errorDetail : ''}）` : ''}`);
    }
  }
  const alerts = rows.filter((r) => r.severity === 'crit' || r.severity === 'expired' || r.severity === 'warn');
  if (alerts.length) L.push(`需要处理：${alerts.length} 个端点（≤30 天或失败）`);
  return L.join('\n');
}

async function toolCertSelftest() {
  const r = await doSelftest();
  const lines = r.results.map((x) => `${x.pass ? '✓' : '✗'} ${x.name}${x.pass ? '' : ` — ${x.detail}`}`);
  return `试金石 ${r.pass}/${r.total} 通过（fail=${r.fail}）\n${lines.join('\n')}`;
}

const TOOL_IMPL = {
  cert_parse: toolCertParse,
  tls_probe: toolTlsProbe,
  tls_diagnose: toolTlsDiagnose,
  cert_expiry_check: toolCertExpiryCheck,
  cert_selftest: toolCertSelftest,
};

// ── stdio JSON-RPC 2.0 主循环（house 手搓协议：stdout 只输出协议行）─────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', () => process.exit(0));

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
function rpcError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) return;
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    const impl = TOOL_IMPL[name];
    if (!impl) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } });
      return;
    }
    const t0 = Date.now();
    try {
      const text = await impl(args);
      log('info', `tool=${name} ms=${Date.now() - t0}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(text) }], isError: false } });
    } catch (e) {
      log('info', `tool=${name} error ms=${Date.now() - t0} user=${Boolean(e && e.user)}`);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `错误：${(e && e.message) || String(e)}` }], isError: true } });
    }
    return;
  }
  if (id !== undefined && id !== null) rpcError(id, -32601, `未知方法: ${method}`);
}

let pending = Promise.resolve();
process.stdin.on('data', () => {
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    // 串行处理：探测是 IO 密集但单进程内保持顺序更可预期
    pending = pending.then(() => handle(msg)).catch((e) => {
      log('error', `handle: ${e && e.stack ? e.stack : e}`);
      if (msg && msg.id !== undefined && msg.id !== null) rpcError(msg.id, -32603, '内部错误');
    });
  }
});

process.on('uncaughtException', (e) => {
  log('error', `uncaught: ${e && e.stack ? e.stack : e}`);
});
process.on('unhandledRejection', (e) => {
  log('error', `unhandledRejection: ${e && e.stack ? e.stack : e}`);
});
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
