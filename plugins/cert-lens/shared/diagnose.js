'use strict';
/**
 * diagnose.js —— TLS/证书错误 → 中文根因与修复建议（离线规则表）
 *
 * 输入三来源都收敛到同一张表：
 *   1. Node 错误码（tls.connect 的 err.code）——probe 主路径
 *   2. 浏览器系报错文本（NET::ERR_CERT_*）——用户从浏览器复制
 *   3. openssl 系错误文本（error:0A000086:SSL routines::...）——用户从 CLI 复制
 * 匹配顺序：精确 code → 正则 → 兜底启发。每条建议 ≤6 条，可断言。
 */

// severity：该类错误作为「诊断结论」的定级（crit=服务端必须处理；warn=需确认/常见常态）
const RULES = [
  {
    id: 'self-signed-leaf',
    codes: ['DEPTH_ZERO_SELF_SIGNED_CERT'],
    re: /self[- ]signed certificate/i,
    title: '端点使用自签证书，客户端信任库中没有它',
    cause: '服务器直接把一张「签发者=自己」的证书发给了客户端；该证书不在客户端的信任列表里。',
    fixes: [
      '内网/开发场景属预期：把该证书（或其 CA 根）导入系统/客户端信任库',
      'Node 进程：NODE_EXTRA_CA_CERTS=/path/to/root.pem 指向该根证书',
      'curl：--cacert root.pem；浏览器：导入「受信任的根证书颁发机构」',
      '若这是公网生产端点：改为正规 CA 签发（Let\'s Encrypt 等），不要用自签',
    ],
  },
  {
    id: 'self-signed-in-chain',
    codes: ['SELF_SIGNED_CERT_IN_CHAIN'],
    re: /self[- ]signed certificate in (the )?certificate chain/i,
    title: '证书链中包含未受信的自签证书',
    cause: '服务器发送的链里有一级签发者（通常是根或中间）是自签的，且不在客户端信任库中——典型于私有 CA 签发的链。',
    fixes: [
      '把私有 CA 的根证书导入客户端信任库（而不是只信叶证书）',
      'Node：NODE_EXTRA_CA_CERTS 指向私有根；Java：keytool -importcert 到 cacerts',
      '确认服务器发送的链顺序正确（叶→中间→根），别把根发两次',
    ],
  },
  {
    id: 'untrusted-leaf',
    codes: ['UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
    re: /unable to verify (the )?first certificate|unable to verify leaf/i,
    title: '叶证书无法验证到受信根（最常见：服务端少发了中间证书）',
    cause: '客户端拿到叶证书后，本地和服务器都没提供通向受信根的路径。浏览器会经 AIA 自动补中间证书，所以「网页能开、curl/Node/Java 报错」。',
    fixes: [
      '把中间证书并入服务器证书文件（叶→中间→根 顺序），重载 Web 服务',
      '用本插件「解析」页粘贴你的链，看「缺中间证书」提示和 AIA 下载地址',
      'Nginx：ssl_certificate 使用 fullchain.pem 而非 cert.pem',
      '确认没有漏掉交叉签名的旧中间证书（老客户端需要）',
    ],
  },
  {
    id: 'issuer-not-found-locally',
    codes: ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY'],
    re: /unable to get (local )?issuer certificate/i,
    title: '客户端找不到签发者证书（信任库缺根或 CA 环境）',
    cause: '链的上层签发者既不在服务器发送的链里，也不在客户端信任库中。企业代理（Zscaler/Fortinet 等 TLS 拦截）场景高发。',
    fixes: [
      '公司代理环境：导入企业根证书到系统与运行时信任库（NODE_EXTRA_CA_CERTS 等）',
      '自建 CA：把根证书加入信任库',
      'Node：确认 NODE_EXTRA_CA_CERTS 路径存在且进程重启过',
      '检查服务器是否发送完整链（本插件「诊断」页看实际收到的链）',
    ],
  },
  {
    id: 'issuer-not-found',
    codes: ['UNABLE_TO_GET_ISSUER_CERT'],
    re: /unable to get issuer certificate(?! locally)/i,
    title: '链内部缺少签发者（服务端没发全链）',
    cause: '与 UNABLE_TO_GET_ISSUER_CERT_LOCALLY 相对：链里某一级的签发者不在「已收到的链」内，且不在本地信任库。',
    fixes: ['补全服务器端证书链（叶→中间→根）', '用本插件「解析」页核对链上缺哪一级'],
  },
  {
    id: 'cert-expired',
    codes: ['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_DATE_INVALID', 'ERR_CERT_DATE_INVALID'],
    re: /certificate has expired|cert(ificate)? (is )?expired|certificate (is )?not yet valid/i,
    title: '证书过期或尚未生效',
    cause: 'notAfter 已过（或客户端时钟错乱导致 notBefore 未到）。',
    fixes: [
      '续期并重载证书；用本插件「盯守」页把该端点加入到期盯守',
      '若证书明明没过期：检查本机时钟（NTP）——时钟偏差会触发日期校验失败',
      '刚续期仍报错：确认服务器真的重载了新证书（本插件诊断页看实际 notAfter）',
    ],
  },
  {
    id: 'hostname-mismatch',
    codes: ['ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_CERT_COMMON_NAME_INVALID', 'HOSTNAME_MISMATCH'],
    re: /hostname\/IP (does not match|mismatch)|doesn'?t match (the )?certificate|altname/i,
    title: '证书 SAN 不包含所访问的主机名/IP',
    cause: '现代客户端只看 subjectAltName：SAN 里没有目标主机名（或 IP 没有以 IP 形式进 SAN）。',
    fixes: [
      '重新签发：把正确主机名/IP 写进 SAN（IP 必须用 IP 条目，不能写 CN）',
      '访问路径与证书不一致：用 https://<证书里的名字>/ 而不是裸 IP',
      '通配符证书 *.example.com 不匹配 example.com 本身，也不匹配二级子域',
      '用本插件「解析」页核对 SAN 列表',
    ],
  },
  {
    id: 'wrong-version-number',
    codes: ['ERR_SSL_WRONG_VERSION_NUMBER'],
    re: /wrong version number/i,
    title: '该端口上不是 TLS（或版本极老）',
    cause: '对端不是 SSL/TLS 服务：最常见是明文 HTTP 端口、SMTP 25/587（需 STARTTLS）、或把 HTTPS 配到了错误端口。',
    fixes: [
      '确认端口号：HTTPS=443；SMTP 用 465(隐式TLS) 或 25/587(明文+STARTTLS)',
      '把目标换成真实 TLS 端口再探测',
      '自研服务：确认确实调用了 TLS accept（明文端口收到 TLS ClientHello 会回这个错）',
    ],
  },
  {
    id: 'unsupported-protocol',
    codes: ['ERR_SSL_UNSUPPORTED_PROTOCOL', 'ERR_SSL_VERSION_OR_CIPHER_MISMATCH'],
    re: /unsupported protocol|version or cipher mismatch|no protocols available|protocol version/i,
    title: '客户端与服务器无共同协议版本或密码套件',
    cause: '要么服务器只开老协议（TLS 1.0/1.1 已被现代客户端禁用），要么客户端只开新协议而服务器太老，要么套件集合完全错开（如仅国密/仅 ChaCha20）。',
    fixes: [
      '服务器太老：启用 TLS 1.2+（TLS 1.3 更佳），老协议应关停而非兼容',
      '客户端太老：升级运行时（老 JDK/老 OpenSSL 仅支持被淘汰的协议）',
      '确认中间设备（WAF/反代）没有剥掉 TLS 1.2+ 套件',
    ],
  },
  {
    id: 'no-cipher-match',
    codes: ['ERR_SSL_NO_CIPHER_MATCH'],
    re: /no cipher match|no shared cipher/i,
    title: '没有共同密码套件',
    cause: '双方支持的密码套件集合无交集（常见：服务器只配了弱套件被客户端安全级别拒绝，或仅国密单轨）。',
    fixes: ['服务器 cipher 配置恢复主流集合（ECDHE+AESGCM/CHACHA20）', '检查 OpenSSL security level 与 1024 位 DH 参数'],
  },
  {
    id: 'dh-too-small',
    codes: ['ERR_SSL_DH_KEY_TOO_SMALL'],
    re: /dh key too small|dh (server )?key/i,
    title: '服务器 DH 参数过弱（<2048 位）',
    cause: 'Logjam 后现代客户端拒绝 1024 位 DHE 套件。',
    fixes: ['服务器生成 2048+ 位 dhparam 并配置', '或禁用 DHE 仅用 ECDHE'],
  },
  {
    id: 'max-depth',
    codes: ['ERR_TLS_MAX_DEPTH_EXCEEDED'],
    re: /max depth exceeded/i,
    title: '证书链超过最大深度（>9 级）',
    cause: '链异常冗长，几乎总是配错（把根库整串发过来了）。',
    fixes: ['只发送 叶→中间→根 的最短链', '排查是否把 truststore 整包贴进了证书文件'],
  },
  {
    id: 'econnrefused',
    codes: ['ECONNREFUSED'],
    re: /ECONNREFUSED/i,
    title: '连接被拒绝（端口没有服务在听）',
    cause: 'TCP 层即失败，与 TLS 无关。',
    fixes: ['确认 host:port 正确、服务已启动', '检查防火墙/安全组', '本机服务确认监听地址（127.0.0.1 vs 0.0.0.0）'],
  },
  {
    id: 'etimedout',
    codes: ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'],
    re: /ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i,
    title: '连接超时/不可达（网络层）',
    cause: 'TCP 层失败：路由不通、防火墙丢包、VPN 未连。',
    fixes: ['先 ping/telnet 该端口', '检查 VPN/防火墙', '云主机查安全组入站规则'],
  },
  {
    id: 'enotfound',
    codes: ['ENOTFOUND'],
    re: /ENOTFOUND|getaddrinfo/i,
    title: '域名解析失败',
    cause: 'DNS 查不到该主机名。',
    fixes: ['检查拼写与 hosts 配置', '内网域名需要内网 DNS（或写 hosts）', '系统 DNS 服务器可用性'],
  },
  {
    id: 'econnreset',
    codes: ['ECONNRESET', 'EPIPE'],
    re: /ECONNRESET|EPIPE/i,
    title: '连接被对端重置',
    cause: '握手早期被切断：常见于中间设备拦截、服务崩溃、或对明文端口发 TLS 被立即关闭。',
    fixes: ['换端口/协议重试', '排查透明代理/WAF', '看服务器端错误日志对应时间点'],
  },
  {
    id: 'eproto',
    codes: ['EPROTO'],
    re: /EPROTO|wrong version|packet length|record layer/i,
    title: '协议错误（对端可能不是 TLS，或中间设备篡改）',
    cause: 'TLS 记录层读到了不符合协议的数据：明文端口、HTTP 代理返回了 HTML、或设备做了拦截。',
    fixes: ['确认端口上真的是 TLS 服务', '公司网络里确认代理规则（curl -v 看返回体）', '试直连/换网络排除中间设备'],
  },
  {
    id: 'cert-revoked',
    codes: ['ERR_TLS_CERT_REVOKED', 'ERR_CERT_REVOKED'],
    re: /revoked/i,
    title: '证书已被吊销',
    cause: 'CRL/OCSP 报告该序列号已被签发 CA 吊销。',
    fixes: ['重新签发并部署', '确认不是误报（CA 吊销错单）'],
  },
  {
    id: 'generic-cert-verify',
    codes: ['ERR_CERT_AUTHORITY_INVALID', 'ERR_SSL_CA_MD_TOO_WEAK', 'ERR_SSL_INVALID_CA'],
    re: /CERT_AUTHORITY_INVALID|ca md too weak|invalid ca/i,
    title: '证书颁发机构无效或不受信任',
    cause: '验证链路断在 CA 侧：根不受信、CA 签名算法被禁、或 CA 扩展不合法。',
    fixes: ['导入正确的根证书到信任库', 'CA 用 SHA-256 以上重新签发', '企业代理拦截场景导入企业根（NODE_EXTRA_CA_CERTS / 系统钥匙串）'],
  },
];

const FALLBACK = {
  id: 'fallback',
  title: '未能精确识别的 TLS/证书错误',
  cause: null,
  fixes: [
    '用本插件「诊断」页对同一端点做真实握手探测，拿到结构化错误码与完整链',
    '把完整错误文本（含 error code）拿到 AI 对话里让 AI 结合本插件工具排查',
  ],
};

/** 规则定级表（crit=服务端必须处理；warn=需确认/常见常态） */
const SEVERITY = {
  'self-signed-leaf': 'warn',
  'self-signed-in-chain': 'warn',
  'untrusted-leaf': 'crit',
  'issuer-not-found-locally': 'warn',
  'issuer-not-found': 'crit',
  'cert-expired': 'crit',
  'hostname-mismatch': 'crit',
  'wrong-version-number': 'warn',
  'unsupported-protocol': 'warn',
  'no-cipher-match': 'warn',
  'dh-too-small': 'warn',
  'max-depth': 'warn',
  'econnrefused': 'warn',
  'etimedout': 'warn',
  'enotfound': 'warn',
  'econnreset': 'warn',
  'eproto': 'warn',
  'cert-revoked': 'crit',
  'generic-cert-verify': 'warn',
  fallback: 'warn',
};

/** 任意输入（{code,message} 或自由文本）→ {rule, matched, severity}
 * 字符串路径：下划线归一为空格（'UNABLE_TO_VERIFY_LEAF_SIGNATURE' 这类纯下划线码也能走文本正则兜底） */
function diagnoseError(input) {
  let code = '';
  let message = '';
  if (typeof input === 'string') {
    message = input.replace(/_/g, ' ');
    const m = input.match(/\b([A-Z0-9_]*(?:CERT|SSL|TLS|SOCKET|CONN)[A-Z0-9_]*)\b/);
    if (m) code = m[1];
  } else if (input && typeof input === 'object') {
    code = String(input.code || '');
    message = String(input.message || input.error || '');
  }
  if (code) {
    const byCode = RULES.find((r) => r.codes.includes(code));
    if (byCode) return { ...byCode, severity: SEVERITY[byCode.id] || 'warn', matched: 'code', input: { code, message } };
  }
  if (message) {
    const byRe = RULES.find((r) => r.re && r.re.test(message));
    if (byRe) return { ...byRe, severity: SEVERITY[byRe.id] || 'warn', matched: 'pattern', input: { code, message } };
  }
  return { ...FALLBACK, severity: SEVERITY.fallback, matched: 'fallback', input: { code, message }, fixes: FALLBACK.fixes.slice(0, 6) };
}

/** 渲染为人类可读文本（MCP 输出用） */
function renderDiagnosis(d) {
  const lines = [`根因：${d.title}`, d.cause ? `解释：${d.cause}` : null, '建议：', ...d.fixes.map((f, i) => `  ${i + 1}. ${f}`)].filter(Boolean);
  return lines.join('\n');
}

module.exports = { RULES, diagnoseError, renderDiagnosis, FALLBACK };
