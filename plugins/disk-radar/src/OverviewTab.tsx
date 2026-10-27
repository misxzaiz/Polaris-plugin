/**
 * 总览 Tab：扫描进度条 + 根目录卡片（总量/卷余量/增量/垃圾）+ 登记新根 + 空态引导
 */
import { useState } from 'react'
import { fmtBytes, fmtDelta } from '../shared/disk-core.js'
import { cmdScan, cmdCancel, cmdRootsAdd, timeAgo } from './model'
import type { TabProps } from './Panel'

export default function OverviewTab({ data, reload, showToast, goTab, onSendToChat }: TabProps & {
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [newPath, setNewPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const scan = data?.scan || null
  const roots = data?.roots || []
  const state = (data?.state && data.state.roots ? data.state : { roots: {}, updatedAt: 0 })

  const addRoot = async () => {
    const p = newPath.trim()
    if (!p || busy) return
    setBusy(true)
    try {
      const r = await cmdRootsAdd(p)
      if (!r.ok) { showToast(r.error || '登记失败', true); return }
      setNewPath('')
      showToast(r.payload?.existed ? '该目录已在雷达里，开始扫描…' : '已登记，开始首次扫描…')
      await cmdScan(p, false)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const startScan = async (path: string | undefined, deep: boolean) => {
    try {
      const r = await cmdScan(path, deep)
      if (!r.ok) { showToast(r.error || '扫描入队失败', true); return }
      showToast(deep ? '深扫已入队（更久更全）' : '扫描已入队')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const cancel = async () => {
    setCancelling(true)
    try {
      await cmdCancel()
      showToast('已请求取消')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div>
      {scan && (
        <div className="dr-prog">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dr-spin" />
            <b style={{ fontSize: 12 }}>正在扫描 {scan.path}{scan.deep ? '（深扫）' : ''}</b>
            <button className="dr-btn sm danger" style={{ marginLeft: 'auto' }} disabled={cancelling} onClick={cancel}>
              {cancelling ? '取消中…' : '取消'}
            </button>
          </div>
          <div className="dr-prog-track"><div className="dr-prog-fill" style={{ width: '42%' }} /></div>
          <div className="dr-sub">
            已扫 {fmtBytes(scan.bytes)} · {scan.files} 文件 · 当前 {scan.currentPath || '…'}
          </div>
        </div>
      )}

      {!roots.length ? (
        <div className="dr-card"><div className="dr-empty">
          <div style={{ fontSize: 30, marginBottom: 8 }}>📡</div>
          <b>把你的磁盘交给雷达</b>
          <div>登记一个目录（比如 D:\space 或整个 D:\），雷达会扫描它的空间构成、<br />盯住增长、找出 node_modules / target 这类可回收的开发垃圾。</div>
          <div style={{ margin: '14px 0 4px', display: 'flex', gap: 8 }}>
            <input
              className="dr-inp"
              placeholder="输入绝对路径，如 D:\space"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRoot() }}
            />
            <button className="dr-btn" disabled={busy || !newPath.trim()} onClick={addRoot}>登记并扫描</button>
          </div>
          {onSendToChat && (
            <div style={{ marginTop: 10 }}>
              也可以直接对 AI 说：
              <a
                href="#"
                style={{ color: '#58A6FF', marginLeft: 6 }}
                onClick={(e) => { e.preventDefault(); onSendToChat('帮我看看 D 盘什么最占空间，有什么能清理的') }}
              >「帮我看看 D 盘什么最占空间，有什么能清理的」</a>
            </div>
          )}
        </div></div>
      ) : (
        <>
          {roots.map((r) => {
            const st = state.roots[r.id]
            const delta = st?.deltaBytes
            return (
              <div className="dr-card" key={r.id}>
                <div className="dr-card-b dr-rootcard">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <b style={{ fontSize: 13 }}>{r.label || r.path}</b>
                    {st?.partial && <span className="dr-badge-txt warn">快照不完整</span>}
                    <span className="dr-hint dr-kv">{timeAgo(st?.lastScanAt)}</span>
                  </div>
                  {!st || !st.lastScanAt ? (
                    <div className="dr-sub" style={{ marginTop: 6 }}>尚未扫描——点下方「快扫」建立基线。</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                        <span className="dr-total">{fmtBytes(st.total)}</span>
                        {delta != null && delta !== 0 && (
                          <span className={`dr-delta ${delta > 0 ? 'up' : 'down'}`}>
                            {delta > 0 ? '▲' : '▼'} {fmtDelta(delta)}
                          </span>
                        )}
                        {st.lastError && <span className="dr-badge-txt bad">上次出错</span>}
                      </div>
                      {st.volumeTotal ? (
                        <>
                          <div className="dr-volbar">
                            <i style={{ width: `${Math.max(0, Math.min(100, ((st.volumeTotal - (st.free || 0)) / st.volumeTotal) * 100))}%`, background: 'linear-gradient(90deg,#58A6FF,#BC8CFF)' }} />
                          </div>
                          <div className="dr-kv" style={{ marginTop: 4 }}>
                            卷余量 <b>{fmtBytes(st.free || 0)}</b> / {fmtBytes(st.volumeTotal)}
                          </div>
                        </>
                      ) : null}
                      <div className="dr-kv" style={{ marginTop: 3 }}>
                        {st.files} 文件 · 垃圾 <b>{st.junkCount || 0}</b> 项（{fmtBytes(st.junkBytes || 0)}）
                        {st.prevAt ? ` · 基线 ${timeAgo(st.prevAt)}` : ''}
                      </div>
                    </>
                  )}
                  <div className="dr-actions">
                    <button className="dr-btn sm" disabled={!!scan} onClick={() => startScan(r.path, false)}>快扫</button>
                    <button className="dr-btn sm ghost" disabled={!!scan} onClick={() => startScan(r.path, true)}>深扫</button>
                    <button className="dr-btn sm ghost" onClick={() => goTab('map')}>空间地图</button>
                    <button className="dr-btn sm ghost" onClick={() => goTab('junk')}>垃圾清理</button>
                  </div>
                </div>
              </div>
            )
          })}
          <div className="dr-card">
            <div className="dr-card-b" style={{ display: 'flex', gap: 8 }}>
              <input
                className="dr-inp"
                placeholder="再登记一个目录，如 C:\Users\28409"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addRoot() }}
              />
              <button className="dr-btn ghost" disabled={busy || !newPath.trim()} onClick={addRoot}>登记</button>
            </div>
          </div>
          <div className="dr-sub" style={{ padding: '2px 18px 8px' }}>
            自动快照：{data?.settings.autoSnapshot ? `每 ${data.settings.snapshotHours} 小时` : '已关闭'}（设置 Tab 可改）。AI 也能代劳：对它说「扫一下 D 盘」「有什么能删的」。
          </div>
        </>
      )}
    </div>
  )
}
