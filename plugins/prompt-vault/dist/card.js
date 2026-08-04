// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function PromptVaultCard({ data, onSendToChat }) {
  const d = data || {};
  if (!d.rendered) {
    return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u6E32\u67D3\u7ED3\u679C" });
  }
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        "\u6E32\u67D3\u7ED3\u679C",
        d.version ? ` \xB7 v${d.version}` : "",
        d.missing && d.missing.length > 0 && /* @__PURE__ */ jsxs("span", { style: { color: "#F59E0B", marginLeft: 6 }, children: [
          "\u26A0 \u7F3A ",
          d.missing.length,
          " \u53D8\u91CF"
        ] })
      ] }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u8FD9\u4E2A prompt \u6E32\u67D3\u7ED3\u679C\u5982\u4F55\uFF1F\u80FD\u5426\u4F18\u5316\u6A21\u677F\uFF1F

${d.rendered}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u4F18\u5316" })
    ] }),
    d.missing && d.missing.length > 0 && /* @__PURE__ */ jsxs("div", { style: { padding: "6px 10px", borderBottom: "1px solid #3F3F46", background: "#F59E0B11", fontSize: 10, color: "#F59E0B" }, children: [
      "\u672A\u63D0\u4F9B: ",
      d.missing.join(", ")
    ] }),
    /* @__PURE__ */ jsx("div", { style: { padding: 12, maxHeight: 300, overflow: "auto" }, children: /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontSize: 12, color: "#10B981", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }, children: d.rendered }) }),
    d.vars && d.vars.length > 0 && /* @__PURE__ */ jsxs("details", { style: { borderTop: "1px solid #3F3F46", padding: "6px 10px" }, children: [
      /* @__PURE__ */ jsxs("summary", { style: { cursor: "pointer", fontSize: 10, color: "#6B7280" }, children: [
        "\u53D8\u91CF (",
        d.vars.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 4, fontSize: 10, color: "#3B82F6", fontFamily: "monospace" }, children: d.vars.map((v) => "{{" + v + "}}").join("  ") })
    ] })
  ] });
}
export {
  PromptVaultCard as default
};
