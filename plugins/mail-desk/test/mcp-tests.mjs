#!/usr/bin/env node
'use strict';
/**
 * mcp-tests.mjs —— MCP server 真子进程测试:spawn 真服务 + 真收信 + MCP stdio
 * JSON-RPC 全链路断言(tools/list / mail_stats / mail_list / mail_get 验证码 /
 * mail_search / mail_delete / 未知工具报错)。服务与 MCP 均无桥模式,不碰宿主 kv。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..');
const PORT = 18757;
const SMTP_PORT = 11027;
const TOKEN = 'mcp-test-token-0123456789';

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 发一封测试信(完整状态机:220→EHLO/MAIL/RCPT/DATA→354→正文→250→QUIT) */
function smtpSend(port, { from, to, subject, body }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let buf = '';
    let phase = 'greet';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('smtp timeout, phase=' + phase)); }, 8000);
    socket.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!/^\d{3}/.test(line) || !/^\d{3} /.test(line)) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (phase === 'greet') {
          if (code !== 220) return failPhase(`greet ${line}`);
          phase = 'cmd';
          socket.write(`EHLO t\r\nMAIL FROM:<${from}>\r\nRCPT TO:<${to}>\r\nDATA\r\n`);
        } else if (phase === 'cmd') {
          if (code === 354) {
            phase = 'quit';
            const payload = [
              `From: ${from}`, `To: ${to}`,
              `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
              'MIME-Version: 1.0',
              'Content-Type: text/plain; charset=UTF-8',
              'Content-Transfer-Encoding: base64', '',
              Buffer.from(body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'), '.',
            ].join('\r\n');
            socket.write(payload + '\r\n');
          } else if (code >= 400) return failPhase(line);
        } else if (phase === 'quit') {
          if (code !== 250) return failPhase(line);
          phase = 'bye';
          socket.write('QUIT\r\n');
          clearTimeout(timer);
          socket.destroy();
          resolve();
        }
      }
    });
    const failPhase = (m) => { clearTimeout(timer); socket.destroy(); reject(new Error(m)); };
    socket.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

class McpClient {
  constructor(child) {
    this.child = child;
    this.buf = '';
    this.pending = new Map();
    this.nextId = 1;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      this.buf += c;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          const p = this.pending.get(msg.id);
          if (p) { this.pending.delete(msg.id); p(msg); }
        } catch (_) { /* 忽略 */ }
      }
    });
  }
  rpc(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP 超时: ${method}`)), 20000);
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  call(name, args) {
    return this.rpc('tools/call', { name, arguments: args || {} }).then((m) => {
      const r = m.result || {};
      const text = (r.content && r.content[0] && r.content[0].text) || '';
      return { text, isError: r.isError === true };
    });
  }
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'maildesk-mcp-'));
  const svc = spawn(process.execPath, [join(PLUGIN_DIR, 'service', 'main.js'), String(PORT), tmp], {
    env: { ...process.env, MDK_TEST_NO_BRIDGE: '1', MDK_TEST_SMTP_PORT: String(SMTP_PORT), MDK_TEST_TOKEN: TOKEN },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const mcp = spawn(process.execPath, [join(PLUGIN_DIR, 'mcp', 'server.js'), tmp], {
    env: { ...process.env, MDK_TEST_NO_BRIDGE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let mcpErr = '';
  mcp.stderr.on('data', (c) => { mcpErr += c; });
  const client = new McpClient(mcp);
  try {
    console.log('▶ MCP 握手');
    const init = await client.rpc('initialize', {});
    ok(init.result && init.result.serverInfo && init.result.serverInfo.name === 'mail-desk', 'initialize 返回 mail-desk');
    ok(init.result.protocolVersion === '2024-11-05', '协议版本 2024-11-05');
    await client.rpc('notifications/initialized', {}).catch(() => {});

    const tools = await client.rpc('tools/list', {});
    const names = (tools.result.tools || []).map((t) => t.name);
    ok(names.length === 7, `7 个工具(实际 ${names.length})`);
    for (const n of ['mail_stats', 'mail_list', 'mail_get', 'mail_search', 'mail_delete', 'mail_clear', 'mail_selftest']) {
      ok(names.includes(n), `工具 ${n}`);
    }

    console.log('▶ 服务未就绪兜底');
    // 把 service 杀掉前的状态:先测无 mdk.service 时的兜底(kv 无桥→读不到→兜底文案)
    const statsDown = await client.call('mail_stats');
    ok(statsDown.isError === true && statsDown.text.includes('未就绪'), '服务未就绪给兜底提示');

    console.log('▶ 真服务上线后(经 mdk.service?无桥写不了 kv)——注入发现信息');
    // 无桥模式下 MCP 也读不到 mdk.service。注入:MCP 进程是独立的,无法直接注入内存。
    // 方案:MCP 支持 MDK_TEST_SERVICE env(仅测试),直接提供 {port,token}。
    ok(true, '见 MDK_TEST_SERVICE env 通道(下轮重启 MCP 验证)');

    // 重启 MCP 带测试发现信息
    mcp.kill('SIGKILL');
    const mcp2 = spawn(process.execPath, [join(PLUGIN_DIR, 'mcp', 'server.js'), tmp], {
      env: { ...process.env, MDK_TEST_NO_BRIDGE: '1', MDK_TEST_SERVICE: JSON.stringify({ port: PORT, token: TOKEN, smtpPort: SMTP_PORT }) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const client2 = new McpClient(mcp2);
    await client2.rpc('initialize', {});

    console.log('▶ 发两封真信 → MCP 读');
    await smtpSend(SMTP_PORT, { from: 'noreply@example.com', to: 'alice@test.dev', subject: '验证通知', body: '您的验证码是 735102,5 分钟内有效。' });
    await smtpSend(SMTP_PORT, { from: 'team@example.com', to: 'bob@test.dev', subject: 'weekly digest', body: 'weekly digest body' });
    await wait(600);

    const stats = await client2.call('mail_stats');
    ok(stats.isError === false && stats.text.includes('127.0.0.1:' + SMTP_PORT), `mail_stats 含 SMTP 口\n     ${stats.text.split('\n')[1]}`);

    const list = await client2.call('mail_list');
    ok(list.text.includes('验证通知') && list.text.includes('weekly digest'), 'mail_list 两封都在');
    ok(list.text.includes('alice@test.dev'), 'mail_list 含收件人');

    const get = await client2.call('mail_get', {});
    ok(get.text.includes('weekly digest'), 'mail_get 不带 id 读最新一封(digest)');
    const listV = await client2.call('mail_search', { query: '验证通知' });
    const idV = /\[(m_[a-z0-9_]+)\]/.exec(listV.text);
    const getCode = await client2.call('mail_get', { id: idV ? idV[1] : undefined });
    ok(getCode.text.includes('735102'), '指定 id 读验证信');
    ok(getCode.text.includes('疑似验证码') && getCode.text.includes('735102'), `验证码字段:${(getCode.text.split('疑似验证码')[1] || '(缺)').slice(0, 30)}`);

    const search = await client2.call('mail_search', { query: '验证' });
    ok(search.text.includes('验证通知'), 'mail_search 中文命中');
    const searchMiss = await client2.call('mail_search', { query: '不存在的关键词xyz' });
    ok(searchMiss.text.includes('没有匹配'), '无命中提示');

    console.log('▶ 删除与清空');
    const list2 = await client2.call('mail_list', {});
    const idMatch = /\[(m_[a-z0-9_]+)\]/.exec(list2.text);
    ok(Boolean(idMatch), '列表含 id');
    const del = await client2.call('mail_delete', { id: idMatch[1] });
    ok(del.text.includes('已删除'), `mail_delete ${idMatch[1]}`);
    const clear = await client2.call('mail_clear');
    ok(clear.text.includes('已清空'), 'mail_clear');
    const empty = await client2.call('mail_list', {});
    ok(empty.text.includes('为空'), '清空后列表为空提示');

    console.log('▶ 自检与未知工具');
    const st = await client2.call('mail_selftest');
    ok(st.text.includes('自检通过'), `mail_selftest: ${st.text.slice(0, 50)}`);
    const unknown = await client2.call('no_such_tool', {});
    ok(unknown.isError === true && unknown.text.includes('未知工具'), '未知工具报错');
  } finally {
    svc.kill('SIGKILL');
    mcp.kill('SIGKILL');
    await wait(300);
    try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 句柄延迟 */ }
  }
  console.log(`\n结果:${passed} 通过,${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('测试崩溃:', e); process.exit(1); });
