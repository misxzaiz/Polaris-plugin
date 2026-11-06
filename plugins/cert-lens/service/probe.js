'use strict';
/**
 * probe.js —— 真实 TLS 握手探测器（cert-lens 诊断能力的核心）
 *
 * 双段握手策略（诊断信息量最大化的关键设计）：
 *   1) 严格段 rejectUnauthorized:true —— 拿到「系统信任库视角」的真实校验结果与错误码
 *   2) 宽松段 rejectUnauthorized:false —— 严格段失败时补拿完整链/协议/套件（诊断素材）
 * 两段都是只读探测：发 ClientHello、读握手、立即断开，不发任何应用数据。
 *
 * 内网可达性是本插件对在线检查工具的差异化能力：对 127.0.0.1/10.x/192.168.x/
 * 私有域名一律不设限（本地桌面诊断工具，用户对自己的网络有完全权限）。
 *
 * 超时语义：connect timeout 由 tls.connect 的 timeout 选项触发 'timeout' 事件，
 * 显式 destroy 后以 ETIMEDOUT 结算——绝不悬挂（复现 house「不用超时掩盖同步问题」纪律：
 * 超时是探测结果的合法终态，不是等待策略）。
 */
const tls = require('tls');
const net = require('net');
const { X509Certificate } = require('crypto');
const { parseCertificate } = require('../shared/certmodel.js');

/** 单段握手。resolve 一次即 destroy，防悬挂。 */
function rawHandshake({ host, port, servername, rejectUnauthorized, timeoutMs, alpn }) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const done = (r) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) { /* ignore */ }
      resolve(r);
    };
    const opts = {
      host, port,
      rejectUnauthorized,
      timeout: Math.max(500, timeoutMs),
      ALPNProtocols: alpn,
      // IP 直连时不自动设 servername（SNI 不允许 IP；显式 serverName 由调用方传入）
      ...(servername ? { servername } : {}),
    };
    socket = tls.connect(opts);
    socket.once('secureConnect', () => {
      // 收集完整链：getPeerCertificate(true) 是嵌套 issuerCertificate 结构；
      // 自签根会自指 → 必须按指纹去重防死循环
      const chainRaw = [];
      const seenFp = new Set();
      let c = null;
      try { c = socket.getPeerCertificate(true); } catch (_) { c = null; }
      while (c && c.raw) {
        let fp = '';
        try { fp = new X509Certificate(c.raw).fingerprint256; } catch (_) { fp = `raw${chainRaw.length}`; }
        if (seenFp.has(fp)) break;
        seenFp.add(fp);
        chainRaw.push(c.raw);
        c = c.issuerCertificate;
        if (c && !c.raw) break;
      }
      const info = {
        ok: true,
        authorized: socket.authorized === true,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher() ? { name: socket.getCipher().name, version: socket.getCipher().version } : null,
        alpn: socket.alpnProtocol || null,
        ephemeral: socket.getEphemeralKeyInfo ? socket.getEphemeralKeyInfo() : null,
        chainRaw,
      };
      done(info);
    });
    socket.once('error', (err) => {
      done({ ok: false, error: { code: err && err.code ? err.code : 'ERR_TLS', message: String((err && err.message) || err) } });
    });
    socket.once('timeout', () => {
      done({ ok: false, error: { code: 'ETIMEDOUT', message: `TLS 握手超时（${Math.round(timeoutMs / 1000)}s）——网络不通、防火墙丢包或服务不响应` } });
    });
  });
}

/**
 * 完整探测。返回（strip 后可直接 JSON）：
 * {
 *   ok, target:{host,port,serverName}, ms,
 *   strict: {ok, error?},                       // 系统信任库视角
 *   connected: bool,                            // TCP+TLS 至少完成宽松握手
 *   relaxed: {ok, protocol, cipher, alpn, ephemeral},
 *   chain: [certModel...],                      // 叶在前（strip 后）
 *   chainAudit: assembleChain 输出（索引指向 chain）,
 *   hostMatch: {host, matched, reason},         // SAN 复核
 *   error: {code, message}|null,                // 主错误（严格段优先）
 * }
 */
async function tlsProbe({ host, port, serverName = '', timeoutMs = 8000, now = Date.now() }) {
  const t0 = Date.now();
  const isIp = net.isIP(host) !== 0;
  const sni = serverName || (isIp ? '' : host); // IP 不带 SNI；显式 serverName 可调试 CDN 路由
  const alpn = ['h2', 'http/1.1'];

  const strict = await rawHandshake({ host, port, servername: sni || undefined, rejectUnauthorized: true, timeoutMs, alpn });
  let relaxed = null;
  if (!strict.ok) {
    // 严格失败也要素材：宽松握手拿链（TCP 都不通时宽松段同样失败，作为最终错误）
    relaxed = await rawHandshake({ host, port, servername: sni || undefined, rejectUnauthorized: false, timeoutMs, alpn });
  } else {
    relaxed = strict; // 严格成功时链信息已经在手，不多花一次握手
  }

  const chain = [];
  for (const raw of (relaxed && relaxed.chainRaw) || []) {
    try {
      const body = `-----BEGIN CERTIFICATE-----\n${raw.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;
      chain.push(parseCertificate(body, chain.length, now));
    } catch (_) { /* 单张异常不拖垮整体 */ }
  }

  const { assembleChain } = require('../shared/certmodel.js');
  const chainAudit = chain.length ? assembleChain(chain) : { leafIndex: null, ordered: [], issues: [], rootFound: false, verifiedPairs: [] };

  let hostMatch = { host, matched: null, reason: '无链可核对' };
  if (chain.length) {
    const { hostnameMatches } = require('../shared/certmodel.js');
    const leaf = chain[chainAudit.leafIndex != null ? chainAudit.leafIndex : 0];
    const matched = hostnameMatches(leaf, host) || (sni && sni !== host ? hostnameMatches(leaf, sni) : false);
    hostMatch = {
      host,
      matched,
      reason: matched ? 'SAN 包含目标主机' : 'SAN 不包含目标主机（IP 需要显式 IP SAN）',
    };
  }

  const ok = strict.ok === true;
  return {
    /** verified = 系统信任库校验通过（探测本身成功与否看 connected；防与 API 外层 ok 撞名） */
    verified: ok,
    target: { host, port, serverName: sni || null },
    ms: Date.now() - t0,
    strict: strict.ok ? { ok: true, authorized: strict.authorized } : { ok: false, error: strict.error },
    connected: Boolean(relaxed && relaxed.ok),
    relaxed: relaxed && relaxed.ok ? {
      protocol: relaxed.protocol,
      cipher: relaxed.cipher,
      alpn: relaxed.alpn,
      ephemeral: relaxed.ephemeral,
      authorized: relaxed.authorized,
      authorizationError: relaxed.authorizationError,
    } : null,
    chain,
    chainAudit,
    hostMatch,
    error: strict.ok ? null : (strict.error || (relaxed && relaxed.error) || null),
  };
}

module.exports = { tlsProbe, rawHandshake };
