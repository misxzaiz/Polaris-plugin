#!/usr/bin/env node
/**
 * Blender 3D 建模 MCP Server
 *
 * 提供两个工具：
 *   - blender_generate_3d：调用 Blender headless 运行建模脚本，生成 GLB 模型
 *   - blender_list_models：列出可用建模脚本模板及其参数
 *
 * 内嵌 HTTP 文件服务，用于预览 GLB 模型。
 * JSON-RPC 2.0 over stdin/stdout。
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { URL } = require('url')

// ── 路径常量 ──────────────────────────────────────────────────────

const PLUGIN_DIR = path.resolve(__dirname, '..')
const SCRIPTS_DIR = path.join(PLUGIN_DIR, 'scripts')
const WEB_DIR = path.join(PLUGIN_DIR, 'web')
const GENERATED_DIR = path.join(PLUGIN_DIR, 'generated')
const BLENDER_SCRIPTS_JSON = path.join(SCRIPTS_DIR, '_index.json')

// HTTP 文件服务
let httpServer = null
let httpPort = 0
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

// ── 工具函数 ──────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function findBlender() {
  // 优先检查环境变量
  const envPath = process.env.BLENDER_PATH
  if (envPath && fs.existsSync(envPath)) return envPath

  // 检查 PATH（Windows 上 blender 可能不在 PATH，但便携版常用）
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  const candidates = ['blender', 'blender.exe', 'blender.exe.lnk']
  for (const dir of pathDirs) {
    for (const exe of candidates) {
      const full = path.join(dir, exe)
      if (fs.existsSync(full)) return full
    }
  }

  // 常见安装路径（Windows）
  const commonPaths = [
    'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
  ]
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p
  }

  // 便携版常见位置
  const portablePaths = [
    'D:/tools/blender/blender-4.5.12-windows-x64/blender.exe',
    'D:/tools/blender/blender-4.4.0-windows-x64/blender.exe',
    'D:\\blender\\blender.exe',
    'D:\\tools\\blender\\blender.exe',
    'E:\\blender\\blender.exe',
  ]
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p
  }

  return null
}

function loadScriptIndex() {
  try {
    if (fs.existsSync(BLENDER_SCRIPTS_JSON)) {
      return JSON.parse(fs.readFileSync(BLENDER_SCRIPTS_JSON, 'utf-8'))
    }
  } catch (e) {
    // fall through
  }
  return null
}

function generateScriptIndex() {
  const scripts = []
  const files = fs.readdirSync(SCRIPTS_DIR)
  for (const file of files) {
    if (!file.endsWith('.py') || file === '_index.json') continue
    const scriptPath = path.join(SCRIPTS_DIR, file)
    const content = fs.readFileSync(scriptPath, 'utf-8')
    const name = file.replace(/\.py$/, '')

    // 尝试从文件头提取参数
    // 匹配多行 params 字典（结束花括号可能有缩进）
    const paramsMatch = content.match(/^params\s*=\s*(\{[\s\S]*?^\s*\})/m)
    let params = {}
    if (paramsMatch) {
      try {
        // 将 Python 元组转换为 JS 数组（如 (0.55, 0.35, 0.15, 1.0) → [0.55, 0.35, 0.15, 1.0]）
        let js = paramsMatch[1]
          .replace(/\(/g, '[')
          .replace(/\)/g, ']')
          .replace(/#.*$/gm, '')  // 移除注释
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null')
        const parsed = eval('(' + js + ')')
        // 只保留参数名和类型提示，不保留值（避免敏感信息）
        params = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [
            k,
            { type: Array.isArray(v) ? 'array' : typeof v, default: v }
          ])
        )
      } catch (e) {
        // 解析失败不影响功能，返回空参数
        params = {}
      }
    }

    // 提取描述
    const descMatch = content.match(/^"""[\s\S]*?^"""$/m)
    let description = ''
    if (descMatch) {
      const lines = descMatch[0].split('\n').slice(1, -1)
      description = lines.map(l => l.replace(/^[\s#]*/, '')).filter(Boolean).join(' ').slice(0, 200)
    }

    scripts.push({ name, file, description: description || name, params })
  }
  return scripts
}

// ── HTTP 文件服务 ──────────────────────────────────────────────────

function startFileServer() {
  if (httpServer) return

  return new Promise((resolve, reject) => {
    httpServer = http.createServer((req, res) => {
      let urlPath
      try {
        urlPath = new URL(req.url, 'http://localhost').pathname
      } catch {
        res.writeHead(400)
        res.end('Bad Request')
        return
      }

      // 安全：防止路径穿越
      const rawPath = urlPath.replace(/^(\.\.(\/|\\))+/, '') || '/'
      // normalize 在 Windows 上会把 / 转成 \，所以统一用 / 判断
      const normalized = rawPath.replace(/\\/g, '/')

      // ── API 路由：通过 token 异步加载 GLB base64 ──
      const apiMatch = normalized.match(/^\/api\/glb-base64\/(.+)$/)
      if (apiMatch) {
        const token = decodeURIComponent(apiMatch[1]).replace(/^\.\.(\/|\\)+/, '')
        const glbPath = path.join(GENERATED_DIR, token.replace(/\//g, path.sep))
        if (fs.existsSync(glbPath)) {
          const glbBuffer = fs.readFileSync(glbPath)
          const base64 = glbBuffer.toString('base64')
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          })
          res.end(JSON.stringify({ base64, size: glbBuffer.length }))
          return
        }
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }

      // 按路径前缀决定文件根目录
      let filePath = null
      if (normalized.startsWith('/generated/')) {
        // /generated/xxx → GENERATED_DIR/xxx
        const rel = normalized.slice('/generated/'.length).replace(/\//g, path.sep)
        filePath = path.join(GENERATED_DIR, rel)
      } else {
        // 其他 → WEB_DIR
        filePath = path.join(WEB_DIR, normalized.replace(/\//g, path.sep))
      }

      // 根路径或目录 → index.html
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html')
        }
      } catch { /* ignore */ }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      // 安全的 MIME 类型
      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      try {
        const content = fs.readFileSync(filePath)
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': content.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        })
        res.end(content)
      } catch (e) {
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    })

    httpServer.listen(0, '127.0.0.1', () => {
      httpPort = httpServer.address().port
      console.error(`[blender-mcp] HTTP file server started on port ${httpPort}`)
      resolve()
    })

    httpServer.on('error', (err) => {
      console.error(`[blender-mcp] HTTP server error:`, err.message)
      reject(err)
    })
  })
}

// ── Blender 建模执行 ──────────────────────────────────────────────

async function runBlenderScript(scriptFile, params, outputName) {
  const blenderPath = findBlender()
  if (!blenderPath) {
    throw new Error(
      '未找到 Blender。请安装 Blender 并确保其在 PATH 中，' +
      '或设置环境变量 BLENDER_PATH 指向 blender.exe。'
    )
  }

  // 确保输出目录存在
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true })
  }

  // 生成输出文件名
  const timestamp = Date.now()
  const safeName = (outputName || 'model').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputFile = `${safeName}_${timestamp}.glb`
  const outputPath = path.join(GENERATED_DIR, outputFile)

  const scriptPath = path.join(SCRIPTS_DIR, scriptFile)
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`建模脚本不存在: ${scriptFile}`)
  }

  const paramsJson = JSON.stringify(params || {})

  console.error(`[blender-mcp] Running: ${blenderPath} --background "${scriptPath}" -- --output "${outputPath}" --params '${paramsJson}'`)

  return new Promise((resolve, reject) => {
    const proc = spawn(blenderPath, [
      '--background',
      '--python', scriptPath,
      '--',
      '--output', outputPath,
      '--params', paramsJson,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error('Blender 执行超时（60s）'))
    }, 60000)

    proc.on('close', (code) => {
      clearTimeout(timeout)

      if (code !== 0) {
        console.error(`[blender-mcp] Blender exited with code ${code}`)
        console.error(`[blender-mcp] stderr:`, stderr.slice(0, 1000))
        reject(new Error(`Blender 退出码 ${code}: ${stderr.slice(0, 500)}`))
        return
      }

      if (!fs.existsSync(outputPath)) {
        reject(new Error('Blender 执行完成但未生成输出文件'))
        return
      }

      const stats = fs.statSync(outputPath)
      console.error(`[blender-mcp] Generated: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`)

      // 解析部件数
      const partsMatch = stdout.match(/Created\s+(\d+)\s+parts/)
      const parts = partsMatch ? parseInt(partsMatch[1]) : 0

      // 解析输出路径确认
      const exportMatch = stdout.match(/Exported to:\s*(.+)/)
      const exportPath = exportMatch ? exportMatch[1].trim() : outputPath

      // 返回侧通道 token（AI 上下文只看到 ~200 字节，不含 base64 大块数据）
      // 前端通过 HTTP 服务的 /api/glb-base64/{token} 异步加载 GLB
      resolve({
        token: outputFile,  // 用于前端通过 HTTP 异步加载 GLB base64
        modelUrl: `http://127.0.0.1:${httpPort}/generated/${outputFile}`,
        previewUrl: `http://127.0.0.1:${httpPort}/preview.html?model=generated/${outputFile}`,
        outputPath: exportPath,
        parts,
        script: path.basename(scriptFile, '.py'),
        stdout: stdout.slice(0, 2000),
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`无法启动 Blender: ${err.message}`))
    })
  })
}

// ── 工具处理函数 ──────────────────────────────────────────────────

async function handleGenerate3D(args) {
  const script = args.script || 'muyu'
  const params = args.params || {}
  const outputName = args.outputName || 'model'

  // 确保 HTTP 服务已启动
  await startFileServer()

  // 查找脚本文件
  const scriptFile = script.endsWith('.py') ? script : `${script}.py`
  const scriptPath = path.join(SCRIPTS_DIR, scriptFile)

  if (!fs.existsSync(scriptPath)) {
    // 尝试从 _index.json 查找
    const index = loadScriptIndex() || generateScriptIndex()
    const found = index.find(s => s.name === script || s.file === scriptFile)
    if (!found) {
      const available = index.map(s => `  - ${s.name}: ${s.description}`).join('\n')
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'error',
            message: `未知建模脚本 "${script}"。可用脚本:\n${available}`
          })
        }],
        isError: true,
      }
    }
  }

  try {
    const result = await runBlenderScript(scriptFile, params, outputName)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'model_generated',
          ...result,
        })
      }]
    }
  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'error',
          message: err.message,
        })
      }],
      isError: true,
    }
  }
}

function handleListModels() {
  const index = loadScriptIndex() || generateScriptIndex()

  // 保存索引以便下次快速加载
  try {
    fs.writeFileSync(BLENDER_SCRIPTS_JSON, JSON.stringify(index, null, 2), 'utf-8')
  } catch (e) {
    // ignore
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        type: 'model_list',
        models: index,
      })
    }]
  }
}

// ── 工具定义 ──────────────────────────────────────────────────────

const tools = [
  {
    name: 'blender_generate_3d',
    description: '调用 Blender headless 运行建模脚本生成 3D 模型（GLB 格式），并返回预览 URL。',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: '建模脚本名称（如 "muyu"、"qbox_character"），不包含 .py 后缀',
          default: 'muyu',
        },
        params: {
          type: 'object',
          description: '建模参数覆盖，JSON 对象，每个脚本有不同参数（详见 blender_list_models 返回的 params 字段）',
          default: {},
        },
        outputName: {
          type: 'string',
          description: '输出文件名（不含路径和扩展名），默认 "model"',
          default: 'model',
        },
      },
      additionalProperties: false,
    }
  },
  {
    name: 'blender_list_models',
    description: '列出所有可用的建模脚本及其参数说明。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    }
  },
]

// ── JSON-RPC 2.0 dispatcher ──────────────────────────────────────

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue

    let msg
    try { msg = JSON.parse(line) } catch { continue }

    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'polaris-blender', version: '0.1.0' }
        }
      })
    } else if (msg.method === 'notifications/initialized') {
      // 忽略
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {}

      if (name === 'blender_generate_3d') {
        handleGenerate3D(args || {}).then(result => {
          send({ jsonrpc: '2.0', id: msg.id, result })
        }).catch(err => {
          send({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify({ type: 'error', message: err.message })
              }],
              isError: true,
            }
          })
        })
      } else if (name === 'blender_list_models') {
        const result = handleListModels()
        send({ jsonrpc: '2.0', id: msg.id, result })
      } else {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: `未知工具: ${name}` }],
            isError: true,
          }
        })
      }
    }
  }
})