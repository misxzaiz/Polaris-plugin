// core/http.js — HTTP 客户端：发送请求 + 代理 + 超时 + 智能响应
// 修复：URL 参数不再重复（params 与 URL query 分离，发送时统一构建）

export const BINARY_TYPES = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-|gzip)/i

export function tryJSON(text) {
  try { return { ok: true, value: JSON.parse(text) } } catch (e) { return { ok: false } }
}

export function parseContentType(ct) {
  if (!ct) return { mime: 'application/octet-stream', charset: 'utf-8' }
  const parts = ct.split(';')
  const mime = parts[0].trim().toLowerCase()
  const charset = (ct.match(/charset\s*=\s*([^\s;]+)/i) || [])[1] || 'utf-8'
  return { mime, charset }
}

export function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(2) + ' MB'
}

export function formatMs(n) {
  if (n == null) return '—'
  if (n < 1000) return Math.round(n) + ' ms'
  return (n / 1000).toFixed(2) + ' s'
}

/**
 * 发送 HTTP 请求。
 * 关键修复：request.url 只保留 path+host，不含 query；
 * params 是唯一 query 来源，发送时统一编码追加，杜绝重复。
 */
export async function sendRequest(request, options = {}) {
  const { proxyEnabled = false, proxyBase = '', signal = null, onProgress = null } = options

  const t0 = performance.now()
  let url = resolveVars(request.url || '', request._env)
  if (!url.trim()) return { error: '请输入 URL' }
  // 自动补协议
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url
  // 去掉 URL 里已有的 query（防止与 params 重复），只用 params 构建 query
  const qIdx = url.indexOf('?')
  let baseUrl = qIdx >= 0 ? url.slice(0, qIdx) : url

  const method = (request.method || 'GET').toUpperCase()
  const headers = {}

  // headers
  if (request.headers) {
    for (const h of request.headers) {
      if (h.enabled !== false && h.key) {
        headers[resolveVars(h.key, request._env)] = resolveVars(h.value, request._env)
      }
    }
  }

  // params → 唯一 query 来源
  if (request.params) {
    const qs = request.params
      .filter(p => p.enabled !== false && p.key)
      .map(p => encodeURIComponent(resolveVars(p.key, request._env)) + '=' + encodeURIComponent(resolveVars(p.value || '', request._env)))
      .join('&')
    if (qs) baseUrl += (baseUrl.includes('?') ? '&' : '?') + qs
  }

  // body
  let body
  if (!['GET', 'HEAD'].includes(method)) {
    const bodyType = request.bodyType || 'none'
    if (bodyType === 'json') {
      body = resolveVars(request.body || '', request._env)
      if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'
    } else if (bodyType === 'text' || bodyType === 'xml') {
      body = resolveVars(request.body || '', request._env)
      if (bodyType === 'xml' && !Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/xml'
    } else if (bodyType === 'form') {
      const formData = request.formBody || request.body
      if (Array.isArray(formData)) {
        body = formData.filter(f => f.enabled !== false && f.key)
          .map(f => encodeURIComponent(resolveVars(f.key, request._env)) + '=' + encodeURIComponent(resolveVars(f.value || '', request._env)))
          .join('&')
        if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else {
        body = resolveVars(String(formData || ''), request._env)
      }
    }
  }

  // 代理模式
  let fetchUrl = baseUrl
  let fetchHeaders = headers
  if (proxyEnabled && proxyBase) {
    fetchHeaders = { ...headers, 'X-Polaris-Target': baseUrl }
    fetchUrl = proxyBase.replace(/\/+$/, '') + '/__proxy'
  }

  if (onProgress) onProgress('connecting')

  try {
    const controller = new AbortController()
    const combined = signal ? combineSignals(signal, controller.signal) : controller.signal
    const timeout = setTimeout(() => controller.abort(), 60000)

    const resp = await fetch(fetchUrl, { method, headers: fetchHeaders, body, redirect: 'follow', signal: combined })
    clearTimeout(timeout)

    const t1 = performance.now()
    if (onProgress) onProgress('receiving')
    const contentType = resp.headers.get('content-type') || ''
    const { mime } = parseContentType(contentType)
    const isBinary = BINARY_TYPES.test(mime)

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
      status: resp.status, statusText: resp.statusText, ok: resp.ok,
      timeMs: Math.round(t1 - t0), totalTimeMs: Math.round(t2 - t0),
      size: text.length || 0, contentType: mime, headers: responseHeaders,
      text, isBinary, blobUrl, url: baseUrl,
      parsed: parsed.ok ? parsed.value : undefined,
      parsedError: parsed.ok ? undefined : 'JSON 解析失败',
    }
    if (onProgress) onProgress('done')
    return result
  } catch (err) {
    const t1 = performance.now()
    if (err.name === 'AbortError') return { error: '请求已取消', timeMs: Math.round(t1 - t0), url: baseUrl }
    const corsHint = /Failed to fetch|NetworkError|load failed|TypeError/i.test(err.message)
    return { error: err.message || String(err), timeMs: Math.round(t1 - t0), url: baseUrl, corsHint }
  }
}

// 变量解析（与 template.js 一致，但独立以避免循环依赖）
export function resolveVars(str, env) {
  if (str == null || String(str).indexOf('{{') < 0) return str
  return String(str).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g, (m, key) => {
    if (key.startsWith('$')) return resolveDynamic(key)
    if (!env) return m
    if (key === 'baseUrl') return env.baseUrl || ''
    const v = (env.vars || []).find(r => r.enabled !== false && r.key === key)
    return v ? v.value : m
  })
}

function resolveDynamic(key) {
  switch (key) {
    case '$guid': case '$uuid': return uuid()
    case '$timestamp': return String(Math.floor(Date.now() / 1000))
    case '$timestampMs': return String(Date.now())
    case '$isoTimestamp': return new Date().toISOString()
    case '$randomInt': return String(Math.floor(Math.random() * 10000))
    case '$randomFloat': return String(Math.random().toFixed(4))
    case '$localDate': return new Date().toISOString().slice(0, 10)
    case '$localTime': return new Date().toTimeString().slice(0, 8)
    default: return '{{' + key + '}}'
  }
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function combineSignals(s1, s2) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  s1.addEventListener('abort', onAbort)
  s2.addEventListener('abort', onAbort)
  if (s1.aborted || s2.aborted) controller.abort()
  return controller.signal
}

export function formatJSON(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2) } catch (e) { return text }
}