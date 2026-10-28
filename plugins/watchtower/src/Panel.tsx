/**
 * 守望台面板：插件用量计量 + 生命周期治理
 *
 * 数据面：cap.kv / cap.pluginDiscovery / cap.pluginServiceManager
 *   （经宿主 invoke → router_dispatch，跨端同一个账本）
 * 计算全部走 shared/usage-core.js（与 MCP 同一权威）。
 *
 * 双通道计量：
 *   - MCP 工具调用自动记（mcp/server.js 每工具先 record）
 *   - 面板打开记本面板自身（notePanelOpen），且操作按钮（服务启停等）算「面板操作」继续累积
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadSummary, notePanelOpen, serviceAction, uninstallPlugin,
  timeAgo, fmtDay, type Summary, type ServiceStatus, type Row,
} from './model'

const css = `
.wt-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6E9F2;height:100%;display:flex;flex-direction:column;background:transparent}
.wt-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wt-body{flex:1;overflow-y:auto;padding:0 0 24px}
.wt-body::-webkit-scrollbar{width:9px;height:9px}
.wt-body::-webkit-scrollbar-track{background:transparent}
.wt-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.wt-page{max-width:620px;margin:0 auto}
.wt-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E1220 75%,rgba(14,18,32,0))}
.wt-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0b3b2f,#12203a 60%,#0E1220);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid #1f5a49}
.wt-tt{flex:1;min-width:0}
.wt-tt b{font-size:15px;display:block}
.wt-tt small{color:#8B94A9;font-size:10.5px;display:block;margin-top:1px;cursor:pointer}
.wt-tabs{display:flex;gap:4px}
.wt-tab{background:transparent;border:none;color:#8B94A9;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.wt-tab:hover{color:#E6E9F2}
.wt-tab.on{background:#1D2436;color:#E6E9F2;font-weight:600}
.wt-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.wt-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#4fd1a0,#1e7a63);flex-shrink:0}
.wt-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.wt-card{background:#141927;border:1px solid #232B40;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.wt-card-b{padding:11px 13px}
.wt-sub{font-size:10.5px;color:#8B94A9;line-height:1.6}
.wt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wt-btn{background:#1e7a63;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.wt-btn:hover{filter:brightness(1.12)}
.wt-btn:disabled{opacity:.45;cursor:not-allowed}
.wt-btn.ghost{background:#20263A;color:#E6E9F2;border:1px solid #2a3145}
.wt-btn.danger{background:#3a2030;color:#F08AA8;border:1px solid #542c3e}
.wt-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.wt-chip{background:#1D2436;border:1px solid #2a3145;border-radius:999px;color:#B4B8C4;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.wt-chip:hover{border-color:#3a4356}
.wt-chip.on{background:#14352a;border-color:#4fd1a0;color:#b7efdc;font-weight:600}
.wt-empty{color:#8B94A9;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.wt-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(18,22,34,.96);border:1px solid #232B40;color:#E6E9F2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:220;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.wt-toast.bad{border-color:#542c3e;color:#F08AA8}
.wt-toast.good{border-color:#2b4a35;color:#7EE2A0}
.wt-badge{display:inline-block;font-size:10px;padding:1px 7px;border-radius:999px;background:#223047;color:#9FB6DD;white-space:nowrap}
.wt-badge.act{background:#1e3a2b;color:#7EE2A0}
.wt-badge.idl{background:#3a2b1c;color:#F0B47A}
.wt-badge.cold{background:#252a36;color:#6E7686}
.wt-badge.never{background:#252a36;color:#5C6678}
.wt-badge.builtin{background:#2b2a4a;color:#9f9aF0}
.wt-badge.off{background:#252a36;color:#6E7686}
.wt-tbl{width:100%;border-collapse:collapse;font-size:12px}
.wt-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:7px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.wt-tbl td{padding:8px 10px;border-bottom:1px solid #161c2a;vertical-align:top}
.wt-tbl tr:last-child td{border-bottom:none}
.wt-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.wt-pname{display:flex;align-items:center;gap:6px;min-width:0}
.wt-pname b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-pname small{color:#5C6678;font-size:10px}
.wt-prog{height:5px;border-radius:3px;background:#20263A;overflow:hidden;min-width:60px}
.wt-prog i{display:block;height:100%;background:linear-gradient(90deg,#4fd1a0,#2f9e44);border-radius:3px}
.wt-subrow{font-size:10.5px;color:#8B94A9;margin-top:2px;line-height:1.5}
.wt-srv{display:flex;align-items:center;gap:6px;padding:7px 13px;border-top:1px solid #1c2333;flex-wrap:wrap}
.wt-srv:first-child{border-top:none}
.wt-srv b{white-space:nowrap}
.wt-reason{font-size:11px;color:#B4B8C4;line-height:1.6;flex:1;min-width:140px}
.wt-actions{display:flex;gap:5px}
.wt-about{font-size:11.5px;color:#8B94A9;line-height:1.7;padding:12px 10px}
.wt-about b{color:#E6E9F2}
.wt-about ul{margin:6px 0 0;padding-left:18px}
`

/** 活跃分级 badge */
function ActivityBadge({ activity }: { activity: string }) {
  const cls = activity === 'active' ? 'act' : activity === 'idle' ? 'idl' : activity === 'cold' ? 'cold' : 'never'
  const label = activity === 'active' ? '活跃' : activity === 'idle' ? '沉睡' : activity === 'cold' ? '冷门' : '从未'
  return <span className={`wt-badge ${cls}`}>{label}</span>
}

export default function WatchtowerPanel(props: {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<'overview' | 'services' | 'advice' | 'about'>('overview')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [opBusy, setOpBusy] = useState<string | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState<Row | null>(null)
  const [toast, setToast] = useState<{ text: string; kind?: 'good' | 'bad' } | null>(null)
  const noteRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toastFn = (text: string, kind?: 'good' | 'bad') => {
    setToast({ text, kind })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), 2600)
  }

  const refresh = () => {
    setLoading(true)
    loadSummary()
      .then((s) => { setSummary(s); setError(null) })
      .catch((e: Error) => setError(e.message || String(e)))
      .finally(() => setLoading(false))
  }

  // 首挂载：记一次面板打开（双通道计量）+ 载入
  useEffect(() => {
    if (!noteRef.current) {
      noteRef.current = true
      notePanelOpen().catch(() => {})
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const topLines = useMemo(() => {
    if (!summary) return { cold: 0, active: 0, running: 0 }
    return {
      cold: summary.totals.cold + summary.totals.never,
      active: summary.totals.active,
      running: summary.totals.runningServices,
    }
  }, [summary])

  async function doService(row: Row, s: ServiceStatus, action: 'start' | 'stop' | 'restart') {
    const key = `${s.pluginId}/${s.serviceId}/${action}`
    setOpBusy(key)
    try {
      const next = await serviceAction(action, s.pluginId, s.serviceId)
      toastFn(`${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'} ${s.serviceId} → ${next?.state || '?'}`, 'good')
      refresh()
    } catch (e: unknown) {
      toastFn(`操作失败：${e instanceof Error ? e.message : String(e)}`, 'bad')
    } finally {
      setOpBusy(null)
    }
  }

  async function doUninstall(row: Row) {
    setOpBusy(`uninstall:${row.plugin.id}`)
    try {
      const r = await uninstallPlugin(row.plugin.installPath)
      if (r && (r.success === false || r.error)) {
        toastFn(`卸载失败：${r.error || r.message || '未知错误'}`, 'bad')
      } else {
        toastFn(`已卸载 ${row.plugin.name}`, 'good')
      }
      setConfirmUninstall(null)
      refresh()
    } catch (e: unknown) {
      toastFn(`卸载失败：${e instanceof Error ? e.message : String(e)}`, 'bad')
    } finally {
      setOpBusy(null)
    }
  }

  const runningServices = summary?.rows.flatMap((r) => r.services)?.filter((s) => s.state === 'running') ?? []

  return (
    <div className="wt-root">
      {css ? <style>{css}</style> : null}
      <div className="wt-top">
        <div className="wt-logo">👁</div>
        <div className="wt-tt">
          <b>守望台</b>
          <small onClick={() => setTab('overview')}>
            {loading ? '加载中…' : `${summary?.totals.plugins ?? 0} 插件 · ${topLines.active} 活跃 · ${topLines.running} 服务在跑`}
          </small>
        </div>
        <div className="wt-tabs">
          {([['overview', '总览'], ['services', '服务'], ['advice', '治理'], ['about', '口径']] as const).map(([k, l]) => (
            <button key={k} className={`wt-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="wt-body">
        <div className="wt-page">
          {error ? (
            <div className="wt-card"><div className="wt-card-b" style={{ color: '#F08AA8' }}>加载失败：{error}</div></div>
          ) : null}

          {tab === 'overview' ? (
            <OverviewTab summary={summary} loading={loading} />
          ) : tab === 'services' ? (
            <ServicesTab
              summary={summary}
              loading={loading}
              runningServices={runningServices}
              opBusy={opBusy}
              onService={doService}
            />
          ) : tab === 'advice' ? (
            <AdviceTab
              summary={summary}
              loading={loading}
              confirmUninstall={confirmUninstall}
              opBusy={opBusy}
              onUninstall={doUninstall}
              setConfirmUninstall={setConfirmUninstall}
            />
          ) : (
            <AboutTab />
          )}
        </div>
      </div>

      {toast ? <div className={`wt-toast ${toast.kind || ''}`}>{toast.text}</div> : null}
    </div>
  )
}

/* ── 总览：热/冷榜单 ────────────────────────────────────────────────────── */
function OverviewTab({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  if (loading && !summary) return <div className="wt-empty">加载插件用量…</div>
  if (!summary || summary.rows.length === 0) return <div className="wt-empty">没有可显示的插件（经宿主 discover 发现到的为空，请确认宿主已装插件）。</div>

  const activeRows = summary.byActivity.filter((r) => r.activity !== 'never')
  const coldRows = summary.byCold
  const maxCost = Math.max(1, ...activeRows.map((r) => r.cost7))

  return (
    <>
      <div className="wt-sec"><span className="wt-bar" />活跃榜<span className="wt-hint">近 7 天加权成本（工具调用×2 + 面板打开）</span></div>
      <div className="wt-card">
        <table className="wt-tbl">
          <thead>
            <tr><th>插件</th><th>分级</th><th>近7天</th><th>累计</th><th>末次</th></tr>
          </thead>
          <tbody>
            {activeRows.slice(0, 12).map((r) => {
              const w7 = r.windows.find((w) => w.days === 7)
              const pct = Math.round((r.cost7 / maxCost) * 100)
              return (
                <tr key={r.plugin.id}>
                  <td>
                    <div className="wt-pname"><b>{r.plugin.name}</b>{r.plugin.builtin ? <span className="wt-badge builtin">内置</span> : null}</div>
                    <div className="wt-prog"><i style={{ width: `${Math.max(4, pct)}%` }} /></div>
                  </td>
                  <td><ActivityBadge activity={r.activity} /></td>
                  <td className="num">{w7 ? w7.total : 0}</td>
                  <td className="num">{r.usage.count} 工具<br />{r.usage.panelOpens} 面板</td>
                  <td className="num">{timeAgo(r.usage.lastUsed)}</td>
                </tr>
              )
            })}
            {activeRows.length === 0 ? <tr><td colSpan={5} className="wt-empty">还没有使用记录。</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="wt-sec"><span className="wt-bar" />冷门榜<span className="wt-hint">近 30 天几乎没用过的插件，可考虑停用/卸载</span></div>
      <div className="wt-card">
        <table className="wt-tbl">
          <thead>
            <tr><th>插件</th><th>分级</th><th>近30天</th><th>末次</th><th>服务</th></tr>
          </thead>
          <tbody>
            {coldRows.slice(0, 12).map((r) => {
              const w30 = r.windows.find((w) => w.days === 30)
              const run = r.services.some((s) => s.state === 'running')
              return (
                <tr key={r.plugin.id}>
                  <td>
                    <div className="wt-pname"><b>{r.plugin.name}</b>{r.plugin.builtin ? <span className="wt-badge builtin">内置</span> : null}</div>
                    <div className="wt-subrow">{r.plugin.id}{r.hasServices ? ' · 有后台服务' : ''}</div>
                  </td>
                  <td><ActivityBadge activity={r.activity} /></td>
                  <td className="num">{w30 ? w30.total : 0}</td>
                  <td className="num">{r.usage.lastUsed ? fmtDay(r.usage.lastUsed) : '从未'}</td>
                  <td>{run ? <span className="wt-badge act">运行中</span> : <span className="wt-badge off">无</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── 服务：后台服务状态与启停 ────────────────────────────────────────────── */
function ServicesTab({
  summary, loading, runningServices, opBusy, onService,
}: {
  summary: Summary | null
  loading: boolean
  runningServices: ServiceStatus[]
  opBusy: string | null
  onService: (r: Row, s: ServiceStatus, action: 'start' | 'stop' | 'restart') => void
}) {
  if (loading && !summary) return <div className="wt-empty">加载服务状态…</div>
  const rows = summary?.rows ?? []

  if (runningServices.length === 0 && !rows.some((r) => r.hasServices)) {
    return (
      <>
        <div className="wt-sec"><span className="wt-bar" />后台服务<span className="wt-hint">声明 contributes.services 的插件</span></div>
        <div className="wt-empty">当前没有插件声明后台服务，也没有服务在运行。</div>
      </>
    )
  }

  const withServices = rows.filter((r) => r.hasServices)

  return (
    <>
      <div className="wt-sec"><span className="wt-bar" />正在运行<span className="wt-hint">{runningServices.length} 个</span></div>
      {runningServices.length === 0 ? (
        <div className="wt-empty">无运行中的服务。</div>
      ) : (
        <div className="wt-card">
          {runningServices.map((s) => {
            const row = rows.find((r) => r.plugin.id === s.pluginId)
            return (
              <div key={`${s.pluginId}/${s.serviceId}`} className="wt-srv">
                <b>{row?.plugin.name ?? s.pluginId}</b>
                <span className="wt-badge act">{s.serviceId}</span>
                <span className="wt-sub">{s.port ? `端口 ${s.port}` : ''}{s.uptime != null ? ` · up ${Math.round(s.uptime / 1000)}s` : ''}{s.restartCount ? ` · 重启×${s.restartCount}` : ''}</span>
                <span style={{ flex: 1 }} />
                <div className="wt-actions">
                  <button className="wt-btn ghost sm" disabled={!!opBusy} onClick={() => onService(row!, s, 'restart')}>重启</button>
                  <button className="wt-btn sm" disabled={!!opBusy} onClick={() => onService(row!, s, 'stop')}>停止</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="wt-sec"><span className="wt-bar" />已声明服务<span className="wt-hint">未在运行的也可手动启动</span></div>
      <div className="wt-card">
        {withServices.map((r) => (
          <div key={r.plugin.id} className="wt-srv">
            <b>{r.plugin.name}</b>
            <span className={`wt-badge ${r.services.some((s) => s.state === 'running') ? 'act' : 'off'}`}>
              {r.services.filter((s) => s.state === 'running').length}/{r.services.length} 运行中
            </span>
            <span style={{ flex: 1 }} />
            {r.services.filter((s) => s.state !== 'running').length > 0 ? (
              <div className="wt-actions">
                <button
                  className="wt-btn sm"
                  disabled={!!opBusy}
                  onClick={() => onService(r, r.services.find((s) => s.state !== 'running')!, 'start')}
                >
                  启动
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  )
}

/* ── 治理：冷门插件停用/卸载建议 ──────────────────────────────────────────── */
function AdviceTab({
  summary, loading, confirmUninstall, opBusy, onUninstall, setConfirmUninstall,
}: {
  summary: Summary | null
  loading: boolean
  confirmUninstall: Row | null
  opBusy: string | null
  onUninstall: (r: Row) => void
  setConfirmUninstall: (r: Row | null) => void
}) {
  if (loading && !summary) return <div className="wt-empty">计算治理建议…</div>
  const suggestions = summary?.suggestions ?? []

  return (
    <>
      <div className="wt-sec"><span className="wt-bar" />治理建议<span className="wt-hint">只读 · 卸载需二次确认</span></div>
      {suggestions.length === 0 ? (
        <div className="wt-empty">没有待治理的插件——都用得好好的。</div>
      ) : (
        <div className="wt-card">
          {suggestions.map((s) => (
            <div key={s.pluginId} className="wt-srv">
              <ActivityBadge activity={s.activity} />
              <b>{s.name}</b>
              <span className="wt-reason">{s.reason}</span>
              <div className="wt-actions">
                {s.suggestion === 'disable' ? (
                  <span className="wt-sub">可在宿主插件设置中停用</span>
                ) : null}
                {s.suggestion === 'uninstall' || s.activity === 'cold' || s.activity === 'never' ? (
                  <button className="wt-btn danger sm" disabled={!!opBusy} onClick={() => setConfirmUninstall((summary?.rows ?? []).find((r) => r.plugin.id === s.pluginId) ?? null)}>卸载</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="wt-sec"><span className="wt-bar" />批量治理<span className="wt-hint">只读指引</span></div>
      <div className="wt-card">
        <div className="wt-card-b">
          <div className="wt-sub">为避免越权，本插件的 MCP 工具只做只读统计与单插件操作；批量停用/卸载请在宿主插件管理（设置）里执行。Made for 运营插件的同学。</div>
        </div>
      </div>

      {confirmUninstall ? (
        <div className="wt-card">
          <div className="wt-card-b">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>确认卸载「{confirmUninstall.plugin.name}」？</div>
            <div className="wt-sub">将调用宿主 uninstall（先终止相关进程再删目录）。此操作不可逆，卸载后需要重新安装。{confirmUninstall.plugin.builtin ? '这是内置插件，实际上宿主会拒绝。' : ''}</div>
            <div className="wt-row" style={{ marginTop: 10 }}>
              <button className="wt-btn danger" disabled={!!opBusy} onClick={() => onUninstall(confirmUninstall)}>确认卸载</button>
              <button className="wt-btn ghost" disabled={!!opBusy} onClick={() => setConfirmUninstall(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/* ── 口径声明 ────────────────────────────────────────────────────────────── */
function AboutTab() {
  return (
    <>
      <div className="wt-sec"><span className="wt-bar" />计量口径<span className="wt-hint">如实交代</span></div>
      <div className="wt-card">
        <div className="wt-card-b">
          <div className="wt-about">
            <b>本插件统计什么</b>
            <ul>
              <li><b>AI 经本插件 MCP 工具调用</b>：每次 watchtower_* 工具调用自动 +1（source=mcp）。</li>
              <li><b>🔭 面板自身打开</b>：本面板打开一次记 +1（source=panel）。</li>
              <li><b>其它插件的用量</b>：仅当 AI 主动用 <code>watchtower_report_usage</code> 补记时才计入——宿主目前<b>不广播</b>其它插件工具/面板事件，所以默认不覆盖。</li>
            </ul>
            <b>不吹的边界</b>
            <ul>
              <li>统计是<b>观测量</b>，不是宿主权威审计：改绕过本插件入口的使用会被漏记（如实，不伪装全量）。</li>
              <li>服务状态来自宿主 <code>cap.pluginServiceManager</code>，只给 running/exited、端口、pid、uptime、重启次数、最近错误，<b>无 CPU/内存指标</b>。</li>
              <li>停用/卸载等写操作只做<b>单插件级</b>；批量管理建议去宿主设置，禁毒越权。</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}