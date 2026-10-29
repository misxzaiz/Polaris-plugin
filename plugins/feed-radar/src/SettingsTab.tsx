/**
 * 设置 Tab：后台服务管理（cap.pluginServiceManager）+ 调度设置 + 数据管理
 */
import { useEffect, useState } from 'react'
import {
  listServiceStatus, serviceAction, saveSettings, purgeArticles,
  kvKeys, kvDel, K, SETTING_LIMITS, SERVICE_ID, timeAgo,
  type RadarData, type RadarSettings, type ServiceStatus,
} from './model'

export default function SettingsTab({ pluginId, data, reload, showToast }: {
  pluginId: string
  data: RadarData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
}) {
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [statusErr, setStatusErr] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState<RadarSettings | null>(data?.settings ?? null)

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

  const clamp = (key: keyof RadarSettings, v: number): number => {
    const [lo, hi] = SETTING_LIMITS[key]
    return Math.min(hi, Math.max(lo, Math.floor(Number(v) || lo)))
  }

  const save = async () => {
    if (!draft) return
    try {
      await saveSettings({
        pollMin: clamp('pollMin', draft.pollMin),
        retentionDays: clamp('retentionDays', draft.retentionDays),
        maxPerFeed: clamp('maxPerFeed', draft.maxPerFeed),
        readKeepDays: clamp('readKeepDays', draft.readKeepDays),
        contentKeepHours: clamp('contentKeepHours', draft.contentKeepHours),
      })
      await reload()
      showToast('设置已保存（服务 60 秒内生效）')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }

  const purge = async () => {
    if (!window.confirm('清空全部文章与正文（星标也会一并清掉，仅保留订阅源定义）。确定？')) return
    setBusy('purge')
    try {
      await purgeArticles()
      await reload()
      showToast('已清空全部文章（订阅源保留）')
    } catch (e) {
      showToast(`清理失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const clearAll = async () => {
    if (!window.confirm('删除RSS 订阅的全部数据（订阅源/文章/正文/设置）？不可恢复。')) return
    setBusy('clearAll')
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('radar.'))
      await Promise.all(keys.map((k) => kvDel(k)))
      await reload()
      showToast('已清空全部雷达数据')
    } catch (e) {
      showToast(`清理失败：${(e as Error).message}`, true)
    }
    setBusy('')
  }

  const stateCls = (s?: string) => (s === 'running' ? '#3FB950' : s === 'error' ? '#F85149' : s === 'starting' ? '#D29922' : '#8B95A7')
  const meta = data?.meta

  return (
    <div>
      <div className="fr-sec"><i className="fr-bar" />后台服务</div>
      <div className="fr-card">
        <div className="fr-card-b">
          <div className="fr-row">
            <i className="fr-dot" style={{ background: stateCls(status?.state) }} />
            <b style={{ flex: 1 }}>
              {status ? ({
                starting: '启动中', running: '运行中', stopping: '停止中', stopped: '已停止', error: '异常',
              }[status.state] || status.state) : statusErr ? '状态未知' : '未注册（插件刚装？稍候刷新）'}
            </b>
            {busy && busy !== 'purge' && busy !== 'clearAll' && <span className="fr-spin" />}
          </div>
          <div className="fr-state">
            {status?.pid && <span className="fr-kv">PID <b>{status.pid}</b></span>}
            {status?.port ? <span className="fr-kv">· 端口 <b>{status.port}</b></span> : null}
            {status?.uptime ? <span className="fr-kv">· 已运行 <b>{Math.floor(status.uptime / 60)} 分钟</b></span> : null}
            {!!status?.restartCount && <span className="fr-kv">· 重启 <b>{status.restartCount}</b> 次</span>}
          </div>
          {status?.lastError && <div className="fr-sub" style={{ color: '#F85149', marginTop: 4 }}>{status.lastError}</div>}
          <div className="fr-state">
            {meta
              ? <span className="fr-kv">心跳 <b>{timeAgo(meta.lastTickAt)}</b> · 桥 <b>{meta.bridge}</b> · v{meta.version}</span>
              : <span className="fr-kv">尚无心跳（服务未运行时正常）</span>}
          </div>
          <div className="fr-actions">
            <button className="fr-btn sm" disabled={busy !== '' || status?.state === 'running' || status?.state === 'starting'} onClick={() => doService('start')}>启动</button>
            <button className="fr-btn sm ghost" disabled={busy !== '' || !status || (status.state !== 'running' && status.state !== 'error' && status.state !== 'starting')} onClick={() => doService('restart')}>重启</button>
            <button className="fr-btn sm ghost" disabled={busy !== '' || !status || (status.state !== 'running' && status.state !== 'starting' && status.state !== 'error')} onClick={() => doService('stop')}>停止</button>
          </div>
          <div className="fr-sub" style={{ marginTop: 8 }}>
            抓取全部由本服务在后台原生执行（无浏览器跨域限制）；桌面与手机 Web 面板通过 cap.kv 看到同一份数据。
          </div>
        </div>
      </div>

      <div className="fr-sec"><i className="fr-bar" />调度与保留</div>
      {draft && (
        <div className="fr-card">
          <div className="fr-card-b" style={{ padding: 0 }}>
            <div className="fr-field">
              <div className="fr-field-l"><b>全局抓取间隔</b><small>无独立间隔的源都跟随此值（分钟，10–240）</small></div>
              <input className="fr-num" type="number" min={SETTING_LIMITS.pollMin[0]} max={SETTING_LIMITS.pollMin[1]} value={draft.pollMin}
                onChange={(e) => setDraft({ ...draft, pollMin: Number(e.target.value) })} />
            </div>
            <div className="fr-field">
              <div className="fr-field-l"><b>文章保留天数</b><small>超期文章自动清理，星标永留（天，7–365）</small></div>
              <input className="fr-num" type="number" min={SETTING_LIMITS.retentionDays[0]} max={SETTING_LIMITS.retentionDays[1]} value={draft.retentionDays}
                onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })} />
            </div>
            <div className="fr-field">
              <div className="fr-field-l"><b>单源文章上限</b><small>超出后最旧的被清理（条，30–500）</small></div>
              <input className="fr-num" type="number" min={SETTING_LIMITS.maxPerFeed[0]} max={SETTING_LIMITS.maxPerFeed[1]} value={draft.maxPerFeed}
                onChange={(e) => setDraft({ ...draft, maxPerFeed: Number(e.target.value) })} />
            </div>
            <div className="fr-field">
              <div className="fr-field-l"><b>已读保留天数</b><small>已读且过期的文章清理（天，3–180）</small></div>
              <input className="fr-num" type="number" min={SETTING_LIMITS.readKeepDays[0]} max={SETTING_LIMITS.readKeepDays[1]} value={draft.readKeepDays}
                onChange={(e) => setDraft({ ...draft, readKeepDays: Number(e.target.value) })} />
            </div>
            <div className="fr-field">
              <div className="fr-field-l"><b>正文保留时长</b><small>已抓取的正文过期回收，摘要仍在（小时，8–240）</small></div>
              <input className="fr-num" type="number" min={SETTING_LIMITS.contentKeepHours[0]} max={SETTING_LIMITS.contentKeepHours[1]} value={draft.contentKeepHours}
                onChange={(e) => setDraft({ ...draft, contentKeepHours: Number(e.target.value) })} />
            </div>
            <div className="fr-actions" style={{ padding: '10px 13px' }}>
              <button className="fr-btn sm" onClick={save}>保存设置</button>
            </div>
          </div>
        </div>
      )}

      <div className="fr-sec"><i className="fr-bar" />数据</div>
      <div className="fr-card">
        <div className="fr-card-b">
          <div className="fr-state" style={{ marginTop: 0 }}>
            <span className="fr-kv">订阅源 <b>{data?.feeds.length ?? 0}</b></span>
            <span className="fr-kv">· 文章 <b>{data?.articles.length ?? 0}</b></span>
            <span className="fr-kv">· 未读 <b>{data?.unreadTotal ?? 0}</b></span>
            <span className="fr-kv">· 存储 <b>cap.kv（radar.* 键空间）</b></span>
          </div>
          <div className="fr-actions">
            <button className="fr-btn sm ghost" disabled={!!busy} onClick={purge}>{busy === 'purge' ? <span className="fr-spin" /> : '清空全部文章（保留订阅源）'}</button>
            <button className="fr-btn sm danger" disabled={!!busy} onClick={clearAll}>{busy === 'clearAll' ? <span className="fr-spin" /> : '清空全部数据'}</button>
          </div>
        </div>
      </div>

      <div className="fr-sec"><i className="fr-bar" />关于</div>
      <div className="fr-card">
        <div className="fr-card-b fr-sub">
          RSS 订阅 feed-radar v0.1.0 —— RSS/Atom 订阅 + AI 读报。
          <br />· 浏览器有同源策略，本插件把抓取下沉到后台服务原生执行，天然无跨域问题；
          <br />· 条件请求（ETag / If-Modified-Since）：源没更新时零成本回跳；
          <br />· 手机端访问时面板经宿主统一通道（自动带 token）读写 cap.kv，与桌面看到同一份数据；
          <br />· 在聊天里可直接让 AI 读报（radar_unread / radar_read_article / radar_mark）；
          <br />· 抓取礼貌策略：同一主机至少间隔 10 秒，连续失败指数退避。
        </div>
      </div>
    </div>
  )
}
