// src/Panel.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";

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
var STATUS_ORDER = ["idea", "analyzed", "specd", "approved", "building", "delivered", "published", "shelved"];
var STATUS_LABEL = {
  idea: "\u60F3\u6CD5",
  analyzed: "\u5DF2\u5206\u6790",
  specd: "\u5DF2\u5199spec",
  approved: "\u5DF2\u62CD\u677F",
  building: "\u5B9E\u65BD\u4E2D",
  delivered: "\u5DF2\u4EA4\u4ED8",
  published: "\u5DF2\u4E0A\u67B6",
  shelved: "\u6401\u7F6E"
};
var PRIORITY_LABEL = { high: "\u9AD8", medium: "\u4E2D", low: "\u4F4E" };
async function kvGet(key) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", {
    req: { target: "cap.kv", payload: { action: "get", key } }
  });
  if (!res || res.ok === false) {
    throw new Error(String(res?.error || "cap.kv get \u5931\u8D25"));
  }
  const result = res.result ?? res;
  if (result && typeof result === "object" && "value" in result) {
    return result.value;
  }
  return result;
}
async function getMeta() {
  const m = await kvGet("needs.meta");
  if (!m || typeof m !== "object") return null;
  const meta = m;
  if (typeof meta.token !== "string" || !meta.token || typeof meta.port !== "number" || !meta.port) {
    return null;
  }
  return meta;
}
var NeedsApiError = class extends Error {
  constructor(msg, code, actualMtimeMs) {
    super(msg);
    this.code = code;
    this.actualMtimeMs = actualMtimeMs;
  }
};
async function api(meta, path, body) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", {
    req: {
      target: "cap.http",
      payload: {
        action: "request",
        method: "POST",
        url: `http://127.0.0.1:${meta.port}/api/${path}`,
        headers: { "Content-Type": "application/json", "X-Needs-Token": meta.token },
        body: JSON.stringify(body),
        bodyType: "json",
        timeoutMs: 3e4
      }
    }
  });
  if (!res || res.ok === false) {
    throw new NeedsApiError(String(res?.error || "cap.http \u8F6C\u53D1\u5931\u8D25\uFF08\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF09"));
  }
  const http = res.result ?? {};
  let json = null;
  try {
    json = JSON.parse(String(http.body ?? ""));
  } catch {
    json = null;
  }
  if (!json) throw new NeedsApiError(`\u670D\u52A1\u54CD\u5E94\u4E0D\u53EF\u89E3\u6790\uFF08HTTP ${http.status ?? "?"}\uFF09`);
  if (json.ok !== true) throw new NeedsApiError(String(json.error || "\u8BF7\u6C42\u5931\u8D25"), json.code, json.actualMtimeMs);
  return json;
}
var apiList = (meta, filter = {}) => api(meta, "list", filter);
var apiShow = (meta, id) => api(meta, "show", { id });
var apiAdd = (meta, args) => api(meta, "add", args);
var apiUpdate = (meta, args) => api(meta, "update", args);
var apiHandoff = (meta, id, stage) => api(meta, "handoff", { id, stage });
var apiConfig = (meta, root) => api(meta, "config", root ? { root } : {});
var apiProbe = (meta, path) => api(meta, "probe", { path });

// src/KanbanTab.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var BADGE_CLASS = {
  idea: "nd-badge",
  analyzed: "nd-badge info",
  specd: "nd-badge info",
  approved: "nd-badge ok",
  building: "nd-badge warn",
  delivered: "nd-badge ok",
  published: "nd-badge ok",
  shelved: "nd-badge"
};
function splitSections(raw) {
  const lines = raw.split("\n");
  const out = [];
  let cur = null;
  let inFm = false;
  let fmDone = false;
  for (const line of lines) {
    if (line.trim() === "---" && !fmDone) {
      inFm = !inFm;
      if (!inFm) fmDone = true;
      continue;
    }
    if (inFm) continue;
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (cur) out.push({ name: cur.name, body: cur.body.join("\n").trim() });
      cur = { name: h[1], body: [] };
    } else if (cur) cur.body.push(line);
  }
  if (cur) out.push({ name: cur.name, body: cur.body.join("\n").trim() });
  return out;
}
function KanbanTab({ meta, onAddFail }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [answer, setAnswer] = useState("");
  const [decision, setDecision] = useState("");
  const refresh = useCallback(async (keepExpand) => {
    try {
      const { rows: list } = await apiList(meta, {});
      setRows(list);
      if (keepExpand) {
        const row = list.find((r) => r.id === keepExpand);
        if (row) setDetail(await apiShow(meta, keepExpand));
        else {
          setExpanded("");
          setDetail(null);
        }
      }
    } catch (e) {
      setError(String(e.message));
    }
  }, [meta]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const grouped = useMemo(() => {
    const g = [];
    for (const s of STATUS_ORDER) {
      const items = rows.filter((r) => r.status === s && (!filter || r.status === filter));
      if (items.length) g.push({ status: s, items });
    }
    const rest = rows.filter((r) => !STATUS_ORDER.includes(r.status) && (!filter || r.status === filter));
    if (rest.length) g.push({ status: "unknown", items: rest });
    return g;
  }, [rows, filter]);
  async function run(name, fn) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(String(e.message));
    } finally {
      setBusy("");
    }
  }
  const quickAdd = () => run("add", async () => {
    const title = quickTitle.trim();
    if (!title) return;
    const r = await apiAdd(meta, { title });
    setQuickTitle("");
    setNotice(`\u5DF2\u8BB0\u5F55 #${r.id}\uFF08idea\uFF09\uFF1A${r.file}`);
    setExpanded(r.id);
    await refresh(r.id);
  });
  const openCard = (id) => run("open", async () => {
    if (expanded === id) {
      setExpanded("");
      setDetail(null);
      return;
    }
    setExpanded(id);
    setAnswer("");
    setDecision("");
    setDetail(await apiShow(meta, id));
  });
  const changeStatus = (row, status) => run("status", async () => {
    if (status === "approved" && !window.confirm(`\u62CD\u677F #${row.id}\u300C${row.title}\u300D\uFF1F
\u62CD\u677F\u540E\u591C\u73ED\u4F1A\u6309 build-plugin \u63D0\u793A\u8BCD\u5B9E\u65BD\u8BE5\u9700\u6C42\u3002`)) return;
    await apiUpdate(meta, { id: row.id, fields: { status }, expectedMtimeMs: detail?.mtimeMs ?? row.mtimeMs });
    setNotice(`#${row.id} \u72B6\u6001 \u2192 ${STATUS_LABEL[status] || status}`);
    await refresh(row.id);
  });
  const changePriority = (row, priority) => run("prio", async () => {
    await apiUpdate(meta, { id: row.id, fields: { priority }, expectedMtimeMs: detail?.mtimeMs ?? row.mtimeMs });
    await refresh(row.id);
  });
  const answerClarify = () => run("answer", async () => {
    const text = answer.trim();
    if (!text || !detail) return;
    await apiUpdate(meta, { id: expanded, append: { section: "\u5F85\u6F84\u6E05", text: `A\uFF08\u9762\u677F\uFF09\uFF1A${text}` }, expectedMtimeMs: detail.mtimeMs });
    setAnswer("");
    setNotice("\u5DF2\u56DE\u7B54\uFF0C\u591C\u73ED\u4E0B\u6B21\u5DE1\u903B\u4F1A\u6D88\u8D39");
    await refresh(expanded);
  });
  const appendDecision = () => run("decision", async () => {
    const text = decision.trim();
    if (!text || !detail) return;
    await apiUpdate(meta, { id: expanded, append: { section: "\u51B3\u7B56\u8BB0\u5F55", text: `- ${text}` }, expectedMtimeMs: detail.mtimeMs });
    setDecision("");
    await refresh(expanded);
  });
  const copyHandoff = (stage) => run("handoff", async () => {
    const r = await apiHandoff(meta, expanded, stage);
    try {
      await navigator.clipboard.writeText(r.text);
      setNotice(`\u5F00\u5DE5\u63D0\u793A\u8BCD\uFF08${stage}\uFF09\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F`);
    } catch (_) {
      setNotice(`\u63D0\u793A\u8BCD\u5DF2\u6E32\u67D3\uFF08${r.text.length} \u5B57\uFF09\uFF0C\u6D4F\u89C8\u5668\u526A\u8D34\u677F\u4E0D\u53EF\u7528\u2014\u2014\u8BF7\u5728\u8BE6\u60C5\u533A\u624B\u52A8\u590D\u5236`);
      setDetail({ ...detail, raw: r.text });
    }
  });
  const sections = detail ? splitSections(detail.raw) : [];
  return /* @__PURE__ */ jsxs("div", { className: "nd-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "nd-quick", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "nd-inp",
          placeholder: "\u4E00\u53E5\u8BDD\u8BB0\u4E2A\u9700\u6C42\uFF0C\u56DE\u8F66\u6216\u70B9\u8BB0\u4E0B \u2192",
          value: quickTitle,
          onChange: (e) => setQuickTitle(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") quickAdd();
          }
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "nd-btn", disabled: !quickTitle.trim() || busy === "add", onClick: quickAdd, children: "\u8BB0\u4E0B" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "nd-chiprow", children: [
      /* @__PURE__ */ jsxs("button", { className: `nd-chip${filter === "" ? " on" : ""}`, onClick: () => setFilter(""), children: [
        "\u5168\u90E8 ",
        rows.length
      ] }),
      STATUS_ORDER.map((s) => {
        const n = rows.filter((r) => r.status === s).length;
        if (!n) return null;
        return /* @__PURE__ */ jsxs("button", { className: `nd-chip${filter === s ? " on" : ""}`, onClick: () => setFilter(filter === s ? "" : s), children: [
          STATUS_LABEL[s],
          " ",
          n
        ] }, s);
      })
    ] }),
    notice && /* @__PURE__ */ jsx("div", { className: "nd-ok", children: notice }),
    error && /* @__PURE__ */ jsx("div", { className: "nd-alert bad", children: error }),
    grouped.map((g) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "nd-sec", children: [
        /* @__PURE__ */ jsx("span", { className: `nd-bar st-${g.status}` }),
        STATUS_LABEL[g.status] || "\u672A\u77E5\u72B6\u6001",
        /* @__PURE__ */ jsxs("span", { className: "nd-hint", children: [
          g.items.length,
          " \u6761"
        ] })
      ] }),
      g.items.map((r) => /* @__PURE__ */ jsxs("div", { className: "nd-item", children: [
        /* @__PURE__ */ jsxs("div", { className: "nd-item-head", style: { cursor: "pointer" }, onClick: () => openCard(r.id), children: [
          /* @__PURE__ */ jsxs("span", { className: `nd-badge ${BADGE_CLASS[r.status] || "nd-badge"}`, children: [
            "#",
            r.id
          ] }),
          /* @__PURE__ */ jsx("b", { children: r.title }),
          r.pendingClarify > 0 && /* @__PURE__ */ jsxs("span", { className: "nd-badge bad", children: [
            "\u5F85\u6F84\u6E05 ",
            r.pendingClarify
          ] }),
          /* @__PURE__ */ jsx("span", { className: "nd-badge", children: PRIORITY_LABEL[r.priority] || r.priority })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "nd-item-mid", children: [
          r.updated,
          " \u66F4\u65B0",
          r.delivered ? ` \xB7 ${r.delivered.slice(0, 8)}` : "",
          r.spec ? " \xB7 \u6709spec" : ""
        ] }),
        expanded === r.id && /* @__PURE__ */ jsxs("div", { className: "nd-detail", children: [
          !detail && /* @__PURE__ */ jsx("div", { className: "nd-sub", children: "\u52A0\u8F7D\u4E2D\u2026" }),
          detail && /* @__PURE__ */ jsxs(Fragment, { children: [
            sections.filter((s) => s.name !== "\u51B3\u7B56\u8BB0\u5F55" || s.body).map((s) => /* @__PURE__ */ jsxs("div", { className: "nd-secb", children: [
              /* @__PURE__ */ jsx("div", { className: "nd-lbl", children: s.name }),
              /* @__PURE__ */ jsx("pre", { className: "nd-pre", children: s.body || "\uFF08\u7A7A\uFF09" })
            ] }, s.name)),
            /* @__PURE__ */ jsxs("div", { className: "nd-row", children: [
              /* @__PURE__ */ jsx("label", { className: "nd-lbl", style: { margin: 0 }, children: "\u72B6\u6001" }),
              /* @__PURE__ */ jsx(
                "select",
                {
                  className: "nd-inp nd-sel",
                  value: r.status,
                  disabled: busy === "status",
                  onChange: (e) => changeStatus(r, e.target.value),
                  children: STATUS_ORDER.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: STATUS_LABEL[s] }, s))
                }
              ),
              /* @__PURE__ */ jsx("label", { className: "nd-lbl", style: { margin: 0 }, children: "\u4F18\u5148\u7EA7" }),
              /* @__PURE__ */ jsx(
                "select",
                {
                  className: "nd-inp nd-sel",
                  value: r.priority,
                  disabled: busy === "prio",
                  onChange: (e) => changePriority(r, e.target.value),
                  children: ["high", "medium", "low"].map((p) => /* @__PURE__ */ jsx("option", { value: p, children: PRIORITY_LABEL[p] }, p))
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "nd-secb", children: [
              /* @__PURE__ */ jsx("div", { className: "nd-lbl", children: "\u56DE\u7B54\u5F85\u6F84\u6E05\uFF08\u8FFD\u52A0\u5230\u6761\u76EE\uFF0C\u591C\u73ED\u6D88\u8D39\uFF09" }),
              /* @__PURE__ */ jsx(
                "textarea",
                {
                  className: "nd-inp",
                  rows: 2,
                  value: answer,
                  onChange: (e) => setAnswer(e.target.value),
                  placeholder: "\u5982\uFF1A\u5165\u53E3\u653E\u8BBE\u7F6E\u9875\uFF0C\u624B\u52A8\u6DFB\u52A0\u76EE\u5F55"
                }
              ),
              /* @__PURE__ */ jsx("button", { className: "nd-btn sm", disabled: !answer.trim() || busy === "answer", onClick: answerClarify, children: "\u8FFD\u52A0\u56DE\u7B54" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "nd-secb", children: [
              /* @__PURE__ */ jsx("div", { className: "nd-lbl", children: "\u51B3\u7B56\u8BB0\u5F55\u8FFD\u52A0" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "nd-inp",
                  value: decision,
                  onChange: (e) => setDecision(e.target.value),
                  placeholder: "\u5982\uFF1A2026-10-30 \u62CD\u677F\u8D70\u65B9\u6848A"
                }
              ),
              /* @__PURE__ */ jsx("button", { className: "nd-btn sm ghost", disabled: !decision.trim() || busy === "decision", onClick: appendDecision, children: "\u8FFD\u52A0" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "nd-secb", children: [
              /* @__PURE__ */ jsx("div", { className: "nd-lbl", children: "\u5F00\u5DE5\u63D0\u793A\u8BCD\uFF08\u590D\u5236\u7ED9\u4EFB\u610F agent\uFF09" }),
              /* @__PURE__ */ jsxs("div", { className: "nd-row", children: [
                /* @__PURE__ */ jsx("button", { className: "nd-btn sm ghost", disabled: busy === "handoff", onClick: () => copyHandoff("analyze"), children: "\u5206\u6790" }),
                /* @__PURE__ */ jsx("button", { className: "nd-btn sm ghost", disabled: busy === "handoff", onClick: () => copyHandoff("write-spec"), children: "\u5199spec" }),
                /* @__PURE__ */ jsx("button", { className: "nd-btn sm ghost", disabled: busy === "handoff", onClick: () => copyHandoff("build-plugin"), children: "\u5B9E\u65BD" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "nd-sub", children: [
              "mtimeMs=",
              detail.mtimeMs,
              " \xB7 ",
              detail.file
            ] })
          ] })
        ] })
      ] }, r.id))
    ] }, g.status)),
    !rows.length && /* @__PURE__ */ jsx("div", { className: "nd-sub", style: { padding: "18px 18px" }, children: "\u8FD8\u6CA1\u6709\u6761\u76EE\u2014\u2014\u5728\u4E0A\u9762\u8F93\u5165\u6846\u8BB0\u7B2C\u4E00\u6761\u9700\u6C42\u5427\u3002" }),
    onAddFail && null
  ] });
}

// src/SettingsTab.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function SettingsTab({ meta }) {
  const [info, setInfo] = useState2(null);
  const [root, setRoot] = useState2("");
  const [busy, setBusy] = useState2("");
  const [error, setError] = useState2("");
  const [notice, setNotice] = useState2("");
  const load = useCallback2(async () => {
    try {
      setError("");
      const c = await apiConfig(meta);
      setInfo(c);
      setRoot(c.root);
    } catch (e) {
      setError(String(e.message));
    }
  }, [meta]);
  useEffect2(() => {
    load();
  }, [load]);
  async function run(name, fn) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(String(e.message));
    } finally {
      setBusy("");
    }
  }
  const probe = () => run("probe", async () => {
    const r = await apiProbe(meta, root);
    setNotice(r.exists ? r.isDir ? "\u2713 \u76EE\u5F55\u5B58\u5728\u53EF\u7528" : "\u2717 \u8DEF\u5F84\u5B58\u5728\u4F46\u4E0D\u662F\u76EE\u5F55" : "\u76EE\u5F55\u4E0D\u5B58\u5728\u2014\u2014\u4FDD\u5B58\u65F6\u4F1A\u81EA\u52A8\u521B\u5EFA");
  });
  const save = () => run("save", async () => {
    const c = await apiConfig(meta, root);
    setInfo(c);
    setNotice(`\u5DF2\u4FDD\u5B58\u5E76\u521B\u5EFA\uFF1A${c.root}`);
  });
  const sourceLabel = {
    arg: "--needs-root \u53C2\u6570\uFF08\u6E90\u7801/\u547D\u4EE4\u884C\u6A21\u5F0F\uFF09",
    config: "needs-root.json \u914D\u7F6E",
    default: "\u6E90\u7801\u4ED3\u7F3A\u7701\u63A2\u6D4B"
  };
  return /* @__PURE__ */ jsxs2("div", { className: "nd-body", children: [
    notice && /* @__PURE__ */ jsx2("div", { className: "nd-ok", children: notice }),
    error && /* @__PURE__ */ jsx2("div", { className: "nd-alert bad", children: error }),
    /* @__PURE__ */ jsx2("div", { className: "nd-card", children: /* @__PURE__ */ jsxs2("div", { className: "nd-card-b", children: [
      /* @__PURE__ */ jsx2("label", { className: "nd-lbl", children: "\u9700\u6C42\u5E93\u6839\u76EE\u5F55\uFF08\u516C\u7EA6 README.md \u6240\u5728\u5730\uFF09" }),
      /* @__PURE__ */ jsx2(
        "input",
        {
          className: "nd-inp",
          "data-testid": "root-input",
          value: root,
          onChange: (e) => setRoot(e.target.value),
          placeholder: "\u5982 D:\\space\\base\\Polaris-plugin\\needs"
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "nd-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "nd-btn sm ghost", disabled: busy === "probe", onClick: probe, children: "\u63A2\u6D4B" }),
        /* @__PURE__ */ jsx2("button", { className: "nd-btn sm", disabled: busy === "save" || !root.trim(), onClick: save, children: "\u4FDD\u5B58\u5E76\u521B\u5EFA" })
      ] }),
      info && /* @__PURE__ */ jsxs2("div", { className: "nd-sub", style: { marginTop: 10 }, children: [
        "\u5F53\u524D\uFF1A",
        info.root,
        /* @__PURE__ */ jsx2("br", {}),
        "\u6765\u6E90\uFF1A",
        sourceLabel[info.source] || info.source,
        " \xB7 \u6761\u76EE ",
        info.entryCount,
        info.hasReadme ? "" : " \xB7 \u26A0 \u7F3A README.md \u516C\u7EA6",
        info.hasPrompts === false ? " \xB7 \u26A0 \u7F3A prompts/ \u63D0\u793A\u8BCD\u6A21\u677F" : ""
      ] })
    ] }) }),
    /* @__PURE__ */ jsx2("div", { className: "nd-card", children: /* @__PURE__ */ jsxs2("div", { className: "nd-card-b", children: [
      /* @__PURE__ */ jsx2("label", { className: "nd-lbl", children: "\u670D\u52A1\u72B6\u6001" }),
      /* @__PURE__ */ jsxs2("div", { className: "nd-sub", children: [
        "\u6570\u636E\u9762\uFF1A127.0.0.1:",
        meta.port,
        "\uFF08\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u8DE8\u7AEF\u514D\u8DE8\u57DF\uFF1Btoken \u5DF2\u6CE8\u5165 cap.kv needs.meta\uFF09",
        /* @__PURE__ */ jsx2("br", {}),
        "\u9762\u677F\u7248\u672C\uFF1A",
        meta.version || "?",
        " \xB7 MCP \u516D\u5DE5\u5177\u4E0E\u591C\u73ED automation \u5171\u7528\u540C\u4E00\u903B\u8F91\u6838",
        /* @__PURE__ */ jsx2("br", {}),
        "ZCode \u4FA7\u4E0D\u7ECF\u9762\u677F\uFF1A.zcode/config.json \u4EE5 --needs-root \u76F4\u8FDE\u6E90\u7801\u76EE\u5F55"
      ] })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var css = `
.nd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.nd-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.nd-body{flex:1;overflow-y:auto;padding:4px 0 24px}
.nd-body::-webkit-scrollbar{width:9px}
.nd-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.nd-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.nd-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3B82C4,#1F5E96);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.nd-tt{flex:1;min-width:0}
.nd-tt b{font-size:15px;display:block}
.nd-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.nd-tabs{display:flex;gap:4px}
.nd-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.nd-tab:hover{color:#E6EAF2}
.nd-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.nd-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.nd-bar{width:3px;height:13px;border-radius:2px;flex-shrink:0}
.nd-bar.st-idea{background:#8B95A7}.nd-bar.st-analyzed{background:#5B9BD5}.nd-bar.st-specd{background:#8A5CF6}
.nd-bar.st-approved{background:#F2B263}.nd-bar.st-building{background:#E8912D}.nd-bar.st-delivered{background:#7EE2A0}
.nd-bar.st-published{background:#4ADE80}.nd-bar.st-unknown{background:#8B95A7}
.nd-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.nd-quick{display:flex;gap:8px;padding:4px 18px 8px}
.nd-quick .nd-inp{flex:1}
.nd-chiprow{display:flex;gap:6px;padding:4px 18px 8px;flex-wrap:wrap;align-items:center}
.nd-chip{background:#1C2330;border:1px solid #2a2f3a;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.nd-chip:hover{border-color:#3a4356}
.nd-chip.on{background:#1d2c47;border-color:#3B82C4;color:#A8CCEF;font-weight:600}
.nd-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.nd-card-b{padding:11px 13px}
.nd-btn{background:#3B82C4;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.nd-btn:hover{filter:brightness(1.12)}
.nd-btn:disabled{opacity:.45;cursor:not-allowed}
.nd-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.nd-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px;margin-top:6px;margin-right:6px}
.nd-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;resize:vertical}
.nd-inp:focus{outline:none;border-color:#3B82C4}
.nd-inp::placeholder{color:#4d5566}
.nd-sel{width:auto;flex:1;min-width:0;appearance:auto}
.nd-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.nd-item{background:#161B22;border:1px solid #242C3A;border-radius:12px;margin:0 16px 8px;padding:10px 13px}
.nd-item-head{display:flex;align-items:center;gap:8px}
.nd-item-head b{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nd-badge{flex-shrink:0;font-size:9.5px;color:#8B95A7;background:#1C2330;border:1px solid #2a2f3a;border-radius:6px;padding:1px 6px;white-space:nowrap}
.nd-badge.info{color:#A8CCEF;border-color:#22384d}
.nd-badge.warn{color:#F2B263;border-color:#5a3d1a}
.nd-badge.bad{color:#FF8A9A;border-color:#54262c}
.nd-badge.ok{color:#7EE2A0;border-color:#2b4a35}
.nd-item-mid{font-size:11px;color:#8B95A7;margin-top:3px;word-break:break-all}
.nd-detail{border-top:1px dashed #2a2f3a;margin-top:9px;padding-top:9px}
.nd-secb{margin:6px 0 2px}
.nd-pre{background:#12151c;border:1px solid #222835;border-radius:8px;padding:7px 9px;font:11px/1.6 Consolas,Menlo,monospace;color:#C6CFDD;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;margin:0}
.nd-row{display:flex;gap:8px;align-items:center}
.nd-sub{font-size:10.5px;color:#8B95A7;line-height:1.6;word-break:break-all}
.nd-alert{border-radius:10px;padding:8px 12px;margin:6px 16px;font-size:11.5px;border:1px solid;line-height:1.7}
.nd-alert.bad{background:rgba(248,81,73,.07);border-color:#54262c;color:#FF8A9A}
.nd-ok{background:rgba(126,226,160,.06);border:1px solid #2b4a35;border-radius:10px;padding:8px 12px;margin:6px 16px;font-size:11.5px;color:#7EE2A0;line-height:1.7;word-break:break-all}
.nd-center{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
.nd-center .nd-card{max-width:340px}
`;
function NeedsPanel(_props) {
  const [meta, setMeta] = useState3(null);
  const [metaErr, setMetaErr] = useState3("");
  const [tab, setTab] = useState3("kanban");
  useEffect3(() => {
    getMeta().then((m) => {
      if (m) setMeta(m);
      else setMetaErr("cap.kv \u91CC\u8FD8\u6CA1\u6709 needs.meta\uFF08\u670D\u52A1\u672A\u542F\u52A8\u6216\u672A\u5199\u8FC7 meta\uFF09\uFF1A\u8BF7\u7A0D\u5019\u91CD\u8BD5\uFF0C\u6216\u5728 Polaris \u684C\u9762\u7AEF\u91CD\u5F00\u4E00\u6B21\u9762\u677F\u8BA9\u5BBF\u4E3B\u62C9\u8D77\u670D\u52A1\u3002");
    }).catch((e) => setMetaErr(String(e.message)));
  }, []);
  return /* @__PURE__ */ jsxs3("div", { className: "nd-root", children: [
    /* @__PURE__ */ jsx3("style", { children: css }),
    /* @__PURE__ */ jsxs3("div", { className: "nd-top", children: [
      /* @__PURE__ */ jsx3("div", { className: "nd-logo", children: "\u{1F4CB}" }),
      /* @__PURE__ */ jsxs3("div", { className: "nd-tt", children: [
        /* @__PURE__ */ jsx3("b", { children: "\u9700\u6C42\u5E93" }),
        /* @__PURE__ */ jsx3("small", { children: "\u4E00\u5E93\u4E24\u7AEF \xB7 \u591C\u73ED\u6D88\u5316 \xB7 \u62CD\u677F\u5728\u4F60" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "nd-tabs", children: [
        /* @__PURE__ */ jsx3("button", { className: `nd-tab${tab === "kanban" ? " on" : ""}`, onClick: () => setTab("kanban"), children: "\u770B\u677F" }),
        /* @__PURE__ */ jsx3("button", { className: `nd-tab${tab === "settings" ? " on" : ""}`, onClick: () => setTab("settings"), children: "\u8BBE\u7F6E" })
      ] })
    ] }),
    !meta && /* @__PURE__ */ jsx3("div", { className: "nd-center", children: /* @__PURE__ */ jsx3("div", { className: "nd-card", children: /* @__PURE__ */ jsx3("div", { className: "nd-card-b", children: /* @__PURE__ */ jsx3("div", { className: "nd-sub", children: metaErr || "\u8FDE\u63A5\u670D\u52A1\u4E2D\u2026" }) }) }) }),
    meta && (tab === "kanban" ? /* @__PURE__ */ jsx3(KanbanTab, { meta }) : /* @__PURE__ */ jsx3(SettingsTab, { meta }))
  ] });
}

// src/index.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function NeedsEntry(props) {
  return /* @__PURE__ */ jsx4(NeedsPanel, { ...props });
}
export {
  NeedsEntry as default
};
