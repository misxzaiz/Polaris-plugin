/**
 * 域名诊断台面板外壳：头部（服务心跳 + 运行态）+ 5 Tab（体检 / 邮件身份 / 传播 / 历史 / 设置）
 * 数据源：cap.kv dom.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零网络请求；诊断由后台服务单权威执行。轮询：可见时每 2.5s 拉心跳，隐藏时暂停。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMeta, type ServiceMeta } from './model'
import DiagnoseTab from './DiagnoseTab'
import EmailTab from './EmailTab'
import PropagateTab from './PropagateTab'
import HistoryTab from './HistoryTab'
import SettingsTab from './SettingsTab'

const TABS = [
  { key: 'diagnose', label: '体检' },
  { key: 'email', label: '邮件身份' },
  { key: 'propagate', label: '传播' },
  { key: 'history', label: '历史' },
  { key: 'settings', label: '设置' },
] as const
type TabKey = typeof TABS[number]['key']

export default function Panel() {
  const [tab, setTab] = useState<TabKey>('diagnose')
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [hostErr, setHostErr] = useState('')
  const visibleRef = useRef(true)

  const poll = useCallback(async () => {
    try { setMeta(await loadMeta()) } catch (_) { /* 心跳读取失败不弹错，下一轮再试 */ }
  }, [])

  useEffect(() => {
    let timer: number | undefined
    const loop = () => {
      if (visibleRef.current && document.visibilityState === 'visible') poll()
      timer = window.setTimeout(loop, 2500)
    }
    const onVis = () => { visibleRef.current = document.visibilityState === 'visible' }
    document.addEventListener('visibilitychange', onVis)
    loop()
    return () => { document.removeEventListener('visibilitychange', onVis); if (timer) clearTimeout(timer) }
  }, [poll])

  const running = meta?.running || null

  return (
    <div className="dp-root">
      <div className="dp-top">
        <div className="dp-logo">🌐</div>
        <div className="dp-tt">
          <b>域名诊断台</b>
          <small>
            <span className={`dp-dot ${meta ? (meta.degraded ? 'stale' : 'ok') : 'down'}`} />
            {meta
              ? meta.degraded ? '服务运行中（数据通道降级重试中）' : `服务 v${meta.version}`
              : '服务未连接（去「设置」页启动）'}
          </small>
        </div>
        {running && (
          <span className="dp-run" title={running.domain}>
            {running.domain} · {running.step}
          </span>
        )}
        <div className="dp-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`dp-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="dp-body">
        {hostErr && <div className="dp-err">{hostErr}</div>}
        {tab === 'diagnose' && <DiagnoseTab meta={meta} onDone={() => setHistoryKey((k) => k + 1)} />}
        {tab === 'email' && <EmailTab meta={meta} />}
        {tab === 'propagate' && <PropagateTab meta={meta} />}
        {tab === 'history' && <HistoryTab refreshKey={historyKey} />}
        {tab === 'settings' && <SettingsTab meta={meta} />}
      </div>
    </div>
  )
}
