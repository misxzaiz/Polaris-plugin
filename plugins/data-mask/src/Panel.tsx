/**
 * 数据脱敏台面板外壳：头部（服务心跳 + 台账规模）+ 4 Tab（脱敏 / 台账 / 文件 / 设置）
 *
 * 数据源：cap.kv datamask.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板本地执行粘贴流脱敏（mask-core 打进 bundle，exposeOriginal 仅面板合法）；
 * 文件/目录脱敏由后台服务单权威执行。台账含原值、只存本机 kv。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadHead, loadLedger, loadSettings, ensureSalt, persistLedgerEntries,
  type LedgerMeta, type LoadedLedger, type MaskSettings, type ServiceMeta, type LatestSummary,
} from './model'
import MaskTab from './MaskTab'
import LedgerTab from './LedgerTab'
import FilesTab from './FilesTab'
import SettingsTab from './SettingsTab'

const css = `
.dm-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dm-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dm-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dm-body::-webkit-scrollbar{width:9px;height:9px}
.dm-body::-webkit-scrollbar-track{background:transparent}
.dm-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.dm-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.dm-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2DD4A7,#3FB950);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.dm-tt{flex:1;min-width:0}
.dm-tt b{font-size:15px;display:block}
.dm-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.dm-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dm-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.dm-dot.stale{background:#D29922}
.dm-dot.down{background:#5C6678}
.dm-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dm-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.dm-tab:hover{color:#E6EAF2}
.dm-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.dm-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dm-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2DD4A7,#3FB950);flex-shrink:0}
.dm-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dm-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dm-card-b{padding:11px 13px}
.dm-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dm-btn{background:#1f7a5c;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dm-btn:hover{filter:brightness(1.1)}
.dm-btn:disabled{opacity:.45;cursor:not-allowed}
.dm-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dm-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dm-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dm-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dm-inp:focus{outline:none;border-color:#1f7a5c}
.dm-inp::placeholder{color:#4d5566}
.dm-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dm-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.dm-ok-msg{color:#3FB950;font-size:11.5px;padding:8px 16px}
.dm-mono{font-family:Consolas,Menlo,monospace}
.dm-toast{position:absolute;left:50%;transform:translateX(-50%);bottom:18px;background:#1C2330;border:1px solid #2a2f3a;color:#E6EAF2;padding:7px 14px;border-radius:9px;font-size:12px;z-index:50;box-shadow:0 4px 18px rgba(0,0,0,.4)}

/* 统计 chips */
.dm-chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 2px}
.dm-chip{display:inline-flex;align-items:center;gap:5px;background:#12151c;border:1px solid #242C3A;border-radius:14px;padding:3px 10px;font-size:11px;color:#C9D1D9;cursor:pointer;user-select:none}
.dm-chip:hover{border-color:#1f7a5c}
.dm-chip.off{opacity:.4;text-decoration:line-through}
.dm-chip b{color:#2DD4A7;font-weight:700}
.dm-chip .cf{color:#D29922;font-size:9px}

/* 输入/输出区 */
.dm-io{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:640px){.dm-io{grid-template-columns:1fr}}
.dm-ta{width:100%;min-height:180px;max-height:420px;background:#12151c;border:1px solid #2a2f3a;border-radius:10px;color:#E6EAF2;padding:9px 11px;font-size:11.5px;line-height:1.6;resize:vertical;font-family:Consolas,Menlo,monospace}
.dm-ta:focus{outline:none;border-color:#1f7a5c}
.dm-ta::placeholder{color:#4d5566}
.dm-out{min-height:180px;max-height:420px;overflow:auto;background:#0d1017;border:1px solid #1d2330;border-radius:10px;padding:9px 11px;font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace;color:#C9D1D9}
.dm-lab{font-size:10.5px;color:#5C6678;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.dm-drop{border:1.5px dashed #2a3244;border-radius:10px;padding:8px;text-align:center;color:#5C6678;font-size:10.5px;margin-top:8px}
.dm-drop.on{border-color:#1f7a5c;color:#2DD4A7}

/* 命中明细 */
.dm-hit{display:flex;gap:7px;align-items:baseline;padding:5px 13px;border-top:1px solid #1d2330;font-size:11px}
.dm-hit-t{flex-shrink:0;color:#2DD4A7;font-weight:600;min-width:70px}
.dm-hit-p{color:#C9D1D9;font-family:Consolas,Menlo,monospace;word-break:break-all}
.dm-hit-k{color:#5C6678;font-size:10px;flex-shrink:0}
.dm-hit.cf{color:#D29922}

/* 台账表 */
.dm-tbl{width:100%;border-collapse:collapse;font-size:11px}
.dm-tbl th{text-align:left;color:#5C6678;font-weight:600;padding:6px 10px;border-bottom:1px solid #242C3A;font-size:10px;position:sticky;top:0;background:#161B22}
.dm-tbl td{padding:5px 10px;border-bottom:1px solid #1d2330;vertical-align:top}
.dm-tbl tr:hover td{background:#12151c}
.dm-mode{display:inline-block;border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.dm-mode.partial{background:#33300f;color:#d8c94a;border:1px solid #4d4916}
.dm-mode.fake{background:#0f2d33;color:#2DD4A7;border:1px solid #1c4a42}
.dm-mode.label{background:#1c2330;color:#8B95A7;border:1px solid #2a3244}

/* 设置行 */
.dm-set-row{display:flex;align-items:center;gap:8px;padding:7px 13px;border-top:1px solid #1d2330;font-size:12px;flex-wrap:wrap}
.dm-set-row:first-child{border-top:none}
.dm-set-name{min-width:120px;font-weight:600}
.dm-set-hint{color:#5C6678;font-size:10.5px;flex:1;min-width:120px}
.dm-mode-pick{display:flex;gap:4px}
.dm-mode-pick button{background:#12151c;border:1px solid #2a2f3a;color:#8B95A7;font-size:10.5px;padding:2px 8px;border-radius:6px;cursor:pointer}
.dm-mode-pick button.on{background:#1f7a5c;border-color:#1f7a5c;color:#fff;font-weight:600}
.dm-sw{position:relative;width:34px;height:19px;border-radius:10px;background:#232834;border:1px solid #2a2f3a;cursor:pointer;flex-shrink:0;transition:background .15s}
.dm-sw.on{background:#1f7a5c;border-color:#1f7a5c}
.dm-sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#8B95A7;transition:all .15s}
.dm-sw.on::after{left:17px;background:#fff}

/* 进度 */
.dm-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:8px 0}
.dm-prog>div{height:100%;background:linear-gradient(90deg,#2DD4A7,#3FB950);border-radius:3px;transition:width .5s}
@keyframes dmPulse{0%,100%{opacity:1}50%{opacity:.45}}
.dm-pulse{animation:dmPulse 1.4s infinite}
`

type Tab = 'mask' | 'ledger' | 'files' | 'settings'

export interface Toast { kind: 'ok' | 'bad'; text: string }

export default function Panel(props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('mask')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [latest, setLatest] = useState<LatestSummary | null>(null)
  const [ledgerMeta, setLedgerMeta] = useState<LedgerMeta | null>(null)
  const [settings, setSettings] = useState<MaskSettings | null>(null)
  const [salt, setSalt] = useState('')
  const [ledger, setLedger] = useState<LoadedLedger | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [visible, setVisible] = useState(true)
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((text: string, kind: 'ok' | 'bad' = 'ok') => {
    setToast({ kind, text })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const refreshHead = useCallback(async () => {
    try {
      const d = await loadHead()
      setMeta(d.meta)
      setLatest(d.latest)
      setLedgerMeta(d.ledgerMeta)
    } catch (_) { /* 静默 */ }
  }, [])

  const refreshLedger = useCallback(async () => {
    try {
      const l = await loadLedger()
      setLedger(l)
    } catch (_) { /* 静默 */ }
  }, [])

  // 初始化：盐 → 设置 → 台账 → 心跳
  useEffect(() => {
    void (async () => {
      try { setSalt(await ensureSalt()) } catch (_) { /* 桥不可达时给空盐：partial/label 不受影响 */ }
      try { setSettings(await loadSettings()) } catch (_) { /* 读取失败用默认设置 */ }
      void refreshLedger()
      void refreshHead()
    })()
    // 仅挂载时执行一次（盐/设置加载是幂等首屏动作）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onVis = useCallback(() => setVisible(document.visibilityState === 'visible'), [])
  useEffect(() => {
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [onVis])

  useEffect(() => {
    if (!visible) return
    refreshHead()
    const t = setInterval(refreshHead, 6000)
    return () => clearInterval(t)
  }, [visible, refreshHead])

  const hb = heartbeatState(meta)
  const ledgerCount = ledgerMeta?.entryCount ?? ledger?.map.size ?? 0

  if (!settings) {
    return (
      <div className="dm-root">
        <style>{css}</style>
        <div className="dm-empty">正在加载设置…<br />若长期无响应，请检查 Polaris 是否已启动登录。</div>
      </div>
    )
  }

  return (
    <div className="dm-root">
      <style>{css}</style>
      <div className="dm-top">
        <div className="dm-logo">🛡️</div>
        <div className="dm-tt">
          <b>数据脱敏台</b>
          <small>
            <span className={`dm-dot ${hb.cls}`} />
            {hb.label}
            {' · '}
            {`台账 ${ledgerCount} 条`}
            {meta?.job ? ' · 服务脱敏中' : ''}
          </small>
        </div>
        <div className="dm-tabs">
          {(
            [
              ['mask', '脱敏'],
              ['ledger', '台账'],
              ['files', '文件'],
              ['settings', '设置'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`dm-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="dm-body">
        {tab === 'mask' && (
          <MaskTab
            settings={settings}
            salt={salt}
            ledger={ledger}
            onSendToChat={props.onSendToChat}
            showToast={showToast}
            onPersist={async (entries) => {
              try {
                await persistLedgerEntries('panel-session', entries)
              } catch (_) { showToast('台账暂未同步到本机存储（脱敏结果不受影响）', 'bad') }
            }}
            onLedgerChanged={refreshLedger}
            onChanged={refreshHead}
          />
        )}
        {tab === 'ledger' && (
          <LedgerTab
            ledger={ledger}
            ledgerMeta={ledgerMeta}
            showToast={showToast}
            onReload={async () => { await refreshLedger(); await refreshHead() }}
          />
        )}
        {tab === 'files' && (
          <FilesTab head={{ meta, latest }} showToast={showToast} onChanged={refreshHead} />
        )}
        {tab === 'settings' && (
          <SettingsTab
            settings={settings}
            head={{ meta, ledgerMeta }}
            showToast={showToast}
            onSaved={async (s) => { setSettings(s); await refreshHead() }}
            onLedgerReset={async () => {
              const newSalt = await ensureSalt()
              setSalt(newSalt)
              await refreshLedger()
              await refreshHead()
            }}
          />
        )}
      </div>
      {toast && <div className="dm-toast" style={toast.kind === 'bad' ? { borderColor: '#54262c' } : undefined}>{toast.text}</div>}
    </div>
  )
}

function heartbeatState(meta: ServiceMeta | null): { cls: string; label: string } {
  if (!meta || !meta.lastTickAt) return { cls: 'down', label: '服务未运行（粘贴脱敏不受影响）' }
  const age = Date.now() - meta.lastTickAt
  if (meta.degraded) return { cls: 'stale', label: '桥降级' }
  if (age > 130 * 1000) return { cls: 'stale', label: `心跳停滞 ${Math.round(age / 1000)}s` }
  return { cls: 'ok', label: meta.job ? '脱敏任务进行中' : '服务正常' }
}
