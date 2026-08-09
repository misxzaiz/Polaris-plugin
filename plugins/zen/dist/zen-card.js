// src/ZenCard.tsx
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
var LUCK_COLORS = {
  "\u5927\u5409": "text-pink-400",
  "\u4E2D\u5409": "text-amber-400",
  "\u5409": "text-green-400",
  "\u5C0F\u5409": "text-cyan-400",
  "\u672B\u5409": "text-text-muted",
  "\u51F6": "text-red-400",
  "\u5927\u51F6": "text-red-500"
};
function ZenCard(props) {
  const d = parseData(props.data);
  if (!d || typeof d !== "object") {
    return createElement("div", {
      className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
    }, "\u5C0F\u50E7\u6CA1\u8BF4\u8BDD");
  }
  if (d.type === "knock") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs text-text-secondary"
      },
      createElement("div", { className: "mb-1 text-text-muted" }, "( ^_^ ) \u02C7\u02C7"),
      d.message ? createElement("div", { className: "mb-1 text-text" }, d.message) : null,
      d.count != null ? createElement("div", { className: "text-text-muted text-[11px]" }, `\u6572\u4E86 ${d.count} \u4E0B`) : null
    );
  }
  if (d.type === "fortune") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs"
      },
      d.luck ? createElement("div", {
        className: `mb-1 font-bold text-sm ${LUCK_COLORS[d.luck] || "text-text"}`
      }, d.luck) : null,
      d.text ? createElement("div", { className: "mb-1 text-text leading-relaxed" }, d.text) : null,
      d.book ? createElement("div", { className: "text-text-muted text-[11px] italic" }, "-- " + d.book) : null
    );
  }
  if (d.type === "book") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs"
      },
      d.question ? createElement("div", {
        className: "mb-1 text-text-muted text-[11px] italic"
      }, "\u300C" + d.question + "\u300D") : null,
      d.answer ? createElement("div", { className: "mb-1 text-text leading-relaxed" }, d.answer) : null,
      d.followUp ? createElement("div", { className: "mt-1 h-px bg-border" }) : null,
      d.followUp ? createElement("div", { className: "mt-1 text-text-muted text-[11px]" }, d.followUp) : null
    );
  }
  return createElement("div", {
    className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
  }, "\u5C0F\u50E7\u9012\u7ED9\u4F60\u4E00\u5F20\u7EB8\u6761\uFF0C\u4F46\u4F60\u8BFB\u4E0D\u61C2");
}
export {
  ZenCard
};
