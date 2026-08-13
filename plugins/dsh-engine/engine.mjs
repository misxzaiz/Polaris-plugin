#!/usr/bin/env node
/**
 * DSH → Polaris engine-v1 适配器
 *
 * 协议：engine-v1 JSONRPC (stdin/stdout JSONL)
 * 驱动：`dsh --profile headless`（每轮独立进程）
 * 备用驱动：webapi（通过 dsh web HTTP API + WebSocket，需 probe-api.mjs 探测路由）
 *
 * 协议参考：D:\space\base\Polaris\src-tauri\src\ai\engine\plugin_process_engine.rs
 * 示例参考：D:\space\base\Polaris-plugin\plugins\omp-engine-adapter\engine.js
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { EOL } from "node:os";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ============================================================================
// 配置
// ============================================================================

const DSH_CMD = process.env.DSH_CMD || "dsh";
const DSH_PROFILE = process.env.DSH_PROFILE || "headless";
const DEBUG = !!process.env.DSH_ADAPTER_DEBUG;

function debug(...args) {
  if (DEBUG) process.stderr.write("[dsh] " + args.join(" ") + EOL);
}

// ============================================================================
// 会话状态
// ============================================================================

const sessions = new Map();

// ============================================================================
// 辅助函数
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

function buildConversationPrompt(history, newUserMessage) {
  const lines = [];
  for (const msg of history) {
    const role = msg.role === "assistant" ? "Assistant" : "User";
    lines.push(`${role}: ${msg.content}`);
  }
  if (newUserMessage) {
    lines.push(`User: ${newUserMessage}`);
  }
  return lines.join(EOL + EOL);
}

function buildHeadlessTask(session, userMessage) {
  const parts = [];
  if (session.systemPrompt) {
    parts.push(`[System Instructions]${EOL}${session.systemPrompt}`);
  }
  if (session.appendSystemPrompt) {
    parts.push(`[Additional Context]${EOL}${session.appendSystemPrompt}`);
  }
  if (session.messageHistory.length > 0 || userMessage) {
    parts.push(
      `[Conversation]${EOL}${buildConversationPrompt(session.messageHistory, userMessage)}`
    );
  }
  if (!userMessage && parts.length === 0) {
    return "请开始";
  }
  return parts.join(EOL + EOL);
}

// ============================================================================
// 驱动：headless
// ============================================================================

async function runHeadlessTask(session, userMessage, signal) {
  const task = buildHeadlessTask(session, userMessage);
  if (!task.trim()) {
    return { text: "", exitCode: 0 };
  }

  debug("task (first 200):", task.slice(0, 200));

  return new Promise((resolve, reject) => {
    const args = ["--profile", DSH_PROFILE, task];
    const env = { ...process.env, ...session.envOverrides };
    if (session.model) env.DSH_DEFAULT_MODEL = session.model;

    const child = spawn(DSH_CMD, args, {
      env,
      cwd: session.workDir || undefined,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    session.abortController = new AbortController();
    signal?.addEventListener("abort", () => child.kill("SIGTERM"));

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (exitCode) => {
      session.running = false;
      if (stderr && !stdout) reject(new Error(stderr.trim()));
      else resolve({ text: stdout.trim(), exitCode: exitCode ?? 0 });
    });

    child.on("error", (err) => {
      session.running = false;
      reject(err);
    });

    session.running = true;
  });
}

// ============================================================================
// 请求处理
// ============================================================================

async function handleStartSession(id, params) {
  const sessionId = params.session_id || `dsh-${randomUUID()}`;
  const session = {
    id: sessionId,
    workDir: params.work_dir || params.workDir || process.cwd(),
    systemPrompt: params.system_prompt || params.systemPrompt || "",
    appendSystemPrompt: params.append_system_prompt || params.appendSystemPrompt || "",
    messageHistory: params.message_history || params.messageHistory || [],
    model: params.model || null,
    envOverrides: params.env_overrides || params.envOverrides || {},
    running: false,
    abortController: null,
  };

  sessions.set(sessionId, session);
  const userMessage = params.message || params.userMessage || params.text || "";
  debug("start_session:", sessionId, "workDir:", session.workDir);

  try {
    const result = await runHeadlessTask(session, userMessage, null);
    if (result.text) {
      emitEvent(sessionId, "assistant_message", { content: result.text, is_delta: false });
    }
    emitEvent(sessionId, "session_end", { reason: "completed" });
    const resumeToken = await saveResumeToken(sessionId, session);
    sendResult(id, { session_id: sessionId, resume_token: resumeToken });
  } catch (err) {
    emitEvent(sessionId, "error", { error: err.message });
    emitEvent(sessionId, "session_end", { reason: "error" });
    sendError(id, -1, err.message);
  }
}

async function handleContinueSession(id, params) {
  const sessionId = params.session_id || params.sessionId;
  let session = sessions.get(sessionId);
  if (!session) {
    session = await loadFromResumeToken(params.resume_token || params.resumeToken);
    if (!session) {
      sendError(id, -1, `会话 ${sessionId} 未找到`);
      return;
    }
    sessions.set(session.id, session);
  }

  const userMessage = params.message || params.userMessage || params.text || "";
  const newHistory = params.message_history || params.messageHistory || [];
  if (newHistory.length > 0) {
    session.messageHistory = newHistory;
  }

  try {
    const result = await runHeadlessTask(session, userMessage, null);
    if (result.text) {
      emitEvent(sessionId, "assistant_message", { content: result.text, is_delta: false });
    }
    emitEvent(sessionId, "session_end", { reason: "completed" });
    const resumeToken = await saveResumeToken(sessionId, session);
    sendResult(id, { session_id: sessionId, resume_token: resumeToken });
  } catch (err) {
    emitEvent(sessionId, "error", { error: err.message });
    emitEvent(sessionId, "session_end", { reason: "error" });
    sendError(id, -1, err.message);
  }
}

async function handleInterrupt(id, params) {
  const sessionId = params.session_id || params.sessionId;
  const session = sessions.get(sessionId);
  if (session?.abortController) {
    session.abortController.abort();
    session.running = false;
  }
  sendResult(id, { interrupted: true });
}

// ============================================================================
// Resume Token 持久化
// ============================================================================

const RESUME_DIR = process.env.DSH_RESUME_DIR || join(process.cwd(), ".dsh-resume");

function ensureResumeDir() {
  if (!existsSync(RESUME_DIR)) mkdirSync(RESUME_DIR, { recursive: true });
}

async function saveResumeToken(sessionId, session) {
  ensureResumeDir();
  const tokenPath = join(RESUME_DIR, `${sessionId}.json`);
  const data = {
    id: session.id,
    workDir: session.workDir,
    systemPrompt: session.systemPrompt,
    appendSystemPrompt: session.appendSystemPrompt,
    messageHistory: session.messageHistory,
    model: session.model,
    envOverrides: session.envOverrides,
    timestamp: Date.now(),
  };
  writeFileSync(tokenPath, JSON.stringify(data, null, 2));
  return tokenPath;
}

async function loadFromResumeToken(resumeToken) {
  if (!resumeToken || !existsSync(resumeToken)) return null;
  try {
    const data = JSON.parse(await readFile(resumeToken, "utf-8"));
    return {
      id: data.id,
      workDir: data.workDir,
      systemPrompt: data.systemPrompt,
      appendSystemPrompt: data.appendSystemPrompt,
      messageHistory: data.messageHistory || [],
      model: data.model,
      envOverrides: data.envOverrides || {},
      running: false,
      abortController: null,
    };
  } catch { return null; }
}

// ============================================================================
// 主循环
// ============================================================================

const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try { request = JSON.parse(trimmed); }
  catch { process.stderr.write(`[dsh] invalid JSON: ${trimmed.slice(0, 200)}\n`); return; }

  const { id, method, params = {} } = request;
  if (!method) { process.stderr.write(`[dsh] missing method: ${trimmed.slice(0, 200)}\n`); return; }

  debug("request:", method, "id:", id);

  try {
    switch (method) {
      case "start_session": await handleStartSession(id, params); break;
      case "continue_session": await handleContinueSession(id, params); break;
      case "interrupt": await handleInterrupt(id, params); break;
      default: sendError(id, -32601, `未知方法: ${method}`);
    }
  } catch (err) {
    process.stderr.write(`[dsh] error: ${err}\n`);
    sendError(id, -1, err.message);
  }
});

rl.on("close", () => process.exit(0));

process.stderr.write("[dsh] DSH Adapter 已启动，等待 engine-v1 请求...\n");