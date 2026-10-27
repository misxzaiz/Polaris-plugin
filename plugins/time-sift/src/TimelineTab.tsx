/**
 * TimelineTab —— 时光机：按天分组的会话列表（目录直读 kv 分块，服务离线可浏览）
 *
 * 筛选：标题子串 + 来源；分批展示天（每批 14 天）防长列表卡顿（移动端友好）。
 */
import { useEffect, useMemo, useState } from 'react'
import { readCatalog, SOURCE_LABEL, type SiftEntry, type SiftSource } from './model'
import SessionReader from './SessionReader'

const PAGE_DAYS = 14

const SRC_CHIPS: Array<[SiftSource | '', string]> = [
  ['', '全部'],
  ['polaris', 'Polaris'],
  ['v2', '会话v2'],
  ['claude', 'Claude'],
  ['zcode', 'ZCode'],
]

function localDayKey(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmtDay(day: string): string {
  const d = new Date(day + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return day
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const today = localDayKey(Date.now())
  if (day === today) return `今天 · ${day} ${week}`
  return `${day} ${week}`
}

export default function TimelineTab() {
  const [catalog, setCatalog] = useState<SiftEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState<SiftSource | ''>('')
  const [limitDays, setLimitDays] = useState(PAGE_DAYS)
  const [openSid, setOpenSid] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const list = await readCatalog()
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setCatalog(list)
      setLoading(false)
    })()
  }, [])

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const filtered = catalog.filter((e) => {
      if (source && e.source !== source) return false
      if (f && !(e.title || '').toLowerCase().includes(f)) return false
      return true
    })
    const byDay = new Map<string, SiftEntry[]>()
    for (const e of filtered) {
      const day = localDayKey(e.updatedAt)
      if (!day) continue
      const arr = byDay.get(day) || (byDay.set(day, []), byDay.get(day))
      if (arr) arr.push(e)
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, sessions]) => ({ day, sessions }))
  }, [catalog, filter, source])

  if (openSid) {
    return <SessionReader sid={openSid} onClose={() => setOpenSid(null)} />
  }

  const shown = groups.slice(0, limitDays)

  return (
    <>
      <div className="ts-card">
        <div className="ts-card-b">
          <div className="ts-row">
            <input
              className="ts-inp"
              style={{ flex: 1, minWidth: 140 }}
              placeholder="按标题过滤…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {SRC_CHIPS.map(([k, label]) => (
              <button key={k || 'all'} className={`ts-chip ${source === k ? 'on' : ''}`} onClick={() => setSource(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="ts-empty">
          <span className="ts-spin" /> 读取目录…
        </div>
      )}
      {!loading && catalog.length === 0 && (
        <div className="ts-empty">
          <b>目录还没有数据</b>
          服务完成首次扫描后，这里按天列出所有会话。
        </div>
      )}
      {!loading && catalog.length > 0 && groups.length === 0 && (
        <div className="ts-empty">
          <b>没有匹配的会话</b>
          换个过滤词，或放宽来源筛选。
        </div>
      )}

      {shown.map(({ day, sessions }) => (
        <div key={day}>
          <div className="ts-sec">
            <span className="ts-bar" /> {fmtDay(day)}
            <span className="ts-hint">{sessions.length} 个会话</span>
          </div>
          {sessions.map((e) => (
            <div key={e.sid} className="ts-card ts-hit" onClick={() => setOpenSid(e.sid)}>
              <div className="ts-card-b">
                <div className="ts-row">
                  <b style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</b>
                  <span className={`ts-tag ${e.source}`}>{SOURCE_LABEL[e.source] || e.source}</span>
                </div>
                <div className="ts-sub" style={{ marginTop: 4 }}>
                  {e.msgCount} 条消息 · {e.proseChars > 0 ? `${(e.proseChars / 1000).toFixed(1)}k 字对话` : ''}
                  {e.workspace ? ` · ${e.workspace}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {groups.length > shown.length && (
        <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
          <button className="ts-btn ghost" onClick={() => setLimitDays(limitDays + PAGE_DAYS)}>
            再看 {Math.min(PAGE_DAYS, groups.length - shown.length)} 天（还有 {groups.length - shown.length} 天）
          </button>
        </div>
      )}
    </>
  )
}
