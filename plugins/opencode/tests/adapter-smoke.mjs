#!/usr/bin/env node
/**
 * adapter.js ↔ engine-v1 帧契约冒烟测试（宿主 PluginProcessEngine 的镜像契约）。
 *
 * 用假 opencode CLI（PATH 注入）驱动真实 adapter.js，断言：
 *  A 正常轮：帧全序（session_start / token / tool_call_start+end（完整快照双发）/ usage / session_end）
 *    + 响应帧（resume_token=真实 opencode sessionID）+ 退出码 0
 *  B interrupt：aborted 终态 + 适配器即时退出 + CLI 进程树无孤儿
 *  C 未知方法：error 响应帧 + 退出码 1
 *  D 终态 error 事件：SessionEnd(Error)
 *  E 无产出：fallback error + SessionEnd(Error)
 *
 * 运行：node tests/adapter-smoke.mjs
 */
'use strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, '..');
const ADAPTER = join(PLUGIN_ROOT, 'adapter.js');

const sandbox = mkdtempSync(join(tmpdir(), 'opencode-smoke-'));
const shimPath = join(sandbox, 'opencode.cmd');
const fakeCli = join(HERE, 'fake-cli.js');
// cmd.exe /c opencode 经 PATH 解析到本 shim，shim 转发到插件目录下的 fake-cli.js（绝对路径）
writeFileSync(shimPath, `@echo off\r\nnode "${fakeCli}" %*\r\n`);

const argvDump = join(sandbox, 'argv.json');
const promptDump = join(sandbox, 'prompt.txt');
const pidFile = join(sandbox, 'cli.pid');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

function runAdapter(envExtra) {
  const child = spawn(process.execPath, [ADAPTER], {
    cwd: PLUGIN_ROOT,
    env: { ...process.env, ...envExtra },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return child;
}

function send(child, obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

/** 收集 stdout JSONL 帧，直到出现匹配或超时 */
function collect(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const frames = [];
    const timer = setTimeout(() => reject(new Error(`超时 ${timeoutMs}ms，已收帧: ${frames.map(f => f.type || f.id).join(',')}`)), timeoutMs);
    let buf = '';
    const onData = (c) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.substring(0, i).trim();
        buf = buf.substring(i + 1);
        if (!line) continue;
        try { frames.push(JSON.parse(line)); } catch { /* 非法行忽略 */ }
      }
    };
    child.stdout.on('data', onData);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ frames, code }); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function eventFrames(frames) { return frames.filter(f => f.event === 'ai_event'); }
function responseFrame(frames) { return frames.find(f => f.id !== undefined && f.event === undefined); }

async function scenarioA() {
  console.log('场景 A：正常轮');
  const child = runAdapter({
    FAKE_CLI_ARGV_DUMP: argvDump,
    FAKE_CLI_PROMPT_DUMP: promptDump,
  });
  send(child, {
    id: 1, method: 'start_session',
    params: {
      session_id: 'host-s1', message: 'hi', work_dir: sandbox,
      model: 'opencode/glm-5.3-flash-free',
      env_overrides: { PATH: sandbox + ';' + process.env.PATH },
    },
  });
  const { frames, code } = await collect(child, 15000);
  const evs = eventFrames(frames);
  const types = evs.map(f => f.type);

  check('帧全序（9 事件）', () =>
    assert.deepStrictEqual(types, [
      'session_start', 'token',
      'tool_call_start', 'tool_call_start', 'tool_call_end',
      'tool_call_start', 'tool_call_end',
      'usage', 'session_end',
    ]));
  check('session_start 提前且带 engineId', () => {
    assert.strictEqual(evs[0].engineId, 'opencode');
  });
  check('token 增量值', () => assert.strictEqual(evs[1].value, '你好'));
  check('tool_call_start pending 带 call_id', () => {
    assert.strictEqual(evs[2].tool, 'read');
    assert.strictEqual(evs[2].call_id, 'call-1');
    assert.deepStrictEqual(evs[2].args, { path: 'a.txt' });
  });
  check('tool_call_start completed 完整快照再发 start', () => {
    assert.strictEqual(evs[3].tool, 'read');
    assert.strictEqual(evs[3].call_id, 'call-1');
  });
  check('tool_call_end 带 result', () => {
    assert.strictEqual(evs[4].tool, 'read');
    assert.strictEqual(evs[4].success, true);
    assert.strictEqual(evs[4].result, 'file content');
    assert.strictEqual(evs[4].call_id, 'call-1');
  });
  check('tool_call_start/end bash 成功', () => {
    assert.strictEqual(evs[5].tool, 'bash');
    assert.strictEqual(evs[6].tool, 'bash');
    assert.strictEqual(evs[6].success, true);
  });
  check('usage tokens（input=100/output=50/reasoning=5/cache_read=200）', () => {
    assert.strictEqual(evs[7].input_tokens, 100);
    assert.strictEqual(evs[7].output_tokens, 50);
    assert.strictEqual(evs[7].reasoning_output_tokens, 5);
    assert.strictEqual(evs[7].cache_read_input_tokens, 200);
  });
  check('session_end reason=completed', () => assert.strictEqual(evs[8].reason, 'completed'));
  check('响应帧 result 带 resume_token（真实 opencode sessionID）', () => {
    const r = responseFrame(frames);
    assert.strictEqual(r.id, 1);
    assert.strictEqual(r.result.session_id, 'host-s1');
    assert.strictEqual(r.result.resume_token, 'oc-fake-123');
  });
  check('退出码 0', () => assert.strictEqual(code, 0));
  check('模型参数透传', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    const i = argv.indexOf('--model');
    assert.ok(i >= 0 && argv[i + 1] === 'opencode/glm-5.3-flash-free', `argv=${JSON.stringify(argv)}`);
  });
  check('--format json + --auto + --standalone', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    assert.ok(argv.includes('--format') && argv[argv.indexOf('--format') + 1] === 'json');
    assert.ok(argv.includes('--auto'));
    assert.ok(argv.includes('--standalone'));
  });
  check('prompt 走 stdin 不进 argv', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    assert.ok(!argv.some(a => a === 'hi'), `argv 含 prompt: ${JSON.stringify(argv)}`);
    assert.strictEqual(readFileSync(promptDump, 'utf8'), 'hi');
  });
}

async function scenarioB() {
  console.log('场景 B：interrupt 树杀 + 无孤儿');
  const child = runAdapter({
    FAKE_CLI_MODE: 'slow',
    FAKE_CLI_PID_FILE: pidFile,
  });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s3', message: 'hi', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  await new Promise(r => setTimeout(r, 600));
  send(child, { id: 0, method: 'interrupt', params: {} });
  const { frames, code } = await collect(child, 8000);
  const evs = eventFrames(frames);
  const endFrame = evs.find(f => f.type === 'session_end');
  check('aborted 终态', () => {
    assert.ok(endFrame, `未收到 session_end，帧: ${evs.map(f => f.type).join(',')}`);
    assert.strictEqual(endFrame.reason, 'aborted');
  });
  check('适配器即时退出（宿主 200ms 窗口）', () => assert.strictEqual(code, 0));
  await new Promise(r => setTimeout(r, 300));
  check('CLI 进程树无孤儿', () => {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    assert.ok(!alive, `假 CLI pid=${pid} 仍存活（孤儿）`);
  });
}

async function scenarioC() {
  console.log('场景 C：未知方法 → error 响应');
  const child = runAdapter({});
  send(child, { id: 9, method: 'bogus', params: {} });
  const { frames, code } = await collect(child, 5000);
  const r = responseFrame(frames);
  check('error 响应帧', () => {
    assert.ok(r, '未收到响应帧');
    assert.strictEqual(r.id, 9);
    assert.ok(r.error && /未知方法/.test(r.error.message));
  });
  check('退出码 1', () => assert.strictEqual(code, 1));
}

async function scenarioD() {
  console.log('场景 D：error 事件 → SessionEnd(Error)');
  const child = runAdapter({ FAKE_CLI_MODE: 'error' });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s5', message: 'hi', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  const { frames, code } = await collect(child, 8000);
  const evs = eventFrames(frames);
  const errFrame = evs.find(f => f.type === 'error');
  const endFrame = evs.find(f => f.type === 'session_end');
  check('error 帧（友好文案含 Missing API key）', () => {
    assert.ok(errFrame, '未收到 error 帧');
    assert.ok(/缺少 API key/.test(errFrame.error), `error=${errFrame.error}`);
  });
  check('session_end reason=error', () => {
    assert.ok(endFrame, '未收到 session_end');
    assert.strictEqual(endFrame.reason, 'error');
  });
  check('退出码 0', () => assert.strictEqual(code, 0));
}

async function scenarioE() {
  console.log('场景 E：无产出 → fallback error + SessionEnd(Error)');
  const child = runAdapter({ FAKE_CLI_MODE: 'nooutput' });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s6', message: 'hi', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  const { frames, code } = await collect(child, 8000);
  const evs = eventFrames(frames);
  const errFrame = evs.find(f => f.type === 'error');
  const endFrame = evs.find(f => f.type === 'session_end');
  check('fallback error 帧', () => {
    assert.ok(errFrame, '未收到 error 帧');
    assert.ok(/未产生任何输出/.test(errFrame.error), `error=${errFrame.error}`);
  });
  check('session_end reason=error', () => {
    assert.ok(endFrame, '未收到 session_end');
    assert.strictEqual(endFrame.reason, 'error');
  });
  check('退出码 0', () => assert.strictEqual(code, 0));
}

async function scenarioF() {
  console.log('场景 F：continue_session → --session 续接参数透传');
  // 复用 fake-cli（同一 session 续接）：start 轮拿到 resume_token=oc-fake-123
  const sessionDump = join(sandbox, 'session.txt');
  const child = runAdapter({
    FAKE_CLI_ARGV_DUMP: argvDump,
    FAKE_CLI_SESSION_DUMP: sessionDump,
  });
  send(child, {
    id: 1, method: 'continue_session',
    params: {
      session_id: 'host-s7', message: '续聊', work_dir: sandbox,
      is_continue: true, resume_token: 'oc-fake-123',
      model: 'opencode/glm-5.3-flash-free',
      env_overrides: { PATH: sandbox + ';' + process.env.PATH },
    },
  });
  const { frames, code } = await collect(child, 15000);
  const evs = eventFrames(frames);
  const endFrame = evs.find(f => f.type === 'session_end');
  check('continue_session 正常完成', () => {
    assert.ok(endFrame, `未收到 session_end，帧: ${evs.map(f => f.type).join(',')}`);
    assert.strictEqual(endFrame.reason, 'completed');
  });
  check('--session 续接参数透传真实 token', () => {
    assert.strictEqual(readFileSync(sessionDump, 'utf8'), 'oc-fake-123');
  });
  check('退出码 0', () => assert.strictEqual(code, 0));
}

try {
  await scenarioA();
  await scenarioB();
  await scenarioC();
  await scenarioD();
  await scenarioE();
  await scenarioF();
} finally {
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* Windows 句柄延迟 */ }
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`);
process.exitCode = failures === 0 ? 0 : 1;
