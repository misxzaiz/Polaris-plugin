#!/usr/bin/env node
/**
 * 假 opencode CLI —— 冒烟测试夹具。
 * 以 opencode JSONL 风格输出固定事件序列（step_start / text / tool_use / step_finish / error）；
 * 把 argv / prompt / pid 落盘供断言。
 * FAKE_CLI_MODE=slow 时进入挂起（interrupt 树杀测试用）。
 * FAKE_CLI_MODE=error 时发 error 事件（终态 Error 测试用）。
 * FAKE_CLI_MODE=nooutput 时无输出直接退出（fallback error 测试用）。
 */
'use strict';
const fs = require('fs');

if (process.env.FAKE_CLI_ARGV_DUMP) {
  fs.writeFileSync(process.env.FAKE_CLI_ARGV_DUMP, JSON.stringify(process.argv.slice(2)));
}
if (process.env.FAKE_CLI_PID_FILE) {
  fs.writeFileSync(process.env.FAKE_CLI_PID_FILE, String(process.pid));
}
// 记录 --session 续接参数（continue_session 断言用）
if (process.env.FAKE_CLI_SESSION_DUMP) {
  const si = process.argv.indexOf('--session');
  fs.writeFileSync(process.env.FAKE_CLI_SESSION_DUMP, si >= 0 ? process.argv[si + 1] : '(none)');
}

let prompt = '';
process.stdin.on('data', (c) => { prompt += c; });
process.stdin.setEncoding('utf8');

function out(o) { process.stdout.write(JSON.stringify(o) + '\n'); }

function stepStart(sid) {
  out({ type: 'step_start', sessionID: sid, part: { type: 'step-start' } });
}
function text(sid, t) {
  out({ type: 'text', sessionID: sid, part: { type: 'text', text: t } });
}
function toolUse(sid, tool, id, status, input, output) {
  out({
    type: 'tool_use', sessionID: sid,
    part: { type: 'tool', tool, id, state: { status, input, output } },
  });
}
function stepFinish(sid, reason, tokens) {
  out({
    type: 'step_finish', sessionID: sid,
    part: { type: 'step-finish', reason, tokens, cost: 0.01 },
  });
}
function err(sid, message) {
  out({ type: 'error', sessionID: sid, error: { type: 'provider.auth', message } });
}

const mode = process.env.FAKE_CLI_MODE;

if (mode === 'slow') {
  process.stdin.on('end', () => {
    stepStart('oc-fake-123');
    setInterval(() => {}, 1000);
    setTimeout(() => process.exit(0), 30000);
  });
} else if (mode === 'error') {
  process.stdin.on('end', () => {
    stepStart('oc-fake-123');
    err('oc-fake-123', 'Missing API key');
    process.exit(0);
  });
} else if (mode === 'nooutput') {
  process.stdin.on('end', () => {
    process.exit(0);
  });
} else {
  process.stdin.on('end', () => {
    if (process.env.FAKE_CLI_PROMPT_DUMP) {
      fs.writeFileSync(process.env.FAKE_CLI_PROMPT_DUMP, prompt);
    }
    const sid = 'oc-fake-123';
    stepStart(sid);
    text(sid, '你好');
    // tool_use 完整快照：pending → start；completed → start + end
    toolUse(sid, 'read', 'call-1', 'pending', { path: 'a.txt' });
    toolUse(sid, 'read', 'call-1', 'completed', { path: 'a.txt' }, 'file content');
    toolUse(sid, 'bash', 'call-2', 'completed', { cmd: 'ls' }, 'out');
    stepFinish(sid, 'end-turn', { input: 100, output: 50, reasoning: 5, cache: { read: 200, write: 0 } });
    process.exit(0);
  });
}
process.stdin.resume();
