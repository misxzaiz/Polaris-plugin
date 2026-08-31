// src/Panel.tsx
import { createElement as h, useEffect, useState, useCallback } from "react";
var BASE_PORT = 52311;
var PORT_RANGE = 32;
async function probePorts() {
  for (let p = BASE_PORT; p < BASE_PORT + PORT_RANGE; p++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/status`, { method: "GET", cache: "no-cache" });
      if (r.ok) return p;
    } catch {
    }
  }
  return null;
}
function ScreenSleepPanel() {
  const [port, setPort] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [lastOff, setLastOff] = useState(null);
  const [nativeOk, setNativeOk] = useState(false);
  const discover = useCallback(async () => {
    const p = await probePorts();
    if (p && !port) setPort(p);
  }, [port, setPort]);
  useEffect(() => {
    discover();
    const id = setInterval(discover, 2e3);
    return () => clearInterval(id);
  }, [discover]);
  const fetchStatus = useCallback(async (p) => {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/status`, { cache: "no-cache" });
      if (!r.ok) return;
      const j = await r.json();
      if (j.ok) {
        setNativeOk(Boolean(j.nativeExists));
        setLastOff(j.lastOffAt || null);
      }
    } catch {
    }
  }, []);
  useEffect(() => {
    if (!port) return;
    fetchStatus(port);
    const id = setInterval(() => fetchStatus(port), 1e4);
    return () => clearInterval(id);
  }, [port, fetchStatus]);
  const handleOff = useCallback(async () => {
    if (!port || loading) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`http://127.0.0.1:${port}/off`, { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setMsg("\u5C4F\u5E55\u5DF2\u7184\u706D \xB7 \u52A8\u9F20\u6807\u6216\u6309\u952E\u53EF\u5524\u56DE");
        setLastOff((/* @__PURE__ */ new Date()).toISOString());
      } else {
        setMsg("\u7184\u5C4F\u5931\u8D25\uFF1A" + (j.error || "\u672A\u77E5"));
      }
    } catch (e) {
      setMsg("\u65E0\u6CD5\u8FDE\u63A5\u672C\u5730\u670D\u52A1\uFF1A" + e.message);
    } finally {
      setLoading(false);
    }
  }, [port, loading]);
  const statusLine = () => {
    if (!port) return "\u7B49\u5F85\u672C\u5730\u670D\u52A1\u2026";
    if (!nativeOk) return "\u26A0 \u672A\u627E\u5230\u7184\u5C4F\u7A0B\u5E8F";
    if (msg) return msg;
    if (lastOff) {
      const d = new Date(lastOff);
      const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return "\u4E0A\u6B21\u7184\u5C4F " + t;
    }
    return "\u5C31\u7EEA";
  };
  return h(
    "div",
    { className: panelCls + " flex h-full flex-col items-center justify-center bg-background font-mono text-text" },
    h("div", { className: "mb-2 text-[11px] tracking-wider text-text-muted" }, "\u5C4F\u5E55\u7761\u7720"),
    h("div", { className: "mb-6 text-4xl" }, "\u{1F311}"),
    h("button", {
      className: btnCls + (loading ? " loading" : "") + (!port || !nativeOk ? " disabled" : ""),
      onClick: handleOff,
      disabled: loading || !port || !nativeOk
    }, loading ? "\u7184\u5C4F\u4E2D\u2026" : "\u7184\u706D\u5C4F\u5E55"),
    h("div", { className: "mt-4 px-6 text-center text-[11px] text-text-muted" }, statusLine()),
    h("div", { className: "mt-2 text-[10px] text-text-muted opacity-70" }, "\u79FB\u52A8\u9F20\u6807\u6216\u6309\u4EFB\u610F\u952E\u5373\u53EF\u6062\u590D")
  );
}
var panelCls = "px-4 select-none";
var btnCls = "rounded-xl border border-border bg-background-elevated px-10 py-5 text-lg font-bold transition-all hover:border-accent hover:bg-background hover:text-text-active active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
export {
  ScreenSleepPanel as default
};
