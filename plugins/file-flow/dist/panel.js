// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useRef, useState as useState5 } from "react";

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  return res;
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r.value ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
async function callService(type, payload, opts) {
  const nonce = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(`fileflow.cmd.${nonce}`, { type, payload: payload || {}, at: Date.now() });
  const deadline = Date.now() + (opts?.timeoutMs ?? 9e4);
  while (Date.now() < deadline) {
    await sleep(400);
    const r = await kvGet(`fileflow.result.${nonce}`).catch(() => null);
    if (r) {
      await kvDel(`fileflow.result.${nonce}`).catch(() => {
      });
      if (r.ok) return r.payload || {};
      throw new Error(r.error || "\u670D\u52A1\u6267\u884C\u5931\u8D25");
    }
  }
  throw new Error("\u670D\u52A1\u54CD\u5E94\u8D85\u65F6\u2014\u2014\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u5728\u91CD\u542F\u6216\u5BBF\u4E3B\u6865\u4E0D\u53EF\u8FBE");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function loadPanelData() {
  const [snapshot, meta, stats, rulesRaw] = await Promise.all([
    kvGet("fileflow.snapshot"),
    kvGet("fileflow.meta"),
    kvGet("fileflow.stats"),
    kvGet("fileflow.rules")
  ]);
  return { snapshot, meta, stats, rules: rulesRaw && rulesRaw.rules || [] };
}
async function loadBatches(limit = 30) {
  const keys = await kvKeys();
  const batchKeys = keys.filter((k) => k.startsWith("fileflow.batch."));
  const out = [];
  for (const k of batchKeys) {
    const b = await kvGet(k).catch(() => null);
    if (b) out.push(b);
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, limit);
}
function fmtBytes(n) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
function fmtTime(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function ruleSummary(r) {
  const m = [];
  if (r.match.exts && r.match.exts.length) m.push(r.match.exts.map((e) => `.${e}`).join(" "));
  if (r.match.nameRegex) m.push(`\u540D\u79F0~${r.match.nameRegex}`);
  if (r.match.minAgeDays != null) m.push(`\u2265${r.match.minAgeDays}\u5929`);
  if (r.match.maxAgeDays != null) m.push(`\u2264${r.match.maxAgeDays}\u5929`);
  if (r.match.minSizeMB != null) m.push(`\u2265${r.match.minSizeMB}MB`);
  if (r.match.maxSizeMB != null) m.push(`\u2264${r.match.maxSizeMB}MB`);
  if (r.match.subDir) m.push(`\u5B50\u76EE\u5F55 ${r.match.subDir}`);
  const a = r.action.type === "move" ? `\u79FB\u5230 ${r.action.dest}${r.action.allowOutsideRoot ? "\uFF08\u6839\u5916\uFF09" : ""}` : r.action.type === "recycle" ? "\u79FB\u5165\u56DE\u6536\u7AD9" : r.action.type === "dedupe" ? "\u53BB\u91CD\uFF08\u4FDD\u7559\u6700\u65B0\uFF09" : `\u6539\u540D ${r.action.pattern}`;
  return `${m.join("\u30FB") || "\u5168\u90E8"} \u2192 ${a}`;
}

// src/OverviewTab.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var AUTO_LABEL = { off: "\u4EC5\u624B\u52A8", new: "\u81EA\u52A8\xB7\u65B0\u6587\u4EF6", all: "\u81EA\u52A8\xB7\u5168\u90E8" };
function OverviewTab({ data, refresh, showToast }) {
  const [busy, setBusy] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [plan, setPlan] = useState(null);
  const snapshot = data.snapshot;
  const stats = data.stats || snapshot?.stats;
  const roots = snapshot?.roots || [];
  async function addRoot() {
    const p = addPath.trim();
    if (!p) return;
    setBusy("add");
    try {
      await callService("roots_add", { path: p, label: addLabel.trim() || void 0, auto: "new" });
      setAddPath("");
      setAddLabel("");
      await refresh();
      showToast({ msg: "\u6839\u76EE\u5F55\u5DF2\u6DFB\u52A0\uFF08\u9ED8\u8BA4\u53EA\u81EA\u52A8\u6574\u7406\u65B0\u5230\u6587\u4EF6\uFF09" });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function removeRoot(r) {
    if (!window.confirm(`\u79FB\u9664\u300C${r.label}\u300D\uFF1F
\u5176\u89C4\u5219\u4F1A\u505C\u7528\uFF0C\u5DF2\u5F52\u6863\u7684\u6587\u4EF6\u4E0D\u4F1A\u52A8\u3002`)) return;
    setBusy(`rm-${r.id}`);
    try {
      await callService("roots_remove", { id: r.id });
      await refresh();
      showToast({ msg: "\u5DF2\u79FB\u9664" });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function setAuto(r, auto) {
    setBusy(`auto-${r.id}`);
    try {
      await callService("roots_set", { id: r.id, auto });
      await refresh();
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function dryrun(r) {
    setBusy(`dry-${r.id}`);
    try {
      const preview = await callService("dryrun", { rootId: r.id }, { timeoutMs: 12e4 });
      setPlan({ rootId: r.id, preview });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function applyPlan() {
    if (!plan) return;
    setBusy("apply");
    try {
      const r = await callService(
        "apply",
        { rootId: plan.rootId, planId: plan.preview.planId, confirm: true },
        { timeoutMs: 15e4 }
      );
      setPlan(null);
      await refresh();
      const s = r.summary;
      showToast({
        msg: `\u6574\u7406\u5B8C\u6210\uFF1A\u6210\u529F ${s.done}\uFF0C\u5931\u8D25 ${s.failed}${s.held ? `\uFF0C\u6682\u7F13 ${s.held}\uFF08\u6839\u5916\u8DEF\u5F84\u5F85\u624B\u52A8\u786E\u8BA4\uFF09` : ""}\uFF0C\u79FB\u52A8 ${fmtBytes(s.bytesMoved)}\u3002\u53EF\u5728\u5386\u53F2\u9875\u64A4\u9500\u3002`,
        bad: s.failed > 0
      });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "ff-card", children: /* @__PURE__ */ jsxs("div", { className: "ff-card-b ff-row", style: { gap: 12 }, children: [
      /* @__PURE__ */ jsxs("div", { className: "ff-stat", children: [
        /* @__PURE__ */ jsx("b", { children: stats?.filesOrganized ?? 0 }),
        /* @__PURE__ */ jsx("small", { children: "\u7D2F\u8BA1\u6574\u7406\u6587\u4EF6" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ff-stat", children: [
        /* @__PURE__ */ jsx("b", { children: stats?.batches ?? 0 }),
        /* @__PURE__ */ jsx("small", { children: "\u6279\u6B21" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ff-stat", children: [
        /* @__PURE__ */ jsx("b", { children: snapshot?.enabledRuleCount ?? 0 }),
        /* @__PURE__ */ jsx("small", { children: "\u542F\u7528\u89C4\u5219" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ff-stat", style: { flex: 1 }, children: [
        /* @__PURE__ */ jsx("b", { style: { fontSize: 11, paddingTop: 3 }, children: fmtTime(stats?.lastBatchAt) }),
        /* @__PURE__ */ jsx("small", { children: "\u6700\u8FD1\u6574\u7406" })
      ] })
    ] }) }),
    roots.length === 0 && /* @__PURE__ */ jsx("div", { className: "ff-card", children: /* @__PURE__ */ jsxs("div", { className: "ff-empty", children: [
      "\u8FD8\u6CA1\u6709\u53D7\u7BA1\u7684\u6587\u4EF6\u5939\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u6DFB\u52A0\u4E0B\u8F7D\u6587\u4EF6\u5939\u5F00\u59CB\uFF1A\u540E\u53F0\u4F1A\u6309\u89C4\u5219\u628A\u65B0\u5230\u7684\u6587\u4EF6\u5F52\u6863\u8FDB\u5BF9\u5E94\u5B50\u6587\u4EF6\u5939\uFF0C",
      /* @__PURE__ */ jsx("br", {}),
      "\u52A8\u624B\u524D\u5148\u9884\u89C8\u3001\u52A8\u624B\u540E\u53EF\u64A4\u9500\u3001\u6C38\u4E0D\u5220\u9664\u3002"
    ] }) }),
    roots.map((r) => /* @__PURE__ */ jsxs("div", { className: "ff-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "ff-root-h", children: [
        /* @__PURE__ */ jsx("b", { children: r.label }),
        /* @__PURE__ */ jsx("span", { className: `ff-tag ${r.watched ? "" : "warn"}`, children: r.watched ? "\u76D1\u542C\u4E2D" : "\u672A\u76D1\u542C" }),
        /* @__PURE__ */ jsx("span", { className: "ff-tag", children: AUTO_LABEL[r.auto] || r.auto }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsxs("select", { className: "ff-sel", value: r.auto, disabled: busy === `auto-${r.id}`, onChange: (e) => setAuto(r, e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "off", children: "\u4EC5\u624B\u52A8" }),
          /* @__PURE__ */ jsx("option", { value: "new", children: "\u81EA\u52A8\xB7\u65B0\u6587\u4EF6" }),
          /* @__PURE__ */ jsx("option", { value: "all", children: "\u81EA\u52A8\xB7\u5168\u90E8" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ff-root-path", children: r.path }),
      /* @__PURE__ */ jsxs("div", { className: "ff-root-stats", children: [
        /* @__PURE__ */ jsxs("span", { className: "ff-sub", children: [
          "\u4E0A\u6B21\u6574\u7406 ",
          fmtTime(r.lastRunAt),
          r.lastPlanOps != null ? `\uFF08${r.lastPlanOps} \u4E2A\u52A8\u4F5C\uFF09` : ""
        ] }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { className: "ff-btn sm", disabled: busy === `dry-${r.id}`, onClick: () => dryrun(r), children: busy === `dry-${r.id}` ? "\u626B\u63CF\u4E2D\u2026" : "\u7ACB\u5373\u6574\u7406" }),
        /* @__PURE__ */ jsx("button", { className: "ff-btn sm ghost", disabled: busy === `rm-${r.id}`, onClick: () => removeRoot(r), children: "\u79FB\u9664" })
      ] }),
      (r.issues || []).map((issue, i) => /* @__PURE__ */ jsx("div", { className: "ff-err", style: { padding: "0 13px 8px" }, children: issue }, i))
    ] }, r.id)),
    /* @__PURE__ */ jsx("div", { className: "ff-card", children: /* @__PURE__ */ jsxs("div", { className: "ff-card-b", children: [
      /* @__PURE__ */ jsx("div", { className: "ff-sub", style: { marginBottom: 6 }, children: "\u6DFB\u52A0\u53D7\u7BA1\u6587\u4EF6\u5939\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 C:\\\\Users\\\\\u4F60\\\\Downloads\uFF09" }),
      /* @__PURE__ */ jsxs("div", { className: "ff-row", children: [
        /* @__PURE__ */ jsx("input", { className: "ff-inp ff-grow", placeholder: "D:\\\\Downloads", value: addPath, onChange: (e) => setAddPath(e.target.value) }),
        /* @__PURE__ */ jsx("input", { className: "ff-inp", style: { width: 110 }, placeholder: "\u663E\u793A\u540D\uFF08\u53EF\u9009\uFF09", value: addLabel, onChange: (e) => setAddLabel(e.target.value) }),
        /* @__PURE__ */ jsx("button", { className: "ff-btn", disabled: !addPath.trim() || busy === "add", onClick: addRoot, children: busy === "add" ? "\u2026" : "\u6DFB\u52A0" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ff-sub", style: { marginTop: 6 }, children: "\u6DFB\u52A0\u540E\u5230\u300C\u89C4\u5219\u300D\u9875\u4E00\u952E\u8F7D\u5165\u300C\u4E0B\u8F7D\u5939\u8D77\u6B65\u5305\u300D\uFF0C\u6216\u5148\u300C\u7ACB\u5373\u6574\u7406\u300D\u7A7A\u8DD1\u9884\u89C8\u3002" })
    ] }) }),
    plan && /* @__PURE__ */ jsx("div", { className: "ff-modal", onClick: () => setPlan(null), children: /* @__PURE__ */ jsxs("div", { className: "ff-modal-in", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { className: "ff-modal-h", children: [
        /* @__PURE__ */ jsx("b", { children: "\u6574\u7406\u8BA1\u5212\u9884\u89C8" }),
        /* @__PURE__ */ jsxs("span", { className: "ff-tag", children: [
          "\u5171 ",
          plan.preview.opTotal,
          " \u4E2A\u52A8\u4F5C"
        ] }),
        plan.preview.outsideOps > 0 && /* @__PURE__ */ jsxs("span", { className: "ff-tag warn", children: [
          "\u542B ",
          plan.preview.outsideOps,
          " \u4E2A\u6839\u5916\u52A8\u4F5C"
        ] }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { className: "ff-btn sm ghost", onClick: () => setPlan(null), children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ff-modal-b", children: [
        /* @__PURE__ */ jsxs("div", { className: "ff-sub", style: { marginBottom: 8 }, children: [
          "\u626B\u63CF ",
          plan.preview.counts.entries,
          " \u4E2A\u6587\u4EF6\uFF5C\u547D\u4E2D ",
          plan.preview.counts.matched,
          "\uFF5C\u65B0\u6587\u4EF6\u62A4\u680F\u62E6\u4E0B ",
          plan.preview.counts.guard,
          "\uFF5C\u90E8\u5206\u4E0B\u8F7D ",
          plan.preview.counts.partial,
          "\uFF5C\u65E0\u89C4\u5219 ",
          plan.preview.counts.noRule,
          plan.preview.counts.truncated ? "\uFF5C\u26A0 \u5DF2\u8FBE\u904D\u5386\u4E0A\u9650\uFF0C\u7ED3\u679C\u622A\u65AD" : ""
        ] }),
        plan.preview.ops.length === 0 && /* @__PURE__ */ jsx("div", { className: "ff-empty", children: "\u6CA1\u6709\u53EF\u6267\u884C\u7684\u52A8\u4F5C\u2014\u2014\u6587\u4EF6\u90FD\u5DF2\u5C31\u4F4D\u6216\u65E0\u89C4\u5219\u547D\u4E2D\u3002" }),
        plan.preview.ops.map((op, i) => /* @__PURE__ */ jsxs("div", { className: `ff-op ${op.safe === false ? "outside" : ""}`, children: [
          /* @__PURE__ */ jsx("span", { className: "ff-chip", children: { move: "\u79FB\u52A8", recycle: "\u56DE\u6536", dedupe: "\u53BB\u91CD", rename: "\u6539\u540D" }[op.action] }),
          op.fromRel,
          /* @__PURE__ */ jsx("span", { className: "ff-dim", children: " \u2192 " }),
          op.toAbs || op.toRel,
          op.safe === false && /* @__PURE__ */ jsx("span", { className: "ff-dim", children: "\uFF08\u6839\u5916\u8DEF\u5F84\uFF1A\u81EA\u52A8\u6A21\u5F0F\u4E0D\u6267\u884C\uFF0C\u672C\u6B21\u624B\u52A8\u786E\u8BA4\u540E\u624D\u52A8\uFF09" }),
          /* @__PURE__ */ jsxs("div", { className: "ff-dim", children: [
            "\u89C4\u5219\uFF1A",
            op.why || op.ruleId
          ] })
        ] }, i)),
        plan.preview.skipped.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "ff-sub", style: { margin: "10px 0 4px" }, children: [
            "\u88AB\u8DF3\u8FC7\uFF08",
            plan.preview.skipped.length,
            "\uFF0C\u793A\u4F8B\uFF09\uFF1A"
          ] }),
          plan.preview.skipped.slice(0, 8).map((s, i) => /* @__PURE__ */ jsxs("div", { className: "ff-sub ff-mono", children: [
            s.rel,
            "\uFF5C",
            s.reason
          ] }, i))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ff-modal-f", children: [
        /* @__PURE__ */ jsx("span", { className: "ff-sub ff-grow", children: "\u52A8\u624B\u540E\u53EF\u5728\u300C\u5386\u53F2\u300D\u9875\u6309\u6279\u6B21\u64A4\u9500\uFF1B\u6587\u4EF6\u6C38\u4E0D\u4F1A\u88AB\u5220\u9664\u3002" }),
        /* @__PURE__ */ jsx("button", { className: "ff-btn ghost", onClick: () => setPlan(null), children: "\u5148\u4E0D\u52A8" }),
        /* @__PURE__ */ jsx("button", { className: "ff-btn ok", disabled: plan.preview.opTotal === 0 || busy === "apply", onClick: applyPlan, children: busy === "apply" ? "\u6267\u884C\u4E2D\u2026" : `\u6267\u884C\u8FD9 ${plan.preview.opTotal} \u4E2A\u52A8\u4F5C` })
      ] })
    ] }) })
  ] });
}

// src/RulesTab.tsx
import { useMemo, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var EMPTY_FORM = {
  id: "",
  name: "",
  rootId: "",
  priority: 100,
  exts: "",
  nameRegex: "",
  minAgeDays: "",
  maxAgeDays: "",
  minSizeMB: "",
  maxSizeMB: "",
  subDir: "",
  type: "move",
  dest: "",
  pattern: "",
  allowOutsideRoot: false,
  enabled: true
};
function RulesTab({ data, refresh, showToast }) {
  const [busy, setBusy] = useState2("");
  const [editing, setEditing] = useState2(null);
  const rules = data.rules;
  const roots = useMemo(() => data.snapshot?.roots || [], [data.snapshot]);
  const rootName = useMemo(() => new Map(roots.map((r) => [r.id, r.label])), [roots]);
  function openNew() {
    setEditing({ ...EMPTY_FORM, rootId: roots[0]?.id || "" });
  }
  function openEdit(r) {
    setEditing({
      id: r.id,
      name: r.name,
      rootId: r.rootId,
      priority: r.priority,
      exts: (r.match.exts || []).join(", "),
      nameRegex: r.match.nameRegex || "",
      minAgeDays: r.match.minAgeDays != null ? String(r.match.minAgeDays) : "",
      maxAgeDays: r.match.maxAgeDays != null ? String(r.match.maxAgeDays) : "",
      minSizeMB: r.match.minSizeMB != null ? String(r.match.minSizeMB) : "",
      maxSizeMB: r.match.maxSizeMB != null ? String(r.match.maxSizeMB) : "",
      subDir: r.match.subDir || "",
      type: r.action.type,
      dest: r.action.dest || "",
      pattern: r.action.pattern || "",
      allowOutsideRoot: r.action.allowOutsideRoot,
      enabled: r.enabled
    });
  }
  async function save() {
    if (!editing) return;
    const num = (s) => s.trim() === "" ? void 0 : Number(s);
    const rule = {
      ...editing.id ? {} : {},
      name: editing.name.trim() || "\u672A\u547D\u540D\u89C4\u5219",
      rootId: editing.rootId,
      priority: num(String(editing.priority)) ?? 100,
      enabled: editing.enabled,
      stopOnMatch: true,
      match: {
        exts: editing.exts.split(/[,，\s]+/).map((x) => x.trim().replace(/^\./, "").toLowerCase()).filter(Boolean),
        nameRegex: editing.nameRegex.trim() || void 0,
        minAgeDays: num(editing.minAgeDays),
        maxAgeDays: num(editing.maxAgeDays),
        minSizeMB: num(editing.minSizeMB),
        maxSizeMB: num(editing.maxSizeMB),
        subDir: editing.subDir.trim() || void 0
      },
      action: {
        type: editing.type,
        dest: editing.type === "move" ? editing.dest.trim() : editing.type === "dedupe" ? editing.dest.trim() : "",
        pattern: editing.type === "rename" ? editing.pattern.trim() : "",
        allowOutsideRoot: editing.allowOutsideRoot
      }
    };
    setBusy("save");
    try {
      if (editing.id) {
        await callService("rules_update", { id: editing.id, patch: rule });
      } else {
        await callService("rules_add", { rule });
      }
      setEditing(null);
      await refresh();
      showToast({ msg: "\u89C4\u5219\u5DF2\u4FDD\u5B58\u3002\u5EFA\u8BAE\u5BF9\u76EE\u6807\u6587\u4EF6\u5939\u300C\u7ACB\u5373\u6574\u7406\u300D\u7A7A\u8DD1\u4E00\u6B21\u9884\u89C8\u3002" });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function toggle(r) {
    setBusy(`t-${r.id}`);
    try {
      await callService("rules_update", { id: r.id, patch: { enabled: !r.enabled } });
      await refresh();
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function del(r) {
    if (!window.confirm(`\u5220\u9664\u89C4\u5219\u300C${r.name}\u300D\uFF1F\u6587\u4EF6\u4E0D\u4F1A\u52A8\u3002`)) return;
    setBusy(`d-${r.id}`);
    try {
      await callService("rules_delete", { id: r.id });
      await refresh();
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  async function loadPreset(rootId) {
    setBusy(`p-${rootId}`);
    try {
      const r = await callService("rules_preset", { rootId, packId: "downloads" });
      await refresh();
      showToast({ msg: `\u8D77\u6B65\u5305\u5DF2\u8F7D\u5165\uFF1A\u65B0\u589E ${r.added} \u6761\u89C4\u5219\uFF08\u540C\u6839\u540C\u540D\u81EA\u52A8\u8DF3\u8FC7\uFF09\u3002` });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  const rootsWithoutPack = roots;
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    roots.length > 0 && /* @__PURE__ */ jsx2("div", { className: "ff-card", children: /* @__PURE__ */ jsxs2("div", { className: "ff-card-b ff-row", style: { flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx2("span", { className: "ff-sub ff-grow", children: "\u4E00\u952E\u8F7D\u5165\u300C\u4E0B\u8F7D\u5939\u8D77\u6B65\u5305\u300D\uFF1A\u91CD\u590D\u4E0B\u8F7D\u6536\u8D70 \u2192 \u5B89\u88C5\u5305/\u538B\u7F29\u5305/\u6587\u6863/\u56FE\u7247/\u5A92\u4F53\u5F52\u6863 \u2192 30 \u5929\u65E7\u6587\u4EF6\u51B7\u5B58\uFF08\u5E42\u7B49\uFF0C\u91CD\u590D\u8F7D\u5165\u81EA\u52A8\u8DF3\u8FC7\uFF09\u3002" }),
      rootsWithoutPack.map((r) => /* @__PURE__ */ jsxs2("button", { className: "ff-btn sm", disabled: busy === `p-${r.id}`, onClick: () => loadPreset(r.id), children: [
        "\u8F7D\u5165\u5230\u300C",
        r.label,
        "\u300D"
      ] }, r.id))
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "ff-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ff-card-b ff-row", children: [
        /* @__PURE__ */ jsxs2("span", { className: "ff-sub ff-grow", children: [
          "\u89C4\u5219\u5171 ",
          rules.length,
          " \u6761\uFF0C\u6309\u4F18\u5148\u7EA7\u4ECE\u5C0F\u5230\u5927\u6267\u884C\uFF0C\u5148\u547D\u4E2D\u5148\u5F97\uFF08stopOnMatch\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsx2("button", { className: "ff-btn sm", onClick: openNew, disabled: !roots.length, children: "+ \u65B0\u5EFA\u89C4\u5219" })
      ] }),
      rules.length === 0 && /* @__PURE__ */ jsx2("div", { className: "ff-empty", children: "\u8FD8\u6CA1\u6709\u89C4\u5219\u3002\u8F7D\u5165\u8D77\u6B65\u5305\u6216\u5728\u5BF9\u8BDD\u91CC\u8BA9 AI \u5E2E\u4F60\u5199\uFF08MCP \u5DE5\u5177 flow_rules\uFF09\u3002" }),
      rules.map((r) => /* @__PURE__ */ jsxs2("div", { className: "ff-rule", children: [
        /* @__PURE__ */ jsxs2("div", { className: "ff-rule-h", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: `ff-toggle ${r.enabled ? "on" : ""}`,
              disabled: busy === `t-${r.id}`,
              title: r.enabled ? "\u70B9\u51FB\u505C\u7528" : "\u70B9\u51FB\u542F\u7528",
              onClick: () => toggle(r),
              children: /* @__PURE__ */ jsx2("i", {})
            }
          ),
          /* @__PURE__ */ jsx2("b", { children: r.name }),
          /* @__PURE__ */ jsxs2("span", { className: "ff-tag", children: [
            "#",
            r.priority
          ] }),
          /* @__PURE__ */ jsx2("span", { className: "ff-tag", children: rootName.get(r.rootId) || "\u5168\u90E8\u6839" }),
          r.action.allowOutsideRoot && /* @__PURE__ */ jsx2("span", { className: "ff-tag warn", children: "\u6839\u5916" }),
          /* @__PURE__ */ jsx2("button", { className: "ff-btn sm ghost", onClick: () => openEdit(r), children: "\u7F16\u8F91" }),
          /* @__PURE__ */ jsx2("button", { className: "ff-btn sm danger", disabled: busy === `d-${r.id}`, onClick: () => del(r), children: "\u5220" })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "ff-rule-sum", children: ruleSummary(r) })
      ] }, r.id))
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ff-card", children: /* @__PURE__ */ jsxs2("div", { className: "ff-card-b ff-sub", children: [
      "\u{1F4A1} \u5728 Polaris \u5BF9\u8BDD\u91CC\u8BF4\u300C\u5E2E\u6211\u628A\u4E0B\u8F7D\u7684\u5B89\u88C5\u5305\u6309\u6708\u5F52\u6863\u3001\u622A\u56FE\u5355\u72EC\u653E\u300D\u2014\u2014AI \u4F1A\u7528 flow_rules \u751F\u6210\u89C4\u5219\u3001flow_dryrun \u9884\u89C8\u3001\u786E\u8BA4\u540E flow_apply\u3002 \u76EE\u7684\u76EE\u5F55\u652F\u6301\u53D8\u91CF\uFF1A",
      "{yyyy} {mm} {dd} {name} {base} {ext}",
      "\uFF0C\u5982 ",
      /* @__PURE__ */ jsxs2("code", { children: [
        "\u5B89\u88C5\u5305\\",
        "{yyyy}",
        "-",
        "{mm}"
      ] }),
      "\u3002"
    ] }) }),
    editing && /* @__PURE__ */ jsx2("div", { className: "ff-modal", onClick: () => setEditing(null), children: /* @__PURE__ */ jsxs2("div", { className: "ff-modal-in", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs2("div", { className: "ff-modal-h", children: [
        /* @__PURE__ */ jsx2("b", { children: editing.id ? "\u7F16\u8F91\u89C4\u5219" : "\u65B0\u5EFA\u89C4\u5219" }),
        /* @__PURE__ */ jsx2("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx2("button", { className: "ff-btn sm ghost", onClick: () => setEditing(null), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx2("button", { className: "ff-btn sm", disabled: busy === "save", onClick: save, children: busy === "save" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "ff-modal-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "ff-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u89C4\u5219\u540D" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", value: editing.name, placeholder: "\u5B89\u88C5\u5305\u6309\u6708\u5F52\u6863", onChange: (e) => setEditing({ ...editing, name: e.target.value }) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u4F5C\u7528\u4E8E\u6839\u76EE\u5F55" }),
            /* @__PURE__ */ jsx2("select", { className: "ff-sel", style: { width: "100%" }, value: editing.rootId, onChange: (e) => setEditing({ ...editing, rootId: e.target.value }), children: roots.map((r) => /* @__PURE__ */ jsx2("option", { value: r.id, children: r.label }, r.id)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-grid3", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u4F18\u5148\u7EA7\uFF08\u5C0F\u8005\u5148\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", type: "number", min: 1, max: 999, value: editing.priority, onChange: (e) => setEditing({ ...editing, priority: Number(e.target.value) || 100 }) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u6700\u5C0F\u5E74\u9F84\uFF08\u5929\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", type: "number", min: 0, placeholder: "\u4E0D\u9650", value: editing.minAgeDays, onChange: (e) => setEditing({ ...editing, minAgeDays: e.target.value }) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u6700\u5927\u5E74\u9F84\uFF08\u5929\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", type: "number", min: 0, placeholder: "\u4E0D\u9650", value: editing.maxAgeDays, onChange: (e) => setEditing({ ...editing, maxAgeDays: e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u6269\u5C55\u540D\uFF08\u9017\u53F7\u5206\u9694\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", value: editing.exts, placeholder: "exe, msi, zip", onChange: (e) => setEditing({ ...editing, exts: e.target.value }) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u540D\u79F0\u6B63\u5219\uFF08\u53EF\u9009\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", value: editing.nameRegex, placeholder: "^(\u622A\u56FE|\u5C4F\u5E55\u5FEB\u7167)", onChange: (e) => setEditing({ ...editing, nameRegex: e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-grid3", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u6700\u5C0F\u5927\u5C0F\uFF08MB\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", type: "number", min: 0, placeholder: "\u4E0D\u9650", value: editing.minSizeMB, onChange: (e) => setEditing({ ...editing, minSizeMB: e.target.value }) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u6700\u5927\u5927\u5C0F\uFF08MB\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", type: "number", min: 0, placeholder: "\u4E0D\u9650", value: editing.maxSizeMB, onChange: (e) => setEditing({ ...editing, maxSizeMB: e.target.value }) })
          ] }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u4EC5\u5B50\u76EE\u5F55\uFF08\u53EF\u9009\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", value: editing.subDir, placeholder: "\u672A\u6574\u7406", onChange: (e) => setEditing({ ...editing, subDir: e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-grid", children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u52A8\u4F5C" }),
            /* @__PURE__ */ jsxs2("select", { className: "ff-sel", style: { width: "100%" }, value: editing.type, onChange: (e) => setEditing({ ...editing, type: e.target.value }), children: [
              /* @__PURE__ */ jsx2("option", { value: "move", children: "\u79FB\u52A8\u5230" }),
              /* @__PURE__ */ jsx2("option", { value: "recycle", children: "\u79FB\u5165\u56DE\u6536\u7AD9\uFF08_FileFlow\u56DE\u6536\u7AD9\uFF09" }),
              /* @__PURE__ */ jsx2("option", { value: "dedupe", children: "\u53BB\u91CD\uFF08\u540C\u5185\u5BB9\u4FDD\u7559\u6700\u65B0\uFF0C\u5176\u4F59\u8FDB\u56DE\u6536\u7AD9\uFF09" }),
              /* @__PURE__ */ jsx2("option", { value: "rename", children: "\u539F\u5730\u6539\u540D" })
            ] })
          ] }),
          editing.type === "rename" ? /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u6539\u540D\u6A21\u677F" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", value: editing.pattern, placeholder: "{yyyy}{mm}{dd}-{name}{ext}", onChange: (e) => setEditing({ ...editing, pattern: e.target.value }) })
          ] }) : /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("label", { className: "ff-lab", children: "\u76EE\u7684\u76EE\u5F55\uFF08move/dedupe \u53EF\u586B\uFF0C\u652F\u6301\u53D8\u91CF\uFF09" }),
            /* @__PURE__ */ jsx2("input", { className: "ff-inp", value: editing.dest, placeholder: "\u5B89\u88C5\u5305\\{yyyy}-{mm}", disabled: editing.type === "recycle", onChange: (e) => setEditing({ ...editing, dest: e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ff-field", children: [
          /* @__PURE__ */ jsxs2("div", { className: "ff-field-l", children: [
            /* @__PURE__ */ jsx2("b", { children: "\u5141\u8BB8\u6839\u5916\u76EE\u7684\u8DEF\u5F84" }),
            /* @__PURE__ */ jsx2("small", { children: "\u5173\u95ED=\u76EE\u7684\u76EE\u5F55\u5FC5\u987B\u5728\u53D7\u7BA1\u6587\u4EF6\u5939\u5185\uFF08\u63A8\u8350\uFF09\u3002\u5F00\u542F\u540E\u8FD9\u4E9B\u52A8\u4F5C\u4E0D\u4F1A\u88AB\u81EA\u52A8\u6A21\u5F0F\u6267\u884C\uFF0C\u4EC5\u624B\u52A8\u786E\u8BA4\u65F6\u6267\u884C\u3002" })
          ] }),
          /* @__PURE__ */ jsx2("button", { className: `ff-toggle ${editing.allowOutsideRoot ? "on" : ""}`, onClick: () => setEditing({ ...editing, allowOutsideRoot: !editing.allowOutsideRoot }), children: /* @__PURE__ */ jsx2("i", {}) })
        ] })
      ] })
    ] }) })
  ] });
}

// src/HistoryTab.tsx
import { useEffect, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var STATUS_LABEL = {
  done: { t: "\u2713", c: "#3FB950" },
  gone: { t: "\u2205 \u76EE\u6807\u5DF2\u4E0D\u5728", c: "#8B95A7" },
  changed: { t: "\u21AF \u6267\u884C\u4E2D\u53D8\u5316", c: "#D29922" },
  locked: { t: "\u{1F512} \u88AB\u5360\u7528", c: "#D29922" },
  error: { t: "\u2717 \u5931\u8D25", c: "#F85149" },
  held: { t: "\u23F8 \u6839\u5916\u6682\u7F13", c: "#D29922" },
  conflict: { t: "\u26A0 \u51B2\u7A81", c: "#D29922" },
  ready: { t: "\u5F85\u56DE\u79FB", c: "#58A6FF" }
};
function HistoryTab({ refresh, showToast }) {
  const [batches, setBatches] = useState3(null);
  const [expanded, setExpanded] = useState3(null);
  const [busy, setBusy] = useState3("");
  const [undoing, setUndoing] = useState3(null);
  async function load() {
    try {
      setBatches(await loadBatches(40));
    } catch {
      setBatches([]);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function undo(b) {
    if (!window.confirm(`\u64A4\u9500\u6279\u6B21 ${b.batchId}\uFF1F
\u5C06\u628A\u672C\u6279\u6B21\u79FB\u52A8\u8FC7\u7684 ${b.summary.done} \u4E2A\u6587\u4EF6\u9010\u4E00\u79FB\u56DE\u539F\u4F4D\uFF1B\u51B2\u7A81/\u5DF2\u518D\u6B21\u79FB\u52A8\u7684\u6587\u4EF6\u4F1A\u5982\u5B9E\u62A5\u544A\uFF0C\u7EDD\u4E0D\u8986\u76D6\u3002`)) return;
    setBusy(`u-${b.batchId}`);
    setUndoing(null);
    try {
      const r = await callService(
        "undo",
        { batchId: b.batchId, confirm: true },
        { timeoutMs: 15e4 }
      );
      await Promise.all([load(), refresh()]);
      showToast({
        msg: `\u64A4\u9500\u5B8C\u6210\uFF1A\u56DE\u79FB ${r.undone} \u4E2A\uFF0C\u672A\u6210 ${r.failed} \u4E2A${r.failed ? "\uFF08\u660E\u7EC6\u89C1\u65B0\u6279\u6B21 " + r.undoBatchId + "\uFF09" : ""}`,
        bad: r.failed > 0
      });
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  if (batches === null) return /* @__PURE__ */ jsx3("div", { className: "ff-empty", children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (!batches.length) return /* @__PURE__ */ jsx3("div", { className: "ff-card", children: /* @__PURE__ */ jsxs3("div", { className: "ff-empty", children: [
    "\u8FD8\u6CA1\u6709\u6279\u6B21\u8BB0\u5F55\u3002",
    /* @__PURE__ */ jsx3("br", {}),
    "\u5230\u300C\u603B\u89C8\u300D\u9875\u5BF9\u4E00\u4E2A\u6587\u4EF6\u5939\u300C\u7ACB\u5373\u6574\u7406\u300D\uFF0C\u6216\u5728\u5BF9\u8BDD\u91CC\u8BA9 AI \u6267\u884C\u3002"
  ] }) });
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    batches.map((b) => {
      const isUndo = b.mode === "undo";
      return /* @__PURE__ */ jsx3("div", { className: "ff-card", children: /* @__PURE__ */ jsxs3("div", { className: "ff-batch", children: [
        /* @__PURE__ */ jsxs3("div", { className: "ff-batch-h", children: [
          /* @__PURE__ */ jsx3("b", { children: b.batchId }),
          /* @__PURE__ */ jsx3("span", { className: "ff-tag", children: isUndo ? `\u64A4\u9500\u81EA ${b.undoOf}` : b.mode === "auto" ? "\u81EA\u52A8" : "\u624B\u52A8" }),
          b.summary.failed > 0 && /* @__PURE__ */ jsxs3("span", { className: "ff-tag warn", children: [
            "\u5931\u8D25 ",
            b.summary.failed
          ] }),
          b.summary.held > 0 && /* @__PURE__ */ jsxs3("span", { className: "ff-tag warn", children: [
            "\u6682\u7F13 ",
            b.summary.held
          ] }),
          /* @__PURE__ */ jsx3("div", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx3("span", { className: "ff-sub", children: fmtTime(b.at) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "ff-batch-sum", children: [
          isUndo ? "\u56DE\u79FB" : "\u6574\u7406",
          " ",
          b.summary.done,
          "/",
          b.summary.total,
          " \u4E2A\u6587\u4EF6",
          b.summary.bytesMoved > 0 && ` \xB7 ${fmtBytes(b.summary.bytesMoved)}`,
          /* @__PURE__ */ jsxs3("span", { className: "ff-dim", children: [
            " \xB7 ",
            b.rootPath
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "ff-row", style: { marginTop: 6 }, children: [
          /* @__PURE__ */ jsx3("button", { className: "ff-btn sm ghost", onClick: () => setExpanded(expanded === b.batchId ? null : b.batchId), children: expanded === b.batchId ? "\u6536\u8D77\u660E\u7EC6" : "\u660E\u7EC6" }),
          !isUndo && b.summary.done > 0 && /* @__PURE__ */ jsx3("button", { className: "ff-btn sm danger", disabled: busy === `u-${b.batchId}`, onClick: () => undo(b), children: busy === `u-${b.batchId}` ? "\u64A4\u9500\u4E2D\u2026" : "\u64A4\u9500\u672C\u6279\u6B21" })
        ] }),
        expanded === b.batchId && /* @__PURE__ */ jsx3("div", { className: "ff-ops", children: b.ops.map((op, i) => {
          const st = STATUS_LABEL[op.status] || { t: op.status, c: "#8B95A7" };
          return /* @__PURE__ */ jsxs3("div", { className: "ff-op", children: [
            /* @__PURE__ */ jsx3("span", { style: { color: st.c }, children: st.t }),
            " ",
            /* @__PURE__ */ jsx3("span", { className: "ff-mono", children: op.fromRel }),
            /* @__PURE__ */ jsx3("span", { className: "ff-dim", children: " \u2192 " }),
            /* @__PURE__ */ jsx3("span", { className: "ff-mono", children: op.toAbs || op.toRel || "?" }),
            op.why && /* @__PURE__ */ jsx3("div", { className: "ff-dim", children: op.why })
          ] }, i);
        }) })
      ] }) }, b.batchId);
    }),
    undoing && /* @__PURE__ */ jsx3("div", { className: "ff-sub", style: { padding: "0 16px" }, children: "\u64A4\u9500\u4E2D\u2026" })
  ] });
}

// src/SettingsTab.tsx
import { useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var FIELDS = [
  { key: "guardMinutes", label: "\u65B0\u6587\u4EF6\u62A4\u680F\uFF08\u5206\u949F\uFF09", hint: "\u52A0\u5165\u65F6\u95F4\u4E0D\u8DB3\u8BE5\u503C\u7684\u6587\u4EF6\u7EDD\u4E0D\u6574\u7406\u2014\u2014\u9632\u6B62\u6B63\u5728\u5199\u5165/\u521A\u6253\u5F00\u7684\u6587\u4EF6\u88AB\u642C\u8D70\u3002", min: 1, max: 120 },
  { key: "maxOpsPerRun", label: "\u5355\u6B21\u52A8\u4F5C\u4E0A\u9650", hint: "\u4E00\u4EFD\u8BA1\u5212\u6700\u591A\u6267\u884C\u591A\u5C11\u4E2A\u6587\u4EF6\u52A8\u4F5C\uFF0C\u8D85\u51FA\u90E8\u5206\u7559\u5230\u4E0B\u4E00\u8F6E\u3002", min: 10, max: 2e3 },
  { key: "dedupeMaxFiles", label: "\u53BB\u91CD\u5019\u9009\u4E0A\u9650", hint: "\u6BCF\u8F6E\u6700\u591A\u5BF9\u591A\u5C11\u4E2A\u6587\u4EF6\u7B97\u5185\u5BB9\u6307\u7EB9\uFF08\u9632\u5927\u76EE\u5F55\u62D6\u6162\uFF09\u3002", min: 10, max: 2e3 },
  { key: "dedupeMaxSizeMB", label: "\u53BB\u91CD\u5355\u6587\u4EF6\u4E0A\u9650\uFF08MB\uFF09", hint: "\u8D85\u8FC7\u8BE5\u5927\u5C0F\u7684\u6587\u4EF6\u4E0D\u53C2\u4E0E\u53BB\u91CD\u3002", min: 1, max: 4096 },
  { key: "sweepMinutes", label: "\u515C\u5E95\u626B\u63CF\u95F4\u9694\uFF08\u5206\u949F\uFF09", hint: "\u6587\u4EF6\u76D1\u542C\u4E4B\u5916\u7684\u5B89\u5168\u7F51\uFF1A\u6BCF\u8BE5\u95F4\u9694\u5F3A\u5236\u626B\u63CF\u4E00\u6B21\u81EA\u52A8\u6A21\u5F0F\u6839\u76EE\u5F55\u3002", min: 5, max: 240 }
];
function SettingsTab({ data, refresh, showToast }) {
  const [busy, setBusy] = useState4("");
  const s = data.snapshot?.settings;
  const meta = data.meta;
  async function patch(p) {
    setBusy("save");
    try {
      await callService("settings_set", { patch: p });
      await refresh();
    } catch (e) {
      showToast({ msg: String(e.message || e), bad: true });
    } finally {
      setBusy("");
    }
  }
  function numField(key) {
    const f = FIELDS.find((x) => x.key === key);
    const v = s ? s[key] : void 0;
    return /* @__PURE__ */ jsxs4("div", { className: "ff-field", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ff-field-l", children: [
        /* @__PURE__ */ jsx4("b", { children: f.label }),
        /* @__PURE__ */ jsx4("small", { children: f.hint })
      ] }),
      /* @__PURE__ */ jsx4(
        "input",
        {
          className: "ff-inp",
          style: { width: 88 },
          type: "number",
          min: f.min,
          max: f.max,
          defaultValue: v ?? "",
          disabled: busy === "save",
          onBlur: (e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= f.min && n <= f.max && n !== v) patch({ [key]: Math.floor(n) });
          }
        },
        `${key}-${v}`
      )
    ] }, key);
  }
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "ff-card", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ff-card-b ff-row", children: [
        /* @__PURE__ */ jsx4("span", { className: "ff-sub ff-grow", children: "\u540E\u53F0\u6587\u4EF6\u76D1\u542C\uFF08\u81EA\u52A8\u6A21\u5F0F\u7684\u89E6\u53D1\u5668\uFF1B\u5173\u6389\u540E\u4ECD\u6709\u515C\u5E95\u5468\u671F\u626B\u63CF\uFF09" }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            className: `ff-toggle ${s?.watchEnabled !== false ? "on" : ""}`,
            disabled: busy === "save",
            onClick: () => patch({ watchEnabled: s?.watchEnabled === false }),
            children: /* @__PURE__ */ jsx4("i", {})
          }
        )
      ] }),
      FIELDS.map((f) => numField(f.key))
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ff-card", children: /* @__PURE__ */ jsxs4("div", { className: "ff-card-b ff-sub", children: [
      /* @__PURE__ */ jsx4("b", { style: { color: "#E6EAF2" }, children: "\u5B89\u5168\u6A21\u578B\uFF08\u670D\u52A1\u5C42\u5F3A\u5236\uFF0C\u9762\u677F\u53EA\u662F\u5165\u53E3\uFF09" }),
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u6C38\u4E0D\u5220\u9664\uFF1A\u56DE\u6536/\u53BB\u91CD\u90FD\u662F\u79FB\u5165 ",
      /* @__PURE__ */ jsx4("code", { children: "_FileFlow\u56DE\u6536\u7AD9" }),
      " \u5B50\u6587\u4EF6\u5939\uFF0C\u968F\u65F6\u53EF\u64A4\u9500\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5148\u9884\u89C8\u540E\u52A8\u624B\uFF1A\u624B\u52A8\u6574\u7406\u5FC5\u987B\u5148\u51FA\u8BA1\u5212\uFF1B\u81EA\u52A8\u6A21\u5F0F\u9ED8\u8BA4\u53EA\u5904\u7406\u65B0\u5230\u6587\u4EF6\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u76EE\u7684\u5B50\u6811\u6392\u9664\uFF1A\u5F52\u6863\u76EE\u6807\u6587\u4EF6\u5939\u91CC\u7684\u5185\u5BB9\u4E0D\u4F1A\u518D\u88AB\u5176\u4ED6\u89C4\u5219\u642C\u8D70\uFF08\u9632\u9012\u5F52\u642C\u5BB6\uFF09\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5360\u7528/\u6B63\u5728\u5199\u5165\u7684\u6587\u4EF6\u81EA\u52A8\u8DF3\u8FC7\u5E76\u8BB0\u5F55\uFF08EBUSY/\u65B0\u6587\u4EF6\u62A4\u680F\uFF09\uFF0C\u4E0B\u8F6E\u518D\u8BD5\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u8DE8\u76D8\u79FB\u52A8\u7528\u300C\u590D\u5236\u2192\u6821\u9A8C\u5927\u5C0F\u2192\u5220\u6E90\u300D\uFF0C\u6821\u9A8C\u4E0D\u8FC7\u4E0D\u52A8\u6E90\u6587\u4EF6\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5168\u90E8\u6570\u636E\u7559\u5728\u672C\u673A\uFF08cap.kv + \u672C\u5730 fs\uFF09\uFF0C\u96F6\u5916\u7F51\u8BF7\u6C42\u3002"
    ] }) }),
    /* @__PURE__ */ jsx4("div", { className: "ff-card", children: /* @__PURE__ */ jsxs4("div", { className: "ff-card-b ff-sub", children: [
      "\u670D\u52A1 v",
      meta?.version || "?",
      "\uFF5CPID ",
      meta?.pid ?? "\u2014",
      "\uFF5C\u5FC3\u8DF3 ",
      meta?.lastTickAt ? new Date(meta.lastTickAt).toLocaleTimeString("zh-CN", { hour12: false }) : "\u2014",
      "\uFF5C\u76D1\u542C\u4E2D ",
      (meta?.watched || []).length,
      " \u4E2A\u6839",
      meta?.bridge !== "ok" && /* @__PURE__ */ jsx4("span", { style: { color: "#F85149" }, children: "\uFF08\u6865\u4E0D\u53EF\u8FBE\uFF1A\u68C0\u67E5 Polaris \u4E3B\u5E94\u7528\u662F\u5426\u5728\u8FD0\u884C\uFF09" })
    ] }) })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment5, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.ff-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ff-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ff-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ff-body::-webkit-scrollbar{width:9px;height:9px}
.ff-body::-webkit-scrollbar-track{background:transparent}
.ff-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

/* \u5934\u90E8 */
.ff-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ff-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2EA97C,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ff-tt{flex:1;min-width:0}
.ff-tt b{font-size:15px;display:block}
.ff-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ff-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ff-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ff-dot.stale{background:#D29922}
.ff-dot.down{background:#F85149}
.ff-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ff-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ff-tab:hover{color:#E6EAF2}
.ff-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

/* \u901A\u7528 */
.ff-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ff-card-b{padding:11px 13px}
.ff-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ff-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ff-tag.warn{color:#D29922;border-color:#4a3a15}
.ff-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ff-btn:hover{filter:brightness(1.1)}
.ff-btn:disabled{opacity:.45;cursor:not-allowed}
.ff-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ff-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ff-btn.ok{background:#1e3a2a;color:#3FB950;border:1px solid #2a5c3f}
.ff-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ff-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ff-inp:focus{outline:none;border-color:#2b6cb0}
.ff-inp::placeholder{color:#4d5566}
.ff-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px;cursor:pointer}
.ff-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ff-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ff-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;max-width:92%}
.ff-toast.bad{border-color:#54262c;color:#FF8A9A}
.ff-toast-wrap{white-space:normal;max-height:150px;overflow-y:auto;word-break:break-all}

/* \u884C */
.ff-row{display:flex;align-items:center;gap:8px}
.ff-grow{flex:1;min-width:0}
.ff-mono{font-family:Consolas,Menlo,monospace;font-size:11px;color:#C9D1D9;word-break:break-all}
.ff-dim{color:#5C6678}

/* \u6839\u76EE\u5F55\u5361 */
.ff-root-card{border-top:1px solid #1d2330}
.ff-root-h{display:flex;align-items:center;gap:8px;padding:10px 13px 6px}
.ff-root-h b{font-size:13px}
.ff-root-path{font-family:Consolas,Menlo,monospace;font-size:10.5px;color:#5C6678;padding:0 13px;word-break:break-all}
.ff-root-stats{display:flex;gap:6px;padding:6px 13px 10px;flex-wrap:wrap}
.ff-stat{background:#12151c;border:1px solid #1d2330;border-radius:9px;padding:6px 10px;min-width:74px}
.ff-stat b{font-size:14px;display:block}
.ff-stat small{font-size:9.5px;color:#8B95A7}

/* \u8BA1\u5212\u9884\u89C8\u5F39\u5C42 */
.ff-modal{position:absolute;inset:0;background:rgba(8,10,14,.72);z-index:50;display:flex;align-items:flex-end;justify-content:center}
.ff-modal-in{background:#161B22;border:1px solid #242C3A;border-radius:14px 14px 0 0;width:100%;max-height:82%;display:flex;flex-direction:column}
.ff-modal-h{padding:12px 16px;border-bottom:1px solid #1d2330;display:flex;align-items:center;gap:8px}
.ff-modal-b{flex:1;overflow-y:auto;padding:10px 16px}
.ff-modal-f{padding:10px 16px;border-top:1px solid #1d2330;display:flex;gap:8px;align-items:center}
.ff-op{padding:6px 10px;border-radius:8px;background:#12151c;border:1px solid #1d2330;margin-bottom:6px;font-size:11px;line-height:1.6}
.ff-op.outside{border-color:#4a3a15;background:#1c1710}
.ff-op .ff-dim{font-size:10px}
.ff-chip{display:inline-block;background:#1C2330;border-radius:5px;padding:0 6px;font-size:9.5px;color:#8B95A7;margin-right:4px}

/* \u89C4\u5219 */
.ff-rule{padding:10px 13px;border-top:1px solid #1d2330}
.ff-rule-h{display:flex;align-items:center;gap:8px}
.ff-rule-h b{font-size:12.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-rule-sum{font-size:11px;color:#8B95A7;margin-top:3px;line-height:1.6}
.ff-toggle{width:34px;height:20px;border-radius:10px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ff-toggle.on{background:#2b6cb0}
.ff-toggle i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ff-toggle.on i{left:16px}
.ff-field{display:flex;align-items:center;gap:10px;padding:7px 13px;border-top:1px solid #1d2330}
.ff-field-l{flex:1;min-width:0}
.ff-field-l b{font-size:12.5px;display:block}
.ff-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ff-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 13px}
.ff-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:0 13px 8px}
.ff-lab{font-size:10.5px;color:#8B95A7;display:block;margin-bottom:3px}

/* \u5386\u53F2 */
.ff-batch{padding:10px 13px;border-top:1px solid #1d2330}
.ff-batch-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ff-batch-h b{font-size:11px;font-family:Consolas,Menlo,monospace}
.ff-batch-sum{font-size:11px;color:#C9D1D9;margin-top:3px}
.ff-ops{margin-top:6px;max-height:240px;overflow-y:auto}
`;
function FileFlowPanel(_props) {
  const [tab, setTab] = useState5("overview");
  const [data, setData] = useState5(null);
  const [err, setErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const [stale, setStale] = useState5(false);
  const toastTimer = useRef(null);
  const showToast = useCallback((t) => {
    setToast(t);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const d = await loadPanelData();
      setData(d);
      setStale(false);
      setErr("");
    } catch (e) {
      setStale(true);
      setErr(String(e.message || e));
    }
  }, []);
  useEffect2(() => {
    refresh();
    let timer = null;
    const loop = () => {
      if (document.visibilityState === "visible") refresh();
    };
    timer = window.setInterval(loop, 6e3);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  const meta = data?.meta;
  const bridge = meta?.bridge || "down";
  const heartbeatOk = meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 3 * 60 * 1e3;
  const dotCls = bridge === "ok" && heartbeatOk ? "ok" : bridge === "ok" ? "stale" : "down";
  return /* @__PURE__ */ jsxs5("div", { className: "ff-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "ff-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "ff-logo", children: "\u{1F5C2}" }),
      /* @__PURE__ */ jsxs5("div", { className: "ff-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u6587\u4EF6\u7BA1\u5BB6" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("span", { className: `ff-dot ${dotCls}` }),
          bridge === "ok" ? heartbeatOk ? "\u670D\u52A1\u8FD0\u884C\u4E2D" : "\u670D\u52A1\u5FC3\u8DF3\u6EDE\u540E" : "\u670D\u52A1\u79BB\u7EBF/\u542F\u52A8\u4E2D",
          /* @__PURE__ */ jsxs5("span", { className: "ff-hint", children: [
            "v",
            data?.snapshot?.version || meta?.version || "0.1.0"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "ff-tabs", children: [["overview", "\u603B\u89C8"], ["rules", "\u89C4\u5219"], ["history", "\u5386\u53F2"], ["settings", "\u8BBE\u7F6E"]].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `ff-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "ff-body", children: [
      err && /* @__PURE__ */ jsx5("div", { className: "ff-err", children: err }),
      !data && !err && /* @__PURE__ */ jsx5("div", { className: "ff-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
      data && /* @__PURE__ */ jsxs5(Fragment5, { children: [
        tab === "overview" && /* @__PURE__ */ jsx5(OverviewTab, { data, refresh, showToast }),
        tab === "rules" && /* @__PURE__ */ jsx5(RulesTab, { data, refresh, showToast }),
        tab === "history" && /* @__PURE__ */ jsx5(HistoryTab, { refresh, showToast }),
        tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, refresh, showToast })
      ] }),
      stale && data && /* @__PURE__ */ jsx5("div", { className: "ff-sub", style: { padding: "0 16px 8px", color: "#D29922" }, children: "\u4E0A\u6B21\u5237\u65B0\u5931\u8D25\uFF0C\u663E\u793A\u7684\u662F\u7F13\u5B58\u6570\u636E\uFF08\u670D\u52A1\u53EF\u80FD\u5728\u91CD\u542F\uFF09" })
    ] }),
    toast && /* @__PURE__ */ jsx5("div", { className: `ff-toast ${toast.bad ? "bad" : ""}`, children: /* @__PURE__ */ jsx5("div", { className: "ff-toast-wrap", children: toast.msg }) })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function FileFlowEntry(props) {
  return /* @__PURE__ */ jsx6(FileFlowPanel, { ...props });
}
export {
  FileFlowEntry as default
};
