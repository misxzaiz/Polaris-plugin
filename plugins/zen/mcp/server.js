#!/usr/bin/env node
/**
 * 禅房 MCP Server
 *
 * 提供三个工具：
 *   - knock_fish：敲木鱼
 *   - draw_fortune：抽编程签
 *   - open_book：翻答案之书
 *
 * JSON-RPC 2.0 over stdin/stdout。
 * 结果以 JSON 文本返回，供聊天卡片解析渲染。
 */

const FORTUNES = [
  { luck: '大吉', text: '今天你提交的代码，会一次通过 review，且没有 lint 报错。', book: '《代码整洁之道》第 42 页' },
  { luck: '大吉', text: '你的 function 很快就要被香水级重构，优雅得像首诗。', book: '《重构》第 2 版' },
  { luck: '中吉', text: '那个 flaky test，今天大概率会绿。但别问为什么。', book: '《测试之道》' },
  { luck: '中吉', text: '适合做一次大清理：删掉没用完的 TODO，和那个跑不进 git 的临时文件。', book: '《代码大全》' },
  { luck: '吉', text: '今天写新代码运气不错，但记得先 pull 再 push。', book: '《Pro Git》' },
  { luck: '吉', text: '你的注释终于和你 3 个月前的记忆对齐了。', book: '《程序员修炼之道》' },
  { luck: '小吉', text: '小步提交，小事开心。今天适合 refactor，不适合推翻重来。', book: '《重构》' },
  { luck: '小吉', text: '一杯咖啡之后，那个 bug 会自己现出原形。', book: '《调试的艺术》' },
  { luck: '末吉', text: '变量名别改了，改一次是重构，改三次是迷信。', book: '《代码整洁之道》' },
  { luck: '末吉', text: '今天可能出现难以复现的 bug。别慌，先 commit 再说。', book: '《如何阅读一本书》' },
  { luck: '凶', text: '别在周五下午动生产环境的配置。真的。', book: '《Release It!》' },
  { luck: '凶', text: '注意：今天有字段类型被隐式转换的风险，小心被坑。', book: '《TypeScript 深度指南》' },
  { luck: '大凶', text: '不要 git push --force。今天说的就是你。', book: '《Git 时光机》' },
]

const ANSWERS = [
  '答案是 42。',
  '指针指向了 yes。',
  '缓存未命中，请重试。',
  '这个需求可以砍一半。',
  '先 deprecate，再淘汰。',
  '别重构，先加测试。',
  '答案是 undefined，但你可以给它赋个默认值。',
  '等下一个 release 再说。',
  '你自己 merge 一下不就有答案了。',
  '这个问题不在本次 sprint 范围内。',
  '可以，但要加个 feature flag。',
  '别问，问就是 git blame。',
  '答案是 NaN，但 @@ 是合法的。',
  '读一下文档，文档里有 3 个意思。',
  '这个 bug 是特性，不是特性也当特性。',
  '答案是 404：页面（和信心）都找不到。',
  '先 commit 再问，答案会自己浮现。',
  '你用 console.log 试一试，答案就在那里。',
  '答案是：取决于你的运行时版本。',
  '别 worry，未来会有库帮你解决这个。',
  '你试过重启吗？',
  '先写测试，再问。',
  '你心里已经有答案了，你只是不想做。',
  '这个问题不值一提——先跑一遍再说。',
]

const KNOCK_RESPONSES = [
  '小僧跟着敲了一下。',
  '小僧觉得你心里清净了。',
  '小僧点了点头。',
  '小僧不说话，但你知道他在听。',
  '木鱼声在空气中慢慢消散。',
]

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

// ── Tool handlers ──────────────────────────────────────────────────────

function handleKnockFish(args) {
  const count = Math.max(1, Math.min(108, Number(args.count) || 1))
  const msgIdx = Math.floor(Math.random() * KNOCK_RESPONSES.length)
  const response = KNOCK_RESPONSES[msgIdx] + (count > 1 ? `（敲了 ${count} 下）` : '')

  return {
    content: [{ type: 'text', text: JSON.stringify({
      type: 'knock',
      count,
      message: response.trim()
    })}]
  }
}

function handleDrawFortune() {
  const idx = Math.floor(Math.random() * FORTUNES.length)
  const f = FORTUNES[idx]

  return {
    content: [{ type: 'text', text: JSON.stringify({
      type: 'fortune',
      luck: f.luck,
      text: f.text,
      book: f.book
    })}]
  }
}

function handleOpenBook(args) {
  const question = String(args.question || '').trim()
  const idx = Math.floor(Math.random() * ANSWERS.length)
  const answer = ANSWERS[idx]

  const followUps = question ? [
    `（你问「${question}」……小僧觉得你心里已经有答案了。）`,
    `（小僧看了你一眼，合上了书。你问「${question}」的事，他记住了。）`,
    `（书翻到这一页，停了很久。你问「${question}」，它没有直接回答。）`,
  ] : []
  const followUp = followUps.length > 0
    ? followUps[Math.floor(Math.random() * followUps.length)]
    : ''

  return {
    content: [{ type: 'text', text: JSON.stringify({
      type: 'book',
      answer,
      followUp,
      question
    })}]
  }
}

// ── JSON-RPC 2.0 dispatcher ───────────────────────────────────────────

const tools = [
  {
    name: 'knock_fish',
    description: '敲木鱼。让 AI 替用户敲一下木鱼，放松心情。',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1, maximum: 108, description: '敲击次数，默认 1' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'draw_fortune',
    description: '抽一支编程签。基于当前状态给出签文。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'open_book',
    description: '翻开答案之书。用户默念一个问题，书给出答案。',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '用户想问的问题' }
      },
      additionalProperties: false
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
    try { msg = JSON.parse(line) } catch { continue }

    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'polaris-zen', version: '0.1.0' }
        }
      })
    } else if (msg.method === 'notifications/initialized') {
      // 忽略
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {}
      let result
      if (name === 'knock_fish') {
        result = handleKnockFish(args || {})
      } else if (name === 'draw_fortune') {
        result = handleDrawFortune()
      } else if (name === 'open_book') {
        result = handleOpenBook(args || {})
      } else {
        result = { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true }
      }
      send({ jsonrpc: '2.0', id: msg.id, result })
    }
  }
})