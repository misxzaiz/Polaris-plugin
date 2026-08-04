// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function HabitPanel({ pluginId }) {
  const [habits, setHabits] = useState([]);
  const [stats, setStats] = useState(null);
  const [port, setPort] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const api = window.__POLARIS_PLUGIN_SERVICES__;
    if (!api) {
      setMsg("Service API \u4E0D\u53EF\u7528");
      return;
    }
    api.getStatus(pluginId, "habit-svc").then((s) => {
      if (s.port) setPort(s.port);
      else setMsg("Service \u672A\u8FD0\u884C: " + s.state);
    }).catch((e) => setMsg("\u83B7\u53D6 Service \u72B6\u6001\u5931\u8D25: " + (e?.message || e)));
  }, [pluginId]);
  const apiBase = port ? `http://localhost:${port}` : null;
  const refresh = useCallback(async () => {
    if (!apiBase) return;
    try {
      const [h, s] = await Promise.all([
        fetch(`${apiBase}/habits`).then((r) => r.json()),
        fetch(`${apiBase}/stats`).then((r) => r.json())
      ]);
      setHabits(h.habits || []);
      setStats(s);
    } catch (e) {
      setMsg("\u52A0\u8F7D\u5931\u8D25: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [apiBase]);
  useEffect(() => {
    if (apiBase) refresh();
  }, [apiBase, refresh]);
  const add = async () => {
    if (!apiBase) return;
    const name = prompt('\u4E60\u60EF\u540D\uFF08\u5982"\u559D\u6C34"\uFF09');
    if (!name) return;
    const freq = confirm("\u6BCF\u65E5\uFF1F\u53D6\u6D88=\u6BCF\u5468") ? "daily" : "weekly";
    await fetch(`${apiBase}/habits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, frequency: freq }) });
    refresh();
  };
  const done = async (id) => {
    if (!apiBase) return;
    const res = await fetch(`${apiBase}/habits/${id}/done`, { method: "POST" }).then((r) => r.json());
    setMsg(`\u2713 ${res.name} \u8FDE\u7EED ${res.streak} \u5929`);
    refresh();
  };
  const del = async (id) => {
    if (!apiBase || !confirm("\u5220\u9664\uFF1F")) return;
    await fetch(`${apiBase}/habits/${id}`, { method: "DELETE" });
    refresh();
  };
  if (!apiBase) return /* @__PURE__ */ jsx("div", { style: { padding: 24, color: "#8E8E93", fontSize: 13 }, children: msg || "\u542F\u52A8\u4E60\u60EF\u670D\u52A1\u2026" });
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 12, padding: "10px 12px", borderBottom: "1px solid #3F3F46" }, children: [
      stats ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Stat, { label: "\u603B\u6570", value: stats.total, color: "#8E8E93" }),
        /* @__PURE__ */ jsx(Stat, { label: "\u5230\u671F", value: stats.due, color: "#F59E0B" }),
        /* @__PURE__ */ jsx(Stat, { label: "\u603B\u8FDE\u7EED", value: stats.totalStreak, color: "#10B981" })
      ] }) : /* @__PURE__ */ jsx("span", { style: { color: "#8E8E93" }, children: "\u52A0\u8F7D\u2026" }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { onClick: add, style: btnStyle, children: "+" }),
      /* @__PURE__ */ jsx("button", { onClick: refresh, style: btnStyle, children: "\u21BB" })
    ] }),
    msg && /* @__PURE__ */ jsx("div", { style: { padding: "6px 12px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 12 }, children: habits.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24, fontSize: 11 }, children: "\u6682\u65E0\u4E60\u60EF\uFF0C\u70B9 + \u6DFB\u52A0" }) : habits.map((h) => {
      const period = h.frequency === "daily" ? 864e5 : 6048e5;
      const due = !h.lastDone || Date.now() - h.lastDone >= period;
      return /* @__PURE__ */ jsx("div", { style: { padding: 12, marginBottom: 8, borderRadius: 8, background: "#25252B", border: "1px solid #3F3F46" }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 500 }, children: h.name }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 2 }, children: [
            h.frequency === "daily" ? "\u6BCF\u65E5" : "\u6BCF\u5468",
            " \xB7 \u8FDE\u7EED ",
            h.streak,
            " ",
            h.frequency === "daily" ? "\u5929" : "\u5468"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6 }, children: [
          /* @__PURE__ */ jsx("button", { onClick: () => done(h.id), disabled: !due, style: { ...btnStyle, background: due ? "#10B98122" : "#3F3F46", color: due ? "#10B981" : "#6B7280", borderColor: due ? "#10B981" : "#3F3F46", opacity: due ? 1 : 0.5 }, children: due ? "\u6253\u5361" : "\u2713\u4ECA\u65E5" }),
          /* @__PURE__ */ jsx("button", { onClick: () => del(h.id), style: { ...btnStyle, padding: "2px 6px" }, children: "\u2715" })
        ] })
      ] }) }, h.id);
    }) })
  ] });
}
function Stat({ label, value, color }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("span", { style: { fontSize: 18, fontWeight: 600, color }, children: value }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#8E8E93" }, children: label })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
export {
  HabitPanel as default
};
