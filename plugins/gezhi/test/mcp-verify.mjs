/**
 * 格致 MCP 验证（node test/mcp-verify.mjs，离线）
 * 内存 IPC bridge（cap.kv）+ 子进程 mcp/server.js，JSON-RPC stdio 全流程：
 * initialize → tools/list(5) → guide → build（落盘+登记）→ 非法 spec 拒绝 →
 * recent → reveal 护栏（未登记路径拒绝，不弹窗）→ forget 确认门 → 登记消失。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function startMockBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const { target, payload } = JSON.parse(b).req;
      let result = null; let ok = true;
      if (target === 'cap.kv') {
        const { action, key, value } = payload;
        if (action === 'get') result = { value: store.has(key) ? store.get(key) : null };
        else if (action === 'set') { store.set(key, value === undefined ? null : value); result = { id: key }; }
        else if (action === 'delete') { store.delete(key); result = { deleted: true }; }
        else if (action === 'list') result = { keys: [...store.keys()] };
        else ok = false;
      } else ok = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ msgId: 'm', ok, result, error: ok ? null : 'x' }));
    });
  });
  return { server, store, listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}

const bridge = startMockBridge();
const bridgePort = await bridge.listen();

// 预置设置：导出目录指向临时目录（不污染桌面）
const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'gezhi-mcp-'));
bridge.store.set('gezhi.settings', { schemaVersion: 1, exportDir: tmpOut, theme: 'slate' });

const here = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const child = spawn(process.execPath, ['mcp/server.js'], {
  cwd: here,
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const stderrChunks = [];
child.stderr.on('data', (c) => stderrChunks.push(String(c)));

let nextId = 1;
const pending = new Map();
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc timeout: ${method}`)); }, 30000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
}

async function callTool(name, args) {
  const res = await rpc('tools/call', { name, arguments: args || {} });
  assert.ok(res.result, `${name} 缺 result：${JSON.stringify(res).slice(0, 200)}`);
  return { text: res.result.content[0].text, isError: res.result.isError === true };
}

try {
  // 1. initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'gezhi');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 2. tools/list：5 个工具
  const list = await rpc('tools/list');
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['xlsx_build', 'xlsx_guide', 'xlsx_recent', 'xlsx_reveal', 'xlsx_forget'], `工具清单：${names}`);

  // 3. guide：契约手册
  const guide = await callTool('xlsx_guide');
  assert.ok(!guide.isError && guide.text.includes('Sheet Spec') && guide.text.includes('{r}'), 'guide 应含契约与 {r} 说明');

  // 4. build：合法 spec → 落盘 + 登记
  const spec = {
    title: '冒烟台账',
    theme: 'forest',
    sheets: [{
      name: '明细',
      columns: [{ h: '品名', type: 'text' }, { h: '数量', type: 'int' }, { h: '单价', type: 'money' }, { h: '小计', type: 'money', formula: '=B{r}*C{r}' }],
      rows: [['苹果', 12, 3.5, null], ['香蕉', 20, 2, null]],
      stats: [{ type: 'sum', cols: [1, 2, 3] }],
      conditional: [{ col: 3, op: 'gt', value: 50, style: 'warn' }],
    }],
  };
  const build = await callTool('xlsx_build', spec);
  assert.ok(!build.isError, `build 应成功：${build.text}`);
  assert.ok(build.text.includes('已生成'), build.text);
  const pathLine = build.text.split('\n').find((l) => l.startsWith('路径：'));
  const filePath = pathLine.replace('路径：', '').split('（')[0].trim();
  assert.ok(fs.existsSync(filePath), `文件应存在：${filePath}`);
  assert.ok(filePath.startsWith(tmpOut), `应落在设置的导出目录：${filePath}`);
  const keys = [...bridge.store.keys()];
  const bookKey = keys.find((k) => k.startsWith('gezhi.book.'));
  assert.ok(bookKey, '应有作品登记');
  const entry = bridge.store.get(bookKey);
  assert.equal(entry.title, '冒烟台账');
  assert.equal(entry.sheetCount, 1);
  assert.equal(entry.rowCount, 2);
  assert.equal(entry.path, filePath);
  // 产物被 python 验收器认可（快速完整性：zip magic + openpyxl 能开）
  const { execFileSync } = await import('node:child_process');
  execFileSync('python', ['-c', `from openpyxl import load_workbook; wb=load_workbook(r'${filePath.replace(/\\/g, '\\\\')}'); assert wb.sheetnames==['明细']`]);

  // 5. 非法 spec → isError 且引导 guide
  const bad = await callTool('xlsx_build', { title: '坏', sheets: [{ name: 'S', columns: [{ h: 'a' }], rows: [] }] });
  assert.ok(bad.isError, '空 rows 应报错');
  assert.ok(bad.text.includes('xlsx_guide'), '报错应引导查 guide');

  // 6. recent：能看到登记
  const recent = await callTool('xlsx_recent');
  assert.ok(recent.text.includes('冒烟台账'), recent.text);

  // 7. reveal 护栏：未登记路径拒绝（不 spawn）
  const reveal = await callTool('xlsx_reveal', { path: 'C:\\Windows\\notepad.exe' });
  assert.ok(reveal.isError, '未登记路径应拒绝');
  // 已登记路径 → 平台 spawn 分支（验证允许通过逻辑；spawn 本身 detach 不断言 UI）
  const revealOk = await callTool('xlsx_reveal', { path: filePath });
  assert.ok(!revealOk.isError, `已登记路径应放行：${revealOk.text}`);

  // 8. forget：确认门 → 登记消失（文件保留）
  const id = bookKey.replace('gezhi.book.', '');
  const noConfirm = await callTool('xlsx_forget', { id });
  assert.ok(noConfirm.isError, '缺 confirm 应拒绝');
  const forget = await callTool('xlsx_forget', { id, confirm: true });
  assert.ok(!forget.isError && forget.text.includes('保留'), forget.text);
  assert.ok(![...bridge.store.keys()].some((k) => k.startsWith('gezhi.book.')), '登记应删除');
  assert.ok(fs.existsSync(filePath), '文件本身应保留');

  console.log('PASS: MCP 离线协议全流程 8 组断言全绿');
} finally {
  child.kill();
  await bridge.close();
  fs.rmSync(tmpOut, { recursive: true, force: true });
}
