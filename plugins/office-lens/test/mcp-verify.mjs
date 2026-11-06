/**
 * office-lens MCP 协议真桥验证（node test/mcp-verify.mjs）
 *
 * 真实 spawn stdio MCP server：initialize → tools/list → tools/call 全链路，
 * 夹具落盘临时目录测 filePath 分支（MCP filePath 拼接漂移只有文件分支冒烟能抓）。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docxFixture, xlsxFixture, pptxFixture, oleFixture } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

// ── 夹具落盘 ─────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-lens-mcp-'));
const FIX = {
  docx: path.join(tmp, 'sample.docx'),
  xlsx: path.join(tmp, '数据表.xlsx'),
  pptx: path.join(tmp, 'deck.pptx'),
  ole: path.join(tmp, 'legacy.doc'),
  fileUrlDocx: '',
};
fs.writeFileSync(FIX.docx, docxFixture());
fs.writeFileSync(FIX.xlsx, xlsxFixture());
fs.writeFileSync(FIX.pptx, pptxFixture());
fs.writeFileSync(FIX.ole, oleFixture());
FIX.fileUrlDocx = 'file:///' + FIX.docx.replace(/\\/g, '/');

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
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
mcp.stderr.on('data', () => { /* server 日志走 stderr，不参与断言 */ });

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); }, 15000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

let passCount = 0;
let failCount = 0;
function check(name, cond, extra) {
  if (cond) { passCount += 1; console.log(`  ✓ ${name}`); }
  else { failCount += 1; console.error(`  ✗ ${name}${extra ? ' —— ' + extra : ''}`); }
}
function textOfResult(res) {
  return res && res.result && res.result.content && res.result.content[0] && res.result.content[0].text || '';
}

async function main() {
  // initialize
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize 返回 serverInfo', init.result && init.result.serverInfo && init.result.serverInfo.name === 'office-lens');
  notify('notifications/initialized', {});

  // tools/list
  const list = await rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  check('tools/list 恰两工具', names.length === 2 && names.includes('olens_extract') && names.includes('olens_outline'), JSON.stringify(names));

  // olens_extract docx
  const ex1 = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: FIX.docx } });
  const t1 = textOfResult(ex1);
  check('extract docx isError=false', ex1.result && ex1.result.isError === false);
  check('extract docx 前言含格式与字数', t1.includes('[office-lens] DOCX') && /约 \d+ 字/.test(t1));
  check('extract docx 标题/列表/表格都在', t1.includes('# 项目概述') && t1.includes('1. 第一项') && t1.includes('| 名称 | 数量 | 备注 |'));
  check('extract docx 警告透出（TOC/图片）', t1.includes('[注意]') && t1.includes('TOC'));

  // file:// URL 形式
  const exUrl = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: FIX.fileUrlDocx } });
  check('extract file:// URL 规整后可读', exUrl.result && exUrl.result.isError === false && textOfResult(exUrl).includes('# 项目概述'), textOfResult(exUrl).slice(0, 120));

  // olens_extract xlsx sheet
  const ex2 = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: FIX.xlsx, sheet: '配置' } });
  check('extract xlsx 指定 sheet', ex2.result && textOfResult(ex2).includes('北上广深'));
  const ex2b = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: FIX.xlsx, sheet: '不存在' } });
  check('extract xlsx 越界 sheet 报错列出可选项', ex2b.result && ex2b.result.isError === true && textOfResult(ex2b).includes('销售数据'));
  const ex2c = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: FIX.xlsx, csv: true } });
  check('extract xlsx CSV 输出', ex2c.result && textOfResult(ex2c).includes('产品名称'));

  // olens_outline
  const ol1 = await rpc('tools/call', { name: 'olens_outline', arguments: { filePath: FIX.xlsx } });
  check('outline xlsx sheet 清单', textOfResult(ol1).includes('销售数据：4 行 × 27 列'));
  const ol2 = await rpc('tools/call', { name: 'olens_outline', arguments: { filePath: FIX.pptx } });
  check('outline pptx 标题列表', textOfResult(ol2).includes('## 1. 季度汇报') && textOfResult(ol2).includes('## 2. （无标题）'));
  const ol3 = await rpc('tools/call', { name: 'olens_outline', arguments: { filePath: FIX.docx } });
  check('outline docx 标题树', textOfResult(ol3).includes('# 项目概述') && textOfResult(ol3).includes('### 直接大纲三级'));

  // 错误路径
  const er1 = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: FIX.ole } });
  check('旧版 OLE 拒绝并指引另存', er1.result && er1.result.isError === true && textOfResult(er1).includes('另存为 docx'));
  const er2 = await rpc('tools/call', { name: 'olens_extract', arguments: { filePath: path.join(tmp, '不存在.docx') } });
  check('文件不存在明确报错', er2.result && er2.result.isError === true && textOfResult(er2).includes('不存在'));
  const er3 = await rpc('tools/call', { name: 'olens_nothing', arguments: {} });
  check('未知工具 -32602', er3.error && er3.error.code === -32602);
  const er4 = await rpc('tools/call', { name: 'olens_extract', arguments: {} });
  check('缺 filePath 明确报错', er4.result && er4.result.isError === true && textOfResult(er4).includes('filePath 必填'));

  console.log(`\nMCP 真桥验证：${passCount} 通过 / ${failCount} 失败`);
  mcp.stdin.end();
  setTimeout(() => process.exit(failCount ? 1 : 0), 150);
}

main().catch((e) => { console.error('验证脚本异常:', e); mcp.kill(); process.exit(1); });
