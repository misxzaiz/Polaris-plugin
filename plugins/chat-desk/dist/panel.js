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
