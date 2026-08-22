// server.js — Polaris API 代理服务（跨域转发 + 健康检查）
import http from 'node:http'
import https from 'node:https'

const PORT = parseInt(process.argv[2] || '9870')
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'])
const DROP_REQ_HEADERS = new Set(['host', 'content-length', 'origin', 'x-polaris-target'])

const httpsAgent = new https.Agent({ rejectUnauthorized: false })

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(Buffer.alloc(0)))
  })
}

function sendJSON(res, code, data) {
  const payload = Buffer.from(JSON.stringify(data), 'utf-8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.length),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

async function proxyOnce(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const lib = u.protocol === 'https:' ? https : http
    const h = { ...headers }
    const hasBody = body && body.length && method !== 'GET' && method !== 'HEAD'
    if (hasBody) h['content-length'] = String(body.length)
    const opts = { method, headers: h }
    if (u.protocol === 'https:') opts.agent = httpsAgent
    const r = lib.request(u, opts, (resp) => {
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => resolve({ statusCode: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks) }))
    })
    r.on('error', reject)
    if (hasBody) r.write(body)
    r.end()
  })
}

async function handleProxy(req, res) {
  const target = req.headers['x-polaris-target']
  if (!target) return sendJSON(res, 400, { error: 'missing X-Polaris-Target header' })

  const body = await readBody(req)
  const outHeaders = {}
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase()
    if (DROP_REQ_HEADERS.has(lk) || HOP_HEADERS.has(lk)) continue
    outHeaders[k] = v
  }

  let method = req.method
  let url = target
  let sendBody = body
  let result

  try {
    for (let hop = 0; hop <= 5; hop++) {
      result = await proxyOnce(url, method, outHeaders, sendBody)
      const sc = result.statusCode
      const loc = result.headers.location
      if ([301, 302, 303, 307, 308].includes(sc) && loc && hop < 5) {
        url = new URL(loc, url).toString()
        if (sc === 303 || ((sc === 301 || sc === 302) && method !== 'GET' && method !== 'HEAD')) {
          method = 'GET'
          sendBody = null
          delete outHeaders['content-type']
          delete outHeaders['Content-Type']
        }
        continue
      }
      break
    }
  } catch (e) {
    return sendJSON(res, 502, { error: 'proxy failed: ' + (e.message || e), target })
  }

  const respHeaders = {}
  for (const [k, v] of Object.entries(result.headers)) {
    const lk = k.toLowerCase()
    // 过滤 hop-by-hop、content-length、set-cookie 以及上游的 CORS 头（避免 ACAO 重复）
    if (HOP_HEADERS.has(lk) || lk === 'content-length' || lk === 'set-cookie') continue
    if (lk === 'access-control-allow-origin' || lk === 'access-control-allow-methods' || lk === 'access-control-allow-headers' || lk === 'access-control-expose-headers' || lk === 'access-control-allow-credentials' || lk === 'access-control-max-age') continue
    respHeaders[k] = v
  }
  respHeaders['Content-Length'] = String(result.body.length)
  respHeaders['Access-Control-Allow-Origin'] = '*'
  respHeaders['X-Polaris-Proxy'] = '1'

  res.writeHead(result.statusCode, respHeaders)
  if (req.method === 'HEAD') return res.end()
  res.end(result.body)
}

const server = http.createServer((req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    })
    return res.end()
  }

  const url = new URL(req.url, 'http://x')

  if (url.pathname === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, service: 'polaris-api-proxy', port: PORT }))
  }

  if (url.pathname === '/__proxy') {
    return handleProxy(req, res)
  }

  // 默认响应
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, message: 'Polaris API Proxy Server' }))
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. polaris-api-proxy exiting.`)
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`Polaris API Proxy Server running on port ${PORT}`)
})