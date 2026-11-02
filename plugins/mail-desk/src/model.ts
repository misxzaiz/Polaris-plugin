/**
 * 数据面与类型(邮件调试台面板)
 *
 * 路径:cap.kv 读 mdk.service{port,token} → cap.http request 转发到
 * http://127.0.0.1:{port}/api/*(Bearer token)。请求由宿主进程发出,任何端都
 * 无跨域;服务只绑 127.0.0.1 不暴露局域网(daw-studio 实证范式)。
 */
import { capDispatch, kvGet } from './host'

export const PLUGIN_ID = 'mail-desk'
export const SERVICE_ID = 'mail-desk-service'
export const VERSION = '0.1.0'

export interface SvcInfo { port: number; smtpPort: number; token: string; pid?: number; version?: string; startedAt?: string }

export interface MailAttachment { filename: string; contentType: string; size: number; cid?: string }
export interface MailSummary {
  id: string
  fromText: string
  toText: string
  subject: string
  date: string | null
  receivedAt: number
  sizeBytes: number
  attachments: MailAttachment[]
  hasHtml: boolean
  hasText: boolean
  textPreview: string
  headers: Record<string, string>
}
export interface MailDetailData {
  meta: MailSummary
  text: string
  html: string
  codes: string[]
  limits: { maxRawPreviewBytes: number; maxAttachmentB64: number }
}
export interface DeskMeta {
  version: string
  httpPort: number
  smtpPort: number
  smtpListening: boolean
  smtpLastError: string
  count: number
  totalBytes: number
  dir: string
  uptimeMs: number
  limits: Record<string, number>
}
export interface SelftestReport {
  ok: boolean
  at: string
  receivedId?: string
  error?: string
  steps?: string[]
  elapsedMs?: number
}

export class SvcError extends Error {}

let cachedSvc: SvcInfo | null = null
let cachedAt = 0

/** 读服务发现(kv mdk.service,10s 缓存;失败 null) */
export async function readSvc(force = false): Promise<SvcInfo | null> {
  if (!force && cachedSvc && Date.now() - cachedAt < 10_000) return cachedSvc
  const v = await kvGet<SvcInfo>('mdk.service')
  if (v && typeof v.port === 'number' && v.token) {
    cachedSvc = v
    cachedAt = Date.now()
    return v
  }
  return null
}
export function invalidateSvc() { cachedSvc = null }

interface CapHttpResult { status?: number; body?: string }

async function svcRequest<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
  const svc = await readSvc()
  if (!svc) throw new SvcError('服务未就绪(mdk.service 缺失):服务可能在启动中,可点「重启服务」')
  let res: CapHttpResult
  try {
    res = await capDispatch<CapHttpResult>('cap.http', {
      action: 'request',
      method,
      url: `http://127.0.0.1:${svc.port}${apiPath}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svc.token}` },
      ...(body != null ? { body: JSON.stringify(body), bodyType: 'json' } : {}),
      timeoutMs: 30_000,
    })
  } catch (e) {
    invalidateSvc()
    throw new SvcError(`宿主转发通道不可用(${(e as Error).message}):可点「重启服务」自救`)
  }
  let parsed: ({ error?: string } & Record<string, unknown>) | null = null
  try { parsed = JSON.parse(String(res.body ?? '')) } catch (_) { parsed = null }
  const status = res.status ?? 0
  if (!parsed || status >= 400) {
    throw new SvcError(parsed?.error || `服务 HTTP ${status || '无响应'}`)
  }
  return parsed as T
}

export const api = {
  meta: () => svcRequest<DeskMeta>('GET', '/api/meta'),
  list: (query: string, offset = 0, limit = 50) =>
    svcRequest<{ items: MailSummary[]; total: number }>('GET', `/api/mail?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`),
  detail: (id: string) => svcRequest<MailDetailData>('GET', `/api/mail/${encodeURIComponent(id)}`),
  raw: (id: string) => svcRequest<{ raw: string; truncated: boolean; totalBytes: number }>('GET', `/api/mail/${encodeURIComponent(id)}/raw`),
  attachment: (id: string, idx: number) =>
    svcRequest<{ filename: string; contentType: string; size: number; dataB64: string }>('GET', `/api/mail/${encodeURIComponent(id)}/attach/${idx}`),
  remove: (id: string) => svcRequest<{ deleted: string }>('DELETE', `/api/mail/${encodeURIComponent(id)}`),
  clear: () => svcRequest<{ cleared: number }>('POST', '/api/clear', {}),
  setSmtpPort: (smtpPort: number) => svcRequest<{ ok: boolean; smtpPort: number; note: string }>('POST', '/api/settings', { smtpPort }),
  selftest: () => svcRequest<SelftestReport>('POST', '/api/selftest', {}),
  selftestLast: () => svcRequest<{ last: SelftestReport | null }>('GET', '/api/selftest'),
}
