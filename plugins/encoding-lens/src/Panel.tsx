/**
 * 编码透视台面板 —— 纯前端零服务（core 双端共用：esbuild 打进 browser bundle，
 * 全局 TextDecoder/TextEncoder 浏览器与 node 一致；GBK 反推表按需惰性构建）
 */
import { useMemo, useRef, useState } from 'react'
import * as core from '../shared/encoding-core.js'

type Tab = 'fix' | 'file' | 'convert'

const clampS = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10))

const BADGE: Record<string, string> = {
  fixed: '✅ 修复成功',
  uncertain: '⚠️ 疑似修复（未全过终验）',
  clean: '✅ 无乱码特征',
  unrepairable: '❌ 未能自动修复',
  mojibake: '🔀 mojibake 乱码',
  damaged: '💥 不可逆损坏',
}

function ScoreDots({ score }: { score: number }) {
  const s = clampS(score)
  const color = s >= 70 ? 'var(--ok, #4ade80)' : s >= 40 ? 'var(--warn, #fbbf24)' : 'var(--err, #f87171)'
  return <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s}</span>
}

export default function EncodingLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('fix')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: 12, gap: 10, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {([['fix', '乱码修复'], ['file', '文件体检'], ['convert', '编码转换']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '5px 14px', borderRadius: 8, border: '1px solid var(--border, #444)', cursor: 'pointer',
              background: tab === k ? 'var(--primary, #3b82f6)' : 'transparent',
              color: tab === k ? '#fff' : 'var(--fg, #ddd)', fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tab === 'fix' && <FixTab />}
        {tab === 'file' && <FileTab />}
        {tab === 'convert' && <ConvertTab />}
      </div>
    </div>
  )
}

/* ---------------------------------- 乱码修复 ---------------------------------- */

function FixTab() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<null | { fp: ReturnType<typeof core.analyzeText>; fix: ReturnType<typeof core.fixMojibake> }>(null)
  const [copied, setCopied] = useState(false)

  const run = () => {
    if (!input.trim()) { setResult(null); return }
    try {
      setResult({ fp: core.analyzeText(input), fix: core.fixMojibake(input) })
    } catch (e) {
      setResult(null)
    }
    setCopied(false)
  }

  const copyFixed = async () => {
    if (result?.fix.best && navigator.clipboard) {
      await navigator.clipboard.writeText(result.fix.best.fixed)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={'粘贴乱码文本，如：ä¸­æ–‡æµ‹è¯• 或 涓枃娴嬭瘯\n（错误解码的产物——本台找出误读链并还原原文）'}
        rows={5}
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-1, #1a1a1a)', color: 'var(--fg, #ddd)', border: '1px solid var(--border, #444)', borderRadius: 8, padding: 8, fontSize: 13, resize: 'vertical' }}
      />
      <div>
        <button onClick={run} disabled={!input.trim()} style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #3b82f6)', color: '#fff', cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: 13 }}>
          分析并修复
        </button>
      </div>
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Section title={`指纹：${BADGE[result.fp.verdict] || result.fp.verdict}`}>
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
              共 {result.fp.stats.total} 字符——汉字 {result.fp.stats.hanzi}、Latin 扩展 {result.fp.stats.latinExt}、C1 控制 {result.fp.stats.c1ctrl}、U+FFFD {result.fp.stats.fffd}；可读分 <ScoreDots score={result.fp.stats.score} />
              {result.fp.findings.map((f) => (
                <div key={f.name} style={{ marginTop: 4 }}>
                  · <b>{f.name}</b> ×{f.count}：{f.cause}
                </div>
              ))}
              <div style={{ marginTop: 4, opacity: 0.75 }}>建议：{result.fp.suggestion}</div>
            </div>
          </Section>
          <Section title={`修复：${BADGE[result.fix.status] || result.fix.status}`}>
            {result.fix.best ? (
              <>
                <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
                  误读链：{result.fix.best.chain}；可读分 {clampS(result.fix.originalScore)} → <ScoreDots score={result.fix.best.score} />（+{result.fix.best.gain}）；
                  round-trip {result.fix.best.roundtrip ? '自洽 ✓' : '不自洽 ✗'}
                  {result.fix.best.tailLoss > 0 && <>；尾部 {result.fix.best.tailLoss} 字节不可逆丢失</>}
                </div>
                {result.fix.note && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{result.fix.note}</div>}
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg-1, #111)', border: '1px solid var(--border, #333)', borderRadius: 8, padding: 8, fontSize: 13, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{result.fix.best.fixed}</pre>
                <button onClick={copyFixed} style={{ marginTop: 6, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border, #444)', background: 'transparent', color: 'var(--fg, #ddd)', cursor: 'pointer', fontSize: 12 }}>
                  {copied ? '已复制 ✓' : '复制修复结果'}
                </button>
              </>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{result.fix.note || '没有可用的修复候选'}</div>
            )}
            {result.fix.candidates.length > 1 && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                全部候选：{result.fix.candidates.map((c) => `[${c.status === 'fixed' ? '✓' : c.status === 'uncertain' ? '?' : '×'}] ${c.reencode} +${c.gain}`).join('　')}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------- 文件体检 ---------------------------------- */

function FileTab() {
  const [fileInfo, setFileInfo] = useState('')
  const [report, setReport] = useState<null | { detect: ReturnType<typeof core.detectEncoding>; inspect: ReturnType<typeof core.inspectBytes>; hexHead: string }>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (f: File | undefined) => {
    setError('')
    setReport(null)
    if (!f) return
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      if (buf.length > 2 * 1024 * 1024) { setError(`文件过大（${buf.length} 字节 > 2MB），请分段处理`); return }
      const detect = core.detectEncoding(buf)
      const inspect = core.inspectBytes(buf)
      setFileInfo(`${f.name}（${buf.length} 字节）`)
      setReport({ detect, inspect, hexHead: core.bytesToHex(buf.slice(0, 32)) })
    } catch (e) {
      setError(`读取失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input ref={fileRef} type="file" onChange={(e) => onFile(e.target.files?.[0])} style={{ fontSize: 12, color: 'var(--fg, #ddd)' }} />
      {error && <div style={{ fontSize: 12, color: 'var(--err, #f87171)' }}>{error}</div>}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Section title={`识别：${report.detect.best.label}（置信度 ${report.detect.best.confidence}）`}>
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.8 }}>
              {fileInfo}{report.detect.bom ? `；BOM=${report.detect.bom}` : ''}
              <div style={{ opacity: 0.7, fontFamily: 'monospace', fontSize: 11, marginTop: 2 }}>头 32 字节：{report.hexHead}</div>
              {report.detect.candidates.map((c) => (
                <div key={c.charset}>
                  {c.charset === report.detect.best.charset ? '▶' : '·'} {c.label}——<ScoreDots score={c.score} /> 分{c.note ? `（${c.note}）` : ''}
                </div>
              ))}
            </div>
          </Section>
          <Section title={`体检：${BADGE[report.inspect.fingerprint.verdict] || report.inspect.fingerprint.verdict}（路径 via ${report.inspect.via}）`}>
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
              {report.inspect.decodeNote}；{report.inspect.fingerprint.suggestion}
            </div>
          </Section>
          {report.inspect.fix.best && (
            <Section title={`修复预览：${BADGE[report.inspect.fix.status] || report.inspect.fix.status}`}>
              <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
                {report.inspect.fix.best.chain}；round-trip {report.inspect.fix.best.roundtrip ? '自洽 ✓' : '不自洽 ✗'}
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg-1, #111)', border: '1px solid var(--border, #333)', borderRadius: 8, padding: 8, fontSize: 12, marginTop: 6, maxHeight: 200, overflow: 'auto' }}>
                {report.inspect.fix.best.fixed.slice(0, 2000)}
              </pre>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------- 编码转换 ---------------------------------- */

const CHARSETS = ['utf-8', 'gbk', 'big5', 'shift_jis', 'euc-kr', 'gb18030', 'latin1', 'windows-1252', 'utf-16le'] as const

function ConvertTab() {
  const [mode, setMode] = useState<'textToBytes' | 'bytesToText'>('textToBytes')
  const [text, setText] = useState('')
  const [bytesInput, setBytesInput] = useState('')
  const [bytesForm, setBytesForm] = useState<'hex' | 'base64'>('hex')
  const [charset, setCharset] = useState<string>('gbk')
  const [out, setOut] = useState<{ lines: string[]; unsupported?: string[]; error?: string } | null>(null)

  const run = () => {
    try {
      if (mode === 'textToBytes') {
        if (!text) { setOut({ lines: [], error: '请输入文本' }); return }
        const enc = core.encodeText(text, charset)
        if (!enc.bytes) { setOut({ lines: [], error: `编码 ${charset} 不支持编码方向` }); return }
        const uniq = [...new Set(enc.unsupported)]
        setOut({
          lines: [
            `字节数：${enc.bytes.length}`,
            `hex：${core.bytesToHex(enc.bytes, '').slice(0, 1000)}`,
            `base64：${core.base64Encode(enc.bytes).slice(0, 1000)}`,
          ],
          unsupported: enc.unsupported.length ? uniq : undefined,
        })
      } else {
        const bytes = bytesForm === 'hex' ? core.hexToBytes(bytesInput) : core.base64Decode(bytesInput)
        if (!bytes) { setOut({ lines: [], error: '字节流格式无效' }); return }
        const dec = core.strictDecode(bytes, charset)
        if (!dec.ok) { setOut({ lines: [], error: `按 ${charset} 严格解码失败（${dec.error}）——建议先在「文件体检」确认编码` }); return }
        setOut({ lines: [dec.text.slice(0, 2000)] })
      }
    } catch (e) {
      setOut({ lines: [], error: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={mode} onChange={(e) => { setMode(e.target.value as 'textToBytes' | 'bytesToText'); setOut(null) }} style={selectStyle}>
          <option value="textToBytes">文本 → 字节</option>
          <option value="bytesToText">字节 → 文本</option>
        </select>
        <select value={charset} onChange={(e) => setCharset(e.target.value)} style={selectStyle}>
          {CHARSETS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {mode === 'bytesToText' && (
          <select value={bytesForm} onChange={(e) => setBytesForm(e.target.value as 'hex' | 'base64')} style={selectStyle}>
            <option value="hex">hex 输入</option>
            <option value="base64">base64 输入</option>
          </select>
        )}
      </div>
      {mode === 'textToBytes' ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="输入要编码的文本" rows={4} style={inputStyle} />
      ) : (
        <textarea value={bytesInput} onChange={(e) => setBytesInput(e.target.value)} placeholder={bytesForm === 'hex' ? '输入 hex 字节串（如 d6 d0 ce c4）' : '输入 base64 串'} rows={4} style={inputStyle} />
      )}
      <div>
        <button onClick={run} style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #3b82f6)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>转换</button>
      </div>
      {out?.error && <div style={{ fontSize: 12, color: 'var(--err, #f87171)' }}>{out.error}</div>}
      {out && !out.error && (
        <Section title="结果">
          {out.unsupported && <div style={{ fontSize: 12, color: 'var(--warn, #fbbf24)', marginBottom: 4 }}>⚠ {out.unsupported.length} 种字符无 {charset} 编码（未静默替换）：{out.unsupported.slice(0, 30).join(' ')}</div>}
          <pre style={preStyle}>{out.lines.join('\n')}</pre>
        </Section>
      )}
    </div>
  )
}

/* ---------------------------------- 通用小件 ---------------------------------- */

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border, #444)',
  background: 'var(--bg-1, #1a1a1a)', color: 'var(--fg, #ddd)', fontSize: 12,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-1, #1a1a1a)', color: 'var(--fg, #ddd)',
  border: '1px solid var(--border, #444)', borderRadius: 8, padding: 8, fontSize: 13, resize: 'vertical',
}
const preStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--bg-1, #111)',
  border: '1px solid var(--border, #333)', borderRadius: 8, padding: 8, fontSize: 12, margin: 0, maxHeight: 240, overflow: 'auto',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border, #333)', borderRadius: 10, padding: 10, background: 'var(--bg-2, rgba(255,255,255,0.02))' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--fg, #eee)' }}>{title}</div>
      {children}
    </div>
  )
}
