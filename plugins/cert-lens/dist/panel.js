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
var KEY_META = "cert-lens.meta";
var KEY_LAST_PARSE = "cert-lens.lastParse";
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
async function loadLastParse() {
  try {
    const v = await kvGet(KEY_LAST_PARSE);
    return typeof v === "string" ? v : null;
  } catch (_) {
    return null;
  }
}
async function saveLastParse(pem) {
  try {
    await kvSet(KEY_LAST_PARSE, pem.slice(0, 256 * 1024));
  } catch (_) {
  }
}
async function svcPost(meta, api, body) {
  const r = await fetch(`http://127.0.0.1:${meta.port}${api}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cert-lens-token": meta.token },
    body: JSON.stringify(body ?? {})
  });
  let json = null;
  try {
    json = await r.json();
  } catch (_) {
  }
  const obj = json ?? {};
  if (!r.ok || obj.ok === false) throw new Error(obj.error || `\u670D\u52A1\u8FD4\u56DE HTTP ${r.status}`);
  return json;
}
function apiParse(meta, body) {
  return svcPost(meta, "/api/parse", body);
}
function apiProbe(meta, body) {
  return svcPost(meta, "/api/probe", body);
}
function apiWatchList(meta) {
  return svcPost(meta, "/api/watch/list", {});
}
function apiWatchAdd(meta, body) {
  return svcPost(meta, "/api/watch/add", body);
}
function apiWatchRemove(meta, target) {
  return svcPost(meta, "/api/watch/remove", { target });
}
function apiWatchCheck(meta) {
  return svcPost(meta, "/api/watch/check", {});
}
function apiSelftest(meta) {
  return svcPost(meta, "/api/selftest", {});
}
async function readTextFile(path) {
  const res = await getHostInvoke()("router_dispatch", {
    req: { target: "cap.fs", payload: { action: "get_file_content", path } }
  });
  if (!res || res.ok === false) throw new Error(String(res && res.error) || "\u8BFB\u53D6\u5931\u8D25\uFF08\u5BBF\u4E3B\u6743\u9650\u6216\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF09");
  const content = String(res.result?.value ?? "");
  const compact = content.replace(/\s+/g, "");
  if (compact.length > 0 && compact.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
    try {
      const bin = atob(compact);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch (_) {
    }
  }
  return content;
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var css = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3ECFB2,#1E8F78);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;color:#06281F}
.cl-tt{flex:1;min-width:0}
.cl-tt b{font-size:15px;display:block}
.cl-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.cl-dot{width:8px;height:8px;border-radius:50%;background:#4a5160;flex-shrink:0}
.cl-dot.on{background:#3ECFB2;box-shadow:0 0 6px rgba(62,207,178,.6)}
.cl-dot.err{background:#E5484D}
.cl-tabs{display:flex;gap:4px;padding:0 16px 6px}
.cl-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.cl-tab:hover{color:#E6EAF2}
.cl-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cl-body::-webkit-scrollbar{width:9px;height:9px}
.cl-body::-webkit-scrollbar-track{background:transparent}
.cl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cl-sec{display:flex;align-items:center;gap:8px;padding:8px 16px 4px;font-size:12.5px;font-weight:700}
.cl-sec .act{margin-left:auto;display:flex;gap:6px}
.cl-inp,.cl-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.cl-inp:focus,.cl-txa:focus{border-color:#3ECFB2}
.cl-inp{flex:1;min-width:80px}
.cl-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:11.5px}
.cl-btn{background:linear-gradient(135deg,#2FB39A,#1E8F78);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cl-btn:hover{filter:brightness(1.1)}
.cl-btn:disabled{opacity:.5;cursor:default}
.cl-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.cl-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.cl-btn.danger{background:linear-gradient(135deg,#E5484D,#B03236)}
.cl-row{display:flex;gap:6px;align-items:center;padding:2px 16px;margin:3px 0;flex-wrap:wrap}
.cl-hint{color:#5B6478;font-size:11px;padding:0 16px;margin:2px 0}
.cl-meta{color:#8B95A7;font-size:11px;margin:4px 16px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.cl-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace}
.cl-note{background:rgba(91,157,255,.08);border:1px solid rgba(91,157,255,.3);color:#9EC1FF;border-radius:9px;padding:7px 11px;font-size:11.5px;margin:6px 16px}
.cl-card{background:#12161F;border:1px solid #232A38;border-radius:11px;padding:10px 12px;margin:8px 16px}
.cl-card .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-card .hd b{font-size:13px}
.cl-badge{font-size:10px;padding:2px 8px;border-radius:7px;font-weight:600;white-space:nowrap}
.cl-badge.expired{background:rgba(229,72,77,.18);color:#F2A0A3}
.cl-badge.crit{background:rgba(229,72,77,.18);color:#F2A0A3}
.cl-badge.warn{background:rgba(229,160,72,.15);color:#E5A048}
.cl-badge.info{background:rgba(91,157,255,.14);color:#9EC1FF}
.cl-badge.ok{background:rgba(62,207,178,.12);color:#7BDCC4}
.cl-kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11.5px;margin-top:7px}
.cl-kv .k{color:#5B6478;white-space:nowrap}
.cl-kv .v{color:#C7CFDE;word-break:break-all;font-family:Consolas,Menlo,monospace;font-size:11px}
.cl-findings{margin-top:8px;border-top:1px solid #1E2530;padding-top:6px}
.cl-f{display:flex;gap:6px;font-size:11.5px;padding:2.5px 0;align-items:baseline}
.cl-f .ic{flex-shrink:0;font-weight:700}
.cl-f.crit .ic{color:#E5484D}
.cl-f.crit .t{color:#F2A0A3}
.cl-f.warn .ic{color:#E5A048}
.cl-f.warn .t{color:#E5C08A}
.cl-f.info .ic{color:#5B7AAB}
.cl-f.info .t{color:#9BA7BD}
.cl-f.ok .ic{color:#3ECFB2}
.cl-f.ok .t{color:#7BDCC4}
.cl-f .d{color:#5B6478;font-size:11px;display:block}
.cl-diag{background:rgba(229,72,77,.07);border:1px solid rgba(229,72,77,.3);border-radius:10px;padding:9px 11px;margin:7px 16px}
.cl-diag b{font-size:12.5px;color:#F2A0A3}
.cl-diag .cause{color:#C7CFDE;font-size:11.5px;margin-top:3px}
.cl-diag ol{margin:5px 0 0;padding-left:18px;color:#B9C2D4;font-size:11.5px}
.cl-diag ol li{margin:2px 0}
.cl-chip{background:#0E1219;border:1px solid #232A38;color:#8B95A7;font-size:11px;font-family:Consolas,Menlo,monospace;padding:3px 8px;border-radius:7px}
.cl-table{margin:6px 16px;border:1px solid #232A38;border-radius:10px;overflow:hidden}
.cl-tr{display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #1E2530;font-size:12px}
.cl-tr:last-child{border-bottom:none}
.cl-tr .tgt{font-family:Consolas,Menlo,monospace;color:#E6EAF2;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-tr .cn{color:#5B6478;font-size:10.5px}
.cl-tr .btns{display:flex;gap:4px}
.cl-st-pass{color:#3ECFB2}
.cl-st-fail{color:#F2A0A3}
.cl-empty{color:#5B6478;font-size:12px;text-align:center;padding:20px 16px}
.cl-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:cl-spin .8s linear infinite;vertical-align:-2px}
@keyframes cl-spin{to{transform:rotate(360deg)}}
.cl-chainpath{display:flex;align-items:center;gap:6px;margin:6px 16px;font-size:11px;color:#8B95A7;flex-wrap:wrap}
.cl-chainpath .node{background:#0E1219;border:1px solid #2C3547;border-radius:7px;padding:3px 9px;font-family:Consolas,Menlo,monospace;color:#C7CFDE;cursor:pointer}
.cl-chainpath .node:hover{border-color:#3ECFB2;color:#E6EAF2}
.cl-chainpath .arr{color:#3ECFB2}
`;
function sevBadge(daysLeft) {
  if (daysLeft == null) return { cls: "crit", text: "\u65E0\u6CD5\u53D6\u5F97" };
  if (daysLeft < 0) return { cls: "expired", text: `\u5DF2\u8FC7\u671F ${-daysLeft} \u5929` };
  if (daysLeft <= 7) return { cls: "crit", text: `${daysLeft} \u5929\u5230\u671F` };
  if (daysLeft <= 30) return { cls: "warn", text: `${daysLeft} \u5929\u5230\u671F` };
  if (daysLeft <= 90) return { cls: "info", text: `${daysLeft} \u5929\u5230\u671F` };
  return { cls: "ok", text: `${daysLeft} \u5929` };
}
var F_ICON = { crit: "\u2717", warn: "\u25B2", info: "\u2139", ok: "\u2713" };
function Findings({ items }) {
  const shown = items.filter((f) => f.severity !== "ok" || f.id.startsWith("key.") || f.id.startsWith("sig."));
  if (!shown.length) return null;
  return /* @__PURE__ */ jsx("div", { className: "cl-findings", children: shown.map((f) => /* @__PURE__ */ jsxs("div", { className: `cl-f ${f.severity}`, children: [
    /* @__PURE__ */ jsx("span", { className: "ic", children: F_ICON[f.severity] || "\xB7" }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("span", { className: "t", children: f.title }),
      f.detail ? /* @__PURE__ */ jsx("span", { className: "d", children: f.detail }) : null
    ] })
  ] }, f.id + f.title)) });
}
function fmtDate(iso) {
  return String(iso || "").replace("T", " ").slice(0, 19) + " UTC";
}
function CertCard({ c }) {
  const badge = sevBadge(c.daysLeft);
  const sanAll = [...c.san?.dns || [], ...c.san?.ips || []];
  return /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "hd", children: [
      /* @__PURE__ */ jsx("b", { children: c.cn || c.subjectText.slice(0, 40) }),
      c.isCA ? /* @__PURE__ */ jsx("span", { className: "cl-badge info", children: "CA \u8BC1\u4E66" }) : null,
      c.selfSigned ? /* @__PURE__ */ jsx("span", { className: "cl-badge info", children: "\u81EA\u7B7E" }) : null,
      /* @__PURE__ */ jsx("span", { className: `cl-badge ${badge.cls}`, children: badge.text }),
      c.findingsSeverity === "crit" ? /* @__PURE__ */ jsx("span", { className: "cl-badge crit", children: "\u6709 crit \u95EE\u9898" }) : c.findingsSeverity === "warn" ? /* @__PURE__ */ jsx("span", { className: "cl-badge warn", children: "\u6709\u8B66\u544A" }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-kv", children: [
      /* @__PURE__ */ jsx("span", { className: "k", children: "\u6709\u6548\u671F" }),
      /* @__PURE__ */ jsxs("span", { className: "v", children: [
        fmtDate(c.notBefore),
        " \u2192 ",
        fmtDate(c.notAfter),
        "\uFF08\u7B7E\u53D1\u8DE8\u5EA6 ",
        c.validityDays,
        " \u5929\uFF09"
      ] }),
      /* @__PURE__ */ jsx("span", { className: "k", children: "SAN" }),
      /* @__PURE__ */ jsx("span", { className: "v", children: sanAll.length ? sanAll.join("\u3001") : "\uFF08\u65E0\u2014\u2014\u73B0\u4EE3\u5BA2\u6237\u7AEF\u53EA\u770B SAN\uFF09" }),
      /* @__PURE__ */ jsx("span", { className: "k", children: "\u5BC6\u94A5" }),
      /* @__PURE__ */ jsxs("span", { className: "v", children: [
        c.keyInfo.algo,
        c.keyInfo.bits ? `-${c.keyInfo.bits}` : "",
        c.keyInfo.curve ? `\uFF08${c.keyInfo.curve}\uFF09` : ""
      ] }),
      /* @__PURE__ */ jsx("span", { className: "k", children: "\u7B7E\u540D" }),
      /* @__PURE__ */ jsx("span", { className: "v", children: c.sigAlg || "\u672A\u77E5" }),
      /* @__PURE__ */ jsx("span", { className: "k", children: "\u7B7E\u53D1\u8005" }),
      /* @__PURE__ */ jsx("span", { className: "v", children: c.issuerText.replace(/\n/g, " / ") }),
      /* @__PURE__ */ jsx("span", { className: "k", children: "\u6307\u7EB9" }),
      /* @__PURE__ */ jsx("span", { className: "v", title: "\u70B9\u51FB\u590D\u5236 SHA-256 \u6307\u7EB9", style: { cursor: "pointer" }, onClick: () => navigator.clipboard?.writeText(c.sha256Fp), children: c.sha256Fp }),
      (c.extKeyUsage || []).length ? /* @__PURE__ */ jsx("span", { className: "k", children: "\u7528\u9014" }) : null,
      (c.extKeyUsage || []).length ? /* @__PURE__ */ jsx("span", { className: "v", children: c.extKeyUsage.join(", ") }) : null
    ] }),
    /* @__PURE__ */ jsx(Findings, { items: c.findings || [] })
  ] });
}
function DiagnosisCards({ items }) {
  if (!items.length) return null;
  return /* @__PURE__ */ jsx(Fragment, { children: items.map((d, i) => /* @__PURE__ */ jsxs("div", { className: "cl-diag", children: [
    /* @__PURE__ */ jsxs("b", { children: [
      "[",
      d.severity,
      "] ",
      d.title
    ] }),
    d.cause ? /* @__PURE__ */ jsx("div", { className: "cause", children: d.cause }) : null,
    d.fixes.length ? /* @__PURE__ */ jsx("ol", { children: d.fixes.map((f, j) => /* @__PURE__ */ jsx("li", { children: f }, j)) }) : null
  ] }, d.from + d.id + i)) });
}
function Panel(_props) {
  const [meta, setMeta] = useState(null);
  const [svcState, setSvcState] = useState("off");
  const [tab, setTab] = useState("parse");
  const [probeSeed, setProbeSeed] = useState("");
  useEffect(() => {
    let alive = true;
    getMeta().then((m) => {
      if (!alive) return;
      if (m) {
        setMeta(m);
        setSvcState("on");
      } else {
        setSvcState("err");
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "cl-root", children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    /* @__PURE__ */ jsxs("div", { className: "cl-top", children: [
      /* @__PURE__ */ jsx("div", { className: "cl-logo", children: "\u{1F512}" }),
      /* @__PURE__ */ jsxs("div", { className: "cl-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "TLS \u8BC1\u4E66\u8C03\u8BD5\u53F0" }),
        /* @__PURE__ */ jsx("small", { children: meta ? `service v${meta.version} \xB7 127.0.0.1:${meta.port}` : "\u7B49\u5F85\u672C\u5730\u670D\u52A1\u2026" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: `cl-dot ${svcState === "on" ? "on" : svcState === "err" ? "err" : ""}`, title: svcState === "on" ? "\u670D\u52A1\u5728\u7EBF" : "\u670D\u52A1\u79BB\u7EBF\uFF08\u5B89\u88C5\u540E\u542F\u52A8\u4E00\u6B21\u63D2\u4EF6\u9762\u677F\u53EF\u91CD\u8BD5\uFF09" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "cl-tabs", children: ["parse", "probe", "watch", "selftest"].map((t) => /* @__PURE__ */ jsx("button", { className: `cl-tab ${tab === t ? "on" : ""}`, onClick: () => setTab(t), children: t === "parse" ? "\u8BC1\u4E66\u89E3\u6790" : t === "probe" ? "\u8FDE\u63A5\u8BCA\u65AD" : t === "watch" ? "\u5230\u671F\u76EF\u5B88" : "\u8BD5\u91D1\u77F3" }, t)) }),
    /* @__PURE__ */ jsx("div", { className: "cl-body", children: !meta ? /* @__PURE__ */ jsx("div", { className: "cl-empty", children: svcState === "err" ? "\u672C\u5730\u670D\u52A1\u672A\u5C31\u7EEA\uFF08cap.kv \u6865\u964D\u7EA7\u6216\u670D\u52A1\u672A\u542F\u52A8\uFF09\u3002\u8BF7\u786E\u8BA4\u63D2\u4EF6\u5DF2\u542F\u7528\uFF0C\u7A0D\u540E\u91CD\u8BD5\u3002" : "\u8FDE\u63A5\u672C\u5730\u670D\u52A1\u4E2D\u2026" }) : tab === "parse" ? /* @__PURE__ */ jsx(ParseTab, { meta }) : tab === "probe" ? /* @__PURE__ */ jsx(ProbeTab, { meta, seed: probeSeed }) : tab === "watch" ? /* @__PURE__ */ jsx(WatchTab, { meta, onDiagnose: (t) => {
      setProbeSeed(t);
      setTab("probe");
    } }) : /* @__PURE__ */ jsx(SelftestTab, { meta }) })
  ] });
}
function ParseTab({ meta }) {
  const [pem, setPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    loadLastParse().then((v) => {
      if (v) setPem(v);
    });
  }, []);
  const doParse = useCallback(async () => {
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      const r = await apiParse(meta, { pem, key: keyPem || void 0, host: host || void 0 });
      setRes(r);
      saveLastParse(pem);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta, pem, keyPem, host]);
  const loadFile = useCallback(async (target) => {
    const path = window.prompt("\u8BC1\u4E66\u6587\u4EF6\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 C:\\nginx\\conf\\fullchain.pem\uFF09\uFF1A");
    if (!path) return;
    try {
      const text = await readTextFile(path);
      if (target === "pem") setPem(text);
      else {
        setKeyPem(text);
        setShowKey(true);
      }
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);
  const order = res?.chain ? res.chain.ordered : res ? res.certs.map((_, i) => i) : [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
      "\u8BC1\u4E66\u8F93\u5165\uFF08PEM\uFF1B\u6574\u6761\u94FE\u4E00\u8D77\u7C98\uFF09",
      /* @__PURE__ */ jsxs("span", { className: "act", children: [
        /* @__PURE__ */ jsx("button", { className: "cl-btn ghost mini", onClick: () => loadFile("pem"), children: "\u8F7D\u5165\u6587\u4EF6" }),
        /* @__PURE__ */ jsx("button", { className: "cl-btn ghost mini", onClick: () => {
          setPem("");
          setRes(null);
          setErr("");
        }, children: "\u6E05\u7A7A" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "cl-row", children: /* @__PURE__ */ jsx("textarea", { className: "cl-txa", rows: 7, placeholder: "-----BEGIN CERTIFICATE-----\n\u2026\n-----END CERTIFICATE-----\n\uFF08\u53EF\u591A\u5757\uFF1A\u53F6\u2192\u4E2D\u95F4\u2192\u6839\uFF1B\u4E5F\u63A5\u53D7\u516C\u94A5\u5757\uFF1B\u524D\u540E\u5783\u573E\u6587\u672C\u81EA\u52A8\u5FFD\u7565\uFF09", value: pem, onChange: (e) => setPem(e.target.value) }) }),
    /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
      /* @__PURE__ */ jsxs("button", { className: "cl-btn ghost mini", onClick: () => setShowKey(!showKey), children: [
        showKey ? "\u25BE" : "\u25B8",
        " \u914D\u5BF9\u68C0\u67E5\uFF08\u53EF\u9009\u79C1\u94A5\uFF09"
      ] }),
      /* @__PURE__ */ jsx("input", { className: "cl-inp", style: { maxWidth: 220 }, placeholder: "\u6838\u5BF9 SAN \u7684\u4E3B\u673A\u540D/IP\uFF08\u53EF\u9009\uFF09", value: host, onChange: (e) => setHost(e.target.value) })
    ] }),
    showKey ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "cl-row", children: /* @__PURE__ */ jsx("textarea", { className: "cl-txa", rows: 4, placeholder: "-----BEGIN PRIVATE KEY-----\n\u2026\n-----END PRIVATE KEY-----\n\uFF08\u53EA\u5728\u5185\u5B58\u6BD4\u5BF9\u5373\u5F03\uFF0C\u4E0D\u843D\u76D8\u4E0D\u843D\u65E5\u5FD7\uFF09", value: keyPem, onChange: (e) => setKeyPem(e.target.value) }) }),
      /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
        /* @__PURE__ */ jsx("button", { className: "cl-btn ghost mini", onClick: () => loadFile("key"), children: "\u8F7D\u5165\u79C1\u94A5\u6587\u4EF6" }),
        /* @__PURE__ */ jsx("button", { className: "cl-btn ghost mini", onClick: () => setKeyPem(""), children: "\u6E05\u7A7A\u79C1\u94A5" })
      ] })
    ] }) : null,
    /* @__PURE__ */ jsx("div", { className: "cl-row", children: /* @__PURE__ */ jsxs("button", { className: "cl-btn", disabled: busy || !pem.trim(), onClick: doParse, children: [
      busy ? /* @__PURE__ */ jsx("span", { className: "cl-spin" }) : "\u{1F50D}",
      " \u89E3\u6790\u5E76\u4F53\u68C0"
    ] }) }),
    err ? /* @__PURE__ */ jsx("div", { className: "cl-err", children: err }) : null,
    res ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "cl-meta", children: [
        "\u8BC1\u4E66 ",
        res.kind.certs,
        " \u5F20",
        res.kind.pubkeys ? ` \xB7 \u516C\u94A5 ${res.kind.pubkeys}` : "",
        res.chain && res.chain.issues.length ? ` \xB7 \u94FE\u95EE\u9898 ${res.chain.issues.length}` : ""
      ] }),
      order.length > 1 ? /* @__PURE__ */ jsxs("div", { className: "cl-chainpath", children: [
        "\u94FE\u5E8F\uFF1A",
        order.map((idx, i) => /* @__PURE__ */ jsxs("span", { style: { display: "contents" }, children: [
          i > 0 ? /* @__PURE__ */ jsx("span", { className: "arr", children: "\u2190" }) : null,
          /* @__PURE__ */ jsx("span", { className: "node", children: res.certs[idx].cn || `#${idx + 1}` })
        ] }, idx)),
        res.chain?.rootFound ? /* @__PURE__ */ jsx("span", { className: "cl-badge ok", children: "\u81EA\u7B7E\u6839" }) : null
      ] }) : null,
      order.map((idx) => /* @__PURE__ */ jsx(CertCard, { c: res.certs[idx] }, idx)),
      /* @__PURE__ */ jsx(DiagnosisCards, { items: res.chainFindings.filter((f) => f.severity !== "ok").map((f) => ({ from: "chain", id: f.id, severity: f.severity, title: f.title, cause: f.detail, fixes: f.fix ? [f.fix] : [] })) }),
      res.keyMatch ? /* @__PURE__ */ jsx("div", { className: `cl-note`, children: res.keyMatch.matched ? `\u2713 \u79C1\u94A5\u914D\u5BF9\uFF1A\u5339\u914D\uFF08${res.keyMatch.keyInfo ? `${res.keyMatch.keyInfo.algo}-${res.keyMatch.keyInfo.bits}` : ""}\uFF09` : `\u2717 \u79C1\u94A5\u914D\u5BF9\uFF1A\u4E0D\u5339\u914D\u2014\u2014${res.keyMatch.error}` }) : null,
      ["csrNote", "crlNote", "encryptedKeyNote", "privkeyNote"].map((k) => res[k] ? /* @__PURE__ */ jsxs("div", { className: "cl-note", children: [
        "\u2139 ",
        res[k]
      ] }, k) : null),
      res.errors.map((e, i) => /* @__PURE__ */ jsxs("div", { className: "cl-err", children: [
        "\u5757 ",
        e.index + 1,
        e.label ? `\uFF08${e.label}\uFF09` : "",
        "\uFF1A",
        e.error
      ] }, i))
    ] }) : null
  ] });
}
function ProbeTab({ meta, seed }) {
  const [target, setTarget] = useState("");
  const [sni, setSni] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const historyRef = useRef([]);
  const doProbe = useCallback(async (t) => {
    const tgt = (t ?? target).trim();
    if (!tgt) return;
    if (t && !historyRef.current.includes(tgt)) historyRef.current = [tgt, ...historyRef.current].slice(0, 6);
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      const r = await apiProbe(meta, { target: tgt, serverName: sni || void 0 });
      setRes(r);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta, target, sni]);
  useEffect(() => {
    if (seed) {
      setTarget(seed);
      doProbe(seed);
    }
  }, [seed]);
  const order = res ? res.chainAudit.ordered.length ? res.chainAudit.ordered : res.chain.map((_, i) => i) : [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "cl-sec", children: "\u76EE\u6807\uFF08host:port\uFF0C\u7F3A\u7701 443\uFF1B\u53EF\u63A2\u6D4B\u5185\u7F51/\u81EA\u7B7E\u7AEF\u70B9\uFF09" }),
    /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "cl-inp",
          placeholder: "example.com \u6216 192.168.1.10:8443 \u6216 [::1]:443",
          value: target,
          onChange: (e) => setTarget(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") doProbe();
          }
        }
      ),
      /* @__PURE__ */ jsxs("button", { className: "cl-btn", disabled: busy || !target.trim(), onClick: () => doProbe(), children: [
        busy ? /* @__PURE__ */ jsx("span", { className: "cl-spin" }) : "\u{1F4E1}",
        " \u63A2\u6D4B"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
      /* @__PURE__ */ jsx("input", { className: "cl-inp", style: { maxWidth: 220 }, placeholder: "SNI/\u6821\u9A8C\u57DF\u540D\uFF08\u53EF\u9009\uFF0C\u8C03\u8BD5 CDN \u8DEF\u7531\uFF09", value: sni, onChange: (e) => setSni(e.target.value) }),
      historyRef.current.map((h) => /* @__PURE__ */ jsx("button", { className: "cl-chip", style: { cursor: "pointer" }, onClick: () => {
        setTarget(h);
        doProbe(h);
      }, children: h }, h))
    ] }),
    err ? /* @__PURE__ */ jsx("div", { className: "cl-err", children: err }) : null,
    res ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "cl-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "hd", children: [
          /* @__PURE__ */ jsxs("b", { children: [
            res.target.host,
            ":",
            res.target.port
          ] }),
          /* @__PURE__ */ jsx("span", { className: `cl-badge ${res.verified ? "ok" : res.connected ? "crit" : "crit"}`, children: res.verified ? "\u2713 \u4FE1\u4EFB\u94FE\u6821\u9A8C\u901A\u8FC7" : res.connected ? "\u2717 \u6821\u9A8C\u5931\u8D25\uFF08\u94FE\u5DF2\u53D6\u5F97\uFF09" : "\u2717 \u672A\u5B8C\u6210\u63E1\u624B" }),
          /* @__PURE__ */ jsxs("span", { style: { color: "#5B6478", fontSize: 11 }, children: [
            res.ms,
            "ms"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "cl-kv", children: [
          /* @__PURE__ */ jsx("span", { className: "k", children: "\u534F\u5546" }),
          /* @__PURE__ */ jsx("span", { className: "v", children: res.relaxed ? `${res.relaxed.protocol} \xB7 ${res.relaxed.cipher?.name || "?"}${res.relaxed.alpn ? ` \xB7 ALPN ${res.relaxed.alpn}` : ""}` : "\u2014" }),
          /* @__PURE__ */ jsx("span", { className: "k", children: "\u4E3B\u673A\u5339\u914D" }),
          /* @__PURE__ */ jsxs("span", { className: "v", children: [
            res.hostMatch.matched === true ? "\u2713 " : res.hostMatch.matched === false ? "\u2717 " : "",
            res.hostMatch.reason
          ] }),
          res.strict.error ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "k", children: "\u6821\u9A8C\u9519\u8BEF" }),
            /* @__PURE__ */ jsxs("span", { className: "v", children: [
              res.strict.error.code,
              "\uFF1A",
              res.strict.error.message.slice(0, 120)
            ] })
          ] }) : null
        ] })
      ] }),
      /* @__PURE__ */ jsx(DiagnosisCards, { items: res.diagnosis }),
      res.chain.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
          "\u5B9E\u9645\u6536\u5230\u7684\u94FE\uFF08",
          res.chain.length,
          " \u7EA7\uFF0C\u53F6\u5728\u524D\uFF09"
        ] }),
        order.map((idx) => /* @__PURE__ */ jsx(CertCard, { c: res.chain[idx] }, idx))
      ] }) : null
    ] }) : null
  ] });
}
function WatchTab({ meta, onDiagnose }) {
  const [data, setData] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [degraded, setDegraded] = useState("");
  const refresh = useCallback(async () => {
    try {
      const d = await apiWatchList(meta);
      setData(d);
      setDegraded("");
    } catch (e) {
      setDegraded(`\u76EF\u5B88\u6E05\u5355\u4F9D\u8D56 cap.kv \u6865\uFF1A${String(e.message || e).slice(0, 160)}`);
    }
  }, [meta]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const add = useCallback(async () => {
    if (!input.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const d = await apiWatchAdd(meta, { target: input.trim() });
      setData(d);
      setInput("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta, input]);
  const remove = useCallback(async (target) => {
    setBusy(true);
    try {
      const d = await apiWatchRemove(meta, target);
      setData(d);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta]);
  const checkAll = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const d = await apiWatchCheck(meta);
      setData(d);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta]);
  const rows = data?.state?.results ? [...data.state.results].sort((a, b) => {
    const da = a.daysLeft == null ? -1e9 : a.daysLeft;
    const db = b.daysLeft == null ? -1e9 : b.daysLeft;
    return da - db;
  }) : [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
      "\u7AEF\u70B9\u6E05\u5355\uFF08\u5B58 cap.kv\uFF1B\u9762\u677F\u5168\u68C0 + MCP cert_expiry_check \u53EF\u590D\u7528\uFF09",
      /* @__PURE__ */ jsx("span", { className: "act", children: /* @__PURE__ */ jsxs("button", { className: "cl-btn mini", disabled: busy, onClick: checkAll, children: [
        busy ? /* @__PURE__ */ jsx("span", { className: "cl-spin" }) : "\u27F3",
        " \u5168\u90E8\u68C0\u67E5"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cl-row", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "cl-inp",
          placeholder: "\u6DFB\u52A0\u7AEF\u70B9\uFF1Ahost:port\uFF08\u5982 api.example.com:443\uFF09",
          value: input,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") add();
          }
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "cl-btn mini", disabled: busy || !input.trim(), onClick: add, children: "\u6DFB\u52A0" })
    ] }),
    degraded ? /* @__PURE__ */ jsxs("div", { className: "cl-note", children: [
      "\u2139 ",
      degraded,
      "\uFF08\u89E3\u6790\u4E0E\u8BCA\u65AD\u4E0D\u53D7\u5F71\u54CD\uFF09"
    ] }) : null,
    err ? /* @__PURE__ */ jsx("div", { className: "cl-err", children: err }) : null,
    data?.state?.checkedAt ? /* @__PURE__ */ jsxs("div", { className: "cl-meta", children: [
      "\u4E0A\u6B21\u5168\u68C0\uFF1A",
      fmtDate(data.state.checkedAt)
    ] }) : null,
    rows.length ? /* @__PURE__ */ jsx("div", { className: "cl-table", children: rows.map((r, i) => {
      const badge = sevBadge(r.daysLeft);
      return /* @__PURE__ */ jsxs("div", { className: "cl-tr", children: [
        /* @__PURE__ */ jsx("span", { className: `cl-badge ${r.daysLeft == null ? "crit" : badge.cls}`, children: r.daysLeft == null ? r.errorCode || "\u5931\u8D25" : badge.text }),
        /* @__PURE__ */ jsxs("span", { className: "tgt", children: [
          r.host,
          ":",
          r.port,
          r.label && r.label !== `${r.host}:${r.port}` ? ` \xB7 ${r.label}` : ""
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "cn", children: [
          r.cn || "",
          r.daysLeft != null ? ` \xB7 ${fmtDate(r.notAfter).slice(0, 10)}` : ""
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "btns", children: [
          /* @__PURE__ */ jsx("button", { className: "cl-btn ghost mini", onClick: () => onDiagnose(`${r.host}:${r.port}`), title: "\u5230\u8BCA\u65AD\u9875\u63A2\u6D4B", children: "\u8BCA\u65AD" }),
          /* @__PURE__ */ jsx("button", { className: "cl-btn danger mini", onClick: () => remove(`${r.host}:${r.port}`), children: "\u5220\u9664" })
        ] })
      ] }, `${r.host}:${r.port}`);
    }) }) : /* @__PURE__ */ jsx("div", { className: "cl-empty", children: data?.endpoints?.length ? "\u7AEF\u70B9\u5DF2\u5C31\u7EEA\uFF0C\u70B9\u300C\u5168\u90E8\u68C0\u67E5\u300D\u505A\u9996\u6B21\u5DE1\u68C0\u3002" : "\u8FD8\u6CA1\u6709\u76EF\u5B88\u7AEF\u70B9\u3002\u6DFB\u52A0 host:port \u540E\u4E00\u952E\u5168\u68C0\uFF0C\u5230\u671F \u226430 \u5929\u9EC4\u8272 / \u22647 \u5929\u7EA2\u8272\u544A\u8B66\u3002" }),
    /* @__PURE__ */ jsx("div", { className: "cl-hint", children: "\u53E3\u5F84\uFF1A\u5168\u68C0\u662F\u5BF9\u6BCF\u4E2A\u7AEF\u70B9\u505A\u4E00\u6B21\u771F\u5B9E TLS \u63E1\u624B\u53D6\u53F6\u8BC1\u4E66\u5230\u671F\u65F6\u95F4\uFF08\u5E76\u53D1 4\uFF0C\u8D85\u65F6 8s/\u4E2A\uFF09\uFF1B\u7ED3\u679C\u843D cap.kv \u4F9B MCP cert_expiry_check \u590D\u7528\u3002" })
  ] });
}
function SelftestTab({ meta }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      setRes(await apiSelftest(meta));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }, [meta]);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "cl-sec", children: [
      "\u8BD5\u91D1\u77F3\uFF08fixture \u8BC1\u4E66\u77E9\u9635 + \u672C\u5730 hermetic TLS \u670D\u52A1\u5668\u5168\u94FE\u8DEF\uFF09",
      /* @__PURE__ */ jsx("span", { className: "act", children: /* @__PURE__ */ jsxs("button", { className: "cl-btn mini", disabled: busy, onClick: run, children: [
        busy ? /* @__PURE__ */ jsx("span", { className: "cl-spin" }) : "\u25B6",
        " \u8FD0\u884C\u81EA\u68C0"
      ] }) })
    ] }),
    err ? /* @__PURE__ */ jsx("div", { className: "cl-err", children: err }) : null,
    res ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "cl-meta", children: [
        "\u7ED3\u679C\uFF1A",
        /* @__PURE__ */ jsxs("span", { className: res.fail === 0 ? "cl-st-pass" : "cl-st-fail", children: [
          res.pass,
          "/",
          res.total,
          " \u901A\u8FC7",
          res.fail ? `\uFF08fail=${res.fail}\uFF09` : "\uFF0C\u5168\u90E8\u5065\u5EB7"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "cl-table", children: res.results.map((r) => /* @__PURE__ */ jsxs("div", { className: "cl-tr", children: [
        /* @__PURE__ */ jsx("span", { className: r.pass ? "cl-st-pass" : "cl-st-fail", children: r.pass ? "\u2713" : "\u2717" }),
        /* @__PURE__ */ jsx("span", { className: "tgt", children: r.name }),
        /* @__PURE__ */ jsx("span", { className: "cn", children: r.pass ? "" : r.detail || "" })
      ] }, r.name)) })
    ] }) : /* @__PURE__ */ jsx("div", { className: "cl-empty", children: "\u81EA\u68C0\u8986\u76D6\uFF1A\u89E3\u6790\u77E9\u9635 / \u94FE\u62FC\u88C5 / \u914D\u5BF9 / \u9519\u8BEF\u6620\u5C04 / \u672C\u5730 TLS \u670D\u52A1\u5668\u63E1\u624B\u3002\u670D\u52A1\u5F02\u5E38\u65F6\u5148\u8DD1\u8FD9\u91CC\u5B9A\u4F4D\u3002" })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function CertLensEntry(props) {
  return /* @__PURE__ */ jsx2(Panel, { ...props });
}
export {
  CertLensEntry as default
};
