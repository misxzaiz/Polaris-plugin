// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function CheatsheetPanel({ pluginId, onSendToChat }) {
  const [commands, setCommands] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null);
  const [editCmd, setEditCmd] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editEx, setEditEx] = useState("");
  const [msg, setMsg] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.cheatsheet.commands");
      if (raw) setCommands(JSON.parse(raw));
      else setCommands([]);
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persist = (next) => {
    setCommands(next);
    localStorage.setItem("polaris.cheatsheet.commands", JSON.stringify(next));
  };
  const categories = Array.from(new Set(commands.map((c) => c.category)));
  const filtered = commands.filter(
    (c) => (!category || c.category === category) && (!query || (c.cmd + " " + c.desc + " " + c.example).toLowerCase().includes(query.toLowerCase()))
  );
  const newCmd = () => {
    setEditing({ id: "", cmd: "", desc: "", category: "", example: "" });
    setEditCmd("");
    setEditDesc("");
    setEditCat("");
    setEditEx("");
  };
  const edit = (c) => {
    setEditing(c);
    setEditCmd(c.cmd);
    setEditDesc(c.desc);
    setEditCat(c.category);
    setEditEx(c.example);
  };
  const saveEdit = () => {
    if (!editCmd.trim()) {
      setMsg("\u547D\u4EE4\u4E0D\u80FD\u7A7A");
      return;
    }
    if (editing?.id) {
      persist(commands.map((c) => c.id === editing.id ? { ...c, cmd: editCmd, desc: editDesc, category: editCat || "general", example: editEx } : c));
    } else {
      persist([...commands, { id: "c" + Date.now().toString(36), cmd: editCmd, desc: editDesc, category: editCat || "general", example: editEx }]);
    }
    setMsg("\u2713 \u5DF2\u4FDD\u5B58");
    setEditing(null);
  };
  const del = (id) => {
    if (confirm("\u5220\u9664\uFF1F")) persist(commands.filter((c) => c.id !== id));
  };
  const askAI = () => {
    if (!query) return;
    onSendToChat?.(`\u8BF7\u7528 cheatsheet \u7684 search_commands \u5DE5\u5177\u641C\u7D22\uFF1A"${query}"\uFF0C\u5E76\u7528\u7ED3\u679C\u56DE\u7B54\u600E\u4E48\u7528`);
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { width: 130, borderRight: "1px solid #3F3F46", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsx("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", fontSize: 11, color: "#8E8E93" }, children: "\u5206\u7C7B" }),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflowY: "auto" }, children: [
        /* @__PURE__ */ jsxs("div", { onClick: () => setCategory(""), style: { padding: "6px 10px", cursor: "pointer", fontSize: 11, background: !category ? "#2D2D33" : "transparent", color: !category ? "#F8F8F8" : "#8E8E93" }, children: [
          "\u5168\u90E8 (",
          commands.length,
          ")"
        ] }),
        categories.map((c) => /* @__PURE__ */ jsxs("div", { onClick: () => setCategory(c), style: { padding: "6px 10px", cursor: "pointer", fontSize: 11, background: category === c ? "#2D2D33" : "transparent", color: category === c ? "#F8F8F8" : "#8E8E93" }, children: [
          c,
          " (",
          commands.filter((x) => x.category === c).length,
          ")"
        ] }, c))
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u641C\u7D22\u547D\u4EE4\u2026", style: { flex: 1, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" } }),
        /* @__PURE__ */ jsx("button", { onClick: newCmd, style: btnStyle, children: "+" }),
        /* @__PURE__ */ jsx("button", { onClick: askAI, disabled: !query, style: { ...btnStyle, opacity: query ? 1 : 0.4 }, children: "AI \u67E5" })
      ] }),
      msg && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 10px" }, children: filtered.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24, fontSize: 11 }, children: "\u6682\u65E0\u547D\u4EE4\uFF0C\u70B9 + \u6DFB\u52A0" }) : filtered.map((c) => /* @__PURE__ */ jsxs("div", { onClick: () => edit(c), style: { padding: 10, marginBottom: 8, borderRadius: 8, background: "#25252B", border: "1px solid #3F3F46", cursor: "pointer" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
          /* @__PURE__ */ jsx("code", { style: { fontSize: 12, color: "#3B82F6", fontFamily: "ui-monospace, monospace" }, children: c.cmd }),
          /* @__PURE__ */ jsx("button", { onClick: (e) => {
            e.stopPropagation();
            del(c.id);
          }, style: { ...btnStyle, padding: "2px 6px", fontSize: 10 }, children: "\u2715" })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#B4B4B8", marginTop: 4 }, children: c.desc }),
        c.example && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 4, fontFamily: "monospace" }, children: [
          "\u4F8B: ",
          c.example
        ] }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 9, color: "#8E8E93", marginTop: 4, display: "inline-block" }, children: c.category })
      ] }, c.id)) })
    ] }),
    editing && /* @__PURE__ */ jsxs("div", { style: { width: 260, borderLeft: "1px solid #3F3F46", padding: 10, display: "flex", flexDirection: "column", gap: 6, background: "#1F1F24" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: editing.id || "\u65B0\u5EFA" }),
        /* @__PURE__ */ jsx("button", { onClick: () => setEditing(null), style: { ...btnStyle, padding: "2px 6px" }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsx("input", { value: editCmd, onChange: (e) => setEditCmd(e.target.value), placeholder: "\u547D\u4EE4", style: inp }),
      /* @__PURE__ */ jsx("input", { value: editCat, onChange: (e) => setEditCat(e.target.value), placeholder: "\u5206\u7C7B", style: inp }),
      /* @__PURE__ */ jsx("textarea", { value: editDesc, onChange: (e) => setEditDesc(e.target.value), placeholder: "\u8BF4\u660E", style: { ...inp, minHeight: 50, resize: "vertical" } }),
      /* @__PURE__ */ jsx("input", { value: editEx, onChange: (e) => setEditEx(e.target.value), placeholder: "\u793A\u4F8B", style: inp }),
      /* @__PURE__ */ jsx("button", { onClick: saveEdit, style: btnStyle, children: "\u4FDD\u5B58" })
    ] })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
var inp = { padding: "6px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" };
export {
  CheatsheetPanel as default
};
