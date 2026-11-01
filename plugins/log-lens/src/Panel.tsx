/**
 * 日志透视台面板：单屏工作台（文件选择 + 三维过滤 + 虚拟列表 + 详情抽屉 +
 * 透视统计 + 源管理）。数据面全部经宿主 cap.http → 本机服务（见 api.ts）。
 *
 * 视窗模型：entries 为「文件内一个字节窗口」的解析结果；
 *   - 初始 / 切过滤：tail（文件尾反读）
 *   - 向上翻：readBack（older offset 反读）prepend
 *   - Live：watch 增量 append（rotate 自动重新 tail）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, resolvePort, type FileInfo, type LogEntry, type StatsResp, type Filters } from './api'
import { kvGet, kvSet } from './host'

const ROW_H = 26
const PAGE = 300
const MAX_ENTRIES = 3000

const LEVEL_COLORS: Record<string, string> = {
  ERROR: '#f85149', FATAL: '#f85149', WARN: '#d29922',
  INFO: '#3fb950', DEBUG: '#58a6ff', TRACE: '#8b949e', CONT: '#6e7681',
}

/** 显示层脱敏（与 shared/core.maskSensitive 同规则的 TS 孪生；服务/MCP 侧权威实现不进 bundle） */
function maskSensitive(text: string): string {
  return String(text || '')
    .replace(/\b(bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***')
    .replace(/((?:token|key|secret|password|passwd|authorization|credential|apikey|api_key|access_token|refresh_token|signature|sig)["']?\s*[:=]\s*["']?)([^\s"',;&}]{8,})/gi, '$1***')
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().slice(11, 23)
}
function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return '?'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`
}
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const DEFAULT_FILTERS: Filters = { levels: [], q: '', regexOn: false }

export default function Panel({ pluginId }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  void pluginId
  const [booting, setBooting] = useState(true)
  const [svcError, setSvcError] = useState('')
  const [port, setPort] = useState<number | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [dataRoot, setDataRoot] = useState('')
  const [sources, setSources] = useState<Array<{ path: string; kind: string }>>([])
  const [file, setFile] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [filterDraft, setFilterDraft] = useState('')
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [oldestOffset, setOldestOffset] = useState(0)
  const [bottomOffset, setBottomOffset] = useState(0)
  const [bofReached, setBofReached] = useState(false)
  const [live, setLive] = useState(false)
  const [liveInterval, setLiveInterval] = useState(1500)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const [contextMode, setContextMode] = useState(false)
  const [stats, setStats] = useState<StatsResp | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [meta, setMeta] = useState<{ format?: string; encoding?: string; fileSize?: number }>({})
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const listRef = useRef<HTMLDivElement | null>(null)
  const liveTimer = useRef<number | undefined>(undefined)
  const stateRef = useRef({ file: '', bottomOffset: 0, filters: DEFAULT_FILTERS })
  stateRef.current = { file, bottomOffset, filters }

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  // ── 数据加载 ──────────────────────────────────────────────────────────────
  const applyWindow = useCallback((r: { entries: LogEntry[]; bofReached?: boolean; oldestOffset?: number; format?: string; encoding?: string; fileSize?: number }, replace: boolean) => {
    setMeta({ format: r.format, encoding: r.encoding, fileSize: r.fileSize })
    setEntries((prev) => {
      const base = replace ? [] : prev
      const seen = new Set(base.map((e) => e.offset))
      const merged = [...base, ...r.entries.filter((e) => !seen.has(e.offset))]
      merged.sort((a, b) => a.offset - b.offset)
      if (merged.length > MAX_ENTRIES) {
        const drop = merged.length - MAX_ENTRIES
        merged.splice(0, drop)
        setBofReached(false)
      }
      setOldestOffset(merged.length ? merged[0].offset : 0)
      setBottomOffset(merged.length ? merged[merged.length - 1].endOffset : 0)
      return merged
    })
    if (r.bofReached !== undefined) setBofReached(r.bofReached)
  }, [])

  const loadFile = useCallback(async (f: string, fl: Filters) => {
    if (!f) return
    try {
      const r = await api.tail(f, PAGE, fl)
      setSvcError('')
      applyWindow({ ...r, entries: r.entries || [] }, true)
    } catch (e) {
      setSvcError((e as Error).message)
    }
  }, [applyWindow])

  const reloadSources = useCallback(async (prefer?: string) => {
    try {
      const r = await api.sources()
      setFiles(r.files || [])
      setDataRoot(r.dataRoot || '')
      setSources(r.settings?.sources || [])
      if (r.settings?.liveIntervalMs) setLiveInterval(r.settings.liveIntervalMs)
      setPort(await resolvePort())
      setSvcError('')
      // 文件选择：显式 prefer > kv 记住的 lastFile > 列表第一个
      const ui = await kvGet<{ lastFile?: string }>('lls.ui')
      const next = prefer || ui?.lastFile || ''
      const exists = next && (r.files || []).some((f) => f.path === next)
      const finalFile = exists ? next : ((r.files || [])[0]?.path || '')
      setFile((cur) => {
        const keep = cur && (r.files || []).some((f) => f.path === cur) ? cur : finalFile
        if (keep !== cur) void loadFile(keep, filters)
        return keep
      })
    } catch (e) {
      setSvcError((e as Error).message)
    } finally {
      setBooting(false)
    }
  }, [filters, loadFile])

  useEffect(() => { void reloadSources() }, [reloadSources])

  // 切换文件：记住选择 + 重载
  const switchFile = useCallback((f: string) => {
    setFile(f)
    setSelected(null)
    setContextMode(false)
    setStats(null)
    void kvSet('lls.ui', { lastFile: f })
    void loadFile(f, filters)
  }, [filters, loadFile])

  // 过滤条件应用
  const applyFilters = useCallback(() => {
    const f: Filters = { levels: filters.levels, q: filterDraft.trim(), regexOn: filters.regexOn }
    setFilters(f)
    setContextMode(false)
    void loadFile(file, f)
  }, [file, filterDraft, filters, loadFile])

  const clearFilters = useCallback(() => {
    setFilterDraft('')
    setFilters(DEFAULT_FILTERS)
    setContextMode(false)
    void loadFile(file, DEFAULT_FILTERS)
  }, [file, loadFile])

  // 加载更早
  const loadOlder = useCallback(async () => {
    if (!file || loadingOlder || bofReached) return
    setLoadingOlder(true)
    try {
      const r = await api.readBack(file, oldestOffset, PAGE, filters)
      applyWindow({ ...r, entries: r.entries || [] }, false)
    } catch (e) {
      showToast(`加载更早失败: ${(e as Error).message}`, 'bad')
    } finally {
      setLoadingOlder(false)
    }
  }, [applyWindow, bofReached, file, filters, loadingOlder, oldestOffset, showToast])

  // Live 轮询
  useEffect(() => {
    window.clearInterval(liveTimer.current)
    if (!live || !file) return
    liveTimer.current = window.setInterval(() => {
      const st = stateRef.current
      void api.watch(st.file, st.bottomOffset).then((r) => {
        if (r.rotated) {
          void loadFile(st.file, st.filters)
          return
        }
        if (r.grown && r.entries.length) {
          applyWindow({ entries: r.entries }, false)
          const el = listRef.current
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 6) {
            el.scrollTop = el.scrollHeight
          }
        }
      }).catch(() => { /* 服务瞬时不可达：下个周期再试 */ })
    }, liveInterval)
    return () => window.clearInterval(liveTimer.current)
  }, [applyWindow, file, live, liveInterval, loadFile])

  // 上下文模式
  const showContext = useCallback(async (e: LogEntry) => {
    try {
      const r = await api.context(file, e.offset, 20, 20)
      applyWindow({ ...r, entries: r.entries || [] }, true)
      setBofReached(true) // 上下文窗口不续翻
      setContextMode(true)
      showToast('已切换到上下文窗口', 'info')
    } catch (err) {
      showToast(`取上下文失败: ${(err as Error).message}`, 'bad')
    }
  }, [applyWindow, file, showToast])

  const loadStats = useCallback(async () => {
    if (stats || statsLoading || !file) return
    setStatsLoading(true)
    try {
      setStats(await api.stats(file))
    } catch (e) {
      showToast(`统计失败: ${(e as Error).message}`, 'bad')
    } finally {
      setStatsLoading(false)
    }
  }, [file, stats, statsLoading, showToast])

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label}已复制`, 'good')
    } catch (_) {
      showToast('复制失败（剪贴板不可用）', 'bad')
    }
  }, [showToast])

  const running = !svcError && port !== null

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="log-lens-panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', height: '100%', gap: 8, color: '#d4d4d8', fontSize: 12 }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>☰ 日志透视台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? `服务 :${port}` : '服务离线'}</span>
        <FilePicker files={files} value={file} onChange={switchFile} />
        <button onClick={() => { void reloadSources(file) }} style={btnSmall}>↻ 刷新</button>
        <button
          onClick={() => { setLive((v) => !v) }}
          style={{ ...btnSmall, borderColor: live ? '#3fb950' : '#3f3f46', color: live ? '#3fb950' : '#a1a1aa' }}
        >{live ? '◉ Live 中' : '◎ Live'}</button>
        <button onClick={() => { void loadStats() }} style={btnSmall}>📈 透视</button>
        <button onClick={() => setShowSettings(true)} style={btnSmall}>⚙ 设置</button>
      </div>

      {/* 过滤条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {['ERROR', 'WARN', 'INFO', 'DEBUG'].map((lv) => {
          const on = filters.levels.includes(lv)
          return (
            <button
              key={lv}
              onClick={() => {
                const levels = on ? filters.levels.filter((x) => x !== lv) : [...filters.levels, lv]
                const f = { ...filters, levels }
                setFilters(f)
                setContextMode(false)
                void loadFile(file, f)
              }}
              style={{
                ...btnSmall, color: on ? LEVEL_COLORS[lv] : '#71717a',
                borderColor: on ? LEVEL_COLORS[lv] : '#3f3f46',
                background: on ? 'rgba(255,255,255,.04)' : 'transparent',
              }}
            >{lv}</button>
          )
        })}
        <input
          value={filterDraft}
          onChange={(e) => setFilterDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
          placeholder={filters.regexOn ? '正则表达式（回车应用）' : '关键词（回车应用）'}
          style={{ flex: 1, minWidth: 160, background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', padding: '5px 8px', fontSize: 12 }}
        />
        <button
          onClick={() => { const f = { ...filters, regexOn: !filters.regexOn }; setFilters(f); setContextMode(false); void loadFile(file, f) }}
          style={{ ...btnSmall, color: filters.regexOn ? '#58a6ff' : '#71717a', borderColor: filters.regexOn ? '#58a6ff' : '#3f3f46' }}
          title="把关键词按正则解释"
        >.*</button>
        <button onClick={applyFilters} style={{ ...btnSmall, color: '#93c5fd', borderColor: '#3b82f6' }}>应用</button>
        <button onClick={clearFilters} style={btnSmall}>清除</button>
        {(filters.levels.length || filters.q) && (
          <span style={{ fontSize: 10, color: '#71717a' }}>
            过滤中: {[...filters.levels, filters.regexOn ? `/${filters.q}/` : filters.q].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {/* 状态条 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 10, color: '#71717a', flexWrap: 'wrap' }}>
        <span>{entries.length} 条{entries.length >= MAX_ENTRIES ? '（内存窗口已封顶）' : ''}</span>
        {meta.format && <span>格式 {meta.format}/{meta.encoding}</span>}
        {meta.fileSize ? <span>文件 {fmtBytes(meta.fileSize)}</span> : null}
        {dataRoot && <span title={dataRoot}>数据根 ✓</span>}
        {contextMode && <span style={{ color: '#d29922' }}>上下文窗口（改过滤或清除此处退出）</span>}
        <span style={{ flex: 1 }} />
        {!bofReached && entries.length > 0 && (
          <button onClick={() => { void loadOlder() }} disabled={loadingOlder} style={{ ...btnSmall, opacity: loadingOlder ? 0.5 : 1 }}>
            {loadingOlder ? '加载中…' : '↑ 加载更早'}
          </button>
        )}
        <button onClick={() => { void loadFile(file, filters); setContextMode(false) }} style={btnSmall}>↓ 跳到最新</button>
      </div>

      {/* 错误/引导 */}
      {svcError && (
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(248,81,73,.35)', background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5' }}>
          <div style={{ marginBottom: 4 }}><b>无法连接日志服务</b>: {svcError}</div>
          <div style={{ color: '#a1a1aa' }}>
            可能原因：① 后台服务未启动 → 去 设置→插件→日志透视台 检查（autoStart 开启时随宿主自动拉起）；
            ② 当前是 Web/手机端 → 本插件读取的是桌面端本机文件，请在桌面端打开面板。
          </div>
        </div>
      )}

      {/* 日志列表（虚拟滚动） */}
      <VirtualList
        entries={entries}
        listRef={listRef}
        onSelect={(e) => setSelected(e)}
        selected={selected}
      />

      {/* 详情抽屉 */}
      {selected && (
        <div style={{ borderTop: '1px solid #3f3f46', paddingTop: 8, maxHeight: '38%', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: LEVEL_COLORS[selected.level || 'CONT'] || '#a1a1aa' }}>{selected.level || '续行'}</span>
            <span style={{ color: '#71717a', fontSize: 10 }}>{fmtTs(selected.ts)} · offset={selected.offset} · {selected.target || '—'}</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => { void showContext(selected) }} style={btnSmall}>🔍 上下文 ±20</button>
            <button onClick={() => { void copyText(selected.message, '原文') }} style={btnSmall}>复制</button>
            <button onClick={() => { void copyText(maskSensitive(selected.message), '脱敏文本') }} style={btnSmall}>复制(脱敏)</button>
            <button onClick={() => setSelected(null)} style={btnSmall}>✕</button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#18181b', border: '1px solid #27272a', borderRadius: 6, padding: 8, fontSize: 11, lineHeight: 1.5, color: '#e4e4e7' }}>{selected.message}</pre>
        </div>
      )}

      {/* 透视统计抽屉 */}
      {stats && (
        <StatsDrawer stats={stats} onClose={() => setStats(null)} onJump={showContext} />
      )}

      {/* 设置弹层 */}
      {showSettings && (
        <SettingsModal
          sources={sources}
          liveInterval={liveInterval}
          dataRoot={dataRoot}
          onClose={() => setShowSettings(false)}
          onChanged={() => { void reloadSources(file) }}
          showToast={showToast}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', borderRadius: 8, fontSize: 12, zIndex: 40,
          background: toast.kind === 'good' ? 'rgba(63,185,80,.15)' : toast.kind === 'bad' ? 'rgba(248,81,73,.15)' : 'rgba(88,166,255,.15)',
          color: toast.kind === 'good' ? '#3fb950' : toast.kind === 'bad' ? '#f85149' : '#58a6ff',
          border: '1px solid currentColor',
        }}>{toast.msg}</div>
      )}
      {booting && <div style={{ color: '#71717a' }}>连接日志服务中…</div>}
    </div>
  )
}

// ── 子组件 ──────────────────────────────────────────────────────────────────
const btnSmall: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
  border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', minHeight: 26,
}

function FilePicker({ files, value, onChange }: { files: FileInfo[]; value: string; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase()
    return files.filter((f) => !k || f.path.toLowerCase().includes(k)).slice(0, 200)
  }, [files, kw])
  return (
    <div style={{ position: 'relative', minWidth: 220, flex: 1, maxWidth: 420 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ ...btnSmall, width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value ? `📄 ${baseName(value)}` : '选择日志文件…'} ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, zIndex: 30,
          background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, maxHeight: 320, overflowY: 'auto', padding: 6,
        }}>
          <input
            autoFocus
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="过滤文件名…"
            style={{ width: '100%', background: '#09090b', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', padding: '4px 8px', fontSize: 11, marginBottom: 6 }}
          />
          {filtered.length === 0 && <div style={{ color: '#71717a', padding: 6 }}>没有匹配文件（试试「设置」里添加目录）</div>}
          {filtered.map((f) => (
            <div
              key={f.path}
              onClick={() => { onChange(f.path); setOpen(false) }}
              style={{
                padding: '5px 6px', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
                background: f.path === value ? 'rgba(59,130,246,.12)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = f.path === value ? 'rgba(59,130,246,.12)' : 'rgba(255,255,255,.05)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = f.path === value ? 'rgba(59,130,246,.12)' : 'transparent' }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e4e4e7' }} title={f.path}>{f.path}</span>
              <span style={{ color: '#71717a', fontSize: 10, flexShrink: 0 }}>{fmtBytes(f.size)}</span>
              <span style={{ color: '#52525b', fontSize: 10, flexShrink: 0 }}>{f.source === 'user' ? '自加' : '默认'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function VirtualList({ entries, listRef, onSelect, selected }: {
  entries: LogEntry[]
  listRef: React.MutableRefObject<HTMLDivElement | null>
  onSelect: (e: LogEntry) => void
  selected: LogEntry | null
}) {
  const [range, setRange] = useState({ start: 0, end: 50 })
  const onScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - 10)
    const count = Math.ceil(el.clientHeight / ROW_H) + 20
    setRange({ start, end: start + count })
  }, [listRef])
  useEffect(() => {
    const el = listRef.current
    if (el) {
      el.scrollTop = el.scrollHeight // 初始/重载停在最底（最新）
    }
    onScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length === 0])
  void onScroll
  const visible = entries.slice(range.start, range.end)
  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid #27272a', borderRadius: 8, background: '#09090b', position: 'relative' }}
    >
      {entries.length === 0 && (
        <div style={{ padding: 16, color: '#71717a' }}>没有日志行（换文件 / 清过滤 / 检查服务状态）。</div>
      )}
      <div style={{ height: entries.length * ROW_H, position: 'relative' }}>
        <div style={{ position: 'absolute', top: range.start * ROW_H, left: 0, right: 0 }}>
          {visible.map((e) => {
            const isSel = selected && selected.offset === e.offset
            const color = LEVEL_COLORS[e.level || 'CONT'] || '#8b949e'
            return (
              <div
                key={e.offset}
                onClick={() => onSelect(e)}
                style={{
                  height: ROW_H, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
                  cursor: 'pointer', borderBottom: '1px solid #18181b',
                  background: isSel ? 'rgba(59,130,246,.15)' : 'transparent',
                  fontFamily: 'Consolas, Menlo, monospace', fontSize: 11,
                }}
                onMouseEnter={(ev) => { if (!isSel) (ev.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.04)' }}
                onMouseLeave={(ev) => { if (!isSel) (ev.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span style={{ color: '#71717a', flexShrink: 0, width: 90 }}>{fmtTs(e.ts)}</span>
                <span style={{ color, flexShrink: 0, width: 44, fontWeight: 600 }}>{e.level || 'CONT'}</span>
                <span style={{ color: '#a78bfa', flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.target}</span>
                <span style={{ color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.message.split('\n')[0]}
                  {e.message.includes('\n') && <span style={{ color: '#52525b' }}> …(+{e.message.split('\n').length - 1} 行)</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatsDrawer({ stats, onClose, onJump }: {
  stats: StatsResp
  onClose: () => void
  onJump: (e: LogEntry) => void
}) {
  const lv = stats.levels || {}
  const maxHourly = Math.max(1, ...(stats.hourly || []).map((h) => h.total))
  return (
    <div style={{
      borderTop: '1px solid #3f3f46', paddingTop: 8, maxHeight: '45%', overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <b style={{ color: '#f4f4f5' }}>📈 透视</b>
        <span style={{ fontSize: 10, color: '#71717a' }}>
          {stats.totalEntries} 条 · {stats.approximate ? '大文件采样近似 · ' : ''}{stats.distinctClusters} 类问题 · 格式 {stats.format}/{stats.encoding}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={btnSmall}>✕</button>
      </div>
      {/* 级别条 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(lv).map(([k, v]) => (
          <span key={k} style={{ fontSize: 11, color: LEVEL_COLORS[k] || '#71717a', background: 'rgba(255,255,255,.04)', padding: '2px 8px', borderRadius: 6 }}>
            {k} <b>{v}</b>
          </span>
        ))}
      </div>
      {/* 时间线（CSS 柱） */}
      {stats.hourly && stats.hourly.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, marginBottom: 4, flexWrap: 'wrap', overflowX: 'auto' }}>
          {stats.hourly.map((h) => (
            <div
              key={h.hour}
              title={`${new Date(h.hour).toISOString().slice(0, 13)}时: 共 ${h.total} / 问题 ${h.problems}`}
              style={{
                width: 10, height: `${Math.max(6, (h.total / maxHourly) * 100)}%`,
                background: h.problems > 0 ? 'rgba(248,81,73,.6)' : 'rgba(63,185,80,.4)',
                borderRadius: 2, flexShrink: 0, position: 'relative',
              }}
            >
              {h.problems > 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(h.problems / Math.max(h.total, 1)) * 100}%`, background: 'rgba(248,81,73,.95)', borderRadius: 2 }} />
              )}
            </div>
          ))}
        </div>
      )}
      {/* 聚类 */}
      {stats.clusters && stats.clusters.length > 0 && (
        <div>
          <div style={{ color: '#71717a', fontSize: 10, margin: '6px 0 4px' }}>问题聚类（点击跳到第一处现场）:</div>
          {stats.clusters.map((c, i) => (
            <div
              key={i}
              onClick={() => onJump({ offset: c.firstOffset, endOffset: c.firstOffset, ts: c.firstTs, level: c.level, target: '', message: c.sample })}
              style={{ padding: '4px 6px', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'baseline' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.05)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <span style={{ color: LEVEL_COLORS[c.level] || '#a1a1aa', flexShrink: 0, fontWeight: 700 }}>×{c.count}</span>
              <span style={{ color: '#e4e4e7', fontFamily: 'Consolas, Menlo, monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sample.split('\n')[0]}</span>
            </div>
          ))}
        </div>
      )}
      {(!stats.clusters || stats.clusters.length === 0) && (
        <div style={{ color: '#3fb950' }}>窗口内没有 WARN/ERROR/FATAL。</div>
      )}
    </div>
  )
}

function SettingsModal({ sources, liveInterval, dataRoot, onClose, onChanged, showToast }: {
  sources: Array<{ path: string; kind: string }>
  liveInterval: number
  dataRoot: string
  onClose: () => void
  onChanged: () => void
  showToast: Toast
}) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!path.trim() || busy) return
    setBusy(true)
    try {
      await api.addSource(path.trim())
      setPath('')
      showToast('源已添加', 'good')
      onChanged()
    } catch (e) {
      showToast(`添加失败: ${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (p: string) => {
    try {
      await api.removeSource(p)
      showToast('源已移除', 'good')
      onChanged()
    } catch (e) {
      showToast(`移除失败: ${(e as Error).message}`, 'bad')
    }
  }
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10, padding: 16, width: 520, maxWidth: '92%', maxHeight: '80%', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <b style={{ color: '#f4f4f5', fontSize: 14 }}>⚙ 日志源与参数</b>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={btnSmall}>✕</button>
        </div>
        <div style={{ color: '#71717a', fontSize: 11, marginBottom: 10 }}>
          默认源（自动发现，无需配置）：数据根 {dataRoot || '（未找到）'} 下的 logs/ 与散落 *.log。
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
            placeholder="添加目录或文件绝对路径，如 D:\space\myapp\logs"
            style={{ flex: 1, background: '#09090b', border: '1px solid #3f3f46', borderRadius: 6, color: '#e4e4e7', padding: '6px 8px', fontSize: 12 }}
          />
          <button onClick={() => { void add() }} disabled={busy} style={{ ...btnSmall, color: '#93c5fd', borderColor: '#3b82f6' }}>{busy ? '添加中…' : '添加'}</button>
        </div>
        {sources.length === 0 && <div style={{ color: '#52525b', fontSize: 11, marginBottom: 8 }}>还没有自加源。</div>}
        {sources.map((s) => (
          <div key={s.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, background: 'rgba(255,255,255,.03)', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#71717a', flexShrink: 0 }}>{s.kind === 'file' ? '文件' : '目录'}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={s.path}>{s.path}</span>
            <button onClick={() => { void remove(s.path) }} style={btnSmall}>移除</button>
          </div>
        ))}
        <div style={{ marginTop: 12, color: '#71717a', fontSize: 11 }}>
          Live 轮询间隔：{liveInterval}ms（服务读取即时的文件增量，无需保存）。
          服务端口由宿主分配并写入 lls.meta；全程只读日志文件，不修改不删除。
        </div>
      </div>
    </div>
  )
}
