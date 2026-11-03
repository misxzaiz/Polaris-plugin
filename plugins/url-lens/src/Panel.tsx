/**
 * URL 调试台面板：URL 输入 → 结构树 + 参数表 + 解码对照（三合一视图）。
 * 引擎复用 shared/url-core.js（与 MCP 同一权威；全局 URL/URLSearchParams，
 * esbuild browser bundle 兼容，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/url-core.js'

const CSS = `
.ul-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ul-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ul-head b{font-size:13px}
.ul-head .sub{color:#5C6678;font-size:11px}
.ul-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ul-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none}
.ul-input:focus{border-color:#4fd1a0}
.ul-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.ul-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.ul-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.ul-rows{font:12px/1.9 ui-monospace,Consolas,monospace}
.ul-rows .r{display:flex;gap:10px;padding:2px 12px}
.ul-rows .k{color:#8B94A9;min-width:86px}
.ul-rows .v{color:#c9cede;word-break:break-all}
.ul-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.ul-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.ul-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.ul-warn{padding:7px 12px;color:#f3b377;font-size:11.5px}
.ul-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function UrlLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')

  const result = useMemo(() => {
    if (!submitted) return null
    return core.parseUrl(submitted)
  }, [submitted])

  const decode = useMemo(() => {
    if (!submitted) return null
    return core.decodeSegments(submitted)
  }, [submitted])

  return (
    <div className="ul-root">
      <style>{CSS}</style>
      <div className="ul-head">
        <b>URL 调试台</b>
        <span className="sub">结构分解 · 参数全展开 · 解码对照 · 纯本地</span>
      </div>
      <div className="ul-body">
        <input
          className="ul-input"
          placeholder="粘贴 URL：https://example.com/path?tag=a&tag=b&q=hello%20world#frag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSubmitted(text.trim()) }}
        />
        <button className="ul-input" style={{ width: 'auto', padding: '6px 18px', cursor: 'pointer' }} onClick={() => setSubmitted(text.trim())}>
          解析（或回车）
        </button>

        {result && !result.ok && <div className="ul-err">{result.error}</div>}

        {result && result.ok && (
          <>
            <div className="ul-card">
              <h3>结构分解</h3>
              <div className="ul-rows">
                {Object.entries(result.parts).map(([k, v]) => (
                  <div className="r" key={k}><span className="k">{k}</span><span className="v">{String(v)}</span></div>
                ))}
              </div>
            </div>

            <div className="ul-card">
              <h3>query 参数（重复键全展开）</h3>
              {result.params.length > 0 ? (
                <table className="ul-tbl">
                  <thead><tr><th>#</th><th>name</th><th>value</th></tr></thead>
                  <tbody>
                    {result.params.map((p, i) => (
                      <tr key={i}><td>{i + 1}</td><td>{p.name}</td><td>{p.value === '' ? '(空值)' : p.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="ul-note" style={{ padding: '8px 12px' }}>无 query 参数</div>}
              {core.findDuplicateNames(result.params).length > 0 && (
                <div className="ul-warn">⚠ 重复键：{core.findDuplicateNames(result.params).join(', ')} —— searchParams.get 只取首个，整组取值用 getAll</div>
              )}
            </div>

            {decode && decode.ok && (
              <div className="ul-card">
                <h3>各段 raw vs 解码对照</h3>
                <table className="ul-tbl">
                  <thead><tr><th>段</th><th>raw</th><th>decoded</th></tr></thead>
                  <tbody>
                    {decode.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.segment}</td>
                        <td>{row.raw}</td>
                        <td>{row.decoded}{row.note ? <span style={{ color: '#5C6678' }}> · {row.note}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div className="ul-note">
          语义边界（如实）：query 参数按 URLSearchParams 标准（+ → 空格、%XX 解码）；路径里 + 是字面量。纯本地解析，不发 DNS 不联外；punycode 按 WHATWG URL 原生行为呈现不做特判。
        </div>
      </div>
    </div>
  )
}
