/**
 * imgforge MCP 全流程验证（node test/mcp-verify.mjs）
 * spawn 真实 stdio server（fixture 目录当 appConfigDir，桥不可达=降级路径）：
 *   initialize → tools/list（4 工具）→ info/scan/process 真实文件操作 → 产物断言 →
 *   错误路径（不存在/相对路径/非图片/缺输入）isError 中文提示 → 永不覆盖（二次处理 -2）→
 *   imgforge_jobs 桥离线降级容忍。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = require('sharp');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'imgforge-mcp-'));
const FIX = path.join(TMP, 'fix');
fs.mkdirSync(FIX, { recursive: true });

async function makePhoto(name, { w = 900, h = 600 } = {}) {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 6151) & 0xff;
  const bytes = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  fs.writeFileSync(path.join(FIX, name), bytes);
  return path.join(FIX, name);
}
async function makePng(name, { w = 700, h = 500 } = {}) {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 6151) & 0xff;
  const bytes = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  fs.writeFileSync(path.join(FIX, name), bytes);
  return path.join(FIX, name);
}

const a = await makePhoto('照片A.jpg');
const b = await makePng('截图B.png');
const notImg = path.join(FIX, '假图片.jpg');
fs.writeFileSync(notImg, Buffer.from('this is definitely not an image'));

// ── stdio 驱动 ───────────────────────────────────────────────────────────────

const child = spawn('node', [path.join(APP_ROOT, 'mcp', 'server.js'), TMP], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', () => { /* stderr 仅日志，不参与断言 */ });

let buf = '';
const pending = [];
child.stdout.on('data', (c) => {
  buf += c.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const resolve = pending.shift();
    if (resolve) resolve(JSON.parse(line));
  }
});

let nextId = 1;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.push((msg) => (msg.error ? reject(new Error('RPC error: ' + JSON.stringify(msg.error))) : resolve(msg)));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => reject(new Error('RPC 超时: ' + method)), 120000);
  });
}

async function callTool(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  return {
    isError: !!(res.result && res.result.isError),
    text: (res.result && res.result.content && res.result.content[0] && res.result.content[0].text) || '',
  };
}

let passed = 0;
let failed = 0;
const fails = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✔ ' + name);
  } catch (e) {
    failed++;
    fails.push(name + ': ' + (e && e.message));
    console.log('  ✖ ' + name + ' — ' + (e && e.message));
  }
}

// ── 用例 ────────────────────────────────────────────────────────────────────

await check('initialize 握手', async () => {
  const res = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  assert.equal(res.result.serverInfo.name, 'imgforge');
});

await check('notifications/initialized 不炸', async () => {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  await new Promise((r) => setTimeout(r, 100));
});

await check('tools/list：恰好 4 个工具且 schema 完整', async () => {
  const res = await rpc('tools/list', {});
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['imgforge_scan', 'imgforge_info', 'imgforge_process', 'imgforge_jobs']);
  for (const t of res.result.tools) {
    assert.ok(t.description.length > 20, t.name + ' 描述太短');
    assert.equal(t.inputSchema.type, 'object');
  }
});

await check('imgforge_info：单图元信息', async () => {
  const r = await callTool('imgforge_info', { path: a });
  assert.equal(r.isError, false);
  assert.ok(r.text.includes('900×600'), r.text);
  assert.ok(r.text.includes('GPS 定位：无'), r.text);
});

await check('imgforge_info：不存在 → isError 中文', async () => {
  const r = await callTool('imgforge_info', { path: path.join(FIX, '不存在.jpg') });
  assert.equal(r.isError, true);
  assert.ok(r.text.includes('不存在'), r.text);
});

await check('imgforge_info：相对路径拒绝', async () => {
  const r = await callTool('imgforge_info', { path: 'pics/a.jpg' });
  assert.equal(r.isError, true);
  assert.ok(r.text.includes('绝对路径'), r.text);
});

await check('imgforge_scan：目录概览（数量/格式/GPS/假图片被预筛）', async () => {
  const r = await callTool('imgforge_scan', { dir: FIX });
  assert.equal(r.isError, false);
  assert.ok(r.text.includes('2 张'), '假扩展名文件应被魔数预筛掉：' + r.text);
  assert.ok(r.text.includes('jpeg×1'), r.text);
  assert.ok(r.text.includes('GPS 定位：0 张'), r.text);
});

await check('imgforge_scan：不存在的目录 → isError', async () => {
  const r = await callTool('imgforge_scan', { dir: path.join(TMP, 'nope') });
  assert.equal(r.isError, true);
  assert.ok(r.text.includes('不存在'), r.text);
});

await check('imgforge_process：目录模式批量转 WebP + 预筛 + 落点正确', async () => {
  const r = await callTool('imgforge_process', { dir: FIX, format: 'webp', quality: 80 });
  assert.equal(r.isError, false, r.text);
  assert.ok(r.text.includes('处理完成：2/2'), r.text);
  assert.ok(r.text.includes('跳过 1 张'), '假图片应出现在跳过注记：' + r.text);
  assert.ok(/输出目录：/.test(r.text), r.text);
  const outDir = /输出目录：(.+)/.exec(r.text)[1].trim();
  assert.ok(outDir.endsWith('imgforge-out'), '输出应落 <输入目录>/imgforge-out，实得 ' + outDir);
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.webp'));
  assert.equal(files.length, 2, '两个输出 webp，实得 ' + files.join(','));
  const shot = files.find((f) => f.startsWith('截图B'));
  assert.ok(shot, '中文名保留');
  const meta = await sharp(path.join(outDir, shot)).metadata();
  assert.equal(meta.format, 'webp');
});

await check('imgforge_process：二次执行永不覆盖（-2 命名）', async () => {
  const r = await callTool('imgforge_process', { paths: [a], format: 'webp', quality: 80 });
  assert.equal(r.isError, false, r.text);
  assert.ok(/照片A-2\.webp/.test(r.text), '重名应 -2：' + r.text);
});

await check('imgforge_process：目标体积 30KB 达标', async () => {
  const r = await callTool('imgforge_process', { paths: [b], format: 'jpeg', targetKB: 30, outputDir: FIX });
  assert.equal(r.isError, false, r.text);
  const m = /截图B[^（]*（[\d.]+ [KM]B → ([\d.]+ [KM]B)/.exec(r.text);
  const outBytes = /→ ([\d.]+) (KB|MB)/.exec(r.text);
  assert.ok(outBytes, r.text);
  const val = parseFloat(outBytes[1]) * (outBytes[2] === 'MB' ? 1024 : 1);
  assert.ok(val <= 30, `输出 ${outBytes[1]}${outBytes[2]} 应 ≤30KB`);
});

await check('imgforge_process：非图片 → 预筛拦截 isError 中文', async () => {
  const r = await callTool('imgforge_process', { paths: [notImg], format: 'webp' });
  assert.equal(r.isError, true);
  assert.ok(r.text.includes('全部输入路径无效') && r.text.includes('内容不是'), r.text);
});

await check('imgforge_process：全部路径无效 → 首条原因', async () => {
  const r = await callTool('imgforge_process', { paths: [path.join(FIX, 'no1.jpg'), 'rel/path.jpg'] });
  assert.equal(r.isError, true);
  assert.ok(r.text.includes('全部输入路径无效'), r.text);
});

await check('imgforge_process：缺输入 → 明确提示', async () => {
  const r = await callTool('imgforge_process', { format: 'webp' });
  assert.equal(r.isError, true);
  assert.ok(r.text.includes('缺少输入'), r.text);
});

await check('imgforge_jobs：桥离线降级容忍（不炸）', async () => {
  const r = await callTool('imgforge_jobs', {});
  assert.equal(r.isError, false);
  assert.ok(r.text.length > 0, '降级也有可读输出');
});

await check('未知工具 → isError', async () => {
  const r = await callTool('imgforge_nothing', {});
  assert.equal(r.isError, true);
});

// ── 汇总 ────────────────────────────────────────────────────────────────────

child.kill();
console.log(`\nmcp-verify: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
