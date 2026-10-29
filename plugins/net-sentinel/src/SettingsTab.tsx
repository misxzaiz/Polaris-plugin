/**
 * 设置 Tab：探测参数 + 目标编辑器（经 cmd.targets 原子改）+ 测速 + 服务管理 + 清空数据
 *
 * 写路径纪律：数值参数面板直写 netmon.settings；目标列表由后台服务独占写
 * （netmon.targets），面板只投递 netmon.cmd.targets.* 命令并等结果。
 */
import { useEffect, useState } from 'react'
import {
  clearAllData, fmtMbps, fmtMs, kvSet, K, listServiceStatus, loadSpeeds, mutateTargets, runSpeedtest,
  serviceAction, SERVICE_ID, type NetSettings, type PanelData, type ServiceStatus, type SpeedRecord, type TargetMeta,
} from './model'

const css = `
.ns-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ns-sec-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#7C5CFF,#58A6FF);flex-shrink:0}
.ns-sec-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ns-trow{display:flex;align-items:center;gap:8px;padding:8px 13px;border-top:1px solid #1d2330;font-size:12px}
.ns-trow:first-child{border-top:none}
.ns-trow-name{font-weight:600}
.ns-trow-host{color:#5C6678;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.ns-add{padding:10px 13px;border-top:1px solid #1d2330;display:flex;flex-direction:column;gap:6px}
.ns-add-row{display:flex;gap:6px}
.ns-speedrow{display:flex;gap:6px;align-items:center;padding:8px 13px;border-top:1px solid #1d2330}
.ns-sprec{display:flex;align-items:baseline;gap:8px;padding:6px 13px;border-top:1px solid #1d2330;font-size:11.5px}
`

const NUM_FIELDS: { key: keyof NetSettings; label: string; hint: string; min: number; max: number }[] = [
  { key: 'tickSec', label: '探测间隔（秒）', hint: '每 N 秒对全部目标探一轮（5-120）', min: 5, max: 120 },
  { key: 'timeoutMs', label: '单次超时（毫秒）', hint: 'TCP 握手超时即记丢包（1000-10000）', min: 1000, max: 10000 },
  { key: 'latencyMs', label: '劣化阈值（毫秒）', hint: '持续高于此平均延迟记「延迟劣化」事件（100-10000）', min: 100, max: 10000 },
  { key: 'sustainRounds', label: '持续轮数', hint: '连续 N 轮异常才触发事件，防抖（2-12）', min: 2, max: 12 },
  { key: 'retentionHours', label: '历史保留（小时）', hint: '小时桶保留时长，上限 2160（90 天）', min: 24, max: 2160 },
]

const KIND_LABEL: Record<string, string> = { gateway: '网关', anchor: '锚点', normal: '站点' }

export default function SettingsTab({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const settings = data?.settings
  const [draft, setDraft] = useState<NetSettings | null>(null)
  const [svc, setSvc] = useState<ServiceStatus | null>(null)
  const [speeds, setSpeeds] = useState<SpeedRecord[]>([])
  const [speeding, setSpeeding] = useState(false)
  const [addForm, setAddForm] = useState<{ label: string; host: string; port: string; kind: 'anchor' | 'normal' | 'gateway' }>({ label: '', host: '', port: '443', kind: 'normal' })

  useEffect(() => {
    if (settings && !draft) setDraft(settings)
  }, [settings, draft])

  const refreshSides = async () => {
    try {
      const list = await listServiceStatus()
      setSvc(list.find((s) => s.serviceId === SERVICE_ID && s.pluginId === pluginId) ?? null)
    } catch (_) { /* 服务管理能力不可用时静默 */ }
    try { setSpeeds(await loadSpeeds(6)) } catch (_) { /* 忽略 */ }
  }

  useEffect(() => { refreshSides() }, [pluginId])

  if (!draft) return <div className="ns-empty">加载中…</div>

  const setNum = (key: keyof NetSettings, v: string, min: number, max: number) => {
    const n = Math.min(max, Math.max(min, Math.floor(Number(v) || min)))
    setDraft({ ...draft, [key]: n })
  }

  const saveSettings = async () => {
    try {
      await kvSet(K.settings, { ...draft })
      showToast('设置已保存（服务 10s 内生效）')
      await reload()
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }

  const togglePaused = async () => {
    const next = { ...draft, paused: !draft.paused }
    setDraft(next)
    try {
      await kvSet(K.settings, next)
      showToast(next.paused ? '探测已暂停' : '探测已恢复')
      await reload()
    } catch (e) {
      showToast(`操作失败：${(e as Error).message}`, true)
    }
  }

  const doTarget = async (payload: Parameters<typeof mutateTargets>[0], okMsg: string) => {
    const r = await mutateTargets(payload)
    if (r.ok) {
      showToast(okMsg)
      await reload()
    } else {
      showToast(r.error || '操作失败', true)
    }
  }

  const doAdd = async () => {
    const host = addForm.host.trim()
    const port = Math.floor(Number(addForm.port))
    if (!host && addForm.kind !== 'gateway') { showToast('host 不能为空', true); return }
    if (addForm.kind === 'gateway' && host) {
      showToast('网关目标 host 留空即自动发现；如要手动指定请选「站点」类型', true)
      return
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) { showToast('端口非法', true); return }
    await doTarget({ action: 'add', target: { label: addForm.label.trim() || host, host, port, kind: addForm.kind } }, `已添加 ${addForm.label || host}`)
    setAddForm({ label: '', host: '', port: '443', kind: 'normal' })
  }

  const doSpeed = async () => {
    if (!window.confirm(`开始测速？将下载约 ${draft.speedMb}MB 流量（耗时 10-30s）。`)) return
    setSpeeding(true)
    try {
      const r = await runSpeedtest({ mb: draft.speedMb, url: draft.speedUrl || undefined })
      if (r.ok) showToast(`测速完成：${fmtMbps(r.mbps)}（首字节 ${fmtMs(r.latencyMs)}）`)
      else showToast(r.error || '测速失败', true)
      await refreshSides()
      await reload()
    } finally {
      setSpeeding(false)
    }
  }

  const doService = async (action: 'start' | 'stop' | 'restart') => {
    try {
      await serviceAction(action, pluginId, SERVICE_ID)
      showToast(`服务已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}`)
      setTimeout(refreshSides, 2500)
    } catch (e) {
      showToast(`服务${action}失败：${(e as Error).message}`, true)
    }
  }

  const doClearAll = async () => {
    if (!window.confirm('清空全部网络哨兵数据？（快照/历史桶/事件/测速记录；服务会自动重建默认目标）')) return
    const n = await clearAllData().catch(() => 0)
    showToast(`已清空 ${n} 个键，服务将在下轮重建`)
    setTimeout(reload, 3000)
  }

  const stateText = svc ? ({ running: '运行中', starting: '启动中', stopping: '停止中', stopped: '已停止', error: '异常' } as const)[svc.state] : '状态未知'

  return (
    <>
      <div className="ns-sec"><span className="ns-sec-bar" />探测参数<span className="ns-sec-hint">服务 10s 内生效</span></div>
      <div className="ns-card">
        <div className="ns-field">
          <span className="ns-field-l"><b>暂停探测</b><small>暂停期间不探测、不产生事件与历史</small></span>
          <button className={`ns-toggle ${draft.paused ? 'on' : ''}`} onClick={togglePaused}><i /></button>
        </div>
        {NUM_FIELDS.map((f) => (
          <div key={f.key} className="ns-field">
            <span className="ns-field-l"><b>{f.label}</b><small>{f.hint}</small></span>
            <input
              className="ns-num"
              type="number"
              value={String(draft[f.key])}
              min={f.min}
              max={f.max}
              onChange={(e) => setNum(f.key, e.target.value, f.min, f.max)}
            />
          </div>
        ))}
        <div className="ns-field">
          <span className="ns-field-l"><b>测速地址（可选）</b><small>留空用默认 Cloudflare 端点；含 {'{bytes}'} 占位符会被替换为字节数</small></span>
        </div>
        <div className="ns-speedrow">
          <input className="ns-inp" placeholder="https://speed.cloudflare.com/__down?bytes={bytes}" value={draft.speedUrl} onChange={(e) => setDraft({ ...draft, speedUrl: e.target.value })} />
        </div>
        <div className="ns-field">
          <span className="ns-field-l"><b>测速下载量</b><small>1-25 MB；每次测速都会真实下载流量</small></span>
          <input className="ns-num" type="number" min={1} max={25} value={String(draft.speedMb)} onChange={(e) => setNum('speedMb', e.target.value, 1, 25)} />
          <button className="ns-btn" disabled={speeding} onClick={doSpeed}>{speeding ? '测速中…' : '立即测速'}</button>
        </div>
        <div className="ns-field">
          <button className="ns-btn" onClick={saveSettings}>保存参数</button>
        </div>
      </div>

      {speeds.length > 0 && (
        <>
          <div className="ns-sec"><span className="ns-sec-bar" />最近测速</div>
          <div className="ns-card">
            {speeds.map((s) => (
              <div key={s.at} className="ns-sprec">
                <b style={{ color: s.ok ? '#58A6FF' : '#F85149' }}>{s.ok ? fmtMbps(s.mbps) : '失败'}</b>
                <span style={{ color: '#5C6678', fontSize: 10 }}>
                  {new Date(s.at).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{s.mb}MB{s.ok && Number.isFinite(s.latencyMs as number) ? ` · 首字节 ${Math.round(s.latencyMs as number)}ms` : ''}{s.err ? ` · ${s.err}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="ns-sec">
        <span className="ns-sec-bar" />
        探测目标
        <span className="ns-sec-hint">{data?.snap?.targets.length ?? 0}/12 · 改动由服务原子应用</span>
      </div>
      <div className="ns-card">
        {(data?.snap?.targets ?? []).map((t: TargetMeta) => (
          <div key={t.id} className="ns-trow">
            <span className="ns-trow-name">{t.label}</span>
            <span className="ns-trow-host">{t.host || '(自动网关)'}:{t.port} · {KIND_LABEL[t.kind] || t.kind}</span>
            <button
              className="ns-btn sm ghost"
              onClick={() => doTarget({ action: t.enabled ? 'disable' : 'enable', id: t.id }, t.enabled ? `已停用 ${t.label}` : `已启用 ${t.label}`)}
            >
              {t.enabled ? '停用' : '启用'}
            </button>
            <button
              className="ns-btn sm danger"
              onClick={() => { if (window.confirm(`移除目标「${t.label}」？`)) doTarget({ action: 'remove', id: t.id }, `已移除 ${t.label}`) }}
            >
              移除
            </button>
          </div>
        ))}
        <div className="ns-add">
          <div className="ns-add-row">
            <input className="ns-inp" placeholder="名称（如 我的NAS）" value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })} style={{ flex: 1 }} />
            <select className="ns-select" value={addForm.kind} onChange={(e) => setAddForm({ ...addForm, kind: e.target.value as 'anchor' | 'normal' | 'gateway' })}>
              <option value="normal">站点</option>
              <option value="anchor">锚点</option>
              <option value="gateway">网关</option>
            </select>
          </div>
          <div className="ns-add-row">
            <input className="ns-inp" placeholder={addForm.kind === 'gateway' ? '留空=自动发现网关' : '域名或 IP（如 nas.local）'} value={addForm.host} onChange={(e) => setAddForm({ ...addForm, host: e.target.value })} style={{ flex: 2 }} />
            <input className="ns-inp" placeholder="端口" value={addForm.port} onChange={(e) => setAddForm({ ...addForm, port: e.target.value })} style={{ flex: 1 }} />
            <button className="ns-btn" onClick={doAdd}>添加</button>
          </div>
          <small className="ns-sub">锚点参与「在线/离线」判定（至少 2 个可达才算在线）；站点只记录自身延迟与事件。</small>
        </div>
      </div>

      <div className="ns-sec"><span className="ns-sec-bar" />服务管理</div>
      <div className="ns-card">
        <div className="ns-field">
          <span className="ns-field-l">
            <b>探测服务（net-service）</b>
            <small>
              {stateText}{svc?.pid ? ` · PID ${svc.pid}` : ''}{svc?.restartCount ? ` · 重启 ${svc.restartCount} 次` : ''}
              {data?.meta?.gateway ? ` · 网关 ${data.meta.gateway}` : ''}
              {data?.meta?.degraded ? ' · ⚠ 桥降级' : ''}
            </small>
          </span>
          <button className="ns-btn sm ghost" onClick={() => doService('restart')}>重启</button>
          <button className="ns-btn sm ghost" onClick={() => doService('stop')}>停止</button>
          <button className="ns-btn sm" onClick={() => doService('start')}>启动</button>
        </div>
      </div>

      <div className="ns-sec"><span className="ns-sec-bar" />危险区</div>
      <div className="ns-card">
        <div className="ns-field">
          <span className="ns-field-l"><b>清空全部数据</b><small>删除快照/历史桶/事件/测速记录（设置会保留当前草稿值之外的服务默认）</small></span>
          <button className="ns-btn danger" onClick={doClearAll}>清空</button>
        </div>
      </div>
    </>
  )
}
