// 进制转换：2-36 任意进制 → 常用进制 + 位长；BigInt 支持超大整数
import { useMemo, useState } from 'react'
import { convertRadix } from '../core'
import { CopyBtn, Input, Note, Select } from '../ui'

export function RadixTool() {
  const [text, setText] = useState('')
  const [from, setFrom] = useState('10')

  const r = useMemo(() => (text.trim() === '' ? null : convertRadix(text, Number(from) || 10)), [text, from])

  const rows: Array<[string, string]> =
    r && r.ok
      ? [
          ['二进制 (2)', r.binary ?? ''],
          ['八进制 (8)', r.octal ?? ''],
          ['十进制 (10)', r.decimal ?? ''],
          ['十六进制 (16)', r.hex ?? ''],
          ['Base36', r.base36 ?? ''],
        ]
      : []

  return (
    <div>
      <div className="dtb-row">
        <span className="dtb-dim">源进制</span>
        <Select
          value={from}
          onChange={setFrom}
          options={[2, 8, 10, 16, 36].map((b) => ({ value: String(b), label: `${b} 进制` }))}
        />
        <Input value={text} onChange={setText} placeholder={`输入 ${from} 进制数值（支持负号与下划线分隔）`} mono />
      </div>
      {r && !r.ok ? <Note kind="error">{r.error}</Note> : null}
      {r && r.ok ? (
        <>
          <div className="dtb-caselist">
            {rows.map(([label, value]) => (
              <div className="dtb-caserow" key={label}>
                <span className="dtb-casealg">{label}</span>
                <span className="dtb-mono dtb-caseval">{value}</span>
                <CopyBtn text={value} />
              </div>
            ))}
          </div>
          <p className="dtb-dim">
            位长：{r.bitLength} bit{r.negative ? '（负数，位长按绝对值计）' : ''}；全程 BigInt，超过 Number.MAX_SAFE_INTEGER 也精确。
          </p>
        </>
      ) : null}
    </div>
  )
}
