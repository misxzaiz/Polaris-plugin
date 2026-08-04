#!/usr/bin/env node
/**
 * Minutes Craft MCP Server
 *
 * 工具：
 *   - structure_minutes(text, type)   按模板结构化转写/笔记为会议纪要/周报/standup
 *   - extract_actions(text)           从文本提取待办项（负责人+动作）
 *   - format_report(minutes, style)    格式化输出为 Markdown / 纯文本
 *
 * JSON-RPC 2.0 over stdin/stdout。
 * 设计：提供结构骨架，AI 在对话侧精炼；MCP 负责模板与启发式提取。
 */
'use strict'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

/* ---------------- 模板 ---------------- */
const TEMPLATES = {
  meeting: {
    name: '会议纪要',
    sections: ['议题', '讨论要点', '决议', '待办事项', '下次会议'],
    skeleton: (d) => `# 会议纪要

**日期**: ${d.date || '（待填）'}
**参会**: ${d.attendees || '（待填）'}

## 议题
1. ${d.topics?.[0] || '议题一'}

## 讨论要点
- ${d.points?.[0] || '要点一'}

## 决议
- ${d.decisions?.[0] || '决议一'}

## 待办事项
${(d.actionLines && d.actionLines.length) ? d.actionLines.join('\n') : '- [ ] 待办一 (@负责人)'}

## 下次会议
- ${d.next || '待定'}`
  },
  weekly: {
    name: '周报',
    sections: ['本周完成', '下周计划', '风险与阻塞', '数据指标'],
    skeleton: (d) => `# 周报

**周期**: ${d.date || '（待填）'}
**负责人**: ${d.owner || '（待填）'}

## 本周完成
- ${d.done?.[0] || '完成项一'}

## 下周计划
- ${d.plan?.[0] || '计划项一'}

## 风险与阻塞
- ${d.risks?.[0] || '无'}

## 数据指标
- ${d.metrics || '（待填）'}`
  },
  standup: {
    name: '站会',
    sections: ['昨日完成', '今日计划', '阻塞'],
    skeleton: (d) => `# 每日站会

**日期**: ${d.date || '（待填）'}

## 昨日完成
- ${d.yesterday?.[0] || '昨日项一'}

## 今日计划
- ${d.today?.[0] || '今日项一'}

## 阻塞
- ${d.blockers?.[0] || '无'}`
  }
}

/* ---------------- 启发式提取 ---------------- */
function splitSentences(text) {
  return String(text || '')
    .split(/\r?\n|。|\.|；|;|！|!|\?|？/)
    .map(s => s.trim())
    .filter(s => s.length > 2)
}

function extractActions(text) {
  const sentences = splitSentences(text)
  const actions = []
  for (const s of sentences) {
    // 含动作词 + 负责人（@xxx 或 "由X"）
    const actionMatch = s.match(/^(.+?)(?:\s*[由@至给]\s*([^\s,，。]+))?(?:\s*(?:负责|完成|跟进|处理|对接| review))?(?:.*(?:前|内|by)\s*(.+?))?$/)
    if (/(?:负责|完成|跟进|处理|对接|安排|提交|发送|更新|修复|review|确认|推动|准备)/i.test(s)) {
      const owner = s.match(/@([^\s,，。]+)/) || s.match(/[由至给]\s*([^\s,，。]+)/)
      const deadline = s.match(/(?:前|内|by)\s*([^。\n，,]+)/i)
      actions.push({
        task: s.replace(/@([^\s,，。]+)/g, '').replace(/[由至给]\s*([^\s,，。]+)/g, '').trim(),
        owner: owner ? owner[1] : '',
        deadline: deadline ? deadline[1] : ''
      })
    }
  }
  return actions
}

function structureMinutes(text, type) {
  const t = TEMPLATES[type] ? type : 'meeting'
  const tpl = TEMPLATES[t]
  const sentences = splitSentences(text)
  const data = {
    date: new Date().toISOString().slice(0, 10),
    topics: sentences.slice(0, 3),
    points: sentences.slice(0, 4),
    decisions: sentences.filter(s => /决定|同意|确认|通过|决议|敲定|确定/.test(s)).slice(0, 3),
    actions: extractActions(text).slice(0, 5),
    actionLines: extractActions(text).slice(0, 5).map(a => `- [ ] ${a.task}${a.owner ? ' @' + a.owner : ''}${a.deadline ? ' ⏰' + a.deadline : ''}`),
    done: sentences.slice(0, 4),
    plan: sentences.slice(2, 6),
    risks: sentences.filter(s => /风险|阻塞|问题|担心|延期|卡住/.test(s)).slice(0, 3),
    yesterday: sentences.slice(0, 3),
    today: sentences.slice(2, 5),
    blockers: sentences.filter(s => /阻塞|卡|等|依赖|需要/.test(s)).slice(0, 3),
  }
  const code = tpl.skeleton(data)
  return { type: t, template: tpl.name, markdown: code, sections: tpl.sections, actions: data.actions }
}

function formatReport(minutes, style) {
  const md = typeof minutes === 'string' ? minutes : (minutes?.markdown || JSON.stringify(minutes, null, 2))
  if (style === 'plain') {
    return md.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/- \[ \]/g, '- ')
  }
  return md // markdown
}

const tools = [
  {
    name: 'structure_minutes',
    description: '将会议转写/笔记按模板结构化为纪要/周报/standup。返回 markdown 与分节。type: meeting|weekly|standup。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '会议转写/笔记原文（自然语言）' },
        type: { type: 'string', description: 'meeting|weekly|standup', default: 'meeting' }
      },
      required: ['text']
    }
  },
  {
    name: 'extract_actions',
    description: '从文本提取待办事项（任务+负责人+截止）。用于快速从纪要中捞出 action items。',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '文本原文' } }, required: ['text'] }
  },
  {
    name: 'format_report',
    description: '将结构化内容格式化为 Markdown 或纯文本。style: markdown|plain。',
    inputSchema: {
      type: 'object',
      properties: {
        minutes: { type: 'string', description: '结构化内容（markdown 字符串或对象）' },
        style: { type: 'string', description: 'markdown|plain', default: 'markdown' }
      },
      required: ['minutes']
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
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'minutes-craft', version: '1.0.0' } } })
  }
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'structure_minutes') {
      const res = structureMinutes(args.text, args.type)
      const text = `已按「${res.template}」结构化（${res.sections.length} 节），发现 ${res.actions.length} 个待办。\n\n${res.markdown}`
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: res } })
    }
    if (name === 'extract_actions') {
      const actions = extractActions(args.text)
      const text = actions.length
        ? `提取到 ${actions.length} 个待办：\n\n` + actions.map((a, i) => `${i + 1}. ${a.task}${a.owner ? ' @' + a.owner : ''}${a.deadline ? ' ⏰' + a.deadline : ''}`).join('\n')
        : '未提取到待办（文本中需含"负责/完成/跟进/处理/确认"等动作词）'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { actions } } })
    }
    if (name === 'format_report') {
      const out = formatReport(args.minutes, args.style)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: out }] } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}

process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
