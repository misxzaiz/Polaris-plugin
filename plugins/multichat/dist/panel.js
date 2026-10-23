// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";

// src/types.ts
function hostWindow() {
  return window;
}
var SESSION_PREFIX = "mc-";
var KV_PREFIX = "multichat.session.";

// src/host.ts
function invokeHost(cmd, args) {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    return Promise.reject(new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__"));
  }
  return invoke(cmd, args);
}
async function listenHost(event, cb) {
  const listen = hostWindow().__POLARIS_HOST_LISTEN__;
  if (!listen) {
    throw new Error("\u5BBF\u4E3B listen \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_LISTEN__");
  }
  return listen(event, cb);
}
function hasHostSupport() {
  return !!hostWindow().__POLARIS_HOST_INVOKE__ && !!hostWindow().__POLARIS_HOST_LISTEN__;
}

// src/cap.ts
var TARGET = "cap.ai.chat";
var KV_TARGET = "cap.kv";
var PLUGIN_ID = "multichat";
async function capDispatch(target, payload) {
  const res = await invokeHost("router_dispatch", {
    req: { target, payload }
  });
  if (!res?.ok) {
    throw new Error(res?.error || `${target} \u8C03\u7528\u5931\u8D25`);
  }
  return res.result;
}
async function sendChat(req) {
  try {
    const options = {
      workDir: req.workspaceId || null,
      contextId: `mc-${req.pluginSessionId}`
    };
    if (req.engineId) options.engineId = req.engineId;
    if (req.modelProfileId) options.modelProfileId = req.modelProfileId;
    const payload = {
      action: req.engineSessionId ? "continue" : "start",
      message: req.text,
      options
    };
    if (req.engineSessionId) payload.sessionId = req.engineSessionId;
    const ack = await invokeHost("router_dispatch_stream", {
      req: { target: TARGET, payload }
    });
    const engineSessionId = ack?.sessionId || req.engineSessionId || void 0;
    return { ok: true, engineSessionId };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
function kvKey(sessionId) {
  return `${KV_PREFIX}${sessionId}`;
}
async function kvGetMessages(sessionId) {
  try {
    const res = await capDispatch(KV_TARGET, {
      action: "get",
      key: kvKey(sessionId)
    });
    return res?.value ?? [];
  } catch {
    return [];
  }
}
async function kvSaveMessages(sessionId, msgs) {
  await capDispatch(KV_TARGET, { action: "set", key: kvKey(sessionId), value: msgs });
}
async function loadStore() {
  try {
    const raw = await invokeHost("plugin_get_config", {
      pluginId: PLUGIN_ID
    });
    return {
      sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
      defaults: {
        engineId: raw?.defaults?.engineId || "claude-code",
        workspaceId: raw?.defaults?.workspaceId || null,
        modelProfileId: raw?.defaults?.modelProfileId || null
      }
    };
  } catch {
    return { sessions: [], defaults: { engineId: "claude-code", workspaceId: null, modelProfileId: null } };
  }
}
async function saveStore(store) {
  await invokeHost("plugin_set_config", { pluginId: PLUGIN_ID, patch: store });
}
async function updateStore(fn) {
  const cur = await loadStore();
  const next = fn(cur);
  await saveStore(next);
  return next;
}
async function tryLockSession(sessionId, engineId) {
  try {
    await updateStore((store) => {
      const s = store.sessions.find((x) => x.id === sessionId);
      if (s) {
        if (s.status === "running") {
          throw new Error("\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\uFF08\u53E6\u4E00\u8BBE\u5907\u53EF\u80FD\u6B63\u5728\u53D1\u6D88\u606F\uFF09\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210");
        }
        s.status = "running";
        s.engineId = engineId;
        s.updatedAt = Date.now();
      }
      return store;
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
async function unlockSession(sessionId, delta) {
  await updateStore((store) => {
    const s = store.sessions.find((x) => x.id === sessionId);
    if (s) {
      s.status = "idle";
      s.updatedAt = Date.now();
      if (delta.preview) s.lastMessagePreview = delta.preview;
      if (delta.messageCount) s.messageCount = delta.messageCount;
    }
    return store;
  });
}

// src/stream.ts
var sharedListeners = null;
var unlistenGlobal = null;
var globalInitPromise = null;
function ensureGlobalListener() {
  if (unlistenGlobal) return Promise.resolve();
  if (globalInitPromise) return globalInitPromise;
  globalInitPromise = listenHost("chat-event", (env) => {
    try {
      const contextIdStr = env?.contextId;
      if (!contextIdStr || !contextIdStr.startsWith("mc-")) return;
      const pluginSessionId = contextIdStr.substring("mc-".length);
      const handlers = sharedListeners?.get(pluginSessionId);
      if (!handlers || handlers.size === 0) return;
      handlers.forEach((h) => {
        try {
          h(env);
        } catch {
        }
      });
    } catch {
    }
  }).then((unsub) => {
    unlistenGlobal = unsub;
    return;
  });
  return globalInitPromise;
}
async function subscribeSession(sessionId, sink) {
  await ensureGlobalListener();
  if (!sharedListeners) sharedListeners = /* @__PURE__ */ new Map();
  let set = sharedListeners.get(sessionId);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    sharedListeners.set(sessionId, set);
  }
  const handler = (env) => {
    const payload = env?.payload;
    if (!payload || typeof payload !== "object") return;
    const type = payload.type;
    const eventSessionId = payload.sessionId ?? sessionId;
    switch (type) {
      case "token": {
        const value = payload.value;
        if (value) sink.onStreamDelta(sessionId, value);
        break;
      }
      case "thinking": {
        const content = payload.content;
        if (content && sink.onThinkingDelta) sink.onThinkingDelta(sessionId, content);
        break;
      }
      case "assistant_message": {
        const content = payload.content;
        if (content && payload.isDelta) sink.onStreamDelta(sessionId, content);
        break;
      }
      case "session_end": {
        sink.onSessionEnd(sessionId, payload.reason ?? "completed");
        break;
      }
      case "error": {
        const msg = payload.content || payload.error || "\u672A\u77E5\u9519\u8BEF";
        sink.onError(sessionId, msg);
        break;
      }
      default:
        break;
    }
  };
  set.add(handler);
  return () => {
    const s = sharedListeners?.get(sessionId);
    if (s) {
      s.delete(handler);
      if (s.size === 0) sharedListeners?.delete(sessionId);
    }
  };
}

// src/store.ts
var state = {
  sessions: [],
  engineId: "claude-code",
  workspaceId: null,
  modelProfileId: null,
  loaded: false,
  loadingError: "",
  /** 打开会话 → 本端消息缓存 */
  messages: /* @__PURE__ */ new Map(),
  /** 发送中（running）的会话 */
  running: /* @__PURE__ */ new Set(),
  /** 订阅管理：sessionId → unsub */
  subs: /* @__PURE__ */ new Map()
};
var listeners = /* @__PURE__ */ new Set();
function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
    }
  });
}
function subscribeStore(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
async function initStore() {
  if (state.loaded) return;
  const store = await loadStore();
  state.sessions = store.sessions;
  state.engineId = store.defaults.engineId;
  state.workspaceId = store.defaults.workspaceId;
  state.modelProfileId = store.defaults.modelProfileId;
  state.loaded = true;
  for (const s of state.sessions) {
    if (s.status === "running") state.running.add(s.id);
  }
  notify();
}
function getSessions() {
  return state.sessions;
}
function getSession(id) {
  return state.sessions.find((s) => s.id === id);
}
function isRunning(id) {
  return state.running.has(id);
}
function getMessages(id) {
  return state.messages.get(id) ?? [];
}
function getEngineId() {
  return state.engineId;
}
async function createSession(title) {
  const now = Date.now();
  const meta = {
    id: `${SESSION_PREFIX}${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) + "-" + Date.now().toString(36) : Date.now().toString(36)}`,
    title: title.trim() || `\u4F1A\u8BDD ${state.sessions.length + 1}`,
    engineId: state.engineId,
    workspaceId: state.workspaceId,
    modelProfileId: state.modelProfileId,
    status: "idle",
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: "",
    engineSessionId: null,
    messageCount: 0
  };
  await saveStore({ sessions: [...state.sessions, meta], defaults: storeDefaults() });
  state.sessions = [...state.sessions, meta];
  state.messages.set(meta.id, []);
  notify();
  return meta;
}
async function persistMessages(id) {
  const msgs = state.messages.get(id) ?? [];
  await kvSaveMessages(id, msgs);
}
async function openSession(id) {
  if (state.subs.has(id)) return;
  const cached = await kvGetMessages(id);
  state.messages.set(id, cached);
  notify();
  const unsub = await subscribeSession(id, {
    onStreamDelta: (sid, text) => {
      const list = state.messages.get(sid);
      if (!list) return;
      const last = list[list.length - 1];
      if (last?.streaming) {
        last.text += text;
      } else {
        list.push({ role: "assistant", text, ts: Date.now(), streaming: true });
      }
      notify();
    },
    onThinkingDelta: (_sid, _text) => {
    },
    onSessionEnd: (sid, reason) => {
      const list = state.messages.get(sid);
      if (list) {
        const last = list[list.length - 1];
        if (last?.streaming) {
          last.streaming = false;
          last.ts = Date.now();
        }
      }
      state.running.delete(sid);
      void unlockSession(sid, { messageCount: list?.length ?? 0 });
      void persistMessages(sid);
      notify();
    },
    onError: (sid, error) => {
      const list = state.messages.get(sid);
      if (list) {
        list.push({ role: "assistant", text: `\u274C ${error}`, ts: Date.now() });
      }
      state.running.delete(sid);
      void unlockSession(sid, {});
      notify();
    }
  });
  state.subs.set(id, unsub);
}
function closeSession(id) {
  state.subs.get(id)?.();
  state.subs.delete(id);
}
async function sendMessage(id, text) {
  const session = getSession(id);
  if (!session) return { ok: false, reason: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" };
  if (state.running.has(id)) return { ok: false, reason: "\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\uFF08\u53EF\u80FD\u662F\u53E6\u4E00\u8BBE\u5907\u6B63\u5728\u53D1\uFF09\uFF0C\u8BF7\u7B49\u5F85" };
  if (!text.trim()) return { ok: false, reason: "\u6D88\u606F\u4E3A\u7A7A" };
  await ensureSessionLoaded(id);
  const list = state.messages.get(id) ?? [];
  list.push({ role: "user", text, ts: Date.now() });
  await kvSaveMessagesApprox(id, list);
  const lock = await tryLockSession(id, session.engineId);
  if (!lock.ok) {
    list.pop();
    await kvSaveMessagesApprox(id, list);
    notify();
    return lock;
  }
  state.running.add(id);
  notify();
  const result = await sendChat({
    pluginSessionId: id,
    text,
    engineId: session.engineId,
    workspaceId: session.workspaceId,
    modelProfileId: session.modelProfileId,
    engineSessionId: session.engineSessionId
  });
  if (!result.ok) {
    state.running.delete(id);
    list.push({ role: "assistant", text: `\u274C ${result.reason}`, ts: Date.now() });
    await kvSaveMessagesApprox(id, list);
    void unlockSession(id, {});
    notify();
    return result;
  }
  if (result.engineSessionId && session.engineSessionId !== result.engineSessionId) {
    session.engineSessionId = result.engineSessionId;
    void persistSessionMeta(id, session);
  }
  if (!state.subs.has(id)) await openSession(id);
  return { ok: true };
}
async function ensureSessionLoaded(id) {
  if (!state.messages.has(id)) {
    const cached = await kvGetMessages(id);
    state.messages.set(id, cached);
  }
}
var kvSaveMessagesApprox = kvSaveMessages;
async function persistSessionMeta(id, meta) {
  const store = await loadStore();
  const list = store.sessions.map((s) => s.id === id ? meta : s);
  await saveStore({ ...store, sessions: list });
  state.sessions = list;
  notify();
}
function storeDefaults() {
  return { engineId: state.engineId, workspaceId: state.workspaceId, modelProfileId: state.modelProfileId };
}
async function refreshSessions() {
  const store = await loadStore();
  const runningIds = new Set(state.sessions.filter((s) => s.status === "running").map((s) => s.id));
  state.sessions = store.sessions;
  state.engineId = store.defaults.engineId;
  state.workspaceId = store.defaults.workspaceId;
  state.modelProfileId = store.defaults.modelProfileId;
  for (const s of state.sessions) {
    if (s.status === "running") state.running.add(s.id);
  }
  notify();
}

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Panel(props) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((x) => x + 1), []);
  const [hostError, setHostError] = useState(
    hasHostSupport() ? null : "\u4E3B\u5E94\u7528\u672A\u63D0\u4F9B\u5BBF\u4E3B\u901A\u9053\uFF08\u9700\u8981 __POLARIS_HOST_INVOKE__ + __POLARIS_HOST_LISTEN__\uFF09"
  );
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let mounted = true;
    initStore().then(() => {
      if (!mounted) return;
      const sessions2 = getSessions();
      if (sessions2.length > 0) {
        const latest = sessions2[0];
        setActiveId(latest.id);
        void openSession(latest.id);
      }
      rerender();
    }).catch((e) => {
      if (mounted) setHostError(e instanceof Error ? e.message : String(e));
    });
    const unsub = subscribeStore(() => {
      if (mounted) rerender();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [rerender]);
  const switchSession = useCallback((id) => {
    closeSession(activeId ?? "");
    setActiveId(id);
    void openSession(id);
  }, [activeId]);
  const handleCreate = useCallback(async () => {
    setCreating(true);
    setSendError(null);
    try {
      const meta = await createSession("");
      setActiveId(meta.id);
      await openSession(meta.id);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, []);
  const handleSend = useCallback(async () => {
    if (!activeId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    setSendError(null);
    const result = await sendMessage(activeId, text);
    if (!result.ok) {
      setSendError(result.reason);
      setInput(text);
    }
  }, [activeId, input]);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSessions();
    } finally {
      setRefreshing(false);
    }
  }, []);
  const sessions = getSessions();
  const messages = activeId ? getMessages(activeId) : [];
  const active = activeId ? sessions.find((s) => s.id === activeId) : void 0;
  return /* @__PURE__ */ jsxs("div", { className: "mc-panel", children: [
    /* @__PURE__ */ jsxs("div", { className: "mc-header", children: [
      /* @__PURE__ */ jsx("span", { className: "mc-title", children: "MultiChat \xB7 \u591A\u8BBE\u5907\u4F1A\u8BDD" }),
      /* @__PURE__ */ jsx("button", { className: "mc-btn", onClick: handleRefresh, title: "\u5237\u65B0\u4F1A\u8BDD\u6E05\u5355\uFF08\u8DE8\u8BBE\u5907\uFF09", children: refreshing ? "\u2026" : "\u27F3" }),
      /* @__PURE__ */ jsx("button", { className: "mc-btn mc-btn-primary", onClick: handleCreate, disabled: creating, children: "\uFF0B \u65B0\u5EFA" })
    ] }),
    hostError && /* @__PURE__ */ jsx("div", { className: "mc-empty", children: hostError }),
    !hostError && /* @__PURE__ */ jsxs("div", { className: "mc-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "mc-sidelist", children: [
        /* @__PURE__ */ jsx("div", { className: "mc-sidelist-label", children: "\u4F1A\u8BDD" }),
        sessions.length === 0 && /* @__PURE__ */ jsx("div", { className: "mc-hint", children: "\u6682\u65E0\u4F1A\u8BDD\uFF0C\u70B9\u51FB\u300C\u65B0\u5EFA\u300D" }),
        sessions.map((s) => /* @__PURE__ */ jsxs(
          "div",
          {
            className: `mc-item${s.id === activeId ? " active" : ""}`,
            onClick: () => switchSession(s.id),
            children: [
              /* @__PURE__ */ jsx("div", { className: "mc-item-title", children: s.title }),
              /* @__PURE__ */ jsxs("div", { className: "mc-item-sub", children: [
                isRunning(s.id) && /* @__PURE__ */ jsx("span", { className: "mc-dot", title: "\u6B63\u5728\u8FD0\u884C" }),
                s.engineId,
                " \xB7 ",
                s.messageCount,
                " \u6761"
              ] })
            ]
          },
          s.id
        ))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mc-main", children: [
        !active && /* @__PURE__ */ jsx("div", { className: "mc-empty", children: "\u9009\u62E9\u5DE6\u4FA7\u4F1A\u8BDD\uFF0C\u6216\u65B0\u5EFA\u4E00\u4E2A\u5F00\u59CB" }),
        active && messages.length === 0 && /* @__PURE__ */ jsx("div", { className: "mc-empty", children: "\u8FD8\u6CA1\u6709\u6D88\u606F\uFF0C\u8F93\u5165\u4E0B\u65B9\u5185\u5BB9\u53D1\u8D77\u5BF9\u8BDD\u3002" }),
        active && messages.map((m, i) => /* @__PURE__ */ jsxs("div", { className: `mc-msg mc-msg-${m.role}`, children: [
          /* @__PURE__ */ jsx("div", { className: "mc-msg-role", children: m.role === "user" ? "\u6211" : "AI" }),
          /* @__PURE__ */ jsx("pre", { className: "mc-msg-text", children: m.text })
        ] }, i))
      ] }),
      active && /* @__PURE__ */ jsxs("div", { className: "mc-input-area", children: [
        sendError && /* @__PURE__ */ jsx("div", { className: "mc-err", children: sendError }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "mc-input",
            value: input,
            onChange: (e) => setInput(e.target.value),
            placeholder: isRunning(active.id) ? "\u7B49\u5F85\u5F53\u524D\u56DE\u590D\u5B8C\u6210\uFF08\u5355\u5199\u8005\u9501\uFF09\u2026" : "\u8F93\u5165\u6D88\u606F\uFF0CEnter \u53D1\u9001",
            rows: 3,
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            },
            disabled: isRunning(active.id)
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "mc-input-row", children: [
          /* @__PURE__ */ jsxs("span", { className: "mc-engine", children: [
            "\u{1F680} ",
            getEngineId()
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "mc-btn mc-btn-primary",
              onClick: handleSend,
              disabled: !active || isRunning(active.id) || !input.trim(),
              children: "\u53D1\u9001"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("style", { children: `
        .mc-panel { display:flex; flex-direction:column; height:100%; font-size:12px; color: var(--text, #E4E4E7); background: var(--bg, transparent); overflow:hidden; }
        .mc-header { display:flex; align-items:center; gap:6px; padding:8px 10px; border-bottom:1px solid var(--border, rgba(255,255,255,0.08)); position:sticky; top:0; background:inherit; z-index:1; }
        .mc-title { font-weight:600; font-size:13px; flex:1; }
        .mc-btn { padding:4px 10px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg-elev, #25252B); color:inherit; cursor:pointer; font-size:11px; }
        .mc-btn:hover { filter:brightness(1.15); }
        .mc-btn-primary { background:#3B82F6; border-color:transparent; color:#fff; }
        .mc-btn:disabled { opacity:.5; cursor:default; }
        .mc-body { display:flex; flex:1; overflow:hidden; }
        .mc-sidelist { width:180px; min-width:140px; border-right:1px solid var(--border, rgba(255,255,255,0.08)); overflow-y:auto; padding:6px 4px; }
        .mc-sidelist-label { font-size:10px; color:var(--text-muted, #8E8E93); padding:4px 6px; text-transform:uppercase; letter-spacing:.05em; }
        .mc-item { padding:6px 8px; border-radius:6px; cursor:pointer; margin-bottom:2px; }
        .mc-item:hover { background:var(--bg-elev, rgba(255,255,255,0.05)); }
        .mc-item.active { background:rgba(59,130,246,.15); }
        .mc-item-title { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mc-item-sub { font-size:10px; color:var(--text-muted, #8E8E93); margin-top:2px; display:flex; align-items:center; gap:4px; }
        .mc-dot { width:6px; height:6px; border-radius:50%; background:#FBBF24; display:inline-block; animation:mc-pulse 1s infinite; }
        @keyframes mc-pulse { 50% { opacity:.3; } }
        .mc-hint { padding:8px; color:var(--text-muted, #8E8E93); font-size:11px; }
        .mc-main { flex:1; display:flex; flex-direction:column; overflow-y:auto; padding:12px; gap:8px; }
        .mc-msg { display:flex; flex-direction:column; gap:2px; max-width:100%; }
        .mc-msg-role { font-size:10px; color:var(--text-muted, #8E8E93); }
        .mc-msg-text { margin:0; padding:8px 10px; border-radius:8px; background:var(--bg-elev, #25252B); border:1px solid var(--border, rgba(255,255,255,0.06)); white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:12px; }
        .mc-msg-user .mc-msg-text { background:rgba(59,130,246,.15); }
        .mc-input-area { border-top:1px solid var(--border, rgba(255,255,255,0.08)); padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
        .mc-input { flex:0 0 auto; resize:vertical; min-height:56px; padding:8px; border-radius:8px; border:1px solid var(--border, rgba(255,255,255,0.12)); background:var(--bg-elev, #1E1E24); color:inherit; font-family:inherit; font-size:12px; }
        .mc-input:focus { outline:none; border-color:#3B82F6; }
        .mc-input-row { display:flex; align-items:center; gap:8px; justify-content:space-between; }
        .mc-engine { font-size:10px; color:var(--text-muted, #8E8E93); }
        .mc-err { color:#EF4444; font-size:11px; }
        .mc-empty { flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-muted, #8E8E93); padding:24px; text-align:center; }
      ` })
  ] });
}
export {
  Panel as default
};
