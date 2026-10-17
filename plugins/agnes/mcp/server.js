#!/usr/bin/env node
/**
 * Agnes 多模态 MCP server（stdio）
 *
 * 提供 MCP 工具：generate_image / generate_video / query_video / get_config / set_config
 * 配置来源（优先级）：
 *   1. 环境变量 AGNES_API_KEY / AGNES_API_BASE（如设了就用，不读 config）
 *   2. {appConfigDir}/config.json 的 plugins["agnes"]（与外部插件面板共用同一配置）
 *   3. 旧版兼容：{appConfigDir}/agnes/config.json（内置插件遗留；首次读取到会自动迁移写入 plugins["agnes"]）
 *
 * 组包逻辑与内置版（src/plugins/agnes/api.ts）及外部面板（plugins/agnes/src/Panel.tsx）保持一致。
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const PLUGIN_ID = 'agnes'
const DEFAULT_API_BASE = 'https://apihub.agnes-ai.com'
const DEFAULT_IMAGE_MODEL = 'agnes-image-2.1-flash'
const DEFAULT_VIDEO_MODEL = 'agnes-video-v2.0'
const DEFAULT_IMAGE_SIZE = '1024x1024'
const MAX_VIDEO_FRAMES = 441
const DEFAULT_VIDEO_FRAMES = 121
const DEFAULT_VIDEO_RATE = 24
const DEFAULT_VIDEO_WIDTH = 1152
const DEFAULT_VIDEO_HEIGHT = 768

// ── 配置 ──────────────────────────────────────────────────────────────────────

function deepMerge(base, patch) {
  if (!patch) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

function getConfigStore(appConfigDir) {
  if (!appConfigDir) return { plugins: {} }
  const p = path.join(appConfigDir, 'config.json')
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return { plugins: {} }
  }
}

function saveConfigStore(appConfigDir, store) {
  if (!appConfigDir) return
  const p = path.join(appConfigDir, 'config.json')
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8')
  } catch (e) {
    console.error(`[agnes] 无法写入 config.json: ${e.message}`)
  }
}

function readLegacyConfig(appConfigDir) {
  if (!appConfigDir) return null
  const p = path.join(appConfigDir, 'agnes', 'config.json')
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function ensureConfig(appConfigDir, env) {
  const store = getConfigStore(appConfigDir)
  const existing = store.plugins?.[PLUGIN_ID]
  if (existing && (existing.apiKey || env.AGNES_API_KEY)) {
    return deepMerge(
      {
        apiKey: env.AGNES_API_KEY || '',
        apiBase: DEFAULT_API_BASE,
        imageModel: DEFAULT_IMAGE_MODEL,
        videoModel: DEFAULT_VIDEO_MODEL,
        defaultSize: DEFAULT_IMAGE_SIZE,
      },
      existing,
    )
  }
  // 旧版兼容：迁移内置插件遗留配置
  const legacy = readLegacyConfig(appConfigDir)
  if (legacy) {
    const migrated = deepMerge({ apiKey: '', apiBase: DEFAULT_API_BASE }, legacy)
    store.plugins = store.plugins || {}
    store.plugins[PLUGIN_ID] = migrated
    saveConfigStore(appConfigDir, store)
    return deepMerge({ apiKey: env.AGNES_API_KEY || '' }, migrated)
  }
  return {
    apiKey: env.AGNES_API_KEY || '',
    apiBase: DEFAULT_API_BASE,
    imageModel: DEFAULT_IMAGE_MODEL,
    videoModel: DEFAULT_VIDEO_MODEL,
    defaultSize: DEFAULT_IMAGE_SIZE,
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function jsonFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(text))
          } catch {
            reject(new Error(`响应不是合法 JSON: ${text.slice(0, 200)}`))
          }
        } else {
          reject(new Error(`API 返回 ${res.statusCode}: ${text.slice(0, 300)}`))
        }
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

// ── Agnes API 组包（与面板/MCP 共用） ─────────────────────────────────────────

function normalizeNumFrames(requested) {
  const clamped = Math.min(Math.max(requested || DEFAULT_VIDEO_FRAMES, 9), MAX_VIDEO_FRAMES)
  const k = Math.round((clamped - 1) / 8)
  return Math.min(Math.max(8 * k + 1, 9), MAX_VIDEO_FRAMES)
}

function apiUrl(base, apiPath) {
  return `${String(base).replace(/\/+$/, '')}${apiPath}`
}

function buildImageBody(cfg, args) {
  const size = args.size || cfg.defaultSize || DEFAULT_IMAGE_SIZE
  const responseFormat = args.responseFormat || 'url'
  const images = args.images || []
  const body = { model: cfg.imageModel, prompt: args.prompt, size }
  if (images.length > 0) {
    body.extra_body = { image: images, response_format: responseFormat }
  } else if (responseFormat === 'b64_json') {
    body.return_base64 = true
  } else {
    body.extra_body = { response_format: 'url' }
  }
  return body
}

function buildVideoBody(cfg, args) {
  const requestedFrames = args.numFrames || DEFAULT_VIDEO_FRAMES
  const numFrames = normalizeNumFrames(requestedFrames)
  const body = {
    model: cfg.videoModel,
    prompt: args.prompt,
    width: args.width || DEFAULT_VIDEO_WIDTH,
    height: args.height || DEFAULT_VIDEO_HEIGHT,
    num_frames: numFrames,
    frame_rate: args.frameRate || DEFAULT_VIDEO_RATE,
  }
  if (args.image) body.image = args.image
  if (args.negativePrompt) body.negative_prompt = args.negativePrompt
  if (args.seed !== undefined && args.seed !== null) body.seed = args.seed
  const extra = {}
  if (args.images && args.images.length > 0) extra.image = args.images
  if (args.mode === 'keyframes') extra.mode = 'keyframes'
  else if (args.mode) body.mode = args.mode
  if (Object.keys(extra).length > 0) body.extra_body = extra
  return { body, framesNormalized: requestedFrames !== numFrames, numFrames }
}

function parseVideoResponse(resp, taskId) {
  const videoId =
    (typeof resp.video_id === 'string' && resp.video_id) ||
    (typeof resp.id === 'string' ? resp.id : '')
  if (!videoId) throw new Error('创建视频响应缺少 video_id')
  return {
    videoId,
    taskId: typeof resp.task_id === 'string' ? resp.task_id : taskId,
    status: typeof resp.status === 'string' ? resp.status : 'queued',
    progress: typeof resp.progress === 'number' ? resp.progress : 0,
    seconds: typeof resp.seconds === 'string' ? resp.seconds : null,
    size: typeof resp.size === 'string' ? resp.size : null,
    url: null,
    error: null,
  }
}

function parseVideoQuery(resp, videoId) {
  const status = typeof resp.status === 'string' ? resp.status : 'unknown'
  const url = typeof resp.url === 'string' && resp.url.trim() ? resp.url : null
  return {
    videoId,
    taskId: typeof resp.task_id === 'string' ? resp.task_id : null,
    status,
    progress: typeof resp.progress === 'number' ? resp.progress : 0,
    seconds: typeof resp.seconds === 'string' ? resp.seconds : null,
    size: typeof resp.size === 'string' ? resp.size : null,
    url,
    error: status === 'failed' ? (typeof resp.error === 'string' ? resp.error : '未知错误') : null,
  }
}

// ── MCP stdio 协议 ───────────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function log(msg) {
  process.stderr.write(`[agnes] ${msg}\n`)
}

function result(contents, structured = {}) {
  const text = JSON.stringify(structured, null, 2)
  return { content: [{ type: 'text', text }], structuredContent: structured, isError: false }
}

function err(message) {
  return {
    content: [{ type: 'text', text: `[Agnes 错误] ${message}` }],
    structuredContent: { type: 'error', error: message },
    isError: true,
  }
}

function compactArgs(raw, additional = {}) {
  const out = {}
  for (const k of Object.keys(additional)) {
    const v = raw[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

let rpcId = 0
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) handleLine(line)
  }
})

async function handleLine(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agnes-mcp', version: '0.1.0' },
      },
    })
    return
  }
  if (msg.method === 'notifications/initialized') {
    return
  }
  if (msg.method === 'ping') {
    send({ jsonrpc: '2.0', id: msg.id, result: {} })
    return
  }
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'generate_image',
            description: '使用 Agnes Image 生成图片（文生图 / 图生图）。支持 url 或 b64_json 返回。',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: '图片生成提示词（中文/英文均可）' },
                images: { type: 'array', items: { type: 'string' }, description: '图生图输入图：公开 URL 或 data:image/...;base64,' },
                size: { type: 'string', description: '输出尺寸，如 1024x1024、1024x768、768x1024，默认 1024x1024' },
                responseFormat: { type: 'string', enum: ['url', 'b64_json'], description: '返回格式，默认 url' },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'generate_video',
            description: '使用 Agnes Video V2.0 生成视频（文生视频 / 图生视频 / 多图 / 关键帧）。',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: '视频生成提示词' },
                images: { type: 'array', items: { type: 'string' }, description: '多图/关键帧模式的输入图数组（图生视频单图请用 image）' },
                image: { type: 'string', description: '单图模式（图生视频）的输入图 URL 或 data URI' },
                mode: { type: 'string', enum: ['ti2vid', 'keyframes'], description: '生成模式：图生视频或关键帧动画' },
                numFrames: { type: 'number', description: '帧数，须 ≤441 且满足 8n+1（非法值将自动纠正），默认 121' },
                frameRate: { type: 'number', description: '帧率 1-60，默认 24' },
                negativePrompt: { type: 'string', description: '反向提示词' },
                seed: { type: 'number', description: '随机种子（可复现）' },
                width: { type: 'number', description: '视频宽度，默认 1152' },
                height: { type: 'number', description: '视频高度，默认 768' },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'query_video',
            description: '查询 Agnes 视频生成任务状态。完成时返回视频下载 URL。',
            inputSchema: {
              type: 'object',
              properties: { videoId: { type: 'string', description: '视频 ID（由 generate_video 返回）' } },
              required: ['videoId'],
            },
          },
          {
            name: 'get_config',
            description: '获取当前 Agnes 配置（API Key 脱敏显示）。',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'set_config',
            description: '更新并持久化 Agnes 配置（与外部插件面板共用 config.json 的 plugins["agnes"]）。',
            inputSchema: {
              type: 'object',
              properties: {
                apiKey: { type: 'string', description: 'API Key' },
                apiBase: { type: 'string', description: 'API Base URL，默认 https://apihub.agnes-ai.com' },
                imageModel: { type: 'string', description: '图片模型名称' },
                videoModel: { type: 'string', description: '视频模型名称' },
                defaultSize: { type: 'string', description: '默认图片尺寸' },
              },
            },
          },
        ],
      },
    })
    return
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args = {} } = msg.params || {}
    try {
      const out = await handleTool(name, args)
      send({ jsonrpc: '2.0', id: msg.id, result: out })
    } catch (e) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: err(e instanceof Error ? e.message : String(e)),
      })
    }
    return
  }
  send({ jsonrpc: '2.0', id: msg.id, result: { content: [], isError: true } })
}

async function handleTool(name, args) {
  const appConfigDir = process.argv[2]
  const env = process.env
  const cfg = ensureConfig(appConfigDir, env)
  const apiBase = cfg.apiBase || DEFAULT_API_BASE

  switch (name) {
    case 'generate_image': {
      const body = buildImageBody(cfg, args)
      const resp = await jsonFetch(apiUrl(apiBase, '/v1/images/generations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
      })
      const data = resp.data?.[0] || {}
      const structured = {
        type: 'image',
        url: typeof data.url === 'string' ? data.url : null,
        base64: typeof data.b64_json === 'string' ? data.b64_json : null,
        mimeType: 'image/png',
        model: cfg.imageModel,
        size: args.size || cfg.defaultSize || DEFAULT_IMAGE_SIZE,
        prompt: args.prompt,
        revisedPrompt: typeof data.revised_prompt === 'string' ? data.revised_prompt : null,
      }
      return result(null, structured)
    }

    case 'generate_video': {
      const { body, framesNormalized, numFrames } = buildVideoBody(cfg, args)
      const resp = await jsonFetch(apiUrl(apiBase, '/v1/videos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
      })
      const task = parseVideoResponse(resp)
      const structured = {
        type: 'video',
        videoId: task.videoId,
        status: task.status,
        progress: task.progress,
        seconds: task.seconds,
        size: task.size,
        url: null,
        waiting: true,
        framesNormalized,
        frames: numFrames,
        model: cfg.videoModel,
        prompt: args.prompt,
      }
      return result(null, structured)
    }

    case 'query_video': {
      const videoId = args.videoId
      if (!videoId) throw new Error('缺少 videoId')
      const encoded = encodeURIComponent(videoId)
      let resp
      try {
        resp = await jsonFetch(apiUrl(apiBase, `/agnesapi?video_id=${encoded}`), {
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
        })
      } catch (e) {
        if (e instanceof Error && e.message.includes('404')) {
          resp = { status: 'queued', progress: 0 }
        } else {
          throw e
        }
      }
      const task = parseVideoQuery(resp, videoId)
      const structured = {
        type: 'video',
        videoId,
        status: task.status,
        progress: task.progress,
        seconds: task.seconds,
        size: task.size,
        url: task.url,
        waiting: task.status !== 'completed' && task.status !== 'failed',
        error: task.error,
      }
      return result(null, structured)
    }

    case 'get_config': {
      const masked = cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}…${cfg.apiKey.slice(-4)}` : ''
      return result(null, {
        type: 'config',
        hasApiKey: !!cfg.apiKey,
        apiKeyMasked: masked,
        apiBase: cfg.apiBase,
        imageModel: cfg.imageModel,
        videoModel: cfg.videoModel,
        defaultSize: cfg.defaultSize,
      })
    }

    case 'set_config': {
      const store = getConfigStore(appConfigDir)
      store.plugins = store.plugins || {}
      const next = deepMerge(store.plugins[PLUGIN_ID] || {}, {
        apiKey: args.apiKey,
        apiBase: args.apiBase,
        imageModel: args.imageModel,
        videoModel: args.videoModel,
        defaultSize: args.defaultSize,
      })
      store.plugins[PLUGIN_ID] = next
      saveConfigStore(appConfigDir, store)
      return result(null, { type: 'config', ok: true, message: '配置已保存（plugins["agnes"]）' })
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}

// 兼容旧 MCP 客户端手动握手
if (process.argv.includes('--help')) {
  console.log('Agnes MCP server — 用法: node server.js <appConfigDir>')
  process.exit(0)
}