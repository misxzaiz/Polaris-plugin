/**
 * 设置 Tab：备份库位置 / 保护范围（一级排除+额外 glob）/ 保留策略 / 调度 /
 * 库上限 / 状态重置。全部经 ark-core.normalizeSettings 校验后写 cap.kv。
 */
import { useState } from 'react'
import {
  saveSettings, resetRuntimeState, DEFAULT_EXCLUDE_TOP, formatBytes,
  type Overview,
} from './model'
import type { Toast } from './Panel'

const PRESETS: { label: string; desc: string; excludeTop: string[] }[] = [
  { label: '推荐', desc: '排除 logs/cache/plugins（可再下载或无价值）', excludeTop: DEFAULT_EXCLUDE_TOP },
  { label: '全量', desc: '连插件载荷一起备（库会大 ~1GB+）', excludeTop: [] },
  { label: '仅核心', desc: '会话/配置/审计/kv，不含语音与引擎会话', excludeTop: ['logs', 'cache', 'plugins', 'voice', 'pi-sessions', 'simple-ai', 'migrations'] },
]

export default function SettingsTab({ data, reload, showToast }: {
  data: Overview | null
  reload: () => Promise<Overview | null>
  showToast: Toast
}) {
  const [draft, setDraft] = useState<null | {
    targetDir: string
    excludeTop: string[]
    extraExcludeGlobs: string
    daily: string
    weekly: string
    monthly: string
    mode: 'off' | 'interval' | 'daily'
    intervalHours: string
    at: string
    maxGb: string
  }>(null)
  const [saving, setSaving] = useState(false)

  if (!data) return <div className="da-empty">载入中…</div>
  const s = data.settings
  const d = draft ?? {
    targetDir: s.targetDir,
    excludeTop: s.excludeTop,
    extraExcludeGlobs: s.extraExcludeGlobs.join(', '),
    daily: String(s.retention.daily),
    weekly: String(s.retention.weekly),
    monthly: String(s.retention.monthly),
    mode: s.schedule.mode,
    intervalHours: String(s.schedule.intervalHours),
    at: s.schedule.at,
    maxGb: String(Math.round(s.maxStoreBytes / 1073741824 * 10) / 10),
  }

  const persist = async () => {
    if (saving) return
    setSaving(true)
    try {
      const r = await saveSettings({
        ...s,
        targetDir: d.targetDir.trim(),
        excludeTop: d.excludeTop,
        extraExcludeGlobs: d.extraExcludeGlobs.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean),
        retention: {
          daily: Number(d.daily) || 0,
          weekly: Number(d.weekly) || 0,
          monthly: Number(d.monthly) || 0,
        },
        schedule: {
          mode: d.mode,
          intervalHours: Number(d.intervalHours) || 12,
          at: /^\d{2}:\d{2}$/.test(d.at.trim()) ? d.at.trim() : '03:30',
        },
        maxStoreBytes: Math.max(0.2, Number(d.maxGb) || 5) * 1073741824,
      })
      if (!r.ok) { showToast(r.error || '保存失败', 'bad'); return }
      setDraft(null)
      await reload()
      showToast('设置已保存（下一 tick 生效）', 'good')
    } finally {
      setSaving(false)
    }
  }

  const doReset = async () => {
    if (!window.confirm('清除运行状态/快照索引/事件（备份库磁盘文件不受影响，设置保留）？')) return
    const n = await resetRuntimeState()
    await reload()
    showToast(`已清除 ${n} 个状态键`)
  }

  return (
    <div>
      <div className="da-sec"><i className="da-bar" />备份库</div>
      <div className="da-card">
        <div className="da-card-b">
          <span className="da-lbl" style={{ marginTop: 0 }}>根目录（留空 = 默认 &lt;数据根&gt;/../polaris-ark，即同盘隔壁）</span>
          <input className="da-inp" value={d.targetDir} onChange={(e) => setDraft({ ...d, targetDir: e.target.value })} placeholder="如 E:\polaris-backup（建议另一个盘）" />
          <div className="da-sub" style={{ marginTop: 6 }}>
            当前生效：{data.state.resolvedTarget || '服务启动后解析'} · 占用 {formatBytes(data.state.storeBytes || 0)} / 上限
          </div>
          <div className="da-row" style={{ marginTop: 8 }}>
            <input className="da-num" style={{ width: 110 }} inputMode="decimal" value={d.maxGb} onChange={(e) => setDraft({ ...d, maxGb: e.target.value })} />
            <span className="da-sub">GB 库上限（超过先自动回收，仍超则暂停自动备份并降级提示）</span>
          </div>
        </div>
      </div>

      <div className="da-sec"><i className="da-bar" />保护范围<span className="da-hint">数据根一级条目排除</span></div>
      <div className="da-card">
        <div className="da-card-b">
          <div className="da-row">
            {PRESETS.map((p) => (
              <button key={p.label} className="da-chip" title={p.desc} onClick={() => setDraft({ ...d, excludeTop: [...p.excludeTop] })}>{p.label}</button>
            ))}
          </div>
          <div className="da-row" style={{ marginTop: 9 }}>
            {['agents', 'audit', 'browser', 'cache', 'companion', 'config.json', 'dialogs', 'downloads', 'http-client', 'logs', 'migrations', 'nexus', 'pi-sessions', 'plugin-sessions', 'plugins', 'requirements', 'scheduler', 'session-v2', 'simple-ai', 'skills', 'stores', 'todo', 'voice'].map((name) => {
              const off = d.excludeTop.includes(name)
              return (
                <button
                  key={name}
                  className={`da-chip ${off ? '' : 'on'}`}
                  title={off ? '点击纳入保护' : '点击排除'}
                  onClick={() => setDraft({ ...d, excludeTop: off ? d.excludeTop.filter((x) => x !== name) : [...d.excludeTop, name] })}
                >{off ? '✕ ' : '✓ '}{name}</button>
              )
            })}
          </div>
          <span className="da-lbl">额外排除 glob（逗号分隔，支持 ** * ?，如 voice/tmp-*, *.bak）</span>
          <input className="da-inp" value={d.extraExcludeGlobs} onChange={(e) => setDraft({ ...d, extraExcludeGlobs: e.target.value })} />
          <div className="da-sub" style={{ marginTop: 6 }}>锁/临时文件（*.lock、*.tmp 等）恒排除，无需配置。</div>
        </div>
      </div>

      <div className="da-sec"><i className="da-bar" />保留策略<span className="da-hint">GFS：祖-父-孙轮换</span></div>
      <div className="da-card">
        <div className="da-card-b" style={{ padding: 0 }}>
          {([['daily', '每日', '近 N 天每天留最新一份'], ['weekly', '每周', '近 N 周每周留最新一份'], ['monthly', '每月', '近 N 月每月留最新一份']] as const).map(([k, label, hint]) => (
            <div className="da-field" key={k}>
              <div className="da-field-l"><b>{label}</b><small>{hint}</small></div>
              <input
                className="da-num" inputMode="numeric"
                value={d[k]}
                onChange={(e) => setDraft({ ...d, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="da-actions" style={{ padding: '10px 13px' }}>
            <span className="da-sub">最新两份永远保底，不会被轮换裁掉</span>
          </div>
        </div>
      </div>

      <div className="da-sec"><i className="da-bar" />调度</div>
      <div className="da-card">
        <div className="da-card-b">
          <div className="da-row">
            {([['interval', '间隔'], ['daily', '每天定时'], ['off', '仅手动']] as const).map(([m, label]) => (
              <button key={m} className={`da-chip ${d.mode === m ? 'on' : ''}`} onClick={() => setDraft({ ...d, mode: m })}>{label}</button>
            ))}
          </div>
          {d.mode === 'interval' && (
            <div className="da-row" style={{ marginTop: 9 }}>
              <span className="da-sub">每</span>
              <input className="da-num" inputMode="numeric" value={d.intervalHours} onChange={(e) => setDraft({ ...d, intervalHours: e.target.value })} />
              <span className="da-sub">小时一次（下次：{data.state.nextRunAt ? new Date(data.state.nextRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}）</span>
            </div>
          )}
          {d.mode === 'daily' && (
            <div className="da-row" style={{ marginTop: 9 }}>
              <span className="da-sub">每天</span>
              <input className="da-num" style={{ width: 90 }} value={d.at} onChange={(e) => setDraft({ ...d, at: e.target.value })} placeholder="03:30" />
              <span className="da-sub">本地时间执行</span>
            </div>
          )}
          {d.mode === 'off' && <div className="da-sub" style={{ marginTop: 8 }}>只响应「立即备份」，不自动排程。</div>}
          <div className="da-sub" style={{ marginTop: 6 }}>应用关机错过的调度，启动后自动补跑一次。</div>
        </div>
      </div>

      <div className="da-actions" style={{ padding: '0 18px 10px' }}>
        <button className="da-btn" disabled={saving} onClick={() => void persist()}>保存全部设置</button>
        {draft && <button className="da-btn ghost" onClick={() => setDraft(null)}>放弃修改</button>}
      </div>

      <div className="da-sec"><i className="da-bar" />数据与状态</div>
      <div className="da-card">
        <div className="da-card-b">
          <div className="da-sub">
            设置/索引/事件都在 cap.kv（dataark.*），跨端一致；快照数据在备份库磁盘。
            <br />「重置运行状态」只清索引与事件（不动备份库、不动设置）——比如想在面板上重新开始计数时用。
          </div>
          <div className="da-actions">
            <button className="da-btn sm danger" onClick={() => void doReset()}>重置运行状态</button>
          </div>
        </div>
      </div>

      <div className="da-sec"><i className="da-bar" />关于</div>
      <div className="da-card">
        <div className="da-card-b da-sub">
          数据方舟 data-ark v0.1.0 —— Polaris 数据根的备份/恢复引擎。
          <br />· 内容寻址去重（CAS+gzip）：不变文件全库只存一份，增量快照只记变化；
          <br />· GFS 保留轮换 + 引用 GC、单写者租约（双 Polaris 实例自动主备）、崩溃恢复（tmp 清理/manifest 最后写）；
          <br />· 热文件协议：读写冲突自动重试，仍不稳定则诚实标记跳过，绝不炸整份快照；
          <br />· 恢复只落暂存目录，引擎没有任何覆盖数据根的代码路径；
          <br />· 一致性说明：快照为逐文件崩溃一致（非跨文件事务），恢复 SQLite 类活跃库前请先退出应用。
        </div>
      </div>
    </div>
  )
}
