// core/http.js — HTTP 客户端：请求发送 + 流式响应 + 代理支持
// 支持大响应流式解析、超时、AbortController

export const BINARY_TYPES = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-|gzip)/i

// 安全 JSON 解析
export function tryJSON(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false }
  }
}

// 解析响应 Content-Type
export function parseContentType(ct) {
  if (!ct) return { mime: 'application/octet-stream', charset: 'utf-8' }
  const parts = ct.split(';')
  const mime = parts[0].trim().toLowerCase()
  const charset = (ct.match(/charset\s*=\s*([^\s;]+)/i) || [])[1] || 'utf-8'
  return { mime, charset }
}

// 格式化大小
export function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(2) + ' MB'
}

// 格式化时间
export function formatMs(n) {
  if (n == null) return '—'
  if (n < 1000) return Math.round(n) + ' ms'
  return (n / 1000).toFixed(2) + ' s'
}

// 发送 HTTP 请求
export async function sendRequest(request, options = {}) {
  const {
    proxyEnabled = false,
    proxyBase = '',
    signal = null,
    onProgress = null,
  } = options

  const t0 = performance.now()
  let url = request.url || ''
  if (!url.trim()) {
    return { error: '请输入 URL' }
  }
  // 自动补全协议
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) {
    url = 'https://' + url
  }

  const method = (request.method || 'GET').toUpperCase()
  const headers = {}

  // 处理 headers
  if (request.headers) {
    for (const h of request.headers) {
      if (h.enabled !== false && h.key) {
        headers[h.key] = resolveVars(h.value, request._env)
      }
    }
  }

  // 处理 params → URL 查询参数
  if (request.params) {
    const qs = request.params
      .filter(p => p.enabled !== false && p.key)
      .map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(resolveVars(p.value, request._env)))
      .join('&')
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs
    }
  }

  // 处理 body
  let body
  if (!['GET', 'HEAD'].includes(method)) {
    const bodyType = request.bodyType || 'none'
    if (bodyType === 'json') {
      body = resolveVars(request.body || '', request._env)
      if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json'
      }
    } else if (bodyType === 'text' || bodyType === 'xml') {
      body = resolveVars(request.body || '', request._env)
      if (bodyType === 'xml' && !Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/xml'
      }
    } else if (bodyType === 'form') {
      const formData = request.formBody || request.body
      if (typeof formData === 'string') {
        body = resolveVars(formData, request._env)
      } else {
        body = (formData || [])
          .filter(f => f.enabled !== false && f.key)
          .map(f => encodeURIComponent(f.key) + '=' + encodeURIComponent(resolveVars(f.value, request._env)))
          .join('&')
        if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded'
        }
      }
    }
  }

  // 代理模式
  let fetchUrl = url
  let fetchHeaders = headers
  if (proxyEnabled && proxyBase) {
    fetchHeaders = { ...headers, 'X-Polaris-Target': url }
    fetchUrl = proxyBase + '/__proxy'
  }

  if (onProgress) onProgress('connecting')

  try {
    const controller = new AbortController()
    const combinedSignal = signal
      ? combineSignals(signal, controller.signal)
      : controller.signal

    // 超时处理
    const timeout = setTimeout(() => controller.abort(), 60000)

    const resp = await fetch(fetchUrl, {
      method,
      headers: fetchHeaders,
      body,
      redirect: 'follow',
      signal: combinedSignal,
    })

    clearTimeout(timeout)

    const t1 = performance.now()
    if (onProgress) onProgress('receiving')

    const contentType = resp.headers.get('content-type') || ''
    const { mime, charset } = parseContentType(contentType)
    const isBinary = BINARY_TYPES.test(mime)

    // 读取响应体
    let text = ''
    let blobUrl = null
    const responseHeaders = {}
    resp.headers.forEach((v, k) => { responseHeaders[k] = v })

    if (isBinary) {
      const blob = await resp.blob()
      blobUrl = URL.createObjectURL(blob)
    } else {
      text = await resp.text()
    }

    const t2 = performance.now()
    const parsed = tryJSON(text)

    const result = {
      status: resp.status,
      statusText: resp.statusText,
      ok: resp.ok,
      timeMs: Math.round(t1 - t0),
      totalTimeMs: Math.round(t2 - t0),
      size: text.length || 0,
      contentType: mime,
      charset,
      headers: responseHeaders,
      text,
      isBinary,
      blobUrl,
      url,
      parsed: parsed.ok ? parsed.value : undefined,
      parsedError: parsed.ok ? undefined : 'JSON 解析失败',
    }

    if (onProgress) onProgress('done')
    return result
  } catch (err) {
    const t1 = performance.now()
    if (err.name === 'AbortError') {
      return { error: '请求已取消', timeMs: Math.round(t1 - t0), url }
    }
    const corsHint = /Failed to fetch|NetworkError|load failed|TypeError/i.test(err.message)
    return {
      error: err.message || String(err),
      timeMs: Math.round(t1 - t0),
      url,
      corsHint,
    }
  }
}

// 变量解析
function resolveVars(str, env) {
  if (str == null || String(str).indexOf('{{') < 0) return str
  return String(str).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (m, key) => {
    if (!env) return m
    if (key === 'baseUrl') return env.baseUrl || ''
    const v = (env.vars || []).find(r => r.enabled !== false && r.key === key)
    return v ? v.value : m
  })
}

// 合并两个 AbortSignal
function combineSignals(s1, s2) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  s1.addEventListener('abort', onAbort)
  s2.addEventListener('abort', onAbort)
  if (s1.aborted || s2.aborted) controller.abort()
  return controller.signal
}

// 变量模板引擎（用于外部调用）
export function resolveVarsPublic(str, env) {
  return resolveVars(str, env)
}

// 格式化 JSON 并高亮错误
export function formatJSON(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch (e) {
    return text
  }
}