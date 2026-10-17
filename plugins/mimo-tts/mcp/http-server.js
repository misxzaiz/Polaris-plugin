#!/usr/bin/env node
/**
 * mimo-tts 音频静态服务
 *
 * 托管 <pluginDir>/audio/ 目录下的合成音频，供面板与聊天卡片播放。
 * 启动参数：node http-server.js [port] [pluginDir]
 * 端点：
 *   GET /__health       健康检查
 *   GET /audio/<file>   静态音频文件（wav）
 *
 * 仅监听 127.0.0.1，本地安全。
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = parseInt(process.argv[2] || '9861', 10)
const PLUGIN_DIR = process.argv[3] || path.join(__dirname, '..')
const AUDIO_DIR = path.join(PLUGIN_DIR, 'audio')

function send(res, status, contentType, body) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = req.url || '/'

  // 健康检查
  if (url === '/__health') {
    return send(res, 200, 'application/json', JSON.stringify({ status: 'ok', uptime: process.uptime() }))
  }

  // 音频目录列表（供面板历史 tab）—— 必须放在静态文件分支前，避免 /audio/ 被当作文件读取
  if (url === '/audio' || url === '/audio/') {
    if (!fs.existsSync(AUDIO_DIR)) return send(res, 200, 'application/json', JSON.stringify([]))
    const files = fs.readdirSync(AUDIO_DIR)
      .filter((f) => /\.(wav|mp3)$/i.test(f))
      .sort()
      .reverse()
      .map((f) => {
        const stat = fs.statSync(path.join(AUDIO_DIR, f))
        return {
          name: f,
          url: `http://127.0.0.1:${PORT}/audio/${encodeURIComponent(f)}`,
          size: stat.isFile() ? stat.size : 0,
        }
      })
    return send(res, 200, 'application/json', JSON.stringify(files))
  }

  // 静态音频
  if (url.startsWith('/audio/')) {
    const name = path.basename(decodeURIComponent(url.slice('/audio/'.length)))
    // 防目录穿越：仅允许普通文件名，不含路径分隔符
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      return send(res, 400, 'text/plain', 'bad request')
    }
    const file = path.join(AUDIO_DIR, name)
    let stat
    try {
      stat = fs.statSync(file)
    } catch (_) {
      return send(res, 404, 'text/plain', 'not found')
    }
    if (!stat.isFile()) return send(res, 400, 'text/plain', 'bad request')
    const ext = path.extname(name).toLowerCase()
    const mime = ext === '.wav' ? 'audio/wav' : ext === '.mp3' ? 'audio/mpeg' : 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    })
    fs.createReadStream(file).pipe(res)
    return
  }

  send(res, 404, 'text/plain', 'not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mimo-tts] audio server → http://127.0.0.1:${PORT} (dir: ${AUDIO_DIR})`)
  process.send?.({ type: 'ready', port: PORT })
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
