#!/usr/bin/env node
/**
 * Qoder Engine Adapter for Polaris (engine-v1 protocol)
 *
 * stdin:  {"id":1,"method":"start_session","params":{...}}
 * stdout: {"event":"ai_event","type":"token","session_id":"...","value":"..."}
 *         {"id":1,"result":{"session_id":"...","resume_token":"..."}}
 *
 * 内部调用: qodercli -p --output-format stream-json --include-partial-messages
 *          （qoder 与 codebuddy 同用 claude-code stream-json 协议，解析器同构）
 * prompt 一律经 stdin 传入（避免 cmd.exe 命令行长度上限与特殊字符转义问题）
 *
 * 与 codebuddy adapter 的差异点（CLI 参数名不同）：
 * - 思考力度：--reasoning-effort <level>（codebuddy 是 --effort）
 * - 思考模式：--thinking <auto|adaptive|enabled|disabled>（qoder 独有）
 * - 权限值名：accept_edits / bypass_permissions / dont_ask（snake_case，codebuddy 是 camelCase）
 * - resume：--resume <id>（同 codebuddy）
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
  process.stdout.write(JSON.stringify({ id, result }) + '\n', () => process.exit(0));
}
function respondError(id, msg) {
  process.stdout.write(JSON.stringify({ id, error: { code: -1, message: msg } }) + '\n', () => process.exit(1));
}

// ============================================================
// Qoder stream-json 行解析 → emit AIEvent（与 codebuddy 同构：claude-code 流协议）
// ============================================================
let lastQoderSessionId = null;
const toolNames = new Map();
let lastAssistantText = null;
let streamedDeltas = false;
let resultHadError = false;  // result 帧 is_error/errors（CLI 执行错误，非进程退出错误）

function parseLine(line, sessionId) {
  let o;
  try { o = JSON.parse(line); } catch { return false; }
  if (!o || typeof o !== 'object') return false;

  switch (o.type) {
    case 'system':
      if (o.subtype === 'init') {
        if (typeof o.session_id === 'string' && o.session_id) lastQoderSessionId = o.session_id;
        emit(sessionId, 'cli_init', {
          tools: Array.isArray(o.tools) ? o.tools : [],
          mcpServers: Array.isArray(o.mcp_servers) ? o.mcp_servers : [],
          model: o.model || null,
        });
      }
      return false;

    case 'assistant': {
      const blocks = o.message?.content;
      if (Array.isArray(blocks)) {
        // 流式增量已覆盖内容时跳过完整回放帧（CLI 增量后回放 assistant 帧，与 codebuddy 同行为）
        if (streamedDeltas) return false;
        const frameText = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
        if (frameText && frameText === lastAssistantText) return false;
        if (frameText) lastAssistantText = frameText;
        for (const b of blocks) {
          if (b.type === 'thinking') {
            emit(sessionId, 'thinking', { content: b.thinking || '' });
          } else if (b.type === 'text') {
            emit(sessionId, 'assistant_message', { content: b.text || '', isDelta: false });
          }
        }
      }
      return false;
    }

    case 'stream_event': {
      const e = o.event;
      if (!e) return false;
      if (e.type === 'content_block_delta' && e.delta) {
        if (e.delta.type === 'text_delta') {
          streamedDeltas = true;
          emit(sessionId, 'token', { value: e.delta.text || '' });
        } else if (e.delta.type === 'thinking_delta') {
          streamedDeltas = true;
          emit(sessionId, 'thinking', { content: e.delta.thinking || '' });
        }
      }
      if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
        const callId = e.content_block.id || '';
        if (callId) toolNames.set(callId, e.content_block.name || 'unknown');
        emit(sessionId, 'tool_call_start', {
          tool: e.content_block.name || 'unknown',
          args: e.content_block.input || {},
          call_id: callId,
        });
      }
      return false;
    }

    case 'user':
      if (o.message?.content && Array.isArray(o.message.content)) {
        streamedDeltas = false;
        for (const b of o.message.content) {
          if (b.type === 'tool_result') {
            emit(sessionId, 'tool_call_end', {
              tool: toolNames.get(b.tool_use_id) || '',
              success: !b.is_error,
              result: b.content,
              call_id: b.tool_use_id || '',
            });
          }
        }
      }
      return false;

    case 'result': {
      if (typeof o.session_id === 'string' && o.session_id) lastQoderSessionId = o.session_id;
      // CLI 执行错误（模型不可用/限流等）藏在 result 帧：is_error + errors[]，
      // 不透出则用户看到空回复假成功（qoder "main model auto is unavailable" 实证）
      resultHadError = o.is_error === true || (Array.isArray(o.errors) && o.errors.length > 0);
      if (resultHadError) {
        const errs = (Array.isArray(o.errors) && o.errors.length > 0)
          ? o.errors.join(' | ')
          : (o.result || 'CLI 执行错误');
        emit(sessionId, 'error', { error: String(errs).slice(0, 500) });
      }
      const u = o.usage || {};
      emit(sessionId, 'usage', {
        input_tokens: u.input_tokens || 0,
        output_tokens: u.output_tokens || 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
        cache_read_input_tokens: u.cache_read_input_tokens || 0,
        total_cost_usd: o.total_cost_usd || 0,
        actual_model: o.modelUsage ? Object.keys(o.modelUsage)[0] : undefined,
      });
      return true;
    }

    default:
      return false;
  }
}

// ============================================================
// 会话执行
// ============================================================
let currentChild = null;
let currentSessionId = null;
let sessionEnded = false;

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
  emit(currentSessionId, 'session_end', { reason });
  respondAndExit(reqId, { session_id: currentSessionId, resume_token: lastQoderSessionId || undefined });
}

/**
 * 宿主 PermissionMode（camelCase）→ qoder CLI --permission-mode（snake_case）
 * qoder choices: default / accept_edits / bypass_permissions / dont_ask / auto
 */
function mapPermissionMode(mode) {
  switch (mode) {
    case 'bypassPermissions': return 'bypass_permissions';
    case 'acceptEdits': return 'accept_edits';
    case 'plan': return 'default';       // qoder 无 plan 模式，降级 default
    case 'default': return 'default';
    case 'auto': return 'auto';
    case 'dontAsk': return 'dont_ask';
    default: return 'bypass_permissions'; // 与 Polaris DEFAULT_SESSION_CONFIG 缺省一致
  }
}

function runSession(params, reqId) {
  const sessionId = params.session_id || 'unknown';
  const message = params.message || '';
  const workDir = params.work_dir || process.cwd();
  const model = params.model || '';
  const isContinue = params.is_continue || false;
  const resumeToken = params.resume_token;
  const permissionMode = mapPermissionMode(params.permission_mode);
  // 透传宿主 SessionOptions（与 codebuddy 对齐；effort → --reasoning-effort）
  const effort = params.effort || '';
  const agent = params.agent || '';
  const systemPrompt = params.system_prompt || '';
  const appendSystemPrompt = params.append_system_prompt || '';
  const additionalDirs = Array.isArray(params.additional_dirs) ? params.additional_dirs : [];
  const allowedTools = Array.isArray(params.allowed_tools) ? params.allowed_tools : [];
  const disallowedTools = Array.isArray(params.disallowed_tools) ? params.disallowed_tools : [];

  currentSessionId = sessionId;
  sessionEnded = false;
  toolNames.clear();
  lastAssistantText = null;
  streamedDeltas = false;
  lastQoderSessionId = null;
  resultHadError = false;

  process.stderr.write(`[Adapter] runSession: sid=${sessionId}, model=${model || '-'}, effort=${effort || '-'}, permission=${permissionMode}\n`);

  emit(sessionId, 'session_start', { engineId: 'qoder' });

  const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages'];
  if (model) args.push('--model', model);
  if (isContinue && resumeToken) args.push('--resume', resumeToken);
  args.push('--permission-mode', permissionMode);
  if (effort) args.push('--reasoning-effort', effort);
  if (agent) args.push('--agent', agent);
  if (systemPrompt) args.push('--system-prompt', systemPrompt);
  if (appendSystemPrompt) args.push('--append-system-prompt', appendSystemPrompt);
  for (const dir of additionalDirs) {
    if (dir) args.push('--add-dir', dir);
  }
  if (allowedTools.length > 0) args.push('--allowedTools', allowedTools.join(','));
  if (disallowedTools.length > 0) args.push('--disallowedTools', disallowedTools.join(','));

  const env = { ...process.env };
  if (params.env_overrides && typeof params.env_overrides === 'object') {
    for (const [k, v] of Object.entries(params.env_overrides)) {
      if (typeof v === 'string') env[k] = v;
    }
  }

  // prompt 经 fd 文件 stdin（qodercli 在「活父进程 + 管道 stdin」下会等一个永不
  // 关闭的继承句柄而挂死——宿主 spawn 链实证，shell 管道无此问题；fd 文件彻底绕开）。
  // CLI 入口用 node 直启 bundle JS：args 数组走 CreateProcess 安全引用，多行
  // system_prompt 等长参数不被 cmd.exe /c 行拆分截断。
  const isWin = process.platform === 'win32';
  const argsLine = args.join(' ');
  let child;
  let msgFile = null;
  let msgFd = null;
  try {
    if (isWin) {
      msgFile = path.join(os.tmpdir(), `qoder-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
      fs.writeFileSync(msgFile, message, 'utf8');
      msgFd = fs.openSync(msgFile, 'r');
      // CLI 入口解析：QODER_CLI_ENTRY 环境变量（测试钩子/非标准安装）> npm 全局 bundle
      const bundleJs = process.env.QODER_CLI_ENTRY
        || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@qoder-ai', 'qodercli', 'bundle', 'qodercli.js');
      const cliArgs = fs.existsSync(bundleJs)
        ? [bundleJs, ...args]
        : ['qodercli', ...args];
      const spawnOpts = {
        cwd: workDir, env,
        stdio: [msgFd, 'pipe', 'pipe'], windowsHide: true,
      };
      if (fs.existsSync(bundleJs)) {
        child = spawn(process.execPath, cliArgs, spawnOpts);
      } else {
        // bundle 路径不存在（非常规安装）→ 回退 cmd shim（.cmd 需 shell，长参数有截断风险）
        child = spawn(`qodercli ${argsLine} < "${msgFile.split('\\').join('/')}"`, {
          shell: true, cwd: workDir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        });
      }
    } else {
      child = spawn('qodercli', args, {
        cwd: workDir, env,
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
      try {
        child.stdin.write(message);
        child.stdin.end();
      } catch (e) {
        process.stderr.write(`[Adapter] stdin 写入失败: ${e.message}\n`);
      }
    }
  } catch (e) {
    if (msgFd !== null) { try { fs.closeSync(msgFd); } catch { /* 已关闭 */ } }
    if (msgFile) { try { fs.rmSync(msgFile, { force: true }); } catch { /* 清理失败忽略 */ } }
    endSession('error', reqId, `启动失败: ${e.message}`);
    return;
  }
  msgFd = null; // fd 所有权已移交子进程

  // CLI 退出后清理 prompt 临时文件
  const cleanupMsgFile = () => {
    if (msgFile) {
      try { fs.rmSync(msgFile, { force: true }); } catch { /* 清理失败忽略 */ }
      if (msgFd !== null) { try { fs.closeSync(msgFd); } catch { /* 已关闭 */ } }
    }
  };
  child.on('close', cleanupMsgFile);
  child.on('error', cleanupMsgFile);

  currentChild = child;

  let gotResult = false;
  let stdoutBuf = '';
  let stdoutErrText = '';  // stdout 里的非 JSON 错误文本（如 Not logged in 栈）

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.substring(0, idx).trim();
      stdoutBuf = stdoutBuf.substring(idx + 1);
      if (!line) continue;
      // JSON 解析失败的行可能是 CLI 的致命错误文本（如 NonInteractiveAuthRequiredError:
      // Not logged in——qoder 未登录时打到 stdout）——攒起来供 close 兜底提取
      let isJson = false;
      try { JSON.parse(line); isJson = true; } catch { /* 非 JSON 行 */ }
      if (!isJson) {
        if (!stdoutErrText) stdoutErrText = line;
        process.stderr.write(`[Qoder][stdout-nonjson] ${line}\n`);
        continue;
      }
      if (parseLine(line, sessionId)) gotResult = true;
    }
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    let idx;
    while ((idx = stderrBuf.indexOf('\n')) >= 0) {
      const line = stderrBuf.substring(0, idx);
      stderrBuf = stderrBuf.substring(idx + 1);
      if (line) process.stderr.write(`[Qoder] ${line}\n`);
    }
  });

  child.on('close', (code) => {
    if (!gotResult) {
      // 错误优先级：stdout 非 JSON 错误文本（Not logged in 等）> stderr 尾部 > 通用兜底
      const errTail = stderrBuf.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
      const errMsg = stdoutErrText.slice(0, 300) || errTail
        || (code !== 0 && code !== null ? `CLI 退出码: ${code}（无错误输出；若首次使用请先运行 qodercli login 登录）` : undefined);
      endSession(code === 0 && !errMsg ? 'completed' : 'error', reqId, errMsg || undefined);
    } else {
      // result 已收到：执行错误（result.is_error）已在 parseLine 内发过 error 帧，
      // 此处仅决定终态原因（error 帧去重由 sessionEnded 守卫保证）
      endSession(resultHadError ? 'error' : 'completed', reqId);
    }
  });

  child.on('error', (e) => {
    endSession('error', reqId, e.message);
  });
}

// ============================================================
// stdin 主循环
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
        killCliTree('interrupt');
        sessionEnded = false;
        endSession('aborted', id);
        break;
      default:
        respondError(id, `未知方法: ${method}`);
    }
  }
});

process.stdin.on('close', () => {
  // stdin EOF（宿主长连接不发 EOF，手动管道测试会发）：
  // - CLI 还在跑：等它自然收尾（close 事件触发 endSession + respondAndExit），
  //   此处仅设兜底定时器防适配器永久空转（远长于 CLI 冷启动+生成时长）
  // - 无 CLI（请求未发出/已结束）：直接退出
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
