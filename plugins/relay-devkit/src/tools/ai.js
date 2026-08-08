// tools/ai.js — AI assistant page view (#/ai): full chat UI + multi-config management.
import { $, $$, el, esc, uid, copy, setStatus, store } from "../core/dom.js";
import { chat, renderMarkdown } from "../core/ai-client.js";
import { getConfigs, getActive, getActiveId, addConfig, updateConfig, removeConfig, switchConfig, maskKey, chatUrl, COLORS } from "../core/ai-store.js";
import { buildContextSummary } from "../core/ai-context.js";

const histStore = store("ai.convos");
let conversations = histStore.get() || [];
let activeConvoId = null;
let abortCtrl = null;
let useCtx = true;

function saveConvos() { histStore.set(conversations); }
function activeConvo() { return conversations.find(c => c.id === activeConvoId) || null; }

function newConvo(title) {
  const c = { id: uid(), title: title || "New Chat", messages: [], createdAt: Date.now() };
  conversations.unshift(c);
  if (conversations.length > 50) conversations.length = 50;
  activeConvoId = c.id;
  saveConvos();
  return c;
}
export function initAiTool() {
  var v = $("#viewAi");
  var cfg = getActive();
  var cfgName = cfg ? esc(cfg.name) : "";
  var ctxSummary = buildContextSummary();
  var page = document.createElement("div");
  page.className = "ai-page";
  page.innerHTML = [
    "<div class=" + String.fromCharCode(34) + "ai-topbar" + String.fromCharCode(34) + ">",
    "  <span class=" + String.fromCharCode(34) + "t-title" + String.fromCharCode(34) + "><span class=" + String.fromCharCode(34) + "tg" + String.fromCharCode(34) + ">✦</span> AI 助手</span>",
    "  <button class=" + String.fromCharCode(34) + "t-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCfgBtn" + String.fromCharCode(34) + ">⚙ 配置管理</button>",
    "  <div class=" + String.fromCharCode(34) + "ai-cfg-sel" + String.fromCharCode(34) + "><button class=" + String.fromCharCode(34) + "ai-cfg-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCfgDropdown" + String.fromCharCode(34) + ">" + cfgName + " ▾</button><div class=" + String.fromCharCode(34) + "ai-cfg-menu" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCfgMenu" + String.fromCharCode(34) + "></div></div>",
    "  <button class=" + String.fromCharCode(34) + "t-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiNewConvo" + String.fromCharCode(34) + ">+ 新对话</button>",
    "  <span class=" + String.fromCharCode(34) + "sp" + String.fromCharCode(34) + "></span>",
    "  <label class=" + String.fromCharCode(34) + "ai-ctx-toggle" + String.fromCharCode(34) + "><input type=" + String.fromCharCode(34) + "checkbox" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCtxToggle" + String.fromCharCode(34) + " checked> 附带上文</label>",
    "</div>",
    "<div class=" + String.fromCharCode(34) + "ai-main" + String.fromCharCode(34) + ">",
    "  <div class=" + String.fromCharCode(34) + "ai-sidebar" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiSidebar" + String.fromCharCode(34) + ">",
    "    <div class=" + String.fromCharCode(34) + "ai-side-head" + String.fromCharCode(34) + ">对话历史</div>",
    "    <div class=" + String.fromCharCode(34) + "ai-side-list" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiConvoList" + String.fromCharCode(34) + "></div>",
    "  </div>",
    "  <div class=" + String.fromCharCode(34) + "ai-chat" + String.fromCharCode(34) + ">",
    "    <div class=" + String.fromCharCode(34) + "ai-ctx-bar" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCtxBar" + String.fromCharCode(34) + "></div>",
    "    <div class=" + String.fromCharCode(34) + "ai-messages" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiMessages" + String.fromCharCode(34) + "></div>",
    "    <div class=" + String.fromCharCode(34) + "ai-input-bar" + String.fromCharCode(34) + ">",
    "      <textarea class=" + String.fromCharCode(34) + "ai-input" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiInput" + String.fromCharCode(34) + " placeholder=" + String.fromCharCode(34) + "输入消息... (Enter 发送, Shift+Enter 换行)" + String.fromCharCode(34) + " rows=" + String.fromCharCode(34) + "2" + String.fromCharCode(34) + "></textarea>",
    "      <button class=" + String.fromCharCode(34) + "t-btn primary" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiSendBtn" + String.fromCharCode(34) + ">发送</button>",
    "      <button class=" + String.fromCharCode(34) + "t-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiStopBtn" + String.fromCharCode(34) + " style=" + String.fromCharCode(34) + "display:none" + String.fromCharCode(34) + ">停止</button>",
    "    </div>",
    "  </div>",
    "</div>"
  ].join("");
  v.appendChild(page);

  // Set context bar content
  $("#aiCtxBar").innerHTML = "📊 " + esc(ctxSummary);

  // Bind events
  $("#aiCfgBtn").onclick = showConfigModal;
  $("#aiNewConvo").onclick = function() { newConvo("新对话"); renderConvoList(); renderMessages(); };
  $("#aiSendBtn").onclick = sendMessage;
  $("#aiStopBtn").onclick = stopChat;
  $("#aiCfgDropdown").onclick = toggleCfgMenu;
  $("#aiCtxToggle").onchange = function(e) { useCtx = e.target.checked; };
  $("#aiInput").addEventListener("keydown", function(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  $("#aiInput").addEventListener("input", function() { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 120) + "px"; });

  if (!conversations.length) newConvo("新对话");
  else if (!activeConvo()) activeConvoId = conversations[0].id;
  renderConvoList(); renderMessages(); renderCfgMenu();
}
function toggleCfgMenu() {
  var menu = $("aiCfgMenu");
  if (menu) menu.classList.toggle("open");
}
function renderCfgMenu() {
  var menu = $("aiCfgMenu");
  if (!menu) return;
  var configs = getConfigs();
  var aid = getActiveId();
  menu.innerHTML = configs.map(function(c) {
    return "<div class=" + String.fromCharCode(34) + "ai-cfg-item" + (c.id === aid ? " on" : "") + String.fromCharCode(34) + " data-id=" + String.fromCharCode(34) + c.id + String.fromCharCode(34) + "><span class=" + String.fromCharCode(34) + "ai-cfg-dot" + String.fromCharCode(34) + " style=" + String.fromCharCode(34) + "background:" + c.color + String.fromCharCode(34) + "></span><span>" + esc(c.name) + "</span></div>";
  }).join("");
  menu.querySelectorAll(".ai-cfg-item").forEach(function(el) {
    el.onclick = function() {
      switchConfig(el.dataset.id);
      var cfg = getActive();
      var btn = $("aiCfgDropdown");
      if (btn && cfg) btn.textContent = cfg.name + " ▾";
      menu.classList.remove("open");
    };
  });
}
function renderConvoList() {
  var host = $("aiConvoList");
  if (!host) return;
  host.innerHTML = conversations.map(function(c, i) {
    var isOn = c.id === activeConvoId;
    return "<div class=" + String.fromCharCode(34) + "ai-convo-item" + (isOn ? " on" : "") + "" + String.fromCharCode(34) + " data-idx=" + String.fromCharCode(34) + i + String.fromCharCode(34) + ">" +
      "<span class=" + String.fromCharCode(34) + "ai-convo-title" + String.fromCharCode(34) + ">" + esc(c.title) + "</span>" +
      "<span class=" + String.fromCharCode(34) + "ai-convo-del" + String.fromCharCode(34) + " data-del=" + String.fromCharCode(34) + i + String.fromCharCode(34) + ">✕</span></div>";
  }).join("");
  host.querySelectorAll(".ai-convo-item").forEach(function(el) {
    el.onclick = function(e) {
      if (e.target.dataset.del !== undefined) {
        var idx = +e.target.dataset.del;
        conversations.splice(idx, 1); saveConvos();
        if (conversations.length === 0) newConvo("新对话");
        else if (!activeConvo()) activeConvoId = conversations[0].id;
        renderConvoList(); renderMessages(); return;
      }
      activeConvoId = conversations[+el.dataset.idx].id;
      renderConvoList(); renderMessages();
    };
  });
}
function renderMessages() {
  var host = $("aiMessages");
  if (!host) return;
  var convo = activeConvo();
  if (!convo || !convo.messages.length) {
    host.innerHTML = '<div class="ai-empty">开始新对话。我可以帮你分析 API 错误、优化 SQL、编写查询语句等。</div>';
    return;
  }
  host.innerHTML = convo.messages.map(function(m) {
    if (m.role === "user") return '<div class="ai-msg user"><div class="ai-msg-role">你</div><div class="ai-msg-body">' + esc(m.content) + '</div></div>';
    if (m.role === "assistant") return '<div class="ai-msg assistant"><div class="ai-msg-role">AI</div><div class="ai-msg-body">' + renderMarkdown(m.content || "") + '</div></div>';
    if (m.role === "tool") return '<div class="ai-msg tool"><div class="ai-msg-role">🔧 工具</div><div class="ai-msg-body"><pre>' + esc(m.content) + '</pre></div></div>';
    return "";
  }).join("");
  host.scrollTop = host.scrollHeight;
  var ctxBar = $("aiCtxBar");
  if (ctxBar) ctxBar.innerHTML = "📊 " + esc(buildContextSummary());
}
async function sendMessage() {
  var input = $("aiInput");
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  var convo = activeConvo();
  if (!convo) { convo = newConvo(text.slice(0, 30)); renderConvoList(); }
  convo.messages.push({ role: "user", content: text });
  if (convo.messages.length === 1) convo.title = text.slice(0, 30);
  input.value = ""; input.style.height = "auto";
  renderMessages();
  var host = $("aiMessages");
  var loadingEl = document.createElement("div");
  loadingEl.className = "ai-msg assistant";
  loadingEl.id = "aiLoading";
  loadingEl.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-body"><span class="spin"></span> 思考中...</div>';
  host.appendChild(loadingEl);
  host.scrollTop = host.scrollHeight;
  $("aiSendBtn").style.display = "none";
  $("aiStopBtn").style.display = "";
  var chatMessages = convo.messages.filter(function(m) { return m.role !== "tool"; }).map(function(m) { return { role: m.role, content: m.content }; });
  abortCtrl = new AbortController();
  var aiContent = "";
  var aiEl = null;
  await chat({
    messages: chatMessages, signal: abortCtrl.signal, useContext: useCtx,
    onDelta: function(delta) {
      aiContent += delta;
      var ld = $("aiLoading");
      if (ld) ld.remove();
      if (!aiEl) { aiEl = document.createElement("div"); aiEl.className = "ai-msg assistant"; aiEl.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-body"></div>'; host.appendChild(aiEl); }
      aiEl.querySelector(".ai-msg-body").innerHTML = renderMarkdown(aiContent);
      host.scrollTop = host.scrollHeight;
    },
    onToolCall: function(name, args) {
      var ld = $("aiLoading"); if (ld) ld.remove();
      if (!aiEl) { aiEl = document.createElement("div"); aiEl.className = "ai-msg assistant"; aiEl.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-body"></div>'; host.appendChild(aiEl); }
      var toolEl = document.createElement("div");
      toolEl.className = "ai-msg tool";
      toolEl.innerHTML = '<div class="ai-msg-role">🔧 工具</div><div class="ai-msg-body"><span class="spin"></span> 执行中: ' + esc(name) + '</div>';
      host.appendChild(toolEl); host.scrollTop = host.scrollHeight;
    },
    onToolResult: function() {},
    onComplete: function(fullText) {
      if (fullText) convo.messages.push({ role: "assistant", content: fullText });
      saveConvos(); renderMessages();
      $("aiSendBtn").style.display = "";
      $("aiStopBtn").style.display = "none";
    },
    onError: function(err) {
      var ld = $("aiLoading"); if (ld) ld.remove();
      var errEl = document.createElement("div"); errEl.className = "ai-msg error";
      errEl.innerHTML = '<div class="ai-msg-role">⚠</div><div class="ai-msg-body">错误: ' + esc(err) + '</div>';
      host.appendChild(errEl); host.scrollTop = host.scrollHeight;
      $("aiSendBtn").style.display = "";
      $("aiStopBtn").style.display = "none";
    },
  });
}

function stopChat() {
  if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
  $("aiSendBtn").style.display = "";
  $("aiStopBtn").style.display = "none";
}
function showConfigModal() {
  var bg = $("modalBg");
  var m = el("div", "modal wide");
  var configs = getConfigs();
  var aid = getActiveId();
  m.innerHTML = "";
  m.appendChild(el("h3", "", "AI 配置管理"));
  var sub = el("div", "sub");
  sub.textContent = "支持 OpenAI 协议兼容的 AI 服务（DeepSeek、Qwen、Ollama 等）。Endpoint 填 Base URL，系统自动拼接 /chat/completions。";
  m.appendChild(sub);
  var body = el("div", "ai-cfg-body");
  var listWrap = el("div", "ai-cfg-list");
  listWrap.innerHTML = '<div class="ai-cfg-list-head">已保存的配置</div><div class="ai-cfg-list-items" id="aiCfgListItems"></div><button class="cm-add" id="aiCfgAdd">+ 新增配置</button>';
  body.appendChild(listWrap);
  var formWrap = el("div", "ai-cfg-form"); formWrap.id = "aiCfgForm";
  body.appendChild(formWrap);
  var fieldWrap = el("div", "field"); fieldWrap.appendChild(body); m.appendChild(fieldWrap);
  var acts = el("div", "acts");
  var sp = el("div"); sp.style.flex = "1";
  var closeBtn = el("button", "btn ghost", "关闭");
  acts.append(sp, closeBtn); m.appendChild(acts);
  bg.innerHTML = ""; bg.appendChild(m); bg.classList.add("open");
  bg.onclick = function(e) { if (e.target === bg) closeModal(); };
  bg.onkeydown = function(e) { if (e.key === "Escape") closeModal(); };
  closeBtn.onclick = closeModal;
  function closeModal() { bg.classList.remove("open"); bg.innerHTML = ""; bg.onkeydown = null; }
  var editingId = aid;
  renderCfgList();
  if (editingId) renderCfgForm(editingId);
  $("aiCfgAdd").onclick = function() {
    var cfg = addConfig({ name: "新配置" }); editingId = cfg.id; renderCfgList(); renderCfgForm(cfg.id);
  };
  function renderCfgList() {
    var list = $("aiCfgListItems");
    var cfgs = getConfigs();
    list.innerHTML = cfgs.map(function(c) {
      return '<div class="cm-item' + (c.id === editingId ? " on" : "") + '" data-id="' + c.id + '"><span class="cm-dot" style="background:' + c.color + '"></span><span class="cm-item-name">' + esc(c.name) + '</span><span class="cm-item-del" data-del="' + c.id + '">×</span></div>';
    }).join("");
    list.querySelectorAll(".cm-item").forEach(function(el2) {
      el2.onclick = function(e) {
        if (e.target.dataset.del) {
          if (confirm("确定删除该配置？")) { removeConfig(e.target.dataset.del); editingId = getActiveId(); renderCfgList(); renderCfgForm(editingId); renderCfgMenu(); }
          return;
        }
        editingId = el2.dataset.id; renderCfgList(); renderCfgForm(editingId);
      };
    });
  }  function renderCfgForm(id) {
    var form = $("aiCfgForm");
    if (!form) return;
    var c = getConfigs().find(function(x) { return x.id === id; });
    if (!c) { form.innerHTML = '<h3>选择或新增配置</h3><div style="color:var(--dim);font-size:12px;margin-top:8px">点击左侧配置项编辑</div>'; return; }
    form.innerHTML = "<h3>" + esc(c.name) + "</h3>" +
      mkField("名称", "cfgName", c.name) +
      mkColor(c.color) +
      mkField("Base URL", "cfgEndpoint", c.endpoint, "https://api.deepseek.com/v1") +
      mkField("API Key", "cfgApiKey", c.apiKey ? maskKey(c.apiKey) : "", "sk-xxx", true) +
      mkField("模型", "cfgModel", c.model, "deepseek-chat") +
      mkRange("温度", "cfgTemp", c.temperature ?? 0.7, 0, 2, 0.1) +
      mkField("最大 Token", "cfgMaxTokens", c.maxTokens || 4096) +
      mkArea("自定义系统提示词", "cfgSysPrompt", c.systemPrompt, "可选，追加到默认提示词后") +
      mkProxy(c.proxy) +
      '<div class="cm-acts"><button class="t-btn cm-btn-danger" id="cfgDel">删除</button><span style="flex:1"></span><button class="t-btn" id="cfgTest">测试连接</button><button class="t-btn primary" id="cfgSave">保存</button></div>';
    form.querySelectorAll(".cm-color").forEach(function(el2) {
      el2.onclick = function() { c.color = el2.dataset.color; updateConfig(c.id, { color: c.color }); renderCfgForm(c.id); };
    });
    $("cfgDel").onclick = function() {
      if (confirm("确定删除？")) { removeConfig(c.id); editingId = getActiveId(); renderCfgList(); renderCfgForm(editingId); renderCfgMenu(); }
    };
    $("cfgSave").onclick = function() {
      c.name = $("cfgName").value.trim() || "未命名";
      c.endpoint = $("cfgEndpoint").value.trim();
      var rawKey = $("cfgApiKey").value.trim();
      if (rawKey && !rawKey.startsWith("sk-") && rawKey.includes("•")) {} else { c.apiKey = rawKey; }
      c.model = $("cfgModel").value.trim();
      c.temperature = parseFloat($("cfgTemp").value) || 0.7;
      c.maxTokens = parseInt($("cfgMaxTokens").value) || 4096;
      c.systemPrompt = $("cfgSysPrompt").value;
      var px = $("cfgProxy"); c.proxy = px ? px.checked : false;
      updateConfig(c.id, c); renderCfgList(); renderCfgForm(c.id); renderCfgMenu();
      var btn = $("aiCfgDropdown");
      if (btn) { var a = getActive(); btn.textContent = (a ? a.name : "") + " ▾"; }
      setStatus("配置已保存", "ok");
    };
    $("cfgTest").onclick = async function() {
      var ep = $("cfgEndpoint").value.trim();
      var key = $("cfgApiKey").value.trim();
      if (!ep || !key) { setStatus("请填写 Endpoint 和 API Key", "warn"); return; }
      setStatus("测试连接中...");
      try {
        var url = chatUrl(ep);
        var hdrs = { "Content-Type": "application/json", "Authorization": "Bearer " + key };
        var fu = url;
        var px2 = $("cfgProxy");
        if (px2 && px2.checked) { hdrs["X-Relay-Target"] = url; fu = "/__proxy"; }
        var resp = await fetch(fu, { method: "POST", headers: hdrs, body: JSON.stringify({ model: $("cfgModel").value.trim() || "gpt-3.5-turbo", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }) });
        if (resp.ok) setStatus("✓ 连接成功", "ok");
        else { var t = await resp.text(); setStatus("✗ 连接失败: HTTP " + resp.status + " " + t.slice(0, 100), "err"); }
      } catch(e) { setStatus("✗ 连接失败: " + e.message, "err"); }
    };
  }
}
/* ===================== Form Helpers ===================== */
function mkField(label, id, value, placeholder, isPassword) {
  var tp = isPassword ? "password" : "text";
  return '<div class="db-row"><label>' + label + '</label><input class="t-in" type="' + tp + '" id="' + id + '" spellcheck="false" value="' + esc(value||"") + '" placeholder="' + esc(placeholder||"") + '"></div>';
}
function mkColor(current) {
  return '<div class="db-row"><label>颜色</label><div class="cm-colors">' +
    COLORS.map(function(cl) { return '<div class="cm-color' + (cl === current ? " on" : "") + '" style="background:' + cl + '" data-color="' + cl + '"></div>'; }).join("") +
    '</div></div>';
}
function mkRange(label, id, value, min, max, step) {
  return '<div class="db-row"><label>' + label + ': <strong id="' + id + 'Val">' + value + '</strong></label><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" style="width:100%"></div>';
}
function mkArea(label, id, value, placeholder) {
  return '<div class="db-row"><label>' + label + '</label><textarea class="t-ta" id="' + id + '" rows="3" spellcheck="false" placeholder="' + esc(placeholder||"") + '">' + esc(value||"") + '</textarea></div>';
}
function mkProxy(checked) {
  return '<div class="cm-remember"><input type="checkbox" id="cfgProxy"' + (checked ? " checked" : "") + '> 经本地代理 /__proxy 转发（绕过 CORS）</div>';
}