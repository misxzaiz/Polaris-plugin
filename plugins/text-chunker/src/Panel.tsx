/**
 * LLM 文本切块台面板：长文本输入 → 切块结果（块列表+每块统计）。
 * 引擎复用 shared/chunk-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/chunk-core.js'

const CSS = `
.tc-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.tc-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tc-head b{font-size:13px}
.tc-head .sub{color:#5C6678;font-size:11px}
.tc-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.tc-label{color:#8B94A9;font-size:11px}
.tc-area{width:100%;min-height:160px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.tc-area:focus{border-color:#4fd1a0}
.tc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tc-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;width:120px;outline:none}
.tc-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.tc-btn:disabled{opacity:.5;cursor:not-allowed}
.tc-chk{display:flex;align-items:center;gap:5px;color:#8B94A9;font-size:12px;cursor:pointer}
.tc-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid #2f9e44;background:#12241a;color:#8ce0b0}
.tc-block{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.tc-block h4{margin:0;padding:6px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030;display:flex;justify-content:space-between}
.tc-block pre{margin:0;padding:10px 12px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c9cede;max-height:240px;overflow:auto}
.tc-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function TextChunkerPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [maxTokens, setMaxTokens] = useState('800')
  const [overlap, setOverlap] = useState('0')
  const [checked, setChecked] = useState<{ t: string; max: number; ov: number } | null>(null)
  const [onlyBlocks, setOnlyBlocks] = useState(false)

  const result = useMemo(() => {
    if (!checked) return null
    return core.chunkText(checked.t, { maxTokens: checked.max, overlapTokens: checked.ov })
  }, [checked])

  const run = () => {
    if (!text.trim()) return
    const max = Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : 800
    const ov = Number.isFinite(Number(overlap)) ? Number(overlap) : 0
    setChecked({ t: text, max, ov })
  }

  const copyBlock = (blockText: string) => {
    void navigator.clipboard?.writeText(blockText)
  }

  return (
    <div className="tc-root">
      <style>{CSS}</style>
      <div className="tc-head">
        <b>LLM 文本切块台</b>
        <span className="sub">边界贪心切块 · 重叠窗口 · token 估算 · 纯本地</span>
      </div>
      <div className="tc-body">
        <div className="tc-label">长文本</div>
        <textarea
          className="tc-area"
          placeholder="粘贴要喂给 LLM 的长文档……（段落间空行分隔效果最佳）"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="tc-row">
          <span className="tc-label">每块上限</span>
          <input className="tc-input" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="800" />
          <span className="tc-label">重叠 tokens</span>
          <input className="tc-input" value={overlap} onChange={(e) => setOverlap(e.target.value)} placeholder="0" />
          <label className="tc-chk"><input type="checkbox" checked={onlyBlocks} onChange={(e) => setOnlyBlocks(e.target.checked)} /> 只看统计</label>
          <button className="tc-btn" onClick={run} disabled={!text.trim()}>切块</button>
        </div>
        {result && (
          <>
            <div className="tc-verdict">
              共 {result.chunks.length} 块 · 全文估算 {result.totalTokens} tokens
            </div>
            {result.chunks.map((c) => (
              <div className="tc-block" key={c.index}>
                <h4>
                  <span>块 {c.index}</span>
                  <span>{c.tokens} tokens <button className="tc-btn" style={{ padding: '2px 8px', marginLeft: 8 }} onClick={() => copyBlock(c.text)}>复制</button></span>
                </h4>
                {!onlyBlocks && <pre>{c.text}</pre>}
              </div>
            ))}
          </>
        )}
        <div className="tc-note">
          切块优先级：段落（空行）→ 句子（。！？.!?）→ 硬切（无句读长文最后手段）。
          token 估算为启发式口径（CJK≈1 token/字、拉丁≈1 token/4 字符），<b>非精确 tokenizer</b>——预算敏感场景请留 10-20% 余量。
          overlap 重叠窗口把块尾内容复制到下一块头，防语义断裂。
        </div>
      </div>
    </div>
  )
}
