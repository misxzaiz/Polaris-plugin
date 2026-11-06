// src/blocks/form-card.tsx
import { memo, useCallback, useRef, useState } from "react";

// node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t2, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t2 = 0; t2 < o; t2++) e[t2] && (f = r(e[t2])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t2, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t2 = r(e)) && (n && (n += " "), n += t2);
  return n;
}
var clsx_default = clsx;

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement } from "react";

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.js
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

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.js
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

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.js
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

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/circle-check-big.js
var CircleCheckBig = createLucideIcon("CircleCheckBig", [
  ["path", { d: "M21.801 10A10 10 0 1 1 17 3.335", key: "yps3ct" }],
  ["path", { d: "m9 11 3 3L22 4", key: "1pflzl" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/circle-x.js
var CircleX = createLucideIcon("CircleX", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/clipboard-list.js
var ClipboardList = createLucideIcon("ClipboardList", [
  ["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1", key: "tgr4d6" }],
  [
    "path",
    {
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
      key: "116196"
    }
  ],
  ["path", { d: "M12 11h4", key: "1jrz19" }],
  ["path", { d: "M12 16h4", key: "n85exb" }],
  ["path", { d: "M8 11h.01", key: "1dfujw" }],
  ["path", { d: "M8 16h.01", key: "18s6g9" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/loader-circle.js
var LoaderCircle = createLucideIcon("LoaderCircle", [
  ["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/save.js
var Save = createLucideIcon("Save", [
  [
    "path",
    {
      d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      key: "1c8476"
    }
  ],
  ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", key: "1ydtos" }],
  ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7", key: "t51u73" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/send.js
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

// src/blocks/form-card.tsx
import { submitForm, skipForm, saveFormTemplate } from "polaris-host/form";
import { jsx, jsxs } from "react/jsx-runtime";
var t = (key, fallback) => fallback ?? { "form.submitting": "\u63D0\u4EA4\u4E2D\u2026", "question.submitting": "\u63D0\u4EA4\u4E2D\u2026", "question.submit": "\u63D0\u4EA4" }[key] ?? key;
var log = { error: (...a) => console.error("[interactive-component]", ...a), warn: (...a) => console.warn("[interactive-component]", ...a) };
function showBanner(kind, title, message) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;right:16px;bottom:64px;z-index:9999;max-width:340px;padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:pre-wrap;";
  const border = kind === "error" ? "1px solid #f87171" : "1px solid #34d399";
  el.style.border = border;
  el.style.background = "var(--popover, #1f1f23)";
  el.style.color = "var(--popover-foreground, #eee)";
  el.textContent = title + (message ? "\n" + message : "");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
var useToastStore = { getState: () => ({ error: (a, b) => showBanner("error", a, b), success: (a, b) => showBanner("success", a, b) }) };
var Button = ({ variant, size, className, children, ...rest }) => /* @__PURE__ */ jsx(
  "button",
  {
    type: "button",
    className: clsx_default(
      "inline-flex items-center justify-center gap-1 rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none",
      variant === "primary" ? "bg-primary text-primary-foreground hover:opacity-90 px-3 py-1 text-xs" : "text-text-secondary hover:bg-background-hover hover:text-text-primary px-2 py-1 text-xs",
      className
    ),
    ...rest,
    children
  }
);
var buildCardStyle = (style) => {
  if (!style) return {};
  const out = {};
  const accent = style.accent;
  const bg = style.bg;
  const radius = style.radius;
  if (typeof accent === "string") {
    out.accentColor = accent;
    out["--form-accent"] = accent;
  }
  if (typeof bg === "string") out.background = bg;
  if (typeof radius === "string" || typeof radius === "number") out.borderRadius = String(radius);
  return out;
};
var buildGridStyle = (style) => {
  if (!style) return {};
  const out = {};
  const gridCols = style.gridCols !== void 0 ? Number(style.gridCols) : void 0;
  const gap = style.gap;
  if (gridCols && gridCols >= 1 && gridCols <= 4) {
    out.display = "grid";
    out.gridTemplateColumns = `repeat(${gridCols}, minmax(0, 1fr))`;
  }
  if (typeof gap === "string" || typeof gap === "number") out.gap = String(gap);
  return out;
};
var FormCard = memo(function FormCard2({ block }) {
  const readNone = block.read === "none";
  const [privateSubmit, setPrivateSubmit] = useState(readNone);
  const [rawValues, setRawValues] = useState(() => {
    if (readNone) return {};
    const init = {};
    for (const f of block.fields) {
      if (f.default !== void 0) init[f.name] = f.default;
    }
    return init;
  });
  const fieldRefs = useRef({});
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const isSubmitted = block.status === "submitted";
  const isSkipped = block.status === "skipped";
  const registerRef = useCallback(
    (name) => (el) => {
      fieldRefs.current[name] = el;
    },
    []
  );
  const setValue = useCallback(
    (name, value) => {
      if (readNone) return;
      setRawValues((prev) => ({ ...prev, [name]: value }));
    },
    [readNone]
  );
  const collectValues = useCallback(() => {
    if (!readNone) return rawValues;
    const vals = {};
    for (const f of block.fields) {
      if (f.secret) continue;
      const el = fieldRefs.current[f.name];
      if (!el) continue;
      const raw = el.value;
      if (f.type === "number") vals[f.name] = raw === "" ? "" : Number(raw);
      else if (f.type === "boolean") vals[f.name] = el.checked;
      else vals[f.name] = raw;
    }
    return vals;
  }, [readNone, rawValues, block.fields]);
  const submit = useCallback(async () => {
    if (isSubmitted || isSkipped || submitting) return;
    if (!block.sessionId) {
      useToastStore.getState().error(
        t("form.noSession", "\u8868\u5355\u672A\u7ED1\u5B9A\u4F1A\u8BDD\uFF0C\u65E0\u6CD5\u63D0\u4EA4"),
        ""
      );
      return;
    }
    const values = collectValues();
    const missing = block.fields.filter((f) => f.required).filter((f) => {
      const v = values[f.name];
      return v === void 0 || v === null || String(v).trim() === "";
    }).map((f) => f.label || f.name);
    if (missing.length > 0) {
      useToastStore.getState().error(
        t("form.missingRequired", "\u5FC5\u586B\u9879\u672A\u586B\u5199"),
        missing.join("\u3001")
      );
      return;
    }
    setSubmitting(true);
    try {
      await submitForm(block.id, values, {
        sessionId: block.sessionId,
        private: privateSubmit
      });
    } catch (error) {
      log.error(
        "\u8868\u5355\u63D0\u4EA4\u5931\u8D25:",
        error instanceof Error ? error : new Error(String(error))
      );
      useToastStore.getState().error(
        t("form.submitFailed", "\u63D0\u4EA4\u5931\u8D25"),
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setSubmitting(false);
    }
  }, [block, isSubmitted, isSkipped, submitting, privateSubmit, collectValues, t]);
  const skip = useCallback(async () => {
    if (isSubmitted || isSkipped || submitting || skipping) return;
    if (!block.sessionId) return;
    setSkipping(true);
    try {
      await skipForm(block.id);
    } catch (error) {
      log.error(
        "\u8868\u5355\u8DF3\u8FC7\u5931\u8D25:",
        error instanceof Error ? error : new Error(String(error))
      );
      useToastStore.getState().error(
        t("form.submitFailed", "\u8DF3\u8FC7\u5931\u8D25"),
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setSkipping(false);
    }
  }, [block, isSubmitted, isSkipped, submitting, skipping, t]);
  const saveAsTemplate = useCallback(async () => {
    if (savingTemplate || !block.sessionId) return;
    setSavingTemplate(true);
    try {
      const res = await saveFormTemplate(block.id, block.title);
      useToastStore.getState().success(
        t("form.templateSaved", "\u6A21\u677F\u5DF2\u4FDD\u5B58"),
        res.name || ""
      );
    } catch (error) {
      log.error(
        "\u4FDD\u5B58\u6A21\u677F\u5931\u8D25:",
        error instanceof Error ? error : new Error(String(error))
      );
      useToastStore.getState().error(
        t("form.templateSaveFailed", "\u4FDD\u5B58\u6A21\u677F\u5931\u8D25"),
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setSavingTemplate(false);
    }
  }, [savingTemplate, block, t]);
  if (isSubmitted || isSkipped) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        role: "group",
        className: "my-2 rounded-lg border overflow-hidden bg-bg-primary/40 border-border",
        children: [
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: clsx_default(
                "flex items-center gap-2 px-3 py-2 border-b",
                isSkipped ? "bg-text-tertiary/10 border-text-tertiary/20" : block.ok ? "bg-success-faint/40 border-success/20" : "bg-error-faint/40 border-error/20"
              ),
              children: [
                isSkipped ? /* @__PURE__ */ jsx(CircleX, { className: "w-4 h-4 text-text-tertiary shrink-0", "aria-hidden": "true" }) : block.ok ? /* @__PURE__ */ jsx(CircleCheckBig, { className: "w-4 h-4 text-success shrink-0", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(CircleX, { className: "w-4 h-4 text-error shrink-0", "aria-hidden": "true" }),
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: clsx_default(
                      "text-sm font-medium",
                      isSkipped ? "text-text-tertiary" : block.ok ? "text-success" : "text-error"
                    ),
                    children: isSkipped ? t("form.skipped", "\u5DF2\u8DF3\u8FC7") : block.ok ? t("form.submitted", "\u5DF2\u63D0\u4EA4") : t("form.submitFailed", "\u63D0\u4EA4\u5931\u8D25")
                  }
                ),
                block.read !== "none" && /* @__PURE__ */ jsxs("span", { className: "ml-auto text-[11px] text-text-tertiary", children: [
                  t("form.to", "\u76EE\u6807"),
                  ": ",
                  block.target
                ] })
              ]
            }
          ),
          !isSkipped && block.receipt && /* @__PURE__ */ jsx("pre", { className: "p-3 text-xs text-text-secondary whitespace-pre-wrap break-words font-mono max-h-64 overflow-auto", children: block.receipt }),
          isSkipped && block.receipt && /* @__PURE__ */ jsx("pre", { className: "p-3 text-xs text-text-tertiary whitespace-pre-wrap break-words font-mono max-h-64 overflow-auto", children: block.receipt })
        ]
      }
    );
  }
  if (block.fields.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "my-2 rounded-lg border border-warning/30 bg-warning-faint/30 p-3 text-xs text-text-tertiary", children: t("form.empty", "\u7A7A\u8868\u5355\u5757") });
  }
  return /* @__PURE__ */ jsxs(
    "div",
    {
      role: "form",
      "aria-labelledby": `form-title-${block.id}`,
      className: "my-2 rounded-lg border overflow-hidden flex flex-col bg-accent-faint/30 border-accent/30",
      style: buildCardStyle(block.style),
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-accent/20 bg-accent-faint/50", children: [
          /* @__PURE__ */ jsx(ClipboardList, { className: "w-4 h-4 text-accent shrink-0", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx("span", { id: `form-title-${block.id}`, className: "text-sm font-medium text-text-primary", children: block.title || t("form.label", "\u8868\u5355") }),
          /* @__PURE__ */ jsxs("span", { className: "ml-auto flex items-center gap-1", children: [
            readNone && /* @__PURE__ */ jsx("span", { className: "text-[11px] text-text-tertiary px-1.5 py-0.5 rounded bg-background-elevated/60", children: t("form.readNone", "\u9690\u79C1\u6A21\u5F0F \xB7 \u503C\u4E0D\u4FDD\u7559") }),
            block.mode === "collect" ? /* @__PURE__ */ jsx("span", { className: "text-[11px] text-accent px-1.5 py-0.5 rounded bg-accent-faint/60", children: t("form.modeCollect", "\u53C2\u6570\u6536\u96C6") }) : !readNone && /* @__PURE__ */ jsxs("span", { className: "text-[11px] text-text-tertiary px-1.5 py-0.5 rounded bg-background-elevated/60", children: [
              t("form.to", "\u76EE\u6807"),
              ": ",
              block.target
            ] }),
            block.template?.name && /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-background-elevated/60", children: [
              t("form.templateFrom", "\u6765\u81EA\u6A21\u677F"),
              ": ",
              block.template.name
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "p-3",
            style: buildGridStyle(block.style),
            children: block.fields.map((field) => /* @__PURE__ */ jsx(
              "div",
              {
                style: field.col && field.col > 1 ? { gridColumn: `span ${Math.min(field.col, 4)} / span ${Math.min(field.col, 4)}` } : void 0,
                children: /* @__PURE__ */ jsx(
                  FormField,
                  {
                    field,
                    uncontrolled: readNone,
                    value: readNone ? void 0 : rawValues[field.name],
                    controlRef: registerRef(field.name),
                    disabled: submitting || skipping,
                    onChange: (v) => setValue(field.name, v)
                  }
                )
              },
              field.name
            ))
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "shrink-0 px-3 py-2 border-t border-accent/20 bg-background-elevated/50 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxs(
            "label",
            {
              className: "flex items-center gap-1.5 text-[11px] text-text-tertiary cursor-pointer select-none mr-auto",
              title: t(
                "form.privateHint",
                "\u52FE\u9009\u540E\uFF0C\u4F60\u586B\u5199\u7684\u5185\u5BB9\u4E0E\u63D0\u4EA4\u7ED3\u679C\u90FD\u4E0D\u4F1A\u8FDB\u5165 AI \u7684\u4E0A\u4E0B\u6587"
              ),
              children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: privateSubmit,
                    onChange: (e) => setPrivateSubmit(e.target.checked),
                    disabled: submitting || skipping,
                    className: "accent-accent w-3.5 h-3.5"
                  }
                ),
                t("form.privateSubmit", "\u79C1\u5BC6\u63D0\u4EA4 \xB7 AI \u4E0D\u53EF\u89C1")
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => void saveAsTemplate(),
              disabled: submitting || skipping || savingTemplate,
              title: t("form.saveTemplateHint", "\u628A\u8868\u5355\u7ED3\u6784\u4FDD\u5B58\u4E3A\u6A21\u677F\uFF0C\u4F9B AI \u4EE5\u540E\u590D\u7528"),
              children: [
                savingTemplate ? /* @__PURE__ */ jsx(LoaderCircle, { className: "w-3.5 h-3.5 animate-spin", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(Save, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
                /* @__PURE__ */ jsx("span", { className: "ml-1", children: t("form.saveTemplate", "\u5B58\u4E3A\u6A21\u677F") })
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => void skip(),
              disabled: submitting || skipping || isSkipped,
              className: "ml-4",
              children: skipping ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx(LoaderCircle, { className: "w-3.5 h-3.5 animate-spin", "aria-hidden": "true" }),
                t("form.submitting")
              ] }) : /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx(CircleX, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
                t("form.skip", "\u8DF3\u8FC7")
              ] })
            }
          ),
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "primary",
              size: "sm",
              onClick: () => void submit(),
              disabled: submitting || skipping,
              children: submitting ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx(LoaderCircle, { className: "w-3.5 h-3.5 animate-spin", "aria-hidden": "true" }),
                t("form.submitting")
              ] }) : /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx(Send, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
                t("form.submit", "\u63D0\u4EA4")
              ] })
            }
          )
        ] })
      ]
    }
  );
});
function FormField({ field, uncontrolled, value, controlRef, disabled, onChange }) {
  const { t: t2 } = useTranslation("chat");
  const type = field.type ?? "string";
  const id = `form-field-${field.name}`;
  const requiredMark = field.required ? " *" : "";
  const isSecret = !!field.secret;
  const inputCls = clsx_default(
    "w-full px-3 py-1.5 rounded-md text-sm bg-bg-secondary border border-border",
    "focus:border-accent focus:ring-1 focus:ring-accent outline-none",
    "placeholder:text-text-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
  );
  const renderControl = () => {
    if (isSecret) {
      return /* @__PURE__ */ jsx(
        "input",
        {
          id,
          type: "password",
          ref: controlRef,
          defaultValue: uncontrolled && typeof value !== "boolean" ? value ?? "" : void 0,
          value: !uncontrolled && typeof value === "string" ? value : void 0,
          onChange: (e) => !uncontrolled && onChange(e.target.value),
          placeholder: field.placeholder || t2("form.secretPlaceholder", "\u8F93\u5165\u4FDD\u5BC6\u503C\u2026\u2026"),
          disabled,
          autoComplete: "off",
          className: inputCls,
          "data-secret": true
        }
      );
    }
    const temporalTypes = ["date", "time", "datetime", "month", "week"];
    const nativeInputType = {
      date: "date",
      time: "time",
      datetime: "datetime-local",
      month: "month",
      week: "week"
    };
    switch (type) {
      case "number":
        return /* @__PURE__ */ jsx(
          "input",
          {
            id,
            type: "number",
            ref: controlRef,
            defaultValue: uncontrolled && typeof value !== "boolean" ? value ?? "" : void 0,
            value: !uncontrolled && typeof value === "string" ? value : void 0,
            onChange: (e) => !uncontrolled && onChange(e.target.value === "" ? "" : Number(e.target.value)),
            placeholder: field.placeholder,
            disabled,
            className: inputCls
          }
        );
      case "boolean":
        return /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-sm text-text-secondary", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              id,
              type: "checkbox",
              ref: controlRef,
              defaultChecked: uncontrolled ? Boolean(value) : void 0,
              checked: !uncontrolled ? Boolean(value) : void 0,
              onChange: (e) => !uncontrolled && onChange(e.target.checked),
              disabled,
              className: "accent-accent w-4 h-4"
            }
          ),
          t2("form.yesNo", "\u662F")
        ] });
      case "textarea":
        return /* @__PURE__ */ jsx(
          "textarea",
          {
            id,
            ref: controlRef,
            defaultValue: uncontrolled && typeof value !== "boolean" ? value ?? "" : void 0,
            value: !uncontrolled && typeof value === "string" ? value : void 0,
            onChange: (e) => !uncontrolled && onChange(e.target.value),
            placeholder: field.placeholder,
            disabled,
            rows: 3,
            className: clsx_default(inputCls, "resize-y")
          }
        );
      case "select":
        return /* @__PURE__ */ jsxs(
          "select",
          {
            id,
            ref: controlRef,
            defaultValue: uncontrolled && typeof value !== "boolean" ? value ?? "" : void 0,
            value: !uncontrolled && typeof value === "string" ? value : void 0,
            onChange: (e) => !uncontrolled && onChange(e.target.value),
            disabled,
            className: inputCls,
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: t2("form.selectPlaceholder", "\u8BF7\u9009\u62E9\u2026\u2026") }),
              (field.options ?? []).map((opt) => /* @__PURE__ */ jsx("option", { value: opt, children: opt }, opt))
            ]
          }
        );
      case "date":
      case "time":
      case "datetime":
      case "month":
      case "week": {
        const inputType = nativeInputType[type];
        return /* @__PURE__ */ jsx(
          "input",
          {
            id,
            type: inputType,
            ref: controlRef,
            defaultValue: uncontrolled && typeof value !== "boolean" ? value ?? "" : void 0,
            value: !uncontrolled && typeof value === "string" ? value : void 0,
            onChange: (e) => !uncontrolled && onChange(e.target.value),
            min: field.min,
            max: field.max,
            step: field.step,
            disabled,
            className: inputCls
          }
        );
      }
      case "string":
      default:
        return /* @__PURE__ */ jsx(
          "input",
          {
            id,
            type: "text",
            ref: controlRef,
            defaultValue: uncontrolled && typeof value !== "boolean" ? value ?? "" : void 0,
            value: !uncontrolled && typeof value === "string" ? value : void 0,
            onChange: (e) => !uncontrolled && onChange(e.target.value),
            placeholder: field.placeholder,
            disabled,
            className: inputCls
          }
        );
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("label", { htmlFor: id, className: "block text-xs font-medium text-text-secondary mb-1", children: [
      field.label || field.name,
      requiredMark,
      isSecret && /* @__PURE__ */ jsx("span", { className: "ml-1.5 text-[10px] text-text-tertiary", children: t2("form.secretTag", "\u4FDD\u5BC6") }),
      !isSecret && field.hidden && /* @__PURE__ */ jsx("span", { className: "ml-1.5 text-[10px] text-warning/80", title: t2("form.hiddenHint", "\u503C\u4F1A\u53C2\u4E0E\u5904\u7406\uFF0C\u4F46\u4E0D\u4F1A\u8FDB\u5165 AI \u4E0A\u4E0B\u6587"), children: t2("form.hiddenTag", "AI \u4E0D\u53EF\u89C1") })
    ] }),
    renderControl(),
    field.help && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-text-tertiary", children: field.help })
  ] });
}
var form_card_default = FormCard;
export {
  FormCard,
  form_card_default as default
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/defaultAttributes.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-check-big.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-x.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/clipboard-list.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/save.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/send.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
