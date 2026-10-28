/**
 * 工作台：拖拽/选择文件 → 选操作 → 参数（core 同源校验）→ 127.0.0.1 直连执行 → 结果卡。
 * 手机端（Web/Remote）没有本地文件可选：如实提示「上传需在桌面端操作」。
 */
import { useMemo, useRef, useState } from 'react'
import type { PanelCtx } from './Panel'
import type { OpResult } from './model'
import { core, fileToB64, runOpRequest } from './model'

type Op = 'merge' | 'extract' | 'split' | 'rotate' | 'delete' | 'text' | 'info' | 'images2pdf'

const OP_META: Record<Op, { label: string, hint: string, needs: 'pdf2' | 'pdf1' | 'img' }> = {
  merge: { label: '合并', hint: '按下方顺序合并为一个 PDF', needs: 'pdf2' },
  extract: { label: '抽页 / 重排', hint: '按页码抽出成新文件；写 3,1,2 可重排', needs: 'pdf1' },
  split: { label: '拆分', hint: '每 N 页拆成一份', needs: 'pdf1' },
  rotate: { label: '旋转', hint: '把选中页累计旋转指定角度', needs: 'pdf1' },
  delete: { label: '删页', hint: '删除选中页后另存新文件', needs: 'pdf1' },
  text: { label: '提取文字', hint: '抽取文字层（扫描件无文字层会明示）', needs: 'pdf1' },
  info: { label: '信息', hint: '页数 / 尺寸 / 元数据，只读不产生文件', needs: 'pdf1' },
  images2pdf: { label: '图片转 PDF', hint: 'JPG/PNG 按顺序合成一个 PDF，每图一页', needs: 'img' },
}

function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name)
}
function isImgName(name: string): boolean {
  return /\.(jpg|jpeg|png)$/i.test(name)
}

/** 客户端预校验：与引擎同源的 parsePageSpec（页数上界放宽到 10 万，真实越界由服务按实际页数报） */
function specError(spec: string, mode: 'ordered' | 'set'): string | null {
  try {
    core.parsePageSpec(spec, 100000, { mode })
    return null
  } catch (e) {
    return String((e as Error).message || e)
  }
}

export default function WorkTab({ ctx }: { ctx: PanelCtx }) {
  const { meta, settings, showToast, reloadHistory } = ctx
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [over, setOver] = useState(false)
  const [op, setOp] = useState<Op | null>(null)
  const [pages, setPages] = useState('')
  const [every, setEvery] = useState('1')
  const [angle, setAngle] = useState<number>(90)
  const [margin, setMargin] = useState('0')
  const [writeTxt, setWriteTxt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<OpResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const pdfs = useMemo(() => files.filter((f) => isPdfName(f.name)), [files])
  const imgs = useMemo(() => files.filter((f) => isImgName(f.name) && !isPdfName(f.name)), [files])
  const invalid = useMemo(() => files.filter((f) => !isPdfName(f.name) && !isImgName(f.name)), [files])

  const available: Op[] = useMemo(() => {
    if (pdfs.length >= 2 && imgs.length === 0) return ['merge']
    if (pdfs.length === 1 && imgs.length === 0) return ['extract', 'split', 'rotate', 'delete', 'text', 'info']
    if (imgs.length >= 1 && pdfs.length === 0) return ['images2pdf']
    return []
  }, [pdfs.length, imgs.length])

  const mixedHint = pdfs.length >= 1 && imgs.length >= 1
    ? 'PDF 与图片混选时无法确定处理方式：请分开操作（图片转 PDF 也可以先转再合并）'
    : ''

  const activeSpecMode: 'ordered' | 'set' = op === 'extract' ? 'ordered' : 'set'
  const specMsg = (op === 'extract' || op === 'rotate' || op === 'delete') && pages.trim()
    ? specError(pages, activeSpecMode)
    : null
  const specRequiredMissing = op === 'extract' && !pages.trim()

  const addFiles = (list: FileList | null) => {
    if (!list || !list.length) return
    const next = Array.from(list)
    setFiles((prev) => {
      const merged = [...prev]
      for (const f of next) {
        if (!merged.some((p) => p.name === f.name && p.size === f.size)) merged.push(f)
      }
      return merged
    })
    setResult(null)
    setErrorMsg('')
  }

  const removeAt = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))
  const move = (idx: number, delta: number) => setFiles((prev) => {
    const next = prev.slice()
    const j = idx + delta
    if (j < 0 || j >= next.length) return prev
    const t = next[idx]; next[idx] = next[j]; next[j] = t
    return next
  })

  const pickOp = (o: Op) => { setOp(o); setResult(null); setErrorMsg('') }

  const run = async () => {
    if (!meta) { showToast('服务未在线：请先在宿主设置里启动 zhifang 服务', 'bad'); return }
    if (!op || !available.includes(op)) { showToast('请先选择一个可用操作', 'bad'); return }
    if (specMsg) { showToast('页码规格有误：' + specMsg, 'bad'); return }
    if (specRequiredMissing) { showToast('抽页需要填写页码规格（如 1-3,5）', 'bad'); return }
    const effEvery = parseInt(every, 10)
    if (op === 'split' && (!Number.isInteger(effEvery) || effEvery < 1)) { showToast('拆分间隔需要是正整数', 'bad'); return }
    const m = parseFloat(margin)
    if (op === 'images2pdf' && (!Number.isFinite(m) || m < 0 || m > 200)) { showToast('页边距需在 0-200 之间', 'bad'); return }

    setBusy(true); setErrorMsg(''); setResult(null)
    try {
      const payload = []
      const order = op === 'images2pdf' ? imgs : files
      for (const f of order) payload.push({ name: f.name, b64: await fileToB64(f) })
      const params: Record<string, unknown> = {}
      if (op === 'extract') params.pages = pages.trim()
      if (op === 'rotate' || op === 'delete') params.pages = pages.trim() || 'all'
      if (op === 'rotate') params.angle = angle
      if (op === 'split') params.every = effEvery
      if (op === 'images2pdf') params.margin = m
      if (op === 'text') { params.pages = pages.trim() || 'all'; params.writeTxt = writeTxt }
      const res = await runOpRequest(meta, { op, files: payload, params, source: 'panel' })
      if (!res.ok) {
        setErrorMsg(String(res.error || '处理失败'))
        showToast('处理失败', 'bad')
      } else {
        setResult(res)
        showToast('完成：' + (res.outputs && res.outputs.length ? res.outputs.map((o) => o.name).join('、') : '见下方'), 'good')
        reloadHistory()
      }
    } catch (e) {
      setErrorMsg('请求服务失败：' + String((e as Error).message || e) + '（确认服务在线：宿主 设置 → 插件服务）')
      showToast('请求服务失败', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const overLimit = totalSize > settings.maxUploadMB * 1024 * 1024

  return (
    <div>
      {!meta && (
        <div className="zf-alert warn" data-testid="svc-offline">
          服务未在线：工作台需要在宿主里启动 zhifang 后台服务（宿主「设置 → 插件 → 插件服务」）。历史与设置不受影响。
        </div>
      )}

      <div
        className={'zf-drop' + (over ? ' over' : '')}
        data-testid="dropzone"
        onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
      >
        拖拽 PDF / JPG / PNG 到这里，或点击选择文件<br />
        <span className="zf-sub">{meta ? `输出目录：${settings.outDir || '桌面（可在设置里改）'} · 单次上限 ${settings.maxUploadMB} MB` : '桌面端 · 文件全程不出本机'}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
      />

      {invalid.length > 0 && (
        <div className="zf-alert warn">已忽略不支持的文件：{invalid.map((f) => f.name).join('、')}（只接受 .pdf / .jpg / .jpeg / .png）</div>
      )}
      {mixedHint && <div className="zf-alert warn">{mixedHint}</div>}
      {overLimit && (
        <div className="zf-alert bad">所选文件共 {core.formatBytes(totalSize)}，超过单次上限 {settings.maxUploadMB} MB（可在「设置」调大）</div>
      )}

      {files.length > 0 && (
        <div className="zf-card"><div className="zf-card-b">
          <div className="zf-sub" data-testid="file-summary">已选 {files.length} 个文件 · 共 {core.formatBytes(totalSize)}{op === 'merge' ? '（按下方顺序合并，可用 ▲▼ 调整）' : ''}</div>
          {files.map((f, i) => (
            <div className="zf-row" key={f.name + i} style={{ marginTop: 6 }}>
              <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{i + 1}. {f.name}</b>
              <span className="zf-sub">{core.formatBytes(f.size)}</span>
              {op === 'merge' && (
                <>
                  <button className="zf-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                  <button className="zf-btn ghost sm" onClick={() => move(i, 1)} disabled={i === files.length - 1}>▼</button>
                </>
              )}
              <button className="zf-btn ghost sm" onClick={() => removeAt(i)}>移除</button>
            </div>
          ))}
        </div></div>
      )}

      {available.length > 0 && (
        <div className="zf-chiprow" data-testid="op-row">
          {available.map((o) => (
            <button key={o} className={'zf-chip' + (op === o ? ' on' : '')} onClick={() => pickOp(o)}>{OP_META[o].label}</button>
          ))}
        </div>
      )}
      {files.length > 0 && available.length === 0 && !mixedHint && (
        <div className="zf-alert warn">当前文件组合没有可用操作（合并需要 ≥2 个 PDF；单文件操作需要恰好 1 个 PDF）</div>
      )}

      {op && (
        <div className="zf-card" data-testid="param-card"><div className="zf-card-b">
          <div className="zf-sub">{OP_META[op].label}：{OP_META[op].hint}</div>
          {(op === 'extract' || op === 'rotate' || op === 'delete' || op === 'text') && (
            <>
              <label className="zf-lbl">页码规格（1-based：如 1-3,5；3-end；all{op === 'extract' ? '；3,1,2 表示重排' : ''}）</label>
              <input className="zf-inp" data-testid="pages-input" value={pages} placeholder={op === 'extract' ? '必填，如 1-3,5' : '留空 = 全部页'} onChange={(e) => setPages(e.target.value)} />
              {specMsg && <div className="zf-alert bad" style={{ margin: '6px 0 0' }} data-testid="spec-error">{specMsg}</div>}
            </>
          )}
          {op === 'rotate' && (
            <div className="zf-chiprow" style={{ padding: '8px 0 0' }}>
              {[90, 180, 270, -90].map((a) => (
                <button key={a} className={'zf-chip' + (angle === a ? ' on' : '')} onClick={() => setAngle(a)}>{a > 0 ? '顺时针 ' + a : '逆时针 ' + (-a)}</button>
              ))}
            </div>
          )}
          {op === 'split' && (
            <>
              <label className="zf-lbl">每几页一份</label>
              <input className="zf-inp" data-testid="every-input" value={every} onChange={(e) => setEvery(e.target.value.replace(/\D/g, ''))} />
            </>
          )}
          {op === 'images2pdf' && (
            <>
              <label className="zf-lbl">页边距 pt（0-200，默认 0）</label>
              <input className="zf-inp" data-testid="margin-input" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </>
          )}
          {op === 'text' && (
            <label className="zf-row" style={{ marginTop: 8, fontSize: 12 }}>
              <input type="checkbox" checked={writeTxt} onChange={(e) => setWriteTxt(e.target.checked)} />
              同时把全文落盘为「文件名-文字.txt」
            </label>
          )}
          <div className="zf-row" style={{ marginTop: 10 }}>
            <button className="zf-btn" data-testid="run-btn" onClick={run} disabled={busy || !!overLimit || (available.length === 0)}>
              {busy ? '处理中…' : '执行'}
            </button>
            <button className="zf-btn ghost" onClick={() => { setFiles([]); setOp(null); setResult(null); setErrorMsg('') }}>清空</button>
          </div>
        </div></div>
      )}

      {errorMsg && <div className="zf-alert bad" data-testid="error-box">{errorMsg}</div>}

      {result && result.ok && (
        <div className="zf-ok" data-testid="result-box">
          <b>完成</b>（{result.ms ?? 0} ms{typeof result.pages === 'number' ? ` · ${result.pages} 页` : ''}）
          {result.outputs && result.outputs.length > 0 && result.outputs.map((o) => (
            <div key={o.path} style={{ marginTop: 4 }}>
              📄 {o.name} · {core.formatBytes(o.size)}<br />
              <span style={{ color: '#9fd8b4', fontSize: 11 }}>{o.path}</span>
            </div>
          ))}
          {result.outputs && result.outputs.length === 0 && result.info && (
            <div className="zf-pre" data-testid="info-box">{Object.entries(result.info).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '：' + String(v)).join('\n')}</div>
          )}
          {result.text && (
            <div className="zf-pre" data-testid="text-box">{result.text.slice(0, 2000)}{result.text.length > 2000 ? '\n…（前 2000 字预览' + (result.textTruncated ? '，全文已按设置落盘）' : '）') : ''}</div>
          )}
          {result.note && <div style={{ marginTop: 4, fontSize: 11 }}>{result.note}</div>}
        </div>
      )}
    </div>
  )
}
