/** model.ts —— 面板类型与共享常量 */

export type Transport = 'stdio' | 'http';

export interface Profile {
  id: string;
  name: string;
  transport: Transport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  origin: string;
  sourceScope: string;
  sourcePath: string;
  legacy: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface PoolInfo {
  serverId: string;
  status: string;
  serverInfo: { name?: string; version?: string } | null;
  protocolVersion: string;
  toolCount: number;
  connectedAt: number;
  lastUsedAt: number;
  poisoned: boolean;
  lastError: string;
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface HostServer {
  pluginId: string;
  server: string;
  tools: ToolInfo[];
  toolGates?: Record<string, boolean> | null;
  injected?: string;
  via?: string;
}

export interface ProbeState {
  version: string;
  startedAt: string;
  degraded: boolean;
  settings: { initTimeoutMs: number; callTimeoutMs: number };
  profiles: Profile[];
  pool: PoolInfo[];
  counts: { history: number; snapshots: number; reports: number };
}

export interface Issue {
  tool: string;
  level: 'error' | 'warn';
  msg: string;
}

export interface HealthReport {
  id: string;
  at: string;
  kind: 'host' | 'external';
  serverId: string;
  serverName: string;
  ok: boolean;
  initLatencyMs?: number | null;
  listLatencyMs?: number | null;
  roundtripMs?: number | null;
  protocolVersion?: string;
  serverInfo?: { name?: string; version?: string } | null;
  toolCount: number;
  issues: Issue[];
  error?: string;
  note?: string;
  reusedConnection?: boolean;
}

export interface CallRecord {
  id: string;
  at: string;
  serverId: string;
  serverName: string;
  tool: string;
  argsText: string;
  resultText: string;
  isError: boolean;
  durationMs: number;
  via: 'panel' | 'ai';
  source: 'host' | 'external';
}

export interface Snapshot {
  id: string;
  at: string;
  serverId: string;
  serverName: string;
  via: 'panel' | 'ai';
  toolCount: number;
  truncated: boolean;
  tools: ToolInfo[];
}

export interface ConnectInfo {
  initLatencyMs: number | null;
  protocolVersion: string;
  serverInfo: { name?: string; version?: string } | null;
  capabilities: Record<string, unknown> | null;
  tools: ToolInfo[];
  resources: unknown[];
  prompts: unknown[];
}

export interface ScanCandidate {
  key: string;
  name: string;
  transport: Transport;
  legacy: boolean;
  command: string;
  args: string[];
  url: string;
  scope: string;
  sourcePath: string;
}

export interface ScanFile {
  path: string;
  scope: string;
  exists: boolean;
  error: string;
}

export const TABS = [
  { key: 'servers', label: '服务器' },
  { key: 'workbench', label: '调试' },
  { key: 'health', label: '体检' },
  { key: 'history', label: '历史' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export function timeAgo(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '?';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

export function prettyMs(ms: number | null | undefined): string {
  if (ms == null) return '?';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
