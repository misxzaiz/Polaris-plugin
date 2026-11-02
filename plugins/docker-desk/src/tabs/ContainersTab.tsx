/**
 * ContainersTab.tsx —— 容器列表：compose 项目分组 + 筛选/搜索 + 启停重启/删除（typed confirm）+ 进日志
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ContainerItem, Grouped, ServiceError } from '../model'
import { stateChip, ConfirmRequest } from '../Panel'

type FilterKey = 'all' | 'running' | 'exited'

interface Props {
  engineOk: boolean
  showToast: (t: string, bad?: boolean) => void
  jumpToLogs: (name: string) => void
  askConfirm: (req: ConfirmRequest) => void
  onMutated: () => void
}

export default function ContainersTab({ engineOk, showToast, jumpToLogs, askConfirm, onMutated }: Props) {
  const [items, setItems] = useState<ContainerItem[]>([])
  const [grouped, setGrouped] = useState<Grouped | null>(null)
  const [groupMode, setGroupMode] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')
  const [auto, setAuto] = useState(true)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!engineOk) return
    setLoading(true)
    try {
      const r = await api.containers(true)
      setItems(r.items || [])
      setGrouped(r.grouped || null)
      setErr('')
    } catch (e) {
      setErr((e as ServiceError).message || String(e))
    } finally {
      setLoading(false)
    }
  }, [engineOk])

  useEffect(() => {
    load()
    if (!auto) return () => undefined
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load, auto])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return items.filter((c) => {
      if (filter === 'running' && !c.running) return false
      if (filter === 'exited' && (c.running || c.state !== 'exited')) return false
      if (kw && !`${c.name} ${c.image} ${c.composeProject}`.toLowerCase().includes(kw)) return false
      return true
    })
  }, [items, filter, q])

  const filteredGrouped = useMemo(() => (grouped
    ? {
        projects: grouped.projects
          .map((g) => ({ ...g, items: g.items.filter((c) => filtered.some((f) => f.id === c.id)) }))
          .filter((g) => g.items.length > 0),
        loose: grouped.loose.filter((c) => filtered.some((f) => f.id === c.id)),
      }
    : null), [grouped, filtered])

  const doAction = useCallback(async (c: ContainerItem, action: 'start' | 'stop' | 'restart') => {
    setBusyId(c.id)
    try {
      await api.containerAction(c.id, action)
      showToast(`容器 ${c.name} 已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}`)
      await load()
      onMutated()
    } catch (e) {
      showToast((e as ServiceError).message || '操作失败', true)
    } finally {
      setBusyId('')
    }
  }, [showToast, load, onMutated])

  const askRemove = useCallback((c: ContainerItem) => {
    askConfirm({
      title: `删除容器 ${c.name}`,
      expect: c.name,
      hint: `镜像 ${c.image} · 当前状态 ${c.stateText}。删除后容器层（未挂载卷的数据）不可恢复；卷不会被删除。`,
      onConfirm: async () => {
        await api.containerRemove(c.id, c.name, false)
        showToast(`容器 ${c.name} 已删除`)
        await load()
        onMutated()
      },
    })
  }, [askConfirm, showToast, load, onMutated])

  if (!engineOk) return <div className="dk-pad dk-dim">Docker 引擎未连接。</div>

  return (
    <div className="dk-pad">
      <div className="dk-row">
        {([['all', `全部 ${items.length}`], ['running', `运行中 ${items.filter((x) => x.running).length}`], ['exited', `已退出 ${items.filter((x) => x.state === 'exited').length}`]] as [FilterKey, string][]).map(([k, label]) => (
          <button key={k} type="button" className={`dk-btn dk-btn-sm ${filter === k ? 'dk-tab-on' : ''}`} style={filter === k ? { background: '#1c2940', color: '#fff' } : undefined} onClick={() => setFilter(k)}>{label}</button>
        ))}
        <input className="dk-input" style={{ width: 180 }} placeholder="搜索 名称/镜像/项目" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dk-grow" />
        <label className="dk-dim dk-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={groupMode} onChange={(e) => setGroupMode(e.target.checked)} />compose 分组
        </label>
        <label className="dk-dim dk-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />5s 自动刷新
        </label>
        <button type="button" className="dk-btn dk-btn-sm" onClick={load}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      {err && <div className="dk-err dk-mt8">{err}</div>}
      {!err && filtered.length === 0 && <div className="dk-dim dk-mt8">没有匹配的容器。</div>}

      {groupMode && filteredGrouped ? (
        <>
          {filteredGrouped.projects.map((g) => (
            <div key={g.name}>
              <div className="dk-group">
                <strong>◆ {g.name}</strong>
                <span className="dk-dim">compose 项目 · {g.running}/{g.total} 运行中</span>
              </div>
              <ContainerTable items={g.items} busyId={busyId} onAction={doAction} onLogs={jumpToLogs} onRemove={askRemove} />
            </div>
          ))}
          {filteredGrouped.loose.length > 0 && (
            <div>
              <div className="dk-group"><strong>◇ 独立容器</strong><span className="dk-dim">不属于任何 compose 项目</span></div>
              <ContainerTable items={filteredGrouped.loose} busyId={busyId} onAction={doAction} onLogs={jumpToLogs} onRemove={askRemove} />
            </div>
          )}
        </>
      ) : (
        <ContainerTable items={filtered} busyId={busyId} onAction={doAction} onLogs={jumpToLogs} onRemove={askRemove} />
      )}
    </div>
  )
}

function ContainerTable({ items, busyId, onAction, onLogs, onRemove }: {
  items: ContainerItem[]
  busyId: string
  onAction: (c: ContainerItem, a: 'start' | 'stop' | 'restart') => void
  onLogs: (name: string) => void
  onRemove: (c: ContainerItem) => void
}) {
  return (
    <table className="dk-table">
      <thead>
        <tr><th>名称</th><th>镜像</th><th>状态</th><th>端口</th><th>创建</th><th style={{ width: 250 }}>操作</th></tr>
      </thead>
      <tbody>
        {items.map((c) => {
          const chip = stateChip(c.state)
          const busy = busyId === c.id
          return (
            <tr key={c.id}>
              <td>
                <span className="dk-mono">{c.name}</span>
                {c.composeService && <div className="dk-dim dk-small">service: {c.composeService}</div>}
              </td>
              <td className="dk-mono dk-dim">{c.image}</td>
              <td>
                <span className={`dk-chip ${chip.cls}`}>{chip.text}</span>
                {c.status && <div className="dk-dim dk-small">{c.status}</div>}
              </td>
              <td className="dk-mono dk-small">{c.ports.join(' ') || '—'}</td>
              <td className="dk-dim dk-small">{c.age}</td>
              <td>
                <div className="dk-row">
                  <button type="button" className="dk-btn dk-btn-sm" onClick={() => onLogs(c.name)}>日志</button>
                  {c.running ? (
                    <>
                      <button type="button" className="dk-btn dk-btn-sm" disabled={busy} onClick={() => onAction(c, 'stop')}>停止</button>
                      <button type="button" className="dk-btn dk-btn-sm" disabled={busy} onClick={() => onAction(c, 'restart')}>重启</button>
                    </>
                  ) : (
                    <button type="button" className="dk-btn dk-btn-sm" disabled={busy} onClick={() => onAction(c, 'start')}>启动</button>
                  )}
                  <button type="button" className="dk-btn dk-btn-sm dk-btn-danger" disabled={busy} onClick={() => onRemove(c)}>删除</button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
