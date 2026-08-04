// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var GRADES = [
  { key: "again", label: "\u91CD\u6765", color: "#EF4444", hint: "0\u5929" },
  { key: "hard", label: "\u56F0\u96BE", color: "#F59E0B", hint: "1\u5929" },
  { key: "good", label: "\u826F\u597D", color: "#10B981", hint: "3\u5929" },
  { key: "easy", label: "\u7B80\u5355", color: "#3B82F6", hint: "7\u5929" }
];
function RecallPanel({ pluginId }) {
  const [cards, setCards] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState(null);
  const [port, setPort] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [view, setView] = useState("review");
  useEffect(() => {
    const api = window.__POLARIS_PLUGIN_SERVICES__;
    if (!api) {
      setMsg("Service API \u4E0D\u53EF\u7528");
      return;
    }
    api.getStatus(pluginId, "recall-svc").then((s) => {
      if (s.port) setPort(s.port);
      else setMsg("Service \u672A\u8FD0\u884C: " + s.state);
    }).catch((e) => setMsg("\u83B7\u53D6 Service \u72B6\u6001\u5931\u8D25: " + (e?.message || e)));
  }, [pluginId]);
  const apiBase = port ? `http://localhost:${port}` : null;
  const refresh = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const [dueRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/cards/due`).then((r) => r.json()),
        fetch(`${apiBase}/stats`).then((r) => r.json())
      ]);
      setCards(dueRes.cards || []);
      setStats(statsRes);
      setCurrent(null);
      setRevealed(false);
    } catch (e) {
      setMsg("\u52A0\u8F7D\u5931\u8D25: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);
  useEffect(() => {
    if (apiBase) refresh();
  }, [apiBase, refresh]);
  const startReview = () => {
    if (cards.length === 0) return;
    setCurrent(cards[0]);
    setRevealed(false);
  };
  const grade = async (g) => {
    if (!current || !apiBase) return;
    try {
      await fetch(`${apiBase}/cards/${encodeURIComponent(current.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: g })
      });
    } catch (e) {
      setMsg("\u8BC4\u5206\u5931\u8D25: " + (e instanceof Error ? e.message : String(e)));
    }
    const next = cards.filter((c) => c.id !== current.id);
    setCards(next);
    setCurrent(next[0] || null);
    setRevealed(false);
  };
  const addCard = async () => {
    if (!apiBase) return;
    const front = prompt("\u6B63\u9762\uFF08\u95EE\u9898\uFF09");
    if (!front) return;
    const back = prompt("\u53CD\u9762\uFF08\u7B54\u6848\uFF09");
    if (!back) return;
    await fetch(`${apiBase}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back, deck: "manual" })
    });
    refresh();
  };
  if (!apiBase) {
    return /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", fontSize: 13 }, children: msg || "\u6B63\u5728\u542F\u52A8\u590D\u4E60\u670D\u52A1\u2026" });
  }
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 12, padding: "10px 12px", borderBottom: "1px solid #3F3F46" }, children: stats ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Stat, { label: "\u603B\u6570", value: stats.total, color: "#8E8E93" }),
      /* @__PURE__ */ jsx(Stat, { label: "\u5F85\u590D\u4E60", value: stats.due, color: "#F59E0B" }),
      /* @__PURE__ */ jsx(Stat, { label: "\u4ECA\u65E5\u5DF2\u590D\u4E60", value: stats.reviewedToday, color: "#10B981" })
    ] }) : /* @__PURE__ */ jsx("span", { style: { color: "#8E8E93" }, children: "\u52A0\u8F7D\u7EDF\u8BA1\u2026" }) }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, padding: "8px 12px" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setView("review"), style: view === "review" ? activeTab : tab, children: "\u590D\u4E60" }),
      /* @__PURE__ */ jsx("button", { onClick: () => setView("all"), style: view === "all" ? activeTab : tab, children: "\u5168\u90E8" }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { onClick: refresh, style: btnStyle, children: "\u21BB" }),
      /* @__PURE__ */ jsx("button", { onClick: addCard, style: btnStyle, children: "+ \u5361\u7247" })
    ] }),
    msg && /* @__PURE__ */ jsx("div", { style: { padding: "6px 12px", color: "#EF4444", fontSize: 11 }, children: msg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 12 }, children: view === "review" ? current ? /* @__PURE__ */ jsx(CardView, { card: current, revealed, onReveal: () => setRevealed(true), onGrade: grade }) : /* @__PURE__ */ jsx("div", { style: { textAlign: "center", color: "#8E8E93", padding: 32 }, children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : cards.length === 0 ? "\u{1F389} \u6682\u65E0\u5230\u671F\u5361\u7247" : /* @__PURE__ */ jsxs("button", { onClick: startReview, style: { ...btnStyle, fontSize: 14, padding: "10px 20px" }, children: [
      "\u5F00\u59CB\u590D\u4E60 (",
      cards.length,
      ")"
    ] }) }) : cards.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24 }, children: "\u6682\u65E0\u5361\u7247" }) : /* @__PURE__ */ jsx("div", { children: cards.map((c) => /* @__PURE__ */ jsxs("div", { style: { padding: 10, marginBottom: 8, borderRadius: 8, background: "#25252B", border: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 12, fontWeight: 500 }, children: c.front }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginTop: 4 }, children: c.back }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 4 }, children: [
        c.deck,
        " \xB7 \u590D\u4E60 ",
        c.reps,
        " \u6B21 \xB7 \u95F4\u9694 ",
        c.interval,
        "\u5929"
      ] })
    ] }, c.id)) }) })
  ] });
}
function CardView({ card, revealed, onReveal, onGrade }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: 12 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280" }, children: [
      card.deck,
      " \xB7 \u590D\u4E60 ",
      card.reps,
      " \u6B21"
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, padding: 16, borderRadius: 10, background: "#25252B", border: "1px solid #3F3F46", display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx("div", { style: { fontSize: 15, fontWeight: 500, textAlign: "center" }, children: card.front }) }),
    revealed ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: { padding: 16, borderRadius: 10, background: "#1F2A1F", border: "1px solid #10B98144", display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx("div", { style: { fontSize: 14, color: "#10B981", textAlign: "center", whiteSpace: "pre-wrap" }, children: card.back }) }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6 }, children: GRADES.map((g) => /* @__PURE__ */ jsxs("button", { onClick: () => onGrade(g.key), style: { flex: 1, padding: "10px 0", borderRadius: 6, border: `1px solid ${g.color}55`, background: g.color + "22", color: g.color, fontSize: 12, cursor: "pointer" }, children: [
        g.label,
        /* @__PURE__ */ jsx("div", { style: { fontSize: 9, opacity: 0.7 }, children: g.hint })
      ] }, g.key)) })
    ] }) : /* @__PURE__ */ jsx("button", { onClick: onReveal, style: { padding: "12px 0", borderRadius: 8, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 13, cursor: "pointer" }, children: "\u663E\u793A\u7B54\u6848" })
  ] });
}
function Stat({ label, value, color }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ jsx("span", { style: { fontSize: 18, fontWeight: 600, color }, children: value }),
    /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#8E8E93" }, children: label })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
var tab = { padding: "4px 12px", borderRadius: 6, border: "1px solid #3F3F46", background: "transparent", color: "#8E8E93", fontSize: 11, cursor: "pointer" };
var activeTab = { ...tab, background: "#3B82F622", color: "#3B82F6", borderColor: "#3B82F6" };
export {
  RecallPanel as default
};
