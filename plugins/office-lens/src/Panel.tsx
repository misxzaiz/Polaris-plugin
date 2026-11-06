/**
 * Office 文档透视台面板 —— 拖拽 docx/pptx/xlsx → 本地提取 Markdown
 *
 * 全程浏览器内完成（DecompressionStream + 纯 JS 引擎），文件不出机器：
 * 无服务、无端口、无 kv。xlsx 多工作表用标签页切换；CSV 一键复制。
 */
import { useCallback, useRef, useState } from 'react'
import * as core from '../shared/core.js'

type ExtractResult = {
  format: 'docx' | 'xlsx' | 'pptx'
  markdown: string
  warnings: string[]
  stats: Record<string, number | undefined>
  sheets?: string[]
  sheetName?: string
}

const ACCEPT = '.docx,.docm,.pptx,.ppsx,.xlsx,.xlsm,.xlsm,.doc,.xls,.ppt'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

const CARD: React.CSSProperties = {
  border: '1px solid var(--pol-border, #3a3f4b)',
  borderRadius: 8,
  background: 'var(--pol-bg-elev, #23262e)',
  padding: 10,
}
const CHIP: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 8px',
  borderRadius: 10,
  fontSize: 11,
  border: '1px solid var(--pol-border, #3a3f4b)',
  marginRight: 6,
  color: 'var(--pol-text-dim, #9aa2b1)',
}
const BTN: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 6,
  border: '1px solid var(--pol-primary, #4f8cff)',
  background: 'transparent',
  color: 'var(--pol-primary, #4f8cff)',
  cursor: 'pointer',
  fontSize: 12,
}
const TAB: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 6,
  border: '1px solid var(--pol-border, #3a3f4b)',
  background: 'transparent',
  color: 'var(--pol-text-dim, #9aa2b1)',
  cursor: 'pointer',
  fontSize: 12,
}

export default function OfficeLensPanel(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [fileName, setFileName] = useState<string>('')
  const [fileSize, setFileSize] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [result, setResult] = useState<ExtractResult | null>(null)
  const [toast, setToast] = useState<string>('')
  const [sheet, setSheet] = useState<string>('')
  const [csvMode, setCsvMode] = useState(false)
  const bytesRef = useRef<Uint8Array | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 1800)
  }, [])

  const runExtract = useCallback(async (bytes: Uint8Array, opts: { sheet?: string; csv?: boolean }) => {
    setBusy(true)
    setError('')
    try {
      const r = (await core.extractAuto(bytes, opts)) as unknown as ExtractResult
      setResult(r)
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const takeFile = useCallback(
    async (file: File) => {
      if (file.size > core.LIMITS.MAX_FILE_BYTES) {
        setError(`文件 ${fmtBytes(file.size)} 超上限 100MB`)
        return
      }
      setFileName(file.name)
      setFileSize(file.size)
      setResult(null)
      setError('')
      setSheet('')
      setCsvMode(false)
      try {
        const buf = await file.arrayBuffer()
        const bytes = new Uint8Array(buf)
        bytesRef.current = bytes
        await runExtract(bytes, {})
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [runExtract],
  )

  const pickSheet = useCallback(
    async (name: string) => {
      setSheet(name)
      if (bytesRef.current) await runExtract(bytesRef.current, { sheet: name, csv: csvMode })
    },
    [csvMode, runExtract],
  )

  const toggleCsv = useCallback(async () => {
    const next = !csvMode
    setCsvMode(next)
    if (bytesRef.current) await runExtract(bytesRef.current, { sheet: sheet || undefined, csv: next })
  }, [csvMode, runExtract, sheet])

  const copyOut = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text)
        showToast(`${label}已复制（${text.length.toLocaleString()} 字符）`)
      } catch (_) {
        showToast('复制失败：剪贴板不可用')
      }
    },
    [showToast],
  )

  const sendToChat = useCallback(() => {
    if (!result || !props.onSendToChat) return
    props.onSendToChat(result.markdown)
    showToast('已发送到对话')
  }, [props, result, showToast])

  const reset = useCallback(() => {
    bytesRef.current = null
    setFileName('')
    setFileSize(0)
    setResult(null)
    setError('')
    setSheet('')
    setCsvMode(false)
  }, [])

  const s = result && result.stats ? result.stats : null
  const isXlsx = result && result.format === 'xlsx'

  return (
    <div style={{ padding: 12, fontFamily: 'inherit', color: 'var(--pol-text, #d6dae2)', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Office 文档透视台</strong>
        <span style={{ fontSize: 11, color: 'var(--pol-text-dim, #9aa2b1)' }}>
          docx / pptx / xlsx → Markdown，全程本地，文件不出机器
        </span>
      </div>

      {/* 拖放区 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files && e.dataTransfer.files[0]
          if (f) void takeFile(f)
        }}
        onClick={() => inputRef.current && inputRef.current.click()}
        style={{
          ...CARD,
          cursor: 'pointer',
          textAlign: 'center' as const,
          padding: 22,
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--pol-primary, #4f8cff)' : undefined,
          background: dragOver ? 'rgba(79,140,255,0.08)' : undefined,
        }}
      >
        {fileName ? (
          <div>
            <div style={{ fontSize: 13 }}>
              {fileName} <span style={CHIP}>{fmtBytes(fileSize)}</span>
              {result && <span style={CHIP}>{result.format.toUpperCase()}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--pol-text-dim, #9aa2b1)', marginTop: 4 }} onClick={(e) => { e.stopPropagation(); reset() }}>
              点击此处空白重新选择文件
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--pol-text-dim, #9aa2b1)' }}>
            拖入 Word / PowerPoint / Excel 文件，或点击选择
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0]
            if (f) void takeFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {busy && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--pol-text-dim, #9aa2b1)' }}>提取中…</div>}

      {error && (
        <div style={{ ...CARD, marginTop: 8, borderColor: 'var(--pol-danger, #e5534b)', color: 'var(--pol-danger, #e5534b)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* 统计 */}
      {result && s && (
        <div style={{ marginTop: 8 }}>
          {s.words != null && <span style={CHIP}>约 {s.words} 字</span>}
          {s.paragraphs != null && <span style={CHIP}>段落 {s.paragraphs}</span>}
          {s.tables != null && s.tables > 0 && <span style={CHIP}>表格 {s.tables}</span>}
          {s.images != null && s.images > 0 && <span style={CHIP}>图片 {s.images}（占位）</span>}
          {s.slides != null && <span style={CHIP}>幻灯片 {s.slides}</span>}
          {s.rows != null && <span style={CHIP}>{s.rows} 行 × {s.cols} 列</span>}
          {s.formulas != null && s.formulas > 0 && <span style={CHIP}>公式 {s.formulas}</span>}
          {s.footnotes != null && s.footnotes > 0 && <span style={CHIP}>脚注 {s.footnotes}</span>}
          {s.ms != null && <span style={CHIP}>{s.ms}ms</span>}
        </div>
      )}

      {/* 警告（未覆盖项如实列出） */}
      {result && result.warnings.length > 0 && (
        <div style={{ ...CARD, marginTop: 8, borderColor: 'var(--pol-warn, #d4a72c)' }}>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--pol-warn, #d4a72c)' }}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* xlsx sheet 标签 + 输出切换 */}
      {isXlsx && result && result.sheets && result.sheets.length > 1 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {result.sheets.map((name) => (
            <button
              key={name}
              style={{
                ...TAB,
                ...(name === result.sheetName
                  ? { borderColor: 'var(--pol-primary, #4f8cff)', color: 'var(--pol-primary, #4f8cff)' }
                  : {}),
              }}
              onClick={() => void pickSheet(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* 工具行 */}
      {result && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={BTN} onClick={() => void copyOut(result.markdown, 'Markdown')}>复制 Markdown</button>
          {isXlsx && (
            <button style={{ ...BTN, borderColor: 'var(--pol-border, #3a3f4b)', color: 'var(--pol-text-dim, #9aa2b1)' }} onClick={() => void toggleCsv()}>
              {csvMode ? '切回表格' : '切 CSV'}
            </button>
          )}
          {isXlsx && csvMode && (
            <button style={BTN} onClick={() => void copyOut(result.markdown, 'CSV')}>复制 CSV</button>
          )}
          {props.onSendToChat && (
            <button style={{ ...BTN, borderColor: 'var(--pol-border, #3a3f4b)', color: 'var(--pol-text-dim, #9aa2b1)' }} onClick={sendToChat}>
              发送到对话
            </button>
          )}
          {toast && <span style={{ fontSize: 12, color: 'var(--pol-ok, #57ab5a)' }}>{toast}</span>}
        </div>
      )}

      {/* 输出 */}
      {result && (
        <pre
          style={{
            ...CARD,
            marginTop: 8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12,
            lineHeight: 1.55,
            maxHeight: '56vh',
            overflowY: 'auto',
            userSelect: 'text',
          }}
        >
          {result.markdown}
        </pre>
      )}

      {!result && !busy && !error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--pol-text-dim, #9aa2b1)', lineHeight: 1.7 }}>
          <div>· docx：标题层级、粗斜体、超链接、多级编号列表、表格、脚注 → Markdown</div>
          <div>· pptx：每页标题 + 正文要点 + 演讲者备注 + 表格</div>
          <div>· xlsx：单元格值（日期自动识别）、公式缓存值、多工作表、CSV</div>
          <div>· 对话里 AI 可直接用 olens_extract / olens_outline 工具读取本机 Office 文档</div>
        </div>
      )}
    </div>
  )
}
