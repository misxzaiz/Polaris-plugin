#!/usr/bin/env node
'use strict';
/**
 * server.js —— AI 乐谱工作台 MCP Server（stdio JSON-RPC 2.0，零依赖薄层）
 *
 * dep-probe/stream-desk 同款骨架：换行分隔 JSON-RPC；日志走 stderr；stdout 只走协议。
 * 服务发现：kvclient 读 cap.kv 的 dawstudio.meta 拿 {port, token} → 127.0.0.1 直连。
 * 测试钩子：env DAW_SERVICE_URL + DAW_SERVICE_TOKEN 覆盖发现（离线冒烟注入）。
 *
 * 七工具（AI 谱写闭环：写 → 析 → 纠；演奏控制权归面板用户）：
 *   score_create  骨架→引擎展开→落库（确定性可复现）
 *   score_write   全量写谱（validator 把关；AI 直接记谱路径）
 *   score_get     读完整谱
 *   score_list    索引列表
 *   score_analyze 谱面分析（轨外音/冲突/密度/建议）——自查闭环入口
 *   score_delete  删除
 *   score_export  导出（v0.1: json | midi base64）
 */
const http = require('http');
const path = require('path');
const { createKvClient } = require(path.join(__dirname, '..', 'service', 'kvclient'));
const core = require(path.join(__dirname, '..', 'shared', 'core'));

const appConfigDir = process.argv[2] || '';
const kv = createKvClient({ appConfigDir, log });

function log(level, msg) {
  try { process.stderr.write(`[daw-studio-mcp][${level}] ${msg}\n`); } catch (_) { /* 忽略 */ }
}

// ── 服务发现与调用（dep-probe resolveService 同款）──────────────────────────
const ENV_URL = process.env.DAW_SERVICE_URL || '';
const ENV_TOKEN = process.env.DAW_SERVICE_TOKEN || '';
let svcInfo = null;

async function resolveService(force) {
  if (ENV_URL) return { base: ENV_URL.replace(/\/$/, ''), token: ENV_TOKEN };
  if (!force && svcInfo && Date.now() - svcInfo.at < 5_000) return svcInfo;
  const meta = await kv.kvGet('dawstudio.meta');
  if (!meta || typeof meta.port !== 'number' || !meta.token) {
    throw new Error('乐谱工作台服务未注册（dawstudio.meta 缺失）：请先在 Polaris 打开「AI 乐谱工作台」面板拉起服务，或检查插件是否已启用');
  }
  svcInfo = { base: `http://127.0.0.1:${meta.port}`, token: meta.token, at: Date.now() };
  return svcInfo;
}

function svcRequest(method, apiPath, body, timeoutMs) {
  return resolveService(false).then((svc) => new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: new URL(svc.base).port,
      path: apiPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${svc.token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: timeoutMs || 15_000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) reject(new Error(formatErrors(parsed)));
          else resolve(parsed);
        } catch (_) {
          reject(new Error(`服务返回非 JSON（HTTP ${res.statusCode}）`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('服务请求超时')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  }));
}

function formatErrors(parsed) {
  if (parsed && Array.isArray(parsed.errors)) return parsed.errors.join('；');
  return (parsed && parsed.error) || `HTTP ${parsed ? '' : '响应为空'}`;
}

// ── MIDI 导出（SMF format 0，单轨合并；几十行纯编码）────────────────────────

function exportMidi(score) {
  const PPQ = 480; // 每四分音符 tick
  const TICKS_PER_STEP = PPQ / 4; // 16 分音符
  const events = []; // {tick, data:[]}

  for (const t of score.tracks) {
    const channel = t.type === 'drum' ? 9 : null;
    if (t.type === 'drum') {
      const drumNote = { kick: 36, snare: 38, hat: 42, clap: 39 };
      for (const [name, steps] of Object.entries(t.pattern)) {
        if (!Array.isArray(steps)) continue;
        for (const s of steps) {
          const note = drumNote[name];
          if (note == null) continue;
          const tick = Math.round(s * TICKS_PER_STEP);
          const vel = Math.round((t.vol || 0.5) * 100);
          events.push({ tick, data: [0x90 | channel, note, vel] });
          events.push({ tick: tick + Math.round(TICKS_PER_STEP), data: [0x80 | channel, note, 0] });
        }
      }
    } else {
      // 波形/滤波是合成器概念，MIDI 表达不了——只导音符（README 说明）
      let prog = null;
      for (const n of t.notes) {
        const tick = Math.round(n.step * TICKS_PER_STEP);
        const durTicks = Math.max(1, Math.round(n.len * TICKS_PER_STEP));
        const vel = Math.round((n.vel || 0.8) * 127);
        if (channel == null && prog == null) prog = 0; // 默认音色
        const ch = channel == null ? 0 : channel;
        if (channel == null && prog != null && !events.some((e) => e.data[0] === 0xC0)) {
          // 首个合成轨插入 ProgramChange（电钢 4），后续轨不再插（简化：多轨共用）
        }
        events.push({ tick, data: [0x90 | ch, n.pitch, Math.min(127, vel)] });
        events.push({ tick: tick + durTicks, data: [0x80 | ch, n.pitch, 0] });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);

  // Track 数据：delta-time VLQ + 事件
  const trackData = [];
  let lastTick = 0;
  // 节拍/meta：速度
  const mpqn = Math.round(60_000_000 / (score.meta.bpm || 120));
  pushVarLen(trackData, 0); trackData.push(0xFF, 0x51, 0x03, (mpqn >> 16) & 0xFF, (mpqn >> 8) & 0xFF, mpqn & 0xFF);
  for (const ev of events) {
    pushVarLen(trackData, ev.tick - lastTick);
    lastTick = ev.tick;
    for (const b of ev.data) trackData.push(b);
  }
  pushVarLen(trackData, 0); trackData.push(0xFF, 0x2F, 0x00); // End of Track

  const header = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xFF, PPQ & 0xFF];
  const trackHeader = [0x4D, 0x54, 0x72, 0x6B, (trackData.length >> 24) & 0xFF, (trackData.length >> 16) & 0xFF, (trackData.length >> 8) & 0xFF, trackData.length & 0xFF];
  return Buffer.from([...header, ...trackHeader, ...trackData]);
}

function pushVarLen(arr, value) {
  if (value < 0) value = 0;
  const bytes = [value & 0x7F];
  value >>= 7;
  while (value > 0) { bytes.unshift((value & 0x7F) | 0x80); value >>= 7; }
  for (const b of bytes) arr.push(b);
}

// ── MCP 工具定义 ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'score_create',
    description: '由骨架生成完整乐谱并保存（算法旋律引擎确定性展开，100% 在调上）。骨架给 key/bpm/bars/style，可选 progression 和弦进行（如 ["Am","F","C","G"]）。返回完整谱。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '曲名（1-64 字符）' },
        bpm: { type: 'integer', description: '速度 40-240，缺省 96' },
        key: { type: 'string', description: '调式：C/Am/F#m 等（大调可省略后缀）' },
        bars: { type: 'integer', description: '小节数 1-16，缺省 4' },
        style: { type: 'string', enum: ['arpeggio', 'walkbass', 'pad', 'melody', 'riff'], description: '展开风格，缺省 melody' },
        progression: { type: 'array', items: { type: 'string' }, description: '可选和弦进行（须为调内自然三和弦）' },
      },
      required: ['title', 'key'],
    },
  },
  {
    name: 'score_write',
    description: '全量写入/覆盖一份完整乐谱 JSON（strict validator 把关，pitch 用 MIDI 号 21-108 或音名 "C4"；step 每 16 步一小节）。适合你直接记谱或精确修改后回写。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '可选：覆盖既有谱 id；缺省新建' },
        score: { type: 'object', description: '完整乐谱 {meta:{title,bpm,key,bars,style?,swing?},tracks:[{name,type:synth,wave,vol,cutoff,octaveShift,notes:[{step,pitch,len,vel}]} | {name,type:drum,vol,pattern:{kick/snare/hat/clap:[步号]|every2|every4}}]}' },
      },
      required: ['score'],
    },
  },
  {
    name: 'score_get',
    description: '读取一份完整乐谱（按 id 或曲名）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '谱 id 或曲名' } },
      required: ['id'],
    },
  },
  {
    name: 'score_list',
    description: '列出曲谱库索引（id/曲名/调式/BPM/小节/时长/更新时间）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'score_analyze',
    description: '谱面分析（自查闭环）：调式外音清单（含最近替换建议）、同轨同拍冲突、每小节节奏密度、留白提示。改谱后建议调用自查。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '谱 id 或曲名' } },
      required: ['id'],
    },
  },
  {
    name: 'score_delete',
    description: '删除一份乐谱（按 id 或曲名）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '谱 id 或曲名' } },
      required: ['id'],
    },
  },
  {
    name: 'score_export',
    description: '导出乐谱：format=midi 返回 base64（可落盘为 .midi 拖进 FL/Cubase；波形/滤波不导出，仅音符与鼓）；format=json 返回谱 JSON。播放/试听请在插件面板操作（AI 无法直接出声）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '谱 id 或曲名' },
        format: { type: 'string', enum: ['midi', 'json'], description: '缺省 midi' },
      },
      required: ['id'],
    },
  },
];

function toolHandler(name, args) {
  switch (name) {
    case 'score_create':
      return svcRequest('POST', '/api/scores', { skeleton: args }).then((r) => ({
        id: r.id, title: r.score.meta.title, summary: `${r.score.meta.key} ${r.score.meta.bars} 小节 @ ${r.score.meta.bpm} BPM`,
        tracks: r.score.tracks.map((t) => `${t.name}(${t.type === 'drum' ? '鼓' : `${t.notes.length} 音`})`),
        score: r.score,
      }));
    case 'score_write':
      return svcRequest('POST', '/api/scores', args).then((r) => ({ id: r.id, title: r.score.meta.title, score: r.score }));
    case 'score_get':
      return svcRequest('GET', `/api/scores/${encodeURIComponent(args.id)}`).then((r) => r.score);
    case 'score_list':
      return svcRequest('GET', '/api/scores').then((r) => ({
        count: r.scores.length, cap: r.cap,
        scores: r.scores.map((s) => `${s.id} | ${s.title} | ${s.key} ${s.bars}小节 ${s.bpm}BPM ${s.dur}s | ${new Date(s.updatedAt).toLocaleString()}`),
      }));
    case 'score_analyze':
      return svcRequest('POST', '/api/analyze', { id: args.id }).then((r) => r.analysis);
    case 'score_delete':
      return svcRequest('DELETE', `/api/scores/${encodeURIComponent(args.id)}`);
    case 'score_export': {
      return svcRequest('GET', `/api/scores/${encodeURIComponent(args.id)}`).then((r) => {
        if ((args.format || 'midi') === 'json') return { format: 'json', score: r.score };
        const buf = exportMidi(r.score);
        return {
          format: 'midi', filename: `${r.score.meta.title.replace(/[\\/:*?"<>|]/g, '_')}.mid`,
          bytes: buf.length, midiBase64: buf.toString('base64'),
          hint: '将 base64 解码存为 .mid 文件即可导入 DAW',
        };
      });
    }
    default:
      return Promise.reject(new Error(`未知工具：${name}`));
  }
}

// ── stdio JSON-RPC 主循环（dep-probe 同款）──────────────────────────────────

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i < 0) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handleLine(line).catch((e) => log('error', `handleLine: ${e.message}`));
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'daw-studio', version: '0.1.1' } });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    try {
      const result = await toolHandler(name, (params && params.arguments) || {});
      reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      reply(id, { content: [{ type: 'text', text: `错误：${e.message}` }], isError: true });
    }
    return;
  }
  if (method && id != null) reply(id, {}, new Error(`未知方法：${method}`));
}

function reply(id, result, error) {
  const msg = error ? { jsonrpc: '2.0', id, error: { code: -32601, message: error.message } }
    : { jsonrpc: '2.0', id, result };
  try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch (_) { /* 忽略 */ }
}

process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
