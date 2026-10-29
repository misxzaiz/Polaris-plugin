/**
 * AI 用量账面板外壳：头部（台账状态）+ 五 Tab（总览 / 模型 / 项目 / 质量 / 设置）
 * 数据面：cap.kv abacus.*（经宿主 invoke → router_dispatch），跨端同一份账。
 * 轮询 10s：聚合面由后台服务写，面板只读；价目/设置写后 30s 内服务热加载。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPanelData, saveSettings, sendCmd, DEFAULT_SETTINGS, type PanelData, type AbacusSettings } from './model'
import OverviewTab from './OverviewTab'
import ModelsTab from './ModelsTab'
import ProjectsTab from './ProjectsTab'
import QualityTab from './QualityTab'
import SettingsTab from './SettingsTab'

const css = `
.ab-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ab-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ab-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ab-body::-webkit-scrollbar{width:9px;height:9px}
.ab-body::-webkit-scrollbar-track{background:transparent}
.ab-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ab-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ab-headrow{display:flex;align-items:center;gap:10px}
.ab-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#F2C063,#D29922);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ab-tt{flex:1;min-width:0}
.ab-tt b{font-size:15px;display:block}
.ab-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-status{display:flex;gap:6px;align-items:center}
.ab-dot{width:7px;height:7px;border-radius:50%}
.ab-dot.ok{background:#3FB950}
.ab-dot.bad{background:#F85149}
.ab-dot.idle{background:#4d5566}
.ab-tabs{display:flex;gap:4px;margin-top:9px}
.ab-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.ab-tab:hover{color:#E6EAF2}
.ab-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ab-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ab-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#F2C063,#D29922);flex-shrink:0}
.ab-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ab-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ab-card-b{padding:11px 13px}
.ab-statrow{display:flex;gap:8px;margin-bottom:8px}
.ab-stat{flex:1;background:#12151c;border:1px solid #222936;border-radius:10px;padding:9px 8px;text-align:center;min-width:0}
.ab-stat b{display:block;font-size:16px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-stat small{color:#5C6678;font-size:9.5px;display:block;margin-top:1px}
.ab-stat .gold{color:#F2C063}
.ab-stat .green{color:#7EE2A0}
.ab-stat .blue{color:#9EC4FF}
.ab-stat .red{color:#FF8A9A}
.ab-stat .amber{color:#F2C063}
.ab-stat .muted{color:#8B95A7}
.ab-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ab-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ab-table{width:100%;border-collapse:collapse;font-size:11.5px}
.ab-table th{color:#5C6678;font-weight:600;text-align:left;padding:4px 8px;border-bottom:1px solid #242C3A;white-space:nowrap}
.ab-table td{padding:6px 8px;border-bottom:1px solid #1d2330;vertical-align:middle;white-space:nowrap}
.ab-table tr:hover td{background:rgba(242,192,99,.04)}
.ab-num{font-variant-numeric:tabular-nums;text-align:right}
.ab-tag{display:inline-block;background:#1C2330;border-radius:5px;color:#8B95A7;font-size:9.5px;padding:1px 6px;margin-right:4px}
.ab-tag.gold{color:#F2C063}
.ab-tag.green{color:#7EE2A0}
.ab-tag.red{color:#FF8A9A}
.ab-tag.amber{color:#F2C063}
.ab-hitbar{width:52px;height:5px;background:#222936;border-radius:3px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:5px}
.ab-hitbar i{display:block;height:100%;background:linear-gradient(90deg,#D29922,#7EE2A0)}
.ab-insight{display:flex;gap:8px;padding:8px 2px;border-top:1px solid #1d2330;font-size:11.5px;line-height:1.55}
.ab-insight:first-child{border-top:none}
.ab-insight .ic{flex-shrink:0;font-size:13px}
.ab-insight.warn .tx{color:#F2C063}
.ab-insight.good .tx{color:#7EE2A0}
.ab-insight.info .tx{color:#C9D4E8}
.ab-btn{background:#8a6a1f;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.ab-btn:hover{filter:brightness(1.12)}
.ab-btn:disabled{opacity:.45;cursor:not-allowed}
.ab-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ab-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ab-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ab-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 9px;font-size:12px;width:100%;min-width:0}
.ab-inp:focus{outline:none;border-color:#8a6a1f}
.ab-inp::placeholder{color:#4d5566}
.ab-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.ab-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ab-toast.bad{border-color:#54262c;color:#FF8A9A}
.ab-toast.good{border-color:#2b4a35;color:#7EE2A0}
.ab-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ab-legend{display:flex;gap:12px;font-size:10px;color:#8B95A7;flex-wrap:wrap}
.ab-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}
.ab-caliber{font-size:10.5px;color:#8B95A7;line-height:1.7;padding:2px 0}
.ab-caliber code{background:#12151c;border:1px solid #222936;border-radius:5px;padding:0 5px;color:#C9D4E8}
`

const TABS = [
  { id: 'overview', label: '总览' },
  { id: 'models', label: '模型' },
  { id: 'projects', label: '项目' },
  { id: 'quality', label: '质量' },
  { id: 'settings', label: '设置' },
] as const

type TabId = (typeof TABS)[number]['id']

function srcDot(ok: boolean | null | undefined) {
  if (ok === true) return <span className="ab-dot ok" title="正常" />
  if (ok === false) return <span className="ab-dot bad" title="异常" />
  return <span className="ab-dot idle" title="未扫描" />
}

export default function AbacusPanel(_props: { pluginId: string; onSendToChat?: (message: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<TabId>('overview')
  const [data, setData] = useState<PanelData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [toast, setToast] = useState<{ text: string; kind: 'good' | 'bad' | '' } | null>(null)
  const [busy, setBusy] = useState('')
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((text: string, kind: 'good' | 'bad' | '' = '') => {
    setToast({ text, kind })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const d = await loadPanelData()
      setData(d)
      setLoadErr('')
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, 10000)
    return () => window.clearInterval(t)
  }, [refresh])

  const onSaveSettings = useCallback(async (s: AbacusSettings) => {
    try {
      await saveSettings(s)
      await refresh()
      showToast('设置已保存（服务 30s 内热加载）', 'good')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'bad')
    }
  }, [refresh, showToast])

  const onCmd = useCallback(async (op: 'rescan' | 'sync_prices', waitMs: number, doing: string) => {
    if (busy) return
    setBusy(op)
    showToast(`${doing}…`)
    try {
      const r = await sendCmd(op, waitMs)
      if (r && r.ok === true) {
        showToast(`${doing}完成`, 'good')
      } else {
        showToast(`${doing}失败：${(r && (r.error as string)) || '未知错误'}`, 'bad')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : `${doing}失败`, 'bad')
    } finally {
      setBusy('')
      await refresh()
    }
  }, [busy, refresh, showToast])

  const meta = data && data.meta
  const statusLine = meta
    ? `台账 ${meta.entries ?? 0} 条 ｜ 上次扫描 ${meta.lastScanAt ? new Date(meta.lastScanAt).toLocaleTimeString() : '—'}${meta.scanning ? ' ｜ 扫描中…' : ''}`
    : '等待后台服务首次扫描（约 1 分钟）…'

  return (
    <div className="ab-root">
      <style>{css}</style>
      <div className="ab-top">
        <div className="ab-headrow">
          <div className="ab-logo">🧮</div>
          <div className="ab-tt">
            <b>AI 用量账 · AI 花销账房</b>
            <small>{loadErr ? `加载失败：${loadErr}` : statusLine}</small>
          </div>
          <div className="ab-status">
            {meta && meta.sources ? (
              <>
                {srcDot(meta.sources.zcode && meta.sources.zcode.ok)}
                {srcDot(meta.sources.claude && meta.sources.claude.ok)}
                {srcDot(meta.sources.polaris && meta.sources.polaris.ok)}
              </>
            ) : null}
          </div>
        </div>
        <div className="ab-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`ab-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="ab-body">
        {!data ? (
          <div className="ab-empty">{loadErr || '正在读取台账…'}</div>
        ) : (() => {
          const ctx = { data, refresh, showToast }
          return (
            <>
              {tab === 'overview' && <OverviewTab ctx={ctx} />}
              {tab === 'models' && <ModelsTab ctx={ctx} />}
              {tab === 'projects' && <ProjectsTab ctx={ctx} />}
              {tab === 'quality' && <QualityTab ctx={ctx} />}
              {tab === 'settings' && (
                <SettingsTab
                  ctx={ctx}
                  busy={busy}
                  onCmd={onCmd}
                  onSaveSettings={onSaveSettings}
                  defaults={DEFAULT_SETTINGS}
                />
              )}
            </>
          )
        })()}
      </div>
      {toast && <div className={`ab-toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}
