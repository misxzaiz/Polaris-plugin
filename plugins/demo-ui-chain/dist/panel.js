// src/Panel.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function DemoChainPanel({ pluginId }) {
  const [file] = useState("src/index.ts");
  const blameEntries = [
    { line: 1, author: "Alice", date: "2026-08-01", commit: "a1b2c3d" },
    { line: 2, author: "Bob", date: "2026-08-05", commit: "e4f5g6h" },
    { line: 3, author: "Alice", date: "2026-08-10", commit: "i7j8k9l" }
  ];
  return /* @__PURE__ */ jsxs("div", { style: { padding: 16, display: "flex", flexDirection: "column", height: "100%", gap: 12, fontFamily: "system-ui, sans-serif" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { borderBottom: "1px solid var(--border-color, #3F3F46)", paddingBottom: 8 }, children: [
      /* @__PURE__ */ jsx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary, #F8F8F8)" }, children: "\u{1F517} [demo-chain] Git Blame" }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-secondary, #8E8E93)", marginTop: 4 }, children: [
        "Plugin: ",
        pluginId,
        " \xB7 chain \u589E\u5F3A\u6A21\u5F0F\uFF08\u53E0\u52A0\u5728\u6587\u4EF6\u9762\u677F\u65C1\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-secondary, #8E8E93)", padding: "4px 8px", background: "var(--list-inactive-selection-bg, #25252B)", borderRadius: 4 }, children: [
      "\u6587\u4EF6: ",
      file
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "auto" }, children: blameEntries.map((b) => /* @__PURE__ */ jsxs("div", { style: {
      padding: "6px 8px",
      fontSize: 12,
      fontFamily: "monospace",
      display: "flex",
      gap: 12,
      alignItems: "center",
      borderBottom: "1px solid var(--border-color, #3F3F46)",
      color: "var(--text-primary, #F8F8F8)"
    }, children: [
      /* @__PURE__ */ jsxs("span", { style: { color: "var(--text-secondary, #8E8E93)", minWidth: 30 }, children: [
        "L",
        b.line
      ] }),
      /* @__PURE__ */ jsx("span", { style: { minWidth: 80 }, children: b.author }),
      /* @__PURE__ */ jsx("span", { style: { color: "var(--text-secondary, #8E8E93)", minWidth: 90 }, children: b.date }),
      /* @__PURE__ */ jsx("span", { style: { color: "#569cd6" }, children: b.commit })
    ] }, b.line)) }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-secondary, #8E8E93)", borderTop: "1px solid var(--border-color, #3F3F46)", paddingTop: 8 }, children: [
      "\u2705 chain \u589E\u5F3A\u751F\u6548\uFF1A\u6B64\u9762\u677F\u4E0E\u5185\u7F6E\u6587\u4EF6\u9762\u677F\u5E76\u5B58\uFF0C\u4E0D\u66FF\u6362\u539F\u9762\u677F\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5378\u8F7D\u63D2\u4EF6\u540E\u6062\u590D\u5355\u5185\u7F6E\u6587\u4EF6\u9762\u677F\u3002"
    ] })
  ] });
}
export {
  DemoChainPanel as default
};
