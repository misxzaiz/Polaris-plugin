/**
 * .env 漂移检查器 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地检测无宿主依赖——initialize/tools/list/未知工具/真实对比全可离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

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

// 样例（含真实格式陷阱）
const EXAMPLE = [
  'API_KEY=placeholder-key',
  'DB_URL=postgres://localhost/app',
  '# 数据库连接注释',
  'EXPORT_STYLE=should-be-parsed',
  'EMPTY_IN_EX=',
].join('\n');
const ACTUAL = [
  'API_KEY=sk-REAL-SECRET-VALUE-9876543210abcdef',
  'DB_URL=postgres://prod-server/app',
  'EXTRA_ONLY=1',
  'EMPTY_IN_EX=',
  'dup=1',
  'dup=2',
  'bad line no equals',
].join('\n');

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: protocolVersion', init.result?.protocolVersion === '2024-11-05');
  check('initialize: serverInfo.name', init.result?.serverInfo?.name === 'env-drift');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.length === 2 && names.includes('envdrift_compare') && names.includes('envdrift_parse'));

  // 内联对比：三类漂移 + 脱敏红线
  const cmp = await rpc('tools/call', { name: 'envdrift_compare', arguments: { example: EXAMPLE, actual: ACTUAL } });
  check('compare isError=false', cmp.result?.isError === false, text(cmp));
  check('compare 报缺失键', text(cmp).includes('API_KEY') && text(cmp).includes('缺失'), text(cmp).slice(0, 200));
  check('compare 报值差异（DB_URL）', text(cmp).includes('DB_URL') && text(cmp).includes('值差异'));
  check('compare 报多余键（EXTRA_ONLY）', text(cmp).includes('EXTRA_ONLY'));
  check('compare 报重复键（dup）', text(cmp).includes('dup'));
  check('compare 报格式错误行', text(cmp).includes('格式错误'));
  check('脱敏红线：报告不含 actual secret 原文', !text(cmp).includes('sk-REAL-SECRET-VALUE'), text(cmp).slice(0, 200));
  check('脱敏红线：报告含「已隐藏」标记', text(cmp).includes('已隐藏'));

  // 文件路径分支
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'envdrift-verify-'));
  const exPath = path.join(tmp, '.env.example');
  const acPath = path.join(tmp, '.env');
  fs.writeFileSync(exPath, EXAMPLE, 'utf8');
  fs.writeFileSync(acPath, ACTUAL, 'utf8');
  const byPath = await rpc('tools/call', { name: 'envdrift_compare', arguments: { examplePath: exPath, actualPath: acPath } });
  check('文件路径分支 isError=false', byPath.result?.isError === false, text(byPath));
  check('文件路径分支结果一致（缺失键）', text(byPath).includes('API_KEY'));

  // 不存在的路径报错
  const badPath = await rpc('tools/call', { name: 'envdrift_compare', arguments: { examplePath: path.join(tmp, 'nope'), actualPath: acPath } });
  check('不存在路径 isError', badPath.result?.isError === true && text(badPath).includes('不存在'));

  // parse 工具
  const parse = await rpc('tools/call', { name: 'envdrift_parse', arguments: { text: ACTUAL } });
  check('parse isError=false', parse.result?.isError === false, text(parse));
  check('parse 键清单', text(parse).includes('API_KEY') && text(parse).includes('键清单'));
  check('parse 重复键', text(parse).includes('dup'));
  check('parse 格式错误', text(parse).includes('格式错误'));

  // 缺参
  const noArgs = await rpc('tools/call', { name: 'envdrift_compare', arguments: {} });
  check('缺参 isError', noArgs.result?.isError === true);

  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);

  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
