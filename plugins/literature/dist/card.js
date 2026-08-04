// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function LiteratureCard({ data, onSendToChat }) {
  const d = data || {};
  const p = d.paper;
  if (!p) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u63D0\u53D6\u7ED3\u679C" });
  const fields = [
    ["\u6807\u9898", p.title],
    ["\u4F5C\u8005", p.authors],
    ["\u5E74\u4EFD", p.year],
    ["\u65B9\u6CD5", p.method],
    ["\u6837\u672C", p.sample],
    ["\u7ED3\u8BBA", p.conclusion],
    ["\u5C40\u9650", p.limitation]
  ];
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: "\u8BBA\u6587\u7ED3\u6784\u5316" }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u8BF7\u57FA\u4E8E\u8FD9\u7BC7\u8BBA\u6587\u7684\u63D0\u53D6\u7ED3\u679C\uFF0C\u5E2E\u6211\u5199\u4E00\u6BB5\u7EFC\u8FF0\u6BB5\u843D\uFF1A

\u6807\u9898: ${p.title}
\u65B9\u6CD5: ${p.method}
\u7ED3\u8BBA: ${p.conclusion}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u5199\u7EFC\u8FF0" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { padding: 12 }, children: fields.map(([k, v]) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginBottom: 6, fontSize: 12 }, children: [
      /* @__PURE__ */ jsx("span", { style: { color: "#8E8E93", width: 50, flexShrink: 0 }, children: k }),
      /* @__PURE__ */ jsx("span", { style: { color: v === "\uFF08\u5F85\u8865\uFF09" ? "#6B7280" : "#F8F8F8" }, children: v })
    ] }, k)) })
  ] });
}
export {
  LiteratureCard as default
};
