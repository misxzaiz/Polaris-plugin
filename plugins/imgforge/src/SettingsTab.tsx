/**
 * 设置：输出目录 / 并发 / 单批上限 / 单文件上限 / 历史容量 → cap.kv imgforge.settings（服务 5s 内热读）。
 */
import { useEffect, useState } from 'react'
import type { core as CoreNS } from './model'
import { saveSettings } from './model'
import type { PanelCtx } from './Panel'

export default function SettingsTab({ ctx }: { ctx: PanelCtx }) {
  const { settings, reloadSettings, showToast, meta } = ctx
  const [draft, setDraft] = useState<CoreNS.ImgforgeSettings>(settings)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setDraft(settings) }, [settings])

  const set = (patch: Partial<CoreNS.ImgforgeSettings>) => setDraft((d) => ({ ...d, ...patch }))

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      await saveSettings(draft)
      await reloadSettings()
      showToast('已保存（服务 5 秒内热读生效）')
    } catch (e) {
      showToast(String((e as Error).message || e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="if-sec"><span className="if-bar" />通用设置</div>
      <div className="if-card"><div className="if-card-b">
        <span className="if-lbl">默认输出目录（空 = 输出到 输入目录\imgforge-out）</span>
        <input
          className="if-inp"
          value={draft.outDir}
          placeholder="如 C:\Users\me\Desktop\imgforge"
          onChange={(e) => set({ outDir: e.target.value })}
        />
        <div className="if-grid2">
          <div>
            <span className="if-lbl">并发数（1-8）</span>
            <input
              className="if-inp" type="number" min={1} max={8}
              value={draft.concurrency}
              onChange={(e) => set({ concurrency: Math.max(1, Math.min(8, Number(e.target.value) || 3)) })}
            />
          </div>
          <div>
            <span className="if-lbl">单批上限（张）</span>
            <input
              className="if-inp" type="number" min={1} max={2000}
              value={draft.maxBatch}
              onChange={(e) => set({ maxBatch: Math.max(1, Math.min(2000, Number(e.target.value) || 300)) })}
            />
          </div>
          <div>
            <span className="if-lbl">单文件上限（MB）</span>
            <input
              className="if-inp" type="number" min={1} max={1024}
              value={draft.maxFileMB}
              onChange={(e) => set({ maxFileMB: Math.max(1, Math.min(1024, Number(e.target.value) || 100)) })}
            />
          </div>
          <div>
            <span className="if-lbl">历史容量（条）</span>
            <input
              className="if-inp" type="number" min={10} max={1000}
              value={draft.historyCap}
              onChange={(e) => set({ historyCap: Math.max(10, Math.min(1000, Number(e.target.value) || 100)) })}
            />
          </div>
        </div>
        <button className="if-btn" style={{ marginTop: 10 }} onClick={save} disabled={busy}>保存</button>
      </div></div>

      <div className="if-sec"><span className="if-bar" />服务状态</div>
      <div className="if-card"><div className="if-card-b if-sub">
        {meta
          ? <>在线 · 端口 {meta.port} · 版本 v{meta.version || '?'} · 桥 {meta.bridge || 'ok'}{meta.lastTickAt ? ` · 心跳 ${String(meta.lastTickAt).slice(11, 19)}` : ''}</>
          : '离线 —— 在 设置 → 插件服务 中启动后，工作台可用。'}
        <br />引擎：sharp（libvips）本地处理，全程零外网请求；服务只绑定 127.0.0.1。
      </div></div>

      <div className="if-sec"><span className="if-bar" />边界（如实说明）</div>
      <div className="if-card"><div className="if-card-b if-sub">
        · 不做动图重编码：GIF 变换按首帧输出。<br />
        · 不做 OCR、不破解加密图片。<br />
        · AVIF 编码较慢（libvips effort=4），大批量建议 WebP。<br />
        · SVG 变换 = 渲染为位图；BMP 无编码器，请显式选 PNG/WebP。<br />
        · GPS 检测覆盖 JPEG/PNG/WebP/TIFF 的 EXIF；其余容器显示「未知」。
      </div></div>
    </div>
  )
}
