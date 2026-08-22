// core/template.js — 变量模板引擎（复用 http.resolveVars 的动态变量逻辑）
import { resolveVars } from './http.js'

export function resolveTemplates(str, env) {
  return resolveVars(str, env)
}

export function extractVarNames(str) {
  if (!str) return []
  const names = new Set()
  String(str).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g, (_, key) => {
    if (!key.startsWith('$')) names.add(key)
  })
  return [...names]
}

export function previewResolved(str, env) {
  if (!str || str.indexOf('{{') < 0) return null
  return resolveVars(str, env)
}