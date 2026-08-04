// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function JsonxCard({ data, onSendToChat }) {
  const d = data || {};
  const results = d.results || [];
  if (results.length === 0) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u672A\u627E\u5230\u5339\u914D" });
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        "JSON \u641C\u7D22 \xB7 ",
        results.length,
        " \u9879"
      ] }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u8BF7\u5206\u6790\u8FD9\u4E9B JSON \u8DEF\u5F84\u7684\u542B\u4E49\uFF1A

${results.map((r) => `${r.path} = ${r.value}`).join("\n")}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u5206\u6790" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { maxHeight: 300, overflowY: "auto" }, children: results.map((r, i) => /* @__PURE__ */ jsxs("div", { style: { padding: "6px 10px", borderBottom: "1px solid #2A2A30", fontFamily: "monospace", fontSize: 11 }, children: [
      /* @__PURE__ */ jsx("div", { style: { color: "#3B82F6" }, children: r.path }),
      /* @__PURE__ */ jsx("div", { style: { color: "#10B981", marginTop: 2 }, children: typeof r.value === "string" ? r.value.slice(0, 80) : JSON.stringify(r.value).slice(0, 80) })
    ] }, i)) })
  ] });
}
export {
  JsonxCard as default
};
