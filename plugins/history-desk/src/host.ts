/**
 * host.ts —— history-desk 宿主通道（面板唯一数据入口）
 *
 * 通道（plans/session-history-plugin-prd.md §4）：
 * - cap.history v2：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.history
 * - 后端消息库兜底：__POLARIS_HOST_INVOKE__('message_read')（白名单内）
 * - 运行态查询：__POLARIS_HOST_INVOKE__('is_chat_session_running')
 * - 会话桥：__POLARIS_SESSION_API__（restore/fork，宿主委托 sessionRestore）
 * - 生命周期事件：__POLARIS_HOST_LISTEN__('chat-event')（session_start/end 透传）
 * - 插件配置：plugin_get_config / plugin_set_config（偏好承载）
 *
 * 硬约束：禁止直调 dialog_* / history_query 等裸命令与 __TAURI_INTERNALS__.invoke；
 * 删除一律走 cap.history delete_session（宿主编排含中断 + 墓碑），插件零写入。
 */

export type HostInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** 宿主 listen 契约：返回 Promise<unlisten>（对齐 terminal-desk 教训：异步注册） */
export type HostListen = (event: string, handler: (payload: unknown) => void) => Promise<() => void>;

export interface PolarisSessionApi {
  restore(
    conversationId: string,
    opts?: {
      engineId?: string;
      projectPath?: string;
      claudeProjectName?: string;
      title?: string;
    },
  ): Promise<string | null>;
  fork(
    conversationId: string,
    opts?: {
      engineId?: string;
      projectPath?: string;
      claudeProjectName?: string;
      branchName?: string;
    },
  ): Promise<string | null>;
}

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
  __POLARIS_HOST_LISTEN__?: HostListen;
  __POLARIS_SESSION_API__?: PolarisSessionApi;
  __POLARIS_HOST_WORKSPACE__?: string;
}

function globals(): HostGlobals {
  return window as unknown as HostGlobals;
}

export function getHostInvoke(): HostInvoke {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）');
  return fn;
}

export function getHostListen(): HostListen {
  const fn = globals().__POLARIS_HOST_LISTEN__;
  if (!fn) throw new Error('宿主 listen 不可用：需要主应用提供 __POLARIS_HOST_LISTEN__（请更新 Polaris 主应用）');
  return fn;
}

export function getSessionApi(): PolarisSessionApi {
  const api = globals().__POLARIS_SESSION_API__;
  if (!api) throw new Error('会话桥不可用：需要主应用提供 __POLARIS_SESSION_API__（请更新 Polaris 主应用）');
  return api;
}

export function getHostWorkspacePath(): string {
  return globals().__POLARIS_HOST_WORKSPACE__ ?? '';
}

// ---------------------------------------------------------------------------
// cap.history v2 调用
// ---------------------------------------------------------------------------

interface RouterResponse<T> {
  ok: boolean;
  result?: T;
  error?: string | null;
}

export const CAP_ID = 'cap.history';

/** cap.history 动作调用（router_dispatch 统一权限 gate + 审计） */
export async function capHistory<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await getHostInvoke()<RouterResponse<T>>('router_dispatch', {
    req: { target: CAP_ID, payload: { action, ...payload } },
  });
  if (!res || res.ok !== true) {
    throw new Error((res && res.error) || `cap.history ${action} 调用失败`);
  }
  return (res.result ?? ({} as T)) as T;
}

// ---------------------------------------------------------------------------
// 契约类型（与后端 HistorySessionRow / HistoryQueryResult 对齐，camelCase）
// ---------------------------------------------------------------------------

export type HistorySource = 'self' | 'claude-code-native' | 'plugin-native';

export interface HistorySessionRow {
  id: string;
  source: string;
  engineId: string;
  title: string;
  workspacePath: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  fileSize: number | null;
  preview: string | null;
  firstUserText: string | null;
  gitBranch: string | null;
  starred: boolean;
  pinned: boolean;
  archived: boolean;
  color: string | null;
  userTags: string[];
  note: string | null;
  snippet?: string | null;
}

export interface HistoryQueryParams {
  workspacePath?: string | null;
  engines?: string[];
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  source?: string;
  forceScan?: boolean;
  strictWorkspace?: boolean;
  page?: number;
  pageSize?: number;
}

export interface HistoryQueryResult {
  items: HistorySessionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HistoryMarks {
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  color?: string;
  userTags?: string[];
  note?: string;
}

/** 统一时间线条目（视图层模型，由 HistorySessionRow 归一而来） */
export interface UnifiedHistoryItem {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
  engineId: string;
  source: HistorySource;
  fileSize?: number;
  projectPath?: string;
  claudeProjectName?: string;
  snippet?: string;
  preview?: string;
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  color?: string;
  userTags?: string[];
  note?: string;
  parentSessionId?: string;
  childSessionIds?: string[];
  gitBranch?: string;
  linkedPr?: { number: number; url?: string; title?: string; state?: 'open' | 'merged' | 'closed' };
}

export interface PagedHistoryResult {
  items: UnifiedHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/** index 行 → 视图模型（source 口径对齐宿主 historyService.indexRowToItem） */
export function rowToItem(row: HistorySessionRow): UnifiedHistoryItem {
  const source: HistorySource =
    row.source === 'claude-native'
      ? 'claude-code-native'
      : row.source === 'plugin-native'
        ? 'plugin-native'
        : 'self';
  return {
    id: row.id,
    title: row.title || '未命名会话',
    timestamp: row.updatedAt || row.createdAt || new Date().toISOString(),
    messageCount: row.messageCount ?? 0,
    engineId: row.engineId || 'claude-code',
    source,
    fileSize: row.fileSize ?? undefined,
    projectPath: row.workspacePath ?? undefined,
    snippet: row.snippet ?? row.firstUserText ?? undefined,
    preview: row.preview ?? undefined,
    starred: row.starred,
    pinned: row.pinned,
    archived: row.archived,
    color: row.color ?? undefined,
    userTags: row.userTags ?? [],
    note: row.note ?? undefined,
    gitBranch: row.gitBranch ?? undefined,
  };
}

/** 统一时间线查询（cap.history query） */
export async function queryTimeline(params: HistoryQueryParams): Promise<PagedHistoryResult> {
  const result = await capHistory<HistoryQueryResult>('query', { params });
  const pageSize = result.pageSize || params.pageSize || 20;
  const totalPages = Math.ceil((result.total || 0) / pageSize);
  return {
    items: (result.items ?? []).map(rowToItem),
    total: result.total ?? 0,
    page: result.page ?? params.page ?? 1,
    pageSize,
    totalPages,
    hasMore: (result.page ?? 1) < totalPages,
  };
}

/** 全文搜索（cap.history search，FTS5 命中片段） */
export async function searchHistory(
  query: string,
  workspacePath?: string | null,
  strictWorkspace?: boolean,
  limit = 50,
): Promise<UnifiedHistoryItem[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await capHistory<HistorySessionRow[]>('search', {
    query: q,
    workspacePath: workspacePath ?? null,
    strictWorkspace: strictWorkspace || undefined,
    limit,
  });
  return (rows ?? []).map(rowToItem);
}

/** 更新标注（cap.history mark） */
export async function markHistory(id: string, marks: HistoryMarks): Promise<void> {
  await capHistory('mark', { id, marks });
}

/** 删除会话（cap.history delete_session：宿主编排——中断/JSONL/消息库墓碑/索引） */
export async function deleteHistorySession(
  sessionId: string,
  source?: HistorySource,
  engineId?: string,
): Promise<void> {
  await capHistory('delete_session', {
    sessionId,
    source: source ?? undefined,
    engineId: engineId ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// 归档分页（预览向上补读）与后端消息库兜底
// ---------------------------------------------------------------------------

export interface ArchivePageResult {
  meta: { externalId?: string; engineId?: string; title?: string; workspacePath?: string | null };
  messages: ArchiveMessage[];
  earliestSeq: number | null;
  total: number;
  hasMore: boolean;
}

/** 宿主 archive_page 返回的消息（已按 id + 内容指纹去重，可直接渲染） */
export interface ArchiveMessage {
  id: string;
  type: string;
  content?: string;
  timestamp?: string;
  blocks?: Array<{ type: string; content?: string; [k: string]: unknown }>;
  thinking?: string;
  toolCalls?: Array<{ id: string; name?: string; status?: string; output?: string }>;
  isStreaming?: boolean;
  [k: string]: unknown;
}

/** 归档分页（cap.history archive_page；会话不在 JSONL 归档时抛错） */
export async function fetchArchivePage(
  sessionId: string,
  beforeSeq: number | null,
  limit: number,
): Promise<ArchivePageResult> {
  return capHistory<ArchivePageResult>('archive_page', {
    sessionId,
    beforeSeq: beforeSeq ?? undefined,
    limit,
  });
}

/** 后端消息库读取（message_read 在 hostInvoke 白名单内；S6 中断轮兜底） */
export async function fetchBackendMessages(conversationId: string): Promise<ArchiveMessage[]> {
  if (!conversationId) return [];
  try {
    const entries = await getHostInvoke()<Array<{ content?: ArchiveMessage }>>('message_read', {
      conversationId,
    });
    return (entries ?? [])
      .map((e) => e?.content)
      .filter((c): c is ArchiveMessage => !!c && typeof c === 'object' && 'type' in c);
  } catch {
    return [];
  }
}

/** 会话是否运行中（删除前的 best-effort 提示用；宿主编排内也会再查一次） */
export async function isSessionRunning(sessionId: string): Promise<boolean> {
  try {
    const res = await getHostInvoke()< { running?: boolean } >('is_chat_session_running', { sessionId });
    return !!res?.running;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 运行中会话（其他设备进行中条）
// ---------------------------------------------------------------------------

export interface RunningSession {
  conversationId: string;
  running?: boolean;
  startedAt?: string;
  startedByDevice?: string;
}

/** 冷启动 running 集合（cap.history list_running：registry ∪ session_state 投影） */
export async function listRunningSessions(): Promise<RunningSession[]> {
  const res = await capHistory<{ running?: RunningSession[] }>('list_running', {});
  return res?.running ?? [];
}

// ---------------------------------------------------------------------------
// 会话桥（restore / fork）
// ---------------------------------------------------------------------------

export async function restoreSession(
  item: UnifiedHistoryItem,
  fallbackProjectPath?: string,
): Promise<string | null> {
  return getSessionApi().restore(item.id, {
    engineId: item.engineId,
    projectPath: item.projectPath || fallbackProjectPath,
    claudeProjectName: item.claudeProjectName,
    title: item.title,
  });
}

export async function forkSessionViaBridge(
  item: UnifiedHistoryItem,
  branchName?: string,
): Promise<string | null> {
  return getSessionApi().fork(item.id, {
    engineId: item.engineId,
    projectPath: item.projectPath,
    claudeProjectName: item.claudeProjectName,
    branchName,
  });
}

// ---------------------------------------------------------------------------
// 插件配置（偏好：listPageSize / restorePageSize / recentCards）
// ---------------------------------------------------------------------------

export const PLUGIN_ID = 'history-desk';

export interface HistoryPrefs {
  listPageSize: number;
  restorePageSize: number;
  recentCards: number;
}

export const PREFS_LIMITS = {
  listPageSize: { min: 10, max: 100, default: 20 },
  restorePageSize: { min: 20, max: 500, default: 50 },
  recentCards: { min: 0, max: 10, default: 5 },
} as const;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

export function parsePrefs(raw: unknown): HistoryPrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    listPageSize: clamp(obj.listPageSize, PREFS_LIMITS.listPageSize.min, PREFS_LIMITS.listPageSize.max, PREFS_LIMITS.listPageSize.default),
    restorePageSize: clamp(obj.restorePageSize, PREFS_LIMITS.restorePageSize.min, PREFS_LIMITS.restorePageSize.max, PREFS_LIMITS.restorePageSize.default),
    recentCards: clamp(obj.recentCards, PREFS_LIMITS.recentCards.min, PREFS_LIMITS.recentCards.max, PREFS_LIMITS.recentCards.default),
  };
}

export async function readPrefs(): Promise<HistoryPrefs> {
  try {
    const raw = await getHostInvoke()<Record<string, unknown>>('plugin_get_config', { pluginId: PLUGIN_ID });
    return parsePrefs(raw);
  } catch {
    return parsePrefs({});
  }
}

export async function writePrefs(patch: Partial<HistoryPrefs>): Promise<HistoryPrefs> {
  const next = await getHostInvoke()<Record<string, unknown>>('plugin_set_config', {
    pluginId: PLUGIN_ID,
    patch,
  });
  return parsePrefs(next);
}
