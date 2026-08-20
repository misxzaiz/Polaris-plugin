/**
 * Emotion Ball 测试面板
 *
 * 功能：
 * 1. 情绪球实时展示
 * 2. 手动切换情绪（测试各种状态）
 * 3. AI 对话集成（OpenAI 兼容协议）—— 自动解析情绪
 * 4. 配置管理
 */

import React from 'react'
import { EmotionBall, type EmotionState } from './EmotionBall'
import { useAiChatStore, sendChatMessage, parseEmotionFromText, stripEmotionTag } from './aiChatStore'
import { ensureStyles } from './styles'

// 注入一次 CSS
ensureStyles()

// ── 情绪选项 ──────────────────────────────────────────────────────────────

const EMOTION_OPTIONS: EmotionState[] = [
  'idle', 'thinking', 'streaming', 'happy', 'sad', 'excited', 'error', 'listening',
]

const EMOTION_LABELS: Record<EmotionState, string> = {
  idle: 'Idle 空闲',
  thinking: 'Thinking 思考',
  streaming: 'Streaming 输出',
  happy: 'Happy 开心',
  sad: 'Sad 忧伤',
  excited: 'Excited 兴奋',
  error: 'Error 错误',
  listening: 'Listening 聆听',
}

// ── 面板主组件 ────────────────────────────────────────────────────────────

export default function EmotionBallPanel() {
  const {
    aiConfig, setAiConfig,
    messages, addMessage, clearMessages,
    aiStatus, aiError, setAiStatus, setAiError,
    emotion, setEmotion,
    streamText, setStreamText, appendStreamText,
    autoEmotion, setAutoEmotion,
    showHistory, setShowHistory,
  } = useAiChatStore()

  const [input, setInput] = React.useState('')
  const [tab, setTab] = useState<'preview' | 'chat' | 'config'>('preview')
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionState>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const streamTextRef = React.useRef('')

  // 自动滚动对话到底部
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // 手动切换情绪
  const handleManualEmotion = React.useCallback((e: EmotionState) => {
    setSelectedEmotion(e)
    setEmotion(e)
  }, [setEmotion, setSelectedEmotion])

  // 发送 AI 消息
  const handleSend = React.useCallback(async () => {
    const text = input.trim()
    if (!text || aiStatus === 'connecting' || aiStatus === 'streaming') return

    // 检查配置
    if (!aiConfig.apiKey) {
      setAiError('请先配置 API Key')
      setTab('config')
      return
    }

    setInput('')
    setStreamText('')
    streamTextRef.current = ''

    const userMsg = { role: 'user' as const, content: text }
    addMessage(userMsg)

    setAiStatus('connecting')
    setAiError(null)
    if (autoEmotion) setEmotion('thinking')

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const fullText = await sendChatMessage(
        aiConfig,
        [...messages, userMsg],
        (chunk) => {
          // 首次收到 chunk 时切换状态
          if (streamTextRef.current === '') {
            setAiStatus('streaming')
            if (autoEmotion) setEmotion('streaming')
          }
          streamTextRef.current += chunk
          appendStreamText(chunk)
        },
        abortController.signal,
      )

      // 完成
      const cleanText = stripEmotionTag(fullText)
      const detectedEmotion = autoEmotion ? (parseEmotionFromText(fullText) || 'happy') : emotion

      addMessage({ role: 'assistant', content: cleanText || '(empty response)' })
      setAiStatus('idle')
      if (autoEmotion) setEmotion(detectedEmotion)
      setStreamText('')
      streamTextRef.current = ''
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setAiStatus('idle')
        if (autoEmotion) setEmotion('idle')
        return
      }
      setAiError(err.message || 'Unknown error')
      setAiStatus('error')
      if (autoEmotion) setEmotion('error')
    }
  }, [input, aiStatus, aiConfig, messages, addMessage, setStreamText, appendStreamText, setAiStatus, setAiError, autoEmotion, emotion, setEmotion])

  // 中断
  const handleStop = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setAiStatus('idle')
    if (autoEmotion) setEmotion('idle')
  }, [setAiStatus, setEmotion, autoEmotion])

  // 键盘快捷键
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── 渲染 ──

  return React.createElement('div', { className: 'eb-panel' },
    // ===== Header =====
    React.createElement('div', { className: 'eb-header' },
      React.createElement('span', { className: 'eb-title' }, 'Emotion Ball'),
      React.createElement('span', {
        className: `eb-badge ${aiStatus === 'error' ? 'eb-badge-error' : aiStatus === 'streaming' || aiStatus === 'connecting' ? 'eb-badge-active' : ''}`,
      }, aiStatus === 'idle' ? 'Idle' : aiStatus === 'connecting' ? '连接中...' : aiStatus === 'streaming' ? '输出中' : 'Error'),
    ),

    // ===== Emotion Ball 展示区 =====
    React.createElement('div', { className: 'eb-ball-area' },
      React.createElement('div', { className: 'eb-ball-container' },
        React.createElement(EmotionBall, { emotion, size: 80, compact: false }),
      ),
      React.createElement('div', { className: 'eb-ball-label' }, EMOTION_LABELS[emotion]),
    ),

    // ===== Tabs =====
    React.createElement('div', { className: 'eb-tabs' },
      React.createElement(TabBtn, { active: tab === 'preview', onClick: () => setTab('preview') }, '预览'),
      React.createElement(TabBtn, { active: tab === 'chat', onClick: () => setTab('chat') }, 'AI 对话'),
      React.createElement(TabBtn, { active: tab === 'config', onClick: () => setTab('config') }, '配置'),
    ),

    // ===== Tab 内容 =====
    React.createElement('div', { className: 'eb-tab-content' },
      // ── 预览 Tab ──
      tab === 'preview' && React.createElement('div', { className: 'eb-preview-grid' },
        EMOTION_OPTIONS.map((e) =>
          React.createElement('button', {
            key: e,
            className: `eb-preview-btn ${emotion === e ? 'eb-preview-btn-active' : ''}`,
            onClick: () => handleManualEmotion(e),
          },
            React.createElement(EmotionBall, { emotion: e, size: 32, compact: true }),
            React.createElement('span', { className: 'eb-preview-label' }, EMOTION_LABELS[e]),
          ),
        ),
      ),

      // ── AI 对话 Tab ──
      tab === 'chat' && React.createElement('div', { className: 'eb-chat-area' },
        // 对话消息列表
        React.createElement('div', { className: 'eb-chat-messages' },
          messages.slice(1).map((msg, i) =>
            React.createElement('div', {
              key: i,
              className: `eb-chat-msg ${msg.role === 'user' ? 'eb-chat-msg-user' : 'eb-chat-msg-assistant'}`,
            },
              React.createElement('div', { className: 'eb-chat-role' }, msg.role === 'user' ? 'You' : 'AI'),
              React.createElement('div', { className: 'eb-chat-content' }, msg.content),
            ),
          ),
          // 流式输出中
          streamText && React.createElement('div', { className: 'eb-chat-msg eb-chat-msg-assistant eb-chat-msg-streaming' },
            React.createElement('div', { className: 'eb-chat-role' }, 'AI'),
            React.createElement('div', { className: 'eb-chat-content' }, streamText),
          ),
          // 空状态
          messages.length <= 1 && !streamText && React.createElement('div', { className: 'eb-chat-empty' },
            '发送一条消息，AI 回复时会自动切换情绪球',
          ),
          React.createElement('div', { ref: chatEndRef }),
        ),

        // 错误提示
        aiError && React.createElement('div', { className: 'eb-chat-error' }, aiError),

        // 输入区
        React.createElement('div', { className: 'eb-chat-input-row' },
          React.createElement('textarea', {
            className: 'eb-chat-input',
            value: input,
            onChange: (e: any) => setInput(e.target.value),
            onKeyDown: handleKeyDown,
            placeholder: '输入消息...',
            rows: 2,
            disabled: aiStatus === 'connecting' || aiStatus === 'streaming',
          }),
          React.createElement('div', { className: 'eb-chat-actions' },
            (aiStatus === 'connecting' || aiStatus === 'streaming')
              ? React.createElement('button', { className: 'eb-btn eb-btn-stop', onClick: handleStop }, '停止')
              : React.createElement('button', {
                  className: 'eb-btn eb-btn-send',
                  onClick: handleSend,
                  disabled: !input.trim(),
                }, '发送'),
          ),
        ),

        // 自动情绪开关
        React.createElement('div', { className: 'eb-chat-footer' },
          React.createElement('label', { className: 'eb-checkbox' },
            React.createElement('input', {
              type: 'checkbox',
              checked: autoEmotion,
              onChange: (e: any) => setAutoEmotion(e.target.checked),
            }),
            React.createElement('span', null, '自动情绪（AI 回复中解析 [emotion:xxx] 标记）'),
          ),
          React.createElement('button', {
            className: 'eb-btn-ghost',
            onClick: () => setShowHistory(!showHistory),
          }, showHistory ? '隐藏历史' : '显示历史'),
        ),

        // 对话历史
        showHistory && React.createElement('div', { className: 'eb-chat-history' },
          React.createElement('div', { className: 'eb-chat-history-title' }, '对话历史'),
          messages.map((msg, i) =>
            React.createElement('div', { key: i, className: `eb-history-item ${msg.role === 'system' ? 'eb-history-system' : ''}` },
              React.createElement('span', { className: 'eb-history-role' }, `[${msg.role}]`),
              React.createElement('span', { className: 'eb-history-text' }, msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '')),
            ),
          ),
          React.createElement('button', {
            className: 'eb-btn-ghost',
            onClick: () => { clearMessages(); setShowHistory(false) },
            style: { color: 'var(--eb-error, #ef4444)', marginTop: 8 },
          }, '清空对话'),
        ),
      ),

      // ── 配置 Tab ──
      tab === 'config' && React.createElement('div', { className: 'eb-config' },
        React.createElement('div', { className: 'eb-config-field' },
          React.createElement('label', { className: 'eb-config-label' }, 'API 端点'),
          React.createElement('input', {
            className: 'eb-config-input',
            value: aiConfig.baseUrl,
            onChange: (e: any) => setAiConfig({ baseUrl: e.target.value }),
            placeholder: 'https://api.openai.com/v1',
          }),
        ),
        React.createElement('div', { className: 'eb-config-field' },
          React.createElement('label', { className: 'eb-config-label' }, 'API Key'),
          React.createElement('input', {
            className: 'eb-config-input',
            type: 'password',
            value: aiConfig.apiKey,
            onChange: (e: any) => setAiConfig({ apiKey: e.target.value }),
            placeholder: 'sk-...',
          }),
        ),
        React.createElement('div', { className: 'eb-config-field' },
          React.createElement('label', { className: 'eb-config-label' }, '模型'),
          React.createElement('input', {
            className: 'eb-config-input',
            value: aiConfig.model,
            onChange: (e: any) => setAiConfig({ model: e.target.value }),
            placeholder: 'gpt-4o-mini',
          }),
        ),
        React.createElement('div', { className: 'eb-config-hint' },
          '支持任何 OpenAI 兼容 API（DeepSeek / Groq / 本地 ollama / 中转站等）',
        ),
        // 快速选择
        React.createElement('div', { className: 'eb-config-presets' },
          React.createElement('div', { className: 'eb-config-preset-title' }, '快速选择'),
          React.createElement('div', { className: 'eb-config-preset-grid' },
            React.createElement(PresetBtn, {
              label: 'OpenAI',
              config: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
              current: aiConfig,
              onSelect: setAiConfig,
            }),
            React.createElement(PresetBtn, {
              label: 'DeepSeek',
              config: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
              current: aiConfig,
              onSelect: setAiConfig,
            }),
            React.createElement(PresetBtn, {
              label: 'Groq',
              config: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
              current: aiConfig,
              onSelect: setAiConfig,
            }),
            React.createElement(PresetBtn, {
              label: 'Ollama',
              config: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
              current: aiConfig,
              onSelect: setAiConfig,
            }),
          ),
        ),
        React.createElement('div', { className: 'eb-config-status' },
          React.createElement('span', null, '状态: '),
          React.createElement('span', {
            className: aiStatus === 'error' ? 'eb-status-error' : aiStatus === 'streaming' ? 'eb-status-ok' : '',
          }, aiStatus === 'idle' ? '未连接' : aiStatus === 'connecting' ? '连接中...' : aiStatus === 'streaming' ? '已连接' : aiError || '错误'),
        ),
      ),
    ),
  )
}

// ── 子组件 ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return React.createElement('button', {
    className: `eb-tab-btn ${active ? 'eb-tab-btn-active' : ''}`,
    onClick,
  }, children)
}

function PresetBtn({
  label,
  config,
  current,
  onSelect,
}: {
  label: string
  config: { baseUrl: string; model: string }
  current: { baseUrl: string; model: string }
  onSelect: (patch: { baseUrl: string; model: string }) => void
}) {
  const isActive = current.baseUrl === config.baseUrl && current.model === config.model
  return React.createElement('button', {
    className: `eb-preset-btn ${isActive ? 'eb-preset-btn-active' : ''}`,
    onClick: () => onSelect(config),
  }, label)
}