// YAML ↔ JSON 互转 —— 基于 js-yaml v4（构建期打进产物，运行时零外部依赖）
// 已知口径（在 UI 明示）：js-yaml 4 默认 schema 为 YAML 1.2 core——yes/no/on/off 是字符串不是布尔，
// 也不做 "sexquindecimal" 八进制；需要 YAML 1.1 语义的场景属少数，v0.2 可加开关

import { load as yamlLoad, dump as yamlDump, YAMLException } from 'js-yaml'

export interface ConvertResult {
  ok: boolean
  output: string
  error?: string
}

function errText(e: unknown): string {
  if (e instanceof YAMLException) {
    // js-yaml 的异常自带 (line/column) 标记，取 message 首行即可读
    const first = String(e.message).split('\n')[0]
    return first
  }
  return (e as Error).message
}

export function yamlToJson(text: string): ConvertResult {
  try {
    const value = yamlLoad(text)
    if (value === undefined) return { ok: true, output: '' }
    return { ok: true, output: JSON.stringify(value, null, 2) }
  } catch (e) {
    return { ok: false, output: '', error: errText(e) }
  }
}

export function jsonToYaml(text: string): ConvertResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { ok: false, output: '', error: `输入不是合法 JSON：${(e as Error).message}` }
  }
  try {
    const output = yamlDump(value, { indent: 2, lineWidth: 120, noRefs: true })
    return { ok: true, output }
  } catch (e) {
    return { ok: false, output: '', error: errText(e) }
  }
}
