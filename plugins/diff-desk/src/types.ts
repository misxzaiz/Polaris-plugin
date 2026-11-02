/** 与 service/main.js 响应形状对齐（服务端为权威，改协议须双侧同步） */

export interface Span {
  text: string;
  type: 'equal' | 'del' | 'ins';
}

export interface Cell {
  no: number;
  text: string;
  type: 'equal' | 'delete' | 'insert' | 'modify';
  spans: Span[] | null;
}

export interface Row {
  left: Cell | null;
  right: Cell | null;
}

export interface LineItem {
  type: 'equal' | 'delete' | 'insert' | 'modify';
  aNo?: number;
  bNo?: number;
  text?: string;
  aText?: string;
  bText?: string;
  spans?: { left: Span[]; right: Span[] };
}

export interface Hunk {
  aStart: number;
  bStart: number;
  lines: LineItem[];
  rows: Row[];
}

export interface TextStats {
  additions: number;
  deletions: number;
  modifies: number;
  equal: number;
  aLines: number;
  bLines: number;
}

export interface JsonStats {
  added: number;
  removed: number;
  changed: number;
  order: number;
}

export type DiffStats = TextStats & Partial<JsonStats>;

export interface JsonChange {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'order';
  oldText: string | null;
  newText: string | null;
  note?: string;
}

export interface SideMeta {
  path?: string;
  size?: number;
  charset?: string;
  entries?: number;
  skipped?: number;
}

export interface UrlSideMeta {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  byteLength: number;
  truncated: boolean;
  redirects: number;
  elapsedMs: number;
}

export interface DiffResult {
  kind: 'text' | 'json';
  stats: DiffStats;
  hunks?: Hunk[];
  changes?: JsonChange[];
  truncated?: boolean;
  patch?: string;
  patchTruncated?: boolean;
  aMeta?: SideMeta;
  bMeta?: SideMeta;
  aSide?: UrlSideMeta;
  bSide?: UrlSideMeta;
}

export interface DirEntry {
  path: string;
  kind: 'file' | 'dir';
  size: number;
  mtimeMs: number;
}

export interface DirList {
  items: string[];
  total: number;
  truncated: boolean;
}

export interface DirResult {
  onlyLeft: DirList;
  onlyRight: DirList;
  changed: DirList;
  same: number;
  unknown: number;
  dirCount: number;
  aMeta: SideMeta;
  bMeta: SideMeta;
}

export interface HistoryItem {
  id: string;
  ts: number;
  kind: 'text' | 'json' | 'dirs' | 'urls';
  label: string;
  stats: Record<string, number>;
}

export interface SelftestItem {
  name: string;
  ok: boolean;
  detail?: string;
}
