/**
 * 设置 Tab：后台服务管理（cap.pluginServiceManager）+ 清扫设置 + 数据管理
 */
import { useEffect, useState } from 'react'
import {
  listServiceStatus, serviceAction, saveSettings, purgeAll, kvKeys, kvDel,
  K, SETTING_LIMITS, SERVICE_ID, timeAgo,
  type AmberData, type AmberSettings, type ServiceStatus,
} from './model'

export default function SettingsTab({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: AmberData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [statusErr, setStatusErr] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState<AmberSettings | null>(data?.settings ?? null)

  useEffect(() => { setDraft(data?.settings ?? null) }, [data?.settings])

  const refreshStatus = async () => {
    try {
      const all = await listServiceStatus()
      setStatus(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID) ?? null)
      setStatusErr('')
    } catch (e) {
      setStatusErr((e as Error).message)
    }
  }

  useEffect(() => {
    refreshStatus()
    const t = setInterval(refreshStatus, 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId])

  const doService = async (action: 'start' | 'stop' | 'restart') => {
    setBusy(action)
    try {
      await serviceAction(action, pluginId, SERVICE_ID)
      showToast(`已${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}服务`)
      setTimeout(refreshStatus, 2000)
    } catch (e) {
      showToast(`服务操作失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const clamp = (key: 'keepDays' | 'maxItems', v: number): number => {
    const [lo, hi] = SETTING_LIMITS[key]
    return Math.min(hi, Math.max(lo, Math.floor(Number(v) || lo)))
  }

  const save = async () => {
    if (!draft) return
    try {
      await saveSettings({
        sweepEnabled: draft.sweepEnabled === true,
        keepDays: clamp('keepDays', draft.keepDays),
        maxItems: clamp('maxItems', draft.maxItems),
      })
      await reload()
      showToast('设置已保存（服务 60 秒内生效）')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }

  const purge = async () => {
    if (!window.confirm('清空全部琥珀条目、正文与摘录（设置保留）。确定？')) return
    setBusy('purge')
    try {
      await purgeAll()
      await reload()
      showToast('清空命令已下发（服务在下一个周期执行）')
    } catch (e) {
      showToast(`清理失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const clearAll = async () => {
    if (!window.confirm('删除琥珀插件的全部数据（条目/正文/摘录/设置/信箱）？不可恢复。')) return
    setBusy('clearAll')
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('amber.'))
      await Promise.all(keys.map((k) => kvDel(k)))
      await reload()
      showToast('已清空全部琥珀数据')
    } catch (e) {
      showToast(`清理失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const stateCls = (s?: string) => (s === 'running' ? '#3FB950' : s === 'error' ? '#F85149' : s === 'starting' ? '#D29922' : '#8B95A7')
  const meta = data?.meta

  return (
    <div>
      <div className="am-sec"><i className="am-bar" />后台服务</div>
      <div className="am-card">
        <div className="am-card-b">
          <div className="am-row">
            <i className="am-dot" style={{ background: stateCls(status?.state) }} />
            <b style={{ flex: 1 }}>
              {status ? ({
                starting: '启动中', running: '运行中', stopping: '停止中', stopped: '已停止', error: '异常',
              }[status.state] || status.state) : statusErr ? '状态未知' : '未注册（插件刚装？稍候刷新）'}
            </b>
            {busy && busy !== 'purge' && busy !== 'clearAll' && <span className="am-spin" />}
          </div>
          <div className="am-state">
            {status?.pid && <span className="am-kv">PID <b>{status.pid}</b></span>}
            {status?.port ? <span className="am-kv">· 端口 <b>{status.port}</b></span> : null}
            {status?.uptime ? <span className="am-kv">· 已运行 <b>{Math.floor(status.uptime / 60)} 分钟</b></span> : null}
            {!!status?.restartCount && <span className="am-kv">· 重启 <b>{status.restartCount}</b> 次</span>}
          </div>
          {status?.lastError && <div className="am-sub" style={{ color: '#F85149', marginTop: 4 }}>{status.lastError}</div>}
          <div className="am-state">
            {meta
              ? <span className="am-kv">心跳 <b>{timeAgo(meta.lastTickAt)}</b> · 桥 <b>{meta.bridge}</b> · v{meta.version}</span>
              : <span className="am-kv">尚无心跳（服务未运行时正常）</span>}
          </div>
          <div className="am-actions">
            <button className="am-btn sm" disabled={busy !== '' || status?.state === 'running' || status?.state === 'starting'} onClick={() => doService('start')}>启动</button>
            <button className="am-btn sm ghost" disabled={busy !== '' || !status || (status.state !== 'running' && status.state !== 'error' && status.state !== 'starting')} onClick={() => doService('restart')}>重启</button>
            <button className="am-btn sm ghost" disabled={busy !== '' || !status || (status.state !== 'running' && status.state !== 'starting' && status.state !== 'error')} onClick={() => doService('stop')}>停止</button>
          </div>
          <div className="am-sub" style={{ marginTop: 8 }}>
            抓取全部由本服务在后台原生执行（无浏览器跨域限制）；桌面与手机 Web 面板通过 cap.kv 看到同一份数据。
          </div>
        </div>
      </div>

      <div className="am-sec"><i className="am-bar" />清扫策略</div>
      {draft && (
        <div className="am-card">
          <div className="am-card-b" style={{ padding: 0 }}>
            <div className="am-field">
              <div className="am-field-l">
                <b>自动清扫</b>
                <small>收藏库语义是永久封存——默认关。开启后按下方规则清理。</small>
              </div>
              <button className={`am-btn sm ${draft.sweepEnabled ? '' : 'ghost'}`} onClick={() => setDraft({ ...draft, sweepEnabled: !draft.sweepEnabled })}>
                {draft.sweepEnabled ? '已开启' : '已关闭'}
              </button>
            </div>
            <div className="am-field">
              <div className="am-field-l"><b>保留天数</b><small>非星标条目超过该天数被清理（天，7–3650）</small></div>
              <input className="am-num" type="number" min={SETTING_LIMITS.keepDays[0]} max={SETTING_LIMITS.keepDays[1]} value={draft.keepDays} disabled={!draft.sweepEnabled}
                onChange={(e) => setDraft({ ...draft, keepDays: Number(e.target.value) })} />
            </div>
            <div className="am-field">
              <div className="am-field-l"><b>条数上限</b><small>超出后最旧的被清理；0 = 不限（条，0–5000）</small></div>
              <input className="am-num" type="number" min={SETTING_LIMITS.maxItems[0]} max={SETTING_LIMITS.maxItems[1]} value={draft.maxItems} disabled={!draft.sweepEnabled}
                onChange={(e) => setDraft({ ...draft, maxItems: Number(e.target.value) })} />
            </div>
            <div className="am-sub" style={{ padding: '8px 13px' }}>星标条目永不自动清理，也不占条数名额。</div>
            <div className="am-actions" style={{ padding: '0 13px 10px' }}>
              <button className="am-btn sm" onClick={save}>保存设置</button>
            </div>
          </div>
        </div>
      )}

      <div className="am-sec"><i className="am-bar" />数据</div>
      <div className="am-card">
        <div className="am-card-b">
          <div className="am-state" style={{ marginTop: 0 }}>
            <span className="am-kv">琥珀 <b>{data?.items.length ?? 0}</b></span>
            <span className="am-kv">· 未读 <b>{data?.items.filter((a) => !a.read).length ?? 0}</b></span>
            <span className="am-kv">· 星标 <b>{data?.items.filter((a) => a.star).length ?? 0}</b></span>
            <span className="am-kv">· 摘录 <b>{data?.quotes.length ?? 0}</b></span>
            <span className="am-kv">· 存储 <b>cap.kv（amber.* 键空间）</b></span>
          </div>
          <div className="am-actions">
            <button className="am-btn sm ghost" disabled={!!busy} onClick={purge}>{busy === 'purge' ? <span className="am-spin" /> : '清空全部琥珀（保留设置）'}</button>
            <button className="am-btn sm danger" disabled={!!busy} onClick={clearAll}>{busy === 'clearAll' ? <span className="am-spin" /> : '清空全部数据'}</button>
          </div>
        </div>
      </div>

      <div className="am-sec"><i className="am-bar" />关于</div>
      <div className="am-card">
        <div className="am-card-b am-sub">
          琥珀 amber v0.1.0 —— 把网页封进琥珀：永久可读快照 + 全文检索 + 金句摘录。
          <br />· 浏览器有同源策略，本插件把抓取下沉到后台服务原生执行，天然无跨域问题；
          <br />· 字符集探测（BOM/响应头/meta）：GBK 等历史编码页面也能正确封存；
          <br />· 同一 URL 重复封存 = 快照更新 + 封存次数层积，阅读状态与标签保留；
          <br />· 封存失败永不摧毁旧快照——已封存的琥珀是你永久遗产；
          <br />· 在聊天里可直接让 AI 代你操作（amber_save / amber_search / amber_read / amber_quote…）。
        </div>
      </div>
    </div>
  )
}
