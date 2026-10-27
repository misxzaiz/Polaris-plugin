/**
 * 书签库 Tab：搜索/筛选/分页列表 + 单条动作（重查/标记访问/删除）。
 */
import React from 'react'
import type { DigRecord } from './model'
import { core, fmtTime, statusColor, statusLabel } from './model'

interface Props {
  records: DigRecord[]
  busy: boolean
  onRecheck: (ids: string[]) => void
  onVisit: (r: DigRecord) => void
  onRemove: (ids: string[]) => void
}

const PAGE = 50
const CATS = ['代码仓库', '技术社区', '文档', '视频', '论文', '购物', '社交', '音乐', '笔记协作', '搜索', '网盘', '工具', '其他']

const S = {
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' as const, marginBottom: 10 },
  input: {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))',
    background: 'transparent', color: 'inherit', fontSize: 12.5,
  },
  sel: {
    padding: '6px 8px', borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))',
    background: 'transparent', color: 'inherit', fontSize: 12.5,
  },
  item: { padding: '8px 10px', borderRadius: 8, background: 'var(--p-panel, rgba(128,128,128,.08))', marginBottom: 6 },
  title: { fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  sub: { fontSize: 11.5, color: 'var(--p-text-dim, #999)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  btn: { padding: '3px 10px', borderRadius: 6, border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 11.5 },
  btnDanger: { padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(220,80,80,.4)', background: 'transparent', color: '#d9564a', cursor: 'pointer', fontSize: 11.5 },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6 },
}

export default function LibraryTab({ records, busy, onRecheck, onVisit, onRemove }: Props) {
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [cat, setCat] = React.useState('')
  const [page, setPage] = React.useState(0)

  const filtered = React.useMemo(() => {
    const out = core.searchRecords(records, q, { status: status || undefined, category: cat || undefined })
    return out.sort((a, b) => (b.lastCheckedAt || 0) - (a.lastCheckedAt || 0) || (b.importedAt || 0) - (a.importedAt || 0))
  }, [records, q, status, cat])

  React.useEffect(() => { setPage(0) }, [q, status, cat])

  const pageItems = filtered.slice(page * PAGE, (page + 1) * PAGE)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))

  return (
    <div>
      <div style={S.row}>
        <input style={{ ...S.input, flex: 1, minWidth: 160 }} placeholder="搜索标题/URL/文件夹/标签…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <select style={S.sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="alive">存活</option>
          <option value="dead">死链</option>
          <option value="pending">未检查</option>
        </select>
        <select style={S.sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">全部分类</option>
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)', marginBottom: 8 }}>
        {filtered.length} 条{pages > 1 ? ` · 第 ${page + 1}/${pages} 页` : ''}
      </div>
      {pageItems.map((r) => (
        <div key={r.id} style={S.item}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...S.dot, background: statusColor(r.status), flexShrink: 0 }} title={statusLabel(r.status)} />
            <div style={{ ...S.title, flex: 1 }}>{r.title || r.host}</div>
            <button style={S.btn} disabled={busy} title="单条重查" onClick={() => onRecheck([r.id])}>重查</button>
            <button style={S.btn} disabled={busy} title="记录一次重访（影响复活权重）" onClick={() => onVisit(r)}>重访</button>
            <button style={S.btnDanger} disabled={busy} onClick={() => onRemove([r.id])}>删</button>
          </div>
          <div style={S.sub}>
            {statusLabel(r.status)}{r.httpStatus ? ` · HTTP ${r.httpStatus}` : ''}{r.latencyMs ? ` · ${r.latencyMs}ms` : ''}
            {r.status === 'redirect' && r.finalUrl ? ' · 已重定向' : ''}{r.failReason ? ` · ${r.failReason}` : ''}
          </div>
          <div style={S.sub}>
            {r.folder ? `${r.folder} · ` : ''}{core.classifyUrl(r.url)} · 存于 {fmtTime(r.addedAt)} · 查于 {fmtTime(r.lastCheckedAt)}
            {r.tags.length ? ` · 🏷 ${r.tags.join(', ')}` : ''}
          </div>
          <a href={r.url} target="_blank" rel="noreferrer" style={{ ...S.sub, color: 'var(--p-accent, #4a7dff)', textDecoration: 'none' }}>{r.url}</a>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ color: 'var(--p-text-dim, #999)', padding: 20, textAlign: 'center' }}>
          {records.length ? '没有匹配的书签。' : '书签库还是空的——去「检查」页导入浏览器书签导出文件。'}
        </div>
      )}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          <button style={S.btn} disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
          <span style={{ fontSize: 12, color: 'var(--p-text-dim, #999)', alignSelf: 'center' }}>{page + 1} / {pages}</span>
          <button style={S.btn} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}
