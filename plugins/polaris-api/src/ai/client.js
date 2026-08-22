// ai/client.js — AI 客户端：SSE streaming + Tool Calling + 上下文感知
// 兼容 OpenAI 协议（DeepSeek / Qwen / Ollama 等）

const MAX_TOOL_ROUNDS = 8

// SSE 解析器
function createSSEParser() {
  let buffer = ''
  return {
    feed(chunk) {
      buffer += chunk
      const results = []
      while (true) {
        const idx = buffer.indexOf('\n')
        if (idx < 0) break
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') { results.push({ done: true }); continue }
          try {
            results.push(JSON.parse(data))
          } catch (e) { /* skip malformed JSON */ }
        }
      }
      return results
    },
    reset() { buffer = '' }
  }
}

// AI 聊天
export async function chat(opts) {
  const { config, messages, tools, signal, onDelta, onToolCall, onToolResult, onComplete, onError } = opts

  if (!config || !config.endpoint || !config.apiKey) {
    if (onError) onError('请先配置 AI 服务（设置 → AI 配置）')
    return
  }

  const url = buildChatUrl(config.endpoint)
  const allMessages = [...messages]

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let fullText = ''
    let toolCalls = []

    const body = {
      model: config.model || 'gpt-3.5-turbo',
      messages: allMessages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens || 4096,
      stream: true,
    }
    if (tools && tools.length) body.tools = tools

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey,
      }
      let fetchUrl = url
      // 代理模式：经 polaris-api-proxy 转发，绕过浏览器 CORS
      // proxyBase 形如 http://127.0.0.1:9870，由调用方注入
      if (config.proxy) {
        const proxyBase = (config.proxyBase || '').replace(/\/+$/, '')
        if (!proxyBase) {
          if (onError) onError('代理服务未启动，请先开启顶栏「代理」或关闭 AI 配置中的「经代理转发」')
          return
        }
        headers['X-Polaris-Target'] = url
        fetchUrl = proxyBase + '/__proxy'
      }

      const resp = await fetch(fetchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })

      if (!resp.ok) {
        let errMsg = 'HTTP ' + resp.status
        try {
          const errData = await resp.json()
          errMsg = errData.error?.message || errData.message || errMsg
        } catch (e) {}
        if (onError) onError(errMsg)
        return
      }

      // 解析 SSE 流
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      const parser = createSSEParser()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunks = parser.feed(decoder.decode(value, { stream: true }))
        for (const chunk of chunks) {
          if (chunk.done) continue
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) {
            fullText += delta.content
            if (onDelta) onDelta(delta.content)
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index || 0
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', arguments: '' }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function) {
                if (tc.function.name) toolCalls[idx].name += tc.function.name
                if (tc.function.arguments) toolCalls[idx].arguments += tc.function.arguments
              }
            }
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return
      if (onError) onError('请求失败：' + e.message)
      return
    }

    // 没有 tool calls → 完成
    if (!toolCalls.length) {
      if (onComplete) onComplete(fullText)
      return
    }

    // 添加 assistant 消息
    allMessages.push({ role: 'assistant', content: fullText || null, tool_calls: toolCalls })

    // 执行 tool calls
    for (const tc of toolCalls) {
      if (onToolCall) onToolCall(tc.name, tc.arguments)
      let args = {}
      try { args = JSON.parse(tc.arguments || '{}') } catch (e) {}
      const result = await executeToolCall(tc.name, args)
      if (onToolResult) onToolResult(tc.name, result)
      allMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }

  // 达到最大 tool 轮次
  if (onComplete) onComplete('')
}

function buildChatUrl(baseEndpoint) {
  let base = (baseEndpoint || '').replace(/\/+$/, '')
  if (!base) return ''
  if (base.endsWith('/chat/completions')) return base
  return base + '/chat/completions'
}

// 工具执行器（由外部注册）
let _toolRegistry = {}

export function registerTools(tools) {
  Object.assign(_toolRegistry, tools)
}

async function executeToolCall(name, args) {
  const fn = _toolRegistry[name]
  if (!fn) return { error: '未知工具: ' + name }
  try {
    return await fn(args)
  } catch (e) {
    return { error: e.message }
  }
}

// Markdown 渲染
export function renderMarkdown(text) {
  if (!text) return ''
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return '<pre class="api-code-block"><code' + (lang ? ' class="lang-' + lang + '"' : '') + '>' + escHtml(code) + '</code></pre>'
  })
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="api-code-inline">$1</code>')
  // 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // 无序列表
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul>$&</ul>')
  // 有序列表
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
  // 段落
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p><\/p>/g, '')
  return html
}

function escHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}