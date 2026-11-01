/** audit-core 的面板侧类型声明（与 JS 实现同源；service 为 JS 单方权威） */
export declare const VERSION: string
export declare const PLUGIN_ID: string
export declare const UA_TOKEN: string

export interface LimitSpec { min: number; max: number; default: number }
export declare const LIMITS: {
  maxPages: LimitSpec
  delayMs: LimitSpec
  timeoutS: LimitSpec
  concurrency: LimitSpec
  slowMs: LimitSpec
  auditTimeoutS: LimitSpec
  externalCap: LimitSpec
  maxBodyBytes: number
  maxHops: number
  scopeHostMax: number
}

export interface NormalizeResult {
  ok: boolean
  error?: string
  url?: string
  key?: string
  host?: string
  scheme?: string
}
export declare function normalizeUrl(input: string, base?: string): NormalizeResult
export declare function isCrawlableHref(href: string): boolean
export declare function hostOf(url: string): string
export declare function isMetadataTarget(url: string): boolean

export interface RobotsGroup { agents: string[]; allow: string[]; disallow: string[]; crawlDelayMs: number | null }
export interface RobotsParsed { groups: RobotsGroup[]; sitemaps: string[]; ok: boolean }
export declare function parseRobots(text: string): RobotsParsed
export declare function robotsAllows(robots: RobotsParsed | null, pathUrl: string): { allowed: boolean; rule: string | null; crawlDelayMs: number | null }

export declare function decodeHtml(buf: Buffer, contentType?: string | null): { text: string; charset: string }

export interface ScannedLink { href: string; nofollow: boolean }
export interface ScannedImage { src: string; hasAltAttr: boolean }
export interface ScannedResource { url: string; kind: 'style' | 'icon' | 'script' }
export interface ScanResult {
  title: string
  description: string | null
  metaRobots: string | null
  noindex: boolean
  nofollowAll: boolean
  metaRefreshUrl: string | null
  canonical: string | null
  canonicalCount: number
  lang: string | null
  h1Count: number
  baseHref: string | null
  charsetMeta: string | null
  links: ScannedLink[]
  images: ScannedImage[]
  resources: ScannedResource[]
}
export declare function scanHtml(html: string): ScanResult

export interface Hop { url: string; status?: number; location?: string }
export declare function evalRedirectChain(hops: Hop[], scopeHosts: string[]): { count: number; loop: boolean; escaped: boolean; finalUrl: string }

export interface IssueTypeMeta { severity: 'error' | 'warn' | 'info'; weight: number; cap: number; label: string; hint: string }
export declare const ISSUE_TYPES: Record<string, IssueTypeMeta>

export interface IssueItem { url: string; detail?: string; source?: string | null; dupUrls?: string[] }
export interface IssueGroup {
  type: string
  severity: 'error' | 'warn' | 'info'
  label: string
  hint: string
  count: number
  truncated: boolean
  items: IssueItem[]
}
export interface Verdict { oneLine: string; notes: string[] }

export interface PageRecord {
  url: string
  status?: number
  statusText?: string
  ms: number
  bytes: number
  contentType?: string
  error?: string
  source?: string | null
  depth?: number
  title?: string
  titleLen?: number
  description?: string | null
  descLen?: number
  lang?: string | null
  h1Count?: number
  noindex?: boolean
  metaRobots?: string | null
  metaRefresh?: string | null
  canonical?: string | null
  canonicalCount?: number
  imgNoAlt?: number
  linkCount?: number
  mixedRefs?: string[]
  hops?: Hop[]
  robotsBlocked?: boolean
}
export interface AssetRecord { url: string; kind: string; status?: number; ms: number; bytes?: number; error?: string; source?: string | null }
export interface ExternalRecord { url: string; status?: number; ms: number; error?: string; sources: string[] }

export interface RobotsInfo { fetched: boolean; url?: string; crawlDelayMs?: number | null; disallowCount?: number; sitemaps?: string[] }
export interface SitemapInfo { fetched: boolean; url?: string | null; urls: string[] }

export interface AuditOptions {
  maxPages: number
  delayMs: number
  timeoutS: number
  concurrency: number
  slowMs: number
  auditTimeoutS: number
  externalCap: number
  respectRobots: boolean
  checkExternal: boolean
  checkAssets: boolean
}
export declare function sanitizeOptions(input: unknown): { ok: boolean; error?: string; value?: { seedUrl: string; options: AuditOptions } }

export interface AuditReport {
  auditId: string
  at: string
  version: string
  aborted: boolean
  /** 种子请求失败等致命原因（体检未能正常开始时由 service 附加） */
  fatal?: string | null
  seed: { url: string; scopeHosts: string[] }
  options: AuditOptions
  robots: { fetched: boolean; crawlDelayMs: number | null; disallowCount: number; sitemaps: string[] }
  sitemap: { fetched: boolean; url: string | null; urlCount: number }
  stats: {
    pagesCrawled: number
    assetsChecked: number
    externalChecked: number
    externalSkipped: number
    robotsBlocked: number
    durationMs: number
    statusDist: Record<string, number>
    avgPageMs: number | null
    spaSuspect: boolean
  }
  issues: IssueGroup[]
  slowest: { url: string; ms: number; bytes: number }[]
  externalByDomain: Record<string, string[]>
  score: { value: number; verdict: Verdict }
}
export declare function buildReport(input: {
  auditId: string
  at?: string
  seed: string
  scopeHosts: string[]
  options: AuditOptions
  pages: PageRecord[]
  assets: AssetRecord[]
  externals: ExternalRecord[]
  robots: RobotsInfo | null
  sitemap: SitemapInfo | null
  aborted?: boolean
  durationMs?: number
  externalSkipped?: number
}): AuditReport

export declare function renderReportText(rep: AuditReport): string
export declare function issuesToCsv(rep: AuditReport): string

export interface SitemapParsed { kind: 'index' | 'urlset' | 'unknown'; locs: string[] }
export declare function parseSitemap(xml: string): SitemapParsed

export declare function clamp(v: unknown, lim: LimitSpec, dft: number): number
export declare function fmtMs(v: unknown): string
export declare function fmtBytes(v: unknown): string
