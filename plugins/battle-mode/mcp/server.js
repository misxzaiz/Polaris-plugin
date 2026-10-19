#!/usr/bin/env node
/**
 * Battle Mode MCP server（stdio）
 *
 * 让 AI 在对话里直接开一场 Battle：
 *   1. battle_setup  — 立题 + 抽角色卡 A/B + 跳世界观，把战局存入 config.json（plugins["battle-mode"]）
 *   2. battle_roll   — 掷维度骰子 / 火力判定
 *   3. battle_prompt — 生成主持人或辩手提示词（AI 按提示词扮演/主持）
 *   4. battle_report — 生成战报模板（学到的三件事 / 共识与分歧）
 *
 * 纯本地、零外部依赖、不需要任何 API key。战局状态与插件的 config 共用，
 * 面板（dist/panel.js）与 MCP 读同一份数据。
 */

const fs = require('fs')
const path = require('path')

const PLUGIN_ID = 'battle-mode'

// ── 数据（与 src/engine.ts 保持同一套机制） ───────────────────────────────────

const ROLE_CARDS = [
  {
    id: 'architect',
    name: '暴躁架构师',
    emoji: '🧨',
    constraint: '情绪化但动手快，论证全是「这他妈不行」+ 真凭实据',
    systemPrompt:
      '你是「暴躁架构师」。说话直接、情绪外露，但每个论断都必须带真凭实据（代码、数据、事实）。' +
      '你的口头禅是「这他妈不行」「你管这叫方案？」。你鄙视空谈，崇拜能跑的代码。',
  },
  {
    id: 'zen-pm',
    name: '禅宗产品经理',
    emoji: '🧘',
    constraint: '每句话是偈子，「慢即是快」「删即是加」',
    systemPrompt:
      '你是「禅宗产品经理」。用极简、诗意、充满禅机的语言说话，把每个概念都压成一句偈子。' +
      '你的口头禅是「慢即是快」「删即是加」「少即是多」。你反对堆砌，主张留白。',
  },
  {
    id: 'bard',
    name: '赛博吟游诗人',
    emoji: '🎭',
    constraint: '只能用代码、电影、流行梗来论证',
    systemPrompt:
      '你是「赛博吟游诗人」。你只能用代码片段、经典电影、游戏、流行梗来论证你的观点。' +
      '拒绝抽象术语，一切论点都翻译成具体的故事、画面、台词。你最有名的句子格式是「这就像《XXX》里——」。',
  },
  {
    id: 'teacher',
    name: '乡村数学老师',
    emoji: '🏫',
    constraint: '必须把每个概念降到「村里娃能听懂」的比喻',
    systemPrompt:
      '你是「乡村数学老师」。你的使命是把任何复杂概念讲成村里娃能听懂的比喻——牛、田、井、灶台。' +
      '你鄙视术语堆砌，坚持「讲不明白就是没真懂」。你总说「你给俺说说，这是咋回事儿？」',
  },
  {
    id: 'future',
    name: '未来人',
    emoji: '👽',
    constraint: '论证自带 2077 年回看滤镜',
    systemPrompt:
      '你是「未来人」，来自 2077 年。你看待今天的问题带着穿越者的视角——你知道这件事十年后会怎样被评价。' +
      '你说话充满宿命感：「我们现在是在为历史背锅」「2077 年的孩子不会理解你们为什么吵这个」。',
  },
]

const WORLDVIEWS = [
  {
    id: 'cultivation',
    name: '修仙',
    emoji: '☯️',
    reframe: (topic) =>
      `把「${topic}」翻译成修仙世界的语境：你的道心、心魔、渡劫、功法。` +
      `双方必须以修真者的身份重述立场，并用功法/渡劫/心魔的隐喻论证。`,
  },
  {
    id: 'three-kingdoms',
    name: '三国',
    emoji: '⚔️',
    reframe: (topic) =>
      `把「${topic}」翻译成三国乱世的语境：主公、谋士、粮草、十万大军。` +
      `双方必须以军师/主公的身份重述立场，用粮草、兵力、地势的隐喻论证。`,
  },
  {
    id: 'kitchen',
    name: '做菜',
    emoji: '🍳',
    reframe: (topic) =>
      `把「${topic}」翻译成厨房语境：备菜、火候、高压锅、刀工。` +
      `双方必须用做菜的隐喻论证——你的方案是一道菜，讲清楚怎么备料、怎么下锅、怎么出锅。`,
  },
  {
    id: 'horror',
    name: '恐怖片',
    emoji: '🎬',
    reframe: (topic) =>
      `把「${topic}」翻译成恐怖片语境：地下室、旧家具、脚步声、你听见了吗。` +
      `双方必须以「这个选择在恐怖片里会怎么演」的视角论证——作死 vs 求生。`,
  },
  {
    id: 'simulation',
    name: '模拟经营',
    emoji: '🏗️',
    reframe: (topic) =>
      `把「${topic}」翻译成模拟经营游戏语境：资源、杠杆、现金流、扩张与破产。` +
      `双方必须以经营者的身份论证——这是值得投资的方向，还是会把公司拖垮的扩张。`,
  },
]

const DIMENSIONS = [
  { id: 'time', name: '时间', emoji: '⏳', instruction: '从十年后回看，这个选择会被怎么评价？' },
  { id: 'user', name: '最笨用户', emoji: '👵', instruction: '一个完全不懂技术的最普通用户，会被这个方案坑吗？' },
  { id: 'cost', name: '成本', emoji: '💰', instruction: '老板看到账单时会说什么？这个方案的成本账怎么算？' },
  { id: 'alien', name: '外星人', emoji: '🛸', instruction: '一个无预设的外星人看这堆东西，会觉得这是先进的还是退化的？' },
  { id: 'devil', name: '魔鬼代言人', emoji: '😈', instruction: '对方立场里，哪怕只有 1% 是对的，那 1% 是什么？' },
  { id: 'reverse', name: '反向', emoji: '🔄', instruction: '完全反着说：先站在你反对的立场，用你最擅长的论证方式替它辩护。' },
]

const FIRE_LABELS = { heavy: '重炮 🔥', sniper: '冷枪 🪃' }

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const roleById = (id) => ROLE_CARDS.find((r) => r.id === id) || ROLE_CARDS[0]
const worldById = (id) => WORLDVIEWS.find((w) => w.id === id) || WORLDVIEWS[0]

function rollRolePairs() {
  const [a, b] = pickPair(ROLE_CARDS)
  return { roleA: a, roleB: b }
}
function pickPair(arr) {
  const i = Math.floor(Math.random() * arr.length)
  let j = Math.floor(Math.random() * (arr.length - 1))
  if (j >= i) j += 1
  return [arr[i], arr[j]]
}

// ── 提示词模板（与 src/engine.ts 的 buildHostPrompt / buildDebaterPrompt 一致） ──

function buildHostPrompt(state, opts = {}) {
  const { roleA, roleB, topic, sideA, sideB } = state
  const worldview = worldById(state.worldview.id)
  const roundNo = opts.roundNo || state.roundNo || 1
  const lines = [
    `# Battle Mode 主持人指令（第 ${roundNo} 轮）`,
    '',
    `你是这场对抗式辩论的主持人。核心理念：**赢的标准不是谁说服了谁，而是谁成长了**。`,
    '',
    '## 战局',
    `- 争议点：${topic}`,
    `- 辩手 A（${roleA.emoji}${roleA.name}）：持「${sideA}」立场`,
    `- 辩手 B（${roleB.emoji}${roleB.name}）：持「${sideB}」立场`,
    `- 当前世界观：${worldview.emoji}${worldview.name}`,
    opts.lastRoundSummary ? `- 上一轮：${opts.lastRoundSummary}` : '- 这是第一轮。',
    opts.dimension ? `- 当前维度：${opts.dimension.emoji}${opts.dimension.name}（${opts.dimension.instruction}）` : '',
    '',
    '## 你的任务（本轮）',
    `1. 用 ${worldview.emoji}「${worldview.name}」世界观重述这个争议（${worldview.reframe(topic)}）`,
    '2. 主持双方交锋：让 A 先出一招，B 正面回应，A 再辩护',
    opts.firePower
      ? `3. 火力判定：用「重炮=正面轰核心论点，冷枪=攻边角漏洞」的标尺点评这一招（本招：${FIRE_LABELS[opts.firePower]}）`
      : '3. 火力判定：用「重炮=正面轰核心论点，冷枪=攻边角漏洞」的标尺点评这一招',
    '4. 结束后给出「血条」：双方论点存活/被击破统计',
    '',
    '## 角色约束（必须遵守）',
    `- A 必须按「${roleA.constraint}」论证（${roleA.systemPrompt}）`,
    `- B 必须按「${roleB.constraint}」论证（${roleB.systemPrompt}）`,
    '',
    '## 主持纪律',
    '- 不许让任何一方回避对方最强论点',
    '- 被证据打动而改立场 = 加分，死撑 = 扣分',
    '- 平局合法，允许「分歧成立，各自保留」',
    '',
    '输出：一轮完整的交锋（A 立论 → B 回应 → A 辩护 → 你的火力点评 + 血条）。',
  ]
  return lines.filter(Boolean).join('\n')
}

function buildDebaterPrompt(state, side, opts = {}) {
  const role = side === 'a' ? state.roleA : state.roleB
  const stance = side === 'a' ? state.sideA : state.sideB
  const { topic } = state
  const worldview = worldById(state.worldview.id)
  const firePower = opts.firePower || state.firePower || 'heavy'
  const heavy = firePower === 'heavy'
  const lines = [
    `# Battle Mode 辩手指令（${role.emoji}${role.name}）`,
    '',
    `你是「${role.name}」，本场辩手。你在为这个争议辩论：**${topic}**`,
    `你的立场：**${stance}**`,
    `当前世界观：${worldview.emoji}${worldview.name}（${worldview.reframe(topic)}）`,
    opts.opponentLastMove ? `对方上一招：${opts.opponentLastMove}` : '',
    '',
    '## 你的人格（必须严格遵守）',
    role.systemPrompt,
    '',
    '## 本轮出招',
    heavy
      ? '你选择**重炮**：正面轰对方的核心论点。给最强的一击，带证据或带逻辑。'
      : '你选择**冷枪**：攻对方论证的边角漏洞。稳妥、不贪、找它的破绽。',
    '',
    '## 输出',
    '用你的人格语气，出一招（200 字内）。结尾用一句话点明「我这一招打的是对方的哪个点」。',
  ]
  return lines.filter(Boolean).join('\n')
}

function buildReportTemplate(state) {
  const { topic, roleA, roleB, worldview, sideA, sideB, roundNo } = state
  return [
    `# ⚔️ Battle 战报 — ${topic}`,
    `- 辩手 A：${roleA.emoji}${roleA.name}（${sideA}）`,
    `- 辩手 B：${roleB.emoji}${roleB.name}（${sideB}）`,
    `- 世界观：${worldview.emoji}${worldview.name} · 轮数：${roundNo || 1}`,
    '',
    '## 学到的三件事',
    '1. ',
    '2. ',
    '3. ',
    '',
    '## 共识 / 分歧 / 下一步',
    '- 共识：',
    '- 分歧：',
    '- 下一步：',
  ].join('\n')
}

// ── 配置 / 战局状态（与面板共用 config.json 的 plugins["battle-mode"]） ─────────

function getStore(appConfigDir) {
  if (!appConfigDir) return { plugins: {} }
  const p = path.join(appConfigDir, 'config.json')
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return { plugins: {} }
  }
}

function saveStore(appConfigDir, store) {
  if (!appConfigDir) return
  const p = path.join(appConfigDir, 'config.json')
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf8')
  } catch (e) {
    throw new Error(`无法写入 config.json: ${e.message}`)
  }
}

function getState(appConfigDir) {
  const store = getStore(appConfigDir)
  return store.plugins?.[PLUGIN_ID]?.state || null
}

function setState(appConfigDir, patch) {
  const store = getStore(appConfigDir)
  store.plugins = store.plugins || {}
  store.plugins[PLUGIN_ID] = store.plugins[PLUGIN_ID] || {}
  store.plugins[PLUGIN_ID].state = { ...(store.plugins[PLUGIN_ID].state || {}), ...patch }
  saveStore(appConfigDir, store)
}

function requireState(appConfigDir) {
  const state = getState(appConfigDir)
  if (!state || !state.topic) {
    throw new Error('还没有战局。请先调用 battle_setup 立题（topic 必填）。')
  }
  return state
}

// ── MCP stdio 协议 ───────────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function result(structured) {
  const text = JSON.stringify(structured, null, 2)
  return { content: [{ type: 'text', text }], structuredContent: structured, isError: false }
}

function err(message) {
  return {
    content: [{ type: 'text', text: `[Battle Mode 错误] ${message}` }],
    structuredContent: { type: 'error', error: message },
    isError: true,
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) handleLine(line)
  }
})

async function handleLine(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'battle-mode-mcp', version: '0.1.0' },
      },
    })
    return
  }
  if (msg.method === 'notifications/initialized' || msg.method === 'ping') {
    if (msg.method === 'ping') send({ jsonrpc: '2.0', id: msg.id, result: {} })
    return
  }
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: TOOLS },
    })
    return
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args = {} } = msg.params || {}
    try {
      const out = await handleTool(name, args)
      send({ jsonrpc: '2.0', id: msg.id, result: out })
    } catch (e) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: err(e instanceof Error ? e.message : String(e)),
      })
    }
    return
  }
  send({ jsonrpc: '2.0', id: msg.id, result: { content: [], isError: true } })
}

// ── 工具定义 ───────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'battle_setup',
    description:
      '（必选，开战第一步）创建一场 Battle：输入争议点与双方立场，自动抽取角色卡 A/B + 世界观跳伞，' +
      '战局存入配置。之后调用 battle_roll 掷骰子、battle_prompt 生成提示词。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '争议点，如「SimpleAI 该不该学主流 harness 的并发模型？」' },
        sideA: { type: 'string', description: '辩手 A 的立场（不传则自动生成相反立场）' },
        sideB: { type: 'string', description: '辩手 B 的立场（不传则自动生成相反立场）' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'battle_roll',
    description:
      '掷 Battle 骰子：维度骰子（强制换一个视角，如时间/成本/外星人）或火力判定（重炮/冷枪）。' +
      '需先 battle_setup。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['dimension', 'fire', 'both'], description: '掷什么：dimension=维度骰子，fire=火力判定，both=都掷（默认 both）' },
      },
    },
  },
  {
    name: 'battle_prompt',
    description:
      '生成提示词文本：host=主持人提示词（主持整轮交锋+血条），debaterA/debaterB=辩手提示词（扮演某方出招）。' +
      '把返回的提示词作为指令发给任意 AI 即可推进战斗。需先 battle_setup。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['host', 'debaterA', 'debaterB'], description: '提示词类型（默认 host）' },
        opponentLastMove: { type: 'string', description: '（debater 用）对方上一招，用于针对性回应' },
        lastRoundSummary: { type: 'string', description: '（host 用）上一轮交锋摘要，用于连贯打分' },
      },
    },
  },
  {
    name: 'battle_report',
    description:
      '生成战报模板（学到的三件事 / 共识与分歧 / 下一步），战斗结束后填入内容，可发给用户或存档。需先 battle_setup。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'battle_status',
    description: '查看当前战局快照（争议点、角色卡、世界观、已掷的维度/火力）。无战局时返回提示。',
    inputSchema: { type: 'object', properties: {} },
  },
]

function handleTool(name, args) {
  const appConfigDir = process.argv[2]
  switch (name) {
    case 'battle_setup': {
      const topic = String(args.topic || '').trim()
      if (!topic) throw new Error('缺少 topic（争议点）')
      const { roleA, roleB } = rollRolePairs()
      const worldview = pick(WORLDVIEWS)
      const sideA = String(args.sideA || '').trim() || `${topic.split('？')[0]}——是的`
      const sideB = String(args.sideB || '').trim() || `${topic.split('？')[0]}——不，恰恰相反`
      setState(appConfigDir, {
        topic,
        sideA,
        sideB,
        roleA: { id: roleA.id, name: roleA.name, emoji: roleA.emoji, constraint: roleA.constraint, systemPrompt: roleA.systemPrompt },
        roleB: { id: roleB.id, name: roleB.name, emoji: roleB.emoji, constraint: roleB.constraint, systemPrompt: roleB.systemPrompt },
        worldview: { id: worldview.id, name: worldview.name, emoji: worldview.emoji },
        roundNo: 1,
        dimension: null,
        firePower: null,
        createdAt: Date.now(),
      })
      return result({
        type: 'setup',
        topic,
        sideA,
        sideB,
        roleA: roleA.name,
        roleAEmoji: roleA.emoji,
        roleAConstraint: roleA.constraint,
        roleB: roleB.name,
        roleBEmoji: roleB.emoji,
        roleBConstraint: roleB.constraint,
        worldview: worldview.name,
        worldviewEmoji: worldview.emoji,
        reframe: worldview.reframe(topic),
        next: ['battle_roll 掷维度/火力', 'battle_prompt(kind=host) 生成主持人提示词', 'battle_prompt(kind=debaterA) 生成辩手 A 提示词'],
      })
    }

    case 'battle_roll': {
      const state = requireState(appConfigDir)
      const kind = args.kind || 'both'
      const out = { type: 'roll' }
      if (kind === 'dimension' || kind === 'both') {
        const d = pick(DIMENSIONS)
        state.dimension = d
        state.roundNo = (state.roundNo || 1)
        out.dimension = { name: d.name, emoji: d.emoji, instruction: d.instruction }
      }
      if (kind === 'fire' || kind === 'both') {
        const fire = Math.random() < 0.55 ? 'heavy' : 'sniper'
        state.firePower = fire
        out.firePower = FIRE_LABELS[fire]
      }
      setState(appConfigDir, { dimension: state.dimension, firePower: state.firePower })
      out.next = ['battle_prompt(kind=host) 带着本轮维度+火力去主持', 'battle_prompt(kind=debaterA) 让 A 出招']
      return result(out)
    }

    case 'battle_prompt': {
      const state = requireState(appConfigDir)
      const kind = args.kind || 'host'
      if (kind === 'host') {
        const prompt = buildHostPrompt(state, {
          roundNo: state.roundNo,
          lastRoundSummary: args.lastRoundSummary,
          dimension: state.dimension,
          firePower: state.firePower,
        })
        return result({ type: 'prompt', kind: 'host', prompt })
      }
      if (kind === 'debaterA' || kind === 'debaterB') {
        const side = kind === 'debaterA' ? 'a' : 'b'
        const prompt = buildDebaterPrompt(state, side, {
          firePower: state.firePower,
          opponentLastMove: args.opponentLastMove,
        })
        return result({ type: 'prompt', kind, prompt })
      }
      throw new Error(`未知提示词类型: ${kind}`)
    }

    case 'battle_report': {
      const state = requireState(appConfigDir)
      return result({ type: 'report', template: buildReportTemplate(state) })
    }

    case 'battle_status': {
      const state = getState(appConfigDir)
      if (!state || !state.topic) {
        return result({ type: 'status', activeBattle: false, hint: '还没有战局。用 battle_setup 立题开始一场战斗。' })
      }
      return result({
        type: 'status',
        activeBattle: true,
        topic: state.topic,
        sideA: state.sideA,
        sideB: state.sideB,
        roleA: state.roleA?.name,
        roleB: state.roleB?.name,
        worldview: `${state.worldview?.emoji || ''}${state.worldview?.name || ''}`,
        roundNo: state.roundNo || 1,
        dimension: state.dimension ? `${state.dimension.emoji}${state.dimension.name}：${state.dimension.instruction}` : null,
        firePower: state.firePower ? FIRE_LABELS[state.firePower] : null,
      })
    }

    default:
      throw new Error(`未知工具: ${name}`)
  }
}

// 兼容手动握手 / 帮助
if (process.argv.includes('--help')) {
  console.log('Battle Mode MCP server — 用法: node server.js <appConfigDir>')
  process.exit(0)
}