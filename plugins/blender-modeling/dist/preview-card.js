// src/PreviewCard.tsx
import { createElement } from "react";
function parseData(data) {
  if (!data || typeof data !== "object") return null;
  if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
    try {
      return JSON.parse(data.content[0].text);
    } catch {
      return null;
    }
  }
  return data;
}
function ModelPreview({ modelUrl, previewUrl, parts, script }) {
  return createElement(
    "div",
    {
      className: "my-2 rounded-lg border border-border bg-background-elevated overflow-hidden"
    },
    // 模型信息头部
    createElement(
      "div",
      {
        className: "px-3 py-2 border-b border-border flex items-center justify-between"
      },
      createElement(
        "div",
        { className: "flex items-center gap-2" },
        createElement("span", { className: "text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent" }, script),
        parts ? createElement("span", { className: "text-[11px] text-text-muted" }, `${parts} \u4E2A\u90E8\u4EF6`) : null
      ),
      createElement("a", {
        href: modelUrl,
        target: "_blank",
        className: "text-[11px] text-accent hover:underline"
      }, "\u4E0B\u8F7D GLB")
    ),
    // 3D 预览 iframe
    createElement(
      "div",
      {
        className: "relative w-full",
        style: { height: "360px", background: "#1a1a2e" }
      },
      createElement("iframe", {
        src: previewUrl,
        className: "w-full h-full border-0",
        style: { background: "#1a1a2e" },
        allow: "autoplay",
        sandbox: "allow-scripts allow-same-origin",
        loading: "lazy"
      })
    )
  );
}
function BlenderPreviewCard(props) {
  const d = parseData(props.data);
  if (!d || typeof d !== "object") {
    return createElement("div", {
      className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
    }, "3D \u5EFA\u6A21\u7ED3\u679C\u52A0\u8F7D\u4E2D...");
  }
  if (d.type === "error") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono"
      },
      createElement("div", { className: "text-red-400 font-bold mb-1" }, "\u26A0\uFE0F \u5EFA\u6A21\u51FA\u9519"),
      createElement("div", { className: "text-text-secondary whitespace-pre-wrap" }, d.message || "\u672A\u77E5\u9519\u8BEF")
    );
  }
  if (d.type === "model_list") {
    const models = d.models || [];
    if (models.length === 0) {
      return createElement("div", {
        className: "my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono text-text-muted"
      }, "\u6682\u65E0\u53EF\u7528\u5EFA\u6A21\u811A\u672C");
    }
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated overflow-hidden"
      },
      createElement("div", {
        className: "px-3 py-1.5 border-b border-border text-xs font-medium text-text"
      }, `\u{1F4D0} \u53EF\u7528\u5EFA\u6A21\u811A\u672C (${models.length})`),
      createElement(
        "div",
        { className: "divide-y divide-border" },
        ...models.map(
          (m, i) => createElement(
            "div",
            {
              key: i,
              className: "px-3 py-2 text-[11px] font-mono"
            },
            createElement("div", { className: "text-text font-medium" }, m.name),
            m.description ? createElement("div", { className: "text-text-muted mt-0.5 text-[10px]" }, m.description) : null,
            m.params ? createElement("div", {
              className: "text-text-muted text-[10px] mt-0.5"
            }, `\u53C2\u6570: ${Object.keys(m.params).length} \u4E2A`) : null
          )
        )
      )
    );
  }
  if (d.type === "model_generated") {
    return createElement(
      "div",
      {},
      // 简短文本提示
      createElement("div", {
        className: "my-1 text-xs text-text-secondary"
      }, `\u2705 \u6A21\u578B\u5DF2\u751F\u6210${d.parts ? ` (${d.parts} \u4E2A\u90E8\u4EF6)` : ""}`),
      // 3D 预览
      d.previewUrl ? createElement(ModelPreview, {
        modelUrl: d.modelUrl,
        previewUrl: d.previewUrl,
        parts: d.parts,
        script: d.script
      }) : null
    );
  }
  return createElement("div", {
    className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
  }, "\u672A\u77E5\u7684 3D \u5EFA\u6A21\u7ED3\u679C");
}
export {
  BlenderPreviewCard as default
};
