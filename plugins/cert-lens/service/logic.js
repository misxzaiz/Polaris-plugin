'use strict';
/**
 * logic.js —— cert-lens 纯业务逻辑（service HTTP 与 MCP server 同一权威实现）
 * 无 HTTP / kv / listen 副作用；文件直读仅允许绝对路径（本机可信进程口径）。
 */
const fs = require('fs');
const path = require('path');

const api = require('../shared/engine-api.js');
const certmodel = require('../shared/certmodel.js');
const audit = require('../shared/audit.js');
const { diagnoseError, renderDiagnosis } = require('../shared/diagnose.js');
const { tlsProbe } = require('./probe.js');

function userErr(msg) { return Object.assign(new Error(msg), { user: true }); }

function readPemInput(body, field = 'pem') {
  const v = body[field];
  if (v == null || v === '') throw userErr(`需要 ${field}（PEM 文本）或 ${field}File（绝对路径）`);
  if (typeof v !== 'string') throw userErr(`${field} 必须是字符串`);
  if (Buffer.byteLength(v, 'utf8') > api.LIMITS.PEM_MAX_BYTES) throw userErr('PEM 输入超过上限 2MB');
  return v;
}

function readPemFile(fp, field) {
  if (!fp || typeof fp !== 'string') throw userErr(`需要 ${field}（PEM 文本）或 ${field}File（绝对路径）`);
  if (!path.isAbsolute(fp)) throw userErr(`${field}File 必须是绝对路径`);
  if (fp.includes('\0')) throw userErr(`${field}File 含非法字符`);
  let st;
  try { st = fs.statSync(fp); } catch (_) { throw userErr(`文件不存在或不可读：${fp}`); }
  if (st.size > api.LIMITS.PEM_MAX_BYTES) throw userErr('文件超过 2MB 上限');
  return fs.readFileSync(fp, 'utf8');
}

/** 解析 + 体检 + 链审计 + 可选配对（parse 主路径） */
function doParse(body, now) {
  const pem = body.pem != null ? readPemInput(body, 'pem') : readPemFile(body.pemFile, 'pem');
  const parsed = certmodel.parseInput(pem, now);
  const host = typeof body.host === 'string' && body.host.trim() ? body.host.trim().toLowerCase() : null;

  const certs = parsed.certs.map((cm) => ({
    ...certmodel.stripCertObj(cm),
    findings: audit.auditCert(cm, { now, host, isLeafInChain: parsed.certs.length > 0 }),
  }));
  for (const c of certs) c.findingsSeverity = audit.worstSeverity(c.findings);

  const chain = parsed.certs.length > 1 ? certmodel.assembleChain(parsed.certs) : null;
  const chainFindings = chain ? audit.auditChain(chain, parsed.certs, { now }) : [];

  let keyMatch = null;
  const keyPem = body.key != null ? readPemInput(body, 'key') : (body.keyFile ? readPemFile(body.keyFile, 'key') : null);
  if (keyPem && parsed.certs.length) {
    keyMatch = certmodel.matchKey(parsed.certs[0], keyPem);
  } else if (keyPem && !parsed.certs.length) {
    keyMatch = { matched: false, keyInfo: null, error: '没有可配对的证书（输入里没有 CERTIFICATE 块）' };
  }

  // 一无所获时明确报错（面板/MCP 都需要可操作的失败，而不是空结果）
  if (parsed.certs.length === 0 && parsed.pubkeys.length === 0) {
    const first = parsed.errors[0];
    throw userErr(`没有解析出证书或公钥：${first ? first.error : '输入中没有 PEM 块（需要 -----BEGIN CERTIFICATE----- 等）'}`);
  }

  return {
    kind: {
      certs: parsed.certs.length,
      pubkeys: parsed.pubkeys.length,
      privkeys: parsed.privkeys,
      encryptedKeys: parsed.encryptedKeys,
      csrBlocks: parsed.csrBlocks,
      crlBlocks: parsed.crlBlocks,
    },
    pubkeys: parsed.pubkeys,
    csrNote: parsed.csrBlocks ? `检测到 ${parsed.csrBlocks} 个 CSR（证书请求）：当前版本不解析 CSR 内容，签发后把证书粘进来即可体检` : null,
    crlNote: parsed.crlBlocks ? `检测到 ${parsed.crlBlocks} 个 CRL（吊销清单）：当前版本不解析` : null,
    encryptedKeyNote: parsed.encryptedKeys ? `检测到 ${parsed.encryptedKeys} 个加密私钥：不支持带口令配对，请先解密` : null,
    privkeyNote: parsed.privkeys && !keyPem ? `检测到 ${parsed.privkeys} 个私钥块：填 key/keyFile 可做证书↔私钥配对检查；私钥只在内存比对后即弃` : null,
    certs,
    chain: chain ? { leafIndex: chain.leafIndex, ordered: chain.ordered, issues: chain.issues, verifiedPairs: chain.verifiedPairs, rootFound: chain.rootFound } : null,
    chainFindings,
    chainSeverity: chainFindings.length ? audit.worstSeverity(chainFindings) : null,
    keyMatch,
    errors: parsed.errors,
  };
}

/** 目标归一（probe 主路径共用） */
function resolveTarget(body) {
  let host;
  let port;
  if (body.target != null) {
    const nt = api.normalizeTarget(body.target);
    if (!nt.ok) throw userErr(nt.error);
    host = nt.host;
    port = nt.port;
  } else if (typeof body.host === 'string' && body.host.trim()) {
    const nt = api.normalizeTarget(`${body.host.trim()}:${body.port || 443}`);
    if (!nt.ok) throw userErr(nt.error);
    host = nt.host;
    port = nt.port;
  } else {
    throw userErr('需要 target（"host:port"）或 host（+port 缺省 443）');
  }
  return { host, port };
}

async function doProbe(body, now) {
  const { host, port } = resolveTarget(body);
  if (body.serverName != null && typeof body.serverName !== 'string') throw userErr('serverName 必须是字符串');
  const timeoutMs = api.clampTimeoutMs(body.timeoutMs);
  const r = await tlsProbe({ host, port, serverName: body.serverName || '', timeoutMs, now });

  // 诊断组装：主错误 + 链体检 + 主机复核（severity 由规则/体检自带，不再猜）
  const diagnosis = [];
  if (r.error) {
    const d = diagnoseError(r.error);
    diagnosis.push({ from: 'error', id: d.id, severity: d.severity, title: d.title, cause: d.cause, fixes: d.fixes.slice(0, api.LIMITS.FIXES_MAX), matched: d.matched });
  }
  for (const f of audit.auditChain(r.chainAudit, r.chain, { now })) {
    if (f.severity !== 'ok') diagnosis.push({ from: 'chain', id: f.id, severity: f.severity, title: f.title, cause: f.detail, fixes: f.fix ? [f.fix] : [] });
  }
  if (r.hostMatch.matched === false) {
    const leaf = r.chain[r.chainAudit.leafIndex != null ? r.chainAudit.leafIndex : 0];
    const f = audit.auditCert(leaf, { now, host }).find((x) => x.id === 'san.host-mismatch');
    if (f) diagnosis.push({ from: 'host', id: f.id, severity: f.severity, title: f.title, cause: f.detail, fixes: f.fix ? [f.fix] : [] });
  }
  const expiries = r.chain.map((c) => ({ cn: c.cn, notAfter: c.notAfter, daysLeft: c.daysLeft, severity: api.expirySeverity(c.daysLeft) }));
  return {
    ...certmodel.stripCertObj(r),
    chain: r.chain.map((c) => ({ ...certmodel.stripCertObj(c), findings: audit.auditCert(c, { now, host, isLeafInChain: true }) })),
    diagnosis,
    expiries,
    severity: diagnosis.length ? audit.worstSeverity(diagnosis) : 'ok',
  };
}

function doDiagnose(body) {
  // code 单独给时走对象路径（精确码匹配）；文本路径由 diagnoseError 做下划线归一
  let input;
  if (typeof body.code === 'string' && body.code.trim() && !body.text && !body.message && !body.error) {
    input = { code: body.code.trim() };
  } else {
    input = body.text || body.message || body.error || body.code;
  }
  if (!input || (typeof input === 'object' && !Object.keys(input).length)) {
    throw userErr('需要 code（Node 错误码）、message/text（错误文本）或 error 对象');
  }
  const d = diagnoseError(input);
  return { rule: d.id, matched: d.matched, severity: d.severity, title: d.title, cause: d.cause, fixes: d.fixes.slice(0, api.LIMITS.FIXES_MAX), rendered: renderDiagnosis(d), input: d.input };
}

module.exports = { doParse, doProbe, doDiagnose, resolveTarget, userErr };
