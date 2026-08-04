#!/usr/bin/env node
/**
 * Habit Tracker Service
 * API: GET /__health | GET /habits | GET /habits/due | POST /habits | POST /habits/:id/done | DELETE /habits/:id | GET /stats
 * 端口 argv[2]，appConfigDir argv[3]
 */
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const PORT = parseInt(process.argv[2] || '0', 10) || 4782
const APP_CONFIG_DIR = process.argv[3] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-habit')
const DATA_FILE = path.join(DATA_DIR, 'habits.json')
fs.mkdirSync(DATA_DIR, { recursive: true })
function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { habits: [], nextId: 1 } } }
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()

function isDue(h) {
  if (!h.lastDone) return true
  const period = h.frequency === 'daily' ? 86400000 : 604800000
  return Date.now() - h.lastDone >= period
}
function calcStreak(h) {
  if (!h.lastDone) return 0
  const period = h.frequency === 'daily' ? 86400000 : 604800000
  const days = Math.floor((Date.now() - h.history?.[0] || h.lastDone) / period)
  // 简化：连续天数 = history 中连续完成的周期数
  return h.streak || 0
}

function readBody(req) { return new Promise((resolve) => { let b = ''; req.on('data', c => { b += c }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } }) }) }
function send(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)) }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = url.pathname
  if (req.method === 'OPTIONS') { send(res, 204, {}); return }
  if (p === '/__health' && req.method === 'GET') return send(res, 200, { status: 'ok', habits: store.habits.length })
  if (p === '/stats' && req.method === 'GET') {
    const due = store.habits.filter(isDue).length
    const totalStreak = store.habits.reduce((s, h) => s + (h.streak || 0), 0)
    return send(res, 200, { total: store.habits.length, due, totalStreak, avgStreak: store.habits.length ? Math.round(totalStreak / store.habits.length * 10) / 10 : 0 })
  }
  if (p === '/habits/due' && req.method === 'GET') return send(res, 200, { habits: store.habits.filter(isDue) })
  if (p === '/habits' && req.method === 'GET') return send(res, 200, { habits: store.habits })
  if (p === '/habits' && req.method === 'POST') {
    const body = await readBody(req)
    const h = { id: 'h' + (store.nextId++), name: body.name || '新习惯', frequency: body.frequency || 'daily', streak: 0, lastDone: null, history: [], createdAt: Date.now() }
    store.habits.push(h); save(store)
    return send(res, 201, h)
  }
  const m = p.match(/^\/habits\/([^/]+)\/done$/)
  if (m && req.method === 'POST') {
    const idx = store.habits.findIndex(h => h.id === m[1])
    if (idx === -1) return send(res, 404, { error: '未找到' })
    const h = store.habits[idx]
    const period = h.frequency === 'daily' ? 86400000 : 604800000
    // 连续：上次打卡距今约 1 周期 → streak+1，否则重置为 1
    if (h.lastDone && Date.now() - h.lastDone < period * 2) h.streak = (h.streak || 0) + 1
    else h.streak = 1
    h.lastDone = Date.now()
    h.history = [h.lastDone, ...(h.history || [])].slice(0, 30)
    save(store)
    return send(res, 200, h)
  }
  const dm = p.match(/^\/habits\/([^/]+)$/)
  if (dm && req.method === 'DELETE') {
    const before = store.habits.length
    store.habits = store.habits.filter(h => h.id !== dm[1])
    if (store.habits.length === before) return send(res, 404, { error: '未找到' })
    save(store)
    return send(res, 200, { ok: true })
  }
  send(res, 404, { error: 'Not found: ' + p })
})
server.listen(PORT, '127.0.0.1', () => { console.log(`Habit service → http://localhost:${PORT}`); process.send?.({ type: 'ready', port: PORT }) })
process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('uncaughtException', (e) => console.error('habit-svc error:', e.message))
