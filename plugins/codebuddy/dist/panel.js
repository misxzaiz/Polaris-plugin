// src/panel.tsx
import { useCallback, useEffect, useState } from "react";

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
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
var DEFAULT_PANEL_CONFIG = {
  model: "",
  effort: "",
  permissionMode: "bypassPermissions",
  maxTurns: "",
  autocompact: "",
  fallbackModel: "",
  daemonEnabled: false
};
var CFG_KEY = "codebuddy.panel.cfg";
async function loadPanelConfig() {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key: CFG_KEY });
    const raw = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
    return { ...DEFAULT_PANEL_CONFIG, ...raw && typeof raw === "object" ? raw : {} };
  } catch {
    return { ...DEFAULT_PANEL_CONFIG };
  }
}
async function savePanelConfig(cfg) {
  await capDispatch("cap.kv", { action: "set", key: CFG_KEY, value: cfg });
}

// src/panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.cb-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cb-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cb-tabs{display:flex;gap:2px;padding:8px 10px 0;flex-shrink:0}
.cb-tab{flex:1;background:transparent;border:none;color:#8B95A7;font-size:11.5px;padding:6px 4px;border-radius:7px;cursor:pointer;font-weight:600}
.cb-tab:hover{color:#E6EAF2}
.cb-tab.on{background:#1C2330;color:#E6EAF2}
.cb-body{flex:1;overflow-y:auto;padding:10px 12px;min-height:0}
.cb-body::-webkit-scrollbar{width:8px;height:8px}
.cb-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:4px;border:2px solid transparent;background-clip:content-box}
.cb-sec{font-size:11px;font-weight:700;color:#8B95A7;padding:8px 0 4px;display:flex;align-items:center;gap:6px}
.cb-bar{width:3px;height:12px;border-radius:2px;background:linear-gradient(180deg,#5EA8FF,#3B6FE0);flex-shrink:0}
.cb-field{margin-bottom:10px}
.cb-label{font-size:11.5px;color:#B8C0CC;display:block;margin-bottom:3px}
.cb-hint{font-size:10px;color:#5C6678;margin-top:2px;line-height:1.4}
.cb-input,.cb-select{width:100%;background:#161B22;border:1px solid #242C3A;border-radius:7px;color:#E6EAF2;font-size:12px;padding:6px 9px;outline:none}
.cb-input:focus,.cb-select:focus{border-color:#3B6FE0}
.cb-btn{background:#2E5FC0;border:none;color:#fff;border-radius:7px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cb-btn:hover{filter:brightness(1.12)}
.cb-btn:disabled{opacity:.45;cursor:not-allowed}
.cb-quick{display:flex;flex-direction:column;gap:6px;padding-bottom:8px}
.cb-quick button{background:#161B22;border:1px solid #242C3A;color:#E6EAF2;border-radius:9px;padding:9px 12px;font-size:12px;cursor:pointer;text-align:left;line-height:1.45}
.cb-quick button:hover{border-color:#3B6FE0;background:#1C2330}
.cb-quick button b{display:block;font-size:12px;margin-bottom:2px}
.cb-quick button small{color:#8B95A7;font-size:10.5px}
.cb-card{background:#161B22;border:1px solid #242C3A;border-radius:9px;padding:8px 10px;margin-bottom:8px;font-size:11.5px;color:#B8C0CC;line-height:1.6}
.cb-card b{color:#E6EAF2}
`;
var QUICK_PROMPTS = [
  { title: "\u4EE3\u7801\u5BA1\u67E5", desc: "\u5BA1\u67E5\u5F53\u524D\u5DE5\u4F5C\u533A\u6700\u8FD1\u6539\u52A8", prompt: "\u5BA1\u67E5\u5F53\u524D\u5DE5\u4F5C\u533A\u6700\u8FD1\u7684\u4EE3\u7801\u6539\u52A8\uFF0C\u6309\u4E25\u91CD\u5EA6\u5217\u51FA\u95EE\u9898\u4E0E\u4FEE\u590D\u5EFA\u8BAE\u3002" },
  { title: "\u5199\u5355\u5143\u6D4B\u8BD5", desc: "\u4E3A\u6307\u5B9A\u6587\u4EF6\u751F\u6210\u6D4B\u8BD5", prompt: "\u4E3A\u4EE5\u4E0B\u6587\u4EF6\u7F16\u5199\u5355\u5143\u6D4B\u8BD5\uFF0C\u8986\u76D6\u8FB9\u754C\u6761\u4EF6\uFF1A\n\n\uFF08\u6307\u5B9A\u6587\u4EF6\u8DEF\u5F84\uFF09" },
  { title: "\u91CD\u6784\u5EFA\u8BAE", desc: "\u6307\u5B9A\u6587\u4EF6\u7684\u91CD\u6784\u65B9\u6848", prompt: "\u5206\u6790\u4EE5\u4E0B\u6587\u4EF6\u7684\u7ED3\u6784\u95EE\u9898\u5E76\u7ED9\u51FA\u91CD\u6784\u65B9\u6848\uFF08\u4FDD\u6301\u884C\u4E3A\u4E0D\u53D8\uFF09\uFF1A\n\n\uFF08\u6307\u5B9A\u6587\u4EF6\u8DEF\u5F84\uFF09" },
  { title: "\u6392\u67E5\u62A5\u9519", desc: "\u7C98\u8D34\u62A5\u9519\u4FE1\u606F\u5B9A\u4F4D\u95EE\u9898", prompt: "\u5E2E\u6211\u6392\u67E5\u8FD9\u4E2A\u62A5\u9519\uFF0C\u7ED9\u51FA\u6839\u56E0\u4E0E\u4FEE\u590D\u6B65\u9AA4\uFF1A\n\n\uFF08\u7C98\u8D34\u62A5\u9519\u4FE1\u606F\uFF09" }
];
var EFFORT_OPTIONS = ["", "minimal", "low", "medium", "high", "xhigh", "max"];
var PERM_OPTIONS = ["bypassPermissions", "acceptEdits", "default", "plan", "dontAsk", "auto"];
var AUTOCOMPACT_OPTIONS = ["", "auto", "400k", "1m"];
var FALLBACK_OPTIONS = ["", "hy4free", "hy4std", "hy3", "deepseek-v4.1-flash"];
function CodeBuddyPanel({ onSendToChat }) {
  const [tab, setTab] = useState("quick");
  const [cfg, setCfg] = useState({
    model: "",
    effort: "",
    permissionMode: "bypassPermissions",
    maxTurns: "",
    autocompact: "",
    fallbackModel: "",
    daemonEnabled: false
  });
  const [loaded, setLoaded] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  useEffect(() => {
    void loadPanelConfig().then((c) => {
      setCfg(c);
      setLoaded(true);
    });
  }, []);
  const update = (patch) => setCfg((prev) => ({ ...prev, ...patch }));
  const handleSave = useCallback(async () => {
    setSaveMsg("\u4FDD\u5B58\u4E2D\u2026");
    try {
      await savePanelConfig(cfg);
      setSaveMsg("\u2713 \u5DF2\u4FDD\u5B58\uFF08\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09");
    } catch (e) {
      setSaveMsg("\u2717 " + String(e.message).slice(0, 60));
    }
    setTimeout(() => setSaveMsg(""), 2500);
  }, [cfg]);
  const sendToChatSafe = (text) => {
    if (onSendToChat) void onSendToChat(text);
  };
  const tabBtn = (t, label) => /* @__PURE__ */ jsx("button", { className: `cb-tab ${tab === t ? "on" : ""}`, onClick: () => setTab(t), children: label }, t);
  const quickTab = /* @__PURE__ */ jsxs("div", { className: "cb-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "cb-card", children: [
      /* @__PURE__ */ jsx("b", { children: "\u5F53\u524D\u914D\u7F6E\u6458\u8981" }),
      /* @__PURE__ */ jsx("br", {}),
      "\u6A21\u578B\uFF1A",
      /* @__PURE__ */ jsx("b", { children: cfg.model || "\u5F15\u64CE\u9ED8\u8BA4" }),
      " \xB7 \u52AA\u529B\u7EA7\u522B\uFF1A",
      /* @__PURE__ */ jsx("b", { children: cfg.effort || "\u9ED8\u8BA4" }),
      " \xB7 \u6743\u9650\uFF1A",
      /* @__PURE__ */ jsx("b", { children: cfg.permissionMode }),
      cfg.fallbackModel ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " \xB7 \u5907\u7528\uFF1A",
        /* @__PURE__ */ jsx("b", { children: cfg.fallbackModel })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "cb-bar" }),
      "\u5FEB\u6377\u6307\u4EE4",
      /* @__PURE__ */ jsx("span", { className: "cb-hint", children: "\u70B9\u51FB\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "cb-quick", children: QUICK_PROMPTS.map((q) => /* @__PURE__ */ jsxs("button", { onClick: () => sendToChatSafe(q.prompt), children: [
      /* @__PURE__ */ jsx("b", { children: q.title }),
      /* @__PURE__ */ jsx("small", { children: q.desc })
    ] }, q.title)) }),
    /* @__PURE__ */ jsxs("div", { className: "cb-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "cb-bar" }),
      "\u81EA\u5B9A\u4E49\u6307\u4EE4"
    ] }),
    /* @__PURE__ */ jsx("textarea", { className: "cb-textarea", id: "cb-custom", rows: 3, placeholder: "\u8F93\u5165\u81EA\u5B9A\u4E49\u6307\u4EE4\uFF0C\u70B9\u4E0B\u65B9\u6309\u94AE\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD" }),
    /* @__PURE__ */ jsx("div", { style: { padding: "6px 0" }, children: /* @__PURE__ */ jsx("button", { className: "cb-btn", id: "cb-send-custom", style: { width: "100%" }, onClick: () => {
      const el = document.getElementById("cb-custom");
      const text = el?.value.trim();
      if (text) {
        sendToChatSafe(text);
        if (el) el.value = "";
      }
    }, children: "\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD" }) })
  ] });
  const configTab = /* @__PURE__ */ jsxs("div", { className: "cb-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsx("label", { className: "cb-label", children: "\u6A21\u578B\uFF08--model\uFF09" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "cb-input",
          value: cfg.model,
          placeholder: "hy4free\uFF08\u7A7A=\u5F15\u64CE\u9ED8\u8BA4\uFF09",
          onChange: (e) => update({ model: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u5E38\u7528\uFF1Ahy4free / hy4std / hy3 / deepseek-v4.1-flash" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsx("label", { className: "cb-label", children: "\u52AA\u529B\u7EA7\u522B\uFF08--effort\uFF09" }),
      /* @__PURE__ */ jsx("select", { value: cfg.effort, onChange: (e) => update({ effort: e.target.value }), children: EFFORT_OPTIONS.map((v) => /* @__PURE__ */ jsx("option", { value: v, children: v || "\u4E0D\u8BBE\u7F6E" }, v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u601D\u8003\u529B\u5EA6\uFF1Aminimal \u6700\u5FEB\uFF0Cmax \u6700\u9AD8\u8D28\u91CF" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsx("label", { className: "cb-label", children: "\u6743\u9650\u6A21\u5F0F\uFF08--permission-mode\uFF09" }),
      /* @__PURE__ */ jsx("select", { value: cfg.permissionMode, onChange: (e) => update({ permissionMode: e.target.value }), children: PERM_OPTIONS.map((v) => /* @__PURE__ */ jsx("option", { value: v, children: v }, v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u8DF3\u8FC7\u6743\u9650\uFF08\u9AD8\u98CE\u9669\uFF09\u4EC5\u5EFA\u8BAE\u9694\u79BB\u73AF\u5883\u4F7F\u7528" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "cb-bar" }),
      "\u4E0A\u4E0B\u6587\u4E0E\u5BB9\u9519"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsx("label", { className: "cb-label", children: "\u6700\u5927\u8F6E\u6570\uFF08--max-turns\uFF09" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "cb-input",
          value: cfg.maxTurns,
          placeholder: "\u4E0D\u9650",
          inputMode: "numeric",
          onChange: (e) => update({ maxTurns: e.target.value.replace(/\D/g, "") })
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u9650\u5236 agent \u81EA\u52A8\u6267\u884C\u8F6E\u6570\uFF0C\u9632\u5931\u63A7" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsx("label", { className: "cb-label", children: "\u81EA\u52A8\u538B\u7F29\u7A97\u53E3\uFF08--autocompact\uFF09" }),
      /* @__PURE__ */ jsx("select", { value: cfg.autocompact, onChange: (e) => update({ autocompact: e.target.value }), children: AUTOCOMPACT_OPTIONS.map((v) => /* @__PURE__ */ jsx("option", { value: v, children: v || "\u4E0D\u8BBE\u7F6E" }, v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u4E0A\u4E0B\u6587\u8FBE\u5230\u9608\u503C\u81EA\u52A8\u538B\u7F29" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsx("label", { className: "cb-label", children: "\u5907\u7528\u6A21\u578B\uFF08--fallback-model\uFF09" }),
      /* @__PURE__ */ jsx("select", { value: cfg.fallbackModel, onChange: (e) => update({ fallbackModel: e.target.value }), children: FALLBACK_OPTIONS.map((v) => /* @__PURE__ */ jsx("option", { value: v, children: v || "\u4E0D\u8BBE\u7F6E" }, v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u4E3B\u6A21\u578B\u8FC7\u8F7D/\u9650\u6D41\u65F6\u81EA\u52A8\u5207\u6362\uFF08\u7F13\u89E3 429\uFF09" })
    ] }),
    /* @__PURE__ */ jsx("button", { className: "cb-btn", style: { width: "100%" }, onClick: () => void handleSave(), children: "\u4FDD\u5B58\u914D\u7F6E" }),
    /* @__PURE__ */ jsx("div", { className: "cb-hint", style: { textAlign: "center", minHeight: 14 }, children: saveMsg })
  ] });
  const sessionsTab = /* @__PURE__ */ jsxs("div", { className: "cb-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "cb-card", children: [
      /* @__PURE__ */ jsx("b", { children: "\u4F1A\u8BDD\u7BA1\u7406\uFF08P2 \u63D0\u4F9B\uFF09" }),
      /* @__PURE__ */ jsx("br", {}),
      "\u5C06\u5305\u542B\uFF1ACLI \u6D3B\u52A8\u4F1A\u8BDD\u5217\u8868\uFF08codebuddy ps\uFF09\u3001\u5386\u53F2\u4F1A\u8BDD\u6D4F\u89C8\u4E0E resume \u5FEB\u6377\u5165\u53E3\u3001 \u4F1A\u8BDD\u4FDD\u7559\u671F\u63D0\u793A\uFF08\u8FC7\u671F resume \u4F1A\u9759\u9ED8\u65B0\u5F00\uFF09\u3002"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-card", children: [
      /* @__PURE__ */ jsx("b", { children: "\u4E3B\u5BF9\u8BDD\u7684 CodeBuddy \u4F1A\u8BDD" }),
      /* @__PURE__ */ jsx("br", {}),
      "\u5728\u5BF9\u8BDD\u6D41\u5185\u7BA1\u7406\u2014\u2014\u9762\u677F\u4E0D\u590D\u5236\u4E3B\u5BF9\u8BDD\u72B6\u6001\uFF0C\u907F\u514D\u53CC\u5199\u5206\u88C2\u3002"
    ] })
  ] });
  const toolsTab = /* @__PURE__ */ jsxs("div", { className: "cb-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "cb-card", children: [
      /* @__PURE__ */ jsx("b", { children: "\u5DE5\u5177\u96C6\u89C2\u5BDF\uFF08P2 \u63D0\u4F9B\uFF09" }),
      /* @__PURE__ */ jsx("br", {}),
      "\u5C06\u5305\u542B\uFF1A66 \u4E2A\u5185\u7F6E\u5DE5\u5177\u7684\u5206\u7C7B\u6E05\u5355\u3001\u5404\u5DE5\u5177\u4F1A\u8BDD\u5185\u8C03\u7528\u7EDF\u8BA1\u3001 toolOverrides \u58F0\u660E\u7F16\u8F91\uFF08icon/\u5206\u7C7B/\u6807\u7B7E\u7CBE\u786E\u5316\uFF09\u3002"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-card", children: [
      /* @__PURE__ */ jsx("b", { children: "\u5F53\u524D\u5DF2\u7CBE\u786E\u9002\u914D" }),
      /* @__PURE__ */ jsx("br", {}),
      "Read / Write / Edit / Bash / Glob / Grep / WebFetch / WebSearch /",
      /* @__PURE__ */ jsx("br", {}),
      "TaskCreate / TaskUpdate / TaskList / EnterPlanMode / ExitPlanMode / AskUserQuestion"
    ] })
  ] });
  if (!loaded) {
    return /* @__PURE__ */ jsxs("div", { className: "cb-root", children: [
      /* @__PURE__ */ jsx("style", { children: CSS }),
      /* @__PURE__ */ jsxs("div", { className: "cb-empty", children: [
        /* @__PURE__ */ jsx("span", { className: "cb-spin" }),
        "\u52A0\u8F7D\u914D\u7F6E\u2026"
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "cb-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "cb-tabs", children: [
      tabBtn("quick", "\u5FEB\u6377"),
      tabBtn("config", "\u914D\u7F6E"),
      tabBtn("sessions", "\u4F1A\u8BDD"),
      tabBtn("tools", "\u5DE5\u5177")
    ] }),
    tab === "quick" ? quickTab : tab === "config" ? configTab : tab === "sessions" ? sessionsTab : toolsTab
  ] });
}
export {
  CodeBuddyPanel as default
};
