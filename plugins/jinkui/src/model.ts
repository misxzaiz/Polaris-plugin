/**
 * 通信层 + 数据访问（保单台账面板）
 *
 * 面板经宿主 invoke 通道调 router_dispatch，与 MCP server 读写
 * 同一个 cap.kv 的 jinkui.* 键空间（无后台服务，派生一律 shared/core 现算）。
 *
 * 键空间契约（与 mcp/server.js 两方一致，权威描述见 README）：
 *   jinkui.member.<id>   成员（面板/MCP 直写）
 *   jinkui.policy.<id>   保单（面板/MCP 直写）
 *   jinkui.ev.<occKey>   事件 type|policyId|date（面板/MCP 直写，幂等覆盖）
 *   jinkui.settings      设置（面板写）
 */
import * as core from '../shared/core'
import { kvDel, kvGet, kvKeys, kvSet } from './host'

export type Member = core.Member
export type Policy = core.Policy
export type PolicyEvent = core.PolicyEvent
export type Settings = core.Settings
export type PolicyState = core.PolicyState

export const PREFIX = 'jinkui.'
export const K = {
  member: (id: string) => `${PREFIX}member.${id}`,
  memberPrefix: `${PREFIX}member.`,
  policy: (id: string) => `${PREFIX}policy.${id}`,
  policyPrefix: `${PREFIX}policy.`,
  ev: (occKey: string) => `${PREFIX}ev.${occKey}`,
  evPrefix: `${PREFIX}ev.`,
  settings: `${PREFIX}settings`,
}

export interface JinkuiData {
  members: Member[]
  policies: Policy[]
  events: PolicyEvent[]
  settings: Settings
}

export interface CacheState {
  knownKeys: Set<string> | null
  fullAt: number
  vals: Map<string, unknown>
}
export function newCache(): CacheState {
  return { knownKeys: null, fullAt: 0, vals: new Map() }
}

const FULL_REFRESH_MS = 90 * 1000
const ENTITY_PREFIXES = [K.memberPrefix, K.policyPrefix, K.evPrefix]

/** 一轮数据装载（键集 diff + 90s 全量兜底；设置每轮必拉） */
export async function loadJinkui(cache: CacheState): Promise<JinkuiData> {
  const keys = await kvKeys()
  const now = Date.now()
  const full = !cache.knownKeys || now - cache.fullAt > FULL_REFRESH_MS
  if (full) {
    cache.vals.clear()
    cache.fullAt = now
  }
  const keySet = new Set(keys)
  for (const k of [...cache.vals.keys()]) {
    if (!keySet.has(k)) cache.vals.delete(k)
  }
  const entityKeys = keys.filter((k) => ENTITY_PREFIXES.some((p) => k.startsWith(p)))
  const todo = entityKeys.filter((k) => full || !cache.vals.has(k))
  if (todo.length) {
    const fetched = await Promise.all(todo.map(async (k) => {
      const v = await kvGet<Record<string, unknown>>(k).catch(() => null)
      return { k, v }
    }))
    for (const { k, v } of fetched) {
      if (v && typeof v === 'object') cache.vals.set(k, v)
      else if (!v) cache.vals.delete(k)
    }
  }
  cache.knownKeys = keySet

  const collect = <T>(prefix: string): T[] =>
    ([...cache.vals.entries()] as [string, unknown][])
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v as T)
  const members = collect<Member>(K.memberPrefix)
    .filter((v) => v && typeof v.id === 'string')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const policies = collect<Policy>(K.policyPrefix)
    .filter((v) => v && typeof v.id === 'string')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const events = collect<PolicyEvent>(K.evPrefix)
    .filter((v) => v && typeof v.occKey === 'string')

  const settingsRaw = await kvGet<Partial<Settings>>(K.settings).catch(() => null)
  return { members, policies, events, settings: core.normalizeSettings(settingsRaw) }
}

// ── 派生（core 现算，与 MCP 同源）────────────────────────────────────────────
export function stateOf(data: JinkuiData, policy: Policy, now: number): PolicyState {
  return core.policyStatus(policy, eventsOf(data, policy.id), data.settings, now)
}
export function eventsOf(data: JinkuiData, policyId: string): PolicyEvent[] {
  return core.eventsFor(data.events, policyId)
}
export function memberName(data: JinkuiData, id: string): string {
  const m = data.members.find((x) => x.id === id)
  return m ? m.name : '未知成员'
}

// ── 写动作（全部先过 core.normalize* 唯一口径）───────────────────────────────
export async function saveMember(input: Record<string, unknown>, existing: Member | null): Promise<Member> {
  const r = core.normalizeMember(input, existing)
  if (r.error || !r.member) throw new Error(r.error || '参数不合法')
  await kvSet(K.member(r.member.id), r.member)
  return r.member
}
export async function savePolicy(input: Record<string, unknown>, existing: Policy | null): Promise<Policy> {
  const r = core.normalizePolicy(input, existing)
  if (r.error || !r.policy) throw new Error(r.error || '参数不合法')
  await kvSet(K.policy(r.policy.id), r.policy)
  return r.policy
}
export async function saveEvent(input: Record<string, unknown>): Promise<PolicyEvent> {
  const r = core.normalizeEvent(input, null)
  if (r.error || !r.ev) throw new Error(r.error || '参数不合法')
  await kvSet(K.ev(r.ev.occKey), r.ev)
  return r.ev
}
export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(K.settings, s)
}
export async function deletePolicy(id: string, data: JinkuiData): Promise<number> {
  const evKeys = data.events.filter((e) => e.policyId === id).map((e) => K.ev(e.occKey))
  for (const k of evKeys) await kvDel(k)
  await kvDel(K.policy(id))
  return evKeys.length
}
export async function deleteMember(id: string, data: JinkuiData): Promise<void> {
  const owned = data.policies.filter((p) => p.insuredId === id || p.holderId === id)
  if (owned.length) {
    throw new Error(`「${memberName(data, id)}」名下有 ${owned.length} 张保单，先处理保单再删成员`)
  }
  await kvDel(K.member(id))
}
export async function deleteEvent(occKey: string): Promise<void> {
  await kvDel(K.ev(occKey))
}

/** 导出：成员 + 保单 + 全部事件 + 设置（JSON，导入走设置 Tab） */
export function exportAll(data: JinkuiData): string {
  return JSON.stringify({
    kind: 'jinkui-export', version: 1, exportedAt: new Date().toISOString(),
    members: data.members, policies: data.policies, events: data.events, settings: data.settings,
  }, null, 2)
}
/** 导入：合并判重（同 id / 同 occKey 跳过），返回写入数量 */
export async function importAll(json: string): Promise<{ members: number; policies: number; events: number }> {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('不是合法 JSON') }
  const p = parsed as { kind?: string; members?: Member[]; policies?: Policy[]; events?: PolicyEvent[]; settings?: Settings }
  if (!p || p.kind !== 'jinkui-export' || !Array.isArray(p.policies)) {
    throw new Error('不是保单台账导出文件（缺 kind: jinkui-export）')
  }
  let nMember = 0
  let nPolicy = 0
  let nEv = 0
  for (const raw of p.members || []) {
    const r = core.normalizeMember(raw as unknown as Record<string, unknown>, null)
    if (r.error || !r.member) continue
    await kvSet(K.member(r.member.id), r.member)
    nMember++
  }
  for (const raw of p.policies) {
    const r = core.normalizePolicy(raw as unknown as Record<string, unknown>, null)
    if (r.error || !r.policy) continue
    await kvSet(K.policy(r.policy.id), r.policy)
    nPolicy++
  }
  for (const raw of p.events || []) {
    const r = core.normalizeEvent(raw as unknown as Record<string, unknown>, null)
    if (r.error || !r.ev) continue
    await kvSet(K.ev(r.ev.occKey), r.ev)
    nEv++
  }
  if (p.settings && typeof p.settings === 'object') await kvSet(K.settings, core.normalizeSettings(p.settings))
  return { members: nMember, policies: nPolicy, events: nEv }
}
