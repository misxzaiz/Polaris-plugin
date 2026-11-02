/**
 * LogsTab.tsx —— 容器日志：容器选择器 + tail 一次性加载 + live follow 流式（fetch reader）
 * 纪律：日志只在内存 state（上限 5000 行，FIFO），不落盘、不进 kv。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ServiceError, logsToPrompt } from '../model'

const MAX_LINES = 5000

interface Props {
  engineOk: boolean
  initialTarget: string
  showToast: (t: string, bad?: boolean) => void
  onSendToChat?: (msg: string) => void | Promise<void>
}

interface DisplayLine { stream: 'stdout' | 'stderr'; text: string }

export default function LogsTab({ engineOk, initialTarget, showToast, onSendToChat }: Props) {
  const [names, setNames] = useState<{ name: string; running: boolean }[]>([])
  const [target, setTarget] = useState(initialTarget)
  const [tail, setTail] = useState(200)
  const [follow, setFollow] = useState(false)
  const [lines, setLines] = useState<DisplayLine[]>([])
  const [filter, setFilter] = useState('')
  const [paused, setPaused] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  // 容器下拉：运行中在前
  useEffect(() => {
    if (!engineOk) return
    let alive = true
    api.containers(false)
      .then((r) => {
        if (!alive) return
        const list = (r.items || []).map((c) => ({ name: c.name, running: c.running }))
        setNames(list)
        setTarget((cur) => (cur && list.some((x) => x.name === cur) ? cur : (list.find((x) => x.running)?.name || list[0]?.name || '')))
      })
      .catch(() => { /* 状态栏已有错误展示 */ })
    return () => { alive = false }
  }, [engineOk])

  /** 一次性加载（follow 关闭时） */
  const loadOnce = useCallback(async () => {
    if (!target) return
    setLoading(true)
    try {
      const r = await api.logsOnce(target, tail)
      setLines(r.lines.map((l) => ({ stream: l.stream, text: l.text })))
      setErr('')
    } catch (e) {
      setErr((e as ServiceError).message || String(e))
    } finally {
      setLoading(false)
    }
  }, [target, tail])

  // follow 流式
  useEffect(() => {
    if (!engineOk || !target) return () => undefined
    if (!follow) {
      loadOnce()
      return () => undefined
    }
    const ac = new AbortController()
    abortRef.current = ac
    setLines([])
    const run = async () => {
      try {
        const resp = await api.logsFollow(target, tail)
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => '')
          let msg = `HTTP ${resp.status}`
          try { msg = JSON.parse(text).error || msg } catch (_) { /* keep */ }
          setErr(msg)
          return
        }
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        setErr('')
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n')
          buf = parts.pop() || ''
          if (pausedRef.current || parts.length === 0) continue
          setLines((prev) => {
            const next = [...prev]
            for (const raw of parts) {
              if (!raw) continue
              const isErr = raw.startsWith('[E] ')
              next.push({ stream: isErr ? 'stderr' : 'stdout', text: isErr ? raw.slice(4) : raw.startsWith('[O] ') ? raw.slice(4) : raw })
            }
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
          })
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr((e as Error).message || String(e))
      }
    }
    run()
    return () => {
      ac.abort()
      abortRef.current = null
    }
  }, [engineOk, target, tail, follow, loadOnce])

  // 跟随滚动
  useEffect(() => {
    if (!paused && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines, paused])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const visible = useMemo(() => {
    const kw = filter.trim().toLowerCase()
    if (!kw) return lines
    return lines.filter((l) => l.text.toLowerCase().includes(kw))
  }, [lines, filter])

  const askAi = useCallback(async () => {
    if (!target) return
    if (!onSendToChat) { showToast('宿主不支持发给 AI', true); return }
    const src = visible.length ? visible : lines
    if (!src.length) { showToast('当前没有日志可发送', true); return }
    const recent = src.slice(-150)
    try {
      await onSendToChat(logsToPrompt(target, recent))
      showToast('已发送给 AI 会话')
    } catch (e) {
      showToast(`发送失败：${(e as Error).message}`, true)
    }
  }, [target, visible, lines, onSendToChat, showToast])

  return (
    <div className="dk-pad" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div className="dk-row">
        <select className="dk-select" value={target} onChange={(e) => setTarget(e.target.value)}>
          {!target && <option value="">选择容器</option>}
          {names.map((n) => (
            <option key={n.name} value={n.name}>{n.name}{n.running ? '' : '（已停止）'}</option>
          ))}
        </select>
        <select className="dk-select" value={tail} onChange={(e) => setTail(parseInt(e.target.value, 10))}>
          {[100, 200, 500, 1000].map((n) => <option key={n} value={n}>tail {n}</option>)}
        </select>
        <label className="dk-dim dk-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />live 跟随
        </label>
        <label className="dk-dim dk-small" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />暂停滚动
        </label>
        <input className="dk-input" style={{ width: 160 }} placeholder="过滤关键字" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="dk-grow" />
        {!follow && <button type="button" className="dk-btn dk-btn-sm" onClick={loadOnce}>{loading ? '加载中…' : '刷新'}</button>}
        <button type="button" className="dk-btn dk-btn-sm" onClick={() => setLines([])}>清空</button>
        <button type="button" className="dk-btn dk-btn-sm" onClick={askAi} title="把当前日志发给 AI 会话分析">问 AI</button>
      </div>
      {err && <div className="dk-err dk-mt8">{err}</div>}
      <div ref={scrollRef} className="dk-logwrap dk-mono dk-mt8">
        {visible.length === 0
          ? <span className="dk-dim">{target ? '暂无日志输出（或被过滤器隐藏）。' : '先选择一个容器。'}</span>
          : visible.map((l, i) => (
            <div key={`${i}-${l.text.slice(0, 12)}`} className={`dk-logline ${l.stream === 'stderr' ? 'dk-logerr' : ''}`}>{l.text}</div>
          ))}
      </div>
      <div className="dk-dim dk-small dk-mt8">
        {lines.length > 0 && `缓冲 ${lines.length}/${MAX_LINES} 行${filter ? ` · 过滤后 ${visible.length} 行` : ''} · 仅内存不落盘`}
      </div>
    </div>
  )
}
