/**
 * 设置 Tab：临期窗口/推荐条数、服务管理（发现自举启停）、数据导出/清空
 */
import { useState } from 'react'
import { timeAgo, kvGet, kvKeys, capDispatchSelf, type Api, type Overview, type Toast } from './model'

export default function SettingsTab(props: { ov: Overview; api: Api; toast: Toast }) {
  const { ov, api, toast } = props
  const [expiringDays, setExpiringDays] = useState(String(ov.settings.expiringDays))
  const [suggestCount, setSuggestCount] = useState(String(ov.settings.suggestCount))
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)

  const metaFresh = ov.meta && ov.meta.lastTickAt && (Date.now() - ov.meta.lastTickAt) < 5 * 60_000

  const save = () => {
    api.saveSettings({
      expiringDays: Number(expiringDays) || 5,
      suggestCount: Number(suggestCount) || 3,
    }, toast)
  }

  const exportAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('stove.'))
      const dump: Record<string, unknown> = {}
      for (const k of keys) dump[k] = await kvGet(k)
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), plugin: 'ask-stove', data: dump }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ask-stove-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`已导出 ${keys.length} 个键`)
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const serviceAction = async (action: 'start' | 'restart' | 'stop') => {
    setBusy(true)
    try {
      await capDispatchSelf('cap.pluginServiceManager', { action, pluginId: 'ask-stove', serviceId: 'stove-service' })
      toast(`已发送 ${action} 指令，稍后看状态灯`)
    } catch (e) {
      // start 需要带 contribution（经 discovery 自举），退化为完整路径
      try {
        if (action === 'start' || action === 'restart') {
          const r = await capDispatchSelf<{ plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Array<Record<string, unknown>> } }> }>('cap.pluginDiscovery', { action: 'discover' })
          const self = (r.plugins || []).find((p) => p && p.id === 'ask-stove')
          const svc = self?.contributes?.services?.find((s) => s && (s as { id?: string }).id === 'stove-service')
          if (!self || !svc) throw new Error('插件发现结果中找不到本插件服务（刷新插件列表后重试）')
          await capDispatchSelf('cap.pluginServiceManager', {
            action: 'start',
            pluginId: 'ask-stove',
            installPath: self.installPath,
            contribution: svc,
          })
          toast('已启动服务')
        } else {
          throw e
        }
      } catch (e2) {
        toast((e2 as Error).message, true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="as-sec"><span className="as-bar" />偏好</div>
      <div className="as-card"><div className="as-card-b">
        <div className="as-row">
          <span style={{ flex: 1 }}>临期窗口（天）<div className="as-sub">到期落在这个窗口内就上红榜</div></span>
          <input className="as-inp d" style={{ width: 70 }} value={expiringDays} onChange={(e) => setExpiringDays(e.target.value)} inputMode="numeric" />
        </div>
        <div className="as-row" style={{ marginTop: 10 }}>
          <span style={{ flex: 1 }}>灶签条数<div className="as-sub">「今日」页推荐几道菜</div></span>
          <input className="as-inp d" style={{ width: 70 }} value={suggestCount} onChange={(e) => setSuggestCount(e.target.value)} inputMode="numeric" />
        </div>
        <div className="as-row" style={{ marginTop: 12 }}>
          <button className="as-btn" onClick={save}>保存</button>
        </div>
      </div></div>

      <div className="as-sec"><span className="as-bar" />后台服务</div>
      <div className="as-card"><div className="as-card-b">
        <div className="as-row">
          <span style={{ flex: 1 }}>
            状态：<b style={{ color: metaFresh ? '#7ED9A2' : '#F85149' }}>{metaFresh ? '在线' : '未连上'}</b>
            {ov.meta?.lastTickAt && <span className="as-sub"> · 心跳 {timeAgo(ov.meta.lastTickAt)} · 桥 {ov.meta.bridge === 'ok' ? '正常' : '降级'}</span>}
            <div className="as-sub">抓菜谱、清理孤儿结果都靠它；不在线时库存/清单照常可用</div>
          </span>
        </div>
        <div className="as-row" style={{ marginTop: 10 }}>
          <button className="as-btn sm" disabled={busy} onClick={() => serviceAction('restart')}>重启</button>
          <button className="as-btn sm ghost" disabled={busy} onClick={() => serviceAction('start')}>启动</button>
          <button className="as-btn sm danger" disabled={busy} onClick={() => serviceAction('stop')}>停止</button>
        </div>
      </div></div>

      <div className="as-sec"><span className="as-bar" />数据</div>
      <div className="as-card"><div className="as-card-b">
        <div className="as-row">
          <span style={{ flex: 1 }} className="as-sub">
            库存 {ov.pantry.items.length} · 菜谱 {ov.recipes.order.length} · 历史 {ov.history.events.length} 条
            <div>全部存在 Polaris 数据根（cap.kv），桌面/手机同源。</div>
          </span>
        </div>
        <div className="as-row" style={{ marginTop: 10 }}>
          <button className="as-btn ghost sm" onClick={exportAll}>导出 JSON</button>
          {!confirmClear ? (
            <button className="as-btn danger sm" onClick={() => setConfirmClear(true)}>清空全部数据…</button>
          ) : (
            <>
              <button className="as-btn danger sm" onClick={() => { api.clearAll(toast); setConfirmClear(false) }}>确认清空（不可恢复）</button>
              <button className="as-btn ghost sm" onClick={() => setConfirmClear(false)}>算了</button>
            </>
          )}
        </div>
      </div></div>
    </>
  )
}
