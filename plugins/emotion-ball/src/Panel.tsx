/**
 * EmotionBall v2 — 测试面板
 *
 * 三 tab：
 * 1. 画廊：32 状态网格预览，hover 激活，点击切换主球
 * 2. AI 对话：OpenAI 协议，AI 输出 emotionId 自动切球
 * 3. 配置：API 端点/Key/模型 + 主题色
 *
 * 生产级：错误处理、主题适配、性能（画廊静态帧）。
 */

import React from 'react'
import { EmotionBallView } from './BallView'
import {
  useChatStore, sendChatMessage, parseEmotionFromText, stripEmotionTag, groupedEmotions,
} from './aiChatStore'
import { EMOTION_SEED } from './emotions'
import { ensurePanelStyles } from './styles'

ensurePanelStyles()

const GROUP_COLORS: Record<string, string> = {
  life: '#5b95f0',
  emotion: '#f5b13f',
  agent: '#3fbe86',
  custom: '#9a72ee',
}

export default function EmotionBallPanel() {
  const s = useChatStore()
  const [tab, setTab] = React.useState<'gallery' | 'chat' | 'config'>('gallery')
  const [mainEmotion, setMainEmotion] = React.useState('02')
  const [shape, setShape] = React.useState<'blob' | 'wedge' | 'gem'>('blob')
  const [previewHover, setPreviewHover] = React.useState<string | null>(null)

  return React.createElement('div', { className: 'ebv2-panel' },
    // Header
    React.createElement('div', { className: 'ebv2-header' },
      React.createElement('span', { className: 'ebv2-title' }, 'Emotion Ball v2'),
      React.createElement('div', { className: 'ebv2-header-right' },
        React.createElement('span', {
          className: 'ebv2-status-dot ' + (
            s.aiStatus === 'error' ? 'dot-error' :
            s.aiStatus === 'streaming' || s.aiStatus === 'connecting' ? 'dot-active' : 'dot-idle'
          ),
        }),
        React.createElement('span', { className: 'ebv2-status-text' },
          s.aiStatus === 'idle' ? '空闲' : s.aiStatus === 'connecting' ? '连接中' : s.aiStatus === 'streaming' ? '输出中' : '错误'
        ),
      ),
    ),

    // 主球展示区
    React.createElement('div', { className: 'ebv2-stage' },
      React.createElement(EmotionBallView, {
        emotion: s.aiStatus === 'streaming' || s.aiStatus === 'connecting' ? s.emotion : mainEmotion,
        shape,
        size: 180,
        gaze: true,
        onEmotionChange: (id: string) => setMainEmotion(id),
      }),
      React.createElement('div', { className: 'ebv2-stage-info' },
        React.createElement('div', { className: 'ebv2-stage-name' },
          (EMOTION_SEED.find((e) => e.id === (s.aiStatus === 'streaming' || s.aiStatus === 'connecting' ? s.emotion : mainEmotion)) || EMOTION_SEED[0]).name
        ),
        React.createElement('div', { className: 'ebv2-stage-desc' },
          (EMOTION_SEED.find((e) => e.id === (s.aiStatus === 'streaming' || s.aiStatus === 'connecting' ? s.emotion : mainEmotion)) || EMOTION_SEED[0]).desc
        ),
      ),
      // 形态切换
      React.createElement('div', { className: 'ebv2-shape-switch' },
        ['blob', 'wedge', 'gem'].map((sh) =>
          React.createElement('button', {
            key: sh,
            className: 'ebv2-shape-btn ' + (shape === sh ? 'active' : ''),
            onClick: () => setShape(sh as any),
          }, sh === 'blob' ? '圆胖' : sh === 'wedge' ? '三角' : '菱形')
        ),
      ),
    ),

    // Tabs
    React.createElement('div', { className: 'ebv2-tabs' },
      React.createElement(TabBtn, { active: tab === 'gallery', onClick: () => setTab('gallery') }, '画廊'),
      React.createElement(TabBtn, { active: tab === 'chat', onClick: () => setTab('chat') }, 'AI 对话'),
      React.createElement(TabBtn, { active: tab === 'config', onClick: () => setTab('config') }, '配置'),
    ),

    // Tab 内容
    React.createElement('div', { className: 'ebv2-tab-content' },
      tab === 'gallery' && React.createElement(GalleryTab, {
        onPick: (id) => { setMainEmotion(id); setTab('gallery') },
        hover: previewHover,
        setHover: setPreviewHover,
      }),
      tab === 'chat' && React.createElement(ChatTab, { onEmotion: setMainEmotion }),
      tab === 'config' && React.createElement(ConfigTab),
    ),
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return React.createElement('button', {
    className: 'ebv2-tab-btn ' + (active ? 'active' : ''),
    onClick,
  }, children)
}

// ============ 画廊 Tab ============

function GalleryTab({ onPick, hover, setHover }: {
  onPick: (id: string) => void
  hover: string | null
  setHover: (id: string | null) => void
}) {
  const groups = groupedEmotions()
  return React.createElement('div', { className: 'ebv2-gallery' },
    groups.map((g) =>
      React.createElement('div', { key: g.group, className: 'ebv2-gallery-group' },
        React.createElement('div', { className: 'ebv2-gallery-group-title' },
          React.createElement('span', {
            className: 'ebv2-group-dot',
            style: { background: GROUP_COLORS[g.group] || '#888' },
          }),
          g.label,
        ),
        React.createElement('div', { className: 'ebv2-gallery-grid' },
          g.items.map((e) =>
            React.createElement('div', {
              key: e.id,
              className: 'ebv2-gallery-card ' + (hover === e.id ? 'hover' : ''),
              onMouseEnter: () => setHover(e.id),
              onMouseLeave: () => setHover(null),
              onClick: () => onPick(e.id),
            },
              React.createElement(EmotionBallView, {
                emotion: e.id,
                size: 64,
                gaze: false,
                lite: true,
              }),
              React.createElement('div', { className: 'ebv2-card-id' }, e.id),
              React.createElement('div', { className: 'ebv2-card-name' }, e.name),
            ),
          ),
        ),
      ),
    ),
  )
}

// ============ AI 对话 Tab ============

function ChatTab({ onEmotion }: { onEmotion: (id: string) => void }) {
  const s = useChatStore()
  const [input, setInput] = React.useState('')
  const abortRef = React.useRef<AbortController | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const streamRef = React.useRef('')

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [s.messages, s.streamText])

  const handleSend = React.useCallback(async () => {
    const text = input.trim()
    if (!text || s.aiStatus === 'connecting' || s.aiStatus === 'streaming') return
    if (!s.aiConfig.apiKey) {
      s.setAiError('请先在配置页填入 API Key')
      return
    }
    setInput('')
    s.setStreamText('')
    streamRef.current = ''
    s.setAiError(null)
    s.addMessage({ role: 'user', content: text })
    s.setAiStatus('connecting')
    if (s.autoEmotion) s.setEmotion('30') // 思考

    const ac = new AbortController()
    abortRef.current = ac
    try {
      const full = await sendChatMessage(
        s.aiConfig,
        [...s.messages, { role: 'user', content: text }],
        (chunk) => {
          if (streamRef.current === '') {
            s.setAiStatus('streaming')
            if (s.autoEmotion) s.setEmotion('33') // 生成
          }
          streamRef.current += chunk
          s.appendStreamText(chunk)
          // 实时检测情绪
          if (s.autoEmotion) {
            const eid = parseEmotionFromText(streamRef.current)
            if (eid) { s.setEmotion(eid); onEmotion(eid) }
          }
        },
        ac.signal,
      )
      const clean = stripEmotionTag(full)
      const eid = s.autoEmotion ? (parseEmotionFromText(full) || '02') : '02'
      s.addMessage({ role: 'assistant', content: clean || '(空响应)' })
      s.setAiStatus('idle')
      if (s.autoEmotion) { s.setEmotion(eid); onEmotion(eid) }
      s.setStreamText('')
      streamRef.current = ''
    } catch (err: any) {
      if (err.name === 'AbortError') { s.setAiStatus('idle'); s.setEmotion('02'); return }
      s.setAiError(err.message || String(err))
      s.setAiStatus('error')
      if (s.autoEmotion) s.setEmotion('35') // 出错
    }
  }, [input, s, onEmotion])

  const handleStop = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    s.setAiStatus('idle')
    s.setEmotion('02')
  }, [s])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return React.createElement('div', { className: 'ebv2-chat' },
    React.createElement('div', { ref: scrollRef, className: 'ebv2-chat-msgs' },
      s.messages.slice(1).map((m, i) =>
        React.createElement('div', {
          key: i,
          className: 'ebv2-chat-msg ' + (m.role === 'user' ? 'user' : 'assistant'),
        },
          React.createElement('div', { className: 'ebv2-chat-role' }, m.role === 'user' ? '我' : 'AI'),
          React.createElement('div', { className: 'ebv2-chat-content' }, m.content),
        ),
      ),
      s.streamText && React.createElement('div', { className: 'ebv2-chat-msg assistant streaming' },
        React.createElement('div', { className: 'ebv2-chat-role' }, 'AI'),
        React.createElement('div', { className: 'ebv2-chat-content' }, s.streamText),
      ),
      s.messages.length <= 1 && !s.streamText && React.createElement('div', { className: 'ebv2-chat-empty' },
        '发送消息测试 AI 情绪球。AI 回复时会自动切换情绪。'
      ),
    ),

    s.aiError && React.createElement('div', { className: 'ebv2-chat-error' }, s.aiError),

    React.createElement('div', { className: 'ebv2-chat-input-row' },
      React.createElement('textarea', {
        className: 'ebv2-chat-input',
        value: input,
        onChange: (e: any) => setInput(e.target.value),
        onKeyDown: handleKeyDown,
        placeholder: '输入消息（Enter 发送，Shift+Enter 换行）',
        rows: 2,
        disabled: s.aiStatus === 'connecting' || s.aiStatus === 'streaming',
      }),
      React.createElement('div', { className: 'ebv2-chat-actions' },
        (s.aiStatus === 'connecting' || s.aiStatus === 'streaming')
          ? React.createElement('button', { className: 'ebv2-btn stop', onClick: handleStop }, '停止')
          : React.createElement('button', {
              className: 'ebv2-btn send',
              onClick: handleSend,
              disabled: !input.trim(),
            }, '发送'),
      ),
    ),

    React.createElement('div', { className: 'ebv2-chat-footer' },
      React.createElement('label', { className: 'ebv2-checkbox' },
        React.createElement('input', {
          type: 'checkbox',
          checked: s.autoEmotion,
          onChange: (e: any) => s.setAutoEmotion(e.target.checked),
        }),
        React.createElement('span', null, '自动情绪（解析 [emotion:ID]）'),
      ),
      React.createElement('button', {
        className: 'ebv2-btn-ghost',
        onClick: () => s.clearMessages(),
      }, '清空'),
    ),
  )
}

// ============ 配置 Tab ============

function ConfigTab() {
  const s = useChatStore()
  return React.createElement('div', { className: 'ebv2-config' },
    React.createElement('div', { className: 'ebv2-config-field' },
      React.createElement('label', { className: 'ebv2-config-label' }, 'API 端点'),
      React.createElement('input', {
        className: 'ebv2-config-input',
        value: s.aiConfig.baseUrl,
        onChange: (e: any) => s.setAiConfig({ baseUrl: e.target.value }),
        placeholder: 'https://api.openai.com/v1',
      }),
    ),
    React.createElement('div', { className: 'ebv2-config-field' },
      React.createElement('label', { className: 'ebv2-config-label' }, 'API Key'),
      React.createElement('input', {
        className: 'ebv2-config-input',
        type: 'password',
        value: s.aiConfig.apiKey,
        onChange: (e: any) => s.setAiConfig({ apiKey: e.target.value }),
        placeholder: 'sk-...',
      }),
    ),
    React.createElement('div', { className: 'ebv2-config-field' },
      React.createElement('label', { className: 'ebv2-config-label' }, '模型'),
      React.createElement('input', {
        className: 'ebv2-config-input',
        value: s.aiConfig.model,
        onChange: (e: any) => s.setAiConfig({ model: e.target.value }),
        placeholder: 'gpt-4o-mini',
      }),
    ),
    React.createElement('div', { className: 'ebv2-config-hint' },
      '支持任何 OpenAI 兼容 API（DeepSeek / Groq / Ollama / 中转站等）。AI 需在回复末尾输出 [emotion:ID] 标记。'
    ),
    React.createElement('div', { className: 'ebv2-config-presets' },
      React.createElement('div', { className: 'ebv2-config-preset-title' }, '快速选择'),
      React.createElement('div', { className: 'ebv2-config-preset-grid' },
        presetBtn('OpenAI', { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }, s),
        presetBtn('DeepSeek', { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, s),
        presetBtn('Groq', { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }, s),
        presetBtn('Ollama', { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' }, s),
      ),
    ),
  )
}

function presetBtn(label: string, cfg: { baseUrl: string; model: string }, s: any) {
  const active = s.aiConfig.baseUrl === cfg.baseUrl && s.aiConfig.model === cfg.model
  return React.createElement('button', {
    key: label,
    className: 'ebv2-preset-btn ' + (active ? 'active' : ''),
    onClick: () => s.setAiConfig(cfg),
  }, label)
}
