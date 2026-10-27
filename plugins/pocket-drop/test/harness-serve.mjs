// 静态伺服 harness（仅验证用）：node test/harness-serve.mjs [port]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2]) || 19890
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }

http.createServer((req, res) => {
  const name = req.url === '/' ? 'harness.html' : decodeURIComponent(req.url.slice(1))
  const file = path.join(ROOT, path.normalize(name).replace(/^(\.\.[/\\])+/, ''))
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return }
  try {
    const buf = fs.readFileSync(file)
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
    res.end(buf)
  } catch (_) {
    res.writeHead(404); res.end('not found')
  }
}).listen(PORT, '127.0.0.1', () => console.log(`harness: http://127.0.0.1:${PORT}/harness.html`))
