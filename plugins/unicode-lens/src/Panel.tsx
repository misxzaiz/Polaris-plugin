/**
 * Unicode 检查台面板：粘贴文本 → 隐形字符/同形字/混排分级体检 + 一键清洗。
 * 扫描/清洗引擎复用 shared/unicode-core.js（与 MCP 同一权威，esbuild 打进 bundle，
 * 纯本地零外联——文本不离开本机）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/unicode-core.js'

const CSS = `
.ul-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ul-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ul-head b{font-size:13px}
.ul-head .sub{color:#5C6678;font-size:11px}
.ul-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ul-area{width:100%;min-height:120px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.ul-area:focus{border-color:#e8b33d}
.ul-btnrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ul-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.ul-btn.primary{background:#3d3417;border-color:#e8b33d;color:#f3d98b}
.ul-btn:disabled{opacity:.5;cursor:not-allowed}
.ul-opt{display:flex;gap:4px;align-items:center;color:#8B94A9;font-size:11px;cursor:pointer;user-select:none}
.ul-opt input{accent-color:#e8b33d}
.ul-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.ul-verdict.clean{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.ul-verdict.low{background:#14202b;border-color:#3b82a0;color:#9cc9e0}
.ul-verdict.medium{background:#2b2413;border-color:#d99a17;color:#f3d98b}
.ul-verdict.high{background:#2d1512;border-color:#e8590c;color:#f3b377}
.ul-verdict b{font-size:13px}
.ul-chips{display:flex;gap:6px;flex-wrap:wrap}
.ul-chip{border-radius:999px;padding:3px 10px;font-size:11px;border:1px solid}
.ul-chip.high{background:#2d1512;border-color:#e8590c;color:#f3b377}
.ul-chip.medium{background:#2b2413;border-color:#d99a17;color:#f3d98b}
.ul-chip.low{background:#14202b;border-color:#3b82a0;color:#9cc9e0}
.ul-hl{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.9 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede;max-height:260px;overflow:auto}
.ul-m{border-radius:4px;padding:0 2px;font-weight:600}
.ul-m.high{background:#5c1f0e;color:#ffb894}
.ul-m.medium{background:#4d3c0d;color:#ffe08a}
.ul-m.low{background:#17303f;color:#a8d8ee}
.ul-m.mk{background:transparent;color:#ff9f6e;outline:1px solid #e8590c66;font-weight:600}
.ul-sec{color:#8B94A9;font-size:11px}
.ul-report{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c9cede}
.ul-note{color:#5C6678;font-size:11px;line-height:1.6}
.ul-hidden{background:#2d1512;border:1px dashed #e8590c;border-radius:8px;padding:8px 12px;color:#ffb894;font:12px/1.6 ui-monospace,Consolas,monospace;word-break:break-all}
`

/** 面板侧最小 finding 形状（与 core.scanText 输出对齐） */
interface Finding {
  index: number
  end: number
  cp: string
  cat: string
  risk: 'high' | 'medium' | 'low'
  name: string
  line: number
  col: number
  context: string
  hiddenMessage?: string
  suggest?: string | null
}

interface Seg {
  text: string
  f?: Finding
}

const DISPLAY_CAP = 20000

function isMarkerCat(cat: string): boolean {
  // 不可见类渲染为可见占位标记；同形字/混排本身可见，直接高亮字符
  return cat !== 'homoglyph' && cat !== 'mixed_script' && cat !== 'nonnormal'
}

function buildSegments(text: string, findings: Finding[]): { segs: Seg[]; truncated: boolean } {
  const t = text.length > DISPLAY_CAP ? text.slice(0, DISPLAY_CAP) : text
  const segs: Seg[] = []
  let pos = 0
  for (const f of findings) {
    if (f.index >= t.length) break
    if (f.index < pos) continue // 重叠定位（混排与同形字同位）跳过
    if (f.index > pos) segs.push({ text: t.slice(pos, f.index) })
    const end = Math.min(f.end, t.length)
    segs.push({ text: t.slice(f.index, end), f })
    pos = end
  }
  if (pos < t.length) segs.push({ text: t.slice(pos) })
  return { segs, truncated: text.length > DISPLAY_CAP }
}

const VERDICT_TEXT: Record<string, string> = {
  clean: '✅ 干净——未检出风险字符',
  low: '🟡 低提示——有可了解的低风险字符（详见下方分类）',
  medium: '🟠 中危——检出可疑字符，建议清洗或人工核对',
  high: '🔴 高危——检出隐形注入载体，务必清洗后再使用',
}

export default function UnicodeLensPanel(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [input, setInput] = useState('')
  const [scanned, setScanned] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fixHomoglyph, setFixHomoglyph] = useState(false)
  const [nfcNormalize, setNfcNormalize] = useState(false)
  const [dropPua, setDropPua] = useState(false)
  const [keepIdeo, setKeepIdeo] = useState(true)
  const [scrubbed, setScrubbed] = useState<{ cleaned: string; deleted: Record<string, number>; replaced: Record<string, number>; homoglyphFixed: number; normalized: boolean } | null>(null)

  const scan = useMemo(() => {
    if (!scanned) return null
    try {
      setError(null)
      return core.scanText(scanned)
    } catch (e) {
      setError(String((e as Error).message || e))
      return null
    }
  }, [scanned])

  const runScan = () => {
    setScrubbed(null)
    setError(null)
    setScanned(input)
  }

  const runScrub = () => {
    setError(null)
    try {
      const r = core.scrubText(scanned || input, {
        fixHomoglyph,
        nfcNormalize,
        dropPua,
        keepIdeographicSpace: keepIdeo,
      })
      setScrubbed(r)
      if (!scanned) setScanned(input)
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }

  const segs = useMemo(() => {
    if (!scan) return null
    return buildSegments(scanned, scan.findings as Finding[])
  }, [scan, scanned])

  const report = useMemo(() => {
    if (!scan) return null
    try { return core.renderReport(scan) } catch (_) { return null }
  }, [scan])

  const sendReport = () => {
    if (props.onSendToChat && report) props.onSendToChat(report)
  }

  return (
    <div className="ul-root">
      <style>{CSS}</style>
      <div className="ul-head">
        <b>Unicode 检查台</b>
        <span className="sub">隐形注入载体 · 同形字 · 混排 · 纯本地</span>
      </div>
      <div className="ul-body">
        <textarea
          className="ul-area"
          placeholder={'粘贴待检文本/提示词/代码片段\n隐形字符人眼不可见——扫描后逐字符可视化标注'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="ul-btnrow">
          <button className="ul-btn primary" onClick={runScan} disabled={!input.trim()}>扫描</button>
          <button className="ul-btn" onClick={runScrub} disabled={!input.trim()}>一键清洗</button>
          <label className="ul-opt"><input type="checkbox" checked={fixHomoglyph} onChange={(e) => setFixHomoglyph(e.target.checked)} />同形字→ASCII</label>
          <label className="ul-opt"><input type="checkbox" checked={nfcNormalize} onChange={(e) => setNfcNormalize(e.target.checked)} />NFC 归一化</label>
          <label className="ul-opt"><input type="checkbox" checked={dropPua} onChange={(e) => setDropPua(e.target.checked)} />删私有区</label>
          <label className="ul-opt"><input type="checkbox" checked={keepIdeo} onChange={(e) => setKeepIdeo(e.target.checked)} />保留全角空格</label>
        </div>
        {error && <div className="ul-verdict high"><b>出错</b>：{error}</div>}
        {scan && (
          <>
            <div className={`ul-verdict ${scan.verdict}`}>
              <b>{VERDICT_TEXT[scan.verdict]}</b>
              {` ｜ 高危 ${scan.riskCounts.high} / 中危 ${scan.riskCounts.medium} / 提示 ${scan.riskCounts.low}`}
            </div>
            {scan.hiddenMessages.length > 0 && (
              <div className="ul-hidden">
                🔍 Tag 隐形标签解码出隐藏内容（人眼不可见、AI 可读）：{scan.hiddenMessages.map((m, i) => `"${m}"`).join('；')}
              </div>
            )}
            <div className="ul-chips">
              {core.CAT_ORDER.filter((c: string) => (scan.counts as Record<string, number>)[c] > 0).map((c: string) => {
                const meta = (core.CATS as Record<string, { risk: string; title: string }>)[c]
                return (
                  <span key={c} className={`ul-chip ${meta.risk}`}>
                    {meta.title} ×{(scan.counts as Record<string, number>)[c]}
                  </span>
                )
              })}
            </div>
            {segs && (
              <div className="ul-hl">
                {segs.segs.map((s, i) =>
                  s.f ? (
                    isMarkerCat(s.f.cat)
                      ? <span key={i} className={`ul-m mk ${s.f.risk}`} title={`行${s.f.line}列${s.f.col} ${s.f.cp} ${s.f.name}`}>{`{${s.f.cp}}`}</span>
                      : <span key={i} className={`ul-m ${s.f.risk}`} title={`行${s.f.line}列${s.f.col} ${s.f.name}${s.f.suggest ? ` 建议"${s.f.suggest}"` : ''}`}>{s.text}</span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
                {segs.truncated && <div className="ul-note">（仅可视化前 {DISPLAY_CAP} 字符）</div>}
              </div>
            )}
            {report && (
              <div className="ul-report">{report}</div>
            )}
            {props.onSendToChat && (
              <div className="ul-btnrow">
                <button className="ul-btn" onClick={sendReport}>发送报告到对话</button>
              </div>
            )}
          </>
        )}
        {scrubbed && (
          <>
            <div className="ul-sec">清洗结果：{Object.entries(scrubbed.deleted).map(([k, v]) => `删 ${(core.CATS as Record<string, { title: string }>)[k]?.title || k}×${v}`).join('，') || '无删除'}{scrubbed.homoglyphFixed ? `，同形字映射 ${scrubbed.homoglyphFixed} 处` : ''}{scrubbed.normalized ? '，已 NFC 归一化' : ''}</div>
            <textarea
              className="ul-area"
              readOnly
              value={scrubbed.cleaned}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="ul-btnrow">
              <button className="ul-btn" onClick={() => { setInput(scrubbed.cleaned); setScrubbed(null); setScanned('') }}>替换输入</button>
              <button className="ul-btn" onClick={() => { try { void navigator.clipboard?.writeText(scrubbed.cleaned) } catch (_) { /* 剪贴板不可用则忽略 */ } }}>复制</button>
            </div>
          </>
        )}
        <div className="ul-note">
          检测域：双向控制字符（Trojan Source CVE-2021-42574）· Unicode Tag 隐形标签（提示词隐形注入载体）· 零宽字符 · 不可见填充 · 变体选择符 · 控制字符 ·
          同形异码字（西里尔/希腊/全角/数学变体）· 混合文字系统 · NFC 未归一化 · U+FFFD 编码损坏。
          emoji 序列中的零宽连接符自动豁免；全角空格/全角标点在中文语境默认不视为风险。清洗默认只删不改语义（同形字需勾选映射）。
        </div>
      </div>
    </div>
  )
}
