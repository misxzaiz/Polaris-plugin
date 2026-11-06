'use strict';
/**
 * engine-api.js —— cert-lens 共享边界常量与纯函数（service / MCP / 测试同一权威）
 * 零外部依赖；除 clampTimeoutMs 外均为确定性纯函数（now 一律由调用方注入以便测试）。
 */

const LIMITS = {
  /** 单次粘贴/文件 PEM 输入上限：链 + 私钥通常 <50KB，2MB 已极宽松 */
  PEM_MAX_BYTES: 2 * 1024 * 1024,
  /** 探测超时缺省/上限（毫秒） */
  PROBE_TIMEOUT_DEFAULT_MS: 8000,
  PROBE_TIMEOUT_MAX_MS: 15000,
  /** 盯守端点数量上限（每次全检并发探测，控制总量） */
  WATCH_MAX_ENDPOINTS: 64,
  /** 单条诊断修复建议条数上限 */
  FIXES_MAX: 6,
  /** 到期分色阈值（天） */
  EXPIRY: { CRIT_DAYS: 7, WARN_DAYS: 30, INFO_DAYS: 90 },
  /** CA/B Forum SC-081：2026-03-15 起新签公网证书有效期上限 200 天 */
  MAX_VALIDITY_DAYS_PUBLIC: 200,
};

/** 探测超时钳制：非数字/越界回退缺省，夹在 [1000, MAX] */
function clampTimeoutMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return LIMITS.PROBE_TIMEOUT_DEFAULT_MS;
  return Math.min(Math.max(Math.round(n), 1000), LIMITS.PROBE_TIMEOUT_MAX_MS);
}

/**
 * 解析 "host:port" / "[::1]:443" / "host"（缺省端口 443）。
 * 返回 {ok, host, port, error?}；host 去协议前缀与路径尾巴（用户常整段粘 URL）。
 */
function normalizeTarget(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: '目标为空（需要 host 或 host:port）' };
  let s = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].trim();
  if (!s) return { ok: false, error: '目标为空' };
  let host = s;
  let port = 443;
  if (s.startsWith('[')) {
    // IPv6 字面量
    const m = s.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (!m) return { ok: false, error: `IPv6 目标格式非法：${s}（应为 [::1]:443）` };
    host = m[1];
    if (m[2]) port = Number(m[2]);
  } else {
    const i = s.lastIndexOf(':');
    if (i !== -1) {
      const p = s.slice(i + 1);
      if (!/^\d+$/.test(p)) return { ok: false, error: `端口不是数字：${p}` };
      host = s.slice(0, i);
      port = Number(p);
    }
  }
  if (!/^\d+$/.test(String(port)) || port < 1 || port > 65535) {
    return { ok: false, error: `端口超出范围 1-65535：${port}` };
  }
  host = host.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, error: '主机名为空' };
  return { ok: true, host, port };
}

/**
 * 拆分 PEM 文本为块。识别常见 PEM 标签；未知标签原样保留（报错由上层给）。
 * 返回 [{label, body}]；body 含 BEGIN/END 完整块。容许前后缀垃圾文本（用户常连同
 * 日志/说明一起粘贴）。DEK-INFO 等私钥细节不在此解析。
 */
const PEM_LABELS = [
  'CERTIFICATE', 'TRUSTED CERTIFICATE', 'PUBLIC KEY', 'RSA PUBLIC KEY',
  'PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY',
  'CERTIFICATE REQUEST', 'NEW CERTIFICATE REQUEST', 'X509 CRL',
];
function splitPemBlocks(text) {
  if (typeof text !== 'string') return [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  const blocks = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ label: m[1].trim(), body: m[0] });
  }
  return blocks;
}

/** 到期分色：daysLeft → 'ok' | 'info' | 'warn' | 'crit' | 'expired'（now 注入以便测试） */
function expirySeverity(daysLeft) {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= LIMITS.EXPIRY.CRIT_DAYS) return 'crit';
  if (daysLeft <= LIMITS.EXPIRY.WARN_DAYS) return 'warn';
  if (daysLeft <= LIMITS.EXPIRY.INFO_DAYS) return 'info';
  return 'ok';
}

/** 天数人性化：负数=已过 N 天 */
function humanDays(daysLeft) {
  const d = Math.round(daysLeft);
  if (d < 0) return `已过期 ${-d} 天`;
  if (d === 0) return '今天到期';
  return `剩余 ${d} 天`;
}

module.exports = {
  LIMITS, clampTimeoutMs, normalizeTarget, splitPemBlocks,
  PEM_LABELS, expirySeverity, humanDays,
};
