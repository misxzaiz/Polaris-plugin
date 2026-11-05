/**
 * 文件魔数透视台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实识别语义全离线验证（临时文件夹具自造自清理）。
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

// 夹具：伪装扩展名样本（PNG 内容 .jpg）+ 真文本 + 高熵
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hexlens-verify-'));
const fakeJpg = path.join(tmp, 'photo.jpg');
fs.writeFileSync(fakeJpg, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
const textFile = path.join(tmp, 'notes.txt');
fs.writeFileSync(textFile, 'the quick brown fox\n'.repeat(20));
const highEntropy = path.join(tmp, 'blob.bin');
fs.writeFileSync(highEntropy, Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37 + 11) & 0xff)));

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'hex-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('hexlens_inspect') && names.includes('hexlens_dump'));

  // inspect：伪装扩展名
  const inspect = await rpc('tools/call', { name: 'hexlens_inspect', arguments: { path: fakeJpg } });
  check('inspect isError=false', inspect.result?.isError === false, text(inspect).slice(0, 150));
  check('PNG 魔数识别', text(inspect).includes('PNG 图像'));
  check('伪装扩展名警告', text(inspect).includes('伪装'));
  check('头部 dump 输出', text(inspect).includes('00000000') && text(inspect).includes('|·PNG'));

  // inspect：纯文本回退
  const txt = await rpc('tools/call', { name: 'hexlens_inspect', arguments: { path: textFile } });
  check('纯文本回退提示', text(txt).includes('纯文本') || text(txt).includes('无已知签名'), text(txt).slice(0, 150));

  // inspect：高熵
  const he = await rpc('tools/call', { name: 'hexlens_inspect', arguments: { path: highEntropy } });
  check('高熵标注', text(he).includes('高熵'), text(he).slice(0, 150));

  // dump：切片
  const dump = await rpc('tools/call', { name: 'hexlens_dump', arguments: { path: highEntropy, offset: 16, length: 32 } });
  check('dump isError=false', dump.result?.isError === false, text(dump).slice(0, 150));
  check('dump 偏移列从 16 起（00000010）', text(dump).includes('00000010'));

  // dump 超界报错 + 不存在文件
  const over = await rpc('tools/call', { name: 'hexlens_dump', arguments: { path: highEntropy, offset: 999999 } });
  check('dump 超界 isError', over.result?.isError === true);
  const missing = await rpc('tools/call', { name: 'hexlens_inspect', arguments: { path: path.join(tmp, 'nope.bin') } });
  check('不存在文件 isError', missing.result?.isError === true);

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'hexlens_inspect', arguments: {} });
  check('缺 path isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
