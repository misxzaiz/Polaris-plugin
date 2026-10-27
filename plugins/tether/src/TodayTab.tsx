/**
 * 今日 Tab：逾期承诺（红）→ 临期承诺（黄）→ 生日 → 失联预警 top5
 * 每行都可就地动作：闭环承诺 / 跳到该人详情记联系。
 */
import { setPromiseStatus, promiseBoard, birthdayUpcoming, driftList, type PanelData, type BoardItem } from './model'
import { Section, type Toast } from './ui'

export default function TodayTab({ data, reload, showToast, setSelectedPersonId, setTab }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
  setSelectedPersonId: (id: string | null) => void
  setTab: (t: 'people') => void
}) {
  if (!data) return <div className="tr-empty">载入中…</div>
  const now = Date.now()
  const board = promiseBoard(data.promisesBook.byId, data.peopleBook.byId, now, data.settings)
  const birthdays = birthdayUpcoming(data.peopleBook.byId, data.settings.birthdayDays, now)
  const drift = driftList(data.peopleBook.byId, data.journalBook.events, data.settings, now)
    .filter((d) => d.level !== 'ok')
    .slice(0, 5)

  const close = async (p: BoardItem) => {
    const done = await setPromiseStatus(p.id, 'done')
    await reload()
    showToast(done ? `已闭环：${p.text}` : '承诺不存在（可能已被另一端处理）', done ? 'good' : 'bad')
  }

  const jump = (personId: string) => {
    setSelectedPersonId(personId)
    setTab('people')
  }

  const promiseRow = (p: BoardItem, overdue: boolean) => (
    <div className="tr-promise" key={p.id}>
      <span className={`tr-dir ${p.direction}`}>{p.direction === 'iowe' ? '我许的' : '我等的'}</span>
      <div className="tr-promise-main">
        <b>{p.text}</b>
        <small>{p.personName} · <span style={{ color: overdue ? '#FF8A9A' : '#F2C063' }}>{p.dueState?.label}</span></small>
      </div>
      <button className="tr-btn sm" onClick={() => close(p)}>闭环 ✓</button>
    </div>
  )

  return (
    <div>
      <Section title="逾期承诺" hint={board.overdue.length ? `${board.overdue.length} 条` : '干净'} />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: board.overdue.length ? '4px 13px' : 0 }}>
          {board.overdue.length
            ? board.overdue.map((p) => promiseRow(p, true))
            : <div className="tr-empty" style={{ padding: '14px' }}>没有逾期承诺 👌</div>}
        </div>
      </div>

      <Section title="临期承诺" hint={`${data.settings.dueWarnDays} 天内`} />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: board.dueSoon.length ? '4px 13px' : 0 }}>
          {board.dueSoon.length
            ? board.dueSoon.map((p) => promiseRow(p, false))
            : <div className="tr-empty" style={{ padding: '14px' }}>近期没有要兑现的承诺</div>}
        </div>
      </div>

      <Section title="生日" hint={`${data.settings.birthdayDays} 天内`} />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: birthdays.length ? '4px 13px' : 0 }}>
          {birthdays.length
            ? birthdays.map((b) => (
              <div className="tr-promise" key={b.personId} onClick={() => jump(b.personId)}>
                <div className="tr-promise-main">
                  <b>🎂 {b.name}</b>
                  <small>{b.date}{b.turningAge != null ? ` · 将满 ${b.turningAge}` : ''}</small>
                </div>
                <span className={`tr-due ${b.daysUntil === 0 ? 'overdue' : 'dueSoon'}`}>{b.daysUntil === 0 ? '今天！' : `${b.daysUntil} 天后`}</span>
              </div>
            ))
            : <div className="tr-empty" style={{ padding: '14px' }}>窗口期内没有生日</div>}
        </div>
      </div>

      <Section title="失联预警" hint="黄=超节奏 红=超宽限" />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: drift.length ? '4px 13px' : 0 }}>
          {drift.length
            ? drift.map((d) => (
              <div className="tr-promise" key={d.personId} onClick={() => jump(d.personId)}>
                <span className={`tr-dot ${d.level}`} style={{ marginTop: 4 }} />
                <div className="tr-promise-main">
                  <b>{d.name} <span className="tr-tag">{d.relation}</span></b>
                  <small>{d.text}</small>
                </div>
                <button className="tr-btn sm ghost" onClick={(e) => { e.stopPropagation(); jump(d.personId) }}>记联系</button>
              </div>
            ))
            : <div className="tr-empty" style={{ padding: '14px' }}>联系节奏都在轨道上 ✨</div>}
        </div>
      </div>
    </div>
  )
}
