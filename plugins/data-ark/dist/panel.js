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

// shared/ark-core.js
var require_ark_core = __commonJS({
  "shared/ark-core.js"(exports, module) {
    "use strict";
    var K2 = {
      PREFIX: "dataark.",
      settings: "dataark.settings",
      state: "dataark.state",
      snapshot: (id) => `dataark.snapshot.${id}`,
      snapshotPrefix: "dataark.snapshot.",
      event: (ts, rand) => `dataark.event.${ts}.${rand}`,
      eventPrefix: "dataark.event.",
      cmdBackup: "dataark.cmd.backup",
      cmdVerify: (id) => `dataark.cmd.verify.${id}`,
      cmdGc: "dataark.cmd.gc",
      cmdRestore: (nonce2) => `dataark.cmd.restore.${nonce2}`,
      cmdListFiles: (nonce2) => `dataark.cmd.listfiles.${nonce2}`,
      cmdResult: (nonce2) => `dataark.cmd.result.${nonce2}`,
      cmdPrefix: "dataark.cmd.",
      cmdResultPrefix: "dataark.cmd.result."
    };
    var PLUGIN_ID3 = "data-ark";
    var SERVICE_ID3 = "ark-service";
    var DEFAULT_EXCLUDE_TOP3 = ["logs", "cache", "plugins"];
    var BUILTIN_EXCLUDE = ["*.lock", "*.tmp", "*.swp", "~$*", ".ark-tmp-*", "*.ark-partial"];
    var DEFAULT_SETTINGS3 = {
      schemaVersion: 1,
      /** 备份库根目录；空 = 服务端解析为 <数据根>/../polaris-ark */
      targetDir: "",
      /** 数据根一级条目排除（目录名或文件名） */
      excludeTop: [...DEFAULT_EXCLUDE_TOP3],
      /** 额外排除 glob（相对数据根路径，支持 ** * ?） */
      extraExcludeGlobs: [],
      /** GFS 保留：近 N 天每天留最新 / 近 N 周每周留最新 / 近 N 月每月留最新 */
      retention: { daily: 7, weekly: 5, monthly: 3 },
      /** 调度：off | interval（每 N 小时） | daily（每天 HH:MM 本地时间） */
      schedule: { mode: "interval", intervalHours: 12, at: "03:30" },
      /** 备份库总占用上限（字节，默认 5GB），超限先 GC，仍超则进入 degraded 暂停自动备份 */
      maxStoreBytes: 5 * 1024 * 1024 * 1024
    };
    function normalizeSettings2(raw) {
      const s = raw && typeof raw === "object" ? raw : {};
      const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS3));
      if (s.targetDir !== void 0) {
        if (s.targetDir !== null && typeof s.targetDir !== "string") return { error: "targetDir \u5FC5\u987B\u662F\u5B57\u7B26\u4E32" };
        out.targetDir = String(s.targetDir || "").trim();
      }
      if (s.excludeTop !== void 0) {
        if (!Array.isArray(s.excludeTop)) return { error: "excludeTop \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4" };
        const names = [...new Set(s.excludeTop.map((x) => String(x || "").trim().replace(/[\\/]+$/, "")).filter(Boolean))];
        for (const n of names) {
          if (n.includes("..") || n.includes("/") || n.includes("\\")) return { error: `excludeTop \u53EA\u80FD\u662F\u4E00\u7EA7\u540D\u79F0\uFF0C\u975E\u6CD5\uFF1A${n}` };
        }
        out.excludeTop = names;
      }
      if (s.extraExcludeGlobs !== void 0) {
        if (!Array.isArray(s.extraExcludeGlobs)) return { error: "extraExcludeGlobs \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4" };
        out.extraExcludeGlobs = [...new Set(s.extraExcludeGlobs.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 50);
      }
      if (s.retention !== void 0) {
        const r = s.retention && typeof s.retention === "object" ? s.retention : {};
        for (const k of ["daily", "weekly", "monthly"]) {
          const n = Number(r[k]);
          if (Number.isFinite(n)) out.retention[k] = Math.min(366, Math.max(0, Math.round(n)));
        }
      }
      if (s.schedule !== void 0) {
        const sc = s.schedule && typeof s.schedule === "object" ? s.schedule : {};
        const mode = sc.mode === "off" || sc.mode === "daily" || sc.mode === "interval" ? sc.mode : "interval";
        out.schedule = { mode, intervalHours: out.schedule.intervalHours, at: out.schedule.at };
        if (mode === "interval") {
          const n = Number(sc.intervalHours);
          if (Number.isFinite(n)) out.schedule.intervalHours = Math.min(24 * 30, Math.max(1, Math.round(n)));
        }
        if (mode === "daily") {
          const at = String(sc.at || "");
          if (/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) out.schedule.at = at;
        }
      }
      if (s.maxStoreBytes !== void 0) {
        const n = Number(s.maxStoreBytes);
        if (Number.isFinite(n)) out.maxStoreBytes = Math.min(16 * 1024 * 1024 * 1024 * 1024, Math.max(64 * 1024 * 1024, Math.round(n)));
      }
      return { settings: out };
    }
    function globToRegex(pattern) {
      const p = String(pattern).trim().replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
      let re = "";
      for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (c === "*") {
          if (p[i + 1] === "*") {
            if (p[i + 2] === "/") {
              re += "(?:.*/)?";
              i += 2;
            } else {
              re += ".*";
              i += 1;
            }
          } else re += "[^/]*";
        } else if (c === "?") re += "[^/]";
        else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      }
      return new RegExp(`^${re}$`, "i");
    }
    var _globCache = /* @__PURE__ */ new Map();
    function compileGlob(pattern) {
      let re = _globCache.get(pattern);
      if (!re) {
        re = globToRegex(pattern);
        if (_globCache.size > 200) _globCache.clear();
        _globCache.set(pattern, re);
      }
      return re;
    }
    function isExcluded(relPath, { excludeTop, extraExcludeGlobs } = {}) {
      const rel = String(relPath).replace(/\\/g, "/").replace(/^\/+/, "");
      if (!rel || rel.split("/").includes("..")) return true;
      const base = rel.slice(rel.lastIndexOf("/") + 1);
      for (const pat of BUILTIN_EXCLUDE) {
        if (compileGlob(pat).test(base)) return true;
      }
      const top = rel.split("/")[0];
      if (Array.isArray(excludeTop) && excludeTop.includes(top)) return true;
      if (Array.isArray(extraExcludeGlobs)) {
        for (const pat of extraExcludeGlobs) {
          const re = compileGlob(pat);
          if (re.test(rel) || re.test(base)) return true;
        }
      }
      return false;
    }
    var FIRST_RUN_DELAY_MS = 90 * 1e3;
    function planNextRun(schedule, now, lastRunAt) {
      const sc = schedule && typeof schedule === "object" ? schedule : DEFAULT_SETTINGS3.schedule;
      if (sc.mode === "off") return null;
      if (sc.mode === "interval") {
        const ivl = Math.max(1, Number(sc.intervalHours) || 12) * 3600 * 1e3;
        if (!Number.isFinite(Number(lastRunAt)) || Number(lastRunAt) <= 0) return now + FIRST_RUN_DELAY_MS;
        return Number(lastRunAt) + ivl;
      }
      const [hh, mm] = String(sc.at || "03:30").split(":").map(Number);
      const d = new Date(now);
      const todayAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
      const ranToday = Number.isFinite(Number(lastRunAt)) && Number(lastRunAt) >= todayAt;
      return ranToday ? todayAt + 864e5 : now < todayAt ? todayAt : todayAt + 864e5;
    }
    function catchUpInfo(state, schedule, now) {
      const next = state && Number.isFinite(Number(state.nextRunAt)) ? Number(state.nextRunAt) : null;
      if (!next || schedule?.mode === "off") return { overdue: false, missed: 0 };
      if (now < next) return { overdue: false, missed: 0 };
      const sc = schedule || {};
      let unit = 864e5;
      if (sc.mode === "interval") unit = Math.max(1, Number(sc.intervalHours) || 12) * 3600 * 1e3;
      const missed = Math.min(99, Math.max(1, Math.floor((now - next) / unit) + 1));
      return { overdue: true, missed };
    }
    var pad2 = (n) => String(n).padStart(2, "0");
    function dayKeyOf(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function weekKeyOf(ts) {
      const d = new Date(ts);
      const day = (d.getDay() + 6) % 7;
      const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
      return `${thursday.getFullYear()}-W${pad2(isoWeekNumber(thursday))}`;
    }
    function isoWeekNumber(d) {
      const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayNr = (target.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = new Date(target.getFullYear(), 0, 4);
      const fDayNr = (firstThursday.getDay() + 6) % 7;
      firstThursday.setDate(firstThursday.getDate() - fDayNr + 3);
      return 1 + Math.round((target - firstThursday) / (7 * 864e5));
    }
    function monthKeyOf(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    }
    function planRotation(manifests, retention, now) {
      const r = { daily: 7, weekly: 5, monthly: 3, ...retention && typeof retention === "object" ? retention : {} };
      const ok = (manifests || []).filter((m) => m && m.id && Number.isFinite(Number(m.finishedAt))).sort((a, b) => Number(b.finishedAt) - Number(a.finishedAt));
      if (!ok.length) return { keep: [], prune: [] };
      const keep = /* @__PURE__ */ new Set([ok[0].id]);
      if (ok[1]) keep.add(ok[1].id);
      const buckets = { day: /* @__PURE__ */ new Map(), week: /* @__PURE__ */ new Map(), month: /* @__PURE__ */ new Map() };
      const windows = { day: r.daily * 864e5, week: r.weekly * 7 * 864e5, month: r.monthly * 30 * 864e5 };
      const keyFns = { day: dayKeyOf, week: weekKeyOf, month: monthKeyOf };
      for (const m of ok) {
        const t = Number(m.finishedAt);
        for (const g of ["day", "week", "month"]) {
          if (r[g] <= 0) continue;
          if (now - t > windows[g]) continue;
          const k = keyFns[g](t);
          if (!buckets[g].has(k)) buckets[g].set(k, m.id);
        }
      }
      for (const g of Object.keys(buckets)) {
        for (const id of buckets[g].values()) keep.add(id);
      }
      const prune = ok.filter((m) => !keep.has(m.id)).map((m) => m.id);
      return { keep: [...keep], prune };
    }
    function needsHash(prevEntry, stat) {
      if (!prevEntry) return true;
      return Number(prevEntry.s) !== stat.size || Math.abs(Number(prevEntry.m) - stat.mtimeMs) > 1;
    }
    function summarizeManifest(manifest) {
      return {
        id: manifest.id,
        startedAt: manifest.startedAt,
        finishedAt: manifest.finishedAt,
        durationMs: manifest.finishedAt - manifest.startedAt,
        type: manifest.baseId ? "incremental" : "full",
        baseId: manifest.baseId || null,
        totalFiles: (manifest.files || []).length,
        changedFiles: (manifest.files || []).filter((f) => f.c).length,
        skipped: (manifest.skipped || []).length,
        logicalBytes: (manifest.files || []).reduce((a, f) => a + (Number(f.s) || 0), 0),
        newObjects: manifest.stats?.newObjects || 0,
        storedBytes: manifest.stats?.storedBytes || 0,
        ok: manifest.ok !== false,
        error: manifest.error || null
      };
    }
    function formatBytes3(n) {
      const b = Number(n) || 0;
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(1)} MB`;
      return `${(b / 1073741824).toFixed(2)} GB`;
    }
    function fmtDuration3(ms) {
      const s = Math.round((Number(ms) || 0) / 1e3);
      if (s < 60) return `${s} \u79D2`;
      if (s < 3600) return `${Math.floor(s / 60)} \u5206 ${s % 60} \u79D2`;
      return `${Math.floor(s / 3600)} \u65F6 ${Math.floor(s % 3600 / 60)} \u5206`;
    }
    function timeAgo3(ts, now) {
      const n = Number.isFinite(Number(now)) ? Number(now) : Date.now();
      if (!Number.isFinite(Number(ts)) || ts <= 0) return "\u4ECE\u672A";
      const d = n - ts;
      if (d < 60 * 1e3) return "\u521A\u521A";
      if (d < 3600 * 1e3) return `${Math.floor(d / 6e4)} \u5206\u949F\u524D`;
      if (d < 86400 * 1e3) return `${Math.floor(d / 36e5)} \u5C0F\u65F6\u524D`;
      return `${Math.floor(d / 864e5)} \u5929\u524D`;
    }
    function pruneEvents(entries, cap = 50) {
      const arr = (entries || []).filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.at))).sort((a, b) => Number(b.at) - Number(a.at));
      return arr.slice(0, cap);
    }
    function restoreStamp(now) {
      const d = new Date(Number.isFinite(Number(now)) ? Number(now) : Date.now());
      return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
    }
    module.exports = {
      K: K2,
      PLUGIN_ID: PLUGIN_ID3,
      SERVICE_ID: SERVICE_ID3,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS3,
      DEFAULT_EXCLUDE_TOP: DEFAULT_EXCLUDE_TOP3,
      BUILTIN_EXCLUDE,
      FIRST_RUN_DELAY_MS,
      normalizeSettings: normalizeSettings2,
      isExcluded,
      globToRegex,
      planNextRun,
      catchUpInfo,
      planRotation,
      needsHash,
      summarizeManifest,
      formatBytes: formatBytes3,
      fmtDuration: fmtDuration3,
      timeAgo: timeAgo3,
      pruneEvents,
      restoreStamp,
      dayKeyOf,
      weekKeyOf,
      monthKeyOf
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect2, useRef, useState as useState5 } from "react";

// src/host.ts
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

// src/model.ts
var core = __toESM(require_ark_core());
var PLUGIN_ID2 = core.PLUGIN_ID;
var SERVICE_ID2 = core.SERVICE_ID;
var DEFAULT_SETTINGS2 = core.DEFAULT_SETTINGS;
var DEFAULT_EXCLUDE_TOP2 = core.DEFAULT_EXCLUDE_TOP;
var formatBytes2 = core.formatBytes;
var fmtDuration2 = core.fmtDuration;
var timeAgo2 = core.timeAgo;
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r.value ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
async function loadOverview() {
  const keys = await kvKeys();
  const snapKeys = keys.filter((k) => k.startsWith(core.K.snapshotPrefix));
  const eventKeys = keys.filter((k) => k.startsWith(core.K.eventPrefix));
  const [settingsRaw, state, snapVals, eventVals] = await Promise.all([
    kvGet(core.K.settings).catch(() => null),
    kvGet(core.K.state).catch(() => null),
    Promise.all(snapKeys.map((k) => kvGet(k).catch(() => null))),
    Promise.all(eventKeys.map((k) => kvGet(k).catch(() => null)))
  ]);
  const norm = core.normalizeSettings(settingsRaw && typeof settingsRaw === "object" ? settingsRaw : {});
  return {
    settings: norm.error ? { ...DEFAULT_SETTINGS2 } : norm.settings,
    state: state && typeof state === "object" ? state : {},
    snapshots: snapVals.filter((s) => !!s && typeof s === "object" && !!s.id).sort((a, b) => Number(b.finishedAt) - Number(a.finishedAt)),
    events: eventVals.filter((e) => !!e && typeof e === "object" && Number.isFinite(Number(e.at))).sort((a, b) => Number(b.at) - Number(a.at))
  };
}
function nonce() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
async function runCmd(write, resultKey, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 6e4;
  const pollMs = opts.pollMs ?? 1500;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, pollMs));
    opts.onPoll?.();
    const r = await kvGet(resultKey).catch(() => null);
    if (r && typeof r === "object") {
      kvDel(resultKey).catch(() => {
      });
      return r;
    }
  }
  return { ok: false, error: `\u7B49\u5F85\u670D\u52A1\u7ED3\u679C\u8D85\u65F6\uFF08${Math.round(timeoutMs / 1e3)}s\uFF09\u2014\u2014\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF0C\u53BB\u300C\u670D\u52A1\u300D\u9875\u542F\u52A8/\u91CD\u542F` };
}
var nonceKey = (prefix) => `${prefix}.${nonce()}`;
async function triggerBackup() {
  await kvSet(core.K.cmdBackup, { op: "backup", at: Date.now() });
}
async function triggerVerify(snapId, mode) {
  await kvSet(core.K.cmdVerify(snapId || "latest"), { op: "verify", mode, at: Date.now() });
}
async function triggerGc() {
  await kvSet(core.K.cmdGc, { op: "gc", at: Date.now() });
}
async function restoreFiles(snapId, paths, onPoll) {
  const key = nonceKey("dataark.cmd.restore");
  const resultKey = core.K.cmdResult(key.slice("dataark.cmd.restore.".length));
  await kvSet(key, { snapId, paths, at: Date.now() });
  return runCmd(() => Promise.resolve(), resultKey, { timeoutMs: 18e4, onPoll });
}
async function listSnapshotFiles(snapId, query, onPoll) {
  const key = nonceKey("dataark.cmd.listfiles");
  const resultKey = core.K.cmdResult(key.slice("dataark.cmd.listfiles.".length));
  await kvSet(key, { snapId, query, limit: 200, at: Date.now() });
  return runCmd(() => Promise.resolve(), resultKey, { timeoutMs: 3e4, onPoll });
}
async function saveSettings(s) {
  const norm = core.normalizeSettings(s);
  if (norm.error) return { ok: false, error: norm.error };
  await kvSet(core.K.settings, norm.settings);
  return { ok: true };
}
async function resetRuntimeState() {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.snapshotPrefix) || k.startsWith(core.K.eventPrefix) || k.startsWith(core.K.cmdPrefix) || k === core.K.state);
  await Promise.all(keys.map((k) => kvDel(k)));
  return keys.length;
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
async function discoverSelf(pluginId) {
  const r = await capDispatch("cap.pluginDiscovery", { action: "discover" });
  const self = (r.plugins ?? []).find((p) => p && p.id === pluginId);
  if (!self || !self.installPath) return null;
  const services = self.contributes?.services ?? [];
  return { installPath: self.installPath, services };
}
function toBackendContribution(c) {
  return {
    id: c.id,
    type: c.type ?? c.serviceType,
    command: c.command,
    argsTemplate: Array.isArray(c.argsTemplate) ? c.argsTemplate : [],
    port: c.port ?? null,
    healthCheck: c.healthCheck ?? null,
    healthCheckTimeout: c.healthCheckTimeout ?? null,
    autoStart: c.autoStart ?? true,
    restartOnFailure: c.restartOnFailure ?? true,
    maxRestarts: c.maxRestarts ?? 3,
    description: c.description ?? null
  };
}
async function serviceAction(action, pluginId, serviceId) {
  if (action === "start") {
    const self = await discoverSelf(pluginId);
    const svc = self?.services.find((s) => s.id === serviceId);
    if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u4E2D\u627E\u4E0D\u5230\u672C\u63D2\u4EF6\u7684\u670D\u52A1\u8D21\u732E\uFF08\u8BF7\u5237\u65B0\u63D2\u4EF6\u5217\u8868\u540E\u91CD\u8BD5\uFF09");
    await capDispatch("cap.pluginServiceManager", {
      action: "start",
      pluginId,
      installPath: self.installPath,
      contribution: toBackendContribution(svc)
    });
    return;
  }
  await capDispatch("cap.pluginServiceManager", { action, pluginId, serviceId });
}

// src/SnapshotsTab.tsx
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function SnapshotsTab({ data, reload, showToast, goRestore }) {
  const [busy, setBusy] = useState("");
  const [expanded, setExpanded] = useState("");
  if (!data) return /* @__PURE__ */ jsx("div", { className: "da-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const st = data.state;
  const doAction = async (name, fn, doneMsg) => {
    if (busy) return;
    setBusy(name);
    try {
      await fn();
      showToast(doneMsg, "good");
      await reload();
    } catch (e) {
      showToast(`${name}\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy("");
    }
  };
  const last = data.snapshots[0];
  return /* @__PURE__ */ jsxs("div", { children: [
    st.degraded && /* @__PURE__ */ jsxs("div", { className: "da-banner bad", children: [
      "\u26A0\uFE0F ",
      st.degraded.reason
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "da-bar" }),
      "\u64CD\u4F5C",
      /* @__PURE__ */ jsx("span", { className: "da-hint", children: last ? `\u6700\u65B0 ${timeAgo2(last.finishedAt)}` : "\u5C1A\u672A\u5907\u4EFD" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "da-card", children: /* @__PURE__ */ jsxs("div", { className: "da-card-b", children: [
      /* @__PURE__ */ jsxs("div", { className: "da-row", children: [
        /* @__PURE__ */ jsx("button", { className: "da-btn", disabled: !!busy, onClick: () => void doAction("\u5907\u4EFD", () => triggerBackup(), "\u5DF2\u89E6\u53D1\u5FEB\u7167\u2014\u2014\u5B8C\u6210\u540E\u770B\u4E0B\u65B9\u6E05\u5355\u4E0E\u4E8B\u4EF6"), children: "\u7ACB\u5373\u5907\u4EFD" }),
        /* @__PURE__ */ jsx("button", { className: "da-btn ghost", disabled: !!busy || !last, onClick: () => void doAction("\u6821\u9A8C", () => triggerVerify("latest", "quick"), "\u5DF2\u89E6\u53D1\u5FEB\u901F\u6821\u9A8C\uFF08\u5BF9\u8C61\u5B58\u5728\u6027\uFF09"), children: "\u5FEB\u901F\u6821\u9A8C" }),
        /* @__PURE__ */ jsx("button", { className: "da-btn ghost", disabled: !!busy || !last, onClick: () => void doAction("\u6DF1\u5EA6\u6821\u9A8C", () => triggerVerify("latest", "deep"), "\u5DF2\u89E6\u53D1\u6DF1\u5EA6\u6821\u9A8C\uFF08\u9010\u5BF9\u8C61\u91CD\u54C8\u5E0C\uFF0C\u7A0D\u6162\uFF09"), children: "\u6DF1\u5EA6\u6821\u9A8C" }),
        /* @__PURE__ */ jsx("button", { className: "da-btn warn", disabled: !!busy, onClick: () => void doAction("\u56DE\u6536", () => triggerGc(), "\u5DF2\u89E6\u53D1\u7A7A\u95F4\u56DE\u6536\uFF08\u6309\u4FDD\u7559\u7B56\u7565\u88C1\u526A+GC\uFF09"), children: "\u56DE\u6536\u7A7A\u95F4" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "da-sub", style: { marginTop: 8 }, children: [
        st.lastResult && (st.lastResult.ok ? /* @__PURE__ */ jsxs(Fragment, { children: [
          "\u4E0A\u6B21\u7ED3\u679C\uFF1A",
          st.lastResult.summary?.totalFiles ?? "?",
          " \u6587\u4EF6 / \u53D8\u66F4 ",
          st.lastResult.summary?.changedFiles ?? "?",
          " / \u65B0\u5BF9\u8C61 ",
          st.lastResult.summary?.newObjects ?? "?",
          "\uFF08",
          formatBytes2(st.lastResult.summary?.storedBytes || 0),
          "\uFF09\xB7 ",
          fmtDuration2(st.lastResult.summary?.durationMs || 0)
        ] }) : /* @__PURE__ */ jsxs("span", { style: { color: "#FF8A9A" }, children: [
          "\u4E0A\u6B21\u5931\u8D25\uFF1A",
          st.lastResult.error
        ] })),
        st.lastVerify && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("br", {}),
          "\u6700\u8FD1\u6821\u9A8C\uFF1A",
          st.lastVerify.snapId,
          "\uFF08",
          st.lastVerify.mode,
          "\uFF09",
          st.lastVerify.ok ? "\u2705 \u5B8C\u597D" : /* @__PURE__ */ jsxs("span", { style: { color: "#FF8A9A" }, children: [
            "\u2717 \u7F3A\u5931 ",
            st.lastVerify.missing?.length || 0,
            " / \u635F\u574F ",
            st.lastVerify.corrupt?.length || 0
          ] }),
          " \xB7 ",
          timeAgo2(st.lastVerify.at)
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx("i", { className: "da-bar" }),
      "\u5FEB\u7167\u6E05\u5355",
      /* @__PURE__ */ jsxs("span", { className: "da-hint", children: [
        data.snapshots.length,
        " \u4EFD"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "da-card", children: /* @__PURE__ */ jsxs("div", { className: "da-card-b", children: [
      data.snapshots.length === 0 && /* @__PURE__ */ jsxs("div", { className: "da-empty", children: [
        "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5FEB\u7167\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "\u70B9\u4E0A\u65B9\u300C\u7ACB\u5373\u5907\u4EFD\u300D\u505A\u7B2C\u4E00\u6B21\u5168\u91CF\u2014\u2014\u6570\u636E\u6839\u5185\u5BB9\u4F1A\u88AB\u538B\u7F29\u53BB\u91CD\u5165\u5E93\uFF0C",
        /* @__PURE__ */ jsx("br", {}),
        "\u4E4B\u540E\u6BCF\u6B21\u53EA\u5B58\u53D8\u5316\u7684\u90E8\u5206\u3002"
      ] }),
      data.snapshots.slice(0, 50).map((s) => /* @__PURE__ */ jsx(
        SnapRow,
        {
          snap: s,
          expanded: expanded === s.id,
          onToggle: () => setExpanded(expanded === s.id ? "" : s.id),
          onVerify: () => void doAction("\u6821\u9A8C", () => triggerVerify(s.id, "quick"), `\u5DF2\u89E6\u53D1\u6821\u9A8C ${s.id}`),
          goRestore
        },
        s.id
      ))
    ] }) })
  ] });
}
function SnapRow({ snap, expanded, onToggle, onVerify, goRestore }) {
  const time = new Date(snap.finishedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return /* @__PURE__ */ jsxs("div", { className: "da-srow", children: [
    /* @__PURE__ */ jsxs("div", { className: "head", onClick: onToggle, children: [
      /* @__PURE__ */ jsxs("div", { className: "main", children: [
        /* @__PURE__ */ jsxs("b", { children: [
          time,
          " \xB7 ",
          snap.totalFiles,
          " \u6587\u4EF6\uFF08\u53D8\u66F4 ",
          snap.changedFiles,
          "\uFF09"
        ] }),
        /* @__PURE__ */ jsxs("small", { children: [
          "\u903B\u8F91 ",
          formatBytes2(snap.logicalBytes),
          " \xB7 \u65B0\u5BF9\u8C61 ",
          snap.newObjects,
          "\uFF08",
          formatBytes2(snap.storedBytes),
          "\uFF09\xB7 ",
          fmtDuration2(snap.durationMs),
          " \xB7 ",
          snap.trigger || "schedule"
        ] })
      ] }),
      /* @__PURE__ */ jsx("span", { className: `da-badge ${snap.ok ? snap.type === "full" ? "full" : "inc" : "err"}`, children: snap.ok ? snap.type === "full" ? "\u5168\u91CF" : "\u589E\u91CF" : "\u5931\u8D25" })
    ] }),
    expanded && /* @__PURE__ */ jsxs("div", { className: "da-detail", children: [
      "ID ",
      snap.id,
      snap.baseId ? ` \xB7 \u57FA\u4E8E ${snap.baseId}` : " \xB7 \u65E0\u57FA\u7EBF",
      " \xB7 \u5F00\u59CB ",
      time,
      "\uFF08\u8017\u65F6 ",
      fmtDuration2(snap.durationMs),
      "\uFF09",
      snap.error ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("br", {}),
        /* @__PURE__ */ jsxs("span", { style: { color: "#FF8A9A" }, children: [
          "\u9519\u8BEF\uFF1A",
          snap.error
        ] })
      ] }) : null,
      snap.skipped > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("br", {}),
        "\u26A0\uFE0F ",
        snap.skipped,
        " \u4E2A\u70ED\u6587\u4EF6\u88AB\u8DF3\u8FC7\uFF08\u6301\u7EED\u5199\u5165\u4E2D\uFF0C\u4E0B\u4EFD\u5FEB\u7167\u4F1A\u8865\u4E0A\uFF09\u2014\u2014\u300C\u6062\u590D\u300D\u9875\u53EF\u67E5\u770B\u6E05\u5355"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "da-actions", children: [
        /* @__PURE__ */ jsx("button", { className: "da-btn sm ghost", onClick: (e) => {
          e.stopPropagation();
          onVerify();
        }, children: "\u6821\u9A8C\u8FD9\u4EFD" }),
        /* @__PURE__ */ jsx("button", { className: "da-btn sm ghost", onClick: (e) => {
          e.stopPropagation();
          goRestore();
        }, children: "\u53BB\u6062\u590D\u2026" })
      ] })
    ] })
  ] });
}

// src/RestoreTab.tsx
import { useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function RestoreTab({ data, showToast }) {
  const [snapId, setSnapId] = useState2("");
  const [query, setQuery] = useState2("");
  const [listing, setListing] = useState2(false);
  const [list, setList] = useState2(null);
  const [checked, setChecked] = useState2(/* @__PURE__ */ new Set());
  const [restoring, setRestoring] = useState2(false);
  const [result, setResult] = useState2(null);
  if (!data) return /* @__PURE__ */ jsx2("div", { className: "da-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const effectiveSnapId = snapId || (data.snapshots[0]?.id ?? "");
  const browse = async () => {
    if (!effectiveSnapId || listing) return;
    setListing(true);
    setResult(null);
    try {
      const r = await listSnapshotFiles(effectiveSnapId, query);
      if (!r.ok) {
        showToast(r.error || "\u6D4F\u89C8\u5931\u8D25", "bad");
        setList(null);
        return;
      }
      setList(r);
      setChecked(/* @__PURE__ */ new Set());
    } finally {
      setListing(false);
    }
  };
  const doRestore = async (all) => {
    if (!effectiveSnapId || restoring) return;
    const paths = all ? null : [...checked];
    if (!all && paths.length === 0) {
      showToast("\u5148\u52FE\u9009\u8981\u6062\u590D\u7684\u6587\u4EF6\uFF08\u6216\u9009\u300C\u6062\u590D\u5168\u90E8\u300D\uFF09", "bad");
      return;
    }
    if (!window.confirm(all ? `\u628A\u5FEB\u7167 ${effectiveSnapId} \u7684\u5168\u90E8 ${list?.total ?? ""} \u4E2A\u6587\u4EF6\u6062\u590D\u5230\u6682\u5B58\u76EE\u5F55\uFF1F` : `\u628A\u52FE\u9009\u7684 ${checked.size} \u4E2A\u6587\u4EF6\u6062\u590D\u5230\u6682\u5B58\u76EE\u5F55\uFF1F`)) return;
    setRestoring(true);
    try {
      const r = await restoreFiles(effectiveSnapId, paths);
      setResult(r);
      if (r.ok) showToast(`\u5DF2\u6062\u590D ${r.restored} \u4E2A\u6587\u4EF6\u5230\u6682\u5B58\u76EE\u5F55`, "good");
      else showToast(r.error || "\u6062\u590D\u5931\u8D25", "bad");
    } finally {
      setRestoring(false);
    }
  };
  const toggle = (p) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "da-banner ok", children: [
      "\u{1F6E1}\uFE0F \u6062\u590D\u4EA7\u7269\u53EA\u5199\u5165\u5907\u4EFD\u5E93\u7684 ",
      /* @__PURE__ */ jsx2("b", { children: "restored/ \u6682\u5B58\u76EE\u5F55" }),
      "\uFF0C\u7EDD\u4E0D\u4F1A\u8986\u76D6\u6570\u636E\u6839\u3002 \u66FF\u6362\u56DE\u6570\u636E\u6839\u524D\uFF1A\u5148\u5B8C\u5168\u9000\u51FA Polaris \u2192 \u624B\u52A8\u590D\u5236\u66FF\u6362\uFF08\u5EFA\u8BAE\u5148\u628A\u5F53\u524D\u6587\u4EF6\u6539\u540D\u7559\u5E95\uFF09\u2192 \u91CD\u65B0\u542F\u52A8\u3002"
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "da-bar" }),
      "\u9009\u62E9\u5FEB\u7167"
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "da-card", children: /* @__PURE__ */ jsxs2("div", { className: "da-card-b", children: [
      /* @__PURE__ */ jsxs2("select", { className: "da-sel", value: snapId, onChange: (e) => {
        setSnapId(e.target.value);
        setList(null);
        setResult(null);
      }, style: { width: "100%" }, children: [
        /* @__PURE__ */ jsx2("option", { value: "", children: "\u6700\u65B0\u4E00\u4EFD\u5FEB\u7167" }),
        data.snapshots.map((s) => /* @__PURE__ */ jsxs2("option", { value: s.id, children: [
          new Date(s.finishedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }),
          " ",
          s.type === "full" ? "\u5168\u91CF" : "\u589E\u91CF",
          " ",
          s.totalFiles,
          " \u6587\u4EF6"
        ] }, s.id))
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "da-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "da-inp",
            style: { flex: 1, minWidth: 0 },
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") void browse();
            },
            placeholder: "\u8DEF\u5F84\u8FC7\u6EE4\uFF0C\u5982 dialogs / kv.db / config.json"
          }
        ),
        /* @__PURE__ */ jsx2("button", { className: "da-btn", disabled: !effectiveSnapId || listing, onClick: () => void browse(), children: listing ? "\u6D4F\u89C8\u4E2D\u2026" : "\u6D4F\u89C8" })
      ] })
    ] }) }),
    list && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "da-sec", children: [
        /* @__PURE__ */ jsx2("i", { className: "da-bar" }),
        "\u6587\u4EF6\u6E05\u5355",
        /* @__PURE__ */ jsxs2("span", { className: "da-hint", children: [
          list.total,
          " \u6587\u4EF6 \xB7 \u5339\u914D ",
          list.matched,
          (list.files?.length || 0) < (list.matched || 0) ? " \xB7 \u663E\u793A\u524D 200" : "",
          list.skipped?.length ? ` \xB7 ${list.skipped.length} \u4E2A\u70ED\u6587\u4EF6\u66FE\u88AB\u8DF3\u8FC7` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "da-card", children: /* @__PURE__ */ jsxs2("div", { className: "da-card-b", style: { padding: 0 }, children: [
        /* @__PURE__ */ jsxs2("div", { style: { maxHeight: 260, overflowY: "auto", padding: "8px 13px" }, children: [
          (list.files || []).map((f) => /* @__PURE__ */ jsxs2("label", { className: "da-file", children: [
            /* @__PURE__ */ jsx2(
              "input",
              {
                type: "checkbox",
                checked: checked.has(f.p),
                onChange: () => toggle(f.p),
                style: { flexShrink: 0 }
              }
            ),
            /* @__PURE__ */ jsx2("span", { className: "p", title: f.p, children: f.p }),
            /* @__PURE__ */ jsxs2("span", { className: "s", children: [
              formatBytes2(f.s),
              f.c ? " \xB7" : ""
            ] })
          ] }, f.p)),
          (list.files || []).length === 0 && /* @__PURE__ */ jsx2("div", { className: "da-empty", children: "\u65E0\u5339\u914D\u6587\u4EF6" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "da-actions", style: { padding: "10px 13px" }, children: [
          /* @__PURE__ */ jsx2("button", { className: "da-btn sm ghost", onClick: () => setChecked(new Set((list.files || []).map((f) => f.p))), children: "\u5168\u9009\uFF08\u5F53\u524D\u5217\u8868\uFF09" }),
          /* @__PURE__ */ jsx2("button", { className: "da-btn sm", disabled: restoring || checked.size === 0, onClick: () => void doRestore(false), children: restoring ? "\u6062\u590D\u4E2D\u2026" : `\u6062\u590D\u6240\u9009\uFF08${checked.size}\uFF09` }),
          /* @__PURE__ */ jsxs2("button", { className: "da-btn sm ghost", disabled: restoring, onClick: () => void doRestore(true), children: [
            "\u6062\u590D\u5168\u90E8\uFF08",
            list.total,
            "\uFF09"
          ] })
        ] })
      ] }) })
    ] }),
    result && /* @__PURE__ */ jsxs2("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx2("i", { className: "da-bar" }),
      "\u6062\u590D\u7ED3\u679C"
    ] }),
    result && /* @__PURE__ */ jsx2("div", { className: "da-card", children: /* @__PURE__ */ jsx2("div", { className: "da-card-b", children: result.ok ? /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "da-sub", children: [
        "\u5DF2\u6062\u590D ",
        /* @__PURE__ */ jsx2("b", { children: result.restored }),
        "/",
        result.total,
        " \u4E2A\u6587\u4EF6\u5230\uFF1A"
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "da-sub", style: { color: "#7EB8FF", wordBreak: "break-all", margin: "6px 0" }, children: result.stagingDir }),
      result.notFound?.length ? /* @__PURE__ */ jsxs2("div", { className: "da-sub", style: { color: "#F2C063" }, children: [
        "\u672A\u627E\u5230 ",
        result.notFound.length,
        " \u4E2A\uFF08\u53EF\u80FD\u5BF9\u8C61\u7F3A\u5931\uFF09\uFF1A",
        result.notFound.slice(0, 3).join("\u3001")
      ] }) : null,
      /* @__PURE__ */ jsx2("div", { className: "da-sub", style: { marginTop: 6 }, children: "\u4E0B\u4E00\u6B65\uFF1A\u5B8C\u5168\u9000\u51FA Polaris \u2192 \u4ECE\u6682\u5B58\u76EE\u5F55\u590D\u5236\u6587\u4EF6\u5230\u6570\u636E\u6839\u5BF9\u5E94\u4F4D\u7F6E\uFF08\u5148\u6539\u540D\u7559\u5E95\uFF09\u2192 \u91CD\u542F Polaris\u3002" })
    ] }) : /* @__PURE__ */ jsxs2("div", { className: "da-sub", style: { color: "#FF8A9A" }, children: [
      "\u5931\u8D25\uFF1A",
      result.error
    ] }) }) })
  ] });
}

// src/ServiceTab.tsx
import { useEffect, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var EVENT_STYLE = {
  snapshot_ok: { label: "\u5FEB\u7167\u5B8C\u6210", cls: "ok" },
  snapshot_fail: { label: "\u5FEB\u7167\u5931\u8D25", cls: "bad" },
  verify_ok: { label: "\u6821\u9A8C\u901A\u8FC7", cls: "ok" },
  verify_fail: { label: "\u6821\u9A8C\u5F02\u5E38", cls: "bad" },
  restore: { label: "\u6062\u590D", cls: "ok" },
  gc: { label: "\u56DE\u6536", cls: "warn" },
  catchup: { label: "\u8865\u507F", cls: "warn" },
  degraded: { label: "\u964D\u7EA7", cls: "bad" },
  cmd_fail: { label: "\u547D\u4EE4\u5931\u8D25", cls: "bad" }
};
function ServiceTab({ data, reload, showToast }) {
  const [svcStatus, setSvcStatus] = useState3(null);
  const [busy, setBusy] = useState3("");
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await listServiceStatus();
        if (alive) setSvcStatus(r);
      } catch (_) {
        if (alive) setSvcStatus([]);
      }
    };
    void poll();
    const timer = setInterval(poll, 5e3);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!data) return /* @__PURE__ */ jsx3("div", { className: "da-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const st = data.state;
  const mine = (svcStatus || []).find((s) => s.pluginId === PLUGIN_ID2 && (s.serviceId === SERVICE_ID2 || s.id === SERVICE_ID2) || s.id === `${PLUGIN_ID2}`);
  const running = !!(mine && (mine.running === true || typeof mine.status === "string" && /running|ok|alive/i.test(mine.status)));
  const serviceUi = (svcStatus || []).length > 0;
  const doService = async (action) => {
    if (busy) return;
    setBusy(action);
    try {
      await serviceAction(action, PLUGIN_ID2, SERVICE_ID2);
      showToast(`\u670D\u52A1${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}\u6307\u4EE4\u5DF2\u4E0B\u53D1`, "good");
      setTimeout(() => {
        void reload();
      }, 1500);
    } catch (e) {
      showToast(`\u670D\u52A1${action}\u5931\u8D25\uFF1A${e.message}`, "bad");
    } finally {
      setBusy("");
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "da-bar" }),
      "\u670D\u52A1\u72B6\u6001"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "da-card", children: /* @__PURE__ */ jsxs3("div", { className: "da-card-b", style: { padding: 0 }, children: [
      /* @__PURE__ */ jsxs3("div", { className: "da-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "da-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u540E\u53F0\u670D\u52A1\uFF08\u5FEB\u7167/\u6821\u9A8C/\u6062\u590D\u6267\u884C\u8005\uFF09" }),
          /* @__PURE__ */ jsxs3("small", { children: [
            st.lastTickAt ? `\u5FC3\u8DF3 ${timeAgo2(st.lastTickAt)}` : "\u5C1A\u672A\u5FC3\u8DF3",
            st.resolvedTarget ? ` \xB7 \u5907\u4EFD\u5E93 ${st.resolvedTarget}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsx3("span", { className: `da-badge ${running ? "inc" : "err"}`, children: serviceUi ? running ? "\u8FD0\u884C\u4E2D" : "\u672A\u8FD0\u884C" : "\u72B6\u6001\u672A\u77E5" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "da-field", children: [
        /* @__PURE__ */ jsxs3("div", { className: "da-field-l", children: [
          /* @__PURE__ */ jsx3("b", { children: "\u89D2\u8272 / \u79DF\u7EA6" }),
          /* @__PURE__ */ jsx3("small", { children: st.lease ? `\u6301\u6709\u8005 ${st.lease.host}\xB7${st.lease.pid}\uFF08\u5230\u671F ${new Date(st.lease.expiresAt).toLocaleTimeString("zh-CN", { hour12: false })}\uFF09` : "\u65E0\u79DF\u7EA6" })
        ] }),
        /* @__PURE__ */ jsx3("span", { className: `da-badge ${st.lease ? "full" : ""}`, children: st.lease ? "leader" : "\u7A7A\u95F2" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "da-field", children: /* @__PURE__ */ jsxs3("div", { className: "da-field-l", children: [
        /* @__PURE__ */ jsx3("b", { children: "\u4FDD\u62A4\u5BF9\u8C61\uFF08\u6570\u636E\u6839\uFF09\u4E0E\u5907\u4EFD\u5E93" }),
        /* @__PURE__ */ jsxs3("small", { style: { wordBreak: "break-all" }, children: [
          "\u5E93\u5360\u7528 ",
          fmtBytes(st.storeBytes),
          " \xB7 ",
          st.objectsTotal ?? 0,
          " \u5BF9\u8C61",
          data.settings.targetDir ? "" : "\uFF08\u9ED8\u8BA4 <\u6570\u636E\u6839>/../polaris-ark\uFF09"
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs3("div", { className: "da-actions", style: { padding: "10px 13px" }, children: [
        /* @__PURE__ */ jsx3("button", { className: "da-btn sm", disabled: !!busy, onClick: () => void doService("start"), children: "\u542F\u52A8" }),
        /* @__PURE__ */ jsx3("button", { className: "da-btn sm ghost", disabled: !!busy, onClick: () => void doService("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx3("button", { className: "da-btn sm ghost", disabled: !!busy, onClick: () => void doService("stop"), children: "\u505C\u6B62" }),
        /* @__PURE__ */ jsx3("span", { className: "da-sub", children: "\u670D\u52A1\u968F Polaris \u81EA\u542F\uFF08autoStart\uFF09\uFF0C\u5D29\u6E83\u81EA\u52A8\u62C9\u8D77" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "da-bar" }),
      "\u8FD0\u884C\u8981\u70B9"
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "da-card", children: /* @__PURE__ */ jsxs3("div", { className: "da-card-b da-sub", children: [
      "\u8C03\u5EA6\uFF1A",
      data.snapshots.length ? `\u4E0B\u6B21 ${st.nextRunAt ? new Date(st.nextRunAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "\u672A\u6392\u7A0B"}` : "\u9996\u6B21\u5B89\u88C5 90 \u79D2\u540E\u81EA\u52A8\u505A\u7B2C\u4E00\u4EFD\u5168\u91CF",
      "\uFF1B\u5E94\u7528\u5173\u673A\u671F\u95F4\u9519\u8FC7\u7684\u8C03\u5EA6\u4F1A\u5728\u542F\u52A8\u540E",
      /* @__PURE__ */ jsx3("b", { children: "\u8865\u8DD1\u4E00\u6B21" }),
      "\uFF08\u7EDD\u4E0D\u8FDE\u73AF\u8865\uFF09\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u8FDB\u884C\u4E2D\uFF1A",
      st.lastResult && !st.lastResult.ok && Date.now() - st.lastResult.at < 6e4 ? /* @__PURE__ */ jsxs3("span", { style: { color: "#FF8A9A" }, children: [
        "\u4E0A\u6B21\u52A8\u4F5C\u5931\u8D25\uFF1A",
        st.lastResult.error
      ] }) : "\u7A7A\u95F2",
      data.state.lastVerify ? /* @__PURE__ */ jsxs3(Fragment3, { children: [
        " \xB7 \u6700\u8FD1\u6821\u9A8C\u8017\u65F6 ",
        fmtDuration2(data.state.lastVerify.durationMs || 0)
      ] }) : null,
      /* @__PURE__ */ jsx3("br", {}),
      "\u65E5\u5FD7\uFF1A",
      /* @__PURE__ */ jsx3("code", { children: "\u6570\u636E\u6839\u914D\u7F6E\u76EE\u5F55/data-ark.log" }),
      "\uFF08512KB \u8F6E\u8F6C\uFF09"
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx3("i", { className: "da-bar" }),
      "\u4E8B\u4EF6\u6D41",
      /* @__PURE__ */ jsxs3("span", { className: "da-hint", children: [
        data.events.length,
        " \u6761\uFF08\u4FDD\u7559 50\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "da-card", children: /* @__PURE__ */ jsxs3("div", { className: "da-card-b", children: [
      data.events.length === 0 && /* @__PURE__ */ jsx3("div", { className: "da-empty", children: "\u6682\u65E0\u4E8B\u4EF6\u2014\u2014\u9996\u6B21\u5907\u4EFD\u5B8C\u6210\u540E\u8FD9\u91CC\u4F1A\u5F00\u59CB\u8BB0\u5F55" }),
      data.events.slice(0, 50).map((e, i) => {
        const st2 = EVENT_STYLE[e.type] || { label: e.type, cls: "" };
        return /* @__PURE__ */ jsxs3("div", { className: "da-ev", children: [
          /* @__PURE__ */ jsx3("span", { className: "t", children: new Date(e.at).toLocaleTimeString("zh-CN", { hour12: false }) }),
          /* @__PURE__ */ jsx3("span", { className: `k ${st2.cls}`, children: st2.label }),
          /* @__PURE__ */ jsx3("span", { className: "m", children: e.msg })
        ] }, `${e.at}-${i}`);
      })
    ] }) })
  ] });
}
function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

// src/SettingsTab.tsx
import { useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var PRESETS = [
  { label: "\u63A8\u8350", desc: "\u6392\u9664 logs/cache/plugins\uFF08\u53EF\u518D\u4E0B\u8F7D\u6216\u65E0\u4EF7\u503C\uFF09", excludeTop: DEFAULT_EXCLUDE_TOP2 },
  { label: "\u5168\u91CF", desc: "\u8FDE\u63D2\u4EF6\u8F7D\u8377\u4E00\u8D77\u5907\uFF08\u5E93\u4F1A\u5927 ~1GB+\uFF09", excludeTop: [] },
  { label: "\u4EC5\u6838\u5FC3", desc: "\u4F1A\u8BDD/\u914D\u7F6E/\u5BA1\u8BA1/kv\uFF0C\u4E0D\u542B\u8BED\u97F3\u4E0E\u5F15\u64CE\u4F1A\u8BDD", excludeTop: ["logs", "cache", "plugins", "voice", "pi-sessions", "simple-ai", "migrations"] }
];
function SettingsTab({ data, reload, showToast }) {
  const [draft, setDraft] = useState4(null);
  const [saving, setSaving] = useState4(false);
  if (!data) return /* @__PURE__ */ jsx4("div", { className: "da-empty", children: "\u8F7D\u5165\u4E2D\u2026" });
  const s = data.settings;
  const d = draft ?? {
    targetDir: s.targetDir,
    excludeTop: s.excludeTop,
    extraExcludeGlobs: s.extraExcludeGlobs.join(", "),
    daily: String(s.retention.daily),
    weekly: String(s.retention.weekly),
    monthly: String(s.retention.monthly),
    mode: s.schedule.mode,
    intervalHours: String(s.schedule.intervalHours),
    at: s.schedule.at,
    maxGb: String(Math.round(s.maxStoreBytes / 1073741824 * 10) / 10)
  };
  const persist = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await saveSettings({
        ...s,
        targetDir: d.targetDir.trim(),
        excludeTop: d.excludeTop,
        extraExcludeGlobs: d.extraExcludeGlobs.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean),
        retention: {
          daily: Number(d.daily) || 0,
          weekly: Number(d.weekly) || 0,
          monthly: Number(d.monthly) || 0
        },
        schedule: {
          mode: d.mode,
          intervalHours: Number(d.intervalHours) || 12,
          at: /^\d{2}:\d{2}$/.test(d.at.trim()) ? d.at.trim() : "03:30"
        },
        maxStoreBytes: Math.max(0.2, Number(d.maxGb) || 5) * 1073741824
      });
      if (!r.ok) {
        showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", "bad");
        return;
      }
      setDraft(null);
      await reload();
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u4E0B\u4E00 tick \u751F\u6548\uFF09", "good");
    } finally {
      setSaving(false);
    }
  };
  const doReset = async () => {
    if (!window.confirm("\u6E05\u9664\u8FD0\u884C\u72B6\u6001/\u5FEB\u7167\u7D22\u5F15/\u4E8B\u4EF6\uFF08\u5907\u4EFD\u5E93\u78C1\u76D8\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\uFF0C\u8BBE\u7F6E\u4FDD\u7559\uFF09\uFF1F")) return;
    const n = await resetRuntimeState();
    await reload();
    showToast(`\u5DF2\u6E05\u9664 ${n} \u4E2A\u72B6\u6001\u952E`);
  };
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "da-bar" }),
      "\u5907\u4EFD\u5E93"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "da-card", children: /* @__PURE__ */ jsxs4("div", { className: "da-card-b", children: [
      /* @__PURE__ */ jsx4("span", { className: "da-lbl", style: { marginTop: 0 }, children: "\u6839\u76EE\u5F55\uFF08\u7559\u7A7A = \u9ED8\u8BA4 <\u6570\u636E\u6839>/../polaris-ark\uFF0C\u5373\u540C\u76D8\u9694\u58C1\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "da-inp", value: d.targetDir, onChange: (e) => setDraft({ ...d, targetDir: e.target.value }), placeholder: "\u5982 E:\\polaris-backup\uFF08\u5EFA\u8BAE\u53E6\u4E00\u4E2A\u76D8\uFF09" }),
      /* @__PURE__ */ jsxs4("div", { className: "da-sub", style: { marginTop: 6 }, children: [
        "\u5F53\u524D\u751F\u6548\uFF1A",
        data.state.resolvedTarget || "\u670D\u52A1\u542F\u52A8\u540E\u89E3\u6790",
        " \xB7 \u5360\u7528 ",
        formatBytes2(data.state.storeBytes || 0),
        " / \u4E0A\u9650"
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "da-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx4("input", { className: "da-num", style: { width: 110 }, inputMode: "decimal", value: d.maxGb, onChange: (e) => setDraft({ ...d, maxGb: e.target.value }) }),
        /* @__PURE__ */ jsx4("span", { className: "da-sub", children: "GB \u5E93\u4E0A\u9650\uFF08\u8D85\u8FC7\u5148\u81EA\u52A8\u56DE\u6536\uFF0C\u4ECD\u8D85\u5219\u6682\u505C\u81EA\u52A8\u5907\u4EFD\u5E76\u964D\u7EA7\u63D0\u793A\uFF09" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "da-bar" }),
      "\u4FDD\u62A4\u8303\u56F4",
      /* @__PURE__ */ jsx4("span", { className: "da-hint", children: "\u6570\u636E\u6839\u4E00\u7EA7\u6761\u76EE\u6392\u9664" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "da-card", children: /* @__PURE__ */ jsxs4("div", { className: "da-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "da-row", children: PRESETS.map((p) => /* @__PURE__ */ jsx4("button", { className: "da-chip", title: p.desc, onClick: () => setDraft({ ...d, excludeTop: [...p.excludeTop] }), children: p.label }, p.label)) }),
      /* @__PURE__ */ jsx4("div", { className: "da-row", style: { marginTop: 9 }, children: ["agents", "audit", "browser", "cache", "companion", "config.json", "dialogs", "downloads", "http-client", "logs", "migrations", "nexus", "pi-sessions", "plugin-sessions", "plugins", "requirements", "scheduler", "session-v2", "simple-ai", "skills", "stores", "todo", "voice"].map((name) => {
        const off = d.excludeTop.includes(name);
        return /* @__PURE__ */ jsxs4(
          "button",
          {
            className: `da-chip ${off ? "" : "on"}`,
            title: off ? "\u70B9\u51FB\u7EB3\u5165\u4FDD\u62A4" : "\u70B9\u51FB\u6392\u9664",
            onClick: () => setDraft({ ...d, excludeTop: off ? d.excludeTop.filter((x) => x !== name) : [...d.excludeTop, name] }),
            children: [
              off ? "\u2715 " : "\u2713 ",
              name
            ]
          },
          name
        );
      }) }),
      /* @__PURE__ */ jsx4("span", { className: "da-lbl", children: "\u989D\u5916\u6392\u9664 glob\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u652F\u6301 ** * ?\uFF0C\u5982 voice/tmp-*, *.bak\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "da-inp", value: d.extraExcludeGlobs, onChange: (e) => setDraft({ ...d, extraExcludeGlobs: e.target.value }) }),
      /* @__PURE__ */ jsx4("div", { className: "da-sub", style: { marginTop: 6 }, children: "\u9501/\u4E34\u65F6\u6587\u4EF6\uFF08*.lock\u3001*.tmp \u7B49\uFF09\u6052\u6392\u9664\uFF0C\u65E0\u9700\u914D\u7F6E\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "da-bar" }),
      "\u4FDD\u7559\u7B56\u7565",
      /* @__PURE__ */ jsx4("span", { className: "da-hint", children: "GFS\uFF1A\u7956-\u7236-\u5B59\u8F6E\u6362" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "da-card", children: /* @__PURE__ */ jsxs4("div", { className: "da-card-b", style: { padding: 0 }, children: [
      [["daily", "\u6BCF\u65E5", "\u8FD1 N \u5929\u6BCF\u5929\u7559\u6700\u65B0\u4E00\u4EFD"], ["weekly", "\u6BCF\u5468", "\u8FD1 N \u5468\u6BCF\u5468\u7559\u6700\u65B0\u4E00\u4EFD"], ["monthly", "\u6BCF\u6708", "\u8FD1 N \u6708\u6BCF\u6708\u7559\u6700\u65B0\u4E00\u4EFD"]].map(([k, label, hint]) => /* @__PURE__ */ jsxs4("div", { className: "da-field", children: [
        /* @__PURE__ */ jsxs4("div", { className: "da-field-l", children: [
          /* @__PURE__ */ jsx4("b", { children: label }),
          /* @__PURE__ */ jsx4("small", { children: hint })
        ] }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "da-num",
            inputMode: "numeric",
            value: d[k],
            onChange: (e) => setDraft({ ...d, [k]: e.target.value })
          }
        )
      ] }, k)),
      /* @__PURE__ */ jsx4("div", { className: "da-actions", style: { padding: "10px 13px" }, children: /* @__PURE__ */ jsx4("span", { className: "da-sub", children: "\u6700\u65B0\u4E24\u4EFD\u6C38\u8FDC\u4FDD\u5E95\uFF0C\u4E0D\u4F1A\u88AB\u8F6E\u6362\u88C1\u6389" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "da-bar" }),
      "\u8C03\u5EA6"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "da-card", children: /* @__PURE__ */ jsxs4("div", { className: "da-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "da-row", children: [["interval", "\u95F4\u9694"], ["daily", "\u6BCF\u5929\u5B9A\u65F6"], ["off", "\u4EC5\u624B\u52A8"]].map(([m, label]) => /* @__PURE__ */ jsx4("button", { className: `da-chip ${d.mode === m ? "on" : ""}`, onClick: () => setDraft({ ...d, mode: m }), children: label }, m)) }),
      d.mode === "interval" && /* @__PURE__ */ jsxs4("div", { className: "da-row", style: { marginTop: 9 }, children: [
        /* @__PURE__ */ jsx4("span", { className: "da-sub", children: "\u6BCF" }),
        /* @__PURE__ */ jsx4("input", { className: "da-num", inputMode: "numeric", value: d.intervalHours, onChange: (e) => setDraft({ ...d, intervalHours: e.target.value }) }),
        /* @__PURE__ */ jsxs4("span", { className: "da-sub", children: [
          "\u5C0F\u65F6\u4E00\u6B21\uFF08\u4E0B\u6B21\uFF1A",
          data.state.nextRunAt ? new Date(data.state.nextRunAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "\u2014",
          "\uFF09"
        ] })
      ] }),
      d.mode === "daily" && /* @__PURE__ */ jsxs4("div", { className: "da-row", style: { marginTop: 9 }, children: [
        /* @__PURE__ */ jsx4("span", { className: "da-sub", children: "\u6BCF\u5929" }),
        /* @__PURE__ */ jsx4("input", { className: "da-num", style: { width: 90 }, value: d.at, onChange: (e) => setDraft({ ...d, at: e.target.value }), placeholder: "03:30" }),
        /* @__PURE__ */ jsx4("span", { className: "da-sub", children: "\u672C\u5730\u65F6\u95F4\u6267\u884C" })
      ] }),
      d.mode === "off" && /* @__PURE__ */ jsx4("div", { className: "da-sub", style: { marginTop: 8 }, children: "\u53EA\u54CD\u5E94\u300C\u7ACB\u5373\u5907\u4EFD\u300D\uFF0C\u4E0D\u81EA\u52A8\u6392\u7A0B\u3002" }),
      /* @__PURE__ */ jsx4("div", { className: "da-sub", style: { marginTop: 6 }, children: "\u5E94\u7528\u5173\u673A\u9519\u8FC7\u7684\u8C03\u5EA6\uFF0C\u542F\u52A8\u540E\u81EA\u52A8\u8865\u8DD1\u4E00\u6B21\u3002" })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "da-actions", style: { padding: "0 18px 10px" }, children: [
      /* @__PURE__ */ jsx4("button", { className: "da-btn", disabled: saving, onClick: () => void persist(), children: "\u4FDD\u5B58\u5168\u90E8\u8BBE\u7F6E" }),
      draft && /* @__PURE__ */ jsx4("button", { className: "da-btn ghost", onClick: () => setDraft(null), children: "\u653E\u5F03\u4FEE\u6539" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "da-bar" }),
      "\u6570\u636E\u4E0E\u72B6\u6001"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "da-card", children: /* @__PURE__ */ jsxs4("div", { className: "da-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "da-sub", children: [
        "\u8BBE\u7F6E/\u7D22\u5F15/\u4E8B\u4EF6\u90FD\u5728 cap.kv\uFF08dataark.*\uFF09\uFF0C\u8DE8\u7AEF\u4E00\u81F4\uFF1B\u5FEB\u7167\u6570\u636E\u5728\u5907\u4EFD\u5E93\u78C1\u76D8\u3002",
        /* @__PURE__ */ jsx4("br", {}),
        "\u300C\u91CD\u7F6E\u8FD0\u884C\u72B6\u6001\u300D\u53EA\u6E05\u7D22\u5F15\u4E0E\u4E8B\u4EF6\uFF08\u4E0D\u52A8\u5907\u4EFD\u5E93\u3001\u4E0D\u52A8\u8BBE\u7F6E\uFF09\u2014\u2014\u6BD4\u5982\u60F3\u5728\u9762\u677F\u4E0A\u91CD\u65B0\u5F00\u59CB\u8BA1\u6570\u65F6\u7528\u3002"
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "da-actions", children: /* @__PURE__ */ jsx4("button", { className: "da-btn sm danger", onClick: () => void doReset(), children: "\u91CD\u7F6E\u8FD0\u884C\u72B6\u6001" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "da-sec", children: [
      /* @__PURE__ */ jsx4("i", { className: "da-bar" }),
      "\u5173\u4E8E"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "da-card", children: /* @__PURE__ */ jsxs4("div", { className: "da-card-b da-sub", children: [
      "\u6570\u636E\u65B9\u821F data-ark v0.1.0 \u2014\u2014 Polaris \u6570\u636E\u6839\u7684\u5907\u4EFD/\u6062\u590D\u5F15\u64CE\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u5185\u5BB9\u5BFB\u5740\u53BB\u91CD\uFF08CAS+gzip\uFF09\uFF1A\u4E0D\u53D8\u6587\u4EF6\u5168\u5E93\u53EA\u5B58\u4E00\u4EFD\uFF0C\u589E\u91CF\u5FEB\u7167\u53EA\u8BB0\u53D8\u5316\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 GFS \u4FDD\u7559\u8F6E\u6362 + \u5F15\u7528 GC\u3001\u5355\u5199\u8005\u79DF\u7EA6\uFF08\u53CC Polaris \u5B9E\u4F8B\u81EA\u52A8\u4E3B\u5907\uFF09\u3001\u5D29\u6E83\u6062\u590D\uFF08tmp \u6E05\u7406/manifest \u6700\u540E\u5199\uFF09\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u70ED\u6587\u4EF6\u534F\u8BAE\uFF1A\u8BFB\u5199\u51B2\u7A81\u81EA\u52A8\u91CD\u8BD5\uFF0C\u4ECD\u4E0D\u7A33\u5B9A\u5219\u8BDA\u5B9E\u6807\u8BB0\u8DF3\u8FC7\uFF0C\u7EDD\u4E0D\u70B8\u6574\u4EFD\u5FEB\u7167\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u6062\u590D\u53EA\u843D\u6682\u5B58\u76EE\u5F55\uFF0C\u5F15\u64CE\u6CA1\u6709\u4EFB\u4F55\u8986\u76D6\u6570\u636E\u6839\u7684\u4EE3\u7801\u8DEF\u5F84\uFF1B",
      /* @__PURE__ */ jsx4("br", {}),
      "\xB7 \u4E00\u81F4\u6027\u8BF4\u660E\uFF1A\u5FEB\u7167\u4E3A\u9010\u6587\u4EF6\u5D29\u6E83\u4E00\u81F4\uFF08\u975E\u8DE8\u6587\u4EF6\u4E8B\u52A1\uFF09\uFF0C\u6062\u590D SQLite \u7C7B\u6D3B\u8DC3\u5E93\u524D\u8BF7\u5148\u9000\u51FA\u5E94\u7528\u3002"
    ] }) })
  ] });
}

// src/Panel.tsx
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.da-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.da-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.da-body{flex:1;overflow-y:auto;padding:0 0 24px}
.da-body::-webkit-scrollbar{width:9px;height:9px}
.da-body::-webkit-scrollbar-track{background:transparent}
.da-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.da-page{max-width:560px;margin:0 auto}
.da-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0F1420 75%,rgba(15,20,32,0))}
.da-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4DA3FF,#2B6CB0);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.da-tt{flex:1;min-width:0}
.da-tt b{font-size:15px;display:block}
.da-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.da-tt small b{display:inline;font-size:10.5px;color:#7EB8FF}
.da-tabs{display:flex;gap:4px}
.da-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.da-tab:hover{color:#E6EAF2}
.da-tab.on{background:#1B2637;color:#E6EAF2;font-weight:600}
.da-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.da-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#4DA3FF,#2B6CB0);flex-shrink:0}
.da-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.da-card{background:#131A26;border:1px solid #223047;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.da-card-b{padding:11px 13px}
.da-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.da-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.da-btn{background:#2B6CB0;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.da-btn:hover{filter:brightness(1.12)}
.da-btn:disabled{opacity:.45;cursor:not-allowed}
.da-btn.ghost{background:#1B2637;color:#E6EAF2;border:1px solid #223047}
.da-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.da-btn.warn{background:#3a2f14;color:#F2C063;border:1px solid #54451c}
.da-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.da-inp,.da-txa{background:#0E1320;border:1px solid #223047;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0;font-family:inherit}
.da-txa{resize:vertical;min-height:52px;line-height:1.5}
.da-inp:focus,.da-txa:focus{outline:none;border-color:#2B6CB0}
.da-inp::placeholder,.da-txa::placeholder{color:#4d5566}
.da-lbl{font-size:11px;color:#8B95A7;margin:8px 0 4px;display:block}
.da-sel{background:#0E1320;border:1px solid #223047;border-radius:8px;color:#E6EAF2;padding:7px 8px;font-size:12px;max-width:100%}
.da-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.da-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(19,26,38,.96);border:1px solid #223047;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.da-toast.bad{border-color:#54262c;color:#FF8A9A}
.da-toast.good{border-color:#1d3a52;color:#7EB8FF}
.da-chip{background:#1B2637;border:1px solid #223047;border-radius:999px;color:#B4B4B8;font-size:11.5px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.da-chip:hover{border-color:#33507a}
.da-chip.on{background:#16304f;border-color:#2B6CB0;color:#7EB8FF;font-weight:600}
.da-num{width:86px;background:#0E1320;border:1px solid #223047;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0;font-variant-numeric:tabular-nums}
.da-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1A2334}
.da-field:first-child{border-top:none}
.da-field-l{flex:1;min-width:0}
.da-field-l b{font-size:12.5px;display:block}
.da-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.da-banner{margin:0 16px 10px;padding:9px 13px;border-radius:11px;font-size:11.5px;line-height:1.6}
.da-banner.bad{background:#2a1418;border:1px solid #54262c;color:#FF8A9A}
.da-banner.ok{background:#122032;border:1px solid #1d3a52;color:#9CC7F5}
.da-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 16px 10px}
.da-stat{background:#131A26;border:1px solid #223047;border-radius:11px;padding:9px 6px;text-align:center;min-width:0}
.da-stat b{display:block;font-size:15px;font-variant-numeric:tabular-nums}
.da-stat small{font-size:9.5px;color:#8B95A7;display:block;margin-top:2px}
.da-stat .hot{color:#7EB8FF}
.da-stat .bad{color:#F85149}
.da-srow{border-top:1px solid #1A2334;padding:9px 2px}
.da-srow:first-child{border-top:none}
.da-srow .head{display:flex;gap:8px;align-items:center;cursor:pointer}
.da-srow .main{flex:1;min-width:0}
.da-srow .main b{font-size:12.5px;display:block}
.da-srow .main small{color:#5C6678;font-size:10.5px;display:block;margin-top:1px}
.da-badge{font-size:9.5px;padding:2px 8px;border-radius:999px;background:#1B2637;color:#8B95A7;border:1px solid #223047;white-space:nowrap;flex-shrink:0}
.da-badge.full{color:#7EB8FF;border-color:#1d3a52}
.da-badge.inc{color:#9CC7A0;border-color:#1d3a30}
.da-badge.err{color:#FF8A9A;border-color:#54262c}
.da-detail{margin-top:9px;padding-top:9px;border-top:1px dashed #223047;font-size:11px;color:#8B95A7;line-height:1.7}
.da-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
.da-ev{display:flex;gap:8px;padding:6px 2px;border-top:1px solid #1A2334;font-size:11px;align-items:flex-start}
.da-ev:first-child{border-top:none}
.da-ev .t{color:#5C6678;flex-shrink:0;font-variant-numeric:tabular-nums}
.da-ev .k{flex-shrink:0;font-weight:600;min-width:66px}
.da-ev .k.ok{color:#7EB8FF}
.da-ev .k.bad{color:#FF8A9A}
.da-ev .k.warn{color:#F2C063}
.da-ev .m{flex:1;min-width:0;color:#B4BCC9;word-break:break-all}
.da-file{display:flex;gap:8px;align-items:center;padding:5px 2px;border-top:1px solid #1A2334;font-size:11px}
.da-file:first-child{border-top:none}
.da-file .p{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C9D3E0}
.da-file .s{color:#5C6678;flex-shrink:0;font-variant-numeric:tabular-nums}
@media (max-width:430px){.da-grid{grid-template-columns:repeat(2,1fr)}.da-tabs .da-tab{padding:6px 7px}}
`;
function ArkPanel(_props) {
  const [tab, setTab] = useState5("snapshots");
  const [data, setData] = useState5(null);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback(async () => {
    try {
      const d = await loadOverview();
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  useEffect2(() => {
    let alive = true;
    void reload();
    const onVis = () => {
      if (document.visibilityState === "visible" && alive) void reload();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);
  const head = (() => {
    if (!data) return "\u8F7D\u5165\u4E2D\u2026";
    const st = data.state;
    if (st.degraded) return { text: `\u26A0\uFE0F ${st.degraded.reason}`, cls: "bad" };
    if (!st.lastSnapshotAt) return { text: "\u5C1A\u65E0\u5FEB\u7167\u2014\u2014\u300C\u5FEB\u7167\u300D\u9875\u4E00\u952E\u5F00\u59CB", cls: "" };
    return {
      text: /* @__PURE__ */ jsxs5(Fragment4, { children: [
        "\u4E0A\u6B21 ",
        timeAgo2(st.lastSnapshotAt),
        " \xB7 \u4E0B\u6B21 ",
        st.nextRunAt ? timeAgo2(st.nextRunAt).replace("\u524D", "\u540E") : "\u672A\u6392\u7A0B",
        " \xB7 \u5E93 ",
        formatBytes2(st.storeBytes || 0)
      ] }),
      cls: "ok"
    };
  })();
  return /* @__PURE__ */ jsxs5("div", { className: "da-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "da-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "da-logo", children: "\u{1F6E1}\uFE0F" }),
      /* @__PURE__ */ jsxs5("div", { className: "da-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u6570\u636E\u65B9\u821F" }),
        /* @__PURE__ */ jsx5("small", { className: typeof head === "string" ? "" : head.cls, children: typeof head === "string" ? head : head.text })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "da-tabs", children: [
        ["snapshots", "\u5FEB\u7167"],
        ["restore", "\u6062\u590D"],
        ["service", "\u670D\u52A1"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsx5("button", { className: `da-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: label }, k)) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "da-body", children: /* @__PURE__ */ jsxs5("div", { className: "da-page", children: [
      loadErr && /* @__PURE__ */ jsxs5("div", { className: "da-sub", style: { color: "#F85149", padding: "8px 16px" }, children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr
      ] }),
      tab === "snapshots" && /* @__PURE__ */ jsx5(SnapshotsTab, { data, reload, showToast, goRestore: () => setTab("restore") }),
      tab === "restore" && /* @__PURE__ */ jsx5(RestoreTab, { data, reload, showToast }),
      tab === "service" && /* @__PURE__ */ jsx5(ServiceTab, { data, reload, showToast }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx5("div", { className: `da-toast ${toast.kind || ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function DataArkEntry(props) {
  return /* @__PURE__ */ jsx6(ArkPanel, { ...props });
}
export {
  DataArkEntry as default
};
