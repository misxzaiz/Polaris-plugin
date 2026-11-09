/**
 * 交互组件插件服务端测试（node:test，零依赖）
 * 行为等价金标：prd_preview_mcp_server.rs 的既有用例 + v2 扩展（form/caps 契约）
 * harness：直接 exec server 进程，stdin 喂 JSON-RPC 行（execFile input 管道，
 * 避免命令行长度限制——2MB 超限用例必须走管道）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

/** spawn 包装：stdin 管道喂请求，收集 stdout 首个 id 响应（execFile+input 在
 * Windows 有 EOF 怪癖，spawn 直写 stdin 实测稳定） */
function execNode(serverArgs, input, timeoutMs = 15000) {
  return new Promise((res, rej) => {
    const p = spawn('node', serverArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let errOut = '';
    const timer = setTimeout(() => {
      p.kill();
      rej(new Error(`server 超时（${timeoutMs}ms）`));
    }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (errOut += d));
    p.on('error', (e) => { clearTimeout(timer); rej(e); });
    p.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) rej(new Error(`server 退出 ${code}: ${errOut.slice(0, 300)}`));
    });
    p.stdin.write(input + String.fromCharCode(10));
    p.stdin.end();
    const give = () => {
      clearTimeout(timer);
      res({ stdout: out });
    };
    const poll = setInterval(() => {
      if (out.includes('"id":1')) { clearInterval(poll); give(); }
    }, 30);
    setTimeout(() => { clearInterval(poll); if (out.includes('"id":1')) give(); }, timeoutMs - 200);
  });
}
const SERVER = resolve(new URL('../mcp/server.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** 起一个 server 进程跑一轮 tools/call（execFile input 管道喂请求） */
async function callTool(args, name, toolArgs) {
  const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: toolArgs } });
  const { stdout } = await execNode([SERVER, args[0], args[1] || ''], req);
  const line = stdout.split('\n').find((l) => l.includes('"id":1'));
  return JSON.parse(line).result;
}

test('tools/list 暴露 4 工具（金标：exposes_expected_tools）', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ic-config-'));
  const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const { stdout } = await execNode([SERVER, configDir], req);
  const line = stdout.split('\n').find((l) => l.includes('"id":1'));
  const tools = JSON.parse(line).result.tools;
  assert.equal(tools.length, 4);
  assert.equal(tools[0].name, 'render_component');
  assert.equal(tools[1].name, 'preview_html');
  assert.equal(tools[2].name, 'read_preview');
  assert.equal(tools[3].name, 'list_previews');
});

test('创建预览：落盘/版本递增/metadata（金标：stores_preview_metadata_and_increments_requirement_versions）', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ic-config-'));
  const workspace = mkdtempSync(join(tmpdir(), 'ic-ws-'));
  const args = [configDir, workspace];

  const first = await callTool(args, 'preview_html', {
    title: 'Checkout Flow',
    html: '<!doctype html><html><body>v1</body></html>',
    requirementId: 'REQ-100',
    description: 'Initial prototype',
  });
  const a1 = first.structuredContent;
  assert.equal(a1.version, 1);
  assert.equal(a1.versionLabel, 'v1');
  assert.equal(a1.requirementId, 'REQ-100');
  assert.equal(a1.artifactType, 'polaris.preview');
  const previewsRoot = join(workspace, '.polaris', 'previews');
  assert.equal(readdirSync(previewsRoot).length, 1);
  const id1 = a1.previewId;
  assert.ok(existsSync(join(previewsRoot, id1, 'metadata.json')));

  const read = await callTool(args, 'read_preview', { previewId: id1 });
  assert.equal(read.structuredContent.title, 'Checkout Flow');
  assert.equal(read.structuredContent.version, 1);

  const second = await callTool(args, 'preview_html', {
    title: 'Checkout Flow',
    html: '<!doctype html><html><body>v2</body></html>',
    requirementId: 'REQ-100',
  });
  assert.equal(second.structuredContent.version, 2);
  assert.equal(second.structuredContent.versionLabel, 'v2');

  const listed = await callTool(args, 'list_previews', { limit: 10 });
  assert.equal(listed.structuredContent.previews.length, 2);
});

test('render_component：form 契约与 caps 进 marker', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ic-config-'));
  const workspace = mkdtempSync(join(tmpdir(), 'ic-ws-'));
  const args = [configDir, workspace];
  const r = await callTool(args, 'render_component', {
    title: '审批面板',
    html: '<html><body><button>ok</button></body></html>',
    form: { formId: 'f-1', read: 'none', secretKeys: ['apiKey'] },
    caps: ['cap.kv'],
  });
  const a = r.structuredContent;
  assert.equal(a.form.formId, 'f-1');
  assert.equal(a.form.read, 'none');
  assert.deepEqual(a.form.secretKeys, ['apiKey']);
  assert.deepEqual(a.caps, ['cap.kv']);
  const e = await callTool(args, 'render_component', { html: '<p/>', form: { formId: 'f-2', read: 'all' } });
  assert.match(e.content[0].text, /form\.read/);
});

test('缺 html / 空 html / 超限 HTML 报错且不留脏目录（金标三条用例合并）', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ic-config-'));
  const workspace = mkdtempSync(join(tmpdir(), 'ic-ws-'));
  const args = [configDir, workspace];
  const e1 = await callTool(args, 'preview_html', { title: 'No HTML' });
  assert.match(e1.content[0].text, /缺少字符串参数: html/);
  assert.match(e1.content[0].text, /重新调用/);
  const e2 = await callTool(args, 'preview_html', { html: '   ' });
  assert.match(e2.content[0].text, /参数 html 为空/);
  const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
  const e3 = await callTool(args, 'preview_html', { html: oversized });
  assert.match(e3.content[0].text, /HTML 过大/);
  const previewsRoot = join(workspace, '.polaris', 'previews');
  assert.equal(existsSync(previewsRoot), false, '超限失败不应留下脏目录');
});

test('list_previews：total 为真实总数，previews 受 limit 截断（回归：旧文案恒等于 limit）', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ic-config-'));
  const workspace = mkdtempSync(join(tmpdir(), 'ic-ws-'));
  const args = [configDir, workspace];
  for (let i = 0; i < 7; i++) {
    await callTool(args, 'preview_html', {
      title: `bulk-${i}`,
      html: `<!doctype html><html><body>${i}</body></html>`,
    });
  }
  const listed = await callTool(args, 'list_previews', { limit: 3 });
  assert.equal(listed.structuredContent.total, 7);
  assert.equal(listed.structuredContent.previews.length, 3);
  assert.match(listed.content[0].text, /共 7 个预览，返回最近 3 个/);

  const all = await callTool(args, 'list_previews', { limit: 50 });
  assert.equal(all.structuredContent.total, 7);
  assert.equal(all.structuredContent.previews.length, 7);
  assert.match(all.content[0].text, /共 7 个预览，返回最近 7 个/);
});
