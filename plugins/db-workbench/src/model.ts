/**
 * model.ts —— 面板 service 客户端 + 类型
 *
 * 通道分层（为什么两种都要）：
 *  - 发现信息（port/token）经宿主 invoke 读 cap.kv `dbl.service`——三端都能拿到；
 *  - 查询/表结构/Redis 流量直连 127.0.0.1:<port>（localhost 免混合内容、CORS 由
 *    service 放行，pocket-drop 先例）——低延迟且大结果不占 kv。手机端连不进
 *    桌面 127.0.0.1，Panel 会捕获并给出降级提示（v0.1 边界，README 已说明）。
 */
import { kvGet } from './host'

export interface Profile {
  id: string
  type: 'mysql' | 'postgres' | 'redis'
  name: string
  host: string
  port: number
  username: string
  database: string
  readonly: boolean
  allowWrite: boolean
  rememberPass: boolean
  hasStoredPass: boolean
  ssl: boolean
  note: string
  createdAt: number
  lastUsedAt: number
}

export interface SvcInfo { port: number; token: string; pid?: number; version?: string }

export interface QueryResult {
  ok: boolean
  error?: string
  needsConfirm?: boolean
  kind?: string
  columns?: string[]
  rows?: Record<string, unknown>[]
  rowCount?: number
  truncated?: boolean
  ms?: number
  executedSql?: string
  /** redis 通道的原始回包（service formatReply 后的 JSON 形状） */
  reply?: unknown
}

export interface TableInfo {
  name: string
  type: string
  estRows: number | null
  bytes: number | null
  comment: string
}

export interface DescribeResult {
  ok: boolean
  columns: { name: string; type: string; nullable: boolean; defaultValue: string | null; key: string; extra: string; comment: string }[]
  indexes: { name: string; unique: boolean; columns: string[]; ddl?: string }[]
  ddl: string
}

const KB = 1024
const MAX_BODY = 8 * 1024 * 1024

export class SvcClient {
  private info: SvcInfo | null = null

  get connected() { return this.info !== null }

  /** 从 kv 拿 service 发现信息并 ping 健康检查 */
  async discover(): Promise<{ ok: boolean; reason: string }> {
    this.info = null
    const svc = await kvGet<SvcInfo>('dbl.service')
    if (!svc || !svc.port || !svc.token) {
      return { ok: false, reason: '服务未就绪：后台服务可能未启动，稍候重试或检查插件服务管理。' }
    }
    try {
      const r = await this.raw('GET', '/__health')
      if (r && r.ok) {
        this.info = svc
        return { ok: true, reason: '' }
      }
      return { ok: false, reason: '服务健康检查失败（端口响应异常）。' }
    } catch (_) {
      return {
        ok: false,
        reason: '无法连接本机服务（127.0.0.1 直连失败）。手机/Web 远程端 v0.1 仅支持查看，请在桌面端使用完整功能。',
      }
    }
  }

  private async raw(method: string, path: string, body?: unknown): Promise<any> {
    if (!this.info) throw new Error('service 未连接')
    const headers: Record<string, string> = { Authorization: `Bearer ${this.info.token}` }
    let payload: string | undefined
    if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const res = await fetch(`http://127.0.0.1:${this.info.port}${path}`, {
        method, headers, body: payload, signal: ctrl.signal,
      })
      const text = await res.text()
      if (text.length > MAX_BODY) throw new Error('响应过大')
      const json = JSON.parse(text)
      return json
    } finally {
      clearTimeout(timer)
    }
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await this.raw(method, path, body)
    return r
  }

  async infoSvc() { return this.call('GET', '/api/info') }
  async profiles(): Promise<Profile[]> {
    const r = await this.call('GET', '/api/profiles')
    return r.items || []
  }
  async saveProfile(profile: Partial<Profile> & { type: string; name: string; host: string }, password?: string) {
    return this.call('POST', '/api/profiles', { profile, password })
  }
  async deleteProfile(id: string) { return this.call('POST', '/api/profiles/delete', { id }) }
  async testProfile(id: string, password?: string) {
    return this.call('POST', `/api/profiles/${encodeURIComponent(id)}/test`, { password })
  }
  async query(profileId: string, sql: string, opts?: { writeMode?: boolean; confirm?: boolean; password?: string }): Promise<QueryResult> {
    return this.call('POST', '/api/query', { profileId, sql, ...opts })
  }
  async redis(profileId: string, command: string, args: string[], opts?: { writeMode?: boolean; password?: string }): Promise<QueryResult> {
    return this.call('POST', '/api/redis', { profileId, command, args, ...opts })
  }
  async schemas(profileId: string): Promise<string[]> {
    const r = await this.call('GET', `/api/schemas?profileId=${encodeURIComponent(profileId)}`)
    return r.items || []
  }
  async tables(profileId: string, schema: string): Promise<TableInfo[]> {
    const r = await this.call('GET', `/api/tables?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}`)
    return r.items || []
  }
  async describe(profileId: string, schema: string, table: string): Promise<DescribeResult> {
    return this.call('GET', `/api/describe?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`)
  }
  async preview(profileId: string, schema: string, table: string, limit: number): Promise<QueryResult> {
    return this.call('GET', `/api/preview?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}&limit=${limit}`)
  }
  async history() {
    const r = await this.call('GET', '/api/history')
    return r.items || []
  }
  async clearHistory() { return this.call('POST', '/api/history/clear', {}) }
  async selftest() { return this.call('POST', '/api/selftest', {}) }
}

export function fmtBytes(n: number | null): string {
  if (n == null || !(n > 0)) return ''
  if (n < KB) return `${n}B`
  if (n < KB * KB) return `${(n / KB).toFixed(1)}KB`
  if (n < KB * KB * KB) return `${(n / KB / KB).toFixed(1)}MB`
  return `${(n / KB / KB / KB).toFixed(2)}GB`
}

export function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 结果表 → CSV（带 BOM；与 shared/core.toCsv 同规则，前端独立实现避免 bundle core 进面板） */
function csvCell(v: unknown): string {
  if (v == null) return ''
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (s.length > 4096) s = `${s.slice(0, 4096)}…[截断]`
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const lines = [columns.map(csvCell).join(',')]
    .concat(rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')))
    .join('\r\n')
  const blob = new Blob([`\uFEFF${lines}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
