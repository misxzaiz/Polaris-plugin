#!/usr/bin/env node
/**
 * qoder adapter 冒烟测试——直接复用 codebuddy 冒烟框架，差异点单独断言：
 *  - 权限映射 snake_case（acceptEdits → accept_edits）
 *  - effort → --reasoning-effort（非 --effort）
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

const sandbox = mkdtempSync(join(tmpdir(), 'qoder-smoke-'));
const shimPath = join(sandbox, 'qodercli.cmd');
const fakeCli = join(HERE, 'fake-cli.js');
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
  return spawn(process.execPath, [ADAPTER], {
    cwd: PLUGIN_ROOT,
    // QODER_CLI_ENTRY：adapter 的 CLI 入口解析钩子——冒烟注入假 CLI（fd stdin 直读文件，
    // 不再走 PATH shim），并断言不触发真实 qodercli
    env: { ...process.env, QODER_CLI_ENTRY: fakeCli, ...envExtra },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
function send(child, obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }

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

const eventFrames = (frames) => frames.filter(f => f.event === 'ai_event');
const responseFrame = (frames) => frames.find(f => f.id !== undefined && f.event === undefined);

async function scenarioA() {
  console.log('场景 A：正常轮（permission=acceptEdits + effort=high）');
  const child = runAdapter({ FAKE_CLI_ARGV_DUMP: argvDump, FAKE_CLI_PROMPT_DUMP: promptDump });
  send(child, {
    id: 1, method: 'start_session',
    params: {
      session_id: 'host-s1', message: 'hi', work_dir: sandbox,
      permission_mode: 'acceptEdits', effort: 'high', agent: 'general-purpose',
      env_overrides: { PATH: sandbox + ';' + process.env.PATH },
    },
  });
  const { frames, code } = await collect(child, 15000);
  const evs = eventFrames(frames);
  const types = evs.map(f => f.type);
  check('帧全序（9 事件）', () =>
    assert.deepStrictEqual(types, ['session_start', 'cli_init', 'thinking', 'token', 'tool_call_start', 'tool_call_end', 'assistant_message', 'usage', 'session_end']));
  check('session_start 带 engineId=qoder', () => assert.strictEqual(evs[0].engineId, 'qoder'));
  check('tool_call_end 工具名回填', () => assert.strictEqual(evs[5].tool, 'Bash'));
  check('usage 采集', () => assert.strictEqual(evs[7].input_tokens, 10));
  check('session_end completed', () => assert.strictEqual(evs[8].reason, 'completed'));
  check('响应帧 resume_token', () => {
    const r = responseFrame(frames);
    assert.strictEqual(r.result.resume_token, 'qoder-fake-456');
  });
  check('退出码 0', () => assert.strictEqual(code, 0));
  check('权限映射 snake_case（acceptEdits→accept_edits）', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    const i = argv.indexOf('--permission-mode');
    assert.ok(i >= 0 && argv[i + 1] === 'accept_edits', `argv=${JSON.stringify(argv)}`);
  });
  check('effort → --reasoning-effort（非 --effort）', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    const i = argv.indexOf('--reasoning-effort');
    assert.ok(i >= 0 && argv[i + 1] === 'high', `argv=${JSON.stringify(argv)}`);
    assert.ok(!argv.includes('--effort'), '不应出现 --effort 参数');
  });
  check('agent 透传', () => {
    const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
    const i = argv.indexOf('--agent');
    assert.ok(i >= 0 && argv[i + 1] === 'general-purpose');
  });
  check('prompt 走 stdin', () => {
    assert.strictEqual(readFileSync(promptDump, 'utf8'), 'hi');
  });
}

async function scenarioB() {
  console.log('场景 B：interrupt 树杀 + 无孤儿');
  const child = runAdapter({ FAKE_CLI_MODE: 'slow', FAKE_CLI_PID_FILE: pidFile });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s3', message: 'hi', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  await new Promise(r => setTimeout(r, 600));
  send(child, { id: 0, method: 'interrupt', params: {} });
  const { frames, code } = await collect(child, 8000);
  const endFrame = eventFrames(frames).find(f => f.type === 'session_end');
  check('aborted 终态', () => {
    assert.ok(endFrame, '未收到 session_end');
    assert.strictEqual(endFrame.reason, 'aborted');
  });
  check('适配器即时退出', () => assert.strictEqual(code, 0));
  await new Promise(r => setTimeout(r, 300));
  check('CLI 无孤儿', () => {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    assert.ok(!alive, `假 CLI pid=${pid} 仍存活`);
  });
}

async function scenarioC() {
  console.log('场景 C：权限缺省 → bypass_permissions');
  const child = runAdapter({ FAKE_CLI_ARGV_DUMP: argvDump });
  send(child, { id: 1, method: 'start_session', params: { session_id: 'host-s2', message: 'x', env_overrides: { PATH: sandbox + ';' + process.env.PATH } } });
  const { code } = await collect(child, 15000);
  const argv = JSON.parse(readFileSync(argvDump, 'utf8'));
  const i = argv.indexOf('--permission-mode');
  check('缺省 bypass_permissions', () => assert.ok(i >= 0 && argv[i + 1] === 'bypass_permissions'));
  check('退出码 0', () => assert.strictEqual(code, 0));
}

try {
  await scenarioA();
  await scenarioB();
  await scenarioC();
} finally {
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* Windows 句柄延迟 */ }
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`);
process.exitCode = failures === 0 ? 0 : 1;
