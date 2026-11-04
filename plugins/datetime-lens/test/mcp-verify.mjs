/**
 * datetime-lens MCP 协议离线验证（node test/mcp-verify.mjs）
 * 纯本地无宿主依赖——stdio JSON-RPC 握手 + 五工具真实调用全离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑：双重包裹会变成"未知工具：undefined"）。
 * notifications/initialized 是通知（无 id）服务端不回包——只写不等（cron-lens 实证坑）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
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
    } catch (_) { /* 忽略非 JSON 行 */ }
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
// 通知无 id、服务端不回包——只能写不能等
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

let failed = 0;
let harnessError = false;
const textOf = (r) => (r.result && r.result.content && r.result.content[0] && r.result.content[0].text) || '';

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: serverInfo.name=datetime-lens', init.result?.serverInfo?.name === 'datetime-lens');
  notify('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const tools = list.result?.tools || [];
  const names = tools.map((t) => t.name);
  check('tools/list: 恰好五工具', JSON.stringify(names) === JSON.stringify([
    'datetime_lens_parse', 'datetime_lens_convert', 'datetime_lens_wall_resolve', 'datetime_lens_arith', 'datetime_lens_format',
  ]), `实际 ${names.join(',')}`);
  check('tools/list: schema required 齐全', tools.every((t) => (t.inputSchema.required || []).length >= 1));

  // parse
  const p1 = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: '2026-11-04T08:00:00Z' } });
  check('parse ISO: 无错误', p1.result?.isError === false, String(p1.result?.isError));
  check('parse ISO: 权威瞬间与 epoch', textOf(p1).includes('2026-11-04T08:00:00Z') && textOf(p1).includes('epoch'));
  const p2 = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: '2026-11-04', zone: 'UTC' } });
  check('parse date-only: UTC 零点坑提示', textOf(p2).includes('UTC 零点'));
  const p3 = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: '1762212000123' } });
  check('parse unix 13 位: 单位判定毫秒', textOf(p3).includes('毫秒'));
  const p4 = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: '2026-03-08T02:30:00', zone: 'America/New_York' } });
  check('parse floating 纽约: DST 空洞坑', textOf(p4).includes('DST 空洞') && textOf(p4).includes('不存在'));
  const p5 = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: '2026-02-30' } });
  check('parse 2/30: isError 且给原因', p5.result?.isError === true && textOf(p5).includes('2 月没有 30 日'));
  const p6 = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: 'now', zone: 'Not/AZone' } });
  check('parse 非法时区: isError 且给原因', p6.result?.isError === true && textOf(p6).includes('未知时区'));

  // convert
  const c1 = await rpc('tools/call', { name: 'datetime_lens_convert', arguments: { text: '2026-11-04T00:00:00Z' } });
  check('convert 默认表: 6 行时区', (textOf(c1).match(/\| [A-Za-z]+\/|\| UTC /g) || []).length >= 6);
  check('convert: 上海行为 +08:00', /\| Asia\/Shanghai \|[^\n]*\+08:00 \|\s*否 \|/.test(textOf(c1)) || textOf(c1).includes('+08:00'));
  const c2 = await rpc('tools/call', { name: 'datetime_lens_convert', arguments: { text: '2026-06-15T12:00:00Z', zones: ['America/New_York', 'Australia/Lord_Howe', 'Asia/Kathmandu'] } });
  const c2t = textOf(c2);
  check('convert 定制表: 纽约夏令时标记', c2t.includes('America/New_York') && c2t.includes('☀️ 是'));
  check('convert 定制表: 半时区偏移正确', c2t.includes('+10:30') && c2t.includes('+05:45'));
  const c3 = await rpc('tools/call', { name: 'datetime_lens_convert', arguments: { text: 'now', zones: ['Bad/Zone'] } });
  check('convert 非法时区: isError', c3.result?.isError === true && textOf(c3).includes('未知时区'));

  // wall_resolve
  const w1 = await rpc('tools/call', { name: 'datetime_lens_wall_resolve', arguments: { date: '2026-03-08', time: '02:30', zone: 'America/New_York' } });
  check('wall_resolve 空洞: 判定不存在 + 跳过 60 分钟', textOf(w1).includes('不存在') && textOf(w1).includes('跳过 60 分钟'));
  check('wall_resolve 空洞: 切换瞬间 07:00Z', textOf(w1).includes('2026-03-08T07:00:00.000Z'));
  const w2 = await rpc('tools/call', { name: 'datetime_lens_wall_resolve', arguments: { date: '2026-11-01', time: '01:30', zone: 'America/New_York' } });
  check('wall_resolve 歧义: 两次出现', textOf(w2).includes('出现两次') && textOf(w2).includes('第一次') && textOf(w2).includes('第二次'));
  const w3 = await rpc('tools/call', { name: 'datetime_lens_wall_resolve', arguments: { date: '2026-11-04', zone: 'Asia/Shanghai' } });
  check('wall_resolve 缺 time 缺省 00:00:00: 唯一', textOf(w3).includes('唯一存在'));
  const w4 = await rpc('tools/call', { name: 'datetime_lens_wall_resolve', arguments: { date: '2026-02-30', zone: 'UTC' } });
  check('wall_resolve 2/30: isError', w4.result?.isError === true);
  const w5 = await rpc('tools/call', { name: 'datetime_lens_wall_resolve', arguments: { date: '2026-11-04', zone: 'Mars/Olympus' } });
  check('wall_resolve 非法时区: isError', w5.result?.isError === true);

  // arith
  const a1 = await rpc('tools/call', { name: 'datetime_lens_arith', arguments: { text: '2026-11-01T04:30:00Z', days: 1, zone: 'America/New_York' } });
  const a1t = textOf(a1);
  check('arith 回拨 +1d: 双口径都在', a1t.includes('日历口径') && a1t.includes('精确口径'));
  check('arith 回拨 +1d: 两口径差 60 分钟提示', a1t.includes('相差 +60 分钟'));
  const a2 = await rpc('tools/call', { name: 'datetime_lens_arith', arguments: { text: '2026-01-31T12:00:00Z', months: 1, zone: 'UTC' } });
  check('arith 1/31+1月: 月末钳制坑', textOf(a2).includes('月末钳制'));
  const a3 = await rpc('tools/call', { name: 'datetime_lens_arith', arguments: { text: '2026-01-31T12:00:00Z', months: 1, mode: 'exact' } });
  check('arith exact+months: isError 且解释', a3.result?.isError === true && textOf(a3).includes('exact 模式不支持'));
  const a4 = await rpc('tools/call', { name: 'datetime_lens_arith', arguments: { text: 'now' } });
  check('arith 全零算术量: isError', a4.result?.isError === true);
  const a5 = await rpc('tools/call', { name: 'datetime_lens_arith', arguments: { text: '2026-06-01T00:00:00Z', hours: 25, zone: 'Asia/Shanghai' } });
  check('arith 无 DST 区: 两口径一致', textOf(a5).includes('两口径一致'));

  // format
  const f1 = await rpc('tools/call', { name: 'datetime_lens_format', arguments: { text: '2026-11-04T00:00:00Z', zone: 'Asia/Shanghai' } });
  const f1t = textOf(f1);
  check('format: 五类格式齐出', f1t.includes('ISO 8601') && f1t.includes('RFC 2822') && f1t.includes('HTTP 日期') && f1t.includes('Unix 秒') && f1t.includes('ISO 周日期'));
  check('format: 上海偏移与 round-trip 自证', f1t.includes('2026-11-04T08:00:00+08:00') && f1t.includes('round-trip 自证：✅'));
  check('format: HTTP 恒 GMT（UTC 分量）', f1t.includes('Wed, 04 Nov 2026 00:00:00 GMT'));
  const f2 = await rpc('tools/call', { name: 'datetime_lens_format', arguments: { text: '2026-11-04T00:00:00Z', zone: 'Bad/Zone' } });
  check('format 非法时区: isError', f2.result?.isError === true);

  // 未知工具
  const unk = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
  check('未知工具: isError', unk.result?.isError === true);

  // 通知行噪声（非 JSON 行）不致死
  mcp.stdin.write('this is not json\n');
  const pAfterNoise = await rpc('tools/call', { name: 'datetime_lens_parse', arguments: { text: '2026-11-04T08:00:00Z' } });
  check('非 JSON 行忽略后仍可调用', pAfterNoise.result?.isError === false);
} catch (e) {
  harnessError = true;
  console.error('harness 异常:', e);
  failed++;
}

if (!harnessError) {
  failed = results.filter((r) => !r.pass).length;
}
console.log(`\n共 ${results.length} 项断言：${results.length - failed} 通过 / ${failed} 失败`);
mcp.kill();
process.exit(failed > 0 || harnessError ? 1 : 0);
