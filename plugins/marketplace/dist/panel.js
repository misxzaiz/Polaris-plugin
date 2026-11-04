// src/Panel.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
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
function scoreColor(score) {
  if (typeof score !== "number" || score <= 0) return "#6B7280";
  if (score >= 8) return "#34D399";
  if (score >= 5) return "#F5B73D";
  return "#6B7280";
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
    return `${msg}\uFF08\u8FDC\u7A0B\u6A21\u5F0F\u4E0B\u653E\u884C\u67E5\u770B/\u68C0\u67E5\u66F4\u65B0/\u5B89\u88C5\u8FDC\u7A0B\u63D2\u4EF6\uFF1B\u5378\u8F7D/\u672C\u5730\u5B89\u88C5/\u66F4\u65B0\u7B49\u5176\u4F59\u5199\u64CD\u4F5C\u8BF7\u5728\u684C\u9762\u7AEF\u64CD\u4F5C\uFF0C\u6216\u5728 AI \u4F1A\u8BDD\u4E2D\u6267\u884C\uFF09`;
  }
  return msg;
}
async function proxyFetchIndex(url) {
  const res = await getInvoke()("router_dispatch", {
    req: {
      target: "cap.mcp",
      payload: {
        action: "call",
        mcpServerId: "marketplace-server",
        tool: "proxy_fetch",
        arguments: { url }
      }
    }
  });
  if (!res.ok) throw new Error(res.error || "proxy_fetch \u8C03\u5EA6\u5931\u8D25");
  const result = res.result;
  if (result.error) throw new Error(`proxy_fetch: ${result.error}`);
  if (result.isError || !result.resultJson) throw new Error("proxy_fetch \u8FD4\u56DE\u7A7A\u7ED3\u679C\uFF08\u5546\u57CE\u6E90\u4E0D\u53EF\u8FBE\u6216\u8FD4\u56DE\u975E JSON\uFF09");
  const parsed = JSON.parse(result.resultJson);
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.data || !Array.isArray(parsed.data.plugins)) throw new Error("proxy_fetch \u8FD4\u56DE\u7684\u7D22\u5F15\u683C\u5F0F\u65E0\u6548");
  return parsed.data;
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
var SORT_OPTIONS = [
  { value: "default", label: "\u9ED8\u8BA4" },
  { value: "tier-desc", label: "\u{1F527} \u529F\u80FD\u6700\u9AD8" },
  { value: "tier-asc", label: "\u{1F527} \u529F\u80FD\u6700\u4F4E" },
  { value: "usage-desc", label: "\u2B50 \u4F7F\u7528\u6700\u9AD8" },
  { value: "usage-asc", label: "\u2B50 \u4F7F\u7528\u6700\u4F4E" },
  { value: "updated-desc", label: "\u6700\u65B0\u66F4\u65B0" },
  { value: "updated-asc", label: "\u6700\u65E9\u66F4\u65B0" },
  { value: "created-desc", label: "\u6700\u65B0\u521B\u5EFA" },
  { value: "created-asc", label: "\u6700\u65E9\u521B\u5EFA" }
];
function sortByScore(list, field, dir) {
  const sign = dir === "desc" ? -1 : 1;
  const withScore = list.filter((p) => typeof p[field] === "number" && p[field] > 0);
  const without = list.filter((p) => !(typeof p[field] === "number" && p[field] > 0));
  withScore.sort((a, b) => {
    const diff = (b[field] - a[field]) * sign;
    if (diff !== 0) return diff;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });
  without.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return [...withScore, ...without];
}
function sortWithinTier(list, sort) {
  if (sort === "default") return list;
  if (sort === "tier-desc" || sort === "tier-asc") {
    return sortByScore(list, "tier", sort === "tier-desc" ? "desc" : "asc");
  }
  if (sort === "usage-desc" || sort === "usage-asc") {
    return sortByScore(list, "usageTier", sort === "usage-desc" ? "desc" : "asc");
  }
  const [field, dir] = sort.split("-");
  const key = field === "updated" ? "updatedAt" : "createdAt";
  const timeOf = (p) => {
    const v = p[key] || (field === "updated" ? p.createdAt : null);
    if (!v) return null;
    const t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  };
  const withTime = list.filter((p) => timeOf(p) !== null);
  const without = list.filter((p) => timeOf(p) === null);
  withTime.sort((a, b) => {
    const ta = timeOf(a), tb = timeOf(b);
    return dir === "desc" ? tb - ta : ta - tb;
  });
  return [...withTime, ...without];
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function MarketplacePanel({ pluginId: _pluginId }) {
  const [index, setIndex] = useState(null);
  const [mLoading, setMLoading] = useState(true);
  const [mError, setMError] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [installedFilter, setInstalledFilter] = useState(false);
  const [sort, setSort] = useState("default");
  const [flatView, setFlatView] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
          let data;
          try {
            const res = await fetchWithTimeout(source);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();
          } catch (directErr) {
            try {
              data = await proxyFetchIndex(source);
            } catch {
              throw directErr;
            }
          }
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
    setDetailOpen(false);
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
    setDetailOpen(false);
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
    loadInstalled();
  }, [loadInstalled]);
  const refreshAfterOp = useCallback(async () => {
    await loadInstalled();
    setUpdates({});
  }, [loadInstalled]);
  const isInstalled = useCallback((p) => installed.find((i) => i.id === p.id), [installed]);
  const openDetail = useCallback((p) => {
    setSelected(p);
    setDetailOpen(true);
    setSelectedVersion("");
    setInstallMsg(null);
  }, []);
  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);
  const handleInstall = async (p, scope) => {
    setInstalling(p.id);
    setInstallMsg(null);
    const version = selectedVersion && selectedVersion !== p.version ? selectedVersion : void 0;
    const r = await installPlugin(p, scope, version);
    setInstallMsg(r.success ? `\u2713 ${p.name} ${version ? "v" + version : ""} \u5B89\u88C5\u6210\u529F${r.message ? "\uFF1A" + r.message : ""}` : `\u2717 \u5B89\u88C5\u5931\u8D25\uFF1A${r.error ?? "\u672A\u77E5\u9519\u8BEF"}`);
    setInstalling(null);
    if (r.success) await loadInstalled();
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
  const installedCount = installed.filter((p) => !p.builtin).length;
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13, position: "relative", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid #3F3F46", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { style: {
        fontSize: 12,
        fontWeight: 600,
        padding: "6px 14px",
        borderRadius: 8,
        background: "#3B82F6",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 5
      }, children: [
        "\u{1F9E9} \u63D2\u4EF6\u5E02\u573A",
        /* @__PURE__ */ jsx("span", { style: { fontSize: 9, background: "rgba(255,255,255,.2)", padding: "1px 6px", borderRadius: 8 }, children: index?.plugins?.length ?? 0 })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      installedFilter && installedCount > 0 && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleCheckAll,
          title: "\u68C0\u67E5\u5168\u90E8\u5DF2\u88C5\u63D2\u4EF6\u66F4\u65B0",
          style: { ...s.btn, padding: "6px 10px", fontSize: 11, minHeight: 32 },
          children: "\u68C0\u67E5\u5168\u90E8\u66F4\u65B0"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => void loadIndex(),
          title: "\u5237\u65B0\u7D22\u5F15",
          style: { width: 32, height: 32, borderRadius: 8, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
          children: "\u21BB"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      MarketView,
      {
        index,
        loading: mLoading,
        error: mError,
        query,
        setQuery,
        category,
        setCategory,
        installedFilter,
        setInstalledFilter,
        installedCount,
        sort,
        setSort,
        flatView,
        setFlatView,
        selected,
        detailOpen,
        openDetail,
        closeDetail,
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
        onDeleteSource: deleteSource,
        installed,
        isInstalled,
        updates,
        opLoading,
        opMsg,
        onUninstall: handleUninstall,
        onCheckUpdate: handleCheckUpdate,
        onApplyUpdate: handleApplyUpdate
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
    installedFilter,
    setInstalledFilter,
    installedCount,
    sort,
    setSort,
    flatView,
    setFlatView,
    selected,
    detailOpen,
    openDetail,
    closeDetail,
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
    onDeleteSource,
    installed,
    isInstalled,
    updates,
    opLoading,
    opMsg,
    onUninstall,
    onCheckUpdate,
    onApplyUpdate
  } = props;
  const plugins = index?.plugins ?? [];
  const categories = Array.from(new Set(plugins.map((p) => p.category).filter(Boolean)));
  const filtered = useMemo(() => {
    return plugins.filter((p) => {
      if (category && p.category !== category) return false;
      if (installedFilter && !installed.some((i) => i.id === p.id)) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = [p.id, p.name, p.description, (p.tags || []).join(" ")].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plugins, category, installedFilter, query, installed]);
  const groupedByCategory = useMemo(() => {
    const groups = {};
    for (const p of filtered) {
      const key = p.category || "\u672A\u5206\u7C7B";
      (groups[key] || (groups[key] = [])).push(p);
    }
    for (const k of Object.keys(groups)) groups[k] = sortWithinTier(groups[k], sort);
    return groups;
  }, [filtered, sort]);
  const flatList = useMemo(() => sortWithinTier(filtered, sort), [filtered, sort]);
  const categoryOrder = Object.keys(groupedByCategory).sort((a, b) => a.localeCompare(b));
  const hasAny = flatView ? flatList.length > 0 : categoryOrder.some((c) => groupedByCategory[c].length > 0);
  const showTime = sort.startsWith("updated") || sort.startsWith("created");
  const timeField = sort.startsWith("updated") ? "updated" : "created";
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
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: "\u641C\u7D22\u63D2\u4EF6\u540D\u79F0\u3001ID\u3001\u6807\u7B7E\u2026",
          style: { flex: 1, minWidth: 0, padding: "7px 8px", background: "#25252B", border: "1px solid #3F3F46", borderRadius: 6, color: "#F8F8F8", fontSize: 12, outline: "none" }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setFlatView(true),
          title: "\u5E73\u94FA\uFF08\u4E0D\u5206\u7EC4\uFF09",
          style: {
            fontSize: 10,
            padding: "5px 10px",
            borderRadius: 6,
            cursor: "pointer",
            whiteSpace: "nowrap",
            minHeight: 32,
            border: `1px solid ${flatView ? "#3B82F6" : "#3F3F46"}`,
            background: flatView ? "#3B82F622" : "#2D2D33",
            color: flatView ? "#3B82F6" : "#8E8E93"
          },
          children: "\u5E73\u94FA"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setFlatView(false),
          title: "\u6309\u5206\u7C7B\u5206\u7EC4",
          style: {
            fontSize: 10,
            padding: "5px 10px",
            borderRadius: 6,
            cursor: "pointer",
            whiteSpace: "nowrap",
            minHeight: 32,
            border: `1px solid ${!flatView ? "#3B82F6" : "#3F3F46"}`,
            background: !flatView ? "#3B82F622" : "#2D2D33",
            color: !flatView ? "#3B82F6" : "#8E8E93"
          },
          children: "\u5206\u7EC4"
        }
      )
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
    /* @__PURE__ */ jsxs("div", { style: { padding: "0 10px 6px", display: "flex", gap: 4, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 9, color: "#6B7280", marginRight: 1, flexShrink: 0 }, children: "\u72B6\u6001" }),
      /* @__PURE__ */ jsx(FilterChip, { active: !installedFilter, onClick: () => setInstalledFilter(false), label: "\u5168\u90E8", color: "#6B7280" }),
      /* @__PURE__ */ jsx(FilterChip, { active: installedFilter, onClick: () => setInstalledFilter(true), label: `\u5DF2\u88C5 ${installedCount}`, color: "#34D399" }),
      /* @__PURE__ */ jsx("span", { style: { width: 1, height: 12, background: "#3F3F46", flexShrink: 0, margin: "0 2px" } }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 9, color: "#6B7280", marginRight: 1, flexShrink: 0 }, children: "\u5206\u7C7B" }),
      /* @__PURE__ */ jsx(FilterChip, { active: !category, onClick: () => setCategory(""), label: "\u5168\u90E8", color: "#6B7280" }),
      categories.map((c) => /* @__PURE__ */ jsx(FilterChip, { active: category === c, onClick: () => setCategory(c), label: c, color: CATEGORY_COLORS[c] || "#6B7280" }, c))
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { padding: "2px 10px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 4, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6B7280" }, children: "\u6392\u5E8F" }),
        /* @__PURE__ */ jsx(
          "select",
          {
            value: sort,
            onChange: (e) => setSort(e.target.value),
            style: {
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 8,
              cursor: "pointer",
              border: `1px solid ${sort === "default" ? "#3F3F46" : "#3B82F6"}`,
              background: sort === "default" ? "#25252B" : "#3B82F622",
              color: sort === "default" ? "#B4B4B8" : "#3B82F6",
              outline: "none"
            },
            children: SORT_OPTIONS.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#6B7280" }, children: [
        filtered.length,
        " \u4E2A",
        installedFilter ? "\uFF08\u5DF2\u88C5\uFF09" : ""
      ] })
    ] }),
    opMsg && /* @__PURE__ */ jsx("div", { style: { padding: "6px 10px", fontSize: 11, color: opMsg.startsWith("\u2713") ? "#10B981" : "#EF4444", borderBottom: "1px solid #3F3F46", flexShrink: 0 }, children: opMsg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "0 10px 12px" }, children: !hasAny ? /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", textAlign: "center" }, children: "\u672A\u627E\u5230\u5339\u914D\u63D2\u4EF6" }) : flatView ? flatList.map((p) => /* @__PURE__ */ jsx(
      MarketItem,
      {
        plugin: p,
        installedInfo: isInstalled(p),
        updateInfo: updates[p.id],
        selected: selected?.id === p.id,
        onClick: () => openDetail(p),
        showTime,
        timeField
      },
      p.id
    )) : categoryOrder.map((cat) => {
      const list = groupedByCategory[cat];
      if (list.length === 0) return null;
      const color = CATEGORY_COLORS[cat] || "#6B7280";
      return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }, children: [
          /* @__PURE__ */ jsx("span", { style: { color }, children: cat }),
          /* @__PURE__ */ jsxs("span", { style: { color: "#6B7280", fontWeight: 400, marginLeft: 4 }, children: [
            "\xB7 ",
            list.length
          ] })
        ] }),
        list.map((p) => /* @__PURE__ */ jsx(
          MarketItem,
          {
            plugin: p,
            installedInfo: isInstalled(p),
            updateInfo: updates[p.id],
            selected: selected?.id === p.id,
            onClick: () => openDetail(p),
            showTime,
            timeField
          },
          p.id
        ))
      ] }, cat);
    }) }),
    selected && /* @__PURE__ */ jsx(
      DetailPanel,
      {
        plugin: selected,
        installedInfo: isInstalled(selected),
        updateInfo: updates[selected.id],
        open: detailOpen,
        selectedVersion,
        setSelectedVersion,
        installing,
        installMsg,
        opLoading,
        onClose: closeDetail,
        onInstall,
        onUninstall,
        onCheckUpdate,
        onApplyUpdate
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
    /* @__PURE__ */ jsxs("div", { style: { padding: "0 10px 8px", display: "flex", gap: 6, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#6B7280", marginRight: 2, flexShrink: 0 }, children: "\u6E90" }),
      sources.map((src) => {
        const active = src.id === activeSourceId;
        const isOfficial = src.id === OFFICIAL_SOURCE_ID;
        return /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }, children: [
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
                minHeight: 28,
                border: `1px solid ${active ? "#3B82F6" : "#3F3F46"}`,
                background: active ? "#3B82F622" : "transparent",
                color: active ? "#3B82F6" : "#8E8E93",
                whiteSpace: "nowrap"
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
          style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, cursor: "pointer", border: "1px dashed #3F3F46", background: "transparent", color: "#6B7280", whiteSpace: "nowrap", flexShrink: 0 },
          children: "+ \u6DFB\u52A0\u6E90"
        }
      )
    ] }),
    adding && /* @__PURE__ */ jsxs("div", { style: { margin: "0 10px 8px", padding: 10, borderRadius: 8, background: "#1F1F24", border: "1px solid #3F3F46", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#B4B4B8", fontWeight: 600 }, children: "\u6DFB\u52A0\u5546\u57CE\u6E90" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: sourceNameDraft,
            onChange: (e) => setSourceNameDraft(e.target.value),
            placeholder: "\u540D\u79F0\uFF08\u53EF\u9009\uFF0C\u5982 \u672C\u5730\u5546\u57CE\uFF09",
            style: { width: "32%", minWidth: 120, padding: "5px 8px", background: "#25252B", border: "1px solid #3F3F46", borderRadius: 6, color: "#F8F8F8", fontSize: 11, outline: "none" }
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: sourceDraft,
            onChange: (e) => setSourceDraft(e.target.value),
            placeholder: "\u7D22\u5F15 URL\uFF08\u5FC5\u586B\uFF0Chttp/https\uFF09\uFF0C\u5982 http://127.0.0.1:8787/index.json",
            style: { flex: 1, minWidth: 200, padding: "5px 8px", background: "#25252B", border: "1px solid #3F3F46", borderRadius: 6, color: "#F8F8F8", fontSize: 11, outline: "none", wordBreak: "break-all" }
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
function MarketItem({ plugin, installedInfo, updateInfo, selected, onClick, showTime, timeField }) {
  const timeVal = showTime ? timeField === "updated" ? plugin.updatedAt || plugin.createdAt : plugin.createdAt : void 0;
  const hasUpdate = updateInfo?.updateAvailable;
  const renderStatusBadge = () => {
    if (installedInfo) {
      if (hasUpdate) {
        return /* @__PURE__ */ jsxs("span", { style: {
          fontSize: 9,
          padding: "1px 6px",
          borderRadius: 4,
          flexShrink: 0,
          fontWeight: 600,
          background: "#F5B73D22",
          color: "#F5B73D",
          border: "1px solid #F5B73D44"
        }, children: [
          "\u2191 \u53EF\u66F4\u65B0\u81F3 v",
          plugin.version
        ] });
      }
      return /* @__PURE__ */ jsxs("span", { style: {
        fontSize: 9,
        padding: "1px 6px",
        borderRadius: 4,
        flexShrink: 0,
        fontWeight: 600,
        background: "#34D39922",
        color: "#34D399",
        border: "1px solid #34D39944"
      }, children: [
        "\u2713 \u5DF2\u88C5 v",
        installedInfo.version
      ] });
    }
    return null;
  };
  const tierScore = plugin.tier;
  const showTier = typeof tierScore === "number" && tierScore > 0;
  const usageScore = plugin.usageTier;
  const showUsage = typeof usageScore === "number" && usageScore > 0;
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
        minHeight: 48,
        marginBottom: 6,
        border: `1px solid ${selected ? "#3B82F6" : "transparent"}`,
        background: selected ? "#2D2D33" : "#25252B",
        transition: "background 0.15s"
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
          background: "#3B82F622",
          color: "#3B82F6"
        }, children: plugin.icon === "BookOpen" ? "\u{1F4D6}" : plugin.icon === "Terminal" ? "\u26A1" : plugin.icon === "Target" ? "\u{1F3AF}" : plugin.icon === "Beaker" ? "\u{1F9EA}" : plugin.icon === "Activity" ? "\u{1F4CA}" : plugin.icon === "GitPullRequest" ? "\u{1F500}" : plugin.icon === "Bot" ? "\u{1F916}" : "\u{1F9E9}" }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 600, color: "#F8F8F8" }, children: plugin.name }),
            /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#6B7280" }, children: [
              "v",
              plugin.version
            ] }),
            renderStatusBadge(),
            /* @__PURE__ */ jsxs("span", { style: { marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }, children: [
              showTier && /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, fontWeight: 700, color: scoreColor(tierScore) }, children: [
                "\u{1F527}",
                tierScore
              ] }),
              showUsage && /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, fontWeight: 700, color: scoreColor(usageScore) }, children: [
                "\u2B50",
                usageScore
              ] })
            ] })
          ] }),
          plugin.description && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginTop: 3, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: plugin.description }),
          showTime && (timeVal ? /* @__PURE__ */ jsxs("div", { style: { fontSize: 9, color: "#6B7280", marginTop: 4 }, children: [
            timeField === "updated" ? "\u66F4\u65B0\u4E8E" : "\u521B\u5EFA\u4E8E",
            " ",
            fmtDate(timeVal)
          ] }) : /* @__PURE__ */ jsx("div", { style: { fontSize: 9, color: "#EF4444", fontStyle: "italic", marginTop: 4 }, children: "\u24D8 \u65F6\u95F4\u672A\u77E5\uFF08\u7D22\u5F15\u7F3A\u5B57\u6BB5\uFF0C\u515C\u5E95\u5F52\u5165\u672B\u5C3E\uFF09" })),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }, children: [
            plugin.category && /* @__PURE__ */ jsx("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, background: (CATEGORY_COLORS[plugin.category] || "#6B7280") + "33", color: CATEGORY_COLORS[plugin.category] || "#6B7280" }, children: plugin.category }),
            (plugin.tags || []).slice(0, 2).map((t) => /* @__PURE__ */ jsx("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#3F3F4633", color: "#6B7280" }, children: t }, t))
          ] })
        ] })
      ]
    }
  );
}
function DetailPanel({ plugin, installedInfo, updateInfo, open, selectedVersion, setSelectedVersion, installing, installMsg, opLoading, onClose, onInstall, onUninstall, onCheckUpdate, onApplyUpdate }) {
  const allVersions = useMemo(() => {
    const versions = plugin.versions || [];
    if (!versions.find((v) => v.version === plugin.version)) {
      return [{ version: plugin.version, downloadUrl: plugin.downloadUrl || "", sha256: plugin.sha256 }, ...versions];
    }
    return versions;
  }, [plugin]);
  const currentVersion = selectedVersion || plugin.version;
  const isInstalled = !!installedInfo;
  const hasUpdate = updateInfo?.updateAvailable;
  const checking = updateInfo?.checking || opLoading === `check-${plugin.id}`;
  const applying = opLoading === `apply-${plugin.id}`;
  const uninstalling = opLoading === `uninstall-${plugin.id}`;
  const tierScore = plugin.tier;
  const showTier = typeof tierScore === "number" && tierScore > 0;
  const usageScore = plugin.usageTier;
  const showUsage = typeof usageScore === "number" && usageScore > 0;
  const permList = plugin.permissions ? Object.entries(plugin.permissions).filter(([, v]) => v).map(([k]) => k) : [];
  const sourceDesc = installedInfo?.source?.kind ? installedInfo.source.kind === "user" ? "User \u5B89\u88C5" : installedInfo.source.kind === "project" ? "Project \u5B89\u88C5" : installedInfo.source.kind : installedInfo?.builtin ? "\u5185\u7F6E" : "\u2014";
  return /* @__PURE__ */ jsxs("div", { style: {
    position: "absolute",
    inset: 0,
    zIndex: 20,
    background: "#1C1C24",
    transform: open ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: 10, borderBottom: "1px solid #3F3F46", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onClose,
          title: "\u8FD4\u56DE",
          style: { width: 32, height: 32, borderRadius: 8, border: "none", background: "#2D2D33", color: "#B4B4B8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
          children: "\u2039"
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: plugin.name }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280" }, children: [
          plugin.id,
          " \xB7 v",
          plugin.version
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, alignItems: "flex-start" }, children: [
        /* @__PURE__ */ jsx("div", { style: {
          width: 48,
          height: 48,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          flexShrink: 0,
          background: "#3B82F622",
          color: "#3B82F6"
        }, children: plugin.icon === "BookOpen" ? "\u{1F4D6}" : plugin.icon === "Terminal" ? "\u26A1" : plugin.icon === "Target" ? "\u{1F3AF}" : plugin.icon === "Beaker" ? "\u{1F9EA}" : plugin.icon === "Activity" ? "\u{1F4CA}" : plugin.icon === "GitPullRequest" ? "\u{1F500}" : plugin.icon === "Bot" ? "\u{1F916}" : "\u{1F9E9}" }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 15, fontWeight: 700 }, children: plugin.name }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4, marginTop: 4, alignItems: "center", flexWrap: "wrap" }, children: [
            isInstalled && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 600, background: "#34D39922", color: "#34D399", border: "1px solid #34D39944" }, children: [
                "\u5DF2\u88C5 v",
                installedInfo.version
              ] }),
              hasUpdate && /* @__PURE__ */ jsxs("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 600, background: "#F5B73D22", color: "#F5B73D", border: "1px solid #F5B73D44" }, children: [
                "\u2191 \u53EF\u66F4\u65B0\u81F3 v",
                plugin.version
              ] })
            ] }),
            showTier && /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, fontWeight: 700, color: scoreColor(tierScore) }, children: [
              "\u{1F527} \u529F\u80FD ",
              tierScore,
              "/10"
            ] }),
            showUsage && /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, fontWeight: 700, color: scoreColor(usageScore) }, children: [
              "\u2B50 \u4F7F\u7528 ",
              usageScore,
              "/10"
            ] })
          ] })
        ] })
      ] }),
      plugin.description && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#B4B4B8", lineHeight: 1.6 }, children: plugin.description }),
      /* @__PURE__ */ jsxs("div", { style: { border: "1px solid #3F3F46", borderRadius: 8, overflow: "hidden" }, children: [
        /* @__PURE__ */ jsx(InfoRow, { k: "ID", v: plugin.id }),
        /* @__PURE__ */ jsx(InfoRow, { k: "\u6700\u65B0\u7248\u672C", v: `v${plugin.version}` }),
        isInstalled && /* @__PURE__ */ jsx(InfoRow, { k: "\u5F53\u524D\u7248\u672C", v: `v${installedInfo.version}${hasUpdate ? `\uFF08\u6700\u65B0 v${plugin.version}\uFF09` : ""}` }),
        isInstalled && /* @__PURE__ */ jsx(InfoRow, { k: "\u6765\u6E90", v: sourceDesc }),
        /* @__PURE__ */ jsx(InfoRow, { k: "\u5206\u7C7B", v: plugin.category || "\u2014" }),
        showTier && /* @__PURE__ */ jsx(InfoRow, { k: "\u{1F527} \u529F\u80FD\u8BC4\u5206", v: `${tierScore}/10` }),
        showUsage && /* @__PURE__ */ jsx(InfoRow, { k: "\u2B50 \u4F7F\u7528\u8BC4\u5206", v: `${usageScore}/10` }),
        /* @__PURE__ */ jsx(InfoRow, { k: "\u521B\u5EFA\u65F6\u95F4", v: plugin.createdAt ? fmtDate(plugin.createdAt) : "\uFF08\u672A\u8BB0\u5F55\uFF09" }),
        /* @__PURE__ */ jsx(InfoRow, { k: "\u6700\u540E\u66F4\u65B0", v: plugin.updatedAt ? fmtDate(plugin.updatedAt) : "\uFF08\u672A\u8BB0\u5F55\uFF09" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", fontSize: 10, borderBottom: "none", gap: 10 }, children: [
          /* @__PURE__ */ jsx("span", { style: { color: "#6B7280", flexShrink: 0 }, children: "\u6743\u9650" }),
          /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }, children: permList.length > 0 ? permList.map((k) => /* @__PURE__ */ jsx("span", { style: { fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#F0616D1A", color: "#F0616D" }, children: k }, k)) : /* @__PURE__ */ jsx("span", { style: { fontSize: 9, color: "#6B7280" }, children: "\u65E0\u7279\u6B8A\u6743\u9650" }) })
        ] })
      ] }),
      !isInstalled && allVersions.length > 1 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
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
      (installMsg || updateInfo && !updateInfo.checking) && /* @__PURE__ */ jsx("div", { style: {
        fontSize: 11,
        padding: "6px 8px",
        borderRadius: 4,
        lineHeight: 1.5,
        background: installMsg || updateInfo?.error || updateInfo?.updateAvailable ? installMsg?.startsWith("\u2713") || updateInfo?.updateAvailable ? "#10B98122" : "#EF444422" : "#3F3F46",
        color: installMsg ? installMsg.startsWith("\u2713") ? "#10B981" : "#EF4444" : updateInfo?.error ? "#EF4444" : updateInfo?.updateAvailable ? "#10B981" : "#8E8E93"
      }, children: installMsg || (updateInfo?.error ? `\u68C0\u67E5\u5931\u8D25\uFF1A${updateInfo.error}` : updateInfo?.updateAvailable ? `\u2191 \u6709\u66F4\u65B0\uFF1A${updateInfo.currentVersion} \u2192 ${updateInfo.latestVersion}` : `\u2713 \u5DF2\u662F\u6700\u65B0\uFF08${updateInfo?.currentVersion}\uFF09`) }),
      isInstalled ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 16 }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onCheckUpdate(installedInfo),
            disabled: checking || applying || uninstalling,
            style: { ...s.btn, flex: 1, minWidth: 96, minHeight: 40, opacity: checking ? 0.6 : 1 },
            children: checking ? "\u68C0\u67E5\u4E2D\u2026" : "\u68C0\u67E5\u66F4\u65B0"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onApplyUpdate(installedInfo),
            disabled: !hasUpdate || applying || uninstalling,
            style: { ...s.btn, flex: 1, minWidth: 96, minHeight: 40, background: applying ? "#3B82F644" : "#3B82F622", color: "#3B82F6", borderColor: "#3B82F6", opacity: !hasUpdate || applying ? 0.5 : 1, fontWeight: 600 },
            children: applying ? "\u66F4\u65B0\u4E2D\u2026" : "\u2191 \u5E94\u7528\u66F4\u65B0"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onUninstall(installedInfo),
            disabled: checking || applying || uninstalling,
            style: { ...s.btn, flex: 1, minWidth: 96, minHeight: 40, color: "#F0616D", borderColor: "#7F1D1D", opacity: uninstalling ? 0.6 : 1 },
            children: uninstalling ? "\u5378\u8F7D\u4E2D\u2026" : "\u5378\u8F7D"
          }
        )
      ] }) : /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 16 }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onInstall(plugin, "user"),
            disabled: installing === plugin.id,
            style: { ...s.btn, flex: 1, minWidth: 96, minHeight: 40, background: "#3B82F6", borderColor: "#3B82F6", color: "#fff", fontWeight: 600, opacity: installing === plugin.id ? 0.6 : 1 },
            children: installing === plugin.id ? "\u5B89\u88C5\u4E2D\u2026" : `\u2B07 \u5B89\u88C5\u5230 User${currentVersion !== plugin.version ? " (v" + currentVersion + ")" : ""}`
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: () => onInstall(plugin, "project"),
            disabled: installing === plugin.id,
            style: { ...s.btn, flex: 1, minWidth: 96, minHeight: 40, opacity: installing === plugin.id ? 0.6 : 1 },
            children: [
              "\u5B89\u88C5\u5230 Project",
              currentVersion !== plugin.version ? " (v" + currentVersion + ")" : ""
            ]
          }
        )
      ] }),
      !isInstalled && plugin.downloadUrl && /* @__PURE__ */ jsx("div", { style: { fontSize: 9, color: "#6B7280", wordBreak: "break-all", lineHeight: 1.4 }, children: currentVersion !== plugin.version ? allVersions.find((v) => v.version === currentVersion)?.downloadUrl || plugin.downloadUrl : plugin.downloadUrl })
    ] })
  ] });
}
function InfoRow({ k, v }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", fontSize: 10, borderBottom: "1px solid #3F3F46", gap: 10 }, children: [
    /* @__PURE__ */ jsx("span", { style: { color: "#6B7280", flexShrink: 0 }, children: k }),
    /* @__PURE__ */ jsx("span", { style: { color: "#B4B4B8", textAlign: "right", wordBreak: "break-all" }, children: v })
  ] });
}
function FilterChip({ active, onClick, label, color }) {
  return /* @__PURE__ */ jsx("button", { onClick, style: {
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 12,
    cursor: "pointer",
    minHeight: 28,
    border: `1px solid ${active ? color : "#3F3F46"}`,
    background: active ? color + "22" : "transparent",
    color: active ? color : "#8E8E93",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "background 0.15s, color 0.15s"
  }, children: label });
}
export {
  MarketplacePanel as default
};
