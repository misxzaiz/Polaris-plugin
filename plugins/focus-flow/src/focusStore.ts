/**
 * 心流专注 FlowFocus - 状态管理
 *
 * 纯前端持久化（zustand persist），记录专注会话、进行中的专注、统计。
 * 与 MCP server 的 data/focus.json 数据结构保持一致，便于未来同步。
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface FocusSession {
  id: string
  task: string
  startAt: string
  endAt: string
  durationMin: number
  goalMin: number
  feel: number | null // 1-5 心流程度
  distraction: string | null
  note: string | null
}

export interface ActiveFocus {
  task: string
  startAt: string
  goalMin: number
}

interface FocusState {
  sessions: FocusSession[]
  active: ActiveFocus | null
  totalFocusMin: number
  lastFocusDate: string | null
  streakStart: string | null
}

interface FocusActions {
  startFocus: (task: string, goalMin: number) => boolean
  stopFocus: (feel: number | null, distraction: string, note: string) => FocusSession | null
  cancelFocus: () => void
  clearAll: () => void
}

type FocusStore = FocusState & FocusActions

function nowIso() {
  return new Date().toISOString()
}

function todayKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const useFocusStore = create<FocusStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      active: null,
      totalFocusMin: 0,
      lastFocusDate: null,
      streakStart: null,

      startFocus(task, goalMin) {
        if (get().active) return false
        set({ active: { task, startAt: nowIso(), goalMin } })
        return true
      },

      stopFocus(feel, distraction, note) {
        const { active, sessions, totalFocusMin, lastFocusDate } = get()
        if (!active) return null
        const endAt = new Date()
        const durationMin = Math.max(
          1,
          Math.round((endAt.getTime() - new Date(active.startAt).getTime()) / 60000)
        )
        const session: FocusSession = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          task: active.task,
          startAt: active.startAt,
          endAt: endAt.toISOString(),
          durationMin,
          goalMin: active.goalMin,
          feel,
          distraction: distraction?.trim() || null,
          note: note?.trim() || null,
        }
        const tKey = todayKey(endAt)
        set({
          sessions: [...sessions, session],
          active: null,
          totalFocusMin: totalFocusMin + durationMin,
          lastFocusDate: tKey,
          streakStart: lastFocusDate ? get().streakStart : (get().streakStart ?? tKey),
        })
        return session
      },

      cancelFocus() {
        set({ active: null })
      },

      clearAll() {
        set({
          sessions: [],
          active: null,
          totalFocusMin: 0,
          lastFocusDate: null,
          streakStart: null,
        })
      },
    }),
    {
      name: 'polaris-focus-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// ── 派生统计工具函数 ──────────────────────────────────────────────────────

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function computeStreak(state: { lastFocusDate: string | null }): number {
  if (!state.lastFocusDate) return 0
  const last = new Date(state.lastFocusDate + 'T00:00:00')
  const today = new Date(todayKey() + 'T00:00:00')
  const diff = Math.round((today.getTime() - last.getTime()) / 86400000)
  if (diff > 1) return 0
  // 简单实现：最近一次专注在昨天或今天 → 连续
  return 1
}

export function todayFocus(state: { sessions: FocusSession[] }) {
  const key = todayKey()
  const list = state.sessions.filter(s => s.startAt.startsWith(key))
  return {
    count: list.length,
    min: list.reduce((a, s) => a + s.durationMin, 0),
  }
}

export function weekFocus(state: { sessions: FocusSession[] }) {
  const now = new Date()
  const day = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  const mondayKey = todayKey(monday)
  const list = state.sessions.filter(s => s.startAt >= mondayKey + 'T00:00:00')
  return {
    count: list.length,
    min: list.reduce((a, s) => a + s.durationMin, 0),
  }
}

export function last7days(state: { sessions: FocusSession[] }) {
  const now = new Date()
  const out: { date: string; min: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = todayKey(d)
    const min = state.sessions
      .filter(s => s.startAt.startsWith(key))
      .reduce((a, s) => a + s.durationMin, 0)
    out.push({ date: key, min })
  }
  return out
}

export function avgFeel(state: { sessions: FocusSession[] }) {
  const feels = state.sessions.map(s => s.feel).filter((f): f is number => f != null)
  if (feels.length === 0) return 0
  return Math.round((feels.reduce((a, b) => a + b, 0) / feels.length) * 10) / 10
}

export function topDistractions(state: { sessions: FocusSession[] }) {
  const counts: Record<string, number> = {}
  state.sessions.forEach(s => {
    if (s.distraction) counts[s.distraction] = (counts[s.distraction] || 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))
}
