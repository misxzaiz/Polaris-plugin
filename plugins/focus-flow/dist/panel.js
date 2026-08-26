// src/Panel.tsx
import { createElement as h, useEffect, useRef, useState } from "react";

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

// node_modules/zustand/esm/react.mjs
import React from "react";
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    React.useCallback(() => selector(api.getInitialState()), [api, selector])
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
      if (str instanceof Promise) {
        return str.then(parse);
      }
      return parse(str);
    },
    setItem: (name, newValue) => storage.setItem(name, JSON.stringify(newValue, options == null ? void 0 : options.replacer)),
    removeItem: (name) => storage.removeItem(name)
  };
  return persistStorage;
}
var toThenable = (fn) => (input) => {
  try {
    const result = fn(input);
    if (result instanceof Promise) {
      return result;
    }
    return {
      then(onFulfilled) {
        return toThenable(onFulfilled)(result);
      },
      catch(_onRejected) {
        return this;
      }
    };
  } catch (e) {
    return {
      then(_onFulfilled) {
        return this;
      },
      catch(onRejected) {
        return toThenable(onRejected)(e);
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
  api.setState = (state, replace) => {
    savedSetState(state, replace);
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
            if (migration instanceof Promise) {
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
    }).catch((e) => {
      if (currentVersion !== hydrationVersion) {
        return;
      }
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
    });
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
    rehydrate: () => hydrate(),
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

// src/focusStore.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function todayKey(d = /* @__PURE__ */ new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
var useFocusStore = create()(
  persist(
    (set, get) => ({
      sessions: [],
      active: null,
      totalFocusMin: 0,
      lastFocusDate: null,
      streakStart: null,
      startFocus(task, goalMin) {
        if (get().active) return false;
        set({ active: { task, startAt: nowIso(), goalMin } });
        return true;
      },
      stopFocus(feel, distraction, note) {
        const { active, sessions, totalFocusMin, lastFocusDate } = get();
        if (!active) return null;
        const endAt = /* @__PURE__ */ new Date();
        const durationMin = Math.max(
          1,
          Math.round((endAt.getTime() - new Date(active.startAt).getTime()) / 6e4)
        );
        const session = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          task: active.task,
          startAt: active.startAt,
          endAt: endAt.toISOString(),
          durationMin,
          goalMin: active.goalMin,
          feel,
          distraction: distraction?.trim() || null,
          note: note?.trim() || null
        };
        const tKey = todayKey(endAt);
        set({
          sessions: [...sessions, session],
          active: null,
          totalFocusMin: totalFocusMin + durationMin,
          lastFocusDate: tKey,
          streakStart: lastFocusDate ? get().streakStart : get().streakStart ?? tKey
        });
        return session;
      },
      cancelFocus() {
        set({ active: null });
      },
      clearAll() {
        set({
          sessions: [],
          active: null,
          totalFocusMin: 0,
          lastFocusDate: null,
          streakStart: null
        });
      }
    }),
    {
      name: "polaris-focus-storage",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
function fmtDuration(min) {
  const h2 = Math.floor(min / 60);
  const m = min % 60;
  if (h2 > 0 && m > 0) return `${h2}h ${m}m`;
  if (h2 > 0) return `${h2}h`;
  return `${m}m`;
}
function computeStreak(state) {
  if (!state.lastFocusDate) return 0;
  const last = /* @__PURE__ */ new Date(state.lastFocusDate + "T00:00:00");
  const today = /* @__PURE__ */ new Date(todayKey() + "T00:00:00");
  const diff = Math.round((today.getTime() - last.getTime()) / 864e5);
  if (diff > 1) return 0;
  return 1;
}
function todayFocus(state) {
  const key = todayKey();
  const list = state.sessions.filter((s) => s.startAt.startsWith(key));
  return {
    count: list.length,
    min: list.reduce((a, s) => a + s.durationMin, 0)
  };
}
function weekFocus(state) {
  const now = /* @__PURE__ */ new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const mondayKey = todayKey(monday);
  const list = state.sessions.filter((s) => s.startAt >= mondayKey + "T00:00:00");
  return {
    count: list.length,
    min: list.reduce((a, s) => a + s.durationMin, 0)
  };
}
function last7days(state) {
  const now = /* @__PURE__ */ new Date();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = todayKey(d);
    const min = state.sessions.filter((s) => s.startAt.startsWith(key)).reduce((a, s) => a + s.durationMin, 0);
    out.push({ date: key, min });
  }
  return out;
}
function avgFeel(state) {
  const feels = state.sessions.map((s) => s.feel).filter((f) => f != null);
  if (feels.length === 0) return 0;
  return Math.round(feels.reduce((a, b) => a + b, 0) / feels.length * 10) / 10;
}
function topDistractions(state) {
  const counts = {};
  state.sessions.forEach((s) => {
    if (s.distraction) counts[s.distraction] = (counts[s.distraction] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
}

// src/Panel.tsx
function FocusFlowPanel({ pluginId }) {
  const [tab, setTab] = useState("focus");
  return h(
    "div",
    { className: "flex h-full flex-col bg-background font-mono text-xs text-text-secondary" },
    h(
      "div",
      { className: "flex items-center justify-between border-b border-border px-3 py-2" },
      h("span", { className: "font-bold tracking-wider text-text" }, "\u5FC3\u6D41\u4E13\u6CE8"),
      h("span", { className: "text-lg leading-none" }, "\u{1F30A}")
    ),
    h(
      "div",
      { className: "flex border-b border-border" },
      h(TabBtn, { active: tab === "focus", onClick: () => setTab("focus") }, "\u4E13\u6CE8"),
      h(TabBtn, { active: tab === "log", onClick: () => setTab("log") }, "\u8BB0\u5F55"),
      h(TabBtn, { active: tab === "stats", onClick: () => setTab("stats") }, "\u7EDF\u8BA1")
    ),
    h(
      "div",
      { className: "flex-1 overflow-y-auto p-4" },
      tab === "focus" && h(FocusTab),
      tab === "log" && h(LogTab),
      tab === "stats" && h(StatsTab)
    )
  );
}
function TabBtn({ active, onClick, children }) {
  return h("button", {
    className: `flex-1 px-3 py-2 text-center text-[11px] font-medium tracking-wider transition-colors ${active ? "border-b-2 border-accent text-text" : "text-text-muted hover:text-text hover:bg-background-hover"}`,
    onClick
  }, children);
}
function FocusTab() {
  const { active, startFocus, stopFocus, cancelFocus } = useFocusStore();
  const [task, setTask] = useState("");
  const [goalMin, setGoalMin] = useState(25);
  const [feel, setFeel] = useState(4);
  const [distraction, setDistraction] = useState("");
  const [note, setNote] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedAtRef = useRef(0);
  useEffect(() => {
    if (!active || paused) return;
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(active.startAt).getTime()) / 1e3));
    }, 1e3);
    return () => clearInterval(t);
  }, [active, paused]);
  const handleStart = () => {
    const name = task.trim() || "\u4E13\u6CE8";
    if (startFocus(name, goalMin)) {
      setTask("");
      setElapsed(0);
    }
  };
  const handleStop = () => {
    const s = stopFocus(feel, distraction, note);
    if (s) {
      setDistraction("");
      setNote("");
      setPaused(false);
      pausedAtRef.current = 0;
    }
  };
  if (!active) {
    return h(
      "div",
      { className: "flex flex-col gap-4" },
      h(
        "div",
        { className: "rounded-lg border border-border bg-background-elevated p-4 text-center" },
        h("div", { className: "mb-1 text-[11px] text-text-muted" }, "\u51C6\u5907\u8FDB\u5165\u5FC3\u6D41"),
        h("div", { className: "text-4xl" }, "\u{1F30A}"),
        h("div", { className: "mt-2 text-[11px] text-text-muted" }, "\u8BBE\u5B9A\u4E00\u4E2A\u76EE\u6807\uFF0C\u7136\u540E\u4E13\u6CE8\u5F00\u59CB")
      ),
      h(
        "div",
        { className: "flex flex-col gap-2" },
        h("input", {
          className: "rounded border border-border bg-background px-3 py-2 text-text outline-none focus:border-accent",
          placeholder: "\u4E13\u6CE8\u4EFB\u52A1\uFF0C\u5982\uFF1A\u5199\u65B9\u6848 / \u8BFB\u4E66 / \u5B66\u4E60",
          value: task,
          onChange: (e) => setTask(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && handleStart()
        }),
        h(
          "div",
          { className: "flex items-center gap-2" },
          h("span", { className: "text-text-muted" }, "\u76EE\u6807"),
          h(
            "select",
            {
              className: "flex-1 rounded border border-border bg-background px-2 py-2 text-text outline-none focus:border-accent",
              value: goalMin,
              onChange: (e) => setGoalMin(Number(e.target.value))
            },
            [15, 25, 45, 60, 90].map((m) => h("option", { key: m, value: m }, `${m} \u5206\u949F`))
          )
        ),
        h("button", {
          className: "rounded bg-accent px-3 py-2.5 font-bold text-black transition-opacity hover:opacity-90",
          onClick: handleStart
        }, "\u5F00\u59CB\u4E13\u6CE8")
      )
    );
  }
  const eMin = Math.floor(elapsed / 60);
  const eSec = elapsed % 60;
  const mm = String(eMin).padStart(2, "0");
  const ss = String(eSec).padStart(2, "0");
  return h(
    "div",
    { className: "flex flex-col gap-4" },
    h(
      "div",
      { className: "rounded-lg border border-accent/40 bg-background-elevated p-4 text-center" },
      h("div", { className: "mb-1 text-[11px] text-text-muted" }, active.task),
      h("div", { className: "text-5xl font-bold tabular-nums text-text" }, `${mm}:${ss}`),
      h("div", { className: "mt-1 text-[11px] text-text-muted" }, `\u76EE\u6807 ${active.goalMin} \u5206\u949F`),
      h(
        "div",
        { className: "mt-2 flex items-center justify-center gap-2" },
        h("button", {
          className: "rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:border-accent hover:text-text",
          onClick: () => {
            if (!paused) pausedAtRef.current = Date.now();
            setPaused((p) => !p);
          }
        }, paused ? "\u7EE7\u7EED" : "\u6682\u505C"),
        h("button", {
          className: "rounded border border-red-400/40 px-3 py-1 text-[11px] text-red-400 hover:bg-red-400/10",
          onClick: cancelFocus
        }, "\u653E\u5F03")
      )
    ),
    paused && h(
      "div",
      { className: "rounded border border-border p-3 text-center text-[11px] text-text-muted" },
      "\u5DF2\u6682\u505C \xB7 \u5FC3\u6D41\u968F\u65F6\u53EF\u4EE5\u56DE\u6765"
    ),
    h(
      "div",
      { className: "flex flex-col gap-2" },
      h("div", { className: "text-[11px] font-bold tracking-wider text-text" }, "\u7ED3\u675F\u672C\u6B21\u4E13\u6CE8"),
      h(
        "div",
        { className: "flex items-center gap-1" },
        h("span", { className: "text-text-muted" }, "\u5FC3\u6D41"),
        [1, 2, 3, 4, 5].map((v) => h("button", {
          key: v,
          className: `rounded px-2 py-1 text-[11px] ${feel === v ? "bg-accent text-black" : "border border-border text-text-muted hover:bg-background-hover"}`,
          onClick: () => setFeel(v)
        }, String(v)))
      ),
      h("input", {
        className: "rounded border border-border bg-background px-3 py-2 text-text outline-none focus:border-accent",
        placeholder: "\u4E3B\u8981\u5E72\u6270\u6E90\uFF08\u53EF\u9009\uFF09\uFF1A\u624B\u673A / \u6D88\u606F / \u6742\u5FF5",
        value: distraction,
        onChange: (e) => setDistraction(e.target.value)
      }),
      h("input", {
        className: "rounded border border-border bg-background px-3 py-2 text-text outline-none focus:border-accent",
        placeholder: "\u672C\u6B21\u611F\u609F\uFF08\u53EF\u9009\uFF09",
        value: note,
        onChange: (e) => setNote(e.target.value)
      }),
      h("button", {
        className: "rounded bg-accent px-3 py-2.5 font-bold text-black transition-opacity hover:opacity-90",
        onClick: handleStop
      }, `\u5B8C\u6210 \xB7 \u8BB0\u5F55 ${fmtDuration(Math.max(1, Math.round(elapsed / 60)))}`)
    )
  );
}
function LogTab() {
  const sessions = useFocusStore((s) => s.sessions);
  const sorted = [...sessions].reverse();
  if (sorted.length === 0) {
    return h(
      "div",
      { className: "py-10 text-center text-[11px] text-text-muted italic" },
      "\u8FD8\u6CA1\u6709\u4E13\u6CE8\u8BB0\u5F55\u3002\u53BB\u5F00\u59CB\u4E00\u6B21\u5FC3\u6D41\u5427\u3002"
    );
  }
  const feelDot = (f) => {
    const map = { 5: "bg-emerald-400", 4: "bg-green-400", 3: "bg-yellow-400", 2: "bg-orange-400", 1: "bg-red-400" };
    return map[f] || "bg-text-muted";
  };
  return h(
    "div",
    { className: "flex flex-col gap-2" },
    sorted.slice(0, 50).map((s) => h(
      "div",
      {
        key: s.id,
        className: "flex items-center gap-2 rounded border border-border bg-background-elevated px-3 py-2"
      },
      h("div", { className: `h-2 w-2 shrink-0 rounded-full ${feelDot(s.feel)}` }),
      h(
        "div",
        { className: "min-w-0 flex-1" },
        h("div", { className: "truncate text-text" }, s.task),
        h(
          "div",
          { className: "truncate text-[10px] text-text-muted" },
          s.startAt.slice(0, 16).replace("T", " ") + (s.note ? ` \xB7 ${s.note}` : "") + (s.distraction ? ` \xB7 \u5E72\u6270:${s.distraction}` : "")
        )
      ),
      h("div", { className: "shrink-0 text-[11px] font-bold tabular-nums text-text" }, fmtDuration(s.durationMin))
    )),
    sorted.length > 50 && h(
      "div",
      { className: "text-center text-[11px] text-text-muted" },
      `... \u8FD8\u6709 ${sorted.length - 50} \u6761`
    )
  );
}
function StatsTab() {
  const state = useFocusStore();
  const today = todayFocus(state);
  const week = weekFocus(state);
  const heat = last7days(state);
  const feel = avgFeel(state);
  const dists = topDistractions(state);
  const streak = computeStreak(state);
  const heatColor = (min) => {
    if (min >= 90) return "bg-emerald-500";
    if (min >= 60) return "bg-emerald-400";
    if (min >= 30) return "bg-green-400";
    if (min > 0) return "bg-green-600/50";
    return "bg-background-hover";
  };
  return h(
    "div",
    { className: "flex flex-col gap-4" },
    // 统计卡片
    h(
      "div",
      { className: "grid grid-cols-4 gap-2" },
      h(StatCard, { label: "\u4ECA\u65E5", value: fmtDuration(today.min), sub: `${today.count} \u6B21` }),
      h(StatCard, { label: "\u672C\u5468", value: fmtDuration(week.min), sub: `${week.count} \u6B21` }),
      h(StatCard, { label: "\u7D2F\u8BA1", value: fmtDuration(state.totalFocusMin), sub: `${state.sessions.length} \u6B21` }),
      h(StatCard, { label: "\u8FDE\u7EED", value: `${streak}`, sub: "\u5929" })
    ),
    // 近 7 天热力图
    h(
      "div",
      { className: "rounded-lg border border-border bg-background-elevated p-3" },
      h("div", { className: "mb-2 text-[11px] font-bold tracking-wider text-text" }, "\u8FD1 7 \u5929\u4E13\u6CE8"),
      h(
        "div",
        { className: "flex gap-1.5" },
        heat.map((d) => {
          const dayName = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"][(/* @__PURE__ */ new Date(d.date + "T00:00:00")).getDay()];
          return h(
            "div",
            { key: d.date, className: "flex flex-1 flex-col items-center gap-1" },
            h("div", {
              className: `h-9 w-full rounded ${heatColor(d.min)}`,
              title: `${d.date} \xB7 ${fmtDuration(d.min)}`
            }),
            h("span", { className: "text-[10px] text-text-muted" }, dayName)
          );
        })
      )
    ),
    // 心流质量
    h(
      "div",
      { className: "flex gap-2 rounded-lg border border-border bg-background-elevated p-3" },
      h(
        "div",
        { className: "flex-1 text-center" },
        h("div", { className: "text-2xl font-bold text-text" }, feel || "\u2013"),
        h("div", { className: "text-[10px] text-text-muted" }, "\u5E73\u5747\u5FC3\u6D41 / 5")
      ),
      h("div", { className: "w-px bg-border" }),
      h(
        "div",
        { className: "flex-1 text-center" },
        h(
          "div",
          { className: "text-2xl font-bold text-text" },
          state.totalFocusMin > 0 ? Math.round(state.totalFocusMin / Math.max(1, state.sessions.length)) : "\u2013"
        ),
        h("div", { className: "text-[10px] text-text-muted" }, "\u5E73\u5747\u65F6\u957F(m)")
      )
    ),
    // 干扰源分析
    dists.length > 0 && h(
      "div",
      { className: "rounded-lg border border-border bg-background-elevated p-3" },
      h("div", { className: "mb-2 text-[11px] font-bold tracking-wider text-text" }, "\u4E3B\u8981\u5E72\u6270\u6E90"),
      h(
        "div",
        { className: "flex flex-col gap-1.5" },
        dists.map((d) => {
          const max = dists[0].count;
          const pct = Math.round(d.count / max * 100);
          return h(
            "div",
            { key: d.name, className: "flex items-center gap-2" },
            h("span", { className: "w-16 shrink-0 truncate text-text-muted" }, d.name),
            h(
              "div",
              { className: "h-2 flex-1 overflow-hidden rounded-full bg-background-hover" },
              h("div", { className: "h-full rounded-full bg-accent", style: { width: `${pct}%` } })
            ),
            h("span", { className: "w-8 shrink-0 text-right text-[10px] text-text-muted" }, `${d.count}\u6B21`)
          );
        })
      )
    ),
    // 清空
    state.sessions.length > 0 && h("button", {
      className: "self-center text-[10px] text-text-muted hover:text-red-400",
      onClick: () => {
        if (confirm("\u786E\u5B9A\u6E05\u7A7A\u5168\u90E8\u4E13\u6CE8\u8BB0\u5F55\uFF1F")) useFocusStore.getState().clearAll();
      }
    }, "\u6E05\u7A7A\u5168\u90E8\u8BB0\u5F55")
  );
}
function StatCard({ label, value, sub }) {
  return h(
    "div",
    { className: "rounded-lg border border-border bg-background-elevated p-2 text-center" },
    h("div", { className: "text-[10px] text-text-muted" }, label),
    h("div", { className: "mt-0.5 text-sm font-bold text-text" }, value),
    h("div", { className: "text-[10px] text-text-muted" }, sub)
  );
}
export {
  FocusFlowPanel as default
};
