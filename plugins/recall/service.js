#!/usr/bin/env node
/**
 * Recall Cards 后台服务
 *
 * 职责：
 *  - 持久化卡片与复习记录到 appConfigDir 下的 JSON 文件
 *  - 简化 FSRS 调度：4 档评分 → 下次复习间隔
 *  - 提供 REST API 供 MCP server / Panel 调用
 *
 * 端口由 Polaris 通过 {{port}} 注入（命令行参数 1）
 * appConfigDir 由 {{appConfigDir}} 注入（命令行参数 2）
 *
 * API:
 *   GET    /__health            健康检查
 *   GET    /cards?deck=         列出卡片（可按 deck 过滤）
 *   GET    /cards/due           列出到期卡片
 *   POST   /cards               创建卡片 {deck,front,back}
 *   POST   /cards/bulk          批量创建 {cards:[...]}
 *   GET    /cards/:id           获取单卡
 *   POST   /cards/:id/review    评分 {grade: again|hard|good|easy}
 *   DELETE /cards/:id           删除卡片
 *   GET    /stats               统计（总数/到期/今日复习）
 */
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = parseInt(process.argv[2] || '0', 10) || 4781
const APP_CONFIG_DIR = process.argv[3] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-recall')
const DATA_FILE = path.join(DATA_DIR, 'cards.json')

fs.mkdirSync(DATA_DIR, { recursive: true })

/* ---------------- 数据持久化 ---------------- */
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
  catch { return { cards: [], nextId: 1 } }
}
function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2))
}
let store = loadData()

/* ---------------- 简化 FSRS 调度 ---------------- */
// 4 档评分对应间隔（天）
const INTERVALS = { again: 0, hard: 1, good: 3, easy: 7 }
function schedule(card, grade) {
  const now = Date.now()
  const interval = INTERVALS[grade] ?? 1
  const reps = grade === 'again' ? 0 : (card.reps || 0) + 1
  // 良好/简单后续间隔指数增长
  let nextInterval = interval
  if (reps > 1 && grade !== 'again') {
    nextInterval = Math.round((card.interval || 1) * (grade === 'easy' ? 2.5 : grade === 'good' ? 2.0 : 1.2))
    nextInterval = Math.max(nextInterval, interval)
  }
  return {
    ...card,
    reps,
    lastReview: now,
    interval: nextInterval,
    due: now + nextInterval * 86400000,
    grade
  }
}

/* ---------------- HTTP 工具 ---------------- */
function readBody(req) {
  return new Promise((resolve) => {
    let b = ''
    req.on('data', c => { b += c })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
  })
}
function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function getDueCards() {
  const now = Date.now()
  return store.cards.filter(c => !c.due || c.due <= now)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = url.pathname
  if (req.method === 'OPTIONS') { send(res, 204, {}); return }

  // 健康检查
  if (p === '/__health' && req.method === 'GET') {
    return send(res, 200, { status: 'ok', uptime: process.uptime(), cards: store.cards.length })
  }

  // 统计
  if (p === '/stats' && req.method === 'GET') {
    const due = getDueCards()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const reviewedToday = store.cards.filter(c => c.lastReview && c.lastReview >= today.getTime()).length
    return send(res, 200, { total: store.cards.length, due: due.length, reviewedToday, decks: [...new Set(store.cards.map(c => c.deck || 'default'))] })
  }

  // 到期卡片
  if (p === '/cards/due' && req.method === 'GET') {
    return send(res, 200, { cards: getDueCards() })
  }

  // 列出卡片
  if (p === '/cards' && req.method === 'GET') {
    const deck = url.searchParams.get('deck')
    let cards = store.cards
    if (deck) cards = cards.filter(c => (c.deck || 'default') === deck)
    return send(res, 200, { cards })
  }

  // 批量创建
  if (p === '/cards/bulk' && req.method === 'POST') {
    const body = await readBody(req)
    const created = (body.cards || []).map(item => {
      const card = {
        id: 'c' + (store.nextId++),
        deck: item.deck || 'default',
        front: String(item.front || ''),
        back: String(item.back || ''),
        tags: item.tags || [],
        reps: 0,
        interval: 0,
        due: Date.now(),
        createdAt: Date.now()
      }
      store.cards.push(card)
      return card
    })
    saveData(store)
    return send(res, 201, { created, count: created.length })
  }

  // 创建卡片
  if (p === '/cards' && req.method === 'POST') {
    const body = await readBody(req)
    const card = {
      id: 'c' + (store.nextId++),
      deck: body.deck || 'default',
      front: String(body.front || ''),
      back: String(body.back || ''),
      tags: body.tags || [],
      reps: 0,
      interval: 0,
      due: Date.now(),
      createdAt: Date.now()
    }
    store.cards.push(card)
    saveData(store)
    return send(res, 201, card)
  }

  // 单卡操作
  const m = p.match(/^\/cards\/([^/]+)$/)
  const rm = p.match(/^\/cards\/([^/]+)\/review$/)
  if (rm && req.method === 'POST') {
    const id = rm[1]
    const idx = store.cards.findIndex(c => c.id === id)
    if (idx === -1) return send(res, 404, { error: '未找到卡片' })
    const body = await readBody(req)
    const grade = ['again', 'hard', 'good', 'easy'].includes(body.grade) ? body.grade : 'good'
    store.cards[idx] = schedule(store.cards[idx], grade)
    saveData(store)
    return send(res, 200, store.cards[idx])
  }
  if (m && req.method === 'GET') {
    const card = store.cards.find(c => c.id === m[1])
    if (!card) return send(res, 404, { error: '未找到卡片' })
    return send(res, 200, card)
  }
  if (m && req.method === 'DELETE') {
    const before = store.cards.length
    store.cards = store.cards.filter(c => c.id !== m[1])
    if (store.cards.length === before) return send(res, 404, { error: '未找到卡片' })
    saveData(store)
    return send(res, 200, { ok: true })
  }

  send(res, 404, { error: 'Not found: ' + p })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Recall service → http://localhost:${PORT}`)
  process.send?.({ type: 'ready', port: PORT })
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('uncaughtException', (e) => console.error('recall-svc error:', e.message))
