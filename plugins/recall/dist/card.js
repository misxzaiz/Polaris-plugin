// src/Card.tsx
import { useState, useEffect } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function RecallCard({ data, status, respond, onSendToChat }) {
  const d = data || {};
  const quiz = d.quiz;
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(status === "answered" || status === "declined");
  const [showBack, setShowBack] = useState(false);
  useEffect(() => {
    if (status === "answered" && response) {
      setAnswer(typeof response === "string" ? response : JSON.stringify(response));
      setSubmitted(true);
    }
  }, [status, response]);
  if (!quiz) {
    return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u53EF\u6D4B\u9A8C\u5361\u7247\uFF0C\u6682\u65E0\u5230\u671F\u5185\u5BB9" });
  }
  const submit = () => {
    setSubmitted(true);
    setShowBack(true);
    respond?.({ answer, cardId: quiz.id, correct: quiz.back });
  };
  const decline = () => {
    setSubmitted(true);
    respond?.({ declined: true, cardId: quiz.id });
  };
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "6px 10px", borderBottom: "1px solid #3F3F46", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        "\u6D4B\u9A8C \xB7 ",
        quiz.deck
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#6B7280" }, children: [
        "\u590D\u4E60\u7B2C ",
        quiz.reps + 1,
        " \u6B21"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { padding: 14 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#8E8E93", marginBottom: 6 }, children: "\u95EE\u9898" }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 12 }, children: quiz.front }),
      !submitted ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: answer,
            onChange: (e) => setAnswer(e.target.value),
            placeholder: "\u5728\u6B64\u4F5C\u7B54\u2026",
            style: { width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: [
          /* @__PURE__ */ jsx("button", { onClick: submit, disabled: !answer.trim(), style: { flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: answer.trim() ? "#3B82F6" : "#3F3F46", color: "#fff", fontSize: 12, cursor: answer.trim() ? "pointer" : "not-allowed" }, children: "\u63D0\u4EA4\u7B54\u6848" }),
          /* @__PURE__ */ jsx("button", { onClick: decline, style: { padding: "8px 12px", borderRadius: 6, border: "1px solid #3F3F46", background: "transparent", color: "#8E8E93", fontSize: 12, cursor: "pointer" }, children: "\u8DF3\u8FC7" })
        ] })
      ] }) : showBack ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#8E8E93", marginBottom: 4 }, children: "\u4F60\u7684\u7B54\u6848" }),
        /* @__PURE__ */ jsx("div", { style: { padding: 8, borderRadius: 6, background: "#25252B", fontSize: 12, marginBottom: 10, whiteSpace: "pre-wrap" }, children: answer || "(\u7A7A)" }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#10B981", marginBottom: 4 }, children: "\u6B63\u89E3" }),
        /* @__PURE__ */ jsx("div", { style: { padding: 8, borderRadius: 6, background: "#1F2A1F", border: "1px solid #10B98144", fontSize: 12, color: "#10B981", whiteSpace: "pre-wrap" }, children: quiz.back }),
        onSendToChat && /* @__PURE__ */ jsx("button", { onClick: () => onSendToChat(`\u6211\u521A\u590D\u4E60\u4E86\u8FD9\u5F20\u5361\u7247\uFF0C\u8BF7\u5E2E\u6211\u8BB2\u89E3\uFF1A\u300C${quiz.front}\u300D\u6211\u7684\u7B54\u6848\u662F\uFF1A${answer || "(\u7A7A)"}\uFF0C\u6B63\u89E3\u662F\uFF1A${quiz.back}`), style: { marginTop: 8, padding: "6px 12px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 11, cursor: "pointer" }, children: "\u8BA9 AI \u8BB2\u89E3" })
      ] }) : /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", fontSize: 12 }, children: "\u5DF2\u8DF3\u8FC7" })
    ] })
  ] });
}
export {
  RecallCard as default
};
