/**
 * text-triage MCP 协议验证（node test/mcp-verify.mjs）
 *
 * 假桥法（trace-lens 实证配方）：本进程起一个内存版 router-dispatch HTTP 服务
 * （cap.kv get/set/delete 走 Map），spawn MCP server 时 env 指向假桥——被测服务与
 * 本测试进程都绝不碰真实宿主。额外断言：全程未向 cap.kv 发出 list 动作
 * （宿主 kv list 打死进程的高危接口，本插件刻意零使用）。
 *
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑：双重包裹会变成
 * "未知工具：undefined"）；notifications/initialized 是通知不回包（cron-lens 坑）。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

// ── 假桥：内存 kv + 动作记录 ────────────────────────────────────────────────
const kvStore = new Map();
const seenActions = []; // { target, action }

const bridge = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/api/health') { res.writeHead(200); res.end('ok'); return; }
    if (req.url === '/api/router-dispatch' && req.method === 'POST') {
      try {
        const { req: inner } = JSON.parse(body);
        const target = inner && inner.target;
        const payload = (inner && inner.payload) || {};
        seenActions.push({ target, action: payload.action });
        if (target === 'cap.kv') {
          if (payload.action === 'get') {
            const key = payload.key;
            const respond = (v) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: { value: v } })); };
            respond(kvStore.has(key) ? kvStore.get(key) : null);
          } else if (payload.action === 'set') {
            kvStore.set(payload.key, payload.value);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: {} }));
          } else if (payload.action === 'delete') {
            kvStore.delete(payload.key);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: {} }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: `假桥不支持的动作：${payload.action}` }));
          }
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: '未知 target' }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }
    res.writeHead(404); res.end('not found');
  });
});

await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
const bridgePort = bridge.address().port;

// ── spawn MCP server（env 指向假桥）────────────────────────────────────────
const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp', 'server.js')], {
  cwd: APP_ROOT,
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 'test-token' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* ignore */ }
  }
});

function rpc(method, params, timeoutMs = 8000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc 超时: ${method}`)), timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
function text(res) {
  return String(res.result?.content?.[0]?.text || '');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

const MINI_PIPELINE = {
  classes: [{ id: 'err', anyOf: ['ERROR'] }, { id: 'warn', anyOf: ['WARN'] }],
  // \w 不匹配汉字（认证服务）——捕获组用 (.+?) 才能抽中文组件名
  extract: { err: { comp: { pattern: 're:\\[(.+?)\\]', type: 'string' } } },
  decide: { err: [{ when: { field: 'comp', op: 'exists' }, then: { verdict: '排查', severity: 'P1' } }] },
  fallback: { verdict: '未分类' },
};

let harnessError = false;
try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: serverInfo.name=text-triage', init.result?.serverInfo?.name === 'text-triage');
  notify('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  const expect = ['text_triage_run', 'text_triage_test', 'text_triage_save', 'text_triage_get', 'text_triage_delete', 'text_triage_list', 'text_triage_builtin'];
  check('tools/list: 恰好七工具且顺序稳定', JSON.stringify(names) === JSON.stringify(expect), `实际 ${names.join(',')}`);

  // run：内联模板 + 中文文本经 stdio 往返
  const run1 = await rpc('tools/call', { name: 'text_triage_run', arguments: { text: '2026-11-04 ERROR [认证服务] 登录失败', pipeline: MINI_PIPELINE } });
  check('run: 无错误', run1.result?.isError === false, text(run1).slice(0, 100));
  check('run: 类别=err 且中文组件名完整往返', text(run1).includes('err') && text(run1).includes('认证服务'), text(run1).slice(0, 200));
  check('run: 决策=排查 P1', text(run1).includes('排查') && text(run1).includes('P1'));
  check('run: 含证据链 trace', text(run1).includes('证据链 trace'));

  const run2 = await rpc('tools/call', { name: 'text_triage_run', arguments: { text: '普通信息', pipeline: MINI_PIPELINE } });
  check('run: 未分类走 fallback', run2.result?.isError === false && text(run2).includes('未分类'));

  const run3 = await rpc('tools/call', { name: 'text_triage_run', arguments: { text: 'x', pipeline: { classes: [{ id: 'a', anyOf: ['re:([bad'] }] } } });
  check('run: 坏模板 isError 带原因', run3.result?.isError === true && text(run3).includes('模板非法'));

  // save / get / list / test / delete 全链路（真走假桥 kv）
  const save1 = await rpc('tools/call', { name: 'text_triage_save', arguments: { name: '我的-模板', pipeline: MINI_PIPELINE } });
  check('save: 中文模板名成功', save1.result?.isError === false && text(save1).includes('已保存'), text(save1));
  check('save: 数据确实落假桥 kv', kvStore.has('text-triage:pipe:我的-模板'));

  const save2 = await rpc('tools/call', { name: 'text_triage_save', arguments: { name: 'bad name!', pipeline: MINI_PIPELINE } });
  check('save: 非法名拒绝', save2.result?.isError === true);

  const save3 = await rpc('tools/call', { name: 'text_triage_save', arguments: { name: 'x', pipeline: { classes: 'nope' } } });
  check('save: 非法模板拒绝', save3.result?.isError === true && text(save3).includes('模板非法'));

  const get1 = await rpc('tools/call', { name: 'text_triage_get', arguments: { name: '我的-模板' } });
  check('get: saved 来源且 JSON 回读一致', get1.result?.isError === false && text(get1).includes('（saved）') && text(get1).includes('"decide"'), text(get1).slice(0, 120));

  const get2 = await rpc('tools/call', { name: 'text_triage_get', arguments: { name: 'log-triage' } });
  check('get: 内置预设 fallback 到 builtin', text(get2).includes('（builtin）'));

  const get3 = await rpc('tools/call', { name: 'text_triage_get', arguments: { name: '不存在' } });
  check('get: 不存在报错', get3.result?.isError === true);

  const ls1 = await rpc('tools/call', { name: 'text_triage_list', arguments: {} });
  check('list: 含内置与已保存', text(ls1).includes('[builtin]') && text(ls1).includes('[saved]') && text(ls1).includes('我的-模板'), text(ls1).slice(0, 200));
  check('list: 同名以 saved 为准（log-triage 未被保存时只出现 builtin）', (text(ls1).match(/\[saved\] log-triage/g) || []).length === 0);

  const test1 = await rpc('tools/call', { name: 'text_triage_test', arguments: { name: '我的-模板', text: '2026-11-04 ERROR [db] 连接超时' } });
  check('test: 已存模板实跑成功', test1.result?.isError === false && text(test1).includes('排查'), text(test1).slice(0, 150));

  const test2 = await rpc('tools/call', { name: 'text_triage_test', arguments: { name: 'log-triage', text: '2026-11-04 10:00:00 ERROR [api] bad' } });
  check('test: 内置预设实跑（P1）', test2.result?.isError === false && text(test2).includes('P1'), text(test2).slice(0, 150));

  const test3 = await rpc('tools/call', { name: 'text_triage_test', arguments: { name: '没有这个', text: 'x' } });
  check('test: 模板不存在报错', test3.result?.isError === true);

  const del1 = await rpc('tools/call', { name: 'text_triage_delete', arguments: { name: 'log-triage' } });
  check('delete: 内置预设拒绝', del1.result?.isError === true, text(del1));

  const del2 = await rpc('tools/call', { name: 'text_triage_delete', arguments: { name: '我的-模板' } });
  check('delete: 已存模板删除成功', del2.result?.isError === false);
  check('delete: 假桥 kv 中确已删除', !kvStore.has('text-triage:pipe:我的-模板'));
  check('delete: 索引同步移除', !JSON.stringify(kvStore.get('text-triage:index') || []).includes('我的-模板'));

  const builtin1 = await rpc('tools/call', { name: 'text_triage_builtin', arguments: {} });
  check('builtin: 三预设齐全含 JSON', ['log-triage', 'latency-triage', 'disk-triage'].every((n) => text(builtin1).includes(n)) && text(builtin1).includes('"classes"'));

  const unknown = await rpc('tools/call', { name: 'text_triage_no_such', arguments: {} });
  check('未知工具: isError 未知工具', unknown.result?.isError === true && text(unknown).includes('未知工具'));

  // 高危接口守卫：全程不得出现 cap.kv list 动作
  const kvActions = seenActions.filter((a) => a.target === 'cap.kv').map((a) => a.action);
  check('守卫: 全程未发 cap.kv list 动作', !kvActions.includes('list'), `实际动作集: ${[...new Set(kvActions)].join(',')}`);
  check('守卫: kv 动作只含 get/set/delete', kvActions.every((a) => ['get', 'set', 'delete'].includes(a)));
} catch (e) {
  harnessError = true;
  console.error('  ✖ harness 异常:', e.message);
} finally {
  mcp.kill();
  bridge.close();
  const failed = results.filter((r) => !r.pass).length + (harnessError ? 1 : 0);
  const total = results.length + (harnessError ? 1 : 0);
  console.log(`\nMCP 冒烟: ${total - failed}/${total} 通过`);
  process.exitCode = failed ? 1 : 0;
}
