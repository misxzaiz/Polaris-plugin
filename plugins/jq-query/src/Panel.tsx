/**
 * 面板：jq 查询台（查询 / 速查表 / 自检 三 Tab）
 * 数据面：cap.kv 历史+上次会话；字节面：127.0.0.1 直连自家服务。
 * 隐私口径：输入 JSON 与查询只在本页与本地服务之间流转，不落 kv（历史只存查询文本与 flags）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ArgRow, CheckResult, HistoryItem, JqMeta, QueryResult, ReferenceEntry, SelftestResult,
} from './model'
import {
  apiCheck, apiHealth, apiOutline, apiQuery, apiReference, apiSelftest,
  getMeta, loadHistory, loadLast, readTextFile, saveHistory, saveLast,
} from './model'

const css = `
.qq-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qq-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qq-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qq-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5B9DFF,#2D5FD8);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;color:#fff;font-family:Consolas,Menlo,monospace}
.qq-tt{flex:1;min-width:0}
.qq-tt b{font-size:15px;display:block}
.qq-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qq-dot{width:8px;height:8px;border-radius:50%;background:#4a5160;flex-shrink:0}
.qq-dot.on{background:#3ECFB2;box-shadow:0 0 6px rgba(62,207,178,.6)}
.qq-dot.err{background:#E5484D}
.qq-tabs{display:flex;gap:4px;padding:0 16px 6px}
.qq-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.qq-tab:hover{color:#E6EAF2}
.qq-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qq-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qq-body::-webkit-scrollbar{width:9px;height:9px}
.qq-body::-webkit-scrollbar-track{background:transparent}
.qq-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qq-sec{display:flex;align-items:center;gap:8px;padding:8px 16px 4px;font-size:12.5px;font-weight:700}
.qq-sec .act{margin-left:auto;display:flex;gap:6px}
.qq-lbl{font-size:11px;color:#8B95A7;min-width:40px}
.qq-inp,.qq-sel,.qq-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.qq-inp:focus,.qq-txa:focus,.qq-sel:focus{border-color:#5B9DFF}
.qq-inp{flex:1;min-width:80px}
.qq-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:12px}
.qq-btn{background:linear-gradient(135deg,#4C8DFF,#2D5FD8);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.qq-btn:hover{filter:brightness(1.1)}
.qq-btn:disabled{opacity:.5;cursor:default}
.qq-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.qq-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.qq-btn.warn{background:linear-gradient(135deg,#E5A048,#C77E2C)}
.qq-chip{background:#0E1219;border:1px solid #232A38;color:#8B95A7;font-size:11px;font-family:Consolas,Menlo,monospace;padding:3px 8px;border-radius:7px;cursor:pointer;user-select:none}
.qq-chip.on{border-color:#5B9DFF;color:#9EC1FF;background:rgba(91,157,255,.08)}
.qq-chip:hover{color:#E6EAF2}
.qq-meta{color:#8B95A7;font-size:11px;margin:4px 16px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.qq-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace}
.qq-ok{background:rgba(62,207,178,.1);border:1px solid rgba(62,207,178,.35);color:#7BDCC4;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all}
.qq-pre{background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:9px 11px;font-family:Consolas,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;margin:4px 0}
.qq-out{margin:6px 16px}
.qq-out-item{margin:6px 0}
.qq-out-head{display:flex;align-items:center;gap:6px;margin:2px 0}
.qq-out-head .idx{color:#5B7AAB;font-size:10.5px;font-family:Consolas,Menlo,monospace}
.qq-flags{display:flex;gap:5px;flex-wrap:wrap;padding:4px 16px}
.qq-args{margin:4px 16px;padding:8px 10px;background:#12161F;border:1px solid #232A38;border-radius:9px}
.qq-argrow{display:flex;gap:6px;align-items:center;margin:4px 0}
.qq-ref{margin:6px 16px}
.qq-ref-item{background:#12161F;border:1px solid #232A38;border-radius:10px;padding:8px 11px;margin:6px 0}
.qq-ref-sig{font-family:Consolas,Menlo,monospace;color:#9EC1FF;font-size:12px;cursor:pointer}
.qq-ref-sig:hover{text-decoration:underline}
.qq-ref-desc{font-size:12px;color:#C7CFDE;margin-top:2px}
.qq-ref-ex{font-family:Consolas,Menlo,monospace;font-size:11px;color:#7A8499;margin-top:3px;cursor:pointer}
.qq-ref-ex:hover{color:#9EC1FF}
.qq-ref-cat{display:inline-block;background:#1C2330;color:#8B95A7;border-radius:6px;font-size:10px;padding:1px 7px;margin-right:6px;vertical-align:1px}
.qq-st-pass{color:#3ECFB2}
.qq-st-fail{color:#F2A0A3}
.qq-hist{position:relative}
.qq-hist-list{position:absolute;top:100%;left:0;right:0;z-index:30;background:#161B26;border:1px solid #2C3547;border-radius:10px;margin-top:4px;max-height:260px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.qq-hist-item{padding:7px 11px;font-family:Consolas,Menlo,monospace;font-size:11.5px;color:#C7CFDE;cursor:pointer;border-bottom:1px solid #1E2530;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qq-hist-item:hover{background:#1C2330;color:#E6EAF2}
.qq-hist-item .t{color:#5B7AAB;font-size:10px;margin-right:6px}
.qq-empty{color:#5B6478;font-size:12px;text-align:center;padding:20px 16px}
.qq-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:qq-spin .8s linear infinite;vertical-align:-2px}
@keyframes qq-spin{to{transform:rotate(360deg)}}
.qq-file{margin:4px 16px;display:flex;gap:6px;align-items:center}
.qq-file .hint{color:#5B6478;font-size:11px}
`

const FLAG_DEFS: Array<{ f: string, title: string }> = [
  { f: '-r', title: '字符串结果去引号原样输出' },
  { f: '-c', title: '紧凑单行输出' },
  { f: '-s', title: '整个输入读成一个数组（NDJSON 汇总）' },
  { f: '-n', title: '不读输入，用 null 起头（造数据）' },
  { f: '-R', title: '每行输入作为字符串（日志文本）' },
  { f: '-S', title: '输出按键排序' },
]

const SAMPLES: Array<{ name: string, data: string }> = [
  {
    name: '用户数组（select/map/group_by）',
    data: JSON.stringify({
      users: [
        { name: 'alice', age: 31, city: '北京', tags: ['admin', 'dev'], active: true },
        { name: 'bob', age: 24, city: '上海', tags: ['dev'], active: false },
        { name: 'carol', age: 37, city: '北京', tags: ['ops', 'dev'], active: true },
        { name: 'dave', age: 29, city: '深圳', tags: [], active: true },
      ],
    }, null, 2),
  },
  {
    name: '访问日志 NDJSON（多文档流）',
    data: [
      '{"ts":"2026-11-06T10:00:01Z","level":"info","path":"/api/users","ms":12,"status":200}',
      '{"ts":"2026-11-06T10:00:04Z","level":"warn","path":"/api/orders","ms":830,"status":502}',
      '{"ts":"2026-11-06T10:00:07Z","level":"info","path":"/api/users","ms":9,"status":200}',
      '{"ts":"2026-11-06T10:00:11Z","level":"error","path":"/api/pay","ms":1204,"status":500}',
      '{"ts":"2026-11-06T10:00:15Z","level":"info","path":"/api/health","ms":2,"status":200}',
    ].join('\n'),
  },
  {
    name: '深层嵌套配置（paths/getpath）',
    data: JSON.stringify({
      server: { host: '127.0.0.1', ports: [9827, 9829], tls: { enabled: false, cert: null } },
      features: { cache: { ttl: 300, enabled: true }, beta: ['a', 'b'] },
    }, null, 2),
  },
]

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1048576).toFixed(2)}MB`
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 客户端输出渲染：-r 模式的字符串直接显示原文，其余 pretty JSON */
function renderOutputValue(v: unknown, rawMode: boolean): string {
  if (rawMode && typeof v === 'string') return v
  if (v === undefined) return '（无输出）'
  try { return JSON.stringify(v, null, 2) } catch (_) { return String(v) }
}

type Tab = 'query' | 'ref' | 'selftest'

export default function JqQueryPanel(props: { pluginId?: string, onSendToChat?: (msg: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('query')
  const [meta, setMeta] = useState<JqMeta | null>(null)
  const [bridgeDown, setBridgeDown] = useState(false)
  const [engineUp, setEngineUp] = useState(false)
  const [engineVersion, setEngineVersion] = useState('')

  const [input, setInput] = useState('')
  const [query, setQuery] = useState('.')
  const [flags, setFlags] = useState<string[]>([])
  const [args_, setArgs] = useState<ArgRow[]>([])
  const [argsOpen, setArgsOpen] = useState(false)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [filePath, setFilePath] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [showSamples, setShowSamples] = useState(false)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [histOpen, setHistOpen] = useState(false)
  const histRef = useRef<HTMLDivElement | null>(null)

  const [refEntries, setRefEntries] = useState<ReferenceEntry[] | null>(null)
  const [refTotal, setRefTotal] = useState(0)
  const [refKw, setRefKw] = useState('')

  const [check, setCheck] = useState<CheckResult | null>(null)
  const [checkBusy, setCheckBusy] = useState(false)
  const [outlineText, setOutlineText] = useState('')
  const [outlineBusy, setOutlineBusy] = useState(false)
  const [selftest, setSelftest] = useState<SelftestResult | null>(null)
  const [selfBusy, setSelfBusy] = useState(false)

  const metaRef = useRef<JqMeta | null>(null)
  metaRef.current = meta

  const refreshMeta = useCallback(async () => {
    try {
      const m = await getMeta()
      setMeta(m)
      setBridgeDown(!m)
      if (m) {
        try {
          const h = await apiHealth(m)
          setEngineUp(Boolean(h && h.ok))
          setEngineVersion(String(h.version || ''))
        } catch (_) { setEngineUp(false) }
      }
    } catch (_) { setBridgeDown(true); setEngineUp(false) }
  }, [])

  useEffect(() => { void refreshMeta() }, [refreshMeta])
  useEffect(() => {
    const t = setInterval(() => { void refreshMeta() }, 12000)
    return () => clearInterval(t)
  }, [refreshMeta])

  useEffect(() => {
    void (async () => {
      setHistory(await loadHistory())
      const last = await loadLast()
      if (last) {
        if (typeof last.input === 'string') setInput(last.input)
        if (typeof last.query === 'string' && last.query) setQuery(last.query)
        if (Array.isArray(last.flags)) setFlags(last.flags)
        if (Array.isArray(last.args)) setArgs(last.args)
      }
    })()
  }, [])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (histRef.current && e.target instanceof Node && !histRef.current.contains(e.target)) setHistOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const persistLast = useCallback((patch: Partial<{ input: string, query: string, flags: string[], args: ArgRow[] }>) => {
    void saveLast({
      input: patch.input ?? input,
      query: patch.query ?? query,
      flags: patch.flags ?? flags,
      args: patch.args ?? args_,
    })
  }, [input, query, flags, args_])

  const toggleFlag = (f: string) => {
    const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f]
    setFlags(next)
    persistLast({ flags: next })
  }

  const buildFlags = useCallback((extra?: ArgRow[]): string[] => {
    const rows = extra ?? args_
    const out = [...flags]
    for (const a of rows) {
      const name = a.name.trim()
      if (!name) continue
      if (a.kind === 'argjson') {
        try { JSON.parse(a.value) } catch (_) { continue }
        out.push('--argjson', name, a.value)
      } else {
        out.push('--arg', name, a.value)
      }
    }
    return out
  }, [flags, args_])

  const pushHistory = useCallback((q: string, usedFlags: string[]) => {
    const item: HistoryItem = { q, flags: usedFlags, ts: Date.now() }
    setHistory((prev) => {
      const next = [item, ...prev.filter((x) => x.q !== q)].slice(0, 50)
      void saveHistory(next)
      return next
    })
  }, [])

  const run = useCallback(async () => {
    const m = metaRef.current
    if (!m) { setError('服务未就绪（桥降级或服务未启动），点右上状态灯重试'); return }
    const q = query.trim() ? query : '.'
    setError('')
    setNotice('')
    setRunning(true)
    const usedFlags = buildFlags()
    try {
      const r = await apiQuery(m, { input, query: q, flags: usedFlags })
      setResult(r)
      pushHistory(q, usedFlags)
      void saveLast({ input, query: q, flags: usedFlags, args: args_ })
    } catch (e) {
      setResult(null)
      setError(String((e as Error).message || e))
    } finally {
      setRunning(false)
    }
  }, [query, input, buildFlags, pushHistory, args_])

  const onRunClick = () => { void run() }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void run()
    }
  }

  const openFile = async () => {
    const p = filePath.trim()
    if (!p) return
    setFileBusy(true)
    setError('')
    try {
      const text = await readTextFile(p)
      setInput(text)
      persistLast({ input: text })
      setNotice(`已载入文件：${p.split(/[\\/]/).pop()}（${fmtBytes(text.length)}）`)
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setFileBusy(false)
    }
  }

  const loadRef = useCallback(async (kw: string) => {
    const m = metaRef.current
    if (!m) return
    try {
      const r = await apiReference(m, kw)
      setRefEntries(r.entries)
      setRefTotal(r.total)
    } catch (_) { /* 速查表加载失败静默，面板仍可用 */ }
  }, [])

  useEffect(() => {
    if (tab === 'ref' && !refEntries) void loadRef('')
  }, [tab, refEntries, loadRef])

  const doCheck = async () => {
    const m = metaRef.current
    if (!m) return
    setCheckBusy(true)
    setCheck(null)
    try { setCheck(await apiCheck(m, query)) } catch (e) { setError(String((e as Error).message || e)) } finally { setCheckBusy(false) }
  }

  const doOutline = async () => {
    const m = metaRef.current
    if (!m) return
    if (!input.trim()) { setError('先粘贴/载入输入 JSON 再看结构大纲'); return }
    setOutlineBusy(true)
    setOutlineText('')
    setResult(null)
    setError('')
    try {
      const r = await apiOutline(m, { json: input })
      setOutlineText(r.text)
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setOutlineBusy(false)
    }
  }

  const doSelftest = async () => {
    const m = metaRef.current
    if (!m) return
    setSelfBusy(true)
    setSelftest(null)
    try { setSelftest(await apiSelftest(m)) } catch (e) { setError(String((e as Error).message || e)) } finally { setSelfBusy(false) }
  }

  const insertSig = (s: string) => {
    setQuery((prev) => (prev.trim() ? `${prev.trimEnd()} | ${s}` : s))
  }

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice('已复制到剪贴板') } catch (_) { /* 剪贴板权限被拒 */ }
  }

  const sendToChat = () => {
    if (!result || !props.onSendToChat) return
    const body = result.outputs && result.outputs.length
      ? result.outputs.map((o) => (o.error ? `⚠ ${o.error}` : renderOutputValue(o.value, result.flags.includes('-r')))).join('\n---\n')
      : result.raw
    void props.onSendToChat(`我用 jq 查询台查询了 JSON：\n\njq: \`${query.trim() || '.'}\`${result.flags.length ? `（flags: ${result.flags.join(' ')}）` : ''}\n\n结果：\n${body.slice(0, 6000)}`)
  }

  const inputInfo = useMemo(() => {
    const bytes = new TextEncoder().encode(input).length
    const trimmed = input.trim()
    let validity = ''
    if (trimmed) {
      try { JSON.parse(trimmed); validity = '单文档 JSON ✓' } catch (_) { validity = '多文档/NDJSON 或非法（以引擎判定为准）' }
    }
    return { bytes, validity }
  }, [input])

  const rawMode = (result?.flags ?? flags).includes('-r')
  const statusColor = bridgeDown ? 'err' : engineUp ? 'on' : 'err'
  const statusText = bridgeDown ? '桥降级' : engineUp ? `引擎在线${engineVersion ? ` v${engineVersion}` : ''}` : '服务离线'

  return (
    <div className="qq-root">
      <style>{css}</style>
      <div className="qq-top">
        <div className="qq-logo">jq</div>
        <div className="qq-tt">
          <b>jq 查询台</b>
          <small>真实 jq 引擎 · 本地文件 · NDJSON · AI 五工具</small>
        </div>
        <span className={`qq-dot ${statusColor}`} title={statusText} onClick={() => void refreshMeta()} />
        <small style={{ color: '#8B95A7', fontSize: 10.5 }}>{statusText}</small>
      </div>
      <div className="qq-tabs">
        <button className={`qq-tab ${tab === 'query' ? 'on' : ''}`} onClick={() => setTab('query')}>查询</button>
        <button className={`qq-tab ${tab === 'ref' ? 'on' : ''}`} onClick={() => setTab('ref')}>速查表</button>
        <button className={`qq-tab ${tab === 'selftest' ? 'on' : ''}`} onClick={() => setTab('selftest')}>自检</button>
      </div>
      <div className="qq-body">
        {tab === 'query' && (
          <>
            <div className="qq-sec">
              输入 JSON / NDJSON
              <span className="act">
                <button className="qq-btn mini ghost" onClick={() => setShowSamples((v) => !v)}>示例</button>
                <button className="qq-btn mini ghost" onClick={() => { setInput(''); persistLast({ input: '' }) }}>清空</button>
              </span>
            </div>
            {showSamples && (
              <div style={{ margin: '2px 16px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {SAMPLES.map((s) => (
                  <button key={s.name} className="qq-btn mini ghost" style={{ justifyContent: 'flex-start' }} onClick={() => {
                    setInput(s.data); setShowSamples(false); persistLast({ input: s.data })
                  }}>{s.name}</button>
                ))}
              </div>
            )}
            <div style={{ margin: '2px 16px' }}>
              <textarea className="qq-txa" rows={6} value={input} spellCheck={false}
                placeholder='粘贴 JSON / NDJSON；或下方输入绝对路径打开本地文件（≤64MB）'
                onChange={(e) => { setInput(e.target.value) }}
                onBlur={() => persistLast({})} />
            </div>
            <div className="qq-file">
              <span className="qq-lbl">文件</span>
              <input className="qq-inp" value={filePath} placeholder="D:\\data\\x.json（绝对路径）"
                onChange={(e) => setFilePath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void openFile() }} />
              <button className="qq-btn mini" disabled={fileBusy || !filePath.trim()} onClick={() => void openFile()}>
                {fileBusy ? <span className="qq-spin" /> : '载入'}
              </button>
            </div>
            <div className="qq-meta">
              <span>{fmtBytes(inputInfo.bytes)}</span>
              {inputInfo.validity && <span>{inputInfo.validity}</span>}
            </div>

            <div className="qq-sec">
              jq 查询
              <span className="act">
                <div className="qq-hist" ref={histRef}>
                  <button className="qq-btn mini ghost" onClick={() => setHistOpen((v) => !v)}>历史</button>
                  {histOpen && (
                    <div className="qq-hist-list">
                      {history.length === 0 && <div className="qq-empty">暂无历史</div>}
                      {history.map((h, i) => (
                        <div key={`${h.ts}-${i}`} className="qq-hist-item" title={h.q}
                          onClick={() => { setQuery(h.q); if (h.flags) setFlags(h.flags.filter((f) => FLAG_DEFS.some((d) => d.f === f) || f === '--arg' || f === '--argjson')); setHistOpen(false); persistLast({ query: h.q }) }}>
                          <span className="t">{fmtTime(h.ts)}</span>{h.q}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="qq-btn mini ghost" disabled={checkBusy} onClick={() => void doCheck()}>{checkBusy ? '校验中…' : '语法校验'}</button>
                <button className="qq-btn mini ghost" disabled={outlineBusy} onClick={() => void doOutline()}>{outlineBusy ? '解析中…' : '结构大纲'}</button>
              </span>
            </div>
            <div style={{ margin: '2px 16px' }}>
              <textarea className="qq-txa" rows={3} value={query} spellCheck={false}
                placeholder='.users[] | select(.age > 30) | {name, city}   （Ctrl+Enter 运行）'
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown} />
            </div>
            <div className="qq-flags">
              {FLAG_DEFS.map((d) => (
                <span key={d.f} className={`qq-chip ${flags.includes(d.f) ? 'on' : ''}`} title={d.title}
                  onClick={() => toggleFlag(d.f)}>{d.f}</span>
              ))}
              <span className={`qq-chip ${argsOpen ? 'on' : ''}`} onClick={() => setArgsOpen((v) => !v)} title="--arg / --argjson 变量注入">--arg…</span>
            </div>
            {argsOpen && (
              <div className="qq-args">
                {args_.map((a, i) => (
                  <div className="qq-argrow" key={i}>
                    <select className="qq-sel" value={a.kind} style={{ width: 96 }}
                      onChange={(e) => setArgs((prev) => prev.map((x, j) => (j === i ? { ...x, kind: e.target.value as ArgRow['kind'] } : x)))}>
                      <option value="arg">--arg</option>
                      <option value="argjson">--argjson</option>
                    </select>
                    <input className="qq-inp" style={{ maxWidth: 110 }} placeholder="名称" value={a.name}
                      onChange={(e) => setArgs((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input className="qq-inp" placeholder={a.kind === 'argjson' ? '{"k":1}' : '值'} value={a.value}
                      onChange={(e) => setArgs((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    <button className="qq-btn mini ghost" onClick={() => setArgs((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button className="qq-btn mini ghost" onClick={() => setArgs((prev) => [...prev, { kind: 'arg', name: '', value: '' }])}>+ 加变量</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
              <button className="qq-btn" disabled={running || !engineUp} onClick={onRunClick}>
                {running ? <><span className="qq-spin" /> 运行中…</> : '▶ 运行（Ctrl+Enter）'}
              </button>
              {result && (
                <button className="qq-btn ghost" onClick={() => void copyText(result.raw)}>复制全部输出</button>
              )}
              {result && props.onSendToChat && (
                <button className="qq-btn ghost" onClick={sendToChat}>发到对话</button>
              )}
            </div>
            {check && (
              check.syntaxOk
                ? <div className="qq-ok">✓ 语法 OK{check.runtimeNote ? `（${check.runtimeNote}）` : ''}</div>
                : <div className="qq-err">✗ 语法错误：{check.error}</div>
            )}
            {outlineText && (
              <div style={{ margin: '6px 16px' }}>
                <div className="qq-out-head"><span className="idx">结构大纲（depth=3）</span><button className="qq-btn mini ghost" onClick={() => void copyText(outlineText)}>复制</button></div>
                <pre className="qq-pre">{outlineText}</pre>
              </div>
            )}
            {error && <div className="qq-err">{error}</div>}
            {notice && !error && <div className="qq-ok">{notice}</div>}
            {result && (
              <>
                <div className="qq-meta">
                  <span>{result.ms}ms</span>
                  <span>输出 {result.outputCount ?? '—'} 项 / {fmtBytes(result.rawBytes)}</span>
                  <span>输入 {result.inputDocs} 文档</span>
                  <span>flags: {result.flags.length ? result.flags.join(' ') : '（无）'}</span>
                </div>
                {result.truncationNotice && <div className="qq-err">{result.truncationNotice}</div>}
                <div className="qq-out">
                  {(!result.outputs || result.outputs.length === 0) && !result.truncated && (
                    <div className="qq-pre">（空流：查询合法但未产出结果）</div>
                  )}
                  {(result.outputs ?? []).map((o, i) => (
                    <div className="qq-out-item" key={i}>
                      <div className="qq-out-head">
                        <span className="idx">#{i + 1}</span>
                        <button className="qq-btn mini ghost" onClick={() => void copyText(renderOutputValue(o.value, rawMode))}>复制</button>
                      </div>
                      {o.error
                        ? <div className="qq-err" style={{ margin: 0 }}>输出段解析失败：{o.error}\n原文：{o.raw}</div>
                        : <pre className="qq-pre">{renderOutputValue(o.value, rawMode)}</pre>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'ref' && (
          <>
            <div className="qq-sec">
              速查表
              <span className="act"><small style={{ color: '#5B6478' }}>{refTotal} 条命中 / 点击签名插入查询</small></span>
            </div>
            <div className="qq-file">
              <input className="qq-inp" value={refKw} placeholder="搜索：group / 时间 / 正则 / select / @csv…"
                onChange={(e) => setRefKw(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void loadRef(refKw) }} />
              <button className="qq-btn mini" onClick={() => void loadRef(refKw)}>搜索</button>
              {refKw && <button className="qq-btn mini ghost" onClick={() => { setRefKw(''); void loadRef('') }}>清</button>}
            </div>
            <div className="qq-ref">
              {refEntries && refEntries.length === 0 && <div className="qq-empty">没有命中，换个关键词试试</div>}
              {(refEntries ?? []).map((e2, i) => (
                <div className="qq-ref-item" key={i}>
                  <div>
                    <span className="qq-ref-cat">{e2.cat}</span>
                    <span className="qq-ref-sig" title="点击插入到查询" onClick={() => { insertSig(e2.sig); setTab('query') }}>{e2.sig}</span>
                  </div>
                  <div className="qq-ref-desc">{e2.desc}</div>
                  <div className="qq-ref-ex" title="点击把示例设为查询" onClick={() => { setQuery(e2.ex); setTab('query') }}>例: {e2.ex}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'selftest' && (
          <>
            <div className="qq-sec">引擎自检（试金石）</div>
            <div style={{ padding: '4px 16px', display: 'flex', gap: 8 }}>
              <button className="qq-btn warn" disabled={selfBusy || !engineUp} onClick={() => void doSelftest()}>
                {selfBusy ? <><span className="qq-spin" /> 自检中…</> : '跑 14 项自检'}
              </button>
            </div>
            {selftest && (
              <>
                <div className={`qq-ok`} style={{ color: selftest.fail === 0 ? '#7BDCC4' : '#F2A0A3', borderColor: selftest.fail === 0 ? 'rgba(62,207,178,.35)' : 'rgba(229,72,77,.4)' }}>
                  {selftest.pass}/{selftest.total} 通过（引擎 queries={selftest.engine.queries} timeouts={selftest.engine.timeouts} respawns={selftest.engine.respawns}）
                </div>
                <div className="qq-out">
                  {selftest.results.map((r, i) => (
                    <div key={i} style={{ margin: '3px 0', fontSize: 12 }}>
                      <span className={r.pass ? 'qq-st-pass' : 'qq-st-fail'}>{r.pass ? '✓' : '✗'}</span> {r.name}
                      {!r.pass && r.detail ? <span style={{ color: '#8B95A7' }}> — {r.detail}</span> : null}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="qq-meta" style={{ marginTop: 10 }}>
              <span>口径：自检走真实 worker 引擎（含超时击杀+重生成），与 test/ 离线断言互补。</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
