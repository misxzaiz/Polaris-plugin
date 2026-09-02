// src/Panel.tsx
import { useState as useState4, useEffect, useMemo, useCallback as useCallback2 } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getWorkspaceApi() {
  const api = hostWindow().__POLARIS_WORKSPACE_API__;
  if (!api) {
    throw new Error("\u5BBF\u4E3B\u5DE5\u4F5C\u533A API \u4E0D\u53EF\u7528:\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_WORKSPACE_API__");
  }
  return api;
}
function getHostInvoke() {
  const invoke2 = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke2) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528:\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__");
  }
  return invoke2;
}
function hasHostSupport() {
  const w = hostWindow();
  return !!w.__POLARIS_WORKSPACE_API__ && !!w.__POLARIS_HOST_INVOKE__;
}

// src/types.ts
var PLUGIN_ID = "workspace-manager";

// src/store.ts
var invoke = () => getHostInvoke();
var cache = null;
var DEFAULT_DATA = {
  meta: {},
  groups: [],
  sort: "recent"
};
async function loadPluginData() {
  try {
    const raw = await invoke()("plugin_get_config", { pluginId: PLUGIN_ID });
    cache = {
      meta: raw?.meta && typeof raw.meta === "object" ? raw.meta : {},
      groups: Array.isArray(raw?.groups) ? raw.groups : [],
      sort: raw?.sort === "name" || raw?.sort === "created" || raw?.sort === "recent" ? raw.sort : "recent"
    };
  } catch {
    cache = { ...DEFAULT_DATA, meta: {}, groups: [] };
  }
  return cache;
}
async function persist() {
  if (!cache) return;
  await invoke()("plugin_set_config", {
    pluginId: PLUGIN_ID,
    patch: { meta: cache.meta, groups: cache.groups, sort: cache.sort }
  });
}
function getData() {
  return cache ?? { ...DEFAULT_DATA, meta: {}, groups: [] };
}
function getMeta(id) {
  return getData().meta[id] ?? {};
}
async function setMeta(id, patch) {
  if (!cache) cache = await loadPluginData();
  cache.meta[id] = { ...getMeta(id), ...patch };
  await persist();
}
async function removeMeta(id) {
  if (!cache) cache = await loadPluginData();
  delete cache.meta[id];
  await persist();
}
function getGroups() {
  const data = getData();
  const fromMeta = /* @__PURE__ */ new Set();
  for (const m of Object.values(data.meta)) {
    if (m.group) fromMeta.add(m.group);
  }
  const merged = Array.from(/* @__PURE__ */ new Set([...data.groups, ...fromMeta]));
  return merged;
}
async function saveGroup(name) {
  if (!cache) cache = await loadPluginData();
  if (!cache.groups.includes(name)) {
    cache.groups = [...cache.groups, name];
    await persist();
  }
}
async function deleteGroup(name) {
  if (!cache) cache = await loadPluginData();
  cache.groups = cache.groups.filter((g) => g !== name);
  for (const [id, m] of Object.entries(cache.meta)) {
    if (m.group === name) {
      const { group: _drop, ...rest } = m;
      cache.meta[id] = rest;
    }
  }
  await persist();
}
async function setSort(sort) {
  if (!cache) cache = await loadPluginData();
  cache.sort = sort;
  await persist();
}
async function importMeta(meta) {
  if (!cache) cache = await loadPluginData();
  for (const [id, m] of Object.entries(meta)) {
    cache.meta[id] = { ...getMeta(id), ...m };
  }
  await persist();
}
function exportData() {
  return JSON.parse(JSON.stringify(getData()));
}

// src/styles.ts
var injected = false;
function ensurePanelStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.id = "workspace-manager-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
var STYLES = `
.wm-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

/* \u5934\u90E8:\u641C\u7D22 */
.wm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-search {
  position: relative;
  flex: 1;
}
.wm-search input {
  width: 100%;
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 6px;
  padding: 6px 10px 6px 28px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  outline: none;
}
.wm-search input:focus {
  border-color: var(--primary, #6d8eff);
  box-shadow: 0 0 0 2px rgba(109,142,255,0.15);
}
.wm-search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted, #a1a1aa);
  pointer-events: none;
  font-size: 11px;
}
.wm-count {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  flex-shrink: 0;
}

/* \u4E3B\u4F53:\u4FA7\u680F + \u5217\u8868 */
.wm-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.wm-sidebar {
  width: 148px;
  border-right: 1px solid var(--border, rgba(255,255,255,0.08));
  overflow-y: auto;
  padding: 6px 4px;
  flex-shrink: 0;
}
.wm-sb-label {
  font-size: 10px;
  color: var(--text-muted, #71717a);
  padding: 8px 8px 3px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.wm-sb-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-secondary, #d4d4d8);
  font-size: 12px;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}
.wm-sb-item:hover { background: var(--background-hover, rgba(255,255,255,0.05)); }
.wm-sb-item.active {
  background: rgba(109,142,255,0.12);
  color: var(--primary, #6d8eff);
}
.wm-sb-item .wm-sb-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wm-sb-item .wm-sb-count {
  font-size: 10px;
  color: var(--text-muted, #71717a);
}
.wm-sb-item.active .wm-sb-count { color: var(--primary, #6d8eff); }
.wm-sb-item .wm-sb-del {
  display: none;
  color: var(--text-muted, #71717a);
  font-size: 11px;
  padding: 0 2px;
}
.wm-sb-item:hover .wm-sb-del { display: inline; }
.wm-sb-item .wm-sb-del:hover { color: #ef4444; }

/* \u5217\u8868\u533A */
.wm-list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wm-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-sort-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #71717a);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.wm-sort-btn.active {
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
}
.wm-toolbar-spacer { flex: 1; }
.wm-batch-btn {
  background: transparent;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  color: var(--text-secondary, #d4d4d8);
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.wm-batch-btn:hover { border-color: var(--primary, #6d8eff); }
.wm-batch-btn.danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }
.wm-batch-btn.danger:hover { border-color: #ef4444; background: rgba(239,68,68,0.08); }

.wm-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.wm-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
}
.wm-row:hover { background: var(--background-hover, rgba(255,255,255,0.04)); }
.wm-row.current {
  border-left-color: var(--primary, #6d8eff);
  background: rgba(109,142,255,0.08);
}
.wm-row.selected { background: rgba(109,142,255,0.12); }
.wm-check {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--border, rgba(255,255,255,0.15));
  border-radius: 3px;
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: transparent;
  font-size: 9px;
  padding: 0;
}
.wm-check.checked {
  background: var(--primary, #6d8eff);
  border-color: var(--primary, #6d8eff);
  color: #fff;
}
.wm-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: var(--background-secondary, #1a1a22);
}
.wm-main { flex: 1; min-width: 0; }
.wm-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e4e4e7);
  display: flex;
  align-items: center;
  gap: 5px;
}
.wm-name mark {
  background: rgba(251,191,36,0.3);
  color: #fbbf24;
  padding: 0 1px;
  border-radius: 2px;
}
.wm-pin { font-size: 10px; }
.wm-path {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.wm-path mark {
  background: rgba(251,191,36,0.3);
  color: #fbbf24;
  padding: 0 1px;
  border-radius: 2px;
}
.wm-notes {
  font-size: 10px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: italic;
}
.wm-group-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 7px;
  background: var(--background-secondary, #1a1a22);
  color: var(--text-secondary, #d4d4d8);
  flex-shrink: 0;
}
.wm-actions {
  display: flex;
  gap: 1px;
  opacity: 0;
  flex-shrink: 0;
}
.wm-row:hover .wm-actions { opacity: 1; }
.wm-act-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #71717a);
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
}
.wm-act-btn:hover {
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
}
.wm-act-btn.danger:hover { color: #ef4444; }

/* \u5E95\u90E8 */
.wm-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-btn {
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
  padding: 5px 12px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.wm-btn:hover { border-color: var(--primary, #6d8eff); }
.wm-btn-primary {
  background: var(--primary, #6d8eff);
  border-color: var(--primary, #6d8eff);
  color: #fff;
}
.wm-footer-spacer { flex: 1; }
.wm-status {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
}
.wm-status b { color: var(--text-secondary, #d4d4d8); font-weight: 600; }

/* \u5F39\u7A97(\u65B0\u5EFA/\u91CD\u547D\u540D/\u5206\u7EC4) */
.wm-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.wm-modal {
  background: var(--background-elevated, #14141c);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 10px;
  padding: 16px;
  width: 300px;
  max-width: calc(100% - 24px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.wm-modal h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}
.wm-field { margin-bottom: 10px; }
.wm-field label {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  margin-bottom: 4px;
}
.wm-field input {
  width: 100%;
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 5px;
  padding: 6px 9px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  outline: none;
}
.wm-field input:focus { border-color: var(--primary, #6d8eff); }
.wm-emoji-row { display: flex; gap: 3px; flex-wrap: wrap; }
.wm-emoji-opt {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px;
  padding: 0;
}
.wm-emoji-opt:hover { background: var(--background-hover, rgba(255,255,255,0.06)); }
.wm-emoji-opt.selected {
  border-color: var(--primary, #6d8eff);
  background: rgba(109,142,255,0.12);
}
.wm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.wm-error { color: #ef4444; font-size: 11px; margin-top: 6px; min-height: 14px; }

.wm-empty {
  text-align: center;
  padding: 32px 12px;
  color: var(--text-muted, #71717a);
  font-size: 12px;
}

.wm-inline-input {
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--primary, #6d8eff);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  width: 100%;
}

.wm-drop-target.drag-over {
  outline: 1px dashed var(--primary, #6d8eff);
  outline-offset: -1px;
  border-radius: 5px;
}
`;

// src/WorkspaceList.tsx
import { useRef, useState, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    text.slice(0, idx),
    /* @__PURE__ */ jsx("mark", { children: text.slice(idx, idx + q.length) }),
    text.slice(idx + q.length)
  ] });
}
var ROW_HEIGHT = 52;
function WorkspaceList(props) {
  const {
    workspaces,
    currentId,
    metaMap,
    searchQuery,
    selectedIds,
    onSelectToggle,
    onSwitch,
    onRename,
    onEditMeta,
    onRemove,
    onTogglePin
  } = props;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const listRef = useRef(null);
  const onScroll = useCallback(() => {
    if (listRef.current) setScrollTop(listRef.current.scrollTop);
  }, []);
  const setRef = useCallback((el) => {
    listRef.current = el;
    if (el) {
      setViewportH(el.clientHeight || 600);
      const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 600));
      ro.observe(el);
    }
  }, []);
  const total = workspaces.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + 3);
  const visible = workspaces.slice(start, end);
  if (total === 0) {
    return /* @__PURE__ */ jsx("div", { className: "wm-list", children: /* @__PURE__ */ jsx("div", { className: "wm-empty", children: "\u65E0\u5339\u914D\u5DE5\u4F5C\u533A" }) });
  }
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "wm-list",
      ref: setRef,
      onScroll,
      children: /* @__PURE__ */ jsx("div", { style: { height: total * ROW_HEIGHT, position: "relative" }, children: visible.map((w, i) => {
        const meta = metaMap[w.id] ?? {};
        const isCurrent = w.id === currentId;
        const isSelected = selectedIds.has(w.id);
        return /* @__PURE__ */ jsxs(
          "div",
          {
            className: `wm-row${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}`,
            style: { position: "absolute", top: (start + i) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT },
            onClick: () => onSwitch(w.id),
            draggable: true,
            onDragStart: (e) => e.dataTransfer.setData("text/wm-workspace-id", w.id),
            children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  className: `wm-check${isSelected ? " checked" : ""}`,
                  onClick: (e) => {
                    e.stopPropagation();
                    onSelectToggle(w.id);
                  },
                  title: "\u9009\u62E9",
                  children: "\u2713"
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "wm-icon", title: meta.notes, children: meta.icon || "\u{1F4C1}" }),
              /* @__PURE__ */ jsxs("div", { className: "wm-main", children: [
                /* @__PURE__ */ jsxs("div", { className: "wm-name", children: [
                  highlight(w.name, searchQuery),
                  meta.pinned && /* @__PURE__ */ jsx("span", { className: "wm-pin", children: "\u{1F4CC}" })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "wm-path", children: highlight(w.path, searchQuery) }),
                meta.notes && /* @__PURE__ */ jsx("div", { className: "wm-notes", children: meta.notes })
              ] }),
              meta.group && /* @__PURE__ */ jsx("span", { className: "wm-group-tag", children: meta.group }),
              /* @__PURE__ */ jsxs("div", { className: "wm-actions", onClick: (e) => e.stopPropagation(), children: [
                /* @__PURE__ */ jsx("button", { className: "wm-act-btn", title: meta.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876", onClick: () => onTogglePin(w.id), children: meta.pinned ? "\u{1F4CD}" : "\u{1F4CC}" }),
                /* @__PURE__ */ jsx("button", { className: "wm-act-btn", title: "\u91CD\u547D\u540D", onClick: () => onRename(w.id), children: "\u270E" }),
                /* @__PURE__ */ jsx("button", { className: "wm-act-btn", title: "\u7F16\u8F91\u5143\u6570\u636E", onClick: () => onEditMeta(w.id), children: "\u{1F3F7}" }),
                /* @__PURE__ */ jsx("button", { className: "wm-act-btn danger", title: isCurrent ? "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u53EF\u5220\u9664" : "\u5220\u9664", onClick: () => onRemove(w.id), disabled: isCurrent, children: "\u2715" })
              ] })
            ]
          },
          w.id
        );
      }) })
    }
  );
}

// src/WorkspaceSidebar.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function WorkspaceSidebar(props) {
  const { filter, groups, metaMap, workspaces, onFilterChange, onNewGroup, onDeleteGroup, onDropToGroup } = props;
  const [dragOverGroup, setDragOverGroup] = useState2(null);
  const countBy = (pred) => workspaces.filter(pred).length;
  const ungroupedCount = countBy((w) => !metaMap[w.id]?.group);
  const pinnedCount = countBy((w) => metaMap[w.id]?.pinned);
  const handleDrop = (e, group) => {
    e.preventDefault();
    setDragOverGroup(null);
    const id = e.dataTransfer.getData("text/wm-workspace-id");
    if (id && onDropToGroup) onDropToGroup(id, group);
  };
  const dropProps = (group) => ({
    onDragOver: (e) => {
      e.preventDefault();
      setDragOverGroup(group);
    },
    onDragLeave: () => setDragOverGroup(null),
    onDrop: (e) => handleDrop(e, group)
  });
  return /* @__PURE__ */ jsxs2("div", { className: "wm-sidebar", children: [
    /* @__PURE__ */ jsx2("div", { className: "wm-sb-label", children: "\u89C6\u56FE" }),
    /* @__PURE__ */ jsxs2(
      "button",
      {
        className: `wm-sb-item${filter.kind === "all" ? " active" : ""}`,
        onClick: () => onFilterChange({ kind: "all" }),
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u25A6" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-name", children: "\u5168\u90E8" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-count", children: workspaces.length })
        ]
      }
    ),
    /* @__PURE__ */ jsxs2(
      "button",
      {
        className: `wm-sb-item${filter.kind === "pinned" ? " active" : ""}`,
        onClick: () => onFilterChange({ kind: "pinned" }),
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u2605" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-name", children: "\u7F6E\u9876" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-count", children: pinnedCount })
        ]
      }
    ),
    /* @__PURE__ */ jsxs2(
      "button",
      {
        className: `wm-sb-item${filter.kind === "recent" ? " active" : ""}`,
        onClick: () => onFilterChange({ kind: "recent" }),
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u{1F558}" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-name", children: "\u6700\u8FD1 7 \u5929" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-count", children: countBy((w) => Date.now() - new Date(w.lastAccessed).getTime() < 7 * 24 * 3600 * 1e3) })
        ]
      }
    ),
    groups.length > 0 && /* @__PURE__ */ jsx2("div", { className: "wm-sb-label", children: "\u5206\u7EC4" }),
    groups.map((g) => /* @__PURE__ */ jsxs2(
      "button",
      {
        className: `wm-sb-item${filter.kind === "group" && filter.group === g ? " active" : ""}${dragOverGroup === g ? " wm-drop-target drag-over" : ""}`,
        onClick: () => onFilterChange({ kind: "group", group: g }),
        ...dropProps(g),
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u25CF" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-name", children: g }),
          /* @__PURE__ */ jsx2(
            "span",
            {
              className: "wm-sb-del",
              title: "\u5220\u9664\u5206\u7EC4(\u6210\u5458\u56DE\u9000\u672A\u5206\u7EC4)",
              onClick: (e) => {
                e.stopPropagation();
                onDeleteGroup(g);
              },
              children: "\u2715"
            }
          ),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-count", children: countBy((w) => metaMap[w.id]?.group === g) })
        ]
      },
      g
    )),
    /* @__PURE__ */ jsx2("div", { className: "wm-sb-label", children: "\u672A\u5206\u7EC4" }),
    /* @__PURE__ */ jsxs2(
      "button",
      {
        className: `wm-sb-item${filter.kind === "ungrouped" ? " active" : ""}${dragOverGroup === "__none__" ? " wm-drop-target drag-over" : ""}`,
        onClick: () => onFilterChange({ kind: "ungrouped" }),
        ...dropProps("__none__"),
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u25CB" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-name", children: "\u672A\u5206\u7EC4" }),
          /* @__PURE__ */ jsx2("span", { className: "wm-sb-count", children: ungroupedCount })
        ]
      }
    ),
    /* @__PURE__ */ jsx2("div", { style: { marginTop: 8, borderTop: "1px dashed var(--border, rgba(255,255,255,0.08))", paddingTop: 6 }, children: /* @__PURE__ */ jsxs2("button", { className: "wm-sb-item", onClick: onNewGroup, style: { fontSize: 11, color: "var(--text-muted)" }, children: [
      /* @__PURE__ */ jsx2("span", { children: "\uFF0B" }),
      /* @__PURE__ */ jsx2("span", { className: "wm-sb-name", children: "\u65B0\u5EFA\u5206\u7EC4" })
    ] }) })
  ] });
}

// src/modals.tsx
import { useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var ICON_CHOICES = ["\u{1F4C1}", "\u{1F3E0}", "\u{1F4F1}", "\u{1F527}", "\u{1F3A8}", "\u{1F4CA}", "\u{1F9EA}", "\u{1F680}", "\u{1F4DA}", "\u{1F3AE}", "\u{1F4BC}", "\u{1F331}", "\u26A1", "\u{1F9E0}", "\u{1F3F7}\uFE0F", "\u2B50"];
function WorkspaceModals(props) {
  const { modal, workspaces, groups, selectedIds, api, onClose } = props;
  if (!modal) return null;
  if (modal.kind === "create") {
    return /* @__PURE__ */ jsx3(CreateModal, { ...props });
  }
  if (modal.kind === "rename") {
    const ws = workspaces.find((w) => w.id === modal.id);
    return /* @__PURE__ */ jsx3(RenameModal, { workspace: ws, onClose, onRename: props.onRename }, modal.id);
  }
  if (modal.kind === "editMeta") {
    const ws = workspaces.find((w) => w.id === modal.id);
    return /* @__PURE__ */ jsx3(MetaModal, { workspace: ws, initialMeta: modal.initialMeta, groups, onClose, onUpdate: props.onUpdateMeta }, modal.id);
  }
  if (modal.kind === "newGroup") {
    return /* @__PURE__ */ jsx3(NewGroupModal, { onClose, onSave: props.onSaveGroup });
  }
  if (modal.kind === "batchGroup") {
    return /* @__PURE__ */ jsx3(BatchGroupModal, { groups, count: selectedIds.size, onClose, onApply: props.onBatchGroup });
  }
  return null;
}
function Overlay({ children }) {
  return /* @__PURE__ */ jsx3("div", { className: "wm-overlay", onClick: (e) => {
    if (e.target === e.currentTarget) return;
  }, children: /* @__PURE__ */ jsx3("div", { className: "wm-modal", children }) });
}
function Actions({ onClose, onConfirm, confirmLabel, busy, disabled }) {
  return /* @__PURE__ */ jsxs3("div", { className: "wm-modal-actions", children: [
    /* @__PURE__ */ jsx3("button", { className: "wm-btn", onClick: onClose, children: "\u53D6\u6D88" }),
    /* @__PURE__ */ jsx3("button", { className: "wm-btn wm-btn-primary", onClick: onConfirm, disabled: busy || disabled, children: busy ? "..." : confirmLabel })
  ] });
}
function CreateModal({ api, onClose, onCreate }) {
  const [name, setName] = useState3("");
  const [path, setPath] = useState3("");
  const [switchAfter, setSwitchAfter] = useState3(true);
  const [busy, setBusy] = useState3(false);
  const [error, setError] = useState3("");
  const confirm = async () => {
    if (!name.trim() || !path.trim()) {
      setError("\u8BF7\u586B\u5199\u540D\u79F0\u4E0E\u8DEF\u5F84");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const valid = await api?.validatePath(path.trim());
      if (!valid) {
        setError("\u8DEF\u5F84\u65E0\u6548(\u9700\u4E3A\u5B58\u5728\u7684\u76EE\u5F55)");
        setBusy(false);
        return;
      }
      await onCreate(name.trim(), path.trim(), switchAfter);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3(Overlay, { children: [
    /* @__PURE__ */ jsx3("h3", { children: "\u65B0\u5EFA\u5DE5\u4F5C\u533A" }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx3("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "\u4F8B\u5982: \u6211\u7684\u9879\u76EE", autoFocus: true })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u8DEF\u5F84" }),
      /* @__PURE__ */ jsx3("input", { value: path, onChange: (e) => setPath(e.target.value), placeholder: "D:\\\\projects\\\\my-project" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wm-field", children: /* @__PURE__ */ jsxs3("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }, children: [
      /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: switchAfter, onChange: (e) => setSwitchAfter(e.target.checked), style: { width: "auto" } }),
      "\u521B\u5EFA\u540E\u7ACB\u5373\u5207\u6362"
    ] }) }),
    /* @__PURE__ */ jsx3("div", { className: "wm-error", children: error }),
    /* @__PURE__ */ jsx3(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u521B\u5EFA", busy })
  ] });
}
function RenameModal({ workspace, onClose, onRename }) {
  const [name, setName] = useState3(workspace?.name ?? "");
  const [busy, setBusy] = useState3(false);
  const confirm = async () => {
    if (!workspace || !name.trim()) return;
    setBusy(true);
    try {
      await onRename(workspace.id, name);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3(Overlay, { children: [
    /* @__PURE__ */ jsx3("h3", { children: "\u91CD\u547D\u540D\u5DE5\u4F5C\u533A" }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u65B0\u540D\u79F0" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          value: name,
          onChange: (e) => setName(e.target.value),
          autoFocus: true,
          onKeyDown: (e) => {
            if (e.key === "Enter") confirm();
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx3(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u91CD\u547D\u540D", busy, disabled: !name.trim() })
  ] });
}
function MetaModal({ workspace, initialMeta, groups, onClose, onUpdate }) {
  const [icon, setIcon] = useState3(initialMeta?.icon ?? "\u{1F4C1}");
  const [group, setGroup] = useState3(initialMeta?.group ?? "");
  const [newGroup, setNewGroup] = useState3("");
  const [pinned, setPinned] = useState3(!!initialMeta?.pinned);
  const [notes, setNotes] = useState3(initialMeta?.notes ?? "");
  const [busy, setBusy] = useState3(false);
  const confirm = async () => {
    if (!workspace) return;
    setBusy(true);
    const finalGroup = newGroup.trim() || group;
    try {
      await onUpdate({
        icon: icon === "\u{1F4C1}" ? void 0 : icon,
        group: finalGroup || void 0,
        pinned: pinned || void 0,
        notes: notes.trim() || void 0
      }, workspace.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3(Overlay, { children: [
    /* @__PURE__ */ jsxs3("h3", { children: [
      "\u7F16\u8F91: ",
      workspace?.name ?? ""
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u56FE\u6807" }),
      /* @__PURE__ */ jsx3("div", { className: "wm-emoji-row", children: ICON_CHOICES.map((c) => /* @__PURE__ */ jsx3("button", { className: `wm-emoji-opt${icon === c ? " selected" : ""}`, onClick: () => setIcon(c), children: c }, c)) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u5206\u7EC4" }),
      /* @__PURE__ */ jsxs3(
        "select",
        {
          value: group,
          onChange: (e) => {
            setGroup(e.target.value);
            setNewGroup("");
          },
          style: { width: "100%", background: "var(--background-secondary, #1a1a22)", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 5, padding: "6px 9px", color: "var(--text-primary, #e4e4e7)", fontSize: 12 },
          children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "(\u672A\u5206\u7EC4)" }),
            groups.map((g) => /* @__PURE__ */ jsx3("option", { value: g, children: g }, g))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u6216\u65B0\u5EFA\u5206\u7EC4" }),
      /* @__PURE__ */ jsx3("input", { value: newGroup, onChange: (e) => setNewGroup(e.target.value), placeholder: "\u8F93\u5165\u65B0\u5206\u7EC4\u540D" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "wm-field", children: /* @__PURE__ */ jsxs3("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }, children: [
      /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: pinned, onChange: (e) => setPinned(e.target.checked), style: { width: "auto" } }),
      "\u7F6E\u9876"
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx3("input", { value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "\u53EF\u9009:\u9879\u76EE\u8BF4\u660E/\u5BA2\u6237\u540D" })
    ] }),
    /* @__PURE__ */ jsx3(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u4FDD\u5B58", busy })
  ] });
}
function NewGroupModal({ onClose, onSave }) {
  const [name, setName] = useState3("");
  return /* @__PURE__ */ jsxs3(Overlay, { children: [
    /* @__PURE__ */ jsx3("h3", { children: "\u65B0\u5EFA\u5206\u7EC4" }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u5206\u7EC4\u540D" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          value: name,
          onChange: (e) => setName(e.target.value),
          autoFocus: true,
          onKeyDown: (e) => {
            if (e.key === "Enter" && name.trim()) {
              onSave(name.trim());
              onClose();
            }
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx3(Actions, { onClose, onConfirm: () => {
      if (name.trim()) {
        onSave(name.trim());
        onClose();
      }
    }, confirmLabel: "\u521B\u5EFA", disabled: !name.trim() })
  ] });
}
function BatchGroupModal({ groups, count, onClose, onApply }) {
  const [group, setGroup] = useState3("");
  const [newGroup, setNewGroup] = useState3("");
  const [busy, setBusy] = useState3(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onApply(newGroup.trim() || group);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3(Overlay, { children: [
    /* @__PURE__ */ jsxs3("h3", { children: [
      "\u79FB\u5165\u5206\u7EC4(",
      count,
      " \u9879)"
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u76EE\u6807\u5206\u7EC4" }),
      /* @__PURE__ */ jsxs3(
        "select",
        {
          value: group,
          onChange: (e) => {
            setGroup(e.target.value);
            setNewGroup("");
          },
          style: { width: "100%", background: "var(--background-secondary, #1a1a22)", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 5, padding: "6px 9px", color: "var(--text-primary, #e4e4e7)", fontSize: 12 },
          children: [
            /* @__PURE__ */ jsx3("option", { value: "", children: "(\u79FB\u51FA\u5206\u7EC4)" }),
            groups.map((g) => /* @__PURE__ */ jsx3("option", { value: g, children: g }, g))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx3("label", { children: "\u6216\u65B0\u5EFA\u5206\u7EC4" }),
      /* @__PURE__ */ jsx3("input", { value: newGroup, onChange: (e) => setNewGroup(e.target.value), placeholder: "\u8F93\u5165\u65B0\u5206\u7EC4\u540D" })
    ] }),
    /* @__PURE__ */ jsx3(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u79FB\u5165", busy, disabled: !group && !newGroup.trim() })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function Panel(props) {
  ensurePanelStyles();
  const [hostError, setHostError] = useState4(
    hasHostSupport() ? null : "\u4E3B\u5E94\u7528\u672A\u63D0\u4F9B\u5BBF\u4E3B API(\u9700\u8981\u66F4\u65B0\u4E3B\u5E94\u7528\u4EE5\u652F\u6301 __POLARIS_WORKSPACE_API__)"
  );
  const [workspaces, setWorkspaces] = useState4([]);
  const [currentId, setCurrentId] = useState4(null);
  const [dataVersion, setDataVersion] = useState4(0);
  const [filter, setFilter] = useState4({ kind: "all" });
  const [searchQuery, setSearchQuery] = useState4("");
  const [sort, setSortState] = useState4("recent");
  const [selectedIds, setSelectedIds] = useState4(/* @__PURE__ */ new Set());
  const [modal, setModal] = useState4(null);
  useEffect(() => {
    let unsub;
    let mounted = true;
    (async () => {
      try {
        const data = await loadPluginData();
        if (!mounted) return;
        setSortState(data.sort);
        const api2 = getWorkspaceApi();
        setWorkspaces(api2.list());
        setCurrentId(api2.currentId());
        unsub = api2.subscribe(() => {
          setWorkspaces(api2.list());
          setCurrentId(api2.currentId());
        });
      } catch (e) {
        if (mounted) setHostError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);
  const bumpData = useCallback2(() => setDataVersion((v) => v + 1), []);
  const metaMap = useMemo(() => {
    const map = {};
    for (const w of workspaces) map[w.id] = getMeta(w.id);
    return map;
  }, [workspaces, dataVersion]);
  const groups = useMemo(() => {
    return getGroups();
  }, [dataVersion]);
  const filtered = useMemo(() => {
    let list = workspaces;
    const meta = (id) => metaMap[id] ?? {};
    if (filter.kind === "pinned") list = list.filter((w) => meta(w.id).pinned);
    else if (filter.kind === "recent") {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1e3;
      list = list.filter((w) => new Date(w.lastAccessed).getTime() > cutoff);
    } else if (filter.kind === "group") list = list.filter((w) => meta(w.id).group === filter.group);
    else if (filter.kind === "ungrouped") list = list.filter((w) => !meta(w.id).group);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((w) => {
        const notes = meta(w.id).notes ?? "";
        return w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q) || notes.toLowerCase().includes(q);
      });
    }
    const sorted = [...list].sort((a, b) => {
      const pa = meta(a.id).pinned ? 1 : 0;
      const pb = meta(b.id).pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (sort === "name") return a.name.localeCompare(b.name, "zh");
      if (sort === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime();
    });
    return sorted;
  }, [workspaces, metaMap, filter, searchQuery, sort]);
  const api = hostError ? null : getWorkspaceApi();
  const handleSwitch = useCallback2(async (id) => {
    if (!api || id === currentId) return;
    try {
      await api.switch(id);
    } catch (e) {
      console.error("[workspace-manager] switch failed", e);
    }
  }, [api, currentId]);
  const handleRename = useCallback2(async (id, name) => {
    if (!api || !name.trim()) return;
    try {
      await api.update(id, { name: name.trim() });
    } catch (e) {
      console.error("[workspace-manager] rename failed", e);
    }
  }, [api]);
  const handleCreate = useCallback2(async (name, path, switchAfter) => {
    if (!api) throw new Error("\u5BBF\u4E3B API \u4E0D\u53EF\u7528");
    await api.create(name, path, switchAfter);
  }, [api]);
  const handleRemove = useCallback2(async (ids) => {
    if (!api) return;
    for (const id of ids) {
      if (id === currentId) continue;
      try {
        await api.remove(id);
        await removeMeta(id);
      } catch (e) {
        console.error("[workspace-manager] remove failed", e);
      }
    }
    setSelectedIds(/* @__PURE__ */ new Set());
    bumpData();
  }, [api, currentId, bumpData]);
  const handleUpdateMeta = useCallback2(async (id, patch) => {
    await setMeta(id, patch);
    bumpData();
  }, [bumpData]);
  const handleTogglePin = useCallback2((id) => {
    const cur = getMeta(id).pinned;
    void handleUpdateMeta(id, { pinned: !cur || void 0 });
  }, [handleUpdateMeta]);
  const handleDropToGroup = useCallback2((id, group) => {
    const target = group === "__none__" ? "" : group;
    void handleUpdateMeta(id, { group: target || void 0 });
  }, [handleUpdateMeta]);
  const handleSortChange = useCallback2(async (mode) => {
    setSortState(mode);
    await setSort(mode);
  }, []);
  const handleSaveGroup = useCallback2(async (name) => {
    if (!name.trim()) return;
    await saveGroup(name.trim());
    bumpData();
  }, [bumpData]);
  const handleDeleteGroup = useCallback2(async (name) => {
    await deleteGroup(name);
    setFilter((f) => f.kind === "group" && f.group === name ? { kind: "all" } : f);
    bumpData();
  }, [bumpData]);
  const handleExport = useCallback2(() => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace-manager-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  const handleImport = useCallback2(async (file) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.meta === "object") {
        await importMeta(parsed.meta);
        if (Array.isArray(parsed.groups)) {
          for (const g of parsed.groups) await saveGroup(String(g));
        }
        bumpData();
      }
    } catch (e) {
      console.error("[workspace-manager] import failed", e);
    }
  }, [bumpData]);
  if (hostError) {
    return /* @__PURE__ */ jsx4("div", { className: "wm-panel", children: /* @__PURE__ */ jsxs4("div", { className: "wm-empty", style: { paddingTop: 48 }, children: [
      /* @__PURE__ */ jsx4("div", { style: { fontSize: 24, marginBottom: 8 }, children: "\u{1F50C}" }),
      /* @__PURE__ */ jsx4("div", { children: hostError })
    ] }) });
  }
  return /* @__PURE__ */ jsxs4("div", { className: "wm-panel", style: { position: "relative" }, children: [
    /* @__PURE__ */ jsxs4("div", { className: "wm-header", children: [
      /* @__PURE__ */ jsxs4("div", { className: "wm-search", children: [
        /* @__PURE__ */ jsx4("span", { className: "wm-search-icon", children: "\u{1F50D}" }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "text",
            placeholder: "\u641C\u7D22\u540D\u79F0 / \u8DEF\u5F84 / \u5907\u6CE8",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("span", { className: "wm-count", children: [
        filtered.length,
        "/",
        workspaces.length
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "wm-body", children: [
      /* @__PURE__ */ jsx4(
        WorkspaceSidebar,
        {
          filter,
          groups,
          metaMap,
          workspaces,
          onFilterChange: setFilter,
          onNewGroup: () => setModal({ kind: "newGroup" }),
          onDeleteGroup: handleDeleteGroup,
          onDropToGroup: handleDropToGroup
        }
      ),
      /* @__PURE__ */ jsxs4("div", { className: "wm-list-area", children: [
        /* @__PURE__ */ jsxs4("div", { className: "wm-toolbar", children: [
          /* @__PURE__ */ jsx4("button", { className: `wm-sort-btn${sort === "recent" ? " active" : ""}`, onClick: () => handleSortChange("recent"), children: "\u6700\u8FD1\u8BBF\u95EE" }),
          /* @__PURE__ */ jsx4("button", { className: `wm-sort-btn${sort === "name" ? " active" : ""}`, onClick: () => handleSortChange("name"), children: "\u540D\u79F0" }),
          /* @__PURE__ */ jsx4("button", { className: `wm-sort-btn${sort === "created" ? " active" : ""}`, onClick: () => handleSortChange("created"), children: "\u521B\u5EFA\u65F6\u95F4" }),
          /* @__PURE__ */ jsx4("span", { className: "wm-toolbar-spacer" })
        ] }),
        /* @__PURE__ */ jsx4(
          WorkspaceList,
          {
            workspaces: filtered,
            currentId: currentId ?? void 0,
            metaMap,
            searchQuery,
            selectedIds,
            onSelectToggle: (id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            },
            onSwitch: handleSwitch,
            onRename: (id) => setModal({ kind: "rename", id }),
            onEditMeta: (id) => setModal({ kind: "editMeta", id, initialMeta: metaMap[id] }),
            onRemove: (id) => handleRemove([id]),
            onTogglePin: handleTogglePin
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "wm-footer", children: [
      /* @__PURE__ */ jsx4("button", { className: "wm-btn wm-btn-primary", onClick: () => setModal({ kind: "create" }), children: "+ \u65B0\u5EFA" }),
      selectedIds.size > 0 && /* @__PURE__ */ jsxs4(Fragment2, { children: [
        /* @__PURE__ */ jsxs4("button", { className: "wm-batch-btn danger", onClick: () => handleRemove(Array.from(selectedIds)), children: [
          "\u5220\u9664 (",
          selectedIds.size,
          ")"
        ] }),
        /* @__PURE__ */ jsx4("button", { className: "wm-batch-btn", onClick: () => setModal({ kind: "batchGroup" }), children: "\u79FB\u5165\u5206\u7EC4" })
      ] }),
      /* @__PURE__ */ jsx4("span", { className: "wm-footer-spacer" }),
      /* @__PURE__ */ jsx4("button", { className: "wm-btn", onClick: handleExport, title: "\u5BFC\u51FA\u5907\u4EFD", children: "\u2B07" }),
      /* @__PURE__ */ jsxs4("label", { className: "wm-btn", style: { display: "inline-flex", alignItems: "center" }, title: "\u5BFC\u5165\u5907\u4EFD", children: [
        "\u2B06",
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "file",
            accept: "application/json",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("span", { className: "wm-status", children: [
        "\u5DF2\u540C\u6B65 ",
        /* @__PURE__ */ jsx4("b", { children: workspaces.length }),
        " \u4E2A\u5DE5\u4F5C\u533A"
      ] })
    ] }),
    /* @__PURE__ */ jsx4(
      WorkspaceModals,
      {
        modal,
        workspaces,
        groups,
        selectedIds,
        api,
        onClose: () => setModal(null),
        onCreate: handleCreate,
        onRename: handleRename,
        onUpdateMeta: (patch, id) => handleUpdateMeta(id, patch),
        onBatchGroup: async (group) => {
          for (const id of selectedIds) await handleUpdateMeta(id, { group: group || void 0 });
          setSelectedIds(/* @__PURE__ */ new Set());
          setModal(null);
        },
        onSaveGroup: (name) => {
          handleSaveGroup(name);
          setModal(null);
        }
      }
    )
  ] });
}
export {
  Panel as default
};
