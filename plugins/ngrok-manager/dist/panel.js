// src/Panel.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var DEFAULT_PORT = 9870;
async function mgrFetch(path, opts, port) {
  const p = port || DEFAULT_PORT;
  const res = await fetch(`http://127.0.0.1:${p}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers || {} } });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
var STYLES = `
:root{
  --bg:#16161a;--bg-2:#1e1e24;--bg-3:#26262e;--bg-4:#2e2e38;--bg-5:#36363f;
  --border:#34343f;--text:#ececf0;--text-2:#9a9aa6;--text-3:#65656f;
  --accent:#5b8cff;--accent-bg:rgba(91,140,255,.12);
  --green:#34c759;--green-bg:rgba(52,199,89,.12);
  --yellow:#ffcc00;--yellow-bg:rgba(255,204,0,.12);
  --orange:#ff9f0a;--orange-bg:rgba(255,159,10,.14);
  --red:#ff453a;--red-bg:rgba(255,69,58,.12);
  --r:10px;--rs:7px;
  --mono:'SF Mono','JetBrains Mono','Cascadia Code',Consolas,monospace;
  --pad:clamp(12px,4vw,18px);--gap:clamp(10px,3vw,14px);
  --fs:clamp(12px,3.6vw,13px);--fs-url:clamp(11px,3.4vw,13px);--fs-t:clamp(13px,4vw,15px);
  --bh:clamp(36px,11vw,40px);
}
.ngm-root{all:initial}
.ngm-root *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
.ngm-root{
  background:var(--bg);color:var(--text);font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  font-size:var(--fs);line-height:1.5;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;-webkit-font-smoothing:antialiased;
}
.ngm-topbar{display:flex;align-items:center;gap:8px;padding:calc(var(--pad)*.7) var(--pad);border-bottom:1px solid var(--border);background:var(--bg-2);flex-shrink:0;position:relative}
.ngm-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:var(--fs-t);min-width:0}
.ngm-logo{width:26px;height:26px;border-radius:7px;flex-shrink:0;background:linear-gradient(135deg,var(--accent),#7aa3ff);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 8px rgba(91,140,255,.4)}
.ngm-logo svg{width:15px;height:15px}
.ngm-ver{font-size:9px;color:var(--text-3);font-weight:500;background:var(--bg-4);padding:1px 5px;border-radius:4px;margin-left:2px}
.ngm-stat{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text-2);white-space:nowrap}
.ngm-stat .d{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.ngm-stat.ok .d{background:var(--green);box-shadow:0 0 6px var(--green)}
.ngm-stat.warn .d{background:var(--orange);box-shadow:0 0 6px var(--orange)}
.ngm-stat.muted .d{background:var(--text-3)}
.ngm-stat.err .d{background:var(--red)}
.ngm-spacer{flex:1}
.ngm-iconbtn{background:transparent;border:1px solid transparent;color:var(--text-2);width:34px;height:34px;border-radius:8px;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;font-size:15px}
.ngm-iconbtn:hover,.ngm-iconbtn:active{background:var(--bg-4);color:var(--text);border-color:var(--border)}
.ngm-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:var(--pad);padding-bottom:calc(var(--pad) + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:var(--gap)}
.ngm-body::-webkit-scrollbar{width:6px}
.ngm-body::-webkit-scrollbar-thumb{background:var(--bg-4);border-radius:3px}
.ngm-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.ngm-cardhead{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.5px}
.ngm-cardhead .h{margin-left:auto;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px}
.ngm-cardbody{padding:14px}
.ngm-field{margin-bottom:12px}
.ngm-field:last-child{margin-bottom:0}
.ngm-field>label{display:block;font-size:11px;color:var(--text-2);margin-bottom:6px;font-weight:500}
.ngm-field>label .rq{color:var(--red)}
.ngm-input{width:100%;padding:0 12px;height:var(--bh);background:var(--bg-3);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);font-size:13px;font-family:var(--mono);outline:none;transition:border-color .15s}
.ngm-input:focus{border-color:var(--accent);background:var(--bg-4)}
.ngm-input::placeholder{color:var(--text-3)}
.ngm-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.ngm-chips::-webkit-scrollbar{display:none}
.ngm-chip{flex-shrink:0;height:var(--bh);padding:0 12px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--rs);color:var(--text-2);font-size:12px;font-family:var(--mono);cursor:pointer;display:inline-flex;align-items:center;transition:all .15s}
.ngm-chip:active{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.ngm-seg{display:flex;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--rs);padding:3px;gap:2px}
.ngm-seg button{flex:1;background:transparent;border:none;color:var(--text-2);padding:0 10px;height:calc(var(--bh) - 6px);font-size:12px;border-radius:5px;cursor:pointer;transition:all .15s;font-weight:500}
.ngm-seg button.active{background:var(--accent);color:#fff;box-shadow:0 1px 4px rgba(91,140,255,.4)}
.ngm-btn{height:var(--bh);padding:0 16px;border:none;border-radius:var(--rs);cursor:pointer;font-size:13px;font-weight:600;transition:all .15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;-webkit-user-select:none;user-select:none}
.ngm-btn.p{background:var(--accent);color:#fff}
.ngm-btn.p:active{background:#4a78f0;transform:scale(.98)}
.ngm-btn.p:disabled{background:var(--bg-4);color:var(--text-3);cursor:not-allowed}
.ngm-btn.g{background:var(--bg-3);color:var(--text);border:1px solid var(--border)}
.ngm-btn.g:active{background:var(--bg-4)}
.ngm-btn.g:disabled{color:var(--text-3);cursor:not-allowed;opacity:.5}
.ngm-btn.d{background:var(--red-bg);color:var(--red);border:1px solid rgba(255,69,58,.3)}
.ngm-btn.d:active{background:rgba(255,69,58,.2)}
.ngm-btn.d:disabled{opacity:.4;cursor:not-allowed}
.ngm-btn.w{background:var(--orange);color:#fff}
.ngm-btn.w:active{background:#e68f00;transform:scale(.98)}
.ngm-btn.w:disabled{background:var(--bg-4);color:var(--text-3)}
.ngm-btn.sm{height:32px;padding:0 10px;font-size:11px}
.ngm-btn.blk{width:100%}
.ngm-btn.ico{flex:1}
.ngm-pendingbar{margin:0 var(--pad);padding:10px 12px;border-radius:var(--rs);background:var(--orange-bg);border:1px solid rgba(255,159,10,.3);font-size:12px;color:var(--orange);display:flex;align-items:center;gap:10px;animation:ngm-slide .25s ease}
.ngm-pendingbar.hide{display:none}
.ngm-pendingbar .acts{margin-left:auto;display:flex;gap:6px;flex-shrink:0}
@keyframes ngm-slide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.ngm-empty{padding:40px 16px;text-align:center;color:var(--text-3);font-size:12px}
.ngm-empty .ill{width:56px;height:56px;margin:0 auto 12px;border-radius:14px;background:var(--bg-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-3)}
.ngm-empty .ill svg{width:26px;height:26px}
.ngm-tunnel{border-bottom:1px solid var(--border);padding:14px;position:relative;animation:ngm-fade .3s ease}
.ngm-tunnel:last-child{border-bottom:none}
.ngm-tunnel::before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 2px 2px 0}
.ngm-tunnel.s-running::before{background:var(--green)}
.ngm-tunnel.s-starting::before{background:var(--yellow)}
.ngm-tunnel.s-stopping::before,.ngm-tunnel.s-error::before,.ngm-tunnel.s-stopped::before{background:var(--red)}
@keyframes ngm-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.ngm-th{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ngm-tnm{font-family:var(--mono);font-size:11px;color:var(--text-3);flex-shrink:0}
.ngm-turl{flex:1;min-width:0;font-family:var(--mono);font-size:var(--fs-url);color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.ngm-turl:active{opacity:.7}
.ngm-turl.ph{color:var(--text-3);font-style:italic}
.ngm-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;letter-spacing:.3px;flex-shrink:0}
.ngm-pill .d{width:6px;height:6px;border-radius:50%}
.ngm-pill.live{background:var(--green-bg);color:var(--green)}
.ngm-pill.live .d{background:var(--green);animation:ngm-pulse 1.5s infinite}
.ngm-pill.starting{background:var(--yellow-bg);color:var(--yellow)}
.ngm-pill.starting .d{background:var(--yellow);animation:ngm-pulse 1s infinite}
.ngm-pill.stopping,.ngm-pill.error,.ngm-pill.stopped{background:var(--red-bg);color:var(--red)}
.ngm-pill.stopping .d,.ngm-pill.error .d,.ngm-pill.stopped .d{background:var(--red)}
.ngm-pill.plain{background:var(--bg-4);color:var(--text-2)}
@keyframes ngm-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.ngm-tmeta{display:flex;gap:12px;font-size:11px;color:var(--text-2);margin-bottom:10px;flex-wrap:wrap}
.ngm-tmeta .k{color:var(--text-3);margin-right:4px}
.ngm-tacts{display:flex;gap:6px}
.ngm-tacts .ngm-btn{flex:1;height:34px;font-size:12px}
.ngm-ptunnel{border-bottom:1px solid var(--border);padding:10px 14px;display:flex;align-items:center;gap:8px}
.ngm-ptunnel:last-child{border-bottom:none}
.ngm-ptunnel .pp{font-size:10px;padding:3px 7px;border-radius:5px;font-weight:600;flex-shrink:0}
.ngm-ptunnel .pa{background:var(--orange-bg);color:var(--orange)}
.ngm-ptunnel .pr{background:var(--red-bg);color:var(--red)}
.ngm-ptunnel .pi{flex:1;min-width:0;font-size:12px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ngm-ptunnel .pi .pn{font-family:var(--mono);color:var(--text)}
.ngm-logs{background:#0c0c10;color:#b0b0b8;font-family:var(--mono);font-size:11px;padding:10px 12px;max-height:200px;overflow-y:auto;line-height:1.65}
.ngm-logs::-webkit-scrollbar{width:5px}
.ngm-logs::-webkit-scrollbar-thumb{background:#2a2a33}
.ngm-logline{white-space:pre-wrap;word-break:break-all}
.ngm-logline.info{color:#8ab4f8}
.ngm-logline.warn{color:#ffcc00}
.ngm-logline.error{color:#ff6b6b}
.ngm-logline.url{color:var(--green);font-weight:600}
.ngm-bottombar{flex-shrink:0;border-top:1px solid var(--border);background:var(--bg-2);padding:10px var(--pad) calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;align-items:center}
.ngm-bottombar .ci{font-size:11px;color:var(--text-3);flex:1;min-width:0}
.ngm-bottombar .ci b{color:var(--text);font-size:13px}
.ngm-bottombar.hide{display:none}
.ngm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50;display:none}
.ngm-overlay.show{display:block}
.ngm-sheet{position:absolute;left:0;right:0;bottom:0;max-height:88vh;max-height:88dvh;background:var(--bg-2);border-top-left-radius:16px;border-top-right-radius:16px;border-top:1px solid var(--border);box-shadow:0 -8px 32px rgba(0,0,0,.4);transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1);display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px)}
.ngm-overlay.show .ngm-sheet{transform:translateY(0)}
@media(min-width:720px){.ngm-overlay{align-items:center;justify-content:center}.ngm-sheet{position:relative;left:auto;right:auto;bottom:auto;max-width:460px;width:100%;border-radius:14px}}
.ngm-grip{width:36px;height:4px;background:var(--bg-5);border-radius:2px;margin:8px auto 0;flex-shrink:0}
.ngm-sheethead{display:flex;align-items:center;padding:12px 16px;gap:8px;font-weight:600;font-size:14px;flex-shrink:0}
.ngm-sheetbody{padding:4px 16px 16px;overflow-y:auto;flex:1}
.ngm-sheetfoot{padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0}
.ngm-toastwrap{position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:100%;max-width:360px;padding:0 12px}
.ngm-toast{background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.28);animation:ngm-toast .25s ease;width:100%;text-align:center}
.ngm-toast.ok{border-left:3px solid var(--green)}
.ngm-toast.err{border-left:3px solid var(--red)}
.ngm-toast.info{border-left:3px solid var(--accent)}
.ngm-toast.warn{border-left:3px solid var(--orange)}
@keyframes ngm-toast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.ngm-details summary{cursor:pointer;user-select:none;list-style:none}
.ngm-details summary::-webkit-details-marker{display:none}
.ngm-chev{transition:transform .2s;display:inline-block}
.ngm-details[open] summary .ngm-chev{transform:rotate(90deg)}
.ngm-hintbox{font-size:11px;color:var(--text-3);padding:10px 12px;background:var(--bg-3);border-radius:var(--rs);border-left:2px solid var(--accent);line-height:1.6}
.ngm-hintbox b{color:var(--text-2)}
.ngm-preflight{margin:0 var(--pad);padding:12px 14px;border-radius:var(--rs);background:var(--red-bg);border:1px solid rgba(255,69,58,.3);font-size:12px;color:var(--red);display:flex;flex-direction:column;gap:8px}
.ngm-preflight.hide{display:none}
.ngm-preflight .pt-title{font-weight:600;display:flex;align-items:center;gap:6px}
.ngm-preflight .pt-item{display:flex;align-items:flex-start;gap:8px;font-size:11px;color:var(--text-2)}
.ngm-preflight .pt-item .ic{flex-shrink:0;font-size:13px}
.ngm-preflight .pt-item.ok .ic{color:var(--green)}
.ngm-preflight .pt-item.fail .ic{color:var(--red)}
.ngm-preflight .pt-item .tx{flex:1;min-width:0}
.ngm-preflight .pt-item .tx code{font-family:var(--mono);font-size:10px;background:var(--bg-3);padding:1px 5px;border-radius:3px;color:var(--text)}
.ngm-preflight .pt-actions{display:flex;gap:6px;margin-top:4px}
`;
function NgrokManagerPanel({ pluginId: _pluginId }) {
  const [tunnels, setTunnels] = useState([]);
  const [pending, setPending] = useState([]);
  const [logs, setLogs] = useState([]);
  const [mode, setMode] = useState("random");
  const [portInput, setPortInput] = useState("");
  const [domainInput, setDomainInput] = useState("dominant-ant-formerly.ngrok-free.app");
  const [health, setHealth] = useState(null);
  const [applying, setApplying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cfg, setCfg] = useState({ ngrokPath: "ngrok", defaultDomain: "dominant-ant-formerly.ngrok-free.app", mgrPort: 9870 });
  const [mgrPort, setMgrPort] = useState(DEFAULT_PORT);
  const [toasts, setToasts] = useState([]);
  const seqRef = useRef(1);
  const logsEndRef = useRef(null);
  const toast = useCallback((msg, type = "info") => {
    const id = "ts" + seqRef.current++;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      for (let p = DEFAULT_PORT; p <= DEFAULT_PORT + 5; p++) {
        try {
          const res = await fetch(`http://127.0.0.1:${p}/__health`, { signal: AbortSignal.timeout(1500) });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              setMgrPort(p);
              setHealth(data);
              return;
            }
          }
        } catch {
        }
      }
      if (!cancelled) setHealth(null);
    }
    probe();
    const t = setInterval(probe, 5e3);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!health) return;
    let cancelled = false;
    async function pull() {
      try {
        const [tr, lg] = await Promise.all([
          mgrFetch("/tunnels", void 0, mgrPort),
          mgrFetch("/logs?limit=80", void 0, mgrPort)
        ]);
        if (!cancelled) {
          setTunnels(tr.data || []);
          setLogs(lg.data || []);
        }
      } catch {
      }
    }
    pull();
    const t = setInterval(pull, 2e3);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [health, mgrPort]);
  useEffect(() => {
    mgrFetch("/config", void 0, mgrPort).then((r) => {
      if (r.data) {
        setCfg(r.data);
        if (r.data.defaultDomain) setDomainInput(r.data.defaultDomain);
      }
    }).catch(() => {
    });
  }, [mgrPort]);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1e3);
    return () => clearInterval(t);
  }, []);
  function addPending() {
    const port = parseInt(portInput, 10);
    if (!port || port < 1 || port > 65535) return toast("\u8BF7\u8F93\u5165\u5408\u6CD5\u7AEF\u53E3(1-65535)", "err");
    if (pending.some((p) => p.op === "add" && p.port === port)) return toast("\u5F85\u5E94\u7528\u5DF2\u6709\u7AEF\u53E3 " + port, "err");
    if (tunnels.some((t) => t.port === port)) return toast("\u8FD0\u884C\u4E2D\u5DF2\u6709\u7AEF\u53E3 " + port, "err");
    const domain = mode === "fixed" ? domainInput.trim() : null;
    if (mode === "fixed" && !domain) return toast("\u8BF7\u586B\u5199\u4FDD\u7559\u57DF\u540D", "err");
    if (domain && (pending.some((p) => p.domain === domain) || tunnels.some((t) => t.domain === domain))) return toast("\u57DF\u540D " + domain + " \u5DF2\u88AB\u5360\u7528", "err");
    setPending((p) => [...p, { id: "p" + seqRef.current++, op: "add", port, domain }]);
    setPortInput("");
    toast("\u5DF2\u52A0\u5165: " + port + (domain ? " \xB7 " + domain : " \u968F\u673A"), "info");
  }
  function removePending(id) {
    setPending((p) => p.filter((x) => x.id !== id));
  }
  function stopTunnel(id) {
    const t = tunnels.find((x) => x.id === id);
    if (!t) return;
    setPending((p) => [...p, { id: "p" + seqRef.current++, op: "remove", targetId: id, port: t.port, name: t.name }]);
    toast(t.name + " \u6807\u8BB0\u505C\u6B62,\u5F85\u5E94\u7528", "warn");
  }
  async function applyPending() {
    if (!pending.length || applying) return;
    setApplying(true);
    try {
      for (const p of pending) {
        if (p.op === "add") {
          const r = await mgrFetch("/tunnels", { method: "POST", body: JSON.stringify({ port: p.port, domain: p.domain }) }, mgrPort);
          if (r.status >= 400) {
            toast("\u542F\u52A8 " + p.port + " \u5931\u8D25: " + (r.data?.error || ""), "err");
            break;
          }
        } else if (p.op === "remove" && p.targetId) {
          const r = await mgrFetch("/tunnels/" + p.targetId, { method: "DELETE" }, mgrPort);
          if (r.status >= 400) {
            toast("\u505C\u6B62\u5931\u8D25: " + (r.data?.error || ""), "err");
            break;
          }
        }
      }
      setPending([]);
      toast("\u5DF2\u5E94\u7528\u53D8\u66F4", "ok");
    } catch (e) {
      toast("\u5E94\u7528\u5931\u8D25: " + e.message, "err");
    } finally {
      setApplying(false);
    }
  }
  function discardPending() {
    setPending([]);
    toast("\u5DF2\u653E\u5F03\u5F85\u5E94\u7528", "info");
  }
  function stopAll() {
    tunnels.forEach((t) => setPending((p) => [...p, { id: "p" + seqRef.current++, op: "remove", targetId: t.id, port: t.port, name: t.name }]));
  }
  function copyUrl(url) {
    navigator.clipboard?.writeText(url).then(() => toast("\u5DF2\u590D\u5236: " + url, "ok"));
  }
  function openUrl(url) {
    const w = window;
    if (w.__TAURI__?.shell?.open) w.__TAURI__.shell.open(url);
    else if (w.__TAURI_INTERNALS__?.invoke) w.__TAURI_INTERNALS__.invoke("plugin:shell|open", { path: url }).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank");
    toast("\u6253\u5F00\u6D4F\u89C8\u5668: " + url, "info");
  }
  async function saveSettings(next) {
    const r = await mgrFetch("/config", { method: "PUT", body: JSON.stringify(next) }, mgrPort);
    if (r.data) {
      setCfg(r.data);
      if (r.data.defaultDomain) setDomainInput(r.data.defaultDomain);
    }
    setShowSettings(false);
    toast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58", "ok");
  }
  function fmtDur(ms) {
    const s = Math.floor(ms / 1e3);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    return m + "m" + s % 60 + "s";
  }
  const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
  const procStat = applying ? "warn" : health && tunnels.length > 0 ? "ok" : health ? "muted" : "err";
  const procText = applying ? "\u91CD\u542F\u4E2D\u2026" : health && tunnels.length > 0 ? `\u8FD0\u884C\u4E2D \xB7 ${tunnels.length} \u96A7\u9053` : health ? "\u672A\u8FD0\u884C" : "\u7BA1\u7406\u5668\u672A\u542F\u52A8";
  const preflightOk = health?.ngrokReady && health?.authTokenReady;
  const showPreflight = health && !preflightOk;
  return /* @__PURE__ */ jsxs("div", { className: "ngm-root", children: [
    /* @__PURE__ */ jsx("style", { children: STYLES }),
    /* @__PURE__ */ jsxs("div", { className: "ngm-topbar", children: [
      /* @__PURE__ */ jsxs("div", { className: "ngm-brand", children: [
        /* @__PURE__ */ jsx("span", { className: "ngm-logo", children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, children: /* @__PURE__ */ jsx("path", { d: "M3 12h4l3-9 4 18 3-9h4" }) }) }),
        /* @__PURE__ */ jsx("span", { children: "ngrok" }),
        /* @__PURE__ */ jsx("span", { className: "ngm-ver", children: "v2" })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: `ngm-stat ${procStat}`, children: [
        /* @__PURE__ */ jsx("span", { className: "d" }),
        /* @__PURE__ */ jsx("span", { children: procText })
      ] }),
      /* @__PURE__ */ jsx("span", { className: "ngm-spacer" }),
      /* @__PURE__ */ jsx("button", { className: "ngm-iconbtn", title: "\u5237\u65B0", onClick: () => {
        setTick((x) => x + 1);
      }, children: "\u21BB" }),
      /* @__PURE__ */ jsx("button", { className: "ngm-iconbtn", title: "\u8BBE\u7F6E", onClick: () => setShowSettings(true), children: "\u2699" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: `ngm-preflight ${showPreflight ? "" : "hide"}`, children: [
      /* @__PURE__ */ jsx("div", { className: "pt-title", children: "\u26A0 \u524D\u7F6E\u6761\u4EF6\u672A\u5C31\u7EEA" }),
      /* @__PURE__ */ jsxs("div", { className: `pt-item ${health?.ngrokReady ? "ok" : "fail"}`, children: [
        /* @__PURE__ */ jsx("span", { className: "ic", children: health?.ngrokReady ? "\u2713" : "\u2717" }),
        /* @__PURE__ */ jsxs("span", { className: "tx", children: [
          "ngrok \u53EF\u6267\u884C\u6587\u4EF6 ",
          health?.ngrokReady ? `(${health.ngrokPath})` : "\u672A\u627E\u5230",
          "\u3002\u8BF7\u5148\u5728\u7535\u8111\u5B89\u88C5 ngrok:",
          /* @__PURE__ */ jsx("code", { children: "https://ngrok.com/download" }),
          ",\u6216\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E ngrok.exe \u7EDD\u5BF9\u8DEF\u5F84\u3002"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: `pt-item ${health?.authTokenReady ? "ok" : "fail"}`, children: [
        /* @__PURE__ */ jsx("span", { className: "ic", children: health?.authTokenReady ? "\u2713" : "\u2717" }),
        /* @__PURE__ */ jsxs("span", { className: "tx", children: [
          "authtoken ",
          health?.authTokenReady ? `\u5DF2\u914D\u7F6E(${health.authTokenPath})` : "\u672A\u914D\u7F6E",
          "\u3002\u4ECE ",
          /* @__PURE__ */ jsx("code", { children: "https://dashboard.ngrok.com/get-started/your-authtoken" }),
          " \u83B7\u53D6,\u8FD0\u884C:",
          /* @__PURE__ */ jsx("code", { children: "ngrok config add-authtoken <token>" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "pt-actions", children: /* @__PURE__ */ jsx("button", { className: "ngm-btn g sm", onClick: () => setShowSettings(true), children: "\u6253\u5F00\u8BBE\u7F6E" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: `ngm-pendingbar ${pending.length ? "" : "hide"}`, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "\u25CF \u5F85\u5E94\u7528 ",
        pending.length,
        " \u9879",
        applying ? " (\u5E94\u7528\u4E2D\u2026)" : ""
      ] }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, opacity: 0.65, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: "\u5E94\u7528\u5C06\u91CD\u542F ngrok,\u4E2D\u65AD ~2-3s" }),
      /* @__PURE__ */ jsxs("div", { className: "acts", children: [
        /* @__PURE__ */ jsx("button", { className: "ngm-btn g sm", onClick: discardPending, children: "\u653E\u5F03" }),
        /* @__PURE__ */ jsx("button", { className: "ngm-btn w sm", disabled: applying, onClick: applyPending, children: "\u5E94\u7528" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ngm-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "ngm-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "ngm-cardhead", children: [
          "\u6DFB\u52A0\u96A7\u9053",
          /* @__PURE__ */ jsx("span", { className: "h", children: "\u6279\u91CF\u52A0\u5165 \xB7 \u4E00\u6B21\u5E94\u7528" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ngm-cardbody", children: [
          /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
            /* @__PURE__ */ jsxs("label", { children: [
              "\u672C\u5730\u7AEF\u53E3 ",
              /* @__PURE__ */ jsx("span", { className: "rq", children: "*" })
            ] }),
            /* @__PURE__ */ jsx("input", { className: "ngm-input", placeholder: "9820", inputMode: "numeric", value: portInput, onChange: (e) => setPortInput(e.target.value) }),
            /* @__PURE__ */ jsx("div", { className: "ngm-chips", style: { marginTop: 8 }, children: ["3000", "8080", "9820", "5173", "4173"].map((p) => /* @__PURE__ */ jsxs("button", { className: "ngm-chip", onClick: () => setPortInput(p), children: [
              ":",
              p
            ] }, p)) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
            /* @__PURE__ */ jsx("label", { children: "\u57DF\u540D\u6A21\u5F0F" }),
            /* @__PURE__ */ jsxs("div", { className: "ngm-seg", children: [
              /* @__PURE__ */ jsx("button", { className: mode === "random" ? "active" : "", onClick: () => setMode("random"), children: "\u968F\u673A" }),
              /* @__PURE__ */ jsx("button", { className: mode === "fixed" ? "active" : "", onClick: () => setMode("fixed"), children: "\u56FA\u5B9A\u57DF\u540D" })
            ] })
          ] }),
          mode === "fixed" && /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
            /* @__PURE__ */ jsx("label", { children: "\u4FDD\u7559\u57DF\u540D" }),
            /* @__PURE__ */ jsx("input", { className: "ngm-input", value: domainInput, onChange: (e) => setDomainInput(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxs("button", { className: "ngm-btn g blk", onClick: addPending, disabled: !health || !preflightOk, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 16, lineHeight: 0 }, children: "\uFF0B" }),
            "\xA0\u52A0\u5165\u5F85\u5E94\u7528"
          ] })
        ] })
      ] }),
      pending.length > 0 && /* @__PURE__ */ jsxs("div", { className: "ngm-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "ngm-cardhead", children: [
          "\u5F85\u5E94\u7528",
          /* @__PURE__ */ jsxs("span", { className: "h", children: [
            pending.length,
            " \u9879"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { children: pending.map((p) => /* @__PURE__ */ jsxs("div", { className: "ngm-ptunnel", children: [
          /* @__PURE__ */ jsx("span", { className: `pp ${p.op === "add" ? "pa" : "pr"}`, children: p.op === "add" ? "\uFF0B" : "\uFF0D" }),
          /* @__PURE__ */ jsx("span", { className: "pi", children: p.op === "add" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("span", { className: "pn", children: [
              ":",
              p.port
            ] }),
            " ",
            p.domain ? "\xB7 " + p.domain : "\xB7 \u968F\u673A"
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            "\u505C\u6B62 ",
            /* @__PURE__ */ jsx("span", { className: "pn", children: p.name }),
            " :",
            p.port
          ] }) }),
          /* @__PURE__ */ jsx("button", { className: "ngm-iconbtn", style: { width: 28, height: 28 }, onClick: () => removePending(p.id), children: "\u2715" })
        ] }, p.id)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ngm-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "ngm-cardhead", children: [
          "\u8FD0\u884C\u4E2D\u96A7\u9053",
          /* @__PURE__ */ jsxs("span", { className: "h", children: [
            tunnels.length,
            " \u6761"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { children: tunnels.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "ngm-empty", children: [
          /* @__PURE__ */ jsx("div", { className: "ill", children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, children: /* @__PURE__ */ jsx("path", { d: "M3 12h4l3-9 4 18 3-9h4" }) }) }),
          "\u5C1A\u65E0\u8FD0\u884C\u4E2D\u7684\u96A7\u9053",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("span", { style: { fontSize: 11, opacity: 0.7 }, children: !health ? "\u7BA1\u7406\u5668\u672A\u542F\u52A8" : !preflightOk ? "\u524D\u7F6E\u6761\u4EF6\u672A\u5C31\u7EEA" : '\u6DFB\u52A0\u96A7\u9053\u540E\u70B9\u51FB"\u5E94\u7528"' })
        ] }) : tunnels.map((t) => {
          const pill = t.status === "running" ? /* @__PURE__ */ jsxs("span", { className: "ngm-pill live", children: [
            /* @__PURE__ */ jsx("span", { className: "d" }),
            "RUNNING"
          ] }) : t.status === "starting" ? /* @__PURE__ */ jsxs("span", { className: "ngm-pill starting", children: [
            /* @__PURE__ */ jsx("span", { className: "d" }),
            "STARTING"
          ] }) : /* @__PURE__ */ jsxs("span", { className: "ngm-pill error", children: [
            /* @__PURE__ */ jsx("span", { className: "d" }),
            (t.status || "ERROR").toUpperCase()
          ] });
          const dur = t.status === "running" ? fmtDur(Date.now() - t.startedAt) : "-";
          const canAct = t.status === "running" || t.status === "starting";
          return /* @__PURE__ */ jsxs("div", { className: `ngm-tunnel s-${t.status}`, children: [
            /* @__PURE__ */ jsxs("div", { className: "ngm-th", children: [
              /* @__PURE__ */ jsx("span", { className: "ngm-tnm", children: t.name }),
              /* @__PURE__ */ jsx("span", { className: `ngm-turl ${t.publicUrl ? "" : "ph"}`, onClick: () => t.publicUrl && copyUrl(t.publicUrl), children: t.publicUrl || "\u7B49\u5F85\u5206\u914D URL\u2026" }),
              pill
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "ngm-tmeta", children: [
              /* @__PURE__ */ jsxs("span", { children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "\u672C\u5730" }),
                "localhost:",
                t.port
              ] }),
              /* @__PURE__ */ jsxs("span", { children: [
                /* @__PURE__ */ jsx("span", { className: "k", children: "\u65F6\u957F" }),
                dur
              ] }),
              /* @__PURE__ */ jsx("span", { className: "ngm-pill plain", children: t.domain ? "\u56FA\u5B9A" : "\u968F\u673A" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "ngm-tacts", children: [
              /* @__PURE__ */ jsx("button", { className: "ngm-btn g", disabled: !t.publicUrl, onClick: () => t.publicUrl && copyUrl(t.publicUrl), children: "\u590D\u5236" }),
              /* @__PURE__ */ jsx("button", { className: "ngm-btn g", disabled: !t.publicUrl, onClick: () => t.publicUrl && openUrl(t.publicUrl), children: "\u6253\u5F00" }),
              /* @__PURE__ */ jsx("button", { className: "ngm-btn d", disabled: !canAct, onClick: () => stopTunnel(t.id), children: "\u505C\u6B62" })
            ] })
          ] }, t.id);
        }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ngm-card", children: /* @__PURE__ */ jsxs("details", { className: "ngm-details", children: [
        /* @__PURE__ */ jsx("summary", { children: /* @__PURE__ */ jsxs("div", { className: "ngm-cardhead", style: { padding: 0, border: "none" }, children: [
          /* @__PURE__ */ jsx("span", { className: "ngm-chev", children: "\u25B8" }),
          " \u65E5\u5FD7",
          /* @__PURE__ */ jsxs("span", { className: "h", children: [
            logs.length,
            " \u884C"
          ] })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "ngm-logs", children: [
          logs.length === 0 ? /* @__PURE__ */ jsx("div", { className: "ngm-logline info", children: "// \u542F\u52A8\u96A7\u9053\u540E\u6B64\u5904\u663E\u793A ngrok JSON \u65E5\u5FD7" }) : logs.slice(-60).map((l, i) => {
            const cls = l.lvl === "eror" || l.lvl === "error" ? "error" : l.lvl === "warn" ? "warn" : l.url ? "url" : "info";
            return /* @__PURE__ */ jsxs("div", { className: `ngm-logline ${cls}`, children: [
              l.t || nowIso(),
              " ",
              l.lvl,
              l.obj ? " [" + l.obj + "]" : "",
              l.name ? " " + l.name : "",
              " ",
              l.msg || "",
              l.addr ? "  addr=" + l.addr : "",
              l.url ? "  url=" + l.url : ""
            ] }, i);
          }),
          /* @__PURE__ */ jsx("div", { ref: logsEndRef })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "ngm-hintbox", children: [
        "\u{1F4A1} ",
        /* @__PURE__ */ jsx("b", { children: "\u591A\u96A7\u9053\u539F\u7406" }),
        ':free \u8BA1\u5212\u9650\u5236 session \u6570=1,\u5355\u8FDB\u7A0B\u5185\u53EF\u542F\u591A\u6761\u96A7\u9053\u5171\u4EAB session\u3001\u5404\u81EA\u72EC\u7ACB URL\u3002\u589E\u5220\u9700\u91CD\u542F\u8FDB\u7A0B,\u671F\u95F4\u6240\u6709\u96A7\u9053\u77ED\u6682\u4E2D\u65AD,\u6545\u91C7\u7528"\u6279\u91CF\u7F16\u8F91 + \u4E00\u6B21\u5E94\u7528"\u3002'
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: `ngm-bottombar ${pending.length ? "" : "hide"}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "ci", children: [
        "\u5F85\u5E94\u7528 ",
        /* @__PURE__ */ jsx("b", { children: pending.length }),
        " \u9879 \xB7 \u5E94\u7528\u5C06\u91CD\u542F ngrok"
      ] }),
      /* @__PURE__ */ jsx("button", { className: "ngm-btn g sm", onClick: discardPending, children: "\u653E\u5F03" }),
      /* @__PURE__ */ jsx("button", { className: "ngm-btn w", style: { minWidth: 96 }, disabled: applying, onClick: applyPending, children: applying ? "\u5E94\u7528\u4E2D\u2026" : "\u5E94\u7528\u53D8\u66F4" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: `ngm-overlay ${showSettings ? "show" : ""}`, onClick: (e) => {
      if (e.target === e.currentTarget) setShowSettings(false);
    }, children: /* @__PURE__ */ jsx(SettingsSheet, { cfg, onSave: saveSettings, onClose: () => setShowSettings(false) }) }),
    /* @__PURE__ */ jsx("div", { className: "ngm-toastwrap", children: toasts.map((t) => /* @__PURE__ */ jsx("div", { className: `ngm-toast ${t.type}`, children: t.msg }, t.id)) })
  ] });
}
function SettingsSheet({ cfg, onSave, onClose }) {
  const [form, setForm] = useState({ ...cfg });
  return /* @__PURE__ */ jsxs("div", { className: "ngm-sheet", children: [
    /* @__PURE__ */ jsx("div", { className: "ngm-grip" }),
    /* @__PURE__ */ jsx("div", { className: "ngm-sheethead", children: "\u2699 \u8BBE\u7F6E" }),
    /* @__PURE__ */ jsxs("div", { className: "ngm-sheetbody", children: [
      /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "ngrok.exe \u8DEF\u5F84" }),
        /* @__PURE__ */ jsx("input", { className: "ngm-input", value: form.ngrokPath, onChange: (e) => setForm({ ...form, ngrokPath: e.target.value }), placeholder: "ngrok (PATH) \u6216\u7EDD\u5BF9\u8DEF\u5F84" }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-3)", marginTop: 4 }, children: [
          "\u9ED8\u8BA4\u4ECE PATH \u67E5\u627E ",
          /* @__PURE__ */ jsx("code", { children: "ngrok" }),
          ";\u586B\u7EDD\u5BF9\u8DEF\u5F84\u5982 ",
          /* @__PURE__ */ jsx("code", { children: "D:\\app\\ngrok-v3-stable-windows-amd64\\ngrok.exe" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "\u9ED8\u8BA4\u4FDD\u7559\u57DF\u540D" }),
        /* @__PURE__ */ jsx("input", { className: "ngm-input", value: form.defaultDomain, onChange: (e) => setForm({ ...form, defaultDomain: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "\u7BA1\u7406\u5668\u7AEF\u53E3" }),
        /* @__PURE__ */ jsx("input", { className: "ngm-input", inputMode: "numeric", value: String(form.mgrPort), onChange: (e) => setForm({ ...form, mgrPort: parseInt(e.target.value, 10) || 9870 }) }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "var(--text-3)", marginTop: 4 }, children: "\u88AB\u5360\u7528\u65F6\u81EA\u52A8 +1,\u5B9E\u9645\u7AEF\u53E3\u5199\u5165 .port" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "ngm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "authtoken" }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "var(--text-3)", lineHeight: 1.7 }, children: [
          "\u63D2\u4EF6\u4E0D\u5B58\u50A8\u51ED\u8BC1\u3002\u9700\u5148\u5728\u7535\u8111\u8FD0\u884C:",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("code", { style: { fontFamily: "var(--mono)", background: "var(--bg-3)", padding: "1px 5px", borderRadius: 3 }, children: "ngrok config add-authtoken <token>" }),
          /* @__PURE__ */ jsx("br", {}),
          "\u4ECE ",
          /* @__PURE__ */ jsx("code", { style: { fontFamily: "var(--mono)", background: "var(--bg-3)", padding: "1px 5px", borderRadius: 3 }, children: "dashboard.ngrok.com/get-started/your-authtoken" }),
          " \u83B7\u53D6"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ngm-sheetfoot", children: [
      /* @__PURE__ */ jsx("button", { className: "ngm-btn g ico", onClick: onClose, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ jsx("button", { className: "ngm-btn p ico", onClick: () => onSave(form), children: "\u4FDD\u5B58" })
    ] })
  ] });
}
export {
  NgrokManagerPanel as default
};
