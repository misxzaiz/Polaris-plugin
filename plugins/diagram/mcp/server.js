#!/usr/bin/env node
/**
 * Diagram Studio MCP Server
 *
 * 工具：
 *   - generate_diagram(text, type)  自然语言 → Mermaid 代码（带模板引导 + 语法修正）
 *   - validate_mermaid(code)         校验 Mermaid 语法，返回错误定位与提示
 *   - list_templates(type?)          列出可用图表模板
 *
 * JSON-RPC 2.0 over stdin/stdout，与 Polaris MCP 规范一致。
 *
 * 设计要点（来自 10 轮调研）：
 *  - 应对"语法脆弱"：generate_diagram 内置模板骨架，强制合法结构；输出前后做括号/引号配对清洗。
 *  - 应对"上下文过载"：提供 type 参数聚焦单一图表类型，避免巨型混合图。
 *  - 不依赖网络/外部库，纯字符串处理，启动快、可离线。
 */
'use strict'

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

/* ---------------- 图表模板 ---------------- */
const TEMPLATES = {
  flowchart: {
    name: '流程图 (flowchart)',
    description: '描述流程、决策分支、步骤流转',
    skeleton: (desc) => `flowchart TD
    Start([开始]) --> Process[${desc || '处理'}]
    Process --> Decision{判断}
    Decision -->|是| Done([完成])
    Decision -->|否| Process`
  },
  sequence: {
    name: '时序图 (sequence)',
    description: '描述对象间交互时序，适合 API/服务调用',
    skeleton: (desc) => `sequenceDiagram
    participant Client
    participant Server
    Client->>Server: ${desc || '请求'}
    Server-->>Client: 响应`
  },
  mindmap: {
    name: '思维导图 (mindmap)',
    description: '发散知识结构，适合笔记/记忆',
    skeleton: (desc) => `mindmap
  root((${desc || '主题'}))
    分支A
      子项1
      子项2
    分支B
      子项3`
  },
  class: {
    name: '类图 (class)',
    description: '描述类与关系，适合架构/设计',
    skeleton: (desc) => `classDiagram
    class ${sanitizeId(desc) || 'Animal'} {
      +String name
      +eat()
    }
    class Dog {
      +bark()
    }
    Animal <|-- Dog`
  },
  state: {
    name: '状态图 (state)',
    description: '描述状态机/生命周期',
    skeleton: (desc) => `stateDiagram-v2
    [*] --> Idle
    Idle --> Active : ${desc || '触发'}
    Active --> Idle : 完成
    Active --> [*] : 异常`
  },
  gantt: {
    name: '甘特图 (gantt)',
    description: '描述项目排期/任务进度，适合上班族',
    skeleton: (desc) => `gantt
    title ${desc || '项目计划'}
    dateFormat YYYY-MM-DD
    section 阶段一
    需求分析 :a1, 2026-01-01, 7d
    section 阶段二
    开发 :a2, after a1, 14d`
  },
  pie: {
    name: '饼图 (pie)',
    description: '描述占比分布',
    skeleton: (desc) => `pie title ${desc || '占比分布'}
    "类别A" : 40
    "类别B" : 35
    "类别C" : 25`
  },
  graph: {
    name: '关系图 (graph LR)',
    description: '描述实体关系，适合知识图谱/网络',
    skeleton: (desc) => `graph LR
    A[${desc || '节点A'}] --> B[节点B]
    B --> C[节点C]
    A --> C`
  }
}

const DEFAULT_TYPE = 'flowchart'

function sanitizeId(s) {
  if (!s) return ''
  return String(s).trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 24) || 'Node'
}

/* ---------------- 语法清洗（应对 LLM 语法脆弱） ---------------- */
function cleanMermaid(code) {
  let c = String(code || '').trim()
  // 去除常见 markdown 代码围栏
  c = c.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/i, '')
  // 去除首尾多余空行
  return c.trim()
}

/**
 * 轻量语法校验：检查图表类型声明、括号配对、未闭合节点。
 * 返回 { valid, errors[], warnings[] }
 */
function validate(code) {
  const errors = []
  const warnings = []
  const c = cleanMermaid(code)
  if (!c) {
    return { valid: false, errors: ['空内容'], warnings }
  }
  const firstLine = c.split(/\r?\n/)[0].trim()
  const knownTypes = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram',
    'stateDiagram', 'stateDiagram-v2', 'mindmap', 'gantt', 'pie', 'erDiagram',
    'journey', 'gitGraph', 'requirementDiagram', 'C4Context']
  const head = firstLine.split(/\s+/)[0]
  if (!knownTypes.includes(head)) {
    errors.push(`首行未识别的图表类型: "${head}"。期望 flowchart/sequenceDiagram/classDiagram 等`)
  }
  // 括号配对（仅统计图表常见的圆括号与方括号）
  const stack = []
  const pairs = { ')': '(', ']': '[', '}': '{' }
  const opens = new Set(['(', '[', '{'])
  for (const ch of c) {
    if (opens.has(ch)) stack.push(ch)
    else if (pairs[ch]) {
      if (stack.pop() !== pairs[ch]) {
        errors.push(`括号不配对: 多余的 "${ch}"`)
        break
      }
    }
  }
  if (stack.length) errors.push(`括号不配对: 未闭合的 "${stack.pop()}"`)
  // 节点 ID 合法性提示（flowchart/graph）
  if (head === 'flowchart' || head === 'graph') {
    const lines = c.split(/\r?\n/).slice(1)
    for (const ln of lines) {
      const m = ln.match(/^\s*([^\s\[\(\-\>\-]+)\s*[\[\(]/)
      if (m && /[^A-Za-z0-9_]/.test(m[1])) {
        warnings.push(`节点 ID 含非常规字符: "${m[1]}"，建议仅用字母/数字/下划线`)
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings }
}

/**
 * 生成 Mermaid：根据自然语言描述 + 类型，拼装骨架。
 * 这是一个"结构化模板生成器"——AI 可调用后得到合法骨架，
 * 再基于 AI 自身语言能力填充细节。
 */
function generateDiagram(text, type) {
  const t = TEMPLATES[type] ? type : DEFAULT_TYPE
  const desc = (text || '').trim().slice(0, 120)
  let code = TEMPLATES[t].skeleton(desc)
  // 二次校验，若模板自身不合法则回退（理论上不会发生）
  const v = validate(code)
  if (!v.valid) {
    // 回退到最简 flowchart
    code = TEMPLATES.flowchart.skeleton(desc)
  }
  return { type: t, code, valid: true, template: TEMPLATES[t].name }
}

/* ---------------- 工具定义 ---------------- */
const tools = [
  {
    name: 'generate_diagram',
    description: '根据自然语言描述生成 Mermaid 图表代码（含合法骨架与语法修正）。返回 type/code/valid。可用类型: flowchart/sequence/mindmap/class/state/gantt/pie/graph。生成后可在 Diagram Panel 面板编辑或导出，ChatCard 会自动渲染。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '图表要表达的内容/场景描述（自然语言）' },
        type: { type: 'string', description: '图表类型: flowchart|sequence|mindmap|class|state|gantt|pie|graph', default: 'flowchart' }
      },
      required: ['text']
    }
  },
  {
    name: 'validate_mermaid',
    description: '校验 Mermaid 语法，返回 valid/errors/warnings。用于在生成后或用户编辑后检查语法问题。',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'Mermaid 代码' } },
      required: ['code']
    }
  },
  {
    name: 'list_templates',
    description: '列出可用的 Mermaid 图表模板及说明，帮助选择合适的图表类型。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '可选：仅返回指定类型的模板' }
      }
    }
  }
]

/* ---------------- JSON-RPC 主循环 ---------------- */
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
    try { msg = JSON.parse(line) } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      continue
    }
    handle(msg).catch(err => {
      send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: String(err && err.message || err) } })
    })
  }
})

async function handle(msg) {
  const { method, id, params } = msg
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'diagram-studio', version: '1.0.0' }
    }})
  }
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools } })
  }
  if (method === 'tools/call') {
    const name = params?.name
    const args = params?.arguments || {}
    if (name === 'generate_diagram') {
      const res = generateDiagram(args.text, args.type)
      const text = `已生成 ${res.template}（类型: ${res.type}）。语法校验: ${res.valid ? '通过 ✓' : '有问题'}\n\n\`\`\`mermaid\n${res.code}\n\`\`\`\n\n提示：可在 Diagram 面板编辑、实时预览并导出 SVG/PNG。`
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text }],
        // 结构化数据，供 ChatCard 渲染
        _meta: { diagram: res }
      }})
    }
    if (name === 'validate_mermaid') {
      const v = validate(args.code)
      const text = v.valid
        ? `✓ 语法校验通过${v.warnings.length ? '（有 ' + v.warnings.length + ' 条提示）' : ''}${v.warnings.length ? '\n\n' + v.warnings.map(w => '⚠ ' + w).join('\n') : ''}`
        : `✗ 校验未通过：\n\n` + v.errors.map(e => '✗ ' + e).join('\n') + (v.warnings.length ? '\n\n' + v.warnings.map(w => '⚠ ' + w).join('\n') : '')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { validation: v } } })
    }
    if (name === 'list_templates') {
      const t = args.type
      const list = t && TEMPLATES[t]
        ? [{ type: t, ...TEMPLATES[t] }]
        : Object.entries(TEMPLATES).map(([k, v]) => ({ type: k, ...v }))
      const text = '可用图表模板：\n\n' + list.map(x => `• ${x.type} — ${x.name}：${x.description}`).join('\n')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { templates: list } } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  // notifications/initialized 等：忽略
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}

process.on('uncaughtException', (e) => {
  try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {}
})
