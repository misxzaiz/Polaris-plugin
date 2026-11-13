// src/Panel.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

// src/bridge.ts
function globals() {
  return window;
}
function getHostInvoke() {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__");
  return fn;
}
async function callService(action, params = {}) {
  const invoke = getHostInvoke();
  const res = await invoke(
    "router_dispatch",
    {
      req: {
        target: "cap.pluginServiceManager",
        payload: {
          action: "request",
          serviceId: "im-bridge-service",
          path: "/dispatch",
          body: { action, ...params }
        }
      }
    }
  );
  if (!res.ok) throw new Error(res.error || "\u5BBF\u4E3B\u8F6C\u53D1\u5931\u8D25");
  const inner = res.result;
  if (!inner) throw new Error("\u670D\u52A1\u65E0\u54CD\u5E94");
  if (!inner.ok) throw new Error(inner.error || "\u670D\u52A1\u8C03\u7528\u5931\u8D25");
  return inner.result ?? {};
}
var PLATFORM_LABELS = {
  qqbot: "QQ Bot",
  feishu: "\u98DE\u4E66",
  dingtalk: "\u9489\u9489"
};
var PLATFORM_FIELDS = {
  qqbot: [
    { key: "appId", label: "App ID", type: "text", placeholder: "QQ \u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 App ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "QQ \u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 Client Secret" },
    { key: "sandbox", label: "\u6C99\u7BB1\u73AF\u5883", type: "text", placeholder: "true / false\uFF08\u9ED8\u8BA4 false\uFF09" },
    { key: "workDir", label: "\u5DE5\u4F5C\u76EE\u5F55", type: "text", placeholder: "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\uFF08\u53EF\u9009\uFF09" }
  ],
  feishu: [
    { key: "appId", label: "App ID", type: "text", placeholder: "\u98DE\u4E66\u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 App ID" },
    { key: "appSecret", label: "App Secret", type: "password", placeholder: "\u98DE\u4E66\u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 App Secret" },
    { key: "workDir", label: "\u5DE5\u4F5C\u76EE\u5F55", type: "text", placeholder: "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\uFF08\u53EF\u9009\uFF09" }
  ],
  dingtalk: [
    { key: "appId", label: "App Key", type: "text", placeholder: "\u9489\u9489\u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 App Key" },
    { key: "appSecret", label: "App Secret", type: "password", placeholder: "\u9489\u9489\u5F00\u653E\u5E73\u53F0\u5E94\u7528\u7684 App Secret" },
    { key: "webhookUrl", label: "Webhook URL", type: "text", placeholder: "\u7FA4\u673A\u5668\u4EBA Webhook \u5730\u5740\uFF08\u53EF\u9009\uFF0C\u56DE\u590D\u901A\u9053\uFF09" },
    { key: "workDir", label: "\u5DE5\u4F5C\u76EE\u5F55", type: "text", placeholder: "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u5DE5\u4F5C\u76EE\u5F55\uFF08\u53EF\u9009\uFF09" }
  ]
};
function connectionLabel(state) {
  switch (state) {
    case "disconnected":
      return "\u672A\u8FDE\u63A5";
    case "connecting":
      return "\u8FDE\u63A5\u4E2D";
    case "authenticating":
      return "\u9274\u6743\u4E2D";
    case "ready":
      return "\u5DF2\u5C31\u7EEA";
    case "failed":
      return "\u8FDE\u63A5\u5931\u8D25";
    case "reconnecting":
      return "\u91CD\u8FDE\u4E2D";
    default:
      return state;
  }
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function stateDotClass(state) {
  if (state === "ready") return "dot dot-ready";
  if (state === "connecting" || state === "authenticating" || state === "reconnecting") return "dot dot-starting";
  return "dot dot-stopped";
}
function Panel(_props) {
  const [tab, setTab] = useState("qqbot");
  const [statuses, setStatuses] = useState({});
  const [instances, setInstances] = useState([]);
  const [activeMap, setActiveMap] = useState({});
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const [st, inst] = await Promise.all([
        callService("status"),
        callService("instances.list")
      ]);
      setStatuses(st.platforms || {});
      setSessions(st.sessions || []);
      setInstances(inst.instances || []);
      setActiveMap(inst.activeByPlatform || {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      refresh();
    }, 5e3);
    return () => clearInterval(t);
  }, [refresh]);
  const tabInstances = useMemo(
    () => instances.filter((i) => i.platform === tab),
    [instances, tab]
  );
  const activeId = activeMap[tab] || null;
  const status = statuses[tab];
  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function startEdit(inst) {
    if (inst) {
      setEditing(JSON.parse(JSON.stringify(inst)));
    } else {
      setEditing({
        id: `${tab}_${Date.now().toString(36)}`,
        name: PLATFORM_LABELS[tab],
        platform: tab,
        enabled: true,
        config: {},
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  async function saveEditing() {
    if (!editing) return;
    if (editing.platform === "qqbot") {
      editing.config.sandbox = String(editing.config.sandbox ?? "").trim().toLowerCase() === "true";
    }
    const exists = instances.some((i) => i.id === editing.id);
    await run(async () => {
      if (exists) {
        await callService("instances.update", { instance: editing });
      } else {
        await callService("instances.add", { instance: editing });
      }
    });
    setEditing(null);
  }
  const cfgValue = (key) => {
    if (!editing) return "";
    const v = editing.config[key];
    return v == null ? "" : String(v);
  };
  const cfgSet = (key, v) => {
    if (!editing) return;
    editing.config[key] = v;
    setEditing({ ...editing });
  };
  return /* @__PURE__ */ jsxs("div", { className: "im-root", children: [
    /* @__PURE__ */ jsxs("div", { className: "im-header", children: [
      ["qqbot", "feishu", "dingtalk"].map((p) => /* @__PURE__ */ jsxs(
        "button",
        {
          className: `im-tab${tab === p ? " on" : ""}`,
          onClick: () => setTab(p),
          type: "button",
          children: [
            PLATFORM_LABELS[p],
            /* @__PURE__ */ jsx("span", { className: stateDotClass(statuses[p]?.connectionState || "disconnected") })
          ]
        },
        p
      )),
      /* @__PURE__ */ jsx("span", { className: "im-spacer" }),
      /* @__PURE__ */ jsx("button", { className: "im-action", disabled: busy, onClick: () => refresh(), type: "button", children: "\u5237\u65B0" })
    ] }),
    error && /* @__PURE__ */ jsx("div", { className: "im-error", children: error }),
    /* @__PURE__ */ jsxs("div", { className: "im-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "im-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "im-card-title", children: [
          /* @__PURE__ */ jsx("span", { className: stateDotClass(status?.connectionState || "disconnected") }),
          PLATFORM_LABELS[tab],
          " \xB7 ",
          connectionLabel(status?.connectionState || "disconnected")
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "im-kv", children: [
          /* @__PURE__ */ jsx("span", { children: "\u5B9E\u4F8B" }),
          /* @__PURE__ */ jsx("b", { children: status?.instanceName || "\u2014" }),
          /* @__PURE__ */ jsx("span", { children: "\u6536 / \u53D1" }),
          /* @__PURE__ */ jsxs("b", { children: [
            status?.stats?.received ?? 0,
            " / ",
            status?.stats?.sent ?? 0
          ] }),
          status?.error && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("span", { children: "\u9519\u8BEF" }),
            /* @__PURE__ */ jsx("b", { className: "im-err-text", children: status.error })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "im-row", children: [
          /* @__PURE__ */ jsx("button", { className: "im-btn", disabled: busy || !activeId, onClick: () => run(() => callService("platform.start", { platform: tab })), type: "button", children: "\u8FDE\u63A5" }),
          /* @__PURE__ */ jsx("button", { className: "im-btn", disabled: busy || !activeId, onClick: () => run(() => callService("platform.stop", { platform: tab })), type: "button", children: "\u65AD\u5F00" }),
          /* @__PURE__ */ jsx("span", { className: "im-spacer" }),
          /* @__PURE__ */ jsx("button", { className: "im-btn primary", disabled: busy, onClick: () => startEdit(null), type: "button", children: "\uFF0B \u65B0\u589E\u5B9E\u4F8B" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "im-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "im-card-title", children: [
          "\u5B9E\u4F8B\uFF08",
          tabInstances.length,
          "\uFF09"
        ] }),
        tabInstances.length === 0 && /* @__PURE__ */ jsx("div", { className: "im-empty", children: "\u6682\u65E0\u5B9E\u4F8B\uFF0C\u70B9\u300C\u65B0\u589E\u5B9E\u4F8B\u300D\u914D\u7F6E" }),
        tabInstances.map((i) => /* @__PURE__ */ jsxs("div", { className: "im-inst", children: [
          /* @__PURE__ */ jsx("span", { className: stateDotClass(i.id === activeId && status?.connected ? "ready" : "disconnected") }),
          /* @__PURE__ */ jsx("span", { className: "im-inst-name", children: i.name }),
          /* @__PURE__ */ jsxs("span", { className: "im-inst-meta", children: [
            i.enabled ? "\u542F\u7528" : "\u505C\u7528",
            i.id === activeId ? " \xB7 \u6FC0\u6D3B" : ""
          ] }),
          /* @__PURE__ */ jsx("span", { className: "im-spacer" }),
          !i.enabled && /* @__PURE__ */ jsx("button", { className: "im-action", disabled: busy, onClick: () => run(async () => {
            await callService("instances.update", { instance: { ...i, enabled: true } });
          }), type: "button", children: "\u542F\u7528" }),
          i.enabled && /* @__PURE__ */ jsx("button", { className: "im-action", disabled: busy, onClick: () => run(async () => {
            await callService("instances.update", { instance: { ...i, enabled: false } });
          }), type: "button", children: "\u505C\u7528" }),
          i.id !== activeId && /* @__PURE__ */ jsx("button", { className: "im-action", disabled: busy, onClick: () => run(() => callService("instances.switch", { instanceId: i.id })), type: "button", children: "\u6FC0\u6D3B" }),
          /* @__PURE__ */ jsx("button", { className: "im-action", disabled: busy, onClick: () => startEdit(i), type: "button", children: "\u7F16\u8F91" }),
          /* @__PURE__ */ jsx("button", { className: "im-action danger", disabled: busy, onClick: () => run(() => callService("instances.remove", { instanceId: i.id })), type: "button", children: "\u5220\u9664" })
        ] }, i.id))
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "im-card", children: [
        /* @__PURE__ */ jsxs("div", { className: "im-card-title", children: [
          "\u6700\u8FD1\u4F1A\u8BDD\uFF08",
          sessions.length,
          "\uFF09"
        ] }),
        sessions.length === 0 && /* @__PURE__ */ jsx("div", { className: "im-empty", children: "\u6682\u65E0\u4F1A\u8BDD" }),
        sessions.slice(0, 8).map((s) => /* @__PURE__ */ jsxs("div", { className: "im-inst", children: [
          /* @__PURE__ */ jsx("span", { className: "im-inst-name", children: s.conversationId }),
          /* @__PURE__ */ jsxs("span", { className: "im-inst-meta", children: [
            s.engineId,
            " \xB7 ",
            s.messageCount,
            " \u6761"
          ] })
        ] }, s.conversationId))
      ] })
    ] }),
    editing && /* @__PURE__ */ jsx("div", { className: "im-mask", onClick: () => setEditing(null), role: "presentation", children: /* @__PURE__ */ jsxs("div", { className: "im-modal", onClick: (e) => e.stopPropagation(), role: "dialog", children: [
      /* @__PURE__ */ jsxs("div", { className: "im-card-title", children: [
        instances.some((i) => i.id === editing.id) ? "\u7F16\u8F91\u5B9E\u4F8B" : "\u65B0\u589E\u5B9E\u4F8B",
        " \xB7 ",
        PLATFORM_LABELS[editing.platform]
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "im-form", children: [
        /* @__PURE__ */ jsxs("label", { className: "im-field", children: [
          /* @__PURE__ */ jsx("span", { children: "\u540D\u79F0" }),
          /* @__PURE__ */ jsx("input", { value: editing.name, onChange: (e) => setEditing({ ...editing, name: e.target.value }) })
        ] }),
        PLATFORM_FIELDS[editing.platform].map((f) => /* @__PURE__ */ jsxs("label", { className: "im-field", children: [
          /* @__PURE__ */ jsx("span", { children: f.label }),
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: f.placeholder,
              type: f.type === "password" ? "password" : "text",
              value: cfgValue(f.key),
              onChange: (e) => cfgSet(f.key, e.target.value)
            }
          )
        ] }, f.key)),
        /* @__PURE__ */ jsxs("label", { className: "im-field", children: [
          /* @__PURE__ */ jsx("span", { children: "\u542F\u7528" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              checked: editing.enabled,
              type: "checkbox",
              onChange: (e) => setEditing({ ...editing, enabled: e.target.checked })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "im-row", children: [
        /* @__PURE__ */ jsx("span", { className: "im-spacer" }),
        /* @__PURE__ */ jsx("button", { className: "im-btn", disabled: busy, onClick: () => setEditing(null), type: "button", children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("button", { className: "im-btn primary", disabled: busy, onClick: saveEditing, type: "button", children: "\u4FDD\u5B58\u5E76\u5E94\u7528" })
      ] })
    ] }) })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function ImBridgePanel() {
  return /* @__PURE__ */ jsx2(Panel, {});
}
export {
  Panel,
  ImBridgePanel as default
};
