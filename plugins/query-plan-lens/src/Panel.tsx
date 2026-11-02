import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, loadServiceMeta, ServiceMeta } from './host'
import type { ConnInfo, ExplainResult, Finding, HistoryItem, PlanNode, UnifiedPlan } from './types'

// ── 样式常量（对齐 house 深色主题） ────────────────────────────────────────
const C = {
  surface: '#25252B',
  surface2: '#2D2D33',
  border: '#3F3F46',
  text: '#F8F8F8',
  textDim: '#B4B4B8',
  textFaint: '#71717A',
  accent: '#3B82F6',
  danger: '#F87171',
  warn: '#FBBF24',
  info: '#60A5FA',
  good: '#34D399',
}

const sevColor: Record<string, string> = { critical: C.danger, warn: C.warn, info: C.info }
const sevLabel: Record<string, string> = { critical: '严重', warn: '警告', info: '提示' }

function fmtRows(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}
function fmtMs(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`
  if (n >= 10) return `${n.toFixed(0)}ms`
  if (n >= 1) return `${n.toFixed(1)}ms`
  return `${n.toFixed(2)}ms`
}
function fmtCost(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n >= 10000 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, '')
}

type Tab = 'analyze' | 'paste' | 'history' | 'conns'

export default function QueryPlanLensPanel({ onSendToChat }: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [meta, setMeta] = useState<ServiceMeta | null>(null)
  const [bootErr, setBootErr] = useState('')
  const [tab, setTab] = useState<Tab>('analyze')

  // 连接
  const [conns, setConns] = useState<ConnInfo[]>([])
  const [connId, setConnId] = useState('')
  const [form, setForm] = useState<Partial<ConnInfo> & { password?: string }>({})
  const [connMsg, setConnMsg] = useState('')

  // 分析
  const [sql, setSql] = useState('SELECT * FROM your_table WHERE id = 1')
  const [analyze, setAnalyze] = useState(false)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<ExplainResult | null>(null)

  // 粘贴解析
  const [pasteText, setPasteText] = useState('')
  const [pasteEngine, setPasteEngine] = useState<'auto' | 'pg' | 'mysql'>('auto')

  // 历史
  const [history, setHistory] = useState<HistoryItem[]>([])

  // 树交互
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<PlanNode | null>(null)

  const refreshConns = useCallback(async (m: ServiceMeta) => {
    try {
      const r = await api<{ connections: ConnInfo[] }>('conns.list', {}, m)
      setConns(r.connections)
      setConnId((cur) => (r.connections.some((c) => c.id === cur) ? cur : (r.connections[0]?.id || '')))
    } catch (e) { setConnMsg(String((e as Error).message)) }
  }, [])

  const refreshHistory = useCallback(async (m: ServiceMeta) => {
    try {
      const r = await api<{ items: HistoryItem[] }>('history.list', { limit: 30 }, m)
      setHistory(r.items)
    } catch (_) { /* 历史读取失败不打断主流程 */ }
  }, [])

  // 启动：服务发现
  useEffect(() => {
    let alive = true
    void (async () => {
      const m = await loadServiceMeta()
      if (!alive) return
      if (!m) {
        setBootErr('本地服务未就绪（kv 无 qpl.service）。请稍候数秒后点「重试」；若持续失败，到设置→插件里检查服务状态。')
        return
      }
      setMeta(m)
      await Promise.all([refreshConns(m), refreshHistory(m)])
    })()
    return () => { alive = false }
  }, [refreshConns, refreshHistory])

  const selectedConn = useMemo(() => conns.find((c) => c.id === connId) || null, [conns, connId])

  const applyResult = useCallback((r: ExplainResult) => {
    setResult(r)
    setSelectedNode(null)
    setCollapsed(new Set())
    if (r.meta?.historyId) void refreshHistory(meta!)
  }, [meta, refreshHistory])

  const runExplain = useCallback(async () => {
    if (!meta || !connId) return
    setRunning(true); setErr('')
    try {
      const r = await api<ExplainResult>('plan.explain', { connId, sql, analyze }, meta)
      applyResult(r)
    } catch (e) { setErr(String((e as Error).message)) } finally { setRunning(false) }
  }, [meta, connId, sql, analyze, applyResult])

  const runParse = useCallback(async () => {
    if (!meta) return
    setRunning(true); setErr('')
    try {
      const r = await api<ExplainResult>('plan.parse', { text: pasteText, engine: pasteEngine }, meta)
      applyResult(r)
    } catch (e) { setErr(String((e as Error).message)) } finally { setRunning(false) }
  }, [meta, pasteText, pasteEngine, applyResult])

  const loadHistory = useCallback(async (id: string) => {
    if (!meta) return
    setRunning(true); setErr('')
    try {
      const r = await api<ExplainResult>('history.get', { id }, meta)
      applyResult(r)
      setTab('analyze')
    } catch (e) { setErr(String((e as Error).message)) } finally { setRunning(false) }
  }, [meta, applyResult])

  const testConn = useCallback(async (id: string) => {
    if (!meta) return
    setConnMsg('测试中…')
    try {
      const r = await api<{ serverVersion: string; latencyMs: number }>('conns.test', { id }, meta)
      setConnMsg(`连接成功：${r.serverVersion}（${r.latencyMs}ms）`)
    } catch (e) { setConnMsg(`连接失败：${String((e as Error).message)}`) }
  }, [meta])

  const saveConn = useCallback(async () => {
    if (!meta) return
    setConnMsg('保存中…')
    try {
      await api('conns.save', form, meta)
      setConnMsg('已保存')
      await refreshConns(meta)
    } catch (e) { setConnMsg(`保存失败：${String((e as Error).message)}`) }
  }, [meta, form, refreshConns])

  const deleteConn = useCallback(async (id: string) => {
    if (!meta) return
    try {
      await api('conns.delete', { id }, meta)
      if (connId === id) setConnId('')
      await refreshConns(meta)
    } catch (e) { setConnMsg(String((e as Error).message)) }
  }, [meta, connId, refreshConns])

  /** AI 文本（与 service summarizeForAi 同口径的客户端版本） */
  const buildAiText = useCallback((r: ExplainResult) => {
    const lines: string[] = []
    lines.push(`【执行计划分析 · ${r.plan.engine === 'pg' ? 'PostgreSQL' : 'MySQL'}】`)
    if (r.plan.statement) lines.push(`SQL：${r.plan.statement.slice(0, 300)}`)
    lines.push(`总成本：${fmtCost(r.plan.totalCost)}${r.plan.executionMs !== null ? `；执行 ${fmtMs(r.plan.executionMs)}` : (r.plan.actualMs !== null ? `；总耗时 ${fmtMs(r.plan.actualMs)}` : '')}`)
    lines.push('计划树（估行→实行 | 耗时 | 成本）：')
    const render = (n: PlanNode, d: number) => {
      if (d > 12) return
      const rel = n.relation ? ` on ${n.relation}${n.indexName ? ` using ${n.indexName}` : ''}` : ''
      const flags = n.flags.length ? ` [${n.flags.join('; ')}]` : ''
      lines.push(`${'  '.repeat(d)}${n.nodeType}${rel} | ${fmtRows(n.estRows)}→${fmtRows(n.actRowsTotal)} | ${fmtMs(n.actualMs)} | cost=${fmtCost(n.estCost)}${flags}`)
      n.children.forEach((c) => render(c, d + 1))
    }
    render(r.plan.root, 0)
    if (r.findings.length) {
      lines.push('', '诊断发现：')
      r.findings.forEach((f) => lines.push(`- [${sevLabel[f.severity]}] ${f.title} → ${f.suggestion}`))
    }
    return lines.join('\n')
  }, [])

  const sendToAi = useCallback(async () => {
    if (!result || !onSendToChat) return
    await onSendToChat(`${buildAiText(result)}\n\n请解读这份执行计划：瓶颈在哪、按优先级给出可执行的优化建议。`)
  }, [result, onSendToChat, buildAiText])

  // ── 渲染 ────────────────────────────────────────────────────────────────
  if (!meta) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>
        <div style={{ color: C.warn, marginBottom: 8 }}>⏳ 服务未就绪</div>
        <div>{bootErr || '正在读取服务元数据…'}</div>
        <button onClick={() => window.location.reload()} style={{ ...btnStyle, marginTop: 12 }}>重试</button>
      </div>
    )
  }

  const plan = result?.plan
  const root = plan?.root

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12, color: C.text }}>
      {/* 头部 */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>执行计划透视台</span>
        <span style={{ color: C.good, fontSize: 10 }}>● 服务 v{meta.version || '0.1.0'}</span>
        <span style={{ flex: 1 }} />
        {onSendToChat && result && (
          <button onClick={sendToAi} style={{ ...btnStyle, background: C.accent, color: '#fff', border: 'none' }}>发到聊天让 AI 解读</button>
        )}
      </div>
      {/* Tab */}
      <div style={{ display: 'flex', gap: 2, padding: '0 12px', borderBottom: `1px solid ${C.border}` }}>
        {([['analyze', '分析'], ['paste', '粘贴解析'], ['history', `历史${history.length ? ` (${history.length})` : ''}`], ['conns', `连接${conns.length ? ` (${conns.length})` : ''}`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            background: 'none', border: 'none', borderBottom: tab === k ? `2px solid ${C.accent}` : '2px solid transparent',
            color: tab === k ? C.text : C.textFaint, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tab === 'analyze' && (
          <>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={connId} onChange={(e) => setConnId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">{conns.length ? '选择连接…' : '（无连接，去「连接」页新增）'}</option>
                {conns.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.engine === 'pg' ? 'PG' : 'MySQL'} · {c.host}）</option>)}
              </select>
              {selectedConn && <button onClick={() => testConn(selectedConn.id)} style={btnStyle}>测试</button>}
              <button onClick={() => setTab('conns')} style={btnStyle}>管理</button>
            </div>
            <textarea
              value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false}
              placeholder={'输入单条只读 SQL（SELECT / WITH 开头，不要带 EXPLAIN 前缀）\n例：SELECT * FROM orders WHERE customer_id = 42'}
              style={{ ...textareaStyle, minHeight: 88 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: selectedConn?.engine === 'pg' ? C.textDim : C.textFaint }}>
                <input type="checkbox" checked={analyze} disabled={selectedConn?.engine !== 'pg'} onChange={(e) => setAnalyze(e.target.checked)} />
                实际执行（EXPLAIN ANALYZE）
              </label>
              <span style={{ color: C.textFaint }}>仅 SELECT/WITH；写语句永久拒绝</span>
              <span style={{ flex: 1 }} />
              <button onClick={runExplain} disabled={running || !connId} style={{ ...primaryBtn, opacity: running || !connId ? 0.5 : 1 }}>
                {running ? '分析中…' : '出执行计划'}
              </button>
            </div>
            {selectedConn?.engine === 'mysql' && analyze && null}
          </>
        )}

        {tab === 'paste' && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: C.textDim }}>引擎：</span>
              <select value={pasteEngine} onChange={(e) => setPasteEngine(e.target.value as typeof pasteEngine)} style={{ ...inputStyle, width: 140 }}>
                <option value="auto">自动识别</option>
                <option value="pg">PostgreSQL</option>
                <option value="mysql">MySQL（JSON）</option>
              </select>
              <span style={{ color: C.textFaint, flex: 1 }}>生产库连不上？把 EXPLAIN 输出原样贴进来</span>
              <button onClick={runParse} disabled={running || !pasteText.trim()} style={{ ...primaryBtn, opacity: running ? 0.5 : 1 }}>{running ? '解析中…' : '解析计划'}</button>
            </div>
            <textarea
              value={pasteText} onChange={(e) => setPasteText(e.target.value)} spellCheck={false}
              placeholder={'PG：EXPLAIN (ANALYZE, BUFFERS) 的整段文本输出；或任一引擎 EXPLAIN (FORMAT JSON) 的 JSON。\nMySQL 请贴 FORMAT=JSON 的 JSON 输出。'}
              style={{ ...textareaStyle, minHeight: 160 }}
            />
          </>
        )}

        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.length === 0 && <div style={{ color: C.textFaint }}>暂无历史。每次成功分析会自动留痕（最多 30 条）。</div>}
            {history.map((h) => (
              <button key={h.id} onClick={() => loadHistory(h.id)} style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: C.textFaint }}>{new Date(h.ts).toLocaleString()}</span>
                  <span style={{ color: C.accent }}>{h.engine === 'pg' ? 'PG' : 'MySQL'}{h.analyzeUsed ? ' · ANALYZE' : ''}</span>
                  <span style={{ color: h.findingsCount ? C.warn : C.good }}>发现 {h.findingsCount}</span>
                  <span style={{ color: C.textFaint }}>{h.connName}</span>
                </div>
                <div style={{ fontFamily: 'monospace', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.sql}</div>
              </button>
            ))}
            {history.length > 0 && (
              <button onClick={async () => { await api('history.clear', {}, meta); await refreshHistory(meta!) }} style={{ ...btnStyle, alignSelf: 'flex-start', color: C.danger }}>
                清空历史
              </button>
            )}
          </div>
        )}

        {tab === 'conns' && (
          <ConnManager
            conns={conns} form={form} setForm={setForm} msg={connMsg}
            onSave={saveConn} onDelete={deleteConn} onTest={testConn}
          />
        )}

        {err && <div style={{ ...cardStyle, borderColor: C.danger, color: C.danger }}>{err}</div>}

        {/* 结果区 */}
        {result && plan && (
          <ResultView
            result={result}
            collapsed={collapsed} setCollapsed={setCollapsed}
            selectedNode={selectedNode} setSelectedNode={setSelectedNode}
          />
        )}
        {!result && tab === 'analyze' && (
          <div style={{ color: C.textFaint, lineHeight: 1.8, padding: '8px 4px' }}>
            <div style={{ color: C.textDim, marginBottom: 6 }}>它能做什么：</div>
            <div>· 一键出 EXPLAIN 计划树：每节点的估行/实行、耗时、成本一目了然</div>
            <div>· 中文诊断：全表扫描、统计信息过期、排序落盘、filesort/temporary…每条带建议动作</div>
            <div>· 生产库连不上？「粘贴解析」里贴 EXPLAIN 输出即可离线分析</div>
            <div>· 「发到聊天让 AI 解读」把计划与发现直送对话</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 结果渲染 ────────────────────────────────────────────────────────────────

function ResultView({ result, collapsed, setCollapsed, selectedNode, setSelectedNode }: {
  result: ExplainResult
  collapsed: Set<string>
  setCollapsed: (s: Set<string>) => void
  selectedNode: PlanNode | null
  setSelectedNode: (n: PlanNode | null) => void
}) {
  const { plan, findings, meta } = result
  const root = plan.root
  const maxMs = plan.actualMs ?? null
  const maxSelf = useMemo(() => {
    let m = 0
    const walk = (n: PlanNode) => { if (n.selfMs && n.selfMs > m) m = n.selfMs; n.children.forEach(walk) }
    walk(root)
    return m || 1
  }, [root])

  const toggle = (id: string) => {
    const s = new Set(collapsed)
    if (s.has(id)) s.delete(id); else s.add(id)
    setCollapsed(s)
  }

  const renderRow = (n: PlanNode, depth: number) => {
    const hasKids = n.children.length > 0
    const isOpen = !collapsed.has(n.id)
    const selfPct = maxMs && n.selfMs !== null ? Math.min(100, (n.selfMs / maxSelf) * 100) : 0
    const isSel = selectedNode?.id === n.id
    return (
      <div key={n.id}>
        <div onClick={() => setSelectedNode(n)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px',
          marginLeft: depth * 14, borderRadius: 4, cursor: 'pointer',
          background: isSel ? '#2A3B55' : 'transparent',
          borderLeft: isSel ? `2px solid ${C.accent}` : '2px solid transparent',
        }}>
          {hasKids
            ? <span onClick={(e) => { e.stopPropagation(); toggle(n.id) }} style={{ cursor: 'pointer', color: C.textFaint, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
            : <span style={{ width: 10 }} />}
          <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            <span style={{ color: colorForNodeType(n) }}>{n.nodeType}</span>
            {n.relation && <span style={{ color: C.text }}> · {n.relation}</span>}
            {n.indexName && <span style={{ color: C.good }}> @{n.indexName}</span>}
          </span>
          {n.flags.map((f) => (
            <span key={f} style={{ fontSize: 10, color: f.includes('外排') ? C.danger : C.warn, border: `1px solid ${f.includes('外排') ? C.danger : C.warn}55`, borderRadius: 3, padding: '0 3px' }}>
              {f.split('（')[0]}
            </span>
          ))}
          <span style={{ flex: 1, minWidth: 40 }}>
            {selfPct > 0 && <div style={{ height: 4, borderRadius: 2, width: `${Math.max(3, selfPct)}%`, background: selfPct > 50 ? C.danger : selfPct > 20 ? C.warn : C.accent, opacity: 0.75 }} />}
          </span>
          <span style={{ fontFamily: 'monospace', color: C.textDim, whiteSpace: 'nowrap', fontSize: 11 }}>
            {fmtRows(n.estRows)}→<span style={{ color: misColor(n) }}>{fmtRows(n.actRowsTotal)}</span>
            {' | '}{n.loops > 1 ? `×${n.loops} ` : ''}{fmtMs(n.actualMs)}
            {' | '}c={fmtCost(n.estCost)}
          </span>
        </div>
        {hasKids && isOpen && n.children.map((c) => renderRow(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 统计条 */}
      <div style={{ ...cardStyle, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>{plan.engine === 'pg' ? 'PostgreSQL' : 'MySQL'}{meta?.serverVersion ? ` ${meta.serverVersion}` : ''}</span>
        <span>{meta?.analyzeUsed ? <span style={{ color: C.warn }}>实际执行 ANALYZE</span> : '估算计划'}</span>
        {plan.executionMs !== null ? <span>执行 <b style={{ color: C.text }}>{fmtMs(plan.executionMs)}</b></span> : null}
        {plan.planningMs !== null ? <span>规划 {fmtMs(plan.planningMs)}</span> : null}
        <span>总成本 <b style={{ color: C.text }}>{fmtCost(plan.totalCost)}</b></span>
        <span>{plan.nodeCount} 节点</span>
        {meta?.durationMs !== undefined && <span style={{ color: C.textFaint }}>（{meta.durationMs}ms 取回）</span>}
      </div>
      {meta?.note && <div style={{ ...cardStyle, borderColor: C.warn, color: C.warn }}>{meta.note}</div>}

      {/* 发现 */}
      {findings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {findings.map((f) => <FindingCard key={f.id} f={f} />)}
        </div>
      )}
      {findings.length === 0 && (
        <div style={{ ...cardStyle, color: C.good }}>✓ 未命中已知问题模式（不代表没问题——结合行数与业务核对）</div>
      )}

      {/* 计划树 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ color: C.textDim }}>计划树</span>
          <span style={{ color: C.textFaint, fontSize: 11 }}>估行→实行 | 自耗时条 | cost</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setCollapsed(new Set())} style={{ ...btnStyle, fontSize: 11 }}>全部展开</button>
          <button onClick={() => {
            const s = new Set<string>()
            const walk = (n: PlanNode, d: number) => { if (d >= 1 && n.children.length) s.add(n.id); n.children.forEach((c) => walk(c, d + 1)) }
            walk(root, 0)
            setCollapsed(s)
          }} style={{ ...btnStyle, fontSize: 11 }}>折叠到顶层</button>
        </div>
        <div style={{ ...cardStyle, padding: 6, overflowX: 'auto' }}>{renderRow(root, 0)}</div>
      </div>

      {/* 节点详情 */}
      {selectedNode && <NodeDetail node={selectedNode} />}

      {/* 原始 JSON */}
      {result.raw && (
        <details>
          <summary style={{ cursor: 'pointer', color: C.textFaint }}>原始计划输出</summary>
          <pre style={{ ...cardStyle, fontFamily: 'monospace', fontSize: 11, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result.raw}</pre>
        </details>
      )}
    </div>
  )
}

function colorForNodeType(n: PlanNode): string {
  const t = n.nodeType
  if (t.includes('全表扫描') || t === 'Seq Scan') return C.danger
  if (t.includes('filesort') || t.includes('Temporary') || t.includes('Sort')) return C.warn
  if (n.flags.some((f) => f.includes('覆盖索引'))) return C.good
  return C.info
}
function misColor(n: PlanNode): string {
  if (n.actRowsTotal === null || n.estRows === null) return C.textDim
  const ratio = n.actRowsTotal / Math.max(1, n.estRows)
  if (ratio >= 10 || ratio <= 0.1) return C.warn
  return C.textDim
}

function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState(f.severity === 'critical')
  return (
    <div style={{ ...cardStyle, borderColor: `${sevColor[f.severity]}66` }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ color: sevColor[f.severity], fontWeight: 600, fontSize: 10, border: `1px solid ${sevColor[f.severity]}`, borderRadius: 3, padding: '0 4px' }}>
          {sevLabel[f.severity]}
        </span>
        <span style={{ flex: 1 }}>{f.title}</span>
        <span style={{ color: C.textFaint }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>
          {f.detail && <div style={{ color: C.textDim }}><b>细节：</b>{f.detail}</div>}
          <div style={{ color: C.textDim }}><b style={{ color: C.good }}>建议：</b>{f.suggestion}</div>
        </div>
      )}
    </div>
  )
}

function NodeDetail({ node }: { node: PlanNode }) {
  const entries = Object.entries(node.detail)
  return (
    <div style={{ ...cardStyle, borderColor: C.accent }}>
      <div style={{ marginBottom: 6 }}>
        <b style={{ color: C.info }}>{node.nodeType}</b>
        {node.relation && ` on ${node.relation}`}
        {node.alias && node.alias !== node.relation ? ` (别名 ${node.alias})` : ''}
        {node.indexName && ` using ${node.indexName}`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 16px', fontFamily: 'monospace', fontSize: 11 }}>
        <span style={{ color: C.textFaint }}>估算行数</span><span>{fmtRows(node.estRows)}{node.examinedPerScan != null ? `（每扫检查 ${fmtRows(node.examinedPerScan)}）` : ''}</span>
        {node.filteredPct != null && <><span style={{ color: C.textFaint }}>过滤保留</span><span>{node.filteredPct}%</span></>}
        <span style={{ color: C.textFaint }}>实际行数</span><span>{fmtRows(node.actRowsTotal)}{node.loops > 1 ? `（${node.loops} 次循环）` : ''}</span>
        {node.actualMs !== null && <><span style={{ color: C.textFaint }}>总耗时</span><span>{fmtMs(node.actualMs)}（自身 {fmtMs(node.selfMs)}）</span></>}
        {node.startupMs !== null && <><span style={{ color: C.textFaint }}>首行耗时</span><span>{fmtMs(node.startupMs)}</span></>}
        {node.estCost !== null && <><span style={{ color: C.textFaint }}>累计成本</span><span>{fmtCost(node.estCost)}</span></>}
        {node.removedByFilter != null && node.removedByFilter > 0 && <><span style={{ color: C.textFaint }}>被过滤丢弃</span><span style={{ color: C.warn }}>{fmtRows(node.removedByFilter)}</span></>}
      </div>
      {node.flags.length > 0 && (
        <div style={{ marginTop: 6 }}>{node.flags.map((f) => <span key={f} style={{ color: C.warn, marginRight: 8 }}>{f}</span>)}</div>
      )}
      {entries.length > 0 && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.6 }}>
              <span style={{ color: C.textFaint, minWidth: 150 }}>{k}</span>
              <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 连接管理 ────────────────────────────────────────────────────────────────

function ConnManager({ conns, form, setForm, msg, onSave, onDelete, onTest }: {
  conns: ConnInfo[]
  form: Partial<ConnInfo> & { password?: string }
  setForm: (f: Partial<ConnInfo> & { password?: string }) => void
  msg: string
  onSave: () => void
  onDelete: (id: string) => void
  onTest: (id: string) => void
}) {
  const isPg = (form.engine || 'mysql') === 'pg'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 8, color: C.textDim }}>{form.id ? `编辑连接 ${form.name}` : '新增连接'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 6, alignItems: 'center' }}>
          <span style={{ color: C.textFaint }}>名称</span>
          <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：生产从库" style={inputStyle} />
          <span style={{ color: C.textFaint }}>类型</span>
          <select value={form.engine || 'mysql'} onChange={(e) => setForm({ ...form, engine: e.target.value as 'pg' | 'mysql', port: undefined })} style={inputStyle}>
            <option value="mysql">MySQL</option>
            <option value="pg">PostgreSQL</option>
          </select>
          <span style={{ color: C.textFaint }}>主机</span>
          <input value={form.host || ''} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="127.0.0.1" style={inputStyle} />
          <span style={{ color: C.textFaint }}>端口</span>
          <input value={form.port ?? ''} onChange={(e) => setForm({ ...form, port: Number(e.target.value) || undefined })} placeholder={isPg ? '5432' : '3306'} style={inputStyle} />
          <span style={{ color: C.textFaint }}>数据库</span>
          <input value={form.database || ''} onChange={(e) => setForm({ ...form, database: e.target.value })} style={inputStyle} />
          <span style={{ color: C.textFaint }}>用户</span>
          <input value={form.user || ''} onChange={(e) => setForm({ ...form, user: e.target.value })} style={inputStyle} />
          <span style={{ color: C.textFaint }}>密码</span>
          <input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id && form.hasPassword ? '留空则保留原密码' : '必填'} style={inputStyle} />
          {isPg && (
            <>
              <span style={{ color: C.textFaint }}>SSL</span>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={!!form.ssl} onChange={(e) => setForm({ ...form, ssl: e.target.checked })} /> 启用（不校验证书）
              </label>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <button onClick={onSave} style={primaryBtn}>保存连接</button>
          {form.id && <button onClick={() => setForm({})} style={btnStyle}>取消编辑</button>}
          {msg && <span style={{ color: msg.startsWith('连接失败') || msg.includes('失败') ? C.danger : C.good }}>{msg}</span>}
        </div>
      </div>
      {conns.map((c) => (
        <div key={c.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div><b>{c.name}</b> <span style={{ color: C.textFaint }}>{c.engine === 'pg' ? 'PostgreSQL' : 'MySQL'} · {c.user}@{c.host}:{c.port}/{c.database}{c.ssl ? ' · SSL' : ''}</span></div>
          </div>
          <button onClick={() => onTest(c.id)} style={btnStyle}>测试</button>
          <button onClick={() => setForm({ ...c, password: '' })} style={btnStyle}>编辑</button>
          <button onClick={() => onDelete(c.id)} style={{ ...btnStyle, color: C.danger }}>删除</button>
        </div>
      ))}
      <div style={{ color: C.textFaint, lineHeight: 1.7 }}>
        密码只保存在本机服务侧文件（AES 加密落盘），不进 kv、不进日志、不进 AI 上下文。
      </div>
    </div>
  )
}

// ── 通用样式 ────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
  color: C.text, padding: '5px 8px', fontSize: 12, outline: 'none', width: '100%',
  boxSizing: 'border-box',
}
const textareaStyle: React.CSSProperties = {
  ...inputStyle, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6,
}
const btnStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.surface2, color: C.textDim, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
}
const primaryBtn: React.CSSProperties = {
  ...btnStyle, background: C.accent, color: '#fff', border: 'none', fontWeight: 600,
}
const cardStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12,
}

/** 渲染冒烟专用出口（不进业务路径） */
export const __test = { ResultView, FindingCard, NodeDetail }
