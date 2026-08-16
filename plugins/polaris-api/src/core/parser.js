// core/parser.js — 导入解析器：cURL / HAR / Postman Collection / OpenAPI
import { uid } from './store.js'

/* ===================== cURL 解析 ===================== */
export function parseCurl(text) {
  const toks = tokenizeCurl(text.trim())
  if (toks[0] === 'curl') toks.shift()

  const headers = []
  let method = 'GET'
  let url = ''
  const dataArgs = []
  let getFlag = false

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    const nx = () => toks[++i]

    if (t === '-X' || t === '--request') method = nx() || 'GET'
    else if (t.startsWith('-X') && t.length > 2) method = t.slice(2)
    else if (t === '-H' || t === '--header') addHeader(headers, nx() || '')
    else if (t.startsWith('-H') && t.length > 2) addHeader(headers, t.slice(2))
    else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-ascii' || t === '--data-binary') dataArgs.push(nx() || '')
    else if (t.startsWith('-d') && t.length > 2) dataArgs.push(t.slice(2))
    else if (t === '-u' || t === '--user') {
      try { headers.push({ key: 'Authorization', value: 'Basic ' + btoa(nx() || ''), enabled: true }) } catch (e) {}
    } else if (t === '-b' || t === '--cookie') headers.push({ key: 'Cookie', value: nx() || '', enabled: true })
    else if (t === '-A' || t === '--user-agent') headers.push({ key: 'User-Agent', value: nx() || '', enabled: true })
    else if (t === '-e' || t === '--referer') headers.push({ key: 'Referer', value: nx() || '', enabled: true })
    else if (t === '-G' || t === '--get') getFlag = true
    else if (t === '--url') url = nx() || ''
    else if (['--compressed', '-L', '--location', '-k', '--insecure', '-s', '--silent', '-S', '--show-error', '-i', '--include', '-v', '--verbose', '-f', '--fail', '-#', '--progress-bar', '-N', '--no-buffer'].includes(t)) {}
    else if (t.startsWith('-')) {}
    else if (!url) url = t
  }

  if (!method) method = dataArgs.length && !getFlag ? 'POST' : 'GET'
  method = method.toUpperCase()

  let body = dataArgs.join('&')
  if (getFlag && body) {
    url += (url.includes('?') ? '&' : '?') + body
    body = ''
  }

  const ct = headers.find(h => h.key.toLowerCase() === 'content-type')
  let bodyType = 'none'
  if (body) {
    if (ct && /json/i.test(ct.value)) bodyType = 'json'
    else if (/^\s*[\[{]/.test(body)) bodyType = 'json'
    else bodyType = 'text'
  }
  if (bodyType === 'json') {
    try { body = JSON.stringify(JSON.parse(body), null, 2) } catch (e) {}
  }

  // 解析 URL 参数
  const params = []
  let urlWithoutQuery = url
  const qIdx = url.indexOf('?')
  if (qIdx >= 0) {
    urlWithoutQuery = url.slice(0, qIdx)
    const query = url.slice(qIdx + 1)
    query.split('&').forEach(p => {
      if (!p) return
      const eq = p.indexOf('=')
      if (eq >= 0) {
        params.push({ key: decodeURIComponent(p.slice(0, eq)), value: decodeURIComponent(p.slice(eq + 1)), enabled: true })
      } else {
        params.push({ key: decodeURIComponent(p), value: '', enabled: true })
      }
    })
  }
  params.push({ key: '', value: '', enabled: true })

  // 确保 headers 末尾有空白行
  headers.push({ key: '', value: '', enabled: true })

  return { method, url: urlWithoutQuery, params, headers, body, bodyType }
}

function tokenizeCurl(s) {
  s = s.replace(/\\\r?\n/g, ' ')
  const out = []
  let cur = ''
  let quote = null
  let started = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"') cur += s[++i] || ''
      else cur += c
    } else if (c === '"' || c === "'") {
      quote = c
      started = true
    } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (started) { out.push(cur); cur = ''; started = false }
    } else {
      cur += c
      started = true
    }
  }
  if (started) out.push(cur)
  return out
}

function addHeader(headers, line) {
  const i = line.indexOf(':')
  if (i < 0) { headers.push({ key: line.trim(), value: '', enabled: true }); return }
  headers.push({ key: line.slice(0, i).trim(), value: line.slice(i + 1).trim(), enabled: true })
}

/* ===================== Postman Collection v2.1 解析 ===================== */
export function parsePostmanCollection(data) {
  const items = []
  function walk(item, folderPath) {
    if (item.item) {
      // 是文件夹
      const newPath = folderPath ? [...folderPath, item.name] : [item.name]
      item.item.forEach(sub => walk(sub, newPath))
    } else if (item.request) {
      const req = item.request
      const parsed = {
        id: uid(),
        name: item.name,
        method: req.method || 'GET',
        url: '',
        params: [],
        headers: [],
        body: '',
        bodyType: 'none',
        folder: folderPath || [],
      }

      // URL
      if (req.url) {
        if (typeof req.url === 'string') {
          parsed.url = req.url
        } else if (req.url.raw) {
          parsed.url = req.url.raw
        } else if (req.url.path) {
          parsed.url = (req.url.protocol || 'https') + '://' + (req.url.host || []).join('.') + '/' + (req.url.path || []).join('/')
        }

        // 查询参数
        if (req.url.query && Array.isArray(req.url.query)) {
          parsed.params = req.url.query.map(q => ({
            key: q.key || '',
            value: q.value || '',
            enabled: q.disabled !== true,
          }))
        }
        if (req.url.variable && Array.isArray(req.url.variable)) {
          req.url.variable.forEach(v => {
            if (!parsed.params.find(p => p.key === v.key)) {
              parsed.params.push({ key: v.key || '', value: v.value || '', enabled: true })
            }
          })
        }
        parsed.params.push({ key: '', value: '', enabled: true })
      }

      // Headers
      if (req.header && Array.isArray(req.header)) {
        parsed.headers = req.header.map(h => ({
          key: h.key || '',
          value: h.value || '',
          enabled: h.disabled !== true,
        }))
      }
      parsed.headers.push({ key: '', value: '', enabled: true })

      // Body
      if (req.body) {
        if (req.body.mode === 'raw' && req.body.raw) {
          parsed.body = req.body.raw
          parsed.bodyType = 'json'
        } else if (req.body.mode === 'urlencoded' && req.body.urlencoded) {
          parsed.bodyType = 'form'
          parsed.body = req.body.urlencoded.map(f => ({
            key: f.key || '',
            value: f.value || '',
            enabled: f.disabled !== true,
          }))
        } else if (req.body.mode === 'formdata' && req.body.formdata) {
          parsed.bodyType = 'form'
          parsed.body = req.body.formdata.map(f => ({
            key: f.key || '',
            value: f.value || '',
            enabled: f.disabled !== true,
          }))
        }
      }

      items.push(parsed)
    }
  }

  // 处理集合根
  if (data.item) {
    data.item.forEach(item => walk(item, []))
  } else if (Array.isArray(data)) {
    data.forEach(item => walk(item, []))
  }

  const auth = data.auth ? extractAuth(data.auth) : null

  return { items, auth, name: data.info?.name || data.name || '导入的集合' }
}

function extractAuth(auth) {
  if (!auth) return null
  if (auth.type === 'bearer') {
    const token = (auth.bearer || []).find(a => a.key === 'token')?.value
    return token ? { type: 'bearer', token } : null
  }
  if (auth.type === 'apikey') {
    const key = (auth.apikey || []).find(a => a.key === 'key')?.value
    const val = (auth.apikey || []).find(a => a.key === 'value')?.value
    return key ? { type: 'apikey', key, value: val, in: (auth.apikey || []).find(a => a.key === 'in')?.value || 'header' } : null
  }
  return null
}

/* ===================== OpenAPI 3.0 解析 ===================== */
export function parseOpenAPI(data) {
  const items = []
  const baseUrl = data.servers?.[0]?.url || ''

  if (data.paths) {
    for (const [path, methods] of Object.entries(data.paths)) {
      for (const [method, spec] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
          const parsed = {
            id: uid(),
            name: spec.summary || spec.operationId || `${method.toUpperCase()} ${path}`,
            method: method.toUpperCase(),
            url: (baseUrl + path).replace(/\/+$/, ''),
            params: [],
            headers: [],
            body: '',
            bodyType: 'none',
            folder: [spec.tags?.[0] || '未分类'],
            description: spec.description || '',
          }

          // 参数
          if (spec.parameters) {
            spec.parameters.forEach(p => {
              if (p.in === 'query') {
                parsed.params.push({
                  key: p.name,
                  value: p.example !== undefined ? String(p.example) : (p.schema?.default !== undefined ? String(p.schema.default) : ''),
                  enabled: p.required !== false,
                })
              } else if (p.in === 'header') {
                parsed.headers.push({
                  key: p.name,
                  value: p.example !== undefined ? String(p.example) : (p.schema?.default !== undefined ? String(p.schema.default) : ''),
                  enabled: p.required !== false,
                })
              }
            })
          }
          parsed.params.push({ key: '', value: '', enabled: true })
          parsed.headers.push({ key: '', value: '', enabled: true })

          // Request Body
          if (spec.requestBody) {
            const content = spec.requestBody.content
            if (content) {
              if (content['application/json']) {
                const example = content['application/json'].example || content['application/json'].schema?.example
                parsed.body = example ? JSON.stringify(example, null, 2) : JSON.stringify(generateExampleFromSchema(content['application/json'].schema), null, 2)
                parsed.bodyType = 'json'
              } else if (content['application/x-www-form-urlencoded']) {
                parsed.bodyType = 'form'
                const schema = content['application/x-www-form-urlencoded'].schema
                if (schema?.properties) {
                  parsed.body = Object.entries(schema.properties).map(([k, v]) => ({
                    key: k,
                    value: v.example !== undefined ? String(v.example) : '',
                    enabled: schema.required?.includes(k) !== false,
                  }))
                }
              }
            }
          }

          items.push(parsed)
        }
      }
    }
  }

  return { items, name: data.info?.title || '导入的 API', version: data.info?.version || '' }
}

function generateExampleFromSchema(schema) {
  if (!schema) return {}
  if (schema.example !== undefined) return schema.example
  if (schema.type === 'object') {
    const obj = {}
    if (schema.properties) {
      for (const [k, v] of Object.entries(schema.properties)) {
        obj[k] = generateExampleFromSchema(v)
      }
    }
    return obj
  }
  if (schema.type === 'array') {
    return [generateExampleFromSchema(schema.items || {})]
  }
  if (schema.type === 'string') return schema.enum?.[0] || 'string'
  if (schema.type === 'integer') return 0
  if (schema.type === 'number') return 0.0
  if (schema.type === 'boolean') return false
  return null
}

/* ===================== HAR 解析 ===================== */
export function parseHAR(data) {
  const items = []
  const entries = data.log?.entries || []
  entries.forEach((entry, i) => {
    const req = entry.request
    if (!req) return

    const parsed = {
      id: uid(),
      name: `${req.method} ${new URL(req.url).pathname}`,
      method: req.method || 'GET',
      url: req.url || '',
      params: [],
      headers: [],
      body: '',
      bodyType: 'none',
      folder: ['HAR 导入'],
    }

    // 查询参数
    if (req.queryString) {
      parsed.params = req.queryString.map(q => ({
        key: q.name || '',
        value: q.value || '',
        enabled: true,
      }))
    }
    parsed.params.push({ key: '', value: '', enabled: true })

    // Headers
    if (req.headers) {
      parsed.headers = req.headers
        .filter(h => !/^(host|content-length|cookie|user-agent|origin|referer)/i.test(h.name))
        .map(h => ({
          key: h.name || '',
          value: h.value || '',
          enabled: true,
        }))
    }
    parsed.headers.push({ key: '', value: '', enabled: true })

    // Body
    if (req.postData) {
      if (req.postData.mimeType?.includes('json')) {
        parsed.body = req.postData.text || ''
        parsed.bodyType = 'json'
      } else if (req.postData.mimeType?.includes('x-www-form-urlencoded')) {
        parsed.bodyType = 'form'
        parsed.body = (req.postData.params || []).map(p => ({
          key: p.name || '',
          value: p.value || '',
          enabled: true,
        }))
      } else {
        parsed.body = req.postData.text || ''
        parsed.bodyType = 'text'
      }
    }

    items.push(parsed)
  })

  return { items, name: 'HAR 导入 (' + items.length + ' 个请求)' }
}

/* ===================== 导出为 cURL ===================== */
export function toCurl(request) {
  let url = request.url || ''
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url

  const Q = s => "'" + String(s).replace(/'/g, "'\\''") + "'"
  const parts = ['curl -X ' + request.method + ' ' + Q(url)]

  // Headers
  if (request.headers) {
    const seen = new Set()
    request.headers.forEach(h => {
      if (h.enabled !== false && h.key && !seen.has(h.key.toLowerCase())) {
        parts.push('-H ' + Q(h.key + ': ' + h.value))
        seen.add(h.key.toLowerCase())
      }
    })
  }

  // Body
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    if (request.bodyType === 'json' || request.bodyType === 'text') {
      parts.push('--data-raw ' + Q(request.body))
    } else if (request.bodyType === 'form' && Array.isArray(request.body)) {
      const form = request.body.filter(f => f.enabled !== false && f.key)
        .map(f => encodeURIComponent(f.key) + '=' + encodeURIComponent(f.value))
        .join('&')
      if (form) parts.push('--data-raw ' + Q(form))
    }
  }

  return parts.join(' \\\n  ')
}

/* ===================== 检测导入类型 ===================== */
export function detectImportType(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('curl ') || trimmed.startsWith('curl\\')) return 'curl'
  try {
    const data = JSON.parse(trimmed)
    if (data.info?.schema?.includes('postman')) return 'postman'
    if (data.openapi || data.swagger) return 'openapi'
    if (data.log?.entries) return 'har'
    if (data.info?._postman_id) return 'postman'
    if (data.paths && (data.info?.title || Object.keys(data.paths).length)) return 'openapi'
    return 'unknown'
  } catch (e) {
    return 'unknown'
  }
}