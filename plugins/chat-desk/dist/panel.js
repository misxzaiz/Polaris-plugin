var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/void-elements/index.js
var require_void_elements = __commonJS({
  "node_modules/void-elements/index.js"(exports, module) {
    module.exports = {
      "area": true,
      "base": true,
      "br": true,
      "col": true,
      "embed": true,
      "hr": true,
      "img": true,
      "input": true,
      "link": true,
      "meta": true,
      "param": true,
      "source": true,
      "track": true,
      "wbr": true
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect3, useMemo as useMemo3, useRef as useRef3, useState as useState3 } from "react";

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
  const getInitialState = () => initialState2;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState2 = state = createState(setState, getState, api);
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
  const invoke2 = getHostInvoke();
  const res = await invoke2("router_dispatch", {
    req: { target: "cap.ai.chat", payload }
  });
  if (!res.ok) {
    throw new Error(res.error || "cap.ai.chat " + String(payload.action ?? "") + " \u5931\u8D25");
  }
  return res.result;
}
async function aiChatDispatchStream(payload) {
  const invoke2 = getHostInvoke();
  const res = await invoke2("router_dispatch_stream", {
    req: { target: "cap.ai.chat", payload }
  });
  return res;
}
function subscribeChatEvent(handler) {
  const listen2 = getHostListen();
  return listen2("chat-event", handler);
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

// src/session-config/SessionConfigSelector.tsx
import React2, { useState as useState2, useCallback as useCallback2, useRef as useRef2, useEffect as useEffect2, useMemo as useMemo2 } from "react";

// node_modules/react-i18next/dist/es/Trans.js
import { useContext } from "react";

// node_modules/react-i18next/dist/es/TransWithoutContext.js
import { Fragment, isValidElement, cloneElement, createElement, Children } from "react";

// node_modules/html-parse-stringify/dist/html-parse-stringify.module.js
var import_void_elements = __toESM(require_void_elements());

// node_modules/react-i18next/dist/es/utils.js
var warn = (i18n, code, msg, rest) => {
  const args = [msg, {
    code,
    ...rest || {}
  }];
  if (i18n?.services?.logger?.forward) {
    return i18n.services.logger.forward(args, "warn", "react-i18next::", true);
  }
  if (isString(args[0])) args[0] = `react-i18next:: ${args[0]}`;
  if (i18n?.services?.logger?.warn) {
    i18n.services.logger.warn(...args);
  } else if (console?.warn) {
    console.warn(...args);
  }
};
var alreadyWarned = {};
var warnOnce = (i18n, code, msg, rest) => {
  if (isString(msg) && alreadyWarned[msg]) return;
  if (isString(msg)) alreadyWarned[msg] = /* @__PURE__ */ new Date();
  warn(i18n, code, msg, rest);
};
var loadedClb = (i18n, cb) => () => {
  if (i18n.isInitialized) {
    cb();
  } else {
    const initialized = () => {
      setTimeout(() => {
        i18n.off("initialized", initialized);
      }, 0);
      cb();
    };
    i18n.on("initialized", initialized);
  }
};
var loadNamespaces = (i18n, ns, cb) => {
  i18n.loadNamespaces(ns, loadedClb(i18n, cb));
};
var loadLanguages = (i18n, lng, ns, cb) => {
  if (isString(ns)) ns = [ns];
  if (i18n.options.preload && i18n.options.preload.indexOf(lng) > -1) return loadNamespaces(i18n, ns, cb);
  ns.forEach((n) => {
    if (i18n.options.ns.indexOf(n) < 0) i18n.options.ns.push(n);
  });
  i18n.loadLanguages(lng, loadedClb(i18n, cb));
};
var hasLoadedNamespace = (ns, i18n, options = {}) => {
  if (!i18n.languages || !i18n.languages.length) {
    warnOnce(i18n, "NO_LANGUAGES", "i18n.languages were undefined or empty", {
      languages: i18n.languages
    });
    return true;
  }
  return i18n.hasLoadedNamespace(ns, {
    lng: options.lng,
    precheck: (i18nInstance2, loadNotPending) => {
      if (options.bindI18n && options.bindI18n.indexOf("languageChanging") > -1 && i18nInstance2.services.backendConnector.backend && i18nInstance2.isLanguageChangingTo && !loadNotPending(i18nInstance2.isLanguageChangingTo, ns)) return false;
    }
  });
};
var isString = (obj) => typeof obj === "string";
var isObject = (obj) => typeof obj === "object" && obj !== null;

// node_modules/react-i18next/dist/es/unescape.js
var matchHtmlEntity = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g;
var htmlEntities = {
  "&amp;": "&",
  "&#38;": "&",
  "&lt;": "<",
  "&#60;": "<",
  "&gt;": ">",
  "&#62;": ">",
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&#34;": '"',
  "&nbsp;": " ",
  "&#160;": " ",
  "&copy;": "\xA9",
  "&#169;": "\xA9",
  "&reg;": "\xAE",
  "&#174;": "\xAE",
  "&hellip;": "\u2026",
  "&#8230;": "\u2026",
  "&#x2F;": "/",
  "&#47;": "/"
};
var unescapeHtmlEntity = (m) => htmlEntities[m];
var unescape = (text) => text.replace(matchHtmlEntity, unescapeHtmlEntity);

// node_modules/react-i18next/dist/es/defaults.js
var defaultOptions = {
  bindI18n: "languageChanged",
  bindI18nStore: "",
  transEmptyNodeValue: "",
  transSupportBasicHtmlNodes: true,
  transWrapTextNodes: "",
  transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
  useSuspense: true,
  unescape
};
var getDefaults = () => defaultOptions;

// node_modules/react-i18next/dist/es/i18nInstance.js
var i18nInstance;
var getI18n = () => i18nInstance;

// node_modules/react-i18next/dist/es/context.js
import { createContext } from "react";
var I18nContext = createContext();
var ReportNamespaces = class {
  constructor() {
    this.usedNamespaces = {};
  }
  addUsedNamespaces(namespaces) {
    namespaces.forEach((ns) => {
      if (!this.usedNamespaces[ns]) this.usedNamespaces[ns] = true;
    });
  }
  getUsedNamespaces() {
    return Object.keys(this.usedNamespaces);
  }
};

// node_modules/react-i18next/dist/es/useTranslation.js
import { useState, useEffect, useContext as useContext2, useRef, useCallback } from "react";
var usePrevious = (value, ignore) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = ignore ? ref.current : value;
  }, [value, ignore]);
  return ref.current;
};
var alwaysNewT = (i18n, language, namespace, keyPrefix) => i18n.getFixedT(language, namespace, keyPrefix);
var useMemoizedT = (i18n, language, namespace, keyPrefix) => useCallback(alwaysNewT(i18n, language, namespace, keyPrefix), [i18n, language, namespace, keyPrefix]);
var useTranslation = (ns, props = {}) => {
  const {
    i18n: i18nFromProps
  } = props;
  const {
    i18n: i18nFromContext,
    defaultNS: defaultNSFromContext
  } = useContext2(I18nContext) || {};
  const i18n = i18nFromProps || i18nFromContext || getI18n();
  if (i18n && !i18n.reportNamespaces) i18n.reportNamespaces = new ReportNamespaces();
  if (!i18n) {
    warnOnce(i18n, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next");
    const notReadyT = (k, optsOrDefaultValue) => {
      if (isString(optsOrDefaultValue)) return optsOrDefaultValue;
      if (isObject(optsOrDefaultValue) && isString(optsOrDefaultValue.defaultValue)) return optsOrDefaultValue.defaultValue;
      return Array.isArray(k) ? k[k.length - 1] : k;
    };
    const retNotReady = [notReadyT, {}, false];
    retNotReady.t = notReadyT;
    retNotReady.i18n = {};
    retNotReady.ready = false;
    return retNotReady;
  }
  if (i18n.options.react?.wait) warnOnce(i18n, "DEPRECATED_OPTION", "useTranslation: It seems you are still using the old wait option, you may migrate to the new useSuspense behaviour.");
  const i18nOptions = {
    ...getDefaults(),
    ...i18n.options.react,
    ...props
  };
  const {
    useSuspense,
    keyPrefix
  } = i18nOptions;
  let namespaces = ns || defaultNSFromContext || i18n.options?.defaultNS;
  namespaces = isString(namespaces) ? [namespaces] : namespaces || ["translation"];
  i18n.reportNamespaces.addUsedNamespaces?.(namespaces);
  const ready = (i18n.isInitialized || i18n.initializedStoreOnce) && namespaces.every((n) => hasLoadedNamespace(n, i18n, i18nOptions));
  const memoGetT = useMemoizedT(i18n, props.lng || null, i18nOptions.nsMode === "fallback" ? namespaces : namespaces[0], keyPrefix);
  const getT = () => memoGetT;
  const getNewT = () => alwaysNewT(i18n, props.lng || null, i18nOptions.nsMode === "fallback" ? namespaces : namespaces[0], keyPrefix);
  const [t2, setT] = useState(getT);
  let joinedNS = namespaces.join();
  if (props.lng) joinedNS = `${props.lng}${joinedNS}`;
  const previousJoinedNS = usePrevious(joinedNS);
  const isMounted = useRef(true);
  useEffect(() => {
    const {
      bindI18n,
      bindI18nStore
    } = i18nOptions;
    isMounted.current = true;
    if (!ready && !useSuspense) {
      if (props.lng) {
        loadLanguages(i18n, props.lng, namespaces, () => {
          if (isMounted.current) setT(getNewT);
        });
      } else {
        loadNamespaces(i18n, namespaces, () => {
          if (isMounted.current) setT(getNewT);
        });
      }
    }
    if (ready && previousJoinedNS && previousJoinedNS !== joinedNS && isMounted.current) {
      setT(getNewT);
    }
    const boundReset = () => {
      if (isMounted.current) setT(getNewT);
    };
    if (bindI18n) i18n?.on(bindI18n, boundReset);
    if (bindI18nStore) i18n?.store.on(bindI18nStore, boundReset);
    return () => {
      isMounted.current = false;
      if (i18n && bindI18n) bindI18n?.split(" ").forEach((e) => i18n.off(e, boundReset));
      if (bindI18nStore && i18n) bindI18nStore.split(" ").forEach((e) => i18n.store.off(e, boundReset));
    };
  }, [i18n, joinedNS]);
  useEffect(() => {
    if (isMounted.current && ready) {
      setT(getT);
    }
  }, [i18n, keyPrefix, ready]);
  const ret = [t2, i18n, ready];
  ret.t = t2;
  ret.i18n = i18n;
  ret.ready = ready;
  if (ready) return ret;
  if (!ready && !useSuspense) return ret;
  throw new Promise((resolve) => {
    if (props.lng) {
      loadLanguages(i18n, props.lng, namespaces, () => resolve());
    } else {
      loadNamespaces(i18n, namespaces, () => resolve());
    }
  });
};

// node_modules/react-i18next/dist/es/withTranslation.js
import { createElement as createElement2, forwardRef as forwardRefReact } from "react";

// node_modules/react-i18next/dist/es/I18nextProvider.js
import { createElement as createElement3, useMemo } from "react";

// node_modules/react-i18next/dist/es/withSSR.js
import { createElement as createElement4 } from "react";

// node_modules/react-i18next/dist/es/useSSR.js
import { useContext as useContext3 } from "react";

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement6 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
};

// node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement as createElement5 } from "react";

// node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/lucide-react/dist/esm/Icon.js
var Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => createElement5(
    "svg",
    {
      ref,
      ...defaultAttributes,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: mergeClasses("lucide", className),
      ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
      ...rest
    },
    [
      ...iconNode.map(([tag, attrs]) => createElement5(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement6(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/bot.js
var __iconNode = [
  ["path", { d: "M12 8V4H8", key: "hb8ula" }],
  ["rect", { width: "16", height: "12", x: "4", y: "8", rx: "2", key: "enze0r" }],
  ["path", { d: "M2 14h2", key: "vft8re" }],
  ["path", { d: "M20 14h2", key: "4cs60a" }],
  ["path", { d: "M15 13v2", key: "1xurst" }],
  ["path", { d: "M9 13v2", key: "rq6x2g" }]
];
var Bot = createLucideIcon("bot", __iconNode);

// node_modules/lucide-react/dist/esm/icons/chevron-down.js
var __iconNode2 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
var ChevronDown = createLucideIcon("chevron-down", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/cpu.js
var __iconNode3 = [
  ["path", { d: "M12 20v2", key: "1lh1kg" }],
  ["path", { d: "M12 2v2", key: "tus03m" }],
  ["path", { d: "M17 20v2", key: "1rnc9c" }],
  ["path", { d: "M17 2v2", key: "11trls" }],
  ["path", { d: "M2 12h2", key: "1t8f8n" }],
  ["path", { d: "M2 17h2", key: "7oei6x" }],
  ["path", { d: "M2 7h2", key: "asdhe0" }],
  ["path", { d: "M20 12h2", key: "1q8mjw" }],
  ["path", { d: "M20 17h2", key: "1fpfkl" }],
  ["path", { d: "M20 7h2", key: "1o8tra" }],
  ["path", { d: "M7 20v2", key: "4gnj0m" }],
  ["path", { d: "M7 2v2", key: "1i4yhu" }],
  ["rect", { x: "4", y: "4", width: "16", height: "16", rx: "2", key: "1vbyd7" }],
  ["rect", { x: "8", y: "8", width: "8", height: "8", rx: "1", key: "z9xiuo" }]
];
var Cpu = createLucideIcon("cpu", __iconNode3);

// node_modules/lucide-react/dist/esm/icons/plug.js
var __iconNode4 = [
  ["path", { d: "M12 22v-5", key: "1ega77" }],
  ["path", { d: "M15 8V2", key: "18g5xt" }],
  [
    "path",
    { d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z", key: "1xoxul" }
  ],
  ["path", { d: "M9 8V2", key: "14iosj" }]
];
var Plug = createLucideIcon("plug", __iconNode4);

// node_modules/lucide-react/dist/esm/icons/shield.js
var __iconNode5 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ]
];
var Shield = createLucideIcon("shield", __iconNode5);

// node_modules/lucide-react/dist/esm/icons/zap.js
var __iconNode6 = [
  [
    "path",
    {
      d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      key: "1xq2db"
    }
  ]
];
var Zap = createLucideIcon("zap", __iconNode6);

// node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t2, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t2 = 0; t2 < o; t2++) e[t2] && (f = r(e[t2])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t2, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t2 = r(e)) && (n && (n += " "), n += t2);
  return n;
}

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
var PRESET_AGENTS = [
  // 空值选项：不传 agent 参数
  {
    id: "",
    name: "\u4E0D\u8BBE\u7F6E",
    description: "\u4E0D\u4F20 Agent \u53C2\u6570\uFF0C\u4F7F\u7528 CLI \u9ED8\u8BA4\u6A21\u5F0F",
    defaultModel: void 0,
    tags: ["\u5185\u7F6E"]
  },
  // 内置 Agent
  {
    id: "general-purpose",
    name: "\u901A\u7528",
    description: "\u9ED8\u8BA4\u901A\u7528\u52A9\u624B",
    defaultModel: void 0,
    // inherit
    tags: ["\u5185\u7F6E"]
  },
  {
    id: "Explore",
    name: "\u63A2\u7D22",
    description: "\u5FEB\u901F\u63A2\u7D22\u4EE3\u7801\u5E93\uFF0C\u67E5\u627E\u6587\u4EF6\u548C\u4EE3\u7801\u6A21\u5F0F",
    defaultModel: "haiku",
    tags: ["\u5185\u7F6E"]
  },
  {
    id: "Plan",
    name: "\u89C4\u5212",
    description: "\u67B6\u6784\u8BBE\u8BA1\uFF0C\u89C4\u5212\u5B9E\u73B0\u65B9\u6848",
    defaultModel: void 0,
    // inherit
    tags: ["\u5185\u7F6E"]
  },
  {
    id: "statusline-setup",
    name: "\u72B6\u6001\u680F\u8BBE\u7F6E",
    description: "\u914D\u7F6E\u72B6\u6001\u680F\u8BBE\u7F6E",
    defaultModel: "sonnet",
    tags: ["\u5185\u7F6E"]
  },
  // 插件 Agent
  {
    id: "pua:cto-p10",
    name: "PUA:CTO",
    description: "P10 CTO / \u67B6\u6784\u59D4\u5458\u4F1A\u6A21\u5F0F\uFF0C\u5B9A\u4E49\u6218\u7565\u65B9\u5411",
    defaultModel: "opus",
    tags: ["\u63D2\u4EF6", "pua"]
  },
  {
    id: "pua:tech-lead-p9",
    name: "PUA:Tech Lead",
    description: "P9 Tech Lead \u6A21\u5F0F\uFF0C\u4EFB\u52A1\u62C6\u89E3\u4E0E\u56E2\u961F\u7BA1\u7406",
    defaultModel: void 0,
    // inherit
    tags: ["\u63D2\u4EF6", "pua"]
  },
  {
    id: "pua:senior-engineer-p7",
    name: "PUA:Senior",
    description: "P7 \u9AA8\u5E72\u6A21\u5F0F\uFF0C\u65B9\u6848\u9A71\u52A8\u6267\u884C",
    defaultModel: void 0,
    // inherit
    tags: ["\u63D2\u4EF6", "pua"]
  },
  {
    id: "superpowers:code-reviewer",
    name: "\u4EE3\u7801\u5BA1\u67E5",
    description: "\u4EE3\u7801\u5BA1\u67E5\uFF0C\u68C0\u67E5\u4EE3\u7801\u8D28\u91CF\u548C\u6700\u4F73\u5B9E\u8DF5",
    defaultModel: void 0,
    // inherit
    tags: ["\u63D2\u4EF6", "superpowers"]
  }
];
var PRESET_MODELS = [
  {
    id: "",
    name: "\u4E0D\u8BBE\u7F6E",
    description: "\u4E0D\u4F20\u6A21\u578B\u53C2\u6570\uFF0C\u4F7F\u7528 Agent \u9ED8\u8BA4\u6216 CLI \u9ED8\u8BA4\u6A21\u578B",
    isDefault: false,
    supportsStreaming: true
  },
  {
    id: "opus",
    name: "Opus",
    description: "\u6700\u5F3A\u6027\u80FD\uFF0C\u9002\u5408\u590D\u6742\u63A8\u7406\u4EFB\u52A1",
    supportsStreaming: true,
    contextWindow: 2e5
  },
  {
    id: "sonnet",
    name: "Sonnet",
    description: "\u5E73\u8861\u6027\u80FD\u548C\u901F\u5EA6\uFF0C\u9002\u5408\u5927\u591A\u6570\u4EFB\u52A1",
    isDefault: true,
    supportsStreaming: true,
    contextWindow: 2e5
  },
  {
    id: "haiku",
    name: "Haiku",
    description: "\u5FEB\u901F\u54CD\u5E94\uFF0C\u9002\u5408\u7B80\u5355\u4EFB\u52A1",
    supportsStreaming: true,
    contextWindow: 2e5
  }
];
var EFFORT_OPTIONS = [
  {
    value: "",
    label: "\u4E0D\u8BBE\u7F6E",
    description: "\u4E0D\u4F20\u52AA\u529B\u53C2\u6570\uFF0C\u4F7F\u7528 CLI \u9ED8\u8BA4\u7EA7\u522B"
  },
  {
    value: "max",
    label: "\u6700\u9AD8",
    description: "\u5168\u529B\u4EE5\u8D74\uFF0C\u6700\u9AD8\u8D28\u91CF\u8F93\u51FA"
  },
  {
    value: "xhigh",
    label: "\u6781\u9AD8",
    description: "\u9002\u5408\u590D\u6742\u7F16\u7801\u548C\u957F\u7A0B Agent \u4EFB\u52A1\uFF0C\u8D28\u91CF\u4E0E\u6210\u672C\u66F4\u5747\u8861"
  },
  {
    value: "high",
    label: "\u9AD8",
    description: "\u6DF1\u5165\u601D\u8003\uFF0C\u9002\u5408\u590D\u6742\u95EE\u9898"
  },
  {
    value: "medium",
    label: "\u4E2D",
    description: "\u5E73\u8861\u901F\u5EA6\u548C\u8D28\u91CF"
  },
  {
    value: "low",
    label: "\u4F4E",
    description: "\u5FEB\u901F\u54CD\u5E94\uFF0C\u9002\u5408\u7B80\u5355\u95EE\u9898"
  }
];
var PERMISSION_MODE_OPTIONS = [
  {
    value: "",
    label: "\u4E0D\u8BBE\u7F6E",
    description: "\u4E0D\u4F20\u6743\u9650\u53C2\u6570\uFF0C\u4F7F\u7528 CLI \u9ED8\u8BA4\u6743\u9650\u7B56\u7565"
  },
  {
    value: "default",
    label: "\u9ED8\u8BA4",
    description: "\u654F\u611F\u64CD\u4F5C\u9700\u8981\u786E\u8BA4\uFF0C\u63A8\u8350\u65E5\u5E38\u4F7F\u7528"
  },
  {
    value: "auto",
    label: "\u81EA\u52A8",
    description: "\u5B89\u5168\u64CD\u4F5C\u81EA\u52A8\u6279\u51C6\uFF0C\u9AD8\u98CE\u9669\u64CD\u4F5C\u4ECD\u4F1A\u53D7\u9650"
  },
  {
    value: "acceptEdits",
    label: "\u63A5\u53D7\u7F16\u8F91",
    description: "\u81EA\u52A8\u63A5\u53D7\u6587\u4EF6\u7F16\u8F91\uFF0C\u4F46\u4E0D\u8DF3\u8FC7\u6240\u6709\u6743\u9650\u68C0\u67E5"
  },
  {
    value: "plan",
    label: "\u89C4\u5212",
    description: "\u4EC5\u89C4\u5212\u4E0D\u6267\u884C"
  },
  {
    value: "dontAsk",
    label: "\u62D2\u7EDD\u5371\u9669",
    description: "\u62D2\u7EDD\u9700\u8981\u786E\u8BA4\u7684\u5371\u9669\u64CD\u4F5C"
  },
  {
    value: "bypassPermissions",
    label: "\u8DF3\u8FC7\u6743\u9650\uFF08\u9AD8\u98CE\u9669\uFF09",
    description: "\u7ED5\u8FC7\u6240\u6709\u6743\u9650\u68C0\u67E5\uFF0C\u4EC5\u5EFA\u8BAE\u5728\u9694\u79BB\u4E14\u65E0\u5916\u7F51\u7684\u6C99\u7BB1\u4E2D\u4F7F\u7528"
  }
];

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

// src/logger.ts
var LEVEL_COLOR = {
  debug: "#888",
  info: "#2b6cb0",
  warn: "#b7791f",
  error: "#c53030"
};
function emit(level, message, ...args) {
  if (level === "debug") return;
  const prefix = `%c[chat-desk]${message ? " " + message : ""}`;
  console[level === "warn" ? "warn" : level === "error" ? "error" : "log"](
    prefix,
    `color:${LEVEL_COLOR[level]}`,
    ...args
  );
}
function createLogger(scope) {
  const wrap = (level) => (message, ...args) => {
    try {
      emit(level, `${scope} ${message}`.trim(), ...args);
    } catch {
    }
  };
  return {
    debug: wrap("debug"),
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error")
  };
}

// src/bridgeTransport.ts
function invoke(cmd, args) {
  return getHostInvoke()(cmd, args);
}
function listen(event, handler) {
  const g = window;
  const fn = g.__POLARIS_HOST_LISTEN__;
  if (!fn) return Promise.resolve(() => {
  });
  return fn(event, handler);
}

// src/session-config/cliInfoStore.ts
var log = createLogger("CliInfoStore");
var useCliInfoStore = create((set, get) => ({
  agents: [],
  authStatus: null,
  version: null,
  tools: [],
  mcpServers: [],
  skills: [],
  slashCommands: [],
  currentModel: null,
  loading: false,
  error: null,
  lastFetched: null,
  fetchAgents: async () => {
    try {
      log.debug("\u83B7\u53D6 CLI Agent \u5217\u8868...");
      const agents = await invoke("cli_get_agents");
      log.debug(`\u83B7\u53D6\u5230 ${agents.length} \u4E2A Agent`);
      set({ agents, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("\u83B7\u53D6 Agent \u5217\u8868\u5931\u8D25", { error: msg });
      set({ error: msg });
    }
  },
  fetchAuthStatus: async () => {
    try {
      log.debug("\u83B7\u53D6\u8BA4\u8BC1\u72B6\u6001...");
      const authStatus = await invoke("cli_get_auth_status");
      log.debug(`\u8BA4\u8BC1\u72B6\u6001: loggedIn=${authStatus.loggedIn}, method=${authStatus.authMethod}`);
      set({ authStatus, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("\u83B7\u53D6\u8BA4\u8BC1\u72B6\u6001\u5931\u8D25", { error: msg });
      set({ error: msg });
    }
  },
  fetchVersion: async () => {
    try {
      const version = await invoke("cli_get_version");
      set({ version });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("\u83B7\u53D6\u7248\u672C\u5931\u8D25", { error: msg });
    }
  },
  fetchAll: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    log.debug("\u5F00\u59CB\u83B7\u53D6\u5168\u90E8 CLI \u4FE1\u606F...");
    try {
      await Promise.allSettled([
        get().fetchAgents(),
        get().fetchAuthStatus(),
        get().fetchVersion()
      ]);
      set({ lastFetched: Date.now(), loading: false });
      log.debug("CLI \u4FE1\u606F\u83B7\u53D6\u5B8C\u6210");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
    }
  },
  updateFromInit: (data) => {
    log.debug("\u4ECE init \u4E8B\u4EF6\u66F4\u65B0 CLI \u4FE1\u606F", {
      agents: data.agents?.length,
      tools: data.tools?.length,
      mcpServers: data.mcpServers?.length
    });
    const updates = {};
    if (data.tools && data.tools.length > 0) {
      updates.tools = data.tools;
    }
    if (data.mcpServers && data.mcpServers.length > 0) {
      updates.mcpServers = data.mcpServers;
    }
    if (data.skills && data.skills.length > 0) {
      updates.skills = data.skills;
    }
    if (data.slashCommands && data.slashCommands.length > 0) {
      updates.slashCommands = data.slashCommands;
    }
    if (data.model) {
      updates.currentModel = data.model;
    }
    if (data.claudeCodeVersion) {
      updates.version = data.claudeCodeVersion;
    }
    if (data.agents && data.agents.length > 0) {
      const existingAgents = get().agents;
      if (existingAgents.length === 0) {
        updates.agents = data.agents.map((id) => ({
          id,
          name: id.split(":").pop() || id,
          source: id.includes(":") ? "plugin" : "builtin"
        }));
      }
    }
    if (Object.keys(updates).length > 0) {
      set(updates);
      log.debug("CLI \u4FE1\u606F\u66F4\u65B0\u5B8C\u6210", updates);
    }
  },
  reset: () => {
    set({
      agents: [],
      authStatus: null,
      version: null,
      tools: [],
      mcpServers: [],
      skills: [],
      slashCommands: [],
      currentModel: null,
      loading: false,
      error: null,
      lastFetched: null
    });
  },
  initEventListeners: () => {
    let unlisten = null;
    listen("cli_init", (event) => {
      log.debug("\u6536\u5230 cli_init \u4E8B\u4EF6", { agents: event.agents?.length });
      get().updateFromInit(event);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }
}));

// src/session-config/agentCorpusService.ts
async function getRosters() {
  const raw = await invoke("agent_corpus_rosters");
  return raw?.rosters ?? [];
}
async function listCustomAgents() {
  return invoke("custom_agent_list");
}
async function saveCustomAgent(params) {
  return invoke("custom_agent_save", params);
}
async function deleteCustomAgent(slug) {
  return invoke("custom_agent_delete", { slug });
}

// src/session-config/agentStore.ts
var log2 = createLogger("AgentStore");
function toCatalogEntry(c) {
  return {
    slug: c.slug,
    name: c.name,
    description: c.description,
    emoji: c.emoji ?? "",
    color: "",
    division: "custom"
  };
}
var useAgentStore = create()((set, get) => ({
  catalog: [],
  loading: false,
  loaded: false,
  error: null,
  simpleAiAgents: [],
  rosters: [],
  customAgents: [],
  search: "",
  division: null,
  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    await get().loadCustomAgents();
    set({ loading: false, loaded: true });
  },
  loadSimpleAiAgents: async () => {
    try {
      const agents = await invoke("simple_ai_list_agents");
      set({ simpleAiAgents: agents });
    } catch (err) {
      log2.warn("SimpleAI agent list load failed", { error: String(err) });
    }
  },
  loadRosters: async () => {
    try {
      set({ rosters: await getRosters() });
    } catch (err) {
      log2.warn("Rosters load failed", { error: String(err) });
    }
  },
  loadCustomAgents: async () => {
    try {
      const customAgents = await listCustomAgents();
      set({ customAgents, catalog: customAgents.map(toCatalogEntry), loaded: true });
    } catch (err) {
      log2.warn("Custom agents load failed", { error: String(err) });
    }
  },
  saveCustom: async (params) => {
    await saveCustomAgent(params);
    await get().loadCustomAgents();
  },
  deleteCustom: async (slug) => {
    await deleteCustomAgent(slug);
    await get().loadCustomAgents();
  },
  setSearch: (search) => set({ search }),
  setDivision: (division) => set({ division }),
  filtered: () => {
    const { catalog, search, division } = get();
    const q = search.trim().toLowerCase();
    return catalog.filter(
      (a) => (!division || a.division === division) && (!q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
    );
  }
}));

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
function getSessionConfigHostDeps() {
  return deps;
}
async function fetchHostConfig() {
  try {
    const invoke2 = getHostInvoke();
    const res = await invoke2("router_dispatch", {
      req: { target: "cap.config", payload: { action: "get", section: "full" } }
    });
    if (!res?.ok) return null;
    return res.result ?? null;
  } catch {
    return null;
  }
}

// src/session-config/modelProfile.ts
var OFFICIAL_API_PROFILE = "__official_api__";
function generateProfileId() {
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function resolveTargetEngines(profile) {
  if (profile.targetEngines && profile.targetEngines.length > 0) {
    return profile.targetEngines;
  }
  const old = profile.targetEngine;
  if (!old || old === "both" || old === "all") {
    return [];
  }
  return [old];
}
function isProfileForEngine(profile, engine) {
  const engines = resolveTargetEngines(profile);
  return engines.length === 0 || engines.includes(engine);
}
function profileModelOptions(profile) {
  const base = profile.modelOptions?.length ? profile.modelOptions : [profile.model];
  return base.filter((m) => Boolean(m));
}

// src/session-config/modelProfileStore.ts
var initialState = {
  profiles: [],
  activeProfileId: null,
  loading: false,
  error: null
};
var useModelProfileStore = create()((set, get) => ({
  ...initialState,
  setProfiles: (profiles) => {
    const activeProfile = profiles.find((p) => p.active);
    set({
      profiles,
      activeProfileId: activeProfile?.id ?? null
    });
  },
  setActiveProfileId: (id) => {
    set({ activeProfileId: id });
  },
  addProfile: (params) => {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const profile = {
      id: generateProfileId(),
      name: params.name,
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      model: params.model,
      modelOptions: params.modelOptions,
      wireApi: params.wireApi,
      targetEngines: params.targetEngines,
      category: params.category,
      description: params.description,
      authType: params.authType,
      apiKeyEnvName: params.apiKeyEnvName,
      customHeaders: params.customHeaders,
      customEnv: params.customEnv,
      maxTokens: params.maxTokens,
      contextWindow: params.contextWindow,
      active: false,
      createdAt: now,
      updatedAt: now
    };
    set((state) => ({
      profiles: [...state.profiles, profile]
    }));
    return profile;
  },
  updateProfile: (params) => {
    const { id, ...updates } = params;
    let updated = null;
    set((state) => ({
      profiles: state.profiles.map((p) => {
        if (p.id === id) {
          updated = {
            ...p,
            ...updates,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          return updated;
        }
        return p;
      })
    }));
    return updated;
  },
  removeProfile: (id) => {
    set((state) => {
      const newProfiles = state.profiles.filter((p) => p.id !== id);
      const newActiveId = state.activeProfileId === id ? null : state.activeProfileId;
      return {
        profiles: newProfiles,
        activeProfileId: newActiveId
      };
    });
  },
  activateProfile: (id) => {
    set((state) => ({
      profiles: state.profiles.map((p) => ({
        ...p,
        active: p.id === id
      })),
      activeProfileId: id
    }));
  },
  getActiveProfile: () => {
    const { profiles, activeProfileId } = get();
    if (!activeProfileId) return void 0;
    return profiles.find((p) => p.id === activeProfileId);
  },
  getProfileById: (id) => {
    if (!id) return void 0;
    return get().profiles.find((p) => p.id === id);
  },
  getProfilesByEngine: (engine) => {
    const { profiles } = get();
    return profiles.filter((p) => isProfileForEngine(p, engine));
  },
  reset: () => {
    set(initialState);
  }
}));

// src/session-config/engineMetadataStore.ts
var log3 = createLogger("EngineMetadataStore");
var useEngineMetadataStore = create((set, get) => ({
  metadatas: [],
  loaded: false,
  loading: false,
  error: null,
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });
    try {
      const metadatas = await invoke("get_engine_metadata_list");
      set({ metadatas, loaded: true, loading: false });
      log3.info(`\u5DF2\u52A0\u8F7D ${metadatas.length} \u4E2A\u5F15\u64CE\u5143\u6570\u636E`);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      log3.error("\u52A0\u8F7D\u5F15\u64CE\u5143\u6570\u636E\u5931\u8D25", err);
      set({ error: err.message, loading: false });
    }
  },
  /** 重新加载引擎元数据（强制重新请求） */
  reload: async () => {
    set({ loaded: false, loading: false });
    await get().load();
  },
  getEngine: (engineId) => {
    return get().metadatas.find((m) => m.id === engineId);
  },
  getEngineIds: () => {
    return get().metadatas.map((m) => m.id);
  },
  getEngineDisplayName: (engineId) => {
    const meta = get().getEngine(engineId);
    if (meta) {
      const name = meta.name;
      if (name === "Claude Code") return "Claude";
      return name;
    }
    return engineId;
  },
  getEngineFullName: (engineId) => {
    const meta = get().getEngine(engineId);
    return meta?.name ?? engineId;
  },
  hasEngine: (engineId) => {
    return get().metadatas.some((m) => m.id === engineId);
  }
}));

// src/session-config/engineDisplay.ts
function normalizeEngineId(engineId) {
  if (!engineId) return "claude-code";
  const metadatas = useEngineMetadataStore.getState().metadatas;
  if (metadatas.length === 0) {
    const fallback = ["claude-code", "simple-ai"];
    return fallback.includes(engineId) ? engineId : "claude-code";
  }
  return metadatas.some((m) => m.id === engineId) ? engineId : "claude-code";
}

// src/session-config/engineCapabilities.ts
var FALLBACK_ENGINE_SELECTOR_CAPABILITIES = {
  "claude-code": ["agent", "model", "effort", "permission", "profile"],
  "simple-ai": ["agent", "model", "effort", "profile"]
};
function deriveSelectorsFromCapabilities(engineId) {
  const meta = useEngineMetadataStore.getState().getEngine(engineId);
  if (!meta) {
    return FALLBACK_ENGINE_SELECTOR_CAPABILITIES[engineId] ?? FALLBACK_ENGINE_SELECTOR_CAPABILITIES["claude-code"];
  }
  if (meta.sessionConfig?.selectors && meta.sessionConfig.selectors.length > 0) {
    return meta.sessionConfig.selectors;
  }
  const caps = meta.capabilities;
  const selectors = ["profile"];
  if (caps.tools) selectors.push("agent");
  selectors.push("model");
  if (caps.interrupt) selectors.push("effort");
  if (caps.stdinInput) selectors.push("permission");
  return selectors;
}
function getEngineEffortOptions(engineId) {
  const id = normalizeEngineId(engineId);
  const meta = useEngineMetadataStore.getState().getEngine(id);
  return meta?.sessionConfig?.effortOptions ?? null;
}
function getEnginePermissionOptions(engineId) {
  const id = normalizeEngineId(engineId);
  const meta = useEngineMetadataStore.getState().getEngine(id);
  return meta?.sessionConfig?.permissionOptions ?? null;
}
function getEngineSelectors(engineId) {
  const id = normalizeEngineId(engineId);
  return deriveSelectorsFromCapabilities(id);
}

// src/session-config/SessionConfigSelector.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function wireApiBadge(wireApi) {
  switch (wireApi) {
    case "openai-chat-completions":
      return "\u{1F535}";
    case "openai-responses":
      return "\u{1F7E2}";
    default:
      return "\u{1F7E3}";
  }
}
function safeHostname(baseUrl) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}
function SessionConfigSelector({
  config,
  onChange,
  disabled = false,
  visibleTypes,
  variant = "inline",
  engineOverride,
  writeThroughToSession = true
}) {
  const { t: t2 } = useTranslation("chat");
  const [openDropdown, setOpenDropdown] = useState2(null);
  const [customInput, setCustomInput] = useState2(null);
  const containerRef = useRef2(null);
  const inputRef = useRef2(null);
  useEffect2(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const profiles = useModelProfileStore((s) => s.profiles);
  const hostDeps = getSessionConfigHostDeps();
  const hostConfig = hostDeps.getConfig();
  const activeMeta = hostDeps.getActiveSessionMeta();
  const defaultEngine = hostConfig?.defaultEngine;
  const activeEngineId = normalizeEngineId(engineOverride ?? activeMeta?.engineId ?? defaultEngine);
  const currentEngine = activeEngineId === "simple-ai" ? "simple-ai" : activeEngineId === "claude-code" ? "claude" : activeEngineId;
  const isSimpleAiEngine = currentEngine === "simple-ai";
  useEffect2(() => {
    if (isSimpleAiEngine) {
      void useAgentStore.getState().loadSimpleAiAgents();
    }
  }, [isSimpleAiEngine]);
  const engineMetadatas = useEngineMetadataStore((s) => s.metadatas);
  const engineDeclaredModels = useMemo2(
    () => engineMetadatas.find((m) => m.id === currentEngine)?.models?.filter(Boolean) ?? null,
    [engineMetadatas, currentEngine]
  );
  const dynamicAgents = useCliInfoStore((s) => s.agents);
  const simpleAiAgents = useAgentStore((s) => s.simpleAiAgents);
  const agentList = useMemo2(() => {
    const emptyOption = { id: "", name: t2("sessionConfig.noAgent"), description: t2("sessionConfig.noAgentDesc") };
    if (isSimpleAiEngine) {
      return [
        emptyOption,
        ...simpleAiAgents.map((a) => ({
          id: a.slug,
          name: `${a.emoji ? a.emoji + " " : ""}${a.name}`,
          description: a.description
        }))
      ];
    }
    if (dynamicAgents.length > 0) {
      return [
        emptyOption,
        ...dynamicAgents.map((a) => ({
          id: a.id,
          name: a.name,
          description: `${a.source === "plugin" ? t2("sessionConfig.pluginSource") : t2("sessionConfig.builtinSource")}${a.defaultModel ? ` \xB7 ${a.defaultModel}` : ""}`
        }))
      ];
    }
    return PRESET_AGENTS;
  }, [dynamicAgents, simpleAiAgents, isSimpleAiEngine, t2]);
  const modelList = useMemo2(() => {
    if (engineDeclaredModels && engineDeclaredModels.length > 0) {
      return [
        { id: "", name: t2("sessionConfig.noModel"), description: "", supportsStreaming: true },
        ...engineDeclaredModels.map((m) => ({
          id: m,
          name: m,
          description: "",
          supportsStreaming: true
        }))
      ];
    }
    const profileId = config.modelProfileId;
    if (!profileId) {
      if (currentEngine === "simple-ai") return [];
      return PRESET_MODELS;
    }
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) {
      if (currentEngine === "simple-ai") return [];
      return PRESET_MODELS;
    }
    const options = (profile.modelOptions?.length ? profile.modelOptions : [profile.model]).filter(Boolean);
    return options.map((m) => ({
      id: m,
      name: m,
      description: "",
      supportsStreaming: true
    }));
  }, [config.modelProfileId, profiles, currentEngine, engineDeclaredModels, t2]);
  useEffect2(() => {
    if (disabled || config.profileMode !== "profile" || !config.modelProfileId) return;
    const profile = profiles.find((p) => p.id === config.modelProfileId);
    if (!profile || !config.model) return;
    if (profileModelOptions(profile).includes(config.model)) return;
    onChange({ ...config, model: "" });
  }, [profiles, config.modelProfileId, config.profileMode, disabled]);
  const compatibleProfiles = useMemo2(() => {
    return profiles.filter((p) => isProfileForEngine(p, currentEngine));
  }, [profiles, currentEngine]);
  const getAgentLabel = useCallback2((agentId) => {
    if (!agentId) return t2("sessionConfig.noAgent");
    const agent = agentList.find((a) => a.id === agentId);
    if (agent?.name) return agent.name;
    const entry = useAgentStore.getState().catalog.find((c) => c.slug === agentId) ?? useAgentStore.getState().customAgents.find((c) => c.slug === agentId);
    if (entry) return `${"emoji" in entry && entry.emoji ? entry.emoji + " " : ""}${entry.name}`;
    return agentId;
  }, [t2, agentList]);
  const getModelLabel = useCallback2((modelId) => {
    if (!modelId) return t2("sessionConfig.noModel");
    const activeProfile = profiles.find((p) => p.id === config.modelProfileId);
    if (activeProfile) {
      const options = activeProfile.modelOptions?.length ? activeProfile.modelOptions : [activeProfile.model];
      if (options.includes(modelId)) return modelId;
    }
    const model = PRESET_MODELS.find((m) => m.id === modelId);
    return model?.name || modelId;
  }, [t2, profiles, config.modelProfileId]);
  const getEffortLabel = useCallback2((effort) => {
    if (!effort) return t2("sessionConfig.noEffort");
    const declared = getEngineEffortOptions(currentEngine)?.find((o) => o.value === effort);
    if (declared) return declared.label;
    const opt = EFFORT_OPTIONS.find((o) => o.value === effort);
    return opt?.label || effort;
  }, [t2, currentEngine]);
  const getPermissionLabel = useCallback2((mode) => {
    if (!mode) return t2("sessionConfig.noPermission");
    const declared = getEnginePermissionOptions(currentEngine)?.find((o) => o.value === mode);
    if (declared) return declared.label;
    const opt = PERMISSION_MODE_OPTIONS.find((o) => o.value === mode);
    return opt?.label || mode;
  }, [t2, currentEngine]);
  const handleSelect = useCallback2((type, value) => {
    if (value === "__skipped__") return;
    const configKey = type === "permission" ? "permissionMode" : type === "profile" ? "modelProfileId" : type;
    const nextConfig = {
      [configKey]: value
    };
    if (type === "profile") {
      nextConfig.model = "";
      if (value === "") {
        nextConfig.profileMode = "official";
        nextConfig.modelProfileId = "";
      } else {
        nextConfig.profileMode = "profile";
        nextConfig.modelProfileId = value;
      }
    }
    onChange({
      ...config,
      ...nextConfig
    });
    const activeId = writeThroughToSession ? hostDeps.getActiveSessionMeta()?.sessionId ?? null : null;
    if (activeId) {
      if (type === "profile") {
        if (value === "") {
          hostDeps.writeBackSessionOverrides(activeId, { modelProfileId: OFFICIAL_API_PROFILE, profileMode: "official" });
        } else {
          hostDeps.writeBackSessionOverrides(activeId, { modelProfileId: value, profileMode: "profile" });
        }
      } else if (type === "model") {
        hostDeps.writeBackSessionOverrides(activeId, { model: value });
      } else if (type === "agent") {
        hostDeps.writeBackSessionOverrides(activeId, { agent: value || null });
      }
    }
    setOpenDropdown(null);
  }, [config, onChange, writeThroughToSession]);
  const handleCustomInputConfirm = useCallback2((type) => {
    if (!customInput || customInput.type !== type) return;
    const value = customInput.value.trim();
    if (value) {
      handleSelect(type, value);
    }
    setCustomInput(null);
  }, [customInput, handleSelect]);
  const openCustomInput = useCallback2((type) => {
    setCustomInput({ type, value: "" });
    setOpenDropdown(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);
  const renderDropdown = (type) => {
    if (openDropdown !== type) return null;
    const items = [];
    switch (type) {
      case "agent":
        items.push(...agentList.map((a) => ({
          value: a.id,
          label: a.name,
          description: a.description
        })));
        break;
      case "model":
        items.push(...modelList.map((m) => ({
          value: m.id,
          label: m.name,
          description: m.description
        })));
        break;
      case "effort": {
        const opts = getEngineEffortOptions(currentEngine) ?? EFFORT_OPTIONS;
        items.push(...opts.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description
        })));
        break;
      }
      case "permission": {
        const opts = getEnginePermissionOptions(currentEngine) ?? PERMISSION_MODE_OPTIONS;
        items.push(...opts.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description
        })));
        break;
      }
      case "profile": {
        items.push({
          value: "",
          label: t2("sessionConfig.officialApi"),
          description: t2("sessionConfig.officialApiDesc")
        });
        items.push(...compatibleProfiles.map((p) => {
          const modelCount = p.modelOptions?.length || 1;
          return {
            value: p.id,
            label: `${wireApiBadge(p.wireApi)} ${p.name}`,
            description: p.description || `${p.baseUrl ? safeHostname(p.baseUrl) : ""} \xB7 ${modelCount} \u4E2A\u6A21\u578B`
          };
        }));
        const skippedCount = profiles.length - compatibleProfiles.length;
        if (skippedCount > 0) {
          items.push({
            value: "__skipped__",
            label: `\u2026 \u53E6\u6709 ${skippedCount} \u4E2A Profile \u4E0D\u9002\u7528\u4E8E\u5F53\u524D\u5F15\u64CE`,
            description: "",
            disabled: true
          });
        }
        break;
      }
    }
    const getCurrentValue = () => {
      switch (type) {
        case "agent":
          return config.agent;
        case "model":
          return config.model;
        case "effort":
          return config.effort;
        case "permission":
          return config.permissionMode;
        case "profile": {
          const mode = config.profileMode ?? "profile";
          if (mode === "official") return "";
          return config.modelProfileId ?? "";
        }
        default:
          return void 0;
      }
    };
    const currentValue = getCurrentValue();
    return /* @__PURE__ */ jsxs("div", { className: clsx(
      "absolute bottom-full left-0 mb-1",
      "bg-background-elevated border border-border rounded-lg shadow-lg",
      "min-w-[180px] max-h-[240px] overflow-y-auto",
      "z-dropdown animate-panel-in"
    ), children: [
      items.map((item) => /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => !item.disabled && handleSelect(type, item.value),
          disabled: item.disabled,
          title: item.disabled ? item.description : void 0,
          className: clsx(
            "w-full px-3 py-2 text-left text-xs",
            "transition-colors",
            "flex flex-col gap-0.5",
            item.disabled ? "opacity-50 cursor-not-allowed hover:bg-transparent" : "hover:bg-background-hover",
            currentValue === item.value && "bg-primary/10 text-primary"
          ),
          children: [
            /* @__PURE__ */ jsx("span", { className: "font-medium", children: item.label }),
            item.description && /* @__PURE__ */ jsx("span", { className: "text-text-tertiary text-[10px]", children: item.description })
          ]
        },
        item.value
      )),
      /* @__PURE__ */ jsx("div", { className: "border-t border-border my-1" }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => openCustomInput(type),
          className: clsx(
            "w-full px-3 py-2 text-left text-xs",
            "hover:bg-background-hover transition-colors",
            "text-text-tertiary italic"
          ),
          children: [
            "\u270F\uFE0F ",
            t2("sessionConfig.custom")
          ]
        }
      )
    ] });
  };
  const selectorMeta = {
    agent: {
      icon: /* @__PURE__ */ jsx(Bot, { size: 12 }),
      label: t2("sessionConfig.agent"),
      getValue: () => getAgentLabel(config.agent)
    },
    model: {
      icon: /* @__PURE__ */ jsx(Cpu, { size: 12 }),
      label: t2("sessionConfig.model"),
      getValue: () => getModelLabel(config.model)
    },
    effort: {
      icon: /* @__PURE__ */ jsx(Zap, { size: 12 }),
      label: t2("sessionConfig.effort"),
      getValue: () => getEffortLabel(config.effort)
    },
    permission: {
      icon: /* @__PURE__ */ jsx(Shield, { size: 12 }),
      label: t2("sessionConfig.permission"),
      getValue: () => getPermissionLabel(config.permissionMode)
    },
    profile: {
      icon: /* @__PURE__ */ jsx(Plug, { size: 12 }),
      label: t2("sessionConfig.provider"),
      getValue: () => {
        const mode = config.profileMode ?? "profile";
        if (mode === "official") return t2("sessionConfig.officialApi");
        if (!config.modelProfileId) return t2("sessionConfig.noProfile");
        const profile = profiles.find((p) => p.id === config.modelProfileId);
        if (!profile) return t2("sessionConfig.noProfile");
        return `${wireApiBadge(profile.wireApi)} ${profile.name}`;
      }
    }
  };
  const VALUE_MAX_W = {
    profile: "max-w-[140px]",
    model: "max-w-[90px]",
    effort: "max-w-[64px]",
    agent: "max-w-[90px]",
    permission: "max-w-[72px]"
  };
  const renderSelector = (type, mode) => {
    const { icon, label, getValue } = selectorMeta[type];
    const currentValue = getValue();
    return /* @__PURE__ */ jsxs("div", { className: clsx("relative", mode === "panel" && "w-full"), children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => !disabled && setOpenDropdown(openDropdown === type ? null : type),
          disabled,
          className: clsx(
            "flex items-center gap-1 rounded text-xs transition-colors",
            mode === "panel" ? "w-full px-2 py-1" : "px-1.5 py-0.5",
            disabled ? "text-text-muted cursor-not-allowed" : "text-text-tertiary hover:text-text-primary hover:bg-background-hover",
            openDropdown === type && "bg-primary/10 text-primary"
          ),
          title: t2(`sessionConfig.${type}Tooltip`),
          children: [
            /* @__PURE__ */ jsx("span", { className: "shrink-0", children: icon }),
            mode === "panel" && /* @__PURE__ */ jsx("span", { className: "shrink-0 text-text-muted", children: label }),
            /* @__PURE__ */ jsx("span", { className: clsx("truncate", mode === "panel" ? "flex-1 text-left" : VALUE_MAX_W[type]), children: currentValue }),
            /* @__PURE__ */ jsx(ChevronDown, { size: 12, className: "opacity-50 shrink-0" })
          ]
        }
      ),
      renderDropdown(type)
    ] });
  };
  const ALL_TYPES = ["agent", "model", "effort", "permission", "profile"];
  const allowedByEngine = getEngineSelectors(activeEngineId);
  const typesToShow = (visibleTypes ?? ALL_TYPES).filter((t3) => allowedByEngine.includes(t3));
  return /* @__PURE__ */ jsxs("div", { ref: containerRef, className: clsx(variant === "panel" ? "flex flex-col gap-0.5 w-full" : "flex items-center gap-1"), children: [
    typesToShow.map((type) => /* @__PURE__ */ jsx(React2.Fragment, { children: renderSelector(type, variant) }, type)),
    customInput && /* @__PURE__ */ jsx("div", { className: "fixed inset-0 z-modal flex items-center justify-center bg-black/30", children: /* @__PURE__ */ jsxs("div", { className: "bg-background-elevated border border-border rounded-lg p-4 min-w-[280px] shadow-xl", children: [
      /* @__PURE__ */ jsx("div", { className: "text-xs text-text-secondary mb-2", children: t2("sessionConfig.customInputLabel", { type: selectorMeta[customInput.type].label }) }),
      /* @__PURE__ */ jsx(
        "input",
        {
          ref: inputRef,
          type: "text",
          value: customInput.value,
          onChange: (e) => setCustomInput({ ...customInput, value: e.target.value }),
          onKeyDown: (e) => {
            if (e.key === "Enter") handleCustomInputConfirm(customInput.type);
            if (e.key === "Escape") setCustomInput(null);
          },
          className: "w-full px-3 py-2 text-sm bg-background-surface border border-border rounded-lg outline-none focus:border-primary",
          placeholder: t2("sessionConfig.customInputPlaceholder", { type: customInput.type })
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 mt-3", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setCustomInput(null),
            className: "px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary",
            children: t2("sessionConfig.cancel")
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => handleCustomInputConfirm(customInput.type),
            className: "px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary-hover",
            children: t2("sessionConfig.confirm")
          }
        )
      ] })
    ] }) })
  ] });
}

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

// src/Panel.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs2("div", { className: `cd-msg ${isUser ? "cd-msg-user" : ""}`, children: [
    /* @__PURE__ */ jsxs2("div", { className: `cd-role ${isUser ? "cd-role-user" : "cd-role-ai"}`, children: [
      isUser ? "\u7528\u6237" : "Polaris",
      message.timestamp ? ` \xB7 ${formatTime(message.timestamp)}` : ""
    ] }),
    isUser ? /* @__PURE__ */ jsx2("div", { className: "cd-bubble", children: message.content }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
      (message.blocks ?? []).map((b, i) => {
        if (b.type === "thinking") {
          return /* @__PURE__ */ jsx2("div", { className: "cd-think", children: b.content }, i);
        }
        if (b.type === "tool_call") {
          return /* @__PURE__ */ jsxs2("div", { className: "cd-tool", children: [
            /* @__PURE__ */ jsxs2("span", { className: "cd-tool-name", children: [
              "\u{1F527} ",
              b.name
            ] }),
            /* @__PURE__ */ jsx2(
              "span",
              {
                className: b.status === "success" ? "cd-tool-status-ok" : b.status === "error" ? "cd-tool-status-err" : "",
                children: b.status === "running" ? "\u8FD0\u884C\u4E2D\u2026" : b.status === "success" ? "\u5B8C\u6210" : "\u5931\u8D25"
              }
            )
          ] }, i);
        }
        return /* @__PURE__ */ jsx2("div", { className: "cd-bubble", children: b.content }, i);
      }),
      message.isStreaming && /* @__PURE__ */ jsx2("span", { className: "cd-caret", "aria-hidden": "true" })
    ] })
  ] });
}
function SessionRow({
  session,
  active,
  onSelect,
  onDelete
}) {
  return /* @__PURE__ */ jsxs2(
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
        /* @__PURE__ */ jsxs2("span", { className: "cd-sess-title", children: [
          session.title,
          session.isStreaming ? " \u23F3" : ""
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: "cd-sess-meta", children: [
          session.messages.length,
          " \u6761"
        ] }),
        /* @__PURE__ */ jsx2(
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
  const [state, setState] = useState3(() => chatDeskStore.getState());
  const [input, setInput] = useState3("");
  const [showSessions, setShowSessions] = useState3(true);
  const [hostConfig, setHostConfig] = useState3(null);
  const hostConfigRef = useRef3(null);
  const msgsRef = useRef3(null);
  const sessionConfigState = useSessionConfig((s) => s);
  useEffect3(() => {
    const unsub = chatDeskStore.subscribe(() => setState({ ...chatDeskStore.getState() }));
    return () => {
      unsub();
    };
  }, []);
  useEffect3(() => {
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
  const sessionsList = useMemo3(() => Array.from(state.sessions.values()), [state.sessions]);
  useEffect3(() => {
    const el = msgsRef.current;
    if (!el || !active?.isStreaming) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, active?.currentMessage, active?.isStreaming]);
  const handleSend = useCallback3(async () => {
    const text = input.trim();
    if (!text || !state.activeSessionId || active?.isStreaming) return;
    setInput("");
    await chatDeskStore.getState().sendMessage(state.activeSessionId, text);
  }, [input, state.activeSessionId, active?.isStreaming]);
  const handleInterrupt = useCallback3(async () => {
    if (!state.activeSessionId) return;
    await chatDeskStore.getState().interrupt(state.activeSessionId);
  }, [state.activeSessionId]);
  const handleDelete = useCallback3(
    (sessionId) => {
      chatDeskStore.getState().deleteSession(sessionId);
    },
    []
  );
  const handleNewSession = useCallback3(() => {
    chatDeskStore.getState().createSession({ title: "\u65B0\u5BF9\u8BDD" });
  }, []);
  const handleExport = useCallback3(async () => {
  }, []);
  return /* @__PURE__ */ jsxs2("div", { className: "cd-root", children: [
    /* @__PURE__ */ jsxs2("div", { className: "cd-toolbar", children: [
      /* @__PURE__ */ jsx2("button", { type: "button", className: "cd-btn", onClick: () => setShowSessions((v) => !v), children: "\u2630" }),
      /* @__PURE__ */ jsx2("span", { className: "cd-title", children: active ? active.title : "AI \u5BF9\u8BDD" }),
      /* @__PURE__ */ jsx2("span", { className: `cd-badge ${active?.isStreaming ? "" : "cd-badge-off"}`, children: active?.isStreaming ? active.isInterrupting ? "\u4E2D\u65AD\u4E2D\u2026" : "\u8FD0\u884C\u4E2D" : "\u7A7A\u95F2" }),
      /* @__PURE__ */ jsx2("button", { type: "button", className: "cd-btn", onClick: handleNewSession, children: "+ \u65B0\u4F1A\u8BDD" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "cd-configrow", children: /* @__PURE__ */ jsx2(
      SessionConfigSelector,
      {
        config: sessionConfigState.config,
        onChange: (next) => useSessionConfig.getState().setConfig(next),
        disabled: active?.isStreaming
      }
    ) }),
    showSessions && /* @__PURE__ */ jsx2("div", { className: "cd-sessions", children: sessionsList.map((s) => /* @__PURE__ */ jsx2(
      SessionRow,
      {
        session: s,
        active: s.sessionId === state.activeSessionId,
        onSelect: () => chatDeskStore.getState().switchSession(s.sessionId),
        onDelete: () => handleDelete(s.sessionId)
      },
      s.sessionId
    )) }),
    /* @__PURE__ */ jsx2("div", { className: "cd-msgs", ref: msgsRef, children: !active || active.messages.length === 0 && !active.currentMessage && !active.error ? /* @__PURE__ */ jsxs2("div", { className: "cd-empty", children: [
      /* @__PURE__ */ jsx2("div", { children: "\u5F00\u59CB\u65B0\u7684\u5BF9\u8BDD" }),
      /* @__PURE__ */ jsx2("div", { children: "\u8F93\u5165\u6D88\u606F\u53D1\u9001\u7ED9 AI\uFF08P2 \u9AA8\u67B6\uFF1A\u6587\u672C/\u601D\u8003/\u5DE5\u5177\u5757\u6E32\u67D3\uFF09" })
    ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
      active.error && /* @__PURE__ */ jsx2("div", { className: "cd-err", children: active.error }),
      active.messages.map((m) => /* @__PURE__ */ jsx2(MessageBubble, { message: m }, m.id)),
      active.currentMessage && /* @__PURE__ */ jsx2(MessageBubble, { message: active.currentMessage })
    ] }) }),
    /* @__PURE__ */ jsxs2("div", { className: "cd-inputrow", children: [
      /* @__PURE__ */ jsx2(
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
      active?.isStreaming ? /* @__PURE__ */ jsx2("button", { type: "button", className: "cd-btn cd-btn-danger", onClick: () => void handleInterrupt(), disabled: active.isInterrupting, children: active.isInterrupting ? "\u4E2D\u65AD\u4E2D\u2026" : "\u25A0 \u505C\u6B62" }) : /* @__PURE__ */ jsx2("button", { type: "button", className: "cd-btn cd-btn-primary", onClick: () => void handleSend(), disabled: !input.trim(), children: "\u53D1\u9001" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function ChatDeskEntry(props) {
  return /* @__PURE__ */ jsx3(ChatDeskPanel, { ...props });
}
export {
  ChatDeskEntry as default
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/defaultAttributes.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/bot.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-down.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/cpu.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/plug.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/shield.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/zap.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
