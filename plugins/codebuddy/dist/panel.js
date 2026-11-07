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
import { jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.cb-root{position:relative;font:12.5px/1.6 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#DEE4EE;height:100%;display:flex;flex-direction:column;background:transparent}
.cb-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cb-tabs{display:flex;gap:1px;padding:10px 10px 0;flex-shrink:0;border-bottom:1px solid #1E242E}
.cb-tab{flex:1;background:transparent;border:none;color:#7A8496;font-size:11.5px;padding:7px 4px 9px;cursor:pointer;font-weight:600;position:relative;letter-spacing:.02em}
.cb-tab:hover{color:#C9D2DE}
.cb-tab.on{color:#FFFFFF}
.cb-tab.on::after{content:'';position:absolute;left:20%;right:20%;bottom:-1px;height:2px;border-radius:1px;background:#5EA8FF}
.cb-body{flex:1;overflow-y:auto;padding:12px 14px;min-height:0}
.cb-body::-webkit-scrollbar{width:8px;height:8px}
.cb-body::-webkit-scrollbar-thumb{background:#242C3A;border-radius:4px;border:2px solid transparent;background-clip:content-box}
.cb-sec{display:flex;align-items:center;gap:7px;padding:14px 2px 7px;font-size:10.5px;font-weight:700;color:#7A8496;text-transform:uppercase;letter-spacing:.08em}
.cb-sec:first-child{padding-top:2px}
.cb-bar{width:3px;height:11px;border-radius:2px;background:#5EA8FF;flex-shrink:0;opacity:.85}
.cb-field{margin-bottom:12px}
.cb-label{font-size:11.5px;color:#AEB8C4;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.cb-label .cb-arg{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:#5C6678}
.cb-hint{font-size:10px;color:#5C6678;margin-top:3px;line-height:1.5}
.cb-input,.cb-select{width:100%;background:#12161E;border:1px solid #232A36;border-radius:8px;color:#E6EAF2;font-size:12px;padding:7px 10px;outline:none;transition:border-color .12s}
.cb-input:focus,.cb-select:focus{border-color:#3B6FE0;box-shadow:0 0 0 2px rgba(62,111,224,.18)}
.cb-input:hover,.cb-select:hover{border-color:#2E3644}
.cb-btn{background:linear-gradient(135deg,#3B6FE0,#2E5FC0);border:none;color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;cursor:pointer;font-weight:600;transition:filter .12s, transform .06s;width:100%}
.cb-btn:hover{filter:brightness(1.15)}
.cb-btn:active{transform:scale(.985)}
.cb-btn:disabled{opacity:.45;cursor:not-allowed}
.cb-quick{display:flex;flex-direction:column;gap:7px;padding:2px 0 10px}
.cb-quick button{background:#141922;border:1px solid #232A36;color:#DEE4EE;border-radius:10px;padding:10px 13px;font-size:12px;cursor:pointer;text-align:left;line-height:1.5;transition:border-color .12s, background .12s}
.cb-quick button:hover{border-color:#3B6FE0;background:#181F2A}
.cb-quick button:active{transform:scale(.99)}
.cb-quick b{display:block;font-size:12px;margin-bottom:2px;font-weight:600}
.cb-quick small{color:#7A8496;font-size:10.5px}
.cb-card{background:#12161E;border:1px solid #1E242E;border-radius:11px;padding:11px 13px;margin-bottom:10px;font-size:11.5px;color:#AEB8C4;line-height:1.7}
.cb-card b{color:#DEE4EE;font-weight:600}
.cb-summary{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 6px}
.cb-chip{background:#141922;border:1px solid #232A36;border-radius:7px;padding:4px 9px;font-size:10.5px;color:#AEB8C4}
.cb-chip b{color:#E6EAF2;font-weight:600}
.cb-empty{color:#5C6678;font-size:11.5px;text-align:center;padding:28px 12px;line-height:1.7}
.cb-divider{height:1px;background:#1E242E;margin:4px 0 2px}
`;
var QUICK_PROMPTS = [
  { title: "\u4EE3\u7801\u5BA1\u67E5", desc: "\u5BA1\u67E5\u5F53\u524D\u5DE5\u4F5C\u533A\u6700\u8FD1\u6539\u52A8", prompt: "\u5BA1\u67E5\u5F53\u524D\u5DE5\u4F5C\u533A\u6700\u8FD1\u7684\u4EE3\u7801\u6539\u52A8\uFF0C\u6309\u4E25\u91CD\u5EA6\u5217\u51FA\u95EE\u9898\u4E0E\u4FEE\u590D\u5EFA\u8BAE\u3002" },
  { title: "\u5199\u5355\u5143\u6D4B\u8BD5", desc: "\u4E3A\u6307\u5B9A\u6587\u4EF6\u751F\u6210\u6D4B\u8BD5", prompt: "\u4E3A\u4EE5\u4E0B\u6587\u4EF6\u7F16\u5199\u5355\u5143\u6D4B\u8BD5\uFF0C\u8986\u76D6\u8FB9\u754C\u6761\u4EF6\uFF1A\n\n\uFF08\u6307\u5B9A\u6587\u4EF6\u8DEF\u5F84\uFF09" },
  { title: "\u91CD\u6784\u5EFA\u8BAE", desc: "\u6307\u5B9A\u6587\u4EF6\u7684\u91CD\u6784\u65B9\u6848", prompt: "\u5206\u6790\u4EE5\u4E0B\u6587\u4EF6\u7684\u7ED3\u6784\u95EE\u9898\u5E76\u7ED9\u51FA\u91CD\u6784\u65B9\u6848\uFF08\u4FDD\u6301\u884C\u4E3A\u4E0D\u53D8\uFF09\uFF1A\n\n\uFF08\u6307\u5B9A\u6587\u4EF6\u8DEF\u5F84\uFF09" },
  { title: "\u6392\u67E5\u62A5\u9519", desc: "\u7C98\u8D34\u62A5\u9519\u4FE1\u606F\u5B9A\u4F4D\u95EE\u9898", prompt: "\u5E2E\u6211\u6392\u67E5\u8FD9\u4E2A\u62A5\u9519\uFF0C\u7ED9\u51FA\u6839\u56E0\u4E0E\u4FEE\u590D\u6B65\u9AA4\uFF1A\n\n\uFF08\u7C98\u8D34\u62A5\u9519\u4FE1\u606F\uFF09" }
];
var EFFORT_OPTIONS = [
  { v: "", label: "\u4E0D\u8BBE\u7F6E\uFF08\u5F15\u64CE\u9ED8\u8BA4\uFF09" },
  { v: "minimal", label: "minimal \u2014 \u6781\u7B80" },
  { v: "low", label: "low \u2014 \u4F4E" },
  { v: "medium", label: "medium \u2014 \u4E2D" },
  { v: "high", label: "high \u2014 \u9AD8" },
  { v: "xhigh", label: "xhigh \u2014 \u6781\u9AD8" },
  { v: "max", label: "max \u2014 \u6700\u9AD8" }
];
var PERM_OPTIONS = [
  { v: "bypassPermissions", label: "bypassPermissions \u2014 \u8DF3\u8FC7\u6743\u9650\uFF08\u9AD8\u98CE\u9669\uFF09" },
  { v: "acceptEdits", label: "acceptEdits \u2014 \u81EA\u52A8\u63A5\u53D7\u7F16\u8F91" },
  { v: "default", label: "default \u2014 \u9ED8\u8BA4\u786E\u8BA4" },
  { v: "plan", label: "plan \u2014 \u4EC5\u89C4\u5212" },
  { v: "dontAsk", label: "dontAsk \u2014 \u62D2\u7EDD\u5371\u9669" },
  { v: "auto", label: "auto \u2014 \u81EA\u52A8" }
];
var AUTOCOMPACT_OPTIONS = [
  { v: "", label: "\u4E0D\u8BBE\u7F6E" },
  { v: "auto", label: "auto \u2014 \u8DDF\u968F\u6A21\u578B\u7A97\u53E3" },
  { v: "400k", label: "400k \u2014 40 \u4E07 token" },
  { v: "1m", label: "1m \u2014 100 \u4E07 token" }
];
var FALLBACK_OPTIONS = [
  { v: "", label: "\u4E0D\u8BBE\u7F6E" },
  { v: "hy4free", label: "hy4free" },
  { v: "hy4std", label: "hy4std" },
  { v: "hy3", label: "hy3" },
  { v: "deepseek-v4.1-flash", label: "deepseek-v4.1-flash" }
];
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
  const [saveMsg, setSaveMsg] = useState(null);
  useEffect(() => {
    void loadPanelConfig().then((c) => {
      setCfg(c);
      setLoaded(true);
    });
  }, []);
  const update = (patch) => setCfg((prev) => ({ ...prev, ...patch }));
  const handleSave = useCallback(async () => {
    setSaveMsg({ text: "\u4FDD\u5B58\u4E2D\u2026", ok: true });
    try {
      await savePanelConfig(cfg);
      setSaveMsg({ text: "\u2713 \u5DF2\u4FDD\u5B58\uFF08\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09", ok: true });
    } catch (e) {
      setSaveMsg({ text: "\u2717 " + String(e.message).slice(0, 60), ok: false });
    }
    setTimeout(() => setSaveMsg(null), 2600);
  }, [cfg]);
  const sendToChatSafe = (text) => {
    if (onSendToChat) void onSendToChat(text);
  };
  const Section = ({ title }) => /* @__PURE__ */ jsxs("div", { className: "cb-sec", children: [
    /* @__PURE__ */ jsx("span", { className: "cb-bar" }),
    title
  ] });
  const quickTab = /* @__PURE__ */ jsxs("div", { className: "cb-body", children: [
    /* @__PURE__ */ jsxs("div", { className: "cb-summary", children: [
      /* @__PURE__ */ jsxs("span", { className: "cb-chip", children: [
        "\u6A21\u578B ",
        /* @__PURE__ */ jsx("b", { children: cfg.model || "\u5F15\u64CE\u9ED8\u8BA4" })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "cb-chip", children: [
        "effort ",
        /* @__PURE__ */ jsx("b", { children: cfg.effort || "\u9ED8\u8BA4" })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "cb-chip", children: [
        "\u6743\u9650 ",
        /* @__PURE__ */ jsx("b", { children: cfg.permissionMode })
      ] }),
      cfg.fallbackModel ? /* @__PURE__ */ jsxs("span", { className: "cb-chip", children: [
        "\u5907\u7528 ",
        /* @__PURE__ */ jsx("b", { children: cfg.fallbackModel })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "\u5FEB\u6377\u6307\u4EE4" }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#5C6678", padding: "0 0 6px" }, children: "\u70B9\u51FB\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD\uFF08CodeBuddy \u5F15\u64CE\u63A5\u624B\uFF0C\u6309\u5F53\u524D\u914D\u7F6E\u6267\u884C\uFF09" }),
    /* @__PURE__ */ jsx("div", { className: "cb-quick", children: QUICK_PROMPTS.map((q) => /* @__PURE__ */ jsxs("button", { onClick: () => sendToChatSafe(q.prompt), children: [
      /* @__PURE__ */ jsx("b", { children: q.title }),
      /* @__PURE__ */ jsx("small", { children: q.desc })
    ] }, q.title)) }),
    /* @__PURE__ */ jsx(Section, { title: "\u81EA\u5B9A\u4E49\u6307\u4EE4" }),
    /* @__PURE__ */ jsx(
      "textarea",
      {
        id: "cb-custom",
        rows: 3,
        style: { width: "100%", background: "#12161E", border: "1px solid #232A36", borderRadius: 9, color: "#DEE4EE", fontSize: 12, padding: "8px 10px", outline: "none", resize: "vertical", minHeight: 56, fontFamily: "inherit" },
        placeholder: "\u8F93\u5165\u81EA\u5B9A\u4E49\u6307\u4EE4\u2026"
      }
    ),
    /* @__PURE__ */ jsx("button", { className: "cb-btn", onClick: () => {
      const el = document.getElementById("cb-custom");
      const text = el?.value.trim();
      if (text) {
        sendToChatSafe(text);
        if (el) el.value = "";
      }
    }, children: "\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD" })
  ] });
  const configTab = /* @__PURE__ */ jsxs("div", { className: "cb-body", children: [
    /* @__PURE__ */ jsx(Section, { title: "\u6838\u5FC3" }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsxs("label", { className: "cb-label", children: [
        "\u6A21\u578B ",
        /* @__PURE__ */ jsx("span", { className: "cb-arg", children: "--model" })
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "cb-input",
          value: cfg.model,
          placeholder: "hy4free\uFF08\u7A7A=\u5F15\u64CE\u9ED8\u8BA4\uFF09",
          onChange: (e) => update({ model: e.target.value })
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u5E38\u7528\uFF1Ahy4free / hy4std / hy3 / hy3-x / deepseek-v4.1-flash" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsxs("label", { className: "cb-label", children: [
        "\u52AA\u529B\u7EA7\u522B ",
        /* @__PURE__ */ jsx("span", { className: "cb-arg", children: "--effort" })
      ] }),
      /* @__PURE__ */ jsx("select", { className: "cb-select", value: cfg.effort, onChange: (e) => update({ effort: e.target.value }), children: EFFORT_OPTIONS.map((o) => /* @__PURE__ */ jsx("option", { value: o.v, children: o.label }, o.v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u601D\u8003\u529B\u5EA6\uFF1Aminimal \u6700\u5FEB\u54CD\u5E94\uFF0Cmax \u6700\u9AD8\u8D28\u91CF" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsxs("label", { className: "cb-label", children: [
        "\u6743\u9650\u6A21\u5F0F ",
        /* @__PURE__ */ jsx("span", { className: "cb-arg", children: "--permission-mode" })
      ] }),
      /* @__PURE__ */ jsx("select", { className: "cb-select", value: cfg.permissionMode, onChange: (e) => update({ permissionMode: e.target.value }), children: PERM_OPTIONS.map((o) => /* @__PURE__ */ jsx("option", { value: o.v, children: o.label }, o.v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u8DF3\u8FC7\u6743\u9650\uFF08\u9AD8\u98CE\u9669\uFF09\u4EC5\u5EFA\u8BAE\u9694\u79BB\u73AF\u5883\u4F7F\u7528" })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "\u4E0A\u4E0B\u6587\u4E0E\u5BB9\u9519" }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsxs("label", { className: "cb-label", children: [
        "\u6700\u5927\u8F6E\u6570 ",
        /* @__PURE__ */ jsx("span", { className: "cb-arg", children: "--max-turns" })
      ] }),
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
      /* @__PURE__ */ jsxs("label", { className: "cb-label", children: [
        "\u81EA\u52A8\u538B\u7F29\u7A97\u53E3 ",
        /* @__PURE__ */ jsx("span", { className: "cb-arg", children: "--autocompact" })
      ] }),
      /* @__PURE__ */ jsx("select", { className: "cb-select", value: cfg.autocompact, onChange: (e) => update({ autocompact: e.target.value }), children: AUTOCOMPACT_OPTIONS.map((o) => /* @__PURE__ */ jsx("option", { value: o.v, children: o.label }, o.v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u4E0A\u4E0B\u6587\u8FBE\u5230\u9608\u503C\u81EA\u52A8\u538B\u7F29\uFF08100k-1M \u8303\u56F4\uFF09" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "cb-field", children: [
      /* @__PURE__ */ jsxs("label", { className: "cb-label", children: [
        "\u5907\u7528\u6A21\u578B ",
        /* @__PURE__ */ jsx("span", { className: "cb-arg", children: "--fallback-model" })
      ] }),
      /* @__PURE__ */ jsx("select", { className: "cb-select", value: cfg.fallbackModel, onChange: (e) => update({ fallbackModel: e.target.value }), children: FALLBACK_OPTIONS.map((o) => /* @__PURE__ */ jsx("option", { value: o.v, children: o.label }, o.v)) }),
      /* @__PURE__ */ jsx("div", { className: "cb-hint", children: "\u4E3B\u6A21\u578B\u8FC7\u8F7D/\u9650\u6D41\u65F6\u81EA\u52A8\u5207\u6362\uFF08\u7F13\u89E3 429\uFF0C\u4EC5 -p \u6A21\u5F0F\uFF09" })
    ] }),
    /* @__PURE__ */ jsx("button", { className: "cb-btn", onClick: () => void handleSave(), children: "\u4FDD\u5B58\u914D\u7F6E\uFF08\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09" }),
    /* @__PURE__ */ jsx("div", { className: "cb-hint", style: { textAlign: "center", minHeight: 16, marginTop: 6 }, children: saveMsg ? /* @__PURE__ */ jsx("span", { style: { color: saveMsg.ok ? "#7BC47F" : "#FF8A9A" }, children: saveMsg.text }) : "" })
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
  const tabBody = tab === "quick" ? quickTab : tab === "config" ? configTab : tab === "sessions" ? sessionsTab : toolsTab;
  return /* @__PURE__ */ jsxs("div", { className: "cb-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsx("div", { className: "cb-tabs", children: [["quick", "\u5FEB\u6377"], ["config", "\u914D\u7F6E"], ["sessions", "\u4F1A\u8BDD"], ["tools", "\u5DE5\u5177"]].map(([t, label]) => /* @__PURE__ */ jsx("button", { className: `cb-tab ${tab === t ? "on" : ""}`, onClick: () => setTab(t), children: label }, t)) }),
    tabBody
  ] });
}
export {
  CodeBuddyPanel as default
};
