/**
 * 总览 Tab：速览卡 + 到期复盘清单 + 近期到期 + 最近动态 + 空状态引导
 */
import { fmtDate, timeAgo, reviewLabel, confidenceWord,
  OUTCOME_META, STATUS_META, type PanelCtx } from './model'

const SAMPLE_PROMPTS = [
  '帮我立此存照：我在纠结要不要把 X 迁到 RouterBus（帮我把这个两难记进决策日志）',
  '决策日志里有什么决定快到期该复盘了？',
  '我最近的判断准不准？看看我的决策校准报告',
]

export default function HomeTab({ ctx }: { ctx: PanelCtx }) {
  const { overview, cal, decisions, openDetail, showToast, onSendToChat } = ctx

  const send = async (msg: string) => {
    if (!onSendToChat) { showToast('当前宿主不支持送入聊天', 'bad'); return }
    await onSendToChat(msg)
    showToast('已送入聊天输入框', 'good')
  }

  const recent = overview.all.slice(0, 5)
  const brierTxt = cal.nScored ? cal.brier.toFixed(2) : '—'
  const hitPct = cal.nScored ? Math.round(cal.hitRate * 100) : null
  const confPct = cal.nScored ? Math.round(cal.avgConf * 100) : null

  return (
    <div>
      <div className="dj-statrow" style={{ padding: '2px 16px 10px' }}>
        <div className="dj-stat">
          <b className={overview.due.length ? 'red' : ''}>{overview.due.length}</b>
          <small>到期待复盘</small>
        </div>
        <div className="dj-stat">
          <b className={overview.counts.open ? 'amber' : ''}>{overview.counts.open}</b>
          <small>纠结中</small>
        </div>
        <div className="dj-stat">
          <b className="blue">{overview.counts.decided}</b>
          <small>存照中</small>
        </div>
        <div className="dj-stat">
          <b className="green">{cal.nScored ? `${hitPct}%` : '—'}</b>
          <small>命中率{confPct != null ? ` / 把握 ${confPct}%` : ''}</small>
        </div>
      </div>

      {overview.due.length ? (
        <>
          <div className="dj-sec"><i className="dj-bar" />到期复盘<small className="dj-hint">到期即复盘，曲线才长得起来</small></div>
          <div className="dj-card"><div className="dj-card-b" style={{ paddingTop: 2, paddingBottom: 2 }}>
            {overview.due.slice(0, 8).map((d) => (
              <div key={d.id} className="dj-item" onClick={() => openDetail(d.id)}>
                <span className="dj-dot live" />
                <div className="dj-item-main">
                  <b>{d.title}</b>
                  <small>把握 {d.expected ? `${d.expected.confidence}%（${confidenceWord(d.expected.confidence)}）` : '—'} · {reviewLabel(d)}</small>
                </div>
                <button className="dj-btn sm" onClick={(e) => { e.stopPropagation(); openDetail(d.id) }}>去复盘</button>
              </div>
            ))}
          </div></div>
        </>
      ) : null}

      {overview.upcoming.length ? (
        <>
          <div className="dj-sec"><i className="dj-bar" />七天内到期</div>
          <div className="dj-card"><div className="dj-card-b" style={{ paddingTop: 2, paddingBottom: 2 }}>
            {overview.upcoming.map((d) => (
              <div key={d.id} className="dj-item" onClick={() => openDetail(d.id)}>
                <span className="dj-dot live" />
                <div className="dj-item-main">
                  <b>{d.title}</b>
                  <small>{fmtDate(d.reviewAt)} · {reviewLabel(d)}</small>
                </div>
              </div>
            ))}
          </div></div>
        </>
      ) : null}

      {cal.nScored ? (
        <>
          <div className="dj-sec"><i className="dj-bar" />校准速览<small className="dj-hint">Brier {brierTxt}（越低越准）</small></div>
          <div className="dj-card"><div className="dj-card-b">
            <div className="dj-sub">{cal.verdict}</div>
          </div></div>
        </>
      ) : null}

      <div className="dj-sec"><i className="dj-bar" />最近动态</div>
      {recent.length ? (
        <div className="dj-card"><div className="dj-card-b" style={{ paddingTop: 2, paddingBottom: 2 }}>
          {recent.map((d) => (
            <div key={d.id} className="dj-item" onClick={() => openDetail(d.id)}>
              <span className={`dj-dot ${STATUS_META[d.status].cls}`} />
              <div className="dj-item-main">
                <b>{d.title}</b>
                <small>
                  {STATUS_META[d.status].label}
                  {d.status === 'resolved' && d.resolution ? ` · ${OUTCOME_META[d.resolution.outcome].label}` : ''}
                  {d.expected && d.status !== 'open' ? ` · 把握 ${d.expected.confidence}%` : ''}
                  {` · ${timeAgo(d.updatedAt)}`}
                </small>
              </div>
            </div>
          ))}
        </div></div>
      ) : (
        <div className="dj-card"><div className="dj-card-b">
          <div className="dj-sub" style={{ marginBottom: 8 }}>
            还没有决策记录。开工方式任选：<br />
            · 在聊天里说「帮我立此存照：……」，AI 会问你预期和把握<br />
            · 或点右下角「决策」Tab 手动新建
          </div>
          {SAMPLE_PROMPTS.map((p) => (
            <button key={p} className="dj-prompt" style={{ marginBottom: 7 }} onClick={() => void send(p)}>{p}</button>
          ))}
        </div></div>
      )}

      <div style={{ height: 4 }} />
      {decisions && decisions.length > 0 && overview.due.length === 0 && overview.counts.open === 0 ? (
        <div className="dj-card"><div className="dj-card-b">
          <div className="dj-sub">台账干净：没有到期复盘，也没有悬而未决的事。新的决定做出来时，随时回来立此存照。</div>
        </div></div>
      ) : null}
    </div>
  )
}
