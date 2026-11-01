// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect4, useRef as useRef2, useState as useState4 } from "react";

// src/tabs/PackTab.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}

// src/model.ts
var PLUGIN_ID = "context-pack";
var SERVICE_ID = "context-pack-service";
var CMD_PREFIX = "cpk.cmd.";
var RESULT_PREFIX = "cpk.result.";
var SCAN_PREFIX = "cpk.scan.";
var PACK_PREFIX = "cpk.pack.";
async function getMeta() {
  return kvGet("cpk.meta");
}
async function getSettings() {
  const v = await kvGet("cpk.settings");
  return v && v.version ? v : null;
}
async function saveSettings(s) {
  await kvSet("cpk.settings", { ...s, updatedAt: Date.now() });
}
async function getScan(id) {
  return kvGet(`${SCAN_PREFIX}${id}`);
}
async function readScanTree(id, chunkCount) {
  const n = Math.max(0, Math.min(chunkCount || 0, 40));
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet(`${SCAN_PREFIX}${id}.t.${i}`))
  );
  const rows = [];
  for (const text of parts) {
    if (typeof text !== "string" || !text) continue;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr) && arr.length >= 4) rows.push(arr);
      } catch (_) {
      }
    }
  }
  return rows;
}
async function getPack(id) {
  return kvGet(`${PACK_PREFIX}${id}`);
}
async function readPackChunks(id, chunkCount) {
  const n = Math.max(0, Math.min(chunkCount || 0, 16));
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) => kvGet(`${PACK_PREFIX}${id}.c.${i}`))
  );
  if (parts.some((p) => typeof p !== "string")) return null;
  return parts.join("");
}
async function getIdx() {
  const v = await kvGet("cpk.idx");
  return v && Array.isArray(v.packs) ? v : null;
}
async function saveSelection(s) {
  await kvSet("cpk.sel", s);
}
async function loadSelection() {
  const v = await kvGet("cpk.sel");
  return v && Array.isArray(v.selected) ? v : null;
}
async function sendCommand(op, payload, timeoutMs = 15e3) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(`${CMD_PREFIX}${op}.${nonce}`, { op, nonce, ...payload, at: Date.now() });
  const resultKey = `${RESULT_PREFIX}${nonce}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await kvGet(resultKey);
    if (r) {
      void kvDel(resultKey).catch(() => {
      });
      return r;
    }
    await new Promise((res) => setTimeout(res, 1e3));
  }
  return { ok: false, error: "\u670D\u52A1\u672A\u54CD\u5E94\u547D\u4EE4\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF1A\u53BB\u8BBE\u7F6E\u9875\u770B\u670D\u52A1\u72B6\u6001\uFF09" };
}
async function listServiceStatus() {
  try {
    const arr = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
    const mine = (Array.isArray(arr) ? arr : []).find((s) => s && s.serviceId === SERVICE_ID);
    return mine || null;
  } catch (_) {
    return null;
  }
}
async function stopService() {
  await capDispatch("cap.pluginServiceManager", { action: "stop", pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
async function restartService() {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
async function startServiceBootstrapped() {
  const r = await capDispatch(
    "cap.pluginDiscovery",
    { action: "discover" }
  );
  const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID);
  if (!self) return "\u63D2\u4EF6\u672A\u88AB\u53D1\u73B0\uFF08\u91CD\u8F7D\u63D2\u4EF6\u9875\u540E\u91CD\u8BD5\uFF09";
  const svc = (self.contributes?.services || []).find((s) => s && s.id === SERVICE_ID);
  if (!svc) return "\u6E05\u5355\u4E2D\u672A\u58F0\u660E\u670D\u52A1";
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType ?? "http",
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 10,
      description: svc.description ?? null
    }
  });
  return null;
}
function currentWorkspace() {
  const w = window.__POLARIS_HOST_WORKSPACE__;
  return w || "";
}
function fmtBytes(n) {
  if (!n || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function fmtTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      window.prompt("\u8BF7\u624B\u52A8\u590D\u5236\uFF08Ctrl+C\uFF09\uFF1A", text);
      return true;
    } catch (_2) {
      return false;
    }
  }
}
function trimToBudget(files, budget) {
  const sorted = files.slice().sort((a, b) => b.tokens - a.tokens);
  const kept = new Set(files.map((f) => f.rel));
  let total = files.reduce((s, f) => s + (f.tokens || 0), 0);
  const removed = [];
  for (const f of sorted) {
    if (total <= budget) break;
    if (!f.tokens) continue;
    total -= f.tokens;
    kept.delete(f.rel);
    removed.push({ rel: f.rel, tokens: f.tokens });
  }
  return { kept: files.filter((f) => kept.has(f.rel)).map((f) => f.rel), removed, tokens: total };
}

// src/tabs/PackTab.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var PACK_POLL_MS = 1200;
var PACK_POLL_TIMEOUT = 180 * 1e3;
var CHAT_SEND_LIMIT = 2 * 1024 * 1024;
function buildTree(rows) {
  const root = { name: "", path: "", isDir: true, size: 0, tokens: 0, flags: "", children: [] };
  const dirIndex = /* @__PURE__ */ new Map([["", root]]);
  const ensureDir = (dirPath) => {
    let d = dirIndex.get(dirPath);
    if (d) return d;
    const segs = dirPath.split("/");
    const name = segs[segs.length - 1];
    const parent = ensureDir(segs.slice(0, -1).join("/"));
    d = { name, path: dirPath, isDir: true, size: 0, tokens: 0, flags: "", children: [] };
    parent.children.push(d);
    dirIndex.set(dirPath, d);
    return d;
  };
  for (const [rel, isDir, size, tokens, flags] of rows) {
    if (isDir) {
      ensureDir(rel);
      continue;
    }
    const segs = rel.split("/");
    const parent = ensureDir(segs.slice(0, -1).join("/"));
    parent.children.push({ name: segs[segs.length - 1], path: rel, isDir: false, size, tokens, flags, children: [] });
  }
  const sortNode = (n) => {
    n.children.sort((a, b) => a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1);
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}
function aggregate(root, selected) {
  const agg = /* @__PURE__ */ new Map();
  const walk = (n) => {
    if (!n.isDir) {
      const packable = !n.flags.includes("b") && !n.flags.includes("L") ? 1 : 0;
      const isSel = selected.has(n.path) ? 1 : 0;
      return { total: packable, sel: isSel, tokens: n.tokens, selTokens: isSel ? n.tokens : 0 };
    }
    let total = 0;
    let sel = 0;
    let tokens = 0;
    let selTokens = 0;
    for (const c of n.children) {
      const a = walk(c);
      total += a.total;
      sel += a.sel;
      tokens += a.tokens;
      selTokens += a.selTokens;
    }
    agg.set(n.path, { total, sel, tokens, selTokens });
    return { total, sel, tokens, selTokens };
  };
  walk(root);
  return agg;
}
function collectPackable(n, out) {
  if (!n.isDir) {
    if (!n.flags.includes("b") && !n.flags.includes("L")) out.push(n.path);
    return;
  }
  for (const c of n.children) collectPackable(c, out);
}
function PackTab({ running, showToast, onSendToChat }) {
  const [pathInput, setPathInput] = useState("");
  const [scan, setScan] = useState(null);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [expanded, setExpanded] = useState(/* @__PURE__ */ new Set([""]));
  const [filter, setFilter] = useState("");
  const [budget, setBudget] = useState(1e5);
  const [pack, setPack] = useState(null);
  const [packPreview, setPackPreview] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [sendArmed, setSendArmed] = useState(false);
  const [busy, setBusy] = useState("");
  const selSaveTimer = useRef(void 0);
  const pollTimer = useRef(void 0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(pollTimer.current);
    };
  }, []);
  useEffect(() => {
    void (async () => {
      const sel = await loadSelection();
      if (sel && sel.path) setPathInput(sel.path);
    })();
  }, []);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const agg = useMemo(() => aggregate(tree, selected), [tree, selected]);
  const rootAgg = agg.get("") || { total: 0, sel: 0, tokens: 0, selTokens: 0 };
  const packableRows = useMemo(() => rows.filter((r) => !r[1] && !String(r[4]).includes("b") && !String(r[4]).includes("L")), [rows]);
  const persistSelection = useCallback((path, sel) => {
    window.clearTimeout(selSaveTimer.current);
    selSaveTimer.current = window.setTimeout(() => {
      void saveSelection({ path, selected: [...sel].slice(0, 2e4), updatedAt: Date.now() });
    }, 800);
  }, []);
  const applyScanResult = useCallback((idx, treeRows) => {
    setRows(treeRows);
    const packable = treeRows.filter((r) => !r[1] && !String(r[4]).includes("b") && !String(r[4]).includes("L")).map((r) => r[0]);
    setSelected(new Set(packable.slice(0, 2e4)));
    setExpanded(/* @__PURE__ */ new Set([""]));
    void loadSelection().then((sel) => {
      if (!sel || sel.path !== idx.path) return;
      const valid = new Set(treeRows.filter((r) => !r[1]).map((r) => r[0]));
      const restored = sel.selected.filter((p) => valid.has(p));
      if (restored.length) setSelected(new Set(restored));
    });
  }, []);
  const doScan = useCallback(async () => {
    const p = pathInput.trim();
    if (!p) {
      showToast("\u8BF7\u8F93\u5165\u76EE\u5F55\u8DEF\u5F84", "bad");
      return;
    }
    if (!running) {
      showToast("\u670D\u52A1\u79BB\u7EBF\uFF1A\u5148\u53BB\u8BBE\u7F6E\u9875\u542F\u52A8\u670D\u52A1", "bad");
      return;
    }
    setBusy("scan");
    setScan(null);
    setRows([]);
    setSelected(/* @__PURE__ */ new Set());
    try {
      const ack = await sendCommand("scan", { path: p });
      if (!ack.ok || !ack.id) throw new Error(ack.error || "\u626B\u63CF\u547D\u4EE4\u672A\u88AB\u63A5\u53D7");
      const id = ack.id;
      const deadline = Date.now() + 120 * 1e3;
      let idx = null;
      while (Date.now() < deadline) {
        if (!mountedRef.current) return;
        await new Promise((r) => setTimeout(r, 1e3));
        idx = await getScan(id);
        if (idx && (idx.state === "done" || idx.state === "error")) break;
      }
      if (!idx) throw new Error("\u626B\u63CF\u8D85\u65F6\uFF08\u670D\u52A1\u53EF\u80FD\u79BB\u7EBF\uFF09");
      setScan(idx);
      if (idx.state === "error") throw new Error(idx.error || "\u626B\u63CF\u5931\u8D25");
      const treeRows = await readScanTree(id, idx.treeChunks || 0);
      applyScanResult(idx, treeRows);
      showToast(`\u626B\u63CF\u5B8C\u6210\uFF1A${idx.fileCount ?? 0} \u6587\u4EF6 \xB7 ~${idx.totalTokens ?? 0} tokens`, "good");
    } catch (e) {
      showToast(`\u626B\u63CF\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      if (mountedRef.current) setBusy("");
    }
  }, [pathInput, running, showToast, applyScanResult]);
  const doPack = useCallback(async () => {
    const p = pathInput.trim();
    if (!p) {
      showToast("\u8BF7\u8F93\u5165\u76EE\u5F55\u8DEF\u5F84", "bad");
      return;
    }
    if (selected.size === 0) {
      showToast("\u672A\u9009\u62E9\u4EFB\u4F55\u6587\u4EF6", "bad");
      return;
    }
    if (!running) {
      showToast("\u670D\u52A1\u79BB\u7EBF\uFF1A\u5148\u53BB\u8BBE\u7F6E\u9875\u542F\u52A8\u670D\u52A1", "bad");
      return;
    }
    setBusy("pack");
    setPack(null);
    setPackPreview("");
    try {
      const ack = await sendCommand("pack", { path: p, include: [...selected] });
      if (!ack.ok || !ack.id) throw new Error(ack.error || "\u6253\u5305\u547D\u4EE4\u672A\u88AB\u63A5\u53D7");
      const id = ack.id;
      const deadline = Date.now() + PACK_POLL_TIMEOUT;
      let idx = null;
      while (Date.now() < deadline) {
        if (!mountedRef.current) return;
        await new Promise((r) => setTimeout(r, PACK_POLL_MS));
        idx = await getPack(id);
        if (idx && (idx.state === "done" || idx.state === "error")) break;
      }
      if (!idx) throw new Error("\u6253\u5305\u8D85\u65F6");
      setPack(idx);
      setSendNote("");
      setSendArmed(false);
      if (idx.state === "error") throw new Error(idx.error || "\u6253\u5305\u5931\u8D25");
      const text = await readPackChunks(id, idx.chunks || 0);
      setPackPreview(text ? text.slice(0, 4e3) : "");
      showToast(`\u6253\u5305\u5B8C\u6210\uFF1A${idx.stats?.files ?? 0} \u6587\u4EF6 \xB7 ~${idx.stats?.tokens ?? 0} tokens`, "good");
    } catch (e) {
      showToast(`\u6253\u5305\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      if (mountedRef.current) setBusy("");
    }
  }, [pathInput, selected, running, showToast]);
  const toggleFile = (rel) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      if (scan) persistSelection(scan.path, next);
      return next;
    });
  };
  const collectUnder = (node) => {
    const out = [];
    const walk = (n) => {
      if (!n.isDir) {
        out.push(n.path);
        return;
      }
      for (const c of n.children) walk(c);
    };
    walk(node);
    return out;
  };
  const toggleDir = (node) => {
    const a = agg.get(node.path);
    const willSelect = !a || a.sel < a.total;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const rel of collectUnder(node)) {
        if (willSelect) next.add(rel);
        else next.delete(rel);
      }
      if (scan) persistSelection(scan.path, next);
      return next;
    });
  };
  const selectAll = () => {
    const out = [];
    collectPackable(tree, out);
    setSelected(new Set(out.slice(0, 2e4)));
    if (scan) persistSelection(scan.path, new Set(out.slice(0, 2e4)));
  };
  const clearAll = () => {
    setSelected(/* @__PURE__ */ new Set());
    if (scan) persistSelection(scan.path, /* @__PURE__ */ new Set());
  };
  const doTrim = () => {
    const files = packableRows.filter((r2) => selected.has(r2[0])).map((r2) => ({ rel: r2[0], tokens: r2[3] || 0 }));
    const r = trimToBudget(files, budget);
    setSelected(new Set(r.kept));
    if (scan) persistSelection(scan.path, new Set(r.kept));
    showToast(`\u5DF2\u88C1\u526A ${r.removed.length} \u4E2A\u6587\u4EF6 \u2192 ~${r.tokens} tokens`, "good");
  };
  const overBudget = rootAgg.selTokens > budget;
  const fullText = async () => {
    if (!pack || !pack.chunks) return null;
    return readPackChunks(pack.id, pack.chunks);
  };
  const onCopy = async () => {
    const text = await fullText();
    if (!text) {
      showToast("\u5185\u5BB9\u5206\u5757\u4E0D\u53EF\u8BFB\uFF08\u53EF\u80FD\u8D85\u8FC7 4MB\uFF1A\u8BF7\u76F4\u63A5\u53D6\u6587\u4EF6\uFF09", "bad");
      return;
    }
    const ok = await copyText(text);
    showToast(ok ? `\u5DF2\u590D\u5236\u5168\u6587\uFF08${fmtBytes(pack?.fileBytes)}\uFF09` : "\u590D\u5236\u5931\u8D25", ok ? "good" : "bad");
  };
  const onSendChat = async () => {
    if (!onSendToChat) {
      showToast("\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u7ED9 AI", "bad");
      return;
    }
    const text = await fullText();
    if (!text) {
      showToast("\u5185\u5BB9\u5206\u5757\u4E0D\u53EF\u8BFB\uFF08\u53EF\u80FD\u8D85\u8FC7 4MB\uFF1A\u8BF7\u76F4\u63A5\u53D6\u6587\u4EF6\uFF09", "bad");
      return;
    }
    if (text.length > CHAT_SEND_LIMIT && !sendArmed) {
      setSendArmed(true);
      showToast("\u5305\u8D85\u8FC7 2MB\uFF1A\u786E\u8BA4\u65E0\u8BEF\u8BF7\u518D\u70B9\u4E00\u6B21\u300C\u53D1\u7ED9 AI\u300D", "info");
      return;
    }
    const note = sendNote.trim();
    await onSendToChat(note ? `${note}

${text}` : text);
    setSendArmed(false);
    showToast("\u5DF2\u53D1\u9001\u5230\u5F53\u524D AI \u4F1A\u8BDD", "good");
  };
  const filteredTree = useMemo(() => {
    if (!filter.trim()) return null;
    const f = filter.trim().toLowerCase();
    const keep = (n) => {
      if (!n.isDir) return n.path.toLowerCase().includes(f) ? n : null;
      const children = n.children.map(keep).filter(Boolean);
      if (!children.length) return null;
      return { ...n, children };
    };
    return keep(tree);
  }, [tree, filter]);
  const renderRow = (n, depth) => {
    const a = n.isDir ? agg.get(n.path) : null;
    const isOpen = expanded.has(n.path);
    const state = !a ? selected.has(n.path) ? "all" : "none" : a.sel === 0 ? "none" : a.sel >= a.total ? "all" : "some";
    const box = state === "all" ? "\u2611" : state === "some" ? "\u25A3" : "\u2610";
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "1px 0",
            paddingLeft: depth * 14,
            fontSize: 12,
            lineHeight: "20px",
            color: n.isDir ? "#e4e4e7" : "#a1a1aa",
            cursor: "pointer"
          },
          children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  n.isDir ? toggleDir(n) : toggleFile(n.path);
                },
                style: { color: state === "some" ? "#93c5fd" : "#3b82f6", width: 16, textAlign: "center", flexShrink: 0 },
                children: box
              }
            ),
            n.isDir ? /* @__PURE__ */ jsxs(
              "span",
              {
                onClick: () => setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(n.path)) next.delete(n.path);
                  else next.add(n.path);
                  return next;
                }),
                style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
                children: [
                  isOpen ? "\u25BE " : "\u25B8 ",
                  n.name,
                  "/",
                  /* @__PURE__ */ jsxs("span", { style: { color: "#52525b", fontSize: 10 }, children: [
                    " ",
                    a?.total ?? 0,
                    " \u6587\u4EF6 \xB7 ~",
                    a?.tokens ?? 0,
                    " tok"
                  ] })
                ]
              }
            ) : /* @__PURE__ */ jsxs("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: n.path, children: [
              n.name,
              /* @__PURE__ */ jsxs("span", { style: { color: "#52525b", fontSize: 10 }, children: [
                " ",
                "~",
                n.tokens,
                " tok \xB7 ",
                fmtBytes(n.size),
                n.flags.includes("b") ? " \xB7 \u4E8C\u8FDB\u5236" : "",
                n.flags.includes("L") ? " \xB7 \u8D85\u4E0A\u9650" : ""
              ] })
            ] })
          ]
        }
      ),
      n.isDir && isOpen && n.children.map((c) => renderRow(c, depth + 1))
    ] }, n.path);
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: pathInput,
          onChange: (e) => setPathInput(e.target.value),
          placeholder: "\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\space\\base\\Polaris",
          style: {
            flex: 1,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #3f3f46",
            background: "#18181b",
            color: "#e4e4e7",
            fontSize: 12,
            minWidth: 0
          }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            const w = currentWorkspace();
            if (w) setPathInput(w);
            else showToast("\u5BBF\u4E3B\u672A\u63D0\u4F9B\u5F53\u524D\u5DE5\u4F5C\u533A\u8DEF\u5F84", "bad");
          },
          style: { ...btnStyle },
          children: "\u5DE5\u4F5C\u533A"
        }
      ),
      /* @__PURE__ */ jsx("button", { onClick: () => void doScan(), disabled: busy !== "", style: { ...btnStyle, opacity: busy ? 0.5 : 1 }, children: busy === "scan" ? "\u626B\u63CF\u4E2D\u2026" : "\u626B\u63CF" })
    ] }),
    scan && scan.state === "done" && /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#a1a1aa", display: "flex", gap: 10, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "\u2705 ",
        scan.path
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        scan.fileCount,
        " \u6587\u4EF6 / ",
        scan.dirCount,
        " \u76EE\u5F55"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        "~",
        scan.totalTokens,
        " tokens \xB7 ",
        fmtBytes(scan.totalBytes)
      ] }),
      !!scan.ignoreCount && /* @__PURE__ */ jsxs("span", { style: { color: "#52525b" }, children: [
        "\u5FFD\u7565 ",
        scan.ignoreCount,
        " \u9879"
      ] }),
      scan.truncated && /* @__PURE__ */ jsx("span", { style: { color: "#d29922" }, children: "\u26A0 \u8D85 20000 \u6587\u4EF6\u4E0A\u9650\uFF0C\u7ED3\u679C\u4E0D\u5B8C\u6574" })
    ] }),
    rows.length > 0 && /* @__PURE__ */ jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #3f3f46",
      background: "#18181b"
    }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: "#a1a1aa" }, children: [
        "\u5DF2\u9009 ",
        rootAgg.sel,
        "/",
        rootAgg.total,
        " \u6587\u4EF6 \xB7 ~",
        rootAgg.selTokens,
        " tok"
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, minWidth: 120, height: 8, borderRadius: 4, background: "#27272a", overflow: "hidden" }, children: /* @__PURE__ */ jsx("div", { style: {
        width: `${Math.min(100, rootAgg.selTokens / Math.max(1, budget) * 100)}%`,
        height: "100%",
        background: overBudget ? "#f85149" : "#3b82f6",
        transition: "width .2s"
      } }) }),
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 11, color: overBudget ? "#f85149" : "#a1a1aa" }, children: [
        "\u9884\u7B97 ",
        budget
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          value: budget,
          onChange: (e) => setBudget(Math.max(1e3, parseInt(e.target.value, 10) || 1e5)),
          style: { width: 84, padding: "3px 6px", borderRadius: 6, border: "1px solid #3f3f46", background: "#09090b", color: "#e4e4e7", fontSize: 11 }
        }
      ),
      [32e3, 64e3, 128e3, 2e5].map((b) => /* @__PURE__ */ jsx("button", { onClick: () => setBudget(b), style: { ...btnStyle, padding: "3px 8px", fontSize: 10 }, children: b >= 1e3 ? `${b / 1e3}k` : b }, b)),
      /* @__PURE__ */ jsx("button", { onClick: doTrim, disabled: !overBudget, style: { ...btnStyle, padding: "3px 10px", fontSize: 10, opacity: overBudget ? 1 : 0.4 }, children: "\u88C1\u526A\u5230\u9884\u7B97" }),
      /* @__PURE__ */ jsx("button", { onClick: selectAll, style: { ...btnStyle, padding: "3px 10px", fontSize: 10 }, children: "\u5168\u9009" }),
      /* @__PURE__ */ jsx("button", { onClick: clearAll, style: { ...btnStyle, padding: "3px 10px", fontSize: 10 }, children: "\u6E05\u7A7A" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => void doPack(),
          disabled: busy !== "" || selected.size === 0,
          style: {
            padding: "4px 14px",
            borderRadius: 6,
            border: "none",
            fontSize: 11,
            cursor: "pointer",
            background: busy === "pack" ? "#1d4ed8" : "#3b82f6",
            color: "#fff",
            opacity: busy || selected.size === 0 ? 0.6 : 1
          },
          children: busy === "pack" ? "\u6253\u5305\u4E2D\u2026" : `\u6253\u5305 ${selected.size} \u6587\u4EF6`
        }
      )
    ] }),
    rows.length > 0 && /* @__PURE__ */ jsx(
      "input",
      {
        value: filter,
        onChange: (e) => setFilter(e.target.value),
        placeholder: "\u8FC7\u6EE4\u6587\u4EF6\u8DEF\u5F84\uFF08\u5B50\u4E32\u5339\u914D\uFF1B\u6E05\u7A7A\u6062\u590D\u6811\uFF09",
        style: {
          padding: "5px 10px",
          borderRadius: 6,
          border: "1px solid #3f3f46",
          background: "#18181b",
          color: "#e4e4e7",
          fontSize: 11
        }
      }
    ),
    rows.length > 0 && /* @__PURE__ */ jsxs("div", { style: {
      flex: 1,
      minHeight: 160,
      maxHeight: 380,
      overflow: "auto",
      borderRadius: 8,
      border: "1px solid #27272a",
      background: "#0c0c0e",
      padding: "6px 8px"
    }, children: [
      (filteredTree ? [filteredTree] : tree.children).map((c) => renderRow(c, 0)),
      filteredTree && /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#52525b", padding: "4px 0" }, children: "\u8FC7\u6EE4\u6A21\u5F0F\uFF1A\u4EC5\u663E\u793A\u5339\u914D\u9879\uFF08\u542B\u5176\u6240\u5728\u94FE\u8DEF\uFF09" })
    ] }),
    pack && pack.state === "done" && /* @__PURE__ */ jsxs("div", { style: { padding: 10, borderRadius: 8, border: "1px solid rgba(63,185,80,.4)", background: "rgba(63,185,80,.06)" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "#a7f3d0", display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsx("b", { children: "\u{1F4E6} \u5305\u5DF2\u751F\u6210" }),
        /* @__PURE__ */ jsxs("span", { children: [
          pack.stats?.files,
          " \u6587\u4EF6 \xB7 ~",
          pack.stats?.tokens,
          " tokens \xB7 ",
          fmtBytes(pack.fileBytes)
        ] }),
        pack.chunkTruncated && /* @__PURE__ */ jsx("span", { style: { color: "#d29922" }, children: "\u26A0 \u8D85\u8FC7 4MB\uFF0C\u9884\u89C8/\u590D\u5236\u4E0D\u53EF\u7528\uFF0C\u8BF7\u76F4\u63A5\u53D6\u6587\u4EF6" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#52525b", marginBottom: 6, wordBreak: "break-all" }, children: [
        "\u6587\u4EF6\uFF1A",
        pack.file
      ] }),
      !!pack.truncatedFiles?.length && /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#d29922", marginBottom: 6 }, children: [
        pack.truncatedFiles.length,
        " \u4E2A\u6587\u4EF6\u672A\u5B8C\u6574\u7EB3\u5165\uFF08\u4E8C\u8FDB\u5236/\u8D85\u4E0A\u9650/\u8BFB\u53D6\u5931\u8D25\uFF09"
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: sendNote,
            onChange: (e) => setSendNote(e.target.value),
            placeholder: "\u53D1\u7ED9 AI \u65F6\u9644\u4E00\u53E5\u4EFB\u52A1\uFF08\u53EF\u9009\uFF0C\u62FC\u5728\u5305\u524D\uFF09",
            style: {
              flex: 1,
              minWidth: 140,
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid #3f3f46",
              background: "#09090b",
              color: "#e4e4e7",
              fontSize: 11
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { onClick: () => void onCopy(), style: { ...btnStyle }, children: "\u590D\u5236\u5168\u6587" }),
        onSendToChat && /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => void onSendChat(),
            style: { ...btnPrimary, background: sendArmed ? "#f85149" : "#3b82f6" },
            children: sendArmed ? "\u786E\u8BA4\u53D1\u9001\uFF08\u8D85 2MB\uFF09" : "\u53D1\u7ED9 AI"
          }
        )
      ] }),
      packPreview && /* @__PURE__ */ jsxs("pre", { style: {
        margin: 0,
        padding: 8,
        borderRadius: 6,
        background: "#09090b",
        border: "1px solid #27272a",
        fontSize: 10,
        color: "#71717a",
        maxHeight: 160,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all"
      }, children: [
        packPreview,
        "\u2026"
      ] })
    ] }),
    !rows.length && !busy && /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "#71717a", padding: "12px 4px", lineHeight: 1.8 }, children: [
      "\u2460 \u8F93\u5165\u76EE\u5F55\uFF08\u6216\u70B9\u300C\u5DE5\u4F5C\u533A\u300D\uFF09\u2192 \u626B\u63CF",
      /* @__PURE__ */ jsx("br", {}),
      "\u2461 \u6811\u4E2D\u52FE\u9009\u8981\u5E26\u7ED9 LLM \u7684\u6587\u4EF6\uFF08\u4E8C\u8FDB\u5236/\u8D85\u9650\u6587\u4EF6\u81EA\u52A8\u6392\u9664\uFF09",
      /* @__PURE__ */ jsx("br", {}),
      "\u2462 \u770B\u9884\u7B97\u6761\u63A7\u5236 token \u91CF\uFF08\u53EF\u4E00\u952E\u88C1\u526A\uFF09\u2192 \u6253\u5305",
      /* @__PURE__ */ jsx("br", {}),
      "\u2463 \u590D\u5236\u5168\u6587 / \u53D1\u7ED9 AI\uFF08\u9644\u4E00\u53E5\u4EFB\u52A1\u4E00\u8D77\u53D1\uFF09/ \u53D6\u5305\u6587\u4EF6"
    ] })
  ] });
}
var btnStyle = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#27272a",
  color: "#d4d4d8",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap"
};
var btnPrimary = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "#3b82f6",
  color: "#fff",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

// src/tabs/HistoryTab.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function HistoryTab({ showToast, onGoTab }) {
  const [packs, setPacks] = useState2(null);
  const reload = useCallback2(async () => {
    const idx = await getIdx();
    setPacks(idx ? idx.packs : []);
  }, []);
  useEffect2(() => {
    void reload();
    const t = setInterval(() => {
      void reload();
    }, 5e3);
    return () => clearInterval(t);
  }, [reload]);
  const onCleanup = async () => {
    const r = await sendCommand("cleanup", {}, 2e4);
    if (r.ok) {
      showToast(`\u5DF2\u6E05\u7406\uFF1A\u626B\u63CF ${r.removed?.scans ?? 0} \xB7 \u5305 ${r.removed?.packs ?? 0} \xB7 \u6587\u4EF6 ${r.removed?.files ?? 0}`, "good");
      void reload();
    } else {
      showToast(r.error || "\u6E05\u7406\u5931\u8D25", "bad");
    }
  };
  return /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx2("span", { style: { fontSize: 12, color: "#a1a1aa" }, children: "\u6700\u8FD1\u6253\u5305\uFF08\u542B AI \u7ECF MCP \u53D1\u8D77\u7684\uFF1B\u6700\u591A\u4FDD\u7559 10 \u6761\uFF09" }),
      /* @__PURE__ */ jsx2("button", { onClick: () => void onCleanup(), style: {
        marginLeft: "auto",
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid #3f3f46",
        background: "#27272a",
        color: "#d4d4d8",
        fontSize: 11,
        cursor: "pointer"
      }, children: "\u6E05\u7406\u65E7\u5305" })
    ] }),
    packs === null && /* @__PURE__ */ jsx2("div", { style: { fontSize: 12, color: "#71717a" }, children: "\u8BFB\u53D6\u4E2D\u2026" }),
    packs && packs.length === 0 && /* @__PURE__ */ jsxs2("div", { style: { fontSize: 12, color: "#71717a", lineHeight: 1.8 }, children: [
      "\u8FD8\u6CA1\u6709\u6253\u5305\u8BB0\u5F55\u3002\u53BB ",
      /* @__PURE__ */ jsx2("span", { onClick: () => onGoTab("pack"), style: { color: "#93c5fd", cursor: "pointer" }, children: "\u6253\u5305" }),
      " \u9875\u751F\u6210\u7B2C\u4E00\u4E2A\u4E0A\u4E0B\u6587\u5305\u3002"
    ] }),
    packs && packs.map((p) => /* @__PURE__ */ jsxs2("div", { style: {
      padding: 10,
      borderRadius: 8,
      border: "1px solid #27272a",
      background: "#131316",
      display: "flex",
      flexDirection: "column",
      gap: 4
    }, children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx2("span", { style: {
          fontSize: 10,
          padding: "1px 8px",
          borderRadius: 8,
          background: p.state === "done" ? "rgba(63,185,80,.15)" : p.state === "error" ? "rgba(248,81,73,.15)" : "rgba(59,130,246,.15)",
          color: p.state === "done" ? "#3fb950" : p.state === "error" ? "#f85149" : "#93c5fd"
        }, children: p.state === "done" ? "\u5B8C\u6210" : p.state === "error" ? "\u5931\u8D25" : "\u8FDB\u884C\u4E2D" }),
        /* @__PURE__ */ jsx2("span", { style: { fontSize: 10, padding: "1px 8px", borderRadius: 8, background: "rgba(59,130,246,.12)", color: "#93c5fd" }, children: p.origin === "mcp" ? "AI \u53D1\u8D77" : "\u9762\u677F" }),
        /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 120 }, title: p.path, children: p.path }),
        /* @__PURE__ */ jsx2("span", { style: { fontSize: 10, color: "#71717a" }, children: fmtTime(p.finishedAt || p.startedAt) })
      ] }),
      p.state === "done" && /* @__PURE__ */ jsxs2("div", { style: { fontSize: 10, color: "#71717a", display: "flex", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs2("span", { children: [
          p.files,
          " \u6587\u4EF6 \xB7 ~",
          p.tokens,
          " tokens \xB7 ",
          fmtBytes(p.fileBytes)
        ] }),
        /* @__PURE__ */ jsx2("span", { style: { wordBreak: "break-all" }, children: p.file })
      ] }),
      p.state === "error" && /* @__PURE__ */ jsx2("div", { style: { fontSize: 10, color: "#f85149" }, children: p.error || "\u5931\u8D25" })
    ] }, p.id))
  ] });
}

// src/tabs/SettingsTab.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SettingsTab({ meta, settings, running, showToast }) {
  const [form, setForm] = useState3({
    version: 1,
    ignoreExtra: "",
    includeLockfiles: false,
    maxFileKb: 512,
    format: "xml",
    headerText: ""
  });
  const [svc, setSvc] = useState3(null);
  const [svcBusy, setSvcBusy] = useState3(false);
  const [dirty, setDirty] = useState3(false);
  useEffect3(() => {
    if (settings) setForm({ ...form, ...settings });
  }, [settings]);
  useEffect3(() => {
    void listServiceStatus().then(setSvc);
  }, [running]);
  const save = async () => {
    try {
      await saveSettings(form);
      setDirty(false);
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1 3s \u5185\u70ED\u66F4\uFF09", "good");
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, "bad");
    }
  };
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const svcAction = async (kind) => {
    setSvcBusy(true);
    try {
      if (kind === "start") {
        const err = await startServiceBootstrapped();
        if (err) showToast(err, "bad");
        else showToast("\u670D\u52A1\u542F\u52A8\u4E2D\u2026", "good");
      } else if (kind === "stop") {
        await stopService();
        showToast("\u5DF2\u505C\u6B62", "good");
      } else {
        await restartService();
        showToast("\u91CD\u542F\u4E2D\u2026", "good");
      }
    } catch (e) {
      showToast(`${kind} \u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setTimeout(async () => {
        setSvc(await listServiceStatus());
        setSvcBusy(false);
      }, 1500);
    }
  };
  return /* @__PURE__ */ jsxs3("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ jsxs3("section", { style: cardStyle, children: [
      /* @__PURE__ */ jsx3("div", { style: sectionTitle, children: "\u540E\u53F0\u670D\u52A1" }),
      /* @__PURE__ */ jsxs3("div", { style: { fontSize: 11, color: "#a1a1aa", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx3("span", { style: {
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 8,
          background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
          color: running ? "#3fb950" : "#f85149"
        }, children: running ? "\u8FD0\u884C\u4E2D" : "\u79BB\u7EBF" }),
        svc?.status && /* @__PURE__ */ jsxs3("span", { children: [
          "\u72B6\u6001: ",
          svc.status
        ] }),
        meta?.dataDir && /* @__PURE__ */ jsxs3("span", { style: { wordBreak: "break-all" }, children: [
          "\u4EA7\u7269\u76EE\u5F55: ",
          meta.dataDir
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: [
        /* @__PURE__ */ jsx3("button", { onClick: () => void svcAction("start"), disabled: svcBusy || running, style: { ...btn, opacity: svcBusy || running ? 0.4 : 1 }, children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx3("button", { onClick: () => void svcAction("restart"), disabled: svcBusy, style: btn, children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx3("button", { onClick: () => void svcAction("stop"), disabled: svcBusy || !running, style: { ...btn, opacity: svcBusy || !running ? 0.4 : 1 }, children: "\u505C\u6B62" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("section", { style: cardStyle, children: [
      /* @__PURE__ */ jsx3("div", { style: sectionTitle, children: "\u6253\u5305\u8BBE\u7F6E" }),
      /* @__PURE__ */ jsxs3("label", { style: rowStyle, children: [
        /* @__PURE__ */ jsx3("span", { style: labelStyle, children: "\u5305\u683C\u5F0F" }),
        /* @__PURE__ */ jsxs3(
          "select",
          {
            value: form.format,
            onChange: (e) => set("format", e.target.value === "md" ? "md" : "xml"),
            style: inputStyle,
            children: [
              /* @__PURE__ */ jsx3("option", { value: "xml", children: "XML\uFF08<file path> \u5305\u88F9\uFF0C\u63A8\u8350\uFF09" }),
              /* @__PURE__ */ jsx3("option", { value: "md", children: "Markdown\uFF08\u4EE3\u7801\u56F4\u680F\uFF09" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("label", { style: rowStyle, children: [
        /* @__PURE__ */ jsx3("span", { style: labelStyle, children: "\u5355\u6587\u4EF6\u4E0A\u9650 (KB)" }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            type: "number",
            value: form.maxFileKb,
            min: 16,
            max: 4096,
            onChange: (e) => set("maxFileKb", Math.max(16, Math.min(4096, parseInt(e.target.value, 10) || 512))),
            style: { ...inputStyle, width: 100 }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("label", { style: { ...rowStyle, cursor: "pointer" }, children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: form.includeLockfiles, onChange: (e) => set("includeLockfiles", e.target.checked) }),
        /* @__PURE__ */ jsx3("span", { style: labelStyle, children: "\u5305\u542B\u9501\u6587\u4EF6\uFF08package-lock.json / Cargo.lock \u7B49\uFF0C\u9ED8\u8BA4\u6392\u9664\uFF09" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: rowStyle, children: [
        /* @__PURE__ */ jsx3("span", { style: { ...labelStyle, alignSelf: "flex-start" }, children: "\u8FFD\u52A0\u5FFD\u7565\u89C4\u5219" }),
        /* @__PURE__ */ jsx3(
          "textarea",
          {
            value: form.ignoreExtra,
            onChange: (e) => set("ignoreExtra", e.target.value),
            placeholder: "\u6BCF\u884C\u4E00\u6761\uFF0C.gitignore \u8BED\u6CD5\uFF1B\u5982\uFF1A\n*.snap\nfixtures/\npackages/foo/dist",
            rows: 4,
            style: { ...inputStyle, flex: 1, resize: "vertical" }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: rowStyle, children: [
        /* @__PURE__ */ jsx3("span", { style: { ...labelStyle, alignSelf: "flex-start" }, children: "\u5305\u5934\u8BF4\u660E" }),
        /* @__PURE__ */ jsx3(
          "textarea",
          {
            value: form.headerText,
            onChange: (e) => set("headerText", e.target.value),
            placeholder: "\u81EA\u5B9A\u4E49\u5305\u5934\u6587\u5B57\uFF08\u5982\u4EFB\u52A1\u80CC\u666F\uFF09\uFF0C\u66FF\u6362\u9ED8\u8BA4\u8BF4\u660E\uFF1B\u7559\u7A7A\u7528\u9ED8\u8BA4",
            rows: 2,
            style: { ...inputStyle, flex: 1, resize: "vertical" }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
        /* @__PURE__ */ jsxs3(
          "button",
          {
            onClick: () => void save(),
            style: {
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              background: dirty ? "#3b82f6" : "#27272a",
              color: dirty ? "#fff" : "#a1a1aa",
              fontSize: 12,
              cursor: "pointer"
            },
            children: [
              "\u4FDD\u5B58\u8BBE\u7F6E",
              dirty ? " *" : ""
            ]
          }
        ),
        /* @__PURE__ */ jsx3("span", { style: { fontSize: 10, color: "#52525b" }, children: "\u5185\u7F6E\u6052\u5FFD\u7565\uFF1A.git\u3001node_modules\uFF1B\u5176\u4F59\u9ED8\u8BA4\u5FFD\u7565 dist/build/target \u7B49" })
      ] })
    ] })
  ] });
}
var cardStyle = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #27272a",
  background: "#131316",
  display: "flex",
  flexDirection: "column",
  gap: 8
};
var sectionTitle = { fontSize: 12, fontWeight: 600, color: "#e4e4e7" };
var rowStyle = { display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#a1a1aa" };
var labelStyle = { width: 130, flexShrink: 0 };
var inputStyle = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#09090b",
  color: "#e4e4e7",
  fontSize: 11,
  minWidth: 0
};
var btn = {
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "#27272a",
  color: "#d4d4d8",
  fontSize: 11,
  cursor: "pointer"
};

// src/Panel.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var META_FRESH_MS = 90 * 1e3;
var POLL_MS = 2500;
var TABS = [
  { id: "pack", label: "\u6253\u5305" },
  { id: "history", label: "\u5305\u5386\u53F2" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function Panel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState4("pack");
  const [meta, setMeta] = useState4(null);
  const [settings, setSettings] = useState4(null);
  const [loaded, setLoaded] = useState4(false);
  const [toast, setToast] = useState4(null);
  const toastTimer = useRef2(void 0);
  const showToast = useCallback3((msg, kind = "info") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect4(() => {
    let alive = true;
    const reload = async () => {
      try {
        const [m, s] = await Promise.all([getMeta(), getSettings()]);
        if (!alive) return;
        setMeta(m);
        setSettings(s);
      } catch (_) {
      }
      if (alive) setLoaded(true);
    };
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const running = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < META_FRESH_MS);
  return /* @__PURE__ */ jsxs4("div", { style: { padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10, color: "#d4d4d8" }, children: [
    /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx4("span", { style: { fontSize: 15, fontWeight: 700, color: "#f4f4f5" }, children: "\u{1F4E6} \u4E0A\u4E0B\u6587\u6253\u5305\u53F0" }),
      /* @__PURE__ */ jsx4("span", { style: {
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 8,
        background: running ? "rgba(63,185,80,.15)" : "rgba(248,81,73,.15)",
        color: running ? "#3fb950" : "#f85149"
      }, children: running ? "\u670D\u52A1\u8FD0\u884C\u4E2D" : "\u670D\u52A1\u79BB\u7EBF" }),
      running && meta?.degraded && /* @__PURE__ */ jsx4("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(210,153,34,.15)", color: "#d29922" }, children: "kv \u964D\u7EA7" }),
      /* @__PURE__ */ jsx4("span", { style: { fontSize: 10, color: "#52525b" }, children: "\u76EE\u5F55 \u2192 LLM \u4E0A\u4E0B\u6587\u5305 \xB7 \u5168\u7A0B\u672C\u673A" })
    ] }),
    /* @__PURE__ */ jsx4("div", { style: { display: "flex", gap: 4, overflowX: "auto" }, children: TABS.map((t) => /* @__PURE__ */ jsx4(
      "button",
      {
        onClick: () => setTab(t.id),
        style: {
          padding: "6px 14px",
          fontSize: 12,
          borderRadius: 8,
          cursor: "pointer",
          border: "1px solid",
          minHeight: 32,
          whiteSpace: "nowrap",
          borderColor: tab === t.id ? "#3b82f6" : "#3f3f46",
          background: tab === t.id ? "rgba(59,130,246,.15)" : "transparent",
          color: tab === t.id ? "#93c5fd" : "#a1a1aa"
        },
        children: t.label
      },
      t.id
    )) }),
    /* @__PURE__ */ jsxs4("div", { style: { flex: 1, minHeight: 0, overflowY: "auto" }, children: [
      !loaded && /* @__PURE__ */ jsx4("div", { style: { color: "#71717a", fontSize: 12 }, children: "\u8BFB\u53D6\u6570\u636E\u4E2D\u2026" }),
      loaded && !running && /* @__PURE__ */ jsxs4("div", { style: {
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(248,81,73,.35)",
        background: "rgba(248,81,73,.08)",
        fontSize: 12,
        color: "#fca5a5",
        marginBottom: 8
      }, children: [
        "\u540E\u53F0\u670D\u52A1\u672A\u8FD0\u884C\uFF1A\u626B\u63CF/\u6253\u5305\u4E0D\u53EF\u7528\u3002\u53BB ",
        /* @__PURE__ */ jsx4("b", { children: "\u8BBE\u7F6E" }),
        " \u9875\u542F\u52A8\u670D\u52A1\uFF08\u6216\u68C0\u67E5\u7AEF\u53E3 ",
        9872,
        " \u662F\u5426\u88AB\u5360\u7528\uFF09\u3002"
      ] }),
      tab === "pack" && /* @__PURE__ */ jsx4(PackTab, { running, showToast, onSendToChat }),
      tab === "history" && /* @__PURE__ */ jsx4(HistoryTab, { showToast, onGoTab: setTab }),
      tab === "settings" && /* @__PURE__ */ jsx4(SettingsTab, { meta, settings, running, showToast })
    ] }),
    toast && /* @__PURE__ */ jsx4("div", { style: {
      position: "fixed",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      borderRadius: 8,
      fontSize: 12,
      maxWidth: "80%",
      background: toast.kind === "good" ? "rgba(63,185,80,.92)" : toast.kind === "bad" ? "rgba(248,81,73,.92)" : "rgba(59,130,246,.92)",
      color: "#fff",
      zIndex: 50
    }, children: toast.msg }),
    /* @__PURE__ */ jsx4("div", { style: { fontSize: 10, color: "#52525b" }, children: "\u53EA\u8BFB\u626B\u63CF\u6307\u5B9A\u76EE\u5F55\uFF1B\u5305\u6587\u4EF6\u843D\u672C\u673A polaris-context/bundles/\uFF0C\u65E0\u5916\u53D1\u8DEF\u5F84\u3002token \u6570\u4E3A\u542F\u53D1\u5F0F\u4F30\u7B97\u3002" })
  ] });
}

// src/index.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function ContextPackEntry(props) {
  return /* @__PURE__ */ jsx5(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  ContextPackEntry as default
};
