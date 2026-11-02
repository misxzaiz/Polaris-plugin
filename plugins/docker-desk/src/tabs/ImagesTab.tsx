/**
 * ImagesTab.tsx —— 镜像列表 + 磁盘占用汇总（system df）：dangling 过滤、typed confirm 删除
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, DfSummary, ImageItem, ServiceError } from '../model'
import { ConfirmRequest } from '../Panel'

interface Props {
  engineOk: boolean
  showToast: (t: string, bad?: boolean) => void
  askConfirm: (req: ConfirmRequest) => void
  onMutated: () => void
}

function fmtSize(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default function ImagesTab({ engineOk, showToast, askConfirm, onMutated }: Props) {
  const [items, setItems] = useState<ImageItem[]>([])
  const [df, setDf] = useState<DfSummary | null>(null)
  const [q, setQ] = useState('')
  const [danglingOnly, setDanglingOnly] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!engineOk) return
    try {
      const [r, d] = await Promise.all([api.images(), api.df().catch(() => null)])
      setItems(r.items || [])
      setDf(d?.df || null)
      setErr('')
    } catch (e) {
      setErr((e as ServiceError).message || String(e))
    }
  }, [engineOk])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return items.filter((i) => {
      if (danglingOnly && !(i.repo === '<none>' && i.containers === 0)) return false
      if (kw && !`${i.repo}:${i.tag} ${i.id}`.toLowerCase().includes(kw)) return false
      return true
    })
  }, [items, q, danglingOnly])

  const askRemove = useCallback((img: ImageItem) => {
    const full = img.repo === '<none>' ? img.id : `${img.repo}:${img.tag}`
    askConfirm({
      title: `删除镜像 ${full}`,
      expect: full,
      hint: `${fmtSize(img.size)} · ${img.containers ? `正被 ${img.containers} 个容器使用（删除会被引擎拒绝）` : '未被任何容器使用'}`,
      onConfirm: async () => {
        await api.imageRemove(img.id, full)
        showToast(`镜像 ${full} 已删除`)
        await load()
        onMutated()
      },
    })
  }, [askConfirm, showToast, load, onMutated])

  if (!engineOk) return <div className="dk-pad dk-dim">Docker 引擎未连接。</div>

  return (
    <div className="dk-pad">
      {df && (
        <div className="dk-banner" style={{ marginBottom: 12 }}>
          <strong>磁盘占用</strong>
          <div className="dk-kv">
            <span className="k">镜像</span><span>{df.imagesCount} 个 · {fmtSize(df.imagesSize)}（含 {df.danglingCount} 个 dangling）</span>
            <span className="k">容器层</span><span>{df.containersCount} 个 · {fmtSize(df.containersSize)}</span>
            <span className="k">卷</span><span>{df.volumesCount} 个 · {fmtSize(df.volumesSize)}</span>
            <span className="k">构建缓存</span><span>{df.buildCacheCount} 条 · {fmtSize(df.reclaimBuildCache)}</span>
            <span className="k">可回收估算</span><span className="dk-ok">{fmtSize(df.reclaimable)}（未使用镜像 + 构建缓存）</span>
          </div>
        </div>
      )}
      <div className="dk-row">
        <input className="dk-input" style={{ width: 200 }} placeholder="搜索 repo/tag/id" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="dk-dim dk-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={danglingOnly} onChange={(e) => setDanglingOnly(e.target.checked)} />只看无主镜像
        </label>
        <span className="dk-grow" />
        <button type="button" className="dk-btn dk-btn-sm" onClick={load}>刷新</button>
      </div>
      {err && <div className="dk-err dk-mt8">{err}</div>}
      {!err && filtered.length === 0 && <div className="dk-dim dk-mt8">没有匹配的镜像。</div>}
      {filtered.length > 0 && (
        <table className="dk-table dk-mt8">
          <thead>
            <tr><th>镜像</th><th>tag</th><th>大小</th><th>创建</th><th>被引用</th><th style={{ width: 80 }}>操作</th></tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td className="dk-mono">{i.repo}</td>
                <td className="dk-mono dk-dim">{i.tag}{i.tags.length > 1 ? ` +${i.tags.length - 1}` : ''}</td>
                <td className="dk-small">{fmtSize(i.size)}</td>
                <td className="dk-small dk-dim">{i.created ? new Date(i.created).toLocaleDateString('zh-CN') : '—'}</td>
                <td className="dk-small">{i.containers ? `${i.containers} 个容器` : <span className="dk-dim">未使用</span>}</td>
                <td>
                  <button type="button" className="dk-btn dk-btn-sm dk-btn-danger" onClick={() => askRemove(i)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
