/**
 * i18n.ts —— history-desk 自带双语（不依赖宿主 i18n 命名空间）
 *
 * 内置面板使用宿主 chat.json history.* 键；插件自包含后同键内置，
 * 中英双份，t(key) 缺 key 时回退中文默认（与内置 t(key, 默认中文) 观感一致）。
 */

type Dict = Record<string, string>;

const zh: Dict = {
  'history.title': '会话历史',
  'history.loading': '加载历史会话...',
  'history.refresh': '刷新（立即重扫引擎目录）',
  'history.today': '今天',
  'history.yesterday': '昨天',
  'history.thisWeek': '本周',
  'history.earlier': '更早',
  'history.justNow': '刚刚',
  'history.minutesAgo': '{{count}} 分钟前',
  'history.hoursAgo': '{{count}} 小时前',
  'history.messages': '{{count}} 条消息',
  'history.loadMore': '加载更多 (剩余 {{count}} 条)',
  'history.loadingMore': '加载中...',
  'history.restoreSession': '恢复会话',
  'history.continue': '继续',
  'history.continueWorking': '继续工作',
  'history.deleteSession': '删除会话',
  'history.noHistory': '暂无历史会话',
  'history.noSearchResults': '没有匹配的会话',
  'history.emptyWorkspace': '该工作区暂无历史会话',
  'history.currentProject': '当前项目',
  'history.all': '全部',
  'history.allEngines': '全部',
  'history.selectWorkspace': '选择工作区…',
  'history.listView': '列表视图',
  'history.treeView': '树形视图 (Fork/PR 关系)',
  'history.createBranch': '创建分支',
  'history.star': '星标',
  'history.unstar': '取消星标',
  'history.pin': '置顶到继续工作区',
  'history.unpin': '取消置顶',
  'history.archive': '归档',
  'history.unarchive': '取消归档',
  'history.starredOnly': '只看星标',
  'history.showArchived': '查看归档',
  'history.searchFullText': '搜索标题与对话内容…',
  'history.searchHint': '全文搜索：标题 + 对话内容',
  'history.unifiedHint': '全部来源已合并（自有存储 + 引擎原生），星标/置顶/归档随处生效',
  'history.nativeSource': '原生',
  'history.nativeSourceHint': '引擎原生记录',
  'history.noPreview': '（暂无摘要）',
  'history.restoreFailed': '恢复会话失败',
  'history.restoreFailedMessage': '无法加载会话消息，会话数据可能已过期',
  'history.deleteFailed': '删除会话失败',
  'history.deleteConfirmAction': '删除',
  'history.deleteCancelAction': '取消',
  'history.markFailed': '更新标注失败',
  'history.markFailedMessage': '会话可能尚未进入索引，请刷新后重试',
  'history.forkedFrom': 'Fork',
  'history.childSessions': '{{count}} 分支',
  'history.viewPr': '查看 PR',
  'history.remoteTitle': '其他设备进行中',
  'history.remoteHint': '始于 {{time}} · 点击只读查看',
  'history.remoteEnded': '已结束',
  'preview.openHint': '点击预览完整对话',
  'preview.close': '关闭',
  'preview.loading': '正在加载对话内容…',
  'preview.loadingEarlier': '正在加载更早的消息…',
  'preview.loadEarlier': '加载更早的消息',
  'preview.empty': '无法加载对话内容，数据可能已过期或为空',
  'preview.scrollToBottom': '滚动到底部',
  'preview.fork': '创建分支',
  'preview.continue': '继续该会话',
  'preview.readOnlyHint': '只读预览 · 无需恢复即可查看完整上下文',
  'fork.title': '创建会话分支',
  'fork.sourceSession': '源会话',
  'fork.messages': '{{count}} 条消息',
  'fork.gitBranch': 'Git 分支: {{branch}}',
  'fork.linkedPr': '关联 PR #{{number}}',
  'fork.inheritContext': '新分支将继承以下上下文：',
  'fork.historyMessages': '{{count}} 条历史消息',
  'fork.prLink': 'PR 关联: #{{number}}',
  'fork.branchName': '分支名称（可选）',
  'fork.branchNamePlaceholder': '例如: 尝试新方案',
  'fork.cancel': '取消',
  'fork.confirm': '确认创建分支',
  'fork.failed': '创建分支失败',
  'fork.failedMessage': '无法加载会话消息，会话数据可能已过期',
  'delete.confirmTitle': '删除会话',
  'delete.confirmMessage': '将永久删除会话「{{title}}」（共 {{count}} 条消息），本地记录与消息库记录将被清除且无法恢复。',
  'delete.lossMessages': '会话「{{title}}」的全部消息记录',
  'delete.lossStorage': '本地存档与后端消息库数据',
  'delete.runningHint': '该会话正在运行中，删除前将先中断。',
};

const en: Dict = {
  'history.title': 'Session History',
  'history.loading': 'Loading sessions...',
  'history.refresh': 'Refresh (rescan engine dirs now)',
  'history.today': 'Today',
  'history.yesterday': 'Yesterday',
  'history.thisWeek': 'This Week',
  'history.earlier': 'Earlier',
  'history.justNow': 'just now',
  'history.minutesAgo': '{{count}} min ago',
  'history.hoursAgo': '{{count}} h ago',
  'history.messages': '{{count}} messages',
  'history.loadMore': 'Load more ({{count}} left)',
  'history.loadingMore': 'Loading...',
  'history.restoreSession': 'Restore session',
  'history.continue': 'Continue',
  'history.continueWorking': 'Continue working',
  'history.deleteSession': 'Delete session',
  'history.noHistory': 'No sessions yet',
  'history.noSearchResults': 'No matching sessions',
  'history.emptyWorkspace': 'No sessions in this workspace',
  'history.currentProject': 'Current project',
  'history.all': 'All',
  'history.allEngines': 'All',
  'history.selectWorkspace': 'Select workspace…',
  'history.listView': 'List view',
  'history.treeView': 'Tree view (Fork/PR)',
  'history.createBranch': 'Create branch',
  'history.star': 'Star',
  'history.unstar': 'Unstar',
  'history.pin': 'Pin to Continue',
  'history.unpin': 'Unpin',
  'history.archive': 'Archive',
  'history.unarchive': 'Unarchive',
  'history.starredOnly': 'Starred only',
  'history.showArchived': 'Show archived',
  'history.searchFullText': 'Search titles and messages…',
  'history.searchHint': 'Full-text search: titles + messages',
  'history.unifiedHint': 'All sources merged (own storage + engine native); marks apply everywhere',
  'history.nativeSource': 'native',
  'history.nativeSourceHint': 'Engine native record',
  'history.noPreview': '(no preview)',
  'history.restoreFailed': 'Failed to restore session',
  'history.restoreFailedMessage': 'Cannot load session messages; data may be stale',
  'history.deleteFailed': 'Failed to delete session',
  'history.deleteConfirmAction': 'Delete',
  'history.deleteCancelAction': 'Cancel',
  'history.markFailed': 'Failed to update marks',
  'history.markFailedMessage': 'Session may not be indexed yet; refresh and retry',
  'history.forkedFrom': 'Fork',
  'history.childSessions': '{{count}} branches',
  'history.viewPr': 'View PR',
  'history.remoteTitle': 'Running on other devices',
  'history.remoteHint': 'started {{time}} · click to view read-only',
  'history.remoteEnded': 'ended',
  'preview.openHint': 'Click to preview full conversation',
  'preview.close': 'Close',
  'preview.loading': 'Loading conversation…',
  'preview.loadingEarlier': 'Loading earlier messages…',
  'preview.loadEarlier': 'Load earlier messages',
  'preview.empty': 'Cannot load conversation; data may be stale or empty',
  'preview.scrollToBottom': 'Scroll to bottom',
  'preview.fork': 'Create branch',
  'preview.continue': 'Continue session',
  'preview.readOnlyHint': 'Read-only preview · view full context without restoring',
  'fork.title': 'Create session branch',
  'fork.sourceSession': 'Source session',
  'fork.messages': '{{count}} messages',
  'fork.gitBranch': 'Git branch: {{branch}}',
  'fork.linkedPr': 'Linked PR #{{number}}',
  'fork.inheritContext': 'The new branch will inherit:',
  'fork.historyMessages': '{{count}} history messages',
  'fork.prLink': 'PR link: #{{number}}',
  'fork.branchName': 'Branch name (optional)',
  'fork.branchNamePlaceholder': 'e.g. try-new-approach',
  'fork.cancel': 'Cancel',
  'fork.confirm': 'Create branch',
  'fork.failed': 'Failed to create branch',
  'fork.failedMessage': 'Cannot load session messages; data may be stale',
  'delete.confirmTitle': 'Delete session',
  'delete.confirmMessage': 'Permanently delete "{{title}}" ({{count}} messages)? Local archive and message store will be cleared and cannot be recovered.',
  'delete.lossMessages': 'All messages of "{{title}}"',
  'delete.lossStorage': 'Local archive and backend message store',
  'delete.runningHint': 'This session is running; it will be interrupted before deletion.',
};

export type Lang = 'zh' | 'en';

let currentLang: Lang = 'zh';

export function setLang(lang: Lang): void {
  currentLang = lang === 'en' ? 'en' : 'zh';
}

export function getLang(): Lang {
  return currentLang;
}

/** 探测宿主语言（document.documentElement.lang 或 navigator），失败回退中文 */
export function detectLang(): Lang {
  try {
    const lang = document.documentElement.lang || navigator.language || 'zh';
    return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

export function initLang(): Lang {
  currentLang = detectLang();
  return currentLang;
}

/** t(key, defaultText?)：缺 key 时依次回退 默认文本 → key 本身 */
export function t(key: string, defaultText?: string, params?: Record<string, unknown>): string {
  const dict = currentLang === 'en' ? en : zh;
  let text = dict[key] ?? defaultText ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{{${k}}}`).join(String(v));
    }
  }
  return text;
}
