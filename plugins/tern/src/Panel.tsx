/**
 * Tern — 终端助手面板
 *
 * 完整功能：对话界面 + AI 流式调用（OpenAI 兼容 API）
 * 支持自然语言转命令、Git 操作、错误分析。
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入。
 * 样式使用内联 style 对象（不依赖外部 CSS）。
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { chatCompleteStream, AIError, type AIConfig, type ChatMessage } from './ai'

// ============================================================================
// 类型定义
// ============================================================================

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  commands?: string[]   // 检测到的 shell 命令
  timestamp: number
}

interface TernConfig {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
}

// ============================================================================
// 默认值
// ============================================================================

const DEFAULT_CONFIG: TernConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  systemPrompt: `你是一个终端助手，特别擅长 Git 操作。

## 通用规则
1. 用户说人话，你翻译成 shell 命令，用 \`\`\` 代码块包裹
2. 用户粘贴报错，你解释原因并给出修复命令
3. 每次回复同时给出解释和命令
4. 不确定时说明你的假设

## Git 专有规则
1. 涉及破坏性操作（reset --hard、push --force）时，增加 ⚠️ 警告
2. 复杂操作（rebase、cherry-pick）给出分步说明
3. 先解释当前状态，再给出操作命令
4. git 报错分析时，同时给出原因和修复方案`,
}

const DEFAULT_SYSTEM_PROMPT = DEFAULT_CONFIG.systemPrompt

// ============================================================================
// 示例数据（Phase 1 演示用）
// ============================================================================

const DEMO_MESSAGES: Message[] = [
  {
    id: 'demo-1',
    role: 'user',
    content: '找出所有大于 100MB 的日志文件，按大小排序',
    timestamp: Date.now() - 120000,
  },
  {
    id: 'demo-2',
    role: 'assistant',
    content: `\`\`\`bash
find . -type f -name "*.log" -size +100M | sort -rh
\`\`\`

这个命令会：
1. \`find\` 递归查找所有 \`*.log\` 文件，大小超过 100MB
2. \`sort -rh\` 按人类可读的大小反向排序（最大的在前）

如果你只想看前 10 个，可以加上 \`| head -10\``,
    commands: ['find . -type f -name "*.log" -size +100M | sort -rh'],
    timestamp: Date.now() - 115000,
  },
  {
    id: 'demo-3',
    role: 'user',
    content: 'fatal: refusing to merge unrelated histories',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'demo-4',
    role: 'assistant',
    content: `## 错误原因

两个 Git 仓库没有共同的祖先提交，Git 默认拒绝合并无关历史。

## 修复方案

如果你确定要合并，使用 \`--allow-unrelated-histories\` 标志：

\`\`\`bash
git merge --allow-unrelated-histories
\`\`\`

### 注意事项
⚠️ 这可能会产生大量冲突，建议先备份当前分支：

\`\`\`bash
git branch backup-before-merge
\`\`\``,
    commands: ['git merge --allow-unrelated-histories', 'git branch backup-before-merge'],
    timestamp: Date.now() - 55000,
  },
  {
    id: 'demo-5',
    role: 'user',
    content: '把这个 commit abc123 移到 main 分支',
    timestamp: Date.now() - 30000,
  },
  {
    id: 'demo-6',
    role: 'assistant',
    content: `使用 \`git cherry-pick\` 将指定提交应用到 \`main\` 分支：

\`\`\`bash
# 1. 切换到 main 分支
git checkout main

# 2. 拉取最新代码
git pull origin main

# 3. Cherry-pick 指定提交
git cherry-pick abc123
\`\`\`

### 如果遇到冲突
1. 手动解决冲突文件
2. \`git add <冲突文件>\`
3. \`git cherry-pick --continue\`

### 撤销 cherry-pick
\`\`\`bash
git cherry-pick --abort
\`\`\``,
    commands: ['git checkout main', 'git pull origin main', 'git cherry-pick abc123'],
    timestamp: Date.now() - 25000,
  },
]

// ============================================================================
// 配置管理
// ============================================================================

function loadConfig(): TernConfig {
  try {
    const raw = localStorage.getItem('tern-config')
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TernConfig>
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch { /* localStorage 不可用，使用默认 */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config: TernConfig): void {
  try {
    localStorage.setItem('tern-config', JSON.stringify(config))
  } catch { /* localStorage 不可用 */ }
}

// ============================================================================
// 工具函数
// ============================================================================

/** 从文本中提取 \`\`\`bash 或 \`\`\`shell 代码块中的命令 */
function extractCommands(text: string): string[] {
  const cmds: string[] = []
  const regex = /```(?:bash|shell|sh)?\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const lines = match[1].trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
    cmds.push(...lines)
  }
  return cmds
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ============================================================================
// 内联样式
// ============================================================================

const S = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0D0D12',
    color: '#E8E8ED',
    fontSize: 13,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #2A2A35',
    flexShrink: 0,
    minHeight: 44,
  } as React.CSSProperties,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as React.CSSProperties,

  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: 'linear-gradient(135deg, #6C6CFF, #FF6B9D)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
  } as React.CSSProperties,

  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,

  headerSub: {
    fontSize: 10,
    color: '#6B6B80',
    marginTop: 1,
  } as React.CSSProperties,

  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: 'none',
    background: '#1E1E28',
    color: '#8E8E9E',
    fontSize: 15,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.12s',
  } as React.CSSProperties,

  // 对话区
  conversationArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
    minHeight: 0,
  } as React.CSSProperties,

  // 空状态
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px 24px',
    textAlign: 'center',
  } as React.CSSProperties,

  emptyIcon: {
    fontSize: 40,
    marginBottom: 16,
  } as React.CSSProperties,

  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#E8E8ED',
    marginBottom: 8,
  } as React.CSSProperties,

  emptyDesc: {
    fontSize: 12,
    color: '#6B6B80',
    lineHeight: 1.6,
    maxWidth: 280,
  } as React.CSSProperties,

  emptyExamples: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 20,
    width: '100%',
    maxWidth: 300,
  } as React.CSSProperties,

  exampleChip: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #2A2A35',
    background: '#1A1A24',
    color: '#8E8E9E',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.12s',
  } as React.CSSProperties,

  // 对话气泡
  bubbleGroup: {
    padding: '0 14px',
    marginBottom: 4,
  } as React.CSSProperties,

  bubbleUser: {
    padding: '8px 12px',
    borderRadius: '10px 10px 4px 10px',
    background: '#2A2A40',
    color: '#E8E8ED',
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: '90%',
    marginLeft: 'auto',
    marginBottom: 2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  } as React.CSSProperties,

  bubbleAssistant: {
    padding: '8px 12px',
    borderRadius: '10px 10px 10px 4px',
    background: '#1A1A28',
    color: '#D0D0DC',
    fontSize: 13,
    lineHeight: 1.6,
    maxWidth: '100%',
    marginRight: 'auto',
    marginBottom: 2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  } as React.CSSProperties,

  bubbleMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 4px',
    marginBottom: 6,
  } as React.CSSProperties,

  bubbleRole: {
    fontSize: 10,
    color: '#6B6B80',
    fontWeight: 500,
  } as React.CSSProperties,

  bubbleTime: {
    fontSize: 10,
    color: '#4A4A5A',
  } as React.CSSProperties,

  // 命令块
  commandBlock: {
    margin: '6px 0',
    borderRadius: 6,
    border: '1px solid #2A2A40',
    overflow: 'hidden',
  } as React.CSSProperties,

  commandHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    background: '#1E1E2C',
    borderBottom: '1px solid #2A2A40',
    fontSize: 10,
    color: '#6B6B80',
  } as React.CSSProperties,

  commandCode: {
    padding: '8px 10px',
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 12,
    color: '#A8E6CF',
    background: '#12121E',
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre',
  } as React.CSSProperties,

  commandActions: {
    display: 'flex',
    gap: 4,
    borderTop: '1px solid #2A2A40',
    padding: '4px 8px',
    background: '#1E1E2C',
  } as React.CSSProperties,

  cmdBtn: {
    padding: '3px 8px',
    borderRadius: 4,
    border: 'none',
    fontSize: 10,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.12s',
  } as React.CSSProperties,

  // 输入区
  inputArea: {
    borderTop: '1px solid #2A2A35',
    padding: '8px 14px',
    flexShrink: 0,
    background: '#0D0D12',
  } as React.CSSProperties,

  inputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  } as React.CSSProperties,

  inputBox: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #2A2A35',
    background: '#1A1A24',
    color: '#E8E8ED',
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
  } as React.CSSProperties,

  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #6C6CFF, #FF6B9D)',
    color: '#fff',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  sendBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as React.CSSProperties,

  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 14px',
    borderTop: '1px solid #2A2A35',
    background: '#0A0A0F',
    flexShrink: 0,
  } as React.CSSProperties,

  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 10,
    color: '#4A4A5A',
  } as React.CSSProperties,

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#4A4A5A',
  } as React.CSSProperties,

  // 快捷命令
  quickActions: {
    display: 'flex',
    gap: 6,
    padding: '0 14px 8px',
    flexWrap: 'wrap',
    flexShrink: 0,
  } as React.CSSProperties,

  quickChip: {
    padding: '4px 10px',
    borderRadius: 12,
    border: '1px solid #2A2A35',
    background: '#1A1A24',
    color: '#8E8E9E',
    fontSize: 10,
    cursor: 'pointer',
    transition: 'all 0.12s',
  } as React.CSSProperties,

  // 加载状态
  loadingDots: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '8px 12px',
  } as React.CSSProperties,

  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#6C6CFF',
    animation: 'none',
  } as React.CSSProperties,

  // 错误提示
  errorBar: {
    padding: '8px 14px',
    background: '#3D1A1A',
    borderBottom: '1px solid #5A2A2A',
    color: '#FF8A8A',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,

  // 配置弹窗
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  } as React.CSSProperties,

  modal: {
    width: '90%',
    maxWidth: 420,
    maxHeight: '85vh',
    background: '#1A1A24',
    borderRadius: 12,
    border: '1px solid #2A2A40',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,

  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #2A2A35',
  } as React.CSSProperties,

  modalTitle: {
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,

  modalBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as React.CSSProperties,

  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid #2A2A35',
  } as React.CSSProperties,

  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: 11,
    color: '#8E8E9E',
    fontWeight: 500,
  } as React.CSSProperties,

  fieldInput: {
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid #2A2A35',
    background: '#12121E',
    color: '#E8E8ED',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  textareaField: {
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid #2A2A35',
    background: '#12121E',
    color: '#E8E8ED',
    fontSize: 11,
    fontFamily: '"SF Mono", "Fira Code", monospace',
    lineHeight: 1.5,
    resize: 'vertical',
    minHeight: 100,
    outline: 'none',
  } as React.CSSProperties,

  primaryBtn: {
    padding: '7px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'linear-gradient(135deg, #6C6CFF, #FF6B9D)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,

  secondaryBtn: {
    padding: '7px 16px',
    borderRadius: 6,
    border: '1px solid #2A2A35',
    background: '#1E1E28',
    color: '#8E8E9E',
    fontSize: 12,
    cursor: 'pointer',
  } as React.CSSProperties,

  // 代码块样式（Markdown 渲染用）
  codeBlock: {
    display: 'block',
    padding: '8px 10px',
    margin: '6px 0',
    borderRadius: 6,
    background: '#12121E',
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 11.5,
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre',
    color: '#C8E6C9',
    border: '1px solid #2A2A40',
  } as React.CSSProperties,

  inlineCode: {
    padding: '1px 4px',
    borderRadius: 3,
    background: '#1E1E2C',
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 12,
    color: '#A8E6CF',
  } as React.CSSProperties,
}

// ============================================================================
// 主组件
// ============================================================================

export default function TernPanel({ pluginId: _pluginId }: { pluginId: string }) {
  // 对话状态
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // 配置状态
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<TernConfig>(loadConfig)
  const [configForm, setConfigForm] = useState<TernConfig>({ ...config })

  // 其他状态
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showQuickActions, setShowQuickActions] = useState(true)

  const conversationRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [messages])

  // 输入框自动调整高度
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }, [])

  // 发送消息
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setShowQuickActions(false)
    setError(null)

    // 检查是否已配置 API
    if (!config.apiKey.trim()) {
      // Phase 1 兜底：模拟回复
      setIsLoading(true)
      setTimeout(() => {
        const assistantMsg: Message = {
          id: `msg-${Date.now()}-reply`,
          role: 'assistant',
          content: `请先点击右上角 ⚙️ 配置 API Key 和模型，即可使用 AI 能力。\n\n支持 OpenAI、DeepSeek、Groq 等任意兼容 API。`,
          commands: [],
          timestamp: Date.now(),
        }
        setMessages(prev => [...prev, assistantMsg])
        setIsLoading(false)
      }, 500)
      return
    }

    // AI 调用
    const assistantId = `msg-${Date.now()}-reply`
    setIsLoading(true)

    // 构建上下文消息（跳过示例消息，只传真实对话）
    const chatMessages: ChatMessage[] = messages
      .filter(m => !m.id.startsWith('demo-') && m.id !== assistantId)
      .map(m => ({
        role: m.role,
        content: m.content,
      }))
    // 加入当前用户输入
    chatMessages.push({ role: 'user', content: text })

    // 创建空的 assistant 消息，后续流式填充
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      commands: [],
      timestamp: Date.now(),
    }])

    let fullContent = ''

    try {
      await chatCompleteStream(
        config,
        chatMessages,
        (chunk) => {
          fullContent += chunk
          // 实时更新消息内容
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === assistantId)
            if (idx === -1) return prev
            const updated = [...prev]
            updated[idx] = {
              ...updated[idx],
              content: fullContent,
              commands: extractCommands(fullContent),
            }
            return updated
          })
        },
        { timeout: 60000 }
      )
    } catch (e) {
      const errorMsg = e instanceof AIError ? e.message : '请求失败，请检查网络连接'
      setError(errorMsg)
      // 更新消息显示错误
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === assistantId)
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = {
          ...updated[idx],
          content: `❌ ${errorMsg}`,
          commands: [],
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, config, messages])

  // 快捷键：Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 复制文本
  const handleCopy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* 复制失败 */ }
  }, [])

  // 点击示例
  const handleExampleClick = useCallback((text: string) => {
    setInput(text)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // 快捷命令
  const handleQuickAction = useCallback((text: string) => {
    setInput(text)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // 保存配置
  const handleSaveConfig = useCallback(() => {
    setConfig({ ...configForm })
    saveConfig(configForm)
    setShowSettings(false)
  }, [configForm])

  // 重置配置
  const handleResetConfig = useCallback(() => {
    setConfigForm({ ...DEFAULT_CONFIG })
  }, [])

  // 清空对话
  const handleClear = useCallback(() => {
    if (messages.length === 0 || !confirm('确认清空所有对话？')) return
    setMessages([])
    setShowQuickActions(true)
    setError(null)
  }, [messages])

  // 点击发送到终端（Phase 1 占位）
  const handleSendToTerminal = useCallback((cmd: string) => {
    // Phase 3 实现：写入 Polaris 内置终端
    alert(`发送到终端: ${cmd}\n（Phase 3 实现）`)
  }, [])

  const hasConfig = config.apiKey.trim().length > 0
  const isEmpty = messages.length === 0

  // ============================================================================
  // 渲染
  // ============================================================================

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.headerIcon}>⌘</div>
          <div>
            <div style={S.headerTitle}>Tern</div>
            <div style={S.headerSub}>终端助手{hasConfig ? ` · ${config.model}` : ' · 未配置'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleClear}
            title="清空对话"
            style={{ ...S.iconBtn, fontSize: 12, opacity: isEmpty ? 0.3 : 1 }}
            disabled={isEmpty}
          >
            🗑
          </button>
          <button
            onClick={() => { setConfigForm({ ...config }); setShowSettings(true) }}
            title="设置"
            style={S.iconBtn}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={S.errorBar}>
          <span>⚠</span>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#FF8A8A', cursor: 'pointer', fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 快捷命令（仅空状态时显示） */}
      {showQuickActions && isEmpty && (
        <div style={S.quickActions}>
          <button style={S.quickChip} onClick={() => handleQuickAction('查看 Git 分支情况')}>⎇ Git 分支</button>
          <button style={S.quickChip} onClick={() => handleQuickAction('找出所有大文件')}>📁 大文件</button>
          <button style={S.quickChip} onClick={() => handleQuickAction('查看端口占用')}>🔌 端口</button>
          <button style={S.quickChip} onClick={() => handleQuickAction('解释这个报错: ')}>❌ 分析报错</button>
          <button style={S.quickChip} onClick={() => handleQuickAction('如何撤销上次 commit')}>↩ 撤销 commit</button>
        </div>
      )}

      {/* 对话区 */}
      <div ref={conversationRef} style={S.conversationArea}>
        {isEmpty ? (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}>⌨</div>
            <div style={S.emptyTitle}>终端助手</div>
            <div style={S.emptyDesc}>
              说人话，Tern 帮你翻译成终端命令。<br />
              支持 Git 操作、错误分析、命令查询。
            </div>
            <div style={S.emptyExamples}>
              <button style={S.exampleChip} onClick={() => handleExampleClick('把 commit abc123 移到 main 分支')}>
                「把 commit abc123 移到 main 分支」
              </button>
              <button style={S.exampleChip} onClick={() => handleExampleClick('fatal: refusing to merge unrelated histories')}>
                「fatal: refusing to merge unrelated histories」
              </button>
              <button style={S.exampleChip} onClick={() => handleExampleClick('找出所有大于 100MB 的日志文件')}>
                「找出所有大于 100MB 的日志文件」
              </button>
            </div>
            {!hasConfig && (
              <div style={{ marginTop: 20, padding: '8px 14px', borderRadius: 8, background: '#2A2A4022', border: '1px solid #2A2A40', fontSize: 11, color: '#8E8E9E' }}>
                点击右上角 ⚙️ 配置 API Key 启用 AI 能力
              </div>
            )}
          </div>
        ) : (
          <div style={{ paddingBottom: 8 }}>
            {messages.map((msg) => (
              <div key={msg.id} style={S.bubbleGroup}>
                {/* 角色标签 */}
                <div style={S.bubbleMeta}>
                  <span style={S.bubbleRole}>
                    {msg.role === 'user' ? '💬 你' : '🤖 Tern'}
                  </span>
                  <span style={S.bubbleTime}>{formatTime(msg.timestamp)}</span>
                </div>

                {/* 内容 */}
                <div style={msg.role === 'user' ? S.bubbleUser : S.bubbleAssistant}>
                  <MarkdownContent text={msg.content} />
                </div>

                {/* 命令块 */}
                {msg.commands && msg.commands.length > 0 && msg.role === 'assistant' && (
                  <div style={{ paddingLeft: 4, paddingRight: 4 }}>
                    {msg.commands.map((cmd, i) => {
                      const cmdId = `${msg.id}-cmd-${i}`
                      const copied = copiedId === cmdId
                      return (
                        <div key={cmdId} style={S.commandBlock}>
                          <div style={S.commandHeader}>
                            <span>$ 命令</span>
                            <span style={{ fontSize: 9, color: '#4A4A5A' }}>{cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd}</span>
                          </div>
                          <div style={S.commandCode}>{cmd}</div>
                          <div style={S.commandActions}>
                            <button
                              style={{ ...S.cmdBtn, background: copied ? '#10B98122' : '#2A2A40', color: copied ? '#10B981' : '#8E8E9E' }}
                              onClick={() => handleCopy(cmd, cmdId)}
                            >
                              {copied ? '✓ 已复制' : '📋 复制'}
                            </button>
                            <button
                              style={{ ...S.cmdBtn, background: '#6C6CFF22', color: '#8E8EFF' }}
                              onClick={() => handleSendToTerminal(cmd)}
                            >
                              ▶ 发送到终端
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* 加载状态 */}
            {isLoading && (
              <div style={S.bubbleGroup}>
                <div style={S.bubbleMeta}>
                  <span style={S.bubbleRole}>🤖 Tern</span>
                  <span style={S.bubbleTime}>思考中...</span>
                </div>
                <div style={S.bubbleAssistant}>
                  <div style={S.loadingDots}>
                    <div style={{ ...S.dot, animation: 'tern-bounce 1.2s infinite' }} />
                    <div style={{ ...S.dot, animation: 'tern-bounce 1.2s infinite 0.2s' }} />
                    <div style={{ ...S.dot, animation: 'tern-bounce 1.2s infinite 0.4s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div style={S.inputArea}>
        {!hasConfig && messages.length > 0 && (
          <div style={{ fontSize: 10, color: '#6B6B80', marginBottom: 6, textAlign: 'center' }}>
            未配置 API，回复为预设演示数据。点击 ⚙️ 配置
          </div>
        )}
        <div style={S.inputRow}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入自然语言或粘贴报错..."
            rows={1}
            style={S.inputBox}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{ ...S.sendBtn, ...(!input.trim() || isLoading ? S.sendBtnDisabled : {}) }}
          >
            {isLoading ? '⋯' : '→'}
          </button>
        </div>
      </div>

      {/* 状态栏 */}
      <div style={S.statusBar}>
        <div style={S.statusLeft}>
          <div style={{ ...S.statusDot, background: hasConfig ? '#10B981' : '#4A4A5A' }} />
          <span>{hasConfig ? `已连接 ${config.model}` : '未配置 API'}</span>
        </div>
        <div style={{ fontSize: 10, color: '#4A4A5A' }}>
          {messages.length} 条消息
        </div>
      </div>

      {/* 配置弹窗 */}
      {showSettings && (
        <div style={S.overlay} onClick={() => setShowSettings(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>⚙️ Tern 设置</span>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', color: '#8E8E9E', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={S.modalBody}>
              <div style={S.fieldGroup}>
                <label style={S.fieldLabel}>API Base URL</label>
                <input
                  value={configForm.baseUrl}
                  onChange={e => setConfigForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  style={S.fieldInput}
                />
                <div style={{ fontSize: 9, color: '#4A4A5A' }}>支持 OpenAI 兼容 API（OpenAI、DeepSeek、Groq 等）</div>
              </div>

              <div style={S.fieldGroup}>
                <label style={S.fieldLabel}>API Key</label>
                <input
                  value={configForm.apiKey}
                  onChange={e => setConfigForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  type="password"
                  style={S.fieldInput}
                />
              </div>

              <div style={S.fieldGroup}>
                <label style={S.fieldLabel}>Model</label>
                <input
                  value={configForm.model}
                  onChange={e => setConfigForm(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="gpt-4o"
                  style={S.fieldInput}
                />
              </div>

              <div style={S.fieldGroup}>
                <label style={S.fieldLabel}>系统提示词</label>
                <textarea
                  value={configForm.systemPrompt}
                  onChange={e => setConfigForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  style={S.textareaField}
                  rows={8}
                />
                <button
                  onClick={handleResetConfig}
                  style={{ ...S.cmdBtn, alignSelf: 'flex-start', marginTop: 4, background: '#2A2A40', color: '#8E8E9E' }}
                >
                  恢复默认提示词
                </button>
              </div>
            </div>

            <div style={S.modalFooter}>
              <button onClick={() => setShowSettings(false)} style={S.secondaryBtn}>取消</button>
              <button onClick={handleSaveConfig} style={S.primaryBtn}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 简易 Markdown 内容渲染
// ============================================================================

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeContent = ''
  let codeLang = ''
  let paragraphLines: string[] = []

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      const content = paragraphLines.join('\n')
      elements.push(
        <div key={`p-${elements.length}`} style={{ marginBottom: 4, lineHeight: 1.6 }}>
          <InlineText text={content} />
        </div>
      )
      paragraphLines = []
    }
  }

  for (const line of lines) {
    if (line.startsWith('```') && !inCodeBlock) {
      flushParagraph()
      inCodeBlock = true
      codeLang = line.slice(3).trim()
      codeContent = ''
      continue
    }

    if (line.startsWith('```') && inCodeBlock) {
      inCodeBlock = false
      elements.push(
        <pre key={`code-${elements.length}`} style={S.codeBlock}>
          {codeContent}
        </pre>
      )
      codeContent = ''
      continue
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line
      continue
    }

    // 标题
    if (line.startsWith('## ')) {
      flushParagraph()
      elements.push(
        <div key={`h2-${elements.length}`} style={{ fontWeight: 600, fontSize: 14, marginTop: 10, marginBottom: 4, color: '#E8E8ED' }}>
          {line.slice(3)}
        </div>
      )
      continue
    }

    // 分隔线
    if (line.startsWith('---')) {
      flushParagraph()
      elements.push(
        <div key={`hr-${elements.length}`} style={{ borderTop: '1px solid #2A2A35', margin: '8px 0' }} />
      )
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  // 如果代码块未闭合，仍渲染
  if (inCodeBlock) {
    elements.push(
      <pre key={`code-${elements.length}`} style={S.codeBlock}>
        {codeContent}
      </pre>
    )
  }

  return <>{elements}</>
}

/** 内联文本渲染（支持行内代码） */
function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} style={S.inlineCode}>{part.slice(1, -1)}</code>
        }
        if (part.startsWith('- ')) {
          return <span key={i} style={{ display: 'block', paddingLeft: 12, color: '#B0B0BC' }}>• {part.slice(2)}</span>
        }
        if (part.startsWith('⚠️')) {
          return <span key={i} style={{ display: 'block', color: '#FFA726', margin: '2px 0' }}>{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}