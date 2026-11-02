// JSON 工具：格式化/压缩/校验（错误行列定位）/深度键排序
import { useMemo, useState } from 'react'
import { formatJson } from '../core'
import { Area, Check, CopyBtn, Note, Out, SendBtn } from '../ui'

export function JsonTool() {
  const [text, setText] = useState('')
  const [sortKeys, setSortKeys] = useState(false)
  const [minify, setMinify] = useState(false)
  const [indent, setIndent] = useState('2')

  const result = useMemo(
    () => (text.trim() === '' ? null : formatJson(text, { sortKeys, minify, indent: Number(indent) || 2 })),
    [text, sortKeys, minify, indent],
  )

  return (
    <div>
      <Area value={text} onChange={setText} rows={8} placeholder="粘贴 JSON" />
      <div className="dtb-row dtb-mt8">
        <Check checked={sortKeys} onChange={setSortKeys} label="深度键排序" />
        <Check checked={minify} onChange={setMinify} label="压缩（minify）" />
        <span className="dtb-dim">缩进</span>
        <select className="dtb-select" value={indent} onChange={(e) => setIndent(e.target.value)} disabled={minify}>
          <option value="2">2 空格</option>
          <option value="4">4 空格</option>
        </select>
      </div>
      {result === null ? null : !result.ok ? (
        <Note kind="error">
          {result.error}
          {result.errorLine !== undefined ? (
            <span className="dtb-dim"> —— 第 {result.errorLine} 行 第 {result.errorColumn ?? '?'} 列附近</span>
          ) : null}
        </Note>
      ) : (
        <>
          <div className="dtb-cardhead">
            <b>
              输出 <span className="dtb-dim">（{result.inputChars} → {result.outputChars} 字符）</span>
            </b>
            <span className="dtb-lactions">
              <CopyBtn text={result.output} />
              <SendBtn text={result.output} />
            </span>
          </div>
          <Out text={result.output} rows={18} />
        </>
      )}
    </div>
  )
}
