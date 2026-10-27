/**
 * 快照 Tab：立即备份 / 校验 / 空间回收 + 快照清单（全量/增量徽章、规模、耗时）。
 * 快照详情含变更文件数与跳过文件（热文件诚实标注）。
 */
import { useState } from 'react'
import {
  triggerBackup, triggerVerify, triggerGc, timeAgo, formatBytes, fmtDuration,
  type Overview, type SnapshotIdx,
} from './model'
import type { Toast } from './Panel'

export default function SnapshotsTab({ data, reload, showToast, goRestore }: {
  data: Overview | null
  reload: () => Promise<Overview | null>
  showToast: Toast
  goRestore: () => void
}) {
  const [busy, setBusy] = useState('')
  const [expanded, setExpanded] = useState('')

  if (!data) return <div className="da-empty">载入中…</div>
  const st = data.state

  const doAction = async (name: string, fn: () => Promise<void>, doneMsg: string) => {
    if (busy) return
    setBusy(name)
    try {
      await fn()
      showToast(doneMsg, 'good')
      await reload()
    } catch (e) {
      showToast(`${name}失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const last = data.snapshots[0]

  return (
    <div>
      {st.degraded && <div className="da-banner bad">⚠️ {st.degraded.reason}</div>}
      <div className="da-sec">
        <i className="da-bar" />操作
        <span className="da-hint">{last ? `最新 ${timeAgo(last.finishedAt)}` : '尚未备份'}</span>
      </div>
      <div className="da-card">
        <div className="da-card-b">
          <div className="da-row">
            <button className="da-btn" disabled={!!busy} onClick={() => void doAction('备份', () => triggerBackup(), '已触发快照——完成后看下方清单与事件')}>立即备份</button>
            <button className="da-btn ghost" disabled={!!busy || !last} onClick={() => void doAction('校验', () => triggerVerify('latest', 'quick'), '已触发快速校验（对象存在性）')}>快速校验</button>
            <button className="da-btn ghost" disabled={!!busy || !last} onClick={() => void doAction('深度校验', () => triggerVerify('latest', 'deep'), '已触发深度校验（逐对象重哈希，稍慢）')}>深度校验</button>
            <button className="da-btn warn" disabled={!!busy} onClick={() => void doAction('回收', () => triggerGc(), '已触发空间回收（按保留策略裁剪+GC）')}>回收空间</button>
          </div>
          <div className="da-sub" style={{ marginTop: 8 }}>
            {st.lastResult && (
              st.lastResult.ok
                ? <>上次结果：{st.lastResult.summary?.totalFiles ?? '?'} 文件 / 变更 {st.lastResult.summary?.changedFiles ?? '?'} / 新对象 {st.lastResult.summary?.newObjects ?? '?'}（{formatBytes(st.lastResult.summary?.storedBytes || 0)}）· {fmtDuration(st.lastResult.summary?.durationMs || 0)}</>
                : <span style={{ color: '#FF8A9A' }}>上次失败：{st.lastResult.error}</span>
            )}
            {st.lastVerify && (
              <><br />最近校验：{st.lastVerify.snapId}（{st.lastVerify.mode}）{st.lastVerify.ok ? '✅ 完好' : <span style={{ color: '#FF8A9A' }}>✗ 缺失 {st.lastVerify.missing?.length || 0} / 损坏 {st.lastVerify.corrupt?.length || 0}</span>} · {timeAgo(st.lastVerify.at)}</>
            )}
          </div>
        </div>
      </div>

      <div className="da-sec">
        <i className="da-bar" />快照清单
        <span className="da-hint">{data.snapshots.length} 份</span>
      </div>
      <div className="da-card">
        <div className="da-card-b">
          {data.snapshots.length === 0 && (
            <div className="da-empty">
              还没有任何快照。<br />
              点上方「立即备份」做第一次全量——数据根内容会被压缩去重入库，<br />
              之后每次只存变化的部分。
            </div>
          )}
          {data.snapshots.slice(0, 50).map((s) => (
            <SnapRow
              key={s.id}
              snap={s}
              expanded={expanded === s.id}
              onToggle={() => setExpanded(expanded === s.id ? '' : s.id)}
              onVerify={() => void doAction('校验', () => triggerVerify(s.id, 'quick'), `已触发校验 ${s.id}`)}
              goRestore={goRestore}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SnapRow({ snap, expanded, onToggle, onVerify, goRestore }: {
  snap: SnapshotIdx
  expanded: boolean
  onToggle: () => void
  onVerify: () => void
  goRestore: () => void
}) {
  const time = new Date(snap.finishedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <div className="da-srow">
      <div className="head" onClick={onToggle}>
        <div className="main">
          <b>{time} · {snap.totalFiles} 文件（变更 {snap.changedFiles}）</b>
          <small>
            逻辑 {formatBytes(snap.logicalBytes)} · 新对象 {snap.newObjects}（{formatBytes(snap.storedBytes)}）· {fmtDuration(snap.durationMs)} · {snap.trigger || 'schedule'}
          </small>
        </div>
        <span className={`da-badge ${snap.ok ? (snap.type === 'full' ? 'full' : 'inc') : 'err'}`}>
          {snap.ok ? (snap.type === 'full' ? '全量' : '增量') : '失败'}
        </span>
      </div>
      {expanded && (
        <div className="da-detail">
          ID {snap.id}{snap.baseId ? ` · 基于 ${snap.baseId}` : ' · 无基线'} · 开始 {time}（耗时 {fmtDuration(snap.durationMs)}）
          {snap.error ? <><br /><span style={{ color: '#FF8A9A' }}>错误：{snap.error}</span></> : null}
          {snap.skipped > 0 && <><br />⚠️ {snap.skipped} 个热文件被跳过（持续写入中，下份快照会补上）——「恢复」页可查看清单</>}
          <div className="da-actions">
            <button className="da-btn sm ghost" onClick={(e) => { e.stopPropagation(); onVerify() }}>校验这份</button>
            <button className="da-btn sm ghost" onClick={(e) => { e.stopPropagation(); goRestore() }}>去恢复…</button>
          </div>
        </div>
      )}
    </div>
  )
}
