// src/Panel.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
var TEMPLATES = [
  { type: "flowchart", label: "\u6D41\u7A0B\u56FE" },
  { type: "sequence", label: "\u65F6\u5E8F\u56FE" },
  { type: "mindmap", label: "\u601D\u7EF4\u5BFC\u56FE" },
  { type: "class", label: "\u7C7B\u56FE" },
  { type: "state", label: "\u72B6\u6001\u56FE" },
  { type: "gantt", label: "\u7518\u7279\u56FE" },
  { type: "pie", label: "\u997C\u56FE" },
  { type: "graph", label: "\u5173\u7CFB\u56FE" }
];
var STORAGE_KEY = "polaris.diagram.history";
function DiagramPanel({ pluginId, onSendToChat }) {
  const [code, setCode] = useState(`flowchart TD
    Start([\u5F00\u59CB]) --> Process[\u5904\u7406]
    Process --> Decision{\u5224\u65AD}
    Decision -->|\u662F| Done([\u5B8C\u6210])
    Decision -->|\u5426| Process`);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);
  const [mermaidReady, setMermaidReady] = useState(false);
  const [history, setHistory] = useState([]);
  const renderTimer = useRef(null);
  useEffect(() => {
    const w = window;
    if (w.mermaid) {
      w.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
      setMermaidReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = MERMAID_CDN;
    s.onload = () => {
      if (w.mermaid) {
        w.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
        setMermaidReady(true);
      }
    };
    document.head.appendChild(s);
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
    }
  }, []);
  const render = useCallback(async (src) => {
    if (!mermaidReady) return;
    const w = window;
    try {
      const { svg: out } = await w.mermaid.render("dia-" + Date.now(), src);
      setSvg(out);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [mermaidReady]);
  useEffect(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = window.setTimeout(() => render(code), 400);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [code, render]);
  const saveToHistory = useCallback((src, type) => {
    const item = { id: Math.random().toString(36).slice(2, 9), code: src, type, ts: Date.now() };
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 20);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }, []);
  const applyTemplate = (type) => {
    const templates = {
      flowchart: `flowchart TD
    Start([\u5F00\u59CB]) --> Process[\u5904\u7406]
    Process --> Done([\u5B8C\u6210])`,
      sequence: `sequenceDiagram
    participant A
    participant B
    A->>B: \u8BF7\u6C42
    B-->>A: \u54CD\u5E94`,
      mindmap: `mindmap
  root((\u4E3B\u9898))
    \u5206\u652FA
      \u5B50\u98791
    \u5206\u652FB`,
      class: `classDiagram
    class Animal {
      +eat()
    }
    class Dog {
      +bark()
    }
    Animal <|-- Dog`,
      state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Active : \u89E6\u53D1
    Active --> [*]`,
      gantt: `gantt
    title \u9879\u76EE\u8BA1\u5212
    dateFormat YYYY-MM-DD
    section \u9636\u6BB5
    \u4EFB\u52A11 :a1, 2026-01-01, 7d`,
      pie: `pie title \u5360\u6BD4
    "A" : 40
    "B" : 60`,
      graph: `graph LR
    A[\u8282\u70B9A] --> B[\u8282\u70B9B]
    B --> C[\u8282\u70B9C]`
    };
    setCode(templates[type] || templates.flowchart);
  };
  const exportSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportPng = async () => {
    if (!svg) return;
    const img = new Image();
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#1A1A1F";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `diagram-${Date.now()}.png`;
          a.click();
        });
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  const copyCode = () => {
    navigator.clipboard?.writeText(code);
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid #3F3F46", alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: "\u6A21\u677F:" }),
      TEMPLATES.map((t) => /* @__PURE__ */ jsx("button", { onClick: () => applyTemplate(t.type), style: chipStyle, title: t.label, children: t.label }, t.type)),
      /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx("button", { onClick: copyCode, style: btnStyle, title: "\u590D\u5236 Mermaid \u4EE3\u7801", children: "\u590D\u5236" }),
      /* @__PURE__ */ jsx("button", { onClick: exportSvg, disabled: !svg, style: { ...btnStyle, opacity: svg ? 1 : 0.4 }, children: "SVG" }),
      /* @__PURE__ */ jsx("button", { onClick: exportPng, disabled: !svg, style: { ...btnStyle, opacity: svg ? 1 : 0.4 }, children: "PNG" }),
      /* @__PURE__ */ jsx("button", { onClick: () => saveToHistory(code, "flowchart"), style: btnStyle, children: "\u5B58\u6863" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", overflow: "hidden" }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: code,
          onChange: (e) => setCode(e.target.value),
          spellCheck: false,
          style: {
            flex: 1,
            padding: 10,
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            background: "#25252B",
            color: "#F8F8F8",
            border: "none",
            borderRight: "1px solid #3F3F46",
            resize: "none",
            outline: "none",
            lineHeight: 1.5
          }
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "auto", padding: 12, background: "#1F1F24", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: mermaidReady ? svg ? /* @__PURE__ */ jsx("div", { style: { width: "100%" }, dangerouslySetInnerHTML: { __html: svg } }) : error ? /* @__PURE__ */ jsx("div", { style: { color: "#EF4444", fontSize: 12, whiteSpace: "pre-wrap", padding: 8 }, children: error }) : /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93" }, children: "\u6E32\u67D3\u4E2D\u2026" }) : /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93" }, children: "\u52A0\u8F7D mermaid.js\u2026" }) })
    ] }),
    history.length > 0 && /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #3F3F46", padding: "8px 10px", maxHeight: 120, overflowY: "auto" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280", marginBottom: 4 }, children: [
        "\u5386\u53F2 (",
        history.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: history.map((h) => /* @__PURE__ */ jsxs("button", { onClick: () => setCode(h.code), style: histStyle, title: h.code.slice(0, 50), children: [
        new Date(h.ts).toLocaleTimeString(),
        " \xB7 ",
        h.type
      ] }, h.id)) })
    ] })
  ] });
}
var btnStyle = {
  padding: "4px 10px",
  borderRadius: 5,
  border: "1px solid #3F3F46",
  background: "#2D2D33",
  color: "#F8F8F8",
  fontSize: 11,
  cursor: "pointer"
};
var chipStyle = {
  padding: "2px 8px",
  borderRadius: 10,
  border: "1px solid #3F3F46",
  background: "transparent",
  color: "#B4B4B8",
  fontSize: 10,
  cursor: "pointer"
};
var histStyle = {
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid #3F3F46",
  background: "#25252B",
  color: "#8E8E93",
  fontSize: 10,
  cursor: "pointer"
};
export {
  DiagramPanel as default
};
