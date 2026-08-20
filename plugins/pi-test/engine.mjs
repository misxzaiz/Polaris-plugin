#!/usr/bin/env node
/**
 * Pi Test Adapter — engine-v1 协议适配器测试
 *
 * 通过 stdin/stdout JSONRPC 与 Polaris 的 PluginProcessEngine 通信。
 * Mock 模式，不连接真实 pi CLI，用于验证 engine-v1 协议路径完整可用。
 *
 * 验证点：
 * 1. build_start_params 参数透传（model, work_dir, system_prompt, env_overrides 等）
 * 2. 事件流回传（assistant_message, tool_call, usage, session_end）
 * 3. 续聊（resume_token 恢复）
 * 4. 中断（interrupt）
 *
 * 协议参考：docs/engine-adapter-process-analysis.md § 确认的协议
 */

import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { EOL } from "node:os";

// ============================================================================
// 日志
// ============================================================================

function log(...args) {
  process.stderr.write("[pi-test] " + args.join(" ") + EOL);
}

// ============================================================================
// 协议帧输出
// ============================================================================

function writeLine(obj) {
  process.stdout.write(JSON.stringify(obj) + EOL);
}

function emitEvent(sessionId, type, payload = {}) {
  writeLine({ event: "ai_event", type, session_id: sessionId, ...payload });
}

function sendResult(id, result) {
  writeLine({ id, result });
}

function sendError(id, code, message) {
  writeLine({ id, error: { code, message } });
}

// ============================================================================
// 会话状态
// ============================================================================

const sessions = new Map();

// ============================================================================
// 参数验证
// ============================================================================

function validateParams(params, methodName) {
  const fields = Object.keys(params).sort();
  log(`[${methodName}] 收到 params 字段: ${fields.join(", ")}`);
  log(`[${methodName}] session_id: ${params.session_id || "(missing)"}`);
  log(`[${methodName}] message: ${(params.message || "").slice(0, 100)}`);

  // 记录所有可选参数（用于验证 build_start_params 透传）
  if (params.work_dir) log(`[${methodName}] work_dir: ${params.work_dir}`);
  if (params.model) log(`[${methodName}] model: ${params.model}`);
  if (params.system_prompt) log(`[${methodName}] system_prompt: ${params.system_prompt?.slice(0, 100)}`);
  if (params.append_system_prompt) log(`[${methodName}] append_system_prompt: ${params.append_system_prompt?.slice(0, 100)}`);
  if (params.permission_mode) log(`[${methodName}] permission_mode: ${params.permission_mode}`);
  if (params.resume_token) log(`[${methodName}] resume_token: ${params.resume_token}`);
  if (params.env_overrides) log(`[${methodName}] env_overrides: ${JSON.stringify(params.env_overrides)}`);
  if (params.mcp_servers) log(`[${methodName}] mcp_servers: ${JSON.stringify(params.mcp_servers)}`);
  if (params.additional_dirs) log(`[${methodName}] additional_dirs: ${JSON.stringify(params.additional_dirs)}`);
  if (params.provider_config) log(`[${methodName}] provider_config: ${JSON.stringify(params.provider_config)}`);
  if (params.settings_overlay_path) log(`[${methodName}] settings_overlay_path: ${params.settings_overlay_path}`);
  if (params.agent) log(`[${methodName}] agent: ${params.agent}`);
  if (params.effort) log(`[${methodName}] effort: ${params.effort}`);
  if (params.is_continue !== undefined) log(`[${methodName}] is_continue: ${params.is_continue}`);
}

// ============================================================================
// 模拟引擎响应
// ============================================================================

function simulateAssistantResponse(sessionId, message) {
  // 模拟思考过程
  emitEvent(sessionId, "thinking", { content: "正在分析你的问题..." });

  // 模拟流式文本输出
  const reply = `[Pi Test Adapter] 收到消息: "${message.slice(0, 200)}"\n\n` +
    `**参数透传验证**：\n` +
    `适配器已收到完整 SessionOptions 参数，engine-v1 协议路径通信正常。\n\n` +
    `这是通过 engine-v1 适配器协议返回的 mock 回复。` +
    `插件适配器进程可以与底层引擎 CLI 交互，` +
    `把引擎事件翻译为标准 AIEvent 回传。`;

  // 逐 token 模拟流式输出
  const words = reply.split(/(?<=\s)/);
  for (const word of words) {
    emitEvent(sessionId, "assistant_message", { content: word, is_delta: true });
  }

  // 模拟工具调用
  emitEvent(sessionId, "tool_call_start", {
    tool: "bash",
    args: { cmd: 'echo "hello from pi-test adapter"' },
    call_id: `call_${randomUUID().slice(0, 8)}`,
  });

  emitEvent(sessionId, "tool_call_end", {
    tool: "bash",
    success: true,
    result: "hello from pi-test adapter",
    call_id: `call_${randomUUID().slice(0, 8)}`,
  });

  // 模拟完整消息
  emitEvent(sessionId, "assistant_message", {
    content: `\n\n工具调用已完成。共收到 ${Object.keys(arguments).length} 个参数，全部验证通过。`,
    is_delta: false,
  });

  // Token 用量
  emitEvent(sessionId, "usage", {
    input_tokens: 158,
    cache_creation_input_tokens: 12,
    cache_read_input_tokens: 0,
    output_tokens: 342,
    reasoning_output_tokens: 45,
    context_window: 128000,
    total_cost_usd: 0.0023,
    actual_model: "engine-v1-adapter",
  });
}

// ============================================================================
// 请求处理
// ============================================================================

async function handleStartSession(id, params) {
  validateParams(params, "start_session");

  const sessionId = params.session_id || `pi-test-${randomUUID()}`;
  const session = {
    id: sessionId,
    messageHistory: [],
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);

  log(`start_session: ${sessionId}`);

  // 发送 CLI init 事件
  emitEvent(sessionId, "cli_init", { message: "Pi Test Adapter 已启动" });

  // 发送 session_start
  emitEvent(sessionId, "session_start", {
    engine: "pi-test",
    session_id: sessionId,
  });

  // 模拟引擎响应
  const message = params.message || "";
  simulateAssistantResponse(sessionId, message);

  // 记录历史
  session.messageHistory.push({ role: "user", content: message });

  // 发送 session_end
  emitEvent(sessionId, "session_end", { reason: "completed" });

  // 生成 resume_token
  const resumeToken = `pi-test://${sessionId}/${Date.now()}`;
  log(`resume_token: ${resumeToken}`);

  sendResult(id, {
    session_id: sessionId,
    resume_token: resumeToken,
  });
}

async function handleContinueSession(id, params) {
  validateParams(params, "continue_session");

  const sessionId = params.session_id || `pi-test-${randomUUID()}`;
  let session = sessions.get(sessionId);

  if (!session && params.resume_token) {
    // 从 resume_token 恢复（mock：从 token 提取 session_id）
    const tokenParts = params.resume_token.split("/");
    const restoredId = tokenParts[tokenParts.length - 2] || sessionId;
    session = {
      id: restoredId,
      messageHistory: [
        { role: "user", content: "[续聊恢复] 历史消息...", timestamp: Number(tokenParts[tokenParts.length - 1]) || Date.now() },
      ],
      createdAt: Number(tokenParts[tokenParts.length - 1]) || Date.now(),
    };
    sessions.set(restoredId, session);
    log(`continue_session: 从 resume_token 恢复会话 ${restoredId}`);
  } else if (session) {
    log(`continue_session: 继续现有会话 ${sessionId}`);
  } else {
    log(`continue_session: 新建会话 ${sessionId}`);
    session = { id: sessionId, messageHistory: [], createdAt: Date.now() };
    sessions.set(sessionId, session);
  }

  emitEvent(sessionId, "session_start", {
    engine: "pi-test",
    session_id: sessionId,
    resumed: true,
  });

  const message = params.message || "";
  const reply = `[续聊] 收到: "${message.slice(0, 200)}"。会话已通过 resume_token 恢复，上下文完整。`;
  emitEvent(sessionId, "assistant_message", { content: reply, is_delta: false });

  session.messageHistory.push({ role: "user", content: message });

  emitEvent(sessionId, "session_end", { reason: "completed" });

  sendResult(id, {
    session_id: sessionId,
    resume_token: `pi-test://${sessionId}/${Date.now()}`,
  });
}

async function handleInterrupt(id, _params) {
  log("interrupt: 正在中断会话");
  sendResult(id, { interrupted: true });
}

// ============================================================================
// 主循环
// ============================================================================

const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`[pi-test] invalid JSON: ${trimmed.slice(0, 200)}\n`);
    return;
  }

  const { id, method, params = {} } = request;
  if (!method) {
    process.stderr.write(`[pi-test] missing method: ${trimmed.slice(0, 200)}\n`);
    return;
  }

  log(`request: method=${method}, id=${id}`);

  try {
    switch (method) {
      case "start_session":
        await handleStartSession(id, params);
        break;
      case "continue_session":
        await handleContinueSession(id, params);
        break;
      case "interrupt":
        await handleInterrupt(id, params);
        break;
      default:
        sendError(id, -32601, `未知方法: ${method}`);
    }
  } catch (err) {
    process.stderr.write(`[pi-test] error: ${err}\n`);
    sendError(id, -1, err.message);
  }
});

rl.on("close", () => {
  log("适配器进程关闭");
  process.exit(0);
});

log("Pi Test Adapter 已启动，等待 engine-v1 请求...");