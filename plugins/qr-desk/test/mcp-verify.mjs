/**
 * mcp-verify.mjs —— qr-desk MCP 真桥验证（spawn 独立进程，stdio JSON-RPC 全链路）
 * 断言：initialize / tools/list=5 / generate 落盘 / decode round-trip / inspect 结构化 /
 *       batch CSV 出码 / selftest 12/12。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, '../mcp/server.js');

const child = spawn('node', [serverJs], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
child.stderr.on('data', (c) => process.stderr.write(`[mcp-stderr] ${c}`));

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); } }, 60000);
  });
}

async function call(name, args) {
  const msg = await rpc('tools/call', { name, arguments: args });
  const r = msg.result || {};
  const text = r.content?.[0]?.text || '';
  return { isError: !!r.isError, text };
}

const tmp = mkdtempSync(path.join(tmpdir(), 'qr-desk-mcp-'));
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

try {
  // initialize + tools/list
  const init = (await rpc('initialize', {})).result;
  assert.equal(init.serverInfo.name, 'qr-desk');
  const list = (await rpc('tools/list', {})).result;
  check('tools/list 五工具', list.tools.length === 5 && ['qr_generate', 'qr_decode', 'qr_inspect', 'qr_batch', 'qr_selftest'].every((n) => list.tools.some((t) => t.name === n)),
    list.tools.map((t) => t.name).join(','));

  // qr_generate：模板落盘
  const outDir = path.join(tmp, 'out');
  const gen = await call('qr_generate', {
    template: { type: 'wifi', fields: { ssid: 'MCP;Net', password: 'p:1"2', encryption: 'WPA' } },
    outDir, fileName: 'mcp-wifi',
  });
  check('qr_generate 落盘', !gen.isError && existsSync(path.join(outDir, 'mcp-wifi.png')), gen.text);
  check('qr_generate 终端预览存在', !gen.isError && gen.text.includes('终端预览'), gen.text);

  // qr_decode：round-trip（转义 SSID 逐字还原）
  const dec = await call('qr_decode', { imagePath: path.join(outDir, 'mcp-wifi.png') });
  check('qr_decode round-trip', !dec.isError && dec.text.includes('MCP;Net') && dec.text.includes('p:1"2'), dec.text);
  check('qr_decode 类型识别 wifi', !dec.isError && dec.text.includes('类型: wifi'), dec.text);

  // qr_inspect：otpauth 当前码
  const insp = await call('qr_inspect', { text: 'otpauth://totp/GitHub:alice?secret=JBSWY3DPEHPK3PXP&issuer=GitHub' });
  check('qr_inspect otpauth 当前码', !insp.isError && /\d{6}/.test(insp.text) && insp.text.includes('GitHub'), insp.text);

  // qr_batch：CSV → 多文件
  const batchDir = path.join(tmp, 'batch');
  const csv = ['name,tel', '"张,三",+8613800000000', '李四,+8613911112222'].join('\n');
  const batch = await call('qr_batch', {
    csv,
    template: { type: 'vcard', fields: { name: '{name}', tel: '{tel}' } },
    outDir: batchDir, fileBase: 'vc', nameCol: 'name',
  });
  const batchFiles = existsSync(batchDir) ? readdirCount(batchDir) : 0;
  check('qr_batch 出码 2 张', !batch.isError && batchFiles === 2, `${batch.text} files=${batchFiles}`);

  // qr_selftest
  const st = await call('qr_selftest', {});
  check('qr_selftest 12/12', !st.isError && /12\/12 通过/.test(st.text), st.text);

  // 错误路径：generate 未知模板
  const bad = await call('qr_generate', { template: { type: 'nope', fields: {} } });
  check('qr_generate 未知模板 → isError', bad.isError && bad.text.includes('未知模板'), bad.text);

  // 错误路径：decode 不存在文件
  const missing = await call('qr_decode', { imagePath: path.join(tmp, 'no-such.png') });
  check('qr_decode 缺文件 → isError', missing.isError, missing.text);
} catch (e) {
  failures++;
  console.error('✗ 异常:', e);
} finally {
  child.kill();
  rmSync(tmp, { recursive: true, force: true });
}

function readdirCount(dir) { return readdirSync(dir).length; }

console.log(failures === 0 ? 'mcp-verify 全部通过' : `mcp-verify 失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
