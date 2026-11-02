/**
 * Panel.tsx —— 堆栈还原台面板
 *
 * Tab 结构：还原 / 地图 / 服务
 * 数据面：127.0.0.1 直连服务（model.ts）。
 * 已知限制：Web(https) 部署模式下浏览器会拦 http://127.0.0.1 混合内容——
 * 桌面/手机 WebView 正常（与 bundle-lens/repo-lens 面板直连面同款边界）。
 * 隐私纪律：错误栈不落盘（kv 只存 recentDirs 目录路径）；拖拽 map 不上传任何远端。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { PLUGIN_ID, SERVICE_ID, SvcError, svc, invalidateMeta, readMeta } from './model'
import type { MapBrief, MetaInfo, ResolveResponse, ResolvedFrame, ScanMapsResponse, ValidateResponse } from './model'
import { restartService } from './host'
import { basename, Chip, Empty, ErrBox, fmtBytes, stateBadge, WarnBox } from './ui'

type Tab = 'resolve' | 'maps' | 'about'

/** 拖拽/选择的 .map 文件 → 内联 map 输入（浏览器 FileReader，不经服务） */
async function readMapFiles(files: FileList | File[]): Promise<Array<{ label: string; mapText: string; originPath?: string }>> {
  const out: Array<{ label: string; mapText: string; originPath?: string }> = []
  for (const f of Array.from(files)) {
    if (!/\.map$/i.test(f.name)) continue
    if (f.size > 60 * 1024 * 1024) { out.push({ label: `${f.name}（超 60MB 跳过）`, mapText: '' }); continue }
    const text = await f.text()
    out.push({ label: f.name, mapText: text, originPath: f.name })
  }
  return out
}

function FrameRow({ fr }: { fr: ResolvedFrame }): JSX.Element {
  const [open, setOpen] = useState(false)
  const b = stateBadge(fr.state)
  const loc = fr.url != null ? `${basename(fr.url)}${fr.line != null ? `:${fr.line}` : ''}${fr.col != null ? `:${fr.col}` : ''}` : fr.raw
  const hasDetail = fr.state === 'resolved' || Boolean(fr.reason)
  return (
    <div className={`sl-frame st-${fr.state}`}>
      <div className="sl-frame-head" onClick={() => hasDetail && setOpen(!open)} role={hasDetail ? 'button' : undefined}>
        <span className={`sl-badge ${b.cls}`}>{b.text}</span>
        {fr.fn ? <span className="sl-fn">{fr.fn}</span> : null}
        <span className="sl-loc">{loc}</span>
        {fr.state === 'resolved' ? (
          <span className="sl-arrow">→</span>
        ) : null}
        {fr.state === 'resolved' ? (
          <span className="sl-src">
            {basename(fr.source)}{fr.sourceLine != null ? `:${fr.sourceLine}` : ''}{fr.sourceCol != null ? `:${fr.sourceCol}` : ''}
            {fr.displayName && fr.displayName !== fr.fn ? <em className="sl-name">（原名 {fr.displayName}）</em> : null}
          </span>
        ) : null}
      </div>
      {open && fr.state === 'resolved' ? (
        <div className="sl-frame-detail">
          <div className="sl-frame-path">{fr.source}（map：{fr.mapLabel}{fr.codeFrameSource ? `，内容来自 ${fr.codeFrameSource}` : ''}）</div>
          {fr.codeFrame ? <pre className="sl-code">{fr.codeFrame}</pre> : null}
          {fr.codeFrameNote ? <div className="sl-note">{fr.codeFrameNote}</div> : null}
        </div>
      ) : null}
      {open && fr.state !== 'resolved' && fr.reason ? <div className="sl-frame-detail"><div className="sl-note">{fr.reason}</div></div> : null}
    </div>
  )
}

export function ResolveTab(): JSX.Element {
  const [stack, setStack] = useState('')
  const [mapsDir, setMapsDir] = useState('')
  const [inlineText, setInlineText] = useState('')
  const [showInline, setShowInline] = useState(false)
  const [fetchUrl, setFetchUrl] = useState('')
  const [dragFiles, setDragFiles] = useState<Array<{ label: string; mapText: string; originPath?: string }>>([])
  const [recentDirs, setRecentDirs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState<ResolveResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    svc.meta().then((m: MetaInfo) => {
      setRecentDirs((m.settings && m.settings.recentDirs) || [])
      if (!mapsDir && m.settings && m.settings.recentDirs && m.settings.recentDirs[0]) setMapsDir(m.settings.recentDirs[0])
    }).catch(() => { /* 服务未就绪时静默，resolve 时会再报 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doResolve = useCallback(async () => {
    setErr(''); setReport(null); setCopied(false)
    if (!stack.trim()) { setErr('请先粘贴错误栈'); return }
    const inlineMaps = [...dragFiles]
    if (inlineText.trim()) inlineMaps.push({ label: '粘贴的 map', mapText: inlineText })
    if (!mapsDir.trim() && !inlineMaps.length && !fetchUrl.trim()) {
      setErr('请至少给一种 map 来源：目录 / 拖拽 .map 文件 / 粘贴 map JSON / URL')
      return
    }
    setBusy(true)
    try {
      const resp = await svc.resolve({
        stack,
        mapsDir: mapsDir.trim() || undefined,
        inlineMaps: inlineMaps.length ? inlineMaps : undefined,
        fetchUrls: fetchUrl.trim() ? [fetchUrl.trim()] : undefined,
      })
      setReport(resp)
    } catch (e) {
      setErr(e instanceof SvcError ? e.message : String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [stack, mapsDir, inlineText, fetchUrl, dragFiles])

  const copyResult = useCallback(() => {
    if (!report) return
    const lines = report.frames.map((f, i) => {
      const b = stateBadge(f.state)
      if (f.state === 'resolved') return `${i + 1}. ${b.text} ${f.fn || ''} → ${f.source}:${f.sourceLine}:${f.sourceCol}`
      if (f.state === 'internal') return `${i + 1}. ${b.text} ${f.url || f.raw}（内部帧）`
      return `${i + 1}. ${b.text} ${f.raw}${f.reason ? ` —— ${f.reason}` : ''}`
    })
    const text = [`还原率 ${report.summary.rate}%（${report.summary.resolved}/${report.summary.eligible}）`, ...lines].join('\n')
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }, [report])

  return (
    <div className="sl-tabpane">
      <div className="sl-section">
        <div className="sl-label">minified 错误栈（浏览器控制台 / 日志原样粘贴）</div>
        <textarea
          className="sl-textarea"
          rows={7}
          placeholder={'TypeError: Cannot read properties of undefined\n    at boom (http://localhost:5173/assets/app.8f2a.js:1:88423)\n    at Object.<anonymous> (http://localhost:5173/assets/app.8f2a.js:1:90100)'}
          value={stack}
          onChange={(e) => setStack(e.target.value)}
        />
      </div>

      <div className="sl-section">
        <div className="sl-label">sourcemap 来源（任选其一或组合）</div>
        <div className="sl-row">
          <input
            className="sl-input grow"
            placeholder="构建产物目录，如 D:\\proj\\dist（扫描 *.map 与 sourceMappingURL 注释）"
            value={mapsDir}
            onChange={(e) => setMapsDir(e.target.value)}
          />
          {recentDirs.length ? (
            <select className="sl-select" value="" onChange={(e) => { if (e.target.value) setMapsDir(e.target.value) }}>
              <option value="">最近…</option>
              {recentDirs.map((d) => <option key={d} value={d}>{d.length > 42 ? `…${d.slice(-40)}` : d}</option>)}
            </select>
          ) : null}
        </div>
        <div
          className={`sl-dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault(); setDragOver(false)
            const maps = await readMapFiles(e.dataTransfer.files)
            if (maps.length) setDragFiles((prev) => [...prev, ...maps])
          }}
        >
          {dragFiles.length
            ? <span>{dragFiles.length} 个 .map 已就绪（{dragFiles.map((f) => basename(f.originPath)).join('、')}） <button className="sl-btn-link" onClick={() => setDragFiles([])}>清空</button></span>
            : <span>把 .map 文件拖到这里，或 <button className="sl-btn-link" onClick={() => fileRef.current?.click()}>选择文件</button>，或 <button className="sl-btn-link" onClick={() => setShowInline(!showInline)}>粘贴 map JSON</button></span>}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".map,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              if (e.target.files) {
                const maps = await readMapFiles(e.target.files)
                if (maps.length) setDragFiles((prev) => [...prev, ...maps])
              }
              e.target.value = ''
            }}
          />
        </div>
        {showInline ? (
          <textarea
            className="sl-textarea small"
            rows={3}
            placeholder='map JSON 全文（{"version":3,...}）'
            value={inlineText}
            onChange={(e) => setInlineText(e.target.value)}
          />
        ) : null}
        <div className="sl-row">
          <input
            className="sl-input grow"
            placeholder="或从 URL 抓 map（http/https，可选）"
            value={fetchUrl}
            onChange={(e) => setFetchUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="sl-actions">
        <button className="sl-btn primary" disabled={busy} onClick={doResolve}>{busy ? '还原中…' : '还原'}</button>
        {report ? <button className="sl-btn" onClick={copyResult}>{copied ? '已复制 ✓' : '复制结果'}</button> : null}
      </div>

      <ErrBox text={err} />

      {report ? (
        <div className="sl-report">
          <div className="sl-chips">
            <Chip label="还原率" value={`${report.summary.rate}%`} tone={report.summary.rate >= 80 ? 'ok' : report.summary.rate > 0 ? 'warn' : 'bad'} />
            <Chip label="帧" value={`${report.summary.resolved}/${report.summary.eligible}`} />
            <Chip label="内部帧" value={report.summary.internal} />
            <Chip label="格式" value={report.summary.format} />
            {report.summary.truncated ? <Chip label="注意" value="内容被截断" tone="warn" /> : null}
          </div>
          {report.summary.message ? <div className="sl-message">{report.summary.message}</div> : null}
          <WarnBox items={report.warnings} />
          <div className="sl-frames">
            {report.frames.map((f, i) => <FrameRow key={i} fr={f} />)}
          </div>
        </div>
      ) : !err ? (
        <Empty text="粘贴错误栈 + 给一个 map 来源，点「还原」" />
      ) : null}
    </div>
  )
}

export function MapsTab(): JSX.Element {
  const [dir, setDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [scan, setScan] = useState<ScanMapsResponse | null>(null)
  const [validatePath, setValidatePath] = useState('')
  const [validateRes, setValidateRes] = useState<ValidateResponse | null>(null)

  const doScan = useCallback(async () => {
    setErr(''); setScan(null)
    if (!dir.trim()) { setErr('请输入目录'); return }
    setBusy(true)
    try { setScan(await svc.scanMaps(dir.trim())) } catch (e) { setErr(e instanceof SvcError ? e.message : String((e as Error).message || e)) } finally { setBusy(false) }
  }, [dir])

  const doValidate = useCallback(async () => {
    setErr(''); setValidateRes(null)
    if (!validatePath.trim()) { setErr('请输入 .map 文件路径'); return }
    setBusy(true)
    try { setValidateRes(await svc.validate({ mapPath: validatePath.trim() })) } catch (e) { setErr(e instanceof SvcError ? e.message : String((e as Error).message || e)) } finally { setBusy(false) }
  }, [validatePath])

  return (
    <div className="sl-tabpane">
      <div className="sl-section">
        <div className="sl-label">扫描构建产物目录里的 sourcemap</div>
        <div className="sl-row">
          <input className="sl-input grow" placeholder="目录路径，如 D:\\proj\\dist" value={dir} onChange={(e) => setDir(e.target.value)} />
          <button className="sl-btn" disabled={busy} onClick={doScan}>扫描</button>
        </div>
      </div>
      <ErrBox text={err} />
      {scan ? (
        <div className="sl-report">
          <div className="sl-chips">
            <Chip label="目录" value={scan.dir} />
            <Chip label="扫过文件" value={scan.walked} />
            <Chip label="发现 map" value={scan.maps.filter((m) => !m.error).length} tone="ok" />
          </div>
          <WarnBox items={scan.warnings} />
          {scan.maps.length ? (
            <table className="sl-table">
              <thead><tr><th>map</th><th>file 字段</th><th>源数</th><th>内容</th><th>大小</th></tr></thead>
              <tbody>
                {scan.maps.map((m: MapBrief, i) => (
                  <tr key={i} className={m.error ? 'bad' : ''}>
                    <td>{basename(m.originPath) || m.fromJs || '(内联)'}{m.error ? ` ⚠ ${m.error}` : ''}</td>
                    <td>{m.file ? basename(m.file) : '-'}</td>
                    <td>{m.sources != null ? m.sources : '-'}</td>
                    <td>{m.hasContent ? '✓ sourcesContent' : '磁盘'}</td>
                    <td>{fmtBytes(m.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty text="该目录没扫到 .map（构建时需要开 sourcemap 输出）" />}
        </div>
      ) : null}

      <div className="sl-section">
        <div className="sl-label">体检单个 map（结构 / 映射段 / 覆盖）</div>
        <div className="sl-row">
          <input className="sl-input grow" placeholder=".map 文件绝对路径" value={validatePath} onChange={(e) => setValidatePath(e.target.value)} />
          <button className="sl-btn" disabled={busy} onClick={doValidate}>体检</button>
        </div>
      </div>
      {validateRes ? (
        validateRes.ok && validateRes.stats ? (
          <div className="sl-report">
            <div className="sl-chips">
              <Chip label="映射段" value={validateRes.stats.segCount} />
              <Chip label="生成行" value={validateRes.stats.genLines} />
              <Chip label="源" value={validateRes.stats.sources} />
              <Chip label="names" value={validateRes.stats.names} />
              <Chip label="sourcesContent" value={validateRes.stats.hasSourcesContent ? `${validateRes.stats.sourcesContentCount} 个` : '无'} tone={validateRes.stats.hasSourcesContent ? 'ok' : 'warn'} />
              {validateRes.stats.sections ? <Chip label="sections" value={validateRes.stats.sections} /> : null}
            </div>
            <WarnBox items={validateRes.warnings || []} />
          </div>
        ) : <ErrBox text={validateRes.error || 'map 不可用'} />
      ) : null}
    </div>
  )
}

export function AboutTab(): JSX.Element {
  const [meta, setMeta] = useState<MetaInfo | null>(null)
  const [err, setErr] = useState('')
  const [restarting, setRestarting] = useState(false)

  const refresh = useCallback(() => {
    setErr('')
    svc.meta().then(setMeta).catch((e) => setErr(e instanceof SvcError ? e.message : String((e as Error).message || e)))
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const restart = useCallback(async () => {
    setRestarting(true)
    try {
      await readMeta(true)
      await restartService(PLUGIN_ID, SERVICE_ID)
      invalidateMeta()
      setTimeout(refresh, 2500)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setRestarting(false)
    }
  }, [refresh])

  return (
    <div className="sl-tabpane">
      <div className="sl-section">
        <div className="sl-label">服务状态</div>
        {meta ? (
          <div className="sl-chips">
            <Chip label="版本" value={meta.version} />
            <Chip label="PID" value={meta.pid} />
            <Chip label="已运行" value={`${Math.floor(meta.uptime / 60000)} 分钟`} />
            <Chip label="缓存 map" value={meta.mapsCached} />
            <Chip label="宿主 kv 桥" value={meta.degraded ? '降级' : '正常'} tone={meta.degraded ? 'warn' : 'ok'} />
          </div>
        ) : <Empty text={err || '读取中…'} />}
        <div className="sl-actions">
          <button className="sl-btn" onClick={refresh}>刷新</button>
          <button className="sl-btn" disabled={restarting} onClick={restart}>{restarting ? '重启中…' : '重启服务'}</button>
        </div>
      </div>
      <div className="sl-section">
        <div className="sl-label">这是什么</div>
        <div className="sl-help">
          <p>把「app.8f2a.js:1:88423」还原成「src/api/user.ts:42:10」：粘贴 minified 错误栈 + 指定 sourcemap 来源，逐帧还原源码位置与代码帧。</p>
          <p>map 来源四种任选：构建产物目录（自动扫 *.map 与 sourceMappingURL 注释）/ 拖拽 .map 文件 / 粘贴 map JSON / 从 URL 抓取（60MB/15s 上限）。</p>
          <p><b>前提</b>：手上要有对应版本的 .map 文件（构建产物目录、CI 产物、或自己 dev server 的 /assets/*.js.map）。</p>
          <p><b>隐私</b>：全部本地计算；错误栈与 map 内容不落盘（kv 只记最近用过的目录路径）；无 map 的帧显式标注原因，绝不编造。</p>
          <p><b>已知边界</b>：栈格式覆盖 Chrome/Node/Safari/Firefox 主流格式；sourcesContent 缺失时代码帧依赖磁盘源文件（webpack:// 相对路径按 map 目录解析）；Web(https) 部署模式下浏览器会拦 127.0.0.1 混合内容（桌面/手机 WebView 正常）。</p>
          <p>AI 可经 MCP 六工具对话式还原：stack_resolve / stack_resolve_file / maps_scan / map_locate / map_source / map_validate。</p>
        </div>
      </div>
    </div>
  )
}

export default function Panel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('resolve')
  return (
    <div className="sl-root">
      <div className="sl-tabs">
        {([['resolve', '还原'], ['maps', '地图'], ['about', '服务']] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} className={`sl-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'resolve' ? <ResolveTab /> : null}
      {tab === 'maps' ? <MapsTab /> : null}
      {tab === 'about' ? <AboutTab /> : null}
    </div>
  )
}
