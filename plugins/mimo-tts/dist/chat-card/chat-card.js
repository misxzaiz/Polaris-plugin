// src/chat-card/ChatCard.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function normalizeData(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw;
  return {};
}
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
function ToolLabel({ toolName }) {
  const map = {
    mimo_tts_synthesize: "\u9884\u7F6E\u97F3\u8272\u5408\u6210",
    mimo_tts_voice_design: "\u6587\u672C\u8BBE\u8BA1\u97F3\u8272",
    mimo_tts_voice_clone: "\u97F3\u8272\u514B\u9686"
  };
  const short = toolName.replace(/^mcp__[^_]+__/, "");
  return map[short] || toolName;
}
function MimoTtsChatCard({ data, status, toolName }) {
  const [expanded, setExpanded] = useState(false);
  const d = normalizeData(data);
  const audioUrl = d.url || d.playbackUrl;
  const error = d.error || (status === "error" ? "\u5408\u6210\u5931\u8D25" : "");
  if (error) {
    return /* @__PURE__ */ jsx("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-error/30 bg-error-faint/50", children: /* @__PURE__ */ jsxs("header", { className: "flex min-w-0 items-center gap-2 px-3 py-2", children: [
      /* @__PURE__ */ jsx("span", { className: "text-sm", children: "\u{1F534}" }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-medium text-error", children: "MiMo \u8BED\u97F3\u5408\u6210\u5931\u8D25" }),
        /* @__PURE__ */ jsx("div", { className: "mt-0.5 truncate text-xs text-text-secondary", title: error, children: error })
      ] })
    ] }) });
  }
  const showText = d.text && d.text.length > 0;
  const longText = (d.text || "").length > 90;
  return /* @__PURE__ */ jsxs("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated", children: [
    /* @__PURE__ */ jsxs("header", { className: "flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2", children: [
      /* @__PURE__ */ jsx("div", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs", children: "\u{1F50A}" }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsx("div", { className: "truncate text-sm font-medium text-text-primary", children: /* @__PURE__ */ jsx(ToolLabel, { toolName }) }),
        /* @__PURE__ */ jsxs("div", { className: "mt-0.5 flex items-center gap-1.5 overflow-hidden text-[11px] text-text-tertiary", children: [
          d.model && /* @__PURE__ */ jsx("span", { className: "truncate font-mono", children: d.model }),
          d.voice && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "shrink-0", children: "\xB7" }),
            /* @__PURE__ */ jsxs("span", { className: "shrink-0", children: [
              "\u97F3\u8272 ",
              d.voice
            ] })
          ] })
        ] })
      ] }),
      d.success === false ? /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded bg-error/10 px-1.5 py-0.5 text-[11px] text-error", children: "\u5931\u8D25" }) : /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary", children: "\u5DF2\u5B8C\u6210" })
    ] }),
    showText && /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => setExpanded((v) => !v),
        className: "mx-3 mt-2 block max-w-full text-left text-xs leading-relaxed text-text-secondary transition-colors hover:text-text-primary",
        style: { WebkitLineClamp: "unset" },
        children: /* @__PURE__ */ jsx(
          "span",
          {
            className: longText && !expanded ? "block overflow-hidden" : "",
            style: longText && !expanded ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } : void 0,
            children: d.text
          }
        )
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "px-3 py-2.5", children: audioUrl ? /* @__PURE__ */ jsx("audio", { controls: true, preload: "none", src: audioUrl, className: "h-9 w-full max-w-full" }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-text-muted", children: [
      /* @__PURE__ */ jsx("span", { className: "text-base", children: "\u23F3" }),
      "\u97F3\u9891\u5730\u5740\u7F3A\u5931"
    ] }) }),
    /* @__PURE__ */ jsxs("footer", { className: "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background-surface px-3 py-1.5 text-[11px] text-text-tertiary", children: [
      audioUrl && /* @__PURE__ */ jsx(
        "a",
        {
          href: audioUrl,
          target: "_blank",
          rel: "noreferrer",
          className: "text-text-secondary transition-colors hover:text-primary",
          children: "\u2B07 \u4E0B\u8F7D"
        }
      ),
      d.transcript && /* @__PURE__ */ jsxs("span", { className: "truncate", title: `\u8BC6\u522B\u6587\u672C: ${d.transcript}`, children: [
        "\u{1F4DD} ",
        d.transcript
      ] }),
      formatSize(d.sizeBytes) && /* @__PURE__ */ jsx("span", { children: formatSize(d.sizeBytes) }),
      d.format && /* @__PURE__ */ jsxs("span", { children: [
        ".",
        d.format
      ] }),
      d.file && /* @__PURE__ */ jsx("span", { className: "truncate", title: d.file, children: d.file.replace(/^.*[\\/]/, "") })
    ] })
  ] });
}
export {
  MimoTtsChatCard as default
};
