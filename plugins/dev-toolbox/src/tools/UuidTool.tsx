// UUID 工具：批量生成（v4 密码学随机 / v7 时间有序单调）+ 解析
import { useEffect, useState } from 'react'
import { generateUuids, parseUuid } from '../core'
import { CopyBtn, Input, Note, Out, Select, SendBtn } from '../ui'

export function UuidTool() {
  const [version, setVersion] = useState<'v4' | 'v7'>('v4')
  const [count, setCount] = useState('5')
  const [list, setList] = useState<string[]>([])

  const generate = () => {
    const n = Number(count) || 1
    setList(generateUuids(n, version))
  }

  useEffect(generate, []) // 首次进入给一批

  const [parseInput, setParseInput] = useState('')
  const parsed = parseInput.trim() === '' ? null : parseUuid(parseInput)

  return (
    <div>
      <div className="dtb-row">
        <Select
          value={version}
          onChange={(v) => setVersion(v as 'v4' | 'v7')}
          options={[
            { value: 'v4', label: 'v4（密码学随机）' },
            { value: 'v7', label: 'v7（时间有序，可排序）' },
          ]}
        />
        <Input value={count} onChange={setCount} placeholder="数量（1-500）" type="number" />
        <button className="dtb-btn" onClick={generate}>
          生成
        </button>
        {list.length > 0 ? <CopyBtn text={list.join('\n')} label="全部复制" /> : null}
        {list.length > 0 ? <SendBtn text={list.join('\n')} /> : null}
      </div>
      <Out text={list.join('\n')} rows={12} />
      <Note kind="info">
        v4 使用 crypto.getRandomValues（或 randomUUID）；v7 含 48bit 毫秒时间戳，同一毫秒内单调递增，适合做数据库主键。
      </Note>
      <div className="dtb-mt8">
        <b>解析 UUID</b>
        <div className="dtb-row dtb-mt4">
          <Input value={parseInput} onChange={setParseInput} placeholder="粘贴 UUID（支持花括号形式）" mono />
        </div>
        {parsed && !parsed.ok ? <Note kind="error">{parsed.error}</Note> : null}
        {parsed && parsed.ok ? (
          <Note kind="ok">
            合法 · 版本 {parsed.version} · 变体 {parsed.variant}
            {parsed.canonical ? <span className="dtb-dim"> · 标准形 {parsed.canonical}</span> : null}
          </Note>
        ) : null}
      </div>
    </div>
  )
}
