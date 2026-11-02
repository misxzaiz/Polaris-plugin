// 命名风格互转：一次给出十种风格
import { useMemo, useState } from 'react'
import { convertCase } from '../core'
import { Area, CopyBtn } from '../ui'

export function CaseTool() {
  const [text, setText] = useState('')
  const r = useMemo(() => (text.trim() === '' ? null : convertCase(text)), [text])

  const rows: Array<[string, string]> = r
    ? [
        ['camelCase', r.camel],
        ['PascalCase', r.pascal],
        ['snake_case', r.snake],
        ['CONSTANT_CASE', r.constant],
        ['kebab-case', r.kebab],
        ['Train-Case', r.train],
        ['dot.case', r.dot],
        ['Title Case', r.title],
        ['lower case', r.lower],
        ['UPPER CASE', r.upper],
      ]
    : []

  return (
    <div>
      <Area value={text} onChange={setText} rows={3} placeholder="输入任意命名：camelCase / snake_case / kebab-case / 空格分词均可" />
      {r ? (
        <>
          <p className="dtb-dim">
            切词结果：{r.words.length > 0 ? r.words.map((w, i) => (i === 0 ? w : ' · ' + w)) : '（无）'}
          </p>
          <div className="dtb-caselist">
            {rows.map(([label, value]) => (
              <div className="dtb-caserow" key={label}>
                <span className="dtb-casealg">{label}</span>
                <span className="dtb-mono dtb-caseval">{value === '' ? <span className="dtb-dim">（空）</span> : value}</span>
                <CopyBtn text={value} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
