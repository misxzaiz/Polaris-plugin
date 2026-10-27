/**
 * 设置 Tab：扫描根管理 / 自动快照 / 预算与保留 / 额外垃圾名 / 服务管理 / 数据管理
 */
import { useEffect, useState } from 'react'
import {
  cmdRootsAdd, cmdRootsRemove, saveSettings, serviceAction, listServiceStatus,
  kvGet, kvSet, kvDel,
  type ServiceStatus, type RadarSettings,
} from './model'
import type { TabProps } from './Panel'

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="dr-field">
      <div className="dr-field-l">
        <b>{title}</b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button className={`dr-toggle ${on ? 'on' : ''}`} onClick={onClick}><i /></button>
}

export default function SettingsTab({ data, reload, showToast }: TabProps) {
  const [newPath, setNewPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [svc, setSvc] = useState<ServiceStatus | null>(null)
  const [form, setForm] = useState<RadarSettings | null>(null)
  const [extraDirsText, setExtraDirsText] = useState('')
  const [excludeText, setExcludeText] = useState('')

  useEffect(() => {
    if (data && !form) {
      setForm(data.settings)
      setExtraDirsText((data.settings.extraJunkDirs || []).join(', '))
      setExcludeText((data.settings.excludeNames || []).join(', '))
    }
  }, [data, form])

  const refreshSvc = () => listServiceStatus().then(setSvc).catch(() => setSvc(null))
  useEffect(() => {
    refreshSvc()
    const t = setInterval(refreshSvc, 15000)
    return () => clearInterval(t)
  }, [])

  const patch = (p: Partial<RadarSettings>) => {
    const next = { ...(form as RadarSettings), ...p }
    setForm(next)
    saveSettings(next).then(() => reload()).catch((e) => showToast((e as Error).message, true))
  }

  const saveLists = () => {
    const parse = (t: string) => t.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
    patch({ extraJunkDirs: parse(extraDirsText), excludeNames: parse(excludeText) })
  }

  const addRoot = async () => {
    if (!newPath.trim() || busy) return
    setBusy(true)
    try {
      const r = await cmdRootsAdd(newPath.trim())
      if (!r.ok) { showToast(r.error || '登记失败', true); return }
      setNewPath('')
      showToast('已登记（回「总览」发起扫描）')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const removeRoot = async (rid: string) => {
    if (!window.confirm('移除该扫描根？历史快照/垃圾清单/隔离区清单都会清掉（磁盘上已隔离的文件保留不动）。')) return
    try {
      const r = await cmdRootsRemove(rid)
      if (!r.ok) { showToast(r.error || '移除失败', true); return }
      showToast('已移除')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const svcState = svc?.state || svc?.status || 'unknown'
  const svcRunning = svcState === 'running'

  const listMyKeys = async (): Promise<string[]> => {
    const { getHostInvoke } = await import('./host')
    const invoke = getHostInvoke()
    const res = await invoke<{ ok: boolean; result?: { keys?: string[] }; error?: string }>(
      'router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } },
    )
    const all = (res.ok && res.result?.keys) || []
    return all.filter((k) => k.startsWith('diskrad.'))
  }

  const exportData = async () => {
    try {
      const mine = await listMyKeys()
      const dump: Record<string, unknown> = {}
      for (const k of mine) {
        const v = await kvGet<unknown>(k)
        dump[k] = v
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `disk-radar-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(`已导出 ${mine.length} 个键`)
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('清空磁盘雷达的全部本地数据（设置/根/快照/垃圾/隔离区清单）？磁盘文件不受影响。')) return
    if (!window.confirm('再次确认：这一步不可撤销（隔离区文件仍在磁盘上，但面板不再显示它们）。')) return
    try {
      const mine = await listMyKeys()
      for (const k of mine) await kvDel(k)
      await kvSet('diskrad.meta', { clearedAt: Date.now() }) // 留一个已清空标记
      showToast(`已清空 ${mine.length} 个键`)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div>
      <div className="dr-sec"><span className="dr-bar" />扫描根目录</div>
      <div className="dr-card">
        {(data?.roots || []).length ? (data?.roots || []).map((r) => (
          <div className="dr-item" key={r.id}>
            <div className="dr-item-m">
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.label || r.path}</div>
              <div className="dr-sub dr-mono">{r.path}</div>
            </div>
            <button className="dr-btn sm danger" onClick={() => removeRoot(r.id)}>移除</button>
          </div>
        )) : (
          <div className="dr-empty">还没有登记扫描根。</div>
        )}
        <div style={{ display: 'flex', gap: 8, padding: '9px 13px', borderTop: '1px solid #1a202c' }}>
          <input
            className="dr-inp"
            placeholder="绝对路径，如 D:\space"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addRoot() }}
          />
          <button className="dr-btn ghost" disabled={busy || !newPath.trim()} onClick={addRoot}>登记</button>
        </div>
      </div>

      <div className="dr-sec"><span className="dr-bar" />自动快照</div>
      <div className="dr-card">
        <Field title="自动快照" hint="到期自动快扫一次，增量归因靠它积累">
          <Toggle on={form?.autoSnapshot ?? true} onClick={() => patch({ autoSnapshot: !(form?.autoSnapshot ?? true) })} />
        </Field>
        <Field title="间隔（小时）" hint="每个根的快照周期">
          <input
            className="dr-numin" type="number" min={1} max={720}
            value={form?.snapshotHours ?? 24}
            onChange={(e) => patch({ snapshotHours: Math.max(1, Number(e.target.value) || 24) })}
          />
        </Field>
      </div>

      <div className="dr-sec"><span className="dr-bar" />扫描与保留</div>
      <div className="dr-card">
        <Field title="快扫预算（秒）" hint="单根单次快扫的时间上限，超时落「不完整」快照">
          <input className="dr-numin" type="number" min={10} max={1800} value={form?.autoBudgetSec ?? 90}
            onChange={(e) => patch({ autoBudgetSec: Math.max(10, Number(e.target.value) || 90) })} />
        </Field>
        <Field title="深扫预算（分钟）" hint="深扫的时间上限">
          <input className="dr-numin" type="number" min={1} max={120} value={form?.deepBudgetMin ?? 10}
            onChange={(e) => patch({ deepBudgetMin: Math.max(1, Number(e.target.value) || 10) })} />
        </Field>
        <Field title="每根保留快照数" hint="超过会删最旧的">
          <input className="dr-numin" type="number" min={3} max={60} value={form?.keepSnapshots ?? 12}
            onChange={(e) => patch({ keepSnapshots: Math.max(3, Number(e.target.value) || 12) })} />
        </Field>
        <Field title="隔离区自动销毁（天）" hint="移入隔离区超过 N 天自动彻底删除；0 = 关闭（只进不出）">
          <input className="dr-numin" type="number" min={0} max={365} value={form?.quarantineDays ?? 14}
            onChange={(e) => patch({ quarantineDays: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </div>

      <div className="dr-sec"><span className="dr-bar" />垃圾识别</div>
      <div className="dr-card">
        <Field title="额外垃圾目录名" hint="逗号分隔；按目录名全等匹配，全深度生效">
          <input className="dr-inp" style={{ maxWidth: 190 }} value={extraDirsText}
            onChange={(e) => setExtraDirsText(e.target.value)} onBlur={saveLists}
            placeholder="my-build-output, tmp-cache" />
        </Field>
        <Field title="忽略目录名" hint="逗号分隔；这些目录不进入扫描与垃圾判定">
          <input className="dr-inp" style={{ maxWidth: 190 }} value={excludeText}
            onChange={(e) => setExcludeText(e.target.value)} onBlur={saveLists}
            placeholder="Journal, $RECYCLE.BIN" />
        </Field>
      </div>

      <div className="dr-sec"><span className="dr-bar" />服务管理</div>
      <div className="dr-card">
        <div className="dr-card-b">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`dr-dot ${svcRunning ? 'ok' : 'down'}`} />
            <b style={{ fontSize: 12.5 }}>
              disk-radar-service · {svcRunning ? '运行中' : svcState === 'error' ? '出错' : svcState}
            </b>
            {svc?.lastError && <span className="dr-sub" style={{ color: '#F85149' }}>{svc.lastError}</span>}
          </div>
          <div className="dr-actions">
            <button className="dr-btn sm" onClick={async () => { try { await serviceAction('start'); showToast('已请求启动'); setTimeout(refreshSvc, 1500) } catch (e) { showToast((e as Error).message, true) } }}>启动</button>
            <button className="dr-btn sm ghost" onClick={async () => { try { await serviceAction('restart'); showToast('已请求重启'); setTimeout(refreshSvc, 1500) } catch (e) { showToast((e as Error).message, true) } }}>重启</button>
            <button className="dr-btn sm ghost" onClick={async () => { try { await serviceAction('stop'); showToast('已请求停止'); setTimeout(refreshSvc, 1500) } catch (e) { showToast((e as Error).message, true) } }}>停止</button>
          </div>
          <div className="dr-sub" style={{ marginTop: 6 }}>
            心跳：{data?.meta?.lastTickAt ? new Date(data.meta.lastTickAt).toLocaleTimeString('zh-CN', { hour12: false }) : '无'}
            {data?.meta?.bridge ? ` · 桥 ${data.meta.bridge}` : ''} · 零外网请求，日志 {`<appConfigDir>/disk-radar.log`}
          </div>
        </div>
      </div>

      <div className="dr-sec"><span className="dr-bar" />数据管理</div>
      <div className="dr-card">
        <div className="dr-card-b" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="dr-btn sm ghost" onClick={exportData}>导出全部数据（JSON）</button>
          <button className="dr-btn sm danger" onClick={clearAll}>清空本插件全部数据</button>
        </div>
      </div>

      <div className="dr-sub" style={{ padding: '0 18px 14px', lineHeight: 1.8 }}>
        <b>键空间契约</b>（cap.kv，前缀 <code>diskrad.</code>）：settings/roots/scan/state/meta 单键；
        snap.&#60;rid&#62;.&#60;seq&#62; 快照；junk./qman.&#60;rid&#62; 清单；cmd./result.&#60;nonce&#62; 命令通道（先删后做）。
        服务是唯一写者，面板与 AI 经命令键表达意图。
      </div>
    </div>
  )
}
