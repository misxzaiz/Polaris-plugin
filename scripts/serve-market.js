#!/usr/bin/env node
/**
 * 本地商城静态服务：把本地目录变成插件商城源（零依赖，Node 内置模块）
 *
 * 用法:
 *   node scripts/serve-market.js [目录] [端口]
 *   node scripts/serve-market.js                      # 默认本仓库根目录，端口 8787
 *   node scripts/serve-market.js D:/path/to/market 8787
 *
 * 之后在 Polaris 插件商城面板：⚙ 商城源 → 填 http://127.0.0.1:8787/index.json → 保存
 *
 * 说明:
 *  - 带 CORS 头（插件面板 fetch 跨端口需要）
 *  - 仅绑定 127.0.0.1（不暴露局域网）；禁 path 穿越目录
 *  - 索引里的 downloadUrl 可写相对路径（相对 index.json 所在目录，
 *    面板解析后回本服务下载，宿主 install_remote 再从 127.0.0.1 拉包安装）
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const argRoot = process.argv[2]
const argPort = process.argv[3]
const ROOT = path.resolve(argRoot && argRoot.trim() ? argRoot : path.join(__dirname, '..'))
const PORT = Number(argPort && argPort.trim() ? argPort : 8787)

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

function safeJoin(base, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ''))
  const target = path.resolve(base, rel)
  // 禁目录穿越：解析后必须仍在 ROOT 内
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null
  return target
}

function listDir(dir, rel) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const rows = entries
    .filter((e) => e.isDirectory() || /\.(json|zip|md|txt)$/i.test(e.name))
    .sort((a, b) => (b.isDirectory() ? 1 : 0) - (a.isDirectory() ? 1 : 0) || a.name.localeCompare(b.name))
    .map((e) => {
      const href = '/' + [...rel.split('/').filter(Boolean), e.name].join('/')
      const label = e.isDirectory() ? `[dir] ${e.name}/` : e.name
      return `<li><a href="${href}">${label}</a></li>`
    })
    .join('')
  const parent = rel ? '<li><a href="..">../</a></li>' : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Polaris 本地商城 ${rel}</title></head><body style="font-family:monospace"><h3>Polaris 本地商城 · ${ROOT}</h3>${parent}<ul>${rows}</ul></body></html>`
}

const server = http.createServer((req, res) => {
  // CORS：插件面板（tauri://localhost / http://localhost:5173 等）跨端口 fetch 必需
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('只读服务：仅 GET/HEAD')
  }

  let urlPath = '/'
  try { urlPath = new URL(req.url || '/', `http://127.0.0.1:${PORT}`).pathname } catch { /* 兜底 '/') */ }
  const target = safeJoin(ROOT, urlPath)
  if (!target) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('403 禁止目录穿越')
  }

  fs.stat(target, (err, st) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end(`404 未找到: ${urlPath}`)
    }
    if (st.isDirectory()) {
      // 目录默认尝试 index.json（站位根/子目录），否则列目录
      const idx = path.join(target, 'index.json')
      if (fs.existsSync(idx) && (urlPath.endsWith('/') || !path.extname(urlPath))) {
        const type = MIME['.json']
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
        if (req.method === 'HEAD') return res.end()
        return fs.createReadStream(idx).pipe(res)
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(listDir(target, urlPath))
    }
    const ext = path.extname(target).toLowerCase()
    const type = MIME[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(target).pipe(res)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-market] http://127.0.0.1:${PORT}`)
  console.log(`[serve-market] 根目录: ${ROOT}`)
  console.log(`[serve-market] 面板设置 → 商城源: http://127.0.0.1:${PORT}/index.json`)
  console.log('[serve-market] Ctrl+C 停止')
})
