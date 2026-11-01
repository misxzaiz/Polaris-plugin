var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/host.ts
var host_exports = {};
__export(host_exports, {
  getHostInvoke: () => getHostInvoke
});
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect4, useRef, useState as useState7 } from "react";

// src/model.ts
init_host();
var PLUGIN_ID = "domain-probe";
var SERVICE_ID = "domain-probe-service";
async function capDispatch(target, payload) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
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
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
var loadMeta = () => kvGet("dom.meta");
var loadLatest = () => kvGet("dom.latest");
var loadHistory = () => kvGet("dom.history");
var loadReport = (runId) => kvGet(`dom.report.${runId}`);
var nonceCounter = 0;
function newNonce() {
  return `p${Date.now().toString(36)}-${++nonceCounter}`;
}
async function sendCommand(action, payload, waitMs = 15e4) {
  const nonce = newNonce();
  await kvSet("dom.cmd", { nonce, action, payload, at: (/* @__PURE__ */ new Date()).toISOString() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const res = await kvGet("dom.res");
    if (res && res.nonce === nonce) {
      await capDispatch("cap.kv", { action: "delete", key: "dom.res" }).catch(() => {
      });
      return res.result;
    }
  }
  throw new Error(`\u547D\u4EE4 ${action} \u7B49\u5F85\u8D85\u65F6\uFF08\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF1A\u8BBE\u7F6E\u2192\u63D2\u4EF6\u2192\u57DF\u540D\u8BCA\u65AD\u53F0 \u67E5\u770B\u670D\u52A1\u72B6\u6001\uFF09`);
}
var requestState = () => sendCommand("get_state", {}, 2e4);
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  const arr = Array.isArray(r) ? r : r?.services ?? [];
  return arr.filter((s) => s && s.pluginId === PLUGIN_ID);
}
async function startSelfService() {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const self = (r.plugins ?? []).find((p) => p.id === PLUGIN_ID);
  if (!self) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230\u672C\u63D2\u4EF6\uFF08\u8BF7\u786E\u8BA4\u5DF2\u5B89\u88C5/\u542F\u7528\uFF09");
  const svc = self.contributes?.services?.find((s) => s.id === SERVICE_ID);
  if (!svc) throw new Error("\u6E05\u5355\u91CC\u6CA1\u6709\u670D\u52A1\u8D21\u732E\uFF08\u5B89\u88C5\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u88C5\u63D2\u4EF6\uFF09");
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType,
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 3,
      description: svc.description ?? null
    }
  });
}
var stopSelfService = () => capDispatch("cap.pluginServiceManager", { action: "stop", pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
var restartSelfService = () => capDispatch("cap.pluginServiceManager", { action: "restart", pluginId: PLUGIN_ID, serviceId: SERVICE_ID });

// src/DiagnoseTab.tsx
import { useEffect, useState as useState2 } from "react";

// src/ReportView.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var SEV_COLOR = { red: "#F85149", yellow: "#E3B341", info: "#8B95A7", green: "#3FB950" };
var SEV_BG = { red: "rgba(248,81,73,.08)", yellow: "rgba(227,179,65,.08)", info: "transparent", green: "rgba(63,185,80,.06)" };
var SEV_TEXT = { red: "\u7EA2", yellow: "\u9EC4", info: "\u4FE1\u606F", green: "\u6B63\u5E38" };
var KIND_CN = { full: "\u5168\u9762\u4F53\u68C0", email: "\u90AE\u4EF6\u8EAB\u4EFD", cert: "\u8BC1\u4E66", lookup: "\u5355\u67E5\u8BE2" };
function ScoreRing({ total, tone }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const color = tone === "good" ? "#3FB950" : tone === "ok" ? "#58A6FF" : tone === "warn" ? "#E3B341" : "#F85149";
  return /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }, children: /* @__PURE__ */ jsxs("svg", { width: "66", height: "66", viewBox: "0 0 66 66", children: [
    /* @__PURE__ */ jsx("circle", { cx: "33", cy: "33", r: R, fill: "none", stroke: "#242C3A", strokeWidth: "6" }),
    /* @__PURE__ */ jsx(
      "circle",
      {
        cx: "33",
        cy: "33",
        r: R,
        fill: "none",
        stroke: color,
        strokeWidth: "6",
        strokeLinecap: "round",
        strokeDasharray: `${C * Math.max(0, Math.min(100, total)) / 100} ${C}`,
        transform: "rotate(-90 33 33)"
      }
    ),
    /* @__PURE__ */ jsx("text", { x: "33", y: "38", textAnchor: "middle", fill: color, fontSize: "17", fontWeight: "700", children: total })
  ] }) });
}
function FindingRow({ f }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(f.detail || f.fix);
  return /* @__PURE__ */ jsxs("div", { style: { background: SEV_BG[f.sev], borderLeft: `3px solid ${SEV_COLOR[f.sev]}`, borderRadius: 7, padding: "8px 10px", marginBottom: 6 }, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        style: { display: "flex", gap: 7, alignItems: "baseline", cursor: hasDetail ? "pointer" : "default" },
        onClick: () => hasDetail && setOpen(!open),
        children: [
          /* @__PURE__ */ jsx("span", { style: { color: SEV_COLOR[f.sev], fontWeight: 700, fontSize: 11, flexShrink: 0 }, children: f.sev === "red" ? "\u7EA2" : f.sev === "yellow" ? "\u9EC4" : f.sev === "green" ? "\u2713" : "\xB7" }),
          /* @__PURE__ */ jsx("span", { style: { flex: 1, minWidth: 0, fontSize: 12.5, wordBreak: "break-word" }, children: f.title }),
          hasDetail && /* @__PURE__ */ jsx("span", { style: { color: "#5C6678", fontSize: 10 }, children: open ? "\u6536\u8D77" : "\u5C55\u5F00" })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxs("div", { style: { marginTop: 6, fontSize: 11.5, color: "#AEB7C6", lineHeight: 1.65, wordBreak: "break-word" }, children: [
      f.detail && /* @__PURE__ */ jsx("div", { children: f.detail }),
      f.fix && /* @__PURE__ */ jsxs("div", { style: { color: "#7EE2A8" }, children: [
        "\u2192 \u4FEE\u590D\uFF1A",
        f.fix
      ] })
    ] })
  ] });
}
function Sec({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return /* @__PURE__ */ jsxs("div", { style: { border: "1px solid #242C3A", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "#12151C" }, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: () => setOpen(!open),
        style: { padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
        children: [
          /* @__PURE__ */ jsx("span", { style: { color: "#5C6678", fontSize: 10 }, children: open ? "\u25BE" : "\u25B8" }),
          title
        ]
      }
    ),
    open && /* @__PURE__ */ jsx("div", { style: { padding: "2px 12px 10px" }, children })
  ] });
}
function KvRows({ rows }) {
  return /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", fontSize: 11.5 }, children: rows.filter(([, v]) => v != null && v !== "").map(([k, v], i) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
    /* @__PURE__ */ jsx("span", { style: { color: "#5C6678", whiteSpace: "nowrap" }, children: k }),
    /* @__PURE__ */ jsx("span", { className: "dp-mono", style: { wordBreak: "break-all" }, children: v })
  ] }, i)) });
}
function MailDetail({ mail }) {
  const spf = mail?.spf || {};
  const lookup = spf.lookup || null;
  const dmarc = mail?.dmarc || {};
  const dkim = mail?.dkim || [];
  const mx = mail?.mx || {};
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Sec, { title: `SPF${spf.records && spf.records.length ? `\uFF08${spf.records.length} \u6761\uFF09` : ""}`, defaultOpen: !!(spf.records && spf.records.length), children: [
      (spf.records || []).length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "#5C6678", fontSize: 11.5 }, children: "\u672A\u53D1\u5E03 v=spf1 \u8BB0\u5F55" }),
      (spf.records || []).map((r, i) => /* @__PURE__ */ jsx("div", { className: "dp-mono", style: { fontSize: 11, wordBreak: "break-all", padding: "3px 0" }, children: r }, i)),
      lookup && /* @__PURE__ */ jsxs("div", { style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#8B95A7" }, children: [
          "DNS \u67E5\u8BE2\u8BA1\u6570 ",
          /* @__PURE__ */ jsxs("b", { style: { color: lookup.overLimit ? "#F85149" : lookup.atLimit ? "#E3B341" : "#3FB950" }, children: [
            lookup.count,
            "/10"
          ] }),
          lookup.overLimit ? "\uFF08\u8D85\u9650\uFF0C\u6536\u4EF6\u65B9\u4F1A\u6309 permerror \u5904\u7406\uFF09" : lookup.atLimit ? "\uFF08\u6070\u597D\u8FBE\u4E0A\u9650\uFF09" : ""
        ] }),
        /* @__PURE__ */ jsx("div", { style: { height: 5, background: "#1C2330", borderRadius: 3, marginTop: 4, maxWidth: 320 }, children: /* @__PURE__ */ jsx("div", { style: {
          height: 5,
          borderRadius: 3,
          width: `${Math.min(100, lookup.count * 10)}%`,
          background: lookup.overLimit ? "#F85149" : lookup.atLimit ? "#E3B341" : "#3FB950"
        } }) })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Sec, { title: "DMARC", defaultOpen: true, children: dmarc.record ? /* @__PURE__ */ jsx(KvRows, { rows: [
      ["\u8BB0\u5F55", dmarc.record.raw],
      ["\u7B56\u7565 p", dmarc.record.tags?.p || "\uFF08\u7F3A\u5931\uFF09"],
      ["\u62A5\u544A rua", dmarc.record.tags?.rua || "\uFF08\u672A\u914D\u7F6E\uFF09"],
      ["pct", dmarc.record.tags?.pct || "100\uFF08\u9ED8\u8BA4\uFF09"],
      ["\u5BF9\u9F50", `adkim=${dmarc.record.tags?.adkim || "r\uFF08\u9ED8\u8BA4\uFF09"} / aspf=${dmarc.record.tags?.aspf || "r\uFF08\u9ED8\u8BA4\uFF09"}`],
      ...dmarc.orgGuess ? [["\u7236\u57DF", `${dmarc.orgGuess}\uFF08${dmarc.orgRecord ? "\u6709\u8BB0\u5F55\uFF0C\u5B50\u57DF\u672A\u53D1\u5E03\u65F6\u7EE7\u627F" : "\u65E0\u8BB0\u5F55"}\uFF09`]] : []
    ] }) : /* @__PURE__ */ jsxs("div", { style: { color: "#5C6678", fontSize: 11.5 }, children: [
      "\u672C\u57DF\u672A\u53D1\u5E03 DMARC",
      dmarc.orgGuess ? `\uFF1B\u7236\u57DF ${dmarc.orgGuess} ${dmarc.orgRecord ? "\u6709\u8BB0\u5F55\uFF08\u5B50\u57DF\u7EE7\u627F\uFF09" : "\u4E5F\u65E0\u8BB0\u5F55"}` : ""
    ] }) }),
    /* @__PURE__ */ jsxs(Sec, { title: `DKIM\uFF08\u63A2\u6D4B ${dkim.length} \u4E2A selector\uFF09`, children: [
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 5 }, children: dkim.map((x) => /* @__PURE__ */ jsx("span", { className: "dp-badge", style: {
        background: x.found ? x.record?.revoked ? "#2a2410" : "#122b1a" : "#12151C",
        color: x.found ? x.record?.revoked ? "#E3B341" : "#3FB950" : "#5C6678",
        border: "1px solid #242C3A",
        borderRadius: 5,
        padding: "1px 7px",
        fontSize: 10.5
      }, children: x.found ? `\u2713 ${x.selector}${x.record?.revoked ? "\uFF08\u5DF2\u64A4\u9500\uFF09" : ""}` : x.selector }, x.selector)) }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 10.5, color: "#5C6678", marginTop: 6 }, children: "selector \u662F\u53D1\u4FE1\u65B9\u81EA\u5B9A\u4E49\u7684\uFF1B\u7070\u8272=\u5E38\u89C1\u6E05\u5355\u91CC\u672A\u53D1\u73B0\uFF0C\u53EF\u5728\u300C\u8BBE\u7F6E\u300D\u8865\u5145\u81EA\u5DF1\u7684 selector \u540E\u91CD\u6D4B" })
    ] }),
    /* @__PURE__ */ jsxs(Sec, { title: `MX\uFF08${(mx.answers || []).length || 0} \u6761\uFF09`, children: [
      (mx.answers || []).length === 0 && /* @__PURE__ */ jsxs("div", { style: { color: "#5C6678", fontSize: 11.5 }, children: [
        "\u65E0 MX \u8BB0\u5F55",
        mx.statusCn ? `\uFF08\u89E3\u6790\u5668\u8FD4\u56DE ${mx.statusCn}\uFF09` : ""
      ] }),
      (mx.answers || []).map((a, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, fontSize: 11.5, padding: "3px 0" }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "#58A6FF", width: 26 }, children: a.pref ?? "?" }),
        /* @__PURE__ */ jsx("span", { className: "dp-mono", style: { wordBreak: "break-all" }, children: a.data }),
        /* @__PURE__ */ jsxs("span", { style: { color: "#5C6678", marginLeft: "auto" }, children: [
          "TTL ",
          a.ttl
        ] })
      ] }, i))
    ] })
  ] });
}
function LookupDetail({ sections }) {
  const per = sections?.per || [];
  const diff = sections?.diff;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Sec, { title: `\u5404\u89E3\u6790\u5668\u7B54\u6848\uFF08${sections?.query?.type || ""}\uFF09`, defaultOpen: true, children: per.map((p, i) => /* @__PURE__ */ jsxs("div", { style: { padding: "6px 0", borderTop: i ? "1px solid #1d2330" : "none" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("b", { style: { fontSize: 12 }, children: p.resolver }),
        p.ok ? /* @__PURE__ */ jsxs("span", { style: { fontSize: 10.5, color: p.status === 0 ? "#3FB950" : "#E3B341" }, children: [
          p.statusCn,
          p.ad ? " \xB7 DNSSEC\u9A8C\u8BC1\u2713" : ""
        ] }) : /* @__PURE__ */ jsx("span", { style: { fontSize: 10.5, color: "#F85149" }, children: "\u4E0D\u53EF\u8FBE" })
      ] }),
      p.ok && (p.answers || []).length > 0 && /* @__PURE__ */ jsx("div", { className: "dp-mono", style: { fontSize: 11, color: "#AEB7C6", marginTop: 3, wordBreak: "break-all" }, children: p.answers.slice(0, 12).map((a) => a.typeName === "MX" && a.pref != null ? `${a.pref} ${a.data}` : a.data).join("  |  ") }),
      !p.ok && /* @__PURE__ */ jsx("div", { style: { fontSize: 10.5, color: "#F85149", marginTop: 2 }, children: p.error })
    ] }, i)) }),
    diff && /* @__PURE__ */ jsxs("div", { className: "dp-card-b", style: { padding: "9px 13px", border: "1px solid #242C3A", borderRadius: 10, marginBottom: 8, background: "#12151C" }, children: [
      /* @__PURE__ */ jsxs("b", { style: { fontSize: 12 }, children: [
        "\u4E00\u81F4\u6027\uFF1A",
        diff.consistent ? /* @__PURE__ */ jsx("span", { style: { color: "#3FB950" }, children: "\u5404\u89E3\u6790\u5668\u7B54\u6848\u4E00\u81F4 \u2713" }) : /* @__PURE__ */ jsxs("span", { style: { color: "#E3B341" }, children: [
          "\u4E0D\u4E00\u81F4\uFF08",
          diff.groups.length,
          " \u7EC4\uFF09"
        ] })
      ] }),
      !diff.consistent && diff.groups.length > 0 && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8B95A7", marginTop: 4 }, children: diff.groups.map((g, i) => `${g.resolvers.join(" + ")} \u2192 ${g.answers.map((a) => a.data).join(" | ")}`).join("\uFF1B") }),
      diff.unreachable && diff.unreachable.length > 0 && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10.5, color: "#5C6678", marginTop: 4 }, children: [
        "\u4E0D\u53EF\u8FBE\uFF1A",
        diff.unreachable.map((u) => u.id).join(", "),
        "\uFF08\u7F51\u7EDC\u53D7\u9650\u73AF\u5883\u4E0B\u5168\u7403\u89E3\u6790\u5668\u53EF\u80FD\u8D85\u65F6\uFF0C\u5C5E\u6B63\u5E38\u73B0\u8C61\uFF09"
      ] })
    ] })
  ] });
}
function ReportView({ rep, compact = false }) {
  const c = rep.score?.counts;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "dp-card", style: { padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [
      rep.score && /* @__PURE__ */ jsx(ScoreRing, { total: rep.score.total, tone: rep.score.verdict?.tone || "warn" }),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 180 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx("b", { style: { fontSize: 14 }, className: "dp-mono", children: rep.domain }),
          /* @__PURE__ */ jsx("span", { className: "dp-tag", children: KIND_CN[rep.kind] || rep.kind }),
          rep.finishedAt && /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#5C6678" }, children: [
            rep.finishedAt.replace("T", " ").slice(0, 16),
            " \xB7 ",
            ((rep.durationMs || 0) / 1e3).toFixed(1),
            "s"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11.5, color: "#8B95A7", marginTop: 3 }, children: rep.score?.verdict?.cn || "" }),
        c && /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }, children: ["red", "yellow", "info", "green"].map((k) => /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: SEV_COLOR[k], background: SEV_BG[k], borderRadius: 5, padding: "1px 7px", border: `1px solid ${SEV_COLOR[k]}33` }, children: [
          SEV_TEXT[k],
          " ",
          c[k] || 0
        ] }, k)) })
      ] })
    ] }),
    rep.fatal && /* @__PURE__ */ jsxs("div", { className: "dp-card", style: { padding: 12, borderColor: "#67252e" }, children: [
      /* @__PURE__ */ jsx("div", { style: { color: "#F85149", fontWeight: 600, fontSize: 12.5 }, children: rep.fatal.cn }),
      rep.fatal.detail && /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#AEB7C6", marginTop: 4, wordBreak: "break-all" }, children: rep.fatal.detail })
    ] }),
    (rep.findings || []).length > 0 && /* @__PURE__ */ jsx("div", { style: { margin: "10px 0" }, children: (rep.findings || []).map((f, i) => /* @__PURE__ */ jsx(FindingRow, { f }, i)) }),
    rep.sections && rep.kind === "lookup" && /* @__PURE__ */ jsx(LookupDetail, { sections: rep.sections }),
    rep.sections && rep.sections.mail && rep.kind !== "lookup" && /* @__PURE__ */ jsx(MailDetail, { mail: rep.sections.mail }),
    rep.sections && rep.sections.cert && (rep.kind === "cert" || rep.kind === "full") && /* @__PURE__ */ jsx(Sec, { title: "\u8BC1\u4E66", defaultOpen: rep.kind === "cert", children: rep.sections.cert.refused ? /* @__PURE__ */ jsxs("div", { style: { color: "#8B95A7", fontSize: 11.5 }, children: [
      "\u672A\u63A2\u6D4B\uFF1A",
      rep.sections.cert.refused
    ] }) : /* @__PURE__ */ jsx(KvRows, { rows: [
      ["\u6301\u6709\u8005", rep.sections.cert.subjectCn],
      ["\u7B7E\u53D1\u65B9", rep.sections.cert.issuer],
      ["\u6709\u6548\u81F3", `${String(rep.sections.cert.validTo).slice(0, 10)}\uFF08\u5269 ${rep.sections.cert.daysLeft} \u5929\uFF09`],
      ["SAN \u8986\u76D6", rep.sections.cert.coversDomain ? "\u2713 \u5305\u542B\u672C\u57DF" : `\u2717 ${(rep.sections.cert.sans || []).slice(0, 6).join(", ") || "\u65E0 SAN"}`],
      ["\u94FE\u6821\u9A8C", rep.sections.cert.authorizationError ? `\u2717 ${rep.sections.cert.authorizationError}` : "\u2713 \u901A\u8FC7"],
      ["TLS", rep.sections.cert.tlsVersion || ""],
      ["\u6838\u9A8C IP", rep.sections.cert.verifiedIp || ""]
    ] }) }),
    rep.sections && rep.sections.dns && !compact && /* @__PURE__ */ jsx(Sec, { title: "DNS \u539F\u59CB\u8BB0\u5F55", children: (() => {
      const dns = rep.sections.dns;
      return ["ns", "soa", "a", "aaaa", "caa", "ds"].map((k) => {
        const p = dns[k];
        if (!p) return null;
        const rows = (p.answers || []).slice(0, 12).map((a) => a.data);
        return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 7 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 10.5, color: "#5C6678" }, children: [
            k.toUpperCase(),
            "\uFF08",
            p.statusCn || "",
            "\uFF09"
          ] }),
          rows.length ? rows.map((r, i) => /* @__PURE__ */ jsx("div", { className: "dp-mono", style: { fontSize: 11, wordBreak: "break-all" }, children: r }, i)) : /* @__PURE__ */ jsx("div", { style: { fontSize: 10.5, color: "#5C6678" }, children: "\u65E0\u8BB0\u5F55" })
        ] }, k);
      });
    })() }),
    rep.resolverFailures && rep.resolverFailures.length > 0 && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10.5, color: "#5C6678", margin: "6px 2px 0" }, children: [
      "\u89E3\u6790\u5668\u5931\u8D25\u8BB0\u5F55\uFF1A",
      rep.resolverFailures.slice(0, 4).map((f) => `${f.id}(${f.error.slice(0, 60)})`).join("\uFF1B")
    ] })
  ] });
}

// src/DiagnoseTab.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function DiagnoseTab({ meta, onDone }) {
  const [domain, setDomain] = useState2("");
  const [report, setReport] = useState2(null);
  const [busy, setBusy] = useState2(false);
  const [err, setErr] = useState2("");
  const [loadingLatest, setLoadingLatest] = useState2(true);
  useEffect(() => {
    loadLatest().then((r) => {
      if (r && r.kind !== "lookup") setReport(r);
      setLoadingLatest(false);
    });
  }, []);
  const running = meta?.running || null;
  const runBlocked = running && running.action !== "lookup" ? running : null;
  async function start() {
    const d = domain.trim();
    if (!d) {
      setErr("\u8BF7\u8F93\u5165\u57DF\u540D");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const r = await sendCommand("full", { domain: d }, 18e4);
      if (r.ok && r.report) {
        setReport(r.report);
        onDone();
      } else setErr(r.error || "\u4F53\u68C0\u5931\u8D25");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { className: "dp-card", children: /* @__PURE__ */ jsxs2("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dp-inp",
            placeholder: "\u8981\u4F53\u68C0\u7684\u57DF\u540D\uFF0C\u5982 example.com",
            value: domain,
            onChange: (e) => setDomain(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !busy && !runBlocked) start();
            }
          }
        ),
        /* @__PURE__ */ jsx2("button", { className: "dp-btn", disabled: busy || !!runBlocked, onClick: start, style: { flexShrink: 0 }, children: busy ? "\u4F53\u68C0\u4E2D\u2026" : "\u5F00\u59CB\u4F53\u68C0" })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "dp-sub", style: { marginTop: 7 }, children: "DNS \u57FA\u7840\uFF08NS/SOA/A/CAA/DNSSEC\uFF09+ \u90AE\u4EF6\u8EAB\u4EFD\uFF08SPF/DMARC/DKIM/MX\uFF09+ \u8BC1\u4E66\uFF0C\u5168\u53EA\u8BFB\u67E5\u8BE2\uFF0C\u7EA6 15-60 \u79D2" }),
      runBlocked && /* @__PURE__ */ jsxs2("div", { className: "dp-warn", style: { marginTop: 7 }, children: [
        "\u6B63\u5728\u4F53\u68C0 ",
        runBlocked.domain,
        "\uFF08\u9636\u6BB5\uFF1A",
        runBlocked.step,
        "\uFF09\u2014\u2014\u5B8C\u6210\u540E\u53EF\u53D1\u8D77\u4E0B\u4E00\u6B21"
      ] }),
      err && /* @__PURE__ */ jsx2("div", { className: "dp-err", style: { marginTop: 7 }, children: err })
    ] }) }),
    loadingLatest && /* @__PURE__ */ jsx2("div", { className: "dp-empty", children: "\u52A0\u8F7D\u6700\u8FD1\u62A5\u544A\u2026" }),
    !loadingLatest && report && /* @__PURE__ */ jsx2(ReportView, { rep: report }),
    !loadingLatest && !report && !busy && /* @__PURE__ */ jsxs2("div", { className: "dp-empty", children: [
      "\u8FD8\u6CA1\u6709\u4F53\u68C0\u62A5\u544A\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u8F93\u5165\u57DF\u540D\u70B9\u300C\u5F00\u59CB\u4F53\u68C0\u300D\uFF0C\u6216\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\uFF1A",
      /* @__PURE__ */ jsx2("br", {}),
      /* @__PURE__ */ jsx2("b", { style: { color: "#7EE2A8" }, children: "\u300C\u5E2E\u6211\u4F53\u68C0\u4E00\u4E0B example.com \u7684\u57DF\u540D\u300D" })
    ] })
  ] });
}

// src/EmailTab.tsx
import { useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function EmailTab({ meta }) {
  const [domain, setDomain] = useState3("");
  const [report, setReport] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const [err, setErr] = useState3("");
  const running = meta?.running || null;
  const runBlocked = running && running.action !== "lookup" ? running : null;
  async function start() {
    const d = domain.trim();
    if (!d) {
      setErr("\u8BF7\u8F93\u5165\u57DF\u540D");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const r = await sendCommand("email", { domain: d }, 12e4);
      if (r.ok && r.report) setReport(r.report);
      else setErr(r.error || "\u4F53\u68C0\u5931\u8D25");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "dp-card", children: /* @__PURE__ */ jsxs3("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            className: "dp-inp",
            placeholder: "\u53D1\u4FE1\u57DF\u540D\uFF08@ \u540E\u9762\u7684\u90A3\u4E2A\uFF09\uFF0C\u5982 mycompany.com",
            value: domain,
            onChange: (e) => setDomain(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !busy && !runBlocked) start();
            }
          }
        ),
        /* @__PURE__ */ jsx3("button", { className: "dp-btn", disabled: busy || !!runBlocked, onClick: start, style: { flexShrink: 0 }, children: busy ? "\u68C0\u67E5\u4E2D\u2026" : "\u90AE\u4EF6\u4F53\u68C0" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "dp-sub", style: { marginTop: 7 }, children: "\u90AE\u4EF6\u8FDB\u5783\u573E\u7BB1/\u88AB\u62D2\u4FE1\u7684\u7B2C\u4E00\u73B0\u573A\uFF1ASPF \u8BED\u6CD5\u4E0E\u5341\u6B21\u67E5\u8BE2\u4E0A\u9650\u3001DMARC \u7B56\u7565\u3001DKIM \u5E38\u89C1 selector\u3001MX \u4F53\u68C0" }),
      runBlocked && /* @__PURE__ */ jsxs3("div", { className: "dp-warn", style: { marginTop: 7 }, children: [
        "\u6B63\u5728\u4F53\u68C0 ",
        runBlocked.domain,
        "\uFF08",
        runBlocked.step,
        "\uFF09\uFF0C\u8BF7\u7B49\u5B83\u5B8C\u6210"
      ] }),
      err && /* @__PURE__ */ jsx3("div", { className: "dp-err", style: { marginTop: 7 }, children: err })
    ] }) }),
    report && /* @__PURE__ */ jsx3(ReportView, { rep: report }),
    !report && !busy && /* @__PURE__ */ jsxs3("div", { className: "dp-empty", children: [
      "\u5BF9 AI \u8BF4\uFF1A",
      /* @__PURE__ */ jsx3("b", { style: { color: "#7EE2A8" }, children: "\u300C\u5E2E\u6211\u67E5\u4E0B mycompany.com \u7684\u90AE\u4EF6\u914D\u7F6E\uFF0C\u6700\u8FD1\u53D1\u4FE1\u8001\u8FDB\u5783\u573E\u7BB1\u300D" }),
      /* @__PURE__ */ jsx3("br", {}),
      "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u4E0A\u65B9\u8F93\u5165\u57DF\u540D\u53D1\u8D77"
    ] })
  ] });
}

// src/PropagateTab.tsx
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var TYPES = ["A", "AAAA", "MX", "TXT", "NS", "SOA", "CAA", "CNAME"];
function PropagateTab({ meta }) {
  const [domain, setDomain] = useState4("");
  const [type, setType] = useState4("A");
  const [report, setReport] = useState4(null);
  const [busy, setBusy] = useState4(false);
  const [err, setErr] = useState4("");
  const running = meta?.running || null;
  const runBlocked = running && running.action !== "lookup" ? running : null;
  async function start() {
    const d = domain.trim();
    if (!d) {
      setErr("\u8BF7\u8F93\u5165\u57DF\u540D");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const r = await sendCommand("lookup", { domain: d, type, allResolvers: true }, 6e4);
      if (r.ok && r.report) setReport(r.report);
      else setErr(r.error || "\u67E5\u8BE2\u5931\u8D25");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4("div", { className: "dp-card", children: /* @__PURE__ */ jsxs4("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "dp-inp",
            placeholder: "\u57DF\u540D\u6216\u5B50\u57DF\uFF0C\u5982 www.example.com",
            value: domain,
            onChange: (e) => setDomain(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !busy && !runBlocked) start();
            }
          }
        ),
        /* @__PURE__ */ jsx4("select", { className: "dp-sel", value: type, onChange: (e) => setType(e.target.value), children: TYPES.map((t) => /* @__PURE__ */ jsx4("option", { value: t, children: t }, t)) }),
        /* @__PURE__ */ jsx4("button", { className: "dp-btn", disabled: busy || !!runBlocked, onClick: start, style: { flexShrink: 0 }, children: busy ? "\u67E5\u8BE2\u4E2D\u2026" : "\u5BF9\u6BD4\u67E5\u8BE2" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "dp-sub", style: { marginTop: 7 }, children: "\u6539\u4E86\u89E3\u6790\u540E\u5728\u8FD9\u91CC\u9A8C\u8BC1\uFF1A\u56FD\u5185\u5916\u89E3\u6790\u5668\u770B\u5230\u7684\u7B54\u6848\u4E00\u81F4\u4E86\uFF0C\u624D\u7B97\u5168\u7403\u751F\u6548\uFF08\u542B TTL \u63D0\u793A\uFF09" }),
      runBlocked && /* @__PURE__ */ jsxs4("div", { className: "dp-warn", style: { marginTop: 7 }, children: [
        "\u6B63\u5728\u4F53\u68C0 ",
        runBlocked.domain,
        "\uFF08",
        runBlocked.step,
        "\uFF09\uFF0C\u8BF7\u7B49\u5B83\u5B8C\u6210"
      ] }),
      err && /* @__PURE__ */ jsx4("div", { className: "dp-err", style: { marginTop: 7 }, children: err })
    ] }) }),
    report && /* @__PURE__ */ jsx4(ReportView, { rep: report }),
    !report && !busy && /* @__PURE__ */ jsxs4("div", { className: "dp-empty", children: [
      "\u5BF9 AI \u8BF4\uFF1A",
      /* @__PURE__ */ jsx4("b", { style: { color: "#7EE2A8" }, children: "\u300C\u67E5\u4E0B www.example.com \u7684 A \u8BB0\u5F55\u5728\u56FD\u5185\u5916\u89E3\u6790\u5668\u4E0A\u662F\u5426\u4E00\u81F4\u300D" })
    ] })
  ] });
}

// src/HistoryTab.tsx
import { useEffect as useEffect2, useState as useState5 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var KIND_CN2 = { full: "\u5168\u9762", email: "\u90AE\u4EF6", cert: "\u8BC1\u4E66", lookup: "\u67E5\u8BE2" };
function HistoryTab({ refreshKey }) {
  const [items, setItems] = useState5(null);
  const [report, setReport] = useState5(null);
  const [err, setErr] = useState5("");
  useEffect2(() => {
    loadHistory().then((h) => setItems(Array.isArray(h) ? h : []));
  }, [refreshKey]);
  async function open(entry) {
    setErr("");
    setReport(null);
    const r = await loadReport(entry.runId);
    if (r) setReport(r);
    else {
      const viaCmd = await sendCommand("get_report", { runId: entry.runId }, 2e4);
      if (viaCmd.ok && viaCmd.report) setReport(viaCmd.report);
      else setErr(viaCmd.error || "\u62A5\u544A\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u6E05\u7406");
    }
  }
  async function clearHistory() {
    if (!confirm("\u6E05\u7A7A\u672C\u5730\u4F53\u68C0\u5386\u53F2\uFF1F\uFF08\u62A5\u544A\u7F13\u5B58\u4E0E\u5386\u53F2\u5217\u8868\u90FD\u4F1A\u5220\u9664\uFF0C\u4E0D\u5F71\u54CD\u4EFB\u4F55\u7EBF\u4E0A\u6570\u636E\uFF09")) return;
    try {
      const { getHostInvoke: getHostInvoke2 } = await Promise.resolve().then(() => (init_host(), host_exports));
      const invoke = getHostInvoke2();
      const list = await invoke("router_dispatch", { req: { target: "cap.kv", payload: { action: "list" } } });
      const keys = (list.result?.keys || []).filter((k) => k.startsWith("dom.report.") || k === "dom.history" || k === "dom.runs" || k === "dom.latest");
      for (const k of keys) {
        await invoke("router_dispatch", { req: { target: "cap.kv", payload: { action: "delete", key: k } } });
      }
      setItems([]);
      setReport(null);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsx5("div", { className: "dp-card", children: /* @__PURE__ */ jsxs5("div", { className: "dp-card-b", style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsxs5("span", { style: { fontSize: 12, fontWeight: 600 }, children: [
        "\u4F53\u68C0\u5386\u53F2",
        items ? `\uFF08${items.length}\uFF09` : ""
      ] }),
      /* @__PURE__ */ jsx5("span", { style: { flex: 1 } }),
      items && items.length > 0 && /* @__PURE__ */ jsx5("button", { className: "dp-btn sm danger", onClick: clearHistory, children: "\u6E05\u7A7A" })
    ] }) }),
    err && /* @__PURE__ */ jsx5("div", { className: "dp-err", children: err }),
    report && /* @__PURE__ */ jsx5(ReportView, { rep: report, compact: true }),
    !report && /* @__PURE__ */ jsxs5("div", { className: "dp-card", children: [
      items === null && /* @__PURE__ */ jsx5("div", { className: "dp-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
      items && items.length === 0 && /* @__PURE__ */ jsx5("div", { className: "dp-empty", children: "\u8FD8\u6CA1\u6709\u4F53\u68C0\u8BB0\u5F55\u3002\u5148\u53BB\u300C\u4F53\u68C0\u300D\u9875\u53D1\u8D77\u4E00\u6B21\u5427\u3002" }),
      items && items.map((x) => {
        const c = x.counts || {};
        return /* @__PURE__ */ jsx5("div", { className: "dp-row", style: { cursor: "pointer" }, onClick: () => open(x), children: /* @__PURE__ */ jsxs5("div", { className: "dp-row-h", children: [
          /* @__PURE__ */ jsx5("span", { className: `dp-badge ${x.ok ? "good" : "bad"}`, children: x.ok ? "\u2713" : "\u2717" }),
          /* @__PURE__ */ jsx5("b", { className: "dp-mono", style: { fontSize: 12.5 }, children: x.domain }),
          /* @__PURE__ */ jsx5("span", { className: "dp-tag", children: KIND_CN2[x.kind] || x.kind }),
          x.score != null && /* @__PURE__ */ jsxs5("b", { style: { fontSize: 12.5, color: x.score >= 85 ? "#3FB950" : x.score >= 70 ? "#58A6FF" : x.score >= 50 ? "#E3B341" : "#F85149" }, children: [
            x.score,
            "\u5206"
          ] }),
          !!c.red && /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, color: "#F85149" }, children: [
            "\u7EA2",
            c.red
          ] }),
          !!c.yellow && /* @__PURE__ */ jsxs5("span", { style: { fontSize: 10, color: "#E3B341" }, children: [
            "\u9EC4",
            c.yellow
          ] }),
          /* @__PURE__ */ jsx5("span", { className: "dp-muted", style: { marginLeft: "auto", fontSize: 10 }, children: String(x.at).replace("T", " ").slice(0, 16) })
        ] }) }, x.runId);
      })
    ] })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect3, useState as useState6 } from "react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var RESOLVER_META = {
  alidns: "\u963F\u91CC DNS\uFF08\u56FD\u5185\u76F4\u8FDE\uFF0C\u9ED8\u8BA4\u4E3B\u89E3\u6790\u5668\uFF09",
  dnspod: "DNSPod \u817E\u8BAF\uFF08\u56FD\u5185\u76F4\u8FDE\uFF09",
  cloudflare: "Cloudflare\uFF08\u5168\u7403\u89C6\u89D2\uFF1B\u90E8\u5206\u7F51\u7EDC\u73AF\u5883\u4E0D\u53EF\u8FBE\uFF0C\u4E0D\u53EF\u8FBE\u4F1A\u5982\u5B9E\u6807\u6CE8\uFF09",
  google: "Google\uFF08\u5168\u7403\u89C6\u89D2\uFF1B\u540C\u4E0A\uFF09"
};
function SettingsTab({ meta }) {
  const [svcStatus, setSvcStatus] = useState6("");
  const [svcErr, setSvcErr] = useState6("");
  const [settings, setSettings] = useState6(null);
  const [resolvers, setResolvers] = useState6([]);
  const [extraSelectors, setExtraSelectors] = useState6("");
  const [saving, setSaving] = useState6(false);
  const [saveMsg, setSaveMsg] = useState6("");
  useEffect3(() => {
    refresh();
  }, [meta?.ts]);
  async function refresh() {
    try {
      const st = await listServiceStatus();
      const mine = st.find((s) => s.serviceId === SERVICE_ID);
      setSvcStatus(mine ? mine.status : "unknown");
      setSvcErr(mine && mine.lastError ? String(mine.lastError) : "");
    } catch (e) {
      setSvcStatus("unknown");
      setSvcErr(String(e.message || e));
    }
    try {
      const s = await requestState();
      if (s.ok) {
        setSettings(s.settings);
        setResolvers(s.resolvers || []);
        setExtraSelectors((s.settings.dkimSelectorsExtra || []).join(", "));
      }
    } catch (_) {
    }
  }
  async function doStart() {
    setSvcErr("");
    try {
      await startSelfService();
      setTimeout(refresh, 1500);
    } catch (e) {
      setSvcErr(String(e.message || e));
    }
  }
  async function doStop() {
    setSvcErr("");
    try {
      await stopSelfService();
      setTimeout(refresh, 1e3);
    } catch (e) {
      setSvcErr(String(e.message || e));
    }
  }
  async function doRestart() {
    setSvcErr("");
    try {
      await restartSelfService();
      setTimeout(refresh, 1500);
    } catch (e) {
      setSvcErr(String(e.message || e));
    }
  }
  async function save() {
    if (!settings) {
      setSaveMsg("\u670D\u52A1\u672A\u8FD0\u884C\uFF0C\u8BFB\u4E0D\u5230\u5F53\u524D\u8BBE\u7F6E");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    const extras = extraSelectors.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    try {
      const r = await sendCommand("settings_set", {
        ...settings,
        dkimSelectorsExtra: extras
      }, 2e4);
      if (r.ok) {
        setSettings(r.settings);
        setSaveMsg("\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u5DF2\u70ED\u66F4\uFF09");
      } else setSaveMsg(r.error || "\u4FDD\u5B58\u5931\u8D25");
    } catch (e) {
      setSaveMsg(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }
  const running = svcStatus === "running";
  const heart = meta ? meta.degraded ? "stale" : "ok" : "down";
  return /* @__PURE__ */ jsxs6("div", { children: [
    /* @__PURE__ */ jsx6("div", { className: "dp-card", children: /* @__PURE__ */ jsxs6("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsxs6("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx6("b", { style: { fontSize: 13 }, children: "\u8BCA\u65AD\u670D\u52A1" }),
        /* @__PURE__ */ jsx6("span", { className: `dp-dot ${running && heart === "ok" ? "ok" : running && heart === "stale" ? "stale" : "down"}` }),
        /* @__PURE__ */ jsx6("span", { style: { fontSize: 11.5, color: "#8B95A7" }, children: running ? heart === "ok" ? `\u8FD0\u884C\u4E2D \xB7 v${meta?.version || "?"}` : "\u8FD0\u884C\u4E2D\uFF08\u6865\u964D\u7EA7\uFF0C60s \u5185\u81EA\u6108\u91CD\u8BD5\uFF09" : svcStatus === "unknown" ? "\u72B6\u6001\u672A\u77E5" : "\u5DF2\u505C\u6B62" }),
        /* @__PURE__ */ jsx6("span", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx6("button", { className: "dp-btn sm", onClick: doStart, children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx6("button", { className: "dp-btn sm ghost", onClick: doRestart, children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx6("button", { className: "dp-btn sm danger", onClick: doStop, children: "\u505C\u6B62" })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "dp-sub", style: { marginTop: 6 }, children: "\u670D\u52A1\u662F\u552F\u4E00\u6267\u884C\u8005\uFF08DoH \u67E5\u8BE2 + \u8BC1\u4E66\u63A2\u6D4B\uFF09\uFF0C\u6B63\u5E38\u968F\u63D2\u4EF6\u81EA\u52A8\u542F\u52A8\uFF1B\u9762\u677F\u4E0E AI \u53EA\u8BFB\u5199\u6570\u636E\u4E0D\u76F4\u63A5\u8054\u7F51" }),
      svcErr && /* @__PURE__ */ jsx6("div", { className: "dp-err", style: { marginTop: 6 }, children: svcErr })
    ] }) }),
    /* @__PURE__ */ jsx6("div", { className: "dp-card", children: /* @__PURE__ */ jsxs6("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsx6("b", { style: { fontSize: 13 }, children: "\u89E3\u6790\u5668" }),
      resolvers.length === 0 && /* @__PURE__ */ jsx6("div", { className: "dp-sub", style: { marginTop: 8 }, children: "\u670D\u52A1\u672A\u8FD0\u884C\uFF0C\u8BFB\u4E0D\u5230\u89E3\u6790\u5668\u72B6\u6001\u2014\u2014\u5148\u5728\u4E0A\u65B9\u542F\u52A8\u670D\u52A1\u3002" }),
      /* @__PURE__ */ jsx6("div", { style: { marginTop: 8, display: "grid", gap: 6 }, children: resolvers.map((r) => /* @__PURE__ */ jsxs6("label", { style: { display: "flex", gap: 8, alignItems: "baseline", fontSize: 12 }, children: [
        /* @__PURE__ */ jsx6(
          "input",
          {
            type: "checkbox",
            checked: !!settings?.enabledResolvers?.includes(r.id),
            onChange: (e) => {
              if (!settings) return;
              const has = settings.enabledResolvers.includes(r.id);
              const next = e.target.checked ? [...settings.enabledResolvers, r.id] : settings.enabledResolvers.filter((x) => x !== r.id);
              if (!next.length) return;
              setSettings({ ...settings, enabledResolvers: next, primary: settings.primary === r.id && !e.target.checked ? next[0] : settings.primary });
            }
          }
        ),
        /* @__PURE__ */ jsx6(
          "input",
          {
            type: "radio",
            name: "dp-primary",
            checked: settings?.primary === r.id,
            onChange: () => settings && setSettings({ ...settings, primary: r.id }),
            title: "\u8BBE\u4E3A\u4E3B\u89E3\u6790\u5668"
          }
        ),
        /* @__PURE__ */ jsx6("span", { style: { fontWeight: 600 }, children: r.label }),
        /* @__PURE__ */ jsx6("span", { style: { color: "#5C6678", fontSize: 10.5 }, children: r.overridden ? "\uFF08\u6D4B\u8BD5\u94A9\u5B50\u91CD\u5B9A\u5411\uFF09" : RESOLVER_META[r.id] })
      ] }, r.id)) }),
      /* @__PURE__ */ jsx6("div", { className: "dp-sub", style: { marginTop: 6 }, children: "\u7B2C\u4E00\u4E2A\u52FE\u9009\u6846=\u53C2\u4E0E\u67E5\u8BE2\u5BF9\u6BD4\uFF1B\u5706\u70B9=\u4E3B\u89E3\u6790\u5668\uFF08\u8BB0\u5F55\u6536\u96C6\u7528\u5B83\uFF0C\u5931\u8D25\u81EA\u52A8\u987A\u5EF6\u5230\u4E0B\u4E00\u4E2A\u542F\u7528\u7684\uFF09\u3002\u5168\u7403\u89E3\u6790\u5668\u4E0D\u53EF\u8FBE\u65F6\u4F1A\u5728\u62A5\u544A\u91CC\u5982\u5B9E\u6807\u6CE8\uFF0C\u4E0D\u5F71\u54CD\u56FD\u5185\u89E3\u6790\u5668\u7ED3\u679C\u3002" })
    ] }) }),
    /* @__PURE__ */ jsx6("div", { className: "dp-card", children: /* @__PURE__ */ jsxs6("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsx6("b", { style: { fontSize: 13 }, children: "\u9AD8\u7EA7" }),
      /* @__PURE__ */ jsxs6("div", { style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 10px", alignItems: "center", marginTop: 8, fontSize: 12 }, children: [
        /* @__PURE__ */ jsx6("span", { style: { color: "#8B95A7" }, children: "\u5355\u8BF7\u6C42\u8D85\u65F6" }),
        /* @__PURE__ */ jsx6(
          "select",
          {
            className: "dp-sel",
            value: settings?.timeoutMs || 8e3,
            onChange: (e) => settings && setSettings({ ...settings, timeoutMs: Number(e.target.value) }),
            children: [5e3, 8e3, 12e3, 2e4].map((n) => /* @__PURE__ */ jsxs6("option", { value: n, children: [
              n / 1e3,
              " \u79D2"
            ] }, n))
          }
        ),
        /* @__PURE__ */ jsxs6("span", { style: { color: "#8B95A7" }, children: [
          "DKIM selector",
          /* @__PURE__ */ jsx6("br", {}),
          "\u8865\u5145\u63A2\u6D4B"
        ] }),
        /* @__PURE__ */ jsx6(
          "input",
          {
            className: "dp-inp",
            placeholder: "\u9017\u53F7\u5206\u9694\uFF0C\u5982 mysrv, mail2024",
            value: extraSelectors,
            onChange: (e) => setExtraSelectors(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs6("div", { style: { marginTop: 10, display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx6("button", { className: "dp-btn", disabled: saving || !settings, onClick: save, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }),
        saveMsg && /* @__PURE__ */ jsx6("span", { style: { fontSize: 11, color: saveMsg.includes("\u5DF2\u4FDD\u5B58") ? "#3FB950" : "#E3B341" }, children: saveMsg })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "dp-sub", style: { marginTop: 6 }, children: "\u8865\u5145 selector \u540E\uFF0C\u90AE\u4EF6\u4F53\u68C0\u4F1A\u8FDE\u540C 16 \u4E2A\u5E38\u89C1 selector \u4E00\u8D77\u63A2\u6D4B\uFF08\u4E0A\u9650 12 \u4E2A\uFF09" })
    ] }) }),
    /* @__PURE__ */ jsx6("div", { className: "dp-card", children: /* @__PURE__ */ jsxs6("div", { className: "dp-card-b", children: [
      /* @__PURE__ */ jsx6("b", { style: { fontSize: 13 }, children: "\u5173\u4E8E" }),
      /* @__PURE__ */ jsxs6("div", { className: "dp-sub", style: { marginTop: 6, lineHeight: 1.8 }, children: [
        "\u57DF\u540D\u8BCA\u65AD\u53F0 v",
        meta?.version || "0.1.0",
        "\u2014\u2014\u5168\u53EA\u8BFB\u8BCA\u65AD\uFF1ADNS \u8D70\u516C\u5171 DoH\uFF08JSON API\uFF09\uFF0C\u8BC1\u4E66\u53EA\u8BFB\u53D6\u8BC1\uFF0C\u4E0D\u53D1\u90AE\u4EF6\u3001\u4E0D\u5199\u4EFB\u4F55\u7B2C\u4E09\u65B9\u7CFB\u7EDF\u3001\u4E0D\u5B58\u4EFB\u4F55\u5BC6\u94A5\u3002",
        /* @__PURE__ */ jsx6("br", {}),
        "\u670D\u52A1\u65E5\u5FD7\uFF1A",
        "%APPDATA%",
        "\\\\Polaris\\\\domain-probe\\\\service.log\uFF08512KB \u81EA\u52A8\u8F6E\u8F6C\uFF09\u3002",
        /* @__PURE__ */ jsx6("br", {}),
        "\u8BC1\u4E66\u5230\u671F\u76EF\u9632\u53EF\u914D\u5408\u300C\u5B9A\u65F6\u4EFB\u52A1\u53F0\u300D\uFF1AAI \u5B9A\u65F6\u4EFB\u52A1\u91CC\u5199\u300C\u6BCF\u5929\u8C03\u7528 dom_cert \u68C0\u67E5 example.com\u300D\u5373\u53EF\u3002"
      ] })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var TABS = [
  { key: "diagnose", label: "\u4F53\u68C0" },
  { key: "email", label: "\u90AE\u4EF6\u8EAB\u4EFD" },
  { key: "propagate", label: "\u4F20\u64AD" },
  { key: "history", label: "\u5386\u53F2" },
  { key: "settings", label: "\u8BBE\u7F6E" }
];
function Panel() {
  const [tab, setTab] = useState7("diagnose");
  const [meta, setMeta] = useState7(null);
  const [historyKey, setHistoryKey] = useState7(0);
  const [hostErr, setHostErr] = useState7("");
  const visibleRef = useRef(true);
  const poll = useCallback(async () => {
    try {
      setMeta(await loadMeta());
    } catch (_) {
    }
  }, []);
  useEffect4(() => {
    let timer;
    const loop = () => {
      if (visibleRef.current && document.visibilityState === "visible") poll();
      timer = window.setTimeout(loop, 2500);
    };
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    loop();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timer) clearTimeout(timer);
    };
  }, [poll]);
  const running = meta?.running || null;
  return /* @__PURE__ */ jsxs7("div", { className: "dp-root", children: [
    /* @__PURE__ */ jsxs7("div", { className: "dp-top", children: [
      /* @__PURE__ */ jsx7("div", { className: "dp-logo", children: "\u{1F310}" }),
      /* @__PURE__ */ jsxs7("div", { className: "dp-tt", children: [
        /* @__PURE__ */ jsx7("b", { children: "\u57DF\u540D\u8BCA\u65AD\u53F0" }),
        /* @__PURE__ */ jsxs7("small", { children: [
          /* @__PURE__ */ jsx7("span", { className: `dp-dot ${meta ? meta.degraded ? "stale" : "ok" : "down"}` }),
          meta ? meta.degraded ? "\u670D\u52A1\u8FD0\u884C\u4E2D\uFF08\u6570\u636E\u901A\u9053\u964D\u7EA7\u91CD\u8BD5\u4E2D\uFF09" : `\u670D\u52A1 v${meta.version}` : "\u670D\u52A1\u672A\u8FDE\u63A5\uFF08\u53BB\u300C\u8BBE\u7F6E\u300D\u9875\u542F\u52A8\uFF09"
        ] })
      ] }),
      running && /* @__PURE__ */ jsxs7("span", { className: "dp-run", title: running.domain, children: [
        running.domain,
        " \xB7 ",
        running.step
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "dp-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx7("button", { className: `dp-tab ${tab === t.key ? "on" : ""}`, onClick: () => setTab(t.key), children: t.label }, t.key)) })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "dp-body", children: [
      hostErr && /* @__PURE__ */ jsx7("div", { className: "dp-err", children: hostErr }),
      tab === "diagnose" && /* @__PURE__ */ jsx7(DiagnoseTab, { meta, onDone: () => setHistoryKey((k) => k + 1) }),
      tab === "email" && /* @__PURE__ */ jsx7(EmailTab, { meta }),
      tab === "propagate" && /* @__PURE__ */ jsx7(PropagateTab, { meta }),
      tab === "history" && /* @__PURE__ */ jsx7(HistoryTab, { refreshKey: historyKey }),
      tab === "settings" && /* @__PURE__ */ jsx7(SettingsTab, { meta })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function DomainProbePanel() {
  return /* @__PURE__ */ jsx8(Panel, {});
}
export {
  DomainProbePanel as default
};
