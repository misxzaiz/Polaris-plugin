/**
 * 恢复 Tab：选快照 → 检索文件 → 勾选恢复到暂存目录。
 * 安全红线：恢复产物只落 <备份库>/restored/<stamp>/，绝不直写数据根；
 * 替换前提示用户先关闭 Polaris（防覆盖活跃写入）。
 */
import { useState } from 'react'
import { listSnapshotFiles, restoreFiles, formatBytes, type Overview, type CmdResult } from './model'
import type { Toast } from './Panel'

export default function RestoreTab({ data, showToast }: {
  data: Overview | null
  reload: () => Promise<Overview | null>
  showToast: Toast
}) {
  const [snapId, setSnapId] = useState('')
  const [query, setQuery] = useState('')
  const [listing, setListing] = useState(false)
  const [list, setList] = useState<CmdResult | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState<CmdResult | null>(null)

  if (!data) return <div className="da-empty">载入中…</div>

  const effectiveSnapId = snapId || (data.snapshots[0]?.id ?? '')

  const browse = async () => {
    if (!effectiveSnapId || listing) return
    setListing(true)
    setResult(null)
    try {
      const r = await listSnapshotFiles(effectiveSnapId, query)
      if (!r.ok) { showToast(r.error || '浏览失败', 'bad'); setList(null); return }
      setList(r)
      setChecked(new Set())
    } finally {
      setListing(false)
    }
  }

  const doRestore = async (all: boolean) => {
    if (!effectiveSnapId || restoring) return
    const paths = all ? null : [...checked]
    if (!all && paths!.length === 0) { showToast('先勾选要恢复的文件（或选「恢复全部」）', 'bad'); return }
    if (!window.confirm(all
      ? `把快照 ${effectiveSnapId} 的全部 ${list?.total ?? ''} 个文件恢复到暂存目录？`
      : `把勾选的 ${checked.size} 个文件恢复到暂存目录？`)) return
    setRestoring(true)
    try {
      const r = await restoreFiles(effectiveSnapId, paths)
      setResult(r)
      if (r.ok) showToast(`已恢复 ${r.restored} 个文件到暂存目录`, 'good')
      else showToast(r.error || '恢复失败', 'bad')
    } finally {
      setRestoring(false)
    }
  }

  const toggle = (p: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  return (
    <div>
      <div className="da-banner ok">
        🛡️ 恢复产物只写入备份库的 <b>restored/ 暂存目录</b>，绝不会覆盖数据根。
        替换回数据根前：先完全退出 Polaris → 手动复制替换（建议先把当前文件改名留底）→ 重新启动。
      </div>
      <div className="da-sec"><i className="da-bar" />选择快照</div>
      <div className="da-card">
        <div className="da-card-b">
          <select className="da-sel" value={snapId} onChange={(e) => { setSnapId(e.target.value); setList(null); setResult(null) }} style={{ width: '100%' }}>
            <option value="">最新一份快照</option>
            {data.snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.finishedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} {s.type === 'full' ? '全量' : '增量'} {s.totalFiles} 文件
              </option>
            ))}
          </select>
          <div className="da-row" style={{ marginTop: 8 }}>
            <input
              className="da-inp" style={{ flex: 1, minWidth: 0 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void browse() }}
              placeholder="路径过滤，如 dialogs / kv.db / config.json"
            />
            <button className="da-btn" disabled={!effectiveSnapId || listing} onClick={() => void browse()}>{listing ? '浏览中…' : '浏览'}</button>
          </div>
        </div>
      </div>

      {list && (
        <>
          <div className="da-sec">
            <i className="da-bar" />文件清单
            <span className="da-hint">
              {list.total} 文件 · 匹配 {list.matched}{(list.files?.length || 0) < (list.matched || 0) ? ' · 显示前 200' : ''}
              {list.skipped?.length ? ` · ${list.skipped.length} 个热文件曾被跳过` : ''}
            </span>
          </div>
          <div className="da-card">
            <div className="da-card-b" style={{ padding: 0 }}>
              <div style={{ maxHeight: 260, overflowY: 'auto', padding: '8px 13px' }}>
                {(list.files || []).map((f) => (
                  <label className="da-file" key={f.p}>
                    <input
                      type="checkbox"
                      checked={checked.has(f.p)}
                      onChange={() => toggle(f.p)}
                      style={{ flexShrink: 0 }}
                    />
                    <span className="p" title={f.p}>{f.p}</span>
                    <span className="s">{formatBytes(f.s)}{f.c ? ' ·' : ''}</span>
                  </label>
                ))}
                {(list.files || []).length === 0 && <div className="da-empty">无匹配文件</div>}
              </div>
              <div className="da-actions" style={{ padding: '10px 13px' }}>
                <button className="da-btn sm ghost" onClick={() => setChecked(new Set((list.files || []).map((f) => f.p)))}>全选（当前列表）</button>
                <button className="da-btn sm" disabled={restoring || checked.size === 0} onClick={() => void doRestore(false)}>
                  {restoring ? '恢复中…' : `恢复所选（${checked.size}）`}
                </button>
                <button className="da-btn sm ghost" disabled={restoring} onClick={() => void doRestore(true)}>
                  恢复全部（{list.total}）
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {result && (
        <div className="da-sec"><i className="da-bar" />恢复结果</div>
      )}
      {result && (
        <div className="da-card">
          <div className="da-card-b">
            {result.ok ? (
              <>
                <div className="da-sub">已恢复 <b>{result.restored}</b>/{result.total} 个文件到：</div>
                <div className="da-sub" style={{ color: '#7EB8FF', wordBreak: 'break-all', margin: '6px 0' }}>{result.stagingDir}</div>
                {result.notFound?.length ? <div className="da-sub" style={{ color: '#F2C063' }}>未找到 {result.notFound.length} 个（可能对象缺失）：{result.notFound.slice(0, 3).join('、')}</div> : null}
                <div className="da-sub" style={{ marginTop: 6 }}>
                  下一步：完全退出 Polaris → 从暂存目录复制文件到数据根对应位置（先改名留底）→ 重启 Polaris。
                </div>
              </>
            ) : (
              <div className="da-sub" style={{ color: '#FF8A9A' }}>失败：{result.error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
