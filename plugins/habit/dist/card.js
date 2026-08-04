// src/Card.tsx
import { useState, useEffect } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function HabitCard({ data, status, respond, onSendToChat }) {
  const d = data || {};
  const due = d.dueHabits || [];
  const [done, setDone] = useState(/* @__PURE__ */ new Set());
  const [submitted, setSubmitted] = useState(status === "answered" || status === "declined");
  useEffect(() => {
    if (status === "answered" && response) setSubmitted(true);
  }, [status, response]);
  if (due.length === 0) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u6682\u65E0\u5230\u671F\u4E60\u60EF" });
  const toggle = (id) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
  };
  const submit = () => {
    setSubmitted(true);
    respond?.({ completed: [...done], declined: due.filter((h) => !done.has(h.id)).map((h) => h.id) });
  };
  const decline = () => {
    setSubmitted(true);
    respond?.({ declined: true, all: due.map((h) => h.id) });
  };
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsx("div", { style: { padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#F59E0B" }, children: [
      "\u23F0 \u4E60\u60EF\u6253\u5361\u63D0\u9192 \xB7 ",
      due.length,
      " \u9879\u5230\u671F"
    ] }) }),
    /* @__PURE__ */ jsx("div", { style: { padding: 12 }, children: !submitted ? /* @__PURE__ */ jsxs(Fragment, { children: [
      due.map((h) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, borderRadius: 6, background: done.has(h.id) ? "#10B98122" : "#25252B", border: `1px solid ${done.has(h.id) ? "#10B981" : "#3F3F46"}`, cursor: "pointer" }, onClick: () => toggle(h.id), children: [
        /* @__PURE__ */ jsx("div", { style: { width: 18, height: 18, borderRadius: 4, border: `2px solid ${done.has(h.id) ? "#10B981" : "#6B7280"}`, background: done.has(h.id) ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }, children: done.has(h.id) ? "\u2713" : "" }),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 13 }, children: h.name }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [
            "\u8FDE\u7EED ",
            h.streak,
            " ",
            h.frequency === "daily" ? "\u5929" : "\u5468"
          ] })
        ] })
      ] }, h.id)),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: [
        /* @__PURE__ */ jsxs("button", { onClick: submit, style: { flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: done.size > 0 ? "#10B981" : "#3F3F46", color: "#fff", fontSize: 12, cursor: done.size > 0 ? "pointer" : "not-allowed" }, children: [
          "\u63D0\u4EA4\u6253\u5361 (",
          done.size,
          ")"
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: decline, style: { padding: "8px 12px", borderRadius: 6, border: "1px solid #3F3F46", background: "transparent", color: "#8E8E93", fontSize: 12, cursor: "pointer" }, children: "\u8DF3\u8FC7" })
      ] })
    ] }) : /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: done.size > 0 ? "#10B981" : "#8E8E93" }, children: done.size > 0 ? `\u2713 \u5DF2\u6253\u5361 ${done.size} \u9879\uFF1A${due.filter((h) => done.has(h.id)).map((h) => h.name).join("\u3001")}` : "\u5DF2\u8DF3\u8FC7" }) })
  ] });
}
export {
  HabitCard as default
};
