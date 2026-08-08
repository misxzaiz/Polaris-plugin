// components/ai-float.js — AI 浮窗组件：全局悬浮按钮 + 可拖拽对话面板。
import { $, $$, el, esc, uid, copy } from "../core/dom.js";
import { chat, renderMarkdown } from "../core/ai-client.js";
import { getConfigs, getActive, getActiveId, switchConfig, COLORS } from "../core/ai-store.js";
import { buildContextSummary } from "../core/ai-context.js";
import { goView } from "../core/router.js";

let panel = null;
let messages = [];
let abortCtrl = null;
let useCtx = true;
let expanded = false;

/* ===================== Initialize Float ===================== */
export function initAiFloat() {
  var host = $("#aiFloatHost");
  if (!host) return;

  // Floating button
  var btn = el("button", "ai-fab");
  btn.innerHTML = "🤖";
  btn.title = "AI 助手";
  btn.onclick = togglePanel;
  host.appendChild(btn);
}

function togglePanel() {
  if (expanded) { closePanel(); } else { openPanel(); }
}

function openPanel() {
  expanded = true;
  var host = $("#aiFloatHost");
  if (!host) return;
  var old = host.querySelector(".ai-float");
  if (old) old.remove();
  panel = el("div", "ai-float open");
  var cfg = getActive();
  var cfgName = cfg ? esc(cfg.name) : "";
  var ctxSummary = buildContextSummary();
  panel.innerHTML = [
    '<div class="ai-float-head" id="aiFloatHead"><span class="ai-float-title">RELAY AI</span><span class="ai-float-cfg" id="aiFloatCfg">' + cfgName + ' ▾</span><span class="sp"></span><button class="ai-float-act" id="aiFloatExpand" title="展开">□</button><button class="ai-float-act" id="aiFloatClose">✕</button></div>',
    '<div class="ai-float-ctx" id="aiFloatCtx">📊 ' + esc(ctxSummary) + '</div>',
    '<div class="ai-float-msgs" id="aiFloatMsgs"></div>',
    '<div class="ai-float-input"><button class="ai-float-ctx-btn" id="aiFloatCtxBtn" title="切换上下文">📌</button><textarea class="ai-float-text" id="aiFloatText" placeholder="输入消息..." rows="1"></textarea><button class="t-btn primary" id="aiFloatSend">➤</button><button class="t-btn" id="aiFloatStop" style="display:none">■</button></div>'
  ].join("");
  host.appendChild(panel);
  initDrag();
  renderFloatMsgs();
  $("#aiFloatClose").onclick = closePanel;
  $("#aiFloatExpand").onclick = function() { closePanel(); goView("ai"); };
  $("#aiFloatSend").onclick = sendFloatMsg;
  $("#aiFloatStop").onclick = stopFloatChat;
  $("#aiFloatCfg").onclick = toggleFloatCfg;
  $("#aiFloatCtxBtn").onclick = function() { useCtx = !useCtx; this.style.opacity = useCtx ? "1" : "0.4"; };
  $("#aiFloatText").addEventListener("keydown", function(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFloatMsg(); } });
  $("#aiFloatText").addEventListener("input", function() { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 80) + "px"; });
}

function closePanel() {
  expanded = false;
  if (panel) { panel.remove(); panel = null; }
}

/* ===================== Drag ===================== */
function initDrag() {
  var head = $("#aiFloatHead");
  if (!head || !panel) return;
  head.style.cursor = "move";
  head.onmousedown = function(e) {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "SPAN") return;
    e.preventDefault();
    var startX = e.clientX, startY = e.clientY;
    var rect = panel.getBoundingClientRect();
    var startLeft = rect.left, startTop = rect.top;
    function onMove(e2) {
      var dx = e2.clientX - startX, dy = e2.clientY - startY;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 100, startLeft + dx)) + "px";
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 100, startTop + dy)) + "px";
    }
    function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  };
}

/* ===================== Config Dropdown (float) ===================== */
function toggleFloatCfg() {
  var existing = panel && panel.querySelector(".ai-float-cfg-menu");
  if (existing) { existing.remove(); return; }
  var cfgs = getConfigs();
  var aid = getActiveId();
  if (!cfgs.length) return;
  var menu = el("div", "ai-float-cfg-menu");
  menu.innerHTML = cfgs.map(function(c) {
    return '<div class="ai-cfg-item' + (c.id === aid ? " on" : "") + '" data-id="' + c.id + '"><span class="ai-cfg-dot" style="background:' + c.color + '"></span><span>' + esc(c.name) + '</span></div>';
  }).join("");
  menu.querySelectorAll(".ai-cfg-item").forEach(function(el2) {
    el2.onclick = function() {
      switchConfig(el2.dataset.id);
      var cfg = getActive();
      var btn = $("#aiFloatCfg");
      if (btn && cfg) btn.textContent = cfg.name + " ▾";
      menu.remove();
    };
  });
  panel.appendChild(menu);
}

/* ===================== Messages ===================== */
function renderFloatMsgs() {
  var host = $("#aiFloatMsgs");
  if (!host) return;
  if (!messages.length) {
    host.innerHTML = '<div class="ai-float-empty">问我任何问题...</div>';
    return;
  }
  host.innerHTML = messages.map(function(m) {
    if (m.role === "user") return '<div class="ai-fm user">' + esc(m.content) + '</div>';
    if (m.role === "assistant") return '<div class="ai-fm assistant">' + renderMarkdown(m.content || "") + '</div>';
    if (m.role === "tool") return '<div class="ai-fm tool"><pre>' + esc(m.content) + '</pre></div>';
    return "";
  }).join("");
  host.scrollTop = host.scrollHeight;
  // Update context bar
  var ctxBar = $("#aiFloatCtx");
  if (ctxBar) {
    var CHART = String.fromCodePoint(0x1F4CA);
    ctxBar.textContent = CHART + " " + buildContextSummary();
  }
}

/* ===================== Send ===================== */
async function sendFloatMsg() {
  var input = $("#aiFloatText");
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  messages.push({ role: "user", content: text });
  input.value = ""; input.style.height = "auto";
  renderFloatMsgs();

  // Show loading
  var host = $("#aiFloatMsgs");
  var loadEl = el("div", "ai-fm assistant");
  loadEl.id = "aiFloatLoading";
  loadEl.innerHTML = '<span class="spin"></span> 思考中...';
  host.appendChild(loadEl);
  host.scrollTop = host.scrollHeight;

  $("#aiFloatSend").style.display = "none";
  $("#aiFloatStop").style.display = "";

  var chatMsgs = messages.filter(function(m) { return m.role !== "tool"; }).map(function(m) { return { role: m.role, content: m.content }; });
  abortCtrl = new AbortController();
  var aiContent = "";
  var aiEl = null;

  await chat({
    messages: chatMsgs,
    signal: abortCtrl.signal,
    useContext: useCtx,
    onDelta: function(delta) {
      aiContent += delta;
      var ld = $("#aiFloatLoading");
      if (ld) ld.remove();
      if (!aiEl) {
        aiEl = el("div", "ai-fm assistant");
        host.appendChild(aiEl);
      }
      aiEl.innerHTML = renderMarkdown(aiContent);
      host.scrollTop = host.scrollHeight;
    },
    onToolCall: function(name, args) {
      var ld = $("#aiFloatLoading");
      if (ld) ld.remove();
      var toolEl = el("div", "ai-fm tool");
      toolEl.innerHTML = '<span class="spin"></span> 执行: ' + esc(name);
      host.appendChild(toolEl);
      host.scrollTop = host.scrollHeight;
    },
    onToolResult: function() {},
    onComplete: function(fullText) {
      if (fullText) messages.push({ role: "assistant", content: fullText });
      renderFloatMsgs();
      $("#aiFloatSend").style.display = "";
      $("#aiFloatStop").style.display = "none";
    },
    onError: function(err) {
      var ld = $("#aiFloatLoading");
      if (ld) ld.remove();
      var errEl = el("div", "ai-fm error");
      errEl.textContent = "Error: " + err;
      host.appendChild(errEl);
      host.scrollTop = host.scrollHeight;
      $("#aiFloatSend").style.display = "";
      $("#aiFloatStop").style.display = "none";
    },
  });
}

function stopFloatChat() {
  if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
  $("#aiFloatSend").style.display = "";
  $("#aiFloatStop").style.display = "none";
}
