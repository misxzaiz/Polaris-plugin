// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var DEFAULT_INDEX = "https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/index.json";
async function tauriInvoke(cmd, args = {}) {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals?.invoke) {
    throw new Error("Tauri invoke \u4E0D\u53EF\u7528\uFF08\u975E Tauri \u73AF\u5883\u6216\u672A\u6388\u6743\uFF09");
  }
  return internals.invoke(cmd, args);
}
async function installPlugin(plugin, scope) {
  if (!plugin.downloadUrl) return { success: false, error: "\u8BE5\u63D2\u4EF6\u672A\u63D0\u4F9B downloadUrl" };
  try {
    return await tauriInvoke("plugin_install_remote", { sourceUrl: plugin.downloadUrl, scope });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function discoverInstalled() {
  try {
    const res = await tauriInvoke("plugin_discover", {});
    return Array.isArray(res.plugins) ? res.plugins : [];
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}
async function uninstallPlugin(installPath) {
  try {
    return await tauriInvoke("plugin_uninstall_local", { installPath });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function checkUpdate(installPath) {
  try {
    const r = await tauriInvoke("plugin_check_update", { installPath });
    return { ...r, pluginId: r.pluginId };
  } catch (e) {
    return { pluginId: "", currentVersion: "", updateAvailable: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function applyUpdate(installPath) {
  try {
    return await tauriInvoke("plugin_apply_update", { installPath });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var CATEGORY_COLORS = {
  utility: "#3B82F6",
  mcp: "#8B5CF6",
  panel: "#10B981",
  media: "#EC4899",
  dev: "#F59E0B",
  productivity: "#06B6D4",
  integration: "#6366F1"
};
function MarketplacePanel({ pluginId: _pluginId }) {
  const [tab, setTab] = useState("market");
  const [index, setIndex] = useState(null);
  const [mLoading, setMLoading] = useState(true);
  const [mError, setMError] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(null);
  const [installing, setInstalling] = useState(null);
  const [installMsg, setInstallMsg] = useState(null);
  const [installed, setInstalled] = useState([]);
  const [iLoading, setILoading] = useState(false);
  const [iError, setIError] = useState(null);
  const [updates, setUpdates] = useState({});
  const [opLoading, setOpLoading] = useState(null);
  const [opMsg, setOpMsg] = useState(null);
  const loadIndex = useCallback(async () => {
    setMLoading(true);
    setMError(null);
    try {
      const res = await fetch(DEFAULT_INDEX, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIndex(await res.json());
    } catch (e) {
      setMError(e instanceof Error ? e.message : String(e));
    } finally {
      setMLoading(false);
    }
  }, []);
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
    const r = await installPlugin(p, scope);
    setInstallMsg(r.success ? `\u2713 ${p.name} \u5B89\u88C5\u6210\u529F${r.message ? "\uFF1A" + r.message : ""}` : `\u2717 \u5B89\u88C5\u5931\u8D25\uFF1A${r.error ?? "\u672A\u77E5\u9519\u8BEF"}`);
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
        selected,
        setSelected: (p) => {
          setSelected(p);
          setInstallMsg(null);
        },
        installing,
        installMsg,
        onInstall: handleInstall,
        onReload: loadIndex
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
    selected,
    setSelected,
    installing,
    installMsg,
    onInstall,
    onReload
  } = props;
  if (loading) return /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93" }, children: "\u52A0\u8F7D\u5546\u57CE\u7D22\u5F15\u4E2D\u2026" });
  if (error) return /* @__PURE__ */ jsxs("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { color: "#EF4444" }, children: [
      "\u52A0\u8F7D\u5931\u8D25\uFF1A",
      error
    ] }),
    /* @__PURE__ */ jsx("button", { onClick: onReload, style: btnStyle, children: "\u91CD\u8BD5" })
  ] });
  const plugins = index?.plugins ?? [];
  const categories = Array.from(new Set(plugins.map((p) => p.category).filter(Boolean)));
  const filtered = plugins.filter((p) => {
    if (category && p.category !== category) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = [p.id, p.name, p.description, (p.tags || []).join(" ")].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
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
      /* @__PURE__ */ jsx("button", { onClick: onReload, title: "\u5237\u65B0\u7D22\u5F15", style: { ...btnStyle, padding: "6px 10px" }, children: "\u21BB" })
    ] }),
    categories.length > 0 && /* @__PURE__ */ jsxs("div", { style: { padding: "0 12px 8px", display: "flex", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(CategoryChip, { active: !category, onClick: () => setCategory(""), label: "\u5168\u90E8" }),
      categories.map((c) => /* @__PURE__ */ jsx(CategoryChip, { active: category === c, onClick: () => setCategory(c), label: c, color: CATEGORY_COLORS[c] }, c))
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "0 12px 12px" }, children: filtered.length === 0 ? /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", textAlign: "center" }, children: "\u672A\u627E\u5230\u5339\u914D\u63D2\u4EF6" }) : filtered.map((p) => /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: () => setSelected(p),
        style: {
          padding: 10,
          marginBottom: 8,
          borderRadius: 8,
          cursor: "pointer",
          background: selected?.id === p.id ? "#2D2D33" : "#25252B",
          border: `1px solid ${selected?.id === p.id ? "#3B82F6" : "#3F3F46"}`
        },
        children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: p.name }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [
              "v",
              p.version
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginTop: 4, lineHeight: 1.4 }, children: p.description || "\u2014" }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }, children: [
            p.category && /* @__PURE__ */ jsx("span", { style: tagStyle(CATEGORY_COLORS[p.category] || "#6B7280"), children: p.category }),
            (p.tags || []).slice(0, 3).map((t) => /* @__PURE__ */ jsx("span", { style: tagStyle("#6B7280"), children: t }, t))
          ] })
        ]
      },
      p.id
    )) }),
    selected && /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #3F3F46", padding: 12, background: "#1F1F24", maxHeight: "45%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: 14 }, children: selected.name }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [
            selected.id,
            " \xB7 v",
            selected.version
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setSelected(null), style: { ...btnStyle, padding: "2px 8px" }, children: "\u2715" })
      ] }),
      selected.description && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#B4B4B8", lineHeight: 1.5 }, children: selected.description }),
      selected.permissions && Object.keys(selected.permissions).length > 0 && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#8E8E93", marginBottom: 2 }, children: "\u6743\u9650" }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" }, children: Object.entries(selected.permissions).filter(([, v]) => v).map(([k]) => /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#3F3F46", color: "#F8B4B8" }, children: k }, k)) })
      ] }),
      selected.readme && /* @__PURE__ */ jsx("pre", { style: preStyle, children: selected.readme }),
      installMsg && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: installMsg.startsWith("\u2713") ? "#10B981" : "#EF4444" }, children: installMsg }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 4 }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onInstall(selected, "user"),
            disabled: installing === selected.id,
            style: { ...btnStyle, flex: 1, opacity: installing === selected.id ? 0.6 : 1 },
            children: installing === selected.id ? "\u5B89\u88C5\u4E2D\u2026" : "\u5B89\u88C5\u5230 User"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onInstall(selected, "project"),
            disabled: installing === selected.id,
            style: { ...btnStyle, opacity: installing === selected.id ? 0.6 : 1 },
            children: "\u5B89\u88C5\u5230 Project"
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 9, color: "#6B7280", wordBreak: "break-all" }, children: selected.downloadUrl })
    ] })
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
    /* @__PURE__ */ jsx("button", { onClick: onReload, style: btnStyle, children: "\u91CD\u8BD5" })
  ] });
  const external = installed.filter((p) => !p.builtin);
  const builtin = installed.filter((p) => p.builtin);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "10px 12px", display: "flex", gap: 8, borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: onReload, style: { ...btnStyle, flex: 1 }, children: "\u21BB \u5237\u65B0" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onCheckAll,
          disabled: external.length === 0,
          style: { ...btnStyle, flex: 1, opacity: external.length === 0 ? 0.5 : 1 },
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
          style: { ...miniBtn, opacity: checking ? 0.6 : 1 },
          children: checking ? "\u68C0\u67E5\u4E2D\u2026" : "\u68C0\u67E5\u66F4\u65B0"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onApplyUpdate(p),
          disabled: !u?.updateAvailable || applying || uninstalling,
          style: { ...miniBtn, background: applying ? "#3B82F644" : "#3B82F622", color: "#3B82F6", borderColor: "#3B82F6", opacity: !u?.updateAvailable || applying ? 0.5 : 1 },
          children: applying ? "\u66F4\u65B0\u4E2D\u2026" : "\u5E94\u7528\u66F4\u65B0"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onUninstall(p),
          disabled: checking || applying || uninstalling,
          style: { ...miniBtn, color: "#EF4444", borderColor: "#7F1D1D", opacity: uninstalling ? 0.6 : 1 },
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
function CategoryChip({ active, onClick, label, color }) {
  return /* @__PURE__ */ jsx("button", { onClick, style: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 10,
    cursor: "pointer",
    border: `1px solid ${active ? color || "#3B82F6" : "#3F3F46"}`,
    background: active ? (color || "#3B82F6") + "22" : "transparent",
    color: active ? color || "#3B82F6" : "#8E8E93"
  }, children: label });
}
function SectionLabel({ children }) {
  return /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }, children });
}
var btnStyle = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #3F3F46",
  background: "#2D2D33",
  color: "#F8F8F8",
  fontSize: 12,
  cursor: "pointer"
};
var miniBtn = {
  padding: "4px 10px",
  borderRadius: 5,
  border: "1px solid #3F3F46",
  background: "#2D2D33",
  color: "#B4B4B8",
  fontSize: 11,
  cursor: "pointer"
};
function tagStyle(color) {
  return { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: color + "33", color };
}
var preStyle = {
  fontSize: 11,
  color: "#B4B4B8",
  background: "#25252B",
  padding: 8,
  borderRadius: 6,
  margin: 0,
  maxHeight: 120,
  overflow: "auto",
  whiteSpace: "pre-wrap"
};
export {
  MarketplacePanel as default
};
