// src/Panel.tsx
import { useState, useEffect, useCallback, useMemo } from "react";

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
    if (req.model) options.model = req.model;
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
async function listEngines() {
  try {
    const metas = await invokeHost("get_engine_metadata_list");
    return Array.isArray(metas) ? metas : [];
  } catch {
    return [];
  }
}
async function listProfiles() {
  try {
    const config = await capDispatch("cap.config", {
      action: "get",
      section: "full"
    });
    const profiles = config?.modelProfiles;
    if (!Array.isArray(profiles)) return [];
    return profiles.filter((p) => p && typeof p.id === "string" && p.id);
  } catch {
    return [];
  }
}
async function listOpencodeModels() {
  try {
    const models = await invokeHost("get_opencode_models");
    return Array.isArray(models) ? models : [];
  } catch {
    return [];
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
        engineId: raw?.defaults?.engineId || "simple-ai",
        workspaceId: raw?.defaults?.workspaceId || null,
        modelProfileId: raw?.defaults?.modelProfileId || null,
        model: raw?.defaults?.model ?? null
      }
    };
  } catch {
    return {
      sessions: [],
      defaults: {
        engineId: "simple-ai",
        workspaceId: null,
        modelProfileId: null,
        model: null
      }
    };
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
  }).catch((err) => {
    globalInitPromise = null;
    throw err;
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
  engineId: "simple-ai",
  workspaceId: null,
  modelProfileId: null,
  model: null,
  loaded: false,
  loadingError: "",
  /** 打开会话 → 本端消息缓存 */
  messages: /* @__PURE__ */ new Map(),
  /** 发送中（running）的会话 */
  running: /* @__PURE__ */ new Set(),
  /** 订阅管理：sessionId → unsub */
  subs: /* @__PURE__ */ new Map(),
  /** 引擎/供应商/模型选择器数据 */
  catalog: {
    engines: [],
    profiles: [],
    opencodeModels: [],
    catalogLoaded: false,
    catalogError: ""
  }
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
  state.engineId = store.defaults.engineId || "simple-ai";
  state.workspaceId = store.defaults.workspaceId;
  state.modelProfileId = store.defaults.modelProfileId;
  state.model = store.defaults.model ?? null;
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
function getModelProfileId() {
  return state.modelProfileId;
}
function getModel() {
  return state.model;
}
async function loadCatalog() {
  if (state.catalog.catalogLoaded) return;
  try {
    const [engines, profiles] = await Promise.all([listEngines(), listProfiles()]);
    state.catalog.engines = engines;
    state.catalog.profiles = profiles;
    state.catalog.catalogLoaded = true;
    state.catalog.catalogError = "";
  } catch (e) {
    state.catalog.catalogError = e instanceof Error ? e.message : String(e);
  }
  notify();
}
function getCatalog() {
  return state.catalog;
}
function profilesForEngine(engineId) {
  const profiles = state.catalog.profiles;
  if (!profiles.length) return [];
  return profiles.filter((p) => {
    const targets = p.target_engines;
    if (!Array.isArray(targets) || targets.length === 0) return true;
    return targets.some((t) => {
      const norm = t.toLowerCase();
      return engineId === t || engineId.startsWith(norm) || norm.startsWith(engineId.replace("open-code", "opencode"));
    });
  });
}
function modelsForSelection(engineId, profileId) {
  const profile = state.catalog.profiles.find((p) => p.id === profileId);
  const fromProfile = profile ? profile.model_options ?? [] : [];
  let list = fromProfile.length > 0 ? fromProfile : profile?.model ? [profile.model] : [];
  if (engineId === "open-code" || engineId === "opencode") {
    const oc = state.catalog.opencodeModels.map((m) => m.id);
    list = [.../* @__PURE__ */ new Set([...list, ...oc])];
  }
  return list;
}
async function setDefaultEngine(engineId) {
  state.engineId = engineId;
  state.modelProfileId = null;
  state.model = null;
  if ((engineId === "open-code" || engineId === "opencode") && state.catalog.opencodeModels.length === 0) {
    try {
      state.catalog.opencodeModels = await listOpencodeModels();
    } catch {
    }
  }
  await persistDefaults();
  notify();
}
async function setDefaultProfile(profileId) {
  state.modelProfileId = profileId;
  state.model = null;
  await persistDefaults();
  notify();
}
async function setDefaultModel(model) {
  state.model = model;
  await persistDefaults();
  notify();
}
async function persistDefaults() {
  const store = await loadStore();
  store.defaults = {
    engineId: state.engineId,
    workspaceId: state.workspaceId,
    modelProfileId: state.modelProfileId,
    model: state.model
  };
  await saveStore({ ...store, defaults: store.defaults });
  state.sessions = store.sessions;
}
async function createSession(title) {
  const now = Date.now();
  const meta = {
    id: `${SESSION_PREFIX}${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) + "-" + Date.now().toString(36) : Date.now().toString(36)}`,
    title: title.trim() || `\u4F1A\u8BDD ${state.sessions.length + 1}`,
    engineId: state.engineId,
    workspaceId: state.workspaceId,
    modelProfileId: state.modelProfileId,
    model: state.model,
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
  const engineId = session.engineId || state.engineId;
  const modelProfileId = session.modelProfileId ?? state.modelProfileId;
  const model = session.model ?? state.model;
  const result = await sendChat({
    pluginSessionId: id,
    text,
    engineId,
    workspaceId: session.workspaceId ?? state.workspaceId,
    modelProfileId,
    model,
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
  return {
    engineId: state.engineId,
    workspaceId: state.workspaceId,
    modelProfileId: state.modelProfileId,
    model: state.model
  };
}
async function refreshSessions() {
  const store = await loadStore();
  const runningIds = new Set(state.sessions.filter((s) => s.status === "running").map((s) => s.id));
  state.sessions = store.sessions;
  state.engineId = store.defaults.engineId || "simple-ai";
  state.workspaceId = store.defaults.workspaceId;
  state.modelProfileId = store.defaults.modelProfileId;
  state.model = store.defaults.model ?? null;
  for (const s of state.sessions) {
    if (s.status === "running") state.running.add(s.id);
  }
  notify();
}

// src/Panel.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var ENGINE_LABEL = {
  "claude-code": "Claude Code",
  "simple-ai": "SimpleAI",
  "open-code": "OpenCode",
  opencode: "OpenCode"
};
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
  const [selectorOpen, setSelectorOpen] = useState(false);
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
      void loadCatalog().then(() => {
        if (mounted) rerender();
      });
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
  const catalog = getCatalog();
  const engineId = getEngineId();
  const modelProfileId = getModelProfileId();
  const model = getModel();
  const engines = useMemo(() => {
    const list = catalog.engines;
    if (!list.length) return [];
    const usable = list.filter((e) => e.available !== false);
    return usable.length > 0 ? usable : list;
  }, [catalog.engines]);
  const profiles = useMemo(() => profilesForEngine(engineId), [catalog.profiles, engineId]);
  const models = useMemo(
    () => modelsForSelection(engineId, modelProfileId),
    [catalog.profiles, catalog.opencodeModels, engineId, modelProfileId]
  );
  const activeEngineId = engineId;
  const activeProfileId = modelProfileId;
  const activeModel = model;
  const sessions = getSessions();
  const messages = activeId ? getMessages(activeId) : [];
  const active = activeId ? sessions.find((s) => s.id === activeId) : void 0;
  return /* @__PURE__ */ jsxs("div", { className: "mc-panel", children: [
    /* @__PURE__ */ jsxs("div", { className: "mc-header", children: [
      /* @__PURE__ */ jsx("span", { className: "mc-title", children: "MultiChat" }),
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
        /* @__PURE__ */ jsxs("div", { className: "mc-selector", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              className: "mc-selector-toggle",
              onClick: () => setSelectorOpen((v) => !v),
              title: "\u5F15\u64CE / \u4F9B\u5E94\u5546 / \u6A21\u578B",
              children: [
                /* @__PURE__ */ jsx("span", { className: "mc-selector-label", children: "\u2699" }),
                /* @__PURE__ */ jsxs("span", { className: "mc-selector-value", children: [
                  engineLabel(activeEngineId),
                  " ",
                  activeProfileId ? `\xB7 ${activeProfileId}` : "",
                  activeModel ? ` \xB7 ${activeModel}` : ""
                ] }),
                /* @__PURE__ */ jsx("span", { className: `mc-selector-arrow${selectorOpen ? " open" : ""}`, children: "\u25BE" })
              ]
            }
          ),
          selectorOpen && /* @__PURE__ */ jsxs("div", { className: "mc-selector-dropdown", children: [
            /* @__PURE__ */ jsxs("div", { className: "mc-selector-group", children: [
              /* @__PURE__ */ jsx("div", { className: "mc-selector-group-label", children: "\u5F15\u64CE" }),
              /* @__PURE__ */ jsxs("div", { className: "mc-selector-options", children: [
                engines.map((e) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: `mc-selector-opt${activeEngineId === e.id ? " active" : ""}`,
                    onClick: () => void setDefaultEngine(e.id),
                    children: e.name || ENGINE_LABEL[e.id] || e.id
                  },
                  e.id
                )),
                engines.length === 0 && /* @__PURE__ */ jsx("div", { className: "mc-hint", children: "\u65E0\u53EF\u9009\u5F15\u64CE" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mc-selector-group", children: [
              /* @__PURE__ */ jsx("div", { className: "mc-selector-group-label", children: "\u4F9B\u5E94\u5546" }),
              /* @__PURE__ */ jsxs("div", { className: "mc-selector-options", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: `mc-selector-opt${activeProfileId === null ? " active" : ""}`,
                    onClick: () => void setDefaultProfile(null),
                    children: "\u81EA\u52A8\uFF08\u8DDF\u968F\u6FC0\u6D3B\uFF09"
                  }
                ),
                profiles.map((p) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: `mc-selector-opt${activeProfileId === p.id ? " active" : ""}`,
                    onClick: () => void setDefaultProfile(p.id),
                    children: p.name || p.id
                  },
                  p.id
                )),
                profiles.length === 0 && /* @__PURE__ */ jsx("div", { className: "mc-hint", children: "\u5F53\u524D\u5F15\u64CE\u65E0\u53EF\u7528\u4F9B\u5E94\u5546" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "mc-selector-group", children: [
              /* @__PURE__ */ jsx("div", { className: "mc-selector-group-label", children: "\u6A21\u578B" }),
              /* @__PURE__ */ jsxs("div", { className: "mc-selector-options", children: [
                models.length === 0 && /* @__PURE__ */ jsx("div", { className: "mc-hint", children: "\u672A\u914D\u7F6E\u6A21\u578B\uFF08\u540E\u7AEF\u5C06\u4F7F\u7528 Profile \u9ED8\u8BA4\uFF09" }),
                models.map((m) => /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: `mc-selector-opt${activeModel === m ? " active" : ""}`,
                    onClick: () => void setDefaultModel(m),
                    children: m
                  },
                  m
                ))
              ] })
            ] })
          ] })
        ] }),
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
            engineLabel(activeEngineId)
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
        .mc-btn { padding:4px 10px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg-elev, #25252B); color:inherit; cursor:pointer; font-size:11px; min-height:28px; }
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

        /* \u9009\u62E9\u5668 */
        .mc-selector { position:relative; z-index:5; }
        .mc-selector-toggle { display:flex; align-items:center; gap:6px; width:100%; padding:6px 10px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg-elev, #25252B); color:inherit; cursor:pointer; font-size:11px; }
        .mc-selector-toggle:hover { border-color:#3B82F6; }
        .mc-selector-label { font-size:12px; }
        .mc-selector-value { flex:1; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text, #E4E4E7); }
        .mc-selector-arrow { color:var(--text-muted, #8E8E93); transition:transform .15s; }
        .mc-selector-arrow.open { transform:rotate(180deg); }
        .mc-selector-dropdown { position:absolute; top:calc(100% + 4px); left:0; right:0; background:var(--bg-elev, #1E1E24); border:1px solid var(--border, rgba(255,255,255,0.12)); border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:10px; box-shadow:0 8px 24px rgba(0,0,0,.35); max-height:60vh; overflow-y:auto; }
        .mc-selector-group { display:flex; flex-direction:column; gap:4px; }
        .mc-selector-group-label { font-size:10px; color:var(--text-muted, #8E8E93); text-transform:uppercase; letter-spacing:.05em; }
        .mc-selector-options { display:flex; flex-wrap:wrap; gap:4px; }
        .mc-selector-opt { padding:4px 8px; border-radius:4px; border:1px solid var(--border, rgba(255,255,255,0.1)); background:var(--bg, transparent); color:inherit; cursor:pointer; font-size:11px; }
        .mc-selector-opt:hover { background:var(--bg-elev, rgba(255,255,255,0.05)); }
        .mc-selector-opt.active { background:rgba(59,130,246,.2); border-color:#3B82F6; color:#fff; }

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

        /* \u624B\u673A\u54CD\u5E94\u5F0F\uFF08\u2264640px\uFF09\uFF1A\u4FA7\u680F\u2192\u9876\u90E8\u6A2A\u5411\u4F1A\u8BDD\u6761\uFF0C\u5168\u5BBD\u5E03\u5C40 */
        @media (max-width: 640px) {
          .mc-body { flex-direction:column; }
          .mc-sidelist {
            width:100%; min-width:0; max-height:90px; border-right:none;
            border-bottom:1px solid var(--border, rgba(255,255,255,0.08));
            display:flex; flex-direction:row; gap:6px; overflow-x:auto; overflow-y:hidden;
            padding:6px 8px; align-items:stretch;
          }
          .mc-sidelist-label { display:none; }
          .mc-item {
            flex:0 0 auto; min-width:110px; max-width:150px;
            border:1px solid var(--border, rgba(255,255,255,0.08)); border-radius:6px;
            padding:6px 8px; display:flex; flex-direction:column; justify-content:center;
          }
          .mc-item.active { border-color:#3B82F6; }
          .mc-main { padding:10px; }
          .mc-input { font-size:14px; min-height:48px; }
          .mc-btn { min-height:32px; padding:6px 12px; }
          .mc-msg-text { font-size:13px; padding:10px 12px; }
          .mc-input-area { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
          .mc-header { padding-top: max(8px, env(safe-area-inset-top)); }
        }
      ` })
  ] });
}
function engineLabel(id) {
  return ENGINE_LABEL[id] || id;
}
export {
  Panel as default
};
