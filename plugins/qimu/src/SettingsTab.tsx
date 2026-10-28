/**
 * 设置 Tab：导出目录（AI ppt_build 落盘位置）+ 默认主题
 * 设置存 cap.kv qimu.settings，MCP 与面板同源读取。
 */
import { useState } from 'react'
import type { TabProps } from './Panel'
import { saveSettings, THEMES, THEME_KEYS, type QimuSettings } from './model'

export default function SettingsTab({ settings, reload, showToast }: TabProps) {
  const [dir, setDir] = useState('')
  const [saving, setSaving] = useState(false)

  if (!settings) return <div className="qm-empty">载入中…</div>
  const s = settings

  const save = async () => {
    setSaving(true)
    try {
      const next: QimuSettings = {
        ...s,
        exportDir: dir.trim(),
      }
      await saveSettings(next)
      await reload()
      setDir('')
      showToast('设置已保存（AI 构建将落到新目录）', 'good')
    } finally {
      setSaving(false)
    }
  }

  const pickDefaultTheme = async (k: string) => {
    await saveSettings({ ...s, theme: k })
    await reload()
    showToast(`默认主题已设为 ${THEMES[k].label}`, 'good')
  }

  return (
    <>
      <div className="qm-sec"><i className="qm-bar" />构建输出</div>
      <div className="qm-card"><div className="qm-card-b">
        <label className="qm-lbl">AI 构建的落盘目录（留空 = 桌面 → Downloads → 用户目录自动探测）</label>
        <input
          className="qm-inp" value={dir}
          placeholder={s.exportDir || '（缺省：桌面）'}
          onChange={(e) => setDir(e.target.value)}
        />
        <div className="qm-sub" style={{ marginTop: 6 }}>
          当前：{s.exportDir || '桌面（自动探测）'}。目录必须为绝对路径；不存在时构建会自动创建。
          面板「构建并下载」始终走浏览器下载，不受此设置影响。
        </div>
        <div className="qm-row" style={{ marginTop: 10 }}>
          <button className="qm-btn" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存目录'}</button>
        </div>
      </div></div>

      <div className="qm-sec"><i className="qm-bar" />默认主题<span className="qm-hint">新大纲未指定 @theme 时使用</span></div>
      <div className="qm-card"><div className="qm-card-b">
        <div className="qm-row">
          {THEME_KEYS.map((k) => {
            const t = THEMES[k]
            return (
              <button
                key={k}
                className={`qm-theme-chip ${s.theme === k ? 'on' : ''}`}
                onClick={() => void pickDefaultTheme(k)}
              >
                <span className="qm-dot" style={{ background: `#${t.accent}`, boxShadow: `inset 0 0 0 2px #${t.bg}` }} />
                {t.label}{t.dark ? '' : ' · 浅'}
              </button>
            )
          })}
        </div>
      </div></div>

      <div className="qm-sec"><i className="qm-bar" />边界说明</div>
      <div className="qm-card"><div className="qm-card-b">
        <div className="qm-sub">
          · 产物为原生可编辑 PPTX（OOXML），PowerPoint / WPS 均可打开继续编辑；<br />
          · 零外网请求、零后台服务：内容只经你自己配置的 LLM 通道；<br />
          · 提示 AI 做前先 ppt_guide 读版式规则，容量超限会被要求拆页（不缩字硬塞，防崩版）。
        </div>
      </div></div>
    </>
  )
}
