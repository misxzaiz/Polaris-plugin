/**
 * LLM JSON 修复器 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实修复语义全离线验证。
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

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'json-repair');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: repair', names.includes('jsonrepair_repair'));

  // 快速通道
  const fast = await rpc('tools/call', { name: 'jsonrepair_repair', arguments: { text: '{"a": 1}' } });
  check('快速通道零修改', text(fast).includes('零修改'), text(fast).slice(0, 100));

  // 组合坏样本修复（含修复后 JSON 输出）
  const bad = await rpc('tools/call', { name: 'jsonrepair_repair', arguments: { text: "{'name': 'app', 'count': NaN, 'tags': ['a',],}" } });
  check('组合坏样本修复', bad.result?.isError === false && text(bad).includes('✅'), text(bad).slice(0, 200));
  check('修改点报告', text(bad).includes('修改点') && text(bad).includes('[pos'));
  check('修复后 JSON 合法可解析', (() => { const m = text(bad).match(/修复后 JSON：\n([\s\S]+)$/); if (!m) return false; try { JSON.parse(m[1]); return true; } catch (_) { return false; } })());

  // 不可修如实报错
  const prose = await rpc('tools/call', { name: 'jsonrepair_repair', arguments: { text: '这是完全没有任何 JSON 结构的散文段落' } });
  check('不可修如实 isError', prose.result?.isError === true && text(prose).includes('无法修复'), text(prose).slice(0, 150));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'jsonrepair_repair', arguments: {} });
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
