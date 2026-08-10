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
        // 数组元素类型验证（items）
        if (Array.isArray(value) && rule.items && rule.items.type) {
          for (let idx = 0; idx < value.length; idx++) {
            const itemErr = checkType(`${key}[${idx}]`, value[idx], rule.items.type)
            if (itemErr) errors.push(itemErr)
          }
        }
        // 数组长度限制（minItems / maxItems）
        if (Array.isArray(value)) {
          if (rule.minItems !== undefined && value.length < rule.minItems) {
            errors.push(`参数 "${key}" 的数组长度 ${value.length} 小于最小长度 ${rule.minItems}`)
          }
          if (rule.maxItems !== undefined && value.length > rule.maxItems) {
            errors.push(`参数 "${key}" 的数组长度 ${value.length} 大于最大长度 ${rule.maxItems}`)
          }
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
 * 支持 content 或 path 两种模式（path 模式由 handleRegisterScript 处理后传入 content）
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
    throw new Error('必须提供 "path"（脚本文件路径）或 "content"（脚本内容）之一')
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
 * 安全解析 Python 字典/列表字面量为 JS 对象
 * 不依赖 eval，先做字符串转换再 JSON.parse
 * 支持的 Python 语法：
 *   - 字典 {key: value}
 *   - 列表 [1, 2, 3]
 *   - 元组 (...) → 转为数组
 *   - True / False / None
 *   - 字符串 "..." 或 '...'
 *   - 数字（含整数/浮点数）
 */
function safeParsePyDict(pyLiteral) {
  // 按行移除 # 注释（跳过引号内的 #），兼容 "#8B5A2B" 等 hex 颜色字符串
  const lines = pyLiteral.split('\n').map(line => {
    let inQuote = false
    let quoteChar = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQuote) {
        if (c === '\\') { i++ }
        else if (c === quoteChar) { inQuote = false }
      } else {
        if (c === '"' || c === "'") { inQuote = true; quoteChar = c }
        else if (c === '#') { return line.slice(0, i).trimEnd() }
      }
    }
    return line
  }).join('\n')

  let js = lines
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')

  // 移除尾部逗号（trailing comma），逐行分析，精确判断
  js = removeTrailingCommas(js)

  return JSON.parse(js)
}

/**
 * 精确移除 Python 风格的尾部逗号
 * 策略：逐行扫描，仅当以下条件同时满足时才移除逗号：
 *   1. 逗号后到行尾只有空白字符
 *   2. 下一个非空行是纯闭合括号（} 或 ]）
 *   3. 括号后面没有逗号（区分 "key": val, "key2": val2 和 "key": val,\n}）
 */
function removeTrailingCommas(input) {
  const lines = input.split('\n')
  let depth = 0
  let inStr = false
  let esc = false

  return lines.map((line, li) => {
    let lastComma = -1
    let lInStr = inStr
    let lEsc = esc
    let lDepth = depth

    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (lEsc) { lEsc = false; continue }
      if (c === '\\' && lInStr) { lEsc = true; continue }
      if (c === '"' || c === "'") { lInStr = !lInStr; continue }
      if (lInStr) continue
      if (c === '{') { lDepth++; continue }
      if (c === '}') { lDepth--; continue }
      if (c === ',') lastComma = i
    }

    inStr = lInStr
    esc = lEsc
    depth = lDepth

    if (lastComma < 0) return line

    const afterComma = line.slice(lastComma + 1)
    if (afterComma.trim() !== '') return line

    // 查找下一个非空行
    let nextLine = ''
    for (let ni = li + 1; ni < lines.length; ni++) {
      if (lines[ni].trim() !== '') {
        nextLine = lines[ni].trim()
        break
      }
    }

    // 如果下一个非空行是纯闭合括号，则移除逗号
    if (/^[}\]]+$/.test(nextLine)) {
      return line.slice(0, lastComma) + line.slice(lastComma + 1)
    }

    return line
  }).join('\n')
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

  // 提取 params_schema（使用平衡括号计数，正确处理嵌套结构）
  const schemaBlock = extractBalancedDict(content, 'params_schema')
  if (schemaBlock) {
    try {
      metadata.params_schema = safeParsePyDict(schemaBlock)
    } catch (e) {
      // schema 解析失败不影响功能
    }
  }

  // 提取 params 默认值（作为参考）
  if (!metadata.params_schema) {
    const paramsBlock = extractBalancedDict(content, 'params')
    if (paramsBlock) {
      try {
        const parsed = safeParsePyDict(paramsBlock)
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
  }

  return metadata
}

/**
 * 使用平衡括号计数提取嵌套字典块（如 params_schema 或 params）
 * 解决 lazy regex 在嵌套 {} 中提前匹配的问题
 * @param {string} text - 完整脚本内容
 * @param {string} varName - 变量名（如 'params_schema' 或 'params'）
 * @returns {string|null} 提取的字典字符串（含外层 {}），未找到返回 null
 */
function extractBalancedDict(text, varName) {
  const idx = text.indexOf(`${varName} = {`)
  if (idx === -1) return null

  const braceStart = text.indexOf('{', idx)
  let depth = 0
  let inStr = false
  let esc = false
  let endIdx = -1

  for (let i = braceStart; i < text.length; i++) {
    const c = text[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\' && inStr) {
      esc = true
      continue
    }
    if (c === '"' || c === "'") {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '{') {
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) {
        endIdx = i
        break
      }
    }
  }

  return endIdx >= 0 ? text.slice(braceStart, endIdx + 1) : null
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

async function runBlenderScript(scriptPath, params, outputName, timeoutMs) {
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
  const suffix = Math.random().toString(36).slice(2, 7)
  const safeName = (outputName || 'model').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputFile = `${safeName}_${timestamp}_${suffix}.glb`
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

    const effectiveTimeout = Math.min(Math.max(timeoutMs || 90000, 10000), 600000)

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error(`Blender 执行超时（${Math.round(effectiveTimeout / 1000)}s）`))
    }, effectiveTimeout)

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
  const timeoutMs = args.timeout || undefined

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
    const result = await runBlenderScript(scriptPath, params, outputName, timeoutMs)
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
    // 支持两种注册方式：
    // 1. path 模式：AI 先 Write 文件到磁盘，MCP 读取（推荐，减少上下文占用）
    // 2. content 模式：脚本内容直接内联（向后兼容）
    let content = args.content
    if (!content && args.path && typeof args.path === 'string') {
      const resolved = path.resolve(args.path)
      if (!fs.existsSync(resolved)) {
        throw new Error(`脚本文件不存在: ${resolved}`)
      }
      if (path.extname(resolved).toLowerCase() !== '.py') {
        throw new Error(`脚本文件必须是 .py 后缀: ${resolved}`)
      }
      content = fs.readFileSync(resolved, 'utf-8')
    }

    const result = registerScript(
      args.name,
      content,
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
        timeout: {
          type: 'integer',
          description: 'Blender 执行超时时间（毫秒），默认 90000，范围 10000-600000',
          default: 90000,
          minimum: 10000,
          maximum: 600000,
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
    description: '上传并注册一个新的 Blender 建模脚本。注册后该脚本可通过 blender_generate_3d 调用，并在 blender_list_models 中可见。推荐使用 path 模式（AI 先写文件再传路径），大幅减少上下文占用。params_schema 定义参数的验证规则。',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '脚本名称（如 "muyu_advanced"），仅包含字母、数字、下划线和连字符',
        },
        path: {
          type: 'string',
          description: 'Python 脚本文件路径（推荐，AI 先用 Write 写入文件，再传路径；大幅减少上下文占用）。与 content 二选一',
        },
        content: {
          type: 'string',
          description: '完整的 Python 建模脚本内容（Blender Python API）。与 path 二选一，path 未提供时使用',
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
      required: ['name'],
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
          serverInfo: { name: 'polaris-blender', version: '0.2.2' }
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