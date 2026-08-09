/**
 * 禅房 - 状态管理
 *
 * 纯前端持久化，不依赖 MCP server。
 * 状态包括：敲击次数、连击、抽签记录、答案之书记录、历史日记。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ZenEntry {
  time: string
  type: 'knock' | 'fortune' | 'book' | 'ai_knock' | 'ai_fortune' | 'ai_book'
  detail?: string
  context?: string
}

export interface ZenDay {
  date: string
  entries: ZenEntry[]
}

export type MonkMood = 'idle' | 'content' | 'sleepy' | 'happy'
export type SoundPref = 'muyu' | 'bo' | 'qing'
export type AutoKnock = 'off' | 'slow' | 'medium'

interface ZenState {
  knockCount: number
  maxCombo: number
  totalZenSeconds: number
  fortuneCount: number
  bookCount: number
  firstSeen: string | null
  lastSeen: string | null
  monkMood: MonkMood
  soundPreference: SoundPref
  autoKnock: AutoKnock
  history: ZenDay[]
}

interface ZenActions {
  addKnock: (count: number, context?: string) => void
  addFortune: (fortune: string, text: string) => void
  addBook: (answer: string) => void
  addAiKnock: (count: number, note: string) => void
  addAiFortune: (fortune: string, text: string) => void
  addAiBook: (answer: string, question: string) => void
  setSoundPreference: (pref: SoundPref) => void
  setAutoKnock: (mode: AutoKnock) => void
  setMonkMood: (mood: MonkMood) => void
  resetStats: () => void
}

type ZenStore = ZenState & ZenActions

function getTodayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTimeStr(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getOrCreateToday(history: ZenDay[]): ZenDay[] {
  const today = getTodayKey()
  if (history.length > 0 && history[0].date === today) {
    return history
  }
  return [{ date: today, entries: [] }, ...history]
}

export const useZenStore = create<ZenStore>()(
  persist(
    (set) => ({
      // state
      knockCount: 0,
      maxCombo: 0,
      totalZenSeconds: 0,
      fortuneCount: 0,
      bookCount: 0,
      firstSeen: null,
      lastSeen: null,
      monkMood: 'idle',
      soundPreference: 'muyu',
      autoKnock: 'off',
      history: [],

      // actions
      addKnock: (count, context) =>
        set((state) => {
          const now = new Date().toISOString()
          const history = getOrCreateToday(state.history)
          history[0].entries.push({
            time: getTimeStr(),
            type: 'knock',
            detail: count > 1 ? `连敲 ${count} 下` : `敲了 1 下`,
            context,
          })
          return {
            knockCount: state.knockCount + count,
            maxCombo: Math.max(state.maxCombo, count),
            totalZenSeconds: state.totalZenSeconds + count * 0.8,
            lastSeen: now,
            firstSeen: state.firstSeen ?? now,
            history,
          }
        }),

      addFortune: (fortune, text) =>
        set((state) => {
          const now = new Date().toISOString()
          const history = getOrCreateToday(state.history)
          history[0].entries.push({
            time: getTimeStr(),
            type: 'fortune',
            detail: `${fortune} - ${text}`,
          })
          return {
            fortuneCount: state.fortuneCount + 1,
            lastSeen: now,
            firstSeen: state.firstSeen ?? now,
            history,
          }
        }),

      addBook: (answer) =>
        set((state) => {
          const now = new Date().toISOString()
          const history = getOrCreateToday(state.history)
          history[0].entries.push({
            time: getTimeStr(),
            type: 'book',
            detail: answer,
          })
          return {
            bookCount: state.bookCount + 1,
            lastSeen: now,
            firstSeen: state.firstSeen ?? now,
            history,
          }
        }),

      addAiKnock: (count, note) =>
        set((state) => {
          const now = new Date().toISOString()
          const history = getOrCreateToday(state.history)
          history[0].entries.push({
            time: getTimeStr(),
            type: 'ai_knock',
            detail: `AI 替你敲了 ${count} 下`,
            context: note,
          })
          return {
            knockCount: state.knockCount + count,
            lastSeen: now,
            firstSeen: state.firstSeen ?? now,
            history,
          }
        }),

      addAiFortune: (fortune, text) =>
        set((state) => {
          const now = new Date().toISOString()
          const history = getOrCreateToday(state.history)
          history[0].entries.push({
            time: getTimeStr(),
            type: 'ai_fortune',
            detail: `AI 代抽 - ${fortune}: ${text}`,
          })
          return {
            fortuneCount: state.fortuneCount + 1,
            lastSeen: now,
            firstSeen: state.firstSeen ?? now,
            history,
          }
        }),

      addAiBook: (answer, question) =>
        set((state) => {
          const now = new Date().toISOString()
          const history = getOrCreateToday(state.history)
          history[0].entries.push({
            time: getTimeStr(),
            type: 'ai_book',
            detail: `AI 代问「${question}」: ${answer}`,
          })
          return {
            bookCount: state.bookCount + 1,
            lastSeen: now,
            firstSeen: state.firstSeen ?? now,
            history,
          }
        }),

      setSoundPreference: (pref) => set({ soundPreference: pref }),
      setAutoKnock: (mode) => set({ autoKnock: mode }),
      setMonkMood: (mood) => set({ monkMood: mood }),
      resetStats: () =>
        set({
          knockCount: 0,
          maxCombo: 0,
          totalZenSeconds: 0,
          fortuneCount: 0,
          bookCount: 0,
          history: [],
        }),
    }),
    {
      name: 'polaris-zen-storage',
      partialize: (state) => ({
        knockCount: state.knockCount,
        maxCombo: state.maxCombo,
        totalZenSeconds: state.totalZenSeconds,
        fortuneCount: state.fortuneCount,
        bookCount: state.bookCount,
        firstSeen: state.firstSeen,
        lastSeen: state.lastSeen,
        soundPreference: state.soundPreference,
        autoKnock: state.autoKnock,
        history: state.history,
      }),
    }
  )
)

// 获取小僧空闲时的表情
export function getMonkFace(mood: MonkMood): string {
  switch (mood) {
    case 'idle': return '( -_- )'
    case 'content': return '( ^_^ )'
    case 'sleepy': return '( -_-)zzz'
    case 'happy': return '( ^o^ )'
  }
}