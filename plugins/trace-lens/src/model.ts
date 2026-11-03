/**
 * 数据层（链路追踪台面板）
 *
 * 面板数据走宿主 invoke 通道（window.__POLARIS_HOST_INVOKE__ → cap.kv），
 * 与服务 / MCP server 共享同一份 tl.* 键空间；面板绝不直接 fetch 任何地址
 * （跨域治理：服务端不开放 CORS 读 API）。
 */

export type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

function hostWindow(): HostGlobals & typeof globalThis {
  return window as unknown as HostGlobals & typeof globalThis
}

function getHostInvoke(): HostInvoke {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__
  if (!invoke) {
    throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  }
  return invoke
}

interface CapEnvelope<T> { ok: boolean; result?: T; error?: string }

async function capDispatch<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<CapEnvelope<T>>('router_dispatch', { req: { target, payload } })
  if (!res || res.ok !== true) throw new Error((res && res.error) || `${target} 调用失败`)
  return (res.result ?? {}) as T
}

// ── cap.kv（get 容忍键消失）─────────────────────────────────────────────────
async function kvGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await capDispatch<{ value?: T }>('cap.kv', { action: 'get', key })
    return r && r.value !== undefined ? r.value : null
  } catch (_) {
    return null
  }
}
async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value })
}
async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key })
}
async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' })
  return (r && Array.isArray(r.keys)) ? r.keys : []
}

// ── 类型（与服务端归一化结构对齐）───────────────────────────────────────────
export interface TlMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  degraded?: boolean
  port?: number
  storeDir?: string
  filePath?: string
  fileBytes?: number
  tracesTotal?: number
  spansTotal?: number
  lastSpanAt?: number
  endpoint?: string
}
export interface TlIdx {
  count?: number
  total?: number
  spansTotal?: number
  chunkCount?: number
  oldestAt?: number
  updatedAt?: number
}
export interface TraceSummary {
  traceId: string
  rootName: string
  rootService: string
  spanCount: number
  durationMs: number
  hasError: boolean
  errCount: number
  startedAt: number
  services?: string[]
}
export interface SpanRec {
  traceId: string
  spanId: string
  parentSpanId: string
  name: string
  kind: string
  service: string
  startMs: number
  endMs: number
  durationMs: number
  status: { code: string; message: string }
  attrs: Record<string, string>
  events: Array<{ at: number; name: string; attrs: Record<string, string> }>
}
export interface TraceFull {
  traceId: string
  spans: SpanRec[]
  updatedAt?: number
}

export async function getMeta(): Promise<TlMeta | null> {
  return kvGet<TlMeta>('tl.meta')
}
export async function getIdx(): Promise<TlIdx | null> {
  return kvGet<TlIdx>('tl.idx')
}
export async function readRecChunks(chunkCount: number): Promise<TraceSummary[]> {
  const keys: string[] = []
  for (let i = 0; i < chunkCount; i++) keys.push(`tl.rec.${i}`)
  const outs = await Promise.all(keys.map((k) => kvGet<TraceSummary[]>(k)))
  const out: TraceSummary[] = []
  for (const v of outs) if (Array.isArray(v)) out.push(...v)
  return out
}
export async function getTraceFull(traceId: string): Promise<TraceFull | null> {
  return kvGet<TraceFull>(`tl.trace.${traceId}`)
}

// ── 命令（写 cmd 键 → 轮询 result 键；与服务 tick 4s 对齐）──────────────────
function nonce(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1679616).toString(36)}`
}
export async function sendCommand(op: string, payload: Record<string, unknown>, timeoutMs = 15000): Promise<{ ok: boolean; error?: string; kept?: number }> {
  const n = nonce()
  const resultKey = `tl.result.${n}`
  await kvSet(`tl.cmd.${op}.${n}`, { op, nonce: n, ...payload, at: Date.now() })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await kvGet<{ ok?: boolean; error?: string; kept?: number } & Record<string, unknown>>(resultKey)
    if (r && typeof r === 'object') {
      void kvDel(resultKey)
      return { ok: r.ok === true, error: r.error, kept: r.kept }
    }
    await new Promise((res) => setTimeout(res, 600))
  }
  return { ok: false, error: '服务未在时限内响应（可能未运行）' }
}
