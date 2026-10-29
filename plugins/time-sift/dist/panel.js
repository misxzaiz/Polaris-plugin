// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect5, useState as useState6 } from "react";

// src/host.ts
function getHostInvoke() {
  const w = window;
  const invoke = w.__POLARIS_HOST_INVOKE__;
  if (typeof invoke !== "function") {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}

// src/model.ts
var SOURCE_LABEL = {
  polaris: "Polaris",
  v2: "\u4F1A\u8BDDv2",
  claude: "Claude",
  zcode: "ZCode"
};
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
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
function newNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mailboxCall(op, payload, opts = {}) {
  const nonce = newNonce();
  await kvSet(`sift.cmd.${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const resultKey = `sift.result.${nonce}`;
  const deadline = opts.deadlineMs ?? 3e4;
  const t0 = Date.now();
  while (Date.now() - t0 < deadline) {
    await sleep(1200);
    const res = await kvGet(resultKey);
    if (res && typeof res === "object" && res.ok !== void 0) {
      kvDel(resultKey).catch(() => {
      });
      return res;
    }
  }
  return {
    ok: false,
    error: "\u7B49\u5F85\u670D\u52A1\u54CD\u5E94\u8D85\u65F6\uFF0830s\uFF09\u3002\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\u2014\u2014\u53BB\u300C\u8BBE\u7F6E\u300D\u9875\u770B\u670D\u52A1\u72B6\u6001\uFF0C\u6216\u7A0D\u540E\u91CD\u8BD5\u3002"
  };
}
async function readMeta() {
  return kvGet("sift.meta");
}
async function readTotals() {
  return kvGet("sift.stats.total");
}
async function readDaily() {
  return kvGet("sift.stats.daily");
}
async function readCatalog() {
  const head = await kvGet("sift.cat.head");
  if (!head || !head.chunks) return [];
  const n = Math.min(Number(head.chunks) || 0, 40);
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet(`sift.cat.${i}`))
  );
  const out = [];
  for (const r of results) if (Array.isArray(r)) out.push(...r);
  return out;
}
async function readSettings() {
  const raw = await kvGet("sift.settings");
  const src = raw && raw.sources || {};
  return {
    sources: {
      polaris: src.polaris !== false,
      v2: src.v2 !== false,
      claude: src.claude !== false,
      zcode: src.zcode !== false
    },
    excludeKeywords: Array.isArray(raw && raw.excludeKeywords) ? raw.excludeKeywords : [],
    maxMsgChars: raw && raw.maxMsgChars || 4e3,
    sqliteRefreshMin: raw && raw.sqliteRefreshMin || 10
  };
}
async function saveSettings(s) {
  await kvSet("sift.settings", s);
}
async function readServiceStatus(serviceId) {
  try {
    const st = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
    if (!Array.isArray(st)) return null;
    const mine = st.find((s) => s.serviceId === serviceId);
    return mine ? { status: String(mine.status || "?"), lastError: mine.lastError } : null;
  } catch (_) {
    return null;
  }
}
async function selfStartService(pluginId, serviceId) {
  const disc = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const self = (disc.plugins || []).find((p) => p.id === pluginId);
  if (!self) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230\u81EA\u5DF1\uFF08\u63D2\u4EF6\u53EF\u80FD\u521A\u5B89\u88C5\uFF0C\u91CD\u542F\u5E94\u7528\u540E\u518D\u8BD5\uFF09");
  const svc = (self.contributes && self.contributes.services || []).find((s) => s.id === serviceId);
  if (!svc) throw new Error("\u6E05\u5355\u91CC\u6CA1\u6709\u58F0\u660E\u8BE5\u670D\u52A1");
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId,
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
async function stopService(serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "stop", pluginId: "time-sift", serviceId });
}

// src/SearchTab.tsx
import { useState as useState2 } from "react";

// src/SessionReader.tsx
import { useCallback, useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var PAGE = 40;
function fmtTime(ts) {
  const ms = typeof ts === "number" ? ts : Date.parse(String(ts));
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function highlight(text, terms) {
  if (!terms.length || !text) return [{ t: "plain", s: text }];
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  outer: while (i < text.length) {
    for (const term of sorted) {
      if (term && text.startsWith(term, i)) {
        out.push({ t: "hit", s: term });
        i += term.length;
        continue outer;
      }
    }
    const last = out[out.length - 1];
    if (last && last.t === "plain") last.s += text[i];
    else out.push({ t: "plain", s: text[i] });
    i++;
  }
  return out;
}
function SessionReader({ sid, around = null, terms = [], onClose }) {
  const [entry, setEntry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(around === null ? 0 : null);
  const load = useCallback(
    async (opts) => {
      setLoading(true);
      setError("");
      const res = await mailboxCall("open", { sid, limit: PAGE, maxChars: 2500, ...opts });
      if (res.ok && res.data) {
        const d = res.data;
        if (d.error) setError(d.error);
        else {
          setEntry(d.entry || null);
          setMessages(d.messages || []);
          setTotal(d.total || 0);
          setTruncated(!!d.truncated);
        }
      } else {
        setError(res.error || "\u8BFB\u53D6\u5931\u8D25");
      }
      setLoading(false);
    },
    [sid]
  );
  useEffect(() => {
    load({ around, offset: around === null ? 0 : void 0 });
  }, [load, around, sid]);
  const atStart = offset !== null && offset <= 0;
  const windowEnd = (offset ?? 0) + messages.length;
  const atEnd = offset !== null && windowEnd >= total;
  return /* @__PURE__ */ jsxs("div", { className: "ts-card", children: [
    /* @__PURE__ */ jsx("div", { className: "ts-card-b", style: { borderBottom: "1px solid #242C3A" }, children: /* @__PURE__ */ jsxs("div", { className: "ts-row", children: [
      /* @__PURE__ */ jsx("button", { className: "ts-btn ghost sm", onClick: onClose, children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ jsx("b", { style: { fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: entry ? entry.title : "\u52A0\u8F7D\u4E2D\u2026" }),
      entry && /* @__PURE__ */ jsxs("span", { className: `ts-tag ${entry.source}`, children: [
        SOURCE_LABEL[entry.source] || entry.source,
        " \xB7 ",
        total,
        " \u6761"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "ts-card-b", style: { padding: "10px 13px 14px" }, children: [
      loading && /* @__PURE__ */ jsxs("div", { className: "ts-sub", style: { textAlign: "center", padding: 14 }, children: [
        /* @__PURE__ */ jsx("span", { className: "ts-spin" }),
        " \u6B63\u5728\u7ECF\u670D\u52A1\u8BFB\u53D6\u4F1A\u8BDD\u2026"
      ] }),
      !loading && error && /* @__PURE__ */ jsx("div", { className: "ts-err", style: { margin: 0 }, children: error }),
      !loading && !error && messages.length === 0 && /* @__PURE__ */ jsx("div", { className: "ts-empty", children: "\u8FD9\u6BB5\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u5BF9\u8BDD\u5185\u5BB9\u3002" }),
      !loading && messages.map((m) => /* @__PURE__ */ jsxs("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: m.role === "user" ? "#79C0FF" : "#7EE787", marginBottom: 3 }, children: [
          m.role === "user" ? "\u7528\u6237" : "AI",
          " \xB7 #",
          m.i,
          " ",
          fmtTime(m.ts) && `\xB7 ${fmtTime(m.ts)}`
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            style: {
              fontSize: 12,
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: m.role === "user" ? "rgba(88,101,242,.07)" : "transparent",
              borderLeft: m.role === "user" ? "2px solid #5865F2" : "2px solid #254a2b",
              paddingLeft: 9
            },
            children: highlight(m.text, terms).map(
              (seg, i) => seg.t === "hit" ? /* @__PURE__ */ jsx("span", { className: "ts-mark", children: seg.s }, i) : /* @__PURE__ */ jsx("span", { children: seg.s }, i)
            )
          }
        )
      ] }, m.i)),
      !loading && !error && offset !== null && /* @__PURE__ */ jsxs("div", { className: "ts-row", style: { justifyContent: "center", marginTop: 6 }, children: [
        /* @__PURE__ */ jsx("button", { className: "ts-btn ghost sm", disabled: atStart, onClick: () => {
          const o = Math.max(0, (offset ?? 0) - PAGE);
          setOffset(o);
          load({ offset: o });
        }, children: "\u4E0A\u4E00\u9875" }),
        /* @__PURE__ */ jsx("span", { className: "ts-sub", children: total > 0 ? `${Math.min(windowEnd, total)} / ${total}` : "" }),
        /* @__PURE__ */ jsx("button", { className: "ts-btn ghost sm", disabled: atEnd, onClick: () => {
          const o = (offset ?? 0) + messages.length;
          setOffset(o);
          load({ offset: o });
        }, children: "\u4E0B\u4E00\u9875" })
      ] }),
      truncated && /* @__PURE__ */ jsx("div", { className: "ts-sub", style: { textAlign: "center", marginTop: 6 }, children: "\u90E8\u5206\u8D85\u957F\u6D88\u606F\u5DF2\u622A\u65AD\u5C55\u793A\u3002" })
    ] })
  ] });
}

// src/SearchTab.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var DAYS_OPTIONS = [
  ["\u4E0D\u9650\u65F6\u95F4", 0],
  ["\u8FD1 1 \u5929", 1],
  ["\u8FD1 7 \u5929", 7],
  ["\u8FD1 30 \u5929", 30],
  ["\u8FD1\u4E00\u5E74", 365]
];
var SRC_CHIPS = [
  ["", "\u5168\u90E8"],
  ["polaris", "Polaris"],
  ["v2", "\u4F1A\u8BDDv2"],
  ["claude", "Claude"],
  ["zcode", "ZCode"]
];
function fmtDate(ms) {
  if (!ms) return "?";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function SearchTab({ meta }) {
  const [query, setQuery] = useState2("");
  const [source, setSource] = useState2("");
  const [days, setDays] = useState2(0);
  const [searching, setSearching] = useState2(false);
  const [error, setError] = useState2("");
  const [hits, setHits] = useState2([]);
  const [terms, setTerms] = useState2([]);
  const [searched, setSearched] = useState2("");
  const [openSid, setOpenSid] = useState2(null);
  const [openAround, setOpenAround] = useState2(null);
  const serviceBusy = !!(meta && meta.indexing && meta.indexing.phase !== "idle" && meta.indexing.phase !== "error");
  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError("");
    const res = await mailboxCall("search", {
      query: q,
      source: source || void 0,
      days: days || void 0,
      limit: 20
    });
    if (res.ok && res.data) {
      if (res.data.error) setError(res.data.error);
      else {
        setHits(res.data.hits || []);
        setTerms(res.data.terms || []);
        setSearched(q);
      }
    } else {
      setError(res.error || "\u68C0\u7D22\u5931\u8D25");
    }
    setSearching(false);
  };
  if (openSid) {
    return /* @__PURE__ */ jsx2(SessionReader, { sid: openSid, around: openAround, terms, onClose: () => setOpenSid(null) });
  }
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsx2("div", { className: "ts-card", children: /* @__PURE__ */ jsxs2("div", { className: "ts-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ts-row", children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "ts-inp",
            style: { flex: 1, minWidth: 160 },
            placeholder: "\u641C\u4F60\u804A\u8FC7\u7684\u4E00\u5207\u2026\uFF08\u56DE\u8F66\u68C0\u7D22\uFF09",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") runSearch();
            }
          }
        ),
        /* @__PURE__ */ jsx2("button", { className: "ts-btn", onClick: runSearch, disabled: searching || !query.trim(), children: searching ? /* @__PURE__ */ jsx2("span", { className: "ts-spin" }) : "\u68C0\u7D22" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ts-row", style: { marginTop: 8 }, children: [
        SRC_CHIPS.map(([k, label]) => /* @__PURE__ */ jsx2("button", { className: `ts-chip ${source === k ? "on" : ""}`, onClick: () => setSource(k), children: label }, k || "all")),
        /* @__PURE__ */ jsx2("select", { className: "ts-sel", style: { marginLeft: "auto" }, value: days, onChange: (e) => setDays(Number(e.target.value)), children: DAYS_OPTIONS.map(([label, v]) => /* @__PURE__ */ jsx2("option", { value: v, children: label }, v)) })
      ] })
    ] }) }),
    error && /* @__PURE__ */ jsx2("div", { className: "ts-err", children: error }),
    serviceBusy && !error && /* @__PURE__ */ jsx2("div", { className: "ts-sub", style: { padding: "0 18px 8px" }, children: "\u9996\u6B21\u5EFA\u7D22\u5F15\u8FDB\u884C\u4E2D\u2014\u2014\u73B0\u5728\u80FD\u641C\u5230\u7684\u662F\u5DF2\u626B\u5B8C\u7684\u90E8\u5206\uFF0C\u626B\u5B8C\u81EA\u52A8\u9F50\u5168\u3002" }),
    !searched && !error && /* @__PURE__ */ jsxs2("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsx2("b", { children: "\u4F1A\u8BDD\u8BB0\u5FC6\uFF1A\u627E\u56DE\u4F60\u548C AI \u804A\u8FC7\u7684\u4E00\u5207" }),
      "\u8F93\u5165\u5173\u952E\u8BCD\u641C\u5386\u53F2\u4F1A\u8BDD\u2014\u2014\u300C\u4E0A\u6B21\u90A3\u4E2A JSONL \u89E3\u6790 bug \u600E\u4E48\u4FEE\u7684\u300D\u300C\u6211\u804A\u8FC7 XX \u65B9\u6848\u7684\u4F1A\u8BDD\u300D\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u627E\u627E\u4EE5\u524D\u5173\u4E8E XX \u7684\u4F1A\u8BDD\u300D\uFF08sift_search \u5DE5\u5177\uFF09\u3002"
    ] }),
    searched && !error && hits.length === 0 && !searching && /* @__PURE__ */ jsxs2("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsxs2("b", { children: [
        "\u6CA1\u6709\u547D\u4E2D\u300C",
        searched,
        "\u300D"
      ] }),
      "\u8BD5\u8BD5\u6362\u5173\u952E\u8BCD\u3001\u653E\u5BBD\u65F6\u95F4\u8303\u56F4\uFF0C\u6216\u53BB\u6389\u6765\u6E90\u7B5B\u9009\u3002"
    ] }),
    hits.map((h) => /* @__PURE__ */ jsx2(
      "div",
      {
        className: "ts-card ts-hit",
        onClick: () => {
          setOpenSid(h.sid);
          setOpenAround(h.snippet ? h.snippet.msgIndex : null);
        },
        children: /* @__PURE__ */ jsxs2("div", { className: "ts-card-b", children: [
          /* @__PURE__ */ jsxs2("div", { className: "ts-row", children: [
            /* @__PURE__ */ jsx2("b", { style: { fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: h.title }),
            /* @__PURE__ */ jsx2("span", { className: `ts-tag ${h.source}`, children: SOURCE_LABEL[h.source] || h.source })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "ts-sub", style: { marginTop: 4 }, children: [
            fmtDate(h.updatedAt),
            " \xB7 ",
            h.msgCount,
            " \u6761\u6D88\u606F \xB7 \u547D\u4E2D ",
            h.hitCount,
            " \u5904"
          ] }),
          h.snippet && /* @__PURE__ */ jsxs2(
            "div",
            {
              style: {
                marginTop: 6,
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "#AAB3C5",
                background: "#12151C",
                border: "1px solid #222938",
                borderRadius: 8,
                padding: "7px 9px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              },
              children: [
                h.snippet.role === "user" ? "\u7528\u6237\uFF1A" : "AI\uFF1A",
                /* @__PURE__ */ jsx2(Highlight, { text: h.snippet.text, terms })
              ]
            }
          )
        ] })
      },
      h.sid
    ))
  ] });
}
function Highlight({ text, terms }) {
  if (!terms.length || !text) return /* @__PURE__ */ jsx2(Fragment, { children: text });
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const nodes = [];
  let plain = "";
  let i = 0;
  let key = 0;
  const flush = () => {
    if (plain) {
      nodes.push(/* @__PURE__ */ jsx2("span", { children: plain }, key++));
      plain = "";
    }
  };
  outer: while (i < text.length) {
    for (const term of sorted) {
      if (term && text.startsWith(term, i)) {
        flush();
        nodes.push(
          /* @__PURE__ */ jsx2("span", { className: "ts-mark", children: text.slice(i, i + term.length) }, key++)
        );
        i += term.length;
        continue outer;
      }
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return /* @__PURE__ */ jsx2(Fragment, { children: nodes });
}

// src/FootprintTab.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function fmtNum(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + " \u4EBF";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + " \u4E07";
  return n >= 1e3 ? n.toLocaleString("en-US") : String(n);
}
var HEAT_STEPS = ["#1b2130", "#17351f", "#1d5230", "#27793f", "#39a852", "#5fd86f"];
function heatColor(msgs) {
  if (msgs <= 0) return HEAT_STEPS[0];
  if (msgs <= 10) return HEAT_STEPS[1];
  if (msgs <= 30) return HEAT_STEPS[2];
  if (msgs <= 80) return HEAT_STEPS[3];
  if (msgs <= 200) return HEAT_STEPS[4];
  return HEAT_STEPS[5];
}
function buildWeeks(daily, weeks = 26) {
  const today = /* @__PURE__ */ new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOffset = (end.getDay() + 6) % 7;
  const lastMonday = new Date(end);
  lastMonday.setDate(end.getDate() - endOffset);
  const cols = [];
  const d = new Date(lastMonday);
  d.setDate(lastMonday.getDate() - (weeks - 1) * 7);
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (d > end) col.push(null);
      else {
        const v = daily[key];
        col.push({ day: key, m: v ? v.m : 0, s: v ? v.s : 0 });
      }
      d.setDate(d.getDate() + 1);
    }
    cols.push(col);
  }
  return cols;
}
function FootprintTab() {
  const [totals, setTotals] = useState3(null);
  const [daily, setDaily] = useState3({});
  const [loading, setLoading] = useState3(true);
  useEffect2(() => {
    ;
    (async () => {
      const [t, d] = await Promise.all([readTotals(), readDaily()]);
      setTotals(t);
      setDaily(d || {});
      setLoading(false);
    })();
  }, []);
  if (loading) {
    return /* @__PURE__ */ jsxs3("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsx3("span", { className: "ts-spin" }),
      " \u8BFB\u53D6\u8DB3\u8FF9\u2026"
    ] });
  }
  if (!totals || totals.sessions === 0) {
    return /* @__PURE__ */ jsxs3("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsx3("b", { children: "\u8DB3\u8FF9\u8FD8\u662F\u7A7A\u767D" }),
      "\u670D\u52A1\u5B8C\u6210\u9996\u6B21\u626B\u63CF\u540E\u4F1A\u5728\u8FD9\u91CC\u770B\u5230\uFF1A\u4F1A\u8BDD\u70ED\u529B\u56FE\u3001\u603B\u91CF\u3001\u6765\u6E90\u5206\u5E03\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u53BB\u300C\u8BBE\u7F6E\u300D\u9875\u786E\u8BA4\u670D\u52A1\u72B6\u6001\u4E0E\u9996\u6B21\u626B\u63CF\u8FDB\u5EA6\u3002"
    ] });
  }
  const weeks = buildWeeks(daily);
  const topDays = Object.entries(daily).sort((a, b) => b[1].m - a[1].m).slice(0, 8);
  const maxDayMsgs = topDays.length ? topDays[0][1].m : 1;
  const sources = Object.entries(totals.bySource || {}).sort((a, b) => b[1].sessions - a[1].sessions);
  const maxSrcSessions = sources.length ? sources[0][1].sessions : 1;
  const tk = totals.tokens || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, sessionsCovered: 0 };
  return /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "ts-bar" }),
      " \u603B\u89C8",
      /* @__PURE__ */ jsxs3("span", { className: "ts-hint", children: [
        totals.firstDay || "?",
        " ~ ",
        totals.lastDay || "?"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ts-row", style: { padding: "0 16px 10px", gap: 8 }, children: [
      ["\u4F1A\u8BDD", fmtNum(totals.sessions)],
      ["\u6D88\u606F", fmtNum(totals.messages)],
      ["\u5BF9\u8BDD\u6563\u6587", fmtNum(totals.proseChars)],
      ["\u6D3B\u8DC3\u5929\u6570", fmtNum(totals.activeDays)]
    ].map(([label, value]) => /* @__PURE__ */ jsx3("div", { className: "ts-card", style: { flex: 1, minWidth: 100, margin: 0 }, children: /* @__PURE__ */ jsxs3("div", { className: "ts-card-b", style: { textAlign: "center", padding: "10px 6px" }, children: [
      /* @__PURE__ */ jsx3("div", { style: { fontSize: 17, fontWeight: 700, color: "#B3B9FF" }, children: value }),
      /* @__PURE__ */ jsx3("div", { className: "ts-sub", style: { marginTop: 2 }, children: label })
    ] }) }, label)) }),
    /* @__PURE__ */ jsxs3("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "ts-bar" }),
      " 26 \u5468\u70ED\u529B\u56FE",
      /* @__PURE__ */ jsx3("span", { className: "ts-hint", children: "\u6309\u5929\u6D88\u606F\u6570" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ts-card", children: /* @__PURE__ */ jsxs3("div", { className: "ts-card-b", style: { overflowX: "auto" }, children: [
      /* @__PURE__ */ jsx3("div", { style: { display: "grid", gridAutoFlow: "column", gridTemplateRows: "repeat(7, 11px)", gap: 3, width: "max-content" }, children: weeks.map(
        (col, ci) => col.map((cell, ri) => /* @__PURE__ */ jsx3(
          "div",
          {
            title: cell ? `${cell.day}\uFF1A${cell.s} \u4F1A\u8BDD / ${cell.m} \u6D88\u606F` : "",
            style: {
              width: 11,
              height: 11,
              borderRadius: 2.5,
              background: cell ? heatColor(cell.m) : "transparent",
              outline: cell && cell.m > 0 ? "none" : "1px solid rgba(255,255,255,.03)"
            }
          },
          `${ci}-${ri}`
        ))
      ) }),
      /* @__PURE__ */ jsxs3("div", { className: "ts-row", style: { marginTop: 8, justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ jsx3("span", { className: "ts-sub", children: "\u5C11" }),
        HEAT_STEPS.map((c) => /* @__PURE__ */ jsx3("span", { style: { width: 11, height: 11, borderRadius: 2.5, background: c, display: "inline-block" } }, c)),
        /* @__PURE__ */ jsx3("span", { className: "ts-sub", children: "\u591A" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "ts-bar" }),
      " \u6765\u6E90\u5206\u5E03"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ts-card", children: /* @__PURE__ */ jsx3("div", { className: "ts-card-b", children: sources.map(([src, v]) => /* @__PURE__ */ jsxs3("div", { style: { marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "ts-row", style: { fontSize: 11.5 }, children: [
        /* @__PURE__ */ jsx3("span", { className: `ts-tag ${src}`, children: SOURCE_LABEL[src] || src }),
        /* @__PURE__ */ jsxs3("span", { className: "ts-sub", children: [
          v.sessions,
          " \u4F1A\u8BDD / ",
          fmtNum(v.messages),
          " \u6D88\u606F"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { height: 6, background: "#1b2130", borderRadius: 3, marginTop: 4 }, children: /* @__PURE__ */ jsx3("div", { style: { width: `${Math.max(3, v.sessions / maxSrcSessions * 100)}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#7A5CFF,#58A6FF)" } }) })
    ] }, src)) }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "ts-bar" }),
      " Top \u6D3B\u8DC3\u65E5",
      /* @__PURE__ */ jsx3("span", { className: "ts-hint", children: "\u6309\u6D88\u606F\u6570" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ts-card", children: /* @__PURE__ */ jsx3("div", { className: "ts-card-b", children: topDays.map(([day, v]) => /* @__PURE__ */ jsxs3("div", { className: "ts-row", style: { marginBottom: 6, fontSize: 11.5 }, children: [
      /* @__PURE__ */ jsx3("span", { style: { width: 84, flexShrink: 0 }, children: day }),
      /* @__PURE__ */ jsx3("div", { style: { flex: 1, height: 6, background: "#1b2130", borderRadius: 3 }, children: /* @__PURE__ */ jsx3("div", { style: { width: `${Math.max(2, v.m / maxDayMsgs * 100)}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#1d5230,#5fd86f)" } }) }),
      /* @__PURE__ */ jsxs3("span", { className: "ts-sub", style: { width: 90, textAlign: "right", flexShrink: 0 }, children: [
        v.s,
        " \u4F1A\u8BDD / ",
        v.m,
        " \u6D88\u606F"
      ] })
    ] }, day)) }) }),
    /* @__PURE__ */ jsxs3("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "ts-bar" }),
      " Token \u7528\u91CF",
      /* @__PURE__ */ jsxs3("span", { className: "ts-hint", children: [
        "\u53E3\u5F84\uFF1A\u80FD\u53D6\u5230\u7528\u91CF\u7684 ",
        tk.sessionsCovered,
        " \u6761\u4F1A\u8BDD"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ts-card", children: /* @__PURE__ */ jsxs3("div", { className: "ts-card-b ts-sub", children: [
      "\u8F93\u5165 ",
      fmtNum(tk.input),
      " \xB7 \u8F93\u51FA ",
      fmtNum(tk.output),
      " \xB7 \u7F13\u5B58\u8BFB ",
      fmtNum(tk.cacheRead),
      " \xB7 \u7F13\u5B58\u5199 ",
      fmtNum(tk.cacheWrite),
      tk.costUsd > 0 && ` \xB7 \u8D39\u7528\u7EA6 $${tk.costUsd.toFixed(2)}`,
      /* @__PURE__ */ jsx3("br", {}),
      "\u6765\u6E90\u5F00\u5173\u4E0D\u540C / \u6E90\u6570\u636E\u4E0D\u540C\uFF0Ctoken \u53EA\u5BF9\u300C\u80FD\u53D6\u5230\u300D\u7684\u4F1A\u8BDD\u7D2F\u52A0\uFF0C\u4E0D\u81C6\u9020\u8865\u96F6\u3002"
    ] }) })
  ] });
}

// src/TimelineTab.tsx
import { useEffect as useEffect3, useMemo, useState as useState4 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var PAGE_DAYS = 14;
var SRC_CHIPS2 = [
  ["", "\u5168\u90E8"],
  ["polaris", "Polaris"],
  ["v2", "\u4F1A\u8BDDv2"],
  ["claude", "Claude"],
  ["zcode", "ZCode"]
];
function localDayKey(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtDay(day) {
  const d = /* @__PURE__ */ new Date(day + "T00:00:00");
  if (Number.isNaN(d.getTime())) return day;
  const week = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][d.getDay()];
  const today = localDayKey(Date.now());
  if (day === today) return `\u4ECA\u5929 \xB7 ${day} ${week}`;
  return `${day} ${week}`;
}
function TimelineTab() {
  const [catalog, setCatalog] = useState4([]);
  const [loading, setLoading] = useState4(true);
  const [filter, setFilter] = useState4("");
  const [source, setSource] = useState4("");
  const [limitDays, setLimitDays] = useState4(PAGE_DAYS);
  const [openSid, setOpenSid] = useState4(null);
  useEffect3(() => {
    ;
    (async () => {
      const list = await readCatalog();
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setCatalog(list);
      setLoading(false);
    })();
  }, []);
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = catalog.filter((e) => {
      if (source && e.source !== source) return false;
      if (f && !(e.title || "").toLowerCase().includes(f)) return false;
      return true;
    });
    const byDay = /* @__PURE__ */ new Map();
    for (const e of filtered) {
      const day = localDayKey(e.updatedAt);
      if (!day) continue;
      const arr = byDay.get(day) || (byDay.set(day, []), byDay.get(day));
      if (arr) arr.push(e);
    }
    return [...byDay.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([day, sessions]) => ({ day, sessions }));
  }, [catalog, filter, source]);
  if (openSid) {
    return /* @__PURE__ */ jsx4(SessionReader, { sid: openSid, onClose: () => setOpenSid(null) });
  }
  const shown = groups.slice(0, limitDays);
  return /* @__PURE__ */ jsxs4(Fragment3, { children: [
    /* @__PURE__ */ jsx4("div", { className: "ts-card", children: /* @__PURE__ */ jsx4("div", { className: "ts-card-b", children: /* @__PURE__ */ jsxs4("div", { className: "ts-row", children: [
      /* @__PURE__ */ jsx4(
        "input",
        {
          className: "ts-inp",
          style: { flex: 1, minWidth: 140 },
          placeholder: "\u6309\u6807\u9898\u8FC7\u6EE4\u2026",
          value: filter,
          onChange: (e) => setFilter(e.target.value)
        }
      ),
      SRC_CHIPS2.map(([k, label]) => /* @__PURE__ */ jsx4("button", { className: `ts-chip ${source === k ? "on" : ""}`, onClick: () => setSource(k), children: label }, k || "all"))
    ] }) }) }),
    loading && /* @__PURE__ */ jsxs4("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsx4("span", { className: "ts-spin" }),
      " \u8BFB\u53D6\u76EE\u5F55\u2026"
    ] }),
    !loading && catalog.length === 0 && /* @__PURE__ */ jsxs4("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsx4("b", { children: "\u76EE\u5F55\u8FD8\u6CA1\u6709\u6570\u636E" }),
      "\u670D\u52A1\u5B8C\u6210\u9996\u6B21\u626B\u63CF\u540E\uFF0C\u8FD9\u91CC\u6309\u5929\u5217\u51FA\u6240\u6709\u4F1A\u8BDD\u3002"
    ] }),
    !loading && catalog.length > 0 && groups.length === 0 && /* @__PURE__ */ jsxs4("div", { className: "ts-empty", children: [
      /* @__PURE__ */ jsx4("b", { children: "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD" }),
      "\u6362\u4E2A\u8FC7\u6EE4\u8BCD\uFF0C\u6216\u653E\u5BBD\u6765\u6E90\u7B5B\u9009\u3002"
    ] }),
    shown.map(({ day, sessions }) => /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsxs4("div", { className: "ts-sec", children: [
        /* @__PURE__ */ jsx4("span", { className: "ts-bar" }),
        " ",
        fmtDay(day),
        /* @__PURE__ */ jsxs4("span", { className: "ts-hint", children: [
          sessions.length,
          " \u4E2A\u4F1A\u8BDD"
        ] })
      ] }),
      sessions.map((e) => /* @__PURE__ */ jsx4("div", { className: "ts-card ts-hit", onClick: () => setOpenSid(e.sid), children: /* @__PURE__ */ jsxs4("div", { className: "ts-card-b", children: [
        /* @__PURE__ */ jsxs4("div", { className: "ts-row", children: [
          /* @__PURE__ */ jsx4("b", { style: { fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.title }),
          /* @__PURE__ */ jsx4("span", { className: `ts-tag ${e.source}`, children: SOURCE_LABEL[e.source] || e.source })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "ts-sub", style: { marginTop: 4 }, children: [
          e.msgCount,
          " \u6761\u6D88\u606F \xB7 ",
          e.proseChars > 0 ? `${(e.proseChars / 1e3).toFixed(1)}k \u5B57\u5BF9\u8BDD` : "",
          e.workspace ? ` \xB7 ${e.workspace}` : ""
        ] })
      ] }) }, e.sid))
    ] }, day)),
    groups.length > shown.length && /* @__PURE__ */ jsx4("div", { style: { textAlign: "center", padding: "6px 0 14px" }, children: /* @__PURE__ */ jsxs4("button", { className: "ts-btn ghost", onClick: () => setLimitDays(limitDays + PAGE_DAYS), children: [
      "\u518D\u770B ",
      Math.min(PAGE_DAYS, groups.length - shown.length),
      " \u5929\uFF08\u8FD8\u6709 ",
      groups.length - shown.length,
      " \u5929\uFF09"
    ] }) })
  ] });
}

// src/SettingsTab.tsx
import { useCallback as useCallback2, useEffect as useEffect4, useState as useState5 } from "react";
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var SERVICE_ID = "sift-service";
var PLUGIN_ID = "time-sift";
var SOURCE_DESC = {
  polaris: "Polaris \u5BF9\u8BDD\uFF08dialogs JSONL\uFF09",
  v2: "Polaris \u4F1A\u8BDD v2\uFF08messages.db\uFF09",
  claude: "Claude Code \u539F\u751F\uFF08~/.claude/projects\uFF09",
  zcode: "ZCode \u4F1A\u8BDD\uFF08~/.zcode/cli/db.sqlite\uFF09"
};
function SettingsTab({ meta, onMetaRefresh }) {
  const [settings, setSettings] = useState5(null);
  const [svc, setSvc] = useState5(null);
  const [busy, setBusy] = useState5(false);
  const [msg, setMsg] = useState5("");
  const [confirmReindex, setConfirmReindex] = useState5(false);
  const refresh = useCallback2(async () => {
    const [s, st] = await Promise.all([readSettings(), readServiceStatus(SERVICE_ID)]);
    setSettings(s);
    setSvc(st);
  }, []);
  useEffect4(() => {
    refresh();
  }, [refresh]);
  const updateSettings = async (patch) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    setMsg("\u5DF2\u4FDD\u5B58\uFF0C\u670D\u52A1 30 \u79D2\u5185\u70ED\u8BFB\u751F\u6548\u3002");
  };
  const doStart = async () => {
    setBusy(true);
    setMsg("");
    try {
      await selfStartService(PLUGIN_ID, SERVICE_ID);
      setMsg("\u542F\u52A8\u6307\u4EE4\u5DF2\u4E0B\u53D1\uFF0C\u51E0\u79D2\u540E\u5237\u65B0\u770B\u72B6\u6001\u3002");
      onMetaRefresh();
      setTimeout(refresh, 3e3);
    } catch (e) {
      setMsg(`\u542F\u52A8\u5931\u8D25\uFF1A${e.message}`);
    }
    setBusy(false);
  };
  const doStop = async () => {
    setBusy(true);
    setMsg("");
    try {
      await stopService(SERVICE_ID);
      setMsg("\u5DF2\u505C\u6B62\u3002");
      setTimeout(refresh, 2e3);
    } catch (e) {
      setMsg(`\u505C\u6B62\u5931\u8D25\uFF1A${e.message}`);
    }
    setBusy(false);
  };
  const doReindex = async () => {
    if (!confirmReindex) {
      setConfirmReindex(true);
      setMsg("\u91CD\u5EFA\u4F1A\u91CD\u8BFB\u5168\u90E8\u6570\u636E\u6E90\uFF08\u53EF\u80FD\u6570\u5206\u949F\uFF09\uFF0C\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6267\u884C\u3002");
      return;
    }
    setConfirmReindex(false);
    setBusy(true);
    setMsg("");
    try {
      const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await kvSet("sift.cmd.reindex." + nonce, { op: "reindex", nonce, confirm: true, at: Date.now() });
      setMsg("\u91CD\u5EFA\u5DF2\u89E6\u53D1\uFF08\u5F02\u6B65\u6267\u884C\uFF09\u3002\u8FDB\u5EA6\u770B\u4E0A\u65B9\u7D22\u5F15\u72B6\u6001\uFF0Cphase \u56DE\u5230 idle \u5373\u5B8C\u6210\u3002");
      onMetaRefresh();
    } catch (e) {
      setMsg(`\u89E6\u53D1\u5931\u8D25\uFF1A${e.message}`);
    }
    setBusy(false);
  };
  const idx = meta && meta.indexing ? meta.indexing : null;
  const idxBusy = idx && idx.phase !== "idle" && idx.phase !== "error";
  const sourceStats = meta && meta.sources || {};
  return /* @__PURE__ */ jsxs5(Fragment4, { children: [
    /* @__PURE__ */ jsxs5("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "ts-bar" }),
      " \u670D\u52A1\u72B6\u6001"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ts-card", children: /* @__PURE__ */ jsxs5("div", { className: "ts-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ts-row", children: [
        /* @__PURE__ */ jsx5("span", { className: "ts-dot", style: { background: svc && svc.status === "running" ? "#3FB950" : "#F85149" } }),
        /* @__PURE__ */ jsx5("b", { style: { fontSize: 12.5 }, children: svc ? `\u540E\u53F0\u670D\u52A1\uFF1A${svc.status}` : "\u540E\u53F0\u670D\u52A1\uFF1A\u72B6\u6001\u672A\u77E5\uFF08\u670D\u52A1\u7BA1\u7406\u5668\u6CA1\u8FD4\u56DE\u8BE5\u670D\u52A1\uFF09" }),
        /* @__PURE__ */ jsxs5("div", { style: { marginLeft: "auto" }, className: "ts-row", children: [
          /* @__PURE__ */ jsx5("button", { className: "ts-btn sm", disabled: busy, onClick: doStart, children: "\u542F\u52A8" }),
          /* @__PURE__ */ jsx5("button", { className: "ts-btn ghost sm", disabled: busy, onClick: doStop, children: "\u505C\u6B62" })
        ] })
      ] }),
      svc && svc.lastError && /* @__PURE__ */ jsxs5("div", { className: "ts-sub", style: { marginTop: 6, color: "#FF8182" }, children: [
        "\u6700\u8FD1\u9519\u8BEF\uFF1A",
        svc.lastError
      ] }),
      meta && /* @__PURE__ */ jsxs5("div", { className: "ts-sub", style: { marginTop: 6 }, children: [
        "v",
        meta.version || "?",
        " \xB7 \u6865 ",
        meta.degraded ? "\u4E0D\u53EF\u8FBE\uFF08\u964D\u7EA7\uFF09" : meta.bridge || "?",
        " \xB7 \u6570\u636E\u6839 ",
        meta.dataRoot || "\u672A\u627E\u5230",
        meta.smoke ? " \xB7 \u5192\u70DF\u6A21\u5F0F" : "",
        meta.sqlite ? "" : " \xB7 node:sqlite \u4E0D\u53EF\u7528\uFF08v2/zcode \u4E24\u6E90\u964D\u7EA7\u5173\u95ED\uFF0C\u9700 node \u226522.5\uFF09"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "ts-bar" }),
      " \u7D22\u5F15",
      idx && idxBusy && /* @__PURE__ */ jsxs5("span", { className: "ts-hint", children: [
        /* @__PURE__ */ jsx5("span", { className: "ts-spin" }),
        " ",
        idx.phase,
        " ",
        idx.done,
        "/",
        idx.total
      ] })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ts-card", children: /* @__PURE__ */ jsxs5("div", { className: "ts-card-b", children: [
      /* @__PURE__ */ jsx5("div", { className: "ts-sub", children: idx && idx.phase === "error" ? /* @__PURE__ */ jsxs5("span", { style: { color: "#FF8182" }, children: [
        "\u4E0A\u6B21\u7D22\u5F15\u51FA\u9519\uFF1A",
        idx.error || "\u672A\u77E5\u9519\u8BEF"
      ] }) : /* @__PURE__ */ jsxs5(Fragment4, { children: [
        "\u5DF2\u5165\u5E93 ",
        meta && meta.catalog ? meta.catalog.sessions : 0,
        " \u4E2A\u4F1A\u8BDD\u3002\u5404\u6E90\u6700\u8FD1\u626B\u63CF\uFF1A",
        ["polaris", "claude", "v2", "zcode"].map((s) => {
          const st = sourceStats[s];
          return /* @__PURE__ */ jsxs5("span", { style: { marginLeft: 8 }, children: [
            s,
            " ",
            st ? st.err === -1 ? "(\u964D\u7EA7)" : st.err === -2 ? "(\u5931\u8D25)" : st.files > 0 ? `${st.files} \u6587\u4EF6` : "(\u7A7A)" : "\u2014"
          ] }, s);
        })
      ] }) }),
      /* @__PURE__ */ jsxs5("div", { className: "ts-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx5("button", { className: `ts-btn sm ${confirmReindex ? "danger" : "ghost"}`, disabled: busy || !meta, onClick: doReindex, children: "\u91CD\u5EFA\u7D22\u5F15" }),
        /* @__PURE__ */ jsx5("span", { className: "ts-sub", children: "\u6362\u673A\u5668/\u6570\u636E\u6839\u8FC1\u79FB/\u53E3\u5F84\u53D8\u66F4\u540E\u4F7F\u7528\uFF1B\u65E5\u5E38\u589E\u91CF\u81EA\u52A8\u8FDB\u884C\u3002" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "ts-bar" }),
      " \u6570\u636E\u6E90"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ts-card", children: /* @__PURE__ */ jsxs5("div", { className: "ts-card-b", children: [
      settings && ["polaris", "v2", "claude", "zcode"].map((s) => /* @__PURE__ */ jsxs5("label", { className: "ts-row", style: { marginBottom: 8, cursor: "pointer", fontSize: 12 }, children: [
        /* @__PURE__ */ jsx5(
          "input",
          {
            type: "checkbox",
            checked: settings.sources[s],
            onChange: (e) => updateSettings({ sources: { ...settings.sources, [s]: e.target.checked } })
          }
        ),
        SOURCE_DESC[s]
      ] }, s)),
      /* @__PURE__ */ jsx5("div", { className: "ts-sub", children: "\u5173\u6389\u7684\u6E90\u4F1A\u88AB\u6458\u51FA\u7D22\u5F15\uFF08\u91CD\u5F00\u4F1A\u5168\u91CF\u91CD\u626B\uFF09\u3002SQLite \u4E24\u6E90\u9700 node \u2265 22.5\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "ts-bar" }),
      " \u6392\u9664\u8BCD",
      /* @__PURE__ */ jsx5("span", { className: "ts-hint", children: "\u6807\u9898\u6216\u8DEF\u5F84\u5305\u542B\u5373\u4E0D\u5165\u5E93\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ts-card", children: /* @__PURE__ */ jsxs5("div", { className: "ts-card-b", children: [
      /* @__PURE__ */ jsx5(
        "textarea",
        {
          className: "ts-inp",
          style: { minHeight: 64, resize: "vertical", fontFamily: "inherit" },
          placeholder: "\u5982\uFF1A\n\u5BC6\u7801\n\u79C1\u5BC6\u9879\u76EE\u540D",
          value: settings ? settings.excludeKeywords.join("\n") : "",
          onChange: (e) => {
            if (!settings) return;
            setSettings({ ...settings, excludeKeywords: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) });
          },
          onBlur: () => settings && updateSettings({ excludeKeywords: settings.excludeKeywords })
        }
      ),
      /* @__PURE__ */ jsx5("div", { className: "ts-sub", style: { marginTop: 6 }, children: "\u4FDD\u5B58\u540E\u65B0\u626B\u63CF\u5373\u65F6\u751F\u6548\uFF1B\u5DF2\u5165\u5E93\u6761\u76EE\u5728\u4E0B\u8F6E kv \u63D0\u4EA4\u65F6\u79FB\u51FA\u53EF\u89C1\u76EE\u5F55\u3002" })
    ] }) }),
    msg && /* @__PURE__ */ jsx5("div", { className: "ts-sub", style: { padding: "2px 18px 10px" }, children: msg }),
    /* @__PURE__ */ jsxs5("div", { className: "ts-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "ts-bar" }),
      " \u9690\u79C1"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "ts-card", children: /* @__PURE__ */ jsx5("div", { className: "ts-card-b ts-sub", children: "\u4F1A\u8BDD\u8BB0\u5FC6\u662F\u7EAF\u672C\u5730\u63D2\u4EF6\uFF1A\u6570\u636E\u6E90\u53EA\u8BFB\uFF0C\u7D22\u5F15\u7F13\u5B58\u843D\u5728\u5E94\u7528\u914D\u7F6E\u76EE\u5F55\uFF08time-sift/\uFF09\uFF0C\u5BF9\u5916\u96F6\u7F51\u7EDC\u8BF7\u6C42\u3002 \u53EF\u89C1\u6570\u636E\u7ECF cap.kv \u5728\u4F60\u7684\u8BBE\u5907\u4E4B\u95F4\u540C\u6B65\uFF08\u684C\u9762/\u624B\u673A/Web \u540C\u4E00\u8D26\u53F7\uFF09\uFF0C\u4E0D\u7ECF\u4EFB\u4F55\u7B2C\u4E09\u65B9\u3002" }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.ts-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ts-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ts-body{flex:1;overflow-y:auto;padding:0 0 28px}
.ts-body::-webkit-scrollbar{width:9px;height:9px}
.ts-body::-webkit-scrollbar-track{background:transparent}
.ts-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ts-page{max-width:620px;margin:0 auto}

/* \u5934\u90E8 */
.ts-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ts-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#7A5CFF,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ts-tt{flex:1;min-width:0}
.ts-tt b{font-size:15px;display:block}
.ts-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ts-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ts-dot.busy{background:#D29922;box-shadow:0 0 6px rgba(210,153,34,.6)}
.ts-dot.down{background:#F85149}
.ts-tabs{display:flex;gap:4px}
.ts-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;min-height:28px}
.ts-tab:hover{color:#E6EAF2}
.ts-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* \u901A\u7528 */
.ts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ts-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 6px;font-size:13px;font-weight:700}
.ts-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#7A5CFF,#58A6FF);flex-shrink:0}
.ts-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ts-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ts-card-b{padding:11px 13px}
.ts-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ts-dim{color:#5C6678}
.ts-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ts-tag.v2{color:#79C0FF;border-color:#1f3a5f}
.ts-tag.claude{color:#D2A8FF;border-color:#3a2a55}
.ts-tag.zcode{color:#7EE787;border-color:#254a2b}
.ts-tag.polaris{color:#FFA657;border-color:#4a3320}
.ts-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600;min-height:32px}
.ts-btn:hover{filter:brightness(1.12)}
.ts-btn:disabled{opacity:.45;cursor:not-allowed}
.ts-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ts-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ts-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px;min-height:26px}
.ts-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:8px 11px;font-size:12.5px;width:100%;min-width:0}
.ts-inp:focus{outline:none;border-color:#5865F2}
.ts-inp::placeholder{color:#4d5566}
.ts-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px}
.ts-chip{background:#12151c;border:1px solid #2a2f3a;border-radius:14px;color:#8B95A7;font-size:11px;padding:4px 11px;cursor:pointer;min-height:26px}
.ts-chip.on{background:#1C2330;border-color:#5865F2;color:#E6EAF2;font-weight:600}
.ts-err{background:#2d1518;border:1px solid #54262c;color:#FF8182;border-radius:9px;padding:8px 12px;font-size:11.5px;margin:0 16px 10px;word-break:break-all}
.ts-empty{padding:36px 20px;text-align:center;color:#5C6678;font-size:12px;line-height:1.9}
.ts-empty b{color:#8B95A7;display:block;font-size:13px;margin-bottom:6px}
.ts-mark{background:rgba(88,101,242,.35);color:#B3B9FF;border-radius:3px;padding:0 1px}
.ts-hit{cursor:pointer}
.ts-hit:hover{border-color:#3a4358}
.ts-spin{display:inline-block;width:12px;height:12px;border:2px solid #3a4358;border-top-color:#58A6FF;border-radius:50%;animation:ts-rot 0.9s linear infinite;vertical-align:-2px}
@keyframes ts-rot{to{transform:rotate(360deg)}}
`;
function TimeSiftPanel({ pluginId }) {
  const [tab, setTab] = useState6("search");
  const [meta, setMeta] = useState6(null);
  const [metaErr, setMetaErr] = useState6("");
  const refreshMeta = useCallback3(async () => {
    try {
      const m = await readMeta();
      setMeta(m);
      setMetaErr("");
    } catch (e) {
      setMetaErr(e.message);
    }
  }, []);
  useEffect5(() => {
    refreshMeta();
    const t = setInterval(refreshMeta, 8e3);
    return () => clearInterval(t);
  }, [refreshMeta]);
  const status = (() => {
    if (metaErr) return "down";
    if (!meta) return "down";
    if (meta.indexing && meta.indexing.phase !== "idle" && meta.indexing.phase !== "error") return "busy";
    if (meta.degraded) return "down";
    return "ok";
  })();
  const statusText = (() => {
    if (metaErr) return "\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528";
    if (!meta) return "\u670D\u52A1\u5FC3\u8DF3\u7F3A\u5931\uFF08\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF09";
    const idx = meta.indexing;
    if (idx && idx.phase !== "idle" && idx.phase !== "error") return `\u5EFA\u7D22\u5F15\u4E2D ${idx.done}/${idx.total}\uFF08${idx.phase}\uFF09\u2026`;
    if (idx && idx.phase === "error") return "\u7D22\u5F15\u51FA\u9519\uFF08\u770B\u8BBE\u7F6E\u9875\uFF09";
    if (meta.degraded) return "\u6865\u4E0D\u53EF\u8FBE\uFF08\u964D\u7EA7\u8FD0\u884C\uFF09";
    const n = meta.catalog ? meta.catalog.sessions : 0;
    return `${n} \u4E2A\u4F1A\u8BDD\u5DF2\u5165\u5E93`;
  })();
  return /* @__PURE__ */ jsxs6("div", { className: "ts-root", "data-plugin-scope": pluginId, children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "ts-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "ts-logo", children: "\u23F3" }),
      /* @__PURE__ */ jsxs6("div", { className: "ts-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u4F1A\u8BDD\u8BB0\u5FC6" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          /* @__PURE__ */ jsx6("span", { className: `ts-dot ${status}` }),
          statusText
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "ts-tabs", children: [
        ["search", "\u641C\u7D22"],
        ["footprint", "\u8DB3\u8FF9"],
        ["timeline", "\u65F6\u5149\u673A"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx6("button", { className: `ts-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "ts-body", children: /* @__PURE__ */ jsxs6("div", { className: "ts-page", children: [
      tab === "search" && /* @__PURE__ */ jsx6(SearchTab, { meta }),
      tab === "footprint" && /* @__PURE__ */ jsx6(FootprintTab, {}),
      tab === "timeline" && /* @__PURE__ */ jsx6(TimelineTab, {}),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { meta, onMetaRefresh: refreshMeta })
    ] }) })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function TimeSiftEntry(props) {
  return /* @__PURE__ */ jsx7(TimeSiftPanel, { pluginId: props.pluginId });
}
export {
  TimeSiftEntry as default
};
