// engine.js 状态机回归测试（自包含，无需 ZCode/生产桥）：
//   内嵌 mock 桥回放 test/fixtures/zcode-first-turn.json（真实会话首个逻辑轮，5 个完整工具调用）
//   spawn 仓库版 mcp/engine.js 走完整管线（stdin → create → resume → send → drain → PiRpc 帧）
//   断言帧契约：thinking 分离 / toolcall_start·end（名字+input+output）/ 正文无工具 JSON 泄漏 /
//              turn_start·message_start 配对 / 收尾判定 / 续聊轮。
// 运行：node test/engine-replay.cjs   （exit 0 = 全部通过）
'use strict';
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'mcp', 'engine.js');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'zcode-first-turn.json'), 'utf8'));
const pass1Events = fixture.events;
// 第 2 轮：合成最终正文轮（验证同进程续聊 + 纯文本轮收尾）
const pass2Events = [
  { seq: 9001, kind: 'turn-started', payload: { turnNumber: 99 } },
  { seq: 9002, kind: 'text-delta', payload: { kind: 'text_delta', delta: '收到' } },
  { seq: 9003, kind: 'turn-complete', payload: { content: '收到', stopReason: 'stop' } },
];

let sendCount = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const reply = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'POST' && url.pathname === '/api/chat/create') return reply({ ok: true, sessionId: 'sess_replay' });
  if (req.method === 'POST' && url.pathname === '/api/chat/resume') {
    let b = '';
    req.on('data', (c) => (b += c));
    return req.on('end', () => reply({ ok: true, sessionId: (JSON.parse(b || '{}').sessionId) || 'sess_replay' }));
  }
  if (req.method === 'POST' && url.pathname === '/api/chat/send') {
    let b = '';
    req.on('data', (c) => (b += c));
    return req.on('end', () => { sendCount += 1; reply({ ok: true, cursor: 0 }); });
  }
  if (req.method === 'GET' && url.pathname === '/api/chat/events') {
    const cursor = parseInt(url.searchParams.get('cursor') || '0', 10);
    const src = sendCount >= 2 ? pass2Events : pass1Events;
    const batch = src.slice(cursor, cursor + 12);
    return reply({ ok: true, cursor: cursor + batch.length, events: batch });
  }
  reply({ ok: false, error: 'no route ' + url.pathname });
});

(async () => {
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-replay-test-'));
  const tempId = 'replay-test';

  const child = spawn(process.execPath, [ENGINE, '--mode', 'rpc', '--session-dir', sessionDir, '--session-id', tempId], {
    cwd: ROOT,
    env: { ...process.env, ZCODE_BRIDGE_URL: `http://127.0.0.1:${port}` },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const frames = [];
  let buf = '';
  let stderr = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) { try { frames.push(JSON.parse(line)); } catch { /* 跳过非 JSON 行 */ } }
    }
  });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const agentEnds = () => frames.filter((f) => f.type === 'agent_end').length;
  async function waitAgentEnd(n, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (agentEnds() >= n) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  let failed = 0;
  const ck = (name, cond, detail) => { if (!cond) failed += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); };

  // 轮 1：触发工具调用的事件回放
  child.stdin.write(JSON.stringify({ id: 'req-1', type: 'prompt', message: '回放第1轮' }) + '\n');
  const p1Start = Date.now();
  if (!(await waitAgentEnd(1, 60000))) {
    console.error('FAIL  第1轮 60s 未收到 agent_end\n' + stderr.slice(-1500));
    child.kill(); server.close(); process.exit(1);
  }
  const p1Ms = Date.now() - p1Start;
  // 轮 2：同进程续聊（合成最终正文轮）
  child.stdin.write(JSON.stringify({ id: 'req-2', type: 'prompt', message: '回放第2轮' }) + '\n');
  if (!(await waitAgentEnd(2, 30000))) {
    console.error('FAIL  第2轮 30s 未收到 agent_end\n' + stderr.slice(-1500));
    child.kill(); server.close(); process.exit(1);
  }
  child.kill();
  server.close();

  const ame = (t) => frames.filter((f) => f.type === 'message_update' && f.assistantMessageEvent && f.assistantMessageEvent.type === t).map((f) => f.assistantMessageEvent);
  const types = frames.map((f) => f.type);
  const thinking = ame('thinking_delta');
  const toolStart = ame('toolcall_start');
  const toolEnd = ame('toolcall_end');
  const allText = ame('text_delta').map((e) => e.delta || '').join('');
  const startIds = new Set(toolStart.map((e) => e.tool_call_id));
  const firstIdx = (t, cid) => frames.findIndex((f) => f.type === 'message_update' && f.assistantMessageEvent && f.assistantMessageEvent.type === t && f.assistantMessageEvent.tool_call_id === cid);

  ck('session/agent_start/turn_start/message_start 齐全', ['session', 'agent_start', 'turn_start', 'message_start'].every((t) => types.includes(t)));
  ck(`thinking_delta 全部分离（n=${thinking.length}）`, thinking.length > 50);
  ck(`toolcall_start=${toolStart.length}（=5）且带真实工具名`, toolStart.length === 5 && toolStart.every((e) => e.tool && e.tool !== 'tool'), [...new Set(toolStart.map((e) => e.tool))].join(','));
  ck('toolcall_start 带 input', toolStart.every((e) => e.input && Object.keys(e.input).length > 0), JSON.stringify((toolStart[0] || {}).input ?? null).slice(0, 90));
  ck(`toolcall_end=${toolEnd.length}（=5）output 非空（嵌套 result:{success,content} 已解析）`, toolEnd.length === 5 && toolEnd.every((e) => String(e.output || '').length > 0));
  ck('end 的 callId 都有对应 start 且 start 先于 end', toolEnd.every((e) => { const s = firstIdx('toolcall_start', e.tool_call_id); const en = firstIdx('toolcall_end', e.tool_call_id); return s >= 0 && en >= 0 && s < en; }));
  ck('正文不含工具输入 JSON（tool_input_delta 不漏进正文）', !allText.includes('"command"') && !allText.includes('tool_input'), 'len=' + allText.length);
  ck('message_end/turn_end 收尾', types.includes('message_end') && types.includes('turn_end'));
  ck('两轮 agent_end', agentEnds() === 2, 'n=' + agentEnds());
  ck('续聊轮有最终正文「收到」', allText.includes('收到'));
  ck(`第1轮 ${(p1Ms / 1000).toFixed(1)}s 内收尾（sessionFinalized 而非空闲超时）`, p1Ms < 50000);
  ck('映射文件落盘', fs.existsSync(path.join(sessionDir, `${tempId}.json`)));

  console.log(failed === 0 ? '\n=== engine-replay ALL PASS ===' : `\n=== ${failed} FAILED ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
