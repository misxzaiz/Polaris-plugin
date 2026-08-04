// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function AgentTracePanel({ pluginId, onSendToChat }) {
  const [traces, setTraces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filterTool, setFilterTool] = useState("");
  const [errorOnly, setErrorOnly] = useState(false);
  const [stats, setStats] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.agenttrace.traces");
      if (raw) setTraces(JSON.parse(raw));
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persist = (next) => {
    setTraces(next);
    localStorage.setItem("polaris.agenttrace.traces", JSON.stringify(next));
  };
  const addLocal = () => {
    const tool = prompt("\u5DE5\u5177\u540D");
    if (!tool) return;
    const tr = { id: "t" + Date.now().toString(36), ts: Date.now(), tool, args: {}, result: "(\u624B\u52A8\u8BB0\u5F55)", ms: Math.floor(Math.random() * 500), error: null };
    persist([tr, ...traces]);
  };
  const askAIStats = () => {
    onSendToChat?.("\u8BF7\u7528 agent-trace \u7684 trace_stats \u5DE5\u5177\u7ED9\u6211\u8FFD\u8E2A\u7EDF\u8BA1");
  };
  const filtered = traces.filter(
    (t) => (!filterTool || t.tool.includes(filterTool)) && (!errorOnly || t.error)
  );
  const clear = () => {
    if (confirm("\u6E05\u7A7A\u6240\u6709\u8FFD\u8E2A\uFF1F")) persist([]);
    setSelected(null);
  };
  const exportLocal = () => {
    const jsonl = traces.map((t) => JSON.stringify(t)).join("\n");
    const blob = new Blob([jsonl], { type: "application/jsonl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `traces-${Date.now()}.jsonl`;
    a.click();
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid #3F3F46", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("input", { value: filterTool, onChange: (e) => setFilterTool(e.target.value), placeholder: "\u8FC7\u6EE4\u5DE5\u5177\u540D\u2026", style: { flex: 1, minWidth: 80, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" } }),
      /* @__PURE__ */ jsx("button", { onClick: () => setErrorOnly(!errorOnly), style: errorOnly ? activeBtn : btnStyle, children: errorOnly ? "\u2713 \u4EC5\u9519\u8BEF" : "\u4EC5\u9519\u8BEF" }),
      /* @__PURE__ */ jsx("button", { onClick: addLocal, style: btnStyle, children: "+" }),
      /* @__PURE__ */ jsx("button", { onClick: exportLocal, style: btnStyle, children: "\u5BFC\u51FA" }),
      /* @__PURE__ */ jsx("button", { onClick: askAIStats, style: btnStyle, children: "\u7EDF\u8BA1" }),
      /* @__PURE__ */ jsx("button", { onClick: clear, style: { ...btnStyle, color: "#EF4444" }, children: "\u6E05\u7A7A" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto" }, children: filtered.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24, fontSize: 11 }, children: "\u6682\u65E0\u8FFD\u8E2A\u8BB0\u5F55" }) : filtered.slice(0, 200).map((t) => /* @__PURE__ */ jsxs("div", { onClick: () => setSelected(t), style: { padding: "8px 10px", borderBottom: "1px solid #2A2A30", cursor: "pointer", background: selected?.id === t.id ? "#2D2D33" : "transparent" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, fontWeight: 500, fontFamily: "monospace" }, children: t.tool }),
        /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: t.error ? "#EF4444" : "#10B981" }, children: [
          t.error ? "\u2717" : "\u2713",
          " ",
          t.ms,
          "ms"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginTop: 2 }, children: [
        new Date(t.ts).toLocaleTimeString(),
        " \xB7 ",
        t.error || t.result.slice(0, 60)
      ] })
    ] }, t.id)) }),
    selected && /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #3F3F46", padding: 10, maxHeight: "40%", overflowY: "auto", background: "#1F1F24" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 12, fontWeight: 600, fontFamily: "monospace" }, children: selected.tool }),
        /* @__PURE__ */ jsx("button", { onClick: () => setSelected(null), style: { ...btnStyle, padding: "2px 6px" }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginBottom: 8 }, children: [
        new Date(selected.ts).toLocaleString(),
        " \xB7 ",
        selected.ms,
        "ms \xB7 ",
        selected.id
      ] }),
      selected.error && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#EF4444", padding: 6, background: "#EF444422", borderRadius: 4, marginBottom: 6 }, children: selected.error }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#8E8E93", marginBottom: 2 }, children: "\u53C2\u6570" }),
      /* @__PURE__ */ jsx("pre", { style: { margin: "0 0 6px", fontSize: 11, color: "#B4B4B8", whiteSpace: "pre-wrap", fontFamily: "monospace" }, children: JSON.stringify(selected.args, null, 2) }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#8E8E93", marginBottom: 2 }, children: "\u7ED3\u679C" }),
      /* @__PURE__ */ jsx("pre", { style: { margin: 0, fontSize: 11, color: "#10B981", whiteSpace: "pre-wrap", fontFamily: "monospace" }, children: selected.result })
    ] })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
var activeBtn = { ...btnStyle, background: "#F59E0B22", color: "#F59E0B", borderColor: "#F59E0B" };
export {
  AgentTracePanel as default
};
