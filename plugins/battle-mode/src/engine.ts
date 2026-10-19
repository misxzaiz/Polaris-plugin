/**
 * Battle Mode — 机制引擎
 *
 * 纯前端、零后端依赖。所有「游戏性」都在这一个文件里：
 *  - 角色卡：改变论证方式的强制人格
 *  - 世界观跳伞：同一争议塞进不同世界观，逼出全新角度
 *  - 维度骰子：每轮强制换视角
 *  - 火力判定：重炮 vs 冷枪（主持人裁定）
 *  - AI 主持提示词模板：拼好 prompt 交给任意 AI 当主持人/辩手
 */

// ── 角色卡 ────────────────────────────────────────────────────────────────────

export interface RoleCard {
  id: string
  name: string
  emoji: string
  /** 该人格改变论证方式的一句话约束 */
  constraint: string
  /** 追加到 system prompt 的人格指令 */
  systemPrompt: string
}

export const ROLE_CARDS: RoleCard[] = [
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

export const roleCardById = (id: string): RoleCard =>
  ROLE_CARDS.find((r) => r.id === id) ?? ROLE_CARDS[0]

// ── 世界观跳伞 ────────────────────────────────────────────────────────────────

export interface WorldView {
  id: string
  name: string
  emoji: string
  /** 主持人「最狠一击」时，把争议翻译进这个世界观的模板 */
  reframe: (topic: string) => string
}

export const WORLDVIEWS: WorldView[] = [
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

export const worldViewById = (id: string): WorldView =>
  WORLDVIEWS.find((w) => w.id === id) ?? WORLDVIEWS[0]

// ── 维度骰子 ──────────────────────────────────────────────────────────────────

export interface Dimension {
  id: string
  name: string
  emoji: string
  /** 强制切换的视角指令 */
  instruction: string
}

export const DIMENSIONS: Dimension[] = [
  { id: 'time', name: '时间', emoji: '⏳', instruction: '从十年后回看，这个选择会被怎么评价？' },
  { id: 'user', name: '最笨用户', emoji: '👵', instruction: '一个完全不懂技术的最普通用户，会被这个方案坑吗？' },
  { id: 'cost', name: '成本', emoji: '💰', instruction: '老板看到账单时会说什么？这个方案的成本账怎么算？' },
  { id: 'alien', name: '外星人', emoji: '🛸', instruction: '一个无预设的外星人看这堆东西，会觉得这是先进的还是退化的？' },
  { id: 'devil', name: '魔鬼代言人', emoji: '😈', instruction: '对方立场里，哪怕只有 1% 是对的，那 1% 是什么？' },
  { id: 'reverse', name: '反向', emoji: '🔄', instruction: '完全反着说：先站在你反对的立场，用你最擅长的论证方式替它辩护。' },
]

export const rollDimension = (): Dimension => {
  const i = Math.floor(Math.random() * DIMENSIONS.length)
  return DIMENSIONS[i]
}

// ── 火力 ──────────────────────────────────────────────────────────────────────

export type FirePower = 'heavy' | 'sniper'

export const FIRE_POWER_LABELS: Record<FirePower, string> = {
  heavy: '重炮 🔥',
  sniper: '冷枪 🪃',
}

/** 随机出招火力：重炮 55% / 冷枪 45% */
export const rollFirePower = (): FirePower =>
  Math.random() < 0.55 ? 'heavy' : 'sniper'

// ── 变奏四连 ──────────────────────────────────────────────────────────────────

export interface Variation {
  id: string
  name: string
  emoji: string
  prompt: string
}

export const VARIATIONS: Variation[] = [
  { id: 'reverse', name: '反过来', emoji: '🔄', prompt: '把结论完全反过来，会不会也对？' },
  { id: 'kid', name: '5 岁版', emoji: '👶', prompt: '用 5 岁孩子能听懂的话，把这个争议讲一遍。' },
  { id: 'scale100', name: '放大 100 倍', emoji: '🚀', prompt: '把这个方案放大 100 倍，会发生什么？' },
  { id: 'rule', name: '世界规则变一条', emoji: '🎲', prompt: '如果有一条世界规则变了（资源无限 / 内存无限 / 时间停止），你的结论会变吗？' },
]

// ── 战报输出 ──────────────────────────────────────────────────────────────────

export interface BattleLogEntry {
  kind: 'setup' | 'round' | 'airraid' | 'verdict'
  text: string
  ts: number
}

// ── AI 主持提示词模板 ────────────────────────────────────────────────────────

/**
 * 生成「主持人提示词」：把当前战局拼成一个自包含 prompt，
 * 用户拷到任意 AI 聊天里，AI 就当主持人继续推进。
 */
export function buildHostPrompt(opts: {
  topic: string
  sideA: string
  sideB: string
  roleA: RoleCard
  roleB: RoleCard
  worldview: WorldView
  roundNo: number
  lastRoundSummary?: string
  firePower?: FirePower
}): string {
  const { topic, sideA, sideB, roleA, roleB, worldview, roundNo, lastRoundSummary } = opts
  return [
    `# Battle Mode 主持人指令（第 ${roundNo} 轮）`,
    '',
    `你是这场对抗式辩论的主持人。核心理念：**赢的标准不是谁说服了谁，而是谁成长了**。`,
    '',
    `## 战局`,
    `- 争议点：${topic}`,
    `- 辩手 A（${roleA.emoji}${roleA.name}）：持「${sideA}」立场`,
    `- 辩手 B（${roleB.emoji}${roleB.name}）：持「${sideB}」立场`,
    `- 当前世界观：${worldview.emoji}${worldview.name}`,
    lastRoundSummary ? `- 上一轮：${lastRoundSummary}` : '- 这是第一轮。',
    '',
    `## 你的任务（本轮）`,
    `1. 用 ${worldview.emoji}「${worldview.name}」世界观重述这个争议（${worldview.reframe(topic)}）`,
    `2. 主持双方交锋：让 A 先出一招，B 正面回应，A 再辩护`,
    `3. 如果选了火力（${opts.firePower ? FIRE_POWER_LABELS[opts.firePower] : '重炮/冷枪'}），用「重炮=正面轰核心论点，冷枪=攻边角漏洞」的标尺点评这一招`,
    `4. 结束后给出「血条」：双方论点存活/被击破统计`,
    '',
    `## 角色约束（必须遵守）`,
    `- A 必须按「${roleA.constraint}」论证（${roleA.systemPrompt}）`,
    `- B 必须按「${roleB.constraint}」论证（${roleB.systemPrompt}）`,
    '',
    `## 主持纪律`,
    `- 不许让任何一方回避对方最强论点`,
    `- 被证据打动而改立场 = 加分，死撑 = 扣分`,
    `- 平局合法，允许「分歧成立，各自保留」`,
    '',
    `输出：一轮完整的交锋（A 立论 → B 回应 → A 辩护 → 你的火力点评 + 血条）。`,
  ].join('\n')
}

/**
 * 生成「辩手提示词」：让 AI 扮演其中一个辩手出招。
 */
export function buildDebaterPrompt(opts: {
  topic: string
  side: string
  role: RoleCard
  worldview: WorldView
  firePower: FirePower
  opponentLastMove?: string
}): string {
  const { topic, side, role, worldview, firePower, opponentLastMove } = opts
  const heavy = firePower === 'heavy'
  return [
    `# Battle Mode 辩手指令（${role.emoji}${role.name}）`,
    '',
    `你是「${role.name}」，本场辩手。你在为这个争议辩论：**${topic}**`,
    `你的立场：**${side}**`,
    `当前世界观：${worldview.emoji}${worldview.name}（${worldview.reframe(topic)}）`,
    opponentLastMove ? `对方上一招：${opponentLastMove}` : '',
    '',
    `## 你的人格（必须严格遵守）`,
    role.systemPrompt,
    '',
    `## 本轮出招`,
    heavy
      ? `你选择**重炮**：正面轰对方的核心论点。给最强的一击，带证据或带逻辑。`
      : `你选择**冷枪**：攻对方论证的边角漏洞。稳妥、不贪、找它的破绽。`,
    '',
    `## 输出`,
    `用你的人格语气，出一招（200 字内）。结尾用一句话点明「我这一招打的是对方的哪个点」。`,
  ].join('\n')
}
