/**
 * 心流专注 FlowFocus 面板
 *
 * 三个 tab：专注（计时器）、记录、统计
 * 计时器实时刷新 · 心流热力图 · 干扰源分析
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
import {
  useFocusStore,
  fmtDuration,
  computeStreak,
  todayFocus,
  weekFocus,
  last7days,
  avgFeel,
  topDistractions,
  type FocusSession,
} from './focusStore'

// ── 主面板 ────────────────────────────────────────────────────────────────

export default function FocusFlowPanel({ pluginId }) {
  const [tab, setTab] = useState('focus')

  return h('div', { className: 'flex h-full flex-col bg-background font-mono text-xs text-text-secondary' },
    h('div', { className: 'flex items-center justify-between border-b border-border px-3 py-2' },
      h('span', { className: 'font-bold tracking-wider text-text' }, '心流专注'),
      h('span', { className: 'text-lg leading-none' }, '🌊'),
    ),
    h('div', { className: 'flex border-b border-border' },
      h(TabBtn, { active: tab === 'focus', onClick: () => setTab('focus') }, '专注'),
      h(TabBtn, { active: tab === 'log', onClick: () => setTab('log') }, '记录'),
      h(TabBtn, { active: tab === 'stats', onClick: () => setTab('stats') }, '统计'),
    ),
    h('div', { className: 'flex-1 overflow-y-auto p-4' },
      tab === 'focus' && h(FocusTab),
      tab === 'log' && h(LogTab),
      tab === 'stats' && h(StatsTab),
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

// ── 专注 Tab ──────────────────────────────────────────────────────────────

function FocusTab() {
  const { active, startFocus, stopFocus, cancelFocus } = useFocusStore()
  const [task, setTask] = useState('')
  const [goalMin, setGoalMin] = useState(25)
  const [feel, setFeel] = useState(4)
  const [distraction, setDistraction] = useState('')
  const [note, setNote] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const pausedAtRef = useRef(0)

  // 计时器刷新
  useEffect(() => {
    if (!active || paused) return
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(active.startAt).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [active, paused])

  const handleStart = () => {
    const name = task.trim() || '专注'
    if (startFocus(name, goalMin)) {
      setTask('')
      setElapsed(0)
    }
  }

  const handleStop = () => {
    const s = stopFocus(feel, distraction, note)
    if (s) {
      setDistraction('')
      setNote('')
      setPaused(false)
      pausedAtRef.current = 0
    }
  }

  if (!active) {
    return h('div', { className: 'flex flex-col gap-4' },
      h('div', { className: 'rounded-lg border border-border bg-background-elevated p-4 text-center' },
        h('div', { className: 'mb-1 text-[11px] text-text-muted' }, '准备进入心流'),
        h('div', { className: 'text-4xl' }, '🌊'),
        h('div', { className: 'mt-2 text-[11px] text-text-muted' }, '设定一个目标，然后专注开始'),
      ),
      h('div', { className: 'flex flex-col gap-2' },
        h('input', {
          className: 'rounded border border-border bg-background px-3 py-2 text-text outline-none focus:border-accent',
          placeholder: '专注任务，如：写方案 / 读书 / 学习',
          value: task,
          onChange: e => setTask(e.target.value),
          onKeyDown: e => e.key === 'Enter' && handleStart(),
        }),
        h('div', { className: 'flex items-center gap-2' },
          h('span', { className: 'text-text-muted' }, '目标'),
          h('select', {
            className: 'flex-1 rounded border border-border bg-background px-2 py-2 text-text outline-none focus:border-accent',
            value: goalMin,
            onChange: e => setGoalMin(Number(e.target.value)),
          },
            [15, 25, 45, 60, 90].map(m => h('option', { key: m, value: m }, `${m} 分钟`)),
          ),
        ),
        h('button', {
          className: 'rounded bg-accent px-3 py-2.5 font-bold text-black transition-opacity hover:opacity-90',
          onClick: handleStart,
        }, '开始专注'),
      ),
    )
  }

  // 进行中
  const eMin = Math.floor(elapsed / 60)
  const eSec = elapsed % 60
  const mm = String(eMin).padStart(2, '0')
  const ss = String(eSec).padStart(2, '0')

  return h('div', { className: 'flex flex-col gap-4' },
    h('div', { className: 'rounded-lg border border-accent/40 bg-background-elevated p-4 text-center' },
      h('div', { className: 'mb-1 text-[11px] text-text-muted' }, active.task),
      h('div', { className: 'text-5xl font-bold tabular-nums text-text' }, `${mm}:${ss}`),
      h('div', { className: 'mt-1 text-[11px] text-text-muted' }, `目标 ${active.goalMin} 分钟`),
      h('div', { className: 'mt-2 flex items-center justify-center gap-2' },
        h('button', {
          className: 'rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:border-accent hover:text-text',
          onClick: () => {
            if (!paused) pausedAtRef.current = Date.now()
            setPaused(p => !p)
          },
        }, paused ? '继续' : '暂停'),
        h('button', {
          className: 'rounded border border-red-400/40 px-3 py-1 text-[11px] text-red-400 hover:bg-red-400/10',
          onClick: cancelFocus,
        }, '放弃'),
      ),
    ),
    paused && h('div', { className: 'rounded border border-border p-3 text-center text-[11px] text-text-muted' },
      '已暂停 · 心流随时可以回来'),
    h('div', { className: 'flex flex-col gap-2' },
      h('div', { className: 'text-[11px] font-bold tracking-wider text-text' }, '结束本次专注'),
      h('div', { className: 'flex items-center gap-1' },
        h('span', { className: 'text-text-muted' }, '心流'),
        [1, 2, 3, 4, 5].map(v => h('button', {
          key: v,
          className: `rounded px-2 py-1 text-[11px] ${feel === v ? 'bg-accent text-black' : 'border border-border text-text-muted hover:bg-background-hover'}`,
          onClick: () => setFeel(v),
        }, String(v))),
      ),
      h('input', {
        className: 'rounded border border-border bg-background px-3 py-2 text-text outline-none focus:border-accent',
        placeholder: '主要干扰源（可选）：手机 / 消息 / 杂念',
        value: distraction,
        onChange: e => setDistraction(e.target.value),
      }),
      h('input', {
        className: 'rounded border border-border bg-background px-3 py-2 text-text outline-none focus:border-accent',
        placeholder: '本次感悟（可选）',
        value: note,
        onChange: e => setNote(e.target.value),
      }),
      h('button', {
        className: 'rounded bg-accent px-3 py-2.5 font-bold text-black transition-opacity hover:opacity-90',
        onClick: handleStop,
      }, `完成 · 记录 ${fmtDuration(Math.max(1, Math.round(elapsed / 60)))}`),
    ),
  )
}

// ── 记录 Tab ──────────────────────────────────────────────────────────────

function LogTab() {
  const sessions = useFocusStore(s => s.sessions)
  const sorted = [...sessions].reverse()

  if (sorted.length === 0) {
    return h('div', { className: 'py-10 text-center text-[11px] text-text-muted italic' },
      '还没有专注记录。去开始一次心流吧。')
  }

  const feelDot = (f: number | null) => {
    const map = { 5: 'bg-emerald-400', 4: 'bg-green-400', 3: 'bg-yellow-400', 2: 'bg-orange-400', 1: 'bg-red-400' }
    return map[f] || 'bg-text-muted'
  }

  return h('div', { className: 'flex flex-col gap-2' },
    sorted.slice(0, 50).map(s => h('div', {
      key: s.id,
      className: 'flex items-center gap-2 rounded border border-border bg-background-elevated px-3 py-2',
    },
      h('div', { className: `h-2 w-2 shrink-0 rounded-full ${feelDot(s.feel)}` }),
      h('div', { className: 'min-w-0 flex-1' },
        h('div', { className: 'truncate text-text' }, s.task),
        h('div', { className: 'truncate text-[10px] text-text-muted' },
          s.startAt.slice(0, 16).replace('T', ' ') + (s.note ? ` · ${s.note}` : '') + (s.distraction ? ` · 干扰:${s.distraction}` : ''),
        ),
      ),
      h('div', { className: 'shrink-0 text-[11px] font-bold tabular-nums text-text' }, fmtDuration(s.durationMin)),
    )),
    sorted.length > 50 && h('div', { className: 'text-center text-[11px] text-text-muted' },
      `... 还有 ${sorted.length - 50} 条`),
  )
}

// ── 统计 Tab ──────────────────────────────────────────────────────────────

function StatsTab() {
  const state = useFocusStore()
  const today = todayFocus(state)
  const week = weekFocus(state)
  const heat = last7days(state)
  const feel = avgFeel(state)
  const dists = topDistractions(state)
  const streak = computeStreak(state)

  const heatColor = (min: number) => {
    if (min >= 90) return 'bg-emerald-500'
    if (min >= 60) return 'bg-emerald-400'
    if (min >= 30) return 'bg-green-400'
    if (min > 0) return 'bg-green-600/50'
    return 'bg-background-hover'
  }

  return h('div', { className: 'flex flex-col gap-4' },
    // 统计卡片
    h('div', { className: 'grid grid-cols-4 gap-2' },
      h(StatCard, { label: '今日', value: fmtDuration(today.min), sub: `${today.count} 次` }),
      h(StatCard, { label: '本周', value: fmtDuration(week.min), sub: `${week.count} 次` }),
      h(StatCard, { label: '累计', value: fmtDuration(state.totalFocusMin), sub: `${state.sessions.length} 次` }),
      h(StatCard, { label: '连续', value: `${streak}`, sub: '天' }),
    ),

    // 近 7 天热力图
    h('div', { className: 'rounded-lg border border-border bg-background-elevated p-3' },
      h('div', { className: 'mb-2 text-[11px] font-bold tracking-wider text-text' }, '近 7 天专注'),
      h('div', { className: 'flex gap-1.5' },
        heat.map(d => {
          const dayName = ['日', '一', '二', '三', '四', '五', '六'][new Date(d.date + 'T00:00:00').getDay()]
          return h('div', { key: d.date, className: 'flex flex-1 flex-col items-center gap-1' },
            h('div', {
              className: `h-9 w-full rounded ${heatColor(d.min)}`,
              title: `${d.date} · ${fmtDuration(d.min)}`,
            }),
            h('span', { className: 'text-[10px] text-text-muted' }, dayName),
          )
        }),
      ),
    ),

    // 心流质量
    h('div', { className: 'flex gap-2 rounded-lg border border-border bg-background-elevated p-3' },
      h('div', { className: 'flex-1 text-center' },
        h('div', { className: 'text-2xl font-bold text-text' }, feel || '–'),
        h('div', { className: 'text-[10px] text-text-muted' }, '平均心流 / 5'),
      ),
      h('div', { className: 'w-px bg-border' }),
      h('div', { className: 'flex-1 text-center' },
        h('div', { className: 'text-2xl font-bold text-text' },
          state.totalFocusMin > 0 ? Math.round(state.totalFocusMin / Math.max(1, state.sessions.length)) : '–'),
        h('div', { className: 'text-[10px] text-text-muted' }, '平均时长(m)'),
      ),
    ),

    // 干扰源分析
    dists.length > 0 && h('div', { className: 'rounded-lg border border-border bg-background-elevated p-3' },
      h('div', { className: 'mb-2 text-[11px] font-bold tracking-wider text-text' }, '主要干扰源'),
      h('div', { className: 'flex flex-col gap-1.5' },
        dists.map(d => {
          const max = dists[0].count
          const pct = Math.round((d.count / max) * 100)
          return h('div', { key: d.name, className: 'flex items-center gap-2' },
            h('span', { className: 'w-16 shrink-0 truncate text-text-muted' }, d.name),
            h('div', { className: 'h-2 flex-1 overflow-hidden rounded-full bg-background-hover' },
              h('div', { className: 'h-full rounded-full bg-accent', style: { width: `${pct}%` } }),
            ),
            h('span', { className: 'w-8 shrink-0 text-right text-[10px] text-text-muted' }, `${d.count}次`),
          )
        }),
      ),
    ),

    // 清空
    state.sessions.length > 0 && h('button', {
      className: 'self-center text-[10px] text-text-muted hover:text-red-400',
      onClick: () => {
        if (confirm('确定清空全部专注记录？')) useFocusStore.getState().clearAll()
      },
    }, '清空全部记录'),
  )
}

function StatCard({ label, value, sub }) {
  return h('div', { className: 'rounded-lg border border-border bg-background-elevated p-2 text-center' },
    h('div', { className: 'text-[10px] text-text-muted' }, label),
    h('div', { className: 'mt-0.5 text-sm font-bold text-text' }, value),
    h('div', { className: 'text-[10px] text-text-muted' }, sub),
  )
}
