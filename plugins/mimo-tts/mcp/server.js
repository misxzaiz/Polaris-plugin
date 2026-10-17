#!/usr/bin/env node
/**
 * mimo-tts MCP Server
 *
 * 小米 MiMo-V2.5-TTS 系列语音合成工具（限时免费）。
 * 协议：JSON-RPC 2.0 over stdio（MCP 2024-11-05）。
 *
 * 启动参数：
 *   node server.js [appConfigDir] [pluginDir]
 *
 * 配置来源：读取 Polaris config.json 的 plugins["mimo-tts"] 命名空间。
 * 每次调用时读取（非启动缓存），面板保存后无需重启即生效。
 * 字段：apiKey（必填）、baseUrl（默认 https://api.xiaomimimo.com/v1）、
 *       defaultVoice（默认 冰糖）、outputMode（file|base64，默认 file）。
 *
 * 工具：
 *   - mimo_tts_synthesize   预置音色合成（mimo-v2.5-tts）
 *   - mimo_tts_list_voices  列出预置音色
 *   - mimo_tts_voice_design 文本设计音色（mimo-v2.5-tts-voicedesign）
 *   - mimo_tts_voice_clone  音色克隆（mimo-v2.5-tts-voiceclone）
 *
 * 音频输出：默认落盘到 <pluginDir>/audio/<时间戳>_<hash>.wav，
 * 由本插件声明的 HTTP 服务（mcp/http-server.js）静态托管，
 * 返回 { file, url, sizeBytes, format }，聊天卡片可播放。
 * outputMode=base64 时返回 data URL（供特殊内联场景）。
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const crypto = require('crypto')

const SERVER_NAME = 'mimo-tts-mcp'
const SERVER_VERSION = '0.1.0'
const PROTOCOL_VERSION = '2024-11-05'

// ── 配置读取 ──────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'mimo-tts'
const APP_CONFIG_DIR = process.argv[2] || ''
const PLUGIN_DIR = process.argv[3] || ''
const AUDIO_DIR = PLUGIN_DIR ? path.join(PLUGIN_DIR, 'audio') : path.join(__dirname, '..', 'audio')

/** 默认配置 */
function defaultConfig() {
  return {
    apiKey: '',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultVoice: '冰糖',
    outputMode: 'file',
  }
}

/** 从单个 config.json 读取 plugins[PLUGIN_ID] 命名空间 */
function readPluginConfigFrom(dir) {
  if (!dir) return null
  try {
    const cfgPath = path.join(dir, 'config.json')
    if (!fs.existsSync(cfgPath)) return null
    const root = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    return (root.plugins && root.plugins[PLUGIN_ID]) || null
  } catch (_) {
    return null
  }
}

/**
 * 从 Polaris config.json 读取插件配置（多候选目录合并）。
 * MCP server spawn 时注入 {{appConfigDir}} 占位符，直接读文件。
 */
function loadConfig() {
  const defaults = defaultConfig()
  const fallbackCandidates = [
    path.join(process.env.APPDATA || '', 'Polaris'),
    path.join(process.env.APPDATA || '', 'polaris'),
  ].filter(Boolean)
  const candidates = [...fallbackCandidates, APP_CONFIG_DIR].filter(
    (d, i, arr) => d && arr.indexOf(d) === i
  )
  const found = {}
  for (const dir of candidates) {
    const cfg = readPluginConfigFrom(dir)
    if (!cfg) continue
    for (const key of Object.keys(cfg)) {
      const val = cfg[key]
      if (typeof val === 'string' && val.trim() !== '') found[key] = val
      else if (typeof val !== 'string') found[key] = val
    }
  }
  return {
    apiKey: found.apiKey || defaults.apiKey,
    baseUrl: (found.baseUrl || defaults.baseUrl).trim().replace(/\/+$/, ''),
    defaultVoice: found.defaultVoice || defaults.defaultVoice,
    outputMode: found.outputMode || defaults.outputMode,
  }
}

// ── 音频落盘 ──────────────────────────────────────────────────────────────────

/** 确保 audio 目录存在 */
function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true })
  return AUDIO_DIR
}

/**
 * 保存音频字节到 <audioDir>/<prefix>_<ts>_<hash>.wav
 * @returns {string} 绝对路径
 */
function saveAudioFile(buf, prefix = 'tts') {
  ensureAudioDir()
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)
  const file = path.join(AUDIO_DIR, `${prefix}_${ts}_${hash}.wav`)
  fs.writeFileSync(file, buf)
  return file
}

// ── 小米 MiMo API 调用 ────────────────────────────────────────────────────────

const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

/** 本地音频文件 → data URL（voiceclone 样本） */
function fileToDataUrl(filePath, fallbackMime = 'audio/wav') {
  if (!fs.existsSync(filePath)) throw new Error(`音频样本文件不存在: ${filePath}`)
  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || fallbackMime
  const buf = fs.readFileSync(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

function isUrl(input) {
  return /^https?:\/\//i.test(input)
}

/**
 * 调用 MiMo TTS chat/completions 端点，返回 { audioBuf, transcript, usage }。
 *
 * 请求要点：
 * - 合成文本必须放 role=assistant 的 content
 * - 风格指令（自然语言）放 role=user 的 content
 * - audio.format = wav（非流式一次性返回 base64）
 * - voice 参数：预置音色名 / data URL（voiceclone）
 */
function callTtsApi(cfg, model, messages, audioParams) {
  return new Promise((resolve, reject) => {
    if (!cfg.apiKey) {
      reject(new Error('未配置 API Key，请在插件面板「MiMo 语音合成」配置页填入小米 MiMo API Key'))
      return
    }
    const url = `${cfg.baseUrl}/chat/completions`
    const body = JSON.stringify({
      model,
      messages,
      audio: audioParams,
      stream: false,
    })

    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 90000,
    }

    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errMsg = `HTTP ${res.statusCode}`
          try {
            const errObj = JSON.parse(data)
            if (errObj.error) errMsg += `: ${typeof errObj.error === 'string' ? errObj.error : (errObj.error.message || JSON.stringify(errObj.error))}`
          } catch (_) {
            if (data) errMsg += `: ${data.slice(0, 300)}`
          }
          reject(new Error(`MiMo API 调用失败: ${errMsg}`))
          return
        }
        try {
          const result = JSON.parse(data)
          const msg = result.choices?.[0]?.message
          const audio = msg?.audio
          if (!audio?.data) {
            reject(new Error('MiMo API 响应缺少 audio.data（可能模型不支持 TTS 输出）'))
            return
          }
          resolve({
            audioBuf: Buffer.from(audio.data, 'base64'),
            transcript: msg.transcript || audio.transcript || '',
            usage: result.usage || null,
          })
        } catch (e) {
          reject(new Error(`解析 MiMo 响应失败: ${e.message}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('MiMo API 请求超时（90s）'))
    })
    req.write(body)
    req.end()
  })
}

/** 组装音频输出结果（file / base64 两种模式） */
function buildAudioResult(cfg, audioBuf, transcript, prefix) {
  if (cfg.outputMode === 'base64') {
    return {
      format: 'wav',
      audioDataUrl: `data:audio/wav;base64,${audioBuf.toString('base64')}`,
      sizeBytes: audioBuf.length,
      transcript,
    }
  }
  const file = saveAudioFile(audioBuf, prefix)
  const fileUrl = `http://127.0.0.1:9861/audio/${path.basename(file)}`
  return {
    format: 'wav',
    file,
    url: fileUrl,
    sizeBytes: audioBuf.length,
    transcript,
    note: '音频已保存并通过本地服务托管，聊天卡片可直接播放；outputMode=base64 可返回内联 data URL。',
  }
}

// ── 工具实现 ──────────────────────────────────────────────────────────────────

/** 预置音色列表（与官方文档一致） */
const PRESET_VOICES = [
  { name: 'MiMo-默认', voiceId: 'mimo_default', language: '中/英', gender: '自动' },
  { name: '冰糖', voiceId: '冰糖', language: '中文', gender: '女' },
  { name: '茉莉', voiceId: '茉莉', language: '中文', gender: '女' },
  { name: '苏打', voiceId: '苏打', language: '中文', gender: '男' },
  { name: '白桦', voiceId: '白桦', language: '中文', gender: '男' },
  { name: 'Mia', voiceId: 'Mia', language: '英文', gender: '女' },
  { name: 'Chloe', voiceId: 'Chloe', language: '英文', gender: '女' },
  { name: 'Milo', voiceId: 'Milo', language: '英文', gender: '男' },
  { name: 'Dean', voiceId: 'Dean', language: '英文', gender: '男' },
]

/** mimo_tts_synthesize：预置音色合成 */
async function handleSynthesize(args) {
  const cfg = loadConfig()
  const text = (args.text || '').trim()
  if (!text) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'text 不能为空' }) }], isError: true }
  }
  const voice = args.voice || cfg.defaultVoice || '冰糖'
  const style = (args.style || '').trim()

  // 风格指令：自然语言放 user；音频标签可直接嵌入 assistant 文本
  const messages = []
  if (style) messages.push({ role: 'user', content: style })
  messages.push({ role: 'assistant', content: text })

  try {
    const { audioBuf, transcript } = await callTtsApi(cfg, 'mimo-v2.5-tts', messages, {
      format: 'wav',
      voice,
    })
    const result = buildAudioResult(cfg, audioBuf, transcript, 'tts')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          model: 'mimo-v2.5-tts',
          voice,
          text,
          ...result,
        }, null, 2),
      }],
    }
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true }
  }
}

/** mimo_tts_list_voices：列出预置音色 */
function handleListVoices() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        model: 'mimo-v2.5-tts',
        voices: PRESET_VOICES,
        note: '预置音色仅用于 mimo-v2.5-tts 模型。',
      }, null, 2),
    }],
  }
}

/** mimo_tts_voice_design：文本设计音色 */
async function handleVoiceDesign(args) {
  const cfg = loadConfig()
  const description = (args.description || '').trim()
  if (!description) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'description 不能为空，需描述目标音色' }) }], isError: true }
  }
  const text = (args.text || '').trim()
  if (!text) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'text 不能为空，需提供待合成文本' }) }], isError: true }
  }

  const messages = [
    { role: 'user', content: description },
    { role: 'assistant', content: text },
  ]

  try {
    const { audioBuf, transcript } = await callTtsApi(cfg, 'mimo-v2.5-tts-voicedesign', messages, {
      format: 'wav',
      optimize_text_preview: true,
    })
    const result = buildAudioResult(cfg, audioBuf, transcript, 'design')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          model: 'mimo-v2.5-tts-voicedesign',
          description,
          text,
          ...result,
        }, null, 2),
      }],
    }
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true }
  }
}

/** mimo_tts_voice_clone：音色克隆 */
async function handleVoiceClone(args) {
  const cfg = loadConfig()
  const sample = (args.sample || '').trim()
  if (!sample) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'sample 不能为空，需提供本地音频路径或 URL（mp3/wav，≤10MB）' }) }], isError: true }
  }
  const text = (args.text || '').trim()
  if (!text) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'text 不能为空' }) }], isError: true }
  }
  const style = (args.style || '').trim()

  let voiceDataUrl
  try {
    voiceDataUrl = isUrl(sample) ? sample : fileToDataUrl(sample)
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true }
  }

  const messages = []
  if (style) messages.push({ role: 'user', content: style })
  messages.push({ role: 'assistant', content: text })

  try {
    const { audioBuf, transcript } = await callTtsApi(cfg, 'mimo-v2.5-tts-voiceclone', messages, {
      format: 'wav',
      voice: voiceDataUrl,
    })
    const result = buildAudioResult(cfg, audioBuf, transcript, 'clone')
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          model: 'mimo-v2.5-tts-voiceclone',
          sample,
          text,
          ...result,
        }, null, 2),
      }],
    }
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true }
  }
}

// ── 工具定义 ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'mimo_tts_synthesize',
    description:
      '小米 MiMo 语音合成（mimo-v2.5-tts，限时免费）。用预置音色把文本合成语音。风格指令（情绪/语速/方言等）放 style 参数（自然语言，如「开心雀跃的语气，语速稍快」；或导演模式「【角色】【场景】【指导】」三要素）；也可直接在 text 中用音频标签如（慵懒）[紧张]（粤语）（唱歌）。返回音频文件路径与播放 URL。',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          description: '待合成的文本。可用音频标签控制风格：开头 (风格) 如 (慵懒)(粤语)(唱歌)；中间可插 [紧张] [颤抖] 等细粒度标签',
        },
        voice: {
          type: 'string',
          description: '预置音色：冰糖/茉莉/苏打/白桦/Mia/Chloe/Milo/Dean，默认取插件配置的 defaultVoice',
        },
        style: {
          type: 'string',
          description: '自然语言风格指令，如「温柔舒缓的语气，像在哄人睡觉」「低沉威严的御姐音，语速极慢」',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mimo_tts_list_voices',
    description: '列出小米 MiMo 语音合成的全部预置音色（含语言/性别）。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'mimo_tts_voice_design',
    description:
      '小米 MiMo 文本设计音色（mimo-v2.5-tts-voicedesign，限时免费）。用文字描述定制全新音色（无需预置音色或音频样本），并按 text 合成语音。音色描述 1-4 句，涵盖性别年龄/音色质感/情绪语气/语速节奏，如「一位五十多岁的中年男性，嗓音略带沙哑沧桑，语速缓慢沉稳」。',
    inputSchema: {
      type: 'object',
      required: ['description', 'text'],
      properties: {
        description: {
          type: 'string',
          minLength: 1,
          description: '音色描述（voice design prompt），中英文均可',
        },
        text: {
          type: 'string',
          minLength: 1,
          description: '待合成的文本，需与音色描述匹配',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mimo_tts_voice_clone',
    description:
      '小米 MiMo 音色克隆（mimo-v2.5-tts-voiceclone，限时免费）。基于音频样本（mp3/wav，≤10MB base64）复刻任意音色并合成语音。sample 传本地文件路径或 URL；style 可控制合成风格。',
    inputSchema: {
      type: 'object',
      required: ['sample', 'text'],
      properties: {
        sample: {
          type: 'string',
          minLength: 1,
          description: '音频样本：本地文件路径（如 C:/voices/me.mp3）或 http(s) URL',
        },
        text: {
          type: 'string',
          minLength: 1,
          description: '待合成的文本',
        },
        style: {
          type: 'string',
          description: '自然语言风格指令（可选）',
        },
      },
      additionalProperties: false,
    },
  },
]

// ── JSON-RPC ──────────────────────────────────────────────────────────────────

function handleInitialize() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  }
}

function handleToolsList() {
  return { tools: TOOLS }
}

function sendResponse(id, result, error) {
  const msg = { jsonrpc: '2.0', id }
  if (error) msg.error = { code: -32000, message: error }
  else msg.result = result
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handleRequest(request) {
  if (request.jsonrpc !== '2.0') return sendResponse(request.id, null, 'Invalid Request')
  if (request.id === undefined || request.id === null) return
  try {
    switch (request.method) {
      case 'initialize': return sendResponse(request.id, handleInitialize())
      case 'notifications/initialized': return sendResponse(request.id, {})
      case 'ping': return sendResponse(request.id, {})
      case 'tools/list': return sendResponse(request.id, handleToolsList())
      case 'tools/call': {
        const name = request.params.name
        const args = request.params.arguments || {}
        let result
        switch (name) {
          case 'mimo_tts_synthesize': result = await handleSynthesize(args); break
          case 'mimo_tts_list_voices': result = handleListVoices(); break
          case 'mimo_tts_voice_design': result = await handleVoiceDesign(args); break
          case 'mimo_tts_voice_clone': result = await handleVoiceClone(args); break
          default:
            result = {
              content: [{ type: 'text', text: JSON.stringify({ error: `未知工具: ${name}` }) }],
              isError: true,
            }
        }
        return sendResponse(request.id, result)
      }
      default: return sendResponse(request.id, null, `Unsupported method: ${request.method}`)
    }
  } catch (e) {
    return sendResponse(request.id, null, e.message)
  }
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

console.error(`[mimo-tts] MCP server 已启动，configDir=${APP_CONFIG_DIR || '(未提供)'}，audioDir=${AUDIO_DIR}`)

const readline = require('readline')
const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  const t = line.trim()
  if (!t) return
  try { handleRequest(JSON.parse(t)) }
  catch (_) { /* 忽略非 JSON 行 */ }
})
process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
