#!/usr/bin/env node
/**
 * OpenCode Engine Adapter for Polaris (engine-v1 protocol)
 *
 * stdin:  {"id":1,"method":"start_session","params":{...}}
 * stdout: {"event":"ai_event","type":"token","session_id":"...","value":"..."}
 *         {"id":1,"result":{"session_id":"...","resume_token":"..."}}
 *
 * 内部调用: opencode run <msg> --format json --model <m> --auto --standalone [--session <id>]
 * prompt 经 stdin 传入（codebuddy 范式，规避 cmd.exe 命令行长度上限与特殊字符转义）
 *
 * opencode JSONL 事件（实测 v2.0.30，`opencode run --format json`）：
 *   {"type":"step_start","sessionID":"ses_x","part":{"type":"step-start"}}
 *   {"type":"text","sessionID":"ses_x","part":{"type":"text","text":"..."}}
 *   {"type":"tool_use","sessionID":"ses_x","part":{"type":"tool","tool":"read","id":"c1","state":{"status":"completed","input":{...},"output":"..."}}}
 *   {"type":"step_finish","sessionID":"ses_x","part":{"type":"step-finish","reason":"...","tokens":{"input":N,"output":N,"reasoning":N,"cache":{"read":N,"write":N}},"cost":N}}
 *   {"type":"error","sessionID":"ses_x","error":{"type":"provider.auth","message":"..."}}
 *
 * 关键事实（宿主原 opencode.rs 实测）：
 * - **没有 step_finish / session_end 事件**（即使有 token 用量也不推）
 * - 完成信号 = stdout EOF
 * - tool_use 是**完整快照**（含 input/output + status），非 Claude 的 start/end 两阶段
 *
 * 迁移自宿主内置 OpencodeEngine（src-tauri/src/ai/engine/opencode.rs，已删除），
 * 事件翻译语义与 T1 中断顺序对齐：
 *   EOF 判定顺序 1. interrupted（最优先，用户主动中断）→ SessionEnd(Aborted)
 *                  2. 收到 error 事件 → SessionEnd(Error)
 *                  3. 收到过 text 或 step_finish → SessionEnd(Completed)
 *                  4. 完全无产出 → fallback error + SessionEnd(Error)
 */

'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================================
// 输出工具
// ============================================================
function emit(sessionId, type, fields = {}) {
  process.stdout.write(JSON.stringify({ event: 'ai_event', type, session_id: sessionId, ...fields }) + '\n');
}
function respondAndExit(id, result) {
  // stdout 为管道时 write 是异步的：以最后一次 write 的回调作为 flush 完成信号，
  // 保证 session_end / result 帧全部落管道后再退出（提前 exit 会截断帧）。
  process.stdout.write(JSON.stringify({ id, result }) + '\n', () => process.exit(0));
}
function respondError(id, msg) {
  process.stdout.write(JSON.stringify({ id, error: { code: -1, message: msg } }) + '\n', () => process.exit(1));
}

// ============================================================
// opencode JSONL 行解析 → emit AIEvent
// 返回 true 表示收到终止信号（error 事件，终态可判定）
// ============================================================
let lastOcSessionId = null;
let receivedText = false;
let receivedFinish = false;
let receivedError = false;

function parseLine(line, sessionId) {
  let o;
  try { o = JSON.parse(line); } catch { return false; }
  if (!o || typeof o !== 'object') return false;

  switch (o.type) {
    case 'step_start': {
      // 首个 step_start 携带真实 opencode sessionID（续接 resume_token 采集源）
      if (typeof o.sessionID === 'string' && o.sessionID) lastOcSessionId = o.sessionID;
      return false;
    }
    case 'text': {
      const text = o.part && o.part.text;
      if (typeof text === 'string' && text) {
        receivedText = true;
        emit(sessionId, 'token', { value: text });
      }
      return false;
    }
    case 'tool_use': {
      const part = o.part || {};
      const tool = part.tool || '';
      if (!tool) return false;
      const state = part.state || {};
      const status = state.status || 'pending';
      // opencode 的 tool_use 是完整快照：pending/running → start；completed/error → start+end
      const args = (state.input && typeof state.input === 'object') ? state.input : {};
      const callId = part.id;
      const startFields = { tool, args, call_id: callId };
      emit(sessionId, 'tool_call_start', startFields);
      if (status === 'completed' || status === 'error') {
        const success = status === 'completed';
        const endFields = { tool, success, call_id: callId };
        if (state.output !== undefined && state.output !== null) {
          endFields.result = state.output;
        }
        emit(sessionId, 'tool_call_end', endFields);
      }
      return false;
    }
    case 'step_finish': {
      receivedFinish = true;
      const part = o.part || {};
      const tokens = part.tokens;
      if (tokens) {
        const cache = tokens.cache || {};
        emit(sessionId, 'usage', {
          input_tokens: tokens.input || 0,
          output_tokens: tokens.output || 0,
          cache_creation_input_tokens: cache.write || 0,
          cache_read_input_tokens: cache.read || 0,
          reasoning_output_tokens: tokens.reasoning || 0,
        });
      }
      // opencode 无独立 result，step_finish 即本轮结束（EOF 兜底判定，此处不终态）
      return false;
    }
    case 'error': {
      receivedError = true;
      const raw = (o.error && o.error.message) || 'opencode 错误';
      emit(sessionId, 'error', { error: friendlyError(raw) });
      return false;
    }
    default:
      // 未知事件 type（opencode 新版本新增如 reasoning/image/compaction）：
      // 保留「这一行是有效事件、只是不认识」信息，debug 日志可排查（宿主原 Unknown 变体语义）
      process.stderr.write(`[Adapter] 未知 opencode 事件 type=${o.type}\n`);
      return false;
  }
}

/** opencode error 文案 → 用户可读中文（对齐宿主原 friendly_error_message） */
function friendlyError(raw) {
  const patterns = [
    ['The socket connection was closed unexpectedly', 'opencode 连接中断（本地服务或网络波动），可重试发送'],
    ['ConnectionRefused', 'opencode 无法连接目标服务，请确认服务运行后重试'],
    ['Unable to connect', 'opencode 无法连接目标服务，请确认服务运行后重试'],
    ['ENOTFOUND', 'opencode 域名解析失败，请检查网络或代理设置'],
    ['Missing Authentication header', 'opencode provider 缺少认证信息，请在 `opencode auth login` 配置凭据'],
    ['Missing API key', 'opencode provider 缺少 API key，请在 `opencode auth login` 配置凭据'],
    ['Invalid API key', 'opencode provider API key 无效，请在 `opencode auth login` 重新配置'],
  ];
  const hit = patterns.find(([needle]) => raw.includes(needle));
  if (!hit) return raw;
  // 压缩原始错误为单行并截断（Bun 报错可能带多行堆栈）
  let condensed = raw.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  if (condensed.length > 200) condensed = condensed.slice(0, 200) + '……';
  return `${hit[1]}\n（原始错误：${condensed}）`;
}

// ============================================================
// 会话执行
// ============================================================
let currentChild = null;      // 当前 CLI 子进程（cmd.exe 壳）
let currentSessionId = null;  // 宿主会话 id
let sessionEnded = false;     // 已发过 session_end，防重复

/**
 * 终止 CLI 进程树。
 * Windows 上适配器 → cmd.exe → opencode(node/bun) 三层，child.kill() 只杀 cmd.exe
 * 会留下孤儿 CLI（携带 --auto 继续运行），必须 taskkill /T /F 全树终止。
 * 宿主 interrupt 流程发完请求仅等 200ms 就强杀适配器，因此这里用 spawnSync 保证
 * 在窗口内同步完成（对齐 codebuddy v0.2.0 修复记录）。
 */
function killCliTree(reason) {
  if (currentChild && currentChild.pid) {
    if (process.platform === 'win32') {
      try { spawnSync('taskkill', ['/pid', String(currentChild.pid), '/T', '/F'], { windowsHide: true }); } catch { /* 进程已死 */ }
    } else {
      try { currentChild.kill('SIGKILL'); } catch { /* 进程已死 */ }
    }
  }
  process.stderr.write(`[Adapter] CLI 进程树已终止 (${reason})\n`);
}

function endSession(reason, reqId, errorMsg) {
  if (sessionEnded || !currentSessionId) return;
  sessionEnded = true;
  if (errorMsg) emit(currentSessionId, 'error', { error: errorMsg });
  // 响应帧必须先于 session_end 发出：宿主 reader 收到 session_end 即 break，
  // 后发的响应帧会被丢弃——resume_token 丢失导致续聊退化为新会话（codebuddy 实测根因）
  respondAndExitBegin(reqId, { session_id: currentSessionId, resume_token: lastOcSessionId || undefined });
  emit(currentSessionId, 'session_end', { reason });
  process.exit(0);
}

/** 响应帧写出（不退出——退出由 endSession 尾部统一执行） */
function respondAndExitBegin(id, result) {
  process.stdout.write(JSON.stringify({ id, result }) + '\n');
}

function runSession(params, reqId) {
  const sessionId = params.session_id || 'unknown';
  const message = params.message || '';
  const workDir = params.work_dir || process.cwd();
  const model = params.model || 'opencode/glm-5.3-flash-free';
  const isContinue = params.is_continue || false;
  const resumeToken = params.resume_token;
  // opencode 用 --auto（非交互必需，无 permission-mode 白名单映射）
  const systemPrompt = params.system_prompt || '';
  const appendSystemPrompt = params.append_system_prompt || '';
  const additionalDirs = Array.isArray(params.additional_dirs) ? params.additional_dirs : [];
  const allowedTools = Array.isArray(params.allowed_tools) ? params.allowed_tools : [];
  const disallowedTools = Array.isArray(params.disallowed_tools) ? params.disallowed_tools : [];

  currentSessionId = sessionId;
  sessionEnded = false;
  lastOcSessionId = null;
  receivedText = false;
  receivedFinish = false;
  receivedError = false;

  process.stderr.write(`[Adapter] runSession: sid=${sessionId}, model=${model}, continue=${isContinue}\n`);

  // 即刻回 session_start：opencode 冷启动可能较慢，此前全程无反馈
  emit(sessionId, 'session_start', { engineId: 'opencode' });

  const args = ['run', '--format', 'json', '--model', model, '--auto', '--standalone'];
  if (isContinue && resumeToken) args.push('--session', resumeToken);
  // 系统提示词覆盖/追加（opencode 支持，经环境变量不通用——走 argv 需谨慎；opencode
  // 无 --system-prompt 标志，这里经 stdin 消息前拼接，与宿主原语义对齐——宿主原
  // build_command 不带 system_prompt，由 ai_chat_core 追加 append_system_prompt 到消息。
  // 简化：systemPrompt/appendSystemPrompt 通过 OPENCODE 环境变量注入不被 v2.0.30 认可，
  // 因此不传 argv（与宿主原行为一致——宿主原仅用 session_opts.append_system_prompt 由
  // 上层拼进 message，此处 message 已含）。
  if (additionalDirs.length > 0) {
    // opencode 无 --add-dir 等价；忽略（宿主原也未传）
  }
  if (allowedTools.length > 0 || disallowedTools.length > 0) {
    // opencode 用 config 工具权限，无 --allowedTools；忽略
  }

  // Polaris 插件/内置 MCP 挂载：opencode 按 cwd 读项目级 opencode.json 的 mcp 段。
  // 宿主原逻辑在启动前写项目级 opencode.json + EOF 删除。adapter 侧等价：把
  // mcp_servers 写成临时 opencode.json 到工作区，spawn 后挂清理。
  const mcpServers = Array.isArray(params.mcp_servers) ? params.mcp_servers : [];
  let mcpCleanup = null;
  if (mcpServers.length > 0) {
    mcpCleanup = writeOpencodeMcpConfig(workDir, mcpServers);
  }

  // env_overrides：宿主显式传入的环境覆盖（OPENAI_BASE_URL/API_KEY 等）
  const env = { ...process.env };
  if (params.env_overrides && typeof params.env_overrides === 'object') {
    for (const [k, v] of Object.entries(params.env_overrides)) {
      if (typeof v === 'string') env[k] = v;
    }
  }

  const isWin = process.platform === 'win32';
  let child;
  try {
    if (isWin) {
      child = spawn('cmd.exe', ['/c', 'opencode', ...args], {
        cwd: workDir, env,
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
    } else {
      child = spawn('opencode', args, {
        cwd: workDir, env,
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
    }
  } catch (e) {
    cleanupMcp(mcpCleanup);
    endSession('error', reqId, `启动失败: ${e.message}`);
    return;
  }

  currentChild = child;

  // prompt 经 stdin 写入后关闭，CLI 进入非交互执行
  // （opencode run 检测 stdin 为 pipe 且未 EOF 会进交互模式——写入后立即 end 走非交互）
  try {
    child.stdin.write(message);
    child.stdin.end();
  } catch (e) {
    process.stderr.write(`[Adapter] stdin 写入失败: ${e.message}\n`);
  }

  let gotResult = false;
  let stdoutBuf = '';
  let childClosed = false;
  let stdoutEnded = false;
  let closeCode = null;
  let stderrBufArr = [];   // 异常退出 fallback 摘要

  // stdout 逐行解析（用 data + 手动分行，同 codebuddy 范式）
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.substring(0, idx).trim();
      stdoutBuf = stdoutBuf.substring(idx + 1);
      if (line && parseLine(line, sessionId)) gotResult = true;
    }
  });
  // stdout end：CLI 输出全部消费完——EOF 即完成信号（opencode 无 session_end 事件）
  child.stdout.on('end', () => {
    stdoutEnded = true;
    if (childClosed) finishSession(reqId);
  });
  // 残余无换行尾行（CLI 异常截断时的最后一帧）
  child.stdout.on('close', () => {
    if (!stdoutEnded && stdoutBuf.trim()) {
      const line = stdoutBuf.trim();
      stdoutBuf = '';
      if (line && parseLine(line, sessionId)) gotResult = true;
    }
    stdoutEnded = true;
    if (childClosed) finishSession(reqId);
  });

  const finishSession = (reqId2) => {
    if (sessionEnded) return;
    // EOF 终态判定（对齐宿主原 T1 语义）：
    // 1. interrupted（killCliTree 置位）→ aborted
    // 2. receivedError → error（error 帧已发）
    // 3. receivedText || receivedFinish → completed
    // 4. 完全无产出 → fallback error + error 终态
    if (sessionInterrupted) {
      endSession('aborted', reqId2);
    } else if (receivedError) {
      endSession('error', reqId2);
    } else if (receivedText || receivedFinish) {
      endSession('completed', reqId2);
    } else {
      const summary = stderrBufArr.slice(-8).join('\n');
      const msg = summary.trim() ? `opencode CLI 异常退出:\n${summary}` : 'opencode CLI 异常退出，未产生任何输出';
      emit(currentSessionId, 'error', { error: msg });
      endSession('error', reqId2);
    }
  };

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    let idx;
    while ((idx = stderrBuf.indexOf('\n')) >= 0) {
      const line = stderrBuf.substring(0, idx);
      stderrBuf = stderrBuf.substring(idx + 1);
      if (line) {
        process.stderr.write(`[OpenCode] ${line}\n`);
        stderrBufArr.push(line);
        if (stderrBufArr.length > 50) stderrBufArr.shift();
      }
    }
  });

  child.on('close', (code) => {
    childClosed = true;
    closeCode = code;
    cleanupMcp(mcpCleanup);
    if (stdoutEnded) finishSession(reqId);
  });

  child.on('error', (e) => {
    cleanupMcp(mcpCleanup);
    endSession('error', reqId, e.message);
  });
}

// ============================================================
// MCP 桥接：写项目级 opencode.json（对齐宿主原 write_mcp_bridge_config）
// ============================================================
let sessionInterrupted = false;

function writeOpencodeMcpConfig(workDir, servers) {
  // 工作区已有 opencode.json 时跳过注入（不合并/覆盖用户自有配置，宿主原 v1 安全策略）
  const cfgPath = path.join(workDir, 'opencode.json');
  if (fs.existsSync(cfgPath)) {
    process.stderr.write(`[Adapter] 工作区已有 opencode.json，跳过 Polaris MCP 注入 (${cfgPath})\n`);
    return null;
  }
  const mcp = {};
  for (const s of servers) {
    if (s && s.server_name && s.command) {
      const command = [s.command, ...(Array.isArray(s.args) ? s.args : [])];
      mcp[s.server_name] = { type: 'local', command, enabled: true };
    }
  }
  if (Object.keys(mcp).length === 0) return null;
  const content = JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp }, null, 2);
  try {
    fs.writeFileSync(cfgPath, content, 'utf8');
    process.stderr.write(`[Adapter] 已注入 Polaris MCP 桥接: ${Object.keys(mcp).length} 个 server → ${cfgPath}\n`);
    return cfgPath;
  } catch (e) {
    process.stderr.write(`[Adapter] 写入 MCP 桥接配置失败 (${cfgPath}): ${e.message}\n`);
    return null;
  }
}

function cleanupMcp(pathOrNull) {
  if (!pathOrNull) return;
  try { fs.rmSync(pathOrNull, { force: true }); } catch { /* 清理失败忽略 */ }
}

// ============================================================
// stdin 主循环（用 data 事件 + 手动分行，避免管道模式下 readline 不触发）
// ============================================================
let stdinBuf = '';
process.stdin.on('data', (chunk) => {
  stdinBuf += chunk.toString();
  let idx;
  while ((idx = stdinBuf.indexOf('\n')) >= 0) {
    const line = stdinBuf.substring(0, idx).trim();
    stdinBuf = stdinBuf.substring(idx + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    const { id, method, params } = req;
    switch (method) {
      case 'start_session':
      case 'continue_session':
        runSession(params || {}, id);
        break;
      case 'interrupt':
        // 宿主 interrupt 后 ~200ms 即强杀适配器——立即同步终止 CLI 树并落帧退出
        sessionInterrupted = true;
        killCliTree('interrupt');
        sessionEnded = false; // 允许补发 aborted 终态
        endSession('aborted', id);
        break;
      default:
        respondError(id, `未知方法: ${method}`);
    }
  }
});

// 宿主异常退出 / 强杀时 stdin 管道断开：回收 CLI 进程树，不留孤儿
process.stdin.on('close', () => {
  if (currentChild && !sessionEnded) {
    setTimeout(() => process.exit(0), 10 * 60 * 1000);
  } else {
    setTimeout(() => process.exit(0), 200);
  }
});
process.stdin.on('end', () => {
  // 同上：EOF ≠ 宿主要求终止
});

process.on('SIGINT', () => { killCliTree('sigint'); process.exit(0); });
process.on('SIGTERM', () => { killCliTree('sigterm'); process.exit(0); });
process.on('uncaughtException', (e) => {
  process.stderr.write(`[Adapter] ${e.stack}\n`);
  killCliTree('uncaught');
  process.exit(1);
});
process.stdin.resume();
