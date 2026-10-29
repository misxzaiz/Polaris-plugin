/**
 * 心图画布主体：手搓无限画布（仓内无先例，不引画布库）。
 *
 * 视图：viewport div（pointer 交互）→ world div（translate+scale）→ SVG 边层 + 节点 DOM 层。
 * 交互：空白拖拽/中键/Space+拖=平移；Ctrl/Cmd+滚轮=光标锚缩放（触控板捏合走 ctrl+wheel）；
 *       双指=捏合缩放+平移；节点拖移（松手经 core 吸附）；侧柄拖拽=建边；双击=编辑。
 * 写路径：全部经 shared/canvas-core.js applyOps 校验试算 → 乐观上屏 → 落 kv（失败回滚）。
 * 同步：5s 轮询 + visibilitychange；仅当远端 rev 更新且本地空闲（无拖拽/编辑）时热替换并保留视口。
 * 撤销：本地会话快照栈（≤50），撤销/重做同样落盘；不做跨端合并（spec §九 如实标注）。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadBoard, saveBoard, xcore, type BoardDoc, type CanvasNode, type CanvasOp } from './model'

interface Viewport { px: number; py: number; z: number }

type DragState =
  | { kind: 'pan'; sx: number; sy: number; px0: number; py0: number }
  | { kind: 'node'; swx: number; swy: number; origins: Map<string, { x: number; y: number }> }
  | { kind: 'edge'; from: string }
  | { kind: 'pinch'; d0: number; mid0: { x: number; y: number }; px0: number; py0: number; z0: number }

const clampZ = (z: number) => Math.min(4, Math.max(0.08, z))
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export function BoardCanvas(props: {
  boardId: string
  title: string
  onBack: () => void
  toast: (text: string, bad?: boolean) => void
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const { boardId, toast } = props
  const [doc, setDoc] = useState<BoardDoc | null>(null)
  const [missing, setMissing] = useState(false)
  const [vp, setVp] = useState<Viewport>({ px: 0, py: 0, z: 1 })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [selEdge, setSelEdge] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [relayoutOpen, setRelayoutOpen] = useState(false)
  const [edgeDraft, setEdgeDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<BoardDoc | null>(null)
  const vpRef = useRef(vp)
  const selRef = useRef(sel)
  const editingRef = useRef(editing)
  const dragRef = useRef<DragState | null>(null)
  const activePtrs = useRef(new Map<number, { x: number; y: number }>()) // 全部活动指针（pinch 依据）
  const preDragDocRef = useRef<BoardDoc | null>(null) // 节点拖拽前的快照（撤销基准）
  const undoRef = useRef<BoardDoc[]>([])
  const redoRef = useRef<BoardDoc[]>([])
  const spaceRef = useRef(false)
  const fitDoneRef = useRef(false)

  vpRef.current = vp
  selRef.current = sel
  editingRef.current = editing

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const v = vpRef.current
    return { x: (clientX - rect.left - v.px) / v.z, y: (clientY - rect.top - v.py) / v.z }
  }, [])

  // ── 数据加载 / 轮询同步 ────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true
    fitDoneRef.current = false
    loadBoard(boardId)
      .then((d) => {
        if (!alive) return
        docRef.current = d
        setDoc(d)
        setMissing(!d)
      })
      .catch((e) => { if (alive) { setMissing(true); toast(`加载画布失败：${(e as Error).message}`, true) } })
    return () => { alive = false }
  }, [boardId, toast])

  const pollOnce = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    if (dragRef.current || editingRef.current) return // 拖拽/编辑中不热替换，防抖动
    try {
      const remote = await loadBoard(boardId)
      if (!remote || !docRef.current) return
      if (remote.rev > docRef.current.rev) {
        docRef.current = remote
        setDoc(remote)
        undoRef.current = []
        redoRef.current = []
        toast('画布已在其他端更新，已刷新')
      }
    } catch { /* 轮询失败静默，下个周期再试 */ }
  }, [boardId, toast])

  useEffect(() => {
    const timer = setInterval(() => { void pollOnce() }, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') void pollOnce() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [pollOnce])

  // ── 视图控制 ───────────────────────────────────────────────────────────────

  const fit = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const d = docRef.current
    const b = d && d.nodes.length ? xcore.bounds(d) : { minX: 0, minY: 0, width: 0, height: 0 }
    const pad = 120
    const z = b.width || b.height
      ? clampZ(Math.min((rect.width - pad) / b.width, (rect.height - pad) / b.height, 1.5))
      : 1
    setVp({
      px: (rect.width - b.width * z) / 2 - b.minX * z,
      py: (rect.height - b.height * z) / 2 - b.minY * z,
      z,
    })
  }, [])

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const v = vpRef.current
    const mx = cx === undefined ? rect.width / 2 : cx - rect.left
    const my = cy === undefined ? rect.height / 2 : cy - rect.top
    const z2 = clampZ(v.z * factor)
    setVp({ z: z2, px: mx - ((mx - v.px) / v.z) * z2, py: my - ((my - v.py) / v.z) * z2 })
  }, [])

  // wheel 用原生监听（React 合成 wheel 是 passive，preventDefault 会告警）
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY)
      } else {
        const v = vpRef.current
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        setVp({ ...v, px: v.px - dx, py: v.py - dy })
      }
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // 首次加载自适应一次
  useEffect(() => {
    if (doc && !fitDoneRef.current && doc.nodes.length) {
      fitDoneRef.current = true
      fit()
    }
  }, [doc, fit])

  // ── 写路径 ────────────────────────────────────────────────────────────────

  const commit = useCallback((ops: CanvasOp[], opts?: { undoable?: boolean }) => {
    const cur = docRef.current
    if (!cur) return false
    const r = xcore.applyOps(cur, ops)
    if (!('doc' in r)) {
      toast(r.errors[0]?.error || '操作被拒绝', true)
      return false
    }
    if (opts?.undoable !== false) {
      undoRef.current.push(clone(cur))
      if (undoRef.current.length > 50) undoRef.current.shift()
      redoRef.current = []
    }
    docRef.current = r.doc
    setDoc(r.doc)
    saveBoard(boardId, r.doc).catch((e) => {
      docRef.current = cur
      setDoc(cur)
      toast(`保存失败已回滚：${(e as Error).message}`, true)
    })
    return true
  }, [boardId, toast])

  const pushUndo = useCallback(() => {
    const cur = docRef.current
    if (!cur) return
    undoRef.current.push(clone(cur))
    if (undoRef.current.length > 50) undoRef.current.shift()
    redoRef.current = []
  }, [])

  const undo = useCallback(() => {
    const prev = undoRef.current.pop()
    const cur = docRef.current
    if (!prev || !cur) return
    redoRef.current.push(clone(cur))
    docRef.current = prev
    setDoc(prev)
    setSel(new Set())
    setSelEdge(null)
    saveBoard(boardId, prev).catch((e) => toast(`撤销保存失败：${(e as Error).message}`, true))
  }, [boardId, toast])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    const cur = docRef.current
    if (!next || !cur) return
    undoRef.current.push(clone(cur))
    docRef.current = next
    setDoc(next)
    setSel(new Set())
    setSelEdge(null)
    saveBoard(boardId, next).catch((e) => toast(`重做保存失败：${(e as Error).message}`, true))
  }, [boardId, toast])

  // ── 交互：pointer 状态机 ──────────────────────────────────────────────────

  const nodeById = useCallback((id: string) => docRef.current?.nodes.find((n) => n.id === id) || null, [])

  const onWrapPointerDownCapture = useCallback((e: React.PointerEvent) => {
    activePtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // 第二指落下 → pan/node 升级为 pinch（node 拖拽中的实时位置回滚到拖前快照）
    const st = dragRef.current
    if (!st || st.kind === 'edge' || st.kind === 'pinch') return
    if (activePtrs.current.size < 2) return
    const pts = [...activePtrs.current.values()]
    const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
    if (st.kind === 'node') {
      const cur = docRef.current
      if (cur) {
        const restored = { ...cur, nodes: cur.nodes.map((n) => { const o = st.origins.get(n.id); return o ? { ...n, x: o.x, y: o.y } : n }) }
        docRef.current = restored
        setDoc(restored)
      }
    }
    dragRef.current = { kind: 'pinch', d0, mid0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, px0: vpRef.current.px, py0: vpRef.current.py, z0: vpRef.current.z }
  }, [])

  const onWrapPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('x-world')) return
    wrapRef.current?.focus()
    if (dragRef.current) return // 拖拽/pinch 已在进行（capture 阶段已接管）
    if (e.button === 0 && !spaceRef.current && (selRef.current.size || selEdge)) {
      setSel(new Set()); setSelEdge(null)
    }
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px0: vpRef.current.px, py0: vpRef.current.py }
    try { wrapRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    e.preventDefault()
  }, [selEdge])

  const onWrapPointerMove = useCallback((e: React.PointerEvent) => {
    const st = dragRef.current
    if (!st) return
    if (st.kind === 'pinch') {
      activePtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePtrs.current.size < 2) return
      const pts = [...activePtrs.current.values()].slice(0, 2)
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const rect = wrapRef.current!.getBoundingClientRect()
      const worldMid = { x: (st.mid0.x - rect.left - st.px0) / st.z0, y: (st.mid0.y - rect.top - st.py0) / st.z0 }
      const z2 = clampZ(st.z0 * (d / st.d0))
      setVp({ z: z2, px: mid.x - rect.left - worldMid.x * z2, py: mid.y - rect.top - worldMid.y * z2 })
      return
    }
    if (st.kind === 'pan') {
      setVp((v) => ({ ...v, px: st.px0 + (e.clientX - st.sx), py: st.py0 + (e.clientY - st.sy) }))
    } else if (st.kind === 'node') {
      const w = toWorld(e.clientX, e.clientY)
      const dx = w.x - st.swx
      const dy = w.y - st.swy
      const cur = docRef.current
      if (!cur) return
      const moved = new Map(cur.nodes.map((n) => {
        const o = st.origins.get(n.id)
        return [n.id, o ? { ...n, x: o.x + dx, y: o.y + dy } : n] as const
      }))
      const next = { ...cur, nodes: cur.nodes.map((n) => moved.get(n.id) || n) }
      docRef.current = next
      setDoc(next)
    } else if (st.kind === 'edge') {
      const w = toWorld(e.clientX, e.clientY)
      const src = nodeById(st.from)
      if (src) setEdgeDraft({ x1: src.x + src.w / 2, y1: src.y + src.h / 2, x2: w.x, y2: w.y })
    }
  }, [nodeById, toWorld])

  const onWrapPointerUp = useCallback((e: React.PointerEvent) => {
    const st = dragRef.current
    activePtrs.current.delete(e.pointerId)
    if (!st) return
    if (st.kind === 'node') {
      const w = toWorld(e.clientX, e.clientY)
      const dx = w.x - st.swx
      const dy = w.y - st.swy
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        const ops: CanvasOp[] = []
        for (const [id, o] of st.origins) {
          ops.push({ op: 'move_node', args: { id, x: o.x + dx, y: o.y + dy } })
        }
        // 拖拽过程已实时上屏；这里经 core 试算吸附后正式落盘；撤销基准=拖前快照
        const cur = docRef.current
        if (cur) {
          const r = xcore.applyOps(cur, ops)
          if ('doc' in r) {
            if (preDragDocRef.current) {
              undoRef.current.push(preDragDocRef.current)
              if (undoRef.current.length > 50) undoRef.current.shift()
              redoRef.current = []
              preDragDocRef.current = null
            }
            docRef.current = r.doc
            setDoc(r.doc)
            saveBoard(boardId, r.doc).catch((er) => {
              docRef.current = cur
              setDoc(cur)
              toast(`保存失败已回滚：${(er as Error).message}`, true)
            })
          }
        }
      }
    } else if (st.kind === 'edge') {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = el?.closest('[data-node-id]')?.getAttribute('data-node-id')
      if (target && target !== st.from) {
        commit([{ op: 'add_edge', args: { from: st.from, to: target } }])
      }
      setEdgeDraft(null)
    }
    if (dragRef.current === st) {
      if (st.kind === 'pinch' && activePtrs.current.size >= 2) return // 剩余两指继续捏合
      dragRef.current = null
    }
  }, [boardId, commit, toWorld, toast])

  const onNodePointerDown = useCallback((e: React.PointerEvent, node: CanvasNode) => {
    if (e.button !== 0) return
    e.stopPropagation()
    wrapRef.current?.focus()
    if (editingRef.current) return // 编辑态下点击别的节点先不抢
    const multi = e.shiftKey || e.ctrlKey || e.metaKey
    let next = new Set(selRef.current)
    if (!next.has(node.id)) next = multi ? new Set([...next, node.id]) : new Set([node.id])
    else if (multi) { next.delete(node.id); setSel(next); selRef.current = next; return }
    setSel(next)
    selRef.current = next
    setSelEdge(null)
    const origins = new Map<string, { x: number; y: number }>()
    for (const id of next) {
      const n = nodeById(id)
      if (n && n.type !== 'group') origins.set(id, { x: n.x, y: n.y })
      else if (n) origins.set(id, { x: n.x, y: n.y }) // group 框本身也可移动（不带走内部节点，core 语义）
    }
    const w = toWorld(e.clientX, e.clientY)
    preDragDocRef.current = clone(docRef.current) // 撤销基准：拖前状态
    dragRef.current = { kind: 'node', swx: w.x, swy: w.y, origins }
    try { wrapRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }, [nodeById, toWorld])

  const onEdgeHandleDown = useCallback((e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation()
    e.preventDefault()
    const w = toWorld(e.clientX, e.clientY)
    dragRef.current = { kind: 'edge', from: node.id }
    setEdgeDraft({ x1: node.x + node.w / 2, y1: node.y + node.h / 2, x2: w.x, y2: w.y })
    try { wrapRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }, [toWorld])

  // ── 键盘 ──────────────────────────────────────────────────────────────────

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return
    if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); return }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
    if (((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y'))) { e.preventDefault(); redo(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const ops: CanvasOp[] = []
      for (const id of selRef.current) ops.push({ op: 'delete_node', args: { id } })
      if (selEdge) ops.push({ op: 'delete_edge', args: { id: selEdge } })
      if (ops.length) { e.preventDefault(); commit(ops) }
      return
    }
    if (e.key === 'Escape') { setSel(new Set()); setSelEdge(null); setEditing(null); setEdgeDraft(null); dragRef.current = null }
  }, [commit, redo, selEdge, undo])

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ') spaceRef.current = false
  }, [])

  // ── 编辑 / 选择工具条动作 ─────────────────────────────────────────────────

  const onEditCommit = useCallback((id: string, patch: { title?: string; text?: string }) => {
    setEditing(null)
    const n = nodeById(id)
    if (!n) return
    const clean: { title?: string; text?: string } = {}
    if (patch.title !== undefined && patch.title !== n.title) clean.title = patch.title
    if (patch.text !== undefined && patch.text !== n.text) clean.text = patch.text
    if (Object.keys(clean).length) commit([{ op: 'update_node', args: { id, patch: clean } }])
  }, [commit, nodeById])

  const setColor = useCallback((color: string) => {
    const ids = [...selRef.current]
    if (!ids.length) return
    commit(ids.map((id) => ({ op: 'update_node', args: { id, patch: { color } } })))
  }, [commit])

  const groupSelected = useCallback(() => {
    const cur = docRef.current
    const ids = [...selRef.current]
    if (!cur || ids.length < 2) return
    const members = cur.nodes.filter((n) => ids.includes(n.id))
    const b = xcore.bounds({ ...cur, nodes: members })
    const pad = 40
    commit([{ op: 'add_group', args: { x: b.minX - pad, y: b.minY - pad, w: b.width + pad * 2, h: b.height + pad * 2, title: '分组' } }])
  }, [commit])

  const deleteSelection = useCallback(() => {
    const ops: CanvasOp[] = [...selRef.current].map((id) => ({ op: 'delete_node', args: { id } }))
    if (selEdge) ops.push({ op: 'delete_edge', args: { id: selEdge } })
    if (ops.length) commit(ops)
    setSel(new Set())
    setSelEdge(null)
  }, [commit, selEdge])

  const relayout = useCallback((direction: string) => {
    setRelayoutOpen(false)
    commit([{ op: 'relayout', args: { direction } }])
  }, [commit])

  const sendOutline = useCallback(async () => {
    const cur = docRef.current
    if (!cur || !props.onSendToChat) return
    const r = xcore.exportMarkdown(cur)
    if ('error' in r && r.error) { toast(r.error, true); return }
    if ('markdown' in r) {
      await props.onSendToChat(`【心图画布《${cur.title}》大纲】\n${r.markdown}`)
      toast('大纲已发到对话')
    }
  }, [props, toast])

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  const nodes = doc?.nodes || []
  const edges = doc?.edges || []
  const selArr = useMemo(() => [...sel], [sel])

  if (missing) {
    return (
      <div className="x-root x-missing">
        <style>{CANVAS_CSS}</style>
        <p>画布不存在或已被删除。</p>
        <button className="x-btn" onClick={props.onBack}>返回列表</button>
      </div>
    )
  }

  return (
    <div className="x-root x-croot">
      <style>{CANVAS_CSS}</style>
      <div className="x-canvas-head">
        <button className="x-btn" onClick={props.onBack}>‹ 列表</button>
        <span className="x-canvas-title">{doc?.title || props.title || '…'}</span>
        <span className="x-canvas-rev">rev {doc?.rev ?? '-'} · {nodes.length} 节点 / {edges.length} 边</span>
      </div>

      <div
        ref={wrapRef}
        className="x-canvas-wrap"
        tabIndex={0}
        data-testid="xintu-canvas"
        style={{
          backgroundPosition: `${vp.px}px ${vp.py}px`,
          backgroundSize: `${40 * vp.z}px ${40 * vp.z}px`,
        }}
        onPointerDown={onWrapPointerDown}
        onPointerDownCapture={onWrapPointerDownCapture}
        onPointerMove={onWrapPointerMove}
        onPointerUp={onWrapPointerUp}
        onPointerCancel={onWrapPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="x-world" style={{ transform: `translate(${vp.px}px, ${vp.py}px) scale(${vp.z})` }}>
          <svg className="x-edge-layer" width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <defs>
              <marker id="x-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--p-text-dim, #8b949e)" />
              </marker>
              <marker id="x-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--p-accent, #4a7dff)" />
              </marker>
            </defs>
            {edges.map((e) => <EdgeView key={e.id} edge={e} from={nodeById(e.from)} to={nodeById(e.to)}
              hot={selEdge === e.id} onPick={() => { setSelEdge(e.id); setSel(new Set()) }} />)}
            {edgeDraft && (
              <line x1={edgeDraft.x1} y1={edgeDraft.y1} x2={edgeDraft.x2} y2={edgeDraft.y2}
                stroke="var(--p-accent, #4a7dff)" strokeWidth={2} strokeDasharray="6 4" />
            )}
          </svg>
          {nodes.map((n) => (
            <NodeView
              key={n.id}
              node={n}
              selected={sel.has(n.id)}
              editing={editing === n.id}
              onPointerDown={onNodePointerDown}
              onEdgeHandleDown={onEdgeHandleDown}
              onDoubleClick={(id) => { setEditing(id) }}
              onEditCommit={onEditCommit}
              onEditCancel={() => setEditing(null)}
            />
          ))}
        </div>

        {/* 右上工具条 */}
        <div className="x-toolbar">
          <button className="x-btn" title="撤销 (Ctrl+Z)" onClick={undo}>↩</button>
          <button className="x-btn" title="重做 (Ctrl+Shift+Z)" onClick={redo}>↪</button>
          <span className="x-toolbar-sep" />
          <button className="x-btn" title="缩小" onClick={() => zoomAt(1 / 1.25)}>−</button>
          <span className="x-zoom">{Math.round(vp.z * 100)}%</span>
          <button className="x-btn" title="放大" onClick={() => zoomAt(1.25)}>＋</button>
          <button className="x-btn" title="适应内容" onClick={fit}>⤢ 适应</button>
          <span className="x-toolbar-sep" />
          <div className="x-relayout-wrap">
            <button className="x-btn" onClick={() => setRelayoutOpen((o) => !o)}>⌗ 重排</button>
            {relayoutOpen && (
              <div className="x-relayout-menu">
                <button className="x-btn" onClick={() => relayout('radial')}>radial 环形（脑暴）</button>
                <button className="x-btn" onClick={() => relayout('LR')}>LR 横向分层（流程）</button>
                <button className="x-btn" onClick={() => relayout('TB')}>TB 纵向分层（层级）</button>
              </div>
            )}
          </div>
          {props.onSendToChat && (
            <button className="x-btn" title="导出大纲并发到对话" onClick={() => void sendOutline()}>发到对话</button>
          )}
        </div>

        {/* 选中浮动条 */}
        {(selArr.length > 0 || selEdge) && (
          <div className="x-selbar">
            {selArr.length > 0 && (
              <>
                <span className="x-selbar-label">{selArr.length} 个节点</span>
                {xcore.COLORS.map((c) => (
                  <button key={c} className={`x-swatch x-swatch-${c}`} title={c}
                    onClick={() => setColor(c)} />
                ))}
                {selArr.length >= 2 && <button className="x-btn" onClick={groupSelected}>成组</button>}
                <button className="x-btn x-btn-danger" onClick={deleteSelection}>删除</button>
              </>
            )}
            {!selArr.length && selEdge && (
              <>
                <span className="x-selbar-label">已选连线</span>
                <button className="x-btn x-btn-danger" onClick={deleteSelection}>删连线</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 边渲染（memo：视口变化不重算）──────────────────────────────────────────

const EdgeView = memo(function EdgeView(props: {
  edge: { id: string; from: string; to: string; label: string }
  from: CanvasNode | null
  to: CanvasNode | null
  hot: boolean
  onPick: () => void
}) {
  const { edge, from, to, hot } = props
  if (!from || !to) return null
  const ac = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  const bc = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
  const horizontal = Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y)
  const s = horizontal ? { x: ac.x < bc.x ? from.x + from.w : from.x, y: ac.y } : { x: ac.x, y: ac.y < bc.y ? from.y + from.h : from.y }
  const t = horizontal ? { x: ac.x < bc.x ? to.x : to.x + to.w, y: bc.y } : { x: bc.x, y: ac.y < bc.y ? to.y : to.y + to.h }
  const mx = (s.x + t.x) / 2
  const my = (s.y + t.y) / 2
  const d = horizontal
    ? `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`
    : `M ${s.x} ${s.y} C ${s.x} ${my}, ${t.x} ${my}, ${t.x} ${t.y}`
  return (
    <g className={hot ? 'x-edge x-edge-hot' : 'x-edge'}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={props.onPick} />
      <path d={d} fill="none" className="x-edge-line" markerEnd={hot ? 'url(#x-arrow-hot)' : 'url(#x-arrow)'} pointerEvents="none" />
      {edge.label && (
        <text x={mx} y={my - 6} textAnchor="middle" className="x-edge-label" style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {edge.label}
        </text>
      )}
    </g>
  )
})

// ── 节点渲染（memo：拖画布时不重渲染）──────────────────────────────────────

const NodeView = memo(function NodeView(props: {
  node: CanvasNode
  selected: boolean
  editing: boolean
  onPointerDown: (e: React.PointerEvent, node: CanvasNode) => void
  onEdgeHandleDown: (e: React.PointerEvent, node: CanvasNode) => void
  onDoubleClick: (id: string) => void
  onEditCommit: (id: string, patch: { title?: string; text?: string }) => void
  onEditCancel: () => void
}) {
  const { node, selected, editing } = props
  const [title, setTitle] = useState(node.title)
  const [text, setText] = useState(node.text)
  useEffect(() => { if (editing) { setTitle(node.title); setText(node.text) } }, [editing, node.title, node.text])

  return (
    <div
      data-node-id={node.id}
      className={`x-node x-node-${node.type} x-c-${node.color}${selected ? ' x-node-sel' : ''}${editing ? ' x-node-editing' : ''}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h, zIndex: node.type === 'group' ? 0 : 1 }}
      onPointerDown={(e) => props.onPointerDown(e, node)}
      onDoubleClick={(e) => { e.stopPropagation(); props.onDoubleClick(node.id) }}
    >
      {node.type === 'group' && <div className="x-group-tag">{node.title || '分组'}</div>}
      {editing ? (
        <div className="x-editbox" onPointerDown={(e) => e.stopPropagation()}>
          <input className="x-edit-title" value={title} placeholder="标题"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') props.onEditCancel() }}
            autoFocus />
          <textarea className="x-edit-text" value={text} placeholder="正文…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') props.onEditCancel() }} />
          <div className="x-edit-actions">
            <button className="x-btn x-btn-primary" onClick={() => props.onEditCommit(node.id, { title, text })}>确定</button>
            <button className="x-btn" onClick={props.onEditCancel}>取消</button>
          </div>
        </div>
      ) : (
        <div className="x-node-body">
          {node.type !== 'group' && node.title && <div className="x-node-title">{node.title}</div>}
          {node.text && <div className="x-node-text">{node.text}</div>}
        </div>
      )}
      {!editing && (
        <div
          className="x-node-handle"
          title="拖到目标节点建连线"
          onPointerDown={(e) => props.onEdgeHandleDown(e, node)}
        />
      )}
    </div>
  )
})

const CANVAS_CSS = `
.x-croot { min-height: 0; }
.x-missing { align-items: center; justify-content: center; display: flex; flex-direction: column; gap: 10px; }
.x-canvas-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--p-border, #2b3444); flex-shrink: 0; }
.x-canvas-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x-canvas-rev { color: var(--p-text-dim, #8b949e); font-size: 11px; margin-left: auto; flex-shrink: 0; }
.x-canvas-wrap { position: relative; flex: 1; min-height: 0; overflow: hidden; outline: none; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none;
  background-color: var(--p-panel, #10141b);
  background-image: radial-gradient(var(--p-border, #2b3444) 1px, transparent 1px); }
.x-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.x-edge-line { stroke: var(--p-text-dim, #8b949e); stroke-width: 1.6; }
.x-edge-hot .x-edge-line { stroke: var(--p-accent, #4a7dff); stroke-width: 2.2; }
.x-edge-label { fill: var(--p-text, #e6edf3); font-size: 11px; paint-order: stroke;
  stroke: var(--p-panel, #10141b); stroke-width: 4px; }
.x-node { position: absolute; box-sizing: border-box; border-radius: 8px; cursor: move;
  border: 1px solid var(--p-border, #2b3444); background: var(--p-chip, rgba(128,128,128,.12)); overflow: hidden; }
.x-node-sel { border-color: var(--p-accent, #4a7dff); box-shadow: 0 0 0 2px var(--p-accent, #4a7dff) inset; }
.x-node-editing { overflow: visible; z-index: 50 !important; }
.x-node-card { border-left: 3px solid var(--p-accent, #4a7dff); }
.x-node-group { border-style: dashed; background: transparent; cursor: move; }
.x-group-tag { position: absolute; left: 8px; top: 6px; color: var(--p-text-dim, #8b949e); font-size: 11px;
  background: var(--p-panel, #10141b); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--p-border, #2b3444); }
.x-node-body { padding: 8px 10px; height: 100%; box-sizing: border-box; overflow: hidden; pointer-events: none; }
.x-node-title { font-weight: 600; font-size: 12px; margin-bottom: 3px; }
.x-node-text { font-size: 12px; color: var(--p-text-dim, #b6bec9); white-space: pre-wrap; }
.x-c-default { --xc: var(--p-text-dim, #8b949e); }
.x-c-blue { --xc: #4a7dff; } .x-c-green { --xc: #3fb950; } .x-c-amber { --xc: #d29922; }
.x-c-rose { --xc: #f85149; } .x-c-violet { --xc: #a371f7; }
.x-node:not(.x-node-group) { border-left: 3px solid var(--xc, var(--p-accent, #4a7dff)); }
.x-node-handle { position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--p-accent, #4a7dff); border: 2px solid var(--p-panel, #10141b); cursor: crosshair; opacity: 0; transition: opacity .12s; }
.x-node:hover .x-node-handle { opacity: .9; }
.x-editbox { position: absolute; inset: -4px; min-width: 180px; background: var(--p-panel, #161B22);
  border: 1px solid var(--p-accent, #4a7dff); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; z-index: 60; }
.x-edit-title { background: var(--p-chip, rgba(128,128,128,.1)); color: var(--p-text, #e6edf3); border: 1px solid var(--p-border, #2b3444);
  border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
.x-edit-text { flex: 1; min-height: 60px; resize: none; background: var(--p-chip, rgba(128,128,128,.1)); color: var(--p-text, #e6edf3);
  border: 1px solid var(--p-border, #2b3444); border-radius: 4px; padding: 4px 6px; font-size: 12px; outline: none; font-family: inherit; }
.x-edit-actions { display: flex; gap: 6px; justify-content: flex-end; }
.x-toolbar { position: absolute; top: 8px; right: 10px; display: flex; gap: 5px; align-items: center;
  background: var(--p-panel, #161B22); border: 1px solid var(--p-border, #2b3444); border-radius: 8px; padding: 4px 6px; z-index: 90; }
.x-toolbar-sep { width: 1px; height: 16px; background: var(--p-border, #2b3444); }
.x-zoom { font-size: 11px; color: var(--p-text-dim, #8b949e); min-width: 34px; text-align: center; }
.x-relayout-wrap { position: relative; }
.x-relayout-menu { position: absolute; top: calc(100% + 4px); right: 0; display: flex; flex-direction: column; gap: 4px;
  background: var(--p-panel, #161B22); border: 1px solid var(--p-border, #2b3444); border-radius: 8px; padding: 6px; z-index: 95; white-space: nowrap; }
.x-selbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; align-items: center;
  background: var(--p-panel, #161B22); border: 1px solid var(--p-border, #2b3444); border-radius: 10px; padding: 6px 10px; z-index: 90; }
.x-selbar-label { font-size: 12px; color: var(--p-text-dim, #8b949e); margin-right: 2px; }
.x-swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--p-border, #2b3444); cursor: pointer; padding: 0; }
.x-swatch-default { background: var(--p-chip, rgba(128,128,128,.3)); }
.x-swatch-blue { background: #4a7dff; } .x-swatch-green { background: #3fb950; } .x-swatch-amber { background: #d29922; }
.x-swatch-rose { background: #f85149; } .x-swatch-violet { background: #a371f7; }
`
