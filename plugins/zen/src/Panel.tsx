/**
 * 禅房面板 - 小僧与你
 *
 * 四个 tab：木鱼、抽签、答案之书、日记
 * 极简风格，黑底灰字，等宽字体，无装饰。
 */

import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { useZenStore, getMonkFace } from './zenStore'

// ── 数据 ──────────────────────────────────────────────────────────────────

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

const PUNCHLINES = [
  ['你问能不能修好。答案之书翻到的是：', '你试过重启吗？'],
  ['你问该不该重构。答案之书翻到的是：', '删掉它，没人会发现。'],
  ['你问这个 bug 的源头。答案之书翻到的是：', '你上次改的那里。'],
  ['你问什么时候能做完。答案之书翻到的是：', '你上次估计的时间，乘以 pi。'],
  ['你问要不要加这个功能。答案之书翻到的是：', '用户不会用，但你会头疼。'],
  ['你问该不该告诉别人。答案之书翻到的是：', '你 commit message 已经写清楚了。'],
  ['你问能不能上线。答案之书翻到的是：', '你问之前就已经知道答案了。'],
  ['你问是不是该休息了。答案之书翻到的是：', '你的眼睛在说谎，但颈椎很诚实。'],
]

const SECOND_LINES = {
  0: '你上次也问过这个问题。你试了，但你没重启对地方。',
  1: '你上次也问过。你重构了，然后又改回来了。',
  2: '你上次改的那里，你又改了一次。这次你确定吗？',
  3: '你上次估计的时间，到现在还没做完。',
  4: '你上次加的功能，用户确实没用。',
  5: '你上次也写了很清楚的 commit message，然后自己都忘了。',
  6: '你上次也问过。你上线了，然后回滚了。',
  7: '你上次问的时候，我就想说了。去休息吧。',
}

// ── 主面板 ────────────────────────────────────────────────────────────────

export default function ZenPanel({ pluginId }) {
  const [tab, setTab] = useState('knock')

  return h('div', { className: 'flex h-full flex-col bg-background font-mono text-xs text-text-secondary' },
    // header
    h('div', { className: 'flex items-center justify-between border-b border-border px-3 py-2' },
      h('span', { className: 'font-bold tracking-wider text-text' }, '禅房'),
      h('span', { className: 'text-text-muted' }, getMonkFace('idle')),
    ),
    // tabs
    h('div', { className: 'flex border-b border-border' },
      h(TabBtn, { active: tab === 'knock', onClick: () => setTab('knock') }, '木鱼'),
      h(TabBtn, { active: tab === 'fortune', onClick: () => setTab('fortune') }, '抽签'),
      h(TabBtn, { active: tab === 'book', onClick: () => setTab('book') }, '答书'),
      h(TabBtn, { active: tab === 'diary', onClick: () => setTab('diary') }, '日记'),
    ),
    // content
    h('div', { className: 'flex-1 overflow-y-auto p-4' },
      tab === 'knock' && h(KnockTab),
      tab === 'fortune' && h(FortuneTab),
      tab === 'book' && h(BookTab),
      tab === 'diary' && h(DiaryTab),
    ),
    // footer
    h('div', { className: 'border-t border-border px-3 py-1.5 text-[11px] text-text-muted' },
      (() => {
        const state = useZenStore.getState()
        const days = state.firstSeen
          ? Math.floor((Date.now() - new Date(state.firstSeen).getTime()) / 86400000)
          : 0
        return `已陪伴 ${Math.max(days, 1)} 天 · 敲了 ${state.knockCount} 下`
      })()
    ),
  )
}

function TabBtn({ active, onClick, children }) {
  return h('button', {
    className: `flex-1 px-3 py-2 text-center text-[11px] font-medium tracking-wider transition-colors ${
      active
        ? 'border-b-2 border-accent text-text'
        : 'text-text-muted hover:text-text hover:bg-background-hover'
    }`,
    onClick,
  }, children)
}

// ── 木鱼 Tab ──────────────────────────────────────────────────────────────

function KnockTab() {
  const { knockCount, maxCombo, totalZenSeconds, addKnock, setMonkMood, monkMood, soundPreference, setSoundPreference } = useZenStore()
  const [combo, setCombo] = useState(0)
  const [lastHit, setLastHit] = useState(0)
  const [zenText, setZenText] = useState(null)
  const comboRef = useRef(0)
  const timerRef = useRef(null)

  const knock = useCallback(() => {
    const now = Date.now()
    const diff = now - lastHit
    setLastHit(now)

    if (diff < 800) {
      comboRef.current += 1
    } else {
      comboRef.current = 1
    }
    setCombo(comboRef.current)

    // 声音反馈
    playKnockSound(soundPreference)

    // 连击反馈
    if (comboRef.current === 5) {
      setZenText('小僧停住，看着你。')
      setMonkMood('content')
    } else if (comboRef.current === 10) {
      setZenText('小僧笑了，和你一起敲。')
      setMonkMood('happy')
    } else {
      setZenText(null)
    }

    // 重置连击
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      comboRef.current = 1
      setCombo(1)
    }, 2000)

    addKnock(1)
  }, [lastHit, soundPreference, addKnock, setMonkMood])

  // 空格键敲击
  useEffect(() => {
    const handler = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        knock()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [knock])

  return h('div', { className: 'flex flex-col items-center gap-4' },
    h('div', { className: 'text-lg' }, monkMood === 'happy' ? '( ^o^ )' : monkMood === 'content' ? '( ^_^ )' : '( -_- )'),
    h('button', {
      className: 'flex h-20 w-20 items-center justify-center rounded-full border border-border bg-background-hover text-2xl hover:border-accent hover:shadow-[0_0_16px_rgba(110,168,254,0.15)] active:scale-95 transition-all',
      onClick: knock,
      title: '点击木鱼',
    }, 'ˇ ˇ'),
    h('div', { className: 'text-center text-[11px] text-text-muted' }, '点击木鱼 · 空格连击'),
    zenText && h('div', { className: 'animate-fadeIn rounded border border-border px-3 py-2 text-text' }, zenText),
    h('div', { className: 'mt-2 w-full border-t border-border pt-2 text-[11px] text-text-muted' },
      h('div', { className: 'flex justify-between' },
        h('span', null, `敲击 ${knockCount} 下`),
        h('span', null, `连击 ${combo} 次`),
        h('span', null, `放空 ${Math.round(totalZenSeconds)} 秒`),
      ),
      h('div', { className: 'mt-2 flex items-center gap-2' },
        h('span', null, '音色'),
        ['muyu', 'bo', 'qing'].map((p) =>
          h('button', {
            key: p,
            className: `rounded px-2 py-0.5 text-[10px] ${soundPreference === p ? 'bg-accent text-black' : 'border border-border hover:bg-background-hover'}`,
            onClick: () => setSoundPreference(p),
          }, p === 'muyu' ? '木鱼' : p === 'bo' ? '钵' : '磬')
        ),
      ),
    ),
  )
}

// ── 抽签 Tab ──────────────────────────────────────────────────────────────

function FortuneTab() {
  const { fortuneCount, addFortune } = useZenStore()
  const [fortune, setFortune] = useState(null)
  const [shaking, setShaking] = useState(false)

  const draw = () => {
    if (shaking) return
    setShaking(true)
    setFortune(null)
    setTimeout(() => {
      const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]
      setFortune(f)
      addFortune(f.luck, f.text)
      setShaking(false)
    }, 600)
  }

  const luckColor = (luck) => {
    const map = { '大吉': 'text-pink-400', '中吉': 'text-amber-400', '吉': 'text-green-400', '小吉': 'text-cyan-400', '末吉': 'text-text-muted', '凶': 'text-red-400', '大凶': 'text-red-500' }
    return map[luck] || 'text-text'
  }

  return h('div', { className: 'flex flex-col items-center gap-4' },
    h('div', { className: 'text-lg' }, shaking ? '( ・_・)' : '( ^_^ )'),
    h('button', {
      className: `rounded border border-border px-6 py-2 text-sm font-bold tracking-wider transition-all hover:border-accent hover:text-text ${shaking ? 'animate-pulse opacity-50' : ''}`,
      onClick: draw,
      disabled: shaking,
    }, '点击抽签'),
    fortune && h('div', { className: 'animate-fadeIn mt-2 w-full max-w-xs rounded border border-border p-4 text-center' },
      h('div', { className: `mb-2 text-lg font-bold tracking-wider ${luckColor(fortune.luck)}` }, fortune.luck),
      h('div', { className: 'mb-1 text-text leading-relaxed' }, fortune.text),
      h('div', { className: 'mt-2 text-[10px] text-text-muted italic' }, '-- ' + fortune.book),
    ),
    h('div', { className: 'mt-2 text-[11px] text-text-muted' }, `今日已抽 ${fortuneCount} 次`),
  )
}

// ── 答案之书 Tab ──────────────────────────────────────────────────────────

function BookTab() {
  const { bookCount, addBook } = useZenStore()
  const [page, setPage] = useState(null)
  const [showSecond, setShowSecond] = useState(false)
  const [open, setOpen] = useState(false)

  const flip = () => {
    const idx = Math.floor(Math.random() * PUNCHLINES.length)
    const [setup, punch] = PUNCHLINES[idx]
    setPage({ first: setup + punch, second: SECOND_LINES[idx] || '小僧也不知道。但他知道你没写测试。', idx })
    setShowSecond(false)
    setOpen(true)
    addBook(setup + punch)
  }

  return h('div', { className: 'flex flex-col items-center gap-4' },
    h('div', { className: 'text-lg' }, open ? '( -_- )' : '( ^_^ )'),
    !open
      ? h('div', { className: 'flex flex-col items-center gap-3' },
          h('div', { className: 'text-center text-[11px] text-text-muted' }, '默念你的问题，然后翻开'),
          h('button', {
            className: 'flex h-28 w-36 items-center justify-center rounded border border-border bg-background-hover text-sm font-bold tracking-widest transition-all hover:border-accent hover:text-text',
            onClick: flip,
          }, '答案之书'),
        )
      : h('div', { className: 'animate-fadeIn flex w-full max-w-xs flex-col gap-3' },
          h('div', { className: 'rounded border border-border p-4 text-text leading-relaxed' }, page.first),
          !showSecond
            ? h('button', {
                className: 'self-center rounded border border-border px-4 py-1.5 text-[11px] text-text-muted hover:border-accent hover:text-text transition-all',
                onClick: () => setShowSecond(true),
              }, '追问')
            : h('div', { className: 'animate-fadeIn rounded border border-border p-4 text-text leading-relaxed' }, page.second),
          h('button', {
            className: 'self-center text-[11px] text-text-muted hover:text-text mt-2',
            onClick: () => { setOpen(false); setShowSecond(false) },
          }, '再翻一本'),
        ),
    h('div', { className: 'mt-2 text-[11px] text-text-muted' }, `今日已翻 ${bookCount} 次`),
  )
}

// ── 日记 Tab ──────────────────────────────────────────────────────────────

function DiaryTab() {
  const { history, firstSeen, knockCount, fortuneCount, bookCount } = useZenStore()

  const totalDays = firstSeen
    ? Math.floor((Date.now() - new Date(firstSeen).getTime()) / 86400000) + 1
    : 1

  return h('div', { className: 'flex flex-col gap-4' },
    h('div', { className: 'text-[11px] text-text-muted' },
      `小僧陪了你 ${totalDays} 天。敲了 ${knockCount} 下，抽了 ${fortuneCount} 签，翻了 ${bookCount} 次书。`,
    ),
    history.length === 0
      ? h('div', { className: 'text-center text-[11px] text-text-muted italic' }, '小僧的日记本还是空白的。去找他吧。')
      : history.slice(0, 7).map((day) =>
          h('div', { key: day.date },
            h('div', { className: 'mb-1 text-[11px] font-bold tracking-wider text-text' }, '-- ' + day.date + ' --'),
            day.entries.slice(0, 20).map((entry, i) =>
              h('div', { key: i, className: 'flex gap-3 py-0.5 text-[11px]' },
                h('span', { className: 'shrink-0 text-text-muted' }, entry.time),
                h('span', { className: 'text-text-muted' }, entry.type.startsWith('ai_') ? 'AI' : '你'),
                h('span', { className: 'text-text-secondary' }, entry.detail),
              ),
            ),
            day.entries.length > 20 && h('div', { className: 'text-[11px] text-text-muted italic' }, `... 还有 ${day.entries.length - 20} 条`),
          ),
        ),
    history.length > 7 && h('div', { className: 'text-center text-[11px] text-text-muted' }, `还有 ${history.length - 7} 天的记录`),
  )
}

// ── 声音效果 ──────────────────────────────────────────────────────────────

function playKnockSound(pref) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    if (pref === 'muyu') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(600, now)
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
    } else if (pref === 'bo') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, now)
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.3)
      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1200, now)
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.5)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8)
    }

    osc.start(now)
    osc.stop(now + 1)
    setTimeout(() => ctx.close(), 1200)
  } catch {
    // 静默失败
  }
}