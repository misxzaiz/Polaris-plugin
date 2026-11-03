/**
 * unicode-lens MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地检测无宿主依赖——initialize/tools/list/四工具真实调用/缺参/未知工具全可离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 * fixture 全部用 \uXXXX / String.fromCodePoint 构造，源码保持 ASCII 安全。
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

const CP = (n) => String.fromCodePoint(n);

// 攻击夹具：零宽 + 双向控制 + Tag 隐形标签（解码出隐藏指令 IGNORE）+ 同形字 + NBSP
const ATTACK = `pay\u200Bpal${CP(0x202E)}admin${CP(0xE0049)}${CP(0xE0047)}${CP(0xE004E)}${CP(0xE004F)}${CP(0xE0052)}${CP(0xE0045)}${CP(0x0440)}aypal\u00A0end`;
const CLEAN = '你好世界，普通文本 Hello World 123';

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: protocolVersion', init.result?.protocolVersion === '2024-11-05');
  check('initialize: serverInfo.name', init.result?.serverInfo?.name === 'unicode-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 四工具', names.length === 4
    && names.includes('ulens_scan') && names.includes('ulens_scrub')
    && names.includes('ulens_char_info') && names.includes('ulens_confusables'), JSON.stringify(names));

  // scan：攻击夹具（内联）
  const scan = await rpc('tools/call', { name: 'ulens_scan', arguments: { text: ATTACK } });
  check('scan isError=false', scan.result?.isError === false, text(scan).slice(0, 200));
  check('scan 判定高危', text(scan).includes('高危'), text(scan).slice(0, 120));
  check('scan 报双向控制', text(scan).includes('双向控制字符'));
  check('scan 报 Tag 隐形标签 + 解码隐藏指令', text(scan).includes('Tag 隐形标签') && text(scan).includes('隐藏内容解码: "IGNORE"'), text(scan).slice(0, 300));
  check('scan 报零宽', text(scan).includes('零宽字符'));
  check('scan 报同形字', text(scan).includes('同形异码字'));
  check('scan 报 NBSP', text(scan).includes('不换行空格'));
  check('scan 报建议与处置', text(scan).includes('建议'));
  check('scan 中文报告无 undefined/NaN', !text(scan).includes('undefined') && !text(scan).includes('NaN'));

  // scan：干净文本
  const cleanScan = await rpc('tools/call', { name: 'ulens_scan', arguments: { text: CLEAN } });
  check('scan 干净文本判定 ✅', text(cleanScan).includes('✅ 干净'), text(cleanScan).slice(0, 120));

  // scan：文件路径分支
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unicodelens-verify-'));
  const atkPath = path.join(tmp, 'suspicious.txt');
  fs.writeFileSync(atkPath, ATTACK, 'utf8');
  const byPath = await rpc('tools/call', { name: 'ulens_scan', arguments: { filePath: atkPath } });
  check('scan 文件路径分支 isError=false', byPath.result?.isError === false, text(byPath).slice(0, 200));
  check('scan 文件路径分支检出同形字', text(byPath).includes('同形异码字'));

  // scan：缺参 / 不存在路径
  const noArgs = await rpc('tools/call', { name: 'ulens_scan', arguments: {} });
  check('scan 缺参 isError', noArgs.result?.isError === true && text(noArgs).includes('缺少'));
  const badPath = await rpc('tools/call', { name: 'ulens_scan', arguments: { filePath: path.join(tmp, 'nope.txt') } });
  check('scan 不存在路径 isError', badPath.result?.isError === true && text(badPath).includes('不存在'));

  // scrub：默认策略（删隐形、NBSP→空格、emoji ZWJ 保留、同形字仅报告）
  const family = `👨${CP(0x200D)}👩${CP(0x200D)}👧`;
  const scrubIn = `${ATTACK}\nemoji:${family}`;
  const scrub = await rpc('tools/call', { name: 'ulens_scrub', arguments: { text: scrubIn } });
  check('scrub isError=false', scrub.result?.isError === false, text(scrub).slice(0, 200));
  check('scrub 报删除统计（零宽）', text(scrub).includes('零宽字符×1'));
  check('scrub 报删除统计（Tag）', text(scrub).includes('Tag 隐形标签×6'));
  check('scrub 报替换统计（NBSP）', text(scrub).includes('异常空白字符×1'));
  const cleanedEcho = text(scrub);
  check('scrub 清洗结果不含零宽', !cleanedEcho.includes('\u200B'));
  check('scrub 清洗结果不含双向控制', !cleanedEcho.includes(CP(0x202E)));
  check('scrub 清洗结果不含 Tag 字符', !cleanedEcho.includes(CP(0xE0049)));
  check('scrub emoji ZWJ 保留（emoji 序列不被破坏）', cleanedEcho.includes(family));
  check('scrub 同形字默认仅报告（р 保留）', cleanedEcho.includes(CP(0x0440)));

  // scrub：fixHomoglyph 映射回 ASCII
  const scrubFix = await rpc('tools/call', { name: 'ulens_scrub', arguments: { text: ATTACK, fixHomoglyph: true } });
  check('scrub fixHomoglyph 同形字映射', text(scrubFix).includes('同形字映射回 ASCII：1 处'), text(scrubFix).slice(0, 200));

  // scrub：outPath 落盘 + overwrite 护栏
  const outPath = path.join(tmp, 'cleaned.txt');
  const scrubOut = await rpc('tools/call', { name: 'ulens_scrub', arguments: { text: ATTACK, outPath } });
  check('scrub outPath isError=false', scrubOut.result?.isError === false, text(scrubOut).slice(0, 200));
  check('scrub outPath 报写出', text(scrubOut).includes('清洗结果已写出'));
  const written = fs.readFileSync(outPath, 'utf8');
  check('outPath 文件内容已清洗（无零宽/双向/Tag）', !written.includes('\u200B') && !written.includes(CP(0x202E)) && !written.includes(CP(0xE0049)));
  const scrubClash = await rpc('tools/call', { name: 'ulens_scrub', arguments: { text: ATTACK, outPath } });
  check('outPath 已存在不覆盖 → isError', scrubClash.result?.isError === true && text(scrubClash).includes('已存在'));
  const scrubOw = await rpc('tools/call', { name: 'ulens_scrub', arguments: { text: ATTACK, outPath, overwrite: true } });
  check('outPath overwrite=true 覆盖成功', scrubOw.result?.isError === false, text(scrubOw).slice(0, 200));

  // char_info
  const info = await rpc('tools/call', { name: 'ulens_char_info', arguments: { chars: `a\u200B${CP(0x0440)}` } });
  check('char_info isError=false', info.result?.isError === false, text(info).slice(0, 200));
  check('char_info 含 U+200B 零宽解释', text(info).includes('U+200B') && text(info).includes('零宽'));
  check('char_info 同形字给建议映射', text(info).includes('建议替换为 "p"'));
  const infoNoArg = await rpc('tools/call', { name: 'ulens_char_info', arguments: {} });
  check('char_info 缺参 isError', infoNoArg.result?.isError === true && text(infoNoArg).includes('缺少 chars'));

  // confusables 专项
  const conf = await rpc('tools/call', { name: 'ulens_confusables', arguments: { text: `p${CP(0x0430)}ypal vs paypal\nuser${CP(0x043C)}ame` } });
  check('confusables isError=false', conf.result?.isError === false, text(conf).slice(0, 200));
  check('confusables 检出同形混淆', text(conf).includes('同形混淆风险'));
  check('confusables 报建议替换', text(conf).includes('建议替换为'));
  const confClean = await rpc('tools/call', { name: 'ulens_confusables', arguments: { text: 'plainusername123' } });
  check('confusables 干净文本 ✅', text(confClean).includes('✅ 未检出同形混淆'));

  // 未知工具
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
