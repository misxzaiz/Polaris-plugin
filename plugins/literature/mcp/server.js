#!/usr/bin/env node
/**
 * Literature Matrix MCP Server
 * 工具：
 *   - extract_paper(text)        从摘要/笔记提取结构化字段
 *   - compare_papers(ids)        对比多篇成矩阵
 *   - format_citation(id, style)  格式化引用（APA/IEEE/GB-T7714）
 *   - list_papers()              列出库
 *   - save_paper(text)           保存并提取
 * 存储：appConfigDir（argv[2]）下 polaris-literature/papers.json
 */
'use strict'
const fs = require('fs')
const path = require('path')
const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-literature')
const DATA_FILE = path.join(DATA_DIR, 'papers.json')
fs.mkdirSync(DATA_DIR, { recursive: true })
function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { papers: {}, nextId: 1 } } }
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function extract(text) {
  const t = String(text || '').trim()
  if (!t) return null
  // 标题：取第一行或前 80 字
  const firstLine = t.split(/\r?\n/)[0].trim()
  const title = firstLine.length > 5 && firstLine.length < 120 ? firstLine : t.slice(0, 80)
  // 作者：匹配 "张三" / "Zhang" / "By X" / 作者: X
  const authorMatch = t.match(/(?:作者|by|authors?)[:\s]*([^\n。,，]{2,40})/i)
  const authors = authorMatch ? authorMatch[1].trim() : '（待补）'
  // 年份
  const yearMatch = t.match(/(19|20)\d{2}/)
  const year = yearMatch ? yearMatch[0] : '（待补）'
  // 方法：含 method/方法/实验/调查
  const methodMatch = t.match(/(?:method|方法|实验|调查|访谈|问卷|回归|分析|review|综述)[:\s]*([^\n。]{4,60})/i)
  const method = methodMatch ? methodMatch[1].trim() : '（待补）'
  // 样本：N= / 样本 / sample
  const sampleMatch = t.match(/(?:N=|n=|样本|sample|参与者)[:\s]*([0-9]+[^\n。，,]{0,20})/i)
  const sample = sampleMatch ? sampleMatch[1].trim() : '（待补）'
  // 结论：含 result/结论/发现/show
  const conclMatch = t.match(/(?:result|结论|发现|show|表明|证明|显示)[:\s]*([^\n。]{8,120})/i)
  const conclusion = conclMatch ? conclMatch[1].trim() : t.slice(-120)
  // 局限：limitation/局限/不足
  const limitMatch = t.match(/(?:limitation|局限|不足|缺陷|however|but)[:\s]*([^\n。]{4,80})/i)
  const limitation = limitMatch ? limitMatch[1].trim() : '（待补）'
  return { title, authors, year, method, sample, conclusion, limitation }
}

function formatCitation(p, style) {
  const a = p.authors || '作者'
  const y = p.year || ''
  const t = p.title || '标题'
  if (style === 'IEEE') return `[1] ${a}, "${t}," ${y}.`
  if (style === 'GB-T7714') return `${a}. ${t}[J]. ${y}.`
  // APA default
  return `${a} (${y}). ${t}.`
}

const tools = [
  { name: 'extract_paper', description: '从论文摘要/笔记提取结构化字段（标题/作者/年份/方法/样本/结论/局限）。', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '摘要或笔记原文' } }, required: ['text'] } },
  { name: 'save_paper', description: '保存论文并提取结构化字段，返回 id。', inputSchema: { type: 'object', properties: { text: { type: 'string' }, note: { type: 'string' } }, required: ['text'] } },
  { name: 'compare_papers', description: '对比多篇论文成矩阵表格。ids 为 id 数组。', inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } },
  { name: 'format_citation', description: '格式化引用。style: apa|ieee|gb-t7714。', inputSchema: { type: 'object', properties: { id: { type: 'string' }, style: { type: 'string' } }, required: ['id'] } },
  { name: 'list_papers', description: '列出文献库。', inputSchema: { type: 'object', properties: {} } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'literature-matrix', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load()
    if (name === 'extract_paper') {
      const e = extract(args.text)
      if (!e) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '未提取到内容' }] } })
      const text = `提取结果：\n\n• 标题: ${e.title}\n• 作者: ${e.authors}\n• 年份: ${e.year}\n• 方法: ${e.method}\n• 样本: ${e.sample}\n• 结论: ${e.conclusion}${e.limitation !== '（待补）' ? '\n• 局限: ' + e.limitation : ''}`
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { paper: e } } })
    }
    if (name === 'save_paper') {
      const e = extract(args.text) || { title: args.text.slice(0, 60), authors: '（待补）', year: '（待补）', method: '（待补）', sample: '（待补）', conclusion: '（待补）', limitation: '（待补）' }
      const pid = 'p' + (store.nextId++)
      store.papers[pid] = { id: pid, ...e, note: args.note || '', raw: args.text.slice(0, 500), ts: Date.now() }
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已保存 ${pid}：${e.title}` }], _meta: { id: pid, paper: e } } })
    }
    if (name === 'compare_papers') {
      const ids = args.ids || []
      const list = ids.map(id => store.papers[id]).filter(Boolean)
      if (list.length === 0) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '未找到指定论文' }], isError: true } })
      const fields = ['title', 'authors', 'year', 'method', 'sample', 'conclusion', 'limitation']
      const header = `| 字段 | ${list.map(p => p.title?.slice(0, 12) || p.id).join(' | ')} |\n|---|${list.map(() => '---|').join('')}`
      const rows = fields.map(f => `| ${f} | ${list.map(p => (p[f] || '—').toString().slice(0, 30).replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')
      const md = `${header}\n${rows}`
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `对比矩阵（${list.length} 篇）：\n\n${md}` }], _meta: { matrix: md, count: list.length } } })
    }
    if (name === 'format_citation') {
      const p = store.papers[args.id]
      if (!p) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      const cit = formatCitation(p, args.style)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: cit }], _meta: { citation: cit, style: args.style } } })
    }
    if (name === 'list_papers') {
      const list = Object.values(store.papers)
      const text = list.length ? `共 ${list.length} 篇：\n\n` + list.map(p => `• ${p.id} ${p.title?.slice(0, 40)} (${p.year})`).join('\n') : '暂无'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { papers: list } } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
