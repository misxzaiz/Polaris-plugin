/**
 * 工作台（两阶段流）：
 *   ① 拖入 PDF → 自动「检测表格」→ 逐页表格候选卡（表头+预览网格+填充率），勾选要提取的页
 *   ② 选输出格式（xlsx/csv/json/all）与跨页合并 → 「提取落盘」→ 输出文件卡
 * 检测/提取都走 127.0.0.1 直连自家服务；手机端没有本地文件，如实提示桌面端操作。
 */
import { useMemo, useRef, useState } from 'react'
import type { PanelCtx } from './Panel'
import type { DetectResult, OpResult, PageTables, PdfTablesSettings } from './model'
import { core, fileToB64, runOpRequest } from './model'

const FORMAT_META: Array<{ key: PdfTablesSettings['format'], label: string, hint: string }> = [
  { key: 'xlsx', label: 'Excel', hint: '数字列自动转数值、表头冻结，可直接 SUM' },
  { key: 'csv', label: 'CSV', hint: 'UTF-8 带 BOM，中文 Excel/WPS 双击直开' },
  { key: 'json', label: 'JSON', hint: '结构化数据，供程序/管道消费' },
  { key: 'all', label: '全部', hint: '三种格式各出一份' },
]

function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name)
}

/** 从勾选页集合生成紧凑页码规格（复用 core 同源压缩） */
function pagesSpecOf(selected: Set<number>): string {
  const arr = Array.from(selected).sort((a, b) => a - b)
  const ranges = core.compactRanges(arr)
  return ranges
}

export default function WorkTab({ ctx }: { ctx: PanelCtx }) {
  const { meta, settings, showToast, reloadHistory } = ctx
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [detect, setDetect] = useState<DetectResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [format, setFormat] = useState<PdfTablesSettings['format']>(settings.format)
  const [mergePages, setMergePages] = useState<boolean>(settings.mergePages)
  const [result, setResult] = useState<OpResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const pagesWithTables = useMemo(() => {
    const out: PageTables[] = []
    for (const pr of detect && detect.pageResults || []) {
      if (pr.tables.length) out.push(pr)
    }
    return out
  }, [detect])

  const totalTables = detect && detect.totalTables || 0

  const reset = () => {
    setFile(null)
    setDetect(null)
    setSelected(new Set())
    setResult(null)
    setErrorMsg('')
  }

  const pickFile = (f: File | null) => {
    reset()
    setFile(f)
  }

  const addFiles = (list: FileList | null) => {
    if (!list || !list.length) return
    const pdf = Array.from(list).find((f) => isPdfName(f.name))
    if (!pdf) {
      showToast('只接受 PDF 文件', 'bad')
      return
    }
    pickFile(pdf)
  }

  const runDetect = async (f: File) => {
    if (!meta) { showToast('服务未在线：请先在宿主设置里启动 pdf-tables 服务', 'bad'); return }
    setDetecting(true); setErrorMsg(''); setResult(null); setDetect(null)
    try {
      const payload = [{ name: f.name, b64: await fileToB64(f) }]
      const res = await runOpRequest(meta, { op: 'detect', files: payload, params: {}, source: 'panel' })
      if (!res.ok) {
        setErrorMsg(String(res.error || '检测失败'))
        showToast('检测失败', 'bad')
        return
      }
      setDetect(res)
      // 默认全选有表格的页
      const sel = new Set<number>()
      for (const pr of res.pageResults || []) {
        if (pr.tables.length) sel.add(pr.page)
      }
      setSelected(sel)
      showToast(res.totalTables ? `检出 ${res.totalTables} 张表格` : '未检出表格（详见页面说明）', res.totalTables ? 'good' : 'bad')
    } catch (e) {
      setErrorMsg('请求服务失败：' + String((e as Error).message || e) + '（确认服务在线：宿主 设置 → 插件服务）')
      showToast('请求服务失败', 'bad')
    } finally {
      setDetecting(false)
    }
  }

  const togglePage = (page: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(page)) next.delete(page); else next.add(page)
      return next
    })
  }

  const runExtract = async () => {
    if (!meta || !file) return
    if (!selected.size) { showToast('请至少勾选一页有表格的页', 'bad'); return }
    setExtracting(true); setErrorMsg(''); setResult(null)
    try {
      const payload = [{ name: file.name, b64: await fileToB64(file) }]
      const res = await runOpRequest(meta, {
        op: 'extract', files: payload, source: 'panel',
        params: { pages: pagesSpecOf(selected), format, mergePages },
      })
      if (!res.ok) {
        setErrorMsg(String(res.error || '提取失败'))
        showToast('提取失败', 'bad')
      } else {
        setResult(res)
        showToast('完成：' + (res.outputs && res.outputs.length ? res.outputs.map((o) => o.name).join('、') : ''), 'good')
        reloadHistory()
      }
    } catch (e) {
      setErrorMsg('请求服务失败：' + String((e as Error).message || e) + '（确认服务在线：宿主 设置 → 插件服务）')
      showToast('请求服务失败', 'bad')
    } finally {
      setExtracting(false)
    }
  }

  const overLimit = file ? file.size > settings.maxUploadMB * 1024 * 1024 : false

  return (
    <div>
      {!meta && (
        <div className="pdt-alert warn" data-testid="svc-offline">
          服务未在线：工作台需要在宿主里启动 pdf-tables 后台服务（宿主「设置 → 插件 → 插件服务」）。历史与设置不受影响。
        </div>
      )}

      <div
        className={'pdt-drop' + (over ? ' over' : '')}
        data-testid="dropzone"
        onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
      >
        {file ? file.name : '拖拽 PDF 到这里，或点击选择文件'}<br />
        <span className="pdt-sub">
          {meta ? `输出目录：${settings.outDir || '桌面（可在设置里改）'} · 单文件上限 ${settings.maxUploadMB} MB` : '桌面端 · 文件全程不出本机'}
          {' · 扫描件/加密 PDF 不支持'}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) pickFile(f); e.target.value = '' }}
      />

      {overLimit && (
        <div className="pdt-alert bad">文件 {file ? core.formatBytes(file.size) : ''} 超过单文件上限 {settings.maxUploadMB} MB（可在「设置」调大）</div>
      )}

      {file && (
        <div className="pdt-card"><div className="pdt-card-b">
          <div className="pdt-row">
            <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} data-testid="file-name">{file.name}</b>
            <span className="pdt-sub">{core.formatBytes(file.size)}</span>
            <button className="pdt-btn ghost sm" onClick={() => runDetect(file)} disabled={detecting || extracting || !!overLimit} data-testid="re-detect-btn">
              {detecting ? '检测中…' : '重新检测'}
            </button>
            <button className="pdt-btn ghost sm" onClick={reset}>移除</button>
          </div>
        </div></div>
      )}

      {detecting && <div className="pdt-empty" data-testid="detecting">正在按坐标重建表格结构…</div>}

      {detect && detect.ok && (
        <>
          {pagesWithTables.length === 0 ? (
            <div className="pdt-alert warn" data-testid="no-tables">
              未检出表格：{detect.note || '页面文字存在但没有对齐的列结构（可能是不规则排版/双栏/图片表格）'}
            </div>
          ) : (
            <>
              <div className="pdt-chiprow" data-testid="page-select-row">
                <span className="pdt-sub">勾选要提取的页：</span>
                <button className="pdt-chip" onClick={() => setSelected(new Set(pagesWithTables.map((p) => p.page)))}>全选</button>
                <button className="pdt-chip" onClick={() => setSelected(new Set())}>全不选</button>
                <span className="pdt-sub">已选 {selected.size} 页 · 检出 {totalTables} 张表格{detect.pages ? ` · 文档共 ${detect.pages} 页` : ''}</span>
              </div>

              {detect.pageResults && detect.pageResults.map((pr) => (
                pr.tables.length > 0 && (
                  <div className="pdt-item" key={pr.page} data-testid={'page-card-' + pr.page}>
                    <div className="pdt-item-head">
                      <input
                        type="checkbox"
                        checked={selected.has(pr.page)}
                        onChange={() => togglePage(pr.page)}
                        data-testid={'page-check-' + pr.page}
                      />
                      <b>第 {pr.page} 页 · {pr.tables.map((t) => `${t.rowsCount}行×${t.colCount}列`).join('，')}</b>
                      <span className="pdt-badge ok">填充率 {Math.round(pr.tables.reduce((s, t) => s + t.fillRatio, 0) / pr.tables.length * 100)}%</span>
                    </div>
                    {pr.tables.map((t, i) => (
                      <div className="pdt-gridwrap" key={i}>
                        <table className="pdt-grid" data-testid={'grid-' + pr.page + '-' + i}>
                          <thead>
                            <tr>{t.header.map((h, c) => <th key={c}>{h || ' '}</th>)}</tr>
                          </thead>
                          <tbody>
                            {t.preview.slice(1).map((row, r) => (
                              <tr key={r}>{row.map((v, c) => (
                                <td key={c} className={core.parseNumeric(v) !== null ? 'pdt-num' : ''}>{v || ' '}</td>
                              ))}</tr>
                            ))}
                          </tbody>
                        </table>
                        {t.rowsCount > t.preview.length - 1 && (
                          <div className="pdt-sub" style={{ padding: '4px 8px' }}>…共 {t.rowsCount} 行数据（预览前 {t.preview.length - 1} 行）</div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ))}
              {detect.pageResults && detect.pageResults.some((pr) => !pr.tables.length) && (
                <div className="pdt-sub" style={{ margin: '0 18px 8px' }} data-testid="textless-pages">
                  未检出表格的页：{detect.pageResults.filter((pr) => !pr.tables.length).map((pr) => '第' + pr.page + '页' + (pr.textLess ? '(无文字层)' : '')).join('、')}
                </div>
              )}

              <div className="pdt-card" data-testid="param-card"><div className="pdt-card-b">
                <div className="pdt-sub">输出格式</div>
                <div className="pdt-chiprow" style={{ padding: '6px 0 2px' }} data-testid="format-row">
                  {FORMAT_META.map((f) => (
                    <button key={f.key} className={'pdt-chip' + (format === f.key ? ' on' : '')} onClick={() => setFormat(f.key)} title={f.hint}>{f.label}</button>
                  ))}
                </div>
                <label className="pdt-row" style={{ marginTop: 8, fontSize: 12 }} data-testid="merge-toggle-row">
                  <input type="checkbox" checked={mergePages} onChange={(e) => setMergePages(e.target.checked)} data-testid="merge-toggle" />
                  跨页续表合并（同构表头自动拼成一张完整表，如按页导出的流水）
                </label>
                <div className="pdt-row" style={{ marginTop: 10 }}>
                  <button className="pdt-btn" data-testid="extract-btn" onClick={runExtract} disabled={extracting || detecting || !selected.size || !!overLimit}>
                    {extracting ? '提取中…' : '提取落盘'}
                  </button>
                  <button className="pdt-btn ghost" onClick={reset}>清空</button>
                </div>
              </div></div>
            </>
          )}
        </>
      )}

      {errorMsg && <div className="pdt-alert bad" data-testid="error-box">{errorMsg}</div>}

      {result && result.ok && (
        <div className="pdt-ok" data-testid="result-box">
          <b>完成</b>（{result.ms ?? 0} ms{typeof result.totalTables === 'number' ? ` · 检出 ${result.totalTables} 张表` : ''}
          {typeof result.tablesExtracted === 'number' ? ` · 提取 ${result.tablesExtracted} 张 / ${result.rowsTotal || 0} 行` : ''}）
          {result.outputs && result.outputs.length > 0 && result.outputs.map((o) => (
            <div key={o.path} style={{ marginTop: 4 }}>
              📄 {o.name} · {core.formatBytes(o.size)}<br />
              <span style={{ color: '#9fd8b4', fontSize: 11 }}>{o.path}</span>
            </div>
          ))}
          {result.note && <div style={{ marginTop: 4, fontSize: 11 }}>{result.note}</div>}
        </div>
      )}
    </div>
  )
}
