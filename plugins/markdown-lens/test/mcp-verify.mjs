/**
 * Markdown 结构检查器 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实体检语义全离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], {
  cwd: APP_ROOT,
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

function text(res) {
  return String(res.result?.content?.[0]?.text || '');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

const BAD_DOC = [
  '# 概览',
  '',
  '### 跳级标题',
  '',
  '坏锚点 [x](#不存在)',
  '![](pic.png)',
  '[空]()',
  '裸链接 https://example.com/a 在句中',
  'TODO: 还有事没做',
  '',
  '# 概览',
].join('\n');

const CLEAN_DOC = [
  '# 项目',
  '',
  '## 安装',
  '',
  '```bash',
  'npm i',
  '```',
  '',
  '见 [配置](#配置)。',
  '',
  '## 配置',
].join('\n');

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'markdown-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('mdlen_lint') && names.includes('mdlen_outline'));

  // lint：多规则检出
  const lint = await rpc('tools/call', { name: 'mdlen_lint', arguments: { text: BAD_DOC } });
  check('lint isError=false', lint.result?.isError === false, text(lint).slice(0, 150));
  check('统计行', text(lint).includes('错误') && text(lint).includes('警告'));
  check('跳级检出', text(lint).includes('heading_increment'));
  check('锚点断链检出', text(lint).includes('anchor_broken') && text(lint).includes('#不存在'));
  check('图片无 alt 检出', text(lint).includes('img_no_alt'));
  check('空链接检出', text(lint).includes('empty_link'));
  check('裸 URL 检出', text(lint).includes('bare_url'));
  check('TODO 检出', text(lint).includes('todo_marker'));
  check('重复标题检出', text(lint).includes('duplicate_heading'));

  // clean 文档零误报
  const clean = await rpc('tools/call', { name: 'mdlen_lint', arguments: { text: CLEAN_DOC } });
  check('clean 文档 ✅', text(clean).includes('✅'), text(clean).slice(0, 150));

  // outline
  const outline = await rpc('tools/call', { name: 'mdlen_outline', arguments: { text: BAD_DOC } });
  check('outline isError=false', outline.result?.isError === false);
  check('outline 层级缩进', text(outline).includes('  h3') && text(outline).includes('h1'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'mdlen_lint', arguments: {} });
  check('缺 text isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
