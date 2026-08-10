#!/usr/bin/env node
/**
 * Blender 3D 建模 MCP Server
 *
 * 提供四个工具：
 *   - blender_generate_3d：调用 Blender headless 运行建模脚本，生成 GLB 模型
 *   - blender_list_models：列出可用建模脚本模板及其参数 schema
 *   - blender_register_script：上传/注册新建模脚本（含 params_schema 验证规则）
 *
 * 脚本注册系统：
 *   - 内置脚本：scripts/*.py（随插件发布）
 *   - 注册脚本：scripts/_registered/*.py（用户/ AI 上传，可删除、可覆盖）
 *   - 注册信息：scripts/_registry.json（含 name、description、params_schema）
 *   - 合并索引：generateScriptIndex() 同时扫描内置 + 注册目录
 *
 * 参数 schema 验证：
 *   - 每个脚本可定义 params_schema（JSON Schema）
 *   - blender_generate_3d 调用前自动校验 params
 *   - 验证失败返回明确错误信息
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
const REGISTERED_DIR = path.join(SCRIPTS_DIR, '_registered')
const WEB_DIR = path.join(PLUGIN_DIR, 'web')
const GENERATED_DIR = path.join(PLUGIN_DIR, 'generated')
const BLENDER_SCRIPTS_JSON = path.join(SCRIPTS_DIR, '_index.json')
const REGISTRY_JSON = path.join(SCRIPTS_DIR, '_registry.json')

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
  const envPath = process.env.BLENDER_PATH
  if (envPath && fs.existsSync(envPath)) return envPath

  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  const candidates = ['blender', 'blender.exe', 'blender.exe.lnk']
  for (const dir of pathDirs) {
    for (const exe of candidates) {
      const full = path.join(dir, exe)
      if (fs.existsSync(full)) return full
    }
  }

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

// ── 参数 schema 验证 ─────────────────────────────────────────────

/**
 * 简易 JSON Schema 验证器（支持 type / minimum / maximum / enum / required）
 * 不引入外部依赖，覆盖建模参数常见场景
 */
function validateParams(params, schema) {
  if (!schema || typeof schema !== 'object') return null

  const errors = []
  const props = schema.properties || {}
  const required = schema.required || []
  const additional = schema.additionalProperties !== false

  // 必填检查
  for (const key of required) {
    if (!(key in params)) {
      errors.push(`缺少必填参数: "${key}"`)
    }
  }

  // 属性类型检查
  for (const [key, value] of Object.entries(params)) {
    if (key in props) {
      const rule = props[key]
      const typeErr = checkType(key, value, rule.type)
      if (typeErr) errors.push(typeErr)
      else {
        if (rule.minimum !== undefined && typeof value === 'number' && value < rule.minimum) {
          errors.push(`参数 "${key}" 的值 ${value} 小于最小值 ${rule.minimum}`)
        }
        if (rule.maximum !== undefined && typeof value === 'number' && value > rule.maximum) {
          errors.push(`参数 "${key}" 的值 ${value} 大于最大值 ${rule.maximum}`)
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`参数 "${key}" 的值 "${value}" 不在允许范围内: [${rule.enum.join(', ')}]`)
        }
      }
    } else if (!additional) {
      errors.push(`未知参数: "${key}"`)
    }
  }

  return errors.length > 0 ? errors : null
}

function checkType(key, value, expectedType) {
  if (!expectedType) return null
  const actual = Array.isArray(value) ? 'array' : typeof value
  // JSON Schema integer maps to JS number (must be finite and no fractional part)
  if (expectedType === 'integer' && actual === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return `参数 "${key}" 类型错误: 期望 integer，实际 ${value}`
    }
    return null
  }
  if (actual !== expectedType) {
    return `参数 "${key}" 类型错误: 期望 ${expectedType}，实际 ${actual}`
  }
  return null
}

// ── 脚本注册系统 ──────────────────────────────────────────────────

function ensureRegisteredDir() {
  if (!fs.existsSync(REGISTERED_DIR)) {
    fs.mkdirSync(REGISTERED_DIR, { recursive: true })
  }
}

function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_JSON)) {
      return JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf-8'))
    }
  } catch (e) {
    // fall through
  }
  return { scripts: {} }
}

function saveRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_JSON, JSON.stringify(registry, null, 2), 'utf-8')
  } catch (e) {
    console.error('[blender-mcp] 保存注册表失败:', e.message)
  }
}

/**
 * 注册新脚本
 * @param {string} name - 脚本名称
 * @param {string} content - Python 脚本内容
 * @param {object} params_schema - 参数验证规则（JSON Schema）
 * @param {string} description - 脚本描述
 */
function registerScript(name, content, params_schema, description) {
  // 验证输入
  if (!name || typeof name !== 'string') {
    throw new Error('脚本名称 "name" 为必填字符串')
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(`脚本名称 "${name}" 不合法，只能包含字母、数字、下划线和连字符`)
  }
  if (!content || typeof content !== 'string') {
    throw new Error('脚本内容 "content" 为必填字符串')
  }
  if (content.length < 10) {
    throw new Error('脚本内容过短，请确认上传了完整的 Python 脚本')
  }

  const nameLower = name.toLowerCase()
  ensureRegisteredDir()

  // 写入脚本文件
  const scriptFile = `${nameLower}.py`
  const scriptPath = path.join(REGISTERED_DIR, scriptFile)
  fs.writeFileSync(scriptPath, content, 'utf-8')

  // 更新注册表
  const registry = loadRegistry()
  const existing = registry.scripts[nameLower]
  registry.scripts[nameLower] = {
    name: nameLower,
    file: scriptFile,
    sourcePath: scriptPath,
    description: description || nameLower,
    params_schema: params_schema || null,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isRegistered: true,
    ...(existing && existing.registeredAt ? { registeredAt: existing.registeredAt } : {}),
  }
  saveRegistry(registry)

  console.error(`[blender-mcp] 已注册脚本: ${nameLower} → ${scriptPath}`)
  return registry.scripts[nameLower]
}

/**
 * 删除已注册脚本
 */
function unregisterScript(name) {
  const nameLower = name.toLowerCase()
  const registry = loadRegistry()
  const entry = registry.scripts[nameLower]
  if (!entry) {
    throw new Error(`脚本 "${name}" 未注册`)
  }
  if (!entry.isRegistered) {
    throw new Error(`脚本 "${name}" 是内置脚本，不可删除`)
  }

  // 删除文件
  try {
    if (fs.existsSync(entry.sourcePath)) {
      fs.unlinkSync(entry.sourcePath)
    }
  } catch (e) {
    console.error(`[blender-mcp] 删除脚本文件失败: ${e.message}`)
  }

  delete registry.scripts[nameLower]
  saveRegistry(registry)
  console.error(`[blender-mcp] 已删除脚本: ${nameLower}`)
  return { deleted: nameLower }
}

/**
 * 获取脚本完整信息（含 params_schema）
 */
function getScriptInfo(name) {
  const nameLower = name.toLowerCase()
  const registry = loadRegistry()
  const entry = registry.scripts[nameLower]
  if (entry) return entry

  // 查找内置脚本
  const scriptFile = `${nameLower}.py`
  const scriptPath = path.join(SCRIPTS_DIR, scriptFile)
  if (fs.existsSync(scriptPath)) {
    const content = fs.readFileSync(scriptPath, 'utf-8')
    return extractScriptMetadata(nameLower, scriptFile, content)
  }
  return null
}

/**
 * 从 Python 脚本内容中提取 metadata
 */
function extractScriptMetadata(name, file, content) {
  const metadata = {
    name,
    file,
    isRegistered: false,
    description: name,
    params_schema: null,
  }

  // 提取 description
  const descMatch = content.match(/^"""[\s\S]*?^"""$/m)
  if (descMatch) {
    const lines = descMatch[0].split('\n').slice(1, -1)
    metadata.description = lines
      .map(l => l.replace(/^[\s#]*/, ''))
      .filter(Boolean)
      .join(' ')
      .slice(0, 300)
  }

  // 提取 params_schema
  const schemaMatch = content.match(/params_schema\s*=\s*(\{[\s\S]*?^\s*\})/m)
  if (schemaMatch) {
    try {
      let js = schemaMatch[1]
        .replace(/\(/g, '[')
        .replace(/\)/g, ']')
        .replace(/#.*$/gm, '')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
      metadata.params_schema = eval('(' + js + ')')
    } catch (e) {
      // schema 解析失败不影响功能
    }
  }

  // 提取 params 默认值（作为参考）
  const paramsMatch = content.match(/^params\s*=\s*(\{[\s\S]*?^\s*\})/m)
  if (paramsMatch && !metadata.params_schema) {
    try {
      let js = paramsMatch[1]
        .replace(/\(/g, '[')
        .replace(/\)/g, ']')
        .replace(/#.*$/gm, '')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
      const parsed = eval('(' + js + ')')
      // 生成简化 schema
      metadata.params_schema = {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [
            k,
            { type: Array.isArray(v) ? 'array' : typeof v, default: v }
          ])
        ),
        additionalProperties: true,
      }
    } catch (e) {
      // ignore
    }
  }

  return metadata
}

/**
 * 生成完整脚本索引（内置 + 注册）
 */
function generateScriptIndex() {
  const registry = loadRegistry()
  const index = []
  const seenNames = new Set()

  // 1. 扫描内置脚本
  try {
    const files = fs.readdirSync(SCRIPTS_DIR)
    for (const file of files) {
      if (!file.endsWith('.py') || file === '_index.json') continue
      const scriptPath = path.join(SCRIPTS_DIR, file)
      const content = fs.readFileSync(scriptPath, 'utf-8')
      const name = file.replace(/\.py$/, '')
      seenNames.add(name)

      const metadata = extractScriptMetadata(name, file, content)
      index.push(metadata)
    }
  } catch (e) {
    console.error('[blender-mcp] 扫描内置脚本失败:', e.message)
  }

  // 2. 合并注册脚本（覆盖同名内置脚本）
  for (const [name, entry] of Object.entries(registry.scripts || {})) {
    if (entry.isRegistered && seenNames.has(name)) {
      // 已存在，移除内置版本，替换为注册版本
      const idx = index.findIndex(s => s.name === name)
      if (idx !== -1) index.splice(idx, 1)
    }
    index.push(entry)
  }

  return index
}

// 加载/缓存脚本索引
let cachedIndex = null
function loadScriptIndex() {
  if (cachedIndex) return cachedIndex
  try {
    if (fs.existsSync(BLENDER_SCRIPTS_JSON)) {
      const cached = JSON.parse(fs.readFileSync(BLENDER_SCRIPTS_JSON, 'utf-8'))
      if (Array.isArray(cached) && cached.length > 0) return cached
    }
  } catch (e) { /* fall through */ }
  return null
}

// 强制刷新索引缓存
function refreshScriptIndex() {
  const index = generateScriptIndex()
  try {
    fs.writeFileSync(BLENDER_SCRIPTS_JSON, JSON.stringify(index, null, 2), 'utf-8')
  } catch (e) {
    console.error('[blender-mcp] 保存索引失败:', e.message)
  }
  cachedIndex = index
  return index
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

      const rawPath = urlPath.replace(/^(\.\.(\/|\\))+/, '') || '/'
      const normalized = rawPath.replace(/\\/g, '/')

      // API：通过 token 异步加载 GLB base64
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

      let filePath = null
      if (normalized.startsWith('/generated/')) {
        const rel = normalized.slice('/generated/'.length).replace(/\//g, path.sep)
        filePath = path.join(GENERATED_DIR, rel)
      } else {
        filePath = path.join(WEB_DIR, normalized.replace(/\//g, path.sep))
      }

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

async function runBlenderScript(scriptPath, params, outputName) {
  const blenderPath = findBlender()
  if (!blenderPath) {
    throw new Error(
      '未找到 Blender。请安装 Blender 并确保其在 PATH 中，' +
      '或设置环境变量 BLENDER_PATH 指向 blender.exe。'
    )
  }

  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true })
  }

  const timestamp = Date.now()
  const safeName = (outputName || 'model').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputFile = `${safeName}_${timestamp}.glb`
  const outputPath = path.join(GENERATED_DIR, outputFile)

  const scriptPathResolved = scriptPath.startsWith('/') || scriptPath.startsWith('\\')
    ? scriptPath
    : path.resolve(SCRIPTS_DIR, scriptPath)

  if (!fs.existsSync(scriptPathResolved)) {
    throw new Error(`建模脚本不存在: ${scriptPathResolved}`)
  }

  const paramsJson = JSON.stringify(params || {})

  console.error(`[blender-mcp] Running: ${blenderPath} --background "${scriptPathResolved}" -- --output "${outputPath}" --params '${paramsJson}'`)

  return new Promise((resolve, reject) => {
    const proc = spawn(blenderPath, [
      '--background',
      '--python', scriptPathResolved,
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
      reject(new Error('Blender 执行超时（90s）'))
    }, 90000)

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

      const partsMatch = stdout.match(/Created\s+(\d+)\s+(?:parts|objects)/)
      const parts = partsMatch ? parseInt(partsMatch[1]) : 0

      const exportMatch = stdout.match(/Exported to:\s*(.+)/)
      const exportPath = exportMatch ? exportMatch[1].trim() : outputPath

      resolve({
        token: outputFile,
        modelUrl: `http://127.0.0.1:${httpPort}/generated/${outputFile}`,
        previewUrl: `http://127.0.0.1:${httpPort}/preview.html?model=generated/${outputFile}`,
        outputPath: exportPath,
        parts,
        script: path.basename(scriptPathResolved, '.py'),
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

  await startFileServer()

  // 刷新索引（确保注册脚本可见）
  const index = refreshScriptIndex()

  // 查找脚本
  const scriptInfo = index.find(s => s.name === script || s.file === `${script}.py`)
  if (!scriptInfo) {
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

  // 参数 schema 验证
  if (scriptInfo.params_schema) {
    const errors = validateParams(params, scriptInfo.params_schema)
    if (errors) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'error',
            message: `参数验证失败（脚本 ${script}）:\n` + errors.join('\n')
          })
        }],
        isError: true,
      }
    }
  }

  // 构建脚本路径
  const scriptPath = scriptInfo.sourcePath
    ? path.relative(SCRIPTS_DIR, scriptInfo.sourcePath)
    : scriptInfo.file || `${script}.py`

  try {
    const result = await runBlenderScript(scriptPath, params, outputName)
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
  const index = refreshScriptIndex()

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        type: 'model_list',
        models: index.map(s => ({
          name: s.name,
          description: s.description,
          isRegistered: s.isRegistered || false,
          params_schema: s.params_schema || null,
          params: s.params_schema ? Object.keys(s.params_schema.properties || {}).length : 0,
        })),
      })
    }]
  }
}

function handleRegisterScript(args) {
  try {
    const result = registerScript(
      args.name,
      args.content,
      args.params_schema || null,
      args.description
    )

    // 刷新索引
    refreshScriptIndex()

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'script_registered',
          name: result.name,
          file: result.file,
          description: result.description,
          hasParamsSchema: !!result.params_schema,
          paramCount: result.params_schema ? Object.keys(result.params_schema.properties || {}).length : 0,
          message: `脚本 "${result.name}" 注册成功，可在 blender_list_models 中查看`,
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

function handleUnregisterScript(args) {
  try {
    const result = unregisterScript(args.name)

    refreshScriptIndex()

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'script_unregistered',
          name: result.deleted,
          message: `脚本 "${result.deleted}" 已删除`,
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

// ── 工具定义 ──────────────────────────────────────────────────────

const tools = [
  {
    name: 'blender_generate_3d',
    description: '调用 Blender headless 运行建模脚本生成 3D 模型（GLB 格式），并返回预览 URL。支持内置和已注册脚本。params 会根据脚本的 params_schema 自动验证。',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: '建模脚本名称（如 "muyu"、"muyu_advanced"、"qbox_character"），不包含 .py 后缀',
          default: 'muyu',
        },
        params: {
          type: 'object',
          description: '建模参数覆盖，JSON 对象。每个脚本有自己的参数验证规则（详见 blender_list_models 返回的 params_schema）',
          default: {},
        },
        outputName: {
          type: 'string',
          description: '输出文件名（不含路径和扩展名），默认 "model"',
          default: 'model',
        },
      },
      required: ['script'],
      additionalProperties: false,
    }
  },
  {
    name: 'blender_list_models',
    description: '列出所有可用的建模脚本及其参数验证规则（params_schema）。包含内置脚本和已注册脚本。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    }
  },
  {
    name: 'blender_register_script',
    description: '上传并注册一个新的 Blender 建模脚本。注册后该脚本可通过 blender_generate_3d 调用，并在 blender_list_models 中可见。params_schema 定义参数的验证规则。',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '脚本名称（如 "muyu_advanced"），仅包含字母、数字、下划线和连字符',
        },
        content: {
          type: 'string',
          description: '完整的 Python 建模脚本内容（Blender Python API）',
        },
        params_schema: {
          type: 'object',
          description: '参数验证规则（JSON Schema 子集），定义每个参数的类型、范围和描述。可选，不提供则跳过参数验证',
        },
        description: {
          type: 'string',
          description: '脚本描述（用于列表展示）',
        },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    }
  },
  {
    name: 'blender_unregister_script',
    description: '删除已注册的建模脚本（内置脚本不可删除）。',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '要删除的脚本名称',
        },
      },
      required: ['name'],
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
          serverInfo: { name: 'polaris-blender', version: '0.2.0' }
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
        send({ jsonrpc: '2.0', id: msg.id, result: handleListModels() })
      } else if (name === 'blender_register_script') {
        send({ jsonrpc: '2.0', id: msg.id, result: handleRegisterScript(args || {}) })
      } else if (name === 'blender_unregister_script') {
        send({ jsonrpc: '2.0', id: msg.id, result: handleUnregisterScript(args || {}) })
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