// src/card.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
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
var clsx_default = clsx;

// src/card.tsx
import { readArtifactHtml, openArtifactSource } from "polaris-host/artifact";
import { registerComponent, submitForm } from "polaris-host/form";
import { forwardCap } from "polaris-host/cap";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var InteractiveComponentCard = memo(function InteractiveComponentCard2(props) {
  const data = props.data && typeof props.data === "object" ? props.data : {};
  if (typeof data.html === "string" && data.html.length > 0) {
    return /* @__PURE__ */ jsx(InteractiveFrame, { data, sessionId: props.sessionId });
  }
  if (data.sourcePath) {
    return /* @__PURE__ */ jsx(HydratingFrame, { data, sessionId: props.sessionId });
  }
  return /* @__PURE__ */ jsxs("div", { className: "my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary", children: [
    "\u4EA4\u4E92\u7EC4\u4EF6\u6570\u636E\u89E3\u6790\u5931\u8D25\uFF08",
    props.toolName,
    "\uFF09"
  ] });
});
function InteractiveFrame({ data, sessionId }) {
  const form = data.form;
  const caps = useMemo(() => Array.isArray(data.caps) ? data.caps : void 0, [data.caps]);
  const componentIdRef = useRef("");
  if (!componentIdRef.current) {
    componentIdRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `comp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const componentId = componentIdRef.current;
  const [expanded, setExpanded] = useState(false);
  const [formState, setFormState] = useState("idle");
  const [submitError, setSubmitError] = useState(null);
  const [privateSubmit, setPrivateSubmit] = useState(false);
  const formStateRef = useRef(formState);
  useEffect(() => {
    formStateRef.current = formState;
  }, [formState]);
  useEffect(() => {
    if (!form || !sessionId) return;
    if (typeof registerComponent !== "function") {
      setSubmitError("\u5BBF\u4E3B\u8868\u5355\u6865\u4E0D\u53EF\u7528\uFF0C\u7EC4\u4EF6\u63D0\u4EA4\u4E0D\u53EF\u7528");
      return;
    }
    let cancelled = false;
    registerComponent({
      sessionId,
      componentId,
      formId: form.formId,
      read: form.read,
      secretKeys: form.secretKeys
    }).catch(() => {
      if (!cancelled) setSubmitError("\u8868\u5355\u5951\u7EA6\u767B\u8BB0\u5931\u8D25\uFF0C\u63D0\u4EA4\u53EF\u80FD\u4E0D\u53EF\u7528");
    });
    return () => {
      cancelled = true;
    };
  }, [form?.formId, sessionId, componentId]);
  const handleSubmit = useCallback(
    (rawValues) => {
      if (!form) return;
      if (typeof submitForm !== "function") {
        setFormState("error");
        setSubmitError("\u5BBF\u4E3B\u8868\u5355\u6865\u4E0D\u53EF\u7528\uFF0C\u63D0\u4EA4\u5931\u8D25");
        return;
      }
      setFormState("submitting");
      setSubmitError(null);
      submitForm(form.formId, rawValues, {
        sessionId,
        private: privateSubmit || void 0,
        read: form.read
      }).then(() => {
        setFormState("submitted");
      }).catch((e) => {
        setFormState("error");
        setSubmitError(e instanceof Error ? e.message : String(e));
      });
    },
    [form?.formId, form?.read, sessionId, privateSubmit]
  );
  const html = data.html ?? "";
  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);
  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;
  useEffect(() => {
    const onMessage = (event) => {
      const source = event.source;
      const frameWin = frameRef.current?.contentWindow;
      if (!source || !frameWin || source !== frameWin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.__polarisComponent === 1) {
        if (!form || msg.formId !== form.formId) return;
        if (formStateRef.current === "submitted" || formStateRef.current === "submitting") return;
        submitRef.current(msg.values ?? {});
        return;
      }
      if (msg.__polarisCap === 1) {
        if (typeof forwardCap !== "function") return;
        forwardCap(msg, caps).then((res) => {
          try {
            source.postMessage(res, "*");
          } catch {
          }
        }).catch(() => {
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [form?.formId, caps]);
  return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-background-elevated px-3 py-1.5", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex min-w-0 items-center gap-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "truncate text-xs font-medium text-text-primary", children: String(data.title || "\u4EA4\u4E92\u7EC4\u4EF6") }),
        form ? /* @__PURE__ */ jsx(
          "span",
          {
            className: clsx_default(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
              form.read === "none" ? "bg-amber-500/10 text-amber-500" : "bg-cyan-500/10 text-cyan-400"
            ),
            title: form.read === "none" ? "\u63D0\u4EA4\u503C\u4E0D\u8FDB\u5165 AI \u4E0A\u4E0B\u6587\uFF08\u670D\u52A1\u7AEF\u5F3A\u5236\uFF09" : "\u63D0\u4EA4\u503C\u7ECF\u670D\u52A1\u7AEF\u56DE\u6267\u56DE\u4F20 AI\uFF1Bsecret \u952E\u6052\u5B9A\u63A9\u7801",
            children: form.read === "none" ? "\u79C1\u5BC6\u56DE\u4F20" : "\u8868\u5355\u56DE\u4F20"
          }
        ) : null
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "flex shrink-0 items-center gap-2", children: [
        data.sourcePath ? /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => openArtifactSource(data.sourcePath),
            className: "text-[10px] text-text-tertiary hover:text-text-primary transition-colors",
            children: "\u6E90\u7801"
          }
        ) : null,
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setExpanded(!expanded),
            className: "text-[10px] text-text-tertiary hover:text-text-primary transition-colors",
            children: expanded ? "\u6536\u8D77" : "\u5C55\u5F00"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "overflow-hidden border-x border-b border-border rounded-b-lg transition-[height] duration-200",
        style: { height: expanded ? "70vh" : "360px" },
        children: /* @__PURE__ */ jsx(
          "iframe",
          {
            ref: frameRef,
            title: String(data.title || "\u4EA4\u4E92\u7EC4\u4EF6"),
            srcDoc,
            sandbox: "allow-scripts allow-forms allow-popups allow-modals",
            className: "h-full w-full",
            style: { background: "#ffffff", border: "none" },
            referrerPolicy: "no-referrer"
          }
        )
      }
    ),
    form ? /* @__PURE__ */ jsx("div", { className: "my-1 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs", children: formState === "submitted" ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 text-green-500", children: [
      "\u2705 \u5DF2\u63D0\u4EA4",
      form.read === "none" ? "\uFF08\u79C1\u5BC6\uFF1A\u503C\u672A\u56DE\u4F20 AI\uFF09" : "\uFF08\u56DE\u6267\u5C06\u968F\u4E0B\u4E00\u6761\u6D88\u606F\u5E26\u7ED9 AI\uFF09"
    ] }) : formState === "submitting" ? /* @__PURE__ */ jsx("span", { className: "text-text-secondary", children: "\u63D0\u4EA4\u4E2D\u2026" }) : formState === "error" ? /* @__PURE__ */ jsx("span", { className: "text-red-500", children: submitError || "\u63D0\u4EA4\u5931\u8D25" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      form.read === "full" && /* @__PURE__ */ jsxs("label", { className: "flex cursor-pointer items-center gap-1 text-text-secondary", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: privateSubmit, onChange: (e) => setPrivateSubmit(e.target.checked) }),
        "\u79C1\u5BC6\u63D0\u4EA4\uFF08\u672C\u6B21\u503C\u4E0D\u56DE\u4F20\uFF09"
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "ml-auto text-text-muted", children: [
        "\u7B49\u5F85\u7EC4\u4EF6\u5185\u63D0\u4EA4\uFF08",
        form.submitLabel || "\u63D0\u4EA4",
        "\uFF09"
      ] })
    ] }) }) : null
  ] });
}
function HydratingFrame({ data, sessionId }) {
  const [state, setState] = useState("checking");
  const [html, setHtml] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setState("checking");
    setHtml(null);
    if (!data.sourcePath) {
      setState("notice");
      return;
    }
    readArtifactHtml(data.sourcePath).then((h) => {
      if (cancelled) return;
      if (typeof h === "string" && h.length > 0 && h.includes("<")) {
        setHtml(h);
        setState("ready");
      } else {
        setState("notice");
      }
    }).catch(() => {
      if (!cancelled) setState("notice");
    });
    return () => {
      cancelled = true;
    };
  }, [data.sourcePath]);
  if (state === "checking") {
    return /* @__PURE__ */ jsxs("div", { className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2", children: [
      /* @__PURE__ */ jsx("div", { className: "h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" }),
      /* @__PURE__ */ jsx("span", { className: "text-xs text-text-muted", children: "\u52A0\u8F7D\u7EC4\u4EF6\u2026" })
    ] });
  }
  if (state === "ready" && html !== null) {
    return /* @__PURE__ */ jsx(InteractiveFrame, { data: { ...data, html }, sessionId });
  }
  return /* @__PURE__ */ jsxs("div", { className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs", children: [
    /* @__PURE__ */ jsx("span", { className: "text-green-500", children: "\u2705" }),
    /* @__PURE__ */ jsxs("span", { className: "text-text-secondary", children: [
      "\u7EC4\u4EF6\u5DF2\u751F\u6210",
      data.title ? `\uFF1A${data.title}` : "",
      data.versionLabel ? ` \xB7 ${data.versionLabel}` : "",
      typeof data.previewId === "string" && data.previewId ? `\uFF08${data.previewId.slice(0, 8)}\u2026\uFF09` : ""
    ] }),
    data.sourcePath ? /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => openArtifactSource(data.sourcePath),
        className: clsx_default("ml-auto shrink-0 rounded-md border border-border px-2 py-1", "text-text-secondary hover:text-primary hover:border-primary transition-colors"),
        children: "\u6253\u5F00\u6E90\u7801"
      }
    ) : null
  ] });
}
function buildSrcDoc(html) {
  const trimmed = html.trim();
  if (/<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${trimmed}</body></html>`;
}
var card_default = InteractiveComponentCard;
export {
  InteractiveComponentCard,
  card_default as default
};
