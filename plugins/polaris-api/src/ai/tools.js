// ai/tools.js — AI 操作 API 工具的定义
// 注册到 ai/client.js 的 _toolRegistry，让 AI 可以直接操控 API 工具

import { store } from '../core/store.js'
import { sendRequest } from '../core/http.js'
import { parseCurl, toCurl } from '../core/parser.js'

// 获取当前环境
function getEnv() {
  const envId = store.get('activeEnv')
  const envs = store.get('envs') || []
  return envs.find(e => e.id === envId) || null
}

// 构建系统提示词
export function buildSystemPrompt() {
  const request = store.get('request')
  const response = store.get('response')
  const env = getEnv()
  const parts = []

  parts.push('你是 Polaris API 的 AI 助手，一个专业的 API 调试工具。你可以帮助用户：')
  parts.push('')
  parts.push('1. **API 请求生成** — 根据用户描述，自动生成 HTTP 请求（method, URL, headers, body）')
  parts.push('2. **API 错误分析** — 分析 HTTP 响应错误，提供修复建议')
  parts.push('3. **响应数据提取** — 从响应中提取特定字段')
  parts.push('4. **参数建议** — 根据 API 语义推荐请求参数')
  parts.push('5. **cURL 解析** — 解析 cURL 命令并填充请求')
  parts.push('6. **代码生成** — 将当前请求生成为 cURL/Python/JavaScript 代码')
  parts.push('')
  parts.push('规则：')
  parts.push('- 回复使用中文，代码和技术术语保持英文')
  parts.push('- 如果需要修改请求，使用 set_request 工具')
  parts.push('- 需要发送请求时，使用 send_request 工具')
  parts.push('- 分析响应时，先获取响应数据再给出建议')
  parts.push('')

  // 当前请求上下文
  parts.push('--- 当前请求上下文 ---')
  if (request) {
    parts.push('方法：' + (request.method || 'GET'))
    if (request.url) parts.push('URL：' + request.url)
    if (request.params && request.params.length) {
      const activeParams = request.params.filter(p => p.enabled !== false && p.key)
      if (activeParams.length) {
        parts.push('参数：' + activeParams.map(p => p.key + '=' + p.value).join(', '))
      }
    }
    if (request.bodyType !== 'none' && request.body) {
      const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
      parts.push('Body：' + bodyStr.slice(0, 1000))
    }
  }
  if (response) {
    if (response.error) {
      parts.push('响应错误：' + response.error)
    } else {
      parts.push('响应状态：' + (response.status || '?'))
      if (response.text) {
        parts.push('响应体（前 2000 字符）：' + String(response.text).slice(0, 2000))
      }
    }
  }
  if (env) {
    parts.push('当前环境：' + (env.name || '默认') + (env.baseUrl ? ' (' + env.baseUrl + ')' : ''))
  }

  return parts.join('\n')
}

// 工具定义（OpenAI Tool Schema）
export function getToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'set_request',
        description: '修改当前 API 请求的参数（method、URL、headers、body 等）',
        parameters: {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'HTTP 方法，如 GET/POST/PUT/DELETE', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
            url: { type: 'string', description: '请求 URL，支持 {{baseUrl}} 和 {{变量名}} 模板' },
            headers: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' }, enabled: { type: 'boolean' } } }, description: '请求头列表' },
            body: { type: 'string', description: '请求体内容（JSON 字符串或文本）' },
            bodyType: { type: 'string', description: '请求体类型', enum: ['none', 'json', 'text', 'form', 'xml'] },
            params: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' }, enabled: { type: 'boolean' } } }, description: 'URL 查询参数' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_request',
        description: '发送当前 API 请求并获取响应',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_response',
        description: '获取当前请求的响应数据（状态码、响应体、响应头等）',
        parameters: {
          type: 'object',
          properties: {
            extract: { type: 'string', description: '可选，指定提取路径，如 data.items[0].name' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'import_curl',
        description: '从 cURL 命令导入并填充当前请求',
        parameters: {
          type: 'object',
          properties: {
            curl: { type: 'string', description: '完整的 cURL 命令' },
          },
          required: ['curl'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_code',
        description: '将当前请求生成为指定语言的代码片段',
        parameters: {
          type: 'object',
          properties: {
            language: { type: 'string', description: '目标语言', enum: ['curl', 'python', 'javascript', 'go', 'rust'] },
          },
          required: ['language'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'analyze_response',
        description: '分析当前响应，提供错误诊断或数据总结',
        parameters: {
          type: 'object',
          properties: {
            focus: { type: 'string', description: '分析重点，如 error/data/structure' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'save_to_collection',
        description: '将当前请求保存到集合中',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '请求名称' },
            folder: { type: 'string', description: '目标文件夹（可选，不填则保存到根）' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_mock',
        description: '基于当前响应结构生成 Mock 数据',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', description: '生成条数，默认 1' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'compare_responses',
        description: '比较当前响应与之前保存的响应',
        parameters: {
          type: 'object',
          properties: {
            targetId: { type: 'string', description: '要对比的响应 ID（来自 history）' },
          },
        },
      },
    },
  ]
}

// 工具实现
const toolImplementations = {
  set_request: async (args) => {
    const request = store.get('request') || {}
    if (args.method) request.method = args.method
    if (args.url !== undefined) request.url = args.url
    if (args.headers) request.headers = args.headers
    if (args.body !== undefined) request.body = args.body
    if (args.bodyType) request.bodyType = args.bodyType
    if (args.params) request.params = args.params
    store.set('request', { ...request })
    return { ok: true, message: '请求已更新' }
  },

  send_request: async () => {
    const request = store.get('request')
    const proxyEnabled = store.get('ui.proxyEnabled')
    const env = getEnv()
    request._env = env

    const result = await sendRequest(request, { proxyEnabled })
    store.set('response', result)

    // 记录历史
    const history = store.get('history') || []
    history.unshift({
      id: Date.now().toString(36),
      method: request.method || 'GET',
      url: request.url || '',
      status: result.status || 0,
      timeMs: result.timeMs || 0,
      ok: result.ok || false,
      error: result.error || null,
      timestamp: Date.now(),
    })
    if (history.length > 100) history.length = 100
    store.set('history', history)

    return { ok: result.ok ?? !result.error, status: result.status, error: result.error }
  },

  get_response: async (args) => {
    const response = store.get('response')
    if (!response) return { error: '尚无响应' }
    if (response.error) return { error: response.error }
    if (args.extract && response.parsed) {
      const value = getByPath(response.parsed, args.extract)
      return { status: response.status, data: value ?? '路径不存在' }
    }
    return {
      status: response.status,
      statusText: response.statusText,
      timeMs: response.timeMs,
      size: response.size,
      contentType: response.contentType,
      hasJSON: !!response.parsed,
      headers: response.headers,
      preview: response.parsed ? JSON.stringify(response.parsed).slice(0, 500) : (response.text?.slice(0, 500) || ''),
    }
  },

  import_curl: async (args) => {
    try {
      const parsed = parseCurl(args.curl)
      store.set('request', {
        method: parsed.method,
        url: parsed.url,
        params: parsed.params,
        headers: parsed.headers,
        body: parsed.body,
        bodyType: parsed.bodyType,
      })
      return { ok: true, method: parsed.method, url: parsed.url }
    } catch (e) {
      return { error: 'cURL 解析失败：' + e.message }
    }
  },

  generate_code: async (args) => {
    const request = store.get('request')
    let code = ''
    switch (args.language) {
      case 'curl':
        code = toCurl(request)
        break
      case 'python':
        code = generatePython(request)
        break
      case 'javascript':
        code = generateJavaScript(request)
        break
      case 'go':
        code = generateGo(request)
        break
      case 'rust':
        code = generateRust(request)
        break
    }
    return { language: args.language, code }
  },

  analyze_response: async (args) => {
    const response = store.get('response')
    if (!response) return { error: '尚无响应' }
    if (response.error) {
      return {
        hasError: true,
        error: response.error,
        corsHint: response.corsHint,
        suggestions: response.corsHint
          ? ['跨域 CORS 问题，可开启代理', '检查目标服务器是否允许跨域', '检查 URL 是否正确']
          : ['检查网络连接', '确认目标服务器是否在运行', '检查 URL 是否可访问'],
      }
    }
    return {
      hasError: false,
      status: response.status,
      statusText: response.statusText,
      timeMs: response.timeMs,
      size: response.size,
      contentType: response.contentType,
      hasJSON: !!response.parsed,
      dataPreview: response.parsed ? JSON.stringify(response.parsed).slice(0, 1000) : null,
    }
  },

  save_to_collection: async (args) => {
    const request = store.get('request')
    const collections = store.get('collections') || []

    // 查找或创建文件夹
    let folder = collections.find(f => f.name === (args.folder || '默认'))
    if (!folder) {
      folder = { id: Date.now().toString(36), name: args.folder || '默认', requests: [] }
      collections.push(folder)
    }

    folder.requests.push({
      id: Date.now().toString(36),
      name: args.name,
      method: request.method,
      url: request.url,
      params: JSON.parse(JSON.stringify(request.params || [])),
      headers: JSON.parse(JSON.stringify(request.headers || [])),
      body: request.body,
      bodyType: request.bodyType,
      savedAt: Date.now(),
    })

    store.set('collections', collections)
    return { ok: true, name: args.name, folder: args.folder || '默认' }
  },

  generate_mock: async (args) => {
    const response = store.get('response')
    if (!response?.parsed) return { error: '当前响应没有 JSON 数据' }
    const count = args.count || 1
    const mocks = []
    for (let i = 0; i < count; i++) {
      mocks.push(generateMockFromSchema(response.parsed))
    }
    return { mocks }
  },

  compare_responses: async (args) => {
    const current = store.get('response')
    const history = store.get('history') || []
    const target = history.find(h => h.id === args.targetId)
    if (!current) return { error: '当前没有响应' }
    if (!target) return { error: '未找到目标响应' }
    return {
      current: { status: current.status, timeMs: current.timeMs, size: current.size },
      target: { status: target.status, timeMs: target.timeMs },
    }
  },
}

// 注册工具到 AI 客户端
export function initTools(registerToolsFn) {
  registerToolsFn(toolImplementations)
}

// 工具函数
function getByPath(obj, path) {
  const parts = path.split(/[.[\]]/).filter(Boolean)
  let val = obj
  for (const p of parts) {
    if (val == null) return undefined
    val = val[p]
  }
  return val
}

function generateMockFromSchema(schema) {
  if (Array.isArray(schema)) {
    return [generateMockFromSchema(schema[0] || {})]
  }
  if (schema && typeof schema === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(schema)) {
      result[k] = generateMockValue(k, v)
    }
    return result
  }
  return schema
}

function generateMockValue(key, value) {
  // 根据字段名和类型智能生成 mock
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    if (/email/i.test(key)) return 'user@example.com'
    if (/url|link|href/i.test(key)) return 'https://example.com'
    if (/date|time/i.test(key)) return new Date().toISOString()
    if (/phone|tel|mobile/i.test(key)) return '13800138000'
    if (/name/i.test(key)) return '张三'
    if (/avatar|image|img|icon/i.test(key)) return 'https://via.placeholder.com/100'
    if (/id|uuid/i.test(key)) return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : Math.random() * 16 | 0 & 0x3 | 0x8).toString(16))
    return value
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return Math.floor(Math.random() * 1000)
    return +(Math.random() * 1000).toFixed(2)
  }
  if (typeof value === 'boolean') return Math.random() > 0.5
  if (Array.isArray(value)) {
    if (value.length === 0) return []
    return [generateMockFromSchema(value[0])]
  }
  if (value && typeof value === 'object') {
    return generateMockFromSchema(value)
  }
  return value
}

// 代码生成器
function generatePython(request) {
  let url = request.url || ''
  const lines = ['import requests', '']
  let headers = {}
  if (request.headers) {
    request.headers.forEach(h => {
      if (h.enabled !== false && h.key) headers[h.key] = h.value
    })
  }
  if (Object.keys(headers).length) {
    lines.push('headers = ' + JSON.stringify(headers, null, 2))
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    if (request.bodyType === 'json') {
      try {
        const body = JSON.parse(request.body)
        lines.push('')
        lines.push('data = ' + JSON.stringify(body, null, 2))
        lines.push('')
        lines.push('response = requests.' + request.method.toLowerCase() + '("' + url + '", headers=headers, json=data)')
      } catch (e) {
        lines.push('')
        lines.push('data = """' + request.body + '"""')
        lines.push('')
        lines.push('response = requests.' + request.method.toLowerCase() + '("' + url + '", headers=headers, data=data)')
      }
    } else {
      lines.push('')
      lines.push('data = """' + request.body + '"""')
      lines.push('')
      lines.push('response = requests.' + request.method.toLowerCase() + '("' + url + '", headers=headers, data=data)')
    }
  } else {
    lines.push('')
    lines.push('response = requests.' + request.method.toLowerCase() + '("' + url + '", headers=headers)')
  }
  lines.push('')
  lines.push('print(response.status_code)')
  lines.push('print(response.text)')
  return lines.join('\n')
}

function generateJavaScript(request) {
  let url = request.url || ''
  const lines = []
  let headers = {}
  if (request.headers) {
    request.headers.forEach(h => {
      if (h.enabled !== false && h.key) headers[h.key] = h.value
    })
  }
  const opts = {
    method: request.method || 'GET',
    headers,
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    opts.body = request.body
  }
  lines.push('const response = await fetch("' + url + '", ' + JSON.stringify(opts, null, 2) + ')')
  lines.push('const data = await response.json()')
  lines.push('console.log(data)')
  return lines.join('\n')
}

function generateGo(request) {
  let url = request.url || ''
  const lines = []
  lines.push('package main')
  lines.push('')
  lines.push('import (')
  lines.push('  "fmt"')
  lines.push('  "io/ioutil"')
  lines.push('  "net/http"')
  lines.push('  "strings"')
  lines.push(')')
  lines.push('')
  lines.push('func main() {')
  lines.push('  url := "' + url + '"')
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    lines.push('  payload := strings.NewReader(`' + request.body + '`)')
    lines.push('  req, _ := http.NewRequest("' + request.method + '", url, payload)')
  } else {
    lines.push('  req, _ := http.NewRequest("' + request.method + '", url, nil)')
  }
  if (request.headers) {
    request.headers.forEach(h => {
      if (h.enabled !== false && h.key) {
        lines.push('  req.Header.Set("' + h.key + '", "' + h.value + '")')
      }
    })
  }
  lines.push('  client := &http.Client{}')
  lines.push('  resp, err := client.Do(req)')
  lines.push('  if err != nil {')
  lines.push('    fmt.Println(err)')
  lines.push('    return')
  lines.push('  }')
  lines.push('  defer resp.Body.Close()')
  lines.push('  body, _ := ioutil.ReadAll(resp.Body)')
  lines.push('  fmt.Println(string(body))')
  lines.push('}')
  return lines.join('\n')
}

function generateRust(request) {
  let url = request.url || ''
  const lines = []
  lines.push('use reqwest;')
  lines.push('#[tokio::main]')
  lines.push('async fn main() -> Result<(), Box<dyn std::error::Error>> {')
  lines.push('  let client = reqwest::Client::new();')
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    lines.push('  let body = r#"' + request.body + '#";')
    lines.push('  let resp = client.' + request.method.toLowerCase() + '("' + url + '")')
    if (request.headers) {
      request.headers.forEach(h => {
        if (h.enabled !== false && h.key) {
          lines.push('    .header("' + h.key + '", "' + h.value + '")')
        }
      })
    }
    lines.push('    .body(body.to_string())')
    lines.push('    .send().await?;')
  } else {
    lines.push('  let resp = client.' + request.method.toLowerCase() + '("' + url + '")')
    if (request.headers) {
      request.headers.forEach(h => {
        if (h.enabled !== false && h.key) {
          lines.push('    .header("' + h.key + '", "' + h.value + '")')
        }
      })
    }
    lines.push('    .send().await?;')
  }
  lines.push('  println!("{:#?}", resp.text().await?);')
  lines.push('  Ok(())')
  lines.push('}')
  return lines.join('\n')
}