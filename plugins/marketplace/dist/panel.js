// src/Panel.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function resolveTier(p) {
  if (p.tier === "production" || p.tier === "beta") return p.tier;
  return "demo";
}
var OFFICIAL_INDEX_SOURCES = [
  "https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/index.json",
  "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/index.json"
];
var INDEX_SOURCE_KEY = "polaris.marketplace.indexUrl";
var SOURCES_KEY = "polaris.marketplace.sources";
var ACTIVE_SOURCE_KEY = "polaris.marketplace.activeSourceId";
var OFFICIAL_SOURCE_ID = "__official__";
function defaultSourceName(url) {
  if (!url) return "\u5B98\u65B9";
  try {
    const u = new URL(url);
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return `\u672C\u5730 ${u.port || 80}`;
    return u.hostname;
  } catch {
    return url.split("/").filter(Boolean).pop() || url;
  }
}
function getSources() {
  const official = { id: OFFICIAL_SOURCE_ID, name: "\u5B98\u65B9", url: "", builtin: true, lastUsed: 0 };
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    if (!raw) return [official];
    const list = JSON.parse(raw);
    const valid = list.filter((s2) => s2 && typeof s2.id === "string" && typeof s2.url === "string" && s2.id !== OFFICIAL_SOURCE_ID);
    return [official, ...valid].sort((a, b) => b.lastUsed - a.lastUsed);
  } catch {
    return [official];
  }
}
function saveSources(list) {
  const user = list.filter((s2) => !s2.builtin);
  try {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(user));
  } catch {
  }
}
function getActiveSourceId() {
  try {
    return localStorage.getItem(ACTIVE_SOURCE_KEY) || OFFICIAL_SOURCE_ID;
  } catch {
    return OFFICIAL_SOURCE_ID;
  }
}
function setActiveSourceId(id) {
  try {
    localStorage.setItem(ACTIVE_SOURCE_KEY, id);
  } catch {
  }
}
function touchSource(id) {
  const list = getSources().filter((s2) => s2.id !== OFFICIAL_SOURCE_ID);
  const hit = list.find((s2) => s2.id === id);
  if (!hit) return;
  hit.lastUsed = Date.now();
  saveSources(list);
}
function upsertSource(name, url) {
  const list = getSources().filter((s2) => s2.id !== OFFICIAL_SOURCE_ID);
  const existing = list.find((s2) => s2.url === url);
  const id = existing?.id ?? `src-${Date.now().toString(36)}`;
  const entry = {
    id,
    name: name.trim() || defaultSourceName(url),
    url,
    lastUsed: Date.now()
  };
  const next = [entry, ...list.filter((s2) => s2.id !== id)];
  saveSources(next);
  return entry;
}
function removeSource(id) {
  const list = getSources().filter((s2) => s2.id !== OFFICIAL_SOURCE_ID);
  const next = list.filter((s2) => s2.id !== id);
  if (next.length === list.length) return false;
  saveSources(next);
  return true;
}
function migrateLegacySingleSource() {
  try {
    if (localStorage.getItem(SOURCES_KEY)) return;
    const legacy = (localStorage.getItem(INDEX_SOURCE_KEY) || "").trim();
    if (!legacy) return;
    upsertSource(defaultSourceName(legacy), legacy);
    setActiveSourceId(getSources().find((s2) => s2.url === legacy)?.id || OFFICIAL_SOURCE_ID);
    localStorage.removeItem(INDEX_SOURCE_KEY);
  } catch {
  }
}
function fetchWithTimeout(url, ms = 1e4) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return fetch(url, { cache: "no-cache", signal: ac.signal }).finally(() => clearTimeout(timer));
}
function resolveIndexUrls(data, sourceUrl) {
  if (!/^https?:\/\//i.test(sourceUrl)) return;
  const resolve = (raw) => {
    if (!raw || /^https?:\/\//i.test(raw)) return raw;
    try {
      return new URL(raw, sourceUrl).toString();
    } catch {
      return raw;
    }
  };
  for (const p of data.plugins) {
    p.downloadUrl = p.downloadUrl ? resolve(p.downloadUrl) : void 0;
    p.manifestUrl = p.manifestUrl ? resolve(p.manifestUrl) : void 0;
    p.updateUrl = p.updateUrl ? resolve(p.updateUrl) : void 0;
    for (const v of p.versions || []) v.downloadUrl = resolve(v.downloadUrl);
  }
}
function getInvoke() {
  const g = window;
  if (typeof g.__POLARIS_HOST_INVOKE__ === "function") return g.__POLARIS_HOST_INVOKE__;
  if (g.__TAURI_INTERNALS__?.invoke) {
    const invoke = g.__TAURI_INTERNALS__.invoke;
    return (cmd, args) => invoke(cmd, args);
  }
  throw new Error("\u5BBF\u4E3B\u8C03\u7528\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF0C\u6216\u5728\u624B\u673A App \u4E0A\u5148\u8FDE\u63A5\u684C\u9762\u7AEF\u670D\u52A1");
}
function humanizeError(raw) {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "\u672A\u77E5\u9519\u8BEF");
  if (/router_dispatch/i.test(msg) && /not found|unregistered|未注册/i.test(msg)) {
    return "\u5BBF\u4E3B\u7F3A\u5C11 router_dispatch \u547D\u4EE4\uFF1A\u5F53\u524D\u5E94\u7528\u58F3\u672A\u6CE8\u518C\u540E\u7AEF\u547D\u4EE4\uFF08\u624B\u673A\u58F3/\u65E7\u7248\u5E94\u7528\uFF09\u3002\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF0C\u6216\u5728\u624B\u673A App \u4E2D\u5148\u8FDE\u63A5\u684C\u9762\u7AEF\u670D\u52A1";
  }
  if (/HTTP 401|HTTP 403|认证失败|unauthorized|forbidden/i.test(msg)) {
    return "\u8BA4\u8BC1\u5931\u8D25\uFF08HTTP 401/403\uFF09\uFF1A\u8FDC\u7A0B\u684C\u9762\u670D\u52A1\u62D2\u7EDD\u4E86\u8BF7\u6C42\u3002\u8BF7\u5728\u624B\u673A App \u4E2D\u91CD\u65B0\u8FDE\u63A5\u684C\u9762\u7AEF\u670D\u52A1\uFF08\u8BBE\u7F6E \u2192 \u670D\u52A1\u8FDE\u63A5\uFF09\uFF0C\u786E\u8BA4 token \u6709\u6548";
  }
  if (/Failed to fetch|NetworkError|网络不可达|load failed|fetch failed|network/i.test(msg)) {
    return "\u7F51\u7EDC\u4E0D\u53EF\u8FBE\uFF1A\u5F53\u524D\u4E3A\u8FDC\u7A0B/\u672A\u8FDE\u63A5\u6A21\u5F0F\uFF0C\u65E0\u6CD5\u8BBF\u95EE\u684C\u9762\u7AEF\u670D\u52A1\u3002\u8BF7\u5728\u624B\u673A App \u4E2D\u5148\u8FDE\u63A5\u684C\u9762\u7AEF\u670D\u52A1\uFF08\u8BBE\u7F6E \u2192 \u670D\u52A1\u8FDE\u63A5\uFF09\uFF0C\u6216\u68C0\u67E5\u7F51\u7EDC";
  }
  if (!/__POLARIS_HOST_INVOKE__/i.test(msg) && /deny|denied|拒绝|not allowed|permission/i.test(msg)) {
    return `${msg}\uFF08\u8FDC\u7A0B\u6A21\u5F0F\u4E0B\u4EC5\u653E\u884C\u67E5\u770B/\u68C0\u67E5\u66F4\u65B0\u7B49\u53EA\u8BFB\u64CD\u4F5C\uFF1B\u5B89\u88C5/\u5378\u8F7D/\u66F4\u65B0\u8BF7\u5728\u684C\u9762\u7AEF\u64CD\u4F5C\uFF0C\u6216\u5728 AI \u4F1A\u8BDD\u4E2D\u6267\u884C\uFF09`;
  }
  return msg;
}
async function dispatchPluginDiscovery(action, payload) {
  let res;
  try {
    res = await getInvoke()("router_dispatch", {
      req: { target: "cap.pluginDiscovery", payload: { action, ...payload } }
    });
  } catch (e) {
    throw new Error(humanizeError(e));
  }
  if (!res.ok) throw new Error(res.error ? humanizeError(res.error) : `cap.pluginDiscovery ${action} \u5931\u8D25`);
  return res.result || {};
}
async function installPlugin(plugin, scope, version) {
  if (version && version !== plugin.version && plugin.versions) {
    const target = plugin.versions.find((v) => v.version === version);
    if (!target?.downloadUrl) return { success: false, error: `\u672A\u627E\u5230\u63D2\u4EF6 ${plugin.id} \u7684\u7248\u672C ${version}` };
    try {
      return await dispatchPluginDiscovery("install_remote", { sourceUrl: target.downloadUrl, scope });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!plugin.downloadUrl) return { success: false, error: "\u8BE5\u63D2\u4EF6\u672A\u63D0\u4F9B downloadUrl" };
  try {
    return await dispatchPluginDiscovery("install_remote", { sourceUrl: plugin.downloadUrl, scope });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function discoverInstalled() {
  try {
    const res = await dispatchPluginDiscovery("discover", {});
    return Array.isArray(res.plugins) ? res.plugins : [];
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}
async function uninstallPlugin(installPath) {
  try {
    return await dispatchPluginDiscovery("uninstall_local", { installPath });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function checkUpdate(installPath) {
  try {
    const r = await dispatchPluginDiscovery("check_update", { installPath });
    return { ...r, pluginId: r.pluginId };
  } catch (e) {
    return { pluginId: "", currentVersion: "", updateAvailable: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function applyUpdate(installPath) {
  try {
    return await dispatchPluginDiscovery("apply_update", { installPath });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var TIER_CONFIG = {
  production: { label: "Production", color: "#34D399", bg: "#065F4622", border: "#065F4644" },
  beta: { label: "Beta", color: "#60A5FA", bg: "#1E40AF22", border: "#1E40AF44" },
  demo: { label: "Demo", color: "#6B7280", bg: "#3F3F4622", border: "#3F3F4644" }
};
var CATEGORY_COLORS = {
  utility: "#3B82F6",
  mcp: "#8B5CF6",
  panel: "#10B981",
  media: "#EC4899",
  dev: "#F59E0B",
  productivity: "#06B6D4",
  integration: "#6366F1",
  "ai-engine": "#A855F7",
  fun: "#EC4899",
  demo: "#6B7280"
};
var s = {
  btn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #3F3F46",
    background: "#2D2D33",
    color: "#F8F8F8",
    fontSize: 12,
    cursor: "pointer"
  },
  miniBtn: {
    padding: "4px 10px",
    borderRadius: 5,
    border: "1px solid #3F3F46",
    background: "#2D2D33",
    color: "#B4B4B8",
    fontSize: 11,
    cursor: "pointer"
  },
  pre: {
    fontSize: 11,
    color: "#B4B4B8",
    background: "#25252B",
    padding: 8,
    borderRadius: 6,
    margin: 0,
    maxHeight: 120,
    overflow: "auto",
    whiteSpace: "pre-wrap"
  }
};
function MarketplacePanel({ pluginId: _pluginId }) {
  const [tab, setTab] = useState("market");
  const [index, setIndex] = useState(null);
  const [mLoading, setMLoading] = useState(true);
  const [mError, setMError] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [installing, setInstalling] = useState(null);
  const [installMsg, setInstallMsg] = useState(null);
  const [sourceUsed, setSourceUsed] = useState("");
  const [sources, setSources] = useState(() => {
    migrateLegacySingleSource();
    return getSources();
  });
  const [activeSourceId, setActiveId] = useState(() => getActiveSourceId());
  const [installed, setInstalled] = useState([]);
  const [iLoading, setILoading] = useState(false);
  const [iError, setIError] = useState(null);
  const [updates, setUpdates] = useState({});
  const [opLoading, setOpLoading] = useState(null);
  const [opMsg, setOpMsg] = useState(null);
  const loadIndex = useCallback(async (sourceId) => {
    const sid = sourceId ?? getActiveSourceId();
    const src = getSources().find((s2) => s2.id === sid) || getSources()[0];
    setMLoading(true);
    setMError(null);
    setSourceUsed("");
    try {
      const candidates = src.url ? [src.url] : OFFICIAL_INDEX_SOURCES;
      let lastError = "";
      for (const source of candidates) {
        try {
          const res = await fetchWithTimeout(source);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!Array.isArray(data?.plugins)) throw new Error("\u7D22\u5F15\u683C\u5F0F\u65E0\u6548\uFF08\u7F3A\u5C11 plugins \u6570\u7EC4\uFF09");
          resolveIndexUrls(data, source);
          setIndex(data);
          setSourceUsed(src.url ? source : src.name);
          touchSource(sid);
          setActiveId(sid);
          return;
        } catch (e) {
          lastError = e instanceof DOMException && e.name === "AbortError" ? `${source} \u8D85\u65F6\uFF0810s\uFF09` : `${source}\uFF1A${e instanceof Error ? e.message : String(e)}`;
        }
      }
      throw new Error(lastError || "\u6240\u6709\u7D22\u5F15\u6E90\u5747\u4E0D\u53EF\u8FBE");
    } catch (e) {
      setMError(e instanceof Error ? e.message : String(e));
    } finally {
      setMLoading(false);
    }
  }, []);
  const switchSource = useCallback((id) => {
    setActiveId(id);
    setActiveSourceId(id);
    setSelected(null);
    setSelectedVersion("");
    setInstallMsg(null);
    void loadIndex(id);
  }, [loadIndex]);
  const applyIndexSource = useCallback((name, url) => {
    const entry = upsertSource(name, url);
    setSources(getSources());
    setActiveId(entry.id);
    setActiveSourceId(entry.id);
    setSelected(null);
    setSelectedVersion("");
    setInstallMsg(null);
    void loadIndex(entry.id);
  }, [loadIndex]);
  const deleteSource = useCallback((id) => {
    if (id === OFFICIAL_SOURCE_ID) return;
    if (!removeSource(id)) return;
    setSources(getSources());
    if (getActiveSourceId() === id) {
      setActiveId(OFFICIAL_SOURCE_ID);
      setActiveSourceId(OFFICIAL_SOURCE_ID);
      void loadIndex(OFFICIAL_SOURCE_ID);
    }
  }, [loadIndex]);
  const loadInstalled = useCallback(async () => {
    setILoading(true);
    setIError(null);
    try {
      setInstalled(await discoverInstalled());
    } catch (e) {
      setIError(e instanceof Error ? e.message : String(e));
    } finally {
      setILoading(false);
    }
  }, []);
  useEffect(() => {
    loadIndex();
  }, [loadIndex]);
  useEffect(() => {
    if (tab === "installed") loadInstalled();
  }, [tab, loadInstalled]);
  const refreshAfterOp = useCallback(async () => {
    await loadInstalled();
    setUpdates({});
  }, [loadInstalled]);
  const handleInstall = async (p, scope) => {
    setInstalling(p.id);
    setInstallMsg(null);
    const version = selectedVersion && selectedVersion !== p.version ? selectedVersion : void 0;
    const r = await installPlugin(p, scope, version);
    setInstallMsg(r.success ? `\u2713 ${p.name} ${version ? "v" + version : ""} \u5B89\u88C5\u6210\u529F${r.message ? "\uFF1A" + r.message : ""}` : `\u2717 \u5B89\u88C5\u5931\u8D25\uFF1A${r.error ?? "\u672A\u77E5\u9519\u8BEF"}`);
    setInstalling(null);
  };
  const handleUninstall = async (p) => {
    if (!p.installPath) return;
    if (!confirm(`\u786E\u8BA4\u5378\u8F7D ${p.name}\uFF08${p.id}\uFF09\uFF1F`)) return;
    setOpLoading(`uninstall-${p.id}`);
    setOpMsg(null);
    const r = await uninstallPlugin(p.installPath);
    setOpMsg(r.success ? `\u2713 ${p.name} \u5DF2\u5378\u8F7D` : `\u2717 \u5378\u8F7D\u5931\u8D25\uFF1A${r.error ?? "\u672A\u77E5\u9519\u8BEF"}`);
    setOpLoading(null);
    if (r.success) await refreshAfterOp();
  };
  const handleCheckUpdate = async (p) => {
    if (!p.installPath) return;
    setOpLoading(`check-${p.id}`);
    setOpMsg(null);
    const r = await checkUpdate(p.installPath);
    setUpdates((prev) => ({ ...prev, [p.id]: r }));
    setOpLoading(null);
    if (r.error) setOpMsg(`\u2717 \u68C0\u67E5 ${p.name} \u66F4\u65B0\u5931\u8D25\uFF1A${r.error}`);
    else if (r.updateAvailable) setOpMsg(`\u2713 ${p.name} \u6709\u65B0\u7248\u672C\uFF1A${r.currentVersion} \u2192 ${r.latestVersion}`);
    else setOpMsg(`\u2713 ${p.name} \u5DF2\u662F\u6700\u65B0\uFF08${r.currentVersion}\uFF09`);
  };
  const handleApplyUpdate = async (p) => {
    if (!p.installPath) return;
    setOpLoading(`apply-${p.id}`);
    setOpMsg(null);
    const r = await applyUpdate(p.installPath);
    setOpMsg(r.success ? `\u2713 ${p.name} \u66F4\u65B0\u6210\u529F${r.message ? "\uFF1A" + r.message : ""}` : `\u2717 \u66F4\u65B0\u5931\u8D25\uFF1A${r.error ?? "\u672A\u77E5\u9519\u8BEF"}`);
    setOpLoading(null);
    if (r.success) await refreshAfterOp();
  };
  const handleCheckAll = async () => {
    const list = installed.filter((p) => p.installPath && !p.builtin);
    for (const p of list) {
      setUpdates((prev) => ({ ...prev, [p.id]: { pluginId: p.id, currentVersion: p.version, updateAvailable: false, checking: true } }));
      const r = await checkUpdate(p.installPath);
      setUpdates((prev) => ({ ...prev, [p.id]: r }));
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "market", onClick: () => setTab("market"), label: "\u5546\u57CE" }),
      /* @__PURE__ */ jsx(TabBtn, { active: tab === "installed", onClick: () => setTab("installed"), label: `\u5DF2\u88C5${installed.length ? ` (${installed.filter((p) => !p.builtin).length})` : ""}` })
    ] }),
    tab === "market" ? /* @__PURE__ */ jsx(
      MarketView,
      {
        index,
        loading: mLoading,
        error: mError,
        query,
        setQuery,
        category,
        setCategory,
        tierFilter,
        setTierFilter,
        selected,
        setSelected: (p) => {
          setSelected(p);
          setSelectedVersion("");
          setInstallMsg(null);
        },
        selectedVersion,
        setSelectedVersion,
        installing,
        installMsg,
        onInstall: handleInstall,
        onReload: () => void loadIndex(),
        sourceUsed,
        sources,
        activeSourceId,
        onSwitchSource: switchSource,
        onAddSource: applyIndexSource,
        onDeleteSource: deleteSource
      }
    ) : /* @__PURE__ */ jsx(
      InstalledView,
      {
        installed,
        loading: iLoading,
        error: iError,
        updates,
        opLoading,
        opMsg,
        onReload: loadInstalled,
        onUninstall: handleUninstall,
        onCheckUpdate: handleCheckUpdate,
        onApplyUpdate: handleApplyUpdate,
        onCheckAll: handleCheckAll
      }
    )
  ] });
}
function MarketView(props) {
  const {
    index,
    loading,
    error,
    query,
    setQuery,
    category,
    setCategory,
    tierFilter,
    setTierFilter,
    selected,
    setSelected,
    selectedVersion,
    setSelectedVersion,
    installing,
    installMsg,
    onInstall,
    onReload,
    sourceUsed,
    sources,
    activeSourceId,
    onSwitchSource,
    onAddSource,
    onDeleteSource
  } = props;
  const plugins = index?.plugins ?? [];
  const categories = Array.from(new Set(plugins.map((p) => p.category).filter(Boolean)));
  const filtered = useMemo(() => {
    return plugins.filter((p) => {
      const t = resolveTier(p);
      if (tierFilter !== "all" && t !== tierFilter) return false;
      if (category && p.category !== category) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = [p.id, p.name, p.description, (p.tags || []).join(" ")].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plugins, tierFilter, category, query]);
  const grouped = useMemo(() => {
    const groups = { production: [], beta: [], demo: [] };
    for (const p of filtered) {
      groups[resolveTier(p)].push(p);
    }
    return groups;
  }, [filtered]);
  const tierOrder = ["production", "beta", "demo"];
  const tierLabels = { production: "\u751F\u4EA7\u53EF\u7528", beta: "\u6D4B\u8BD5\u9636\u6BB5", demo: "\u6F14\u793A\u73A9\u5177" };
  const hasAny = tierOrder.some((t) => grouped[t].length > 0);
  if (loading) return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsx(
      SourceBar,
      {
        sources,
        activeSourceId,
        onSwitchSource,
        onAddSource,
        onDeleteSource,
        sourceUsed
      }
    ),
    /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93" }, children: "\u52A0\u8F7D\u5546\u57CE\u7D22\u5F15\u4E2D\u2026" })
  ] });
  if (error) return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsx(
      SourceBar,
      {
        sources,
        activeSourceId,
        onSwitchSource,
        onAddSource,
        onDeleteSource,
        sourceUsed
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { color: "#EF4444", wordBreak: "break-all" }, children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        error
      ] }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", lineHeight: 1.5 }, children: "\u5207\u6362\u5176\u4ED6\u5546\u57CE\u6E90\u91CD\u8BD5\uFF0C\u6216\u68C0\u67E5\u7F51\u7EDC\u540E\u5237\u65B0\u3002" }),
      /* @__PURE__ */ jsx("button", { onClick: onReload, style: s.btn, children: "\u91CD\u8BD5" })
    ] })
  ] });
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "12px 12px 8px", display: "flex", gap: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: "\u641C\u7D22\u63D2\u4EF6\u2026",
          style: { flex: 1, padding: "6px 10px", background: "#25252B", border: "1px solid #3F3F46", borderRadius: 6, color: "#F8F8F8", fontSize: 12, outline: "none" }
        }
      ),
      /* @__PURE__ */ jsx("button", { onClick: onReload, title: "\u5237\u65B0\u7D22\u5F15", style: { ...s.btn, padding: "6px 10px" }, children: "\u21BB" })
    ] }),
    /* @__PURE__ */ jsx(
      SourceBar,
      {
        sources,
        activeSourceId,
        onSwitchSource,
        onAddSource,
        onDeleteSource,
        sourceUsed
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { padding: "0 12px 8px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6B7280", marginRight: 2 }, children: "\u7B49\u7EA7" }),
      ["all", "production", "beta", "demo"].map((t) => /* @__PURE__ */ jsx(
        FilterChip,
        {
          active: tierFilter === t,
          onClick: () => setTierFilter(t),
          label: t === "all" ? "\u5168\u90E8" : TIER_CONFIG[t].label,
          color: t === "all" ? "#6B7280" : TIER_CONFIG[t].color
        },
        t
      )),
      /* @__PURE__ */ jsx("span", { style: { width: 1, height: 14, background: "#3F3F46", margin: "0 2px" } }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6B7280", marginRight: 2 }, children: "\u5206\u7C7B" }),
      /* @__PURE__ */ jsx(FilterChip, { active: !category, onClick: () => setCategory(""), label: "\u5168\u90E8", color: "#6B7280" }),
      categories.map((c) => /* @__PURE__ */ jsx(FilterChip, { active: category === c, onClick: () => setCategory(c), label: c, color: CATEGORY_COLORS[c] || "#6B7280" }, c))
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { margin: "0 12px 6px", padding: "4px 8px", borderRadius: 4, background: "#3F3F4622", fontSize: 10, color: "#6B7280", lineHeight: 1.4 }, children: [
      "\u{1F4A1} \u672A\u6807\u6CE8\u7B49\u7EA7\u7684\u63D2\u4EF6\u9ED8\u8BA4\u89C6\u4E3A ",
      /* @__PURE__ */ jsx("strong", { style: { color: "#6B7280" }, children: "Demo" }),
      "\uFF0C\u4EC5\u5DF2\u6807\u6CE8 ",
      /* @__PURE__ */ jsx("span", { style: { color: "#34D399" }, children: "Production" }),
      " \u6216 ",
      /* @__PURE__ */ jsx("span", { style: { color: "#60A5FA" }, children: "Beta" }),
      " \u7684\u63D2\u4EF6\u624D\u7B97\u53EF\u7528"
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "0 12px 12px" }, children: !hasAny ? /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", textAlign: "center" }, children: "\u672A\u627E\u5230\u5339\u914D\u63D2\u4EF6" }) : tierOrder.map((tier) => {
      const list = grouped[tier];
      if (list.length === 0) return null;
      const cfg = TIER_CONFIG[tier];
      return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }, children: [
          /* @__PURE__ */ jsx("span", { style: { color: cfg.color }, children: cfg.label }),
          /* @__PURE__ */ jsxs("span", { style: { color: "#6B7280", fontWeight: 400, marginLeft: 4 }, children: [
            tierLabels[tier],
            " \xB7 ",
            list.length
          ] })
        ] }),
        list.map((p) => /* @__PURE__ */ jsx(
          MarketItem,
          {
            plugin: p,
            tier: resolveTier(p),
            selected: selected?.id === p.id,
            onClick: () => setSelected(p)
          },
          p.id
        ))
      ] }, tier);
    }) }),
    selected && /* @__PURE__ */ jsx(
      DetailPanel,
      {
        plugin: selected,
        tier: resolveTier(selected),
        selectedVersion,
        setSelectedVersion,
        installing,
        installMsg,
        onClose: () => setSelected(null),
        onInstall
      }
    )
  ] });
}
function SourceBar({ sources, activeSourceId, onSwitchSource, onAddSource, onDeleteSource, sourceUsed }) {
  const [adding, setAdding] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceNameDraft, setSourceNameDraft] = useState("");
  const isLocalSource = /^file:\/\//i.test(sourceDraft) || /^[a-zA-Z]:[\\/]/.test(sourceDraft) || sourceDraft.startsWith("\\\\");
  const submitAdd = () => {
    const url = sourceDraft.trim();
    if (!/^https?:\/\//i.test(url)) {
      setAdding(true);
      return;
    }
    onAddSource(sourceNameDraft, url);
    setSourceDraft("");
    setSourceNameDraft("");
    setAdding(false);
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "0 12px 8px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6B7280", marginRight: 2 }, children: "\u6E90" }),
      sources.map((src) => {
        const active = src.id === activeSourceId;
        const isOfficial = src.id === OFFICIAL_SOURCE_ID;
        return /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 3 }, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onSwitchSource(src.id),
              title: src.url || "\u5B98\u65B9\u591A\u955C\u50CF",
              style: {
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 10,
                cursor: "pointer",
                border: `1px solid ${active ? "#3B82F6" : "#3F3F46"}`,
                background: active ? "#3B82F622" : "transparent",
                color: active ? "#3B82F6" : "#8E8E93"
              },
              children: src.name
            }
          ),
          !isOfficial && /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onDeleteSource(src.id),
              title: "\u5220\u9664\u8BE5\u6E90",
              style: { fontSize: 9, padding: "1px 4px", borderRadius: 8, cursor: "pointer", border: "none", background: "transparent", color: "#6B7280" },
              children: "\xD7"
            }
          )
        ] }, src.id);
      }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setAdding((o) => !o),
          title: "\u6DFB\u52A0\u5546\u57CE\u6E90",
          style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, cursor: "pointer", border: "1px dashed #3F3F46", background: "transparent", color: "#6B7280" },
          children: "+ \u6DFB\u52A0\u6E90"
        }
      )
    ] }),
    adding && /* @__PURE__ */ jsxs("div", { style: { margin: "0 12px 8px", padding: 10, borderRadius: 8, background: "#1F1F24", border: "1px solid #3F3F46", display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#B4B4B8", fontWeight: 600 }, children: "\u6DFB\u52A0\u5546\u57CE\u6E90" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: sourceNameDraft,
            onChange: (e) => setSourceNameDraft(e.target.value),
            placeholder: "\u540D\u79F0\uFF08\u53EF\u9009\uFF0C\u5982 \u672C\u5730\u5546\u57CE\uFF09",
            style: { width: "32%", padding: "5px 8px", background: "#25252B", border: "1px solid #3F3F46", borderRadius: 6, color: "#F8F8F8", fontSize: 11, outline: "none" }
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: sourceDraft,
            onChange: (e) => setSourceDraft(e.target.value),
            placeholder: "\u7D22\u5F15 URL\uFF08\u5FC5\u586B\uFF0Chttp/https\uFF09\uFF0C\u5982 http://127.0.0.1:8787/index.json",
            style: { flex: 1, padding: "5px 8px", background: "#25252B", border: "1px solid #3F3F46", borderRadius: 6, color: "#F8F8F8", fontSize: 11, outline: "none", wordBreak: "break-all" }
          }
        ),
        /* @__PURE__ */ jsx("button", { onClick: submitAdd, style: { ...s.btn, padding: "4px 10px" }, children: "\u6DFB\u52A0" }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          setAdding(false);
          setSourceDraft("");
          setSourceNameDraft("");
        }, style: { ...s.miniBtn, padding: "4px 10px" }, children: "\u53D6\u6D88" })
      ] }),
      isLocalSource && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#F59E0B", lineHeight: 1.5 }, children: [
        "\u26A0 \u6D4F\u89C8\u5668/\u9762\u677F\u65E0\u6CD5\u76F4\u63A5 fetch \u672C\u5730\u8DEF\u5F84\uFF08file:// \u6216\u76D8\u7B26\u8DEF\u5F84\uFF09\u3002\u8BF7\u5148\u5728\u5546\u57CE\u76EE\u5F55\u542F\u52A8\u672C\u5730\u9759\u6001\u670D\u52A1\uFF1A",
        /* @__PURE__ */ jsx("code", { style: { color: "#F8F8F8" }, children: "node scripts/serve-market.js D:\\\u4F60\u7684\u5546\u57CE\u76EE\u5F55 8787" }),
        "\uFF0C\u7136\u540E\u586B ",
        /* @__PURE__ */ jsx("code", { style: { color: "#F8F8F8" }, children: "http://127.0.0.1:8787/index.json" }),
        "\u3002"
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", lineHeight: 1.5 }, children: [
        "\u2022 \u672C\u5730\u5546\u57CE\uFF1A\u7D22\u5F15\u91CC\u7684 downloadUrl \u53EF\u5199\u76F8\u5BF9\u8DEF\u5F84\uFF08\u76F8\u5BF9 index.json\uFF09\u6216\u672C\u5730\u7EDD\u5BF9\u8DEF\u5F84\uFF08zip \u6216\u63D2\u4EF6\u76EE\u5F55\uFF1B\u684C\u9762\u7AEF\u76F4\u63A5\u672C\u673A\u5B89\u88C5\uFF0C\u4EC5 Tauri \u751F\u6548\uFF09",
        /* @__PURE__ */ jsx("br", {}),
        "\u2022 \u5B98\u65B9\u6E90\uFF08\u591A\u955C\u50CF raw.githubusercontent \u2192 cdn.jsdelivr\uFF09\u6052\u5728\u5217\u8868\u9996\u9879\uFF0C\u70B9\u51FB\u5373\u56DE",
        /* @__PURE__ */ jsx("br", {}),
        "\u2022 \u5207\u6362\u6E90\u53EA\u52A0\u8F7D\u5F53\u524D\u6E90\u7D22\u5F15\uFF08\u4E0D\u805A\u5408\u591A\u6E90\u63D2\u4EF6\uFF09"
      ] }),
      sourceUsed && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#10B981", wordBreak: "break-all" }, children: [
        "\u5F53\u524D\u6E90\uFF1A",
        sourceUsed
      ] })
    ] })
  ] });
}
function MarketItem({ plugin, tier, selected, onClick }) {
  const cfg = TIER_CONFIG[tier];
  const isDemo = tier === "demo";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      onClick,
      style: {
        display: "flex",
        gap: 10,
        padding: 10,
        borderRadius: 8,
        cursor: "pointer",
        marginBottom: 6,
        border: `1px solid ${selected ? "#3B82F6" : "transparent"}`,
        background: selected ? "#2D2D33" : "#25252B",
        opacity: isDemo ? 0.55 : 1,
        transition: "opacity 0.15s, background 0.15s"
      },
      onMouseEnter: (e) => {
        if (!selected) e.currentTarget.style.background = "#2A2A30";
      },
      onMouseLeave: (e) => {
        if (!selected) e.currentTarget.style.background = "#25252B";
      },
      children: [
        /* @__PURE__ */ jsx("div", { style: {
          width: 32,
          height: 32,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
          marginTop: 2,
          background: cfg.bg,
          color: cfg.color
        }, children: plugin.icon === "BookOpen" ? "\u{1F4D6}" : plugin.icon === "Terminal" ? "\u26A1" : plugin.icon === "Target" ? "\u{1F3AF}" : plugin.icon === "Beaker" ? "\u{1F9EA}" : plugin.icon === "Activity" ? "\u{1F4CA}" : plugin.icon === "GitPullRequest" ? "\u{1F500}" : plugin.icon === "Bot" ? "\u{1F916}" : "\u{1F9E9}" }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 600, color: isDemo ? "#6B7280" : "#F8F8F8" }, children: plugin.name }),
            /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#6B7280" }, children: [
              "v",
              plugin.version
            ] }),
            /* @__PURE__ */ jsx(TierBadge, { tier })
          ] }),
          plugin.description && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: isDemo ? "#6B7280" : "#8E8E93", marginTop: 3, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: plugin.description }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }, children: [
            plugin.category && /* @__PURE__ */ jsx("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, background: (CATEGORY_COLORS[plugin.category] || "#6B7280") + "33", color: CATEGORY_COLORS[plugin.category] || "#6B7280" }, children: plugin.category }),
            (plugin.tags || []).slice(0, 2).map((t) => /* @__PURE__ */ jsx("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#3F3F4633", color: "#6B7280" }, children: t }, t))
          ] })
        ] })
      ]
    }
  );
}
function DetailPanel({ plugin, tier, selectedVersion, setSelectedVersion, installing, installMsg, onClose, onInstall }) {
  const allVersions = useMemo(() => {
    const versions = plugin.versions || [];
    if (!versions.find((v) => v.version === plugin.version)) {
      return [{ version: plugin.version, downloadUrl: plugin.downloadUrl || "", sha256: plugin.sha256 }, ...versions];
    }
    return versions;
  }, [plugin]);
  const currentVersion = selectedVersion || plugin.version;
  return /* @__PURE__ */ jsxs("div", { style: {
    borderTop: "1px solid #3F3F46",
    padding: 12,
    background: "#1F1F24",
    maxHeight: "40%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8
  }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
          /* @__PURE__ */ jsx("span", { style: { fontWeight: 600, fontSize: 14 }, children: plugin.name }),
          /* @__PURE__ */ jsx(TierBadge, { tier })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 2 }, children: [
          plugin.id,
          " \xB7 v",
          plugin.version
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: onClose, style: { background: "none", border: "none", color: "#8E8E93", cursor: "pointer", padding: "2px 6px", fontSize: 14 }, children: "\u2715" })
    ] }),
    plugin.description && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#B4B4B8", lineHeight: 1.5 }, children: plugin.description }),
    plugin.permissions && Object.keys(plugin.permissions).length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#8E8E93", marginBottom: 2 }, children: "\u6743\u9650" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: Object.entries(plugin.permissions).filter(([, v]) => v).map(([k]) => /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#3F3F46", color: "#F8B4B8" }, children: k }, k)) })
    ] }),
    allVersions.length > 1 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx("label", { style: { fontSize: 11, color: "#8E8E93", whiteSpace: "nowrap" }, children: "\u7248\u672C\uFF1A" }),
      /* @__PURE__ */ jsx(
        "select",
        {
          value: currentVersion,
          onChange: (e) => setSelectedVersion(e.target.value),
          style: {
            flex: 1,
            padding: "5px 8px",
            background: "#25252B",
            border: "1px solid #3F3F46",
            borderRadius: 6,
            color: "#F8F8F8",
            fontSize: 12,
            outline: "none",
            cursor: "pointer"
          },
          children: allVersions.map((v) => /* @__PURE__ */ jsxs("option", { value: v.version, children: [
            "v",
            v.version,
            v.version === plugin.version ? " (\u6700\u65B0)" : ""
          ] }, v.version))
        }
      )
    ] }),
    plugin.readme && /* @__PURE__ */ jsx("pre", { style: s.pre, children: plugin.readme }),
    installMsg && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: installMsg.startsWith("\u2713") ? "#10B981" : "#EF4444" }, children: installMsg }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 2 }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onInstall(plugin, "user"),
          disabled: installing === plugin.id,
          style: { ...s.btn, flex: 1, opacity: installing === plugin.id ? 0.6 : 1 },
          children: installing === plugin.id ? "\u5B89\u88C5\u4E2D\u2026" : `\u5B89\u88C5\u5230 User${currentVersion !== plugin.version ? " (v" + currentVersion + ")" : ""}`
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => onInstall(plugin, "project"),
          disabled: installing === plugin.id,
          style: { ...s.btn, opacity: installing === plugin.id ? 0.6 : 1 },
          children: [
            "\u5B89\u88C5\u5230 Project",
            currentVersion !== plugin.version ? " (v" + currentVersion + ")" : ""
          ]
        }
      )
    ] }),
    plugin.downloadUrl && /* @__PURE__ */ jsx("div", { style: { fontSize: 9, color: "#6B7280", wordBreak: "break-all" }, children: currentVersion !== plugin.version ? allVersions.find((v) => v.version === currentVersion)?.downloadUrl || plugin.downloadUrl : plugin.downloadUrl })
  ] });
}
function InstalledView(props) {
  const { installed, loading, error, updates, opLoading, opMsg, onReload, onUninstall, onCheckUpdate, onApplyUpdate, onCheckAll } = props;
  if (loading) return /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93" }, children: "\u8BFB\u53D6\u5DF2\u88C5\u63D2\u4EF6\u4E2D\u2026" });
  if (error) return /* @__PURE__ */ jsxs("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { color: "#EF4444" }, children: [
      "\u8BFB\u53D6\u5931\u8D25\uFF1A",
      error
    ] }),
    /* @__PURE__ */ jsx("button", { onClick: onReload, style: s.btn, children: "\u91CD\u8BD5" })
  ] });
  const external = installed.filter((p) => !p.builtin);
  const builtin = installed.filter((p) => p.builtin);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "10px 12px", display: "flex", gap: 8, borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: onReload, style: { ...s.btn, flex: 1 }, children: "\u21BB \u5237\u65B0" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onCheckAll,
          disabled: external.length === 0,
          style: { ...s.btn, flex: 1, opacity: external.length === 0 ? 0.5 : 1 },
          children: "\u68C0\u67E5\u5168\u90E8\u66F4\u65B0"
        }
      )
    ] }),
    opMsg && /* @__PURE__ */ jsx("div", { style: { padding: "8px 12px", fontSize: 11, color: opMsg.startsWith("\u2713") ? "#10B981" : "#EF4444", borderBottom: "1px solid #3F3F46" }, children: opMsg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 12 }, children: external.length === 0 && builtin.length === 0 ? /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", textAlign: "center" }, children: "\u672A\u53D1\u73B0\u5DF2\u88C5\u63D2\u4EF6" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      external.length > 0 && /* @__PURE__ */ jsxs(SectionLabel, { children: [
        "\u5916\u90E8\u5B89\u88C5\uFF08",
        external.length,
        "\uFF09"
      ] }),
      external.map((p) => /* @__PURE__ */ jsx(
        InstalledCard,
        {
          p,
          updates,
          opLoading,
          onUninstall,
          onCheckUpdate,
          onApplyUpdate
        },
        p.id
      )),
      builtin.length > 0 && /* @__PURE__ */ jsxs(SectionLabel, { children: [
        "\u5185\u7F6E\uFF08",
        builtin.length,
        "\uFF09"
      ] }),
      builtin.map((p) => /* @__PURE__ */ jsxs("div", { style: { padding: 10, marginBottom: 8, borderRadius: 8, background: "#1F1F24", border: "1px solid #2A2A30" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: p.name }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [
            "v",
            p.version
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 4 }, children: [
          p.id,
          " \xB7 \u5185\u7F6E"
        ] })
      ] }, p.id))
    ] }) })
  ] });
}
function InstalledCard({ p, updates, opLoading, onUninstall, onCheckUpdate, onApplyUpdate }) {
  const u = updates[p.id];
  const checking = u?.checking || opLoading === `check-${p.id}`;
  const applying = opLoading === `apply-${p.id}`;
  const uninstalling = opLoading === `uninstall-${p.id}`;
  return /* @__PURE__ */ jsxs("div", { style: { padding: 10, marginBottom: 8, borderRadius: 8, background: "#25252B", border: "1px solid #3F3F46" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: p.name }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [
        "v",
        p.version
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 4, wordBreak: "break-all" }, children: [
      p.id,
      p.source?.kind ? ` \xB7 ${p.source.kind}` : ""
    ] }),
    p.description && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginTop: 4 }, children: p.description }),
    u && !u.checking && /* @__PURE__ */ jsx("div", { style: {
      marginTop: 6,
      fontSize: 11,
      padding: "4px 8px",
      borderRadius: 4,
      background: u.updateAvailable ? "#10B98122" : "#3F3F46",
      color: u.updateAvailable ? "#10B981" : "#8E8E93"
    }, children: u.error ? `\u68C0\u67E5\u5931\u8D25\uFF1A${u.error}` : u.updateAvailable ? `\u2191 \u6709\u66F4\u65B0\uFF1A${u.currentVersion} \u2192 ${u.latestVersion}` : `\u2713 \u5DF2\u662F\u6700\u65B0\uFF08${u.currentVersion}\uFF09` }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onCheckUpdate(p),
          disabled: checking || applying || uninstalling,
          style: { ...s.miniBtn, opacity: checking ? 0.6 : 1 },
          children: checking ? "\u68C0\u67E5\u4E2D\u2026" : "\u68C0\u67E5\u66F4\u65B0"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onApplyUpdate(p),
          disabled: !u?.updateAvailable || applying || uninstalling,
          style: { ...s.miniBtn, background: applying ? "#3B82F644" : "#3B82F622", color: "#3B82F6", borderColor: "#3B82F6", opacity: !u?.updateAvailable || applying ? 0.5 : 1 },
          children: applying ? "\u66F4\u65B0\u4E2D\u2026" : "\u5E94\u7528\u66F4\u65B0"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onUninstall(p),
          disabled: checking || applying || uninstalling,
          style: { ...s.miniBtn, color: "#EF4444", borderColor: "#7F1D1D", opacity: uninstalling ? 0.6 : 1 },
          children: uninstalling ? "\u5378\u8F7D\u4E2D\u2026" : "\u5378\u8F7D"
        }
      )
    ] })
  ] });
}
function TabBtn({ active, onClick, label }) {
  return /* @__PURE__ */ jsx("button", { onClick, style: {
    flex: 1,
    padding: "10px 12px",
    fontSize: 12,
    cursor: "pointer",
    border: "none",
    borderBottom: active ? "2px solid #3B82F6" : "2px solid transparent",
    background: "transparent",
    color: active ? "#F8F8F8" : "#8E8E93",
    fontWeight: active ? 600 : 400
  }, children: label });
}
function FilterChip({ active, onClick, label, color }) {
  return /* @__PURE__ */ jsx("button", { onClick, style: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 10,
    cursor: "pointer",
    border: `1px solid ${active ? color : "#3F3F46"}`,
    background: active ? color + "22" : "transparent",
    color: active ? color : "#8E8E93",
    transition: "background 0.15s, color 0.15s"
  }, children: label });
}
function SectionLabel({ children }) {
  return /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }, children });
}
function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier];
  return /* @__PURE__ */ jsxs("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 4,
    letterSpacing: "0.3px",
    textTransform: "uppercase",
    background: cfg.bg,
    color: cfg.color,
    border: `1px solid ${cfg.border}`
  }, children: [
    /* @__PURE__ */ jsx("span", { style: { width: 5, height: 5, borderRadius: "50%", background: cfg.color } }),
    cfg.label
  ] });
}
export {
  MarketplacePanel as default
};
