/**
 * Tern — AI 客户端
 *
 * OpenAI 兼容 API 的封装，支持流式（SSE）和非流式调用。
 * 兼容 OpenAI、DeepSeek、Groq 等任意 OpenAI 兼容端点。
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface AIConfig {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  /** 温度，默认 0.7 */
  temperature?: number
  /** 最大 token 数，默认 4096 */
  maxTokens?: number
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number
}

// ============================================================================
// 错误类型
// ============================================================================

export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'network' | 'timeout' | 'rate_limit' | 'model' | 'unknown'
  ) {
    super(message)
    this.name = 'AIError'
  }
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 非流式调用
 */
export async function chatComplete(
  config: AIConfig,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = 4096, timeout = 30000 } = options

  const body = {
    model: config.model,
    messages: buildMessages(config, messages),
    temperature,
    max_tokens: maxTokens,
    stream: false,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      throw parseError(res.status, await res.text().catch(() => ''))
    }

    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof AIError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AIError('请求超时，请检查网络或 API 端点', 'timeout')
    }
    throw new AIError(
      e instanceof Error ? e.message : '未知网络错误',
      'network'
    )
  }
}

/**
 * 流式调用（SSE）
 *
 * @param onChunk 每收到一块文本时回调
 * @returns 完整回复文本
 */
export async function chatCompleteStream(
  config: AIConfig,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options: ChatOptions = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = 4096, timeout = 60000 } = options

  const body = {
    model: config.model,
    messages: buildMessages(config, messages),
    temperature,
    max_tokens: maxTokens,
    stream: true,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      throw parseError(res.status, await res.text().catch(() => ''))
    }

    const reader = res.body?.getReader()
    if (!reader) throw new AIError('响应体不可读', 'network')

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 最后一个可能是未完成的行，保留在 buffer 中
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6))
            const content = data.choices?.[0]?.delta?.content ?? ''
            if (content) {
              fullText += content
              onChunk(content)
            }
          } catch {
            // 跳过无法解析的 SSE 行
          }
        }
      }
    }

    return fullText.trim()
  } catch (e) {
    if (e instanceof AIError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AIError('请求超时，请检查网络或 API 端点', 'timeout')
    }
    throw new AIError(
      e instanceof Error ? e.message : '未知网络错误',
      'network'
    )
  }
}

// ============================================================================
// 内部函数
// ============================================================================

function buildMessages(config: AIConfig, messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []

  if (config.systemPrompt.trim()) {
    result.push({ role: 'system', content: config.systemPrompt })
  }

  result.push(...messages)
  return result
}

function parseError(status: number, body: string): AIError {
  // 尝试解析错误体
  let errorMsg = body
  try {
    const parsed = JSON.parse(body)
    errorMsg = parsed.error?.message ?? parsed.error ?? body
  } catch { /* 保持原样 */ }

  switch (status) {
    case 401:
      return new AIError(`认证失败：${errorMsg}。请检查 API Key 是否正确`, 'auth')
    case 429:
      return new AIError(`请求过于频繁：${errorMsg}`, 'rate_limit')
    case 404:
      return new AIError(`模型未找到：${errorMsg}。请检查 Model 名称是否正确`, 'model')
    default:
      return new AIError(`API 错误 (${status})：${errorMsg}`, 'unknown')
  }
}