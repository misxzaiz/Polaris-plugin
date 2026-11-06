#!/usr/bin/env node
/**
 * 假 codebuddy CLI —— 冒烟测试夹具。
 * 以 claude-code stream-json 风格输出固定事件序列；把 argv / prompt / pid 落盘供断言。
 * FAKE_CLI_MODE=slow 时进入 30s 挂起（interrupt 树杀测试用）。
 */
'use strict';
const fs = require('fs');

if (process.env.FAKE_CLI_ARGV_DUMP) {
  fs.writeFileSync(process.env.FAKE_CLI_ARGV_DUMP, JSON.stringify(process.argv.slice(2)));
}
if (process.env.FAKE_CLI_PID_FILE) {
  fs.writeFileSync(process.env.FAKE_CLI_PID_FILE, String(process.pid));
}

let prompt = '';
process.stdin.on('data', (c) => { prompt += c; });
process.stdin.setEncoding('utf8');

function out(o) { process.stdout.write(JSON.stringify(o) + '\n'); }

if (process.env.FAKE_CLI_MODE === 'slow') {
  // 挂起模式：吞掉 stdin 但不退出（模拟冷启动卡死 / 长思考），等被 interrupt 树杀
  process.stdin.on('end', () => {
    setInterval(() => {}, 1000);
    setTimeout(() => process.exit(0), 30000);
  });
} else if (process.env.FAKE_CLI_MODE === 'streamreplay') {
  // 真实 CLI 行为：流式增量后把最终消息拆成两条 assistant 帧（thinking / text）回放，
  // adapter 应全部跳过（增量已覆盖），不产生 assistant_message
  process.stdin.on('end', () => {
    out({ type: 'system', subtype: 'init', session_id: 'cb-fake-123', tools: [], mcp_servers: [], model: 'hy4-preview' });
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '思考增量' } } });
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '流式正文' } } });
    out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '回放思考' }] } });
    out({ type: 'assistant', message: { content: [{ type: 'text', text: '流式正文' }] } });
    out({ type: 'result', session_id: 'cb-fake-123', usage: { input_tokens: 3, output_tokens: 2 }, total_cost_usd: 0 });
    process.exit(0);
  });
} else {
  process.stdin.on('end', () => {
    if (process.env.FAKE_CLI_PROMPT_DUMP) {
      fs.writeFileSync(process.env.FAKE_CLI_PROMPT_DUMP, prompt);
    }
    out({ type: 'system', subtype: 'init', session_id: 'cb-fake-123', tools: ['Bash', 'Read'], mcp_servers: [{ name: 'm1', status: 'connected' }], model: 'hy4-preview' });
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '思考片段' } } });
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } } });
    // 真实 CLI 行为（Anthropic 流协议）：tool_use 参数经 input_json_delta 分片流式，
    // content_block_start 时 input 为空对象——adapter 须聚合分片并在 content_block_stop 补发
    const toolInput = { cmd: 'ls' };
    const inputJson = JSON.stringify(toolInput);
    const mid = Math.ceil(inputJson.length / 2);
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 't1', name: 'Bash', input: {} } } });
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: inputJson.slice(0, mid) } } });
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: inputJson.slice(mid) } } });
    out({ type: 'stream_event', event: { type: 'content_block_stop', index: 2 } });
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: 'out' }] } });
    out({ type: 'assistant', message: { content: [{ type: 'text', text: '完整回复' }] } });
    // codebuddy 真实行为：最终 assistant 消息会重发一遍（thinking 内容有差异、正文相同）——
    // adapter 按正文文本去重
    out({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '重放思考' }, { type: 'text', text: '完整回复' }] } });
    out({ type: 'result', session_id: 'cb-fake-123', usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.01 });
    process.exit(0);
  });
}
process.stdin.resume();
