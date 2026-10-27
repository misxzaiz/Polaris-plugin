/** forge-core.js（面板/MCP 共用核心）的类型声明 */
export declare const VALID_PLUGIN_ICONS: readonly string[]
export declare const VALID_VIEW_AREAS: readonly string[]
export declare const VALID_PERMISSIONS: readonly string[]

export interface LintIssue {
  rule: string
  msg: string
  fix: string
}
export interface LintReport {
  ok: boolean
  errors: LintIssue[]
  warns: LintIssue[]
  infos: LintIssue[]
  checked: number
}
export declare function lintManifest(input: unknown): LintReport

export interface TopicMetaLite {
  id: string
  title: string
  summary: string
  tags: string[]
}
export interface SearchHit {
  meta: TopicMetaLite
  score: number
}
export declare function searchTopics(
  metas: TopicMetaLite[],
  bodies: Record<string, string>,
  query: string,
): SearchHit[]
export declare function snippetFor(body: string, query: string, maxLen?: number): string
export declare function countOcc(hay: string, needle: string): number

export declare function applyTemplate(
  tpl: string,
  vars: Record<string, string | number>,
): { text: string; missing: string[] }

export interface ScaffoldSpec {
  id: string
  name: string
  prefix: string
  icon: string
  order: number
  withService: boolean
  withMcp: boolean
  panelType: string
  labelKey: string
}
export interface ScaffoldFile {
  path: string
  content: string
}
export declare function buildScaffold(
  templates: Record<string, string>,
  spec: ScaffoldSpec,
): { files: ScaffoldFile[]; warnings: string[] }

export declare function buildManifest(spec: ScaffoldSpec & { description?: string }): Record<string, unknown>
