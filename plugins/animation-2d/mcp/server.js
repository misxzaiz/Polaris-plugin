#!/usr/bin/env node
/**
 * animation-2d MCP Server — AI 的 2D 手绘动画工具入口。
 *
 * 协议：JSON-RPC 2.0 over stdio（MCP 2024-11-05）。
 * 渲染：spawn render.mjs（headless Chrome + p5.brush，cwd=插件目录）。
 * 质检：GLM-4V 识图（复用 config.json 的 plugins["image-recognition"] 配置）。
 *
 * 启动参数：node server.js <pluginDir>
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const SERVER_NAME = 'animation-2d-mcp';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const PLUGIN_DIR = process.argv[2] || path.resolve(__dirname, '..');

// ── GLM-4V 配置读取（与 image-recognition 插件共用 config.json）───────────────
const FALLBACK_CANDIDATES = [
  path.join(process.env.APPDATA || '', 'Polaris'),
  path.join(process.env.APPDATA || '', 'polaris'),
].filter(Boolean);

function loadVisionConfig() {
  const found = {};
  for (const dir of FALLBACK_CANDIDATES) {
    try {
      const cfgPath = path.join(dir, 'config.json');
      if (!fs.existsSync(cfgPath)) continue;
      const root = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const cfg = root.plugins?.['image-recognition'];
      if (!cfg) continue;
      for (const [k, v] of Object.entries(cfg)) {
        if (typeof v === 'string' && v.trim() !== '') found[k] = v;
        else if (typeof v !== 'string') found[k] = v;
      }
    } catch (_) { /* skip */ }
  }
  return {
    apiKey: found.apiKey || '',
    model: found.model || 'glm-4v-flash',
    baseUrl: found.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
  };
}

function callVision(imagePath, prompt, maxTokens = 2000) {
  const cfg = loadVisionConfig();
  if (!cfg.apiKey) {
    return Promise.reject(new Error('未找到 image-recognition 插件配置（apiKey）。请先在 Polaris 插件面板（图片识别）填入 API Key。'));
  }
  const ext = path.extname(imagePath).toLowerCase();
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  const b64 = fs.readFileSync(imagePath).toString('base64');
  const body = JSON.stringify({
    model: cfg.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
        { type: 'text', text: prompt },
      ],
    }],
    max_tokens: maxTokens,
  });
  const url = new URL(cfg.baseUrl + '/chat/completions');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(`视觉 API 错误: ${JSON.stringify(j.error)}`));
          const content = j.choices?.[0]?.message?.content || '(empty)';
          const m = String(content).match(/<answer>([\s\S]*?)<\/answer>/i);
          resolve(m ? m[1].trim() : String(content));
        } catch (e) { reject(new Error(`响应解析失败: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── render.mjs 包装 ─────────────────────────────────────────────────────────────
function runRender(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['render.mjs', ...args], { cwd: PLUGIN_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('close', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`render.mjs 退出码 ${code}: ${err.trim() || out.trim()}`));
    });
  });
}

// ── MCP 工具 ────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'render_still',
    description: '渲染 2D 手绘动画的指定时刻静帧（PNG，1920x1080）。GUIDE：2D 纯手绘/水墨风/无文字。',
    inputSchema: {
      type: 'object',
      properties: {
        times: { type: 'string', description: '逗号分隔的时刻（秒），如 "1.2,3.4"。可用 "0,5" 看首尾' },
        out: { type: 'string', description: '输出 PNG 路径（默认插件 out/stills/）' },
        loop: { type: 'string', description: '可选：独立循环名（emotions/views 等参考表）' },
      },
      required: ['times'],
    },
  },
  {
    name: 'render_contact_sheet',
    description: '渲染联系方式图（多帧拼一张 JPG），用于快速检查动画节奏/构图/角色。',
    inputSchema: {
      type: 'object',
      properties: {
        times: { type: 'string', description: '逗号分隔的时刻，如 "0.5,1,1.5,2"' },
        out: { type: 'string', description: '输出 JPG 路径（默认 out/sheet.jpg）' },
        cols: { type: 'number', description: '每行帧数，默认 3' },
        width: { type: 'number', description: '每格宽度 px，默认 640' },
      },
      required: ['times'],
    },
  },
  {
    name: 'render_video',
    description: '渲染整段动画为 MP4（直出，单 worker，较慢）。GUIDE：先渲染帧序列再 encode 更快。',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: '可选：a:b 时间区间（秒）' },
        out: { type: 'string', description: '输出 MP4 路径（默认 out/clip.mp4）' },
        audio: { type: 'string', description: '可选：背景音乐 mp3 路径' },
      },
    },
  },
  {
    name: 'render_frames',
    description: '渲染帧序列（JPEG，并行可续传），是出片最快的路径。完成后用 encode_video。',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: '可选：a:b 时间区间（秒），默认全片' },
        workers: { type: 'number', description: '并行 worker 数，默认 4' },
      },
    },
  },
  {
    name: 'encode_video',
    description: '把已渲染的帧序列（out/frames/f%05d.jpg）编码为 MP4。',
    inputSchema: {
      type: 'object',
      properties: {
        out: { type: 'string', description: '输出 MP4 路径（默认 out/video.mp4）' },
        audio: { type: 'string', description: '可选：背景音乐 mp3 路径' },
      },
    },
  },
  {
    name: 'vision_check',
    description: '用 GLM-4V 识图质检一张渲染帧/联系方式图（美术风格、构图、是否符合 2D 手绘水墨风）。',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string', description: '图片路径（渲染输出的 PNG/JPG）' },
        prompt: { type: 'string', description: '质检指令，默认按动画制作规则审查' },
        maxTokens: { type: 'number', description: '最大输出 token（默认 2000，复杂分析建议 3000+）' },
      },
      required: ['image'],
    },
  },
];

// ── JSON-RPC ────────────────────────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function result(structured) {
  const text = JSON.stringify(structured, null, 2);
  return { content: [{ type: 'text', text }], structuredContent: structured, isError: false };
}
function err(message) {
  return { content: [{ type: 'text', text: `[animation-2d] ${message}` }], isError: true };
}

const DEFAULT_CHECK_PROMPT = '请按以下规则审查这张 2D 手绘动画帧：1) 是否纯 2D 手绘质感（笔触/墨晕/纸纹，非 3D 渲染）；2) 构图与主体是否清晰可读；3) 是否有文字/字幕（应避免）；4) 色彩是否柔和统一（无纯黑纯白）。逐条指出问题，最后给一句总评。';

async function handleToolsCall(name, args) {
  switch (name) {
    case 'render_still': {
      const times = args.times;
      if (!times) throw new Error('缺少 times 参数');
      const out = args.out || path.join(PLUGIN_DIR, 'out', 'stills');
      const extra = args.loop ? [`--loop=${args.loop}`] : [];
      const log = await runRender([`--stills=${times}`, `--out=${out}`, ...extra]);
      // 列出实际落盘的文件，便于 AI 后续 vision_check
      const dir = out && fs.existsSync(out) && fs.statSync(out).isDirectory() ? out : path.dirname(out);
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(dir, f))
        : [];
      return result({ ok: true, out: files, log });
    }
    case 'render_contact_sheet': {
      if (!args.times) throw new Error('缺少 times 参数');
      const out = args.out || path.join(PLUGIN_DIR, 'out', 'sheet.jpg');
      const rArgs = [`--sheet=${args.times}`, `--out=${out}`];
      if (args.cols) rArgs.push(`--cols=${args.cols}`);
      if (args.width) rArgs.push(`--w=${args.width}`);
      const log = await runRender(rArgs);
      return result({ ok: true, out, log });
    }
    case 'render_video': {
      const out = args.out || path.join(PLUGIN_DIR, 'out', 'clip.mp4');
      const rArgs = ['--clip'];
      if (args.range) rArgs.push(`--range=${args.range}`);
      rArgs.push(`--out=${out}`);
      if (args.audio) rArgs.push(`--audio=${args.audio}`);
      const log = await runRender(rArgs);
      return result({ ok: true, out, log });
    }
    case 'render_frames': {
      const rArgs = ['--frames'];
      if (args.range) rArgs.push(`--range=${args.range}`);
      if (args.workers) rArgs.push(`--workers=${args.workers}`);
      const log = await runRender(rArgs);
      return result({ ok: true, framesDir: path.join(PLUGIN_DIR, 'out', 'frames'), log });
    }
    case 'encode_video': {
      const out = args.out || path.join(PLUGIN_DIR, 'out', 'video.mp4');
      const rArgs = ['--encode', `--out=${out}`];
      if (args.audio) rArgs.push(`--audio=${args.audio}`);
      const log = await runRender(rArgs);
      return result({ ok: true, out, log });
    }
    case 'vision_check': {
      if (!args.image) throw new Error('缺少 image 参数');
      const text = await callVision(args.image, args.prompt || DEFAULT_CHECK_PROMPT, args.maxTokens || 2000);
      return result({ ok: true, image: args.image, verdict: text });
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) void handleLine(line);
  }
});

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.method === 'tools/list') { send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } }); return; }
  if (msg.method === 'tools/call') {
    const { name, arguments: args = {} } = msg.params || {};
    try {
      const out = await handleToolsCall(name, args);
      send({ jsonrpc: '2.0', id: msg.id, result: out });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(e instanceof Error ? e.message : String(e)) });
    }
    return;
  }
  send({ jsonrpc: '2.0', id: msg.id, result: { content: [], isError: true } });
}

process.stderr.write(`[animation-2d] MCP server 已启动，pluginDir=${PLUGIN_DIR}\n`);