// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function AgentTraceCard({ data, onSendToChat }) {
  const d = data || {};
  const traces = d.traces || [];
  if (traces.length === 0) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u8FFD\u8E2A\u8BB0\u5F55" });
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        "\u8C03\u7528\u8FFD\u8E2A \xB7 ",
        traces.length,
        " \u6761",
        d.total ? ` (\u5171 ${d.total})` : ""
      ] }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u8BF7\u5206\u6790\u8FD9\u4E9B\u5DE5\u5177\u8C03\u7528\u7684\u6A21\u5F0F\uFF0C\u627E\u51FA\u5F02\u5E38\u6216\u4F18\u5316\u70B9\uFF1A

${traces.slice(0, 5).map((t) => `[${t.tool}] ${t.ms}ms ${t.error ? "\u2717" : "\u2713"}`).join("\n")}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u5206\u6790" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { maxHeight: 300, overflowY: "auto" }, children: traces.map((t, i) => /* @__PURE__ */ jsxs("div", { style: { padding: "6px 10px", borderBottom: "1px solid #2A2A30", fontSize: 11, fontFamily: "monospace" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsxs("span", { style: { color: "#F8F8F8" }, children: [
          new Date(t.ts).toLocaleTimeString(),
          " ",
          t.tool
        ] }),
        /* @__PURE__ */ jsxs("span", { style: { color: t.error ? "#EF4444" : "#10B981" }, children: [
          t.error ? "\u2717" : "\u2713",
          " ",
          t.ms,
          "ms"
        ] })
      ] }),
      t.error && /* @__PURE__ */ jsx("div", { style: { color: "#EF4444", marginTop: 2, fontSize: 10 }, children: t.error }),
      !t.error && t.result && /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", marginTop: 2, fontSize: 10 }, children: t.result.slice(0, 80) })
    ] }, i)) })
  ] });
}
export {
  AgentTraceCard as default
};
