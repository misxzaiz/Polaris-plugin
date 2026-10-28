/**
 * 启幕 MCP 协议离线验证（node test/mcp-verify.mjs）
 * 无需 Polaris 运行：initialize / tools/list 形状、参数校验在触桥前拦截
 * （graceful isError）、deck 校验错误文本可指导 AI 修正、进程不崩。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Windows 文件锁韧性删除：unlink 可能因瞬时句柄进入 pending-delete，重试至消失 */
async function rmWait(p, tries = 6) {
  const fs = (await import('node:fs')).default;
  for (let i = 0; i < tries; i++) {
    try { fs.rmSync(p, { force: true }); } catch (_) { /* 忽略，靠存在性判断 */ }
    if (!fs.existsSync(p)) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return !fs.existsSync(p);
}

const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js', ''], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
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
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const textOf = (m) => String(m.result?.content?.[0]?.text ?? '');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${String(extra).slice(0, 300)}` : ''}`); }
}

const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
check('initialize serverInfo=qimu', init.result?.serverInfo?.name === 'qimu');

mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc('tools/list', {});
const names = (list.result?.tools || []).map((t) => t.name);
check('tools/list 5 工具', ['ppt_guide', 'ppt_build', 'ppt_reveal', 'ppt_recent', 'ppt_forget'].every((n) => names.includes(n)) && names.length === 5, names.join(','));

// ppt_guide 离线可用（无桥依赖）
const guide = await rpc('tools/call', { name: 'ppt_guide', arguments: {} });
check('ppt_guide 离线可读', guide.result?.isError === false && textOf(guide).includes('deck spec') && textOf(guide).includes('ppt_build'), textOf(guide).slice(0, 80));

// ppt_build：deck 校验在触桥前拦截（先 normalizeDeck 后才碰 kv/文件系统）
const badDeck = await rpc('tools/call', {
  name: 'ppt_build',
  arguments: { deck: { title: 'x', slides: [{ type: 'bullets', title: 't', bullets: Array.from({ length: 9 }, (_, i) => `点${i}`) }] } },
});
check('ppt_build 容量护栏 → isError + 拆页建议', badDeck.result?.isError === true && textOf(badDeck).includes('拆'), textOf(badDeck));

const noTitle = await rpc('tools/call', { name: 'ppt_build', arguments: { deck: { slides: [{ type: 'section', title: 's' }] } } });
check('ppt_build 缺 title → isError', noTitle.result?.isError === true && textOf(noTitle).includes('title'), textOf(noTitle));

// ppt_build 合法 deck：无宿主时 graceful；有宿主时真落盘——两种环境都不残留：
// 标题带 __verify 标记，若真生成则删除产物文件与登记（环境无关自清理）。
{
  // 有宿主时：把导出目录临时指到本插件 test/tmp（避免落桌面+文件锁问题）
  try {
    const os = await import('node:os');
    const fsMod = await import('node:fs');
    const fsx = fsMod.default;
    const anchorPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Polaris', 'anchor.json');
    if (fsx.existsSync(anchorPath)) {
      fsx.mkdirSync(path.join(APP_ROOT, 'test', 'tmp'), { recursive: true });
      const anchor = JSON.parse(fsx.readFileSync(anchorPath, 'utf8'));
      const cfg = JSON.parse(fsx.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
      const { default: http } = await import('node:http');
      const crypto = await import('node:crypto');
      const dispatch = (payload) => new Promise((resolve) => {
        const data = JSON.stringify({ req: { target: 'cap.kv', payload } });
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (cfg.web.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(String(cfg.web.token)).digest('hex')}`;
        const req = http.request({ hostname: '127.0.0.1', port: cfg.web.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 8000 }, (res) => {
          let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
      });
      const orig = (await dispatch({ action: 'get', key: 'qimu.settings' }))?.result?.value ?? null;
      await dispatch({ action: 'set', key: 'qimu.settings', value: { ...(orig && typeof orig === 'object' ? orig : {}), schemaVersion: 1, exportDir: path.join(APP_ROOT, 'test', 'tmp') } });
      process.__qimuOrigSettings = orig;
    }
  } catch (_) { /* 无宿主静默 */ }
}
const goodDeck = await rpc('tools/call', {
  name: 'ppt_build',
  arguments: { deck: { title: '__verify启幕协议验证__', slides: [{ type: 'bullets', title: '要点', bullets: ['一条'] }] } },
});
check('ppt_build 合法 spec → graceful（不崩/不悬挂）', goodDeck.result !== undefined, textOf(goodDeck).slice(0, 120));
{
  const t = textOf(goodDeck);
  const filePath = (t.match(/([A-Za-z]:\\[^\s]+\.pptx)/) || [])[1];
  const id = (t.match(/id=([a-z0-9]+)/) || [])[1];
  if (filePath) {
    const fs = await import('node:fs');
    const existedOnDisk = fs.existsSync(filePath);
    if (fs.existsSync(filePath)) {
      const gone = await rmWait(filePath, 15);
      if (gone) console.log('  (已清理验证产物:', filePath + ')');
      else console.log('  (提示：产物文件被系统句柄临时占用，稍后自动可删——不影响验收，登记已清理)', filePath);
    }
    if (id) {
      // 有宿主时删除登记（自发现同 smoke-real；无宿主/无 anchor 时静默跳过）
      try {
        const os = await import('node:os');
        const anchorPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Polaris', 'anchor.json');
        if (fs.existsSync(anchorPath)) {
          const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
          const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
          const { default: http } = await import('node:http');
          const crypto = await import('node:crypto');
          await new Promise((resolve) => {
            const data = JSON.stringify({ req: { target: 'cap.kv', payload: { action: 'delete', key: `qimu.deck.${id}` } } });
            const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
            if (cfg.web.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(String(cfg.web.token)).digest('hex')}`;
            const req = http.request({ hostname: '127.0.0.1', port: cfg.web.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 8000 }, (res) => {
              res.resume(); // 必须消费响应体，否则连接不释放、close 不触发
              res.on('end', resolve);
            });
            req.on('error', () => resolve());
            req.on('timeout', () => { req.destroy(); resolve(); });
            req.write(data);
            req.end();
          });
        }
      } catch (_) { /* 无宿主环境静默 */ }
    }
    check('验证产物已真实落盘', existedOnDisk || fs.existsSync(filePath));
  }
}

{
  // 恢复原 settings（若之前有宿主改写过）
  try {
    const orig = process.__qimuOrigSettings;
    if (orig !== undefined) {
      const os = await import('node:os');
      const fsx = (await import('node:fs')).default;
      const anchorPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Polaris', 'anchor.json');
      const anchor = JSON.parse(fsx.readFileSync(anchorPath, 'utf8'));
      const cfg = JSON.parse(fsx.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
      const { default: http } = await import('node:http');
      const crypto = await import('node:crypto');
      await new Promise((resolve) => {
        const data = JSON.stringify({ req: { target: 'cap.kv', payload: { action: 'set', key: 'qimu.settings', value: orig } } });
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (cfg.web.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(String(cfg.web.token)).digest('hex')}`;
        const req = http.request({ hostname: '127.0.0.1', port: cfg.web.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: 8000 }, (res) => { res.resume(); res.on('end', resolve); });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.write(data);
        req.end();
      });
      console.log('  (已恢复原导出目录设置)');
      try { fsx.rmSync(path.join(APP_ROOT, 'test', 'tmp'), { recursive: true, force: true }); } catch (_) {}
    }
  } catch (_) { /* 静默 */ }
}

const forgetNo = await rpc('tools/call', { name: 'ppt_forget', arguments: { id: 'd1' } });
check('ppt_forget 无 confirm → isError', forgetNo.result?.isError === true);

const unknown = await rpc('tools/call', { name: 'nope', arguments: {} });
check('未知工具 → isError', unknown.result?.isError === true);

const unknownMethod = await rpc('resources/list', {});
check('未知方法 → -32601', unknownMethod.error?.code === -32601);

mcp.kill();
await new Promise((r) => setTimeout(r, 100));
if (failed) { console.error(`\n✗ ${failed} 项失败\nstderr:\n${stderr.join('')}`); process.exit(1); }
console.log('\n✓ MCP 协议离线验证全绿');
