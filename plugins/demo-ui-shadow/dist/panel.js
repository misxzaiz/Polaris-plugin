// src/Panel.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function DemoShadowPanel({ pluginId }) {
  const [selected, setSelected] = useState(null);
  const mockFiles = [
    { name: "src", type: "directory" },
    { name: "package.json", type: "file" },
    { name: "README.md", type: "file" },
    { name: "tsconfig.json", type: "file" }
  ];
  return /* @__PURE__ */ jsxs("div", { style: { padding: 16, display: "flex", flexDirection: "column", height: "100%", gap: 12, fontFamily: "system-ui, sans-serif" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { borderBottom: "1px solid var(--border-color, #3F3F46)", paddingBottom: 8 }, children: [
      /* @__PURE__ */ jsx("h3", { style: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary, #F8F8F8)" }, children: "\u{1F4C1} [demo-shadow] File Explorer" }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-secondary, #8E8E93)", marginTop: 4 }, children: [
        "Plugin: ",
        pluginId,
        " \xB7 \u6B64\u9762\u677F\u901A\u8FC7 shadow \u8986\u76D6\u4E86\u5185\u7F6E\u6587\u4EF6\u9762\u677F"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "auto" }, children: mockFiles.map((f) => /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: () => setSelected(f.name),
        style: {
          padding: "6px 8px",
          cursor: "pointer",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          background: selected === f.name ? "var(--list-active-selection-bg, #2D2D33)" : "transparent",
          color: "var(--text-primary, #F8F8F8)"
        },
        children: [
          /* @__PURE__ */ jsx("span", { children: f.type === "directory" ? "\u{1F4C1}" : "\u{1F4C4}" }),
          /* @__PURE__ */ jsx("span", { children: f.name })
        ]
      },
      f.name
    )) }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-secondary, #8E8E93)", borderTop: "1px solid var(--border-color, #3F3F46)", paddingTop: 8 }, children: [
      "\u2705 Shadow \u8986\u76D6\u751F\u6548\uFF1A\u539F\u6587\u4EF6\u9762\u677F\u5DF2\u9690\u85CF\uFF0C\u6B64\u9762\u677F\u66FF\u4EE3\u663E\u793A\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u5378\u8F7D\u63D2\u4EF6\u540E\u6062\u590D\u5185\u7F6E\u6587\u4EF6\u9762\u677F\u3002"
    ] })
  ] });
}
export {
  DemoShadowPanel as default
};
