/**
 * 识别 Tab：输入（路径多行 + 语言 chips + PSM + 导出目录）→ 实时进度 → 报告卡
 * （汇总 + 逐文件：状态/字数/导出路径/文本头预览 + 复制全文头）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  opAction, opStart, getLive, parsePathsText, fmtDuration, baseName,
  core, type ServiceMeta, type BenchSettings, type OcrReport, type LiveSnapshot, type ScanForm, type FileResult,
} from './model'

const PSM_OPTIONS = core.PSM_OPTIONS

interface Props {
  meta: ServiceMeta | null
  settings: BenchSettings | null
  lastReport: OcrReport | null
  onRefresh: () => Promise<void>
}

export default function WorkTab({ meta, settings, lastReport, onRefresh }: Props) {
  const [form, setForm] = useState<ScanForm>({
    pathsText: '',
    paths: [],
    langs: settings?.langs || ['chi_sim', 'eng'],
    psm: settings?.psm ?? 3,
    outDir: settings?.outDir || '',
  })
  const [live, setLive] = useState<LiveSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState('')
  const aliveRef = useRef(true)

  useEffect(() => () => { aliveRef.current = false }, [])

  // 设置到达后初始化一次表单（首次渲染 settings 尚未加载）
  useEffect(() => {
    if (settings) {
      setForm((f) => ({
        ...f,
        langs: f.langs.length ? f.langs : (settings.langs || ['chi_sim', 'eng']),
        psm: settings.psm || f.psm,
        outDir: f.outDir || settings.outDir || '',
      }))
    }
  }, [settings])

  // 实时进度轮询（800ms，仅在运行中拉）
  useEffect(() => {
    let timer: number | undefined
    const tick = async () => {
      if (!meta || !aliveRef.current) return
      try {
        const r = await getLive(meta)
        if (!aliveRef.current) return
        setLive(r.live)
        setBusy(!!r.running)
      } catch { /* 服务重启窗口：保旧值 */ }
    }
    tick()
    timer = window.setInterval(tick, 800)
    return () => { if (timer) window.clearInterval(timer) }
  }, [meta])

  const start = useCallback(async () => {
    if (!meta) return
    setErr(''); setNotice('')
    const paths = parsePathsText(form.pathsText)
    if (!paths.length) { setErr('先填至少一个文件或目录的绝对路径（每行一个）'); return }
    setBusy(true)
    try {
      const r = await opStart(meta, { ...form, paths })
      if (!r.ok) { setErr(r.error || '发起失败'); setBusy(false); return }
      // 记住本次设置（服务端 normalize 后回写 settings）
      opAction(meta, 'settings_set', { langs: form.langs, psm: form.psm, outDir: form.outDir }).catch(() => {})
      setNotice(`任务已受理（runId=${r.runId}），实时进度见下方。`)
      await onRefresh()
    } catch (e) {
      setErr(String((e as Error).message || e))
      setBusy(false)
    }
  }, [meta, form, onRefresh])

  const stop = useCallback(async () => {
    if (!meta) return
    try {
      const r = await opAction(meta, 'stop')
      setNotice(r.ok ? '已请求中止。' : (r.error || '中止失败'))
    } catch (e) { setErr(String((e as Error).message || e)) }
  }, [meta])

  const copy = useCallback(async (f: FileResult) => {
    try {
      await navigator.clipboard.writeText(f.textHead)
      setCopied(f.path)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* 剪贴板不可用 */ }
  }, [])

  const running = !!live && busy
  const report = lastReport

  return (
    <div>
      <div className="ob-sec"><span className="ob-bar" />发起识别
        <span className="ob-hint">全本地 Tesseract · 图像数据永不外发</span>
      </div>
      <div className="ob-card"><div className="ob-card-b">
        <div className="ob-fmgrid">
          <label>输入路径</label>
          <textarea
            className="ob-inp" rows={4} disabled={running}
            placeholder={'每行一个：文件或目录的绝对路径\n支持 png/jpg/jpeg/bmp/webp/tiff/pnm/pdf；目录会递归收集'}
            value={form.pathsText}
            onChange={(e) => setForm({ ...form, pathsText: e.target.value })}
          />
          <label>语言</label>
          <div className="ob-chiprow">
            {core.LANGS.filter((l) => l.builtin).map((l) => (
              <button
                key={l.code}
                className={`ob-chip ${form.langs.includes(l.code) ? 'on' : ''}`}
                disabled={running}
                onClick={() => setForm((f) => ({
                  ...f,
                  langs: f.langs.includes(l.code) ? f.langs.filter((x) => x !== l.code) : [...f.langs, l.code],
                }))}
              >{l.name}</button>
            ))}
            <span className="ob-sub">更多语言在「语言包」下载</span>
          </div>
          <label>版面切分</label>
          <select className="ob-sel" disabled={running} value={form.psm} onChange={(e) => setForm({ ...form, psm: Number(e.target.value) })}>
            {PSM_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.value} · {p.label}</option>)}
          </select>
          <label>导出 txt</label>
          <input
            className="ob-inp" disabled={running} placeholder="可选：输出目录（须在输入目录内），每文件落同名 .txt"
            value={form.outDir} onChange={(e) => setForm({ ...form, outDir: e.target.value })}
          />
        </div>
        <div className="ob-fmrow">
          <button className="ob-btn" disabled={running || !meta} onClick={start}>开始识别</button>
          {running && <button className="ob-btn danger" onClick={stop}>停止</button>}
          <span className="ob-sub">护栏：单任务 ≤{core.LIMITS.maxFilesPerJob.max} 文件 · PDF ≤{core.LIMITS.maxPdfPages.max} 页 · 单图 ≤50MB · 同时只跑一个任务</span>
        </div>
        {err && <div className="ob-err">✗ {err}</div>}
        {notice && !err && <div className="ob-sub ob-ok">{notice}</div>}
      </div></div>

      {running && live && (
        <>
          <div className="ob-sec"><span className="ob-bar" />实时进度</div>
          <div className="ob-card"><div className="ob-card-b">
            <div className="ob-prog"><i style={{ width: `${live.total ? Math.round((live.done / live.total) * 100) : 0}%` }} /></div>
            <dl className="ob-kv">
              <dt>进度</dt><dd>{live.done}/{live.total} 个文件（✓{live.filesOk} ✗{live.filesFail}）· {live.elapsedS}s</dd>
              <dt>当前</dt><dd className="ob-mono">{live.current || '（页间切换）'}</dd>
              <dt>已提取</dt><dd>{live.charsSoFar} 字 · 语言 {live.langs.join('+')}</dd>
            </dl>
          </div></div>
        </>
      )}

      {report && !running && (
        <>
          <div className="ob-sec"><span className="ob-bar" />最近报告
            <span className="ob-hint">runId={report.runId} · {new Date(report.at).toLocaleString('zh-CN')}</span>
          </div>
          <div className="ob-card"><div className="ob-card-b">
            <div className="ob-sum">
              <div><b>{report.summary.okFiles}<span className="ob-muted" style={{ fontSize: 11 }}>/{report.summary.files}</span></b><small>文件成功</small></div>
              <div><b>{report.summary.totalChars}</b><small>提取字符</small></div>
              <div><b>{report.summary.ocrPages}</b><small>OCR 页</small></div>
              <div><b>{report.summary.nativePages}</b><small>文字层直读页</small></div>
              <div><b>{report.summary.meanConfidence !== null ? report.summary.meanConfidence : '—'}</b><small>平均置信度</small></div>
              <div><b>{fmtDuration(report.summary.durationMs)}</b><small>总用时</small></div>
            </div>
            <div className="ob-sub">{report.summary.oneLine}</div>
            {(report.summary.notes || []).map((n, i) => <div key={i} className="ob-warn">· {n}</div>)}
          </div></div>
          <div className="ob-card">
            {report.files.map((f, i) => (
              <div key={i} className="ob-row">
                <div className="ob-row-h">
                  <span className={`ob-badge ${f.ok ? 'good' : 'bad'}`}>{f.ok ? '✓' : '✗'} {f.type === 'pdf' ? `PDF·${f.pages.length}页` : '图片'}</span>
                  <b className="ob-mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{baseName(f.path)}</b>
                  {f.ok && <span className="ob-tag">{f.chars} 字 · {fmtDuration(f.durationMs)}</span>}
                  {f.ok && f.outFile && <span className="ob-tag">已导出 {baseName(f.outFile)}</span>}
                  {f.ok && f.textHead && (
                    <button className="ob-btn ghost sm" onClick={() => copy(f)}>{copied === f.path ? '已复制' : '复制文本'}</button>
                  )}
                </div>
                {f.ok && f.pages.length > 1 && (
                  <div className="ob-sub" style={{ marginTop: 4 }}>
                    {f.pages.map((p) => (
                      <span key={p.page} style={{ marginRight: 8 }}>
                        p{p.page}:{p.error ? <span className="ob-bad">✗</span> : (p.mode === 'native' ? '直读' : (p.confidence !== null ? `${p.confidence}` : '?'))}
                      </span>
                    ))}
                  </div>
                )}
                {!f.ok && <div className="ob-err">✗ {f.error}</div>}
                {f.ok && f.textHead && (
                  <div className="ob-txt" style={{ marginTop: 6 }}>
                    {f.textHead.length > 2000 ? f.textHead.slice(0, 2000) + '\n…（报告内保留前 16KB，复制按钮取同一段）' : f.textHead}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!report && !running && (
        <div className="ob-empty">
          还没有识别报告。填入路径点「开始识别」，或对 AI 说<br />
          <span className="ob-mono">「用 ocr_scan 识别 D:\docs\扫描件 文件夹」</span>
        </div>
      )}
    </div>
  )
}
