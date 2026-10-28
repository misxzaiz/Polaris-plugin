/**
 * 洞察 Tab：渠道漏斗 / 简历版本漏斗 / 复盘问题库 / offer 对比。
 * 全部读 view（core 纯函数派生），本文件零业务口径。
 */
import * as core from '../shared/core.js'
import type { WenData, WenView } from './model'

function FunnelTable({ rows, resumeNames }: {
  rows: { key: string; submitted: number; responded: number; interviewed: number; offered: number; respondedRate: string | null; interviewedRate: string | null; offeredRate: string | null }[]
  resumeNames?: Map<string, string>
}) {
  if (!rows.length) return <div className="wj-card"><div className="wj-card-b wj-sub">还没有投出去的记录——建档并投出后，漏斗会在这里长出来。</div></div>
  const small = rows.some((g) => g.submitted < 5)
  return (
    <div className="wj-card"><div className="wj-card-b" style={{ overflowX: 'auto' }}>
      <table className="wj-tbl">
        <thead>
          <tr>
            <th>{resumeNames ? '简历版本' : '渠道'}</th>
            <th>投递</th>
            <th>回音</th>
            <th>面试</th>
            <th>offer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>{resumeNames ? (resumeNames.get(g.key) || g.key) : g.key}</td>
              <td className="wj-num">{g.submitted}</td>
              <td className="wj-num">{g.responded}{g.respondedRate ? <span className="wj-sub"> {g.respondedRate}</span> : null}</td>
              <td className="wj-num">{g.interviewed}{g.interviewedRate ? <span className="wj-sub"> {g.interviewedRate}</span> : null}</td>
              <td className="wj-num">{g.offered}{g.offeredRate ? <span className="wj-sub"> {g.offeredRate}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {small ? <div className="wj-sub" style={{ marginTop: 6 }}>样本 &lt;5 的行只给计数不给出百分比——样本会撒谎，问津选择诚实。</div> : null}
      <div className="wj-sub" style={{ marginTop: 4 }}>口径：投递→回音→面试→offer 逐级转化；被拒也算「有回音」。</div>
    </div></div>
  )
}

export default function InsightTab({ data, view }: { data: WenData; view: WenView }) {
  const resumeNames = new Map(data.resumes.map((r) => [r.id, r.label]))
  const hasResumes = view.funnelResume.some((g) => g.key !== '(未标注)')

  return (
    <div className="wj-page">
      <div className="wj-sec">
        <span className="wj-bar" />渠道漏斗
        <span className="wj-hint">投递 → 回音 → 面试 → offer</span>
      </div>
      <FunnelTable rows={view.funnelChannel} />

      <div className="wj-sec">
        <span className="wj-bar" />简历版本漏斗
        <span className="wj-hint">{hasResumes ? '哪版简历回复率高' : '投递时标注简历版本即可积累'}</span>
      </div>
      <FunnelTable rows={view.funnelResume} resumeNames={resumeNames} />

      <div className="wj-sec">
        <span className="wj-bar" />复盘问题库
        <span className="wj-hint">面试后把问题记进事件，重复出现的会浮上来</span>
      </div>
      {view.questions.length === 0 ? (
        <div className="wj-card"><div className="wj-card-b wj-sub">还没有记录。面试复盘时用「记进展」把被问的问题逐条写下（下一场就你知道它会考什么）。</div></div>
      ) : (
        <div className="wj-card"><div className="wj-card-b">
          {view.questions.slice(0, 30).map((q, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: i < Math.min(view.questions.length, 30) - 1 ? '1px solid #1c2230' : 'none' }}>
              <div className="wj-row">
                <span className="wj-tag purple">×{q.count}</span>
                <div className="wj-grow" style={{ fontSize: 12.5 }}>{q.q}</div>
              </div>
              <div className="wj-sub" style={{ marginTop: 2 }}>来源：{q.companies.slice(0, 4).join('、')}{q.companies.length > 4 ? ` 等 ${q.companies.length} 家` : ''}</div>
            </div>
          ))}
        </div></div>
      )}

      <div className="wj-sec">
        <span className="wj-bar" />offer 对比
        <span className="wj-hint">年化 = 月薪 × (合同月数 + 奖金月数)</span>
      </div>
      {view.offers.length === 0 ? (
        <div className="wj-card"><div className="wj-card-b wj-sub">还没有 offer 档案。在投递详情里点「录 offer」录入薪资结构。</div></div>
      ) : (
        view.offers.map((r, i) => (
          <div className="wj-card" key={r.offer.id}>
            <div className="wj-card-b">
              <div className="wj-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {r.deltaVsBest === 0 ? <span className="wj-tag green">最优</span> : null}
                <b style={{ fontSize: 13 }}>{i + 1}. {r.companyName} · {r.title}</b>
              </div>
              <div className="wj-sub" style={{ marginTop: 4 }}>
                月薪 <b className="wj-num">{r.offer.baseMonthly.toLocaleString()}</b>
                {' × '}{r.offer.months} 个月
                {r.offer.bonusMonths ? ` + 年终 ${r.offer.bonusMonths} 个月` : ''}
                {' = '}<b style={{ color: '#3FB950' }} className="wj-num">{r.annual.toLocaleString()} 元/年</b>
                {r.deltaVsBest ? <span className="wj-sub">（较最优 {r.deltaVsBest > 0 ? '+' : ''}{r.deltaVsBest.toLocaleString()}）</span> : null}
              </div>
              <div className="wj-sub" style={{ marginTop: 2 }}>
                {r.offer.remoteDays > 0 ? `每周远程 ${r.offer.remoteDays} 天 · ` : ''}
                {r.commuteHoursPerYear != null ? `年通勤约 ${r.commuteHoursPerYear} 小时 · ` : ''}
                {r.offer.stockNote ? `股票/期权：${r.offer.stockNote}` : ''}
              </div>
              {r.offer.deadline ? <div className="wj-sub" style={{ marginTop: 2 }}>答复截止：{core.fmtDateTime(core.parseTs(r.offer.deadline) || 0)}</div> : null}
            </div>
          </div>
        ))
      )}
      {view.offers.length > 1 ? (
        <div className="wj-sub" style={{ padding: '0 18px' }}>对比只算钱与通勤；期权未计价、成长/团队/稳定性无法量化——请结合自身判断。</div>
      ) : null}
    </div>
  )
}
