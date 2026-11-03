/**
 * yaml-lens MCP 协议离线验证（node test/mcp-verify.mjs）
 * stdio JSON-RPC 握手 + 四工具真实调用全离线验证（不依赖宿主）。
 * 纪律：tools/call 参数平铺 { name, arguments }；通知 write-only 不等回包（cron-lens/exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
mcp.stderr.on('data', () => {}); // 日志走 stderr，测试不消费
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
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}
const text = (r) => r.result?.content?.[0]?.text || '';

const NORWAY = 'services:\n  web:\n    enabled: no\n    debug: on\n    replicas: 3\n';
const MULTI = 'a: 1\n---\nb: 2\n';

let failed = 0;
let harnessError = false;
try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: serverInfo.name=yaml-lens', init.result?.serverInfo?.name === 'yaml-lens');
  notify('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 恰好四工具', JSON.stringify(names) === JSON.stringify(['yaml_lens_parse', 'yaml_lens_lint', 'yaml_lens_to_json', 'yaml_lens_to_yaml']), `实际 ${names.join(',')}`);
  check('tools/list: schema required 齐全', (list.result?.tools || []).every((t) => (t.inputSchema.required || []).length >= 1));

  // parse
  const p1 = await rpc('tools/call', { name: 'yaml_lens_parse', arguments: { text: MULTI } });
  check('parse 多文档: 2 个文档', text(p1).includes('2 个文档'), text(p1).slice(0, 120));
  check('parse 多文档: 文档标题分节', text(p1).includes('文档 1') && text(p1).includes('文档 2'));
  check('parse: JSON 预览含数据', text(p1).includes('"b": 2'));

  const p2 = await rpc('tools/call', { name: 'yaml_lens_parse', arguments: { text: 'a: 1\na: 2\n' } });
  check('parse 重复键: isError', p2.result?.isError === true);
  check('parse 重复键: 行列与中文原因', text(p2).includes('第 2 行') && text(p2).includes('重复键'), text(p2).slice(0, 160));
  check('parse 重复键: 修复 hint', text(p2).includes('改键名') || text(p2).includes('删掉'));

  const p3 = await rpc('tools/call', { name: 'yaml_lens_parse', arguments: { text: 'defaults: &d\n  x: 1\nuse:\n  <<: *d\n' } });
  check('parse 锚点清单: &d', text(p3).includes('&d'));
  check('parse 合并键统计', text(p3).includes('合并键'));

  const pEmpty = await rpc('tools/call', { name: 'yaml_lens_parse', arguments: { text: '   \n' } });
  check('parse 空文本: 如实说明', pEmpty.result?.isError === false && text(pEmpty).includes('空文本'));

  // lint
  const l1 = await rpc('tools/call', { name: 'yaml_lens_lint', arguments: { text: NORWAY } });
  check('lint Norway: bool-lookalike', text(l1).includes('bool-lookalike'));
  check('lint Norway: 跨实现对照文案', text(l1).includes('PyYAML') && text(l1).includes('布尔'));
  check('lint Norway: 解析状态成功', text(l1).includes('解析状态：成功'));

  const l2 = await rpc('tools/call', { name: 'yaml_lens_lint', arguments: { text: 'id: 9007199254740993\nt: 12:34:56\nv: 1.10\n' } });
  check('lint 混合: 大整数/六十进制/尾零三条', text(l2).includes('big-int') && text(l2).includes('sexagesimal') && text(l2).includes('float-form'));

  const l3 = await rpc('tools/call', { name: 'yaml_lens_lint', arguments: { text: 'a: 1\na: 2\n' } });
  check('lint: 重复键 error + 解析失败并列', text(l3).includes('dup-key') && text(l3).includes('解析状态：**失败**'));

  const l4 = await rpc('tools/call', { name: 'yaml_lens_lint', arguments: { text: 'clean: true\nother: 1\n' } });
  check('lint 干净文本: 未发现坑', text(l4).includes('未发现已知坑模式'), text(l4).slice(0, 100));

  // to_json
  const j1 = await rpc('tools/call', { name: 'yaml_lens_to_json', arguments: { text: 'name: 中文值\nport: 8080\n' } });
  check('to_json: 单文档对象', text(j1).trim().startsWith('{') && text(j1).includes('"port": 8080'));
  check('to_json: 中文保真', text(j1).includes('中文值'));

  const j2 = await rpc('tools/call', { name: 'yaml_lens_to_json', arguments: { text: MULTI } });
  check('to_json: 多文档数组并说明', text(j2).trim().startsWith('[') && text(j2).includes('JSON 数组'));

  const j3 = await rpc('tools/call', { name: 'yaml_lens_to_json', arguments: { text: 'x:\n\ty: 1\n' } });
  check('to_json Tab 错误: isError 带行列', j3.result?.isError === true && text(j3).includes('第 2 行'));

  const j4 = await rpc('tools/call', { name: 'yaml_lens_to_json', arguments: { text: 'v: .inf\n' } });
  check('to_json: .inf 字符串化不变 null', text(j4).includes('".inf"'));

  // to_yaml
  const y1 = await rpc('tools/call', { name: 'yaml_lens_to_yaml', arguments: { text: '{"server":{"host":"0.0.0.0","port":8080,"名":"值"}}' } });
  check('to_yaml: 嵌套输出', text(y1).includes('server:') && text(y1).includes('port: 8080'));
  check('to_yaml: 中文保真', text(y1).includes('名: 值'));

  const y2 = await rpc('tools/call', { name: 'yaml_lens_to_yaml', arguments: { text: '{"b":1,"a":2}', sortKeys: true } });
  check('to_yaml: sortKeys 生效', text(y2).indexOf('a: 2') < text(y2).indexOf('b: 1'));

  const y3 = await rpc('tools/call', { name: 'yaml_lens_to_yaml', arguments: { text: JSON.stringify({ s: 'x'.repeat(300) }) } });
  check('to_yaml: 长行不折叠', text(y3).trim().split('\n').length === 1, `行数 ${text(y3).trim().split('\n').length}`);

  const y4 = await rpc('tools/call', { name: 'yaml_lens_to_yaml', arguments: { text: '{invalid json' } });
  check('to_yaml: 非法 JSON isError', y4.result?.isError === true && text(y4).includes('JSON'));

  // 边界
  const unk = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
  check('未知工具: isError 且列出可用', unk.result?.isError === true && text(unk).includes('yaml_lens_parse'));
  const badIndent = await rpc('tools/call', { name: 'yaml_lens_to_json', arguments: { text: 'a: 1', indent: 99 } });
  check('indent 越界: isError', badIndent.result?.isError === true);
  const badMethod = await rpc('no/such/method', {});
  check('未知 method: -32601', badMethod.error?.code === -32601);
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
