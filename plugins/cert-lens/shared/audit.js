'use strict';
/**
 * audit.js —— cert-lens 体检规则引擎（离线、确定性；now 注入以便测试）
 *
 * 两类体检共用一个输出契约：
 *   finding = { id, severity: 'crit'|'warn'|'info'|'ok', title, detail, fix? }
 *   - auditCert(cm, {now, host?})   单张证书体检
 *   - auditChain(chain, cms, {now}) 链体检（assembleChain 输出 + 证书模型）
 * 规则口径写死在表里并全部有单测断言（fixture 矩阵逐条覆盖）。
 */
const { LIMITS } = require('./engine-api.js');

/** CA/B Forum SC-081 时间表（公网信任证书有效期上限，单位天） */
const VALIDITY_TIMELINE = [
  { since: '2026-03-15', maxDays: 200 },
  { since: '2027-03-15', maxDays: 100 },
  { since: '2029-03-15', maxDays: 47 },
];

function currentMaxValidityDays(now) {
  let cur = { maxDays: 398, since: '2020-09-01' }; // Apple/浏览器既有口径
  for (const row of VALIDITY_TIMELINE) {
    if (now >= new Date(`${row.since}T00:00:00Z`).getTime()) cur = row;
  }
  return cur;
}

function daysUntil(dateIso, now) {
  return Math.floor((new Date(dateIso).getTime() - now) / 86400000);
}

/**
 * 单张证书体检。host 给定时额外做 SAN 匹配。
 * selfSignedOk=true 时不报「自签」（hermetic 链/私有 CA 场景由调用方决定口径）。
 */
function auditCert(cm, { now, host = null, selfSignedOk = false, isLeafInChain = false } = {}) {
  const F = [];
  const daysLeft = daysUntil(cm.notAfter, now);
  const sev = daysLeft < 0 ? 'expired' : daysLeft <= LIMITS.EXPIRY.CRIT_DAYS ? 'crit' : daysLeft <= LIMITS.EXPIRY.WARN_DAYS ? 'warn' : daysLeft <= LIMITS.EXPIRY.INFO_DAYS ? 'info' : 'ok';

  // ── 有效期 ──
  if (sev === 'expired') {
    F.push({ id: 'expiry.expired', severity: 'crit', title: `证书已过期（${cm.notAfter.slice(0, 10)}）`, detail: `notAfter=${cm.notAfter}，已过期 ${-daysLeft} 天。TLS 客户端会直接拒绝。`, fix: '立即更换新证书；若在监控里，确认续期流水线为何没有执行。' });
  } else if (sev === 'crit' || sev === 'warn' || sev === 'info') {
    const label = sev === 'crit' ? `${daysLeft} 天内到期` : `剩余 ${daysLeft} 天`;
    F.push({ id: 'expiry.soon', severity: sev, title: `证书即将到期（${label}）`, detail: `notAfter=${cm.notAfter}`, fix: '确认自动续期在跑（ACME/内部 CA 轮换）；临期证书是停机头号来源。' });
  } else {
    F.push({ id: 'expiry.ok', severity: 'ok', title: `有效期充足（剩余 ${daysLeft} 天）`, detail: `notAfter=${cm.notAfter}` });
  }

  // ── 有效期长度（仅公网语义：自签/私有 CA 不适用 SC-081，避免噪音）──
  const maxV = currentMaxValidityDays(now);
  if (!cm.selfSigned && cm.validityDays > maxV.maxDays) {
    F.push({ id: 'validity.too-long', severity: 'info', title: `有效期 ${cm.validityDays} 天超过当前上限 ${maxV.maxDays} 天`, detail: `CA/B Forum 自 ${maxV.since} 起要求公网信任证书 ≤${maxV.maxDays} 天（2027-03 → 100 天，2029-03 → 47 天）。长有效期证书在 2026-03-15 后新签的公网体系里会不被信任；存量证书暂不受影响。`, fix: '续期周期跟上新规，缩短到 ≤200 天并配自动续期。' });
  }

  // ── 密钥强度 ──
  const ki = cm.keyInfo;
  if (ki.algo === 'RSA') {
    if (ki.bits && ki.bits < 2048) {
      F.push({ id: 'key.rsa-weak', severity: 'crit', title: `RSA 密钥 ${ki.bits} 位过弱`, detail: 'RSA-1024 已被主流客户端拒绝（安全强度 80 bit，2013 年后不合规）。', fix: '换 RSA ≥2048 或 EC P-256 重新签发。' });
    } else if (ki.bits && ki.bits < 3072) {
      F.push({ id: 'key.rsa-2048', severity: 'ok', title: `RSA-${ki.bits}（可接受）`, detail: '≥3072 位或 EC P-256 以上可延长安全余量。' });
    } else {
      F.push({ id: 'key.rsa-strong', severity: 'ok', title: `RSA-${ki.bits}`, detail: '' });
    }
  } else if (ki.algo === 'EC') {
    if (ki.bits && ki.bits < 256) {
      F.push({ id: 'key.ec-weak', severity: 'warn', title: `EC 曲线 ${ki.curve}（${ki.bits} 位）偏弱`, detail: 'P-256 及以上是当前基线。', fix: '优先 P-256/P-384。' });
    } else {
      F.push({ id: 'key.ec-ok', severity: 'ok', title: `EC ${ki.curve}（${ki.bits} 位）`, detail: '' });
    }
  } else if (ki.algo === 'Ed25519' || ki.algo === 'Ed448') {
    F.push({ id: 'key.ed-ok', severity: 'ok', title: `${ki.algo}`, detail: '现代签名算法。' });
  }

  // ── 签名算法 ──
  const sa = (cm.sigAlg || '').toLowerCase();
  if (sa.includes('md5')) {
    F.push({ id: 'sig.md5', severity: 'crit', title: 'MD5 签名算法', detail: 'MD5 早已可碰撞，任何现代客户端直接拒绝。', fix: '重新签发（SHA-256 以上）。' });
  } else if (sa.includes('sha1')) {
    F.push({ id: 'sig.sha1', severity: 'crit', title: 'SHA-1 签名算法', detail: 'SHA-1 自 2016 年起不被浏览器信任（chosen-prefix 碰撞已实用化）。', fix: '重新签发（SHA-256 以上）。' });
  } else if (sa) {
    F.push({ id: 'sig.ok', severity: 'ok', title: `签名算法 ${cm.sigAlg}`, detail: '' });
  } else {
    F.push({ id: 'sig.unknown', severity: 'warn', title: '签名算法未能识别', detail: 'DER 解析异常或非常规结构。' });
  }

  // ── SAN ──
  if (!cm.hasSan) {
    F.push({ id: 'san.missing', severity: 'warn', title: '证书没有 SAN（subjectAltName）扩展', detail: '现代客户端（Chrome/Node ≥12/Java 新版）只看 SAN，CN 已被忽略——即使 CN 正确也会报 HOSTNAME_MISMATCH。', fix: '重新签发并带上 SAN。' });
  }
  if (cm.hasSan && cm.san.dns.some((d) => d.startsWith('*.')) && cm.san.dns.some((d) => d.split('.').length > 3 && d.startsWith('*.*'))) {
    F.push({ id: 'san.multi-wildcard', severity: 'info', title: '存在多级通配符', detail: '多数客户端只接受最左一个 *（RFC 6125），*.*.example.com 形态兼容性差。' });
  }

  // ── 主机匹配（可选）──
  if (host && cm.hasSan) {
    // 延迟 require 防循环（certmodel 也 require engine-api，无环；直接 require 即可）
    const { hostnameMatches } = require('./certmodel.js');
    if (!hostnameMatches(cm, host)) {
      F.push({ id: 'san.host-mismatch', severity: 'crit', title: `SAN 不包含「${host}」`, detail: `SAN 列表：${[...cm.san.dns, ...cm.san.ips].join(', ') || '（空）'}。这会直接触发 ERR_TLS_CERT_ALTNAME_INVALID / NET::ERR_CERT_COMMON_NAME_INVALID。`, fix: '签发证书时把该主机名/IP 加进 SAN。' });
    } else {
      F.push({ id: 'san.host-match', severity: 'ok', title: `SAN 匹配 ${host}`, detail: '' });
    }
  }

  // ── CA 位 / 用途 ──
  if (cm.isCA && isLeafInChain) {
    F.push({ id: 'ca.as-leaf', severity: 'warn', title: '叶证书位置上是一张 CA 证书（basicConstraints CA:TRUE）', detail: '端点应使用叶证书；CA 证书当服务器证书是常见误配（多见于把根证书直接挂上服务）。', fix: '为该服务签发专用叶证书。' });
  }
  if (!cm.isCA && (cm.keyUsage.length > 0) && !cm.keyUsage.some((k) => /keyencipher|digitalSignature|keyagree/i.test(k.replace(/\s/g, '')))) {
    F.push({ id: 'ku.leaf', severity: 'warn', title: 'keyUsage 与服务器证书不匹配', detail: `keyUsage=${cm.keyUsage.join(', ')}；TLS 服务器证书通常需要 digitalSignature（RSA 还需 keyEncipherment）。` });
  }
  if (cm.isCA && cm.keyUsage.length > 0 && !cm.keyUsage.some((k) => /keycertsign/i.test(k.replace(/\s/g, '')))) {
    F.push({ id: 'ku.ca', severity: 'warn', title: 'CA 证书缺少 keyCertSign 用途位', detail: `keyUsage=${cm.keyUsage.join(', ')}；严格客户端会拒绝用它签发证书。` });
  }

  // ── 版本/序列号 ──
  if (cm.version < 3) {
    F.push({ id: 'cert.v1', severity: 'warn', title: `X.509 v${cm.version} 证书`, detail: 'v1/v2 无扩展字段，现代 PKI 基线要求 v3。' });
  }
  if (cm.serial && cm.serial.replace(/^0+/, '').length < 16) {
    F.push({ id: 'cert.serial-entropy', severity: 'info', title: '序列号熵不足（<64 位）', detail: 'CA/B Forum 要求序列号 ≥64 bits 熵；小整数序列号多见于手工/玩具签发流程。' });
  }

  // ── 自签 ──
  if (cm.selfSigned && !selfSignedOk) {
    F.push({ id: 'cert.self-signed', severity: 'info', title: '自签证书', detail: '签发者=使用者。公网客户端默认拒绝；内网/开发环境需显式信任（导入系统/客户端信任库，或 NODE_EXTRA_CA_CERTS）。' });
  }

  return F;
}

/**
 * 链体检：assembleChain 输出 + 证书模型数组。
 * chainContext: 'paste'（用户粘贴）| 'probe'（握手实际收到的链）
 */
function auditChain(chain, cms, { now } = {}) {
  const F = [];
  for (const iss of chain.issues) {
    if (iss.kind === 'duplicate') {
      F.push({ id: 'chain.duplicate', severity: 'warn', title: '链中存在重复证书', detail: iss.detail, fix: '去掉重复块（多见于根证书被重复粘贴）。' });
    } else if (iss.kind === 'missing-issuer') {
      F.push({ id: 'chain.missing-issuer', severity: 'warn', title: '链不完整：缺少签发者证书', detail: `${iss.detail}。浏览器可经 AIA 自动补链所以「网页能开」，但 openssl/多数程序语言/爬虫不会补——这正是「浏览器正常、curl 报错」的经典根因。`, fix: '服务端发送完整链（叶→中间→根），或把中间证书并入证书文件后重载服务。' });
    } else if (iss.kind === 'unverified') {
      // verifiedPairs 为空 ≠ 链被篡改：缺中间时相邻两张本来就无法验签（missing-issuer 已覆盖主因）。
      // 篡改场景会表现为 issuer 名字对不上（missing/unlinked），这里只做 info 提示，不冒充 crit。
      F.push({ id: 'chain.unverified', severity: 'info', title: '链上证书间无法相互验签', detail: `${iss.detail}（若补全中间证书后仍如此，才可能是链无效/被篡改）`, fix: '先补全链再复检。' });
    } else if (iss.kind === 'unlinked') {
      F.push({ id: 'chain.unlinked', severity: 'warn', title: '存在未入链证书', detail: iss.detail });
    } else if (iss.kind === 'order') {
      F.push({ id: 'chain.order', severity: 'info', title: '链序已自动修正', detail: iss.detail, fix: '建议源文件也按 叶→中间→根 顺序保存。' });
    }
  }
  if (chain.ordered.length && cms.length > 1) {
    const rootIdx = chain.ordered[chain.ordered.length - 1];
    const root = cms[rootIdx];
    if (root && root.selfSigned && root.isCA) {
      F.push({ id: 'chain.root-self-signed', severity: 'info', title: '根为自签 CA', detail: '公网信任需要根在客户端信任库里；私有 CA 场景属正常。' });
    }
  }
  return F;
}

/** 汇总级别（面向徽章渲染）：crit > warn > info > ok */
function worstSeverity(findings) {
  if (findings.some((f) => f.severity === 'crit')) return 'crit';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  if (findings.some((f) => f.severity === 'info')) return 'info';
  return 'ok';
}

module.exports = { auditCert, auditChain, worstSeverity, currentMaxValidityDays, VALIDITY_TIMELINE };
