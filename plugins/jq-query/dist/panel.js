// src/Panel.tsx
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
var KEY_META = "jq-query.meta";
var KEY_HISTORY = "jq-query.history";
var KEY_LAST = "jq-query.last";
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
async function loadHistory() {
  try {
    const raw = await kvGet(KEY_HISTORY);
    if (Array.isArray(raw)) {
      return raw.filter((x) => Boolean(x) && typeof x.q === "string").slice(0, 50);
    }
  } catch (_) {
  }
  return [];
}
async function saveHistory(items) {
  try {
    await kvSet(KEY_HISTORY, items.slice(0, 50));
  } catch (_) {
  }
}
async function loadLast() {
  try {
    const raw = await kvGet(KEY_LAST);
    if (raw && typeof raw === "object") return raw;
  } catch (_) {
  }
  return null;
}
async function saveLast(s) {
  try {
    await kvSet(KEY_LAST, s);
  } catch (_) {
  }
}
async function svcPost(meta, api, body) {
  const r = await fetch(`http://127.0.0.1:${meta.port}${api}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-jq-query-token": meta.token },
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
function apiHealth(meta) {
  return svcPost(meta, "/__health", {});
}
function apiQuery(meta, body) {
  return svcPost(meta, "/api/query", body);
}
function apiCheck(meta, query) {
  return svcPost(meta, "/api/check", { query });
}
function apiOutline(meta, body) {
  return svcPost(meta, "/api/outline", body);
}
function apiReference(meta, keyword) {
  return svcPost(meta, "/api/reference", { keyword });
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
.qq-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qq-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qq-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qq-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5B9DFF,#2D5FD8);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;color:#fff;font-family:Consolas,Menlo,monospace}
.qq-tt{flex:1;min-width:0}
.qq-tt b{font-size:15px;display:block}
.qq-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qq-dot{width:8px;height:8px;border-radius:50%;background:#4a5160;flex-shrink:0}
.qq-dot.on{background:#3ECFB2;box-shadow:0 0 6px rgba(62,207,178,.6)}
.qq-dot.err{background:#E5484D}
.qq-tabs{display:flex;gap:4px;padding:0 16px 6px}
.qq-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.qq-tab:hover{color:#E6EAF2}
.qq-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qq-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qq-body::-webkit-scrollbar{width:9px;height:9px}
.qq-body::-webkit-scrollbar-track{background:transparent}
.qq-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qq-sec{display:flex;align-items:center;gap:8px;padding:8px 16px 4px;font-size:12.5px;font-weight:700}
.qq-sec .act{margin-left:auto;display:flex;gap:6px}
.qq-lbl{font-size:11px;color:#8B95A7;min-width:40px}
.qq-inp,.qq-sel,.qq-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.qq-inp:focus,.qq-txa:focus,.qq-sel:focus{border-color:#5B9DFF}
.qq-inp{flex:1;min-width:80px}
.qq-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:12px}
.qq-btn{background:linear-gradient(135deg,#4C8DFF,#2D5FD8);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.qq-btn:hover{filter:brightness(1.1)}
.qq-btn:disabled{opacity:.5;cursor:default}
.qq-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.qq-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.qq-btn.warn{background:linear-gradient(135deg,#E5A048,#C77E2C)}
.qq-chip{background:#0E1219;border:1px solid #232A38;color:#8B95A7;font-size:11px;font-family:Consolas,Menlo,monospace;padding:3px 8px;border-radius:7px;cursor:pointer;user-select:none}
.qq-chip.on{border-color:#5B9DFF;color:#9EC1FF;background:rgba(91,157,255,.08)}
.qq-chip:hover{color:#E6EAF2}
.qq-meta{color:#8B95A7;font-size:11px;margin:4px 16px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.qq-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace}
.qq-ok{background:rgba(62,207,178,.1);border:1px solid rgba(62,207,178,.35);color:#7BDCC4;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all}
.qq-pre{background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:9px 11px;font-family:Consolas,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;margin:4px 0}
.qq-out{margin:6px 16px}
.qq-out-item{margin:6px 0}
.qq-out-head{display:flex;align-items:center;gap:6px;margin:2px 0}
.qq-out-head .idx{color:#5B7AAB;font-size:10.5px;font-family:Consolas,Menlo,monospace}
.qq-flags{display:flex;gap:5px;flex-wrap:wrap;padding:4px 16px}
.qq-args{margin:4px 16px;padding:8px 10px;background:#12161F;border:1px solid #232A38;border-radius:9px}
.qq-argrow{display:flex;gap:6px;align-items:center;margin:4px 0}
.qq-ref{margin:6px 16px}
.qq-ref-item{background:#12161F;border:1px solid #232A38;border-radius:10px;padding:8px 11px;margin:6px 0}
.qq-ref-sig{font-family:Consolas,Menlo,monospace;color:#9EC1FF;font-size:12px;cursor:pointer}
.qq-ref-sig:hover{text-decoration:underline}
.qq-ref-desc{font-size:12px;color:#C7CFDE;margin-top:2px}
.qq-ref-ex{font-family:Consolas,Menlo,monospace;font-size:11px;color:#7A8499;margin-top:3px;cursor:pointer}
.qq-ref-ex:hover{color:#9EC1FF}
.qq-ref-cat{display:inline-block;background:#1C2330;color:#8B95A7;border-radius:6px;font-size:10px;padding:1px 7px;margin-right:6px;vertical-align:1px}
.qq-st-pass{color:#3ECFB2}
.qq-st-fail{color:#F2A0A3}
.qq-hist{position:relative}
.qq-hist-list{position:absolute;top:100%;left:0;right:0;z-index:30;background:#161B26;border:1px solid #2C3547;border-radius:10px;margin-top:4px;max-height:260px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.qq-hist-item{padding:7px 11px;font-family:Consolas,Menlo,monospace;font-size:11.5px;color:#C7CFDE;cursor:pointer;border-bottom:1px solid #1E2530;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qq-hist-item:hover{background:#1C2330;color:#E6EAF2}
.qq-hist-item .t{color:#5B7AAB;font-size:10px;margin-right:6px}
.qq-empty{color:#5B6478;font-size:12px;text-align:center;padding:20px 16px}
.qq-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:qq-spin .8s linear infinite;vertical-align:-2px}
@keyframes qq-spin{to{transform:rotate(360deg)}}
.qq-file{margin:4px 16px;display:flex;gap:6px;align-items:center}
.qq-file .hint{color:#5B6478;font-size:11px}
`;
var FLAG_DEFS = [
  { f: "-r", title: "\u5B57\u7B26\u4E32\u7ED3\u679C\u53BB\u5F15\u53F7\u539F\u6837\u8F93\u51FA" },
  { f: "-c", title: "\u7D27\u51D1\u5355\u884C\u8F93\u51FA" },
  { f: "-s", title: "\u6574\u4E2A\u8F93\u5165\u8BFB\u6210\u4E00\u4E2A\u6570\u7EC4\uFF08NDJSON \u6C47\u603B\uFF09" },
  { f: "-n", title: "\u4E0D\u8BFB\u8F93\u5165\uFF0C\u7528 null \u8D77\u5934\uFF08\u9020\u6570\u636E\uFF09" },
  { f: "-R", title: "\u6BCF\u884C\u8F93\u5165\u4F5C\u4E3A\u5B57\u7B26\u4E32\uFF08\u65E5\u5FD7\u6587\u672C\uFF09" },
  { f: "-S", title: "\u8F93\u51FA\u6309\u952E\u6392\u5E8F" }
];
var SAMPLES = [
  {
    name: "\u7528\u6237\u6570\u7EC4\uFF08select/map/group_by\uFF09",
    data: JSON.stringify({
      users: [
        { name: "alice", age: 31, city: "\u5317\u4EAC", tags: ["admin", "dev"], active: true },
        { name: "bob", age: 24, city: "\u4E0A\u6D77", tags: ["dev"], active: false },
        { name: "carol", age: 37, city: "\u5317\u4EAC", tags: ["ops", "dev"], active: true },
        { name: "dave", age: 29, city: "\u6DF1\u5733", tags: [], active: true }
      ]
    }, null, 2)
  },
  {
    name: "\u8BBF\u95EE\u65E5\u5FD7 NDJSON\uFF08\u591A\u6587\u6863\u6D41\uFF09",
    data: [
      '{"ts":"2026-11-06T10:00:01Z","level":"info","path":"/api/users","ms":12,"status":200}',
      '{"ts":"2026-11-06T10:00:04Z","level":"warn","path":"/api/orders","ms":830,"status":502}',
      '{"ts":"2026-11-06T10:00:07Z","level":"info","path":"/api/users","ms":9,"status":200}',
      '{"ts":"2026-11-06T10:00:11Z","level":"error","path":"/api/pay","ms":1204,"status":500}',
      '{"ts":"2026-11-06T10:00:15Z","level":"info","path":"/api/health","ms":2,"status":200}'
    ].join("\n")
  },
  {
    name: "\u6DF1\u5C42\u5D4C\u5957\u914D\u7F6E\uFF08paths/getpath\uFF09",
    data: JSON.stringify({
      server: { host: "127.0.0.1", ports: [9827, 9829], tls: { enabled: false, cert: null } },
      features: { cache: { ttl: 300, enabled: true }, beta: ["a", "b"] }
    }, null, 2)
  }
];
function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1048576).toFixed(2)}MB`;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function renderOutputValue(v, rawMode) {
  if (rawMode && typeof v === "string") return v;
  if (v === void 0) return "\uFF08\u65E0\u8F93\u51FA\uFF09";
  try {
    return JSON.stringify(v, null, 2);
  } catch (_) {
    return String(v);
  }
}
function JqQueryPanel(props) {
  const [tab, setTab] = useState("query");
  const [meta, setMeta] = useState(null);
  const [bridgeDown, setBridgeDown] = useState(false);
  const [engineUp, setEngineUp] = useState(false);
  const [engineVersion, setEngineVersion] = useState("");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(".");
  const [flags, setFlags] = useState([]);
  const [args_, setArgs] = useState([]);
  const [argsOpen, setArgsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [history, setHistory] = useState([]);
  const [histOpen, setHistOpen] = useState(false);
  const histRef = useRef(null);
  const [refEntries, setRefEntries] = useState(null);
  const [refTotal, setRefTotal] = useState(0);
  const [refKw, setRefKw] = useState("");
  const [check, setCheck] = useState(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [outlineText, setOutlineText] = useState("");
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [selftest, setSelftest] = useState(null);
  const [selfBusy, setSelfBusy] = useState(false);
  const metaRef = useRef(null);
  metaRef.current = meta;
  const refreshMeta = useCallback(async () => {
    try {
      const m = await getMeta();
      setMeta(m);
      setBridgeDown(!m);
      if (m) {
        try {
          const h = await apiHealth(m);
          setEngineUp(Boolean(h && h.ok));
          setEngineVersion(String(h.version || ""));
        } catch (_) {
          setEngineUp(false);
        }
      }
    } catch (_) {
      setBridgeDown(true);
      setEngineUp(false);
    }
  }, []);
  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);
  useEffect(() => {
    const t = setInterval(() => {
      void refreshMeta();
    }, 12e3);
    return () => clearInterval(t);
  }, [refreshMeta]);
  useEffect(() => {
    void (async () => {
      setHistory(await loadHistory());
      const last = await loadLast();
      if (last) {
        if (typeof last.input === "string") setInput(last.input);
        if (typeof last.query === "string" && last.query) setQuery(last.query);
        if (Array.isArray(last.flags)) setFlags(last.flags);
        if (Array.isArray(last.args)) setArgs(last.args);
      }
    })();
  }, []);
  useEffect(() => {
    const onDocClick = (e) => {
      if (histRef.current && e.target instanceof Node && !histRef.current.contains(e.target)) setHistOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  const persistLast = useCallback((patch) => {
    void saveLast({
      input: patch.input ?? input,
      query: patch.query ?? query,
      flags: patch.flags ?? flags,
      args: patch.args ?? args_
    });
  }, [input, query, flags, args_]);
  const toggleFlag = (f) => {
    const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f];
    setFlags(next);
    persistLast({ flags: next });
  };
  const buildFlags = useCallback((extra) => {
    const rows = extra ?? args_;
    const out = [...flags];
    for (const a of rows) {
      const name = a.name.trim();
      if (!name) continue;
      if (a.kind === "argjson") {
        try {
          JSON.parse(a.value);
        } catch (_) {
          continue;
        }
        out.push("--argjson", name, a.value);
      } else {
        out.push("--arg", name, a.value);
      }
    }
    return out;
  }, [flags, args_]);
  const pushHistory = useCallback((q, usedFlags) => {
    const item = { q, flags: usedFlags, ts: Date.now() };
    setHistory((prev) => {
      const next = [item, ...prev.filter((x) => x.q !== q)].slice(0, 50);
      void saveHistory(next);
      return next;
    });
  }, []);
  const run = useCallback(async () => {
    const m = metaRef.current;
    if (!m) {
      setError("\u670D\u52A1\u672A\u5C31\u7EEA\uFF08\u6865\u964D\u7EA7\u6216\u670D\u52A1\u672A\u542F\u52A8\uFF09\uFF0C\u70B9\u53F3\u4E0A\u72B6\u6001\u706F\u91CD\u8BD5");
      return;
    }
    const q = query.trim() ? query : ".";
    setError("");
    setNotice("");
    setRunning(true);
    const usedFlags = buildFlags();
    try {
      const r = await apiQuery(m, { input, query: q, flags: usedFlags });
      setResult(r);
      pushHistory(q, usedFlags);
      void saveLast({ input, query: q, flags: usedFlags, args: args_ });
    } catch (e) {
      setResult(null);
      setError(String(e.message || e));
    } finally {
      setRunning(false);
    }
  }, [query, input, buildFlags, pushHistory, args_]);
  const onRunClick = () => {
    void run();
  };
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
  };
  const openFile = async () => {
    const p = filePath.trim();
    if (!p) return;
    setFileBusy(true);
    setError("");
    try {
      const text = await readTextFile(p);
      setInput(text);
      persistLast({ input: text });
      setNotice(`\u5DF2\u8F7D\u5165\u6587\u4EF6\uFF1A${p.split(/[\\/]/).pop()}\uFF08${fmtBytes(text.length)}\uFF09`);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setFileBusy(false);
    }
  };
  const loadRef = useCallback(async (kw) => {
    const m = metaRef.current;
    if (!m) return;
    try {
      const r = await apiReference(m, kw);
      setRefEntries(r.entries);
      setRefTotal(r.total);
    } catch (_) {
    }
  }, []);
  useEffect(() => {
    if (tab === "ref" && !refEntries) void loadRef("");
  }, [tab, refEntries, loadRef]);
  const doCheck = async () => {
    const m = metaRef.current;
    if (!m) return;
    setCheckBusy(true);
    setCheck(null);
    try {
      setCheck(await apiCheck(m, query));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCheckBusy(false);
    }
  };
  const doOutline = async () => {
    const m = metaRef.current;
    if (!m) return;
    if (!input.trim()) {
      setError("\u5148\u7C98\u8D34/\u8F7D\u5165\u8F93\u5165 JSON \u518D\u770B\u7ED3\u6784\u5927\u7EB2");
      return;
    }
    setOutlineBusy(true);
    setOutlineText("");
    setResult(null);
    setError("");
    try {
      const r = await apiOutline(m, { json: input });
      setOutlineText(r.text);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setOutlineBusy(false);
    }
  };
  const doSelftest = async () => {
    const m = metaRef.current;
    if (!m) return;
    setSelfBusy(true);
    setSelftest(null);
    try {
      setSelftest(await apiSelftest(m));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSelfBusy(false);
    }
  };
  const insertSig = (s) => {
    setQuery((prev) => prev.trim() ? `${prev.trimEnd()} | ${s}` : s);
  };
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
    } catch (_) {
    }
  };
  const sendToChat = () => {
    if (!result || !props.onSendToChat) return;
    const body = result.outputs && result.outputs.length ? result.outputs.map((o) => o.error ? `\u26A0 ${o.error}` : renderOutputValue(o.value, result.flags.includes("-r"))).join("\n---\n") : result.raw;
    void props.onSendToChat(`\u6211\u7528 jq \u67E5\u8BE2\u53F0\u67E5\u8BE2\u4E86 JSON\uFF1A

jq: \`${query.trim() || "."}\`${result.flags.length ? `\uFF08flags: ${result.flags.join(" ")}\uFF09` : ""}

\u7ED3\u679C\uFF1A
${body.slice(0, 6e3)}`);
  };
  const inputInfo = useMemo(() => {
    const bytes = new TextEncoder().encode(input).length;
    const trimmed = input.trim();
    let validity = "";
    if (trimmed) {
      try {
        JSON.parse(trimmed);
        validity = "\u5355\u6587\u6863 JSON \u2713";
      } catch (_) {
        validity = "\u591A\u6587\u6863/NDJSON \u6216\u975E\u6CD5\uFF08\u4EE5\u5F15\u64CE\u5224\u5B9A\u4E3A\u51C6\uFF09";
      }
    }
    return { bytes, validity };
  }, [input]);
  const rawMode = (result?.flags ?? flags).includes("-r");
  const statusColor = bridgeDown ? "err" : engineUp ? "on" : "err";
  const statusText = bridgeDown ? "\u6865\u964D\u7EA7" : engineUp ? `\u5F15\u64CE\u5728\u7EBF${engineVersion ? ` v${engineVersion}` : ""}` : "\u670D\u52A1\u79BB\u7EBF";
  return /* @__PURE__ */ jsxs("div", { className: "qq-root", children: [
    /* @__PURE__ */ jsx("style", { children: css }),
    /* @__PURE__ */ jsxs("div", { className: "qq-top", children: [
      /* @__PURE__ */ jsx("div", { className: "qq-logo", children: "jq" }),
      /* @__PURE__ */ jsxs("div", { className: "qq-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "jq \u67E5\u8BE2\u53F0" }),
        /* @__PURE__ */ jsx("small", { children: "\u771F\u5B9E jq \u5F15\u64CE \xB7 \u672C\u5730\u6587\u4EF6 \xB7 NDJSON \xB7 AI \u4E94\u5DE5\u5177" })
      ] }),
      /* @__PURE__ */ jsx("span", { className: `qq-dot ${statusColor}`, title: statusText, onClick: () => void refreshMeta() }),
      /* @__PURE__ */ jsx("small", { style: { color: "#8B95A7", fontSize: 10.5 }, children: statusText })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qq-tabs", children: [
      /* @__PURE__ */ jsx("button", { className: `qq-tab ${tab === "query" ? "on" : ""}`, onClick: () => setTab("query"), children: "\u67E5\u8BE2" }),
      /* @__PURE__ */ jsx("button", { className: `qq-tab ${tab === "ref" ? "on" : ""}`, onClick: () => setTab("ref"), children: "\u901F\u67E5\u8868" }),
      /* @__PURE__ */ jsx("button", { className: `qq-tab ${tab === "selftest" ? "on" : ""}`, onClick: () => setTab("selftest"), children: "\u81EA\u68C0" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "qq-body", children: [
      tab === "query" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "qq-sec", children: [
          "\u8F93\u5165 JSON / NDJSON",
          /* @__PURE__ */ jsxs("span", { className: "act", children: [
            /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => setShowSamples((v) => !v), children: "\u793A\u4F8B" }),
            /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => {
              setInput("");
              persistLast({ input: "" });
            }, children: "\u6E05\u7A7A" })
          ] })
        ] }),
        showSamples && /* @__PURE__ */ jsx("div", { style: { margin: "2px 16px 4px", display: "flex", flexDirection: "column", gap: 4 }, children: SAMPLES.map((s) => /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", style: { justifyContent: "flex-start" }, onClick: () => {
          setInput(s.data);
          setShowSamples(false);
          persistLast({ input: s.data });
        }, children: s.name }, s.name)) }),
        /* @__PURE__ */ jsx("div", { style: { margin: "2px 16px" }, children: /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "qq-txa",
            rows: 6,
            value: input,
            spellCheck: false,
            placeholder: "\u7C98\u8D34 JSON / NDJSON\uFF1B\u6216\u4E0B\u65B9\u8F93\u5165\u7EDD\u5BF9\u8DEF\u5F84\u6253\u5F00\u672C\u5730\u6587\u4EF6\uFF08\u226464MB\uFF09",
            onChange: (e) => {
              setInput(e.target.value);
            },
            onBlur: () => persistLast({})
          }
        ) }),
        /* @__PURE__ */ jsxs("div", { className: "qq-file", children: [
          /* @__PURE__ */ jsx("span", { className: "qq-lbl", children: "\u6587\u4EF6" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "qq-inp",
              value: filePath,
              placeholder: "D:\\\\data\\\\x.json\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF09",
              onChange: (e) => setFilePath(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") void openFile();
              }
            }
          ),
          /* @__PURE__ */ jsx("button", { className: "qq-btn mini", disabled: fileBusy || !filePath.trim(), onClick: () => void openFile(), children: fileBusy ? /* @__PURE__ */ jsx("span", { className: "qq-spin" }) : "\u8F7D\u5165" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qq-meta", children: [
          /* @__PURE__ */ jsx("span", { children: fmtBytes(inputInfo.bytes) }),
          inputInfo.validity && /* @__PURE__ */ jsx("span", { children: inputInfo.validity })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qq-sec", children: [
          "jq \u67E5\u8BE2",
          /* @__PURE__ */ jsxs("span", { className: "act", children: [
            /* @__PURE__ */ jsxs("div", { className: "qq-hist", ref: histRef, children: [
              /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => setHistOpen((v) => !v), children: "\u5386\u53F2" }),
              histOpen && /* @__PURE__ */ jsxs("div", { className: "qq-hist-list", children: [
                history.length === 0 && /* @__PURE__ */ jsx("div", { className: "qq-empty", children: "\u6682\u65E0\u5386\u53F2" }),
                history.map((h, i) => /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: "qq-hist-item",
                    title: h.q,
                    onClick: () => {
                      setQuery(h.q);
                      if (h.flags) setFlags(h.flags.filter((f) => FLAG_DEFS.some((d) => d.f === f) || f === "--arg" || f === "--argjson"));
                      setHistOpen(false);
                      persistLast({ query: h.q });
                    },
                    children: [
                      /* @__PURE__ */ jsx("span", { className: "t", children: fmtTime(h.ts) }),
                      h.q
                    ]
                  },
                  `${h.ts}-${i}`
                ))
              ] })
            ] }),
            /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", disabled: checkBusy, onClick: () => void doCheck(), children: checkBusy ? "\u6821\u9A8C\u4E2D\u2026" : "\u8BED\u6CD5\u6821\u9A8C" }),
            /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", disabled: outlineBusy, onClick: () => void doOutline(), children: outlineBusy ? "\u89E3\u6790\u4E2D\u2026" : "\u7ED3\u6784\u5927\u7EB2" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { margin: "2px 16px" }, children: /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "qq-txa",
            rows: 3,
            value: query,
            spellCheck: false,
            placeholder: ".users[] | select(.age > 30) | {name, city}   \uFF08Ctrl+Enter \u8FD0\u884C\uFF09",
            onChange: (e) => setQuery(e.target.value),
            onKeyDown
          }
        ) }),
        /* @__PURE__ */ jsxs("div", { className: "qq-flags", children: [
          FLAG_DEFS.map((d) => /* @__PURE__ */ jsx(
            "span",
            {
              className: `qq-chip ${flags.includes(d.f) ? "on" : ""}`,
              title: d.title,
              onClick: () => toggleFlag(d.f),
              children: d.f
            },
            d.f
          )),
          /* @__PURE__ */ jsx("span", { className: `qq-chip ${argsOpen ? "on" : ""}`, onClick: () => setArgsOpen((v) => !v), title: "--arg / --argjson \u53D8\u91CF\u6CE8\u5165", children: "--arg\u2026" })
        ] }),
        argsOpen && /* @__PURE__ */ jsxs("div", { className: "qq-args", children: [
          args_.map((a, i) => /* @__PURE__ */ jsxs("div", { className: "qq-argrow", children: [
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "qq-sel",
                value: a.kind,
                style: { width: 96 },
                onChange: (e) => setArgs((prev) => prev.map((x, j) => j === i ? { ...x, kind: e.target.value } : x)),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "arg", children: "--arg" }),
                  /* @__PURE__ */ jsx("option", { value: "argjson", children: "--argjson" })
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "qq-inp",
                style: { maxWidth: 110 },
                placeholder: "\u540D\u79F0",
                value: a.name,
                onChange: (e) => setArgs((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: "qq-inp",
                placeholder: a.kind === "argjson" ? '{"k":1}' : "\u503C",
                value: a.value,
                onChange: (e) => setArgs((prev) => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))
              }
            ),
            /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => setArgs((prev) => prev.filter((_, j) => j !== i)), children: "\u2715" })
          ] }, i)),
          /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => setArgs((prev) => [...prev, { kind: "arg", name: "", value: "" }]), children: "+ \u52A0\u53D8\u91CF" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, padding: "8px 16px" }, children: [
          /* @__PURE__ */ jsx("button", { className: "qq-btn", disabled: running || !engineUp, onClick: onRunClick, children: running ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { className: "qq-spin" }),
            " \u8FD0\u884C\u4E2D\u2026"
          ] }) : "\u25B6 \u8FD0\u884C\uFF08Ctrl+Enter\uFF09" }),
          result && /* @__PURE__ */ jsx("button", { className: "qq-btn ghost", onClick: () => void copyText(result.raw), children: "\u590D\u5236\u5168\u90E8\u8F93\u51FA" }),
          result && props.onSendToChat && /* @__PURE__ */ jsx("button", { className: "qq-btn ghost", onClick: sendToChat, children: "\u53D1\u5230\u5BF9\u8BDD" })
        ] }),
        check && (check.syntaxOk ? /* @__PURE__ */ jsxs("div", { className: "qq-ok", children: [
          "\u2713 \u8BED\u6CD5 OK",
          check.runtimeNote ? `\uFF08${check.runtimeNote}\uFF09` : ""
        ] }) : /* @__PURE__ */ jsxs("div", { className: "qq-err", children: [
          "\u2717 \u8BED\u6CD5\u9519\u8BEF\uFF1A",
          check.error
        ] })),
        outlineText && /* @__PURE__ */ jsxs("div", { style: { margin: "6px 16px" }, children: [
          /* @__PURE__ */ jsxs("div", { className: "qq-out-head", children: [
            /* @__PURE__ */ jsx("span", { className: "idx", children: "\u7ED3\u6784\u5927\u7EB2\uFF08depth=3\uFF09" }),
            /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => void copyText(outlineText), children: "\u590D\u5236" })
          ] }),
          /* @__PURE__ */ jsx("pre", { className: "qq-pre", children: outlineText })
        ] }),
        error && /* @__PURE__ */ jsx("div", { className: "qq-err", children: error }),
        notice && !error && /* @__PURE__ */ jsx("div", { className: "qq-ok", children: notice }),
        result && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "qq-meta", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              result.ms,
              "ms"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              "\u8F93\u51FA ",
              result.outputCount ?? "\u2014",
              " \u9879 / ",
              fmtBytes(result.rawBytes)
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              "\u8F93\u5165 ",
              result.inputDocs,
              " \u6587\u6863"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              "flags: ",
              result.flags.length ? result.flags.join(" ") : "\uFF08\u65E0\uFF09"
            ] })
          ] }),
          result.truncationNotice && /* @__PURE__ */ jsx("div", { className: "qq-err", children: result.truncationNotice }),
          /* @__PURE__ */ jsxs("div", { className: "qq-out", children: [
            (!result.outputs || result.outputs.length === 0) && !result.truncated && /* @__PURE__ */ jsx("div", { className: "qq-pre", children: "\uFF08\u7A7A\u6D41\uFF1A\u67E5\u8BE2\u5408\u6CD5\u4F46\u672A\u4EA7\u51FA\u7ED3\u679C\uFF09" }),
            (result.outputs ?? []).map((o, i) => /* @__PURE__ */ jsxs("div", { className: "qq-out-item", children: [
              /* @__PURE__ */ jsxs("div", { className: "qq-out-head", children: [
                /* @__PURE__ */ jsxs("span", { className: "idx", children: [
                  "#",
                  i + 1
                ] }),
                /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => void copyText(renderOutputValue(o.value, rawMode)), children: "\u590D\u5236" })
              ] }),
              o.error ? /* @__PURE__ */ jsxs("div", { className: "qq-err", style: { margin: 0 }, children: [
                "\u8F93\u51FA\u6BB5\u89E3\u6790\u5931\u8D25\uFF1A",
                o.error,
                "\\n\u539F\u6587\uFF1A",
                o.raw
              ] }) : /* @__PURE__ */ jsx("pre", { className: "qq-pre", children: renderOutputValue(o.value, rawMode) })
            ] }, i))
          ] })
        ] })
      ] }),
      tab === "ref" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "qq-sec", children: [
          "\u901F\u67E5\u8868",
          /* @__PURE__ */ jsx("span", { className: "act", children: /* @__PURE__ */ jsxs("small", { style: { color: "#5B6478" }, children: [
            refTotal,
            " \u6761\u547D\u4E2D / \u70B9\u51FB\u7B7E\u540D\u63D2\u5165\u67E5\u8BE2"
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qq-file", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: "qq-inp",
              value: refKw,
              placeholder: "\u641C\u7D22\uFF1Agroup / \u65F6\u95F4 / \u6B63\u5219 / select / @csv\u2026",
              onChange: (e) => setRefKw(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") void loadRef(refKw);
              }
            }
          ),
          /* @__PURE__ */ jsx("button", { className: "qq-btn mini", onClick: () => void loadRef(refKw), children: "\u641C\u7D22" }),
          refKw && /* @__PURE__ */ jsx("button", { className: "qq-btn mini ghost", onClick: () => {
            setRefKw("");
            void loadRef("");
          }, children: "\u6E05" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "qq-ref", children: [
          refEntries && refEntries.length === 0 && /* @__PURE__ */ jsx("div", { className: "qq-empty", children: "\u6CA1\u6709\u547D\u4E2D\uFF0C\u6362\u4E2A\u5173\u952E\u8BCD\u8BD5\u8BD5" }),
          (refEntries ?? []).map((e2, i) => /* @__PURE__ */ jsxs("div", { className: "qq-ref-item", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("span", { className: "qq-ref-cat", children: e2.cat }),
              /* @__PURE__ */ jsx("span", { className: "qq-ref-sig", title: "\u70B9\u51FB\u63D2\u5165\u5230\u67E5\u8BE2", onClick: () => {
                insertSig(e2.sig);
                setTab("query");
              }, children: e2.sig })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "qq-ref-desc", children: e2.desc }),
            /* @__PURE__ */ jsxs("div", { className: "qq-ref-ex", title: "\u70B9\u51FB\u628A\u793A\u4F8B\u8BBE\u4E3A\u67E5\u8BE2", onClick: () => {
              setQuery(e2.ex);
              setTab("query");
            }, children: [
              "\u4F8B: ",
              e2.ex
            ] })
          ] }, i))
        ] })
      ] }),
      tab === "selftest" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "qq-sec", children: "\u5F15\u64CE\u81EA\u68C0\uFF08\u8BD5\u91D1\u77F3\uFF09" }),
        /* @__PURE__ */ jsx("div", { style: { padding: "4px 16px", display: "flex", gap: 8 }, children: /* @__PURE__ */ jsx("button", { className: "qq-btn warn", disabled: selfBusy || !engineUp, onClick: () => void doSelftest(), children: selfBusy ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { className: "qq-spin" }),
          " \u81EA\u68C0\u4E2D\u2026"
        ] }) : "\u8DD1 14 \u9879\u81EA\u68C0" }) }),
        selftest && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: `qq-ok`, style: { color: selftest.fail === 0 ? "#7BDCC4" : "#F2A0A3", borderColor: selftest.fail === 0 ? "rgba(62,207,178,.35)" : "rgba(229,72,77,.4)" }, children: [
            selftest.pass,
            "/",
            selftest.total,
            " \u901A\u8FC7\uFF08\u5F15\u64CE queries=",
            selftest.engine.queries,
            " timeouts=",
            selftest.engine.timeouts,
            " respawns=",
            selftest.engine.respawns,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "qq-out", children: selftest.results.map((r, i) => /* @__PURE__ */ jsxs("div", { style: { margin: "3px 0", fontSize: 12 }, children: [
            /* @__PURE__ */ jsx("span", { className: r.pass ? "qq-st-pass" : "qq-st-fail", children: r.pass ? "\u2713" : "\u2717" }),
            " ",
            r.name,
            !r.pass && r.detail ? /* @__PURE__ */ jsxs("span", { style: { color: "#8B95A7" }, children: [
              " \u2014 ",
              r.detail
            ] }) : null
          ] }, i)) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "qq-meta", style: { marginTop: 10 }, children: /* @__PURE__ */ jsx("span", { children: "\u53E3\u5F84\uFF1A\u81EA\u68C0\u8D70\u771F\u5B9E worker \u5F15\u64CE\uFF08\u542B\u8D85\u65F6\u51FB\u6740+\u91CD\u751F\u6210\uFF09\uFF0C\u4E0E test/ \u79BB\u7EBF\u65AD\u8A00\u4E92\u8865\u3002" }) })
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function JqQueryEntry(props) {
  return /* @__PURE__ */ jsx2(JqQueryPanel, { ...props });
}
export {
  JqQueryEntry as default
};
