#!/usr/bin/env node
/**
 * CodeBuddy Engine Adapter for Polaris (engine-v1 protocol)
 *
 * stdin:  {"id":1,"method":"start_session","params":{...}}
 * stdout: {"event":"ai_event","type":"token","session_id":"...","value":"..."}
 *         {"id":1,"result":{"session_id":"...","resume_token":"..."}}
 *
 * 内部调用: codebuddy -p --model <model> --output-format stream-json --include-partial-messages
 * prompt 一律经 stdin 传入（避免 cmd.exe 命令行长度上限与特殊字符转义/注入问题）
 *
 * v0.2.0 修复记录（2026-11-05）：
 * - interrupt 真实现：宿主 interrupt 后 ~200ms 即强杀适配器进程，必须在窗口内
 *   spawnSync taskkill /T /F 同步终止 CLI 进程树，否则留下带 bypassPermissions 的孤儿 CLI
 * - 会话结束（正常/interrupt）后适配器主动退出，与协议文档「结束后一起退出」对齐，
 *   宿主 5s 宽限等待即刻命中进程退出，不再靠 kill 兜底
 * - prompt 改走 stdin；permission_mode 尊重宿主参数（映射白名单，缺省 bypassPermissions
 *   与 Polaris DEFAULT_SESSION_CONFIG 一致）
 * - tool_call_end 回填工具名（content_block_start 建 call_id→name 映射）
 * - session_start 提前到 start_session 即刻发出（此前要等 CLI init，冷启动 ~73s 全程无反馈）
 * - resume_token 只从 init/result 帧采集（此前任意含 session_id 的帧都覆盖，有错续风险）
 * - env_overrides 注入子进程环境（宿主 build_start_params 已传，测试用 PATH 注入即此通道）
 */

'use strict';

const { spawn, spawnSync } = require('child_process');

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
// CodeBuddy stream-json 行解析 → emit AIEvent
// 返回 true 表示收到 result（会话结束）
// ============================================================
let lastCbSessionId = null;
// call_id → 工具名（content_block_start 建立映射，tool_result 回填）
const toolNames = new Map();
// 上一条 assistant 完整消息的正文：codebuddy CLI 会把最终 assistant 消息发两遍
// （流式结束 + result 回放，thinking 内容略有差异导致签名不同），按正文文本去重，
// 否则 UI 渲染出重复的思考/正文块
let lastAssistantText = null;
// 本条消息是否已有 stream_event 增量流出：CLI 在流式增量后会再发一条完整 assistant
// 帧（思考+正文回放），不跳过会与增量内容重复渲染（delta 一对 + 完整帧一对）
let streamedDeltas = false;

function parseLine(line, sessionId) {
  let o;
  try { o = JSON.parse(line); } catch { return false; }
  if (!o || typeof o !== 'object') return false;

  switch (o.type) {
    case 'system':
      if (o.subtype === 'init') {
        // CodeBuddy 真实会话 id：仅在 init/result 帧采集，避免误采集子任务 id
        if (typeof o.session_id === 'string' && o.session_id) lastCbSessionId = o.session_id;
        emit(sessionId, 'cli_init', {
          tools: Array.isArray(o.tools) ? o.tools : [],
          mcpServers: Array.isArray(o.mcp_servers) ? o.mcp_servers : [],
          model: o.model || null,
          // 斜杠命令列表（CliInitEvent.slash_commands，宿主会话面板可用）
          slashCommands: Array.isArray(o.slash_commands) ? o.slash_commands : [],
        });
      }
      return false;

    case 'assistant': {
      const blocks = o.message?.content;
      if (Array.isArray(blocks)) {
        // CLI 把最终消息拆成多条 assistant 帧（一条 thinking、一条 text）在流式增量后回放，
        // 增量已覆盖内容 → 全部跳过；标记保持到 user（tool_result）消息边界再重置
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
        // user（tool_result）帧是消息边界：下一条 assistant 消息的增量从零计
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
      if (typeof o.session_id === 'string' && o.session_id) lastCbSessionId = o.session_id;
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
let currentChild = null;      // 当前 CLI 子进程（cmd.exe 壳）
let currentSessionId = null;  // 宿主会话 id
let sessionEnded = false;     // 已发过 session_end，防重复

/**
 * 终止 CLI 进程树。
 * Windows 上适配器 → cmd.exe → codebuddy(node) 三层，child.kill() 只杀 cmd.exe
 * 会留下孤儿 CLI（携带 bypassPermissions 继续运行），必须 taskkill /T /F 全树终止。
 * 宿主 interrupt 流程发完请求仅等 200ms 就强杀适配器，因此这里用 spawnSync 保证
 * 在窗口内同步完成。
 */
function killCliTree(reason) {
  // /T 从 cmd.exe 壳进程向下全树终止（cmd.exe → codebuddy node 孙进程），
  // 不依赖 wmic（Win11 新版已移除）
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
  respondAndExit(reqId, { session_id: currentSessionId, resume_token: lastCbSessionId || undefined });
}

function mapPermissionMode(mode) {
  // 宿主 PermissionMode 白名单 → CodeBuddy CLI --permission-mode
  // ('' / 未传 → bypassPermissions，与 Polaris DEFAULT_SESSION_CONFIG 一致)
  switch (mode) {
    case 'bypassPermissions':
    case 'acceptEdits':
    case 'plan':
    case 'default':
      return mode;
    case 'auto':        // 语义最接近「自动接受编辑」
      return 'acceptEdits';
    case 'dontAsk':     // 不询问直接执行
      return 'bypassPermissions';
    default:
      return 'bypassPermissions';
  }
}

function runSession(params, reqId) {
  const sessionId = params.session_id || 'unknown';
  const message = params.message || '';
  const workDir = params.work_dir || process.cwd();
  const model = params.model || 'hy4-preview';
  const isContinue = params.is_continue || false;
  const resumeToken = params.resume_token;
  const permissionMode = mapPermissionMode(params.permission_mode);

  currentSessionId = sessionId;
  sessionEnded = false;
  toolNames.clear();
  lastAssistantText = null;
  streamedDeltas = false;
  lastCbSessionId = null;

  process.stderr.write(`[Adapter] runSession: sid=${sessionId}, model=${model}, permission=${permissionMode}\n`);

  // 即刻回 session_start：CLI 冷启动 ~73s，此前全程无任何反馈，宿主无法区分慢启动与假死
  emit(sessionId, 'session_start', { engineId: 'codebuddy' });

  const args = ['-p', '--model', model, '--output-format', 'stream-json', '--include-partial-messages'];
  if (isContinue && resumeToken) args.push('--resume', resumeToken);
  args.push('--permission-mode', permissionMode);
  // prompt 不进 argv（Windows ~32k 上限 + cmd.exe 特殊字符展开风险），统一走 stdin

  // env_overrides：宿主显式传入的环境覆盖（测试注入 PATH 用假 CLI 即此通道）
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
      child = spawn('cmd.exe', ['/c', 'codebuddy', ...args], {
        cwd: workDir, env,
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
    } else {
      child = spawn('codebuddy', args, {
        cwd: workDir, env,
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
    }
  } catch (e) {
    endSession('error', reqId, `启动失败: ${e.message}`);
    return;
  }

  currentChild = child;

  // prompt 经 stdin 写入后关闭，CLI 进入非交互执行
  try {
    child.stdin.write(message);
    child.stdin.end();
  } catch (e) {
    process.stderr.write(`[Adapter] stdin 写入失败: ${e.message}\n`);
  }

  let gotResult = false;
  let stdoutBuf = '';

  // 用 data 事件 + 手动分行，避免 readline 在管道模式下不触发 line 事件
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.substring(0, idx).trim();
      stdoutBuf = stdoutBuf.substring(idx + 1);
      if (line && parseLine(line, sessionId)) gotResult = true;
    }
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    let idx;
    while ((idx = stderrBuf.indexOf('\n')) >= 0) {
      const line = stderrBuf.substring(0, idx);
      stderrBuf = stderrBuf.substring(idx + 1);
      if (line) process.stderr.write(`[CodeBuddy] ${line}\n`);
    }
  });

  child.on('close', (code) => {
    if (!gotResult) {
      endSession(code === 0 ? 'completed' : 'error', reqId,
        code !== 0 && code !== null ? `CLI 退出码: ${code}` : undefined);
    } else {
      endSession('completed', reqId);
    }
  });

  child.on('error', (e) => {
    endSession('error', reqId, e.message);
  });
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
        // 宿主 interrupt 后 ~200ms 即强杀适配器进程——立即同步终止 CLI 树并落帧退出
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
    killCliTree('stdin-closed');
  }
  // 会话已结束的正常路径由 respondAndExit 退出；此处兜底退出避免空转进程
  setTimeout(() => process.exit(0), 100);
});
process.stdin.on('end', () => {
  if (currentChild && !sessionEnded) {
    killCliTree('stdin-end');
  }
});

process.on('SIGINT', () => { killCliTree('sigint'); process.exit(0); });
process.on('SIGTERM', () => { killCliTree('sigterm'); process.exit(0); });
process.on('uncaughtException', (e) => {
  process.stderr.write(`[Adapter] ${e.stack}\n`);
  killCliTree('uncaught');
  process.exit(1);
});
process.stdin.resume();
