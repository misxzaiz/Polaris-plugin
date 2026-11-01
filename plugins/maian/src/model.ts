/**
 * 通信层 + 数据访问（脉案面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与 MCP server 读写同一个 cap.kv 的
 * maian.* 键空间。零外网、零服务进程（记录提醒交给日晷，本插件专注记录与分析）。
 *
 * 键空间契约（与 mcp/server.js 双方一致，权威描述见 README）：
 *   maian.member.<id>     成员档案（面板/MCP 直写）
 *   maian.day.YYYY-MM-DD  该日全部记录数组（按 ts 升序，同 id 覆盖；面板/MCP 直写）
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet } from './host'

export type Member = core.Member
export type VitalRecord = core.VitalRecord
export type Kind = core.Kind

export const PREFIX = 'maian.'
export const K = {
  member: (id: string) => `${PREFIX}member.${id}`,
  memberPrefix: `${PREFIX}member.`,
  day: (date: string) => `${PREFIX}day.${date}`,
  dayPrefix: `${PREFIX}day.`,
}

export interface MaianData {
  members: Member[]
  records: VitalRecord[]          // 全量（家庭量级），ts 升序
  at: number
}

export interface CacheState {
  knownKeys: Set<string> | null
  fullAt: number
  members: Map<string, Member>
  days: Map<string, VitalRecord[]>  // date -> records（升序）
}
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, members: new Map(), days: new Map() }
}

const FULL_REFRESH_MS = 90 * 1000

/** 一轮数据装载（键集 diff + 90s 全量兜底；家庭量级日键直接全拉） */
export async function loadMaian(cache: CacheState): Promise<MaianData> {
  const keys = await kvKeys()
  const now = Date.now()
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS
  if (full) {
    cache.members.clear()
    cache.days.clear()
    cache.fullAt = now
  }
  const keySet = new Set(keys)
  for (const k of [...cache.members.keys()]) if (!keySet.has(k)) cache.members.delete(k)
  for (const k of [...cache.days.keys()]) if (!keySet.has(k)) cache.days.delete(k)

  const memberKeys = keys.filter((k) => k.startsWith(K.memberPrefix))
  const dayKeys = keys.filter((k) => k.startsWith(K.dayPrefix) && core.parseDayKey(k.slice(K.dayPrefix.length)) !== null)
  const memberTodo = memberKeys.filter((k) => full || !cache.members.has(k))
  const dayTodo = dayKeys.filter((k) => full || !cache.days.has(k))
  if (memberTodo.length || dayTodo.length) {
    const [memberVals, dayVals] = await Promise.all([
      Promise.all(memberTodo.map(async (k) => ({ k, v: await kvGet<Member>(k).catch(() => null) }))),
      Promise.all(dayTodo.map(async (k) => ({ k, v: await kvGet<VitalRecord[]>(k).catch(() => null) }))),
    ])
    for (const { k, v } of memberVals) {
      if (v && typeof v === 'object' && v.id) cache.members.set(k, v)
      else if (!v) cache.members.delete(k)
    }
    for (const { k, v } of dayVals) {
      if (Array.isArray(v)) cache.days.set(k, v)
      else if (!v) cache.days.delete(k)
    }
  }
  cache.knownKeys = keySet

  const members = [...cache.members.values()].sort((a, b) => a.createdAt - b.createdAt)
  const records: VitalRecord[] = []
  for (const arr of cache.days.values()) for (const r of arr) if (r && r.id) records.push(r)
  records.sort((a, b) => a.ts - b.ts)
  return { members, records, at: now }
}

// ── 写动作（全部先过 core.normalize* 唯一口径）───────────────────────────────
export async function saveMember(input: Record<string, unknown>, existing: Member | null): Promise<Member> {
  const r = core.normalizeMember(input, existing)
  if ('error' in r && r.error) throw new Error(r.error)
  const m = (r as { member: Member }).member
  await kvSet(K.member(m.id), m)
  return m
}

export interface RecordInput {
  profileId: string
  kind: string
  sys?: number; dia?: number; pulse?: number
  mmol?: number; slot?: string
  kg?: number; c?: number
  date?: string; time?: string
  note?: string
  id?: string
  src?: 'panel' | 'ai'
}

/** 记一笔（或按 id 覆盖）；返回落库记录 */
export async function addRecord(input: RecordInput): Promise<VitalRecord> {
  const r = core.normalizeRecord({ ...input, src: 'panel' }, Date.now())
  if ('error' in r && r.error) throw new Error(r.error)
  const rec = (r as { record: VitalRecord }).record
  const date = core.dayKeyOfTs(rec.ts)
  const key = K.day(date)
  const cur = await kvGet<VitalRecord[]>(key).catch(() => null)
  await kvSet(key, core.upsertRecord(cur, rec))
  return rec
}

/** 定位一笔记录（跨日键；家庭量级可接受） */
export async function locateRecord(id: string): Promise<{ date: string; dayArr: VitalRecord[]; record: VitalRecord } | null> {
  const keys = await kvKeys()
  const dayKeys = keys.filter((k) => k.startsWith(K.dayPrefix) && core.parseDayKey(k.slice(K.dayPrefix.length)) !== null)
  for (const k of dayKeys) {
    const arr = (await kvGet<VitalRecord[]>(k).catch(() => null)) || []
    const hit = Array.isArray(arr) ? arr.find((r) => r && r.id === id) : null
    if (hit) return { date: k.slice(K.dayPrefix.length), dayArr: arr, record: hit }
  }
  return null
}

/** 修改一笔（跨日自动迁移日键）；返回落库记录 */
export async function updateRecord(id: string, patch: Partial<RecordInput>): Promise<VitalRecord> {
  const loc = await locateRecord(id)
  if (!loc) throw new Error(`未找到记录 ${id}`)
  const old = loc.record
  const r = core.normalizeRecord({
    id: old.id,
    profileId: patch.profileId || old.profileId,
    kind: patch.kind !== undefined ? patch.kind : old.kind,
    sys: patch.sys !== undefined ? patch.sys : old.sys,
    dia: patch.dia !== undefined ? patch.dia : old.dia,
    pulse: patch.pulse !== undefined ? patch.pulse : old.pulse,
    mmol: patch.mmol !== undefined ? patch.mmol : old.mmol,
    slot: patch.slot !== undefined ? patch.slot : old.slot,
    kg: patch.kg !== undefined ? patch.kg : old.kg,
    c: patch.c !== undefined ? patch.c : old.c,
    date: patch.date, time: patch.time,
    note: patch.note !== undefined ? patch.note : old.note,
    src: 'panel',
  }, Date.now())
  if ('error' in r && r.error) throw new Error(r.error)
  const rec = (r as { record: VitalRecord }).record
  const newDate = core.dayKeyOfTs(rec.ts)
  if (newDate === loc.date) {
    await kvSet(K.day(loc.date), core.upsertRecord(loc.dayArr, rec))
  } else {
    const removed = core.removeRecord(loc.dayArr, id)
    await kvSet(K.day(loc.date), removed.arr)
    const target = (await kvGet<VitalRecord[]>(K.day(newDate)).catch(() => null)) || []
    await kvSet(K.day(newDate), core.upsertRecord(target, rec))
  }
  return rec
}

export async function deleteRecord(id: string): Promise<void> {
  const loc = await locateRecord(id)
  if (!loc) throw new Error(`未找到记录 ${id}`)
  const removed = core.removeRecord(loc.dayArr, id)
  await kvSet(K.day(loc.date), removed.arr)
}

/** 删除成员（有记录时需 purge 连带删记录） */
export async function deleteMember(id: string, purge: boolean, data: MaianData): Promise<void> {
  const recs = data.records.filter((r) => r.profileId === id)
  if (recs.length && !purge) {
    throw new Error(`该成员仍有 ${recs.length} 条体征记录，请先删除记录或选择一并删除`)
  }
  if (recs.length) {
    const byDay = new Map<string, VitalRecord[]>()
    for (const r of recs) {
      const d = core.dayKeyOfTs(r.ts)
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d)!.push(r)
    }
    for (const [d, arr] of byDay) {
      const cur = (await kvGet<VitalRecord[]>(K.day(d)).catch(() => null)) || []
      let next = cur
      for (const r of arr) next = core.removeRecord(next, r.id).arr
      await kvSet(K.day(d), next)
    }
  }
  await kvDel(K.member(id))
}

/** 导出全量（数据所有权：JSON 文本） */
export function exportAll(data: MaianData): string {
  const dayMap: Record<string, VitalRecord[]> = {}
  for (const r of data.records) {
    const d = core.dayKeyOfTs(r.ts)
    if (!dayMap[d]) dayMap[d] = []
    dayMap[d].push(r)
  }
  return core.exportAllText({ members: data.members, dayMap })
}
