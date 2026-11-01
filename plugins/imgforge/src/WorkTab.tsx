/**
 * 工作台：目录扫描 → 选择 → 管道配置 → 批量变换 → 进度/报告。
 * 字节面走 127.0.0.1 自家服务；设置/历史走 cap.kv（PanelCtx 注入）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImgforgeMeta, ScanResult, JobSnapshot, ScannedFile } from './model'
import { scanDir, startProcess, fetchJob, probeDir, core } from './model'
import type { PanelCtx } from './Panel'

const RENDER_CAP = 200

type Phase = 'idle' | 'scanning' | 'scanned' | 'running' | 'report'

export default function WorkTab({ ctx, onSendToChat }: { ctx: PanelCtx, onSendToChat?: (msg: string) => void | Promise<void> }) {
  const { meta, settings, showToast } = ctx
  const [dir, setDir] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [job, setJob] = useState<JobSnapshot | null>(null)

  // 管道参数（默认：保持格式、质量 82、剥 EXIF）
  const [fmt, setFmt] = useState<'keep' | 'webp' | 'jpeg' | 'png' | 'avif' | 'tiff'>('keep')
  const [quality, setQuality] = useState(82)
  const [maxW, setMaxW] = useState('')
  const [maxH, setMaxH] = useState('')
  const [targetKB, setTargetKB] = useState('')
  const [strip, setStrip] = useState(true)
  const pollRef = useRef<number | null>(null)

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current) }, [])

  const doProbe = useCallback(async () => {
    if (!meta) return
    try {
      const r = await probeDir(meta, dir)
      const fallback = r.desktop[0] || r.home
      setDir(fallback)
      showToast('已填入：' + fallback)
    } catch (e) {
      showToast(String((e as Error).message || e), 'bad')
    }
  }, [meta, dir, showToast])

  const doScan = useCallback(async () => {
    if (!meta) { showToast('服务未在线', 'bad'); return }
    if (!dir.trim()) { showToast('请先填写目录', 'bad'); return }
    setPhase('scanning')
    setError('')
    try {
      const r = await scanDir(meta, dir.trim(), recursive)
      if (!r.files.length) {
        setScan(null)
        setError(`目录里没有找到图片（支持 jpg/png/webp/gif/bmp/tiff/avif/svg${recursive ? '，含子目录' : ''}）`)
        setPhase('idle')
        return
      }
      setScan(r)
      setSelected(new Set(r.files.map((f) => f.path)))
      setPhase('scanned')
    } catch (e) {
      setScan(null)
      setError(String((e as Error).message || e))
      setPhase('idle')
    }
  }, [meta, dir, recursive, showToast])

  const start = useCallback(async () => {
    if (!meta || !scan) return
    const paths = scan.files.filter((f) => selected.has(f.path)).map((f) => f.path)
    if (!paths.length) { showToast('请至少选择一张图片', 'bad'); return }
    if (paths.length > settings.maxBatch) {
      showToast(`已选 ${paths.length} 张，超过单批上限 ${settings.maxBatch}（可在设置里调大）`, 'bad')
      return
    }
    const pipeline: Record<string, unknown> = {
      format: fmt,
      quality,
      stripMetadata: strip,
    }
    if (maxW.trim() && Number(maxW) > 0) pipeline.maxWidth = Math.round(Number(maxW))
    if (maxH.trim() && Number(maxH) > 0) pipeline.maxHeight = Math.round(Number(maxH))
    if (targetKB.trim() && Number(targetKB) > 0) pipeline.targetKB = Math.round(Number(targetKB))
    setError('')
    try {
      const started = await startProcess(meta, { paths, pipeline })
      setPhase('running')
      setJob({ id: started.id, state: 'running', done: 0, total: started.total, pipelineLabel: started.pipelineLabel, outDir: started.outDir, startedAt: new Date().toISOString(), summary: null, results: null })
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const snap = await fetchJob(meta, started.id)
          if (!snap) return
          setJob(snap)
          if (snap.state === 'done' || snap.state === 'error') {
            if (pollRef.current) window.clearInterval(pollRef.current)
            pollRef.current = null
            setPhase('report')
            ctx.reloadHistory()
          }
        } catch (_) { /* 单次轮询失败：下个周期再试 */ }
      }, 700)
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }, [meta, scan, selected, settings.maxBatch, fmt, quality, strip, maxW, maxH, targetKB, ctx, showToast])

  const toggle = (p: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const selCount = selected.size
  const selBytes = scan ? scan.files.filter((f) => selected.has(f.path)).reduce((s, f) => s + f.size, 0) : 0
  const shown = scan ? scan.files.slice(0, RENDER_CAP) : []
  const summary = scan?.summary

  return (
    <div>
      {/* 目录输入 */}
      <div className="if-sec"><span className="if-bar" />第一步 · 选目录</div>
      <div className="if-card"><div className="if-card-b">
        <div className="if-row">
          <input
            className="if-inp grow"
            value={dir}
            placeholder="图片目录绝对路径，如 C:\Users\me\Pictures"
            onChange={(e) => setDir(e.target.value)}
            disabled={phase === 'running'}
          />
          <button className="if-btn" onClick={doScan} disabled={phase === 'scanning' || phase === 'running'}>
            {phase === 'scanning' ? '扫描中…' : '扫描'}
          </button>
        </div>
        <div className="if-row" style={{ marginTop: 6 }}>
          <label className="if-check">
            <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} disabled={phase === 'running'} />
            含子目录
          </label>
          {!dir && meta && (
            <button className="if-btn ghost sm" onClick={doProbe}>填入桌面</button>
          )}
        </div>
      </div></div>

      {error && <div className="if-alert bad">{error}</div>}

      {summary && (
        <>
          {/* 扫描概览 */}
          <div className="if-sec"><span className="if-bar" />第二步 · 确认与选择</div>
          <div className="if-okline">
            {summary.count} 张 · 共 {coreFmt(summary.totalSize)} · {Object.entries(summary.byFormat).map(([k, n]) => k + '×' + n).join('，')}
            {summary.gpsCount > 0 && <span className="if-gps"> · {summary.gpsCount} 张含 GPS 定位</span>}
            {scan?.truncated && ' · 已截断（只显示前 ' + summary.count + ' 张）'}
          </div>
          <div className="if-chiprow">
            <button className="if-chip" onClick={() => setSelected(new Set(scan!.files.map((f) => f.path)))}>全选</button>
            <button className="if-chip" onClick={() => setSelected(new Set())}>全不选</button>
            <button className="if-chip" onClick={() => setSelected(new Set(scan!.files.filter((f: ScannedFile) => f.hasGps === true).map((f) => f.path)))}>只选含 GPS</button>
            <span className="if-hint">已选 {selCount} 张 · {coreFmt(selBytes)}</span>
          </div>
          <div className="if-list">
            {shown.map((f) => (
              <label key={f.path} className="if-file">
                <input type="checkbox" checked={selected.has(f.path)} onChange={() => toggle(f.path)} disabled={phase === 'running'} />
                <span className="if-file-name">{f.name}</span>
                <span className="if-file-meta">
                  {f.width ? `${f.width}×${f.height} · ` : ''}{coreFmt(f.size)}{f.hasGps === true ? ' · GPS' : ''}
                </span>
              </label>
            ))}
            {scan && scan.files.length > RENDER_CAP && (
              <div className="if-empty">仅渲染前 {RENDER_CAP} 行，其余 {scan.files.length - RENDER_CAP} 张已按全选处理</div>
            )}
          </div>

          {/* 管道 */}
          <div className="if-sec"><span className="if-bar" />第三步 · 变换管道</div>
          <div className="if-card"><div className="if-card-b">
            <span className="if-lbl">输出格式</span>
            <div className="if-chiprow" style={{ padding: 0 }}>
              {([['keep', '保持原格式'], ['webp', 'WebP'], ['jpeg', 'JPEG'], ['png', 'PNG'], ['avif', 'AVIF（慢）'], ['tiff', 'TIFF']] as const).map(([k, label]) => (
                <button key={k} className={'if-chip' + (fmt === k ? ' on' : '')} onClick={() => setFmt(k)}>{label}</button>
              ))}
            </div>
            <span className="if-lbl">质量 {quality}{fmt === 'png' ? '（PNG 走调色板量化）' : ''}</span>
            <input type="range" min={30} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ width: '100%' }} disabled={phase === 'running'} />
            <div className="if-grid2">
              <div>
                <span className="if-lbl">最大宽度 px（可空）</span>
                <input className="if-inp" value={maxW} placeholder="如 1920" onChange={(e) => setMaxW(e.target.value.replace(/[^0-9]/g, ''))} disabled={phase === 'running'} />
              </div>
              <div>
                <span className="if-lbl">最大高度 px（可空）</span>
                <input className="if-inp" value={maxH} placeholder="如 1080" onChange={(e) => setMaxH(e.target.value.replace(/[^0-9]/g, ''))} disabled={phase === 'running'} />
              </div>
            </div>
            <span className="if-lbl">目标体积 KB（可空；自动逼近，达不到会降尺寸并注明）</span>
            <input className="if-inp" value={targetKB} placeholder="如 200" onChange={(e) => setTargetKB(e.target.value.replace(/[^0-9]/g, ''))} disabled={phase === 'running'} />
            <label className="if-check" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} disabled={phase === 'running'} />
              剥离 EXIF/GPS 隐私元数据（推荐；勾选取消则保留——外发前请自行确认）
            </label>
            <div className="if-sub" style={{ marginTop: 8 }}>
              输出到：{(settings.outDir || (scan ? scan.dir + '\\imgforge-out' : '<输入目录>\\imgforge-out'))}（输出永不覆盖，重名自动 -2/-3；输入文件绝不修改）
            </div>
            <button className="if-btn" style={{ marginTop: 10, width: '100%' }} onClick={start} disabled={phase === 'running' || !selCount}>
              开始变换 {selCount} 张
            </button>
          </div></div>
        </>
      )}

      {/* 进度/报告 */}
      {job && (phase === 'running' || phase === 'report') && (
        <>
          <div className="if-sec"><span className="if-bar" />{phase === 'running' ? '变换中' : '结果报告'}</div>
          {phase === 'running' && (
            <div className="if-card"><div className="if-card-b">
              <div className="if-prog-track"><div className="if-prog-fill" style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }} /></div>
              <div className="if-sub" style={{ marginTop: 6 }}>{job.done}/{job.total} · {job.pipelineLabel}</div>
            </div></div>
          )}
          {phase === 'report' && job.state === 'done' && job.summary && (
            <div className="if-okline">
              {job.summary.ok}/{job.summary.total} 成功{job.summary.fail ? `，${job.summary.fail} 失败` : ''} · {coreFmt(job.summary.inBytes)} → {coreFmt(job.summary.outBytes)}
              （{job.summary.savedBytes >= 0 ? '节省 ' + coreFmt(job.summary.savedBytes) : '增大 ' + coreFmt(-job.summary.savedBytes)}
              {job.summary.inBytes > 0 ? `，${Math.round((job.summary.savedBytes / job.summary.inBytes) * 100)}%` : ''}）· 输出 {job.outDir}
            </div>
          )}
          {phase === 'report' && job.state === 'error' && (
            <div className="if-alert bad">任务失败：{job.error}</div>
          )}
          {phase === 'report' && job.results && (
            <>
              {job.results.filter((r) => !r.ok).slice(0, 10).map((r) => (
                <div key={r.path} className="if-alert bad">{r.name}：{r.error}</div>
              ))}
              <div className="if-chiprow">
                {onSendToChat && job.summary && (
                  <button
                    className="if-btn ghost sm"
                    onClick={() => onSendToChat(`图片工坊报告：${job.summary!.ok}/${job.summary!.total} 成功，${coreFmt(job.summary!.inBytes)} → ${coreFmt(job.summary!.outBytes)}（节省 ${coreFmt(Math.max(0, job.summary!.savedBytes))}），输出目录 ${job.outDir}，管道「${job.pipelineLabel}」`)}
                  >
                    发送报告到聊天
                  </button>
                )}
                <button className="if-btn ghost sm" onClick={() => { setPhase('scanned'); setJob(null) }}>返回调整管道</button>
                <button className="if-btn ghost sm" onClick={() => { setPhase('idle'); setScan(null); setJob(null); setDir('') }}>新任务</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function coreFmt(n: number): string {
  return core.formatBytes(n)
}
