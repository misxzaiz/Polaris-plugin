/**
 * 设置：输出目录 / 上传上限 / 历史容量 / 默认格式与跨页合并。
 * 写 cap.kv pdf-tables.settings（仅面板写此键）；服务每个 op 强制热读，改完即生效。
 */
import { useEffect, useState } from 'react'
import type { PanelCtx } from './Panel'
import type { PdfTablesSettings } from './model'
import { core, probeDir, saveSettings } from './model'

export default function SettingsTab({ ctx }: { ctx: PanelCtx }) {
  const { meta, settings, showToast, reloadSettings } = ctx
  const [outDir, setOutDir] = useState(settings.outDir)
  const [maxUploadMB, setMaxUploadMB] = useState(String(settings.maxUploadMB))
  const [historyCap, setHistoryCap] = useState(String(settings.historyCap))
  const [format, setFormat] = useState<PdfTablesSettings['format']>(settings.format)
  const [mergePages, setMergePages] = useState(settings.mergePages)
  const [probing, setProbing] = useState(false)
  const [probeMsg, setProbeMsg] = useState('')

  useEffect(() => {
    setOutDir(settings.outDir)
    setMaxUploadMB(String(settings.maxUploadMB))
    setHistoryCap(String(settings.historyCap))
    setFormat(settings.format)
    setMergePages(settings.mergePages)
  }, [settings])

  const save = async () => {
    const mb = parseInt(maxUploadMB, 10)
    const cap = parseInt(historyCap, 10)
    if (!Number.isFinite(mb) || mb < 1) { showToast('上传上限需要 ≥1 MB', 'bad'); return }
    if (!Number.isFinite(cap) || cap < 10) { showToast('历史容量需要 ≥10 条', 'bad'); return }
    const next: PdfTablesSettings = {
      outDir: outDir.trim(),
      maxUploadMB: mb,
      historyCap: cap,
      format,
      mergePages,
    }
    try {
      await saveSettings(next)
      await reloadSettings()
      showToast('已保存（服务每 op 热读，立即生效）', 'good')
    } catch (e) {
      showToast('保存失败：' + String((e as Error).message || e), 'bad')
    }
  }

  const probe = async () => {
    if (!meta) { showToast('服务未在线，无法探测目录', 'bad'); return }
    setProbing(true); setProbeMsg('')
    try {
      const r = await probeDir(meta, outDir.trim())
      if (outDir.trim()) {
        const c = r.checked
        setProbeMsg(c && c.exists && c.isDir ? '目录有效 ✓' : '目录不存在或不是文件夹 ✗（保存后引擎会回退到桌面）')
      } else {
        setProbeMsg('当前留空 = 自动用桌面：' + (r.desktop[0] || r.home))
      }
    } catch (e) {
      setProbeMsg('探测失败：' + String((e as Error).message || e))
    } finally {
      setProbing(false)
    }
  }

  return (
    <div>
      <div className="pdt-card"><div className="pdt-card-b">
        <label className="pdt-lbl">输出目录（留空 = 桌面；支持 OneDrive 重定向探测）</label>
        <div className="pdt-row">
          <input className="pdt-inp" data-testid="outdir-input" value={outDir} placeholder="如 D:\表格输出"
            onChange={(e) => setOutDir(e.target.value)} />
          <button className="pdt-btn ghost sm" onClick={probe} disabled={probing || !meta} data-testid="probe-btn">{probing ? '探测中…' : '探测'}</button>
        </div>
        {probeMsg && <div className="pdt-sub" style={{ marginTop: 4 }} data-testid="probe-msg">{probeMsg}</div>}

        <label className="pdt-lbl">单文件上传上限（MB，1-1024）</label>
        <input className="pdt-inp" data-testid="maxmb-input" value={maxUploadMB}
          onChange={(e) => setMaxUploadMB(e.target.value.replace(/\D/g, ''))} />

        <label className="pdt-lbl">任务历史容量（条，10-1000，超出环形淘汰）</label>
        <input className="pdt-inp" data-testid="cap-input" value={historyCap}
          onChange={(e) => setHistoryCap(e.target.value.replace(/\D/g, ''))} />

        <label className="pdt-lbl">默认输出格式</label>
        <div className="pdt-chiprow" style={{ padding: '2px 0 6px' }} data-testid="fmt-row">
          {(['xlsx', 'csv', 'json', 'all'] as const).map((f) => (
            <button key={f} className={'pdt-chip' + (format === f ? ' on' : '')} onClick={() => setFormat(f)}>
              {{ xlsx: 'Excel', csv: 'CSV', json: 'JSON', all: '全部' }[f]}
            </button>
          ))}
        </div>

        <label className="pdt-row" style={{ marginTop: 6, fontSize: 12 }}>
          <input type="checkbox" checked={mergePages} onChange={(e) => setMergePages(e.target.checked)} data-testid="merge-default" />
          默认开启跨页续表合并
        </label>

        <div className="pdt-row" style={{ marginTop: 12 }}>
          <button className="pdt-btn" data-testid="save-btn" onClick={save}>保存</button>
          <span className="pdt-sub">键空间：cap.kv pdf-tables.settings（仅面板写）</span>
        </div>
      </div></div>

      <div className="pdt-card"><div className="pdt-card-b">
        <div className="pdt-sub">
          服务：{meta ? `在线 :${meta.port}（v${meta.version || '?'}，桥 ${meta.bridge || 'ok'}）` : '离线'}
          <br />安全底线：只绑 127.0.0.1 + token · 零外网请求 · 输入永不修改 · 输出永不覆盖
          <br />能力边界：扫描件/图片型 PDF 不做 OCR；加密 PDF 不破解；检测不到对齐列结构时会如实说明。
        </div>
      </div></div>
    </div>
  )
}
