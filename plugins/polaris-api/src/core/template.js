// core/template.js — 变量模板引擎
// 支持 {{baseUrl}}、{{varName}}、{{$guid}}、{{$timestamp}}、{{$randomInt}} 等动态变量

export function resolveTemplates(str, env) {
  if (str == null) return str
  return String(str).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (match, key) => {
    // 动态变量
    if (key.startsWith('$')) {
      return resolveDynamicVar(key)
    }
    // 环境变量
    if (env) {
      if (key === 'baseUrl') return env.baseUrl || match
      const v = (env.vars || []).find(r => r.enabled !== false && r.key === key)
      if (v) return v.value
    }
    return match
  })
}

function resolveDynamicVar(key) {
  switch (key) {
    case '$guid':
      return generateUUID()
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000))
    case '$timestampMs':
      return String(Date.now())
    case '$isoTimestamp':
      return new Date().toISOString()
    case '$randomInt':
      return String(Math.floor(Math.random() * 10000))
    case '$randomFloat':
      return String(Math.random().toFixed(4))
    case '$uuid':
      return generateUUID()
    case '$localDate':
      return new Date().toISOString().slice(0, 10)
    case '$localTime':
      return new Date().toTimeString().slice(0, 8)
    default:
      return '{{' + key + '}}'
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// 查找模板中使用的变量名
export function extractVarNames(str) {
  if (!str) return []
  const names = new Set()
  String(str).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (_, key) => {
    if (!key.startsWith('$')) names.add(key)
  })
  return [...names]
}

// 预览模板解析结果
export function previewResolved(str, env) {
  if (!str || str.indexOf('{{') < 0) return null
  return resolveTemplates(str, env)
}