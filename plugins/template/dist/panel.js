// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function TemplatePanel({ pluginId, onSendToChat }) {
  const [templates, setTemplates] = useState([]);
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCat, setEditCat] = useState("");
  const [vars, setVars] = useState({});
  const [rendered, setRendered] = useState("");
  const [msg, setMsg] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.template.templates");
      if (raw) setTemplates(JSON.parse(raw));
      else {
        const seed = [
          { id: "t1", name: "\u62D2\u7EDD\u5408\u4F5C", content: "\u611F\u8C22\u60A8\u8054\u7CFB{{company}}\u3002\u7ECF\u8BC4\u4F30\uFF0C\u76EE\u524D\u6682\u65E0\u6CD5\u63A8\u8FDB\u3002\u795D\u987A\u5229\u3002\n\n{{your_name}}", category: "\u90AE\u4EF6" },
          { id: "t2", name: "\u50AC\u529E\u8FDB\u5EA6", content: "{{name}}\u4F60\u597D\uFF0C{{task}}\u7684\u8FDB\u5EA6\u5982\u4F55\uFF1F", category: "\u6D88\u606F" },
          { id: "t3", name: "\u4F1A\u8BAE\u901A\u77E5", content: "\u4E3B\u9898\uFF1A{{topic}}\n\u65F6\u95F4\uFF1A{{time}}\n\u5730\u70B9\uFF1A{{location}}", category: "\u901A\u77E5" }
        ];
        setTemplates(seed);
        localStorage.setItem("polaris.template.templates", JSON.stringify(seed));
      }
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persist = (next) => {
    setTemplates(next);
    localStorage.setItem("polaris.template.templates", JSON.stringify(next));
  };
  const categories = Array.from(new Set(templates.map((t) => t.category)));
  const filtered = templates.filter((t) => !category || t.category === category);
  const extractVars = (c) => {
    const set = /* @__PURE__ */ new Set();
    const re = /\{\{\s*([\w.]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(c)) !== null) set.add(m[1]);
    return [...set];
  };
  const select = (t) => {
    setSelected(t);
    setEditing(false);
    setEditName(t.name);
    setEditContent(t.content);
    setEditCat(t.category);
    setVars({});
    setRendered("");
  };
  const doRender = () => {
    let out = editContent;
    for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.]/g, "\\.")}\\s*\\}\\}`, "g"), v);
    setRendered(out);
  };
  const saveEdit = () => {
    if (!editName.trim()) {
      setMsg("\u540D\u79F0\u4E0D\u80FD\u7A7A");
      return;
    }
    if (selected) {
      persist(templates.map((t) => t.id === selected.id ? { ...t, name: editName, content: editContent, category: editCat || "general" } : t));
    } else {
      persist([...templates, { id: "t" + Date.now().toString(36), name: editName, content: editContent, category: editCat || "general" }]);
    }
    setMsg("\u2713 \u5DF2\u4FDD\u5B58");
    setEditing(false);
  };
  const del = (id) => {
    if (confirm("\u5220\u9664\uFF1F")) {
      persist(templates.filter((t) => t.id !== id));
      setSelected(null);
    }
  };
  const askAI = () => {
    if (!selected) return;
    onSendToChat?.(`\u8BF7\u7528 template-vault \u7684 render_template \u5DE5\u5177\u6E32\u67D3\u300C${selected.name}\u300D\uFF0C\u53D8\u91CF\uFF1A${JSON.stringify(vars)}`);
  };
  const varList = extractVars(editContent);
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { width: 200, borderRight: "1px solid #3F3F46", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsxs("select", { value: category, onChange: (e) => setCategory(e.target.value), style: { flex: 1, padding: "4px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11 }, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8\u5206\u7C7B" }),
          categories.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          setSelected({ id: "", name: "", content: "", category: "" });
          setEditing(true);
          setEditName("");
          setEditContent("");
          setEditCat("");
        }, style: btnStyle, children: "+" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto" }, children: filtered.map((t) => /* @__PURE__ */ jsxs("div", { onClick: () => select(t), style: { padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid #2A2A30", background: selected?.id === t.id ? "#2D2D33" : "transparent" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, fontWeight: 500 }, children: t.name }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 2 }, children: [
          t.category,
          " \xB7 ",
          extractVars(t.content).length,
          " \u53D8\u91CF"
        ] })
      ] }, t.id)) })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }, children: !selected ? /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8E8E93" }, children: "\u9009\u62E9\u6216\u65B0\u5EFA\u6A21\u677F" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 600, flex: 1 }, children: editing ? "\u7F16\u8F91" : selected.name }),
        !editing && /* @__PURE__ */ jsx("button", { onClick: () => setEditing(true), style: btnStyle, children: "\u7F16\u8F91" }),
        editing && /* @__PURE__ */ jsx("button", { onClick: saveEdit, style: btnStyle, children: "\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx("button", { onClick: () => del(selected.id), style: { ...btnStyle, color: "#EF4444" }, children: "\u5220\u9664" })
      ] }),
      msg && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 10 }, children: editing ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("input", { value: editName, onChange: (e) => setEditName(e.target.value), placeholder: "\u6A21\u677F\u540D", style: { ...inp, width: "100%", boxSizing: "border-box", marginBottom: 6 } }),
        /* @__PURE__ */ jsx("input", { value: editCat, onChange: (e) => setEditCat(e.target.value), placeholder: "\u5206\u7C7B", style: { ...inp, width: "100%", boxSizing: "border-box", marginBottom: 6 } }),
        /* @__PURE__ */ jsx("textarea", { value: editContent, onChange: (e) => setEditContent(e.target.value), placeholder: "\u6A21\u677F\u5185\u5BB9\uFF0C\u7528 {{\u53D8\u91CF}} \u5360\u4F4D", style: { ...inp, width: "100%", minHeight: 120, boxSizing: "border-box", resize: "vertical" } })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("pre", { style: { margin: "0 0 10px", padding: 10, borderRadius: 6, background: "#25252B", fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" }, children: selected.content }),
        varList.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginBottom: 6 }, children: "\u53D8\u91CF\u586B\u5145" }),
          varList.map((v) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#3B82F6", width: 100, fontFamily: "monospace" }, children: "{{" + v + "}}" }),
            /* @__PURE__ */ jsx("input", { value: vars[v] || "", onChange: (e) => setVars((p) => ({ ...p, [v]: e.target.value })), placeholder: `\u503C for ${v}`, style: { ...inp, flex: 1 } })
          ] }, v)),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: [
            /* @__PURE__ */ jsx("button", { onClick: doRender, style: btnStyle, children: "\u672C\u5730\u6E32\u67D3" }),
            /* @__PURE__ */ jsx("button", { onClick: askAI, style: btnStyle, children: "AI \u6E32\u67D3" }),
            rendered && /* @__PURE__ */ jsx("button", { onClick: () => navigator.clipboard?.writeText(rendered), style: btnStyle, children: "\u590D\u5236" })
          ] }),
          rendered && /* @__PURE__ */ jsx("pre", { style: { marginTop: 8, padding: 8, borderRadius: 6, background: "#1F2A1F", border: "1px solid #10B98144", fontSize: 12, color: "#10B981", whiteSpace: "pre-wrap", fontFamily: "monospace" }, children: rendered })
        ] })
      ] }) })
    ] }) })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
var inp = { padding: "6px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" };
export {
  TemplatePanel as default
};
