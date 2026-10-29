/**
 * SettingsTab —— 设置：服务管理卡（自举 start）+ 索引卡 + 源开关 + 排除词 + 隐私说明
 *
 * 服务 start 必须 installPath + contribution（面板不知道装在哪 → 插件发现自举）。
 * 设置写入 sift.settings，服务 30s 热读生效。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  kvSet,
  readServiceStatus,
  readSettings,
  saveSettings,
  selfStartService,
  stopService,
  type SiftMeta,
  type SiftSettings,
  type SiftSource,
} from './model'

const SERVICE_ID = 'sift-service'
const PLUGIN_ID = 'time-sift'

const SOURCE_DESC: Record<SiftSource, string> = {
  polaris: 'Polaris 对话（dialogs JSONL）',
  v2: 'Polaris 会话 v2（messages.db）',
  claude: 'Claude Code 原生（~/.claude/projects）',
  zcode: 'ZCode 会话（~/.zcode/cli/db.sqlite）',
}

interface Props {
  meta: SiftMeta | null
  onMetaRefresh: () => void
}

export default function SettingsTab({ meta, onMetaRefresh }: Props) {
  const [settings, setSettings] = useState<SiftSettings | null>(null)
  const [svc, setSvc] = useState<{ status: string; lastError?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmReindex, setConfirmReindex] = useState(false)

  const refresh = useCallback(async () => {
    const [s, st] = await Promise.all([readSettings(), readServiceStatus(SERVICE_ID)])
    setSettings(s)
    setSvc(st)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const updateSettings = async (patch: Partial<SiftSettings>) => {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    await saveSettings(next)
    setMsg('已保存，服务 30 秒内热读生效。')
  }

  const doStart = async () => {
    setBusy(true)
    setMsg('')
    try {
      await selfStartService(PLUGIN_ID, SERVICE_ID)
      setMsg('启动指令已下发，几秒后刷新看状态。')
      onMetaRefresh()
      setTimeout(refresh, 3000)
    } catch (e) {
      setMsg(`启动失败：${(e as Error).message}`)
    }
    setBusy(false)
  }

  const doStop = async () => {
    setBusy(true)
    setMsg('')
    try {
      await stopService(SERVICE_ID)
      setMsg('已停止。')
      setTimeout(refresh, 2000)
    } catch (e) {
      setMsg(`停止失败：${(e as Error).message}`)
    }
    setBusy(false)
  }

  const doReindex = async () => {
    if (!confirmReindex) {
      setConfirmReindex(true)
      setMsg('重建会重读全部数据源（可能数分钟），再点一次确认执行。')
      return
    }
    setConfirmReindex(false)
    setBusy(true)
    setMsg('')
    try {
      const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      await kvSet('sift.cmd.reindex.' + nonce, { op: 'reindex', nonce, confirm: true, at: Date.now() })
      setMsg('重建已触发（异步执行）。进度看上方索引状态，phase 回到 idle 即完成。')
      onMetaRefresh()
    } catch (e) {
      setMsg(`触发失败：${(e as Error).message}`)
    }
    setBusy(false)
  }

  const idx = meta && meta.indexing ? meta.indexing : null
  const idxBusy = idx && idx.phase !== 'idle' && idx.phase !== 'error'
  const sourceStats = (meta && meta.sources) || {}

  return (
    <>
      <div className="ts-sec">
        <span className="ts-bar" /> 服务状态
      </div>
      <div className="ts-card">
        <div className="ts-card-b">
          <div className="ts-row">
            <span className="ts-dot" style={{ background: svc && svc.status === 'running' ? '#3FB950' : '#F85149' }} />
            <b style={{ fontSize: 12.5 }}>{svc ? `后台服务：${svc.status}` : '后台服务：状态未知（服务管理器没返回该服务）'}</b>
            <div style={{ marginLeft: 'auto' }} className="ts-row">
              <button className="ts-btn sm" disabled={busy} onClick={doStart}>
                启动
              </button>
              <button className="ts-btn ghost sm" disabled={busy} onClick={doStop}>
                停止
              </button>
            </div>
          </div>
          {svc && svc.lastError && <div className="ts-sub" style={{ marginTop: 6, color: '#FF8182' }}>最近错误：{svc.lastError}</div>}
          {meta && (
            <div className="ts-sub" style={{ marginTop: 6 }}>
              v{meta.version || '?'} · 桥 {meta.degraded ? '不可达（降级）' : meta.bridge || '?'} · 数据根 {meta.dataRoot || '未找到'}
              {meta.smoke ? ' · 冒烟模式' : ''}
              {meta.sqlite ? '' : ' · node:sqlite 不可用（v2/zcode 两源降级关闭，需 node ≥22.5）'}
            </div>
          )}
        </div>
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> 索引
        {idx && idxBusy && (
          <span className="ts-hint">
            <span className="ts-spin" /> {idx.phase} {idx.done}/{idx.total}
          </span>
        )}
      </div>
      <div className="ts-card">
        <div className="ts-card-b">
          <div className="ts-sub">
            {idx && idx.phase === 'error' ? (
              <span style={{ color: '#FF8182' }}>上次索引出错：{idx.error || '未知错误'}</span>
            ) : (
              <>
                已入库 {meta && meta.catalog ? meta.catalog.sessions : 0} 个会话。各源最近扫描：
                {(['polaris', 'claude', 'v2', 'zcode'] as SiftSource[]).map((s) => {
                  const st = sourceStats[s]
                  return (
                    <span key={s} style={{ marginLeft: 8 }}>
                      {s} {st ? (st.err === -1 ? '(降级)' : st.err === -2 ? '(失败)' : st.files > 0 ? `${st.files} 文件` : '(空)') : '—'}
                    </span>
                  )
                })}
              </>
            )}
          </div>
          <div className="ts-row" style={{ marginTop: 8 }}>
            <button className={`ts-btn sm ${confirmReindex ? 'danger' : 'ghost'}`} disabled={busy || !meta} onClick={doReindex}>
              重建索引
            </button>
            <span className="ts-sub">换机器/数据根迁移/口径变更后使用；日常增量自动进行。</span>
          </div>
        </div>
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> 数据源
      </div>
      <div className="ts-card">
        <div className="ts-card-b">
          {settings &&
            (['polaris', 'v2', 'claude', 'zcode'] as SiftSource[]).map((s) => (
              <label key={s} className="ts-row" style={{ marginBottom: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={settings.sources[s]}
                  onChange={(e) => updateSettings({ sources: { ...settings.sources, [s]: e.target.checked } })}
                />
                {SOURCE_DESC[s]}
              </label>
            ))}
          <div className="ts-sub">关掉的源会被摘出索引（重开会全量重扫）。SQLite 两源需 node ≥ 22.5。</div>
        </div>
      </div>

      <div className="ts-sec">
        <span className="ts-bar" /> 排除词
        <span className="ts-hint">标题或路径包含即不入库（每行一个）</span>
      </div>
      <div className="ts-card">
        <div className="ts-card-b">
          <textarea
            className="ts-inp"
            style={{ minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder={'如：\n密码\n私密项目名'}
            value={settings ? settings.excludeKeywords.join('\n') : ''}
            onChange={(e) => {
              if (!settings) return
              setSettings({ ...settings, excludeKeywords: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })
            }}
            onBlur={() => settings && updateSettings({ excludeKeywords: settings.excludeKeywords })}
          />
          <div className="ts-sub" style={{ marginTop: 6 }}>保存后新扫描即时生效；已入库条目在下轮 kv 提交时移出可见目录。</div>
        </div>
      </div>

      {msg && <div className="ts-sub" style={{ padding: '2px 18px 10px' }}>{msg}</div>}

      <div className="ts-sec">
        <span className="ts-bar" /> 隐私
      </div>
      <div className="ts-card">
        <div className="ts-card-b ts-sub">
          会话记忆是纯本地插件：数据源只读，索引缓存落在应用配置目录（time-sift/），对外零网络请求。
          可见数据经 cap.kv 在你的设备之间同步（桌面/手机/Web 同一账号），不经任何第三方。
        </div>
      </div>
    </>
  )
}
