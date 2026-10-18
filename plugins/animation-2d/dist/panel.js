// src/Panel.tsx
import { useEffect, useState, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var PLUGIN_ID = "animation-2d";
async function getRenderBase() {
  const invoke = window.__POLARIS_HOST_INVOKE__;
  if (invoke) {
    try {
      const res = await invoke("router_dispatch", {
        req: { target: "cap.pluginServiceManager", payload: { action: "list_status" } }
      });
      const svc = (res?.result?.services || res?.services || []).find(
        (s) => s.pluginId === PLUGIN_ID && s.serviceId === "animation-2d-render"
      );
      if (svc?.port) return `http://127.0.0.1:${svc.port}`;
    } catch (_) {
    }
  }
  return "http://127.0.0.1:9862";
}
async function callRender(base, endpoint, body) {
  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
var styles = {
  container: { padding: 14, display: "flex", flexDirection: "column", height: "100%", gap: 10, overflow: "auto" },
  label: { fontSize: 11, color: "#8E8E93", marginBottom: 4 },
  input: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, boxSizing: "border-box" },
  btn: (primary = false) => ({
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    background: primary ? "#3B82F6" : "#2D2D33",
    color: primary ? "#fff" : "#B4B4B8",
    border: primary ? "none" : "1px solid #3F3F46"
  }),
  card: { padding: 10, borderRadius: 8, border: "1px solid #3F3F46", background: "#25252B", display: "flex", flexDirection: "column", gap: 8 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  img: { maxWidth: "100%", borderRadius: 6, border: "1px solid #3F3F46" },
  statusOk: { fontSize: 12, color: "#4ADE80", padding: 4 },
  statusErr: { fontSize: 12, color: "#F87171", padding: 4 },
  statusInfo: { fontSize: 11, color: "#8E8E93", padding: 4, whiteSpace: "pre-wrap" }
};
function Field({ label, children }) {
  return /* @__PURE__ */ jsxs("div", { style: styles.field, children: [
    /* @__PURE__ */ jsx("div", { style: styles.label, children: label }),
    children
  ] });
}
function Animation2dPanel({ pluginId: _pluginId }) {
  const [base, setBase] = useState("");
  const [svcMsg, setSvcMsg] = useState("");
  const [times, setTimes] = useState("0,2.5,5");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [checkPrompt, setCheckPrompt] = useState("");
  const [checkResult, setCheckResult] = useState("");
  const [checking, setChecking] = useState(false);
  const [lastFiles, setLastFiles] = useState([]);
  useEffect(() => {
    getRenderBase().then((b) => {
      setBase(b);
      fetch(`${b}/__health`).then((r) => {
        if (r.ok) setSvcMsg(`\u6E32\u67D3\u670D\u52A1\u5728\u7EBF\uFF08${b}\uFF09`);
        else setSvcMsg("\u6E32\u67D3\u670D\u52A1\u5730\u5740\u4E0D\u786E\u5B9A\uFF0C\u8BF7\u786E\u8BA4\u63D2\u4EF6\u670D\u52A1\u5DF2\u542F\u52A8");
      }).catch(() => setSvcMsg("\u6E32\u67D3\u670D\u52A1\u672A\u5C31\u7EEA\uFF08Polaris \u63D2\u4EF6\u670D\u52A1\u542F\u52A8\u4E2D\uFF1F\uFF09"));
    }).catch(() => setSvcMsg("\u65E0\u6CD5\u83B7\u53D6\u6E32\u67D3\u670D\u52A1\u5730\u5740"));
  }, []);
  const handleRenderStill = useCallback(async () => {
    if (!times.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await callRender(base, "/render/stills", { times: times.trim() });
      const files = Array.isArray(r.out) ? r.out : [];
      const last = files[files.length - 1];
      setLastFiles(files);
      if (last) {
        setPreview(`${base}/file?path=${encodeURIComponent(last)}`);
        setSvcMsg(`\u6E32\u67D3\u5B8C\u6210\uFF1A${files.length} \u5E27\uFF08\u9884\u89C8\u6700\u540E\u4E00\u5E27\uFF09
${files.join("\n")}`);
      } else {
        setPreview(null);
        setSvcMsg(`\u6E32\u67D3\u5B8C\u6210\uFF1A${r.log || r.out}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [base, times, busy]);
  const handleSheet = useCallback(async () => {
    if (!times.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await callRender(base, "/render/sheet", { times: times.trim() });
      setSvcMsg(`\u8054\u7CFB\u65B9\u5F0F\u56FE\u5DF2\u751F\u6210\uFF1A${r.out}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [base, times, busy]);
  const handleEncode = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await callRender(base, "/encode", {});
      setSvcMsg(`MP4 \u5DF2\u751F\u6210\uFF1A${r.out}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [base, busy]);
  const handleCheck = useCallback(async () => {
    if (!lastFiles.length) {
      setCheckResult("\u8BF7\u5148\u6E32\u67D3\u9759\u5E27");
      return;
    }
    setChecking(true);
    setCheckResult("\u8D28\u68C0\u4E2D...");
    try {
      const prompt = checkPrompt.trim() || "\u8BF7\u6309 2D \u624B\u7ED8\u52A8\u753B\u6807\u51C6\u5BA1\u67E5\u6B64\u5E27\uFF1A\u7EAF2D\u7B14\u89E6/\u65E0\u6587\u5B57/\u6784\u56FE\u6E05\u6670/\u8272\u5F69\u67D4\u548C\u3002\u9010\u6761\u6307\u51FA\u95EE\u9898\u5E76\u7ED9\u603B\u8BC4\u3002";
      const r = await callRender(base, "/vision", { image: lastFiles[lastFiles.length - 1], prompt });
      setCheckResult(r.verdict);
    } catch (e) {
      setCheckResult(`\u8D28\u68C0\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  }, [base, checkPrompt, lastFiles]);
  return /* @__PURE__ */ jsxs("div", { style: styles.container, children: [
    /* @__PURE__ */ jsx("div", { style: styles.row, children: /* @__PURE__ */ jsx("span", { style: { fontSize: 14, fontWeight: 600, color: "#F8F8F8" }, children: "2D \u624B\u7ED8\u52A8\u753B" }) }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93" }, children: "p5.brush \u6C34\u58A8\u98CE \xB7 \u7EAF 2D \u624B\u7ED8\u9010\u5E27" }),
    svcMsg && /* @__PURE__ */ jsx("div", { style: styles.statusInfo, children: svcMsg }),
    err && /* @__PURE__ */ jsx("div", { style: styles.statusErr, children: err }),
    /* @__PURE__ */ jsxs("div", { style: styles.card, children: [
      /* @__PURE__ */ jsx(Field, { label: "\u6E32\u67D3\u65F6\u523B\uFF08\u79D2\uFF0C\u9017\u53F7\u5206\u9694\uFF09", children: /* @__PURE__ */ jsx("input", { style: styles.input, value: times, onChange: (e) => setTimes(e.target.value) }) }),
      /* @__PURE__ */ jsxs("div", { style: styles.row, children: [
        /* @__PURE__ */ jsx("button", { style: styles.btn(true), onClick: handleRenderStill, disabled: busy || !base, children: busy ? "\u6E32\u67D3\u4E2D..." : "\u6E32\u67D3\u9759\u5E27" }),
        /* @__PURE__ */ jsx("button", { style: styles.btn(), onClick: handleSheet, disabled: busy || !base, children: "\u8054\u7CFB\u65B9\u5F0F\u56FE" }),
        /* @__PURE__ */ jsx("button", { style: styles.btn(), onClick: handleEncode, disabled: busy || !base, children: "\u7F16\u7801 MP4" })
      ] })
    ] }),
    preview && /* @__PURE__ */ jsx("div", { style: styles.card, children: /* @__PURE__ */ jsx("img", { src: preview, alt: "preview", style: styles.img }) }),
    /* @__PURE__ */ jsxs("div", { style: styles.card, children: [
      /* @__PURE__ */ jsx(Field, { label: "\u8D28\u68C0\u6307\u4EE4\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ jsx(
        "textarea",
        {
          style: { ...styles.input, minHeight: 60, resize: "vertical" },
          value: checkPrompt,
          onChange: (e) => setCheckPrompt(e.target.value),
          placeholder: "\u6309 2D \u624B\u7ED8\u52A8\u753B\u6807\u51C6\u5BA1\u67E5\u6B64\u5E27..."
        }
      ) }),
      /* @__PURE__ */ jsx("button", { style: styles.btn(), onClick: handleCheck, disabled: checking, children: "\u8D28\u68C0\u8BF4\u660E" }),
      checkResult && /* @__PURE__ */ jsx("div", { style: styles.statusInfo, children: checkResult })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#71717A", lineHeight: 1.6 }, children: "\u6E32\u67D3\u670D\u52A1\u7531\u63D2\u4EF6\u58F0\u660E\uFF08autoStart \u81EA\u52A8\u62C9\u8D77\uFF09\u3002\u5E27/\u89C6\u9891\u8F93\u51FA\u5728\u63D2\u4EF6\u76EE\u5F55 out/ \u4E0B\u3002 \u8BA9 AI \u8C03\u7528 render_still / render_contact_sheet / render_frames / encode_video / vision_check \u53EF\u5B8C\u6210\u5168\u6D41\u7A0B\u3002" })
  ] });
}
export {
  Animation2dPanel as default
};
