// src/Panel.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var LOCAL_BASE = "http://127.0.0.1:9862";
function getHostInvoke() {
  const win = window;
  if (!win.__POLARIS_HOST_INVOKE__) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981 __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return win.__POLARIS_HOST_INVOKE__;
}
async function fetchViaHost(url) {
  const res = await getHostInvoke()(
    "router_dispatch",
    {
      req: {
        target: "cap.http",
        payload: { action: "request", method: "GET", url }
      }
    }
  );
  if (!res.ok) throw new Error(res.error || "cap.http \u8F6C\u53D1\u5931\u8D25");
  const body = String(res.result?.body ?? "");
  return JSON.parse(body || "{}");
}
async function postViaHost(url, bodyObj) {
  const res = await getHostInvoke()(
    "router_dispatch",
    {
      req: {
        target: "cap.http",
        payload: {
          action: "request",
          method: "POST",
          url,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
          bodyType: "json"
        }
      }
    }
  );
  if (!res.ok) throw new Error(res.error || "cap.http POST \u8F6C\u53D1\u5931\u8D25");
  const body = String(res.result?.body ?? "");
  return JSON.parse(body || "{}");
}
function timeAgo(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return ts || "";
  const diff = Date.now() - n;
  const min = Math.floor(diff / 6e4);
  if (min < 1) return "\u521A\u521A";
  if (min < 60) return `${min} \u5206\u949F\u524D`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} \u5C0F\u65F6\u524D`;
  return `${Math.floor(h / 24)} \u5929\u524D`;
}
function titleOf(s, idx) {
  const t = (s.title || "").trim();
  if (t) return t.length > 28 ? t.slice(0, 28) + "\u2026" : t;
  return idx != null ? `(\u65B0\u5BF9\u8BDD ${idx + 1})` : "(\u65E0\u6807\u9898\u4F1A\u8BDD)";
}
function assembleAssistantFromText(text) {
  return {
    id: "streaming-" + Date.now(),
    role: "assistant",
    timeCreated: String(Date.now()),
    parts: [{ id: "streaming-part", type: "text", text, reasoning: "" }]
  };
}
function shortWs(p) {
  if (!p) return "\u672A\u6307\u5B9A";
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 2 ? "\u2026/" + parts.slice(-2).join("/") : p;
}
function Panel({ pluginId, onSendToChat }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(20);
  const [query, setQuery] = useState("");
  const [activeSid, setActiveSid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const cursorRef = useRef(-1);
  const cmdSeqRef = useRef(0);
  const streamRef = useRef("");
  const [workspaces, setWorkspaces] = useState([]);
  const [workspace, setWorkspace] = useState("");
  const [modelInfo, setModelInfo] = useState(null);
  const [hostUp, setHostUp] = useState(null);
  const load = useCallback(async (lim = limit) => {
    setLoading(true);
    setError("");
    try {
      const wsData = await fetchViaHost(`${LOCAL_BASE}/api/workspaces`);
      if (wsData.ok) setWorkspaces(Array.isArray(wsData.workspaces) ? wsData.workspaces : []);
      const data = await fetchViaHost(`${LOCAL_BASE}/api/sessions?limit=${lim}`);
      if (!data.ok) throw new Error(data.error || "\u670D\u52A1\u8FD4\u56DE\u5F02\u5E38");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setHostUp(true);
    } catch (e) {
      setError(`\u65E0\u6CD5\u8BFB\u53D6 ZCode \u4F1A\u8BDD\uFF1A${String(e?.message || e)}`);
      setHostUp(false);
    } finally {
      setLoading(false);
    }
  }, [limit]);
  useEffect(() => {
    load(limit);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => {
      fetchViaHost(`${LOCAL_BASE}/__health`).then(() => setHostUp(true)).catch(() => setHostUp(false));
    }, 15e3);
    return () => clearInterval(t);
  }, []);
  const openSession = useCallback(async (sid) => {
    setActiveSid(sid);
    setError("");
    setMsgs([]);
    setStreamingText("");
    streamRef.current = "";
    cursorRef.current = -1;
    setModelInfo(null);
    try {
      const data = await fetchViaHost(`${LOCAL_BASE}/api/session/${sid}/msgs`);
      if (!data.ok) throw new Error(data.error || "\u8BFB\u53D6\u5386\u53F2\u5931\u8D25");
      setMsgs(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setError(`\u8BFB\u53D6\u4F1A\u8BDD\u5386\u53F2\u5931\u8D25\uFF1A${String(e?.message || e)}`);
    }
  }, []);
  const reloadMessages = useCallback(async (sid) => {
    try {
      const data = await fetchViaHost(`${LOCAL_BASE}/api/session/${sid}/msgs`);
      if (!data.ok) return;
      const arr = Array.isArray(data.messages) ? data.messages : [];
      if (arr.length) setMsgs(arr);
    } catch {
    }
  }, []);
  const newSession = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const data = await postViaHost(`${LOCAL_BASE}/api/chat/create`, { workspacePath: workspace });
      if (!data.ok) throw new Error(data.error || "\u521B\u5EFA\u5931\u8D25");
      setActiveSid(data.sessionId);
      setMsgs([]);
      setStreamingText("");
      setModelInfo(null);
      cursorRef.current = -1;
      await load();
    } catch (e) {
      setError(`\u65B0\u5BF9\u8BDD\u5931\u8D25\uFF1A${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }, [load, workspace]);
  const loadModelInfo = useCallback(async (sid) => {
    try {
      const data = await fetchViaHost(`${LOCAL_BASE}/api/chat/model?sessionId=${encodeURIComponent(sid)}`);
      if (data.ok && data.model) setModelInfo(data.model);
    } catch {
    }
  }, []);
  const send = useCallback(async () => {
    const sid = activeSid;
    const text = input.trim();
    if (!sid || !text || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    setStreamingText("");
    streamRef.current = "";
    setMsgs((prev) => [...prev, {
      id: "user-" + Date.now(),
      role: "user",
      timeCreated: String(Date.now()),
      parts: [{ id: "user-part", type: "text", text, reasoning: "" }]
    }]);
    const cmd = ++cmdSeqRef.current;
    try {
      const data = await postViaHost(`${LOCAL_BASE}/api/chat/send`, { sessionId: sid, content: text, workspacePath: workspace });
      if (!data.ok) throw new Error(data.error || "\u53D1\u9001\u5931\u8D25");
      if (data.cursor != null) cursorRef.current = data.cursor;
      let done = false;
      let waited = 0;
      while (!done) {
        if (cmd !== cmdSeqRef.current) return;
        if (waited > 9e4) {
          setError("\u7B49\u5F85\u6A21\u578B\u56DE\u590D\u8D85\u65F6\u3002\u53EF\u70B9\u300C\u53D1\u9001\u300D\u91CD\u8BD5\u7EE7\u7EED\u3002");
          return;
        }
        const evData = await fetchViaHost(`${LOCAL_BASE}/api/chat/events?sessionId=${encodeURIComponent(sid)}&cursor=${cursorRef.current}`);
        if (!evData.ok) throw new Error(evData.error || "\u62C9\u53D6\u4E8B\u4EF6\u5931\u8D25");
        if (evData.cursor != null) cursorRef.current = evData.cursor;
        const events = evData.events || [];
        let hitComplete = false;
        for (const e of events) {
          const pal = e.payload || {};
          if (e.kind === "text-delta" || e.kind === "text-final") {
            const d = pal.delta || "";
            streamRef.current += d;
            setStreamingText(streamRef.current);
          } else if (e.kind === "turn-complete") {
            hitComplete = true;
          }
        }
        done = hitComplete;
        if (!done) {
          waited += 500;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      const final = streamRef.current;
      setStreamingText("");
      streamRef.current = "";
      if (final.trim()) {
        setMsgs((prev) => [...prev, assembleAssistantFromText(final)]);
      }
      loadModelInfo(sid);
      reloadMessages(sid);
      await load();
    } catch (e) {
      setStreamingText("");
      streamRef.current = "";
      setError(`\u53D1\u9001\u5931\u8D25\uFF1A${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }, [activeSid, input, busy, load, workspace, loadModelInfo, reloadMessages]);
  const back = useCallback(() => {
    setActiveSid(null);
    setMsgs([]);
    setInput("");
    setStreamingText("");
    setError("");
    setModelInfo(null);
    cursorRef.current = -1;
    load();
  }, [load]);
  if (activeSid) {
    const chatMsgs = [...msgs];
    if (streamingText.trim()) {
      chatMsgs.push(assembleAssistantFromText(streamingText));
    }
    const activeSession = sessions.find((s) => s.sessionId === activeSid);
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #2E2E33", flexShrink: 0 }, children: [
        /* @__PURE__ */ jsx("button", { onClick: back, style: btnStyle(), children: "\u2190 \u5217\u8868" }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: activeSession?.title || "ZCode \u5BF9\u8BDD" }),
        /* @__PURE__ */ jsx("button", { onClick: () => load(), style: btnStyle(), disabled: loading, children: loading ? "\u2026" : "\u5237\u65B0" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid #2E2E33", flexShrink: 0, fontSize: 11, color: "#D4D4D8", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs("span", { style: chipStyle(), children: [
          "\u{1F4C1} ",
          shortWs(activeSession?.directory || workspace)
        ] }),
        /* @__PURE__ */ jsx("span", { style: chipStyle(), children: modelInfo?.modelId ? `\u2699 ${modelInfo.modelId}${modelInfo.providerId ? ` \xB7 ${modelInfo.providerId}` : ""}` : "\u2699 \u6A21\u578B\u7531 ZCode \u51B3\u5B9A" })
      ] }),
      error && /* @__PURE__ */ jsx("div", { style: { padding: "6px 12px", background: "rgba(248,113,113,0.15)", color: "#F87171", fontSize: 11, borderBottom: "1px solid #2E2E33" }, children: error }),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }, children: [
        msgs.length === 0 && !streamingText && /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", fontSize: 12, textAlign: "center", marginTop: 40 }, children: "\u5F00\u59CB\u5BF9\u8BDD\u5427\u3002\u53D1\u9001\u7B2C\u4E00\u6761\u6D88\u606F\u3002" }),
        chatMsgs.map((m, i) => /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }, children: /* @__PURE__ */ jsxs("div", { style: {
          maxWidth: "88%",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #3F3F46",
          background: m.role === "user" ? "#1E3A5F" : "#25252B",
          color: "#F8F8F8",
          fontSize: 13,
          lineHeight: 1.5,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap"
        }, children: [
          m.parts?.map(
            (p) => p.type === "reasoning" ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", fontSize: 11, marginBottom: 4 }, children: p.reasoning }, p.id) : /* @__PURE__ */ jsx("div", { children: p.text }, p.id)
          ),
          (!m.parts || m.parts.length === 0) && /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93" }, children: "\uFF08\u65E0\u6587\u672C\uFF09" })
        ] }) }, m.id || i)),
        busy && !streamingText && /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", fontSize: 11, alignSelf: "flex-start" }, children: /* @__PURE__ */ jsx("span", { children: "\u6B63\u5728\u601D\u8003\u2026" }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #2E2E33", flexShrink: 0 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: input,
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            },
            placeholder: busy ? "\u7B49\u5F85\u56DE\u590D\u2026" : "\u8F93\u5165\u6D88\u606F\u2026",
            disabled: busy,
            style: {
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #3F3F46",
              background: "#1C1C20",
              color: "#F8F8F8",
              fontSize: 13,
              outline: "none",
              minWidth: 0
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { onClick: send, disabled: busy || !input.trim(), style: btnStyle({ fontSize: 13, background: "#2D5FAB", borderColor: "#2D5FAB", color: "#fff" }), children: busy ? "\u2026" : "\u53D1\u9001" })
      ] })
    ] });
  }
  const filtered = query.trim() ? sessions.filter((s) => (s.title + " " + s.directory).toLowerCase().includes(query.trim().toLowerCase())) : sessions;
  return /* @__PURE__ */ jsxs("div", { style: { padding: 12, display: "flex", flexDirection: "column", height: "100%", gap: 10, overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
      /* @__PURE__ */ jsx("h3", { style: { margin: 0, fontSize: 13, fontWeight: 600 }, children: "ZCode \u4F1A\u8BDD" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx("button", { onClick: () => load(), style: btnStyle(), disabled: loading, children: loading ? "\u2026" : "\u5237\u65B0" }),
        /* @__PURE__ */ jsx("button", { onClick: newSession, disabled: busy, style: btnStyle({ background: "#2D5FAB", borderColor: "#2D5FAB", color: "#fff" }), children: "+ \u65B0\u5BF9\u8BDD" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: workspace,
          onChange: (e) => setWorkspace(e.target.value),
          style: {
            flex: 1,
            minWidth: 140,
            padding: "5px 6px",
            borderRadius: 6,
            border: "1px solid #3F3F46",
            background: "#25252B",
            color: "#F8F8F8",
            fontSize: 12,
            outline: "none"
          },
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "\u5168\u90E8\u5DE5\u4F5C\u533A" }),
            workspaces.map((w) => /* @__PURE__ */ jsx("option", { value: w, children: w }, w))
          ]
        }
      ),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: hostUp === false ? "#F87171" : "#6BAF8D", whiteSpace: "nowrap" }, children: hostUp === false ? "\u25CF \u672A\u8FDE\u63A5" : "\u25CF \u5DF2\u8FDE\u63A5" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8E8E93" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: "\u{1F50D} \u641C\u7D22\u4F1A\u8BDD\u2026",
          style: {
            flex: 1,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #3F3F46",
            background: "#25252B",
            color: "#F8F8F8",
            fontSize: 11,
            outline: "none",
            minWidth: 0
          }
        }
      ),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          min: 5,
          max: 50,
          value: limit,
          onChange: (e) => setLimit(Math.max(5, Math.min(50, Number(e.target.value) || 20))),
          style: { width: 48, padding: "2px 4px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11 }
        }
      ),
      "\u6761"
    ] }),
    hostUp === false && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, background: "rgba(248,113,113,0.15)", padding: "6px 10px", borderRadius: 6, fontSize: 11, color: "#F87171" }, children: [
      /* @__PURE__ */ jsx("span", { style: { flex: 1 }, children: "ZCode \u670D\u52A1\u672A\u8FDE\u63A5" }),
      /* @__PURE__ */ jsx("button", { onClick: () => load(), style: btnStyle(), children: "\u91CD\u8BD5" })
    ] }),
    error && /* @__PURE__ */ jsx("div", { style: { color: "#F87171", fontSize: 11 }, children: error }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }, children: [
      !loading && filtered.length === 0 && !error && /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", fontSize: 12 }, children: query ? "\u65E0\u5339\u914D\u4F1A\u8BDD\u3002" : "\u6682\u65E0\u4F1A\u8BDD\u3002\u70B9\u300C+ \u65B0\u5BF9\u8BDD\u300D\u5F00\u59CB\u3002" }),
      filtered.map((s, i) => /* @__PURE__ */ jsxs(
        "div",
        {
          onClick: () => openSession(s.sessionId),
          style: { ...cardStyle(), cursor: "pointer", userSelect: "none" },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [
              /* @__PURE__ */ jsx("span", { style: { fontSize: 12, fontWeight: 500, color: "#F8F8F8", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: titleOf(s, i) }),
              /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#8E8E93", whiteSpace: "nowrap" }, children: timeAgo(s.timeUpdated) })
            ] }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#8E8E93", fontFamily: "monospace", marginTop: 2 }, children: s.sessionId.slice(0, 24) }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6BAF8D", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: [
              "\u{1F4C1} ",
              s.directory ? shortWs(s.directory) : "(\u65E0 directory)"
            ] })
          ]
        },
        s.sessionId
      ))
    ] })
  ] });
}
function chipStyle() {
  return {
    padding: "2px 8px",
    borderRadius: 10,
    background: "#2E2E33",
    border: "1px solid #3F3F46",
    color: "#B4B4B8",
    fontSize: 10,
    whiteSpace: "nowrap"
  };
}
function cardStyle() {
  return {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #3F3F46",
    background: "#25252B",
    display: "flex",
    flexDirection: "column",
    gap: 2
  };
}
function btnStyle(extra = {}) {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #3F3F46",
    background: "#2D2D33",
    color: "#B4B4B8",
    fontSize: 11,
    cursor: "pointer",
    ...extra
  };
}
export {
  Panel as default
};
