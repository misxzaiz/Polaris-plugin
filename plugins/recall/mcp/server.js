#!/usr/bin/env node
/**
 * Recall Cards MCP Server
 *
 * 工具：
 *   - generate_cards(notes, deck)   AI 从笔记文本提取 Q&A 卡片（本地启发式），经 Service 持久化
 *   - list_due_cards()              列出到期卡片
 *   - review_card(id, grade)        记录复习结果（4 档评分）
 *   - quiz_me(deck)                 抽一张到期卡片作为交互问答（interaction 模式触发）
 *
 * JSON-RPC 2.0 over stdin/stdout。
 * pluginDir 由 argsTemplate 注入（argv[2]），用于读取 Service 端口配置。
 * Service 端口通过环境变量 RECALL_PORT 传入（Polaris 启动 Service 后设置），
 * 或默认 4781。
 */
'use strict'
const http = require('http')

const PORT = parseInt(process.env.RECALL_PORT || '4781', 10)
const HOST = '127.0.0.1'

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname: HOST, port: PORT, method, path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 }
    }, (res) => {
      let b = ''
      res.on('data', c => { b += c })
      res.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

/* ---------------- 本地 Q&A 启发式提取 ---------------- */
/**
 * 从纯文本笔记中提取问答对。
 * 策略：按句号/换行分段 → 每段生成一个 Q&A。
 *   - 若段含"是/为/等于/means/is"：转为"X 是什么？"
 *   - 若段含"因为...所以"：转因果问答
 *   - 否则：转"关于...的要点是什么？"
 * 这不是 LLM 级理解，而是给 AI 一个合法骨架；AI 调用后可进一步精炼。
 */
function extractCards(notes, deck) {
  const text = String(notes || '').trim()
  if (!text) return []
  const segments = text.split(/\r?\n|。|\.|\n/).map(s => s.trim()).filter(s => s.length > 3)
  const cards = []
  for (const seg of segments) {
    let front = '', back = seg
    // 定义句："X 是 Y" / "X means Y"
    const def = seg.match(/^(.+?)\s*(?:是|为|是指|即是|等于|means|is|are)\s*(.+)$/)
    if (def) {
      front = `${def[1].trim()} 是什么？`
      back = def[2].trim()
    } else if (/因为|所以|导致|因此/.test(seg)) {
      const cm = seg.match(/^(.+?)\s*(?:因为|所以|因此|导致)\s*(.+)$/)
      if (cm) { front = `${cm[2].trim()} 的原因/结果是什么？`; back = seg }
      else { front = `关于「${seg.slice(0, 12)}…」的要点？`; back = seg }
    } else {
      front = `关于「${seg.slice(0, 16)}…」的要点？`
      back = seg
    }
    cards.push({ deck: deck || 'default', front, back, tags: ['auto'] })
  }
  return cards.slice(0, 20) // 单次最多 20 张，防过载
}

const tools = [
  {
    name: 'generate_cards',
    description: '从笔记文本自动生成问答记忆卡并保存到复习系统。AI 可基于此骨架进一步精炼。返回创建的卡片列表。',
    inputSchema: {
      type: 'object',
      properties: {
        notes: { type: 'string', description: '笔记原文（自然语言，按句号/换行分段）' },
        deck: { type: 'string', description: '卡片组名（如 "生物" "Python 命令"）', default: 'default' }
      },
      required: ['notes']
    }
  },
  {
    name: 'list_due_cards',
    description: '列出当前到期待复习的记忆卡。返回卡片列表（含正反面）。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'review_card',
    description: '对一张卡片记录复习评分。grade: again(重来)|hard(困难)|good(良好)|easy(简单)。影响下次复习间隔。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '卡片 id' },
        grade: { type: 'string', description: 'again|hard|good|easy' }
      },
      required: ['id', 'grade']
    }
  },
  {
    name: 'quiz_me',
    description: '抽取一张到期卡片，发起交互式问答（ChatCard interaction 模式）。用户在卡片中作答后回填结果。',
    inputSchema: {
      type: 'object',
      properties: { deck: { type: 'string', description: '可选：指定卡片组' } }
    }
  }
]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
    handle(msg).catch(err => send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: String(err && err.message || err) } }))
  }
})

async function handle(msg) {
  const { method, id, params } = msg
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'recall-cards', version: '1.0.0' }
    }})
  }
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools } })
  }
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'generate_cards') {
      const cards = extractCards(args.notes, args.deck)
      if (cards.length === 0) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '未从笔记中提取到有效段落，请补充内容。' }] } })
      }
      const res = await apiCall('POST', '/cards/bulk', { cards })
      const text = `已生成 ${res.count || cards.length} 张记忆卡（组: ${args.deck || 'default'}）。\n\n` +
        cards.slice(0, 5).map((c, i) => `${i + 1}. Q: ${c.front}\n   A: ${c.back}`).join('\n') +
        (cards.length > 5 ? `\n\n…共 ${cards.length} 张` : '')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { created: res.created || cards } } })
    }
    if (name === 'list_due_cards') {
      const res = await apiCall('GET', '/cards/due')
      const text = res.cards?.length
        ? `待复习 ${res.cards.length} 张：\n\n` + res.cards.slice(0, 8).map((c, i) => `${i + 1}. [${c.id}] ${c.front}`).join('\n')
        : '当前没有到期卡片，复习得很及时！'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: res } })
    }
    if (name === 'review_card') {
      const res = await apiCall('POST', `/cards/${encodeURIComponent(args.id)}/review`, { grade: args.grade })
      if (res.error) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ ${res.error}` }], isError: true } })
      }
      const next = res.due ? new Date(res.due).toLocaleString() : '即时'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已记录评分 ${args.grade}，下次复习: ${next}` }], _meta: res } })
    }
    if (name === 'quiz_me') {
      const res = await apiCall('GET', '/cards/due')
      const card = args.deck ? res.cards?.find(c => (c.deck || 'default') === args.deck) : res.cards?.[0]
      if (!card) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '当前没有到期卡片可测验。' }] } })
      }
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `测验: ${card.front}` }],
        _meta: { quiz: card, prompt: '请在卡片中作答，提交后查看正解并评分。' }
      }})
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}

process.on('uncaughtException', (e) => {
  try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {}
})
