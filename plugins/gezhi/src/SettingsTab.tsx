/** 设置 Tab：导出目录（与 MCP 共享）+ 默认主题 + 隐私说明。 */
import { useEffect, useState } from 'react'
import type { PanelCtx } from './Panel'
import { saveSettings, core } from './model'

export default function SettingsTab({ ctx }: { ctx: PanelCtx }) {
  const { settings, reloadSettings, showToast } = ctx
  const [exportDir, setExportDir] = useState(settings.exportDir || '')
  const [theme, setTheme] = useState(settings.theme || 'slate')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setExportDir(settings.exportDir || '')
    setTheme(settings.theme || 'slate')
  }, [settings])

  const onSave = async () => {
    const dir = exportDir.trim()
    if (dir && !/^[a-zA-Z]:[\\/]|^\//.test(dir)) {
      showToast('导出目录需为绝对路径（如 D:\\报表 或 /Users/me/报表）', 'bad')
      return
    }
    setBusy(true)
    try {
      await saveSettings({ exportDir: dir, theme })
      await reloadSettings()
      showToast('已保存（对话生成与面板共用此目录/主题）')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="gz-sec"><span className="gz-bar" />导出目录</div>
      <div className="gz-card"><div className="gz-card-b">
        <div className="gz-sub">
          对话生成的 .xlsx 落盘位置。留空 = 自动（桌面 → 下载 → 家目录）。
          面板本地构建走浏览器下载，不受此项影响。
        </div>
        <label className="gz-lbl">目录（绝对路径）</label>
        <input
          className="gz-inp"
          placeholder={core.DEFAULT_SETTINGS.exportDir === '' ? '如 D:\\报表（留空自动选桌面）' : ''}
          value={exportDir}
          onChange={(e) => setExportDir(e.target.value)}
        />
        <label className="gz-lbl">默认表头主题</label>
        <select className="gz-sel" value={theme} onChange={(e) => setTheme(e.target.value)}>
          {core.THEME_KEYS.map((k) => <option key={k} value={k}>{core.THEMES[k].label}</option>)}
        </select>
        <div style={{ marginTop: 10 }}>
          <button className="gz-btn" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </div></div>

      <div className="gz-sec"><span className="gz-bar" />隐私与边界</div>
      <div className="gz-card"><div className="gz-card-b gz-sub">
        · 引擎在本地直生 OOXML：零外网请求、零后台服务、零会员额度，数据不出设备。<br />
        · AI 生成的表格内容只经你已配置的 LLM 通道（模型看到的仅是你让它整理的数据）。<br />
        · 对以 = + - @ 开头的单元格文本，引擎强制按文本存储——不会被 Excel 当公式执行。<br />
        · 删除作品仅移除登记，不删文件；需要删文件请到导出目录手动处理。
      </div></div>
    </div>
  )
}
