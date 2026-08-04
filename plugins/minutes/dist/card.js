// src/Card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function MinutesCard({ data, onSendToChat }) {
  const d = data || {};
  if (!d.markdown) {
    return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u7ED3\u6784\u5316\u5185\u5BB9" });
  }
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        d.template || "\u7EAA\u8981",
        " \xB7 ",
        d.sections?.length || 0,
        " \u8282"
      ] }),
      onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u8BF7\u57FA\u4E8E\u4EE5\u4E0B\u7EAA\u8981\u7EE7\u7EED\u5B8C\u5584\uFF0C\u8865\u5145\u7F3A\u5931\u7684\u8D1F\u8D23\u4EBA\u4E0E\u622A\u6B62\u65E5\u671F\uFF1A

${d.markdown}`), style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" }, children: "\u5B8C\u5584" })
    ] }),
    d.actions && d.actions.length > 0 && /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", background: "#F59E0B11" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#F59E0B", marginBottom: 4 }, children: [
        "\u5F85\u529E (",
        d.actions.length,
        ")"
      ] }),
      d.actions.map((a, i) => /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#B4B4B8", marginBottom: 2 }, children: [
        "\u2610 ",
        a.task,
        a.owner ? ` <span style="color:#3B82F6">@${a.owner}</span>` : "",
        a.deadline ? ` \u23F0${a.deadline}` : ""
      ] }, i))
    ] }),
    /* @__PURE__ */ jsx("div", { style: { padding: 12, overflow: "auto", maxHeight: 300 }, children: /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontSize: 12, color: "#F8F8F8", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }, children: d.markdown }) }),
    /* @__PURE__ */ jsxs("details", { style: { borderTop: "1px solid #3F3F46", padding: "6px 10px" }, children: [
      /* @__PURE__ */ jsx("summary", { style: { cursor: "pointer", fontSize: 10, color: "#6B7280" }, children: "\u5206\u8282" }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 4, fontSize: 11, color: "#8E8E93" }, children: d.sections?.join(" \xB7 ") })
    ] })
  ] });
}
export {
  MinutesCard as default
};
