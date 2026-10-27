/**
 * 设置 Tab：复盘默认期限 / JSON 导出 / 清空（二次确认）
 */
import { useState } from 'react'
import {
  saveSettings, deleteDecision, exportJson, loadAllDecisions,
  DEFAULT_SETTINGS, type PanelCtx,
} from './model'

export default function SettingsTab({ ctx }: { ctx: PanelCtx }) {
  const { settings, refresh, showToast, decisions } = ctx
  const [days, setDays] = useState(String(settings.reviewDefaultDays))
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [busy, setBusy] = useState(false)

  const saveDays = async () => {
    const n = Math.round(Number(days))
    if (!Number.isFinite(n) || n < 1 || n > 3650) { showToast('期限应为 1-3650 的天数', 'bad'); return }
    setBusy(true)
    try {
      await saveSettings({ ...settings, reviewDefaultDays: n })
      await refresh()
      showToast('已保存', 'good')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const doExport = async () => {
    try {
      const ds = decisions && decisions.length ? decisions : await loadAllDecisions()
      const json = exportJson(ds, settings)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `decision-journal-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      showToast(`已导出 ${ds.length} 条`, 'good')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    }
  }

  const doWipe = async () => {
    if (!confirmWipe) { setConfirmWipe(true); return }
    setBusy(true)
    try {
      for (const d of decisions || []) {
        await deleteDecision(d.id)
      }
      setConfirmWipe(false)
      await refresh()
      showToast('台账已清空', 'good')
    } catch (e) {
      showToast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="dj-sec"><i className="dj-bar" />复盘节奏</div>
      <div className="dj-card"><div className="dj-card-b">
        <label className="dj-lbl" style={{ marginTop: 0 }}>默认复盘期限（天）</label>
        <div className="dj-row">
          <input className="dj-inp" style={{ width: 110 }} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
          <button className="dj-btn" disabled={busy} onClick={() => void saveDays()}>保存</button>
        </div>
        <div className="dj-sub" style={{ marginTop: 6 }}>
          立此存照时未显式指定期限的决策，按此天数设置复盘到期日（当前 {settings.reviewDefaultDays} 天；插件缺省 {DEFAULT_SETTINGS.reviewDefaultDays} 天）。
        </div>
      </div></div>

      <div className="dj-sec"><i className="dj-bar" />数据</div>
      <div className="dj-card"><div className="dj-card-b">
        <div className="dj-row">
          <button className="dj-btn ghost" onClick={() => void doExport()}>导出 JSON</button>
          <button className={`dj-btn ${confirmWipe ? 'danger' : 'ghost'}`} disabled={busy} onClick={() => void doWipe()}>
            {confirmWipe ? '再点一次确认清空' : '清空台账'}
          </button>
          {confirmWipe ? <button className="dj-btn ghost" onClick={() => setConfirmWipe(false)}>取消</button> : null}
        </div>
        <div className="dj-sub" style={{ marginTop: 6 }}>
          台账共 {decisions ? decisions.length : 0} 条，存于 Polaris 数据根（cap.kv，decision.* 键空间），随主应用备份策略走。数据不出设备。
        </div>
      </div></div>

      <div className="dj-sec"><i className="dj-bar" />方法论备忘</div>
      <div className="dj-card"><div className="dj-card-b">
        <div className="dj-sub">
          · 预期必须可检验：时间范围 + 可观察判据，拒绝「会更好」。<br />
          · 把握是真实概率不是愿望：说「八成」就填 80，校准曲线才会对你诚实。<br />
          · 到期就复盘：兑现 / 部分兑现 / 落空打分校准，作废（前提消失）不计分。<br />
          · 复盘写一句教训：经验卡会在你下次做类似决定时被 AI 引用。
        </div>
      </div></div>
    </div>
  )
}
