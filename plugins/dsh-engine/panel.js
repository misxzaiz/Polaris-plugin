/**
 * DSH Web UI 面板组件
 *
 * 自包含 ES module，仅依赖 react（被 Polaris 的 ModuleLoader shim 处理）。
 * 嵌入 DSH Web UI 的 iframe 面板。
 */

import React, { useState, useEffect, useCallback } from "react";

const DEFAULT_DSH_URL =
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("dshUrl")) ||
  "http://127.0.0.1:3080";

const HEALTH_CHECK_INTERVAL = 5000;
const MAX_RECONNECT = 30;

async function checkHealth(url) {
  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export default function DSHPanel({ pluginId, onSendToChat }) {
  const [dshUrl, setDshUrl] = useState(DEFAULT_DSH_URL);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    const check = async () => {
      if (cancelled) return;
      const alive = await checkHealth(dshUrl);
      if (cancelled) return;

      if (alive) {
        setConnected(true);
        setConnecting(false);
        setError(null);
        retries = 0;
      } else {
        retries++;
        setRetryCount(retries);
        if (retries >= MAX_RECONNECT) {
          setError(
            `等待 DSH Web 就绪超时（${MAX_RECONNECT} 次重试）\n请确保 dsh web 已启动：dsh --profile web`
          );
          setConnecting(false);
          return;
        }
        setConnected(false);
        if (retries === 1) setConnecting(true);
      }
      setTimeout(check, HEALTH_CHECK_INTERVAL);
    };
    check();
    return () => { cancelled = true; };
  }, [dshUrl]);

  const toggleExpand = useCallback(() => setExpanded((p) => !p), []);

  const containerStyle = expanded
    ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: "#fff" }
    : { width: "100%", height: "100%", display: "flex", flexDirection: "column" };

  if (connecting) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px", padding: "24px", color: "#666", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#0070f3", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 14, textAlign: "center" }}>
          <div>正在连接 DSH Web...</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{dshUrl}{retryCount > 0 && ` (第 ${retryCount} 次重试)`}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px", padding: "24px", color: "#d32f2f", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 14, textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.5 }}>{error}</div>
        <button onClick={() => { setError(null); setConnecting(true); setRetryCount(0); }}
          style={{ padding: "8px 20px", border: "1px solid #d32f2f", borderRadius: 6, background: "#fff", color: "#d32f2f", cursor: "pointer", fontSize: 13 }}>重试</button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", borderBottom: "1px solid #e0e0e0", backgroundColor: "#fafafa", flexShrink: 0, fontSize: 12, color: "#666", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: connected ? "#4caf50" : "#ccc", display: "inline-block" }} />
          <span>DSH 工作区</span>
          <span style={{ color: "#999", fontSize: 11 }}>{dshUrl}</span>
        </div>
        <button onClick={toggleExpand} style={{ padding: "2px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 11, color: "#666" }} title={expanded ? "退出全屏" : "全屏"}>{expanded ? "⊠" : "⊡"}</button>
      </div>
      <iframe src={dshUrl} style={{ width: "100%", flex: 1, border: "none" }} title="DeepSeek Harness" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="clipboard-write; clipboard-read" />
      <div style={{ display: "flex", alignItems: "center", padding: "2px 8px", borderTop: "1px solid #e0e0e0", backgroundColor: "#fafafa", flexShrink: 0, fontSize: 11, color: "#999", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <span>DSH {pluginId}</span><span style={{ margin: "0 8px" }}>|</span>
        <span>{connected ? "🟢 已连接" : "🔴 未连接"}</span><span style={{ margin: "0 8px" }}>|</span>
        <span style={{ textDecoration: "none", color: "#0070f3", cursor: "pointer" }} onClick={() => { const u = prompt("DSH Web 地址:", dshUrl); if (u) setDshUrl(u); }}>修改地址</span>
      </div>
    </div>
  );
}