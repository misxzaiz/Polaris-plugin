// 时间戳转换：实时时钟 + 双向转换（自动识别 s/ms/μs/ns）
import { useEffect, useState } from 'react'
import { analyzeTimestamp, dateInputToEpochMs, nowInfo, relativeTime, type TimeUnit } from '../core'
import { CopyBtn, Input, L, Note, Out, Select } from '../ui'

export function TimeTool() {
  const [now, setNow] = useState(() => nowInfo())
  const [ts, setTs] = useState('')
  const [unit, setUnit] = useState<TimeUnit>('auto')
  const [dateVal, setDateVal] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(nowInfo()), 1000)
    return () => clearInterval(t)
  }, [])

  const info = ts.trim() === '' ? null : analyzeTimestamp(ts, unit)
  const pickedMs = dateVal === '' ? null : dateInputToEpochMs(dateVal)
  const pickedRel = pickedMs !== null ? relativeTime(pickedMs) : null

  return (
    <div>
      <div className="dtb-section">
        <b>当前时间（每秒刷新）</b>
        <L label="Unix 秒"><span className="dtb-mono">{now.seconds}</span><CopyBtn text={String(now.seconds)} /></L>
        <L label="Unix 毫秒"><span className="dtb-mono">{now.millis}</span><CopyBtn text={String(now.millis)} /></L>
        <L label="ISO UTC"><span className="dtb-mono">{now.isoUtc}</span><CopyBtn text={now.isoUtc} /></L>
        <L label="本地"><span className="dtb-mono">{now.localReadable}</span><CopyBtn text={now.localReadable} /></L>
      </div>

      <div className="dtb-section">
        <b>时间戳 → 日期</b>
        <div className="dtb-row dtb-mt4">
          <Input value={ts} onChange={setTs} placeholder="粘贴时间戳（自动识别秒/毫秒/微秒/纳秒）" mono />
          <Select
            value={unit}
            onChange={(v) => setUnit(v as TimeUnit)}
            options={[
              { value: 'auto', label: '自动识别' },
              { value: 's', label: '按秒' },
              { value: 'ms', label: '按毫秒' },
            ]}
          />
        </div>
        {info && !info.ok ? <Note kind="error">{info.error}</Note> : null}
        {info && info.ok ? (
          <>
            <L label="判定单位"><span className="dtb-mono">{info.unit}</span></L>
            <L label="epoch 毫秒"><span className="dtb-mono">{info.epochMs}</span><CopyBtn text={String(info.epochMs)} /></L>
            <L label="ISO UTC"><span className="dtb-mono">{info.isoUtc}</span><CopyBtn text={info.isoUtc ?? ''} /></L>
            <L label="本地时间"><span className="dtb-mono">{info.localReadable}</span><CopyBtn text={info.localReadable ?? ''} /></L>
            <L label="相对"><span>{info.relative}</span></L>
          </>
        ) : null}
      </div>

      <div className="dtb-section">
        <b>日期 → 时间戳</b>
        <div className="dtb-row dtb-mt4">
          <input
            className="dtb-input dtb-mono"
            type="datetime-local"
            step="0.001"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
          />
        </div>
        {pickedMs !== null ? (
          <>
            <L label="Unix 秒"><span className="dtb-mono">{Math.floor(pickedMs / 1000)}</span><CopyBtn text={String(Math.floor(pickedMs / 1000))} /></L>
            <L label="Unix 毫秒"><span className="dtb-mono">{pickedMs}</span><CopyBtn text={String(pickedMs)} /></L>
            <L label="ISO UTC"><span className="dtb-mono">{new Date(pickedMs).toISOString()}</span><CopyBtn text={new Date(pickedMs).toISOString()} /></L>
            <L label="相对"><span>{pickedRel}</span></L>
          </>
        ) : null}
      </div>
      <Out text="" />
    </div>
  )
}
