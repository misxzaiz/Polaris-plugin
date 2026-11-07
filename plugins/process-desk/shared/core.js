'use strict';
/**
 * core.js —— 进程透视台三端共享纯逻辑（service / mcp / 面板 / 测试 同一口径）
 *
 * 护栏决策（evaluateKill）是本插件的唯一安全权威：service 在 arm/fire 两处
 * 都调它；测试对它做全矩阵覆盖。禁止在 service 里绕过它直接杀进程。
 */

// ── kill 护栏 ───────────────────────────────────────────────────────────────

/**
 * 硬拒名单：杀掉即蓝屏/断桌面/断输入法/杀安全软件的进程。
 * 名单匹配用 normalizeName 后的值（小写、去 .exe）。
 * svchost 服务组 kill 会级联宕一片服务，也硬拒（正规途径是 services.msc）。
 */
const HARD_REFUSE = new Set([
  'system', 'idle', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass',
  'svchost', 'dwm', 'fontdrvhost', 'explorer', 'msmpeng', 'nissrv', 'windefend',
  'securityhealthservice', 'registry', 'memcompression', 'memorycompression',
  'wudfhost', 'sihost', 'ctfmon',
]);

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\.exe$/, '').trim();
}

/** 是否 Polaris 自家进程（僵尸多实例是本插件的目标场景之一，故单列一层确认而非硬拒） */
function isPolarisProc(name, path) {
  const n = normalizeName(name);
  if (n.includes('polaris')) return true;
  const p = String(path || '').toLowerCase();
  return p.includes('polaris');
}

/**
 * kill 护栏决策（纯函数）。
 * @param input {{pid:number, name?:string, path?:string, cmd?:string,
 *   selfPid?:number, ancestorPids?:number[], allowProtected?:boolean}}
 * @returns {{allowed:boolean, code:string, message:string, warnings:string[]}}
 *   code: ok | invalid_pid | system_critical | self | ancestor | polaris_confirm
 */
function evaluateKill(input) {
  const pid = input && input.pid;
  const warnings = [];
  if (!Number.isInteger(pid) || pid <= 0) {
    return { allowed: false, code: 'invalid_pid', message: `非法 PID: ${pid}`, warnings };
  }
  if (pid <= 4) {
    return { allowed: false, code: 'system_critical', message: `PID ${pid} 是系统内核级进程，禁止结束`, warnings };
  }
  const name = normalizeName(input.name);
  if (HARD_REFUSE.has(name)) {
    return {
      allowed: false, code: 'system_critical',
      message: `${input.name} 是系统关键进程，结束它会导致蓝屏/断桌面/系统服务崩溃，本工具一律拒绝（正规修复途径：services.msc 或任务管理器）`,
      warnings,
    };
  }
  if (input.selfPid && pid === input.selfPid) {
    return { allowed: false, code: 'self', message: '目标是进程透视台服务自身，拒绝自杀', warnings };
  }
  const ancestors = Array.isArray(input.ancestorPids) ? input.ancestorPids : [];
  if (ancestors.includes(pid)) {
    return { allowed: false, code: 'ancestor', message: '目标是本服务（或 Polaris 宿主）的祖先进程链，结束它等于杀掉正在运行的 Polaris，拒绝', warnings };
  }
  if (isPolarisProc(input.name, input.path)) {
    // Polaris 僵尸多实例允许清理，但必须二次确认（allowProtected），防止误杀在跑的实例
    warnings.push('这是 Polaris 自家进程：请确认它是僵尸/多余实例，而不是正在使用的这个窗口');
    if (!input.allowProtected) {
      return { allowed: false, code: 'polaris_confirm', message: '目标是 Polaris 自家进程，需要显式二次确认（allowProtected:true）', warnings };
    }
  }
  return { allowed: true, code: 'ok', message: '允许结束', warnings };
}

// ── netstat 解析 ────────────────────────────────────────────────────────────

/** '[::]:135' → {addr:'::',port:135}；'0.0.0.0:9867' → {addr,port}；'*:*' 宽松处理 */
function splitAddr(s, loose) {
  if (!s) return null;
  const i = String(s).lastIndexOf(':');
  if (i === -1) return loose ? { addr: s, port: 0 } : null;
  const addr = String(s).slice(0, i).replace(/^\[(.*)\]$/, '$1');
  const port = Number(String(s).slice(i + 1));
  if (!Number.isInteger(port) || port < 0) return loose ? { addr, port: 0 } : null;
  return { addr, port };
}

/**
 * 解析 `netstat -ano -p tcp`（或 udp）输出。表头随系统语言变化，
 * 只认数据行（TCP 5 列 / UDP 4 列），因此对中文/英文 Windows 都成立。
 * @returns Array<{proto,local:{addr,port},foreign:{addr,port},state,pid:number}>
 */
function parseNetstat(text) {
  const rows = [];
  if (!text) return rows;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const t = line.split(/\s+/);
    const proto = (t[0] || '').toUpperCase();
    if (proto !== 'TCP' && proto !== 'UDP') continue;
    if (t.length < 4) continue;
    const local = splitAddr(t[1], true);
    if (!local) continue;
    const foreign = splitAddr(t[2], true) || { addr: '', port: 0 };
    const pid = Number(t[t.length - 1]);
    if (!Number.isInteger(pid) || pid < 0) continue;
    const state = proto === 'TCP' && t.length >= 5 ? (t[3] || '').toUpperCase() : '';
    rows.push({ proto, local, foreign, state, pid });
  }
  return rows;
}

/** 取本地端口命中的行（所有状态都保留，TIME_WAIT 等信息对面板有用） */
function filterByPort(rows, port) {
  return (rows || []).filter((r) => r.local && r.local.port === port);
}

// ── Restart Manager 输出解析 ────────────────────────────────────────────────

function isLocker(v) {
  return !!v && typeof v === 'object'
    && Number.isInteger(v.pid) && v.pid >= 0
    && (typeof v.app === 'string' || v.app == null);
}

/** 解析 lockers.ps1 的 stdout（PowerShell 对空数组/单元素数组的 JSON 形态都做防御） */
function parseLockers(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return [];
  let v;
  try { v = JSON.parse(t); } catch (_) { return []; }
  if (Array.isArray(v)) return v.filter(isLocker);
  if (v && typeof v === 'object') {
    if (Array.isArray(v.lockers)) return v.lockers.filter(isLocker);
    return [v].filter(isLocker);
  }
  return [];
}

// ── 校验 / 审计 / 格式化 ────────────────────────────────────────────────────

/** 端口校验：整数 1-65535 → 数字；否则 null */
function validatePort(p) {
  const n = Number(p);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

/** 本机绝对路径粗校验（盘符/UNC/POSIX 根）；存在性由 service 层查 */
function looksAbsolutePath(p) {
  if (typeof p !== 'string' || !p || p.length > 1024) return false;
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(p);
}

/**
 * 审计环追加（纯函数）。entries 为现有数组（可含非对象脏值），新条目在前，
 * 截断到 cap。service 是唯一写者。
 */
function auditPush(entries, entry, cap) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e === 'object') : [];
  const next = [Object.assign({}, entry), ...list];
  return next.slice(0, cap || 120);
}

function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeAgo(ts, now) {
  if (!ts) return '从未';
  const d = Math.max(0, (now || Date.now()) - ts);
  if (d < 10000) return '刚刚';
  if (d < 60000) return `${Math.floor(d / 1000)} 秒前`;
  if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`;
  return `${Math.floor(d / 86400000)} 天前`;
}

function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** MCP/文本输出里的一行进程描述（口径与面板详情一致） */
function procLine(p) {
  if (!p || typeof p !== 'object') return '- (无效进程数据)';
  const bits = [`pid=${p.pid}`, p.name || '(未知名称)'];
  if (Number.isFinite(Number(p.ws)) && Number(p.ws) > 0) bits.push(`内存 ${formatBytes(Number(p.ws))}`);
  if (Number.isFinite(Number(p.cpu)) && Number(p.cpu) > 0) bits.push(`CPU ${Number(p.cpu)}s`);
  const where = p.path || p.cmd;
  if (where) bits.push(oneLine(where, 120));
  return `- ${bits.join(' | ')}`;
}

module.exports = {
  HARD_REFUSE,
  normalizeName,
  isPolarisProc,
  evaluateKill,
  splitAddr,
  parseNetstat,
  filterByPort,
  parseLockers,
  validatePort,
  looksAbsolutePath,
  auditPush,
  formatBytes,
  timeAgo,
  oneLine,
  procLine,
};
