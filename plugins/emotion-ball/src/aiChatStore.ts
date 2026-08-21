/**
 * EmotionBall v2 — AI 对话状态管理
 *
 * OpenAI 兼容协议，流式输出。AI 在回复中用 [emotion:ID] 标记情绪。
 */

import React from 'react'
import { EMOTION_SEED, type EmotionDef } from './emotions'
import { DEFAULT_APPEARANCE, type AppearanceConfig } from './types'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export type AiStatus = 'idle' | 'connecting' | 'streaming' | 'error'

// zustand 不能 import（沙箱里要 external），用简易 store
type Listener = () => void

export interface ChatState {
  aiConfig: AiConfig
  appearance: AppearanceConfig
  messages: ChatMessage[]
  aiStatus: AiStatus
  aiError: string | null
  emotion: string
  streamText: string
  autoEmotion: boolean
  showHistory: boolean
  setAiConfig: (patch: Partial<AiConfig>) => void
  setAppearance: (patch: Partial<AppearanceConfig>) => void
  addMessage: (m: ChatMessage) => void
  clearMessages: () => void
  setAiStatus: (s: AiStatus) => void
  setAiError: (e: string | null) => void
  setEmotion: (id: string) => void
  setStreamText: (t: string) => void
  appendStreamText: (t: string) => void
  setAutoEmotion: (b: boolean) => void
  setShowHistory: (b: boolean) => void
}

const DEFAULT_CONFIG: AiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
}

const SYS_PROMPT = `你是 Emotion Ball 测试助手。请简短回复（1-2句话）。回复末尾必须用一行 [emotion:ID] 标记你的情绪，ID 范围：
- 00-07: 生命周期（00睡眠/01唤醒/02待机/03好奇/04倾听/05专注/06困惑/07走神）
- 10-21: 情绪（10开心/11大笑/12害羞/13惊讶/14生气/15悲伤/16得意/17期待/18困惑恼/19宠爱/20激动/21淡定）
- 30-41: 代理状态（30思考/31检索/32读写/33生成/34校验/35出错/36完成/37等待输入/38调用工具/39深思考/40组织语言/41回顾）
例如：
好的，我帮你看看！
[emotion:10]`

class SimpleStore {
  state: ChatState
  private listeners: Set<Listener> = new Set()

  constructor() {
    this.state = {
      aiConfig: { ...DEFAULT_CONFIG },
      appearance: { ...DEFAULT_APPEARANCE },
      messages: [{ role: 'system', content: SYS_PROMPT }],
      aiStatus: 'idle',
      aiError: null,
      emotion: '02',
      streamText: '',
      autoEmotion: true,
      showHistory: false,
      setAiConfig: (patch) => {
        this.state.aiConfig = { ...this.state.aiConfig, ...patch }
        this.emit()
      },
      setAppearance: (patch) => {
        this.state.appearance = { ...this.state.appearance, ...patch }
        this.emit()
      },
      addMessage: (m) => {
        this.state.messages = [...this.state.messages, m]
        this.emit()
      },
      clearMessages: () => {
        this.state.messages = [{ role: 'system', content: SYS_PROMPT }]
        this.emit()
      },
      setAiStatus: (s) => { this.state.aiStatus = s; this.emit() },
      setAiError: (e) => { this.state.aiError = e; this.emit() },
      setEmotion: (id) => { this.state.emotion = id; this.emit() },
      setStreamText: (t) => { this.state.streamText = t; this.emit() },
      appendStreamText: (t) => { this.state.streamText = this.state.streamText + t; this.emit() },
      setAutoEmotion: (b) => { this.state.autoEmotion = b; this.emit() },
      setShowHistory: (b) => { this.state.showHistory = b; this.emit() },
    }
  }

  subscribe = (cb: Listener) => {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }
  getSnapshot = () => this.state
  private emit() { this.listeners.forEach((l) => l()) }
}

export const chatStore = new SimpleStore()

/** React hook 订阅 store */
export function useChatStore(): ChatState {
  return React.useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot, chatStore.getSnapshot)
}

/** 从文本解析情绪标记 */
export function parseEmotionFromText(text: string): string | null {
  const m = text.match(/\[emotion:([0-9]+)\]/)
  if (!m) return null
  const id = m[1]
  return EMOTION_SEED.some((e) => e.id === id) ? id : null
}

/** 去除情绪标记 */
export function stripEmotionTag(text: string): string {
  return text.replace(/\n?\[emotion:[0-9]+\]/g, '').trim()
}

/** OpenAI 兼容流式请求 */
export async function sendChatMessage(
  config: AiConfig,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`
  const body = {
    model: config.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`API ${resp.status}: ${errText.slice(0, 200)}`)
  }
  const reader = resp.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const tr = line.trim()
      if (!tr || !tr.startsWith('data: ')) continue
      const data = tr.slice(6)
      if (data === '[DONE]') continue
      try {
        const p = JSON.parse(data)
        const c = p.choices?.[0]?.delta?.content || ''
        if (c) { full += c; onChunk(c) }
      } catch { /* skip */ }
    }
  }
  return full
}

/** 按分组返回情绪列表 */
export function groupedEmotions(): { group: string; label: string; items: EmotionDef[] }[] {
  const groups: { [k: string]: { label: string; items: EmotionDef[] } } = {
    life: { label: '生命周期', items: [] },
    emotion: { label: '情绪反应', items: [] },
    agent: { label: '代理状态', items: [] },
    custom: { label: '自定义', items: [] },
  }
  for (const e of EMOTION_SEED) {
    groups[e.group]?.items.push(e)
  }
  return Object.entries(groups).map(([k, v]) => ({ group: k, label: v.label, items: v.items }))
}
