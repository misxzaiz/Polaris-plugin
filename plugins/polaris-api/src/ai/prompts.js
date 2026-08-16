// ai/prompts.js — AI 系统提示词模板

// 系统提示词构建器
export function buildSystemPrompt(request, response, env) {
  const parts = []

  parts.push('你是 Polaris API 的 AI 助手，一个专业的 API 调试工具。你可以帮助用户：')
  parts.push('')
  parts.push('1. **API 请求生成** — 根据用户描述，自动生成 HTTP 请求（method, URL, headers, body）')
  parts.push('2. **API 错误分析** — 分析 HTTP 响应错误，提供修复建议')
  parts.push('3. **响应数据提取** — 从响应中提取特定字段')
  parts.push('4. **参数建议** — 根据 API 语义推荐请求参数')
  parts.push('5. **cURL 解析** — 解析 cURL 命令并填充请求')
  parts.push('6. **代码生成** — 将当前请求生成为 cURL/Python/JavaScript 代码')
  parts.push('7. **Mock 数据生成** — 基于响应结构生成模拟数据')
  parts.push('')
  parts.push('规则：')
  parts.push('- 回复使用中文，代码和技术术语保持英文')
  parts.push('- 如果需要修改请求，使用 set_request 工具')
  parts.push('- 需要发送请求时，使用 send_request 工具')
  parts.push('- 分析响应时，先获取响应数据再给出建议')
  parts.push('- 如果用户描述一个 API，尝试生成完整的请求')
  parts.push('')

  // 当前请求上下文
  parts.push('--- 当前请求上下文 ---')
  if (request) {
    parts.push('方法：' + (request.method || 'GET'))
    if (request.url) parts.push('URL：' + request.url)
    if (request.params && request.params.length) {
      const activeParams = request.params.filter(p => p.enabled !== false && p.key)
      if (activeParams.length) {
        parts.push('参数：' + activeParams.map(p => p.key + '=' + p.value).join(', '))
      }
    }
    if (request.bodyType !== 'none' && request.body) {
      const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
      parts.push('Body：' + bodyStr.slice(0, 1000))
    }
  }
  if (response) {
    if (response.error) {
      parts.push('响应错误：' + response.error)
    } else {
      parts.push('响应状态：' + (response.status || '?'))
      if (response.parsed) {
        parts.push('响应类型：JSON')
        const preview = JSON.stringify(response.parsed)
        if (preview.length > 2000) {
          parts.push('响应预览（前 2000 字符）：' + preview.slice(0, 2000) + '...')
        } else {
          parts.push('响应数据：' + preview)
        }
      } else if (response.text) {
        parts.push('响应体（前 2000 字符）：' + String(response.text).slice(0, 2000))
      }
    }
  }
  if (env) {
    parts.push('当前环境：' + (env.name || '默认') + (env.baseUrl ? ' (' + env.baseUrl + ')' : ''))
    if (env.vars && env.vars.length) {
      const activeVars = env.vars.filter(v => v.enabled !== false && v.key)
      if (activeVars.length) {
        parts.push('环境变量：' + activeVars.map(v => v.key + '=' + (v.key === 'token' || v.key === 'api_key' || v.key === 'secret' ? '***' : v.value)).join(', '))
      }
    }
  }

  return parts.join('\n')
}

// 简短上下文摘要
export function buildContextSummary(request, response) {
  const parts = []
  if (request) {
    parts.push(request.method || 'GET')
    if (request.url) {
      const u = request.url.length > 45 ? request.url.slice(0, 45) + '…' : request.url
      parts.push(u)
    }
  }
  if (response) {
    if (response.error) parts.push('❌ ' + response.error.slice(0, 30))
    else parts.push(response.status ? '状态 ' + response.status : '?')
  }
  return parts.join(' · ') || '无上下文'
}