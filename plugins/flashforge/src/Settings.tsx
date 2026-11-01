/**
 * 设置：上榜昵称与设备名（成绩记录的 player/device 来源）。
 * 设备名留空时运行端自动用「桌面 / 手机」。
 */
import { useEffect, useState } from 'react'
import { saveSettings, type Settings } from './model'

export function SettingsView(props: { settings: Settings; onSaved: (s: Settings) => void; notify: (n: { text: string; bad?: boolean }) => void }) {
  const { settings, onSaved, notify } = props
  const [nickname, setNickname] = useState(settings.nickname)
  const [deviceName, setDeviceName] = useState(settings.deviceName)

  useEffect(() => {
    setNickname(settings.nickname)
    setDeviceName(settings.deviceName)
  }, [settings.nickname, settings.deviceName])

  const save = async () => {
    const next = { nickname: nickname.trim().slice(0, 24), deviceName: deviceName.trim().slice(0, 24) }
    try {
      await saveSettings(next)
      onSaved(next)
      notify({ text: '设置已保存（跨端同步）' })
    } catch (e) {
      notify({ text: `保存失败：${(e as Error).message}`, bad: true })
    }
  }

  return (
    <div className="ff-settings">
      <label className="ff-field">
        <span className="ff-field-label">上榜昵称</span>
        <input
          className="ff-input"
          value={nickname}
          maxLength={24}
          placeholder="如：老爸 / 小明（留空=匿名）"
          onChange={(e) => setNickname(e.target.value)}
        />
      </label>
      <label className="ff-field">
        <span className="ff-field-label">设备名</span>
        <input
          className="ff-input"
          value={deviceName}
          maxLength={24}
          placeholder="如：书房电脑 / iPad（留空=自动：桌面/手机）"
          onChange={(e) => setDeviceName(e.target.value)}
        />
      </label>
      <button type="button" className="ff-btn ff-btn-primary" onClick={() => void save()}>保存设置</button>
      <div className="ff-dim ff-settings-note">
        成绩协议：沙箱内应用在游戏结束时经 postMessage 上报，面板校验来源后写入本机数据根；
        桌面与手机打开的是同一本应用花园（cap.kv），高分榜自然同榜。
      </div>
    </div>
  )
}
