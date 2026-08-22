// components/AIChat.jsx — AI 对话面板
// 侧边栏内嵌的 AI 助手，支持上下文感知和工具调用

import { useState, useEffect, useRef, useCallback } from 'react'
import { store, uid } from '../core/store.js'
import { chat, renderMarkdown, registerTools } from '../ai/client.js'
import { buildSystemPrompt, getToolDefinitions, initTools } from '../ai/tools.js'

// 注册 AI 工具
initTools(registerTools)

export default function AIChat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState(() => getActiveConfig())
  const [showConfig, setShowConfig] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    const request = store.get('request')
    const response = store.get('response')
    const envs = store.get('envs') || []
    const activeEnvId = store.get('activeEnv')
    const env = envs.find(e => e.id === activeEnvId)

    const systemPrompt = buildSystemPrompt(request, response, env)
    const tools = getToolDefinitions()

    const chatMessages = newMessages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    let fullContent = ''
    const controller = new AbortController()
    abortRef.current = controller

    // 注入代理基础地址，供 AI 请求经 polaris-api-proxy 转发时使用
    const activeCfg = getActiveConfig()
    if (activeCfg && activeCfg.proxy) {
      activeCfg.proxyBase = 'http://127.0.0.1:9870'
    }

    await chat({
      config: activeCfg,
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatMessages,
      ],
      tools,
      signal: controller.signal,
      onDelta: (delta) => {
        fullContent += delta
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, content: fullContent }
            return updated
          }
          return [...prev, { role: 'assistant', content: fullContent }]
        })
      },
      onToolCall: (name, args) => {
        setMessages(prev => [...prev, {
          role: 'tool',
          content: `🔧 执行: ${name}(${args})`,
        }])
      },
      onToolResult: (name, result) => {
        setMessages(prev => [...prev, {
          role: 'tool',
          content: `✓ ${name} 完成`,
        }])
      },
      onComplete: (fullText) => {
        if (fullText) {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.content === fullContent) {
              return prev
            }
            return [...prev, { role: 'assistant', content: fullText }]
          })
        }
        setLoading(false)
      },
      onError: (err) => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠ 错误：' + err,
        }])
        setLoading(false)
      },
    })
  }, [input, messages, loading])

  const stopChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setLoading(false)
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  const getContextSummary = useCallback(() => {
    const request = store.get('request')
    const response = store.get('response')
    const parts = []
    if (request) {
      parts.push(request.method || 'GET')
      if (request.url) parts.push(request.url.length > 30 ? request.url.slice(0, 30) + '…' : request.url)
    }
    if (response) {
      if (response.error) parts.push('❌')
      else parts.push(response.status ? '状态 ' + response.status : '?')
    }
    return parts.join(' · ') || '无上下文'
  }, [])

  return (
    <div className="api-ai-chat">
      {/* 头部 */}
      <div className="api-ai-header">
        <span className="api-ai-title">✦ AI 助手</span>
        <span className="api-ai-spacer" />
        <button className="api-btn-icon" onClick={() => setShowConfig(!showConfig)} title="AI 配置">⚙</button>
        <button className="api-btn-icon" onClick={clearChat} title="清空对话">🗑</button>
      </div>

      {/* 上下文摘要 */}
      <div className="api-ai-context">
        📊 {getContextSummary()}
      </div>

      {/* AI 配置 */}
      {showConfig && <AIConfigPanel onClose={() => setShowConfig(false)} />}

      {/* 消息区域 */}
      <div className="api-ai-messages">
        {messages.length === 0 ? (
          <div className="api-ai-empty">
            <div className="api-ai-empty-icon">✦</div>
            <div className="api-ai-empty-text">AI 助手可以帮你</div>
            <div className="api-ai-hints">
              <div className="api-ai-hint" onClick={() => setInput('帮我生成一个获取用户列表的 GET 请求')}>
                📝 生成 API 请求
              </div>
              <div className="api-ai-hint" onClick={() => setInput('分析当前响应，告诉我有什么问题')}>
                🔍 分析响应错误
              </div>
              <div className="api-ai-hint" onClick={() => setInput('把这个请求改成 POST，添加一个 JSON body')}>
                🔄 修改当前请求
              </div>
              <div className="api-ai-hint" onClick={() => setInput('把当前请求生成 Python 代码')}>
                💻 生成代码
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={'api-ai-msg ' + msg.role}>
              <div className="api-ai-msg-role">
                {msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI' : '🔧'}
              </div>
              <div className="api-ai-msg-body">
                {msg.role === 'assistant'
                  ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || '') }} />
                  : msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="api-ai-msg assistant">
            <div className="api-ai-msg-role">AI</div>
            <div className="api-ai-msg-body">
              <span className="api-spin"></span> 思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="api-ai-input-bar">
        <textarea
          ref={inputRef}
          className="api-ai-input"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        {loading ? (
          <button className="api-btn api-btn-danger" onClick={stopChat}>■ 停止</button>
        ) : (
          <button className="api-btn api-btn-primary" onClick={sendMessage} disabled={!input.trim()}>
            发送
          </button>
        )}
      </div>
    </div>
  )
}

/* ===================== AI 配置面板 ===================== */
function AIConfigPanel({ onClose }) {
  const [configs, setConfigs] = useState(() => store.get('ai.configs') || [])
  const [activeId, setActiveId] = useState(() => store.get('ai.activeConfig'))
  const [editId, setEditId] = useState(null)

  const activeConfig = configs.find(c => c.id === activeId)
  const editConfig = configs.find(c => c.id === (editId || activeId))

  useEffect(() => {
    const unsub = store.subscribe('ai', (val) => {
      if (val) {
        setConfigs(val.configs || [])
        setActiveId(val.activeConfig)
      }
    })
    return () => unsub()
  }, [])

  // 统一字段更新：即时落 store，避免局部 state 与 store 失同步导致丢数据
  const updateField = useCallback((cfgId, field, value) => {
    const all = store.get('ai.configs') || []
    const idx = all.findIndex(c => c.id === cfgId)
    if (idx < 0) return
    all[idx] = { ...all[idx], [field]: value }
    store.set('ai.configs', all)
  }, [])

  const addConfig = useCallback(() => {
    const newCfg = {
      id: uid(),
      name: '新配置',
      endpoint: '',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 4096,
      proxy: false,
    }
    const configs = store.get('ai.configs') || []
    store.set('ai.configs', [...configs, newCfg])
    store.set('ai.activeConfig', newCfg.id)
    setEditId(newCfg.id)
  }, [])

  const deleteConfig = useCallback((id) => {
    let configs = store.get('ai.configs') || []
    configs = configs.filter(c => c.id !== id)
    store.set('ai.configs', configs)
    if (store.get('ai.activeConfig') === id) {
      store.set('ai.activeConfig', configs[0]?.id || null)
    }
    if (editId === id) setEditId(null)
  }, [editId])

  const testConnection = useCallback(async () => {
    if (!editConfig) return
    const { endpoint, apiKey, model, proxy } = editConfig
    if (!endpoint || !apiKey) {
      alert('请先填写 Endpoint 和 API Key')
      return
    }
    try {
      const url = (endpoint.replace(/\/+$/, '') + '/chat/completions')
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
      let fetchUrl = url
      // 测试连接也支持经代理转发
      if (proxy) {
        headers['X-Polaris-Target'] = url
        fetchUrl = 'http://127.0.0.1:9870/__proxy'
      }
      const resp = await fetch(fetchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      })
      if (resp.ok) {
        alert('✓ 连接成功')
      } else {
        const err = await resp.text().catch(() => '')
        alert('✗ 连接失败: HTTP ' + resp.status + ' ' + err.slice(0, 100))
      }
    } catch (e) {
      alert('✗ 连接失败: ' + e.message)
    }
  }, [editConfig])

  return (
    <div className="api-ai-config">
      <div className="api-ai-config-header">
        <span>AI 配置</span>
        <button className="api-btn-icon" onClick={onClose}>✕</button>
      </div>
      <div className="api-ai-config-body">
        <div className="api-ai-config-list">
          {configs.map(cfg => (
            <div
              key={cfg.id}
              className={'api-ai-config-item' + (cfg.id === (editId || activeId) ? ' active' : '')}
              onClick={() => setEditId(cfg.id)}
            >
              <span className="api-ai-config-dot" />
              <span className="api-ai-config-name">{cfg.name}</span>
              {cfg.id === activeId && <span className="api-ai-config-active">●</span>}
            </div>
          ))}
          <button className="api-btn-link" onClick={addConfig}>+ 新增</button>
        </div>
        {editConfig && (
          <div className="api-ai-config-form">
            <div className="api-field">
              <label>名称</label>
              <input type="text" value={editConfig.name} onChange={e => updateField(editConfig.id, 'name', e.target.value)} />
            </div>
            <div className="api-field">
              <label>Endpoint (Base URL)</label>
              <input type="text" placeholder="https://api.deepseek.com/v1" value={editConfig.endpoint} onChange={e => updateField(editConfig.id, 'endpoint', e.target.value)} />
            </div>
            <div className="api-field">
              <label>API Key</label>
              <input type="password" placeholder="sk-xxx" value={editConfig.apiKey} onChange={e => updateField(editConfig.id, 'apiKey', e.target.value)} />
            </div>
            <div className="api-field">
              <label>模型</label>
              <input type="text" placeholder="deepseek-chat" value={editConfig.model} onChange={e => updateField(editConfig.id, 'model', e.target.value)} />
            </div>
            <div className="api-field">
              <label>温度: {editConfig.temperature}</label>
              <input type="range" min="0" max="2" step="0.1" value={editConfig.temperature} onChange={e => updateField(editConfig.id, 'temperature', parseFloat(e.target.value))} />
            </div>
            <div className="api-field">
              <label>
                <input type="checkbox" checked={editConfig.proxy || false} onChange={e => updateField(editConfig.id, 'proxy', e.target.checked)} />
                经代理转发（绕过 CORS）
              </label>
            </div>
            <div className="api-ai-config-actions">
              <button className="api-btn" onClick={() => deleteConfig(editConfig.id)}>删除</button>
              <span className="api-ai-spacer" />
              <button className="api-btn" onClick={testConnection}>测试连接</button>
              <button
                className={'api-btn' + (editConfig.id === activeId ? ' api-btn-primary' : '')}
                onClick={() => store.set('ai.activeConfig', editConfig.id)}
              >
                {editConfig.id === activeId ? '✓ 当前使用' : '设为当前'}
              </button>
            </div>
            <div className="api-ai-config-hint">改动自动保存</div>
          </div>
        )}
        {!editConfig && !configs.length && (
          <div className="api-ai-config-empty">
            还没有 AI 配置。点击「+ 新增」添加一个配置。
            <br />支持 OpenAI 协议兼容的服务（DeepSeek、Qwen、Ollama 等）。
          </div>
        )}
      </div>
    </div>
  )
}

function getActiveConfig() {
  const configs = store.get('ai.configs') || []
  const activeId = store.get('ai.activeConfig')
  return configs.find(c => c.id === activeId) || configs[0] || null
}

