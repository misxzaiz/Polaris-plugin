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
import { ArtifactPreviewRenderer, buildArtifactBlockFromData, useArtifactVersions, readArtifactHtml, openArtifactSource } from "polaris-host/artifact";
import { registerComponent, submitForm } from "polaris-host/form";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var InteractiveComponentCard = memo(function InteractiveComponentCard2(props) {
  const data = props.data;
  const form = data && typeof data === "object" ? data.form : void 0;
  const artifactBlock = useMemo(() => buildArtifactBlockFromData(data), [props.data]);
  const versions = useArtifactVersions(artifactBlock?.requirementId);
  if (!artifactBlock) {
    const partial = data;
    if (partial && typeof partial === "object" && (partial.previewId || partial.sourcePath)) {
      return /* @__PURE__ */ jsx(
        HydratingPreview,
        {
          previewId: partial.previewId,
          sourcePath: partial.sourcePath,
          title: partial.title,
          versionLabel: partial.versionLabel,
          version: typeof partial.version === "number" ? partial.version : void 0,
          createdAt: partial.createdAt,
          requirementId: partial.requirementId,
          description: partial.description,
          form,
          sessionId: props.sessionId
        }
      );
    }
    return /* @__PURE__ */ jsxs("div", { className: "my-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary", children: [
      "\u4EA4\u4E92\u7EC4\u4EF6\u6570\u636E\u89E3\u6790\u5931\u8D25\uFF08",
      props.toolName,
      "\uFF09"
    ] });
  }
  return /* @__PURE__ */ jsx(
    InteractivePreview,
    {
      artifactBlock,
      versions: versions ?? void 0,
      form,
      sessionId: props.sessionId,
      declaredCapTargets: data.caps ? new Set(data.caps) : void 0
    }
  );
});
function InteractivePreview({
  artifactBlock,
  versions,
  form,
  sessionId,
  declaredCapTargets
}) {
  const componentIdRef = useRef("");
  if (!componentIdRef.current) {
    componentIdRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `comp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const componentId = componentIdRef.current;
  const [formState, setFormState] = useState("idle");
  const [submitError, setSubmitError] = useState(null);
  const [privateSubmit, setPrivateSubmit] = useState(false);
  useEffect(() => {
    if (!form || !sessionId) return;
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
  const onFrameMessage = useCallback(
    (raw) => {
      if (!form || formState === "submitted" || formState === "submitting") return;
      const msg = raw;
      if (!msg || typeof msg !== "object") return;
      if (msg.__polarisComponent !== 1) return;
      if (msg.formId !== form.formId) return;
      handleSubmit(msg.values ?? {});
    },
    [form?.formId, formState, handleSubmit]
  );
  return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsx(
      ArtifactPreviewRenderer,
      {
        block: artifactBlock,
        versions,
        onFrameMessage,
        declaredCapTargets
      }
    ),
    form ? /* @__PURE__ */ jsx("div", { className: "my-1 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs", children: formState === "submitted" ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 text-green-500", children: [
      "\u2705 \u5DF2\u63D0\u4EA4",
      form.read === "none" ? "\uFF08\u79C1\u5BC6\uFF1A\u503C\u672A\u56DE\u4F20 AI\uFF09" : "\uFF08\u56DE\u6267\u5C06\u968F\u4E0B\u4E00\u6761\u6D88\u606F\u5E26\u7ED9 AI\uFF09"
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          className: clsx_default(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            form.read === "none" ? "bg-amber-500/10 text-amber-500" : "bg-cyan-500/10 text-cyan-400"
          ),
          title: form.read === "none" ? "\u63D0\u4EA4\u503C\u4E0D\u8FDB\u5165 AI \u4E0A\u4E0B\u6587\uFF08\u670D\u52A1\u7AEF\u5F3A\u5236\uFF09" : "\u63D0\u4EA4\u503C\u7ECF\u670D\u52A1\u7AEF\u56DE\u6267\u56DE\u4F20 AI\uFF1Bsecret \u952E\u6052\u5B9A\u63A9\u7801",
          children: form.read === "none" ? "\u79C1\u5BC6\u56DE\u4F20" : "\u8868\u5355\u56DE\u4F20"
        }
      ),
      form.read === "full" && /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-text-secondary", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: privateSubmit, onChange: (e) => setPrivateSubmit(e.target.checked) }),
        "\u79C1\u5BC6\u63D0\u4EA4\uFF08\u672C\u6B21\u503C\u4E0D\u56DE\u4F20\uFF09"
      ] }),
      /* @__PURE__ */ jsx("span", { className: "ml-auto text-text-muted", children: formState === "submitting" ? "\u63D0\u4EA4\u4E2D\u2026" : formState === "error" ? submitError || "\u63D0\u4EA4\u5931\u8D25" : `\u7B49\u5F85\u7EC4\u4EF6\u5185\u63D0\u4EA4\uFF08${form.submitLabel || "\u63D0\u4EA4"}\uFF09` })
    ] }) }) : null
  ] });
}
function HydratingPreview({
  previewId,
  sourcePath,
  title,
  versionLabel,
  version,
  createdAt,
  requirementId,
  description,
  form,
  sessionId
}) {
  const [state, setState] = useState("checking");
  const [block, setBlock] = useState(null);
  const versions = useArtifactVersions(requirementId);
  useEffect(() => {
    let cancelled = false;
    setBlock(null);
    setState("checking");
    let resolvedPreviewId = previewId;
    if (!resolvedPreviewId && sourcePath) {
      const parts = sourcePath.split(/[/\\]/);
      resolvedPreviewId = parts[parts.length - 2];
    }
    if (!sourcePath || !resolvedPreviewId) {
      setState("notice");
      return;
    }
    const finalPreviewId = resolvedPreviewId;
    readArtifactHtml(sourcePath).then((html) => {
      if (cancelled) return;
      if (typeof html === "string" && html.length > 0 && html.includes("<")) {
        setBlock({
          type: "artifact_preview",
          previewId: finalPreviewId,
          title: title?.trim() ? title : "PRD Prototype",
          contentType: "html",
          html,
          sourcePath,
          createdAt,
          version,
          versionLabel,
          requirementId,
          description
        });
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
  }, [previewId, sourcePath, title, versionLabel, version, createdAt, requirementId, description]);
  if (state === "checking") {
    return /* @__PURE__ */ jsxs("div", { className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2", children: [
      /* @__PURE__ */ jsx("div", { className: "h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" }),
      /* @__PURE__ */ jsx("span", { className: "text-xs text-text-muted", children: "\u52A0\u8F7D\u9884\u89C8\u2026" })
    ] });
  }
  if (state === "ready" && block) {
    return /* @__PURE__ */ jsx(InteractivePreview, { artifactBlock: block, versions: versions ?? void 0, form, sessionId, declaredCapTargets: void 0 });
  }
  return /* @__PURE__ */ jsxs("div", { className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs", children: [
    /* @__PURE__ */ jsx("span", { className: "text-green-500", children: "\u2705" }),
    /* @__PURE__ */ jsxs("span", { className: "text-text-secondary", children: [
      "\u9884\u89C8\u5DF2\u751F\u6210",
      title ? `\uFF1A${title}` : "",
      versionLabel ? ` \xB7 ${versionLabel}` : "",
      previewId ? `\uFF08${previewId.slice(0, 8)}\u2026\uFF09` : ""
    ] }),
    sourcePath ? /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => openArtifactSource(sourcePath),
        className: clsx_default("ml-auto shrink-0 rounded-md border border-border px-2 py-1", "text-text-secondary hover:text-primary hover:border-primary transition-colors"),
        children: "\u6253\u5F00\u6E90\u7801"
      }
    ) : null
  ] });
}
var card_default = InteractiveComponentCard;
export {
  InteractiveComponentCard,
  card_default as default
};
