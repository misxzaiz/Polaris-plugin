/**
 * 文本分流台面板：模板编辑 → 粘文本即跑 → 结论/字段/证据链四段视图。
 * 引擎复用 shared/triage-core.js（与 MCP 同一权威）；模板持久化经宿主 invoke
 * 通道直达 cap.kv（自建索引键，与 MCP 同一事实库）。
 *
 * 类型说明：core 是 CJS 纯 JS，allowJs 推断的双分支返回无法按 ok 收窄
 * （cron-lens 实证坑）——这里在消费侧定形成功分支形状，收窄后 cast，运行时零成本。
 */
import { useCallback, useEffect, useState } from 'react'
import * as core from '../shared/triage-core.js'
import { BUILTIN_PIPELINES } from '../shared/presets.js'
import { kvGet, kvSet, kvDel } from './host'

const INDEX_KEY = 'text-triage:index'
const PIPE_PREFIX = 'text-triage:pipe:'

interface FieldMeta { raw: unknown; value: unknown; type: string; ok: boolean; warn: string | null }
interface Warning { level: string; msg: string }
interface Decision { verdict: string; severity?: string; label?: string; route?: string; note?: string; source: string; reason: string }
interface TraceStep {
  step: 'classify' | 'extract' | 'decide'
  classId?: string; pattern?: string; hit?: boolean; evidence?: string | null
  field?: string; ok?: boolean; raw?: unknown; value?: unknown; warn?: string | null
  list?: string; index?: number; when?: unknown; matched?: boolean; reason?: string
}
interface RunOkResult {
  ok: true
  warnings: Warning[]
  classId: string
  className: string
  classifyEvidence: string | null
  classifyPattern: string | null
  fields: Record<string, unknown>
  fieldMeta: Record<string, FieldMeta>
  decision: Decision
  trace: TraceStep[]
}

const CSS = `
.tt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tt-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tt-head b{font-size:13px}
.tt-head .sub{color:#5C6678;font-size:11px}
.tt-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.tt-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tt-btn{width:auto;padding:6px 14px;cursor:pointer;background:#1a2030;color:#E6EAF2;border:1px solid #2b3348;border-radius:8px;font-size:12px}
.tt-btn:hover{border-color:#4fd1a0}
.tt-btn.primary{border-color:#4fd1a0;color:#4fd1a0}
.tt-btn.danger{color:#f1a0a0;padding:3px 7px}
.tt-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.tt-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.tt-name{width:180px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;outline:none}
.tt-name:focus{border-color:#4fd1a0}
.tt-area{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;outline:none;box-sizing:border-box}
.tt-area:focus{border-color:#4fd1a0}
.tt-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0;white-space:pre-wrap}
.tt-ok{border-radius:8px;padding:8px 13px;font-size:12px;border:1px solid #2e5e4e;background:#12241d;color:#4fd1a0}
.tt-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.tt-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.tt-verdict{padding:12px 14px;font-size:15px;font-weight:600;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.tt-verdict .sev{font-size:11px;padding:2px 8px;border-radius:10px;border:1px solid}
.tt-p0{color:#f1a0a0;border-color:#e03131}.tt-p1{color:#f3b377;border-color:#9a6b2f}
.tt-p2{color:#e7d06a;border-color:#8a7a2f}.tt-p3{color:#8B94A9;border-color:#3a4358}
.tt-verdict .meta{font-size:11px;color:#5C6678;font-weight:400}
.tt-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.tt-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.tt-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.tt-tbl .miss{color:#f1a0a0}
.tt-line{padding:6px 12px;font-size:12px;color:#c9cede}
.tt-line .k{color:#8B94A9}
.tt-warnitem{padding:4px 12px;font-size:11.5px;color:#f3b377}
.tt-infoitem{padding:4px 12px;font-size:11.5px;color:#8B94A9}
.tt-trace{padding:6px 12px;font:11px/1.8 ui-monospace,Consolas,monospace;color:#8B94A9;white-space:pre-wrap}
.tt-note{color:#5C6678;font-size:11px}
details.tt-fold summary{cursor:pointer;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;background:#1a2030;outline:none}
`

const SEV_CLASS: Record<string, string> = { P0: 'tt-p0', P1: 'tt-p1', P2: 'tt-p2', P3: 'tt-p3' }

interface SavedItem { name: string; from: 'builtin' | 'saved' | 'dangling' }

export default function TextTriagePanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [pipelineJson, setPipelineJson] = useState(() => JSON.stringify(BUILTIN_PIPELINES[0].pipeline, null, 2))
  const [pipeName, setPipeName] = useState('log-triage')
  const [text, setText] = useState('')
  const [submittedText, setSubmittedText] = useState('')
  // 最小状态形状：ok/error 供分支判断；成功分支字段经 RunOkResult cast 访问
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savedList, setSavedList] = useState<SavedItem[]>([])
  const [kvDown, setKvDown] = useState('')

  const refreshList = useCallback(async () => {
    try {
      const index = await kvGet<string[]>(INDEX_KEY)
      const names = Array.isArray(index) ? index : []
      setSavedList(names.map((n) => ({ name: n, from: 'saved' as const })))
      setKvDown('')
    } catch (e) {
      setKvDown(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { void refreshList() }, [refreshList])

  function runNow() {
    setNotice('')
    const submitted = text
    setSubmittedText(submitted)
    try {
      const pipeline = JSON.parse(pipelineJson)
      const r = core.runPipeline(pipeline, submitted)
      if (!r.ok) { setError(r.error || '模板非法'); setResult(null); return }
      setError('')
      setResult(r)
    } catch (e) {
      setError(`模板 JSON 解析失败：${e instanceof Error ? e.message : String(e)}`)
      setResult(null)
    }
  }

  function validateNow() {
    setNotice('')
    try {
      const pipeline = JSON.parse(pipelineJson)
      const v = core.validatePipeline(pipeline)
      if (!v.ok) { setError(`模板非法：${v.error}`); return }
      setError('')
      const info = core.describePipeline(pipeline)
      const warns = (v.warnings || []).map((w) => `ℹ ${w.msg}`).join('\n')
      setNotice(`模板合法：${info}${warns ? `\n${warns}` : ''}`)
    } catch (e) {
      setError(`模板 JSON 解析失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function saveNow() {
    setNotice('')
    setError('')
    try {
      const pipeline = JSON.parse(pipelineJson)
      const v = core.validatePipeline(pipeline)
      if (!v.ok) { setError(`模板非法：${v.error}`); return }
      const name = pipeName.trim()
      await kvSet(PIPE_PREFIX + name, pipeline)
      // 先写模板数据后写索引：索引永不指向缺失数据
      const index = await kvGet<string[]>(INDEX_KEY)
      const next = Array.isArray(index) ? index.filter((x) => x !== name) : []
      next.push(name)
      await kvSet(INDEX_KEY, next)
      setNotice(`已保存「${name}」到宿主 kv`)
      await refreshList()
    } catch (e) {
      setError(`保存失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function loadSaved(name: string) {
    setNotice('')
    setError('')
    try {
      const p = await kvGet<unknown>(PIPE_PREFIX + name)
      if (!p) { setError(`模板「${name}」数据缺失（索引悬空）`); return }
      setPipelineJson(JSON.stringify(p, null, 2))
      setPipeName(name)
    } catch (e) {
      setError(`读取失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function deleteSaved(name: string) {
    setNotice('')
    setError('')
    try {
      await kvDel(PIPE_PREFIX + name)
      const index = await kvGet<string[]>(INDEX_KEY)
      const next = (Array.isArray(index) ? index : []).filter((x) => x !== name)
      await kvSet(INDEX_KEY, next)
      setNotice(`已删除「${name}」`)
      await refreshList()
    } catch (e) {
      setError(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function loadBuiltin(name: string) {
    const b = BUILTIN_PIPELINES.find((x) => x.name === name)
    if (!b) return
    setPipelineJson(JSON.stringify(b.pipeline, null, 2))
    setPipeName(b.name)
    setNotice(`已载入内置预设「${b.name}」：${b.description}`)
  }

  // 收窄：仅成功分支进入结果视图（形状见 RunOkResult）
  const okResult = result && result.ok ? (result as unknown as RunOkResult) : null
  const sev = okResult ? okResult.decision.severity : undefined

  function traceLine(t: TraceStep, i: number): string {
    if (t.step === 'classify') {
      return `[${i}] 分类 ${t.classId} ← ${t.pattern}：${t.hit ? `命中「${t.evidence}」` : '未命中'}`
    }
    if (t.step === 'extract') {
      return `[${i}] 抽取 ${t.field} ← ${t.pattern}：${t.ok ? `「${String(t.raw)}」→ ${JSON.stringify(t.value)}` : `未抽取（${t.warn || ''}）`}`
    }
    return `[${i}] 决策 ${t.list}${typeof t.index === 'number' && t.index >= 0 ? `[${t.index}]` : ''} ${JSON.stringify(t.when)}：${t.matched ? '命中' : '未命中'}（${t.reason}）`
  }

  return (
    <div className="tt-root">
      <style>{CSS}</style>
      <div className="tt-head">
        <b>文本分流台</b>
        <span className="sub">分类 · 抽取 · 决策 · 证据链 · 模板存宿主 kv</span>
      </div>
      <div className="tt-body">
        {kvDown && <div className="tt-err">宿主 kv 不可达：{kvDown}（运行/校验不依赖持久化，仍可用）</div>}

        <div className="tt-row">
          <span className="tt-note">内置预设：</span>
          {BUILTIN_PIPELINES.map((b) => (
            <button key={b.name} className="tt-chip" onClick={() => loadBuiltin(b.name)} title={b.description}>{b.name}</button>
          ))}
        </div>

        <div className="tt-row">
          <input className="tt-name" placeholder="模板名（保存用）" value={pipeName} onChange={(e) => setPipeName(e.target.value)} />
          <button className="tt-btn" onClick={validateNow}>校验</button>
          <button className="tt-btn primary" onClick={() => void saveNow()}>保存到 kv</button>
          <button className="tt-btn" onClick={() => void refreshList()}>刷新列表</button>
        </div>

        {savedList.length > 0 && (
          <div className="tt-row">
            <span className="tt-note">已保存：</span>
            {savedList.map((s) => (
              <span key={s.name} style={{ display: 'inline-flex', gap: 2 }}>
                <button className="tt-chip" onClick={() => void loadSaved(s.name)}>{s.name}</button>
                <button className="tt-chip tt-btn danger" title="删除" onClick={() => void deleteSaved(s.name)}>×</button>
              </span>
            ))}
          </div>
        )}

        <textarea
          className="tt-area"
          rows={10}
          spellCheck={false}
          placeholder='分流模板 JSON：{"classes":[{"id":"error","anyOf":["ERROR"]}],...}（用上方预设载入起步）'
          value={pipelineJson}
          onChange={(e) => setPipelineJson(e.target.value)}
        />

        <textarea
          className="tt-area"
          rows={6}
          spellCheck={false}
          placeholder="粘贴待分流文本（日志行 / 告警 / 错误报告）……"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runNow() }}
        />

        <div className="tt-row">
          <button className="tt-btn primary" onClick={runNow}>运行分流（Ctrl+Enter）</button>
          {submittedText && <span className="tt-note">已运行 {submittedText.length} 字符</span>}
        </div>

        {error && <div className="tt-err">{error}</div>}
        {notice && <div className="tt-ok" style={{ whiteSpace: 'pre-wrap' }}>{notice}</div>}

        {okResult && (
          <>
            <div className="tt-card">
              <div className={`tt-verdict ${sev ? SEV_CLASS[sev] || 'tt-p3' : 'tt-p3'}`}>
                <span>{okResult.decision.verdict}</span>
                {sev && <span className={`sev ${SEV_CLASS[sev] || 'tt-p3'}`}>{sev}</span>}
                {okResult.decision.route && <span className="meta">route: {okResult.decision.route}</span>}
                {okResult.decision.label && <span className="meta">label: {okResult.decision.label}</span>}
              </div>
              <div className="tt-line">
                <span className="k">类别：</span>{okResult.classId}（{okResult.className}）
                {okResult.classifyPattern !== null && <>｜命中 {okResult.classifyPattern}｜证据「{okResult.classifyEvidence}」</>}
              </div>
              {okResult.decision.note && <div className="tt-line"><span className="k">备注：</span>{okResult.decision.note}</div>}
              <div className="tt-line"><span className="k">决策依据：</span>{okResult.decision.source} —— {okResult.decision.reason}</div>
            </div>

            {Object.keys(okResult.fields).length > 0 && (
              <div className="tt-card">
                <h3>抽取字段</h3>
                <table className="tt-tbl">
                  <thead><tr><th>字段</th><th>值</th><th>类型</th><th>原文</th><th>状态</th></tr></thead>
                  <tbody>
                    {Object.keys(okResult.fields).map((n) => {
                      const m = okResult.fieldMeta[n]
                      return (
                        <tr key={n}>
                          <td>{n}</td>
                          <td className={m.ok ? '' : 'miss'}>{JSON.stringify(okResult.fields[n])}</td>
                          <td>{m.type}</td>
                          <td>{m.raw === null || m.raw === undefined ? '—' : String(m.raw)}</td>
                          <td className={m.ok ? '' : 'miss'}>{m.ok ? '✓' : `✗ ${m.warn || ''}`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {okResult.warnings.length > 0 && (
              <div className="tt-card">
                <h3>警示</h3>
                {okResult.warnings.map((w, i) => (
                  <div key={i} className={w.level === 'warn' ? 'tt-warnitem' : 'tt-infoitem'}>
                    {w.level === 'warn' ? '⚠' : 'ℹ'} {w.msg}
                  </div>
                ))}
              </div>
            )}

            <details className="tt-fold tt-card">
              <summary>证据链 trace（{okResult.trace.length} 步）</summary>
              <div className="tt-trace">
                {okResult.trace.map((t, i) => traceLine(t, i)).join('\n')}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}
