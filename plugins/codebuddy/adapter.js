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
// call_id → input_json_delta 分片聚合（Anthropic 流协议：tool_use 参数经
// content_block_delta 的 input_json_delta 分片到达，content_block_start 时
// input 恒为空对象——不聚合则前端 ToolCallBlock.input 为空，Edit/Write 的
// file_path/old_string/new_string 全丢，悬浮岛文件变更统计为 0）
const toolInputFrags = new Map();
// content_block index → call_id（input_json_delta 按 index 路由到对应工具）
const blockIndexToCallId = new Map();
// 上一条 assistant 完整消息的正文：codebuddy CLI 会把最终 assistant 消息发两遍
// （流式结束 + result 回放，thinking 内容略有差异导致签名不同），按正文文本去重，
// 否则 UI 渲染出重复的思考/正文块
let lastAssistantText = null;
// 本条消息是否已有 stream_event 增量流出：CLI 在流式增量后会再发一条完整 assistant
// 帧（思考+正文回放），不跳过会与增量内容重复渲染（delta 一对 + 完整帧一对）
let streamedDeltas = false;
let resultHadError = false;  // result 帧 is_error/errors（CLI 执行错误，非进程退出错误）

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
        } else if (e.delta.type === 'input_json_delta' && typeof e.delta.partial_json === 'string') {
          // tool_use 参数分片聚合：按 index 对应的 call_id 累积（index → id 映射
          // 在 content_block_start 时登记）
          const callId = blockIndexToCallId.get(e.index);
          if (callId) {
            const arr = toolInputFrags.get(callId) || [];
            arr.push(e.delta.partial_json);
            toolInputFrags.set(callId, arr);
          }
        }
      }
      if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
        const callId = e.content_block.id || '';
        if (callId) {
          toolNames.set(callId, e.content_block.name || 'unknown');
          blockIndexToCallId.set(e.index, callId);
        }
        emit(sessionId, 'tool_call_start', {
          tool: e.content_block.name || 'unknown',
          args: e.content_block.input || {},
          call_id: callId,
        });
      }
      if (e.type === 'content_block_stop' && typeof e.index === 'number') {
        // 参数分片收齐：拼完整 JSON 后重发 tool_call_start——宿主 appendToolCallBlock
        // 幂等守卫对同 callId 仅回填缺失 input（不重复开卡），Edit/Write 的
        // file_path/old_string/new_string 由此到达前端（悬浮岛变更统计的数据源）
        const callId = blockIndexToCallId.get(e.index);
        const frags = toolInputFrags.get(callId);
        if (callId && frags && frags.length > 0) {
          toolInputFrags.delete(callId);
          blockIndexToCallId.delete(e.index);
          let args = {};
          try { args = JSON.parse(frags.join('')); } catch { /* 参数残缺则保持空对象 */ }
          const name = toolNames.get(callId) || 'unknown';
          emit(sessionId, 'tool_call_start', {
            tool: name,
            args,
            call_id: callId,
          });
        }
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
      // CLI 执行错误（模型不可用/限流等）藏在 result 帧：is_error + errors[]，
      // 不透出则用户看到空回复假成功（429 限流时 errors 带"使用量已超出频率限制"实证）
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
  // 响应帧必须先于 session_end 发出：宿主 reader 收到 session_end 即 break，
  // 后发的响应帧会被丢弃——resume_token 丢失导致续聊退化为新会话（实测根因）
  respondAndExitBegin(reqId, { session_id: currentSessionId, resume_token: lastCbSessionId || undefined });
  emit(currentSessionId, 'session_end', { reason });
  process.exit(0);
}

/** 响应帧写出（不退出——退出由 endSession 尾部统一执行） */
function respondAndExitBegin(id, result) {
  process.stdout.write(JSON.stringify({ id, result }) + '\n');
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
  const model = params.model || 'hy4free';
  const isContinue = params.is_continue || false;
  const resumeToken = params.resume_token;
  const permissionMode = mapPermissionMode(params.permission_mode);
  // 透传宿主 SessionOptions 的字段到 CLI 参数（与 claude 引擎 build_command 对齐）
  const effort = params.effort || '';
  const agent = params.agent || '';
  const systemPrompt = params.system_prompt || '';
  const appendSystemPrompt = params.append_system_prompt || '';
  const additionalDirs = Array.isArray(params.additional_dirs) ? params.additional_dirs : [];
  const allowedTools = Array.isArray(params.allowed_tools) ? params.allowed_tools : [];
  const disallowedTools = Array.isArray(params.disallowed_tools) ? params.disallowed_tools : [];
  // 面板高级配置（params.advanced，CodeBuddy 面板配置中心写入）：
  // maxTurns → --max-turns（防失控轮数上限）；autocompact → --autocompact（上下文压缩窗口）；
  // fallbackModel → --fallback-model（主模型过载/限流自动切换，缓解 429）
  const adv = params.advanced && typeof params.advanced === 'object' ? params.advanced : {};
  const maxTurns = String(adv.maxTurns || '').trim();
  const autocompact = String(adv.autocompact || '').trim();
  const fallbackModel = String(adv.fallbackModel || '').trim();

  currentSessionId = sessionId;
  sessionEnded = false;
  toolNames.clear();
  toolInputFrags.clear();
  blockIndexToCallId.clear();
  lastAssistantText = null;
  streamedDeltas = false;
  resultHadError = false;
  lastCbSessionId = null;

  process.stderr.write(`[Adapter] runSession: sid=${sessionId}, model=${model}, effort=${effort || '-'}, permission=${permissionMode}\n`);

  // 即刻回 session_start：CLI 冷启动 ~73s，此前全程无任何反馈，宿主无法区分慢启动与假死
  emit(sessionId, 'session_start', { engineId: 'codebuddy' });

  const args = ['-p', '--model', model, '--output-format', 'stream-json', '--include-partial-messages'];
  if (isContinue && resumeToken) args.push('--resume', resumeToken);
  args.push('--permission-mode', permissionMode);
  // 努力级别（思考力度）
  if (effort) args.push('--effort', effort);
  // Agent 角色
  if (agent) args.push('--agent', agent);
  // 系统提示词覆盖
  if (systemPrompt) args.push('--system-prompt', systemPrompt);
  // 追加系统提示词
  if (appendSystemPrompt) args.push('--append-system-prompt', appendSystemPrompt);
  // 额外目录
  for (const dir of additionalDirs) {
    if (dir) args.push('--add-dir', dir);
  }
  // 工具白名单/黑名单
  if (allowedTools.length > 0) args.push('--allowedTools', allowedTools.join(','));
  if (disallowedTools.length > 0) args.push('--disallowedTools', disallowedTools.join(','));
  // 面板高级参数（CodeBuddy 独有 CLI 能力）
  if (maxTurns && /^\d+$/.test(maxTurns)) args.push('--max-turns', maxTurns);
  if (autocompact && /^(auto|400k|1m|\d+[km]?)$/i.test(autocompact)) args.push('--autocompact', autocompact);
  if (fallbackModel) args.push('--fallback-model', fallbackModel);
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
  let childClosed = false;   // close 已发生（stdout 可能仍有缓冲未消费）
  let stdoutEnded = false;   // stdout drain 完毕（所有行已消费，lastCbSessionId 定值）
  let closeCode = null;

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
  // stdout end：CLI 输出全部消费完——result 帧（resume_token 采集源）保证已处理。
  // close 事件 ≠ stdout 消费完（Windows 管道缓冲时序）：close 时 result 行可能
  // 仍在缓冲，直接 endSession 会带着空/旧 token 发响应帧——续聊 token 错误
  // （实测：T1 token 采集竞态丢失 → T2 resume 查无会话 → CLI 静默新开会话）。
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
    if (!gotResult) {
      endSession(closeCode === 0 ? 'completed' : 'error', reqId2,
        closeCode !== 0 && closeCode !== null ? `CLI 退出码: ${closeCode}` : undefined);
    } else {
      // result 已收到：执行错误已在 parseLine 内发过 error 帧，此处仅定终态原因
      endSession(resultHadError ? 'error' : 'completed', reqId2);
    }
  };

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
    childClosed = true;
    closeCode = code;
    // stdout 未 drain 完时等待其 end/close（竞态守卫），已 drain 则立即收尾
    if (stdoutEnded) finishSession(reqId);
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
  // stdin EOF（宿主长连接不发 EOF，手动管道测试会发）：
  // - CLI 还在跑：等它自然收尾（close 事件触发 endSession + respondAndExit），
  //   此处仅设兜底定时器防适配器永久空转
  // - 无 CLI：直接退出
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
