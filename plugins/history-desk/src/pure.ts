/**
 * pure.ts —— history-desk 纯逻辑核（零依赖；面板消费 + node --test 直测）
 *
 * 与 terminal-desk shared/td-core.js 同范式：日期分组、相对时间、snippet
 * 命中解析、继续工作卡挑选、树构建、删除来源推断提示等纯函数收敛在此，
 * 便于离线测试；禁止触碰 window / DOM / IPC。
 */

// ---------------------------------------------------------------------------
// 视图模型（与 host.ts UnifiedHistoryItem 结构兼容的最小面）
// ---------------------------------------------------------------------------

export interface PureHistoryItem {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
  engineId: string;
  source: string;
  fileSize?: number;
  projectPath?: string;
  snippet?: string;
  preview?: string;
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  parentSessionId?: string;
  childSessionIds?: string[];
  gitBranch?: string;
  linkedPr?: { number: number };
}

export type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export const DATE_GROUP_ORDER: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

/** 低价值会话阈值：消息数 ≤ 此值的近空会话删除时跳过确认（对齐内置 UX-4） */
export const LOW_VALUE_MESSAGE_COUNT = 2;

// ---------------------------------------------------------------------------
// 日期分组 / 相对时间
// ---------------------------------------------------------------------------

export function getDateGroup(timestamp: string, now: Date = new Date()): DateGroup {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'earlier';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);
  if (date >= startOfToday) return 'today';
  if (date >= startOfYesterday) return 'yesterday';
  if (date >= startOfWeek) return 'thisWeek';
  return 'earlier';
}

export function groupByDate(
  items: PureHistoryItem[],
  now: Date = new Date(),
): Record<DateGroup, PureHistoryItem[]> {
  const groups: Record<DateGroup, PureHistoryItem[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };
  for (const item of items) {
    groups[getDateGroup(item.timestamp, now)].push(item);
  }
  return groups;
}

/** 相对时间文案 key + 参数（i18n 由调用方拼装） */
export function relativeTimeParts(timestamp: string, now: Date = new Date()): { key: string; count: number; clock: string } {
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const clock = Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (diffMins < 1) return { key: 'history.justNow', count: 0, clock };
  if (diffMins < 60) return { key: 'history.minutesAgo', count: diffMins, clock };
  if (diffHours < 24) return { key: 'history.hoursAgo', count: diffHours, clock };
  return { key: '', count: 0, clock };
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// FTS snippet 解析（[hit] 包裹格式，与宿主 SnippetText 同规则）
// ---------------------------------------------------------------------------

export interface SnippetPart {
  hit: boolean;
  s: string;
}

export function parseSnippet(text: string): SnippetPart[] {
  const out: SnippetPart[] = [];
  let rest = text;
  for (let guard = 0; guard < 20 && rest.length > 0; guard++) {
    const open = rest.indexOf('[');
    const close = open >= 0 ? rest.indexOf(']', open + 1) : -1;
    if (open < 0 || close < 0) {
      out.push({ hit: false, s: rest });
      break;
    }
    if (open > 0) out.push({ hit: false, s: rest.slice(0, open) });
    out.push({ hit: true, s: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 继续工作卡挑选（置顶优先 + 最近 N；对齐内置 continueItems 语义）
// ---------------------------------------------------------------------------

export function pickContinueItems(
  items: PureHistoryItem[],
  recentCards: number,
  opts: { searching: boolean; starredOnly: boolean; showArchived: boolean },
): PureHistoryItem[] {
  if (opts.searching || opts.starredOnly || opts.showArchived || recentCards === 0) return [];
  const pinned = items.filter((h) => h.pinned);
  const recent = items.filter((h) => !h.pinned).slice(0, recentCards);
  return [...pinned, ...recent].slice(0, Math.max(recentCards, pinned.length + 1));
}

// ---------------------------------------------------------------------------
// Fork 统计
// ---------------------------------------------------------------------------

export function forkStats(items: PureHistoryItem[]): { forkCount: number; prCount: number } {
  let forkCount = 0;
  let prCount = 0;
  for (const item of items) {
    if (item.parentSessionId || (item.childSessionIds && item.childSessionIds.length > 0)) forkCount++;
    if (item.linkedPr) prCount++;
  }
  return { forkCount, prCount };
}

// ---------------------------------------------------------------------------
// 会话树（对齐内置 SessionTree.buildSessionTree）
// ---------------------------------------------------------------------------

export interface TreeNode {
  session: PureHistoryItem;
  children: TreeNode[];
  level: number;
}

export function buildTree(sessions: PureHistoryItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  for (const s of sessions) {
    nodeMap.set(s.id, { session: s, children: [], level: 0 });
  }
  const roots: TreeNode[] = [];
  for (const s of sessions) {
    const node = nodeMap.get(s.id);
    if (!node) continue;
    if (s.parentSessionId && nodeMap.has(s.parentSessionId)) {
      const parent = nodeMap.get(s.parentSessionId)!;
      parent.children.push(node);
      node.level = parent.level + 1;
    } else {
      roots.push(node);
    }
  }
  const sortByTime = (a: TreeNode, b: TreeNode) =>
    new Date(b.session.timestamp).getTime() - new Date(a.session.timestamp).getTime();
  const sortChildren = (node: TreeNode) => {
    node.children.sort(sortByTime);
    node.children.forEach(sortChildren);
  };
  roots.sort(sortByTime);
  roots.forEach(sortChildren);
  return roots;
}

/** 扁平化展开树（保持层级；对齐内置 flattenedNodes） */
export function flattenTree(tree: TreeNode[], expandedIds: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      result.push(node);
      if (expandedIds.has(node.session.id) && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return result;
}

// ---------------------------------------------------------------------------
// 删除确认门槛（UX-4）
// ---------------------------------------------------------------------------

export function needsDeleteConfirm(item: PureHistoryItem): boolean {
  return item.messageCount > LOW_VALUE_MESSAGE_COUNT;
}

// ---------------------------------------------------------------------------
// 引擎筛选
// ---------------------------------------------------------------------------

export function historyEnginesForFilter(filter: string, knownEngines: string[]): string[] {
  if (filter === 'all') return [];
  if (filter === 'claude-code') return ['claude-code'];
  if (filter === 'simple-ai') return ['simple-ai'];
  // 插件引擎：仅当元数据已知时下发（对齐内置 getHistoryEngines 语义）
  return knownEngines.includes(filter) ? [filter] : [];
}

// ---------------------------------------------------------------------------
// 生命周期事件信封解析（chat-event 透传后的 session_start/end）
// ---------------------------------------------------------------------------

export interface LifecycleEvent {
  type: 'session_start' | 'session_end';
  sessionId: string;
  engineId?: string;
  reason?: string;
}

/** chat-event 信封：{ payload: { payload: { type, sessionId, engineId?, reason? } } } */
export function parseLifecycleEnvelope(envelope: unknown): LifecycleEvent | null {
  const env = envelope as { payload?: { payload?: { type?: string; sessionId?: string; engineId?: string; reason?: string } } };
  const inner = env?.payload?.payload;
  if (!inner) return null;
  if (inner.type !== 'session_start' && inner.type !== 'session_end') return null;
  if (!inner.sessionId) return null;
  return {
    type: inner.type,
    sessionId: inner.sessionId,
    engineId: inner.engineId,
    reason: inner.reason,
  };
}

// ---------------------------------------------------------------------------
// 精简消息渲染模型（文本 / thinking / 工具调用摘要；PRD §3.3 v1 边界）
// ---------------------------------------------------------------------------

export interface RenderMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  toolCalls: Array<{ id: string; name: string; status: string; output?: string }>;
  streaming?: boolean;
}

/** 从宿主 archive_page / message_read 的消息对象提取精简渲染模型 */
export function toRenderMessage(raw: Record<string, unknown>, fallbackId: string): RenderMessage | null {
  const type = typeof raw.type === 'string' ? raw.type : '';
  if (type !== 'user' && type !== 'assistant') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;

  let text = '';
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text') {
      const c = (b as Record<string, unknown>).content;
      if (typeof c === 'string') text += c;
    }
  }
  if (!text && typeof raw.content === 'string') text = raw.content;

  let thinking: string | undefined;
  if (typeof raw.thinking === 'string' && raw.thinking.trim()) {
    thinking = raw.thinking;
  } else {
    for (const b of blocks) {
      if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'thinking') {
        const c = (b as Record<string, unknown>).content ?? (b as Record<string, unknown>).thinking;
        if (typeof c === 'string' && c.trim()) {
          thinking = c;
          break;
        }
      }
    }
  }

  const toolCalls: RenderMessage['toolCalls'] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const bt = (b as Record<string, unknown>).type;
    if (bt === 'tool_call' || bt === 'tool_use' || bt === 'toolcall') {
      const bb = b as Record<string, unknown>;
      toolCalls.push({
        id: typeof bb.id === 'string' ? bb.id : `${id}-tool-${toolCalls.length}`,
        name: typeof bb.name === 'string' ? bb.name : typeof bb.toolName === 'string' ? (bb.toolName as string) : 'tool',
        status: typeof bb.status === 'string' ? bb.status : 'done',
        output: typeof bb.output === 'string' ? bb.output : undefined,
      });
    }
  }

  return {
    id,
    role: type === 'user' ? 'user' : 'assistant',
    text,
    thinking,
    toolCalls,
    streaming: raw.isStreaming === true,
  };
}
