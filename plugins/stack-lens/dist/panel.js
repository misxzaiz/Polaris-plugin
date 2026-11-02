// src/Panel.tsx
import { useCallback, useEffect, useRef, useState } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res && res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r && r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function restartService(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}

// src/model.ts
var PLUGIN_ID = "stack-lens";
var SERVICE_ID = "stack-lens-server";
var META_KEY = "stacklens.meta";
var SvcError = class extends Error {
  constructor(message, kind = "http") {
    super(message);
    this.kind = kind;
  }
};
var cachedMeta = null;
function invalidateMeta() {
  cachedMeta = null;
}
async function readMeta(force = false) {
  if (!force && cachedMeta) return cachedMeta;
  const meta = await kvGet(META_KEY);
  if (!meta || typeof meta.port !== "number" || !meta.token) {
    throw new SvcError("\u5806\u6808\u8FD8\u539F\u53F0\u670D\u52A1\u672A\u6CE8\u518C\uFF08stacklens.meta \u7F3A\u5931\uFF09\uFF1A\u670D\u52A1\u53EF\u80FD\u8FD8\u5728\u542F\u52A8\uFF0C\u7A0D\u540E\u91CD\u8BD5\u6216\u91CD\u542F\u670D\u52A1", "no-meta");
  }
  cachedMeta = meta;
  return meta;
}
async function api(method, path, body, retried = false) {
  const meta = await readMeta();
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${meta.port}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${meta.token}`
      },
      body: body != null ? JSON.stringify(body) : void 0
    });
  } catch (e) {
    if (!retried) {
      invalidateMeta();
      return api(method, path, body, true);
    }
    throw new SvcError(`\u670D\u52A1\u8FDE\u63A5\u5931\u8D25\uFF1A${e.message}\uFF08\u53EF\u5728\u8BBE\u7F6E\u91CC\u91CD\u542F\u300C\u5806\u6808\u8FD8\u539F\u53F0\u670D\u52A1\u300D\uFF09`, "network");
  }
  let parsed;
  try {
    parsed = await res.json();
  } catch (_) {
    throw new SvcError(`\u670D\u52A1\u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.status}\uFF09`, "http");
  }
  const obj = parsed;
  if (!res.ok) throw new SvcError(String(obj.error || `HTTP ${res.status}`), "http");
  return parsed;
}
var svc = {
  meta: () => api("GET", "/api/meta"),
  resolve: (req) => api("POST", "/api/resolve", req),
  scanMaps: (dir) => api("POST", "/api/scan-maps", { dir }),
  validate: (body) => api("POST", "/api/validate", body)
};

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return "-";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
function stateBadge(state) {
  switch (state) {
    case "resolved":
      return { text: "\u2713", cls: "ok" };
    case "internal":
      return { text: "\u25CB", cls: "skip" };
    case "unparsed":
      return { text: "\uFF1F", cls: "warn" };
    default:
      return { text: "\u2717", cls: "bad" };
  }
}
function basename(p) {
  if (!p) return "";
  const s = String(p);
  return s.split(/[\\/]/).pop() || s;
}
function Chip({ label, value, tone }) {
  return /* @__PURE__ */ jsxs("span", { className: `sl-chip ${tone || ""}`, children: [
    /* @__PURE__ */ jsx("span", { className: "sl-chip-label", children: label }),
    /* @__PURE__ */ jsx("span", { className: "sl-chip-value", children: value })
  ] });
}
function Empty({ text }) {
  return /* @__PURE__ */ jsx("div", { className: "sl-empty", children: text });
}
function ErrBox({ text }) {
  return /* @__PURE__ */ jsx("div", { className: "sl-errbox", children: text });
}
function WarnBox({ items }) {
  if (!items || !items.length) return null;
  return /* @__PURE__ */ jsxs("div", { className: "sl-warnbox", children: [
    items.slice(0, 8).map((w, i) => /* @__PURE__ */ jsxs("div", { children: [
      "\u26A0 ",
      w
    ] }, i)),
    items.length > 8 ? /* @__PURE__ */ jsxs("div", { children: [
      "\u2026\u5171 ",
      items.length,
      " \u6761"
    ] }) : null
  ] });
}

// src/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
async function readMapFiles(files) {
  const out = [];
  for (const f of Array.from(files)) {
    if (!/\.map$/i.test(f.name)) continue;
    if (f.size > 60 * 1024 * 1024) {
      out.push({ label: `${f.name}\uFF08\u8D85 60MB \u8DF3\u8FC7\uFF09`, mapText: "" });
      continue;
    }
    const text = await f.text();
    out.push({ label: f.name, mapText: text, originPath: f.name });
  }
  return out;
}
function FrameRow({ fr }) {
  const [open, setOpen] = useState(false);
  const b = stateBadge(fr.state);
  const loc = fr.url != null ? `${basename(fr.url)}${fr.line != null ? `:${fr.line}` : ""}${fr.col != null ? `:${fr.col}` : ""}` : fr.raw;
  const hasDetail = fr.state === "resolved" || Boolean(fr.reason);
  return /* @__PURE__ */ jsxs2("div", { className: `sl-frame st-${fr.state}`, children: [
    /* @__PURE__ */ jsxs2("div", { className: "sl-frame-head", onClick: () => hasDetail && setOpen(!open), role: hasDetail ? "button" : void 0, children: [
      /* @__PURE__ */ jsx2("span", { className: `sl-badge ${b.cls}`, children: b.text }),
      fr.fn ? /* @__PURE__ */ jsx2("span", { className: "sl-fn", children: fr.fn }) : null,
      /* @__PURE__ */ jsx2("span", { className: "sl-loc", children: loc }),
      fr.state === "resolved" ? /* @__PURE__ */ jsx2("span", { className: "sl-arrow", children: "\u2192" }) : null,
      fr.state === "resolved" ? /* @__PURE__ */ jsxs2("span", { className: "sl-src", children: [
        basename(fr.source),
        fr.sourceLine != null ? `:${fr.sourceLine}` : "",
        fr.sourceCol != null ? `:${fr.sourceCol}` : "",
        fr.displayName && fr.displayName !== fr.fn ? /* @__PURE__ */ jsxs2("em", { className: "sl-name", children: [
          "\uFF08\u539F\u540D ",
          fr.displayName,
          "\uFF09"
        ] }) : null
      ] }) : null
    ] }),
    open && fr.state === "resolved" ? /* @__PURE__ */ jsxs2("div", { className: "sl-frame-detail", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sl-frame-path", children: [
        fr.source,
        "\uFF08map\uFF1A",
        fr.mapLabel,
        fr.codeFrameSource ? `\uFF0C\u5185\u5BB9\u6765\u81EA ${fr.codeFrameSource}` : "",
        "\uFF09"
      ] }),
      fr.codeFrame ? /* @__PURE__ */ jsx2("pre", { className: "sl-code", children: fr.codeFrame }) : null,
      fr.codeFrameNote ? /* @__PURE__ */ jsx2("div", { className: "sl-note", children: fr.codeFrameNote }) : null
    ] }) : null,
    open && fr.state !== "resolved" && fr.reason ? /* @__PURE__ */ jsx2("div", { className: "sl-frame-detail", children: /* @__PURE__ */ jsx2("div", { className: "sl-note", children: fr.reason }) }) : null
  ] });
}
function ResolveTab() {
  const [stack, setStack] = useState("");
  const [mapsDir, setMapsDir] = useState("");
  const [inlineText, setInlineText] = useState("");
  const [showInline, setShowInline] = useState(false);
  const [fetchUrl, setFetchUrl] = useState("");
  const [dragFiles, setDragFiles] = useState([]);
  const [recentDirs, setRecentDirs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    svc.meta().then((m) => {
      setRecentDirs(m.settings && m.settings.recentDirs || []);
      if (!mapsDir && m.settings && m.settings.recentDirs && m.settings.recentDirs[0]) setMapsDir(m.settings.recentDirs[0]);
    }).catch(() => {
    });
  }, []);
  const doResolve = useCallback(async () => {
    setErr("");
    setReport(null);
    setCopied(false);
    if (!stack.trim()) {
      setErr("\u8BF7\u5148\u7C98\u8D34\u9519\u8BEF\u6808");
      return;
    }
    const inlineMaps = [...dragFiles];
    if (inlineText.trim()) inlineMaps.push({ label: "\u7C98\u8D34\u7684 map", mapText: inlineText });
    if (!mapsDir.trim() && !inlineMaps.length && !fetchUrl.trim()) {
      setErr("\u8BF7\u81F3\u5C11\u7ED9\u4E00\u79CD map \u6765\u6E90\uFF1A\u76EE\u5F55 / \u62D6\u62FD .map \u6587\u4EF6 / \u7C98\u8D34 map JSON / URL");
      return;
    }
    setBusy(true);
    try {
      const resp = await svc.resolve({
        stack,
        mapsDir: mapsDir.trim() || void 0,
        inlineMaps: inlineMaps.length ? inlineMaps : void 0,
        fetchUrls: fetchUrl.trim() ? [fetchUrl.trim()] : void 0
      });
      setReport(resp);
    } catch (e) {
      setErr(e instanceof SvcError ? e.message : String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [stack, mapsDir, inlineText, fetchUrl, dragFiles]);
  const copyResult = useCallback(() => {
    if (!report) return;
    const lines = report.frames.map((f, i) => {
      const b = stateBadge(f.state);
      if (f.state === "resolved") return `${i + 1}. ${b.text} ${f.fn || ""} \u2192 ${f.source}:${f.sourceLine}:${f.sourceCol}`;
      if (f.state === "internal") return `${i + 1}. ${b.text} ${f.url || f.raw}\uFF08\u5185\u90E8\u5E27\uFF09`;
      return `${i + 1}. ${b.text} ${f.raw}${f.reason ? ` \u2014\u2014 ${f.reason}` : ""}`;
    });
    const text = [`\u8FD8\u539F\u7387 ${report.summary.rate}%\uFF08${report.summary.resolved}/${report.summary.eligible}\uFF09`, ...lines].join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
    });
  }, [report]);
  return /* @__PURE__ */ jsxs2("div", { className: "sl-tabpane", children: [
    /* @__PURE__ */ jsxs2("div", { className: "sl-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "sl-label", children: "minified \u9519\u8BEF\u6808\uFF08\u6D4F\u89C8\u5668\u63A7\u5236\u53F0 / \u65E5\u5FD7\u539F\u6837\u7C98\u8D34\uFF09" }),
      /* @__PURE__ */ jsx2(
        "textarea",
        {
          className: "sl-textarea",
          rows: 7,
          placeholder: "TypeError: Cannot read properties of undefined\n    at boom (http://localhost:5173/assets/app.8f2a.js:1:88423)\n    at Object.<anonymous> (http://localhost:5173/assets/app.8f2a.js:1:90100)",
          value: stack,
          onChange: (e) => setStack(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sl-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "sl-label", children: "sourcemap \u6765\u6E90\uFF08\u4EFB\u9009\u5176\u4E00\u6216\u7EC4\u5408\uFF09" }),
      /* @__PURE__ */ jsxs2("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "sl-input grow",
            placeholder: "\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\uFF0C\u5982 D:\\\\proj\\\\dist\uFF08\u626B\u63CF *.map \u4E0E sourceMappingURL \u6CE8\u91CA\uFF09",
            value: mapsDir,
            onChange: (e) => setMapsDir(e.target.value)
          }
        ),
        recentDirs.length ? /* @__PURE__ */ jsxs2("select", { className: "sl-select", value: "", onChange: (e) => {
          if (e.target.value) setMapsDir(e.target.value);
        }, children: [
          /* @__PURE__ */ jsx2("option", { value: "", children: "\u6700\u8FD1\u2026" }),
          recentDirs.map((d) => /* @__PURE__ */ jsx2("option", { value: d, children: d.length > 42 ? `\u2026${d.slice(-40)}` : d }, d))
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs2(
        "div",
        {
          className: `sl-dropzone ${dragOver ? "over" : ""}`,
          onDragOver: (e) => {
            e.preventDefault();
            setDragOver(true);
          },
          onDragLeave: () => setDragOver(false),
          onDrop: async (e) => {
            e.preventDefault();
            setDragOver(false);
            const maps = await readMapFiles(e.dataTransfer.files);
            if (maps.length) setDragFiles((prev) => [...prev, ...maps]);
          },
          children: [
            dragFiles.length ? /* @__PURE__ */ jsxs2("span", { children: [
              dragFiles.length,
              " \u4E2A .map \u5DF2\u5C31\u7EEA\uFF08",
              dragFiles.map((f) => basename(f.originPath)).join("\u3001"),
              "\uFF09 ",
              /* @__PURE__ */ jsx2("button", { className: "sl-btn-link", onClick: () => setDragFiles([]), children: "\u6E05\u7A7A" })
            ] }) : /* @__PURE__ */ jsxs2("span", { children: [
              "\u628A .map \u6587\u4EF6\u62D6\u5230\u8FD9\u91CC\uFF0C\u6216 ",
              /* @__PURE__ */ jsx2("button", { className: "sl-btn-link", onClick: () => fileRef.current?.click(), children: "\u9009\u62E9\u6587\u4EF6" }),
              "\uFF0C\u6216 ",
              /* @__PURE__ */ jsx2("button", { className: "sl-btn-link", onClick: () => setShowInline(!showInline), children: "\u7C98\u8D34 map JSON" })
            ] }),
            /* @__PURE__ */ jsx2(
              "input",
              {
                ref: fileRef,
                type: "file",
                multiple: true,
                accept: ".map,application/json",
                style: { display: "none" },
                onChange: async (e) => {
                  if (e.target.files) {
                    const maps = await readMapFiles(e.target.files);
                    if (maps.length) setDragFiles((prev) => [...prev, ...maps]);
                  }
                  e.target.value = "";
                }
              }
            )
          ]
        }
      ),
      showInline ? /* @__PURE__ */ jsx2(
        "textarea",
        {
          className: "sl-textarea small",
          rows: 3,
          placeholder: 'map JSON \u5168\u6587\uFF08{"version":3,...}\uFF09',
          value: inlineText,
          onChange: (e) => setInlineText(e.target.value)
        }
      ) : null,
      /* @__PURE__ */ jsx2("div", { className: "sl-row", children: /* @__PURE__ */ jsx2(
        "input",
        {
          className: "sl-input grow",
          placeholder: "\u6216\u4ECE URL \u6293 map\uFF08http/https\uFF0C\u53EF\u9009\uFF09",
          value: fetchUrl,
          onChange: (e) => setFetchUrl(e.target.value)
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sl-actions", children: [
      /* @__PURE__ */ jsx2("button", { className: "sl-btn primary", disabled: busy, onClick: doResolve, children: busy ? "\u8FD8\u539F\u4E2D\u2026" : "\u8FD8\u539F" }),
      report ? /* @__PURE__ */ jsx2("button", { className: "sl-btn", onClick: copyResult, children: copied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236\u7ED3\u679C" }) : null
    ] }),
    /* @__PURE__ */ jsx2(ErrBox, { text: err }),
    report ? /* @__PURE__ */ jsxs2("div", { className: "sl-report", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sl-chips", children: [
        /* @__PURE__ */ jsx2(Chip, { label: "\u8FD8\u539F\u7387", value: `${report.summary.rate}%`, tone: report.summary.rate >= 80 ? "ok" : report.summary.rate > 0 ? "warn" : "bad" }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u5E27", value: `${report.summary.resolved}/${report.summary.eligible}` }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u5185\u90E8\u5E27", value: report.summary.internal }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u683C\u5F0F", value: report.summary.format }),
        report.summary.truncated ? /* @__PURE__ */ jsx2(Chip, { label: "\u6CE8\u610F", value: "\u5185\u5BB9\u88AB\u622A\u65AD", tone: "warn" }) : null
      ] }),
      report.summary.message ? /* @__PURE__ */ jsx2("div", { className: "sl-message", children: report.summary.message }) : null,
      /* @__PURE__ */ jsx2(WarnBox, { items: report.warnings }),
      /* @__PURE__ */ jsx2("div", { className: "sl-frames", children: report.frames.map((f, i) => /* @__PURE__ */ jsx2(FrameRow, { fr: f }, i)) })
    ] }) : !err ? /* @__PURE__ */ jsx2(Empty, { text: "\u7C98\u8D34\u9519\u8BEF\u6808 + \u7ED9\u4E00\u4E2A map \u6765\u6E90\uFF0C\u70B9\u300C\u8FD8\u539F\u300D" }) : null
  ] });
}
function MapsTab() {
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [scan, setScan] = useState(null);
  const [validatePath, setValidatePath] = useState("");
  const [validateRes, setValidateRes] = useState(null);
  const doScan = useCallback(async () => {
    setErr("");
    setScan(null);
    if (!dir.trim()) {
      setErr("\u8BF7\u8F93\u5165\u76EE\u5F55");
      return;
    }
    setBusy(true);
    try {
      setScan(await svc.scanMaps(dir.trim()));
    } catch (e) {
      setErr(e instanceof SvcError ? e.message : String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [dir]);
  const doValidate = useCallback(async () => {
    setErr("");
    setValidateRes(null);
    if (!validatePath.trim()) {
      setErr("\u8BF7\u8F93\u5165 .map \u6587\u4EF6\u8DEF\u5F84");
      return;
    }
    setBusy(true);
    try {
      setValidateRes(await svc.validate({ mapPath: validatePath.trim() }));
    } catch (e) {
      setErr(e instanceof SvcError ? e.message : String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [validatePath]);
  return /* @__PURE__ */ jsxs2("div", { className: "sl-tabpane", children: [
    /* @__PURE__ */ jsxs2("div", { className: "sl-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "sl-label", children: "\u626B\u63CF\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\u91CC\u7684 sourcemap" }),
      /* @__PURE__ */ jsxs2("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx2("input", { className: "sl-input grow", placeholder: "\u76EE\u5F55\u8DEF\u5F84\uFF0C\u5982 D:\\\\proj\\\\dist", value: dir, onChange: (e) => setDir(e.target.value) }),
        /* @__PURE__ */ jsx2("button", { className: "sl-btn", disabled: busy, onClick: doScan, children: "\u626B\u63CF" })
      ] })
    ] }),
    /* @__PURE__ */ jsx2(ErrBox, { text: err }),
    scan ? /* @__PURE__ */ jsxs2("div", { className: "sl-report", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sl-chips", children: [
        /* @__PURE__ */ jsx2(Chip, { label: "\u76EE\u5F55", value: scan.dir }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u626B\u8FC7\u6587\u4EF6", value: scan.walked }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u53D1\u73B0 map", value: scan.maps.filter((m) => !m.error).length, tone: "ok" })
      ] }),
      /* @__PURE__ */ jsx2(WarnBox, { items: scan.warnings }),
      scan.maps.length ? /* @__PURE__ */ jsxs2("table", { className: "sl-table", children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx2("th", { children: "map" }),
          /* @__PURE__ */ jsx2("th", { children: "file \u5B57\u6BB5" }),
          /* @__PURE__ */ jsx2("th", { children: "\u6E90\u6570" }),
          /* @__PURE__ */ jsx2("th", { children: "\u5185\u5BB9" }),
          /* @__PURE__ */ jsx2("th", { children: "\u5927\u5C0F" })
        ] }) }),
        /* @__PURE__ */ jsx2("tbody", { children: scan.maps.map((m, i) => /* @__PURE__ */ jsxs2("tr", { className: m.error ? "bad" : "", children: [
          /* @__PURE__ */ jsxs2("td", { children: [
            basename(m.originPath) || m.fromJs || "(\u5185\u8054)",
            m.error ? ` \u26A0 ${m.error}` : ""
          ] }),
          /* @__PURE__ */ jsx2("td", { children: m.file ? basename(m.file) : "-" }),
          /* @__PURE__ */ jsx2("td", { children: m.sources != null ? m.sources : "-" }),
          /* @__PURE__ */ jsx2("td", { children: m.hasContent ? "\u2713 sourcesContent" : "\u78C1\u76D8" }),
          /* @__PURE__ */ jsx2("td", { children: fmtBytes(m.bytes) })
        ] }, i)) })
      ] }) : /* @__PURE__ */ jsx2(Empty, { text: "\u8BE5\u76EE\u5F55\u6CA1\u626B\u5230 .map\uFF08\u6784\u5EFA\u65F6\u9700\u8981\u5F00 sourcemap \u8F93\u51FA\uFF09" })
    ] }) : null,
    /* @__PURE__ */ jsxs2("div", { className: "sl-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "sl-label", children: "\u4F53\u68C0\u5355\u4E2A map\uFF08\u7ED3\u6784 / \u6620\u5C04\u6BB5 / \u8986\u76D6\uFF09" }),
      /* @__PURE__ */ jsxs2("div", { className: "sl-row", children: [
        /* @__PURE__ */ jsx2("input", { className: "sl-input grow", placeholder: ".map \u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84", value: validatePath, onChange: (e) => setValidatePath(e.target.value) }),
        /* @__PURE__ */ jsx2("button", { className: "sl-btn", disabled: busy, onClick: doValidate, children: "\u4F53\u68C0" })
      ] })
    ] }),
    validateRes ? validateRes.ok && validateRes.stats ? /* @__PURE__ */ jsxs2("div", { className: "sl-report", children: [
      /* @__PURE__ */ jsxs2("div", { className: "sl-chips", children: [
        /* @__PURE__ */ jsx2(Chip, { label: "\u6620\u5C04\u6BB5", value: validateRes.stats.segCount }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u751F\u6210\u884C", value: validateRes.stats.genLines }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u6E90", value: validateRes.stats.sources }),
        /* @__PURE__ */ jsx2(Chip, { label: "names", value: validateRes.stats.names }),
        /* @__PURE__ */ jsx2(Chip, { label: "sourcesContent", value: validateRes.stats.hasSourcesContent ? `${validateRes.stats.sourcesContentCount} \u4E2A` : "\u65E0", tone: validateRes.stats.hasSourcesContent ? "ok" : "warn" }),
        validateRes.stats.sections ? /* @__PURE__ */ jsx2(Chip, { label: "sections", value: validateRes.stats.sections }) : null
      ] }),
      /* @__PURE__ */ jsx2(WarnBox, { items: validateRes.warnings || [] })
    ] }) : /* @__PURE__ */ jsx2(ErrBox, { text: validateRes.error || "map \u4E0D\u53EF\u7528" }) : null
  ] });
}
function AboutTab() {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [restarting, setRestarting] = useState(false);
  const refresh = useCallback(() => {
    setErr("");
    svc.meta().then(setMeta).catch((e) => setErr(e instanceof SvcError ? e.message : String(e.message || e)));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const restart = useCallback(async () => {
    setRestarting(true);
    try {
      await readMeta(true);
      await restartService(PLUGIN_ID, SERVICE_ID);
      invalidateMeta();
      setTimeout(refresh, 2500);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setRestarting(false);
    }
  }, [refresh]);
  return /* @__PURE__ */ jsxs2("div", { className: "sl-tabpane", children: [
    /* @__PURE__ */ jsxs2("div", { className: "sl-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "sl-label", children: "\u670D\u52A1\u72B6\u6001" }),
      meta ? /* @__PURE__ */ jsxs2("div", { className: "sl-chips", children: [
        /* @__PURE__ */ jsx2(Chip, { label: "\u7248\u672C", value: meta.version }),
        /* @__PURE__ */ jsx2(Chip, { label: "PID", value: meta.pid }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u5DF2\u8FD0\u884C", value: `${Math.floor(meta.uptime / 6e4)} \u5206\u949F` }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u7F13\u5B58 map", value: meta.mapsCached }),
        /* @__PURE__ */ jsx2(Chip, { label: "\u5BBF\u4E3B kv \u6865", value: meta.degraded ? "\u964D\u7EA7" : "\u6B63\u5E38", tone: meta.degraded ? "warn" : "ok" })
      ] }) : /* @__PURE__ */ jsx2(Empty, { text: err || "\u8BFB\u53D6\u4E2D\u2026" }),
      /* @__PURE__ */ jsxs2("div", { className: "sl-actions", children: [
        /* @__PURE__ */ jsx2("button", { className: "sl-btn", onClick: refresh, children: "\u5237\u65B0" }),
        /* @__PURE__ */ jsx2("button", { className: "sl-btn", disabled: restarting, onClick: restart, children: restarting ? "\u91CD\u542F\u4E2D\u2026" : "\u91CD\u542F\u670D\u52A1" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sl-section", children: [
      /* @__PURE__ */ jsx2("div", { className: "sl-label", children: "\u8FD9\u662F\u4EC0\u4E48" }),
      /* @__PURE__ */ jsxs2("div", { className: "sl-help", children: [
        /* @__PURE__ */ jsx2("p", { children: "\u628A\u300Capp.8f2a.js:1:88423\u300D\u8FD8\u539F\u6210\u300Csrc/api/user.ts:42:10\u300D\uFF1A\u7C98\u8D34 minified \u9519\u8BEF\u6808 + \u6307\u5B9A sourcemap \u6765\u6E90\uFF0C\u9010\u5E27\u8FD8\u539F\u6E90\u7801\u4F4D\u7F6E\u4E0E\u4EE3\u7801\u5E27\u3002" }),
        /* @__PURE__ */ jsx2("p", { children: "map \u6765\u6E90\u56DB\u79CD\u4EFB\u9009\uFF1A\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\uFF08\u81EA\u52A8\u626B *.map \u4E0E sourceMappingURL \u6CE8\u91CA\uFF09/ \u62D6\u62FD .map \u6587\u4EF6 / \u7C98\u8D34 map JSON / \u4ECE URL \u6293\u53D6\uFF0860MB/15s \u4E0A\u9650\uFF09\u3002" }),
        /* @__PURE__ */ jsxs2("p", { children: [
          /* @__PURE__ */ jsx2("b", { children: "\u524D\u63D0" }),
          "\uFF1A\u624B\u4E0A\u8981\u6709\u5BF9\u5E94\u7248\u672C\u7684 .map \u6587\u4EF6\uFF08\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\u3001CI \u4EA7\u7269\u3001\u6216\u81EA\u5DF1 dev server \u7684 /assets/*.js.map\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsxs2("p", { children: [
          /* @__PURE__ */ jsx2("b", { children: "\u9690\u79C1" }),
          "\uFF1A\u5168\u90E8\u672C\u5730\u8BA1\u7B97\uFF1B\u9519\u8BEF\u6808\u4E0E map \u5185\u5BB9\u4E0D\u843D\u76D8\uFF08kv \u53EA\u8BB0\u6700\u8FD1\u7528\u8FC7\u7684\u76EE\u5F55\u8DEF\u5F84\uFF09\uFF1B\u65E0 map \u7684\u5E27\u663E\u5F0F\u6807\u6CE8\u539F\u56E0\uFF0C\u7EDD\u4E0D\u7F16\u9020\u3002"
        ] }),
        /* @__PURE__ */ jsxs2("p", { children: [
          /* @__PURE__ */ jsx2("b", { children: "\u5DF2\u77E5\u8FB9\u754C" }),
          "\uFF1A\u6808\u683C\u5F0F\u8986\u76D6 Chrome/Node/Safari/Firefox \u4E3B\u6D41\u683C\u5F0F\uFF1BsourcesContent \u7F3A\u5931\u65F6\u4EE3\u7801\u5E27\u4F9D\u8D56\u78C1\u76D8\u6E90\u6587\u4EF6\uFF08webpack:// \u76F8\u5BF9\u8DEF\u5F84\u6309 map \u76EE\u5F55\u89E3\u6790\uFF09\uFF1BWeb(https) \u90E8\u7F72\u6A21\u5F0F\u4E0B\u6D4F\u89C8\u5668\u4F1A\u62E6 127.0.0.1 \u6DF7\u5408\u5185\u5BB9\uFF08\u684C\u9762/\u624B\u673A WebView \u6B63\u5E38\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsx2("p", { children: "AI \u53EF\u7ECF MCP \u516D\u5DE5\u5177\u5BF9\u8BDD\u5F0F\u8FD8\u539F\uFF1Astack_resolve / stack_resolve_file / maps_scan / map_locate / map_source / map_validate\u3002" })
      ] })
    ] })
  ] });
}
function Panel() {
  const [tab, setTab] = useState("resolve");
  return /* @__PURE__ */ jsxs2("div", { className: "sl-root", children: [
    /* @__PURE__ */ jsx2("div", { className: "sl-tabs", children: [["resolve", "\u8FD8\u539F"], ["maps", "\u5730\u56FE"], ["about", "\u670D\u52A1"]].map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `sl-tab ${tab === k ? "active" : ""}`, onClick: () => setTab(k), children: label }, k)) }),
    tab === "resolve" ? /* @__PURE__ */ jsx2(ResolveTab, {}) : null,
    tab === "maps" ? /* @__PURE__ */ jsx2(MapsTab, {}) : null,
    tab === "about" ? /* @__PURE__ */ jsx2(AboutTab, {}) : null
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
