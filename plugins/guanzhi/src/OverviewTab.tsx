/**
 * 总览 Tab：KPI（今年完成/在进行/评分均值）+ 进行中（收尾提醒）+ 最近完成 + 想看最久 + 记一笔表单
 */
import { useState } from 'react'
import {
  addWork, updateWork, deleteWork, K,
  KIND_VERBS, type PanelData, type Work,
} from './model'
import WorkCard from './WorkCard'
import WorkForm, { type WorkFormPayload } from './WorkForm'
import type { Toast } from './Panel'

export default function OverviewTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [form, setForm] = useState<{ initial: Work | null } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <div className="gz-empty">载入中…</div>
  const ov = data.overview

  const doAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await reload()
      showToast(okMsg, 'good')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const submitForm = async (payload: WorkFormPayload) => {
    if (busy) return
    setBusy(true)
    try {
      if (form?.initial) {
        const r = await updateWork(form.initial.id, payload as unknown as Record<string, unknown>)
        if (!r.ok) throw new Error(r.error || '更新失败')
        showToast(`已保存「${payload.title}」`, 'good')
      } else {
        const r = await addWork(payload)
        if (!r.ok) throw new Error(r.error || '记账失败')
        showToast(r.updated ? `已有记录已更新：${payload.title}` : `已记账：${payload.title}`, 'good')
      }
      setForm(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const kpi = (label: string, value: string, sub: string) => (
    <div className="gz-kpi" key={label}>
      <small>{label}</small>
      <b>{value}</b>
      <em>{sub}</em>
    </div>
  )

  const actions = (w: Work) => {
    if (w.status === 'active') {
      return (
        <>
          <button className="gz-btn sm" disabled={busy} onClick={() => doAction(
            () => updateWork(w.id, { status: 'done' }),
            `《${w.title}》已${KIND_VERBS[w.kind] || '看'}完（记今天）`,
          )}>完成</button>
          <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(
            () => updateWork(w.id, { status: 'dropped' }),
            `已标记弃了《${w.title}》`,
          )}>弃</button>
        </>
      )
    }
    if (w.status === 'wish') {
      return (
        <>
          <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(
            () => updateWork(w.id, { status: 'active' }),
            `开始《${w.title}》`,
          )}>开始</button>
          <button className="gz-btn sm" disabled={busy} onClick={() => doAction(
            () => updateWork(w.id, { status: 'done' }),
            `《${w.title}》已${KIND_VERBS[w.kind] || '看'}完（记今天）`,
          )}>完成</button>
        </>
      )
    }
    if (w.status === 'done') {
      return (
        <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(
          () => updateWork(w.id, { favorite: !w.favorite }),
          w.favorite ? `已取消心头好：${w.title}` : `已标为心头好：${w.title}`,
        )}>{w.favorite ? '★ 取心头好' : '☆ 心头好'}</button>
      )
    }
    return (
      <button className="gz-btn sm ghost" disabled={busy} onClick={() => doAction(
        () => updateWork(w.id, { status: 'wish' }),
        `《${w.title}》回到想看`,
      )}>回想看</button>
    )
  }

  return (
    <>
      <div className="gz-kpis">
        {kpi('今年完成', String(ov.thisYearDone), `本月 ${ov.thisMonthDone} 部`)}
        {kpi('在进行', String(ov.byStatus.active), `想看 ${ov.wishCount} 部待启`)}
        {kpi('评分均值', ov.avgRating != null ? `${ov.avgRating}` : '—', `已评 ${ov.ratedCount} 条`)}
      </div>

      <div className="gz-chiprow">
        <button className="gz-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setForm({ initial: null })}>＋ 记一笔</button>
      </div>
      {form && (
        <WorkForm
          initial={form.initial}
          busy={busy}
          submitLabel={form.initial ? '保存' : '记账'}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      )}

      <div className="gz-sec"><span className="gz-bar" />进行中<span className="gz-hint">开得最久的在前，先收尾</span></div>
      {ov.activeList.length === 0 && <div className="gz-empty">没有进行中的——想看清单里挑一个开始吧。</div>}
      {ov.activeList.map((w) => (
        <WorkCard key={w.id} work={w} today={data.today} onEdit={() => setForm({ initial: w })}>
          {actions(w)}
        </WorkCard>
      ))}

      <div className="gz-sec"><span className="gz-bar" />最近完成<span className="gz-hint">今年已完成 {ov.thisYearDone}</span></div>
      {ov.recentDone.length === 0 && <div className="gz-empty">还没有完成记录——完成一项后会出现在这里。</div>}
      {ov.recentDone.map((w) => (
        <WorkCard key={w.id} work={w} today={data.today} onEdit={() => setForm({ initial: w })}>
          {actions(w)}
        </WorkCard>
      ))}

      <div className="gz-sec"><span className="gz-bar" />想看清单<span className="gz-hint">压得最久的在前</span></div>
      {ov.wishOldest.length === 0 && <div className="gz-empty">想看清单是空的——聊天里说「想看《××》」即可加入。</div>}
      {ov.wishOldest.map((w) => (
        <WorkCard key={w.id} work={w} today={data.today} onEdit={() => setForm({ initial: w })}>
          {actions(w)}
          <button className="gz-btn sm danger" disabled={busy} onClick={() => doAction(
            async () => { await deleteWork(w.id) },
            `已删除《${w.title}》`,
          )}>删</button>
        </WorkCard>
      ))}

      {ov.total === 0 && (
        <div className="gz-sub" style={{ padding: '0 18px 10px' }}>
          账本空空。在 Polaris 聊天里说「昨晚看完《××》打9分」「想看《××》」即可对话式记账——
          或点上面「＋ 记一笔」手动录入。键空间：{K.workPrefix}*
        </div>
      )}
    </>
  )
}
