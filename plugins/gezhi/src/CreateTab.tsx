/**
 * 创作 Tab：粘贴 CSV/TSV → 自动定界符/编码/类型识别 → 预览 → 本地构建下载真实 .xlsx。
 * 无需 AI：同一条 core→render 引擎链与 MCP 落盘共用（口径一致）。
 */
import { useMemo, useRef, useState } from 'react'
import type { PanelCtx } from './Panel'
import { core, buildBookBuffer, downloadBuffer, type core as CoreNS } from './model'
import SheetPreview from './SheetPreview'

const SAMPLE = `日期,品名,数量,单价,小计,毛利率,到货日
2026-03-01,红富士苹果,12,3.5,,15%,2026-03-05
2026-03-02,香蕉,20,2,,22%,2026-03-08
2026-03-03,赣南脐橙,8,6.8,,18%,2026-03-09
2026-03-05,即期酸奶（促销）,30,1.2,,30%,2026-03-06
2026-03-08,本地鸡蛋,50,0.9,,12%,2026-03-08`

const OPT_LABELS: ['zebra' | 'freeze' | 'autofilter', string, string][] = [
  ['zebra', '斑马纹', '隔行浅色填充'],
  ['freeze', '冻结表头', '滚动时表头/标题行保持可见'],
  ['autofilter', '筛选', '表头带筛选下拉'],
]

export default function CreateTab({ ctx }: { ctx: PanelCtx }) {
  const { showToast, settings } = ctx
  const [raw, setRaw] = useState('')
  const [title, setTitle] = useState('')
  const [sheetName, setSheetName] = useState('数据')
  const [captionOn, setCaptionOn] = useState(true)
  const [statsOn, setStatsOn] = useState(true)
  const [opts, setOpts] = useState({ zebra: true, freeze: true, autofilter: true })
  const [theme, setTheme] = useState<string>(settings.theme || 'slate')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 粘贴内容 → 解析草稿（定界符探测 + 首行表头 + 列类型推断）
  const ingest = useMemo(() => {
    if (!raw.trim()) return null
    return core.ingestTable(raw)
  }, [raw])

  const warnings = ingest?.warnings || []

  // 组装 spec（自动合计：数值列 sum）
  const spec: CoreNS.BookSpec | null = useMemo(() => {
    if (!ingest?.sheet) return null
    const sheet: CoreNS.SheetSpec = {
      ...ingest.sheet,
      name: sheetName.trim() || '数据',
      ...(captionOn ? { caption: `生成于 ${new Date().toISOString().slice(0, 10)} · ${title.trim() || '格致'}` } : {}),
      ...opts,
      ...(statsOn ? { stats: [{ type: 'sum' as const }] } : {}),
    }
    return {
      title: title.trim() || '未命名表格',
      theme,
      sheets: [sheet],
    }
  }, [ingest, sheetName, captionOn, statsOn, opts, theme, title])

  const norm = useMemo(() => (spec ? core.normalizeBook(spec) : null), [spec])
  const g = useMemo(() => (norm && norm.book ? core.layout(norm.book) : null), [norm])
  const buildError = norm && norm.error ? norm.error : null

  const onBuild = async () => {
    if (!spec) return
    setBusy(true)
    try {
      const { buf, book } = await buildBookBuffer(spec)
      const name = core.safeFileName(book.title)
      downloadBuffer(buf, name.file)
      showToast(`已构建 ${name.file}（${book.sheets[0].rows.length} 行 × ${book.sheets[0].columns.length} 列）— 浏览器已下载`)
    } catch (e) {
      showToast(`构建失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (f: File) => {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const dec = core.decodeTableBytes(bytes)
      setRaw(dec.text)
      if (!title.trim()) setTitle(f.name.replace(/\.(csv|tsv|txt)$/i, ''))
      if (dec.encoding !== 'utf-8') showToast(`已按 ${dec.encoding} 解码（Excel 导出的中文 CSV 常见）`)
    } catch (e) {
      showToast(`读取失败：${(e as Error).message}`, 'bad')
    }
  }

  return (
    <div>
      <div className="gz-sec"><span className="gz-bar" />粘贴数据<span className="gz-hint">CSV / TSV / 竖线 / 分号分隔均可，自动识别</span></div>
      <div className="gz-card"><div className="gz-card-b">
        <textarea
          className="gz-ta"
          placeholder={'把表格文本粘到这里，例如：\n日期,品名,数量,单价\n2026-03-01,红富士苹果,12,3.5\n2026-03-02,香蕉,20,2'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
        />
        <div className="gz-row" style={{ marginTop: 8 }}>
          <button className="gz-btn sm ghost" onClick={() => { setRaw(SAMPLE); if (!title.trim()) setTitle('三月采购台账') }}>载入示例</button>
          <button className="gz-btn sm ghost" onClick={() => fileRef.current?.click()}>打开 CSV 文件…</button>
          <input
            ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); e.target.value = '' }}
          />
          <span className="grow" />
          {raw && <button className="gz-btn sm ghost" onClick={() => setRaw('')}>清空</button>}
        </div>
        {ingest && (
          <div className="gz-sub" style={{ marginTop: 8 }}>
            识别：{ingest.sheet!.rows.length} 行 × {ingest.sheet!.columns.length} 列
            （列类型：{ingest.sheet!.columns.map((c) => `${c.h}:${c.type || 'text'}`).join(' · ')}）
          </div>
        )}
      </div></div>

      {warnings.map((w, i) => <div key={i} className="gz-alert warn">⚠ {w}</div>)}

      <div className="gz-sec"><span className="gz-bar" />样式与选项</div>
      <div className="gz-card"><div className="gz-card-b">
        <label className="gz-lbl">工作簿标题（用于文件名）</label>
        <input className="gz-inp" placeholder="如：三月采购台账" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} />
        <div className="gz-row" style={{ marginTop: 8 }}>
          <div className="grow">
            <label className="gz-lbl">Sheet 名</label>
            <input className="gz-inp" value={sheetName} onChange={(e) => setSheetName(e.target.value)} maxLength={31} />
          </div>
        </div>
        <label className="gz-lbl">表头主题</label>
        <div className="gz-chiprow" style={{ padding: 0 }}>
          {core.THEME_KEYS.map((k) => (
            <button key={k} className={`gz-chip ${theme === k ? 'on' : ''}`} onClick={() => setTheme(k)}>{core.THEMES[k].label}</button>
          ))}
        </div>
        <div className="gz-chiprow" style={{ padding: '8px 0 0' }}>
          <button className={`gz-chip ${captionOn ? 'on' : ''}`} onClick={() => setCaptionOn(!captionOn)}>标题行</button>
          <button className={`gz-chip ${statsOn ? 'on' : ''}`} onClick={() => setStatsOn(!statsOn)}>自动合计（=SUM）</button>
          {OPT_LABELS.map(([k, label, tip]) => (
            <button key={k as string} className={`gz-chip ${opts[k] ? 'on' : ''}`} title={tip} onClick={() => setOpts({ ...opts, [k]: !opts[k] })}>{label}</button>
          ))}
        </div>
      </div></div>

      {buildError && <div className="gz-alert bad">✗ {buildError}</div>}

      {g && !buildError && (
        <>
          <div className="gz-sec"><span className="gz-bar" />预览<span className="gz-hint">HTML 近似还原，样式以成品为准</span></div>
          <div style={{ margin: '0 16px 10px' }}>
            <SheetPreview g={g} sheetIdx={0} />
          </div>
        </>
      )}

      <div className="gz-row" style={{ padding: '4px 16px 12px' }}>
        <button className="gz-btn" style={{ flex: 1 }} disabled={!spec || !!buildError || busy} onClick={onBuild}>
          {busy ? '构建中…' : '构建 .xlsx 并下载'}
        </button>
      </div>

      <div className="gz-ok">
        零额度零会员：构建在本地完成，数据不出设备。
        要多 Sheet / 行公式 / 条件格式的高级表，直接在对话里说「帮我把……做成 Excel」，AI 会经 MCP 引擎生成并落盘。
      </div>
    </div>
  )
}
