/**
 * 空间地图 Tab：squarified 矩形树图（快照 depth-1 / 下钻实时细查）+ Top 列表
 * 树图算法复用 shared/disk-core.js（与服务/单测同一实现）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import core from '../shared/disk-core.js'
import { loadSnaps, cmdProbe, timeAgo, type Snapshot, type TreeNode, type JunkItem } from './model'
import { RootSelect, type TabProps } from './Panel'

interface Crumb { path: string; label: string; tree: TreeNode[]; total: number; partial?: boolean; junk?: JunkItem[] }

const KIND_LABEL = core.JUNK_KIND_LABEL as Record<string, string>

function cellColor(nd: TreeNode, total: number): string {
  if (nd.j) return 'rgba(210,153,34,0.78)' // 垃圾节点橙色
  const share = total > 0 ? (nd.b || 0) / total : 0
  // 蓝紫梯度：越大越深
  const t = Math.max(0, Math.min(1, share * 4))
  const r = Math.round(88 + t * 100)
  const g = Math.round(166 - t * 60)
  const b = Math.round(255 - t * 40)
  return `rgba(${r},${g},${b},0.72)`
}

function Treemap({ nodes, total, onPick, height }: {
  nodes: TreeNode[]
  total: number
  onPick?: (nd: TreeNode) => void
  height: number
}) {
  const W = 1000
  const nodeByName = new Map(nodes.map((nd) => [nd.n, nd]))
  const rects = core.squarify(nodes.map((nd) => ({ name: nd.n, value: nd.b || 0 })), 0, 0, W, height)
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="空间矩形树图">
      {rects.map((rc) => {
        const nd = nodeByName.get(rc.name)
        if (!nd) return null
        const pct = total > 0 ? ((nd.b || 0) / total) * 100 : 0
        const showName = rc.w > 64 && rc.h > 30
        const showPct = rc.w > 64 && rc.h > 52
        return (
          <g key={`${rc.name}@${rc.x},${rc.y}`} className="dr-mapcell" onClick={() => onPick && onPick(nd)}>
            <rect x={rc.x} y={rc.y} width={rc.w} height={rc.h} rx={6} fill={cellColor(nd, total)} />
            <title>{`${nd.n} — ${core.fmtBytes(nd.b)}（${pct.toFixed(1)}%）${nd.j ? `【垃圾:${KIND_LABEL[nd.j] || nd.j}】` : ''}${nd.d ? '（无权限）' : ''}${onPick ? '\n点击下钻' : ''}`}</title>
            {showName && (
              <text x={rc.x + 8} y={rc.y + 20} fontSize={13} fill="#0b0e14" fontWeight={700} style={{ pointerEvents: 'none' }}>
                {nd.n.length > Math.floor(rc.w / 9) ? nd.n.slice(0, Math.max(3, Math.floor(rc.w / 9) - 1)) + '…' : nd.n}
              </text>
            )}
            {showPct && (
              <text x={rc.x + 8} y={rc.y + 40} fontSize={12} fill="#10141C" style={{ pointerEvents: 'none' }}>
                {core.fmtBytes(nd.b)} · {pct.toFixed(1)}%{nd.d ? ' · ?' : ''}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function SpaceMapTab({ data, reload, showToast }: TabProps) {
  const [rid, setRid] = useState('')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const [probing, setProbing] = useState(false)
  const lastLoadedRid = useRef('')

  const roots = data?.roots || []

  const loadLatest = useCallback(async (rootId: string, silent = false) => {
    if (!rootId) return
    if (!silent) setLoading(true)
    try {
      const snaps = await loadSnaps(rootId)
      setSnap(snaps[0] || null)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    const effRoot = rid || roots[0]?.id || ''
    if (effRoot && effRoot !== lastLoadedRid.current) {
      lastLoadedRid.current = effRoot
      setCrumbs([])
      loadLatest(effRoot)
    }
  }, [rid, roots, loadLatest])

  const root = roots.find((r) => r.id === (rid || roots[0]?.id))
  const rootPath = root?.path || ''

  const probe = async (dirPath: string, label: string) => {
    setProbing(true)
    try {
      const r = await cmdProbe(dirPath, 2, 15000)
      if (!r.ok) { showToast(r.error || '细查失败', true); return }
      const pl = r.payload
      if (!pl) return
      setCrumbs((c) => [...c, {
        path: dirPath, label, tree: pl.dirs || [], total: pl.total,
        partial: pl.partial, junk: pl.junkItems,
      }])
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setProbing(false)
    }
  }

  const probeInto = async (baseDir: string, nd: TreeNode) => {
    const sep = baseDir.includes('\\') ? '\\' : '/'
    const target = baseDir.endsWith(sep) ? baseDir + nd.n : baseDir + sep + nd.n
    await probe(target, nd.n)
  }

  const cur = crumbs.length ? crumbs[crumbs.length - 1] : null
  const probeBase = cur ? cur.path : rootPath
  const treeNodes: TreeNode[] = cur ? (cur.tree || []) : core.sortTree([...(snap?.dirs || [])])
  const treeTotalBytes = cur ? cur.total : (snap?.total || 0)
  const topList = [...treeNodes].sort((a, b) => (b.b || 0) - (a.b || 0)).slice(0, 15)
  const junkBytesInTree = treeNodes.reduce((s, nd) => s + (nd.j ? nd.b : 0), 0)

  return (
    <div>
      <div className="dr-card" style={{ marginTop: 4 }}>
        <RootSelect data={data} value={rid || roots[0]?.id || ''} onChange={(v) => { setRid(v); setCrumbs([]); lastLoadedRid.current = v; loadLatest(v) }} />
      </div>

      {!roots.length && <div className="dr-empty">先在「总览」登记一个目录再来看空间地图。</div>}

      {roots.length > 0 && (
        <>
          <div className="dr-crumbs">
            <span
              className={`dr-crumb ${!cur ? 'cur' : ''}`}
              onClick={() => setCrumbs([])}
            >
              {root?.label || rootPath}{snap ? ` · ${core.fmtBytes(snap.total)}` : ''}
            </span>
            {crumbs.map((c, i) => (
              <span key={c.path} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ color: '#3d4657' }}>▸</span>
                <span
                  className={`dr-crumb ${i === crumbs.length - 1 ? 'cur' : ''}`}
                  onClick={() => setCrumbs(crumbs.slice(0, i + 1))}
                >{c.label.split(' ▸ ').pop()}</span>
              </span>
            ))}
            {probing && <span className="dr-spin" style={{ marginLeft: 6 }} />}
          </div>

          <div className="dr-mapwrap">
            {loading ? (
              <div className="dr-empty"><span className="dr-spin" /> 载入快照…</div>
            ) : !treeNodes.length ? (
              <div className="dr-empty">
                {cur ? '（空目录或预算内没扫到内容）' : '还没有快照——去「总览」点「快扫」。'}
              </div>
            ) : (
              <Treemap
                nodes={treeNodes}
                total={treeTotalBytes}
                height={380}
                onPick={probing ? undefined : (nd) => probeInto(probeBase, nd)}
              />
            )}
          </div>

          <div className="dr-sub" style={{ padding: '0 18px 8px' }}>
            {cur ? (
              <>实时细查：{cur.path} · {core.fmtBytes(cur.total)}{cur.partial ? ' · 预算内未扫完' : ''}{cur.junk && cur.junk.length ? ` · 发现垃圾 ${cur.junk.length} 项` : ''}</>
            ) : snap ? (
              <>快照 #{snap.seq} · {timeAgo(snap.at)}{snap.partial ? ' · 不完整（深扫可补全）' : ''}
                {snap.volume ? ` · 卷余量 ${core.fmtBytes(snap.volume.free)}` : ''}
                {snap.deniedDirs ? ` · ${snap.deniedDirs} 目录无权限` : ''}
                {junkBytesInTree > 0 ? ` · 橙色=可回收垃圾 ${core.fmtBytes(junkBytesInTree)}` : ''}</>
            ) : null}
          </div>

          {cur && cur.junk && cur.junk.length > 0 && (
            <div className="dr-card">
              <div className="dr-junk-h">🧹 本次细查发现垃圾</div>
              {cur.junk.slice(0, 8).map((it) => (
                <div className="dr-item" key={it.id}>
                  <span className="dr-item-m dr-mono">{it.relPath}</span>
                  <span className="dr-tag">{core.fmtBytes(it.bytes)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="dr-card">
            <div className="dr-junk-h">Top 目录{cur ? '' : '（快照）'}<span className="dr-hint">{cur ? '点击行下钻（实时细查）' : '点击行下钻'}</span></div>
            <div style={{ padding: '2px 0 6px' }}>
              <table className="dr-tbl">
                <tbody>
                  {topList.map((nd) => {
                    const pct = treeTotalBytes > 0 ? ((nd.b || 0) / treeTotalBytes) * 100 : 0
                    const canDrill = cur ? true : !!(nd.c && nd.c.length)
                    return (
                      <tr
                        key={nd.n}
                        style={{ cursor: probing ? 'wait' : canDrill ? 'pointer' : 'default' }}
                        onClick={() => { if (!probing) probeInto(probeBase, nd) }}
                      >
                        <td>
                          {nd.n}{nd.j ? <span className="dr-badge-txt warn" style={{ marginLeft: 6 }}>垃圾</span> : null}
                          {nd.d ? <span className="dr-badge-txt bad" style={{ marginLeft: 6 }}>无权限</span> : null}
                        </td>
                        <td style={{ minWidth: 90 }}>
                          <div style={{ background: '#0d1017', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: nd.j ? '#D29922' : '#58A6FF' }} />
                          </div>
                        </td>
                        <td className="dr-num">{core.fmtBytes(nd.b)}</td>
                        <td className="dr-num" style={{ color: '#5C6678' }}>{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!topList.length && <div className="dr-empty">（空目录）</div>}
            </div>
          </div>

          {!cur && (
            <div style={{ padding: '0 18px 10px', display: 'flex', gap: 8 }}>
              <button className="dr-btn sm ghost" disabled={loading || !root} onClick={() => root && loadLatest(root.id)}>刷新快照</button>
              <button className="dr-btn sm ghost" disabled={probing} onClick={() => rootPath && probe(rootPath, root?.label || rootPath)}>实时细查根目录</button>
              <button className="dr-btn sm ghost" onClick={() => reload()}>刷新面板数据</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
