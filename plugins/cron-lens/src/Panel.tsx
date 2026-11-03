/**
 * Cron 表达式调试台面板：表达式 → 字段解释 + 坑警示 + 未来触发预报 + 时刻诊断。
 * 引擎复用 shared/cron-core.js（与 MCP 同一权威；纯本地零外联零 kv）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/cron-core.js'

const CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.cl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none}
.cl-input:focus{border-color:#4fd1a0}
.cl-btn{width:auto;padding:6px 18px;cursor:pointer;background:#1a2030;color:#E6EAF2;border:1px solid #2b3348;border-radius:8px;font-size:12px}
.cl-btn:hover{border-color:#4fd1a0}
.cl-chips{display:flex;gap:6px;flex-wrap:wrap}
.cl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.cl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.cl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.cl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.cl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.cl-rows{font:12px/1.9 ui-monospace,Consolas,monospace}
.cl-rows .r{display:flex;gap:10px;padding:2px 12px}
.cl-rows .k{color:#8B94A9;min-width:96px;flex-shrink:0}
.cl-rows .t{color:#5C6678;min-width:80px;flex-shrink:0}
.cl-rows .v{color:#c9cede;word-break:break-all}
.cl-warnitem{padding:4px 12px;font-size:11.5px;color:#f3b377}
.cl-infoitem{padding:4px 12px;font-size:11.5px;color:#8B94A9}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.cl-ok{color:#4fd1a0}
.cl-bad{color:#f1a0a0}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-never{padding:10px 12px;color:#f1a0a0;font-size:12px}
`

const PRESETS = ['*/15 * * * *', '0 9 * * 1-5', '30 4 1,15 * *', '0 0 29 2 *', '0 0 1 * 1', '@daily']

export default function CronLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void; initialExpression?: string }) {
  const initial = (_props && _props.initialExpression) || ''
  const [text, setText] = useState(initial)
  const [submitted, setSubmitted] = useState(initial)
  const [checkText, setCheckText] = useState('')
  const [checkSubmitted, setCheckSubmitted] = useState('')

  // 面板用本机时区固定偏移（东正西负取反）；不做 DST 推算，边界说明如实标注
  const tzOff = useMemo(() => -new Date().getTimezoneOffset(), [])

  const parsed = useMemo(() => {
    if (!submitted) return null
    return core.parseCron(submitted)
  }, [submitted])

  const next = useMemo(() => {
    if (!parsed || !parsed.ok) return null
    return core.renderNext(parsed, Date.now(), 8, tzOff)
  }, [parsed, tzOff])

  const match = useMemo(() => {
    if (!parsed || !parsed.ok || !checkSubmitted) return null
    const t = core.parseFromInput(checkSubmitted, tzOff)
    if (t.error) return { error: t.error }
    return core.matchesAt(parsed, t.ms, tzOff)
  }, [parsed, checkSubmitted, tzOff])

  return (
    <div className="cl-root">
      <style>{CSS}</style>
      <div className="cl-head">
        <b>Cron 表达式调试台</b>
        <span className="sub">解析 · 中文解释 · 触发预报 · 坑检测 · 纯本地</span>
      </div>
      <div className="cl-body">
        <input
          className="cl-input"
          placeholder="cron 表达式：分 时 日 月 周（如 0 9 * * 1-5 工作日 9 点）"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSubmitted(text.trim()) }}
        />
        <div className="cl-chips">
          <button className="cl-btn" onClick={() => { setText(submitted ? submitted : text); setSubmitted(text.trim()) }}>解析（或回车）</button>
          {PRESETS.map((p) => (
            <button key={p} className="cl-chip" onClick={() => { setText(p); setSubmitted(p) }}>{p}</button>
          ))}
        </div>

        {parsed && !parsed.ok && <div className="cl-err">{parsed.error}</div>}

        {parsed && parsed.ok && (
          <>
            <div className="cl-card">
              <h3>字段解释（{parsed.normalized}）</h3>
              <div className="cl-rows">
                {core.describeFields(parsed).map((row) => (
                  <div className="r" key={row.label}><span className="k">{row.label}</span><span className="t">{row.token}</span><span className="v">{row.text}</span></div>
                ))}
              </div>
            </div>

            {(parsed.warnings.length > 0 || parsed.notes.length > 0) && (
              <div className="cl-card">
                <h3>坑警示与提示</h3>
                {parsed.warnings.filter((w) => w.level === 'warn').map((w, i) => <div className="cl-warnitem" key={`w${i}`}>⚠ {w.msg}</div>)}
                {parsed.notes.map((n, i) => <div className="cl-infoitem" key={`n${i}`}>ℹ {n.msg}</div>)}
                {parsed.warnings.filter((w) => w.level === 'info').map((w, i) => <div className="cl-infoitem" key={`i${i}`}>ℹ {w.msg}</div>)}
              </div>
            )}

            {next && (
              <div className="cl-card">
                <h3>未来触发（{core.tzTag(tzOff)}，本机时区）</h3>
                {next.neverReason ? (
                  <div className="cl-never">永不触发：{next.neverReason}</div>
                ) : (
                  <table className="cl-tbl">
                    <tbody>
                      {next.fires.map((f, i) => (
                        <tr key={i}><td style={{ width: 30, color: '#5C6678' }}>{i + 1}</td><td>{f.wallText}</td><td>{core.weekdayCn(f.at + tzOff * 60000)}</td><td style={{ color: '#5C6678' }}>epoch={f.at}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {next.horizonReached && <div className="cl-warnitem">⚠ 9 年窗口内未找齐目标次数，请检查字段</div>}
              </div>
            )}

            <div className="cl-card">
              <h3>时刻诊断（为什么没触发？）</h3>
              <div style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                <input
                  className="cl-input"
                  style={{ width: 220 }}
                  placeholder="YYYY-MM-DD HH:mm"
                  value={checkText}
                  onChange={(e) => setCheckText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setCheckSubmitted(checkText.trim()) }}
                />
                <button className="cl-btn" onClick={() => setCheckSubmitted(checkText.trim())}>检查</button>
              </div>
              {match && 'error' in match && <div className="cl-err" style={{ margin: '0 12px 10px' }}>{match.error}</div>}
              {match && !('error' in match) && (
                <table className="cl-tbl">
                  <thead><tr><th>字段</th><th>实际</th><th>期望</th><th>判定</th></tr></thead>
                  <tbody>
                    {match.checks.map((c: any, i: number) => (
                      <tr key={i}>
                        <td>{c.label}</td>
                        <td>{c.value}</td>
                        <td>{c.expect}{c.note ? <span style={{ color: '#5C6678' }}> · {c.note}</span> : null}</td>
                        <td className={c.ok ? 'cl-ok' : 'cl-bad'}>{c.ok ? '✓' : '✗'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {match && !('error' in match) && (
                <div className="cl-note" style={{ padding: '6px 12px' }}>
                  {match.match ? '该时刻命中表达式' : `未命中，首因「${match.firstMismatch}」`}
                </div>
              )}
            </div>

            <div className="cl-note">
              语义边界（如实）：按 vixie/POSIX cron 语义（日与周同时受限=「或」）；Quartz 的 L/W/# 不支持（会明确报错）；
              触发计算用本机固定偏移墙钟，不含夏令时推算；月长/闰年敏感（2 月 29 自动落闰年）。纯本地解析，零外联零 kv。
            </div>
          </>
        )}
      </div>
    </div>
  )
}
