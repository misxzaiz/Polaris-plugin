/**
 * model.ts —— 面板数据层：类型 + 服务 API 客户端 + 共享 core 再导出
 *
 * 数据面：面板 → 127.0.0.1:{meta.port} 直连（Bearer token 头，meta 自 cap.kv 读）。
 * 谱面口径与 service/MCP 同源（shared/core 由 esbuild 打包进 bundle）。
 */
import { kvGet, restartService } from './host'

// ── shared/core（打包进 bundle，与 service 同口径）─────────────────────────
import * as core from '../shared/core.js'

export const validateScore = core.validateScore
export const generateScore = core.generateScore
export const analyzeScore = core.analyzeScore
export const midiToNoteName = core.midiToNoteName
export const estimateDuration = core.estimateDuration

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface SvcMeta { port: number; token: string; pid?: number; version?: string; startedAt?: number; live?: number }

export interface Note { step: number; pitch: number; len: number; vel: number }

export interface SynthTrack { name: string; type: 'synth'; wave: string; vol: number; cutoff: number; octaveShift: number; notes: Note[] }
export interface DrumTrack { name: string; type: 'drum'; vol: number; pattern: Record<string, number[]> }
export type Track = SynthTrack | DrumTrack

export interface Score {
  meta: { title: string; bpm: number; key: string; bars: number; style?: string; swing?: number }
  tracks: Track[]
  id?: string
  updatedAt?: number
}

export interface IndexItem { id: string; title: string; key: string; bpm: number; bars: number; dur: number; tracks: number; updatedAt: number }

export interface Analysis {
  summary: string
  outOfScale: Array<{ track: string; step: number; pitch: number; note: string; suggest: string }>
  density: { perBarPercent: number[]; overallPercent: number }
  conflicts: Array<{ track: string; step: number; pitches: number[]; suggest: string }>
  suggestions: string[]
}

const PLUGIN_ID = 'daw-studio'
const SERVICE_ID = 'daw-studio-server'

// ── meta 读取与直连 ─────────────────────────────────────────────────────────

let cachedMeta: SvcMeta | null = null
let metaAt = 0

export function invalidateMeta(): void { cachedMeta = null; metaAt = 0 }

async function readMeta(force = false): Promise<SvcMeta> {
  if (!force && cachedMeta && Date.now() - metaAt < 10_000) return cachedMeta
  const m = await kvGet<SvcMeta>('dawstudio.meta')
  if (!m || typeof m.port !== 'number' || !m.token) {
    throw new SvcError('服务未就绪（dawstudio.meta 缺失）：服务可能在启动中，稍候或点「重启服务」')
  }
  cachedMeta = m
  metaAt = Date.now()
  return m
}

export class SvcError extends Error {}

async function svcRequest<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
  let meta: SvcMeta
  try {
    meta = await readMeta()
  } catch (e) {
    if (e instanceof SvcError) throw e
    throw new SvcError(`服务连接失败：${(e as Error).message}`)
  }
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${meta.port}${apiPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${meta.token}` },
      body: body != null ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    invalidateMeta()
    throw new SvcError(`服务不可达（${(e as Error).message}）：可点「重启服务」自救`)
  }
  let parsed: { errors?: string[]; error?: string } & Record<string, unknown>
  try { parsed = await res.json() } catch (_) { throw new SvcError(`服务返回非 JSON（HTTP ${res.status}）`) }
  if (!res.ok) {
    const msg = parsed.errors ? parsed.errors.join('；') : parsed.error || `HTTP ${res.status}`
    throw new SvcError(msg)
  }
  return parsed as T
}

export const api = {
  meta: () => svcRequest<{ version: string; scoreCount: number; degraded: boolean }>('GET', '/api/meta'),
  listScores: () => svcRequest<{ scores: IndexItem[]; cap: number }>('GET', '/api/scores'),
  getScore: (id: string) => svcRequest<{ score: Score }>('GET', `/api/scores/${encodeURIComponent(id)}`),
  writeScore: (payload: { id?: string; score: Score }) => svcRequest<{ id: string; score: Score }>('POST', '/api/scores', payload),
  createScore: (skeleton: Record<string, unknown>) => svcRequest<{ id: string; score: Score }>('POST', '/api/scores', { skeleton }),
  deleteScore: (id: string) => svcRequest<{ deleted: string }>('DELETE', `/api/scores/${encodeURIComponent(id)}`),
  analyze: (id: string) => svcRequest<{ score: Score; analysis: Analysis }>('POST', '/api/analyze', { id }),
  validate: (score: Score) => svcRequest<{ ok: boolean; errors?: string[] }>('POST', '/api/validate', { score }),
  restart: () => restartService(PLUGIN_ID, SERVICE_ID),
}
