/**
 * id-lens 面板:标识符 → 家族识别 + 位段表 + 时间还原 + 规范校验 + 形态转换。
 * 引擎与 MCP 同一权威:shared/id-core.js(零依赖纯函数,可直接进 browser bundle)。
 * 纯本地零外联零 kv。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/id-core.js'

type Seg = { name: string; hi: number; lo: number; value: string; note: string }
type IdError = { code: string; message: string; hint?: string }
type Parsed = {
  ok?: boolean
  family?: string
  shape?: string
  version?: number
  versionNote?: string
  variant?: number
  variantNote?: string
  layout?: string
  epochLabel?: string
  hex128?: string
  hex64?: string
  decimal?: string
  segments?: Seg[]
  fields?: Record<string, string | boolean | null | undefined>
  notes?: string[]
  error?: IdError
}
type ValidateItem = { level: 'error' | 'warn' | 'info'; rule: string; message: string; hint?: string }

const SAMPLES: { label: string; id: string; layout?: 'twitter' | 'discord' }[] = [
  { label: 'UUIDv7(带时间)', id: '01890a5d-ac96-774b-bcce-b302099a8057' },
  { label: 'UUIDv1', id: 'a6b07d06-6dbd-11ed-9a5c-325096b39f47' },
  { label: 'ULID', id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
  { label: 'Discord 雪花', id: '175928847299117063', layout: 'discord' },
  { label: 'Twitter 雪花', id: '853927323615830017' },
  { label: 'braces 形态', id: '{a6b07d06-6dbd-11ed-9a5c-325096b39f47}' },
  { label: '小写 ULID', id: '01arz3ndektsv4rrffq69g5fav' },
  { label: '混淆字母', id: '01ARZ3NDEKTSOV4RRFFQ69G5FAV' },
  { label: '无法识别', id: 'hello-world' },
]

const CONVERT_BTNS = ['canonical', 'uppercase', 'urn', 'braces', 'hyphenless', 'decimal', 'bitstring', 'hex128', 'ulid']

const FAMILY_LABEL: Record<string, string> = { uuid: 'UUID', ulid: 'ULID', snowflake: 'Snowflake 雪花' }
const LEVEL_LABEL: Record<string, string> = { error: '❌错误', warn: '⚠️警告', info: 'ℹ️提示' }
const LEVEL_CLASS: Record<string, string> = { error: 'sev-error', warn: 'sev-warn', info: 'sev-info' }

const CSS = `
.il-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.il-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.il-head b{font-size:13px}
.il-head .sub{color:#5C6678;font-size:11px}
.il-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.il-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.il-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.il-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.il-chip.on{color:#4fd1a0;border-color:#4fd1a0}
.il-gap{flex:1}
.il-area{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12.5px/1.7 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none;resize:vertical}
.il-area:focus{border-color:#4fd1a0}
.il-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.il-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.il-kv{display:flex;gap:10px;flex-wrap:wrap;padding:9px 12px}
.il-kv .k{color:#5C6678;font-size:11px;margin-right:4px}
.il-kv .v{font:12px ui-monospace,Consolas,monospace;color:#c9cede}
.il-kv .v.big{color:#4fd1a0}
.il-pre{margin:0;padding:10px 12px;font:11.5px/1.6 ui-monospace,Consolas,monospace;color:#c9cede;white-space:pre-wrap;word-break:break-all;max-height:380px;overflow:auto}
.il-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.il-err .hint{color:#8B94A9;margin-top:4px;font-size:11.5px}
.il-issue{display:flex;gap:8px;align-items:baseline;padding:7px 12px;border-bottom:1px solid #1c2333}
.il-issue:last-child{border-bottom:none}
.il-issue .badge{font-size:10.5px;border:1px solid #2b3348;border-radius:5px;padding:1px 6px;white-space:nowrap}
.il-issue.sev-error .badge{color:#f1a0a0;border-color:#e03131}
.il-issue.sev-warn .badge{color:#f3b377;border-color:#f08c00}
.il-issue.sev-info .badge{color:#8B94A9;border-color:#3b5bdb}
.il-issue .rule{font:11px ui-monospace,Consolas,monospace;color:#4fd1a0;white-space:nowrap}
.il-issue .msg{font-size:12px;color:#c9cede}
.il-issue .hint{font-size:11px;color:#5C6678}
.il-table{width:100%;border-collapse:collapse;font-size:11.5px}
.il-table th{position:sticky;top:0;background:#1a2030;color:#8B94A9;text-align:left;padding:6px 12px;border-bottom:1px solid #1c2333;font-weight:600}
.il-table td{padding:5px 12px;border-bottom:1px solid #151a26;color:#c9cede;font-family:ui-monospace,Consolas,monospace}
.il-table td.note{font-family:inherit;color:#8B94A9}
.il-conv{display:flex;gap:6px;flex-wrap:wrap;padding:9px 12px}
.il-note{padding:0 12px 9px;color:#8B94A9;font-size:11.5px}
.il-empty{border:1px dashed #2b3348;border-radius:8px;padding:10px 13px;color:#8B94A9;font-size:12px}
`

function familyOf(f?: string) { return f ? FAMILY_LABEL[f] || f : '' }

export default function IdLensPanel(props: { initialText?: string }) {
  const [input, setInput] = useState(props.initialText || '01890a5d-ac96-774b-bcce-b302099a8057')
  const [layout, setLayout] = useState<'twitter' | 'discord'>('twitter')

  const parsed: Parsed = useMemo(() => core.parseId(input, layout === 'discord' ? { layout: 'discord' } : undefined) as Parsed, [input, layout])
  const validation = useMemo(
    () => (parsed.ok ? (core.validateId(input, layout === 'discord' ? { layout: 'discord' } : undefined) as { ok: boolean; items: ValidateItem[] }) : null),
    [parsed, input, layout],
  )

  const fields = parsed.ok ? parsed.fields || {} : {}
  const segs = parsed.ok ? parsed.segments || [] : []
  const notes = parsed.ok ? parsed.notes || [] : []

  return (
    <div className="il-root">
      <style>{CSS}</style>
      <div className="il-head">
        <b>id-lens 标识符调试台</b>
        <span className="sub">UUID / ULID / Snowflake 位域看穿(纯本地解析)</span>
        <span style={{ flex: 1 }} />
        <span className="sub">雪花纪元</span>
        {(['twitter', 'discord'] as const).map((l) => (
          <button key={l} className={'il-chip' + (layout === l ? ' on' : '')} onClick={() => setLayout(l)}>
            {l}
          </button>
        ))}
      </div>
      <div className="il-body">
        <div className="il-chips">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              className={'il-chip' + (input === s.id ? ' on' : '')}
              onClick={() => { setInput(s.id); if (s.layout) setLayout(s.layout) }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <textarea
          className="il-area"
          rows={2}
          value={input}
          placeholder="粘进任意 UUID / ULID / Snowflake 雪花 ID(canonical、{braces}、urn:uuid:、无连字符、纯数字均可)"
          onChange={(e) => setInput(e.target.value)}
        />

        {!input.trim() ? (
          <div className="il-empty">等待输入:粘贴一个标识符,自动识别家族并展开位域。</div>
        ) : !parsed.ok ? (
          <div className="il-err">
            <div style={{ fontWeight: 600 }}>识别失败:{parsed.error?.message}</div>
            {parsed.error?.hint ? <div className="hint">{parsed.error.hint}</div> : null}
          </div>
        ) : (
          <>
            <div className="il-card">
              <h3>识别</h3>
              <div className="il-kv">
                <span><span className="k">家族</span><span className="v big">{familyOf(parsed.family)}</span></span>
                {parsed.version !== undefined && (
                  <span><span className="k">版本</span><span className="v">{parsed.version}</span></span>
                )}
                {parsed.variant !== undefined && (
                  <span><span className="k">变体</span><span className="v">{parsed.variant}({parsed.variantNote})</span></span>
                )}
                {parsed.layout && <span><span className="k">纪元</span><span className="v">{parsed.layout}</span></span>}
                {fields.time ? <span><span className="k">时间还原</span><span className="v big">{String(fields.time)}{fields.dow ? '(' + String(fields.dow) + ')' : ''}</span></span> : null}
                {fields.epochMs ? <span><span className="k">Unix 毫秒</span><span className="v">{String(fields.epochMs)}</span></span> : null}
              </div>
              {parsed.versionNote ? <div className="il-note">{parsed.versionNote}</div> : null}
              {notes.length > 0 && <div className="il-note">{notes.map((n, i) => <div key={i}>· {n}</div>)}</div>}
            </div>

            <div className="il-card">
              <h3>位段(高 → 低)</h3>
              <table className="il-table">
                <thead><tr><th>位段</th><th>位号</th><th>值</th><th>含义</th></tr></thead>
                <tbody>
                  {segs.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td>{s.hi}..{s.lo}</td>
                      <td>{s.value}</td>
                      <td className="note">{s.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {validation && validation.items.length > 0 && (
              <div className="il-card">
                <h3>规范性校验({validation.items.length} 条)</h3>
                {validation.items.map((it, i) => (
                  <div key={i} className={'il-issue ' + (LEVEL_CLASS[it.level] || '')}>
                    <span className="badge">{LEVEL_LABEL[it.level] || it.level}</span>
                    <span className="rule">{it.rule}</span>
                    <span>
                      <span className="msg">{it.message}</span>
                      {it.hint ? <div className="hint">{it.hint}</div> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="il-card">
              <h3>形态转换</h3>
              <div className="il-conv">
                {CONVERT_BTNS.map((t) => {
                  const r = core.convertId(input, t, layout === 'discord' ? { layout: 'discord' } : undefined) as { ok: boolean; value?: string; notes?: string[]; error?: IdError }
                  return (
                    <div key={t} style={{ width: '100%' }}>
                      <span className="k" style={{ color: '#5C6678', fontSize: 11 }}>{t}</span>
                      {' '}
                      {r.ok ? (
                        <span className="v" style={{ fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 12, color: '#c9cede', wordBreak: 'break-all' }}>
                          {String(r.value).length > 160 ? String(r.value).slice(0, 160) + '…' : String(r.value)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11.5, color: '#8B94A9' }}>{r.error?.message}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
