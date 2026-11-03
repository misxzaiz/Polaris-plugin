// src/Panel.tsx
import { useCallback as useCallback4, useEffect as useEffect2, useState as useState4 } from "react";

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}

// src/model.ts
var K = {
  meta: "oadesk.meta",
  specs: "oadesk.specs",
  envs: "oadesk.envs",
  latest: "oadesk.latest",
  history: "oadesk.history",
  cmd: "oadesk.cmd",
  res: "oadesk.res",
  req: (id) => `oadesk.req.${id}`
};
async function kvGet(key) {
  const invoke = getHostInvoke();
  const r = await invoke("router_dispatch", {
    target: "cap.kv",
    payload: { action: "get", key }
  });
  if (r && r.ok && r.result && r.result.value !== void 0 && r.result.value !== null) return r.result.value;
  return null;
}
async function kvSet(key, value) {
  const invoke = getHostInvoke();
  const r = await invoke("router_dispatch", {
    target: "cap.kv",
    payload: { action: "set", key, value }
  });
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : "cap.kv set \u5931\u8D25");
}
async function kvDel(key) {
  const invoke = getHostInvoke();
  await invoke("router_dispatch", { target: "cap.kv", payload: { action: "delete", key } }).catch(() => void 0);
}
var loadMeta = () => kvGet(K.meta);
var loadSpecs = () => kvGet(K.specs);
var loadEnvs = () => kvGet(K.envs);
var loadHistory = () => kvGet(K.history);
function normalizeHistory(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.items)) return v.items;
  return [];
}
var nonceSeq = 0;
async function sendCommand(action, payload, waitMs = 18e4) {
  const nonce = `p${Date.now().toString(36)}-${++nonceSeq}`;
  await kvSet(K.cmd, { nonce, action, payload, at: (/* @__PURE__ */ new Date()).toISOString() });
  if (waitMs === 0) return { ok: true, pending: true };
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(600);
    const res = await kvGet(K.res);
    if (res && res.nonce === nonce) {
      await kvDel(K.res);
      return res.result || { ok: false, error: "\u56DE\u6267\u4E3A\u7A7A" };
    }
  }
  return { ok: false, pending: true, error: `\u547D\u4EE4\u5DF2\u6295\u9012\uFF0C${Math.round(waitMs / 1e3)}s \u5185\u672A\u89C1\u56DE\u6267\uFF08\u8BF7\u6C42\u53EF\u80FD\u4ECD\u5728\u8FDB\u884C\uFF0C\u7A0D\u540E\u5230\u8C03\u8BD5\u9875\u5386\u53F2\u533A\u67E5\u770B\uFF09` };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function fmtMs(ms) {
  if (ms == null) return "\u2014";
  if (ms >= 1e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
function fmtTime(iso) {
  if (!iso) return "\u2014";
  return String(iso).replace("T", " ").slice(5, 16);
}
var SEVERITY_COLOR = {
  breaking: "#F85149",
  warn: "#D29922",
  info: "#58A6FF"
};
var SEVERITY_LABEL = { breaking: "\u7834\u574F\u6027", warn: "\u544A\u8B66", info: "\u4FE1\u606F" };
var METHOD_COLOR = {
  GET: "#3FB950",
  POST: "#A371F7",
  PUT: "#D29922",
  PATCH: "#DB6D28",
  DELETE: "#F85149",
  HEAD: "#8B949E",
  OPTIONS: "#8B949E"
};

// src/SpecsTab.tsx
import { useCallback, useRef, useState } from "react";

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var C = {
  bg: "#0D1117",
  panel: "#161B22",
  border: "#30363D",
  text: "#E6EDF3",
  muted: "#8B949E",
  accent: "#1F6FEB",
  danger: "#F85149",
  warn: "#D29922",
  ok: "#3FB950"
};
var inputStyle = {
  background: "#0D1117",
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
  outline: "none",
  width: "100%",
  boxSizing: "border-box"
};
var btnStyle = (variant = "ghost") => ({
  background: variant === "primary" ? C.accent : "transparent",
  color: variant === "primary" ? "#fff" : variant === "danger" ? C.danger : C.text,
  border: `1px solid ${variant === "danger" ? "rgba(248,81,73,0.4)" : C.border}`,
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap"
});
function Field({ label, children, hint }) {
  return /* @__PURE__ */ jsxs("label", { style: { display: "block", marginBottom: 8 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: C.muted, marginBottom: 3 }, children: [
      label,
      hint ? /* @__PURE__ */ jsx("span", { style: { marginLeft: 6, opacity: 0.8 }, children: hint }) : null
    ] }),
    children
  ] });
}
function Badge({ text, color, bg }) {
  return /* @__PURE__ */ jsx("span", { style: {
    color,
    background: bg || "transparent",
    border: `1px solid ${color}`,
    borderRadius: 10,
    padding: "0 7px",
    fontSize: 10,
    lineHeight: "16px",
    display: "inline-block",
    verticalAlign: "middle"
  }, children: text });
}
function SeverityBadge({ severity }) {
  return /* @__PURE__ */ jsx(Badge, { text: SEVERITY_LABEL[severity] || severity, color: SEVERITY_COLOR[severity] || C.muted });
}
function Empty({ children }) {
  return /* @__PURE__ */ jsx("div", { style: {
    border: `1px dashed ${C.border}`,
    borderRadius: 8,
    padding: "18px 16px",
    color: C.muted,
    fontSize: 12,
    lineHeight: 1.8
  }, children });
}
function Err({ msg }) {
  if (!msg) return null;
  return /* @__PURE__ */ jsx("div", { style: { color: "#FFA198", fontSize: 12, marginBottom: 10, whiteSpace: "pre-wrap" }, children: msg });
}
function KeyValue({ rows }) {
  return /* @__PURE__ */ jsx("div", { style: { fontSize: 11, lineHeight: 1.7 }, children: rows.filter(([, v]) => v).map(([k, v]) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
    /* @__PURE__ */ jsx("span", { style: { color: C.muted, minWidth: 76, flexShrink: 0 }, children: k }),
    /* @__PURE__ */ jsx("span", { style: { wordBreak: "break-all" }, children: v })
  ] }, k)) });
}
function SectionTitle({ children, extra }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, margin: "14px 0 8px" }, children: [
    /* @__PURE__ */ jsx("span", { style: { fontSize: 12, fontWeight: 600, color: C.text }, children }),
    /* @__PURE__ */ jsx("span", { style: { flex: 1, height: 1, background: C.border } }),
    extra
  ] });
}

// src/SpecsTab.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function SpecsTab(props) {
  const { specs, onChanged, onOpenDebug } = props;
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const doImport = useCallback(async (payload) => {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const r = await sendCommand("spec_import", payload, 6e4);
      if (!r || !r.ok) {
        setErr(r && r.error || "\u5BFC\u5165\u5931\u8D25\uFF08\u670D\u52A1\u65E0\u54CD\u5E94\uFF1F\uFF09");
      } else {
        const s = r.summary;
        setResult({
          specId: r.specId,
          summaryText: `${s.name}${s.version ? ` v${s.version}` : ""} \xB7 ${s.specVersion} \xB7 ${s.endpointCount} \u7AEF\u70B9 / ${s.pathCount} \u8DEF\u5F84${s.serverUrls.length ? ` \xB7 ${s.serverUrls[0]}` : ""}`,
          hints: r.hints || [],
          warning: r.warning || null
        });
        setText("");
        setUrl("");
        setName("");
        onChanged();
      }
    } catch (e) {
      setErr(String(e.message));
    } finally {
      setBusy(false);
    }
  }, [onChanged]);
  const onPickFile = useCallback(async (f) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      setErr(`\u6587\u4EF6 ${(f.size / 1024 / 1024).toFixed(1)}MB \u8D85\u8FC7 4MB \u4E0A\u9650`);
      return;
    }
    const content = await f.text();
    await doImport({ source: "text", content, name: f.name.replace(/\.(yaml|yml|json)$/i, "") });
  }, [doImport]);
  const doDelete = useCallback(async (id, nm) => {
    if (!window.confirm(`\u5220\u9664\u5408\u540C\u300C${nm}\u300D\uFF1F\u5176\u8C03\u8BD5\u73AF\u5883\u914D\u7F6E\u4E5F\u4F1A\u4E00\u5E76\u6E05\u9664\u3002`)) return;
    setErr("");
    const r = await sendCommand("spec_delete", { specId: id }, 3e4);
    if (!r || !r.ok) setErr(r && r.error || "\u5220\u9664\u5931\u8D25");
    else onChanged();
  }, [onChanged]);
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2(SectionTitle, { children: "\u5BFC\u5165\u5408\u540C" }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx2("button", { style: btnStyle(mode === "text" ? "primary" : "ghost"), onClick: () => setMode("text"), children: "\u7C98\u8D34 / \u6587\u4EF6" }),
      /* @__PURE__ */ jsx2("button", { style: btnStyle(mode === "url" ? "primary" : "ghost"), onClick: () => setMode("url"), children: "URL \u62C9\u53D6" })
    ] }),
    mode === "text" ? /* @__PURE__ */ jsx2(Field, { label: "openapi.yaml / openapi.json \u5185\u5BB9", hint: "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u628A\u6587\u4EF6\u62D6\u5230\u4E0B\u9762\u7684\u9009\u62E9\u6846", children: /* @__PURE__ */ jsx2(
      "textarea",
      {
        style: { ...inputStyle, minHeight: 110, fontFamily: "Consolas, monospace", resize: "vertical" },
        placeholder: "\u7C98\u8D34 YAML \u6216 JSON\u2026",
        value: text,
        onChange: (e) => setText(e.target.value)
      }
    ) }) : /* @__PURE__ */ jsx2(Field, { label: "\u5408\u540C URL", hint: "\u7531\u672C\u673A\u670D\u52A1\u62C9\u53D6\uFF0C\u5929\u7136\u65E0\u8DE8\u57DF\u9650\u5236", children: /* @__PURE__ */ jsx2(
      "input",
      {
        style: inputStyle,
        placeholder: "https://\u2026/openapi.json \u6216 http://127.0.0.1:3000/v3/api-docs",
        value: url,
        onChange: (e) => setUrl(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }, children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          style: { ...inputStyle, flex: 1 },
          placeholder: "\u5408\u540C\u540D\uFF08\u53EF\u7559\u7A7A\uFF0C\u9ED8\u8BA4\u53D6 info.title\uFF09",
          value: name,
          onChange: (e) => setName(e.target.value)
        }
      ),
      mode === "text" ? /* @__PURE__ */ jsxs2(Fragment, { children: [
        /* @__PURE__ */ jsx2("button", { style: btnStyle(), onClick: () => fileRef.current && fileRef.current.click(), children: "\u9009\u6587\u4EF6\u2026" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            ref: fileRef,
            type: "file",
            accept: ".yaml,.yml,.json,application/json,text/yaml",
            style: { display: "none" },
            onChange: (e) => {
              onPickFile(e.target.files && e.target.files[0]);
              e.target.value = "";
            }
          }
        )
      ] }) : null,
      /* @__PURE__ */ jsx2(
        "button",
        {
          style: btnStyle("primary"),
          disabled: busy || (mode === "text" ? !text.trim() : !url.trim()),
          onClick: () => doImport(mode === "text" ? { source: "text", content: text, name } : { source: "url", url, name }),
          children: busy ? "\u5BFC\u5165\u4E2D\u2026" : "\u5BFC\u5165"
        }
      )
    ] }),
    /* @__PURE__ */ jsx2(Err, { msg: err }),
    result ? /* @__PURE__ */ jsxs2("div", { style: { border: `1px solid ${C.ok}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 12 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { color: C.ok, marginBottom: 4 }, children: [
        "\u2713 \u5BFC\u5165\u6210\u529F\uFF1A",
        result.summaryText
      ] }),
      result.warning ? /* @__PURE__ */ jsx2("div", { style: { color: C.warn, marginBottom: 4 }, children: result.warning }) : null,
      result.hints.map((h, i) => /* @__PURE__ */ jsx2("div", { style: { color: C.muted }, children: h }, i)),
      /* @__PURE__ */ jsx2("button", { style: { ...btnStyle(), marginTop: 6 }, onClick: () => onOpenDebug(result.specId), children: "\u53BB\u8C03\u8BD5\u8FD9\u4E2A\u5408\u540C \u2192" })
    ] }) : null,
    /* @__PURE__ */ jsx2(SectionTitle, { extra: /* @__PURE__ */ jsxs2("span", { style: { color: C.muted, fontSize: 11 }, children: [
      specs.length,
      " \u4EFD"
    ] }), children: "\u5408\u540C\u5E93" }),
    !specs.length ? /* @__PURE__ */ jsxs2(Empty, { children: [
      "\u8FD8\u6CA1\u6709\u5408\u540C\u3002\u628A\u540E\u7AEF\u7684 openapi.yaml/json \u62D6\u8FDB\u6765\uFF08\u6216\u7ED9\u4E2A URL\uFF09\uFF0C\u5C31\u80FD\uFF1A",
      /* @__PURE__ */ jsx2("br", {}),
      "\xB7 \u6D4F\u89C8\u5168\u90E8\u7AEF\u70B9\u4E0E\u53C2\u6570\uFF0C\u8BF7\u6C42\u4F53\u81EA\u52A8\u751F\u6210\u793A\u4F8B",
      /* @__PURE__ */ jsx2("br", {}),
      "\xB7 \u6309\u5408\u540C\u76F4\u63A5\u8C03\u63A5\u53E3\uFF0C\u54CD\u5E94\u4E0E\u6587\u6863\u9010\u5B57\u6BB5\u6BD4\u5BF9",
      /* @__PURE__ */ jsx2("br", {}),
      "\xB7 \u65B0\u65E7\u4E24\u7248\u5408\u540C\u4E00\u6BD4\uFF0Cbreaking change \u63D0\u524D\u66B4\u9732"
    ] }) : specs.map((s) => /* @__PURE__ */ jsxs2("div", { style: { border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2("span", { style: { fontSize: 13, fontWeight: 600 }, children: s.name }),
        s.version ? /* @__PURE__ */ jsx2(Badge, { text: `v${s.version}`, color: C.muted }) : null,
        /* @__PURE__ */ jsx2(Badge, { text: s.specVersion, color: C.accent }),
        s.externalRefs > 0 ? /* @__PURE__ */ jsx2(Badge, { text: `${s.externalRefs} \u5916\u90E8\u5F15\u7528`, color: C.warn }) : null,
        /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx2("button", { style: btnStyle(), onClick: () => onOpenDebug(s.id), children: "\u8C03\u8BD5" }),
        /* @__PURE__ */ jsx2("button", { style: btnStyle("danger"), onClick: () => doDelete(s.id, s.name), children: "\u5220\u9664" })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { marginTop: 6 }, children: /* @__PURE__ */ jsx2(KeyValue, { rows: [
        ["\u7AEF\u70B9", `${s.endpointCount} \u4E2A / ${s.pathCount} \u8DEF\u5F84`],
        ["\u670D\u52A1\u5668", s.serverUrls.join("  |  ")],
        ["\u6765\u6E90", `${s.source === "url" ? "URL \u62C9\u53D6" : "\u7C98\u8D34/\u6587\u4EF6"}${s.sourceDetail ? ` \xB7 ${s.sourceDetail}` : ""} \xB7 ${s.importedAt.slice(0, 16).replace("T", " ")}`]
      ] }) })
    ] }, s.id))
  ] });
}

// src/CallTab.tsx
import { useCallback as useCallback2, useEffect, useMemo, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var EMPTY_AUTH = { type: "", token: "", username: "", password: "", name: "X-Api-Key", in: "header", value: "" };
function CallTab(props) {
  const { specs, activeSpecId, setActiveSpecId, envs, history, onChanged } = props;
  const [detail, setDetail] = useState2(null);
  const [detailLoading, setDetailLoading] = useState2(false);
  const [paramRows, setParamRows] = useState2([]);
  const [baseUrl, setBaseUrl] = useState2("");
  const [auth, setAuth] = useState2(EMPTY_AUTH);
  const [bodyText, setBodyText] = useState2("");
  const [sending, setSending] = useState2(false);
  const [err, setErr] = useState2("");
  const [record, setRecord] = useState2(null);
  const [savedNote, setSavedNote] = useState2("");
  const spec = specs.find((s) => s.id === activeSpecId) || null;
  const env = envs.find((e) => e.specId === activeSpecId) || null;
  const loadEndpoint = useCallback2(async (specId, endpointId) => {
    setDetailLoading(true);
    setErr("");
    try {
      const r = await sendCommand("spec_get", { specId, endpointId }, 3e4);
      if (!r || !r.ok) {
        setErr(r && r.error || "\u7AEF\u70B9\u8BFB\u53D6\u5931\u8D25");
        setDetail(null);
        return;
      }
      const ep = r.endpoint;
      setDetail(ep);
      setParamRows(ep.parameters.map((p) => ({
        name: p.name,
        in: p.in,
        required: p.required,
        value: p.example != null && typeof p.example !== "object" ? String(p.example) : ""
      })));
      setBodyText(ep.exampleBody ? ep.exampleBody.text : "");
      const e = envs.find((x) => x.specId === specId);
      setBaseUrl(e && e.baseUrl || "");
      setAuth(e && e.auth ? {
        ...EMPTY_AUTH,
        type: e.auth.type || "",
        name: e.auth.name || "X-Api-Key",
        in: e.auth.in || "header",
        username: e.auth.username || "",
        token: "",
        value: "",
        password: "",
        // 掩码值不回填原文，需要用户重输（或用已保存的）
        ...e.auth.tokenMask ? {} : {}
      } : EMPTY_AUTH);
      setSavedNote(e && e.auth ? "\u5DF2\u4FDD\u5B58\u8BE5\u5408\u540C\u7684\u9274\u6743\u914D\u7F6E\uFF08\u53D1\u9001\u65F6\u81EA\u52A8\u4F7F\u7528\uFF1B\u5728\u4E0B\u65B9\u91CD\u65B0\u586B\u5199\u5E76\u4FDD\u5B58\u53EF\u8986\u76D6\uFF09" : "");
    } catch (e) {
      setErr(String(e.message));
    } finally {
      setDetailLoading(false);
    }
  }, [activeSpecId, envs]);
  useEffect(() => {
    if (!activeSpecId || !specs.length) {
      setDetail(null);
      return;
    }
    loadEndpoint(activeSpecId);
  }, [activeSpecId]);
  const buildValues = useCallback2(() => {
    const values = { path: {}, query: {}, header: {} };
    for (const r of paramRows) {
      if (r.value === "") continue;
      values[r.in === "path" ? "path" : r.in === "header" ? "header" : "query"][r.name] = r.value;
    }
    return values;
  }, [paramRows]);
  const authPayload = useCallback2(() => {
    if (!auth.type) return void 0;
    if (auth.type === "bearer") return { type: "bearer", token: auth.token || void 0 };
    if (auth.type === "basic") return { type: "basic", username: auth.username, password: auth.password };
    return { type: "apiKey", in: auth.in, name: auth.name, value: auth.value };
  }, [auth]);
  const hasAuthInput = auth.type === "bearer" ? !!auth.token.trim() : auth.type === "basic" ? !!auth.username : auth.type === "apiKey" ? auth.value !== "" : false;
  const doSend = useCallback2(async () => {
    if (!spec || !detail) return;
    setSending(true);
    setErr("");
    try {
      const r = await sendCommand("call", {
        specId: spec.id,
        endpointId: detail.id,
        values: buildValues(),
        bodyText: detail.hasRequestBody ? bodyText : void 0,
        baseUrl: baseUrl || void 0,
        auth: hasAuthInput ? authPayload() : void 0
      }, 18e4);
      if (!r || !r.ok) {
        setErr(r && r.error || "\u53D1\u9001\u5931\u8D25\uFF08\u670D\u52A1\u65E0\u54CD\u5E94\uFF1F\uFF09");
        setRecord(null);
      } else {
        setRecord(r.record);
        onChanged();
      }
    } catch (e) {
      setErr(String(e.message));
    } finally {
      setSending(false);
    }
  }, [spec, detail, buildValues, bodyText, baseUrl, hasAuthInput, authPayload, onChanged]);
  const doSaveEnv = useCallback2(async () => {
    if (!spec) return;
    setSavedNote("");
    const r = await sendCommand("env_set", { specId: spec.id, env: { baseUrl: baseUrl || null, auth: hasAuthInput ? authPayload() : auth.type ? authPayload() : null } }, 3e4);
    if (!r || !r.ok) setErr(r && r.error || "\u73AF\u5883\u4FDD\u5B58\u5931\u8D25");
    else {
      setSavedNote("\u5DF2\u4FDD\u5B58\uFF08\u9274\u6743\u503C\u53EA\u5B58\u672C\u673A\u670D\u52A1\u5185\u5B58\u4E0E\u672C\u5730\u6863\u6848\u6587\u4EF6\uFF0C\u4E0D\u51FA\u672C\u673A\uFF09");
      onChanged();
    }
  }, [spec, baseUrl, hasAuthInput, authPayload, auth.type, onChanged]);
  const grouped = useMemo(() => {
    if (!detail) return { byIn: [] };
    const order = ["path", "query", "header"];
    return {
      byIn: order.map((loc) => ({ in: loc, rows: paramRows.filter((r) => r.in === loc) })).filter((g) => g.rows.length)
    };
  }, [detail, paramRows]);
  if (!specs.length) {
    return /* @__PURE__ */ jsx3(Empty, { children: "\u5148\u5728\u300C\u5408\u540C\u300D\u9875\u5BFC\u5165\u4E00\u4EFD openapi.yaml/json\uFF0C\u8FD9\u91CC\u5C31\u80FD\u6309\u5408\u540C\u8C03\u8BD5\u63A5\u53E3\u3002" });
  }
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: /* @__PURE__ */ jsx3("select", { style: { ...inputStyle, flex: 1 }, value: activeSpecId, onChange: (e) => setActiveSpecId(e.target.value), children: specs.map((s) => /* @__PURE__ */ jsxs3("option", { value: s.id, children: [
      s.name,
      s.version ? ` v${s.version}` : "",
      "\uFF08",
      s.endpointCount,
      " \u7AEF\u70B9\uFF09"
    ] }, s.id)) }) }),
    spec ? /* @__PURE__ */ jsx3("div", { style: { border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, maxHeight: 150, overflowY: "auto" }, children: /* @__PURE__ */ jsx3(EndpointPicker, { specId: activeSpecId, selectedId: detail ? detail.id : "", onPick: (id) => loadEndpoint(activeSpecId, id) }) }) : null,
    /* @__PURE__ */ jsx3(Err, { msg: err }),
    detail ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
      /* @__PURE__ */ jsxs3("div", { style: { border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx3("span", { style: { color: METHOD_COLOR[detail.method] || C.text, fontWeight: 700, fontSize: 12 }, children: detail.method.toUpperCase() }),
          /* @__PURE__ */ jsx3("span", { style: { fontFamily: "Consolas, monospace", fontSize: 13 }, children: detail.path }),
          detail.needsAuth ? /* @__PURE__ */ jsx3(Badge, { text: "\u9700\u9274\u6743", color: C.warn }) : null,
          detail.deprecated ? /* @__PURE__ */ jsx3(Badge, { text: "\u5DF2\u5E9F\u5F03", color: C.danger }) : null,
          /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsxs3("span", { style: { color: C.muted, fontSize: 11 }, children: [
            "\u54CD\u5E94\u7801 ",
            detail.responseCodes.join(" / ") || "\u2014"
          ] })
        ] }),
        detail.summary || detail.description ? /* @__PURE__ */ jsxs3("div", { style: { color: C.muted, fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }, children: [
          detail.summary,
          detail.description ? (detail.summary ? "\n" : "") + detail.description.slice(0, 300) : ""
        ] }) : null
      ] }),
      /* @__PURE__ */ jsx3(SectionTitle, { extra: /* @__PURE__ */ jsx3("button", { style: btnStyle(), onClick: doSaveEnv, children: "\u4FDD\u5B58\u73AF\u5883" }), children: "\u670D\u52A1\u5668\u4E0E\u9274\u6743" }),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx3("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx3(Field, { label: "Base URL", hint: `\u7F3A\u7701\uFF1A${spec ? spec.serverUrls[0] || "\uFF08\u5408\u540C\u672A\u58F0\u660E\uFF09" : "\u2014"}`, children: /* @__PURE__ */ jsx3(
          "input",
          {
            style: inputStyle,
            placeholder: (spec ? spec.serverUrls[0] : "") || "http://127.0.0.1:8080",
            value: baseUrl,
            onChange: (e) => setBaseUrl(e.target.value)
          }
        ) }) }),
        /* @__PURE__ */ jsx3("div", { style: { width: 150 }, children: /* @__PURE__ */ jsx3(Field, { label: "\u9274\u6743\u65B9\u5F0F", children: /* @__PURE__ */ jsxs3("select", { style: inputStyle, value: auth.type, onChange: (e) => setAuth({ ...auth, type: e.target.value }), children: [
          /* @__PURE__ */ jsx3("option", { value: "", children: "\u65E0" }),
          /* @__PURE__ */ jsx3("option", { value: "bearer", children: "Bearer Token" }),
          /* @__PURE__ */ jsx3("option", { value: "apiKey", children: "API Key" }),
          /* @__PURE__ */ jsx3("option", { value: "basic", children: "Basic" })
        ] }) }) })
      ] }),
      auth.type === "bearer" ? /* @__PURE__ */ jsx3(Field, { label: "Token", hint: env && env.auth && env.auth.tokenMask ? `\u5DF2\u4FDD\u5B58\uFF1A${env.auth.tokenMask}` : void 0, children: /* @__PURE__ */ jsx3("input", { style: inputStyle, type: "password", placeholder: "\u7C98\u8D34 token\uFF08\u53EA\u5B58\u672C\u673A\uFF09", value: auth.token, onChange: (e) => setAuth({ ...auth, token: e.target.value }) }) }) : null,
      auth.type === "basic" ? /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx3("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx3(Field, { label: "\u7528\u6237\u540D", children: /* @__PURE__ */ jsx3("input", { style: inputStyle, value: auth.username, onChange: (e) => setAuth({ ...auth, username: e.target.value }) }) }) }),
        /* @__PURE__ */ jsx3("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx3(Field, { label: "\u5BC6\u7801", children: /* @__PURE__ */ jsx3("input", { style: inputStyle, type: "password", value: auth.password, onChange: (e) => setAuth({ ...auth, password: e.target.value }) }) }) })
      ] }) : null,
      auth.type === "apiKey" ? /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx3("div", { style: { width: 110 }, children: /* @__PURE__ */ jsx3(Field, { label: "\u4F4D\u7F6E", children: /* @__PURE__ */ jsxs3("select", { style: inputStyle, value: auth.in, onChange: (e) => setAuth({ ...auth, in: e.target.value }), children: [
          /* @__PURE__ */ jsx3("option", { value: "header", children: "header" }),
          /* @__PURE__ */ jsx3("option", { value: "query", children: "query" })
        ] }) }) }),
        /* @__PURE__ */ jsx3("div", { style: { width: 150 }, children: /* @__PURE__ */ jsx3(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ jsx3("input", { style: inputStyle, value: auth.name, onChange: (e) => setAuth({ ...auth, name: e.target.value }) }) }) }),
        /* @__PURE__ */ jsx3("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx3(Field, { label: "\u503C", hint: env && env.auth && env.auth.valueMask ? `\u5DF2\u4FDD\u5B58\uFF1A${env.auth.valueMask}` : void 0, children: /* @__PURE__ */ jsx3("input", { style: inputStyle, type: "password", value: auth.value, onChange: (e) => setAuth({ ...auth, value: e.target.value }) }) }) })
      ] }) : null,
      savedNote ? /* @__PURE__ */ jsx3("div", { style: { color: C.muted, fontSize: 11, marginBottom: 8 }, children: savedNote }) : null,
      grouped.byIn.length ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3(SectionTitle, { children: "\u53C2\u6570" }),
        grouped.byIn.map((g) => /* @__PURE__ */ jsxs3("div", { style: { marginBottom: 8 }, children: [
          /* @__PURE__ */ jsx3("div", { style: { fontSize: 11, color: C.muted, marginBottom: 4 }, children: g.in === "path" ? "\u8DEF\u5F84\u53C2\u6570" : g.in === "query" ? "Query \u53C2\u6570" : "Header \u53C2\u6570" }),
          g.rows.map((r) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }, children: [
            /* @__PURE__ */ jsxs3("span", { style: { fontFamily: "Consolas, monospace", fontSize: 12, minWidth: 110 }, children: [
              r.name,
              r.required ? /* @__PURE__ */ jsx3("span", { style: { color: C.danger }, children: "*" }) : null
            ] }),
            /* @__PURE__ */ jsx3(
              "input",
              {
                style: inputStyle,
                placeholder: r.required ? "\u5FC5\u586B" : "\u53EF\u9009",
                value: r.value,
                onChange: (e) => setParamRows((rows) => rows.map((x) => x.in === r.in && x.name === r.name ? { ...x, value: e.target.value } : x))
              }
            )
          ] }, `${r.in}.${r.name}`))
        ] }, g.in))
      ] }) : null,
      detail.hasRequestBody ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3(SectionTitle, { extra: /* @__PURE__ */ jsxs3("span", { style: { color: C.muted, fontSize: 11 }, children: [
          "\u6309 schema \u751F\u6210",
          detail.requestBodyRequired ? " \xB7 \u5FC5\u586B" : " \xB7 \u53EF\u9009"
        ] }), children: [
          "\u8BF7\u6C42\u4F53\uFF08",
          detail.exampleBody ? detail.exampleBody.mediaType : detail.requestBodyContentTypes[0] || "application/json",
          "\uFF09"
        ] }),
        /* @__PURE__ */ jsx3(
          "textarea",
          {
            style: { ...inputStyle, minHeight: 120, fontFamily: "Consolas, monospace", resize: "vertical" },
            value: bodyText,
            onChange: (e) => setBodyText(e.target.value),
            spellCheck: false
          }
        )
      ] }) : null,
      /* @__PURE__ */ jsx3("div", { style: { margin: "12px 0" }, children: /* @__PURE__ */ jsx3("button", { style: { ...btnStyle("primary"), fontSize: 13, padding: "7px 22px" }, disabled: sending || !detail, onClick: doSend, children: sending ? "\u53D1\u9001\u4E2D\u2026" : `\u53D1\u9001 ${detail.method.toUpperCase()} \u8BF7\u6C42` }) }),
      record ? /* @__PURE__ */ jsx3(ResponseView, { record }) : null
    ] }) : /* @__PURE__ */ jsx3(Empty, { children: "\u9009\u62E9\u4E00\u4E2A\u7AEF\u70B9\u5F00\u59CB\u8C03\u8BD5\u3002" }),
    history.length ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
      /* @__PURE__ */ jsx3(SectionTitle, { extra: /* @__PURE__ */ jsxs3("span", { style: { color: C.muted, fontSize: 11 }, children: [
        "\u6700\u8FD1 ",
        history.length,
        " \u6761"
      ] }), children: "\u8C03\u7528\u5386\u53F2" }),
      /* @__PURE__ */ jsx3("div", { style: { border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 180, overflowY: "auto" }, children: history.slice(0, 20).map((h) => /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 11 }, children: [
        /* @__PURE__ */ jsx3("span", { style: { color: h.ok ? C.ok : C.danger }, children: h.ok ? "\u2713" : "\u274C" }),
        /* @__PURE__ */ jsx3("span", { style: { color: METHOD_COLOR[h.method] || C.text, minWidth: 46, fontWeight: 600 }, children: h.method }),
        /* @__PURE__ */ jsx3("span", { style: { fontFamily: "Consolas, monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: h.path }),
        /* @__PURE__ */ jsx3("span", { style: { color: C.muted }, children: h.status || "\u2014" }),
        /* @__PURE__ */ jsx3("span", { style: { color: C.muted, minWidth: 52, textAlign: "right" }, children: fmtMs(h.ms) }),
        h.drifts && h.drifts !== "0/0/0" ? /* @__PURE__ */ jsx3(Badge, { text: `\u6F02\u79FB ${h.drifts}`, color: C.warn }) : null,
        h.viaAi ? /* @__PURE__ */ jsx3(Badge, { text: "AI", color: C.accent }) : null,
        /* @__PURE__ */ jsx3("span", { style: { color: C.muted }, children: fmtTime(h.at) })
      ] }, h.reqId)) })
    ] }) : null
  ] });
}
function EndpointPicker(props) {
  const { specId, selectedId, onPick } = props;
  const [list, setList] = useState2([]);
  const [err, setErr] = useState2("");
  useEffect(() => {
    let alive = true;
    sendCommand("spec_get", { specId }, 3e4).then((r) => {
      if (!alive) return;
      if (r && r.ok && Array.isArray(r.endpoints)) setList(r.endpoints);
      else setErr(r && r.error || "\u7AEF\u70B9\u5217\u8868\u8BFB\u53D6\u5931\u8D25");
    }).catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [specId]);
  if (err) return /* @__PURE__ */ jsx3("div", { style: { padding: 8, color: C.danger, fontSize: 11 }, children: err });
  return /* @__PURE__ */ jsx3("div", { children: list.map((e) => /* @__PURE__ */ jsxs3(
    "div",
    {
      onClick: () => onPick(e.id),
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "4px 10px",
        cursor: "pointer",
        borderBottom: `1px solid ${C.border}`,
        background: e.id === selectedId ? "rgba(31,111,235,0.15)" : "transparent",
        fontSize: 11
      },
      children: [
        /* @__PURE__ */ jsx3("span", { style: { color: METHOD_COLOR[e.method] || C.text, fontWeight: 700, minWidth: 52 }, children: e.method.toUpperCase() }),
        /* @__PURE__ */ jsx3("span", { style: { fontFamily: "Consolas, monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.path }),
        e.needsAuth ? /* @__PURE__ */ jsx3("span", { style: { color: C.warn }, children: "\u{1F512}" }) : null,
        /* @__PURE__ */ jsx3("span", { style: { color: C.muted, maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.summary })
      ]
    },
    e.id
  )) });
}
function ResponseView({ record }) {
  const [showRaw, setShowRaw] = useState2(false);
  const v = record.validation;
  const groups = v ? {
    breaking: v.drifts.filter((d) => d.severity === "breaking"),
    warn: v.drifts.filter((d) => d.severity === "warn"),
    info: v.drifts.filter((d) => d.severity === "info")
  } : null;
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsx3(SectionTitle, { children: "\u54CD\u5E94" }),
    /* @__PURE__ */ jsxs3("div", { style: { border: `1px solid ${record.ok ? C.ok : C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }, children: [
      /* @__PURE__ */ jsx3(KeyValue, { rows: [
        ["\u72B6\u6001", `${record.ok ? "\u2713" : "\u274C"} HTTP ${record.status || "\u2014"}${record.location ? ` \u2192 \u91CD\u5B9A\u5411 ${record.location}` : ""} \xB7 ${fmtMs(record.ms)}`],
        ["URL", record.url],
        ["\u9274\u6743", record.authUsed ? `${record.authUsed.type}${record.authUsed.name ? ` (${record.authUsed.name})` : ""} ${record.authUsed.masked || ""}` : "\u672A\u4F7F\u7528"],
        ["\u5C3A\u5BF8", `${record.respBytes} \u5B57\u7B26${record.respBytes >= 65536 ? "\uFF08\u843D\u5E93\u622A\u65AD\uFF09" : ""}`]
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: { marginTop: 6, display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs3("span", { style: { color: C.muted, fontSize: 11 }, children: [
          "\u54CD\u5E94\u5934\uFF1A",
          Object.entries(record.respHeaders).slice(0, 4).map(([k, val]) => `${k}: ${String(val).slice(0, 40)}`).join("  \xB7  ") || "\u2014"
        ] }),
        /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx3("button", { style: btnStyle(), onClick: () => setShowRaw(!showRaw), children: showRaw ? "\u6536\u8D77\u4F53" : "\u770B\u54CD\u5E94\u4F53" })
      ] }),
      showRaw ? /* @__PURE__ */ jsx3("pre", { style: {
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        fontFamily: "Consolas, monospace",
        maxHeight: 260,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        marginTop: 8
      }, children: record.respText || "\uFF08\u7A7A\u4F53\uFF09" }) : null
    ] }),
    v ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
      /* @__PURE__ */ jsx3(SectionTitle, { children: "\u5408\u540C\u6821\u9A8C" }),
      v.summary.total === 0 ? /* @__PURE__ */ jsxs3("div", { style: { border: `1px solid ${C.ok}`, borderRadius: 8, padding: "10px 12px", color: C.ok, fontSize: 12 }, children: [
        "\u2713 \u54CD\u5E94\u4E0E\u5408\u540C\u5B8C\u5168\u76F8\u7B26\uFF08\u72B6\u6001\u7801 ",
        record.status,
        " \u5728\u5408\u540C\u5185\uFF0C\u5B57\u6BB5\u96F6\u6F02\u79FB\uFF09"
      ] }) : /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 10, fontSize: 12 }, children: [
          /* @__PURE__ */ jsx3(Badge, { text: `\u7834\u574F\u6027 ${(groups ? groups.breaking : []).length}`, color: C.danger }),
          /* @__PURE__ */ jsx3(Badge, { text: `\u544A\u8B66 ${(groups ? groups.warn : []).length}`, color: C.warn }),
          /* @__PURE__ */ jsx3(Badge, { text: `\u4FE1\u606F ${(groups ? groups.info : []).length}`, color: "#58A6FF" }),
          /* @__PURE__ */ jsx3("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx3("span", { style: { color: C.muted, fontSize: 11 }, children: "\u7EA2=\u5BA2\u6237\u7AEF\u4F1A\u6302 \u9EC4=\u5927\u6982\u7387\u6709\u95EE\u9898 \u84DD=\u5408\u540C\u8FC7\u65F6\u63D0\u793A" })
        ] }),
        ["breaking", "warn", "info"].map((sev) => (groups ? groups[sev] : []).map((d, i) => /* @__PURE__ */ jsxs3("div", { style: {
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${SEVERITY_COLOR[d.severity]}`,
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 12
        }, children: [
          /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }, children: [
            /* @__PURE__ */ jsx3(SeverityBadge, { severity: d.severity }),
            /* @__PURE__ */ jsx3("span", { style: { fontFamily: "Consolas, monospace", fontWeight: 600 }, children: d.jsonPath }),
            /* @__PURE__ */ jsx3("span", { style: { color: C.muted, fontSize: 11 }, children: d.kind })
          ] }),
          /* @__PURE__ */ jsxs3("div", { children: [
            "\u671F\u671B\uFF1A",
            /* @__PURE__ */ jsx3("span", { style: { color: C.ok }, children: d.expected })
          ] }),
          /* @__PURE__ */ jsxs3("div", { children: [
            "\u5B9E\u9645\uFF1A",
            /* @__PURE__ */ jsx3("span", { style: { color: SEVERITY_COLOR[d.severity] }, children: d.actual })
          ] }),
          d.hint ? /* @__PURE__ */ jsx3("div", { style: { color: C.muted, marginTop: 2 }, children: d.hint }) : null
        ] }, `${sev}.${i}`)))
      ] })
    ] }) : record.error ? /* @__PURE__ */ jsxs3("div", { style: { border: `1px solid ${C.danger}`, borderRadius: 8, padding: "10px 12px", color: "#FFA198", fontSize: 12 }, children: [
      "\u7F51\u7EDC\u5C42\u5931\u8D25\uFF1A",
      record.error
    ] }) : null
  ] });
}

// src/DiffTab.tsx
import { useCallback as useCallback3, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var KIND_LABEL = {
  "endpoint-removed": "\u7AEF\u70B9\u79FB\u9664",
  "endpoint-added": "\u7AEF\u70B9\u65B0\u589E",
  "deprecated-added": "\u6807\u8BB0\u5E9F\u5F03",
  "param-removed": "\u53C2\u6570\u79FB\u9664",
  "param-added": "\u53C2\u6570\u65B0\u589E",
  "param-required-tightened": "\u53C2\u6570\u53D8\u5FC5\u586B",
  "param-type-changed": "\u53C2\u6570\u7C7B\u578B\u53D8\u66F4",
  "param-enum-narrowed": "\u53C2\u6570\u679A\u4E3E\u6536\u7F29",
  "param-enum-widened": "\u53C2\u6570\u679A\u4E3E\u6269\u5927",
  "body-added": "\u8BF7\u6C42\u4F53\u65B0\u589E",
  "body-removed": "\u8BF7\u6C42\u4F53\u79FB\u9664",
  "body-required-tightened": "\u8BF7\u6C42\u4F53\u53D8\u5FC5\u586B",
  "body-content-type-changed": "\u8BF7\u6C42\u4F53\u7C7B\u578B\u53D8\u5316",
  "schema-field-removed": "\u5B57\u6BB5\u79FB\u9664",
  "schema-field-added": "\u5B57\u6BB5\u65B0\u589E",
  "schema-field-type-changed": "\u5B57\u6BB5\u7C7B\u578B\u53D8\u66F4",
  "schema-required-added": "\u5B57\u6BB5\u53D8\u5FC5\u586B",
  "response-removed": "\u54CD\u5E94\u7801\u79FB\u9664",
  "response-added": "\u54CD\u5E94\u7801\u65B0\u589E",
  "security-changed": "\u9274\u6743\u53D8\u5316",
  "global-security-changed": "\u5168\u5C40\u9274\u6743\u53D8\u5316",
  "servers-changed": "\u670D\u52A1\u5668\u5730\u5740\u53D8\u5316"
};
function DiffTab(props) {
  const { specs } = props;
  const [idA, setIdA] = useState3("");
  const [idB, setIdB] = useState3("");
  const [busy, setBusy] = useState3(false);
  const [err, setErr] = useState3("");
  const [report, setReport] = useState3(null);
  const doDiff = useCallback3(async () => {
    if (!idA || !idB) return;
    setBusy(true);
    setErr("");
    try {
      const r = await sendCommand("diff", { specIdA: idA, specIdB: idB }, 6e4);
      if (!r || !r.ok) {
        setErr(r && r.error || "\u5BF9\u6BD4\u5931\u8D25");
        setReport(null);
      } else setReport(r.report);
    } catch (e) {
      setErr(String(e.message));
    } finally {
      setBusy(false);
    }
  }, [idA, idB]);
  if (specs.length < 2) {
    return /* @__PURE__ */ jsx4(Empty, { children: "\u5BF9\u6BD4\u9700\u8981\u4E24\u4EFD\u5408\u540C\uFF1A\u628A\u65B0\u65E7\u4E24\u7248 openapi \u6587\u4EF6\u5404\u5BFC\u5165\u4E00\u6B21\uFF08\u540C\u540D\u540C\u7248\u672C\u91CD\u65B0\u5BFC\u5165\u4F1A\u66FF\u6362\u539F\u6761\u76EE\uFF0C\u6539\u540D\u5BFC\u5165\u5373\u53EF\u5171\u5B58\uFF09\uFF0C\u5C31\u80FD\u770B\u6E05\u8FD9\u6B21\u5347\u7EA7\u4F1A\u4E0D\u4F1A\u70B8\u3002" });
  }
  const breaking = report ? report.changes.filter((c) => c.breaking) : [];
  const others = report ? report.changes.filter((c) => !c.breaking) : [];
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4(SectionTitle, { children: "\u9009\u62E9\u4E24\u7248\u5408\u540C" }),
    /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }, children: [
      /* @__PURE__ */ jsx4("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx4(Field, { label: "\u65E7\u7248\uFF08A\uFF09", children: /* @__PURE__ */ jsxs4("select", { style: inputStyle, value: idA, onChange: (e) => setIdA(e.target.value), children: [
        /* @__PURE__ */ jsx4("option", { value: "", children: "\u9009\u62E9\u2026" }),
        specs.map((s) => /* @__PURE__ */ jsxs4("option", { value: s.id, children: [
          s.name,
          s.version ? ` v${s.version}` : "",
          "\uFF08",
          s.importedAt.slice(5, 16).replace("T", " "),
          "\uFF09"
        ] }, s.id))
      ] }) }) }),
      /* @__PURE__ */ jsx4("span", { style: { color: C.muted, paddingBottom: 10 }, children: "\u2192" }),
      /* @__PURE__ */ jsx4("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx4(Field, { label: "\u65B0\u7248\uFF08B\uFF09", children: /* @__PURE__ */ jsxs4("select", { style: inputStyle, value: idB, onChange: (e) => setIdB(e.target.value), children: [
        /* @__PURE__ */ jsx4("option", { value: "", children: "\u9009\u62E9\u2026" }),
        specs.map((s) => /* @__PURE__ */ jsxs4("option", { value: s.id, children: [
          s.name,
          s.version ? ` v${s.version}` : "",
          "\uFF08",
          s.importedAt.slice(5, 16).replace("T", " "),
          "\uFF09"
        ] }, s.id))
      ] }) }) }),
      /* @__PURE__ */ jsx4("button", { style: { ...btnStyle("primary"), marginBottom: 8 }, disabled: busy || !idA || !idB || idA === idB, onClick: doDiff, children: busy ? "\u5BF9\u6BD4\u4E2D\u2026" : "\u5BF9\u6BD4" })
    ] }),
    /* @__PURE__ */ jsx4(Err, { msg: err }),
    report ? /* @__PURE__ */ jsxs4(Fragment3, { children: [
      /* @__PURE__ */ jsxs4("div", { style: { border: `1px solid ${report.summary.breaking ? C.danger : C.ok}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }, children: [
        /* @__PURE__ */ jsxs4("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 }, children: [
          report.a.name,
          report.a.version ? ` v${report.a.version}` : "",
          " \u2192 ",
          report.b.name,
          report.b.version ? ` v${report.b.version}` : ""
        ] }),
        report.summary.total === 0 ? /* @__PURE__ */ jsx4("div", { style: { color: C.ok, fontSize: 12 }, children: "\u2713 \u4E24\u7248\u5408\u540C\u7ED3\u6784\u5B8C\u5168\u4E00\u81F4" }) : /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }, children: [
          /* @__PURE__ */ jsx4(Badge, { text: `\u7834\u574F\u6027 ${report.summary.breaking}`, color: C.danger }),
          /* @__PURE__ */ jsx4(Badge, { text: `\u544A\u8B66 ${report.summary.warn}`, color: C.warn }),
          /* @__PURE__ */ jsx4(Badge, { text: `\u4FE1\u606F ${report.summary.info}`, color: "#58A6FF" }),
          /* @__PURE__ */ jsx4("span", { style: { color: C.muted, fontSize: 11 }, children: report.summary.breaking ? "\u6709 breaking change\u2014\u2014\u5148\u5347\u7EA7\u8C03\u7528\u65B9\u518D\u5207\u6362" : "\u65E0 breaking change\u2014\u2014\u5347\u7EA7\u5BF9\u8C03\u7528\u65B9\u900F\u660E" })
        ] })
      ] }),
      breaking.length ? /* @__PURE__ */ jsxs4(Fragment3, { children: [
        /* @__PURE__ */ jsx4(SectionTitle, { children: "\u7834\u574F\u6027\u53D8\u66F4\uFF08\u5BA2\u6237\u7AEF\u4F1A\u6302\uFF09" }),
        breaking.map((c, i) => /* @__PURE__ */ jsx4(ChangeRow, { c, danger: true }, `b.${i}`))
      ] }) : null,
      others.length ? /* @__PURE__ */ jsxs4(Fragment3, { children: [
        /* @__PURE__ */ jsx4(SectionTitle, { children: "\u5176\u4ED6\u53D8\u5316" }),
        others.map((c, i) => /* @__PURE__ */ jsx4(ChangeRow, { c }, `o.${i}`))
      ] }) : null
    ] }) : null
  ] });
}
function ChangeRow({ c, danger }) {
  return /* @__PURE__ */ jsxs4("div", { style: {
    border: `1px solid ${C.border}`,
    borderLeft: `3px solid ${danger ? C.danger : c.severity === "warn" ? C.warn : "#58A6FF"}`,
    borderRadius: 6,
    padding: "8px 10px",
    marginBottom: 6,
    fontSize: 12
  }, children: [
    /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 2, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx4(Badge, { text: KIND_LABEL[c.kind] || c.kind, color: danger ? C.danger : c.severity === "warn" ? C.warn : "#58A6FF" }),
      c.method && c.path !== "(\u5168\u5C40)" ? /* @__PURE__ */ jsxs4("span", { children: [
        /* @__PURE__ */ jsx4("span", { style: { color: METHOD_COLOR[c.method.toUpperCase()] || C.text, fontWeight: 700, marginRight: 6 }, children: c.method.toUpperCase() }),
        /* @__PURE__ */ jsx4("span", { style: { fontFamily: "Consolas, monospace" }, children: c.path })
      ] }) : /* @__PURE__ */ jsx4("span", { style: { fontFamily: "Consolas, monospace" }, children: c.path })
    ] }),
    /* @__PURE__ */ jsx4("div", { style: { lineHeight: 1.6 }, children: c.detail }),
    c.expected || c.actual ? /* @__PURE__ */ jsxs4("div", { style: { color: C.muted, fontSize: 11, marginTop: 2 }, children: [
      c.expected ? `\u539F\uFF1A${c.expected}  ` : "",
      c.actual ? `\u65B0\uFF1A${c.actual}` : ""
    ] }) : null
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var S = {
  bar: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0 10px", borderBottom: "1px solid #30363D", marginBottom: 12, flexWrap: "wrap" },
  tab: (active) => ({
    background: active ? "#1F6FEB" : "transparent",
    color: active ? "#fff" : "#C9D1D9",
    border: "1px solid #30363D",
    borderRadius: 6,
    padding: "5px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: active ? 600 : 400
  }),
  muted: { color: "#8B949E", fontSize: 12 }
};
function Panel() {
  const [tab, setTab] = useState4("specs");
  const [meta, setMeta] = useState4(null);
  const [specs, setSpecs] = useState4([]);
  const [envs, setEnvs] = useState4([]);
  const [history, setHistory] = useState4([]);
  const [activeSpecId, setActiveSpecId] = useState4("");
  const [bridgeErr, setBridgeErr] = useState4("");
  const refresh = useCallback4(async () => {
    try {
      const [m, sp, ev, h] = await Promise.all([loadMeta(), loadSpecs(), loadEnvs(), loadHistory()]);
      setMeta(m);
      const items = sp && Array.isArray(sp.items) ? sp.items : [];
      setSpecs(items);
      setEnvs(ev && Array.isArray(ev.items) ? ev.items : []);
      setHistory(normalizeHistory(h));
      setActiveSpecId((cur) => cur && items.some((s) => s.id === cur) ? cur : items.length ? items[items.length - 1].id : "");
      setBridgeErr("");
    } catch (e) {
      setBridgeErr(String(e.message));
    }
  }, []);
  useEffect2(() => {
    refresh();
    const t = setInterval(refresh, 5e3);
    return () => clearInterval(t);
  }, [refresh]);
  const openDebug = useCallback4((specId) => {
    setActiveSpecId(specId);
    setTab("call");
  }, []);
  const running = meta && meta.running;
  return /* @__PURE__ */ jsxs5("div", { style: { color: "#E6EDF3", fontSize: 13, padding: "2px 4px 20px" }, children: [
    /* @__PURE__ */ jsxs5("div", { style: S.bar, children: [
      /* @__PURE__ */ jsxs5("button", { style: S.tab(tab === "specs"), onClick: () => setTab("specs"), children: [
        "\u5408\u540C",
        specs.length ? `\uFF08${specs.length}\uFF09` : ""
      ] }),
      /* @__PURE__ */ jsx5("button", { style: S.tab(tab === "call"), onClick: () => setTab("call"), children: "\u8C03\u8BD5" }),
      /* @__PURE__ */ jsx5("button", { style: S.tab(tab === "diff"), onClick: () => setTab("diff"), children: "\u5BF9\u6BD4" }),
      /* @__PURE__ */ jsx5("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx5("span", { style: S.muted, children: meta ? meta.degraded ? `\u26A0 \u670D\u52A1\u964D\u7EA7\uFF1A${meta.lastBridgeErr || "\u6865\u4E0D\u53EF\u8FBE\uFF0C60s \u81EA\u52A8\u91CD\u8BD5"}` : `\u670D\u52A1 v${meta.version} \xB7 ${meta.specCount} \u5408\u540C` : "\u8FDE\u63A5\u670D\u52A1\u4E2D\u2026" }),
      running ? /* @__PURE__ */ jsxs5("span", { style: { ...S.muted, color: "#D29922" }, children: [
        "\u8BF7\u6C42\u4E2D\uFF1A",
        running.label
      ] }) : null
    ] }),
    bridgeErr ? /* @__PURE__ */ jsxs5("div", { style: { color: "#FFA198", fontSize: 12, marginBottom: 10 }, children: [
      "\u5BBF\u4E3B\u901A\u9053\u5F02\u5E38\uFF1A",
      bridgeErr,
      "\uFF08cap.kv \u4E0D\u53EF\u8FBE\uFF1F\u8BF7\u786E\u8BA4 Polaris \u7248\u672C\u4E0E\u63D2\u4EF6\u670D\u52A1\u72B6\u6001\uFF09"
    ] }) : null,
    tab === "specs" ? /* @__PURE__ */ jsx5(SpecsTab, { specs, onChanged: refresh, onOpenDebug: openDebug }) : null,
    tab === "call" ? /* @__PURE__ */ jsx5(
      CallTab,
      {
        specs,
        activeSpecId,
        setActiveSpecId,
        envs,
        history: history.filter((h) => !activeSpecId || h.specId === activeSpecId),
        onChanged: refresh
      }
    ) : null,
    tab === "diff" ? /* @__PURE__ */ jsx5(DiffTab, { specs }) : null
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function OpenapiDeskEntry() {
  return /* @__PURE__ */ jsx6(Panel, {});
}
export {
  OpenapiDeskEntry as default
};
