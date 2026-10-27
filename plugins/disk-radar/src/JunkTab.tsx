/**
 * 垃圾清理 Tab：开发垃圾分组（deps/build/cache/custom）+ 两步删除：
 * 移入隔离区（可恢复）→ 确认后彻底删除。所有删除都是人手点击，AI 无法代删。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import core from '../shared/disk-core.js'
import { loadJunk, loadQman, cmdQuarantine, cmdRestore, cmdPurge, cmdPurgeAll, cmdScan, timeAgo, fmtTime, type JunkDoc, type JunkItem, type QmanDoc } from './model'
import { RootSelect, type TabProps } from './Panel'

const KIND_ORDER = ['deps', 'build', 'cache', 'custom'] as const
const KIND_LABEL = core.JUNK_KIND_LABEL as Record<string, string>

export default function JunkTab({ data, showToast }: TabProps) {
  const [rid, setRid] = useState('')
  const [junk, setJunk] = useState<JunkDoc | null>(null)
  const [qman, setQman] = useState<QmanDoc | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const lastRid = useRef('')

  const roots = data?.roots || []
  const root = roots.find((r) => r.id === (rid || roots[0]?.id))

  const reloadJunk = useCallback(async (rootId: string, silent = false) => {
    if (!rootId) return
    if (!silent) setLoading(true)
    try {
      const [j, q] = await Promise.all([loadJunk(rootId), loadQman(rootId)])
      setJunk(j)
      setQman(q)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const effRoot = rid || roots[0]?.id || ''
    if (effRoot && effRoot !== lastRid.current) {
      lastRid.current = effRoot
      reloadJunk(effRoot)
    }
  }, [rid, roots, reloadJunk])

  const act = async (id: string, fn: () => Promise<{ ok: boolean; payload?: { errors?: { error: string }[] }; error?: string }>) => {
    if (!root) return
    setBusyId(id)
    try {
      const r = await fn()
      if (!r.ok) { showToast(r.error || '操作失败', true); return }
      const errs = r.payload?.errors || []
      if (errs.length) showToast(errs.map((e) => e.error).join('；'), true)
      else showToast('完成')
      await reloadJunk(root.id, true)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusyId('')
    }
  }

  const quarantine = (ids: string[]) => root && act(ids[0] || 'batch', () => cmdQuarantine(root.id, ids))
  const restore = (id: string) => root && act(id, () => cmdRestore(root.id, [id]))
  const purge = (id: string) => {
    if (!root) return
    if (!window.confirm('彻底删除后无法恢复（不走系统回收站）。确定吗？')) return
    act(id, () => cmdPurge(root.id, [id]))
  }
  const purgeAll = () => {
    if (!root) return
    const n = qman?.items.length || 0
    if (!n) return
    if (!window.confirm(`彻底销毁隔离区全部 ${n} 项（无法恢复）。确定吗？`)) return
    act('all', () => cmdPurgeAll(root.id))
  }
  const rescan = async () => {
    if (!root) return
    try {
      const r = await cmdScan(root.path, false)
      showToast(r.ok ? '已发起重新扫描，扫描完回来刷新' : (r.error || '入队失败'), !r.ok)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const items = junk?.items || []
  const groups: { kind: string; list: JunkItem[] }[] = KIND_ORDER
    .map((k) => ({ kind: k as string, list: items.filter((it) => it.kind === k) }))
    .filter((g) => g.list.length)
  const other = items.filter((it) => !KIND_ORDER.includes(it.kind as typeof KIND_ORDER[number]))
  if (other.length) groups.push({ kind: 'other', list: other })
  const totalBytes = items.reduce((s, it) => s + (it.bytes || 0), 0)
  const qItems = qman?.items || []

  return (
    <div>
      <div className="dr-card" style={{ marginTop: 4 }}>
        <RootSelect data={data} value={rid || roots[0]?.id || ''} onChange={(v) => { setRid(v); lastRid.current = v; reloadJunk(v) }} />
      </div>

      {!roots.length && <div className="dr-empty">先在「总览」登记一个目录。</div>}

      {roots.length > 0 && (
        <>
          <div className="dr-sec">
            <span className="dr-bar" />可回收垃圾
            <span className="dr-hint">
              {junk?.at ? `${timeAgo(junk.at)}扫描${junk.partial ? '（不完整）' : ''} · 共 ${items.length} 项 ${core.fmtBytes(totalBytes)}` : '还没有扫描数据'}
            </span>
          </div>

          {loading && <div className="dr-err" style={{ color: '#8B95A7' }}><span className="dr-spin" /> 载入中…</div>}

          {!loading && !items.length && (
            <div className="dr-card"><div className="dr-empty">
              {junk?.at
                ? `没发现开发垃圾（${timeAgo(junk.at)}扫的）。\n要么真的很干净，要么垃圾在更深层——「快扫」全深度都会找，深扫可确保预算充足。`
                : '扫描一次才会出现垃圾清单——去「总览」点「快扫」，或点右上按钮。'}
              <div style={{ marginTop: 10 }}>
                <button className="dr-btn sm ghost" onClick={rescan}>重新扫描</button>
              </div>
            </div></div>
          )}

          {groups.map((g) => {
            const gBytes = g.list.reduce((s, it) => s + (it.bytes || 0), 0)
            return (
              <div className="dr-card" key={g.kind}>
                <div className="dr-junk-h">
                  {KIND_LABEL[g.kind] || g.kind}
                  <span className="dr-tag">{g.list.length} 项 · {core.fmtBytes(gBytes)}</span>
                  <button
                    className="dr-btn sm amber"
                    style={{ marginLeft: 'auto' }}
                    disabled={!!busyId || !root}
                    onClick={() => quarantine(g.list.map((it) => it.id))}
                  >全部移入隔离区</button>
                </div>
                {g.list.slice(0, 60).map((it) => (
                  <div className="dr-item" key={it.id}>
                    <div className="dr-item-m">
                      <div className="dr-mono">{it.relPath}</div>
                      <div className="dr-sub">
                        {core.fmtBytes(it.bytes)} · {it.files} 文件 · 最后写入 {timeAgo(it.lastWrite)}
                        {it.note ? ` · ${it.note}` : ''}
                      </div>
                    </div>
                    <button
                      className="dr-btn sm amber"
                      disabled={!!busyId}
                      onClick={() => quarantine([it.id])}
                    >{busyId === it.id ? '处理中…' : '移入隔离区'}</button>
                  </div>
                ))}
                {g.list.length > 60 && <div className="dr-sub" style={{ padding: '6px 13px' }}>…还有 {g.list.length - 60} 项（用「全部移入」处理）</div>}
              </div>
            )
          })}

          <div className="dr-sec">
            <span className="dr-bar" />隔离区
            <span className="dr-hint">
              {qItems.length ? `${qItems.length} 项待处理` : '空'}
              {data?.settings.quarantineDays ? ` · 超 ${data.settings.quarantineDays} 天自动销毁` : ' · 自动销毁已关闭'}
            </span>
          </div>

          <div className="dr-card">
            {!qItems.length ? (
              <div className="dr-empty">移入隔离区 = 同盘改名，瞬间完成、随时可恢复；确认不要了再「彻底删除」。</div>
            ) : (
              <>
                {qItems.map((it) => (
                  <div className="dr-item" key={it.id}>
                    <div className="dr-item-m">
                      <div className="dr-mono">{it.name} <span className="dr-sub">← {it.relPath}</span></div>
                      <div className="dr-sub">{core.fmtBytes(it.bytes)} · 移入于 {fmtTime(it.movedAt)}</div>
                    </div>
                    <button className="dr-btn sm ghost" disabled={!!busyId} onClick={() => restore(it.id)}>恢复</button>
                    <button className="dr-btn sm danger" disabled={!!busyId} onClick={() => purge(it.id)}>彻底删除</button>
                  </div>
                ))}
                <div style={{ padding: '9px 13px', display: 'flex', gap: 8, borderTop: '1px solid #1a202c' }}>
                  <span className="dr-kv" style={{ flex: 1, alignSelf: 'center' }}>
                    合计 {core.fmtBytes(qItems.reduce((s, it) => s + (it.bytes || 0), 0))}（这些空间要彻底删除后才真正释放）
                  </span>
                  <button className="dr-btn sm danger" disabled={!!busyId} onClick={purgeAll}>清空隔离区</button>
                </div>
              </>
            )}
          </div>

          <div className="dr-sub" style={{ padding: '0 18px 8px' }}>
            安全说明：AI 工具全部只读，无法替你删除；「文件被占用」的条目（比如开着 dev 服务的 target/）关掉占用进程后重试即可——口袋主机可以帮你找到占用者。
          </div>
        </>
      )}
    </div>
  )
}
