// ZCode PiRpc 引擎桥（正式版）
//
// 作用：把 ZCode app-server 会话暴露为 Polaris PiRpc 插件引擎的子进程。
// 被 PluginEngineRunner spawn，协议对齐 pi_parser / plugin_engine.rs：
//   - stdin 收   {"id":"req-1","type":"prompt","message":"..."}  |  {"type":"abort"}
//   - stdout 发  {type:"session",version:3,id,cwd}  会话头
//             +  {type:"agent_start"} {type:"turn_start"} {type:"message_start"}
//             +  {type:"message_update" assistantMessageEvent:{type:"text_delta",delta}}
//             +  {type:"message_end"} {type:"turn_end"} {type:"agent_end"}
//             +  {type:"response"}   ack
//
// ZCode 协议边界（实测 sess_43b885b5 全量 1529 事件确认）：
//   - text-delta 的 payload.kind 细分：reasoning_delta / text_delta / tool_input_start|delta|end / tool_call
//   - 工具执行事件（scheduled/started/result/progress/batch/tool_result）以 `misc` kind 送达
//   - result 真实结构为 {toolCallId, result:{success, content}}（嵌套，非扁平）
//   - turn-complete 带 stopReason："tool-calls"=工具轮（正文在后续轮），"stop"=最终正文轮
//
// 会话管理：
//   - 新会话  --session-id <temp_id> → 9862 桥 POST /api/chat/create (guarded)
//   - 续聊    --session <temp_id>    → 读 <session-dir>/<temp_id>.json 里的 zcodeSid → resume
//   - 映射落盘 `--session-dir/<temp_id>.json` {temp_id, zcodeSid, ws}（与 PiRpc 引擎 session_paths 对应）
//
// 复用 9862 生产桥（已在跑的 zcode-bridge-http 服务）作为 ZCode 会话读写通道。
'use strict';

const readline = require('node:readline');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ── 命令行解析（对齐 PluginEngineRunner.build_command 生产方式）──────────
// node engine.js [--mode rpc] [--session-dir <d>] [--session-id <id> | --session <id>] [--session-dir <d>]
const argv = process.argv.slice(2);
function getArg(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const isResume = argv.includes('--session');
const tempId = getArg(isResume ? '--session' : '--session-id') || `zce-${Date.now()}`;
const sessionDir = getArg('--session-dir');
const workDir = getArg('--workdir');
const mode = getArg('--mode') || 'rpc';

// 9862 生产桥（同插件 services 端口）
const BRIDGE = process.env.ZCODE_BRIDGE_URL || 'http://127.0.0.1:9862';
// 默认工作区：Polaris 把主对话工作区设为 spawn cwd（configure_command.current_dir）；
// 显式 --workdir 兜底，其次回退默认项目。
let DEFAULT_WS = (() => {
  if (workDir && workDir.trim()) return workDir;
  try {
    return process.cwd() || 'D:/space/base/Polaris';
  } catch {
    return 'D:/space/base/Polaris';
  }
})();

// ── session-dir 映射文件（temp_id ↔ zcodeSid）────────────────────────────
// 路径：<session-dir>/<temp_id>.json  （与 PiRpc 引擎 session_paths 语义对应）
function mappingPath() {
  if (!sessionDir) return null;
  return path.join(sessionDir, `${tempId}.json`);
}
function readMapping() {
  const p = mappingPath();
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
function writeMapping(zcodeSid, ws) {
  const p = mappingPath();
  if (!p) return;
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ temp_id: tempId, zcodeSid, ws }, null, 2));
  } catch (e) {
    process.stderr.write(`[engine] 写映射失败: ${e.message}\n`);
  }
}

// 恢复映射（续聊冷启动）：优先用已落盘的 zcodeSid + ws
let restored = readMapping();
let zcodeRealSid = null; // 真实 ZCode sessionId（create 后持有，或从映射恢复）
let restoredWs = null;
if (restored && restored.zcodeSid) {
  zcodeRealSid = restored.zcodeSid;
  if (restored.ws) restoredWs = restored.ws;
}

// 续聊防护：如果 asked to resume 但没有可恢复的映射，绝不静默新建会话。
// 主对话里这表现为「在会话 A 发消息却悄悄开了 B」，是续聊最容易踩的坑。
if (isResume && !zcodeRealSid) {
  process.stderr.write(`[engine] 续聊请求但映射缺失 tempId=${tempId} sessionDir=${sessionDir || '(无)'}　→ 拒绝并退出，避免静默新建\n`);
  process.exit(2);
}

// ── HTTP 到 9862 生产桥 ──────────────────────────────────────────────────
function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request(
      BRIDGE + pathname,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            const o = JSON.parse(b);
            o._status = res.statusCode;
            resolve(o);
          } catch {
            resolve({ ok: false, error: b, _status: res.statusCode });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
function get(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get(BRIDGE + pathname, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            const o = JSON.parse(b);
            o._status = res.statusCode;
            resolve(o);
          } catch {
            resolve({ ok: false, error: b, _status: res.statusCode });
          }
        });
      })
      .on('error', reject);
  });
}

// ── stdout PiRpc 帧输出 ───────────────────────────────────────────────────
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let turnCounter = 0;

function emitSessionHeader() {
  out({ type: 'session', version: 3, id: tempId, cwd: restoredWs || DEFAULT_WS });
}
function emitAgentStart() {
  out({ type: 'agent_start' });
}
function emitTurnStart() {
  out({ type: 'turn_start', turn_number: ++turnCounter });
}
function emitMessageStart() {
  out({ type: 'message_start', message: { id: `m-${Date.now()}`, role: 'assistant', type: 'text' } });
}
function emitDelta(text) {
  out({
    type: 'message_update',
    message: { id: `msg-${Date.now()}`, type: 'text' },
    assistantMessageEvent: { type: 'text_delta', delta: text },
  });
}
function emitThinkingDelta(text) {
  out({
    type: 'message_update',
    message: { id: `msg-${Date.now()}`, type: 'thinking' },
    assistantMessageEvent: { type: 'thinking_delta', delta: text },
  });
}
function emitMessageEnd() {
  out({ type: 'message_end', message: { id: `m-${Date.now()}`, role: 'assistant', content: '<done>' } });
}
function emitTurnEnd() {
  out({ type: 'turn_end' });
}
function emitAgentEnd() {
  out({ type: 'agent_end' });
}
function emitToolStart(callId, tool, input) {
  out({
    type: 'message_update',
    message: { id: `msg-${Date.now()}`, type: 'tool_call' },
    assistantMessageEvent: {
      type: 'toolcall_start',
      tool_call_id: callId,
      tool,
      input: input && typeof input === 'object' ? input : { _raw: String(input || '') },
    },
  });
}
function emitToolEnd(callId, tool, output, success) {
  out({
    type: 'message_update',
    message: { id: `msg-${Date.now()}`, type: 'tool_call' },
    assistantMessageEvent: {
      type: 'toolcall_end',
      tool_call_id: callId,
      tool,
      output: String(output || ''),
      success: typeof success === 'boolean' ? success : true,
    },
  });
}
function emitResponse(reqId, success, data) {
  out({ type: 'response', id: reqId, command: (data && data.command) || 'prompt', success, data });
}

// ── ZCode 事件 → PiRpc 帧 ─────────────────────────────────────────────────
// 状态机要点（对齐 plans/zcode-engine-tool-stream.md）：
//   - text-delta 的 payload.kind 区分：reasoning_delta（推理）/ text_delta（正文）/ 工具生命周期
//   - 工具生命周期：tool_input_start → tool_call(input) → scheduled → started → result(output)
//   - turn-complete 按 stopReason 判定收尾：tool-calls 轮不收尾，等最终正文轮让 messageOpen 自然关闭
let messageOpen = false; // 当前是否有未关闭的 message（正文流）
let toolBuffer = new Map(); // toolCallId → {name, input, output, success}
let sawToolRound = false; // 本轮是否发生过工具调用轮（影响收尾判定）
let sessionFinalized = false; // 最终正文轮已收尾（唯一允许 drain 结束的标志）
let aborted = false; // 宿主下发 abort（中断当前 drain，等待下一轮 prompt 复位）

function ensureMessageOpen() {
  if (!messageOpen) {
    // turn 随首段内容惰性开启：纯工具中转轮不产生空 turn（turn_start/turn_end 成对）
    emitTurnStart();
    emitMessageStart();
    messageOpen = true;
  }
}
function closeMessageIfOpen() {
  if (messageOpen) {
    emitMessageEnd();
    emitTurnEnd();
    messageOpen = false;
    turnCounter = 0; // 单轮计数复位，下一轮从 1 起（PiRpc 消费方按 turn_number 归组）
  }
}

const TOOL_NAME_HINT = (input) => {
  if (!input || typeof input !== 'object') return 'tool';
  if (typeof input.command === 'string') return 'bash';
  if (typeof input.name === 'string') return input.name;
  return 'tool';
};

function zcodeEventToPi(evt) {
  const p = evt.payload || {};
  if (evt.kind === 'turn-started') {
    // 每轮开始：上一轮正文流若未关（异常/工具轮残留），先关掉。不在此 emitTurnStart——
    // 等首段正文才开启 turn，保证纯工具中转轮不产生空 turn。
    closeMessageIfOpen();
  } else if (evt.kind === 'text-delta') {
    const kind = p.kind || '';
    if (kind === 'reasoning_delta') {
      // 推理 → thinking_delta（前端折叠区），不进入正文流。
      if (typeof p.delta === 'string' && p.delta.length > 0) emitThinkingDelta(p.delta);
    } else if (kind === 'tool_input_start') {
      // 工具输入开始：登记 callId，等 tool_call 补全 input
      const cid = p.toolCallId || '';
      if (cid && !toolBuffer.has(cid)) toolBuffer.set(cid, { name: '', input: {}, output: '', success: true });
    } else if (kind === 'tool_input_delta' || kind === 'tool_input_end') {
      // 工具输入流片段：完整 input 由 tool_call 事件提供，绝不能当正文流出
    } else if (kind === 'tool_call') {
      // 工具调用声明（含完整 input）；name 从 toolName 或 input 推断
      const cid = p.toolCallId || '';
      const rec = toolBuffer.get(cid) || {};
      rec.name = p.toolName || TOOL_NAME_HINT(p.input) || rec.name;
      if (p.input) rec.input = p.input;
      toolBuffer.set(cid, rec);
    } else {
      // 正文：进入正文流才会 emitTurnStart + message_start
      if (typeof p.delta === 'string' && p.delta.length > 0) {
        ensureMessageOpen();
        emitDelta(p.delta);
      }
    }
  } else if (evt.kind === 'misc') {
    // 工具执行事件以 `misc` kind 送达（payload.kind：scheduled/started/result/batch/progress/tool_result）
    const kind = p.kind || '';
    if (kind === 'scheduled') {
      // 已排入执行队列：补 toolName（input 可能被省略）
      const cid = p.toolCallId || '';
      if (cid && p.toolName) {
        const rec = toolBuffer.get(cid) || {};
        rec.name = p.toolName;
        toolBuffer.set(cid, rec);
      }
    } else if (kind === 'started') {
      // 工具开始执行：emit toolcall_start（带上 input）
      const cid = p.toolCallId || '';
      const rec = toolBuffer.get(cid) || { name: p.toolName || 'tool', input: {} };
      if (p.toolName) rec.name = p.toolName;
      toolBuffer.set(cid, rec);
      emitToolStart(cid, rec.name, rec.input);
    } else if (kind === 'result') {
      // 工具完成：emit toolcall_end；实测 result 形如 {toolCallId, result:{success, content}}，兼容扁平结构
      const cid = p.toolCallId || '';
      const rec = toolBuffer.get(cid) || { name: p.toolName || 'tool', input: {} };
      const rj = p.result && typeof p.result === 'object' ? p.result : p;
      rec.output = String(rj.content ?? rj.output ?? '');
      if (typeof rj.success === 'boolean') rec.success = rj.success;
      toolBuffer.set(cid, rec);
      emitToolEnd(cid, rec.name, rec.output, rec.success);
      // 结果已发出，条目即废弃（每个 callId 只有一次 result）；缓冲在 handlePrompt 开头整体复位
      toolBuffer.delete(cid);
    }
    // batch / progress / tool_result / 空 kind 等 → 忽略（结果已由 result 处理）
  } else if (evt.kind === 'turn-complete') {
    const stopReason = p.stopReason || '';
    const hasContent = typeof p.content === 'string' && p.content.length > 0;
    if (stopReason === 'tool-calls') {
      // 工具调用轮：本轮结束但正文在后续轮，不收尾。
      // 注意：不能在这里清 toolBuffer——scheduled/started/result 在 turn-complete
      // 之后才到，started 要靠缓冲里的 input 发 toolcall_start（实测踩坑）。
      sawToolRound = true;
    } else if (hasContent) {
      // 最终正文轮：关闭当前消息，标记会话已收尾。
      closeMessageIfOpen();
      sessionFinalized = true;
    }
    // 空 content 且非工具轮 → 纯推理收尾（无正文），也关闭以防悬挂。
    // 工具轮后的空 content（异常）不应置 sessionFinalized——可能还有下一轮。
    if (!hasContent && stopReason !== 'tool-calls') {
      closeMessageIfOpen();
      sessionFinalized = true;
    }
  }
}

async function drainZcode(zcodeSess, cursor) {
  // 收尾依赖 sessionFinalized（最终正文轮 turn-complete 才置位），
  // 工具轮的静默中间窗口（等模型下一轮思考）不会误判收尾。
  // 超时是「空闲型」：每收到事件就重置——agentic 长任务（多工具轮）只要还在
  // 产出事件就继续等；只有 ZCode 侧异常停流（无最终收尾）才在 180s 后兜底退出，
  // 避免绝对上限把真实长任务砍断在半截。
  const idleMs = 180000;
  let lastEventAt = Date.now();
  while (Date.now() - lastEventAt < idleMs) {
    if (sessionFinalized || aborted) break;
    const r = await get(`/api/chat/events?sessionId=${encodeURIComponent(zcodeSess)}&cursor=${cursor}`);
    if (r.ok) {
      cursor = r.cursor;
      const evts = r.events || [];
      if (evts.length > 0) lastEventAt = Date.now();
      if (process.env.ZCODE_DEBUG) {
        process.stderr.write(`[engine] drain cursor=${cursor} n=${evts.length} kinds=${evts.map((e) => (e.payload || {}).kind || e.kind).join(',')}\n`);
      }
      for (const evt of evts) zcodeEventToPi(evt);
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  return cursor;
}

// ── 一轮 prompt 处理 ──────────────────────────────────────────────────────
async function handlePrompt(message) {
  emitSessionHeader();
  emitAgentStart();
  messageOpen = false;
  toolBuffer.clear();
  sawToolRound = false;
  sessionFinalized = false;
  aborted = false;

  if (!zcodeRealSid) {
    // 新会话：create（ZCode 异步落盘）→ resume 激活 → send。
    // ZCode 活性契约：session/create 后会话不在活跃表，直接 send 会
    // "Session is not active"（实测 -32004）；create 后必须 resume 先行，
    // resume 可能因落盘未完成短暂失败，重试数秒。
    // 权限模式不在此指定（单一权威在桥 server.js 的 DEFAULT_MODE，可 env 覆盖）——
    // engine 硬编码会盖掉桥的决策。当前桥默认 yolo（无人值守无 permission 应答方）。
    const r = await post('/api/chat/create', { workspacePath: DEFAULT_WS });
    process.stderr.write(`[engine] create → ${JSON.stringify({ ok: r.ok, sessionId: r.sessionId, error: r.error || '', _status: r._status })}\n`);
    if (!r.ok || !r.sessionId) {
      emitMessageStart();
      emitDelta(`⚠ 创建 ZCode 会话失败: ${r.error || '未知'}`);
      emitMessageEnd();
      emitTurnEnd();
      emitAgentEnd();
      return;
    }
    zcodeRealSid = r.sessionId;
    writeMapping(zcodeRealSid, DEFAULT_WS);
    emitResponse(tempId, true, { command: 'session_id', sessionId: zcodeRealSid });

    // 激活等待：resume 新会话可能短暂 "Session not found"，最多重试 ~10s
    let active = false;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const rr = await post('/api/chat/resume', { sessionId: zcodeRealSid, workspacePath: DEFAULT_WS });
      process.stderr.write(`[engine] 激活 resume #${attempt} → ${JSON.stringify({ ok: rr.ok, error: rr.error || '' })}\n`);
      if (rr.ok) { active = true; break; }
      await new Promise((res) => setTimeout(res, 1000));
    }
    if (!active) {
      emitMessageStart();
      emitDelta(`⚠ ZCode 会话激活失败: ${zcodeRealSid}`);
      emitMessageEnd();
      emitTurnEnd();
      emitAgentEnd();
      return;
    }

    await sendAndDrain(message, 0);
  } else {
    // 续聊（冷启动后先 resume 激活历史会话）
    const rr = await post('/api/chat/resume', { sessionId: zcodeRealSid, workspacePath: restoredWs || DEFAULT_WS });
    process.stderr.write(`[engine] resume → ${JSON.stringify({ ok: rr.ok, error: rr.error || '', _status: rr._status })}\n`);
    await sendAndDrain(message, 0);
  }
  // abort/异常路径下正文流可能未关，统一兜底收尾（正常路径 sessionFinalized 已关过，此为空操作）
  closeMessageIfOpen();
  emitAgentEnd();
}

async function sendAndDrain(message, cursor) {
  const r = await post('/api/chat/send', { sessionId: zcodeRealSid, content: message, workspacePath: DEFAULT_WS });
  process.stderr.write(`[engine] send → ${JSON.stringify({ ok: r.ok, cursor: r.cursor, error: r.error || '', _status: r._status })}\n`);
  if (!r.ok) {
    // 错误也走正文流：必须先确保 message 已开启，否则 message_update 是无 message_start 的裸帧
    ensureMessageOpen();
    emitDelta(`⚠ 发送失败: ${r.error || '未知'}`);
    closeMessageIfOpen();
    return;
  }
  await drainZcode(zcodeRealSid, r.cursor);
}

// ── stdin 主循环 ─────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let seq = 0;

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.type === 'abort') {
    // 置位让 drainZcode 尽快退出并由 handlePrompt 收尾帧；宿主 kill 仍是最终兜底。
    aborted = true;
    process.stderr.write('[engine] abort 收到，等待当前 drain 退出\n');
    return;
  }
  if (msg.type === 'prompt' && typeof msg.message === 'string') {
    const reqId = msg.id || `req-${++seq}`;
    try {
      await handlePrompt(msg.message);
    } catch (e) {
      process.stderr.write(`[engine] 处理失败: ${e.message}\n`);
      emitResponse(reqId, false, { command: 'prompt', error: e.message });
    }
  }
});

process.stderr.write(
  `[engine] ready mode=${mode} tempId=${tempId} resume=${isResume} zcodeSid=${zcodeRealSid || '(new)'} ws=${DEFAULT_WS}\n`,
);