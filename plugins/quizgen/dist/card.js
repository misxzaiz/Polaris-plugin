// src/Card.tsx
import { useState, useEffect } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function QuizGenCard({ data, status, respond }) {
  const d = data || {};
  const questions = d.questions || [];
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(status === "answered" || status === "declined");
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (status === "answered" && response) setResult(response);
  }, [status, response]);
  if (questions.length === 0) return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u9898\u76EE" });
  const q = questions[current];
  const isLast = current === questions.length - 1;
  const submit = () => {
    setSubmitted(true);
    respond?.({ answers, questions });
  };
  const decline = () => {
    setSubmitted(true);
    respond?.({ declined: true });
  };
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
      "\u6D4B\u9A8C \xB7 ",
      current + 1,
      "/",
      questions.length,
      d.quizType ? ` \xB7 ${d.quizType === "mc" ? "\u9009\u62E9\u9898" : "\u586B\u7A7A\u9898"}` : ""
    ] }) }),
    !submitted ? /* @__PURE__ */ jsxs("div", { style: { padding: 14 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 500, marginBottom: 12, lineHeight: 1.6 }, children: q.prompt }),
      q.type === "mc" && q.options ? q.options.map((opt, i) => /* @__PURE__ */ jsx("div", { onClick: () => setAnswers((p) => ({ ...p, [q.id]: i })), style: { padding: 10, marginBottom: 6, borderRadius: 6, cursor: "pointer", background: answers[q.id] === i ? "#3B82F622" : "#25252B", border: `1px solid ${answers[q.id] === i ? "#3B82F6" : "#3F3F46"}` }, children: /* @__PURE__ */ jsxs("span", { style: { fontSize: 12 }, children: [
        String.fromCharCode(65 + i),
        ". ",
        opt
      ] }) }, i)) : /* @__PURE__ */ jsx(
        "input",
        {
          value: answers[q.id] || "",
          onChange: (e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value })),
          placeholder: "\u8F93\u5165\u7B54\u6848\u2026",
          style: { width: "100%", padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, outline: "none", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 10 }, children: [
        current > 0 && /* @__PURE__ */ jsx("button", { onClick: () => setCurrent((c) => c - 1), style: { ...btnStyle, padding: "8px 12px" }, children: "\u4E0A\u4E00\u9898" }),
        !isLast ? /* @__PURE__ */ jsx("button", { onClick: () => setCurrent((c) => c + 1), style: { ...btnStyle, padding: "8px 12px", background: "#3B82F6", borderColor: "#3B82F6", color: "#fff" }, children: "\u4E0B\u4E00\u9898" }) : /* @__PURE__ */ jsx("button", { onClick: submit, style: { ...btnStyle, padding: "8px 12px", background: "#10B981", borderColor: "#10B981", color: "#fff" }, children: "\u63D0\u4EA4" }),
        /* @__PURE__ */ jsx("button", { onClick: decline, style: { ...btnStyle, padding: "8px 12px", marginLeft: "auto" }, children: "\u8DF3\u8FC7" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 6 }, children: [
        "\u5DF2\u7B54 ",
        Object.keys(answers).length,
        "/",
        questions.length
      ] })
    ] }) : result ? /* @__PURE__ */ jsxs("div", { style: { padding: 14 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 18, fontWeight: 600, color: result.score >= 60 ? "#10B981" : "#EF4444" }, children: [
        result.correct,
        "/",
        result.total,
        " \xB7 ",
        result.score,
        "\u5206"
      ] }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 10, fontSize: 12 }, children: result.details.map((dd, i) => /* @__PURE__ */ jsxs("div", { style: { marginBottom: 4, color: dd.ok ? "#10B981" : "#EF4444" }, children: [
        dd.ok ? "\u2713" : "\u2717",
        " ",
        dd.id,
        ": ",
        dd.your ?? "\u7A7A",
        dd.ok ? "" : ` \u2192 ${dd.correct}`
      ] }, i)) })
    ] }) : /* @__PURE__ */ jsx("div", { style: { padding: 14, color: "#8E8E93", fontSize: 12 }, children: "\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u8BC4\u5206\u2026" })
  ] });
}
var btnStyle = { padding: "8px 12px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 12, cursor: "pointer" };
export {
  QuizGenCard as default
};
