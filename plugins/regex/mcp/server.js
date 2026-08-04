#!/usr/bin/env node
/**
 * Regex Builder MCP Server
 * 工具：build_regex / test_regex / explain_regex
 * 纯 MCP，无 Panel/ChatCard（最轻量插件示例）。
 */
'use strict'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TEMPLATES = [
  { keys: ['email', '邮箱', '电邮'], pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', desc: '匹配邮箱地址', flags: '' },
  { keys: ['url', '网址', '链接'], pattern: '^https?://[\\w\\-]+(\\.[\\w\\-]+)+[/#?].*$', desc: '匹配 HTTP URL', flags: '' },
  { keys: ['phone', '手机', '电话'], pattern: '^1[3-9]\\d{9}$', desc: '匹配中国大陆手机号', flags: '' },
  { keys: ['ip', 'ipv4'], pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$', desc: '匹配 IPv4 地址', flags: '' },
  { keys: ['date', '日期'], pattern: '^\\d{4}-\\d{2}-\\d{2}$', desc: '匹配 YYYY-MM-DD 日期', flags: '' },
  { keys: ['number', '数字', '整数'], pattern: '^-?\\d+$', desc: '匹配整数', flags: '' },
  { keys: ['uuid', 'guid'], pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', desc: '匹配 UUID', flags: '' },
  { keys: ['hex', '十六进制', '颜色'], pattern: '^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', desc: '匹配十六进制颜色', flags: '' },
]

function buildRegex(intent) {
  const i = String(intent || '').toLowerCase()
  const t = TEMPLATES.find(x => x.keys.some(k => i.includes(k.toLowerCase())))
  if (t) return { pattern: t.pattern, flags: t.flags || '', desc: t.desc, source: 'template' }
  // 无模板：返回通用骨架
  return { pattern: '\\b' + intent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30) + '\\b', flags: '', desc: `匹配含「${intent}」的文本（通用骨架，建议 AI 精炼）`, source: 'fallback' }
}

function testRegex(pattern, text, flags) {
  try {
    const re = new RegExp(pattern, flags || 'g')
    const matches = []
    if (flags && flags.includes('g')) {
      let m
      while ((m = re.exec(text)) !== null) { matches.push({ match: m[0], index: m.index, groups: m.slice(1) }); if (m.index === re.lastIndex) re.lastIndex++ }
    } else {
      const m = re.exec(text)
      if (m) matches.push({ match: m[0], index: m.index, groups: m.slice(1) })
    }
    return { ok: true, matches, count: matches.length }
  } catch (e) { return { ok: false, error: e.message } }
}

function explainRegex(pattern) {
  const parts = []
  // 简化逐段解释
  if (/^\^/.test(pattern)) parts.push('^ — 匹配字符串开头')
  if (/\$$/.test(pattern)) parts.push('$ — 匹配字符串结尾')
  if (/\[([^\]]+)\]/.exec(pattern)) parts.push(`[${RegExp.$1}] — 字符集，匹配其中任一字符`)
  if (/\{(\d+)(?:,(\d+))?\}/.exec(pattern)) parts.push(`{${RegExp.$1}${RegExp.$2 ? ',' + RegExp.$2 : ''}} — 重复次数`)
  if (/\+/.test(pattern)) parts.push('+ — 一次或多次')
  if (/\*/.test(pattern)) parts.push('* — 零次或多次')
  if (/\?/.test(pattern)) parts.push('? — 零次或一次（或非贪婪修饰）')
  if (/\\d/.test(pattern)) parts.push('\\d — 数字 [0-9]')
  if (/\\w/.test(pattern)) parts.push('\\w — 单词字符 [a-zA-Z0-9_]')
  if (/\\s/.test(pattern)) parts.push('\\s — 空白字符')
  if (/\(\?:/.test(pattern)) parts.push('(?:...) — 非捕获分组')
  else if (/\(/.test(pattern)) parts.push('(...) — 捕获分组')
  if (parts.length === 0) return '未识别常见语法元素'
  return parts.join('\n')
}

const tools = [
  { name: 'build_regex', description: '根据意图描述生成正则表达式骨架（邮箱/URL/手机号/IP/日期/UUID/颜色等模板）。返回 pattern/flags/desc。', inputSchema: { type: 'object', properties: { intent: { type: 'string', description: '意图描述（如"匹配邮箱"）' }, flags: { type: 'string', description: '可选标志（如 i/g/m）' } }, required: ['intent'] } },
  { name: 'test_regex', description: '执行正则匹配测试。返回所有匹配项（含位置与捕获组）。pattern 为正则字符串。', inputSchema: { type: 'object', properties: { pattern: { type: 'string', description: '正则字符串' }, text: { type: 'string', description: '待测文本' }, flags: { type: 'string', description: '标志（g/i/m/s）', default: 'g' } }, required: ['pattern', 'text'] } },
  { name: 'explain_regex', description: '逐段解释正则语法元素。', inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'regex-builder', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'build_regex') {
      const r = buildRegex(args.intent)
      const text = `${r.desc}\n\n正则: \`${r.pattern}\`\n标志: \`${args.flags || r.flags || ''}\`\n来源: ${r.source}\n\n可用 test_regex 验证。`
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { ...r, flags: args.flags || r.flags } } })
    }
    if (name === 'test_regex') {
      const r = testRegex(args.pattern, args.text, args.flags)
      if (!r.ok) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ 正则错误: ${r.error}` }], isError: true } })
      const text = r.count ? `匹配 ${r.count} 项：\n\n` + r.matches.map((m, i) => `${i + 1}. "${m.match}" @${m.index}${m.groups && m.groups.length ? ` (组: ${m.groups.join(', ')})` : ''}`).join('\n') : '无匹配'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: r } })
    }
    if (name === 'explain_regex') {
      const e = explainRegex(args.pattern)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `「${args.pattern}」语法解释：\n\n${e}` }], _meta: { explanation: e } } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
