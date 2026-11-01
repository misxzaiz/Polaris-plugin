/**
 * PackTab —— 打包主流程：路径 → 扫描 → 树勾选 → token 预算 → 打包 → 出包
 *
 * 状态自持：扫描结果（rows）与选中集（selected）在 Tab 内管理；
 * 选中集防抖持久化 cpk.sel（重开面板按路径恢复）。
 * 命令链：sendCommand ack（id）→ 轮询 cpk.scan/cpack 索引键 → done 拉分块。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  sendCommand, getScan, readScanTree, getPack, readPackChunks,
  saveSelection, loadSelection, currentWorkspace, fmtBytes, copyText, trimToBudget,
  type EntryRow, type PackIndex, type ScanIndex,
} from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const PACK_POLL_MS = 1200
const PACK_POLL_TIMEOUT = 180 * 1000
const CHAT_SEND_LIMIT = 2 * 1024 * 1024 // 发送到聊天安全上限（聊天输入消化能力保护）

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  size: number
  tokens: number
  flags: string
  children: TreeNode[]
}

function buildTree(rows: EntryRow[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, size: 0, tokens: 0, flags: '', children: [] }
  const dirIndex = new Map<string, TreeNode>([['', root]])
  const ensureDir = (dirPath: string): TreeNode => {
    let d = dirIndex.get(dirPath)
    if (d) return d
    const segs = dirPath.split('/')
    const name = segs[segs.length - 1]
    const parent = ensureDir(segs.slice(0, -1).join('/'))
    d = { name, path: dirPath, isDir: true, size: 0, tokens: 0, flags: '', children: [] }
    parent.children.push(d)
    dirIndex.set(dirPath, d)
    return d
  }
  for (const [rel, isDir, size, tokens, flags] of rows) {
    if (isDir) {
      ensureDir(rel)
      continue
    }
    const segs = rel.split('/')
    const parent = ensureDir(segs.slice(0, -1).join('/'))
    parent.children.push({ name: segs[segs.length - 1], path: rel, isDir: false, size, tokens, flags, children: [] })
  }
  const sortNode = (n: TreeNode) => {
    n.children.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    n.children.forEach(sortNode)
  }
  sortNode(root)
  return root
}

/** 聚合：目录下可打包文件数 / 总 token / 已选中数 */
function aggregate(root: TreeNode, selected: Set<string>): Map<string, { total: number; sel: number; tokens: number; selTokens: number }> {
  const agg = new Map()
  const walk = (n: TreeNode): { total: number; sel: number; tokens: number; selTokens: number } => {
    if (!n.isDir) {
      const packable = !n.flags.includes('b') && !n.flags.includes('L') ? 1 : 0
      const isSel = selected.has(n.path) ? 1 : 0
      return { total: packable, sel: isSel, tokens: n.tokens, selTokens: isSel ? n.tokens : 0 }
    }
    let total = 0
    let sel = 0
    let tokens = 0
    let selTokens = 0
    for (const c of n.children) {
      const a = walk(c)
      total += a.total
      sel += a.sel
      tokens += a.tokens
      selTokens += a.selTokens
    }
    agg.set(n.path, { total, sel, tokens, selTokens }) // 含根（path=''），预算条读 agg.get('')
    return { total, sel, tokens, selTokens }
  }
  walk(root)
  return agg
}

function collectPackable(n: TreeNode, out: string[]): void {
  if (!n.isDir) {
    if (!n.flags.includes('b') && !n.flags.includes('L')) out.push(n.path)
    return
  }
  for (const c of n.children) collectPackable(c, out)
}

export default function PackTab({ running, showToast, onSendToChat }: {
  running: boolean
  showToast: Toast
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const [pathInput, setPathInput] = useState('')
  const [scan, setScan] = useState<ScanIndex | null>(null)
  const [rows, setRows] = useState<EntryRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [filter, setFilter] = useState('')
  const [budget, setBudget] = useState(100000)
  const [pack, setPack] = useState<PackIndex | null>(null)
  const [packPreview, setPackPreview] = useState('')
  const [sendNote, setSendNote] = useState('')
  const [sendArmed, setSendArmed] = useState(false)
  const [busy, setBusy] = useState<'' | 'scan' | 'pack'>('')
  const selSaveTimer = useRef<number | undefined>(undefined)
  const pollTimer = useRef<number | undefined>(undefined)
  const mountedRef = useRef(true)

  useEffect(() => {
    // 宿主 dev 为 React StrictMode（setup→cleanup→setup）：重挂载必须复位，否则
    // 轮询循环首轮 mountedRef.current===false 静默 return，busy 永挂（真宿主实测踩中）
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      window.clearTimeout(pollTimer.current)
    }
  }, [])

  // 恢复上次选中集（按路径匹配才应用）
  useEffect(() => {
    void (async () => {
      const sel = await loadSelection()
      if (sel && sel.path) setPathInput(sel.path)
    })()
  }, [])

  const tree = useMemo(() => buildTree(rows), [rows])
  const agg = useMemo(() => aggregate(tree, selected), [tree, selected])
  const rootAgg = agg.get('') || { total: 0, sel: 0, tokens: 0, selTokens: 0 }

  const packableRows = useMemo(() => rows.filter((r) => !r[1] && !String(r[4]).includes('b') && !String(r[4]).includes('L')), [rows])

  const persistSelection = useCallback((path: string, sel: Set<string>) => {
    window.clearTimeout(selSaveTimer.current)
    selSaveTimer.current = window.setTimeout(() => {
      void saveSelection({ path, selected: [...sel].slice(0, 20000), updatedAt: Date.now() })
    }, 800)
  }, [])

  const applyScanResult = useCallback((idx: ScanIndex, treeRows: EntryRow[]) => {
    setRows(treeRows)
    // 默认选中全部可打包文件（二进制/超大排除）
    const packable = treeRows.filter((r) => !r[1] && !String(r[4]).includes('b') && !String(r[4]).includes('L')).map((r) => r[0])
    setSelected(new Set(packable.slice(0, 20000)))
    setExpanded(new Set(['']))
    void loadSelection().then((sel) => {
      if (!sel || sel.path !== idx.path) return
      const valid = new Set(treeRows.filter((r) => !r[1]).map((r) => r[0]))
      const restored = sel.selected.filter((p) => valid.has(p))
      if (restored.length) setSelected(new Set(restored))
    })
  }, [])

  const doScan = useCallback(async () => {
    const p = pathInput.trim()
    if (!p) { showToast('请输入目录路径', 'bad'); return }
    if (!running) { showToast('服务离线：先去设置页启动服务', 'bad'); return }
    setBusy('scan')
    setScan(null)
    setRows([])
    setSelected(new Set())
    try {
      const ack = await sendCommand<{ id?: string }>('scan', { path: p })
      if (!ack.ok || !ack.id) throw new Error(ack.error || '扫描命令未被接受')
      const id = ack.id
      // 轮询扫描索引键
      const deadline = Date.now() + 120 * 1000
      let idx: ScanIndex | null = null
      while (Date.now() < deadline) {
        if (!mountedRef.current) return
        await new Promise((r) => setTimeout(r, 1000))
        idx = await getScan(id)
        if (idx && (idx.state === 'done' || idx.state === 'error')) break
      }
      if (!idx) throw new Error('扫描超时（服务可能离线）')
      setScan(idx)
      if (idx.state === 'error') throw new Error(idx.error || '扫描失败')
      const treeRows = await readScanTree(id, idx.treeChunks || 0)
      applyScanResult(idx, treeRows)
      showToast(`扫描完成：${idx.fileCount ?? 0} 文件 · ~${idx.totalTokens ?? 0} tokens`, 'good')
    } catch (e) {
      showToast(`扫描失败：${(e as Error).message}`, 'bad')
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [pathInput, running, showToast, applyScanResult])

  const doPack = useCallback(async () => {
    const p = pathInput.trim()
    if (!p) { showToast('请输入目录路径', 'bad'); return }
    if (selected.size === 0) { showToast('未选择任何文件', 'bad'); return }
    if (!running) { showToast('服务离线：先去设置页启动服务', 'bad'); return }
    setBusy('pack')
    setPack(null)
    setPackPreview('')
    try {
      const ack = await sendCommand<{ id?: string }>('pack', { path: p, include: [...selected] })
      if (!ack.ok || !ack.id) throw new Error(ack.error || '打包命令未被接受')
      const id = ack.id
      const deadline = Date.now() + PACK_POLL_TIMEOUT
      let idx: PackIndex | null = null
      while (Date.now() < deadline) {
        if (!mountedRef.current) return
        await new Promise((r) => setTimeout(r, PACK_POLL_MS))
        idx = await getPack(id)
        if (idx && (idx.state === 'done' || idx.state === 'error')) break
      }
      if (!idx) throw new Error('打包超时')
      setPack(idx)
      setSendNote('')
      setSendArmed(false)
      if (idx.state === 'error') throw new Error(idx.error || '打包失败')
      const text = await readPackChunks(id, idx.chunks || 0)
      setPackPreview(text ? text.slice(0, 4000) : '')
      showToast(`打包完成：${idx.stats?.files ?? 0} 文件 · ~${idx.stats?.tokens ?? 0} tokens`, 'good')
    } catch (e) {
      showToast(`打包失败：${(e as Error).message}`, 'bad')
    } finally {
      if (mountedRef.current) setBusy('')
    }
  }, [pathInput, selected, running, showToast])

  // ── 勾选操作 ────────────────────────────────────────────────────────────
  const toggleFile = (rel: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      if (scan) persistSelection(scan.path, next)
      return next
    })
  }
  const collectUnder = (node: TreeNode): string[] => {
    const out: string[] = []
    const walk = (n: TreeNode) => {
      if (!n.isDir) { out.push(n.path); return }
      for (const c of n.children) walk(c)
    }
    walk(node)
    return out
  }
  const toggleDir = (node: TreeNode) => {
    const a = agg.get(node.path)
    const willSelect = !a || a.sel < a.total
    setSelected((prev) => {
      const next = new Set(prev)
      for (const rel of collectUnder(node)) {
        if (willSelect) next.add(rel)
        else next.delete(rel)
      }
      if (scan) persistSelection(scan.path, next)
      return next
    })
  }
  const selectAll = () => {
    const out: string[] = []
    collectPackable(tree, out)
    setSelected(new Set(out.slice(0, 20000)))
    if (scan) persistSelection(scan.path, new Set(out.slice(0, 20000)))
  }
  const clearAll = () => {
    setSelected(new Set())
    if (scan) persistSelection(scan.path, new Set())
  }
  const doTrim = () => {
    const files = packableRows
      .filter((r) => selected.has(r[0]))
      .map((r) => ({ rel: r[0], tokens: r[3] || 0 }))
    const r = trimToBudget(files, budget)
    setSelected(new Set(r.kept))
    if (scan) persistSelection(scan.path, new Set(r.kept))
    showToast(`已裁剪 ${r.removed.length} 个文件 → ~${r.tokens} tokens`, 'good')
  }

  const overBudget = rootAgg.selTokens > budget

  // ── 出包操作 ────────────────────────────────────────────────────────────
  const fullText = async (): Promise<string | null> => {
    if (!pack || !pack.chunks) return null
    return readPackChunks(pack.id, pack.chunks)
  }
  const onCopy = async () => {
    const text = await fullText()
    if (!text) { showToast('内容分块不可读（可能超过 4MB：请直接取文件）', 'bad'); return }
    const ok = await copyText(text)
    showToast(ok ? `已复制全文（${fmtBytes(pack?.fileBytes)}）` : '复制失败', ok ? 'good' : 'bad')
  }
  const onSendChat = async () => {
    if (!onSendToChat) { showToast('宿主不支持发给 AI', 'bad'); return }
    const text = await fullText()
    if (!text) { showToast('内容分块不可读（可能超过 4MB：请直接取文件）', 'bad'); return }
    // 宿主 onSendToChat 语义 = 立即发送给当前 AI 会话（非填充输入框）。
    // >2MB 双击确认（部分 webview 无原生 confirm，不能用 window.confirm）；
    // 任务备注取卡片内联输入框（webview 常禁 window.prompt），拼在包前避免「只有代码没有任务」
    if (text.length > CHAT_SEND_LIMIT && !sendArmed) {
      setSendArmed(true)
      showToast('包超过 2MB：确认无误请再点一次「发给 AI」', 'info')
      return
    }
    const note = sendNote.trim()
    await onSendToChat(note ? `${note}\n\n${text}` : text)
    setSendArmed(false)
    showToast('已发送到当前 AI 会话', 'good')
  }

  const filteredTree = useMemo(() => {
    if (!filter.trim()) return null
    const f = filter.trim().toLowerCase()
    const keep = (n: TreeNode): TreeNode | null => {
      if (!n.isDir) return n.path.toLowerCase().includes(f) ? n : null
      const children = n.children.map(keep).filter(Boolean) as TreeNode[]
      if (!children.length) return null
      return { ...n, children }
    }
    return keep(tree)
  }, [tree, filter])

  const renderRow = (n: TreeNode, depth: number): JSX.Element => {
    const a = n.isDir ? agg.get(n.path) : null
    const isOpen = expanded.has(n.path)
    const state: 'all' | 'none' | 'some' = !a ? (selected.has(n.path) ? 'all' : 'none') : a.sel === 0 ? 'none' : a.sel >= a.total ? 'all' : 'some'
    const box = state === 'all' ? '☑' : state === 'some' ? '▣' : '☐'
    return (
      <div key={n.path}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0',
            paddingLeft: depth * 14, fontSize: 12, lineHeight: '20px',
            color: n.isDir ? '#e4e4e7' : '#a1a1aa', cursor: 'pointer',
          }}
        >
          <span
            onClick={(e) => { e.stopPropagation(); n.isDir ? toggleDir(n) : toggleFile(n.path) }}
            style={{ color: state === 'some' ? '#93c5fd' : '#3b82f6', width: 16, textAlign: 'center', flexShrink: 0 }}
          >{box}</span>
          {n.isDir ? (
            <span
              onClick={() => setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(n.path)) next.delete(n.path)
                else next.add(n.path)
                return next
              })}
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {isOpen ? '▾ ' : '▸ '}{n.name}/
              <span style={{ color: '#52525b', fontSize: 10 }}> {a?.total ?? 0} 文件 · ~{a?.tokens ?? 0} tok</span>
            </span>
          ) : (
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.path}>
              {n.name}
              <span style={{ color: '#52525b', fontSize: 10 }}>
                {' '}~{n.tokens} tok · {fmtBytes(n.size)}
                {n.flags.includes('b') ? ' · 二进制' : ''}
                {n.flags.includes('L') ? ' · 超上限' : ''}
              </span>
            </span>
          )}
        </div>
        {n.isDir && isOpen && n.children.map((c) => renderRow(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 路径行 */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          placeholder="目录绝对路径，如 D:\space\base\Polaris"
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #3f3f46',
            background: '#18181b', color: '#e4e4e7', fontSize: 12, minWidth: 0,
          }}
        />
        <button
          onClick={() => { const w = currentWorkspace(); if (w) setPathInput(w); else showToast('宿主未提供当前工作区路径', 'bad') }}
          style={{ ...btnStyle }}
        >工作区</button>
        <button onClick={() => void doScan()} disabled={busy !== ''} style={{ ...btnStyle, opacity: busy ? 0.5 : 1 }}>
          {busy === 'scan' ? '扫描中…' : '扫描'}
        </button>
      </div>

      {/* 扫描概要 */}
      {scan && scan.state === 'done' && (
        <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>✅ {scan.path}</span>
          <span>{scan.fileCount} 文件 / {scan.dirCount} 目录</span>
          <span>~{scan.totalTokens} tokens · {fmtBytes(scan.totalBytes)}</span>
          {!!scan.ignoreCount && <span style={{ color: '#52525b' }}>忽略 {scan.ignoreCount} 项</span>}
          {scan.truncated && <span style={{ color: '#d29922' }}>⚠ 超 20000 文件上限，结果不完整</span>}
        </div>
      )}

      {/* 预算条 */}
      {rows.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 10px', borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b',
        }}>
          <span style={{ fontSize: 11, color: '#a1a1aa' }}>已选 {rootAgg.sel}/{rootAgg.total} 文件 · ~{rootAgg.selTokens} tok</span>
          <div style={{ flex: 1, minWidth: 120, height: 8, borderRadius: 4, background: '#27272a', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (rootAgg.selTokens / Math.max(1, budget)) * 100)}%`,
              height: '100%', background: overBudget ? '#f85149' : '#3b82f6',
              transition: 'width .2s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: overBudget ? '#f85149' : '#a1a1aa' }}>预算 {budget}</span>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Math.max(1000, parseInt(e.target.value, 10) || 100000))}
            style={{ width: 84, padding: '3px 6px', borderRadius: 6, border: '1px solid #3f3f46', background: '#09090b', color: '#e4e4e7', fontSize: 11 }}
          />
          {[32000, 64000, 128000, 200000].map((b) => (
            <button key={b} onClick={() => setBudget(b)} style={{ ...btnStyle, padding: '3px 8px', fontSize: 10 }}>{b >= 1000 ? `${b / 1000}k` : b}</button>
          ))}
          <button onClick={doTrim} disabled={!overBudget} style={{ ...btnStyle, padding: '3px 10px', fontSize: 10, opacity: overBudget ? 1 : 0.4 }}>
            裁剪到预算
          </button>
          <button onClick={selectAll} style={{ ...btnStyle, padding: '3px 10px', fontSize: 10 }}>全选</button>
          <button onClick={clearAll} style={{ ...btnStyle, padding: '3px 10px', fontSize: 10 }}>清空</button>
          <button
            onClick={() => void doPack()}
            disabled={busy !== '' || selected.size === 0}
            style={{
              padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 11, cursor: 'pointer',
              background: busy === 'pack' ? '#1d4ed8' : '#3b82f6', color: '#fff',
              opacity: busy || selected.size === 0 ? 0.6 : 1,
            }}
          >{busy === 'pack' ? '打包中…' : `打包 ${selected.size} 文件`}</button>
        </div>
      )}

      {/* 过滤 */}
      {rows.length > 0 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="过滤文件路径（子串匹配；清空恢复树）"
          style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid #3f3f46',
            background: '#18181b', color: '#e4e4e7', fontSize: 11,
          }}
        />
      )}

      {/* 树 */}
      {rows.length > 0 && (
        <div style={{
          flex: 1, minHeight: 160, maxHeight: 380, overflow: 'auto', borderRadius: 8,
          border: '1px solid #27272a', background: '#0c0c0e', padding: '6px 8px',
        }}>
          {(filteredTree ? [filteredTree] : tree.children).map((c) => renderRow(c, 0))}
          {filteredTree && <div style={{ fontSize: 10, color: '#52525b', padding: '4px 0' }}>过滤模式：仅显示匹配项（含其所在链路）</div>}
        </div>
      )}

      {/* 打包结果 */}
      {pack && pack.state === 'done' && (
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(63,185,80,.4)', background: 'rgba(63,185,80,.06)' }}>
          <div style={{ fontSize: 12, color: '#a7f3d0', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <b>📦 包已生成</b>
            <span>{pack.stats?.files} 文件 · ~{pack.stats?.tokens} tokens · {fmtBytes(pack.fileBytes)}</span>
            {pack.chunkTruncated && <span style={{ color: '#d29922' }}>⚠ 超过 4MB，预览/复制不可用，请直接取文件</span>}
          </div>
          <div style={{ fontSize: 10, color: '#52525b', marginBottom: 6, wordBreak: 'break-all' }}>文件：{pack.file}</div>
          {!!pack.truncatedFiles?.length && (
            <div style={{ fontSize: 10, color: '#d29922', marginBottom: 6 }}>
              {pack.truncatedFiles.length} 个文件未完整纳入（二进制/超上限/读取失败）
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <input
              value={sendNote}
              onChange={(e) => setSendNote(e.target.value)}
              placeholder="发给 AI 时附一句任务（可选，拼在包前）"
              style={{
                flex: 1, minWidth: 140, padding: '5px 8px', borderRadius: 6,
                border: '1px solid #3f3f46', background: '#09090b', color: '#e4e4e7', fontSize: 11,
              }}
            />
            <button onClick={() => void onCopy()} style={{ ...btnStyle }}>复制全文</button>
            {onSendToChat && (
              <button
                onClick={() => void onSendChat()}
                style={{ ...btnPrimary, background: sendArmed ? '#f85149' : '#3b82f6' }}
              >{sendArmed ? '确认发送（超 2MB）' : '发给 AI'}</button>
            )}
          </div>
          {packPreview && (
            <pre style={{
              margin: 0, padding: 8, borderRadius: 6, background: '#09090b', border: '1px solid #27272a',
              fontSize: 10, color: '#71717a', maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{packPreview}…</pre>
          )}
        </div>
      )}

      {!rows.length && !busy && (
        <div style={{ fontSize: 12, color: '#71717a', padding: '12px 4px', lineHeight: 1.8 }}>
          ① 输入目录（或点「工作区」）→ 扫描<br />
          ② 树中勾选要带给 LLM 的文件（二进制/超限文件自动排除）<br />
          ③ 看预算条控制 token 量（可一键裁剪）→ 打包<br />
          ④ 复制全文 / 发给 AI（附一句任务一起发）/ 取包文件
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid #3f3f46',
  background: '#27272a', color: '#d4d4d8', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnPrimary: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: 'none',
  background: '#3b82f6', color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
}
