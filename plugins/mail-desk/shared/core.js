'use strict';
/**
 * core.js —— 邮件调试台共享核心(零依赖;面板经 esbuild 打包、service/MCP/测试
 * 直接 require,单一真相,与 mock-server/shared/core.js 同范式)
 *
 * 职责:
 *   - 常量与键空间契约(mdk.*)
 *   - 搜索匹配(主题/发件人/收件人/纯文本,大小写不敏感,CJK 直接 indexOf)
 *   - 邮件 HTML 预览的远程资源过滤(默认阻断跟踪像素,放行后可还原)
 *   - 环形淘汰决策(数量上限 + 总字节上限,淘汰最旧)
 *   - 验证码提取(AI 场景加速:6-8 位数字/字母混合,按上下文关键词加权)
 */
const crypto = require('crypto');

const VERSION = '0.1.0';

/** kv 键空间契约(唯一权威,改动须同步 service/main.js / mcp/server.js / 面板) */
const K = {
  settings: 'mdk.settings',  // {smtpPort} 用户配置(3s 热更)
  service: 'mdk.service',    // {port, smtpPort, token, pid, version, startedAt} 服务发现
  meta: 'mdk.meta',          // {version, count, totalBytes, smtpListening, updatedAt} 心跳(60s)
  selftest: 'mdk.selftest',  // 最近一次自检报告
};

/** 存储护栏 */
const LIMITS = {
  maxMailCount: 500,          // 环形数量上限
  maxTotalBytes: 200 * 1024 * 1024, // 200MB 环形总字节上限
  maxSingleMailBytes: 5 * 1024 * 1024, // 单封 5MB(SMTP size 与入库双闸)
  maxAttachmentB64: 8 * 1024 * 1024,   // 附件经 base64 下发的上限(超出拒绝并提示)
  maxRawPreviewBytes: 200 * 1024,      // 原文预览截断阈值
};

/** 默认端口(冲突时自动向后探测) */
const DEFAULTS = {
  httpPort: 9875,
  smtpPort: 1025,
  httpProbe: 10,  // HTTP 端口冲突探测数
  smtpProbe: 10,  // SMTP 端口冲突探测数
};

// ── 搜索 ────────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s == null ? '' : s).toLowerCase();
}

/**
 * 邮件是否匹配查询(全字段子串,AND 语义;空查询恒真)。
 * 字段:subject / fromText / toText / textPreview(摘要与前 2KB 纯文本)。
 */
function mailMatches(mail, query) {
  const q = norm(query).trim();
  if (!q) return true;
  const hay = norm(
    [mail.subject, mail.fromText, mail.toText, mail.textPreview].map((v) => v || '').join('\n'),
  );
  return hay.includes(q);
}

/**
 * 列表查询参数规整(limit/offset 边界钳制)。
 */
function pageArgs(query, offset, limit) {
  const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const o = Math.max(0, parseInt(offset, 10) || 0);
  return { query: String(query == null ? '' : query), offset: o, limit: l };
}

// ── HTML 远程资源过滤 ────────────────────────────────────────────────────────

/** iframe 预览永远禁脚本(sandbox 不带 allow-scripts),这里只处理远程引用资源。 */
const REMOTE_ATTRS = [
  ['img', 'src'],
  ['image', 'href'],   // SVG <image href>
  ['source', 'src'],
  ['video', 'src'],
  ['audio', 'src'],
  ['track', 'src'],
  ['input', 'src'],
];

function isLocalUrl(u) {
  const s = String(u || '').trim().toLowerCase();
  if (s.startsWith('data:') || s.startsWith('cid:') || s.startsWith('#')) return true;
  // 相对路径视为本地(无法外联到绝对域名时按本地处理,浏览器按 srcdoc 相对源解析会失败,无害)
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return true;
  return false;
}

/**
 * 过滤邮件 HTML 中的远程引用(防跟踪像素/防打开回执)。
 * 默认:远程资源 src/href 换成 data 占位,并加 data-mdk-remote 原值属性;
 * allowRemote=true 时还原(用户一键放行后)。
 * 仅做属性级替换,不做 HTML 规范化——不可信 HTML 始终在 sandbox iframe(无脚本)里渲染。
 */
function filterRemoteResources(html, allowRemote) {
  const raw = String(html == null ? '' : html);
  if (!raw) return { html: '', blocked: 0 };
  if (allowRemote) return { html: raw, blocked: 0 };
  let blocked = 0;
  let out = raw;
  for (const [tag, attr] of REMOTE_ATTRS) {
    const re = new RegExp(`<${tag}(\\s[^>]*?)?\\s${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))["']?`, 'gi');
    out = out.replace(re, (m, pre, _q, dq, sq, uq) => {
      const url = dq != null ? dq : sq != null ? sq : uq || '';
      if (isLocalUrl(url)) return m;
      blocked += 1;
      const placeholder = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="18"><rect width="120" height="18" fill="#8882"/><text x="6" y="13" font-size="11" fill="#888">远程图已阻断</text></svg>',
      );
      const rest = m.slice(m.toLowerCase().indexOf(attr.toLowerCase()));
      const head = m.slice(0, m.length - rest.length);
      return `${head}${attr}="${placeholder}" data-mdk-remote="${String(url).replace(/"/g, '&quot;')}"`;
    });
  }
  // CSS 内联的 url(http...) 同样阻断(背景图等;不放原 URL 进注释,避免注入)
  out = out.replace(/url\(\s*(['"]?)(https?:\/\/[^)'"]+)\1\s*\)/gi, () => {
    blocked += 1;
    return `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')}")`;
  });
  return { html: out, blocked };
}

// ── 验证码提取 ───────────────────────────────────────────────────────────────

const CODE_KEYWORDS = ['验证码', '校验码', 'code', 'otp', 'verification', 'verify', 'confirm', 'pin', 'captcha'];

/**
 * 从纯文本中提取疑似验证码(返回候选数组,按置信度排序;AI 场景加速用,不做唯一断言)。
 * 规则:6-8 位纯数字优先;4-8 位字母数字混合次之;邻近行含关键词加权。
 */
function extractCodes(text) {
  const src = String(text == null ? '' : text);
  if (!src) return [];
  const lines = src.split(/\r?\n/);
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = norm(line);
    const prev = i > 0 ? lines[i - 1] : '';
    const prevLower = norm(prev);
    // 关键词判定:当前行为主;上一行是短引导行(如「您的验证码:」)时也算
    const hasKw = (s) => CODE_KEYWORDS.some((k) => s.includes(k));
    const kw = hasKw(lineLower) || (prev.length <= 40 && hasKw(prevLower));
    const re = /\b([0-9]{6,8})\b|\b([A-Z0-9]{4,8})\b/gi;
    let m;
    while ((m = re.exec(line)) !== null) {
      const token = m[1] || m[2];
      if (!token) continue;
      const isDigits = /^\d{6,8}$/.test(token);
      const hasLettersAndDigits = /^(?=.*\d)(?=.*[a-zA-Z])[A-Za-z0-9]{4,8}$/.test(token);
      if (!isDigits && !hasLettersAndDigits) continue;
      // 纯字母单词或常见非验证码词忽略
      if (/^(test|demo|none|null|true|false|http|https|html|email|mail)$/i.test(token)) continue;
      scored.push({ code: token, score: (isDigits ? 2 : 1) + (kw ? 2 : 0) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const s of scored) {
    if (seen.has(s.code)) continue;
    seen.add(s.code);
    out.push(s.code);
    if (out.length >= 5) break;
  }
  return out;
}

// ── 环形淘汰 ────────────────────────────────────────────────────────────────

/**
 * 给定按时间升序的 {id, sizeBytes} 列表与上限,返回应淘汰的 id 列表(最旧优先)。
 * 纯函数,单测覆盖;淘汰后至少保留 1 封(即便超限)。
 */
function evictPlan(items, maxCount, maxBytes) {
  let total = 0;
  for (const it of items) total += it.sizeBytes || 0;
  const drop = [];
  let i = 0;
  while (i < items.length - 1 && (items.length - drop.length > maxCount || total > maxBytes)) {
    drop.push(items[i].id);
    total -= items[i].sizeBytes || 0;
    i++;
  }
  return drop;
}

function newMailId() {
  return `m_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = {
  VERSION, K, LIMITS, DEFAULTS,
  mailMatches, pageArgs,
  filterRemoteResources, isLocalUrl,
  extractCodes, CODE_KEYWORDS,
  evictPlan, newMailId,
};
