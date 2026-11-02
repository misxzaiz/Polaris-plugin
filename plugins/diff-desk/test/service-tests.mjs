#!/usr/bin/env node
/**
 * service-tests.mjs —— 服务集成测试：真实子进程（HTTP REST + MCP stdio 全链路）。
 * 零外网：diff_urls 只测围栏拒绝路径（公网请求留给真桥冒烟）。
 * 跑法：node test/service-tests.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 9897;

// 看门狗：任一环节挂起时强制退出（防 CI/本地悬挂）
setTimeout(() => {
  console.log('\nWATCHDOG: 集成测试超时（180s），强制退出');
  process.exit(2);
}, 180000);

let pass = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      failures.push({ name, msg: e.message });
      console.log(`  ✗ ${name}\n    ${e.message}`);
    });
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label || 'eq'}：期望 ${b}，实际 ${a}`);
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败');
}

/* ---------- HTTP 小客户端 ---------- */
function req(method, path, bodyObj, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const data = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (_) {
            resolve({ status: res.statusCode, raw: body.slice(0, 200) });
          }
        });
      },
    );
    r.on('timeout', () => r.destroy(new Error('测试请求超时')));
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitHealth(timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const r = await req('GET', '/__health', undefined, 1500);
        if (r.status === 200 && r.json && r.json.ok) return resolve(r.json);
      } catch (_) { /* 未起 */ }
      if (Date.now() - started > timeoutMs) return reject(new Error('服务健康检查超时'));
      setTimeout(poll, 300);
    };
    poll();
  });
}

/* ---------- MCP stdio 小客户端 ---------- */
class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buf = '';
    this.waiters = [];
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      this.buf += chunk;
      let idx;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        const w = this.waiters.shift();
        if (w) w.resolve(JSON.parse(line));
      }
    });
  }
  send(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }
  next(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MCP 响应超时')), timeoutMs);
      this.waiters.push({
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
      });
    });
  }
  async call(name, args) {
    this.send({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method: 'tools/call', params: { name, arguments: args || {} } });
    const r = await this.next();
    return r.result;
  }
}

/* ---------- 夹具 ---------- */
const tmp = mkdtempSync(join(tmpdir(), 'diff-desk-test-'));
const dirA = join(tmp, 'dirA');
const dirB = join(tmp, 'dirB');
mkdirSync(join(dirA, 'node_modules'), { recursive: true });
mkdirSync(join(dirB, 'node_modules'), { recursive: true });
mkdirSync(join(dirA, 'sub'), { recursive: true });
mkdirSync(join(dirB, 'sub'), { recursive: true });
writeFileSync(join(dirA, 'same.txt'), 'same-content\nline2\n');
writeFileSync(join(dirB, 'same.txt'), 'same-content\nline2\n'); // 同内容不同 mtime 也应判同（哈希）
writeFileSync(join(dirA, 'diff.txt'), 'old-value\n');
writeFileSync(join(dirB, 'diff.txt'), 'new-value\n');
writeFileSync(join(dirA, 'onlyA.txt'), 'a\n');
writeFileSync(join(dirB, 'onlyB.txt'), 'b\n');
writeFileSync(join(dirB, 'node_modules', 'pkg.js'), 'x\n');
writeFileSync(join(dirA, 'sub', 'deep.txt'), 'same-deep\n');
writeFileSync(join(dirB, 'sub', 'deep.txt'), 'same-deep\n');
const fileA = join(tmp, 'a.txt');
const fileB = join(tmp, 'b.txt');
writeFileSync(fileA, 'alpha\nbeta\ngamma\n');
writeFileSync(fileB, 'alpha\nBETA\ngamma\ndelta\n');
const gbkA = join(tmp, 'gbk.txt');
const utfB = join(tmp, 'utf.txt');
writeFileSync(gbkA, Buffer.from([0xba, 0xba, 0xd7, 0xd6])); // 「汉字」GBK
writeFileSync(utfB, Buffer.from([0xe6, 0xb1, 0x89, 0xe5, 0xad, 0x97])); // 「汉字」UTF-8

/* ---------- 起 service + MCP ---------- */
const svc = spawn(process.execPath, [join(root, 'service', 'main.js'), String(PORT), tmp], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: '1' }, // 死端口 → 桥快速失败 → 历史走内存态
  stdio: ['ignore', 'pipe', 'pipe'],
});
svc.stderr.on('data', () => { /* 静默 */ });
const mcp = spawn(process.execPath, [join(root, 'mcp', 'server.js'), tmp], {
  env: { ...process.env, DIFFDESK_PORT: String(PORT), POLARIS_HOST: '127.0.0.1', POLARIS_PORT: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
mcp.stderr.on('data', () => { /* 静默 */ });
const mcpClient = new McpClient(mcp);

const contentKeysAllowed = new Set(['id', 'ts', 'kind', 'label', 'stats']);

async function main() {
  await waitHealth();

  await test('status：版本与运行信息', async () => {
    const r = await req('GET', '/api/status');
    ok(r.json.ok && r.json.result.version === '0.1.0', JSON.stringify(r.json));
  });

  await test('diff_text 文本模式：统计/hunks/patch', async () => {
    const r = await req('POST', '/api/diff_text', { a: 'alpha\nbeta\ngamma\n', b: 'alpha\nBETA\ngamma\ndelta\n', mode: 'text' });
    ok(r.json.ok, r.json.error || '');
    const res = r.json.result;
    eq(res.kind, 'text', 'kind');
    eq([res.stats.modifies, res.stats.additions], [1, 1], '统计');
    ok(res.hunks.length >= 1 && res.hunks[0].lines.length >= 2, 'hunks');
    ok(typeof res.patch === 'string' && res.patch.includes('-beta') && res.patch.includes('+BETA'), 'patch');
  });

  await test('diff_text auto 模式：JSON 输入走语义对比', async () => {
    const r = await req('POST', '/api/diff_text', { a: '{"a":1,"b":2}', b: '{"b":2,"a":1}' });
    ok(r.json.ok, r.json.error || '');
    eq(r.json.result.kind, 'json', 'auto → json');
    eq(r.json.result.changes.length, 0, '键序无关零差异');
  });

  await test('diff_text json 模式：解析错误带行列', async () => {
    const r = await req('POST', '/api/diff_text', { a: '{"a":1}', b: '{\n  "b": ]\n}', mode: 'json' });
    ok(!r.json.ok && r.json.error.includes('B 侧') && r.json.error.includes('第 2 行'), JSON.stringify(r.json));
  });

  await test('diff_text json 模式：忽略路径生效', async () => {
    const r = await req('POST', '/api/diff_text', {
      a: '{"meta":{"ts":1,"v":1}}', b: '{"meta":{"ts":9,"v":1}}', mode: 'json',
      opts: { ignorePaths: ['$.meta.ts'] },
    });
    ok(r.json.ok && r.json.result.changes.length === 0, JSON.stringify(r.json));
  });

  await test('diff_text：粘贴超限护栏', async () => {
    const big = 'x'.repeat(6 * 1024 * 1024);
    const r = await req('POST', '/api/diff_text', { a: big, b: 'y' });
    ok(!r.json.ok && r.json.error.includes('上限'), JSON.stringify(r.json).slice(0, 120));
  });

  await test('diff_text：请求体非法 JSON 报错', async () => {
    const r = await new Promise((resolve, reject) => {
      const raw = '{not-json';
      const q = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/diff_text', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(body) }));
      });
      q.on('error', reject);
      q.write(raw);
      q.end();
    });
    ok(!r.json.ok && r.json.error.includes('JSON'), JSON.stringify(r.json));
  });

  await test('diff_files：内容差异 + 元信息', async () => {
    const r = await req('POST', '/api/diff_files', { aPath: fileA, bPath: fileB });
    ok(r.json.ok, r.json.error || '');
    const res = r.json.result;
    eq([res.stats.modifies, res.stats.additions], [1, 1], '统计');
    eq(res.aMeta.charset, 'utf-8', 'A charset');
    ok(res.aMeta.path === fileA, 'A 路径');
  });

  await test('diff_files：GBK 回退与 UTF-8 判等', async () => {
    const r = await req('POST', '/api/diff_files', { aPath: gbkA, bPath: utfB });
    ok(r.json.ok, r.json.error || '');
    eq(r.json.result.stats.additions + r.json.result.stats.deletions + r.json.result.stats.modifies, 0, '内容应判等');
    eq(r.json.result.aMeta.charset, 'gbk', 'A 侧识别 GBK');
  });

  await test('diff_files：不存在的文件报错', async () => {
    const r = await req('POST', '/api/diff_files', { aPath: join(tmp, 'nope.txt'), bPath: fileB });
    ok(!r.json.ok && r.json.error.includes('不可读'), JSON.stringify(r.json));
  });

  await test('diff_dirs：same/changed/only + 默认跳过 node_modules', async () => {
    const r = await req('POST', '/api/diff_dirs', { aPath: dirA, bPath: dirB });
    ok(r.json.ok, r.json.error || '');
    const res = r.json.result;
    eq(res.same, 2, 'same.txt + sub/deep.txt（哈希判同，mtime 不同）');
    eq(res.changed.total, 1, 'changed');
    eq(res.changed.items[0], 'diff.txt', 'changed 路径');
    ok(res.onlyLeft.items.includes('onlyA.txt'), 'A 独有');
    ok(res.onlyRight.items.includes('onlyB.txt'), 'B 独有');
    ok(!res.onlyRight.items.some((p) => p.includes('node_modules')), '默认跳过 node_modules');
  });

  await test('diff_dirs：includeNodeModules 打开后计入', async () => {
    const r = await req('POST', '/api/diff_dirs', { aPath: dirA, bPath: dirB, opts: { includeNodeModules: true } });
    ok(r.json.ok, r.json.error || '');
    ok(r.json.result.onlyRight.items.some((p) => p.includes('node_modules')), 'node_modules 计入');
  });

  await test('diff_urls：围栏拒绝私网（零外网）', async () => {
    const r = await req('POST', '/api/diff_urls', { aUrl: 'http://192.0.2.1/', bUrl: 'https://example.com/' });
    ok(!r.json.ok && (r.json.error.includes('拒绝') || r.json.error.includes('私网')), JSON.stringify(r.json));
  });

  await test('settings：保存与回读 + 非法格式拒绝', async () => {
    const bad = await req('POST', '/api/settings', { proxy: 'no-port-here' });
    ok(!bad.json.ok && bad.json.error.includes('host:port'), JSON.stringify(bad.json));
    const save = await req('POST', '/api/settings', { proxy: '127.0.0.1:7897' });
    ok(save.json.ok && save.json.result.proxy === '127.0.0.1:7897', JSON.stringify(save.json));
    const read = await req('GET', '/api/settings');
    ok(read.json.ok && read.json.result.proxy === '127.0.0.1:7897', JSON.stringify(read.json));
    const clear = await req('POST', '/api/settings', { proxy: '' });
    ok(clear.json.ok && clear.json.result.proxy === '', JSON.stringify(clear.json));
  });

  await test('diff_urls：死代理快速失败（不挂起）', async () => {
    const save = await req('POST', '/api/settings', { proxy: '127.0.0.1:1' });
    ok(save.json.ok, save.json.error || '');
    const t0 = Date.now();
    const r = await req('POST', '/api/diff_urls', { aUrl: 'https://example.com/', bUrl: 'https://www.baidu.com/' });
    const took = Date.now() - t0;
    ok(!r.json.ok && r.json.error.includes('代理'), JSON.stringify(r.json).slice(0, 140));
    ok(took < 40000, `应快速失败而非挂起（实际 ${took}ms）`);
    await req('POST', '/api/settings', { proxy: '' });
  });

  await test('diff_urls：围栏拒绝非 http 协议', async () => {
    const r = await req('POST', '/api/diff_urls', { aUrl: 'file:///etc/passwd', bUrl: 'https://example.com/' });
    ok(!r.json.ok && r.json.error.includes('http'), JSON.stringify(r.json));
  });

  await test('history：仅元数据（无正文泄漏）', async () => {
    const r = await req('GET', '/api/history');
    ok(r.json.ok, r.json.error || '');
    const items = r.json.result.items;
    ok(items.length >= 5, `应有历史（${items.length}）`);
    for (const it of items) {
      for (const k of Object.keys(it)) {
        ok(contentKeysAllowed.has(k), `历史条目出现非元数据键：${k}`);
      }
      ok(!JSON.stringify(it).includes('alpha'), '正文泄漏检查');
    }
  });

  await test('history_clear：清空', async () => {
    const r = await req('POST', '/api/history_clear');
    ok(r.json.ok, r.json.error || '');
    const after = await req('GET', '/api/history');
    eq(after.json.result.items.length, 0, '清空后为 0');
  });

  await test('selftest：服务端试金石全绿', async () => {
    const r = await req('POST', '/api/selftest');
    ok(r.json.ok, r.json.error || '');
    ok(r.json.result.allGreen, JSON.stringify(r.json.result.items.filter((x) => !x.ok)));
  });

  await test('未知路由 404', async () => {
    const r = await req('GET', '/api/nope');
    eq(r.status, 404, 'status');
  });

  /* ---------- MCP stdio 全链路 ---------- */

  mcpClient.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });
  const init = await mcpClient.next();
  await test('MCP initialize：协议版本与服务名', async () => {
    eq(init.result.serverInfo.name, 'diff-desk', 'serverInfo');
    eq(init.result.protocolVersion, '2024-11-05', 'protocolVersion');
  });

  mcpClient.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = await mcpClient.next();
  await test('MCP tools/list：七工具齐备', async () => {
    const names = list.result.tools.map((t) => t.name);
    eq(names.length, 7, '数量');
    for (const n of ['df_diff_text', 'df_diff_files', 'df_diff_dirs', 'df_diff_urls', 'df_history', 'df_status', 'df_selftest']) {
      ok(names.includes(n), `缺工具 ${n}`);
    }
  });

  await test('MCP df_status', async () => {
    const r = await mcpClient.call('df_status');
    ok(!r.isError && r.content[0].text.includes('运行中'), r.content[0].text);
  });

  await test('MCP df_diff_text（JSON 语义）', async () => {
    const r = await mcpClient.call('df_diff_text', { a: '{"p":1}', b: '{"p":2}', mode: 'json' });
    ok(!r.isError, r.content[0].text);
    ok(r.content[0].text.includes('$.p') && r.content[0].text.includes('1') && r.content[0].text.includes('2'), r.content[0].text);
  });

  await test('MCP df_diff_text 超限引导用 df_diff_files', async () => {
    const r = await mcpClient.call('df_diff_text', { a: 'x'.repeat(101 * 1024), b: 'y' });
    ok(r.isError && r.content[0].text.includes('df_diff_files'), r.content[0].text.slice(0, 120));
  });

  await test('MCP df_diff_files', async () => {
    const r = await mcpClient.call('df_diff_files', { aPath: fileA, bPath: fileB });
    ok(!r.isError && r.content[0].text.includes('- beta') && r.content[0].text.includes('+ BETA'), r.content[0].text.slice(0, 200));
  });

  await test('MCP df_diff_dirs', async () => {
    const r = await mcpClient.call('df_diff_dirs', { aPath: dirA, bPath: dirB });
    ok(!r.isError && r.content[0].text.includes('diff.txt'), r.content[0].text.slice(0, 300));
  });

  await test('MCP df_diff_urls：围栏错误转 isError 文本', async () => {
    const r = await mcpClient.call('df_diff_urls', { aUrl: 'http://127.0.0.1/x', bUrl: 'https://example.com/' });
    ok(r.isError && r.content[0].text.includes('拒绝'), r.content[0].text);
  });

  await test('MCP df_history', async () => {
    const r = await mcpClient.call('df_history');
    ok(!r.isError && r.content[0].text.includes('[json]'), r.content[0].text.slice(0, 200));
  });

  await test('MCP df_selftest', async () => {
    const r = await mcpClient.call('df_selftest');
    ok(!r.isError && r.content[0].text.includes('全部通过'), r.content[0].text.slice(-200));
  });
}

main()
  .catch((e) => {
    failures.push({ name: '(主流程)', msg: e.message });
    console.log(`  ✗ (主流程)\n    ${e.message}`);
  })
  .finally(() => {
    try { svc.kill(); } catch (_) { /* ignore */ }
    try { mcp.kill(); } catch (_) { /* ignore */ }
    setTimeout(() => {
      try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
      console.log(`\n通过 ${pass} 项，失败 ${failures.length} 项`);
      process.exit(failures.length ? 1 : 0);
    }, 300);
  });
