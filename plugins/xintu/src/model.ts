/**
 * 心图数据访问层：cap.kv xt.* 键空间（与 MCP server 同一权威 core）。
 * 全部经宿主 router_dispatch（双重解包，同 pocket-ledger 模式）。
 */
import { getHostInvoke } from './host'
// 共享计算权威（CJS 零依赖，esbuild 打进 bundle；tsconfig allowJs）
import core from '../shared/canvas-core.js'

export const xcore = core as unknown as {
  LIMITS: Record<string, unknown>
  COLORS: string[]
  LAYOUT_DIRECTIONS: string[]
  K: { INDEX: string; BOARD_PREFIX: string; PREFIX: string; board: (id: string) => string }
  newBoard: (title?: unknown, now?: number) => { id: string; doc: BoardDoc } | { error: string }
  sanitizeDoc: (raw: unknown) => BoardDoc | null
  applyOps: (doc: BoardDoc, ops: CanvasOp[], ctx?: { now?: number }) =>
    { doc: BoardDoc; applied: number; errors: [] } | { errors: Array<{ index: number; op: string | null; error: string }> }
  bounds: (doc: BoardDoc) => { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }
  exportMarkdown: (doc: BoardDoc) => { markdown: string } | { error: string }
}

export interface CanvasNode {
  id: string
  type: 'note' | 'card' | 'group'
  x: number
  y: number
  w: number
  h: number
  title: string
  text: string
  color: string
  z: number
}

export interface CanvasEdge {
  id: string
  from: string
  to: string
  label: string
}

export interface BoardDoc {
  rev: number
  title: string
  createdAt: number
  updatedAt: number
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface BoardIndexEntry {
  id: string
  title: string
  updatedAt: number
  nodeCount: number
}

export type CanvasOp = { op: string; args?: Record<string, unknown> }

interface DispatchResponse {
  ok?: boolean
  result?: unknown
  error?: string
}

async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<DispatchResponse>('router_dispatch', { req: { target, payload } })
  if (!res || res.ok !== true) throw new Error(res?.error || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key })
  return (r.value ?? null) as T | null
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value: value === undefined ? null : value })
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}

// 注意：面板侧同样禁用 cap.kv list（与 mcp/server.js 同一纪律），清单一律走 xt.boards 索引。

/** 读板：坏数据经 sanitizeDoc 修整，不存在返回 null */
export async function loadBoard(id: string): Promise<BoardDoc | null> {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const raw = await kvGet<unknown>(xcore.K.board(id))
  return raw ? xcore.sanitizeDoc(raw) : null
}

/** 索引条目 upsert（与 core.upsertIndex 同口径） */
function upsertEntry(index: BoardIndexEntry[], id: string, doc: BoardDoc): BoardIndexEntry[] {
  const rest = (Array.isArray(index) ? index : []).filter((e) => e && e.id !== id)
  rest.push({ id, title: doc.title, updatedAt: doc.updatedAt, nodeCount: doc.nodes.length })
  return rest
}

/** 写板 + 尽力同步索引条目（索引失败不阻塞主写入） */
export async function saveBoard(id: string, doc: BoardDoc): Promise<void> {
  await kvSet(xcore.K.board(id), doc)
  try {
    const index = (await kvGet<BoardIndexEntry[]>(xcore.K.INDEX)) || []
    await kvSet(xcore.K.INDEX, upsertEntry(index, id, doc))
  } catch {
    /* 索引尽力而为 */
  }
}

export async function deleteBoard(id: string): Promise<void> {
  await kvDel(xcore.K.board(id))
  try {
    const index = (await kvGet<BoardIndexEntry[]>(xcore.K.INDEX)) || []
    await kvSet(xcore.K.INDEX, index.filter((e) => e && e.id !== id))
  } catch {
    /* 尽力而为 */
  }
}

/**
 * 列出全部画布：一律走 xt.boards 索引（⚠️ 绝不调用 cap.kv list——实测大数据根上
 * 会拖垮宿主进程，2026-10-30 生产实例实证）。索引残条（板已删）就地剔除并回写愈合。
 */
export async function listBoards(): Promise<BoardIndexEntry[]> {
  const index = (await kvGet<BoardIndexEntry[]>(xcore.K.INDEX)) || []
  const result: BoardIndexEntry[] = []
  let changed = false
  for (const e of Array.isArray(index) ? index : []) {
    if (!e || typeof e.id !== 'string') { changed = true; continue }
    // eslint-disable-next-line no-await-in-loop
    const doc = await loadBoard(e.id)
    if (doc) {
      result.push({ id: e.id, title: doc.title, updatedAt: doc.updatedAt, nodeCount: doc.nodes.length })
      if (e.nodeCount !== doc.nodes.length || e.title !== doc.title) changed = true
    } else {
      changed = true
    }
  }
  if (changed) {
    kvSet(xcore.K.INDEX, result).catch(() => { /* 愈合尽力而为 */ })
  }
  return result
}

/** 新建画布：core 生成 id+空板，落 kv。返回 id */
export async function createBoard(title: string): Promise<string> {
  const r = xcore.newBoard(title)
  if ('error' in r && r.error) throw new Error(r.error)
  if (!('id' in r)) throw new Error('新建画布失败')
  await kvSet(xcore.K.board(r.id), r.doc)
  try {
    const index = (await kvGet<BoardIndexEntry[]>(xcore.K.INDEX)) || []
    await kvSet(xcore.K.INDEX, [
      ...index.filter((e) => e && e.id !== r.id),
      { id: r.id, title: r.doc.title, updatedAt: r.doc.updatedAt, nodeCount: 0 },
    ])
  } catch {
    /* 尽力而为 */
  }
  return r.id
}
