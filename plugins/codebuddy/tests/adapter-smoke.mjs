#!/usr/bin/env node
/**
 * adapter.js ↔ engine-v1 帧契约冒烟测试（宿主 PluginProcessEngine 的镜像契约）。
 *
 * 用假 codebuddy CLI（PATH 注入）驱动真实 adapter.js，断言：
 *  A 正常轮：帧全序（session_start 提前 / cli_init / thinking / token / tool_call_start /
 *    tool_call_end 工具名回填 / assistant_message / usage / session_end）+ 响应帧 + 退出码 0
 *  B interrupt：aborted 终态 + 适配器即时退出 + CLI 进程树无孤儿
 *  C 未知方法：error 响应帧 + 退出码 1
 *  D 权限模式映射：plan 透传 / 缺省 bypassPermissions / prompt 走 stdin 不进 argv
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

const sandbox = mkdtempSync(join(tmpdir(), 'codebuddy-smoke-'));
const shimPath = join(sandbox, 'codebuddy.cmd');
const fakeCli = join(HERE, 'fake-cli.js');
// cmd.exe /c codebuddy 经 PATH 解析到本 shim，shim 转发到插件目录下的 fake-cli.js（绝对路径，
// sandbox 里只有 shim 本身，%~dp0 指向的是 sandbox）
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
  console.log('场景 A：正常轮（permission_mode=plan）');
  const child = runAdapter({
    FAKE_CLI_ARGV_DUMP: argvDump,
    FAKE_CLI_PROMPT_DUMP: promptDump,
  });
  send(child, {
    id: 1, method: 'start_session',
    params: {
      session_id: 'host-s1', message: 'hi', work_dir: sandbox,
      permission_mode: 'plan', model: 'hy4-preview',
      env_overrides: { PATH: sandbox + ';' + process.env.PATH },
    },
  });
  const { frames, code } = await collect(child, 15000);
  const evs = eventFrames(frames);
  const types = evs.map(f => f.type);

  check('帧全序（9 事件，session_start 首帧）', () =>
    assert.deepStrictEqual(types, ['session_start', 'cli_init', 'thinking', 'token', 'tool_call_start', 'tool_call_end', 'assistant_message', 'usage', 'session_end']));
  check('session_start 提前且带 engineId', () => {
    assert.strictEqual(evs[0].engineId, 'codebuddy');
  });
  check('cli_init 内容（tools/mcp/model）', () => {
    const f = evs[1];
    assert.strictEqual(f.model, 'hy4-preview');
    assert.strictEqual(f.tools.length, 2);
    assert.strictEqual(f.mcpServers[0].name, 'm1');
  });
  check('thinking 内容', () => assert.strictEqual(evs[2].content, '思考片段'));
  check('token 增量值', () => assert.strictEqual(evs[3].value, '你好'));
  check('tool_call_start 带 call_id', () => {
    assert.strictEqual(evs[4].tool, 'Bash');
    assert.strictEqual(evs[4].call_id, 't1');
  });
  check('tool_call_end 工具名回填（此前为空串）', () => {
    assert.strictEqual(evs[5].tool, 'Bash');
    assert.strictEqual(evs[5].success, true);
    assert.strictEqual(evs[5].call_id, 't1');
  });
  check('assistant_message isDelta=false', () => {
    assert.strictEqual(evs[6].content, '完整回复');
    assert.strictEqual(evs[6].isDelta, false);
  });
  check('usage tokens', () => assert.strictEqual(evs[7].input_tokens, 10));
  check('session_end reason=completed', () => assert.strictEqual(evs[8].reason, 'completed'));
  check('响应帧 result 带 resume_token', () => {
    const r = responseFrame(frames);
    assert.strictEqual(r.id, 1);
    assert.strictEqual(r.result.session_id, 'host-s1');
    assert.strictEqual(r.result.resume_token, 'cb-fake-123');
  });
  check('退出码 0', () => assert.strictEqual(code, 0));
  check('权限模式 plan 透传', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    const i = argv.indexOf('--permission-mode');
    assert.ok(i >= 0 && argv[i + 1] === 'plan', `argv=${JSON.stringify(argv)}`);
  });
  check('prompt 走 stdin 不进 argv', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    assert.ok(!argv.some(a => a === 'hi'), `argv 含 prompt: ${JSON.stringify(argv)}`);
    assert.strictEqual(readFileSync(promptDump, 'utf8'), 'hi');
  });
}

async function scenarioD() {
  console.log('场景 D：权限模式缺省 → bypassPermissions');
  const child = runAdapter({ FAKE_CLI_ARGV_DUMP: argvDump });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s2', message: 'x', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  const { code } = await collect(child, 15000);
  const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
  const i = argv.indexOf('--permission-mode');
  check('缺省 bypassPermissions', () => assert.ok(i >= 0 && argv[i + 1] === 'bypassPermissions'));
  check('退出码 0', () => assert.strictEqual(code, 0));
}

async function scenarioB() {
  console.log('场景 B：interrupt 树杀 + 无孤儿');
  const child = runAdapter({
    FAKE_CLI_MODE: 'slow',
    FAKE_CLI_PID_FILE: pidFile,
  });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s3', message: 'hi', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  await new Promise(r => setTimeout(r, 600)); // 等 CLI 起来并写下 pid
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

try {
  await scenarioA();
  await scenarioD();
  await scenarioB();
  await scenarioC();
} finally {
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* Windows 句柄延迟 */ }
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`);
process.exitCode = failures === 0 ? 0 : 1;
