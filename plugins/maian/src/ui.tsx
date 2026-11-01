/** 面板共享小件（分带标签 / 记录行文案）；口径全部转手 core，不另立标准 */
import * as core from '../shared/core'
import type { VitalRecord, Member } from './model'

export function BandTag({ level, label }: { level: string; label: string }) {
  if (level === 'none') return <span className="mn-tag">—</span>
  return <span className={`mn-tag ${level}`}>{label}</span>
}

export function bandOfRecord(r: VitalRecord, member?: Member | null): core.Band {
  return core.bandOf(r.kind, r as unknown as Record<string, unknown>, member?.heightCm)
}

export function memberOf(data: MaianDataLike, profileId: string): Member | undefined {
  return data.members.find((m) => m.id === profileId)
}
type MaianDataLike = { members: Member[] }

export function recordLine(r: VitalRecord, member?: Member | null): string {
  return `${core.fmtDT(r.ts)} · ${member ? member.name : '?'} · ${core.KIND_META[r.kind].label} ${core.fmtValue(r)}`
}
