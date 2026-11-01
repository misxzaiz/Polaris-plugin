/**
 * 数据访问层（Webhook 调试台面板）
 *
 * 键空间契约（与 service/main.js、mcp/server.js 三方一致，权威描述见 README）：
 *   whs.settings              桶配置+保留策略（面板/MCP 写，服务读；服务仅在缺失时引导写默认）
 *   whs.meta                  服务心跳（服务写，60s）
 *   whs.rec.<n>               最近捕获预览分块（服务单写者；rec.0 最新，每块 20 条）
 *   whs.idx                   捕获索引 {count,total,chunkCount,...}
 *   whs.cmd.<op>.<nonce>      命令键（面板/MCP 写，服务消费=先删后做）
 *   whs.result.<nonce>        命令结果（服务写，消费方读后删）
 *
 * 权威全量留痕在服务端 captures.jsonl（面板只见预览；全文经 AI hook_get 或导出）。
 */
import { capDispatch, kvGet, kvSet, kvDel, kvKeys } from './host'

export const PLUGIN_ID = 'webhook-station'
export const SERVICE_ID = 'webhook-station-service'
export const SERVICE_PORT = 9869
export const CMD_PREFIX = 'whs.cmd.'
export const RESULT_PREFIX = 'whs.result.'

// ── 类型（与 service/main.js 写入结构对齐）─────────────────────────────────
export interface Bucket {
  id: string
  name: string
  secret: string
  createdAt: number
  responseMode: 'fixed' | 'forward'
  fixedStatus: number
  fixedBody: string
  forwardUrl: string
}

export interface Settings {
  version: number
  buckets: Bucket[]
  retention: { maxPerBucket: number; bodyCapKb: number }
  updatedAt: number
}

export interface ForwardInfo {
  url: string
  status: number
  ok: boolean
  latencyMs: number
  error?: string
  bodyPreview?: string
}

export interface Capture {
  id: string
  bucketId: string
  method: string
  path: string
  query: string
  headers: Record<string, string>
  sourceIp: string
  receivedAt: number
  contentType: string
  kind: 'text' | 'binary' | 'empty'
  size: number
  truncated: boolean
  previewTruncated?: boolean
  bodyText: string
  bodyBase64: string
  responded: { status: number; mode: string } | null
  forward: ForwardInfo | null
}

export interface WhsMeta {
  version?: string
  pid?: number
  startedAt?: number
  lastTickAt?: number
  bridge?: string
  degraded?: boolean
  port?: number
  lanIp?: string
  lanUrls?: string[]
  storeDir?: string
  filePath?: string
  fileBytes?: number
  capturesTotal?: number
  lastCaptureAt?: number
  settings?: Settings
}

export interface WhsIdx {
  count?: number
  total?: number
  chunkCount?: number
  oldestAt?: number
  updatedAt?: number
}

export interface ServiceStatus {
  pluginId: string
  serviceId: string
  status?: string
  lastError?: string
}

// ── 读取 ──────────────────────────────────────────────────────────────────
export async function getMeta(): Promise<WhsMeta | null> {
  return kvGet<WhsMeta>('whs.meta')
}
export async function getSettings(): Promise<Settings | null> {
  const v = await kvGet<Settings>('whs.settings')
  return v && Array.isArray(v.buckets) ? v : null
}
export async function getIdx(): Promise<WhsIdx | null> {
  return kvGet<WhsIdx>('whs.idx')
}
/** 读全部分块（按 idx.chunkCount 界定；每块 get 容忍消失） */
export async function readRecChunks(chunkCount: number): Promise<Capture[]> {
  const map: Record<string, Capture[]> = {}
  const n = Math.max(0, Math.min(chunkCount || 0, 40))
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet<Capture[]>(`whs.rec.${i}`)),
  )
  results.forEach((arr, i) => { if (Array.isArray(arr)) map[`whs.rec.${i}`] = arr })
  const all: Capture[] = []
  for (const arr of Object.values(map)) all.push(...arr.filter((r) => r && r.id))
  all.sort((a, b) => String(b.id).localeCompare(String(a.id)))
  return all
}
/** 保存 settings（整对象写；last-write-wins） */
export async function saveSettings(s: Settings): Promise<void> {
  await kvSet('whs.settings', { ...s, updatedAt: Date.now() })
}

// ── 命令通道（写命令键 → 轮询结果键 → 删结果）──────────────────────────────
export async function sendCommand<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<T & { ok?: boolean; error?: string }> {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await kvSet(`${CMD_PREFIX}${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() })
  const resultKey = `${RESULT_PREFIX}${nonce}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await kvGet<T & { ok?: boolean; error?: string }>(resultKey)
    if (r) {
      void kvDel(resultKey).catch(() => {})
      return r
    }
    await new Promise((res) => setTimeout(res, 1200))
  }
  return { ok: false, error: '服务未响应命令（可能未运行：去设置页看服务状态）' } as unknown as T & { error?: string }
}

// ── 服务管理（start 必须经发现自举，service-start KB 契约）──────────────────
export async function listServiceStatus(): Promise<ServiceStatus | null> {
  try {
    const arr = await capDispatch<ServiceStatus[]>('cap.pluginServiceManager', { action: 'list_status' })
    const mine = (Array.isArray(arr) ? arr : []).find((s) => s && s.serviceId === SERVICE_ID)
    return mine || null
  } catch (_) {
    return null
  }
}
export async function stopService(): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'stop', pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}
export async function restartService(): Promise<void> {
  await capDispatch('cap.pluginServiceManager', { action: 'restart', pluginId: PLUGIN_ID, serviceId: SERVICE_ID })
}
export async function startServiceBootstrapped(): Promise<string | null> {
  // ① 拿自己安装路径与服务贡献（面板不知道自己装在哪）
  const r = await capDispatch<{ plugins?: Array<{ id: string; installPath: string; contributes?: { services?: Record<string, unknown>[] } }> }>(
    'cap.pluginDiscovery', { action: 'discover' },
  )
  const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID)
  if (!self) return '插件未被发现（重载插件页后重试）'
  const svc = (self.contributes?.services || []).find((s) => s && s.id === SERVICE_ID)
  if (!svc) return '清单中未声明服务'
  // ② start 必须带 installPath + 完整 contribution（后端 toBackendContribution 形态）
  await capDispatch('cap.pluginServiceManager', {
    action: 'start',
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType ?? 'http',
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 3,
      description: svc.description ?? null,
    },
  })
  return null
}

// ── 工具 ──────────────────────────────────────────────────────────────────
/** 浏览器侧生成桶 secret（12 位 hex，与服务端 newSecret 同规格） */
export function newSecretBrowser(): string {
  const b = new Uint8Array(6)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}
export function fmtTime(ts: number | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
export function fmtBytes(n: number | undefined): string {
  if (!n || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}
/** 剪贴板双路径：非安全上下文（手机 http://LAN-IP）回退手动复制弹窗 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (_) {
    try {
      window.prompt('请手动复制（Ctrl+C）：', text)
      return true
    } catch (_) { return false }
  }
}
