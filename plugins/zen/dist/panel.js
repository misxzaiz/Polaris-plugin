// src/Panel.tsx
import { createElement as h2, useCallback, useEffect as useEffect2, useRef as useRef2, useState } from "react";

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

// src/zenStore.ts
function getTodayKey() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getTimeStr() {
  const d = /* @__PURE__ */ new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function getOrCreateToday(history) {
  const today = getTodayKey();
  if (history.length > 0 && history[0].date === today) {
    return history;
  }
  return [{ date: today, entries: [] }, ...history];
}
var useZenStore = create()(
  persist(
    (set) => ({
      // state
      knockCount: 0,
      maxCombo: 0,
      totalZenSeconds: 0,
      fortuneCount: 0,
      bookCount: 0,
      firstSeen: null,
      lastSeen: null,
      monkMood: "idle",
      soundPreference: "muyu",
      autoKnock: "off",
      history: [],
      // actions
      addKnock: (count, context) => set((state) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const history = getOrCreateToday(state.history);
        history[0].entries.push({
          time: getTimeStr(),
          type: "knock",
          detail: count > 1 ? `\u8FDE\u6572 ${count} \u4E0B` : `\u6572\u4E86 1 \u4E0B`,
          context
        });
        return {
          knockCount: state.knockCount + count,
          maxCombo: Math.max(state.maxCombo, count),
          totalZenSeconds: state.totalZenSeconds + count * 0.8,
          lastSeen: now,
          firstSeen: state.firstSeen ?? now,
          history
        };
      }),
      addFortune: (fortune, text) => set((state) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const history = getOrCreateToday(state.history);
        history[0].entries.push({
          time: getTimeStr(),
          type: "fortune",
          detail: `${fortune} - ${text}`
        });
        return {
          fortuneCount: state.fortuneCount + 1,
          lastSeen: now,
          firstSeen: state.firstSeen ?? now,
          history
        };
      }),
      addBook: (answer) => set((state) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const history = getOrCreateToday(state.history);
        history[0].entries.push({
          time: getTimeStr(),
          type: "book",
          detail: answer
        });
        return {
          bookCount: state.bookCount + 1,
          lastSeen: now,
          firstSeen: state.firstSeen ?? now,
          history
        };
      }),
      addAiKnock: (count, note) => set((state) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const history = getOrCreateToday(state.history);
        history[0].entries.push({
          time: getTimeStr(),
          type: "ai_knock",
          detail: `AI \u66FF\u4F60\u6572\u4E86 ${count} \u4E0B`,
          context: note
        });
        return {
          knockCount: state.knockCount + count,
          lastSeen: now,
          firstSeen: state.firstSeen ?? now,
          history
        };
      }),
      addAiFortune: (fortune, text) => set((state) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const history = getOrCreateToday(state.history);
        history[0].entries.push({
          time: getTimeStr(),
          type: "ai_fortune",
          detail: `AI \u4EE3\u62BD - ${fortune}: ${text}`
        });
        return {
          fortuneCount: state.fortuneCount + 1,
          lastSeen: now,
          firstSeen: state.firstSeen ?? now,
          history
        };
      }),
      addAiBook: (answer, question) => set((state) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const history = getOrCreateToday(state.history);
        history[0].entries.push({
          time: getTimeStr(),
          type: "ai_book",
          detail: `AI \u4EE3\u95EE\u300C${question}\u300D: ${answer}`
        });
        return {
          bookCount: state.bookCount + 1,
          lastSeen: now,
          firstSeen: state.firstSeen ?? now,
          history
        };
      }),
      setSoundPreference: (pref) => set({ soundPreference: pref }),
      setAutoKnock: (mode) => set({ autoKnock: mode }),
      setMonkMood: (mood) => set({ monkMood: mood }),
      resetStats: () => set({
        knockCount: 0,
        maxCombo: 0,
        totalZenSeconds: 0,
        fortuneCount: 0,
        bookCount: 0,
        history: []
      })
    }),
    {
      name: "polaris-zen-storage",
      partialize: (state) => ({
        knockCount: state.knockCount,
        maxCombo: state.maxCombo,
        totalZenSeconds: state.totalZenSeconds,
        fortuneCount: state.fortuneCount,
        bookCount: state.bookCount,
        firstSeen: state.firstSeen,
        lastSeen: state.lastSeen,
        soundPreference: state.soundPreference,
        autoKnock: state.autoKnock,
        history: state.history
      })
    }
  )
);

// src/MonkCanvas.tsx
import { createElement as h, useEffect, useRef } from "react";
var MONK_COLORS = {
  skin: "#f5c99b",
  skinShadow: "#e0a877",
  robe: "#8a9a8a",
  robeShadow: "#6f7f6f",
  face: "#f7d4a8",
  eyeClosed: "#3a3a3a",
  eyeOpen: "#2a2a2a",
  mouth: "#c96f5a",
  blush: "#e8a08a",
  bead: "#c96f5a"
};
var W = 120;
var H = 120;
function drawMonk(ctx, t, mood, isSleeping) {
  ctx.clearRect(0, 0, W, H);
  const breathe = isSleeping ? 0 : Math.sin(t * 2e-3) * 2;
  const bob = mood === "happy" ? Math.abs(Math.sin(t * 6e-3)) * 6 : 0;
  const sway = mood === "happy" ? Math.sin(t * 4e-3) * 2 : 0;
  ctx.save();
  ctx.translate(W / 2 + sway, H / 2 + breathe + bob);
  const cx = 0;
  const cy = 0;
  ctx.fillStyle = MONK_COLORS.robe;
  ctx.beginPath();
  ctx.moveTo(-34, 18);
  ctx.lineTo(-22, 52);
  ctx.lineTo(22, 52);
  ctx.lineTo(34, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MONK_COLORS.robeShadow;
  ctx.beginPath();
  ctx.moveTo(-22, 52);
  ctx.lineTo(0, 52);
  ctx.lineTo(0, 18);
  ctx.lineTo(-22, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MONK_COLORS.skin;
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MONK_COLORS.skinShadow;
  ctx.beginPath();
  ctx.arc(cx, cy - 20, 9, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = MONK_COLORS.eyeClosed;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (mood === "happy") {
    ctx.strokeStyle = MONK_COLORS.eyeClosed;
    ctx.beginPath();
    ctx.arc(cx - 9, cy - 2, 5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 9, cy - 2, 5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else if (mood === "content" || mood === "idle" && !isSleeping) {
    ctx.fillStyle = MONK_COLORS.eyeOpen;
    ctx.beginPath();
    ctx.arc(cx - 9, cy - 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 9, cy - 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 2);
    ctx.lineTo(cx - 5, cy - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy - 2);
    ctx.lineTo(cx + 13, cy - 2);
    ctx.stroke();
  }
  ctx.fillStyle = MONK_COLORS.blush;
  ctx.globalAlpha = isSleeping ? 0.4 : 0.3;
  ctx.beginPath();
  ctx.arc(cx - 15, cy + 6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 15, cy + 6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = MONK_COLORS.mouth;
  ctx.lineWidth = 1.6;
  if (mood === "sleepy") {
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mood === "happy") {
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 8);
    ctx.lineTo(cx + 4, cy + 8);
    ctx.stroke();
  }
  ctx.fillStyle = MONK_COLORS.bead;
  ctx.beginPath();
  ctx.arc(cx, cy - 14, 1.8, 0, Math.PI * 2);
  ctx.fill();
  if (mood === "sleepy") {
    ctx.fillStyle = MONK_COLORS.eyeClosed;
    ctx.font = "10px monospace";
    ctx.fillText("z", 20 + Math.sin(t * 3e-3) * 2, -18);
    ctx.fillText("Z", 30 + Math.sin(t * 3e-3) * 3, -26);
  }
  ctx.restore();
}
function MonkCanvas({ mood = "idle", size = 120 }) {
  const canvasRef = useRef(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const isSleeping = moodRef.current === "sleepy";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    const start = performance.now();
    const loop = (now) => {
      const t = now - start;
      drawMonk(ctx, t, moodRef.current, isSleeping);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return h("canvas", {
    ref: canvasRef,
    style: { width: size, height: size },
    width: size,
    height: size
  });
}

// src/zenStyles.ts
var injected = false;
function ensureZenStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = `
    /* \u2500\u2500 \u6728\u9C7C \u2500\u2500 */
    @keyframes muyu-pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(110, 168, 254, 0.4); }
      40% { transform: scale(0.92); box-shadow: 0 0 0 8px rgba(110, 168, 254, 0.1); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(110, 168, 254, 0); }
    }
    @keyframes muyu-ripple {
      0% { transform: scale(0.8); opacity: 0.6; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .muyu-btn {
      position: relative;
      width: 80px; height: 80px;
      border-radius: 50%;
      border: 2px solid var(--border-color, #3f3f46);
      background: radial-gradient(circle at 40% 35%, #d4a76a, #b8864a 50%, #8b6914);
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
      display: flex; align-items: center; justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .muyu-btn:hover { border-color: var(--accent, #6366f1); box-shadow: 0 0 16px rgba(110, 168, 254, 0.15); }
    .muyu-btn:active { transform: scale(0.96); }
    .muyu-btn.pulse { animation: muyu-pulse 0.3s ease-out; }
    .muyu-btn::before {
      content: ''; position: absolute; top: 50%; left: 50%;
      width: 36px; height: 36px; transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(circle at 45% 40%, rgba(255,255,255,0.25), transparent 60%);
      pointer-events: none;
    }
    .muyu-btn .muyu-eye {
      position: absolute; width: 10px; height: 10px; border-radius: 50%;
      background: #2a1a0a; top: 38%; left: 62%; transform: translate(-50%, -50%);
      box-shadow: 0 0 2px rgba(0,0,0,0.3);
    }
    .muyu-btn .muyu-eye::after {
      content: ''; position: absolute; width: 4px; height: 4px;
      border-radius: 50%; background: white; top: 2px; left: 2px;
    }
    .muyu-btn .muyu-mouth {
      position: absolute; width: 14px; height: 8px;
      border-bottom: 2px solid #5a3a1a; border-radius: 50%;
      bottom: 30%; left: 62%; transform: translateX(-50%);
    }
    .muyu-ripple {
      position: absolute; inset: 0; border-radius: 50%;
      border: 2px solid var(--accent, #6366f1);
      pointer-events: none;
      animation: muyu-ripple 0.5s ease-out forwards;
    }

    /* \u2500\u2500 \u62BD\u7B7E \u2500\u2500 */
    @keyframes fortune-shake {
      0% { transform: rotate(0deg); }
      10% { transform: rotate(-8deg); }
      20% { transform: rotate(8deg); }
      30% { transform: rotate(-6deg); }
      40% { transform: rotate(6deg); }
      50% { transform: rotate(-4deg); }
      60% { transform: rotate(4deg); }
      70% { transform: rotate(-2deg); }
      80% { transform: rotate(2deg); }
      90% { transform: rotate(-1deg); }
      100% { transform: rotate(0deg); }
    }
    @keyframes fortune-stick-slide {
      0% { transform: translateY(-20px); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes fortune-glow {
      0% { filter: brightness(1); }
      50% { filter: brightness(1.15); }
      100% { filter: brightness(1); }
    }
    .fortune-shaking {
      animation: fortune-shake 0.5s ease-in-out;
    }
    .fortune-stick {
      animation: fortune-stick-slide 0.4s ease-out forwards;
      opacity: 0;
    }
    .fortune-card {
      animation: fortune-glow 1.5s ease-in-out 0.3s;
    }
    .fortune-card-inner {
      animation: fortune-stick-slide 0.5s ease-out 0.2s both;
    }

    /* \u2500\u2500 \u7B54\u6848\u4E4B\u4E66\u7FFB\u9875 \u2500\u2500 */
    @keyframes book-cover-open {
      0% { transform: perspective(800px) rotateY(0deg); }
      100% { transform: perspective(800px) rotateY(-180deg); }
    }
    @keyframes book-content-in {
      0% { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes book-page-sway {
      0%, 100% { transform: rotateY(0deg); }
      25% { transform: rotateY(2deg); }
      75% { transform: rotateY(-2deg); }
    }
    .book-cover {
      position: relative;
      width: 100%; max-width: 200px; height: 140px;
      perspective: 800px;
      cursor: pointer;
    }
    .book-cover-inner {
      width: 100%; height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transition: transform 0.6s ease-in-out;
      border-radius: 4px;
    }
    .book-cover.open .book-cover-inner {
      animation: book-cover-open 0.6s ease-in-out forwards;
    }
    .book-front, .book-back {
      position: absolute; inset: 0;
      backface-visibility: hidden;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; letter-spacing: 2px;
    }
    .book-front {
      background: linear-gradient(135deg, #2d2d3a, #1a1a28);
      border: 1px solid var(--border-color, #3f3f46);
      color: var(--text-color, #e2e8f0);
      z-index: 2;
    }
    .book-back {
      background: var(--bg-background-elevated, #1e1e24);
      border: 1px solid var(--border-color, #3f3f46);
      transform: rotateY(180deg);
      color: var(--text-secondary, #a1a1aa);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.5px;
      padding: 12px;
    }
    .book-content {
      animation: book-content-in 0.4s ease-out 0.5s both;
    }
    .book-body {
      animation: book-page-sway 3s ease-in-out infinite;
    }

    /* \u2500\u2500 \u901A\u7528\u52A8\u753B \u2500\u2500 */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.3s ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .muyu-btn.pulse, .muyu-ripple,
      .fortune-shaking, .fortune-stick, .fortune-card,
      .book-cover-inner, .book-content, .book-body {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// src/Panel.tsx
ensureZenStyles();
var FORTUNES = [
  { luck: "\u5927\u5409", text: "\u4ECA\u5929\u4F60\u63D0\u4EA4\u7684\u4EE3\u7801\uFF0C\u4F1A\u4E00\u6B21\u901A\u8FC7 review\uFF0C\u4E14\u6CA1\u6709 lint \u62A5\u9519\u3002", book: "\u300A\u4EE3\u7801\u6574\u6D01\u4E4B\u9053\u300B\u7B2C 42 \u9875" },
  { luck: "\u5927\u5409", text: "\u4F60\u7684 function \u5F88\u5FEB\u5C31\u8981\u88AB\u9999\u6C34\u7EA7\u91CD\u6784\uFF0C\u4F18\u96C5\u5F97\u50CF\u9996\u8BD7\u3002", book: "\u300A\u91CD\u6784\u300B\u7B2C 2 \u7248" },
  { luck: "\u4E2D\u5409", text: "\u90A3\u4E2A flaky test\uFF0C\u4ECA\u5929\u5927\u6982\u7387\u4F1A\u7EFF\u3002\u4F46\u522B\u95EE\u4E3A\u4EC0\u4E48\u3002", book: "\u300A\u6D4B\u8BD5\u4E4B\u9053\u300B" },
  { luck: "\u4E2D\u5409", text: "\u9002\u5408\u505A\u4E00\u6B21\u5927\u6E05\u7406\uFF1A\u5220\u6389\u6CA1\u7528\u5B8C\u7684 TODO\uFF0C\u548C\u90A3\u4E2A\u8DD1\u4E0D\u8FDB git \u7684\u4E34\u65F6\u6587\u4EF6\u3002", book: "\u300A\u4EE3\u7801\u5927\u5168\u300B" },
  { luck: "\u5409", text: "\u4ECA\u5929\u5199\u65B0\u4EE3\u7801\u8FD0\u6C14\u4E0D\u9519\uFF0C\u4F46\u8BB0\u5F97\u5148 pull \u518D push\u3002", book: "\u300APro Git\u300B" },
  { luck: "\u5409", text: "\u4F60\u7684\u6CE8\u91CA\u7EC8\u4E8E\u548C\u4F60 3 \u4E2A\u6708\u524D\u7684\u8BB0\u5FC6\u5BF9\u9F50\u4E86\u3002", book: "\u300A\u7A0B\u5E8F\u5458\u4FEE\u70BC\u4E4B\u9053\u300B" },
  { luck: "\u5C0F\u5409", text: "\u5C0F\u6B65\u63D0\u4EA4\uFF0C\u5C0F\u4E8B\u5F00\u5FC3\u3002\u4ECA\u5929\u9002\u5408 refactor\uFF0C\u4E0D\u9002\u5408\u63A8\u7FFB\u91CD\u6765\u3002", book: "\u300A\u91CD\u6784\u300B" },
  { luck: "\u5C0F\u5409", text: "\u4E00\u676F\u5496\u5561\u4E4B\u540E\uFF0C\u90A3\u4E2A bug \u4F1A\u81EA\u5DF1\u73B0\u51FA\u539F\u5F62\u3002", book: "\u300A\u8C03\u8BD5\u7684\u827A\u672F\u300B" },
  { luck: "\u672B\u5409", text: "\u53D8\u91CF\u540D\u522B\u6539\u4E86\uFF0C\u6539\u4E00\u6B21\u662F\u91CD\u6784\uFF0C\u6539\u4E09\u6B21\u662F\u8FF7\u4FE1\u3002", book: "\u300A\u4EE3\u7801\u6574\u6D01\u4E4B\u9053\u300B" },
  { luck: "\u672B\u5409", text: "\u4ECA\u5929\u53EF\u80FD\u51FA\u73B0\u96BE\u4EE5\u590D\u73B0\u7684 bug\u3002\u522B\u614C\uFF0C\u5148 commit \u518D\u8BF4\u3002", book: "\u300A\u5982\u4F55\u9605\u8BFB\u4E00\u672C\u4E66\u300B" },
  { luck: "\u51F6", text: "\u522B\u5728\u5468\u4E94\u4E0B\u5348\u52A8\u751F\u4EA7\u73AF\u5883\u7684\u914D\u7F6E\u3002\u771F\u7684\u3002", book: "\u300ARelease It!\u300B" },
  { luck: "\u51F6", text: "\u6CE8\u610F\uFF1A\u4ECA\u5929\u6709\u5B57\u6BB5\u7C7B\u578B\u88AB\u9690\u5F0F\u8F6C\u6362\u7684\u98CE\u9669\uFF0C\u5C0F\u5FC3\u88AB\u5751\u3002", book: "\u300ATypeScript \u6DF1\u5EA6\u6307\u5357\u300B" },
  { luck: "\u5927\u51F6", text: "\u4E0D\u8981 git push --force\u3002\u4ECA\u5929\u8BF4\u7684\u5C31\u662F\u4F60\u3002", book: "\u300AGit \u65F6\u5149\u673A\u300B" }
];
var PUNCHLINES = [
  ["\u4F60\u95EE\u80FD\u4E0D\u80FD\u4FEE\u597D\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u4F60\u8BD5\u8FC7\u91CD\u542F\u5417\uFF1F"],
  ["\u4F60\u95EE\u8BE5\u4E0D\u8BE5\u91CD\u6784\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u5220\u6389\u5B83\uFF0C\u6CA1\u4EBA\u4F1A\u53D1\u73B0\u3002"],
  ["\u4F60\u95EE\u8FD9\u4E2A bug \u7684\u6E90\u5934\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u4F60\u4E0A\u6B21\u6539\u7684\u90A3\u91CC\u3002"],
  ["\u4F60\u95EE\u4EC0\u4E48\u65F6\u5019\u80FD\u505A\u5B8C\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u4F60\u4E0A\u6B21\u4F30\u8BA1\u7684\u65F6\u95F4\uFF0C\u4E58\u4EE5 pi\u3002"],
  ["\u4F60\u95EE\u8981\u4E0D\u8981\u52A0\u8FD9\u4E2A\u529F\u80FD\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u7528\u6237\u4E0D\u4F1A\u7528\uFF0C\u4F46\u4F60\u4F1A\u5934\u75BC\u3002"],
  ["\u4F60\u95EE\u8BE5\u4E0D\u8BE5\u544A\u8BC9\u522B\u4EBA\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u4F60 commit message \u5DF2\u7ECF\u5199\u6E05\u695A\u4E86\u3002"],
  ["\u4F60\u95EE\u80FD\u4E0D\u80FD\u4E0A\u7EBF\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u4F60\u95EE\u4E4B\u524D\u5C31\u5DF2\u7ECF\u77E5\u9053\u7B54\u6848\u4E86\u3002"],
  ["\u4F60\u95EE\u662F\u4E0D\u662F\u8BE5\u4F11\u606F\u4E86\u3002\u7B54\u6848\u4E4B\u4E66\u7FFB\u5230\u7684\u662F\uFF1A", "\u4F60\u7684\u773C\u775B\u5728\u8BF4\u8C0E\uFF0C\u4F46\u9888\u690E\u5F88\u8BDA\u5B9E\u3002"]
];
var SECOND_LINES = {
  0: "\u4F60\u4E0A\u6B21\u4E5F\u95EE\u8FC7\u8FD9\u4E2A\u95EE\u9898\u3002\u4F60\u8BD5\u4E86\uFF0C\u4F46\u4F60\u6CA1\u91CD\u542F\u5BF9\u5730\u65B9\u3002",
  1: "\u4F60\u4E0A\u6B21\u4E5F\u95EE\u8FC7\u3002\u4F60\u91CD\u6784\u4E86\uFF0C\u7136\u540E\u53C8\u6539\u56DE\u6765\u4E86\u3002",
  2: "\u4F60\u4E0A\u6B21\u6539\u7684\u90A3\u91CC\uFF0C\u4F60\u53C8\u6539\u4E86\u4E00\u6B21\u3002\u8FD9\u6B21\u4F60\u786E\u5B9A\u5417\uFF1F",
  3: "\u4F60\u4E0A\u6B21\u4F30\u8BA1\u7684\u65F6\u95F4\uFF0C\u5230\u73B0\u5728\u8FD8\u6CA1\u505A\u5B8C\u3002",
  4: "\u4F60\u4E0A\u6B21\u52A0\u7684\u529F\u80FD\uFF0C\u7528\u6237\u786E\u5B9E\u6CA1\u7528\u3002",
  5: "\u4F60\u4E0A\u6B21\u4E5F\u5199\u4E86\u5F88\u6E05\u695A\u7684 commit message\uFF0C\u7136\u540E\u81EA\u5DF1\u90FD\u5FD8\u4E86\u3002",
  6: "\u4F60\u4E0A\u6B21\u4E5F\u95EE\u8FC7\u3002\u4F60\u4E0A\u7EBF\u4E86\uFF0C\u7136\u540E\u56DE\u6EDA\u4E86\u3002",
  7: "\u4F60\u4E0A\u6B21\u95EE\u7684\u65F6\u5019\uFF0C\u6211\u5C31\u60F3\u8BF4\u4E86\u3002\u53BB\u4F11\u606F\u5427\u3002"
};
function ZenPanel({ pluginId }) {
  const [tab, setTab] = useState("knock");
  return h2(
    "div",
    { className: "flex h-full flex-col bg-background font-mono text-xs text-text-secondary" },
    // header
    h2(
      "div",
      { className: "flex items-center justify-between border-b border-border px-3 py-2" },
      h2("span", { className: "font-bold tracking-wider text-text" }, "\u7985\u623F"),
      h2(
        "div",
        { className: "flex items-center gap-2" },
        h2(MonkCanvas, { mood: "idle", size: 40 })
      )
    ),
    // tabs
    h2(
      "div",
      { className: "flex border-b border-border" },
      h2(TabBtn, { active: tab === "knock", onClick: () => setTab("knock") }, "\u6728\u9C7C"),
      h2(TabBtn, { active: tab === "fortune", onClick: () => setTab("fortune") }, "\u62BD\u7B7E"),
      h2(TabBtn, { active: tab === "book", onClick: () => setTab("book") }, "\u7B54\u4E66"),
      h2(TabBtn, { active: tab === "diary", onClick: () => setTab("diary") }, "\u65E5\u8BB0")
    ),
    // content
    h2(
      "div",
      { className: "flex-1 overflow-y-auto p-4" },
      tab === "knock" && h2(KnockTab),
      tab === "fortune" && h2(FortuneTab),
      tab === "book" && h2(BookTab),
      tab === "diary" && h2(DiaryTab)
    ),
    // footer
    h2(
      "div",
      { className: "border-t border-border px-3 py-1.5 text-[11px] text-text-muted" },
      (() => {
        const state = useZenStore.getState();
        const days = state.firstSeen ? Math.floor((Date.now() - new Date(state.firstSeen).getTime()) / 864e5) : 0;
        return `\u5DF2\u966A\u4F34 ${Math.max(days, 1)} \u5929 \xB7 \u6572\u4E86 ${state.knockCount} \u4E0B`;
      })()
    )
  );
}
function TabBtn({ active, onClick, children }) {
  return h2("button", {
    className: `flex-1 px-3 py-2 text-center text-[11px] font-medium tracking-wider transition-colors ${active ? "border-b-2 border-accent text-text" : "text-text-muted hover:text-text hover:bg-background-hover"}`,
    onClick
  }, children);
}
function KnockTab() {
  const { knockCount, maxCombo, totalZenSeconds, addKnock, setMonkMood, monkMood, soundPreference, setSoundPreference } = useZenStore();
  const [combo, setCombo] = useState(0);
  const [lastHit, setLastHit] = useState(0);
  const [zenText, setZenText] = useState(null);
  const comboRef = useRef2(0);
  const timerRef = useRef2(null);
  const btnRef = useRef2(null);
  const rippleCountRef = useRef2(0);
  const knock = useCallback(() => {
    const now = Date.now();
    const diff = now - lastHit;
    setLastHit(now);
    if (diff < 800) {
      comboRef.current += 1;
    } else {
      comboRef.current = 1;
    }
    setCombo(comboRef.current);
    if (btnRef.current) {
      const btn = btnRef.current;
      btn.classList.remove("pulse");
      void btn.offsetWidth;
      btn.classList.add("pulse");
      const ripple = document.createElement("div");
      ripple.className = "muyu-ripple";
      ripple.style.animationDuration = `${0.4 - Math.min(rippleCountRef.current * 0.02, 0.15)}s`;
      btn.appendChild(ripple);
      rippleCountRef.current++;
      setTimeout(() => ripple.remove(), 600);
    }
    playKnockSound(soundPreference);
    if (comboRef.current === 5) {
      setZenText("\u5C0F\u50E7\u505C\u4F4F\uFF0C\u770B\u7740\u4F60\u3002");
      setMonkMood("content");
    } else if (comboRef.current === 10) {
      setZenText("\u5C0F\u50E7\u7B11\u4E86\uFF0C\u548C\u4F60\u4E00\u8D77\u6572\u3002");
      setMonkMood("happy");
    } else {
      setZenText(null);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      comboRef.current = 1;
      setCombo(1);
    }, 2e3);
    addKnock(1);
  }, [lastHit, soundPreference, addKnock, setMonkMood]);
  useEffect2(() => {
    const handler = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        knock();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [knock]);
  return h2(
    "div",
    { className: "flex flex-col items-center gap-4" },
    h2(
      "div",
      { className: "flex justify-center" },
      h2(MonkCanvas, { mood: monkMood, size: 90 })
    ),
    h2(
      "button",
      {
        ref: btnRef,
        className: "muyu-btn",
        onClick: knock,
        title: "\u70B9\u51FB\u6728\u9C7C"
      },
      h2("div", { className: "muyu-eye" }),
      h2("div", { className: "muyu-mouth" })
    ),
    h2("div", { className: "text-center text-[11px] text-text-muted" }, "\u70B9\u51FB\u6728\u9C7C \xB7 \u7A7A\u683C\u8FDE\u51FB"),
    zenText && h2("div", { className: "animate-fadeIn rounded border border-border px-3 py-2 text-text" }, zenText),
    h2(
      "div",
      { className: "mt-2 w-full border-t border-border pt-2 text-[11px] text-text-muted" },
      h2(
        "div",
        { className: "flex justify-between" },
        h2("span", null, `\u6572\u51FB ${knockCount} \u4E0B`),
        h2("span", null, `\u8FDE\u51FB ${combo} \u6B21`),
        h2("span", null, `\u653E\u7A7A ${Math.round(totalZenSeconds)} \u79D2`)
      ),
      h2(
        "div",
        { className: "mt-2 flex items-center gap-2" },
        h2("span", null, "\u97F3\u8272"),
        ["muyu", "bo", "qing"].map(
          (p) => h2("button", {
            key: p,
            className: `rounded px-2 py-0.5 text-[10px] ${soundPreference === p ? "bg-accent text-black" : "border border-border hover:bg-background-hover"}`,
            onClick: () => setSoundPreference(p)
          }, p === "muyu" ? "\u6728\u9C7C" : p === "bo" ? "\u94B5" : "\u78EC")
        )
      )
    )
  );
}
function FortuneTab() {
  const { fortuneCount, addFortune } = useZenStore();
  const [fortune, setFortune] = useState(null);
  const [shaking, setShaking] = useState(false);
  const [showStick, setShowStick] = useState(false);
  const containerRef = useRef2(null);
  const draw = () => {
    if (shaking) return;
    setShaking(true);
    setFortune(null);
    setShowStick(false);
    setTimeout(() => {
      const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      setFortune(f);
      setShaking(false);
      setShowStick(true);
      addFortune(f.luck, f.text);
      setTimeout(() => setShowStick(false), 400);
    }, 500);
  };
  const luckColor = (luck) => {
    const map = { "\u5927\u5409": "text-pink-400", "\u4E2D\u5409": "text-amber-400", "\u5409": "text-green-400", "\u5C0F\u5409": "text-cyan-400", "\u672B\u5409": "text-text-muted", "\u51F6": "text-red-400", "\u5927\u51F6": "text-red-500" };
    return map[luck] || "text-text";
  };
  const bgGlow = (luck) => {
    const map = { "\u5927\u5409": "rgba(236,72,153,0.06)", "\u4E2D\u5409": "rgba(251,191,36,0.06)", "\u5409": "rgba(74,222,128,0.06)", "\u5C0F\u5409": "rgba(34,211,238,0.06)", "\u51F6": "rgba(248,113,113,0.06)", "\u5927\u51F6": "rgba(239,68,68,0.08)" };
    return map[luck] || "transparent";
  };
  return h2(
    "div",
    { className: "flex flex-col items-center gap-4" },
    h2(
      "div",
      { className: "flex justify-center" },
      h2(MonkCanvas, { mood: shaking ? "sleepy" : "content", size: 90 })
    ),
    // 签筒
    h2(
      "div",
      { ref: containerRef, className: "relative flex flex-col items-center" },
      h2(
        "button",
        {
          className: `relative w-24 h-28 rounded-t-lg rounded-b-2xl border-2 border-border bg-gradient-to-b from-amber-900/60 to-amber-950/60 flex items-center justify-center text-sm font-bold tracking-wider transition-all hover:border-accent hover:text-text ${shaking ? "fortune-shaking" : ""} ${shaking ? "opacity-70" : ""}`,
          onClick: draw,
          disabled: shaking
        },
        // 筒中签条
        h2(
          "div",
          { className: "flex flex-col items-center gap-1" },
          h2("div", { className: "w-1 h-3 bg-amber-200/40 rounded-full" }),
          h2("div", { className: "w-1 h-3 bg-amber-200/40 rounded-full" }),
          h2("div", { className: "w-1.5 h-4 bg-amber-200/50 rounded-full" }),
          h2("div", { className: "w-1 h-3 bg-amber-200/40 rounded-full" })
        ),
        // 抽出的签条
        showStick && fortune && h2("div", {
          className: "fortune-stick absolute -top-10 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-900 text-[11px] font-bold px-3 py-1 rounded shadow-lg whitespace-nowrap"
        }, fortune.luck)
      ),
      h2("div", { className: "mt-1 text-[10px] text-text-muted" }, "\u70B9\u51FB\u62BD\u7B7E")
    ),
    // 签文
    fortune && h2(
      "div",
      {
        className: "fortune-card mt-2 w-full max-w-xs rounded border border-border p-4 text-center",
        style: { background: bgGlow(fortune.luck) }
      },
      h2("div", { className: `mb-2 text-lg font-bold tracking-wider ${luckColor(fortune.luck)}` }, fortune.luck),
      h2("div", { className: "mb-1 text-text leading-relaxed" }, fortune.text),
      h2("div", { className: "mt-2 text-[10px] text-text-muted italic" }, "-- " + fortune.book)
    ),
    h2("div", { className: "mt-2 text-[11px] text-text-muted" }, `\u4ECA\u65E5\u5DF2\u62BD ${fortuneCount} \u6B21`)
  );
}
function BookTab() {
  const { bookCount, addBook } = useZenStore();
  const [page, setPage] = useState(null);
  const [showSecond, setShowSecond] = useState(false);
  const [open, setOpen] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const flip = () => {
    if (flipping) return;
    setFlipping(true);
    const idx = Math.floor(Math.random() * PUNCHLINES.length);
    const [setup, punch] = PUNCHLINES[idx];
    setPage({ first: setup + punch, second: SECOND_LINES[idx] || "\u5C0F\u50E7\u4E5F\u4E0D\u77E5\u9053\u3002\u4F46\u4ED6\u77E5\u9053\u4F60\u6CA1\u5199\u6D4B\u8BD5\u3002", idx });
    setShowSecond(false);
    setOpen(true);
    addBook(setup + punch);
    setTimeout(() => setFlipping(false), 700);
  };
  const closeBook = () => {
    setOpen(false);
    setShowSecond(false);
    setPage(null);
  };
  return h2(
    "div",
    { className: "flex flex-col items-center gap-4" },
    h2(
      "div",
      { className: "flex justify-center" },
      h2(MonkCanvas, { mood: flipping ? "sleepy" : open ? "idle" : "content", size: 90 })
    ),
    !open ? h2(
      "div",
      { className: "flex flex-col items-center gap-3" },
      h2("div", { className: "text-center text-[11px] text-text-muted" }, "\u9ED8\u5FF5\u4F60\u7684\u95EE\u9898\uFF0C\u7136\u540E\u7FFB\u5F00"),
      h2(
        "div",
        {
          className: "book-cover",
          onClick: flip
        },
        h2(
          "div",
          { className: "book-cover-inner" },
          h2("div", { className: "book-front" }, "\u7B54\u6848\u4E4B\u4E66"),
          h2("div", { className: "book-back" }, page ? page.first : "")
        )
      )
    ) : h2(
      "div",
      { className: "book-content flex w-full max-w-xs flex-col gap-3" },
      h2("div", { className: "rounded border border-border p-4 text-text leading-relaxed book-body" }, page.first),
      !showSecond ? h2("button", {
        className: "self-center rounded border border-border px-4 py-1.5 text-[11px] text-text-muted hover:border-accent hover:text-text transition-all",
        onClick: () => setShowSecond(true)
      }, "\u8FFD\u95EE") : h2("div", { className: "animate-fadeIn rounded border border-border p-4 text-text leading-relaxed" }, page.second),
      h2("button", {
        className: "self-center text-[11px] text-text-muted hover:text-text mt-2",
        onClick: closeBook
      }, "\u518D\u7FFB\u4E00\u672C")
    ),
    h2("div", { className: "mt-2 text-[11px] text-text-muted" }, `\u4ECA\u65E5\u5DF2\u7FFB ${bookCount} \u6B21`)
  );
}
function DiaryTab() {
  const { history, firstSeen, knockCount, fortuneCount, bookCount } = useZenStore();
  const totalDays = firstSeen ? Math.floor((Date.now() - new Date(firstSeen).getTime()) / 864e5) + 1 : 1;
  const typeColor = (type) => {
    if (type.startsWith("ai_")) return "border-l-cyan-400";
    if (type === "knock" || type === "ai_knock") return "border-l-sky-400";
    if (type === "fortune" || type === "ai_fortune") return "border-l-amber-400";
    if (type === "book" || type === "ai_book") return "border-l-green-400";
    return "border-l-border";
  };
  const typeDot = (type) => {
    const map = { knock: "bg-sky-400", fortune: "bg-amber-400", book: "bg-green-400", ai_knock: "bg-cyan-400", ai_fortune: "bg-amber-400", ai_book: "bg-green-400" };
    return map[type] || "bg-text-muted";
  };
  return h2(
    "div",
    { className: "flex flex-col gap-4" },
    // 统计卡片
    h2(
      "div",
      { className: "flex gap-2 rounded border border-border bg-background-elevated p-3 text-[11px]" },
      h2(
        "div",
        { className: "flex-1 text-center" },
        h2("div", { className: "text-text font-bold text-lg" }, `${totalDays}`),
        h2("div", { className: "text-text-muted" }, "\u5929")
      ),
      h2("div", { className: "w-px bg-border" }),
      h2(
        "div",
        { className: "flex-1 text-center" },
        h2("div", { className: "text-text font-bold text-lg" }, `${knockCount}`),
        h2("div", { className: "text-text-muted" }, "\u6572")
      ),
      h2("div", { className: "w-px bg-border" }),
      h2(
        "div",
        { className: "flex-1 text-center" },
        h2("div", { className: "text-text font-bold text-lg" }, `${fortuneCount}`),
        h2("div", { className: "text-text-muted" }, "\u7B7E")
      ),
      h2("div", { className: "w-px bg-border" }),
      h2(
        "div",
        { className: "flex-1 text-center" },
        h2("div", { className: "text-text font-bold text-lg" }, `${bookCount}`),
        h2("div", { className: "text-text-muted" }, "\u7FFB")
      )
    ),
    history.length === 0 ? h2("div", { className: "text-center text-[11px] text-text-muted italic" }, "\u5C0F\u50E7\u7684\u65E5\u8BB0\u672C\u8FD8\u662F\u7A7A\u767D\u7684\u3002\u53BB\u627E\u4ED6\u5427\u3002") : history.slice(0, 7).map(
      (day) => h2(
        "div",
        { key: day.date },
        h2("div", { className: "mb-1 text-[11px] font-bold tracking-wider text-text" }, "-- " + day.date + " --"),
        day.entries.slice(0, 20).map(
          (entry, i) => h2(
            "div",
            {
              key: i,
              className: `flex items-start gap-2 py-0.5 pl-1 border-l-2 ${typeColor(entry.type)}`
            },
            // 时间点圆点
            h2("div", { className: `w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${typeDot(entry.type)}` }),
            h2("span", { className: "shrink-0 text-text-muted text-[10px]" }, entry.time),
            h2("span", { className: "text-text-muted text-[10px]" }, entry.type.startsWith("ai_") ? "AI" : ""),
            h2("span", { className: "text-text-secondary" }, entry.detail)
          )
        ),
        day.entries.length > 20 && h2("div", { className: "text-[11px] text-text-muted italic" }, `... \u8FD8\u6709 ${day.entries.length - 20} \u6761`)
      )
    ),
    history.length > 7 && h2("div", { className: "text-center text-[11px] text-text-muted" }, `\u8FD8\u6709 ${history.length - 7} \u5929\u7684\u8BB0\u5F55`)
  );
}
function playKnockSound(pref) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (pref === "muyu") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    } else if (pref === "bo") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.5);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    }
    osc.start(now);
    osc.stop(now + 1);
    setTimeout(() => ctx.close(), 1200);
  } catch {
  }
}
export {
  ZenPanel as default
};
