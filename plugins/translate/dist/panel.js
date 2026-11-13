// src/Panel.tsx
import { useState, useCallback, useEffect } from "react";

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement } from "react";

// node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/lucide-react/dist/esm/Icon.js
var Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/arrow-right-left.js
var ArrowRightLeft = createLucideIcon("ArrowRightLeft", [
  ["path", { d: "m16 3 4 4-4 4", key: "1x1c3m" }],
  ["path", { d: "M20 7H4", key: "zbl0bi" }],
  ["path", { d: "m8 21-4-4 4-4", key: "h9nckh" }],
  ["path", { d: "M4 17h16", key: "g4d7ey" }]
]);

// node_modules/lucide-react/dist/esm/icons/check.js
var Check = createLucideIcon("Check", [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]]);

// node_modules/lucide-react/dist/esm/icons/clock.js
var Clock = createLucideIcon("Clock", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["polyline", { points: "12 6 12 12 16 14", key: "68esgv" }]
]);

// node_modules/lucide-react/dist/esm/icons/copy.js
var Copy = createLucideIcon("Copy", [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
]);

// node_modules/lucide-react/dist/esm/icons/languages.js
var Languages = createLucideIcon("Languages", [
  ["path", { d: "m5 8 6 6", key: "1wu5hv" }],
  ["path", { d: "m4 14 6-6 2-3", key: "1k1g8d" }],
  ["path", { d: "M2 5h12", key: "or177f" }],
  ["path", { d: "M7 2h1", key: "1t2jsx" }],
  ["path", { d: "m22 22-5-10-5 10", key: "don7ne" }],
  ["path", { d: "M14 18h6", key: "1m8k6r" }]
]);

// node_modules/lucide-react/dist/esm/icons/loader-circle.js
var LoaderCircle = createLucideIcon("LoaderCircle", [
  ["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]
]);

// node_modules/lucide-react/dist/esm/icons/send.js
var Send = createLucideIcon("Send", [
  [
    "path",
    {
      d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
      key: "1ffxy3"
    }
  ],
  ["path", { d: "m21.854 2.147-10.94 10.939", key: "12cjpa" }]
]);

// node_modules/lucide-react/dist/esm/icons/trash-2.js
var Trash2 = createLucideIcon("Trash2", [
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", key: "4alrt4" }],
  ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", key: "v07s0e" }],
  ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }],
  ["line", { x1: "14", x2: "14", y1: "11", y2: "17", key: "xtxkd" }]
]);

// src/bridge.ts
function globals() {
  return window;
}
function getHostInvoke() {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__");
  return fn;
}
var SERVICE_ID = "translate-service";
async function callTranslate(text, to) {
  const invoke = getHostInvoke();
  const res = await invoke(
    "router_dispatch",
    {
      req: {
        target: "cap.pluginServiceManager",
        payload: {
          action: "request",
          serviceId: SERVICE_ID,
          path: "/translate",
          body: { text, to }
        }
      }
    }
  );
  if (res && res.ok === false) {
    return { success: false, result: null, error: res.error || "\u5BBF\u4E3B\u8F6C\u53D1\u5931\u8D25" };
  }
  const inner = res && res.result;
  if (inner && typeof inner.success === "boolean") {
    return { success: inner.success, result: inner.result ?? null, error: inner.error ?? null };
  }
  if (inner && inner.ok === false) {
    return { success: false, result: null, error: inner.error || "service \u8C03\u7528\u5931\u8D25" };
  }
  return { success: false, result: null, error: res && res.error || "service \u8C03\u7528\u5931\u8D25" };
}

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var DIRECTIONS = [
  { id: "toEn", label: "\u4E2D \u2192 \u82F1", to: "en" },
  { id: "toZh", label: "\u82F1 \u2192 \u4E2D", to: "zh" }
];
function loadHistory() {
  try {
    const raw = localStorage.getItem("translate-history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function TranslatePanel({ onSendToChat }) {
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [direction, setDirection] = useState("toEn");
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setHistory(loadHistory());
  }, []);
  const persistHistory = (items) => {
    setHistory(items);
    try {
      localStorage.setItem("translate-history", JSON.stringify(items.slice(0, 50)));
    } catch {
    }
  };
  const handleTranslate = useCallback(async () => {
    const text = sourceText.trim();
    if (!text) return;
    setIsTranslating(true);
    setError(null);
    try {
      const to = direction === "toEn" ? "en" : "zh";
      const out = await callTranslate(text, to);
      if (out.success && out.result) {
        setTranslatedText(out.result);
        persistHistory([
          { id: `${Date.now()}`, sourceText: text, translatedText: out.result, direction, timestamp: Date.now() },
          ...history
        ]);
      } else {
        setError(out.error || "\u7FFB\u8BD1\u5931\u8D25");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsTranslating(false);
    }
  }, [sourceText, direction, history]);
  const handleCopy = async () => {
    if (translatedText) {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    }
  };
  const handleSendToChat = () => {
    if (translatedText && onSendToChat) void onSendToChat(translatedText);
  };
  const dirLabel = DIRECTIONS.find((d) => d.id === direction)?.label || "";
  return /* @__PURE__ */ jsxs("div", { className: "tp-root", children: [
    /* @__PURE__ */ jsxs("div", { className: "tp-header", children: [
      /* @__PURE__ */ jsxs("div", { className: "tp-title", children: [
        /* @__PURE__ */ jsx(Languages, { size: 16, className: "text-primary" }),
        /* @__PURE__ */ jsx("span", { children: "\u7FFB\u8BD1" })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "tp-btn", style: { flex: "none", padding: "2px 8px" }, onClick: () => setShowHistory((v) => !v), title: "\u5386\u53F2\u8BB0\u5F55", children: /* @__PURE__ */ jsx(Clock, { size: 13 }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tp-dir", children: [
      DIRECTIONS.map((d) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `tp-dir-btn ${direction === d.id ? "tp-dir-on" : ""}`,
          onClick: () => setDirection(d.id),
          children: d.label
        },
        d.id
      )),
      /* @__PURE__ */ jsx(ArrowRightLeft, { size: 12, className: "text-text-tertiary" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "tp-body", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: sourceText,
          onChange: (e) => setSourceText(e.target.value),
          placeholder: direction === "toEn" ? "\u8F93\u5165\u4E2D\u6587\u2026" : "\u8F93\u5165\u82F1\u6587\u2026",
          className: "tp-area"
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: "tp-btn tp-primary",
          style: { flex: "none", padding: "6px 16px" },
          onClick: () => void handleTranslate(),
          disabled: isTranslating || !sourceText.trim(),
          children: [
            isTranslating ? /* @__PURE__ */ jsx(LoaderCircle, { size: 13, className: "animate-spin" }) : /* @__PURE__ */ jsx(ArrowRightLeft, { size: 13 }),
            "\u7FFB\u8BD1\uFF08",
            dirLabel,
            "\uFF09"
          ]
        }
      ) }),
      /* @__PURE__ */ jsx("div", { className: "tp-out", children: translatedText || /* @__PURE__ */ jsx("span", { className: "text-text-tertiary", children: "\u8BD1\u6587" }) }),
      error && /* @__PURE__ */ jsx("div", { className: "tp-error", children: error }),
      /* @__PURE__ */ jsxs("div", { className: "tp-actions", children: [
        /* @__PURE__ */ jsxs("button", { type: "button", className: "tp-btn", onClick: () => void handleCopy(), disabled: !translatedText, children: [
          copied ? /* @__PURE__ */ jsx(Check, { size: 13, className: "text-status-success" }) : /* @__PURE__ */ jsx(Copy, { size: 13 }),
          "\u590D\u5236\u8BD1\u6587"
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", className: "tp-btn", onClick: handleSendToChat, disabled: !translatedText || !onSendToChat, children: [
          /* @__PURE__ */ jsx(Send, { size: 13 }),
          "\u9001\u56DE\u4F1A\u8BDD"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "tp-btn",
            style: { flex: "none", padding: "6px 10px" },
            onClick: () => {
              setSourceText("");
              setTranslatedText("");
              setError(null);
            },
            children: /* @__PURE__ */ jsx(Trash2, { size: 13 })
          }
        )
      ] }),
      showHistory && /* @__PURE__ */ jsxs("div", { className: "tp-hist", children: [
        history.length === 0 && /* @__PURE__ */ jsx("div", { style: { padding: "12px", fontSize: 12, color: "rgb(var(--c-text-tertiary))" }, children: "\u6682\u65E0\u5386\u53F2" }),
        history.map((h) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: "tp-hist-item",
            onClick: () => {
              setSourceText(h.sourceText);
              setTranslatedText(h.translatedText);
              setShowHistory(false);
            },
            children: [
              /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "rgb(var(--c-text-primary))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: h.sourceText }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "rgb(var(--c-text-tertiary))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: h.translatedText })
            ]
          },
          h.id
        ))
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function TranslatePanelEntry(props) {
  return /* @__PURE__ */ jsx2(TranslatePanel, { ...props });
}
export {
  TranslatePanel,
  TranslatePanelEntry as default
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/defaultAttributes.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/arrow-right-left.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/check.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/clock.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/copy.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/languages.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/send.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/trash-2.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
