// src/blocks/ask-card.tsx
import { memo, useReducer, useCallback, useEffect, useMemo, useRef } from "react";

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

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/check.js
var Check = createLucideIcon("Check", [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-left.js
var ChevronLeft = createLucideIcon("ChevronLeft", [
  ["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-right.js
var ChevronRight = createLucideIcon("ChevronRight", [
  ["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/circle-check-big.js
var CircleCheckBig = createLucideIcon("CircleCheckBig", [
  ["path", { d: "M21.801 10A10 10 0 1 1 17 3.335", key: "yps3ct" }],
  ["path", { d: "m9 11 3 3L22 4", key: "1pflzl" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/circle-help.js
var CircleHelp = createLucideIcon("CircleHelp", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", key: "1u773s" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/skip-forward.js
var SkipForward = createLucideIcon("SkipForward", [
  ["polygon", { points: "5 4 15 12 5 20 5 4", key: "16p6eg" }],
  ["line", { x1: "19", x2: "19", y1: "5", y2: "19", key: "futhcm" }]
]);

// node_modules/.pnpm/lucide-react@0.469.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.js
var X = createLucideIcon("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]);

// src/blocks/ask-card.tsx
import { answerQuestion } from "polaris-host/form";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var t = (key, fallback) => fallback ?? { "form.submitting": "\u63D0\u4EA4\u4E2D\u2026", "question.submitting": "\u63D0\u4EA4\u4E2D\u2026", "question.submit": "\u63D0\u4EA4" }[key] ?? key;
var log = { error: (...a) => console.error("[interactive-component]", ...a), warn: (...a) => console.warn("[interactive-component]", ...a) };
function showBanner(kind, title, message) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;right:16px;bottom:64px;z-index:9999;max-width:340px;padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:pre-wrap;";
  el.style.border = kind === "error" ? "1px solid #f87171" : "1px solid #34d399";
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
function reducer(state, action) {
  switch (action.type) {
    case "TOGGLE_OPTION": {
      const slot = state.per[action.idx];
      if (!slot) return state;
      const isOn = slot.selected.includes(action.value);
      const nextSelected = action.multiSelect ? isOn ? slot.selected.filter((v) => v !== action.value) : [...slot.selected, action.value] : [action.value];
      const per = state.per.map(
        (s, i) => i === action.idx ? { ...s, selected: nextSelected, customInput: "", declined: false } : s
      );
      return { ...state, per };
    }
    case "SET_CUSTOM_INPUT": {
      const slot = state.per[action.idx];
      if (!slot) return state;
      const per = state.per.map(
        (s, i) => i === action.idx ? {
          ...s,
          customInput: action.text,
          // 非空输入清空选项；空输入保留之前的选项
          selected: action.text.trim() ? [] : s.selected,
          declined: false
        } : s
      );
      return { ...state, per };
    }
    case "TOGGLE_DECLINE_ONE": {
      const slot = state.per[action.idx];
      if (!slot) return state;
      const per = state.per.map(
        (s, i) => i === action.idx ? { selected: [], customInput: "", declined: !s.declined } : s
      );
      return { ...state, per };
    }
    case "GO_TO":
      return { ...state, currentIdx: action.idx, focusedSlot: -1 };
    case "GO_DELTA": {
      const next = Math.min(Math.max(state.currentIdx + action.delta, 0), action.max - 1);
      return { ...state, currentIdx: next, focusedSlot: -1 };
    }
    case "BEGIN_SUBMIT":
      return { ...state, submitting: true };
    case "END_SUBMIT":
      return { ...state, submitting: false };
    case "FOCUS_AT":
      return { ...state, focusedSlot: action.slot };
    case "FOCUS_DELTA": {
      const max = Math.max(1, action.max);
      const next = (state.focusedSlot + action.delta + max) % max;
      return { ...state, focusedSlot: next };
    }
    default:
      return state;
  }
}
var AskQuestionCard = memo(function AskQuestionCard2({ block, updateBlock }) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const questions = useMemo(() => {
    if (block.questions && block.questions.length > 0) return block.questions;
    if (block.options && block.header) {
      return [
        {
          question: block.header,
          header: block.categoryLabel || "",
          multiSelect: block.multiSelect,
          options: block.options,
          allowCustomInput: block.allowCustomInput
        }
      ];
    }
    return [];
  }, [block]);
  const isAnswered = block.status === "answered";
  const isDeclinedAll = !!block.declined;
  const N = questions.length;
  const isSingle = N === 1;
  const persistedAnswers = useMemo(() => {
    if (block.answers && block.answers.length > 0) return block.answers;
    if (block.answer) {
      return [
        {
          selected: block.answer.selected || [],
          customInput: block.answer.customInput
        }
      ];
    }
    return questions.map(() => ({ selected: [], customInput: void 0 }));
  }, [block, questions]);
  const [state, dispatch] = useReducer(reducer, void 0, () => ({
    per: questions.map((_, i) => ({
      selected: persistedAnswers[i]?.selected ?? [],
      customInput: persistedAnswers[i]?.customInput ?? "",
      declined: !!persistedAnswers[i]?.declined
    })),
    currentIdx: 0,
    submitting: false,
    focusedSlot: -1
  }));
  const currentQ = questions[state.currentIdx];
  const currentSlot = state.per[state.currentIdx];
  const isSlotAnswered = useCallback(
    (idx) => {
      const s = state.per[idx];
      if (!s) return false;
      return s.declined || s.selected.length > 0 || s.customInput.trim().length > 0;
    },
    [state.per]
  );
  const anyAnswered = useMemo(
    () => state.per.some((_, i) => isSlotAnswered(i)),
    [state.per, isSlotAnswered]
  );
  const allAnswered = useMemo(
    () => state.per.every((_, i) => isSlotAnswered(i)),
    [state.per, isSlotAnswered]
  );
  const answeredCount = state.per.filter((_, i) => isSlotAnswered(i)).length;
  const submitAll = useCallback(
    async (kind) => {
      if (isAnswered || state.submitting) return;
      if (!block.sessionId) return;
      if (kind === "answer" && !anyAnswered) return;
      const finalAnswers = kind === "decline-all" ? [] : state.per.map((s) => ({
        selected: s.declined ? [] : s.selected,
        customInput: s.declined ? void 0 : s.customInput.trim() || void 0,
        declined: s.declined
      }));
      dispatch({ type: "BEGIN_SUBMIT" });
      const store = { updateQuestionBlock: (id, patch) => updateBlock(patch) };
      if (kind === "decline-all") {
        store?.updateQuestionBlock({
          declined: true
        });
      } else {
        store?.updateQuestionBlock({
          answers: finalAnswers,
          declined: false
        });
      }
      try {
        await answerQuestion(block.id, {
          answers: finalAnswers,
          declined: kind === "decline-all"
        });
      } catch (error) {
        store?.updateQuestionBlock({
          status: "pending"
        });
        log.error(
          "\u63D0\u4EA4\u7B54\u6848\u5931\u8D25:",
          error instanceof Error ? error : new Error(String(error))
        );
        useToastStore.getState().error(
          t("question.submitFailed", "\u63D0\u4EA4\u5931\u8D25"),
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        dispatch({ type: "END_SUBMIT" });
      }
    },
    [isAnswered, state.submitting, state.per, anyAnswered, block.id, block.sessionId]
  );
  const handleOptionClick = useCallback(
    (option) => {
      if (isAnswered || state.submitting) return;
      dispatch({
        type: "TOGGLE_OPTION",
        idx: state.currentIdx,
        value: option.value,
        multiSelect: !!currentQ?.multiSelect
      });
    },
    [isAnswered, state.submitting, state.currentIdx, currentQ?.multiSelect]
  );
  const handleKeyDown = useCallback(
    (e) => {
      if (isAnswered || state.submitting) return;
      const optionCount2 = currentQ?.options.length ?? 0;
      const allowCustom2 = currentQ?.allowCustomInput !== false;
      const slotCount = optionCount2 + (allowCustom2 ? 1 : 0);
      const target = e.target;
      const inTextField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      switch (e.key) {
        case "ArrowLeft":
          if (inTextField) return;
          e.preventDefault();
          dispatch({ type: "GO_DELTA", delta: -1, max: N });
          break;
        case "ArrowRight":
          if (inTextField) return;
          e.preventDefault();
          dispatch({ type: "GO_DELTA", delta: 1, max: N });
          break;
        case "ArrowDown":
        case "Tab":
          if (e.shiftKey) return;
          e.preventDefault();
          dispatch({ type: "FOCUS_DELTA", delta: 1, max: slotCount });
          break;
        case "ArrowUp":
          e.preventDefault();
          dispatch({ type: "FOCUS_DELTA", delta: -1, max: slotCount });
          break;
        case "Enter": {
          if (inTextField) {
            e.preventDefault();
            if (state.currentIdx < N - 1) {
              dispatch({ type: "GO_DELTA", delta: 1, max: N });
            } else {
              void submitAll("answer");
            }
            return;
          }
          e.preventDefault();
          if (state.focusedSlot >= 0 && state.focusedSlot < optionCount2) {
            handleOptionClick(currentQ.options[state.focusedSlot]);
          } else if (anyAnswered) {
            void submitAll("answer");
          }
          break;
        }
        case " ":
          if (state.focusedSlot >= 0 && state.focusedSlot < optionCount2) {
            e.preventDefault();
            handleOptionClick(currentQ.options[state.focusedSlot]);
          }
          break;
        case "Escape":
          if (inTextField) return;
          e.preventDefault();
          dispatch({ type: "FOCUS_AT", slot: -1 });
          break;
      }
    },
    [
      isAnswered,
      state.submitting,
      state.currentIdx,
      state.focusedSlot,
      currentQ,
      anyAnswered,
      handleOptionClick,
      submitAll,
      N
    ]
  );
  useEffect(() => {
    if (state.focusedSlot < 0) return;
    const optionCount2 = currentQ?.options.length ?? 0;
    if (state.focusedSlot < optionCount2) {
      const el = containerRef.current?.querySelector(
        `[data-option-index="${state.focusedSlot}"]`
      );
      el?.focus();
    } else if (state.focusedSlot === optionCount2 && currentQ?.allowCustomInput !== false) {
      inputRef.current?.focus();
    }
  }, [state.focusedSlot, currentQ]);
  if (isAnswered) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        role: "group",
        className: "my-2 rounded-lg border bg-success-faint/40 border-success/30 overflow-hidden",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-success/20 bg-success-faint/50", children: [
            /* @__PURE__ */ jsx(CircleCheckBig, { className: "w-4 h-4 text-success shrink-0", "aria-hidden": "true" }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: isDeclinedAll ? t("question.declinedAll", "\u5DF2\u5168\u90E8\u8DF3\u8FC7") : t("question.answeredCount", `\u5DF2\u56DE\u7B54 ${answeredCount}/${N}`) })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "p-3 space-y-2", children: questions.map((q, idx) => {
            const ans = persistedAnswers[idx];
            const declined = !!ans?.declined;
            return /* @__PURE__ */ jsxs("div", { className: "text-xs", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 mb-0.5", children: [
                q.header && /* @__PURE__ */ jsx("span", { className: "text-[11px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded shrink-0", children: q.header }),
                /* @__PURE__ */ jsx("span", { className: "text-text-primary truncate flex-1", children: q.question })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "text-text-secondary pl-1", children: declined ? /* @__PURE__ */ jsx("span", { className: "text-text-tertiary italic", children: t("question.skipped", "\u5DF2\u8DF3\u8FC7") }) : ans?.selected && ans.selected.length > 0 ? ans.selected.join(", ") : ans?.customInput ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("span", { className: "text-text-tertiary mr-1", children: "\u270E" }),
                ans.customInput
              ] }) : /* @__PURE__ */ jsx("span", { className: "text-text-tertiary italic", children: t("question.noAnswer", "\u672A\u7B54") }) })
            ] }, idx);
          }) })
        ]
      }
    );
  }
  if (!currentQ) {
    return /* @__PURE__ */ jsx("div", { className: "my-2 rounded-lg border border-warning/30 bg-warning-faint/30 p-3 text-xs text-text-tertiary", children: t("question.empty", "\u7A7A\u95EE\u9898\u5757") });
  }
  const optionCount = currentQ.options.length;
  const allowCustom = currentQ.allowCustomInput !== false;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: containerRef,
      role: "group",
      "aria-labelledby": `askq-title-${block.id}`,
      onKeyDown: handleKeyDown,
      className: "my-2 rounded-lg border overflow-hidden flex flex-col bg-accent-faint/30 border-accent/30",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-accent/20 bg-accent-faint/50", children: [
          /* @__PURE__ */ jsx(CircleHelp, { className: "w-4 h-4 text-accent shrink-0", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx("span", { id: `askq-title-${block.id}`, className: "text-sm font-medium text-text-primary", children: isSingle ? t("question.label", "\u95EE\u9898") : t("question.multiTitle", `\u95EE\u9898 (${N}) \xB7 ${answeredCount}/${N}`) }),
          !isSingle && /* @__PURE__ */ jsx("div", { role: "tablist", className: "flex items-center gap-1 ml-2", children: questions.map((_, i) => {
            const answered = isSlotAnswered(i);
            const isCur = i === state.currentIdx;
            return /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": isCur,
                "aria-label": t("question.gotoQuestion", `\u8DF3\u5230\u7B2C ${i + 1} \u9898`),
                onClick: () => dispatch({ type: "GO_TO", idx: i }),
                disabled: state.submitting,
                className: clsx_default(
                  "w-2.5 h-2.5 rounded-full transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1",
                  state.submitting && "cursor-not-allowed",
                  isCur ? answered ? "bg-accent ring-2 ring-accent/30" : "bg-accent ring-2 ring-accent/30" : answered ? "bg-accent/60" : "bg-border hover:bg-text-tertiary"
                )
              },
              i
            );
          }) }),
          /* @__PURE__ */ jsx("span", { className: "ml-auto" }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => void submitAll("decline-all"),
              disabled: state.submitting,
              className: clsx_default(
                "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
                "text-text-tertiary hover:text-text-primary hover:bg-background-hover",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              ),
              title: t("question.skipAll", "\u5168\u90E8\u8DF3\u8FC7"),
              children: [
                /* @__PURE__ */ jsx(X, { className: "w-3 h-3" }),
                t("question.skipAll", "\u5168\u90E8\u8DF3\u8FC7")
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "p-3 space-y-2", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            currentQ.header && /* @__PURE__ */ jsxs("div", { className: "mb-1", children: [
              /* @__PURE__ */ jsx("span", { className: "inline-block text-[11px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded", children: currentQ.header }),
              currentQ.multiSelect && /* @__PURE__ */ jsx("span", { className: "ml-2 text-[11px] text-text-tertiary", children: t("question.multiSelectHint") }),
              currentSlot?.declined && /* @__PURE__ */ jsx("span", { className: "ml-2 text-[11px] text-warning", children: t("question.thisQuestionSkipped", "\u672C\u9898\u5DF2\u8DF3\u8FC7") })
            ] }),
            /* @__PURE__ */ jsx("p", { className: "text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words", children: currentQ.question })
          ] }),
          /* @__PURE__ */ jsx(
            "div",
            {
              role: currentQ.multiSelect ? "group" : "radiogroup",
              "aria-multiselectable": currentQ.multiSelect,
              className: clsx_default("flex flex-col gap-1", currentSlot?.declined && "opacity-50"),
              children: currentQ.options.map((option, index) => {
                const isSelected = !currentSlot?.declined && currentSlot?.selected.includes(option.value);
                const isFocused = state.focusedSlot === index;
                const disabled = state.submitting || currentSlot?.declined;
                return /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    role: currentQ.multiSelect ? "checkbox" : "radio",
                    "data-option-index": index,
                    tabIndex: isFocused ? 0 : -1,
                    "aria-checked": !!isSelected,
                    disabled,
                    onClick: () => handleOptionClick(option),
                    onFocus: () => dispatch({ type: "FOCUS_AT", slot: index }),
                    className: clsx_default(
                      "w-full text-left px-3 py-2 rounded-md text-sm",
                      "flex items-start gap-2.5 transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1",
                      disabled && "cursor-not-allowed",
                      isSelected ? "bg-accent/15 text-accent border border-accent/30" : "bg-bg-secondary hover:bg-bg-tertiary border border-transparent",
                      !disabled && "cursor-pointer"
                    ),
                    children: [
                      /* @__PURE__ */ jsx(
                        "span",
                        {
                          "aria-hidden": "true",
                          className: clsx_default(
                            "mt-0.5 w-4 h-4 border-2 flex items-center justify-center shrink-0",
                            currentQ.multiSelect ? "rounded-[3px]" : "rounded-full",
                            isSelected ? "border-accent bg-accent" : "border-border"
                          ),
                          children: isSelected && /* @__PURE__ */ jsx(Check, { className: "w-2.5 h-2.5 text-white" })
                        }
                      ),
                      /* @__PURE__ */ jsxs("span", { className: "flex-1 min-w-0", children: [
                        /* @__PURE__ */ jsx("span", { className: "font-medium block leading-tight", children: option.label || option.value }),
                        option.description && /* @__PURE__ */ jsx("span", { className: "block text-xs text-text-tertiary mt-0.5 leading-snug", children: option.description })
                      ] })
                    ]
                  },
                  option.value || index
                );
              })
            }
          ),
          allowCustom && /* @__PURE__ */ jsxs("div", { className: clsx_default("mt-1", currentSlot?.declined && "opacity-50"), children: [
            /* @__PURE__ */ jsx("label", { htmlFor: `askq-custom-${block.id}-${state.currentIdx}`, className: "sr-only", children: t("question.customInputLabel") }),
            /* @__PURE__ */ jsx(
              "input",
              {
                ref: inputRef,
                id: `askq-custom-${block.id}-${state.currentIdx}`,
                type: "text",
                value: currentSlot?.customInput ?? "",
                onChange: (e) => dispatch({ type: "SET_CUSTOM_INPUT", idx: state.currentIdx, text: e.target.value }),
                onFocus: () => dispatch({ type: "FOCUS_AT", slot: optionCount }),
                placeholder: t("question.customInputPlaceholder", "\u6216\u8F93\u5165\u81EA\u5B9A\u4E49\u7B54\u6848\u2026\u2026"),
                disabled: state.submitting || currentSlot?.declined,
                className: clsx_default(
                  "w-full px-3 py-1.5 rounded-md text-sm bg-bg-secondary border border-border",
                  "focus:border-accent focus:ring-1 focus:ring-accent outline-none",
                  "placeholder:text-text-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                )
              }
            )
          ] }),
          !isSingle && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => dispatch({ type: "TOGGLE_DECLINE_ONE", idx: state.currentIdx }),
              disabled: state.submitting,
              className: clsx_default(
                "flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
                "text-text-tertiary hover:text-warning hover:bg-warning/10",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                currentSlot?.declined && "text-warning bg-warning/10"
              ),
              children: [
                /* @__PURE__ */ jsx(SkipForward, { className: "w-3 h-3" }),
                currentSlot?.declined ? t("question.unskipThis", "\u53D6\u6D88\u8DF3\u8FC7\u672C\u9898") : t("question.skipThis", "\u8DF3\u8FC7\u672C\u9898")
              ]
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: clsx_default(
              "shrink-0 px-3 py-2 border-t border-accent/20",
              "bg-background-elevated/50 flex items-center gap-2"
            ),
            children: [
              !isSingle && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => dispatch({ type: "GO_DELTA", delta: -1, max: N }),
                    disabled: state.currentIdx === 0 || state.submitting,
                    className: clsx_default(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs",
                      "text-text-secondary hover:text-text-primary hover:bg-background-hover",
                      "disabled:opacity-30 disabled:cursor-not-allowed"
                    ),
                    children: [
                      /* @__PURE__ */ jsx(ChevronLeft, { className: "w-3 h-3" }),
                      t("question.prev", "\u4E0A\u4E00\u9898")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => dispatch({ type: "GO_DELTA", delta: 1, max: N }),
                    disabled: state.currentIdx === N - 1 || state.submitting,
                    className: clsx_default(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs",
                      "text-text-secondary hover:text-text-primary hover:bg-background-hover",
                      "disabled:opacity-30 disabled:cursor-not-allowed"
                    ),
                    children: [
                      t("question.next", "\u4E0B\u4E00\u9898"),
                      /* @__PURE__ */ jsx(ChevronRight, { className: "w-3 h-3" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  variant: "primary",
                  size: "sm",
                  onClick: () => void submitAll("answer"),
                  disabled: !anyAnswered || state.submitting,
                  className: "ml-auto",
                  children: state.submitting ? t("question.submitting") : isSingle ? t("question.submit") : allAnswered ? t("question.submit") : t("question.submitPartial", `\u63D0\u4EA4\uFF08${answeredCount}/${N}\uFF09`)
                }
              )
            ]
          }
        )
      ]
    }
  );
});
var ask_card_default = AskQuestionCard;
export {
  AskQuestionCard,
  ask_card_default as default
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

lucide-react/dist/esm/icons/check.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-left.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-right.js:
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

lucide-react/dist/esm/icons/circle-help.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/skip-forward.js:
  (**
   * @license lucide-react v0.469.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/x.js:
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
