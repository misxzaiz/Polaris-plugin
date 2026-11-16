var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/deps.ts
var deps_exports = {};
__export(deps_exports, {
  createLogger: () => createLogger,
  currentMode: () => currentMode,
  eventBus: () => eventBus,
  fileService: () => fileService,
  formatFileSize: () => formatFileSize,
  fsGetFileInfo: () => fsGetFileInfo,
  generateUUID: () => generateUUID,
  getEngineDisplayName: () => getEngineDisplayName,
  hostComponents: () => hostComponents,
  importFn: () => importFn,
  invoke: () => invoke,
  listen: () => listen,
  normalizePath: () => normalizePath,
  openInDefaultApp: () => openInDefaultApp,
  pluginSystem: () => pluginSystem,
  services: () => services,
  tauri: () => tauri,
  useCommandStore: () => useCommandStore,
  useConfigStore: () => useConfigStore,
  useEditorContextStore: () => useEditorContextStore,
  useEditorSettingsStore: () => useEditorSettingsStore,
  useFileEditorStore: () => useFileEditorStore,
  useFileExplorerStore: () => useFileExplorerStore,
  useNarrowTabStore: () => useNarrowTabStore,
  useOverlayStore: () => useOverlayStore,
  useTabStore: () => useTabStore,
  useThemeStore: () => useThemeStore,
  useToastStore: () => useToastStore,
  useTransitionState: () => useTransitionState,
  useViewStore: () => useViewStore,
  useWorkspaceStore: () => useWorkspaceStore
});
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  return c;
}
function forward(kind, name) {
  const fn = (...args) => {
    const hook = core()[kind][name];
    if (typeof hook !== "function") throw new Error(`\u5BBF\u4E3B ${kind}.${name} \u4E0D\u53EF\u7528`);
    return hook(...args);
  };
  return new Proxy(fn, {
    get: (_t, prop) => {
      const v2 = core()[kind][name][prop];
      return typeof v2 === "function" ? v2.bind(core()[kind][name]) : v2;
    }
  });
}
function useTransitionState(...args) {
  return core().hooks.useTransitionState(...args);
}
function getEngineDisplayName(...args) {
  const metadatas = core().stores.useEngineMetadataStore.getState().metadatas || [];
  const id = args[0];
  const meta = metadatas.find((mm) => mm.id === id);
  return meta?.displayName || meta?.name || String(id ?? "Claude Code");
}
function forwardAny(path, name) {
  return (...args) => {
    const c = core();
    const fn = c.services.tauri?.[name] ?? c.services[name] ?? c.utils?.[name];
    if (typeof fn !== "function") throw new Error("\u5BBF\u4E3B " + name + " \u4E0D\u53EF\u7528");
    return fn(...args);
  };
}
var useTabStore, useFileEditorStore, useWorkspaceStore, useOverlayStore, useConfigStore, useThemeStore, useEditorSettingsStore, useEditorContextStore, useNarrowTabStore, useCommandStore, useViewStore, useFileExplorerStore, useToastStore, services, eventBus, tauri, pluginSystem, hostComponents, listen, invoke, currentMode, fileService, createLogger, formatFileSize, fsGetFileInfo, generateUUID, normalizePath, openInDefaultApp, importFn;
var init_deps = __esm({
  "src/deps.ts"() {
    useTabStore = forward("stores", "useTabStore");
    useFileEditorStore = forward("stores", "useFileEditorStore");
    useWorkspaceStore = forward("stores", "useWorkspaceStore");
    useOverlayStore = forward("stores", "useOverlayStore");
    useConfigStore = forward("stores", "useConfigStore");
    useThemeStore = forward("stores", "useThemeStore");
    useEditorSettingsStore = forward("stores", "useEditorSettingsStore");
    useEditorContextStore = forward("stores", "useEditorContextStore");
    useNarrowTabStore = forward("stores", "useNarrowTabStore");
    useCommandStore = forward("stores", "useCommandStore");
    useViewStore = forward("stores", "useViewStore");
    useFileExplorerStore = forward("stores", "useFileExplorerStore");
    useToastStore = forward("stores", "useToastStore");
    services = new Proxy({}, { get: (_t, p) => core().services[p] });
    eventBus = new Proxy({}, { get: (_t, p) => core().services.eventBus[p] });
    tauri = new Proxy({}, { get: (_t, p) => core().services.tauri[p] });
    pluginSystem = new Proxy({}, { get: (_t, p) => core().pluginSystem[p] });
    hostComponents = new Proxy({}, { get: (_t, p) => core().components[p] });
    listen = (...args) => core().services.transport.listen(...args);
    invoke = (...args) => core().services.transport.invoke(...args);
    currentMode = core().services.transport.currentMode;
    fileService = new Proxy({}, { get: (_t, p) => core().services.tauri[p] });
    createLogger = forwardAny("utils", "createLogger");
    formatFileSize = forwardAny("utils", "formatFileSize");
    fsGetFileInfo = forwardAny("tauri", "fsGetFileInfo");
    generateUUID = forwardAny("tauri", "generateUUID");
    normalizePath = forwardAny("utils", "normalizePath");
    openInDefaultApp = forwardAny("tauri", "openInDefaultApp");
    importFn = forwardAny("tauri", "import");
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function invoke2(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
var _Channel_instances, _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Channel_deliver, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_instances.add(this);
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message2 = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message2);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message3 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_deliver).call(this, message3);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message2;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      /**
       * The handler called for every message sent by the Rust side of this channel.
       *
       * Assigning a new handler replaces the previous one; messages that arrived
       * before a handler was set are not replayed, so set it (or pass it to the
       * constructor) before sending the channel to the backend.
       */
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), _Channel_instances = /* @__PURE__ */ new WeakSet(), _Channel_deliver = function _Channel_deliver2(message2) {
        try {
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }, SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       *
       * @remarks Uses the `core:resources:allow-close` permission, which is part of
       * the `core:resources:default` permission set enabled by default.
       */
      async close() {
        return invoke2("plugin:resources|close", {
          rid: this.rid
        });
      }
      async [(_Resource_rid = /* @__PURE__ */ new WeakMap(), Symbol.asyncDispose)]() {
        await this.close();
      }
    };
  }
});

// node_modules/@tauri-apps/plugin-opener/dist-js/index.js
var dist_js_exports = {};
__export(dist_js_exports, {
  openPath: () => openPath,
  openUrl: () => openUrl,
  revealItemInDir: () => revealItemInDir
});
async function openUrl(url, openWith) {
  await invoke2("plugin:opener|open_url", {
    url,
    with: openWith
  });
}
async function openPath(path, openWith) {
  await invoke2("plugin:opener|open_path", {
    path,
    with: openWith
  });
}
async function revealItemInDir(path) {
  const paths = typeof path === "string" ? [path] : path;
  return invoke2("plugin:opener|reveal_item_in_dir", { paths });
}
var init_dist_js = __esm({
  "node_modules/@tauri-apps/plugin-opener/dist-js/index.js"() {
    init_core();
  }
});

// node_modules/@tauri-apps/plugin-dialog/dist-js/index.js
var dist_js_exports2 = {};
__export(dist_js_exports2, {
  ask: () => ask,
  confirm: () => confirm,
  message: () => message,
  open: () => open,
  save: () => save
});
function buttonsToRust(buttons) {
  if (buttons === void 0) {
    return void 0;
  }
  if (typeof buttons === "string") {
    return buttons;
  } else if ("ok" in buttons && "cancel" in buttons) {
    return { OkCancelCustom: [buttons.ok, buttons.cancel] };
  } else if ("yes" in buttons && "no" in buttons && "cancel" in buttons) {
    return {
      YesNoCancelCustom: [buttons.yes, buttons.no, buttons.cancel]
    };
  } else if ("ok" in buttons) {
    return { OkCustom: buttons.ok };
  }
  return void 0;
}
async function open(options = {}) {
  if (typeof options === "object") {
    Object.freeze(options);
  }
  return await invoke2("plugin:dialog|open", { options });
}
async function save(options = {}) {
  if (typeof options === "object") {
    Object.freeze(options);
  }
  return await invoke2("plugin:dialog|save", { options });
}
async function messageCommand(message2, options) {
  return await invoke2("plugin:dialog|message", {
    message: message2,
    title: options?.title,
    kind: options?.kind,
    buttons: buttonsToRust(options?.buttons)
  });
}
async function message(message2, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  if (opts && !opts.buttons && opts.okLabel) {
    opts.buttons = { ok: opts.okLabel };
  }
  return messageCommand(message2, opts);
}
async function ask(message2, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  const customButtons = opts?.okLabel || opts?.cancelLabel;
  const okLabel = opts?.okLabel ?? "Yes";
  return await messageCommand(message2, {
    title: opts?.title,
    kind: opts?.kind,
    buttons: customButtons ? { ok: okLabel, cancel: opts.cancelLabel ?? "No" } : "YesNo"
  }) === okLabel;
}
async function confirm(message2, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  const customButtons = opts?.okLabel || opts?.cancelLabel;
  const okLabel = opts?.okLabel ?? "Ok";
  return await messageCommand(message2, {
    title: opts?.title,
    kind: opts?.kind,
    buttons: customButtons ? { ok: okLabel, cancel: opts.cancelLabel ?? "Cancel" } : "OkCancel"
  }) === okLabel;
}
var init_dist_js2 = __esm({
  "node_modules/@tauri-apps/plugin-dialog/dist-js/index.js"() {
    init_core();
  }
});

// src/FileExplorer/FileExplorer.tsx
import { useEffect as useEffect10, useCallback as useCallback5, useState as useState8 } from "react";

// src/i18nShim.ts
function hostI18n() {
  return globalThis.__POLARIS_APP_CORE__?.i18n;
}
function useTranslation(...namespaces) {
  const inst = hostI18n();
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : void 0;
  if (!inst) {
    return { t: (key, opts) => key, i18n: void 0 };
  }
  return {
    t: (key, opts) => inst.t(key, { ns, ...typeof opts === "object" && opts ? opts : {} }),
    i18n: inst
  };
}

// src/FileExplorer/FileExplorer.tsx
init_deps();

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

// src/fileExplorerStore.ts
init_deps();
init_deps();

// src/fileSearch.ts
init_deps();

// src/logger.ts
function createLogger2(scope) {
  const fmt = (msg) => `[${scope}] ${msg}`;
  return {
    debug: (msg, ...rest) => {
      if (import.meta.env?.DEV) console.debug(fmt(msg), ...rest);
    },
    info: (msg, ...rest) => console.info(fmt(msg), ...rest),
    warn: (msg, ...rest) => console.warn(fmt(msg), ...rest),
    error: (msg, ...rest) => console.error(fmt(msg), ...rest)
  };
}

// src/fileSearch.ts
var log = createLogger2("FileSearch");
async function searchFiles(query, workDir, maxResults = 15) {
  if (!workDir || !query.trim()) {
    return [];
  }
  try {
    const results = await invoke("search_files", {
      workDir,
      query: query.trim(),
      maxResults
    });
    return results.map((r2) => ({
      name: r2.name,
      relativePath: r2.relativePath,
      fullPath: r2.fullPath,
      isDir: r2.isDir,
      extension: r2.extension
    }));
  } catch (error) {
    log.error("Failed to search files:", error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

// src/performanceFeatures.ts
init_deps();
function readFlag(config, key) {
  return !!config?.performance?.[key];
}
function isFileWatcherEnabled(config) {
  const cfg = config ?? useConfigStore.getState().config;
  return readFlag(cfg, "fileWatcher");
}

// src/path.ts
var platform = (() => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
})();
var isWindows = platform === "windows";
function getParentPath(path) {
  const lastSepIndex = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\")
  );
  if (lastSepIndex <= 0) {
    return null;
  }
  return path.substring(0, lastSepIndex);
}
function joinPath(basePath, name) {
  const cleanBase = basePath.replace(/[/\\]+$/, "");
  return `${cleanBase}/${name}`;
}
function normalizePath2(path) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
function isValidFileName(name) {
  if (!name || name.trim().length === 0) {
    return false;
  }
  const trimmed = name.trim();
  if (trimmed === "." || trimmed === "..") {
    return false;
  }
  if (trimmed.startsWith(" ") || trimmed.endsWith(" ")) {
    return false;
  }
  if (isWindows) {
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(trimmed)) {
      return false;
    }
    const invalidChars = /[<>:"|?*\\]/;
    if (invalidChars.test(trimmed)) {
      return false;
    }
    if (trimmed.endsWith(".")) {
      return false;
    }
  } else {
    if (trimmed.includes("/")) {
      return false;
    }
  }
  return true;
}

// src/fileExplorerStoreUtils.ts
init_deps();
function updateFolderChildren(tree, folderPath, children) {
  const normalizedFolderPath = normalizePath(folderPath);
  return tree.map((file) => {
    if (normalizePath(file.path) === normalizedFolderPath) {
      return { ...file, children };
    }
    if (file.children) {
      const updatedChildren = updateFolderChildren(file.children, folderPath, children);
      return {
        ...file,
        children: updatedChildren
      };
    }
    return file;
  });
}
function removePathFromTree(tree, targetPath) {
  const normalizedTargetPath = normalizePath(targetPath);
  return tree.filter((file) => normalizePath(file.path) !== normalizedTargetPath).map((file) => {
    if (!file.children) return file;
    return {
      ...file,
      children: removePathFromTree(file.children, targetPath)
    };
  });
}
function filterFiles(files, query) {
  if (!query.trim()) return files;
  const lowerQuery = query.toLowerCase();
  return files.reduce((acc, file) => {
    const nameMatches = file.name.toLowerCase().includes(lowerQuery);
    if (file.is_dir) {
      const filteredChildren = file.children ? filterFiles(file.children, query) : [];
      if (nameMatches || filteredChildren.length > 0) {
        acc.push({
          ...file,
          children: filteredChildren.length > 0 ? filteredChildren : file.children
        });
      }
    } else if (nameMatches) {
      acc.push(file);
    }
    return acc;
  }, []);
}
function countFiles(files) {
  let count = 0;
  for (const file of files) {
    if (file.is_dir) {
      if (file.children) {
        count += countFiles(file.children);
      }
    } else {
      count++;
    }
  }
  return count;
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

// src/workspaceStore.ts
init_deps();
init_deps();
init_deps();
init_deps();
var log2 = createLogger("WorkspaceStore");
function toEntry(w) {
  return {
    id: w.id,
    name: w.name,
    path: w.path,
    createdAt: w.createdAt,
    lastAccessed: w.lastAccessed
  };
}
function fromEntry(e) {
  return {
    id: e.id,
    name: e.name,
    path: e.path,
    createdAt: e.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    lastAccessed: e.lastAccessed ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function persistToServer(workspaces, currentWorkspaceId) {
  try {
    await (void 0)({
      workspaces: workspaces.map(toEntry),
      currentWorkspaceId: currentWorkspaceId ?? null
    });
  } catch (e) {
    log2.warn("Failed to persist workspaces to server config", { error: String(e) });
  }
}
var useWorkspaceStore2 = create()(
  persist(
    (set, get) => ({
      // 初始状态
      workspaces: [],
      currentWorkspaceId: null,
      contextWorkspaceIds: [],
      viewingWorkspaceId: null,
      isLoading: false,
      error: null,
      /** 从服务端 Config 同步工作区列表（应用初始化时调用） */
      syncFromServer: async () => {
        try {
          const config = await (void 0)();
          const serverWorkspaces = config?.workspaces;
          if (serverWorkspaces && serverWorkspaces.length > 0) {
            const local = get().workspaces;
            const serverIds = new Set(serverWorkspaces.map((w) => w.id));
            const localOnly = local.filter((w) => !serverIds.has(w.id));
            const merged = [...serverWorkspaces.map(fromEntry), ...localOnly];
            const serverCurrentId = config.currentWorkspaceId ?? null;
            set({
              workspaces: merged,
              currentWorkspaceId: serverCurrentId ?? get().currentWorkspaceId
            });
            if (localOnly.length > 0) {
              await persistToServer(merged, get().currentWorkspaceId);
            }
            log2.info("Synced workspaces from server", {
              server: serverWorkspaces.length,
              localOnly: localOnly.length,
              total: merged.length
            });
          } else if (get().workspaces.length > 0) {
            await persistToServer(get().workspaces, get().currentWorkspaceId);
            log2.info("Pushed local workspaces to server");
          }
        } catch (e) {
          log2.warn("Failed to sync workspaces from server", { error: String(e) });
        }
      },
      // 创建工作区
      createWorkspace: async (name, path, switchAfterCreate = true) => {
        set({ isLoading: true, error: null });
        try {
          const isValid = await get().validateWorkspacePath(path);
          if (!isValid) {
            throw new Error("\u65E0\u6548\u7684\u5DE5\u4F5C\u533A\u8DEF\u5F84");
          }
          const existingWorkspace = get().workspaces.find((w) => w.path === path);
          if (existingWorkspace) {
            throw new Error("\u8BE5\u8DEF\u5F84\u5DF2\u88AB\u5176\u4ED6\u5DE5\u4F5C\u533A\u4F7F\u7528");
          }
          const workspace = {
            id: generateUUID(),
            name,
            path,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            lastAccessed: (/* @__PURE__ */ new Date()).toISOString()
          };
          const newCurrentId = switchAfterCreate ? workspace.id : get().currentWorkspaceId;
          set((state) => ({
            workspaces: [...state.workspaces, workspace],
            currentWorkspaceId: newCurrentId,
            isLoading: false
          }));
          await persistToServer(get().workspaces, newCurrentId);
          if (switchAfterCreate) {
            await get().switchWorkspace(workspace.id);
          } else {
            get().addContextWorkspace(workspace.id);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "\u521B\u5EFA\u5DE5\u4F5C\u533A\u5931\u8D25",
            isLoading: false
          });
          throw error;
        }
      },
      // 切换工作区
      switchWorkspace: async (id) => {
        const workspace = get().workspaces.find((w) => w.id === id);
        if (!workspace) {
          throw new Error("\u5DE5\u4F5C\u533A\u4E0D\u5B58\u5728");
        }
        try {
          await (void 0)(workspace.path);
        } catch (error) {
          log2.error("\u66F4\u65B0\u5DE5\u4F5C\u76EE\u5F55\u5931\u8D25", error instanceof Error ? error : new Error(String(error)));
          throw new Error(`\u5207\u6362\u5DE5\u4F5C\u533A\u5931\u8D25: ${error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF"}`);
        }
        set((state) => ({
          workspaces: state.workspaces.map(
            (w) => w.id === id ? { ...w, lastAccessed: (/* @__PURE__ */ new Date()).toISOString() } : w
          ),
          currentWorkspaceId: id
        }));
        await persistToServer(get().workspaces, id);
        eventBus.emit("workspace-changed", { workspaceId: id, workspacePath: workspace.path, path: workspace.path });
        eventBus.emit("workspace-switched", void 0);
      },
      // 删除工作区
      deleteWorkspace: async (id) => {
        const { workspaces, currentWorkspaceId, contextWorkspaceIds } = get();
        if (workspaces.length <= 1) {
          throw new Error("\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2A\u5DE5\u4F5C\u533A");
        }
        const workspaceToDelete = workspaces.find((w) => w.id === id);
        if (!workspaceToDelete) {
          throw new Error("\u5DE5\u4F5C\u533A\u4E0D\u5B58\u5728");
        }
        const newWorkspaces = workspaces.filter((w) => w.id !== id);
        const newCurrentId = currentWorkspaceId === id ? newWorkspaces[0]?.id || null : currentWorkspaceId;
        const newContextIds = contextWorkspaceIds.filter((contextId) => contextId !== id);
        set({
          workspaces: newWorkspaces,
          contextWorkspaceIds: newContextIds
        });
        await persistToServer(newWorkspaces, newCurrentId);
        if (currentWorkspaceId === id && newCurrentId) {
          await get().switchWorkspace(newCurrentId);
        } else {
          set({ currentWorkspaceId: newCurrentId });
        }
      },
      // 更新工作区
      updateWorkspace: async (id, updates) => {
        set((state) => ({
          workspaces: state.workspaces.map(
            (w) => w.id === id ? { ...w, ...updates } : w
          )
        }));
        await persistToServer(get().workspaces, get().currentWorkspaceId);
      },
      // 获取当前工作区
      getCurrentWorkspace: () => {
        const { workspaces, currentWorkspaceId } = get();
        return workspaces.find((w) => w.id === currentWorkspaceId) || null;
      },
      // 验证工作区路径
      validateWorkspacePath: async (path) => {
        try {
          return await (void 0)(path);
        } catch {
          return false;
        }
      },
      // 清除错误
      clearError: () => {
        set({ error: null });
      },
      // ========== 关联工作区操作 ==========
      setContextWorkspaces: (ids) => {
        set({ contextWorkspaceIds: ids });
      },
      addContextWorkspace: (id) => {
        set((state) => {
          if (state.contextWorkspaceIds.includes(id)) return state;
          return { contextWorkspaceIds: [...state.contextWorkspaceIds, id] };
        });
      },
      removeContextWorkspace: (id) => {
        set((state) => ({
          contextWorkspaceIds: state.contextWorkspaceIds.filter((x) => x !== id)
        }));
      },
      toggleContextWorkspace: (id) => {
        const state = get();
        if (state.contextWorkspaceIds.includes(id)) {
          get().removeContextWorkspace(id);
        } else {
          get().addContextWorkspace(id);
        }
      },
      clearContextWorkspaces: () => {
        set({ contextWorkspaceIds: [] });
      },
      getContextWorkspaces: () => {
        const state = get();
        return state.workspaces.filter((w) => state.contextWorkspaceIds.includes(w.id));
      },
      getAllAccessibleWorkspaces: () => {
        return get().workspaces;
      },
      // ========== FileExplorer 浏览工作区操作 ==========
      setViewingWorkspace: (id) => {
        set({ viewingWorkspaceId: id });
      },
      getViewingWorkspace: () => {
        const state = get();
        if (!state.viewingWorkspaceId) {
          return state.workspaces.find((w) => w.id === state.currentWorkspaceId) || null;
        }
        return state.workspaces.find((w) => w.id === state.viewingWorkspaceId) || null;
      },
      getSortedWorkspaces: () => {
        return [...get().workspaces].sort(
          (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
        );
      }
    }),
    {
      name: "workspace-store",
      // 仅持久化纯本机 UI 态（关联工作区集合、浏览工作区指针）。
      // workspaces/currentWorkspaceId 不持久化：后端 config.json 为真相源，
      // 由 syncFromServer 从后端加载，避免与 configStore 双写。
      partialize: (state) => ({
        contextWorkspaceIds: state.contextWorkspaceIds,
        viewingWorkspaceId: state.viewingWorkspaceId
      })
    }
  )
);

// src/fileExplorerStore.ts
var log3 = createLogger2("FileExplorer");
var searchAbortController = null;
var useFileExplorerStore2 = create((set, get) => ({
  // 初始状态
  current_path: "",
  file_tree: [],
  selected_file: null,
  expanded_folders: /* @__PURE__ */ new Set(),
  search_query: "",
  search_results_count: void 0,
  search_is_deep_loading: false,
  search_results: void 0,
  loading: false,
  error: null,
  folder_cache: /* @__PURE__ */ new Map(),
  // 文件夹内容缓存
  loading_folders: /* @__PURE__ */ new Set(),
  // 正在加载的文件夹
  is_refreshing: false,
  // 是否正在刷新
  clipboard: null,
  // 剪贴板状态
  highlighted_path: null,
  // 高亮路径（Reveal in Explorer）
  // 加载目录内容
  load_directory: async (path) => {
    set({ loading: true, error: null });
    try {
      const files = await (void 0)(path);
      set({
        current_path: path,
        file_tree: files,
        // 切换目录时清空旧数据，避免跨工作区数据污染
        folder_cache: /* @__PURE__ */ new Map(),
        expanded_folders: /* @__PURE__ */ new Set(),
        loading_folders: /* @__PURE__ */ new Set(),
        selected_file: null,
        search_query: "",
        search_results: void 0,
        search_results_count: void 0,
        search_is_deep_loading: false,
        loading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "\u52A0\u8F7D\u76EE\u5F55\u5931\u8D25",
        loading: false
      });
    }
  },
  // 加载文件夹内容（懒加载）
  load_folder_content: async (folderPath) => {
    const normalizedPath = normalizePath2(folderPath);
    let shouldLoad = false;
    set((state) => {
      if (state.folder_cache.has(normalizedPath) || state.loading_folders.has(normalizedPath)) {
        return state;
      }
      shouldLoad = true;
      return {
        loading_folders: /* @__PURE__ */ new Set([...state.loading_folders, normalizedPath])
      };
    });
    if (!shouldLoad) {
      return;
    }
    try {
      const children = await (void 0)(folderPath);
      set((state) => {
        const newCache = new Map(state.folder_cache);
        newCache.set(normalizedPath, children);
        const updatedTree = updateFolderChildren(state.file_tree, normalizedPath, children);
        const newLoading = new Set(state.loading_folders);
        newLoading.delete(normalizedPath);
        return {
          folder_cache: newCache,
          file_tree: updatedTree,
          loading_folders: newLoading
        };
      });
    } catch (error) {
      set((state) => {
        const newLoading = new Set(state.loading_folders);
        newLoading.delete(normalizedPath);
        return {
          loading_folders: newLoading,
          error: error instanceof Error ? error.message : "\u52A0\u8F7D\u6587\u4EF6\u5939\u5931\u8D25"
        };
      });
    }
  },
  // 获取缓存的文件夹内容
  get_cached_folder_content: (folderPath) => {
    return get().folder_cache.get(normalizePath2(folderPath)) || null;
  },
  // 精确刷新指定文件夹（保留其他展开状态）
  refresh_folder: async (folderPath) => {
    const normalizedPath = normalizePath2(folderPath);
    try {
      const children = await (void 0)(folderPath);
      set((state) => {
        const newCache = new Map(state.folder_cache);
        newCache.set(normalizedPath, children);
        let updatedTree;
        if (normalizedPath === normalizePath2(state.current_path)) {
          updatedTree = children.map((newFile) => {
            const existingFile = state.file_tree.find((f) => normalizePath2(f.path) === normalizePath2(newFile.path));
            if (existingFile && existingFile.children) {
              return { ...newFile, children: existingFile.children };
            }
            return newFile;
          });
        } else {
          updatedTree = updateFolderChildren(state.file_tree, normalizedPath, children);
        }
        return {
          folder_cache: newCache,
          file_tree: updatedTree
        };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u5237\u65B0\u6587\u4EF6\u5939\u5931\u8D25" });
    }
  },
  // 刷新当前目录（清除缓存并重新加载）
  // 优化：先并行加载所有数据，再一次性更新，避免闪烁
  //
  // 关键契约（2026-10-20 修复）：
  // 1. current_path 为空时从 workspaceStore 自举，否则冷启动竞态下刷新按钮
  //    会静默 return——用户表现为"点刷新没反应、只有重新选工作区才显示"。
  // 2. 展开目录的"读取失败"与"文件夹被删除"分开处理：只有路径真的不存在
  //    才折叠（清 expanded_folders），权限/占用/瞬时错误保留展开态和旧 cache，
  //    避免刷新一次已展开目录就无谓折叠。
  refresh_directory: async () => {
    const { current_path, expanded_folders } = get();
    if (!current_path) {
      const ws = useWorkspaceStore2.getState();
      const viewing = ws.getViewingWorkspace?.() ?? null;
      const current = ws.getCurrentWorkspace?.() ?? null;
      const target = viewing || current;
      if (!target?.path) {
        log3.warn("refresh_directory \u8DF3\u8FC7\uFF1A\u65E0 current_path \u4E14 workspaceStore \u672A\u5C31\u7EEA");
        return;
      }
      log3.info("refresh_directory\uFF1Acurrent_path \u4E3A\u7A7A\uFF0C\u56DE\u9000\u5230 load_directory", { path: target.path });
      await get().load_directory(target.path);
      return;
    }
    set({ is_refreshing: true, error: null });
    try {
      const expandedPaths = Array.from(expanded_folders);
      const loadPromises = expandedPaths.map(
        (folderPath) => (void 0)(folderPath).then((children) => ({
          path: folderPath,
          status: "ok",
          children
        })).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          const isMissing = /路径不存在|不是目录|No such file|not a directory/i.test(msg);
          return isMissing ? { path: folderPath, status: "missing" } : { path: folderPath, status: "error", error: msg };
        })
      );
      const rootFiles = await (void 0)(current_path);
      const folderResults = await Promise.all(loadPromises);
      const newCache = /* @__PURE__ */ new Map();
      const removedPaths = /* @__PURE__ */ new Set();
      const failedPaths = [];
      for (const result of folderResults) {
        if (result.status === "ok") {
          newCache.set(normalizePath2(result.path), result.children);
        } else if (result.status === "missing") {
          removedPaths.add(normalizePath2(result.path));
        } else {
          failedPaths.push({ path: result.path, error: result.error });
        }
      }
      if (failedPaths.length > 0) {
        log3.warn("refresh_directory\uFF1A\u90E8\u5206\u5C55\u5F00\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25\uFF0C\u4FDD\u7559\u539F\u5C55\u5F00\u6001", {
          failed: failedPaths.map((f) => ({ path: f.path, error: f.error }))
        });
      }
      let updatedTree = rootFiles;
      for (const [folderPath, children] of newCache) {
        updatedTree = updateFolderChildren(updatedTree, folderPath, children);
      }
      set((state) => {
        const nextExpanded = new Set(state.expanded_folders);
        const nextCache = new Map(state.folder_cache);
        nextCache.clear();
        for (const [path, children] of newCache) {
          nextCache.set(path, children);
        }
        removedPaths.forEach((path) => {
          nextExpanded.delete(path);
          nextCache.delete(path);
        });
        return {
          current_path,
          file_tree: updatedTree,
          folder_cache: nextCache,
          expanded_folders: nextExpanded,
          is_refreshing: false
        };
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "\u5237\u65B0\u76EE\u5F55\u5931\u8D25",
        is_refreshing: false
      });
    }
  },
  // 选择文件
  select_file: (file) => {
    set({ selected_file: file });
  },
  // 切换文件夹展开状态
  toggle_folder: (path) => {
    set((state) => {
      const expanded = new Set(state.expanded_folders);
      const normalizedPath = normalizePath2(path);
      let found = false;
      for (const p of expanded) {
        if (normalizePath2(p) === normalizedPath) {
          expanded.delete(p);
          found = true;
          break;
        }
      }
      if (!found) {
        expanded.add(normalizedPath);
      } else {
        const newCache = new Map(state.folder_cache);
        newCache.delete(normalizedPath);
        return { expanded_folders: expanded, folder_cache: newCache };
      }
      return { expanded_folders: expanded };
    });
  },
  // 设置搜索查询（两阶段搜索：快速 + 深度）
  set_search_query: async (query) => {
    if (searchAbortController) {
      searchAbortController.abort();
    }
    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;
    set({ search_query: query });
    if (!query.trim()) {
      set({
        search_results_count: void 0,
        search_results: void 0,
        search_is_deep_loading: false
      });
      return;
    }
    const quickFiltered = filterFiles(get().file_tree, query);
    const quickCount = countFiles(quickFiltered);
    set({
      search_results_count: quickCount,
      search_is_deep_loading: true
    });
    try {
      const deepResults = await get().deep_search(query);
      if (!signal.aborted) {
        set({
          search_results: deepResults,
          search_results_count: deepResults.length,
          search_is_deep_loading: false
        });
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        log3.error("\u6DF1\u5EA6\u641C\u7D22\u5931\u8D25", error instanceof Error ? error : new Error(String(error)));
        set({ search_is_deep_loading: false });
      }
    }
  },
  // 深度搜索：使用 Rust 后端原生递归搜索（单次 IPC 调用）
  deep_search: async (query, maxResults = 50) => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return [];
    }
    if (searchAbortController?.signal.aborted) {
      throw new DOMException("\u641C\u7D22\u5DF2\u53D6\u6D88", "AbortError");
    }
    const { current_path } = get();
    if (!current_path) {
      return [];
    }
    try {
      const matches = await searchFiles(lowerQuery, current_path, maxResults);
      return matches.map((m) => ({
        name: m.name,
        path: m.fullPath,
        is_dir: m.isDir,
        extension: m.extension
      }));
    } catch (error) {
      if (error.name !== "AbortError") {
        log3.error("\u6DF1\u5EA6\u641C\u7D22\u5931\u8D25", error instanceof Error ? error : new Error(String(error)));
      }
      return [];
    }
  },
  // 取消搜索
  cancel_search: () => {
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    set({
      search_is_deep_loading: false,
      search_query: "",
      search_results: void 0,
      search_results_count: void 0
    });
  },
  // 创建文件
  create_file: async (path, content) => {
    try {
      await (void 0)(path, content);
      const parentPath = getParentPath(path);
      if (parentPath) {
        await get().refresh_folder(parentPath);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u521B\u5EFA\u6587\u4EF6\u5931\u8D25" });
    }
  },
  // 创建目录
  create_directory: async (path) => {
    try {
      await (void 0)(path);
      const parentPath = getParentPath(path);
      if (parentPath) {
        await get().refresh_folder(parentPath);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u521B\u5EFA\u76EE\u5F55\u5931\u8D25" });
    }
  },
  // 删除文件或目录
  delete_file: async (path) => {
    try {
      await (void 0)(path);
      const parentPath = getParentPath(path);
      if (parentPath) {
        await get().refresh_folder(parentPath);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u5220\u9664\u6587\u4EF6\u5931\u8D25" });
    }
  },
  // 重命名文件或目录
  rename_file: async (old_path, new_name) => {
    try {
      await (void 0)(old_path, new_name);
      const parentPath = getParentPath(old_path);
      if (parentPath) {
        await get().refresh_folder(parentPath);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u91CD\u547D\u540D\u6587\u4EF6\u5931\u8D25" });
    }
  },
  // 获取文件内容
  get_file_content: async (path) => {
    try {
      return await (void 0)(path);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u8BFB\u53D6\u6587\u4EF6\u5185\u5BB9\u5931\u8D25" });
      throw error;
    }
  },
  // 清除错误
  clear_error: () => {
    set({ error: null });
  },
  // 复制文件到剪贴板
  copy_file: (file) => {
    set({
      clipboard: {
        operation: "copy",
        sourcePath: file.path,
        sourceFile: file,
        source: "internal"
      }
    });
    (void 0)([file.path], "copy").catch((error) => {
      log3.warn("\u5199\u5165\u7CFB\u7EDF\u6587\u4EF6\u526A\u8D34\u677F\u5931\u8D25", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  },
  // 剪切文件到剪贴板
  cut_file: (file) => {
    set({
      clipboard: {
        operation: "cut",
        sourcePath: file.path,
        sourceFile: file,
        source: "internal"
      }
    });
    (void 0)([file.path], "cut").catch((error) => {
      log3.warn("\u5199\u5165\u7CFB\u7EDF\u6587\u4EF6\u526A\u8D34\u677F\u5931\u8D25", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  },
  // 粘贴文件到目标目录
  paste_file: async (targetPath) => {
    const internalClipboard = get().clipboard;
    let operation = internalClipboard?.operation;
    let sourcePath = internalClipboard?.sourcePath;
    let sourceFileName = internalClipboard?.sourceFile.name;
    let clipboardSource = internalClipboard?.source;
    try {
      const systemClipboard = await (void 0)();
      if (systemClipboard?.paths.length) {
        operation = systemClipboard.operation;
        sourcePath = systemClipboard.paths[0];
        sourceFileName = sourcePath.split(/[\\/]/).filter(Boolean).pop() || sourcePath;
        clipboardSource = "system";
      }
    } catch (error) {
      log3.warn("\u8BFB\u53D6\u7CFB\u7EDF\u6587\u4EF6\u526A\u8D34\u677F\u5931\u8D25", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    if (!operation || !sourcePath) {
      return;
    }
    const sourceParentPath = getParentPath(sourcePath);
    try {
      if (operation === "copy") {
        await (void 0)(sourcePath, targetPath);
      } else {
        await (void 0)(sourcePath, targetPath);
        set({ clipboard: null });
      }
      await get().refresh_folder(targetPath);
      if (operation === "cut" && sourceParentPath && normalizePath2(sourceParentPath) !== normalizePath2(targetPath)) {
        try {
          await get().refresh_folder(sourceParentPath);
        } catch {
          set((state) => ({
            file_tree: removePathFromTree(state.file_tree, sourcePath)
          }));
        }
      }
      if (clipboardSource === "system" && sourceFileName) {
        set({
          clipboard: {
            operation,
            sourcePath,
            sourceFile: {
              name: sourceFileName,
              path: sourcePath,
              is_dir: false
            },
            source: "system"
          }
        });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u7C98\u8D34\u6587\u4EF6\u5931\u8D25" });
    }
  },
  // 保存拖入的文件到目标目录
  save_dropped_file: async (targetPath, file) => {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      await (void 0)(targetPath, file.name, btoa(binary));
      await get().refresh_folder(targetPath);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "\u62D6\u5165\u6587\u4EF6\u5931\u8D25" });
    }
  },
  // 清除剪贴板
  clear_clipboard: () => {
    set({ clipboard: null });
  },
  // 在文件树中定位并高亮指定路径
  revealPath: async (targetPath) => {
    const { current_path, expanded_folders } = get();
    const normalized = normalizePath2(targetPath);
    const normalizedRoot = normalizePath2(current_path);
    const relative = normalized.startsWith(normalizedRoot + "/") ? normalized.slice(normalizedRoot.length + 1) : "";
    if (!relative) return;
    const parts = relative.split("/");
    const dirsToExpand = [];
    let accumulated = current_path;
    for (let i = 0; i < parts.length - 1; i++) {
      accumulated = joinPath(accumulated, parts[i]);
      dirsToExpand.push(accumulated);
    }
    const newExpanded = new Set(expanded_folders);
    for (const dir of dirsToExpand) {
      newExpanded.add(normalizePath2(dir));
    }
    set({ expanded_folders: newExpanded });
    for (const dir of dirsToExpand) {
      await get().load_folder_content(dir);
    }
    const findFile = (files) => {
      for (const f of files) {
        if (normalizePath2(f.path) === normalized) return f;
        if (f.children) {
          const found = findFile(f.children);
          if (found) return found;
        }
      }
      return null;
    };
    const file = findFile(get().file_tree);
    if (file) {
      set({
        selected_file: file,
        highlighted_path: normalized
      });
      setTimeout(() => {
        if (get().highlighted_path === normalized) {
          set({ highlighted_path: null });
        }
      }, 2e3);
    }
  }
}));
var fsWatcherCleanup = null;
var fsWatcherDebounceTimer = null;
function initFileWatcherListener() {
  const unlisten = listen("file-system-change", (event) => {
    const { affectedDirs } = event;
    const store = useFileExplorerStore2.getState();
    const { expanded_folders, current_path } = store;
    if (!current_path) return;
    const normalizedExpanded = /* @__PURE__ */ new Set();
    for (const path of expanded_folders) {
      normalizedExpanded.add(normalizePath2(path));
    }
    const dirsToRefresh = [];
    for (const relDir of affectedDirs) {
      const rawAbsPath = relDir === "." ? current_path : joinPath(current_path, relDir);
      const normalizedAbsPath = normalizePath2(rawAbsPath);
      if (relDir === ".") {
        dirsToRefresh.push(current_path);
        continue;
      }
      if (normalizedExpanded.has(normalizedAbsPath)) {
        dirsToRefresh.push(rawAbsPath);
      }
      const normalizedParentDir = getParentPath(normalizedAbsPath);
      if (normalizedParentDir && normalizedExpanded.has(normalizedParentDir)) {
        const rawParentPath = getParentPath(rawAbsPath);
        if (rawParentPath && !dirsToRefresh.includes(rawParentPath)) {
          dirsToRefresh.push(rawParentPath);
        }
      }
    }
    if (dirsToRefresh.length === 0) return;
    if (fsWatcherDebounceTimer) {
      clearTimeout(fsWatcherDebounceTimer);
    }
    fsWatcherDebounceTimer = setTimeout(() => {
      for (const dir of dirsToRefresh) {
        store.refresh_folder(dir);
      }
    }, 100);
  });
  const cleanup = () => {
    unlisten.then((fn) => fn());
    if (fsWatcherDebounceTimer) {
      clearTimeout(fsWatcherDebounceTimer);
      fsWatcherDebounceTimer = null;
    }
  };
  fsWatcherCleanup = cleanup;
  return cleanup;
}
async function startFileWatcher(rootPath) {
  if (!isFileWatcherEnabled()) {
    log3.debug("\u6587\u4EF6\u76D1\u542C\u5DF2\u7981\u7528\uFF08performance.fileWatcher=false\uFF09");
    return;
  }
  try {
    await (void 0)(rootPath);
    log3.info("\u6587\u4EF6\u76D1\u542C\u5DF2\u542F\u52A8", { rootPath });
  } catch (e) {
    log3.error("\u542F\u52A8\u6587\u4EF6\u76D1\u542C\u5931\u8D25", e instanceof Error ? e : new Error(String(e)));
  }
}
async function stopFileWatcher() {
  try {
    await (void 0)();
    if (fsWatcherCleanup) {
      fsWatcherCleanup();
      fsWatcherCleanup = null;
    }
    log3.info("\u6587\u4EF6\u76D1\u542C\u5DF2\u505C\u6B62");
  } catch (e) {
    log3.error("\u505C\u6B62\u6587\u4EF6\u76D1\u542C\u5931\u8D25", e instanceof Error ? e : new Error(String(e)));
  }
}

// src/FileExplorer/FileExplorer.tsx
init_deps();

// src/FileExplorer/FileTree.tsx
import { memo as memo3, useMemo as useMemo2, useCallback as useCallback4 } from "react";

// src/FileExplorer/FileTreeNode.tsx
import { memo, useEffect as useEffect7, useState as useState4, useCallback as useCallback2, useRef as useRef5 } from "react";

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

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
import { forwardRef, createElement } from "react";

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
  }, ref) => createElement(
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
      ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
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

// node_modules/lucide-react/dist/esm/icons/chevron-down.js
var __iconNode = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
var ChevronDown = createLucideIcon("chevron-down", __iconNode);

// node_modules/lucide-react/dist/esm/icons/chevron-right.js
var __iconNode2 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]];
var ChevronRight = createLucideIcon("chevron-right", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/copy.js
var __iconNode3 = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
];
var Copy = createLucideIcon("copy", __iconNode3);

// node_modules/lucide-react/dist/esm/icons/download.js
var __iconNode4 = [
  ["path", { d: "M12 15V3", key: "m9g1x1" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }]
];
var Download = createLucideIcon("download", __iconNode4);

// node_modules/lucide-react/dist/esm/icons/file-archive.js
var __iconNode5 = [
  [
    "path",
    {
      d: "M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5",
      key: "4pqfef"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M8 12v-1", key: "1ej8lb" }],
  ["path", { d: "M8 18v-2", key: "qcmpov" }],
  ["path", { d: "M8 7V6", key: "1nbb54" }],
  ["circle", { cx: "8", cy: "20", r: "2", key: "ckkr5m" }]
];
var FileArchive = createLucideIcon("file-archive", __iconNode5);

// node_modules/lucide-react/dist/esm/icons/file-braces.js
var __iconNode6 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  [
    "path",
    { d: "M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1", key: "1oajmo" }
  ],
  [
    "path",
    { d: "M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1", key: "mpwhp6" }
  ]
];
var FileBraces = createLucideIcon("file-braces", __iconNode6);

// node_modules/lucide-react/dist/esm/icons/file-code.js
var __iconNode7 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M10 12.5 8 15l2 2.5", key: "1tg20x" }],
  ["path", { d: "m14 12.5 2 2.5-2 2.5", key: "yinavb" }]
];
var FileCode = createLucideIcon("file-code", __iconNode7);

// node_modules/lucide-react/dist/esm/icons/file-exclamation-point.js
var __iconNode8 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
];
var FileExclamationPoint = createLucideIcon("file-exclamation-point", __iconNode8);

// node_modules/lucide-react/dist/esm/icons/file-text.js
var __iconNode9 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }]
];
var FileText = createLucideIcon("file-text", __iconNode9);

// node_modules/lucide-react/dist/esm/icons/file.js
var __iconNode10 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }]
];
var File = createLucideIcon("file", __iconNode10);

// node_modules/lucide-react/dist/esm/icons/folder-open.js
var __iconNode11 = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
];
var FolderOpen = createLucideIcon("folder-open", __iconNode11);

// node_modules/lucide-react/dist/esm/icons/folder.js
var __iconNode12 = [
  [
    "path",
    {
      d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      key: "1kt360"
    }
  ]
];
var Folder = createLucideIcon("folder", __iconNode12);

// node_modules/lucide-react/dist/esm/icons/image.js
var __iconNode13 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
];
var Image = createLucideIcon("image", __iconNode13);

// node_modules/lucide-react/dist/esm/icons/info.js
var __iconNode14 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
];
var Info = createLucideIcon("info", __iconNode14);

// node_modules/lucide-react/dist/esm/icons/loader-circle.js
var __iconNode15 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
var LoaderCircle = createLucideIcon("loader-circle", __iconNode15);

// node_modules/lucide-react/dist/esm/icons/lock.js
var __iconNode16 = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }]
];
var Lock = createLucideIcon("lock", __iconNode16);

// node_modules/lucide-react/dist/esm/icons/search.js
var __iconNode17 = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
];
var Search = createLucideIcon("search", __iconNode17);

// node_modules/lucide-react/dist/esm/icons/shield-check.js
var __iconNode18 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
var ShieldCheck = createLucideIcon("shield-check", __iconNode18);

// node_modules/lucide-react/dist/esm/icons/triangle-alert.js
var __iconNode19 = [
  [
    "path",
    {
      d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      key: "wmoenq"
    }
  ],
  ["path", { d: "M12 9v4", key: "juzpu7" }],
  ["path", { d: "M12 17h.01", key: "p32p05" }]
];
var TriangleAlert = createLucideIcon("triangle-alert", __iconNode19);

// node_modules/lucide-react/dist/esm/icons/x.js
var __iconNode20 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("x", __iconNode20);

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

// src/FileIcon.tsx
import { jsx } from "react/jsx-runtime";
var LANGUAGE_COLORS = {
  typescript: "text-blue-400",
  javascript: "text-yellow-400",
  python: "text-green-400",
  rust: "text-orange-400",
  go: "text-cyan-400",
  java: "text-red-400",
  cpp: "text-blue-300",
  c: "text-blue-300",
  ruby: "text-red-400",
  php: "text-purple-400",
  shell: "text-green-300",
  json: "text-yellow-300",
  markdown: "text-blue-300",
  text: "text-text-muted",
  html: "text-orange-500",
  css: "text-blue-500",
  scss: "text-pink-500",
  yaml: "text-red-400",
  xml: "text-orange-400"
};
function getLanguageFromPath(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    cc: "cpp",
    rb: "ruby",
    php: "php",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    txt: "text",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less"
  };
  return ext ? map[ext] || "text" : "text";
}
function getFileIcon(extension, fileName) {
  const ext = extension?.toLowerCase();
  const name = fileName.toLowerCase();
  if (name === "dockerfile" || name.endsWith(".dockerfile")) return /* @__PURE__ */ jsx(FileExclamationPoint, { className: "w-4 h-4" });
  if (name === "docker-compose.yml" || name === "docker-compose.yaml") return /* @__PURE__ */ jsx(FileExclamationPoint, { className: "w-4 h-4" });
  if (name === ".gitignore") return /* @__PURE__ */ jsx(Lock, { className: "w-4 h-4" });
  if (name.endsWith(".lock") || name === "package-lock.json" || name === "yarn.lock" || name === "pnpm-lock.yaml") {
    return /* @__PURE__ */ jsx(Lock, { className: "w-4 h-4" });
  }
  if (!ext) return /* @__PURE__ */ jsx(File, { className: "w-4 h-4" });
  if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "kt", "cs", "cpp", "c", "h", "hpp", "cc", "rb", "php", "swift", "scala", "sh", "bash", "zsh", "fish", "ps1"].includes(ext)) {
    return /* @__PURE__ */ jsx(FileCode, { className: "w-4 h-4" });
  }
  if (["json", "yaml", "yml", "toml", "xml", "ini", "conf", "env"].includes(ext)) {
    return /* @__PURE__ */ jsx(FileBraces, { className: "w-4 h-4" });
  }
  if (["md", "txt", "doc", "docx", "pdf", "rtf"].includes(ext)) {
    return /* @__PURE__ */ jsx(FileText, { className: "w-4 h-4" });
  }
  if (["css", "scss", "sass", "less", "styl"].includes(ext)) {
    return /* @__PURE__ */ jsx(FileCode, { className: "w-4 h-4" });
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "bmp", "ico", "webp"].includes(ext)) {
    return /* @__PURE__ */ jsx(Image, { className: "w-4 h-4" });
  }
  if (["zip", "tar", "gz", "rar", "7z", "bz2"].includes(ext)) {
    return /* @__PURE__ */ jsx(FileArchive, { className: "w-4 h-4" });
  }
  if (["msi", "exe", "dmg", "deb", "rpm", "pkg", "appimage", "app"].includes(ext)) {
    return /* @__PURE__ */ jsx(FileArchive, { className: "w-4 h-4" });
  }
  return /* @__PURE__ */ jsx(File, { className: "w-4 h-4" });
}
function FileIcon({ file, className = "" }) {
  if (file.is_dir) {
    return null;
  }
  const language = getLanguageFromPath(file.path);
  const colorClass = LANGUAGE_COLORS[language] || "text-text-muted";
  const icon = getFileIcon(file.extension, file.name);
  return /* @__PURE__ */ jsx("span", { className: `inline-flex items-center justify-center ${colorClass} ${className}`, children: icon });
}

// src/FileExplorer/ContextMenu.tsx
import { useEffect, useRef } from "react";
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function ContextMenu({ visible, x, y: y2, items, onClose }) {
  const menuRef = useRef(null);
  const positionRef = useRef({ x, y: y2 });
  useEffect(() => {
    positionRef.current = { x, y: y2 };
  }, [x, y2]);
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let adjustedX = positionRef.current.x;
    let adjustedY = positionRef.current.y;
    if (adjustedX + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (adjustedY + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }
    if (adjustedX !== positionRef.current.x || adjustedY !== positionRef.current.y) {
      menu.style.left = `${adjustedX}px`;
      menu.style.top = `${adjustedY}px`;
    }
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleScroll = () => {
      onClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose]);
  if (!visible || items.length === 0) {
    return null;
  }
  return /* @__PURE__ */ jsx2(
    "div",
    {
      ref: menuRef,
      className: "fixed z-popover bg-background-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px]",
      style: { left: `${x}px`, top: `${y2}px` },
      children: items.map((item) => {
        if (item.label === "-") {
          return /* @__PURE__ */ jsx2(
            "div",
            {
              className: "my-1 mx-2 border-t border-border"
            },
            item.id
          );
        }
        return /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: `w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${item.disabled ? "text-text-muted cursor-not-allowed" : "text-text-secondary hover:bg-background-hover hover:text-text-primary"}`,
            disabled: item.disabled,
            onClick: async () => {
              if (item.disabled) return;
              onClose();
              await item.action();
            },
            children: [
              item.icon && /* @__PURE__ */ jsx2("span", { className: "text-base flex-shrink-0", children: typeof item.icon === "string" ? item.icon : item.icon }),
              /* @__PURE__ */ jsx2("span", { children: item.label })
            ]
          },
          item.id
        );
      })
    }
  );
}
function isHtmlFile(file) {
  if (file.is_dir) return false;
  const ext = file.extension?.toLowerCase();
  return ext === "html" || ext === "htm";
}

// src/FileExplorer/FileDetailsModal.tsx
import { useEffect as useEffect4, useState as useState2 } from "react";

// src/OverlayGuard.tsx
init_deps();
import { useEffect as useEffect2 } from "react";
import { Fragment, jsx as jsx3 } from "react/jsx-runtime";
function OverlayGuard({ children, label: _label }) {
  const increment = useOverlayStore((s) => s.increment);
  const decrement = useOverlayStore((s) => s.decrement);
  useEffect2(() => {
    increment();
    return () => {
      decrement();
    };
  }, [increment, decrement]);
  return /* @__PURE__ */ jsx3(Fragment, { children });
}

// src/useTransitionState.ts
import { useState, useEffect as useEffect3, useRef as useRef2, useCallback } from "react";
function useTransitionState2({
  duration = 260,
  onExited,
  enabled = true
}) {
  const [mounted, setMounted] = useState(true);
  const [phase, setPhase] = useState("entering");
  const onExitedRef = useRef2(onExited);
  onExitedRef.current = onExited;
  const exit = useCallback(() => {
    setPhase((prev) => prev === "exiting" ? prev : "exiting");
  }, []);
  useEffect3(() => {
    if (!enabled) {
      setPhase("open");
      return;
    }
    const t = setTimeout(() => setPhase("open"), duration);
    return () => clearTimeout(t);
  }, [enabled, duration]);
  useEffect3(() => {
    if (phase !== "exiting") return;
    if (!enabled) {
      setMounted(false);
      onExitedRef.current?.();
      return;
    }
    const t = setTimeout(() => {
      setMounted(false);
      onExitedRef.current?.();
    }, duration);
    return () => clearTimeout(t);
  }, [phase, enabled, duration]);
  return { mounted, phase, exit };
}

// src/FileExplorer/FileDetailsModal.tsx
init_deps();
init_deps();
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
function formatTimestamp(seconds) {
  if (seconds == null || seconds === "") return "\u2014";
  const ms = Number(seconds) * 1e3;
  if (Number.isNaN(ms)) return seconds;
  return new Date(ms).toLocaleString();
}
function formatItemCount(count) {
  if (count == null) return "\u2014";
  return String(count);
}
function FileDetailsModal({ file, onClose }) {
  const { t } = useTranslation("fileExplorer");
  const { mounted, phase, exit } = useTransitionState2({
    duration: 180,
    onExited: () => onClose()
  });
  const [details, setDetails] = useState2(null);
  const [error, setError] = useState2(null);
  useEffect4(() => {
    let cancelled = false;
    fsGetFileInfo(file.path).then((info2) => {
      if (cancelled) return;
      setDetails(info2);
      setError(null);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [file.path]);
  useEffect4(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        exit();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [exit]);
  if (!mounted) return null;
  const info = details ?? file;
  const typeLabel = info.is_dir ? t("details.typeFolder") : info.extension ? `${t("details.typeFile")} (.${info.extension})` : t("details.typeFile");
  const rows = [
    { label: t("details.type"), value: typeLabel },
    ...info.is_dir ? [
      {
        label: t("details.itemCount"),
        value: formatItemCount(info.child_count)
      }
    ] : [{ label: t("details.size"), value: formatFileSize(info.size ?? 0) }],
    { label: t("details.modified"), value: formatTimestamp(info.modified) },
    { label: t("details.created"), value: formatTimestamp(info.created) },
    { label: t("details.path"), value: info.path }
  ];
  const exiting = phase === "exiting";
  return /* @__PURE__ */ jsx4(OverlayGuard, { label: "FileDetailsModal", children: /* @__PURE__ */ jsx4(
    "div",
    {
      className: `fixed inset-0 flex items-center justify-center z-modal ${exiting ? "animate-mask-out" : "animate-mask-in"}`,
      style: { background: "rgba(0,0,0,0.5)" },
      onClick: () => exit(),
      children: /* @__PURE__ */ jsxs2(
        "div",
        {
          className: `bg-background-elevated rounded-xl p-4 sm:p-6 w-full max-w-md border border-border shadow-glow ${exiting ? "animate-dialog-out" : "animate-dialog-in"}`,
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsx4("h2", { className: "text-lg font-semibold text-text-primary mb-4", children: t("details.title") }),
            /* @__PURE__ */ jsxs2("div", { className: "text-sm text-text-secondary space-y-3", children: [
              /* @__PURE__ */ jsxs2("div", { className: "flex items-start justify-between gap-3", children: [
                /* @__PURE__ */ jsx4("span", { className: "text-text-muted flex-shrink-0", children: t("details.name") }),
                /* @__PURE__ */ jsx4("span", { className: "text-text-primary font-medium text-right break-all min-w-0", children: info.name })
              ] }),
              rows.map((row) => /* @__PURE__ */ jsxs2("div", { className: "flex items-start justify-between gap-3", children: [
                /* @__PURE__ */ jsx4("span", { className: "text-text-muted flex-shrink-0", children: row.label }),
                /* @__PURE__ */ jsx4("span", { className: "text-text-primary text-right break-all min-w-0", children: row.value })
              ] }, row.label))
            ] }),
            error && /* @__PURE__ */ jsx4("p", { className: "text-xs text-danger mt-3", children: t("details.loadError", { error }) }),
            /* @__PURE__ */ jsx4("div", { className: "flex justify-end gap-2 mt-6", children: /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                onClick: () => exit(),
                className: "px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors",
                children: t("details.close")
              }
            ) })
          ]
        }
      )
    }
  ) });
}

// src/FileExplorer/FileTreeNode.tsx
init_deps();
init_deps();

// src/platform.ts
init_deps();
var isTauri = () => currentMode === "tauri";

// src/InputDialog.tsx
import { useEffect as useEffect5, useRef as useRef3, useState as useState3 } from "react";
import { jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
function InputDialog({
  title,
  message: message2,
  defaultValue = "",
  placeholder = "",
  onConfirm,
  onCancel,
  validate
}) {
  const { t } = useTranslation("common");
  const [value, setValue] = useState3(defaultValue);
  const [error, setError] = useState3(null);
  const inputRef = useRef3(null);
  const { mounted, phase, exit } = useTransitionState2({
    duration: 180,
    onExited: () => {
      pendingAction.current?.();
      pendingAction.current = null;
    }
  });
  const pendingAction = useRef3(null);
  useEffect5(() => {
    if (mounted && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mounted]);
  const handleConfirm = () => {
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    pendingAction.current = () => onConfirm(value.trim());
    exit();
  };
  const handleCancel = () => {
    pendingAction.current = onCancel;
    exit();
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };
  const handleChange = (e) => {
    setValue(e.target.value);
    setError(null);
  };
  if (!mounted) return null;
  const exiting = phase === "exiting";
  return /* @__PURE__ */ jsx5(OverlayGuard, { label: "InputDialog", children: /* @__PURE__ */ jsx5(
    "div",
    {
      className: `fixed inset-0 flex items-center justify-center z-modal ${exiting ? "animate-mask-out" : "animate-mask-in"}`,
      style: { background: "rgba(0,0,0,0.5)" },
      children: /* @__PURE__ */ jsxs3("div", { className: `bg-background-elevated rounded-xl p-4 sm:p-6 w-full max-w-md border border-border shadow-glow ${exiting ? "animate-dialog-out" : "animate-dialog-in"}`, children: [
        /* @__PURE__ */ jsx5("h2", { className: "text-lg font-semibold text-text-primary mb-2", children: title }),
        message2 && /* @__PURE__ */ jsx5("p", { className: "text-sm text-text-secondary mb-4", children: message2 }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            ref: inputRef,
            type: "text",
            value,
            onChange: handleChange,
            onKeyDown: handleKeyDown,
            placeholder,
            className: `w-full px-3 py-2 bg-background-surface border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 transition-colors ${error ? "border-danger focus:ring-danger" : "border-border focus:ring-primary"}`
          }
        ),
        error && /* @__PURE__ */ jsx5("p", { className: "mt-2 text-sm text-danger", children: error }),
        /* @__PURE__ */ jsxs3("div", { className: "flex justify-end gap-2 mt-6", children: [
          /* @__PURE__ */ jsx5(
            "button",
            {
              type: "button",
              onClick: handleCancel,
              className: "px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors",
              children: t("buttons.cancel")
            }
          ),
          /* @__PURE__ */ jsx5(
            "button",
            {
              type: "button",
              onClick: handleConfirm,
              disabled: !value.trim(),
              className: "px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              children: t("buttons.confirm")
            }
          )
        ] })
      ] })
    }
  ) });
}

// src/ConfirmDialog.tsx
import { useEffect as useEffect6, useRef as useRef4 } from "react";
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function ConfirmDialog({
  title,
  message: message2,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  type = "danger",
  losses,
  safetyNet
}) {
  const { t } = useTranslation("common");
  const confirmButtonRef = useRef4(null);
  const finalConfirmText = confirmText || t("buttons.confirm");
  const finalCancelText = cancelText || t("buttons.cancel");
  const { mounted, phase, exit } = useTransitionState2({
    duration: 180,
    onExited: () => {
      pendingAction.current?.();
      pendingAction.current = null;
    }
  });
  const pendingAction = useRef4(null);
  const handleConfirm = () => {
    pendingAction.current = onConfirm;
    exit();
  };
  const handleCancel = () => {
    pendingAction.current = onCancel;
    exit();
  };
  useEffect6(() => {
    if (mounted && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [mounted]);
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };
  const getColorClass = () => {
    switch (type) {
      case "danger":
        return "bg-danger hover:bg-danger/90";
      case "warning":
        return "bg-warning hover:bg-warning/90";
      case "info":
        return "bg-primary hover:bg-primary/90";
      default:
        return "bg-primary hover:bg-primary/90";
    }
  };
  if (!mounted) return null;
  const exiting = phase === "exiting";
  return /* @__PURE__ */ jsx6(OverlayGuard, { label: "ConfirmDialog", children: /* @__PURE__ */ jsx6(
    "div",
    {
      className: `fixed inset-0 flex items-center justify-center z-modal ${exiting ? "animate-mask-out" : "animate-mask-in"}`,
      style: { background: "rgba(0,0,0,0.5)" },
      onKeyDown: handleKeyDown,
      children: /* @__PURE__ */ jsxs4("div", { className: `bg-background-elevated rounded-xl p-4 sm:p-6 w-full max-w-md border border-border shadow-glow ${exiting ? "animate-dialog-out" : "animate-dialog-in"}`, children: [
        title && /* @__PURE__ */ jsx6("h2", { className: "text-lg font-semibold text-text-primary mb-2", children: title }),
        /* @__PURE__ */ jsx6("p", { className: `text-sm text-text-secondary whitespace-pre-wrap ${losses?.length ? "mb-4" : "mb-6"}`, children: message2 }),
        losses && losses.length > 0 && /* @__PURE__ */ jsxs4("div", { className: `${safetyNet ? "mb-4" : "mb-6"} rounded-lg border border-danger/30 bg-danger/5 p-3`, children: [
          /* @__PURE__ */ jsxs4("div", { className: "text-xs font-semibold text-danger mb-1.5 flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx6(TriangleAlert, { size: 13 }),
            t("lossesHeading")
          ] }),
          /* @__PURE__ */ jsx6("ul", { className: "space-y-1", children: losses.map((loss, i) => /* @__PURE__ */ jsx6("li", { className: "text-xs text-text-secondary whitespace-pre-wrap break-all", children: loss }, i)) })
        ] }),
        safetyNet && /* @__PURE__ */ jsxs4("div", { className: "mb-6 rounded-lg border border-primary/25 bg-primary/5 p-3 flex gap-1.5", children: [
          /* @__PURE__ */ jsx6(ShieldCheck, { size: 13, className: "text-primary shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsx6("span", { className: "text-xs text-text-secondary whitespace-pre-wrap break-all", children: safetyNet })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx6(
            "button",
            {
              type: "button",
              onClick: handleCancel,
              className: "px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors",
              children: finalCancelText
            }
          ),
          /* @__PURE__ */ jsx6(
            "button",
            {
              ref: confirmButtonRef,
              type: "button",
              onClick: handleConfirm,
              className: `px-4 py-2 text-sm text-white rounded-lg transition-colors ${getColorClass()}`,
              children: finalConfirmText
            }
          )
        ] })
      ] })
    }
  ) });
}

// src/Icons/StatusIcons.tsx
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";

// src/Icons/ActionIcons.tsx
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
function IconEdit({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs6(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx8(
          "path",
          {
            d: "M11.5 2.5L13.5 4.5M11.5 2.5L9 5L8 11L9.5 10.5L13.5 6.5L11.5 2.5Z",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsx8(
          "path",
          {
            d: "M3.5 12.5H12.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        )
      ]
    }
  );
}
function IconTrash({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs6(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx8(
          "path",
          {
            d: "M3.5 4.5H12.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round"
          }
        ),
        /* @__PURE__ */ jsx8(
          "path",
          {
            d: "M5.5 4.5V3.5C5.5 2.94772 5.94772 2.5 6.5 2.5H9.5C10.0523 2.5 10.5 2.94772 10.5 3.5V4.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsx8(
          "path",
          {
            d: "M5 4.5V11.5C5 12.0523 5.44772 12.5 6 12.5H10C10.5523 12.5 11 12.0523 11 11.5V4.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        )
      ]
    }
  );
}
function IconPlus({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsx8(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M8 3V13M3 8H13",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinecap: "round"
        }
      )
    }
  );
}
function IconOpen({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsx8(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M8 3V13M3 8H13",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinecap: "round"
        }
      )
    }
  );
}

// src/Icons/NavigationIcons.tsx
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
function IconExternalLink({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs7(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx9(
          "path",
          {
            d: "M10 3.5H12.5V6",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsx9(
          "path",
          {
            d: "M7.5 8.5L12.5 3.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsx9(
          "path",
          {
            d: "M11.5 9.5V11.5C11.5 12.0523 11.0523 12.5 10.5 12.5H4.5C3.94772 12.5 3.5 12.0523 3.5 11.5V5.5C3.5 4.94772 3.94772 4.5 4.5 4.5H6.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        )
      ]
    }
  );
}

// src/Icons/FileIcons.tsx
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function IconFile({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsxs8(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: [
        /* @__PURE__ */ jsx10(
          "path",
          {
            d: "M3.5 2.5H9.5L12.5 5.5V12.5C12.5 13.0523 12.0523 13.5 11.5 13.5H3.5C2.94772 13.5 2.5 13.0523 2.5 12.5V3.5C2.5 2.94772 2.94772 2.5 3.5 2.5Z",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsx10(
          "path",
          {
            d: "M9.5 2.5V5.5H12.5",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinejoin: "round"
          }
        )
      ]
    }
  );
}
function IconFolder({ size = 16, className = "", ...props }) {
  return /* @__PURE__ */ jsx10(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      className,
      ...props,
      children: /* @__PURE__ */ jsx10(
        "path",
        {
          d: "M2.5 4.5C2.5 3.94772 2.94772 3.5 3.5 3.5H6L7.5 5H12.5C13.0523 5 13.5 5.44772 13.5 6V11.5C13.5 12.0523 13.0523 12.5 12.5 12.5H3.5C2.94772 12.5 2.5 12.0523 2.5 11.5V4.5Z",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinejoin: "round"
        }
      )
    }
  );
}

// src/Icons/UIIcons.tsx
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";

// src/Icons/EngineIcons.tsx
import { jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";

// src/Icons/AudioIcons.tsx
import { jsx as jsx13, jsxs as jsxs11 } from "react/jsx-runtime";

// src/FileExplorer/FileTreeNode.tsx
init_deps();
import { jsx as jsx14, jsxs as jsxs12 } from "react/jsx-runtime";
var FileTreeNode = memo(({
  file,
  level,
  isExpanded,
  isSelected,
  expandedFolders,
  loadingFolders
}) => {
  const { t } = useTranslation("fileExplorer");
  const {
    load_folder_content,
    get_cached_folder_content,
    toggle_folder,
    select_file,
    create_file,
    create_directory,
    delete_file,
    rename_file,
    copy_file,
    cut_file,
    paste_file,
    save_dropped_file,
    clipboard,
    selected_file: storeSelectedFile,
    highlighted_path
  } = useFileExplorerStore();
  const { openFile } = useFileEditorStore();
  const toast = useToastStore();
  const nodeRef = useRef5(null);
  const [contextMenu, setContextMenu] = useState4({ visible: false, x: 0, y: 0 });
  const [inputDialog, setInputDialog] = useState4({ visible: false, title: "", message: "", defaultValue: "", action: "create-file" });
  const [confirmDialog, setConfirmDialog] = useState4({ visible: false, message: "" });
  const [detailsVisible, setDetailsVisible] = useState4(false);
  useEffect7(() => {
    if (file.is_dir && isExpanded) {
      const cached = get_cached_folder_content(file.path);
      if (!cached && file.children == null) {
        load_folder_content(file.path);
      }
    }
  }, [file.is_dir, file.path, isExpanded, file.children, load_folder_content, get_cached_folder_content]);
  const isHighlighted = highlighted_path != null && normalizePath2(file.path) === highlighted_path;
  useEffect7(() => {
    if (isHighlighted && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);
  const handleClick = async (e) => {
    e.stopPropagation();
    if (file.is_dir) {
      toggle_folder(file.path);
      if (!isExpanded) {
        const cached = get_cached_folder_content(file.path);
        if (!cached && file.children == null) {
          await load_folder_content(file.path);
        }
      }
    } else {
      select_file(file);
      await openFile(file.path, file.name);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(e);
    }
  };
  const isLoading = file.is_dir && loadingFolders.has(normalizePath2(file.path));
  const isCutSource = clipboard?.operation === "cut" && normalizePath2(clipboard.sourcePath) === normalizePath2(file.path);
  const formatTimestamp2 = useCallback2((seconds) => {
    if (seconds == null || seconds === "") return "";
    const ms = Number(seconds) * 1e3;
    if (Number.isNaN(ms)) return seconds;
    return new Date(ms).toLocaleString();
  }, []);
  const hasChildren = file.children != null && file.children.length > 0;
  const isChildrenLoaded = file.children != null;
  const closeContextMenu = useCallback2(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);
  const handleContextMenu = useCallback2((e) => {
    e.preventDefault();
    e.stopPropagation();
    select_file(file);
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY
    });
  }, [file, select_file]);
  const handleNodeDragOver = useCallback2((e) => {
    if (!file.is_dir || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, [file.is_dir]);
  const handleNodeDrop = useCallback2(async (e) => {
    if (!file.is_dir) return;
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    for (const droppedFile of files) {
      await save_dropped_file(file.path, droppedFile);
    }
    toast.success(t("toast.dropped"), files.length === 1 ? files[0].name : String(files.length));
  }, [file.is_dir, file.path, save_dropped_file, t, toast]);
  const getMenuItems = useCallback2(() => {
    const items = [
      {
        id: "open",
        label: file.is_dir ? t("contextMenu.openFolder") : t("contextMenu.openFile"),
        icon: /* @__PURE__ */ jsx14(IconOpen, { size: 14 }),
        action: async () => {
          if (file.is_dir) {
            toggle_folder(file.path);
          } else {
            await openFile(file.path, file.name);
          }
        }
      }
    ];
    if (file.is_dir) {
      items.push({
        id: "create-file",
        label: t("contextMenu.newFile"),
        icon: /* @__PURE__ */ jsx14(IconFile, { size: 14 }),
        action: () => {
          setInputDialog({
            visible: true,
            title: t("contextMenu.newFile"),
            message: t("contextMenu.inputFileName"),
            defaultValue: "",
            action: "create-file"
          });
        }
      });
      items.push({
        id: "create-folder",
        label: t("contextMenu.newFolder"),
        icon: /* @__PURE__ */ jsx14(IconFolder, { size: 14 }),
        action: () => {
          setInputDialog({
            visible: true,
            title: t("contextMenu.newFolder"),
            message: t("contextMenu.inputFolderName"),
            defaultValue: "",
            action: "create-folder"
          });
        }
      });
    }
    items.push({ id: "separator-1", label: "-", icon: void 0, action: () => {
    } });
    items.push({
      id: "properties",
      label: t("contextMenu.properties"),
      icon: /* @__PURE__ */ jsx14(Info, { size: 14 }),
      action: () => {
        setDetailsVisible(true);
      }
    });
    items.push({
      id: "copy-path",
      label: t("contextMenu.copyPath"),
      icon: /* @__PURE__ */ jsx14(Copy, { size: 14 }),
      action: async () => {
        await navigator.clipboard.writeText(file.path);
      }
    });
    if (isTauri()) {
      items.push({
        id: "open-in-explorer",
        label: file.is_dir ? t("contextMenu.openInExplorer") : t("contextMenu.openFolderInExplorer"),
        icon: /* @__PURE__ */ jsx14(FolderOpen, { size: 14 }),
        action: async () => {
          try {
            const { openPath: openPath2 } = await Promise.resolve().then(() => (init_dist_js(), dist_js_exports));
            const targetPath = file.is_dir ? file.path : getParentPath(file.path);
            if (targetPath) await openPath2(targetPath);
          } catch {
          }
        }
      });
      items.push({ id: "separator-2", label: "-", icon: void 0, action: () => {
      } });
    }
    items.push({
      id: "copy",
      label: t("contextMenu.copy"),
      icon: /* @__PURE__ */ jsx14(Copy, { size: 14 }),
      action: () => {
        copy_file(file);
        toast.success(t("toast.copied"), file.name);
      }
    });
    items.push({
      id: "cut",
      label: t("contextMenu.cut"),
      icon: /* @__PURE__ */ jsx14(IconEdit, { size: 14 }),
      action: () => {
        cut_file(file);
        toast.success(t("toast.cut"), file.name);
      }
    });
    if (file.is_dir && clipboard) {
      items.push({
        id: "paste",
        label: t("contextMenu.paste"),
        icon: /* @__PURE__ */ jsx14(IconFolder, { size: 14 }),
        action: async () => {
          await paste_file(file.path);
          toast.success(t("toast.pasted"), clipboard.sourceFile.name);
        }
      });
    }
    items.push({ id: "separator-rename", label: "-", icon: void 0, action: () => {
    } });
    items.push({
      id: "rename",
      label: t("contextMenu.rename"),
      icon: /* @__PURE__ */ jsx14(IconEdit, { size: 14 }),
      action: () => {
        setInputDialog({
          visible: true,
          title: t("contextMenu.rename"),
          message: t("contextMenu.inputNewName"),
          defaultValue: file.name,
          action: "rename"
        });
      }
    });
    items.push({
      id: "delete",
      label: t("contextMenu.delete"),
      icon: /* @__PURE__ */ jsx14(IconTrash, { size: 14 }),
      action: () => {
        const itemType = file.is_dir ? t("contextMenu.newFolder") : t("contextMenu.newFile");
        setConfirmDialog({
          visible: true,
          message: t("confirmDeleteMessage", { type: itemType.toLowerCase(), name: file.name })
        });
      }
    });
    items.push({ id: "separator-3", label: "-", icon: void 0, action: () => {
    } });
    if (!file.is_dir) {
      items.push({
        id: "download",
        label: t("contextMenu.downloadFile"),
        icon: /* @__PURE__ */ jsx14(Download, { size: 14 }),
        action: async () => {
          if (isTauri()) {
            const { save: save2 } = await Promise.resolve().then(() => (init_dist_js2(), dist_js_exports2));
            const destination = await save2({
              defaultPath: file.name
            });
            if (!destination) return;
            const { copyPath } = await Promise.resolve().then(() => (init_deps(), deps_exports));
            await copyPath(file.path, destination);
          } else {
            const { downloadFile } = await Promise.resolve().then(() => (init_deps(), deps_exports));
            await downloadFile(file.path, file.name);
          }
        }
      });
    }
    if (isHtmlFile(file)) {
      items.push({ id: "separator-4", label: "-", icon: void 0, action: () => {
      } });
      items.push({
        id: "open-in-browser",
        label: t("contextMenu.openInBrowser"),
        icon: /* @__PURE__ */ jsx14(IconExternalLink, { size: 14 }),
        action: async () => {
          await openInDefaultApp(file.path);
        }
      });
    }
    return items;
  }, [file, toggle_folder, openFile, t, copy_file, cut_file, paste_file, clipboard, toast]);
  const handleInputDialogConfirm = async (value) => {
    if (!value) return;
    if (inputDialog.action === "create-file") {
      if (isValidFileName(value)) {
        const fullPath = joinPath(file.path, value);
        await create_file(fullPath, "");
        setInputDialog({ ...inputDialog, visible: false });
      }
    } else if (inputDialog.action === "create-folder") {
      if (isValidFileName(value)) {
        const fullPath = joinPath(file.path, value);
        await create_directory(fullPath);
        setInputDialog({ ...inputDialog, visible: false });
      }
    } else if (inputDialog.action === "rename") {
      if (value && value !== file.name && isValidFileName(value)) {
        await rename_file(file.path, value);
        setInputDialog({ ...inputDialog, visible: false });
      }
    }
  };
  const handleConfirmDialogConfirm = async () => {
    await delete_file(file.path);
    setConfirmDialog({ ...confirmDialog, visible: false });
  };
  const validateInput = (value) => {
    if (!value || value.trim().length === 0) {
      return t("contextMenu.nameEmpty");
    }
    if (!isValidFileName(value)) {
      return t("contextMenu.nameInvalid");
    }
    if (inputDialog.action === "rename" && value === file.name) {
      return t("contextMenu.nameSame");
    }
    return null;
  };
  return /* @__PURE__ */ jsxs12("div", { ref: nodeRef, children: [
    /* @__PURE__ */ jsxs12(
      "div",
      {
        className: clsx(
          "flex items-center px-2 py-1.5 cursor-pointer rounded transition-colors",
          "hover:bg-background-hover",
          isSelected && "bg-primary/20 border-l-2 border-primary",
          isCutSource && "opacity-50",
          isHighlighted && "animate-pulse bg-primary/30 ring-1 ring-primary/50 rounded"
        ),
        style: { paddingLeft: `${level * 16 + 8}px` },
        onClick: handleClick,
        onContextMenu: handleContextMenu,
        onKeyDown: handleKeyDown,
        onDragOver: handleNodeDragOver,
        onDrop: handleNodeDrop,
        role: "button",
        tabIndex: 0,
        "aria-label": file.is_dir ? t("ariaLabel.folder", { name: file.name }) : t("ariaLabel.file", { name: file.name }),
        children: [
          file.is_dir && /* @__PURE__ */ jsx14("span", { className: "mr-1 flex-shrink-0", children: isLoading ? /* @__PURE__ */ jsx14(LoaderCircle, { className: "w-3.5 h-3.5 text-text-muted animate-spin" }) : isExpanded ? /* @__PURE__ */ jsx14(ChevronDown, { className: "w-3.5 h-3.5 text-text-muted" }) : /* @__PURE__ */ jsx14(ChevronRight, { className: "w-3.5 h-3.5 text-text-muted" }) }),
          !file.is_dir && /* @__PURE__ */ jsx14("span", { className: "mr-1 w-3.5 flex-shrink-0" }),
          file.is_dir ? /* @__PURE__ */ jsx14(Folder, { className: clsx(
            "mr-2 w-4 h-4 flex-shrink-0",
            isExpanded ? "text-primary" : "text-text-muted"
          ) }) : /* @__PURE__ */ jsx14(
            FileIcon,
            {
              file,
              className: "mr-2 w-4 h-4 flex-shrink-0"
            }
          ),
          /* @__PURE__ */ jsx14(
            "span",
            {
              className: "text-sm text-text-primary truncate flex-1 min-w-0",
              title: file.name,
              children: file.name
            }
          ),
          !file.is_dir && file.size != null && /* @__PURE__ */ jsx14(
            "span",
            {
              className: "ml-2 text-xs text-text-muted flex-shrink-0 tabular-nums",
              title: file.modified ? `${t("row.modified")}: ${formatTimestamp2(file.modified)}` : void 0,
              children: formatFileSize(file.size)
            }
          ),
          file.is_dir && /* @__PURE__ */ jsx14(
            "span",
            {
              className: "ml-2 text-xs text-text-tertiary flex-shrink-0 tabular-nums",
              title: file.modified ? `${t("row.modified")}: ${formatTimestamp2(file.modified)}` : void 0,
              children: file.child_count != null ? `${file.child_count} ${t("row.items")}` : ""
            }
          )
        ]
      }
    ),
    file.is_dir && isExpanded && hasChildren && /* @__PURE__ */ jsx14("div", { className: "animate-panel-in", children: file.children?.map((child) => /* @__PURE__ */ jsx14(
      FileTreeNode,
      {
        file: child,
        level: level + 1,
        isExpanded: expandedFolders.has(normalizePath2(child.path)),
        isSelected: storeSelectedFile?.path === child.path,
        expandedFolders,
        loadingFolders
      },
      child.path
    )) }),
    file.is_dir && isExpanded && isLoading && /* @__PURE__ */ jsx14(
      "div",
      {
        style: { paddingLeft: `${(level + 1) * 16 + 8}px` },
        className: "text-xs text-text-tertiary py-1 animate-pulse",
        children: t("loading")
      }
    ),
    file.is_dir && isExpanded && !isLoading && isChildrenLoaded && !hasChildren && /* @__PURE__ */ jsx14(
      "div",
      {
        style: { paddingLeft: `${(level + 1) * 16 + 8}px` },
        className: "text-xs text-text-tertiary py-1 italic",
        children: t("empty.folder")
      }
    ),
    /* @__PURE__ */ jsx14(
      ContextMenu,
      {
        visible: contextMenu.visible,
        x: contextMenu.x,
        y: contextMenu.y,
        items: getMenuItems(),
        onClose: closeContextMenu
      }
    ),
    inputDialog.visible && /* @__PURE__ */ jsx14(
      InputDialog,
      {
        title: inputDialog.title,
        message: inputDialog.message,
        defaultValue: inputDialog.defaultValue,
        onConfirm: handleInputDialogConfirm,
        onCancel: () => setInputDialog({ ...inputDialog, visible: false }),
        validate: validateInput
      }
    ),
    confirmDialog.visible && /* @__PURE__ */ jsx14(
      ConfirmDialog,
      {
        message: confirmDialog.message,
        onConfirm: handleConfirmDialogConfirm,
        onCancel: () => setConfirmDialog({ ...confirmDialog, visible: false }),
        type: "danger"
      }
    ),
    detailsVisible && /* @__PURE__ */ jsx14(
      FileDetailsModal,
      {
        file,
        onClose: () => setDetailsVisible(false)
      }
    )
  ] });
});
FileTreeNode.displayName = "FileTreeNode";

// src/FileExplorer/SearchResultsList.tsx
import { memo as memo2, useState as useState5, useCallback as useCallback3, useMemo } from "react";

// node_modules/react-virtuoso/dist/index.mjs
import { jsx as A, jsxs as Kt } from "react/jsx-runtime";
import E, { createElement as jt } from "react";
import To from "react-dom";
var Ee = 0;
var Pt = 1;
var Qt = 2;
var _n = 4;
function In(t) {
  return () => t;
}
function Co(t) {
  t();
}
function ie(t, e) {
  return (n) => t(e(n));
}
function Sn(t, e) {
  return () => t(e);
}
function wo(t, e) {
  return (n) => t(e, n);
}
function je(t) {
  return t !== void 0;
}
function yo(...t) {
  return () => {
    t.map(Co);
  };
}
function te() {
}
function ke(t, e) {
  return e(t), t;
}
function bo(t, e) {
  return e(t);
}
function st(...t) {
  return t;
}
function X2(t, e) {
  return t(Pt, e);
}
function N(t, e) {
  t(Ee, e);
}
function Ke(t) {
  t(Qt);
}
function et(t) {
  return t(_n);
}
function z(t, e) {
  return X2(t, wo(e, Ee));
}
function kt(t, e) {
  const n = t(Pt, (o) => {
    n(), e(o);
  });
  return n;
}
function xn(t) {
  let e, n;
  return (o) => (r2) => {
    e = r2, n && clearTimeout(n), n = setTimeout(() => {
      o(e);
    }, t);
  };
}
function Nn(t, e) {
  return t === e;
}
function ot(t = Nn) {
  let e;
  return (n) => (o) => {
    t(e, o) || (e = o, n(o));
  };
}
function V(t) {
  return (e) => (n) => {
    t(n) && e(n);
  };
}
function k(t) {
  return (e) => ie(e, t);
}
function vt(t) {
  return (e) => () => {
    e(t);
  };
}
function v(t, ...e) {
  const n = Ro(...e);
  return (o, r2) => {
    switch (o) {
      case Qt:
        Ke(t);
        return;
      case Pt:
        return X2(t, n(r2));
    }
  };
}
function Et(t, e) {
  return (n) => (o) => {
    n(e = t(e, o));
  };
}
function qt(t) {
  return (e) => (n) => {
    t > 0 ? t-- : e(n);
  };
}
function Vt(t) {
  let e = null, n;
  return (o) => (r2) => {
    e = r2, !n && (n = setTimeout(() => {
      n = void 0, o(e);
    }, t));
  };
}
function D(...t) {
  const e = Array.from({ length: t.length });
  let n = 0, o = null;
  const r2 = 2 ** t.length - 1;
  return t.forEach((s, i) => {
    const l = 2 ** i;
    X2(s, (u) => {
      const f = n;
      n |= l, e[i] = u, f !== r2 && n === r2 && o && (o(), o = null);
    });
  }), (s) => (i) => {
    const l = () => {
      s([i].concat(e));
    };
    n === r2 ? l() : o = l;
  };
}
function Ro(...t) {
  return (e) => t.reduceRight(bo, e);
}
function Ho(t) {
  let e, n;
  const o = () => e?.();
  return function(r2, s) {
    switch (r2) {
      case Pt:
        return s ? n === s ? void 0 : (o(), n = s, e = X2(t, s), e) : (o(), te);
      case Qt:
        o(), n = null;
        return;
    }
  };
}
function y(t) {
  let e = t;
  const n = j();
  return (o, r2) => {
    switch (o) {
      case Ee:
        e = r2;
        break;
      case Pt: {
        r2(e);
        break;
      }
      case _n:
        return e;
    }
    return n(o, r2);
  };
}
function pt(t, e) {
  return ke(y(e), (n) => z(t, n));
}
function j() {
  const t = [];
  return (e, n) => {
    switch (e) {
      case Ee:
        t.slice().forEach((o) => {
          o(n);
        });
        return;
      case Qt:
        t.splice(0);
        return;
      case Pt:
        return t.push(n), () => {
          const o = t.indexOf(n);
          o > -1 && t.splice(o, 1);
        };
    }
  };
}
function Ct(t) {
  return ke(j(), (e) => z(t, e));
}
var Eo = { singleton: true };
function Y(t, e = [], n = Eo) {
  const { singleton: o } = n;
  return {
    constructor: t,
    dependencies: e,
    id: ko(),
    singleton: o
  };
}
var ko = () => /* @__PURE__ */ Symbol("id");
function Lo(t) {
  const e = /* @__PURE__ */ new Map(), n = ({ constructor: o, dependencies: r2, id: s, singleton: i }) => {
    if (i && e.has(s))
      return e.get(s);
    const l = o(r2.map((u) => n(u)));
    return i && e.set(s, l), l;
  };
  return n(t);
}
function dt(...t) {
  const e = j(), n = Array.from({ length: t.length });
  let o = 0;
  const r2 = 2 ** t.length - 1;
  return t.forEach((s, i) => {
    const l = 2 ** i;
    X2(s, (u) => {
      n[i] = u, o |= l, o === r2 && N(e, n);
    });
  }), function(s, i) {
    switch (s) {
      case Qt: {
        Ke(e);
        return;
      }
      case Pt:
        return o === r2 && i(n), X2(e, i);
    }
  };
}
function W(t, e = Nn) {
  return v(t, ot(e));
}
function be(...t) {
  return function(e, n) {
    switch (e) {
      case Qt:
        return;
      case Pt:
        return yo(...t.map((o) => X2(o, n)));
    }
  };
}
var gt = {
  /** Detailed debugging information including item measurements */
  DEBUG: 0,
  /** General informational messages */
  INFO: 1,
  /** Warning messages for potential issues */
  WARN: 2,
  /** Error messages for failures (default level) */
  ERROR: 3
};
var Oo = {
  [gt.DEBUG]: "debug",
  [gt.ERROR]: "error",
  [gt.INFO]: "log",
  [gt.WARN]: "warn"
};
var Bo = () => typeof globalThis > "u" ? window : globalThis;
var Gt = Y(
  () => {
    const t = y(gt.ERROR);
    return {
      log: y((n, o, r2 = gt.INFO) => {
        const s = Bo().VIRTUOSO_LOG_LEVEL ?? et(t);
        r2 >= s && console[Oo[r2]](
          "%creact-virtuoso: %c%s %o",
          "color: #0253b3; font-weight: bold",
          "color: initial",
          n,
          o
        );
      }),
      logLevel: t
    };
  },
  [],
  { singleton: true }
);
function zo(t) {
  return "self" in t ? t.document.documentElement : t;
}
function Dn(t) {
  const e = zo(t);
  return e.ownerDocument.defaultView.getComputedStyle(e).direction === "rtl";
}
function Dt(t, e) {
  return Dn(t) ? -e : e;
}
function vn(t, e) {
  return Dn(t) ? -e : e;
}
function Ft(t, e, n) {
  return qe(t, e, n).callbackRef;
}
function qe(t, e, n) {
  const o = E.useRef(null);
  let r2 = (i) => {
  };
  const s = E.useMemo(() => typeof ResizeObserver < "u" ? new ResizeObserver((i) => {
    const l = () => {
      const u = i[0].target;
      u.offsetParent !== null && t(u);
    };
    n ? l() : requestAnimationFrame(l);
  }) : null, [t, n]);
  return r2 = (i) => {
    i && e ? (s?.observe(i), o.current = i) : (o.current && s?.unobserve(o.current), o.current = null);
  }, { callbackRef: r2, ref: o };
}
function $n(t, e, n, o, r2, s, i, l, u) {
  const f = E.useCallback(
    (d) => {
      const g = Fo(d.children, e, l ? "offsetWidth" : "offsetHeight", r2);
      let h = d.parentElement;
      for (; h.dataset.virtuosoScroller === void 0; )
        h = h.parentElement;
      const m = h.lastElementChild?.dataset.viewportType === "window";
      let x;
      m && (x = h.ownerDocument.defaultView);
      const b = i ? l ? i.scrollWidth : i.scrollHeight : m ? l ? x.document.documentElement.scrollWidth : x.document.documentElement.scrollHeight : l ? h.scrollWidth : h.scrollHeight, I = i ? l ? i.offsetWidth : i.offsetHeight : m ? l ? x.innerWidth : x.innerHeight : l ? h.offsetWidth : h.offsetHeight, T = i ? l ? Dt(i, i.scrollLeft) : i.scrollTop : m ? l ? Dt(x, x.scrollX || x.document.documentElement.scrollLeft) : x.scrollY || x.document.documentElement.scrollTop : l ? Dt(h, h.scrollLeft) : h.scrollTop;
      o({
        scrollHeight: b,
        scrollTop: Math.max(T, 0),
        viewportHeight: I
      }), s?.(
        l ? Tn("column-gap", getComputedStyle(d).columnGap, r2) : Tn("row-gap", getComputedStyle(d).rowGap, r2)
      ), g !== null && t(g);
    },
    [t, e, r2, s, i, o, l]
  );
  return qe(f, n, u);
}
function Fo(t, e, n, o) {
  const r2 = t.length;
  if (r2 === 0)
    return null;
  const s = [];
  for (let i = 0; i < r2; i++) {
    const l = t.item(i);
    if (l.dataset.index === void 0)
      continue;
    const u = parseInt(l.dataset.index, 10), f = parseFloat(l.dataset.knownSize), d = e(l, n);
    if (d === 0 && o("Zero-sized element, this should not happen", { child: l }, gt.ERROR), d === f)
      continue;
    const g = s[s.length - 1];
    s.length === 0 || g.size !== d || g.endIndex !== u - 1 ? s.push({ endIndex: u, size: d, startIndex: u }) : s[s.length - 1].endIndex++;
  }
  return s;
}
function Tn(t, e, n) {
  return e !== "normal" && e?.endsWith("px") !== true && n(`${t} was not resolved to pixel value correctly`, e, gt.WARN), e === "normal" ? 0 : parseInt(e ?? "0", 10);
}
var Le = typeof document > "u" ? E.useEffect : E.useLayoutEffect;
function Ge(t) {
  return t?.currentCSSZoom ?? 1;
}
function Ht(t, e) {
  return e === 1 ? t : Math.round(t * e * 64) / 64;
}
function le(t, e, n = t.parentElement) {
  return Ht(t.getBoundingClientRect()[e], 1 / Ge(n));
}
function Lt(t, e, n = t.parentElement) {
  return Math.round(le(t, e, n));
}
function Ye(t, e, n) {
  const o = E.useRef(null), r2 = E.useCallback(
    (u) => {
      if (!u?.offsetParent)
        return;
      const f = u.getBoundingClientRect(), d = Ge(u);
      let g, h, m;
      if (e) {
        const x = e.getBoundingClientRect(), b = f.top - x.top;
        h = Ge(e), m = Ht(x.height - Math.max(0, b), 1 / d), g = Ht(b, 1 / h) + e.scrollTop;
      } else {
        const x = i.current.ownerDocument.defaultView;
        h = 1, m = Ht(x.innerHeight - Math.max(0, f.top), 1 / d), g = f.top + x.scrollY;
      }
      o.current = {
        listHeight: Ht(f.height, 1 / d),
        offsetTop: g,
        visibleHeight: m,
        visibleWidth: Ht(f.width, 1 / d),
        zoomRatio: h / d
      }, t(o.current);
    },
    // oxlint-disable-next-line exhaustive-deps
    [t, e]
  ), { callbackRef: s, ref: i } = qe(r2, true, n), l = E.useCallback(() => {
    r2(i.current);
  }, [r2, i]);
  return E.useEffect(() => {
    if (e) {
      e.addEventListener("scroll", l);
      const f = new ResizeObserver(() => {
        requestAnimationFrame(l);
      });
      return f.observe(e), () => {
        e.removeEventListener("scroll", l), f.unobserve(e);
      };
    }
    const u = i.current?.ownerDocument.defaultView;
    return u?.addEventListener("scroll", l), u?.addEventListener("resize", l), () => {
      u?.removeEventListener("scroll", l), u?.removeEventListener("resize", l);
    };
  }, [l, e, i]), s;
}
var It = Y(
  () => {
    const t = j(), e = j(), n = y(0), o = j(), r2 = j(), s = y(0), i = j(), l = j(), u = y(0), f = y(0), d = y(0), g = y(0), h = j(), m = j(), x = y(false), b = y(false), I = y(false);
    return z(
      v(
        t,
        k(({ scrollTop: T }) => T)
      ),
      e
    ), z(
      v(
        t,
        k(({ scrollHeight: T }) => T)
      ),
      l
    ), z(e, s), {
      deviation: n,
      deviationCommitted: o,
      fixedFooterHeight: d,
      fixedHeaderHeight: f,
      footerHeight: g,
      headerHeight: u,
      horizontalDirection: b,
      scrollBy: m,
      // input
      scrollContainerState: t,
      scrollHeight: l,
      scrollingInProgress: x,
      // signals
      scrollTo: h,
      scrollTop: e,
      skipAnimationFrameInResizeObserver: I,
      smoothScrollTargetReached: r2,
      // state
      statefulScrollTop: s,
      viewportHeight: i
    };
  },
  [],
  { singleton: true }
);
var ce = { lvl: 0 };
function Un(t, e) {
  const n = t.length;
  if (n === 0)
    return [];
  let { index: o, value: r2 } = e(t[0]);
  const s = [];
  for (let i = 1; i < n; i++) {
    const { index: l, value: u } = e(t[i]);
    s.push({ end: l - 1, start: o, value: r2 }), o = l, r2 = u;
  }
  return s.push({ end: 1 / 0, start: o, value: r2 }), s;
}
function J(t) {
  return t === ce;
}
function ue(t, e) {
  if (!J(t))
    return e === t.k ? t.v : e < t.k ? ue(t.l, e) : ue(t.r, e);
}
function Ot(t, e, n = "k") {
  if (J(t))
    return [-1 / 0, void 0];
  if (Number(t[n]) === e)
    return [t.k, t.v];
  if (Number(t[n]) < e) {
    const o = Ot(t.r, e, n);
    return o[0] === -1 / 0 ? [t.k, t.v] : o;
  }
  return Ot(t.l, e, n);
}
function xt(t, e, n) {
  return J(t) ? qn(e, n, 1) : e === t.k ? ht(t, { k: e, v: n }) : e < t.k ? Cn(ht(t, { l: xt(t.l, e, n) })) : Cn(ht(t, { r: xt(t.r, e, n) }));
}
function $t() {
  return ce;
}
function Xt(t, e, n) {
  if (J(t))
    return [];
  const o = Ot(t, e)[0];
  return Mo(_e(t, o, n));
}
function Ae(t, e) {
  if (J(t))
    return ce;
  const { k: n, l: o, r: r2 } = t;
  if (e === n) {
    if (J(o))
      return r2;
    if (J(r2))
      return o;
    const [s, i] = Kn(o);
    return we(ht(t, { k: s, l: jn(o), v: i }));
  }
  return e < n ? we(ht(t, { l: Ae(o, e) })) : we(ht(t, { r: Ae(r2, e) }));
}
function Ut(t) {
  return J(t) ? [] : [...Ut(t.l), { k: t.k, v: t.v }, ...Ut(t.r)];
}
function _e(t, e, n) {
  if (J(t))
    return [];
  const { k: o, l: r2, r: s, v: i } = t;
  let l = [];
  return o > e && (l = l.concat(_e(r2, e, n))), o >= e && o <= n && l.push({ k: o, v: i }), o <= n && (l = l.concat(_e(s, e, n))), l;
}
function we(t) {
  const { l: e, lvl: n, r: o } = t;
  if (o.lvl >= n - 1 && e.lvl >= n - 1)
    return t;
  if (n > o.lvl + 1) {
    if (Fe(e))
      return Yn(ht(t, { lvl: n - 1 }));
    if (!J(e) && !J(e.r))
      return ht(e.r, {
        l: ht(e, { r: e.r.l }),
        lvl: n,
        r: ht(t, {
          l: e.r.r,
          lvl: n - 1
        })
      });
    throw new Error("Unexpected empty nodes");
  }
  if (Fe(t))
    return Ne(ht(t, { lvl: n - 1 }));
  if (!J(o) && !J(o.l)) {
    const r2 = o.l, s = Fe(r2) ? o.lvl - 1 : o.lvl;
    return ht(r2, {
      l: ht(t, {
        lvl: n - 1,
        r: r2.l
      }),
      lvl: r2.lvl + 1,
      r: Ne(ht(o, { l: r2.r, lvl: s }))
    });
  }
  throw new Error("Unexpected empty nodes");
}
function ht(t, e) {
  return qn(
    e.k === void 0 ? t.k : e.k,
    e.v === void 0 ? t.v : e.v,
    e.lvl === void 0 ? t.lvl : e.lvl,
    e.l === void 0 ? t.l : e.l,
    e.r === void 0 ? t.r : e.r
  );
}
function jn(t) {
  return J(t.r) ? t.l : we(ht(t, { r: jn(t.r) }));
}
function Fe(t) {
  return J(t) || t.lvl > t.r.lvl;
}
function Kn(t) {
  return J(t.r) ? [t.k, t.v] : Kn(t.r);
}
function qn(t, e, n, o = ce, r2 = ce) {
  return { k: t, l: o, lvl: n, r: r2, v: e };
}
function Cn(t) {
  return Ne(Yn(t));
}
function Yn(t) {
  const { l: e } = t;
  return !J(e) && e.lvl === t.lvl ? ht(e, { r: ht(t, { l: e.r }) }) : t;
}
function Ne(t) {
  const { lvl: e, r: n } = t;
  return !J(n) && !J(n.r) && n.lvl === e && n.r.lvl === e ? ht(n, { l: ht(t, { r: n.l }), lvl: e + 1 }) : t;
}
function Mo(t) {
  return Un(t, ({ k: e, v: n }) => ({ index: e, value: n }));
}
function Zn(t, e) {
  return !!(t && t.startIndex === e.startIndex && t.endIndex === e.endIndex);
}
function Jt(t, e) {
  return !!(t && t[0] === e[0] && t[1] === e[1]);
}
var Ze = Y(
  () => ({ recalcInProgress: y(false) }),
  [],
  { singleton: true }
);
function Xn(t, e, n) {
  return t[Re(t, e, n)];
}
function Re(t, e, n, o = 0) {
  let r2 = t.length - 1;
  for (; o <= r2; ) {
    const s = Math.floor((o + r2) / 2), i = t[s], l = n(i, e);
    if (l === 0)
      return s;
    if (l === -1) {
      if (r2 - o < 2)
        return s - 1;
      r2 = s - 1;
    } else {
      if (r2 === o)
        return s;
      o = s + 1;
    }
  }
  throw new Error(`Failed binary finding record in array - ${t.join(",")}, searched for ${e}`);
}
function Vo(t, e, n, o) {
  const r2 = Re(t, e, o), s = Re(t, n, o, r2);
  return t.slice(r2, s + 1);
}
function Oe(t) {
  return !J(t.groupOffsetTree);
}
function Xe({ index: t }, e) {
  return e === t ? 0 : e < t ? -1 : 1;
}
function wn() {
  return {
    groupIndices: [],
    groupOffsetTree: $t(),
    lastIndex: 0,
    lastOffset: 0,
    lastSize: 0,
    offsetTree: [],
    sizeTree: $t()
  };
}
function Wo(t, e) {
  let n = J(t) ? 0 : 1 / 0;
  for (const o of e) {
    const { endIndex: r2, size: s, startIndex: i } = o;
    if (n = Math.min(n, i), J(t)) {
      t = xt(t, 0, s);
      continue;
    }
    const l = Xt(t, i - 1, r2 + 1);
    if (l.some($o(o)))
      continue;
    let u = false, f = false;
    for (const { end: d, start: g, value: h } of l)
      u ? (r2 >= g || s === h) && (t = Ae(t, g)) : (f = h !== s, u = true), d > r2 && r2 >= g && h !== s && (t = xt(t, r2 + 1, h));
    f && (t = xt(t, i, s));
  }
  return [t, n];
}
function Po(t) {
  return t.groupIndex !== void 0;
}
function Go({ offset: t }, e) {
  return e === t ? 0 : e < t ? -1 : 1;
}
function ae(t, e, n) {
  if (e.length === 0)
    return 0;
  const { index: o, offset: r2, size: s } = Xn(e, t, Xe);
  return r2 + (t - o) * (s + n);
}
function Jn(t, e) {
  if (!Oe(e))
    return t;
  let n = 0;
  for (; e.groupIndices[n] <= t + n; )
    n++;
  return t + n;
}
function Qn(t, e, n) {
  if (Po(t))
    return e.groupIndices[t.groupIndex] + 1;
  const o = t.index === "LAST" ? n : t.index;
  let r2 = Jn(o, e);
  return r2 = Math.max(0, Math.min(n, r2)), r2;
}
function Ao(t, e, n, o = 0) {
  return o > 0 && (e = Math.max(e, Xn(t, o, Xe).offset)), Un(Vo(t, e, n, Go), Do);
}
function _o(t, [e, n, o, r2]) {
  e.length > 0 && o("received item sizes", e, gt.DEBUG);
  const s = t.sizeTree;
  let i = s, l = 0;
  if (n.length > 0 && J(s) && e.length === 2) {
    const h = e[0].size, m = e[1].size;
    i = n.reduce((x, b) => xt(xt(x, b, h), b + 1, m), i);
  } else
    [i, l] = Wo(i, e);
  if (i === s)
    return t;
  const { lastIndex: u, lastOffset: f, lastSize: d, offsetTree: g } = De(t.offsetTree, l, i, r2);
  return {
    groupIndices: n,
    groupOffsetTree: n.reduce((h, m) => xt(h, m, ae(m, g, r2)), $t()),
    lastIndex: u,
    lastOffset: f,
    lastSize: d,
    offsetTree: g,
    sizeTree: i
  };
}
function No(t) {
  return Ut(t).map(({ k: e, v: n }, o, r2) => {
    const s = r2[o + 1];
    return { endIndex: s === void 0 ? 1 / 0 : s.k - 1, size: n, startIndex: e };
  });
}
function yn(t, e) {
  let n = 0, o = 0;
  for (; n < t; )
    n += e[o + 1] - e[o] - 1, o++;
  return o - (n === t ? 0 : 1);
}
function De(t, e, n, o) {
  let r2 = t, s = 0, i = 0, l = 0, u = 0;
  if (e === 0)
    r2 = [];
  else {
    u = Re(r2, e - 1, Xe), l = r2[u].offset;
    const d = Ot(n, e - 1);
    s = d[0], i = d[1], r2.length && r2[u].size === Ot(n, e)[1] && (u -= 1), r2 = r2.slice(0, u + 1);
  }
  for (const { start: f, value: d } of Xt(n, e, 1 / 0)) {
    const g = f - s, h = g * i + l + g * o;
    r2.push({
      index: f,
      offset: h,
      size: d
    }), s = f, l = h, i = d;
  }
  return {
    lastIndex: s,
    lastOffset: l,
    lastSize: i,
    offsetTree: r2
  };
}
function Do(t) {
  return { index: t.index, value: t };
}
function $o(t) {
  const { endIndex: e, size: n, startIndex: o } = t;
  return (r2) => r2.start === o && (r2.end === e || r2.end === 1 / 0) && r2.value === n;
}
var Uo = {
  offsetHeight: "height",
  offsetWidth: "width"
};
var Mt = Y(
  ([{ log: t }, { recalcInProgress: e }]) => {
    const n = j(), o = j(), r2 = pt(o, 0), s = j(), i = j(), l = y(0), u = y([]), f = y(void 0), d = y(void 0), g = y(void 0), h = y(void 0), m = y((a, p) => Lt(a, Uo[p])), x = y(void 0), b = y(0), I = wn(), T = j(), c = pt(
      v(
        be(n, T),
        D(u, t, b),
        Et((a, [p, ...R]) => {
          if (p === null) {
            const [O] = R;
            return {
              ...wn(),
              groupIndices: O,
              groupOffsetTree: O.reduce((B, F, G) => xt(B, F, G), $t())
            };
          }
          return _o(a, [p, ...R]);
        }, I),
        ot()
      ),
      I
    ), C = pt(
      v(
        u,
        ot(),
        Et((a, p) => ({ current: p, prev: a.current }), {
          current: [],
          prev: []
        }),
        k(({ prev: a }) => a)
      ),
      []
    );
    z(
      v(
        u,
        V((a) => a.length > 0),
        D(c, b),
        k(([a, p, R]) => {
          const O = a.reduce((B, F, G) => xt(B, F, ae(F, p.offsetTree, R) || G), $t());
          return {
            ...p,
            groupIndices: a,
            groupOffsetTree: O
          };
        })
      ),
      c
    ), z(
      v(
        o,
        D(c),
        V(([a, { lastIndex: p }]) => a < p),
        k(([a, { lastIndex: p, lastSize: R }]) => [
          {
            endIndex: p,
            size: R,
            startIndex: a
          }
        ])
      ),
      n
    ), z(f, d);
    const S = pt(
      v(
        f,
        k((a) => a === void 0)
      ),
      true
    );
    z(
      v(
        d,
        V((a) => a !== void 0 && J(et(c).sizeTree)),
        k((a) => {
          const p = et(g), R = et(u).length > 0;
          return p !== void 0 && p !== 0 ? R ? [
            { endIndex: 0, size: p, startIndex: 0 },
            { endIndex: 1, size: a, startIndex: 1 }
          ] : [] : [{ endIndex: 0, size: a, startIndex: 0 }];
        })
      ),
      n
    ), z(
      v(
        h,
        V((a) => a !== void 0 && a.length > 0 && J(et(c).sizeTree)),
        k((a) => {
          const p = [];
          let R = a[0], O = 0;
          for (let B = 1; B < a.length; B++) {
            const F = a[B];
            F !== R && (p.push({
              endIndex: B - 1,
              size: R,
              startIndex: O
            }), R = F, O = B);
          }
          return p.push({
            endIndex: a.length - 1,
            size: R,
            startIndex: O
          }), p;
        })
      ),
      n
    ), z(
      v(
        u,
        D(g, d),
        V(([, a, p]) => a !== void 0 && p !== void 0),
        k(([a, p, R]) => {
          const O = [];
          for (let B = 0; B < a.length; B++) {
            const F = a[B], G = a[B + 1];
            O.push({
              startIndex: F,
              endIndex: F,
              size: p
            }), G !== void 0 && O.push({
              startIndex: F + 1,
              endIndex: G - 1,
              size: R
            });
          }
          return O;
        })
      ),
      n
    );
    const w = Ct(
      v(
        n,
        D(c),
        Et(
          ({ sizes: a }, [p, R]) => ({
            changed: R !== a,
            sizes: R
          }),
          { changed: false, sizes: I }
        ),
        k((a) => a.changed)
      )
    );
    X2(
      v(
        l,
        Et(
          (a, p) => ({ diff: a.prev - p, prev: p }),
          { diff: 0, prev: 0 }
        ),
        k((a) => a.diff)
      ),
      (a) => {
        const { groupIndices: p } = et(c);
        if (a > 0)
          N(e, true), N(s, a + yn(a, p));
        else if (a < 0) {
          const R = et(C);
          R.length > 0 && (a -= yn(-a, R)), N(i, a);
        }
      }
    ), X2(v(l, D(t)), ([a, p]) => {
      a < 0 && p(
        "`firstItemIndex` prop should not be set to less than zero. If you don't know the total count, just use a very high value",
        { firstItemIndex: l },
        gt.ERROR
      );
    });
    const L = Ct(s);
    z(
      v(
        s,
        D(c),
        k(([a, p]) => {
          const R = p.groupIndices.length > 0, O = [], B = p.lastSize;
          if (R) {
            const F = ue(p.sizeTree, 0);
            let G = 0, q = 0;
            for (; G < a; ) {
              const Z = p.groupIndices[q], it = p.groupIndices.length === q + 1 ? 1 / 0 : p.groupIndices[q + 1] - Z - 1;
              O.push({
                endIndex: Z,
                size: F,
                startIndex: Z
              }), O.push({
                endIndex: Z + 1 + it - 1,
                size: B,
                startIndex: Z + 1
              }), q++, G += it + 1;
            }
            const M = Ut(p.sizeTree);
            return G !== a && M.shift(), M.reduce(
              (Z, { k: it, v: ct }) => {
                let mt = Z.ranges;
                return Z.prevSize !== 0 && (mt = [
                  ...Z.ranges,
                  {
                    endIndex: it + a - 1,
                    size: Z.prevSize,
                    startIndex: Z.prevIndex
                  }
                ]), {
                  prevIndex: it + a,
                  prevSize: ct,
                  ranges: mt
                };
              },
              {
                prevIndex: a,
                prevSize: 0,
                ranges: O
              }
            ).ranges;
          }
          return Ut(p.sizeTree).reduce(
            (F, { k: G, v: q }) => ({
              prevIndex: G + a,
              prevSize: q,
              ranges: [...F.ranges, { endIndex: G + a - 1, size: F.prevSize, startIndex: F.prevIndex }]
            }),
            {
              prevIndex: 0,
              prevSize: B,
              ranges: []
            }
          ).ranges;
        })
      ),
      n
    );
    const P = Ct(
      v(
        i,
        D(c, b),
        k(([a, { offsetTree: p }, R]) => {
          const O = -a;
          return ae(O, p, R);
        })
      )
    );
    return z(
      v(
        i,
        D(c, b),
        k(([a, p, R]) => {
          if (p.groupIndices.length > 0) {
            if (J(p.sizeTree))
              return p;
            let F = $t();
            const G = et(C);
            let q = 0, M = 0, ft = 0;
            for (; q < -a; ) {
              ft = G[M];
              const it = G[M + 1] - ft - 1;
              M++, q += it + 1;
            }
            if (F = Ut(p.sizeTree).reduce((it, { k: ct, v: mt }) => xt(it, Math.max(0, ct + a), mt), F), q !== -a) {
              const it = ue(p.sizeTree, ft);
              F = xt(F, 0, it);
              const ct = Ot(p.sizeTree, -a + 1)[1];
              F = xt(F, 1, ct);
            }
            return {
              ...p,
              sizeTree: F,
              ...De(p.offsetTree, 0, F, R)
            };
          }
          const B = Ut(p.sizeTree).reduce((F, { k: G, v: q }) => xt(F, Math.max(0, G + a), q), $t());
          return {
            ...p,
            sizeTree: B,
            ...De(p.offsetTree, 0, B, R)
          };
        })
      ),
      c
    ), {
      beforeUnshiftWith: L,
      // input
      data: x,
      defaultItemSize: d,
      firstItemIndex: l,
      fixedItemSize: f,
      fixedGroupSize: g,
      gap: b,
      groupIndices: u,
      heightEstimates: h,
      itemSize: m,
      listRefresh: w,
      resetSizes: T,
      shiftWith: i,
      shiftWithOffset: P,
      sizeRanges: n,
      // output
      sizes: c,
      statefulTotalCount: r2,
      totalCount: o,
      trackItemSizes: S,
      unshiftWith: s
    };
  },
  st(Gt, Ze),
  { singleton: true }
);
function jo(t) {
  return t.reduce(
    (e, n) => (e.groupIndices.push(e.totalCount), e.totalCount += n + 1, e),
    {
      groupIndices: [],
      totalCount: 0
    }
  );
}
var to = Y(
  ([{ groupIndices: t, resetSizes: e, sizeRanges: n, sizes: o, statefulTotalCount: r2, totalCount: s, trackItemSizes: i }, { headerHeight: l, scrollTop: u }]) => {
    const f = j(), d = j(), g = Ct(v(f, k(jo))), h = pt(
      v(
        n,
        D(r2, t),
        V(([, m, x]) => m > x.length),
        vt(true)
      ),
      false
    );
    return z(
      v(
        g,
        Et(([, m], x) => [m, x], [
          { groupIndices: [], totalCount: 0 },
          { groupIndices: [], totalCount: 0 }
        ]),
        D(o, i, h),
        V(([[m, x], { sizeTree: b }, I, T]) => {
          const c = m.groupIndices.length > 0 && m.totalCount === m.groupIndices.length, C = x.totalCount > x.groupIndices.length;
          return I && !T && c && C && !J(b);
        }),
        vt(null)
      ),
      e
    ), z(
      v(
        g,
        k((m) => m.totalCount)
      ),
      s
    ), z(
      v(
        g,
        k((m) => m.groupIndices)
      ),
      t
    ), z(
      v(
        dt(u, o, l),
        V(([m, x]) => Oe(x)),
        k(([m, x, b]) => Ot(x.groupOffsetTree, Math.max(m - b, 0), "v")[0]),
        ot(),
        k((m) => [m])
      ),
      d
    ), { groupCounts: f, topItemsIndexes: d };
  },
  st(Mt, It)
);
var At = Y(
  ([{ log: t }]) => {
    const e = y(false), n = Ct(
      v(
        e,
        V((o) => o),
        ot()
      )
    );
    return X2(e, (o) => {
      o && et(t)("props updated", {}, gt.DEBUG);
    }), { didMount: n, propsReady: e };
  },
  st(Gt),
  { singleton: true }
);
var Ko = typeof document < "u" && "scrollBehavior" in document.documentElement.style;
function eo(t) {
  const e = typeof t == "number" ? { index: t } : { ...t };
  return e.align || (e.align = "start"), (!e.behavior || !Ko) && (e.behavior = "auto"), e.offset === void 0 && (e.offset = 0), e;
}
var he = Y(
  ([
    { gap: t, listRefresh: e, sizes: n, totalCount: o },
    {
      fixedFooterHeight: r2,
      fixedHeaderHeight: s,
      footerHeight: i,
      headerHeight: l,
      scrollingInProgress: u,
      scrollTo: f,
      smoothScrollTargetReached: d,
      viewportHeight: g
    },
    { log: h }
  ]) => {
    const m = j(), x = j(), b = y(0);
    let I = null, T = null, c = null;
    function C() {
      I !== null && (I(), I = null), c !== null && (c(), c = null), T && (clearTimeout(T), T = null), N(u, false);
    }
    return z(
      v(
        m,
        D(n, g, o, b, l, i, h),
        D(t, s, r2),
        k(
          ([
            [S, w, L, P, a, p, R, O],
            B,
            F,
            G
          ]) => {
            const q = eo(S), { align: M, behavior: ft, offset: Z } = q, it = P - 1, ct = Qn(q, w, it);
            let mt = ae(ct, w.offsetTree, B) + p;
            M === "end" ? (mt += F + Ot(w.sizeTree, ct)[1] - L + G, ct === it && (mt += R)) : M === "center" ? mt += (F + Ot(w.sizeTree, ct)[1] - L + G) / 2 : mt -= a, Z !== void 0 && Z !== 0 && (mt += Z);
            const Bt = (Rt) => {
              C(), Rt ? (O("retrying to scroll to", { location: S }, gt.DEBUG), N(m, S)) : (N(x, true), O("list did not change, scroll successful", {}, gt.DEBUG));
            };
            if (C(), ft === "smooth") {
              let Rt = false;
              c = X2(e, (wt) => {
                Rt = Rt || wt;
              }), I = kt(d, () => {
                Bt(Rt);
              });
            } else
              I = kt(v(e, qo(150)), Bt);
            return T = setTimeout(() => {
              C();
            }, 1200), N(u, true), O("scrolling from index to", { behavior: ft, index: ct, top: mt }, gt.DEBUG), { behavior: ft, top: mt };
          }
        )
      ),
      f
    ), {
      scrollTargetReached: x,
      scrollToIndex: m,
      topListHeight: b
    };
  },
  st(Mt, It, Gt),
  { singleton: true }
);
function qo(t) {
  return (e) => {
    const n = setTimeout(() => {
      e(false);
    }, t);
    return (o) => {
      o && (e(true), clearTimeout(n));
    };
  };
}
function Je(t, e) {
  t === 0 ? e() : requestAnimationFrame(() => {
    Je(t - 1, e);
  });
}
function Qe(t, e) {
  if (t === void 0)
    return 0;
  const n = e - 1, o = typeof t == "number" ? t : t.index === "LAST" ? n : t.index;
  return Math.max(0, Math.min(o, n));
}
function $e(t) {
  return t === void 0 ? true : typeof t == "number" ? t === 0 : t.index === 0 && (t.align === void 0 || t.align === "start") && (t.offset === void 0 || t.offset === 0);
}
var pe = Y(
  ([{ defaultItemSize: t, listRefresh: e, sizes: n }, { scrollTop: o }, { scrollTargetReached: r2, scrollToIndex: s }, { didMount: i }]) => {
    const l = y(true), u = y(0), f = y(true);
    return z(
      v(
        i,
        D(u),
        V(([d, g]) => !$e(g)),
        vt(false)
      ),
      l
    ), z(
      v(
        i,
        D(u),
        V(([d, g]) => !$e(g)),
        vt(false)
      ),
      f
    ), X2(
      v(
        dt(e, i),
        D(l, n, t, f),
        V(([[, d], g, { sizeTree: h }, m, x]) => d && (!J(h) || je(m)) && !g && !x),
        D(u)
      ),
      ([, d]) => {
        if (d === void 0) {
          N(l, true), N(f, true);
          return;
        }
        kt(r2, () => {
          N(f, true);
        }), Je(4, () => {
          kt(o, () => {
            N(l, true);
          }), N(s, d);
        });
      }
    ), {
      initialItemFinalLocationReached: f,
      initialTopMostItemIndex: u,
      scrolledToInitialItem: l
    };
  },
  st(Mt, It, he, At),
  { singleton: true }
);
function no(t, e) {
  return Math.abs(t - e) < 1.01;
}
var de = "up";
var re = "down";
var Yo = "none";
var Zo = {
  atBottom: false,
  notAtBottomBecause: "NOT_SHOWING_LAST_ITEM",
  state: {
    offsetBottom: 0,
    scrollHeight: 0,
    scrollTop: 0,
    viewportHeight: 0
  }
};
var Xo = 0;
var ge = Y(([{ footerHeight: t, headerHeight: e, scrollBy: n, scrollContainerState: o, scrollTop: r2, viewportHeight: s }]) => {
  const i = y(false), l = y(true), u = j(), f = j(), d = y(4), g = y(Xo), h = pt(
    v(
      be(v(W(r2), qt(1), vt(true)), v(W(r2), qt(1), vt(false), xn(100))),
      ot()
    ),
    false
  ), m = pt(
    v(be(v(n, vt(true)), v(n, vt(false), xn(200))), ot()),
    false
  );
  z(
    v(
      dt(W(r2), W(g)),
      k(([c, C]) => c <= C),
      ot()
    ),
    l
  ), z(v(l, Vt(50)), f);
  const x = Ct(
    v(
      dt(o, W(s), W(e), W(t), W(d)),
      Et((c, [{ scrollHeight: C, scrollTop: S }, w, L, P, a]) => {
        const p = S + w - C > -a, R = {
          scrollHeight: C,
          scrollTop: S,
          viewportHeight: w
        };
        if (p) {
          let B, F;
          return S > c.state.scrollTop ? (B = "SCROLLED_DOWN", F = c.state.scrollTop - S) : (B = "SIZE_DECREASED", F = c.state.scrollTop - S || c.scrollTopDelta), {
            atBottom: true,
            atBottomBecause: B,
            scrollTopDelta: F,
            state: R
          };
        }
        let O;
        return R.scrollHeight > c.state.scrollHeight ? O = "SIZE_INCREASED" : w < c.state.viewportHeight ? O = "VIEWPORT_HEIGHT_DECREASING" : S < c.state.scrollTop ? O = "SCROLLING_UPWARDS" : O = "NOT_FULLY_SCROLLED_TO_LAST_ITEM_BOTTOM", {
          atBottom: false,
          notAtBottomBecause: O,
          state: R
        };
      }, Zo),
      ot((c, C) => c !== void 0 && c.atBottom === C.atBottom)
    )
  ), b = pt(
    v(
      o,
      Et(
        (c, { scrollHeight: C, scrollTop: S, viewportHeight: w }) => {
          if (!no(c.scrollHeight, C)) {
            const L = C - (S + w) < 1;
            return c.scrollTop !== S && L ? {
              changed: true,
              jump: c.scrollTop - S,
              scrollHeight: C,
              scrollTop: S
            } : {
              changed: true,
              jump: 0,
              scrollHeight: C,
              scrollTop: S
            };
          }
          return {
            changed: false,
            jump: 0,
            scrollHeight: C,
            scrollTop: S
          };
        },
        { changed: false, jump: 0, scrollHeight: 0, scrollTop: 0 }
      ),
      V((c) => c.changed),
      k(({ jump: c }) => ({ jump: c }))
    ),
    { jump: 0 }
  );
  z(
    v(
      x,
      k((c) => c.atBottom)
    ),
    i
  ), z(v(i, Vt(50)), u);
  const I = y(re);
  z(
    v(
      o,
      k(({ scrollTop: c }) => c),
      ot(),
      Et(
        (c, C) => et(m) ? { direction: c.direction, prevScrollTop: C } : { direction: C < c.prevScrollTop ? de : re, prevScrollTop: C },
        { direction: re, prevScrollTop: 0 }
      ),
      k((c) => c.direction)
    ),
    I
  ), z(v(o, Vt(50), vt(Yo)), I);
  const T = y(0);
  return z(
    v(
      h,
      V((c) => !c),
      vt(0)
    ),
    T
  ), z(
    v(
      r2,
      Vt(100),
      D(h),
      V(([c, C]) => C),
      Et(([c, C], [S]) => [C, S], [0, 0]),
      k(([c, C]) => C - c)
    ),
    T
  ), {
    atBottomState: x,
    atBottomStateChange: u,
    atBottomThreshold: d,
    atTopStateChange: f,
    atTopThreshold: g,
    isAtBottom: i,
    isAtTop: l,
    isScrolling: h,
    lastJumpDueToItemResize: b,
    scrollDirection: I,
    scrollVelocity: T
  };
}, st(It));
var fe = "top";
var me = "bottom";
var bn = "none";
function Rn(t, e, n) {
  return typeof t == "number" ? n === de && e === fe || n === re && e === me ? t : 0 : n === de ? e === fe ? t.main : t.reverse : e === me ? t.main : t.reverse;
}
function Hn(t, e) {
  return typeof t == "number" ? t : t[e] ?? 0;
}
var tn = Y(
  ([{ deviation: t, fixedHeaderHeight: e, headerHeight: n, scrollTop: o, viewportHeight: r2 }]) => {
    const s = j(), i = y(0), l = y(0), u = y(0), f = pt(
      v(
        dt(
          W(o),
          W(r2),
          W(n),
          W(s, Jt),
          W(u),
          W(i),
          W(e),
          W(t),
          W(l)
        ),
        k(
          ([
            d,
            g,
            h,
            [m, x],
            b,
            I,
            T,
            c,
            C
          ]) => {
            const S = d - c, w = I + T, L = Math.max(h - S, 0);
            let P = bn;
            const a = Hn(C, fe), p = Hn(C, me);
            return m -= c, m += h + T, x += h + T, x -= c, m > d + w - a && (P = de), x < d - L + g + p && (P = re), P !== bn ? [
              Math.max(S - h - Rn(b, fe, P) - a, 0),
              S - L - T + g + Rn(b, me, P) + p
            ] : null;
          }
        ),
        V((d) => d !== null),
        ot(Jt)
      ),
      [0, 0]
    );
    return {
      increaseViewportBy: l,
      // input
      listBoundary: s,
      overscan: u,
      topListHeight: i,
      // output
      visibleRange: f
    };
  },
  st(It),
  { singleton: true }
);
function Jo(t, e, n, o) {
  if (Oe(e)) {
    const r2 = o - e.groupIndices.length;
    if (r2 <= 0)
      return [{ index: e.groupIndices[0], offset: 0, size: 0 }];
    const s = Jn(Math.min(t, r2 - 1), e);
    return [
      { index: Ot(e.groupOffsetTree, s)[0], offset: 0, size: 0 },
      { data: n?.[0], index: s, offset: 0, size: 0 }
    ];
  }
  return [{ data: n?.[0], index: t, offset: 0, size: 0 }];
}
var Me = {
  bottom: 0,
  firstItemIndex: 0,
  items: [],
  offsetBottom: 0,
  offsetTop: 0,
  top: 0,
  topItems: [],
  topListHeight: 0,
  totalCount: 0
};
function ye(t, e, n, o, r2, s) {
  const { lastIndex: i, lastOffset: l, lastSize: u } = r2;
  let f = 0, d = 0;
  if (t.length > 0) {
    f = t[0].offset;
    const b = t[t.length - 1];
    d = b.offset + b.size;
  }
  const g = n - i, h = l + g * u + (g - 1) * o, m = f, x = h - d;
  return {
    bottom: d,
    firstItemIndex: s,
    items: En(t, r2, s),
    offsetBottom: x,
    offsetTop: f,
    top: m,
    topItems: En(e, r2, s),
    topListHeight: e.reduce((b, I) => I.size + b, 0),
    totalCount: n
  };
}
function oo(t, e, n, o, r2, s) {
  let i = 0;
  if (n.groupIndices.length > 0)
    for (const m of n.groupIndices) {
      if (m - i >= t)
        break;
      i++;
    }
  const l = t + i, u = s !== void 0, f = s?.length ?? 0, d = Qe(e, u ? f : l), g = u ? Math.max(0, Math.min(l, f - d)) : l, h = Array.from({ length: g }).map((m, x) => ({
    data: s?.[x + d],
    index: x + d,
    offset: 0,
    size: 0
  }));
  return ye(h, [], g, r2, n, o);
}
function En(t, e, n) {
  if (t.length === 0)
    return [];
  if (!Oe(e))
    return t.map((f) => ({ ...f, index: f.index + n, originalIndex: f.index }));
  const o = t[0].index, r2 = t[t.length - 1].index, s = [], i = Xt(e.groupOffsetTree, o, r2);
  let l, u = 0;
  for (const f of t) {
    (!l || l.end < f.index) && (l = i.shift(), u = e.groupIndices.indexOf(l.start));
    let d;
    f.index === l.start ? d = {
      index: u,
      type: "group"
    } : d = {
      groupIndex: u,
      index: f.index - (u + 1) + n
    }, s.push({
      ...d,
      data: f.data,
      offset: f.offset,
      originalIndex: f.index,
      size: f.size
    });
  }
  return s;
}
function kn(t, e) {
  return t === void 0 ? 0 : typeof t == "number" ? t : t[e] ?? 0;
}
var Yt = Y(
  ([
    { data: t, firstItemIndex: e, gap: n, sizes: o, totalCount: r2 },
    s,
    { listBoundary: i, topListHeight: l, visibleRange: u },
    { initialTopMostItemIndex: f, scrolledToInitialItem: d },
    { topListHeight: g },
    h,
    { didMount: m },
    { recalcInProgress: x }
  ]) => {
    const b = y([]), I = y(0), T = pt(
      v(
        o,
        V(({ sizeTree: a }) => !J(a)),
        vt(true)
      ),
      false
    ), c = j(), C = y(0);
    z(s.topItemsIndexes, b);
    const S = pt(
      v(
        dt(
          m,
          x,
          W(u, Jt),
          W(r2),
          W(o),
          W(f),
          d,
          W(b),
          W(e),
          W(n),
          W(C),
          t,
          W(I)
        ),
        V(([a, p, , R, , , , , , , , O]) => {
          const B = O !== void 0 && O.length !== R;
          return a && !p && !B;
        }),
        k(
          ([
            ,
            ,
            [a, p],
            R,
            O,
            B,
            F,
            G,
            q,
            M,
            ft,
            Z,
            it
          ]) => {
            const ct = O, { offsetTree: mt, sizeTree: Bt } = ct;
            if (R === 0)
              return { ...Me, totalCount: R };
            if (a === 0 && p === 0)
              return it === 0 ? { ...Me, totalCount: R } : oo(it, B, O, q, M, Z);
            if (J(Bt))
              return it > 0 && !et(T) ? null : ye(
                Jo(Qe(B, R), ct, Z, R),
                [],
                R,
                M,
                ct,
                q
              );
            const Rt = [];
            if (G.length > 0) {
              const $ = G[0], K = G[G.length - 1];
              let lt = 0;
              for (const tt of Xt(Bt, $, K)) {
                const Q = tt.value, ut = Math.max(tt.start, $), St = Math.min(tt.end, K);
                for (let at = ut; at <= St; at++)
                  Rt.push({ data: Z?.[at], index: at, offset: lt, size: Q }), lt += Q;
              }
            }
            if (!F)
              return ye([], Rt, R, M, ct, q);
            const wt = G.length > 0 ? G[G.length - 1] + 1 : 0, Se = Ao(mt, a, p, wt);
            if (Se.length === 0)
              return null;
            const ee = R - 1, zt = ke([], ($) => {
              for (const K of Se) {
                const lt = K.value;
                let tt = lt.offset, Q = K.start;
                const ut = lt.size;
                if (lt.offset < a) {
                  Q += Math.floor((a - lt.offset + M) / (ut + M));
                  const at = Q - K.start;
                  tt += at * ut + at * M;
                }
                Q < wt && (tt += (wt - Q) * ut, Q = wt);
                const St = Math.min(K.end, ee);
                for (let at = Q; at <= St && !(tt >= p); at++)
                  $.push({ data: Z?.[at], index: at, offset: tt, size: ut }), tt += ut + M;
              }
            }), ne = kn(ft, fe), H = kn(ft, me);
            if (zt.length > 0 && (ne > 0 || H > 0)) {
              const $ = zt[0], K = zt[zt.length - 1];
              if (ne > 0 && $.index > wt) {
                const lt = Math.min(ne, $.index - wt), tt = [];
                let Q = $.offset;
                for (let ut = $.index - 1; ut >= $.index - lt; ut--) {
                  const at = Xt(Bt, ut, ut)[0]?.value ?? $.size;
                  Q -= at + M, tt.unshift({ data: Z?.[ut], index: ut, offset: Q, size: at });
                }
                zt.unshift(...tt);
              }
              if (H > 0 && K.index < ee) {
                const lt = Math.min(H, ee - K.index);
                let tt = K.offset + K.size + M;
                for (let Q = K.index + 1; Q <= K.index + lt; Q++) {
                  const St = Xt(Bt, Q, Q)[0]?.value ?? K.size;
                  zt.push({ data: Z?.[Q], index: Q, offset: tt, size: St }), tt += St + M;
                }
              }
            }
            return ye(zt, Rt, R, M, ct, q);
          }
        ),
        //@ts-expect-error filter needs to be fixed
        V((a) => a !== null),
        ot()
      ),
      Me
    );
    z(
      v(
        t,
        V(je),
        k((a) => a?.length)
      ),
      r2
    ), z(
      v(
        S,
        k((a) => a.topListHeight)
      ),
      g
    ), z(g, l), z(
      v(
        S,
        k((a) => [a.top, a.bottom])
      ),
      i
    ), z(
      v(
        S,
        k((a) => a.items)
      ),
      c
    );
    const w = Ct(
      v(
        S,
        V(({ items: a }) => a.length > 0),
        D(r2, t),
        V(([{ items: a }, p]) => a[a.length - 1].originalIndex === p - 1),
        k(([{ items: a }, p, R]) => {
          const O = a[a.length - 1], B = O.type === "group" ? O.index + 1 : (O.groupIndex ?? -1) + 1;
          return [p - 1 - B, R];
        }),
        ot(Jt),
        // when every group is empty, only headers render and there is no item index to report.
        // Filter after the distinct check, so that the same index fires again once an item returns.
        V(([a]) => a >= 0),
        k(([a]) => a)
      )
    ), L = Ct(
      v(
        S,
        Vt(200),
        V(({ items: a, topItems: p }) => a.length > 0 && a[0].originalIndex === p.length),
        k(({ items: a }) => a[0].index),
        ot()
      )
    ), P = Ct(
      v(
        S,
        V(({ items: a }) => a.length > 0),
        // oxlint-disable-next-line array-callback-return -- callback always returns after trimming group sentinels
        k(({ items: a }) => {
          let p = 0, R = a.length - 1;
          for (; a[p].type === "group" && p < R; )
            p++;
          for (; a[R].type === "group" && R > p; )
            R--;
          return {
            endIndex: a[R].index,
            startIndex: a[p].index
          };
        }),
        ot(Zn)
      )
    );
    return {
      endReached: w,
      initialItemCount: I,
      itemsRendered: c,
      listState: S,
      minOverscanItemCount: C,
      rangeChanged: P,
      startReached: L,
      topItemsIndexes: b,
      ...h
    };
  },
  st(
    Mt,
    to,
    tn,
    pe,
    he,
    ge,
    At,
    Ze
  ),
  { singleton: true }
);
var ro = Y(
  ([{ fixedFooterHeight: t, fixedHeaderHeight: e, footerHeight: n, headerHeight: o }, { listState: r2 }]) => {
    const s = j(), i = pt(
      v(
        dt(n, t, o, e, r2),
        k(([l, u, f, d, g]) => l + u + f + d + g.offsetBottom + g.bottom)
      ),
      0
    );
    return z(W(i), s), { totalListHeight: i, totalListHeightChanged: s };
  },
  st(It, Yt),
  { singleton: true }
);
var Qo = Y(
  ([{ viewportHeight: t }, { totalListHeight: e }]) => {
    const n = y(false), o = pt(
      v(
        dt(n, t, e),
        V(([r2]) => r2),
        k(([, r2, s]) => Math.max(0, r2 - s)),
        Vt(0),
        ot()
      ),
      0
    );
    return { alignToBottom: n, paddingTopAddition: o };
  },
  st(It, ro),
  { singleton: true }
);
var so = Y(() => ({
  context: y(null)
}));
var tr = ({
  itemBottom: t,
  itemTop: e,
  locationParams: { align: n, behavior: o, ...r2 },
  viewportBottom: s,
  viewportTop: i
}) => e < i ? { ...r2, align: n ?? "start", ...o === void 0 ? {} : { behavior: o } } : t > s ? { ...r2, align: n ?? "end", ...o === void 0 ? {} : { behavior: o } } : null;
var io = Y(
  ([
    { gap: t, sizes: e, totalCount: n },
    { fixedFooterHeight: o, fixedHeaderHeight: r2, headerHeight: s, scrollingInProgress: i, scrollTop: l, viewportHeight: u },
    { scrollToIndex: f }
  ]) => {
    const d = j();
    return z(
      v(
        d,
        D(e, u, n, s, r2, o, l),
        D(t),
        k(([[g, h, m, x, b, I, T, c], C]) => {
          const { calculateViewLocation: S = tr, done: w, ...L } = g, P = Qn(g, h, x - 1), a = ae(P, h.offsetTree, C) + b + I, p = a + Ot(h.sizeTree, P)[1], R = c + I, O = c + m - T, B = S({
            itemBottom: p,
            itemTop: a,
            locationParams: L,
            viewportBottom: O,
            viewportTop: R
          });
          return B === null ? w?.() : w && kt(
            v(
              i,
              V((F) => !F),
              // skips the initial publish of false, and the cleanup call.
              // but if scrollingInProgress is true, we skip the initial publish.
              qt(et(i) ? 1 : 2)
            ),
            w
          ), B;
        }),
        V((g) => g !== null)
      ),
      f
    ), {
      scrollIntoView: d
    };
  },
  st(Mt, It, he, Yt, Gt),
  { singleton: true }
);
function Ln(t) {
  return t === false ? false : t === "smooth" ? "smooth" : "auto";
}
var er = (t, e) => typeof t == "function" ? Ln(t(e)) : e && Ln(t);
var nr = Y(
  ([
    { listRefresh: t, totalCount: e, fixedItemSize: n, data: o },
    { atBottomState: r2, isAtBottom: s },
    { scrollToIndex: i },
    { scrolledToInitialItem: l },
    { didMount: u, propsReady: f },
    { log: d },
    { scrollingInProgress: g },
    { context: h },
    { scrollIntoView: m }
  ]) => {
    const x = y(false), b = j();
    let I = null;
    function T(w) {
      N(i, {
        align: "end",
        behavior: w,
        index: "LAST"
      });
    }
    X2(
      v(
        dt(v(W(e), qt(1)), u),
        D(W(x), s, l, g),
        k(([[w, L], P, a, p, R]) => {
          let O = L && p, B = "auto";
          return O && (B = er(P, a || R), O = O && B !== false), { followOutputBehavior: B, shouldFollow: O, totalCount: w };
        }),
        V(({ shouldFollow: w }) => w)
      ),
      ({ followOutputBehavior: w, totalCount: L }) => {
        I !== null && (I(), I = null), et(n) === void 0 ? I = kt(t, () => {
          et(d)("following output to ", { totalCount: L }, gt.DEBUG), T(w), I = null;
        }) : requestAnimationFrame(() => {
          et(d)("following output to ", { totalCount: L }, gt.DEBUG), T(w);
        });
      }
    );
    function c(w) {
      const L = kt(r2, (P) => {
        w && !P.atBottom && P.notAtBottomBecause === "SIZE_INCREASED" && I === null && (et(d)("scrolling to bottom due to increased size", {}, gt.DEBUG), T("auto"));
      });
      setTimeout(L, 100);
    }
    X2(
      v(
        dt(W(x), e, f),
        V(([w, , L]) => w !== false && L),
        Et(
          ({ value: w }, [, L]) => ({ refreshed: w === L, value: L }),
          { refreshed: false, value: 0 }
        ),
        V(({ refreshed: w }) => w),
        D(x, e)
      ),
      ([, w]) => {
        et(l) && c(w !== false);
      }
    ), X2(b, () => {
      c(et(x) !== false);
    }), X2(dt(W(x), r2), ([w, L]) => {
      w !== false && !L.atBottom && L.notAtBottomBecause === "VIEWPORT_HEIGHT_DECREASING" && T("auto");
    });
    const C = y(null), S = j();
    return z(
      be(
        v(
          W(o),
          k((w) => w?.length ?? 0)
        ),
        v(W(e))
      ),
      S
    ), X2(
      v(
        dt(v(S, qt(1)), u),
        D(W(C), l, g, h),
        k(([[w, L], P, a, p, R]) => L && a && P?.({ context: R, totalCount: w, scrollingInProgress: p })),
        V((w) => !!w),
        Vt(0)
      ),
      (w) => {
        I !== null && (I(), I = null), et(n) === void 0 ? I = kt(t, () => {
          et(d)("scrolling into view", {}), N(m, w), I = null;
        }) : requestAnimationFrame(() => {
          et(d)("scrolling into view", {}), N(m, w);
        });
      }
    ), { autoscrollToBottom: b, followOutput: x, scrollIntoViewOnChange: C };
  },
  st(
    Mt,
    ge,
    he,
    pe,
    At,
    Gt,
    It,
    so,
    io
  )
);
var or = Y(
  ([{ data: t, firstItemIndex: e, gap: n, sizes: o }, { initialTopMostItemIndex: r2 }, { initialItemCount: s, listState: i }, { didMount: l }]) => (z(
    v(
      l,
      D(s),
      V(([, u]) => u !== 0),
      D(r2, o, e, n, t),
      k(([[, u], f, d, g, h, m]) => oo(u, f, d, g, h, m))
    ),
    i
  ), {}),
  st(Mt, pe, Yt, At),
  { singleton: true }
);
var rr = Y(
  ([{ didMount: t }, { scrollTo: e }, { listState: n }]) => {
    const o = y(0);
    return X2(
      v(
        t,
        D(o),
        V(([, r2]) => r2 !== 0),
        k(([, r2]) => ({ top: r2 }))
      ),
      (r2) => {
        kt(
          v(
            n,
            qt(1),
            V((s) => s.items.length > 1)
          ),
          () => {
            requestAnimationFrame(() => {
              N(e, r2);
            });
          }
        );
      }
    ), {
      initialScrollTop: o
    };
  },
  st(At, It, Yt),
  { singleton: true }
);
var lo = Y(
  ([{ scrollVelocity: t }]) => {
    const e = y(false), n = j(), o = y(false);
    return z(
      v(
        t,
        D(o, e, n),
        V(([r2, s]) => s !== false && s !== void 0),
        k(([r2, s, i, l]) => {
          const { enter: u, exit: f } = s;
          if (i) {
            if (f(r2, l))
              return false;
          } else if (u(r2, l))
            return true;
          return i;
        }),
        ot()
      ),
      e
    ), X2(
      v(dt(e, t, n), D(o)),
      ([[r2, s, i], l]) => {
        r2 && l !== false && l !== void 0 && l.change && l.change(s, i);
      }
    ), { isSeeking: e, scrollSeekConfiguration: o, scrollSeekRangeChanged: n, scrollVelocity: t };
  },
  st(ge),
  { singleton: true }
);
var en = Y(([{ scrollBy: t, scrollContainerState: e, scrollTo: n }]) => {
  const o = j(), r2 = j(), s = j(), i = j(), l = y(false), u = y(void 0), f = pt(
    v(
      r2,
      k(({ zoomRatio: d }) => d ?? 1)
    ),
    1
  );
  return z(
    v(
      dt(o, r2),
      k(([{ scrollTop: d, viewportHeight: g }, { listHeight: h, offsetTop: m, zoomRatio: x = 1 }]) => ({
        scrollHeight: h,
        scrollTop: Math.max(0, Ht(d - m, x)),
        viewportHeight: Ht(g, x)
      }))
    ),
    e
  ), z(
    v(
      n,
      D(r2),
      k(([d, { offsetTop: g, zoomRatio: h = 1 }]) => ({
        ...d,
        top: Ht(d.top, 1 / h) + g
      }))
    ),
    s
  ), z(
    v(
      t,
      D(f),
      k(
        ([d, g]) => d.top === void 0 ? d : { ...d, top: Ht(d.top, 1 / g) }
      )
    ),
    i
  ), {
    customScrollParent: u,
    // config
    useWindowScroll: l,
    // input
    windowScrollContainerState: o,
    // signals
    windowScrollBy: i,
    windowScrollTo: s,
    windowViewportRect: r2
  };
}, st(It));
var sr = Y(
  ([
    { sizeRanges: t, sizes: e },
    { headerHeight: n, scrollTop: o },
    { initialTopMostItemIndex: r2 },
    { didMount: s },
    { useWindowScroll: i, windowScrollContainerState: l, windowViewportRect: u }
  ]) => {
    const f = j(), d = y(void 0), g = y(null), h = y(null);
    return z(l, g), z(u, h), X2(
      v(
        f,
        D(e, o, i, g, h, n)
      ),
      ([m, x, b, I, T, c, C]) => {
        const S = No(x.sizeTree);
        I && T !== null && c !== null && (b = Ht(T.scrollTop - c.offsetTop, c.zoomRatio ?? 1)), b -= C, m({ ranges: S, scrollTop: b });
      }
    ), z(v(d, V(je), k(ir)), r2), z(
      v(
        s,
        D(d),
        V(([, m]) => m !== void 0),
        ot(),
        k(([, m]) => m.ranges)
      ),
      t
    ), {
      getState: f,
      restoreStateFrom: d
    };
  },
  st(Mt, It, pe, At, en)
);
function ir(t) {
  return { align: "start", index: 0, offset: t.scrollTop };
}
var lr = Y(([{ topItemsIndexes: t }]) => {
  const e = y(0);
  return z(
    v(
      e,
      V((n) => n >= 0),
      k((n) => Array.from({ length: n }).map((o, r2) => r2))
    ),
    t
  ), { topItemCount: e };
}, st(Yt));
function co(t) {
  let e = false, n;
  return () => (e || (e = true, n = t()), n);
}
var cr = co(() => /iP(ad|od|hone)/i.test(navigator.userAgent) && /WebKit/i.test(navigator.userAgent));
var ur = Y(
  ([
    { deviation: t, deviationCommitted: e, scrollBy: n, scrollingInProgress: o, scrollTop: r2 },
    { isAtBottom: s, isScrolling: i, lastJumpDueToItemResize: l, scrollDirection: u },
    { listState: f },
    { beforeUnshiftWith: d, gap: g, shiftWithOffset: h, sizes: m },
    { log: x },
    { recalcInProgress: b }
  ]) => {
    const I = Ct(
      v(
        f,
        D(l),
        Et(
          ([, S, w, L, P], [{ bottom: a, items: p, offsetBottom: R, totalCount: O }, B]) => {
            const F = a + R;
            let G = 0, q = P;
            return w === O && S.length > 0 && p.length > 0 && (p[0].originalIndex === 0 && S[0].originalIndex === 0 || (G = F - L, G !== 0 && B !== q && (G += B.jump, q = B))), [G, p, O, F, q];
          },
          [0, [], 0, 0, void 0]
        ),
        V(([S]) => S !== 0),
        D(r2, u, o, s, x, b),
        V(([, S, w, L, , , P]) => !P && !L && S !== 0 && w === de),
        k(([[S], , , , , w]) => (w("Upward scrolling compensation", { amount: S }, gt.DEBUG), S))
      )
    );
    function T(S) {
      S > 0 ? (N(n, { behavior: "auto", top: -S }), N(t, 0)) : (N(t, 0), N(n, { behavior: "auto", top: -S }));
    }
    X2(v(I, D(t, i)), ([S, w, L]) => {
      L && cr() ? N(t, w - S) : T(-S);
    }), X2(
      v(
        dt(pt(i, false), t, b),
        V(([S, w, L]) => !S && !L && w !== 0),
        k(([S, w]) => w),
        Vt(1)
      ),
      T
    ), z(
      v(
        h,
        k((S) => ({ top: -S }))
      ),
      n
    );
    let c = null;
    function C() {
      if (c === null)
        return;
      const { offset: S } = c;
      c = null, N(n, { top: S }), requestAnimationFrame(() => {
        N(t, 0), N(b, false);
      });
    }
    return X2(e, (S) => {
      c === null || !c.acknowledgeable || S === c.offset && C();
    }), X2(
      v(
        d,
        D(m, g),
        k(([S, { groupIndices: w, lastSize: L, sizeTree: P }, a]) => {
          function p(G) {
            return G * (L + a);
          }
          if (w.length === 0)
            return p(S);
          let R = 0;
          const O = ue(P, 0);
          let B = 0, F = 0;
          for (; B < S; ) {
            B++, R += O;
            let G = w.length === F + 1 ? 1 / 0 : w[F + 1] - w[F] - 1;
            B + G > S && (R -= O, G = S - B + 1), B += G, R += p(G), F++;
          }
          return R;
        })
      ),
      (S) => {
        c = { acknowledgeable: et(t) !== S, offset: S }, N(t, S), requestAnimationFrame(C);
      }
    ), { deviation: t };
  },
  st(It, ge, Yt, Mt, Gt, Ze)
);
var ar = Y(
  ([
    t,
    e,
    n,
    o,
    r2,
    s,
    i,
    l,
    u,
    f,
    d
  ]) => ({
    ...t,
    ...e,
    ...n,
    ...o,
    ...r2,
    ...s,
    ...i,
    ...l,
    ...u,
    ...f,
    ...d
  }),
  st(
    tn,
    or,
    At,
    lo,
    ro,
    rr,
    Qo,
    en,
    io,
    Gt,
    so
  )
);
var uo = Y(
  ([
    {
      data: t,
      defaultItemSize: e,
      firstItemIndex: n,
      fixedItemSize: o,
      fixedGroupSize: r2,
      gap: s,
      groupIndices: i,
      heightEstimates: l,
      itemSize: u,
      sizeRanges: f,
      sizes: d,
      statefulTotalCount: g,
      totalCount: h,
      trackItemSizes: m
    },
    { initialItemFinalLocationReached: x, initialTopMostItemIndex: b, scrolledToInitialItem: I },
    T,
    c,
    C,
    S,
    { scrollToIndex: w },
    L,
    { topItemCount: P },
    { groupCounts: a },
    p
  ]) => {
    const { listState: R, minOverscanItemCount: O, topItemsIndexes: B, rangeChanged: F, ...G } = S;
    return z(F, p.scrollSeekRangeChanged), z(
      v(
        dt(p.windowViewportRect, T.headerHeight, T.fixedHeaderHeight),
        // Keep a measurement range active when a window-scrolling list starts below the viewport.
        // One content pixel beyond the headers is enough to render the probe item and estimate the full list height.
        k(([q, M, ft]) => Math.max(M + ft + 1, q.visibleHeight))
      ),
      T.viewportHeight
    ), {
      data: t,
      defaultItemHeight: e,
      firstItemIndex: n,
      fixedItemHeight: o,
      fixedGroupHeight: r2,
      gap: s,
      groupCounts: a,
      heightEstimates: l,
      initialItemFinalLocationReached: x,
      initialTopMostItemIndex: b,
      scrolledToInitialItem: I,
      sizeRanges: f,
      topItemCount: P,
      topItemsIndexes: B,
      // input
      totalCount: h,
      ...C,
      groupIndices: i,
      itemSize: u,
      listState: R,
      minOverscanItemCount: O,
      scrollToIndex: w,
      // output
      statefulTotalCount: g,
      trackItemSizes: m,
      // exported from stateFlagsSystem
      rangeChanged: F,
      ...G,
      // the bag of IO from featureGroup1System
      ...p,
      ...T,
      sizes: d,
      ...c
    };
  },
  st(
    Mt,
    pe,
    It,
    sr,
    nr,
    Yt,
    he,
    ur,
    lr,
    to,
    ar
  )
);
function dr(t, e) {
  const n = {}, o = {};
  let r2 = 0;
  const s = t.length;
  for (; r2 < s; )
    o[t[r2]] = 1, r2 += 1;
  for (const i in e)
    Object.hasOwn(o, i) || (n[i] = e[i]);
  return n;
}
var Te = typeof document > "u" ? E.useEffect : E.useLayoutEffect;
function nn(t, e, n) {
  const o = Object.keys(e.required || {}), r2 = Object.keys(e.optional || {}), s = Object.keys(e.methods || {}), i = Object.keys(e.events || {}), l = E.createContext({});
  function u(T, c) {
    T.propsReady !== void 0 && N(T.propsReady, false);
    for (const C of o) {
      const S = T[e.required[C]];
      N(S, c[C]);
    }
    for (const C of r2)
      if (C in c) {
        const S = T[e.optional[C]];
        N(S, c[C]);
      }
    T.propsReady !== void 0 && N(T.propsReady, true);
  }
  function f(T) {
    return s.reduce((c, C) => (c[C] = (S) => {
      const w = T[e.methods[C]];
      N(w, S);
    }, c), {});
  }
  function d(T) {
    return i.reduce((c, C) => (c[C] = Ho(T[e.events[C]]), c), {});
  }
  const g = E.forwardRef(function(c, C) {
    const { children: S, ...w } = c, [L] = E.useState(() => ke(Lo(t), (p) => {
      u(p, w);
    })), [P] = E.useState(Sn(d, L));
    Te(() => {
      for (const p of i)
        p in w && X2(P[p], w[p]);
      return () => {
        Object.values(P).map(Ke);
      };
    }, [w, P, L]), Te(() => {
      u(L, w);
    }), E.useImperativeHandle(C, In(f(L)));
    const a = n;
    return /* @__PURE__ */ A(l.Provider, { value: L, children: n === void 0 ? S : /* @__PURE__ */ A(a, { ...dr([...o, ...r2, ...i], w), children: S }) });
  }), h = (T) => {
    const c = E.useContext(l);
    return E.useCallback(
      (C) => {
        N(c[T], C);
      },
      [c, T]
    );
  }, m = (T) => {
    const C = E.useContext(l)[T], S = E.useCallback(
      (w) => X2(C, w),
      [C]
    );
    return E.useSyncExternalStore(
      S,
      () => et(C),
      () => et(C)
    );
  }, x = (T) => {
    const C = E.useContext(l)[T], [S, w] = E.useState(Sn(et, C));
    return Te(
      () => X2(C, (L) => {
        L !== S && w(In(L));
      }),
      [C, S]
    ), S;
  }, b = parseInt(E.version, 10) >= 18 ? m : x;
  return {
    Component: g,
    useEmitter: (T, c) => {
      const S = E.useContext(l)[T];
      Te(() => X2(S, c), [c, S]);
    },
    useEmitterValue: b,
    usePublisher: h
  };
}
var Ie = E.createContext(void 0);
var ao = E.createContext(void 0);
var Ve = "-webkit-sticky";
var On = "sticky";
var on = co(() => {
  if (typeof document > "u")
    return On;
  const t = document.createElement("div");
  return t.style.position = Ve, t.style.position === Ve ? Ve : On;
});
function We(t) {
  return "self" in t;
}
function fr(t) {
  return "body" in t;
}
function fo(t, e, n, o = te, r2, s) {
  const i = E.useRef(null), l = E.useRef(null), u = E.useRef(null), f = E.useCallback(
    (h) => {
      let m, x, b;
      const I = h.target;
      if (fr(I) || We(I)) {
        const c = We(I) ? I : I.defaultView;
        b = s === true ? Dt(c, c.scrollX) : c.scrollY, m = s === true ? c.document.documentElement.scrollWidth : c.document.documentElement.scrollHeight, x = s === true ? c.innerWidth : c.innerHeight;
      } else
        b = s === true ? Dt(I, I.scrollLeft) : I.scrollTop, m = s === true ? I.scrollWidth : I.scrollHeight, x = s === true ? I.offsetWidth : I.offsetHeight;
      const T = () => {
        t({
          scrollHeight: m,
          scrollTop: Math.max(b, 0),
          viewportHeight: x
        });
      };
      h.suppressFlushSync === true ? T() : To.flushSync(T), l.current !== null && (Math.abs(b - l.current) < 1 || b <= 0 || b === m - x) && (l.current = null, e(true), u.current && (clearTimeout(u.current), u.current = null));
    },
    [t, e, s]
  );
  E.useEffect(() => {
    const h = r2 ?? i.current;
    return o(r2 ?? i.current), f({ suppressFlushSync: true, target: h }), h.addEventListener("scroll", f, { passive: true }), () => {
      o(null), h.removeEventListener("scroll", f);
    };
  }, [i, f, n, o, r2]);
  function d(h) {
    const m = i.current;
    if (!m || (s === true ? "offsetWidth" in m && m.offsetWidth === 0 : "offsetHeight" in m && m.offsetHeight === 0))
      return;
    const x = h.behavior === "smooth";
    let b, I, T;
    We(m) ? (I = Math.max(
      Lt(m.document.documentElement, s === true ? "width" : "height"),
      s === true ? m.document.documentElement.scrollWidth : m.document.documentElement.scrollHeight
    ), b = s === true ? m.innerWidth : m.innerHeight, T = s === true ? Dt(m, m.scrollX) : m.scrollY) : (I = m[s === true ? "scrollWidth" : "scrollHeight"], b = Lt(m, s === true ? "width" : "height", m), T = s === true ? Dt(m, m.scrollLeft) : m.scrollTop);
    const c = I - b;
    if (h.top === void 0) {
      m.scrollTo(h);
      return;
    }
    const C = Math.ceil(Math.max(Math.min(c, h.top), 0));
    if (h.top = C, no(b, I) || C === T) {
      t({ scrollHeight: I, scrollTop: T, viewportHeight: b }), x && e(true);
      return;
    }
    x ? (l.current = C, u.current && clearTimeout(u.current), u.current = setTimeout(() => {
      u.current = null, l.current = null, e(true);
    }, 1e3)) : l.current = null, s === true && (h = {
      ...h.behavior === void 0 ? {} : { behavior: h.behavior },
      left: vn(m, C)
    }), m.scrollTo(h);
  }
  return { scrollByCallback: E.useCallback(
    (h) => {
      s === true && (h = {
        ...h.behavior === void 0 ? {} : { behavior: h.behavior },
        ...h.top === void 0 ? {} : { left: vn(i.current, h.top) }
      }), i.current.scrollBy(h);
    },
    [s]
  ), scrollerRef: i, scrollToCallback: d };
}
function rn(t) {
  return t;
}
var mr = /* @__PURE__ */ Y(() => {
  const t = y((l) => `Item ${l}`), e = y((l) => `Group ${l}`), n = y({}), o = y(rn), r2 = y("div"), s = y(te), i = (l, u = null) => pt(
    v(
      n,
      k((f) => f[l]),
      ot()
    ),
    u
  );
  return {
    components: n,
    computeItemKey: o,
    EmptyPlaceholder: i("EmptyPlaceholder"),
    FooterComponent: i("Footer"),
    GroupComponent: i("Group", "div"),
    groupContent: e,
    HeaderComponent: i("Header"),
    HeaderFooterTag: r2,
    ItemComponent: i("Item", "div"),
    itemContent: t,
    ListComponent: i("List", "div"),
    ScrollerComponent: i("Scroller", "div"),
    scrollerRef: s,
    ScrollSeekPlaceholder: i("ScrollSeekPlaceholder"),
    TopItemListComponent: i("TopItemList")
  };
});
var hr = /* @__PURE__ */ Y(
  ([t, e]) => ({ ...t, ...e }),
  st(uo, mr)
);
var pr = ({ height: t }) => /* @__PURE__ */ A("div", { style: { height: t } });
var gr = { overflowAnchor: "none", position: on(), zIndex: 1 };
var mo = { overflowAnchor: "none" };
var Ir = { ...mo, display: "inline-block", height: "100%" };
var Bn = /* @__PURE__ */ E.memo(function({ showTopList: e = false }) {
  const n = _("listState"), o = Tt("sizeRanges"), r2 = _("useWindowScroll"), s = _("customScrollParent"), i = Tt("windowScrollContainerState"), l = Tt("scrollContainerState"), u = s || r2 ? i : l, f = _("itemContent"), d = _("context"), g = _("groupContent"), h = _("trackItemSizes"), m = _("itemSize"), x = _("log"), b = Tt("gap"), I = _("horizontalDirection"), { callbackRef: T } = $n(
    o,
    m,
    h,
    e ? te : u,
    x,
    b,
    s,
    I,
    _("skipAnimationFrameInResizeObserver")
  ), [c, C] = E.useState(0);
  un("deviation", (M) => {
    c !== M && C(M);
  });
  const S = Tt("deviationCommitted");
  Le(() => {
    S(c);
  }, [c, S]);
  const w = _("EmptyPlaceholder"), L = _("ScrollSeekPlaceholder") ?? pr, P = _("ListComponent"), a = _("ItemComponent"), p = _("GroupComponent"), R = _("computeItemKey"), O = _("isSeeking"), B = _("groupIndices").length > 0, F = _("alignToBottom"), G = _("initialItemFinalLocationReached"), q = e ? {} : {
    boxSizing: "border-box",
    ...I ? {
      display: "inline-block",
      height: "100%",
      marginInlineStart: c === 0 ? F ? "auto" : 0 : c,
      paddingInlineEnd: n.offsetBottom,
      paddingInlineStart: n.offsetTop,
      whiteSpace: "nowrap"
    } : {
      marginTop: c === 0 ? F ? "auto" : 0 : c,
      paddingBottom: n.offsetBottom,
      paddingTop: n.offsetTop
    },
    ...G ? {} : { visibility: "hidden" }
  };
  return !e && n.totalCount === 0 && w !== null && w !== void 0 ? /* @__PURE__ */ A(w, { ...rt(w, d) }) : /* @__PURE__ */ A(
    P,
    {
      ...rt(P, d),
      "data-testid": e ? "virtuoso-top-item-list" : "virtuoso-item-list",
      ref: T,
      style: q,
      children: (e ? n.topItems : n.items).map((M) => {
        const ft = M.originalIndex, Z = R(ft + n.firstItemIndex, M.data, d);
        return O ? /* @__PURE__ */ jt(
          L,
          {
            ...rt(L, d),
            height: M.size,
            index: M.index,
            key: Z,
            type: M.type || "item",
            ...M.type === "group" ? {} : { groupIndex: M.groupIndex }
          }
        ) : M.type === "group" ? /* @__PURE__ */ jt(
          p,
          {
            ...rt(p, d),
            "data-index": ft,
            "data-item-index": M.index,
            "data-known-size": M.size,
            key: Z,
            style: gr
          },
          g(M.index, d)
        ) : /* @__PURE__ */ jt(
          a,
          {
            ...rt(a, d),
            ...ho(a, M.data),
            "data-index": ft,
            "data-item-group-index": M.groupIndex,
            "data-item-index": M.index,
            "data-known-size": M.size,
            key: Z,
            style: I ? Ir : mo
          },
          B ? f(M.index, M.groupIndex, M.data, d) : f(M.index, M.data, d)
        );
      })
    }
  );
});
var Sr = {
  height: "100%",
  outline: "none",
  overflowY: "auto",
  position: "relative",
  WebkitOverflowScrolling: "touch"
};
var xr = {
  outline: "none",
  overflowX: "auto",
  position: "relative"
};
var Be = (t) => ({
  height: "100%",
  position: "absolute",
  top: 0,
  width: "100%",
  ...t ? { display: "flex", flexDirection: "column" } : void 0
});
var sn = (t, e, n = 0) => ({
  ...Be(t),
  position: e ? "relative" : "absolute",
  top: e ? -n : 0
});
var vr = {
  position: on(),
  top: 0,
  width: "100%",
  zIndex: 1
};
function rt(t, e) {
  if (typeof t != "string")
    return { context: e };
}
function ho(t, e) {
  return { item: typeof t == "string" ? void 0 : e };
}
var Tr = /* @__PURE__ */ E.memo(function() {
  const e = _("HeaderComponent"), n = Tt("headerHeight"), o = _("HeaderFooterTag"), r2 = Ft(
    E.useMemo(
      () => (i) => {
        n(Lt(i, "height"));
      },
      [n]
    ),
    true,
    _("skipAnimationFrameInResizeObserver")
  ), s = _("context");
  return e != null ? /* @__PURE__ */ A(o, { ref: r2, children: /* @__PURE__ */ A(e, { ...rt(e, s) }) }) : null;
});
var Cr = /* @__PURE__ */ E.memo(function() {
  const e = _("FooterComponent"), n = Tt("footerHeight"), o = _("HeaderFooterTag"), r2 = Ft(
    E.useMemo(
      () => (i) => {
        n(Lt(i, "height"));
      },
      [n]
    ),
    true,
    _("skipAnimationFrameInResizeObserver")
  ), s = _("context");
  return e != null ? /* @__PURE__ */ A(o, { ref: r2, children: /* @__PURE__ */ A(e, { ...rt(e, s) }) }) : null;
});
function ln({ useEmitter: t, useEmitterValue: e, usePublisher: n }) {
  return E.memo(function({ children: s, style: i, context: l, ...u }) {
    const f = n("scrollContainerState"), d = e("ScrollerComponent"), g = n("smoothScrollTargetReached"), h = e("scrollerRef"), m = e("horizontalDirection") || false, { scrollByCallback: x, scrollerRef: b, scrollToCallback: I } = fo(
      f,
      g,
      d,
      h,
      void 0,
      m
    ), T = E.useContext(Ie), c = E.useRef(0), C = E.useCallback((L) => {
      c.current = L;
    }, []);
    t("totalListHeight", C);
    const S = E.useCallback(
      (L) => {
        if (!T || L.top === void 0)
          return;
        const P = Math.max(c.current, T.viewportHeight), a = Math.ceil(Math.max(Math.min(P - T.viewportHeight, L.top), 0));
        f({ scrollHeight: P, scrollTop: a, viewportHeight: T.viewportHeight }), L.behavior === "smooth" && g(true);
      },
      [T, f, g]
    );
    return t("scrollTo", T ? S : I), t("scrollBy", x), /* @__PURE__ */ A(
      d,
      {
        "data-testid": "virtuoso-scroller",
        "data-virtuoso-scroller": true,
        ref: b,
        style: { ...m ? xr : Sr, ...i },
        tabIndex: 0,
        ...u,
        ...rt(d, l),
        children: s
      }
    );
  });
}
function cn({ useEmitter: t, useEmitterValue: e, usePublisher: n }) {
  return E.memo(function({ children: s, style: i, context: l, ...u }) {
    const f = n("windowScrollContainerState"), d = e("ScrollerComponent"), g = n("smoothScrollTargetReached"), h = e("totalListHeight"), m = e("deviation"), x = e("customScrollParent"), b = E.useRef(null), I = e("scrollerRef"), { scrollByCallback: T, scrollerRef: c, scrollToCallback: C } = fo(
      f,
      g,
      d,
      I,
      x
    );
    return Le(() => (c.current = x ?? b.current?.ownerDocument.defaultView, () => {
      c.current = null;
    }), [c, x]), t("windowScrollTo", C), t("windowScrollBy", T), /* @__PURE__ */ A(
      d,
      {
        ref: b,
        "data-virtuoso-scroller": true,
        style: { position: "relative", ...i, ...h === 0 ? void 0 : { height: h + m } },
        ...u,
        ...rt(d, l),
        children: s
      }
    );
  });
}
var wr = ({ children: t }) => {
  const e = E.useContext(Ie), n = Tt("viewportHeight"), o = Tt("fixedItemHeight"), r2 = _("alignToBottom"), s = _("horizontalDirection"), i = E.useMemo(
    () => ie(n, (u) => Lt(u, s ? "width" : "height")),
    [n, s]
  ), l = Ft(i, true, _("skipAnimationFrameInResizeObserver"));
  return E.useEffect(() => {
    e && (n(e.viewportHeight), o(e.itemHeight));
  }, [e, n, o]), /* @__PURE__ */ A("div", { "data-viewport-type": "element", ref: l, style: Be(r2), children: t });
};
var yr = ({ children: t }) => {
  const e = E.useContext(Ie), n = Tt("windowViewportRect"), o = Tt("fixedItemHeight"), r2 = _("customScrollParent"), s = _("useWindowScroll"), i = _("topListHeight"), l = Ye(
    n,
    r2,
    _("skipAnimationFrameInResizeObserver")
  ), u = _("alignToBottom");
  return E.useEffect(() => {
    e && (o(e.itemHeight), n({ listHeight: 0, offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: 100 }));
  }, [e, n, o]), /* @__PURE__ */ A("div", { "data-viewport-type": "window", ref: l, style: sn(u, s, i), children: t });
};
var br = ({ children: t }) => {
  const e = _("TopItemListComponent") ?? "div", n = _("headerHeight"), o = { ...vr, marginTop: `${n}px` }, r2 = _("context");
  return /* @__PURE__ */ A(e, { style: o, ...rt(e, r2), children: t });
};
var Rr = /* @__PURE__ */ E.memo(function(e) {
  const n = _("useWindowScroll"), o = _("topItemsIndexes").length > 0, r2 = _("customScrollParent"), s = _("context");
  return /* @__PURE__ */ Kt(r2 || n ? Er : Hr, { ...e, context: s, children: [
    o && /* @__PURE__ */ A(br, { children: /* @__PURE__ */ A(Bn, { showTopList: true }) }),
    /* @__PURE__ */ Kt(r2 || n ? yr : wr, { children: [
      /* @__PURE__ */ A(Tr, {}),
      /* @__PURE__ */ A(Bn, {}),
      /* @__PURE__ */ A(Cr, {})
    ] })
  ] });
});
var {
  Component: po,
  useEmitter: un,
  useEmitterValue: _,
  usePublisher: Tt
} = /* @__PURE__ */ nn(
  hr,
  {
    optional: {
      restoreStateFrom: "restoreStateFrom",
      context: "context",
      followOutput: "followOutput",
      scrollIntoViewOnChange: "scrollIntoViewOnChange",
      itemContent: "itemContent",
      groupContent: "groupContent",
      overscan: "overscan",
      increaseViewportBy: "increaseViewportBy",
      minOverscanItemCount: "minOverscanItemCount",
      totalCount: "totalCount",
      groupCounts: "groupCounts",
      topItemCount: "topItemCount",
      firstItemIndex: "firstItemIndex",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      components: "components",
      atBottomThreshold: "atBottomThreshold",
      atTopThreshold: "atTopThreshold",
      computeItemKey: "computeItemKey",
      defaultItemHeight: "defaultItemHeight",
      fixedGroupHeight: "fixedGroupHeight",
      // Must be set above 'fixedItemHeight'
      fixedItemHeight: "fixedItemHeight",
      heightEstimates: "heightEstimates",
      itemSize: "itemSize",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      headerFooterTag: "HeaderFooterTag",
      data: "data",
      initialItemCount: "initialItemCount",
      initialScrollTop: "initialScrollTop",
      alignToBottom: "alignToBottom",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      horizontalDirection: "horizontalDirection",
      skipAnimationFrameInResizeObserver: "skipAnimationFrameInResizeObserver"
    },
    methods: {
      scrollToIndex: "scrollToIndex",
      scrollIntoView: "scrollIntoView",
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      autoscrollToBottom: "autoscrollToBottom",
      getState: "getState"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      totalListHeightChanged: "totalListHeightChanged",
      itemsRendered: "itemsRendered",
      groupIndices: "groupIndices"
    }
  },
  Rr
);
var Hr = /* @__PURE__ */ ln({ useEmitter: un, useEmitterValue: _, usePublisher: Tt });
var Er = /* @__PURE__ */ cn({ useEmitter: un, useEmitterValue: _, usePublisher: Tt });
var ss = po;
var kr = /* @__PURE__ */ Y(() => {
  const t = y((f) => /* @__PURE__ */ Kt("td", { children: [
    "Item $",
    f
  ] })), e = y(null), n = y((f) => /* @__PURE__ */ Kt("td", { colSpan: 1e3, children: [
    "Group ",
    f
  ] })), o = y(null), r2 = y(null), s = y({}), i = y(rn), l = y(te), u = (f, d = null) => pt(
    v(
      s,
      k((g) => g[f]),
      ot()
    ),
    d
  );
  return {
    components: s,
    computeItemKey: i,
    context: e,
    EmptyPlaceholder: u("EmptyPlaceholder"),
    FillerRow: u("FillerRow"),
    fixedFooterContent: r2,
    fixedHeaderContent: o,
    itemContent: t,
    groupContent: n,
    ScrollerComponent: u("Scroller", "div"),
    scrollerRef: l,
    ScrollSeekPlaceholder: u("ScrollSeekPlaceholder"),
    TableBodyComponent: u("TableBody", "tbody"),
    TableComponent: u("Table", "table"),
    TableFooterComponent: u("TableFoot", "tfoot"),
    TableHeadComponent: u("TableHead", "thead"),
    TableRowComponent: u("TableRow", "tr"),
    GroupComponent: u("Group", "tr")
  };
});
var Lr = /* @__PURE__ */ Y(
  ([t, e]) => ({ ...t, ...e }),
  st(uo, kr)
);
var Or = ({ height: t }) => /* @__PURE__ */ A("tr", { children: /* @__PURE__ */ A("td", { style: { height: t } }) });
var Br = ({ height: t }) => /* @__PURE__ */ A("tr", { children: /* @__PURE__ */ A("td", { style: { border: 0, height: t, padding: 0 } }) });
var zr = { overflowAnchor: "none" };
var zn = { position: on(), zIndex: 2, overflowAnchor: "none" };
var Fn = /* @__PURE__ */ E.memo(function({ showTopList: e = false }) {
  const n = U("listState"), o = U("computeItemKey"), r2 = U("firstItemIndex"), s = U("context"), i = U("isSeeking"), l = U("fixedHeaderHeight"), u = U("groupIndices").length > 0, f = U("itemContent"), d = U("groupContent"), g = U("ScrollSeekPlaceholder") ?? Or, h = U("GroupComponent"), m = U("TableRowComponent"), x = (e ? n.topItems : []).reduce((I, T, c) => (c === 0 ? I.push(T.size) : I.push(I[c - 1] + T.size), I), []);
  return (e ? n.topItems : n.items).map((I) => {
    const T = I.originalIndex, c = o(T + r2, I.data, s), C = e ? T === 0 ? 0 : x[T - 1] : 0;
    return i ? /* @__PURE__ */ jt(
      g,
      {
        ...rt(g, s),
        height: I.size,
        index: I.index,
        key: c,
        type: I.type || "item"
      }
    ) : I.type === "group" ? /* @__PURE__ */ jt(
      h,
      {
        ...rt(h, s),
        "data-index": T,
        "data-item-index": I.index,
        "data-known-size": I.size,
        key: c,
        style: {
          ...zn,
          top: l
        }
      },
      d(I.index, s)
    ) : /* @__PURE__ */ jt(
      m,
      {
        ...rt(m, s),
        ...ho(m, I.data),
        "data-index": T,
        "data-item-index": I.index,
        "data-known-size": I.size,
        "data-item-group-index": I.groupIndex,
        key: c,
        style: e ? { ...zn, top: l + C } : zr
      },
      u ? f(I.index, I.groupIndex, I.data, s) : f(I.index, I.data, s)
    );
  });
});
var Fr = /* @__PURE__ */ E.memo(function() {
  const e = U("listState"), n = U("topItemsIndexes").length > 0, o = yt("sizeRanges"), r2 = U("useWindowScroll"), s = U("customScrollParent"), i = yt("windowScrollContainerState"), l = yt("scrollContainerState"), u = s || r2 ? i : l, f = U("trackItemSizes"), d = U("itemSize"), g = U("log"), { callbackRef: h, ref: m } = $n(
    o,
    d,
    f,
    u,
    g,
    void 0,
    s,
    false,
    U("skipAnimationFrameInResizeObserver")
  ), [x, b] = E.useState(0);
  an("deviation", (B) => {
    x !== B && (m.current.style.marginTop = `${B}px`, b(B));
  });
  const I = yt("deviationCommitted");
  Le(() => {
    I(x);
  }, [x, I]);
  const T = U("EmptyPlaceholder"), c = U("FillerRow") ?? Br, C = U("TableBodyComponent"), S = U("paddingTopAddition"), w = U("statefulTotalCount"), L = U("context");
  if (w === 0 && T !== null && T !== void 0)
    return /* @__PURE__ */ A(T, { ...rt(T, L) });
  const P = (n ? e.topItems : []).reduce((B, F) => B + F.size, 0), a = e.offsetTop + S + x - P, p = e.offsetBottom, R = a > 0 ? /* @__PURE__ */ A(c, { context: L, height: a }, "padding-top") : null, O = p > 0 ? /* @__PURE__ */ A(c, { context: L, height: p }, "padding-bottom") : null;
  return /* @__PURE__ */ Kt(C, { "data-testid": "virtuoso-item-list", ref: h, ...rt(C, L), children: [
    R,
    n && /* @__PURE__ */ A(Fn, { showTopList: true }),
    /* @__PURE__ */ A(Fn, {}),
    O
  ] });
});
var Mr = ({ children: t }) => {
  const e = E.useContext(Ie), n = yt("viewportHeight"), o = yt("fixedItemHeight"), r2 = Ft(
    E.useMemo(() => ie(n, (s) => Lt(s, "height")), [n]),
    true,
    U("skipAnimationFrameInResizeObserver")
  );
  return E.useEffect(() => {
    e && (n(e.viewportHeight), o(e.itemHeight));
  }, [e, n, o]), /* @__PURE__ */ A("div", { "data-viewport-type": "element", ref: r2, style: Be(false), children: t });
};
var Vr = ({ children: t }) => {
  const e = E.useContext(Ie), n = yt("windowViewportRect"), o = yt("fixedItemHeight"), r2 = U("customScrollParent"), s = U("useWindowScroll"), i = Ye(
    n,
    r2,
    U("skipAnimationFrameInResizeObserver")
  );
  return E.useEffect(() => {
    e && (o(e.itemHeight), n({ listHeight: 0, offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: 100 }));
  }, [e, n, o]), /* @__PURE__ */ A("div", { "data-viewport-type": "window", ref: i, style: sn(false, s), children: t });
};
var Wr = /* @__PURE__ */ E.memo(function(e) {
  const n = U("useWindowScroll"), o = U("customScrollParent"), r2 = yt("fixedHeaderHeight"), s = yt("fixedFooterHeight"), i = U("fixedHeaderContent"), l = U("fixedFooterContent"), u = U("context"), f = Ft(
    E.useMemo(() => ie(r2, (c) => Lt(c, "height")), [r2]),
    true,
    U("skipAnimationFrameInResizeObserver")
  ), d = Ft(
    E.useMemo(() => ie(s, (c) => Lt(c, "height")), [s]),
    true,
    U("skipAnimationFrameInResizeObserver")
  ), g = o || n ? Gr : Pr, h = o || n ? Vr : Mr, m = U("TableComponent"), x = U("TableHeadComponent"), b = U("TableFooterComponent"), I = i ? /* @__PURE__ */ A(
    x,
    {
      ref: f,
      style: { position: "sticky", top: 0, zIndex: 2 },
      ...rt(x, u),
      children: i()
    },
    "TableHead"
  ) : null, T = l ? /* @__PURE__ */ A(
    b,
    {
      ref: d,
      style: { bottom: 0, position: "sticky", zIndex: 1 },
      ...rt(b, u),
      children: l()
    },
    "TableFoot"
  ) : null;
  return /* @__PURE__ */ A(g, { ...e, ...rt(g, u), children: /* @__PURE__ */ A(h, { children: /* @__PURE__ */ Kt(m, { style: { borderSpacing: 0, overflowAnchor: "none" }, ...rt(m, u), children: [
    I,
    /* @__PURE__ */ A(Fr, {}, "TableBody"),
    T
  ] }) }) });
});
var {
  Component: go,
  useEmitter: an,
  useEmitterValue: U,
  usePublisher: yt
} = /* @__PURE__ */ nn(
  Lr,
  {
    optional: {
      restoreStateFrom: "restoreStateFrom",
      context: "context",
      followOutput: "followOutput",
      firstItemIndex: "firstItemIndex",
      itemContent: "itemContent",
      groupContent: "groupContent",
      fixedHeaderContent: "fixedHeaderContent",
      fixedFooterContent: "fixedFooterContent",
      overscan: "overscan",
      increaseViewportBy: "increaseViewportBy",
      minOverscanItemCount: "minOverscanItemCount",
      totalCount: "totalCount",
      topItemCount: "topItemCount",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      components: "components",
      groupCounts: "groupCounts",
      atBottomThreshold: "atBottomThreshold",
      atTopThreshold: "atTopThreshold",
      computeItemKey: "computeItemKey",
      defaultItemHeight: "defaultItemHeight",
      fixedGroupHeight: "fixedGroupHeight",
      // Must be set above 'fixedItemHeight'
      fixedItemHeight: "fixedItemHeight",
      itemSize: "itemSize",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      data: "data",
      initialItemCount: "initialItemCount",
      initialScrollTop: "initialScrollTop",
      alignToBottom: "alignToBottom",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      skipAnimationFrameInResizeObserver: "skipAnimationFrameInResizeObserver"
    },
    methods: {
      scrollToIndex: "scrollToIndex",
      scrollIntoView: "scrollIntoView",
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      getState: "getState"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      totalListHeightChanged: "totalListHeightChanged",
      itemsRendered: "itemsRendered",
      groupIndices: "groupIndices"
    }
  },
  Wr
);
var Pr = /* @__PURE__ */ ln({ useEmitter: an, useEmitterValue: U, usePublisher: yt });
var Gr = /* @__PURE__ */ cn({ useEmitter: an, useEmitterValue: U, usePublisher: yt });
var Mn = {
  bottom: 0,
  itemHeight: 0,
  items: [],
  itemWidth: 0,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0
};
var Ar = {
  bottom: 0,
  itemHeight: 0,
  items: [{ index: 0 }],
  itemWidth: 0,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0
};
var { ceil: Vn, floor: He, max: se, min: Pe, round: Wn } = Math;
function Pn(t, e, n) {
  return Array.from({ length: e - t + 1 }).map((o, r2) => ({ data: n === null ? null : n[r2 + t], index: r2 + t }));
}
function _r(t) {
  return {
    ...Ar,
    items: t
  };
}
function Ce(t, e) {
  return t !== void 0 && t.width === e.width && t.height === e.height;
}
function Nr(t, e) {
  return t !== void 0 && t.column === e.column && t.row === e.row;
}
var Dr = /* @__PURE__ */ Y(
  ([
    { increaseViewportBy: t, listBoundary: e, overscan: n, visibleRange: o },
    { footerHeight: r2, headerHeight: s, scrollBy: i, scrollContainerState: l, scrollTo: u, scrollTop: f, smoothScrollTargetReached: d, viewportHeight: g },
    h,
    m,
    { didMount: x, propsReady: b },
    { customScrollParent: I, useWindowScroll: T, windowScrollBy: c, windowScrollContainerState: C, windowScrollTo: S, windowViewportRect: w },
    L
  ]) => {
    const P = y(0), a = y(0), p = y(Mn), R = y({ height: 0, width: 0 }), O = y({ height: 0, width: 0 }), B = j(), F = j(), G = y(0), q = y(null), M = y({ column: 0, row: 0 }), ft = j(), Z = j(), it = y(false), ct = y(0), mt = y(true), Bt = y(false), Rt = y(false);
    X2(
      v(
        x,
        D(ct),
        V(([H, $]) => !$e($))
      ),
      () => {
        N(mt, false);
      }
    ), X2(
      v(
        dt(x, mt, O, R, ct, Bt),
        V(([H, $, K, lt, , tt]) => H && !$ && K.height !== 0 && lt.height !== 0 && !tt)
      ),
      ([, , , , H]) => {
        if (H === void 0) {
          N(mt, true);
          return;
        }
        N(Bt, true), Je(1, () => {
          N(B, H);
        }), kt(v(f), () => {
          N(e, [0, 0]), N(mt, true);
        });
      }
    ), z(
      v(
        Z,
        V((H) => H != null && H.scrollTop > 0),
        vt(0)
      ),
      a
    ), X2(
      v(
        x,
        D(Z),
        V(([, H]) => H != null)
      ),
      ([, H]) => {
        H && (N(R, H.viewport), N(O, H.item), N(M, H.gap), H.scrollTop > 0 && (N(it, true), kt(v(f, qt(1)), ($) => {
          N(it, false);
        }), N(u, { top: H.scrollTop })));
      }
    ), z(
      v(
        R,
        k(({ height: H }) => H)
      ),
      g
    ), z(
      v(
        dt(
          W(R, Ce),
          W(O, Ce),
          W(M, (H, $) => H !== void 0 && H.column === $.column && H.row === $.row),
          W(f)
        ),
        k(([H, $, K, lt]) => ({
          gap: K,
          item: $,
          scrollTop: lt,
          viewport: H
        }))
      ),
      ft
    ), z(
      v(
        dt(
          W(P),
          o,
          W(M, Nr),
          W(O, Ce),
          W(R, Ce),
          W(q),
          W(a),
          W(it),
          W(mt),
          W(ct)
        ),
        V(([, , , , , , , H]) => !H),
        k(
          ([
            H,
            [$, K],
            lt,
            tt,
            Q,
            ut,
            St,
            ,
            at,
            _t
          ]) => {
            const { column: Wt, row: oe } = lt, { height: xe, width: ze } = tt, { width: dn } = Q;
            if (St === 0 && (H === 0 || dn === 0))
              return Mn;
            if (ze === 0) {
              const gn = Qe(_t, H), vo = gn + Math.max(St - 1, 0);
              return _r(Pn(gn, vo, ut));
            }
            const ve = Io(dn, ze, Wt);
            let Zt, Nt;
            at ? $ === 0 && K === 0 && St > 0 ? (Zt = 0, Nt = St - 1) : (Zt = ve * He(($ + oe) / (xe + oe)), Nt = ve * Vn((K + oe) / (xe + oe)) - 1, Nt = Pe(H - 1, se(Nt, ve - 1)), Zt = Pe(Nt, se(0, Zt))) : (Zt = 0, Nt = -1);
            const fn = Pn(Zt, Nt, ut), { bottom: mn, top: hn } = Gn(Q, lt, tt, fn), pn = Vn(H / ve), xo = pn * xe + (pn - 1) * oe - mn;
            return { bottom: mn, itemHeight: xe, items: fn, itemWidth: ze, offsetBottom: xo, offsetTop: hn, top: hn };
          }
        )
      ),
      p
    ), z(
      v(
        q,
        V((H) => H !== null),
        k((H) => H.length)
      ),
      P
    ), z(
      v(
        dt(R, O, p, M),
        V(([H, $, { items: K }]) => K.length > 0 && $.height !== 0 && H.height !== 0),
        k(([H, $, { items: K }, lt]) => {
          const { bottom: tt, top: Q } = Gn(H, lt, $, K);
          return [Q, tt];
        }),
        ot(Jt)
      ),
      e
    );
    const wt = y(false);
    z(
      v(
        f,
        D(wt),
        k(([H, $]) => $ || H !== 0)
      ),
      wt
    );
    const Se = Ct(
      v(
        dt(p, P),
        // A data publish rebuilds gridState before it updates totalCount. Skipping that intermediate step
        // avoids reporting the previous end index against the new data.
        V(([{ items: H }, $]) => {
          const K = et(q);
          return H.length > 0 && (K === null || K.length === $);
        }),
        D(wt),
        V(([[H, $], K]) => {
          const tt = H.items[H.items.length - 1].index === $ - 1;
          return (K || H.bottom > 0 && H.itemHeight > 0 && H.offsetBottom === 0 && H.items.length === $) && tt;
        }),
        // Keying on the data array lets replaced data with a previously reported length fire again, matching
        // the list. withLatestFrom(data) subscribes after gridState and would still hold the previous array.
        k(([[, H]]) => [H - 1, et(q)]),
        ot(Jt),
        k(([H]) => H)
      )
    ), ee = Ct(
      v(
        W(p),
        V(({ items: H }) => H.length > 0 && H[0].index === 0),
        vt(0),
        ot()
      )
    ), zt = Ct(
      v(
        W(p),
        D(it),
        V(([{ items: H }, $]) => H.length > 0 && !$),
        k(([{ items: H }]) => ({
          endIndex: H[H.length - 1].index,
          startIndex: H[0].index
        })),
        ot(Zn),
        Vt(0)
      )
    );
    z(zt, m.scrollSeekRangeChanged), z(
      v(
        B,
        D(R, O, P, M),
        k(([H, $, K, lt, tt]) => {
          const Q = eo(H), { align: ut, behavior: St, offset: at } = Q;
          let _t = Q.index;
          _t === "LAST" && (_t = lt - 1), _t = se(0, Pe(lt - 1, _t));
          let Wt = Ue($, tt, K, _t);
          return ut === "end" ? Wt = Wn(Wt - $.height + K.height) : ut === "center" && (Wt = Wn(Wt - $.height / 2 + K.height / 2)), at !== void 0 && at !== 0 && (Wt += at), { behavior: St, top: Wt };
        })
      ),
      u
    );
    const ne = pt(
      v(
        p,
        k((H) => H.offsetBottom + H.bottom)
      ),
      0
    );
    return z(
      v(
        w,
        k((H) => ({ height: H.visibleHeight, width: H.visibleWidth }))
      ),
      R
    ), {
      customScrollParent: I,
      // input
      data: q,
      deviation: G,
      footerHeight: r2,
      gap: M,
      headerHeight: s,
      increaseViewportBy: t,
      initialItemCount: a,
      itemDimensions: O,
      overscan: n,
      restoreStateFrom: Z,
      scrollBy: i,
      scrollContainerState: l,
      scrollHeight: F,
      scrollTo: u,
      scrollToIndex: B,
      scrollTop: f,
      smoothScrollTargetReached: d,
      totalCount: P,
      useWindowScroll: T,
      viewportDimensions: R,
      windowScrollBy: c,
      windowScrollContainerState: C,
      windowScrollTo: S,
      windowViewportRect: w,
      ...m,
      // output
      gridState: p,
      horizontalDirection: Rt,
      initialTopMostItemIndex: ct,
      totalListHeight: ne,
      ...h,
      endReached: Se,
      propsReady: b,
      rangeChanged: zt,
      startReached: ee,
      stateChanged: ft,
      stateRestoreInProgress: it,
      ...L
    };
  },
  st(tn, It, ge, lo, At, en, Gt)
);
function Io(t, e, n) {
  return se(1, He((t + n) / (He(e) + n)));
}
function Gn(t, e, n, o) {
  const { height: r2 } = n;
  if (r2 === void 0 || o.length === 0)
    return { bottom: 0, top: 0 };
  const s = Ue(t, e, n, o[0].index);
  return { bottom: Ue(t, e, n, o[o.length - 1].index) + r2, top: s };
}
function Ue(t, e, n, o) {
  const r2 = Io(t.width, n.width, e.column), s = He(o / r2), i = s * n.height + se(0, s - 1) * e.row;
  return i > 0 ? i + e.row : i;
}
var $r = /* @__PURE__ */ Y(() => {
  const t = y((g) => `Item ${g}`), e = y({}), n = y(null), o = y("virtuoso-grid-item"), r2 = y("virtuoso-grid-list"), s = y(rn), i = y("div"), l = y(te), u = (g, h = null) => pt(
    v(
      e,
      k((m) => m[g]),
      ot()
    ),
    h
  ), f = y(false), d = y(false);
  return z(W(d), f), {
    components: e,
    computeItemKey: s,
    context: n,
    FooterComponent: u("Footer"),
    HeaderComponent: u("Header"),
    headerFooterTag: i,
    itemClassName: o,
    ItemComponent: u("Item", "div"),
    itemContent: t,
    listClassName: r2,
    ListComponent: u("List", "div"),
    readyStateChanged: f,
    reportReadyState: d,
    ScrollerComponent: u("Scroller", "div"),
    scrollerRef: l,
    ScrollSeekPlaceholder: u("ScrollSeekPlaceholder", "div")
  };
});
var Ur = /* @__PURE__ */ Y(
  ([t, e]) => ({ ...t, ...e }),
  st(Dr, $r)
);
var jr = /* @__PURE__ */ E.memo(function() {
  const e = nt("gridState"), n = nt("listClassName"), o = nt("itemClassName"), r2 = nt("itemContent"), s = nt("computeItemKey"), i = nt("isSeeking"), l = bt("scrollHeight"), u = nt("ItemComponent"), f = nt("ListComponent"), d = nt("ScrollSeekPlaceholder"), g = nt("context"), h = bt("itemDimensions"), m = bt("gap"), x = nt("log"), b = nt("stateRestoreInProgress"), I = bt("reportReadyState"), T = Ft(
    E.useMemo(
      () => (c) => {
        const C = c.parentElement.parentElement.scrollHeight;
        l(C);
        const S = c.firstChild;
        S !== null && h({ height: le(S, "height"), width: le(S, "width") }), m({
          column: An("column-gap", getComputedStyle(c).columnGap, x),
          row: An("row-gap", getComputedStyle(c).rowGap, x)
        });
      },
      [l, h, m, x]
    ),
    true,
    false
  );
  return Le(() => {
    e.itemHeight > 0 && e.itemWidth > 0 && I(true);
  }, [e]), b ? null : /* @__PURE__ */ A(
    f,
    {
      className: n,
      ref: T,
      ...rt(f, g),
      "data-testid": "virtuoso-item-list",
      style: { paddingBottom: e.offsetBottom, paddingTop: e.offsetTop },
      children: e.items.map((c) => {
        const C = s(c.index, c.data, g);
        return i ? /* @__PURE__ */ A(
          d,
          {
            ...rt(d, g),
            height: e.itemHeight,
            index: c.index,
            width: e.itemWidth
          },
          C
        ) : /* @__PURE__ */ jt(
          u,
          {
            ...rt(u, g),
            className: o,
            "data-index": c.index,
            key: C
          },
          r2(c.index, c.data, g)
        );
      })
    }
  );
});
var Kr = E.memo(function() {
  const e = nt("HeaderComponent"), n = bt("headerHeight"), o = nt("headerFooterTag"), r2 = Ft(
    E.useMemo(
      () => (i) => {
        n(Lt(i, "height"));
      },
      [n]
    ),
    true,
    false
  ), s = nt("context");
  return e != null ? /* @__PURE__ */ A(o, { ref: r2, children: /* @__PURE__ */ A(e, { ...rt(e, s) }) }) : null;
});
var qr = E.memo(function() {
  const e = nt("FooterComponent"), n = bt("footerHeight"), o = nt("headerFooterTag"), r2 = Ft(
    E.useMemo(
      () => (i) => {
        n(Lt(i, "height"));
      },
      [n]
    ),
    true,
    false
  ), s = nt("context");
  return e != null ? /* @__PURE__ */ A(o, { ref: r2, children: /* @__PURE__ */ A(e, { ...rt(e, s) }) }) : null;
});
var Yr = ({ children: t }) => {
  const e = E.useContext(ao), n = bt("itemDimensions"), o = bt("viewportDimensions"), r2 = Ft(
    E.useMemo(
      () => (s) => {
        o({ height: le(s, "height"), width: le(s, "width") });
      },
      [o]
    ),
    true,
    false
  );
  return E.useEffect(() => {
    e && (o({ height: e.viewportHeight, width: e.viewportWidth }), n({ height: e.itemHeight, width: e.itemWidth }));
  }, [e, o, n]), /* @__PURE__ */ A("div", { ref: r2, style: Be(false), children: t });
};
var Zr = ({ children: t }) => {
  const e = E.useContext(ao), n = bt("windowViewportRect"), o = bt("itemDimensions"), r2 = nt("customScrollParent"), s = nt("useWindowScroll"), i = Ye(n, r2, false);
  return E.useEffect(() => {
    e && (o({ height: e.itemHeight, width: e.itemWidth }), n({ listHeight: 0, offsetTop: 0, visibleHeight: e.viewportHeight, visibleWidth: e.viewportWidth }));
  }, [e, n, o]), /* @__PURE__ */ A("div", { ref: i, style: sn(false, s), children: t });
};
var Xr = /* @__PURE__ */ E.memo(function({ ...e }) {
  const n = nt("useWindowScroll"), o = nt("customScrollParent"), r2 = o || n ? ts : Qr, s = o || n ? Zr : Yr, i = nt("context");
  return /* @__PURE__ */ A(r2, { ...e, ...rt(r2, i), children: /* @__PURE__ */ Kt(s, { children: [
    /* @__PURE__ */ A(Kr, {}),
    /* @__PURE__ */ A(jr, {}),
    /* @__PURE__ */ A(qr, {})
  ] }) });
});
var {
  Component: Jr,
  useEmitter: So,
  useEmitterValue: nt,
  usePublisher: bt
} = /* @__PURE__ */ nn(
  Ur,
  {
    optional: {
      context: "context",
      totalCount: "totalCount",
      overscan: "overscan",
      itemContent: "itemContent",
      components: "components",
      computeItemKey: "computeItemKey",
      data: "data",
      initialItemCount: "initialItemCount",
      scrollSeekConfiguration: "scrollSeekConfiguration",
      headerFooterTag: "headerFooterTag",
      listClassName: "listClassName",
      itemClassName: "itemClassName",
      useWindowScroll: "useWindowScroll",
      customScrollParent: "customScrollParent",
      scrollerRef: "scrollerRef",
      logLevel: "logLevel",
      restoreStateFrom: "restoreStateFrom",
      initialTopMostItemIndex: "initialTopMostItemIndex",
      increaseViewportBy: "increaseViewportBy"
    },
    methods: {
      scrollTo: "scrollTo",
      scrollBy: "scrollBy",
      scrollToIndex: "scrollToIndex"
    },
    events: {
      isScrolling: "isScrolling",
      endReached: "endReached",
      startReached: "startReached",
      rangeChanged: "rangeChanged",
      atBottomStateChange: "atBottomStateChange",
      atTopStateChange: "atTopStateChange",
      stateChanged: "stateChanged",
      readyStateChanged: "readyStateChanged"
    }
  },
  Xr
);
var Qr = /* @__PURE__ */ ln({ useEmitter: So, useEmitterValue: nt, usePublisher: bt });
var ts = /* @__PURE__ */ cn({ useEmitter: So, useEmitterValue: nt, usePublisher: bt });
function An(t, e, n) {
  return e !== "normal" && e?.endsWith("px") !== true && n(`${t} was not resolved to pixel value correctly`, e, gt.WARN), e === "normal" ? 0 : parseInt(e ?? "0", 10);
}

// src/FileExplorer/SearchResultsList.tsx
init_deps();
init_deps();
import { Fragment as Fragment2, jsx as jsx15, jsxs as jsxs13 } from "react/jsx-runtime";
function getRelativePath(fullPath, basePath) {
  if (fullPath.startsWith(basePath)) {
    const relative = fullPath.slice(basePath.length);
    return relative.startsWith("/") || relative.startsWith("\\") ? relative.slice(1) : relative;
  }
  return fullPath;
}
function getDirectoryPath(relativePath) {
  const lastSlashIndex = Math.max(
    relativePath.lastIndexOf("/"),
    relativePath.lastIndexOf("\\")
  );
  if (lastSlashIndex >= 0) {
    return relativePath.substring(0, lastSlashIndex + 1);
  }
  return "";
}
var formatFileSize2 = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};
var FileItem = memo2(({ file, currentPath, onClick, onKeyDown, onContextMenu }) => {
  const { t } = useTranslation("fileExplorer");
  const relativePath = getRelativePath(file.path, currentPath);
  const pathOnly = getDirectoryPath(relativePath);
  return /* @__PURE__ */ jsx15(
    "div",
    {
      className: "px-2 py-1.5 cursor-pointer rounded transition-colors hover:bg-background-hover group",
      onClick: () => onClick(file),
      onKeyDown: (e) => onKeyDown(e, file),
      onContextMenu: (e) => onContextMenu(e, file),
      role: "button",
      tabIndex: 0,
      "aria-label": `${file.is_dir ? t("ariaLabel.folder", { name: file.name }) : t("ariaLabel.file", { name: file.name })}`,
      children: /* @__PURE__ */ jsxs13("div", { className: "flex items-start gap-2", children: [
        file.is_dir ? /* @__PURE__ */ jsx15(Folder, { className: "mt-0.5 w-4 h-4 flex-shrink-0 text-warning" }) : /* @__PURE__ */ jsx15(
          FileIcon,
          {
            file,
            className: "mt-0.5 w-4 h-4 flex-shrink-0"
          }
        ),
        /* @__PURE__ */ jsxs13("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx15(
            "div",
            {
              className: "text-sm text-text-primary truncate",
              title: file.name,
              children: file.name
            }
          ),
          pathOnly && /* @__PURE__ */ jsx15(
            "div",
            {
              className: "text-xs text-text-tertiary truncate mt-0.5",
              title: pathOnly,
              children: pathOnly
            }
          ),
          !file.is_dir && file.size && /* @__PURE__ */ jsx15("div", { className: "text-xs text-text-tertiary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity", children: formatFileSize2(file.size) })
        ] })
      ] })
    }
  );
});
FileItem.displayName = "FileItem";
var DirectorySeparator = memo2(() => /* @__PURE__ */ jsx15("div", { className: "px-2 my-1 border-t border-border-subtle" }));
DirectorySeparator.displayName = "DirectorySeparator";
var SearchResultsList = memo2(({ results }) => {
  const { t } = useTranslation("fileExplorer");
  const { select_file, current_path } = useFileExplorerStore();
  const { openFile } = useFileEditorStore();
  const [contextMenu, setContextMenu] = useState5({ visible: false, x: 0, y: 0, file: null });
  const handleClick = async (file) => {
    select_file(file);
    if (!file.is_dir) {
      await openFile(file.path, file.name);
    }
  };
  const handleKeyDown = (e, file) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(file);
    }
  };
  const closeContextMenu = useCallback3(() => {
    setContextMenu({ visible: false, x: 0, y: 0, file: null });
  }, []);
  const handleContextMenu = useCallback3((e, file) => {
    e.preventDefault();
    e.stopPropagation();
    select_file(file);
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file
    });
  }, [select_file]);
  const menuItems = useMemo(() => {
    const file = contextMenu.file;
    if (!file) return [];
    const items = [
      {
        id: "open",
        label: file.is_dir ? t("searchResults.openFolder") : t("searchResults.openFile"),
        icon: "",
        action: async () => {
          if (!file.is_dir) {
            await openFile(file.path, file.name);
          }
        }
      }
    ];
    if (isHtmlFile(file)) {
      items.push({
        id: "open-in-browser",
        label: t("searchResults.openInBrowser"),
        icon: "",
        action: async () => {
          await openInDefaultApp(file.path);
        }
      });
    }
    return items;
  }, [contextMenu.file, openFile, t]);
  if (results.length === 0) {
    return /* @__PURE__ */ jsxs13("div", { className: "flex flex-col items-center justify-center py-8 text-text-tertiary", children: [
      /* @__PURE__ */ jsx15("svg", { className: "w-8 h-8 mb-2", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: /* @__PURE__ */ jsx15("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" }) }),
      /* @__PURE__ */ jsx15("div", { className: "text-sm", children: t("searchResults.noMatch") })
    ] });
  }
  const directories = results.filter((f) => f.is_dir);
  const files = results.filter((f) => !f.is_dir);
  const allItems = [
    ...directories.map((d) => ({ type: "directory", data: d })),
    ...directories.length > 0 && files.length > 0 ? [{ type: "separator" }] : [],
    ...files.map((f) => ({ type: "file", data: f }))
  ];
  const VIRTUAL_SCROLL_THRESHOLD = 50;
  const shouldUseVirtualScroll = results.length >= VIRTUAL_SCROLL_THRESHOLD;
  if (!shouldUseVirtualScroll) {
    return /* @__PURE__ */ jsxs13("div", { className: "py-1 min-w-auto", children: [
      allItems.map((item, index) => {
        if (item.type === "separator") {
          return /* @__PURE__ */ jsx15(DirectorySeparator, {}, `sep-${index}`);
        }
        if (!item.data) return null;
        return /* @__PURE__ */ jsx15(
          FileItem,
          {
            file: item.data,
            currentPath: current_path,
            onClick: handleClick,
            onKeyDown: handleKeyDown,
            onContextMenu: handleContextMenu
          },
          item.data.path
        );
      }),
      /* @__PURE__ */ jsx15(
        ContextMenu,
        {
          visible: contextMenu.visible,
          x: contextMenu.x,
          y: contextMenu.y,
          items: menuItems,
          onClose: closeContextMenu
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs13(Fragment2, { children: [
    /* @__PURE__ */ jsx15(
      ss,
      {
        style: { height: "100%" },
        data: allItems,
        itemContent: (_index, item) => {
          if (item.type === "separator") {
            return /* @__PURE__ */ jsx15(DirectorySeparator, {});
          }
          if (!item.data) return null;
          return /* @__PURE__ */ jsx15(
            FileItem,
            {
              file: item.data,
              currentPath: current_path,
              onClick: handleClick,
              onKeyDown: handleKeyDown,
              onContextMenu: handleContextMenu
            }
          );
        },
        defaultItemHeight: 60
      }
    ),
    /* @__PURE__ */ jsx15(
      ContextMenu,
      {
        visible: contextMenu.visible,
        x: contextMenu.x,
        y: contextMenu.y,
        items: menuItems,
        onClose: closeContextMenu
      }
    )
  ] });
});
SearchResultsList.displayName = "SearchResultsList";

// src/FileExplorer/FileTree.tsx
init_deps();
import { jsx as jsx16, jsxs as jsxs14 } from "react/jsx-runtime";
var FileTree = memo3(({ files, className = "" }) => {
  const {
    selected_file,
    expanded_folders,
    loading_folders,
    search_query,
    search_results,
    file_tree
  } = useFileExplorerStore();
  const fileTree = files || file_tree;
  const filterFiles2 = useCallback4((filesToFilter, query) => {
    if (!query.trim()) return filesToFilter;
    const lowerQuery = query.toLowerCase();
    return filesToFilter.reduce((acc, file) => {
      const nameMatches = file.name.toLowerCase().includes(lowerQuery);
      if (file.is_dir) {
        const filteredChildren = file.children ? filterFiles2(file.children, query) : [];
        if (nameMatches || filteredChildren.length > 0) {
          acc.push({
            ...file,
            children: filteredChildren.length > 0 ? filteredChildren : file.children
          });
        }
      } else if (nameMatches) {
        acc.push(file);
      }
      return acc;
    }, []);
  }, []);
  const filteredFiles = useMemo2(
    () => search_query ? filterFiles2(fileTree, search_query) : fileTree,
    [fileTree, search_query, filterFiles2]
  );
  if (search_query && search_results) {
    return /* @__PURE__ */ jsx16(SearchResultsList, { results: search_results });
  }
  if (filteredFiles.length === 0) {
    return /* @__PURE__ */ jsxs14("div", { className: `flex flex-col items-center justify-center py-8 text-text-tertiary ${className}`, children: [
      /* @__PURE__ */ jsx16("svg", { className: "w-8 h-8 mb-2", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: /* @__PURE__ */ jsx16("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" }) }),
      /* @__PURE__ */ jsx16("div", { className: "text-sm", children: search_query ? "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u6587\u4EF6" : "\u6B64\u76EE\u5F55\u4E3A\u7A7A" })
    ] });
  }
  return /* @__PURE__ */ jsx16("div", { className: `py-1 min-w-max ${className}`, children: filteredFiles.map((file) => /* @__PURE__ */ jsx16(
    FileTreeNode,
    {
      file,
      level: 0,
      isExpanded: expanded_folders.has(normalizePath2(file.path)),
      isSelected: selected_file?.path === file.path,
      expandedFolders: expanded_folders,
      loadingFolders: loading_folders
    },
    file.path
  )) });
});
FileTree.displayName = "FileTree";

// src/FileExplorer/SearchBar.tsx
import { useState as useState6, useEffect as useEffect8, useRef as useRef6 } from "react";
init_deps();
import { Fragment as Fragment3, jsx as jsx17, jsxs as jsxs15 } from "react/jsx-runtime";
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState6(value);
  useEffect8(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}
function SearchBar() {
  const { t } = useTranslation("fileExplorer");
  const {
    search_query,
    set_search_query,
    search_results_count,
    search_is_deep_loading
  } = useFileExplorerStore();
  const [localQuery, setLocalQuery] = useState6(search_query);
  const previousDebouncedQuery = useRef6("");
  useEffect8(() => {
    setLocalQuery(search_query);
    previousDebouncedQuery.current = search_query;
  }, [search_query]);
  const debouncedQuery = useDebounce(localQuery, 300);
  useEffect8(() => {
    if (previousDebouncedQuery.current !== debouncedQuery) {
      previousDebouncedQuery.current = debouncedQuery;
      set_search_query(debouncedQuery);
    }
  }, [debouncedQuery, set_search_query]);
  const handleChange = (e) => {
    setLocalQuery(e.target.value);
  };
  const handleClear = () => {
    setLocalQuery("");
    set_search_query("");
  };
  return /* @__PURE__ */ jsxs15("form", { onSubmit: (e) => e.preventDefault(), className: "p-2 border-b border-border", children: [
    /* @__PURE__ */ jsxs15("div", { className: "relative", children: [
      /* @__PURE__ */ jsx17("div", { className: "absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none", children: /* @__PURE__ */ jsx17("svg", { className: "w-4 h-4 text-text-tertiary", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx17("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" }) }) }),
      /* @__PURE__ */ jsx17(
        "input",
        {
          type: "text",
          value: localQuery,
          onChange: handleChange,
          placeholder: t("searchPlaceholder"),
          className: "w-full pl-10 pr-10 py-1.5 bg-background-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        }
      ),
      localQuery && /* @__PURE__ */ jsx17(
        "button",
        {
          type: "button",
          onClick: handleClear,
          className: "absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text-primary transition-colors",
          children: /* @__PURE__ */ jsx17("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx17("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })
        }
      )
    ] }),
    search_query && /* @__PURE__ */ jsx17("div", { className: "mt-1 text-xs text-text-tertiary flex items-center gap-1", children: search_is_deep_loading ? /* @__PURE__ */ jsxs15(Fragment3, { children: [
      /* @__PURE__ */ jsx17("svg", { className: "w-3 h-3 animate-spin", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsx17("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" }) }),
      /* @__PURE__ */ jsx17("span", { children: t("searching", { count: search_results_count }) })
    ] }) : /* @__PURE__ */ jsx17("span", { children: t("searchResults", { count: search_results_count }) }) })
  ] });
}

// src/WorkspaceSearchInput.tsx
import { useState as useState7, useEffect as useEffect9, useRef as useRef7 } from "react";

// src/cn.ts
function cn2(...inputs) {
  return clsx(inputs);
}

// src/WorkspaceSearchInput.tsx
import { jsx as jsx18, jsxs as jsxs16 } from "react/jsx-runtime";
function useDebounce2(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState7(value);
  useEffect9(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}
function WorkspaceSearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = false
}) {
  const { t } = useTranslation("workspace");
  const [localValue, setLocalValue] = useState7(value);
  const inputRef = useRef7(null);
  const debouncedValue = useDebounce2(localValue, 300);
  useEffect9(() => {
    setLocalValue(value);
  }, [value]);
  useEffect9(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, onChange, value]);
  useEffect9(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);
  const handleClear = () => {
    setLocalValue("");
    onChange("");
  };
  return /* @__PURE__ */ jsxs16("div", { className: cn2("relative", className), children: [
    /* @__PURE__ */ jsx18("div", { className: "absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none", children: /* @__PURE__ */ jsx18(Search, { className: "w-3.5 h-3.5 text-text-tertiary" }) }),
    /* @__PURE__ */ jsx18(
      "input",
      {
        ref: inputRef,
        type: "text",
        value: localValue,
        onChange: (e) => setLocalValue(e.target.value),
        placeholder: placeholder || t("search.placeholder"),
        className: cn2(
          "w-full pl-8 pr-7 py-1.5 text-sm",
          "bg-background-surface border border-border rounded-lg",
          "text-text-primary placeholder:text-text-tertiary",
          "focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
          "transition-colors"
        )
      }
    ),
    localValue && /* @__PURE__ */ jsx18(
      "button",
      {
        type: "button",
        onClick: handleClear,
        className: "absolute inset-y-0 right-0 pr-2 flex items-center text-text-tertiary hover:text-text-primary transition-colors",
        children: /* @__PURE__ */ jsx18(X, { className: "w-3.5 h-3.5" })
      }
    )
  ] });
}
function useWorkspaceFilter(workspaces, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return workspaces;
  }
  return workspaces.filter((workspace) => {
    const nameMatch = workspace.name.toLowerCase().includes(normalizedQuery);
    const pathMatch = workspace.path.toLowerCase().includes(normalizedQuery);
    return nameMatch || pathMatch;
  });
}

// src/fileExplorerToolbarSlot.ts
var log4 = createLogger2("FileExplorerToolbarSlot");
var FileExplorerToolbarSlot = class {
  items = /* @__PURE__ */ new Map();
  /**
   * 注册工具栏注入项。同一 itemId 重复注册覆盖旧值。
   */
  register(itemId, pluginId, component, order = 100) {
    this.items.set(itemId, { pluginId, component, order });
    log4.debug(`Registered file explorer toolbar item: ${itemId} (plugin: ${pluginId})`);
  }
  unregister(itemId) {
    this.items.delete(itemId);
  }
  unregisterAll(pluginId) {
    for (const [itemId, entry] of this.items) {
      if (entry.pluginId === pluginId) {
        this.items.delete(itemId);
      }
    }
  }
  listItems() {
    return Array.from(this.items.entries()).map(([itemId, entry]) => ({ itemId, ...entry })).sort((a, b) => a.order - b.order);
  }
  hasItems() {
    return this.items.size > 0;
  }
};
var fileExplorerToolbarSlot = new FileExplorerToolbarSlot();

// src/FileExplorer/FileExplorer.tsx
import { Fragment as Fragment4, jsx as jsx19, jsxs as jsxs17 } from "react/jsx-runtime";
function FileExplorer() {
  const { t } = useTranslation("fileExplorer");
  const { t: tc } = useTranslation("common");
  const { t: tw } = useTranslation("workspace");
  const [showViewingMenu, setShowViewingMenu] = useState8(false);
  const [showNewMenu, setShowNewMenu] = useState8(false);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState8("");
  const [inputDialog, setInputDialog] = useState8({ visible: false, title: "", message: "", defaultValue: "", action: "create-file" });
  const [contextMenu, setContextMenu] = useState8({ visible: false, x: 0, y: 0 });
  const {
    current_path,
    loading,
    is_refreshing,
    error,
    load_directory,
    refresh_directory,
    clear_error,
    create_file,
    create_directory,
    paste_file,
    save_dropped_file,
    clipboard
  } = useFileExplorerStore();
  const toast = useToastStore();
  const {
    getCurrentWorkspace,
    currentWorkspaceId,
    workspaces,
    getAllAccessibleWorkspaces,
    setViewingWorkspace,
    getViewingWorkspace
  } = useWorkspaceStore();
  const { loadCustomCommands } = useCommandStore();
  useEffect10(() => {
    const offChange = eventBus.on("workspace-changed", (event) => {
      const { workspaceId: newWorkspaceId } = event;
      const viewingWorkspace2 = getViewingWorkspace();
      if (!viewingWorkspace2 || viewingWorkspace2.id === newWorkspaceId) {
        const currentWorkspace2 = getCurrentWorkspace();
        if (currentWorkspace2) {
          load_directory(currentWorkspace2.path);
          loadCustomCommands(currentWorkspace2.path);
        }
      }
    });
    return () => {
      offChange();
    };
  }, [load_directory, getCurrentWorkspace, getViewingWorkspace, loadCustomCommands]);
  useEffect10(() => {
    const handleKeyDown = (event) => {
      if (event.key === "F5" || (event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        refresh_directory();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [refresh_directory]);
  useEffect10(() => {
    const cleanup = initFileWatcherListener();
    const viewingWorkspace2 = getViewingWorkspace();
    const targetWorkspace = viewingWorkspace2 || getCurrentWorkspace();
    if (targetWorkspace?.path) {
      startFileWatcher(targetWorkspace.path);
    }
    return () => {
      stopFileWatcher();
      cleanup();
    };
  }, [getCurrentWorkspace, getViewingWorkspace]);
  useEffect10(() => {
    if (current_path) {
      startFileWatcher(current_path);
    }
  }, [current_path]);
  const targetPath = useWorkspaceStore((s) => {
    const id = s.viewingWorkspaceId ?? s.currentWorkspaceId;
    if (!id) return null;
    return s.workspaces.find((w) => w.id === id)?.path ?? null;
  });
  useEffect10(() => {
    if (targetPath && current_path !== targetPath) {
      load_directory(targetPath);
      loadCustomCommands(targetPath);
    }
  }, [targetPath, current_path, load_directory, loadCustomCommands]);
  const handleRefresh = useCallback5(() => {
    clear_error();
    refresh_directory();
  }, [clear_error, refresh_directory]);
  const handleToolbarContextMenu = useCallback5((e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY
    });
  }, []);
  const closeContextMenu = useCallback5(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);
  const getContextMenuItems = useCallback5(() => {
    const items = [
      {
        id: "create-file",
        label: t("newFile"),
        icon: /* @__PURE__ */ jsx19(IconFile, { size: 14 }),
        action: () => {
          setInputDialog({
            visible: true,
            title: t("newFile"),
            message: t("contextMenu.newFile") + ":",
            defaultValue: "",
            action: "create-file"
          });
          closeContextMenu();
        }
      },
      {
        id: "create-folder",
        label: t("newFolder"),
        icon: /* @__PURE__ */ jsx19(IconFolder, { size: 14 }),
        action: () => {
          setInputDialog({
            visible: true,
            title: t("newFolder"),
            message: t("contextMenu.newFolder") + ":",
            defaultValue: "",
            action: "create-folder"
          });
          closeContextMenu();
        }
      },
      { id: "separator-paste", label: "-", icon: void 0, action: () => {
      } },
      {
        id: "paste",
        label: t("contextMenu.paste"),
        icon: /* @__PURE__ */ jsx19(IconFolder, { size: 14 }),
        disabled: !clipboard || !current_path,
        action: async () => {
          if (!clipboard || !current_path) return;
          await paste_file(current_path);
          toast.success(t("toast.pasted"), clipboard.sourceFile.name);
          closeContextMenu();
        }
      },
      { id: "separator", label: "-", icon: void 0, action: () => {
      } },
      {
        id: "refresh",
        label: t("actions.refresh"),
        icon: /* @__PURE__ */ jsx19("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx19("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" }) }),
        action: () => {
          handleRefresh();
          closeContextMenu();
        }
      }
    ];
    return items;
  }, [clipboard, closeContextMenu, current_path, handleRefresh, paste_file, t, toast]);
  const handleInputDialogConfirm = async (value) => {
    if (!value || !current_path) return;
    if (inputDialog.action === "create-file") {
      if (isValidFileName(value)) {
        const fullPath = joinPath(current_path, value);
        await create_file(fullPath, "");
        setInputDialog({ ...inputDialog, visible: false });
      }
    } else if (inputDialog.action === "create-folder") {
      if (isValidFileName(value)) {
        const fullPath = joinPath(current_path, value);
        await create_directory(fullPath);
        setInputDialog({ ...inputDialog, visible: false });
      }
    }
  };
  const validateInput = (value) => {
    if (!value || value.trim().length === 0) {
      return t("errors.createFailed");
    }
    if (!isValidFileName(value)) {
      return t("errors.createFailed");
    }
    return null;
  };
  const handleDropFiles = useCallback5(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!current_path) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      await save_dropped_file(current_path, file);
    }
    toast.success(t("toast.dropped"), files.length === 1 ? files[0].name : String(files.length));
  }, [current_path, save_dropped_file, t, toast]);
  const handleDragOver = useCallback5((e) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);
  const viewingWorkspace = getViewingWorkspace();
  const accessibleWorkspaces = getAllAccessibleWorkspaces();
  const filteredWorkspaces = useWorkspaceFilter(accessibleWorkspaces, workspaceSearchQuery);
  const handleSwitchViewingWorkspace = useCallback5(async (workspaceId) => {
    setViewingWorkspace(workspaceId);
    setShowViewingMenu(false);
    setWorkspaceSearchQuery("");
    const targetWorkspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : getCurrentWorkspace();
    if (targetWorkspace) {
      load_directory(targetWorkspace.path);
      loadCustomCommands(targetWorkspace.path);
    }
  }, [setViewingWorkspace, workspaces, getCurrentWorkspace, load_directory, loadCustomCommands]);
  const currentWorkspace = getCurrentWorkspace();
  const toolbarSlotItems = useState8(() => fileExplorerToolbarSlot.listItems())[0];
  return /* @__PURE__ */ jsxs17(
    "div",
    {
      className: "h-full flex flex-col",
      onDragOver: handleDragOver,
      onDrop: handleDropFiles,
      children: [
        /* @__PURE__ */ jsxs17("div", { className: "border-b border-border bg-background-surface", children: [
          /* @__PURE__ */ jsx19("div", { className: "px-3 py-2", children: /* @__PURE__ */ jsxs17("div", { className: "relative", children: [
            /* @__PURE__ */ jsxs17(
              "button",
              {
                onClick: () => setShowViewingMenu(!showViewingMenu),
                className: "w-full flex items-center justify-between gap-2 text-sm font-medium text-text-primary hover:text-primary transition-colors",
                title: `${tc("labels.viewing")}: ${viewingWorkspace?.name || currentWorkspace?.name || tc("labels.noWorkspaceSelected")}`,
                children: [
                  /* @__PURE__ */ jsx19("span", { className: "flex items-center gap-1.5 truncate", children: viewingWorkspace?.id === currentWorkspaceId || !viewingWorkspace ? /* @__PURE__ */ jsxs17(Fragment4, { children: [
                    /* @__PURE__ */ jsx19("span", { className: "w-1.5 h-1.5 rounded-full bg-primary shrink-0" }),
                    /* @__PURE__ */ jsx19("span", { className: "truncate", children: viewingWorkspace?.name || currentWorkspace?.name || tc("labels.noWorkspaceSelected") })
                  ] }) : /* @__PURE__ */ jsxs17(Fragment4, { children: [
                    /* @__PURE__ */ jsx19("span", { className: "w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" }),
                    /* @__PURE__ */ jsx19("span", { className: "truncate", children: viewingWorkspace?.name })
                  ] }) }),
                  accessibleWorkspaces.length > 1 && /* @__PURE__ */ jsx19(
                    "svg",
                    {
                      className: `shrink-0 w-3.5 h-3.5 transition-transform ${showViewingMenu ? "rotate-180" : ""}`,
                      fill: "none",
                      viewBox: "0 0 24 24",
                      stroke: "currentColor",
                      strokeWidth: 2,
                      children: /* @__PURE__ */ jsx19("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" })
                    }
                  )
                ]
              }
            ),
            showViewingMenu && accessibleWorkspaces.length > 1 && /* @__PURE__ */ jsxs17(Fragment4, { children: [
              /* @__PURE__ */ jsx19(
                "div",
                {
                  className: "fixed inset-0 z-10",
                  onClick: () => {
                    setShowViewingMenu(false);
                    setWorkspaceSearchQuery("");
                  }
                }
              ),
              /* @__PURE__ */ jsxs17("div", { className: "absolute left-0 right-0 top-full mt-1 bg-background-elevated border border-border rounded-lg shadow-lg z-20 overflow-hidden", children: [
                accessibleWorkspaces.length > 3 && /* @__PURE__ */ jsx19("div", { className: "p-2 border-b border-border-subtle", children: /* @__PURE__ */ jsx19(
                  WorkspaceSearchInput,
                  {
                    value: workspaceSearchQuery,
                    onChange: setWorkspaceSearchQuery,
                    autoFocus: true
                  }
                ) }),
                /* @__PURE__ */ jsx19("div", { className: "max-h-[240px] overflow-y-auto", children: filteredWorkspaces.length === 0 ? /* @__PURE__ */ jsx19("div", { className: "py-3 text-center text-sm text-text-tertiary", children: tw("search.noResults") }) : /* @__PURE__ */ jsxs17(Fragment4, { children: [
                  /* @__PURE__ */ jsxs17(
                    "button",
                    {
                      onClick: () => handleSwitchViewingWorkspace(null),
                      className: `w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${!viewingWorkspace || viewingWorkspace.id === currentWorkspaceId ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text-primary hover:bg-background-hover"}`,
                      children: [
                        /* @__PURE__ */ jsx19("span", { className: "w-2 h-2 rounded-full bg-primary shrink-0" }),
                        /* @__PURE__ */ jsxs17("div", { className: "flex-1 min-w-0", children: [
                          /* @__PURE__ */ jsx19("div", { className: "font-medium truncate", children: currentWorkspace?.name || tc("labels.noWorkspaceSelected") }),
                          currentWorkspace?.path && /* @__PURE__ */ jsx19("div", { className: "text-xs truncate text-text-tertiary", children: currentWorkspace.path })
                        ] }),
                        (!viewingWorkspace || viewingWorkspace.id === currentWorkspaceId) && /* @__PURE__ */ jsx19("svg", { className: "w-4 h-4 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx19("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) })
                      ]
                    }
                  ),
                  filteredWorkspaces.filter((w) => w.id !== currentWorkspaceId).map((workspace) => /* @__PURE__ */ jsxs17(
                    "button",
                    {
                      onClick: () => handleSwitchViewingWorkspace(workspace.id),
                      className: `w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${viewingWorkspace?.id === workspace.id ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text-primary hover:bg-background-hover"}`,
                      children: [
                        /* @__PURE__ */ jsx19("span", { className: "w-2 h-2 rounded-full bg-primary/50 shrink-0" }),
                        /* @__PURE__ */ jsxs17("div", { className: "flex-1 min-w-0", children: [
                          /* @__PURE__ */ jsx19("div", { className: "font-medium truncate", children: workspace.name }),
                          /* @__PURE__ */ jsx19("div", { className: "text-xs truncate text-text-tertiary", children: workspace.path })
                        ] }),
                        viewingWorkspace?.id === workspace.id && /* @__PURE__ */ jsx19("svg", { className: "w-4 h-4 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: /* @__PURE__ */ jsx19("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) })
                      ]
                    },
                    workspace.id
                  ))
                ] }) })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs17(
            "div",
            {
              className: "flex items-center justify-between px-3 py-2 border-t border-border-subtle",
              onContextMenu: handleToolbarContextMenu,
              children: [
                /* @__PURE__ */ jsxs17("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxs17("div", { className: "relative", children: [
                    /* @__PURE__ */ jsx19(
                      "button",
                      {
                        onClick: () => setShowNewMenu(!showNewMenu),
                        className: "p-1.5 rounded-lg transition-all duration-200 text-text-secondary hover:text-text-primary hover:bg-background-hover",
                        title: t("newFile"),
                        children: /* @__PURE__ */ jsx19(IconPlus, { size: 16 })
                      }
                    ),
                    showNewMenu && /* @__PURE__ */ jsxs17(Fragment4, { children: [
                      /* @__PURE__ */ jsx19(
                        "div",
                        {
                          className: "fixed inset-0 z-10",
                          onClick: () => setShowNewMenu(false)
                        }
                      ),
                      /* @__PURE__ */ jsxs17("div", { className: "absolute left-0 top-full mt-1 bg-background-elevated border border-border rounded-lg shadow-lg z-20 overflow-hidden min-w-[120px]", children: [
                        /* @__PURE__ */ jsxs17(
                          "button",
                          {
                            onClick: () => {
                              setInputDialog({
                                visible: true,
                                title: t("newFile"),
                                message: t("contextMenu.newFile") + ":",
                                defaultValue: "",
                                action: "create-file"
                              });
                              setShowNewMenu(false);
                            },
                            className: "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors",
                            children: [
                              /* @__PURE__ */ jsx19(IconFile, { size: 14 }),
                              /* @__PURE__ */ jsx19("span", { children: t("newFile") })
                            ]
                          }
                        ),
                        /* @__PURE__ */ jsxs17(
                          "button",
                          {
                            onClick: () => {
                              setInputDialog({
                                visible: true,
                                title: t("newFolder"),
                                message: t("contextMenu.newFolder") + ":",
                                defaultValue: "",
                                action: "create-folder"
                              });
                              setShowNewMenu(false);
                            },
                            className: "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors",
                            children: [
                              /* @__PURE__ */ jsx19(IconFolder, { size: 14 }),
                              /* @__PURE__ */ jsx19("span", { children: t("newFolder") })
                            ]
                          }
                        )
                      ] })
                    ] })
                  ] }),
                  toolbarSlotItems.map(({ itemId, component: ItemComponent }) => /* @__PURE__ */ jsx19(ItemComponent, { workspacePath: currentWorkspace?.path }, itemId))
                ] }),
                /* @__PURE__ */ jsx19(
                  "button",
                  {
                    onClick: handleRefresh,
                    disabled: loading || is_refreshing,
                    className: `
              p-1.5 rounded-lg transition-all duration-200
              ${loading || is_refreshing ? "text-text-tertiary cursor-not-allowed" : "text-text-secondary hover:text-text-primary hover:bg-background-hover"}
            `,
                    title: t("actions.refresh") + " (F5)",
                    children: /* @__PURE__ */ jsx19(
                      "svg",
                      {
                        className: `w-4 h-4 ${is_refreshing ? "animate-spin" : ""}`,
                        fill: "none",
                        viewBox: "0 0 24 24",
                        stroke: "currentColor",
                        strokeWidth: 2,
                        children: /* @__PURE__ */ jsx19("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" })
                      }
                    )
                  }
                )
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx19(SearchBar, {}),
        error && /* @__PURE__ */ jsx19("div", { className: "mx-2 p-2 bg-danger-faint border border-danger/30 rounded-lg text-danger text-xs", children: error }),
        /* @__PURE__ */ jsx19(
          "div",
          {
            className: "flex-1 overflow-auto overflow-x-auto",
            onContextMenu: handleToolbarContextMenu,
            children: /* @__PURE__ */ jsx19(FileTree, {})
          }
        ),
        /* @__PURE__ */ jsx19(
          ContextMenu,
          {
            visible: contextMenu.visible,
            x: contextMenu.x,
            y: contextMenu.y,
            items: getContextMenuItems(),
            onClose: closeContextMenu
          }
        ),
        inputDialog.visible && /* @__PURE__ */ jsx19(
          InputDialog,
          {
            title: inputDialog.title,
            message: inputDialog.message,
            defaultValue: inputDialog.defaultValue,
            onConfirm: handleInputDialogConfirm,
            onCancel: () => setInputDialog({ ...inputDialog, visible: false }),
            validate: validateInput
          }
        )
      ]
    }
  );
}

// src/index.tsx
import { jsx as jsx20 } from "react/jsx-runtime";
function FilesDeskEntry() {
  return /* @__PURE__ */ jsx20(FileExplorer, {});
}
export {
  FilesDeskEntry as default
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

lucide-react/dist/esm/icons/chevron-down.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/chevron-right.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/copy.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/download.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file-archive.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file-braces.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file-code.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file-exclamation-point.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file-text.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/folder-open.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/folder.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/image.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/info.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/lock.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/search.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/shield-check.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/triangle-alert.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/x.js:
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
