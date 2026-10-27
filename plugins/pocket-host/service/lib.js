'use strict';
/**
 * lib.js —— 口袋主机纯逻辑层（零依赖，可离线单测）
 *
 * 设计约束：本文件不得引用 node 专有 API 之外的有状态对象（http/fs/网络），
 * 所有函数输入输出均为纯数据，便于 test/run-tests.mjs 直接驱动。
 *
 * 职责：
 *   - CPU 采样差值计算（os.cpus() 两次快照 → 全局占用率）
 *   - Windows tasklist / netstat、macOS lsof、Linux ss 的文本解析器
 *   - 进程表加工（按内存排序/过滤）、端口表去重与 pid→名字 映射
 *   - kill 守卫（guardKill：拒绝低值 PID / 自身 / 父进程 / Polaris 核心）
 *   - 告警状态机（AlertMachine：持续超限边沿触发 + 恢复事件 + 限频）
 *   - 设置规范化（normalizeSettings：防御面板/MCP 写入的脏数据）
 */

// ── CPU 采样 ───────────────────────────────────────────────────────────────
/**
 * os.cpus() 快照差值 → 全局 CPU 占用率（0-100，一位小数）。
 * times: [{times:{user,nice,sys,idle,irq}}]（即 os.cpus() 的返回）。
 * 两快照间无流逝（delta<=0）时返回 null（调用方沿用上一次值）。
 */
function cpuDelta(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next) || !prev.length || prev.length !== next.length) return null;
  let busy = 0;
  let total = 0;
  for (let i = 0; i < next.length; i++) {
    const a = (prev[i] && prev[i].times) || {};
    const b = (next[i] && next[i].times) || {};
    const d = (k) => Math.max(0, (b[k] || 0) - (a[k] || 0));
    const idle = d('idle');
    const user = d('user');
    const nice = d('nice');
    const sys = d('sys');
    const irq = d('irq');
    const t = user + nice + sys + irq + idle;
    if (t <= 0) continue;
    busy += user + nice + sys + irq;
    total += t;
  }
  if (total <= 0) return null;
  const pct = (busy / total) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

// ── Windows tasklist 解析 ──────────────────────────────────────────────────
/**
 * `tasklist /fo csv /nh` 输出 → [{name, pid, memK}]
 * 行形如："chrome.exe","12345","Console","1","123,456 K"
 * 中文 Windows 输出为 GBK，调用方负责先按正确编码解码成字符串。
 * 解析失败/字段缺失的行跳过；memK 无法解析时记 0。
 */
function parseTasklistCsv(text) {
  const out = [];
  if (!text) return out;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith('"')) continue;
    const cells = splitCsvLine(line);
    if (cells.length < 5) continue;
    const name = (cells[0] || '').trim();
    const pid = parseInt((cells[1] || '').trim(), 10);
    if (!name || !Number.isFinite(pid) || pid <= 0) continue;
    const memDigits = String(cells[4] || '').replace(/[^\d]/g, '');
    const memK = memDigits ? parseInt(memDigits, 10) : 0;
    out.push({ name, pid, memK: Number.isFinite(memK) ? memK : 0 });
  }
  return out;
}

/** 单行 CSV 拆分（处理引号内逗号；我们的输入不含转义引号，够用且稳） */
function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

// ── 端口表解析（三平台）────────────────────────────────────────────────────
/**
 * Windows `netstat -ano -p tcp` → [{port, pid}]
 * 只取 LISTENING 行：TCP  0.0.0.0:9829  0.0.0.0:0  LISTENING  12345
 * [::]:port 与 0.0.0.0:port 同端口去重在 dedupePorts 做。
 */
function parseNetstatWin(text) {
  const out = [];
  if (!text) return out;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const cols = rawLine.trim().split(/\s+/);
    if (cols.length < 5 || cols[0] !== 'TCP' || !/LISTENING/i.test(cols[3])) continue;
    const local = cols[1] || '';
    const m = local.match(/:(\d+)$/);
    if (!m) continue;
    const pid = parseInt(cols[4], 10);
    if (!Number.isFinite(pid) || pid < 0) continue;
    out.push({ port: parseInt(m[1], 10), pid });
  }
  return out;
}

/** macOS `lsof -nP -iTCP -sTCP:LISTEN` → [{port, pid}] */
function parseLsof(text) {
  const out = [];
  if (!text) return out;
  for (const rawLine of String(text).split(/\r?\n/).slice(1)) {
    const cols = rawLine.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const local = cols[8] || '';
    const m = local.match(/:(\d+)$/);
    const pid = parseInt(cols[1], 10);
    if (!m || !Number.isFinite(pid) || pid < 0) continue;
    out.push({ port: parseInt(m[1], 10), pid });
  }
  return out;
}

/** Linux `ss -tlnp` → [{port, pid}]（pid 从 users:(("proc",pid=N)) 提取，可能缺失） */
function parseSs(text) {
  const out = [];
  if (!text) return out;
  for (const rawLine of String(text).split(/\r?\n/).slice(1)) {
    const cols = rawLine.trim().split(/\s+/);
    if (cols.length < 4 || cols[0] !== 'LISTEN') continue;
    const local = cols[3] || '';
    const m = local.match(/:(\d+)$/);
    if (!m) continue;
    let pid = 0;
    const pm = rawLine.match(/pid=(\d+)/);
    if (pm) pid = parseInt(pm[1], 10);
    out.push({ port: parseInt(m[1], 10), pid });
  }
  return out;
}

/**
 * 端口去重 + pid→名字 映射：同一端口多行（IPv4/IPv6）合并取最小 pid。
 * 返回按端口号升序的 [{port, pid, name}]，cap 到 maxPorts。
 */
function dedupePorts(rows, procByPid, maxPorts) {
  const byPort = new Map();
  for (const r of rows || []) {
    if (!Number.isFinite(r.port) || r.port <= 0 || r.port > 65535) continue;
    const prev = byPort.get(r.port);
    if (!prev || (r.pid > 0 && (prev.pid <= 0 || r.pid < prev.pid))) {
      byPort.set(r.port, { port: r.port, pid: r.pid });
    }
  }
  const out = [];
  for (const p of byPort.values()) {
    const proc = p.pid > 0 && procByPid ? procByPid.get(p.pid) : null;
    out.push({ port: p.port, pid: p.pid, name: proc ? proc.name : '' });
  }
  out.sort((a, b) => a.port - b.port);
  return out.slice(0, Math.max(1, maxPorts || 100));
}

// ── 进程表加工 ─────────────────────────────────────────────────────────────
/** tasklist 行 → 按内存降序的前 N 条 [{name, pid, memMb}]；filter 为名字子串（大小写不敏感） */
function pickProcs(rows, { limit = 25, filter = '' } = {}) {
  const f = String(filter || '').trim().toLowerCase();
  const list = (rows || [])
    .filter((r) => r && Number.isFinite(r.pid) && r.pid > 0)
    .filter((r) => !f || r.name.toLowerCase().includes(f))
    .map((r) => ({ name: r.name, pid: r.pid, memMb: Math.round((r.memK || 0) / 1024) }))
    .sort((a, b) => b.memMb - a.memMb || a.pid - b.pid);
  return list.slice(0, Math.max(1, limit));
}

/** pid → {name, memK} 索引 */
function procIndex(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (r && Number.isFinite(r.pid) && r.pid > 0) m.set(r.pid, r);
  }
  return m;
}

// ── kill 守卫 ──────────────────────────────────────────────────────────────
const POLARIS_NAME_RE = /^polaris/i;

/**
 * kill 前置守卫：返回 null 表示放行，否则返回拒绝原因（字符串）。
 * 规则（按序）：
 *   1. pid 必须是 >4 的整数（0=Idle，4=System，8/以下为系统保留）
 *   2. 不能是采样服务自身
 *   3. 不能是采样服务的父进程（Polaris 后端——服务由它拉起）
 *   4. 进程名匹配 /^polaris/i 时拒绝（保护 Polaris 全家：主程序/后端/MCP bin）
 */
function guardKill({ pid, name, selfPid, parentPid }) {
  if (!Number.isFinite(pid) || Math.floor(pid) !== pid || pid <= 4) {
    return `拒绝：PID ${pid} 非法或为系统关键进程（仅允许 >4 的整数 PID）`;
  }
  if (pid === selfPid) return '拒绝：不能结束采样服务自身';
  if (pid === parentPid) return '拒绝：不能结束宿主后端进程（Polaris 服务管理器）';
  const n = String(name || '').trim();
  if (n && POLARIS_NAME_RE.test(n)) return `拒绝：${n} 是 Polaris 核心进程，禁止结束`;
  return null;
}

/**
 * kill 命令载荷校验（面板/MCP 写入 cmd 键的原始 JSON）：
 * 必须携带 pid 或 port 之一；confirm !== true 拒绝（防误触/防 AI 手滑）。
 * 返回 {error} 或 {pid?, port?, reason}。
 */
function normalizeKillCmd(raw) {
  if (!raw || typeof raw !== 'object') return { error: '命令载荷缺失' };
  if (raw.confirm !== true) return { error: '缺少 confirm:true（结束进程是危险操作，需显式确认）' };
  const pid = Number(raw.pid);
  const port = Number(raw.port);
  const hasPid = Number.isFinite(pid) && pid > 0;
  const hasPort = Number.isFinite(port) && port > 0 && port <= 65535;
  if (!hasPid && !hasPort) return { error: '需要 pid 或 port 之一' };
  const out = { confirm: true };
  if (raw.reason) out.reason = String(raw.reason).slice(0, 200);
  if (hasPid) out.pid = Math.floor(pid);
  if (hasPort) out.port = Math.floor(port);
  return out;
}

// ── 告警状态机 ─────────────────────────────────────────────────────────────
const ALERT_KINDS = ['cpu_high', 'mem_high', 'disk_low'];
const ALERT_MIN_GAP_MS = 30 * 60 * 1000; // 同类型事件最小间隔（边沿触发之外的兜底限频）

/**
 * 阈值告警状态机：持续超限才触发（防抖），回落发恢复事件。
 * feed() 每个采样 tick 调一次，返回本次新产生的事件数组（调用方落盘）。
 * 事件形如 {type, at, summary, value, threshold}。
 */
class AlertMachine {
  /**
   * @param emit 建议注入 (event)=>void；构造后也可直接读 .drain() 收集
   */
  constructor() {
    this.pending = [];
    this.state = { cpu_high: false, mem_high: false, disk_low: false };
    this.counters = { cpu: 0, mem: 0 };
    this.lastEmitAt = {};
    this.settings = normalizeSettings(null);
  }

  updateSettings(s) {
    this.settings = normalizeSettings(s);
  }

  drain() {
    const p = this.pending;
    this.pending = [];
    return p;
  }

  _emit(type, summary, extra) {
    const now = Date.now();
    // 磁盘事件按盘符区分限频（同 tick 两个盘同时不足不能互吞）
    const rateKey = type + (extra && extra.mount ? `:${extra.mount}` : '');
    if (now - (this.lastEmitAt[rateKey] || 0) < ALERT_MIN_GAP_MS) return;
    this.lastEmitAt[rateKey] = now;
    this.pending.push({ type, at: now, summary, ...(extra || {}) });
  }

  /**
   * @param s {{cpuPct, memPct, disks:[{mount, freeGb}], paused}}
   * memPct/disks 可为 null（采样缺失时跳过对应维度）
   */
  feed(s) {
    const st = this.settings;
    if (!s || st.paused) return this.drain();
    const sustain = Math.max(1, st.sustainTicks);

    // CPU：连续 sustain 个 tick ≥ 阈值触发；连续 2 个 tick 回落后恢复
    if (Number.isFinite(s.cpuPct)) {
      if (s.cpuPct >= st.cpuThreshold) this.counters.cpu += 1;
      else this.counters.cpu = Math.max(0, this.counters.cpu - 2);
      if (!this.state.cpu_high && this.counters.cpu >= sustain) {
        this.state.cpu_high = true;
        this._emit('cpu_high', `CPU 持续偏高：${s.cpuPct}% ≥ ${st.cpuThreshold}%（连续 ${this.counters.cpu} 个采样）`, { value: s.cpuPct, threshold: st.cpuThreshold });
      } else if (this.state.cpu_high && this.counters.cpu === 0) {
        this.state.cpu_high = false;
        this._emit('cpu_recovered', `CPU 已回落：当前 ${s.cpuPct}%`, { value: s.cpuPct, threshold: st.cpuThreshold });
      }
    }

    // 内存：同 CPU
    if (Number.isFinite(s.memPct)) {
      if (s.memPct >= st.memThreshold) this.counters.mem += 1;
      else this.counters.mem = Math.max(0, this.counters.mem - 2);
      if (!this.state.mem_high && this.counters.mem >= sustain) {
        this.state.mem_high = true;
        this._emit('mem_high', `内存持续偏高：${s.memPct}% ≥ ${st.memThreshold}%`, { value: s.memPct, threshold: st.memThreshold });
      } else if (this.state.mem_high && this.counters.mem === 0) {
        this.state.mem_high = false;
        this._emit('mem_recovered', `内存已回落：当前 ${s.memPct}%`, { value: s.memPct, threshold: st.memThreshold });
      }
    }

    // 磁盘：任一盘剩余 ≤ 阈值触发（按盘记忆，插拔盘不串扰）；回升 1GB 以上恢复
    if (Array.isArray(s.disks)) {
      const low = new Set();
      for (const d of s.disks) {
        if (d && Number.isFinite(d.freeGb) && d.freeGb <= st.diskFreeGb) low.add(d.mount);
      }
      const prev = this.diskLowMounts || new Set();
      for (const m of low) {
        if (!prev.has(m)) {
          const d = s.disks.find((x) => x.mount === m);
          this._emit('disk_low', `磁盘空间不足：${m} 仅剩 ${d ? d.freeGb : '?'} GB（阈值 ${st.diskFreeGb} GB）`, { mount: m, value: d ? d.freeGb : null, threshold: st.diskFreeGb });
        }
      }
      for (const m of prev) {
        if (!low.has(m)) {
          const d = s.disks.find((x) => x.mount === m);
          this._emit('disk_recovered', `磁盘空间已恢复：${m} 剩余 ${d ? d.freeGb : '?'} GB`, { mount: m, value: d ? d.freeGb : null, threshold: st.diskFreeGb });
        }
      }
      this.diskLowMounts = low;
      this.state.disk_low = low.size > 0;
    }

    return this.drain();
  }
}

// ── 设置规范化 ─────────────────────────────────────────────────────────────
const SETTING_LIMITS = {
  cpuThreshold: [50, 100, 90],
  memThreshold: [50, 100, 90],
  diskFreeGb: [1, 500, 5],
  sustainTicks: [1, 12, 4],
  snapshotMs: [3000, 60000, 5000],
  slowMs: [8000, 300000, 15000],
};

/** 面板/MCP 写入的 settings 脏数据防御：越界回落默认，未知字段丢弃 */
function normalizeSettings(raw) {
  const base = {
    cpuThreshold: SETTING_LIMITS.cpuThreshold[2],
    memThreshold: SETTING_LIMITS.memThreshold[2],
    diskFreeGb: SETTING_LIMITS.diskFreeGb[2],
    sustainTicks: SETTING_LIMITS.sustainTicks[2],
    snapshotMs: SETTING_LIMITS.snapshotMs[2],
    slowMs: SETTING_LIMITS.slowMs[2],
    paused: false,
  };
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const [k, [min, max, dflt]] of Object.entries(SETTING_LIMITS)) {
    const v = Number(raw[k]);
    out[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : dflt;
  }
  out.paused = raw.paused === true;
  return out;
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
function formatUptime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

module.exports = {
  cpuDelta,
  parseTasklistCsv,
  parseNetstatWin,
  parseLsof,
  parseSs,
  dedupePorts,
  pickProcs,
  procIndex,
  guardKill,
  normalizeKillCmd,
  AlertMachine,
  normalizeSettings,
  formatUptime,
  splitCsvLine,
  POLARIS_NAME_RE,
  ALERT_KINDS,
};
