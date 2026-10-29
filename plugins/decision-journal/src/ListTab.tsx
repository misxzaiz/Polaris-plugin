/**
 * 决策 Tab：列表（状态 chips + 搜索）→ 详情（预期 vs 复盘对照 + 操作）→
 * 新建/编辑表单 / 复盘表单。全部视图内切，不弹窗。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  saveDecision, deleteDecision, fmtDate, timeAgo, reviewLabel, confidenceWord, isDue,
  OUTCOME_META, STATUS_META, type Decision, type DecisionOption, type PanelCtx,
} from './model'

type View = 'list' | 'detail' | 'edit' | 'create' | 'resolve'
type ListFilter = 'all' | 'open' | 'decided' | 'due' | 'resolved' | 'shelved'

const FILTERS: [ListFilter, string][] = [
  ['all', '全部'], ['due', '到期'], ['open', '纠结中'], ['decided', '存照中'], ['resolved', '已复盘'], ['shelved', '已搁置'],
]

const HORIZONS: [string, string][] = [
  ['30', '30 天'], ['90', '90 天'], ['180', '半年'], ['365', '一年'], ['0', '不定期'],
]

interface Draft {
  id: string
  title: string
  question: string
  context: string
  options: { name: string; note: string }[]
  chosenIdx: number
  rationale: string
  expectedText: string
  confidence: number
  horizon: string
  tags: string
}

function emptyDraft(): Draft {
  return {
    id: '', title: '', question: '', context: '',
    options: [{ name: '', note: '' }, { name: '', note: '' }],
    chosenIdx: 0, rationale: '', expectedText: '', confidence: 70, horizon: '90', tags: '',
  }
}

function draftOf(d: Decision): Draft {
  const days = d.reviewAt ? Math.round((d.reviewAt - (d.decidedAt || d.createdAt)) / 86400000) : 0
  return {
    id: d.id, title: d.title, question: d.question, context: d.context,
    options: d.options.length ? d.options.map((o) => ({ name: o.name, note: o.note })) : emptyDraft().options,
    chosenIdx: Math.max(0, d.options.findIndex((o) => o.id === d.chosenId)),
    rationale: d.rationale,
    expectedText: d.expected ? d.expected.text : '',
    confidence: d.expected ? d.expected.confidence : 70,
    horizon: String(days > 0 ? days : 0),
    tags: d.tags.join(' '),
  }
}

export default function ListTab({ ctx, focusId, onFocusConsumed }: {
  ctx: PanelCtx
  focusId: string
  onFocusConsumed: () => void
}) {
  const { overview, refresh, showToast, onSendToChat } = ctx
  const [view, setView] = useState<View>('list')
  const [filter, setFilter] = useState<ListFilter>('all')
  const [kw, setKw] = useState('')
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [resolveOutcome, setResolveOutcome] = useState<'hit' | 'partial' | 'miss' | 'void'>('hit')
  const [resolveNote, setResolveNote] = useState('')
  const [resolveSurprise, setResolveSurprise] = useState('')
  const [resolveLesson, setResolveLesson] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (focusId) {
      setActiveId(focusId)
      setView('detail')
      onFocusConsumed()
    }
  }, [focusId, onFocusConsumed])

  const active = useMemo(
    () => overview.all.find((d) => d.id === activeId) || null,
    [overview.all, activeId],
  )

  const list = useMemo(() => {
    const now = Date.now()
    let arr = overview.all
    if (filter === 'due') arr = arr.filter((d) => isDue(d, now))
    else if (filter !== 'all') arr = arr.filter((d) => d.status === filter)
    if (kw.trim()) {
      const k = kw.trim().toLowerCase()
      arr = arr.filter((d) => `${d.title} ${d.question} ${d.context} ${d.expected ? d.expected.text : ''} ${d.tags.join(' ')}`
        .toLowerCase().includes(k))
    }
    return arr
  }, [overview.all, filter, kw])

  const startCreate = () => { setDraft(emptyDraft()); setView('create') }
  const startEdit = (d: Decision) => { setDraft(draftOf(d)); setView('edit') }
  const startResolve = (d: Decision) => {
    setResolveOutcome(d.status === 'resolved' && d.resolution ? d.resolution.outcome : 'hit')
    setResolveNote(d.resolution ? d.resolution.note : '')
    setResolveSurprise(d.resolution ? d.resolution.surprise : '')
    setResolveLesson(d.resolution ? d.resolution.lesson : '')
    setActiveId(d.id)
    setView('resolve')
  }

  const saveForm = async () => {
    if (busy) return
    if (!draft.title.trim()) { showToast('标题必填', 'bad'); return }
    const options: DecisionOption[] = draft.options
      .map((o, i) => ({ id: `o${i + 1}`, name: o.name.trim(), note: o.note.trim() }))
      .filter((o) => o.name)
    const chosen = options[draft.chosenIdx] ? options[draft.chosenIdx].name : ''
    const expected = draft.expectedText.trim() || draft.confidence != null
      ? { text: draft.expectedText.trim(), confidence: draft.confidence }
      : null
    const tags = draft.tags.split(/\s+/).filter(Boolean)
    const payload = {
      title: draft.title.trim(), question: draft.question.trim(), context: draft.context.trim(),
      options, chosen, rationale: draft.rationale.trim(), expected, tags,
      reviewInDays: Number(draft.horizon),
    }
    setBusy(true)
    try {
      if (view === 'edit') {
        const existing = overview.all.find((d) => d.id === draft.id)
        if (!existing) throw new Error('原决策不存在')
        const next: Decision = { ...existing, updatedAt: Date.now(), ...payload, expected: expected || existing.expected }
        if (payload.chosen && existing.options.length) {
          const match = options.find((o) => o.name === payload.chosen)
          next.chosenId = match ? match.id : existing.chosenId
        }
        next.reviewAt = Number(draft.horizon) > 0 ? Date.now() + Number(draft.horizon) * 86400000 : null
        await saveDecision(next)
        showToast('已保存', 'good')
      } else {
        const existingTitles = new Set(overview.all.map((d) => d.title))
        if (existingTitles.has(payload.title) && !window.confirm('已有同名决策，仍要新建吗？')) { setBusy(false); return }
        const now = Date.now()
        const id = `d${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`
        const status = chosen && expected && expected.text ? 'decided' : 'open'
        if (chosen && (!expected || !expected.text)) {
          showToast('已选了方案但没有预期：请补一条可检验的预期（没有预期就无法复盘）', 'bad')
          setBusy(false)
          return
        }
        const d: Decision = {
          id, schemaVersion: 1, createdAt: now, updatedAt: now,
          title: payload.title, question: payload.question, context: payload.context,
          options, chosenId: status === 'decided' ? (options.find((o) => o.name === chosen)?.id ?? null) : null,
          rationale: payload.rationale,
          expected: status === 'decided' ? expected : null,
          tags, links: [], source: 'panel', status,
          decidedAt: status === 'decided' ? now : null,
          reviewAt: status === 'decided' && Number(draft.horizon) > 0 ? now + Number(draft.horizon) * 86400000 : null,
          shelvedReason: '', resolution: null,
        }
        await saveDecision(d)
        showToast(status === 'decided' ? `已立此存照，${draft.horizon === '0' ? '不定期' : `${draft.horizon} 天后`}复盘` : '已记下纠结', 'good')
      }
      await refresh()
      setView('list')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const doResolve = async () => {
    if (busy || !active) return
    setBusy(true)
    try {
      const next: Decision = {
        ...active,
        status: 'resolved',
        updatedAt: Date.now(),
        resolution: {
          outcome: resolveOutcome,
          score: OUTCOME_META[resolveOutcome].score as 1 | 0.5 | 0 | null,
          note: resolveNote.trim(), surprise: resolveSurprise.trim(), lesson: resolveLesson.trim(),
          resolvedAt: Date.now(),
        },
      }
      await saveDecision(next)
      showToast(`已复盘：${OUTCOME_META[resolveOutcome].label}`, 'good')
      await refresh()
      setView('detail')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const doShelve = async (d: Decision) => {
    if (!window.confirm(`搁置「${d.title}」？（不计入校准，可随时删除）`)) return
    await saveDecision({ ...d, status: 'shelved', shelvedReason: '面板搁置', updatedAt: Date.now() })
    showToast('已搁置', 'good')
    await refresh()
    setView('list')
  }

  const doDelete = async (d: Decision) => {
    if (!window.confirm(`删除「${d.title}」？不可恢复。`)) return
    await deleteDecision(d.id)
    showToast('已删除', 'good')
    await refresh()
    setView('list')
  }

  const askAi = (d: Decision) => {
    if (!onSendToChat) { showToast('当前宿主不支持送入聊天', 'bad'); return }
    const exp = d.expected ? `原预期（把握 ${d.expected.confidence}%）：${d.expected.text}` : ''
    void onSendToChat(`帮我复盘决策日志里的这条决策（id=${d.id}）：${d.title}。${exp}对照现实帮我打分（兑现/部分/落空/作废），找偏差来源，沉淀一句教训。`)
    showToast('已送入聊天输入框', 'good')
  }

  // ── 详情 ────────────────────────────────────────────────────────────────
  if (view === 'detail' && active) {
    const chosen = active.options.find((o) => o.id === active.chosenId)
    return (
      <div style={{ padding: '0 16px' }}>
        <button className="dj-back" onClick={() => setView('list')}>← 返回列表</button>
        <div className="dj-card" style={{ marginTop: 8 }}><div className="dj-card-b">
          <div className="dj-row" style={{ marginBottom: 4 }}>
            <span className={`dj-dot ${STATUS_META[active.status].cls}`} />
            <b style={{ fontSize: 14, flex: 1 }}>{active.title}</b>
            <small style={{ color: '#5C6678' }}>{timeAgo(active.updatedAt)}</small>
          </div>
          <div className="dj-sub">
            {STATUS_META[active.status].label}
            {active.expected ? ` · 把握 ${active.expected.confidence}%（${confidenceWord(active.expected.confidence)}）` : ''}
            {active.status === 'resolved' && active.resolution ? ` · ${OUTCOME_META[active.resolution.outcome].label}` : ''}
            {active.tags.length ? ` · ${active.tags.join(' / ')}` : ''}
          </div>
          {active.context ? (<><div className="dj-lbl">背景</div><div className="dj-quote">{active.context}</div></>) : null}
          {active.question ? (<><div className="dj-lbl">问题</div><div className="dj-sub" style={{ color: '#C9D4E8' }}>{active.question}</div></>) : null}
          {active.options.length ? (
            <>
              <div className="dj-lbl">选项</div>
              {active.options.map((o) => (
                <div key={o.id} className={`dj-opt${o.id === active.chosenId ? ' chosen' : ''}`}>
                  <span style={{ fontSize: 11 }}>{o.id === active.chosenId ? '✓' : '·'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{o.name}</div>
                    {o.note ? <div style={{ fontSize: 10.5, color: '#5C6678' }}>{o.note}</div> : null}
                  </div>
                </div>
              ))}
            </>
          ) : null}
          {active.rationale ? (<><div className="dj-lbl">理由</div><div className="dj-sub" style={{ color: '#C9D4E8' }}>{active.rationale}</div></>) : null}
          {active.expected ? (
            <>
              <div className="dj-lbl">预期（把握 {active.expected.confidence}%）</div>
              <div className="dj-quote">{active.expected.text}</div>
            </>
          ) : null}
          {active.status === 'decided' ? (
            <div className="dj-sub" style={{ marginTop: 6 }}>
              复盘期限：{fmtDate(active.reviewAt)}（{reviewLabel(active)}）
            </div>
          ) : null}
          {active.resolution ? (
            <>
              <div className="dj-lbl">复盘（{fmtDate(active.resolution.resolvedAt)}）</div>
              <div className="dj-quote res">{OUTCOME_META[active.resolution.outcome].label}</div>
              {active.resolution.note ? <div className="dj-sub" style={{ color: '#C9D4E8', whiteSpace: 'pre-wrap' }}>经过：{active.resolution.note}</div> : null}
              {active.resolution.surprise ? <div className="dj-sub" style={{ color: '#C9D4E8' }}>意外：{active.resolution.surprise}</div> : null}
              {active.resolution.lesson ? <div className="dj-lesson" style={{ marginTop: 6 }}><b>教训</b><small>{active.resolution.lesson}</small></div> : null}
            </>
          ) : null}
          {active.status === 'shelved' && active.shelvedReason ? (
            <div className="dj-sub" style={{ marginTop: 6 }}>搁置原因：{active.shelvedReason}</div>
          ) : null}
        </div></div>
        <div className="dj-row" style={{ padding: '2px 2px 14px' }}>
          {(active.status === 'decided' || active.status === 'resolved') ? (
            <button className="dj-btn" onClick={() => startResolve(active)}>复盘打分</button>
          ) : null}
          {active.status === 'open' || active.status === 'decided' ? (
            <button className="dj-btn ghost" onClick={() => startEdit(active)}>编辑</button>
          ) : null}
          <button className="dj-btn ghost" onClick={() => askAi(active)}>让 AI 复盘</button>
          {active.status === 'open' || active.status === 'decided' ? (
            <button className="dj-btn ghost" onClick={() => void doShelve(active)}>搁置</button>
          ) : null}
          <button className="dj-btn danger" onClick={() => void doDelete(active)}>删除</button>
        </div>
      </div>
    )
  }

  // ── 复盘表单 ────────────────────────────────────────────────────────────
  if (view === 'resolve' && active) {
    return (
      <div style={{ padding: '0 16px' }}>
        <button className="dj-back" onClick={() => setView(active.status === 'resolved' ? 'detail' : 'list')}>← 返回</button>
        <div className="dj-card" style={{ marginTop: 8 }}><div className="dj-card-b">
          <b style={{ fontSize: 13.5 }}>{active.title}</b>
          {active.expected ? <div className="dj-quote">原预期（把握 {active.expected.confidence}%）：{active.expected.text}</div> : null}
          <div className="dj-lbl">结果对照预期</div>
          <div className="dj-outcomes">
            {(['hit', 'partial', 'miss', 'void'] as const).map((o) => (
              <button key={o} className={resolveOutcome === o ? `on-${o}` : ''} onClick={() => setResolveOutcome(o)}>
                {OUTCOME_META[o].label}
              </button>
            ))}
          </div>
          <div className="dj-lbl">实际发生了什么</div>
          <textarea className="dj-inp" rows={3} value={resolveNote} onChange={(e) => setResolveNote(e.target.value)}
            placeholder="对照预期逐条说：哪些发生了、哪些没有" />
          <div className="dj-lbl">意料之外（可选）</div>
          <input className="dj-inp" value={resolveSurprise} onChange={(e) => setResolveSurprise(e.target.value)}
            placeholder="有什么当时没想到的" />
          <div className="dj-lbl">一句教训（强烈建议）</div>
          <input className="dj-inp" value={resolveLesson} onChange={(e) => setResolveLesson(e.target.value)}
            placeholder="沉淀成可复用的一句话，会进经验卡" />
          {resolveOutcome === 'void' ? (
            <div className="dj-sub" style={{ marginTop: 6 }}>作废不计入校准（前提消失/决定被推翻时用）。</div>
          ) : null}
        </div></div>
        <div className="dj-row" style={{ padding: '2px 2px 14px' }}>
          <button className="dj-btn" disabled={busy} onClick={() => void doResolve()}>提交复盘</button>
          <button className="dj-btn ghost" onClick={() => setView(active.status === 'resolved' ? 'detail' : 'list')}>取消</button>
        </div>
      </div>
    )
  }

  // ── 新建 / 编辑表单 ─────────────────────────────────────────────────────
  if (view === 'create' || view === 'edit') {
    return (
      <div style={{ padding: '0 16px' }}>
        <button className="dj-back" onClick={() => setView('list')}>← 返回列表</button>
        <div className="dj-card" style={{ marginTop: 8 }}><div className="dj-card-b">
          <label className="dj-lbl">标题（一句短语概括这个决定）</label>
          <input className="dj-inp" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="如：迁移 RouterBus" />
          <label className="dj-lbl">背景与约束（可选）</label>
          <textarea className="dj-inp" rows={2} value={draft.context} onChange={(e) => setDraft({ ...draft, context: e.target.value })}
            placeholder="为什么现在要决定、有什么限制" />
          <label className="dj-lbl">选项（留空项忽略，≤6 个）</label>
          {draft.options.map((o, i) => (
            <div key={i} className={`dj-opt${draft.chosenIdx === i ? ' chosen' : ''}`}>
              <input type="radio" name="dj-chosen" checked={draft.chosenIdx === i}
                onChange={() => setDraft({ ...draft, chosenIdx: i })} />
              <input value={o.name} onChange={(e) => {
                const options = draft.options.slice()
                options[i] = { ...o, name: e.target.value }
                setDraft({ ...draft, options })
              }} placeholder={`选项 ${i + 1}`} />
              <button className="dj-btn sm ghost" style={{ flexShrink: 0 }}
                onClick={() => {
                  const options = draft.options.filter((_, j) => j !== i)
                  setDraft({ ...draft, options: options.length ? options : [{ name: '', note: '' }], chosenIdx: 0 })
                }}>×</button>
            </div>
          ))}
          <div className="dj-row">
            <button className="dj-btn sm ghost" disabled={draft.options.length >= 6}
              onClick={() => setDraft({ ...draft, options: [...draft.options, { name: '', note: '' }] })}>+ 加选项</button>
            {draft.chosenIdx >= 0 && draft.options[draft.chosenIdx] && draft.options[draft.chosenIdx].name ? (
              <small style={{ color: '#9EC4FF' }}>已选：{draft.options[draft.chosenIdx].name}</small>
            ) : (
              <small style={{ color: '#5C6678' }}>点圆圈标记所选方案</small>
            )}
          </div>
          <label className="dj-lbl">理由（可选）</label>
          <input className="dj-inp" value={draft.rationale} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })}
            placeholder="为什么选它" />
          <label className="dj-lbl">可检验的预期（立此存照的钥匙）</label>
          <textarea className="dj-inp" rows={2} value={draft.expectedText} onChange={(e) => setDraft({ ...draft, expectedText: e.target.value })}
            placeholder="如：三个月内完成迁移且零数据丢失（要含时间范围与可观察判据）" />
          <label className="dj-lbl">把握 <span className="dj-conf-num">{draft.confidence}%</span><span className="dj-conf-word">{confidenceWord(draft.confidence)}</span></label>
          <input type="range" min={0} max={100} step={5} className="dj-range" value={draft.confidence}
            onChange={(e) => setDraft({ ...draft, confidence: Number(e.target.value) })} />
          <label className="dj-lbl">复盘期限</label>
          <div className="dj-row">
            {HORIZONS.map(([v, label]) => (
              <button key={v} className={`dj-chip${draft.horizon === v ? ' on' : ''}`}
                onClick={() => setDraft({ ...draft, horizon: v })}>{label}</button>
            ))}
          </div>
          <label className="dj-lbl">标签（空格分隔，可选）</label>
          <input className="dj-inp" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            placeholder="如：架构 迁移" />
        </div></div>
        <div className="dj-row" style={{ padding: '2px 2px 14px' }}>
          <button className="dj-btn" disabled={busy} onClick={() => void saveForm()}>{view === 'edit' ? '保存' : '立此存照'}</button>
          <button className="dj-btn ghost" onClick={() => setView('list')}>取消</button>
        </div>
      </div>
    )
  }

  // ── 列表 ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, padding: '2px 16px 8px', flexWrap: 'wrap' }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`dj-chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px' }}>
        <input className="dj-inp" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索标题/背景/预期/标签" />
        <button className="dj-btn" style={{ flexShrink: 0 }} onClick={startCreate}>新建</button>
      </div>
      {list.length ? (
        <div className="dj-card"><div className="dj-card-b" style={{ paddingTop: 2, paddingBottom: 2 }}>
          {list.map((d) => {
            const dueNow = isDue(d)
            return (
              <div key={d.id} className="dj-item" onClick={() => { setActiveId(d.id); setView('detail') }}>
                <span className={`dj-dot ${dueNow ? 'bad' : STATUS_META[d.status].cls}`} />
                <div className="dj-item-main">
                  <b>{d.title}</b>
                  <small>
                    {STATUS_META[d.status].label}
                    {d.expected && d.status !== 'open' ? ` · 把握 ${d.expected.confidence}%` : ''}
                    {d.status === 'resolved' && d.resolution ? ` · ${OUTCOME_META[d.resolution.outcome].label}` : ''}
                    {d.status === 'decided' && d.reviewAt ? ` · ${reviewLabel(d)}` : ''}
                    {d.tags.length ? ` · ${d.tags.join('/')}` : ''}
                  </small>
                </div>
                <small style={{ color: '#5C6678', flexShrink: 0 }}>{timeAgo(d.updatedAt)}</small>
              </div>
            )
          })}
        </div></div>
      ) : (
        <div className="dj-empty">{kw || filter !== 'all' ? '没有符合条件的决策。' : '还没有决策。点「新建」，或在聊天里说「帮我立此存照：……」。'}</div>
      )}
    </div>
  )
}
