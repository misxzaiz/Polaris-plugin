// core/parser.js — cURL/Postman/OpenAPI/HAR 解析 + 导出 + 代码生成
import { uid } from './store.js'

const blankRow = () => ({ id: uid(), enabled: true, key: '', value: '' })

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
    const nx = () => toks[++i] || ''
    if (t === '-X' || t === '--request') method = nx() || 'GET'
    else if (t.startsWith('-X') && t.length > 2) method = t.slice(2)
    else if (t === '-H' || t === '--header') addHeader(headers, nx())
    else if (t.startsWith('-H') && t.length > 2) addHeader(headers, t.slice(2))
    else if (['-d', '--data', '--data-raw', '--data-ascii', '--data-binary', '--data-urlencode'].includes(t)) dataArgs.push(nx())
    else if (t.startsWith('-d') && t.length > 2) dataArgs.push(t.slice(2))
    else if (t === '-u' || t === '--user') { try { headers.push({ id: uid(), enabled: true, key: 'Authorization', value: 'Basic ' + btoa(nx()) }) } catch (e) {} }
    else if (t === '-b' || t === '--cookie') headers.push({ id: uid(), enabled: true, key: 'Cookie', value: nx() })
    else if (t === '-A' || t === '--user-agent') headers.push({ id: uid(), enabled: true, key: 'User-Agent', value: nx() })
    else if (t === '-e' || t === '--referer') headers.push({ id: uid(), enabled: true, key: 'Referer', value: nx() })
    else if (t === '-G' || t === '--get') getFlag = true
    else if (t === '--url') url = nx()
    else if (['--compressed', '-L', '--location', '-k', '--insecure', '-s', '--silent', '-S', '--show-error', '-i', '--include', '-v', '--verbose', '-f', '--fail', '-#', '--progress-bar', '-N', '--no-buffer'].includes(t)) { /* ignore */ }
    else if (t.startsWith('-')) { /* ignore unknown */ }
    else if (!url) url = t
  }

  if (!method) method = dataArgs.length && !getFlag ? 'POST' : 'GET'
  method = method.toUpperCase()

  let body = dataArgs.join('&')
  if (getFlag && body) { url += (url.includes('?') ? '&' : '?') + body; body = '' }

  const ct = headers.find(h => h.key.toLowerCase() === 'content-type')
  let bodyType = 'none'
  if (body) {
    if (ct && /json/i.test(ct.value)) bodyType = 'json'
    else if (/^\s*[\[{]/.test(body)) bodyType = 'json'
    else bodyType = 'text'
  }
  if (bodyType === 'json') { try { body = JSON.stringify(JSON.parse(body), null, 2) } catch (e) {} }

  // URL params
  const params = []
  let urlWithoutQuery = url
  const qIdx = url.indexOf('?')
  if (qIdx >= 0) {
    urlWithoutQuery = url.slice(0, qIdx)
    url.slice(qIdx + 1).split('&').forEach(p => {
      if (!p) return
      const eq = p.indexOf('=')
      if (eq >= 0) params.push({ id: uid(), enabled: true, key: decodeURIComponent(p.slice(0, eq)), value: decodeURIComponent(p.slice(eq + 1)) })
      else params.push({ id: uid(), enabled: true, key: decodeURIComponent(p), value: '' })
    })
  }
  params.push(blankRow())
  headers.push(blankRow())

  return { method, url: urlWithoutQuery, params, headers, body, bodyType, formBody: [blankRow()] }
}

function tokenizeCurl(s) {
  s = s.replace(/\\\r?\n/g, ' ')
  const out = []
  let cur = '', quote = null, started = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"') cur += s[++i] || ''
      else cur += c
    } else if (c === '"' || c === "'") { quote = c; started = true }
    else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { if (started) { out.push(cur); cur = ''; started = false } }
    else { cur += c; started = true }
  }
  if (started) out.push(cur)
  return out
}

function addHeader(headers, line) {
  const i = line.indexOf(':')
  if (i < 0) { headers.push({ id: uid(), enabled: true, key: line.trim(), value: '' }); return }
  headers.push({ id: uid(), enabled: true, key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() })
}

/* ===================== Postman Collection v2.1 ===================== */
export function parsePostmanCollection(data) {
  const items = []
  function walk(item, folderPath) {
    if (item.item) {
      const newPath = folderPath ? [...folderPath, item.name] : [item.name]
      item.item.forEach(sub => walk(sub, newPath))
    } else if (item.request) {
      const req = item.request
      const parsed = { id: uid(), name: item.name, method: req.method || 'GET', url: '', params: [], headers: [], body: '', bodyType: 'none', formBody: [blankRow()], folder: folderPath || [] }
      if (req.url) {
        if (typeof req.url === 'string') parsed.url = req.url
        else if (req.url.raw) parsed.url = req.url.raw
        else if (req.url.path) parsed.url = (req.url.protocol || 'https') + '://' + (req.url.host || []).join('.') + '/' + (req.url.path || []).join('/')
        if (req.url.query && Array.isArray(req.url.query)) parsed.params = req.url.query.map(q => ({ id: uid(), enabled: q.disabled !== true, key: q.key || '', value: q.value || '' }))
        if (req.url.variable && Array.isArray(req.url.variable)) req.url.variable.forEach(v => { if (!parsed.params.find(p => p.key === v.key)) parsed.params.push({ id: uid(), enabled: true, key: v.key || '', value: v.value || '' }) })
        parsed.params.push(blankRow())
      }
      if (req.header && Array.isArray(req.header)) parsed.headers = req.header.map(h => ({ id: uid(), enabled: h.disabled !== true, key: h.key || '', value: h.value || '' }))
      parsed.headers.push(blankRow())
      if (req.body) {
        if (req.body.mode === 'raw' && req.body.raw) { parsed.body = req.body.raw; parsed.bodyType = 'json' }
        else if (req.body.mode === 'urlencoded' && req.body.urlencoded) { parsed.bodyType = 'form'; parsed.formBody = req.body.urlencoded.map(f => ({ id: uid(), enabled: f.disabled !== true, key: f.key || '', value: f.value || '' })) }
        else if (req.body.mode === 'formdata' && req.body.formdata) { parsed.bodyType = 'form'; parsed.formBody = req.body.formdata.map(f => ({ id: uid(), enabled: f.disabled !== true, key: f.key || '', value: f.value || '' })) }
      }
      items.push(parsed)
    }
  }
  if (data.item) data.item.forEach(item => walk(item, []))
  else if (Array.isArray(data)) data.forEach(item => walk(item, []))
  return { items, name: data.info?.name || data.name || '导入的集合' }
}

/* ===================== OpenAPI 3.0 ===================== */
export function parseOpenAPI(data) {
  const items = []
  const baseUrl = data.servers?.[0]?.url || ''
  if (data.paths) {
    for (const [path, methods] of Object.entries(data.paths)) {
      for (const [method, spec] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
          const parsed = { id: uid(), name: spec.summary || spec.operationId || `${method.toUpperCase()} ${path}`, method: method.toUpperCase(), url: (baseUrl + path).replace(/\/+$/, ''), params: [], headers: [], body: '', bodyType: 'none', formBody: [blankRow()], folder: [spec.tags?.[0] || '未分类'] }
          if (spec.parameters) {
            spec.parameters.forEach(p => {
              if (p.in === 'query') parsed.params.push({ id: uid(), enabled: p.required !== false, key: p.name, value: p.example !== undefined ? String(p.example) : (p.schema?.default !== undefined ? String(p.schema.default) : '') })
              else if (p.in === 'header') parsed.headers.push({ id: uid(), enabled: p.required !== false, key: p.name, value: p.example !== undefined ? String(p.example) : (p.schema?.default !== undefined ? String(p.schema.default) : '') })
            })
          }
          parsed.params.push(blankRow()); parsed.headers.push(blankRow())
          if (spec.requestBody?.content) {
            const content = spec.requestBody.content
            if (content['application/json']) { parsed.body = JSON.stringify(content['application/json'].example || generateExampleFromSchema(content['application/json'].schema), null, 2); parsed.bodyType = 'json' }
            else if (content['application/x-www-form-urlencoded']?.schema?.properties) { parsed.bodyType = 'form'; parsed.formBody = Object.entries(content['application/x-www-form-urlencoded'].schema.properties).map(([k, v]) => ({ id: uid(), enabled: true, key: k, value: v.example !== undefined ? String(v.example) : '' })) }
          }
          items.push(parsed)
        }
      }
    }
  }
  return { items, name: data.info?.title || '导入的 API' }
}

function generateExampleFromSchema(schema) {
  if (!schema) return {}
  if (schema.example !== undefined) return schema.example
  if (schema.type === 'object') { const obj = {}; if (schema.properties) for (const [k, v] of Object.entries(schema.properties)) obj[k] = generateExampleFromSchema(v); return obj }
  if (schema.type === 'array') return [generateExampleFromSchema(schema.items || {})]
  if (schema.type === 'string') return schema.enum?.[0] || 'string'
  if (schema.type === 'integer') return 0
  if (schema.type === 'number') return 0.0
  if (schema.type === 'boolean') return false
  return null
}

/* ===================== HAR ===================== */
export function parseHAR(data) {
  const items = []
  ;(data.log?.entries || []).forEach(entry => {
    const req = entry.request
    if (!req) return
    const parsed = { id: uid(), name: `${req.method} ${new URL(req.url).pathname}`, method: req.method || 'GET', url: req.url || '', params: [], headers: [], body: '', bodyType: 'none', formBody: [blankRow()], folder: ['HAR 导入'] }
    if (req.queryString) parsed.params = req.queryString.map(q => ({ id: uid(), enabled: true, key: q.name || '', value: q.value || '' }))
    parsed.params.push(blankRow())
    if (req.headers) parsed.headers = req.headers.filter(h => !/^(host|content-length|cookie|user-agent|origin|referer)/i.test(h.name)).map(h => ({ id: uid(), enabled: true, key: h.name || '', value: h.value || '' }))
    parsed.headers.push(blankRow())
    if (req.postData) {
      if (req.postData.mimeType?.includes('json')) { parsed.body = req.postData.text || ''; parsed.bodyType = 'json' }
      else if (req.postData.mimeType?.includes('x-www-form-urlencoded')) { parsed.bodyType = 'form'; parsed.formBody = (req.postData.params || []).map(p => ({ id: uid(), enabled: true, key: p.name || '', value: p.value || '' })) }
      else { parsed.body = req.postData.text || ''; parsed.bodyType = 'text' }
    }
    items.push(parsed)
  })
  return { items, name: 'HAR 导入 (' + items.length + ' 个请求)' }
}

/* ===================== 导出 cURL ===================== */
export function toCurl(request) {
  let url = request.url || ''
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url
  const Q = s => "'" + String(s).replace(/'/g, "'\\''") + "'"
  const parts = ['curl -X ' + request.method + ' ' + Q(url)]
  if (request.headers) {
    const seen = new Set()
    request.headers.forEach(h => { if (h.enabled !== false && h.key && !seen.has(h.key.toLowerCase())) { parts.push('-H ' + Q(h.key + ': ' + h.value)); seen.add(h.key.toLowerCase()) } })
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    if (request.bodyType === 'json' || request.bodyType === 'text') parts.push('--data-raw ' + Q(request.body))
    else if (request.bodyType === 'form' && Array.isArray(request.formBody)) {
      const form = request.formBody.filter(f => f.enabled !== false && f.key).map(f => encodeURIComponent(f.key) + '=' + encodeURIComponent(f.value)).join('&')
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
  } catch (e) { return 'unknown' }
}

/* ===================== 代码生成 ===================== */
export function generateCode(request, language) {
  switch (language) {
    case 'curl': return toCurl(request)
    case 'python': return generatePython(request)
    case 'javascript': return generateJavaScript(request)
    case 'go': return generateGo(request)
    case 'rust': return generateRust(request)
    default: return ''
  }
}

function generatePython(req) {
  const lines = ['import requests', '']
  const headers = {}
  if (req.headers) req.headers.forEach(h => { if (h.enabled !== false && h.key) headers[h.key] = h.value })
  if (Object.keys(headers).length) lines.push('headers = ' + JSON.stringify(headers, null, 2))
  if (!['GET', 'HEAD'].includes(req.method) && req.body) {
    if (req.bodyType === 'json') {
      try { const body = JSON.parse(req.body); lines.push('', 'data = ' + JSON.stringify(body, null, 2), '', 'response = requests.' + req.method.toLowerCase() + '("' + req.url + '", headers=headers, json=data)') }
      catch (e) { lines.push('', 'data = """' + req.body + '"""', '', 'response = requests.' + req.method.toLowerCase() + '("' + req.url + '", headers=headers, data=data)') }
    } else { lines.push('', 'data = """' + req.body + '"""', '', 'response = requests.' + req.method.toLowerCase() + '("' + req.url + '", headers=headers, data=data)') }
  } else { lines.push('', 'response = requests.' + req.method.toLowerCase() + '("' + req.url + '", headers=headers)') }
  lines.push('', 'print(response.status_code)', 'print(response.text)')
  return lines.join('\n')
}

function generateJavaScript(req) {
  const headers = {}
  if (req.headers) req.headers.forEach(h => { if (h.enabled !== false && h.key) headers[h.key] = h.value })
  const opts = { method: req.method || 'GET', headers }
  if (!['GET', 'HEAD'].includes(req.method) && req.body) opts.body = req.body
  return 'const response = await fetch("' + req.url + '", ' + JSON.stringify(opts, null, 2) + ')\nconst data = await response.json()\nconsole.log(data)'
}

function generateGo(req) {
  const lines = ['package main', '', 'import (', '  "fmt"', '  "io"', '  "net/http"', '  "strings"', ')', '', 'func main() {', '  url := "' + req.url + '"']
  if (!['GET', 'HEAD'].includes(req.method) && req.body) { lines.push('  payload := strings.NewReader(`' + req.body + '`)', '  req, _ := http.NewRequest("' + req.method + '", url, payload)') }
  else { lines.push('  req, _ := http.NewRequest("' + req.method + '", url, nil)') }
  if (req.headers) req.headers.forEach(h => { if (h.enabled !== false && h.key) lines.push('  req.Header.Set("' + h.key + '", "' + h.value + '")') })
  lines.push('  client := &http.Client{}', '  resp, err := client.Do(req)', '  if err != nil {', '    fmt.Println(err)', '    return', '  }', '  defer resp.Body.Close()', '  body, _ := io.ReadAll(resp.Body)', '  fmt.Println(string(body))', '}')
  return lines.join('\n')
}

function generateRust(req) {
  const lines = ['use reqwest;', '#[tokio::main]', 'async fn main() -> Result<(), Box<dyn std::error::Error>> {', '  let client = reqwest::Client::new();']
  if (!['GET', 'HEAD'].includes(req.method) && req.body) {
    lines.push('  let body = r#"' + req.body + '#";', '  let resp = client.' + req.method.toLowerCase() + '("' + req.url + '")')
    if (req.headers) req.headers.forEach(h => { if (h.enabled !== false && h.key) lines.push('    .header("' + h.key + '", "' + h.value + '")') })
    lines.push('    .body(body.to_string())', '    .send().await?;')
  } else {
    lines.push('  let resp = client.' + req.method.toLowerCase() + '("' + req.url + '")')
    if (req.headers) req.headers.forEach(h => { if (h.enabled !== false && h.key) lines.push('    .header("' + h.key + '", "' + h.value + '")') })
    lines.push('    .send().await?;')
  }
  lines.push('  println!("{:#?}", resp.text().await?);', '  Ok(())', '}')
  return lines.join('\n')
}