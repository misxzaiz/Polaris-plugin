/**
 * Panel.tsx —— 自动化流水线面板
 *
 * 布局：左侧管道列表 + 右侧（流水线定义 / 运行记录）双 Tab + 设置弹窗。
 * 数据面：127.0.0.1 直连服务（model.ts）；运行中 1s 轮询。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, blankPipeline, MASK, presets, SvcError } from './model'
import type { Pipeline, PipelineSummary, RunRecord, Settings, Step } from './model'
import { restartService } from './host'
import { Dot, durStr, Field, PanelStyle, statusColor, timeStr, triggerText } from './ui'
import StepForm from './StepForm'

const PLUGIN_ID = 'flow-pipeline'
const SERVICE_ID = 'flow-pipeline-service'

type Tab = 'def' | 'runs'

export default function Panel({ pluginId, onSendToChat }: {
  pluginId?: string
  onSendToChat?: (msg: string) => void | Promise<void>
}): JSX.Element {
  const [svcDown, setSvcDown] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [list, setList] = useState<PipelineSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('def')
  const [draft, setDraft] = useState<Pipeline | null>(null)
  const [savedDef, setSavedDef] = useState<Pipeline | null>(null)
  const [dirty, setDirty] = useState(false)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [openRun, setOpenRun] = useState<RunRecord | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [runParams, setRunParams] = useState('{}')
  const [confirmDelete, setConfirmDelete] = useState('')
  const pollRef = useRef<number | null>(null)

  const refreshList = useCallback(async (keepSelection = true) => {
    try {
      const r = await api.listPipelines()
      setList(r.pipelines)
      setDegraded(Boolean(r.degraded))
      setSvcDown(null)
      setSelectedId((cur) => {
        if (keepSelection && cur && r.pipelines.some((p) => p.id === cur)) return cur
        return r.pipelines.length ? r.pipelines[0].id : null
      })
    } catch (e) {
      setSvcDown((e as Error).message)
    }
  }, [])

  const loadPipeline = useCallback(async (id: string) => {
    try {
      const r = await api.getPipeline(id)
      setSavedDef(r.pipeline)
      setDraft(JSON.parse(JSON.stringify(r.pipeline)))
      setDirty(false)
      setRuns(r.runs || [])
      setTab('def')
      setOpenRun(null)
      setConfirmDelete('')
    } catch (e) {
      setBanner({ kind: 'err', text: (e as Error).message })
    }
  }, [])

  const refreshRuns = useCallback(async (plId: string) => {
    try {
      const r = await api.listRuns(plId, 15)
      setRuns(r.runs || [])
    } catch (_) { /* 降级时无历史 */ }
  }, [])

  useEffect(() => { refreshList(false) }, [refreshList])

  useEffect(() => {
    if (selectedId) loadPipeline(selectedId)
  }, [selectedId, loadPipeline])

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => { /* 服务未起 */ })
  }, [svcDown])

  // 有进行中的运行 → 1s 轮询
  const activeRun = runs.find((r) => r.status === 'queued' || r.status === 'running')
  useEffect(() => {
    if (!selectedId) return
    if (activeRun || (tab === 'runs' && runs.length === 0)) {
      pollRef.current = window.setTimeout(() => refreshRuns(selectedId), 1200)
    }
    return () => { if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null } }
  }, [activeRun, selectedId, tab, runs.length, refreshRuns])

  function patchDraft(patch: Partial<Pipeline>) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setDirty(true)
  }

  function patchStep(i: number, patch: Partial<Step>) {
    setDraft((d) => {
      if (!d) return d
      const steps = d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s))
      return { ...d, steps }
    })
    setDirty(true)
  }

  function moveStep(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d
      const j = i + dir
      if (j < 0 || j >= d.steps.length) return d
      const steps = [...d.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...d, steps }
    })
    setDirty(true)
  }

  async function saveDraft() {
    if (!draft) return
    try {
      const clean = JSON.parse(JSON.stringify(draft))
      if (clean.id) {
        const r = await api.updatePipeline(clean.id, clean)
        setSavedDef(r.pipeline)
        setDraft(JSON.parse(JSON.stringify(r.pipeline)))
      } else {
        const r = await api.createPipeline(clean)
        setSavedDef(r.pipeline)
        setDraft(JSON.parse(JSON.stringify(r.pipeline)))
      }
      setDirty(false)
      setBanner({ kind: 'ok', text: '已保存' })
      refreshList()
      window.setTimeout(() => setBanner(null), 1800)
    } catch (e) {
      setBanner({ kind: 'err', text: (e as Error).message })
    }
  }

  async function doDelete() {
    if (!draft?.id) return
    if (confirmDelete !== draft.name) {
      setBanner({ kind: 'err', text: `确认词不匹配：需输入流水线名称「${draft.name}」` })
      return
    }
    try {
      await api.deletePipeline(draft.id, confirmDelete)
      setBanner({ kind: 'ok', text: '已删除' })
      setConfirmDelete('')
      setSelectedId(null)
      refreshList(false)
    } catch (e) {
      setBanner({ kind: 'err', text: (e as Error).message })
    }
  }

  async function doRun() {
    if (!draft?.id) { setBanner({ kind: 'err', text: '请先保存流水线再运行' }); return }
    let params: unknown = {}
    try { params = JSON.parse(runParams || '{}') } catch (_) { setBanner({ kind: 'err', text: '运行参数不是合法 JSON' }); return }
    try {
      await api.runPipeline(draft.id, params)
      setTab('runs')
      refreshRuns(draft.id)
    } catch (e) {
      setBanner({ kind: 'err', text: (e as Error).message })
    }
  }

  async function openRunDetail(runId: string) {
    try {
      const r = await api.getRun(runId)
      setOpenRun(r.run)
    } catch (e) {
      setBanner({ kind: 'err', text: (e as Error).message })
    }
  }

  function newFromPreset(make: () => Pipeline) {
    setDraft(make())
    setSavedDef(null)
    setDirty(true)
    setShowNew(false)
  }

  const selected = list.find((p) => p.id === selectedId) || null

  return (
    <div className="flowpipe-panel">
      <PanelStyle />
      <div className="fp-header">
        <span className="fp-title">自动化流水线</span>
        <Dot color={svcDown ? '#F87171' : degraded ? '#FBBF24' : '#34D399'} />
        <span className="fp-muted" style={{ fontSize: 11 }}>{svcDown ? '服务未连接' : degraded ? 'kv 桥降级' : '服务正常'}</span>
        <button className="small" onClick={async () => {
          try { const r = await api.selftest(); setBanner({ kind: r.ok ? 'ok' : 'err', text: r.ok ? '自检全部通过' : '自检存在失败项（看日志）' }) }
          catch (e) { setBanner({ kind: 'err', text: (e as Error).message }) }
          window.setTimeout(() => setBanner(null), 2500)
        }}>自检</button>
        <button className="small" onClick={() => setShowSettings(true)}>设置</button>
        <button className="small" onClick={async () => {
          try { await restartService(PLUGIN_ID, SERVICE_ID); invalidateMetaAndReload() } catch (e) { setBanner({ kind: 'err', text: (e as Error).message }) }
        }}>重启服务</button>
      </div>

      {svcDown && (
        <div style={{ padding: '6px 12px', background: '#2A1B1E', borderBottom: '1px solid #7F1D1D', color: '#FCA5A5', fontSize: 12 }}>
          {svcDown}
          <button className="small" style={{ marginLeft: 8 }} onClick={() => { invalidateMetaAndReload(); refreshList() }}>重试</button>
        </div>
      )}
      {banner && (
        <div style={{ padding: '6px 12px', background: banner.kind === 'err' ? '#2A1B1E' : '#12291D', borderBottom: `1px solid ${banner.kind === 'err' ? '#7F1D1D' : '#14532D'}`, color: banner.kind === 'err' ? '#FCA5A5' : '#6EE7B7', fontSize: 12 }}>
          {banner.text}
        </div>
      )}

      <div className="fp-body">
        <div className="fp-side">
          <div style={{ padding: 8, borderBottom: '1px solid #2A2F36', display: 'flex', gap: 6 }}>
            <button className="primary" style={{ flex: 1 }} onClick={() => setShowNew(true)}>+ 新建</button>
          </div>
          <div className="fp-side-list">
            {list.length === 0 && !svcDown && <div className="fp-muted" style={{ padding: 10, fontSize: 12 }}>还没有流水线。点「+ 新建」从模板开始，或直接在聊天里对 AI 说「帮我建一条流水线…」。</div>}
            {list.map((p) => (
              <div key={p.id} className={`fp-pl-item ${p.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(p.id)}>
                <div className="fp-pl-name">
                  <Dot color={p.lastRun ? statusColor(p.lastRun.status) : '#4B5563'} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span className={`fp-chip ${p.enabled ? 'on' : ''}`}>{p.enabled ? '启用' : '停用'}</span>
                </div>
                <div className="fp-pl-sub">
                  <span>{triggerText(p.trigger)}</span>
                  <span>{p.steps} 步</span>
                  {p.lastRun && <span style={{ marginLeft: 'auto' }}>{timeStr(p.lastRun.startedAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="fp-main">
          {!draft ? (
            <div className="fp-empty">
              <div style={{ fontSize: 30 }}>⚡</div>
              <div>选中左侧流水线，或新建一条</div>
              <div className="fp-muted" style={{ fontSize: 12 }}>
                思路：抓数据(HTTP) → 提取(extract) → AI 分析(ai) → 落盘(file)/通知(notify)<br />
                触发：手动 / 每 N 分钟 / 每天 HH:MM / Webhook 入站
              </div>
              {onSendToChat && (
                <button className="small" onClick={() => onSendToChat('帮我用「自动化流水线」插件建一条流水线：')}>让 AI 帮我建</button>
              )}
            </div>
          ) : (
            <>
              <div className="fp-tabs">
                <div className={`fp-tab ${tab === 'def' ? 'active' : ''}`} onClick={() => setTab('def')}>流水线定义{dirty ? ' ●' : ''}</div>
                <div className={`fp-tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => { setTab('runs'); if (draft.id) refreshRuns(draft.id) }}>运行记录</div>
              </div>
              <div className="fp-scroll">
                {tab === 'def' && (
                  <Definition
                    draft={draft}
                    savedDef={savedDef}
                    settings={settings}
                    dirty={dirty}
                    confirmDelete={confirmDelete}
                    setConfirmDelete={setConfirmDelete}
                    patchDraft={patchDraft}
                    patchStep={patchStep}
                    moveStep={moveStep}
                    addStep={() => { patchDraft({ steps: [...draft.steps, { type: 'http', name: `步骤 ${draft.steps.length + 1}` }] }) }}
                    removeStep={(i) => { patchDraft({ steps: draft.steps.filter((_, j) => j !== i) }) }}
                    saveDraft={saveDraft}
                    doDelete={doDelete}
                  />
                )}
                {tab === 'runs' && (
                  <RunsTab
                    draft={draft}
                    runs={runs}
                    openRun={openRun}
                    runParams={runParams}
                    setRunParams={setRunParams}
                    setOpenRun={setOpenRun}
                    openRunDetail={openRunDetail}
                    doRun={doRun}
                    stopRun={async (runId) => { try { await api.stopRun(runId); if (draft.id) refreshRuns(draft.id) } catch (e) { setBanner({ kind: 'err', text: (e as Error).message }) } }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showNew && (
        <div className="fp-modal-mask" onClick={() => setShowNew(false)}>
          <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>新建流水线</div>
            <button style={{ width: '100%', marginBottom: 6 }} onClick={() => newFromPreset(blankPipeline)}>空白流水线（含示例 HTTP 步骤）</button>
            {presets().map((p) => (
              <button key={p.label} style={{ width: '100%', marginBottom: 6 }} onClick={() => newFromPreset(p.make)}>{p.label}（模板）</button>
            ))}
            <div className="fp-muted" style={{ fontSize: 12, marginTop: 6 }}>
              也可以在聊天里直接对 AI 说需求（AI 会用 flow_save 帮你建好）。
            </div>
          </div>
        </div>
      )}

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setSettings(s); refreshList() }}
        />
      )}
    </div>
  )
}

function invalidateMetaAndReload() {
  // 动态 import 避免循环；重启服务后 meta 端口可能变化
  import('./model').then((m) => m.invalidateMeta())
}

function Definition({ draft, savedDef, settings, dirty, confirmDelete, setConfirmDelete, patchDraft, patchStep, moveStep, addStep, removeStep, saveDraft, doDelete }: {
  draft: Pipeline
  savedDef: Pipeline | null
  settings: Settings | null
  dirty: boolean
  confirmDelete: string
  setConfirmDelete: (s: string) => void
  patchDraft: (p: Partial<Pipeline>) => void
  patchStep: (i: number, p: Partial<Step>) => void
  moveStep: (i: number, d: -1 | 1) => void
  addStep: () => void
  removeStep: (i: number) => void
  saveDraft: () => void
  doDelete: () => void
}): JSX.Element {
  const varsEntries = Object.entries(draft.vars || {})
  const isWebhook = draft.trigger.type === 'webhook'
  return (
    <div>
      <div className="fp-card">
        <div className="fp-grid3">
          <div style={{ gridColumn: 'span 2' }}>
            <Field label="名称">
              <input value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} />
            </Field>
          </div>
          <Field label="启用">
            <select value={draft.enabled ? '1' : '0'} onChange={(e) => patchDraft({ enabled: e.target.value === '1' })}>
              <option value="1">启用</option>
              <option value="0">停用</option>
            </select>
          </Field>
        </div>
        <div className="fp-grid3">
          <Field label="触发方式">
            <select value={draft.trigger.type} onChange={(e) => {
              const type = e.target.value as Pipeline['trigger']['type']
              const tg: Pipeline['trigger'] = { type } as Pipeline['trigger']
              if (type === 'interval') tg.everyMinutes = 30
              if (type === 'daily') tg.at = '08:30'
              patchDraft({ trigger: tg })
            }}>
              <option value="manual">手动</option>
              <option value="interval">间隔（分钟）</option>
              <option value="daily">每天定时</option>
              <option value="webhook">Webhook 入站</option>
            </select>
          </Field>
          {draft.trigger.type === 'interval' && (
            <Field label="间隔分钟（≥5）">
              <input type="number" min={5} max={10080} value={draft.trigger.everyMinutes ?? 30}
                onChange={(e) => patchDraft({ trigger: { type: 'interval', everyMinutes: Number(e.target.value) } })} />
            </Field>
          )}
          {draft.trigger.type === 'daily' && (
            <Field label="时间 HH:MM">
              <input value={draft.trigger.at ?? '08:30'} onChange={(e) => patchDraft({ trigger: { type: 'daily', at: e.target.value } })} placeholder="08:30" />
            </Field>
          )}
          <Field label="允许本机/内网目标">
            <select value={draft.allowLocal ? '1' : '0'} onChange={(e) => patchDraft({ allowLocal: e.target.value === '1' })}>
              <option value="0">禁止（默认，安全）</option>
              <option value="1">允许（本地联调）</option>
            </select>
          </Field>
        </div>
        {isWebhook && (
          <div className="fp-muted" style={{ fontSize: 12 }}>
            保存后 webhook 入口：<code className="fp-mono">POST /hook/{draft.id || '<保存后生成>'}</code>，头 <code className="fp-mono">X-FlowPipe-Token: {draft.trigger.token ? '(已生成，删除重建才会更换)' : '(保存后生成)'}</code>
            ；POST body 会注入为 <code className="fp-mono">{'{{params.body}}'}</code>，query 为 <code className="fp-mono">{'{{params.query}}'}</code>。
          </div>
        )}
      </div>

      <div className="fp-card">
        <div className="fp-row" style={{ justifyContent: 'space-between' }}>
          <b style={{ fontSize: 12 }}>变量 vars</b>
          <button className="small" onClick={() => patchDraft({ vars: { ...(draft.vars || {}), [`var${varsEntries.length + 1}`]: '' } })}>+ 变量</button>
        </div>
        {varsEntries.length === 0 && <div className="fp-muted" style={{ fontSize: 12 }}>没有变量。变量在步骤里用 <code>{'{{名字}}'}</code> 引用。</div>}
        {varsEntries.map(([k, v]) => {
          const isSecret = (draft.secrets || []).includes(k)
          return (
            <div className="fp-kv-row" key={k}>
              <input value={k} onChange={(e) => {
                const next = { ...(draft.vars || {}) }
                delete next[k]
                next[e.target.value] = v
                const secrets = (draft.secrets || []).map((s) => (s === k ? e.target.value : s))
                patchDraft({ vars: next, secrets })
              }} />
              <input value={String(v)} onChange={(e) => patchDraft({ vars: { ...(draft.vars || {}), [k]: e.target.value } })} />
              <select value={isSecret ? '1' : '0'} onChange={(e) => {
                const set = new Set(draft.secrets || [])
                if (e.target.value === '1') set.add(k); else set.delete(k)
                patchDraft({ secrets: [...set] })
              }}>
                <option value="0">明文</option>
                <option value="1">敏感</option>
              </select>
              <button className="small" onClick={() => {
                const next = { ...(draft.vars || {}) }
                delete next[k]
                patchDraft({ vars: next, secrets: (draft.secrets || []).filter((s) => s !== k) })
              }}>×</button>
            </div>
          )
        })}
        <div className="fp-muted" style={{ fontSize: 11 }}>「敏感」变量的值出口一律掩码（前4***后2），运行摘要/AI 返回都不出现原文。</div>
      </div>

      <div className="fp-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <b style={{ fontSize: 12 }}>步骤（{draft.steps.length}）</b>
        <button className="small primary" onClick={addStep}>+ 步骤</button>
      </div>
      {draft.steps.map((s, i) => (
        <div className="fp-step" key={i}>
          <div className="fp-step-head">
            <span className="fp-step-idx">{i + 1}</span>
            <span style={{ fontSize: 12, flex: 1 }}>{s.name || s.type}</span>
            <button className="small" onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</button>
            <button className="small" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1}>↓</button>
            <button className="small danger" onClick={() => removeStep(i)}>删</button>
          </div>
          <div className="fp-step-body">
            <StepForm step={s} onChange={(p) => patchStep(i, p)} providers={settings?.providers || []} allowLocal={Boolean(draft.allowLocal)} />
          </div>
        </div>
      ))}

      <div className="fp-row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={saveDraft} disabled={!dirty}>{dirty ? '保存修改' : '已保存'}</button>
        {savedDef?.id && <span className="fp-muted" style={{ fontSize: 11 }}>id={savedDef.id}</span>}
      </div>
      {savedDef?.id && (
        <div className="fp-card" style={{ marginTop: 12, borderColor: '#7F1D1D' }}>
          <div className="fp-row">
            <input style={{ flex: 1 }} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder={`输入「${draft.name}」确认删除`} />
            <button className="danger" onClick={doDelete} disabled={confirmDelete !== draft.name}>删除流水线</button>
          </div>
        </div>
      )}
    </div>
  )
}

function RunsTab({ draft, runs, openRun, runParams, setRunParams, setOpenRun, openRunDetail, doRun, stopRun }: {
  draft: Pipeline
  runs: RunRecord[]
  openRun: RunRecord | null
  runParams: string
  setRunParams: (s: string) => void
  setOpenRun: (r: RunRecord | null) => void
  openRunDetail: (id: string) => void
  doRun: () => void
  stopRun: (id: string) => void
}): JSX.Element {
  const activeRun = runs.find((r) => r.status === 'queued' || r.status === 'running')
  return (
    <div>
      <div className="fp-card">
        <Field label="运行参数 params（JSON，可选）" hint={'步骤里用 {{params.xxx}} 引用'}>
          <textarea rows={2} value={runParams} onChange={(e) => setRunParams(e.target.value)} placeholder='{"query": {"date": "today"}}' />
        </Field>
        <div className="fp-row">
          <button className="primary" onClick={doRun}>▶ 立即运行</button>
          {activeRun && <button onClick={() => stopRun(activeRun.id)}>■ 停止</button>}
          <span className="fp-muted" style={{ fontSize: 11 }}>{draft.id ? '' : '未保存的流水线不能运行'}</span>
        </div>
      </div>
      {runs.length === 0 && <div className="fp-muted" style={{ padding: 10 }}>还没有运行记录。</div>}
      {runs.map((r) => (
        <div key={r.id} className={`fp-run-item ${openRun?.id === r.id ? 'active' : ''}`} onClick={() => (openRun?.id === r.id ? setOpenRun(null) : openRunDetail(r.id))}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot color={statusColor(r.status)} />
            <b style={{ fontSize: 12 }}>{r.status}</b>
            <span className="fp-muted" style={{ fontSize: 11 }}>{timeStr(r.startedAt)} · {r.trigger}{r.missed ? '（补跑）' : ''} · {durStr(r.durationMs)}</span>
          </div>
          {r.error && <div className="fp-err" style={{ fontSize: 11, marginTop: 3 }}>{r.error}</div>}
        </div>
      ))}
      {openRun && (
        <div className="fp-card" style={{ marginTop: 10 }}>
          <div className="fp-row" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 12 }}>运行详情 {openRun.id}</b>
            <button className="small" onClick={() => setOpenRun(null)}>收起</button>
          </div>
          <div className="fp-timeline">
            {(openRun.steps || []).map((st, i) => (
              <div key={i} className={`fp-tl-item ${st.status}`}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 12 }}>{st.name}</b>
                  <span className="fp-chip">{st.type}</span>
                  <span className={`fp-chip ${st.status === 'ok' ? 'on' : st.status === 'error' ? 'err' : ''}`}>{st.status}</span>
                  <span className="fp-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{durStr(st.durationMs)}</span>
                </div>
                {st.error && <div className="fp-err" style={{ fontSize: 11 }}>{st.error}</div>}
                {st.excerpt && <div className="fp-excerpt">{st.excerpt}</div>}
                {(st.warnings || []).map((w, j) => <div key={j} className="fp-muted" style={{ fontSize: 11 }}>⚠ {w}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsModal({ settings, onClose, onSaved }: {
  settings: Settings
  onClose: () => void
  onSaved: (s: Settings) => void
}): JSX.Element {
  const [local, setLocal] = useState<Settings>(() => JSON.parse(JSON.stringify(settings)))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function importHost(dryRun: boolean) {
    setBusy(true)
    setMsg('')
    try {
      const r = await api.importHost(dryRun)
      if (dryRun) {
        setMsg(`宿主发现 ${r.imported} 个供应商（预览）：${(r.preview || []).map((p) => p.name).join('、') || '无'}. 再点「导入」落库`)
      } else {
        setMsg(`已导入 ${r.imported} 个供应商`)
        const s = await api.getSettings()
        setLocal(s.settings)
        onSaved(s.settings)
      }
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const r = await api.saveSettings(local)
      onSaved(r.settings)
      setMsg('已保存')
      window.setTimeout(onClose, 500)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fp-modal-mask" onClick={onClose}>
      <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-row" style={{ justifyContent: 'space-between' }}>
          <b>设置</b>
          <button className="small" onClick={onClose}>×</button>
        </div>

        <div className="fp-field">
          <span className="fp-label">AI 超时（秒，5-600）</span>
          <input type="number" min={5} max={600} value={local.aiTimeoutSec} onChange={(e) => setLocal({ ...local, aiTimeoutSec: Number(e.target.value) })} />
        </div>
        <div className="fp-field">
          <span className="fp-label">Webhook 触发总开关</span>
          <select value={local.webhookEnabled ? '1' : '0'} onChange={(e) => setLocal({ ...local, webhookEnabled: e.target.value === '1' })}>
            <option value="1">开启</option>
            <option value="0">关闭（/hook 一律 409）</option>
          </select>
        </div>

        <div className="fp-row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <b style={{ fontSize: 12 }}>AI 供应商（{local.providers.length}）</b>
          <span>
            <button className="small" disabled={busy} onClick={() => importHost(true)}>从宿主发现</button>
            {' '}
            <button className="small primary" disabled={busy} onClick={() => importHost(false)}>导入宿主供应商</button>
          </span>
        </div>
        {local.providers.map((p, i) => (
          <div key={p.id} style={{ border: '1px solid #2A2F36', borderRadius: 8, padding: 8, marginBottom: 6 }}>
            <div className="fp-grid2">
              <Field label="名称"><input value={p.name} onChange={(e) => { const ps = [...local.providers]; ps[i] = { ...p, name: e.target.value }; setLocal({ ...local, providers: ps }) }} /></Field>
              <Field label="模型"><input value={p.model} onChange={(e) => { const ps = [...local.providers]; ps[i] = { ...p, model: e.target.value }; setLocal({ ...local, providers: ps }) }} /></Field>
            </div>
            <Field label="baseUrl"><input value={p.baseUrl} onChange={(e) => { const ps = [...local.providers]; ps[i] = { ...p, baseUrl: e.target.value }; setLocal({ ...local, providers: ps }) }} /></Field>
            <div className="fp-grid2">
              <Field label="apiKey（已掩码，原样保存=不改动）"><input value={p.apiKey} onChange={(e) => { const ps = [...local.providers]; ps[i] = { ...p, apiKey: e.target.value }; setLocal({ ...local, providers: ps }) }} /></Field>
              <Field label="协议">
                <select value={p.wire || 'openai-chat-completions'} onChange={(e) => { const ps = [...local.providers]; ps[i] = { ...p, wire: e.target.value as Provider_['wire'] }; setLocal({ ...local, providers: ps }) }}>
                  <option value="openai-chat-completions">OpenAI 兼容</option>
                  <option value="anthropic-messages">Anthropic Messages</option>
                </select>
              </Field>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button className="small danger" onClick={() => setLocal({ ...local, providers: local.providers.filter((_, j) => j !== i) })}>删除</button>
            </div>
          </div>
        ))}
        <button className="small" onClick={() => setLocal({
          ...local,
          providers: [...local.providers, { id: `prov_${Math.random().toString(16).slice(2, 10)}`, name: '新供应商', baseUrl: '', apiKey: '', model: '', wire: 'openai-chat-completions' }],
        })}>+ 手动添加供应商</button>

        {msg && <div className="fp-muted" style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
        <div className="fp-row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button className="primary" disabled={busy} onClick={save}>保存设置</button>
        </div>
      </div>
    </div>
  )
}

type Provider_ = import('./model').Provider
