// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function LinkPanel({ pluginId, onSendToChat }) {
  const [links, setLinks] = useState([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [msg, setMsg] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.link.links");
      if (raw) setLinks(JSON.parse(raw));
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persist = (n) => {
    setLinks(n);
    localStorage.setItem("polaris.link.links", JSON.stringify(n));
  };
  const tags = Array.from(new Set(links.flatMap((l) => l.tags)));
  const filtered = links.filter(
    (l) => (!query || (l.url + l.title + l.desc).toLowerCase().includes(query.toLowerCase())) && (!tag || l.tags.includes(tag))
  );
  const add = () => {
    const url = prompt("URL");
    if (!url) return;
    const title = prompt("\u6807\u9898") || url;
    const tagsStr = prompt("\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF09") || "";
    persist([{ id: "l" + Date.now().toString(36), url, title, tags: tagsStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean), desc: "", createdAt: Date.now() }, ...links]);
    setMsg("\u2713 \u5DF2\u6DFB\u52A0");
  };
  const del = (id) => {
    if (confirm("\u5220\u9664\uFF1F")) persist(links.filter((l) => l.id !== id));
  };
  const askAI = () => {
    if (query) onSendToChat?.(`\u8BF7\u7528 link-vault \u7684 search_links \u5DE5\u5177\u641C\u7D22\uFF1A"${query}"`);
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u641C\u7D22\u2026", style: { flex: 1, minWidth: 80, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" } }),
      /* @__PURE__ */ jsxs("select", { value: tag, onChange: (e) => setTag(e.target.value), style: { padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11 }, children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8" }),
        tags.map((t) => /* @__PURE__ */ jsx("option", { value: t, children: t }, t))
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: add, style: btnStyle, children: "+" }),
      /* @__PURE__ */ jsx("button", { onClick: askAI, disabled: !query, style: { ...btnStyle, opacity: query ? 1 : 0.4 }, children: "AI \u67E5" })
    ] }),
    msg && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 12 }, children: filtered.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24, fontSize: 11 }, children: "\u6682\u65E0\u4E66\u7B7E" }) : filtered.map((l) => /* @__PURE__ */ jsxs("div", { style: { padding: 10, marginBottom: 8, borderRadius: 8, background: "#25252B", border: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
        /* @__PURE__ */ jsx("a", { href: l.url, target: "_blank", rel: "noopener", style: { fontSize: 13, fontWeight: 500, color: "#3B82F6", textDecoration: "none" }, children: l.title }),
        /* @__PURE__ */ jsx("button", { onClick: () => del(l.id), style: { ...btnStyle, padding: "2px 6px", fontSize: 10 }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 2, wordBreak: "break-all" }, children: l.url }),
      l.tags.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }, children: l.tags.map((t) => /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#3B82F622", color: "#3B82F6" }, children: t }, t)) })
    ] }, l.id)) })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
export {
  LinkPanel as default
};
