/**
 * 离线单元测试（node test/run-tests.mjs，不需要 Polaris 在跑）
 *
 * 覆盖 service/lib.js 全部纯逻辑：CPU 差值、三平台解析器、进程/端口加工、
 * kill 守卫与命令校验、告警状态机（边沿触发/防抖/恢复/限频）、设置规范化。
 */
import assert from 'node:assert/strict';
import lib from '../service/lib.js';

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};
const t = (name, fn) => {
  try { fn(); record(name, true); } catch (e) { record(name, false, e.message); }
};

// ── cpuDelta ───────────────────────────────────────────────────────────────
t('cpuDelta: 已知差值算出占用率', () => {
  const prev = [{ times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } }];
  const next = [{ times: { user: 200, nice: 0, sys: 100, idle: 1700, irq: 0 } }];
  // busy 增 150，total 增 1000 → 15%
  assert.equal(lib.cpuDelta(prev, next), 15);
});
t('cpuDelta: 完全无流逝返回 null', () => {
  const c = [{ times: { user: 1, nice: 0, sys: 1, idle: 1, irq: 0 } }];
  assert.equal(lib.cpuDelta(c, c), null);
});
t('cpuDelta: 长度不一致/空返回 null', () => {
  assert.equal(lib.cpuDelta([], [{ times: {} }]), null);
  assert.equal(lib.cpuDelta(null, null), null);
});

// ── parseTasklistCsv ───────────────────────────────────────────────────────
t('parseTasklistCsv: 标准行 + 内存千分位', () => {
  const text = '"chrome.exe","12345","Console","1","123,456 K"\r\n"node.exe","999","Console","1","56,780 K"\r\n';
  const rows = lib.parseTasklistCsv(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: 'chrome.exe', pid: 12345, memK: 123456 });
  assert.deepEqual(rows[1], { name: 'node.exe', pid: 999, memK: 56780 });
});
t('parseTasklistCsv: 中文系统映像名与坏行容错', () => {
  const text = '"微信.exe","42","Console","1","888 K"\n不是csv行\n"",7,"Console","1","1 K"\n"weixin.exe","abc","Console","1","1 K"\n';
  const rows = lib.parseTasklistCsv(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '微信.exe');
  assert.equal(rows[0].pid, 42);
});
t('parseTasklistCsv: 空输入', () => {
  assert.deepEqual(lib.parseTasklistCsv(''), []);
  assert.deepEqual(lib.parseTasklistCsv(null), []);
});

// ── 端口解析器 ─────────────────────────────────────────────────────────────
t('parseNetstatWin: 只取 LISTENING，支持 IPv6', () => {
  const text = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:9829           0.0.0.0:0              LISTENING       4321',
    '  TCP    [::]:9829              [::]:0                 LISTENING       4321',
    '  TCP    127.0.0.1:19870        127.0.0.1:52341        ESTABLISHED     100',
    '  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       55',
    '',
  ].join('\r\n');
  const rows = lib.parseNetstatWin(text);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { port: 9829, pid: 4321 });
  assert.deepEqual(rows[2], { port: 8080, pid: 55 });
});
t('parseLsof: macOS 输出', () => {
  const text = 'COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME\nrapportd  699  user    4u  IPv4  0xabcdef        0t0  TCP *:52944 (LISTEN)\nnode     1234  user   22u  IPv4  0x123456        0t0  TCP localhost:9829 (LISTEN)\n';
  const rows = lib.parseLsof(text);
  assert.deepEqual(rows, [{ port: 52944, pid: 699 }, { port: 9829, pid: 1234 }]);
});
t('parseSs: linux 输出（pid 缺失记 0）', () => {
  const text = 'State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process\nLISTEN 0 511 *:9829 *:* users:(("polaris-web",pid=777,fd=18))\nLISTEN 0 4096 *:22 *:* \n';
  const rows = lib.parseSs(text);
  assert.deepEqual(rows, [{ port: 9829, pid: 777 }, { port: 22, pid: 0 }]);
});

// ── dedupePorts / pickProcs ────────────────────────────────────────────────
t('dedupePorts: IPv4/IPv6 同端口合并取小 pid + 名字映射 + 排序', () => {
  const procs = lib.procIndex([
    { name: 'a.exe', pid: 4321, memK: 1 },
    { name: 'b.exe', pid: 100, memK: 1 },
  ]);
  const rows = lib.dedupePorts([
    { port: 9829, pid: 4321 }, { port: 9829, pid: 4321 }, { port: 8080, pid: 100 }, { port: 1, pid: 0 },
  ], procs, 100);
  assert.deepEqual(rows, [
    { port: 1, pid: 0, name: '' },
    { port: 8080, pid: 100, name: 'b.exe' },
    { port: 9829, pid: 4321, name: 'a.exe' },
  ]);
});
t('dedupePorts: maxPorts 截断与非法端口过滤', () => {
  const rows = lib.dedupePorts([
    { port: 70000, pid: 1 }, { port: -2, pid: 1 }, { port: 443, pid: 9 }, { port: 80, pid: 8 },
  ], null, 1);
  assert.deepEqual(rows, [{ port: 80, pid: 8, name: '' }]);
});
t('pickProcs: 内存降序 + 过滤 + limit', () => {
  const rows = [
    { name: 'node.exe', pid: 1, memK: 100 * 1024 },
    { name: 'NodeLauncher.exe', pid: 2, memK: 10 * 1024 },
    { name: 'chrome.exe', pid: 3, memK: 500 * 1024 },
  ];
  assert.deepEqual(lib.pickProcs(rows, { limit: 2 }).map((r) => r.pid), [3, 1]);
  assert.deepEqual(lib.pickProcs(rows, { limit: 10, filter: 'node' }).map((r) => r.pid), [1, 2]);
});

// ── guardKill / normalizeKillCmd ───────────────────────────────────────────
t('guardKill: 系统进程/自身/父进程/Polaris 全拒', () => {
  assert.match(lib.guardKill({ pid: 4, selfPid: 100, parentPid: 99 }), /非法或为系统关键/);
  assert.match(lib.guardKill({ pid: 100, selfPid: 100, parentPid: 99 }), /自身/);
  assert.match(lib.guardKill({ pid: 99, selfPid: 100, parentPid: 99 }), /宿主后端/);
  assert.match(lib.guardKill({ pid: 5, name: 'Polaris.exe', selfPid: 100, parentPid: 99 }), /Polaris 核心/);
  assert.match(lib.guardKill({ pid: 5, name: 'polaris-mcp.exe', selfPid: 100, parentPid: 99 }), /Polaris 核心/);
});
t('guardKill: 普通 PID 且名字可空则放行', () => {
  assert.equal(lib.guardKill({ pid: 12345, name: '', selfPid: 100, parentPid: 99 }), null);
  assert.equal(lib.guardKill({ pid: 12345, name: 'node.exe', selfPid: 100, parentPid: 99 }), null);
});
t('normalizeKillCmd: 必须显式 confirm', () => {
  assert.match(lib.normalizeKillCmd({ pid: 5 }).error, /confirm/);
  assert.match(lib.normalizeKillCmd({ pid: 5, confirm: 'yes' }).error, /confirm/);
  assert.match(lib.normalizeKillCmd({ confirm: true }).error, /pid 或 port/);
  assert.match(lib.normalizeKillCmd({ port: 70000, confirm: true }).error, /pid 或 port/);
  const ok = lib.normalizeKillCmd({ port: 9827, confirm: true, reason: 'x'.repeat(500) });
  assert.equal(ok.port, 9827);
  assert.equal(ok.reason.length, 200);
});
t('normalizeSettings: 越界夹取 + 脏数据回落默认', () => {
  assert.deepEqual(lib.normalizeSettings({ cpuThreshold: 10, memThreshold: 300, diskFreeGb: 0, sustainTicks: 99, paused: 'yes' }), {
    cpuThreshold: 50, memThreshold: 100, diskFreeGb: 1, sustainTicks: 12, snapshotMs: 5000, slowMs: 15000, paused: false,
  });
  assert.deepEqual(lib.normalizeSettings('garbage'), lib.normalizeSettings(null));
  assert.equal(lib.normalizeSettings({ snapshotMs: 3000 }).snapshotMs, 3000);
});

// ── AlertMachine ───────────────────────────────────────────────────────────
t('AlertMachine: 持续超限才触发（防抖）+ 边沿单次', () => {
  const am = new lib.AlertMachine();
  am.updateSettings({ cpuThreshold: 90, sustainTicks: 3 });
  const e1 = am.feed({ cpuPct: 95, memPct: null, disks: [] });
  assert.equal(e1.length, 0, '第一个采样不应触发');
  am.feed({ cpuPct: 95, memPct: null, disks: [] });
  const e3 = am.feed({ cpuPct: 95, memPct: null, disks: [] });
  assert.equal(e3.length, 1);
  assert.equal(e3[0].type, 'cpu_high');
  const e4 = am.feed({ cpuPct: 95, memPct: null, disks: [] });
  assert.equal(e4.length, 0, '持续超限不重复报');
});
t('AlertMachine: 回落发恢复事件', () => {
  const am = new lib.AlertMachine();
  am.updateSettings({ cpuThreshold: 90, sustainTicks: 1 });
  am.feed({ cpuPct: 95, memPct: null, disks: [] });
  const ev = am.feed({ cpuPct: 20, memPct: null, disks: [] });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'cpu_recovered');
});
t('AlertMachine: 抖动不翻转状态', () => {
  const am = new lib.AlertMachine();
  am.updateSettings({ cpuThreshold: 90, sustainTicks: 2 });
  am.feed({ cpuPct: 95, memPct: null, disks: [] }); // counter=1
  am.feed({ cpuPct: 10, memPct: null, disks: [] }); // counter=0（-2 夹 0）
  am.feed({ cpuPct: 95, memPct: null, disks: [] }); // counter=1
  assert.equal(am.drain().length, 0, '未达 sustain 不应触发');
});
t('AlertMachine: 磁盘按盘记忆边沿 + 恢复', () => {
  const am = new lib.AlertMachine();
  am.updateSettings({ diskFreeGb: 5 });
  const low = [{ mount: 'C:\\', freeGb: 2 }, { mount: 'D:\\', freeGb: 2 }];
  const ev1 = am.feed({ cpuPct: null, memPct: null, disks: low });
  assert.equal(ev1.length, 2, '两个盘同时告警');
  const ev2 = am.feed({ cpuPct: null, memPct: null, disks: low });
  assert.equal(ev2.length, 0, '不重复报');
  const ev3 = am.feed({ cpuPct: null, memPct: null, disks: [{ mount: 'C:\\', freeGb: 2 }, { mount: 'D:\\', freeGb: 20 }] });
  assert.equal(ev3.length, 1);
  assert.equal(ev3[0].type, 'disk_recovered');
  assert.match(ev3[0].summary, /D:/);
});
t('AlertMachine: paused 时静默', () => {
  const am = new lib.AlertMachine();
  am.updateSettings({ cpuThreshold: 90, sustainTicks: 1, paused: true });
  assert.equal(am.feed({ cpuPct: 99, memPct: null, disks: [] }).length, 0);
});
t('AlertMachine: 事件含阈值与数值', () => {
  const am = new lib.AlertMachine();
  am.updateSettings({ cpuThreshold: 90, sustainTicks: 1 });
  const [ev] = am.feed({ cpuPct: 93.5, memPct: null, disks: [] });
  assert.equal(ev.value, 93.5);
  assert.equal(ev.threshold, 90);
});

// ── formatUptime ───────────────────────────────────────────────────────────
t('formatUptime: 天/时/分', () => {
  assert.equal(lib.formatUptime(90061), '1 天 1 小时');
  assert.equal(lib.formatUptime(3660), '1 小时 1 分钟');
  assert.equal(lib.formatUptime(59), '0 分钟');
});

// 汇总
const bad = results.filter((r) => !r.pass);
console.log(`\n[lib] 结果：${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
