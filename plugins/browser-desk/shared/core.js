'use strict';
/**
 * shared/core.js —— browser-desk 共享常量与纯函数（零依赖）
 *
 * 被 service/main.js（引擎）、mcp/server.js（工具面）、src/（面板）三方消费，
 * 必须保持零依赖 + 纯函数，改这里 = 改三方契约。
 */

const VERSION = '0.1.0';

/** 支持的搜索引擎模板（{query} 为 encodeURIComponent 后的查询词） */
const SEARCH_ENGINES = {
  bing: 'https://www.bing.com/search?q={query}',
  baidu: 'https://www.baidu.com/s?wd={query}',
  duckduckgo: 'https://duckduckgo.com/?q={query}',
  google: 'https://www.google.com/search?q={query}',
};
const DEFAULT_ENGINE = 'bing';

/** agentKey 绑定 TTL：无活动 30 分钟自动解绑（防僵尸绑定占住标签） */
const AGENT_BIND_TTL_MS = 30 * 60 * 1000;

/** 每 tab 页面事件环容量 */
const EVENT_RING_CAPACITY = 200;

/** desk_watch 长轮询挂起上限（须小于 MCP 客户端超时） */
const WATCH_LONGPOLL_MS = 25 * 1000;

/** 默认等待超时 */
const DEFAULT_WAIT_TIMEOUT_MS = 15 * 1000;

/** 截图默认参数（JPEG 质量 + 最长边，控制 MCP 返回体积） */
const SCREENSHOT_DEFAULTS = { quality: 60, maxWidth: 1280, type: 'jpeg' };

/**
 * 判断字符串是否像 URL（含 scheme 或常见域名特征）。
 * AI 传来的 query 若像 URL 则直接导航，否则走搜索。
 */
function looksLikeUrl(s) {
  if (!s) return false;
  const t = s.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return true; // scheme://
  if (/^localhost(:\d+)?(\/|$)/i.test(t)) return true;
  // 无空格 + 含点号 + 顶级域样式 → 视为 URL
  return !/\s/.test(t) && /^[^\s]+\.[a-z]{2,}([/?#].*)?$/i.test(t);
}

/** 规范化 URL：补 https:// 前缀 */
function normalizeUrl(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** 构造搜索 URL */
function buildSearchUrl(query, engine) {
  const tpl = SEARCH_ENGINES[engine || DEFAULT_ENGINE] || SEARCH_ENGINES[DEFAULT_ENGINE];
  return tpl.replace('{query}', encodeURIComponent(String(query || '').trim()));
}

/** 事件类型白名单（desk_watch kinds 参数的合法值） */
const EVENT_KINDS = ['console', 'network', 'dialog', 'download', 'navigation', 'error'];

module.exports = {
  VERSION,
  SEARCH_ENGINES,
  DEFAULT_ENGINE,
  AGENT_BIND_TTL_MS,
  EVENT_RING_CAPACITY,
  WATCH_LONGPOLL_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  SCREENSHOT_DEFAULTS,
  looksLikeUrl,
  normalizeUrl,
  buildSearchUrl,
  EVENT_KINDS,
};
