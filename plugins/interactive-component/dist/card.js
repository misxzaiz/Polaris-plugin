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

// src/fullscreen.ts
var TOPBAR_OFFSET_PX = 40;
var Z_OVERLAY = "var(--z-overlay, 40)";
var active = null;
function teardown() {
  if (!active) return;
  const { root, detach } = active;
  active = null;
  detach();
  root.remove();
}
function openFullscreenOverlay(opts) {
  teardown();
  const root = document.createElement("div");
  root.className = "flex flex-col bg-background";
  Object.assign(root.style, {
    position: "fixed",
    top: `${TOPBAR_OFFSET_PX}px`,
    left: "0",
    right: "0",
    bottom: "0"
  });
  root.style.setProperty("z-index", Z_OVERLAY);
  const bar = document.createElement("div");
  bar.className = "flex items-center justify-between gap-2 border-b border-border bg-background-elevated";
  Object.assign(bar.style, {
    height: "48px",
    flex: "0 0 48px",
    padding: "0 14px"
  });
  const left = document.createElement("div");
  left.className = "flex min-w-0 items-center gap-2";
  const chip = document.createElement("span");
  chip.className = "shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400";
  chip.textContent = "\u4EA4\u4E92\u9762\u677F";
  const titleEl = document.createElement("span");
  titleEl.className = "truncate text-xs font-medium text-text-primary";
  titleEl.textContent = opts.title;
  left.append(chip, titleEl);
  if (opts.meta) {
    const meta = document.createElement("span");
    meta.className = "shrink-0 text-[10px] text-text-tertiary";
    meta.textContent = opts.meta;
    left.appendChild(meta);
  }
  const right = document.createElement("div");
  right.className = "flex shrink-0 items-center gap-2";
  for (const action of opts.actions ?? []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-[10px] text-text-tertiary hover:text-text-primary";
    btn.textContent = action.label;
    btn.onclick = action.onClick;
    right.appendChild(btn);
  }
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "bg-red-500 text-white";
  exit.textContent = "\u2715 \u9000\u51FA\u5168\u5C4F";
  Object.assign(exit.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "6px",
    border: "none",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer"
  });
  exit.onclick = opts.onClose;
  right.appendChild(exit);
  bar.append(left, right);
  const content = document.createElement("div");
  content.className = "flex-1 overflow-hidden";
  const frame = document.createElement("iframe");
  frame.title = opts.title;
  frame.setAttribute("sandbox", opts.sandbox);
  frame.setAttribute("allow", opts.allow);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.srcdoc = opts.srcDoc;
  Object.assign(frame.style, {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
    background: opts.frameBg
  });
  content.appendChild(frame);
  opts.onFrame?.(frame);
  root.append(bar, content);
  const onKey = (e) => {
    if (e.key === "Escape") opts.onClose();
  };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(root);
  active = { root, detach: () => document.removeEventListener("keydown", onKey) };
  return () => {
    if (active?.root === root) teardown();
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
  const fsFrameRef = useRef(null);
  const policy = useMemo(() => framePolicy(data.source), [data.source]);
  const srcDoc = useMemo(
    () => buildSrcDoc(data.html, policy.withTheme),
    [data.html, policy.withTheme]
  );
  const title = String(data.title || "\u4EA4\u4E92\u9762\u677F");
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        const msg = { __polarisMute: 1, muted: next };
        frameRef.current?.contentWindow?.postMessage(msg, "*");
        fsFrameRef.current?.contentWindow?.postMessage(msg, "*");
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
  const liveRef = useRef({ toggleMute, copySourcePath });
  liveRef.current = { toggleMute, copySourcePath };
  useEffect(() => {
    if (!fullscreen) return;
    const meta = [data.versionLabel, data.source === "flashforge" ? "\u95EA\u9020\u5E94\u7528" : null].filter(Boolean).map(String).join(" \xB7 ");
    const close = openFullscreenOverlay({
      title,
      meta: meta || void 0,
      srcDoc,
      sandbox: policy.sandbox,
      allow: policy.allow,
      frameBg: policy.withTheme ? "transparent" : "#ffffff",
      actions: [
        { label: "\u9759\u97F3", onClick: () => liveRef.current.toggleMute() },
        ...data.sourcePath ? [{ label: "\u590D\u5236\u6E90\u7801\u8DEF\u5F84", onClick: () => liveRef.current.copySourcePath() }] : []
      ],
      onFrame: (f) => {
        fsFrameRef.current = f;
      },
      onClose: () => setFullscreen(false)
    });
    return () => {
      fsFrameRef.current = null;
      close();
    };
  }, [fullscreen, title, srcDoc, policy, data.versionLabel, data.source, data.sourcePath]);
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
