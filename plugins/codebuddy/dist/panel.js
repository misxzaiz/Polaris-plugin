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

// src/panel.ts
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
.cb-input,.cb-select,.cb-textarea{width:100%;background:#161B22;border:1px solid #242C3A;border-radius:7px;color:#E6EAF2;font-size:12px;padding:6px 9px;outline:none}
.cb-input:focus,.cb-select:focus,.cb-textarea:focus{border-color:#3B6FE0}
.cb-btn{background:#2E5FC0;border:none;color:#fff;border-radius:7px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cb-btn:hover{filter:brightness(1.12)}
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
var rootEl = null;
var sendToChat;
var state = {
  tab: "quick",
  cfg: { model: "", effort: "", permissionMode: "bypassPermissions", maxTurns: "", autocompact: "", fallbackModel: "", daemonEnabled: false }
};
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function h(html) {
  if (rootEl) rootEl.innerHTML = html;
}
function renderQuick() {
  const quickBtns = QUICK_PROMPTS.map((q, i) => `<button data-idx="${i}"><b>${esc(q.title)}</b><small>${esc(q.desc)}</small></button>`).join("");
  return `
    <div class="cb-body">
      <div class="cb-card">
        <b>\u5F53\u524D\u914D\u7F6E\u6458\u8981</b><br/>
        \u6A21\u578B\uFF1A<b>${esc(state.cfg.model || "\u5F15\u64CE\u9ED8\u8BA4")}</b> \xB7
        \u52AA\u529B\u7EA7\u522B\uFF1A<b>${esc(state.cfg.effort || "\u9ED8\u8BA4")}</b> \xB7
        \u6743\u9650\uFF1A<b>${esc(state.cfg.permissionMode)}</b>
        ${state.cfg.fallbackModel ? ` \xB7 \u5907\u7528\uFF1A<b>${esc(state.cfg.fallbackModel)}</b>` : ""}
      </div>
      <div class="cb-sec"><span class="cb-bar"></span>\u5FEB\u6377\u6307\u4EE4<span class="cb-hint">\u70B9\u51FB\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD</span></div>
      <div class="cb-quick">${quickBtns}</div>
      <div class="cb-sec"><span class="cb-bar"></span>\u81EA\u5B9A\u4E49\u6307\u4EE4</div>
      <textarea class="cb-textarea" id="cb-custom" rows="3" placeholder="\u8F93\u5165\u81EA\u5B9A\u4E49\u6307\u4EE4\uFF0C\u70B9\u4E0B\u65B9\u6309\u94AE\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD"></textarea>
      <div style="padding:6px 0"><button class="cb-btn" id="cb-send-custom" style="width:100%">\u53D1\u9001\u5230\u4E3B\u5BF9\u8BDD</button></div>
    </div>`;
}
function renderConfig() {
  const c = state.cfg;
  return `
    <div class="cb-body">
      <div class="cb-field">
        <label class="cb-label">\u6A21\u578B\uFF08--model\uFF09</label>
        <input class="cb-input" id="cfg-model" value="${esc(c.model)}" placeholder="hy4free\uFF08\u7A7A=\u5F15\u64CE\u9ED8\u8BA4\uFF09"/>
        <div class="cb-hint">\u5E38\u7528\uFF1Ahy4free / hy4std / hy3 / deepseek-v4.1-flash</div>
      </div>
      <div class="cb-field">
        <label class="cb-label">\u52AA\u529B\u7EA7\u522B\uFF08--effort\uFF09</label>
        <select class="cb-select" id="cfg-effort">
          ${["", "minimal", "low", "medium", "high", "xhigh", "max"].map((v) => `<option value="${v}" ${c.effort === v ? "selected" : ""}>${v || "\u4E0D\u8BBE\u7F6E"}</option>`).join("")}
        </select>
        <div class="cb-hint">\u601D\u8003\u529B\u5EA6\uFF1Aminimal \u6700\u5FEB\uFF0Cmax \u6700\u9AD8\u8D28\u91CF</div>
      </div>
      <div class="cb-field">
        <label class="cb-label">\u6743\u9650\u6A21\u5F0F\uFF08--permission-mode\uFF09</label>
        <select class="cb-select" id="cfg-perm">
          ${["bypassPermissions", "acceptEdits", "default", "plan", "dontAsk", "auto"].map((v) => `<option value="${v}" ${c.permissionMode === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <div class="cb-hint">\u8DF3\u8FC7\u6743\u9650\uFF08\u9AD8\u98CE\u9669\uFF09\u4EC5\u5EFA\u8BAE\u9694\u79BB\u73AF\u5883\u4F7F\u7528</div>
      </div>
      <div class="cb-sec"><span class="cb-bar"></span>\u4E0A\u4E0B\u6587\u4E0E\u5BB9\u9519</div>
      <div class="cb-field">
        <label class="cb-label">\u6700\u5927\u8F6E\u6570\uFF08--max-turns\uFF09</label>
        <input class="cb-input" id="cfg-maxturns" value="${esc(c.maxTurns)}" placeholder="\u4E0D\u9650" inputmode="numeric"/>
        <div class="cb-hint">\u9650\u5236 agent \u81EA\u52A8\u6267\u884C\u8F6E\u6570\uFF0C\u9632\u5931\u63A7</div>
      </div>
      <div class="cb-field">
        <label class="cb-label">\u81EA\u52A8\u538B\u7F29\u7A97\u53E3\uFF08--autocompact\uFF09</label>
        <select class="cb-select" id="cfg-autocompact">
          ${["", "auto", "400k", "1m"].map((v) => `<option value="${v}" ${c.autocompact === v ? "selected" : ""}>${v || "\u4E0D\u8BBE\u7F6E"}</option>`).join("")}
        </select>
        <div class="cb-hint">\u4E0A\u4E0B\u6587\u8FBE\u5230\u9608\u503C\u81EA\u52A8\u538B\u7F29</div>
      </div>
      <div class="cb-field">
        <label class="cb-label">\u5907\u7528\u6A21\u578B\uFF08--fallback-model\uFF09</label>
        <select class="cb-select" id="cfg-fallback">
          ${["", "hy4free", "hy4std", "hy3", "deepseek-v4.1-flash"].map((v) => `<option value="${v}" ${c.fallbackModel === v ? "selected" : ""}>${v || "\u4E0D\u8BBE\u7F6E"}</option>`).join("")}
        </select>
        <div class="cb-hint">\u4E3B\u6A21\u578B\u8FC7\u8F7D/\u9650\u6D41\u65F6\u81EA\u52A8\u5207\u6362\uFF08\u7F13\u89E3 429\uFF09</div>
      </div>
      <button class="cb-btn" id="cfg-save" style="width:100%">\u4FDD\u5B58\u914D\u7F6E</button>
      <div class="cb-hint" id="cfg-save-msg" style="text-align:center;min-height:14px"></div>
    </div>`;
}
function renderSessions() {
  return `
    <div class="cb-body">
      <div class="cb-card"><b>\u4F1A\u8BDD\u7BA1\u7406\uFF08P2 \u63D0\u4F9B\uFF09</b><br/>
      \u5C06\u5305\u542B\uFF1ACLI \u6D3B\u52A8\u4F1A\u8BDD\u5217\u8868\uFF08codebuddy ps\uFF09\u3001\u5386\u53F2\u4F1A\u8BDD\u6D4F\u89C8\u4E0E resume \u5FEB\u6377\u5165\u53E3\u3001
      \u4F1A\u8BDD\u4FDD\u7559\u671F\u63D0\u793A\uFF08\u8FC7\u671F resume \u4F1A\u9759\u9ED8\u65B0\u5F00\uFF09\u3002</div>
      <div class="cb-card"><b>\u4E3B\u5BF9\u8BDD\u7684 CodeBuddy \u4F1A\u8BDD</b><br/>
      \u5728\u5BF9\u8BDD\u6D41\u5185\u7BA1\u7406\u2014\u2014\u9762\u677F\u4E0D\u590D\u5236\u4E3B\u5BF9\u8BDD\u72B6\u6001\uFF0C\u907F\u514D\u53CC\u5199\u5206\u88C2\u3002</div>
    </div>`;
}
function renderTools() {
  return `
    <div class="cb-body">
      <div class="cb-card"><b>\u5DE5\u5177\u96C6\u89C2\u5BDF\uFF08P2 \u63D0\u4F9B\uFF09</b><br/>
      \u5C06\u5305\u542B\uFF1A66 \u4E2A\u5185\u7F6E\u5DE5\u5177\u7684\u5206\u7C7B\u6E05\u5355\u3001\u5404\u5DE5\u5177\u4F1A\u8BDD\u5185\u8C03\u7528\u7EDF\u8BA1\u3001
      toolOverrides \u58F0\u660E\u7F16\u8F91\uFF08icon/\u5206\u7C7B/\u6807\u7B7E\u7CBE\u786E\u5316\uFF09\u3002</div>
      <div class="cb-card"><b>\u5F53\u524D\u5DF2\u7CBE\u786E\u9002\u914D</b><br/>
      Read / Write / Edit / Bash / Glob / Grep / WebFetch / WebSearch /
      TaskCreate / TaskUpdate / TaskList / EnterPlanMode / ExitPlanMode / AskUserQuestion</div>
    </div>`;
}
function render() {
  if (!rootEl) return;
  const tabBody = state.tab === "quick" ? renderQuick() : state.tab === "config" ? renderConfig() : state.tab === "sessions" ? renderSessions() : renderTools();
  h(`
    <style>${CSS}</style>
    <div class="cb-root">
      <div class="cb-tabs">
        ${[["quick", "\u5FEB\u6377"], ["config", "\u914D\u7F6E"], ["sessions", "\u4F1A\u8BDD"], ["tools", "\u5DE5\u5177"]].map(([t, label]) => `<button class="cb-tab ${state.tab === t ? "on" : ""}" data-tab="${t}">${label}</button>`).join("")}
      </div>
      ${tabBody}
    </div>`);
  rootEl.querySelectorAll(".cb-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });
  if (state.tab === "quick") wireQuick();
  if (state.tab === "config") wireConfig();
}
function wireQuick() {
  rootEl?.querySelectorAll(".cb-quick button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const q = QUICK_PROMPTS[idx];
      if (q && sendToChat) void sendToChat(q.prompt);
    });
  });
  const sendCustom = rootEl?.querySelector("#cb-send-custom");
  const custom = rootEl?.querySelector("#cb-custom");
  sendCustom?.addEventListener("click", () => {
    const text = custom?.value.trim();
    if (text && sendToChat) {
      void sendToChat(text);
      if (custom) custom.value = "";
    }
  });
}
function wireConfig() {
  const save = rootEl?.querySelector("#cfg-save");
  const msg = rootEl?.querySelector("#cfg-save-msg");
  if (!save) return;
  save.addEventListener("click", async () => {
    const val = (id) => rootEl?.querySelector("#" + id)?.value?.trim() ?? "";
    state.cfg = {
      model: val("cfg-model"),
      effort: val("cfg-effort"),
      permissionMode: val("cfg-perm") || "bypassPermissions",
      maxTurns: val("cfg-maxturns"),
      autocompact: val("cfg-autocompact"),
      fallbackModel: val("cfg-fallback"),
      daemonEnabled: state.cfg.daemonEnabled
    };
    if (msg) msg.textContent = "\u4FDD\u5B58\u4E2D\u2026";
    try {
      await savePanelConfig(state.cfg);
      if (msg) msg.textContent = "\u2713 \u5DF2\u4FDD\u5B58\uFF08\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09";
    } catch (e) {
      if (msg) msg.textContent = "\u2717 " + String(e.message).slice(0, 60);
    }
    setTimeout(() => {
      if (msg) msg.textContent = "";
    }, 2500);
    render();
  });
}
async function CodeBuddyPanel() {
  rootEl = document.createElement("div");
  rootEl.className = "cb-panel-root";
  document.body.appendChild(rootEl);
  state.cfg = await loadPanelConfig();
  render();
}
export {
  CodeBuddyPanel as default
};
