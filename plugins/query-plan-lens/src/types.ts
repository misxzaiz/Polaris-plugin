/** 与 service/core.js 的统一树对齐的 TS 类型（跨语言手工同步，字段宽容） */

export type Engine = 'pg' | 'mysql'
export type Severity = 'critical' | 'warn' | 'info'

export interface PlanNode {
  id: string
  engine: Engine
  nodeType: string
  relation: string | null
  alias: string | null
  indexName: string | null
  estRows: number | null
  estCost: number | null
  examinedPerScan?: number | null
  filteredPct?: number | null
  actRows: number | null
  actRowsTotal: number | null
  loops: number
  actualMs: number | null
  selfMs: number | null
  startupMs: number | null
  removedByFilter: number | null
  neverExecuted: boolean
  flags: string[]
  detail: Record<string, string>
  children: PlanNode[]
}

export interface UnifiedPlan {
  engine: Engine
  statement: string | null
  totalCost: number | null
  actualMs: number | null
  planningMs: number | null
  executionMs: number | null
  settings: string | null
  triggers: number
  nodeCount: number
  root: PlanNode
}

export interface Finding {
  id: string
  severity: Severity
  title: string
  nodeId: string
  nodeLabel: string
  detail: string
  suggestion: string
}

export interface ExplainMeta {
  durationMs?: number
  serverVersion?: string
  analyzeUsed?: boolean
  note?: string
  historyId?: string
  source?: string
}

export interface ExplainResult {
  ok: boolean
  plan: UnifiedPlan
  findings: Finding[]
  raw?: string
  meta: ExplainMeta
}

export interface ConnInfo {
  id: string
  name: string
  engine: Engine
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  hasPassword: boolean
  createdAt?: number
}

export interface HistoryItem {
  id: string
  ts: number
  engine: Engine
  connName: string
  sql: string
  analyzeUsed: boolean
  findingsCount: number
}
