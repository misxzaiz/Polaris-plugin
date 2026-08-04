// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function KnowledgePanel({ pluginId, onSendToChat }) {
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [editTags, setEditTags] = useState("");
  const [msg, setMsg] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.knowledge.notes");
      if (raw) setNotes(JSON.parse(raw));
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persist = (next) => {
    setNotes(next);
    localStorage.setItem("polaris.knowledge.notes", JSON.stringify(next));
  };
  const tags = Array.from(new Set(notes.flatMap((n) => n.tags)));
  const filtered = notes.filter(
    (n) => (!query || n.text.toLowerCase().includes(query.toLowerCase())) && (!tag || n.tags.includes(tag))
  );
  const newNote = () => {
    const text = prompt("\u7B14\u8BB0\u5185\u5BB9");
    if (!text) return;
    const tagsStr = prompt("\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF09") || "";
    const note = { id: "k" + Date.now().toString(36), text, tags: tagsStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean), source: "manual", ts: Date.now() };
    persist([note, ...notes]);
    setMsg(`\u2713 \u5DF2\u5B58\u5165 ${note.id}`);
  };
  const select = (n) => {
    setEditing(n);
    setEditText(n.text);
    setEditTags(n.tags.join(", "));
  };
  const saveEdit = () => {
    if (!editing) return;
    persist(notes.map((n) => n.id === editing.id ? { ...n, text: editText, tags: editTags.split(/[,，]/).map((t) => t.trim()).filter(Boolean) } : n));
    setMsg(`\u2713 \u5DF2\u66F4\u65B0 ${editing.id}`);
    setEditing(null);
  };
  const del = (id) => {
    if (!confirm("\u5220\u9664\uFF1F")) return;
    persist(notes.filter((n) => n.id !== id));
    if (editing?.id === id) setEditing(null);
  };
  const askAISearch = () => {
    if (!query) return;
    onSendToChat?.(`\u8BF7\u7528 knowledge-base \u7684 search_notes \u5DE5\u5177\u641C\u7D22\uFF1A"${query}"${tag ? `\uFF0C\u6807\u7B7E ${tag}` : ""}\uFF0C\u5E76\u628A\u7ED3\u679C\u6574\u5408\u8FDB\u4F60\u7684\u56DE\u7B54`);
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u641C\u7D22\u2026", style: { flex: 1, minWidth: 80, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" } }),
      /* @__PURE__ */ jsxs("select", { value: tag, onChange: (e) => setTag(e.target.value), style: { padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11 }, children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8\u6807\u7B7E" }),
        tags.map((t) => /* @__PURE__ */ jsx("option", { value: t, children: t }, t))
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: newNote, style: btnStyle, children: "+" }),
      /* @__PURE__ */ jsx("button", { onClick: askAISearch, disabled: !query, style: { ...btnStyle, opacity: query ? 1 : 0.4 }, children: "AI \u67E5" })
    ] }),
    msg && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 10px" }, children: filtered.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24, fontSize: 11 }, children: "\u6682\u65E0\u6761\u76EE" }) : filtered.map((n) => /* @__PURE__ */ jsxs("div", { onClick: () => select(n), style: { padding: 10, marginBottom: 8, borderRadius: 8, background: "#25252B", border: "1px solid #3F3F46", cursor: "pointer" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: n.id }),
        /* @__PURE__ */ jsx("button", { onClick: (e) => {
          e.stopPropagation();
          del(n.id);
        }, style: { ...btnStyle, padding: "2px 6px", fontSize: 10 }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, marginTop: 4, lineHeight: 1.5 }, children: [
        n.text.slice(0, 100),
        n.text.length > 100 ? "\u2026" : ""
      ] }),
      n.tags.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }, children: n.tags.map((t) => /* @__PURE__ */ jsx("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#3B82F622", color: "#3B82F6" }, children: t }, t)) })
    ] }, n.id)) }),
    editing && /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #3F3F46", padding: 10, background: "#1F1F24" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
          "\u7F16\u8F91 ",
          editing.id
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => setEditing(null), style: { ...btnStyle, padding: "2px 6px" }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsx("textarea", { value: editText, onChange: (e) => setEditText(e.target.value), style: { width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box" } }),
      /* @__PURE__ */ jsx("input", { value: editTags, onChange: (e) => setEditTags(e.target.value), placeholder: "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF09", style: { width: "100%", marginTop: 6, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none", boxSizing: "border-box" } }),
      /* @__PURE__ */ jsx("button", { onClick: saveEdit, style: { ...btnStyle, marginTop: 6 }, children: "\u4FDD\u5B58" })
    ] })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
export {
  KnowledgePanel as default
};
