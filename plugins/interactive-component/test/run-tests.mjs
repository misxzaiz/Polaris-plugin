/**
 * 交互面板插件服务端测试（node:test，零依赖）
 * 行为金标：落盘 / 版本递增 / 三条错误路径 / list 真实总数 / 静态扫描闸 / 来源档位
 * harness：直接 exec server 进程，stdin 喂 JSON-RPC 行（spawn 管道，
 * 避免 execFile+input 在 Windows 的 EOF 怪癖与命令行长度限制）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

/** spawn 包装：stdin 管道喂请求，收集 stdout 首个 id 响应 */
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

async function callTool(args, name, toolArgs) {
  const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: toolArgs } });
  const { stdout } = await execNode([SERVER, args[0], args[1] || ''], req);
  const line = stdout.split('\n').find((l) => l.includes('"id":1'));
  return JSON.parse(line).result;
}

const previewsRoot = (workspace) => join(workspace, '.polaris', 'interactive');

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

test('创建交互面板：落盘/版本递增/metadata', async () => {
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
  assert.equal(a1.artifactType, 'polaris.interactive');
  assert.equal(readdirSync(previewsRoot(workspace)).length, 1);
  const id1 = a1.previewId;
  assert.ok(existsSync(join(previewsRoot(workspace), id1, 'metadata.json')));

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

test('render_component：来源档位与静态扫描闸', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'ic-config-'));
  const workspace = mkdtempSync(join(tmpdir(), 'ic-ws-'));
  const args = [configDir, workspace];

  const flash = await callTool(args, 'render_component', {
    title: '闪造应用',
    html: '<html><body><canvas></canvas></body></html>',
    source: 'flashforge',
  });
  assert.equal(flash.structuredContent.source, 'flashforge');

  const inline = await callTool(args, 'render_component', { html: '<p>hi</p>' });
  assert.equal(inline.structuredContent.source, 'inline');

  const blocked = await callTool(args, 'render_component', {
    html: '<script>fetch("/api/data")</script>',
  });
  assert.match(blocked.content[0].text, /静态扫描未通过/);
  assert.equal(
    existsSync(previewsRoot(workspace)) ? readdirSync(previewsRoot(workspace)).length : 0,
    2,
    '扫描失败不应新增落盘目录',
  );
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
  assert.equal(existsSync(previewsRoot(workspace)), false, '超限失败不应留下脏目录');
});

test('list_previews：total 为真实总数，previews 受 limit 截断', async () => {
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
  assert.match(listed.content[0].text, /共 7 个交互面板，返回最近 3 个/);

  const all = await callTool(args, 'list_previews', { limit: 50 });
  assert.equal(all.structuredContent.total, 7);
  assert.equal(all.structuredContent.previews.length, 7);
  assert.match(all.content[0].text, /共 7 个交互面板，返回最近 7 个/);
});

test('全屏覆盖层：源码单源实现、无旧全屏残留、对齐 z-overlay（静态闸）', async () => {
  const { readFileSync } = await import('node:fs');
  const srcDir = resolve(new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const overlay = readFileSync(join(srcDir, 'fullscreen.ts'), 'utf8');
  const card = readFileSync(join(srcDir, 'card.tsx'), 'utf8');
  const panel = readFileSync(join(srcDir, 'panel.tsx'), 'utf8');
  const manifest = readFileSync(join(srcDir, '..', 'plugin.json'), 'utf8');

  assert.ok(
    card.includes('openFullscreenOverlay') && panel.includes('openFullscreenOverlay'),
    '卡片与面板必须共用同一个全屏实现（不再各写一套）',
  );
  assert.ok(!card.includes('z-[9999]') && !panel.includes('z-[9999]'), '不应残留硬编码 z-[9999] 覆盖层');
  assert.ok(!card.includes('fixed inset-0') && !panel.includes('fixed inset-0'), '不应残留组件树内 fixed 覆盖层');
  assert.ok(overlay.includes('var(--z-overlay'), '覆盖层须对齐宿主 z-overlay 层级');
  assert.ok(overlay.includes('document.body'), '覆盖层须挂到 body（脱离 virtuoso transform）');
  assert.ok(overlay.includes('TOPBAR_OFFSET_PX = 40'), '覆盖层须保留宿主 40px 顶栏');
  assert.ok(overlay.includes('退出全屏'), '覆盖层须含常驻退出按钮');
  assert.ok(!manifest.includes('supportsFullscreen'), '宿主无消费者，manifest 不应再声明 supportsFullscreen');
});
