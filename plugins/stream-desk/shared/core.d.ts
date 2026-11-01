/** shared/core.js 的类型声明（面板 TS 消费；实现为同目录 core.js） */

export interface SseEvent {
  event: string | null;
  id: string | null;
  retry: number | null;
  data: string;
  raw: string;
  partial?: boolean;
}

export interface SseParser {
  push(chunk: string): SseEvent[];
  flush(): SseEvent[];
  comments(): number;
  pending(): string;
}

export declare function createSseParser(): SseParser;
export declare function isEventStreamContentType(contentType: unknown): boolean;

export declare function isSensitiveHeaderName(name: unknown): boolean;
export declare function maskValue(v: unknown): string;
export declare function maskHeaders(
  headers: Record<string, string> | null | undefined,
  enabled?: boolean,
): Record<string, string>;

export interface Truncated {
  text: string;
  truncated: boolean;
  size: number;
}
export declare function truncateText(s: unknown, cap: number): Truncated;

export interface GapStats {
  count: number;
  min: number;
  median: number;
  mean: number;
  p95: number;
  max: number;
}
export declare function gapStats(gaps: number[]): GapStats | null;

export declare function formatBytes(n: unknown): string;
export declare function formatMs(ms: unknown): string;

export declare function wsCloseCodeName(code: number | null | undefined): string;

export interface Frame {
  seq: number;
  ts: number;
  gapMs: number;
  dir: 'in' | 'out' | 'note';
  kind: string;
  size?: number;
  text?: string;
  b64?: string;
  truncated?: boolean;
  code?: number;
  reason?: string;
  latencyMs?: number;
  rttMs?: number;
  level?: 'info' | 'warn' | 'error';
  message?: string;
  event?: string | null;
  id?: string | null;
  httpStatus?: number;
}

export interface SessionRequest {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  subprotocols?: string[];
  pingIntervalSec?: number;
  body?: string;
}

export interface HandshakeInfo {
  ok: boolean;
  httpStatus?: number;
  statusText?: string;
  latencyMs?: number;
  headers?: Record<string, string>;
  error?: string;
}

export interface SessionCounters {
  in?: number;
  out?: number;
  pings?: number;
  pongs?: number;
  errors?: number;
  bytesIn?: number;
  bytesOut?: number;
}

export interface SessionStats {
  ttftMs?: number;
  firstEventMs?: number;
  totalMs?: number;
  bytes?: number;
  eventCount?: number;
  chunkCount?: number;
  gaps?: GapStats;
  comments?: number;
}

export interface SessionLike {
  id: string;
  kind: 'ws' | 'sse';
  url: string;
  title?: string;
  state: string;
  createdAt: number;
  openAt?: number | null;
  closedAt?: number | null;
  closedReason?: string;
  request: SessionRequest;
  handshake?: HandshakeInfo | null;
  counters?: SessionCounters;
  stats?: SessionStats | null;
  frames?: Frame[];
  nextSeq?: number;
}

export interface SessionSummary {
  id: string;
  kind: 'ws' | 'sse';
  url: string;
  title: string;
  state: string;
  createdAt: number;
  openAt: number | null;
  closedAt: number | null;
  closedReason: string;
  frameCount: number;
  counters: SessionCounters;
  stats: SessionStats | null;
}

export declare function projectFrame(frame: Frame, bodyCap?: number): Frame;
export declare function projectSessionForKv(
  session: SessionLike,
  opts?: { bodyCap?: number; tail?: number; maskHeaders?: boolean },
): Record<string, unknown> & { frames: Frame[] };
export declare function sessionSummary(session: SessionLike): SessionSummary;
export declare function shortId(rand?: () => number): string;
