/**
 * 时间与时区调试台面板：多格式解析解读 + 多时区投影 + 墙钟消解（DST 空洞/歧义判定）
 *   + 日历/精确双口径算术 + 全格式输出与 round-trip 自证。
 * 引擎复用 shared/datetime-core.js（与 MCP 同一权威；纯本地零外联零 kv）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/datetime-core.js'

const CSS = `
.dtl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dtl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dtl-head b{font-size:13px}
.dtl-head .sub{color:#5C6678;font-size:11px}
.dtl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.dtl-input{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none}
.dtl-input:focus{border-color:#4fd1a0}
.dtl-input.sm{width:150px}
.dtl-chips{display:flex;gap:6px;flex-wrap:wrap}
.dtl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.dtl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.dtl-chip.on{color:#4fd1a0;border-color:#4fd1a0}
.dtl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.dtl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.dtl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.dtl-kv{display:flex;gap:10px;padding:3px 12px;font-size:12px}
.dtl-kv .k{color:#5C6678;min-width:110px;flex-shrink:0}
.dtl-kv .v{font-family:ui-monospace,Consolas,monospace;color:#c9cede;word-break:break-all}
.dtl-kv .v.grn{color:#4fd1a0}
.dtl-warnitem{padding:4px 12px;font-size:11.5px;line-height:1.6}
.dtl-warnitem.warn{color:#f3b377}
.dtl-warnitem.err{color:#f1a0a0}
.dtl-warnitem.info{color:#8B94A9}
.dtl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.dtl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.dtl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.dtl-ok{color:#4fd1a0}
.dtl-bad{color:#f1a0a0}
.dtl-warn{color:#f3b377}
.dtl-note{color:#5C6678;font-size:11px;line-height:1.6;padding:4px 12px 8px}
.dtl-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:6px 12px}
.dtl-lbl{color:#5C6678;font-size:11px}
.dtl-verdict{padding:8px 12px;font-size:12.5px;line-height:1.7}
.dtl-verdict.unique{color:#4fd1a0}
.dtl-verdict.amb{color:#f3b377}
.dtl-verdict.gap{color:#f1a0a0}
.dtl-mono{font-family:ui-monospace,Consolas,monospace}
`

const TEXT_PRESETS: Array<{ t: string; z?: string }> = [
  { t: 'now' },
  { t: '2026-11-04T08:00:00+08:00' },
  { t: '2026-11-04' },            // date-only UTC 坑
  { t: '2026-03-08T02:30:00', z: 'America/New_York' },   // DST 空洞
  { t: '2026-11-01T01:30:00', z: 'America/New_York' },   // DST 歧义
  { t: '1762212000' },            // unix 秒
  { t: '1762212000123' },         // unix 毫秒
  { t: '1762212000000000000' },   // unix 纳秒
  { t: 'Wed, 04 Nov 2026 08:00:00 GMT' }, // HTTP 日期（星期名与日期不符样本）
  { t: '26 Nov 26 08:00:00 GMT' },        // 两位年
]

const COMMON_ZONES = [
  'UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dubai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Chatham', 'Pacific/Marquesas', 'Australia/Lord_Howe',
]

const PIT_ICON: Record<string, string> = { warn: '⚠️', error: '⛔', info: 'ℹ️' }

function fmtWall(w: { y: number; mo: number; d: number; h: number; mi: number; s: number }) {
  return `${core.pad4(w.y)}-${core.pad2(w.mo)}-${core.pad2(w.d)} ${core.pad2(w.h)}:${core.pad2(w.mi)}:${core.pad2(w.s)}`
}

export default function DateTimeLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void; initialText?: string; initialZone?: string }) {
  const local = useMemo(() => core.localZone(), [])
  const [text, setText] = useState((_props && _props.initialText) || '2026-11-04T08:00:00+08:00')
  const [interpZone, setInterpZone] = useState((_props && _props.initialZone) || local)
  const [zones, setZones] = useState<string[]>(['UTC', 'Asia/Shanghai', 'America/New_York', 'Australia/Lord_Howe'])
  const [wallDate, setWallDate] = useState('2026-03-08')
  const [wallTime, setWallTime] = useState('02:30')
  const [wallZone, setWallZone] = useState('America/New_York')
  const [amount, setAmount] = useState({ years: 0, months: 0, days: 1, hours: 0, minutes: 0, seconds: 0 })
  const [amountZone, setAmountZone] = useState('America/New_York')

  const allZones = useMemo(() => {
    const set = zones.slice()
    if (set.indexOf(local) === -1 && COMMON_ZONES.indexOf(local) !== -1) set.push(local)
    return set
  }, [zones, local])

  const view = useMemo(() => {
    const r = core.analyze(text, { zone: interpZone })
    if (!r.ok) return { parseError: r.error } as const
    const formats = r.instant ? core.formatAll(r.instant.ms, interpZone) : null
    return { r, formats } as const
  }, [text, interpZone])

  const wallView = useMemo(() => {
    const mD = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wallDate.trim())
    const mT = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallTime.trim())
    if (!mD || !mT || !core.isValidZone(wallZone)) return { error: '日期需 YYYY-MM-DD、时间需 HH:MM[:SS]、时区需 IANA 名' } as const
    const rv = core.resolveWall({
      y: parseInt(mD[1], 10), mo: parseInt(mD[2], 10), d: parseInt(mD[3], 10),
      h: parseInt(mT[1], 10), mi: parseInt(mT[2], 10), s: mT[3] ? parseInt(mT[3], 10) : 0,
    }, wallZone)
    return { rv } as const
  }, [wallDate, wallTime, wallZone])

  const arithView = useMemo(() => {
    if (!('r' in view) || !view.r.ok || !view.r.instant) return null
    const total = Object.values(amount).reduce((a, b) => a + Math.abs(b), 0)
    if (total === 0) return null
    return core.addDuration(view.r.instant.ms, amount, core.isValidZone(amountZone) ? amountZone : local, 'both')
  }, [view, amount, amountZone, local])

  const toggleZone = (z: string) => {
    setZones((prev) => (prev.indexOf(z) === -1 ? prev.concat([z]) : prev.filter((x) => x !== z)))
  }

  return (
    <div className="dtl-root">
      <style>{CSS}</style>
      <div className="dtl-head">
        <b>时间与时区调试台</b>
        <span className="sub">多格式解析 · 时区投影 · DST 空洞/歧义判定 · 双口径算术 · 自研语法与 Intl/ICU 差分对拍</span>
      </div>
      <div className="dtl-body">
        <div>
          <div className="dtl-chips" style={{ marginBottom: 6 }}>
            {TEXT_PRESETS.map((p) => (
              <span key={p.t} className="dtl-chip" onClick={() => { setText(p.t); if (p.z) setInterpZone(p.z) }}>{p.t}</span>
            ))}
          </div>
          <input
            className="dtl-input"
            value={text}
            placeholder={'日期时间原文：ISO 8601 / Unix 时间戳 / RFC 2822 / HTTP 日期 / now'}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="dtl-row" style={{ paddingLeft: 0 }}>
            <span className="dtl-lbl">解读时区（date-only / 无偏移形态按此消解）</span>
            <select
              className="dtl-input"
              style={{ width: 240 }}
              value={interpZone}
              onChange={(e) => setInterpZone(e.target.value)}
            >
              {(COMMON_ZONES.indexOf(interpZone) === -1 ? [interpZone].concat(COMMON_ZONES) : COMMON_ZONES).map((z) => (
                <option key={z} value={z}>{z}{z === local ? '（本地）' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {'parseError' in view && <div className="dtl-err">无法解析：{view.parseError}</div>}

        {'r' in view && view.r.ok && (
          <>
            <div className="dtl-card">
              <h3>解读（引擎 vs JS Date.parse 差分）</h3>
              <div className="dtl-kv"><span className="k">形态</span><span className="v">{view.r.kindText}</span></div>
              {view.r.unit && <div className="dtl-kv"><span className="k">单位判定</span><span className="v">{view.r.unit}</span></div>}
              {view.r.instant && (
                <>
                  <div className="dtl-kv"><span className="k">权威瞬间</span><span className="v grn">{view.r.instant.isoUtc}</span></div>
                  <div className="dtl-kv"><span className="k">epoch</span><span className="v">{view.r.instant.ms} ms</span></div>
                </>
              )}
              {view.r.isoWeek && <div className="dtl-kv"><span className="k">ISO 周日期</span><span className="v">{view.r.isoWeek}</span></div>}
              {view.r.js && (
                <div className="dtl-kv">
                  <span className="k">JS Date.parse</span>
                  <span className="v">{view.r.js.parseMs === null ? 'NaN（拒收）' : `${new Date(view.r.js.parseMs).toISOString()}${view.r.js.agrees ? '（一致）' : '（不一致！）'}`}</span>
                </div>
              )}
              {view.r.pits.map((p: any, i: number) => (
                <div key={i} className={`dtl-warnitem ${p.level === 'error' ? 'err' : p.level === 'info' ? 'info' : 'warn'}`}>
                  {PIT_ICON[p.level] || '⚠️'} {p.message}
                </div>
              ))}
            </div>

            {view.formats && (
              <div className="dtl-card">
                <h3>全格式输出（@{view.formats.zone} · round-trip 自证）</h3>
                <div className="dtl-kv"><span className="k">ISO 8601</span><span className="v grn">{view.formats.iso}</span></div>
                <div className="dtl-kv"><span className="k">RFC 2822</span><span className="v">{view.formats.rfc2822}</span></div>
                <div className="dtl-kv"><span className="k">HTTP 日期</span><span className="v">{view.formats.http}</span></div>
                <div className="dtl-kv"><span className="k">Unix</span><span className="v">{view.formats.unixSeconds} s · {view.formats.unixMillis} ms</span></div>
                <div className="dtl-kv"><span className="k">ISO 周 / 天序</span><span className="v">{view.formats.isoWeek} · D{view.formats.dayOfYear} · {view.formats.weekdayEn}</span></div>
              </div>
            )}

            {view.r.instant && (
              <div className="dtl-card">
                <h3>多时区投影</h3>
                <div className="dtl-row">
                  {COMMON_ZONES.map((z) => (
                    <span key={z} className={`dtl-chip${zones.indexOf(z) !== -1 ? ' on' : ''}`} onClick={() => toggleZone(z)}>{z}</span>
                  ))}
                </div>
                <table className="dtl-tbl">
                  <thead><tr><th>时区</th><th>墙钟</th><th>偏移</th><th>DST</th><th>星期</th></tr></thead>
                  <tbody>
                    {allZones.map((z) => {
                      const p = core.projectZone(view.r.instant!.ms, z)
                      return (
                        <tr key={z}>
                          <td>{z}{z === local ? '（本地）' : ''}</td>
                          <td>{fmtWall(p.wall)}</td>
                          <td>{core.fmtOffsetMin(p.offsetMin)}</td>
                          <td className={p.isDST ? 'dtl-warn' : ''}>{p.isDST ? '☀️ 是' : '否'}</td>
                          <td>{p.weekdayZh}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="dtl-card">
          <h3>墙钟消解（DST 空洞 / 歧义判定）</h3>
          <div className="dtl-row">
            <span className="dtl-lbl">日期</span>
            <input className="dtl-input sm" value={wallDate} onChange={(e) => setWallDate(e.target.value)} placeholder="2026-03-08" />
            <span className="dtl-lbl">时间</span>
            <input className="dtl-input sm" value={wallTime} onChange={(e) => setWallTime(e.target.value)} placeholder="02:30" />
            <span className="dtl-lbl">时区</span>
            <input className="dtl-input sm" style={{ width: 200 }} value={wallZone} onChange={(e) => setWallZone(e.target.value)} placeholder="America/New_York" />
            <span className="dtl-chip" onClick={() => { setWallDate('2026-03-08'); setWallTime('02:30'); setWallZone('America/New_York') }}>空洞样本</span>
            <span className="dtl-chip" onClick={() => { setWallDate('2026-11-01'); setWallTime('01:30'); setWallZone('America/New_York') }}>歧义样本</span>
          </div>
          {'error' in wallView && <div className="dtl-note dtl-bad">{wallView.error}</div>}
          {'rv' in wallView && wallView.rv && (
            <div className={`dtl-verdict ${wallView.rv.status === 'unique' ? 'unique' : wallView.rv.status === 'ambiguous' ? 'amb' : 'gap'}`}>
              {wallView.rv.status === 'unique' && wallView.rv.instantMs !== null && (
                <>✅ 唯一存在：{new Date(wallView.rv.instantMs).toISOString()}（偏移 {core.fmtOffsetMin(wallView.rv.offsetMin ?? 0)}）</>
              )}
              {wallView.rv.status === 'ambiguous' && wallView.rv.instantMs !== null && wallView.rv.secondInstantMs !== null && wallView.rv.transition !== null && (
                <>⚠️ 出现两次（时钟回拨）：第一次 {new Date(wallView.rv.instantMs).toISOString()}（{core.fmtOffsetMin(wallView.rv.offsetMin ?? 0)}）、第二次 {new Date(wallView.rv.secondInstantMs).toISOString()}（{core.fmtOffsetMin(wallView.rv.secondOffsetMin ?? 0)}）；切换瞬间 {new Date(wallView.rv.transition).toISOString()}</>
              )}
              {wallView.rv.status === 'gap' && wallView.rv.wallJustBefore !== null && wallView.rv.wallJustAfter !== null && wallView.rv.transition !== null && (
                <>⛔ 不存在（时钟前拨，跳过 {wallView.rv.skippedMinutes} 分钟）：墙钟 {fmtWall(wallView.rv.wallJustBefore)} 之后直接是 {fmtWall(wallView.rv.wallJustAfter)}；切换瞬间 {new Date(wallView.rv.transition).toISOString()}</>
              )}
            </div>
          )}
        </div>

        <div className="dtl-card">
          <h3>算术（日历口径 vs 精确口径）</h3>
          <div className="dtl-row">
            <span className="dtl-lbl">年</span>
            <input className="dtl-input sm" style={{ width: 60 }} value={amount.years} onChange={(e) => setAmount({ ...amount, years: Number(e.target.value) || 0 })} />
            <span className="dtl-lbl">月</span>
            <input className="dtl-input sm" style={{ width: 60 }} value={amount.months} onChange={(e) => setAmount({ ...amount, months: Number(e.target.value) || 0 })} />
            <span className="dtl-lbl">天</span>
            <input className="dtl-input sm" style={{ width: 60 }} value={amount.days} onChange={(e) => setAmount({ ...amount, days: Number(e.target.value) || 0 })} />
            <span className="dtl-lbl">时</span>
            <input className="dtl-input sm" style={{ width: 60 }} value={amount.hours} onChange={(e) => setAmount({ ...amount, hours: Number(e.target.value) || 0 })} />
            <span className="dtl-lbl">分</span>
            <input className="dtl-input sm" style={{ width: 60 }} value={amount.minutes} onChange={(e) => setAmount({ ...amount, minutes: Number(e.target.value) || 0 })} />
            <span className="dtl-lbl">秒</span>
            <input className="dtl-input sm" style={{ width: 60 }} value={amount.seconds} onChange={(e) => setAmount({ ...amount, seconds: Number(e.target.value) || 0 })} />
            <span className="dtl-lbl">@时区</span>
            <input className="dtl-input sm" style={{ width: 200 }} value={amountZone} onChange={(e) => setAmountZone(e.target.value)} />
          </div>
          {arithView === null && <div className="dtl-note">解读成功后，给至少一个非零算术量即可看双口径结果</div>}
          {arithView && !arithView.ok && <div className="dtl-note dtl-bad">{arithView.error}</div>}
          {arithView && arithView.ok && (
            <div className="dtl-verdict unique">
              {arithView.calendar && (
                <div>📅 日历口径：{new Date(arithView.calendar.instantMs).toISOString()}<br />
                  <span style={{ fontSize: 11, color: '#8B94A9' }}>{arithView.calendar.note || '无 DST 干扰'}</span>
                </div>
              )}
              {arithView.exact && <div style={{ marginTop: 4 }}>⏱️ 精确口径：{new Date(arithView.exact.instantMs).toISOString()}（{arithView.exact.realDeltaMs / 1000} 秒）</div>}
              {arithView.differ === true && <div style={{ marginTop: 4 }} className="dtl-warn">⚠️ 两口径相差 {(arithView.calendar!.instantMs - arithView.exact!.instantMs) / 60000} 分钟（DST 边界）</div>}
              {arithView.pits.map((p: any, i: number) => (
                <div key={i} className={`dtl-warnitem ${p.level === 'error' ? 'err' : p.level === 'info' ? 'info' : 'warn'}`}>
                  {PIT_ICON[p.level] || '⚠️'} {p.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dtl-note">
          引擎权威 = 自研严格语法 + Intl/ICU 时区数据（与宿主同源）；时区历史变迁完整库不在范围（pre-1970 LMT 秒级偏移按分钟粒度可能失真，会如实标注）。
        </div>
      </div>
    </div>
  )
}
