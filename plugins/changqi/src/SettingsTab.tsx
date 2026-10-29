/**
 * 设置 Tab：提醒窗口 / 试用预警 / 货币符号 + 导出（CSV/JSON 剪贴板）+ 渠道取消路径字典 + 清空
 */
import { useState } from 'react'
import {
  saveSettings, loadSubs, kvKeys, kvDel, K, toCsv,
  CHANNELS, CHANNEL_LABELS, cancelGuide,
  type PanelData, type Settings,
} from './model'
import type { Toast } from './Panel'

export default function SettingsTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [draft, setDraft] = useState<Partial<Settings> | null>(null)
  const [clearArmed, setClearArmed] = useState(false)

  if (!data) return <div className="cq-empty">载入中…</div>
  const s: Settings = { ...data.settings, ...(draft || {}) }

  const persist = async (next: Settings, msg: string) => {
    await saveSettings(next)
    setDraft(null)
    await reload()
    showToast(msg, 'good')
  }

  const commitNum = (raw: string, min: number, max: number, fallback: number): number => {
    const n = Math.floor(Number(raw))
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }

  const exportCsv = async () => {
    try {
      const csv = toCsv(data.subs, data.today)
      await navigator.clipboard.writeText(csv)
      showToast(`已复制 ${data.subs.length} 条订阅 CSV（可直接粘贴进 Excel）`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const exportJson = async () => {
    try {
      const dump = { exportedAt: Date.now(), settings: data.settings, subs: data.subs }
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
      showToast(`已复制 ${data.subs.length} 条订阅 JSON`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const clearAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('changqi.'))
      for (const k of keys) {
        // eslint-disable-next-line no-await-in-loop
        await kvDel(k)
      }
      await reload()
      showToast('已清空全部订阅台账数据')
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, 'bad')
    }
  }

  const count = data.subs.length

  return (
    <>
      <div className="cq-sec"><span className="cq-bar" />提醒</div>
      <div className="cq-card">
        <div className="cq-field">
          <span className="cq-field-l"><b>续费提前提醒（天）</b><small>距下次扣费 N 天内亮橙条；扣费当天恒亮红条</small></span>
          <input className="cq-num" type="number" min="0" max="14" value={s.remindDays}
            onChange={(e) => setDraft({ ...draft, remindDays: commitNum(e.target.value, 0, 14, data.settings.remindDays) })} />
        </div>
        <div className="cq-field">
          <span className="cq-field-l"><b>试用转正预警（天）</b><small>试用期截止前 N 天亮紫条——转正即扣费</small></span>
          <input className="cq-num" type="number" min="0" max="14" value={s.trialWarnDays}
            onChange={(e) => setDraft({ ...draft, trialWarnDays: commitNum(e.target.value, 0, 14, data.settings.trialWarnDays) })} />
        </div>
        <div className="cq-field">
          <span className="cq-field-l"><b>货币符号</b><small>仅展示用（如 ¥ / $ / €），不做汇率换算</small></span>
          <input className="cq-num" maxLength={3} value={s.currencySymbol}
            onChange={(e) => setDraft({ ...draft, currencySymbol: e.target.value || '¥' })} />
        </div>
        {draft && (
          <div className="cq-field">
            <span className="cq-field-l" />
            <button className="cq-btn sm" onClick={() => persist(s, '设置已保存（AI 查询同口径生效）')}>保存设置</button>
            <button className="cq-btn sm ghost" onClick={() => setDraft(null)}>还原</button>
          </div>
        )}
      </div>

      <div className="cq-sec"><span className="cq-bar" />导出<span className="cq-hint">复制到剪贴板</span></div>
      <div className="cq-card">
        <div className="cq-card-b" style={{ display: 'flex', gap: 8 }}>
          <button className="cq-btn sm ghost" onClick={exportCsv}>复制 CSV（{count} 条）</button>
          <button className="cq-btn sm ghost" onClick={exportJson}>复制 JSON</button>
        </div>
      </div>

      <div className="cq-sec"><span className="cq-bar" />渠道取消路径<span className="cq-hint">App 内取消往往不彻底</span></div>
      <div className="cq-card">
        {CHANNELS.map((ch) => (
          <div className="cq-guideblock" key={ch}>
            <b>{CHANNEL_LABELS[ch] || ch}</b>
            {cancelGuide(ch)}
          </div>
        ))}
      </div>

      <div className="cq-sec"><span className="cq-bar" />数据<span className="cq-hint">纯本地 cap.kv · 不出设备</span></div>
      <div className="cq-card">
        <div className="cq-card-b">
          {clearArmed ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="cq-btn sm danger" onClick={async () => {
                if (window.confirm('再次确认：清空订阅台账全部数据？不可恢复。')) {
                  setClearArmed(false)
                  await clearAll()
                } else setClearArmed(false)
              }}>确认清空（{count} 条订阅）</button>
              <button className="cq-btn sm ghost" onClick={() => setClearArmed(false)}>算了</button>
            </div>
          ) : (
            <button className="cq-btn sm danger" onClick={() => setClearArmed(true)}>清空全部数据</button>
          )}
          <small className="cq-sub" style={{ display: 'block', marginTop: 6 }}>
            台账、设置一并删除，不可恢复；建议先复制 CSV 备份。桌面与手机看到的是同一份数据（cap.kv）。
          </small>
        </div>
      </div>
    </>
  )
}
