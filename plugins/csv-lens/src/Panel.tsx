/**
 * CSV 检查台面板：粘贴/选文件 → 解析诊断 + 类型推断 + 转换 + 规范化（四页签）。
 * 引擎复用 shared/csv-core.js（与 MCP 同一权威；纯 JS 零依赖，esbuild browser
 * bundle 兼容，纯本地零外联零 kv）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/csv-core.js'
import type { ColumnInfo, CsvIssue } from '../shared/csv-core.js'

const CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-tabs{display:flex;gap:6px;padding:8px 13px 0}
.cl-tab{background:#161c2a;border:1px solid #2b3348;border-radius:6px 6px 0 0;color:#8B94A9;font-size:12px;padding:5px 14px;cursor:pointer}
.cl-tab.on{color:#E6EAF2;border-bottom-color:transparent;background:#1a2030}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.cl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none;box-sizing:border-box}
.cl-input:focus{border-color:#4fd1a0}
.cl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cl-btn{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#c9cede;font-size:12px;padding:5px 14px;cursor:pointer}
.cl-btn.on{border-color:#4fd1a0;color:#4fd1a0}
.cl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.cl-warn{border-radius:8px;padding:8px 13px;font-size:12px;border:1px solid #8a6d3b;background:#241d0f;color:#f3b377}
.cl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.cl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap;position:sticky;top:0;background:#1a2030}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;max-width:340px}
.cl-tbl td.num{text-align:right}
.cl-issue{padding:4px 12px;font-size:11.5px;border-bottom:1px solid #161c2a;display:flex;gap:8px}
.cl-issue .sev{min-width:40px}
.cl-pre{margin:0;padding:10px 13px;font:11.5px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede;max-height:420px;overflow:auto}
.cl-badge{font-size:10.5px;border-radius:10px;padding:1px 8px;border:1px solid #2b3348;color:#8B94A9}
.cl-badge.num{color:#4fd1a0;border-color:#2b5a4a}
.cl-badge.mixed{color:#f3b377;border-color:#5a4a2b}
`

type Issue = CsvIssue
type Col = ColumnInfo

const TYPE_COLOR: Record<string, string> = {
  int: '#4fd1a0', float: '#4fd1a0', bool: '#6ea8fe', date: '#c792ea',
  string: '#c9cede', mixed: '#f3b377', empty: '#5C6678',
}

function badgeFor(t: string) {
  const color = TYPE_COLOR[t] || '#8B94A9'
  const cls = t === 'mixed' ? ' mixed' : (t === 'int' || t === 'float') ? ' num' : ''
  return <span className={'cl-badge' + cls} style={{ color, borderColor: t === 'mixed' ? '#5a4a2b' : undefined }}>{t}</span>
}

export default function CsvLensPanel(props: { pluginId?: string; onSendToChat?: (m: string) => void; initialText?: string }) {
  const [text, setText] = useState(props.initialText || '')
  const [submitted, setSubmitted] = useState(props.initialText || '')
  const [delim, setDelim] = useState('auto')
  const [tab, setTab] = useState<'parse' | 'infer' | 'convert' | 'normalize'>('parse')
  const [fmt, setFmt] = useState<'json_records' | 'json_rows' | 'sql' | 'markdown'>('json_records')
  const [tableName, setTableName] = useState('my_table')
  const [copied, setCopied] = useState('')

  const parsed = useMemo(() => {
    if (!submitted) return null
    return core.parseCsv(submitted, { delimiter: delim === 'auto' ? undefined : delim === '\\t' ? '\t' : delim })
  }, [submitted, delim])

  const infer = useMemo(() => {
    if (!parsed || !parsed.ok) return null
    return core.inferColumns(parsed.rows)
  }, [parsed])

  const converted = useMemo(() => {
    if (!parsed || !parsed.ok) return null
    if (fmt === 'json_records') return core.toJson(parsed.rows, 'records')
    if (fmt === 'json_rows') return core.toJson(parsed.rows, 'rows')
    if (fmt === 'sql') return core.toSql(parsed.rows, { tableName })
    return core.toMarkdown(parsed.rows)
  }, [parsed, fmt, tableName])

  const normalized = useMemo(() => {
    if (!parsed || !parsed.ok) return null
    return core.serialize(parsed.rows)
  }, [parsed])

  const statsLine = useMemo(() => {
    if (!parsed || !parsed.ok) return ''
    const le = parsed.stats.lineEndings
    const leStr = [`CRLF×${le.crlf}`, `LF×${le.lf}`, `CR×${le.cr}`].filter((s) => !s.endsWith('×0')).join(' + ')
    return `数据行 ${parsed.stats.dataRows} · 列 ${parsed.stats.cols} · 分隔符「${parsed.delimiter === '\t' ? '\\t' : parsed.delimiter}」 · 换行 ${leStr || '—'} · ${parsed.stats.hadBom ? '有 BOM' : '无 BOM'} · 空行 ${parsed.stats.emptyLines}`
  }, [parsed])

  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      window.setTimeout(() => setCopied(''), 1500)
    }, () => { setCopied('') })
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { setText(''); setSubmitted(''); alert('文件超过 10MB 上限'); return }
    const reader = new FileReader()
    reader.onload = () => { setText(String(reader.result || '')); setSubmitted(String(reader.result || '')) }
    reader.readAsText(f, 'utf-8')
  }

  const sevColor: Record<string, string> = { error: '#f1a0a0', warn: '#f3b377', info: '#5C6678' }

  return (
    <div className="cl-root">
      <style>{CSS}</style>
      <div className="cl-head">
        <b>CSV 检查台</b>
        <span className="sub">RFC 4180 状态机 · 方言诊断 · 类型推断 · 转换 · 纯本地</span>
      </div>

      <div className="cl-body" style={{ paddingBottom: 0 }}>
        <textarea
          className="cl-input"
          style={{ minHeight: 92, resize: 'vertical' }}
          placeholder={'粘贴 CSV：\nname,qty,price\n"零件 A,含逗号",3,"1,299.00"\n"多行\n字段",1,42'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="cl-row">
          <button className="cl-btn" onClick={() => setSubmitted(text)}>解析（或 Ctrl+Enter）</button>
          <label className="cl-btn" style={{ display: 'inline-block' }}>
            选文件<input type="file" accept=".csv,.tsv,.txt,text/csv" style={{ display: 'none' }} onChange={onFile} />
          </label>
          {(['auto', ',', ';', '\\t', '|'] as const).map((d) => (
            <button key={d} className={'cl-btn' + (delim === d ? ' on' : '')} onClick={() => setDelim(d)}>
              {d === 'auto' ? '自动' : d === '\\t' ? 'Tab' : d}
            </button>
          ))}
          {submitted && <button className="cl-btn" onClick={() => { setText(''); setSubmitted('') }}>清空</button>}
        </div>
        {parsed && parsed.ok && <div className="cl-note">{statsLine}</div>}
        {parsed && parsed.ok && (parsed.stats.cols > 0 || parsed.stats.dataRows > 0) && (
          <div className="cl-tabs">
            {([['parse', '解析诊断'], ['infer', '类型推断'], ['convert', '转换'], ['normalize', '规范化']] as const).map(([k, label]) => (
              <button key={k} className={'cl-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="cl-body" style={{ paddingTop: 0 }}>
        {parsed && !parsed.ok && <div className="cl-err">{parsed.error}</div>}

        {parsed && parsed.ok && (parsed.stats.cols > 0 || parsed.stats.dataRows > 0) && (
          <>
            {tab === 'parse' && (
              <>
                {parsed.issues.length === 0 ? (
                  <div className="cl-note" style={{ padding: '6px 2px' }}>未发现结构问题（引号/换行/列数全部合规）</div>
                ) : (
                  <div className="cl-card">
                    <h3>问题清单（{parsed.issues.length}）</h3>
                    {parsed.issues.map((it: Issue, i: number) => (
                      <div className="cl-issue" key={i} style={{ color: sevColor[it.severity] }}>
                        <span className="sev">{it.severity === 'error' ? '[错误]' : it.severity === 'warn' ? '[警告]' : '[提示]'}</span>
                        <span style={{ color: '#c9cede' }}>{it.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="cl-card">
                  <h3>解析预览（前 50 行 · 引号内换行以 ↵ 显示）</h3>
                  <table className="cl-tbl">
                    <thead><tr>{parsed.header.map((h: string, i: number) => <th key={i}>{h === '' ? `(空)` : h}</th>)}</tr></thead>
                    <tbody>
                      {parsed.rows.slice(1).slice(0, 50).map((r: string[], ri: number) => (
                        <tr key={ri}>
                          {parsed.header.map((_: string, ci: number) => {
                            const v = r[ci] !== undefined ? r[ci] : ''
                            const isNum = infer && infer.ok && infer.columns[ci] && (infer.columns[ci].inferred === 'int' || infer.columns[ci].inferred === 'float')
                            return <td key={ci} className={isNum ? 'num' : ''}>{v.replace(/\n/g, '↵').replace(/\r/g, '')}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const auto = core.detectDelimiter(submitted)
                  if (auto.detected !== parsed.delimiter) {
                    return <div className="cl-warn">⚠ 分隔符自动检测建议「{auto.detected === '\t' ? 'Tab' : auto.detected}」（引号外计数 {Object.entries(auto.counts).map(([k, v]) => `${k === '\t' ? 'Tab' : k}×${v}`).join(' ')}）——若当前列数异常请切换</div>
                    }
                })()}
              </>
            )}

            {tab === 'infer' && infer && infer.ok && (
              <div className="cl-card">
                <h3>逐列类型推断</h3>
                <table className="cl-tbl">
                  <thead><tr><th>#</th><th>列名</th><th>类型</th><th>分布</th><th>空值</th><th>min</th><th>max</th><th>sum</th></tr></thead>
                  <tbody>
                    {infer.columns.map((c: Col) => (
                      <tr key={c.index}>
                        <td>{c.index + 1}</td>
                        <td>{c.name === '' ? '(空)' : c.name}</td>
                        <td>{badgeFor(c.inferred)}</td>
                        <td>{Object.entries(c.distribution).map(([k, v]) => `${k}×${v}`).join(' ')}</td>
                        <td>{c.empties}</td>
                        <td className="num">{c.min !== undefined && c.min !== null ? c.min : '—'}</td>
                        <td className="num">{c.max !== undefined && c.max !== null ? c.max : '—'}</td>
                        <td className="num">{c.sum !== undefined && c.min !== null ? c.sum : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'convert' && (
              <>
                <div className="cl-row">
                  {([['json_records', 'JSON(对象)'], ['json_rows', 'JSON(数组)'], ['sql', 'SQL INSERT'], ['markdown', 'Markdown']] as const).map(([k, label]) => (
                    <button key={k} className={'cl-btn' + (fmt === k ? ' on' : '')} onClick={() => setFmt(k)}>{label}</button>
                  ))}
                  {fmt === 'sql' && (
                    <input className="cl-input" style={{ width: 160, minHeight: 0 }} value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="表名" />
                  )}
                  {converted && converted.ok && (
                    <button className="cl-btn" onClick={() => copy('conv', converted.output)}>{copied === 'conv' ? '已复制 ✓' : '复制'}</button>
                  )}
                </div>
                {converted && !converted.ok && <div className="cl-err">{converted.error}</div>}
                {converted && converted.ok && (
                  <div className="cl-card">
                    <h3>{fmt} 输出（{converted.output.length} 字符）</h3>
                    <pre className="cl-pre">{converted.output}</pre>
                  </div>
                )}
                {fmt === 'sql' && (
                  <div className="cl-note">SQL 口径：数字/布尔列按类型推断裸值；字符串单引号转义（''）；空串 → NULL；表名/列名双引号转义。</div>
                )}
                {fmt === 'json_records' && converted && converted.ok && converted.renamed && converted.renamed.length > 0 && (
                  <div className="cl-warn">⚠ 重名表头已加后缀：{converted.renamed.map((x: any) => `第${x.index + 1}列「${x.from}」→「${x.to}」`).join('、')}</div>
                )}
              </>
            )}

            {tab === 'normalize' && (
              <>
                <div className="cl-row">
                  {normalized && normalized.ok && <button className="cl-btn" onClick={() => copy('norm', normalized.output)}>{copied === 'norm' ? '已复制 ✓' : '复制'}</button>}
                </div>
                {normalized && normalized.ok && (
                  <div className="cl-card">
                    <h3>规范化 CSV（RFC 4180：CRLF / minimal 引号 / "" 转义）</h3>
                    <pre className="cl-pre">{normalized.output}</pre>
                  </div>
                )}
                <div className="cl-note">规范化产物经 round-trip 自证：再解析字段矩阵与原解析一致才输出（MCP 侧同此不变式，有损即拦截）。</div>
              </>
            )}
          </>
        )}

        {!submitted && (
          <div className="cl-note">
            纯本地解析（零外联零 kv）。粘贴 CSV 或选文件（≤10MB）开始：定位列数漂移行、裸引号、引号后尾随字符、未闭合引号；检测分隔符/换行风格/BOM/方言；逐列类型推断；转 JSON/SQL/Markdown；输出 RFC 4180 规范 CSV。
          </div>
        )}
      </div>
    </div>
  )
}
