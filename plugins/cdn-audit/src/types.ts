/** 报告与行类型（与 service/main.js JSON 形状对齐） */

export type Verdict = 'match' | 'match-origin' | 'mismatch' | 'cdn-generated' | 'unreachable' | 'unverifiable' | 'error';

export interface Finding {
  sev: 'red' | 'yellow' | 'info' | 'green';
  code: string;
  title: string;
  detail?: string;
  fix?: string;
}

export interface CheckRow {
  url: string;
  tag: string;
  sriAttr?: string;
  family: string;
  cdnId: string;
  cdnLabel: string;
  host: string;
  pkg: string;
  ver: string;
  file: string;
  fetch: {
    ok: boolean;
    status: number;
    byteLength: number;
    elapsedMs: number;
    error?: string;
    truncated?: boolean;
    digests?: { sha256: string; sha384: string; sha512: string } | null;
  } | null;
  verdict: Verdict;
  auth?: { ver?: string; genuine?: boolean; sourceNote?: string; tarball?: boolean; dataapi?: boolean } | null;
  sri?: { attr: string; check: string; note: string } | null;
  sriTagSuggestion?: { integrity: string; source: string } | null;
  note: string;
}

export interface MirrorRow {
  cdnId: string;
  label: string;
  url: string;
  crossFamily?: boolean;
  status: number;
  byteLength: number;
  elapsedMs: number | null;
  error?: string;
  sha256?: string;
  verdict: Verdict;
  note: string;
}

export interface BaseReport {
  runId: string;
  kind: 'check' | 'mirror' | 'sri' | string;
  label: string;
  version: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  ok: boolean;
  fatal?: { cn: string; detail?: string } | null;
  source?: Record<string, unknown> | null;
  rows: CheckRow[] | MirrorRow[];
  notes?: string[];
  findings: Finding[];
  counts: { red: number; yellow: number; info: number; green: number } | null;
  score: { total: number } | null;
  summary?: Record<string, number> | null;
  tags?: { script: string; link: string; integrity: string; integrity512: string };
  tagSource?: string;
  tagNote?: string;
}

export interface HistoryItem {
  runId: string;
  at: string;
  kind: string;
  label: string;
  score: number | null;
  counts: { red: number; yellow: number; info: number; green: number } | null;
  ok: boolean;
}

export interface WatchSample {
  t: string;
  o: { ok: boolean; status: number; bytes: number; sha256: string };
  e: { ok: boolean; status: number; bytes: number; sha256: string };
  equal: boolean;
}

export interface Watch {
  id: string;
  originUrl: string;
  edgeUrl: string;
  intervalSec: number;
  status: 'running' | 'equal' | 'timeout' | 'cancelled' | 'interrupted';
  startedAt: string;
  finishedAt: string | null;
  samples: WatchSample[];
  note?: string;
  lastSample?: WatchSample | null;
}

export interface MirrorInfo {
  id: string;
  label: string;
  family: 'npm' | 'cdnjs';
}

export interface Settings {
  timeoutMs: number;
  maxBytesMB: number;
  proxy: string;
  deep: 'auto' | 'off';
  enabledMirrors: string[];
  watchIntervalSec: number;
  purgeCooldownMin: number;
}

export interface StatusInfo {
  ts: string;
  version: string;
  port: number;
  pid: number;
  uptimeMs: number;
  running: { runId: string; kind: string; label: string; step: string; startedAt: string } | null;
  watchesRunning: number;
}
