#!/usr/bin/env node
/**
 * OMP 适配器进程 —— engine-v1 协议示例
 *
 * 通过 stdin/stdout JSONRPC 与 Polaris 的 PluginProcessEngine 通信。
 * 当前为 mock 模式，演示协议帧格式，不连接真实 omp CLI。
 *
 * 协议：
 * - Polaris → 适配器：{"id":1,"method":"start_session","params":{...}}
 * - 适配器 → Polaris：{"event":"ai_event","type":"assistant_message",...}
 * - 适配器 → Polaris：{"id":1,"result":{"session_id":"...","resume_token":"..."}}
 */

const readline = require('node:readline');

const rl = readline.createInterface({ input: process.stdin });
let requestId = 0;

rl.on('line', (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    process.stderr.write(`[adapter] invalid JSON: ${line}\n`);
    return;
  }

  if (!req.method) {
    process.stderr.write(`[adapter] missing method: ${line}\n`);
    return;
  }

  const id = req.id || 0;
  const params = req.params || {};
  const sessionId = params.session_id || 'mock-session';

  switch (req.method) {
    case 'start_session': {
      const message = params.message || '';
      process.stdout.write(JSON.stringify({
        event: 'ai_event',
        type: 'assistant_message',
        session_id: sessionId,
        content: `[Adapter Demo] 收到消息: "${message.slice(0, 100)}"。\n\n这是通过 engine-v1 适配器协议返回的 mock 回复。插件适配器进程可以与底层引擎 CLI 交互，\n把引擎事件翻译为标准 AIEvent 回传。`,
        is_delta: false,
      }) + '\n');

      process.stdout.write(JSON.stringify({
        event: 'ai_event',
        type: 'session_end',
        session_id: sessionId,
      }) + '\n');

      process.stdout.write(JSON.stringify({
        id,
        result: {
          session_id: sessionId,
          resume_token: `mock://${sessionId}`,
        },
      }) + '\n');
      break;
    }

    case 'continue_session': {
      const message = params.message || '';
      process.stdout.write(JSON.stringify({
        event: 'ai_event',
        type: 'assistant_message',
        session_id: sessionId,
        content: `[续聊] 收到: "${message.slice(0, 100)}"。`,
        is_delta: false,
      }) + '\n');

      process.stdout.write(JSON.stringify({
        event: 'ai_event',
        type: 'session_end',
        session_id: sessionId,
      }) + '\n');

      process.stdout.write(JSON.stringify({
        id,
        result: { session_id: sessionId },
      }) + '\n');
      break;
    }

    case 'interrupt': {
      process.stdout.write(JSON.stringify({
        id,
        result: { success: true },
      }) + '\n');
      break;
    }

    default: {
      process.stdout.write(JSON.stringify({
        id,
        error: { code: -1, message: `unknown method: ${req.method}` },
      }) + '\n');
    }
  }
});

rl.on('close', () => {
  process.exit(0);
});

process.stderr.write('[adapter] OMP Adapter Demo 已启动，等待 engine-v1 请求...\n');