/**
 * model.ts —— 服务数据面（自动化流水线面板）
 *
 * 面板 → 127.0.0.1:{meta.port} 直连（Bearer token，meta 自 cap.kv 的 flowpipe.meta 读）。
 * 已知边界：Web(https) 部署模式浏览器拦 http://127.0.0.1 混合内容——桌面/手机 WebView 正常
 * （repo-lens / stream-desk / api-bench 面板直连面同款边界，如实标注）。
 */

export interface Trigger {
  type: 'manual' | 'interval' | 'daily' | 'webhook'
  everyMinutes?: number
  at?: string
  token?: string
}

export interface Step {
  id?: string
  type: 'http' | 'mcp' | 'ai' | 'extract' | 'template' | 'script' | 'kv' | 'file' | 'notify'
  name?: string
  when?: string
  saveAs?: string
  continueOnError?: boolean
  // http / notify
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  timeoutSec?: number
  followRedirects?: boolean
  payload?: unknown
  // mcp
  serverId?: string
  tool?: string
  arguments?: unknown
  // ai
  providerId?: string
  prompt?: string
  system?: string
  temperature?: number
  maxTokens?: number
  // extract
  from?: string
  paths?: Record<string, string>
  // template
  text?: string
  // script
  code?: string
  // kv / file
  action?: string
  key?: string
  value?: unknown
  path?: string
  content?: unknown
}

export interface Pipeline {
  id?: string
  name: string
  enabled: boolean
  trigger: Trigger
  vars?: Record<string, string | number | boolean>
  secrets?: string[]
  allowLocal?: boolean
  steps: Step[]
  createdAt?: string
  updatedAt?: string
}

export interface StepRun {
  id: string
  type: string
  name: string
  status: 'pending' | 'running' | 'ok' | 'skipped' | 'error'
  startedAt: string
  durationMs: number | null
  error: string | null
  excerpt: string
  warnings?: string[]
}

export interface RunRecord {
  id: string
  plId: string
  plName: string
  trigger: 'manual' | 'schedule' | 'webhook'
  missed?: boolean
  params?: unknown
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: 'queued' | 'running' | 'ok' | 'error' | 'stopped'
  steps: StepRun[]
  error: string | null
}

export interface PipelineSummary {
  id: string
  name: string
  enabled: boolean
  trigger: Trigger
  allowLocal: boolean
  steps: number
  hasWebhook: boolean
  lastRun: { id: string; status: string; startedAt: string; durationMs: number | null; trigger: string } | null
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  wire?: 'openai-chat-completions' | 'anthropic-messages'
  hostId?: string
  source?: string
}

export interface Settings {
  providers: Provider[]
  aiTimeoutSec: number
  webhookEnabled: boolean
}

export interface ServiceMeta {
  port: number
  token: string
  version: string
  startedAt: string
  live: boolean
  degraded?: boolean
  pipelines?: number
}

export const MASK = '__FLOWPIPE_MASKED__'

// ── meta 读取与缓存 ──────────────────────────────────────────────────────────
import { kvGet } from './host'

let metaCache: ServiceMeta | null = null
let metaAt = 0

export function invalidateMeta() {
  metaCache = null
  metaAt = 0
}

export async function readMeta(): Promise<ServiceMeta> {
  if (metaCache && Date.now() - metaAt < 5_000) return metaCache
  const m = await kvGet<ServiceMeta>('flowpipe.meta')
  if (!m || typeof m.port !== 'number' || !m.token) {
    throw new SvcError('服务未就绪（flowpipe.meta 缺失）：稍候自动重试，或到插件管理里重启服务')
  }
  metaCache = m
  metaAt = Date.now()
  return m
}

export class SvcError extends Error {}

async function svc<T>(method: string, apiPath: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  const meta = await readMeta()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}${apiPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${meta.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    })
    const text = await res.text()
    let data: any = null
    try { data = JSON.parse(text) } catch (_) { /* 非 JSON */ }
    if (res.status >= 400) {
      const msg = (data && (data.error || (data.errors && data.errors.join('；')))) || `HTTP ${res.status}`
      throw new SvcError(msg)
    }
    return (data ?? {}) as T
  } catch (e) {
    if (e instanceof SvcError) throw e
    if ((e as Error).name === 'AbortError') throw new SvcError('服务请求超时')
    throw new SvcError(`服务不可达：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  listPipelines: () => svc<{ pipelines: PipelineSummary[]; degraded: boolean }>('GET', '/api/pipelines'),
  getPipeline: (id: string) => svc<{ pipeline: Pipeline; runs: RunRecord[] }>('GET', `/api/pipelines/${encodeURIComponent(id)}`),
  createPipeline: (pipeline: Pipeline) => svc<{ pipeline: Pipeline }>('POST', '/api/pipelines', { pipeline }),
  updatePipeline: (id: string, pipeline: Pipeline) => svc<{ pipeline: Pipeline }>('PUT', `/api/pipelines/${encodeURIComponent(id)}`, { pipeline }),
  deletePipeline: (id: string, confirm: string) => svc<{ ok: boolean }>('DELETE', `/api/pipelines/${encodeURIComponent(id)}?confirm=${encodeURIComponent(confirm)}`),
  runPipeline: (id: string, params: unknown) => svc<{ runId: string }>('POST', `/api/pipelines/${encodeURIComponent(id)}/run`, { params }, 35_000),
  listRuns: (plId: string, limit = 10) => svc<{ runs: RunRecord[] }>('GET', `/api/runs?plId=${encodeURIComponent(plId)}&limit=${limit}`),
  getRun: (runId: string) => svc<{ run: RunRecord }>('GET', `/api/runs/${encodeURIComponent(runId)}`),
  stopRun: (runId: string) => svc<{ ok: boolean }>('POST', `/api/runs/${encodeURIComponent(runId)}/stop`),
  getSettings: () => svc<{ settings: Settings; degraded: boolean }>('GET', '/api/settings'),
  saveSettings: (settings: Settings) => svc<{ settings: Settings }>('PUT', '/api/settings', { settings }),
  importHost: (dryRun: boolean) => svc<{ imported: number; preview?: Array<{ name: string; model: string; baseUrl: string }> }>('POST', '/api/settings/import-host', { dryRun }, 30_000),
  selftest: () => svc<{ ok: boolean; checks: Record<string, unknown>; version: string }>('POST', '/api/selftest', {}, 30_000),
  webhookUrl: (p: PipelineSummary) => `POST http://127.0.0.1:${'PORT'}/hook/${p.id}  (X-FlowPipe-Token: 见定义页)`,
}

/** 空白流水线 */
export function blankPipeline(): Pipeline {
  return {
    name: '新流水线',
    enabled: true,
    trigger: { type: 'manual' },
    vars: {},
    secrets: [],
    allowLocal: false,
    steps: [{ type: 'http', name: '示例请求', method: 'GET', url: 'https://httpbin.org/json', saveAs: 'resp' }],
  }
}

/** 内置示例模板（新建入口一键可用） */
export function presets(): Array<{ label: string; make: () => Pipeline }> {
  return [
    {
      label: '接口巡检 → 异常才通知',
      make: () => ({
        name: '接口巡检',
        enabled: true,
        trigger: { type: 'interval', everyMinutes: 30 },
        vars: { api: 'https://httpbin.org/status/200' },
        secrets: [],
        allowLocal: false,
        steps: [
          { id: 's1', type: 'http', name: '探活', method: 'GET', url: '{{api}}', timeoutSec: 10, saveAs: 'resp' },
          { id: 's2', type: 'notify', name: '挂了才叫人', url: 'https://dingtalk-webhook.example/json', payload: { msgtype: 'text', text: { content: '接口巡检失败：{{resp.status}}' } }, when: '{{resp.ok}} == false' },
        ],
      }),
    },
    {
      label: 'webhook 收到 → AI 分析 → 通知',
      make: () => ({
        name: '告警 AI 分析',
        enabled: true,
        trigger: { type: 'webhook' },
        vars: {},
        secrets: [],
        allowLocal: false,
        steps: [
          { id: 's1', type: 'ai', name: '分析告警', providerId: '在此填设置里的供应商ID', prompt: '用两句话分析这条告警该不该半夜叫人：{{params.body.alert}}', saveAs: 'analysis' },
          { id: 's2', type: 'notify', name: '推送结论', url: 'https://dingtalk-webhook.example/json', payload: { msgtype: 'text', text: { content: '告警分析：{{analysis.text}}' } } },
        ],
      }),
    },
    {
      label: '每天定点抓取 → 存文件',
      make: () => ({
        name: '每日数据归档',
        enabled: true,
        trigger: { type: 'daily', at: '08:30' },
        vars: { source: 'https://httpbin.org/json' },
        secrets: [],
        allowLocal: false,
        steps: [
          { id: 's1', type: 'http', name: '抓数据', method: 'GET', url: '{{source}}', saveAs: 'resp' },
          { id: 's2', type: 'file', name: '落盘', action: 'write', path: 'daily-{{env.today}}.json', content: '{{resp.json}}' },
        ],
      }),
    },
  ]
}
