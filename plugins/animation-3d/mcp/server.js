#!/usr/bin/env node
/**
 * animation-3d MCP Server — AI 与本地 Blender（mcp-for-blender addon）的桥接层。
 *
 * 协议：JSON-RPC 2.0 over stdio（MCP 2024-11-05）。
 * 工具：把 Blender addon 的 socket 命令（127.0.0.1:9876）封装成 MCP 工具。
 *
 * Blender 必须前台运行并开启 mcp-for-blender addon（监听 9876），否则返回
 * 明确提示「请先启动 Blender」。
 *
 * 启动参数：node server.js <pluginDir>
 *  - pluginDir 用于定位脚本（scripts/start-blender.* 等），便于返回可执行的启动指引。
 */
const net = require('net');

const SERVER_NAME = 'animation-3d-mcp';
const SERVER_VERSION = '0.2.0';
const PROTOCOL_VERSION = '2024-11-05';
const BLENDER_HOST = '127.0.0.1';
const BLENDER_PORT = 9876;

const PLUGIN_DIR = process.argv[2] || '';
const START_HINT = `请先启动 Blender 并开启 MCP for Blender 插件（监听 ${BLENDER_HOST}:${BLENDER_PORT}）。
启动方式（任选）：
  1. 直接双击 Blender 图标（Blender 4.2 已装：C:/Program Files/Blender Foundation/Blender 4.2/blender.exe），然后 Preferences → Add-ons 启用 "MCP for Blender"，勾选 Start MCP Server。
  2. 或运行插件自带的启动脚本：node "${PLUGIN_DIR}/scripts/start-blender.js"（自动拉起 Blender + 启用 addon）。`;

// ── Blender socket 通信（与 addon 协议一致）────────────────────────────────────
function blenderCommand(type, params = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: BLENDER_HOST, port: BLENDER_PORT });
    let data = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`Blender 命令超时（${type}，45s）`));
    }, 45000);

    sock.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`无法连接 Blender（${BLENDER_HOST}:${BLENDER_PORT}）：${e.message}。${START_HINT}`));
    });
    sock.on('data', (c) => {
      data += c.toString();
      try {
        const j = JSON.parse(data);
        clearTimeout(timer);
        sock.destroy();
        resolve(j);
      } catch (_) { /* incomplete, wait for more */ }
    });
    sock.write(JSON.stringify({ type, params }) + '\n');
  });
}

/** 归一化 addon 响应 → 文本 + 结构化数据。 */
function normalize(blenderResp) {
  const text = JSON.stringify(blenderResp, null, 2);
  return { content: [{ type: 'text', text }], structuredContent: blenderResp, isError: false };
}

function err(message) {
  return { content: [{ type: 'text', text: `[animation-3d] ${message}` }], isError: true };
}

// ── MCP 工具定义 ───────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'blender_ping',
    description: '检查本地 Blender（mcp-for-blender addon）是否在线。返回 {"pong": true} 表示可连接。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'blender_execute_code',
    description: '在 Blender 中执行一段 Python/bpy 代码（建模型、改材质、加灯光相机等）。代码在 Blender 主线程执行，异常会安全捕获并返回 traceback。',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'bpy Python 代码。建议先删默认 Cube 再建对象；不要调用 bpy.ops.wm.read_factory_settings()（会干扰 addon server）。' },
      },
      required: ['code'],
    },
  },
  {
    name: 'blender_get_scene_info',
    description: '获取当前 Blender 场景信息（对象列表、场景名、渲染引擎等），用于了解建模现状。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'blender_get_viewport_screenshot',
    description: '截取 Blender 当前 3D 视口（GPU offscreen 渲染，不依赖窗口合成）。必须传 filepath 落盘。',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: { type: 'string', description: '截图保存路径（绝对路径，如 D:/out/mcp_shot.png）' },
        max_size: { type: 'number', description: '最大边长（像素），默认 800' },
        format: { type: 'string', enum: ['png', 'jpg'], description: '图片格式，默认 png' },
      },
      required: ['filepath'],
    },
  },
  {
    name: 'blender_list_scene_items',
    description: '列出 Blender 场景中的所有对象（名称/类型/可见性）。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── JSON-RPC 处理 ───────────────────────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleToolsCall(name, args) {
  switch (name) {
    case 'blender_ping':
      return normalize(await blenderCommand('ping', {}));
    case 'blender_execute_code': {
      if (!args.code) throw new Error('缺少 code 参数');
      return normalize(await blenderCommand('execute_code', { code: args.code }));
    }
    case 'blender_get_scene_info':
      return normalize(await blenderCommand('get_scene_info', {}));
    case 'blender_get_viewport_screenshot':
      return normalize(await blenderCommand('get_viewport_screenshot', {
        max_size: args.max_size ?? 800,
        filepath: args.filepath,
        format: args.format ?? 'png',
      }));
    case 'blender_list_scene_items':
      return normalize(await blenderCommand('list_scene_items', {}));
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
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'ping') {
    send({ jsonrpc: '2.0', id: msg.id, result: {} });
    return;
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args = {} } = msg.params || {};
    try {
      const out = await handleToolsCall(name, args);
      send({ jsonrpc: '2.0', id: msg.id, result: out });
    } catch (e) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: err(e instanceof Error ? e.message : String(e)),
      });
    }
    return;
  }
  send({ jsonrpc: '2.0', id: msg.id, result: { content: [], isError: true } });
}

process.stderr.write(`[animation-3d] MCP server 已启动，pluginDir=${PLUGIN_DIR || '(未提供)'}\n`);
