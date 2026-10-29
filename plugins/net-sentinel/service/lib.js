'use strict';
/**
 * lib.js —— 网络哨兵纯逻辑层（零依赖，可离线单测）
 *
 * 设计约束（同 pocket-host/service/lib.js）：本文件不触碰网络/文件系统，
 * 所有函数输入输出均为纯数据，test/run-tests.mjs 直接驱动。
 *
 * 职责：
 *   - 设置/目标规范化（防御面板/MCP 写入的脏数据）
 *   - 分钟聚合（RoundAgg：一轮探测结果 → 分钟记录 [minIdx, avgX10|null, max, loss, cnt]）
 *   - 小时桶操作（bucketUpsert / bucketPruneMinute / hourKey / minuteIdxOf）
 *   - 保留清扫计划（retentionPlan：旧桶/超额事件/超额测速/孤儿 result）
 *   - 在线判定（computeOnline：锚点 ≥minUp 可达）
 *   - 连接错误分类（classifyConnectError：RST 类=IP 已应答，算通）
 *   - 事件状态机（NetEventMachine：断网/恢复/失联/劣化，边沿触发 + 30min 限频）
 *   - 网关解析（三平台纯解析函数）
 *   - SSRF 守卫（isPrivateHost：测速 URL 拒绝本机/私网，除非 allowPrivate）
 *   - 展示辅助（formatMs / formatDur / p95）
 */

// ── 设置规范化 ─────────────────────────────────────────────────────────────
const SETTING_LIMITS = {
  tickSec: [5, 120, 10],
  timeoutMs: [1000, 10000, 3000],
  latencyMs: [100, 10000, 400],
  sustainRounds: [2, 12, 6],
  retentionHours: [24, 2160, 720],
  speedMb: [1, 25, 10],
};

/** 面板写入的 settings 脏数据防御：越界回落默认，未知字段丢弃 */
function normalizeSettings(raw) {
  const out = {};
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw ? raw[k] : NaN);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  out.speedUrl = typeof (raw && raw.speedUrl) === 'string' ? raw.speedUrl.trim().slice(0, 300) : '';
  out.paused = raw ? raw.paused === true : false;
  return out;
}

// ── 目标规范化 ─────────────────────────────────────────────────────────────
const TARGET_KINDS = ['gateway', 'anchor', 'normal'];
const TARGET_MAX = 12;
const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?(:\d+)?$/;

function slugId(label, host, port) {
  const base = String(label || host || 't').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16);
  return `${base || 't'}-${String(port || 0)}-${Math.abs(hashStr(`${label}|${host}|${port}`)) % 1000}`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return h;
}

/** 单个目标规范化：返回 {error} 或目标对象（host 传空允许 gateway 自动发现） */
function normalizeTarget(raw) {
  if (!raw || typeof raw !== 'object') return { error: '目标缺失' };
  const kind = TARGET_KINDS.includes(raw.kind) ? raw.kind : 'normal';
  const host = String(raw.host || '').trim().toLowerCase().slice(0, 253);
  const port = Math.floor(Number(raw.port));
  if (!host && kind !== 'gateway') return { error: 'host 不能为空' };
  if (host && (!HOST_RE.test(host) || host.includes('..'))) return { error: `host 非法：${host}` };
  if (!Number.isFinite(port) || port < 1 || port > 65535) return { error: `port 非法：${raw.port}` };
  const label = String(raw.label || '').trim().slice(0, 24) || host || '网关';
  const t = {
    id: String(raw.id || '').trim().slice(0, 32) || slugId(label, host, port),
    label,
    host,
    port,
    kind,
    enabled: raw.enabled !== false,
  };
  return t;
}

/** 目标列表规范化：去重 id、cap 12、坏条目丢弃 */
function normalizeTargets(raw) {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.targets) ? raw.targets : []);
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const t = normalizeTarget(r);
    if (t.error || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= TARGET_MAX) break;
  }
  return { v1: 1, targets: out };
}

/** 默认目标集（锚点 ≥minUp 判在线；github/jsdelivr 作为工作目标样本） */
const DEFAULT_TARGETS = [
  { id: 'gateway', label: '网关', host: '', port: 80, kind: 'gateway', enabled: true },
  { id: 'dns-ali-53', label: '阿里 DNS', host: '223.5.5.5', port: 53, kind: 'anchor', enabled: true },
  { id: 'dns-tencent-53', label: '腾讯 DNS', host: '119.29.29.29', port: 53, kind: 'anchor', enabled: true },
  { id: 'baidu-443', label: '百度', host: 'www.baidu.com', port: 443, kind: 'anchor', enabled: true },
  { id: 'cloudflare-53', label: 'Cloudflare', host: '1.1.1.1', port: 53, kind: 'anchor', enabled: true },
  { id: 'github-443', label: 'GitHub', host: 'github.com', port: 443, kind: 'normal', enabled: true },
  { id: 'jsdelivr-443', label: 'jsDelivr', host: 'cdn.jsdelivr.net', port: 443, kind: 'normal', enabled: true },
];

/** cmd.targets 命令载荷校验：返回 {error} 或 {action, target?, id?} */
function normalizeTargetsCmd(raw) {
  if (!raw || typeof raw !== 'object') return { error: '命令载荷缺失' };
  const action = String(raw.action || '');
  if (action === 'add') {
    const t = normalizeTarget(raw.target);
    if (t.error) return { error: t.error };
    return { action, target: t };
  }
  if (action === 'remove' || action === 'enable' || action === 'disable') {
    const id = String(raw.id || '').trim().slice(0, 32);
    if (!id) return { error: `需要目标 id（${action}）` };
    return { action, id };
  }
  return { error: `未知 action：${action || '(空)'}` };
}

// ── 分钟聚合 ───────────────────────────────────────────────────────────────
/**
 * 单目标当前分钟的运行时聚合器。
 * add(ok, ms)：喂入一轮结果；take(minIdx)：取走本分钟记录并复位。
 * 记录格式 [minIdx, avgX10|null, max, loss, cnt]（avgX10=均值×10 取整，全丢=null）。
 */
class RoundAgg {
  constructor() { this.cnt = 0; this.loss = 0; this.sum = 0; this.max = 0; }
  add(ok, ms) {
    this.cnt += 1;
    if (!ok || !Number.isFinite(ms)) { this.loss += 1; return; }
    this.sum += ms;
    if (ms > this.max) this.max = ms;
  }
  get has() { return this.cnt > 0; }
  take(minIdx) {
    const rec = [minIdx, this.cnt > this.loss ? Math.round((this.sum / (this.cnt - this.loss)) * 10) : null, this.max, this.loss, this.cnt];
    this.cnt = 0; this.loss = 0; this.sum = 0; this.max = 0;
    return rec;
  }
}

/** 从分钟记录数组提取统计：{n, loss, avg, max, p95}（无成功样本 avg/max/p95=null） */
function aggStats(records) {
  const okMs = [];
  let loss = 0;
  let cnt = 0;
  let max = 0;
  for (const r of records || []) {
    if (!Array.isArray(r) || r.length < 5) continue;
    cnt += r[4];
    loss += r[3];
    if (r[1] !== null && Number.isFinite(r[1])) okMs.push(r[1] / 10);
    if (Number.isFinite(r[2]) && r[2] > max) max = r[2];
  }
  if (!cnt) return { n: 0, loss: 0, cnt: 0, avg: null, max: null, p95: null };
  const avg = okMs.length ? Math.round((okMs.reduce((a, b) => a + b, 0) / okMs.length) * 10) / 10 : null;
  return { n: records.length, loss, cnt, avg, max: max || null, p95: okMs.length ? p95(okMs) : null };
}

function p95(sortedArr) {
  const a = [...sortedArr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil(a.length * 0.95) - 1));
  return Math.round(a[i] * 10) / 10;
}

// ── 小时桶 ─────────────────────────────────────────────────────────────────
/** 本地时 hourKey：YYYYMMDDHH（用户感知时区） */
function hourKey(ts) {
  const d = new Date(ts);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`;
}

/** 本地时分钟序号 0-59 */
function minuteIdxOf(ts) {
  return new Date(ts).getMinutes();
}

/** hourKey → 本地时 Date（桶起点） */
function hourKeyToTs(key) {
  const s = String(key);
  return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), Number(s.slice(8, 10))).getTime();
}

/** 把分钟记录 upsert 进桶（纯函数，返回新对象）；同分钟覆盖（服务重启续写同分钟） */
function bucketUpsert(bucket, tid, rec) {
  const b = bucket && typeof bucket === 'object' && bucket.v1 === 1 ? { v1: 1, at: bucket.at, byTarget: { ...(bucket.byTarget || {}) } } : { v1: 1, at: Date.now(), byTarget: {} };
  const arr = [...(b.byTarget[tid] || [])];
  const idx = arr.findIndex((r) => r[0] === rec[0]);
  if (idx >= 0) arr[idx] = rec; else arr.push(rec);
  arr.sort((x, y) => x[0] - y[0]);
  b.byTarget[tid] = arr.slice(-60);
  return b;
}

// ── 保留清扫 ───────────────────────────────────────────────────────────────
/**
 * 从全部 kv 键产出待删清单（纯函数）：
 *   - 小时桶早于 retentionHours（按本地时 hourKey 解析）
 *   - 事件键超 cap（保留最新 capEvents 条）
 *   - 测速键超 cap（保留最新 capSpeeds 条）
 * 注：result 孤儿（nonce 键名、无时间戳语义）由服务侧 sweep 读值内 at 清扫，
 * 不在本计划内。
 */
function retentionPlan(keys, { retentionHours, capEvents = 200, capSpeeds = 50, now = Date.now() }) {
  const del = [];
  const hKeys = [];
  const evKeys = [];
  const spKeys = [];
  for (const k of keys || []) {
    if (k.startsWith('netmon.h.')) hKeys.push(k);
    else if (k.startsWith('netmon.event.')) evKeys.push(k);
    else if (k.startsWith('netmon.speed.')) spKeys.push(k);
  }
  const cutoff = now - Math.max(1, retentionHours || 720) * 3600 * 1000;
  for (const k of hKeys) {
    const raw = k.slice('netmon.h.'.length);
    const ts = /^\d{10}$/.test(raw) ? hourKeyToTs(raw) : NaN;
    if (Number.isFinite(ts) && ts < cutoff) del.push(k);
  }
  evKeys.sort();
  for (const k of evKeys.slice(0, Math.max(0, evKeys.length - capEvents))) del.push(k);
  spKeys.sort();
  for (const k of spKeys.slice(0, Math.max(0, spKeys.length - capSpeeds))) del.push(k);
  return del;
}

// ── 在线判定与错误分类 ─────────────────────────────────────────────────────
/**
 * 锚点在线判定：锚点目标中「可达」数 ≥ minUp（默认 2，锚点总数不足 2 时要求全部可达）。
 * results: [{tid, ok}]（仅锚点）；无锚点配置时返回 null（调用方沿用上次）。
 */
function computeOnline(anchorResults, minUp = 2) {
  const list = (anchorResults || []).filter((r) => r && typeof r.ok === 'boolean');
  if (!list.length) return null;
  const up = list.filter((r) => r.ok).length;
  const need = list.length < minUp ? list.length : minUp;
  return up >= need;
}

/**
 * 连接错误分类：返回 {alive, note}。
 * reachable = IP 已应答（RST/拒绝/协议错）→ 链路与 DNS 通，SYN→RST 往返仍是 RTT；
 * 超时/不可达/DNS 失败 → 真丢包。
 */
function classifyConnectError(err) {
  const code = err && (err.code || err.message) || '';
  if (/ECONNREFUSED|ECONNRESET|EPROTO/.test(code)) return { alive: true, note: 'refused' };
  if (/ETIMEDOUT/.test(code)) return { alive: false, note: 'timeout' };
  if (/EHOSTUNREACH|ENETUNREACH|ENETDOWN|EACCES/.test(code)) return { alive: false, note: 'unreach' };
  if (/getaddrinfo|ENOTFOUND|EAI_AGAIN/.test(code)) return { alive: false, note: 'dns' };
  return { alive: false, note: code ? String(code).slice(0, 40) : 'error' };
}

// ── 事件状态机 ─────────────────────────────────────────────────────────────
const EVENT_TYPES = ['net_down', 'net_recovered', 'target_down', 'target_recovered', 'latency_high', 'latency_recovered'];
const EVENT_MIN_GAP_MS = 30 * 60 * 1000; // 同类型+同目标事件最小间隔（边沿触发之外的兜底限频）

/**
 * 网络事件状态机（边沿触发 + 防抖 + 限频）。
 * feed(rounds, targets, settings, now) 每轮调一次，返回本次新事件数组。
 *   rounds: {tid: {ok, ms}}；targets: [{id,label,kind,enabled}]
 * 语义：
 *   - net_down：锚点在线判定从 true→false 连续 2 轮；恢复：false→true 连续 2 轮（带断网时长）
 *   - target_down：单目标连续 sustainRounds 轮失联（anchors 集体失联时归入 net_down 不重复报）
 *   - latency_high：单目标平均延迟（近 sustainRounds 轮成功样本均值）≥ latencyMs 持续 sustainRounds 轮
 */
class NetEventMachine {
  constructor(now = Date.now) {
    this.now = now;
    this.pending = [];
    this.lastEmitAt = {};
    this.online = null;          // null=未知（首轮回填不发事件）
    this.onlineFailStreak = 0;
    this.onlineOkStreak = 0;
    this.downSince = 0;
    this.targets = {};           // tid → {failStreak, okStreak, highStreak, downSince, highSince, latWindow: []}
  }

  drain() { const p = this.pending; this.pending = []; return p; }

  _emit(type, summary, extra) {
    const t = this.now();
    const key = type + (extra && extra.targetId ? `:${extra.targetId}` : '');
    // 从未发过（undefined）不限频：?? -Infinity 而非 || 0，兼容假时钟测试
    if (t - (this.lastEmitAt[key] ?? Number.NEGATIVE_INFINITY) < EVENT_MIN_GAP_MS) return;
    this.lastEmitAt[key] = t;
    this.pending.push({ type, at: t, summary, ...(extra || {}) });
  }

  feed(rounds, targets, settings) {
    const st = settings || {};
    if (st.paused) return this.drain();
    const sustain = Math.max(2, st.sustainRounds || 6);
    const latencyMs = st.latencyMs || 400;

    const anchorTids = new Set((targets || []).filter((t) => t.kind === 'anchor' && t.enabled !== false).map((t) => t.id));
    const anchorRounds = [...anchorTids].map((tid) => ({ tid, ok: !!(rounds[tid] && rounds[tid].ok) })).filter((r) => rounds[r.tid]);

    // 在线判定（首轮只回填状态不发事件）
    const online = computeOnline(anchorRounds, 2);
    if (online !== null) {
      if (this.online === null) {
        this.online = online;
      } else if (online !== this.online) {
        if (online) {
          this.onlineOkStreak += 1;
          this.onlineFailStreak = 0;
          if (this.onlineOkStreak >= 2) {
            this.online = true;
            this._emit('net_recovered', `网络已恢复（断网约 ${formatDur(this.now() - this.downSince)}）`, { durMs: this.now() - this.downSince });
            this.downSince = 0;
          }
        } else {
          this.onlineFailStreak += 1;
          this.onlineOkStreak = 0;
          if (this.onlineFailStreak >= 2) {
            this.online = false;
            this.downSince = this.now() - this.onlineFailStreak * (st.tickSec || 10) * 1000;
            const upTargets = (targets || []).filter((t) => t.kind === 'anchor');
            this._emit('net_down', `网络疑似断开：${upTargets.length} 个锚点全部失联（${upTargets.map((t) => t.label).join('、')}）`);
          }
        }
      } else {
        if (online) { this.onlineOkStreak = 0; this.onlineFailStreak = 0; }
        else { this.onlineOkStreak = 0; this.onlineFailStreak = Math.max(1, this.onlineFailStreak); }
      }
    }
    const netDown = this.online === false;

    // 单目标：失联 / 劣化
    for (const t of targets || []) {
      if (t.kind === 'gateway' && t.enabled === false) continue;
      const r = rounds[t.id];
      if (!r) continue;
      const m = this.targets[t.id] || (this.targets[t.id] = { failStreak: 0, okStreak: 0, highStreak: 0, downSince: 0, highSince: 0, latWindow: [] });

      if (r.ok) {
        m.failStreak = 0;
        m.okStreak += 1;
        if (m.downSince) {
          if (m.okStreak >= 2) {
            this._emit('target_recovered', `${t.label} 已恢复连通（失联约 ${formatDur(this.now() - m.downSince)}）`, { targetId: t.id, durMs: this.now() - m.downSince });
            m.downSince = 0;
          }
        }
        // 延迟窗口（仅成功样本）
        m.latWindow.push(Number(r.ms) || 0);
        while (m.latWindow.length > sustain) m.latWindow.shift();
        const wOk = m.latWindow.length >= Math.max(2, Math.ceil(sustain / 2));
        const wAvg = m.latWindow.length ? m.latWindow.reduce((a, b) => a + b, 0) / m.latWindow.length : 0;
        if (wOk && wAvg >= latencyMs) {
          m.highStreak += 1;
          if (m.highStreak >= sustain) {
            if (!m.highSince) m.highSince = this.now() - m.highStreak * (st.tickSec || 10) * 1000;
            if (m.highStreak === sustain) {
              this._emit('latency_high', `${t.label} 延迟劣化：近 ${m.latWindow.length} 轮平均 ${Math.round(wAvg)}ms ≥ ${latencyMs}ms`, { targetId: t.id, value: Math.round(wAvg), threshold: latencyMs });
            }
          }
        } else {
          if (m.highSince) {
            this._emit('latency_recovered', `${t.label} 延迟回落：当前均值 ${Math.round(wAvg)}ms`, { targetId: t.id, value: Math.round(wAvg) });
            m.highSince = 0;
          }
          m.highStreak = 0;
        }
      } else {
        m.okStreak = 0;
        m.highStreak = 0;
        m.latWindow = [];
        if (m.highSince) {
          this._emit('latency_recovered', `${t.label} 探测中断（原延迟劣化结束）`, { targetId: t.id });
          m.highSince = 0;
        }
        m.failStreak += 1;
        // 网关防抖加倍：真掉线与防火墙静默过滤 80 端口都表现为 timeout，无法区分，
        // 需要更长观察窗（sustain×2）避免把常态过滤误报成「路由器离线」
        const need = t.kind === 'gateway' ? sustain * 2 : sustain;
        if (m.failStreak >= need && !m.downSince) {
          m.downSince = this.now() - m.failStreak * (st.tickSec || 10) * 1000;
          if (!netDown) {
            // 网关失联单独点名（其余目标正常 → 本机出口问题）
            this._emit('target_down', `${t.label} 失联：连续 ${m.failStreak} 轮无应答${t.kind === 'gateway' ? '（本机出口/路由器可能离线；若长期误报，可在设置中改网关端口或停用该目标）' : '（其余目标正常，可能目标侧问题）'}`, { targetId: t.id });
          }
        }
      }
    }

    return this.drain();
  }
}

// ── 网关解析（三平台纯解析）───────────────────────────────────────────────
/** PowerShell Get-NetRoute 输出（NextHop 列）→ IPv4 网关 */
function parseGatewayWin(text) {
  const m = String(text || '').match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  if (!m) return '';
  const ip = m[1];
  return ip === '0.0.0.0' ? '' : ip;
}

/** `route -n get default`（macOS）→ gateway */
function parseGatewayMac(text) {
  const m = String(text || '').match(/gateway:\s*(\d{1,3}(?:\.\d{1,3}){3})/);
  return m ? m[1] : '';
}

/** `ip route show default`（Linux）→ via 网关 */
function parseGatewayLinux(text) {
  const m = String(text || '').match(/default\s+via\s+(\d{1,3}(?:\.\d{1,3}){3})/);
  return m ? m[1] : '';
}

// ── SSRF 守卫 ──────────────────────────────────────────────────────────────
/**
 * 测速 URL 守卫：仅 http/https；主机非本机/私网（除非 allowPrivate=true）。
 * 返回 {error} 或 {url, hostname}。
 */
function guardSpeedUrl(rawUrl, { allowPrivate = false } = {}) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return { error: `URL 无法解析：${String(rawUrl || '').slice(0, 80)}` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: `仅支持 http/https（收到 ${u.protocol}）` };
  const host = (u.hostname || '').toLowerCase();
  if (!host) return { error: 'URL 缺少主机名' };
  if (!allowPrivate && isPrivateHost(host)) return { error: `拒绝本机/私网地址 ${host}（局域网测速请在面板开启 allowPrivate）` };
  return { url: u.toString(), hostname: host };
}

/** 本机/私网判定（IPv4 点分 + IPv6 常见本机段 + .local） */
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.internal')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true;
    return false;
  }
  if (h === '::1' || h === '[::1]' || h === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7
  if (/^fe80:/.test(h)) return true;             // link-local
  return false;
}

/** 测速命令载荷校验：返回 {error} 或 {confirm, mb, url, allowPrivate}（url 此处只做形状检查，守卫在执行时做） */
function normalizeSpeedCmd(raw, settings) {
  if (!raw || typeof raw !== 'object') return { error: '命令载荷缺失' };
  if (raw.confirm !== true) return { error: '缺少 confirm:true（测速会下载数 MB 流量，需显式确认）' };
  const s = normalizeSettings(settings);
  const mbReq = Math.floor(Number(raw.mb));
  const mb = Number.isFinite(mbReq) ? Math.min(25, Math.max(1, mbReq)) : s.speedMb;
  const url = String(raw.url || s.speedUrl || '').trim();
  const allowPrivate = raw.allowPrivate === true;
  return { confirm: true, mb, url, allowPrivate };
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
function formatMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function formatDur(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  if (s < 90) return `${s} 秒`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 36) return `${h} 小时 ${rm} 分钟`;
  return `${Math.round(h / 24)} 天`;
}

module.exports = {
  SETTING_LIMITS,
  TARGET_KINDS,
  TARGET_MAX,
  DEFAULT_TARGETS,
  EVENT_TYPES,
  EVENT_MIN_GAP_MS,
  normalizeSettings,
  normalizeTarget,
  normalizeTargets,
  normalizeTargetsCmd,
  normalizeSpeedCmd,
  slugId,
  hashStr,
  RoundAgg,
  aggStats,
  p95,
  hourKey,
  minuteIdxOf,
  hourKeyToTs,
  bucketUpsert,
  retentionPlan,
  computeOnline,
  classifyConnectError,
  NetEventMachine,
  parseGatewayWin,
  parseGatewayMac,
  parseGatewayLinux,
  guardSpeedUrl,
  isPrivateHost,
  formatMs,
  formatDur,
};
