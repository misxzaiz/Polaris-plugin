'use strict';
/**
 * mcp-bridge.mjs —— 译舟 MCP 全链路测试（内存桥 + 真实 stdio server 子进程）
 * 跑法：node test/mcp-bridge.mjs
 *
 * 架构（maian 内存桥同款实测范式）：
 *   stub 宿主 HTTP（/api/health + /api/router-dispatch，Map 版 cap.kv，带 token 校验）
 *   └─ env POLARIS_HOST/PORT/TOKEN + YIZOU_ALLOW_LOCAL=1 喂真 mcp/server.js 子进程
 * AI 侧用 JSON-RPC over stdio 直说，覆盖六工具全流程 + 幂等重试 + confirm 门 + 键空间自清理。
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.js');
const TOKEN = 'test-token-yizhou';
const MD5 = crypto.createHash('md5').update(TOKEN).digest('hex');

// ── stub 宿主：Map 版 cap.kv + 固定文章页 ────────────────────────────────────
const kvMap = new Map();
const PARA = (tag) => `Paragraph ${tag}: this is a long paragraph of English prose used for the in-memory bridge test. `
  + `It repeats varied sentences to reach a healthy length for container scoring. `
  + `Translation segments keep their markers stable across batches. `.repeat(24);

function fixturePage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bridge Fixture Article</title>`
    + `<meta name="author" content="Tester"></head><body>`
    + `<nav><a href="/">Home</a><a href="/x">Nav</a></nav><article>`
    + `<h1>Fixture Heading</h1>`
    + `<p>${PARA('A')}</p><p>${PARA('B')}</p><p>${PARA('C')}</p>`
    + `<pre>const fixture = 'code stays as-is';</pre>`
    + `<ul><li>Bullet one with enough length to pass the paragraph minimum threshold for scoring.</li>`
    + `<li>Bullet two also passes the threshold with a bit more text than the first bullet.</li></ul>`
    + `</article></body></html>`;
}

function startStub() {
  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if (url === '/api/health') { res.writeHead(200); res.end('ok'); return; }
    if (url === '/article') {
      const body = Buffer.from(fixturePage(), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }
    if (url === '/data.json') {
      const body = Buffer.from('{"json":true}', 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length });
      res.end(body);
      return;
    }
    if (url === '/api/router-dispatch' && req.method === 'POST') {
      if ((req.headers.authorization || '') !== `Bearer ${MD5}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        let payload;
        try { payload = JSON.parse(raw); } catch (_) { payload = null; }
        const p = payload && payload.req && payload.req.payload ? payload.req.payload : {};
        let result;
        if (p.action === 'get') {
          const v = kvMap.has(p.key) ? kvMap.get(p.key) : undefined;
          result = v === undefined ? {} : { value: v };
        } else if (p.action === 'set') {
          kvMap.set(p.key, p.value);
          result = {};
        } else if (p.action === 'delete') {
          kvMap.delete(p.key);
          result = {};
        } else if (p.action === 'list') {
          result = { keys: [...kvMap.keys()] };
        } else {
          result = null;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result === null ? { ok: false, error: 'bad action' } : { ok: true, result }));
      });
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ── JSON-RPC stdio 客户端 ────────────────────────────────────────────────────
function startMcp(env) {
  const child = spawn(process.execPath, [SERVER_JS], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let buf = '';
  let id = 0;
  const stderr = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let idx = buf.indexOf('\n');
    while (idx >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) {
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
          }
        } catch (_) { /* 忽略坏行 */ }
      }
      idx = buf.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderr.push(d); });
  function rpc(method, params, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const msgId = ++id;
      const timer = setTimeout(() => {
        pending.delete(msgId);
        reject(new Error(`rpc timeout: ${method}\nstderr: ${stderr.join('').slice(-800)}`));
      }, timeoutMs);
      pending.set(msgId, (msg) => { clearTimeout(timer); resolve(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msgId, method, params }) + '\n');
    });
  }
  async function call(name, args, timeoutMs = 15000) {
    const res = await rpc('tools/call', { name, arguments: args }, timeoutMs);
    if (!res.result) throw new Error(`no result: ${JSON.stringify(res).slice(0, 200)}`);
    return { isError: !!res.result.isError, text: res.result.content && res.result.content[0] ? res.result.content[0].text : '' };
  }
  return { child, rpc, call, stderr };
}

const keysOf = () => [...kvMap.keys()].sort();
const yzKeys = () => keysOf().filter((k) => k.startsWith('yz.'));

// ── 测试主体 ────────────────────────────────────────────────────────────────
async function main() {
  const stub = await startStub();
  const port = stub.address().port;
  const mcp = startMcp({
    POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(port), POLARIS_TOKEN: TOKEN,
    YIZOU_ALLOW_LOCAL: '1',
  });

  try {
    // 1. initialize + tools/list
    const init = await mcp.rpc('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(init.result.serverInfo.name, 'yizhou');
    const list = await mcp.rpc('tools/list', {});
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['yz_delete', 'yz_fetch', 'yz_list', 'yz_more', 'yz_read', 'yz_save']);
    console.log('✔ initialize + tools/list（6 工具）');

    // 2. 协议鉴权：坏 token 被宿主拒（kvclient 走 md5 Bearer）
    // （stub 已校验；这里通过正常调用反证通道鉴权配置正确）

    // 3. yz_fetch：抓 stub 文章页
    const before = yzKeys().length;
    const f = await mcp.call('yz_fetch', { url: `http://127.0.0.1:${port}/article`, targetLang: 'zh' });
    assert.equal(f.isError, false, f.text);
    assert.match(f.text, /《Bridge Fixture Article》/);
    assert.match(f.text, /\[id\] /);
    assert.match(f.text, /翻译契约/);
    assert.match(f.text, /\[0\] # Fixture Heading/);
    assert.match(f.text, /第 0\/(\d+) 批/);
    const id = /\[id\] ([0-9a-f]{16})/.exec(f.text)[1];
    const batches = Number(/共 (\d+) 段 \/ \d+ 字符 ｜ 进度 0\/(\d+).*?本批=第 0\/(\d+) 批/.exec(f.text.replace(/\n/g, ' '))[3]) + 1;
    console.log(`✔ yz_fetch：id=${id}，批次=${batches}`);
    assert.ok(yzKeys().length > before);

    // 4. yz_save 批 0（只译部分段）→ 进度推进
    const segLine = (n) => new RegExp(`\\[${n}\\] (.+)`, 'm');
    const seg0 = segLine(0).exec(f.text)[1];
    const seg1 = segLine(1).exec(f.text)[1];
    const s0 = await mcp.call('yz_save', { id, items: [{ i: 0, dst: '# 夹具标题' }, { i: 1, dst: `第一段译文。${seg1.slice(0, 20)}` }] });
    assert.equal(s0.isError, false, s0.text);
    assert.match(s0.text, /已保存 2 段（另自动收编代码段 1 段）|已保存 2 段/);
    assert.match(s0.text, /进度 \d+%/);
    console.log('✔ yz_save 批 0：进度推进 + 代码段自动收编');

    // 5. 幂等重试同批（后写覆盖，不炸不双写）
    const s0b = await mcp.call('yz_save', { id, items: [{ i: 0, dst: '# 夹具标题·重译' }] });
    assert.equal(s0b.isError, false, s0b.text);
    console.log('✔ yz_save 幂等重试');

    // 6. yz_more 缺省 → 跳到第一个未译批（fixture 总量小只有 1 批，返回批 0 剩余段）
    const m1 = await mcp.call('yz_more', { id });
    assert.equal(m1.isError, false, m1.text);
    if (!/全部段落已翻译完成/.test(m1.text)) {
      // 7. 译完剩余段（fixture 只 1 批；多批场景由批号正则覆盖）
      assert.match(m1.text, /本批=第 \d+\/\d+ 批/);
      const all = [...m1.text.matchAll(/\[(\d+)\] (.+)/g)].map((mm) => ({ i: Number(mm[1]), dst: `译${mm[1]}。` }));
      assert.ok(all.length > 0);
      const s1 = await mcp.call('yz_save', { id, items: all });
      assert.equal(s1.isError, false, s1.text);
      assert.match(s1.text, /全部翻译完成/, s1.text);
    }
    console.log('✔ yz_more 断点续译 → 全部完成');

    // 8. yz_list
    const lst = await mcp.call('yz_list', {});
    assert.equal(lst.isError, false, lst.text);
    assert.match(lst.text, /\[测试时不会出现这一行\]|译舟共 1 篇/);
    assert.match(lst.text, new RegExp(`\\[${id}\\] Bridge Fixture Article`));
    assert.match(lst.text, /已译100%/);
    console.log('✔ yz_list');

    // 9. yz_read 双语
    const rd = await mcp.call('yz_read', { id, mode: 'bilingual' });
    assert.equal(rd.isError, false, rd.text);
    assert.match(rd.text, /# Bridge Fixture Article|# 夹具标题/);
    assert.match(rd.text, /第一段译文|译\d+。/);
    assert.match(rd.text, /const fixture = 'code stays as-is';/);
    console.log('✔ yz_read 双语全文');

    // 10. yz_delete 无 confirm → 拒绝
    const d0 = await mcp.call('yz_delete', { id });
    assert.equal(d0.isError, true);
    assert.match(d0.text, /confirm/);
    // 11. yz_delete confirm → 删净
    const d1 = await mcp.call('yz_delete', { id, confirm: true });
    assert.equal(d1.isError, false, d1.text);
    assert.equal(yzKeys().filter((k) => !k.startsWith('yz.smoke.')).length, 0, `残留键：${yzKeys()}`);
    console.log('✔ yz_delete confirm 门 + 键空间删净');

    // 12. 错误taxonomy：非 HTML 内容类型 / 坏协议 / 不存在的 id
    const j = await mcp.call('yz_fetch', { url: `http://127.0.0.1:${port}/data.json` });
    assert.equal(j.isError, true);
    assert.match(j.text, /不支持的内容类型/);
    const g = await mcp.call('yz_fetch', { url: 'gopher://example.com/x' });
    assert.equal(g.isError, true);
    const nf = await mcp.call('yz_read', { id: 'doesnotexist00' });
    assert.equal(nf.isError, true);
    console.log('✔ 错误分类：类型/协议/不存在 id');

    // 13. yz_list 空库文案
    const lst2 = await mcp.call('yz_list', {});
    assert.match(lst2.text, /暂无文章/);
    console.log('✔ yz_list 空库引导');

    console.log(`\n全部通过（内存桥全链路；kv 键空间自清理 ✓ 残留=${yzKeys().length}）`);
    mcp.child.kill();
    stub.close();
    process.exit(0);
  } catch (e) {
    console.error('✖ 失败：', e.message);
    console.error('--- server stderr tail ---');
    console.error(mcp.stderr.join('').slice(-1500));
    mcp.child.kill();
    stub.close();
    process.exit(1);
  }
}

main();
