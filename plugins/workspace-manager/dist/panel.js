// src/host/WorkspaceQuickSwitch.tsx
import { useState as useState3, useRef as useRef3, useEffect as useEffect3, useMemo as useMemo2 } from "react";

// locales/zh-CN.json
var zh_CN_default = {
  search: {
    placeholder: "\u641C\u7D22\u5DE5\u4F5C\u533A...",
    noResults: "\u65E0\u5339\u914D\u5DE5\u4F5C\u533A"
  },
  info: {
    title: "\u5DE5\u4F5C\u533A\u4FE1\u606F",
    currentWorkspace: "\u5F53\u524D\u5DE5\u4F5C\u533A",
    contextWorkspaces: "\u5173\u8054\u5DE5\u4F5C\u533A",
    noWorkspaceSelected: "\u672A\u9009\u62E9\u5DE5\u4F5C\u533A",
    viewing: "\u6B63\u5728\u67E5\u770B"
  },
  actions: {
    switchTo: "\u5207\u6362\u5230\u6B64\u5DE5\u4F5C\u533A",
    removeFromContext: "\u4ECE\u5173\u8054\u79FB\u9664",
    addToContext: "\u6DFB\u52A0\u5230\u5173\u8054",
    noContextWorkspaces: "\u672A\u8BBE\u7F6E\u5173\u8054\u5DE5\u4F5C\u533A",
    aiCanAccess: "AI \u53EF\u8BBF\u95EE\u5173\u8054\u5DE5\u4F5C\u533A"
  },
  reference: {
    syntax: "\u5F15\u7528\u8BED\u6CD5",
    currentSyntax: "@/path - \u5F15\u7528\u5F53\u524D\u5DE5\u4F5C\u533A\u6587\u4EF6",
    contextSyntax: "@{name}:path - \u5F15\u7528\u5173\u8054\u5DE5\u4F5C\u533A\u6587\u4EF6"
  },
  selector: {
    noWorkspace: "\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u533A",
    createWorkspace: "\u521B\u5EFA\u5DE5\u4F5C\u533A",
    createWorkspaceTitle: "\u521B\u5EFA\u5DE5\u4F5C\u533A",
    workspace: "\u5DE5\u4F5C\u533A",
    currentWorkspaceLabel: "\u5F53\u524D\u5DE5\u4F5C\u533A",
    deleteWorkspace: "\u5220\u9664\u5DE5\u4F5C\u533A",
    deleteWorkspaceTitle: "\u5220\u9664\u5DE5\u4F5C\u533A",
    confirmDelete: '\u786E\u5B9A\u8981\u5220\u9664 "{{name}}" \u5417\uFF1F',
    deleteHint: "\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
    manageWorkspaces: "\u7BA1\u7406\u5DE5\u4F5C\u533A"
  },
  createModal: {
    title: "\u521B\u5EFA\u65B0\u5DE5\u4F5C\u533A",
    nameLabel: "\u5DE5\u4F5C\u533A\u540D\u79F0",
    namePlaceholder: "\u4F8B\u5982: \u6211\u7684\u9879\u76EE",
    pathLabel: "\u5DE5\u4F5C\u533A\u8DEF\u5F84",
    pathPlaceholder: "\u9009\u62E9\u9879\u76EE\u6587\u4EF6\u5939",
    browse: "\u6D4F\u89C8",
    switchToNew: "\u5207\u6362\u5230\u65B0\u5DE5\u4F5C\u533A",
    switchHint: "\u521B\u5EFA\u540E\u7ACB\u5373\u5207\u6362\u5230\u65B0\u5DE5\u4F5C\u533A",
    noSwitchHint: "\u521B\u5EFA\u540E\u6DFB\u52A0\u5230\u5173\u8054\u5DE5\u4F5C\u533A\uFF0C\u4E0D\u5207\u6362\u5F53\u524D\u5DE5\u4F5C\u533A",
    fillRequired: "\u8BF7\u586B\u5199\u5B8C\u6574\u4FE1\u606F",
    createFailed: "\u521B\u5EFA\u5DE5\u4F5C\u533A\u5931\u8D25",
    selectFolderFailed: "\u9009\u62E9\u6587\u4EF6\u5939\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u8F93\u5165\u8DEF\u5F84",
    selectFolderTitle: "\u9009\u62E9\u5DE5\u4F5C\u533A\u6587\u4EF6\u5939",
    selectCurrent: "\u9009\u62E9\u6B64\u76EE\u5F55",
    noSubdirectories: "\u6B64\u76EE\u5F55\u4E0B\u6CA1\u6709\u5B50\u76EE\u5F55",
    creating: "\u521B\u5EFA\u4E2D...",
    create: "\u521B\u5EFA"
  },
  createSessionModal: {
    title: "\u65B0\u5EFA\u4F1A\u8BDD",
    primaryWorkspaceLabel: "\u4E3B\u5DE5\u4F5C\u533A",
    contextWorkspaceLabel: "\u5173\u8054\u5DE5\u4F5C\u533A",
    optional: "\u53EF\u9009",
    noWorkspace: "\u8FD8\u6CA1\u6709\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u5148\u521B\u5EFA\u5DE5\u4F5C\u533A",
    createWorkspaceFirst: "\u521B\u5EFA\u5DE5\u4F5C\u533A",
    addWorkspace: "\u65B0\u589E\u5DE5\u4F5C\u533A",
    contextHint: "AI \u53EF\u8BBF\u95EE\u5173\u8054\u5DE5\u4F5C\u533A\u4E2D\u7684\u6587\u4EF6",
    selectPrimary: "\u8BF7\u9009\u62E9\u4E3B\u5DE5\u4F5C\u533A",
    createFailed: "\u521B\u5EFA\u4F1A\u8BDD\u5931\u8D25",
    creating: "\u521B\u5EFA\u4E2D...",
    create: "\u521B\u5EFA"
  }
};

// locales/en-US.json
var en_US_default = {
  search: {
    placeholder: "Search workspaces...",
    noResults: "No matching workspaces"
  },
  info: {
    title: "Workspace Information",
    currentWorkspace: "Current Workspace",
    contextWorkspaces: "Context Workspaces",
    noWorkspaceSelected: "No workspace selected",
    viewing: "Viewing"
  },
  actions: {
    switchTo: "Switch to this workspace",
    removeFromContext: "Remove from context",
    addToContext: "Add to context",
    noContextWorkspaces: "No context workspaces set",
    aiCanAccess: "AI can access context workspaces"
  },
  reference: {
    syntax: "Reference syntax",
    currentSyntax: "@/path - Reference file in current workspace",
    contextSyntax: "@{name}:path - Reference file in context workspace"
  },
  selector: {
    noWorkspace: "No workspace yet",
    createWorkspace: "Create Workspace",
    createWorkspaceTitle: "Create Workspace",
    workspace: "Workspace",
    currentWorkspaceLabel: "Current Workspace",
    deleteWorkspace: "Delete Workspace",
    deleteWorkspaceTitle: "Delete Workspace",
    confirmDelete: 'Are you sure you want to delete "{{name}}"?',
    deleteHint: "This action cannot be undone.",
    manageWorkspaces: "Manage Workspaces"
  },
  createModal: {
    title: "Create New Workspace",
    nameLabel: "Workspace Name",
    namePlaceholder: "e.g., My Project",
    pathLabel: "Workspace Path",
    pathPlaceholder: "Select project folder",
    browse: "Browse",
    switchToNew: "Switch to new workspace",
    switchHint: "Switch to the new workspace immediately after creation",
    noSwitchHint: "Add to context workspaces without switching current workspace",
    fillRequired: "Please fill in all required fields",
    createFailed: "Failed to create workspace",
    selectFolderFailed: "Failed to select folder, please enter path manually",
    selectFolderTitle: "Select Workspace Folder",
    selectCurrent: "Select This Folder",
    noSubdirectories: "No subdirectories in this folder",
    creating: "Creating...",
    create: "Create"
  },
  createSessionModal: {
    title: "New Session",
    primaryWorkspaceLabel: "Primary Workspace",
    contextWorkspaceLabel: "Context Workspaces",
    optional: "optional",
    noWorkspace: "No workspace yet, please create one first",
    createWorkspaceFirst: "Create Workspace",
    addWorkspace: "Add Workspace",
    contextHint: "AI can access files in context workspaces",
    selectPrimary: "Please select a primary workspace",
    createFailed: "Failed to create session",
    creating: "Creating...",
    create: "Create"
  }
};

// src/i18nShim.ts
var merged = false;
function hostI18n() {
  return globalThis.__POLARIS_APP_CORE__?.i18n;
}
function ensureMerged() {
  const inst = hostI18n();
  if (inst && !merged && typeof inst.addResourceBundle === "function") {
    try {
      inst.addResourceBundle("zh-CN", "workspace", zh_CN_default, true, true);
      inst.addResourceBundle("en-US", "workspace", en_US_default, true, true);
      merged = true;
    } catch {
    }
  }
  return inst;
}
function useTranslation(...namespaces) {
  const inst = ensureMerged();
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : void 0;
  if (!inst) {
    return { t: (key, opts) => key, i18n: void 0 };
  }
  return {
    t: (key, opts) => inst.t(key, { ns, ...typeof opts === "object" && opts ? opts : {} }),
    i18n: inst
  };
}

// src/host/deps.ts
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u3002");
  return c;
}
function forwardStore(name) {
  const fn = (...args) => {
    const hook = core().stores[name];
    if (typeof hook !== "function") throw new Error(`\u5BBF\u4E3B ${name} \u4E0D\u53EF\u7528`);
    return hook(...args);
  };
  return new Proxy(fn, {
    get: (_t, prop) => {
      const hook = core().stores[name];
      const v = hook[prop];
      return typeof v === "function" ? v.bind(hook) : v;
    }
  });
}
var useWorkspaceStore = forwardStore("useWorkspaceStore");
var useViewStore = forwardStore("useViewStore");
var Button = new Proxy(function() {
}, {
  get: (_t, prop) => core().components.Button?.[prop],
  apply: (_t, _this, args) => {
    const v = core().components.Button;
    if (v && typeof v === "object" && typeof v.render === "function") return v.render(...args);
    return v(...args);
  },
  construct: (_t, args) => new (core()).components.Button(...args)
});
var pluginPanelRegistry = new Proxy({}, {
  get: (_t, p) => core().pluginSystem.pluginPanelRegistry?.[p]
});
var cn = (...args) => core().utils.cn(...args);
function createLogger(tag) {
  return core().utils.createLogger(tag);
}
async function fsDispatch(action, payload = {}) {
  return core().services.tauri.fsDispatch(action, payload);
}

// node_modules/lucide-react/dist/esm/createLucideIcon.mjs
import { forwardRef as forwardRef2, createElement as createElement3 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
var toKebabCase = (string) => string?.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// node_modules/lucide-react/dist/esm/shared/src/utils/toLucideIconData.mjs
function toLucideIconData(iconName, iconNode, aliases = []) {
  if (iconNode == null) {
    throw new Error("[lucide]: iconNode is required when icon name is used");
  }
  return {
    name: toKebabCase(iconName),
    size: 24,
    node: iconNode,
    ...aliases.length > 0 ? { aliases } : {}
  };
}

// node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
var toCamelCase = (string) => {
  let out = "";
  let upperNext = false;
  for (const ch of string) {
    if (ch === "-" || ch === "_" || ch <= " ") {
      upperNext = out.length > 0;
      continue;
    }
    if (out.length === 0) {
      out += ch.toLowerCase();
    } else {
      out += upperNext ? ch.toUpperCase() : ch;
    }
    upperNext = false;
  }
  return out;
};

// node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};

// node_modules/lucide-react/dist/esm/Icon.mjs
import { forwardRef, createElement as createElement2 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/lucide-react/dist/esm/shared/src/build/defaultAttributes.mjs
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};

// node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconNode.mjs
function isDefined(value) {
  return value !== null && value !== void 0;
}
function buildLucideIconNode(icon, params = {}) {
  const attributeNames = params.attributeNames ?? {};
  const getAttributeName = (attributeName) => attributeNames[attributeName] ?? attributeName;
  const viewBoxWidth = icon.size ?? icon.width ?? defaultAttributes["width"];
  const viewBoxHeight = icon.size ?? icon.height ?? defaultAttributes["height"];
  const aliasClassNames = icon.aliases?.filter((alias) => typeof alias === "string" && alias.trim() !== "").map((alias) => `lucide-${alias}`) ?? [];
  const iconClassNames = [...icon.name ? [`lucide-${icon.name}`] : [], ...aliasClassNames];
  const classNamesFromClassName = params.className?.split(" ").filter(Boolean) ?? [];
  const className = params.includeDefaultClasses === false ? mergeClasses(...classNamesFromClassName) : mergeClasses("lucide", ...iconClassNames, ...classNamesFromClassName);
  const calculatedStrokeWidth = params.absoluteStrokeWidth ? Number(params.strokeWidth ?? defaultAttributes["stroke-width"]) * Number(icon.size ?? icon.width ?? defaultAttributes["width"]) / Number(params.size ?? params.width ?? defaultAttributes["width"]) : params.strokeWidth ?? defaultAttributes["stroke-width"];
  const attributes = {
    ...Object.entries(defaultAttributes).reduce((attrs, [attrName, value]) => {
      attrs[getAttributeName(attrName)] = value;
      return attrs;
    }, {}),
    ..."color" in params && params.color && {
      [getAttributeName("stroke")]: params.color
    },
    ..."size" in params && isDefined(params.size) && {
      [getAttributeName("width")]: params.size,
      [getAttributeName("height")]: params.size
    },
    ..."width" in params && isDefined(params.width) && {
      [getAttributeName("width")]: params.width
    },
    ..."height" in params && isDefined(params.height) && {
      [getAttributeName("height")]: params.height
    },
    [getAttributeName("stroke-width")]: calculatedStrokeWidth,
    ...className && {
      [getAttributeName("class")]: className
    },
    [getAttributeName("viewBox")]: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
    ...params.hasA11yProp === false ? {
      [getAttributeName("aria-hidden")]: "true"
    } : {},
    ..."attributes" in params && params.attributes
  };
  return [
    "svg",
    attributes,
    icon.node.map((child) => {
      const [name, attrs, children] = child;
      const nextAttrs = params.nonScalingStroke ? { [getAttributeName("vector-effect")]: "non-scaling-stroke", ...attrs } : attrs;
      return children ? [name, nextAttrs, children] : [name, nextAttrs];
    })
  ];
}

// node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconForReact.mjs
function buildLucideIconForReact(icon, params = {}) {
  return buildLucideIconNode(icon, {
    ...params,
    attributeNames: {
      ...params.attributeNames,
      class: "className",
      "stroke-width": "strokeWidth",
      "stroke-linecap": "strokeLinecap",
      "stroke-linejoin": "strokeLinejoin",
      "vector-effect": "vectorEffect"
    }
  });
}

// node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};

// node_modules/lucide-react/dist/esm/context.mjs
import { createContext, useContext, useMemo, createElement } from "react";
var LucideContext = createContext({});
var useLucideContext = () => useContext(LucideContext);

// node_modules/lucide-react/dist/esm/Icon.mjs
var Icon = forwardRef(
  ({
    color,
    size,
    width,
    height,
    strokeWidth,
    absoluteStrokeWidth,
    nonScalingStroke,
    className = "",
    children,
    iconNode = [],
    icon = {
      node: iconNode,
      aliases: [],
      size: 24
    },
    ...rest
  }, ref) => {
    const {
      size: contextSize = 24,
      strokeWidth: contextStrokeWidth = 2,
      absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
      nonScalingStroke: contextNonScalingStroke = false,
      color: contextColor = "currentColor",
      className: contextClass = ""
    } = useLucideContext() ?? {};
    const hasAccessibleProp = Boolean(children) || hasA11yProp(rest);
    const [name, svgAttributes, builtIconNode = []] = buildLucideIconForReact(icon, {
      color: color ?? contextColor,
      width: width ?? size ?? contextSize,
      height: height ?? size ?? contextSize,
      strokeWidth: strokeWidth ?? contextStrokeWidth,
      absoluteStrokeWidth: absoluteStrokeWidth ?? contextAbsoluteStrokeWidth,
      nonScalingStroke: nonScalingStroke ?? contextNonScalingStroke,
      className: mergeClasses(contextClass, className),
      hasA11yProp: hasAccessibleProp,
      attributes: rest
    });
    return createElement2(
      name,
      {
        ref,
        ...svgAttributes
      },
      [
        ...builtIconNode.map(([tag, attrs]) => createElement2(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/lucide-react/dist/esm/createLucideIcon.mjs
function createLucideIcon(iconDataOrName, iconNode = [], aliases = []) {
  const iconData = typeof iconDataOrName === "string" ? toLucideIconData(iconDataOrName, iconNode, aliases) : iconDataOrName;
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement3(Icon, {
      ref,
      icon: iconData,
      className,
      ...props
    })
  );
  if (iconData.name) {
    Component.displayName = toPascalCase(iconData.name);
  }
  return Component;
}

// node_modules/lucide-react/dist/esm/icons/check.mjs
var __iconData = {
  name: "check",
  size: 24,
  node: [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]]
};
__iconData.node;
var Check = createLucideIcon(__iconData);

// node_modules/lucide-react/dist/esm/icons/chevron-down.mjs
var __iconData2 = {
  name: "chevron-down",
  size: 24,
  node: [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]]
};
__iconData2.node;
var ChevronDown = createLucideIcon(__iconData2);

// node_modules/lucide-react/dist/esm/icons/layout-grid.mjs
var __iconData3 = {
  name: "layout-grid",
  size: 24,
  node: [
    ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
    ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
    ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
    ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
  ]
};
__iconData3.node;
var LayoutGrid = createLucideIcon(__iconData3);

// node_modules/lucide-react/dist/esm/icons/plus.mjs
var __iconData4 = {
  name: "plus",
  size: 24,
  node: [
    ["path", { d: "M5 12h14", key: "1ays0h" }],
    ["path", { d: "M12 5v14", key: "s699le" }]
  ]
};
__iconData4.node;
var Plus = createLucideIcon(__iconData4);

// node_modules/lucide-react/dist/esm/icons/search.mjs
var __iconData5 = {
  name: "search",
  size: 24,
  node: [
    ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
    ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
  ]
};
__iconData5.node;
var Search = createLucideIcon(__iconData5);

// node_modules/lucide-react/dist/esm/icons/trash.mjs
var __iconData6 = {
  name: "trash",
  size: 24,
  node: [
    ["path", { d: "M10 11v6", key: "nco0om" }],
    ["path", { d: "M14 11v6", key: "outv1u" }],
    ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
    ["path", { d: "M3 6h18", key: "d0wm0j" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
  ],
  aliases: ["trash-2"]
};
__iconData6.node;
var Trash = createLucideIcon(__iconData6);

// node_modules/lucide-react/dist/esm/icons/x.mjs
var __iconData7 = {
  name: "x",
  size: 24,
  node: [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ]
};
__iconData7.node;
var X = createLucideIcon(__iconData7);

// src/host/CreateWorkspaceModal.tsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var log = createLogger("CreateWorkspaceModal");
function ServerDirectoryPicker({
  onSelect,
  onCancel
}) {
  const { t } = useTranslation("workspace");
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pathHistory, setPathHistory] = useState([]);
  const listRef = useRef(null);
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const home = await fsDispatch("getHomeDir").then((r) => r.home);
        setCurrentPath(home);
        setPathHistory([home]);
        await loadDirectory(home);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function loadDirectory(dirPath) {
    setLoading(true);
    setError("");
    try {
      const items = await fsDispatch("list", { path: dirPath }).then((r) => r.items);
      const dirs = items.filter((item) => item.isDir).sort((a, b) => a.name.localeCompare(b.name));
      setEntries(dirs);
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }
  function navigateTo(dirPath) {
    setCurrentPath(dirPath);
    setPathHistory((prev) => [...prev, dirPath]);
    loadDirectory(dirPath);
  }
  function goBack() {
    if (pathHistory.length <= 1) return;
    const newHistory = pathHistory.slice(0, -1);
    const parentPath = newHistory[newHistory.length - 1];
    setPathHistory(newHistory);
    setCurrentPath(parentPath);
    loadDirectory(parentPath);
  }
  function goToParent() {
    const sep = currentPath.includes("\\") ? "\\" : "/";
    const parts = currentPath.split(sep).filter(Boolean);
    if (parts.length <= 1) return;
    const isWindowsRoot = /^[A-Za-z]:$/.test(parts[0]);
    const parentParts = parts.slice(0, -1);
    const parentPath = isWindowsRoot && parentParts.length === 1 ? parentParts[0] + sep : parentParts.join(sep);
    navigateTo(parentPath);
  }
  return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-modal p-4", children: /* @__PURE__ */ jsxs("div", { className: "bg-background-elevated rounded-xl w-full max-w-lg max-h-full overflow-y-auto border border-border shadow-glow", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-sm font-medium text-text-primary", children: t("createModal.selectFolderTitle") }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-1", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: goBack,
            disabled: pathHistory.length <= 1,
            className: "p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-30",
            title: "Back",
            children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 19l-7-7 7-7" }) })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: goToParent,
            disabled: loading,
            className: "p-1.5 text-text-secondary hover:text-text-primary disabled:opacity-30",
            title: "Parent directory",
            children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 15l7-7 7 7" }) })
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: onCancel,
            className: "p-1.5 text-text-secondary hover:text-text-primary",
            children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "px-4 py-2 border-b border-border-subtle", children: /* @__PURE__ */ jsx("code", { className: "text-xs text-text-tertiary break-all", children: currentPath }) }),
    /* @__PURE__ */ jsxs("div", { ref: listRef, className: "h-72 overflow-y-auto px-2 py-1", children: [
      loading && /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-text-tertiary text-sm", children: "..." }),
      error && /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-red-400 text-xs", children: error }),
      !loading && !error && entries.length === 0 && /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-text-tertiary text-xs", children: t("createModal.noSubdirectories") }),
      !loading && entries.map((entry) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-text-primary hover:bg-surface group",
          onClick: () => navigateTo(entry.path),
          onDoubleClick: () => onSelect(entry.path),
          children: [
            /* @__PURE__ */ jsx("svg", { className: "w-4 h-4 text-primary shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" }) }),
            /* @__PURE__ */ jsx("span", { className: "truncate", children: entry.name })
          ]
        },
        entry.path
      ))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-t border-border", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary truncate max-w-[200px]", children: currentPath }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: onCancel, children: t("common:buttons.cancel") }),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "secondary",
            onClick: () => onSelect(currentPath),
            disabled: loading || !currentPath,
            children: t("createModal.selectCurrent")
          }
        )
      ] })
    ] })
  ] }) });
}
function CreateWorkspaceModal({ onClose }) {
  const { t } = useTranslation("workspace");
  const { createWorkspace } = useWorkspaceStore();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [switchAfterCreate, setSwitchAfterCreate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const modalRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [onClose]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !path.trim()) {
      setError(t("createModal.fillRequired"));
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await createWorkspace(name.trim(), path.trim(), switchAfterCreate);
      onClose();
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : t("createModal.createFailed"));
    } finally {
      setIsLoading(false);
    }
  };
  const handleSelectFolder = async () => {
    try {
      if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
        setShowDirectoryPicker(true);
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("createModal.selectFolderTitle")
      });
      if (selected && !Array.isArray(selected)) {
        setPath(selected);
        if (!name.trim()) {
          const folderName = selected.split(/[/\\]/).pop() || "";
          setName(folderName);
        }
      }
    } catch (error2) {
      log.error("\u9009\u62E9\u6587\u4EF6\u5939\u5931\u8D25", error2 instanceof Error ? error2 : new Error(String(error2)));
      setError(t("createModal.selectFolderFailed"));
    }
  };
  const handleDirectorySelect = (selectedPath) => {
    setShowDirectoryPicker(false);
    setPath(selectedPath);
    if (!name.trim()) {
      const folderName = selectedPath.split(/[/\\]/).pop() || "";
      setName(folderName);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    showDirectoryPicker && /* @__PURE__ */ jsx(
      ServerDirectoryPicker,
      {
        onSelect: handleDirectorySelect,
        onCancel: () => setShowDirectoryPicker(false)
      }
    ),
    createPortal(
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4",
          onMouseDown: (e) => e.stopPropagation(),
          onClick: (e) => e.stopPropagation(),
          children: /* @__PURE__ */ jsxs("div", { ref: modalRef, "data-modal": "create-workspace", className: "bg-background-elevated rounded-xl p-6 w-full max-w-md max-h-full overflow-y-auto border border-border shadow-glow", children: [
            /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold text-text-primary mb-4", children: t("createModal.title") }),
            error && /* @__PURE__ */ jsx("div", { className: "mb-4 p-3 bg-danger-faint text-danger rounded-lg text-sm", children: error }),
            /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-text-secondary mb-1", children: t("createModal.nameLabel") }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: name,
                    onChange: (e) => setName(e.target.value),
                    placeholder: t("createModal.namePlaceholder"),
                    className: "w-full px-3 py-2 bg-background-surface border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary",
                    autoFocus: true,
                    disabled: isLoading
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { className: "block text-sm font-medium text-text-secondary mb-1", children: t("createModal.pathLabel") }),
                /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "text",
                      value: path,
                      onChange: (e) => setPath(e.target.value),
                      placeholder: t("createModal.pathPlaceholder"),
                      className: "flex-1 px-3 py-2 bg-background-surface border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary",
                      disabled: isLoading
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Button,
                    {
                      type: "button",
                      variant: "secondary",
                      onClick: handleSelectFolder,
                      disabled: isLoading,
                      children: t("createModal.browse")
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2 pt-2 border-t border-border-subtle pt-4", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    id: "switchAfterCreate",
                    checked: switchAfterCreate,
                    onChange: (e) => setSwitchAfterCreate(e.target.checked),
                    className: "mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary",
                    disabled: isLoading
                  }
                ),
                /* @__PURE__ */ jsxs("label", { htmlFor: "switchAfterCreate", className: "flex-1 text-sm text-text-secondary", children: [
                  /* @__PURE__ */ jsx("div", { className: "font-medium", children: t("createModal.switchToNew") }),
                  /* @__PURE__ */ jsx("div", { className: "text-xs text-text-tertiary mt-1", children: switchAfterCreate ? t("createModal.switchHint") : t("createModal.noSwitchHint") })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    variant: "ghost",
                    onClick: onClose,
                    disabled: isLoading,
                    children: t("common:buttons.cancel")
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "submit",
                    disabled: !name.trim() || !path.trim() || isLoading,
                    children: isLoading ? t("createModal.creating") : t("createModal.create")
                  }
                )
              ] })
            ] })
          ] })
        }
      ),
      document.body
    )
  ] });
}

// src/host/WorkspaceSearchInput.tsx
import { useState as useState2, useEffect as useEffect2, useRef as useRef2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState2(value);
  useEffect2(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}
function WorkspaceSearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = false
}) {
  const { t } = useTranslation("workspace");
  const [localValue, setLocalValue] = useState2(value);
  const inputRef = useRef2(null);
  const debouncedValue = useDebounce(localValue, 300);
  useEffect2(() => {
    setLocalValue(value);
  }, [value]);
  useEffect2(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, onChange, value]);
  useEffect2(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);
  const handleClear = () => {
    setLocalValue("");
    onChange("");
  };
  return /* @__PURE__ */ jsxs2("div", { className: cn("relative", className), children: [
    /* @__PURE__ */ jsx2("div", { className: "absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none", children: /* @__PURE__ */ jsx2(Search, { className: "w-3.5 h-3.5 text-text-tertiary" }) }),
    /* @__PURE__ */ jsx2(
      "input",
      {
        ref: inputRef,
        type: "text",
        value: localValue,
        onChange: (e) => setLocalValue(e.target.value),
        placeholder: placeholder || t("search.placeholder"),
        className: cn(
          "w-full pl-8 pr-7 py-1.5 text-sm",
          "bg-background-surface border border-border rounded-lg",
          "text-text-primary placeholder:text-text-tertiary",
          "focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
          "transition-colors"
        )
      }
    ),
    localValue && /* @__PURE__ */ jsx2(
      "button",
      {
        type: "button",
        onClick: handleClear,
        className: "absolute inset-y-0 right-0 pr-2 flex items-center text-text-tertiary hover:text-text-primary transition-colors",
        children: /* @__PURE__ */ jsx2(X, { className: "w-3.5 h-3.5" })
      }
    )
  ] });
}
function useWorkspaceFilter(workspaces, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return workspaces;
  }
  return workspaces.filter((workspace) => {
    const nameMatch = workspace.name.toLowerCase().includes(normalizedQuery);
    const pathMatch = workspace.path.toLowerCase().includes(normalizedQuery);
    return nameMatch || pathMatch;
  });
}

// src/host/WorkspaceQuickSwitch.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var log2 = createLogger("WorkspaceQuickSwitch");
function WorkspaceQuickSwitch() {
  const { t } = useTranslation("workspace");
  const workspacesRaw = useWorkspaceStore((state) => state.workspaces);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const switchWorkspace = useWorkspaceStore((state) => state.switchWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const sortedWorkspaces = useMemo2(
    () => [...workspacesRaw].sort(
      (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
    ),
    [workspacesRaw]
  );
  const currentWorkspace = useMemo2(
    () => workspacesRaw.find((w) => w.id === currentWorkspaceId),
    [workspacesRaw, currentWorkspaceId]
  );
  const [showDropdown, setShowDropdown] = useState3(false);
  const [showCreateModal, setShowCreateModal] = useState3(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState3(null);
  const [deletingId, setDeletingId] = useState3(null);
  const [searchQuery, setSearchQuery] = useState3("");
  const filteredWorkspaces = useWorkspaceFilter(sortedWorkspaces, searchQuery);
  const dropdownRef = useRef3(null);
  useEffect3(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
        setShowDeleteConfirm(null);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const handleSwitchWorkspace = async (id) => {
    if (id === currentWorkspaceId || isLoading) return;
    try {
      await switchWorkspace(id);
      setShowDropdown(false);
      setSearchQuery("");
    } catch (error) {
      log2.error("\u5207\u6362\u5DE5\u4F5C\u533A\u5931\u8D25", error instanceof Error ? error : new Error(String(error)));
    }
  };
  const handleDeleteWorkspace = async (id) => {
    if (sortedWorkspaces.length <= 1) return;
    setDeletingId(id);
    try {
      await deleteWorkspace(id);
      setShowDeleteConfirm(null);
      setShowDropdown(false);
    } catch (error) {
      log2.error("\u5220\u9664\u5DE5\u4F5C\u533A\u5931\u8D25", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setDeletingId(null);
    }
  };
  const handleOpenManager = () => {
    const MANAGER_PANEL_TYPE = "workspaceManager";
    if (!pluginPanelRegistry.has(MANAGER_PANEL_TYPE)) {
      log2.warn("workspace-manager \u63D2\u4EF6\u9762\u677F\u672A\u6CE8\u518C");
      return;
    }
    setShowDropdown(false);
    useViewStore.getState().switchToLeftPanel(MANAGER_PANEL_TYPE);
  };
  if (sortedWorkspaces.length === 0 || !currentWorkspace) {
    return null;
  }
  return /* @__PURE__ */ jsxs3("div", { ref: dropdownRef, className: "relative flex items-center", children: [
    /* @__PURE__ */ jsxs3(
      "button",
      {
        onClick: () => setShowDropdown(!showDropdown),
        className: "flex items-center gap-1.5 h-7 px-2 rounded-md transition-colors hover:bg-background-hover",
        title: currentWorkspace.path,
        "data-tauri-drag-region": false,
        children: [
          /* @__PURE__ */ jsx3("span", { className: "text-sm text-text-primary truncate max-w-[100px]", children: currentWorkspace.name }),
          /* @__PURE__ */ jsx3(
            ChevronDown,
            {
              className: cn(
                "w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform",
                showDropdown && "rotate-180"
              )
            }
          )
        ]
      }
    ),
    showDropdown && /* @__PURE__ */ jsxs3(
      "div",
      {
        className: "absolute left-0 top-full mt-1 bg-background-elevated border border-border rounded-xl shadow-xl z-popover overflow-hidden min-w-[200px] max-w-[280px]",
        "data-tauri-drag-region": false,
        children: [
          sortedWorkspaces.length > 3 && /* @__PURE__ */ jsx3("div", { className: "p-2 border-b border-border-subtle", children: /* @__PURE__ */ jsx3(
            WorkspaceSearchInput,
            {
              value: searchQuery,
              onChange: setSearchQuery,
              autoFocus: true
            }
          ) }),
          /* @__PURE__ */ jsx3("div", { className: "max-h-[240px] overflow-y-auto p-1", children: filteredWorkspaces.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "py-3 text-center text-sm text-text-tertiary", children: t("search.noResults") }) : filteredWorkspaces.map((workspace) => /* @__PURE__ */ jsxs3(
            "div",
            {
              className: "group relative",
              children: [
                /* @__PURE__ */ jsxs3(
                  "button",
                  {
                    onClick: () => handleSwitchWorkspace(workspace.id),
                    disabled: isLoading || workspace.id === currentWorkspaceId,
                    className: cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors",
                      workspace.id === currentWorkspaceId ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
                    ),
                    children: [
                      /* @__PURE__ */ jsx3(
                        "span",
                        {
                          className: cn(
                            "w-1.5 h-1.5 rounded-full shrink-0 mt-0.5",
                            workspace.id === currentWorkspaceId ? "bg-primary" : "bg-text-tertiary"
                          )
                        }
                      ),
                      /* @__PURE__ */ jsxs3("div", { className: "flex-1 min-w-0 text-left", children: [
                        /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-1.5", children: [
                          /* @__PURE__ */ jsx3("span", { className: "font-medium truncate", children: workspace.name }),
                          workspace.id === currentWorkspaceId && /* @__PURE__ */ jsx3(Check, { className: "w-3.5 h-3.5 shrink-0" })
                        ] }),
                        /* @__PURE__ */ jsx3("div", { className: "text-xs truncate text-text-tertiary mt-0.5 leading-tight", children: workspace.path })
                      ] })
                    ]
                  }
                ),
                workspace.id !== currentWorkspaceId && filteredWorkspaces.length > 1 && /* @__PURE__ */ jsx3(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(workspace.id);
                    },
                    disabled: deletingId === workspace.id,
                    className: cn(
                      "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all",
                      "opacity-0 group-hover:opacity-100",
                      "text-text-tertiary hover:text-danger hover:bg-danger/10",
                      deletingId === workspace.id && "opacity-50 cursor-not-allowed"
                    ),
                    title: t("selector.deleteWorkspace"),
                    children: /* @__PURE__ */ jsx3(Trash, { className: "w-3.5 h-3.5" })
                  }
                )
              ]
            },
            workspace.id
          )) }),
          /* @__PURE__ */ jsx3("div", { className: "border-t border-border-subtle" }),
          /* @__PURE__ */ jsx3("div", { className: "p-1", children: /* @__PURE__ */ jsxs3(
            "button",
            {
              onClick: () => {
                setShowDropdown(false);
                setShowCreateModal(true);
              },
              className: "w-full flex items-center gap-2 px-2 py-2 text-sm text-text-secondary hover:text-primary hover:bg-background-hover transition-colors rounded-lg",
              children: [
                /* @__PURE__ */ jsx3(Plus, { className: "w-3.5 h-3.5" }),
                /* @__PURE__ */ jsx3("span", { children: t("selector.createWorkspace") })
              ]
            }
          ) }),
          pluginPanelRegistry.has("workspaceManager") && /* @__PURE__ */ jsx3("div", { className: "p-1 pt-0", children: /* @__PURE__ */ jsxs3(
            "button",
            {
              onClick: handleOpenManager,
              className: "w-full flex items-center gap-2 px-2 py-2 text-sm text-text-secondary hover:text-primary hover:bg-background-hover transition-colors rounded-lg",
              children: [
                /* @__PURE__ */ jsx3(LayoutGrid, { className: "w-3.5 h-3.5" }),
                /* @__PURE__ */ jsx3("span", { children: t("selector.manageWorkspaces") })
              ]
            }
          ) }),
          showDeleteConfirm && /* @__PURE__ */ jsx3(
            "div",
            {
              className: "absolute inset-0 bg-background-elevated/95 backdrop-blur-sm flex items-center justify-center p-4",
              onClick: (e) => e.stopPropagation(),
              children: /* @__PURE__ */ jsxs3("div", { className: "bg-background-surface border border-border rounded-xl p-4 max-w-[220px]", children: [
                /* @__PURE__ */ jsx3("p", { className: "text-sm text-text-primary mb-2", children: t("selector.confirmDelete", {
                  name: sortedWorkspaces.find((w) => w.id === showDeleteConfirm)?.name
                }) }),
                /* @__PURE__ */ jsx3("p", { className: "text-xs text-text-tertiary mb-4", children: t("selector.deleteHint") }),
                /* @__PURE__ */ jsxs3("div", { className: "flex justify-end gap-2", children: [
                  /* @__PURE__ */ jsx3(
                    "button",
                    {
                      onClick: () => setShowDeleteConfirm(null),
                      className: "px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors",
                      children: t("common:buttons.cancel")
                    }
                  ),
                  /* @__PURE__ */ jsx3(
                    "button",
                    {
                      onClick: () => handleDeleteWorkspace(showDeleteConfirm),
                      disabled: deletingId === showDeleteConfirm,
                      className: cn(
                        "px-3 py-1.5 text-sm bg-danger text-white rounded-lg transition-colors",
                        "hover:bg-danger-hover",
                        deletingId === showDeleteConfirm && "opacity-50 cursor-not-allowed"
                      ),
                      children: deletingId === showDeleteConfirm ? "..." : t("common:buttons.delete")
                    }
                  )
                ] })
              ] })
            }
          )
        ]
      }
    ),
    showCreateModal && /* @__PURE__ */ jsx3(CreateWorkspaceModal, { onClose: () => setShowCreateModal(false) })
  ] });
}

// src/Panel.tsx
import { useState as useState7, useEffect as useEffect4, useMemo as useMemo3, useCallback as useCallback2 } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getWorkspaceApi() {
  const api = hostWindow().__POLARIS_WORKSPACE_API__;
  if (!api) {
    throw new Error("\u5BBF\u4E3B\u5DE5\u4F5C\u533A API \u4E0D\u53EF\u7528:\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_WORKSPACE_API__");
  }
  return api;
}
function getHostInvoke() {
  const invoke2 = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke2) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528:\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__");
  }
  return invoke2;
}
function hasHostSupport() {
  const w = hostWindow();
  return !!w.__POLARIS_WORKSPACE_API__ && !!w.__POLARIS_HOST_INVOKE__;
}

// src/types.ts
var PLUGIN_ID = "workspace-manager";

// src/store.ts
var invoke = () => getHostInvoke();
var cache = null;
var DEFAULT_DATA = {
  meta: {},
  groups: [],
  sort: "recent"
};
async function loadPluginData() {
  try {
    const raw = await invoke()("plugin_get_config", { pluginId: PLUGIN_ID });
    cache = {
      meta: raw?.meta && typeof raw.meta === "object" ? raw.meta : {},
      groups: Array.isArray(raw?.groups) ? raw.groups : [],
      sort: raw?.sort === "name" || raw?.sort === "created" || raw?.sort === "recent" ? raw.sort : "recent"
    };
  } catch {
    cache = { ...DEFAULT_DATA, meta: {}, groups: [] };
  }
  return cache;
}
async function persist() {
  if (!cache) return;
  await invoke()("plugin_set_config", {
    pluginId: PLUGIN_ID,
    patch: { meta: cache.meta, groups: cache.groups, sort: cache.sort }
  });
}
function getData() {
  return cache ?? { ...DEFAULT_DATA, meta: {}, groups: [] };
}
function getMeta(id) {
  return getData().meta[id] ?? {};
}
async function setMeta(id, patch) {
  if (!cache) cache = await loadPluginData();
  cache.meta[id] = { ...getMeta(id), ...patch };
  await persist();
}
async function removeMeta(id) {
  if (!cache) cache = await loadPluginData();
  delete cache.meta[id];
  await persist();
}
function getGroups() {
  const data = getData();
  const fromMeta = /* @__PURE__ */ new Set();
  for (const m of Object.values(data.meta)) {
    if (m.group) fromMeta.add(m.group);
  }
  const merged2 = Array.from(/* @__PURE__ */ new Set([...data.groups, ...fromMeta]));
  return merged2;
}
async function saveGroup(name) {
  if (!cache) cache = await loadPluginData();
  if (!cache.groups.includes(name)) {
    cache.groups = [...cache.groups, name];
    await persist();
  }
}
async function deleteGroup(name) {
  if (!cache) cache = await loadPluginData();
  cache.groups = cache.groups.filter((g) => g !== name);
  for (const [id, m] of Object.entries(cache.meta)) {
    if (m.group === name) {
      const { group: _drop, ...rest } = m;
      cache.meta[id] = rest;
    }
  }
  await persist();
}
async function setSort(sort) {
  if (!cache) cache = await loadPluginData();
  cache.sort = sort;
  await persist();
}
async function importMeta(meta) {
  if (!cache) cache = await loadPluginData();
  for (const [id, m] of Object.entries(meta)) {
    cache.meta[id] = { ...getMeta(id), ...m };
  }
  await persist();
}
function exportData() {
  return JSON.parse(JSON.stringify(getData()));
}

// src/styles.ts
var injected = false;
function ensurePanelStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.id = "workspace-manager-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
var STYLES = `
.wm-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

/* \u5934\u90E8:\u641C\u7D22 */
.wm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-search {
  position: relative;
  flex: 1;
}
.wm-search input {
  width: 100%;
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 6px;
  padding: 6px 10px 6px 28px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  outline: none;
}
.wm-search input:focus {
  border-color: var(--primary, #6d8eff);
  box-shadow: 0 0 0 2px rgba(109,142,255,0.15);
}
.wm-search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted, #a1a1aa);
  pointer-events: none;
  font-size: 11px;
}
.wm-count {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  flex-shrink: 0;
}

/* \u4E3B\u4F53:\u4FA7\u680F + \u5217\u8868 */
.wm-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.wm-sidebar {
  width: 148px;
  border-right: 1px solid var(--border, rgba(255,255,255,0.08));
  overflow-y: auto;
  padding: 6px 4px;
  flex-shrink: 0;
}
.wm-sb-label {
  font-size: 10px;
  color: var(--text-muted, #71717a);
  padding: 8px 8px 3px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.wm-sb-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-secondary, #d4d4d8);
  font-size: 12px;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}
.wm-sb-item:hover { background: var(--background-hover, rgba(255,255,255,0.05)); }
.wm-sb-item.active {
  background: rgba(109,142,255,0.12);
  color: var(--primary, #6d8eff);
}
.wm-sb-item .wm-sb-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wm-sb-item .wm-sb-count {
  font-size: 10px;
  color: var(--text-muted, #71717a);
}
.wm-sb-item.active .wm-sb-count { color: var(--primary, #6d8eff); }
.wm-sb-item .wm-sb-del {
  display: none;
  color: var(--text-muted, #71717a);
  font-size: 11px;
  padding: 0 2px;
}
.wm-sb-item:hover .wm-sb-del { display: inline; }
.wm-sb-item .wm-sb-del:hover { color: #ef4444; }

/* \u5217\u8868\u533A */
.wm-list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.wm-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-sort-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #71717a);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.wm-sort-btn.active {
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
}
.wm-toolbar-spacer { flex: 1; }
.wm-batch-btn {
  background: transparent;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  color: var(--text-secondary, #d4d4d8);
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.wm-batch-btn:hover { border-color: var(--primary, #6d8eff); }
.wm-batch-btn.danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }
.wm-batch-btn.danger:hover { border-color: #ef4444; background: rgba(239,68,68,0.08); }

.wm-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.wm-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
}
.wm-row:hover { background: var(--background-hover, rgba(255,255,255,0.04)); }
.wm-row.current {
  border-left-color: var(--primary, #6d8eff);
  background: rgba(109,142,255,0.08);
}
.wm-row.selected { background: rgba(109,142,255,0.12); }
.wm-check {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--border, rgba(255,255,255,0.15));
  border-radius: 3px;
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: transparent;
  font-size: 9px;
  padding: 0;
}
.wm-check.checked {
  background: var(--primary, #6d8eff);
  border-color: var(--primary, #6d8eff);
  color: #fff;
}
.wm-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: var(--background-secondary, #1a1a22);
}
.wm-main { flex: 1; min-width: 0; }
.wm-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e4e4e7);
  display: flex;
  align-items: center;
  gap: 5px;
}
.wm-name mark {
  background: rgba(251,191,36,0.3);
  color: #fbbf24;
  padding: 0 1px;
  border-radius: 2px;
}
.wm-pin { font-size: 10px; }
.wm-path {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.wm-path mark {
  background: rgba(251,191,36,0.3);
  color: #fbbf24;
  padding: 0 1px;
  border-radius: 2px;
}
.wm-notes {
  font-size: 10px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: italic;
}
.wm-group-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 7px;
  background: var(--background-secondary, #1a1a22);
  color: var(--text-secondary, #d4d4d8);
  flex-shrink: 0;
}
.wm-actions {
  display: flex;
  gap: 1px;
  opacity: 0;
  flex-shrink: 0;
}
.wm-row:hover .wm-actions { opacity: 1; }
.wm-act-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #71717a);
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
}
.wm-act-btn:hover {
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
}
.wm-act-btn.danger:hover { color: #ef4444; }

/* \u5E95\u90E8 */
.wm-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
  flex-shrink: 0;
}
.wm-btn {
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--background-secondary, #1a1a22);
  color: var(--text-primary, #e4e4e7);
  padding: 5px 12px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.wm-btn:hover { border-color: var(--primary, #6d8eff); }
.wm-btn-primary {
  background: var(--primary, #6d8eff);
  border-color: var(--primary, #6d8eff);
  color: #fff;
}
.wm-footer-spacer { flex: 1; }
.wm-status {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
}
.wm-status b { color: var(--text-secondary, #d4d4d8); font-weight: 600; }

/* \u5F39\u7A97(\u65B0\u5EFA/\u91CD\u547D\u540D/\u5206\u7EC4) */
.wm-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.wm-modal {
  background: var(--background-elevated, #14141c);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 10px;
  padding: 16px;
  width: 300px;
  max-width: calc(100% - 24px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.wm-modal h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}
.wm-field { margin-bottom: 10px; }
.wm-field label {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  margin-bottom: 4px;
}
.wm-field input {
  width: 100%;
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 5px;
  padding: 6px 9px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  outline: none;
}
.wm-field input:focus { border-color: var(--primary, #6d8eff); }
.wm-emoji-row { display: flex; gap: 3px; flex-wrap: wrap; }
.wm-emoji-opt {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px;
  padding: 0;
}
.wm-emoji-opt:hover { background: var(--background-hover, rgba(255,255,255,0.06)); }
.wm-emoji-opt.selected {
  border-color: var(--primary, #6d8eff);
  background: rgba(109,142,255,0.12);
}
.wm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.wm-error { color: #ef4444; font-size: 11px; margin-top: 6px; min-height: 14px; }

.wm-empty {
  text-align: center;
  padding: 32px 12px;
  color: var(--text-muted, #71717a);
  font-size: 12px;
}

.wm-inline-input {
  background: var(--background-secondary, #1a1a22);
  border: 1px solid var(--primary, #6d8eff);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  width: 100%;
}

.wm-drop-target.drag-over {
  outline: 1px dashed var(--primary, #6d8eff);
  outline-offset: -1px;
  border-radius: 5px;
}
`;

// src/WorkspaceList.tsx
import { useRef as useRef4, useState as useState4, useCallback } from "react";
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    text.slice(0, idx),
    /* @__PURE__ */ jsx4("mark", { children: text.slice(idx, idx + q.length) }),
    text.slice(idx + q.length)
  ] });
}
var ROW_HEIGHT = 52;
function WorkspaceList(props) {
  const {
    workspaces,
    currentId,
    metaMap,
    searchQuery,
    selectedIds,
    onSelectToggle,
    onSwitch,
    onRename,
    onEditMeta,
    onRemove,
    onTogglePin
  } = props;
  const [scrollTop, setScrollTop] = useState4(0);
  const [viewportH, setViewportH] = useState4(600);
  const listRef = useRef4(null);
  const onScroll = useCallback(() => {
    if (listRef.current) setScrollTop(listRef.current.scrollTop);
  }, []);
  const setRef = useCallback((el) => {
    listRef.current = el;
    if (el) {
      setViewportH(el.clientHeight || 600);
      const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 600));
      ro.observe(el);
    }
  }, []);
  const total = workspaces.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + 3);
  const visible = workspaces.slice(start, end);
  if (total === 0) {
    return /* @__PURE__ */ jsx4("div", { className: "wm-list", children: /* @__PURE__ */ jsx4("div", { className: "wm-empty", children: "\u65E0\u5339\u914D\u5DE5\u4F5C\u533A" }) });
  }
  return /* @__PURE__ */ jsx4(
    "div",
    {
      className: "wm-list",
      ref: setRef,
      onScroll,
      children: /* @__PURE__ */ jsx4("div", { style: { height: total * ROW_HEIGHT, position: "relative" }, children: visible.map((w, i) => {
        const meta = metaMap[w.id] ?? {};
        const isCurrent = w.id === currentId;
        const isSelected = selectedIds.has(w.id);
        return /* @__PURE__ */ jsxs4(
          "div",
          {
            className: `wm-row${isCurrent ? " current" : ""}${isSelected ? " selected" : ""}`,
            style: { position: "absolute", top: (start + i) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT },
            onClick: () => onSwitch(w.id),
            draggable: true,
            onDragStart: (e) => e.dataTransfer.setData("text/wm-workspace-id", w.id),
            children: [
              /* @__PURE__ */ jsx4(
                "button",
                {
                  className: `wm-check${isSelected ? " checked" : ""}`,
                  onClick: (e) => {
                    e.stopPropagation();
                    onSelectToggle(w.id);
                  },
                  title: "\u9009\u62E9",
                  children: "\u2713"
                }
              ),
              /* @__PURE__ */ jsx4("div", { className: "wm-icon", title: meta.notes, children: meta.icon || "\u{1F4C1}" }),
              /* @__PURE__ */ jsxs4("div", { className: "wm-main", children: [
                /* @__PURE__ */ jsxs4("div", { className: "wm-name", children: [
                  highlight(w.name, searchQuery),
                  meta.pinned && /* @__PURE__ */ jsx4("span", { className: "wm-pin", children: "\u{1F4CC}" })
                ] }),
                /* @__PURE__ */ jsx4("div", { className: "wm-path", children: highlight(w.path, searchQuery) }),
                meta.notes && /* @__PURE__ */ jsx4("div", { className: "wm-notes", children: meta.notes })
              ] }),
              meta.group && /* @__PURE__ */ jsx4("span", { className: "wm-group-tag", children: meta.group }),
              /* @__PURE__ */ jsxs4("div", { className: "wm-actions", onClick: (e) => e.stopPropagation(), children: [
                /* @__PURE__ */ jsx4("button", { className: "wm-act-btn", title: meta.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876", onClick: () => onTogglePin(w.id), children: meta.pinned ? "\u{1F4CD}" : "\u{1F4CC}" }),
                /* @__PURE__ */ jsx4("button", { className: "wm-act-btn", title: "\u91CD\u547D\u540D", onClick: () => onRename(w.id), children: "\u270E" }),
                /* @__PURE__ */ jsx4("button", { className: "wm-act-btn", title: "\u7F16\u8F91\u5143\u6570\u636E", onClick: () => onEditMeta(w.id), children: "\u{1F3F7}" }),
                /* @__PURE__ */ jsx4("button", { className: "wm-act-btn danger", title: isCurrent ? "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u53EF\u5220\u9664" : "\u5220\u9664", onClick: () => onRemove(w.id), disabled: isCurrent, children: "\u2715" })
              ] })
            ]
          },
          w.id
        );
      }) })
    }
  );
}

// src/WorkspaceSidebar.tsx
import { useState as useState5 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function WorkspaceSidebar(props) {
  const { filter, groups, metaMap, workspaces, onFilterChange, onNewGroup, onDeleteGroup, onDropToGroup } = props;
  const [dragOverGroup, setDragOverGroup] = useState5(null);
  const countBy = (pred) => workspaces.filter(pred).length;
  const ungroupedCount = countBy((w) => !metaMap[w.id]?.group);
  const pinnedCount = countBy((w) => metaMap[w.id]?.pinned);
  const handleDrop = (e, group) => {
    e.preventDefault();
    setDragOverGroup(null);
    const id = e.dataTransfer.getData("text/wm-workspace-id");
    if (id && onDropToGroup) onDropToGroup(id, group);
  };
  const dropProps = (group) => ({
    onDragOver: (e) => {
      e.preventDefault();
      setDragOverGroup(group);
    },
    onDragLeave: () => setDragOverGroup(null),
    onDrop: (e) => handleDrop(e, group)
  });
  return /* @__PURE__ */ jsxs5("div", { className: "wm-sidebar", children: [
    /* @__PURE__ */ jsx5("div", { className: "wm-sb-label", children: "\u89C6\u56FE" }),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: `wm-sb-item${filter.kind === "all" ? " active" : ""}`,
        onClick: () => onFilterChange({ kind: "all" }),
        children: [
          /* @__PURE__ */ jsx5("span", { children: "\u25A6" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-name", children: "\u5168\u90E8" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-count", children: workspaces.length })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: `wm-sb-item${filter.kind === "pinned" ? " active" : ""}`,
        onClick: () => onFilterChange({ kind: "pinned" }),
        children: [
          /* @__PURE__ */ jsx5("span", { children: "\u2605" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-name", children: "\u7F6E\u9876" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-count", children: pinnedCount })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: `wm-sb-item${filter.kind === "recent" ? " active" : ""}`,
        onClick: () => onFilterChange({ kind: "recent" }),
        children: [
          /* @__PURE__ */ jsx5("span", { children: "\u{1F558}" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-name", children: "\u6700\u8FD1 7 \u5929" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-count", children: countBy((w) => Date.now() - new Date(w.lastAccessed).getTime() < 7 * 24 * 3600 * 1e3) })
        ]
      }
    ),
    groups.length > 0 && /* @__PURE__ */ jsx5("div", { className: "wm-sb-label", children: "\u5206\u7EC4" }),
    groups.map((g) => /* @__PURE__ */ jsxs5(
      "button",
      {
        className: `wm-sb-item${filter.kind === "group" && filter.group === g ? " active" : ""}${dragOverGroup === g ? " wm-drop-target drag-over" : ""}`,
        onClick: () => onFilterChange({ kind: "group", group: g }),
        ...dropProps(g),
        children: [
          /* @__PURE__ */ jsx5("span", { children: "\u25CF" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-name", children: g }),
          /* @__PURE__ */ jsx5(
            "span",
            {
              className: "wm-sb-del",
              title: "\u5220\u9664\u5206\u7EC4(\u6210\u5458\u56DE\u9000\u672A\u5206\u7EC4)",
              onClick: (e) => {
                e.stopPropagation();
                onDeleteGroup(g);
              },
              children: "\u2715"
            }
          ),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-count", children: countBy((w) => metaMap[w.id]?.group === g) })
        ]
      },
      g
    )),
    /* @__PURE__ */ jsx5("div", { className: "wm-sb-label", children: "\u672A\u5206\u7EC4" }),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: `wm-sb-item${filter.kind === "ungrouped" ? " active" : ""}${dragOverGroup === "__none__" ? " wm-drop-target drag-over" : ""}`,
        onClick: () => onFilterChange({ kind: "ungrouped" }),
        ...dropProps("__none__"),
        children: [
          /* @__PURE__ */ jsx5("span", { children: "\u25CB" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-name", children: "\u672A\u5206\u7EC4" }),
          /* @__PURE__ */ jsx5("span", { className: "wm-sb-count", children: ungroupedCount })
        ]
      }
    ),
    /* @__PURE__ */ jsx5("div", { style: { marginTop: 8, borderTop: "1px dashed var(--border, rgba(255,255,255,0.08))", paddingTop: 6 }, children: /* @__PURE__ */ jsxs5("button", { className: "wm-sb-item", onClick: onNewGroup, style: { fontSize: 11, color: "var(--text-muted)" }, children: [
      /* @__PURE__ */ jsx5("span", { children: "\uFF0B" }),
      /* @__PURE__ */ jsx5("span", { className: "wm-sb-name", children: "\u65B0\u5EFA\u5206\u7EC4" })
    ] }) })
  ] });
}

// src/modals.tsx
import { useState as useState6 } from "react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var ICON_CHOICES = ["\u{1F4C1}", "\u{1F3E0}", "\u{1F4F1}", "\u{1F527}", "\u{1F3A8}", "\u{1F4CA}", "\u{1F9EA}", "\u{1F680}", "\u{1F4DA}", "\u{1F3AE}", "\u{1F4BC}", "\u{1F331}", "\u26A1", "\u{1F9E0}", "\u{1F3F7}\uFE0F", "\u2B50"];
function WorkspaceModals(props) {
  const { modal, workspaces, groups, selectedIds, api, onClose } = props;
  if (!modal) return null;
  if (modal.kind === "create") {
    return /* @__PURE__ */ jsx6(CreateModal, { ...props });
  }
  if (modal.kind === "rename") {
    const ws = workspaces.find((w) => w.id === modal.id);
    return /* @__PURE__ */ jsx6(RenameModal, { workspace: ws, onClose, onRename: props.onRename }, modal.id);
  }
  if (modal.kind === "editMeta") {
    const ws = workspaces.find((w) => w.id === modal.id);
    return /* @__PURE__ */ jsx6(MetaModal, { workspace: ws, initialMeta: modal.initialMeta, groups, onClose, onUpdate: props.onUpdateMeta }, modal.id);
  }
  if (modal.kind === "newGroup") {
    return /* @__PURE__ */ jsx6(NewGroupModal, { onClose, onSave: props.onSaveGroup });
  }
  if (modal.kind === "batchGroup") {
    return /* @__PURE__ */ jsx6(BatchGroupModal, { groups, count: selectedIds.size, onClose, onApply: props.onBatchGroup });
  }
  return null;
}
function Overlay({ children }) {
  return /* @__PURE__ */ jsx6("div", { className: "wm-overlay", onClick: (e) => {
    if (e.target === e.currentTarget) return;
  }, children: /* @__PURE__ */ jsx6("div", { className: "wm-modal", children }) });
}
function Actions({ onClose, onConfirm, confirmLabel, busy, disabled }) {
  return /* @__PURE__ */ jsxs6("div", { className: "wm-modal-actions", children: [
    /* @__PURE__ */ jsx6("button", { className: "wm-btn", onClick: onClose, children: "\u53D6\u6D88" }),
    /* @__PURE__ */ jsx6("button", { className: "wm-btn wm-btn-primary", onClick: onConfirm, disabled: busy || disabled, children: busy ? "..." : confirmLabel })
  ] });
}
function CreateModal({ api, onClose, onCreate }) {
  const [name, setName] = useState6("");
  const [path, setPath] = useState6("");
  const [switchAfter, setSwitchAfter] = useState6(true);
  const [busy, setBusy] = useState6(false);
  const [error, setError] = useState6("");
  const confirm = async () => {
    if (!name.trim() || !path.trim()) {
      setError("\u8BF7\u586B\u5199\u540D\u79F0\u4E0E\u8DEF\u5F84");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const valid = await api?.validatePath(path.trim());
      if (!valid) {
        setError("\u8DEF\u5F84\u65E0\u6548(\u9700\u4E3A\u5B58\u5728\u7684\u76EE\u5F55)");
        setBusy(false);
        return;
      }
      await onCreate(name.trim(), path.trim(), switchAfter);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs6(Overlay, { children: [
    /* @__PURE__ */ jsx6("h3", { children: "\u65B0\u5EFA\u5DE5\u4F5C\u533A" }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx6("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "\u4F8B\u5982: \u6211\u7684\u9879\u76EE", autoFocus: true })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u8DEF\u5F84" }),
      /* @__PURE__ */ jsx6("input", { value: path, onChange: (e) => setPath(e.target.value), placeholder: "D:\\\\projects\\\\my-project" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "wm-field", children: /* @__PURE__ */ jsxs6("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }, children: [
      /* @__PURE__ */ jsx6("input", { type: "checkbox", checked: switchAfter, onChange: (e) => setSwitchAfter(e.target.checked), style: { width: "auto" } }),
      "\u521B\u5EFA\u540E\u7ACB\u5373\u5207\u6362"
    ] }) }),
    /* @__PURE__ */ jsx6("div", { className: "wm-error", children: error }),
    /* @__PURE__ */ jsx6(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u521B\u5EFA", busy })
  ] });
}
function RenameModal({ workspace, onClose, onRename }) {
  const [name, setName] = useState6(workspace?.name ?? "");
  const [busy, setBusy] = useState6(false);
  const confirm = async () => {
    if (!workspace || !name.trim()) return;
    setBusy(true);
    try {
      await onRename(workspace.id, name);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs6(Overlay, { children: [
    /* @__PURE__ */ jsx6("h3", { children: "\u91CD\u547D\u540D\u5DE5\u4F5C\u533A" }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u65B0\u540D\u79F0" }),
      /* @__PURE__ */ jsx6(
        "input",
        {
          value: name,
          onChange: (e) => setName(e.target.value),
          autoFocus: true,
          onKeyDown: (e) => {
            if (e.key === "Enter") confirm();
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx6(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u91CD\u547D\u540D", busy, disabled: !name.trim() })
  ] });
}
function MetaModal({ workspace, initialMeta, groups, onClose, onUpdate }) {
  const [icon, setIcon] = useState6(initialMeta?.icon ?? "\u{1F4C1}");
  const [group, setGroup] = useState6(initialMeta?.group ?? "");
  const [newGroup, setNewGroup] = useState6("");
  const [pinned, setPinned] = useState6(!!initialMeta?.pinned);
  const [notes, setNotes] = useState6(initialMeta?.notes ?? "");
  const [busy, setBusy] = useState6(false);
  const confirm = async () => {
    if (!workspace) return;
    setBusy(true);
    const finalGroup = newGroup.trim() || group;
    try {
      await onUpdate({
        icon: icon === "\u{1F4C1}" ? void 0 : icon,
        group: finalGroup || void 0,
        pinned: pinned || void 0,
        notes: notes.trim() || void 0
      }, workspace.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs6(Overlay, { children: [
    /* @__PURE__ */ jsxs6("h3", { children: [
      "\u7F16\u8F91: ",
      workspace?.name ?? ""
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u56FE\u6807" }),
      /* @__PURE__ */ jsx6("div", { className: "wm-emoji-row", children: ICON_CHOICES.map((c) => /* @__PURE__ */ jsx6("button", { className: `wm-emoji-opt${icon === c ? " selected" : ""}`, onClick: () => setIcon(c), children: c }, c)) })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u5206\u7EC4" }),
      /* @__PURE__ */ jsxs6(
        "select",
        {
          value: group,
          onChange: (e) => {
            setGroup(e.target.value);
            setNewGroup("");
          },
          style: { width: "100%", background: "var(--background-secondary, #1a1a22)", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 5, padding: "6px 9px", color: "var(--text-primary, #e4e4e7)", fontSize: 12 },
          children: [
            /* @__PURE__ */ jsx6("option", { value: "", children: "(\u672A\u5206\u7EC4)" }),
            groups.map((g) => /* @__PURE__ */ jsx6("option", { value: g, children: g }, g))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u6216\u65B0\u5EFA\u5206\u7EC4" }),
      /* @__PURE__ */ jsx6("input", { value: newGroup, onChange: (e) => setNewGroup(e.target.value), placeholder: "\u8F93\u5165\u65B0\u5206\u7EC4\u540D" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "wm-field", children: /* @__PURE__ */ jsxs6("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }, children: [
      /* @__PURE__ */ jsx6("input", { type: "checkbox", checked: pinned, onChange: (e) => setPinned(e.target.checked), style: { width: "auto" } }),
      "\u7F6E\u9876"
    ] }) }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u5907\u6CE8" }),
      /* @__PURE__ */ jsx6("input", { value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "\u53EF\u9009:\u9879\u76EE\u8BF4\u660E/\u5BA2\u6237\u540D" })
    ] }),
    /* @__PURE__ */ jsx6(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u4FDD\u5B58", busy })
  ] });
}
function NewGroupModal({ onClose, onSave }) {
  const [name, setName] = useState6("");
  return /* @__PURE__ */ jsxs6(Overlay, { children: [
    /* @__PURE__ */ jsx6("h3", { children: "\u65B0\u5EFA\u5206\u7EC4" }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u5206\u7EC4\u540D" }),
      /* @__PURE__ */ jsx6(
        "input",
        {
          value: name,
          onChange: (e) => setName(e.target.value),
          autoFocus: true,
          onKeyDown: (e) => {
            if (e.key === "Enter" && name.trim()) {
              onSave(name.trim());
              onClose();
            }
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx6(Actions, { onClose, onConfirm: () => {
      if (name.trim()) {
        onSave(name.trim());
        onClose();
      }
    }, confirmLabel: "\u521B\u5EFA", disabled: !name.trim() })
  ] });
}
function BatchGroupModal({ groups, count, onClose, onApply }) {
  const [group, setGroup] = useState6("");
  const [newGroup, setNewGroup] = useState6("");
  const [busy, setBusy] = useState6(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onApply(newGroup.trim() || group);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs6(Overlay, { children: [
    /* @__PURE__ */ jsxs6("h3", { children: [
      "\u79FB\u5165\u5206\u7EC4(",
      count,
      " \u9879)"
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u76EE\u6807\u5206\u7EC4" }),
      /* @__PURE__ */ jsxs6(
        "select",
        {
          value: group,
          onChange: (e) => {
            setGroup(e.target.value);
            setNewGroup("");
          },
          style: { width: "100%", background: "var(--background-secondary, #1a1a22)", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 5, padding: "6px 9px", color: "var(--text-primary, #e4e4e7)", fontSize: 12 },
          children: [
            /* @__PURE__ */ jsx6("option", { value: "", children: "(\u79FB\u51FA\u5206\u7EC4)" }),
            groups.map((g) => /* @__PURE__ */ jsx6("option", { value: g, children: g }, g))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "wm-field", children: [
      /* @__PURE__ */ jsx6("label", { children: "\u6216\u65B0\u5EFA\u5206\u7EC4" }),
      /* @__PURE__ */ jsx6("input", { value: newGroup, onChange: (e) => setNewGroup(e.target.value), placeholder: "\u8F93\u5165\u65B0\u5206\u7EC4\u540D" })
    ] }),
    /* @__PURE__ */ jsx6(Actions, { onClose, onConfirm: confirm, confirmLabel: "\u79FB\u5165", busy, disabled: !group && !newGroup.trim() })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function Panel(props) {
  ensurePanelStyles();
  const [hostError, setHostError] = useState7(
    hasHostSupport() ? null : "\u4E3B\u5E94\u7528\u672A\u63D0\u4F9B\u5BBF\u4E3B API(\u9700\u8981\u66F4\u65B0\u4E3B\u5E94\u7528\u4EE5\u652F\u6301 __POLARIS_WORKSPACE_API__)"
  );
  const [workspaces, setWorkspaces] = useState7([]);
  const [currentId, setCurrentId] = useState7(null);
  const [dataVersion, setDataVersion] = useState7(0);
  const [filter, setFilter] = useState7({ kind: "all" });
  const [searchQuery, setSearchQuery] = useState7("");
  const [sort, setSortState] = useState7("recent");
  const [selectedIds, setSelectedIds] = useState7(/* @__PURE__ */ new Set());
  const [modal, setModal] = useState7(null);
  useEffect4(() => {
    let unsub;
    let mounted = true;
    (async () => {
      try {
        const data = await loadPluginData();
        if (!mounted) return;
        setSortState(data.sort);
        const api2 = getWorkspaceApi();
        setWorkspaces(api2.list());
        setCurrentId(api2.currentId());
        unsub = api2.subscribe(() => {
          setWorkspaces(api2.list());
          setCurrentId(api2.currentId());
        });
      } catch (e) {
        if (mounted) setHostError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);
  const bumpData = useCallback2(() => setDataVersion((v) => v + 1), []);
  const metaMap = useMemo3(() => {
    const map = {};
    for (const w of workspaces) map[w.id] = getMeta(w.id);
    return map;
  }, [workspaces, dataVersion]);
  const groups = useMemo3(() => {
    return getGroups();
  }, [dataVersion]);
  const filtered = useMemo3(() => {
    let list = workspaces;
    const meta = (id) => metaMap[id] ?? {};
    if (filter.kind === "pinned") list = list.filter((w) => meta(w.id).pinned);
    else if (filter.kind === "recent") {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1e3;
      list = list.filter((w) => new Date(w.lastAccessed).getTime() > cutoff);
    } else if (filter.kind === "group") list = list.filter((w) => meta(w.id).group === filter.group);
    else if (filter.kind === "ungrouped") list = list.filter((w) => !meta(w.id).group);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((w) => {
        const notes = meta(w.id).notes ?? "";
        return w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q) || notes.toLowerCase().includes(q);
      });
    }
    const sorted = [...list].sort((a, b) => {
      const pa = meta(a.id).pinned ? 1 : 0;
      const pb = meta(b.id).pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (sort === "name") return a.name.localeCompare(b.name, "zh");
      if (sort === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime();
    });
    return sorted;
  }, [workspaces, metaMap, filter, searchQuery, sort]);
  const api = hostError ? null : getWorkspaceApi();
  const handleSwitch = useCallback2(async (id) => {
    if (!api || id === currentId) return;
    try {
      await api.switch(id);
    } catch (e) {
      console.error("[workspace-manager] switch failed", e);
    }
  }, [api, currentId]);
  const handleRename = useCallback2(async (id, name) => {
    if (!api || !name.trim()) return;
    try {
      await api.update(id, { name: name.trim() });
    } catch (e) {
      console.error("[workspace-manager] rename failed", e);
    }
  }, [api]);
  const handleCreate = useCallback2(async (name, path, switchAfter) => {
    if (!api) throw new Error("\u5BBF\u4E3B API \u4E0D\u53EF\u7528");
    await api.create(name, path, switchAfter);
  }, [api]);
  const handleRemove = useCallback2(async (ids) => {
    if (!api) return;
    for (const id of ids) {
      if (id === currentId) continue;
      try {
        await api.remove(id);
        await removeMeta(id);
      } catch (e) {
        console.error("[workspace-manager] remove failed", e);
      }
    }
    setSelectedIds(/* @__PURE__ */ new Set());
    bumpData();
  }, [api, currentId, bumpData]);
  const handleUpdateMeta = useCallback2(async (id, patch) => {
    await setMeta(id, patch);
    bumpData();
  }, [bumpData]);
  const handleTogglePin = useCallback2((id) => {
    const cur = getMeta(id).pinned;
    void handleUpdateMeta(id, { pinned: !cur || void 0 });
  }, [handleUpdateMeta]);
  const handleDropToGroup = useCallback2((id, group) => {
    const target = group === "__none__" ? "" : group;
    void handleUpdateMeta(id, { group: target || void 0 });
  }, [handleUpdateMeta]);
  const handleSortChange = useCallback2(async (mode) => {
    setSortState(mode);
    await setSort(mode);
  }, []);
  const handleSaveGroup = useCallback2(async (name) => {
    if (!name.trim()) return;
    await saveGroup(name.trim());
    bumpData();
  }, [bumpData]);
  const handleDeleteGroup = useCallback2(async (name) => {
    await deleteGroup(name);
    setFilter((f) => f.kind === "group" && f.group === name ? { kind: "all" } : f);
    bumpData();
  }, [bumpData]);
  const handleExport = useCallback2(() => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace-manager-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  const handleImport = useCallback2(async (file) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.meta === "object") {
        await importMeta(parsed.meta);
        if (Array.isArray(parsed.groups)) {
          for (const g of parsed.groups) await saveGroup(String(g));
        }
        bumpData();
      }
    } catch (e) {
      console.error("[workspace-manager] import failed", e);
    }
  }, [bumpData]);
  if (hostError) {
    return /* @__PURE__ */ jsx7("div", { className: "wm-panel", children: /* @__PURE__ */ jsxs7("div", { className: "wm-empty", style: { paddingTop: 48 }, children: [
      /* @__PURE__ */ jsx7("div", { style: { fontSize: 24, marginBottom: 8 }, children: "\u{1F50C}" }),
      /* @__PURE__ */ jsx7("div", { children: hostError })
    ] }) });
  }
  return /* @__PURE__ */ jsxs7("div", { className: "wm-panel", style: { position: "relative" }, children: [
    /* @__PURE__ */ jsxs7("div", { className: "wm-header", children: [
      /* @__PURE__ */ jsxs7("div", { className: "wm-search", children: [
        /* @__PURE__ */ jsx7("span", { className: "wm-search-icon", children: "\u{1F50D}" }),
        /* @__PURE__ */ jsx7(
          "input",
          {
            type: "text",
            placeholder: "\u641C\u7D22\u540D\u79F0 / \u8DEF\u5F84 / \u5907\u6CE8",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs7("span", { className: "wm-count", children: [
        filtered.length,
        "/",
        workspaces.length
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "wm-body", children: [
      /* @__PURE__ */ jsx7(
        WorkspaceSidebar,
        {
          filter,
          groups,
          metaMap,
          workspaces,
          onFilterChange: setFilter,
          onNewGroup: () => setModal({ kind: "newGroup" }),
          onDeleteGroup: handleDeleteGroup,
          onDropToGroup: handleDropToGroup
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "wm-list-area", children: [
        /* @__PURE__ */ jsxs7("div", { className: "wm-toolbar", children: [
          /* @__PURE__ */ jsx7("button", { className: `wm-sort-btn${sort === "recent" ? " active" : ""}`, onClick: () => handleSortChange("recent"), children: "\u6700\u8FD1\u8BBF\u95EE" }),
          /* @__PURE__ */ jsx7("button", { className: `wm-sort-btn${sort === "name" ? " active" : ""}`, onClick: () => handleSortChange("name"), children: "\u540D\u79F0" }),
          /* @__PURE__ */ jsx7("button", { className: `wm-sort-btn${sort === "created" ? " active" : ""}`, onClick: () => handleSortChange("created"), children: "\u521B\u5EFA\u65F6\u95F4" }),
          /* @__PURE__ */ jsx7("span", { className: "wm-toolbar-spacer" })
        ] }),
        /* @__PURE__ */ jsx7(
          WorkspaceList,
          {
            workspaces: filtered,
            currentId: currentId ?? void 0,
            metaMap,
            searchQuery,
            selectedIds,
            onSelectToggle: (id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            },
            onSwitch: handleSwitch,
            onRename: (id) => setModal({ kind: "rename", id }),
            onEditMeta: (id) => setModal({ kind: "editMeta", id, initialMeta: metaMap[id] }),
            onRemove: (id) => handleRemove([id]),
            onTogglePin: handleTogglePin
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "wm-footer", children: [
      /* @__PURE__ */ jsx7("button", { className: "wm-btn wm-btn-primary", onClick: () => setModal({ kind: "create" }), children: "+ \u65B0\u5EFA" }),
      selectedIds.size > 0 && /* @__PURE__ */ jsxs7(Fragment3, { children: [
        /* @__PURE__ */ jsxs7("button", { className: "wm-batch-btn danger", onClick: () => handleRemove(Array.from(selectedIds)), children: [
          "\u5220\u9664 (",
          selectedIds.size,
          ")"
        ] }),
        /* @__PURE__ */ jsx7("button", { className: "wm-batch-btn", onClick: () => setModal({ kind: "batchGroup" }), children: "\u79FB\u5165\u5206\u7EC4" })
      ] }),
      /* @__PURE__ */ jsx7("span", { className: "wm-footer-spacer" }),
      /* @__PURE__ */ jsx7("button", { className: "wm-btn", onClick: handleExport, title: "\u5BFC\u51FA\u5907\u4EFD", children: "\u2B07" }),
      /* @__PURE__ */ jsxs7("label", { className: "wm-btn", style: { display: "inline-flex", alignItems: "center" }, title: "\u5BFC\u5165\u5907\u4EFD", children: [
        "\u2B06",
        /* @__PURE__ */ jsx7(
          "input",
          {
            type: "file",
            accept: "application/json",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs7("span", { className: "wm-status", children: [
        "\u5DF2\u540C\u6B65 ",
        /* @__PURE__ */ jsx7("b", { children: workspaces.length }),
        " \u4E2A\u5DE5\u4F5C\u533A"
      ] })
    ] }),
    /* @__PURE__ */ jsx7(
      WorkspaceModals,
      {
        modal,
        workspaces,
        groups,
        selectedIds,
        api,
        onClose: () => setModal(null),
        onCreate: handleCreate,
        onRename: handleRename,
        onUpdateMeta: (patch, id) => handleUpdateMeta(id, patch),
        onBatchGroup: async (group) => {
          for (const id of selectedIds) await handleUpdateMeta(id, { group: group || void 0 });
          setSelectedIds(/* @__PURE__ */ new Set());
          setModal(null);
        },
        onSaveGroup: (name) => {
          handleSaveGroup(name);
          setModal(null);
        }
      }
    )
  ] });
}

// src/index.ts
function registerUi(host) {
  const components = globalThis.__POLARIS_APP_CORE__?.components;
  if (components) {
    components.WorkspaceSearchInput = WorkspaceSearchInput;
    components.useWorkspaceFilter = useWorkspaceFilter;
    components.CreateWorkspaceModal = CreateWorkspaceModal;
  }
}
export {
  CreateWorkspaceModal,
  WorkspaceQuickSwitch,
  WorkspaceSearchInput,
  Panel as default,
  registerUi,
  useWorkspaceFilter
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils/toLucideIconData.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/build/defaultAttributes.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/build/buildLucideIconNode.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/build/buildLucideIconForReact.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/context.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/check.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-down.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/layout-grid.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/plus.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/search.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/trash.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/x.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.mjs:
  (**
   * @license lucide-react v1.74.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
