/**
 * 设置：输出目录（服务端落盘位置）、单次上传上限。设置仅面板写（单写者）。
 */
import { useEffect, useState } from 'react'
import type { PanelCtx } from './Panel'
import { core, probeDir, saveSettings } from './model'

export default function SettingsTab({ ctx }: { ctx: PanelCtx }) {
  const { settings, reloadSettings, meta, showToast } = ctx
  const [outDir, setOutDir] = useState(settings.outDir)
  const [maxUploadMB, setMaxUploadMB] = useState(String(settings.maxUploadMB))
  const [saving, setSaving] = useState(false)
  const [probe, setProbe] = useState<string>('')

  useEffect(() => {
    setOutDir(settings.outDir)
    setMaxUploadMB(String(settings.maxUploadMB))
  }, [settings])

  const save = async () => {
    if (saving) return
    const mb = parseInt(maxUploadMB, 10)
    if (!Number.isFinite(mb) || mb < 1) {
      showToast('上传上限需是不小于 1 的整数 MB', 'bad')
      return
    }
    setSaving(true)
    try {
      await saveSettings(core.normalizeSettings({ outDir, maxUploadMB: mb }))
      await reloadSettings()
      showToast('设置已保存（服务按次热读，立即生效）', 'good')
    } catch (e) {
      showToast('保存失败：' + String((e as Error).message || e), 'bad')
    } finally {
      setSaving(false)
    }
  }

  const doProbe = async () => {
    if (!meta) {
      setProbe('服务未在线，无法探测目录。可以直接手输绝对路径保存（保存时会校验格式）。')
      return
    }
    try {
      const r = await probeDir(meta, outDir)
      const lines = [
        '桌面候选：' + (r.desktop && r.desktop.length ? r.desktop.join(' 、 ') : '未找到（将回退用户目录）'),
        r.checked ? (r.checked.exists
          ? (r.checked.isDir ? '✓ 目录存在可用' : '✗ 路径存在但不是目录')
          : '✗ 目录不存在（将回退：桌面 → 用户目录）') : '',
      ].filter(Boolean)
      setProbe(lines.join('\n'))
    } catch (e) {
      setProbe('探测失败：' + String((e as Error).message || e))
    }
  }

  return (
    <div>
      <div className="zf-sec"><span className="zf-bar" />输出与安全</div>
      <div className="zf-card"><div className="zf-card-b">
        <label className="zf-lbl">输出目录（留空 = 优先桌面，找不到则回退用户目录）</label>
        <input className="zf-inp" data-testid="outdir-input" value={outDir} placeholder="如 C:\Users\me\Desktop" onChange={(e) => setOutDir(e.target.value)} />
        <div className="zf-row" style={{ marginTop: 8 }}>
          <button className="zf-btn ghost sm" onClick={doProbe}>探测目录</button>
          <span className="zf-sub">面板与 AI 共用这一套输出策略；输出永不覆盖（同名自动 -2/-3）</span>
        </div>
        {probe && <div className="zf-pre" data-testid="probe-box">{probe}</div>}

        <label className="zf-lbl">单次上传上限（MB，1-1024）</label>
        <input className="zf-inp" data-testid="maxmb-input" value={maxUploadMB} onChange={(e) => setMaxUploadMB(e.target.value.replace(/\D/g, ''))} />
        <div className="zf-sub" style={{ marginTop: 6 }}>
          安全面：服务只监听 127.0.0.1 并校验 token；输入文件永不修改/删除；加密 PDF 直接拒绝（不破解）。
          明确不做：压缩（纯本地方案无法真实重压图片，宁缺毋滥）、OCR、密码去除。
        </div>
        <div className="zf-row" style={{ marginTop: 10 }}>
          <button className="zf-btn" data-testid="save-btn" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存设置'}</button>
        </div>
      </div></div>

      <div className="zf-sec"><span className="zf-bar" />服务状态</div>
      <div className="zf-card"><div className="zf-card-b">
        {meta ? (
          <div className="zf-sub" data-testid="meta-box">
            在线 · 端口 {meta.port} · 版本 {meta.version || '?'} · 心跳 {String(meta.lastTickAt || '').replace('T', ' ').slice(0, 19) || '—'}
            {meta.bridge === 'degraded' ? ' · 桥降级（历史登记暂不可用，文件操作正常）' : ''}
          </div>
        ) : (
          <div className="zf-sub" data-testid="meta-box">未在线：请在宿主「设置 → 插件 → 插件服务」启动 zhifang-service。</div>
        )}
      </div></div>
    </div>
  )
}
