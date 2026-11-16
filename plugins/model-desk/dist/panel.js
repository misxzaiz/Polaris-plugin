// src/index.tsx
import { useEffect as useEffect4, useMemo as useMemo4, useState as useState4 } from "react";
import { useTranslation as useTranslation4 } from "react-i18next";

// src/ModelProviderTab.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";

// src/deps.ts
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  return c;
}
var useModelProfileStore = new Proxy({}, {
  get: (_t, p) => core().stores.useModelProfileStore[p]
});
var useSessionConfig = new Proxy({}, {
  get: (_t, p) => core().stores.useSessionConfig[p]
});
var useEngineMetadataStore = new Proxy({}, {
  get: (_t, p) => core().stores.useEngineMetadataStore[p]
});
var useToastStore = new Proxy({}, {
  get: (_t, p) => core().stores.useToastStore[p]
});
var useConfigStore = new Proxy({}, {
  get: (_t, p) => core().stores.useConfigStore[p]
});
var sessionStoreManager = new Proxy({}, {
  get: (_t, p) => core().stores.sessionStoreManager[p]
});
function getSessionDirectorySnapshot() {
  const s = core().stores.sessionStoreManager.getState();
  return { metadataMap: s.sessionMetadata, activeSessionId: s.activeSessionId };
}
function getEngineDisplayName(...args) {
  const svc = core().services;
  const fn = svc.engineDisplay?.getEngineDisplayName ?? svc.getEngineDisplayName;
  return fn(...args);
}
async function testModelProfileConnection(profile) {
  return core().services.transport.invoke("test_model_profile_connection", { profile });
}
async function fetchModelsForProfile(profile) {
  return core().services.transport.invoke("fetch_models_for_profile", { profile });
}

// src/modelProfile.ts
var ALL_ENGINES = ["claude", "simple-ai"];
var OFFICIAL_API_PROFILE = "__official_api__";
function resolveTargetEngines(profile) {
  if (profile.targetEngines && profile.targetEngines.length > 0) {
    return profile.targetEngines;
  }
  const old = profile.targetEngine;
  if (!old || old === "both" || old === "all") {
    return [];
  }
  return [old];
}
function isProfileForEngine(profile, engine) {
  const engines = resolveTargetEngines(profile);
  return engines.length === 0 || engines.includes(engine);
}
function resolveAuthType(profile) {
  return profile.authType ?? "auth_token";
}

// src/logger.ts
function createLogger(scope) {
  const fmt2 = (msg) => `[${scope}] ${msg}`;
  return {
    debug: (msg, ...rest) => {
      if (import.meta.env?.DEV) console.debug(fmt2(msg), ...rest);
    },
    info: (msg, ...rest) => console.info(fmt2(msg), ...rest),
    warn: (msg, ...rest) => console.warn(fmt2(msg), ...rest),
    error: (msg, ...rest) => console.error(fmt2(msg), ...rest)
  };
}

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}
async function patchConfigTop(patch) {
  const invoke = getHostInvoke();
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    return invoke("config_patch_via_bus", {
      req: { target: "cap.config", payload: { action: "patch", patch } }
    });
  }
  const res = await invoke("router_dispatch", {
    target: "cap.config",
    payload: { action: "patch", patch }
  });
  if (res && typeof res === "object" && "ok" in res) {
    if (!res.ok) throw new Error(res.error || "cap.config patch \u5931\u8D25");
    return res.result;
  }
  return res;
}
async function hostInvoke(cmd, args) {
  return getHostInvoke()(cmd, args);
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

// node_modules/lucide-react/dist/esm/icons/calendar.js
var __iconNode = [
  ["path", { d: "M8 2v4", key: "1cmpym" }],
  ["path", { d: "M16 2v4", key: "4m81vk" }],
  ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", key: "1hopcy" }],
  ["path", { d: "M3 10h18", key: "8toen8" }]
];
var Calendar = createLucideIcon("calendar", __iconNode);

// node_modules/lucide-react/dist/esm/icons/chart-column.js
var __iconNode2 = [
  ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16", key: "c24i48" }],
  ["path", { d: "M18 17V9", key: "2bz60n" }],
  ["path", { d: "M13 17V5", key: "1frdt8" }],
  ["path", { d: "M8 17v-3", key: "17ska0" }]
];
var ChartColumn = createLucideIcon("chart-column", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/chart-pie.js
var __iconNode3 = [
  [
    "path",
    {
      d: "M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z",
      key: "pzmjnu"
    }
  ],
  ["path", { d: "M21.21 15.89A10 10 0 1 1 8 2.83", key: "k2fpak" }]
];
var ChartPie = createLucideIcon("chart-pie", __iconNode3);

// node_modules/lucide-react/dist/esm/icons/check.js
var __iconNode4 = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
var Check = createLucideIcon("check", __iconNode4);

// node_modules/lucide-react/dist/esm/icons/chevron-down.js
var __iconNode5 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
var ChevronDown = createLucideIcon("chevron-down", __iconNode5);

// node_modules/lucide-react/dist/esm/icons/chevron-left.js
var __iconNode6 = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]];
var ChevronLeft = createLucideIcon("chevron-left", __iconNode6);

// node_modules/lucide-react/dist/esm/icons/chevron-right.js
var __iconNode7 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]];
var ChevronRight = createLucideIcon("chevron-right", __iconNode7);

// node_modules/lucide-react/dist/esm/icons/copy.js
var __iconNode8 = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
];
var Copy = createLucideIcon("copy", __iconNode8);

// node_modules/lucide-react/dist/esm/icons/database.js
var __iconNode9 = [
  ["ellipse", { cx: "12", cy: "5", rx: "9", ry: "3", key: "msslwz" }],
  ["path", { d: "M3 5V19A9 3 0 0 0 21 19V5", key: "1wlel7" }],
  ["path", { d: "M3 12A9 3 0 0 0 21 12", key: "mv7ke4" }]
];
var Database = createLucideIcon("database", __iconNode9);

// node_modules/lucide-react/dist/esm/icons/download.js
var __iconNode10 = [
  ["path", { d: "M12 15V3", key: "m9g1x1" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }]
];
var Download = createLucideIcon("download", __iconNode10);

// node_modules/lucide-react/dist/esm/icons/eye-off.js
var __iconNode11 = [
  [
    "path",
    {
      d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
      key: "ct8e1f"
    }
  ],
  ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242", key: "151rxh" }],
  [
    "path",
    {
      d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
      key: "13bj9a"
    }
  ],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }]
];
var EyeOff = createLucideIcon("eye-off", __iconNode11);

// node_modules/lucide-react/dist/esm/icons/eye.js
var __iconNode12 = [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      key: "1nclc0"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
];
var Eye = createLucideIcon("eye", __iconNode12);

// node_modules/lucide-react/dist/esm/icons/globe.js
var __iconNode13 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", key: "13o1zl" }],
  ["path", { d: "M2 12h20", key: "9i4pu4" }]
];
var Globe = createLucideIcon("globe", __iconNode13);

// node_modules/lucide-react/dist/esm/icons/key-round.js
var __iconNode14 = [
  [
    "path",
    {
      d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
      key: "1s6t7t"
    }
  ],
  ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor", key: "w0ekpg" }]
];
var KeyRound = createLucideIcon("key-round", __iconNode14);

// node_modules/lucide-react/dist/esm/icons/loader-circle.js
var __iconNode15 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
var LoaderCircle = createLucideIcon("loader-circle", __iconNode15);

// node_modules/lucide-react/dist/esm/icons/pencil.js
var __iconNode16 = [
  [
    "path",
    {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      key: "1a8usu"
    }
  ],
  ["path", { d: "m15 5 4 4", key: "1mk7zo" }]
];
var Pencil = createLucideIcon("pencil", __iconNode16);

// node_modules/lucide-react/dist/esm/icons/plus.js
var __iconNode17 = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
];
var Plus = createLucideIcon("plus", __iconNode17);

// node_modules/lucide-react/dist/esm/icons/refresh-cw.js
var __iconNode18 = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
];
var RefreshCw = createLucideIcon("refresh-cw", __iconNode18);

// node_modules/lucide-react/dist/esm/icons/search.js
var __iconNode19 = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
];
var Search = createLucideIcon("search", __iconNode19);

// node_modules/lucide-react/dist/esm/icons/server.js
var __iconNode20 = [
  ["rect", { width: "20", height: "8", x: "2", y: "2", rx: "2", ry: "2", key: "ngkwjq" }],
  ["rect", { width: "20", height: "8", x: "2", y: "14", rx: "2", ry: "2", key: "iecqi9" }],
  ["line", { x1: "6", x2: "6.01", y1: "6", y2: "6", key: "16zg32" }],
  ["line", { x1: "6", x2: "6.01", y1: "18", y2: "18", key: "nzw8ys" }]
];
var Server = createLucideIcon("server", __iconNode20);

// node_modules/lucide-react/dist/esm/icons/test-tube.js
var __iconNode21 = [
  ["path", { d: "M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2", key: "125lnx" }],
  ["path", { d: "M8.5 2h7", key: "csnxdl" }],
  ["path", { d: "M14.5 16h-5", key: "1ox875" }]
];
var TestTube = createLucideIcon("test-tube", __iconNode21);

// node_modules/lucide-react/dist/esm/icons/trash-2.js
var __iconNode22 = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
];
var Trash2 = createLucideIcon("trash-2", __iconNode22);

// node_modules/lucide-react/dist/esm/icons/trending-up.js
var __iconNode23 = [
  ["path", { d: "M16 7h6v6", key: "box55l" }],
  ["path", { d: "m22 7-8.5 8.5-5-5L2 17", key: "1t1m79" }]
];
var TrendingUp = createLucideIcon("trending-up", __iconNode23);

// node_modules/lucide-react/dist/esm/icons/x.js
var __iconNode24 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("x", __iconNode24);

// node_modules/lucide-react/dist/esm/icons/zap.js
var __iconNode25 = [
  [
    "path",
    {
      d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      key: "1xq2db"
    }
  ]
];
var Zap = createLucideIcon("zap", __iconNode25);

// src/ModelProviderTab.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var log = createLogger("ModelProviderTab");
var CONTEXT_WINDOW_PRESETS = {
  "180k": "180000",
  "256k": "256000",
  "1m": "1000000"
};
var EMPTY_FORM = {
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  modelOptions: [],
  fetchedModels: [],
  wireApi: "anthropic-messages",
  targetEngines: [],
  category: "",
  description: "",
  authType: "auth_token",
  apiKeyEnvName: "",
  customHeaders: [],
  customEnv: [],
  maxTokens: "",
  contextWindow: ""
};
function recordToPairs(record) {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
function pairsToRecord(pairs) {
  const entries = pairs.map((p) => [p.key.trim(), p.value]).filter(([key]) => key.length > 0);
  if (entries.length === 0) return void 0;
  return Object.fromEntries(entries);
}
function parsePositiveInt(s) {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : void 0;
}
function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
function normalizeModelOptions(model, modelOptions = [], fetchedModels = []) {
  return [...new Set([model, ...modelOptions, ...fetchedModels].map((m) => m.trim()).filter(Boolean))];
}
function formToProbeProfile(form) {
  return {
    id: "__probe__",
    name: form.name || "probe",
    baseUrl: form.baseUrl,
    apiKey: form.apiKey,
    model: form.model,
    modelOptions: normalizeModelOptions(form.model, form.modelOptions, form.fetchedModels),
    active: false,
    wireApi: form.wireApi,
    targetEngines: form.targetEngines,
    category: form.category || void 0,
    authType: form.authType,
    apiKeyEnvName: form.apiKeyEnvName || void 0,
    customHeaders: pairsToRecord(form.customHeaders),
    customEnv: pairsToRecord(form.customEnv)
  };
}
function classifyTestFailure(result) {
  const { status } = result;
  if (status === void 0) return { key: "modelProfile.testNetworkError" };
  if (status === 401 || status === 403) return { key: "modelProfile.testAuthFailed", status };
  if (status === 404) return { key: "modelProfile.testNotFound", status };
  if (status >= 500) return { key: "modelProfile.testServerError", status };
  return { key: "modelProfile.testBadStatus", status };
}
function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel
}) {
  const update = (index, patch) => {
    onChange(pairs.map((p, i) => i === index ? { ...p, ...patch } : p));
  };
  const remove = (index) => onChange(pairs.filter((_, i) => i !== index));
  const add = () => onChange([...pairs, { key: "", value: "" }]);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
    pairs.map((pair, index) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          placeholder: keyPlaceholder,
          value: pair.key,
          onChange: (e) => update(index, { key: e.target.value }),
          className: "flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-background-surface border border-border rounded-md outline-none focus:border-primary"
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          placeholder: valuePlaceholder,
          value: pair.value,
          onChange: (e) => update(index, { value: e.target.value }),
          className: "flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-background-surface border border-border rounded-md outline-none focus:border-primary"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => remove(index),
          className: "p-1 text-text-tertiary hover:text-red-500 transition-colors shrink-0",
          children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
        }
      )
    ] }, index)),
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: add,
        className: "flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors",
        children: [
          /* @__PURE__ */ jsx(Plus, { size: 12 }),
          addLabel
        ]
      }
    )
  ] });
}
function ProfileCard({
  profile,
  isActive,
  isTesting,
  onActivate,
  onEdit,
  onDelete,
  onDuplicate,
  onTestConnection
}) {
  const { t } = useTranslation(["settings", "common"]);
  const engineList = resolveTargetEngines(profile);
  const wire = profile.wireApi ?? "anthropic-messages";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${isActive ? "border-primary bg-primary/5" : "border-border bg-background-surface hover:border-primary/30"}`,
      onClick: onActivate,
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: `w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isActive ? "border-primary bg-primary" : "border-border"}`,
            children: isActive && /* @__PURE__ */ jsx(Check, { size: 10, className: "text-white" })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsx(Globe, { size: 12, className: "text-text-tertiary shrink-0" }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary truncate", children: profile.name }),
            engineList.length === 0 || engineList.includes("claude") ? /* @__PURE__ */ jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 shrink-0", children: "Claude" }) : null,
            engineList.length === 0 || engineList.includes("simple-ai") ? /* @__PURE__ */ jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 shrink-0", children: "Simple" }) : null,
            wire === "openai-chat-completions" && /* @__PURE__ */ jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 shrink-0", children: "OpenAI Chat" }),
            wire === "openai-responses" && /* @__PURE__ */ jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 shrink-0", children: "Responses" }),
            profile.category && profile.category !== "custom" && /* @__PURE__ */ jsx("span", { className: "text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 shrink-0", children: t(`modelProfile.category.${profile.category}`) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "text-xs text-text-tertiary truncate mt-0.5", children: [
            profile.model,
            " \xB7 ",
            safeHostname(profile.baseUrl)
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 shrink-0", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onTestConnection(profile),
              className: "p-1 text-text-tertiary hover:text-blue-400 transition-colors",
              title: t("modelProfile.testConnection"),
              disabled: isTesting,
              children: isTesting ? /* @__PURE__ */ jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsx(TestTube, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onDuplicate(profile),
              className: "p-1 text-text-tertiary hover:text-emerald-400 transition-colors",
              title: t("modelProfile.duplicate"),
              children: /* @__PURE__ */ jsx(Copy, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onEdit(profile),
              className: "p-1 text-text-tertiary hover:text-primary transition-colors",
              title: t("modelProfile.edit"),
              children: /* @__PURE__ */ jsx(Pencil, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => onDelete(profile.id),
              className: "p-1 text-text-tertiary hover:text-red-500 transition-colors",
              title: t("modelProfile.delete"),
              children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
            }
          )
        ] })
      ]
    }
  );
}
function parseQuickInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  const urlIdx = tokens.findIndex((t) => t.startsWith("http://") || t.startsWith("https://"));
  if (urlIdx === -1) return null;
  const baseUrl = tokens[urlIdx];
  const modelIdx = urlIdx + 1;
  if (modelIdx >= tokens.length) return null;
  const model = tokens[modelIdx];
  const apiKey = tokens.slice(modelIdx + 1).join(" ").trim();
  if (!model) return null;
  return { baseUrl, model, apiKey };
}
function ProfileEditorModal({
  initialProfile,
  onSave,
  onClose,
  allEngines
}) {
  const { t } = useTranslation(["settings", "common"]);
  const { success, error: toastError } = useToastStore();
  const editing = Boolean(initialProfile?.id);
  const [form, setForm] = useState(() => {
    if (!initialProfile) return EMPTY_FORM;
    return {
      name: initialProfile.name,
      baseUrl: initialProfile.baseUrl,
      apiKey: initialProfile.apiKey,
      model: initialProfile.model,
      modelOptions: [...initialProfile.modelOptions ?? []],
      fetchedModels: [...initialProfile.fetchedModels ?? []],
      wireApi: initialProfile.wireApi ?? "anthropic-messages",
      targetEngines: resolveTargetEngines(initialProfile),
      category: initialProfile.category ?? "",
      description: initialProfile.description ?? "",
      authType: resolveAuthType(initialProfile),
      apiKeyEnvName: initialProfile.apiKeyEnvName ?? "",
      customHeaders: recordToPairs(initialProfile.customHeaders),
      customEnv: recordToPairs(initialProfile.customEnv),
      maxTokens: initialProfile.maxTokens != null ? String(initialProfile.maxTokens) : "",
      contextWindow: initialProfile.contextWindow != null ? String(initialProfile.contextWindow) : ""
    };
  });
  const [fetching, setFetching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));
  const canSubmit = Boolean(
    form.name.trim() && form.baseUrl.trim() && form.model.trim() && (form.authType === "none" || form.apiKey.trim()) && (form.authType !== "custom_env" || form.apiKeyEnvName.trim())
  );
  const handleFetchModels = useCallback(async () => {
    if (!form.baseUrl.trim()) {
      toastError(t("modelProfile.fetchModels"), t("modelProfile.baseUrlRequired"));
      return;
    }
    setFetching(true);
    try {
      const models = await fetchModelsForProfile(formToProbeProfile(form));
      const merged = normalizeModelOptions(form.model, form.modelOptions, models);
      patch({ fetchedModels: models, modelOptions: merged });
      if (models.length > 0) {
        success(t("modelProfile.fetchModels"), t("modelProfile.fetchModelsSuccess", { count: models.length }));
        if (!form.model) patch({ model: models[0] });
      } else {
        toastError(t("modelProfile.fetchModels"), t("modelProfile.fetchModelsEmpty"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`\u62C9\u53D6\u6A21\u578B\u5931\u8D25: ${msg}`);
      toastError(t("modelProfile.fetchModels"), msg);
    } finally {
      setFetching(false);
    }
  }, [form]);
  const handleTest = useCallback(async () => {
    if (!form.baseUrl.trim()) {
      toastError(t("modelProfile.testConnection"), t("modelProfile.baseUrlRequired"));
      return;
    }
    setTesting(true);
    try {
      const result = await testModelProfileConnection(formToProbeProfile(form));
      if (result.ok) {
        success(t("modelProfile.testSuccessTitle"), t("modelProfile.testSuccessDesc", { name: form.name || form.baseUrl }));
      } else {
        const { key, status } = classifyTestFailure(result);
        const reason = status !== void 0 ? t(key, { status }) : t(key);
        toastError(t("modelProfile.testFailedTitle"), result.detail ? `${reason} \u2014 ${result.detail}` : reason);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError(t("modelProfile.testErrorTitle"), msg);
    } finally {
      setTesting(false);
    }
  }, [form]);
  const fieldClass = "w-full px-3 py-2 text-sm bg-background-surface border border-border rounded-lg outline-none focus:border-primary";
  const labelClass = "block text-xs text-text-secondary mb-1";
  const sectionClass = "space-y-3 p-3 bg-background-surface rounded-lg border border-border";
  const sectionTitleClass = "text-xs font-semibold text-text-secondary uppercase tracking-wide";
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4",
      onMouseDown: (e) => {
        if (e.target === e.currentTarget) onClose();
      },
      onKeyDown: (e) => {
        if (e.key === "Escape") onClose();
      },
      children: /* @__PURE__ */ jsxs("div", { className: "bg-background-elevated rounded-xl w-full max-w-lg border border-border shadow-glow max-h-[88vh] flex flex-col", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-base font-semibold text-text-primary", children: editing ? t("modelProfile.editTitle") : t("modelProfile.addTitle") }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: onClose,
              className: "p-1 text-text-tertiary hover:text-text-primary transition-colors",
              children: /* @__PURE__ */ jsx(X, { size: 18 })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto px-5 py-4 space-y-4", children: [
          !editing && /* @__PURE__ */ jsxs("div", { className: sectionClass, children: [
            /* @__PURE__ */ jsxs("div", { className: `${sectionTitleClass} flex items-center gap-1.5`, children: [
              /* @__PURE__ */ jsx(Zap, { size: 12 }),
              t("modelProfile.quickInput")
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  placeholder: t("modelProfile.quickInputPlaceholder"),
                  onPaste: (e) => {
                    const pasted = e.clipboardData.getData("text");
                    const parsed = parseQuickInput(pasted);
                    if (parsed) {
                      setForm((prev) => {
                        const next = { ...prev };
                        if (!prev.baseUrl) next.baseUrl = parsed.baseUrl;
                        if (!prev.model) next.model = parsed.model;
                        if (!prev.name) next.name = parsed.model;
                        if (!prev.apiKey) next.apiKey = parsed.apiKey;
                        return next;
                      });
                    }
                  },
                  className: `${fieldClass} font-mono text-xs`
                }
              ),
              /* @__PURE__ */ jsx("p", { className: "text-[11px] text-text-tertiary mt-1", children: /* @__PURE__ */ jsx("code", { className: "text-[10px] bg-background-surface px-1 py-0.5 rounded", children: "https://api.example.com model-name sk-xxxxxxxx" }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: sectionClass, children: [
            /* @__PURE__ */ jsx("div", { className: sectionTitleClass, children: t("modelProfile.sectionBasic") }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.profileName") }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: form.name,
                  onChange: (e) => patch({ name: e.target.value }),
                  className: fieldClass
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.baseUrl") }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: form.baseUrl,
                  onChange: (e) => patch({ baseUrl: e.target.value }),
                  className: fieldClass
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.modelName") }),
              /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    list: "model-provider-fetched-models",
                    value: form.model,
                    onChange: (e) => patch({ model: e.target.value }),
                    className: fieldClass
                  }
                ),
                /* @__PURE__ */ jsx("datalist", { id: "model-provider-fetched-models", children: form.fetchedModels.map((m) => /* @__PURE__ */ jsx("option", { value: m }, m)) }),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: handleFetchModels,
                    disabled: fetching,
                    title: t("modelProfile.fetchModels"),
                    className: "shrink-0 flex items-center gap-1 px-3 py-2 text-xs rounded-lg border border-border text-text-secondary hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50",
                    children: [
                      fetching ? /* @__PURE__ */ jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsx(Download, { size: 14 }),
                      t("modelProfile.fetchModels")
                    ]
                  }
                )
              ] }),
              form.fetchedModels.length > 0 && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-text-tertiary mt-1", children: t("modelProfile.fetchedModelsHint", { count: form.fetchedModels.length }) }),
              /* @__PURE__ */ jsxs("div", { className: "mt-2 space-y-1.5", children: [
                form.modelOptions.map((m, idx) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => patch({ model: m }),
                      className: `shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${form.model === m ? "border-primary bg-primary" : "border-border"}`,
                      title: form.model === m ? t("modelProfile.defaultModel") : t("modelProfile.setAsDefault"),
                      children: form.model === m && /* @__PURE__ */ jsx(Check, { size: 10, className: "text-white" })
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "text",
                      value: m,
                      onChange: (e) => {
                        const next = e.target.value;
                        const updated = [...form.modelOptions];
                        updated[idx] = next;
                        patch({ modelOptions: updated, model: form.model === m ? next : form.model });
                      },
                      className: `${fieldClass} text-xs font-mono`
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        const updated = form.modelOptions.filter((_, i) => i !== idx);
                        const nextModel = form.model === m ? updated[0] ?? "" : form.model;
                        patch({ modelOptions: updated, model: nextModel });
                      },
                      className: "shrink-0 p-1 text-text-tertiary hover:text-red-500 transition-colors",
                      title: t("common:delete"),
                      children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
                    }
                  )
                ] }, idx)),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      const next = form.modelOptions.includes("") ? form.modelOptions : [...form.modelOptions, ""];
                      patch({ modelOptions: next });
                    },
                    className: "flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors",
                    children: [
                      /* @__PURE__ */ jsx(Plus, { size: 12 }),
                      t("modelProfile.addModelOption")
                    ]
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: sectionClass, children: [
            /* @__PURE__ */ jsxs("div", { className: `${sectionTitleClass} flex items-center gap-1.5`, children: [
              /* @__PURE__ */ jsx(KeyRound, { size: 12 }),
              t("modelProfile.sectionAuth")
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.authType.label") }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: form.authType,
                  onChange: (e) => patch({ authType: e.target.value }),
                  className: fieldClass,
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "auth_token", children: t("modelProfile.authType.authToken") }),
                    /* @__PURE__ */ jsx("option", { value: "api_key", children: t("modelProfile.authType.apiKey") }),
                    /* @__PURE__ */ jsx("option", { value: "custom_env", children: t("modelProfile.authType.customEnv") }),
                    /* @__PURE__ */ jsx("option", { value: "none", children: t("modelProfile.authType.none") })
                  ]
                }
              ),
              /* @__PURE__ */ jsx("p", { className: "text-[11px] text-text-tertiary mt-1", children: t(`modelProfile.authType.hint.${form.authType}`) })
            ] }),
            form.authType === "custom_env" && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.apiKeyEnvName") }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  placeholder: "OPENAI_API_KEY",
                  value: form.apiKeyEnvName,
                  onChange: (e) => patch({ apiKeyEnvName: e.target.value }),
                  className: `${fieldClass} font-mono`
                }
              )
            ] }),
            form.authType !== "none" && /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.apiKey") }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: showApiKey ? "text" : "password",
                    value: form.apiKey,
                    onChange: (e) => patch({ apiKey: e.target.value }),
                    autoComplete: "off",
                    className: `${fieldClass} pr-9`
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    tabIndex: -1,
                    onClick: () => setShowApiKey((v) => !v),
                    className: "absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-text-tertiary hover:text-text-primary transition-colors shrink-0",
                    title: showApiKey ? t("modelProfile.hideApiKey") : t("modelProfile.showApiKey"),
                    children: showApiKey ? /* @__PURE__ */ jsx(EyeOff, { size: 14 }) : /* @__PURE__ */ jsx(Eye, { size: 14 })
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: sectionClass, children: [
            /* @__PURE__ */ jsx("div", { className: sectionTitleClass, children: t("modelProfile.sectionProtocol") }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.wireApi.label") }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: form.wireApi,
                  onChange: (e) => patch({ wireApi: e.target.value }),
                  className: fieldClass,
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "anthropic-messages", children: t("modelProfile.wireApi.anthropicMessages") }),
                    /* @__PURE__ */ jsx("option", { value: "openai-chat-completions", children: t("modelProfile.wireApi.openaiChatCompletions") }),
                    /* @__PURE__ */ jsx("option", { value: "openai-responses", children: t("modelProfile.wireApi.openaiResponses") })
                  ]
                }
              ),
              form.wireApi === "openai-chat-completions" && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-text-tertiary mt-1", children: t("modelProfile.wireApi.openaiHint") }),
              form.wireApi === "openai-responses" && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-text-tertiary mt-1", children: t("modelProfile.wireApi.responsesHint") })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.targetEngine.label") }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    const allSelected = allEngines.every((e) => form.targetEngines.includes(e));
                    patch({ targetEngines: allSelected ? [] : [...allEngines] });
                  },
                  className: "mb-2 px-2 py-1 text-[10px] rounded-md border transition-all hover:border-primary/30",
                  children: ALL_ENGINES.every((e) => form.targetEngines.includes(e)) ? t("modelProfile.targetEngine.selectAll") : t("modelProfile.targetEngine.selectAll")
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-2", children: allEngines.map((engineOption) => /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    const selected = form.targetEngines.includes(engineOption);
                    patch({
                      targetEngines: selected ? form.targetEngines.filter((e) => e !== engineOption) : [...form.targetEngines, engineOption]
                    });
                  },
                  className: `px-3 py-1.5 text-xs rounded-md border transition-all ${form.targetEngines.includes(engineOption) ? "border-primary bg-primary/10 text-primary" : "border-border bg-background-surface text-text-tertiary hover:border-primary/30"}`,
                  children: ALL_ENGINES.includes(engineOption) ? t(`modelProfile.targetEngine.${engineOption}`) : getEngineDisplayName(engineOption)
                },
                engineOption
              )) }),
              form.targetEngines.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-text-tertiary mt-1", children: t("modelProfile.targetEngine.allEngines") })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.category.label") }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: form.category,
                  onChange: (e) => patch({ category: e.target.value }),
                  className: fieldClass,
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: t("modelProfile.category.unspecified") }),
                    /* @__PURE__ */ jsx("option", { value: "official", children: t("modelProfile.category.official") }),
                    /* @__PURE__ */ jsx("option", { value: "cn_official", children: t("modelProfile.category.cn_official") }),
                    /* @__PURE__ */ jsx("option", { value: "aggregator", children: t("modelProfile.category.aggregator") }),
                    /* @__PURE__ */ jsx("option", { value: "third_party", children: t("modelProfile.category.third_party") }),
                    /* @__PURE__ */ jsx("option", { value: "custom", children: t("modelProfile.category.custom") })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: sectionClass, children: [
            /* @__PURE__ */ jsx("div", { className: sectionTitleClass, children: t("modelProfile.sectionAdvanced") }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.maxTokens") }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: 1,
                    value: form.maxTokens,
                    onChange: (e) => patch({ maxTokens: e.target.value }),
                    placeholder: t("modelProfile.maxTokensPlaceholder"),
                    className: fieldClass
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.contextWindow") }),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5", children: [
                  /* @__PURE__ */ jsx("div", { className: "flex gap-1.5", children: ["180k", "256k", "1m"].map((key) => {
                    const isActive = form.contextWindow === CONTEXT_WINDOW_PRESETS[key];
                    return /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => patch({ contextWindow: CONTEXT_WINDOW_PRESETS[key] }),
                        className: `flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${isActive ? "bg-primary/15 border-primary text-primary font-semibold" : "bg-background-surface border-border text-text-secondary hover:border-text-tertiary"}`,
                        children: t(`modelProfile.contextWindowPresets.${key}`)
                      },
                      key
                    );
                  }) }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "number",
                      min: 1,
                      value: form.contextWindow,
                      onChange: (e) => patch({ contextWindow: e.target.value }),
                      placeholder: t("modelProfile.contextWindowPlaceholder"),
                      className: fieldClass
                    }
                  )
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.customHeaders") }),
              /* @__PURE__ */ jsx(
                KeyValueEditor,
                {
                  pairs: form.customHeaders,
                  onChange: (next) => patch({ customHeaders: next }),
                  keyPlaceholder: "Header-Name",
                  valuePlaceholder: "value",
                  addLabel: t("modelProfile.addHeader")
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.customEnv") }),
              /* @__PURE__ */ jsx(
                KeyValueEditor,
                {
                  pairs: form.customEnv,
                  onChange: (next) => patch({ customEnv: next }),
                  keyPlaceholder: "ENV_NAME",
                  valuePlaceholder: "value",
                  addLabel: t("modelProfile.addEnv")
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: t("modelProfile.description") }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: form.description,
                  onChange: (e) => patch({ description: e.target.value }),
                  className: fieldClass
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-t border-border-subtle shrink-0", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: handleTest,
              disabled: testing,
              className: "flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-border text-text-secondary hover:border-blue-400/40 hover:text-blue-400 transition-colors disabled:opacity-50",
              children: [
                testing ? /* @__PURE__ */ jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsx(TestTube, { size: 14 }),
                t("modelProfile.testConnection")
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg transition-colors",
                children: t("modelProfile.cancel")
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => onSave(form),
                disabled: !canSubmit,
                className: "px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
                children: editing ? t("modelProfile.save") : t("modelProfile.add")
              }
            )
          ] })
        ] })
      ] })
    }
  );
}
function ModelProviderTab() {
  const { t } = useTranslation(["settings", "common"]);
  const { success, error: toastError } = useToastStore();
  const {
    profiles,
    activeProfileId,
    addProfile,
    updateProfile,
    removeProfile,
    activateProfile,
    setProfiles,
    setActiveProfileId
  } = useModelProfileStore();
  const config = useConfigStore().config;
  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState("all");
  const [showEditor, setShowEditor] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [testingProfileId, setTestingProfileId] = useState(null);
  const engineMetaIds = useEngineMetadataStore((s) => s.metadatas);
  const dynamicEngineList = useMemo(() => {
    const known = ["claude", "simple-ai"];
    const pluginIds = engineMetaIds.filter((m) => !["claude-code", "simple-ai"].includes(m.id)).map((m) => m.id);
    return [...known, ...pluginIds];
  }, [engineMetaIds]);
  const syncToConfig = useCallback(
    (nextProfiles, nextActiveId) => {
      void patchConfigTop({
        modelProfiles: nextProfiles,
        activeModelProfileId: nextActiveId ?? void 0
      }).catch((e) => {
        toastError(t("modelProfile.title"), e instanceof Error ? e.message : String(e));
      });
    },
    [toastError, t]
  );
  useEffect(() => {
    const configProfiles = config.modelProfiles || [];
    if (profiles.length > 0 && configProfiles.length === 0) {
      syncToConfig(profiles, activeProfileId);
    } else if (configProfiles.length > 0 && profiles.length === 0) {
      setProfiles(configProfiles);
      if (config.activeModelProfileId) setActiveProfileId(config.activeModelProfileId);
    }
  }, []);
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (engineFilter === "all") {
      } else {
        if (!isProfileForEngine(p, engineFilter)) return false;
      }
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || p.baseUrl.toLowerCase().includes(q);
    });
  }, [profiles, search, engineFilter]);
  const openCreate = () => {
    setEditingProfile(null);
    setShowEditor(true);
  };
  const openEdit = (profile) => {
    setEditingProfile(profile);
    setShowEditor(true);
  };
  const openDuplicate = (profile) => {
    setEditingProfile({
      ...profile,
      id: "",
      name: `${profile.name} (\u526F\u672C)`,
      modelOptions: [...profile.modelOptions ?? []],
      active: false
    });
    setShowEditor(true);
  };
  const closeEditor = () => {
    setShowEditor(false);
    setEditingProfile(null);
  };
  const isEditing = Boolean(editingProfile && editingProfile.id);
  const handleSave = (form) => {
    const params = {
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
      model: form.model.trim(),
      modelOptions: normalizeModelOptions(form.model, form.modelOptions, form.fetchedModels),
      wireApi: form.wireApi,
      targetEngines: form.targetEngines,
      category: form.category || void 0,
      description: form.description.trim() || void 0,
      authType: form.authType,
      apiKeyEnvName: form.apiKeyEnvName.trim() || void 0,
      customHeaders: pairsToRecord(form.customHeaders),
      customEnv: pairsToRecord(form.customEnv),
      maxTokens: parsePositiveInt(form.maxTokens),
      contextWindow: parsePositiveInt(form.contextWindow)
    };
    if (isEditing && editingProfile) {
      updateProfile({ id: editingProfile.id, ...params });
    } else {
      addProfile(params);
    }
    const updated = useModelProfileStore.getState();
    syncToConfig(updated.profiles, updated.activeProfileId);
    success(t("modelProfile.title"), t(isEditing ? "modelProfile.updated" : "modelProfile.created"));
    closeEditor();
  };
  const handleDelete = (id) => {
    removeProfile(id);
    const updated = useModelProfileStore.getState();
    const sessionConfig = useSessionConfig.getState();
    if (sessionConfig.config.modelProfileId === id) {
      sessionConfig.setModelProfileId("");
    }
    const mgr = {
      sessionMetadata: getSessionDirectorySnapshot().metadataMap,
      updateSessionModelProfile: (sid, v) => {
        const sm = window.__POLARIS_APP_CORE__.stores.sessionStoreManager.getState();
        if (typeof sm.updateSessionModelProfile === "function") sm.updateSessionModelProfile(sid, v);
      }
    };
    mgr.sessionMetadata.forEach((meta, sid) => {
      if (meta.modelProfileId === id) {
        mgr.updateSessionModelProfile(sid, null);
      }
    });
    syncToConfig(updated.profiles, updated.activeProfileId);
    if (editingProfile?.id === id) closeEditor();
  };
  const handleActivate = (profile) => {
    const nextActiveId = activeProfileId === profile.id ? null : profile.id;
    activateProfile(nextActiveId);
    const activeId = getSessionDirectorySnapshot().activeSessionId;
    const activeMeta = activeId ? getSessionDirectorySnapshot().metadataMap.get(activeId) : void 0;
    const sessionOverride = activeMeta?.modelProfileId;
    const mirror = sessionOverride === OFFICIAL_API_PROFILE ? "" : sessionOverride ?? nextActiveId ?? "";
    useSessionConfig.getState().setModelProfileId(mirror);
    syncToConfig(useModelProfileStore.getState().profiles, nextActiveId);
  };
  const handleTestConnection = useCallback(
    async (profile) => {
      setTestingProfileId(profile.id);
      try {
        const result = await testModelProfileConnection(profile);
        if (result.ok) {
          success(t("modelProfile.testSuccessTitle"), t("modelProfile.testSuccessDesc", { name: profile.name }));
        } else {
          const { key, status } = classifyTestFailure(result);
          const reason = status !== void 0 ? t(key, { status }) : t(key);
          toastError(t("modelProfile.testFailedTitle"), result.detail ? `${reason} \u2014 ${result.detail}` : reason);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toastError(t("modelProfile.testErrorTitle"), msg);
      } finally {
        setTestingProfileId(null);
      }
    },
    [success, toastError, t]
  );
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx("p", { className: "text-xs text-text-secondary", children: t("modelProfile.tabDescription") }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-2", children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => openCreate(),
          className: "flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shrink-0",
          children: [
            /* @__PURE__ */ jsx(Plus, { size: 14 }),
            t("modelProfile.add")
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "relative flex-1", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: t("modelProfile.searchPlaceholder"),
            className: "w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary"
          }
        ),
        /* @__PURE__ */ jsx(Search, { size: 14, className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1 shrink-0", children: ["all", "claude", "simple-ai"].concat(
        dynamicEngineList.filter((e) => !["claude", "simple-ai"].includes(e))
      ).map((f) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setEngineFilter(f),
          className: `px-3 py-2 text-xs rounded-lg border transition-all ${engineFilter === f ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-tertiary hover:border-primary/30"}`,
          children: f === "all" ? t("modelProfile.filter.all") : ALL_ENGINES.includes(f) ? t(`modelProfile.filter.${f}`) : getEngineDisplayName(f)
        },
        f
      )) })
    ] }),
    profiles.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-center", children: [
      /* @__PURE__ */ jsx(Server, { size: 32, className: "text-text-muted mb-3" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-text-tertiary", children: t("modelProfile.noProfiles") })
    ] }) : filteredProfiles.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-8 text-xs text-text-tertiary", children: t("modelProfile.noMatchingProfiles") }) : /* @__PURE__ */ jsx("div", { className: "space-y-2", children: filteredProfiles.map((profile) => /* @__PURE__ */ jsx(
      ProfileCard,
      {
        profile,
        isActive: activeProfileId === profile.id,
        isTesting: testingProfileId === profile.id,
        onActivate: () => handleActivate(profile),
        onEdit: openEdit,
        onDuplicate: openDuplicate,
        onDelete: handleDelete,
        onTestConnection: handleTestConnection
      },
      profile.id
    )) }),
    showEditor && /* @__PURE__ */ jsx(
      ProfileEditorModal,
      {
        initialProfile: editingProfile,
        onSave: handleSave,
        onClose: closeEditor,
        allEngines: dynamicEngineList
      },
      editingProfile?.id || "new"
    )
  ] });
}

// src/TokenStatsTab.tsx
import { useEffect as useEffect3, useState as useState3, useMemo as useMemo3, useCallback as useCallback2 } from "react";
import { useTranslation as useTranslation3 } from "react-i18next";

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/react.mjs
import React from "react";
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    () => selector(api.getInitialState())
  );
  React.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// src/tokenAnalyticsStore.ts
var log2 = createLogger("TokenAnalyticsStore");
function timeRangeToDates(range) {
  if (range === "all") return {};
  const now = Math.floor(Date.now() / 1e3);
  const day = 86400;
  const map = { "today": 0, "1d": day, "7d": 7 * day, "14d": 14 * day, "30d": 30 * day };
  const lookback = map[range];
  if (lookback === 0) {
    const d = /* @__PURE__ */ new Date();
    const startOfDay2 = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1e3);
    return { startDate: startOfDay2, endDate: now };
  }
  return { startDate: now - lookback, endDate: now };
}
function filterToInvokeArgs(filters) {
  const fallback = filters.timeRange ? timeRangeToDates(filters.timeRange) : {};
  return {
    startDate: filters.startDate ?? fallback.startDate,
    endDate: filters.endDate ?? fallback.endDate,
    engineId: filters.engineId || void 0,
    model: filters.model || void 0
  };
}
var useTokenAnalyticsStore = create((set, get) => ({
  cachedSummary: null,
  cachedModelStats: null,
  cachedEngineStats: null,
  cachedTopSessions: null,
  loaded: false,
  filterParams: { timeRange: "30d" },
  loadData: async (filters) => {
    const f = filters ?? get().filterParams;
    if (filters) set({ filterParams: filters });
    const args = filterToInvokeArgs(f);
    try {
      const [summary, modelStats, engineStats] = await Promise.all([
        hostInvoke("get_usage_summary", args),
        hostInvoke("get_usage_model_stats", { startDate: args.startDate, endDate: args.endDate, engineId: args.engineId }),
        hostInvoke("get_usage_engine_stats", { startDate: args.startDate, endDate: args.endDate, model: args.model })
      ]);
      set({
        cachedSummary: summary,
        cachedModelStats: modelStats,
        cachedEngineStats: engineStats,
        cachedTopSessions: null,
        // 分页数据单独加载
        loaded: true
      });
      log2.info("Token \u7EDF\u8BA1\u6570\u636E\u5DF2\u52A0\u8F7D", { totalRequests: summary.totalRequests, filters: f });
    } catch (e) {
      log2.warn("Token \u7EDF\u8BA1\u52A0\u8F7D\u5931\u8D25: " + String(e));
      set({ loaded: true });
    }
  },
  refreshData: async (filters) => {
    set({ cachedSummary: null, cachedModelStats: null, cachedEngineStats: null, cachedTopSessions: null, loaded: false });
    return get().loadData(filters);
  },
  getSummary: () => {
    return get().cachedSummary ?? {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalCostUsd: 0,
      cacheHitRate: 0
    };
  },
  getModelStats: () => get().cachedModelStats ?? [],
  getEngineStats: () => get().cachedEngineStats ?? [],
  getTopSessions: async (limit = 20, offset = 0) => {
    const f = get().filterParams;
    const args = filterToInvokeArgs(f);
    try {
      return await hostInvoke("get_usage_recent_logs", { limit, offset, ...args });
    } catch {
      return [];
    }
  },
  getDailyTrends: async (range, engineId, model, startDate, endDate) => {
    const dates = startDate !== void 0 && endDate !== void 0 ? { startDate, endDate } : timeRangeToDates(range);
    try {
      return await hostInvoke("get_usage_daily_trends", { ...dates, engineId, model });
    } catch {
      return [];
    }
  }
}));

// node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}

// src/TimeRangePicker.tsx
import { useEffect as useEffect2, useMemo as useMemo2, useRef, useState as useState2 } from "react";
import { useTranslation as useTranslation2 } from "react-i18next";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dayKey(d) {
  return d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate();
}
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
function dowMon(d) {
  return (d.getDay() + 6) % 7;
}
function TimeRangePicker({ start, end, onChange, allowClear = true, minDate, maxDate }) {
  const { t } = useTranslation2("settings");
  const weekdays = t("tokenStats.timeRange.weekdays", { returnObjects: true });
  const WEEKDAYS = Array.isArray(weekdays) && weekdays.length === 7 ? weekdays : ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"];
  const [open, setOpen] = useState2(false);
  const [picking, setPicking] = useState2(null);
  const [hover, setHover] = useState2(null);
  const [view, setView] = useState2(() => {
    const base = start ?? /* @__PURE__ */ new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef(null);
  const today = useMemo2(() => {
    const d = /* @__PURE__ */ new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  useEffect2(() => {
    if (!open) {
      setPicking(null);
      setHover(null);
    }
  }, [open]);
  useEffect2(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect2(() => {
    if (start) {
      setView(new Date(start.getFullYear(), start.getMonth(), 1));
    }
  }, [start]);
  const y = view.getFullYear();
  const m = view.getMonth();
  const cells = useMemo2(() => {
    const firstDow = dowMon(new Date(y, m, 1));
    const dim = daysInMonth(y, m);
    const prevDim = daysInMonth(y, m - 1);
    const list = [];
    for (let i = firstDow - 1; i >= 0; i--) list.push({ d: new Date(y, m - 1, prevDim - i), other: true });
    for (let i = 1; i <= dim; i++) list.push({ d: new Date(y, m, i), other: false });
    const trail = (7 - list.length % 7) % 7;
    for (let i = 1; i <= trail; i++) list.push({ d: new Date(y, m + 1, i), other: true });
    return list;
  }, [y, m]);
  const onPick = (d) => {
    if (minDate && d < minDate) return;
    if (maxDate && dayKey(d) > dayKey(maxDate)) return;
    if (!picking && !start) {
      setPicking("start");
      setHover(null);
      return;
    }
    if (picking === "start") {
      if (start && dayKey(d) < dayKey(start)) {
        setStartOnly(d);
        return;
      }
      onChange(start, d);
      setOpen(false);
      return;
    }
    setStartOnly(d);
  };
  const setStartOnly = (d) => {
    onChange(d, null);
    setPicking("start");
    setHover(null);
  };
  const rangeActive = start != null && end != null && dayKey(end) >= dayKey(start);
  const inRange = (d) => {
    if (!rangeActive || !start || !end) return false;
    return dayKey(d) >= dayKey(start) && dayKey(d) <= dayKey(end);
  };
  const triggerText = start && end ? dayKey(start) === dayKey(end) ? fmtDate(start) : `${fmtDate(start)} ~ ${fmtDate(end)}` : null;
  const monthLabel = `${y} \u5E74 ${m + 1} \u6708`;
  return /* @__PURE__ */ jsxs2("div", { ref: rootRef, className: "relative", children: [
    /* @__PURE__ */ jsxs2(
      "button",
      {
        type: "button",
        onClick: () => setOpen((o) => !o),
        className: clsx(
          "flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border transition-colors min-w-[210px]",
          "bg-background-surface text-text-primary border-border-subtle",
          open ? "border-primary" : "hover:border-border-subtle hover:bg-background-hover"
        ),
        children: [
          /* @__PURE__ */ jsx2(Calendar, { size: 13, className: "text-text-tertiary shrink-0" }),
          /* @__PURE__ */ jsx2("span", { className: clsx("flex-1 text-left tabular-nums truncate", !triggerText && "text-text-tertiary"), children: triggerText ?? t("tokenStats.timeRange.placeholder", "\u9009\u62E9\u65F6\u95F4\u8303\u56F4") }),
          /* @__PURE__ */ jsx2(ChevronDown, { size: 13, className: clsx("text-text-tertiary shrink-0 transition-transform", open && "rotate-180") })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxs2("div", { className: "absolute top-full left-0 mt-1.5 z-popover w-[300px] p-3 rounded-xl border border-border bg-background-surface shadow-xl", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between mb-2", children: [
        /* @__PURE__ */ jsx2("span", { className: "text-xs font-medium text-text-primary", children: monthLabel }),
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-0.5", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => setView(new Date(y, m - 1, 1)),
              className: "w-6 h-6 flex items-center justify-center rounded-md text-text-secondary hover:bg-background-hover hover:text-text-primary",
              children: /* @__PURE__ */ jsx2(ChevronLeft, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => setView(new Date(y, m + 1, 1)),
              className: "w-6 h-6 flex items-center justify-center rounded-md text-text-secondary hover:bg-background-hover hover:text-text-primary",
              children: /* @__PURE__ */ jsx2(ChevronRight, { size: 14 })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "grid grid-cols-7 text-center text-[10px] text-text-tertiary mb-1", children: WEEKDAYS.map((w, wi) => /* @__PURE__ */ jsx2("span", { className: "py-0.5", children: w }, wi)) }),
      /* @__PURE__ */ jsx2("div", { className: "grid grid-cols-7 gap-y-0.5", children: cells.map((c, i) => {
        const k = dayKey(c.d);
        const disabled = minDate && c.d < minDate || maxDate && k > dayKey(maxDate);
        const isStart = rangeActive && start != null && k === dayKey(start);
        const isEnd = rangeActive && end != null && k === dayKey(end);
        const isToday = k === dayKey(today);
        const isPreview = picking === "start" && start && hover && k > dayKey(start) && k <= dayKey(hover);
        return /* @__PURE__ */ jsxs2(
          "button",
          {
            type: "button",
            disabled,
            onClick: () => onPick(c.d),
            onMouseEnter: () => {
              if (picking === "start" && start) setHover(c.d);
            },
            className: clsx(
              "h-8 text-xs rounded-md transition-colors relative",
              c.other && !isStart && !isEnd ? "text-text-tertiary opacity-40" : "text-text-secondary",
              isToday && !isStart && !isEnd && "text-primary font-semibold",
              inRange(c.d) && !isStart && !isEnd && "bg-primary/10 text-text-primary",
              isPreview && !isStart && !isEnd && "bg-primary/10",
              isStart && "bg-primary text-white font-semibold rounded-r-none",
              isEnd && "bg-primary text-white font-semibold rounded-l-none",
              disabled ? "cursor-not-allowed opacity-30" : "hover:bg-background-hover hover:text-text-primary"
            ),
            children: [
              c.d.getDate(),
              isToday && /* @__PURE__ */ jsx2("span", { className: "absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-0.5 rounded-full bg-primary" })
            ]
          },
          i
        );
      }) }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between mt-2 pt-2 border-t border-border-subtle text-[10px] text-text-tertiary", children: [
        /* @__PURE__ */ jsx2("span", { className: "truncate pr-2", children: picking === "start" && start ? t("tokenStats.timeRange.pickEnd", { date: fmtDate(start) }) : t("tokenStats.timeRange.pickStart") }),
        allowClear && (start || end) && /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: () => {
              onChange(null, null);
              setPicking(null);
              setHover(null);
            },
            className: "shrink-0 text-text-tertiary hover:text-text-primary hover:bg-background-hover px-1.5 py-0.5 rounded",
            children: t("tokenStats.timeRange.clear", "\u6E05\u7A7A")
          }
        )
      ] })
    ] })
  ] });
}

// src/timeRange.ts
function dateToUnixSeconds(d) {
  return Math.floor(d.getTime() / 1e3);
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function presetRange(preset) {
  const now = /* @__PURE__ */ new Date();
  switch (preset) {
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "yesterday": {
      const y = addDays(now, -1);
      return [startOfDay(y), endOfDay(y)];
    }
    case "dayBefore": {
      const y = addDays(now, -2);
      return [startOfDay(y), endOfDay(y)];
    }
    case "rolling7": {
      return [startOfDay(addDays(now, -6)), endOfDay(now)];
    }
    case "rolling30": {
      return [startOfDay(addDays(now, -29)), endOfDay(now)];
    }
    case "lastWeek": {
      const dow = (now.getDay() + 6) % 7;
      const monday = addDays(startOfDay(now), -dow - 7);
      return [monday, endOfDay(addDays(monday, 6))];
    }
    case "lastMonth": {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return [startOfDay(first), endOfDay(last)];
    }
    case "all":
      return null;
    default:
      return null;
  }
}

// src/formatTokens.ts
function formatTokens(n) {
  const v = n ?? 0;
  if (v <= 0) return "0";
  if (v < 1e3) return String(Math.round(v));
  if (v < 1e4) {
    const k = v / 1e3;
    if (k >= 9.95) return "1\u4E07";
    return `${trimZero(k.toFixed(1))}\u5343`;
  }
  if (v < 1e8) {
    const wan = v / 1e4;
    if (wan >= 9999.5) return "1\u4EBF";
    return `${trimZero(wan.toFixed(1))}\u4E07`;
  }
  return `${trimZero((v / 1e8).toFixed(1))}\u4EBF`;
}
function formatTokensStrict(n) {
  return formatTokens(n);
}
function trimZero(s) {
  return s.replace(/\.0$/, "");
}

// src/TokenStatsTab.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var useTokenAnalyticsStore2 = useTokenAnalyticsStore;
function fmt(n) {
  return formatTokensStrict(n);
}
function fmtCost(n) {
  if (n === 0) return "$0";
  if (n < 1e-3) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
function inferEngine(model) {
  const prefix = model.includes("-") ? model.split("-")[0] : model;
  const engineMap = {
    claude: "claude",
    deepseek: "simple",
    glm: "simple",
    qwen: "simple",
    yi: "simple"
  };
  return engineMap[prefix] || prefix;
}
var CHART_COLORS = [
  "bg-primary",
  "bg-amber-500",
  "bg-purple-400",
  "bg-green-500",
  "bg-blue-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-red-500"
];
function getColor(i) {
  return CHART_COLORS[i % CHART_COLORS.length];
}
var ENGINE_OPTIONS = [
  { value: "", label: "\u5168\u90E8\u5F15\u64CE" },
  { value: "claude", label: "Claude" },
  { value: "simple-ai", label: "Simple AI" },
  { value: "omp", label: "OMP" }
];
function TabBtn({ active, onClick, icon, label }) {
  return /* @__PURE__ */ jsxs3("button", { onClick, className: clsx("flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors", active ? "bg-primary/10 text-primary font-medium" : "text-text-tertiary hover:text-text-primary hover:bg-background-hover"), children: [
    icon,
    label
  ] });
}
var PRESETS = [
  { id: "today", labelKey: "tokenStats.preset.today", group: "day" },
  { id: "yesterday", labelKey: "tokenStats.preset.yesterday", group: "day" },
  { id: "dayBefore", labelKey: "tokenStats.preset.dayBefore", group: "day" },
  { id: "rolling7", labelKey: "tokenStats.preset.rolling7", group: "rolling" },
  { id: "rolling30", labelKey: "tokenStats.preset.rolling30", group: "rolling" },
  { id: "lastWeek", labelKey: "tokenStats.preset.lastWeek", group: "period" },
  { id: "lastMonth", labelKey: "tokenStats.preset.lastMonth", group: "period" },
  { id: "all", labelKey: "tokenStats.preset.all", group: "all" }
];
var PRESET_GROUP_LABEL = {
  day: "tokenStats.presetGroup.day",
  rolling: "tokenStats.presetGroup.rolling",
  period: "tokenStats.presetGroup.period",
  all: "tokenStats.presetGroup.all"
};
function FilterBar({ engineId, model, start, end, activePreset, modelOptions, onEngineChange, onModelChange, onPreset, onRangeChange, onRefresh }) {
  const { t } = useTranslation3("settings");
  const groups = useMemo3(() => {
    const order = ["day", "rolling", "period", "all"];
    return order.map((g) => ({ group: g, items: PRESETS.filter((p) => p.group === g) })).filter((g) => g.items.length > 0);
  }, []);
  return /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-background-surface border border-border-subtle", children: [
    /* @__PURE__ */ jsx3(
      "select",
      {
        value: engineId,
        onChange: (e) => onEngineChange(e.target.value),
        className: "text-xs px-2 py-1 rounded-md border border-border-subtle bg-background-surface text-text-primary outline-none focus:border-primary",
        children: ENGINE_OPTIONS.map((o) => /* @__PURE__ */ jsx3("option", { value: o.value, children: o.label }, o.value))
      }
    ),
    /* @__PURE__ */ jsxs3(
      "select",
      {
        value: model,
        onChange: (e) => onModelChange(e.target.value),
        className: "text-xs px-2 py-1 rounded-md border border-border-subtle bg-background-surface text-text-primary outline-none focus:border-primary max-w-[160px]",
        children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: t("tokenStats.allModels", "\u5168\u90E8\u6A21\u578B") }),
          modelOptions.map((m) => /* @__PURE__ */ jsx3("option", { value: m, children: m }, m))
        ]
      }
    ),
    /* @__PURE__ */ jsx3("span", { className: "w-px h-4 bg-border-subtle" }),
    groups.map((g, gi) => /* @__PURE__ */ jsxs3("div", { className: "flex items-center", children: [
      gi > 0 && /* @__PURE__ */ jsx3("span", { className: "w-px h-4 bg-border-subtle mr-2" }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-0.5", children: [
        /* @__PURE__ */ jsx3("span", { className: "text-[10px] text-text-tertiary mr-1 select-none uppercase tracking-wide", children: t(PRESET_GROUP_LABEL[g.group]) }),
        g.items.map((p) => /* @__PURE__ */ jsx3(
          "button",
          {
            onClick: () => onPreset(p.id),
            className: clsx("px-2 py-1 text-xs rounded-md transition-colors", activePreset === p.id ? "bg-primary/10 text-primary font-medium" : "text-text-tertiary hover:text-text-primary hover:bg-background-hover"),
            children: t(p.labelKey)
          },
          p.id
        ))
      ] })
    ] }, g.group)),
    /* @__PURE__ */ jsx3("span", { className: "w-px h-4 bg-border-subtle" }),
    /* @__PURE__ */ jsx3(TimeRangePicker, { start, end, onChange: onRangeChange }),
    /* @__PURE__ */ jsx3(
      "button",
      {
        onClick: onRefresh,
        title: t("tokenStats.refresh", "\u5237\u65B0"),
        className: "flex items-center gap-1 px-2 py-1 text-xs rounded-md text-text-tertiary hover:text-text-primary hover:bg-background-hover transition-colors",
        children: /* @__PURE__ */ jsx3(RefreshCw, { size: 13 })
      }
    )
  ] });
}
function TokenStatsTab() {
  const { t } = useTranslation3("settings");
  const { loaded, loadData, refreshData, getSummary, getModelStats, getEngineStats, filterParams } = useTokenAnalyticsStore2();
  const [engineFilter, setEngineFilter] = useState3("");
  const [modelFilter, setModelFilter] = useState3("");
  const [start, setStart] = useState3(() => startOfDay(/* @__PURE__ */ new Date()));
  const [end, setEnd] = useState3(() => endOfDay(/* @__PURE__ */ new Date()));
  const [activePreset, setActivePreset] = useState3("today");
  const [viewMode, setViewMode] = useState3("overview");
  const [timeSeries, setTimeSeries] = useState3({ labels: [], input: [], output: [], cache: [], costUsd: [], sessions: [] });
  const [trendsLoading, setTrendsLoading] = useState3(false);
  const PAGE_SIZE = 20;
  const [page, setPage] = useState3(0);
  const [topSessions, setTopSessions] = useState3([]);
  const [topSessionsLoading, setTopSessionsLoading] = useState3(false);
  const { getTopSessions, getDailyTrends } = useTokenAnalyticsStore2();
  const buildFilters = useCallback2((eng, mdl, s, e) => {
    const f = { engineId: eng || void 0, model: mdl || void 0 };
    if (s && e) {
      f.startDate = dateToUnixSeconds(s);
      f.endDate = dateToUnixSeconds(e);
    }
    return f;
  }, []);
  const applyFilters = useCallback2(async (eng, mdl, s, e) => {
    const filters = buildFilters(eng, mdl, s, e);
    await loadData(filters);
    setPage(0);
    setTopSessions([]);
  }, [loadData, buildFilters]);
  useEffect3(() => {
    applyFilters(engineFilter, modelFilter, start, end);
  }, []);
  const onEngineChange = (v) => {
    setEngineFilter(v);
    applyFilters(v, modelFilter, start, end);
  };
  const onModelChange = (v) => {
    setModelFilter(v);
    applyFilters(engineFilter, v, start, end);
  };
  const onPreset = (id) => {
    setActivePreset(id);
    const r2 = presetRange(id);
    if (r2) {
      setStart(r2[0]);
      setEnd(r2[1]);
      applyFilters(engineFilter, modelFilter, r2[0], r2[1]);
    } else {
      setStart(null);
      setEnd(null);
      applyFilters(engineFilter, modelFilter, null, null);
    }
  };
  const onRangeChange = (s, e) => {
    setStart(s);
    setEnd(e);
    setActivePreset(null);
    applyFilters(engineFilter, modelFilter, s, e);
  };
  const onRefresh = () => refreshData(buildFilters(engineFilter, modelFilter, start, end));
  useEffect3(() => {
    setTrendsLoading(true);
    const sd = start ? dateToUnixSeconds(start) : void 0;
    const ed = end ? dateToUnixSeconds(end) : void 0;
    getDailyTrends("30d", engineFilter || void 0, modelFilter || void 0, sd, ed).then((data) => {
      setTimeSeries({
        labels: data.map((d) => d.date),
        input: data.map((d) => d.inputTokens),
        output: data.map((d) => d.outputTokens),
        cache: data.map((d) => d.cacheReadTokens + d.cacheCreationTokens),
        costUsd: data.map((d) => d.totalCostUsd),
        sessions: data.map((d) => d.requestCount)
      });
      setTrendsLoading(false);
    });
  }, [start, end, engineFilter, modelFilter, getDailyTrends]);
  useEffect3(() => {
    if (viewMode !== "sessions") return;
    setTopSessionsLoading(true);
    getTopSessions(PAGE_SIZE, page * PAGE_SIZE).then((data) => {
      setTopSessions(data);
      setTopSessionsLoading(false);
    });
  }, [viewMode, page, filterParams, getTopSessions]);
  const summary = getSummary();
  const modelStats = getModelStats();
  const modelOptions = useMemo3(() => modelStats.map((m) => m.model), [modelStats]);
  const isEmpty = loaded && summary.totalRequests === 0;
  const engineStats = getEngineStats();
  const engineDistribution = useMemo3(() => {
    return engineStats.map((e) => ({
      engineId: e.engineId,
      sessions: e.requestCount,
      input: e.inputTokens,
      output: e.outputTokens,
      cache: e.cacheReadTokens + e.cacheCreationTokens
    })).sort((a, b) => b.input - a.input);
  }, [engineStats]);
  const hasPrev = page > 0;
  const hasNext = topSessions.length >= PAGE_SIZE;
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx3(
      FilterBar,
      {
        engineId: engineFilter,
        model: modelFilter,
        start,
        end,
        activePreset,
        modelOptions,
        onEngineChange,
        onModelChange,
        onPreset,
        onRangeChange,
        onRefresh
      }
    ),
    !loaded && /* @__PURE__ */ jsx3("div", { className: "flex items-center justify-center py-12", children: /* @__PURE__ */ jsx3(LoaderCircle, { size: 24, className: "animate-spin text-text-tertiary" }) }),
    isEmpty && /* @__PURE__ */ jsxs3("div", { className: "flex flex-col items-center justify-center py-12 text-text-tertiary", children: [
      /* @__PURE__ */ jsx3(Database, { size: 32, className: "mb-2 opacity-40" }),
      /* @__PURE__ */ jsx3("p", { className: "text-sm", children: t("tokenStats.empty", "\u6682\u65E0 Token \u7EDF\u8BA1\u6570\u636E") }),
      /* @__PURE__ */ jsx3("p", { className: "text-xs mt-1", children: t("tokenStats.emptyHint", "\u53D1\u9001\u6D88\u606F\u540E\uFF0C\u4EE3\u7406\u4F1A\u81EA\u52A8\u8BB0\u5F55 API \u7528\u91CF") })
    ] }),
    loaded && !isEmpty && /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2", children: [
        { label: t("tokenStats.totalRequests", "\u8BF7\u6C42\u6570"), value: String(summary.totalRequests), color: "text-primary" },
        { label: t("tokenStats.totalInput", "\u8F93\u5165 Token"), value: fmt(summary.totalInputTokens), color: "text-primary" },
        { label: t("tokenStats.totalOutput", "\u8F93\u51FA Token"), value: fmt(summary.totalOutputTokens), color: "text-amber-500" },
        { label: t("tokenStats.totalCache", "\u7F13\u5B58"), value: fmt(summary.totalCacheReadTokens + summary.totalCacheCreationTokens), color: "text-purple-400" },
        { label: t("tokenStats.totalCost", "\u603B\u82B1\u8D39"), value: fmtCost(summary.totalCostUsd), color: "text-green-500" }
      ].map((c) => /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-3", children: [
        /* @__PURE__ */ jsx3("div", { className: "text-[10px] uppercase tracking-wide text-text-muted mb-1", children: c.label }),
        /* @__PURE__ */ jsx3("div", { className: clsx("text-base font-mono tabular-nums font-semibold", c.color), children: c.value }),
        c.label === t("tokenStats.totalCache", "\u7F13\u5B58") && summary.cacheHitRate > 0 && /* @__PURE__ */ jsxs3("div", { className: "text-[10px] text-text-muted mt-0.5", title: t("tokenStats.cacheHitRateHint", "\u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB\u53D6 / (\u8F93\u5165 + \u7F13\u5B58\u8BFB\u53D6)\uFF0C\u6210\u672C\u53E3\u5F84"), children: [
          t("tokenStats.cacheHitRate", "\u7F13\u5B58\u547D\u4E2D"),
          " ",
          Math.round(summary.cacheHitRate * 100),
          "%"
        ] })
      ] }, c.label)) }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1 p-0.5 rounded-lg bg-background-surface border border-border-subtle w-fit", children: [
        /* @__PURE__ */ jsx3(TabBtn, { active: viewMode === "overview", onClick: () => setViewMode("overview"), icon: /* @__PURE__ */ jsx3(ChartColumn, { size: 13 }), label: t("tokenStats.overview", "\u6982\u89C8") }),
        /* @__PURE__ */ jsx3(TabBtn, { active: viewMode === "model", onClick: () => setViewMode("model"), icon: /* @__PURE__ */ jsx3(ChartPie, { size: 13 }), label: t("tokenStats.model", "\u6309\u6A21\u578B") }),
        /* @__PURE__ */ jsx3(TabBtn, { active: viewMode === "time", onClick: () => setViewMode("time"), icon: /* @__PURE__ */ jsx3(TrendingUp, { size: 13 }), label: t("tokenStats.time", "\u6309\u65F6\u95F4") }),
        /* @__PURE__ */ jsx3(TabBtn, { active: viewMode === "sessions", onClick: () => setViewMode("sessions"), icon: /* @__PURE__ */ jsx3(Database, { size: 13 }), label: t("tokenStats.topSessions", "Top \u8BF7\u6C42") })
      ] }),
      viewMode === "overview" && /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-3", children: [
          /* @__PURE__ */ jsx3("h5", { className: "text-xs font-medium text-text-primary mb-3", children: t("tokenStats.topModels", "\u6A21\u578B\u7528\u91CF Top 5") }),
          modelStats.length === 0 ? /* @__PURE__ */ jsx3("p", { className: "text-xs text-text-tertiary", children: t("tokenStats.noModelData", "\u6682\u65E0\u6A21\u578B\u7EA7\u6570\u636E") }) : /* @__PURE__ */ jsx3("div", { className: "space-y-2", children: modelStats.slice(0, 5).map((m, i) => {
            const maxInput = Math.max(...modelStats.map((x) => x.inputTokens));
            const maxCache = Math.max(...modelStats.map((x) => x.cacheReadTokens + x.cacheCreationTokens), 1);
            const cacheTokens = m.cacheReadTokens + m.cacheCreationTokens;
            return /* @__PURE__ */ jsxs3("div", { children: [
              /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between text-xs mb-1", children: [
                /* @__PURE__ */ jsx3("span", { className: "text-text-secondary truncate max-w-[140px]", children: m.model }),
                /* @__PURE__ */ jsxs3("span", { className: "text-text-muted tabular-nums", children: [
                  fmt(m.inputTokens),
                  cacheTokens > 0 && /* @__PURE__ */ jsxs3("span", { className: "text-purple-400 ml-1.5", title: t("tokenStats.cache", "\u7F13\u5B58"), children: [
                    "\xB7",
                    fmt(cacheTokens)
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx3("div", { className: "h-1.5 rounded-full bg-background-tertiary overflow-hidden", children: /* @__PURE__ */ jsx3("div", { className: clsx("h-full rounded-full", getColor(i)), style: { width: `${m.inputTokens / maxInput * 100}%` } }) }),
              cacheTokens > 0 && /* @__PURE__ */ jsx3("div", { className: "h-1 rounded-full bg-background-tertiary overflow-hidden mt-0.5", children: /* @__PURE__ */ jsx3("div", { className: "h-full rounded-full bg-purple-400", style: { width: `${cacheTokens / maxCache * 100}%` } }) })
            ] }, m.model);
          }) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-3", children: [
          /* @__PURE__ */ jsx3("h5", { className: "text-xs font-medium text-text-primary mb-3", children: t("tokenStats.engineDistribution", "\u5F15\u64CE\u5206\u5E03") }),
          engineDistribution.length === 0 ? /* @__PURE__ */ jsx3("p", { className: "text-xs text-text-tertiary", children: t("tokenStats.noEngineData", "\u6682\u65E0\u5F15\u64CE\u6570\u636E") }) : /* @__PURE__ */ jsx3("div", { className: "space-y-2.5", children: engineDistribution.map((e, i) => {
            const total = engineDistribution.reduce((s, x) => s + x.sessions, 0);
            const pct = total > 0 ? e.sessions / total : 0;
            const maxCache = Math.max(...engineDistribution.map((x) => x.cache), 1);
            return /* @__PURE__ */ jsxs3("div", { children: [
              /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between text-xs mb-1", children: [
                /* @__PURE__ */ jsx3("span", { className: "text-text-secondary", children: e.engineId }),
                /* @__PURE__ */ jsxs3("span", { className: "text-text-muted tabular-nums", children: [
                  e.sessions,
                  " ",
                  t("tokenStats.requests", "\u8BF7\u6C42"),
                  " \xB7 ",
                  fmt(e.input),
                  e.cache > 0 && /* @__PURE__ */ jsxs3("span", { className: "text-purple-400 ml-1", title: t("tokenStats.cache", "\u7F13\u5B58"), children: [
                    "\xB7",
                    fmt(e.cache)
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx3("div", { className: "h-1.5 rounded-full bg-background-tertiary overflow-hidden", children: /* @__PURE__ */ jsx3("div", { className: clsx("h-full rounded-full", getColor(i)), style: { width: `${pct * 100}%` } }) }),
              e.cache > 0 && /* @__PURE__ */ jsx3("div", { className: "h-1 rounded-full bg-background-tertiary overflow-hidden mt-0.5", children: /* @__PURE__ */ jsx3("div", { className: "h-full rounded-full bg-purple-400", style: { width: `${e.cache / maxCache * 100}%` } }) })
            ] }, e.engineId);
          }) })
        ] })
      ] }),
      viewMode === "model" && /* @__PURE__ */ jsx3("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-3 overflow-x-auto", children: modelStats.length === 0 ? /* @__PURE__ */ jsx3("p", { className: "text-xs text-text-tertiary text-center py-6", children: t("tokenStats.noModelData", "\u6682\u65E0\u6A21\u578B\u7EA7\u6570\u636E") }) : /* @__PURE__ */ jsxs3("table", { className: "w-full text-xs", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { className: "text-text-muted border-b border-border-subtle", children: [
          /* @__PURE__ */ jsx3("th", { className: "text-left py-2 pr-2 font-medium", children: t("tokenStats.model", "\u6A21\u578B") }),
          /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.requests", "\u8BF7\u6C42") }),
          /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.input", "\u8F93\u5165") }),
          /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.output", "\u8F93\u51FA") }),
          /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.cache", "\u7F13\u5B58") }),
          /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", title: t("tokenStats.cacheHitRateHint", "\u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB\u53D6 / (\u8F93\u5165 + \u7F13\u5B58\u8BFB\u53D6)"), children: t("tokenStats.cacheHitRateShort", "\u547D\u4E2D\u7387") }),
          /* @__PURE__ */ jsx3("th", { className: "text-right py-2 pl-2 font-medium", children: t("tokenStats.cost", "\u82B1\u8D39") })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: modelStats.map((m, i) => {
          const maxInput = Math.max(...modelStats.map((x) => x.inputTokens));
          const maxCost = Math.max(...modelStats.map((x) => x.totalCostUsd));
          return /* @__PURE__ */ jsxs3("tr", { className: "border-b border-border-subtle/50 last:border-0", children: [
            /* @__PURE__ */ jsxs3("td", { className: "py-2 pr-2", children: [
              /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx3("span", { className: clsx("w-2 h-2 rounded-sm shrink-0", getColor(i)) }),
                /* @__PURE__ */ jsx3("span", { className: "text-text-primary truncate max-w-[160px]", children: m.model })
              ] }),
              /* @__PURE__ */ jsx3("div", { className: "h-1 rounded-full bg-background-tertiary overflow-hidden mt-1", children: /* @__PURE__ */ jsx3("div", { className: clsx("h-full rounded-full", getColor(i)), style: { width: `${m.inputTokens / maxInput * 100}%` } }) })
            ] }),
            /* @__PURE__ */ jsx3("td", { className: "text-right py-2 px-2 font-mono tabular-nums text-text-muted", children: m.requestCount }),
            /* @__PURE__ */ jsx3("td", { className: "text-right py-2 px-2 font-mono tabular-nums text-text-secondary", children: fmt(m.inputTokens) }),
            /* @__PURE__ */ jsx3("td", { className: "text-right py-2 px-2 font-mono tabular-nums text-text-muted", children: fmt(m.outputTokens) }),
            /* @__PURE__ */ jsx3("td", { className: "text-right py-2 px-2 font-mono tabular-nums text-text-muted", children: fmt(m.cacheReadTokens + m.cacheCreationTokens) }),
            /* @__PURE__ */ jsx3("td", { className: "text-right py-2 px-2 font-mono tabular-nums text-purple-400", children: m.cacheReadTokens > 0 ? `${Math.round(m.cacheHitRate * 100)}%` : "\u2014" }),
            /* @__PURE__ */ jsxs3("td", { className: "text-right py-2 pl-2 font-mono tabular-nums", children: [
              /* @__PURE__ */ jsx3("span", { className: m.totalCostUsd > 0.01 ? "text-green-500" : "text-text-muted", children: fmtCost(m.totalCostUsd) }),
              maxCost > 0 && /* @__PURE__ */ jsx3("div", { className: "h-1 rounded-full bg-background-tertiary overflow-hidden mt-1", children: /* @__PURE__ */ jsx3("div", { className: "h-full rounded-full bg-green-500/60", style: { width: `${m.totalCostUsd / maxCost * 100}%` } }) })
            ] })
          ] }, m.model);
        }) })
      ] }) }),
      viewMode === "time" && /* @__PURE__ */ jsx3("div", { className: "space-y-3", children: trendsLoading ? /* @__PURE__ */ jsx3("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsx3(LoaderCircle, { size: 18, className: "animate-spin text-text-tertiary" }) }) : timeSeries.labels.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-6 text-center text-text-tertiary", children: /* @__PURE__ */ jsx3("p", { className: "text-sm", children: t("tokenStats.noTimeData", "\u8BE5\u65F6\u95F4\u8303\u56F4\u5185\u65E0\u6570\u636E") }) }) : /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border border-border-subtle bg-background-surface p-3", children: [
        /* @__PURE__ */ jsxs3("div", { className: "mb-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-3 mb-2", children: [
            /* @__PURE__ */ jsx3("span", { className: "text-xs font-medium text-text-primary", children: t("tokenStats.input", "\u8F93\u5165 Token") }),
            /* @__PURE__ */ jsxs3("span", { className: "flex items-center gap-1.5 text-[10px] text-text-muted", children: [
              /* @__PURE__ */ jsx3("span", { className: "w-2 h-2 rounded-sm bg-primary" }),
              " ",
              t("tokenStats.input", "\u8F93\u5165")
            ] }),
            /* @__PURE__ */ jsxs3("span", { className: "flex items-center gap-1.5 text-[10px] text-text-muted", children: [
              /* @__PURE__ */ jsx3("span", { className: "w-2 h-2 rounded-sm bg-amber-500" }),
              " ",
              t("tokenStats.output", "\u8F93\u51FA")
            ] }),
            /* @__PURE__ */ jsxs3("span", { className: "flex items-center gap-1.5 text-[10px] text-text-muted", children: [
              /* @__PURE__ */ jsx3("span", { className: "w-2 h-2 rounded-sm bg-purple-400" }),
              " ",
              t("tokenStats.cache", "\u7F13\u5B58")
            ] })
          ] }),
          /* @__PURE__ */ jsx3("div", { className: "flex items-end gap-1 h-32", children: timeSeries.labels.map((label, i) => {
            const maxTotal = Math.max(...timeSeries.input.map((v, j) => v + timeSeries.output[j] + timeSeries.cache[j]), 1);
            return /* @__PURE__ */ jsx3("div", { className: "flex-1 flex flex-col items-center gap-0.5 h-full justify-end", children: /* @__PURE__ */ jsxs3("div", { className: "flex flex-col-reverse items-center w-full h-full gap-0.5", children: [
              /* @__PURE__ */ jsx3("div", { className: "w-full rounded-t-sm bg-amber-500 transition-all", style: { height: `${Math.max(timeSeries.output[i] / maxTotal * 100, 0.5)}%` }, title: `${t("tokenStats.output", "\u8F93\u51FA")}: ${fmt(timeSeries.output[i])}` }),
              /* @__PURE__ */ jsx3("div", { className: "w-full rounded-t-sm bg-primary transition-all", style: { height: `${Math.max(timeSeries.input[i] / maxTotal * 100, 0.5)}%` }, title: `${t("tokenStats.input", "\u8F93\u5165")}: ${fmt(timeSeries.input[i])}` }),
              /* @__PURE__ */ jsx3("div", { className: "w-full rounded-t-sm bg-purple-400 transition-all", style: { height: `${Math.max(timeSeries.cache[i] / maxTotal * 100, 0.5)}%` }, title: `${t("tokenStats.cache", "\u7F13\u5B58")}: ${fmt(timeSeries.cache[i])}` })
            ] }) }, label);
          }) }),
          /* @__PURE__ */ jsx3("div", { className: "flex gap-1 mt-1", children: timeSeries.labels.map((l) => /* @__PURE__ */ jsx3("div", { className: "flex-1 text-[9px] text-text-muted text-center truncate", children: l }, l)) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "pt-3 border-t border-border-subtle", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-3 mb-2", children: [
            /* @__PURE__ */ jsx3("span", { className: "text-xs font-medium text-text-primary", children: t("tokenStats.cost", "\u82B1\u8D39") }),
            /* @__PURE__ */ jsxs3("span", { className: "flex items-center gap-1.5 text-[10px] text-text-muted", children: [
              /* @__PURE__ */ jsx3("span", { className: "w-2 h-2 rounded-sm bg-green-500" }),
              " ",
              t("tokenStats.cost", "\u82B1\u8D39")
            ] })
          ] }),
          /* @__PURE__ */ jsx3("div", { className: "flex items-end gap-1 h-20", children: timeSeries.labels.map((label, i) => {
            const maxCost = Math.max(...timeSeries.costUsd, 1);
            return /* @__PURE__ */ jsx3("div", { className: "flex-1 flex flex-col items-center gap-0.5 h-full justify-end", children: /* @__PURE__ */ jsx3("div", { className: "flex flex-col-reverse items-center w-full h-full gap-0.5", children: /* @__PURE__ */ jsx3("div", { className: "w-full rounded-t-sm bg-green-500 transition-all", style: { height: `${Math.max(timeSeries.costUsd[i] / maxCost * 100, 0.5)}%` } }) }) }, label);
          }) })
        ] })
      ] }) }),
      viewMode === "sessions" && /* @__PURE__ */ jsx3("div", { className: "rounded-lg border border-border-subtle bg-background-surface overflow-hidden", children: topSessionsLoading ? /* @__PURE__ */ jsx3("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsx3(LoaderCircle, { size: 18, className: "animate-spin text-text-tertiary" }) }) : topSessions.length === 0 ? /* @__PURE__ */ jsx3("p", { className: "text-xs text-text-tertiary text-center py-6", children: t("tokenStats.noSessions", "\u6682\u65E0\u8BF7\u6C42\u6570\u636E") }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
        /* @__PURE__ */ jsx3("div", { className: "max-h-[400px] overflow-y-auto", children: /* @__PURE__ */ jsxs3("table", { className: "w-full text-xs", children: [
          /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { className: "text-text-muted border-b border-border-subtle bg-background-surface sticky top-0", children: [
            /* @__PURE__ */ jsx3("th", { className: "text-left py-2 px-3 font-medium", children: "#" }),
            /* @__PURE__ */ jsx3("th", { className: "text-left py-2 px-2 font-medium", children: t("tokenStats.engine", "\u5F15\u64CE") }),
            /* @__PURE__ */ jsx3("th", { className: "text-left py-2 px-2 font-medium", children: t("tokenStats.model", "\u6A21\u578B") }),
            /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.input", "\u8F93\u5165") }),
            /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.output", "\u8F93\u51FA") }),
            /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.cache", "\u7F13\u5B58") }),
            /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", title: t("tokenStats.cacheHitRateHint", "\u7F13\u5B58\u547D\u4E2D\u7387 = \u7F13\u5B58\u8BFB\u53D6 / (\u8F93\u5165 + \u7F13\u5B58\u8BFB\u53D6)"), children: t("tokenStats.cacheHitRateShort", "\u547D\u4E2D\u7387") }),
            /* @__PURE__ */ jsx3("th", { className: "text-right py-2 px-2 font-medium", children: t("tokenStats.cost", "\u82B1\u8D39") }),
            /* @__PURE__ */ jsx3("th", { className: "text-right py-2 pl-2 font-medium", children: t("tokenStats.time", "\u65F6\u95F4") })
          ] }) }),
          /* @__PURE__ */ jsx3("tbody", { children: topSessions.map((s, i) => /* @__PURE__ */ jsxs3("tr", { className: "border-b border-border-subtle/30 last:border-0 hover:bg-background-hover/50 transition-colors", children: [
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-3 text-text-muted tabular-nums", children: page * PAGE_SIZE + i + 1 }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 text-text-muted", children: s.engineId || inferEngine(s.model) }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 max-w-[160px] truncate text-text-primary", title: s.model, children: s.model }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 text-right font-mono tabular-nums text-text-secondary", children: fmt(s.inputTokens) }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 text-right font-mono tabular-nums text-text-muted", children: fmt(s.outputTokens) }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 text-right font-mono tabular-nums text-purple-400", children: fmt(s.cacheReadTokens + s.cacheCreationTokens) }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 text-right font-mono tabular-nums text-purple-400", children: s.cacheReadTokens > 0 ? `${Math.round(s.cacheHitRate * 100)}%` : "\u2014" }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 px-2 text-right font-mono tabular-nums text-green-500", children: fmtCost(s.totalCostUsd ?? 0) }),
            /* @__PURE__ */ jsx3("td", { className: "py-2 pl-2 text-right text-text-muted text-nowrap", children: new Date(s.createdAt * 1e3).toLocaleString() })
          ] }, s.id)) })
        ] }) }),
        /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between px-3 py-2 border-t border-border-subtle bg-background-surface", children: [
          /* @__PURE__ */ jsx3("span", { className: "text-[10px] text-text-muted", children: t("tokenStats.pageInfo", "\u7B2C {{page}} \u9875", { page: page + 1 }) }),
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxs3(
              "button",
              {
                disabled: !hasPrev,
                onClick: () => setPage((p) => p - 1),
                className: clsx("flex items-center gap-0.5 px-2 py-1 text-xs rounded-md transition-colors", hasPrev ? "text-text-primary hover:bg-background-hover" : "text-text-muted opacity-40 cursor-not-allowed"),
                children: [
                  /* @__PURE__ */ jsx3(ChevronLeft, { size: 13 }),
                  " ",
                  t("tokenStats.prev", "\u4E0A\u4E00\u9875")
                ]
              }
            ),
            /* @__PURE__ */ jsxs3(
              "button",
              {
                disabled: !hasNext,
                onClick: () => setPage((p) => p + 1),
                className: clsx("flex items-center gap-0.5 px-2 py-1 text-xs rounded-md transition-colors", hasNext ? "text-text-primary hover:bg-background-hover" : "text-text-muted opacity-40 cursor-not-allowed"),
                children: [
                  t("tokenStats.next", "\u4E0B\u4E00\u9875"),
                  " ",
                  /* @__PURE__ */ jsx3(ChevronRight, { size: 13 })
                ]
              }
            )
          ] })
        ] })
      ] }) })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var log3 = createLogger("model-desk");
function ModelDeskEntry() {
  const { t } = useTranslation4("settings");
  const [view, setView] = useState4("provider");
  useEffect4(() => {
    log3.info("model-desk panel mounted");
  }, []);
  const tabs = useMemo4(
    () => [
      { id: "provider", label: t("nav.modelProvider", "\u6A21\u578B\u4F9B\u5E94\u5546") },
      { id: "usage", label: t("nav.tokenStats", "Token \u7EDF\u8BA1") }
    ],
    [t]
  );
  return /* @__PURE__ */ jsxs4("div", { className: "flex flex-col h-full min-h-0", children: [
    /* @__PURE__ */ jsx4("div", { className: "flex items-center gap-1 px-3 pt-2 pb-1 border-b border-border-subtle", role: "tablist", children: tabs.map((tab) => /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": view === tab.id,
        onClick: () => setView(tab.id),
        className: `px-3 py-1.5 text-xs rounded-md transition-colors ${view === tab.id ? "bg-fill-secondary text-text-primary font-medium" : "text-text-tertiary hover:text-text-secondary hover:bg-fill-tertiary"}`,
        children: tab.label
      },
      tab.id
    )) }),
    /* @__PURE__ */ jsx4("div", { className: "flex-1 min-h-0 overflow-auto", children: view === "provider" ? /* @__PURE__ */ jsx4(ModelProviderTab, {}) : /* @__PURE__ */ jsx4(TokenStatsTab, {}) })
  ] });
}
export {
  ModelDeskEntry as default
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

lucide-react/dist/esm/icons/calendar.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chart-column.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chart-pie.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/check.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-down.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-left.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-right.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/copy.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/database.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/download.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/eye-off.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/eye.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/globe.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/key-round.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/pencil.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/plus.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/refresh-cw.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/search.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/server.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/test-tube.js:
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

lucide-react/dist/esm/icons/trending-up.js:
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

lucide-react/dist/esm/icons/zap.js:
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
