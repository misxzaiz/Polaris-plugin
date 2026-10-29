// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef, useState as useState3 } from "react";

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
var DEFAULT_SETTINGS = {
  maxItems: 100,
  retentionDays: 14,
  sweepMs: 6e5,
  urlEnrich: true
};
var TEXT_CAP = 8e3;
var K = {
  item: (id) => `relay.item.${id}`,
  itemPrefix: "relay.item.",
  settings: "relay.settings",
  meta: "relay.meta",
  readAt: "relay.readAt"
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
async function loadBoard(readAt = 0) {
  const [keys, rawMeta, rawSettings] = await Promise.all([
    kvKeys(),
    kvGet(K.meta),
    kvGet(K.settings)
  ]);
  const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix));
  const items = await Promise.all(itemKeys.map(async (k) => {
    const v = await kvGet(k).catch(() => null);
    return v && typeof v === "object" && typeof v.id === "string" ? v : null;
  }));
  const live = items.filter((v) => v !== null).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  let newCount = 0;
  if (readAt > 0) {
    for (const it of live) {
      if ((it.createdAt || 0) > readAt) newCount++;
    }
  }
  return {
    items: live,
    meta: rawMeta && typeof rawMeta === "object" ? rawMeta : null,
    settings: { ...DEFAULT_SETTINGS, ...rawSettings && typeof rawSettings === "object" ? rawSettings : {} },
    newCount
  };
}
function deviceLabel() {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return "\u624B\u673A";
  return "\u684C\u9762";
}
function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return "i" + c.randomUUID().replace(/-/g, "").slice(0, 12);
  return "i" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function validateText(text) {
  const t = text.trim();
  if (!t) return "\u5185\u5BB9\u4E3A\u7A7A";
  if (t.length > TEXT_CAP) return `\u5185\u5BB9\u8FC7\u957F\uFF08${t.length} > ${TEXT_CAP} \u5B57\u7B26\uFF09`;
  return null;
}
function detectKind(text) {
  const t = text.trim();
  if (!t || /\s/.test(t)) return "text";
  return /^https?:\/\/\S+$/i.test(t) ? "url" : "text";
}
async function pushItem(text, from) {
  const t = text.trim();
  const verr = validateText(t);
  if (verr) throw new Error(verr);
  const item = {
    id: uid(),
    text: t,
    kind: detectKind(t),
    from: (from || deviceLabel()).slice(0, 24),
    createdAt: Date.now(),
    pinned: false,
    enriched: false
  };
  if (item.kind === "url") item.url = t;
  await kvSet(K.item(item.id), item);
  return item;
}
async function setPinned(id, pinned) {
  const it = await kvGet(K.item(id));
  if (!it || typeof it !== "object") throw new Error("\u6761\u76EE\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u6E05\u7406");
  await kvSet(K.item(id), { ...it, pinned });
}
async function removeItem(id) {
  await kvDel(K.item(id));
}
async function clearAll() {
  const keys = await kvKeys();
  const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix));
  await Promise.all(itemKeys.map((k) => kvDel(k)));
  await kvDel(K.readAt).catch(() => {
  });
  return itemKeys.length;
}
async function loadReadAt() {
  const v = await kvGet(K.readAt);
  return typeof v === "number" ? v : 0;
}
async function markAllRead() {
  await kvSet(K.readAt, Date.now());
}
async function copyText(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return "ok";
    }
  } catch (_) {
  }
  return "manual";
}
function openUrl(url) {
  try {
    const w = window.open(url, "_blank", "noopener");
    return !!w;
  } catch (_) {
    return false;
  }
}
async function listServiceStatus() {
  const r = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
  return Array.isArray(r) ? r : [];
}
var SERVICE_ID = "relay-service";
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
function timeStr(ts) {
  const d = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

// src/Settings.tsx
import { useCallback, useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function StateBadge({ st }) {
  const map = {
    running: ["\u8FD0\u884C\u4E2D", "#3FB950"],
    starting: ["\u542F\u52A8\u4E2D", "#D29922"],
    stopping: ["\u505C\u6B62\u4E2D", "#D29922"],
    stopped: ["\u5DF2\u505C\u6B62", "#8B95A7"],
    error: ["\u5F02\u5E38", "#F85149"]
  };
  const [label, color] = st ? map[st.state] || [st.state, "#8B95A7"] : ["\u672A\u62A5\u544A", "#8B95A7"];
  return /* @__PURE__ */ jsxs("span", { className: "cr-state", style: { color }, children: [
    /* @__PURE__ */ jsx("i", { className: "cr-dot", style: { background: color } }),
    label,
    st?.restartCount ? ` \xB7 \u91CD\u542F ${st.restartCount} \u6B21` : ""
  ] });
}
function SettingsSection({ pluginId, data, reload, showToast }) {
  const [svc, setSvc] = useState(void 0);
  const [svcBusy, setSvcBusy] = useState(false);
  const [form, setForm] = useState(data?.settings ?? DEFAULT_SETTINGS);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    setForm(data?.settings ?? DEFAULT_SETTINGS);
  }, [data?.settings]);
  const refreshSvc = useCallback(async () => {
    try {
      const all = await listServiceStatus();
      setSvc(all.find((s) => s.pluginId === pluginId && s.serviceId === SERVICE_ID));
    } catch (_) {
      setSvc(void 0);
    }
  }, [pluginId]);
  useEffect(() => {
    refreshSvc();
  }, [refreshSvc]);
  const onSvcAction = useCallback(async (action) => {
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
  const saveSettings = useCallback(async (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    try {
      await kvSet(K.settings, next);
      showToast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u670D\u52A1\u7EA6 30s \u5185\u751F\u6548\uFF09");
      reload();
    } catch (e) {
      showToast(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [form, reload, showToast]);
  const onClearAll = useCallback(async () => {
    try {
      const n = await clearAll();
      setConfirmClear(false);
      showToast(`\u5DF2\u6E05\u7A7A ${n} \u6761`);
      reload();
    } catch (e) {
      showToast(`\u6E05\u7A7A\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [reload, showToast]);
  const num = (v, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "cr-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "cr-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "cr-bar" }),
        "\u4FDD\u7559\u7B56\u7565",
        /* @__PURE__ */ jsx("small", { className: "cr-hint", children: "\u7531\u540E\u53F0\u670D\u52A1\u6309\u5468\u671F\u6E05\u626B" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "cr-field", children: [
        /* @__PURE__ */ jsxs("span", { className: "cr-field-l", children: [
          /* @__PURE__ */ jsx("b", { children: "\u6700\u591A\u4FDD\u7559\u6761\u6570" }),
          /* @__PURE__ */ jsx("small", { children: "\u8D85\u51FA\u65F6\u6700\u65E7\u7684\u672A\u7F6E\u9876\u6761\u76EE\u88AB\u6E05\u7406\uFF08\u7F6E\u9876\u6C38\u7559\uFF09" })
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "cr-num",
            type: "number",
            min: 20,
            max: 500,
            value: form.maxItems,
            onChange: (e) => setForm({ ...form, maxItems: num(e.target.value, form.maxItems) }),
            onBlur: (e) => saveSettings({ maxItems: num(e.target.value, form.maxItems) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "cr-field", children: [
        /* @__PURE__ */ jsxs("span", { className: "cr-field-l", children: [
          /* @__PURE__ */ jsx("b", { children: "\u4FDD\u7559\u5929\u6570" }),
          /* @__PURE__ */ jsx("small", { children: "\u8D85\u8FC7\u5929\u6570\u7684\u672A\u7F6E\u9876\u6761\u76EE\u88AB\u6E05\u7406" })
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "cr-num",
            type: "number",
            min: 1,
            max: 365,
            value: form.retentionDays,
            onChange: (e) => setForm({ ...form, retentionDays: num(e.target.value, form.retentionDays) }),
            onBlur: (e) => saveSettings({ retentionDays: num(e.target.value, form.retentionDays) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "cr-field", children: [
        /* @__PURE__ */ jsxs("span", { className: "cr-field-l", children: [
          /* @__PURE__ */ jsx("b", { children: "URL \u6807\u9898\u6293\u53D6" }),
          /* @__PURE__ */ jsx("small", { children: "\u63A8\u9001\u94FE\u63A5\u65F6\u7531\u670D\u52A1\u6293\u53D6\u7F51\u9875\u6807\u9898\u4E0E\u6458\u8981\uFF08\u5173\u95ED\u5219\u53EA\u663E\u793A URL\uFF09" })
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: `cr-toggle ${form.urlEnrich ? "on" : ""}`,
            onClick: () => saveSettings({ urlEnrich: !form.urlEnrich }),
            "aria-label": "URL \u6807\u9898\u6293\u53D6",
            children: /* @__PURE__ */ jsx("i", {})
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cr-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "cr-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "cr-bar" }),
        "\u540E\u53F0\u670D\u52A1",
        /* @__PURE__ */ jsx("small", { className: "cr-hint", children: svc ? `pid ${svc.pid ?? "\u2014"}` : "\u72B6\u6001\u672A\u77E5" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "cr-card-b", children: [
        /* @__PURE__ */ jsx(StateBadge, { st: svc }),
        svc?.lastError && /* @__PURE__ */ jsxs("div", { className: "cr-sub", style: { marginTop: 4 }, children: [
          "\u6700\u8FD1\u9519\u8BEF\uFF1A",
          svc.lastError
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsx("button", { className: "cr-btn sm", disabled: svcBusy, onClick: () => onSvcAction("start"), children: "\u542F\u52A8" }),
          /* @__PURE__ */ jsx("button", { className: "cr-btn ghost sm", disabled: svcBusy, onClick: () => onSvcAction("restart"), children: "\u91CD\u542F" }),
          /* @__PURE__ */ jsx("button", { className: "cr-btn ghost sm", disabled: svcBusy, onClick: () => onSvcAction("stop"), children: "\u505C\u6B62" }),
          /* @__PURE__ */ jsx("button", { className: "cr-btn ghost sm", disabled: svcBusy, onClick: refreshSvc, children: "\u5237\u65B0\u72B6\u6001" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "cr-sub", style: { marginTop: 7 }, children: "\u670D\u52A1\u8D1F\u8D23 URL \u6807\u9898\u6293\u53D6\u4E0E\u4FDD\u7559\u6E05\u626B\uFF1B\u505C\u6B62\u540E\u6536\u53D1\u7167\u5E38\uFF0C\u94FE\u63A5\u4E0D\u518D\u8865\u6807\u9898\u3001\u6761\u76EE\u4E0D\u518D\u81EA\u52A8\u6E05\u7406\u3002" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cr-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "cr-sec", children: [
        /* @__PURE__ */ jsx("i", { className: "cr-bar" }),
        "\u5371\u9669\u533A"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "cr-card-b", children: !confirmClear ? /* @__PURE__ */ jsx("button", { className: "cr-btn danger sm", onClick: () => setConfirmClear(true), children: "\u6E05\u7A7A\u6574\u5757\u677F\u5B50\uFF08\u542B\u7F6E\u9876\uFF09" }) : /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11.5, color: "#FF8A9A" }, children: "\u786E\u8BA4\u5220\u9664\u5168\u90E8\u6761\u76EE\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002" }),
        /* @__PURE__ */ jsx("button", { className: "cr-btn danger sm", onClick: onClearAll, children: "\u786E\u8BA4\u6E05\u7A7A" }),
        /* @__PURE__ */ jsx("button", { className: "cr-btn ghost sm", onClick: () => setConfirmClear(false), children: "\u53D6\u6D88" })
      ] }) })
    ] })
  ] });
}

// src/ItemCard.tsx
import { useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ItemCard({ item, isNew, reload, showToast, requestCopy }) {
  const [busy, setBusy] = useState2(false);
  const [expanded, setExpanded] = useState2(false);
  const onCopy = async () => {
    const r = await copyText(item.text);
    if (r === "ok") showToast("\u5DF2\u590D\u5236");
    else requestCopy({ text: item.text });
  };
  const onTogglePin = async () => {
    setBusy(true);
    try {
      await setPinned(item.id, !item.pinned);
      await reload();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const onDelete = async () => {
    setBusy(true);
    try {
      await removeItem(item.id);
      await reload();
      showToast("\u5DF2\u5220\u9664");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const onOpen = () => {
    if (!openUrl(item.url || item.text)) {
      requestCopy({ text: item.url || item.text });
      showToast("\u65E0\u6CD5\u5728\u9762\u677F\u5185\u6253\u5F00\uFF0C\u5DF2\u5F39\u51FA\u624B\u52A8\u590D\u5236", true);
    }
  };
  const long = item.text.length > 300;
  const bodyText = expanded || !long ? item.text : `${item.text.slice(0, 300)}\u2026`;
  return /* @__PURE__ */ jsxs2("div", { className: "cr-card", children: [
    /* @__PURE__ */ jsxs2("div", { className: "cr-card-h", children: [
      /* @__PURE__ */ jsx2("span", { className: "cr-kind", children: item.kind === "url" ? "\u{1F517}" : "\u{1F4DD}" }),
      /* @__PURE__ */ jsx2("span", { className: "cr-from", children: item.from }),
      /* @__PURE__ */ jsx2("span", { className: "cr-time", children: timeStr(item.createdAt || 0) }),
      isNew && /* @__PURE__ */ jsx2("span", { className: "cr-new", children: "\u65B0" }),
      /* @__PURE__ */ jsx2("span", { style: { flex: 1 } }),
      /* @__PURE__ */ jsx2("button", { className: "cr-icon", title: item.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876", disabled: busy, onClick: onTogglePin, children: item.pinned ? "\u{1F4CC}" : "\u{1F4CD}" }),
      /* @__PURE__ */ jsx2("button", { className: "cr-icon", title: "\u5220\u9664", disabled: busy, onClick: onDelete, children: "\u{1F5D1}" })
    ] }),
    item.kind === "url" ? /* @__PURE__ */ jsxs2("button", { className: "cr-linkbody", onClick: onOpen, children: [
      /* @__PURE__ */ jsx2("b", { children: item.title || item.text }),
      item.desc && /* @__PURE__ */ jsx2("span", { className: "cr-desc", children: item.desc }),
      /* @__PURE__ */ jsx2("span", { className: "cr-url", children: item.url })
    ] }) : /* @__PURE__ */ jsx2("div", { className: `cr-textbody ${expanded ? "open" : ""}`, onClick: () => long && setExpanded(!expanded), children: bodyText }),
    /* @__PURE__ */ jsxs2("div", { className: "cr-card-a", children: [
      /* @__PURE__ */ jsx2("button", { className: "cr-btn ghost sm", disabled: busy, onClick: onCopy, children: "\u590D\u5236" }),
      item.kind === "url" && /* @__PURE__ */ jsx2("button", { className: "cr-btn ghost sm", disabled: busy, onClick: onOpen, children: "\u6253\u5F00" }),
      item.enriched && item.enrichFail && /* @__PURE__ */ jsx2("span", { className: "cr-fail", title: item.enrichFail, children: "\u6807\u9898\u6293\u53D6\u5931\u8D25" }),
      item.kind === "url" && item.enriched && !item.enrichFail && item.title && /* @__PURE__ */ jsx2("span", { className: "cr-fail", style: { color: "#3FB950" }, children: "\u5DF2\u6293\u53D6\u6807\u9898" }),
      item.kind === "url" && !item.enriched && /* @__PURE__ */ jsx2("span", { className: "cr-fail", children: "\u6293\u53D6\u6807\u9898\u4E2D\u2026" })
    ] })
  ] });
}

// src/Panel.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var css = `
.cr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cr-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cr-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cr-body::-webkit-scrollbar{width:9px;height:9px}
.cr-body::-webkit-scrollbar-track{background:transparent}
.cr-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cr-page{max-width:520px;margin:0 auto}

/* \u5934\u90E8 */
.cr-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cr-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8957E5,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.cr-tt{flex:1;min-width:0}
.cr-tt b{font-size:15px;display:block}
.cr-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.cr-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.cr-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.cr-dot.stale{background:#D29922}
.cr-dot.down{background:#F85149}
.cr-tabs{display:flex;gap:4px}
.cr-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;position:relative}
.cr-tab:hover{color:#E6EAF2}
.cr-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cr-badge{position:absolute;top:0;right:2px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

/* \u901A\u7528 */
.cr-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.cr-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8957E5,#58A6FF);flex-shrink:0}
.cr-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.cr-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cr-btn:hover{filter:brightness(1.1)}
.cr-btn:disabled{opacity:.45;cursor:not-allowed}
.cr-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.cr-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.cr-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.cr-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.cr-inp:focus{outline:none;border-color:#2b6cb0}
.cr-inp::placeholder{color:#4d5566}
.cr-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.cr-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.cr-toast{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}
.cr-toast.bad{border-color:#54262c;color:#FF8A9A}

/* \u8F93\u5165\u533A */
.cr-composer{margin:0 16px 12px;background:#161B22;border:1px solid #242C3A;border-radius:13px;padding:10px}
.cr-ta{width:100%;min-height:56px;max-height:180px;resize:vertical;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:8px 10px;font:12.5px/1.5 Consolas,Menlo,-apple-system,sans-serif}
.cr-ta:focus{outline:none;border-color:#2b6cb0}
.cr-ta::placeholder{color:#4d5566}
.cr-composer-b{display:flex;align-items:center;gap:8px;margin-top:8px}
.cr-count{font-size:10.5px;color:#5C6678}
.cr-count.hot{color:#E3B341}
.cr-chip{background:#1C2330;border:1px solid #242C3A;color:#8B95A7;border-radius:14px;padding:3px 11px;font-size:11px;cursor:pointer}
.cr-chip.on{background:#2b6cb0;border-color:#2b6cb0;color:#fff;font-weight:600}
.cr-filters{display:flex;gap:6px;padding:0 16px 10px;flex-wrap:wrap}

/* \u6761\u76EE\u5361 */
.cr-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.cr-card-h{display:flex;align-items:center;gap:7px;padding:8px 12px 0;font-size:10.5px;color:#5C6678}
.cr-kind{font-size:11px}
.cr-from{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:0 6px;color:#8B95A7}
.cr-time{color:#5C6678}
.cr-new{background:rgba(88,166,255,.15);color:#79C0FF;border-radius:5px;padding:0 6px;font-weight:700}
.cr-icon{background:transparent;border:none;cursor:pointer;font-size:13px;padding:2px 4px;opacity:.75}
.cr-icon:hover{opacity:1}
.cr-linkbody{display:block;width:100%;text-align:left;background:transparent;border:none;color:#E6EAF2;padding:8px 12px 2px;cursor:pointer;font:inherit}
.cr-linkbody b{display:block;font-size:13px;line-height:1.45;word-break:break-all}
.cr-desc{display:block;font-size:11px;color:#8B95A7;line-height:1.6;margin-top:3px;word-break:break-word}
.cr-url{display:block;font-size:10px;color:#5C6678;margin-top:4px;word-break:break-all}
.cr-textbody{padding:8px 12px 2px;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:hidden;cursor:pointer}
.cr-textbody.open{max-height:none}
.cr-card-a{display:flex;align-items:center;gap:6px;padding:6px 12px 10px}
.cr-fail{font-size:10px;color:#D29922}

/* \u8BBE\u7F6E */
.cr-card-b{padding:11px 13px}
.cr-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.cr-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px}
.cr-field{display:flex;align-items:center;gap:10px;padding:8px 13px;border-top:1px solid #1d2330}
.cr-field:first-child{border-top:none}
.cr-field-l{flex:1;min-width:0}
.cr-field-l b{font-size:12.5px;display:block}
.cr-field-l small{font-size:10.5px;color:#5C6678;display:block;line-height:1.5}
.cr-toggle{width:38px;height:22px;border-radius:11px;background:#2a2f3a;border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .15s}
.cr-toggle.on{background:#2b6cb0}
.cr-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#E6EAF2;transition:left .15s}
.cr-toggle.on i{left:18px}
.cr-num{width:76px;background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:5px 8px;font-size:12px;flex-shrink:0}
`;
function ClipRelayPanel({ pluginId, onSendToChat }) {
  const [tab, setTab] = useState3("board");
  const [filter, setFilter] = useState3("all");
  const [data, setData] = useState3(null);
  const [readAt, setReadAt] = useState3(0);
  const [loadErr, setLoadErr] = useState3("");
  const [toast, setToast] = useState3(null);
  const [copyReq, setCopyReq] = useState3(null);
  const readAtRef = useRef(0);
  const toastTimer = useRef(null);
  const showToast = useCallback2((msg, bad) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  const reload = useCallback2(async () => {
    try {
      const d = await loadBoard(readAtRef.current);
      setData(d);
      setLoadErr("");
      return d;
    } catch (e) {
      setLoadErr(e.message);
      return null;
    }
  }, []);
  const refreshReadAt = useCallback2(async () => {
    const r = await loadReadAt().catch(() => 0);
    readAtRef.current = r;
    setReadAt(r);
  }, []);
  useEffect2(() => {
    refreshReadAt();
  }, [refreshReadAt]);
  useEffect2(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden" || !alive) return;
      await reload();
    };
    poll();
    const timer = setInterval(poll, 3e3);
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
  const newCount = data?.newCount ?? 0;
  useEffect2(() => {
    if (tab !== "board" || newCount <= 0) return;
    const t = setTimeout(async () => {
      await markAllRead().catch(() => {
      });
      readAtRef.current = Date.now();
      setReadAt(readAtRef.current);
    }, 3e3);
    return () => clearTimeout(t);
  }, [tab, newCount]);
  const hb = (() => {
    const meta = data?.meta ?? null;
    const last = meta?.lastTickAt;
    if (!last) return { cls: "down", text: "\u6807\u9898\u6293\u53D6\u670D\u52A1\u672A\u8FD0\u884C\uFF08\u6536\u53D1\u4E0D\u53D7\u5F71\u54CD\uFF09" };
    const age = Date.now() - last;
    if (age < 150 * 1e3) return { cls: "ok", text: `\u5728\u7EBF \xB7 \u672C\u7AEF\uFF1A${deviceLabel()}` };
    return { cls: "stale", text: `\u670D\u52A1\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 6e4)} \u5206\u949F` };
  })();
  const items = data?.items ?? [];
  const pinned = items.filter((it) => it.pinned);
  const shown = (() => {
    if (filter === "pinned") return pinned;
    if (filter === "all") return items;
    return items.filter((it) => it.kind === filter);
  })();
  const counts = {
    all: items.length,
    url: items.filter((it) => it.kind === "url").length,
    text: items.filter((it) => it.kind === "text").length,
    pinned: pinned.length
  };
  return /* @__PURE__ */ jsxs3("div", { className: "cr-root", children: [
    /* @__PURE__ */ jsx3("style", { children: css }),
    /* @__PURE__ */ jsxs3("div", { className: "cr-top", children: [
      /* @__PURE__ */ jsx3("div", { className: "cr-logo", children: "\u{1F4CB}" }),
      /* @__PURE__ */ jsxs3("div", { className: "cr-tt", children: [
        /* @__PURE__ */ jsx3("b", { children: "\u6587\u672C\u63A5\u529B" }),
        /* @__PURE__ */ jsxs3("small", { children: [
          /* @__PURE__ */ jsx3("i", { className: `cr-dot ${hb.cls}` }),
          hb.text
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "cr-tabs", children: [
        ["board", "\u677F\u5B50"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([k, label]) => /* @__PURE__ */ jsxs3("button", { className: `cr-tab ${tab === k ? "on" : ""}`, onClick: () => setTab(k), children: [
        label,
        k === "board" && newCount > 0 && /* @__PURE__ */ jsx3("span", { className: "cr-badge", children: newCount > 99 ? "99+" : newCount })
      ] }, k)) })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cr-body", children: /* @__PURE__ */ jsxs3("div", { className: "cr-page", children: [
      loadErr && /* @__PURE__ */ jsxs3("div", { className: "cr-err", children: [
        "\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A",
        loadErr,
        "\uFF08\u68C0\u67E5 Polaris \u662F\u5426\u5728\u8FD0\u884C\uFF09"
      ] }),
      tab === "board" && /* @__PURE__ */ jsx3(
        BoardView,
        {
          data,
          shown,
          counts,
          filter,
          setFilter,
          reload,
          showToast,
          requestCopy: setCopyReq,
          readAt
        }
      ),
      tab === "settings" && /* @__PURE__ */ jsx3(
        SettingsSection,
        {
          pluginId,
          data,
          reload,
          showToast
        }
      )
    ] }) }),
    toast && /* @__PURE__ */ jsx3("div", { className: `cr-toast ${toast.bad ? "bad" : ""}`, children: toast.msg }),
    copyReq && /* @__PURE__ */ jsx3(
      CopyFallback,
      {
        text: copyReq.text,
        onClose: () => setCopyReq(null)
      }
    )
  ] });
}
function BoardView({ data, shown, counts, filter, setFilter, reload, showToast, requestCopy, readAt }) {
  const [text, setText] = useState3("");
  const [busy, setBusy] = useState3(false);
  const [err, setErr] = useState3("");
  const onPush = useCallback2(async () => {
    setErr("");
    const t = text.trim();
    if (!t) return;
    if (t.length > TEXT_CAP) {
      setErr(`\u5185\u5BB9\u8FC7\u957F\uFF08${t.length} > ${TEXT_CAP} \u5B57\u7B26\uFF09`);
      return;
    }
    setBusy(true);
    try {
      await pushItem(t);
      setText("");
      await reload();
      showToast("\u5DF2\u63A8\u9001\u5230\u6240\u6709\u8BBE\u5907");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [text, reload, showToast]);
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onPush();
    }
  };
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "cr-composer", children: [
      /* @__PURE__ */ jsx3(
        "textarea",
        {
          className: "cr-ta",
          placeholder: `\u7C98\u8D34\u6216\u8F93\u5165\u8981\u63A5\u529B\u7684\u5185\u5BB9\uFF08\u94FE\u63A5\u81EA\u52A8\u6293\u6807\u9898\uFF09\uFF1BCtrl+Enter \u63A8\u9001\uFF1B\u672C\u7AEF\u6807\u8BB0\uFF1A${deviceLabel()}`,
          value: text,
          onChange: (e) => {
            setText(e.target.value);
            setErr("");
          },
          onKeyDown: onKey
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "cr-composer-b", children: [
        /* @__PURE__ */ jsx3("span", { className: `cr-count ${text.length > TEXT_CAP ? "hot" : ""}`, children: text.length > 800 ? `${text.length}/${TEXT_CAP}` : "" }),
        err && /* @__PURE__ */ jsx3("span", { className: "cr-err", style: { padding: 0 }, children: err }),
        /* @__PURE__ */ jsx3("button", { className: "cr-btn", style: { marginLeft: "auto" }, disabled: busy || !text.trim(), onClick: onPush, children: busy ? "\u63A8\u9001\u4E2D\u2026" : "\u63A8\u9001\u5230\u6240\u6709\u8BBE\u5907" })
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "cr-filters", children: [
      ["all", `\u5168\u90E8 ${counts.all}`],
      ["url", `\u94FE\u63A5 ${counts.url}`],
      ["text", `\u6587\u672C ${counts.text}`],
      ["pinned", `\u7F6E\u9876 ${counts.pinned}`]
    ].map(([k, label]) => /* @__PURE__ */ jsx3("button", { className: `cr-chip ${filter === k ? "on" : ""}`, onClick: () => setFilter(k), children: label }, k)) }),
    shown.length === 0 ? /* @__PURE__ */ jsx3("div", { className: "cr-empty", children: filter === "all" ? /* @__PURE__ */ jsxs3(Fragment, { children: [
      "\u677F\u5B50\u8FD8\u662F\u7A7A\u7684\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u5728\u4E0A\u9762\u7C98\u8D34\u4E00\u6761\u94FE\u63A5\u6216\u4E00\u6BB5\u6587\u672C\u63A8\u9001\u5230\u6240\u6709\u8BBE\u5907\uFF1B",
      /* @__PURE__ */ jsx3("br", {}),
      "\u4E5F\u53EF\u4EE5\u5728\u804A\u5929\u91CC\u5BF9 AI \u8BF4\u300C\u628A\u8FD9\u4E2A\u94FE\u63A5\u53D1\u5230\u6211\u624B\u673A\u4E0A\u300D\u3002"
    ] }) : "\u8BE5\u7B5B\u9009\u4E0B\u6CA1\u6709\u6761\u76EE\u3002" }) : shown.map((it) => /* @__PURE__ */ jsx3(
      ItemCard,
      {
        item: it,
        isNew: readAt > 0 && (it.createdAt || 0) > readAt,
        reload,
        showToast,
        requestCopy
      },
      it.id
    )),
    data && data.items.length >= data.settings.maxItems - 3 && /* @__PURE__ */ jsxs3("div", { className: "cr-hint", style: { padding: "0 18px 8px", textAlign: "center" }, children: [
      "\u63A5\u8FD1\u4FDD\u7559\u4E0A\u9650\uFF08",
      data.settings.maxItems,
      " \u6761\uFF09\u2014\u2014\u6700\u65E7\u7684\u672A\u7F6E\u9876\u6761\u76EE\u4F1A\u88AB\u670D\u52A1\u81EA\u52A8\u6E05\u7406\u3002"
    ] })
  ] });
}
function CopyFallback({ text, onClose }) {
  const ref = useRef(null);
  useEffect2(() => {
    const t = ref.current;
    if (t) {
      t.focus();
      t.select();
    }
  }, []);
  return /* @__PURE__ */ jsx3(
    "div",
    {
      style: {
        position: "absolute",
        inset: 0,
        zIndex: 98,
        background: "rgba(8,10,14,.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      },
      onClick: onClose,
      children: /* @__PURE__ */ jsxs3(
        "div",
        {
          style: {
            background: "#161B22",
            border: "1px solid #242C3A",
            borderRadius: 13,
            padding: 14,
            width: "100%",
            maxWidth: 460
          },
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 12.5, fontWeight: 700, marginBottom: 4 }, children: "\u624B\u52A8\u590D\u5236" }),
            /* @__PURE__ */ jsx3("div", { style: { fontSize: 10.5, color: "#8B95A7", lineHeight: 1.6, marginBottom: 8 }, children: "\u5F53\u524D\u9875\u9762\u4E0D\u662F\u5B89\u5168\u4E0A\u4E0B\u6587\uFF08\u624B\u673A\u7ECF http://\u5C40\u57DF\u7F51\u5730\u5740 \u8BBF\u95EE\uFF09\uFF0C\u6D4F\u89C8\u5668\u4E0D\u5141\u8BB8\u7A0B\u5E8F\u76F4\u63A5\u5199\u526A\u8D34\u677F\u2014\u2014 \u6587\u672C\u5DF2\u5168\u9009\uFF0C\u957F\u6309 / Ctrl+C \u590D\u5236\u3002" }),
            /* @__PURE__ */ jsx3(
              "textarea",
              {
                ref,
                readOnly: true,
                value: text,
                style: {
                  width: "100%",
                  height: 130,
                  background: "#0d1017",
                  border: "1px solid #2a2f3a",
                  borderRadius: 8,
                  color: "#E6EAF2",
                  padding: 8,
                  fontSize: 12,
                  resize: "none"
                }
              }
            ),
            /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }, children: [
              /* @__PURE__ */ jsx3("button", { className: "cr-btn sm", onClick: () => {
                ref.current?.focus();
                ref.current?.select();
              }, children: "\u91CD\u65B0\u5168\u9009" }),
              /* @__PURE__ */ jsx3("button", { className: "cr-btn ghost sm", onClick: onClose, children: "\u5173\u95ED" })
            ] })
          ]
        }
      )
    }
  );
}

// src/index.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function ClipRelayEntry(props) {
  return /* @__PURE__ */ jsx4(ClipRelayPanel, { ...props });
}
export {
  ClipRelayEntry as default
};
