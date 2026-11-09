// src/card.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// src/shared.ts
var APPS_KEY = "__POLARIS_INTERACTIVE_APPS__";
var APPS_CHANGED_EVENT = "polaris:interactive-apps-changed";
function rememberApp(data) {
  try {
    const w = window;
    const list = Array.isArray(w[APPS_KEY]) ? w[APPS_KEY].slice() : [];
    if (data.previewId) {
      const idx = list.findIndex((x) => x.previewId === data.previewId);
      if (idx >= 0) list[idx] = data;
      else list.unshift(data);
    } else if (typeof data.html === "string" && data.html) {
      list.unshift(data);
    }
    w[APPS_KEY] = list.slice(0, 60);
    window.dispatchEvent(new CustomEvent(APPS_CHANGED_EVENT));
  } catch {
  }
}
function themeBase() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--muted",
      "--muted-foreground",
      "--primary",
      "--primary-foreground",
      "--border",
      "--accent"
    ];
    const pairs = names.map((n) => {
      const v = cs.getPropertyValue(n).trim();
      return v ? `${n}:${v}` : "";
    }).filter(Boolean);
    const dark = document.documentElement.dataset.theme?.includes("dark") || document.body.classList.contains("dark");
    pairs.push(`color-scheme:${dark ? "dark" : "light"}`);
    return `<style>:root{${pairs.join(";")}}html,body{background:transparent;color:var(--foreground,#e8e8ea)}</style>`;
  } catch {
    return "";
  }
}
function buildSrcDoc(html, withTheme) {
  const trimmed = html.trim();
  const doc = /<html[\s>]/i.test(trimmed) ? trimmed : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${trimmed}</body></html>`;
  if (!withTheme) return doc;
  const base = themeBase();
  if (!base) return doc;
  return /<head[^>]*>/i.test(doc) ? doc.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + doc;
}
function framePolicy(source) {
  if (source === "flashforge") {
    return { sandbox: "allow-scripts allow-pointer-lock", allow: "autoplay", withTheme: false };
  }
  return {
    sandbox: "allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock",
    allow: "autoplay",
    withTheme: true
  };
}

// src/card.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Notice({ text }) {
  return /* @__PURE__ */ jsx("div", { className: "my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary", children: text });
}
var InteractivePanelCard = memo(function InteractivePanelCard2(props) {
  const data = props.data && typeof props.data === "object" ? props.data : null;
  useEffect(() => {
    if (data) rememberApp(data);
  }, [data]);
  if (!data) return /* @__PURE__ */ jsx(Notice, { text: `\u4EA4\u4E92\u9762\u677F\u6570\u636E\u89E3\u6790\u5931\u8D25\uFF08${props.toolName}\uFF09` });
  if (typeof data.html !== "string" || !data.html) {
    if (data.sourcePath || data.previewId) {
      return /* @__PURE__ */ jsx(
        Notice,
        {
          text: `\u4EA4\u4E92\u9762\u677F\u5DF2\u751F\u6210${data.title ? `\uFF1A${data.title}` : ""}${data.versionLabel ? ` \xB7 ${data.versionLabel}` : ""}${data.sourcePath ? ` \xB7 ${data.sourcePath}` : ""}`
        }
      );
    }
    return /* @__PURE__ */ jsx(Notice, { text: `\u4EA4\u4E92\u9762\u677F\u6570\u636E\u89E3\u6790\u5931\u8D25\uFF08${props.toolName}\uFF09` });
  }
  return /* @__PURE__ */ jsx(PanelFrame, { data });
});
function PanelFrame({ data }) {
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef(null);
  const policy = useMemo(() => framePolicy(data.source), [data.source]);
  const srcDoc = useMemo(
    () => buildSrcDoc(data.html, policy.withTheme),
    [data.html, policy.withTheme]
  );
  const title = String(data.title || "\u4EA4\u4E92\u9762\u677F");
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        frameRef.current?.contentWindow?.postMessage(
          { __polarisMute: 1, muted: next },
          "*"
        );
      } catch {
      }
      return next;
    });
  }, []);
  const copySourcePath = useCallback(() => {
    if (!data.sourcePath) return;
    try {
      void navigator.clipboard?.writeText(String(data.sourcePath));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  }, [data.sourcePath]);
  const frame = /* @__PURE__ */ jsx(
    "iframe",
    {
      ref: frameRef,
      title,
      srcDoc,
      sandbox: policy.sandbox,
      allow: policy.allow,
      className: "h-full w-full",
      style: { background: policy.withTheme ? "transparent" : "#ffffff", border: "none" },
      referrerPolicy: "no-referrer"
    }
  );
  const toolbar = /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-border bg-background-elevated px-3 py-1.5", children: [
    /* @__PURE__ */ jsxs("span", { className: "flex min-w-0 items-center gap-1.5", children: [
      /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400", children: "\u4EA4\u4E92\u9762\u677F" }),
      /* @__PURE__ */ jsx("span", { className: "truncate text-xs font-medium text-text-primary", children: title }),
      data.versionLabel ? /* @__PURE__ */ jsx("span", { className: "shrink-0 text-[10px] text-text-tertiary", children: String(data.versionLabel) }) : null,
      data.source === "flashforge" ? /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500", children: "\u95EA\u9020\u5E94\u7528" }) : null
    ] }),
    /* @__PURE__ */ jsxs("span", { className: "flex shrink-0 items-center gap-2", children: [
      /* @__PURE__ */ jsx("button", { type: "button", onClick: toggleMute, title: "\u9759\u97F3\uFF08\u7EC4\u4EF6\u9700\u54CD\u5E94 __polarisMute \u534F\u8BAE\uFF09", className: "text-[10px] text-text-tertiary hover:text-text-primary", children: muted ? "\u53D6\u6D88\u9759\u97F3" : "\u9759\u97F3" }),
      data.sourcePath ? /* @__PURE__ */ jsx("button", { type: "button", onClick: copySourcePath, className: "text-[10px] text-text-tertiary hover:text-text-primary", children: copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u6E90\u7801\u8DEF\u5F84" }) : null,
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setFullscreen(!fullscreen), className: "text-[10px] text-text-tertiary hover:text-text-primary", children: fullscreen ? "\u9000\u51FA\u5168\u5C4F" : "\u5168\u5C4F" }),
      !fullscreen ? /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setExpanded(!expanded), className: "text-[10px] text-text-tertiary hover:text-text-primary", children: expanded ? "\u6536\u8D77" : "\u5C55\u5F00" }) : null
    ] })
  ] });
  if (fullscreen) {
    return /* @__PURE__ */ jsxs("div", { className: "my-2 overflow-hidden rounded-lg border border-border", children: [
      toolbar,
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "fixed inset-0 z-[9999] flex flex-col bg-background",
          style: { top: 0, left: 0, right: 0, bottom: 0 },
          children: [
            /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-hidden", children: frame }),
            /* @__PURE__ */ jsxs("div", { className: "border-t border-border px-3 py-1 text-[10px] text-text-tertiary", children: [
              "\u6309 Esc \u9000\u51FA\u5168\u5C4F \xB7 \u6C99\u7BB1 iframe\uFF08",
              policy.sandbox,
              "\uFF09"
            ] })
          ]
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "my-2 overflow-hidden rounded-lg border border-border", children: [
    toolbar,
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "overflow-hidden transition-[height] duration-200",
        style: { height: expanded ? "70vh" : "360px" },
        children: frame
      }
    )
  ] });
}
var card_default = InteractivePanelCard;
export {
  InteractivePanelCard,
  card_default as default
};
