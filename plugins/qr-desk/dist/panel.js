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

// src/model.ts
async function kvReq(payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target: "cap.kv", payload } });
  if (!res || res.ok === false) throw new Error(String(res && res.error) || "cap.kv \u8C03\u7528\u5931\u8D25");
  return res;
}
async function kvGet(key) {
  const res = await kvReq({ action: "get", key });
  return res.result && res.result.value !== void 0 ? res.result.value : null;
}
async function kvSet(key, value) {
  await kvReq({ action: "set", key, value });
}
var KEY_META = "qr-desk.meta";
var KEY_SETTINGS = "qr-desk.settings";
async function getMeta() {
  try {
    const raw = await kvGet(KEY_META);
    if (!raw || typeof raw !== "object") return null;
    const m = raw;
    if (typeof m.token !== "string" || !m.token || typeof m.port !== "number" || !m.port) return null;
    return m;
  } catch (_) {
    return null;
  }
}
async function loadSettings() {
  try {
    const raw = await kvGet(KEY_SETTINGS);
    const s = raw && typeof raw === "object" ? raw : {};
    return { outDir: typeof s.outDir === "string" ? s.outDir : "" };
  } catch (_) {
    return { outDir: "" };
  }
}
async function saveSettings(s) {
  await kvSet(KEY_SETTINGS, s);
}
async function svcPost(meta, api, body) {
  const res = await fetch(`http://127.0.0.1:${meta.port}${api}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Qr-Desk-Token": meta.token },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function apiGenerate(meta, body) {
  return svcPost(meta, "/api/generate", body);
}
function apiDecode(meta, body) {
  return svcPost(meta, "/api/decode", body);
}
function apiInspect(meta, text) {
  return svcPost(meta, "/api/inspect", { text });
}
function apiBatchStart(meta, body) {
  return svcPost(meta, "/api/batch", body);
}
async function apiJob(meta, id) {
  const res = await fetch(`http://127.0.0.1:${meta.port}/api/job?id=${encodeURIComponent(id)}`, {
    headers: { "X-Qr-Desk-Token": meta.token }
  });
  const data = await res.json();
  if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data.job;
}
function apiSelftest(meta) {
  return svcPost(meta, "/api/selftest", {});
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var css = `
.qd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qd-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qd-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qd-body::-webkit-scrollbar{width:9px;height:9px}
.qd-body::-webkit-scrollbar-track{background:transparent}
.qd-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qd-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qd-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3ECFB2,#177E69);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.qd-tt{flex:1;min-width:0}
.qd-tt b{font-size:15px;display:block}
.qd-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qd-tabs{display:flex;gap:4px}
.qd-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.qd-tab:hover{color:#E6EAF2}
.qd-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qd-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 4px;font-size:13px;font-weight:700}
.qd-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3ECFB2,#177E69);flex-shrink:0}
.qd-card{margin:6px 16px;padding:12px 14px;background:#151A24;border:1px solid #232A38;border-radius:12px}
.qd-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.qd-lbl{font-size:11px;color:#8B95A7;min-width:52px}
.qd-inp,.qd-sel,.qd-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.qd-inp:focus,.qd-txa:focus,.qd-sel:focus{border-color:#3ECFB2}
.qd-inp{flex:1;min-width:120px}
.qd-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:12px}
.qd-btn{background:linear-gradient(135deg,#2FA88E,#177E69);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.qd-btn:hover{filter:brightness(1.1)}
.qd-btn:disabled{opacity:.5;cursor:default}
.qd-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.qd-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.qd-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all}
.qd-ok{background:rgba(62,207,178,.1);border:1px solid rgba(62,207,178,.35);color:#7BDCC4;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px}
.qd-prev{display:flex;justify-content:center;padding:14px;background:#fff;border-radius:12px;margin:8px 16px}
.qd-prev svg{width:min(300px,80vw);height:auto;display:block}
.qd-meta{color:#8B95A7;font-size:11px;margin:2px 18px 8px;display:flex;gap:12px;flex-wrap:wrap}
.qd-pre{background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:9px 11px;font-family:Consolas,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow-y:auto;margin:6px 0}
.qd-kv{margin:4px 0}
.qd-kv .k{color:#7BDCC4;font-size:11.5px}
.qd-kv .v{color:#E6EAF2;font-size:12px;word-break:break-all}
.qd-kv .sub{margin-left:12px;border-left:1px solid #232A38;padding-left:9px;margin-top:2px}
.qd-code{display:flex;align-items:center;gap:14px;margin:8px 0}
.qd-code b{font-family:Consolas,Menlo,monospace;font-size:30px;letter-spacing:7px;color:#3ECFB2}
.qd-code small{color:#8B95A7;font-size:11px}
.qd-drop{margin:6px 16px;border:2px dashed #2C3547;border-radius:14px;padding:26px 14px;text-align:center;color:#8B95A7;font-size:12.5px;cursor:pointer;transition:border-color .15s}
.qd-drop.hot{border-color:#3ECFB2;color:#7BDCC4;background:rgba(62,207,178,.05)}
.qd-prog{height:7px;border-radius:4px;background:#1C2330;overflow:hidden;margin:8px 0}
.qd-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2FA88E,#3ECFB2);transition:width .2s}
.qd-files{max-height:180px;overflow-y:auto;font-size:11px;color:#9BA5B8;font-family:Consolas,Menlo,monospace}
.qd-files div{padding:1.5px 0;word-break:break-all}
.qd-chk{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12.5px}
.qd-chk .st{width:16px;text-align:center;flex-shrink:0}
.qd-chk.ok .st{color:#3ECFB2}
.qd-chk.bad .st{color:#E5484D}
.qd-chk .dt{color:#8B95A7;font-size:11px;margin-left:6px}
.qd-seg{display:inline-flex;background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:2px;gap:2px}
.qd-seg button{background:transparent;border:none;color:#8B95A7;font-size:11.5px;padding:4px 11px;border-radius:7px;cursor:pointer}
.qd-seg button.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qd-toast{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:#1C2330;border:1px solid #2C3547;color:#E6EAF2;padding:8px 16px;border-radius:10px;font-size:12px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:86%}
.qd-toast.bad{border-color:rgba(229,72,77,.5)}
.qd-hint{color:#66708A;font-size:11px;margin:2px 18px 6px}
.qd-offline{margin:6px 16px;background:rgba(232,163,61,.1);border:1px solid rgba(232,163,61,.4);color:#E8C08A;border-radius:10px;padding:10px 12px;font-size:12px;display:flex;align-items:center;gap:10px;justify-content:space-between}
`;
function QrDeskPanel(props) {
  const [tab, setTab] = useState("gen");
  const [meta, setMeta] = useState(null);
  const [settings, setSettings] = useState({ outDir: "" });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  const reloadMeta = useCallback(async () => {
    setMeta(await getMeta());
  }, []);
  useEffect(() => {
    void (async () => {
      await reloadMeta();
      setSettings(await loadSettings());
    })();
  }, [reloadMeta]);
  const saveOutDir = useCallback(async (dir) => {
    const next = { outDir: dir };
    setSettings(next);
    try {
      await saveSettings(next);
    } catch (_) {
      showToast("\u9ED8\u8BA4\u76EE\u5F55\u4FDD\u5B58\u5931\u8D25\uFF08\u6865\u964D\u7EA7\uFF09\uFF0C\u672C\u6B21\u4ECD\u53EF\u7528", true);
    }
  }, [showToast]);
  const ctx = { meta, settings, saveOutDir, showToast, onSendToChat: props.onSendToChat, reloadMeta };
  return /* @__PURE__ */ jsxs("div", { className: "qd-root", children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    /* @__PURE__ */ jsxs("div", { className: "qd-top", children: [
      /* @__PURE__ */ jsx("div", { className: "qd-logo", children: "\u25A6" }),
      /* @__PURE__ */ jsxs("div", { className: "qd-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "\u4E8C\u7EF4\u7801\u5DE5\u4F5C\u53F0" }),
        /* @__PURE__ */ jsx("small", { children: meta ? `\u670D\u52A1\u5728\u7EBF :${meta.port} \xB7 \u751F\u6210/\u89E3\u7801/\u8FC1\u79FB\u7801\uFF0C\u5BC6\u94A5\u4E0D\u51FA\u672C\u673A` : "\u670D\u52A1\u672A\u8FDE\u63A5 \xB7 \u7B49\u5F85\u5BBF\u4E3B\u62C9\u8D77" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qd-tabs", children: [["gen", "\u751F\u6210"], ["dec", "\u89E3\u7801"], ["batch", "\u6279\u91CF"], ["check", "\u4F53\u68C0"]].map(([k, label]) => /* @__PURE__ */ jsx("button", { className: `qd-tab${tab === k ? " on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-body", children: [
      tab === "gen" && /* @__PURE__ */ jsx(GenTab, { ...ctx }),
      tab === "dec" && /* @__PURE__ */ jsx(DecTab, { ...ctx }),
      tab === "batch" && /* @__PURE__ */ jsx(BatchTab, { ...ctx }),
      tab === "check" && /* @__PURE__ */ jsx(CheckTab, { ...ctx })
    ] }),
    toast && /* @__PURE__ */ jsx("div", { className: `qd-toast${toast.bad ? " bad" : ""}`, children: toast.msg })
  ] });
}
function OfflineBanner({ reloadMeta }) {
  return /* @__PURE__ */ jsxs("div", { className: "qd-offline", children: [
    /* @__PURE__ */ jsx("span", { children: "\u670D\u52A1\u672A\u5C31\u7EEA\uFF1A\u8BF7\u786E\u8BA4\u63D2\u4EF6\u670D\u52A1\u5DF2\u542F\u52A8\uFF08\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u4E8C\u7EF4\u7801\u5DE5\u4F5C\u53F0\uFF09\u3002\u521A\u88C5\u597D\u65F6\u53EF\u7A0D\u5019\u51E0\u79D2\u518D\u8BD5\u3002" }),
    /* @__PURE__ */ jsx("button", { className: "qd-btn mini ghost", onClick: () => void reloadMeta(), children: "\u91CD\u8BD5" })
  ] });
}
function GenTab({ meta, settings, saveOutDir, showToast, reloadMeta }) {
  const [type, setType] = useState("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("https://");
  const [wifi, setWifi] = useState({ ssid: "", password: "", encryption: "WPA", hidden: false });
  const [vc, setVc] = useState({ name: "", last: "", first: "", org: "", tel: "", email: "", url: "", note: "" });
  const [otp, setOtp] = useState({ otpType: "totp", label: "", issuer: "", secret: "", algorithm: "SHA1", digits: "6", period: "30", counter: "0" });
  const [ecl, setEcl] = useState("M");
  const [margin, setMargin] = useState("4");
  const [scale, setScale] = useState("8");
  const [outDir, setOutDir] = useState(settings.outDir);
  const [fileName, setFileName] = useState("qr");
  const [withSvg, setWithSvg] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setOutDir(settings.outDir);
  }, [settings.outDir]);
  const buildTemplate = () => {
    if (type === "text") return { type: "text", fields: { text } };
    if (type === "url") return { type: "url", fields: { url } };
    if (type === "wifi") return { type: "wifi", fields: { ...wifi } };
    if (type === "vcard") return { type: "vcard", fields: { ...vc } };
    return { type: "otpauth", fields: { ...otp, digits: Number(otp.digits), period: Number(otp.period), counter: Number(otp.counter) } };
  };
  const run = async () => {
    if (!meta) return;
    setBusy(true);
    setErr("");
    setPreview(null);
    try {
      const body = { template: buildTemplate(), ecl, margin: Number(margin), scale: Number(scale) };
      if (outDir.trim()) body.save = { outDir: outDir.trim(), fileName: fileName || "qr", withSvg };
      const r = await apiGenerate(meta, body);
      setResult(r);
      if (r.payload.startsWith("otpauth://")) {
        try {
          setPreview(await apiInspect(meta, r.payload));
        } catch (_) {
        }
      }
      if (r.savedTo) showToast(`\u5DF2\u4FDD\u5B58 ${r.savedTo.length} \u4E2A\u6587\u4EF6`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    !meta && /* @__PURE__ */ jsx(OfflineBanner, { reloadMeta }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u7C7B\u578B"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsx("div", { className: "qd-row", children: /* @__PURE__ */ jsx("div", { className: "qd-seg", children: [["text", "\u6587\u672C"], ["url", "URL"], ["wifi", "WiFi"], ["vcard", "\u540D\u7247"], ["otpauth", "OTP"]].map(([k, l]) => /* @__PURE__ */ jsx("button", { className: type === k ? "on" : "", onClick: () => {
        setType(k);
        setResult(null);
        setPreview(null);
        setErr("");
      }, children: l }, k)) }) }),
      type === "text" && /* @__PURE__ */ jsx("div", { className: "qd-row", children: /* @__PURE__ */ jsx("textarea", { className: "qd-txa", rows: 3, placeholder: "\u4EFB\u610F\u6587\u672C\uFF08\u81EA\u52A8\u6309 UTF-8 \u7F16\u7801\uFF0C\u8D85\u5BB9\u91CF\u4F1A\u63D0\u793A\uFF09", value: text, onChange: (e) => setText(e.target.value) }) }),
      type === "url" && /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7F51\u5740" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", value: url, onChange: (e) => setUrl(e.target.value), placeholder: "https://\u2026" })
      ] }),
      type === "wifi" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "SSID" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: wifi.ssid, onChange: (e) => setWifi({ ...wifi, ssid: e.target.value }), placeholder: 'WiFi \u540D\u79F0\uFF08;,:"\\ \u4F1A\u81EA\u52A8\u8F6C\u4E49\uFF09' })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u5BC6\u7801" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: wifi.password, onChange: (e) => setWifi({ ...wifi, password: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u52A0\u5BC6" }),
          /* @__PURE__ */ jsxs("select", { className: "qd-sel", value: wifi.encryption, onChange: (e) => setWifi({ ...wifi, encryption: e.target.value }), children: [
            /* @__PURE__ */ jsx("option", { value: "WPA", children: "WPA/WPA2/WPA3" }),
            /* @__PURE__ */ jsx("option", { value: "WEP", children: "WEP" }),
            /* @__PURE__ */ jsx("option", { value: "nopass", children: "\u5F00\u653E\uFF08\u65E0\u5BC6\u7801\uFF09" })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "qd-chk", children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: wifi.hidden, onChange: (e) => setWifi({ ...wifi, hidden: e.target.checked }) }),
            "\u9690\u85CF\u7F51\u7EDC"
          ] })
        ] })
      ] }),
      type === "vcard" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u59D3\u540D*" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.name, onChange: (e) => setVc({ ...vc, name: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u59D3/\u540D" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.last, onChange: (e) => setVc({ ...vc, last: e.target.value }), placeholder: "\u59D3" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.first, onChange: (e) => setVc({ ...vc, first: e.target.value }), placeholder: "\u540D" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7535\u8BDD" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.tel, onChange: (e) => setVc({ ...vc, tel: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u90AE\u7BB1" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.email, onChange: (e) => setVc({ ...vc, email: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7EC4\u7EC7" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.org, onChange: (e) => setVc({ ...vc, org: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u5907\u6CE8" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: vc.note, onChange: (e) => setVc({ ...vc, note: e.target.value }) })
        ] })
      ] }),
      type === "otpauth" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7C7B\u578B" }),
          /* @__PURE__ */ jsxs("select", { className: "qd-sel", value: otp.otpType, onChange: (e) => setOtp({ ...otp, otpType: e.target.value }), children: [
            /* @__PURE__ */ jsx("option", { value: "totp", children: "TOTP\uFF08\u65F6\u95F4\uFF09" }),
            /* @__PURE__ */ jsx("option", { value: "hotp", children: "HOTP\uFF08\u8BA1\u6570\uFF09" })
          ] }),
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7B97\u6CD5" }),
          /* @__PURE__ */ jsxs("select", { className: "qd-sel", value: otp.algorithm, onChange: (e) => setOtp({ ...otp, algorithm: e.target.value }), children: [
            /* @__PURE__ */ jsx("option", { children: "SHA1" }),
            /* @__PURE__ */ jsx("option", { children: "SHA256" }),
            /* @__PURE__ */ jsx("option", { children: "SHA512" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u6807\u7B7E" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: otp.label, onChange: (e) => setOtp({ ...otp, label: e.target.value }), placeholder: "GitHub:alice \u6216 alice" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u5BC6\u94A5" }),
          /* @__PURE__ */ jsx("input", { className: "qd-inp", value: otp.secret, onChange: (e) => setOtp({ ...otp, secret: e.target.value }), placeholder: "Base32\uFF0C\u5982 JBSWY3DPEHPK3PXP" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u4F4D\u6570" }),
          /* @__PURE__ */ jsxs("select", { className: "qd-sel", value: otp.digits, onChange: (e) => setOtp({ ...otp, digits: e.target.value }), children: [
            /* @__PURE__ */ jsx("option", { value: "6", children: "6" }),
            /* @__PURE__ */ jsx("option", { value: "8", children: "8" })
          ] }),
          otp.otpType === "totp" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u5468\u671F" }),
            /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 90 }, value: otp.period, onChange: (e) => setOtp({ ...otp, period: e.target.value }) })
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u8BA1\u6570" }),
            /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 90 }, value: otp.counter, onChange: (e) => setOtp({ ...otp, counter: e.target.value }) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u53C2\u6570"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7EA0\u9519" }),
        /* @__PURE__ */ jsxs("select", { className: "qd-sel", value: ecl, onChange: (e) => setEcl(e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "L", children: "L\uFF087%\uFF09" }),
          /* @__PURE__ */ jsx("option", { value: "M", children: "M\uFF0815%\uFF09" }),
          /* @__PURE__ */ jsx("option", { value: "Q", children: "Q\uFF0825%\uFF09" }),
          /* @__PURE__ */ jsx("option", { value: "H", children: "H\uFF0830%\uFF09" })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u9759\u533A" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 70 }, value: margin, onChange: (e) => setMargin(e.target.value) }),
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u50CF\u7D20" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 70 }, value: scale, onChange: (e) => setScale(e.target.value), title: "PNG \u6BCF\u6A21\u5757\u50CF\u7D20" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u76EE\u5F55" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", value: outDir, onChange: (e) => setOutDir(e.target.value), placeholder: "\u53EF\u9009\uFF1APNG \u843D\u76D8\u76EE\u5F55\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09\uFF0C\u7559\u7A7A\u53EA\u9884\u89C8" }),
        /* @__PURE__ */ jsx("button", { className: "qd-btn mini ghost", onClick: () => void saveOutDir(outDir.trim()), disabled: !outDir.trim(), children: "\u5B58\u4E3A\u9ED8\u8BA4" })
      ] }),
      outDir.trim() !== "" && /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u6587\u4EF6\u540D" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 160 }, value: fileName, onChange: (e) => setFileName(e.target.value) }),
        /* @__PURE__ */ jsxs("label", { className: "qd-chk", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: withSvg, onChange: (e) => setWithSvg(e.target.checked) }),
          "\u540C\u65F6\u5B58 SVG"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qd-row", children: /* @__PURE__ */ jsx("button", { className: "qd-btn", onClick: () => void run(), disabled: busy || !meta, children: busy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u4E8C\u7EF4\u7801" }) })
    ] }),
    err && /* @__PURE__ */ jsx("div", { className: "qd-err", children: err }),
    result && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "qd-prev", dangerouslySetInnerHTML: { __html: result.svg } }),
      /* @__PURE__ */ jsxs("div", { className: "qd-meta", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "\u6A21\u5757 ",
          result.meta.modules,
          "\xD7",
          result.meta.modules
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u8F7D\u8377 ",
          result.meta.bytes,
          " \u5B57\u8282"
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "\u7EA0\u9519 ",
          result.meta.ecl
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          "PNG ",
          result.meta.pixelSize,
          "px"
        ] }),
        result.savedTo && /* @__PURE__ */ jsxs("span", { children: [
          "\u5DF2\u5B58 ",
          result.savedTo.length,
          " \u4E2A\u6587\u4EF6"
        ] })
      ] }),
      result.savedTo && /* @__PURE__ */ jsxs("div", { className: "qd-ok", children: [
        "\u5DF2\u843D\u76D8\uFF1A",
        result.savedTo.join("\u3001")
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
        "\u8F7D\u8377"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
        /* @__PURE__ */ jsx("div", { className: "qd-pre", children: result.payload }),
        /* @__PURE__ */ jsx(CopyBtn, { text: result.payload, showToast, label: "\u590D\u5236\u8F7D\u8377" })
      ] }),
      preview && preview.preview && /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "qd-code", children: [
          /* @__PURE__ */ jsx("b", { children: preview.preview.code }),
          /* @__PURE__ */ jsx("small", { children: preview.preview.kind === "totp" ? `\u6BCF ${preview.preview.period}s \u5237\u65B0` : `\u8BA1\u6570 ${preview.preview.counter}` })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "qd-hint", children: "\u626B\u7801\u540E\u9A8C\u8BC1\u5668 App \u5E94\u663E\u793A\u540C\u4E00\u6570\u5B57" })
      ] })
    ] })
  ] });
}
function CopyBtn({ text, showToast, label }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      className: "qd-btn mini ghost",
      onClick: () => {
        void navigator.clipboard.writeText(text).then(() => showToast("\u5DF2\u590D\u5236")).catch(() => showToast("\u590D\u5236\u5931\u8D25", true));
      },
      children: label
    }
  );
}
function DecTab({ meta, showToast, onSendToChat, reloadMeta }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [imgPath, setImgPath] = useState("");
  const [hot, setHot] = useState(false);
  const decodeBytes = useCallback(async (bytes) => {
    if (!meta) return;
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const base64 = arrayBufferToBase64(bytes);
      setResult(await apiDecode(meta, { imageBase64: base64 }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [meta]);
  useEffect(() => {
    const onPaste = (ev) => {
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type === "image/png" || it.type === "image/jpeg") {
          const f = it.getAsFile();
          if (f) {
            void f.arrayBuffer().then(decodeBytes);
            ev.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [decodeBytes]);
  const onDrop = (ev) => {
    ev.preventDefault();
    setHot(false);
    const f = ev.dataTransfer.files?.[0];
    if (f) void f.arrayBuffer().then(decodeBytes);
  };
  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void f.arrayBuffer().then(decodeBytes);
    };
    input.click();
  };
  const decodePath = async () => {
    if (!meta || !imgPath.trim()) return;
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      setResult(await apiDecode(meta, { imagePath: imgPath.trim() }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    !meta && /* @__PURE__ */ jsx(OfflineBanner, { reloadMeta }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: `qd-drop${hot ? " hot" : ""}`,
        onDragOver: (e) => {
          e.preventDefault();
          setHot(true);
        },
        onDragLeave: () => setHot(false),
        onDrop,
        onClick: pickFile,
        role: "button",
        tabIndex: 0,
        children: [
          busy ? "\u89E3\u7801\u4E2D\u2026" : "\u62D6\u56FE\u7247\u5230\u8FD9\u91CC / \u70B9\u51FB\u9009\u62E9 / \u76F4\u63A5 Ctrl+V \u7C98\u8D34\u622A\u56FE",
          /* @__PURE__ */ jsx("div", { className: "qd-hint", children: "\u652F\u6301 PNG / JPEG \u226410MB \u22644096\xD74096\uFF0C\u81EA\u52A8\u53CD\u8272\u68C0\u6D4B" })
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "qd-card", children: /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u8DEF\u5F84" }),
      /* @__PURE__ */ jsx("input", { className: "qd-inp", value: imgPath, onChange: (e) => setImgPath(e.target.value), placeholder: "\u6216\u8F93\u5165\u56FE\u7247\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u4E0E MCP qr_decode \u76F8\u540C\u5165\u53E3\uFF09" }),
      /* @__PURE__ */ jsx("button", { className: "qd-btn mini", onClick: () => void decodePath(), disabled: busy || !imgPath.trim(), children: "\u89E3\u7801" })
    ] }) }),
    err && /* @__PURE__ */ jsx("div", { className: "qd-err", children: err }),
    result && !result.found && /* @__PURE__ */ jsx("div", { className: "qd-ok", children: result.message || "\u672A\u627E\u5230\u4E8C\u7EF4\u7801" }),
    result?.found && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
        "\u8F7D\u8377"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
        /* @__PURE__ */ jsx("div", { className: "qd-pre", children: result.payload }),
        /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
          /* @__PURE__ */ jsx(CopyBtn, { text: result.payload || "", showToast, label: "\u590D\u5236\u8F7D\u8377" }),
          onSendToChat && /* @__PURE__ */ jsx("button", { className: "qd-btn mini ghost", onClick: () => void onSendToChat(`\u6211\u89E3\u7801\u4E86\u4E00\u4E2A\u4E8C\u7EF4\u7801\uFF08${result.format} ${result.width}\xD7${result.height}\uFF09\uFF0C\u8F7D\u8377\uFF1A

${result.payload}

\u8BF7\u5E2E\u6211\u89E3\u8BFB\u8FD9\u6BB5\u5185\u5BB9\u3002`), children: "\u53D1\u5230\u5BF9\u8BDD" }),
          /* @__PURE__ */ jsxs("span", { className: "qd-meta", style: { margin: 0 }, children: [
            result.format,
            " ",
            result.width,
            "\xD7",
            result.height
          ] })
        ] })
      ] }),
      result.inspected && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
          /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
          "\u89E3\u8BFB"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "qd-card", children: /* @__PURE__ */ jsx(KvValue, { value: result.inspected }) })
      ] })
    ] })
  ] });
}
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function KvValue({ value, depth = 0 }) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return /* @__PURE__ */ jsx("div", { className: "qd-kv sub", children: value.map((v, i) => /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(KvValue, { value: v, depth: depth + 1 }) }, i)) });
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== void 0 && v !== "");
    if (!entries.length) return null;
    return /* @__PURE__ */ jsx("div", { className: "qd-kv sub", children: entries.map(([k, v]) => /* @__PURE__ */ jsxs("div", { className: "qd-kv", children: [
      /* @__PURE__ */ jsxs("span", { className: "k", children: [
        k,
        ": "
      ] }),
      /* @__PURE__ */ jsx(KvValue, { value: v, depth: depth + 1 })
    ] }, k)) });
  }
  if (depth === 0) return /* @__PURE__ */ jsx("div", { className: "v", children: String(value) });
  return /* @__PURE__ */ jsx("span", { className: "v", children: String(value) });
}
function BatchTab({ meta, settings, saveOutDir, showToast, reloadMeta }) {
  const [mode, setMode] = useState("csv");
  const [csv, setCsv] = useState("ssid,pass\n\u5BA2\u5385,pw-123\n\u5367\u5BA4,pw-456");
  const [rowsJson, setRowsJson] = useState('[{"name":"\u5F20\u4E09","tel":"+8613800000000"}]');
  const [tplType, setTplType] = useState("wifi");
  const [fieldsJson, setFieldsJson] = useState('{\n  "ssid": "{ssid}",\n  "password": "{pass}",\n  "encryption": "WPA"\n}');
  const [outDir, setOutDir] = useState(settings.outDir);
  const [fileBase, setFileBase] = useState("qr");
  const [nameCol, setNameCol] = useState("");
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const stopPoll = useRef(false);
  useEffect(() => {
    setOutDir(settings.outDir);
  }, [settings.outDir]);
  useEffect(() => () => {
    stopPoll.current = true;
  }, []);
  const poll = useCallback(async (jobId) => {
    if (!meta) return;
    stopPoll.current = false;
    for (; ; ) {
      if (stopPoll.current) return;
      try {
        const j = await apiJob(meta, jobId);
        setJob(j);
        if (j.status !== "running") {
          if (j.status === "done") showToast(`\u6279\u91CF\u5B8C\u6210\uFF1A${j.done}/${j.total}`);
          else showToast(`\u6279\u91CF\u5931\u8D25\uFF1A${j.error || "\u672A\u77E5\u9519\u8BEF"}`, true);
          return;
        }
      } catch (e) {
        setErr(e.message);
        return;
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }, [meta, showToast]);
  const start = async () => {
    if (!meta) return;
    setBusy(true);
    setErr("");
    setJob(null);
    try {
      const body = {
        template: { type: tplType, fields: JSON.parse(fieldsJson) },
        outDir: outDir.trim(),
        fileBase,
        nameCol
      };
      if (mode === "csv") body.csv = csv;
      else body.rows = JSON.parse(rowsJson);
      const r = await apiBatchStart(meta, body);
      await poll(r.jobId);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    !meta && /* @__PURE__ */ jsx(OfflineBanner, { reloadMeta }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u884C\u6570\u636E"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsx("div", { className: "qd-row", children: /* @__PURE__ */ jsxs("div", { className: "qd-seg", children: [
        /* @__PURE__ */ jsx("button", { className: mode === "csv" ? "on" : "", onClick: () => {
          setMode("csv");
          setTplType("wifi");
          setFieldsJson('{\n  "ssid": "{ssid}",\n  "password": "{pass}",\n  "encryption": "WPA"\n}');
        }, children: "CSV" }),
        /* @__PURE__ */ jsx("button", { className: mode === "json" ? "on" : "", onClick: () => {
          setMode("json");
          setTplType("vcard");
          setFieldsJson('{\n  "name": "{name}",\n  "tel": "{tel}"\n}');
        }, children: "JSON" })
      ] }) }),
      mode === "csv" ? /* @__PURE__ */ jsx("textarea", { className: "qd-txa", rows: 5, value: csv, onChange: (e) => setCsv(e.target.value) }) : /* @__PURE__ */ jsx("textarea", { className: "qd-txa", rows: 5, value: rowsJson, onChange: (e) => setRowsJson(e.target.value) }),
      /* @__PURE__ */ jsxs("div", { className: "qd-hint", children: [
        "\u9996\u884C\u8868\u5934\uFF1Bfields \u91CC\u7528 ",
        "{\u5217\u540D}",
        " \u5F15\u7528\u6BCF\u884C\u7684\u503C"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u6A21\u677F"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u7C7B\u578B" }),
        /* @__PURE__ */ jsxs("select", { className: "qd-sel", value: tplType, onChange: (e) => setTplType(e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "text", children: "text" }),
          /* @__PURE__ */ jsx("option", { value: "url", children: "url" }),
          /* @__PURE__ */ jsx("option", { value: "wifi", children: "wifi" }),
          /* @__PURE__ */ jsx("option", { value: "vcard", children: "vcard" }),
          /* @__PURE__ */ jsx("option", { value: "otpauth", children: "otpauth" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qd-row", children: /* @__PURE__ */ jsx("textarea", { className: "qd-txa", rows: 5, value: fieldsJson, onChange: (e) => setFieldsJson(e.target.value) }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u8F93\u51FA"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u76EE\u5F55" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", value: outDir, onChange: (e) => setOutDir(e.target.value), placeholder: "\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5FC5\u586B\uFF09" }),
        /* @__PURE__ */ jsx("button", { className: "qd-btn mini ghost", onClick: () => void saveOutDir(outDir.trim()), disabled: !outDir.trim(), children: "\u5B58\u4E3A\u9ED8\u8BA4" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u524D\u7F00" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 140 }, value: fileBase, onChange: (e) => setFileBase(e.target.value) }),
        /* @__PURE__ */ jsx("span", { className: "qd-lbl", children: "\u540D\u5217" }),
        /* @__PURE__ */ jsx("input", { className: "qd-inp", style: { maxWidth: 140 }, value: nameCol, onChange: (e) => setNameCol(e.target.value), placeholder: "\u53EF\u9009\uFF1A\u7528\u4F5C\u6587\u4EF6\u540D\u7684\u5217" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qd-row", children: /* @__PURE__ */ jsx("button", { className: "qd-btn", onClick: () => void start(), disabled: busy || !meta || !outDir.trim(), children: busy ? "\u6267\u884C\u4E2D\u2026" : "\u5F00\u59CB\u6279\u91CF\u751F\u6210" }) }),
      /* @__PURE__ */ jsx("div", { className: "qd-hint", children: "\u540C\u540D\u6587\u4EF6\u81EA\u52A8 -2 \u9012\u589E\uFF0C\u6C38\u4E0D\u8986\u76D6\uFF1B\u2264500 \u884C" })
    ] }),
    err && /* @__PURE__ */ jsx("div", { className: "qd-err", children: err }),
    job && /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("b", { children: job.status === "running" ? "\u8FDB\u884C\u4E2D" : job.status === "done" ? "\u5B8C\u6210" : "\u5931\u8D25" }),
        /* @__PURE__ */ jsxs("span", { className: "qd-meta", style: { margin: 0 }, children: [
          job.done,
          "/",
          job.total
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qd-prog", children: /* @__PURE__ */ jsx("i", { style: { width: `${job.total ? Math.round(job.done / job.total * 100) : 0}%` } }) }),
      job.error && /* @__PURE__ */ jsx("div", { className: "qd-err", style: { margin: 0 }, children: job.error }),
      job.files.length > 0 && /* @__PURE__ */ jsx("div", { className: "qd-files", children: job.files.map((f) => /* @__PURE__ */ jsxs("div", { children: [
        f.file,
        "\uFF08",
        formatSize(f.bytes),
        "\uFF09"
      ] }, f.file)) })
    ] })
  ] });
}
function formatSize(n) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}
function CheckTab({ meta, showToast, reloadMeta }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!meta) return;
    setBusy(true);
    try {
      setResult(await apiSelftest(meta));
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    !meta && /* @__PURE__ */ jsx(OfflineBanner, { reloadMeta }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u8BD5\u91D1\u77F3\u81EA\u68C0"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "qd-row", children: [
        /* @__PURE__ */ jsx("button", { className: "qd-btn", onClick: () => void run(), disabled: busy || !meta, children: busy ? "\u8FD0\u884C\u4E2D\u2026" : "\u8FD0\u884C 12 \u9879\u81EA\u68C0" }),
        result && /* @__PURE__ */ jsxs("span", { className: "qd-meta", style: { margin: 0 }, children: [
          "\u901A\u8FC7 ",
          result.pass,
          "/",
          result.items.length,
          result.fail ? `\uFF0C\u5931\u8D25 ${result.fail}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "qd-hint", children: "RFC 4226/6238 OTP \u91D1\u6807 \xB7 WiFi/vCard/\u8FC1\u79FB\u7801 round-trip \xB7 \u751F\u6210\u2192PNG\u2192\u89E3\u7801\u95ED\u73AF \xB7 \u62A4\u680F\u62D2\u7EDD \xB7 CSV/\u6279\u91CF\u547D\u540D" }),
      result && /* @__PURE__ */ jsx("div", { className: "qd-kv", style: { marginTop: 8 }, children: result.items.map((it) => /* @__PURE__ */ jsxs("div", { className: `qd-chk ${it.ok ? "ok" : "bad"}`, children: [
        /* @__PURE__ */ jsx("span", { className: "st", children: it.ok ? "\u2713" : "\u2717" }),
        /* @__PURE__ */ jsx("span", { children: it.name }),
        !it.ok && /* @__PURE__ */ jsx("span", { className: "dt", children: it.detail })
      ] }, it.name)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qd-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "qd-bar" }),
      "\u9690\u79C1\u53E3\u5F84"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "qd-card", children: /* @__PURE__ */ jsx("div", { className: "qd-hint", style: { fontSize: 12, lineHeight: 1.7 }, children: "\u5168\u7A0B\u672C\u5730\u8BA1\u7B97\u96F6\u5916\u8054\uFF1B\u89E3\u7801\u7ED3\u679C\u4E0E\u751F\u6210\u8F7D\u8377\u4E0D\u843D kv\u3001\u4E0D\u8FDB\u65E5\u5FD7\uFF1Bkv \u4EC5\u5B58\u300C\u9ED8\u8BA4\u8F93\u51FA\u76EE\u5F55\u300D\u4E00\u9879\u8BBE\u7F6E\u3002 \u5BC6\u94A5\u7C7B\u8F7D\u8377\uFF08WiFi \u5BC6\u7801 / 2FA secret / \u8FC1\u79FB\u7801\uFF09\u53EA\u5728\u4F60\u4E3B\u52A8\u751F\u6210\u6216\u89E3\u7801\u65F6\u5B58\u5728\u4E8E\u5185\u5B58\u4E0E\u670D\u52A1\u54CD\u5E94\u91CC\u3002" }) })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function QrDeskEntry(props) {
  return /* @__PURE__ */ jsx2(QrDeskPanel, { ...props });
}
export {
  QrDeskEntry as default
};
