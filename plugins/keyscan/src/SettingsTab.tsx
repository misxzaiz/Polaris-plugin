/**
 * 设置 Tab：服务管理卡（自举 start）+ 扫描参数 + 规则开关 + 忽略表 + 数据清理。
 * 规则清单来自 shared/scan-core（经 esbuild text loader 不行——CJS 直接 import 由 esbuild 打进 bundle）。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  kvGet, kvSet, purgeOwnKeys, saveSettings, serviceAction, serviceStart,
  type IgnoreEntry, type LatestSummary, type ScanSettings, type ServiceMeta,
} from './model'
import { RULES } from '../shared/scan-core'

interface Props {
  head: { meta: ServiceMeta | null; latest: LatestSummary | null }
  onChanged: () => void
}

interface SvcStatus { status?: string; lastError?: string }

export default function SettingsTab({ head, onChanged }: Props) {
  const [settings, setSettings] = useState<ScanSettings>({})
  const [ignore, setIgnore] = useState<IgnoreEntry[]>([])
  const [svc, setSvc] = useState<SvcStatus | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [confirmPurge, setConfirmPurge] = useState(false)

  useEffect(() => {
    kvGet<ScanSettings>('keyscan.settings').then((s) => setSettings(s ?? {}))
    kvGet<IgnoreEntry[]>('keyscan.ignore').then((s) => setIgnore(s ?? []))
  }, [])

  const refreshSvc = useCallback(async () => {
    const { serviceStatus } = await import('./model')
    setSvc(await serviceStatus())
  }, [])
  useEffect(() => { void refreshSvc() }, [refreshSvc, head.meta?.lastTickAt])

  const patch = useCallback((p: Partial<ScanSettings>) => {
    setSettings((cur) => ({ ...cur, ...p }))
  }, [])

  const persist = useCallback(async (s: ScanSettings) => {
    await saveSettings(s)
    setMsg('设置已保存，下一次扫描生效')
    setTimeout(() => setMsg(''), 2500)
  }, [])

  const toggleRule = useCallback((id: string) => {
    setSettings((cur) => {
      const off = new Set(cur.disabledRules ?? [])
      if (off.has(id)) off.delete(id)
      else off.add(id)
      const next = { ...cur, disabledRules: [...off] }
      void saveSettings(next)
      return next
    })
  }, [])

  const doSvc = useCallback(async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action); setMsg('')
    try {
      if (action === 'start') await serviceStart()
      else await serviceAction(action)
      setMsg(action === 'start' ? '启动命令已发出，几秒后看心跳状态' : '命令已执行')
      setTimeout(() => { void refreshSvc(); onChanged() }, 2500)
    } catch (e) {
      setMsg(`失败：${String((e as Error).message || e)}`)
    } finally {
      setBusy('')
    }
  }, [refreshSvc, onChanged])

  const doPurge = useCallback(async () => {
    if (!confirmPurge) { setConfirmPurge(true); setTimeout(() => setConfirmPurge(false), 4000); return }
    const n = await purgeOwnKeys()
    setMsg(`已清空 ${n} 个 keyscan.* 键（扫描历史与发现一并清除）`)
    setConfirmPurge(false)
    onChanged()
  }, [confirmPurge, onChanged])

  const meta = head.meta
  const svcRunning = !!meta?.lastTickAt && Date.now() - meta.lastTickAt < 130000

  return (
    <>
      <div className="ks-sec"><span className="ks-bar" />后台服务</div>
      <div className="ks-card"><div className="ks-card-b">
        <div className="ks-sub">
          状态：<b style={{ color: svcRunning ? '#3FB950' : '#F85149' }}>{svcRunning ? '运行中' : (svc?.status ?? '未运行')}</b>
          {meta?.pid ? ` · PID ${meta.pid}` : ''}
          {meta?.version ? ` · v${meta.version}` : ''}
          {svc?.lastError ? <><br />最近错误：{svc.lastError}</> : null}
          <br />日志：应用配置目录下 keyscan.log（宿主不收集服务 stdout，排障看这里）
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
          <button className="ks-btn" disabled={busy !== ''} onClick={() => void doSvc('start')}>{busy === 'start' ? '启动中…' : '启动'}</button>
          <button className="ks-btn ghost" disabled={busy !== '' || !svcRunning} onClick={() => void doSvc('restart')}>重启</button>
          <button className="ks-btn ghost" disabled={busy !== '' || !svcRunning} onClick={() => void doSvc('stop')}>停止</button>
        </div>
        {msg && <div className="ks-sub" style={{ marginTop: 7 }}>{msg}</div>}
      </div></div>

      <div className="ks-sec"><span className="ks-bar" />扫描参数</div>
      <div className="ks-card"><div className="ks-card-b">
        <label className="ks-sub" style={{ display: 'block', marginBottom: 4 }}>默认扫描根（面板「扫描」Tab 预填）</label>
        <input className="ks-inp ks-mono" value={settings.root ?? ''} placeholder="如 D:\\work" onChange={(e) => patch({ root: e.target.value })} />
        <div style={{ display: 'flex', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label className="ks-sub">单文件上限 KB</label>
            <input className="ks-inp" type="number" min={16} max={10240} value={settings.maxFileKB ?? 1024} onChange={(e) => patch({ maxFileKB: Number(e.target.value) || 1024 })} />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label className="ks-sub">文件数上限</label>
            <input className="ks-inp" type="number" min={1000} max={1000000} value={settings.maxFiles ?? 200000} onChange={(e) => patch({ maxFiles: Number(e.target.value) || 200000 })} />
          </div>
        </div>
        <label className="ks-sub" style={{ display: 'block', margin: '9px 0 4px' }}>额外跳过的目录名（每行一个，内置已含 node_modules/.git/dist 等）</label>
        <textarea
          className="ks-inp"
          rows={3}
          value={(settings.skipDirs ?? []).join('\n')}
          onChange={(e) => patch({ skipDirs: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
        />
        <div style={{ marginTop: 9 }}>
          <button className="ks-btn" onClick={() => void persist(settings)}>保存设置</button>
        </div>
      </div></div>

      <div className="ks-sec"><span className="ks-bar" />规则开关<span className="ks-hint">{(settings.disabledRules ?? []).length ? `已关 ${(settings.disabledRules ?? []).length} 条` : '全部启用'}</span></div>
      <div className="ks-card"><div className="ks-card-b">
        {RULES.map((r) => {
          const off = (settings.disabledRules ?? []).includes(r.id)
          return (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={!off} onChange={() => toggleRule(r.id)} />
              <span className={`ks-sev ${r.sev}`}>{r.sev === 'critical' ? '🔴' : r.sev === 'high' ? '🟠' : '🟡'}</span>
              <span style={{ flex: 1 }}>
                {r.label} <span className="ks-muted ks-mono" style={{ fontSize: 10 }}>{r.id}</span>
              </span>
            </label>
          )
        })}
      </div></div>

      <div className="ks-sec"><span className="ks-bar" />忽略表<span className="ks-hint">{ignore.length} 条误报指纹</span></div>
      <div className="ks-card"><div className="ks-card-b">
        {ignore.length === 0 && <div className="ks-sub">空——在「发现」里把确认为示例值/测试值的条目标记为误报，会记在这里。</div>}
        {ignore.map((x) => (
          <div key={x.fp} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 }}>
            <span className="ks-mono ks-sub" style={{ flex: 1 }}>{x.fp}{x.note ? ` · ${x.note}` : ''}</span>
            <button
              className="ks-btn ghost sm"
              onClick={() => {
                const next = ignore.filter((y) => y.fp !== x.fp)
                setIgnore(next)
                void kvSet('keyscan.ignore', next)
              }}
            >移除</button>
          </div>
        ))}
      </div></div>

      <div className="ks-sec"><span className="ks-bar" />数据管理</div>
      <div className="ks-card"><div className="ks-card-b">
        <div className="ks-sub">
          本插件所有数据存于 cap.kv 的 keyscan.* 前缀（掩码形态），清除后扫描历史/发现/忽略表全部丢失，被扫文件不受影响。
        </div>
        <div style={{ marginTop: 9 }}>
          <button className="ks-btn danger" onClick={() => void doPurge()}>
            {confirmPurge ? '再点一次确认清空' : '清空本插件数据'}
          </button>
        </div>
      </div></div>
    </>
  )
}
