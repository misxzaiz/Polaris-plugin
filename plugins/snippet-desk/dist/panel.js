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

// src/PromptSnippetTab.tsx
import { useState, useEffect, useCallback, forwardRef as forwardRef3, useImperativeHandle } from "react";

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

// src/hostBridge.ts
function getHostInvoke() {
  const fn = globalThis.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}

// src/snippetService.ts
async function snippetDispatch(action, payload = {}) {
  const res = await getHostInvoke()("router_dispatch", {
    req: {
      target: "cap.prompt_snippet",
      payload: { action, ...payload }
    }
  });
  if (!res.ok) {
    throw new Error(res.error || `cap.prompt_snippet ${action} \u5931\u8D25`);
  }
  return res.result || {};
}
async function snippetList() {
  const result = await snippetDispatch("list");
  return result.items || [];
}
async function snippetCreate(params) {
  const result = await snippetDispatch("create", { ...params });
  return result.item;
}
async function snippetUpdate(id, params) {
  const result = await snippetDispatch("update", { id, ...params });
  return result.item ?? null;
}
async function snippetDelete(id) {
  const result = await snippetDispatch("delete", { id });
  return Boolean(result.deleted);
}

// src/logger.ts
function createLogger(scope) {
  const fmt = (msg) => `[${scope}] ${msg}`;
  return {
    debug: (msg, ...rest) => {
      if (import.meta.env?.DEV) console.debug(fmt(msg), ...rest);
    },
    info: (msg, ...rest) => console.info(fmt(msg), ...rest),
    warn: (msg, ...rest) => console.warn(fmt(msg), ...rest),
    error: (msg, ...rest) => console.error(fmt(msg), ...rest)
  };
}

// src/snippetStore.ts
var log = createLogger("SnippetStore");
var useSnippetStore = create((set, get) => ({
  snippets: [],
  loading: false,
  error: null,
  loadSnippets: async () => {
    set({ loading: true, error: null });
    try {
      const snippets = await snippetList();
      set({ snippets, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("\u52A0\u8F7D\u7247\u6BB5\u5931\u8D25", err instanceof Error ? err : new Error(msg));
      set({ error: msg, loading: false });
    }
  },
  createSnippet: async (params) => {
    const snippet = await snippetCreate(params);
    set((state) => ({ snippets: [...state.snippets, snippet] }));
    return snippet;
  },
  updateSnippet: async (id, params) => {
    const result = await snippetUpdate(id, params);
    if (result) {
      set((state) => ({
        snippets: state.snippets.map((s) => s.id === id ? result : s)
      }));
    }
    return result;
  },
  deleteSnippet: async (id) => {
    const deleted = await snippetDelete(id);
    if (deleted) {
      set((state) => ({
        snippets: state.snippets.filter((s) => s.id !== id)
      }));
    }
    return deleted;
  },
  searchSnippets: (query) => {
    const { snippets } = get();
    if (!query) return snippets.filter((s) => s.enabled);
    const lower = query.toLowerCase();
    return snippets.filter(
      (s) => s.enabled && (s.name.toLowerCase().includes(lower) || (s.description?.toLowerCase().includes(lower) ?? false))
    );
  }
}));

// src/deps.ts
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
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
var useSkillStore = forwardStore("useSkillStore");
var useConfigStore = forwardStore("useConfigStore");
var useToastStore = forwardStore("useToastStore");

// src/promptSnippet.ts
var AUTO_VARIABLES = [
  { key: "date", label: "\u5F53\u524D\u65E5\u671F", description: "YYYY-MM-DD" },
  { key: "time", label: "\u5F53\u524D\u65F6\u95F4", description: "HH:MM" },
  { key: "workspaceName", label: "\u5DE5\u4F5C\u533A\u540D\u79F0", description: "\u5F53\u524D\u5DE5\u4F5C\u533A" },
  { key: "workspacePath", label: "\u5DE5\u4F5C\u533A\u8DEF\u5F84", description: "\u5F53\u524D\u5DE5\u4F5C\u533A\u8DEF\u5F84" }
];
function extractVariables(content) {
  const matches = content.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  const vars = [...new Set(matches.map((m) => m.slice(2, -2)))];
  const autoKeys = AUTO_VARIABLES.map((v) => v.key);
  return vars.filter((v) => !autoKeys.includes(v));
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

// node_modules/lucide-react/dist/esm/icons/plus.js
var __iconNode = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
];
var Plus = createLucideIcon("plus", __iconNode);

// node_modules/lucide-react/dist/esm/icons/square-pen.js
var __iconNode2 = [
  ["path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", key: "1m0v6g" }],
  [
    "path",
    {
      d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
      key: "ohrbg2"
    }
  ]
];
var SquarePen = createLucideIcon("square-pen", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/trash-2.js
var __iconNode3 = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
];
var Trash2 = createLucideIcon("trash-2", __iconNode3);

// src/PromptSnippetTab.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var EMPTY_FORM = {
  name: "",
  description: "",
  content: "",
  variables: [],
  enabled: true
};
var PromptSnippetTab = forwardRef3(function PromptSnippetTab2(_props, ref) {
  const { t } = useTranslation("promptSnippet");
  const { snippets, loadSnippets, createSnippet, updateSnippet, deleteSnippet } = useSnippetStore();
  const { skills, loading: skillsLoading, loadSkills } = useSkillStore();
  const config = useConfigStore((state) => state.config);
  const updateConfigPatch = useConfigStore((state) => state.updateConfigPatch);
  const { addToast } = useToastStore();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [skillPathsText, setSkillPathsText] = useState("");
  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);
  useEffect(() => {
    setSkillPathsText((config?.skillPaths?.length ? config.skillPaths : [".polaris/skills", ".polaris/agents"]).join("\n"));
  }, [config?.skillPaths]);
  const handleSaveSkillPaths = async () => {
    const skillPaths = [...new Set(skillPathsText.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))];
    try {
      await updateConfigPatch({ skillPaths });
      await loadSkills();
      addToast({ type: "success", title: "Skill \u8DEF\u5F84\u5DF2\u4FDD\u5B58" });
    } catch (err) {
      addToast({ type: "error", title: err instanceof Error ? err.message : String(err) });
    }
  };
  ;
  [skills, skillsLoading, handleSaveSkillPaths];
  const handleCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };
  const handleEdit = (snippet) => {
    setEditingId(snippet.id);
    setForm({
      name: snippet.name,
      description: snippet.description ?? "",
      content: snippet.content,
      variables: [...snippet.variables],
      enabled: snippet.enabled
    });
    setShowForm(true);
  };
  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    try {
      if (editingId) {
        const params = {
          name: form.name,
          description: form.description || void 0,
          content: form.content,
          variables: form.variables,
          enabled: form.enabled
        };
        await updateSnippet(editingId, params);
        addToast({ type: "success", title: t("toast.updated", { name: form.name }) });
      } else {
        const params = {
          name: form.name,
          description: form.description || void 0,
          content: form.content,
          variables: form.variables,
          enabled: form.enabled
        };
        await createSnippet(params);
        addToast({ type: "success", title: t("toast.created", { name: form.name }) });
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: msg });
    }
  };
  const handleDelete = async (snippet) => {
    if (!confirm(t("deleteConfirm", { name: snippet.name }))) return;
    await deleteSnippet(snippet.id);
    addToast({ type: "success", title: t("toast.deleted") });
  };
  const handleCancel = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };
  useImperativeHandle(ref, () => ({
    saveForm: async () => {
      if (!showForm) return false;
      if (!form.name.trim() || !form.content.trim()) return false;
      await handleSave();
      return true;
    },
    isFormOpen: showForm
  }), [showForm, form, handleSave]);
  const addVariable = () => {
    setForm((prev) => ({
      ...prev,
      variables: [...prev.variables, { key: "", label: "", type: "text", required: false }]
    }));
  };
  const updateVariable = (index, field, value) => {
    setForm((prev) => {
      const vars = [...prev.variables];
      vars[index] = { ...vars[index], [field]: value };
      return { ...prev, variables: vars };
    });
  };
  const removeVariable = (index) => {
    setForm((prev) => ({ ...prev, variables: prev.variables.filter((_, i) => i !== index) }));
  };
  const extractFromContent = useCallback(() => {
    const keys = extractVariables(form.content);
    const existing = new Set(form.variables.map((v) => v.key));
    const newVars = keys.filter((k) => !existing.has(k)).map((key) => ({ key, label: key, type: "text", required: false }));
    if (newVars.length > 0) {
      setForm((prev) => ({ ...prev, variables: [...prev.variables, ...newVars] }));
    }
  }, [form.content, form.variables]);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-medium text-text-primary", children: t("title") }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-text-tertiary mt-1", children: t("description") })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: handleCreate,
          className: "flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors",
          children: [
            /* @__PURE__ */ jsx(Plus, { size: 14 }),
            t("create")
          ]
        }
      )
    ] }),
    !showForm && /* @__PURE__ */ jsx("div", { className: "border border-border rounded-lg overflow-hidden", children: snippets.length === 0 ? /* @__PURE__ */ jsx("div", { className: "p-6 text-center text-sm text-text-tertiary", children: t("empty") }) : snippets.map((snippet) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: "flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0 hover:bg-background-hover transition-colors",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs("span", { className: "font-mono text-sm text-text-primary", children: [
                "/",
                snippet.name
              ] }),
              snippet.description && /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary truncate", children: snippet.description })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-tertiary mt-0.5", children: snippet.variables.length > 0 ? snippet.variables.map((v) => `{{${v.key}}}`).join(" \xB7 ") : "\u2014" })
          ] }),
          /* @__PURE__ */ jsx("label", { className: "flex items-center gap-1.5 cursor-pointer shrink-0", children: /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: snippet.enabled,
              onChange: (e) => updateSnippet(snippet.id, { enabled: e.target.checked }),
              className: "rounded border-border text-primary focus:ring-primary"
            }
          ) }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => handleEdit(snippet),
              className: "p-1 text-text-tertiary hover:text-text-primary transition-colors",
              title: t("edit"),
              children: /* @__PURE__ */ jsx(SquarePen, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => handleDelete(snippet),
              className: "p-1 text-text-tertiary hover:text-danger transition-colors",
              title: t("delete"),
              children: /* @__PURE__ */ jsx(Trash2, { size: 14 })
            }
          )
        ]
      },
      snippet.id
    )) }),
    showForm && /* @__PURE__ */ jsxs("div", { className: "border border-border rounded-lg p-4 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsx("label", { className: "text-sm text-text-secondary", children: t("form.name") }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: form.name,
            onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })),
            placeholder: t("form.namePlaceholder"),
            className: "w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary"
          }
        ),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-text-tertiary", children: t("form.nameHint") })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsx("label", { className: "text-sm text-text-secondary", children: t("form.description") }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: form.description,
            onChange: (e) => setForm((prev) => ({ ...prev, description: e.target.value })),
            placeholder: t("form.descriptionPlaceholder"),
            className: "w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsx("label", { className: "text-sm text-text-secondary", children: t("form.content") }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: form.content,
            onChange: (e) => setForm((prev) => ({ ...prev, content: e.target.value })),
            placeholder: t("form.contentPlaceholder"),
            className: "w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary resize-none font-mono",
            rows: 5
          }
        ),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-text-tertiary", children: t("form.contentHint") })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("label", { className: "text-sm text-text-secondary", children: t("variables.title") }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: extractFromContent,
                className: "text-xs text-primary hover:text-primary-hover transition-colors",
                children: t("variables.extractFromContent")
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: addVariable,
                className: "text-xs text-primary hover:text-primary-hover transition-colors",
                children: [
                  "+ ",
                  t("variables.add")
                ]
              }
            )
          ] })
        ] }),
        form.variables.map((v, idx) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-start gap-2 p-2 bg-surface border border-border-subtle rounded-lg", children: [
          /* @__PURE__ */ jsx("div", { className: "sm:w-28 sm:shrink-0", children: /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: v.key,
              onChange: (e) => updateVariable(idx, "key", e.target.value),
              placeholder: t("variables.keyPlaceholder"),
              className: "w-full bg-background-surface border border-border rounded px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary"
            }
          ) }),
          /* @__PURE__ */ jsx("div", { className: "sm:w-28 sm:shrink-0", children: /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: v.label,
              onChange: (e) => updateVariable(idx, "label", e.target.value),
              placeholder: t("variables.labelPlaceholder"),
              className: "w-full bg-background-surface border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary"
            }
          ) }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs(
              "select",
              {
                value: v.type,
                onChange: (e) => updateVariable(idx, "type", e.target.value),
                className: "bg-background-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-primary",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "text", children: t("variables.typeText") }),
                  /* @__PURE__ */ jsx("option", { value: "textarea", children: t("variables.typeTextarea") })
                ]
              }
            ),
            /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 shrink-0 py-1", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "checkbox",
                  checked: v.required,
                  onChange: (e) => updateVariable(idx, "required", e.target.checked),
                  className: "rounded border-border text-primary"
                }
              ),
              /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary", children: t("variables.required") })
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => removeVariable(idx),
                className: "p-1 text-text-tertiary hover:text-danger transition-colors shrink-0",
                children: /* @__PURE__ */ jsx(Trash2, { size: 12 })
              }
            )
          ] })
        ] }, idx)),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 p-2 bg-background-hover rounded-lg", children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs text-text-tertiary mb-1", children: t("variables.autoVars") }),
          /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-1", children: AUTO_VARIABLES.map((v) => /* @__PURE__ */ jsxs("span", { className: "text-xs text-text-tertiary font-mono", children: [
            `{{${v.key}}}`,
            " \u2014 ",
            v.label
          ] }, v.key)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2 justify-end pt-2", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleCancel,
            className: "px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors",
            children: t("cancel")
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleSave,
            disabled: !form.name.trim() || !form.content.trim(),
            className: "px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            children: t("save")
          }
        )
      ] })
    ] })
  ] });
});

// src/index.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function SnippetDeskEntry() {
  const { t } = useTranslation("settings");
  return /* @__PURE__ */ jsxs2("div", { className: "flex flex-col h-full min-h-0 overflow-auto", children: [
    /* @__PURE__ */ jsx2("div", { className: "px-4 pt-3 pb-1 text-sm font-medium text-text-primary", children: t("nav.promptSnippet", "\u5FEB\u6377\u7247\u6BB5") }),
    /* @__PURE__ */ jsx2(PromptSnippetTab, {})
  ] });
}
export {
  SnippetDeskEntry as default
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

lucide-react/dist/esm/icons/plus.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/square-pen.js:
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

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
