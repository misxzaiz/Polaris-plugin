var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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

// src/host.ts
var host_exports = {};
__export(host_exports, {
  getHostInvoke: () => getHostInvoke
});
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// shared/disk-core.js
var require_disk_core = __commonJS({
  "shared/disk-core.js"(exports, module) {
    "use strict";
    var crypto = requireNodeBuiltin("crypto");
    var path = requireNodeBuiltin("path");
    function requireNodeBuiltin(name) {
      try {
        if (typeof __require === "function") return __require(name);
      } catch (_) {
      }
      return null;
    }
    var VERSION = "0.1.0";
    var TRASH_DIR = ".DiskRadarTrash";
    var MAX_WALK_DEPTH = 40;
    var SNAP_NODE_BUDGET = 4e3;
    var SNAP_CHILD_KEEP = 64;
    var JUNK_ITEM_CAP = 500;
    var K2 = {
      settings: "diskrad.settings",
      meta: "diskrad.meta",
      roots: "diskrad.roots",
      scan: "diskrad.scan",
      state: "diskrad.state",
      snap: (rid, seq) => `diskrad.snap.${rid}.${String(seq).padStart(4, "0")}`,
      snapPrefix: (rid) => `diskrad.snap.${rid}.`,
      snapPrefixAll: "diskrad.snap.",
      junk: (rid) => `diskrad.junk.${rid}`,
      junkPrefixAll: "diskrad.junk.",
      qman: (rid) => `diskrad.qman.${rid}`,
      qmanPrefixAll: "diskrad.qman.",
      cmd: (op, nonce2) => `diskrad.cmd.${op}.${nonce2}`,
      cmdPrefix: "diskrad.cmd.",
      result: (nonce2) => `diskrad.result.${nonce2}`,
      resultPrefix: "diskrad.result."
    };
    var DEFAULT_SETTINGS = {
      autoSnapshot: true,
      snapshotHours: 24,
      keepSnapshots: 12,
      autoBudgetSec: 90,
      deepBudgetMin: 10,
      quarantineDays: 14,
      extraJunkDirs: [],
      excludeNames: []
    };
    function md5(s) {
      if (!crypto) throw new Error("md5 \u4EC5\u5728 node \u73AF\u5883\uFF08\u670D\u52A1/MCP\uFF09\u53EF\u7528");
      return crypto.createHash("md5").update(String(s)).digest("hex");
    }
    function rootIdOf(resolvedPath) {
      return md5(String(resolvedPath).toLowerCase()).slice(0, 10);
    }
    function normalizeRootPath(raw) {
      let p = String(raw == null ? "" : raw).trim();
      if (p.startsWith('"') && p.endsWith('"') || p.startsWith("'") && p.endsWith("'")) {
        p = p.slice(1, -1).trim();
      }
      if (!p) return { ok: false, error: "\u8DEF\u5F84\u4E3A\u7A7A" };
      const looksAbsolute = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.startsWith("/");
      if (!looksAbsolute) return { ok: false, error: "\u9700\u8981\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 D:\\space\uFF09" };
      let resolved;
      try {
        resolved = path.resolve(p);
      } catch (_) {
        return { ok: false, error: "\u8DEF\u5F84\u65E0\u6CD5\u89E3\u6790" };
      }
      const isDriveRoot = /^[a-zA-Z]:\\?$/.test(resolved) || resolved === path.parse(resolved).root;
      if (!isDriveRoot) resolved = resolved.replace(/[\\/]+$/, "");
      if (!/^[a-zA-Z]:[\\/]/.test(resolved) && !resolved.startsWith("\\\\") && !resolved.startsWith("/")) {
        return { ok: false, error: "\u9700\u8981\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 D:\\space\uFF09" };
      }
      if (resolved.includes(TRASH_DIR)) return { ok: false, error: `\u4E0D\u80FD\u628A\u9694\u79BB\u533A\u76EE\u5F55\uFF08${TRASH_DIR}\uFF09\u767B\u8BB0\u4E3A\u6839` };
      return { ok: true, path: resolved };
    }
    function longPath(p) {
      const s = String(p);
      if (process.platform !== "win32") return s;
      if (s.startsWith("\\\\?\\")) return s;
      if (s.length < 250) return s;
      if (s.startsWith("\\\\")) return "\\\\?\\UNC\\" + s.slice(2);
      return "\\\\?\\" + s;
    }
    var JUNK_KIND_LABEL = { deps: "\u4F9D\u8D56\u5305", build: "\u6784\u5EFA\u4EA7\u7269", cache: "\u7F13\u5B58", custom: "\u81EA\u5B9A\u4E49" };
    var JUNK_RULES = [
      { names: ["node_modules"], kind: "deps", require: ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "pnpm-workspace.yaml", "deno.lock"] },
      { names: ["bower_components"], kind: "deps", require: [] },
      { names: [".venv", "venv"], kind: "deps", require: [] },
      { names: ["target"], kind: "build", require: ["Cargo.toml", "cargo.lock"] },
      { names: ["cmake-build-debug", "cmake-build-release"], kind: "build", require: [] },
      { names: ["DerivedData"], kind: "build", require: [] },
      { names: [".next", ".nuxt", ".turbo", ".parcel-cache", ".gradle", ".dart_tool"], kind: "build", require: [] },
      { names: ["dist", "build", "out"], kind: "build", require: ["package.json", "tsconfig.json", "jsconfig.json", "Cargo.toml", "pyproject.toml", "setup.py", "go.mod", "deno.json"] },
      { names: ["bin", "obj"], kind: "build", requireSuffix: [".csproj", ".fsproj", ".vbproj", ".sln", ".vcxproj"] },
      { names: ["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".ipynb_checkpoints"], kind: "cache", require: [] },
      { names: [".pnpm-store", "pnpm-cache", ".npm-cache", ".yarn-cache"], kind: "cache", require: [], note: "\u5305\u7BA1\u7406\u5668\u5168\u5C40\u7F13\u5B58\u2014\u2014\u4F18\u5148\u7528\u5176\u81EA\u5E26 prune/clean \u547D\u4EE4\u66F4\u5B89\u5168" }
    ];
    function classifyJunkDir({ name, siblings, extraDirs }) {
      if (!name || name === TRASH_DIR || name.startsWith(".DiskRadarTrash")) return { hit: false };
      const sib = Array.isArray(siblings) ? siblings : [];
      for (const rule of JUNK_RULES) {
        if (!rule.names.includes(name)) continue;
        if (rule.require && rule.require.length) {
          const hit = sib.some((s) => rule.require.includes(s));
          if (!hit) return { hit: false };
        }
        if (rule.requireSuffix && rule.requireSuffix.length) {
          const hit = sib.some((s) => rule.requireSuffix.some((suf) => s.endsWith(suf)));
          if (!hit) return { hit: false };
        }
        return { hit: true, kind: rule.kind, note: rule.note, rule: rule.names[0] };
      }
      if (Array.isArray(extraDirs) && extraDirs.includes(name)) {
        return { hit: true, kind: "custom", rule: name };
      }
      return { hit: false };
    }
    function junkItemId(relPath) {
      return md5(String(relPath).toLowerCase().replace(/[\\/]+/g, "/")).slice(0, 12);
    }
    var ITEM_ID_RE = /^[0-9a-f]{12}$/;
    function safeRelPath(rel) {
      const s = String(rel == null ? "" : rel).replace(/\\/g, "/");
      if (!s || s.startsWith("/") || /^[a-zA-Z]:/.test(s)) return null;
      const segs = s.split("/");
      for (const seg of segs) {
        if (!seg || seg === "." || seg === ".." || seg.includes("\0")) return null;
      }
      return segs.join(path.sep);
    }
    function assertUnderRoot(rootPath, targetPath) {
      const r = path.resolve(String(rootPath));
      const t = path.resolve(String(targetPath));
      if (t === r) return true;
      const withSep = r.endsWith(path.sep) ? r : r + path.sep;
      if (t.startsWith(withSep)) return true;
      throw new Error(`\u8DEF\u5F84\u8D8A\u754C\uFF1A${t} \u4E0D\u5728\u6839 ${r} \u4E4B\u4E0B`);
    }
    function trashPathFor(rootPath, itemId) {
      if (!ITEM_ID_RE.test(String(itemId))) throw new Error(`\u975E\u6CD5\u6761\u76EE id\uFF1A${itemId}`);
      const t = path.join(String(rootPath), TRASH_DIR, String(itemId));
      assertUnderRoot(rootPath, t);
      return t;
    }
    function sortTree(nodes) {
      if (!Array.isArray(nodes)) return nodes;
      nodes.sort((a, b) => (b.b || 0) - (a.b || 0) || String(a.n).localeCompare(String(b.n)));
      for (const nd of nodes) if (nd.c) sortTree(nd.c);
      return nodes;
    }
    function countTreeNodes(nodes) {
      let n = 0;
      for (const nd of nodes || []) {
        n += 1;
        if (nd.c) n += countTreeNodes(nd.c);
      }
      return n;
    }
    function pruneTree(nodes, budget) {
      let count = countTreeNodes(nodes);
      if (count <= budget) return nodes;
      const apply = (k) => {
        const walk = (list) => {
          if (!Array.isArray(list) || !list.length) return;
          list.sort((a, b) => (b.b || 0) - (a.b || 0));
          for (let i = k; i < list.length; i++) {
            if (list[i].c) {
              count -= countTreeNodes(list[i].c);
              delete list[i].c;
            }
            count -= 1;
          }
          list.length = Math.min(list.length, k);
          for (const nd of list) if (nd.c) walk(nd.c);
        };
        walk(nodes);
      };
      let keep = SNAP_CHILD_KEEP;
      while (count > budget && keep > 1) {
        apply(keep);
        if (count > budget) keep = Math.max(1, Math.floor(keep / 2));
      }
      return sortTree(nodes);
    }
    function treeTotal(nodes) {
      let s = 0;
      for (const nd of nodes || []) s += nd.b || 0;
      return s;
    }
    function growthDiff(prevDirs, curDirs, { depth = 2 } = {}) {
      const out = [];
      const diffLevel = (prev, cur, prefix, lvl) => {
        const pmap = new Map((prev || []).map((n) => [n.n, n]));
        const cmap = new Map((cur || []).map((n) => [n.n, n]));
        const names = /* @__PURE__ */ new Set([...pmap.keys(), ...cmap.keys()]);
        for (const name of names) {
          const p = pmap.get(name);
          const c = cmap.get(name);
          const from = p ? p.b || 0 : 0;
          const to = c ? c.b || 0 : 0;
          const delta = to - from;
          if (lvl < depth && p && c && p.c && c.c) {
            diffLevel(p.c, c.c, prefix ? `${prefix}/${name}` : name, lvl + 1);
          }
          if (delta === 0) continue;
          out.push({ path: prefix ? `${prefix}/${name}` : name, from, to, delta });
        }
      };
      diffLevel(prevDirs, curDirs, "", 1);
      out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      return out;
    }
    function squarify(items, x, y, w, h) {
      const rect = { x, y, w, h };
      if (!(rect.w > 0) || !(rect.h > 0) || !Array.isArray(items)) return [];
      const vals = items.map((it) => ({ name: it.name, value: Number(it.value) })).filter((it) => Number.isFinite(it.value) && it.value > 0).sort((a, b) => b.value - a.value);
      if (!vals.length) return [];
      const total = vals.reduce((s, v) => s + v.value, 0);
      const scale = rect.w * rect.h / total;
      const out = [];
      let row = [];
      let rowSum = 0;
      const worst = (sum, len) => {
        const s2 = sum * sum * scale * scale;
        const l2 = len * len;
        let worstRatio = 0;
        for (const it of row) {
          const area = it.value * scale;
          const r = Math.max(l2 * area / s2, s2 / (l2 * area));
          if (r > worstRatio) worstRatio = r;
        }
        return worstRatio;
      };
      let cx = rect.x;
      let cy = rect.y;
      let cw = rect.w;
      let ch = rect.h;
      const layoutRow = () => {
        if (!row.length) return;
        const frac = rowSum * scale / (cw * ch);
        if (cw >= ch) {
          const rw = cw * frac;
          let ry = cy;
          for (const it of row) {
            const rh = it.value * scale / rw;
            out.push({ name: it.name, value: it.value, x: cx, y: ry, w: rw, h: rh });
            ry += rh;
          }
          cx += rw;
          cw -= rw;
        } else {
          const rh = ch * frac;
          let rx = cx;
          for (const it of row) {
            const rwid = it.value * scale / rh;
            out.push({ name: it.name, value: it.value, x: rx, y: cy, w: rwid, h: rh });
            rx += rwid;
          }
          cy += rh;
          ch -= rh;
        }
        row = [];
        rowSum = 0;
      };
      for (const it of vals) {
        if (!row.length) {
          row = [it];
          rowSum = it.value;
          continue;
        }
        const len = Math.min(cw, ch);
        const before = worst(rowSum, len);
        const after = worst(rowSum + it.value, len);
        if (after <= before) {
          row.push(it);
          rowSum += it.value;
        } else {
          layoutRow();
          row = [it];
          rowSum = it.value;
        }
      }
      layoutRow();
      return out;
    }
    function parseFsutilOutput(text) {
      if (!text) return null;
      const nums = [];
      const re = /\(([\d,.]+)\s*(?:bytes|字节)\)/gi;
      let m;
      while ((m = re.exec(text)) !== null && nums.length < 4) {
        const n = Number(m[1].replace(/[,.]/g, ""));
        if (Number.isFinite(n)) nums.push(n);
      }
      if (nums.length >= 2) {
        if (/总字节|Total bytes/i.test(text) && /可用|Free/i.test(text)) {
          const totalLine = text.split(/\r?\n/).find((l) => /总字节|Total bytes/i.test(l));
          const freeLine = text.split(/\r?\n/).find((l) => /可用|Free/i.test(l));
          const pick = (line) => {
            if (!line) return NaN;
            const mm = /\(([\d,.]+)/.exec(line);
            return mm ? Number(mm[1].replace(/[,.]/g, "")) : NaN;
          };
          const total = pick(totalLine);
          const free = pick(freeLine);
          if (Number.isFinite(total) && Number.isFinite(free)) return { free, total };
        }
        return { free: nums[0], total: nums[1] };
      }
      return null;
    }
    function fmtBytes2(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return "?";
      if (v < 0) return "-" + fmtBytes2(-v);
      if (v < 1024) return `${Math.round(v)} B`;
      const units = ["KB", "MB", "GB", "TB", "PB"];
      let x = v;
      let i = -1;
      while (x >= 1024 && i < units.length - 1) {
        x /= 1024;
        i += 1;
      }
      return `${x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)} ${units[i]}`;
    }
    function fmtCount(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return "?";
      if (v < 1e4) return String(Math.round(v));
      if (v < 1e8) return `${(v / 1e4).toFixed(1)} \u4E07`;
      return `${(v / 1e8).toFixed(2)} \u4EBF`;
    }
    function fmtDelta2(n) {
      const d = Number(n) || 0;
      if (d === 0) return "\xB10";
      return (d > 0 ? "+" : "-") + fmtBytes2(Math.abs(d));
    }
    function nextSeq(keys, rid) {
      const pre = K2.snapPrefix(rid);
      let max = 0;
      for (const k of keys || []) {
        if (!k.startsWith(pre)) continue;
        const n = Number(k.slice(pre.length));
        if (Number.isFinite(n) && n > max) max = n;
      }
      return max + 1;
    }
    function pickExpiredSnaps(keys, rid, keep) {
      const pre = K2.snapPrefix(rid);
      const list = (keys || []).filter((k) => k.startsWith(pre)).map((k) => ({ k, seq: Number(k.slice(pre.length)) || 0 })).sort((a, b) => a.seq - b.seq);
      return list.length <= keep ? [] : list.slice(0, list.length - keep).map((x) => x.k);
    }
    function normalizeSettings(raw) {
      const s = { ...DEFAULT_SETTINGS };
      if (!raw || typeof raw !== "object") return s;
      s.autoSnapshot = raw.autoSnapshot !== false;
      s.snapshotHours = Math.min(24 * 30, Math.max(1, Number(raw.snapshotHours) || DEFAULT_SETTINGS.snapshotHours));
      s.keepSnapshots = Math.min(60, Math.max(3, Number(raw.keepSnapshots) || DEFAULT_SETTINGS.keepSnapshots));
      s.autoBudgetSec = Math.min(1800, Math.max(10, Number(raw.autoBudgetSec) || DEFAULT_SETTINGS.autoBudgetSec));
      s.deepBudgetMin = Math.min(120, Math.max(1, Number(raw.deepBudgetMin) || DEFAULT_SETTINGS.deepBudgetMin));
      const qd = Number(raw.quarantineDays);
      s.quarantineDays = Number.isFinite(qd) ? Math.min(365, Math.max(0, Math.floor(qd))) : DEFAULT_SETTINGS.quarantineDays;
      for (const key of ["extraJunkDirs", "excludeNames"]) {
        if (Array.isArray(raw[key])) {
          s[key] = [...new Set(raw[key].map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
        }
      }
      return s;
    }
    var LEGACY_JUNCTIONS = /* @__PURE__ */ new Set([
      "application data",
      "application shortcut",
      "documents and settings",
      "local settings",
      "my documents",
      "nethood",
      "printhood",
      "recent",
      "sendto",
      "start menu",
      "templates",
      "all users",
      "default user",
      "cookies",
      "history"
    ]);
    function isLegacyJunctionName(name) {
      return LEGACY_JUNCTIONS.has(String(name).toLowerCase());
    }
    module.exports = {
      VERSION,
      TRASH_DIR,
      MAX_WALK_DEPTH,
      SNAP_NODE_BUDGET,
      SNAP_CHILD_KEEP,
      JUNK_ITEM_CAP,
      K: K2,
      DEFAULT_SETTINGS,
      md5,
      rootIdOf,
      normalizeRootPath,
      longPath,
      JUNK_RULES,
      JUNK_KIND_LABEL,
      classifyJunkDir,
      junkItemId,
      ITEM_ID_RE,
      safeRelPath,
      assertUnderRoot,
      trashPathFor,
      sortTree,
      countTreeNodes,
      pruneTree,
      treeTotal,
      growthDiff,
      squarify,
      parseFsutilOutput,
      fmtBytes: fmtBytes2,
      fmtCount,
      fmtDelta: fmtDelta2,
      nextSeq,
      pickExpiredSnaps,
      normalizeSettings,
      LEGACY_JUNCTIONS,
      isLegacyJunctionName
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback4, useEffect as useEffect5, useState as useState6 } from "react";

// src/model.ts
init_host();
var PLUGIN_ID = "disk-radar";
var SERVICE_ID = "disk-radar-service";
async function capDispatch(target, payload) {
  const invoke = getHostInvoke();
  const res = await invoke(
    "router_dispatch",
    { req: { target, payload } }
  );
  if (!res || res.ok !== true) throw new Error(res && res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r && r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r && Array.isArray(r.keys) ? r.keys : [];
}
var FALLBACK_SETTINGS = {
  autoSnapshot: true,
  snapshotHours: 24,
  keepSnapshots: 12,
  autoBudgetSec: 90,
  deepBudgetMin: 10,
  quarantineDays: 14,
  extraJunkDirs: [],
  excludeNames: []
};
var K = {
  settings: "diskrad.settings",
  roots: "diskrad.roots",
  state: "diskrad.state",
  scan: "diskrad.scan",
  meta: "diskrad.meta",
  snapPrefix: (rid) => `diskrad.snap.${rid}.`,
  junk: (rid) => `diskrad.junk.${rid}`,
  qman: (rid) => `diskrad.qman.${rid}`
};
async function loadPanelData() {
  const [state, meta, settings, roots, scan] = await Promise.all([
    kvGet(K.state),
    kvGet(K.meta),
    kvGet(K.settings),
    kvGet(K.roots),
    kvGet(K.scan)
  ]);
  return {
    state: state && state.roots ? state : { roots: {}, updatedAt: 0 },
    meta: meta || null,
    settings: { ...FALLBACK_SETTINGS, ...settings && typeof settings === "object" ? settings : {} },
    roots: roots && Array.isArray(roots.roots) ? roots.roots : [],
    scan: scan && scan.updatedAt && Date.now() - scan.updatedAt < 15e3 ? scan : null
  };
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function loadSnaps(rid) {
  const keys = await kvKeys();
  const list = keys.filter((k) => k.startsWith(K.snapPrefix(rid))).map((k) => ({ k, seq: Number(k.slice(K.snapPrefix(rid).length)) || 0 })).sort((a, b) => b.seq - a.seq).slice(0, 30);
  const out = [];
  for (const s of list) {
    const v = await kvGet(s.k);
    if (v) out.push(v);
  }
  return out;
}
async function loadJunk(rid) {
  const v = await kvGet(K.junk(rid));
  return v && Array.isArray(v.items) ? v : { at: 0, items: [] };
}
async function loadQman(rid) {
  const v = await kvGet(K.qman(rid));
  return v && Array.isArray(v.items) ? v : { items: [] };
}
function nonce() {
  return "p" + Math.random().toString(16).slice(2, 10) + Date.now().toString(36);
}
async function runCmd(op, body, waitMs, stepMs = 1e3) {
  const n = nonce();
  await kvSet(`diskrad.cmd.${op}.${n}`, { ...body, at: Date.now() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, stepMs));
    const r = await kvGet(`diskrad.result.${n}`);
    if (r) {
      kvDel(`diskrad.result.${n}`).catch(() => {
      });
      return r;
    }
  }
  return { ok: false, error: "\u7B49\u5F85\u670D\u52A1\u54CD\u5E94\u8D85\u65F6\u2014\u2014\u53BB \u8BBE\u7F6E Tab \u786E\u8BA4\u78C1\u76D8\u96F7\u8FBE\u670D\u52A1\u662F\u5426\u5728\u8FD0\u884C" };
}
function cmdScan(path, deep = false, label) {
  return runCmd("scan", { ...path ? { path } : {}, deep, ...label ? { label } : {} }, 8e3);
}
function cmdCancel() {
  return runCmd("cancel", {}, 8e3);
}
function cmdProbe(path, maxDepth = 2, budgetMs = 15e3) {
  return runCmd(
    "report",
    { path, maxDepth, budgetMs },
    4e4,
    1200
  );
}
function cmdQuarantine(rootId, itemIds) {
  return runCmd("quarantine", { rootId, itemIds }, 3e4);
}
function cmdRestore(rootId, itemIds) {
  return runCmd("restore", { rootId, itemIds }, 3e4);
}
function cmdPurge(rootId, itemIds) {
  return runCmd("purge", { rootId, itemIds, confirm: true }, 6e4, 1500);
}
function cmdPurgeAll(rootId) {
  return runCmd("purge", { rootId, all: true, confirm: true }, 6e4, 1500);
}
function cmdRootsAdd(path, label) {
  return runCmd("roots_add", { path, label }, 8e3);
}
function cmdRootsRemove(rootId) {
  return runCmd("roots_remove", { rootId }, 8e3);
}
async function listServiceStatus() {
  try {
    const st = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
    const arr = Array.isArray(st) ? st : [];
    const mine = arr.find((s) => s.pluginId === PLUGIN_ID && s.serviceId === SERVICE_ID);
    return mine || null;
  } catch (_) {
    return null;
  }
}
async function serviceAction(action) {
  if (action === "start") {
    const st = await listServiceStatus();
    if (st && (st.state === "running" || st.status === "running")) return;
    const r = await capDispatch(
      "cap.pluginDiscovery",
      { action: "discover" }
    );
    const self = (r.plugins || []).find((p) => p.id === PLUGIN_ID);
    const svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID);
    if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230\u78C1\u76D8\u96F7\u8FBE\u670D\u52A1\u2014\u2014\u8BF7\u786E\u8BA4\u63D2\u4EF6\u5DF2\u6B63\u786E\u5B89\u88C5");
    await capDispatch("cap.pluginServiceManager", {
      action: "start",
      pluginId: PLUGIN_ID,
      installPath: self.installPath,
      contribution: {
        id: svc.id,
        type: svc.type ?? svc.serviceType,
        command: svc.command,
        argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
        port: svc.port ?? null,
        healthCheck: svc.healthCheck ?? null,
        healthCheckTimeout: svc.healthCheckTimeout ?? null,
        autoStart: svc.autoStart ?? true,
        restartOnFailure: svc.restartOnFailure ?? true,
        maxRestarts: svc.maxRestarts ?? 3,
        description: svc.description ?? null
      }
    });
    return;
  }
  await capDispatch("cap.pluginServiceManager", { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
function timeAgo(ts) {
  if (!ts) return "\u4ECE\u672A";
  const s = Math.max(0, Math.round((Date.now() - Number(ts)) / 1e3));
  if (s < 60) return `${s} \u79D2\u524D`;
  if (s < 3600) return `${Math.round(s / 60)} \u5206\u949F\u524D`;
  if (s < 86400) return `${Math.round(s / 3600)} \u5C0F\u65F6\u524D`;
  return `${Math.round(s / 86400)} \u5929\u524D`;
}
function fmtTime(ts) {
  if (!ts) return "\u2014";
  return new Date(Number(ts)).toLocaleString("zh-CN", { hour12: false });
}

// src/OverviewTab.tsx
var import_disk_core = __toESM(require_disk_core());
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function OverviewTab({ data, reload, showToast, goTab, onSendToChat }) {
  const [newPath, setNewPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const scan = data?.scan || null;
  const roots = data?.roots || [];
  const state = data?.state && data.state.roots ? data.state : { roots: {}, updatedAt: 0 };
  const addRoot = async () => {
    const p = newPath.trim();
    if (!p || busy) return;
    setBusy(true);
    try {
      const r = await cmdRootsAdd(p);
      if (!r.ok) {
        showToast(r.error || "\u767B\u8BB0\u5931\u8D25", true);
        return;
      }
      setNewPath("");
      showToast(r.payload?.existed ? "\u8BE5\u76EE\u5F55\u5DF2\u5728\u96F7\u8FBE\u91CC\uFF0C\u5F00\u59CB\u626B\u63CF\u2026" : "\u5DF2\u767B\u8BB0\uFF0C\u5F00\u59CB\u9996\u6B21\u626B\u63CF\u2026");
      await cmdScan(p, false);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const startScan = async (path, deep) => {
    try {
      const r = await cmdScan(path, deep);
      if (!r.ok) {
        showToast(r.error || "\u626B\u63CF\u5165\u961F\u5931\u8D25", true);
        return;
      }
      showToast(deep ? "\u6DF1\u626B\u5DF2\u5165\u961F\uFF08\u66F4\u4E45\u66F4\u5168\uFF09" : "\u626B\u63CF\u5DF2\u5165\u961F");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const cancel = async () => {
    setCancelling(true);
    try {
      await cmdCancel();
      showToast("\u5DF2\u8BF7\u6C42\u53D6\u6D88");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setCancelling(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    scan && /* @__PURE__ */ jsxs("div", { className: "dr-prog", children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsx("span", { className: "dr-spin" }),
        /* @__PURE__ */ jsxs("b", { style: { fontSize: 12 }, children: [
          "\u6B63\u5728\u626B\u63CF ",
          scan.path,
          scan.deep ? "\uFF08\u6DF1\u626B\uFF09" : ""
        ] }),
        /* @__PURE__ */ jsx("button", { className: "dr-btn sm danger", style: { marginLeft: "auto" }, disabled: cancelling, onClick: cancel, children: cancelling ? "\u53D6\u6D88\u4E2D\u2026" : "\u53D6\u6D88" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "dr-prog-track", children: /* @__PURE__ */ jsx("div", { className: "dr-prog-fill", style: { width: "42%" } }) }),
      /* @__PURE__ */ jsxs("div", { className: "dr-sub", children: [
        "\u5DF2\u626B ",
        (0, import_disk_core.fmtBytes)(scan.bytes),
        " \xB7 ",
        scan.files,
        " \u6587\u4EF6 \xB7 \u5F53\u524D ",
        scan.currentPath || "\u2026"
      ] })
    ] }),
    !roots.length ? /* @__PURE__ */ jsx("div", { className: "dr-card", children: /* @__PURE__ */ jsxs("div", { className: "dr-empty", children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 30, marginBottom: 8 }, children: "\u{1F4E1}" }),
      /* @__PURE__ */ jsx("b", { children: "\u628A\u4F60\u7684\u78C1\u76D8\u4EA4\u7ED9\u96F7\u8FBE" }),
      /* @__PURE__ */ jsxs("div", { children: [
        "\u767B\u8BB0\u4E00\u4E2A\u76EE\u5F55\uFF08\u6BD4\u5982 D:\\space \u6216\u6574\u4E2A D:\\\uFF09\uFF0C\u96F7\u8FBE\u4F1A\u626B\u63CF\u5B83\u7684\u7A7A\u95F4\u6784\u6210\u3001",
        /* @__PURE__ */ jsx("br", {}),
        "\u76EF\u4F4F\u589E\u957F\u3001\u627E\u51FA node_modules / target \u8FD9\u7C7B\u53EF\u56DE\u6536\u7684\u5F00\u53D1\u5783\u573E\u3002"
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { margin: "14px 0 4px", display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "dr-inp",
            placeholder: "\u8F93\u5165\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\space",
            value: newPath,
            onChange: (e) => setNewPath(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") addRoot();
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "dr-btn", disabled: busy || !newPath.trim(), onClick: addRoot, children: "\u767B\u8BB0\u5E76\u626B\u63CF" })
      ] }),
      onSendToChat && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
        "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5BF9 AI \u8BF4\uFF1A",
        /* @__PURE__ */ jsx(
          "a",
          {
            href: "#",
            style: { color: "#58A6FF", marginLeft: 6 },
            onClick: (e) => {
              e.preventDefault();
              onSendToChat("\u5E2E\u6211\u770B\u770B D \u76D8\u4EC0\u4E48\u6700\u5360\u7A7A\u95F4\uFF0C\u6709\u4EC0\u4E48\u80FD\u6E05\u7406\u7684");
            },
            children: "\u300C\u5E2E\u6211\u770B\u770B D \u76D8\u4EC0\u4E48\u6700\u5360\u7A7A\u95F4\uFF0C\u6709\u4EC0\u4E48\u80FD\u6E05\u7406\u7684\u300D"
          }
        )
      ] })
    ] }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      roots.map((r) => {
        const st = state.roots[r.id];
        const delta = st?.deltaBytes;
        return /* @__PURE__ */ jsx("div", { className: "dr-card", children: /* @__PURE__ */ jsxs("div", { className: "dr-card-b dr-rootcard", children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [
            /* @__PURE__ */ jsx("b", { style: { fontSize: 13 }, children: r.label || r.path }),
            st?.partial && /* @__PURE__ */ jsx("span", { className: "dr-badge-txt warn", children: "\u5FEB\u7167\u4E0D\u5B8C\u6574" }),
            /* @__PURE__ */ jsx("span", { className: "dr-hint dr-kv", children: timeAgo(st?.lastScanAt) })
          ] }),
          !st || !st.lastScanAt ? /* @__PURE__ */ jsx("div", { className: "dr-sub", style: { marginTop: 6 }, children: "\u5C1A\u672A\u626B\u63CF\u2014\u2014\u70B9\u4E0B\u65B9\u300C\u5FEB\u626B\u300D\u5EFA\u7ACB\u57FA\u7EBF\u3002" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }, children: [
              /* @__PURE__ */ jsx("span", { className: "dr-total", children: (0, import_disk_core.fmtBytes)(st.total) }),
              delta != null && delta !== 0 && /* @__PURE__ */ jsxs("span", { className: `dr-delta ${delta > 0 ? "up" : "down"}`, children: [
                delta > 0 ? "\u25B2" : "\u25BC",
                " ",
                (0, import_disk_core.fmtDelta)(delta)
              ] }),
              st.lastError && /* @__PURE__ */ jsx("span", { className: "dr-badge-txt bad", children: "\u4E0A\u6B21\u51FA\u9519" })
            ] }),
            st.volumeTotal ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { className: "dr-volbar", children: /* @__PURE__ */ jsx("i", { style: { width: `${Math.max(0, Math.min(100, (st.volumeTotal - (st.free || 0)) / st.volumeTotal * 100))}%`, background: "linear-gradient(90deg,#58A6FF,#BC8CFF)" } }) }),
              /* @__PURE__ */ jsxs("div", { className: "dr-kv", style: { marginTop: 4 }, children: [
                "\u5377\u4F59\u91CF ",
                /* @__PURE__ */ jsx("b", { children: (0, import_disk_core.fmtBytes)(st.free || 0) }),
                " / ",
                (0, import_disk_core.fmtBytes)(st.volumeTotal)
              ] })
            ] }) : null,
            /* @__PURE__ */ jsxs("div", { className: "dr-kv", style: { marginTop: 3 }, children: [
              st.files,
              " \u6587\u4EF6 \xB7 \u5783\u573E ",
              /* @__PURE__ */ jsx("b", { children: st.junkCount || 0 }),
              " \u9879\uFF08",
              (0, import_disk_core.fmtBytes)(st.junkBytes || 0),
              "\uFF09",
              st.prevAt ? ` \xB7 \u57FA\u7EBF ${timeAgo(st.prevAt)}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dr-actions", children: [
            /* @__PURE__ */ jsx("button", { className: "dr-btn sm", disabled: !!scan, onClick: () => startScan(r.path, false), children: "\u5FEB\u626B" }),
            /* @__PURE__ */ jsx("button", { className: "dr-btn sm ghost", disabled: !!scan, onClick: () => startScan(r.path, true), children: "\u6DF1\u626B" }),
            /* @__PURE__ */ jsx("button", { className: "dr-btn sm ghost", onClick: () => goTab("map"), children: "\u7A7A\u95F4\u5730\u56FE" }),
            /* @__PURE__ */ jsx("button", { className: "dr-btn sm ghost", onClick: () => goTab("junk"), children: "\u5783\u573E\u6E05\u7406" })
          ] })
        ] }) }, r.id);
      }),
      /* @__PURE__ */ jsx("div", { className: "dr-card", children: /* @__PURE__ */ jsxs("div", { className: "dr-card-b", style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "dr-inp",
            placeholder: "\u518D\u767B\u8BB0\u4E00\u4E2A\u76EE\u5F55\uFF0C\u5982 C:\\Users\\28409",
            value: newPath,
            onChange: (e) => setNewPath(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") addRoot();
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "dr-btn ghost", disabled: busy || !newPath.trim(), onClick: addRoot, children: "\u767B\u8BB0" })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "dr-sub", style: { padding: "2px 18px 8px" }, children: [
        "\u81EA\u52A8\u5FEB\u7167\uFF1A",
        data?.settings.autoSnapshot ? `\u6BCF ${data.settings.snapshotHours} \u5C0F\u65F6` : "\u5DF2\u5173\u95ED",
        "\uFF08\u8BBE\u7F6E Tab \u53EF\u6539\uFF09\u3002AI \u4E5F\u80FD\u4EE3\u52B3\uFF1A\u5BF9\u5B83\u8BF4\u300C\u626B\u4E00\u4E0B D \u76D8\u300D\u300C\u6709\u4EC0\u4E48\u80FD\u5220\u7684\u300D\u3002"
      ] })
    ] })
  ] });
}

// src/SpaceMapTab.tsx
var import_disk_core2 = __toESM(require_disk_core());
import { useCallback, useEffect, useRef, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var KIND_LABEL = import_disk_core2.default.JUNK_KIND_LABEL;
function cellColor(nd, total) {
  if (nd.j) return "rgba(210,153,34,0.78)";
  const share = total > 0 ? (nd.b || 0) / total : 0;
  const t = Math.max(0, Math.min(1, share * 4));
  const r = Math.round(88 + t * 100);
  const g = Math.round(166 - t * 60);
  const b = Math.round(255 - t * 40);
  return `rgba(${r},${g},${b},0.72)`;
}
function Treemap({ nodes, total, onPick, height }) {
  const W = 1e3;
  const nodeByName = new Map(nodes.map((nd) => [nd.n, nd]));
  const rects = import_disk_core2.default.squarify(nodes.map((nd) => ({ name: nd.n, value: nd.b || 0 })), 0, 0, W, height);
  return /* @__PURE__ */ jsx2("svg", { viewBox: `0 0 ${W} ${height}`, style: { width: "100%", display: "block" }, role: "img", "aria-label": "\u7A7A\u95F4\u77E9\u5F62\u6811\u56FE", children: rects.map((rc) => {
    const nd = nodeByName.get(rc.name);
    if (!nd) return null;
    const pct = total > 0 ? (nd.b || 0) / total * 100 : 0;
    const showName = rc.w > 64 && rc.h > 30;
    const showPct = rc.w > 64 && rc.h > 52;
    return /* @__PURE__ */ jsxs2("g", { className: "dr-mapcell", onClick: () => onPick && onPick(nd), children: [
      /* @__PURE__ */ jsx2("rect", { x: rc.x, y: rc.y, width: rc.w, height: rc.h, rx: 6, fill: cellColor(nd, total) }),
      /* @__PURE__ */ jsx2("title", { children: `${nd.n} \u2014 ${import_disk_core2.default.fmtBytes(nd.b)}\uFF08${pct.toFixed(1)}%\uFF09${nd.j ? `\u3010\u5783\u573E:${KIND_LABEL[nd.j] || nd.j}\u3011` : ""}${nd.d ? "\uFF08\u65E0\u6743\u9650\uFF09" : ""}${onPick ? "\n\u70B9\u51FB\u4E0B\u94BB" : ""}` }),
      showName && /* @__PURE__ */ jsx2("text", { x: rc.x + 8, y: rc.y + 20, fontSize: 13, fill: "#0b0e14", fontWeight: 700, style: { pointerEvents: "none" }, children: nd.n.length > Math.floor(rc.w / 9) ? nd.n.slice(0, Math.max(3, Math.floor(rc.w / 9) - 1)) + "\u2026" : nd.n }),
      showPct && /* @__PURE__ */ jsxs2("text", { x: rc.x + 8, y: rc.y + 40, fontSize: 12, fill: "#10141C", style: { pointerEvents: "none" }, children: [
        import_disk_core2.default.fmtBytes(nd.b),
        " \xB7 ",
        pct.toFixed(1),
        "%",
        nd.d ? " \xB7 ?" : ""
      ] })
    ] }, `${rc.name}@${rc.x},${rc.y}`);
  }) });
}
function SpaceMapTab({ data, reload, showToast }) {
  const [rid, setRid] = useState2("");
  const [snap, setSnap] = useState2(null);
  const [loading, setLoading] = useState2(false);
  const [crumbs, setCrumbs] = useState2([]);
  const [probing, setProbing] = useState2(false);
  const lastLoadedRid = useRef("");
  const roots = data?.roots || [];
  const loadLatest = useCallback(async (rootId, silent = false) => {
    if (!rootId) return;
    if (!silent) setLoading(true);
    try {
      const snaps = await loadSnaps(rootId);
      setSnap(snaps[0] || null);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => {
    const effRoot = rid || roots[0]?.id || "";
    if (effRoot && effRoot !== lastLoadedRid.current) {
      lastLoadedRid.current = effRoot;
      setCrumbs([]);
      loadLatest(effRoot);
    }
  }, [rid, roots, loadLatest]);
  const root = roots.find((r) => r.id === (rid || roots[0]?.id));
  const rootPath = root?.path || "";
  const probe = async (dirPath, label) => {
    setProbing(true);
    try {
      const r = await cmdProbe(dirPath, 2, 15e3);
      if (!r.ok) {
        showToast(r.error || "\u7EC6\u67E5\u5931\u8D25", true);
        return;
      }
      const pl = r.payload;
      if (!pl) return;
      setCrumbs((c) => [...c, {
        path: dirPath,
        label,
        tree: pl.dirs || [],
        total: pl.total,
        partial: pl.partial,
        junk: pl.junkItems
      }]);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setProbing(false);
    }
  };
  const probeInto = async (baseDir, nd) => {
    const sep = baseDir.includes("\\") ? "\\" : "/";
    const target = baseDir.endsWith(sep) ? baseDir + nd.n : baseDir + sep + nd.n;
    await probe(target, nd.n);
  };
  const cur = crumbs.length ? crumbs[crumbs.length - 1] : null;
  const probeBase = cur ? cur.path : rootPath;
  const treeNodes = cur ? cur.tree || [] : import_disk_core2.default.sortTree([...snap?.dirs || []]);
  const treeTotalBytes = cur ? cur.total : snap?.total || 0;
  const topList = [...treeNodes].sort((a, b) => (b.b || 0) - (a.b || 0)).slice(0, 15);
  const junkBytesInTree = treeNodes.reduce((s, nd) => s + (nd.j ? nd.b : 0), 0);
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { className: "dr-card", style: { marginTop: 4 }, children: /* @__PURE__ */ jsx2(RootSelect, { data, value: rid || roots[0]?.id || "", onChange: (v) => {
      setRid(v);
      setCrumbs([]);
      lastLoadedRid.current = v;
      loadLatest(v);
    } }) }),
    !roots.length && /* @__PURE__ */ jsx2("div", { className: "dr-empty", children: "\u5148\u5728\u300C\u603B\u89C8\u300D\u767B\u8BB0\u4E00\u4E2A\u76EE\u5F55\u518D\u6765\u770B\u7A7A\u95F4\u5730\u56FE\u3002" }),
    roots.length > 0 && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "dr-crumbs", children: [
        /* @__PURE__ */ jsxs2(
          "span",
          {
            className: `dr-crumb ${!cur ? "cur" : ""}`,
            onClick: () => setCrumbs([]),
            children: [
              root?.label || rootPath,
              snap ? ` \xB7 ${import_disk_core2.default.fmtBytes(snap.total)}` : ""
            ]
          }
        ),
        crumbs.map((c, i) => /* @__PURE__ */ jsxs2("span", { style: { display: "flex", gap: 4, alignItems: "center" }, children: [
          /* @__PURE__ */ jsx2("span", { style: { color: "#3d4657" }, children: "\u25B8" }),
          /* @__PURE__ */ jsx2(
            "span",
            {
              className: `dr-crumb ${i === crumbs.length - 1 ? "cur" : ""}`,
              onClick: () => setCrumbs(crumbs.slice(0, i + 1)),
              children: c.label.split(" \u25B8 ").pop()
            }
          )
        ] }, c.path)),
        probing && /* @__PURE__ */ jsx2("span", { className: "dr-spin", style: { marginLeft: 6 } })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "dr-mapwrap", children: loading ? /* @__PURE__ */ jsxs2("div", { className: "dr-empty", children: [
        /* @__PURE__ */ jsx2("span", { className: "dr-spin" }),
        " \u8F7D\u5165\u5FEB\u7167\u2026"
      ] }) : !treeNodes.length ? /* @__PURE__ */ jsx2("div", { className: "dr-empty", children: cur ? "\uFF08\u7A7A\u76EE\u5F55\u6216\u9884\u7B97\u5185\u6CA1\u626B\u5230\u5185\u5BB9\uFF09" : "\u8FD8\u6CA1\u6709\u5FEB\u7167\u2014\u2014\u53BB\u300C\u603B\u89C8\u300D\u70B9\u300C\u5FEB\u626B\u300D\u3002" }) : /* @__PURE__ */ jsx2(
        Treemap,
        {
          nodes: treeNodes,
          total: treeTotalBytes,
          height: 380,
          onPick: probing ? void 0 : (nd) => probeInto(probeBase, nd)
        }
      ) }),
      /* @__PURE__ */ jsx2("div", { className: "dr-sub", style: { padding: "0 18px 8px" }, children: cur ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
        "\u5B9E\u65F6\u7EC6\u67E5\uFF1A",
        cur.path,
        " \xB7 ",
        import_disk_core2.default.fmtBytes(cur.total),
        cur.partial ? " \xB7 \u9884\u7B97\u5185\u672A\u626B\u5B8C" : "",
        cur.junk && cur.junk.length ? ` \xB7 \u53D1\u73B0\u5783\u573E ${cur.junk.length} \u9879` : ""
      ] }) : snap ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
        "\u5FEB\u7167 #",
        snap.seq,
        " \xB7 ",
        timeAgo(snap.at),
        snap.partial ? " \xB7 \u4E0D\u5B8C\u6574\uFF08\u6DF1\u626B\u53EF\u8865\u5168\uFF09" : "",
        snap.volume ? ` \xB7 \u5377\u4F59\u91CF ${import_disk_core2.default.fmtBytes(snap.volume.free)}` : "",
        snap.deniedDirs ? ` \xB7 ${snap.deniedDirs} \u76EE\u5F55\u65E0\u6743\u9650` : "",
        junkBytesInTree > 0 ? ` \xB7 \u6A59\u8272=\u53EF\u56DE\u6536\u5783\u573E ${import_disk_core2.default.fmtBytes(junkBytesInTree)}` : ""
      ] }) : null }),
      cur && cur.junk && cur.junk.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "dr-card", children: [
        /* @__PURE__ */ jsx2("div", { className: "dr-junk-h", children: "\u{1F9F9} \u672C\u6B21\u7EC6\u67E5\u53D1\u73B0\u5783\u573E" }),
        cur.junk.slice(0, 8).map((it) => /* @__PURE__ */ jsxs2("div", { className: "dr-item", children: [
          /* @__PURE__ */ jsx2("span", { className: "dr-item-m dr-mono", children: it.relPath }),
          /* @__PURE__ */ jsx2("span", { className: "dr-tag", children: import_disk_core2.default.fmtBytes(it.bytes) })
        ] }, it.id))
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "dr-card", children: [
        /* @__PURE__ */ jsxs2("div", { className: "dr-junk-h", children: [
          "Top \u76EE\u5F55",
          cur ? "" : "\uFF08\u5FEB\u7167\uFF09",
          /* @__PURE__ */ jsx2("span", { className: "dr-hint", children: cur ? "\u70B9\u51FB\u884C\u4E0B\u94BB\uFF08\u5B9E\u65F6\u7EC6\u67E5\uFF09" : "\u70B9\u51FB\u884C\u4E0B\u94BB" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { style: { padding: "2px 0 6px" }, children: [
          /* @__PURE__ */ jsx2("table", { className: "dr-tbl", children: /* @__PURE__ */ jsx2("tbody", { children: topList.map((nd) => {
            const pct = treeTotalBytes > 0 ? (nd.b || 0) / treeTotalBytes * 100 : 0;
            const canDrill = cur ? true : !!(nd.c && nd.c.length);
            return /* @__PURE__ */ jsxs2(
              "tr",
              {
                style: { cursor: probing ? "wait" : canDrill ? "pointer" : "default" },
                onClick: () => {
                  if (!probing) probeInto(probeBase, nd);
                },
                children: [
                  /* @__PURE__ */ jsxs2("td", { children: [
                    nd.n,
                    nd.j ? /* @__PURE__ */ jsx2("span", { className: "dr-badge-txt warn", style: { marginLeft: 6 }, children: "\u5783\u573E" }) : null,
                    nd.d ? /* @__PURE__ */ jsx2("span", { className: "dr-badge-txt bad", style: { marginLeft: 6 }, children: "\u65E0\u6743\u9650" }) : null
                  ] }),
                  /* @__PURE__ */ jsx2("td", { style: { minWidth: 90 }, children: /* @__PURE__ */ jsx2("div", { style: { background: "#0d1017", borderRadius: 3, height: 6, overflow: "hidden" }, children: /* @__PURE__ */ jsx2("div", { style: { width: `${pct}%`, height: "100%", background: nd.j ? "#D29922" : "#58A6FF" } }) }) }),
                  /* @__PURE__ */ jsx2("td", { className: "dr-num", children: import_disk_core2.default.fmtBytes(nd.b) }),
                  /* @__PURE__ */ jsxs2("td", { className: "dr-num", style: { color: "#5C6678" }, children: [
                    pct.toFixed(1),
                    "%"
                  ] })
                ]
              },
              nd.n
            );
          }) }) }),
          !topList.length && /* @__PURE__ */ jsx2("div", { className: "dr-empty", children: "\uFF08\u7A7A\u76EE\u5F55\uFF09" })
        ] })
      ] }),
      !cur && /* @__PURE__ */ jsxs2("div", { style: { padding: "0 18px 10px", display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "dr-btn sm ghost", disabled: loading || !root, onClick: () => root && loadLatest(root.id), children: "\u5237\u65B0\u5FEB\u7167" }),
        /* @__PURE__ */ jsx2("button", { className: "dr-btn sm ghost", disabled: probing, onClick: () => rootPath && probe(rootPath, root?.label || rootPath), children: "\u5B9E\u65F6\u7EC6\u67E5\u6839\u76EE\u5F55" }),
        /* @__PURE__ */ jsx2("button", { className: "dr-btn sm ghost", onClick: () => reload(), children: "\u5237\u65B0\u9762\u677F\u6570\u636E" })
      ] })
    ] })
  ] });
}

// src/JunkTab.tsx
var import_disk_core3 = __toESM(require_disk_core());
import { useCallback as useCallback2, useEffect as useEffect2, useRef as useRef2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var KIND_ORDER = ["deps", "build", "cache", "custom"];
var KIND_LABEL2 = import_disk_core3.default.JUNK_KIND_LABEL;
function JunkTab({ data, showToast }) {
  const [rid, setRid] = useState3("");
  const [junk, setJunk] = useState3(null);
  const [qman, setQman] = useState3(null);
  const [loading, setLoading] = useState3(false);
  const [busyId, setBusyId] = useState3("");
  const lastRid = useRef2("");
  const roots = data?.roots || [];
  const root = roots.find((r) => r.id === (rid || roots[0]?.id));
  const reloadJunk = useCallback2(async (rootId, silent = false) => {
    if (!rootId) return;
    if (!silent) setLoading(true);
    try {
      const [j, q] = await Promise.all([loadJunk(rootId), loadQman(rootId)]);
      setJunk(j);
      setQman(q);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect2(() => {
    const effRoot = rid || roots[0]?.id || "";
    if (effRoot && effRoot !== lastRid.current) {
      lastRid.current = effRoot;
      reloadJunk(effRoot);
    }
  }, [rid, roots, reloadJunk]);
  const act = async (id, fn) => {
    if (!root) return;
    setBusyId(id);
    try {
      const r = await fn();
      if (!r.ok) {
        showToast(r.error || "\u64CD\u4F5C\u5931\u8D25", true);
        return;
      }
      const errs = r.payload?.errors || [];
      if (errs.length) showToast(errs.map((e) => e.error).join("\uFF1B"), true);
      else showToast("\u5B8C\u6210");
      await reloadJunk(root.id, true);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusyId("");
    }
  };
  const quarantine = (ids) => root && act(ids[0] || "batch", () => cmdQuarantine(root.id, ids));
  const restore = (id) => root && act(id, () => cmdRestore(root.id, [id]));
  const purge = (id) => {
    if (!root) return;
    if (!window.confirm("\u5F7B\u5E95\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\uFF08\u4E0D\u8D70\u7CFB\u7EDF\u56DE\u6536\u7AD9\uFF09\u3002\u786E\u5B9A\u5417\uFF1F")) return;
    act(id, () => cmdPurge(root.id, [id]));
  };
  const purgeAll = () => {
    if (!root) return;
    const n = qman?.items.length || 0;
    if (!n) return;
    if (!window.confirm(`\u5F7B\u5E95\u9500\u6BC1\u9694\u79BB\u533A\u5168\u90E8 ${n} \u9879\uFF08\u65E0\u6CD5\u6062\u590D\uFF09\u3002\u786E\u5B9A\u5417\uFF1F`)) return;
    act("all", () => cmdPurgeAll(root.id));
  };
  const rescan = async () => {
    if (!root) return;
    try {
      const r = await cmdScan(root.path, false);
      showToast(r.ok ? "\u5DF2\u53D1\u8D77\u91CD\u65B0\u626B\u63CF\uFF0C\u626B\u63CF\u5B8C\u56DE\u6765\u5237\u65B0" : r.error || "\u5165\u961F\u5931\u8D25", !r.ok);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const items = junk?.items || [];
  const groups = KIND_ORDER.map((k) => ({ kind: k, list: items.filter((it) => it.kind === k) })).filter((g) => g.list.length);
  const other = items.filter((it) => !KIND_ORDER.includes(it.kind));
  if (other.length) groups.push({ kind: "other", list: other });
  const totalBytes = items.reduce((s, it) => s + (it.bytes || 0), 0);
  const qItems = qman?.items || [];
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "dr-card", style: { marginTop: 4 }, children: /* @__PURE__ */ jsx3(RootSelect, { data, value: rid || roots[0]?.id || "", onChange: (v) => {
      setRid(v);
      lastRid.current = v;
      reloadJunk(v);
    } }) }),
    !roots.length && /* @__PURE__ */ jsx3("div", { className: "dr-empty", children: "\u5148\u5728\u300C\u603B\u89C8\u300D\u767B\u8BB0\u4E00\u4E2A\u76EE\u5F55\u3002" }),
    roots.length > 0 && /* @__PURE__ */ jsxs3(Fragment3, { children: [
      /* @__PURE__ */ jsxs3("div", { className: "dr-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "dr-bar" }),
        "\u53EF\u56DE\u6536\u5783\u573E",
        /* @__PURE__ */ jsx3("span", { className: "dr-hint", children: junk?.at ? `${timeAgo(junk.at)}\u626B\u63CF${junk.partial ? "\uFF08\u4E0D\u5B8C\u6574\uFF09" : ""} \xB7 \u5171 ${items.length} \u9879 ${import_disk_core3.default.fmtBytes(totalBytes)}` : "\u8FD8\u6CA1\u6709\u626B\u63CF\u6570\u636E" })
      ] }),
      loading && /* @__PURE__ */ jsxs3("div", { className: "dr-err", style: { color: "#8B95A7" }, children: [
        /* @__PURE__ */ jsx3("span", { className: "dr-spin" }),
        " \u8F7D\u5165\u4E2D\u2026"
      ] }),
      !loading && !items.length && /* @__PURE__ */ jsx3("div", { className: "dr-card", children: /* @__PURE__ */ jsxs3("div", { className: "dr-empty", children: [
        junk?.at ? `\u6CA1\u53D1\u73B0\u5F00\u53D1\u5783\u573E\uFF08${timeAgo(junk.at)}\u626B\u7684\uFF09\u3002
\u8981\u4E48\u771F\u7684\u5F88\u5E72\u51C0\uFF0C\u8981\u4E48\u5783\u573E\u5728\u66F4\u6DF1\u5C42\u2014\u2014\u300C\u5FEB\u626B\u300D\u5168\u6DF1\u5EA6\u90FD\u4F1A\u627E\uFF0C\u6DF1\u626B\u53EF\u786E\u4FDD\u9884\u7B97\u5145\u8DB3\u3002` : "\u626B\u63CF\u4E00\u6B21\u624D\u4F1A\u51FA\u73B0\u5783\u573E\u6E05\u5355\u2014\u2014\u53BB\u300C\u603B\u89C8\u300D\u70B9\u300C\u5FEB\u626B\u300D\uFF0C\u6216\u70B9\u53F3\u4E0A\u6309\u94AE\u3002",
        /* @__PURE__ */ jsx3("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx3("button", { className: "dr-btn sm ghost", onClick: rescan, children: "\u91CD\u65B0\u626B\u63CF" }) })
      ] }) }),
      groups.map((g) => {
        const gBytes = g.list.reduce((s, it) => s + (it.bytes || 0), 0);
        return /* @__PURE__ */ jsxs3("div", { className: "dr-card", children: [
          /* @__PURE__ */ jsxs3("div", { className: "dr-junk-h", children: [
            KIND_LABEL2[g.kind] || g.kind,
            /* @__PURE__ */ jsxs3("span", { className: "dr-tag", children: [
              g.list.length,
              " \u9879 \xB7 ",
              import_disk_core3.default.fmtBytes(gBytes)
            ] }),
            /* @__PURE__ */ jsx3(
              "button",
              {
                className: "dr-btn sm amber",
                style: { marginLeft: "auto" },
                disabled: !!busyId || !root,
                onClick: () => quarantine(g.list.map((it) => it.id)),
                children: "\u5168\u90E8\u79FB\u5165\u9694\u79BB\u533A"
              }
            )
          ] }),
          g.list.slice(0, 60).map((it) => /* @__PURE__ */ jsxs3("div", { className: "dr-item", children: [
            /* @__PURE__ */ jsxs3("div", { className: "dr-item-m", children: [
              /* @__PURE__ */ jsx3("div", { className: "dr-mono", children: it.relPath }),
              /* @__PURE__ */ jsxs3("div", { className: "dr-sub", children: [
                import_disk_core3.default.fmtBytes(it.bytes),
                " \xB7 ",
                it.files,
                " \u6587\u4EF6 \xB7 \u6700\u540E\u5199\u5165 ",
                timeAgo(it.lastWrite),
                it.note ? ` \xB7 ${it.note}` : ""
              ] })
            ] }),
            /* @__PURE__ */ jsx3(
              "button",
              {
                className: "dr-btn sm amber",
                disabled: !!busyId,
                onClick: () => quarantine([it.id]),
                children: busyId === it.id ? "\u5904\u7406\u4E2D\u2026" : "\u79FB\u5165\u9694\u79BB\u533A"
              }
            )
          ] }, it.id)),
          g.list.length > 60 && /* @__PURE__ */ jsxs3("div", { className: "dr-sub", style: { padding: "6px 13px" }, children: [
            "\u2026\u8FD8\u6709 ",
            g.list.length - 60,
            " \u9879\uFF08\u7528\u300C\u5168\u90E8\u79FB\u5165\u300D\u5904\u7406\uFF09"
          ] })
        ] }, g.kind);
      }),
      /* @__PURE__ */ jsxs3("div", { className: "dr-sec", children: [
        /* @__PURE__ */ jsx3("span", { className: "dr-bar" }),
        "\u9694\u79BB\u533A",
        /* @__PURE__ */ jsxs3("span", { className: "dr-hint", children: [
          qItems.length ? `${qItems.length} \u9879\u5F85\u5904\u7406` : "\u7A7A",
          data?.settings.quarantineDays ? ` \xB7 \u8D85 ${data.settings.quarantineDays} \u5929\u81EA\u52A8\u9500\u6BC1` : " \xB7 \u81EA\u52A8\u9500\u6BC1\u5DF2\u5173\u95ED"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "dr-card", children: !qItems.length ? /* @__PURE__ */ jsx3("div", { className: "dr-empty", children: "\u79FB\u5165\u9694\u79BB\u533A = \u540C\u76D8\u6539\u540D\uFF0C\u77AC\u95F4\u5B8C\u6210\u3001\u968F\u65F6\u53EF\u6062\u590D\uFF1B\u786E\u8BA4\u4E0D\u8981\u4E86\u518D\u300C\u5F7B\u5E95\u5220\u9664\u300D\u3002" }) : /* @__PURE__ */ jsxs3(Fragment3, { children: [
        qItems.map((it) => /* @__PURE__ */ jsxs3("div", { className: "dr-item", children: [
          /* @__PURE__ */ jsxs3("div", { className: "dr-item-m", children: [
            /* @__PURE__ */ jsxs3("div", { className: "dr-mono", children: [
              it.name,
              " ",
              /* @__PURE__ */ jsxs3("span", { className: "dr-sub", children: [
                "\u2190 ",
                it.relPath
              ] })
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "dr-sub", children: [
              import_disk_core3.default.fmtBytes(it.bytes),
              " \xB7 \u79FB\u5165\u4E8E ",
              fmtTime(it.movedAt)
            ] })
          ] }),
          /* @__PURE__ */ jsx3("button", { className: "dr-btn sm ghost", disabled: !!busyId, onClick: () => restore(it.id), children: "\u6062\u590D" }),
          /* @__PURE__ */ jsx3("button", { className: "dr-btn sm danger", disabled: !!busyId, onClick: () => purge(it.id), children: "\u5F7B\u5E95\u5220\u9664" })
        ] }, it.id)),
        /* @__PURE__ */ jsxs3("div", { style: { padding: "9px 13px", display: "flex", gap: 8, borderTop: "1px solid #1a202c" }, children: [
          /* @__PURE__ */ jsxs3("span", { className: "dr-kv", style: { flex: 1, alignSelf: "center" }, children: [
            "\u5408\u8BA1 ",
            import_disk_core3.default.fmtBytes(qItems.reduce((s, it) => s + (it.bytes || 0), 0)),
            "\uFF08\u8FD9\u4E9B\u7A7A\u95F4\u8981\u5F7B\u5E95\u5220\u9664\u540E\u624D\u771F\u6B63\u91CA\u653E\uFF09"
          ] }),
          /* @__PURE__ */ jsx3("button", { className: "dr-btn sm danger", disabled: !!busyId, onClick: purgeAll, children: "\u6E05\u7A7A\u9694\u79BB\u533A" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsx3("div", { className: "dr-sub", style: { padding: "0 18px 8px" }, children: "\u5B89\u5168\u8BF4\u660E\uFF1AAI \u5DE5\u5177\u5168\u90E8\u53EA\u8BFB\uFF0C\u65E0\u6CD5\u66FF\u4F60\u5220\u9664\uFF1B\u300C\u6587\u4EF6\u88AB\u5360\u7528\u300D\u7684\u6761\u76EE\uFF08\u6BD4\u5982\u5F00\u7740 dev \u670D\u52A1\u7684 target/\uFF09\u5173\u6389\u5360\u7528\u8FDB\u7A0B\u540E\u91CD\u8BD5\u5373\u53EF\u2014\u2014\u53E3\u888B\u4E3B\u673A\u53EF\u4EE5\u5E2E\u4F60\u627E\u5230\u5360\u7528\u8005\u3002" })
    ] })
  ] });
}

// src/HistoryTab.tsx
var import_disk_core4 = __toESM(require_disk_core());
import { useCallback as useCallback3, useEffect as useEffect3, useRef as useRef3, useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function Sparkbars({ snaps }) {
  const list = [...snaps].reverse();
  if (list.length < 2) return null;
  const W = 1e3;
  const H = 150;
  const max = Math.max(...list.map((s) => s.total || 0), 1);
  const gap = 4;
  const bw = Math.max(6, (W - gap * (list.length - 1)) / list.length);
  return /* @__PURE__ */ jsxs4("svg", { viewBox: `0 0 ${W} ${H + 26}`, style: { width: "100%", display: "block" }, role: "img", "aria-label": "\u603B\u91CF\u5386\u53F2", children: [
    list.map((s, i) => {
      const h = Math.max(3, (s.total || 0) / max * (H - 20));
      const x = i * (bw + gap);
      const date = new Date(s.at);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      return /* @__PURE__ */ jsxs4("g", { children: [
        /* @__PURE__ */ jsx4("title", { children: `#${s.seq} ${fmtTime(s.at)} \xB7 ${import_disk_core4.default.fmtBytes(s.total)}${s.partial ? "\uFF08\u4E0D\u5B8C\u6574\uFF09" : ""}` }),
        /* @__PURE__ */ jsx4(
          "rect",
          {
            x,
            y: H - h,
            width: bw,
            height: h,
            rx: 3,
            fill: s.partial ? "rgba(88,166,255,0.35)" : "url(#dr-hbar)"
          }
        ),
        i % Math.ceil(list.length / 8) === 0 && /* @__PURE__ */ jsx4("text", { x: x + bw / 2, y: H + 16, fontSize: 12, fill: "#5C6678", textAnchor: "middle", children: label })
      ] }, s.seq);
    }),
    /* @__PURE__ */ jsx4("defs", { children: /* @__PURE__ */ jsxs4("linearGradient", { id: "dr-hbar", x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ jsx4("stop", { offset: "0%", stopColor: "#BC8CFF" }),
      /* @__PURE__ */ jsx4("stop", { offset: "100%", stopColor: "#58A6FF" })
    ] }) })
  ] });
}
function HistoryTab({ data }) {
  const [rid, setRid] = useState4("");
  const [snaps, setSnaps] = useState4([]);
  const [loading, setLoading] = useState4(false);
  const lastRid = useRef3("");
  const roots = data?.roots || [];
  const reloadSnaps = useCallback3(async (rootId, silent = false) => {
    if (!rootId) return;
    if (!silent) setLoading(true);
    try {
      setSnaps(await loadSnaps(rootId));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect3(() => {
    const effRoot2 = rid || roots[0]?.id || "";
    if (effRoot2 && effRoot2 !== lastRid.current) {
      lastRid.current = effRoot2;
      reloadSnaps(effRoot2);
    }
  }, [rid, roots, reloadSnaps]);
  const complete = snaps.filter((s) => !s.partial);
  const [cur, prev] = complete;
  const movers = cur && prev ? import_disk_core4.default.growthDiff(prev.dirs || [], cur.dirs || []).slice(0, 12) : [];
  const effRoot = roots.find((r) => r.id === (rid || roots[0]?.id));
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsx4("div", { className: "dr-card", style: { marginTop: 4 }, children: /* @__PURE__ */ jsx4(RootSelect, { data, value: rid || roots[0]?.id || "", onChange: (v) => {
      setRid(v);
      lastRid.current = v;
      reloadSnaps(v);
    } }) }),
    !roots.length && /* @__PURE__ */ jsx4("div", { className: "dr-empty", children: "\u5148\u5728\u300C\u603B\u89C8\u300D\u767B\u8BB0\u4E00\u4E2A\u76EE\u5F55\u3002" }),
    roots.length > 0 && /* @__PURE__ */ jsxs4(Fragment4, { children: [
      /* @__PURE__ */ jsxs4("div", { className: "dr-sec", children: [
        /* @__PURE__ */ jsx4("span", { className: "dr-bar" }),
        "\u603B\u91CF\u8D70\u52BF",
        /* @__PURE__ */ jsx4("span", { className: "dr-hint", children: effRoot ? `${effRoot.label || effRoot.path} \xB7 ${snaps.length} \u4EFD\u5FEB\u7167` : "" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "dr-mapwrap", style: { padding: "10px 6px 2px" }, children: loading ? /* @__PURE__ */ jsxs4("div", { className: "dr-empty", children: [
        /* @__PURE__ */ jsx4("span", { className: "dr-spin" }),
        " \u8F7D\u5165\u4E2D\u2026"
      ] }) : snaps.length >= 2 ? /* @__PURE__ */ jsx4(Sparkbars, { snaps }) : /* @__PURE__ */ jsxs4("div", { className: "dr-empty", children: [
        "\u5FEB\u7167\u8FD8\u4E0D\u8DB3\u4E24\u4EFD\u2014\u2014\u81EA\u52A8\u5FEB\u7167\u6BCF ",
        data?.settings.snapshotHours ?? 24,
        " \u5C0F\u65F6\u4E00\u4EFD\uFF0C\u4E5F\u53EF\u4EE5\u73B0\u5728\u53BB\u300C\u603B\u89C8\u300D\u624B\u52A8\u5FEB\u626B\u4E00\u6B21\u3002"
      ] }) }),
      movers.length > 0 && /* @__PURE__ */ jsxs4(Fragment4, { children: [
        /* @__PURE__ */ jsxs4("div", { className: "dr-sec", children: [
          /* @__PURE__ */ jsx4("span", { className: "dr-bar" }),
          "\u7A7A\u95F4\u632A\u79FB\u5F52\u56E0",
          /* @__PURE__ */ jsxs4("span", { className: "dr-hint", children: [
            fmtTime(prev.at),
            " \u2192 ",
            fmtTime(cur.at),
            " \xB7 \u603B ",
            import_disk_core4.default.fmtDelta(cur.total - prev.total)
          ] })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "dr-card", children: /* @__PURE__ */ jsx4("div", { style: { padding: "2px 0 6px" }, children: /* @__PURE__ */ jsxs4("table", { className: "dr-tbl", children: [
          /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
            /* @__PURE__ */ jsx4("th", { children: "\u76EE\u5F55" }),
            /* @__PURE__ */ jsx4("th", { className: "dr-num", children: "\u4E4B\u524D" }),
            /* @__PURE__ */ jsx4("th", { className: "dr-num", children: "\u4E4B\u540E" }),
            /* @__PURE__ */ jsx4("th", { className: "dr-num", children: "\u53D8\u5316" })
          ] }) }),
          /* @__PURE__ */ jsx4("tbody", { children: movers.map((m) => /* @__PURE__ */ jsxs4("tr", { children: [
            /* @__PURE__ */ jsx4("td", { className: "dr-mono", children: m.path }),
            /* @__PURE__ */ jsx4("td", { className: "dr-num", style: { color: "#5C6678" }, children: import_disk_core4.default.fmtBytes(m.from) }),
            /* @__PURE__ */ jsx4("td", { className: "dr-num", style: { color: "#5C6678" }, children: import_disk_core4.default.fmtBytes(m.to) }),
            /* @__PURE__ */ jsx4("td", { className: `dr-num dr-delta ${m.delta > 0 ? "up" : "down"}`, children: import_disk_core4.default.fmtDelta(m.delta) })
          ] }, m.path)) })
        ] }) }) })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "dr-sec", children: [
        /* @__PURE__ */ jsx4("span", { className: "dr-bar" }),
        "\u5FEB\u7167\u660E\u7EC6"
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "dr-card", children: /* @__PURE__ */ jsxs4("div", { style: { padding: "2px 0 6px" }, children: [
        /* @__PURE__ */ jsxs4("table", { className: "dr-tbl", children: [
          /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
            /* @__PURE__ */ jsx4("th", { children: "\u65F6\u95F4" }),
            /* @__PURE__ */ jsx4("th", { children: "\u7C7B\u578B" }),
            /* @__PURE__ */ jsx4("th", { className: "dr-num", children: "\u603B\u91CF" }),
            /* @__PURE__ */ jsx4("th", { className: "dr-num", children: "\u5783\u573E" }),
            /* @__PURE__ */ jsx4("th", { className: "dr-num", children: "\u8017\u65F6" })
          ] }) }),
          /* @__PURE__ */ jsx4("tbody", { children: snaps.map((s) => /* @__PURE__ */ jsxs4("tr", { children: [
            /* @__PURE__ */ jsxs4("td", { style: { whiteSpace: "nowrap" }, children: [
              fmtTime(s.at),
              s.partial && /* @__PURE__ */ jsx4("span", { className: "dr-badge-txt warn", style: { marginLeft: 6 }, children: "\u4E0D\u5B8C\u6574" })
            ] }),
            /* @__PURE__ */ jsxs4("td", { children: [
              s.deep ? "\u6DF1\u626B" : "\u5FEB\u626B",
              s.kind === "auto" ? " \xB7 \u81EA\u52A8" : ""
            ] }),
            /* @__PURE__ */ jsx4("td", { className: "dr-num", children: import_disk_core4.default.fmtBytes(s.total) }),
            /* @__PURE__ */ jsxs4("td", { className: "dr-num", children: [
              s.junkCount || 0,
              " \u9879"
            ] }),
            /* @__PURE__ */ jsxs4("td", { className: "dr-num", style: { color: "#5C6678" }, children: [
              Math.round((s.elapsedMs || 0) / 1e3),
              "s"
            ] })
          ] }, s.seq)) })
        ] }),
        !snaps.length && /* @__PURE__ */ jsx4("div", { className: "dr-empty", children: "\u8FD8\u6CA1\u6709\u5FEB\u7167\u3002" })
      ] }) })
    ] })
  ] });
}

// src/SettingsTab.tsx
import { useEffect as useEffect4, useState as useState5 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function Field({ title, hint, children }) {
  return /* @__PURE__ */ jsxs5("div", { className: "dr-field", children: [
    /* @__PURE__ */ jsxs5("div", { className: "dr-field-l", children: [
      /* @__PURE__ */ jsx5("b", { children: title }),
      hint && /* @__PURE__ */ jsx5("small", { children: hint })
    ] }),
    children
  ] });
}
function Toggle({ on, onClick }) {
  return /* @__PURE__ */ jsx5("button", { className: `dr-toggle ${on ? "on" : ""}`, onClick, children: /* @__PURE__ */ jsx5("i", {}) });
}
function SettingsTab({ data, reload, showToast }) {
  const [newPath, setNewPath] = useState5("");
  const [busy, setBusy] = useState5(false);
  const [svc, setSvc] = useState5(null);
  const [form, setForm] = useState5(null);
  const [extraDirsText, setExtraDirsText] = useState5("");
  const [excludeText, setExcludeText] = useState5("");
  useEffect4(() => {
    if (data && !form) {
      setForm(data.settings);
      setExtraDirsText((data.settings.extraJunkDirs || []).join(", "));
      setExcludeText((data.settings.excludeNames || []).join(", "));
    }
  }, [data, form]);
  const refreshSvc = () => listServiceStatus().then(setSvc).catch(() => setSvc(null));
  useEffect4(() => {
    refreshSvc();
    const t = setInterval(refreshSvc, 15e3);
    return () => clearInterval(t);
  }, []);
  const patch = (p) => {
    const next = { ...form, ...p };
    setForm(next);
    saveSettings(next).then(() => reload()).catch((e) => showToast(e.message, true));
  };
  const saveLists = () => {
    const parse = (t) => t.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    patch({ extraJunkDirs: parse(extraDirsText), excludeNames: parse(excludeText) });
  };
  const addRoot = async () => {
    if (!newPath.trim() || busy) return;
    setBusy(true);
    try {
      const r = await cmdRootsAdd(newPath.trim());
      if (!r.ok) {
        showToast(r.error || "\u767B\u8BB0\u5931\u8D25", true);
        return;
      }
      setNewPath("");
      showToast("\u5DF2\u767B\u8BB0\uFF08\u56DE\u300C\u603B\u89C8\u300D\u53D1\u8D77\u626B\u63CF\uFF09");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const removeRoot = async (rid) => {
    if (!window.confirm("\u79FB\u9664\u8BE5\u626B\u63CF\u6839\uFF1F\u5386\u53F2\u5FEB\u7167/\u5783\u573E\u6E05\u5355/\u9694\u79BB\u533A\u6E05\u5355\u90FD\u4F1A\u6E05\u6389\uFF08\u78C1\u76D8\u4E0A\u5DF2\u9694\u79BB\u7684\u6587\u4EF6\u4FDD\u7559\u4E0D\u52A8\uFF09\u3002")) return;
    try {
      const r = await cmdRootsRemove(rid);
      if (!r.ok) {
        showToast(r.error || "\u79FB\u9664\u5931\u8D25", true);
        return;
      }
      showToast("\u5DF2\u79FB\u9664");
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const svcState = svc?.state || svc?.status || "unknown";
  const svcRunning = svcState === "running";
  const listMyKeys = async () => {
    const { getHostInvoke: getHostInvoke2 } = await Promise.resolve().then(() => (init_host(), host_exports));
    const invoke = getHostInvoke2();
    const res = await invoke(
      "router_dispatch",
      { req: { target: "cap.kv", payload: { action: "list" } } }
    );
    const all = res.ok && res.result?.keys || [];
    return all.filter((k) => k.startsWith("diskrad."));
  };
  const exportData = async () => {
    try {
      const mine = await listMyKeys();
      const dump = {};
      for (const k of mine) {
        const v = await kvGet(k);
        dump[k] = v;
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `disk-radar-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(`\u5DF2\u5BFC\u51FA ${mine.length} \u4E2A\u952E`);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const clearAll = async () => {
    if (!window.confirm("\u6E05\u7A7A\u78C1\u76D8\u96F7\u8FBE\u7684\u5168\u90E8\u672C\u5730\u6570\u636E\uFF08\u8BBE\u7F6E/\u6839/\u5FEB\u7167/\u5783\u573E/\u9694\u79BB\u533A\u6E05\u5355\uFF09\uFF1F\u78C1\u76D8\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\u3002")) return;
    if (!window.confirm("\u518D\u6B21\u786E\u8BA4\uFF1A\u8FD9\u4E00\u6B65\u4E0D\u53EF\u64A4\u9500\uFF08\u9694\u79BB\u533A\u6587\u4EF6\u4ECD\u5728\u78C1\u76D8\u4E0A\uFF0C\u4F46\u9762\u677F\u4E0D\u518D\u663E\u793A\u5B83\u4EEC\uFF09\u3002")) return;
    try {
      const mine = await listMyKeys();
      for (const k of mine) await kvDel(k);
      await kvSet("diskrad.meta", { clearedAt: Date.now() });
      showToast(`\u5DF2\u6E05\u7A7A ${mine.length} \u4E2A\u952E`);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("div", { className: "dr-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "dr-bar" }),
      "\u626B\u63CF\u6839\u76EE\u5F55"
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-card", children: [
      (data?.roots || []).length ? (data?.roots || []).map((r) => /* @__PURE__ */ jsxs5("div", { className: "dr-item", children: [
        /* @__PURE__ */ jsxs5("div", { className: "dr-item-m", children: [
          /* @__PURE__ */ jsx5("div", { style: { fontSize: 12.5, fontWeight: 600 }, children: r.label || r.path }),
          /* @__PURE__ */ jsx5("div", { className: "dr-sub dr-mono", children: r.path })
        ] }),
        /* @__PURE__ */ jsx5("button", { className: "dr-btn sm danger", onClick: () => removeRoot(r.id), children: "\u79FB\u9664" })
      ] }, r.id)) : /* @__PURE__ */ jsx5("div", { className: "dr-empty", children: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u626B\u63CF\u6839\u3002" }),
      /* @__PURE__ */ jsxs5("div", { style: { display: "flex", gap: 8, padding: "9px 13px", borderTop: "1px solid #1a202c" }, children: [
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "dr-inp",
            placeholder: "\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\space",
            value: newPath,
            onChange: (e) => setNewPath(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") addRoot();
            }
          }
        ),
        /* @__PURE__ */ jsx5("button", { className: "dr-btn ghost", disabled: busy || !newPath.trim(), onClick: addRoot, children: "\u767B\u8BB0" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "dr-bar" }),
      "\u81EA\u52A8\u5FEB\u7167"
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-card", children: [
      /* @__PURE__ */ jsx5(Field, { title: "\u81EA\u52A8\u5FEB\u7167", hint: "\u5230\u671F\u81EA\u52A8\u5FEB\u626B\u4E00\u6B21\uFF0C\u589E\u91CF\u5F52\u56E0\u9760\u5B83\u79EF\u7D2F", children: /* @__PURE__ */ jsx5(Toggle, { on: form?.autoSnapshot ?? true, onClick: () => patch({ autoSnapshot: !(form?.autoSnapshot ?? true) }) }) }),
      /* @__PURE__ */ jsx5(Field, { title: "\u95F4\u9694\uFF08\u5C0F\u65F6\uFF09", hint: "\u6BCF\u4E2A\u6839\u7684\u5FEB\u7167\u5468\u671F", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-numin",
          type: "number",
          min: 1,
          max: 720,
          value: form?.snapshotHours ?? 24,
          onChange: (e) => patch({ snapshotHours: Math.max(1, Number(e.target.value) || 24) })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "dr-bar" }),
      "\u626B\u63CF\u4E0E\u4FDD\u7559"
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-card", children: [
      /* @__PURE__ */ jsx5(Field, { title: "\u5FEB\u626B\u9884\u7B97\uFF08\u79D2\uFF09", hint: "\u5355\u6839\u5355\u6B21\u5FEB\u626B\u7684\u65F6\u95F4\u4E0A\u9650\uFF0C\u8D85\u65F6\u843D\u300C\u4E0D\u5B8C\u6574\u300D\u5FEB\u7167", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-numin",
          type: "number",
          min: 10,
          max: 1800,
          value: form?.autoBudgetSec ?? 90,
          onChange: (e) => patch({ autoBudgetSec: Math.max(10, Number(e.target.value) || 90) })
        }
      ) }),
      /* @__PURE__ */ jsx5(Field, { title: "\u6DF1\u626B\u9884\u7B97\uFF08\u5206\u949F\uFF09", hint: "\u6DF1\u626B\u7684\u65F6\u95F4\u4E0A\u9650", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-numin",
          type: "number",
          min: 1,
          max: 120,
          value: form?.deepBudgetMin ?? 10,
          onChange: (e) => patch({ deepBudgetMin: Math.max(1, Number(e.target.value) || 10) })
        }
      ) }),
      /* @__PURE__ */ jsx5(Field, { title: "\u6BCF\u6839\u4FDD\u7559\u5FEB\u7167\u6570", hint: "\u8D85\u8FC7\u4F1A\u5220\u6700\u65E7\u7684", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-numin",
          type: "number",
          min: 3,
          max: 60,
          value: form?.keepSnapshots ?? 12,
          onChange: (e) => patch({ keepSnapshots: Math.max(3, Number(e.target.value) || 12) })
        }
      ) }),
      /* @__PURE__ */ jsx5(Field, { title: "\u9694\u79BB\u533A\u81EA\u52A8\u9500\u6BC1\uFF08\u5929\uFF09", hint: "\u79FB\u5165\u9694\u79BB\u533A\u8D85\u8FC7 N \u5929\u81EA\u52A8\u5F7B\u5E95\u5220\u9664\uFF1B0 = \u5173\u95ED\uFF08\u53EA\u8FDB\u4E0D\u51FA\uFF09", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-numin",
          type: "number",
          min: 0,
          max: 365,
          value: form?.quarantineDays ?? 14,
          onChange: (e) => patch({ quarantineDays: Math.max(0, Number(e.target.value) || 0) })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "dr-bar" }),
      "\u5783\u573E\u8BC6\u522B"
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-card", children: [
      /* @__PURE__ */ jsx5(Field, { title: "\u989D\u5916\u5783\u573E\u76EE\u5F55\u540D", hint: "\u9017\u53F7\u5206\u9694\uFF1B\u6309\u76EE\u5F55\u540D\u5168\u7B49\u5339\u914D\uFF0C\u5168\u6DF1\u5EA6\u751F\u6548", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-inp",
          style: { maxWidth: 190 },
          value: extraDirsText,
          onChange: (e) => setExtraDirsText(e.target.value),
          onBlur: saveLists,
          placeholder: "my-build-output, tmp-cache"
        }
      ) }),
      /* @__PURE__ */ jsx5(Field, { title: "\u5FFD\u7565\u76EE\u5F55\u540D", hint: "\u9017\u53F7\u5206\u9694\uFF1B\u8FD9\u4E9B\u76EE\u5F55\u4E0D\u8FDB\u5165\u626B\u63CF\u4E0E\u5783\u573E\u5224\u5B9A", children: /* @__PURE__ */ jsx5(
        "input",
        {
          className: "dr-inp",
          style: { maxWidth: 190 },
          value: excludeText,
          onChange: (e) => setExcludeText(e.target.value),
          onBlur: saveLists,
          placeholder: "Journal, $RECYCLE.BIN"
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "dr-bar" }),
      "\u670D\u52A1\u7BA1\u7406"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "dr-card", children: /* @__PURE__ */ jsxs5("div", { className: "dr-card-b", children: [
      /* @__PURE__ */ jsxs5("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsx5("span", { className: `dr-dot ${svcRunning ? "ok" : "down"}` }),
        /* @__PURE__ */ jsxs5("b", { style: { fontSize: 12.5 }, children: [
          "disk-radar-service \xB7 ",
          svcRunning ? "\u8FD0\u884C\u4E2D" : svcState === "error" ? "\u51FA\u9519" : svcState
        ] }),
        svc?.lastError && /* @__PURE__ */ jsx5("span", { className: "dr-sub", style: { color: "#F85149" }, children: svc.lastError })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "dr-actions", children: [
        /* @__PURE__ */ jsx5("button", { className: "dr-btn sm", onClick: async () => {
          try {
            await serviceAction("start");
            showToast("\u5DF2\u8BF7\u6C42\u542F\u52A8");
            setTimeout(refreshSvc, 1500);
          } catch (e) {
            showToast(e.message, true);
          }
        }, children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx5("button", { className: "dr-btn sm ghost", onClick: async () => {
          try {
            await serviceAction("restart");
            showToast("\u5DF2\u8BF7\u6C42\u91CD\u542F");
            setTimeout(refreshSvc, 1500);
          } catch (e) {
            showToast(e.message, true);
          }
        }, children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx5("button", { className: "dr-btn sm ghost", onClick: async () => {
          try {
            await serviceAction("stop");
            showToast("\u5DF2\u8BF7\u6C42\u505C\u6B62");
            setTimeout(refreshSvc, 1500);
          } catch (e) {
            showToast(e.message, true);
          }
        }, children: "\u505C\u6B62" })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "dr-sub", style: { marginTop: 6 }, children: [
        "\u5FC3\u8DF3\uFF1A",
        data?.meta?.lastTickAt ? new Date(data.meta.lastTickAt).toLocaleTimeString("zh-CN", { hour12: false }) : "\u65E0",
        data?.meta?.bridge ? ` \xB7 \u6865 ${data.meta.bridge}` : "",
        " \xB7 \u96F6\u5916\u7F51\u8BF7\u6C42\uFF0C\u65E5\u5FD7 ",
        `<appConfigDir>/disk-radar.log`
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-sec", children: [
      /* @__PURE__ */ jsx5("span", { className: "dr-bar" }),
      "\u6570\u636E\u7BA1\u7406"
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "dr-card", children: /* @__PURE__ */ jsxs5("div", { className: "dr-card-b", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx5("button", { className: "dr-btn sm ghost", onClick: exportData, children: "\u5BFC\u51FA\u5168\u90E8\u6570\u636E\uFF08JSON\uFF09" }),
      /* @__PURE__ */ jsx5("button", { className: "dr-btn sm danger", onClick: clearAll, children: "\u6E05\u7A7A\u672C\u63D2\u4EF6\u5168\u90E8\u6570\u636E" })
    ] }) }),
    /* @__PURE__ */ jsxs5("div", { className: "dr-sub", style: { padding: "0 18px 14px", lineHeight: 1.8 }, children: [
      /* @__PURE__ */ jsx5("b", { children: "\u952E\u7A7A\u95F4\u5951\u7EA6" }),
      "\uFF08cap.kv\uFF0C\u524D\u7F00 ",
      /* @__PURE__ */ jsx5("code", { children: "diskrad." }),
      "\uFF09\uFF1Asettings/roots/scan/state/meta \u5355\u952E\uFF1B snap.<rid>.<seq> \u5FEB\u7167\uFF1Bjunk./qman.<rid> \u6E05\u5355\uFF1Bcmd./result.<nonce> \u547D\u4EE4\u901A\u9053\uFF08\u5148\u5220\u540E\u505A\uFF09\u3002 \u670D\u52A1\u662F\u552F\u4E00\u5199\u8005\uFF0C\u9762\u677F\u4E0E AI \u7ECF\u547D\u4EE4\u952E\u8868\u8FBE\u610F\u56FE\u3002"
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.dr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dr-body::-webkit-scrollbar{width:9px;height:9px}
.dr-body::-webkit-scrollbar-track{background:transparent}
.dr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dr-page{max-width:560px;margin:0 auto}

.dr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#58A6FF,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dr-tt{flex:1;min-width:0}
.dr-tt b{font-size:15px;display:block}
.dr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.dr-dot.stale{background:#D29922}
.dr-dot.down{background:#F85149}
.dr-tabs{display:flex;gap:4px;overflow-x:auto;max-width:60%}
.dr-tabs::-webkit-scrollbar{display:none}
.dr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative;white-space:nowrap;flex-shrink:0}
.dr-tab:hover{color:#E6EAF2}
.dr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.dr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#58A6FF,#BC8CFF);flex-shrink:0}
.dr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dr-card-b{padding:11px 13px}
.dr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dr-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.dr-badge-txt{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.dr-badge-txt.warn{background:rgba(210,153,34,.12);color:#D29922;border-color:#5a4316}
.dr-badge-txt.bad{background:rgba(248,81,73,.1);color:#F85149;border-color:#54262c}
.dr-badge-txt.good{background:rgba(63,185,80,.1);color:#3FB950;border-color:#2a5a38}
.dr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dr-btn:hover{filter:brightness(1.1)}
.dr-btn:disabled{opacity:.45;cursor:not-allowed}
.dr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dr-btn.amber{background:#3a2d12;color:#D29922;border:1px solid #5a4316}
.dr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dr-inp:focus{outline:none;border-color:#2b6cb0}
.dr-inp::placeholder{color:#4d5566}
.dr-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;width:100%}
.dr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.dr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.dr-toast.bad{border-color:#54262c;color:#FF8A9A}
.dr-spin{display:inline-block;width:11px;height:11px;border:2px solid #3d4657;border-top-color:#58A6FF;border-radius:50%;animation:dr-spin .8s linear infinite;vertical-align:-1px}
@keyframes dr-spin{to{transform:rotate(360deg)}}

/* \u6839\u5361\u7247 */
.dr-rootcard{position:relative}
.dr-total{font-size:22px;font-weight:800;letter-spacing:.3px}
.dr-volbar{height:6px;border-radius:3px;background:#0d1017;overflow:hidden;margin-top:7px;display:flex}
.dr-volbar i{display:block;height:100%}
.dr-kv{color:#5C6678;font-size:10.5px}
.dr-kv b{color:#B4B4B8;font-weight:600}
.dr-delta{font-weight:700}
.dr-delta.up{color:#F85149}
.dr-delta.down{color:#3FB950}
.dr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.dr-mono{font:11px/1.5 Consolas,Menlo,monospace;word-break:break-all}

/* \u8FDB\u5EA6\u6761 */
.dr-prog{background:#0d1017;border-radius:8px;padding:9px 11px;margin:0 16px 10px;border:1px solid #242C3A}
.dr-prog-track{height:7px;border-radius:4px;background:#161B22;overflow:hidden;margin:6px 0 4px}
.dr-prog-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#58A6FF,#BC8CFF);animation:dr-pulse 1.6s ease-in-out infinite}
@keyframes dr-pulse{0%,100%{opacity:.65}50%{opacity:1}}

/* \u8868\u683C */
.dr-tbl{width:100%;border-collapse:collapse;font-size:11px}
.dr-tbl th{color:#5C6678;font-weight:600;text-align:left;padding:4px 8px;border-bottom:1px solid #212836;white-space:nowrap}
.dr-tbl td{padding:5px 8px;border-bottom:1px solid #1a202c;vertical-align:top}
.dr-tbl tr:last-child td{border-bottom:none}
.dr-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}

/* \u6811\u56FE */
.dr-mapwrap{margin:0 16px 10px;background:#0d1017;border:1px solid #212836;border-radius:10px;overflow:hidden}
.dr-mapcell{cursor:pointer;stroke:#10141C;stroke-width:1}
.dr-mapcell:hover{filter:brightness(1.25)}
.dr-crumbs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:8px 16px 0;font-size:11px;color:#8B95A7}
.dr-crumb{background:#1C2330;border:1px solid #242C3A;border-radius:6px;padding:2px 8px;cursor:pointer;color:#8B95A7}
.dr-crumb:hover{color:#E6EAF2}
.dr-crumb.cur{color:#E6EAF2;font-weight:700;border-color:#2b6cb0}

/* \u5783\u573E\u5206\u7EC4 */
.dr-junk-h{display:flex;align-items:center;gap:8px;padding:8px 13px;border-top:1px solid #1d2330;font-weight:700;font-size:12.5px}
.dr-junk-h:first-child{border-top:none}
.dr-item{display:flex;align-items:center;gap:8px;padding:7px 13px;border-top:1px solid #1a202c}
.dr-item-m{flex:1;min-width:0}

/* \u8BBE\u7F6E\u5B57\u6BB5 */
.dr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.dr-field:first-child{border-top:none}
.dr-field-l{flex:1;min-width:0}
.dr-field-l b{font-size:12.5px;display:block}
.dr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.dr-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.dr-toggle.on{background:#2b6cb0}
.dr-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.dr-toggle.on i{left:18px}
.dr-numin{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`;
function DiskRadarPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState6("overview");
  const [data, setData] = useState6(null);
  const [loadErr, setLoadErr] = useState6("");
  const [toast, setToast] = useState6(null);
  const showToast = useCallback4((msg, bad) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback4(async () => {
    try {
      const d = await loadPanelData();
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect5(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 4e3);
    const onVis = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const heartbeat = (() => {
    if (!data) return { cls: "", text: "\u8F7D\u5165\u4E2D\u2026" };
    const last = data.meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u670D\u52A1\u672A\u62A5\u544A\u5FC3\u8DF3" };
    const age = Date.now() - last;
    if (age < 120 * 1e3) return { cls: "ok", text: `\u96F7\u8FBE\u5728\u7EBF \xB7 \u626B\u63CF\u6839 ${data.roots.length}` };
    return { cls: "stale", text: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  const tabProps = { data, reload, showToast, goTab: setTab, pluginId };
  return /* @__PURE__ */ jsxs6("div", { className: "dr-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "dr-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "dr-logo", children: "\u{1F4E1}" }),
      /* @__PURE__ */ jsxs6("div", { className: "dr-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u78C1\u76D8\u96F7\u8FBE" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          /* @__PURE__ */ jsx6("i", { className: `dr-dot ${heartbeat.cls}` }),
          heartbeat.text,
          data?.meta?.version ? ` \xB7 v${data.meta.version}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "dr-tabs", children: [
        ["overview", "\u603B\u89C8"],
        ["map", "\u7A7A\u95F4\u5730\u56FE"],
        ["junk", "\u5783\u573E\u6E05\u7406"],
        ["history", "\u5386\u53F2"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx6("button", { className: `dr-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "dr-body", children: /* @__PURE__ */ jsxs6("div", { className: "dr-page", children: [
      loadErr && /* @__PURE__ */ jsxs6("div", { className: "dr-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx6(OverviewTab, { ...tabProps, onSendToChat }),
      tab === "map" && /* @__PURE__ */ jsx6(SpaceMapTab, { ...tabProps }),
      tab === "junk" && /* @__PURE__ */ jsx6(JunkTab, { ...tabProps }),
      tab === "history" && /* @__PURE__ */ jsx6(HistoryTab, { ...tabProps }),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { ...tabProps })
    ] }) }),
    toast && /* @__PURE__ */ jsx6("div", { className: `dr-toast ${toast.bad ? "bad" : ""}`, children: toast.msg })
  ] });
}
function RootSelect({ data, value, onChange }) {
  const roots = data?.roots || [];
  return /* @__PURE__ */ jsx6("div", { className: "dr-card-b", style: { paddingBottom: 4 }, children: /* @__PURE__ */ jsxs6("select", { className: "dr-sel", value, onChange: (e) => onChange(e.target.value), children: [
    !roots.length && /* @__PURE__ */ jsx6("option", { value: "", children: "\uFF08\u5C1A\u65E0\u626B\u63CF\u6839\uFF09" }),
    roots.map((r) => /* @__PURE__ */ jsx6("option", { value: r.id, children: r.label || r.path }, r.id))
  ] }) });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function DiskRadarEntry(props) {
  return /* @__PURE__ */ jsx7(DiskRadarPanel, { ...props });
}
export {
  DiskRadarEntry as default
};
