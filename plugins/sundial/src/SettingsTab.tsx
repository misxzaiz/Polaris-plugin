/**
 * 设置 Tab：服务管理卡（自举 start）+ 全局设置 + 数据管理（导出/清空）+ 说明
 */
import { useEffect, useState } from 'react'
import * as core from '../shared/core'
import {
  exportAll, serviceRestart, serviceStart, serviceStatus, serviceStop,
  saveSettings, type SundialData, type SundialSettings,
} from './model'
import { kvDel, kvKeys } from './host'

const css = `
.sd-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.sd-field:first-child{border-top:none}
.sd-field-l{flex:1;min-width:0}
.sd-field-l b{font-size:12.5px;display:block}
.sd-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.sd-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.sd-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#8B95A7}
.sd-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.sd-note{font-size:11px;color:#8B95A7;line-height:1.8;padding:11px 13px;border-top:1px solid #1d2330;word-break:break-word}
.sd-note b{color:#C9D1D9}
`

const SERVICE_ID = 'sundial-service'

export default function SettingsTab({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: SundialData | null
  reload: () => Promise<SundialData | null>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const [svc, setSvc] = useState<{ running: boolean; lastError?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [settings, setLocalSettings] = useState<SundialSettings | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  useEffect(() => {
    let alive = true
    serviceStatus(pluginId, SERVICE_ID).then((s) => { if (alive) setSvc(s) }).catch(() => {})
    return () => { alive = false }
  }, [pluginId, data?.meta])

  useEffect(() => {
    if (data && !settings) setLocalSettings(data.settings)
  }, [data, settings])

  const act = async (fn: () => Promise<void>, label: string) => {
    setBusy(true)
    try {
      await fn()
      showToast(label)
      await reload()
    } catch (e) {
      showToast(`${label}失败：${(e as Error).message}`, true)
    } finally {
      setBusy(false)
      serviceStatus(pluginId, SERVICE_ID).then(setSvc).catch(() => {})
    }
  }

  const save = async () => {
    if (!settings) return
    try {
      await saveSettings(settings)
      await reload()
      showToast('设置已保存')
    } catch (e) { showToast((e as Error).message, true) }
  }

  const wipe = async () => {
    if (!confirmWipe) { setConfirmWipe(true); return }
    setConfirmWipe(false)
    try {
      const keys = await kvKeys()
      const mine = keys.filter((k) => k.startsWith('sundial.') && !k.startsWith('sundial.smoke.'))
      for (const k of mine) await kvDel(k).catch(() => {})
      await reload()
      showToast(`已清空 ${mine.length} 个键`)
    } catch (e) { showToast((e as Error).message, true) }
  }

  const exportJson = () => {
    if (!data) return
    try {
      const text = exportAll(data)
      const blob = new Blob([text], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sundial-export-${core.fmtDay(Date.now())}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    } catch (e) { showToast((e as Error).message, true) }
  }

  const meta = data?.meta || null
  const hb = meta?.lastTickAt ? Date.now() - meta.lastTickAt : Infinity

  return (
    <div>
      <style>{css}</style>
      <div className="sd-sec"><i className="sd-bar" />后台服务</div>
      <div className="sd-card">
        <div className="sd-field" style={{ borderTop: 'none' }}>
          <div className="sd-field-l">
            <b>日程提醒服务（ICS 抓取 / 提醒投影）</b>
            <small>
              {svc === null && '状态未知（宿主通道不可用？）'}
              {svc && svc.running && `运行中${meta ? ` · ${meta.events ?? '?'} 事件 · ${meta.icsCount ?? 0} 订阅` : ''}`}
              {svc && !svc.running && '未运行——提醒投影与 ICS 同步停摆，可手动启动'}
              {svc?.lastError ? ` · 最近错误：${svc.lastError}` : ''}
            </small>
            <div className="sd-state">
              <i className={`sd-dot ${hb < 180000 ? 'ok' : hb < Infinity ? 'stale' : 'down'}`} />
              {hb < 180000 ? `心跳正常（${meta?.version || '?'}）` : hb < Infinity ? `心跳停滞 ${Math.round(hb / 60000)} 分钟` : '无心跳'}
              {meta?.bridge ? ` · 桥 ${meta.bridge}` : ''}
            </div>
          </div>
        </div>
        <div className="sd-actions" style={{ padding: '0 13px 11px' }}>
          <button className="sd-btn sm" disabled={busy} onClick={() => act(async () => {
            const st = await serviceStatus(pluginId, SERVICE_ID)
            if (st && st.running) { showToast('服务已在运行'); return }
            await serviceStart(pluginId, SERVICE_ID)
          }, '启动命令已下发')}>启动</button>
          <button className="sd-btn sm ghost" disabled={busy} onClick={() => act(() => serviceStop(pluginId, SERVICE_ID), '已停止')}>停止</button>
          <button className="sd-btn sm ghost" disabled={busy} onClick={() => act(() => serviceRestart(pluginId, SERVICE_ID), '已重启')}>重启</button>
        </div>
      </div>

      <div className="sd-sec"><i className="sd-bar" />全局设置</div>
      <div className="sd-card">
        {settings && (
          <>
            <div className="sd-field" style={{ borderTop: 'none' }}>
              <div className="sd-field-l"><b>ICS 同步间隔</b><small>外部日历多久抓一次（2-168 小时）</small></div>
              <input className="sd-num" type="number" min={2} max={168} value={settings.icsIntervalHours}
                onChange={(e) => setLocalSettings({ ...settings, icsIntervalHours: Number(e.target.value) || 6 })} />
              <span className="sd-sub">小时</span>
            </div>
            <div className="sd-field">
              <div className="sd-field-l"><b>提醒过期窗口</b><small>提醒从到期到事件开始后多久自动消失（10-240 分钟）</small></div>
              <input className="sd-num" type="number" min={10} max={240} value={settings.reminderGraceMin}
                onChange={(e) => setLocalSettings({ ...settings, reminderGraceMin: Number(e.target.value) || 30 })} />
              <span className="sd-sub">分钟</span>
            </div>
            <div className="sd-field">
              <div className="sd-field-l"><b>历史保留</b><small>过期的一次性日程多少天后自动清扫（重复事件永留，30-3650 天）</small></div>
              <input className="sd-num" type="number" min={30} max={3650} value={settings.retentionDays}
                onChange={(e) => setLocalSettings({ ...settings, retentionDays: Number(e.target.value) || 365 })} />
              <span className="sd-sub">天</span>
            </div>
            <div className="sd-actions" style={{ padding: '0 13px 11px' }}>
              <button className="sd-btn" onClick={save}>保存设置</button>
            </div>
          </>
        )}
      </div>

      <div className="sd-sec"><i className="sd-bar" />数据管理</div>
      <div className="sd-card">
        <div className="sd-field" style={{ borderTop: 'none' }}>
          <div className="sd-field-l"><b>导出 JSON</b><small>全部事件 / 订阅 / 设置导出为文件（纯本地，数据不出设备）</small></div>
          <button className="sd-btn sm" onClick={exportJson}>导出</button>
        </div>
        <div className="sd-field">
          <div className="sd-field-l"><b>清空全部数据</b><small>删除本插件全部键（事件/订阅/提醒/设置），不可恢复</small></div>
          <button className={`sd-btn sm ${confirmWipe ? 'danger' : 'ghost'}`} onClick={wipe}>{confirmWipe ? '再点一次确认清空' : '清空…'}</button>
        </div>
      </div>

      <div className="sd-sec"><i className="sd-bar" />说明</div>
      <div className="sd-card">
        <div className="sd-note" style={{ borderTop: 'none' }}>
          <b>对话式用法</b>：聊天里对 AI 说「周五下午3点提醒我取快递」「每天晚上10点提醒背单词并打卡」「距离高考还有几天」「订阅我的课表 ICS 链接」，AI 会调用日程提醒的 MCP 工具直接落库。<br />
          <b>提醒触达</b>：到期提醒显示在本面板横幅（带提示音）+ AI 的 sundial_today 可见。主应用暂未提供系统级通知通道，拿到后本插件会跟进。<br />
          <b>跨域说明</b>：面板零外网请求；ICS 订阅抓取由后台服务原生 fetch（带 SSRF 守卫与 ETag 条件请求），桌面 / 手机 / Web 三端经 cap.kv 看到同一份数据。<br />
          <b>排障</b>：服务日志在 <code>{'{appConfigDir}'}/sundial.log</code>（512KB 轮转）。
        </div>
      </div>
    </div>
  )
}
