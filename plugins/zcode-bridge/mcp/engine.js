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
//   - 新会话  --session-id <temp_id> → session/create
//   - 续聊    --session <temp_id>    → 读 <session-dir>/<temp_id>.json 里的 zcodeSid → resume
//   - 映射落盘 `--session-dir/<temp_id>.json` {temp_id, zcodeSid, ws}
//
// 模型选择（2026-10-28，协议实测定案）：
//   - 宿主把 Polaris Profile 的选择经 env 注入本进程：
//       ANTHROPIC_MODEL   前端选中的模型名（ai_chat_core Custom 引擎分支注入）
//       ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL   Profile 的密钥与端点
//       ZCODE_MODEL_PROVIDER / ZCODE_MODEL / ZCODE_REASONING_LEVEL   显式覆盖（Profile custom_env）
//   - ANTHROPIC_API_KEY+BASE_URL 齐备时：生成「真实 personal 配置 + profile provider」的
//     私有配置文件（不碰用户真实 provider_config.json），经 ZCODE_PERSONAL_PROVIDER_CONFIG_FILE
//     env 注入自持 app-server —— 套餐 Key（bigmodel 控制台签发的 id.secret）与自建端点
//     都走这一条路；自建端点 V4 握手失败自动 fail-open 明发（实测通）。
//   - 无 Profile 端点时：providerId 由 ZCODE_MODEL_PROVIDER 或观察目录解析，仅 setModel
//     切到 ZCode 已注册的 provider（如用户自建的 new-provider）。
//   - 每轮 prompt 都 re-assert setModel（幂等）：会话中途换模型下一轮生效。
//     失败一律降级为「ZCode 默认模型」，绝不中断轮次。
//   - 观察目录 <session-dir>/_zcode_model_catalog.json 记录 {providers:{modelId→providerId},
//     levels:{modelId→reasoningLevel}}，从事件流学习 + 阶梯试错沉淀。
'use strict';

const readline = require('node:readline');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ZCodeClient, readRealPersonalConfig, mergeProfileProvider, resolveModelSelection } = require('./zcode-core.js');

// ── 命令行解析（对齐 PluginEngineRunner.build_command 生产方式）──────────
// node engine.js [--mode rpc] [--session-dir <d>] [--session-id <id> | --session <id>] [--workdir <d>]
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

// 会话模式（ZCode 侧权限）：桥接会话无人值守、无 permission 应答方，默认 yolo。
// 与面板 server.js 的 ZBRIDGE_DEFAULT_MODE 同名同义，可 env 收紧。
const SESSION_MODE = process.env.ZBRIDGE_DEFAULT_MODE || 'yolo';

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

// ── 模型观察目录（跨进程/跨会话沉淀 modelId→providerId 与 reasoningLevel）──
const CATALOG_PATH = sessionDir ? path.join(sessionDir, '_zcode_model_catalog.json') : null;
function readCatalog() {
  if (!CATALOG_PATH) return { providers: {}, levels: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    return { providers: raw.providers || {}, levels: raw.levels || {} };
  } catch {
    return { providers: {}, levels: {} };
  }
}
function writeCatalog(catalog) {
  if (!CATALOG_PATH) return;
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  } catch (e) {
    process.stderr.write(`[engine] 写模型目录失败: ${e.message}\n`);
  }
}
function learnProvider(catalog, providerId, modelId) {
  if (!providerId || !modelId || catalog.providers[modelId] === providerId) return;
  catalog.providers[modelId] = providerId;
  writeCatalog(catalog);
}
function learnLevel(catalog, modelId, level) {
  if (!modelId || !level || catalog.levels[modelId] === level) return;
  catalog.levels[modelId] = level;
  writeCatalog(catalog);
}

// ── 模型选择解析 + 私有 provider 配置 ─────────────────────────────────────
const catalog = readCatalog();
let lastApplied = null; // 当前 zcodeSid 上已成功的 setModel（避免每轮重复调用）
let lastFailedKey = null; // 刚失败的 (providerId,modelId)：本轮内不重复撞同一堵墙

// ANTHROPIC_API_KEY + BASE_URL 齐备 → 生成私有 personal 配置并自持注入。
// 返回 {configPath, providerId} 或 null（无 Profile 端点，走观察目录路径）。
function maybeGenerateProfileProviderConfig() {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || '').trim();
  const modelId = (process.env.ZCODE_MODEL || process.env.ANTHROPIC_MODEL || '').trim();
  if (!apiKey || !baseUrl || !modelId) return null;
  const providerId = 'polaris-profile';
  const merged = mergeProfileProvider(readRealPersonalConfig(), {
    providerId,
    providerName: 'Polaris Profile',
    baseUrl,
    apiKey,
    models: [modelId],
  });
  const dir = sessionDir || os.tmpdir();
  const configPath = path.join(dir, '_polaris_profile_provider.json');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(merged));
  } catch (e) {
    process.stderr.write(`[engine] 写私有 personal 配置失败: ${e.message}（降级为观察目录路径）\n`);
    return null;
  }
  return { configPath, providerId };
}

const profileProvider = maybeGenerateProfileProviderConfig();
// 解析优先级：显式 ZCODE_MODEL_PROVIDER > Profile 模式固定 providerId > 观察目录
const effectiveProviderEnv = process.env.ZCODE_MODEL_PROVIDER
  ? process.env.ZCODE_MODEL_PROVIDER
  : profileProvider
    ? profileProvider.providerId
    : '';
function resolveSelection() {
  const sel = resolveModelSelection(
    { ZCODE_MODEL: process.env.ZCODE_MODEL, ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL, ZCODE_MODEL_PROVIDER: effectiveProviderEnv },
    catalog.providers,
  );
  return sel;
}

// 自持 app-server：引擎路径不再依赖 9862 面板桥（面板桥与引擎各自独立实例）
const client = new ZCodeClient({
  workspacePath: DEFAULT_WS,
  personalProviderConfigFile: profileProvider ? profileProvider.configPath : null,
});

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

// ── setModel 应用（阶梯 + 降级）───────────────────────────────────────────
// 档位阶梯：ZCODE_REASONING_LEVEL 显式 > 目录沉淀 > high/medium/low。
// GLM-5.3 / deepseek-v4 等模型 setModel 必须带档位（协议实测）；
// 错误形态：缺档位 → "Reasoning level is required"；档位不支持 → "not supported"。
async function applyModelSelection(sessionId) {
  const sel = resolveSelection();
  if (!sel) return; // 无选择 → 继承 ZCode 默认（不报错）
  const key = `${sel.providerId}/${sel.modelId}`;
  if (lastApplied && `${lastApplied.providerId}/${lastApplied.modelId}` === key) return; // 已生效
  if (lastFailedKey === key) return; // 本进程已试败：不再撞墙，降级默认

  const candidates = [];
  const cached = catalog.levels[sel.modelId];
  if (cached) candidates.push(cached);
  const envLevel = (process.env.ZCODE_REASONING_LEVEL || '').trim();
  if (envLevel && !candidates.includes(envLevel)) candidates.push(envLevel);
  for (const lv of ['high', 'medium', 'low']) if (!candidates.includes(lv)) candidates.push(lv);

  // 先无档位直试（部分模型不需要档位），失败再按阶梯带档位重试
  const attempts = [{ level: null }, ...candidates.map((lv) => ({ level: lv }))];
  for (const attempt of attempts) {
    try {
      await client.setModel(sessionId, sel.providerId, sel.modelId, {
        reasoningLevel: attempt.level,
        persistAsWorkspaceLastUsed: false,
      });
      lastApplied = sel;
      if (attempt.level) learnLevel(catalog, sel.modelId, attempt.level);
      process.stderr.write(`[engine] setModel → ${key}${attempt.level ? ` (level=${attempt.level})` : ''}\n`);
      return;
    } catch (e) {
      const msg = e.messageText || e.message || '';
      const needLevel = /reasoning level is required/i.test(msg);
      const badLevel = /not supported/i.test(msg) && /reasoning/i.test(msg);
      if (needLevel || badLevel) continue; // 换下一档位
      process.stderr.write(`[engine] setModel ${key} 失败（降级 ZCode 默认）: ${msg.slice(0, 200)}\n`);
      lastFailedKey = key;
      return;
    }
  }
  process.stderr.write(`[engine] setModel ${key} 各档位均被拒（降级 ZCode 默认）\n`);
  lastFailedKey = key;
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
  // 模型观察：任何携带 modelId+providerId 的事件都沉淀进目录（续聊冷启动后的解析依据）
  if (p.modelId && p.providerId) learnProvider(catalog, p.providerId, p.modelId);
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

async function drainZcode(zcodeSid, cursor) {
  // 收尾依赖 sessionFinalized（最终正文轮 turn-complete 才置位），
  // 工具轮的静默中间窗口（等模型下一轮思考）不会误判收尾。
  // 超时是「空闲型」：每收到事件就重置——agentic 长任务（多工具轮）只要还在
  // 产出事件就继续等；只有 ZCode 侧异常停流（无最终收尾）才在 180s 后兜底退出，
  // 避免绝对上限把真实长任务砍断在半截。
  const idleMs = 180000;
  let lastEventAt = Date.now();
  while (Date.now() - lastEventAt < idleMs) {
    if (sessionFinalized || aborted) break;
    const { cursor: next, events } = client.drainEvents(cursor);
    cursor = next;
    if (events.length > 0) lastEventAt = Date.now();
    if (process.env.ZCODE_DEBUG) {
      process.stderr.write(`[engine] drain cursor=${cursor} n=${events.length} kinds=${events.map((e) => (e.payload || {}).kind || e.kind).join(',')}\n`);
    }
    for (const evt of events) zcodeEventToPi(evt);
    await new Promise((res) => setTimeout(res, 300));
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
    // 新会话：create（ZCode 异步落盘）→ resume 激活 → setModel → send。
    // ZCode 活性契约：session/create 后会话不在活跃表，直接 send 会
    // "Session is not active"（实测 -32004）；create 后必须 resume 先行，
    // resume 可能因落盘未完成短暂失败，重试数秒。
    const r = await client.request('session/create', {
      workspace: { workspacePath: DEFAULT_WS, workspaceKey: DEFAULT_WS },
      mode: SESSION_MODE,
    });
    if (r.error || !(r.result && (r.result.sessionId || (r.result.session && r.result.session.sessionId)))) {
      const errMsg = (r.error && `${r.error.message} (${r.error.code})`) || 'create 未返回 sessionId';
      process.stderr.write(`[engine] create 失败: ${errMsg}\n`);
      emitMessageStart();
      emitDelta(`⚠ 创建 ZCode 会话失败: ${errMsg}`);
      emitMessageEnd();
      emitTurnEnd();
      emitAgentEnd();
      return;
    }
    zcodeRealSid = r.result.sessionId || (r.result.session && r.result.session.sessionId);
    writeMapping(zcodeRealSid, DEFAULT_WS);
    emitResponse(tempId, true, { command: 'session_id', sessionId: zcodeRealSid });

    // 激活等待：resume 新会话可能短暂 "Session not found"，最多重试 ~10s
    let active = false;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const rr = await client.request('session/resume', {
        sessionId: zcodeRealSid,
        workspace: { workspacePath: DEFAULT_WS, workspaceKey: DEFAULT_WS },
      });
      if (!rr.error) { active = true; break; }
      process.stderr.write(`[engine] 激活 resume #${attempt} 失败 → ${String(rr.error.message || '').slice(0, 120)}\n`);
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

    try { await client.subscribe(zcodeRealSid); } catch (e) {
      process.stderr.write(`[engine] 订阅事件流失败: ${e.message}（无流式输出，仅收尾帧）\n`);
    }
    await applyModelSelection(zcodeRealSid);
    await sendAndDrain(message);
  } else {
    // 续聊（冷启动后先 resume 激活历史会话）
    const rr = await client.request('session/resume', {
      sessionId: zcodeRealSid,
      workspace: { workspacePath: restoredWs || DEFAULT_WS, workspaceKey: restoredWs || DEFAULT_WS },
    });
    if (rr.error) process.stderr.write(`[engine] resume 失败（继续尝试发送）: ${String(rr.error.message || '').slice(0, 160)}\n`);
    try { await client.subscribe(zcodeRealSid); } catch (e) {
      process.stderr.write(`[engine] 订阅事件流失败: ${e.message}\n`);
    }
    await applyModelSelection(zcodeRealSid);
    await sendAndDrain(message);
  }
  // abort/异常路径下正文流可能未关，统一兜底收尾（正常路径 sessionFinalized 已关过，此为空操作）
  closeMessageIfOpen();
  emitAgentEnd();
}

async function sendAndDrain(message) {
  try {
    await client.sendMessage(zcodeRealSid, message);
  } catch (e) {
    // 错误也走正文流：必须先确保 message 已开启，否则 message_update 是无 message_start 的裸帧
    ensureMessageOpen();
    emitDelta(`⚠ 发送失败: ${e.message}`);
    closeMessageIfOpen();
    return;
  }
  await drainZcode(zcodeRealSid, -1);
}

// ── stdin 主循环 ─────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let seq = 0;
let turnInFlight = false; // 有 prompt 在处理中（drain 未收尾）
let stdinClosed = false; // 宿主已关闭 stdin（本轮结束后退出）

function shutdown(exitCode = 0) {
  // 引擎自持 app-server 子进程：退出时必须回收，否则宿主杀掉引擎后留下孤儿
  // app-server（旧架构 app-server 常驻在 9862 面板桥服务里，无此问题）。
  client.dispose().finally(() => process.exit(exitCode));
}

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
    turnInFlight = true;
    try {
      await handlePrompt(msg.message);
    } catch (e) {
      process.stderr.write(`[engine] 处理失败: ${e.message}\n`);
      emitResponse(reqId, false, { command: 'prompt', error: e.message });
    } finally {
      turnInFlight = false;
      if (stdinClosed) {
        process.stderr.write('[engine] 在飞轮次已收尾，退出并回收 app-server\n');
        shutdown();
      }
    }
  }
});

rl.on('close', () => {
  // 宿主关闭 stdin：在飞轮次跑完再退（立即退会砍断正在 drain 的 turn），
  // 空闲状态则直接退出。
  stdinClosed = true;
  if (!turnInFlight) {
    process.stderr.write('[engine] stdin 关闭（空闲），退出并回收 app-server\n');
    shutdown();
  }
});
process.on('exit', () => {
  try { if (client.child && !client._exited) client.child.kill(); } catch { /* 尽力而为 */ }
});
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => shutdown());
}

process.stderr.write(
  `[engine] ready mode=${mode} tempId=${tempId} resume=${isResume} zcodeSid=${zcodeRealSid || '(new)'} ws=${DEFAULT_WS}`
    + ` model=${(process.env.ZCODE_MODEL || process.env.ANTHROPIC_MODEL || '').trim() || '(继承默认)'}`
    + ` profileProvider=${profileProvider ? profileProvider.providerId : '(无)'}\n`,
);
