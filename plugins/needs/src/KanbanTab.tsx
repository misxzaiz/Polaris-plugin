/**
 * 看板 Tab：按状态分组展示条目；卡片展开详情（正文各节、状态/优先级、拍板、
 * 回答待澄清、追加决策记录、渲染开工提示词）。所有更新走乐观锁，冲突提示重读。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  apiAdd, apiHandoff, apiList, apiShow, apiUpdate,
  PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER,
  type NeedsMeta, type Row, type ShowResult,
} from './model'

const BADGE_CLASS: Record<string, string> = {
  idea: 'nd-badge', analyzed: 'nd-badge info', specd: 'nd-badge info', approved: 'nd-badge ok',
  building: 'nd-badge warn', delivered: 'nd-badge ok', published: 'nd-badge ok', shelved: 'nd-badge',
}

function splitSections(raw: string): Array<{ name: string; body: string }> {
  const lines = raw.split('\n')
  const out: Array<{ name: string; body: string }> = []
  let cur: { name: string; body: string[] } | null = null
  let inFm = false
  let fmDone = false
  for (const line of lines) {
    if (line.trim() === '---' && !fmDone) { inFm = !inFm; if (!inFm) fmDone = true; continue }
    if (inFm) continue
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) { if (cur) out.push({ name: cur.name, body: cur.body.join('\n').trim() }); cur = { name: h[1], body: [] } }
    else if (cur) cur.body.push(line)
  }
  if (cur) out.push({ name: cur.name, body: cur.body.join('\n').trim() })
  return out
}

export default function KanbanTab({ meta, onAddFail }: { meta: NeedsMeta; onAddFail?: (e: Error) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<string>('')
  const [expanded, setExpanded] = useState<string>('')
  const [detail, setDetail] = useState<ShowResult | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [quickTitle, setQuickTitle] = useState('')
  const [answer, setAnswer] = useState('')
  const [decision, setDecision] = useState('')

  const refresh = useCallback(async (keepExpand?: string) => {
    try {
      const { rows: list } = await apiList(meta, {})
      setRows(list)
      if (keepExpand) {
        const row = list.find((r) => r.id === keepExpand)
        if (row) setDetail(await apiShow(meta, keepExpand))
        else { setExpanded(''); setDetail(null) }
      }
    } catch (e) { setError(String((e as Error).message)) }
  }, [meta])

  useEffect(() => { refresh() }, [refresh])

  const grouped = useMemo(() => {
    const g: Array<{ status: string; items: Row[] }> = []
    for (const s of STATUS_ORDER) {
      const items = rows.filter((r) => r.status === s && (!filter || r.status === filter))
      if (items.length) g.push({ status: s, items })
    }
    const rest = rows.filter((r) => !STATUS_ORDER.includes(r.status as typeof STATUS_ORDER[number]) && (!filter || r.status === filter))
    if (rest.length) g.push({ status: 'unknown', items: rest })
    return g
  }, [rows, filter])

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(String((e as Error).message)) } finally { setBusy('') }
  }

  const quickAdd = () => run('add', async () => {
    const title = quickTitle.trim()
    if (!title) return
    const r = await apiAdd(meta, { title })
    setQuickTitle('')
    setNotice(`已记录 #${r.id}（idea）：${r.file}`)
    setExpanded(r.id)
    await refresh(r.id)
  })

  const openCard = (id: string) => run('open', async () => {
    if (expanded === id) { setExpanded(''); setDetail(null); return }
    setExpanded(id)
    setAnswer(''); setDecision('')
    setDetail(await apiShow(meta, id))
  })

  const changeStatus = (row: Row, status: string) => run('status', async () => {
    if (status === 'approved' && !window.confirm(`拍板 #${row.id}「${row.title}」？\n拍板后夜班会按 build-plugin 提示词实施该需求。`)) return
    await apiUpdate(meta, { id: row.id, fields: { status }, expectedMtimeMs: detail?.mtimeMs ?? row.mtimeMs })
    setNotice(`#${row.id} 状态 → ${STATUS_LABEL[status] || status}`)
    await refresh(row.id)
  })

  const changePriority = (row: Row, priority: string) => run('prio', async () => {
    await apiUpdate(meta, { id: row.id, fields: { priority }, expectedMtimeMs: detail?.mtimeMs ?? row.mtimeMs })
    await refresh(row.id)
  })

  const answerClarify = () => run('answer', async () => {
    const text = answer.trim()
    if (!text || !detail) return
    await apiUpdate(meta, { id: expanded, append: { section: '待澄清', text: `A（面板）：${text}` }, expectedMtimeMs: detail.mtimeMs })
    setAnswer('')
    setNotice('已回答，夜班下次巡逻会消费')
    await refresh(expanded)
  })

  const appendDecision = () => run('decision', async () => {
    const text = decision.trim()
    if (!text || !detail) return
    await apiUpdate(meta, { id: expanded, append: { section: '决策记录', text: `- ${text}` }, expectedMtimeMs: detail.mtimeMs })
    setDecision('')
    await refresh(expanded)
  })

  const copyHandoff = (stage: string) => run('handoff', async () => {
    const r = await apiHandoff(meta, expanded, stage)
    try { await navigator.clipboard.writeText(r.text); setNotice(`开工提示词（${stage}）已复制到剪贴板`) }
    catch (_) { setNotice(`提示词已渲染（${r.text.length} 字），浏览器剪贴板不可用——请在详情区手动复制`); setDetail({ ...detail!, raw: r.text }) }
  })

  const sections = detail ? splitSections(detail.raw) : []

  return (
    <div className="nd-body">
      <div className="nd-quick">
        <input className="nd-inp" placeholder="一句话记个需求，回车或点记下 →" value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') quickAdd() }} />
        <button className="nd-btn" disabled={!quickTitle.trim() || busy === 'add'} onClick={quickAdd}>记下</button>
      </div>
      <div className="nd-chiprow">
        <button className={`nd-chip${filter === '' ? ' on' : ''}`} onClick={() => setFilter('')}>全部 {rows.length}</button>
        {STATUS_ORDER.map((s) => {
          const n = rows.filter((r) => r.status === s).length
          if (!n) return null
          return <button key={s} className={`nd-chip${filter === s ? ' on' : ''}`} onClick={() => setFilter(filter === s ? '' : s)}>
            {STATUS_LABEL[s]} {n}
          </button>
        })}
      </div>
      {notice && <div className="nd-ok">{notice}</div>}
      {error && <div className="nd-alert bad">{error}</div>}
      {grouped.map((g) => (
        <div key={g.status}>
          <div className="nd-sec"><span className={`nd-bar st-${g.status}`} />
            {STATUS_LABEL[g.status] || '未知状态'}
            <span className="nd-hint">{g.items.length} 条</span>
          </div>
          {g.items.map((r) => (
            <div key={r.id} className="nd-item">
              <div className="nd-item-head" style={{ cursor: 'pointer' }} onClick={() => openCard(r.id)}>
                <span className={`nd-badge ${BADGE_CLASS[r.status] || 'nd-badge'}`}>#{r.id}</span>
                <b>{r.title}</b>
                {r.pendingClarify > 0 && <span className="nd-badge bad">待澄清 {r.pendingClarify}</span>}
                <span className="nd-badge">{PRIORITY_LABEL[r.priority] || r.priority}</span>
              </div>
              <div className="nd-item-mid">{r.updated} 更新{r.delivered ? ` · ${r.delivered.slice(0, 8)}` : ''}{r.spec ? ' · 有spec' : ''}</div>
              {expanded === r.id && (
                <div className="nd-detail">
                  {!detail && <div className="nd-sub">加载中…</div>}
                  {detail && (
                    <>
                      {sections.filter((s) => s.name !== '决策记录' || s.body).map((s) => (
                        <div key={s.name} className="nd-secb">
                          <div className="nd-lbl">{s.name}</div>
                          <pre className="nd-pre">{s.body || '（空）'}</pre>
                        </div>
                      ))}
                      <div className="nd-row">
                        <label className="nd-lbl" style={{ margin: 0 }}>状态</label>
                        <select className="nd-inp nd-sel" value={r.status} disabled={busy === 'status'}
                          onChange={(e) => changeStatus(r, e.target.value)}>
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        <label className="nd-lbl" style={{ margin: 0 }}>优先级</label>
                        <select className="nd-inp nd-sel" value={r.priority} disabled={busy === 'prio'}
                          onChange={(e) => changePriority(r, e.target.value)}>
                          {['high', 'medium', 'low'].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                        </select>
                      </div>
                      <div className="nd-secb">
                        <div className="nd-lbl">回答待澄清（追加到条目，夜班消费）</div>
                        <textarea className="nd-inp" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)}
                          placeholder="如：入口放设置页，手动添加目录" />
                        <button className="nd-btn sm" disabled={!answer.trim() || busy === 'answer'} onClick={answerClarify}>追加回答</button>
                      </div>
                      <div className="nd-secb">
                        <div className="nd-lbl">决策记录追加</div>
                        <input className="nd-inp" value={decision} onChange={(e) => setDecision(e.target.value)}
                          placeholder="如：2026-10-30 拍板走方案A" />
                        <button className="nd-btn sm ghost" disabled={!decision.trim() || busy === 'decision'} onClick={appendDecision}>追加</button>
                      </div>
                      <div className="nd-secb">
                        <div className="nd-lbl">开工提示词（复制给任意 agent）</div>
                        <div className="nd-row">
                          <button className="nd-btn sm ghost" disabled={busy === 'handoff'} onClick={() => copyHandoff('analyze')}>分析</button>
                          <button className="nd-btn sm ghost" disabled={busy === 'handoff'} onClick={() => copyHandoff('write-spec')}>写spec</button>
                          <button className="nd-btn sm ghost" disabled={busy === 'handoff'} onClick={() => copyHandoff('build-plugin')}>实施</button>
                        </div>
                      </div>
                      <div className="nd-sub">mtimeMs={detail.mtimeMs} · {detail.file}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {!rows.length && <div className="nd-sub" style={{ padding: '18px 18px' }}>还没有条目——在上面输入框记第一条需求吧。</div>}
      {onAddFail && null}
    </div>
  )
}
