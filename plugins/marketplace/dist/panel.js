// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
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
    return await tauriInvoke("plugin_install_remote", {
      sourceUrl: plugin.downloadUrl,
      scope
    });
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
function MarketplacePanel({ pluginId }) {
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(null);
  const [installing, setInstalling] = useState(null);
  const [installMsg, setInstallMsg] = useState(null);
  const loadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(DEFAULT_INDEX, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIndex(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadIndex();
  }, [loadIndex]);
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
  const handleInstall = async (p, scope) => {
    setInstalling(p.id);
    setInstallMsg(null);
    const result = await installPlugin(p, scope);
    setInstallMsg(result.success ? `\u2713 ${p.name} \u5B89\u88C5\u6210\u529F${result.message ? "\uFF1A" + result.message : ""}` : `\u2717 \u5B89\u88C5\u5931\u8D25\uFF1A${result.error ?? "\u672A\u77E5\u9519\u8BEF"}`);
    setInstalling(null);
  };
  if (loading) {
    return /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", fontSize: 13 }, children: "\u52A0\u8F7D\u5546\u57CE\u7D22\u5F15\u4E2D\u2026" });
  }
  if (error) {
    return /* @__PURE__ */ jsxs("div", { style: { padding: 24, display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { color: "#EF4444", fontSize: 13 }, children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        error
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: loadIndex, style: btnStyle, children: "\u91CD\u8BD5" })
    ] });
  }
  const sidebarStyle = {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#1A1A1F",
    color: "#F8F8F8",
    fontSize: 13
  };
  return /* @__PURE__ */ jsxs("div", { style: sidebarStyle, children: [
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
      /* @__PURE__ */ jsx("button", { onClick: loadIndex, title: "\u5237\u65B0\u7D22\u5F15", style: { ...btnStyle, padding: "6px 10px" }, children: "\u21BB" })
    ] }),
    categories.length > 0 && /* @__PURE__ */ jsxs("div", { style: { padding: "0 12px 8px", display: "flex", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(CategoryChip, { active: !category, onClick: () => setCategory(""), label: "\u5168\u90E8" }),
      categories.map((c) => /* @__PURE__ */ jsx(CategoryChip, { active: category === c, onClick: () => setCategory(c), label: c, color: CATEGORY_COLORS[c] }, c))
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "0 12px 12px" }, children: filtered.length === 0 ? /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", textAlign: "center" }, children: "\u672A\u627E\u5230\u5339\u914D\u63D2\u4EF6" }) : filtered.map((p) => /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: () => {
          setSelected(p);
          setInstallMsg(null);
        },
        style: {
          padding: 10,
          marginBottom: 8,
          borderRadius: 8,
          cursor: "pointer",
          background: selected?.id === p.id ? "#2D2D33" : "#25252B",
          border: `1px solid ${selected?.id === p.id ? "#3B82F6" : "#3F3F46"}`,
          transition: "all 0.15s"
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
            p.category && /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: (CATEGORY_COLORS[p.category] || "#6B7280") + "33", color: CATEGORY_COLORS[p.category] || "#6B7280" }, children: p.category }),
            (p.tags || []).slice(0, 3).map((t) => /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#3F3F46", color: "#B4B4B8" }, children: t }, t))
          ] })
        ]
      },
      p.id
    )) }),
    selected && /* @__PURE__ */ jsxs("div", { style: {
      borderTop: "1px solid #3F3F46",
      padding: 12,
      background: "#1F1F24",
      maxHeight: "45%",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }, children: [
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
      selected.readme && /* @__PURE__ */ jsx("pre", { style: { fontSize: 11, color: "#B4B4B8", background: "#25252B", padding: 8, borderRadius: 6, margin: 0, maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap" }, children: selected.readme }),
      installMsg && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: installMsg.startsWith("\u2713") ? "#10B981" : "#EF4444" }, children: installMsg }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 4 }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => handleInstall(selected, "user"),
            disabled: installing === selected.id,
            style: { ...btnStyle, flex: 1, opacity: installing === selected.id ? 0.6 : 1 },
            children: installing === selected.id ? "\u5B89\u88C5\u4E2D\u2026" : "\u5B89\u88C5\u5230 User"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => handleInstall(selected, "project"),
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
var btnStyle = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #3F3F46",
  background: "#2D2D33",
  color: "#F8F8F8",
  fontSize: 12,
  cursor: "pointer"
};
function CategoryChip({ active, onClick, label, color }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 10,
        cursor: "pointer",
        border: `1px solid ${active ? color || "#3B82F6" : "#3F3F46"}`,
        background: active ? (color || "#3B82F6") + "22" : "transparent",
        color: active ? color || "#3B82F6" : "#8E8E93"
      },
      children: label
    }
  );
}
export {
  MarketplacePanel as default
};
