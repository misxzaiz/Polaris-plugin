// src/deps.ts
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u3002");
  return c;
}
function getEventBus(...args) {
  return core().services.hostAiEventBus ?? args[0];
}
function generateUUID() {
  const g = globalThis;
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r2 = Math.random() * 16 | 0;
    const v = ch === "x" ? r2 : r2 & 3 | 8;
    return v.toString(16);
  });
}

// src/DeveloperPanel.tsx
import { useState, useEffect, useMemo, useRef } from "react";

// locales/zh-CN.json
var zh_CN_default = {
  title: "Developer",
  filter: {
    all: "\u5168\u90E8\u4E8B\u4EF6",
    byTaskId: "\u6309 Task ID",
    bySessionId: "\u6309 Session ID",
    allTypes: "\u5168\u90E8\u7C7B\u578B",
    taskIdPlaceholder: "Task ID...",
    sessionIdPlaceholder: "Session ID..."
  },
  events: {
    noEvents: "\u6682\u65E0\u4E8B\u4EF6",
    copyJson: "\u590D\u5236 JSON",
    clearEvents: "\u6E05\u7A7A\u4E8B\u4EF6",
    maxEvents: "\u6700\u5927\u4E8B\u4EF6\u6570:",
    total: "\u603B\u8BA1:",
    filtered: "\u5DF2\u8FC7\u6EE4:"
  },
  scroll: {
    autoOn: "\u81EA\u52A8\u6EDA\u52A8: \u5F00",
    autoOff: "\u81EA\u52A8\u6EDA\u52A8: \u5173"
  },
  panel: {
    collapse: "\u6298\u53E0\u9762\u677F",
    expand: "\u5C55\u5F00 Developer \u9762\u677F"
  }
};

// locales/en-US.json
var en_US_default = {
  title: "Developer",
  filter: {
    all: "All Events",
    byTaskId: "By Task ID",
    bySessionId: "By Session ID",
    allTypes: "All Types",
    taskIdPlaceholder: "Task ID...",
    sessionIdPlaceholder: "Session ID..."
  },
  events: {
    noEvents: "No events",
    copyJson: "Copy JSON",
    clearEvents: "Clear events",
    maxEvents: "Max events:",
    total: "Total:",
    filtered: "Filtered:"
  },
  scroll: {
    autoOn: "Auto scroll: On",
    autoOff: "Auto scroll: Off"
  },
  panel: {
    collapse: "Collapse panel",
    expand: "Expand Developer panel"
  }
};

// src/i18nShim.ts
var merged = false;
function hostI18n() {
  return globalThis.__POLARIS_APP_CORE__?.i18n;
}
function ensureMerged() {
  const inst = hostI18n();
  if (inst && !merged && typeof inst.addResourceBundle === "function") {
    try {
      inst.addResourceBundle("zh-CN", "developer", zh_CN_default, true, true);
      inst.addResourceBundle("en-US", "developer", en_US_default, true, true);
      merged = true;
    } catch {
    }
  }
  return inst;
}
function useTranslation(...namespaces) {
  const inst = ensureMerged();
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : void 0;
  if (!inst) {
    return { t: (key, opts) => key, i18n: void 0 };
  }
  return {
    t: (key, opts) => inst.t(key, { ns, ...typeof opts === "object" && opts ? opts : {} }),
    i18n: inst
  };
}

// node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}

// src/DeveloperPanel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var EVENT_TYPE_COLORS = {
  token: "text-blue-400",
  tool_call_start: "text-yellow-400",
  tool_call_end: "text-green-400",
  progress: "text-purple-400",
  result: "text-emerald-400",
  error: "text-red-400",
  session_start: "text-cyan-400",
  session_end: "text-gray-400",
  user_message: "text-orange-400",
  assistant_message: "text-pink-400",
  task_metadata: "text-indigo-400",
  task_progress: "text-violet-400",
  task_completed: "text-teal-400",
  task_canceled: "text-rose-400"
};
function DeveloperPanel({ className = "", width, fillRemaining = false }) {
  const { t } = useTranslation("developer");
  const [isOpen, setIsOpen] = useState(true);
  const [events, setEvents] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [maxEvents, setMaxEvents] = useState(20);
  const [selectedEventType, setSelectedEventType] = useState(null);
  const eventsEndRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    const eventBus = getEventBus({ debug: false });
    const unsubscribe = eventBus.onAny((event) => {
      const record = {
        id: generateUUID(),
        timestamp: Date.now(),
        event
      };
      setEvents((prev) => {
        const newEvents = [...prev, record];
        if (newEvents.length > maxEvents) {
          return newEvents.slice(-maxEvents);
        }
        return newEvents;
      });
    });
    return () => unsubscribe();
  }, [maxEvents]);
  useEffect(() => {
    if (autoScroll && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, autoScroll]);
  const filteredEvents = useMemo(() => {
    if (filterType === "all" || !filterValue) {
      if (selectedEventType) {
        return events.filter((r2) => r2.event.type === selectedEventType);
      }
      return events;
    }
    return events.filter((record) => {
      const event = record.event;
      if (filterType === "taskId") {
        return "taskId" in event && event.taskId === filterValue;
      }
      if (filterType === "sessionId") {
        return "sessionId" in event && event.sessionId === filterValue;
      }
      return true;
    });
  }, [events, filterType, filterValue, selectedEventType]);
  const eventTypes = useMemo(() => {
    const types = new Set(events.map((r2) => r2.event.type));
    return Array.from(types).sort();
  }, [events]);
  const clearEvents = () => {
    setEvents([]);
  };
  const copyEvent = (event) => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
  };
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }) + "." + date.getMilliseconds().toString().padStart(3, "0");
  };
  const renderEventDetail = (event) => {
    const detail = { ...event };
    delete detail.type;
    return /* @__PURE__ */ jsx("pre", { className: "text-xs text-text-tertiary font-mono whitespace-pre-wrap break-all", children: JSON.stringify(detail, null, 2) });
  };
  if (fillRemaining) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        ref: containerRef,
        className: clsx(
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-elevated",
          className
        ),
        children: [
          /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500" }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: "Developer" }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary bg-background-surface px-2 py-0.5 rounded-md", children: filteredEvents.length })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2 px-4 py-3 border-b border-border-subtle bg-background-surface shrink-0", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: filterType,
                    onChange: (e) => setFilterType(e.target.value),
                    className: "flex-1 px-2 py-1.5 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "all", children: t("filter.all") }),
                      /* @__PURE__ */ jsx("option", { value: "taskId", children: t("filter.byTaskId") }),
                      /* @__PURE__ */ jsx("option", { value: "sessionId", children: t("filter.bySessionId") })
                    ]
                  }
                ),
                (filterType === "taskId" || filterType === "sessionId") && /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: filterValue,
                    onChange: (e) => setFilterValue(e.target.value),
                    placeholder: filterType === "taskId" ? t("filter.taskIdPlaceholder") : t("filter.sessionIdPlaceholder"),
                    className: "flex-1 px-2 py-1.5 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: selectedEventType || "",
                    onChange: (e) => setSelectedEventType(e.target.value || null),
                    className: "flex-1 px-2 py-1.5 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "", children: t("filter.allTypes") }),
                      eventTypes.map((type) => /* @__PURE__ */ jsx("option", { value: type, children: type }, type))
                    ]
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: () => setAutoScroll(!autoScroll),
                    className: clsx(
                      "px-2 py-1.5 text-xs rounded-md border transition-colors",
                      autoScroll ? "bg-primary/10 border-primary text-primary" : "bg-background-surface border-border text-text-tertiary hover:text-text-primary"
                    ),
                    title: autoScroll ? t("scroll.autoOn") : t("scroll.autoOff"),
                    children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 14l-7 7m0 0l-7-7m7 7V3" }) })
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: clearEvents,
                    className: "px-2 py-1.5 text-xs bg-background-surface border border-border text-text-tertiary rounded-md hover:text-text-primary hover:bg-background-hover transition-colors",
                    title: t("events.clearEvents"),
                    children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary", children: t("events.maxEvents") }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: 100,
                    max: 1e4,
                    step: 100,
                    value: maxEvents,
                    onChange: (e) => setMaxEvents(Number(e.target.value)),
                    className: "w-20 px-2 py-1 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex min-h-0 flex-1 overflow-y-auto px-2 py-2", children: filteredEvents.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full text-text-tertiary", children: [
              /* @__PURE__ */ jsx("svg", { className: "w-12 h-12 mb-2 opacity-50", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) }),
              /* @__PURE__ */ jsx("span", { className: "text-sm", children: t("events.noEvents") })
            ] }) : /* @__PURE__ */ jsxs("div", { className: "min-w-0 space-y-1", children: [
              filteredEvents.map((record) => {
                const eventType = record.event.type;
                const colorClass = EVENT_TYPE_COLORS[eventType] || "text-text-secondary";
                return /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: clsx(
                      "p-2 rounded-md bg-background-surface border border-border-subtle hover:border-border transition-colors cursor-default"
                    ),
                    children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-1", children: [
                        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                          /* @__PURE__ */ jsx("span", { className: clsx("text-xs font-mono font-medium", colorClass), children: eventType }),
                          /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary font-mono", children: formatTime(record.timestamp) })
                        ] }),
                        /* @__PURE__ */ jsx(
                          "button",
                          {
                            onClick: () => copyEvent(record.event),
                            className: "p-1 text-text-tertiary hover:text-text-primary transition-colors",
                            title: t("events.copyJson"),
                            children: /* @__PURE__ */ jsx("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" }) })
                          }
                        )
                      ] }),
                      renderEventDetail(record.event)
                    ]
                  },
                  record.id
                );
              }),
              /* @__PURE__ */ jsx("div", { ref: eventsEndRef })
            ] }) }),
            /* @__PURE__ */ jsxs("div", { className: "px-4 py-2 border-t border-border-subtle text-xs text-text-tertiary bg-background-surface flex items-center justify-between shrink-0", children: [
              /* @__PURE__ */ jsxs("span", { children: [
                t("events.total"),
                " ",
                events.length
              ] }),
              /* @__PURE__ */ jsxs("span", { children: [
                t("events.filtered"),
                " ",
                filteredEvents.length
              ] })
            ] })
          ] })
        ]
      }
    );
  }
  const widthStyle = isOpen ? { width: width ? `${width}px` : "400px" } : { width: "40px" };
  return /* @__PURE__ */ jsxs(
    "aside",
    {
      ref: containerRef,
      className: clsx(
        "flex min-h-0 min-w-0 flex-col border-l border-border bg-background-elevated transition-all duration-300 shrink-0",
        className
      ),
      style: widthStyle,
      children: [
        /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0", children: isOpen ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("div", { className: "w-2 h-2 rounded-full bg-amber-500" }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: "Developer" }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary bg-background-surface px-2 py-0.5 rounded-md", children: filteredEvents.length })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsOpen(false),
              className: "p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-background-hover",
              title: t("panel.collapse"),
              children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M11 19l-7-7 7-7m8 14l-7-7 7-7" }) })
            }
          )
        ] }) : /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setIsOpen(true),
            className: "w-full h-full flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors",
            title: t("panel.expand"),
            children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13 5l7 7-7 7M5 5l7 7-7 7" }) })
          }
        ) }),
        isOpen && /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2 px-4 py-3 border-b border-border-subtle bg-background-surface shrink-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: filterType,
                  onChange: (e) => setFilterType(e.target.value),
                  className: "flex-1 px-2 py-1.5 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary",
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "all", children: t("filter.all") }),
                    /* @__PURE__ */ jsx("option", { value: "taskId", children: t("filter.byTaskId") }),
                    /* @__PURE__ */ jsx("option", { value: "sessionId", children: t("filter.bySessionId") })
                  ]
                }
              ),
              (filterType === "taskId" || filterType === "sessionId") && /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: filterValue,
                  onChange: (e) => setFilterValue(e.target.value),
                  placeholder: filterType === "taskId" ? t("filter.taskIdPlaceholder") : t("filter.sessionIdPlaceholder"),
                  className: "flex-1 px-2 py-1.5 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: selectedEventType || "",
                  onChange: (e) => setSelectedEventType(e.target.value || null),
                  className: "flex-1 px-2 py-1.5 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary",
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: t("filter.allTypes") }),
                    eventTypes.map((type) => /* @__PURE__ */ jsx("option", { value: type, children: type }, type))
                  ]
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: () => setAutoScroll(!autoScroll),
                  className: clsx(
                    "px-2 py-1.5 text-xs rounded-md border transition-colors",
                    autoScroll ? "bg-primary/10 border-primary text-primary" : "bg-background-surface border-border text-text-tertiary hover:text-text-primary"
                  ),
                  title: autoScroll ? t("scroll.autoOn") : t("scroll.autoOff"),
                  children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 14l-7 7m0 0l-7-7m7 7V3" }) })
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: clearEvents,
                  className: "px-2 py-1.5 text-xs bg-background-surface border border-border text-text-tertiary rounded-md hover:text-text-primary hover:bg-background-hover transition-colors",
                  title: t("events.clearEvents"),
                  children: /* @__PURE__ */ jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) })
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary", children: t("events.maxEvents") }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  min: 100,
                  max: 1e4,
                  step: 100,
                  value: maxEvents,
                  onChange: (e) => setMaxEvents(Number(e.target.value)),
                  className: "w-20 px-2 py-1 text-xs bg-background-surface border border-border rounded-md text-text-primary focus:outline-none focus:border-primary"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex min-h-0 flex-1 overflow-y-auto px-2 py-2", children: filteredEvents.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center h-full text-text-tertiary", children: [
            /* @__PURE__ */ jsx("svg", { className: "w-12 h-12 mb-2 opacity-50", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) }),
            /* @__PURE__ */ jsx("span", { className: "text-sm", children: t("events.noEvents") })
          ] }) : /* @__PURE__ */ jsxs("div", { className: "min-w-0 space-y-1", children: [
            filteredEvents.map((record) => {
              const eventType = record.event.type;
              const colorClass = EVENT_TYPE_COLORS[eventType] || "text-text-secondary";
              return /* @__PURE__ */ jsxs(
                "div",
                {
                  className: clsx(
                    "p-2 rounded-md bg-background-surface border border-border-subtle hover:border-border transition-colors cursor-default"
                  ),
                  children: [
                    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-1", children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                        /* @__PURE__ */ jsx("span", { className: clsx("text-xs font-mono font-medium", colorClass), children: eventType }),
                        /* @__PURE__ */ jsx("span", { className: "text-xs text-text-tertiary font-mono", children: formatTime(record.timestamp) })
                      ] }),
                      /* @__PURE__ */ jsx(
                        "button",
                        {
                          onClick: () => copyEvent(record.event),
                          className: "p-1 text-text-tertiary hover:text-text-primary transition-colors",
                          title: t("events.copyJson"),
                          children: /* @__PURE__ */ jsx("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" }) })
                        }
                      )
                    ] }),
                    renderEventDetail(record.event)
                  ]
                },
                record.id
              );
            }),
            /* @__PURE__ */ jsx("div", { ref: eventsEndRef })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "px-4 py-2 border-t border-border-subtle text-xs text-text-tertiary bg-background-surface flex items-center justify-between shrink-0", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              t("events.total"),
              " ",
              events.length
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              t("events.filtered"),
              " ",
              filteredEvents.length
            ] })
          ] })
        ] })
      ]
    }
  );
}
export {
  DeveloperPanel,
  DeveloperPanel as default
};
