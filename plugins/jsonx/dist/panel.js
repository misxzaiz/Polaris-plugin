// src/Panel.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function JsonxPanel({ pluginId, onSendToChat }) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const parse = () => {
    try {
      setParsed(JSON.parse(input));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParsed(null);
    }
  };
  const copyPath = (path) => {
    navigator.clipboard?.writeText(path);
  };
  const askAI = () => {
    if (!input.trim()) return;
    onSendToChat?.(`\u8BF7\u7528 jsonx \u7684 extract_paths \u5DE5\u5177\u5206\u6790\u8FD9\u4E2A JSON \u7684\u7ED3\u6784\uFF1A

${input}`);
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsx("button", { onClick: parse, style: btnStyle, children: "\u89E3\u6790" }),
      /* @__PURE__ */ jsx("button", { onClick: askAI, disabled: !input.trim(), style: { ...btnStyle, opacity: input.trim() ? 1 : 0.4 }, children: "AI \u63D0\u8DEF\u5F84" })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { style: { padding: "4px 10px", color: "#EF4444", fontSize: 11 }, children: [
      "\u2717 ",
      error
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: input,
          onChange: (e) => setInput(e.target.value),
          placeholder: '\u7C98\u8D34 JSON\u2026{"key":"value"}',
          spellCheck: false,
          style: { height: 120, padding: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#25252B", color: "#F8F8F8", border: "none", borderBottom: "1px solid #3F3F46", resize: "none", outline: "none", boxSizing: "border-box" }
        }
      ),
      parsed !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { style: { padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: /* @__PURE__ */ jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u641C\u7D22\u952E/\u503C\u2026", style: { width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none", boxSizing: "border-box" } }) }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 10 }, children: /* @__PURE__ */ jsx(TreeNode, { data: parsed, path: "$", search, onCopy: copyPath, depth: 0 }) })
      ] })
    ] })
  ] });
}
function TreeNode({ data, path, search, onCopy, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const isArr = Array.isArray(data);
  const isObj = data !== null && typeof data === "object" && !isArr;
  if (data === null) return /* @__PURE__ */ jsx("div", { style: { paddingLeft: depth * 14, color: "#6B7280" }, children: "null" });
  if (typeof data !== "object") {
    const v = JSON.stringify(data);
    if (search && !v.toLowerCase().includes(search.toLowerCase()) && !path.toLowerCase().includes(search.toLowerCase())) return null;
    return /* @__PURE__ */ jsxs("div", { style: { paddingLeft: depth * 14, display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ jsxs("span", { style: { color: "#3B82F6", fontFamily: "monospace", fontSize: 12 }, children: [
        path.split(".").pop(),
        ":"
      ] }),
      /* @__PURE__ */ jsx("span", { style: { color: typeof data === "string" ? "#10B981" : typeof data === "number" ? "#F59E0B" : "#8B5CF6", fontFamily: "monospace", fontSize: 12 }, children: v }),
      /* @__PURE__ */ jsx("button", { onClick: () => onCopy(path), style: { fontSize: 9, padding: "1px 4px", border: "1px solid #3F3F46", background: "transparent", color: "#6B7280", cursor: "pointer" }, children: "copy" })
    ] });
  }
  const entries = isArr ? data.map((v, i) => [i, v]) : Object.entries(data);
  const preview = JSON.stringify(data).slice(0, 50);
  if (search && !path.toLowerCase().includes(search.toLowerCase()) && !preview.toLowerCase().includes(search.toLowerCase())) {
    const hasMatch = entries.some(([k, v]) => String(k).toLowerCase().includes(search.toLowerCase()) || JSON.stringify(v).toLowerCase().includes(search.toLowerCase()));
    if (!hasMatch) return null;
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { paddingLeft: depth * 14, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }, onClick: () => setOpen(!open), children: [
      /* @__PURE__ */ jsx("span", { style: { color: "#6B7280", fontSize: 10 }, children: open ? "\u25BC" : "\u25B6" }),
      /* @__PURE__ */ jsxs("span", { style: { color: "#3B82F6", fontFamily: "monospace", fontSize: 12 }, children: [
        path.split(".").pop(),
        isArr ? "[]" : ""
      ] }),
      !open && /* @__PURE__ */ jsxs("span", { style: { color: "#6B7280", fontSize: 10 }, children: [
        entries.length,
        " \u9879"
      ] }),
      /* @__PURE__ */ jsx("button", { onClick: (e) => {
        e.stopPropagation();
        onCopy(path);
      }, style: { fontSize: 9, padding: "1px 4px", border: "1px solid #3F3F46", background: "transparent", color: "#6B7280", cursor: "pointer" }, children: "copy" })
    ] }),
    open && entries.map(([k, v]) => /* @__PURE__ */ jsx(TreeNode, { data: v, path: `${path}${isArr ? `[${k}]` : (path === "$" ? "" : ".") + k}`, search, onCopy, depth: depth + 1 }, String(k)))
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
export {
  JsonxPanel as default
};
