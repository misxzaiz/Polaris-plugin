/**
 * 设置 Tab：节奏参数 + 导出全部 JSON（剪贴板）+ 清空（二次确认）+ 边界说明
 */
import { useState } from 'react'
import { saveSettings, normalizeSettingsLocal, kvDel, K, exportAll, type PanelData, type TetherSettings } from './model'
import { Section, type Toast } from './ui'

export default function SettingsTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  if (!data) return <div className="tr-empty">载入中…</div>
  const s = data.settings
  const d = draft ?? {
    defaultCadenceDays: String(s.defaultCadenceDays),
    driftGraceDays: String(s.driftGraceDays),
    birthdayDays: String(s.birthdayDays),
    dueWarnDays: String(s.dueWarnDays),
  }

  const save = async () => {
    const n = normalizeSettingsLocal({
      defaultCadenceDays: Number(d.defaultCadenceDays),
      driftGraceDays: Number(d.driftGraceDays),
      birthdayDays: Number(d.birthdayDays),
      dueWarnDays: Number(d.dueWarnDays),
    })
    await saveSettings(n as TetherSettings)
    setDraft(null)
    await reload()
    showToast('节奏参数已保存（AI 与面板同时生效）', 'good')
  }

  const exportJson = async () => {
    try {
      const dump = exportAll(s, data.peopleBook, data.promisesBook, data.journalBook)
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
      showToast(`已复制 ${Object.keys(dump.people as object).length} 位故人 + ${Object.keys(dump.promises as object).length} 条承诺 + ${(dump.journal as unknown[]).length} 条往来 JSON 到剪贴板`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const clearAll = async () => {
    if (!confirmingClear) { setConfirmingClear(true); return }
    try {
      for (const k of [K.settings, K.people, K.promises, K.journal]) await kvDel(k)
      await reload()
      setConfirmingClear(false)
      showToast('已清空全部故人数据')
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, 'bad')
    }
  }

  const field = (key: keyof typeof d, label: string, sub: string) => (
    <div className="tr-field">
      <div className="tr-field-l"><b>{label}</b><small>{sub}</small></div>
      <input
        className="tr-num" inputMode="numeric"
        value={d[key]}
        onChange={(e) => setDraft({ ...d, [key]: e.target.value })}
      />
    </div>
  )

  return (
    <div>
      <Section title="联系节奏" hint="AI 与面板共用" />
      <div className="tr-card">
        <div className="tr-card-b" style={{ padding: 0 }}>
          {field('defaultCadenceDays', '默认联系节奏', '没单独设节奏的人按这个频率提醒（7..365 天）')}
          {field('driftGraceDays', '失联宽限', '超出节奏这么多天进红榜（3..90 天），之前是黄榜')}
          {field('birthdayDays', '生日预告窗口', '提前这么多天提醒生日（1..90 天）')}
          {field('dueWarnDays', '承诺临期窗口', '到期前这么多天标黄（1..30 天）')}
          <div className="tr-field">
            <button className="tr-btn sm" onClick={() => void save()}>保存</button>
            <span className="tr-sub">生日仅支持阳历（农历暂不支持）</span>
          </div>
        </div>
      </div>

      <Section title="数据" />
      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-sub">全部数据存于本机（cap.kv tether.*），不出设备；AI 与面板读写同一份。</div>
          <div className="tr-row" style={{ marginTop: 8 }}>
            <button className="tr-btn sm ghost" onClick={() => void exportJson()}>导出全部 JSON</button>
            {confirmingClear
              ? (
                <>
                  <button className="tr-btn sm danger" onClick={() => void clearAll()}>确认清空（不可恢复）</button>
                  <button className="tr-btn sm ghost" onClick={() => setConfirmingClear(false)}>算了</button>
                </>
              )
              : <button className="tr-btn sm danger" onClick={() => void clearAll()}>清空全部数据</button>}
          </div>
        </div>
      </div>

      <Section title="关于" />
      <div className="tr-card">
        <div className="tr-card-b tr-sub">
          故人 tether v0.1.0 —— 人脉与承诺账本：把「人」变成可对话的资产。
          <br />· 零后台服务、零网络请求：人脉是最私人的数据，不出设备；
          <br />· 双向承诺（我许的/我等的）+ 逾期红/临期黄，人情 open loop 终于有地方落；
          <br />· 失联预警按每人的节奏算（N 天未联系 vs 节奏 M 天），不是黑盒分数；
          <br />· 往来流水为双端追加（尽力而为），档案/承诺/设置为单对象原子换写；
          <br />· 桌面与手机 Web 经 cap.kv 看到同一本账。
        </div>
      </div>
    </div>
  )
}
