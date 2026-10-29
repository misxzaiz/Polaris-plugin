/**
 * 承诺 Tab：方向筛选（全部/我许的/我等的）+ 含闭环开关 + 新增表单
 * 分组：逾期（红）→ 临期（黄）→ 有期限 → 无期限 → 已闭环
 */
import { useState } from 'react'
import {
  PROMISE_DIRECTIONS, promiseBoard, setPromiseStatus, savePromises, normalizePromise,
  type PanelData, type BoardItem, type PromiseItem,
} from './model'
import { Section, type Toast } from './ui'

const DIR_LABEL: Record<string, string> = { iowe: '我许的', owedme: '我等的' }

export default function PromisesTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [dir, setDir] = useState<string>('')
  const [withClosed, setWithClosed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [personId, setPersonId] = useState('')
  const [pDir, setPDir] = useState<'iowe' | 'owedme'>('iowe')
  const [text, setText] = useState('')
  const [due, setDue] = useState('')

  if (!data) return <div className="tr-empty">载入中…</div>
  const now = Date.now()
  const board = promiseBoard(data.promisesBook.byId, data.peopleBook.byId, now, data.settings)

  const pick = (arr: BoardItem[]) => arr.filter((p) => !dir || p.direction === dir)

  const add = async () => {
    const t = text.trim()
    if (!t) { showToast('内容不能为空', 'bad'); return }
    if (!personId) { showToast('选一个人（先去「人情账本」建档）', 'bad'); return }
    const norm = normalizePromise({ personId, direction: pDir, text: t, due: due.trim() || undefined })
    if (norm.error || !norm.promise) { showToast(norm.error || '承诺不合法', 'bad'); return }
    await savePromises({ byId: { ...data.promisesBook.byId, [norm.promise.id]: norm.promise } })
    setText(''); setDue(''); setAdding(false)
    await reload()
    showToast(`立此存照：${DIR_LABEL[pDir]} · ${t}`, 'good')
  }

  const act = async (p: PromiseItem, status: PromiseItem['status']) => {
    const done = await setPromiseStatus(p.id, status)
    await reload()
    showToast(done
      ? status === 'done' ? `已闭环：${p.text}` : status === 'cancelled' ? `已取消：${p.text}` : '已重开'
      : '承诺不存在（可能已被另一端处理）', done ? 'good' : 'bad')
  }

  const row = (p: BoardItem, overdue: boolean) => (
    <div className="tr-promise" key={p.id}>
      <span className={`tr-dir ${p.direction}`}>{DIR_LABEL[p.direction]}</span>
      <div className="tr-promise-main">
        <b>{p.text}</b>
        <small>{p.personName} · <span style={{ color: overdue ? '#FF8A9A' : p.dueState?.kind === 'dueSoon' ? '#F2C063' : undefined }}>{p.dueState?.label}</span>{p.closeNote ? ` · ${p.closeNote}` : ''}</small>
      </div>
      {p.status === 'open' ? (
        <span className="tr-row" style={{ gap: 4 }}>
          <button className="tr-btn sm" onClick={() => act(p, 'done')}>✓</button>
          <button className="tr-btn sm ghost" onClick={() => act(p, 'cancelled')}>✕</button>
        </span>
      ) : (
        <button className="tr-btn sm ghost" onClick={() => act(p, 'open')}>重开</button>
      )}
    </div>
  )

  const activePeople = Object.values(data.peopleBook.byId).filter((p) => !p.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  return (
    <div>
      <Section title="承诺" hint={`${board.overdue.length + board.dueSoon.length + board.scheduled.length + board.openNoDue.length} 条未闭环`} />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-row">
            <button className={`tr-chip ${dir === '' ? 'on' : ''}`} onClick={() => setDir('')}>全部</button>
            {PROMISE_DIRECTIONS.map((d) => (
              <button key={d} className={`tr-chip ${dir === d ? 'on' : ''}`} onClick={() => setDir(dir === d ? '' : d)}>{DIR_LABEL[d]}</button>
            ))}
            <button className={`tr-chip ${withClosed ? 'on' : ''}`} onClick={() => setWithClosed(!withClosed)}>{withClosed ? '含已闭环' : '仅未闭环'}</button>
            <button className="tr-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(!adding)}>{adding ? '收起' : '+ 立诺'}</button>
          </div>
        </div>
        {adding && (
          <div className="tr-form">
            <div className="tr-row">
              <select className="tr-sel" style={{ flex: 1 }} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">选择对象…</option>
                {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="tr-row">
              <button className={`tr-chip ${pDir === 'iowe' ? 'on' : ''}`} onClick={() => setPDir('iowe')}>我许的</button>
              <button className={`tr-chip ${pDir === 'owedme' ? 'on' : ''}`} onClick={() => setPDir('owedme')}>我等的</button>
              <input className="tr-inp date" type="date" style={{ width: 150 }} value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="tr-row">
              <input className="tr-inp" style={{ flex: 1 }} placeholder="答应了什么 / 等对方什么" value={text}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
              <button className="tr-btn sm" onClick={() => void add()}>立</button>
            </div>
          </div>
        )}
      </div>

      {([['逾期', pick(board.overdue), true], ['临期', pick(board.dueSoon), false], ['有期限', pick(board.scheduled), false], ['无期限', pick(board.openNoDue), false]] as [string, BoardItem[], boolean][]).map(([label, arr, overdue]) => (
        arr.length ? (
          <div key={label}>
            <Section title={label} hint={`${arr.length} 条`} />
            <div className="tr-card"><div className="tr-card-b" style={{ padding: '4px 13px' }}>{arr.map((p) => row(p, overdue))}</div></div>
          </div>
        ) : null
      ))}
      {withClosed && board.closed.length ? (
        <div>
          <Section title="已闭环" hint={`${board.closed.length} 条`} />
          <div className="tr-card"><div className="tr-card-b" style={{ padding: '4px 13px' }}>{pick(board.closed).slice(0, 30).map((p) => row(p, false))}</div></div>
        </div>
      ) : null}
    </div>
  )
}
