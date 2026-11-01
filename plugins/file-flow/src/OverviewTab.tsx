/**
 * 总览：根目录卡（状态 + 立即整理）+ 添加根 + 累计统计 + 计划预览弹层
 *
 * 「立即整理」= dryrun 出计划 → 弹层预览逐条动作 → 确认才 apply。
 * 面板不直接动文件；一切经命令信箱由后台服务执行。
 */
import { useState } from 'react'
import { callService, fmtBytes, fmtTime, type PanelData, type PlanPreview, type RootInfo, type Toast } from './model'

interface Props {
  data: PanelData
  refresh: () => Promise<void>
  showToast: (t: Toast) => void
}

const AUTO_LABEL: Record<string, string> = { off: '仅手动', new: '自动·新文件', all: '自动·全部' }

export default function OverviewTab({ data, refresh, showToast }: Props) {
  const [busy, setBusy] = useState('')
  const [addPath, setAddPath] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [plan, setPlan] = useState<{ rootId: string; preview: PlanPreview } | null>(null)

  const snapshot = data.snapshot
  const stats = data.stats || snapshot?.stats
  const roots = snapshot?.roots || []

  async function addRoot() {
    const p = addPath.trim()
    if (!p) return
    setBusy('add')
    try {
      await callService('roots_add', { path: p, label: addLabel.trim() || undefined, auto: 'new' })
      setAddPath('')
      setAddLabel('')
      await refresh()
      showToast({ msg: '根目录已添加（默认只自动整理新到文件）' })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function removeRoot(r: RootInfo) {
    if (!window.confirm(`移除「${r.label}」？\n其规则会停用，已归档的文件不会动。`)) return
    setBusy(`rm-${r.id}`)
    try {
      await callService('roots_remove', { id: r.id })
      await refresh()
      showToast({ msg: '已移除' })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function setAuto(r: RootInfo, auto: string) {
    setBusy(`auto-${r.id}`)
    try {
      await callService('roots_set', { id: r.id, auto })
      await refresh()
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function dryrun(r: RootInfo) {
    setBusy(`dry-${r.id}`)
    try {
      const preview = await callService<PlanPreview>('dryrun', { rootId: r.id }, { timeoutMs: 120_000 })
      setPlan({ rootId: r.id, preview })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function applyPlan() {
    if (!plan) return
    setBusy('apply')
    try {
      const r = await callService<{ batchId: string; summary: { done: number; failed: number; held: number; bytesMoved: number } }>(
        'apply',
        { rootId: plan.rootId, planId: plan.preview.planId, confirm: true },
        { timeoutMs: 150_000 },
      )
      setPlan(null)
      await refresh()
      const s = r.summary
      showToast({
        msg: `整理完成：成功 ${s.done}，失败 ${s.failed}${s.held ? `，暂缓 ${s.held}（根外路径待手动确认）` : ''}，移动 ${fmtBytes(s.bytesMoved)}。可在历史页撤销。`,
        bad: s.failed > 0,
      })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <div className="ff-card">
        <div className="ff-card-b ff-row" style={{ gap: 12 }}>
          <div className="ff-stat"><b>{stats?.filesOrganized ?? 0}</b><small>累计整理文件</small></div>
          <div className="ff-stat"><b>{stats?.batches ?? 0}</b><small>批次</small></div>
          <div className="ff-stat"><b>{snapshot?.enabledRuleCount ?? 0}</b><small>启用规则</small></div>
          <div className="ff-stat" style={{ flex: 1 }}><b style={{ fontSize: 11, paddingTop: 3 }}>{fmtTime(stats?.lastBatchAt)}</b><small>最近整理</small></div>
        </div>
      </div>

      {roots.length === 0 && (
        <div className="ff-card"><div className="ff-empty">
          还没有受管的文件夹。<br />
          添加下载文件夹开始：后台会按规则把新到的文件归档进对应子文件夹，<br />
          动手前先预览、动手后可撤销、永不删除。
        </div></div>
      )}

      {roots.map((r) => (
        <div className="ff-card" key={r.id}>
          <div className="ff-root-h">
            <b>{r.label}</b>
            <span className={`ff-tag ${r.watched ? '' : 'warn'}`}>{r.watched ? '监听中' : '未监听'}</span>
            <span className="ff-tag">{AUTO_LABEL[r.auto] || r.auto}</span>
            <div style={{ flex: 1 }} />
            <select className="ff-sel" value={r.auto} disabled={busy === `auto-${r.id}`} onChange={(e) => setAuto(r, e.target.value)}>
              <option value="off">仅手动</option>
              <option value="new">自动·新文件</option>
              <option value="all">自动·全部</option>
            </select>
          </div>
          <div className="ff-root-path">{r.path}</div>
          <div className="ff-root-stats">
            <span className="ff-sub">上次整理 {fmtTime(r.lastRunAt)}{r.lastPlanOps != null ? `（${r.lastPlanOps} 个动作）` : ''}</span>
            <div style={{ flex: 1 }} />
            <button className="ff-btn sm" disabled={busy === `dry-${r.id}`} onClick={() => dryrun(r)}>{busy === `dry-${r.id}` ? '扫描中…' : '立即整理'}</button>
            <button className="ff-btn sm ghost" disabled={busy === `rm-${r.id}`} onClick={() => removeRoot(r)}>移除</button>
          </div>
          {(r.issues || []).map((issue, i) => (
            <div className="ff-err" key={i} style={{ padding: '0 13px 8px' }}>{issue}</div>
          ))}
        </div>
      ))}

      <div className="ff-card">
        <div className="ff-card-b">
          <div className="ff-sub" style={{ marginBottom: 6 }}>添加受管文件夹（绝对路径，如 C:\\Users\\你\\Downloads）</div>
          <div className="ff-row">
            <input className="ff-inp ff-grow" placeholder="D:\\Downloads" value={addPath} onChange={(e) => setAddPath(e.target.value)} />
            <input className="ff-inp" style={{ width: 110 }} placeholder="显示名（可选）" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} />
            <button className="ff-btn" disabled={!addPath.trim() || busy === 'add'} onClick={addRoot}>{busy === 'add' ? '…' : '添加'}</button>
          </div>
          <div className="ff-sub" style={{ marginTop: 6 }}>添加后到「规则」页一键载入「下载夹起步包」，或先「立即整理」空跑预览。</div>
        </div>
      </div>

      {plan && (
        <div className="ff-modal" onClick={() => setPlan(null)}>
          <div className="ff-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="ff-modal-h">
              <b>整理计划预览</b>
              <span className="ff-tag">共 {plan.preview.opTotal} 个动作</span>
              {plan.preview.outsideOps > 0 && <span className="ff-tag warn">含 {plan.preview.outsideOps} 个根外动作</span>}
              <div style={{ flex: 1 }} />
              <button className="ff-btn sm ghost" onClick={() => setPlan(null)}>关闭</button>
            </div>
            <div className="ff-modal-b">
              <div className="ff-sub" style={{ marginBottom: 8 }}>
                扫描 {plan.preview.counts.entries} 个文件｜命中 {plan.preview.counts.matched}｜新文件护栏拦下 {plan.preview.counts.guard}｜部分下载 {plan.preview.counts.partial}｜无规则 {plan.preview.counts.noRule}
                {plan.preview.counts.truncated ? '｜⚠ 已达遍历上限，结果截断' : ''}
              </div>
              {plan.preview.ops.length === 0 && <div className="ff-empty">没有可执行的动作——文件都已就位或无规则命中。</div>}
              {plan.preview.ops.map((op, i) => (
                <div key={i} className={`ff-op ${op.safe === false ? 'outside' : ''}`}>
                  <span className="ff-chip">{{ move: '移动', recycle: '回收', dedupe: '去重', rename: '改名' }[op.action]}</span>
                  {op.fromRel}
                  <span className="ff-dim"> → </span>
                  {op.toAbs || op.toRel}
                  {op.safe === false && <span className="ff-dim">（根外路径：自动模式不执行，本次手动确认后才动）</span>}
                  <div className="ff-dim">规则：{op.why || op.ruleId}</div>
                </div>
              ))}
              {plan.preview.skipped.length > 0 && (
                <>
                  <div className="ff-sub" style={{ margin: '10px 0 4px' }}>被跳过（{plan.preview.skipped.length}，示例）：</div>
                  {plan.preview.skipped.slice(0, 8).map((s, i) => (
                    <div key={i} className="ff-sub ff-mono">{s.rel}｜{s.reason}</div>
                  ))}
                </>
              )}
            </div>
            <div className="ff-modal-f">
              <span className="ff-sub ff-grow">动手后可在「历史」页按批次撤销；文件永不会被删除。</span>
              <button className="ff-btn ghost" onClick={() => setPlan(null)}>先不动</button>
              <button className="ff-btn ok" disabled={plan.preview.opTotal === 0 || busy === 'apply'} onClick={applyPlan}>
                {busy === 'apply' ? '执行中…' : `执行这 ${plan.preview.opTotal} 个动作`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
