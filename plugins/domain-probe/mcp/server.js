#!/usr/bin/env node
'use strict';
/**
 * domain-probe MCP Server —— 域名诊断台的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译成 dom.* 键空间命令投递。诊断执行与结果写入
 * 的唯一权威是后台服务（service/main.js）——本层只投递命令并等待回执，与面板
 * 共享同一事实库（cap.kv）。全程只读查询，无危险操作面。
 *
 * 工具一览（6 个）：
 *   dom_diagnose   全面体检（DNS 基础+邮件身份+证书，打分与修复建议）
 *   dom_emailauth  邮件身份专项（SPF/DMARC/DKIM/MX）
 *   dom_cert       证书专项（有效期/覆盖/链校验）
 *   dom_lookup     单记录查询（可跨全部解析器对比传播一致性）
 *   dom_report     读取报告详情（缺省最近一次）
 *   dom_history    体检历史与趋势
 *
 * 连接方式：复用 service/kvclient.js 的端点自发现。
 * 启动参数：node mcp/server.js {{appConfigDir}}
 */
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'domain-probe';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';
const K = {
  meta: 'dom.meta',
  latest: 'dom.latest',
  history: 'dom.history',
  report: (id) => `dom.report.${id}`,
  cmd: 'dom.cmd',
  res: 'dom.res',
};

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (lv, msg) => log(lv, msg),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }
function oneLine(s, n = 110) {
  const s2 = String(s || '').replace(/\s+/g, ' ').trim();
  return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
}

// ── 命令投递（单槽信箱：写 cmd → 轮询 res 按 nonce 对齐）─────────────────────
let nonceCounter = 0;
async function sendCommand(action, payload, waitMs) {
  const nonce = `m${Date.now().toString(36)}-${++nonceCounter}`;
  await kv.kvSet(K.cmd, { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + (waitMs || 120000);
  let sawStale = false;
  while (Date.now() < deadline) {
    await sleep(1200);
    let res;
    try { res = await kv.kvGet(K.res); } catch (_) { continue; }
    if (res && res.nonce === nonce) {
      await kv.kvDel(K.res).catch(() => { /* 消费失败不影响结果读取 */ });
      return res.result || { ok: false, error: '回执为空' };
    }
    if (res && res.nonce) sawStale = true;
  }
  return {
    ok: false,
    pending: true,
    error: sawStale
      ? `命令已投递但 ${Math.round((waitMs || 120000) / 1000)}s 内未见回执（诊断仍在后台进行）。用 dom_report 轮询，或稍后再试。`
      : '命令已投递但服务无响应（服务可能未启动：设置→插件→域名诊断台 查看服务状态）。',
  };
}

// ── 报告渲染（AI 可读文本）──────────────────────────────────────────────────
const SEV_MARK = { red: '❌', yellow: '⚠️', info: '·', green: '✓' };
const KIND_CN = { full: '全面体检', email: '邮件身份', cert: '证书', lookup: '单查询' };

function renderFindings(findings) {
  return (findings || []).map((f) => {
    const mark = SEV_MARK[f.sev] || '·';
    const fix = f.fix ? `\n      → 修复：${oneLine(f.fix, 150)}` : '';
    const detail = f.detail ? `：${oneLine(f.detail, 170)}` : '';
    return `  ${mark} ${f.title}${detail}${fix}`;
  }).join('\n');
}

function renderCertSection(cert) {
  if (!cert || cert.refused) return `  证书：未探测（${oneLine((cert && cert.refused) || '', 120)}）`;
  const lines = [`  证书：${cert.subjectCn}｜签发 ${cert.issuer}｜有效至 ${String(cert.validTo).slice(0, 10)}（剩 ${cert.daysLeft} 天）`];
  if (cert.coversDomain) lines.push('  · SAN 覆盖本域 ✓');
  if (cert.verifiedIp) lines.push(`  · 连接核验 IP ${cert.verifiedIp}${cert.tlsVersion ? ` / ${cert.tlsVersion}` : ''}`);
  return lines.join('\n');
}

function renderMailSection(mail) {
  const lines = [];
  const spf = mail.spf || {};
  if (spf.records && spf.records.length) {
    lines.push(`  SPF：${spf.records[0]}`);
    if (spf.lookup) lines.push(`  · DNS 查询计数 ${spf.lookup.count}/10${spf.lookup.overLimit ? '（超限！）' : spf.lookup.atLimit ? '（达上限）' : ''}`);
  }
  const dm = mail.dmarc && mail.dmarc.record;
  lines.push(`  DMARC：${dm ? dm.raw : (mail.dmarc && mail.dmarc.orgGuess ? `本子域未发布（父域 ${mail.dmarc.orgGuess} 可能继承）` : '未发布')}`);
  const dkim = (mail.dkim || []).filter((x) => x.found);
  lines.push(`  DKIM：${dkim.length ? dkim.map((x) => `${x.selector}(${x.record && x.record.revoked ? '已撤销' : '有效'})`).join(', ') : '常见 selector 未发现'}`);
  if (mail.mx && mail.mx.answers && mail.mx.answers.length) {
    lines.push(`  MX：${mail.mx.answers.map((a) => `${a.pref != null ? a.pref + ' ' : ''}${a.data}`).join(', ')}`);
  } else if (mail.mx) {
    lines.push('  MX：无记录');
  }
  return lines.join('\n');
}

function renderReport(rep) {
  const lines = [];
  lines.push(`【${KIND_CN[rep.kind] || rep.kind}】${rep.domain}（runId=${rep.runId}）`);
  if (rep.fatal) lines.push(`✋ ${rep.fatal.cn || '失败'} ${oneLine(rep.fatal.detail || '', 120)}`);
  if (rep.score) lines.push(`评分 ${rep.score.total}/100（${(rep.score.verdict && rep.score.verdict.cn) || ''}）红${rep.counts.red} 黄${rep.counts.yellow} 信息${rep.counts.info} 正常${rep.counts.green}`);
  if (rep.kind === 'lookup' && rep.sections && rep.sections.per) {
    for (const p of rep.sections.per) {
      if (!p.ok) { lines.push(`  · ${p.resolver}: ❌ ${oneLine(p.error || '', 90)}`); continue; }
      const ans = (p.answers || []).slice(0, 12).map((a) => (a.typeName === 'MX' && a.pref != null ? `${a.pref} ${a.data}` : a.data));
      lines.push(`  · ${p.resolver}: ${p.statusCn}${ans.length ? ` → ${ans.join(', ')}` : '（无答案）'}`);
    }
    if (rep.sections.diff) lines.push(`  一致性：${rep.sections.diff.consistent ? '各解析器答案一致 ✓' : `不一致（${rep.sections.diff.groups.length} 组）`}`);
  } else {
    if (rep.sections && rep.sections.mail && rep.kind !== 'cert') lines.push(renderMailSection(rep.sections.mail));
    if (rep.sections && rep.sections.cert) lines.push(renderCertSection(rep.sections.cert));
  }
  if (rep.findings && rep.findings.length) {
    lines.push('检查结论：');
    lines.push(renderFindings(rep.findings));
  }
  if (rep.resolverFailures && rep.resolverFailures.length) {
    lines.push(`解析器失败记录：${rep.resolverFailures.slice(0, 4).map((f) => `${f.id}(${oneLine(f.error, 40)})`).join('；')}`);
  }
  return lines.join('\n');
}

// ── 工具实现 ────────────────────────────────────────────────────────────────
async function toolDiagnose(args) {
  const domain = String(args.domain || '').trim();
  if (!domain) return ok('请提供要体检的域名，例如 example.com。');
  const r = await sendCommand('full', { domain }, args.waitMs || 120000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  if (r.pending) return ok(`${r.error}\n\n可用 dom_report 轮询最新报告。`);
  return err(r.error || '体检失败');
}

async function toolEmailauth(args) {
  const domain = String(args.domain || '').trim();
  if (!domain) return ok('请提供域名。');
  const r = await sendCommand('email', { domain }, args.waitMs || 90000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  if (r.pending) return ok(`${r.error}\n\n可用 dom_report 轮询最新报告。`);
  return err(r.error || '邮件身份体检失败');
}

async function toolCert(args) {
  const domain = String(args.domain || '').trim();
  if (!domain) return ok('请提供域名。');
  const r = await sendCommand('cert', { domain }, args.waitMs || 60000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  if (r.pending) return ok(`${r.error}\n\n可用 dom_report 轮询最新报告。`);
  return err(r.error || '证书体检失败');
}

async function toolLookup(args) {
  const domain = String(args.domain || '').trim();
  const type = String(args.type || 'A').trim();
  if (!domain) return ok('请提供域名。');
  const r = await sendCommand('lookup', { domain, type, allResolvers: args.allResolvers === true }, args.waitMs || 60000);
  if (r.ok && r.report) return ok(renderReport(r.report));
  if (r.pending) return ok(`${r.error}\n\n可用 dom_report 轮询最新报告。`);
  return err(r.error || '查询失败');
}

async function toolReport(args) {
  const runId = String(args.runId || '');
  if (runId) {
    let rep = null;
    try { rep = await kv.kvGet(K.report(runId)); } catch (_) { /* 忽略 */ }
    if (rep) return ok(renderReport(rep));
    return err(`报告 ${runId} 不存在或已被清理（仅保留最近 6 份）`);
  }
  let latest = null;
  try { latest = await kv.kvGet(K.latest); } catch (_) { /* 忽略 */ }
  if (!latest) return ok('尚无体检报告。用 dom_diagnose / dom_emailauth / dom_cert 发起一次体检。');
  return ok(`（最近一次报告）\n${renderReport(latest)}`);
}

async function toolHistory(args) {
  let h = [];
  try {
    const v = await kv.kvGet(K.history);
    h = Array.isArray(v) ? v : [];
  } catch (e) { return err(`历史读取失败：${e.message}`); }
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
  const filterDomain = args.domain ? String(args.domain) : '';
  const rows = h.filter((x) => !filterDomain || x.domain === filterDomain).slice(0, limit);
  if (!rows.length) return ok('暂无历史记录。用 dom_diagnose 发起一次体检。');
  const KIND_CN2 = { full: '全面', email: '邮件', cert: '证书', lookup: '查询' };
  const lines = rows.map((x) => {
    const c = x.counts || {};
    return `${x.ok ? '✓' : '❌'} ${String(x.at || '').replace('T', ' ').slice(0, 16)} [${KIND_CN2[x.kind] || x.kind}] ${x.domain}${x.score != null ? ` ${x.score}分` : ''} 红${c.red || 0} 黄${c.yellow || 0}`;
  });
  // 同域名趋势摘要
  const byDomain = {};
  for (const x of h) {
    if (x.kind !== 'full' || !x.domain) continue;
    (byDomain[x.domain] = byDomain[x.domain] || { n: 0, scores: [] });
    byDomain[x.domain].n += 1;
    if (x.score != null) byDomain[x.domain].scores.push(x.score);
  }
  const trend = Object.entries(byDomain).slice(0, 8).map(([d, t]) => {
    const s = t.scores;
    const delta = s.length >= 2 ? s[0] - s[1] : 0;
    return `${d}：${t.n} 次${s.length ? `，最近 ${s[0]}${delta ? `（较上次${delta > 0 ? '升' : '降'} ${Math.abs(delta)}）` : ''}` : ''}`;
  });
  return ok(`最近记录：\n${lines.join('\n')}\n\n域趋势：\n${trend.join('\n')}`);
}

// ── 工具注册（description 写「适用句式」）───────────────────────────────────
const tools = [
  {
    name: 'dom_diagnose',
    description: '域名全面体检：DNS 基础（NS/SOA/A/AAAA/CAA/DNSSEC）+ 邮件身份（SPF 语法与 DNS 查询计数/DMARC 策略/DKIM/MX）+ TLS 证书（有效期/SAN 覆盖/链校验），打 0-100 分并给出每条问题的中文修复建议。适用于「帮我看看 example.com 的域名配置有没有问题」「邮件为什么进垃圾箱，查下我的域名」「证书快过期了吗」「体检一下这个域名」。',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '要体检的域名（如 example.com；中文域名请先转 punycode）' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 120000）' },
      },
      required: ['domain'],
    },
    call: toolDiagnose,
  },
  {
    name: 'dom_emailauth',
    description: '域名邮件身份专项体检：SPF 记录逐 token 解析与 RFC 7208 十次 DNS 查询上限计数、DMARC 策略标签 lint（p/pct/rua/adkim）、DKIM 常见 selector 探测、MX 记录体检（null MX/IP 字面量/重复）。适用于「为什么我的邮件被拒信/进垃圾箱」「检查 SPF 有没有超限」「帮我看看 DMARC 配置对不对」。',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '发信域名（通常是你 @ 后面的域名）' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 90000）' },
      },
      required: ['domain'],
    },
    call: toolEmailauth,
  },
  {
    name: 'dom_cert',
    description: '域名 TLS 证书专项检查：有效期剩余天数（14/30 天红黄预警）、SAN 是否覆盖该域名、是否自签发、证书链校验结果。先经 DoH 解析并复核公网 IP 后才连接（拒私网/内网目标）。适用于「我的证书什么时候过期」「这个域名的证书有问题吗」。',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '要检查证书的域名' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 60000）' },
      },
      required: ['domain'],
    },
    call: toolCert,
  },
  {
    name: 'dom_lookup',
    description: '查询单个域名的 DNS 记录（A/AAAA/MX/TXT/NS/SOA/CAA/DS/CNAME/PTR），可选 allResolvers=true 在阿里/DNSPod/Cloudflare/Google 四个公共解析器间对比答案一致性（判断解析变更是否已全球生效）。适用于「查一下 example.com 的 MX」「刚改了解析，生效了吗」「国内外解析结果一样吗」。',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '要查询的域名' },
        type: { type: 'string', enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'DS', 'CNAME', 'PTR'], description: '记录类型，默认 A' },
        allResolvers: { type: 'boolean', description: 'true=跨全部解析器对比（传播检查），默认只在主解析器查' },
        waitMs: { type: 'integer', description: '等待完成的毫秒数（默认 60000）' },
      },
      required: ['domain'],
    },
    call: toolLookup,
  },
  {
    name: 'dom_report',
    description: '读取体检报告详情（缺省=最近一次）。适用于「刚才那次体检的完整结果」「上次的报告」。',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: '报告 id（缺省=最近一次）' },
      },
    },
    call: toolReport,
  },
  {
    name: 'dom_history',
    description: '查看体检历史与域趋势（各域最近评分与升降）。适用于「之前体检过哪些域名」「我的域名分数最近变好还是变坏了」。',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '只看某域名' },
        limit: { type: 'integer', description: '返回条数（默认 15，上限 50）' },
      },
    },
    call: toolHistory,
  },
];

// ── stdio JSON-RPC 骨架（协议数据只走 stdout，日志全走 stderr）────────────────
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function respondErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (!msg || typeof msg !== 'object') return;

  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { respondErr(msg.id, -32602, `未知工具：${name}`); return; }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => respond(msg.id, err(`工具执行异常：${(e && e.message) || e}`)));
    return;
  }
  if (msg.method === 'ping') { respond(msg.id, {}); return; }
  // 未知请求忽略（保持骨架与宿主兼容）
}

log('info', `domain-probe MCP server 启动（${SERVER_VERSION}）`);
