/**
 * JSON Schema 校验器面板：schema + 数据双框测试场。
 * 校验引擎复用 shared/schema-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/schema-core.js'

const CSS = `
.sc-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sc-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sc-head b{font-size:13px}
.sc-head .sub{color:#5C6678;font-size:11px}
.sc-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.sc-cols{display:flex;gap:10px}
.sc-col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.sc-col label{color:#8B94A9;font-size:11px}
.sc-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.sc-area:focus{border-color:#4fd1a0}
.sc-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.sc-run:disabled{opacity:.5;cursor:not-allowed}
.sc-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.sc-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.sc-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.sc-verdict b{font-size:13px}
.sc-errs{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:8px 12px;font:12px/1.8 ui-monospace,Consolas,monospace;color:#e8b4b4;word-break:break-all}
.sc-explain{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#c9cede}
.sc-note{color:#5C6678;font-size:11px;line-height:1.6}
`

type Parsed = { ok: true; schema: object; data: unknown } | { ok: false; error: string }

function parseBox(text: string, field: string): Parsed {
  if (!text.trim()) return { ok: false, error: `${field} 为空` }
  try {
    const v = JSON.parse(text)
    return { ok: true, schema: field === 'schema' ? v : v, data: v } as Parsed
  } catch (e) {
    return { ok: false, error: `${field} JSON 解析失败：${(e as Error).message.slice(0, 100)}` }
  }
}

export default function SchemaCheckPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [schemaText, setSchemaText] = useState('')
  const [dataText, setDataText] = useState('')
  const [checked, setChecked] = useState<{ s: string; d: string } | null>(null)

  const result = useMemo(() => {
    if (!checked) return null
    const ps = parseBox(checked.s, 'schema')
    if (!ps.ok) return { error: ps.error }
    const pd = parseBox(checked.d, 'data')
    if (!pd.ok) return { error: pd.error }
    const r = core.validate((pd as { data: unknown }).data, (ps as { schema: object }).schema)
    return { valid: r.valid, errors: r.errors, explain: core.explainSchema((ps as { schema: object }).schema) }
  }, [checked])

  const run = () => setChecked({ s: schemaText, d: dataText })

  return (
    <div className="sc-root">
      <style>{CSS}</style>
      <div className="sc-head">
        <b>JSON Schema 校验器</b>
        <span className="sub">Draft-07 高频子集 · 错误 JSON Pointer 定位 · 纯本地</span>
      </div>
      <div className="sc-body">
        <div className="sc-cols">
          <div className="sc-col">
            <label>JSON Schema</label>
            <textarea
              className="sc-area"
              placeholder={'{"type":"object","required":["id"],"properties":{"id":{"type":"integer"}}}'}
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
            />
          </div>
          <div className="sc-col">
            <label>待校验数据</label>
            <textarea
              className="sc-area"
              placeholder={'{"id": 1}'}
              value={dataText}
              onChange={(e) => setDataText(e.target.value)}
            />
          </div>
        </div>
        <button className="sc-run" onClick={run} disabled={!schemaText.trim() || !dataText.trim()}>校验</button>
        {result && 'error' in result && (
          <div className="sc-verdict bad"><b>输入错误</b>：{result.error}</div>
        )}
        {result && !('error' in result) && (
          <>
            <div className={`sc-verdict ${result.valid ? 'ok' : 'bad'}`}>
              <b>{result.valid ? '✅ 校验通过' : `❌ 校验失败（${result.errors.length} 条错误）`}</b>
            </div>
            {!result.valid && (
              <div className="sc-errs">
                {result.errors.map((e, i) => (
                  <div key={i}>{e.pointer || '/'} [{e.keyword}] {e.message}</div>
                ))}
              </div>
            )}
            <div className="sc-explain">{result.explain}</div>
          </>
        )}
        <div className="sc-note">
          支持约束（Draft-07 高频子集）：type / required / properties / items / enum / const / minimum·maximum（含 exclusive）/ minLength·maxLength / pattern / minItems·maxItems / uniqueItems / additionalProperties / multipleOf / oneOf·anyOf·allOf·not / format（date-time/email/uri/uuid/ipv4/hostname 基础）。
          <b>不支持 $ref</b>（如实报错不静默跳过）；不支持 if/then/else 等 2019-12+ 关键字。
        </div>
      </div>
    </div>
  )
}
