// src/FocusCard.tsx
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
function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
function FocusCard(props) {
  const d = parseData(props.data);
  if (!d || typeof d !== "object" || d.ok === false) {
    return createElement("div", {
      className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
    }, d?.error || "\u5FC3\u6D41\u72B6\u6001\u672A\u77E5");
  }
  if (d.type === "start") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-accent/40 bg-background-elevated p-2 font-mono text-xs"
      },
      createElement("div", { className: "mb-1 text-text-muted" }, "\u{1F30A} \u5F00\u59CB\u4E13\u6CE8"),
      createElement("div", { className: "mb-1 text-text" }, d.task),
      createElement("div", { className: "text-text-muted text-[11px]" }, `\u76EE\u6807 ${d.goalMin} \u5206\u949F`)
    );
  }
  if (d.type === "stop") {
    const s = d.session;
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs"
      },
      createElement("div", { className: "mb-1 text-text-muted" }, "\u2705 \u5B8C\u6210\u4E13\u6CE8"),
      createElement("div", { className: "mb-1 text-text" }, s.task),
      createElement(
        "div",
        { className: "mb-1 text-text" },
        `${fmtDuration(s.durationMin)}` + (s.feel ? ` \xB7 \u5FC3\u6D41 ${"\u2605".repeat(s.feel)}${"\u2606".repeat(5 - s.feel)}` : "")
      ),
      s.distraction ? createElement("div", { className: "text-text-muted text-[11px]" }, `\u5E72\u6270: ${s.distraction}`) : null,
      s.note ? createElement("div", { className: "text-text-muted text-[11px]" }, s.note) : null,
      d.streak ? createElement("div", { className: "mt-1 text-text-muted text-[11px]" }, `\u{1F525} \u8FDE\u7EED\u4E13\u6CE8 ${d.streak} \u5929`) : null
    );
  }
  if (d.type === "stats") {
    const b = (label, value, sub) => createElement(
      "div",
      { className: "flex-1 text-center" },
      createElement("div", { className: "text-text-muted text-[10px]" }, label),
      createElement("div", { className: "text-sm font-bold text-text" }, value),
      sub ? createElement("div", { className: "text-text-muted text-[10px]" }, sub) : null
    );
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs"
      },
      createElement(
        "div",
        { className: "mb-1.5 text-text-muted" },
        d.active ? `\u{1F534} \u8FDB\u884C\u4E2D\uFF1A${d.active.task}\uFF08${fmtDuration(d.active.activeMin)}/${d.active.goalMin}m\uFF09` : "\u{1F4CA} \u4E13\u6CE8\u7EDF\u8BA1"
      ),
      createElement(
        "div",
        { className: "flex gap-1" },
        b("\u4ECA\u65E5", fmtDuration(d.today.min), `${d.today.sessions}\u6B21`),
        b("\u672C\u5468", fmtDuration(d.week.min), `${d.week.sessions}\u6B21`),
        b("\u7D2F\u8BA1", fmtDuration(d.total.min), `${d.total.sessions}\u6B21`),
        b("\u8FDE\u7EED", `${d.streak}`, "\u5929")
      )
    );
  }
  if (d.type === "log") {
    return createElement(
      "div",
      {
        className: "my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs"
      },
      createElement("div", { className: "mb-1 text-text-muted" }, `\u{1F4DC} \u6700\u8FD1 ${d.count} \u6761\u4E13\u6CE8`),
      (d.sessions || []).slice(0, 8).map(
        (s, i) => createElement(
          "div",
          { key: i, className: "mb-1 flex items-center gap-2 text-text-secondary" },
          createElement("span", { className: "shrink-0 text-text-muted text-[10px]" }, s.date.slice(5)),
          createElement("span", { className: "min-w-0 flex-1 truncate" }, s.task),
          createElement("span", { className: "shrink-0 font-bold text-text" }, fmtDuration(s.durationMin))
        )
      ),
      (d.sessions || []).length > 8 && createElement("div", { className: "text-text-muted text-[10px]" }, `... \u8FD8\u6709 ${d.sessions.length - 8} \u6761`)
    );
  }
  return createElement("div", {
    className: "my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted"
  }, "\u5FC3\u6D41\u6570\u636E\u6682\u4E0D\u53EF\u8BFB");
}
export {
  FocusCard as default
};
