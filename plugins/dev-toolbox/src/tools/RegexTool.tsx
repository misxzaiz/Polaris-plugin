// 正则测试：实时匹配（下标高亮，React 文本节点渲染）、捕获组表、替换预览
import { useMemo, useState } from 'react'
import { previewReplace, testRegex } from '../core'
import { Area, Check, Input, Note } from '../ui'

const FLAGS: Array<{ f: string; label: string; title: string }> = [
  { f: 'g', label: 'g 全局', title: '全局匹配（替换时全部替换）' },
  { f: 'i', label: 'i 忽略大小写', title: '忽略大小写' },
  { f: 'm', label: 'm 多行', title: '^ $ 匹配每行边界' },
  { f: 's', label: 's dotAll', title: '让 . 匹配换行符（默认不匹配）' },
  { f: 'u', label: 'u unicode', title: 'Unicode 模式' },
  { f: 'y', label: 'y 粘滞', title: 'sticky，从 lastIndex 起匹配' },
]

export function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')
  const [replacement, setReplacement] = useState('')

  const toggleFlag = (f: string) => {
    setFlags((cur) => (cur.includes(f) ? cur.replace(f, '') : cur + f))
  }

  const active = useMemo(
    () => (pattern === '' ? null : testRegex(pattern, flags, text)),
    [pattern, flags, text],
  )
  const rep = useMemo(
    () => (active && active.ok ? previewReplace(pattern, flags, text, replacement) : null),
    [active, pattern, flags, text, replacement],
  )

  return (
    <div>
      <div className="dtb-row">
        <span className="dtb-dim">/</span>
        <Input value={pattern} onChange={setPattern} placeholder="正则表达式（无需斜杠包裹）" mono />
        <span className="dtb-dim">/{flags}</span>
      </div>
      <div className="dtb-row dtb-mt4">
        {FLAGS.map((f) => (
          <Check key={f.f} checked={flags.includes(f.f)} onChange={() => toggleFlag(f.f)} label={f.label} title={f.title} />
        ))}
      </div>
      <div className="dtb-mt8">
        <Area value={text} onChange={setText} rows={6} placeholder="测试文本" />
      </div>

      {active && !active.ok ? <Note kind="error">{active.error}</Note> : null}
      {active && active.ok ? (
        <>
          <div className="dtb-badges">
            <span className="dtb-badge dtb-badge-ok">匹配 {active.matches.length} 处</span>
            {active.truncated ? <span className="dtb-badge dtb-badge-warn">已达上限 500，结果截断</span> : null}
          </div>
          <div className="dtb-hl dtb-mono">
            {active.segments.map((seg, i) =>
              seg.isMatch ? (
                <mark key={i} className={`dtb-mark${seg.zeroLength ? ' dtb-mark-zero' : ''}`}>
                  {seg.text === '' ? '⌀' : seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
            {text === '' ? <span className="dtb-dim">（输入测试文本后显示高亮）</span> : null}
          </div>
          {active.matches.length > 0 ? (
            <table className="dtb-table dtb-mt8">
              <thead>
                <tr>
                  <th>#</th>
                  <th>位置</th>
                  <th>匹配</th>
                  <th>捕获组</th>
                </tr>
              </thead>
              <tbody>
                {active.matches.map((m, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="dtb-mono">{m.index}</td>
                    <td className="dtb-mono">{m.match === '' ? '⌀（零长）' : m.match}</td>
                    <td className="dtb-mono">
                      {Object.keys(m.namedGroups).length > 0 ? (
                        <div>
                          {Object.entries(m.namedGroups).map(([k, v]) => (
                            <div key={k}>&lt;{k}&gt;: {v === undefined ? '（未匹配）' : v}</div>
                          ))}
                        </div>
                      ) : null}
                      {m.groups.map((g, gi) => (
                        <div key={gi}>${gi + 1}: {g === null ? '（未匹配）' : g}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="dtb-mt8">
            <div className="dtb-row">
              <Input value={replacement} onChange={setReplacement} placeholder="替换为（支持 $1 $&lt;name&gt; $& 等）" mono />
            </div>
            {replacement !== '' && rep ? (
              rep.ok ? (
                <>
                  <div className="dtb-cardhead"><b>替换预览</b></div>
                  <pre className="dtb-out dtb-mono">{rep.output === '' ? <span className="dtb-dim">（空）</span> : rep.output}</pre>
                </>
              ) : (
                <Note kind="error">{rep.error}</Note>
              )
            ) : null}
          </div>
          <Note kind="info">
            JS 方言：`.` 默认不匹配换行（要 s 标志）；扫描列表始终展示全部潜在匹配，但「替换预览」严格遵循你勾选的标志（无 g 只替换第一处）。
          </Note>
        </>
      ) : null}
    </div>
  )
}
