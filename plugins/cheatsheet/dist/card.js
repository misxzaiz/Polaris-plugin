// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function CheatsheetCard({ data, onSendToChat }) {
  const d = data || {};
  const results = d.results || [];
  if (results.length === 0) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u672A\u627E\u5230\u5339\u914D\u547D\u4EE4" });
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        "\u547D\u4EE4\u901F\u67E5 \xB7 ",
        results.length,
        " \u6761",
        d.total ? ` (\u5171 ${d.total})` : ""
      ] }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u8BF7\u8BE6\u7EC6\u89E3\u91CA\u8FD9\u4E9B\u547D\u4EE4\u7684\u7528\u6CD5\uFF1A

${results.map((r) => r.cmd).join("\n")}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u8BE6\u89E3" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { maxHeight: 300, overflowY: "auto" }, children: results.map((r, i) => /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #2A2A30" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("code", { style: { fontSize: 12, color: "#3B82F6", fontFamily: "ui-monospace, monospace" }, children: r.cmd }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#3F3F46", color: "#8E8E93" }, children: r.category })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#B4B4B8", marginTop: 2 }, children: r.desc }),
      r.example && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 2, fontFamily: "monospace" }, children: [
        "\u4F8B: ",
        r.example
      ] })
    ] }, i)) })
  ] });
}
export {
  CheatsheetCard as default
};
