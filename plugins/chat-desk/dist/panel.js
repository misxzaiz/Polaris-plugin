// src/Panel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// src/bridge.ts
function globals() {
  return window;
}
function getHostInvoke() {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return fn;
}
function getHostListen() {
  const fn = globals().__POLARIS_HOST_LISTEN__;
  if (!fn) throw new Error("\u5BBF\u4E3B listen \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_LISTEN__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return fn;
}
async function aiChatDispatch(payload) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", {
    req: { target: "cap.ai.chat", payload }
  });
  if (!res.ok) {
    throw new Error(res.error || "cap.ai.chat " + String(payload.action ?? "") + " \u5931\u8D25");
  }
  return res.result;
}
async function aiChatDispatchStream(payload) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch_stream", {
    req: { target: "cap.ai.chat", payload }
  });
  return res;
}
function subscribeChatEvent(handler) {
  const listen = getHostListen();
  return listen("chat-event", handler);
}

// src/store.ts
var CONTEXT_PREFIX = "mc-cd-";
var seqCounter = 0;
function newId(prefix) {
  seqCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${seqCounter}`;
}
function emptySession(sessionId, opts) {
  return {
    sessionId,
    conversationId: null,
    title: opts?.title ?? "\u65B0\u5BF9\u8BDD",
    engineId: opts?.engineId ?? "claude-code",
    messages: [],
    currentMessage: null,
    isStreaming: false,
    isInterrupting: false,
    error: null,
    turnEpoch: 0,
    activeTurnId: null,
    lastProgress: null,
    pendingQueue: []
  };
}
function extractSessionId(contextId) {
  if (!contextId || !contextId.startsWith(CONTEXT_PREFIX)) return null;
  return contextId.slice(CONTEXT_PREFIX.length) || null;
}
function genId(_prefix) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return newId("id");
}
function reduceEvent(session, payload, turnId) {
  const type = payload["type"];
  const isTerminal = type === "session_end" || type === "error";
  if (isTerminal && turnId && session.activeTurnId && turnId !== session.activeTurnId) {
    return session;
  }
  const next = { ...session };
  switch (type) {
    case "session_start": {
      const base = next.currentMessage ? finishCurrent(next) : next;
      const msg = {
        id: genId(),
        type: "assistant",
        content: "",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        blocks: [],
        isStreaming: true
      };
      next.currentMessage = msg;
      next.isStreaming = true;
      next.error = null;
      return next;
    }
    case "token": {
      const value = String(payload["value"] ?? "");
      if (!value) return next;
      return appendToCurrent(next, { type: "text", content: value });
    }
    case "thinking": {
      const content = String(payload["content"] ?? "");
      if (!content) return next;
      return appendToCurrent(next, { type: "thinking", content });
    }
    case "tool_call_start": {
      const callId = String(payload["callId"] ?? payload["call_id"] ?? genId());
      const name = String(payload["tool"] ?? payload["toolName"] ?? payload["name"] ?? "");
      let input = {};
      const rawInput = payload["args"] ?? payload["input"];
      if (rawInput && typeof rawInput === "object") input = rawInput;
      const base = next.currentMessage ? next : openCurrent(next);
      const block = { type: "tool_call", callId, name, input, status: "running" };
      const msg = base.currentMessage;
      return { ...base, currentMessage: { ...msg, blocks: [...msg.blocks ?? [], block] } };
    }
    case "tool_call_end": {
      const callId = String(payload["callId"] ?? payload["call_id"] ?? "");
      const outputRaw = payload["result"] ?? payload["output"];
      const output = typeof outputRaw === "string" ? outputRaw : outputRaw ? JSON.stringify(outputRaw, null, 2) : void 0;
      const success = payload["success"] !== false;
      if (!next.currentMessage) return next;
      const msg = next.currentMessage;
      const blocks = (msg.blocks ?? []).map(
        (b) => b.type === "tool_call" && b.callId === callId ? { ...b, output, status: success ? "success" : "error" } : b
      );
      return { ...next, currentMessage: { ...msg, blocks } };
    }
    case "error": {
      if (next.isInterrupting) return next;
      return { ...next, error: String(payload["error"] ?? "\u672A\u77E5\u9519\u8BEF"), isStreaming: false };
    }
    case "user_message": {
      const content = String(payload["content"] ?? "");
      if (!content) return next;
      const clientId = payload["clientMessageId"] ? String(payload["clientMessageId"]) : void 0;
      const isLocalEcho = clientId ? session.messages.some((m) => m.id === clientId) : session.isStreaming && [...session.messages].reverse().find((m) => m.type === "user")?.content === content;
      if (isLocalEcho) return next;
      const msg = {
        id: clientId || genId(),
        type: "user",
        content,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      return { ...next, messages: [...next.messages, msg] };
    }
    case "progress": {
      const msg = String(payload["message"] ?? "");
      if (msg.startsWith("\u2705") || msg.startsWith("\u274C")) return next;
      next.lastProgress = msg || null;
      return next;
    }
    case "session_end": {
      const finished = finishCurrent(next);
      const cleared = {
        ...finished,
        currentMessage: null,
        isStreaming: false,
        isInterrupting: false,
        activeTurnId: null,
        lastProgress: null
      };
      const head = cleared.pendingQueue[0];
      if (head) {
        cleared.pendingQueue = cleared.pendingQueue.slice(1);
        cleared.__dispatchNext = head;
      }
      return cleared;
    }
    default:
      return next;
  }
}
function openCurrent(session) {
  if (session.currentMessage) return session;
  const msg = {
    id: genId(),
    type: "assistant",
    content: "",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    blocks: [],
    isStreaming: true
  };
  return { ...session, currentMessage: msg, isStreaming: true };
}
function appendToCurrent(session, block) {
  const base = session.currentMessage ? session : openCurrent(session);
  const msg = base.currentMessage;
  const blocks = [...msg.blocks ?? []];
  const last = blocks[blocks.length - 1];
  const mergeable = last && last.type === block.type && (last.type === "text" || last.type === "thinking") && (block.type === "text" || block.type === "thinking");
  if (mergeable) {
    blocks[blocks.length - 1] = {
      ...last,
      content: last.content + block.content
    };
  } else {
    blocks.push(block);
  }
  return { ...base, currentMessage: { ...msg, blocks } };
}
function finishCurrent(session) {
  const cur = session.currentMessage;
  if (!cur) return session;
  const completed = {
    ...cur,
    isStreaming: false,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    content: (cur.blocks ?? []).map((b) => b.type === "text" ? b.content : "").join("").trim()
  };
  const idx = session.messages.findIndex((m) => m.id === completed.id);
  const messages = [...session.messages];
  if (idx >= 0 && messages[idx].type === "assistant") {
    const prev = messages[idx];
    messages[idx] = {
      ...completed,
      blocks: [...prev.blocks ?? [], ...completed.blocks ?? []]
    };
  } else {
    messages.push(completed);
  }
  return { ...session, messages, currentMessage: null };
}
var chatDeskStore = createStore()((set, get) => ({
  sessions: /* @__PURE__ */ new Map(),
  activeSessionId: null,
  initialized: false,
  eventUnlisten: null,
  initialize: () => {
    if (get().initialized) return;
    let unlisten = null;
    let disposed = false;
    void subscribeChatEvent((raw) => {
      if (disposed) return;
      try {
        const env = typeof raw === "string" ? JSON.parse(raw) : raw;
        const contextId = env?.contextId;
        if (!contextId || !contextId.startsWith(CONTEXT_PREFIX)) return;
        const payload = env?.payload ?? {};
        const sid = extractSessionId(contextId);
        if (!sid) return;
        const session = get().sessions.get(sid);
        if (!session) return;
        const nextSession = reduceEvent(session, payload, env?.turnId);
        if (nextSession !== session) {
          const sessions = new Map(get().sessions);
          const dispatchNext = nextSession.__dispatchNext;
          if (dispatchNext) delete nextSession.__dispatchNext;
          sessions.set(sid, nextSession);
          set({ sessions });
          if (dispatchNext) {
            void get().sendMessage(sid, dispatchNext.text);
          }
        }
      } catch {
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    set({ initialized: true, eventUnlisten: () => {
      disposed = true;
      unlisten?.();
    } });
  },
  dispose: () => {
    get().eventUnlisten?.();
    set({ eventUnlisten: null, initialized: false });
  },
  createSession: (opts) => {
    const sessionId = newId("cds");
    const session = emptySession(sessionId, opts);
    const sessions = new Map(get().sessions);
    sessions.set(sessionId, session);
    set({ sessions, activeSessionId: sessionId });
    return sessionId;
  },
  deleteSession: (sessionId) => {
    const sessions = new Map(get().sessions);
    const target = sessions.get(sessionId);
    sessions.delete(sessionId);
    const remaining = Array.from(sessions.keys());
    const active = get().activeSessionId;
    set({
      sessions,
      activeSessionId: active === sessionId ? remaining[remaining.length - 1] ?? null : active
    });
  },
  switchSession: (sessionId) => {
    if (!get().sessions.has(sessionId)) return;
    set({ activeSessionId: sessionId });
  },
  sendMessage: async (sessionId, text) => {
    let session = get().sessions.get(sessionId);
    if (!session) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (session.isStreaming) {
      const sessions0 = new Map(get().sessions);
      sessions0.set(sessionId, {
        ...session,
        pendingQueue: [...session.pendingQueue, { id: genId(), text: trimmed, createdAt: Date.now() }]
      });
      set({ sessions: sessions0 });
      return true;
    }
    session = get().sessions.get(sessionId) ?? session;
    const userMessage = {
      id: genId(),
      type: "user",
      content: trimmed,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const turnId = genId("turn");
    const sessions = new Map(get().sessions);
    const withUser = {
      ...session,
      messages: [...session.messages, userMessage],
      isStreaming: true,
      error: null,
      turnEpoch: session.turnEpoch + 1,
      activeTurnId: turnId
    };
    sessions.set(sessionId, withUser);
    set({ sessions });
    const chatOptions = {
      contextId: `${CONTEXT_PREFIX}${sessionId}`,
      engineId: session.engineId,
      enableMcpTools: true,
      clientMessageId: userMessage.id
    };
    try {
      if (session.conversationId) {
        await aiChatDispatchStream({
          action: "continue",
          sessionId: session.conversationId,
          message: trimmed,
          options: chatOptions
        });
      } else {
        const newConversationId = await aiChatDispatch({
          action: "start",
          message: trimmed,
          options: chatOptions
        });
        const s = get().sessions.get(sessionId);
        if (s) {
          const sessions2 = new Map(get().sessions);
          sessions2.set(sessionId, { ...s, conversationId: newConversationId || null });
          set({ sessions: sessions2 });
        }
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const s = get().sessions.get(sessionId);
      if (s) {
        const sessions2 = new Map(get().sessions);
        sessions2.set(sessionId, { ...s, isStreaming: false, error: msg });
        set({ sessions: sessions2 });
      }
      return false;
    }
  },
  continueChat: async (sessionId, prompt) => {
    await get().sendMessage(sessionId, prompt);
  },
  interrupt: async (sessionId) => {
    const session = get().sessions.get(sessionId);
    if (!session || !session.conversationId || !session.isStreaming) return;
    const sessions = new Map(get().sessions);
    sessions.set(sessionId, { ...session, isInterrupting: true });
    set({ sessions });
    try {
      await Promise.race([
        aiChatDispatch({ action: "interrupt", sessionId: session.conversationId, engineId: session.engineId }),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("interrupt invoke \u8D85\u65F6\uFF08\u540E\u7AEF\u65E0\u54CD\u5E94\uFF09")), 8e3)
        )
      ]);
      await new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const s = get().sessions.get(sessionId);
          if (!s || !s.isStreaming || Date.now() - started > 8e3) resolve();
          else setTimeout(tick, 100);
        };
        tick();
      });
    } catch (e) {
      const s = get().sessions.get(sessionId);
      if (s) {
        const sessions2 = new Map(get().sessions);
        const finished = finishCurrent({ ...s, isStreaming: false });
        sessions2.set(sessionId, { ...finished, isInterrupting: false, error: e instanceof Error ? e.message : String(e) });
        set({ sessions: sessions2 });
      }
    }
  }
}));

// node_modules/zustand/esm/react.mjs
import React from "react";
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    () => selector(api.getInitialState())
  );
  React.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// node_modules/zustand/esm/middleware.mjs
function createJSONStorage(getStorage, options) {
  let storage;
  try {
    storage = getStorage();
  } catch (e) {
    return;
  }
  const persistStorage = {
    getItem: (name) => {
      var _a;
      const parse = (str2) => {
        if (str2 === null) {
          return null;
        }
        return JSON.parse(str2, options == null ? void 0 : options.reviver);
      };
      const str = (_a = storage.getItem(name)) != null ? _a : null;
      if (isPromiseLike(str)) {
        return str.then(parse);
      }
      return parse(str);
    },
    setItem: (name, newValue) => storage.setItem(name, JSON.stringify(newValue, options == null ? void 0 : options.replacer)),
    removeItem: (name) => storage.removeItem(name)
  };
  return persistStorage;
}
var isPromiseLike = (value) => typeof (value == null ? void 0 : value.then) === "function";
var toSyncThenable = (value) => ({
  then(onFulfilled) {
    return onFulfilled ? toThenable(onFulfilled)(value) : this;
  }
});
var toThenable = (fn) => (input) => {
  try {
    const result = fn(input);
    return isPromiseLike(result) ? result : toSyncThenable(result);
  } catch (error) {
    return {
      then(_onFulfilled, onRejected) {
        return onRejected ? toThenable(onRejected)(error) : this;
      }
    };
  }
};
var persistImpl = (config, baseOptions) => (set, get, api) => {
  let options = {
    storage: createJSONStorage(() => window.localStorage),
    partialize: (state) => state,
    version: 0,
    merge: (persistedState, currentState) => ({
      ...currentState,
      ...persistedState
    }),
    ...baseOptions
  };
  let hasHydrated = false;
  let hydrationVersion = 0;
  const hydrationListeners = /* @__PURE__ */ new Set();
  const finishHydrationListeners = /* @__PURE__ */ new Set();
  let storage = options.storage;
  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        );
        set(...args);
      },
      get,
      api
    );
  }
  const setItem = () => {
    const state = options.partialize({ ...get() });
    return storage.setItem(options.name, {
      state,
      version: options.version
    });
  };
  const savedSetState = api.setState;
  api.setState = (...args) => {
    savedSetState(...args);
    return setItem();
  };
  const configResult = config(
    (...args) => {
      set(...args);
      return setItem();
    },
    get,
    api
  );
  api.getInitialState = () => configResult;
  let stateFromStorage;
  const hydrate = () => {
    var _a, _b;
    if (!storage) return;
    const currentVersion = ++hydrationVersion;
    hasHydrated = false;
    hydrationListeners.forEach((cb) => {
      var _a2;
      return cb((_a2 = get()) != null ? _a2 : configResult);
    });
    const postRehydrationCallback = ((_b = options.onRehydrateStorage) == null ? void 0 : _b.call(options, (_a = get()) != null ? _a : configResult)) || void 0;
    return toThenable(storage.getItem.bind(storage))(options.name).then((deserializedStorageValue) => {
      if (deserializedStorageValue) {
        if (typeof deserializedStorageValue.version === "number" && deserializedStorageValue.version !== options.version) {
          if (options.migrate) {
            const migration = options.migrate(
              deserializedStorageValue.state,
              deserializedStorageValue.version
            );
            if (isPromiseLike(migration)) {
              return migration.then((result) => [true, result]);
            }
            return [true, migration];
          }
          console.error(
            `State loaded from storage couldn't be migrated since no migrate function was provided`
          );
        } else {
          return [false, deserializedStorageValue.state];
        }
      }
      return [false, void 0];
    }).then((migrationResult) => {
      var _a2;
      if (currentVersion !== hydrationVersion) {
        return;
      }
      const [migrated, migratedState] = migrationResult;
      stateFromStorage = options.merge(
        migratedState,
        (_a2 = get()) != null ? _a2 : configResult
      );
      set(stateFromStorage, true);
      if (migrated) {
        return setItem();
      }
    }).then(() => {
      if (currentVersion !== hydrationVersion) {
        return;
      }
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(get(), void 0);
      stateFromStorage = get();
      hasHydrated = true;
      finishHydrationListeners.forEach((cb) => cb(stateFromStorage));
    }).then(
      () => void 0,
      (e) => {
        if (currentVersion !== hydrationVersion) {
          return;
        }
        postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
      }
    );
  };
  api.persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions
      };
      if (newOptions.storage) {
        storage = newOptions.storage;
      }
    },
    clearStorage: () => {
      ++hydrationVersion;
      storage == null ? void 0 : storage.removeItem(options.name);
    },
    getOptions: () => options,
    rehydrate: () => {
      try {
        return Promise.resolve(hydrate());
      } catch (error) {
        return Promise.reject(error);
      }
    },
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb);
      return () => {
        hydrationListeners.delete(cb);
      };
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb);
      return () => {
        finishHydrationListeners.delete(cb);
      };
    }
  };
  if (!options.skipHydration) {
    hydrate();
  }
  return stateFromStorage || configResult;
};
var persist = persistImpl;

// src/session-config/sessionConfig.ts
var DEFAULT_SESSION_CONFIG = {
  agent: "",
  model: "",
  effort: "",
  permissionMode: "bypassPermissions",
  modelProfileId: "",
  profileMode: "profile"
  // 默认「指定 Profile」语义，保持旧行为（modelProfileId 为空即官方）
};

// src/session-config/sessionConfigStore.ts
function normalizeSessionConfig(config) {
  const c = config ?? {};
  const profileMode = c.profileMode === "group" ? "profile" : c.profileMode ?? DEFAULT_SESSION_CONFIG.profileMode;
  return {
    ...DEFAULT_SESSION_CONFIG,
    ...c,
    effort: c.effort === "max" ? DEFAULT_SESSION_CONFIG.effort : c.effort ?? DEFAULT_SESSION_CONFIG.effort,
    permissionMode: c.permissionMode ?? DEFAULT_SESSION_CONFIG.permissionMode,
    // 旧持久化数据无 profileMode：默认「profile」语义（modelProfileId 为空即官方，与旧行为完全一致）。
    profileMode
  };
}
var useSessionConfig = create()(
  persist(
    (set) => ({
      config: { ...DEFAULT_SESSION_CONFIG },
      setAgent: (agent) => set((state) => ({
        config: { ...state.config, agent }
      })),
      setModel: (model) => set((state) => ({
        config: { ...state.config, model }
      })),
      setEffort: (effort) => set((state) => ({
        config: { ...state.config, effort }
      })),
      setPermissionMode: (permissionMode) => set((state) => ({
        config: { ...state.config, permissionMode }
      })),
      setModelProfileId: (modelProfileId) => set((state) => {
        if (!modelProfileId) {
          return { config: { ...state.config, modelProfileId: "" } };
        }
        return { config: { ...state.config, modelProfileId, profileMode: "profile" } };
      }),
      /** 设置供应商模式（official/profile）。
       *  mode=official 时清空 modelProfileId（官方不绑定单 Profile）；
       *  mode=profile 时保留 modelProfileId（由调用方先 setModelProfileId 或随后设置）。
       */
      setProfileMode: (mode) => set((state) => {
        const next = { ...state.config, profileMode: mode };
        if (mode === "official") {
          next.modelProfileId = "";
        }
        return { config: next };
      }),
      setConfig: (newConfig) => set((state) => ({
        config: { ...state.config, ...newConfig }
      })),
      resetConfig: () => set({ config: { ...DEFAULT_SESSION_CONFIG } })
    }),
    {
      name: "polaris-session-config",
      // 持久化本机会话偏好：agent/model/effort/permissionMode + 供应商二态
      // （modelProfileId/profileMode）。
      //
      // 背景：两字段此前刻意不持久化（派生自 configStore 后端 config.json，由 applyConfig
      // 注入），但代价是「状态栏手动切换」只存在于内存镜像，刷新即丢。方案 A 将其加回，
      // 让状态栏手动选择（Profile/官方）刷新后保留。
      //
      // 与后端 config.json 的双写一致性由两条路径保证：
      // - 设置页激活（ModelProviderTab.handleActivate）双向同步：写镜像 + 写后端 activeModelProfileId
      // - 状态栏切换（SessionConfigSelector.handleSelect）写镜像 + 会话 metadata
      // 两者都更新镜像，镜像始终反映「最近的全局默认或手动选择」。
      partialize: (state) => ({
        config: {
          agent: state.config.agent,
          model: state.config.model,
          effort: state.config.effort,
          permissionMode: state.config.permissionMode,
          modelProfileId: state.config.modelProfileId,
          profileMode: state.config.profileMode
        }
      }),
      // 反序列化时清洗废弃值（effort='max' / permissionMode='bypassPermissions'），
      // 并用 DEFAULT_SESSION_CONFIG 补全缺失字段（兼容旧版本持久化数据）。
      merge: (persistedState, currentState) => {
        const persisted = persistedState;
        return {
          ...currentState,
          config: normalizeSessionConfig(persisted?.config)
        };
      }
    }
  )
);

// src/session-config/hostDeps.ts
var deps = {
  getConfig: () => null,
  getActiveSessionMeta: () => null,
  writeBackSessionOverrides: () => {
  }
};
function setSessionConfigHostDeps(next) {
  deps = { ...deps, ...next };
}
async function fetchHostConfig() {
  try {
    const invoke = getHostInvoke();
    const res = await invoke("router_dispatch", {
      req: { target: "cap.config", payload: { action: "get", section: "full" } }
    });
    if (!res?.ok) return null;
    return res.result ?? null;
  } catch {
    return null;
  }
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function formatTime(ts) {
  try {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
function MessageBubble({ message }) {
  const isUser = message.type === "user";
  return /* @__PURE__ */ jsxs("div", { className: `cd-msg ${isUser ? "cd-msg-user" : ""}`, children: [
    /* @__PURE__ */ jsxs("div", { className: `cd-role ${isUser ? "cd-role-user" : "cd-role-ai"}`, children: [
      isUser ? "\u7528\u6237" : "Polaris",
      message.timestamp ? ` \xB7 ${formatTime(message.timestamp)}` : ""
    ] }),
    isUser ? /* @__PURE__ */ jsx("div", { className: "cd-bubble", children: message.content }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      (message.blocks ?? []).map((b, i) => {
        if (b.type === "thinking") {
          return /* @__PURE__ */ jsx("div", { className: "cd-think", children: b.content }, i);
        }
        if (b.type === "tool_call") {
          return /* @__PURE__ */ jsxs("div", { className: "cd-tool", children: [
            /* @__PURE__ */ jsxs("span", { className: "cd-tool-name", children: [
              "\u{1F527} ",
              b.name
            ] }),
            /* @__PURE__ */ jsx(
              "span",
              {
                className: b.status === "success" ? "cd-tool-status-ok" : b.status === "error" ? "cd-tool-status-err" : "",
                children: b.status === "running" ? "\u8FD0\u884C\u4E2D\u2026" : b.status === "success" ? "\u5B8C\u6210" : "\u5931\u8D25"
              }
            )
          ] }, i);
        }
        return /* @__PURE__ */ jsx("div", { className: "cd-bubble", children: b.content }, i);
      }),
      message.isStreaming && /* @__PURE__ */ jsx("span", { className: "cd-caret", "aria-hidden": "true" })
    ] })
  ] });
}
function SessionRow({
  session,
  active,
  onSelect,
  onDelete
}) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `cd-sessrow ${active ? "cd-sessrow-on" : ""}`,
      onClick: onSelect,
      role: "button",
      tabIndex: 0,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      },
      children: [
        /* @__PURE__ */ jsxs("span", { className: "cd-sess-title", children: [
          session.title,
          session.isStreaming ? " \u23F3" : ""
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "cd-sess-meta", children: [
          session.messages.length,
          " \u6761"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "cd-btn",
            title: "\u5220\u9664\u4F1A\u8BDD",
            onClick: (e) => {
              e.stopPropagation();
              onDelete();
            },
            children: "\u2715"
          }
        )
      ]
    }
  );
}
function ChatDeskPanel(_props) {
  const [state, setState] = useState(() => chatDeskStore.getState());
  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(true);
  const [hostConfig, setHostConfig] = useState(null);
  const hostConfigRef = useRef(null);
  const msgsRef = useRef(null);
  useEffect(() => {
    const unsub = chatDeskStore.subscribe(() => setState({ ...chatDeskStore.getState() }));
    return () => {
      unsub();
    };
  }, []);
  useEffect(() => {
    chatDeskStore.getState().initialize();
    if (chatDeskStore.getState().sessions.size === 0) {
      chatDeskStore.getState().createSession({ title: "\u65B0\u5BF9\u8BDD" });
    }
    void fetchHostConfig().then((cfg) => {
      setHostConfig(cfg);
    });
    setSessionConfigHostDeps({
      getConfig: () => hostConfigRef.current,
      getActiveSessionMeta: () => {
        const st = chatDeskStore.getState();
        const sid = st.activeSessionId;
        if (!sid) return null;
        const s = st.sessions.get(sid);
        if (!s) return null;
        return { sessionId: sid, engineId: s.engineId };
      },
      writeBackSessionOverrides: (sessionId, patch) => {
        const st = chatDeskStore.getState();
        const s = st.sessions.get(sessionId);
        if (!s) return;
        const sessions = new Map(st.sessions);
        sessions.set(sessionId, { ...s, title: patch.agent !== void 0 ? s.title : s.title });
        chatDeskStore.setState({ sessions });
      }
    });
    return () => {
      chatDeskStore.getState().dispose();
    };
  }, []);
  const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) ?? null : null;
  const sessionsList = useMemo(() => Array.from(state.sessions.values()), [state.sessions]);
  useEffect(() => {
    const el = msgsRef.current;
    if (!el || !active?.isStreaming) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, active?.currentMessage, active?.isStreaming]);
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !state.activeSessionId || active?.isStreaming) return;
    setInput("");
    await chatDeskStore.getState().sendMessage(state.activeSessionId, text);
  }, [input, state.activeSessionId, active?.isStreaming]);
  const handleInterrupt = useCallback(async () => {
    if (!state.activeSessionId) return;
    await chatDeskStore.getState().interrupt(state.activeSessionId);
  }, [state.activeSessionId]);
  const handleDelete = useCallback(
    (sessionId) => {
      chatDeskStore.getState().deleteSession(sessionId);
    },
    []
  );
  const handleNewSession = useCallback(() => {
    chatDeskStore.getState().createSession({ title: "\u65B0\u5BF9\u8BDD" });
  }, []);
  const handleExport = useCallback(async () => {
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "cd-root", children: [
    /* @__PURE__ */ jsxs("div", { className: "cd-toolbar", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "cd-btn", onClick: () => setShowSessions((v) => !v), children: "\u2630" }),
      /* @__PURE__ */ jsx("span", { className: "cd-title", children: active ? active.title : "AI \u5BF9\u8BDD" }),
      /* @__PURE__ */ jsx("span", { className: `cd-badge ${active?.isStreaming ? "" : "cd-badge-off"}`, children: active?.isStreaming ? active.isInterrupting ? "\u4E2D\u65AD\u4E2D\u2026" : "\u8FD0\u884C\u4E2D" : "\u7A7A\u95F2" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "cd-btn", onClick: handleNewSession, children: "+ \u65B0\u4F1A\u8BDD" })
    ] }),
    showSessions && /* @__PURE__ */ jsx("div", { className: "cd-sessions", children: sessionsList.map((s) => /* @__PURE__ */ jsx(
      SessionRow,
      {
        session: s,
        active: s.sessionId === state.activeSessionId,
        onSelect: () => chatDeskStore.getState().switchSession(s.sessionId),
        onDelete: () => handleDelete(s.sessionId)
      },
      s.sessionId
    )) }),
    /* @__PURE__ */ jsx("div", { className: "cd-msgs", ref: msgsRef, children: !active || active.messages.length === 0 && !active.currentMessage && !active.error ? /* @__PURE__ */ jsxs("div", { className: "cd-empty", children: [
      /* @__PURE__ */ jsx("div", { children: "\u5F00\u59CB\u65B0\u7684\u5BF9\u8BDD" }),
      /* @__PURE__ */ jsx("div", { children: "\u8F93\u5165\u6D88\u606F\u53D1\u9001\u7ED9 AI\uFF08P2 \u9AA8\u67B6\uFF1A\u6587\u672C/\u601D\u8003/\u5DE5\u5177\u5757\u6E32\u67D3\uFF09" })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      active.error && /* @__PURE__ */ jsx("div", { className: "cd-err", children: active.error }),
      active.messages.map((m) => /* @__PURE__ */ jsx(MessageBubble, { message: m }, m.id)),
      active.currentMessage && /* @__PURE__ */ jsx(MessageBubble, { message: active.currentMessage })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "cd-inputrow", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "cd-input",
          rows: 1,
          placeholder: active?.isStreaming ? "\u56DE\u590D\u8FDB\u884C\u4E2D\u2026\uFF08ESC \u4E2D\u65AD\uFF09" : "\u8F93\u5165\u6D88\u606F\uFF08Enter \u53D1\u9001\uFF0CShift+Enter \u6362\u884C\uFF09",
          value: input,
          disabled: false,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSend();
              return;
            }
            if (e.key === "Escape" && active?.isStreaming) {
              e.preventDefault();
              void handleInterrupt();
            }
          }
        }
      ),
      active?.isStreaming ? /* @__PURE__ */ jsx("button", { type: "button", className: "cd-btn cd-btn-danger", onClick: () => void handleInterrupt(), disabled: active.isInterrupting, children: active.isInterrupting ? "\u4E2D\u65AD\u4E2D\u2026" : "\u25A0 \u505C\u6B62" }) : /* @__PURE__ */ jsx("button", { type: "button", className: "cd-btn cd-btn-primary", onClick: () => void handleSend(), disabled: !input.trim(), children: "\u53D1\u9001" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function ChatDeskEntry(props) {
  return /* @__PURE__ */ jsx2(ChatDeskPanel, { ...props });
}
export {
  ChatDeskEntry as default
};
