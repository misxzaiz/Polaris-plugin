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
    if (!fullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);
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
        const active = current === a;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setSelected(a.previewId || null),
            className: "block w-full truncate border-b border-border px-3 py-2 text-left text-xs " + (active ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-background-elevated"),
            children: [
              String(a.title || "\u672A\u547D\u540D\u5E94\u7528"),
              a.versionLabel ? ` \xB7 ${a.versionLabel}` : ""
            ]
          },
          key
        );
      }) }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-1 flex-col overflow-hidden", children: current && typeof current.html === "string" ? runner("h-full w-full flex-1") : /* @__PURE__ */ jsx("div", { className: "flex flex-1 items-center justify-center text-xs text-text-secondary", children: "\u8BE5\u5E94\u7528\u6CA1\u6709\u53EF\u8FD0\u884C\u7684 HTML" }) })
    ] }),
    fullscreen && current ? /* @__PURE__ */ jsxs(
      "div",
      {
        className: "fixed inset-0 z-[9999] flex flex-col bg-background",
        style: { top: 0, left: 0, right: 0, bottom: 0 },
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-3 py-2", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-text-primary", children: title }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setFullscreen(false),
                className: "text-[10px] text-text-tertiary hover:text-text-primary",
                children: "\u9000\u51FA\u5168\u5C4F\uFF08Esc\uFF09"
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-hidden", children: runner("h-full w-full") })
        ]
      }
    ) : null
  ] });
});
var panel_default = InteractivePanel;
export {
  InteractivePanel,
  panel_default as default
};
