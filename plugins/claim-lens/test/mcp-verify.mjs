/**
 * mcp-verify.mjs —— claim-lens MCP 真桥验证（spawn 独立进程，stdio JSON-RPC 全链路）
 * 断言：initialize / tools/list=4 / claim_extract / claim_verify（fixture 仓真核验）/
 *       claim_verify_batch / claim_selftest 全过。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, '../mcp/server.js');
const { buildFixture } = require('../server/selftest.js');

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

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

async function call(name, args) {
  const msg = await rpc('tools/call', { name, arguments: args });
  const r = msg.result || {};
  const text = r.content?.[0]?.text || '';
  return { isError: !!r.isError, text };
}

const fixtureRoot = buildFixture(require('node:os').tmpdir());
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize 返回 serverInfo=claim-lens', init.result?.serverInfo?.name === 'claim-lens');
  notify('notifications/initialized', {}); // 通知无回包（cron-lens 坑），fire-and-forget
  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list = 4', names.length === 4 && ['claim_extract', 'claim_verify', 'claim_verify_batch', 'claim_selftest'].every((n) => names.includes(n)), JSON.stringify(names));

  // claim_extract
  const ex = await call('claim_extract', { text: '已完成：`src/auth.ts` 新增 `parseSession()`，依赖 `zod`，需要 Node >= 18' });
  check('claim_extract: 提取到 file+symbol+package+version', !ex.isError
    && ex.text.includes('src/auth.ts') && ex.text.includes('parseSession')
    && ex.text.includes('zod') && /node/i.test(ex.text), ex.text.slice(0, 200));

  // claim_verify（fixture 真核验）
  const v = await call('claim_verify', {
    text: '已完成：`src/index.ts` 已有 `parseConfig()`；`express` 在依赖里；跑 `git switch --orphan` 可行；config 里 `server.port` 是 8080（见 `config/app.config.json`）',
    root: fixtureRoot,
  });
  check('claim_verify: parseConfig 证实', !v.isError && /✓ 已证实.*parseConfig/s.test(v.text), v.text.slice(0, 300));
  check('claim_verify: express 证实', /✓ 已证实.*express/s.test(v.text));
  check('claim_verify: server.port 证实 8080', /8080/.test(v.text));
  check('claim_verify: 报告含四态汇总行', /共 \d+ 条声明/.test(v.text));

  // claim_verify_batch（证伪路径）
  const vb = await call('claim_verify_batch', {
    root: fixtureRoot,
    claims: [
      { type: 'file', target: 'src/nope.ts' },
      { type: 'symbol', target: 'ghostFn', file: 'src/index.ts' },
      { type: 'package', target: 'left-pad' },
      { type: 'cli', target: 'git', subcmd: ['switch'], flags: ['--fake-flag-xyz'] },
      { type: 'cli', target: 'powershell', flags: ['--help'] },
    ],
  });
  check('verify_batch: 缺文件证伪', !vb.isError && vb.text.includes('src/nope.ts') && /✗ 已证伪/.test(vb.text), vb.text.slice(0, 200));
  check('verify_batch: 幽灵符号证伪', /ghostFn/.test(vb.text));
  check('verify_batch: 幽灵依赖证伪', /left-pad/.test(vb.text));
  check('verify_batch: 伪造 flag 证伪', /--fake-flag-xyz/.test(vb.text));
  check('verify_batch: 白名单外 unverifiable 不误杀', /无法核验/.test(vb.text) && !/powershell.*✗/.test(vb.text));

  // claim_selftest
  const sf = await call('claim_selftest', {});
  check('claim_selftest: 全部通过', !sf.isError && / 0 未|通过\n/.test(sf.text) && !/✗/.test(sf.text), sf.text.slice(0, 300));
} catch (e) {
  failures++;
  console.error('✗ 异常:', e);
} finally {
  child.kill();
  try { require('node:fs').rmSync(fixtureRoot, { recursive: true, force: true }); } catch (_) { /* 清理失败忽略 */ }
}

console.log(failures === 0 ? '\nMCP 全链路通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
