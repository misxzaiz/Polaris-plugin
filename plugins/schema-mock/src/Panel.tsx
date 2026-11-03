/**
 * Mock 数据生成器面板：schema 输入 → 假数据生成（seed 可复现）。
 * 引擎复用 shared/mock-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/mock-core.js'

const CSS = `
.sm-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sm-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sm-head b{font-size:13px}
.sm-head .sub{color:#5C6678;font-size:11px}
.sm-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.sm-label{color:#8B94A9;font-size:11px}
.sm-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.sm-area:focus{border-color:#4fd1a0}
.sm-row{display:flex;gap:8px;align-items:center}
.sm-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;width:130px;outline:none}
.sm-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.sm-btn:disabled{opacity:.5;cursor:not-allowed}
.sm-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.sm-out{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#8ce0b0}
.sm-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function SchemaMockPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [schemaText, setSchemaText] = useState('')
  const [seed, setSeed] = useState('42')
  const [count, setCount] = useState('3')
  const [submitted, setSubmitted] = useState<{ s: string; seed?: number; count?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const result = useMemo(() => {
    if (!submitted) return null
    try {
      const schema = JSON.parse(submitted.s)
      const items = core.generateBatch(schema, { seed: submitted.seed, count: submitted.count })
      return { items, ok: true }
    } catch (e) {
      return { error: String((e as Error).message || e) }
    }
  }, [submitted])

  const run = () => {
    setError(null)
    if (!schemaText.trim()) return
    try {
      JSON.parse(schemaText) // 语法预检（错误即时反馈）
    } catch (e) {
      setError(`schema JSON 解析失败：${(e as Error).message.slice(0, 120)}`)
      return
    }
    const seedNum = seed.trim() !== '' && Number.isFinite(Number(seed)) ? Number(seed) : undefined
    const countNum = Number.isFinite(Number(count)) ? Math.max(1, Math.min(50, Number(count))) : 3
    setSubmitted({ s: schemaText, seed: seedNum, count: countNum })
  }

  return (
    <div className="sm-root">
      <style>{CSS}</style>
      <div className="sm-head">
        <b>Mock 数据生成器</b>
        <span className="sub">按 JSON Schema 反向生成 · seed 可复现 · 闭环自检</span>
      </div>
      <div className="sm-body">
        <div className="sm-label">JSON Schema（Draft-07 高频子集）</div>
        <textarea
          className="sm-area"
          placeholder={'{"type":"object","required":["id"],"properties":{"id":{"type":"integer","minimum":1},"name":{"type":"string"}}}'}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
        />
        <div className="sm-row">
          <span className="sm-label">seed</span>
          <input className="sm-input" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="42" />
          <span className="sm-label">count</span>
          <input className="sm-input" value={count} onChange={(e) => setCount(e.target.value)} placeholder="3" />
          <button className="sm-btn" onClick={run} disabled={!schemaText.trim()}>生成</button>
        </div>
        {error && <div className="sm-err">{error}</div>}
        {result && 'error' in result && <div className="sm-err">{result.error}</div>}
        {result && 'items' in result && (
          <div className="sm-out">{JSON.stringify(result.items, null, 2)}</div>
        )}
        <div className="sm-note">
          支持（Draft-07 高频子集）：type / enum / const / required / properties / items / 数值范围（含 exclusive/multipleOf）/ 字符串长度 / array 约束 / additionalProperties / oneOf·anyOf·allOf。
          pattern 有界重试自检（无法满足如实报错）；<b>不支持 $ref</b>（如实报错）。seed 相同生成序列相同（确定性 PRNG）。
          生成物与 schema-check（036）组成工具链：mock → validate。
        </div>
      </div>
    </div>
  )
}
