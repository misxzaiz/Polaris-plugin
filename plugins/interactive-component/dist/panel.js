// src/panel.tsx
import { memo, useEffect, useMemo, useState } from "react";

// src/shared.ts
var APPS_KEY = "__POLARIS_INTERACTIVE_APPS__";
var APPS_CHANGED_EVENT = "polaris:interactive-apps-changed";
function readApps() {
  try {
    const w = window;
    return Array.isArray(w[APPS_KEY]) ? w[APPS_KEY] : [];
  } catch {
    return [];
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

// src/panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var InteractivePanel = memo(function InteractivePanel2() {
  const [apps, setApps] = useState(() => readApps());
  const [selected, setSelected] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const refresh = () => setApps(readApps());
    window.addEventListener(APPS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(APPS_CHANGED_EVENT, refresh);
  }, []);
  const current = useMemo(() => {
    if (!apps.length) return null;
    return apps.find((a) => a.previewId && a.previewId === selected) ?? apps[0];
  }, [apps, selected]);
  useEffect(() => {
    if (!fullscreen || !current || typeof current.html !== "string") return;
    const p = framePolicy(current.source);
    return openFullscreenOverlay({
      title: String(current.title || "\u4EA4\u4E92\u9762\u677F"),
      meta: current.versionLabel ? String(current.versionLabel) : void 0,
      srcDoc: buildSrcDoc(current.html, p.withTheme),
      sandbox: p.sandbox,
      allow: p.allow,
      frameBg: p.withTheme ? "transparent" : "#ffffff",
      onClose: () => setFullscreen(false)
    });
  }, [fullscreen, current]);
  const policy = current ? framePolicy(current.source) : null;
  const srcDoc = current && typeof current.html === "string" ? buildSrcDoc(current.html, policy ? policy.withTheme : true) : "";
  const title = String(current?.title || "\u4EA4\u4E92\u9762\u677F");
  const runner = (className) => /* @__PURE__ */ jsx(
    "iframe",
    {
      title,
      srcDoc,
      sandbox: policy ? policy.sandbox : "allow-scripts allow-pointer-lock",
      allow: "autoplay",
      className,
      style: { border: "none", background: "#ffffff" },
      referrerPolicy: "no-referrer"
    }
  );
  if (!apps.length) {
    return /* @__PURE__ */ jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-2 p-6 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "text-sm font-medium text-text-primary", children: "\u4EA4\u4E92\u9762\u677F" }),
      /* @__PURE__ */ jsx("div", { className: "max-w-xs text-xs leading-relaxed text-text-secondary", children: "\u5728\u5BF9\u8BDD\u4E2D\u8BA9 AI \u7528 render_component \u751F\u6210\u4E00\u4E2A\u4EA4\u4E92\u7EC4\u4EF6\uFF0C\u6216\u5148\u7528\u95EA\u9020\u7684 ff_source \u8BFB\u53D6\u5E94\u7528\u6E90\u7801\u518D\u4EA4\u7ED9\u4EA4\u4E92\u9762\u677F\uFF0C\u8FD9\u91CC\u5C31\u4F1A\u51FA\u73B0\u53EF\u8FD0\u884C\u7684\u5E94\u7528\u3002" }),
      /* @__PURE__ */ jsx("div", { className: "text-[10px] text-text-tertiary", children: "\u5E94\u7528\u4EC5\u5728\u672C\u4F1A\u8BDD\u5185\u4FDD\u7559\uFF1B\u6301\u4E45\u5316\u8BF7\u7528\u95EA\u9020\u3002" })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-3 py-2", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-text-primary", children: "\u4EA4\u4E92\u9762\u677F \xB7 \u5E94\u7528\u67B6" }),
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-text-tertiary", children: [
          apps.length,
          " \u4E2A\u5E94\u7528"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setFullscreen(true),
            className: "text-[10px] text-text-tertiary hover:text-text-primary",
            children: "\u5168\u5C4F\u8FD0\u884C"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-1 overflow-hidden", children: [
      /* @__PURE__ */ jsx("div", { className: "w-48 shrink-0 overflow-y-auto border-r border-border", children: apps.map((a, i) => {
        const key = a.previewId || `app-${i}`;
        const active2 = current === a;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setSelected(a.previewId || null),
            className: "block w-full truncate border-b border-border px-3 py-2 text-left text-xs " + (active2 ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-background-elevated"),
            children: [
              String(a.title || "\u672A\u547D\u540D\u5E94\u7528"),
              a.versionLabel ? ` \xB7 ${a.versionLabel}` : ""
            ]
          },
          key
        );
      }) }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-1 flex-col overflow-hidden", children: current && typeof current.html === "string" ? runner("h-full w-full flex-1") : /* @__PURE__ */ jsx("div", { className: "flex flex-1 items-center justify-center text-xs text-text-secondary", children: "\u8BE5\u5E94\u7528\u6CA1\u6709\u53EF\u8FD0\u884C\u7684 HTML" }) })
    ] })
  ] });
});
var panel_default = InteractivePanel;
export {
  InteractivePanel,
  panel_default as default
};
