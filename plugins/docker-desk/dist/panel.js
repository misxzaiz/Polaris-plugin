// src/Panel.tsx
import { useCallback as useCallback7, useEffect as useEffect6, useState as useState7 } from "react";

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
async function kvGet(key) {
  try {
    const res = await getHostInvoke()("router_dispatch", {
      req: { target: "cap.kv", payload: { action: "get", key } }
    });
    if (res && res.ok && res.result) return res.result.value !== void 0 ? res.result.value : null;
    return null;
  } catch (_) {
    return null;
  }
}

// src/model.ts
var KV_SERVICE = "dkd.service";
var INFO_TTL_MS = 3e4;
var cached = null;
function invalidateService() {
  cached = null;
}
async function discover() {
  const v = await kvGet(KV_SERVICE);
  if (v && Number.isFinite(v.port) && typeof v.token === "string" && v.token && !(v.updatedAt && Date.now() - v.updatedAt > 9e4)) return v;
  return null;
}
var ServiceError = class extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
};
async function ensureInfo() {
  if (cached && Date.now() - cached.at <= INFO_TTL_MS) return cached.info;
  const info = await discover();
  if (!info) {
    throw new ServiceError("no-service", "\u540E\u53F0\u670D\u52A1\u672A\u5C31\u7EEA\uFF08\u9762\u677F\u6253\u5F00\u51E0\u79D2\u540E\u81EA\u52A8\u91CD\u8BD5\uFF1B\u82E5\u6301\u7EED\u51FA\u73B0\u8BF7\u91CD\u542F Polaris\uFF09");
  }
  cached = { info, at: Date.now() };
  return info;
}
async function request(method, path, body, retry = true) {
  const info = await ensureInfo();
  const base = `http://127.0.0.1:${info.port}`;
  let resp;
  try {
    resp = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${info.token}`,
        ...body !== void 0 ? { "Content-Type": "application/json" } : {}
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
  } catch (e) {
    invalidateService();
    if (retry) return request(method, path, body, false);
    throw new ServiceError("http", `\u65E0\u6CD5\u8FDE\u63A5\u540E\u53F0\u670D\u52A1\uFF08${e.message}\uFF09`);
  }
  if (resp.status === 401 && retry) {
    invalidateService();
    return request(method, path, body, false);
  }
  let parsed = null;
  try {
    parsed = await resp.json();
  } catch (_) {
  }
  if (!resp.ok || parsed && parsed.ok === false) {
    const msg = parsed && parsed.error || `HTTP ${resp.status}`;
    throw new ServiceError("engine", msg);
  }
  return parsed;
}
var api = {
  engine: () => request("GET", "/api/engine"),
  containers: (all = true) => request("GET", `/api/containers?all=${all ? "1" : "0"}`),
  containerAction: (id, action, timeout) => request("POST", `/api/containers/${encodeURIComponent(id)}/${action}`, timeout !== void 0 ? { timeout } : {}),
  containerRemove: (id, confirm, force) => request("POST", `/api/containers/${encodeURIComponent(id)}/remove`, { confirm, force }),
  inspect: (id) => request("GET", `/api/containers/${encodeURIComponent(id)}/inspect`),
  statsAll: () => request("GET", "/api/stats"),
  statsOne: (id) => request("GET", `/api/stats?nameOrId=${encodeURIComponent(id)}`),
  logsOnce: (id, tail) => request("GET", `/api/containers/${encodeURIComponent(id)}/logs?tail=${tail}`),
  /** follow 流式日志：返回原始 Response（调用方用 reader 消费；首次调用会先做服务发现） */
  logsFollow: async (id, tail) => {
    const info = await ensureInfo();
    return fetch(`http://127.0.0.1:${info.port}/api/containers/${encodeURIComponent(id)}/logs?tail=${tail}&follow=1`, {
      headers: { Authorization: `Bearer ${info.token}` }
    });
  },
  images: () => request("GET", "/api/images"),
  imageRemove: (idOrName, confirm) => request("POST", `/api/images/${encodeURIComponent(idOrName)}/remove`, { confirm }),
  df: () => request("GET", "/api/df"),
  events: (limit = 200) => request("GET", `/api/events?limit=${limit}`),
  selftest: () => request("POST", "/api/selftest", {})
};
function logsToPrompt(name, lines, maxChars = 8e3) {
  const body = lines.map((l) => `${l.stream === "stderr" ? "[ERR] " : ""}${l.text}`).join("\n");
  const clipped = body.length > maxChars ? `${body.slice(-maxChars)}
\u2026\uFF08\u66F4\u65E9\u5185\u5BB9\u5DF2\u622A\u65AD\uFF0C\u4FDD\u7559\u5C3E\u90E8\uFF09` : body;
  return `\u4EE5\u4E0B\u662F\u6211\u672C\u673A Docker \u5BB9\u5668\u300C${name}\u300D\u7684\u6700\u8FD1\u65E5\u5FD7\u3002\u8BF7\u5206\u6790\uFF1A1) \u6709\u6CA1\u6709\u9519\u8BEF\u6216\u5F02\u5E38\u6A21\u5F0F\uFF1B2) \u6700\u53EF\u80FD\u7684\u6839\u56E0\uFF1B3) \u5EFA\u8BAE\u7684\u4E0B\u4E00\u6B65\u6392\u67E5\u52A8\u4F5C\u3002

\`\`\`
${clipped}
\`\`\``;
}

// src/tabs/ContainersTab.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function ContainersTab({ engineOk, showToast, jumpToLogs, askConfirm, onMutated }) {
  const [items, setItems] = useState([]);
  const [grouped, setGrouped] = useState(null);
  const [groupMode, setGroupMode] = useState(true);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!engineOk) return;
    setLoading(true);
    try {
      const r = await api.containers(true);
      setItems(r.items || []);
      setGrouped(r.grouped || null);
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [engineOk]);
  useEffect(() => {
    load();
    if (!auto) return () => void 0;
    const t = setInterval(load, 5e3);
    return () => clearInterval(t);
  }, [load, auto]);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((c) => {
      if (filter === "running" && !c.running) return false;
      if (filter === "exited" && (c.running || c.state !== "exited")) return false;
      if (kw && !`${c.name} ${c.image} ${c.composeProject}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [items, filter, q]);
  const filteredGrouped = useMemo(() => grouped ? {
    projects: grouped.projects.map((g) => ({ ...g, items: g.items.filter((c) => filtered.some((f) => f.id === c.id)) })).filter((g) => g.items.length > 0),
    loose: grouped.loose.filter((c) => filtered.some((f) => f.id === c.id))
  } : null, [grouped, filtered]);
  const doAction = useCallback(async (c, action) => {
    setBusyId(c.id);
    try {
      await api.containerAction(c.id, action);
      showToast(`\u5BB9\u5668 ${c.name} \u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}`);
      await load();
      onMutated();
    } catch (e) {
      showToast(e.message || "\u64CD\u4F5C\u5931\u8D25", true);
    } finally {
      setBusyId("");
    }
  }, [showToast, load, onMutated]);
  const askRemove = useCallback((c) => {
    askConfirm({
      title: `\u5220\u9664\u5BB9\u5668 ${c.name}`,
      expect: c.name,
      hint: `\u955C\u50CF ${c.image} \xB7 \u5F53\u524D\u72B6\u6001 ${c.stateText}\u3002\u5220\u9664\u540E\u5BB9\u5668\u5C42\uFF08\u672A\u6302\u8F7D\u5377\u7684\u6570\u636E\uFF09\u4E0D\u53EF\u6062\u590D\uFF1B\u5377\u4E0D\u4F1A\u88AB\u5220\u9664\u3002`,
      onConfirm: async () => {
        await api.containerRemove(c.id, c.name, false);
        showToast(`\u5BB9\u5668 ${c.name} \u5DF2\u5220\u9664`);
        await load();
        onMutated();
      }
    });
  }, [askConfirm, showToast, load, onMutated]);
  if (!engineOk) return /* @__PURE__ */ jsx("div", { className: "dk-pad dk-dim", children: "Docker \u5F15\u64CE\u672A\u8FDE\u63A5\u3002" });
  return /* @__PURE__ */ jsxs("div", { className: "dk-pad", children: [
    /* @__PURE__ */ jsxs("div", { className: "dk-row", children: [
      [["all", `\u5168\u90E8 ${items.length}`], ["running", `\u8FD0\u884C\u4E2D ${items.filter((x) => x.running).length}`], ["exited", `\u5DF2\u9000\u51FA ${items.filter((x) => x.state === "exited").length}`]].map(([k, label]) => /* @__PURE__ */ jsx("button", { type: "button", className: `dk-btn dk-btn-sm ${filter === k ? "dk-tab-on" : ""}`, style: filter === k ? { background: "#1c2940", color: "#fff" } : void 0, onClick: () => setFilter(k), children: label }, k)),
      /* @__PURE__ */ jsx("input", { className: "dk-input", style: { width: 180 }, placeholder: "\u641C\u7D22 \u540D\u79F0/\u955C\u50CF/\u9879\u76EE", value: q, onChange: (e) => setQ(e.target.value) }),
      /* @__PURE__ */ jsx("span", { className: "dk-grow" }),
      /* @__PURE__ */ jsxs("label", { className: "dk-dim dk-small", style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: groupMode, onChange: (e) => setGroupMode(e.target.checked) }),
        "compose \u5206\u7EC4"
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "dk-dim dk-small", style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: auto, onChange: (e) => setAuto(e.target.checked) }),
        "5s \u81EA\u52A8\u5237\u65B0"
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: load, children: loading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0" })
    ] }),
    err && /* @__PURE__ */ jsx("div", { className: "dk-err dk-mt8", children: err }),
    !err && filtered.length === 0 && /* @__PURE__ */ jsx("div", { className: "dk-dim dk-mt8", children: "\u6CA1\u6709\u5339\u914D\u7684\u5BB9\u5668\u3002" }),
    groupMode && filteredGrouped ? /* @__PURE__ */ jsxs(Fragment, { children: [
      filteredGrouped.projects.map((g) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "dk-group", children: [
          /* @__PURE__ */ jsxs("strong", { children: [
            "\u25C6 ",
            g.name
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "dk-dim", children: [
            "compose \u9879\u76EE \xB7 ",
            g.running,
            "/",
            g.total,
            " \u8FD0\u884C\u4E2D"
          ] })
        ] }),
        /* @__PURE__ */ jsx(ContainerTable, { items: g.items, busyId, onAction: doAction, onLogs: jumpToLogs, onRemove: askRemove })
      ] }, g.name)),
      filteredGrouped.loose.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "dk-group", children: [
          /* @__PURE__ */ jsx("strong", { children: "\u25C7 \u72EC\u7ACB\u5BB9\u5668" }),
          /* @__PURE__ */ jsx("span", { className: "dk-dim", children: "\u4E0D\u5C5E\u4E8E\u4EFB\u4F55 compose \u9879\u76EE" })
        ] }),
        /* @__PURE__ */ jsx(ContainerTable, { items: filteredGrouped.loose, busyId, onAction: doAction, onLogs: jumpToLogs, onRemove: askRemove })
      ] })
    ] }) : /* @__PURE__ */ jsx(ContainerTable, { items: filtered, busyId, onAction: doAction, onLogs: jumpToLogs, onRemove: askRemove })
  ] });
}
function ContainerTable({ items, busyId, onAction, onLogs, onRemove }) {
  return /* @__PURE__ */ jsxs("table", { className: "dk-table", children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { children: "\u540D\u79F0" }),
      /* @__PURE__ */ jsx("th", { children: "\u955C\u50CF" }),
      /* @__PURE__ */ jsx("th", { children: "\u72B6\u6001" }),
      /* @__PURE__ */ jsx("th", { children: "\u7AEF\u53E3" }),
      /* @__PURE__ */ jsx("th", { children: "\u521B\u5EFA" }),
      /* @__PURE__ */ jsx("th", { style: { width: 250 }, children: "\u64CD\u4F5C" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: items.map((c) => {
      const chip = stateChip(c.state);
      const busy = busyId === c.id;
      return /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsxs("td", { children: [
          /* @__PURE__ */ jsx("span", { className: "dk-mono", children: c.name }),
          c.composeService && /* @__PURE__ */ jsxs("div", { className: "dk-dim dk-small", children: [
            "service: ",
            c.composeService
          ] })
        ] }),
        /* @__PURE__ */ jsx("td", { className: "dk-mono dk-dim", children: c.image }),
        /* @__PURE__ */ jsxs("td", { children: [
          /* @__PURE__ */ jsx("span", { className: `dk-chip ${chip.cls}`, children: chip.text }),
          c.status && /* @__PURE__ */ jsx("div", { className: "dk-dim dk-small", children: c.status })
        ] }),
        /* @__PURE__ */ jsx("td", { className: "dk-mono dk-small", children: c.ports.join(" ") || "\u2014" }),
        /* @__PURE__ */ jsx("td", { className: "dk-dim dk-small", children: c.age }),
        /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsxs("div", { className: "dk-row", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: () => onLogs(c.name), children: "\u65E5\u5FD7" }),
          c.running ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "dk-btn dk-btn-sm", disabled: busy, onClick: () => onAction(c, "stop"), children: "\u505C\u6B62" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "dk-btn dk-btn-sm", disabled: busy, onClick: () => onAction(c, "restart"), children: "\u91CD\u542F" })
          ] }) : /* @__PURE__ */ jsx("button", { type: "button", className: "dk-btn dk-btn-sm", disabled: busy, onClick: () => onAction(c, "start"), children: "\u542F\u52A8" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "dk-btn dk-btn-sm dk-btn-danger", disabled: busy, onClick: () => onRemove(c), children: "\u5220\u9664" })
        ] }) })
      ] }, c.id);
    }) })
  ] });
}

// src/tabs/LogsTab.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useMemo as useMemo2, useRef, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var MAX_LINES = 5e3;
function LogsTab({ engineOk, initialTarget, showToast, onSendToChat }) {
  const [names, setNames] = useState2([]);
  const [target, setTarget] = useState2(initialTarget);
  const [tail, setTail] = useState2(200);
  const [follow, setFollow] = useState2(false);
  const [lines, setLines] = useState2([]);
  const [filter, setFilter] = useState2("");
  const [paused, setPaused] = useState2(false);
  const [err, setErr] = useState2("");
  const [loading, setLoading] = useState2(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  useEffect2(() => {
    if (!engineOk) return;
    let alive = true;
    api.containers(false).then((r) => {
      if (!alive) return;
      const list = (r.items || []).map((c) => ({ name: c.name, running: c.running }));
      setNames(list);
      setTarget((cur) => cur && list.some((x) => x.name === cur) ? cur : list.find((x) => x.running)?.name || list[0]?.name || "");
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [engineOk]);
  const loadOnce = useCallback2(async () => {
    if (!target) return;
    setLoading(true);
    try {
      const r = await api.logsOnce(target, tail);
      setLines(r.lines.map((l) => ({ stream: l.stream, text: l.text })));
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [target, tail]);
  useEffect2(() => {
    if (!engineOk || !target) return () => void 0;
    if (!follow) {
      loadOnce();
      return () => void 0;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setLines([]);
    const run = async () => {
      try {
        const resp = await api.logsFollow(target, tail);
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => "");
          let msg = `HTTP ${resp.status}`;
          try {
            msg = JSON.parse(text).error || msg;
          } catch (_) {
          }
          setErr(msg);
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        setErr("");
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop() || "";
          if (pausedRef.current || parts.length === 0) continue;
          setLines((prev) => {
            const next = [...prev];
            for (const raw of parts) {
              if (!raw) continue;
              const isErr = raw.startsWith("[E] ");
              next.push({ stream: isErr ? "stderr" : "stdout", text: isErr ? raw.slice(4) : raw.startsWith("[O] ") ? raw.slice(4) : raw });
            }
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
        }
      } catch (e) {
        if (e.name !== "AbortError") setErr(e.message || String(e));
      }
    };
    run();
    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [engineOk, target, tail, follow, loadOnce]);
  useEffect2(() => {
    if (!paused && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, paused]);
  useEffect2(() => () => {
    abortRef.current?.abort();
  }, []);
  const visible = useMemo2(() => {
    const kw = filter.trim().toLowerCase();
    if (!kw) return lines;
    return lines.filter((l) => l.text.toLowerCase().includes(kw));
  }, [lines, filter]);
  const askAi = useCallback2(async () => {
    if (!target) return;
    if (!onSendToChat) {
      showToast("\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u7ED9 AI", true);
      return;
    }
    const src = visible.length ? visible : lines;
    if (!src.length) {
      showToast("\u5F53\u524D\u6CA1\u6709\u65E5\u5FD7\u53EF\u53D1\u9001", true);
      return;
    }
    const recent = src.slice(-150);
    try {
      await onSendToChat(logsToPrompt(target, recent));
      showToast("\u5DF2\u53D1\u9001\u7ED9 AI \u4F1A\u8BDD");
    } catch (e) {
      showToast(`\u53D1\u9001\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [target, visible, lines, onSendToChat, showToast]);
  return /* @__PURE__ */ jsxs2("div", { className: "dk-pad", style: { display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "dk-row", children: [
      /* @__PURE__ */ jsxs2("select", { className: "dk-select", value: target, onChange: (e) => setTarget(e.target.value), children: [
        !target && /* @__PURE__ */ jsx2("option", { value: "", children: "\u9009\u62E9\u5BB9\u5668" }),
        names.map((n) => /* @__PURE__ */ jsxs2("option", { value: n.name, children: [
          n.name,
          n.running ? "" : "\uFF08\u5DF2\u505C\u6B62\uFF09"
        ] }, n.name))
      ] }),
      /* @__PURE__ */ jsx2("select", { className: "dk-select", value: tail, onChange: (e) => setTail(parseInt(e.target.value, 10)), children: [100, 200, 500, 1e3].map((n) => /* @__PURE__ */ jsxs2("option", { value: n, children: [
        "tail ",
        n
      ] }, n)) }),
      /* @__PURE__ */ jsxs2("label", { className: "dk-dim dk-small", style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: follow, onChange: (e) => setFollow(e.target.checked) }),
        "live \u8DDF\u968F"
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "dk-dim dk-small", style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: paused, onChange: (e) => setPaused(e.target.checked) }),
        "\u6682\u505C\u6EDA\u52A8"
      ] }),
      /* @__PURE__ */ jsx2("input", { className: "dk-input", style: { width: 160 }, placeholder: "\u8FC7\u6EE4\u5173\u952E\u5B57", value: filter, onChange: (e) => setFilter(e.target.value) }),
      /* @__PURE__ */ jsx2("span", { className: "dk-grow" }),
      !follow && /* @__PURE__ */ jsx2("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: loadOnce, children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u5237\u65B0" }),
      /* @__PURE__ */ jsx2("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: () => setLines([]), children: "\u6E05\u7A7A" }),
      /* @__PURE__ */ jsx2("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: askAi, title: "\u628A\u5F53\u524D\u65E5\u5FD7\u53D1\u7ED9 AI \u4F1A\u8BDD\u5206\u6790", children: "\u95EE AI" })
    ] }),
    err && /* @__PURE__ */ jsx2("div", { className: "dk-err dk-mt8", children: err }),
    /* @__PURE__ */ jsx2("div", { ref: scrollRef, className: "dk-logwrap dk-mono dk-mt8", children: visible.length === 0 ? /* @__PURE__ */ jsx2("span", { className: "dk-dim", children: target ? "\u6682\u65E0\u65E5\u5FD7\u8F93\u51FA\uFF08\u6216\u88AB\u8FC7\u6EE4\u5668\u9690\u85CF\uFF09\u3002" : "\u5148\u9009\u62E9\u4E00\u4E2A\u5BB9\u5668\u3002" }) : visible.map((l, i) => /* @__PURE__ */ jsx2("div", { className: `dk-logline ${l.stream === "stderr" ? "dk-logerr" : ""}`, children: l.text }, `${i}-${l.text.slice(0, 12)}`)) }),
    /* @__PURE__ */ jsx2("div", { className: "dk-dim dk-small dk-mt8", children: lines.length > 0 && `\u7F13\u51B2 ${lines.length}/${MAX_LINES} \u884C${filter ? ` \xB7 \u8FC7\u6EE4\u540E ${visible.length} \u884C` : ""} \xB7 \u4EC5\u5185\u5B58\u4E0D\u843D\u76D8` })
  ] });
}

// src/tabs/StatsTab.tsx
import { useCallback as useCallback3, useEffect as useEffect3, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function pct(n) {
  return n == null ? "\u2014" : `${n}%`;
}
function bar(n) {
  return n == null ? 0 : Math.max(0, Math.min(100, n));
}
function StatsTab({ engineOk }) {
  const [items, setItems] = useState3([]);
  const [err, setErr] = useState3("");
  const [auto, setAuto] = useState3(true);
  const [loading, setLoading] = useState3(false);
  const load = useCallback3(async () => {
    if (!engineOk) return;
    setLoading(true);
    try {
      const r = await api.statsAll();
      setItems(r.items || []);
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [engineOk]);
  useEffect3(() => {
    load();
    if (!auto) return () => void 0;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load, auto]);
  if (!engineOk) return /* @__PURE__ */ jsx3("div", { className: "dk-pad dk-dim", children: "Docker \u5F15\u64CE\u672A\u8FDE\u63A5\u3002" });
  return /* @__PURE__ */ jsxs3("div", { className: "dk-pad", children: [
    /* @__PURE__ */ jsxs3("div", { className: "dk-row", children: [
      /* @__PURE__ */ jsx3("span", { className: "dk-dim dk-small", children: "\u5355\u5E27\u5FEB\u7167\uFF08Engine \u4E0D\u63D0\u4F9B\u5386\u53F2\u66F2\u7EBF\uFF09\uFF1B\u521A\u542F\u52A8\u7684\u5BB9\u5668 CPU \u53EF\u80FD\u77ED\u6682\u663E\u793A 0%\u3002" }),
      /* @__PURE__ */ jsx3("span", { className: "dk-grow" }),
      /* @__PURE__ */ jsxs3("label", { className: "dk-dim dk-small", style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: auto, onChange: (e) => setAuto(e.target.checked) }),
        "2.5s \u81EA\u52A8\u5237\u65B0"
      ] }),
      /* @__PURE__ */ jsx3("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: load, children: loading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0" })
    ] }),
    err && /* @__PURE__ */ jsx3("div", { className: "dk-err dk-mt8", children: err }),
    !err && items.length === 0 && /* @__PURE__ */ jsx3("div", { className: "dk-dim dk-mt8", children: "\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u5BB9\u5668\u3002" }),
    items.length > 0 && /* @__PURE__ */ jsxs3("table", { className: "dk-table dk-mt8", children: [
      /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("th", { children: "\u5BB9\u5668" }),
        /* @__PURE__ */ jsx3("th", { style: { width: 260 }, children: "CPU" }),
        /* @__PURE__ */ jsx3("th", { style: { width: 300 }, children: "\u5185\u5B58" }),
        /* @__PURE__ */ jsx3("th", { children: "\u7F51\u7EDC I/O" }),
        /* @__PURE__ */ jsx3("th", { children: "\u5757 I/O" })
      ] }) }),
      /* @__PURE__ */ jsx3("tbody", { children: items.map((s) => /* @__PURE__ */ jsxs3("tr", { children: [
        /* @__PURE__ */ jsx3("td", { className: "dk-mono", children: s.name }),
        /* @__PURE__ */ jsxs3("td", { children: [
          /* @__PURE__ */ jsx3("div", { className: "dk-row", children: /* @__PURE__ */ jsxs3("span", { style: { width: 48 }, children: [
            s.cpuPct,
            "%"
          ] }) }),
          /* @__PURE__ */ jsx3("div", { style: { height: 4, background: "#1b2230", borderRadius: 2, marginTop: 3 }, children: /* @__PURE__ */ jsx3("div", { style: { height: 4, borderRadius: 2, width: `${bar(s.cpuPct)}%`, background: s.cpuPct > 80 ? "#f85149" : "#2f81f7" } }) })
        ] }),
        /* @__PURE__ */ jsxs3("td", { children: [
          /* @__PURE__ */ jsxs3("div", { className: "dk-row dk-small", children: [
            /* @__PURE__ */ jsxs3("span", { children: [
              fmtMB(s.memUsed),
              " / ",
              fmtMB(s.memLimit)
            ] }),
            /* @__PURE__ */ jsx3("span", { className: "dk-dim", children: pct(s.memPct) })
          ] }),
          /* @__PURE__ */ jsx3("div", { style: { height: 4, background: "#1b2230", borderRadius: 2, marginTop: 3 }, children: /* @__PURE__ */ jsx3("div", { style: { height: 4, borderRadius: 2, width: `${bar(s.memPct)}%`, background: (s.memPct || 0) > 90 ? "#f85149" : "#3fb950" } }) })
        ] }),
        /* @__PURE__ */ jsxs3("td", { className: "dk-small dk-dim", children: [
          "\u2191 ",
          fmtMB(s.netTx),
          " \xB7 \u2193 ",
          fmtMB(s.netRx)
        ] }),
        /* @__PURE__ */ jsxs3("td", { className: "dk-small dk-dim", children: [
          "\u8BFB ",
          fmtMB(s.blkRead),
          " \xB7 \u5199 ",
          fmtMB(s.blkWrite)
        ] })
      ] }, s.id)) })
    ] })
  ] });
}
function fmtMB(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// src/tabs/ImagesTab.tsx
import { useCallback as useCallback4, useEffect as useEffect4, useMemo as useMemo3, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function fmtSize(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
function ImagesTab({ engineOk, showToast, askConfirm, onMutated }) {
  const [items, setItems] = useState4([]);
  const [df, setDf] = useState4(null);
  const [q, setQ] = useState4("");
  const [danglingOnly, setDanglingOnly] = useState4(false);
  const [err, setErr] = useState4("");
  const load = useCallback4(async () => {
    if (!engineOk) return;
    try {
      const [r, d] = await Promise.all([api.images(), api.df().catch(() => null)]);
      setItems(r.items || []);
      setDf(d?.df || null);
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [engineOk]);
  useEffect4(() => {
    load();
  }, [load]);
  const filtered = useMemo3(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((i) => {
      if (danglingOnly && !(i.repo === "<none>" && i.containers === 0)) return false;
      if (kw && !`${i.repo}:${i.tag} ${i.id}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [items, q, danglingOnly]);
  const askRemove = useCallback4((img) => {
    const full = img.repo === "<none>" ? img.id : `${img.repo}:${img.tag}`;
    askConfirm({
      title: `\u5220\u9664\u955C\u50CF ${full}`,
      expect: full,
      hint: `${fmtSize(img.size)} \xB7 ${img.containers ? `\u6B63\u88AB ${img.containers} \u4E2A\u5BB9\u5668\u4F7F\u7528\uFF08\u5220\u9664\u4F1A\u88AB\u5F15\u64CE\u62D2\u7EDD\uFF09` : "\u672A\u88AB\u4EFB\u4F55\u5BB9\u5668\u4F7F\u7528"}`,
      onConfirm: async () => {
        await api.imageRemove(img.id, full);
        showToast(`\u955C\u50CF ${full} \u5DF2\u5220\u9664`);
        await load();
        onMutated();
      }
    });
  }, [askConfirm, showToast, load, onMutated]);
  if (!engineOk) return /* @__PURE__ */ jsx4("div", { className: "dk-pad dk-dim", children: "Docker \u5F15\u64CE\u672A\u8FDE\u63A5\u3002" });
  return /* @__PURE__ */ jsxs4("div", { className: "dk-pad", children: [
    df && /* @__PURE__ */ jsxs4("div", { className: "dk-banner", style: { marginBottom: 12 }, children: [
      /* @__PURE__ */ jsx4("strong", { children: "\u78C1\u76D8\u5360\u7528" }),
      /* @__PURE__ */ jsxs4("div", { className: "dk-kv", children: [
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u955C\u50CF" }),
        /* @__PURE__ */ jsxs4("span", { children: [
          df.imagesCount,
          " \u4E2A \xB7 ",
          fmtSize(df.imagesSize),
          "\uFF08\u542B ",
          df.danglingCount,
          " \u4E2A dangling\uFF09"
        ] }),
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u5BB9\u5668\u5C42" }),
        /* @__PURE__ */ jsxs4("span", { children: [
          df.containersCount,
          " \u4E2A \xB7 ",
          fmtSize(df.containersSize)
        ] }),
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u5377" }),
        /* @__PURE__ */ jsxs4("span", { children: [
          df.volumesCount,
          " \u4E2A \xB7 ",
          fmtSize(df.volumesSize)
        ] }),
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u6784\u5EFA\u7F13\u5B58" }),
        /* @__PURE__ */ jsxs4("span", { children: [
          df.buildCacheCount,
          " \u6761 \xB7 ",
          fmtSize(df.reclaimBuildCache)
        ] }),
        /* @__PURE__ */ jsx4("span", { className: "k", children: "\u53EF\u56DE\u6536\u4F30\u7B97" }),
        /* @__PURE__ */ jsxs4("span", { className: "dk-ok", children: [
          fmtSize(df.reclaimable),
          "\uFF08\u672A\u4F7F\u7528\u955C\u50CF + \u6784\u5EFA\u7F13\u5B58\uFF09"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "dk-row", children: [
      /* @__PURE__ */ jsx4("input", { className: "dk-input", style: { width: 200 }, placeholder: "\u641C\u7D22 repo/tag/id", value: q, onChange: (e) => setQ(e.target.value) }),
      /* @__PURE__ */ jsxs4("label", { className: "dk-dim dk-small", style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: danglingOnly, onChange: (e) => setDanglingOnly(e.target.checked) }),
        "\u53EA\u770B\u65E0\u4E3B\u955C\u50CF"
      ] }),
      /* @__PURE__ */ jsx4("span", { className: "dk-grow" }),
      /* @__PURE__ */ jsx4("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: load, children: "\u5237\u65B0" })
    ] }),
    err && /* @__PURE__ */ jsx4("div", { className: "dk-err dk-mt8", children: err }),
    !err && filtered.length === 0 && /* @__PURE__ */ jsx4("div", { className: "dk-dim dk-mt8", children: "\u6CA1\u6709\u5339\u914D\u7684\u955C\u50CF\u3002" }),
    filtered.length > 0 && /* @__PURE__ */ jsxs4("table", { className: "dk-table dk-mt8", children: [
      /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("th", { children: "\u955C\u50CF" }),
        /* @__PURE__ */ jsx4("th", { children: "tag" }),
        /* @__PURE__ */ jsx4("th", { children: "\u5927\u5C0F" }),
        /* @__PURE__ */ jsx4("th", { children: "\u521B\u5EFA" }),
        /* @__PURE__ */ jsx4("th", { children: "\u88AB\u5F15\u7528" }),
        /* @__PURE__ */ jsx4("th", { style: { width: 80 }, children: "\u64CD\u4F5C" })
      ] }) }),
      /* @__PURE__ */ jsx4("tbody", { children: filtered.map((i) => /* @__PURE__ */ jsxs4("tr", { children: [
        /* @__PURE__ */ jsx4("td", { className: "dk-mono", children: i.repo }),
        /* @__PURE__ */ jsxs4("td", { className: "dk-mono dk-dim", children: [
          i.tag,
          i.tags.length > 1 ? ` +${i.tags.length - 1}` : ""
        ] }),
        /* @__PURE__ */ jsx4("td", { className: "dk-small", children: fmtSize(i.size) }),
        /* @__PURE__ */ jsx4("td", { className: "dk-small dk-dim", children: i.created ? new Date(i.created).toLocaleDateString("zh-CN") : "\u2014" }),
        /* @__PURE__ */ jsx4("td", { className: "dk-small", children: i.containers ? `${i.containers} \u4E2A\u5BB9\u5668` : /* @__PURE__ */ jsx4("span", { className: "dk-dim", children: "\u672A\u4F7F\u7528" }) }),
        /* @__PURE__ */ jsx4("td", { children: /* @__PURE__ */ jsx4("button", { type: "button", className: "dk-btn dk-btn-sm dk-btn-danger", onClick: () => askRemove(i), children: "\u5220\u9664" }) })
      ] }, i.id)) })
    ] })
  ] });
}

// src/tabs/EventsTab.tsx
import { useCallback as useCallback5, useEffect as useEffect5, useMemo as useMemo4, useState as useState5 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var TYPE_COLORS = {
  container: "#9ecbff",
  image: "#d2a8ff",
  network: "#7ee787",
  volume: "#79c0ff"
};
function actionChip(action) {
  if (["die", "kill", "oom", "destroy", "prune"].includes(action)) return "#f28b93";
  if (["start", "restart"].includes(action)) return "#3fb950";
  if (action === "stop" || action === "pause") return "#d29922";
  return "#8b95a7";
}
function EventsTab({ engineOk }) {
  const [items, setItems] = useState5([]);
  const [pumpRunning, setPumpRunning] = useState5(false);
  const [type, setType] = useState5("all");
  const [q, setQ] = useState5("");
  const [err, setErr] = useState5("");
  const load = useCallback5(async () => {
    if (!engineOk) return;
    try {
      const r = await api.events(500);
      setItems(r.items || []);
      setPumpRunning(r.pumpRunning);
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [engineOk]);
  useEffect5(() => {
    load();
    const t = setInterval(load, 3e3);
    return () => clearInterval(t);
  }, [load]);
  const types = useMemo4(() => Array.from(new Set(items.map((i) => i.type))), [items]);
  const visible = useMemo4(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((e) => {
      if (type !== "all" && e.type !== type) return false;
      if (kw && !`${e.type}/${e.action} ${e.actor} ${JSON.stringify(e.attrs)}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [items, type, q]);
  if (!engineOk) return /* @__PURE__ */ jsx5("div", { className: "dk-pad dk-dim", children: "Docker \u5F15\u64CE\u672A\u8FDE\u63A5\u3002" });
  return /* @__PURE__ */ jsxs5("div", { className: "dk-pad", children: [
    /* @__PURE__ */ jsxs5("div", { className: "dk-row", children: [
      /* @__PURE__ */ jsxs5("select", { className: "dk-select", value: type, onChange: (e) => setType(e.target.value), children: [
        /* @__PURE__ */ jsx5("option", { value: "all", children: "\u5168\u90E8\u7C7B\u578B" }),
        types.map((t) => /* @__PURE__ */ jsx5("option", { value: t, children: t }, t))
      ] }),
      /* @__PURE__ */ jsx5("input", { className: "dk-input", style: { width: 200 }, placeholder: "\u641C\u7D22\u52A8\u4F5C/\u5BB9\u5668\u540D", value: q, onChange: (e) => setQ(e.target.value) }),
      /* @__PURE__ */ jsx5("span", { className: "dk-grow" }),
      /* @__PURE__ */ jsx5("span", { className: `dk-small ${pumpRunning ? "dk-ok" : "dk-err"}`, children: pumpRunning ? "\u25CF \u4E8B\u4EF6\u6D41\u5DF2\u8FDE\u63A5" : "\u25CB \u4E8B\u4EF6\u6D41\u672A\u8FDE\u63A5\uFF08\u5F15\u64CE\u672A\u5C31\u7EEA\u65F6\u4F1A\u81EA\u52A8\u91CD\u8FDE\uFF09" }),
      /* @__PURE__ */ jsx5("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: load, children: "\u5237\u65B0" })
    ] }),
    err && /* @__PURE__ */ jsx5("div", { className: "dk-err dk-mt8", children: err }),
    /* @__PURE__ */ jsx5("div", { className: "dk-dim dk-small dk-mt8", children: "service \u542F\u52A8\u4EE5\u6765\u7684\u5BB9\u5668\u4E8B\u4EF6\uFF08\u5185\u5B58\u73AF\u5F62\u7F13\u51B2 500 \u6761\uFF0C\u4E0D\u843D\u76D8\uFF1B\u91CD\u542F service \u540E\u6E05\u7A7A\uFF09\u3002" }),
    !err && visible.length === 0 && /* @__PURE__ */ jsx5("div", { className: "dk-dim dk-mt8", children: "\u6682\u65E0\u4E8B\u4EF6\u3002" }),
    visible.length > 0 && /* @__PURE__ */ jsxs5("table", { className: "dk-table dk-mt8", children: [
      /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs5("tr", { children: [
        /* @__PURE__ */ jsx5("th", { style: { width: 90 }, children: "\u65F6\u95F4" }),
        /* @__PURE__ */ jsx5("th", { style: { width: 160 }, children: "\u7C7B\u578B/\u52A8\u4F5C" }),
        /* @__PURE__ */ jsx5("th", { children: "\u5BF9\u8C61" }),
        /* @__PURE__ */ jsx5("th", { children: "\u660E\u7EC6" })
      ] }) }),
      /* @__PURE__ */ jsx5("tbody", { children: visible.map((e, i) => /* @__PURE__ */ jsxs5("tr", { children: [
        /* @__PURE__ */ jsx5("td", { className: "dk-mono dk-small", children: new Date(e.time).toLocaleTimeString("zh-CN", { hour12: false }) }),
        /* @__PURE__ */ jsxs5("td", { className: "dk-mono dk-small", style: { color: TYPE_COLORS[e.type] || "#8b95a7" }, children: [
          e.type,
          "/",
          /* @__PURE__ */ jsx5("span", { style: { color: actionChip(e.action) }, children: e.action })
        ] }),
        /* @__PURE__ */ jsx5("td", { className: "dk-mono dk-small", children: e.actor || "\u2014" }),
        /* @__PURE__ */ jsx5("td", { className: "dk-small dk-dim", children: Object.entries(e.attrs || {}).map(([k, v]) => `${k}=${v}`).join("  ") || "\u2014" })
      ] }, `${e.time}-${i}`)) })
    ] })
  ] });
}

// src/tabs/DiagTab.tsx
import { useCallback as useCallback6, useState as useState6 } from "react";
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function DiagTab({ engine, engineErr, showToast, onRefresh }) {
  const [result, setResult] = useState6(null);
  const [busy, setBusy] = useState6(false);
  const runSelftest = useCallback6(async () => {
    setBusy(true);
    try {
      const r = await api.selftest();
      setResult(r.selftest || null);
    } catch (e) {
      showToast(e.message || "\u81EA\u68C0\u5931\u8D25", true);
    } finally {
      setBusy(false);
    }
  }, [showToast]);
  return /* @__PURE__ */ jsxs6("div", { className: "dk-pad", style: { display: "flex", flexDirection: "column", gap: 14 }, children: [
    /* @__PURE__ */ jsxs6("section", { children: [
      /* @__PURE__ */ jsx6("strong", { children: "\u5F15\u64CE\u8FDE\u63A5" }),
      /* @__PURE__ */ jsxs6("div", { className: "dk-kv dk-mt8", children: [
        /* @__PURE__ */ jsx6("span", { className: "k", children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsx6("span", { className: engine?.status === "ok" ? "dk-ok" : "dk-err", children: engine?.status === "ok" ? "\u5DF2\u8FDE\u63A5" : engine?.error || engineErr || "\u63A2\u6D4B\u4E2D\u2026" }),
        /* @__PURE__ */ jsx6("span", { className: "k", children: "\u7AEF\u70B9" }),
        /* @__PURE__ */ jsx6("span", { className: "dk-mono", children: engine?.endpoint?.target || "\u2014" }),
        engine?.status === "ok" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsx6("span", { className: "k", children: "\u5F15\u64CE\u7248\u672C" }),
          /* @__PURE__ */ jsxs6("span", { children: [
            engine.daemonVersion || "\u2014",
            "\uFF08API ",
            engine.apiVersion || "\u2014",
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx6("span", { className: "k", children: "\u5E73\u53F0" }),
          /* @__PURE__ */ jsxs6("span", { children: [
            engine.osType || "\u2014",
            "/",
            engine.arch || "\u2014"
          ] })
        ] }),
        /* @__PURE__ */ jsx6("span", { className: "k", children: "\u63D2\u4EF6\u7248\u672C" }),
        /* @__PURE__ */ jsx6("span", { children: engine?.version || "0.1.0" }),
        engine?.serviceUptimeMs != null && /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsx6("span", { className: "k", children: "\u670D\u52A1\u8FD0\u884C" }),
          /* @__PURE__ */ jsxs6("span", { children: [
            Math.floor(engine.serviceUptimeMs / 1e3),
            "s\uFF08\u4E8B\u4EF6\u7F13\u51B2 ",
            engine.eventsBuffered ?? 0,
            " \u6761\uFF09"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "dk-row dk-mt8", children: /* @__PURE__ */ jsx6("button", { type: "button", className: "dk-btn dk-btn-sm", onClick: onRefresh, children: "\u91CD\u65B0\u63A2\u6D4B" }) })
    ] }),
    /* @__PURE__ */ jsxs6("section", { children: [
      /* @__PURE__ */ jsx6("strong", { children: "\u81EA\u68C0\uFF08\u53EA\u8BFB\uFF0C\u65E0\u526F\u4F5C\u7528\uFF09" }),
      /* @__PURE__ */ jsxs6("div", { className: "dk-row dk-mt8", children: [
        /* @__PURE__ */ jsx6("button", { type: "button", className: "dk-btn dk-btn-sm", disabled: busy, onClick: runSelftest, children: busy ? "\u6267\u884C\u4E2D\u2026" : "\u8FD0\u884C\u81EA\u68C0" }),
        result && /* @__PURE__ */ jsxs6("span", { className: `dk-small ${result.passed === result.total ? "dk-ok" : "dk-err"}`, children: [
          result.passed,
          "/",
          result.total,
          " \u901A\u8FC7",
          result.engineStatus === "ok" ? " \xB7 \u5F15\u64CE\u5DF2\u8FDE\u63A5" : " \xB7 \u5F15\u64CE\u672A\u8FDE\u63A5\uFF08\u7EAF\u903B\u8F91\u90E8\u5206\u7167\u5E38\u6267\u884C\uFF09"
        ] })
      ] }),
      result && /* @__PURE__ */ jsx6("div", { className: "dk-pre dk-mt8", children: result.checks.map((c) => `${c.ok ? "\u2713" : "\u2717"} ${c.name}${c.ok ? "" : ` \u2014 ${c.detail}`}`).join("\n") })
    ] }),
    engine?.status !== "ok" && /* @__PURE__ */ jsxs6("section", { children: [
      /* @__PURE__ */ jsx6("strong", { children: "Docker \u672A\u8FDE\u63A5\uFF1F\u6309\u987A\u5E8F\u6392\u67E5" }),
      /* @__PURE__ */ jsxs6("ol", { style: { margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.8 }, className: "dk-dim dk-small", children: [
        /* @__PURE__ */ jsxs6("li", { children: [
          "\u672C\u673A\u6CA1\u88C5 Docker \u2014\u2014 \u524D\u5F80 ",
          /* @__PURE__ */ jsx6("span", { className: "dk-mono", children: "docker.com" }),
          " \u4E0B\u8F7D Docker Desktop\uFF08Windows/macOS\uFF09\u6216\u5B89\u88C5 Docker Engine\uFF08Linux\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsx6("li", { children: "\u88C5\u4E86\u4F46\u6CA1\u542F\u52A8 \u2014\u2014 \u542F\u52A8 Docker Desktop\uFF0C\u7B49\u6258\u76D8\u56FE\u6807\u53D8\u7EFF\uFF08\u9996\u6B21\u542F\u52A8\u53EF\u80FD\u8981\u51E0\u5341\u79D2\uFF09\u3002" }),
        /* @__PURE__ */ jsx6("li", { children: "\u521A\u542F\u52A8\u8FD8\u6CA1\u5C31\u7EEA \u2014\u2014 \u7B49\u51E0\u79D2\u70B9\u300C\u91CD\u65B0\u63A2\u6D4B\u300D\u3002" }),
        /* @__PURE__ */ jsxs6("li", { children: [
          "Windows \u63D0\u793A\u65E0\u6743\u9650 \u2014\u2014 \u628A\u5F53\u524D\u7528\u6237\u52A0\u5165 ",
          /* @__PURE__ */ jsx6("span", { className: "dk-mono", children: "docker-users" }),
          " \u7EC4\u540E\u6CE8\u9500\u91CD\u767B\u3002"
        ] }),
        /* @__PURE__ */ jsxs6("li", { children: [
          "Docker \u5728\u522B\u7684\u5730\u5740 \u2014\u2014 \u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF ",
          /* @__PURE__ */ jsx6("span", { className: "dk-mono", children: "DOCKER_HOST" }),
          "\uFF08\u5982 ",
          /* @__PURE__ */ jsx6("span", { className: "dk-mono", children: "tcp://192.168.1.10:2375" }),
          "\uFF09\u540E\u91CD\u542F Polaris\u3002"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs6("section", { children: [
      /* @__PURE__ */ jsx6("strong", { children: "\u8FB9\u754C\u8BF4\u660E" }),
      /* @__PURE__ */ jsxs6("ul", { style: { margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.8 }, className: "dk-dim dk-small", children: [
        /* @__PURE__ */ jsx6("li", { children: "AI\uFF08MCP dk_* \u5DE5\u5177\uFF09\u53EA\u8BFB\uFF1A\u542F\u505C/\u91CD\u542F/\u5220\u9664\u53EA\u5728\u9762\u677F\uFF0CAI \u65E0\u5165\u53E3\uFF1B\u5220\u9664\u7C7B\u64CD\u4F5C\u9700\u7CBE\u786E\u8F93\u5165\u540D\u79F0\u786E\u8BA4\u3002" }),
        /* @__PURE__ */ jsx6("li", { children: "\u65E5\u5FD7\u4E0E inspect \u53EA\u5728\u5185\u5B58\u6D41\u8F6C\uFF0C\u4E0D\u843D\u76D8\u3001\u4E0D\u8FDB kv\uFF1Binspect \u7ECF AI \u901A\u9053\u65F6 env \u503C\u9ED8\u8BA4\u6253\u7801\u3002" }),
        /* @__PURE__ */ jsx6("li", { children: "\u4E0D\u652F\u6301\uFF1A\u5BB9\u5668 exec \u7EC8\u7AEF\u3001compose \u7F16\u6392\u547D\u4EE4\u3001\u955C\u50CF\u6784\u5EFA\u3001swarm/k8s\uFF08\u660E\u786E\u8FB9\u754C\uFF09\u3002" }),
        /* @__PURE__ */ jsx6("li", { children: "\u517C\u5BB9 Docker 20.10+\uFF08Engine API \u2265 v1.41\uFF09\u3002" })
      ] })
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var css = `
.dk-root{display:flex;flex-direction:column;height:100%;min-height:0;background:#10141c;color:#e6eaf2;font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:13px}
.dk-mono{font-family:Consolas,Menlo,'Courier New',monospace}
.dk-dim{color:#8b95a7}
.dk-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #242c3a;background:#12161f;flex:none}
.dk-dot{width:8px;height:8px;border-radius:50%;flex:none}
.dk-dot-ok{background:#3fb950}.dk-dot-bad{background:#f85149}.dk-dot-wait{background:#d29922}
.dk-tabs{display:flex;gap:2px;padding:6px 10px 0;border-bottom:1px solid #242c3a;background:#12161f;flex:none}
.dk-tab{padding:6px 14px;border:0;background:transparent;color:#8b95a7;cursor:pointer;font-size:13px;border-radius:6px 6px 0 0}
.dk-tab:hover{color:#cdd6e4;background:#161b22}
.dk-tab-on{color:#fff;background:#1c2940}
.dk-body{flex:1;min-height:0;overflow:auto}
.dk-pad{padding:12px 14px}
.dk-table{width:100%;border-collapse:collapse}
.dk-table th{text-align:left;padding:6px 8px;color:#8b95a7;font-weight:500;font-size:12px;border-bottom:1px solid #242c3a;white-space:nowrap}
.dk-table td{padding:7px 8px;border-bottom:1px solid #1b2230;vertical-align:top}
.dk-table tr:hover td{background:#141a26}
.dk-btn{padding:4px 10px;border:1px solid #2b3648;border-radius:6px;background:#161b22;color:#cdd6e4;cursor:pointer;font-size:12px}
.dk-btn:hover{background:#1c2940;color:#fff}
.dk-btn:disabled{opacity:.45;cursor:not-allowed}
.dk-btn-danger{border-color:#5c2329;color:#f28b93}
.dk-btn-danger:hover{background:#3a1418;color:#ffb3b8}
.dk-btn-sm{padding:2px 8px;font-size:11px}
.dk-chip{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;white-space:nowrap}
.dk-chip-run{background:#12261e;color:#3fb950}
.dk-chip-exit{background:#2a1e12;color:#d29922}
.dk-chip-dead{background:#2d1416;color:#f85149}
.dk-chip-other{background:#1a2130;color:#8b95a7}
.dk-input{padding:5px 10px;border:1px solid #242c3a;border-radius:6px;background:#161b22;color:#e6eaf2;outline:none;font-size:12px}
.dk-input:focus{border-color:#2b6cb0}
.dk-select{padding:4px 8px;border:1px solid #242c3a;border-radius:6px;background:#161b22;color:#e6eaf2;font-size:12px}
.dk-banner{display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding:14px;border:1px solid #2d3a4f;border-radius:8px;background:#131a26}
.dk-group{margin:10px 0 4px;padding:5px 10px;background:#161f2e;border-radius:6px;color:#9ecbff;font-size:12px;display:flex;gap:8px;align-items:center}
.dk-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:60}
.dk-modal{width:min(520px,92%);background:#151b26;border:1px solid #2b3648;border-radius:10px;padding:16px;max-height:80%;display:flex;flex-direction:column;gap:10px}
.dk-pre{background:#0d1117;border:1px solid #242c3a;border-radius:6px;padding:10px;overflow:auto;max-height:420px;white-space:pre-wrap;word-break:break-all;font-size:12px;margin:0}
.dk-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1c2940;border:1px solid #2b6cb0;color:#e6eaf2;padding:8px 16px;border-radius:8px;font-size:12px;z-index:80;max-width:80%}
.dk-toast-bad{border-color:#f85149;background:#2d1416}
.dk-err{color:#f28b93;white-space:pre-wrap}
.dk-kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:12px}
.dk-kv .k{color:#8b95a7}
.dk-logline{white-space:pre-wrap;word-break:break-all}
.dk-logerr{color:#f28b93}
.dk-logwrap{background:#0d1117;border:1px solid #242c3a;border-radius:6px;padding:8px 10px;overflow:auto;font-size:12px;flex:1;min-height:0}
.dk-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dk-grow{flex:1;min-width:0}
.dk-mt8{margin-top:8px}
.dk-ok{color:#3fb950}
.dk-small{font-size:11px}
`;
function stateChip(state) {
  if (state === "running") return { cls: "dk-chip-run", text: "\u8FD0\u884C\u4E2D" };
  if (state === "exited" || state === "created") return { cls: "dk-chip-exit", text: state === "exited" ? "\u5DF2\u9000\u51FA" : "\u5DF2\u521B\u5EFA" };
  if (state === "dead") return { cls: "dk-chip-dead", text: "\u50F5\u6B7B" };
  return { cls: "dk-chip-other", text: state };
}
function Panel({ onSendToChat }) {
  const [tab, setTab] = useState7("containers");
  const [engine, setEngine] = useState7(null);
  const [engineErr, setEngineErr] = useState7("");
  const [toast, setToast] = useState7(null);
  const [confirmReq, setConfirmReq] = useState7(null);
  const [logsTarget, setLogsTarget] = useState7("");
  const showToast = useCallback7((text, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 2600);
  }, []);
  const refreshEngine = useCallback7(async () => {
    try {
      const r = await api.engine();
      setEngine(r.engine);
      setEngineErr("");
    } catch (e) {
      const se = e;
      setEngine(null);
      setEngineErr(se.message || String(e));
      if (se.kind === "no-service" || se.kind === "http") invalidateService();
    }
  }, []);
  useEffect6(() => {
    refreshEngine();
    const t = setInterval(refreshEngine, 1e4);
    return () => clearInterval(t);
  }, [refreshEngine]);
  const jumpToLogs = useCallback7((name) => {
    setLogsTarget(name);
    setTab("logs");
  }, []);
  const engineOk = engine?.status === "ok";
  return /* @__PURE__ */ jsxs7("div", { className: "dk-root", children: [
    /* @__PURE__ */ jsx7("style", { children: css }),
    /* @__PURE__ */ jsxs7("div", { className: "dk-bar", children: [
      /* @__PURE__ */ jsx7("span", { className: `dk-dot ${engine == null ? "dk-dot-wait" : engineOk ? "dk-dot-ok" : "dk-dot-bad"}` }),
      /* @__PURE__ */ jsx7("strong", { children: "\u5BB9\u5668\u5DE5\u4F5C\u53F0" }),
      engine == null ? /* @__PURE__ */ jsx7("span", { className: "dk-dim dk-err", children: engineErr || "\u6B63\u5728\u8FDE\u63A5\u540E\u53F0\u670D\u52A1\u2026" }) : engineOk ? /* @__PURE__ */ jsxs7("span", { className: "dk-dim", children: [
        "\u5F15\u64CE ",
        engine.daemonVersion || "?",
        "\uFF08API ",
        engine.apiVersion || "?",
        "\uFF09\xB7 ",
        engine.endpoint?.target
      ] }) : /* @__PURE__ */ jsx7("span", { className: "dk-err", children: engine.error || "Docker \u672A\u8FDE\u63A5" }),
      /* @__PURE__ */ jsx7("span", { className: "dk-grow" }),
      engineOk && engine?.runningContainers != null && /* @__PURE__ */ jsxs7("span", { className: "dk-dim dk-small", children: [
        "\u8FD0\u884C\u4E2D ",
        engine.runningContainers,
        "/",
        engine.totalContainers ?? "?"
      ] })
    ] }),
    /* @__PURE__ */ jsx7("div", { className: "dk-tabs", children: [["containers", "\u5BB9\u5668"], ["logs", "\u65E5\u5FD7"], ["stats", "\u8D44\u6E90"], ["images", "\u955C\u50CF"], ["events", "\u4E8B\u4EF6"], ["diag", "\u8BCA\u65AD"]].map(([k, label]) => /* @__PURE__ */ jsx7("button", { type: "button", className: `dk-tab ${tab === k ? "dk-tab-on" : ""}`, onClick: () => setTab(k), children: label }, k)) }),
    /* @__PURE__ */ jsx7("div", { className: "dk-body", children: !engineOk && tab !== "diag" ? /* @__PURE__ */ jsx7("div", { className: "dk-pad", children: /* @__PURE__ */ jsxs7("div", { className: "dk-banner", children: [
      /* @__PURE__ */ jsx7("strong", { children: "Docker \u5F15\u64CE\u672A\u8FDE\u63A5" }),
      /* @__PURE__ */ jsx7("span", { className: "dk-dim", children: engine?.error || engineErr || "\u6B63\u5728\u63A2\u6D4B\u672C\u673A Docker \u5F15\u64CE\u2026" }),
      /* @__PURE__ */ jsxs7("span", { className: "dk-dim dk-small", children: [
        "\u7AEF\u70B9\uFF1A",
        engine?.endpoint?.target || "\u2014",
        " \xB7 \u786E\u8BA4 Docker Desktop / Engine \u5DF2\u542F\u52A8\uFF1B\u672A\u5B89\u88C5\u65F6\u53EF\u5148\u770B\u300C\u8BCA\u65AD\u300D\u9875\u7684\u6307\u5F15\u3002"
      ] }),
      /* @__PURE__ */ jsx7("button", { type: "button", className: "dk-btn", onClick: () => setTab("diag"), children: "\u6253\u5F00\u8BCA\u65AD\u9875" })
    ] }) }) : tab === "containers" ? /* @__PURE__ */ jsx7(ContainersTab, { engineOk, showToast, jumpToLogs, askConfirm: setConfirmReq, onMutated: refreshEngine }) : tab === "logs" ? /* @__PURE__ */ jsx7(LogsTab, { engineOk, initialTarget: logsTarget, showToast, onSendToChat }) : tab === "stats" ? /* @__PURE__ */ jsx7(StatsTab, { engineOk }) : tab === "images" ? /* @__PURE__ */ jsx7(ImagesTab, { engineOk, showToast, askConfirm: setConfirmReq, onMutated: refreshEngine }) : tab === "events" ? /* @__PURE__ */ jsx7(EventsTab, { engineOk }) : /* @__PURE__ */ jsx7(DiagTab, { engine, engineErr, showToast, onRefresh: refreshEngine }) }),
    confirmReq && /* @__PURE__ */ jsx7(ConfirmModal, { req: confirmReq, close: () => setConfirmReq(null), showToast }),
    toast && /* @__PURE__ */ jsx7("div", { className: `dk-toast ${toast.bad ? "dk-toast-bad" : ""}`, children: toast.text })
  ] });
}
function ConfirmModal({ req, close, showToast }) {
  const [text, setText] = useState7("");
  const [busy, setBusy] = useState7(false);
  const match = text === req.expect;
  return /* @__PURE__ */ jsx7("div", { className: "dk-modal-mask", onClick: close, children: /* @__PURE__ */ jsxs7("div", { className: "dk-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsx7("strong", { children: req.title }),
    /* @__PURE__ */ jsx7("div", { className: "dk-dim dk-small", children: req.hint }),
    /* @__PURE__ */ jsx7(
      "input",
      {
        className: "dk-input dk-mono",
        value: text,
        autoFocus: true,
        placeholder: `\u8F93\u5165 ${req.expect} \u4EE5\u786E\u8BA4`,
        onChange: (e) => setText(e.target.value)
      }
    ),
    /* @__PURE__ */ jsxs7("div", { className: "dk-row", children: [
      /* @__PURE__ */ jsx7("span", { className: "dk-grow" }),
      /* @__PURE__ */ jsx7("button", { type: "button", className: "dk-btn", onClick: close, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ jsx7(
        "button",
        {
          type: "button",
          className: "dk-btn dk-btn-danger",
          disabled: !match || busy,
          onClick: async () => {
            setBusy(true);
            try {
              await req.onConfirm();
              close();
            } catch (e) {
              showToast(e.message || "\u64CD\u4F5C\u5931\u8D25", true);
            } finally {
              setBusy(false);
            }
          },
          children: busy ? "\u6267\u884C\u4E2D\u2026" : "\u786E\u8BA4\u5220\u9664"
        }
      )
    ] })
  ] }) });
}

// src/index.tsx
import { jsx as jsx8 } from "react/jsx-runtime";
function DockerDeskEntry() {
  return /* @__PURE__ */ jsx8(Panel, {});
}
export {
  DockerDeskEntry as default
};
