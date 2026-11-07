/** shared/core.js 的类型声明（面板 TS 侧导入用；与 core.js 保持同步） */
export interface KillDecision {
  allowed: boolean
  code: 'ok' | 'invalid_pid' | 'system_critical' | 'self' | 'ancestor' | 'polaris_confirm'
  message: string
  warnings: string[]
}

export interface KillInput {
  pid: number
  name?: string
  path?: string
  cmd?: string
  selfPid?: number
  ancestorPids?: number[]
  allowProtected?: boolean
}

export interface AddrPort { addr: string; port: number }

export interface NetstatRow {
  proto: 'TCP' | 'UDP'
  local: AddrPort
  foreign: AddrPort
  state: string
  pid: number
}

export interface Locker { pid: number; app?: string | null; type?: string | null }

export interface ProcInfo {
  pid: number
  name: string
  cmd?: string | null
  path?: string | null
  started?: string | null
  cpu?: number | null
  ws?: number | null
}

export declare function normalizeName(name: unknown): string
export declare function isPolarisProc(name: unknown, path?: unknown): boolean
export declare function evaluateKill(input: KillInput): KillDecision
export declare function splitAddr(s: unknown, loose?: boolean): AddrPort | null
export declare function parseNetstat(text: unknown): NetstatRow[]
export declare function filterByPort(rows: NetstatRow[], port: number): NetstatRow[]
export declare function parseLockers(text: unknown): Locker[]
export declare function validatePort(p: unknown): number | null
export declare function looksAbsolutePath(p: unknown): boolean
export declare function auditPush(entries: unknown, entry: Record<string, unknown>, cap?: number): Record<string, unknown>[]
export declare function formatBytes(n: unknown): string
export declare function timeAgo(ts: number | undefined, now?: number): string
export declare function oneLine(s: unknown, n: number): string
export declare function procLine(p: ProcInfo | null | undefined): string
