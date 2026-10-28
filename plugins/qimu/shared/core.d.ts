/**
 * shared/core.js 的类型声明（CJS 实现，面板/MCP 同源一致）
 */

export interface ThemeToken {
  label: string
  dark: boolean
  bg: string
  bgAlt: string
  card: string
  accent: string
  accent2: string
  text: string
  sub: string
  hairline: string
  onAccent: string
  titleFont: string
  bodyFont: string
}

export type SlideType = 'cover' | 'section' | 'bullets' | 'two' | 'quote' | 'chart' | 'table' | 'end'

export interface DeckSlide {
  type: SlideType
  title?: string
  note?: string
  bullets?: ({ h?: string; d?: string; t?: string })[]
  left?: { h: string; points: string[] }
  right?: { h: string; points: string[] }
  text?: string
  author?: string
  chart?: { kind: 'bar' | 'line' | 'pie'; labels: string[]; series: { name: string; values: number[] }[] }
  head?: string[]
  rows?: string[][]
}

export interface Deck {
  title: string
  subtitle?: string
  author?: string
  theme: string
  slides: DeckSlide[]
  createdAt: number
}

export interface GeoBox {
  k: 'rect' | 'text' | 'chart' | 'table'
  x: number; y: number; w: number; h: number
  shape?: 'ellipse'
  fill?: string
  transparency?: number
  text?: string
  fontSize?: number
  bold?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  fontKey?: string
  shrink?: boolean
  chart?: DeckSlide['chart']
  colors?: string[]
  themeDark?: boolean
  onAccent?: string
  table?: { head: string[]; rows: string[][] }
  rowH?: number
  headerFill?: string
  zebra?: string
  hairline?: string
}

export interface GeoPage {
  type: SlideType
  boxes: GeoBox[]
}

export interface Geometry {
  W: number
  H: number
  theme: string
  themes: ThemeToken
  pages: GeoPage[]
  title: string
}

export interface OutlineResult {
  errors: string[] | null
  spec: Record<string, unknown> | null
}

export declare const K: {
  deck: (id: string) => string
  deckPrefix: string
  settings: string
}
export declare const PAGE: { W: number; H: number }
export declare const THEMES: Record<string, ThemeToken>
export declare const THEME_KEYS: string[]
export declare const SLIDE_TYPES: SlideType[]
export declare const CAPS: Record<string, number>
export declare const CHART_KINDS: string[]
export declare const DEFAULT_SETTINGS: { schemaVersion: number; exportDir: string; theme: string }

export declare function makeId(now?: number): string
export declare function estChars(text: string): number
export declare function titleFontSize(text: string, base: number, min: number): number
export declare function clampText(text: unknown, max: number): string
export declare function safeFileName(title: string, now?: number): { stamp: string; name: string; file: string }
export declare function normalizeDeck(raw: unknown): { error: string; deck?: never; warnings?: never } | { error?: never; deck: Deck; warnings?: string[] }
export declare function layout(deck: Deck): Geometry
export declare function parseOutline(text: string): OutlineResult
