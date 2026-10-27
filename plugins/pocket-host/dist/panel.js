// src/Panel.tsx
import { useCallback as useCallback3, useEffect as useEffect3, useRef, useState as useState5 } from "react";

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
var EVENT_TYPE_META = {
  cpu_high: { label: "CPU \u544A\u8B66", color: "#F85149" },
  mem_high: { label: "\u5185\u5B58\u544A\u8B66", color: "#F85149" },
  disk_low: { label: "\u78C1\u76D8\u544A\u8B66", color: "#D29922" },
  cpu_recovered: { label: "CPU \u6062\u590D", color: "#3FB950" },
  mem_recovered: { label: "\u5185\u5B58\u6062\u590D", color: "#3FB950" },
  disk_recovered: { label: "\u78C1\u76D8\u6062\u590D", color: "#3FB950" }
};
var DEFAULT_SETTINGS = {
  cpuThreshold: 90,
  memThreshold: 90,
  diskFreeGb: 5,
  sustainTicks: 4,
  snapshotMs: 5e3,
  slowMs: 15e3,
  paused: false
};
var K = {
  snapshot: "hostmon.snapshot",
  meta: "hostmon.meta",
  settings: "hostmon.settings",
  eventPrefix: "hostmon.event.",
  cmdKill: (nonce2) => `hostmon.cmd.kill.${nonce2}`,
  result: (nonce2) => `hostmon.result.${nonce2}`,
  readAt: "hostmon.readAt"
};
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
async function loadPanelData(readAt = 0) {
  const [rawSnap, rawMeta, rawSettings, keys] = await Promise.all([
    kvGet(K.snapshot),
    kvGet(K.meta),
    kvGet(K.settings),
    kvKeys()
  ]);
  let newCount = 0;
  if (readAt > 0) {
    for (const k of keys) {
      if (!k.startsWith(K.eventPrefix)) continue;
      const at = Number(k.slice(K.eventPrefix.length));
      if (Number.isFinite(at) && at > readAt) newCount++;
    }
  }
  return {
    snap: rawSnap && typeof rawSnap === "object" ? rawSnap : null,
    meta: rawMeta && typeof rawMeta === "object" ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...rawSettings && typeof rawSettings === "object" ? rawSettings : {} },
    newCount
  };
}
async function loadEvents(limit = 40) {
  const keys = await kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort().slice(-limit).reverse();
  const events = await Promise.all(evKeys.map((k) => kvGet(k)));
  return events.filter((e) => !!e && typeof e === "object" && typeof e.at === "number").sort((a, b) => b.at - a.at);
}
async function loadReadAt() {
  const v = await kvGet(K.readAt);
  return typeof v === "number" ? v : 0;
}
async function markAllRead() {
  await kvSet(K.readAt, Date.now());
}
async function clearEvents() {
  const keys = await kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix));
  await Promise.all(evKeys.map((k) => kvDel(k)));
  return evKeys.length;
}
function nonce() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return "p" + c.randomUUID().replace(/-/g, "").slice(0, 12);
  return "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
async function killBy(payload) {
  const n = nonce();
  await kvSet(K.cmdKill(n), { ...payload, confirm: true, at: Date.now() });
  const deadline = Date.now() + 25e3;
  while (Date.now() < deadline) {
    await new Promise((r2) => setTimeout(r2, 1200));
    const r = await kvGet(K.result(n)).catch(() => null);
    if (r) {
      kvDel(K.result(n)).catch(() => {
      });
      return r;
    }
  }
  return { ok: false, error: "\u7B49\u5F85\u6267\u884C\u7ED3\u679C\u8D85\u65F6\uFF1A\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF08\u8BBE\u7F6E \u2192 \u670D\u52A1\u7BA1\u7406 \u53EF\u67E5\u770B/\u542F\u52A8\uFF09" };
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
var SERVICE_ID = "host-service";
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
function fmtUptime(sec) {
  if (!sec || sec <= 0) return "\u2014";
  const d = Math.floor(sec / 86400);
  const h = Math.floor(sec % 86400 / 3600);
  const m = Math.floor(sec % 3600 / 60);
  if (d > 0) return `${d} \u5929 ${h} \u5C0F\u65F6`;
  if (h > 0) return `${h} \u5C0F\u65F6 ${m} \u5206\u949F`;
  return `${m} \u5206\u949F`;
}
function gb(n, digits = 1) {
  return Number.isFinite(n) ? `${n.toFixed(digits)} GB` : "\u2014";
}
function snapAge(snap) {
  if (!snap || typeof snap.at !== "number") return Infinity;
  return Math.max(0, Math.round((Date.now() - snap.at) / 1e3));
}
function heartbeatOf(snap, meta) {
  const age = snapAge(snap);
  if (age === Infinity) {
    if (meta?.lastTickAt && Date.now() - meta.lastTickAt < 150 * 1e3) {
      return { cls: "stale", text: "\u670D\u52A1\u542F\u52A8\u4E2D\uFF0C\u5FEB\u7167\u672A\u5C31\u7EEA" };
    }
    return { cls: "down", text: "\u670D\u52A1\u672A\u8FD0\u884C\u6216\u65E0\u5FEB\u7167" };
  }
  if (age <= 20) return { cls: "ok", text: `${snap?.host?.name || "\u4E3B\u673A"} \u5728\u7EBF \xB7 \u5B9E\u65F6\u91C7\u6837\u4E2D` };
  return { cls: "stale", text: `\u5FEB\u7167\u505C\u6EDE ${age >= 90 ? `${Math.round(age / 60)} \u5206\u949F` : `${age} \u79D2`}` };
}
function bridgePort(meta) {
  const m = (meta?.bridge || "").match(/:(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

// src/OverviewTab.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Spark({ hist, idx, color }) {
  const pts = hist.slice(-60);
  if (pts.length < 2) return /* @__PURE__ */ jsx("svg", { className: "ph-spark" });
  const w = 100;
  const hgt = 100;
  const vals = pts.map((p) => Math.max(0, Math.min(100, p[idx] || 0)));
  const step = w / (vals.length - 1);
  const path = vals.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(hgt - v / 100 * hgt).toFixed(2)}`).join(" ");
  const area = `${path} L${w},${hgt} L0,${hgt} Z`;
  return /* @__PURE__ */ jsxs("svg", { className: "ph-spark", viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none", children: [
    /* @__PURE__ */ jsx("path", { d: area, fill: color, opacity: "0.13" }),
    /* @__PURE__ */ jsx("path", { d: path, fill: "none", stroke: color, strokeWidth: "2", vectorEffect: "non-scaling-stroke" })
  ] });
}
function diskCls(pct) {
  if (pct >= 92) return "ph-fill hot";
  if (pct >= 80) return "ph-fill warn";
  return "ph-fill";
}
function OverviewTab({ data, reload, showToast, goFeed }) {
  const snap = data?.snap ?? null;
  if (!snap) {
    return /* @__PURE__ */ jsxs("div", { className: "ph-empty", children: [
      "\u6682\u65E0\u4E3B\u673A\u5FEB\u7167\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u8FD0\u884C\uFF1A\u53BB\u300C\u8BBE\u7F6E\u300D\u2192 \u670D\u52A1\u7BA1\u7406 \u542F\u52A8\uFF0C",
      /* @__PURE__ */ jsx("br", {}),
      "\u6216\u7A0D\u7B49\u9996\u4E2A\u91C7\u6837\u5468\u671F\uFF08\u7EA6 5 \u79D2\uFF09\u3002"
    ] });
  }
  const cpu = snap.cpuPct;
  const mem = snap.memPct;
  const al = snap.alerts || {};
  const activeAlerts = [];
  if (al.cpu_high) activeAlerts.push(`CPU \u8D85\u8FC7 ${data?.settings.cpuThreshold ?? 90}%`);
  if (al.mem_high) activeAlerts.push(`\u5185\u5B58\u8D85\u8FC7 ${data?.settings.memThreshold ?? 90}%`);
  if (al.disk_low) activeAlerts.push(`\u78C1\u76D8\u5269\u4F59\u4E0D\u8DB3\uFF1A${(al.lowMounts || []).join("\u3001") || "\u2014"}`);
  const totalGb = (snap.host.totalMemBytes || 0) / 1073741824;
  const usedGb = (snap.memUsedBytes || 0) / 1073741824;
  return /* @__PURE__ */ jsxs("div", { children: [
    activeAlerts.length > 0 && /* @__PURE__ */ jsxs("div", { className: `ph-alertstrip ${al.disk_low && !al.cpu_high && !al.mem_high ? "warm" : ""}`, children: [
      "\u26A0 ",
      activeAlerts.join("\uFF1B"),
      " \u2014\u2014 \u8BE6\u60C5\u89C1\u300C\u52A8\u6001\u300D"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ph-gauges", children: [
      /* @__PURE__ */ jsxs("div", { className: `ph-gauge ${(cpu ?? 0) >= 85 ? "ph-gauge hot" : (cpu ?? 0) >= 65 ? "ph-gauge-warm ph-gauge" : "ph-gauge"}`, children: [
        /* @__PURE__ */ jsxs("div", { className: "ph-gl", children: [
          /* @__PURE__ */ jsx("b", { children: "CPU" }),
          /* @__PURE__ */ jsxs("span", { children: [
            snap.host.cores,
            " \u6838"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ph-gv", children: [
          Number.isFinite(cpu) ? cpu.toFixed(1) : "\u2014",
          /* @__PURE__ */ jsx("small", { children: "%" })
        ] }),
        /* @__PURE__ */ jsx(Spark, { hist: snap.history, idx: 1, color: "#58A6FF" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: `ph-gauge ${(mem ?? 0) >= 85 ? "ph-gauge hot" : (mem ?? 0) >= 65 ? "ph-gauge-warm ph-gauge" : "ph-gauge"}`, children: [
        /* @__PURE__ */ jsxs("div", { className: "ph-gl", children: [
          /* @__PURE__ */ jsx("b", { children: "\u5185\u5B58" }),
          /* @__PURE__ */ jsxs("span", { children: [
            usedGb.toFixed(1),
            "/",
            totalGb.toFixed(1),
            " GB"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ph-gv", children: [
          Number.isFinite(mem) ? mem.toFixed(1) : "\u2014",
          /* @__PURE__ */ jsx("small", { children: "%" })
        ] }),
        /* @__PURE__ */ jsx(Spark, { hist: snap.history, idx: 2, color: "#2EA98C" })
      ] })
    ] }),
    (snap.disks?.length ?? 0) > 0 && /* @__PURE__ */ jsxs("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "ph-bar" }),
        "\u78C1\u76D8",
        /* @__PURE__ */ jsxs("small", { className: "ph-hint", children: [
          "via ",
          snap.disksVia
        ] })
      ] }),
      snap.disks.map((d) => /* @__PURE__ */ jsxs("div", { className: "ph-diskrow", children: [
        /* @__PURE__ */ jsxs("div", { className: "ph-disk-h", children: [
          /* @__PURE__ */ jsx("b", { children: d.mount }),
          /* @__PURE__ */ jsxs("span", { children: [
            gb(d.freeGb),
            " \u53EF\u7528 / \u5171 ",
            gb(d.totalGb, 0)
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "ph-track", children: /* @__PURE__ */ jsx("div", { className: diskCls(d.pct), style: { width: `${Math.min(100, d.pct)}%` } }) })
      ] }, d.mount))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "ph-bar" }),
        "\u4E3B\u673A"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ph-card-b", children: /* @__PURE__ */ jsxs("dl", { className: "ph-info", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u4E3B\u673A\u540D" }),
          /* @__PURE__ */ jsx("dd", { children: snap.host.name || "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u5F00\u673A\u65F6\u957F" }),
          /* @__PURE__ */ jsx("dd", { children: fmtUptime(snap.uptimeSec) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u7CFB\u7EDF" }),
          /* @__PURE__ */ jsxs("dd", { children: [
            snap.host.platform,
            " ",
            snap.host.release,
            " \xB7 ",
            snap.host.arch
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "CPU" }),
          /* @__PURE__ */ jsx("dd", { children: snap.host.cpuModel || "\u2014" })
        ] }),
        snap.loadavg && snap.loadavg.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u8D1F\u8F7D\uFF081/5/15min\uFF09" }),
          /* @__PURE__ */ jsx("dd", { children: snap.loadavg.join(" / ") })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u8FDB\u7A0B / \u76D1\u542C\u7AEF\u53E3" }),
          /* @__PURE__ */ jsxs("dd", { children: [
            snap.procs.count,
            " \u4E2A / ",
            snap.ports.count,
            " \u4E2A"
          ] })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ph-sub", style: { padding: "2px 18px 8px" }, children: [
      "\u5386\u53F2\u7A97\u53E3\u7EA6 ",
      Math.round((snap.history?.length || 0) * 5 / 60),
      " \u5206\u949F \xB7 \u8D70\u52BF\u6BCF 5s \u4E00\u4E2A\u6837\u672C \xB7",
      /* @__PURE__ */ jsx("button", { className: "ph-btn ghost sm", style: { marginLeft: 6 }, onClick: goFeed, children: "\u67E5\u770B\u544A\u8B66\u52A8\u6001" })
    ] })
  ] });
}

// src/ProcTab.tsx
import { useMemo, useState } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ProcTab({ data, showToast, reload }) {
  const [filter, setFilter] = useState("");
  const [confirmRow, setConfirmRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const rows = data?.snap?.procs?.list ?? [];
    const f = filter.trim().toLowerCase();
    return f ? rows.filter((r) => r.name.toLowerCase().includes(f)) : rows;
  }, [data, filter]);
  const snapStale = !data?.snap || Date.now() - (data.snap.procs?.at || 0) > 40 * 1e3;
  const doKill = async (row) => {
    setBusy(true);
    try {
      const r = await killBy({ pid: row.pid, reason: "\u9762\u677F\u624B\u52A8\u7ED3\u675F" });
      if (r.ok) showToast(`\u5DF2\u7ED3\u675F ${row.name} (PID ${row.pid})`);
      else showToast(r.error || (r.results || []).map((x) => x.error || `${x.name || "?"} \u5931\u8D25`).join("\uFF1B") || "\u7ED3\u675F\u5931\u8D25", true);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
      setConfirmRow(null);
      reload();
    }
  };
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2("div", { style: { padding: "6px 16px 10px" }, children: /* @__PURE__ */ jsx2(
      "input",
      {
        className: "ph-inp",
        placeholder: "\u6309\u8FDB\u7A0B\u540D\u8FC7\u6EE4\uFF08\u5982 node\u3001chrome\uFF09",
        value: filter,
        onChange: (e) => setFilter(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxs2("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs2("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx2("i", { className: "ph-bar" }),
        "\u8FDB\u7A0B\uFF08\u6309\u5185\u5B58\uFF09",
        /* @__PURE__ */ jsxs2("small", { className: "ph-hint", children: [
          "\u5FEB\u7167 Top",
          (data?.snap?.procs?.list ?? []).length,
          data?.snap?.procs?.count ? ` / \u5168\u673A ${data.snap.procs.count}` : ""
        ] })
      ] }),
      snapStale && (data?.snap ?? null) && /* @__PURE__ */ jsx2("div", { className: "ph-sub", style: { padding: "0 13px 8px" }, children: "\u8FDB\u7A0B\u8868\u662F\u6162\u91C7\u6837\uFF08\u7EA6 15s \u4E00\u8F6E\uFF09\uFF0C\u521A\u542F\u52A8\u7684\u8FDB\u7A0B\u7A0D\u540E\u624D\u51FA\u73B0\u3002" }),
      list.length === 0 && /* @__PURE__ */ jsx2("div", { className: "ph-empty", children: data?.snap ? filter ? `\u6CA1\u6709\u540D\u5B57\u542B\u300C${filter}\u300D\u7684\u8FDB\u7A0B\uFF08\u5FEB\u7167\u53EA\u542B\u5185\u5B58 Top25\uFF09\u3002` : "\u5FEB\u7167\u4E2D\u6CA1\u6709\u8FDB\u7A0B\u6570\u636E\uFF08\u670D\u52A1\u6162\u91C7\u6837\u5C1A\u672A\u5B8C\u6210\uFF09\u3002" : "\u6682\u65E0\u5FEB\u7167\uFF1A\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E\u300D\u542F\u52A8\u540E\u53F0\u670D\u52A1\u3002" }),
      list.map((row) => /* @__PURE__ */ jsxs2("div", { className: "ph-row", children: [
        /* @__PURE__ */ jsxs2("span", { className: "ph-row-n", children: [
          row.name,
          /* @__PURE__ */ jsxs2("small", { children: [
            "PID ",
            row.pid
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: "ph-row-v", children: [
          row.memMb,
          " MB"
        ] }),
        /* @__PURE__ */ jsx2("button", { className: "ph-btn danger sm", disabled: busy, onClick: () => setConfirmRow(row), children: "\u7ED3\u675F" })
      ] }, row.pid)),
      confirmRow && /* @__PURE__ */ jsxs2("div", { className: "ph-confirm", children: [
        /* @__PURE__ */ jsxs2("b", { children: [
          "\u7ED3\u675F ",
          confirmRow.name,
          " (PID ",
          confirmRow.pid,
          ")\uFF1F\u8BE5\u8FDB\u7A0B\u5C06\u88AB\u5F3A\u5236\u7EC8\u6B62\uFF08\u542B\u5B50\u8FDB\u7A0B\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsx2("button", { className: "ph-btn danger sm", disabled: busy, onClick: () => doKill(confirmRow), children: "\u786E\u8BA4\u7ED3\u675F" }),
        /* @__PURE__ */ jsx2("button", { className: "ph-btn ghost sm", disabled: busy, onClick: () => setConfirmRow(null), children: "\u53D6\u6D88" })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ph-sub", style: { padding: "0 18px 8px" }, children: "\u5217\u8868\u53EA\u542B\u5185\u5B58 Top25\uFF1B\u627E\u4E0D\u5230\u76EE\u6807\u65F6\u7528\u300C\u7AEF\u53E3\u300DTab \u6309\u7AEF\u53E3\u5B9A\u4F4D\uFF0C\u6216\u95EE AI\uFF08host_processes \u652F\u6301\u8FC7\u6EE4\uFF09\u3002" })
  ] });
}

// src/PortTab.tsx
import { useMemo as useMemo2, useState as useState2 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function PortTab({ data, showToast, reload }) {
  const [filter, setFilter] = useState2("");
  const [confirmRow, setConfirmRow] = useState2(null);
  const [busy, setBusy] = useState2(false);
  const hostPort = bridgePort(data?.meta ?? null);
  const list = useMemo2(() => {
    const rows = data?.snap?.ports?.list ?? [];
    const f = filter.trim();
    if (!f) return rows;
    if (/^\d+$/.test(f)) return rows.filter((r) => String(r.port).startsWith(f));
    const fl = f.toLowerCase();
    return rows.filter((r) => (r.name || "").toLowerCase().includes(fl));
  }, [data, filter]);
  const doRelease = async (row) => {
    setBusy(true);
    try {
      const r = await killBy({ port: row.port, reason: "\u9762\u677F\u91CA\u653E\u7AEF\u53E3" });
      if (r.ok) {
        const names = (r.results || []).map((x) => `${x.name || "?"} (PID ${x.pid})`).join("\u3001");
        showToast(`\u7AEF\u53E3 ${row.port} \u5DF2\u91CA\u653E\uFF1A${names || "\u5B8C\u6210"}`);
      } else {
        showToast(r.error || "\u91CA\u653E\u5931\u8D25", true);
      }
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
      setConfirmRow(null);
      reload();
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { style: { padding: "6px 16px 10px" }, children: /* @__PURE__ */ jsx3(
      "input",
      {
        className: "ph-inp",
        placeholder: "\u6309\u7AEF\u53E3\u53F7\u6216\u8FDB\u7A0B\u540D\u8FC7\u6EE4\uFF08\u5982 9829 / node\uFF09",
        value: filter,
        onChange: (e) => setFilter(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxs3("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx3("i", { className: "ph-bar" }),
        "\u76D1\u542C\u7AEF\u53E3",
        /* @__PURE__ */ jsxs3("small", { className: "ph-hint", children: [
          (data?.snap?.ports?.list ?? []).length,
          data?.snap?.ports?.count && data.snap.ports.count > data.snap.ports.list.length ? ` / \u5171 ${data.snap.ports.count}` : ""
        ] })
      ] }),
      list.length === 0 && /* @__PURE__ */ jsx3("div", { className: "ph-empty", children: data?.snap ? filter ? `\u6CA1\u6709\u5339\u914D\u300C${filter}\u300D\u7684\u76D1\u542C\u7AEF\u53E3\u3002` : "\u5FEB\u7167\u4E2D\u6CA1\u6709\u7AEF\u53E3\u6570\u636E\uFF08\u670D\u52A1\u6162\u91C7\u6837\u5C1A\u672A\u5B8C\u6210\uFF09\u3002" : "\u6682\u65E0\u5FEB\u7167\uFF1A\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E\u300D\u542F\u52A8\u540E\u53F0\u670D\u52A1\u3002" }),
      list.map((row) => /* @__PURE__ */ jsxs3("div", { className: `ph-row ${row.port === hostPort ? "hl" : ""}`, children: [
        /* @__PURE__ */ jsxs3("span", { className: "ph-row-n", children: [
          ":",
          row.port,
          /* @__PURE__ */ jsx3("small", { children: row.name || "\u672A\u77E5" })
        ] }),
        /* @__PURE__ */ jsxs3("span", { className: "ph-row-v", children: [
          "PID ",
          row.pid
        ] }),
        row.port === hostPort && /* @__PURE__ */ jsx3("span", { className: "ph-tag", style: { color: "#79C0FF", borderColor: "#1f4472" }, children: "Polaris" }),
        /* @__PURE__ */ jsx3("button", { className: "ph-btn danger sm", disabled: busy, onClick: () => setConfirmRow(row), children: "\u91CA\u653E" })
      ] }, `${row.port}-${row.pid}`)),
      confirmRow && /* @__PURE__ */ jsxs3("div", { className: "ph-confirm", children: [
        /* @__PURE__ */ jsxs3("b", { children: [
          "\u91CA\u653E\u7AEF\u53E3 ",
          confirmRow.port,
          "\uFF1F\u5C06\u5F3A\u5236\u7ED3\u675F\u5F53\u524D\u5360\u7528\u5B83\u7684 ",
          confirmRow.name || "\u8FDB\u7A0B",
          "\uFF08\u6267\u884C\u65F6\u91CD\u65B0\u89E3\u6790\u5F52\u5C5E\uFF09\u3002"
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "ph-btn danger sm", disabled: busy, onClick: () => doRelease(confirmRow), children: "\u786E\u8BA4\u91CA\u653E" }),
        /* @__PURE__ */ jsx3("button", { className: "ph-btn ghost sm", disabled: busy, onClick: () => setConfirmRow(null), children: "\u53D6\u6D88" })
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "ph-sub", style: { padding: "0 18px 8px" }, children: "\u84DD\u8272\u9AD8\u4EAE\u662F Polaris \u81EA\u8EAB\u7AEF\u53E3\uFF08\u91CA\u653E\u5B83\u4EEC\u4F1A\u8BA9 Polaris \u6389\u7EBF\uFF0C\u670D\u52A1\u7AEF\u4E5F\u4F1A\u62D2\u7EDD Polaris \u6838\u5FC3\u8FDB\u7A0B\uFF09\u3002 \u91CA\u653E\u8D70\u300C\u6309\u7AEF\u53E3\u7ED3\u675F\u300D\uFF1A\u6267\u884C\u77AC\u95F4\u91CD\u65B0\u89E3\u6790\u5360\u7528\u8005\uFF0C\u907F\u514D PID \u590D\u7528\u8BEF\u6740\u3002" })
  ] });
}

// src/FeedTab.tsx
import { useCallback, useEffect, useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function timeStr(at) {
  return new Date(at).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function FeedTab({ onSendToChat, showToast, markRead, unread, reload }) {
  const [events, setEvents] = useState3(null);
  const reloadEvents = useCallback(async () => {
    try {
      setEvents(await loadEvents(40));
    } catch (e) {
      showToast(`\u4E8B\u4EF6\u52A0\u8F7D\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [showToast]);
  useEffect(() => {
    reloadEvents();
  }, [reloadEvents]);
  const sendToAi = useCallback(async () => {
    if (!onSendToChat) {
      showToast("\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u53D1\u9001\u5230\u804A\u5929", true);
      return;
    }
    const list = (events || []).slice(0, 10);
    if (!list.length) {
      showToast("\u6682\u65E0\u544A\u8B66\u4E8B\u4EF6\u53EF\u53D1\u9001", true);
      return;
    }
    const text = `\u3010\u53E3\u888B\u4E3B\u673A\u3011\u6700\u8FD1 ${list.length} \u6761\u4E3B\u673A\u544A\u8B66\u4E8B\u4EF6\uFF0C\u5E2E\u6211\u5206\u6790\u4E00\u4E0B\u539F\u56E0\u548C\u9700\u8981\u91C7\u53D6\u7684\u52A8\u4F5C\uFF1A
${list.map((e) => `- [${timeStr(e.at)}] ${e.summary}`).join("\n")}`;
    await onSendToChat(text);
    showToast("\u5DF2\u53D1\u9001\u5230\u804A\u5929");
    await markRead();
    await reload();
  }, [events, onSendToChat, showToast, markRead, reload]);
  const onOpen = useCallback(async () => {
    if (unread > 0) await markRead();
  }, [unread, markRead]);
  useEffect(() => {
    onOpen();
  }, [onOpen]);
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "ph-sec", style: { paddingTop: 10 }, children: [
      /* @__PURE__ */ jsx4("i", { className: "ph-bar" }),
      "\u544A\u8B66\u52A8\u6001",
      /* @__PURE__ */ jsx4("small", { className: "ph-hint", children: onSendToChat && /* @__PURE__ */ jsx4("button", { className: "ph-btn ghost sm", onClick: sendToAi, children: "\u53D1\u7ED9 AI \u5206\u6790" }) })
    ] }),
    events === null && /* @__PURE__ */ jsx4("div", { className: "ph-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
    events !== null && events.length === 0 && /* @__PURE__ */ jsxs4("div", { className: "ph-empty", children: [
      "\u8FD8\u6CA1\u6709\u544A\u8B66\u4E8B\u4EF6\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u670D\u52A1\u8FD0\u884C\u671F\u95F4 CPU/\u5185\u5B58/\u78C1\u76D8\u89E6\u53D1\u9608\u503C\u65F6\uFF08\u6301\u7EED\u8D85\u9650\u624D\u62A5\uFF0C\u6062\u590D\u4E5F\u4F1A\u8BB0\u5F55\uFF09\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"
    ] }),
    (events || []).map((ev) => {
      const meta = EVENT_TYPE_META[ev.type] || { label: ev.type, color: "#8B95A7" };
      return /* @__PURE__ */ jsxs4("div", { className: "ph-ev", style: { borderLeftColor: meta.color }, children: [
        /* @__PURE__ */ jsxs4("div", { className: "ph-ev-h", children: [
          /* @__PURE__ */ jsx4("b", { style: { color: meta.color }, children: meta.label }),
          /* @__PURE__ */ jsx4("span", { children: timeStr(ev.at) })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "ph-ev-sum", children: ev.summary })
      ] }, ev.at);
    })
  ] });
}

// src/SettingsTab.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState4 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function StateBadge({ st }) {
  const map = {
    running: ["\u8FD0\u884C\u4E2D", "#3FB950"],
    starting: ["\u542F\u52A8\u4E2D", "#D29922"],
    stopping: ["\u505C\u6B62\u4E2D", "#D29922"],
    stopped: ["\u5DF2\u505C\u6B62", "#8B95A7"],
    error: ["\u5F02\u5E38", "#F85149"]
  };
  const [label, color] = st ? map[st.state] || [st.state, "#8B95A7"] : ["\u672A\u62A5\u544A", "#8B95A7"];
  return /* @__PURE__ */ jsxs5("span", { className: "ph-state", style: { color }, children: [
    /* @__PURE__ */ jsx5("i", { className: "ph-dot", style: { background: color } }),
    label,
    st?.restartCount ? ` \xB7 \u91CD\u542F ${st.restartCount} \u6B21` : ""
  ] });
}
function SettingsTab({ pluginId, data, reload, showToast }) {
  const [svc, setSvc] = useState4(void 0);
  const [svcBusy, setSvcBusy] = useState4(false);
  const [form, setForm] = useState4(data?.settings ?? DEFAULT_SETTINGS);
  useEffect2(() => {
    setForm(data?.settings ?? DEFAULT_SETTINGS);
  }, [data?.settings]);
  const refreshSvc = useCallback2(async () => {
    try {
      const all = await listServiceStatus();
      setSvc(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID));
    } catch (_) {
      setSvc(void 0);
    }
  }, [pluginId]);
  useEffect2(() => {
    refreshSvc();
  }, [refreshSvc]);
  const onSvcAction = useCallback2(async (action) => {
    setSvcBusy(true);
    try {
      await serviceAction(action, pluginId, SERVICE_ID);
      showToast(`\u5DF2${action === "start" ? "\u542F\u52A8" : action === "stop" ? "\u505C\u6B62" : "\u91CD\u542F"}\u670D\u52A1`);
      await new Promise((r) => setTimeout(r, 1200));
      await refreshSvc();
      await reload();
    } catch (e) {
      showToast(`${action} \u5931\u8D25\uFF1A${e.message}`, true);
    } finally {
      setSvcBusy(false);
    }
  }, [pluginId, refreshSvc, reload, showToast]);
  const saveSettings = useCallback2(async (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    try {
      await kvSet(K.settings, next);
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u7EA6 10s \u5185\u751F\u6548\uFF09");
      reload();
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [form, reload, showToast]);
  const onClearEvents = useCallback2(async () => {
    try {
      const n = await clearEvents();
      await kvSet(K.readAt, Date.now());
      showToast(`\u5DF2\u6E05\u7A7A ${n} \u6761\u544A\u8B66\u4E8B\u4EF6`);
      reload();
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [reload, showToast]);
  const num = (v, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  };
  return /* @__PURE__ */ jsxs5("div", { children: [
    /* @__PURE__ */ jsxs5("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx5("i", { className: "ph-bar" }),
        "\u540E\u53F0\u670D\u52A1",
        /* @__PURE__ */ jsx5("small", { className: "ph-hint", children: svc ? `pid ${svc.pid ?? "\u2014"}${svc.port ? ` \xB7 \u7AEF\u53E3 ${svc.port}` : ""}` : "\u72B6\u6001\u672A\u77E5" })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-card-b", children: [
        /* @__PURE__ */ jsx5(StateBadge, { st: svc }),
        svc?.lastError && /* @__PURE__ */ jsxs5("div", { className: "ph-sub", style: { marginTop: 4 }, children: [
          "\u6700\u8FD1\u9519\u8BEF\uFF1A",
          svc.lastError
        ] }),
        /* @__PURE__ */ jsxs5("div", { style: { display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx5("button", { className: "ph-btn sm", disabled: svcBusy, onClick: () => onSvcAction("start"), children: "\u542F\u52A8" }),
          /* @__PURE__ */ jsx5("button", { className: "ph-btn ghost sm", disabled: svcBusy, onClick: () => onSvcAction("restart"), children: "\u91CD\u542F" }),
          /* @__PURE__ */ jsx5("button", { className: "ph-btn ghost sm", disabled: svcBusy, onClick: () => onSvcAction("stop"), children: "\u505C\u6B62" }),
          /* @__PURE__ */ jsx5("button", { className: "ph-btn ghost sm", disabled: svcBusy, onClick: refreshSvc, children: "\u5237\u65B0\u72B6\u6001" })
        ] }),
        /* @__PURE__ */ jsx5("div", { className: "ph-sub", style: { marginTop: 7 }, children: "\u670D\u52A1\u8D1F\u8D23\u5168\u90E8\u91C7\u6837/\u544A\u8B66/kill \u6267\u884C\uFF08\u5355\u5199\u8005\uFF09\uFF1B\u505C\u6B62\u540E\u9762\u677F\u5C06\u663E\u793A\u300C\u65E0\u5FEB\u7167\u300D\uFF0CMCP \u5DE5\u5177\u4E5F\u4F1A\u63D0\u793A\u670D\u52A1\u672A\u8FD0\u884C\u3002" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx5("i", { className: "ph-bar" }),
        "\u544A\u8B66\u9608\u503C"
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-field", children: [
        /* @__PURE__ */ jsxs5("span", { className: "ph-field-l", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u6682\u505C\u544A\u8B66" }),
          /* @__PURE__ */ jsx5("small", { children: "\u7EE7\u7EED\u91C7\u6837\u4E0E\u5FEB\u7167\uFF0C\u4F46\u4E0D\u4EA7\u751F\u65B0\u544A\u8B66\u4E8B\u4EF6" })
        ] }),
        /* @__PURE__ */ jsx5(
          "button",
          {
            className: `ph-toggle ${form.paused ? "on" : ""}`,
            onClick: () => saveSettings({ paused: !form.paused }),
            "aria-label": "\u6682\u505C\u544A\u8B66",
            children: /* @__PURE__ */ jsx5("i", {})
          }
        )
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-field", children: [
        /* @__PURE__ */ jsxs5("span", { className: "ph-field-l", children: [
          /* @__PURE__ */ jsx5("b", { children: "CPU \u9608\u503C\uFF08%\uFF09" }),
          /* @__PURE__ */ jsx5("small", { children: "\u6301\u7EED\u8D85\u8FC7\u624D\u544A\u8B66\uFF0C\u6062\u590D\u4E5F\u4F1A\u8BB0\u5F55" })
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "ph-num",
            type: "number",
            min: 50,
            max: 100,
            value: form.cpuThreshold,
            onChange: (e) => setForm({ ...form, cpuThreshold: num(e.target.value, form.cpuThreshold) }),
            onBlur: (e) => saveSettings({ cpuThreshold: num(e.target.value, form.cpuThreshold) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-field", children: [
        /* @__PURE__ */ jsxs5("span", { className: "ph-field-l", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u5185\u5B58\u9608\u503C\uFF08%\uFF09" }),
          /* @__PURE__ */ jsx5("small", { children: "\u540C\u4E0A" })
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "ph-num",
            type: "number",
            min: 50,
            max: 100,
            value: form.memThreshold,
            onChange: (e) => setForm({ ...form, memThreshold: num(e.target.value, form.memThreshold) }),
            onBlur: (e) => saveSettings({ memThreshold: num(e.target.value, form.memThreshold) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-field", children: [
        /* @__PURE__ */ jsxs5("span", { className: "ph-field-l", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u78C1\u76D8\u5269\u4F59\u4E0B\u9650\uFF08GB\uFF09" }),
          /* @__PURE__ */ jsx5("small", { children: "\u4EFB\u4E00\u76D8\u5269\u4F59\u4F4E\u4E8E\u8BE5\u503C\u544A\u8B66" })
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "ph-num",
            type: "number",
            min: 1,
            max: 500,
            value: form.diskFreeGb,
            onChange: (e) => setForm({ ...form, diskFreeGb: num(e.target.value, form.diskFreeGb) }),
            onBlur: (e) => saveSettings({ diskFreeGb: num(e.target.value, form.diskFreeGb) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-field", children: [
        /* @__PURE__ */ jsxs5("span", { className: "ph-field-l", children: [
          /* @__PURE__ */ jsx5("b", { children: "\u6301\u7EED\u91C7\u6837\u6570" }),
          /* @__PURE__ */ jsx5("small", { children: "\u8FDE\u7EED N \u4E2A\u91C7\u6837\uFF08\u7EA6 N\xD72.5s\uFF09\u8D85\u9650\u624D\u89E6\u53D1\uFF0C\u9632\u6296" })
        ] }),
        /* @__PURE__ */ jsx5(
          "input",
          {
            className: "ph-num",
            type: "number",
            min: 1,
            max: 12,
            value: form.sustainTicks,
            onChange: (e) => setForm({ ...form, sustainTicks: num(e.target.value, form.sustainTicks) }),
            onBlur: (e) => saveSettings({ sustainTicks: num(e.target.value, form.sustainTicks) })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "ph-card", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ph-sec", children: [
        /* @__PURE__ */ jsx5("i", { className: "ph-bar" }),
        "\u6570\u636E\u7BA1\u7406"
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ph-card-b", children: [
        /* @__PURE__ */ jsx5("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: /* @__PURE__ */ jsx5("button", { className: "ph-btn ghost sm", onClick: onClearEvents, children: "\u6E05\u7A7A\u544A\u8B66\u4E8B\u4EF6" }) }),
        /* @__PURE__ */ jsx5("div", { className: "ph-sub", style: { marginTop: 7 }, children: "\u5168\u90E8\u6570\u636E\u5728 cap.kv \u7684 hostmon.* \u952E\u7A7A\u95F4\uFF1B\u5FEB\u7167/\u5386\u53F2\u7531\u670D\u52A1\u6EDA\u52A8\u8986\u76D6\uFF0C\u65E0\u9700\u624B\u52A8\u6E05\u7406\u3002" })
      ] })
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.ph-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ph-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ph-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ph-body::-webkit-scrollbar{width:9px;height:9px}
.ph-body::-webkit-scrollbar-track{background:transparent}
.ph-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.ph-page{max-width:520px;margin:0 auto}

/* \u5934\u90E8 */
.ph-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.ph-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#2EA98C,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ph-tt{flex:1;min-width:0}
.ph-tt b{font-size:15px;display:block}
.ph-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ph-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ph-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ph-dot.stale{background:#D29922}
.ph-dot.down{background:#F85149}
.ph-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ph-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ph-tab:hover{color:#E6EAF2}
.ph-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ph-badge{position:absolute;top:0;right:1px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.ph-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ph-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#2EA98C,#58A6FF);flex-shrink:0}
.ph-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ph-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ph-card-b{padding:11px 13px}
.ph-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ph-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ph-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ph-btn:hover{filter:brightness(1.1)}
.ph-btn:disabled{opacity:.45;cursor:not-allowed}
.ph-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ph-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ph-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ph-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ph-inp:focus{outline:none;border-color:#2b6cb0}
.ph-inp::placeholder{color:#4d5566}
.ph-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ph-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ph-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.ph-toast.bad{border-color:#54262c;color:#FF8A9A}
.ph-toast-wrap{white-space:normal;max-height:130px;overflow-y:auto}

/* \u6982\u89C8 */
.ph-gauges{display:flex;gap:10px;margin:0 16px 10px}
.ph-gauge{flex:1;background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:12px 14px;min-width:0}
.ph-gauge.hot{border-color:#54262c}
.ph-gauge-warm{border-color:#4a3a18}
.ph-gv{font-size:26px;font-weight:700;line-height:1.1;display:flex;align-items:baseline;gap:3px}
.ph-gv small{font-size:12px;color:#8B95A7;font-weight:400}
.ph-gl{font-size:10.5px;color:#8B95A7;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.ph-gl b{color:#C9D1D9;font-size:11.5px}
.ph-spark{width:100%;height:34px;display:block;margin-top:6px}
.ph-diskrow{padding:8px 13px;border-top:1px solid #1d2330}
.ph-diskrow:first-child{border-top:none}
.ph-disk-h{display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:5px}
.ph-disk-h b{color:#E6EAF2}
.ph-disk-h span{color:#8B95A7}
.ph-track{height:6px;border-radius:3px;background:#1d2330;overflow:hidden}
.ph-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#2EA98C,#58A6FF)}
.ph-fill.warn{background:linear-gradient(90deg,#D29922,#E3B341)}
.ph-fill.hot{background:linear-gradient(90deg,#c93c37,#F85149)}
.ph-info{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:11.5px}
.ph-info dt{color:#5C6678;font-size:10.5px}
.ph-info dd{margin:0;color:#C9D1D9;word-break:break-all}
.ph-alertstrip{margin:0 16px 10px;padding:9px 13px;border-radius:11px;border:1px solid #54262c;background:rgba(248,81,73,.08);color:#FF8A9A;font-size:11.5px;line-height:1.6}
.ph-alertstrip.warm{border-color:#4a3a18;background:rgba(210,153,34,.08);color:#E3B341}

/* \u8868\u683C\uFF08\u8FDB\u7A0B/\u7AEF\u53E3\uFF09 */
.ph-row{display:flex;align-items:center;gap:8px;padding:7px 13px;border-top:1px solid #1d2330;font-size:12px}
.ph-row:first-child{border-top:none}
.ph-row.hl{background:rgba(88,166,255,.07)}
.ph-row-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.ph-row-n small{color:#5C6678;font-weight:400;margin-left:6px}
.ph-row-v{color:#8B95A7;font-size:11px;white-space:nowrap}
.ph-confirm{display:flex;align-items:center;gap:8px;padding:8px 13px;background:#241318;border-top:1px solid #54262c;font-size:11.5px;color:#FF8A9A}
.ph-confirm b{flex:1;min-width:0}

/* \u4E8B\u4EF6\u6D41 */
.ph-ev{border-left:2px solid #242C3A;padding:8px 12px;margin:0 16px 8px;background:#141821;border-radius:0 10px 10px 0}
.ph-ev-h{display:flex;align-items:center;gap:7px;font-size:11px;color:#5C6678}
.ph-ev-h b{font-size:10px;font-weight:700;white-space:nowrap}
.ph-ev-sum{font-size:12px;color:#C9D1D9;margin-top:3px;line-height:1.5}

/* \u8BBE\u7F6E */
.ph-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.ph-field:first-child{border-top:none}
.ph-field-l{flex:1;min-width:0}
.ph-field-l b{font-size:12.5px;display:block}
.ph-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.ph-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.ph-toggle.on{background:#2b6cb0}
.ph-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.ph-toggle.on i{left:18px}
.ph-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
.ph-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
`;
function PocketHostPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState5("overview");
  const [data, setData] = useState5(null);
  const [readAt, setReadAt] = useState5(0);
  const [newCount, setNewCount] = useState5(0);
  const [loadErr, setLoadErr] = useState5("");
  const [toast, setToast] = useState5(null);
  const readAtRef = useRef(0);
  const toastTimer = useRef(null);
  const showToast = useCallback3((msg, bad) => {
    setToast({ msg, bad, wrap: (msg || "").length > 46 });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const reload = useCallback3(async () => {
    try {
      const d = await loadPanelData(readAtRef.current);
      setData(d);
      setLoadErr("");
      setNewCount(d.newCount);
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  const refreshReadAt = useCallback3(async () => {
    const r = await loadReadAt().catch(() => 0);
    readAtRef.current = r;
    setReadAt(r);
  }, []);
  useEffect3(() => {
    refreshReadAt();
  }, [refreshReadAt]);
  useEffect3(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 5e3);
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
  const markRead = useCallback3(async () => {
    await markAllRead().catch(() => {
    });
    readAtRef.current = Date.now();
    setReadAt(readAtRef.current);
    setNewCount(0);
  }, []);
  const hb = heartbeatOf(data?.snap ?? null, data?.meta ?? null);
  return /* @__PURE__ */ jsxs6("div", { className: "ph-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "ph-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "ph-logo", children: "\u{1F4DF}" }),
      /* @__PURE__ */ jsxs6("div", { className: "ph-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u53E3\u888B\u4E3B\u673A" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          /* @__PURE__ */ jsx6("i", { className: `ph-dot ${hb.cls}` }),
          hb.text
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "ph-tabs", children: [
        ["overview", "\u6982\u89C8"],
        ["procs", "\u8FDB\u7A0B"],
        ["ports", "\u7AEF\u53E3"],
        ["feed", "\u52A8\u6001"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs6("button", { className: `ph-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "feed" && newCount > 0 && /* @__PURE__ */ jsx6("span", { className: "ph-badge", children: newCount > 99 ? "99+" : newCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "ph-body", children: /* @__PURE__ */ jsxs6("div", { className: "ph-page", children: [
      loadErr && /* @__PURE__ */ jsxs6("div", { className: "ph-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "overview" && /* @__PURE__ */ jsx6(OverviewTab, { data, reload, showToast, goFeed: () => setTab("feed") }),
      tab === "procs" && /* @__PURE__ */ jsx6(ProcTab, { data, showToast, reload }),
      tab === "ports" && /* @__PURE__ */ jsx6(PortTab, { data, showToast, reload }),
      tab === "feed" && /* @__PURE__ */ jsx6(
        FeedTab,
        {
          onSendToChat,
          showToast,
          markRead,
          unread: newCount,
          reload
        }
      ),
      tab === "settings" && /* @__PURE__ */ jsx6(SettingsTab, { pluginId, data, reload, showToast })
    ] }) }),
    toast && /* @__PURE__ */ jsx6("div", { className: `ph-toast ${toast.bad ? "bad" : ""} ${toast.wrap ? "ph-toast-wrap" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function PocketHostEntry(props) {
  return /* @__PURE__ */ jsx7(PocketHostPanel, { ...props });
}
export {
  PocketHostEntry as default
};
