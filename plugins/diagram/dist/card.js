// src/Card.tsx
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
var mermaidPromise = null;
function loadMermaid() {
  const w = window;
  if (w.mermaid) return Promise.resolve();
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = MERMAID_CDN;
    s.onload = () => {
      if (w.mermaid) w.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
      resolve();
    };
    document.head.appendChild(s);
  });
  return mermaidPromise;
}
function DiagramCard({ data, onSendToChat }) {
  const d = data || {};
  const code = d.code || (typeof data === "string" ? data : "") || "";
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    loadMermaid().then(() => {
      const w = window;
      if (!w.mermaid || cancelled) return;
      w.mermaid.render("dcard-" + Math.random().toString(36).slice(2, 9), code).then(({ svg: out }) => {
        if (!cancelled) {
          setSvg(out);
          setErr(null);
        }
      }).catch((e) => {
        if (!cancelled) setSvg("");
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);
  if (!code) {
    return /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 12 }, children: "\u65E0\u53EF\u6E32\u67D3\u7684\u56FE\u8868\u6570\u636E" });
  }
  return /* @__PURE__ */ jsxs("div", { style: { borderRadius: 8, border: "1px solid #3F3F46", background: "#1F1F24", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#8E8E93" }, children: [
        d.template || "\u56FE\u8868",
        " \xB7 ",
        d.type || "mermaid",
        d.valid === false && /* @__PURE__ */ jsx("span", { style: { color: "#EF4444", marginLeft: 6 }, children: "\u2717 \u8BED\u6CD5\u95EE\u9898" })
      ] }),
      onSendToChat && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onSendToChat(`\u8BF7\u57FA\u4E8E\u8FD9\u5F20\u56FE\u8868\u7EE7\u7EED\u8FED\u4EE3\uFF1A

\`\`\`mermaid
${code}
\`\`\``),
          style: { padding: "2px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#B4B4B8", fontSize: 10, cursor: "pointer" },
          children: "\u8FED\u4EE3"
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { style: { padding: 12, display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: 80, overflow: "auto" }, children: svg ? /* @__PURE__ */ jsx("div", { style: { width: "100%" }, dangerouslySetInnerHTML: { __html: svg } }) : err ? /* @__PURE__ */ jsx("pre", { style: { color: "#EF4444", fontSize: 11, whiteSpace: "pre-wrap", margin: 0 }, children: err }) : /* @__PURE__ */ jsx("span", { style: { color: "#8E8E93", fontSize: 11 }, children: "\u6E32\u67D3\u4E2D\u2026" }) }),
    /* @__PURE__ */ jsxs("details", { style: { borderTop: "1px solid #3F3F46", padding: "6px 10px" }, children: [
      /* @__PURE__ */ jsx("summary", { style: { cursor: "pointer", fontSize: 10, color: "#6B7280" }, children: "Mermaid \u6E90\u7801" }),
      /* @__PURE__ */ jsx("pre", { style: { marginTop: 6, fontSize: 11, color: "#B4B4B8", whiteSpace: "pre-wrap", margin: 0, fontFamily: "ui-monospace, monospace" }, children: code })
    ] })
  ] });
}
export {
  DiagramCard as default
};
