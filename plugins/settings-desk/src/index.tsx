/**
 * settings-desk 面板入口 —— 设置管理台
 *
 * 原 App.tsx settingsRendering 覆盖层内的内置 SettingsPage 随域迁入；
 * 宿主按 settings 席位渲染本面板，props（initialTab/onClose）由宿主注入。
 */
import { useState } from 'react'
import { SettingsPage } from './SettingsPage'

interface EntryProps {
  initialTab?: string
  onClose?: () => void
}

export default function SettingsDeskEntry({ initialTab, onClose }: EntryProps) {
  const [key] = useState(() => `settings-desk-${Date.now()}`)
  return (
    <SettingsPage
      key={key}
      initialTab={initialTab as never}
      onClose={onClose ?? (() => {})}
    />
  )
}
