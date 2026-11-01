/**
 * SettingsTab —— 服务管理卡（自举 start）+ 诊断设置（主解析器/启用解析器/超时/DKIM selector）
 */
import { useEffect, useState } from 'react'
import {
  SERVICE_ID, sendCommand, requestState, listServiceStatus, startSelfService,
  stopSelfService, restartSelfService, type Settings, type ResolverInfo, type ServiceMeta,
} from './model'

const RESOLVER_META: Record<string, string> = {
  alidns: '阿里 DNS（国内直连，默认主解析器）',
  dnspod: 'DNSPod 腾讯（国内直连）',
  cloudflare: 'Cloudflare（全球视角；部分网络环境不可达，不可达会如实标注）',
  google: 'Google（全球视角；同上）',
}

export default function SettingsTab({ meta }: { meta: ServiceMeta | null }) {
  const [svcStatus, setSvcStatus] = useState<string>('')
  const [svcErr, setSvcErr] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [resolvers, setResolvers] = useState<ResolverInfo[]>([])
  const [extraSelectors, setExtraSelectors] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => { refresh() }, [meta?.ts])

  async function refresh() {
    try {
      const st = await listServiceStatus()
      const mine = st.find((s) => s.serviceId === SERVICE_ID)
      setSvcStatus(mine ? mine.status : 'unknown')
      setSvcErr(mine && mine.lastError ? String(mine.lastError) : '')
    } catch (e) { setSvcStatus('unknown'); setSvcErr(String((e as Error).message || e)) }
    try {
      const s = await requestState()
      if (s.ok) {
        setSettings(s.settings)
        setResolvers(s.resolvers || [])
        setExtraSelectors((s.settings.dkimSelectorsExtra || []).join(', '))
      }
    } catch (_) { /* 服务未运行时设置留空，保存时提示 */ }
  }

  async function doStart() {
    setSvcErr('')
    try { await startSelfService(); setTimeout(refresh, 1500) } catch (e) { setSvcErr(String((e as Error).message || e)) }
  }
  async function doStop() { setSvcErr(''); try { await stopSelfService(); setTimeout(refresh, 1000) } catch (e) { setSvcErr(String((e as Error).message || e)) } }
  async function doRestart() { setSvcErr(''); try { await restartSelfService(); setTimeout(refresh, 1500) } catch (e) { setSvcErr(String((e as Error).message || e)) } }

  async function save() {
    if (!settings) { setSaveMsg('服务未运行，读不到当前设置'); return }
    setSaving(true); setSaveMsg('')
    const extras = extraSelectors.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    try {
      const r = await sendCommand<{ ok: boolean; settings: Settings; error?: string }>('settings_set', {
        ...settings,
        dkimSelectorsExtra: extras,
      }, 20000)
      if (r.ok) { setSettings(r.settings); setSaveMsg('已保存（服务已热更）') }
      else setSaveMsg(r.error || '保存失败')
    } catch (e) { setSaveMsg(String((e as Error).message || e)) } finally { setSaving(false) }
  }

  const running = svcStatus === 'running'
  const heart = meta ? (meta.degraded ? 'stale' : 'ok') : 'down'

  return (
    <div>
      <div className="dp-card">
        <div className="dp-card-b">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>诊断服务</b>
            <span className={`dp-dot ${running && heart === 'ok' ? 'ok' : running && heart === 'stale' ? 'stale' : 'down'}`} />
            <span style={{ fontSize: 11.5, color: '#8B95A7' }}>
              {running ? (heart === 'ok' ? `运行中 · v${meta?.version || '?'}` : '运行中（桥降级，60s 内自愈重试）') : svcStatus === 'unknown' ? '状态未知' : '已停止'}
            </span>
            <span style={{ flex: 1 }} />
            <button className="dp-btn sm" onClick={doStart}>启动</button>
            <button className="dp-btn sm ghost" onClick={doRestart}>重启</button>
            <button className="dp-btn sm danger" onClick={doStop}>停止</button>
          </div>
          <div className="dp-sub" style={{ marginTop: 6 }}>
            服务是唯一执行者（DoH 查询 + 证书探测），正常随插件自动启动；面板与 AI 只读写数据不直接联网
          </div>
          {svcErr && <div className="dp-err" style={{ marginTop: 6 }}>{svcErr}</div>}
        </div>
      </div>

      <div className="dp-card">
        <div className="dp-card-b">
          <b style={{ fontSize: 13 }}>解析器</b>
          {resolvers.length === 0 && (
            <div className="dp-sub" style={{ marginTop: 8 }}>服务未运行，读不到解析器状态——先在上方启动服务。</div>
          )}
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {resolvers.map((r) => (
              <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={!!settings?.enabledResolvers?.includes(r.id)}
                  onChange={(e) => {
                    if (!settings) return
                    const has = settings.enabledResolvers.includes(r.id)
                    const next = e.target.checked ? [...settings.enabledResolvers, r.id] : settings.enabledResolvers.filter((x) => x !== r.id)
                    if (!next.length) return // 至少保留一个
                    setSettings({ ...settings, enabledResolvers: next, primary: settings.primary === r.id && !e.target.checked ? next[0] : settings.primary })
                  }}
                />
                <input
                  type="radio" name="dp-primary" checked={settings?.primary === r.id}
                  onChange={() => settings && setSettings({ ...settings, primary: r.id })}
                  title="设为主解析器"
                />
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span style={{ color: '#5C6678', fontSize: 10.5 }}>{r.overridden ? '（测试钩子重定向）' : RESOLVER_META[r.id]}</span>
              </label>
            ))}
          </div>
          <div className="dp-sub" style={{ marginTop: 6 }}>
            第一个勾选框=参与查询对比；圆点=主解析器（记录收集用它，失败自动顺延到下一个启用的）。全球解析器不可达时会在报告里如实标注，不影响国内解析器结果。
          </div>
        </div>
      </div>

      <div className="dp-card">
        <div className="dp-card-b">
          <b style={{ fontSize: 13 }}>高级</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
            <span style={{ color: '#8B95A7' }}>单请求超时</span>
            <select
              className="dp-sel" value={settings?.timeoutMs || 8000}
              onChange={(e) => settings && setSettings({ ...settings, timeoutMs: Number(e.target.value) })}
            >
              {[5000, 8000, 12000, 20000].map((n) => <option key={n} value={n}>{n / 1000} 秒</option>)}
            </select>
            <span style={{ color: '#8B95A7' }}>DKIM selector<br />补充探测</span>
            <input
              className="dp-inp" placeholder="逗号分隔，如 mysrv, mail2024"
              value={extraSelectors} onChange={(e) => setExtraSelectors(e.target.value)}
            />
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="dp-btn" disabled={saving || !settings} onClick={save}>{saving ? '保存中…' : '保存设置'}</button>
            {saveMsg && <span style={{ fontSize: 11, color: saveMsg.includes('已保存') ? '#3FB950' : '#E3B341' }}>{saveMsg}</span>}
          </div>
          <div className="dp-sub" style={{ marginTop: 6 }}>
            补充 selector 后，邮件体检会连同 16 个常见 selector 一起探测（上限 12 个）
          </div>
        </div>
      </div>

      <div className="dp-card">
        <div className="dp-card-b">
          <b style={{ fontSize: 13 }}>关于</b>
          <div className="dp-sub" style={{ marginTop: 6, lineHeight: 1.8 }}>
            域名诊断台 v{meta?.version || '0.1.0'}——全只读诊断：DNS 走公共 DoH（JSON API），证书只读取证，不发邮件、不写任何第三方系统、不存任何密钥。<br />
            服务日志：{'%APPDATA%'}\\Polaris\\domain-probe\\service.log（512KB 自动轮转）。<br />
            证书到期盯防可配合「定时任务台」：AI 定时任务里写「每天调用 dom_cert 检查 example.com」即可。
          </div>
        </div>
      </div>
    </div>
  )
}
