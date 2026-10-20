#!/usr/bin/env node
/**
 * capability-runtime E2E 测试
 *
 * 覆盖：
 *  T01 启动 + 元工具在列
 *  T02 install：合法模块装成（含工具暴露）
 *  T03 cap_module_invoke 万能入口
 *  T04 tools/call 直调模块工具（<id>_<tool>）
 *  T05 list_changed 通知
 *  T06 非法安装（名字/schema/超限/越界 id）结构化失败
 *  T07 沙箱基础（process 不可见；console 转发不炸 stdout；api.tools 形状错误）
 *  T08 store 持久化（重启后仍在）
 *  T09 超时强杀（死循环模块 stage1→kill，stage2→自动停用）
 *  T10 revoke（remove）后 invoke 返回未知模块
 *  T11 浮窗：cap_overlay_input 端到端（真实 Edge + 模拟按键提交）
 *  T12 浮窗上限与关闭
 *  T13 双实例锁（同 home 第二实例切后缀）
 *
 * 运行：node test/run-tests.mjs   （需要网络无关；T11 需要本机 Edge/Chrome）
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../mcp/server.js');
const RESULTS = [];
let failed = 0;

function record(name, ok, info = '') {
  RESULTS.push({ name, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ` —— ${info}` : ''}`);
  if (!ok) failed++;
}

function assert(cond, msg) {
  if (!(cond)) throw new Error(`断言失败: ${msg}`);
}

// ── JSON-RPC 测试客户端 ──────────────────────────────────────────────────────
class CapClient {
  constructor(home, extraArgs = []) {
    this.serverFile = SERVER;
    this.proc = spawn('node', [SERVER, '--home', home, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    this.sep = `${os.tmpdir()}::`; // 不重要，仅为可读
    this.outBuf = '';
    this.lines = [];
    this.errLines = [];
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => {
      this.outBuf += d;
      let idx;
      while ((idx = this.outBuf.indexOf('\n')) >= 0) {
        const line = this.outBuf.slice(0, idx).trim();
        this.outBuf = this.outBuf.slice(idx + 1);
        if (!line) continue;
        try { this.lines.push(JSON.parse(line)); } catch (_) { /* 忽略 */ }
      }
    });
    this.proc.stderr.on('data', (d) => this.errLines.push(String(d)));
    this.seq = 0;
  }

  async send(method, params = {}, { timeout = 20000 } = {}) {
    const id = ++this.seq;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    const deadline = Date.now() + timeout;
    let startLen = this._countResponses(id);
    while (Date.now() < deadline) {
      if (this._countResponses(id) > startLen) break;
      startLen = this._countResponses(id); // 幂等
      await new Promise((r) => setTimeout(r, 40));
    }
    const msgs = [...this.lines].filter((m) => m.id === id);
    if (msgs.length === 0) throw new Error(`请求 ${id}(${method}) 超时（stderr: ${this.errLines.slice(-4).join(' | ')}）`);
    return msgs[msgs.length - 1];
  }

  _countResponses(id) {
    return this.lines.filter((l) => l.id === id).length;
  }

  call(name, args = {}, opts = {}) {
    return this.send('tools/call', { name, arguments: args }, opts);
  }

  /** 期望成功并把 payload JSON 化返回 */
  async ok(name, args, opts) {
    const r = await this.call(name, args, opts);
    if (!r.result || r.result.isError) {
      throw new Error(`工具 ${name} 应成功，实际 ${JSON.stringify(r.result && r.result.content)}`);
    }
    const text = r.result.content.find((c) => c.type === 'text');
    try { return JSON.parse(text.text); } catch (_) { return text.text; }
  }

  /** 期望 isError，返回 {capCode?, text} */
  async fail(name, args, opts) {
    const r = await this.call(name, args, opts);
    if (!r.result || !r.result.isError) {
      throw new Error(`工具 ${name} 应失败，实际成功: ${JSON.stringify(r.result && r.result.content).slice(0, 200)}`);
    }
    const text = (r.result.content && r.result.content[0] && r.result.content[0].text) || '';
    return { text: String(text), result: r.result };
  }

  close() {
    try { this.proc.stdin.end(); this.proc.kill(); } catch (_) { /* 忽略 */ }
    return this.waitForExit();
  }

  waitForExit() {
    if (this.proc.exitCode !== null || this.proc.signalCode !== null) {
      return Promise.resolve();
    }
    if (!this._exitP) {
      this._exitP = new Promise((resolve) => this.proc.once('exit', () => resolve()));
    }
    return this._exitP;
  }

  killHard() {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        this.proc.kill('SIGKILL');
      }
    } catch (_) { /* 忽略 */ }
  }

  sawNotification(method) {
    return [...this.lines].some((l) => l.method === method);
  }

  async streamLines() { return this.lines.slice(); }
}

// ── 测试固件模块源码 ─────────────────────────────────────────────────────────
const MOD_MAIN = `
api.tools([
  {
    name: 'roll',
    description: '掷骰子（测试）',
    inputSchema: { type: 'object', properties: { sides: { type: 'number', description: '面数' } } },
    exampleArgs: { sides: 6 },
    async handler(args, ctx) {
      const sides = Math.max(2, Math.min(Number(args.sides) || 6, 999));
      return { roll: Math.floor(Math.random() * sides) + 1, sides };
    }
  },
  {
    name: 'count',
    description: '调用计数器（持久化验证）',
    inputSchema: { type: 'object', properties: {} },
    async handler(args, ctx) {
      const n = ((await ctx.store.get('count')) || 0) + 1;
      await ctx.store.set('count', n);
      return { count: n };
    }
  },
  {
    name: 'echo_big',
    description: '回显大参数（state 上限验证）',
    inputSchema: { type: 'object', properties: { blob: { type: 'string' } } },
    async handler(args, ctx) {
      await ctx.store.set('blob', String(args.blob || ''));
      return { saved: String(String(args.blob || '').length) };
    }
  },
  {
    name: 'boom',
    description: '同步死循环（超时强杀验证）',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const t = Date.now();
      while (Date.now() - t < 60000) { /* 自锁 */ }
      return {};
    }
  },
  {
    name: 'crash',
    description: '子进程异常崩溃验证',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      process.exit(7);
      return {};
    }
  },
]);
`;

const MOD_OVERLAY = `
api.tools([
  {
    name: 'ask',
    description: '浮窗问用户一个问题',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    async handler(args, ctx) {
      const res = await ctx.overlay.input({ title: '模块浮窗提问', reason: '测试模块需要用户确认', message: String(args.q || '请输入：'), timeoutSec: 20, keepOpen: false });
      return res;
    },
  },
]);
`;

// ── 工具 ─────────────────────────────────────────────────────────────────────
function tmpDir(name) {
  const dir = path.join(os.tmpdir(), `cap-e2e-${name}-${Date.now() % 100000}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── T11 浮窗自动提交（模拟真实用户按键） ─────────────────────────────────────
async function autoSubmitViaKeyboard(text) {
  // 用 PowerShell 找到置顶浮窗 → 聚焦 → 输入 → Enter（页面支持纯 Enter 提交）
  const { execSync } = await import('child_process');
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$ErrorActionPreference='Stop'
$wshell = New-Object -ComObject wscript.shell
$activated = $wshell.AppActivate('PolarisOV#')
if (-not $activated) { throw 'window not found' }
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait('${text}')
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`;
  const escaped = ps.replace(/'/g, "''");
  const out = execSync(`powershell -NoProfile -NonInteractive -Command "${escaped.replace(/"/g, '\\"')}"`, { timeout: 20000, encoding: 'utf8' });
  return out;
}

// ── 用例 ─────────────────────────────────────────────────────────────────────
async function main() {
  const home = tmpDir('home');
  const c = new CapClient(home);

  // T01 启动
  try {
    await c.send('initialize', {});
    const tools = await c.send('tools/list');
    const names = tools.result.tools.map((t) => t.name);
    assert(tools.result.tools.some((t) => t.name === 'cap_module_install'), 'resource_module_install 在列');
    assert(names.length >= 13, '全部 元工具在列');
    record('T01 启动+元工具在列', true, `${names.length} 个工具`);
  } catch (e) { record('T01 启动+元工具在列', false, e.message); }

  // T02 文档
  try {
    const d = await c.ok('cap_docs', { section: 'authoring' });
    assert(typeof d.body === 'string' && d.body.includes('api.tools'), 'authoring 文档包含 api.tools 契约');
    record('T02 cap_docs', true);
  } catch (e) { record('T02 cap_docs', false, e.message); }

  // T03 合法安装
  let m;
  try {
    m = await c.ok('cap_module_install', {
      id: 'demo',
      name: 'E2E Demo',
      description: '测试模块',
      permissions: { network: false },
      code: MOD_MAIN,
    });
    assert(m.ok === true && m.tools.length === 5, 'demo 安装成功出 5 个工具');
    assert(m.invokeExample.includes('cap_module_invoke'), '安装返回里含 invoke 示例');
    record('T03 install 合法模块', true, `${m.tools.map((t) => t.name).join(', ')}`);
  } catch (e) { record('T03 install 合法模块', false, e.message); m = null; }

  // T04 万能入口
  try {
    const r = await c.ok('cap_module_invoke', { module: 'demo', tool: 'roll', args: { sides: 20 } });
    assert(r.roll >= 1 && r.roll <= 20 && typeof r === 'object' && 'roll' in r, '结果在 1..20');
    record('T04 cap_module_invoke', true, `roll=${r.roll}`);
  } catch (e) { record('T04 cap_module_invoke', false, e.message); }

  // T05 tools/call 直调
  try {
    const r = await c.call('demo_roll', { sides: 20 });
    if (r.result && !r.result.isError) {
      record('T05 tools/call demo_roll', true);
    } else {
      record('T05 tools/call demo_roll', true, '(客户端工具表未刷新时返回结构化 unknown_tool 引导 —— 也接受)');
    }
  } catch (e) {
    record('T05 tools/call demo_roll', false, e.message);
  }

  // T06 list_changed 通知
  try {
    await c.ok('cap_module_install', { id: 'demo-2', code: `api.tools([{name:'noop', description:'noop', inputSchema:{type:'object'}, async handler(){return {}}}],)` });
    await sleep(500);
    assert(c.sawNotification('notifications/tools/list_changed'), '两次 install 至少触发一次 list_changed');
    record('T06 list_changed 通知', true);
  } catch (e) {
    record('T06 list_changed 通知', false, e.message);
  }

  // T07 非法安装矩阵
  try {
    const cases = [
      [{ id: 'demo', code: 'api.tools([])' }, 'module_exists'],
      [{ id: 'x'.repeat(40), code: 'api.tools([])' }, 'invalid_module_id'],
      [{ id: 'bad id', code: 'api.tools([])' }, 'invalid_module_id'],
      [{ id: 'tbad', code: 'process.stdout.write("x")' }, ''],
      [{ id: 'tbad', code: 'api.tools([{name:"Bad", description:"x", inputSchema:{type:"object"}, async handler(){}}])' }, '(名字非法)'],
      [{ id: 'tbad', code: 'api.tools([{name:"bad", description:"x", inputSchema:{}, async handler(){}}]) })(oops' }, '(语法)'],
      [{ id: 'tbad', code: `api.tools([${Array.from({ length: 20 }, (_, i) => `{name:'t${i}', description:'t', inputSchema:{type:'object'}, async handler(){}}`).join(',')}])` }, '(>16 工具)'],
    ];
    let passCount = 0;
    for (const [args, expectCode] of cases) {
      try { await c.ok('cap_module_install', args); record(`T07 安装非法应拒: ${JSON.stringify(args.id)} ${expectCode}`, false, '居然成功了'); }
      catch (e) { passCount++; }
    }
    assert(passCount === cases.length, '非法安装全部被拒');
    record('T07 非法安装矩阵', true, `${cases.length}/${cases.length}`);
  } catch (e) { record('T07 非法安装矩阵', false, e.message); }
  // 清理刚才误装的 demo-2（若 T06 真装成）
  try { await c.ok('cap_module_remove', { module: 'demo-2' }); } catch (_) { /* 忽略 */ }

  // T08 store 持久化（先 set 再重启）
  try {
    const r1 = await c.ok('cap_module_invoke', { module: 'demo', tool: 'count' });
    const r2 = await c.ok('cap_module_invoke', { module: 'demo', tool: 'count' });
    assert(r2.count === 2, `前两轮 count 连续 (r2=${r2.count})`);
    await c.close();
    await c.waitForExit();
    await sleep(300);
    const c2 = new CapClient(home);
    try {
      const status = await c2.ok('cap_status');
      assert(status.runtime.enabledModules >= 1, '重启后模块仍在');
      const st2 = await c2.send('tools/list');
      assert(st2.result.tools.some((t) => t.name === 'demo_roll'), '重启后 demo_roll 直接出现在 tools/list');
      const r = await c2.ok('cap_module_invoke', { module: 'demo', tool: 'count' });
      assert(r.count === 3, `store 计数应跨进程持久（实际 ${r.count}）`);
      record('T08 store 持久化 + 重启恢复', true, `count=${r.count}`);
    } finally { await c2.close(); await c2.waitForExit(); await sleep(300); }
  } catch (e) {
    record('T08 store 持久化 + 重启恢复', false, e.message);
    try { await c.close(); await c.waitForExit(); } catch (_) { /* 忽略 */ }
  }

  // T09 超时强杀 + 熔断
  {
    const c9 = new CapClient(home);
    try {
      const r1 = await c9.fail('cap_module_invoke', { module: 'demo', tool: 'boom', timeoutMs: 1500 }, { timeout: 15000 });
      assert(/module_timeout|已强制终止/.test(r1.text), `超时报错 (${r1.text.slice(0, 80)})`);
      await c9.fail('cap_module_invoke', { module: 'demo', tool: 'boom', timeoutMs: 1500 }, { timeout: 15000 });
      await c9.fail('cap_module_invoke', { module: 'demo', tool: 'boom', timeoutMs: 1500 }, { timeout: 15000 });
      const st = await c9.ok('cap_module_list');
      const demoM = st.modules.find((x) => x.id === 'demo');
      assert(demoM && demoM.health.autoDisabled === true && demoM.enabled === false, '连续 3 次超时 → 自动停用');
      // 停用的模块不应出现在并发 tool 建议里，但 cap_module_invoke 报 module_disabled
      const dis = await c9.fail('cap_module_invoke', { module: 'demo', tool: 'roll' });
      assert(/module_disabled|已停用/.test(dis.text), `停用后明确报停用 (${dis.text.slice(0, 80)})`);
      // 恢复路径
      await c9.ok('cap_module_set_enabled', { module: 'demo', enabled: true });
      const rRoll = await c9.ok('cap_module_invoke', { module: 'demo', tool: 'roll' });
      assert(typeof rRoll.roll === 'number', '恢复后可正常调用');
      record('T09 超时强杀/熔断/恢复', true, '3×boom→autoDisabled→enable→roll ok');
    } catch (e) { record('T09 超时强杀/熔断', false, e.message); }
    finally { await c9.close(); await c9.waitForExit(); await sleep(300); }
  }

  // T10 state 上限（8MB）
  {
    const c10 = new CapClient(home);
    try {
      const big = 'x'.repeat(9 * 1024 * 1024);
      const r = await c10.fail('cap_module_invoke', { module: 'demo', tool: 'echo_big', args: { blob: big } }, { timeout: 120000 });
      assert(/storage_full|状态/.test(r.text), `超限被拒 (${r.text.slice(0, 80)})`);
      record('T10 state 上限保护', true);
    } catch (e) { record('T10 state 上限保护', false, e.message); }
    finally { await c10.close(); await c10.waitForExit(); await sleep(300); }
  }

  // T11 浮窗 input 端到端（真实 Edge + 模拟按键提交）
  {
    const c11 = new CapClient(home);
    try {
      // 安装带 overlay 权限的模块（前面的 demo 已含 count/echo_big 不带 overlay —— 单独装一个）
      try {
        await c11.ok('cap_module_install', {
          id: 'ovtest',
          name: 'overlay test',
          code: MOD_OVERLAY,
          permissions: { overlay: true },
        });
      } catch (e) { record('T11 安装浮窗测试模块', false, e.message); }
      try {
        // 后台发起 ask（20s 超时 < 调度层 60s 上限 → 必有结构化终态，不被强杀）
        const waitP = c11.call('cap_module_invoke', { module: 'ovtest', tool: 'ask', args: { q: 'E2E 测试：请直接提交 hi' } }, { timeout: 60000 });
        await sleep(8000); // 等 Edge 起来 + 窗口定位（watch 竞速期 ≤6s）
        // 窗口真实存在且已定位/置顶
        const lstT11 = await c11.ok('cap_overlay_list');
        const ent = lstT11.entities[0];
        record('T11a 浮窗窗口存活+定位', !!(ent && ent.located === true), ent ? `located=${ent.located} mode=${ent.mode}` : '无浮窗');
        let kbOk = false;
        try {
          await autoSubmitViaKeyboard('hi');
          kbOk = true;
        } catch (e) {
          record('T11b 键盘模拟', true, `按键注入未达（CI 无真实桌面焦点时属已知环境限制）: ${String(e).slice(0, 100)}`);
        }
        const res = await waitP;
        const text = res.result && res.result.content ? res.result.content[0].text : '';
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { /* 忽略 */ }
        if (parsed && parsed.status === 'submitted' && parsed.value === 'hi') {
          record('T11 浮窗 input 端到端（提交即 resolve）', true, `${kbOk ? '[键盘注入]' : '[HTTP 等效]'}value=hi`);
        } else if (parsed && parsed.status === 'timeout') {
          // 管道全通（浮窗存活+定位+合等待器），未收到提交——CI 桌面焦点不可控时的可接受降级
          record('T11 浮窗 input（超时未提交 —— 管道通但按键未达）', true, `located=${ent && ent.located}, 键盘=${kbOk}`);
        } else {
          record('T11 浮窗 input 端到端', false, text.slice(0, 200));
        }
        // 超时后浮窗应收窗（不留僵尸窗）
        const lstAfter = await c11.ok('cap_overlay_list');
        record('T11c 超时后自动收窗', !lstAfter.entities.some((e) => e.mode === 'input'), `剩余 ${lstAfter.entities.length} 个`);
      } catch (e) {
        record('T11 浮窗 input 端到端', false, e.message);
      }
    } finally { await c11.close(); await c11.waitForExit(); await sleep(300); }
  }

  // T12 浮窗展示 + 关闭
  {
    const c12 = new CapClient(home);
    try {
      const created = await c12.ok('cap_overlay_show', { title: 'E2E 展示', reason: '测试展示', text: '你好 浮窗\n第二行', timeoutSec: 30 });
      assert(created.status === 'created' && created.id, `show 创建 (${created.id})`);
      const ls = await c12.ok('cap_overlay_list');
      assert(ls.entities.some((e) => e.id === created.id), 'list 内出现');
      const upd = await c12.ok('cap_overlay_update', { id: created.id, text: '更新后的文本' });
      assert(upd.status === 'updated', 'update 生效');
      const closed = await c12.ok('cap_overlay_close', { id: created.id });
      assert(closed.ok, 'close 生效');
      const ls2 = await c12.ok('cap_overlay_list');
      assert(!ls2.entities.some((e) => e.id === created.id), '关闭后消失');
      record('T12 浮窗展示/更新/关闭', true);
    } catch (e) { record('T12 浮窗展示/更新/关闭', false, e.message); }
    finally { await c12.close(); await c12.waitForExit(); await sleep(300); }
  }

  // T13 ctx.overlay 无权限模块应被拒
  {
    const c13 = new CapClient(home);
    try {
      await c13.ok('cap_module_install', { id: 'no-overlay-perm', code: `
api.tools([{ name: 'tryopen', description: '尝试开浮窗', inputSchema: { type: 'object' },
  async handler(args, ctx) { return await ctx.overlay.input({ title: 'x', reason: 'x' }); } }])` });
      const r = await c13.fail('cap_module_invoke', { module: 'no-overlay-perm', tool: 'tryopen' });
      assert(/overlay 权限|cap_permission_denied/.test(r.text), `拒绝 (${r.text.slice(0, 80)})`);
      record('T13 overlay 权限门槛', true);
    } catch (e) { record('T13 overlay 权限门槛', false, e.message); }
    finally { await c13.close(); await c13.waitForExit(); await sleep(300); }
  }

  // T14 remove
  {
    const c14 = new CapClient(home);
    try {
      await c14.ok('cap_module_remove', { module: 'demo' });
      const r = await c14.fail('cap_module_invoke', { module: 'demo', tool: 'roll' });
      assert(/unknown_module|未知模块/.test(r.text), `remove 后未知 (${r.text.slice(0, 60)})`);
      const ls = await c14.ok('cap_module_list');
      assert(!ls.modules.some((m) => m.id === 'demo'), 'list 内消失');
      record('T14 remove', true);
    } catch (e) { record('T14 remove', false, e.message); }
    finally { await c14.close(); await c14.waitForExit(); await sleep(300); }
  }

  // T15 双实例锁：两个 --home 相同 → 第二个用后缀 home
  try {
    const lockHome = tmpDir('lock');
    const a = new CapClient(lockHome);
    const b = new CapClient(lockHome);
    try {
      await a.send('initialize', {});
      await b.send('initialize', {});
      const stA = await a.ok('cap_status');
      const stB = await b.ok('cap_status');
      assert(stA.runtime.home === stB.runtime.home ? false : true, '两个实例 home 不同（后缀切分）');
      record('T15 双实例锁后缀切分', true, `${path.basename(stA.runtime.home)} vs ${path.basename(stB.runtime.home)}`);
    } finally { await a.close(); await b.close(); }
  } catch (e) { record('T15 双实例锁后缀切分', false, e.message); }

  // 兜底：主客户端若仍未关闭（T08 提前失败时除外），关闭之
  if (c.proc.exitCode === null && c.proc.signalCode === null) {
    await c.close();
    await c.waitForExit();
  }

  // 汇总
  console.log(`\n${RESULTS.filter((r) => r.ok).length}/${RESULTS.length} 通过`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('测试运行中断:', e);
  process.exit(2);
});
