// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect4, useMemo as useMemo4, useRef as useRef2, useState as useState6 } from "react";

// src/host.ts
function globals() {
  return window;
}
function getHostInvoke() {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return fn;
}
function getHostListen() {
  const fn = globals().__POLARIS_HOST_LISTEN__;
  if (!fn) throw new Error("\u5BBF\u4E3B listen \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_LISTEN__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return fn;
}
function getSessionApi() {
  const api = globals().__POLARIS_SESSION_API__;
  if (!api) throw new Error("\u4F1A\u8BDD\u6865\u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_SESSION_API__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return api;
}
function getHostWorkspacePath() {
  return globals().__POLARIS_HOST_WORKSPACE__ ?? "";
}
var CAP_ID = "cap.history";
async function capHistory(action, payload = {}) {
  const res = await getHostInvoke()("router_dispatch", {
    req: { target: CAP_ID, payload: { action, ...payload } }
  });
  if (!res || res.ok !== true) {
    throw new Error(res && res.error || `cap.history ${action} \u8C03\u7528\u5931\u8D25`);
  }
  return res.result ?? {};
}
function rowToItem(row) {
  const source = row.source === "claude-native" ? "claude-code-native" : row.source === "plugin-native" ? "plugin-native" : "self";
  return {
    id: row.id,
    title: row.title || "\u672A\u547D\u540D\u4F1A\u8BDD",
    timestamp: row.updatedAt || row.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    messageCount: row.messageCount ?? 0,
    engineId: row.engineId || "claude-code",
    source,
    fileSize: row.fileSize ?? void 0,
    projectPath: row.workspacePath ?? void 0,
    snippet: row.snippet ?? row.firstUserText ?? void 0,
    preview: row.preview ?? void 0,
    starred: row.starred,
    pinned: row.pinned,
    archived: row.archived,
    color: row.color ?? void 0,
    userTags: row.userTags ?? [],
    note: row.note ?? void 0,
    gitBranch: row.gitBranch ?? void 0
  };
}
async function queryTimeline(params) {
  const result = await capHistory("query", { params });
  const pageSize = result.pageSize || params.pageSize || 20;
  const totalPages = Math.ceil((result.total || 0) / pageSize);
  return {
    items: (result.items ?? []).map(rowToItem),
    total: result.total ?? 0,
    page: result.page ?? params.page ?? 1,
    pageSize,
    totalPages,
    hasMore: (result.page ?? 1) < totalPages
  };
}
async function searchHistory(query, workspacePath, strictWorkspace, limit = 50) {
  const q = query.trim();
  if (!q) return [];
  const rows = await capHistory("search", {
    query: q,
    workspacePath: workspacePath ?? null,
    strictWorkspace: strictWorkspace || void 0,
    limit
  });
  return (rows ?? []).map(rowToItem);
}
async function markHistory(id, marks) {
  await capHistory("mark", { id, marks });
}
async function deleteHistorySession(sessionId, source, engineId) {
  await capHistory("delete_session", {
    sessionId,
    source: source ?? void 0,
    engineId: engineId ?? void 0
  });
}
async function fetchArchivePage(sessionId, beforeSeq, limit) {
  return capHistory("archive_page", {
    sessionId,
    beforeSeq: beforeSeq ?? void 0,
    limit
  });
}
async function fetchBackendMessages(conversationId) {
  if (!conversationId) return [];
  try {
    const entries = await getHostInvoke()("message_read", {
      conversationId
    });
    return (entries ?? []).map((e) => e?.content).filter((c) => !!c && typeof c === "object" && "type" in c);
  } catch {
    return [];
  }
}
async function isSessionRunning(sessionId) {
  try {
    const res = await getHostInvoke()("is_chat_session_running", { sessionId });
    return !!res?.running;
  } catch {
    return false;
  }
}
async function listRunningSessions() {
  const res = await capHistory("list_running", {});
  return res?.running ?? [];
}
async function restoreSession(item, fallbackProjectPath) {
  return getSessionApi().restore(item.id, {
    engineId: item.engineId,
    projectPath: item.projectPath || fallbackProjectPath,
    claudeProjectName: item.claudeProjectName,
    title: item.title
  });
}
async function forkSessionViaBridge(item, branchName) {
  return getSessionApi().fork(item.id, {
    engineId: item.engineId,
    projectPath: item.projectPath,
    claudeProjectName: item.claudeProjectName,
    branchName
  });
}
var PLUGIN_ID = "history-desk";
var PREFS_LIMITS = {
  listPageSize: { min: 10, max: 100, default: 20 },
  restorePageSize: { min: 20, max: 500, default: 50 },
  recentCards: { min: 0, max: 10, default: 5 }
};
function clamp(n, min, max, fallback) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
}
function parsePrefs(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    listPageSize: clamp(obj.listPageSize, PREFS_LIMITS.listPageSize.min, PREFS_LIMITS.listPageSize.max, PREFS_LIMITS.listPageSize.default),
    restorePageSize: clamp(obj.restorePageSize, PREFS_LIMITS.restorePageSize.min, PREFS_LIMITS.restorePageSize.max, PREFS_LIMITS.restorePageSize.default),
    recentCards: clamp(obj.recentCards, PREFS_LIMITS.recentCards.min, PREFS_LIMITS.recentCards.max, PREFS_LIMITS.recentCards.default)
  };
}
async function readPrefs() {
  try {
    const raw = await getHostInvoke()("plugin_get_config", { pluginId: PLUGIN_ID });
    return parsePrefs(raw);
  } catch {
    return parsePrefs({});
  }
}
async function writePrefs(patch) {
  const next = await getHostInvoke()("plugin_set_config", {
    pluginId: PLUGIN_ID,
    patch
  });
  return parsePrefs(next);
}

// src/i18n.ts
var zh = {
  "history.title": "\u4F1A\u8BDD\u5386\u53F2",
  "history.loading": "\u52A0\u8F7D\u5386\u53F2\u4F1A\u8BDD...",
  "history.refresh": "\u5237\u65B0\uFF08\u7ACB\u5373\u91CD\u626B\u5F15\u64CE\u76EE\u5F55\uFF09",
  "history.today": "\u4ECA\u5929",
  "history.yesterday": "\u6628\u5929",
  "history.thisWeek": "\u672C\u5468",
  "history.earlier": "\u66F4\u65E9",
  "history.justNow": "\u521A\u521A",
  "history.minutesAgo": "{{count}} \u5206\u949F\u524D",
  "history.hoursAgo": "{{count}} \u5C0F\u65F6\u524D",
  "history.messages": "{{count}} \u6761\u6D88\u606F",
  "history.loadMore": "\u52A0\u8F7D\u66F4\u591A (\u5269\u4F59 {{count}} \u6761)",
  "history.loadingMore": "\u52A0\u8F7D\u4E2D...",
  "history.restoreSession": "\u6062\u590D\u4F1A\u8BDD",
  "history.continue": "\u7EE7\u7EED",
  "history.continueWorking": "\u7EE7\u7EED\u5DE5\u4F5C",
  "history.deleteSession": "\u5220\u9664\u4F1A\u8BDD",
  "history.noHistory": "\u6682\u65E0\u5386\u53F2\u4F1A\u8BDD",
  "history.noSearchResults": "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD",
  "history.emptyWorkspace": "\u8BE5\u5DE5\u4F5C\u533A\u6682\u65E0\u5386\u53F2\u4F1A\u8BDD",
  "history.currentProject": "\u5F53\u524D\u9879\u76EE",
  "history.all": "\u5168\u90E8",
  "history.allEngines": "\u5168\u90E8",
  "history.selectWorkspace": "\u9009\u62E9\u5DE5\u4F5C\u533A\u2026",
  "history.listView": "\u5217\u8868\u89C6\u56FE",
  "history.treeView": "\u6811\u5F62\u89C6\u56FE (Fork/PR \u5173\u7CFB)",
  "history.createBranch": "\u521B\u5EFA\u5206\u652F",
  "history.star": "\u661F\u6807",
  "history.unstar": "\u53D6\u6D88\u661F\u6807",
  "history.pin": "\u7F6E\u9876\u5230\u7EE7\u7EED\u5DE5\u4F5C\u533A",
  "history.unpin": "\u53D6\u6D88\u7F6E\u9876",
  "history.archive": "\u5F52\u6863",
  "history.unarchive": "\u53D6\u6D88\u5F52\u6863",
  "history.starredOnly": "\u53EA\u770B\u661F\u6807",
  "history.showArchived": "\u67E5\u770B\u5F52\u6863",
  "history.searchFullText": "\u641C\u7D22\u6807\u9898\u4E0E\u5BF9\u8BDD\u5185\u5BB9\u2026",
  "history.searchHint": "\u5168\u6587\u641C\u7D22\uFF1A\u6807\u9898 + \u5BF9\u8BDD\u5185\u5BB9",
  "history.unifiedHint": "\u5168\u90E8\u6765\u6E90\u5DF2\u5408\u5E76\uFF08\u81EA\u6709\u5B58\u50A8 + \u5F15\u64CE\u539F\u751F\uFF09\uFF0C\u661F\u6807/\u7F6E\u9876/\u5F52\u6863\u968F\u5904\u751F\u6548",
  "history.nativeSource": "\u539F\u751F",
  "history.nativeSourceHint": "\u5F15\u64CE\u539F\u751F\u8BB0\u5F55",
  "history.noPreview": "\uFF08\u6682\u65E0\u6458\u8981\uFF09",
  "history.restoreFailed": "\u6062\u590D\u4F1A\u8BDD\u5931\u8D25",
  "history.restoreFailedMessage": "\u65E0\u6CD5\u52A0\u8F7D\u4F1A\u8BDD\u6D88\u606F\uFF0C\u4F1A\u8BDD\u6570\u636E\u53EF\u80FD\u5DF2\u8FC7\u671F",
  "history.deleteFailed": "\u5220\u9664\u4F1A\u8BDD\u5931\u8D25",
  "history.deleteConfirmAction": "\u5220\u9664",
  "history.deleteCancelAction": "\u53D6\u6D88",
  "history.markFailed": "\u66F4\u65B0\u6807\u6CE8\u5931\u8D25",
  "history.markFailedMessage": "\u4F1A\u8BDD\u53EF\u80FD\u5C1A\u672A\u8FDB\u5165\u7D22\u5F15\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5",
  "history.forkedFrom": "Fork",
  "history.childSessions": "{{count}} \u5206\u652F",
  "history.viewPr": "\u67E5\u770B PR",
  "history.remoteTitle": "\u5176\u4ED6\u8BBE\u5907\u8FDB\u884C\u4E2D",
  "history.remoteHint": "\u59CB\u4E8E {{time}} \xB7 \u70B9\u51FB\u53EA\u8BFB\u67E5\u770B",
  "history.remoteEnded": "\u5DF2\u7ED3\u675F",
  "preview.openHint": "\u70B9\u51FB\u9884\u89C8\u5B8C\u6574\u5BF9\u8BDD",
  "preview.close": "\u5173\u95ED",
  "preview.loading": "\u6B63\u5728\u52A0\u8F7D\u5BF9\u8BDD\u5185\u5BB9\u2026",
  "preview.loadingEarlier": "\u6B63\u5728\u52A0\u8F7D\u66F4\u65E9\u7684\u6D88\u606F\u2026",
  "preview.loadEarlier": "\u52A0\u8F7D\u66F4\u65E9\u7684\u6D88\u606F",
  "preview.empty": "\u65E0\u6CD5\u52A0\u8F7D\u5BF9\u8BDD\u5185\u5BB9\uFF0C\u6570\u636E\u53EF\u80FD\u5DF2\u8FC7\u671F\u6216\u4E3A\u7A7A",
  "preview.scrollToBottom": "\u6EDA\u52A8\u5230\u5E95\u90E8",
  "preview.fork": "\u521B\u5EFA\u5206\u652F",
  "preview.continue": "\u7EE7\u7EED\u8BE5\u4F1A\u8BDD",
  "preview.readOnlyHint": "\u53EA\u8BFB\u9884\u89C8 \xB7 \u65E0\u9700\u6062\u590D\u5373\u53EF\u67E5\u770B\u5B8C\u6574\u4E0A\u4E0B\u6587",
  "fork.title": "\u521B\u5EFA\u4F1A\u8BDD\u5206\u652F",
  "fork.sourceSession": "\u6E90\u4F1A\u8BDD",
  "fork.messages": "{{count}} \u6761\u6D88\u606F",
  "fork.gitBranch": "Git \u5206\u652F: {{branch}}",
  "fork.linkedPr": "\u5173\u8054 PR #{{number}}",
  "fork.inheritContext": "\u65B0\u5206\u652F\u5C06\u7EE7\u627F\u4EE5\u4E0B\u4E0A\u4E0B\u6587\uFF1A",
  "fork.historyMessages": "{{count}} \u6761\u5386\u53F2\u6D88\u606F",
  "fork.prLink": "PR \u5173\u8054: #{{number}}",
  "fork.branchName": "\u5206\u652F\u540D\u79F0\uFF08\u53EF\u9009\uFF09",
  "fork.branchNamePlaceholder": "\u4F8B\u5982: \u5C1D\u8BD5\u65B0\u65B9\u6848",
  "fork.cancel": "\u53D6\u6D88",
  "fork.confirm": "\u786E\u8BA4\u521B\u5EFA\u5206\u652F",
  "fork.failed": "\u521B\u5EFA\u5206\u652F\u5931\u8D25",
  "fork.failedMessage": "\u65E0\u6CD5\u52A0\u8F7D\u4F1A\u8BDD\u6D88\u606F\uFF0C\u4F1A\u8BDD\u6570\u636E\u53EF\u80FD\u5DF2\u8FC7\u671F",
  "delete.confirmTitle": "\u5220\u9664\u4F1A\u8BDD",
  "delete.confirmMessage": "\u5C06\u6C38\u4E45\u5220\u9664\u4F1A\u8BDD\u300C{{title}}\u300D\uFF08\u5171 {{count}} \u6761\u6D88\u606F\uFF09\uFF0C\u672C\u5730\u8BB0\u5F55\u4E0E\u6D88\u606F\u5E93\u8BB0\u5F55\u5C06\u88AB\u6E05\u9664\u4E14\u65E0\u6CD5\u6062\u590D\u3002",
  "delete.lossMessages": "\u4F1A\u8BDD\u300C{{title}}\u300D\u7684\u5168\u90E8\u6D88\u606F\u8BB0\u5F55",
  "delete.lossStorage": "\u672C\u5730\u5B58\u6863\u4E0E\u540E\u7AEF\u6D88\u606F\u5E93\u6570\u636E",
  "delete.runningHint": "\u8BE5\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\u4E2D\uFF0C\u5220\u9664\u524D\u5C06\u5148\u4E2D\u65AD\u3002"
};
var en = {
  "history.title": "Session History",
  "history.loading": "Loading sessions...",
  "history.refresh": "Refresh (rescan engine dirs now)",
  "history.today": "Today",
  "history.yesterday": "Yesterday",
  "history.thisWeek": "This Week",
  "history.earlier": "Earlier",
  "history.justNow": "just now",
  "history.minutesAgo": "{{count}} min ago",
  "history.hoursAgo": "{{count}} h ago",
  "history.messages": "{{count}} messages",
  "history.loadMore": "Load more ({{count}} left)",
  "history.loadingMore": "Loading...",
  "history.restoreSession": "Restore session",
  "history.continue": "Continue",
  "history.continueWorking": "Continue working",
  "history.deleteSession": "Delete session",
  "history.noHistory": "No sessions yet",
  "history.noSearchResults": "No matching sessions",
  "history.emptyWorkspace": "No sessions in this workspace",
  "history.currentProject": "Current project",
  "history.all": "All",
  "history.allEngines": "All",
  "history.selectWorkspace": "Select workspace\u2026",
  "history.listView": "List view",
  "history.treeView": "Tree view (Fork/PR)",
  "history.createBranch": "Create branch",
  "history.star": "Star",
  "history.unstar": "Unstar",
  "history.pin": "Pin to Continue",
  "history.unpin": "Unpin",
  "history.archive": "Archive",
  "history.unarchive": "Unarchive",
  "history.starredOnly": "Starred only",
  "history.showArchived": "Show archived",
  "history.searchFullText": "Search titles and messages\u2026",
  "history.searchHint": "Full-text search: titles + messages",
  "history.unifiedHint": "All sources merged (own storage + engine native); marks apply everywhere",
  "history.nativeSource": "native",
  "history.nativeSourceHint": "Engine native record",
  "history.noPreview": "(no preview)",
  "history.restoreFailed": "Failed to restore session",
  "history.restoreFailedMessage": "Cannot load session messages; data may be stale",
  "history.deleteFailed": "Failed to delete session",
  "history.deleteConfirmAction": "Delete",
  "history.deleteCancelAction": "Cancel",
  "history.markFailed": "Failed to update marks",
  "history.markFailedMessage": "Session may not be indexed yet; refresh and retry",
  "history.forkedFrom": "Fork",
  "history.childSessions": "{{count}} branches",
  "history.viewPr": "View PR",
  "history.remoteTitle": "Running on other devices",
  "history.remoteHint": "started {{time}} \xB7 click to view read-only",
  "history.remoteEnded": "ended",
  "preview.openHint": "Click to preview full conversation",
  "preview.close": "Close",
  "preview.loading": "Loading conversation\u2026",
  "preview.loadingEarlier": "Loading earlier messages\u2026",
  "preview.loadEarlier": "Load earlier messages",
  "preview.empty": "Cannot load conversation; data may be stale or empty",
  "preview.scrollToBottom": "Scroll to bottom",
  "preview.fork": "Create branch",
  "preview.continue": "Continue session",
  "preview.readOnlyHint": "Read-only preview \xB7 view full context without restoring",
  "fork.title": "Create session branch",
  "fork.sourceSession": "Source session",
  "fork.messages": "{{count}} messages",
  "fork.gitBranch": "Git branch: {{branch}}",
  "fork.linkedPr": "Linked PR #{{number}}",
  "fork.inheritContext": "The new branch will inherit:",
  "fork.historyMessages": "{{count}} history messages",
  "fork.prLink": "PR link: #{{number}}",
  "fork.branchName": "Branch name (optional)",
  "fork.branchNamePlaceholder": "e.g. try-new-approach",
  "fork.cancel": "Cancel",
  "fork.confirm": "Create branch",
  "fork.failed": "Failed to create branch",
  "fork.failedMessage": "Cannot load session messages; data may be stale",
  "delete.confirmTitle": "Delete session",
  "delete.confirmMessage": 'Permanently delete "{{title}}" ({{count}} messages)? Local archive and message store will be cleared and cannot be recovered.',
  "delete.lossMessages": 'All messages of "{{title}}"',
  "delete.lossStorage": "Local archive and backend message store",
  "delete.runningHint": "This session is running; it will be interrupted before deletion."
};
var currentLang = "zh";
function detectLang() {
  try {
    const lang = document.documentElement.lang || navigator.language || "zh";
    return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "zh";
  }
}
function initLang() {
  currentLang = detectLang();
  return currentLang;
}
function t(key, defaultText, params) {
  const dict = currentLang === "en" ? en : zh;
  let text = dict[key] ?? defaultText ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{{${k}}}`).join(String(v));
    }
  }
  return text;
}

// src/icons.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PATHS = {
  clock: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ jsx("polyline", { points: "12 7 12 12 15.5 13.5" })
  ] }),
  message: /* @__PURE__ */ jsx("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" }),
  trash: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("polyline", { points: "3 6 5 6 21 6" }),
    /* @__PURE__ */ jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
    /* @__PURE__ */ jsx("line", { x1: "10", y1: "11", x2: "10", y2: "17" }),
    /* @__PURE__ */ jsx("line", { x1: "14", y1: "11", x2: "14", y2: "17" })
  ] }),
  restore: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("polyline", { points: "1 4 1 10 7 10" }),
    /* @__PURE__ */ jsx("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" })
  ] }),
  x: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    /* @__PURE__ */ jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  ] }),
  "chevron-down": /* @__PURE__ */ jsx("polyline", { points: "6 9 12 15 18 9" }),
  "chevron-right": /* @__PURE__ */ jsx("polyline", { points: "9 18 15 12 9 6" }),
  globe: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "12", x2: "21", y2: "12" }),
    /* @__PURE__ */ jsx("path", { d: "M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" })
  ] }),
  folder: /* @__PURE__ */ jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }),
  list: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "8", y1: "6", x2: "21", y2: "6" }),
    /* @__PURE__ */ jsx("line", { x1: "8", y1: "12", x2: "21", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "8", y1: "18", x2: "21", y2: "18" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" })
  ] }),
  "git-branch": /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "6", y1: "3", x2: "6", y2: "15" }),
    /* @__PURE__ */ jsx("circle", { cx: "18", cy: "6", r: "3" }),
    /* @__PURE__ */ jsx("circle", { cx: "6", cy: "18", r: "3" }),
    /* @__PURE__ */ jsx("path", { d: "M18 9a9 9 0 0 1-9 9" })
  ] }),
  star: /* @__PURE__ */ jsx("polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }),
  pin: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "17", x2: "12", y2: "22" }),
    /* @__PURE__ */ jsx("path", { d: "M5 17h14l-1.5-5.5L19 7H5l1.5 4.5z", transform: "rotate(45 12 12)" })
  ] }),
  archive: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("polyline", { points: "21 8 21 21 3 21 3 8" }),
    /* @__PURE__ */ jsx("rect", { x: "1", y: "3", width: "22", height: "5" }),
    /* @__PURE__ */ jsx("line", { x1: "10", y1: "12", x2: "14", y2: "12" })
  ] }),
  unarchive: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("polyline", { points: "21 8 21 21 3 21 3 8" }),
    /* @__PURE__ */ jsx("rect", { x: "1", y: "3", width: "22", height: "5" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "11", x2: "12", y2: "17" }),
    /* @__PURE__ */ jsx("polyline", { points: "9 14 12 11 15 14" })
  ] }),
  play: /* @__PURE__ */ jsx("polygon", { points: "6 3 20 12 6 21 6 3" }),
  refresh: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("polyline", { points: "23 4 23 10 17 10" }),
    /* @__PURE__ */ jsx("polyline", { points: "1 20 1 14 7 14" }),
    /* @__PURE__ */ jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })
  ] }),
  check: /* @__PURE__ */ jsx("polyline", { points: "20 6 9 17 4 12" }),
  loader: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "2", x2: "12", y2: "6" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "18", x2: "12", y2: "22" }),
    /* @__PURE__ */ jsx("line", { x1: "4.93", y1: "4.93", x2: "7.76", y2: "7.76" }),
    /* @__PURE__ */ jsx("line", { x1: "16.24", y1: "16.24", x2: "19.07", y2: "19.07" }),
    /* @__PURE__ */ jsx("line", { x1: "2", y1: "12", x2: "6", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "18", y1: "12", x2: "22", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "4.93", y1: "19.07", x2: "7.76", y2: "16.24" }),
    /* @__PURE__ */ jsx("line", { x1: "16.24", y1: "7.76", x2: "19.07", y2: "4.93" })
  ] }),
  database: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }),
    /* @__PURE__ */ jsx("path", { d: "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" }),
    /* @__PURE__ */ jsx("path", { d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" })
  ] }),
  radio: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "2" }),
    /* @__PURE__ */ jsx("path", { d: "M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" })
  ] }),
  warning: /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "9", x2: "12", y2: "13" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })
  ] }),
  "arrow-down": /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    /* @__PURE__ */ jsx("polyline", { points: "19 12 12 19 5 12" })
  ] })
};
function Icon({ name, size = 16, filled = false }) {
  return /* @__PURE__ */ jsx(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: PATHS[name]
    }
  );
}

// src/HistoryList.tsx
import { Fragment as Fragment2 } from "react";

// src/pure.ts
var DATE_GROUP_ORDER = ["today", "yesterday", "thisWeek", "earlier"];
var LOW_VALUE_MESSAGE_COUNT = 2;
function getDateGroup(timestamp, now = /* @__PURE__ */ new Date()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "earlier";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 864e5);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 864e5);
  if (date >= startOfToday) return "today";
  if (date >= startOfYesterday) return "yesterday";
  if (date >= startOfWeek) return "thisWeek";
  return "earlier";
}
function groupByDate(items, now = /* @__PURE__ */ new Date()) {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: []
  };
  for (const item of items) {
    groups[getDateGroup(item.timestamp, now)].push(item);
  }
  return groups;
}
function relativeTimeParts(timestamp, now = /* @__PURE__ */ new Date()) {
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMs / 36e5);
  const clock = Number.isNaN(date.getTime()) ? "" : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (diffMins < 1) return { key: "history.justNow", count: 0, clock };
  if (diffMins < 60) return { key: "history.minutesAgo", count: diffMins, clock };
  if (diffHours < 24) return { key: "history.hoursAgo", count: diffHours, clock };
  return { key: "", count: 0, clock };
}
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
function parseSnippet(text) {
  const out = [];
  let rest = text;
  for (let guard = 0; guard < 20 && rest.length > 0; guard++) {
    const open = rest.indexOf("[");
    const close = open >= 0 ? rest.indexOf("]", open + 1) : -1;
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
function forkStats(items) {
  let forkCount = 0;
  let prCount = 0;
  for (const item of items) {
    if (item.parentSessionId || item.childSessionIds && item.childSessionIds.length > 0) forkCount++;
    if (item.linkedPr) prCount++;
  }
  return { forkCount, prCount };
}
function buildTree(sessions) {
  const nodeMap = /* @__PURE__ */ new Map();
  for (const s of sessions) {
    nodeMap.set(s.id, { session: s, children: [], level: 0 });
  }
  const roots = [];
  for (const s of sessions) {
    const node = nodeMap.get(s.id);
    if (!node) continue;
    if (s.parentSessionId && nodeMap.has(s.parentSessionId)) {
      const parent = nodeMap.get(s.parentSessionId);
      parent.children.push(node);
      node.level = parent.level + 1;
    } else {
      roots.push(node);
    }
  }
  const sortByTime = (a, b) => new Date(b.session.timestamp).getTime() - new Date(a.session.timestamp).getTime();
  const sortChildren = (node) => {
    node.children.sort(sortByTime);
    node.children.forEach(sortChildren);
  };
  roots.sort(sortByTime);
  roots.forEach(sortChildren);
  return roots;
}
function flattenTree(tree, expandedIds) {
  const result = [];
  const walk = (nodes) => {
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
function needsDeleteConfirm(item) {
  return item.messageCount > LOW_VALUE_MESSAGE_COUNT;
}
function historyEnginesForFilter(filter, knownEngines) {
  if (filter === "all") return [];
  if (filter === "claude-code") return ["claude-code"];
  if (filter === "simple-ai") return ["simple-ai"];
  return knownEngines.includes(filter) ? [filter] : [];
}
function toRenderMessage(raw, fallbackId) {
  const type = typeof raw.type === "string" ? raw.type : "";
  if (type !== "user" && type !== "assistant") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : fallbackId;
  let text = "";
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  for (const b of blocks) {
    if (b && typeof b === "object" && b.type === "text") {
      const c = b.content;
      if (typeof c === "string") text += c;
    }
  }
  if (!text && typeof raw.content === "string") text = raw.content;
  let thinking;
  if (typeof raw.thinking === "string" && raw.thinking.trim()) {
    thinking = raw.thinking;
  } else {
    for (const b of blocks) {
      if (b && typeof b === "object" && b.type === "thinking") {
        const c = b.content ?? b.thinking;
        if (typeof c === "string" && c.trim()) {
          thinking = c;
          break;
        }
      }
    }
  }
  const toolCalls = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const bt = b.type;
    if (bt === "tool_call" || bt === "tool_use" || bt === "toolcall") {
      const bb = b;
      toolCalls.push({
        id: typeof bb.id === "string" ? bb.id : `${id}-tool-${toolCalls.length}`,
        name: typeof bb.name === "string" ? bb.name : typeof bb.toolName === "string" ? bb.toolName : "tool",
        status: typeof bb.status === "string" ? bb.status : "done",
        output: typeof bb.output === "string" ? bb.output : void 0
      });
    }
  }
  return {
    id,
    role: type === "user" ? "user" : "assistant",
    text,
    thinking,
    toolCalls,
    streaming: raw.isStreaming === true
  };
}

// src/HistoryList.tsx
import { Fragment as Fragment3, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var GROUP_LABEL_KEY = {
  today: "history.today",
  yesterday: "history.yesterday",
  thisWeek: "history.thisWeek",
  earlier: "history.earlier"
};
function SnippetText({ text }) {
  const parts = parseSnippet(text);
  return /* @__PURE__ */ jsx2(Fragment3, { children: parts.map(
    (p, i) => p.hit ? /* @__PURE__ */ jsx2("span", { className: "hd-hitmark", children: p.s }, i) : /* @__PURE__ */ jsx2(Fragment2, { children: p.s }, i)
  ) });
}
function RowMeta({ item, searching }) {
  const rt = relativeTimeParts(item.timestamp);
  return /* @__PURE__ */ jsxs2("div", { className: "hd-row-meta", children: [
    /* @__PURE__ */ jsxs2("span", { className: "hd-meta-item", children: [
      /* @__PURE__ */ jsx2(Icon, { name: "message", size: 11 }),
      t("history.messages", void 0, { count: item.messageCount })
    ] }),
    /* @__PURE__ */ jsxs2("span", { className: "hd-meta-item", children: [
      /* @__PURE__ */ jsx2(Icon, { name: "clock", size: 11 }),
      rt.key ? t(rt.key, void 0, { count: rt.count }) : rt.clock
    ] }),
    item.fileSize ? /* @__PURE__ */ jsx2("span", { children: formatFileSize(item.fileSize) }) : null
  ] });
}
function HistoryList(props) {
  const {
    items,
    searching,
    restoringId,
    showWorkspaceColumn,
    onToggleStar,
    onTogglePin,
    onToggleArchive,
    onPreview,
    onRestore,
    onFork,
    onDelete
  } = props;
  const grouped = groupByDate(items);
  return /* @__PURE__ */ jsx2(Fragment3, { children: DATE_GROUP_ORDER.map((group) => {
    const groupItems = grouped[group];
    if (groupItems.length === 0) return null;
    return /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 6 }, children: [
      /* @__PURE__ */ jsxs2("div", { className: "hd-group-head", children: [
        t(GROUP_LABEL_KEY[group]),
        /* @__PURE__ */ jsxs2("span", { className: "hd-group-count", children: [
          "(",
          groupItems.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsx2("ul", { style: { margin: 0, padding: 0, listStyle: "none" }, children: groupItems.map((item) => {
        const isRestoring = restoringId === item.id;
        const canDelete = item.source === "self";
        const snippet = searching && item.snippet ? item.snippet : item.preview || item.snippet;
        return /* @__PURE__ */ jsxs2("li", { className: "hd-row", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              className: `hd-star ${item.starred ? "hd-star-on" : ""}`,
              onClick: () => onToggleStar(item),
              title: item.starred ? t("history.unstar") : t("history.star"),
              children: /* @__PURE__ */ jsx2(Icon, { name: "star", size: 15, filled: !!item.starred })
            }
          ),
          /* @__PURE__ */ jsxs2("div", { className: "hd-row-main", onClick: () => onPreview(item), title: t("preview.openHint"), children: [
            /* @__PURE__ */ jsxs2("div", { className: "hd-row-titleline", children: [
              item.pinned && /* @__PURE__ */ jsx2(Icon, { name: "pin", size: 12, filled: true }),
              /* @__PURE__ */ jsx2("h3", { className: "hd-row-title", children: item.title }),
              /* @__PURE__ */ jsx2("span", { className: "hd-badge hd-badge-engine", children: item.engineId }),
              item.source !== "self" && /* @__PURE__ */ jsx2("span", { className: "hd-badge hd-badge-native", title: t("history.nativeSourceHint"), children: t("history.nativeSource") })
            ] }),
            snippet && /* @__PURE__ */ jsx2("p", { className: "hd-row-snippet", children: searching && item.snippet ? /* @__PURE__ */ jsx2(SnippetText, { text: item.snippet }) : snippet }),
            /* @__PURE__ */ jsx2(RowMeta, { item, searching }),
            showWorkspaceColumn && item.projectPath && /* @__PURE__ */ jsx2("div", { className: "hd-row-meta", style: { marginTop: 2 }, children: /* @__PURE__ */ jsxs2("span", { className: "hd-meta-item", title: item.projectPath, children: [
              /* @__PURE__ */ jsx2(Icon, { name: "folder", size: 11 }),
              /* @__PURE__ */ jsx2("span", { className: "hd-meta-ws", children: item.projectPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() })
            ] }) }),
            (item.parentSessionId || (item.childSessionIds?.length ?? 0) > 0 || item.gitBranch || item.linkedPr) && /* @__PURE__ */ jsxs2("div", { className: "hd-row-meta", style: { marginTop: 3 }, children: [
              item.linkedPr && /* @__PURE__ */ jsxs2("span", { className: "hd-badge hd-badge-pr", children: [
                "PR #",
                item.linkedPr.number
              ] }),
              item.gitBranch && /* @__PURE__ */ jsxs2("span", { className: "hd-badge hd-badge-fork", children: [
                /* @__PURE__ */ jsx2(Icon, { name: "git-branch", size: 9 }),
                " ",
                item.gitBranch
              ] }),
              item.parentSessionId && /* @__PURE__ */ jsxs2("span", { className: "hd-badge hd-badge-fork", children: [
                /* @__PURE__ */ jsx2(Icon, { name: "git-branch", size: 9 }),
                " ",
                t("history.forkedFrom")
              ] }),
              (item.childSessionIds?.length ?? 0) > 0 && /* @__PURE__ */ jsxs2("span", { className: "hd-badge hd-badge-fork", children: [
                /* @__PURE__ */ jsx2(Icon, { name: "git-branch", size: 9 }),
                " ",
                t("history.childSessions", void 0, { count: item.childSessionIds.length })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "hd-row-actions", children: [
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: `hd-iconbtn ${item.pinned ? "hd-pin-on" : ""}`,
                onClick: () => onTogglePin(item),
                title: item.pinned ? t("history.unpin") : t("history.pin"),
                children: /* @__PURE__ */ jsx2(Icon, { name: "pin", size: 15, filled: !!item.pinned })
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: "hd-iconbtn",
                onClick: () => onFork(item),
                title: t("history.createBranch"),
                children: /* @__PURE__ */ jsx2(Icon, { name: "git-branch", size: 15 })
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: "hd-iconbtn",
                onClick: () => onToggleArchive(item),
                title: item.archived ? t("history.unarchive") : t("history.archive"),
                children: /* @__PURE__ */ jsx2(Icon, { name: item.archived ? "unarchive" : "archive", size: 15 })
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: "hd-iconbtn",
                onClick: () => onRestore(item),
                disabled: isRestoring,
                title: t("history.restoreSession"),
                children: /* @__PURE__ */ jsx2(Icon, { name: isRestoring ? "loader" : "restore", size: 15 })
              }
            ),
            canDelete && /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                className: "hd-iconbtn",
                style: { color: "rgb(var(--c-status-danger))" },
                onClick: () => onDelete(item),
                title: t("history.deleteSession"),
                children: /* @__PURE__ */ jsx2(Icon, { name: "trash", size: 15 })
              }
            )
          ] })
        ] }, item.id);
      }) })
    ] }, group);
  }) });
}

// src/PreviewModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";

// src/messageRender.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function MessageView({ raw, index }) {
  const msg = toRenderMessage(raw, `msg-${index}`);
  if (!msg) return null;
  return /* @__PURE__ */ jsx3(RenderMessageView, { msg });
}
function RenderMessageView({ msg }) {
  const isUser = msg.role === "user";
  return /* @__PURE__ */ jsxs3("div", { className: `hd-msg ${isUser ? "hd-msg-user" : ""}`, children: [
    /* @__PURE__ */ jsx3("div", { className: `hd-msg-role ${isUser ? "hd-msg-role-user" : "hd-msg-role-ai"}`, children: isUser ? "USER" : "AI" }),
    msg.thinking && /* @__PURE__ */ jsx3("div", { className: "hd-msg-think", children: msg.thinking }),
    msg.toolCalls.map((t2) => /* @__PURE__ */ jsxs3("div", { className: "hd-msg-tool", children: [
      /* @__PURE__ */ jsx3(Icon, { name: t2.status === "running" ? "loader" : "check", size: 11 }),
      /* @__PURE__ */ jsx3("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: t2.name || t2.id }),
      t2.output && /* @__PURE__ */ jsx3("span", { style: { color: "var(--c-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }, title: t2.output, children: t2.output.slice(0, 80) })
    ] }, t2.id)),
    msg.text ? /* @__PURE__ */ jsx3("div", { className: "hd-msg-bubble", children: msg.text }) : msg.streaming ? /* @__PURE__ */ jsxs3("div", { className: "hd-msg-tool", children: [
      /* @__PURE__ */ jsx3(Icon, { name: "loader", size: 11 }),
      /* @__PURE__ */ jsx3("span", { children: "\u2026" })
    ] }) : null
  ] });
}

// src/PreviewModal.tsx
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var PAGE_SIZE = 100;
function PreviewModal({ item, onRestore, onFork, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [earliestSeq, setEarliestSeq] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setMessages([]);
    setEarliestSeq(null);
    setHasMore(false);
    (async () => {
      let archived = [];
      let page = null;
      try {
        page = await fetchArchivePage(item.id, null, PAGE_SIZE);
        archived = page.messages ?? [];
      } catch {
      }
      const backend = await fetchBackendMessages(item.id);
      let native = [];
      if (item.source === "claude-code-native" && archived.length === 0 && backend.length === 0) {
        try {
          const items = await capHistory(
            "get_claude_history",
            { sessionId: item.id }
          );
          native = (items ?? []).filter((m) => m.role === "user" || m.role === "assistant").map((m, idx) => {
            let text = "";
            if (typeof m.content === "string") {
              text = m.content;
            } else if (Array.isArray(m.content)) {
              text = m.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
            }
            return {
              id: m.messageId || `${m.role}-${idx}`,
              type: m.role === "assistant" ? "assistant" : "user",
              content: text,
              timestamp: m.timestamp,
              blocks: m.role === "assistant" ? [{ type: "text", content: text }] : void 0
            };
          });
        } catch {
        }
      }
      if (cancelled) return;
      const known = new Set(archived.map((m) => String(m.id)));
      const extra = backend.filter((m) => !known.has(String(m.id)));
      const merged = native.length > 0 ? native : [...archived, ...extra];
      setMessages(merged);
      setEarliestSeq(page?.earliestSeq ?? null);
      setHasMore(page?.hasMore ?? false);
      if (merged.length === 0) setError(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);
  const loadEarlier = async () => {
    if (!hasMore || loadingEarlier || earliestSeq == null) return;
    setLoadingEarlier(true);
    try {
      const page = await fetchArchivePage(item.id, earliestSeq, PAGE_SIZE);
      const existing = new Set(messages.map((m) => String(m.id)));
      const fresh = (page.messages ?? []).filter((m) => !existing.has(String(m.id)));
      setMessages((prev) => [...fresh, ...prev]);
      setEarliestSeq(page.earliestSeq ?? earliestSeq);
      setHasMore(page.hasMore);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = Math.max(0, fresh.length * 90);
      });
    } catch {
      setHasMore(false);
    } finally {
      setLoadingEarlier(false);
    }
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const engineName = useMemo(() => item.engineId, [item.engineId]);
  return /* @__PURE__ */ jsx4("div", { className: "hd-modal-mask", onClick: onClose, children: /* @__PURE__ */ jsxs4("div", { className: "hd-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs4("div", { className: "hd-modal-head", children: [
      /* @__PURE__ */ jsxs4("div", { style: { minWidth: 0, flex: 1 }, children: [
        /* @__PURE__ */ jsx4("h2", { className: "hd-modal-title", title: item.title, children: item.title }),
        /* @__PURE__ */ jsxs4("div", { className: "hd-modal-sub", children: [
          /* @__PURE__ */ jsx4("span", { className: "hd-badge hd-badge-engine", children: engineName }),
          /* @__PURE__ */ jsxs4("span", { className: "hd-meta-item", children: [
            /* @__PURE__ */ jsx4(Icon, { name: "message", size: 11 }),
            t("history.messages", void 0, { count: item.messageCount })
          ] }),
          item.fileSize ? /* @__PURE__ */ jsx4("span", { children: formatFileSize(item.fileSize) }) : null,
          item.projectPath && /* @__PURE__ */ jsxs4("span", { className: "hd-meta-item hd-meta-ws", title: item.projectPath, children: [
            /* @__PURE__ */ jsx4(Icon, { name: "folder", size: 11 }),
            /* @__PURE__ */ jsx4("span", { className: "hd-meta-ws", children: item.projectPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("button", { type: "button", className: "hd-iconbtn", onClick: onClose, title: t("preview.close"), children: /* @__PURE__ */ jsx4(Icon, { name: "x", size: 15 }) })
    ] }),
    /* @__PURE__ */ jsx4(
      "div",
      {
        className: "hd-modal-body",
        ref: scrollRef,
        onScroll: (e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        },
        children: loading ? /* @__PURE__ */ jsxs4("div", { className: "hd-empty", children: [
          /* @__PURE__ */ jsx4(Icon, { name: "loader", size: 26 }),
          /* @__PURE__ */ jsx4("p", { children: t("preview.loading") })
        ] }) : error || messages.length === 0 ? /* @__PURE__ */ jsxs4("div", { className: "hd-empty", children: [
          /* @__PURE__ */ jsx4(Icon, { name: "warning", size: 30 }),
          /* @__PURE__ */ jsx4("p", { children: t("preview.empty") })
        ] }) : /* @__PURE__ */ jsxs4(Fragment4, { children: [
          hasMore && /* @__PURE__ */ jsx4("div", { className: "hd-msg-more", children: /* @__PURE__ */ jsx4("button", { type: "button", className: "hd-msg-more-btn", onClick: loadEarlier, disabled: loadingEarlier, children: loadingEarlier ? t("preview.loadingEarlier") : t("preview.loadEarlier") }) }),
          messages.map((m, i) => /* @__PURE__ */ jsx4(MessageView, { raw: m, index: i }, String(m.id ?? i)))
        ] })
      }
    ),
    /* @__PURE__ */ jsxs4("div", { className: "hd-modal-foot", children: [
      /* @__PURE__ */ jsx4("p", { className: "hd-modal-foot-hint", children: t("preview.readOnlyHint") }),
      /* @__PURE__ */ jsxs4("div", { className: "hd-modal-foot-actions", children: [
        /* @__PURE__ */ jsx4("button", { type: "button", className: "hd-btn", onClick: () => onFork(item), children: /* @__PURE__ */ jsxs4("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 }, children: [
          /* @__PURE__ */ jsx4(Icon, { name: "git-branch", size: 13 }),
          t("preview.fork")
        ] }) }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            type: "button",
            className: "hd-btn hd-btn-primary",
            onClick: () => onRestore(item),
            disabled: loading || error || messages.length === 0,
            children: /* @__PURE__ */ jsxs4("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 }, children: [
              /* @__PURE__ */ jsx4(Icon, { name: "restore", size: 13 }),
              t("preview.continue")
            ] })
          }
        )
      ] })
    ] }),
    !atBottom && !loading && messages.length > 0 && /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        className: "hd-iconbtn",
        style: { position: "absolute", right: 18, bottom: 64, background: "rgb(var(--c-primary))", color: "rgb(var(--c-on-primary))", borderRadius: "50%", width: 34, height: 34, boxShadow: "0 4px 14px rgb(var(--c-overlay) / 0.4)" },
        onClick: () => {
          const el = scrollRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        },
        title: t("preview.scrollToBottom"),
        children: /* @__PURE__ */ jsx4(Icon, { name: "arrow-down", size: 15 })
      }
    )
  ] }) });
}

// src/Dialogs.tsx
import { useState as useState2 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function ForkDialog({ item, onConfirm, onCancel }) {
  const [branchName, setBranchName] = useState2("");
  const time = new Date(item.timestamp);
  const fmt = `${time.getMonth() + 1}\u6708${time.getDate()}\u65E5 ${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  return /* @__PURE__ */ jsx5("div", { className: "hd-modal-mask", onClick: onCancel, children: /* @__PURE__ */ jsxs5("div", { className: "hd-modal hd-modal-sm", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs5("div", { className: "hd-modal-head", children: [
      /* @__PURE__ */ jsxs5("div", { className: "hd-modal-title", style: { display: "flex", alignItems: "center", gap: 7 }, children: [
        /* @__PURE__ */ jsx5(Icon, { name: "git-branch", size: 16 }),
        t("fork.title")
      ] }),
      /* @__PURE__ */ jsx5("button", { type: "button", className: "hd-iconbtn", onClick: onCancel, children: /* @__PURE__ */ jsx5(Icon, { name: "x", size: 14 }) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "hd-dialog-body", children: [
      /* @__PURE__ */ jsxs5("div", { className: "hd-dialog-info", children: [
        /* @__PURE__ */ jsx5("p", { style: { fontSize: 11, color: "var(--c-text-tertiary)", margin: "0 0 6px" }, children: t("fork.sourceSession") }),
        /* @__PURE__ */ jsx5("p", { className: "hd-dialog-info-title", children: item.title }),
        /* @__PURE__ */ jsxs5("div", { className: "hd-dialog-info-meta", children: [
          /* @__PURE__ */ jsxs5("span", { className: "hd-meta-item", children: [
            /* @__PURE__ */ jsx5(Icon, { name: "message", size: 11 }),
            t("fork.messages", void 0, { count: item.messageCount })
          ] }),
          /* @__PURE__ */ jsxs5("span", { className: "hd-meta-item", children: [
            /* @__PURE__ */ jsx5(Icon, { name: "clock", size: 11 }),
            fmt
          ] }),
          item.fileSize ? /* @__PURE__ */ jsx5("span", { children: formatFileSize(item.fileSize) }) : null
        ] }),
        item.gitBranch && /* @__PURE__ */ jsx5("p", { style: { marginTop: 5, fontSize: 11, color: "var(--c-text-tertiary)" }, children: t("fork.gitBranch", void 0, { branch: item.gitBranch }) }),
        item.linkedPr && /* @__PURE__ */ jsx5("p", { style: { marginTop: 3, fontSize: 11, color: "var(--c-status-info)" }, children: t("fork.linkedPr", void 0, { number: item.linkedPr.number }) })
      ] }),
      /* @__PURE__ */ jsxs5("div", { children: [
        /* @__PURE__ */ jsx5("p", { children: t("fork.inheritContext") }),
        /* @__PURE__ */ jsxs5("ul", { className: "hd-dialog-losses", style: { listStyle: "disc" }, children: [
          /* @__PURE__ */ jsx5("li", { children: t("fork.historyMessages", void 0, { count: item.messageCount }) }),
          item.gitBranch && /* @__PURE__ */ jsx5("li", { children: t("fork.gitBranch", void 0, { branch: item.gitBranch }) }),
          item.linkedPr && /* @__PURE__ */ jsx5("li", { children: t("fork.prLink", void 0, { number: item.linkedPr.number }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { style: { marginTop: 12 }, children: [
        /* @__PURE__ */ jsx5("label", { className: "hd-dialog-label", children: t("fork.branchName") }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            type: "text",
            className: "hd-dialog-input",
            value: branchName,
            onChange: (e) => setBranchName(e.target.value),
            placeholder: t("fork.branchNamePlaceholder")
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "hd-modal-foot", style: { justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ jsx5("button", { type: "button", className: "hd-btn", onClick: onCancel, children: t("fork.cancel") }),
      /* @__PURE__ */ jsx5("button", { type: "button", className: "hd-btn hd-btn-fork", onClick: () => onConfirm(branchName || void 0), children: t("fork.confirm") })
    ] })
  ] }) });
}
function DeleteDialog({ item, running, onConfirm, onCancel }) {
  return /* @__PURE__ */ jsx5("div", { className: "hd-modal-mask", onClick: onCancel, children: /* @__PURE__ */ jsxs5("div", { className: "hd-modal hd-modal-sm", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs5("div", { className: "hd-modal-head", children: [
      /* @__PURE__ */ jsxs5("div", { className: "hd-modal-title", style: { display: "flex", alignItems: "center", gap: 7, color: "rgb(var(--c-status-danger))" }, children: [
        /* @__PURE__ */ jsx5(Icon, { name: "warning", size: 16 }),
        t("delete.confirmTitle")
      ] }),
      /* @__PURE__ */ jsx5("button", { type: "button", className: "hd-iconbtn", onClick: onCancel, children: /* @__PURE__ */ jsx5(Icon, { name: "x", size: 14 }) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "hd-dialog-body", children: [
      /* @__PURE__ */ jsx5("p", { children: t("delete.confirmMessage", void 0, { title: item.title, count: item.messageCount }) }),
      running && /* @__PURE__ */ jsxs5("p", { style: { marginTop: 8, color: "rgb(var(--c-status-warning))", display: "flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ jsx5(Icon, { name: "radio", size: 12 }),
        t("delete.runningHint")
      ] }),
      /* @__PURE__ */ jsxs5("ul", { className: "hd-dialog-losses", style: { listStyle: "disc" }, children: [
        /* @__PURE__ */ jsx5("li", { children: t("delete.lossMessages", void 0, { title: item.title }) }),
        /* @__PURE__ */ jsx5("li", { children: t("delete.lossStorage") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "hd-modal-foot", style: { justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ jsx5("button", { type: "button", className: "hd-btn", onClick: onCancel, children: t("history.deleteCancelAction") }),
      /* @__PURE__ */ jsx5("button", { type: "button", className: "hd-btn hd-btn-danger", onClick: onConfirm, children: t("history.deleteConfirmAction") })
    ] })
  ] }) });
}

// src/RemoteStrip.tsx
import { useEffect as useEffect2, useMemo as useMemo2, useState as useState3 } from "react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function relativeStartedAt(startedAt) {
  if (!startedAt) return "";
  const ts = Date.parse(startedAt);
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 6e4) return t("history.justNow");
  if (diff < 36e5) return t("history.minutesAgo", void 0, { count: Math.floor(diff / 6e4) });
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function shortId(id) {
  return id.length > 14 ? `${id.slice(0, 12)}\u2026` : id;
}
function RemoteStrip({ onView }) {
  const [running, setRunning] = useState3([]);
  useEffect2(() => {
    let cancelled = false;
    void listRunningSessions().then((list2) => {
      if (!cancelled) setRunning(list2);
    }).catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect2(() => {
    let unlisten = null;
    let disposed = false;
    getHostListen()("chat-event", (envelope) => {
      const env = envelope;
      const inner = env?.payload?.payload;
      if (!inner || inner.type !== "session_start" && inner.type !== "session_end") return;
      const sessionId = inner.sessionId;
      if (!sessionId) return;
      setRunning((prev) => {
        const next = prev.filter((s) => s.conversationId !== sessionId);
        if (inner.type === "session_start") {
          next.unshift({ conversationId: sessionId, running: true });
        }
        return next;
      });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);
  const list = useMemo2(() => running.filter((s) => !!s.conversationId), [running]);
  if (list.length === 0) return null;
  return /* @__PURE__ */ jsxs6("div", { className: "hd-remote", children: [
    /* @__PURE__ */ jsxs6("div", { className: "hd-remote-label", children: [
      /* @__PURE__ */ jsx6(Icon, { name: "radio", size: 12 }),
      t("history.remoteTitle"),
      "\uFF08",
      list.length,
      "\uFF09"
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "hd-remote-cards", children: list.map((s) => /* @__PURE__ */ jsxs6(
      "button",
      {
        type: "button",
        className: "hd-remote-card",
        title: s.conversationId,
        onClick: () => onView?.(s.conversationId),
        children: [
          /* @__PURE__ */ jsxs6("div", { className: "hd-remote-card-title", children: [
            /* @__PURE__ */ jsx6("span", { className: "hd-remote-dot" }),
            /* @__PURE__ */ jsx6("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: shortId(s.conversationId) })
          ] }),
          /* @__PURE__ */ jsxs6("p", { className: "hd-remote-card-sub", children: [
            s.startedByDevice ? `${s.startedByDevice} \xB7 ` : "",
            t("history.remoteHint", void 0, { time: relativeStartedAt(s.startedAt) || t("history.justNow") })
          ] })
        ]
      },
      s.conversationId
    )) })
  ] });
}

// src/SessionTree.tsx
import { useMemo as useMemo3, useState as useState4, useCallback } from "react";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function TreeRow({
  node,
  expanded,
  restoring,
  onToggle,
  onSelect,
  onRestore
}) {
  const { session, children } = node;
  const hasChildren = children.length > 0;
  const rt = relativeTimeParts(session.timestamp);
  return /* @__PURE__ */ jsxs7("div", { className: "hd-tree-node", children: [
    /* @__PURE__ */ jsxs7("div", { className: "hd-tree-row", style: { paddingLeft: `${node.level * 16 + 12}px` }, onClick: onSelect, children: [
      /* @__PURE__ */ jsx7("div", { style: { width: 16, height: 16, flex: "none", display: "grid", placeItems: "center", marginTop: 2 }, children: hasChildren ? /* @__PURE__ */ jsx7(
        "button",
        {
          type: "button",
          onClick: (e) => {
            e.stopPropagation();
            onToggle();
          },
          className: "hd-iconbtn",
          style: { width: 18, height: 18 },
          children: /* @__PURE__ */ jsx7(Icon, { name: expanded ? "chevron-down" : "chevron-right", size: 12 })
        }
      ) : /* @__PURE__ */ jsx7("span", { style: { width: 6, height: 6, borderRadius: "50%", background: session.linkedPr ? "var(--c-status-info)" : hasChildren ? "var(--c-status-warning)" : "var(--c-primary)" } }) }),
      /* @__PURE__ */ jsxs7("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs7("div", { className: "hd-row-titleline", children: [
          /* @__PURE__ */ jsx7("h3", { className: "hd-row-title", style: { flex: "0 1 auto" }, children: session.title }),
          session.linkedPr && /* @__PURE__ */ jsxs7("span", { className: "hd-badge hd-badge-pr", children: [
            "PR #",
            session.linkedPr.number
          ] }),
          session.gitBranch && /* @__PURE__ */ jsxs7("span", { className: "hd-badge hd-badge-fork", children: [
            /* @__PURE__ */ jsx7(Icon, { name: "git-branch", size: 9 }),
            " ",
            session.gitBranch
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "hd-row-meta", style: { marginBottom: session.parentSessionId || (session.childSessionIds?.length ?? 0) > 0 ? 4 : 0 }, children: [
          /* @__PURE__ */ jsxs7("span", { className: "hd-meta-item", children: [
            /* @__PURE__ */ jsx7(Icon, { name: "message", size: 11 }),
            t("history.messages", void 0, { count: session.messageCount })
          ] }),
          /* @__PURE__ */ jsxs7("span", { className: "hd-meta-item", children: [
            /* @__PURE__ */ jsx7(Icon, { name: "clock", size: 11 }),
            rt.key ? t(rt.key, void 0, { count: rt.count }) : rt.clock
          ] })
        ] }),
        (session.parentSessionId || (session.childSessionIds?.length ?? 0) > 0) && /* @__PURE__ */ jsxs7("div", { className: "hd-row-meta", children: [
          session.parentSessionId && /* @__PURE__ */ jsxs7("span", { className: "hd-badge hd-badge-fork", children: [
            /* @__PURE__ */ jsx7(Icon, { name: "git-branch", size: 9 }),
            " ",
            t("history.forkedFrom")
          ] }),
          (session.childSessionIds?.length ?? 0) > 0 && /* @__PURE__ */ jsxs7("span", { className: "hd-badge hd-badge-fork", children: [
            /* @__PURE__ */ jsx7(Icon, { name: "git-branch", size: 9 }),
            " ",
            t("history.childSessions", void 0, { count: session.childSessionIds.length })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "hd-row-actions", style: { marginTop: 2 }, children: /* @__PURE__ */ jsx7("button", { type: "button", className: "hd-iconbtn", onClick: (e) => {
        e.stopPropagation();
        onRestore();
      }, disabled: restoring, title: t("history.restoreSession"), children: /* @__PURE__ */ jsx7(Icon, { name: restoring ? "loader" : "restore", size: 15 }) }) })
    ] }),
    hasChildren && expanded && /* @__PURE__ */ jsxs7("div", { className: "hd-tree-kids", children: [
      /* @__PURE__ */ jsx7("div", { className: "hd-tree-line", style: { left: `${node.level * 16 + 20}px` } }),
      children.map((child) => /* @__PURE__ */ jsx7(
        TreeRow,
        {
          node: child,
          expanded: false,
          restoring: false,
          onToggle: () => void 0,
          onSelect: () => void 0,
          onRestore: () => void 0
        },
        child.session.id
      ))
    ] })
  ] });
}
function SessionTree({ sessions, restoringId, onRestore, onSelect }) {
  const [expandedIds, setExpandedIds] = useState4(/* @__PURE__ */ new Set());
  const tree = useMemo3(() => buildTree(sessions), [sessions]);
  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const flattened = useMemo3(() => flattenTree(tree, expandedIds), [tree, expandedIds]);
  if (sessions.length === 0) {
    return /* @__PURE__ */ jsxs7("div", { className: "hd-empty", children: [
      /* @__PURE__ */ jsx7(Icon, { name: "message", size: 36 }),
      /* @__PURE__ */ jsx7("p", { children: t("history.noHistory") })
    ] });
  }
  return /* @__PURE__ */ jsx7("div", { children: flattened.map((node) => /* @__PURE__ */ jsx7(
    TreeRow,
    {
      node,
      expanded: expandedIds.has(node.session.id),
      restoring: restoringId === node.session.id,
      onToggle: () => toggleExpand(node.session.id),
      onSelect: () => onSelect?.(node.session),
      onRestore: () => onRestore(node.session)
    },
    node.session.id
  )) });
}

// src/prefs.ts
import { useCallback as useCallback2, useEffect as useEffect3, useState as useState5 } from "react";
var PrefsStore = class {
  state = parsePrefs({});
  loaded = false;
  loading = null;
  listeners = /* @__PURE__ */ new Set();
  snapshot() {
    return this.state;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** 幂等加载：多组件并发挂载只发一次 IPC */
  load() {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = readPrefs().then((prefs) => {
      this.state = prefs;
      this.loaded = true;
      this.emit();
    }).catch(() => {
      this.loaded = true;
    });
    return this.loading;
  }
  async commit(patch) {
    const next = await writePrefs(patch);
    this.state = next;
    this.emit();
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
};
var prefsStore = new PrefsStore();
function useHistoryPrefs() {
  const [, force] = useState5(0);
  useEffect3(() => {
    void prefsStore.load();
    return prefsStore.subscribe(() => force((v) => v + 1));
  }, []);
  return prefsStore.snapshot();
}
function usePrefsCommit() {
  return useCallback2((patch) => prefsStore.commit(patch), []);
}

// src/Panel.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function HistoryDeskPanel({ onClose }) {
  const prefs = useHistoryPrefs();
  const commitPrefs = usePrefsCommit();
  const [allHistory, setAllHistory] = useState6([]);
  const [scope, setScope] = useState6("workspace");
  const [page, setPage] = useState6(1);
  const [totalCount, setTotalCount] = useState6(0);
  const [hasMore, setHasMore] = useState6(false);
  const [loading, setLoading] = useState6(true);
  const [loadingMore, setLoadingMore] = useState6(false);
  const [restoring, setRestoring] = useState6(null);
  const [deleting, setDeleting] = useState6(null);
  const [filter, setFilter] = useState6("all");
  const [engines, setEngines] = useState6(["claude-code", "simple-ai"]);
  const [starredOnly, setStarredOnly] = useState6(false);
  const [showArchived, setShowArchived] = useState6(false);
  const [searchQuery, setSearchQuery] = useState6("");
  const [searchResults, setSearchResults] = useState6(null);
  const [searching, setSearching] = useState6(false);
  const [viewMode, setViewMode] = useState6("list");
  const [forkTarget, setForkTarget] = useState6(null);
  const [previewTarget, setPreviewTarget] = useState6(null);
  const [deleteTarget, setDeleteTarget] = useState6(null);
  const [deleteRunning, setDeleteRunning] = useState6(false);
  const [refreshTick, setRefreshTick] = useState6(0);
  const [wsMenuOpen, setWsMenuOpen] = useState6(false);
  const [runningIds, setRunningIds] = useState6(/* @__PURE__ */ new Set());
  const [hostWsPath, setHostWsPath] = useState6(getHostWorkspacePath());
  const scrollRef = useRef2(null);
  const searchTimer = useRef2(null);
  const wsMenuRef = useRef2(null);
  useEffect4(() => {
    initLang();
  }, []);
  useEffect4(() => {
    void capHistory("list_sessions", { page: 1, pageSize: 1 }).then(() => void 0).catch(() => void 0);
    setEngines((prev) => prev.length > 0 ? prev : ["claude-code", "simple-ai"]);
  }, []);
  useEffect4(() => {
    const timer = setInterval(() => {
      const p = getHostWorkspacePath();
      setHostWsPath((prev) => prev === p ? prev : p);
    }, 3e3);
    return () => clearInterval(timer);
  }, []);
  const refreshRunning = useCallback3(() => {
    void listRunningSessions().then((list) => {
      setRunningIds(new Set(list.map((s) => s.conversationId)));
    }).catch(() => void 0);
  }, []);
  useEffect4(() => {
    refreshRunning();
  }, [refreshRunning, refreshTick]);
  useEffect4(() => {
    let timer = null;
    let unlisten = null;
    let disposed = false;
    getHostListen()("chat-event", (envelope) => {
      const env = envelope;
      const inner = env?.payload?.payload;
      if (!inner || inner.type !== "session_start" && inner.type !== "session_end") return;
      if (inner.type === "session_start" && inner.sessionId) {
        setRunningIds((prev) => new Set(prev).add(inner.sessionId));
      } else if (inner.type === "session_end" && inner.sessionId) {
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(inner.sessionId);
          return next;
        });
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((v) => v + 1), 800);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (unlisten) unlisten();
    };
  }, []);
  useEffect4(() => {
    if (!wsMenuOpen) return;
    const handler = (e) => {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target)) setWsMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [wsMenuOpen]);
  const resolveWorkspacePath = useCallback3(() => {
    if (scope === "workspace") return hostWsPath || null;
    return null;
  }, [scope, hostWsPath]);
  const fetchPage = useCallback3(
    async (targetPage, forceScan = false) => {
      return queryTimeline({
        workspacePath: resolveWorkspacePath() ?? void 0,
        strictWorkspace: scope === "workspace" || void 0,
        page: targetPage,
        pageSize: prefs.listPageSize,
        engines: historyEnginesForFilter(filter, engines),
        starred: starredOnly || void 0,
        archived: showArchived ? true : void 0,
        forceScan
      });
    },
    [resolveWorkspacePath, scope, filter, engines, starredOnly, showArchived, prefs.listPageSize]
  );
  useEffect4(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setPage(1);
      try {
        const result = await fetchPage(1, refreshTick > 0);
        if (cancelled) return;
        setAllHistory(result.items);
        setTotalCount(result.total);
        setHasMore(result.hasMore);
      } catch {
        if (!cancelled) setAllHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, refreshTick]);
  useEffect4(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchHistory(q, resolveWorkspacePath(), scope === "workspace" || void 0);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, resolveWorkspacePath, scope]);
  const handleLoadMore = useCallback3(async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    try {
      const result = await fetchPage(nextPage);
      const existingIds = new Set(allHistory.map((h) => h.id));
      const newItems = result.items.filter((item) => !existingIds.has(item.id));
      setAllHistory((prev) => [...prev, ...newItems]);
      setTotalCount(result.total);
      setHasMore(result.hasMore);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }, [page, fetchPage, allHistory]);
  const handleRestore = async (rawItem) => {
    const item = rawItem;
    setRestoring(item.id);
    try {
      const effectiveProjectPath = item.projectPath || (scope === "workspace" ? hostWsPath || void 0 : void 0);
      const newId = await restoreSession({ ...item, projectPath: effectiveProjectPath });
      if (newId) {
        onClose?.();
      }
    } catch {
    } finally {
      setRestoring(null);
    }
  };
  const applyMarks = async (item, marks) => {
    const apply = (list) => list.map((h) => h.id === item.id ? { ...h, ...marks } : h);
    setAllHistory(apply);
    setSearchResults((prev) => prev ? apply(prev) : prev);
    try {
      await markHistory(item.id, marks);
      if (marks.archived !== void 0) {
        setAllHistory((prev) => prev.filter((h) => h.id !== item.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      const revert = (list) => list.map((h) => h.id === item.id ? { ...h, ...item } : h);
      setAllHistory(revert);
      setSearchResults((prev) => prev ? revert(prev) : prev);
    }
  };
  const handleDelete = async (rawItem) => {
    const item = rawItem;
    setDeleting(item.id);
    try {
      await deleteHistorySession(item.id, item.source, item.engineId);
      setAllHistory((prev) => prev.filter((h) => h.id !== item.id));
      setSearchResults((prev) => prev ? prev.filter((h) => h.id !== item.id) : prev);
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch {
    } finally {
      setDeleting(null);
      setDeleteRunning(false);
    }
  };
  const requestDelete = (rawItem) => {
    const item = rawItem;
    if (!needsDeleteConfirm(item)) {
      void handleDelete(item);
      return;
    }
    setDeleteTarget(item);
    setDeleteRunning(false);
    void isSessionRunning(item.id).then((running) => {
      setDeleteRunning(running);
    });
  };
  const handleFork = async (rawItem, branchName) => {
    const item = rawItem;
    try {
      const newId = await forkSessionViaBridge(item, branchName);
      if (!newId) {
        return;
      }
      setForkTarget(null);
    } catch {
    }
  };
  const displayItems = useMemo4(
    () => searchResults ?? allHistory,
    [searchResults, allHistory]
  );
  const continueItems = useMemo4(() => {
    if (searchResults || starredOnly || showArchived || prefs.recentCards === 0) return [];
    const pinned = allHistory.filter((h) => h.pinned);
    const recent = allHistory.filter((h) => !h.pinned).slice(0, prefs.recentCards);
    return [...pinned, ...recent].slice(0, Math.max(prefs.recentCards, pinned.length + 1));
  }, [allHistory, searchResults, starredOnly, showArchived, prefs.recentCards]);
  const stats = useMemo4(() => forkStats(allHistory), [allHistory]);
  const showWorkspaceColumn = scope === "global";
  if (loading) {
    return /* @__PURE__ */ jsxs8("div", { className: "hd-root", children: [
      /* @__PURE__ */ jsxs8("div", { className: "hd-header", children: [
        /* @__PURE__ */ jsx8("h2", { className: "hd-title", children: t("history.title") }),
        /* @__PURE__ */ jsx8("div", { className: "hd-header-actions", children: /* @__PURE__ */ jsx8("button", { type: "button", className: "hd-iconbtn", onClick: onClose, children: /* @__PURE__ */ jsx8(Icon, { name: "x", size: 16 }) }) })
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "hd-empty", style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx8(Icon, { name: "loader", size: 28 }),
        /* @__PURE__ */ jsx8("p", { children: t("history.loading") })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs8("div", { className: "hd-root", children: [
    /* @__PURE__ */ jsxs8("div", { className: "hd-header", children: [
      /* @__PURE__ */ jsx8("h2", { className: "hd-title", children: t("history.title") }),
      /* @__PURE__ */ jsxs8("div", { className: "hd-header-actions", children: [
        /* @__PURE__ */ jsx8(
          "button",
          {
            type: "button",
            className: "hd-iconbtn",
            onClick: () => setRefreshTick((v) => v + 1),
            title: t("history.refresh"),
            children: /* @__PURE__ */ jsx8(Icon, { name: "refresh", size: 15 })
          }
        ),
        /* @__PURE__ */ jsx8("button", { type: "button", className: "hd-iconbtn", onClick: onClose, children: /* @__PURE__ */ jsx8(Icon, { name: "x", size: 16 }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "hd-filters", children: [
      /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          className: `hd-chip ${scope === "workspace" ? "hd-chip-on" : ""}`,
          onClick: () => setScope("workspace"),
          children: [
            /* @__PURE__ */ jsx8(Icon, { name: "folder", size: 11 }),
            t("history.currentProject")
          ]
        }
      ),
      /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          className: `hd-chip ${scope === "global" ? "hd-chip-on" : ""}`,
          onClick: () => setScope("global"),
          children: [
            /* @__PURE__ */ jsx8(Icon, { name: "globe", size: 11 }),
            t("history.all")
          ]
        }
      ),
      /* @__PURE__ */ jsx8("span", { className: "hd-filters-sep" }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          className: `hd-chip ${filter === "all" ? "hd-chip-on" : ""}`,
          onClick: () => setFilter("all"),
          children: t("history.allEngines")
        }
      ),
      engines.map((e) => /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          className: `hd-chip ${filter === e ? "hd-chip-on" : ""}`,
          onClick: () => setFilter(e),
          children: e
        },
        e
      )),
      /* @__PURE__ */ jsx8("span", { className: "hd-filters-sep" }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          className: `hd-chip ${starredOnly ? "hd-chip-star-on" : ""}`,
          onClick: () => setStarredOnly((v) => !v),
          title: t("history.starredOnly"),
          children: /* @__PURE__ */ jsx8(Icon, { name: "star", size: 11, filled: starredOnly })
        }
      ),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          className: `hd-chip ${showArchived ? "hd-chip-on" : ""}`,
          onClick: () => setShowArchived((v) => !v),
          title: t("history.showArchived"),
          children: /* @__PURE__ */ jsx8(Icon, { name: "archive", size: 11 })
        }
      ),
      /* @__PURE__ */ jsx8("span", { className: "hd-filters-spacer" }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          className: `hd-chip ${viewMode === "list" ? "hd-chip-on" : ""}`,
          onClick: () => setViewMode("list"),
          title: t("history.listView"),
          children: /* @__PURE__ */ jsx8(Icon, { name: "list", size: 12 })
        }
      ),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          className: `hd-chip ${viewMode === "tree" ? "hd-chip-star-on" : ""}`,
          onClick: () => setViewMode("tree"),
          title: t("history.treeView"),
          children: /* @__PURE__ */ jsx8(Icon, { name: "git-branch", size: 12 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "hd-searchrow", children: [
      /* @__PURE__ */ jsx8(
        "input",
        {
          type: "text",
          className: "hd-search",
          placeholder: t("history.searchFullText"),
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value)
        }
      ),
      searching && /* @__PURE__ */ jsx8("span", { className: "hd-search-spin", children: /* @__PURE__ */ jsx8(Icon, { name: "loader", size: 14 }) })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "hd-body", ref: scrollRef, children: [
      /* @__PURE__ */ jsx8(RemoteStrip, {}),
      continueItems.length > 0 && viewMode === "list" && /* @__PURE__ */ jsxs8("div", { className: "hd-continue", children: [
        /* @__PURE__ */ jsx8("div", { className: "hd-section-label", children: t("history.continueWorking") }),
        /* @__PURE__ */ jsx8("div", { className: "hd-continue-cards", children: continueItems.map((item) => /* @__PURE__ */ jsxs8("div", { className: "hd-cw-card", children: [
          /* @__PURE__ */ jsxs8("div", { className: "hd-cw-title", children: [
            item.pinned && /* @__PURE__ */ jsx8(Icon, { name: "pin", size: 11, filled: true }),
            /* @__PURE__ */ jsx8("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: item.title })
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "hd-cw-preview", children: item.preview || item.snippet || t("history.noPreview") }),
          /* @__PURE__ */ jsxs8("div", { className: "hd-cw-foot", children: [
            /* @__PURE__ */ jsx8("span", { className: "hd-badge hd-badge-engine", children: item.engineId }),
            /* @__PURE__ */ jsx8("span", { style: { flex: 1 } }),
            /* @__PURE__ */ jsxs8(
              "button",
              {
                type: "button",
                className: "hd-cw-continue",
                onClick: () => handleRestore(item),
                disabled: restoring === item.id,
                children: [
                  /* @__PURE__ */ jsx8(Icon, { name: restoring === item.id ? "loader" : "play", size: 10 }),
                  t("history.continue")
                ]
              }
            )
          ] })
        ] }, `cw-${item.id}`)) })
      ] }),
      displayItems.length === 0 ? /* @__PURE__ */ jsxs8("div", { className: "hd-empty", children: [
        /* @__PURE__ */ jsx8(Icon, { name: "message", size: 40 }),
        /* @__PURE__ */ jsx8("p", { children: searchResults ? t("history.noSearchResults") : t("history.noHistory") })
      ] }) : viewMode === "tree" ? /* @__PURE__ */ jsx8(
        SessionTree,
        {
          sessions: displayItems,
          restoringId: restoring,
          onRestore: (item) => handleRestore(item),
          onSelect: (item) => setPreviewTarget(item)
        }
      ) : /* @__PURE__ */ jsx8(
        HistoryList,
        {
          items: displayItems,
          searching: !!searchResults,
          restoringId: restoring,
          showWorkspaceColumn,
          onToggleStar: (item) => applyMarks(item, { starred: !item.starred }),
          onTogglePin: (item) => applyMarks(item, { pinned: !item.pinned }),
          onToggleArchive: (item) => applyMarks(item, { archived: !item.archived }),
          onPreview: (item) => setPreviewTarget(item),
          onRestore: (item) => handleRestore(item),
          onFork: (item) => setForkTarget(item),
          onDelete: (item) => deleting === null ? requestDelete(item) : void 0
        }
      ),
      viewMode === "list" && !searchResults && hasMore && /* @__PURE__ */ jsx8("div", { className: "hd-more", children: /* @__PURE__ */ jsxs8("button", { type: "button", className: "hd-more-btn", onClick: handleLoadMore, disabled: loadingMore, children: [
        /* @__PURE__ */ jsx8(Icon, { name: loadingMore ? "loader" : "chevron-down", size: 14 }),
        /* @__PURE__ */ jsx8("span", { children: loadingMore ? t("history.loadingMore") : t("history.loadMore", void 0, { count: Math.max(0, totalCount - allHistory.length) }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "hd-foot", children: [
      /* @__PURE__ */ jsxs8("p", { style: { margin: 0, display: "flex", alignItems: "center", gap: 5 }, children: [
        /* @__PURE__ */ jsx8(Icon, { name: "database", size: 11 }),
        searchResults ? t("history.searchHint") : t("history.unifiedHint")
      ] }),
      (stats.forkCount > 0 || stats.prCount > 0) && /* @__PURE__ */ jsxs8("div", { className: "hd-foot-badges", children: [
        stats.forkCount > 0 && /* @__PURE__ */ jsxs8("span", { className: "hd-foot-badge", children: [
          stats.forkCount,
          " Fork"
        ] }),
        stats.prCount > 0 && /* @__PURE__ */ jsxs8("span", { className: "hd-foot-badge", style: { background: "rgb(var(--c-status-info) / 0.14)", color: "rgb(var(--c-status-info))" }, children: [
          stats.prCount,
          " PR"
        ] })
      ] })
    ] }),
    forkTarget && /* @__PURE__ */ jsx8(
      ForkDialog,
      {
        item: forkTarget,
        onConfirm: (branchName) => handleFork(forkTarget, branchName),
        onCancel: () => setForkTarget(null)
      }
    ),
    deleteTarget && /* @__PURE__ */ jsx8(
      DeleteDialog,
      {
        item: deleteTarget,
        running: deleteRunning,
        onConfirm: () => {
          const item = deleteTarget;
          setDeleteTarget(null);
          void handleDelete(item);
        },
        onCancel: () => setDeleteTarget(null)
      }
    ),
    previewTarget && /* @__PURE__ */ jsx8(
      PreviewModal,
      {
        item: previewTarget,
        onRestore: (item) => {
          setPreviewTarget(null);
          void handleRestore(item);
        },
        onFork: (item) => {
          setPreviewTarget(null);
          setForkTarget(item);
        },
        onClose: () => setPreviewTarget(null)
      }
    )
  ] });
}

// src/index.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
function HistoryDeskEntry(props) {
  return /* @__PURE__ */ jsx9(HistoryDeskPanel, { ...props });
}
export {
  HistoryDeskEntry as default
};
