/**
 * 情绪球测试面板 - AI 对话状态管理
 *
 * 支持 OpenAI 兼容协议（自定义端点）
 */

import { create } from 'zustand'

// ── 类型 ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiConfig {
  /** API 端点，如 https://api.openai.com/v1 */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名，如 gpt-4o-mini */
  model: string
}

export type AiStatus = 'idle' | 'connecting' | 'streaming' | 'error'

export type EmotionState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'error'
  | 'listening'

interface AiChatState {
  // ── AI 配置 ──
  aiConfig: AiConfig
  setAiConfig: (config: Partial<AiConfig>) => void

  // ── 对话状态 ──
  messages: ChatMessage[]
  addMessage: (msg: ChatMessage) => void
  clearMessages: () => void

  // ── AI 连接状态 ──
  aiStatus: AiStatus
  aiError: string | null
  setAiStatus: (status: AiStatus) => void
  setAiError: (error: string | null) => void

  // ── 情绪状态 ──
  emotion: EmotionState
  setEmotion: (emotion: EmotionState) => void

  // ── 流式响应文本 ──
  streamText: string
  setStreamText: (text: string) => void
  appendStreamText: (text: string) => void

  // ── 自动情绪模式（AI 自动选择情绪，不依赖手动） ──
  autoEmotion: boolean
  setAutoEmotion: (on: boolean) => void

  // ── 对话历史数 ──
  showHistory: boolean
  setShowHistory: (show: boolean) => void
}

const DEFAULT_CONFIG: AiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export const useAiChatStore = create<AiChatState>((set) => ({
  aiConfig: { ...DEFAULT_CONFIG },
  setAiConfig: (patch) =>
    set((s) => ({ aiConfig: { ...s.aiConfig, ...patch } })),

  messages: [
    {
      role: 'system',
      content: '你是 Emotion Ball 测试助手。请尽量简短回复（1-2句话）。同时根据你回复内容的情绪，在回复末尾用一行 `[emotion:xxx]` 标记情绪，可选值：happy/sad/excited/thinking/streaming/idle。例如：\n```\n好的，我帮你看看！\n[emotion:happy]\n```',
    },
  ],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () =>
    set({
      messages: [
        {
          role: 'system',
          content: '你是 Emotion Ball 测试助手。请尽量简短回复（1-2句话）。同时根据你回复内容的情绪，在回复末尾用一行 `[emotion:xxx]` 标记情绪，可选值：happy/sad/excited/thinking/streaming/idle。例如：\n```\n好的，我帮你看看！\n[emotion:happy]\n```',
        },
      ],
    }),

  aiStatus: 'idle',
  aiError: null,
  setAiStatus: (status) => set({ aiStatus: status }),
  setAiError: (error) => set({ aiError: error }),

  emotion: 'idle',
  setEmotion: (emotion) => set({ emotion }),

  streamText: '',
  setStreamText: (text) => set({ streamText: text }),
  appendStreamText: (text) => set((s) => ({ streamText: s.streamText + text })),

  autoEmotion: true,
  setAutoEmotion: (on) => set({ autoEmotion: on }),

  showHistory: false,
  setShowHistory: (show) => set({ showHistory: show }),
}))

// ── 解析 AI 回复中的情绪标记 ──────────────────────────────────────────────

export function parseEmotionFromText(text: string): EmotionState | null {
  const match = text.match(/\[emotion:(\w+)\]/)
  if (!match) return null
  const emotion = match[1] as EmotionState
  const valid: EmotionState[] = ['idle', 'thinking', 'streaming', 'happy', 'sad', 'excited', 'error', 'listening']
  return valid.includes(emotion) ? emotion : null
}

export function stripEmotionTag(text: string): string {
  return text.replace(/\n?\[emotion:\w+\]/g, '').trim()
}

// ── AI 发送消息 ────────────────────────────────────────────────────────────

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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`API error ${response.status}: ${errText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content || ''
        if (content) {
          fullText += content
          onChunk(content)
        }
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  return fullText
}