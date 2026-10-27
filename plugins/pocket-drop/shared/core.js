'use strict';
/**
 * core.js —— 口袋快传纯函数核心（零依赖，CommonJS）
 *
 * 面板（esbuild bundle）与 MCP / 服务（node require）共用同一份业务计算，
 * 保证三端口径一致（shared core 模式）。可测逻辑全部放这里，test/run-tests.mjs 直测本文件。
 * 不碰 kv/fetch/fs/http——所有副作用都在 service/mcp/panel 层。
 */

const MAX_ITEMS = 200;

const DEFAULT_SETTINGS = Object.freeze({
  pin: '',
  ttlHours: 72,
  maxSizeMb: 2048,
  totalCapMb: 10240,
});

/** 设置规范化：非法输入回落默认值，绝不抛错（面板/服务/MCP 三端同口径） */
function normalizeSettings(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const clamp = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  return {
    pin: typeof r.pin === 'string' && /^\d{4,8}$/.test(r.pin) ? r.pin : DEFAULT_SETTINGS.pin,
    ttlHours: clamp(r.ttlHours, 1, 720, DEFAULT_SETTINGS.ttlHours),
    maxSizeMb: clamp(r.maxSizeMb, 1, 8192, DEFAULT_SETTINGS.maxSizeMb),
    totalCapMb: clamp(r.totalCapMb, 256, 65536, DEFAULT_SETTINGS.totalCapMb),
  };
}

/** PIN 合法性（格式）；常量时间比较在 service 层用 crypto 做 */
function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

/** 生成投递条目 id（12 位 hex）；rng 可注入便于测试 */
function newItemId(rand) {
  const r = rand || Math.random;
  let s = '';
  for (let i = 0; i < 12; i++) s += Math.floor(r() * 16).toString(16);
  return s;
}

/**
 * 文件名清洗：去路径成分/控制字符/Windows 保留名/首尾空白点，限长。
 * 存储名用随机 id，这里只清洗「展示名」——绝不返回含路径分隔符的结果。
 */
function sanitizeFilename(raw, maxLen) {
  const cap = maxLen || 180;
  let s = String(raw == null ? '' : raw);
  // 取 basename（兼容 / 与 \），去掉盘符
  s = s.split(/[\\/]/).pop() || '';
  s = s.replace(/^([a-zA-Z]):/, '');
  // 去控制字符与 CR/LF/TAB
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1f\x7f]/g, '');
  // 去掉首尾空白与结尾的点/空白混合（Windows 文件系统限制，如 "name . "）
  s = s.trim().replace(/[.\s]+$/, '');
  // Windows 保留名（CON、PRN、AUX、NUL、COM1-9、LPT1-9，含带扩展名形态）
  const stem = s.replace(/\.[^.]*$/, '').toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) s = `_${s}`;
  if (s.length > cap) {
    const dot = s.lastIndexOf('.');
    if (dot > 0 && dot >= s.length - 20) {
      const ext = s.slice(dot);
      s = s.slice(0, cap - ext.length) + ext;
    } else {
      s = s.slice(0, cap);
    }
  }
  return s || '未命名文件';
}

/** 同名冲突：报告.xlsx → 报告 (2).xlsx（现有名集合里找空位） */
function dedupeName(existingNames, name) {
  if (!existingNames.includes(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 10000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!existingNames.includes(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

/** 当前总字节（服务判定容量用） */
function totalBytes(items) {
  return (Array.isArray(items) ? items : []).reduce((acc, it) => acc + (it && Number(it.size) > 0 ? Number(it.size) : 0), 0);
}

/**
 * 投递准入判定：条目数上限 / 总容量上限 / id 幂等。
 * 纯函数：返回 { ok, items, reason? }，不修改入参。
 */
function addItem(items, item, opts) {
  const list = Array.isArray(items) ? items : [];
  const o = opts || {};
  if (!item || typeof item !== 'object' || !item.id) return { ok: false, items: list, reason: 'invalid_item' };
  if (list.some((it) => it.id === item.id)) return { ok: true, items: list, reason: 'duplicate_id' };
  if (list.length >= (o.maxItems || MAX_ITEMS)) return { ok: false, items: list, reason: 'too_many_items' };
  const capBytes = Number(o.totalCapBytes) > 0 ? Number(o.totalCapBytes) : Infinity;
  if (totalBytes(list) + (Number(item.size) || 0) > capBytes) return { ok: false, items: list, reason: 'capacity' };
  return { ok: true, items: list.concat([item]) };
}

/** 移除条目（按 id）；不存在也返回等价数组 */
function removeItem(items, id) {
  return (Array.isArray(items) ? items : []).filter((it) => !(it && it.id === id));
}

/** TTL 清扫计划：过期条目与其余（now 可注入） */
function planSweep(items, now) {
  const t = Number(now) || Date.now();
  const list = Array.isArray(items) ? items : [];
  const expired = list.filter((it) => it && Number(it.expiresAt) > 0 && Number(it.expiresAt) <= t);
  return { expired, keep: list.filter((it) => !expired.includes(it)) };
}

/** 事件修剪：保留最近 keep 条（按 at 降序） */
function pruneEvents(events, keep) {
  const cap = keep || 50;
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && typeof e === 'object')
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))
    .slice(0, cap);
}

/**
 * 局域网地址优选：输入 os.networkInterfaces() 的扁平化数组
 * [{ name, address, internal, family }]，返回 `http://<addr>:<port>` 或 ''。
 * 优先级：192.168.* > 10.* > 172.16-31.* > 其他私有地址；拒绝 internal/IPv6/链路本地。
 */
function pickLanUrl(ifaces, port) {
  const p = Number(port) > 0 ? Number(port) : 0;
  if (!p) return '';
  const cands = (Array.isArray(ifaces) ? ifaces : []).filter((f) => (
    f && f.address && f.internal !== true && f.family === 'IPv4'
    && !/^169\.254\./.test(f.address) && !/^127\./.test(f.address)
  ));
  const rank = (addr) => {
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(addr);
    if (!m) return 99;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 192 && b === 168) return 0;
    if (a === 10) return 1;
    if (a === 172 && b >= 16 && b <= 31) return 2;
    return 3;
  };
  cands.sort((x, y) => rank(x.address) - rank(y.address));
  return cands.length ? `http://${cands[0].address}:${p}` : '';
}

/** PIN 失败限频器：滑动窗口 60s 内 maxFails 次后锁定 lockMs（now 可注入，服务单实例内存态） */
function createRateLimiter(opts) {
  const maxFails = (opts && opts.maxFails) || 5;
  const windowMs = (opts && opts.windowMs) || 60 * 1000;
  const lockMs = (opts && opts.lockMs) || 60 * 1000;
  const state = new Map(); // ip -> { fails: number[], lockUntil: number }
  return {
    /** 记录一次失败；返回当前是否已锁定 */
    fail(ip, now) {
      const t = Number(now) || Date.now();
      const s = state.get(ip) || { fails: [], lockUntil: 0 };
      s.fails = s.fails.filter((x) => t - x < windowMs);
      s.fails.push(t);
      if (s.fails.length >= maxFails) {
        s.lockUntil = t + lockMs;
        s.fails = [];
      }
      state.set(ip, s);
      return t < s.lockUntil;
    },
    /** 是否放行（未锁定） */
    allow(ip, now) {
      const t = Number(now) || Date.now();
      const s = state.get(ip);
      if (!s) return true;
      if (s.lockUntil && t < s.lockUntil) return false;
      if (s.lockUntil && t >= s.lockUntil) { s.lockUntil = 0; s.fails = []; }
      return true;
    },
    /** 锁定剩余秒数（供 429 Retry-After） */
    retryAfterSec(ip, now) {
      const t = Number(now) || Date.now();
      const s = state.get(ip);
      return s && s.lockUntil > t ? Math.ceil((s.lockUntil - t) / 1000) : 0;
    },
    reset(ip) { state.delete(ip); },
    _state: state,
  };
}

/** 字节格式化（三端一致）：1024 → 1.0 KB */
function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '0 B';
  if (v < 1024) return `${Math.round(v)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  let x = v;
  while (x >= 1024 && u < units.length - 1) { x /= 1024; u++; }
  return `${x >= 100 ? Math.round(x) : x.toFixed(1)} ${units[u]}`;
}

/** 剩余 TTL 人话（过期返回空串） */
function ttlLabel(expiresAt, now) {
  const ms = Number(expiresAt) - (Number(now) || Date.now());
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '1 分钟内';
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时${min % 60 ? ` ${min % 60} 分` : ''}`;
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
}

/** 目标保存路径校验（MCP drop_save / 面板）：必须绝对路径；覆盖确认由调用方凭 fs 判定后处理 */
function validateDestPath(dest) {
  const d = String(dest == null ? '' : dest).trim();
  if (!d) return { ok: false, error: '缺少保存路径 dest' };
  if (d.length > 1024) return { ok: false, error: '路径过长' };
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(d)) return { ok: false, error: '路径含非法字符' };
  const winAbs = /^[a-zA-Z]:[\\/]/.test(d) || /^\\\\[^\\]/.test(d);
  const posixAbs = d.startsWith('/');
  if (!winAbs && !posixAbs) return { ok: false, error: 'dest 必须是绝对路径（如 D:\\dir\\file.png 或 /home/u/file.png）' };
  return { ok: true, dest: d };
}

/** 简易 MIME 推断（inline 预览用；未知一律 application/octet-stream 触发下载） */
function mimeFor(name) {
  const ext = String(name || '').toLowerCase().replace(/^.*\./, '');
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    txt: 'text/plain', md: 'text/plain', log: 'text/plain', csv: 'text/csv',
    json: 'application/json', pdf: 'application/pdf',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  };
  return map[ext] || 'application/octet-stream';
}

/** 是否可 inline 预览（其余一律 attachment 下载） */
function isPreviewable(name) {
  const m = mimeFor(name);
  return m !== 'application/octet-stream';
}

module.exports = {
  MAX_ITEMS,
  DEFAULT_SETTINGS,
  normalizeSettings,
  isValidPin,
  newItemId,
  sanitizeFilename,
  dedupeName,
  totalBytes,
  addItem,
  removeItem,
  planSweep,
  pruneEvents,
  pickLanUrl,
  createRateLimiter,
  formatBytes,
  ttlLabel,
  validateDestPath,
  mimeFor,
  isPreviewable,
};
