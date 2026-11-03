/**
 * encoding-lens MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地检测无宿主依赖——initialize/tools/list/四工具真实调用/缺参/未知工具全可离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 * notifications/initialized 是通知，write-only 不进 pending 表（cron-lens 实证坑）。
 * text 与 filePath 双入口全用真实参数名各跑一支（unicode-lens 实证：schema 字段名
 * 漂移只有文件分支冒烟能抓）。
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

function rpc(method, params, timeoutMs = 15000) {
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

const ZH = '中文测试，数据文件';
const GBK_HEX = [...core_.encodeText(ZH, 'gbk').bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
import * as core_ from '../shared/encoding-core.js';

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: protocolVersion', init.result?.protocolVersion === '2024-11-05');
  check('initialize: serverInfo.name', init.result?.serverInfo?.name === 'encoding-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 四工具', names.length === 4
    && names.includes('elens_detect') && names.includes('elens_fix')
    && names.includes('elens_fingerprint') && names.includes('elens_convert'), JSON.stringify(names));

  // ---- detect：hex 入口（GBK 字节应判 gbk 而非 utf-8）----
  const det = await rpc('tools/call', { name: 'elens_detect', arguments: { hex: GBK_HEX } });
  check('detect hex isError=false', det.result?.isError === false, text(det).slice(0, 200));
  check('detect 判定 GBK', text(det).includes('GBK'), text(det).slice(0, 150));
  check('detect 报告含候选排序', text(det).includes('候选排序'));
  check('detect 中文报告无 undefined/NaN', !text(det).includes('undefined') && !text(det).includes('NaN'));

  // ---- detect：文件入口（真实参数名 filePath）----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'encodinglens-verify-'));
  const gbkPath = path.join(tmp, 'gbk-file.txt');
  fs.writeFileSync(gbkPath, core_.encodeText(ZH, 'gbk').bytes);
  const detByPath = await rpc('tools/call', { name: 'elens_detect', arguments: { filePath: gbkPath } });
  check('detect filePath 分支 isError=false', detByPath.result?.isError === false, text(detByPath).slice(0, 200));
  check('detect filePath 分支判 GBK', text(detByPath).includes('GBK'));

  // ---- detect：缺参 / 非法 hex ----
  const noArgs = await rpc('tools/call', { name: 'elens_detect', arguments: {} });
  check('detect 缺参 isError', noArgs.result?.isError === true && text(noArgs).includes('缺少'));
  const badHex = await rpc('tools/call', { name: 'elens_detect', arguments: { hex: 'xyz' } });
  check('detect 非法 hex isError', badHex.result?.isError === true && text(badHex).includes('hex'));

  // ---- fix：文本入口（latin1 误读样本）----
  const garbled = new TextDecoder('latin1').decode(core_.U8(ZH));
  const fix = await rpc('tools/call', { name: 'elens_fix', arguments: { text: garbled } });
  check('fix isError=false', fix.result?.isError === false, text(fix).slice(0, 200));
  check('fix 修复成功', text(fix).includes('修复成功'), text(fix).slice(0, 150));
  check('fix 结果还原原文', text(fix).includes(ZH));
  check('fix 报告终验信息', text(fix).includes('终验') && text(fix).includes('round-trip'));

  // ---- fix：文件入口（双重损坏 UTF-8 文件 → inspect 全链路）----
  const twicePath = path.join(tmp, 'twice.txt');
  fs.writeFileSync(twicePath, Buffer.from(garbled, 'utf8'), 'utf8');
  const fixByPath = await rpc('tools/call', { name: 'elens_fix', arguments: { filePath: twicePath } });
  check('fix filePath 分支 isError=false', fixByPath.result?.isError === false, text(fixByPath).slice(0, 200));
  check('fix filePath 分支含编码识别段', text(fixByPath).includes('编码识别报告'));
  check('fix filePath 分支还原原文', text(fixByPath).includes(ZH));

  // ---- fix：outPath 落盘 + 覆盖守护 ----
  const outPath = path.join(tmp, 'fixed.txt');
  const fixOut = await rpc('tools/call', { name: 'elens_fix', arguments: { text: garbled, outPath } });
  check('fix outPath 写出', text(fixOut).includes('已写出') && fs.readFileSync(outPath, 'utf8') === ZH);
  const fixNoOverwrite = await rpc('tools/call', { name: 'elens_fix', arguments: { text: garbled, outPath } });
  check('fix outPath 已存在拒绝', fixNoOverwrite.result?.isError === true && text(fixNoOverwrite).includes('overwrite'));
  const fixOverwrite = await rpc('tools/call', { name: 'elens_fix', arguments: { text: garbled, outPath, overwrite: true } });
  check('fix overwrite=true 放行', fixOverwrite.result?.isError === false);

  // ---- fix：不可逆损坏如实拒绝 ----
  const damaged = await rpc('tools/call', { name: 'elens_fix', arguments: { text: '数据被锟斤拷破坏了' } });
  check('fix 锟斤拷报 unrepairable', text(damaged).includes('未能自动修复'), text(damaged).slice(0, 150));

  // ---- fingerprint：锟斤拷/烫烫烫/干净文本 ----
  const fp1 = await rpc('tools/call', { name: 'elens_fingerprint', arguments: { text: '内存输出烫烫烫烫' } });
  check('fingerprint 命中烫烫烫', text(fp1).includes('烫烫烫') && text(fp1).includes('未初始化内存'), text(fp1).slice(0, 150));
  const fp2 = await rpc('tools/call', { name: 'elens_fingerprint', arguments: { text: '你好世界，普通文本 Hello World 123' } });
  check('fingerprint 干净文本 ✅', text(fp2).includes('✅'), text(fp2).slice(0, 150));
  const fpByPath = await rpc('tools/call', { name: 'elens_fingerprint', arguments: { filePath: twicePath } });
  check('fingerprint filePath 分支（真实参数名）', fpByPath.result?.isError === false && text(fpByPath).includes('乱码指纹报告'));

  // ---- convert：textToBytes（unsupported 如实）----
  const cv1 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'textToBytes', text: '中文测试', charset: 'gbk' } });
  check('convert textToBytes isError=false', cv1.result?.isError === false, text(cv1).slice(0, 200));
  check('convert hex 输出', text(cv1).includes('d6 d0') || text(cv1).includes('hex'));
  const cv2 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'textToBytes', text: '中文', charset: 'latin1' } });
  check('convert latin1 超域如实列出', cv2.result?.isError === false && text(cv2).includes('中') && text(cv2).includes('无 latin1 编码'), text(cv2).slice(0, 200));

  // ---- convert：bytesToText（GBK hex → 原文）----
  const cv3 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'bytesToText', hex: GBK_HEX, charset: 'gbk' } });
  check('convert bytesToText 还原中文', cv3.result?.isError === false && text(cv3).includes(ZH), text(cv3).slice(0, 200));
  const cv4 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'bytesToText', hex: GBK_HEX, charset: 'utf-8' } });
  check('convert strict 失败如实报错', cv4.result?.isError === true && text(cv4).includes('严格解码失败'), text(cv4).slice(0, 150));

  // ---- convert：缺参 / 非法编码 / 非法 mode ----
  const cv5 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'textToBytes', charset: 'gbk' } });
  check('convert 缺 text isError', cv5.result?.isError === true && text(cv5).includes('text'));
  const cv6 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'textToBytes', text: 'x', charset: 'nonexistent' } });
  check('convert 非法编码 isError', cv6.result?.isError === true && text(cv6).includes('不支持的编码'));
  const cv7 = await rpc('tools/call', { name: 'elens_convert', arguments: { mode: 'bogus', text: 'x', charset: 'gbk' } });
  check('convert 非法 mode isError', cv7.result?.isError === true && text(cv7).includes('mode'));

  // ---- 未知工具 ----
  const unknown = await rpc('tools/call', { name: 'elens_nope', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true && text(unknown).includes('未知工具'));
} catch (e) {
  results.push({ name: 'harness 异常', pass: false });
  console.error('harness 异常:', e);
} finally {
  mcp.kill();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nmcp-verify: ${passed}/${results.length} 通过`);
if (stderr.length) console.error('[stderr tail]', stderr.join('').slice(-500));
process.exitCode = passed === results.length ? 0 : 1;
