// core/parser.js — cURL/Postman/OpenAPI/HAR 解析 + 代码生成（polaris-api 移植）

export function parseCurl(text) {
  const toks = tokenizeCurl(text.trim())
  if (toks[0] === 'curl') toks.shift()
  const headers = []
  let method = 'GET', url = ''
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
    else if (['--compressed', '-L', '--location', '-k', '--insecure', '-s', '--silent', '-S', '--show-error', '-i', '--include', '-v', '--verbose', '-f', '--fail', '-#', '--progress-bar', '-N', '--no-buffer'].includes(t)) {}
    else if (t.startsWith('-')) {}
    else if (!url) url = t
  }
  if (!method) method = dataArgs.length && !getFlag ? 'POST' : 'GET'
  method = method.toUpperCase()
  let body = dataArgs.join('&')
  if (getFlag && body) { url += (url.includes('?') ? '&' : '?') + body; body = '' }
  const ct = headers.find(h => h.key.toLowerCase() === 'content-type')
  let bodyType = 'none'
  if (body) { if (ct && /json/i.test(ct.value)) bodyType = 'json'; else if (/^\s*[\[{]/.test(body)) bodyType = 'json'; else bodyType = 'text' }
  if (bodyType === 'json') { try { body = JSON.stringify(JSON.parse(body), null, 2) } catch (e) {} }
  const params = []; let urlWithoutQuery = url; const qIdx = url.indexOf('?')
  if (qIdx >= 0) {
    urlWithoutQuery = url.slice(0, qIdx)
    url.slice(qIdx + 1).split('&').forEach(p => { if (!p) return; const eq = p.indexOf('='); params.push({ id: uid(), enabled: true, key: decodeURIComponent(eq >= 0 ? p.slice(0, eq) : p), value: decodeURIComponent(eq >= 0 ? p.slice(eq + 1) : '') }) })
  }
  params.push({ id: uid(), enabled: true, key: '', value: '' })
  return { method, url: urlWithoutQuery, headers, params, body, bodyType }
}

function tokenizeCurl(s) {
  s = s.replace(/\\\r?\n/g, ' ')
  const out = []; let cur = '', q = null, started = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') { cur += (s[++i] || '') } else cur += c }
    else if (c === '"' || c === "'") { q = c; started = true }
    else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { if (started) { out.push(cur); cur = ''; started = false } }
    else { cur += c; started = true }
  }
  if (started) out.push(cur)
  return out
}

function addHeader(headers, val) {
  const i = val.indexOf(':')
  if (i < 0) { headers.push({ id: uid(), enabled: true, key: val.trim(), value: '' }); return }
  headers.push({ id: uid(), enabled: true, key: val.slice(0, i).trim(), value: val.slice(i + 1).trim() })
}

function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

export function toCurl(request, env) {
  const rv = (s) => env ? resolveVars(s, env) : s
  const Q = s => "'" + String(s).replace(/'/g, "'\\''") + "'"
  let url = rv(request.url || '')
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url
  const parts = ['curl -X ' + request.method + ' ' + Q(url)]
  const headers = {}
  if (request.headers) request.headers.filter(h => h.enabled !== false && h.key).forEach(h => headers[rv(h.key)] = rv(h.value))
  let body = null
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.bodyType === 'json') { body = rv(request.body || ''); if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json' }
    else if (request.bodyType === 'text') body = rv(request.body || '')
    else if (request.bodyType === 'form' && Array.isArray(request.formBody)) body = request.formBody.filter(f => f.enabled !== false && f.key).map(f => encodeURIComponent(rv(f.key)) + '=' + encodeURIComponent(rv(f.value || ''))).join('&')
  }
  Object.entries(headers).forEach(([k, v]) => parts.push('-H ' + Q(k + ': ' + v)))
  if (body) parts.push('--data-raw ' + Q(body))
  return parts.join(' \\\n  ')
}

export function generateCode(request, language, env) {
  const rv = (s) => env ? resolveVars(s, env) : s
  let url = rv(request.url || '')
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = 'https://' + url
  const headers = {}
  if (request.headers) request.headers.filter(h => h.enabled !== false && h.key).forEach(h => headers[rv(h.key)] = rv(h.value))
  const method = (request.method || 'GET').toUpperCase()
  let body = null
  if (!['GET', 'HEAD'].includes(method)) {
    if (request.bodyType === 'json') body = rv(request.body || '')
    else if (request.bodyType === 'text') body = rv(request.body || '')
  }
  const codes = {
    curl: toCurl(request, env),
    python: `import requests\n\nurl = ${JSON.stringify(url)}\nheaders = ${JSON.stringify(headers)}\nresponse = requests.${method.toLowerCase()}(url, headers=headers${body ? ', json=' + body : ''})\nprint(response.json())`,
    js: `const response = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(method)},\n  headers: ${JSON.stringify(headers)}\n${body ? ',  body: ' + JSON.stringify(body) : ''}\n})\nconst data = await response.json()\nconsole.log(data)`,
    go: `package main\n\nimport (\n  "fmt"\n  "io/ioutil"\n  "net/http"\n)\n\nfunc main() {\n  url := ${JSON.stringify(url)}\n  req, _ := http.NewRequest(${JSON.stringify(method)}, url, nil)\n  ${Object.entries(headers).map(([k, v]) => `req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('\n  ')}\n  client := &http.Client{}\n  resp, _ := client.Do(req)\n  body, _ := ioutil.ReadAll(resp.Body)\n  fmt.Println(string(body))\n}`,
    rust: `use reqwest;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n  let client = reqwest::Client::new();\n  let resp = client.${method.toLowerCase()}(${JSON.stringify(url)})${Object.entries(headers).map(([k, v]) => `\n    .header(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join('')}\n    .send().await?;\n  println!("{:#?}", resp.text().await?);\n  Ok(())\n}`,
  }
  return codes[language] || codes.curl
}

export function detectImportType(text) {
  try {
    const data = JSON.parse(text)
    if (data.info?.name && data.item) return 'postman'
    if (data.openapi || data.swagger) return 'openapi'
    if (data.log?.entries) return 'har'
  } catch (e) {}
  return 'unknown'
}

export function parsePostmanCollection(data) {
  const items = []
  function walk(node) {
    if (node.request) {
      const req = node.request
      const headers = (req.header || []).map(h => ({ id: uid(), enabled: true, key: h.key, value: h.value }))
      headers.push({ id: uid(), enabled: true, key: '', value: '' })
      const params = []
      if (req.url?.query) req.url.query.forEach(q => params.push({ id: uid(), enabled: true, key: q.key, value: q.value || '' }))
      params.push({ id: uid(), enabled: true, key: '', value: '' })
      items.push({
        id: uid(), name: node.name, method: req.method || 'GET', url: req.url?.raw || '',
        params, headers, body: req.body?.raw || '', bodyType: req.body?.mode === 'raw' ? 'json' : 'none',
        formBody: [{ id: uid(), enabled: true, key: '', value: '' }],
      })
    }
    if (node.item) node.item.forEach(walk)
  }
  walk(data)
  return { name: data.info?.name || '导入的集合', items }
}

export function parseOpenAPI(data) {
  const items = []
  const paths = data.paths || {}
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, spec] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      const params = []
      if (spec.parameters) spec.parameters.forEach(p => params.push({ id: uid(), enabled: true, key: p.name, value: '' }))
      params.push({ id: uid(), enabled: true, key: '', value: '' })
      let body = '', bodyType = 'none'
      if (spec.requestBody?.content?.['application/json']) {
        body = JSON.stringify(spec.requestBody.content['application/json'].schema?.example || spec.requestBody.content['application/json'].schema || {}, null, 2)
        bodyType = 'json'
      }
      items.push({
        id: uid(), name: spec.summary || spec.operationId || method + ' ' + path,
        method: method.toUpperCase(), url: path,
        params, headers: [{ id: uid(), enabled: true, key: '', value: '' }],
        body, bodyType, formBody: [{ id: uid(), enabled: true, key: '', value: '' }],
      })
    }
  }
  return { name: data.info?.title || 'OpenAPI', items }
}

export function parseHAR(data) {
  const items = (data.log?.entries || []).map(entry => {
    const req = entry.request
    const params = (req.queryString || []).map(q => ({ id: uid(), enabled: true, key: q.name, value: q.value }))
    params.push({ id: uid(), enabled: true, key: '', value: '' })
    const headers = (req.headers || []).map(h => ({ id: uid(), enabled: true, key: h.name, value: h.value }))
    headers.push({ id: uid(), enabled: true, key: '', value: '' })
    let body = '', bodyType = 'none'
    if (req.postData) {
      body = req.postData.text || ''
      bodyType = req.postData.mimeType?.includes('json') ? 'json' : 'text'
    }
    return {
      id: uid(), name: entry.request.url.split('/').pop() || entry.request.url,
      method: req.method, url: req.url,
      params, headers, body, bodyType,
      formBody: [{ id: uid(), enabled: true, key: '', value: '' }],
    }
  })
  return { name: 'HAR 导入', items }
}