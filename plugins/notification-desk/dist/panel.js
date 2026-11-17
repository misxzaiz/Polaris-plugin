// src/NotificationCenterPanel.tsx
import { useEffect, useRef } from "react";

// src/i18nShim.ts
function hostI18n() {
  return globalThis.__POLARIS_APP_CORE__?.i18n;
}
function useTranslation(...namespaces) {
  const inst = hostI18n();
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : void 0;
  if (!inst) {
    return { t: (key, opts) => key, i18n: void 0 };
  }
  return {
    t: (key, opts) => inst.t(key, { ns, ...typeof opts === "object" && opts ? opts : {} }),
    i18n: inst
  };
}

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
};

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
  }, ref) => createElement(
    "svg",
    {
      ref,
      ...defaultAttributes,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: mergeClasses("lucide", className),
      ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
      ...rest
    },
    [
      ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/check-check.js
var __iconNode = [
  ["path", { d: "M18 6 7 17l-5-5", key: "116fxf" }],
  ["path", { d: "m22 10-7.5 7.5L13 16", key: "ke71qq" }]
];
var CheckCheck = createLucideIcon("check-check", __iconNode);

// node_modules/lucide-react/dist/esm/icons/circle-check-big.js
var __iconNode2 = [
  ["path", { d: "M21.801 10A10 10 0 1 1 17 3.335", key: "yps3ct" }],
  ["path", { d: "m9 11 3 3L22 4", key: "1pflzl" }]
];
var CircleCheckBig = createLucideIcon("circle-check-big", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/circle-x.js
var __iconNode3 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
];
var CircleX = createLucideIcon("circle-x", __iconNode3);

// node_modules/lucide-react/dist/esm/icons/inbox.js
var __iconNode4 = [
  ["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12", key: "o97t9d" }],
  [
    "path",
    {
      d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      key: "oot6mr"
    }
  ]
];
var Inbox = createLucideIcon("inbox", __iconNode4);

// node_modules/lucide-react/dist/esm/icons/info.js
var __iconNode5 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
];
var Info = createLucideIcon("info", __iconNode5);

// node_modules/lucide-react/dist/esm/icons/trash-2.js
var __iconNode6 = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
];
var Trash2 = createLucideIcon("trash-2", __iconNode6);

// node_modules/lucide-react/dist/esm/icons/triangle-alert.js
var __iconNode7 = [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
];
var TriangleAlert = createLucideIcon("triangle-alert", __iconNode7);

// node_modules/lucide-react/dist/esm/icons/x.js
var __iconNode8 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("x", __iconNode8);

// src/deps.ts
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u3002");
  return c;
}
var useToastStore = new Proxy(function() {
}, {
  apply: (_t, _this, args) => core().stores.useToastStore(...args),
  get: (_t, prop) => {
    const hook = core().stores.useToastStore;
    const v = hook?.[prop];
    return typeof v === "function" ? v.bind(hook) : v;
  }
});
function cn(...args) {
  return core().utils.cn(...args);
}

// src/NotificationCenterPanel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function sessionDirectory() {
  const direct = window.__POLARIS_APP_CORE__?.stores?.sessionDirectoryStore;
  if (direct) return direct;
  throw new Error("sessionDirectoryStore \u4E0D\u53EF\u7528");
}
var iconMap = {
  success: CircleCheckBig,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  session_complete: CircleCheckBig
};
var colorMap = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-primary",
  session_complete: "text-success"
};
function NotificationCenterPanel(props) {
  const { onClose } = props ?? {};
  const { t } = useTranslation("common");
  const notifications = useToastStore((s) => s.notifications);
  const markAllNotificationsRead = useToastStore((s) => s.markAllNotificationsRead);
  const clearNotifications = useToastStore((s) => s.clearNotifications);
  const newIdsRef = useRef(/* @__PURE__ */ new Set());
  useEffect(() => {
    const unread = useToastStore.getState().notifications.filter((n) => !n.read);
    newIdsRef.current = new Set(unread.map((n) => n.id));
  }, []);
  const formatTime = (ts) => {
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 6e4);
    const hours = Math.floor(diffMs / 36e5);
    const days = Math.floor(diffMs / 864e5);
    if (mins < 1) return t("notificationCenter.justNow");
    if (mins < 60) return t("notificationCenter.minutesAgo", { count: mins });
    if (hours < 24) return t("notificationCenter.hoursAgo", { count: hours });
    return t("notificationCenter.daysAgo", { count: days });
  };
  const handleSwitch = (n) => {
    if (n.sessionId) {
      sessionDirectory().getState().switchSession(n.sessionId);
    }
    onClose?.();
  };
  const items = [...notifications].reverse();
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border shrink-0", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-base font-semibold text-text-primary", children: t("notificationCenter.title") }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: markAllNotificationsRead,
            disabled: notifications.length === 0,
            className: "p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            title: t("notificationCenter.markAllRead"),
            children: /* @__PURE__ */ jsx(CheckCheck, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: clearNotifications,
            disabled: notifications.length === 0,
            className: "p-1.5 rounded-md text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            title: t("notificationCenter.clear"),
            children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: onClose,
            className: "p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors",
            title: t("toast.close"),
            children: /* @__PURE__ */ jsx(X, { className: "w-4 h-4" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto min-h-0", children: items.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full p-8 text-text-tertiary", children: [
      /* @__PURE__ */ jsx(Inbox, { className: "w-12 h-12 mb-4 opacity-50" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm", children: t("notificationCenter.empty") })
    ] }) : /* @__PURE__ */ jsx("ul", { children: items.map((n, index) => {
      const Icon2 = iconMap[n.type];
      const isNew = newIdsRef.current.has(n.id);
      return /* @__PURE__ */ jsxs(
        "li",
        {
          className: cn(
            "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background-hover",
            index > 0 && "border-t border-border-subtle",
            isNew && "bg-primary/5"
          ),
          children: [
            /* @__PURE__ */ jsx(Icon2, { className: cn("w-4 h-4 shrink-0 mt-0.5", colorMap[n.type]) }),
            /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsx("div", { className: "text-sm font-medium text-text-primary break-words", children: n.title }),
              n.message && /* @__PURE__ */ jsx("div", { className: "text-xs text-text-secondary mt-0.5 break-words", children: n.message }),
              /* @__PURE__ */ jsx("div", { className: "text-[11px] text-text-tertiary mt-1", children: formatTime(n.timestamp) })
            ] }),
            n.type === "session_complete" && n.sessionId && /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => handleSwitch(n),
                className: "shrink-0 self-center px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors",
                children: t("notificationCenter.switch")
              }
            )
          ]
        },
        n.id
      );
    }) }) })
  ] });
}
export {
  NotificationCenterPanel,
  NotificationCenterPanel as default
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/defaultAttributes.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/check-check.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-check-big.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-x.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/inbox.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/info.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/trash-2.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/triangle-alert.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/x.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
