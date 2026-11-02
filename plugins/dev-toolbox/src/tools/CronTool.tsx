// Cron 工具：解析 + 中文描述 + 未来执行时间
import { useMemo, useState } from 'react'
import { analyzeCron } from '../core'
import { CopyBtn, Input, Note, SendBtn } from '../ui'

const PRESETS: Array<[string, string]> = [
  ['* * * * *', '每分钟'],
  ['*/5 * * * *', '每 5 分钟'],
  ['0 * * * *', '每小时整点'],
  ['30 8 * * *', '每天 08:30'],
  ['30 8 * * 1-5', '工作日 08:30'],
  ['0 0 1 * *', '每月 1 号零点'],
  ['0 9 * * 1,3,5', '一三五 09:00'],
]

export function CronTool() {
  const [expr, setExpr] = useState('')
  const info = useMemo(() => (expr.trim() === '' ? null : analyzeCron(expr, 5)), [expr])

  return (
    <div>
      <Input value={expr} onChange={setExpr} placeholder="Cron 表达式（5 段 分 时 日 月 周，或 6 段含秒）" mono />
      <div className="dtb-row dtb-wrap dtb-mt4">
        {PRESETS.map(([e, label]) => (
          <button key={e} className="dtb-mini" onClick={() => setExpr(e)} title={e}>
            {label}
          </button>
        ))}
      </div>
      {info && !info.ok ? <Note kind="error">{info.error}</Note> : null}
      {info && info.ok ? (
        <>
          {info.description ? (
            <Note kind="ok">
              {info.description}
              <span className="dtb-lactions">
                <SendBtn text={`Cron \`${expr}\`（${info.description}）\n未来执行：\n${(info.next ?? []).join('\n')}`} />
              </span>
            </Note>
          ) : null}
          <div className="dtb-section">
            <b>未来 5 次执行（本地时区）</b>
            <div className="dtb-nextlist">
              {(info.next ?? []).map((t) => (
                <div className="dtb-nextrow dtb-mono" key={t}>
                  {t}
                  <CopyBtn text={t} />
                </div>
              ))}
            </div>
          </div>
          <div className="dtb-section">
            <b>字段</b>
            <table className="dtb-table">
              <tbody>
                {info.hasSeconds ? (
                  <tr><td>秒</td><td className="dtb-mono">{info.fields?.second}</td></tr>
                ) : null}
                <tr><td>分</td><td className="dtb-mono">{info.fields?.minute}</td></tr>
                <tr><td>时</td><td className="dtb-mono">{info.fields?.hour}</td></tr>
                <tr><td>日（月内）</td><td className="dtb-mono">{info.fields?.dayOfMonth}</td></tr>
                <tr><td>月</td><td className="dtb-mono">{info.fields?.month}</td></tr>
                <tr><td>周</td><td className="dtb-mono">{info.fields?.dayOfWeek}</td></tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
