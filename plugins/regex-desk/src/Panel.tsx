/**
 * 正则调试台面板：正则测试场（匹配高亮/分组）+ ReDoS 检测 + 逐构造解释 + 替换预览。
 * 引擎复用 shared/regex-core.js（与 MCP 同一权威，esbuild 打包进 bundle，
 * 纯本地 V8 语义零外联——文本不出本机）。
 */
import { useMemo, useState } from 'react'
import * as coreNs from '../shared/regex-core.js'

// core 是零依赖 JS（checkJs:false 下 TS 推断联合无法窄化 ok: boolean、可选参被推断为必填），
// 边界一次断言 + 下方 PanelState 显式类型，JS-interop 标准做法
const core = coreNs as any

type PanelState =
  | { kind: 'error'; message: string }
  | { kind: 'test'; r: { matchCount: number; truncated: boolean; singleNote: string | null; elapsedMs: number; matches: Array<{ index: number; end: number; text: string; groups: (string | null)[]; named: Record<string, string> | null }> } }
  | { kind: 'redos'; r: { verdict: string; rules: Array<{ id: string; level: string; pattern: string; desc: string; hits: number }>; timing: { confirmed: boolean; note: string; ladder: Array<{ n: number; ms: number; growth: number; ran: boolean }> } | null; notes: string[] } }
  | { kind: 'explain'; r: { tokenCount: number; items: Array<{ depth: number; raw: string; meaning: string }> } }
  | { kind: 'replace'; r: { replaceCount: number; result: string } }

const CSS = `
.rg-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.rg-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rg-head b{font-size:13px}
.rg-head .sub{color:#5C6678;font-size:11px}
.rg-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.rg-tabs{display:flex;gap:6px;flex-wrap:wrap}
.rg-tab{background:#20263A;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.rg-tab.on{background:#2b3348;color:#E6EAF2;border-color:#3a4358}
.rg-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rg-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12.5px/1.5 ui-monospace,Consolas,monospace;padding:7px 10px;outline:none}
.rg-input:focus{border-color:#4fa3f1}
.rg-pattern{flex:1;min-width:220px}
.rg-flags{width:70px}
.rg-area{width:100%;min-height:110px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.rg-area:focus{border-color:#4fa3f1}
.rg-btn{background:#2b3348;border:1px solid #3a4358;color:#E6EAF2;border-radius:6px;padding:5px 16px;font-size:12px;cursor:pointer}
.rg-btn:disabled{opacity:.45;cursor:default}
.rg-err{background:#2b1215;border:1px solid #e03131;color:#f1a0a0;border-radius:8px;padding:8px 12px;font-size:12px}
.rg-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.rg-verdict.safe{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.rg-verdict.caution{background:#2b2413;border-color:#e8590c;color:#f3b377}
.rg-verdict.high{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.rg-verdict b{font-size:13px}
.rg-hl{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede}
.rg-hl mark{background:#31527d;color:#fff;border-radius:2px;padding:0 1px}
.rg-finds{border:1px solid #1c2333;border-radius:8px;overflow:hidden;font-size:11.5px}
.rg-finds table{width:100%;border-collapse:collapse}
.rg-finds th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:6px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.rg-finds td{padding:6px 10px;border-bottom:1px solid #161c2a;vertical-align:top;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.rg-finds tr:last-child td{border-bottom:none}
.rg-rule{padding:7px 10px;border-bottom:1px solid #161c2a;font-size:11.5px}
.rg-rule:last-child{border-bottom:none}
.rg-note{color:#5C6678;font-size:11px;line-height:1.6}
.rg-lad{font-family:ui-monospace,Consolas,monospace;color:#9aa3b8;font-size:11px}
.rg-exp{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.rg-exp-row{display:flex;gap:8px;padding:5px 10px;border-bottom:1px solid #161c2a;font-size:11.5px;align-items:baseline}
.rg-exp-row:last-child{border-bottom:none}
.rg-exp-tok{font-family:ui-monospace,Consolas,monospace;color:#9f9af0;white-space:nowrap;min-width:80px}
.rg-exp-mean{color:#c9cede;word-break:break-all}
`

type Tab = 'test' | 'redos' | 'explain' | 'replace'

export default function RegexDeskPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('test')
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')
  const [replacement, setReplacement] = useState('')
  const [ran, setRan] = useState(0)

  const state = useMemo<PanelState | null>(() => {
    // ran 作依赖触发重算（run 按钮语义，避免输入中频繁同步执行不可中断的正则）
    if (!ran) return null
    if (!pattern) return { kind: 'error', message: '缺少 pattern' }
    if (tab === 'test') {
      const r = core.runMatch(pattern, flags, text)
      return r.ok ? { kind: 'test', r } : { kind: 'error', message: String(r.error) }
    }
    if (tab === 'redos') {
      const r = core.analyzeRedos(pattern, flags)
      return r.ok ? { kind: 'redos', r } : { kind: 'error', message: String(r.error) }
    }
    if (tab === 'explain') {
      const r = core.explain(pattern, flags)
      return r.ok ? { kind: 'explain', r } : { kind: 'error', message: String(r.error) }
    }
    const r = core.runReplace(pattern, flags, replacement, text)
    return r.ok ? { kind: 'replace', r } : { kind: 'error', message: String(r.error) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ran, tab])

  const canRun = !!pattern && (tab !== 'test' && tab !== 'replace' ? true : !!text)

  return (
    <div className="rg-root">
      <style>{CSS}</style>
      <div className="rg-head">
        <b>正则调试台</b>
        <span className="sub">JS RegExp 真实语义 · ReDoS 检测 · 纯本地 · 文本不出本机</span>
      </div>
      <div className="rg-body">
        <div className="rg-tabs">
          {(['test', 'redos', 'explain', 'replace'] as Tab[]).map((t) => (
            <button key={t} className={`rg-tab ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); setRan(0) }}>
              {t === 'test' ? '测试' : t === 'redos' ? 'ReDoS' : t === 'explain' ? '解释' : '替换'}
            </button>
          ))}
        </div>

        <div className="rg-row">
          <input
            className="rg-input rg-pattern"
            placeholder="正则（不带两侧斜杠），如 (?<user>[\w.-]+)@[\w.]+"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          />
          <input
            className="rg-input rg-flags"
            placeholder="flags"
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
          />
          <button className="rg-btn" disabled={!canRun} onClick={() => setRan(ran + 1)}>执行</button>
        </div>

        {(tab === 'test' || tab === 'replace') && (
          <textarea
            className="rg-area"
            placeholder="样本文本……"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {tab === 'replace' && (
          <input
            className="rg-input rg-pattern"
            placeholder={`替换串（支持 $1、$<name>）`}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        )}

        {state && state.kind === 'error' && <div className="rg-err">✖ {state.message}</div>}

        {state && state.kind === 'test' && (() => {
          const r = state.r
          return (
            <>
              <div className="rg-note">匹配 {r.matchCount} 处 · 耗时 {r.elapsedMs}ms{r.truncated ? `（明细截断 ${core.MAX_MATCHES} 条）` : ''}{r.singleNote ? ' · ' + r.singleNote : ''}</div>
              {r.matches.length > 0 && (
                <div className="rg-hl">
                  {highlight(text, r.matches)}
                </div>
              )}
              {r.matches.length > 0 && (
                <div className="rg-finds">
                  <table>
                    <thead>
                      <tr><th>位置</th><th>匹配</th><th>捕获组</th><th>命名组</th></tr>
                    </thead>
                    <tbody>
                      {r.matches.slice(0, 50).map((m: any, i: number) => (
                        <tr key={i}>
                          <td>{m.index}..{m.end}</td>
                          <td>{JSON.stringify(m.text)}</td>
                          <td>{m.groups.length ? m.groups.map((g: string | null) => (g === null ? '∅' : JSON.stringify(g))).join(', ') : '—'}</td>
                          <td>{m.named && Object.keys(m.named).length ? JSON.stringify(m.named) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        })()}

        {state && state.kind === 'redos' && (() => {
          const r = state.r
          return (
            <>
              <div className={`rg-verdict ${r.verdict}`}>
                <b>{core.VERDICT_LABELS[r.verdict]}</b>（{r.verdict}）· 静态命中 {r.rules.length} 条{r.timing ? ` · 阶梯实测 ${r.timing.ladder.length} 档` : ''}
              </div>
              {r.rules.map((rule: any, i: number) => (
                <div className="rg-rule" key={i}>[{rule.level}] {rule.id}{rule.hits > 1 ? ` ×${rule.hits}` : ''} —— {rule.desc}（形态 {rule.pattern}）</div>
              ))}
              {r.timing && (
                <div className="rg-lad">
                  阶梯（输入长度 a×n+b → 耗时）：{r.timing.ladder.map((l: any) => `n=${l.n}:${l.ms}ms${l.growth > 1 ? `×${l.growth}` : ''}`).join(' → ')}
                </div>
              )}
              {r.notes.map((n: string, i: number) => <div className="rg-note" key={i}>{n}</div>)}
            </>
          )
        })()}

        {state && state.kind === 'explain' && (
          <div className="rg-exp">
            {state.r.items.map((it: any, i: number) => (
              <div className="rg-exp-row" key={i} style={{ paddingLeft: 10 + it.depth * 16 }}>
                <span className="rg-exp-tok">{JSON.stringify(it.raw)}</span>
                <span className="rg-exp-mean">{it.meaning}</span>
              </div>
            ))}
          </div>
        )}

        {state && state.kind === 'replace' && (
          <>
            <div className="rg-note">替换 {state.r.replaceCount} 处，结果：</div>
            <div className="rg-hl">{state.r.result}</div>
          </>
        )}

        {tab === 'redos' && !state && (
          <div className="rg-note">输入正则后点「执行」。检测 = 静态模式识别（有限规则，可能漏报）+ 静态可疑时输入长度阶梯真实计时复核；同步 RegExp 无法中断，故阶梯只对静态可疑者进行且设耗时上限。</div>
        )}
      </div>
    </div>
  )
}

/** 匹配高亮：按 matches 切片，命中段包 <mark> */
function highlight(text: string, matches: Array<{ index: number; end: number }>) {
  const out: any[] = []
  let pos = 0
  for (let i = 0; i < matches.length && i < 200; i++) {
    const m = matches[i]
    if (m.index > pos) out.push(text.slice(pos, m.index))
    out.push(<mark key={i}>{m.end > m.index ? text.slice(m.index, m.end) : '⌀'}</mark>)
    pos = Math.max(pos, m.end)
    if (m.end === m.index) pos = m.index + 1 // 零宽匹配推进，避免原地循环
  }
  if (pos < text.length) out.push(text.slice(pos))
  return out
}
