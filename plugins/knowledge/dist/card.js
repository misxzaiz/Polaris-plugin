// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function KnowledgeCard({ data, onSendToChat }) {
  const d = data || {};
  const results = d.results || [];
  if (results.length === 0) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u672A\u627E\u5230\u5339\u914D\u77E5\u8BC6" });
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        "\u77E5\u8BC6\u68C0\u7D22 \xB7 ",
        results.length,
        " \u6761",
        d.total ? ` (\u5171 ${d.total})` : ""
      ] }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u57FA\u4E8E\u8FD9\u4E9B\u77E5\u8BC6\u6761\u76EE\u56DE\u7B54\u6211\u7684\u95EE\u9898\uFF1A

${results.slice(0, 5).map((r) => r.text.slice(0, 80)).join("\n---\n")}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u7528\u6B64\u56DE\u7B54" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { maxHeight: 280, overflowY: "auto" }, children: results.map((r, i) => /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #2A2A30" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginBottom: 2 }, children: [
        r.id,
        " ",
        r.tags.length > 0 && `\xB7 ${r.tags.map((t) => "#" + t).join(" ")}`
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "#F8F8F8", lineHeight: 1.5 }, children: [
        r.text.slice(0, 150),
        r.text.length > 150 ? "\u2026" : ""
      ] })
    ] }, i)) })
  ] });
}
export {
  KnowledgeCard as default
};
