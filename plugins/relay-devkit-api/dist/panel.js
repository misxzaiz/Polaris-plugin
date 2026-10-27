// src/panel.jsx
import { useEffect, useRef } from "react";

// styles/main.css
var main_default = `/* ============================================================
   RELAY \u2014 \u8BBE\u8BA1\u7CFB\u7EDF \xB7 \u7CBE\u5BC6\u4EEA\u8868 / obsidian + signal-coral
   \u9762\u677F\u6A21\u5F0F\uFF1A\u6240\u6709\u6837\u5F0F\u4EE5 .relay-devkit-panel \u4E3A\u4F5C\u7528\u57DF\uFF0C
   \u4E0D\u6C61\u67D3 Polaris \u5BBF\u4E3B\u7684\u5168\u5C40\u5B57\u4F53/\u989C\u8272/\u63A7\u4EF6\u6837\u5F0F\u3002
   ============================================================ */
/* \u8BBE\u8BA1\u53D8\u91CF\u5B9A\u4E49\u5728\u9762\u677F\u5BB9\u5668\u5185\uFF08\u800C\u975E :root\uFF09\uFF0C\u907F\u514D\u8986\u76D6\u5BBF\u4E3B\u540C\u540D CSS \u53D8\u91CF */
.relay-devkit-panel{
  --bg:#16181e; --bg-2:#1a1c24;
  --surface:#1e2028; --surface-2:#252830; --surface-3:#2c2f3a;
  --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.18);
  --ink:#d8dae2; --dim:#a8acba; --dimmer:#6e7282;
  --brand:#ff7a59; --brand-hi:#ff926f; --brand-ink:#1c0c06;
  --brand-glow:0 0 0 1px rgba(255,122,89,.5), 0 0 22px -8px rgba(255,122,89,.7);
  --m-get:#3fb950; --m-post:#4493f8; --m-put:#d29922; --m-patch:#a371f7; --m-del:#f85149; --m-other:#8b949e;
  --s2:#3fb950; --s3:#58a6ff; --s4:#d29922; --s5:#f85149;
  --ok:#3fb950; --warn:#d29922; --err:#f85149;
  --j-key:#79c0ff; --j-str:#a5d6a4; --j-num:#ffab70; --j-bool:#d2a8ff; --j-null:#8b949e;
  --mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;
  --disp:'Bricolage Grotesque','JetBrains Mono',system-ui,sans-serif;
  --r:7px; --r-sm:5px; --topbar:48px; --statusbar:26px; --tabsbar:38px; --side:266px;
  container-type:inline-size;
}
/* \u9762\u677F\u5BB9\u5668\u5185\u90E8\u57FA\u7840\u6837\u5F0F\uFF08\u4E0D\u4FEE\u6539\u5BBF\u4E3B html/body\uFF09 */
.relay-devkit-panel{background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}
.relay-devkit-panel *{margin:0;padding:0;box-sizing:border-box}
/* \u80CC\u666F\u88C5\u9970 \u2014 \u9650\u5236\u5728\u5BB9\u5668\u5185 */
.relay-devkit-panel::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}
.relay-devkit-panel::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.45;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}
.relay-devkit-panel > *{position:relative;z-index:1}
.relay-devkit-panel ::selection{background:var(--brand);color:var(--brand-ink)}
.relay-devkit-panel button,.relay-devkit-panel input,.relay-devkit-panel select,.relay-devkit-panel textarea{font-family:inherit;font-size:inherit;color:inherit;background:none;border:none;outline:none}
.relay-devkit-panel button{cursor:pointer}
.relay-devkit-panel input,.relay-devkit-panel textarea{caret-color:var(--brand)}

.relay-devkit-panel .app{grid-template-rows:var(--topbar) 1fr var(--statusbar)}

/* ===== \u5916\u58F3\uFF1A\u89C6\u56FE\u8DEF\u7531 ===== */
.relay-devkit-panel #view{flex:1;min-height:0;position:relative}
.relay-devkit-panel .view{position:absolute;inset:0;display:none;min-height:0}
.relay-devkit-panel .view.on{display:flex;flex-direction:column}
.relay-devkit-panel #viewApi.on{display:grid}

/* ===== \u901A\u7528\u5DE5\u5177\u9762\u677F\uFF08JSON / SQL / \u65F6\u95F4\u6233\u5171\u7528\uFF09 ===== */
.relay-devkit-panel .tool-pane{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.relay-devkit-panel .t-bar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}
.relay-devkit-panel .t-bar .t-title{font-family:var(--disp);font-weight:700;font-size:13px;margin-right:6px;display:flex;align-items:center;gap:7px}
.relay-devkit-panel .t-bar .t-title .tg{color:var(--brand)}
.relay-devkit-panel .t-bar .sp{flex:1}
.relay-devkit-panel .t-btn{font-size:11.5px;color:var(--dim);padding:6px 11px;border:1px solid var(--line);border-radius:var(--r-sm);transition:.14s;white-space:nowrap}
.relay-devkit-panel .t-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}
.relay-devkit-panel .t-btn.on{color:var(--brand);border-color:var(--brand)}
.relay-devkit-panel .t-btn.primary{color:var(--brand-ink);background:var(--brand);border-color:var(--brand);font-weight:700}
.relay-devkit-panel .t-btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}
.relay-devkit-panel .t-status{font-size:11px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.relay-devkit-panel .t-status.ok{color:var(--ok)} .relay-devkit-panel .t-status.err{color:var(--err)}
.relay-devkit-panel .t-seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}
.relay-devkit-panel .t-seg button{padding:6px 13px;font-size:11.5px;color:var(--dim);transition:.13s}
.relay-devkit-panel .t-seg button:hover{color:var(--ink);background:var(--surface)}
.relay-devkit-panel .t-seg button.on{background:var(--surface-3);color:var(--ink)}

/* JSON \u5DE5\u5177\uFF1A\u5DE6\u8F93\u5165 / \u53F3\u89C6\u56FE */
.relay-devkit-panel .jsplit{flex:1;display:flex;min-height:0}
.relay-devkit-panel .jspane-l{width:42%;min-width:180px;max-width:64%;display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0;position:relative}
.relay-devkit-panel .jspane-r{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.relay-devkit-panel .jspane-l textarea{flex:1;width:100%;resize:none;padding:13px;font-size:12.5px;line-height:1.65;background:transparent;color:var(--ink);white-space:pre;tab-size:2;min-height:0}
.relay-devkit-panel .jspane-l textarea::placeholder{color:var(--dimmer)}
.relay-devkit-panel .jdiv{width:7px;cursor:col-resize;flex:none;position:relative}
.relay-devkit-panel .jdiv::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--line);transition:.15s}
.relay-devkit-panel .jdiv:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}

/* SQL / \u65F6\u95F4\u6233\uFF1A\u5355\u5217\u5185\u5BB9 */
.relay-devkit-panel .t-body{flex:1;min-height:0;overflow:auto;padding:16px}
.relay-devkit-panel .t-field{margin-bottom:14px}
.relay-devkit-panel .t-field label{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);margin-bottom:7px}
.relay-devkit-panel .t-ta{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:12px 13px;font-size:12.5px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word;tab-size:2;resize:vertical;min-height:64px;font-family:var(--mono)}
.relay-devkit-panel .t-ta:focus{border-color:var(--brand)}
.relay-devkit-panel .t-in{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:14px;color:var(--ink);font-family:var(--mono)}
.relay-devkit-panel .t-in:focus{border-color:var(--brand)}
.relay-devkit-panel .t-out{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:13px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--ink);min-height:42px}
.relay-devkit-panel .t-note{font-size:11px;color:var(--dimmer);margin-top:7px;line-height:1.6}
.relay-devkit-panel .t-note.err{color:var(--err)} .t-note.ok{color:var(--ok)}
.relay-devkit-panel .t-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@container (max-width:760px){.relay-devkit-panel .t-grid{grid-template-columns:1fr}}
.relay-devkit-panel .t-card{border:1px solid var(--line);border-radius:11px;padding:16px;background:var(--surface)}
.relay-devkit-panel .t-card h4{font-family:var(--disp);font-weight:700;font-size:13px;margin-bottom:12px;color:var(--ink)}
.relay-devkit-panel .kvline{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}
.relay-devkit-panel .kvline:last-child{border-bottom:0}
.relay-devkit-panel .kvline .kk{font-size:11px;color:var(--dim);width:92px;flex:none;letter-spacing:.04em}
.relay-devkit-panel .kvline .vv{flex:1;font-size:13px;color:var(--ink);word-break:break-all;font-variant-numeric:tabular-nums}
.relay-devkit-panel .kvline .cp{font-size:10.5px;color:var(--dimmer);border:1px solid var(--line);border-radius:4px;padding:2px 8px;flex:none;transition:.13s}
.relay-devkit-panel .kvline .cp:hover{color:var(--brand);border-color:var(--brand)}
.relay-devkit-panel .t-now{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:13px 16px;border:1px solid var(--line);border-radius:11px;background:var(--bg-2);margin-bottom:16px}
.relay-devkit-panel .t-now .lab{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer)}
.relay-devkit-panel .t-now .clk{font-family:var(--mono);font-size:15px;color:var(--brand);font-variant-numeric:tabular-nums}

/* \u9876\u680F */
.relay-devkit-panel .topbar{display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--line);
  background:linear-gradient(180deg,rgba(255,255,255,.022),transparent);backdrop-filter:blur(8px);z-index:30}
.relay-devkit-panel .brand{display:flex;align-items:center;gap:9px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:16px}
.relay-devkit-panel .brand .dot{width:9px;height:9px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}
.relay-devkit-panel .brand small{font-family:var(--mono);font-weight:500;font-size:10px;letter-spacing:.22em;color:var(--dimmer);text-transform:uppercase;margin-left:2px}
.relay-devkit-panel .topbar .spacer{flex:1}
.relay-devkit-panel .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:var(--r-sm);color:var(--dim);border:1px solid transparent;transition:.16s}
.relay-devkit-panel .icon-btn:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line)}
.relay-devkit-panel .top-act{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--r-sm);color:var(--dim);border:1px solid var(--line);font-size:11.5px;letter-spacing:.02em;transition:.15s;white-space:nowrap}
.relay-devkit-panel .top-act:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line-2)}
/* \u7981\u53D1\u5934\u63D0\u793A\uFF1A\u4EE3\u7406\u6309\u94AE\u8109\u52A8\u5F15\u5BFC\u5F00\u4EE3\u7406 */
.relay-devkit-panel .top-act.pulse-hint{animation:relayPulse 1.2s ease-in-out 2;border-color:var(--warn);color:var(--warn)}
@keyframes relayPulse{0%,100%{transform:scale(1);box-shadow:none}50%{transform:scale(1.06);box-shadow:0 0 0 4px rgba(245,158,11,.22)}}
.relay-devkit-panel .hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em;display:flex;gap:14px}
.relay-devkit-panel .hint kbd{font-family:var(--mono);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--dim);font-size:10px}

/* \u73AF\u5883\u5207\u6362 */
.relay-devkit-panel .env-wrap{position:relative}
.relay-devkit-panel .env-sel{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--surface);transition:.15s;max-width:230px}
.relay-devkit-panel .env-sel:hover{border-color:var(--dim)}
.relay-devkit-panel .env-sel .ehex{color:var(--brand);font-size:13px}
.relay-devkit-panel .env-sel #envName{font-size:12px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.relay-devkit-panel .env-sel .car{font-size:8px;color:var(--dim)}
.relay-devkit-panel .env-menu{position:absolute;top:36px;right:0;min-width:230px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;z-index:80;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}
.relay-devkit-panel .env-menu.open{display:block}
.relay-devkit-panel .env-item{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:7px 10px;border-radius:var(--r-sm);transition:.12s}
.relay-devkit-panel .env-item:hover{background:var(--surface-3)}
.relay-devkit-panel .env-item.on{box-shadow:inset 2px 0 0 var(--brand)}
.relay-devkit-panel .env-item span{font-size:12px;color:var(--ink)}
.relay-devkit-panel .env-item small{font-size:10px;color:var(--dimmer)}
.relay-devkit-panel .env-item.manage{border-top:1px solid var(--line);margin-top:4px;padding-top:9px;color:var(--dim)}
.relay-devkit-panel .env-item.manage span,.relay-devkit-panel .env-item.manage{color:var(--dim);font-size:11.5px}

.relay-devkit-panel .main{display:grid;grid-template-columns:var(--side) 1fr;min-height:0;overflow:hidden}
.relay-devkit-panel .main.collapsed{grid-template-columns:0 1fr}

/* \u4FA7\u680F */
.relay-devkit-panel .side{border-right:1px solid var(--line);background:var(--bg-2);display:flex;flex-direction:column;min-height:0;overflow:hidden}
.relay-devkit-panel .side-head{display:flex;align-items:center;gap:6px;padding:11px 12px;border-bottom:1px solid var(--line)}
.relay-devkit-panel .side-head .t{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);font-weight:600;flex:1}
.relay-devkit-panel .side-head .mini-btn{width:26px;height:26px;border-radius:var(--r-sm);color:var(--dim);display:inline-flex;align-items:center;justify-content:center;transition:.15s;border:1px solid transparent;font-size:13px}
.relay-devkit-panel .side-head .mini-btn:hover{color:var(--brand);background:var(--surface);border-color:var(--line)}
.relay-devkit-panel .side-search{padding:8px 10px;border-bottom:1px solid var(--line)}
.relay-devkit-panel .side-search input{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 10px;font-size:12px;color:var(--ink);transition:.15s}
.relay-devkit-panel .side-search input:focus{border-color:var(--line-2);background:var(--surface-2)}
.relay-devkit-panel .side-search input::placeholder{color:var(--dimmer)}
.relay-devkit-panel .tree{flex:1;overflow-y:auto;padding:6px 6px 40px}
.relay-devkit-panel .group{margin-bottom:2px}
.relay-devkit-panel .group-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;color:var(--dim);transition:.12s;user-select:none}
.relay-devkit-panel .group-head:hover{background:var(--surface)}
.relay-devkit-panel .group-head .caret{width:12px;font-size:9px;color:var(--dimmer);transition:transform .15s;flex:none;text-align:center}
.relay-devkit-panel .group.collapsed .caret{transform:rotate(-90deg)}
.relay-devkit-panel .group-head .gname{flex:1;font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .group-head .gcount{font-size:10px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:1px 7px}
.relay-devkit-panel .group-head .gact{display:none;gap:2px}
.relay-devkit-panel .group-head:hover .gact{display:flex}
.relay-devkit-panel .group-head:hover .gcount{display:none}
.relay-devkit-panel .gact .x{width:20px;height:20px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}
.relay-devkit-panel .gact .x:hover{color:var(--brand);background:var(--surface-2)}
.relay-devkit-panel .group.collapsed .reqs{display:none}
.relay-devkit-panel .reqs{padding:2px 0 4px 8px}
.relay-devkit-panel .req-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;position:relative}
.relay-devkit-panel .req-item:hover{background:var(--surface)}
.relay-devkit-panel .req-item.active{background:var(--surface-2);box-shadow:inset 2px 0 0 var(--brand)}
.relay-devkit-panel .req-item .mb{flex:none;font-size:9px;font-weight:700;letter-spacing:.03em;width:38px;text-align:right}
.relay-devkit-panel .req-item .rn{flex:1;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .req-item .rx{display:none;width:18px;height:18px;border-radius:4px;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}
.relay-devkit-panel .req-item:hover .rx{display:inline-flex}
.relay-devkit-panel .req-item .rx:hover{color:var(--err);background:var(--surface-2)}
.relay-devkit-panel .tree-empty{padding:24px 14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.8}
.relay-devkit-panel .m-GET{color:var(--m-get)} .m-POST{color:var(--m-post)} .m-PUT{color:var(--m-put)}
.relay-devkit-panel .m-PATCH{color:var(--m-patch)} .m-DELETE{color:var(--m-del)} .m-HEAD,.m-OPTIONS{color:var(--m-other)}

/* \u5DE5\u4F5C\u533A */
.relay-devkit-panel .work{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.relay-devkit-panel .tabbar{display:flex;align-items:stretch;height:var(--tabsbar);min-height:var(--tabsbar);border-bottom:1px solid var(--line);background:var(--bg-2);overflow-x:auto;overflow-y:hidden;position:relative}
.relay-devkit-panel .tabbar::-webkit-scrollbar{height:0}
/* \u53F3\u7F18\u6EA2\u51FA\u906E\u7F69\uFF1A\u9690\u85CF\u6EDA\u52A8\u6761\u4E0B"\u8FD8\u6709\u66F4\u591A tab"\u7684\u552F\u4E00\u63D0\u793A\uFF08\u5DE6\u7F18\u56E0\u52A0\u53F7 sticky \u9489\u4F4F\uFF0C\u53EA\u9700\u53F3\u4FA7\uFF09 */
.relay-devkit-panel .tabbar::after{content:'';position:absolute;top:0;bottom:0;right:0;width:26px;pointer-events:none;opacity:0;transition:opacity .18s;
  background:linear-gradient(270deg,var(--bg-2),transparent);z-index:1}
.relay-devkit-panel .tabbar.has-more::after{opacity:1}
.relay-devkit-panel .rtab{display:flex;align-items:center;gap:8px;padding:0 12px;border-right:1px solid var(--line);cursor:pointer;color:var(--dim);transition:.14s;white-space:nowrap;max-width:240px;position:relative;flex:none}
.relay-devkit-panel .rtab:hover{background:var(--surface);color:var(--ink)}
.relay-devkit-panel .rtab.active{background:var(--surface-2);color:var(--ink)}
.relay-devkit-panel .rtab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand)}
.relay-devkit-panel .rtab .tm{font-size:9px;font-weight:700;flex:none}
.relay-devkit-panel .rtab .tn{font-size:12px;max-width:138px;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .rtab .dirty{width:6px;height:6px;border-radius:50%;background:var(--brand);flex:none}
.relay-devkit-panel .rtab .tx{width:16px;height:16px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:var(--dimmer);flex:none}
.relay-devkit-panel .rtab .tx:hover{color:var(--ink);background:var(--surface-3)}
.relay-devkit-panel .tab-add{position:sticky;left:0;z-index:2;flex:none;width:38px;display:inline-flex;align-items:center;justify-content:center;color:var(--dim);font-size:18px;border-right:1px solid var(--line);background:var(--bg-2)}
.relay-devkit-panel .tab-add:hover{color:var(--brand);background:var(--surface)}

.relay-devkit-panel .reqbar{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);align-items:center}
.relay-devkit-panel .method-wrap{position:relative;flex:none}
.relay-devkit-panel .method-sel{display:flex;align-items:center;gap:7px;padding:0 12px;height:36px;border:1px solid var(--line-2);border-radius:var(--r);background:var(--surface);font-weight:700;font-size:12.5px;letter-spacing:.04em;min-width:104px;justify-content:space-between;transition:.15s}
.relay-devkit-panel .method-sel:hover{border-color:var(--dim)}
.relay-devkit-panel .method-sel .car{font-size:9px;color:var(--dim)}
.relay-devkit-panel .method-menu{position:absolute;top:42px;left:0;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);z-index:60;min-width:130px;padding:5px;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);display:none}
.relay-devkit-panel .method-menu.open{display:block}
.relay-devkit-panel .method-menu button{display:flex;width:100%;padding:7px 10px;border-radius:var(--r-sm);font-weight:700;font-size:12px;letter-spacing:.04em}
.relay-devkit-panel .method-menu button:hover{background:var(--surface-3)}
.relay-devkit-panel .url-wrap{flex:1;min-width:0;position:relative;display:flex;flex-direction:column}
.relay-devkit-panel .url-input{height:36px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:0 14px;font-size:13px;color:var(--ink);transition:.15s;width:100%}
.relay-devkit-panel .url-input:focus{border-color:var(--line-2);background:var(--surface-2)}
.relay-devkit-panel .url-input::placeholder{color:var(--dimmer)}
.relay-devkit-panel .url-resolved{position:absolute;top:38px;left:2px;font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none}
.relay-devkit-panel .url-resolved b{color:var(--m-post)}
.relay-devkit-panel .btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:var(--r);font-weight:600;font-size:12.5px;letter-spacing:.02em;border:1px solid var(--line-2);color:var(--ink);background:var(--surface);transition:.16s;white-space:nowrap}
.relay-devkit-panel .btn:hover{border-color:var(--dim);background:var(--surface-2)}
.relay-devkit-panel .btn.primary{background:var(--brand);color:var(--brand-ink);border-color:var(--brand);font-weight:700}
.relay-devkit-panel .btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}
.relay-devkit-panel .btn.primary:disabled{opacity:.55;cursor:wait}
.relay-devkit-panel .btn .k{font-size:9.5px;opacity:.6;font-weight:500}
.relay-devkit-panel .btn.ghost{background:transparent}
.relay-devkit-panel .btn.icon{padding:0 11px}
.relay-devkit-panel .btn.danger{color:var(--err);border-color:rgba(248,81,73,.4)}
.relay-devkit-panel .btn.danger:hover{background:rgba(248,81,73,.12)}

/* \u8BF7\u6C42/\u54CD\u5E94\u5206\u9694 */
.relay-devkit-panel .split{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}
.relay-devkit-panel .split.h{flex-direction:row}
.relay-devkit-panel .req-region{flex:none;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
.relay-devkit-panel .split:not(.h) .req-region{height:var(--reqH,240px)}
.relay-devkit-panel .split.h .req-region{width:var(--reqW,520px)}
.relay-devkit-panel .divider{flex:none;position:relative;background:transparent;z-index:5}
.relay-devkit-panel .split:not(.h) .divider{height:8px;cursor:row-resize}
.relay-devkit-panel .split.h .divider{width:8px;cursor:col-resize}
.relay-devkit-panel .divider::before{content:'';position:absolute;background:var(--line);transition:.15s}
.relay-devkit-panel .split:not(.h) .divider::before{left:0;right:0;top:50%;height:1px}
.relay-devkit-panel .split.h .divider::before{top:0;bottom:0;left:50%;width:1px}
.relay-devkit-panel .split:not(.h) .divider:hover::before{background:var(--brand);height:2px;box-shadow:0 0 10px var(--brand)}
.relay-devkit-panel .split.h .divider:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}
.relay-devkit-panel .res-region{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}

.relay-devkit-panel .subtabs{display:flex;align-items:center;gap:2px;padding:6px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap}
.relay-devkit-panel .subtab{padding:5px 12px;border-radius:var(--r-sm);font-size:11.5px;color:var(--dim);letter-spacing:.03em;transition:.13s;white-space:nowrap}
.relay-devkit-panel .subtab:hover{color:var(--ink);background:var(--surface)}
.relay-devkit-panel .subtab.active{color:var(--brand);background:var(--surface-2)}
.relay-devkit-panel .subtab.disabled{color:var(--dimmer);opacity:.45;pointer-events:none}
.relay-devkit-panel .subtab .badge{font-size:9px;color:var(--dimmer);margin-left:5px}
.relay-devkit-panel .subtab.active .badge{color:var(--brand)}
.relay-devkit-panel .subtabs .sp{flex:1}
.relay-devkit-panel .subtabs .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.14s}
.relay-devkit-panel .subtabs .tool:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}
.relay-devkit-panel .pane{flex:1;overflow:auto;min-height:0}

/* key-value \u7F16\u8F91\u5668 */
.relay-devkit-panel .kv{width:100%}
.relay-devkit-panel .kv .kv-row{display:grid;grid-template-columns:30px 1fr 1fr 30px;align-items:center;border-bottom:1px solid var(--line)}
.relay-devkit-panel .kv .kv-row:hover{background:rgba(255,255,255,.014)}
.relay-devkit-panel .kv input[type=text]{width:100%;padding:8px 10px;font-size:12px;background:transparent;color:var(--ink)}
.relay-devkit-panel .kv input[type=text]::placeholder{color:var(--dimmer)}
.relay-devkit-panel .kv input.k{color:var(--brand-hi);border-right:1px solid var(--line)}
.relay-devkit-panel .kv .ck{display:flex;align-items:center;justify-content:center}
.relay-devkit-panel .kv .ck input{accent-color:var(--brand);width:13px;height:13px;cursor:pointer}
.relay-devkit-panel .kv .rm{display:flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:13px;height:100%}
.relay-devkit-panel .kv .rm:hover{color:var(--err)}
.relay-devkit-panel .kv-row.blank input.k{color:var(--dim)}
.relay-devkit-panel .kv-row.blank .ck,.relay-devkit-panel .kv-row.blank .rm{opacity:.3}

.relay-devkit-panel .body-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}
.relay-devkit-panel .seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}
.relay-devkit-panel .seg button{padding:5px 11px;font-size:11px;color:var(--dim);transition:.13s}
.relay-devkit-panel .seg button:hover{color:var(--ink);background:var(--surface)}
.relay-devkit-panel .seg button.on{background:var(--surface-3);color:var(--ink)}
.relay-devkit-panel .body-bar .sp{flex:1}
.relay-devkit-panel .body-bar .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border:1px solid var(--line);border-radius:var(--r-sm)}
.relay-devkit-panel .body-bar .tool:hover{color:var(--ink);border-color:var(--line-2)}
.relay-devkit-panel textarea.code{width:100%;height:100%;min-height:110px;resize:none;padding:12px;font-size:12.5px;line-height:1.6;background:transparent;color:var(--ink);white-space:pre;tab-size:2}
.relay-devkit-panel .body-none{padding:30px;text-align:center;color:var(--dimmer);font-size:12px;line-height:1.9}

/* \u54CD\u5E94\u5934\u6761 + \u5DE5\u5177 */
.relay-devkit-panel .res-status{display:flex;align-items:center;gap:14px;padding:8px 12px;border-bottom:1px solid var(--line);flex:none;font-size:12px;flex-wrap:wrap}
.relay-devkit-panel .status-chip{display:inline-flex;align-items:center;gap:7px;font-weight:700;letter-spacing:.02em}
.relay-devkit-panel .status-chip .dotc{width:8px;height:8px;border-radius:50%}
.relay-devkit-panel .res-meta{color:var(--dim);display:flex;gap:14px;flex-wrap:wrap}
.relay-devkit-panel .res-meta b{color:var(--ink);font-weight:600}
.relay-devkit-panel .res-tools{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--line);flex:none}
.relay-devkit-panel .res-tools .ti{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 9px;height:28px}
.relay-devkit-panel .res-tools .ti .lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer)}
.relay-devkit-panel .res-tools .ti input{width:100%;font-size:12px;color:var(--ink);background:transparent;padding:5px 0}
.relay-devkit-panel .res-tools .ti.path{flex:1.2;min-width:120px}
.relay-devkit-panel .res-tools .ti.filter{flex:1;min-width:100px}
.relay-devkit-panel .res-tools .ti input::placeholder{color:var(--dimmer)}
.relay-devkit-panel .res-tools .ti.path{flex:none;min-width:0}
.relay-devkit-panel .res-tools .ti.path .lbl{color:var(--m-post)}
.relay-devkit-panel .res-tools .ti.manual{flex:1;min-width:130px}
/* \u589E\u5F3A\u8FC7\u6EE4\u680F */
.relay-devkit-panel .fb-bar{position:relative;display:flex;align-items:center;flex:1;min-width:100px;gap:0;flex-wrap:wrap}
.relay-devkit-panel .fb-edit{border:none;background:transparent;color:var(--ink);font-size:12px;flex:1;min-width:60px;padding:5px 0;outline:none}
.relay-devkit-panel .fb-edit::placeholder{color:var(--dimmer)}
.relay-devkit-panel .fb-tokens{display:none;flex-wrap:wrap;gap:4px;margin-right:4px;align-items:center}
.relay-devkit-panel .ftk{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:10.5px;white-space:nowrap;border:1px solid var(--line);background:rgba(255,255,255,.03);line-height:1.6}
.relay-devkit-panel .ftk .ftk-field{color:var(--j-key);font-weight:600}
.relay-devkit-panel .ftk .ftk-op{color:var(--dimmer);font-size:10px}
.relay-devkit-panel .ftk .ftk-val{color:var(--j-str)}
.relay-devkit-panel .ftk .ftk-num{color:var(--j-num)}
.relay-devkit-panel .ftk .ftk-bool{color:var(--j-bool)}
.relay-devkit-panel .ftk .ftk-null{color:var(--j-null);font-style:italic}
.relay-devkit-panel .ftk .ftk-neg{color:var(--err);font-weight:700}
.relay-devkit-panel .fb-ac{position:absolute;top:100%;left:0;z-index:90;min-width:160px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:5px;display:none;margin-top:2px}
.relay-devkit-panel .fb-ac.open{display:block}
.relay-devkit-panel .fb-ac-item{display:block;width:100%;text-align:left;padding:5px 9px;border-radius:var(--r-sm);font-size:11.5px;color:var(--ink)}
.relay-devkit-panel .fb-ac-item:hover{background:var(--surface-3);color:var(--brand)}
.relay-devkit-panel .pathdd{position:relative}
.relay-devkit-panel .pathdd-btn{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 4px 0 2px;background:transparent;color:var(--ink);font-size:11.5px;max-width:210px}
.relay-devkit-panel .pathdd-btn>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:176px}
.relay-devkit-panel .pathdd-btn .pcar{color:var(--dim);font-size:8px;flex:none}
.relay-devkit-panel .pathdd-btn:hover{color:var(--brand)}
.relay-devkit-panel .path-menu{position:absolute;top:34px;left:0;z-index:90;width:320px;max-width:80vw;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:7px;display:none}
.relay-devkit-panel .path-menu.open{display:block}
.relay-devkit-panel .path-filter{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 9px;font-size:12px;color:var(--ink);margin-bottom:6px}
.relay-devkit-panel .path-filter:focus{border-color:var(--line-2);background:var(--surface-3)}
.relay-devkit-panel .path-list{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:1px}
.relay-devkit-panel .path-opt{display:flex;align-items:center;gap:8px;width:100%;padding:6px 9px;border-radius:var(--r-sm);text-align:left;transition:.1s}
.relay-devkit-panel .path-opt:hover{background:var(--surface-3)}
.relay-devkit-panel .path-opt.on{box-shadow:inset 2px 0 0 var(--brand);background:var(--surface-3)}
.relay-devkit-panel .path-opt .pp{flex:1;font-size:11.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .path-opt .pk{flex:none;font-size:10px;color:var(--dimmer);font-variant-numeric:tabular-nums}
.relay-devkit-panel .path-opt .pk.array{color:var(--j-num)} .path-opt .pk.object{color:var(--j-key)}
.relay-devkit-panel .path-empty{padding:14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.7}
.relay-devkit-panel .cell-tip{position:fixed;z-index:200;max-width:480px;max-height:60vh;overflow:hidden;background:var(--surface-3);border:1px solid var(--line-2);border-radius:6px;padding:8px 11px;font:12px/1.55 var(--mono);color:var(--ink);white-space:pre-wrap;word-break:break-word;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);pointer-events:none;opacity:0;transition:opacity .1s;left:0;top:0}
.relay-devkit-panel .cell-tip.show{opacity:1}

.relay-devkit-panel .res-idle{padding:36px 22px;text-align:center;color:var(--dimmer);font-size:12.5px;line-height:1.95}
.relay-devkit-panel .res-idle .big{font-family:var(--disp);font-size:16px;color:var(--dim);margin-bottom:6px}
.relay-devkit-panel .res-idle .tips{margin-top:14px;display:inline-block;text-align:left;font-size:11.5px;color:var(--dimmer);line-height:2}
.relay-devkit-panel .res-idle .tips b{color:var(--dim)}
.relay-devkit-panel .res-loading{display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--dim);font-size:12.5px}
.relay-devkit-panel .spin{width:16px;height:16px;border:2px solid var(--line-2);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.relay-devkit-panel .res-err{padding:22px;color:var(--err);font-size:12.5px;line-height:1.7}
.relay-devkit-panel .res-err .ti{font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.relay-devkit-panel .res-err .hintbox{margin-top:12px;padding:11px 13px;background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.25);border-radius:var(--r);color:var(--dim);font-size:11.5px}
.relay-devkit-panel .prev-none,.relay-devkit-panel .dimnote{padding:30px;text-align:center;color:var(--dimmer);font-size:12.5px}
.relay-devkit-panel .dimnote{padding:16px;text-align:left}

.relay-devkit-panel pre.raw{padding:14px;font-size:12.5px;line-height:1.65;white-space:pre;overflow:auto;tab-size:2}
.relay-devkit-panel pre.raw.wrap{white-space:pre-wrap;word-break:break-word}
.relay-devkit-panel .tok-key{color:var(--j-key)} .tok-str{color:var(--j-str)} .tok-num{color:var(--j-num)} .tok-bool{color:var(--j-bool)} .tok-null{color:var(--j-null)} .tok-id{color:var(--m-get);font-weight:500}

.relay-devkit-panel .jtree{padding:12px;font-size:12.5px;line-height:1.6}
.relay-devkit-panel .jt-node{padding-left:15px;position:relative}
.relay-devkit-panel .jt-row{display:flex;align-items:flex-start;gap:5px;padding:.5px 0;border-radius:3px}
.relay-devkit-panel .jt-row.expandable{cursor:pointer}
.relay-devkit-panel .jt-row.expandable:hover{background:rgba(255,255,255,.025)}
.relay-devkit-panel .jt-tog{position:absolute;left:1px;color:var(--dimmer);font-size:9px;width:12px;text-align:center;user-select:none;top:3px}
.relay-devkit-panel .jt-key{color:var(--j-key)} .jt-colon{color:var(--dimmer)}
.relay-devkit-panel .jt-str{color:var(--j-str)} .jt-num{color:var(--j-num)} .jt-bool{color:var(--j-bool)} .jt-null{color:var(--j-null)}
.relay-devkit-panel .jt-prev{color:var(--dimmer);font-style:italic}
.relay-devkit-panel .jt-children.hide{display:none}
.relay-devkit-panel .jt-act{margin-left:8px;opacity:0;font-size:10px;transition:.12s;display:inline-flex;gap:8px}
.relay-devkit-panel .jt-row:hover .jt-act{opacity:1}
.relay-devkit-panel .jt-act b{color:var(--dimmer);cursor:pointer}
.relay-devkit-panel .jt-act b:hover{color:var(--brand)}
.relay-devkit-panel .hl{background:rgba(255,122,89,.28);border-radius:2px;color:#fff}

.relay-devkit-panel .tbl-cands{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--bg-2)}
.relay-devkit-panel .tbl-cands .lab{font-size:10px;color:var(--dimmer);letter-spacing:.1em;text-transform:uppercase;align-self:center;margin-right:2px}
.relay-devkit-panel .tcand{font-size:11px;color:var(--dim);padding:4px 10px;border:1px solid var(--line);border-radius:20px;transition:.13s;display:inline-flex;gap:6px;align-items:center}
.relay-devkit-panel .tcand:hover{color:var(--ink);border-color:var(--line-2)}
.relay-devkit-panel .tcand.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}
.relay-devkit-panel .tcand em{font-style:normal;color:var(--dimmer);font-size:10px}
.relay-devkit-panel .tcand.on em{color:var(--brand)}
/* \u5217\u9009\u62E9\u5668 */
.relay-devkit-panel .col-picker{display:flex;flex-wrap:wrap;padding:4px 12px;border-bottom:1px solid var(--line);background:var(--bg-2);align-items:center;gap:5px}
.relay-devkit-panel .col-picker.collapsed{flex-wrap:nowrap}
.relay-devkit-panel .col-toggle{font-size:11px;color:var(--dim);padding:3px 10px;border:1px solid var(--line);border-radius:20px;cursor:pointer;white-space:nowrap;transition:.13s}
.relay-devkit-panel .col-toggle:hover{color:var(--ink);border-color:var(--line-2)}
.relay-devkit-panel .col-body{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.relay-devkit-panel .col-picker.collapsed .col-body{display:none}
.relay-devkit-panel .col-q{font-size:10px;color:var(--dimmer);padding:3px 9px;border:1px solid var(--line);border-radius:var(--r-sm);margin-right:4px}
.relay-devkit-panel .col-q:hover{color:var(--ink);border-color:var(--line-2)}
.relay-devkit-panel .col-chip{font-size:11px;padding:3px 10px;border:1px solid var(--line);border-radius:20px;color:var(--dim);transition:.13s;cursor:grab}
.relay-devkit-panel .col-chip:hover{color:var(--ink);border-color:var(--line-2)}
.relay-devkit-panel .col-chip.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}
.relay-devkit-panel .col-chip.dragging{opacity:.35}
.relay-devkit-panel .col-chip.drag-over{border-color:var(--brand);box-shadow:0 0 0 2px rgba(255,122,89,.25)}
.relay-devkit-panel .tbl-host{display:flex;flex-direction:column;height:100%;min-height:0}
.relay-devkit-panel .tbl-wrap{flex:1;min-height:0;overflow:auto}
.relay-devkit-panel table.dt{border-collapse:separate;border-spacing:0;font-size:12px;width:auto;min-width:100%}
.relay-devkit-panel table.dt th,.relay-devkit-panel table.dt td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 11px;text-align:left;vertical-align:middle;max-width:340px;min-width:54px}
.relay-devkit-panel table.dt th:first-child,.relay-devkit-panel table.dt td:first-child{border-left:1px solid var(--line)}
.relay-devkit-panel table.dt thead th{border-top:1px solid var(--line)}
.relay-devkit-panel table.dt th{position:sticky;top:0;background:var(--surface-2);color:var(--ink);font-weight:600;letter-spacing:.01em;font-size:11px;white-space:nowrap;z-index:2;user-select:none}
.relay-devkit-panel table.dt th.sortable{cursor:pointer}
.relay-devkit-panel table.dt th.sortable:hover{color:var(--brand)}
.relay-devkit-panel table.dt th.sort-asc::after{content:' \u25B2';font-size:9px;color:var(--brand)}
.relay-devkit-panel table.dt th.sort-desc::after{content:' \u25BC';font-size:9px;color:var(--brand)}
.relay-devkit-panel table.dt th.idx{left:0;z-index:4}
.relay-devkit-panel table.dt td{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel table.dt tr:hover td{background:rgba(255,255,255,.022)}
.relay-devkit-panel table.dt tr:hover td.idx{background:var(--surface)}
.relay-devkit-panel table.dt td.idx{color:var(--dimmer);text-align:right;font-variant-numeric:tabular-nums;background:var(--bg-2);position:sticky;left:0;z-index:1;min-width:42px}
.relay-devkit-panel table.dt .cobj{color:var(--j-key);cursor:default}
.relay-devkit-panel .cell-num{color:var(--j-num)} .cell-bool{color:var(--j-bool)} .cell-null{color:var(--j-null);font-style:italic} .cell-str{color:var(--ink)}
.relay-devkit-panel .cell-img{height:30px;width:30px;object-fit:cover;border-radius:5px;border:1px solid var(--line-2);vertical-align:middle;background:repeating-conic-gradient(#1a1d24 0 25%,#14161b 0 50%) 50%/10px 10px}
.relay-devkit-panel .cell-imn{color:var(--dim);margin-left:7px;font-size:11px}
.relay-devkit-panel .cell-ts{color:var(--j-num);background:rgba(255,171,112,.09);border:1px solid rgba(255,171,112,.2);border-radius:4px;padding:1px 7px;font-size:11px;white-space:nowrap}
.relay-devkit-panel .col-grip{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;z-index:5}
.relay-devkit-panel .col-grip:hover{background:linear-gradient(90deg,transparent,var(--brand))}
.relay-devkit-panel .col-grip:active{background:var(--brand)}
.relay-devkit-panel .tbl-note{padding:6px 12px;font-size:10.5px;color:var(--dimmer);border-bottom:1px solid var(--line);background:var(--bg-2);flex:none}
.relay-devkit-panel .prev-frame{width:100%;height:100%;border:0;background:#fff}
.relay-devkit-panel .prev-img-wrap{padding:18px;display:flex;align-items:flex-start;justify-content:center;height:100%;overflow:auto}
.relay-devkit-panel .prev-img-wrap img{max-width:100%;background:repeating-conic-gradient(#1a1d24 0% 25%, #14161b 0% 50%) 50%/18px 18px;border:1px solid var(--line)}

.relay-devkit-panel .statusbar{display:flex;align-items:center;gap:16px;padding:0 14px;border-top:1px solid var(--line);background:var(--bg-2);font-size:10.5px;color:var(--dimmer);letter-spacing:.03em}
.relay-devkit-panel .statusbar .msg{flex:1;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.relay-devkit-panel .statusbar .msg.ok{color:var(--ok)} .statusbar .msg.err{color:var(--err)} .statusbar .msg.warn{color:var(--warn)}
.relay-devkit-panel .statusbar .seg-r{display:flex;gap:16px}
.relay-devkit-panel .statusbar b{color:var(--dim);font-weight:600}

.relay-devkit-panel .modal-bg{position:fixed;inset:0;background:rgba(5,6,9,.66);backdrop-filter:blur(3px);z-index:100;display:none;align-items:center;justify-content:center}
.relay-devkit-panel .modal-bg.open{display:flex}
.relay-devkit-panel .modal{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;width:min(460px,92cqw);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);overflow:hidden;animation:pop .16s ease;max-height:88vh;overflow-y:auto}
.relay-devkit-panel .modal.wide{width:min(620px,94cqw)}
@keyframes pop{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.relay-devkit-panel .modal h3{font-family:var(--disp);font-weight:700;font-size:16px;padding:16px 18px 4px}
.relay-devkit-panel .modal .sub{padding:0 18px 14px;color:var(--dim);font-size:11.5px;line-height:1.6}
.relay-devkit-panel .modal .field{padding:0 18px 12px}
.relay-devkit-panel .modal label{display:block;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dimmer);margin-bottom:6px}
.relay-devkit-panel .modal input,.relay-devkit-panel .modal select{width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink)}
.relay-devkit-panel .modal input:focus,.relay-devkit-panel .modal select:focus{border-color:var(--brand)}
.relay-devkit-panel .modal .acts{display:flex;align-items:center;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line);margin-top:6px}
.relay-devkit-panel .curl-ta{width:100%;min-height:150px;resize:vertical;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word}
.relay-devkit-panel .env-tabs{display:flex;gap:5px;flex-wrap:wrap;padding:0 18px 12px}
.relay-devkit-panel .env-tab{font-size:11.5px;color:var(--dim);padding:5px 11px;border:1px solid var(--line);border-radius:20px;transition:.13s}
.relay-devkit-panel .env-tab:hover{color:var(--ink);border-color:var(--line-2)}
.relay-devkit-panel .env-tab.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}
.relay-devkit-panel .env-tab.add{color:var(--dimmer)}
.relay-devkit-panel .env-vars{border:1px solid var(--line);border-radius:var(--r);overflow:hidden}

.relay-devkit-panel .toast{position:fixed;bottom:38px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;background:var(--surface-3);border:1px solid var(--line-2);color:var(--ink);padding:9px 16px;border-radius:30px;font-size:12px;z-index:120;transition:.22s;pointer-events:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.6)}
.relay-devkit-panel .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.relay-devkit-panel .toast b{color:var(--brand)}

/* ===== \u5BB9\u5668\u67E5\u8BE2\uFF1A\u7A84\u9762\u677F\u7D27\u51D1\u5E03\u5C40 ===== */
@container (max-width:880px){
.relay-devkit-panel{--side:0px}
.relay-devkit-panel .hint{display:none}
.relay-devkit-panel .split.h .req-region{width:46%}
.relay-devkit-panel .reqbar{flex-wrap:wrap}
.relay-devkit-panel .topbar{flex-wrap:wrap;height:auto;min-height:var(--topbar);padding:6px 10px}
.relay-devkit-panel .env-sel{max-width:150px}
.relay-devkit-panel .db-side{width:168px}
.relay-devkit-panel .cm{min-height:280px}
}
@container (max-width:560px){
.relay-devkit-panel .brand small{display:none}
.relay-devkit-panel .env-sel{max-width:110px}
.relay-devkit-panel .top-act{padding:0 8px;font-size:11px}
.relay-devkit-panel .db-side{display:none}
.relay-devkit-panel .cm-list{width:120px}
.relay-devkit-panel .cm{min-height:240px}
.relay-devkit-panel .db-conn{padding:18px 14px}
.relay-devkit-panel .db-conn .db-card{padding:16px 16px}
}

/* ===== \u6570\u636E\u5E93\u5DE5\u5177 ===== */
.relay-devkit-panel .db-conn{position:absolute;inset:0;overflow:auto;padding:30px 28px}
.relay-devkit-panel .db-conn .db-card{max-width:560px;margin:0 auto;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));padding:22px 24px}
.relay-devkit-panel .db-conn h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:12px}
.relay-devkit-panel .db-conn .sub{color:var(--dim);font-size:11.5px;line-height:1.7;margin-bottom:16px}
.relay-devkit-panel .db-row{display:flex;gap:10px;align-items:center;margin-bottom:11px}
.relay-devkit-panel .db-row label{width:104px;flex:none;font-size:11px;color:var(--dim);letter-spacing:.04em;text-align:right}
.relay-devkit-panel .db-row .t-in{font-size:13px;padding:9px 12px}
.relay-devkit-panel .db-row.inline{justify-content:flex-start;gap:14px}
.relay-devkit-panel .db-row.inline .ckbox{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}
.relay-devkit-panel .db-row.inline .ckbox input{accent-color:var(--brand);width:14px;height:14px}
.relay-devkit-panel .db-acts{display:flex;gap:9px;margin-top:6px;padding-left:114px}
@container (max-width:620px){ .relay-devkit-panel .db-row{flex-direction:column;align-items:stretch} .relay-devkit-panel .db-row label{width:auto;text-align:left} .relay-devkit-panel .db-acts{padding-left:0} }

.relay-devkit-panel .db-main{flex:1;display:flex;min-height:0}
.relay-devkit-panel .db-side{width:218px;flex:none;border-right:1px solid var(--line);overflow:hidden;padding:0;background:var(--bg-2);display:flex;flex-direction:column}
.relay-devkit-panel .db-side .db-side-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:8px 8px 6px;display:flex;align-items:center;gap:6px;flex-shrink:0;border-bottom:1px solid var(--line)}
.relay-devkit-panel .db-side .db-side-h .db-sel-btn{width:20px;height:20px;border-radius:var(--r-sm);color:var(--dimmer);font-size:11px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.relay-devkit-panel .db-side .db-side-h .db-sel-btn:hover{color:var(--brand);background:var(--surface)}
.relay-devkit-panel .db-side-search{padding:6px 8px;flex-shrink:0}
.relay-devkit-panel .db-side-search .t-in{font-size:11.5px;padding:6px 9px;background:var(--surface)}
.relay-devkit-panel .db-side-tabs{display:flex;gap:0;padding:0 8px;flex-shrink:0;border-bottom:1px solid var(--line)}
.relay-devkit-panel .db-side-tab{flex:1;padding:5px 0;font-size:11px;text-align:center;color:var(--dimmer);border-bottom:2px solid transparent;cursor:pointer;transition:.12s}
.relay-devkit-panel .db-side-tab:hover{color:var(--dim)}
.relay-devkit-panel .db-side-tab.on{color:var(--brand);border-bottom-color:var(--brand)}
.relay-devkit-panel .db-side-scroll{flex:1;min-height:0;overflow:auto;padding:0 8px 8px}
.relay-devkit-panel .dbt{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 9px;border-radius:var(--r-sm);color:var(--dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .dbt:hover{background:var(--surface);color:var(--ink)}
.relay-devkit-panel .dbt.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}
.relay-devkit-panel .dbt .dbt-n{flex:1;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .dbt .dbt-pk{font-size:9px;color:var(--j-num)}
.relay-devkit-panel .dbt .dbt-cols{font-size:9px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:0 6px;min-width:18px;text-align:center;line-height:1.6}
.relay-devkit-panel .dbt.dbt-db .dbt-icon{font-size:13px;flex:none}
.relay-devkit-panel .dbt.dbt-db .dbt-n{color:var(--ink);font-weight:500}
.relay-devkit-panel .dbt-hist{position:relative;align-items:flex-start;white-space:normal}
.relay-devkit-panel .dbt-hist .dbt-sql{flex:1;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--ink);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal}
.relay-devkit-panel .dbt-hist .dbt-meta{font-size:9px;color:var(--dimmer);white-space:nowrap;flex:none;margin-top:2px}
.relay-devkit-panel .dbt-hist .dbt-acts{display:none;gap:3px;position:absolute;right:4px;top:3px}
.relay-devkit-panel .dbt-hist:hover .dbt-acts{display:flex}
.relay-devkit-panel .dbt-hist:hover .dbt-meta{display:none}
.relay-devkit-panel .dbt-hist-act{width:20px;height:20px;border-radius:3px;color:var(--dimmer);font-size:10px;display:inline-flex;align-items:center;justify-content:center}
.relay-devkit-panel .dbt-hist-act:hover{background:var(--surface-2);color:var(--ink)}
.relay-devkit-panel .hist-empty{color:var(--dimmer);font-size:11px;padding:20px 8px;text-align:center}
.relay-devkit-panel .db-ctx{position:fixed;z-index:90;min-width:170px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .16s ease}
.relay-devkit-panel .db-ctx-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);text-align:left;transition:.1s;white-space:nowrap}
.relay-devkit-panel .db-ctx-item:hover{background:var(--surface-3);color:var(--ink)}
.relay-devkit-panel .db-ctx-sep{height:1px;background:var(--line);margin:4px 6px}
/* \u81EA\u52A8\u8865\u5168\u6D6E\u5C42 */
.relay-devkit-panel .db-ac{position:fixed;z-index:95;max-width:340px;max-height:260px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:3px 0;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .12s ease;font-size:12px}
.relay-devkit-panel .db-ac-item{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:5px 10px;font-size:12px;color:var(--dim);transition:.1s;white-space:nowrap;cursor:pointer;border-radius:var(--r-sm)}
.relay-devkit-panel .db-ac-item:hover{background:var(--surface);color:var(--ink)}
.relay-devkit-panel .db-ac-item.on{background:var(--surface);box-shadow:inset 2px 0 0 var(--brand);color:var(--ink)}
.relay-devkit-panel .db-ac-item small{font-size:10px;color:var(--dimmer);margin-left:auto;padding-left:8px}
.relay-devkit-panel .db-ac-badge{flex:none;font-size:9px;font-weight:700;letter-spacing:.04em;padding:1px 5px;border-radius:3px;margin-right:6px;line-height:1.4}
.relay-devkit-panel .db-ac-keyword .db-ac-badge{color:var(--j-key);background:rgba(121,192,255,.12)}
.relay-devkit-panel .db-ac-table .db-ac-badge{color:var(--j-num);background:rgba(255,171,112,.12)}
.relay-devkit-panel .db-ac-column .db-ac-badge{color:var(--j-str);background:rgba(165,214,164,.12)}
.relay-devkit-panel .db-right{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.relay-devkit-panel .db-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line);flex:none}
.relay-devkit-panel .db-toolbar-left{display:flex;align-items:center;gap:8px}
.relay-devkit-panel .db-toolbar-center{flex:1}
.relay-devkit-panel .db-toolbar-right{display:flex;align-items:center;gap:5px}
.relay-devkit-panel .db-schema-sel{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:var(--r-sm);background:var(--surface);font-size:11px;color:var(--dim);cursor:pointer;border:1px solid var(--line);transition:.12s}
.relay-devkit-panel .db-schema-sel:hover{border-color:var(--line-2);color:var(--ink)}
.relay-devkit-panel .db-editor{flex:none;position:relative;border-bottom:none;overflow:hidden}
/* \u884C\u53F7 + \u9AD8\u4EAE + textarea \u5BB9\u5668 */
.relay-devkit-panel .db-editor-inner{display:flex;min-height:100%}
.relay-devkit-panel .db-gutter{flex:none;width:42px;padding:8px 6px 8px 0;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--dimmer);text-align:right;user-select:none;pointer-events:none;overflow:hidden;background:transparent;white-space:pre}
.relay-devkit-panel .db-gutter b{color:var(--dim);font-weight:400}
.relay-devkit-panel .db-editor-text{flex:1;position:relative;min-width:0}
.relay-devkit-panel .db-overlay{position:absolute;inset:0;margin:0;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:transparent;pointer-events:none;white-space:pre;overflow:hidden;background:transparent}
.relay-devkit-panel .db-editor textarea{width:100%;display:block;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--ink);background:transparent;height:100%;box-sizing:border-box;white-space:pre;overflow-wrap:normal;overflow-x:auto}
.relay-devkit-panel .db-editor textarea::placeholder{color:var(--dimmer)}
.relay-devkit-panel .db-editor textarea:focus{background:rgba(255,122,89,.02)}
.relay-devkit-panel .db-splitter{height:3px;background:var(--line);cursor:row-resize;flex:none;transition:background .15s;position:relative}
.relay-devkit-panel .db-splitter:hover,.relay-devkit-panel .db-splitter.active{background:var(--brand)}
.relay-devkit-panel .db-splitter::before{content:'';position:absolute;top:-3px;bottom:-3px;left:0;right:0}
.relay-devkit-panel .db-result{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.relay-devkit-panel .db-result-bar{display:flex;align-items:center;padding:4px 10px;border-bottom:1px solid var(--line);flex:none;gap:8px}
.relay-devkit-panel .db-result-bar .note{flex:1;font-size:11px;color:var(--dim)}
.relay-devkit-panel .db-result-bar .note strong{color:var(--j-num);font-weight:600}
.relay-devkit-panel .db-export-btn{padding:3px 8px;border-radius:var(--r-sm);color:var(--dimmer);font-size:10px;cursor:pointer;border:1px solid var(--line);transition:.12s}
.relay-devkit-panel .db-export-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}
.relay-devkit-panel .db-sb-row{display:flex;gap:8px;padding:6px 10px}
.relay-devkit-panel .db-sb-row .t-in{font-size:12px;padding:6px 10px}
.relay-devkit-panel .db-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim);white-space:nowrap}
.relay-devkit-panel .db-chip .dotc{width:8px;height:8px;border-radius:50%;background:var(--ok)}
.relay-devkit-panel .db-prev{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--ink);max-height:42vh;overflow:auto;font-family:var(--mono);transition:border-color .2s}
.relay-devkit-panel .db-prev:not(:empty){border-color:var(--warn);background:rgba(210,153,34,.04)}
.relay-devkit-panel .db-kv{display:flex;gap:10px;align-items:center;margin-bottom:9px}
.relay-devkit-panel .db-kv label{width:140px;flex:none;font-size:11px;color:var(--j-key);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .db-kv label small{color:var(--dimmer)}
.relay-devkit-panel .db-kv .t-in{font-size:12.5px;padding:8px 11px}

/* ===== \u8FDE\u63A5\u7BA1\u7406\u5668 ===== */
.relay-devkit-panel .cm{display:flex;height:100%;min-height:280px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));overflow:hidden}
.relay-devkit-panel .cm-list{width:200px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--bg-2)}
.relay-devkit-panel .cm-list-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:10px 10px 6px}
.relay-devkit-panel .cm-list-items{flex:1;overflow:auto;padding:0 4px 4px}
.relay-devkit-panel .cm-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;font-size:12px}
.relay-devkit-panel .cm-item:hover{background:var(--surface)}
.relay-devkit-panel .cm-item.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}
.relay-devkit-panel .cm-dot{width:8px;height:8px;border-radius:50%;flex:none}
.relay-devkit-panel .cm-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.relay-devkit-panel .cm-item-host{font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}
.relay-devkit-panel .cm-item-del{width:18px;height:18px;border-radius:3px;color:var(--dimmer);font-size:10px;display:none;align-items:center;justify-content:center}
.relay-devkit-panel .cm-item:hover .cm-item-del{display:inline-flex}
.relay-devkit-panel .cm-item-del:hover{background:var(--surface);color:var(--err)}
.relay-devkit-panel .cm-add{margin:6px;padding:6px 10px;border-radius:var(--r-sm);color:var(--dim);font-size:11px;border:1px dashed var(--line);text-align:center;transition:.12s;cursor:pointer}
.relay-devkit-panel .cm-add:hover{color:var(--brand);border-color:var(--brand)}
.relay-devkit-panel .cm-form{flex:1;padding:16px 20px;overflow:auto}
.relay-devkit-panel .cm-form h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:14px}
.relay-devkit-panel .cm-colors{display:flex;gap:6px;flex:1}
.relay-devkit-panel .cm-color{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:.12s}
.relay-devkit-panel .cm-color:hover{transform:scale(1.2)}
.relay-devkit-panel .cm-color.on{border-color:var(--ink);box-shadow:0 0 8px rgba(255,255,255,.2)}
.relay-devkit-panel .cm-remember{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dim);padding-left:114px;margin-bottom:8px}
.relay-devkit-panel .cm-remember input{accent-color:var(--brand);width:14px;height:14px}
.relay-devkit-panel .cm-sec{font-size:10.5px;color:var(--dimmer);padding-left:114px;margin-top:6px;line-height:1.5}
.relay-devkit-panel .cm-acts{display:flex;gap:8px;margin-top:10px;padding-left:114px}
.relay-devkit-panel .cm-btn-danger{color:var(--err);font-size:11px}
.relay-devkit-panel .cm-btn-danger:hover{text-decoration:underline}
@container (max-width:640px){ .relay-devkit-panel .cm{flex-direction:column} .relay-devkit-panel .cm-list{width:100%;max-height:150px;border-right:none;border-bottom:1px solid var(--line)} .relay-devkit-panel .cm-remember,.relay-devkit-panel .cm-acts,.relay-devkit-panel .cm-sec{padding-left:0} }

/* ============================================================
   AI \u52A9\u624B \u2014 \u72EC\u7ACB\u9875\u9762 + \u6D6E\u7A97 + \u914D\u7F6E\u9762\u677F
   ============================================================ */

/* ===== AI \u72EC\u7ACB\u9875\u9762 ===== */
.relay-devkit-panel .ai-page{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.relay-devkit-panel .ai-topbar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}
.relay-devkit-panel .ai-cfg-sel{position:relative}
.relay-devkit-panel .ai-cfg-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--r-sm);border:1px solid var(--line);font-size:12px;color:var(--ink);background:var(--surface);cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.relay-devkit-panel .ai-cfg-btn:hover{border-color:var(--line-2)}
.relay-devkit-panel .ai-cfg-menu{position:absolute;top:34px;left:0;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:90;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}
.relay-devkit-panel .ai-cfg-menu.open{display:block}
.relay-devkit-panel .ai-cfg-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--ink);transition:.12s}
.relay-devkit-panel .ai-cfg-item:hover{background:var(--surface-3)}
.relay-devkit-panel .ai-cfg-item.on{box-shadow:inset 2px 0 0 var(--brand)}
.relay-devkit-panel .ai-cfg-dot{width:8px;height:8px;border-radius:50%;flex:none}
.relay-devkit-panel .ai-ctx-toggle{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dim);cursor:pointer}
.relay-devkit-panel .ai-ctx-toggle input{accent-color:var(--brand);width:13px;height:13px}

.relay-devkit-panel .ai-main{flex:1;display:flex;min-height:0;overflow:hidden}
.relay-devkit-panel .ai-sidebar{width:220px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.relay-devkit-panel .ai-side-head{padding:10px 12px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}
.relay-devkit-panel .ai-side-list{flex:1;overflow-y:auto;padding:4px}
.relay-devkit-panel .ai-convo-item{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--dim);transition:.12s}
.relay-devkit-panel .ai-convo-item:hover{background:var(--surface-2);color:var(--ink)}
.relay-devkit-panel .ai-convo-item.on{background:var(--surface-3);color:var(--ink);box-shadow:inset 2px 0 0 var(--brand)}
.relay-devkit-panel .ai-convo-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.relay-devkit-panel .ai-convo-del{opacity:0;font-size:10px;color:var(--dimmer);padding:2px 4px;border-radius:3px;transition:.12s}
.relay-devkit-panel .ai-convo-item:hover .ai-convo-del{opacity:1}
.relay-devkit-panel .ai-convo-del:hover{color:var(--err)}

.relay-devkit-panel .ai-chat{flex:1;display:flex;flex-direction:column;min-height:0}
.relay-devkit-panel .ai-ctx-bar{padding:6px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
.relay-devkit-panel .ai-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.relay-devkit-panel .ai-empty{padding:40px 20px;text-align:center;color:var(--dimmer);font-size:13px;line-height:1.8}

/* Messages */
.relay-devkit-panel .ai-msg{padding:10px 14px;border-radius:var(--r);max-width:88%;animation:aiMsgIn .2s ease}
.relay-devkit-panel .ai-msg.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}
.relay-devkit-panel .ai-msg.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}
.relay-devkit-panel .ai-msg.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}
.relay-devkit-panel .ai-msg.error{align-self:flex-start;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:var(--err);font-size:12px}
.relay-devkit-panel .ai-msg-role{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--dimmer);margin-bottom:4px;text-transform:uppercase}
.relay-devkit-panel .ai-msg.user .ai-msg-role{color:rgba(0,0,0,.4)}
.relay-devkit-panel .ai-msg-body{font-size:13px;line-height:1.65;word-break:break-word}
.relay-devkit-panel .ai-msg-body p{margin:0 0 8px}
.relay-devkit-panel .ai-msg-body p:last-child{margin-bottom:0}
.relay-devkit-panel .ai-msg-body ul{margin:4px 0;padding-left:20px}
.relay-devkit-panel .ai-msg-body li{margin:2px 0}
.relay-devkit-panel .ai-msg-body strong{color:var(--ink)}
@keyframes aiMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* Code blocks in AI messages */
.relay-devkit-panel .ai-code-block{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;margin:6px 0;overflow-x:auto;font-size:12px;line-height:1.6;white-space:pre}
.relay-devkit-panel .ai-code-inline{background:var(--surface-3);padding:1px 5px;border-radius:3px;font-size:12px;color:var(--j-str)}

/* Input bar */
.relay-devkit-panel .ai-input-bar{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line);flex:none}
.relay-devkit-panel .ai-input{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink);resize:none;min-height:38px;max-height:120px;line-height:1.5}
.relay-devkit-panel .ai-input:focus{border-color:var(--brand)}
.relay-devkit-panel .ai-input::placeholder{color:var(--dimmer)}

/* ===== AI Config Modal ===== */
.relay-devkit-panel .ai-cfg-body{display:flex;gap:0;min-height:360px}
.relay-devkit-panel .ai-cfg-list{width:180px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column}
.relay-devkit-panel .ai-cfg-list-head{padding:10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}
.relay-devkit-panel .ai-cfg-list-items{flex:1;overflow-y:auto;padding:4px}
.relay-devkit-panel .ai-cfg-form{flex:1;padding:12px 16px;overflow-y:auto}

/* ===== AI \u6D6E\u7A97 ===== */
.relay-devkit-panel #aiFloatHost{position:fixed;z-index:110;pointer-events:none;inset:0}
.relay-devkit-panel .ai-fab{position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(255,122,89,.4);transition:.18s;z-index:110;pointer-events:auto;border:none}
.relay-devkit-panel .ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(255,122,89,.55)}

.relay-devkit-panel .ai-float{position:fixed;right:24px;bottom:80px;width:420px;height:520px;background:var(--surface);border:1px solid var(--line-2);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 24px 60px -16px rgba(0,0,0,.8);z-index:111;pointer-events:auto;animation:aiFloatIn .2s ease;overflow:hidden}
@keyframes aiFloatIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.relay-devkit-panel .ai-float-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);cursor:move;user-select:none}
.relay-devkit-panel .ai-float-title{font-family:var(--disp);font-weight:700;font-size:13px;color:var(--ink)}
.relay-devkit-panel .ai-float-cfg{font-size:11px;color:var(--dim);cursor:pointer;padding:3px 8px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.12s}
.relay-devkit-panel .ai-float-cfg:hover{border-color:var(--line-2);color:var(--ink)}
.relay-devkit-panel .ai-float-act{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);color:var(--dim);font-size:12px;cursor:pointer;transition:.12s}
.relay-devkit-panel .ai-float-act:hover{background:var(--surface-2);color:var(--ink)}
.relay-devkit-panel .ai-float-ctx{padding:5px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
.relay-devkit-panel .ai-float-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.relay-devkit-panel .ai-float-empty{padding:30px 10px;text-align:center;color:var(--dimmer);font-size:12px}
.relay-devkit-panel .ai-fm{padding:8px 11px;border-radius:var(--r);max-width:90%;font-size:12.5px;line-height:1.55;word-break:break-word;animation:aiMsgIn .2s ease}
.relay-devkit-panel .ai-fm.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}
.relay-devkit-panel .ai-fm.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}
.relay-devkit-panel .ai-fm.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}
.relay-devkit-panel .ai-fm.error{align-self:flex-start;color:var(--err);font-size:11px}
.relay-devkit-panel .ai-fm pre{margin:0;white-space:pre-wrap;font-size:11px}

.relay-devkit-panel .ai-float-input{display:flex;align-items:flex-end;gap:6px;padding:8px 10px;border-top:1px solid var(--line);flex:none}
.relay-devkit-panel .ai-float-ctx-btn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);font-size:14px;cursor:pointer;transition:.12s;flex:none;border:none}
.relay-devkit-panel .ai-float-ctx-btn:hover{background:var(--surface-2)}
.relay-devkit-panel .ai-float-text{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:7px 10px;font-size:12.5px;color:var(--ink);resize:none;min-height:32px;max-height:80px;line-height:1.4}
.relay-devkit-panel .ai-float-text:focus{border-color:var(--brand)}
.relay-devkit-panel .ai-float-text::placeholder{color:var(--dimmer)}

.relay-devkit-panel .ai-float-cfg-menu{position:absolute;top:38px;left:0;min-width:180px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:120;box-shadow:0 16px 40px -12px rgba(0,0,0,.7)}

/* ============================================================
   \u9762\u677F\u6A21\u5F0F\u8986\u76D6\uFF1A\u628A\u6240\u6709 fixed \u6D6E\u5C42\u9650\u5236\u5728\u9762\u677F\u5BB9\u5668\u5185\uFF0C\u907F\u514D\u6EA2\u51FA\u5BBF\u4E3B UI\u3002
   panel.jsx \u901A\u8FC7 setPanelMode(true) \u5728\u5BB9\u5668\u6DFB\u52A0 data-panel-mode \u5C5E\u6027\u3002
   ============================================================ */
.relay-devkit-panel .cell-tip,
.relay-devkit-panel .modal-bg,
.relay-devkit-panel .toast,
.relay-devkit-panel .db-ctx,
.relay-devkit-panel .db-ac,
.relay-devkit-panel #aiFloatHost,
.relay-devkit-panel .ai-fab,
.relay-devkit-panel .ai-float{position:absolute}
.relay-devkit-panel .ai-fab{right:14px;bottom:14px}
.relay-devkit-panel .ai-float{right:14px;bottom:60px;width:min(420px, calc(100% - 28px));max-height:calc(100% - 80px);height:auto}
`;

// src/core/dom.js
var _root = document;
function setRoot(el2) {
  _root = el2 || document;
}
function getRoot() {
  return _root;
}
var $ = (s, r = _root) => r.querySelector(s);
var $$ = (s, r = _root) => [...r.querySelectorAll(s)];
var uid = () => "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
var METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
var bytes = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB";
var ms = (n) => n < 1e3 ? Math.round(n) + " ms" : (n / 1e3).toFixed(2) + " s";
var methodColor = (m) => "m-" + m;
var statusTimer = null;
function setStatus(msg, kind) {
  const m = $("#statusMsg");
  if (!m) return;
  m.textContent = msg;
  m.className = "msg" + (kind ? " " + kind : "");
  clearTimeout(statusTimer);
  if (kind) statusTimer = setTimeout(() => {
    m.className = "msg";
    m.textContent = "\u5C31\u7EEA \xB7 \u7EAF\u524D\u7AEF\u8FD0\u884C\uFF0C\u8DE8\u57DF\u8BF7\u6C42\u53D7\u6D4F\u89C8\u5668 CORS \u7B56\u7565\u9650\u5236";
  }, 4500);
}
function toast(html) {
  const t = $("#toast");
  if (!t) return;
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 1500);
}
async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = el("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (_) {
    }
    ta.remove();
  }
  toast((label || "\u5DF2\u590D\u5236") + " <b>\u2713</b>");
}
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// src/core/router.js
var _views = [];
function registerView(v) {
  const idx = _views.findIndex((x) => x.id === v.id);
  const entry = Object.assign({ inited: false }, v);
  if (idx >= 0) _views[idx] = entry;
  else _views.push(entry);
}
function resetRouter() {
  _views.length = 0;
  _cur = null;
  _panelHash = "#/api";
  _panelChangeCb = null;
}
var _cur = null;
var _panelMode = false;
var _panelHash = "#/api";
var _panelChangeCb = null;
function currentView() {
  return _cur;
}
function setPanelMode(on, onChange) {
  _panelMode = !!on;
  _panelChangeCb = onChange || null;
}
function viewElId(id) {
  return "#view" + id.charAt(0).toUpperCase() + id.slice(1);
}
function applyRoute() {
  let hash = _panelMode ? _panelHash : location.hash;
  let id = (hash.match(/^#\/(\w+)/) || [])[1] || "api";
  if (!_views.some((v2) => v2.id === id)) id = "api";
  _cur = id;
  $$("#view > .view").forEach((x) => x.classList.remove("on"));
  const elx = $(viewElId(id));
  if (elx) elx.classList.add("on");
  const v = _views.find((x) => x.id === id);
  if (v && v.init && !v.inited) {
    v.init();
    v.inited = true;
  }
}
function startRouter() {
  if (!_panelMode) {
    window.addEventListener("hashchange", applyRoute);
  }
  applyRoute();
}

// src/core/json-view.js
var _persist = () => {
};
var _rerender = () => {
};
function configureViewHost(opts) {
  if (opts && opts.persist) _persist = opts.persist;
  if (opts && opts.rerender) _rerender = opts.rerender;
}
var _cellCtx = null;
function closeCellCtx() {
  if (_cellCtx) {
    _cellCtx.remove();
    _cellCtx = null;
  }
  document.removeEventListener("click", closeCellCtx);
  document.removeEventListener("keydown", cellCtxEsc);
}
function cellCtxEsc(e) {
  if (e.key === "Escape") closeCellCtx();
}
function getByPath(data, path) {
  if (!path || !path.trim()) return { ok: true, value: data };
  const parts = path.replace(/\[(\w+)\]/g, ".$1").split(".").map((s) => s.trim()).filter((s) => s !== "");
  let cur = data;
  for (const p of parts) {
    if (cur == null) return { ok: false };
    if (Array.isArray(cur)) {
      const i = Number(p);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { ok: false };
      cur = cur[i];
    } else if (typeof cur === "object") {
      if (!(p in cur)) return { ok: false };
      cur = cur[p];
    } else return { ok: false };
  }
  return { ok: true, value: cur };
}
function collectPaths(root) {
  const out = [], seen = /* @__PURE__ */ new Set();
  const push = (p, v) => {
    if (seen.has(p)) return;
    seen.add(p);
    let kind = "value", count;
    if (Array.isArray(v)) {
      kind = "array";
      count = v.length;
    } else if (v && typeof v === "object") {
      kind = "object";
      count = Object.keys(v).length;
    }
    out.push({ path: p, kind, count });
  };
  const walk = (v, path, depth) => {
    if (out.length > 250) return;
    if (Array.isArray(v)) {
      if (v.length) {
        const ep = path ? path + "[0]" : "[0]";
        push(ep, v[0]);
        if (v[0] && typeof v[0] === "object" && depth < 4) walk(v[0], ep, depth + 1);
      }
    } else if (v && typeof v === "object") {
      for (const k of Object.keys(v)) {
        const p = path ? path + "." + k : k;
        push(p, v[k]);
        if (v[k] && typeof v[k] === "object" && depth < 4) walk(v[k], p, depth + 1);
      }
    }
  };
  push("", root);
  walk(root, "", 0);
  return out;
}
var wrapOn = false;
function toggleRawWrap() {
  wrapOn = !wrapOn;
  return wrapOn;
}
function viewRaw(r, data) {
  let html;
  if (data !== void 0) {
    html = hlJSON(JSON.stringify(data, null, 2));
  } else if (r.isBinary) {
    html = esc(`[\u4E8C\u8FDB\u5236\u5185\u5BB9 \xB7 ${r.contentType} \xB7 ${bytes(r.size)}]`);
  } else html = esc(r.text);
  return el("pre", "raw" + (wrapOn ? " wrap" : ""), html);
}
function hlJSON(s) {
  return esc(s).replace(
    /(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+\.?\d*(?:[eE][+\-]?\d+)?)/g,
    (m, str, colon, bool, num) => {
      if (str != null) return `<span class="${colon ? "tok-key" : "tok-str"}">${str}</span>${colon || ""}`;
      if (bool != null) return `<span class="tok-bool">${bool}</span>`;
      if (num != null) return `<span class="tok-num">${num}</span>`;
      return `<span class="tok-null">null</span>`;
    }
  );
}
function parseFilter(raw) {
  if (!raw || !raw.trim()) return { ast: [], plainText: "" };
  const ast = [];
  let plainText = null;
  const tokens = [];
  let buf = "", inQ = false, qCh = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQ) {
      if (ch === qCh) {
        inQ = false;
      } else buf += ch;
    } else if (ch === '"' || ch === "'") {
      inQ = true;
      qCh = ch;
    } else if (ch === " ") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
    } else buf += ch;
  }
  if (buf) tokens.push(buf);
  const OPS_RE = /^(-?)([*\w.一-鿿-]+)(:|=|==|~|>=|>|<=|<)([\s\S]*)$/;
  for (const tok of tokens) {
    const m = tok.match(OPS_RE);
    if (!m) {
      if (tok.startsWith("-") && tok.length > 1) {
        ast.push({ type: "text", value: tok.slice(1), negated: true });
      } else {
        ast.push({ type: "text", value: tok, negated: false });
        plainText = plainText === null ? tok : plainText + " " + tok;
      }
      continue;
    }
    const [_, neg, field, op, value] = m;
    const negated = neg === "-";
    if (op === ":" && value.startsWith("/") && value.endsWith("/") && value.length > 1) {
      try {
        const rx = new RegExp(value.slice(1, -1), "i");
        ast.push({ type: "field", field, op: "~", regex: rx, negated });
      } catch (e) {
        ast.push({ type: "text", value: tok, negated: false });
      }
      continue;
    }
    if (op === "~") {
      try {
        const src = value.startsWith("/") && value.endsWith("/") ? value.slice(1, -1) : value;
        const rx = new RegExp(src, "i");
        ast.push({ type: "field", field, op: "~", regex: rx, negated });
      } catch (e) {
        ast.push({ type: "text", value: tok, negated: false });
      }
      continue;
    }
    if (op === ">" || op === ">=" || op === "<" || op === "<=") {
      const n = Number(value);
      if (!isNaN(n)) {
        ast.push({ type: "field", field, op, numValue: n, negated });
        continue;
      }
      ast.push({ type: "text", value: tok, negated: false });
      plainText = plainText === null ? tok : plainText + " " + tok;
      continue;
    }
    if (op === "=" || op === "==") {
      if (value === "true") {
        ast.push({ type: "field", field, op: "=", boolValue: true, negated });
      } else if (value === "false") {
        ast.push({ type: "field", field, op: "=", boolValue: false, negated });
      } else if (value === "null") {
        ast.push({ type: "field", field, op: "=", nullValue: true, negated });
      } else {
        const n = Number(value);
        if (!isNaN(n) && String(n) === value) ast.push({ type: "field", field, op: "=", numValue: n, negated });
        else ast.push({ type: "field", field, op: "=", value, negated });
      }
      continue;
    }
    if (op === ":") {
      if (value.startsWith("-") && value.length > 1) {
        ast.push({ type: "field", field, op: ":", value: value.slice(1), negated: true });
      } else if (field === "*") {
        ast.push({ type: "wildcard", op: ":", value, negated });
      } else {
        ast.push({ type: "field", field, op: ":", value, negated });
      }
      continue;
    }
  }
  const hasFieldOps = ast.some((n) => n.type === "field" || n.type === "wildcard");
  if (hasFieldOps) plainText = null;
  return { ast, plainText: plainText || null };
}
function matchCond(val, node) {
  if (node.type === "text") {
    const hit = String(val == null ? "" : typeof val === "object" ? JSON.stringify(val) : val).toLowerCase().includes(node.value.toLowerCase());
    return node.negated ? !hit : hit;
  }
  if (node.type === "wildcard") {
    if (val && typeof val === "object") {
      const en = Array.isArray(val) ? Object.values(val) : Object.values(val);
      const hit2 = en.some((v2) => String(v2 == null ? "" : typeof v2 === "object" ? JSON.stringify(v2) : v2).toLowerCase().includes(node.value.toLowerCase()));
      return node.negated ? !hit2 : hit2;
    }
    const hit = String(val == null ? "" : val).toLowerCase().includes(node.value.toLowerCase());
    return node.negated ? !hit : hit;
  }
  const { field, op, negated } = node;
  let v = val;
  if (op === ":") {
    const hit = String(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v).toLowerCase().includes(node.value.toLowerCase());
    return negated ? !hit : hit;
  }
  if (op === "=") {
    if (node.boolValue !== void 0) {
      const hit2 = v === true || v === false ? v === node.boolValue : String(v).toLowerCase() === "" + node.boolValue;
      return negated ? !hit2 : hit2;
    }
    if (node.nullValue) {
      const hit2 = v === null;
      return negated ? !hit2 : hit2;
    }
    if (node.numValue !== void 0) {
      const hit2 = typeof v === "number" ? v === node.numValue : Number(v) === node.numValue;
      return negated ? !hit2 : hit2;
    }
    const hit = String(v == null ? "" : v) === node.value;
    return negated ? !hit : hit;
  }
  if (op === "~") {
    try {
      const hit = node.regex.test(String(v == null ? "" : v));
      return negated ? !hit : hit;
    } catch (e) {
      return false;
    }
  }
  if (op === ">" || op === ">=" || op === "<" || op === "<=") {
    const nv = typeof v === "number" ? v : Number(v);
    if (isNaN(nv)) return false;
    let hit;
    if (op === ">") hit = nv > node.numValue;
    else if (op === ">=") hit = nv >= node.numValue;
    else if (op === "<") hit = nv < node.numValue;
    else hit = nv <= node.numValue;
    return negated ? !hit : hit;
  }
  return true;
}
function matchRow(obj, ast, fieldKey) {
  if (!ast.length) return true;
  for (const node of ast) {
    if (node.type === "text" || node.type === "wildcard") {
      if (!matchCond(obj, node)) return false;
      continue;
    }
    if (node.type === "field") {
      const fv = obj && typeof obj === "object" && !Array.isArray(obj) ? obj[node.field] : void 0;
      if (fv === void 0) {
        if (!matchCond(obj, node)) return false;
      } else {
        if (!matchCond(fv, node)) return false;
      }
    }
  }
  return true;
}
function matchTreeNode(key, val, ast) {
  if (!ast.length) return true;
  for (const node of ast) {
    if (node.type === "text") {
      if (matchTextRecursive(key, val, node.value, node.negated)) continue;
      return false;
    }
    if (node.type === "wildcard") {
      if (matchWildcardRecursive(key, val, node.value, node.negated)) continue;
      return false;
    }
    if (node.type === "field") {
      if (matchFieldRecursive(key, val, node)) continue;
      return false;
    }
  }
  return true;
}
function matchTextRecursive(key, val, q, negated) {
  const ql = q.toLowerCase();
  let hit = false;
  if (key != null && String(key).toLowerCase().includes(ql)) hit = true;
  if (!hit) {
    if (val && typeof val === "object") {
      const en = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
      hit = en.some(([k, v]) => matchTextRecursive(k, v, q, false));
    } else {
      hit = String(val == null ? "" : val).toLowerCase().includes(ql);
    }
  }
  return negated ? !hit : hit;
}
function matchWildcardRecursive(key, val, q, negated) {
  const ql = q.toLowerCase();
  let hit = false;
  if (val && typeof val === "object") {
    const en = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
    hit = en.some(([k, v]) => {
      if (String(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v).toLowerCase().includes(ql)) return true;
      if (v && typeof v === "object") return matchWildcardRecursive(k, v, q, false);
      return false;
    });
  } else {
    hit = String(val == null ? "" : val).toLowerCase().includes(ql);
  }
  return negated ? !hit : hit;
}
function matchFieldRecursive(key, val, node) {
  const { field, op, negated } = node;
  if (key != null && String(key).toLowerCase() === field.toLowerCase()) {
    if (matchCond(val, node)) return true;
  }
  if (val && typeof val === "object") {
    const en = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
    return en.some(([k, v]) => matchFieldRecursive(k, v, node));
  }
  return false;
}
function astHighlightTerms(ast) {
  const terms = [];
  for (const n of ast) {
    if (n.type === "text") terms.push(n.value);
    else if (n.type === "wildcard") terms.push(n.value);
    else if (n.type === "field" && n.op === ":") terms.push(n.value);
    else if (n.type === "field" && n.op === "=" && n.value) terms.push(n.value);
  }
  return terms;
}
function hlTextMulti(s, terms) {
  if (!terms.length) return esc(s);
  let html = esc(s);
  const lower = html.toLowerCase();
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const marks = [];
  for (const t of sorted) {
    const tl = t.toLowerCase();
    let pos = 0;
    while (true) {
      const idx = lower.indexOf(tl, pos);
      if (idx < 0) break;
      marks.push({ s: idx, e: idx + tl.length });
      pos = idx + tl.length;
    }
  }
  if (!marks.length) return html;
  marks.sort((a, b) => a.s - b.s);
  const merged = [marks[0]];
  for (let i = 1; i < marks.length; i++) {
    const last = merged[merged.length - 1];
    if (marks[i].s <= last.e) last.e = Math.max(last.e, marks[i].e);
    else merged.push(marks[i]);
  }
  for (let i = merged.length - 1; i >= 0; i--) {
    const { s: s2, e } = merged[i];
    html = html.slice(0, s2) + '<span class="hl">' + html.slice(s2, e) + "</span>" + html.slice(e);
  }
  return html;
}
function columnPicker(cols, hiddenSet, isOpen, onChange) {
  const hidden = new Set(Object.keys(hiddenSet || {}));
  const vis = cols.filter((c) => !hidden.has(c)).length;
  const open = !!isOpen;
  const bar = el("div", "col-picker" + (open ? "" : " collapsed"));
  const arrow = () => open ? "\u25BE" : "\u25B8";
  const toggle = el("button", "col-toggle");
  toggle.type = "button";
  toggle.textContent = `\u5217 \xB7 ${vis}/${cols.length} ${arrow()}`;
  toggle.onclick = () => {
    const now = !bar.classList.contains("collapsed");
    bar.classList.toggle("collapsed", now);
    toggle.textContent = `\u5217 \xB7 ${vis}/${cols.length} ${now ? "\u25B8" : "\u25BE"}`;
    if (onChange._saveOpen) onChange._saveOpen(!now);
  };
  bar.appendChild(toggle);
  const body = el("div", "col-body");
  const allBtn = el("button", "col-q", "\u5168\u9009");
  allBtn.type = "button";
  const noneBtn = el("button", "col-q", "\u5168\u4E0D\u9009");
  noneBtn.type = "button";
  allBtn.onclick = () => onChange({});
  noneBtn.onclick = () => {
    const h = {};
    cols.forEach((c) => h[c] = true);
    onChange(h);
  };
  body.append(allBtn, noneBtn);
  cols.forEach((c) => {
    const on = !hidden.has(c);
    const chip = el("button", "col-chip" + (on ? " on" : ""));
    chip.type = "button";
    chip.textContent = c;
    chip.draggable = true;
    chip.onclick = () => {
      const h = { ...hiddenSet || {} };
      if (h[c]) delete h[c];
      else h[c] = true;
      onChange(h);
    };
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", c);
      e.dataTransfer.effectAllowed = "move";
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    chip.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      chip.classList.add("drag-over");
    });
    chip.addEventListener("dragleave", () => chip.classList.remove("drag-over"));
    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      chip.classList.remove("drag-over");
      const from = e.dataTransfer.getData("text/plain");
      if (!from || from === c) return;
      const order = [...cols];
      order.splice(order.indexOf(from), 1);
      order.splice(order.indexOf(c), 0, from);
      onChange({ ...hiddenSet || {} }, order);
    });
    body.appendChild(chip);
  });
  bar.appendChild(body);
  return bar;
}
function viewObject(data, t) {
  const host = el("div", "jtree");
  if (data === void 0) {
    host.innerHTML = '<span class="dimnote">\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u65E0\u6CD5\u4EE5\u5BF9\u8C61\u6811\u5C55\u793A\u3002\u8BF7\u5207\u5230\u300C\u539F\u59CB\u300D\u3002</span>';
    return host;
  }
  const raw = (t.respFilter || "").trim();
  const { ast, plainText } = parseFilter(raw);
  const q = plainText !== null ? plainText.toLowerCase() : raw ? raw.toLowerCase() : "";
  const hlTerms = astHighlightTerms(ast);
  const opt = { q, ast, hlTerms, pretty: t.prettyCells !== false, openAll: t.treeOpen || "auto" };
  const node = jsonNode(null, data, 0, opt);
  if (node) host.appendChild(node);
  else host.innerHTML = '<div class="dimnote">\u65E0\u5339\u914D\u300C' + esc(q) + "\u300D\u7684\u5B57\u6BB5\u3002</div>";
  return host;
}
function treeKeep(key, val, q) {
  if (!q) return true;
  if (key != null && String(key).toLowerCase().includes(q)) return true;
  if (val && typeof val === "object") {
    const en = Array.isArray(val) ? val.map((v, i) => [i, v]) : Object.entries(val);
    return en.some(([k, v]) => treeKeep(k, v, q));
  }
  return String(val).toLowerCase().includes(q);
}
function hlText(s, q) {
  s = esc(s);
  if (!q) return s;
  const i = s.toLowerCase().indexOf(q);
  if (i < 0) return s;
  return s.slice(0, i) + '<span class="hl">' + s.slice(i, i + q.length) + "</span>" + s.slice(i + q.length);
}
function valSpan(v, q, key, pretty, hlTerms) {
  if (v === null) return `<span class="jt-null">null</span>`;
  const ty = typeof v;
  if (pretty && ty === "string" && isImgUrl(v)) {
    return `<img class="cell-img" src="${esc(v)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('\u{1F5BC}'))"><span class="cell-imn">${esc(fileName(v))}</span>`;
  }
  if (pretty) {
    const ts = tsInfo(key, v);
    if (ts) return `<span class="cell-ts">\u{1F553} ${esc(fmtDate(ts.date))}</span> <span class="jt-prev">(${esc(plainVal(v))})</span>`;
  }
  if (ty === "string") return `<span class="jt-str">"${hlTerms && hlTerms.length ? hlTextMulti(v, hlTerms) : hlText(v, q)}"</span>`;
  if (ty === "number") return `<span class="jt-num">${hlTerms && hlTerms.length ? hlTextMulti(String(v), hlTerms) : hlText(String(v), q)}</span>`;
  if (ty === "boolean") return `<span class="jt-bool">${v}</span>`;
  return esc(String(v));
}
function jsonNode(key, val, depth, opt) {
  const q = opt.q;
  const ast = opt.ast;
  if (ast && ast.length) {
    if (!matchTreeNode(key, val, ast)) return null;
  } else if (q && !treeKeep(key, val, q)) return null;
  const node = el("div", "jt-node");
  const isObj = val && typeof val === "object";
  const hlT = opt.hlTerms;
  const keyHTML = key != null ? `<span class="jt-key">${hlT && hlT.length ? hlTextMulti(String(key), hlT) : hlText(String(key), q)}</span><span class="jt-colon">: </span>` : "";
  if (!isObj) {
    const row2 = el("div", "jt-row");
    row2.innerHTML = keyHTML + valSpan(val, q, key, opt.pretty, hlT) + `<span class="jt-act"><b data-act="copy">copy</b></span>`;
    row2.querySelector("[data-act=copy]").onclick = () => copy(typeof val === "string" ? val : JSON.stringify(val), "\u5DF2\u590D\u5236");
    node.appendChild(row2);
    return node;
  }
  const arr = Array.isArray(val);
  const entries = arr ? val.map((v, i) => [i, v]) : Object.entries(val);
  const open = opt.openAll === "all" ? true : opt.openAll === "none" ? false : q ? true : depth < 1;
  const prev = arr ? `[\u2026] ${entries.length} \u9879` : `{\u2026} ${entries.length} \u952E`;
  const row = el("div", "jt-row expandable");
  row.innerHTML = `<span class="jt-tog">${open ? "\u25BE" : "\u25B8"}</span>${keyHTML}<span class="jt-prev">${arr ? "[" : "{"}</span><span class="jt-prev" data-prev>${open ? "" : " " + prev + " "}</span><span class="jt-act"><b data-act="copy">copy</b></span>`;
  const children = el("div", "jt-children" + (open ? "" : " hide"));
  entries.forEach(([k, v]) => {
    const c = jsonNode(k, v, depth + 1, opt);
    if (c) children.appendChild(c);
  });
  const tail = el("div", "jt-row");
  tail.innerHTML = `<span class="jt-prev" style="padding-left:0">${arr ? "]" : "}"}</span>`;
  children.appendChild(tail);
  const tog = row.querySelector(".jt-tog"), prevEl = row.querySelector("[data-prev]");
  row.addEventListener("click", (e) => {
    if (e.target.dataset.act) return;
    const hid = children.classList.toggle("hide");
    tog.textContent = hid ? "\u25B8" : "\u25BE";
    prevEl.textContent = hid ? " " + prev + " " : "";
  });
  row.querySelector("[data-act=copy]").onclick = (e) => {
    e.stopPropagation();
    copy(JSON.stringify(val, null, 2), "\u8282\u70B9\u5DF2\u590D\u5236");
  };
  node.append(row, children);
  return node;
}
var IMG_URL_RE = /^(?:https?:)?\/\/[^\s'"]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#][^\s'"]*)?$/i;
function isImgUrl(s) {
  if (typeof s !== "string") return false;
  s = s.trim();
  return /^data:image\//i.test(s) || IMG_URL_RE.test(s);
}
function keyIsTime(key) {
  if (key == null) return false;
  return /(_at\b|\bat$|date|time|timestamp|\bts\b|created|updated|modified|expire|publish|issued|deleted|lastseen|lastlogin|epoch)/i.test(String(key));
}
function tsInfo(key, v) {
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(s)) {
      const d = new Date(s);
      if (!isNaN(+d)) return { date: d };
    }
    if (keyIsTime(key) && /^\d{10}$|^\d{13}$/.test(s)) {
      const n = Number(s);
      const d = new Date(s.length === 13 ? n : n * 1e3);
      if (!isNaN(+d)) return { date: d };
    }
    return null;
  }
  if (typeof v === "number" && keyIsTime(key) && isFinite(v)) {
    if (v >= 1e12 && v < 4e12) return { date: new Date(v) };
    if (v >= 1e9 && v < 4e9) return { date: new Date(v * 1e3) };
  }
  return null;
}
function fileName(u) {
  if (/^data:/i.test(u)) return "\u5185\u5D4C\u56FE\u7247";
  try {
    const x = new URL(u, location.href);
    return decodeURIComponent(x.pathname.split("/").pop() || u).slice(0, 42);
  } catch (e) {
    return String(u).split(/[?#]/)[0].split("/").pop().slice(0, 42);
  }
}
function plainVal(v) {
  return v === null ? "null" : v === void 0 ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}
function richValue(v, q, key, pretty, hlTerms) {
  const full = plainVal(v);
  if (v === null) return { html: '<span class="cell-null">null</span>', full };
  if (v === void 0) return { html: '<span class="cell-null">\u2014</span>', full: "" };
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return { html: `<span class="cobj">${esc(s)}</span>`, full: s };
  }
  if (pretty && typeof v === "string" && isImgUrl(v)) {
    return { html: `<img class="cell-img" src="${esc(v)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="cell-imn">${esc(fileName(v))}</span>`, full: v };
  }
  if (pretty) {
    const ts = tsInfo(key, v);
    if (ts) return { html: `<span class="cell-ts">\u{1F553} ${esc(fmtDate(ts.date))}</span>`, full: full + "  \xB7  " + fmtDate(ts.date) };
  }
  const hl = hlTerms && hlTerms.length ? hlTextMulti(String(v), hlTerms) : hlText(String(v), q);
  if (typeof v === "number") return { html: `<span class="cell-num">${hl}</span>`, full };
  if (typeof v === "boolean") return { html: `<span class="cell-bool">${v}</span>`, full };
  return { html: `<span class="cell-str">${hl}</span>`, full };
}
function tableCandidates(data) {
  const out = [];
  if (Array.isArray(data)) {
    out.push({ label: "\u6839\u6570\u7EC4", path: "", data, count: data.length });
    return out;
  }
  if (data && typeof data === "object") {
    const scan = (obj, prefix, depth) => {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? prefix + "." + k : k;
        if (Array.isArray(v)) out.push({ label: path, path, data: v, count: v.length });
        else if (v && typeof v === "object" && depth < 1) scan(v, path, depth + 1);
      }
    };
    scan(data, "", 0);
    out.push({ label: "\u5BF9\u8C61\u672C\u8EAB(\u952E\u503C)", path: "__self", data, count: Object.keys(data).length });
  }
  return out;
}
function rowMatches(obj, q) {
  if (!q) return true;
  return Object.values(obj).some((v) => String(typeof v === "object" ? JSON.stringify(v) : v).toLowerCase().includes(q));
}
function rowMatchesAST(obj, ast, q) {
  if (!ast.length && !q) return true;
  if (ast.length) return matchRow(obj, ast);
  return rowMatches(obj, q);
}
function viewTable(data, t) {
  const host = el("div", "tbl-host");
  const cands = tableCandidates(data);
  let sel = cands.find((c) => c.path === t.tableSel) || cands[0];
  if (cands.length > 1) {
    const bar = el("div", "tbl-cands");
    bar.appendChild(el("span", "lab", "\u8868\u683C"));
    cands.forEach((c) => {
      const chip = el("button", "tcand" + (c === sel ? " on" : ""), `${esc(c.label)} <em>${c.count}</em>`);
      chip.onclick = () => {
        t.tableSel = c.path;
        _persist();
        (t.rerender || _rerender)();
      };
      bar.appendChild(chip);
    });
    host.appendChild(bar);
  }
  if (!sel) {
    host.appendChild(el("div", "prev-none", "\u65E0\u53EF\u8868\u683C\u5316\u7684\u6570\u636E\u3002"));
    return host;
  }
  const raw = (t.respFilter || "").trim();
  const { ast, plainText } = parseFilter(raw);
  const q = plainText !== null ? plainText.toLowerCase() : raw.toLowerCase();
  const hlTerms = astHighlightTerms(ast);
  const pretty = t.prettyCells !== false;
  const pathKey = sel.path || "__root";
  const wrap = el("div", "tbl-wrap");
  const d = sel.data;
  const tbl = el("table", "dt");
  const thead = el("thead"), tbody = el("tbody");
  const cell = (v, key) => {
    const rv = richValue(v, q, key, pretty, hlTerms);
    return `<td data-full="${esc(rv.full)}">${rv.html}</td>`;
  };
  const sortCfg = t.sort && t.sort[pathKey] || null;
  let note = "";
  if (Array.isArray(d) && sel.path !== "__self") {
    const objs = d.length && d.every((x) => x && typeof x === "object" && !Array.isArray(x));
    if (objs) {
      let cols = [];
      d.forEach((o) => Object.keys(o).forEach((k) => {
        if (!cols.includes(k)) cols.push(k);
      }));
      const savedOrder = t.colOrder && t.colOrder[pathKey] || [];
      if (savedOrder.length) {
        const ordered = savedOrder.filter((c) => cols.includes(c));
        const rest = cols.filter((c) => !savedOrder.includes(c));
        cols = ordered.concat(rest);
      }
      const hiddenSet = t.hiddenCols && t.hiddenCols[pathKey] || {};
      const visibleCols = cols.filter((c) => !hiddenSet[c]);
      if (cols.length >= 4) {
        const pickerOpen = !!(t._pickerOpen && t._pickerOpen[pathKey]);
        const cb = (h, order) => {
          if (!t.hiddenCols) t.hiddenCols = {};
          t.hiddenCols[pathKey] = h;
          if (order) {
            if (!t.colOrder) t.colOrder = {};
            t.colOrder[pathKey] = order;
          }
          _persist();
          (t.rerender || _rerender)();
        };
        cb._saveOpen = (v) => {
          if (!t._pickerOpen) t._pickerOpen = {};
          t._pickerOpen[pathKey] = v;
        };
        host.appendChild(columnPicker(cols, hiddenSet, pickerOpen, cb));
      }
      const filtered = [];
      d.forEach((o, i) => {
        if (rowMatchesAST(o, ast, q)) filtered.push({ o, i });
      });
      let sorted = filtered;
      if (sortCfg && sortCfg.col) {
        const { col, dir } = sortCfg;
        sorted = [...filtered].sort((a, b) => {
          const va = a.o[col], vb = b.o[col];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
          const cmp = String(va).localeCompare(String(vb));
          return dir === "asc" ? cmp : -cmp;
        });
      }
      thead.innerHTML = '<tr><th class="idx">#</th>' + visibleCols.map((c) => {
        let cls = "";
        let arrow = "";
        if (sortCfg && sortCfg.col === c) {
          cls = sortCfg.dir === "asc" ? " sort-asc" : " sort-desc";
          arrow = sortCfg.dir === "asc" ? " \u25B2" : " \u25BC";
        }
        return `<th class="sortable${cls}" data-col="${esc(c)}">${esc(c)}${arrow}</th>`;
      }).join("") + "</tr>";
      thead.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-col]");
        if (!th) return;
        const col = th.dataset.col;
        if (!t.sort) t.sort = {};
        const cur = t.sort[pathKey];
        let newDir = "asc";
        if (cur && cur.col === col) {
          newDir = cur.dir === "asc" ? "desc" : cur.dir === "desc" ? null : "asc";
        }
        if (newDir) t.sort[pathKey] = { col, dir: newDir };
        else delete t.sort[pathKey];
        _persist();
        (t.rerender || _rerender)();
      });
      sorted.forEach(({ o, i }) => {
        const tr = el("tr");
        tr.innerHTML = `<td class="idx">${i}</td>` + visibleCols.map((c) => cell(o[c], c)).join("");
        tbody.appendChild(tr);
      });
      const totalCols = visibleCols.length;
      note = `\u6570\u7EC4 \xB7 ${sorted.length}/${d.length} \u884C \xD7 ${totalCols} \u5217`;
      if (q || raw) note += ` \xB7 \u8FC7\u6EE4\u300C${esc(raw)}\u300D`;
      if (sortCfg && sortCfg.col) note += ` \xB7 \u6309 ${sortCfg.col} ${sortCfg.dir === "asc" ? "\u5347\u5E8F" : "\u964D\u5E8F"}`;
      if (visibleCols.length < cols.length) note += ` \xB7 \u9690\u85CF ${cols.length - visibleCols.length} \u5217`;
    } else {
      thead.innerHTML = '<tr><th class="idx">#</th><th>value</th></tr>';
      let shown = 0;
      d.forEach((v, i) => {
        const sv = String(typeof v === "object" ? JSON.stringify(v) : v).toLowerCase();
        let keep = true;
        if (ast.length) {
          keep = matchCond(v, ast[0]) && ast.slice(1).every((n) => matchCond(v, n));
        } else if (q && !sv.includes(q)) keep = false;
        if (!keep) return;
        shown++;
        const tr = el("tr");
        tr.innerHTML = `<td class="idx">${i}</td>` + cell(v, null);
        tbody.appendChild(tr);
      });
      note = `\u6570\u7EC4 \xB7 ${shown}/${d.length} \u9879\uFF08\u57FA\u7840/\u6DF7\u5408\u7C7B\u578B\uFF09`;
    }
  } else {
    thead.innerHTML = "<tr><th>key</th><th>value</th></tr>";
    let shown = 0, tot = 0;
    Object.entries(d).forEach(([k, v]) => {
      tot++;
      let keep = true;
      if (ast.length) {
        for (const node of ast) {
          if (node.type === "field") {
            if (String(k).toLowerCase() === (node.field || "").toLowerCase()) {
              if (!matchCond(v, node)) {
                keep = false;
                break;
              }
            } else {
              if (!matchCond(v, node) && !matchTextRecursive(k, v, node.type === "text" ? node.value : node.value || "", node.negated)) {
                keep = false;
                break;
              }
            }
          } else {
            if (!matchTextRecursive(k, v, node.type === "text" ? node.value : node.value || "", node.negated)) {
              keep = false;
              break;
            }
          }
        }
      } else if (q && !(k.toLowerCase().includes(q) || String(typeof v === "object" ? JSON.stringify(v) : v).toLowerCase().includes(q))) keep = false;
      if (!keep) return;
      shown++;
      const tr = el("tr");
      tr.innerHTML = `<td style="color:var(--j-key)">${hlTerms && hlTerms.length ? hlTextMulti(k, hlTerms) : hlText(k, q)}</td>` + cell(v, k);
      tbody.appendChild(tr);
    });
    note = `\u5BF9\u8C61 \xB7 ${shown}/${tot} \u4E2A\u5B57\u6BB5`;
  }
  tbl.append(thead, tbody);
  addColResize(tbl, t, pathKey);
  tbl.addEventListener("contextmenu", (e) => {
    const td = e.target.closest("td");
    if (!td || td.classList.contains("idx")) return;
    e.preventDefault();
    closeCellCtx();
    const tip = $("#cellTip");
    if (tip) tip.classList.remove("show");
    const menu = el("div", "db-ctx");
    _cellCtx = menu;
    function item(label, action) {
      const b = el("button", "db-ctx-item", label);
      b.onclick = (ev) => {
        ev.stopPropagation();
        closeCellCtx();
        action();
      };
      menu.appendChild(b);
    }
    function sep() {
      menu.appendChild(el("div", "db-ctx-sep"));
    }
    const val = td.dataset.full != null ? td.dataset.full : td.textContent;
    item("\u590D\u5236\u503C", () => copy(val, "\u5DF2\u590D\u5236"));
    const ci = td.cellIndex, hr = thead.rows[0], thCell = hr && hr.cells[ci];
    if (thCell && thCell.dataset.col) {
      sep();
      item("\u590D\u5236\u5217\u540D", () => copy(thCell.dataset.col, "\u5DF2\u590D\u5236\u5217\u540D"));
    }
    getRoot().appendChild(menu);
    requestAnimationFrame(() => {
      document.addEventListener("click", closeCellCtx);
      document.addEventListener("keydown", cellCtxEsc);
    });
    const mw = menu.offsetWidth, mh = menu.offsetHeight, vw = innerWidth, vh = innerHeight, pad = 6;
    menu.style.left = (e.clientX + mw + pad > vw ? Math.max(pad, e.clientX - mw - pad) : e.clientX + pad) + "px";
    menu.style.top = (e.clientY + mh + pad > vh ? Math.max(pad, e.clientY - mh - pad) : e.clientY + pad) + "px";
  });
  if (note) host.appendChild(el("div", "tbl-note", note));
  wrap.appendChild(tbl);
  host.appendChild(wrap);
  return host;
}
function addColResize(tbl, t, pathKey) {
  if (!t.colW) t.colW = {};
  const head = tbl.tHead;
  if (!head || !head.rows.length) return;
  const ths = [...head.rows[0].cells];
  const colg = el("colgroup");
  ths.forEach(() => colg.appendChild(el("col")));
  tbl.insertBefore(colg, head);
  const cols = [...colg.children];
  const stored = t.colW[pathKey];
  if (stored) {
    tbl.style.tableLayout = "fixed";
    ths.forEach((th, i) => {
      if (stored[i] != null) cols[i].style.width = stored[i] + "px";
    });
  }
  ths.forEach((th, i) => {
    const grip = el("span", "col-grip");
    grip.title = "\u62D6\u52A8\u8C03\u6574\u5217\u5BBD";
    th.appendChild(grip);
    grip.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (tbl.style.tableLayout !== "fixed") {
        ths.forEach((h, j) => cols[j].style.width = h.getBoundingClientRect().width + "px");
        tbl.style.tableLayout = "fixed";
      }
      const startX = ev.clientX, startW = th.getBoundingClientRect().width;
      const move = (mv) => {
        cols[i].style.width = Math.max(46, Math.min(1600, startW + (mv.clientX - startX))) + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        const map = t.colW[pathKey] || (t.colW[pathKey] = {});
        ths.forEach((h, j) => map[j] = Math.round(h.getBoundingClientRect().width));
        _persist();
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  });
}
function filterBar(stateObj, onChange, availableFields) {
  const wrap = el("div", "ti filter");
  wrap.innerHTML = '<span class="lbl">\u8FC7\u6EE4</span>';
  const bar = el("div", "fb-bar");
  const inp = el("input", "fb-edit");
  inp.type = "text";
  inp.placeholder = "\u7B5B\u9009\u884C/\u5B57\u6BB5\u2026 \u652F\u6301 name:\u503C id>1 role:true";
  inp.value = stateObj.respFilter || "";
  inp.spellcheck = false;
  const tokens = el("div", "fb-tokens");
  const acWrap = el("div", "fb-ac");
  let acOpen = false;
  function hideAC() {
    acOpen = false;
    acWrap.classList.remove("open");
    acWrap.innerHTML = "";
  }
  function showAC(list) {
    if (!list.length) {
      hideAC();
      return;
    }
    acWrap.innerHTML = "";
    list.slice(0, 12).forEach((f) => {
      const item = el("button", "fb-ac-item");
      item.type = "button";
      item.textContent = f;
      item.onclick = () => {
        inp.value += f;
        inp.focus();
        hideAC();
        onChange();
      };
      acWrap.appendChild(item);
    });
    acWrap.classList.add("open");
    acOpen = true;
  }
  function renderTokens() {
    tokens.innerHTML = "";
    const raw = (inp.value || "").trim();
    if (!raw) {
      tokens.style.display = "none";
      return;
    }
    tokens.style.display = "flex";
    const { ast } = parseFilter(raw);
    for (const node of ast) {
      const chip = el("span", "ftk");
      if (node.type === "text") {
        if (node.negated) chip.innerHTML = '<span class="ftk-neg">-</span><span class="ftk-val">' + esc(node.value) + "</span>";
        else chip.innerHTML = '<span class="ftk-val">' + esc(node.value) + "</span>";
      } else if (node.type === "wildcard") {
        chip.innerHTML = '<span class="ftk-field">*</span><span class="ftk-op">:</span><span class="ftk-val">' + esc(node.value) + "</span>";
      } else if (node.type === "field") {
        let valClass = "ftk-val";
        let valText = esc(node.value || "");
        if (node.numValue !== void 0) {
          valClass = "ftk-num";
          valText = esc(String(node.numValue));
        } else if (node.boolValue !== void 0) {
          valClass = "ftk-bool";
          valText = esc(String(node.boolValue));
        } else if (node.nullValue) {
          valClass = "ftk-null";
          valText = "null";
        } else if (node.regex) {
          valClass = "ftk-val";
          valText = "/" + esc(node.regex.source) + "/";
        }
        const neg = node.negated ? '<span class="ftk-neg">-</span>' : "";
        chip.innerHTML = neg + '<span class="ftk-field">' + esc(node.field) + '</span><span class="ftk-op">' + esc(node.op) + '</span><span class="' + valClass + '">' + valText + "</span>";
      }
      tokens.appendChild(chip);
    }
  }
  inp.addEventListener("input", () => {
    stateObj.respFilter = inp.value;
    renderTokens();
    const val = inp.value;
    const cursorPos = inp.selectionStart;
    if (availableFields && availableFields.length) {
      const before = val.slice(0, cursorPos);
      const lastSpace = before.lastIndexOf(" ");
      const curToken = before.slice(lastSpace + 1);
      const m = curToken.match(/^(-?)([\w.一-鿿-]*)$/);
      if (m && m[2].length > 0) {
        const prefix = m[2].toLowerCase();
        const matches = availableFields.filter((f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase() !== prefix);
        if (matches.length) showAC(matches);
        else hideAC();
      } else hideAC();
    }
    onChange();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideAC();
    if (e.key === "Enter") {
      e.preventDefault();
      hideAC();
      onChange();
    }
  });
  bar.addEventListener("click", (e) => {
    if (e.target === bar || e.target === tokens) inp.focus();
  });
  document.addEventListener("click", (e) => {
    if (!bar.contains(e.target)) hideAC();
  });
  renderTokens();
  bar.append(tokens, inp, acWrap);
  wrap.appendChild(bar);
  return wrap;
}

// src/core/http.js
var BINARY = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;
function tryJSON(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false };
  }
}

// src/core/cap-http.js
async function tauriInvoke(cmd, args) {
  const internals = (window.__TAURI_INTERNALS__ || {}).invoke;
  if (!internals) throw new Error("Tauri invoke \u4E0D\u53EF\u7528\uFF08\u975E Polaris \u5BBF\u4E3B\u73AF\u5883\uFF09");
  return internals(cmd, args);
}
async function capHttpRequest({ method, url, headers, body, bodyType, timeoutMs }) {
  const res = await tauriInvoke("router_dispatch", {
    req: {
      target: "cap.http",
      payload: {
        action: "request",
        method,
        url,
        headers: headers || {},
        body: body || "",
        bodyType: bodyType || "text",
        timeoutMs: timeoutMs || 15e3
      }
    }
  });
  if (!res || !res.ok) {
    throw new Error(res && res.error || "cap.http \u8BF7\u6C42\u5931\u8D25");
  }
  return res.result || {};
}
function hostCapHttpAvailable() {
  return !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
}
async function b64ToBlobUrl(b64, contentType) {
  const bin = atob(b64);
  const bytes2 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes2[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes2], { type: contentType || "application/octet-stream" });
  return URL.createObjectURL(blob);
}
async function capHttpResponseToRelay(r, url) {
  const contentType = r.contentType || "";
  const isBinary = r.isBase64 || false;
  const body = r.body || "";
  const isBin = isBinary || /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i.test(contentType);
  return {
    status: r.status,
    statusText: r.statusText || "",
    ok: !!r.ok,
    timeMs: r.timeMs || 0,
    size: isBin ? body.length : new Blob([body]).size,
    contentType,
    headers: r.headers || {},
    text: isBin ? "" : body,
    isBinary: isBin,
    blobUrl: isBin ? await b64ToBlobUrl(body, contentType) : null,
    url: r.url || url,
    parsed: (() => {
      if (isBin) return void 0;
      try {
        return JSON.parse(body);
      } catch {
        return void 0;
      }
    })()
  };
}

// src/tools/api.js
var LS_TABS = "relay.tabs.v2";
var LS_COL = "relay.collections.v2";
var LS_ENV = "relay.envs.v2";
var LS_UI = "relay.ui.v2";
var state = { tabs: [], activeTab: null, collections: [], envs: [], activeEnv: null };
var ui = { sideCollapsed: false, layout: "v", reqH: 240, reqW: 520, proxyOn: false };
var _panelMode2 = false;
function setApiPanelMode(on) {
  _panelMode2 = !!on;
  if (on) ui.proxyOn = true;
}
var blankRow = () => ({ id: uid(), on: true, k: "", v: "" });
var BROWSER_STRIP = /^(cookie|cookie2|user-agent|referer|origin|host|date|dnt|set-cookie|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*|accept-encoding|content-length)$/i;
function newTab(seed2) {
  return Object.assign({
    id: uid(),
    name: "\u672A\u547D\u540D\u8BF7\u6C42",
    savedId: null,
    dirty: false,
    method: "GET",
    url: "",
    params: [blankRow()],
    headers: [blankRow()],
    bodyType: "none",
    body: "",
    formBody: [blankRow()],
    reqTab: "params",
    respView: "object",
    respPath: "",
    respFilter: "",
    tableSel: null,
    prettyCells: true,
    colW: {},
    treeOpen: "auto",
    hiddenCols: {},
    sort: {},
    colOrder: {},
    response: null
  }, seed2 || {});
}
var activeTab = () => state.tabs.find((t) => t.id === state.activeTab);
function persist() {
  const tabs = state.tabs.map((t) => {
    const c = { ...t };
    delete c.response;
    return c;
  });
  try {
    localStorage.setItem(LS_TABS, JSON.stringify({ tabs, activeTab: state.activeTab }));
    localStorage.setItem(LS_COL, JSON.stringify(state.collections));
    localStorage.setItem(LS_ENV, JSON.stringify({ envs: state.envs, activeEnv: state.activeEnv }));
    localStorage.setItem(LS_UI, JSON.stringify(ui));
  } catch (e) {
    setStatus("\u672C\u5730\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message, "err");
  }
}
function load() {
  try {
    const t = JSON.parse(localStorage.getItem(LS_TABS) || "null");
    if (t && t.tabs && t.tabs.length) {
      state.tabs = t.tabs.map((x) => newTab(x));
      state.activeTab = t.activeTab;
    }
  } catch (e) {
  }
  try {
    const c = JSON.parse(localStorage.getItem(LS_COL) || "null");
    if (Array.isArray(c)) state.collections = c;
  } catch (e) {
  }
  try {
    const en = JSON.parse(localStorage.getItem(LS_ENV) || "null");
    if (en) {
      state.envs = en.envs || [];
      state.activeEnv = en.activeEnv || null;
    }
  } catch (e) {
  }
  try {
    const u = JSON.parse(localStorage.getItem(LS_UI) || "null");
    if (u) ui = Object.assign(ui, u);
  } catch (e) {
  }
  if (!state.collections.length || !state.envs.length) seed();
  if (!state.tabs.length) {
    const t = newTab();
    state.tabs = [t];
    state.activeTab = t.id;
  }
  if (!activeTab()) state.activeTab = state.tabs[0].id;
}
function sreq(name, method, url, extra) {
  return Object.assign({ id: uid(), name, method, url, params: [blankRow()], headers: [blankRow()], bodyType: "none", body: "", formBody: [blankRow()] }, extra || {});
}
function seed() {
  if (!state.envs.length) {
    const demo = { id: uid(), name: "Demo \xB7 jsonplaceholder", baseUrl: "https://jsonplaceholder.typicode.com", vars: [{ id: uid(), on: true, k: "token", v: "demo-token-123" }] };
    const local = { id: uid(), name: "Demo \xB7 httpbin", baseUrl: "https://httpbin.org", vars: [blankRow()] };
    state.envs = [demo, local];
    state.activeEnv = demo.id;
  }
  if (!state.collections.length) {
    const g = { id: uid(), name: "\u793A\u4F8B \xB7 DEMO", collapsed: false, requests: [
      sreq("\u7528\u6237\u5217\u8868(\u6570\u7EC4\u2192\u8868\u683C)", "GET", "https://jsonplaceholder.typicode.com/users"),
      sreq("\u7528\u6237\u5217\u8868 {{baseUrl}}", "GET", "{{baseUrl}}/users"),
      sreq("\u5355\u4E2A Todo(\u5BF9\u8C61)", "GET", "{{baseUrl}}/todos/1"),
      sreq("\u5D4C\u5957/\u65F6\u95F4(\u5BF9\u8C61\u6811\u6F14\u793A)", "GET", "https://httpbin.org/json"),
      sreq("\u5A92\u4F53/\u56FE\u7247(\u4E8C\u8FDB\u5236\u6F14\u793A)", "GET", "https://picsum.photos/300/200"),
      sreq("\u65B0\u5EFA Post", "POST", "{{baseUrl}}/posts", {
        bodyType: "json",
        body: JSON.stringify({ title: "relay", body: "hello", userId: 1 }, null, 2),
        headers: [{ id: uid(), on: true, k: "Authorization", v: "Bearer {{token}}" }, blankRow()]
      })
    ] };
    state.collections = [g];
  }
}
function curEnv() {
  return state.envs.find((e) => e.id === state.activeEnv);
}
function resolveVars(str) {
  if (str == null || String(str).indexOf("{{") < 0) return str;
  const env = curEnv();
  return String(str).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (m, key) => {
    if (!env) return m;
    if (key === "baseUrl") return env.baseUrl || "";
    const v = (env.vars || []).find((r) => r.on && r.k === key);
    return v ? v.v : m;
  });
}
function bindMethodMenu() {
  const menu = $("#methodMenu");
  if (!menu) return;
  METHODS.forEach((m) => {
    const b = el("button", methodColor(m), m);
    b.onclick = () => {
      const t = activeTab();
      t.method = m;
      markDirty(t);
      $("#methodMenu").classList.remove("open");
      renderRequestBar();
      renderReqEditor();
      persist();
    };
    menu.appendChild(b);
  });
}
function bindTopEvents() {
  const ms2 = $("#methodSel");
  if (ms2) ms2.onclick = (e) => {
    e.stopPropagation();
    $("#methodMenu").classList.toggle("open");
  };
  const es = $("#envSel");
  if (es) es.onclick = (e) => {
    e.stopPropagation();
    $("#envMenu").classList.toggle("open");
  };
  document.addEventListener("click", () => {
    const mm = $("#methodMenu");
    if (mm) mm.classList.remove("open");
    const em = $("#envMenu");
    if (em) em.classList.remove("open");
    $$(".path-menu").forEach((m) => m.classList.remove("open"));
  });
}
function renderSidebar() {
  const tree = $("#tree");
  tree.innerHTML = "";
  const q = ($("#search").value || "").toLowerCase().trim();
  let total = 0, shown = 0;
  if (!state.collections.length) tree.appendChild(el("div", "tree-empty", "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5206\u7EC4\u3002<br>\u70B9\u51FB\u53F3\u4E0A\u89D2 \uFF0B \u65B0\u5EFA\u4E00\u4E2A\u3002"));
  state.collections.forEach((g) => {
    const matched = g.requests.filter((r) => !q || r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q));
    total += g.requests.length;
    if (q && !matched.length && !g.name.toLowerCase().includes(q)) return;
    const list = q ? matched : g.requests;
    shown += list.length;
    const gEl = el("div", "group" + (g.collapsed && !q ? " collapsed" : ""));
    const head = el("div", "group-head");
    head.innerHTML = `<span class="caret">\u25BC</span><span class="gname">${esc(g.name)}</span><span class="gcount">${g.requests.length}</span>`;
    const act = el("span", "gact");
    const ren = el("button", "x", "\u270E");
    ren.title = "\u91CD\u547D\u540D";
    ren.onclick = (e) => {
      e.stopPropagation();
      renameGroup(g);
    };
    const del = el("button", "x", "\u{1F5D1}");
    del.title = "\u5220\u9664\u5206\u7EC4";
    del.onclick = (e) => {
      e.stopPropagation();
      deleteGroup(g);
    };
    act.append(ren, del);
    head.appendChild(act);
    head.onclick = () => {
      g.collapsed = !g.collapsed;
      persist();
      renderSidebar();
    };
    gEl.appendChild(head);
    const reqs = el("div", "reqs");
    list.forEach((r) => {
      const item = el("div", "req-item" + (activeTab() && activeTab().savedId === r.id ? " active" : ""));
      item.innerHTML = `<span class="mb ${methodColor(r.method)}">${r.method}</span><span class="rn">${esc(r.name)}</span>`;
      const x = el("button", "rx", "\u2715");
      x.title = "\u5220\u9664";
      x.onclick = (e) => {
        e.stopPropagation();
        deleteSaved(g, r);
      };
      item.appendChild(x);
      item.onclick = () => openSaved(r);
      reqs.appendChild(item);
    });
    gEl.appendChild(reqs);
    tree.appendChild(gEl);
  });
  if (q && shown === 0) tree.appendChild(el("div", "tree-empty", "\u6CA1\u6709\u5339\u914D\u300C" + esc(q) + "\u300D\u7684\u8BF7\u6C42\u3002"));
  $("#stSaved").textContent = total;
}
function renderEnv() {
  const env = curEnv();
  $("#envName").textContent = env ? env.name : "\u65E0\u73AF\u5883";
  $("#envSel").title = env && env.baseUrl ? "baseUrl: " + env.baseUrl : "\u672A\u9009\u62E9\u73AF\u5883";
  const menu = $("#envMenu");
  menu.innerHTML = "";
  state.envs.forEach((e) => {
    const b = el("button", "env-item" + (e.id === state.activeEnv ? " on" : ""), `<span>${esc(e.name)}</span><small>${esc(e.baseUrl || "(\u65E0 baseUrl)")}</small>`);
    b.onclick = () => {
      state.activeEnv = e.id;
      persist();
      renderEnv();
      renderRequestBar();
      $("#envMenu").classList.remove("open");
      setStatus("\u5DF2\u5207\u6362\u73AF\u5883\uFF1A" + e.name, "ok");
    };
    menu.appendChild(b);
  });
  const none = el("button", "env-item" + (!state.activeEnv ? " on" : ""), "<span>\u65E0\u73AF\u5883</span><small>\u4E0D\u89E3\u6790\u53D8\u91CF</small>");
  none.onclick = () => {
    state.activeEnv = null;
    persist();
    renderEnv();
    renderRequestBar();
    $("#envMenu").classList.remove("open");
  };
  menu.appendChild(none);
  const mng = el("button", "env-item manage", "<span>\u2699 \u7BA1\u7406\u73AF\u5883\u4E0E\u53D8\u91CF\u2026</span>");
  mng.onclick = () => {
    $("#envMenu").classList.remove("open");
    openEnvManager();
  };
  menu.appendChild(mng);
}
function openEnvManager() {
  const bg = $("#modalBg");
  const m = el("div", "modal wide");
  let selId = state.activeEnv || state.envs[0] && state.envs[0].id;
  function render() {
    const env = state.envs.find((e) => e.id === selId);
    m.innerHTML = `<h3>\u73AF\u5883\u4E0E\u53D8\u91CF</h3><div class="sub">\u6BCF\u4E2A\u73AF\u5883\u542B\u4E00\u4E2A\u8BF7\u6C42\u670D\u52A1 <b>baseUrl</b>(ip+\u7AEF\u53E3) \u4E0E\u4E00\u7EC4\u53D8\u91CF\uFF1B\u5728 URL / Header / Body \u4E2D\u7528 <b>{{baseUrl}}</b>\u3001<b>{{\u53D8\u91CF\u540D}}</b> \u5F15\u7528\uFF0C\u53D1\u9001\u65F6\u89E3\u6790\u3002</div>`;
    const tabs = el("div", "env-tabs");
    state.envs.forEach((e) => {
      const b = el("button", "env-tab" + (e.id === selId ? " on" : ""), esc(e.name) + (e.id === state.activeEnv ? " \u25CF" : ""));
      b.onclick = () => {
        selId = e.id;
        render();
      };
      tabs.appendChild(b);
    });
    const add = el("button", "env-tab add", "\uFF0B \u65B0\u5EFA\u73AF\u5883");
    add.onclick = () => {
      const ne = { id: uid(), name: "\u73AF\u5883 " + (state.envs.length + 1), baseUrl: "", vars: [blankRow()] };
      state.envs.push(ne);
      selId = ne.id;
      render();
    };
    tabs.appendChild(add);
    m.appendChild(tabs);
    if (env) {
      const f1 = el("div", "field");
      f1.innerHTML = "<label>\u73AF\u5883\u540D\u79F0</label>";
      const i1 = el("input");
      i1.value = env.name;
      i1.oninput = () => env.name = i1.value;
      f1.appendChild(i1);
      m.appendChild(f1);
      const f2 = el("div", "field");
      f2.innerHTML = "<label>\u8BF7\u6C42\u670D\u52A1 baseUrl\uFF08ip + \u7AEF\u53E3\uFF09</label>";
      const i2 = el("input");
      i2.placeholder = "http://127.0.0.1:8080";
      i2.value = env.baseUrl || "";
      i2.oninput = () => env.baseUrl = i2.value;
      f2.appendChild(i2);
      m.appendChild(f2);
      const f3 = el("div", "field");
      f3.innerHTML = "<label>\u53D8\u91CF</label>";
      const host = el("div", "env-vars");
      if (!env.vars) env.vars = [blankRow()];
      host.appendChild(kvEditor(env.vars, { kPlace: "\u53D8\u91CF\u540D", vPlace: "\u503C", onChange: () => {
      } }));
      f3.appendChild(host);
      m.appendChild(f3);
    } else m.appendChild(el("div", "field", "\u8FD8\u6CA1\u6709\u73AF\u5883\uFF0C\u70B9\u300C\uFF0B \u65B0\u5EFA\u73AF\u5883\u300D\u3002"));
    const acts = el("div", "acts");
    if (env) {
      const del = el("button", "btn ghost danger", "\u5220\u9664");
      del.onclick = () => {
        if (confirm("\u5220\u9664\u73AF\u5883\u300C" + env.name + "\u300D\uFF1F")) {
          state.envs = state.envs.filter((e) => e.id !== env.id);
          if (state.activeEnv === env.id) state.activeEnv = state.envs[0] ? state.envs[0].id : null;
          selId = state.envs[0] && state.envs[0].id;
          render();
        }
      };
      acts.appendChild(del);
    }
    const sp = el("div");
    sp.style.flex = "1";
    acts.appendChild(sp);
    if (env) {
      const use = el("button", "btn", env.id === state.activeEnv ? "\u2713 \u5F53\u524D\u73AF\u5883" : "\u8BBE\u4E3A\u5F53\u524D");
      use.onclick = () => {
        state.activeEnv = selId;
        persist();
        renderEnv();
        renderRequestBar();
        render();
      };
      acts.appendChild(use);
    }
    const done = el("button", "btn primary", "\u5B8C\u6210");
    done.onclick = close;
    acts.appendChild(done);
    m.appendChild(acts);
  }
  function close() {
    state.envs.forEach((e) => {
      if (e.vars) e.vars = e.vars.filter((r) => r.k || r.v);
    });
    persist();
    renderEnv();
    renderRequestBar();
    bg.classList.remove("open");
    bg.innerHTML = "";
  }
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  render();
}
function renderTabs() {
  const bar = $("#tabbar");
  bar.innerHTML = "";
  const add = el("button", "tab-add", "+");
  add.title = "\u65B0\u5EFA\u8BF7\u6C42 tab";
  add.onclick = () => {
    const nt = newTab();
    state.tabs.unshift(nt);
    state.activeTab = nt.id;
    renderAll();
    persist();
  };
  bar.appendChild(add);
  state.tabs.forEach((t) => {
    const tab = el("div", "rtab" + (t.id === state.activeTab ? " active" : ""));
    tab.innerHTML = `<span class="tm ${methodColor(t.method)}">${t.method}</span><span class="tn">${esc(t.name)}</span>`;
    if (t.dirty) tab.appendChild(el("span", "dirty"));
    const x = el("button", "tx", "\xD7");
    x.title = "\u5173\u95ED";
    x.onclick = (e) => {
      e.stopPropagation();
      closeTab(t);
    };
    tab.appendChild(x);
    tab.onclick = () => {
      state.activeTab = t.id;
      renderAll();
      persist();
    };
    tab.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabCtxMenu(e, t);
    };
    tab.querySelector(".tn").ondblclick = (e) => {
      e.stopPropagation();
      const n = prompt("\u91CD\u547D\u540D tab\uFF1A", t.name);
      if (n != null) {
        t.name = n.trim() || t.name;
        renderTabs();
        persist();
      }
    };
    bar.appendChild(tab);
  });
  bar.scrollLeft = 0;
  updateTabFade();
  $("#stTabs").textContent = state.tabs.length;
}
function updateTabFade() {
  const bar = $("#tabbar");
  if (!bar) return;
  bar.classList.toggle("has-more", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1);
}
function renderRequestBar() {
  const t = activeTab();
  const lbl = $("#methodLabel");
  lbl.textContent = t.method;
  lbl.className = methodColor(t.method);
  const urlIn = $("#url");
  if (document.activeElement !== urlIn) urlIn.value = t.url;
  updateResolvedPreview();
}
function updateResolvedPreview() {
  const t = activeTab();
  const box = $("#urlResolved");
  if (t.url && t.url.indexOf("{{") >= 0) {
    const r = resolveVars(t.url);
    box.innerHTML = "\u2192 <b>" + esc(r) + "</b>";
  } else box.innerHTML = "";
}
var countRows = (rows) => rows.filter((r) => r.on && (r.k || r.v)).length;
function renderReqEditor() {
  const t = activeTab();
  $$("#reqSubtabs .subtab").forEach((b) => b.classList.toggle("active", b.dataset.rt === t.reqTab));
  $("#bParams").textContent = countRows(t.params) || "";
  $("#bHeaders").textContent = countRows(t.headers) || "";
  $("#bBody").textContent = t.bodyType !== "none" ? "\u2022" : "";
  const pane = $("#reqPane");
  pane.innerHTML = "";
  if (t.reqTab === "params") {
    pane.appendChild(kvEditor(t.params, { kPlace: "\u53C2\u6570\u540D", vPlace: "\u53C2\u6570\u503C", onChange: () => {
      markDirty(t);
      syncParamsToUrl(t);
      $("#bParams").textContent = countRows(t.params) || "";
      persist();
    } }));
  } else if (t.reqTab === "headers") {
    pane.appendChild(kvEditor(t.headers, { kPlace: "Header \u540D", vPlace: "Header \u503C", onChange: () => {
      markDirty(t);
      $("#bHeaders").textContent = countRows(t.headers) || "";
      persist();
    } }));
  } else renderBodyEditor(pane, t);
}
function kvEditor(rows, opts) {
  const wrap = el("div", "kv");
  function ensureBlank() {
    if (!rows.length || rows[rows.length - 1].k || rows[rows.length - 1].v) rows.push(blankRow());
  }
  function rowEl(r) {
    const isLast = () => rows[rows.length - 1] === r;
    const row = el("div", "kv-row" + (!r.k && !r.v ? " blank" : ""));
    const ck = el("label", "ck");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = r.on;
    cb.onchange = () => {
      r.on = cb.checked;
      opts.onChange();
    };
    ck.appendChild(cb);
    const ki = el("input", "k");
    ki.type = "text";
    ki.placeholder = opts.kPlace;
    ki.value = r.k;
    ki.spellcheck = false;
    const vi = el("input", "v");
    vi.type = "text";
    vi.placeholder = opts.vPlace;
    vi.value = r.v;
    vi.spellcheck = false;
    const onInput = () => {
      r.k = ki.value;
      r.v = vi.value;
      row.classList.toggle("blank", !r.k && !r.v);
      if ((r.k || r.v) && isLast()) {
        const nr = blankRow();
        rows.push(nr);
        wrap.appendChild(rowEl(nr));
      }
      opts.onChange();
    };
    ki.addEventListener("input", onInput);
    vi.addEventListener("input", onInput);
    const rm = el("button", "rm", "\u2715");
    rm.title = "\u5220\u9664\u8BE5\u884C";
    rm.onclick = () => {
      const i = rows.indexOf(r);
      if (i > -1) rows.splice(i, 1);
      rebuild();
      opts.onChange();
    };
    row.append(ck, ki, vi, rm);
    return row;
  }
  function rebuild() {
    wrap.innerHTML = "";
    ensureBlank();
    rows.forEach((r) => wrap.appendChild(rowEl(r)));
  }
  rebuild();
  return wrap;
}
function renderBodyEditor(pane, t) {
  const bar = el("div", "body-bar");
  const seg = el("div", "seg");
  [["none", "\u65E0"], ["json", "JSON"], ["text", "\u6587\u672C"], ["form", "Form"]].forEach(([v, l]) => {
    const b = el("button", t.bodyType === v ? "on" : "", l);
    b.onclick = () => {
      t.bodyType = v;
      markDirty(t);
      persist();
      renderReqEditor();
    };
    seg.appendChild(b);
  });
  bar.appendChild(seg);
  bar.appendChild(el("div", "sp"));
  if (t.bodyType === "json") {
    const fmt = el("button", "tool", "\u683C\u5F0F\u5316");
    fmt.onclick = () => {
      try {
        t.body = JSON.stringify(JSON.parse(t.body), null, 2);
        renderReqEditor();
        persist();
        setStatus("JSON \u5DF2\u683C\u5F0F\u5316", "ok");
      } catch (e) {
        setStatus("JSON \u65E0\u6548\uFF1A" + e.message, "err");
      }
    };
    bar.appendChild(fmt);
  }
  pane.appendChild(bar);
  if (t.bodyType === "none") {
    pane.appendChild(el("div", "body-none", "\u8BE5\u8BF7\u6C42\u6CA1\u6709 Body\u3002<br>\u9009\u62E9 JSON / \u6587\u672C / Form \u4EE5\u7F16\u8F91\u8BF7\u6C42\u4F53\u3002"));
  } else if (t.bodyType === "form") {
    const host = el("div");
    host.style.cssText = "height:calc(100% - 49px);overflow:auto";
    host.appendChild(kvEditor(t.formBody, { kPlace: "\u5B57\u6BB5\u540D", vPlace: "\u5B57\u6BB5\u503C", onChange: () => {
      markDirty(t);
      persist();
    } }));
    pane.appendChild(host);
  } else {
    const ta = el("textarea", "code");
    ta.spellcheck = false;
    ta.placeholder = t.bodyType === "json" ? '{\n  "key": "value"\n}' : "\u539F\u59CB\u8BF7\u6C42\u4F53\u2026";
    ta.value = t.body;
    ta.style.height = "calc(100% - 49px)";
    ta.addEventListener("input", () => {
      t.body = ta.value;
      markDirty(t);
      persist();
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        t.body = ta.value;
      }
    });
    pane.appendChild(ta);
  }
}
function splitUrl(url) {
  const i = url.indexOf("?");
  return i < 0 ? [url, ""] : [url.slice(0, i), url.slice(i + 1)];
}
function syncParamsToUrl(t) {
  const [base] = splitUrl(t.url);
  const qs = t.params.filter((r) => r.on && r.k).map((r) => encodeURIComponent(r.k) + "=" + encodeURIComponent(r.v)).join("&");
  t.url = qs ? base + "?" + qs : base;
  const urlIn = $("#url");
  if (document.activeElement !== urlIn) urlIn.value = t.url;
  updateResolvedPreview();
}
function syncUrlToParams(t) {
  const [, query] = splitUrl(t.url);
  const rows = [];
  if (query) query.split("&").forEach((p) => {
    if (!p) return;
    const [k, ...rest] = p.split("=");
    rows.push({ id: uid(), on: true, k: decodeURIComponent(k || ""), v: decodeURIComponent((rest.join("=") || "").replace(/\+/g, " ")) });
  });
  rows.push(blankRow());
  t.params = rows;
}
async function send() {
  const t = activeTab();
  let url = resolveVars(t.url.trim());
  if (!url) {
    setStatus("\u8BF7\u5148\u8F93\u5165 URL", "warn");
    $("#url").focus();
    return;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = "https://" + url;
  const headers = {};
  t.headers.filter((r) => r.on && r.k).forEach((r) => headers[resolveVars(r.k)] = resolveVars(r.v));
  if (!_panelMode2 && !ui.proxyOn) {
    const stripped = Object.keys(headers).filter((k) => BROWSER_STRIP.test(k));
    if (stripped.length) {
      const names = stripped.map((k) => `<code>${esc(k)}</code>`).join("\u3001");
      $("#resSubtabs").style.display = "none";
      $("#resStatus").style.display = "none";
      $("#resTools").style.display = "none";
      $("#resPane").innerHTML = `<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u88AB\u62E6\u622A\uFF1A\u6D4F\u89C8\u5668\u7981\u53D1\u5934</div><div>\u5F53\u524D\u4E3A<code>\u76F4\u8FDE</code>\u6A21\u5F0F\uFF0C\u4EE5\u4E0B\u5934\u4F1A\u88AB\u6D4F\u89C8\u5668\u9759\u9ED8\u5265\u79BB\u3001\u65E0\u6CD5\u53D1\u9001\uFF1A<b>${names}</b>\u3002\u76EE\u6807\u670D\u52A1\u5668\u6536\u5230\u7F3A\u5C11\u8FD9\u4E9B\u5934\u7684\u8BF7\u6C42\uFF0C\u901A\u5E38\u4F1A\u8FD4\u56DE<span style="color:var(--warn)">\u767B\u5F55\u5931\u6548 / 403 / \u8DE8\u57DF\u9519\u8BEF</span>\u3002</div><div class="hintbox">\u{1F449} \u70B9\u51FB\u9876\u680F <b>\u300C\u{1F6E1} \u4EE3\u7406\u300D</b> \u5F00\u542F\u8DE8\u57DF\u4EE3\u7406\u540E\u91CD\u53D1\u3002\u4EE3\u7406\u4F1A\u7531\u672C\u5730\u540E\u7AEF\u628A Cookie/UA/Referer \u7B49\u5934\u5B8C\u6574\u8FD8\u539F\u5E76\u8F6C\u53D1\uFF0C\u4E0E cURL \u53D1\u9001\u7B49\u6548\u3002</div><div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u88AB\u62E6\u622A\u5934\uFF1A${esc(stripped.join(", "))}</div></div>`;
      const btn2 = $("#sendBtn");
      btn2.disabled = false;
      btn2.innerHTML = '\u53D1\u9001 <span class="k">\u2318\u21B5</span>';
      return;
    }
  }
  let body;
  const method = t.method;
  if (!["GET", "HEAD"].includes(method)) {
    if (t.bodyType === "json") {
      body = resolveVars(t.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    } else if (t.bodyType === "text") {
      body = resolveVars(t.body);
    } else if (t.bodyType === "form") {
      body = t.formBody.filter((r) => r.on && r.k).map((r) => encodeURIComponent(resolveVars(r.k)) + "=" + encodeURIComponent(resolveVars(r.v))).join("&");
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }
  const btn = $("#sendBtn");
  btn.disabled = true;
  btn.innerHTML = "\u53D1\u9001\u4E2D\u2026";
  $("#resSubtabs").style.display = "none";
  $("#resStatus").style.display = "none";
  $("#resTools").style.display = "none";
  $("#resPane").innerHTML = '<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>';
  const t0 = performance.now();
  try {
    if (_panelMode2) {
      if (!hostCapHttpAvailable()) throw new Error("cap.http \u4E0D\u53EF\u7528\uFF08\u9700 Polaris \u5BBF\u4E3B\u73AF\u5883\uFF09");
      setStatus(method + " " + url + " \xB7 \u7ECF\u5BBF\u4E3B\u8F6C\u53D1 \u2026");
      const cr = await capHttpRequest({
        method,
        url,
        headers,
        body: body || "",
        bodyType: t.bodyType || "text",
        timeoutMs: 15e3
      });
      const t1 = performance.now();
      t.response = await capHttpResponseToRelay(cr, url);
      t.response.timeMs = t1 - t0;
    } else {
      setStatus(method + " " + url + (ui.proxyOn ? " \xB7 \u7ECF\u4EE3\u7406" : "") + " \u2026");
      let fetchUrl = url, fetchHeaders = headers;
      if (ui.proxyOn) {
        fetchHeaders = {};
        for (const [k, v] of Object.entries(headers)) {
          if (BROWSER_STRIP.test(k)) fetchHeaders["X-Relay-H-" + k] = v;
          else fetchHeaders[k] = v;
        }
        fetchHeaders["X-Relay-Target"] = url;
        fetchUrl = "/__proxy";
      }
      const res = await fetch(fetchUrl, { method, headers: fetchHeaders, body, redirect: "follow" });
      const blob = await res.blob();
      const t1 = performance.now();
      const ct2 = res.headers.get("content-type") || "";
      const isBin = BINARY.test(ct2);
      let text = "";
      if (!isBin) text = await blob.text();
      const resHeaders = {};
      res.headers.forEach((v, k) => resHeaders[k] = v);
      const parsed = tryJSON(text);
      t.response = { status: res.status, statusText: res.statusText, ok: res.ok, timeMs: t1 - t0, size: blob.size, contentType: ct2, headers: resHeaders, text, isBinary: isBin, blobUrl: isBin ? URL.createObjectURL(blob) : null, url, parsed: parsed.ok ? parsed.value : void 0 };
    }
    const ct = t.response.contentType || "";
    t.respPath = "";
    t.respFilter = "";
    t.tableSel = null;
    t.colW = {};
    t.treeOpen = "auto";
    t.hiddenCols = {};
    t.sort = {};
    t.respView = t.response.parsed !== void 0 ? Array.isArray(t.response.parsed) ? "table" : "object" : /text\/html/i.test(ct) ? "preview" : t.response.isBinary && /^image\//i.test(ct) ? "preview" : "raw";
    renderResponse();
    setStatus(method + " " + t.response.status + " " + t.response.statusText + " \xB7 " + ms(t.response.timeMs) + " \xB7 " + bytes(t.response.size || 0), t.response.ok ? "ok" : "warn");
  } catch (err) {
    const t1 = performance.now();
    t.response = { error: err.message || String(err), timeMs: t1 - t0, url };
    renderResponse();
    setStatus("\u8BF7\u6C42\u5931\u8D25\uFF1A" + (err.message || err), "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '\u53D1\u9001 <span class="k">\u2318\u21B5</span>';
  }
}
function getDrilled(t) {
  const r = t.response;
  const root = r && !r.error ? r.parsed : void 0;
  let data = root, drillErr = false;
  if (t.respPath && root !== void 0) {
    const g = getByPath(root, t.respPath);
    if (g.ok) data = g.value;
    else {
      drillErr = true;
      data = void 0;
    }
  }
  const hasJSON = data !== void 0;
  const canTable = hasJSON && (Array.isArray(data) || data && typeof data === "object");
  const canPrev = !!r && !t.respPath && (/text\/html/i.test(r.contentType) || /^image\//i.test(r.contentType));
  return { data, drillErr, hasJSON, canTable, canPrev };
}
function apiResponseFields(data) {
  if (!data) return [];
  if (Array.isArray(data) && data.length && data[0] && typeof data[0] === "object" && !Array.isArray(data[0])) return Object.keys(data[0]);
  if (data && typeof data === "object" && !Array.isArray(data)) return Object.keys(data);
  return [];
}
function renderResponse() {
  const t = activeTab();
  const r = t.response;
  const pane = $("#resPane"), sub = $("#resSubtabs"), sb = $("#resStatus"), tools = $("#resTools");
  if (!r) {
    sub.style.display = "none";
    sb.style.display = "none";
    tools.style.display = "none";
    pane.innerHTML = '<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div>\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002</div>';
    return;
  }
  if (r.error) {
    sub.style.display = "none";
    sb.style.display = "none";
    tools.style.display = "none";
    const corsHint = /Failed to fetch|NetworkError|load failed/i.test(r.error);
    pane.innerHTML = `<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u5931\u8D25</div><div>${esc(r.error)}</div>` + (corsHint ? `<div class="hintbox"><b>\u53EF\u80FD\u539F\u56E0\uFF1A</b>\u8DE8\u57DF CORS\u3001\u76EE\u6807\u65E0\u54CD\u5E94\u3001\u6DF7\u5408\u5185\u5BB9(HTTP/HTTPS)\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002` + (_panelMode2 ? `<br>\u9762\u677F\u6A21\u5F0F\uFF1A\u8BF7\u6C42\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u4ECD\u5931\u8D25\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\u3001\u88AB SSRF \u62E6\u622A\uFF08\u5185\u7F51/\u4E91\u5143\u6570\u636E/\u5185\u90E8\u57DF\u540D\u7981\u53D1\uFF1Blocalhost/127.0.0.1 \u5DF2\u653E\u884C\uFF09\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002` : ui.proxyOn ? `<br>\u4EE3\u7406\u5DF2\u5F00\u542F\u4ECD\u5931\u8D25\uFF1A\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\uFF0C\u6216\u540E\u7AEF\u672A\u8FD0\u884C\u6700\u65B0 server.js\u3002` : `<br>\u{1F449} \u70B9\u9876\u680F\u300C\u{1F6E1} \u4EE3\u7406\u300D\u5F00\u542F\u672C\u5730\u540E\u7AEF\u8F6C\u53D1\uFF0C\u53EF\u7ED5\u8FC7 CORS \u4E0E\u6DF7\u5408\u5185\u5BB9\u9650\u5236\u3002`) + `</div>` : "") + `<div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u8017\u65F6 ${ms(r.timeMs)} \xB7 ${esc(r.url)}</div></div>`;
    return;
  }
  sb.style.display = "flex";
  const cls = r.status >= 500 ? "s5" : r.status >= 400 ? "s4" : r.status >= 300 ? "s3" : "s2";
  const color = `var(--${cls})`;
  sb.innerHTML = `<span class="status-chip" style="color:${color}"><span class="dotc" style="background:${color}"></span>${r.status} ${esc(r.statusText)}</span><span class="res-meta"><span>\u8017\u65F6 <b>${ms(r.timeMs)}</b></span><span>\u5927\u5C0F <b>${bytes(r.size)}</b></span>` + (r.contentType ? `<span>\u7C7B\u578B <b>${esc(r.contentType.split(";")[0])}</b></span>` : "") + `</span>`;
  sub.style.display = "flex";
  const baseHasJSON = r.parsed !== void 0;
  if (baseHasJSON) {
    tools.style.display = "flex";
    tools.innerHTML = "";
    let pi = null;
    const pths = collectPaths(r.parsed);
    const ddWrap = el("div", "ti path");
    ddWrap.innerHTML = '<span class="lbl">\u8DEF\u5F84</span>';
    const dd = el("div", "pathdd");
    const ddBtn = el("button", "pathdd-btn");
    ddBtn.type = "button";
    const setLbl = () => {
      ddBtn.innerHTML = `<span>${t.respPath ? esc(t.respPath) : "\u9009\u62E9\u8DEF\u5F84"}</span><span class="pcar">\u25BC</span>`;
    };
    setLbl();
    const menu = el("div", "path-menu");
    const fbox = el("input", "path-filter");
    fbox.placeholder = "\u8FC7\u6EE4\u8DEF\u5F84 / \u8F93\u5165\u540E\u56DE\u8F66\u5E94\u7528";
    fbox.spellcheck = false;
    const list = el("div", "path-list");
    const apply = (p) => {
      t.respPath = p;
      if (pi) pi.value = p;
      persist();
      setLbl();
      menu.classList.remove("open");
      renderRespBody();
    };
    const fill = () => {
      list.innerHTML = "";
      const kw = fbox.value.toLowerCase().trim();
      let n = 0;
      pths.forEach((p) => {
        if (n >= 200) return;
        const lab = p.path === "" ? "(\u6839)" : p.path;
        if (kw && !lab.toLowerCase().includes(kw)) return;
        n++;
        const o = el("button", "path-opt" + (p.path === t.respPath ? " on" : ""));
        o.type = "button";
        o.innerHTML = `<span class="pp">${esc(lab)}</span><span class="pk ${p.kind}">${p.kind === "array" ? "[ ] " + p.count : p.kind === "object" ? "{ } " + p.count : "\xB7"}</span>`;
        o.onclick = () => apply(p.path);
        list.appendChild(o);
      });
      if (!n) list.innerHTML = '<div class="path-empty">\u65E0\u5339\u914D\u8DEF\u5F84\u3002<br>\u56DE\u8F66\u53EF\u76F4\u63A5\u5E94\u7528\u8F93\u5165\u7684\u8DEF\u5F84\u3002</div>';
    };
    fbox.addEventListener("input", fill);
    fbox.addEventListener("keydown", (e) => {
      if (e.key === "Enter") apply(fbox.value.trim());
      if (e.key === "Escape") menu.classList.remove("open");
    });
    ddBtn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains("open");
      $$(".path-menu").forEach((x) => x.classList.remove("open"));
      $("#methodMenu").classList.remove("open");
      $("#envMenu").classList.remove("open");
      if (willOpen) {
        menu.classList.add("open");
        fbox.value = "";
        fill();
        setTimeout(() => fbox.focus(), 0);
      }
    };
    menu.addEventListener("click", (e) => e.stopPropagation());
    menu.append(fbox, list);
    dd.append(ddBtn, menu);
    ddWrap.appendChild(dd);
    const man = el("div", "ti manual");
    man.innerHTML = '<span class="lbl">\u624B\u52A8</span>';
    pi = el("input");
    pi.id = "respPathIn";
    pi.placeholder = "\u5982 data.items[0].name";
    pi.value = t.respPath || "";
    pi.spellcheck = false;
    pi.addEventListener("input", () => {
      t.respPath = pi.value;
      persist();
      setLbl();
      renderRespBody();
    });
    man.appendChild(pi);
    const drilled = getDrilled(t);
    const apiFields = apiResponseFields(drilled.data);
    const flt = filterBar(t, () => {
      persist();
      renderRespBody();
    }, apiFields);
    tools.append(ddWrap, man, flt);
  } else tools.style.display = "none";
  $("#bResH").textContent = Object.keys(r.headers || {}).length || "";
  renderRespBody();
}
function renderRespBody() {
  const t = activeTab();
  const r = t.response;
  if (!r || r.error) return;
  const d = getDrilled(t);
  const caps = { table: d.canTable, object: d.hasJSON, raw: true, preview: d.canPrev, headers: true };
  if (!caps[t.respView]) t.respView = d.hasJSON ? "object" : d.canPrev ? "preview" : "raw";
  $$("#resSubtabs .subtab").forEach((b) => {
    const v2 = b.dataset.rv;
    b.classList.toggle("active", v2 === t.respView);
    b.classList.toggle("disabled", !caps[v2]);
    if (v2 === "preview") b.style.display = d.canPrev ? "" : "none";
  });
  const isT = t.respView === "table", isO = t.respView === "object", isR = t.respView === "raw";
  const pretty = t.prettyCells !== false;
  $("#prettyBtn").style.display = isT || isO ? "" : "none";
  $("#prettyBtn").style.color = pretty ? "var(--brand)" : "";
  $("#prettyBtn").innerHTML = pretty ? "\u2726 \u7F8E\u5316" : "\u2726 \u539F\u59CB";
  $("#treeExpand").style.display = isO ? "" : "none";
  $("#treeCollapse").style.display = isO ? "" : "none";
  $("#wrapBtn").style.display = isR ? "" : "none";
  const pane = $("#resPane");
  pane.innerHTML = "";
  if (d.drillErr) {
    pane.innerHTML = '<div class="prev-none">\u8DEF\u5F84 <b>' + esc(t.respPath) + "</b> \u5728\u54CD\u5E94\u4E2D\u4E0D\u5B58\u5728\u3002</div>";
    return;
  }
  const v = t.respView;
  if (v === "raw") pane.appendChild(viewRaw(r, d.data));
  else if (v === "object") pane.appendChild(viewObject(d.data, t));
  else if (v === "table") pane.appendChild(viewTable(d.data, t));
  else if (v === "preview") pane.appendChild(viewPreview(r));
  else pane.appendChild(viewHeaders(r));
}
function viewPreview(r) {
  if (/^image\//i.test(r.contentType) && r.blobUrl) {
    const w = el("div", "prev-img-wrap");
    const img = el("img");
    img.src = r.blobUrl;
    w.appendChild(img);
    return w;
  }
  if (/text\/html/i.test(r.contentType)) {
    const f = el("iframe", "prev-frame");
    f.sandbox = "";
    f.srcdoc = r.text;
    return f;
  }
  return el("div", "prev-none", "\u65E0\u53EF\u9884\u89C8\u5185\u5BB9\uFF08\u4EC5\u652F\u6301 HTML \u4E0E\u56FE\u7247\u9884\u89C8\uFF09\u3002");
}
function viewHeaders(r) {
  const wrap = el("div", "tbl-wrap");
  const tbl = el("table", "dt");
  const keys = Object.keys(r.headers || {});
  tbl.innerHTML = "<thead><tr><th>Header</th><th>Value</th></tr></thead>";
  const tb = el("tbody");
  if (!keys.length) tb.innerHTML = '<tr><td colspan="2" style="color:var(--dimmer)">\uFF08\u65E0\u53EF\u89C1\u54CD\u5E94\u5934 \u2014 \u6D4F\u89C8\u5668\u53EF\u80FD\u9650\u5236\u4E86\u90E8\u5206\u5934\uFF09</td></tr>';
  keys.forEach((k) => {
    const tr = el("tr");
    tr.innerHTML = `<td style="color:var(--j-key);white-space:nowrap">${esc(k)}</td><td>${esc(r.headers[k])}</td>`;
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  wrap.appendChild(tbl);
  return wrap;
}
function tokenizeCurl(s) {
  s = s.replace(/\\\r?\n/g, " ");
  const out = [];
  let cur = "", q = null, started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\" && q === '"') {
        cur += s[++i] || "";
      } else if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      started = true;
    } else if (c === " " || c === "	" || c === "\n" || c === "\r") {
      if (started) {
        out.push(cur);
        cur = "";
        started = false;
      }
    } else {
      cur += c;
      started = true;
    }
  }
  if (started) out.push(cur);
  return out;
}
function parseCurl(text) {
  let toks = tokenizeCurl(text.trim());
  if (toks.length && /^curl(\.exe)?$/i.test(toks[0])) toks = toks.slice(1);
  const flat = [];
  for (const t of toks) {
    if (t.startsWith("--") || /^-[A-Za-z]/.test(t) && t.length > 2) {
      const idx = t.indexOf("=");
      if (idx > 0) {
        flat.push(t.slice(0, idx));
        flat.push(t.slice(idx + 1));
        continue;
      }
    }
    flat.push(t);
  }
  toks = flat;
  const headers = [], datas = [];
  let method = null, url = "", getFlag = false;
  const addH = (h) => {
    const i = h.indexOf(":");
    if (i < 0) {
      headers.push({ on: true, k: h.trim(), v: "" });
      return;
    }
    headers.push({ on: true, k: h.slice(0, i).trim(), v: h.slice(i + 1).trim() });
  };
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i];
    const nx = () => toks[++i];
    if (t === "-X" || t === "--request") method = nx();
    else if (t.startsWith("-X") && t.length > 2) method = t.slice(2);
    else if (t === "-H" || t === "--header") addH(nx());
    else if (t.startsWith("-H") && t.length > 2) addH(t.slice(2));
    else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-ascii" || t === "--data-binary" || t === "--data-urlencode") datas.push(nx());
    else if (t.startsWith("-d") && t.length > 2) datas.push(t.slice(2));
    else if (t === "--json") {
      datas.push(nx());
      if (!headers.some((h) => h.k.toLowerCase() === "content-type")) headers.push({ on: true, k: "Content-Type", v: "application/json" });
    } else if (t === "-u" || t === "--user") {
      try {
        headers.push({ on: true, k: "Authorization", v: "Basic " + btoa(nx()) });
      } catch (e) {
      }
    } else if (t === "-b" || t === "--cookie") headers.push({ on: true, k: "Cookie", v: nx() });
    else if (t === "-A" || t === "--user-agent") headers.push({ on: true, k: "User-Agent", v: nx() });
    else if (t === "-e" || t === "--referer") headers.push({ on: true, k: "Referer", v: nx() });
    else if (t === "-G" || t === "--get") getFlag = true;
    else if (t === "--url") url = nx();
    else if (["--compressed", "-L", "--location", "-k", "--insecure", "-s", "--silent", "-S", "--show-error", "-i", "--include", "-v", "--verbose", "-f", "--fail", "-#", "--progress-bar"].includes(t)) {
    } else if (t.startsWith("-")) {
    } else if (!url) url = t;
  }
  if (!method) method = datas.length && !getFlag ? "POST" : "GET";
  method = method.toUpperCase();
  let body = datas.join("&");
  if (getFlag && body) {
    url += (url.includes("?") ? "&" : "?") + body;
    body = "";
  }
  const ct = headers.find((h) => h.k.toLowerCase() === "content-type");
  let bodyType = "none";
  if (body) {
    if (ct && /json/i.test(ct.v)) bodyType = "json";
    else if (/^\s*[\[{]/.test(body)) bodyType = "json";
    else bodyType = "text";
  }
  if (bodyType === "json") {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2);
    } catch (e) {
    }
  }
  return { method, url, headers, body, bodyType };
}
function openCurlImport() {
  const bg = $("#modalBg");
  const m = el("div", "modal");
  m.innerHTML = '<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\uFF08\u652F\u6301 -X -H -d --data-raw -u -b -G --json\u3001--flag=value \u7B49\u53F7\u5199\u6CD5\u3001curl.exe \u524D\u7F00\uFF09\u3002</div>';
  const f = el("div", "field");
  f.innerHTML = "<label>cURL \u547D\u4EE4</label>";
  const ta = el("textarea", "curl-ta");
  ta.placeholder = `curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx' -H 'Content-Type: application/json' --data-raw '{"a":1}'`;
  f.appendChild(ta);
  m.appendChild(f);
  const acts = el("div", "acts");
  const sp = el("div");
  sp.style.flex = "1";
  const c = el("button", "btn ghost", "\u53D6\u6D88");
  c.onclick = close;
  const ok = el("button", "btn primary", "\u89E3\u6790\u5E76\u65B0\u5EFA");
  ok.onclick = () => {
    const txt = ta.value.trim();
    if (!txt) {
      setStatus("\u8BF7\u7C98\u8D34 curl \u547D\u4EE4", "warn");
      return;
    }
    try {
      const p = parseCurl(txt);
      if (!p.url) {
        setStatus("\u672A\u80FD\u4ECE\u547D\u4EE4\u4E2D\u89E3\u6790\u51FA URL", "err");
        return;
      }
      const nt = newTab({
        name: "cURL: " + shortUrl(p.url),
        method: p.method,
        url: p.url,
        bodyType: p.bodyType,
        body: p.body,
        headers: (p.headers.length ? p.headers.map((h) => ({ id: uid(), on: true, k: h.k, v: h.v })) : []).concat([blankRow()])
      });
      syncUrlToParams(nt);
      nt.dirty = true;
      state.tabs.unshift(nt);
      state.activeTab = nt.id;
      renderAll();
      persist();
      close();
      setStatus("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A" + p.method + " " + p.url, "ok");
      const fb = p.headers.filter((h) => BROWSER_STRIP.test(h.k));
      if (fb.length && !_panelMode2) {
        setStatus("\u26A0 \u5BFC\u5165\u542B\u6D4F\u89C8\u5668\u7981\u53D1\u5934\uFF08" + fb.map((h) => h.k).join(", ") + "\uFF09\u2014\u2014\u53D1\u9001\u65F6\u9700\u5F00\u542F\u300C\u{1F6E1} \u4EE3\u7406\u300D\uFF0C\u5426\u5219\u8FD9\u4E9B\u5934\u4F1A\u88AB\u5265\u79BB", "warn");
        if (!ui.proxyOn) setTimeout(() => {
          const pb = $("#proxyBtn");
          if (pb) {
            pb.classList.add("pulse-hint");
            pb.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => pb.classList.remove("pulse-hint"), 2400);
          }
        }, 300);
      }
    } catch (e) {
      setStatus("cURL \u89E3\u6790\u5931\u8D25\uFF1A" + e.message, "err");
    }
  };
  acts.append(c, sp, ok);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  ta.focus();
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  function close() {
    bg.classList.remove("open");
    bg.innerHTML = "";
  }
}
function toCurl(t) {
  let url = resolveVars(t.url.trim());
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = "https://" + url;
  const Q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const parts = ["curl -X " + t.method + " " + Q(url)];
  const headers = {};
  t.headers.filter((r) => r.on && r.k).forEach((r) => headers[resolveVars(r.k)] = resolveVars(r.v));
  let body = null;
  if (!["GET", "HEAD"].includes(t.method)) {
    if (t.bodyType === "json") {
      body = resolveVars(t.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    } else if (t.bodyType === "text") body = resolveVars(t.body);
    else if (t.bodyType === "form") {
      body = t.formBody.filter((r) => r.on && r.k).map((r) => encodeURIComponent(resolveVars(r.k)) + "=" + encodeURIComponent(resolveVars(r.v))).join("&");
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }
  Object.entries(headers).forEach(([k, v]) => parts.push("-H " + Q(k + ": " + v)));
  if (body) parts.push("--data-raw " + Q(body));
  return parts.join(" \\\n  ");
}
function markDirty(t) {
  if (!t.dirty) {
    t.dirty = true;
    renderTabs();
  }
}
function findSaved(id) {
  for (const g of state.collections) {
    const r = g.requests.find((x) => x.id === id);
    if (r) return { g, r };
  }
  return null;
}
function snapshot(t) {
  return { method: t.method, url: t.url, params: JSON.parse(JSON.stringify(t.params)), headers: JSON.parse(JSON.stringify(t.headers)), bodyType: t.bodyType, body: t.body, formBody: JSON.parse(JSON.stringify(t.formBody)) };
}
function shortUrl(u) {
  try {
    const x = new URL(/^[a-z]+:\/\//i.test(u) ? u : "https://" + u.replace(/^\{\{[^}]+\}\}/, "http://x"));
    return x.pathname && x.pathname.length > 1 ? x.pathname : x.hostname;
  } catch (e) {
    return String(u).slice(0, 28);
  }
}
function saveCurrent() {
  const t = activeTab();
  if (t.savedId) {
    const f = findSaved(t.savedId);
    if (f) {
      Object.assign(f.r, snapshot(t));
      f.r.name = t.name;
      t.dirty = false;
      persist();
      renderTabs();
      renderSidebar();
      setStatus("\u5DF2\u66F4\u65B0\u300C" + t.name + "\u300D", "ok");
      return;
    }
  }
  const groupOpts = state.collections.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
  openModal("\u4FDD\u5B58\u8BF7\u6C42", "\u628A\u5F53\u524D\u8BF7\u6C42\u5B58\u5165\u4E00\u4E2A\u5206\u7EC4", [
    { label: "\u540D\u79F0", id: "mName", type: "text", value: t.url ? t.method + " " + shortUrl(t.url) : "\u672A\u547D\u540D\u8BF7\u6C42" },
    { label: "\u5206\u7EC4", id: "mGroup", type: "select", html: groupOpts + '<option value="__new">\uFF0B \u65B0\u5EFA\u5206\u7EC4\u2026</option>' }
  ], (vals) => {
    let gid = vals.mGroup;
    if (gid === "__new" || !state.collections.length) {
      const gn = prompt("\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A", "\u65B0\u5206\u7EC4");
      if (!gn) return false;
      const g2 = { id: uid(), name: gn, collapsed: false, requests: [] };
      state.collections.push(g2);
      gid = g2.id;
    }
    const g = state.collections.find((x) => x.id === gid);
    const r = Object.assign({ id: uid(), name: vals.mName || "\u672A\u547D\u540D\u8BF7\u6C42" }, snapshot(t));
    g.requests.push(r);
    t.savedId = r.id;
    t.name = r.name;
    t.dirty = false;
    persist();
    renderTabs();
    renderSidebar();
    setStatus("\u5DF2\u4FDD\u5B58\u5230\u300C" + g.name + "\u300D", "ok");
  });
}
function openSaved(r) {
  const exist = state.tabs.find((t2) => t2.savedId === r.id);
  if (exist) {
    state.activeTab = exist.id;
    renderAll();
    return;
  }
  const t = newTab({ name: r.name, savedId: r.id, method: r.method, url: r.url, params: JSON.parse(JSON.stringify(r.params || [blankRow()])), headers: JSON.parse(JSON.stringify(r.headers || [blankRow()])), bodyType: r.bodyType || "none", body: r.body || "", formBody: JSON.parse(JSON.stringify(r.formBody || [blankRow()])) });
  if (!t.params.length) t.params = [blankRow()];
  if (!t.headers.length) t.headers = [blankRow()];
  if (!t.formBody.length) t.formBody = [blankRow()];
  state.tabs.unshift(t);
  state.activeTab = t.id;
  renderAll();
  persist();
  setStatus("\u5DF2\u8F7D\u5165\u300C" + r.name + "\u300D");
}
function deleteSaved(g, r) {
  if (!confirm("\u5220\u9664\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u300C" + r.name + "\u300D\uFF1F")) return;
  g.requests = g.requests.filter((x) => x.id !== r.id);
  state.tabs.forEach((t) => {
    if (t.savedId === r.id) {
      t.savedId = null;
      t.dirty = true;
    }
  });
  persist();
  renderSidebar();
  renderTabs();
}
function renameGroup(g) {
  const n = prompt("\u5206\u7EC4\u540D\u79F0\uFF1A", g.name);
  if (n == null) return;
  g.name = n.trim() || g.name;
  persist();
  renderSidebar();
}
function deleteGroup(g) {
  if (!confirm("\u5220\u9664\u5206\u7EC4\u300C" + g.name + "\u300D\u53CA\u5176\u4E2D " + g.requests.length + " \u4E2A\u8BF7\u6C42\uFF1F")) return;
  const ids = g.requests.map((r) => r.id);
  state.collections = state.collections.filter((x) => x.id !== g.id);
  state.tabs.forEach((t) => {
    if (ids.includes(t.savedId)) {
      t.savedId = null;
      t.dirty = true;
    }
  });
  persist();
  renderSidebar();
  renderTabs();
}
function closeTab(t) {
  if (t.dirty && (t.url || t.savedId)) {
    if (!confirm("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F")) return;
  }
  const i = state.tabs.indexOf(t);
  state.tabs.splice(i, 1);
  if (!state.tabs.length) {
    const nt = newTab();
    state.tabs.unshift(nt);
    state.activeTab = nt.id;
  } else if (state.activeTab === t.id) state.activeTab = state.tabs[Math.max(0, i - 1)].id;
  renderAll();
  persist();
}
function closeOthers(t) {
  state.tabs = state.tabs.filter((x) => x === t);
  state.activeTab = t.id;
  renderAll();
  persist();
}
function closeRight(t) {
  const i = state.tabs.indexOf(t);
  state.tabs = state.tabs.slice(0, i + 1);
  state.activeTab = t.id;
  renderAll();
  persist();
}
function closeLeft(t) {
  const i = state.tabs.indexOf(t);
  state.tabs = state.tabs.slice(i);
  state.activeTab = t.id;
  renderAll();
  persist();
}
var _ctxTab = null;
var _ctxMenuClose = null;
function showTabCtxMenu(e, t) {
  e.preventDefault();
  e.stopPropagation();
  _ctxTab = t;
  if (_ctxMenuClose) _ctxMenuClose();
  const menu = el("div", "ctx-menu");
  menu.style.cssText = "position:fixed;z-index:10001;background:var(--bg-2, #1e1f26);border:1px solid var(--line, #2a2b32);border-radius:8px;padding:4px 0;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.4)";
  menu.style.left = Math.min(e.clientX, innerWidth - 180) + "px";
  menu.style.top = Math.min(e.clientY, innerHeight - 8) + "px";
  getRoot().appendChild(menu);
  menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 8) + "px";
  const items = [
    { label: "\u2715 \u5173\u95ED", action: () => {
      closeTab(t);
      closeMenu();
    } },
    { label: "\u5173\u95ED\u5176\u4ED6", action: () => {
      closeOthers(t);
      closeMenu();
    } },
    { label: "\u5173\u95ED\u53F3\u4FA7", action: () => {
      closeRight(t);
      closeMenu();
    } },
    { label: "\u5173\u95ED\u5DE6\u4FA7", action: () => {
      closeLeft(t);
      closeMenu();
    } },
    { sep: true },
    { label: "\u270E \u91CD\u547D\u540D", action: () => {
      const n = prompt("\u91CD\u547D\u540D tab\uFF1A", t.name);
      if (n != null) {
        t.name = n.trim() || t.name;
        renderTabs();
        persist();
      }
      closeMenu();
    } },
    { label: "\u{1F4CB} \u590D\u5236 URL", action: () => {
      copy(t.url || "", "URL \u5DF2\u590D\u5236");
      closeMenu();
    } },
    { label: "cURL \u590D\u5236", action: () => {
      copy(toCurl(t), "cURL \u5DF2\u590D\u5236");
      closeMenu();
    } }
  ];
  items.forEach((item) => {
    if (item.sep) {
      const hr = el("div");
      hr.style.cssText = "height:1px;background:var(--line,#2a2b32);margin:4px 0";
      menu.appendChild(hr);
      return;
    }
    const b = el("button");
    b.textContent = item.label;
    b.style.cssText = "display:block;width:100%;padding:6px 14px;text-align:left;font-size:12px;color:var(--ink,#d8dae2);background:none;border:none;cursor:pointer;white-space:nowrap";
    b.onmouseenter = () => b.style.background = "var(--surface,#262830)";
    b.onmouseleave = () => b.style.background = "none";
    b.onclick = item.action;
    menu.appendChild(b);
  });
  function closeMenu() {
    menu.remove();
    _ctxMenuClose = null;
    document.removeEventListener("keydown", _onKey);
    document.removeEventListener("mousedown", _onDoc);
  }
  _ctxMenuClose = closeMenu;
  function _onKey(e2) {
    if (e2.key === "Escape") closeMenu();
  }
  function _onDoc(e2) {
    if (!menu.contains(e2.target)) closeMenu();
  }
  setTimeout(() => {
    document.addEventListener("keydown", _onKey);
    document.addEventListener("mousedown", _onDoc);
  }, 0);
}
function openModal(title, sub, fields, onOk) {
  const bg = $("#modalBg");
  const m = el("div", "modal");
  m.innerHTML = `<h3>${esc(title)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}`;
  fields.forEach((f) => {
    const fd = el("div", "field");
    fd.innerHTML = `<label>${esc(f.label)}</label>` + (f.type === "select" ? `<select id="${f.id}">${f.html}</select>` : `<input id="${f.id}" type="text" value="${esc(f.value || "")}" />`);
    m.appendChild(fd);
  });
  const acts = el("div", "acts");
  const sp = el("div");
  sp.style.flex = "1";
  const cancel = el("button", "btn ghost", "\u53D6\u6D88");
  cancel.onclick = close;
  const ok = el("button", "btn primary", "\u786E\u5B9A");
  ok.onclick = () => {
    const vals = {};
    fields.forEach((f) => vals[f.id] = $("#" + f.id, m).value);
    if (onOk(vals) !== false) close();
  };
  acts.append(sp, cancel, ok);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  const first = m.querySelector("input,select");
  if (first) {
    first.focus();
    if (first.select) first.select();
  }
  m.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "SELECT") ok.click();
    if (e.key === "Escape") close();
  });
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  function close() {
    bg.classList.remove("open");
    bg.innerHTML = "";
  }
}
function bindImportExport() {
  const eb = $("#exportBtn");
  if (eb) eb.onclick = () => {
    const data = JSON.stringify({ relay: 2, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), collections: state.collections, envs: state.envs }, null, 2);
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = "relay-export.json";
    a.click();
    setStatus("\u5DF2\u5BFC\u51FA\u96C6\u5408\u4E0E\u73AF\u5883", "ok");
  };
  const ib = $("#importBtn");
  if (ib) ib.onclick = () => $("#fileInput").click();
  const fi = $("#fileInput");
  if (fi) fi.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        const cols = Array.isArray(d) ? d : d.collections;
        if (!Array.isArray(cols)) throw new Error("\u683C\u5F0F\u4E0D\u7B26");
        cols.forEach((g) => {
          g.id = uid();
          (g.requests || []).forEach((r) => r.id = uid());
        });
        state.collections = state.collections.concat(cols);
        if (d.envs && Array.isArray(d.envs)) {
          d.envs.forEach((en) => {
            en.id = uid();
          });
          state.envs = state.envs.concat(d.envs);
          renderEnv();
        }
        persist();
        renderSidebar();
        setStatus("\u5DF2\u5BFC\u5165 " + cols.length + " \u4E2A\u5206\u7EC4", "ok");
      } catch (err) {
        setStatus("\u5BFC\u5165\u5931\u8D25\uFF1A" + err.message, "err");
      }
      $("#fileInput").value = "";
    };
    rd.readAsText(f);
  };
}
function downloadResp() {
  const t = activeTab();
  const r = t.response;
  if (!r || r.error) return;
  const d = getDrilled(t);
  let name = "response";
  try {
    const u = new URL(r.url);
    name = u.pathname.split("/").pop() || "response";
  } catch (e) {
  }
  let blobUrl, revoke = false;
  if (r.isBinary && r.blobUrl && !t.respPath) {
    blobUrl = r.blobUrl;
  } else {
    const text = d.hasJSON ? JSON.stringify(d.data, null, 2) : r.text;
    if (!/\./.test(name)) name += d.hasJSON ? ".json" : /html/.test(r.contentType) ? ".html" : ".txt";
    blobUrl = URL.createObjectURL(new Blob([text], { type: r.contentType || "text/plain" }));
    revoke = true;
  }
  const a = el("a");
  a.href = blobUrl;
  a.download = name;
  a.click();
  if (revoke) setTimeout(() => URL.revokeObjectURL(blobUrl), 1e3);
  setStatus("\u5DF2\u4E0B\u8F7D " + name, "ok");
}
function bindEvents() {
  const sb = $("#sendBtn");
  if (sb) sb.onclick = send;
  const sv = $("#saveBtn");
  if (sv) sv.onclick = saveCurrent;
  const cb = $("#curlBtn");
  if (cb) cb.onclick = () => copy(toCurl(activeTab()), "cURL \u5DF2\u590D\u5236");
  const ci = $("#curlImportBtn");
  if (ci) ci.onclick = openCurlImport;
  const cr = $("#copyResBtn");
  if (cr) cr.onclick = () => {
    const t = activeTab();
    const d = getDrilled(t);
    if (!t.response || t.response.error) return;
    copy(d.hasJSON ? JSON.stringify(d.data, null, 2) : t.response.text || "", "\u5DF2\u590D\u5236");
  };
  const dl = $("#dlBtn");
  if (dl) dl.onclick = downloadResp;
  const wr = $("#wrapBtn");
  if (wr) wr.onclick = () => {
    const on = toggleRawWrap();
    $("#wrapBtn").style.color = on ? "var(--brand)" : "";
    renderRespBody();
  };
  const pt = $("#prettyBtn");
  if (pt) pt.onclick = () => {
    const t = activeTab();
    t.prettyCells = t.prettyCells === false;
    persist();
    renderRespBody();
  };
  const te = $("#treeExpand");
  if (te) te.onclick = () => {
    activeTab().treeOpen = "all";
    renderRespBody();
  };
  const tc = $("#treeCollapse");
  if (tc) tc.onclick = () => {
    activeTab().treeOpen = "none";
    renderRespBody();
  };
  const url = $("#url");
  if (url) {
    url.addEventListener("input", (e) => {
      const t = activeTab();
      t.url = e.target.value;
      markDirty(t);
      updateResolvedPreview();
    });
    url.addEventListener("change", (e) => {
      const t = activeTab();
      t.url = e.target.value;
      syncUrlToParams(t);
      if (t.reqTab === "params") renderReqEditor();
      persist();
    });
    url.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
    });
  }
  $$("#reqSubtabs .subtab").forEach((b) => b.onclick = () => {
    activeTab().reqTab = b.dataset.rt;
    renderReqEditor();
    persist();
  });
  $$("#resSubtabs .subtab").forEach((b) => b.onclick = () => {
    if (b.classList.contains("disabled")) return;
    activeTab().respView = b.dataset.rv;
    renderRespBody();
    persist();
  });
  const srch = $("#search");
  if (srch) srch.addEventListener("input", renderSidebar);
  const ng = $("#newGroup");
  if (ng) ng.onclick = () => {
    const n = prompt("\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A", "\u65B0\u5206\u7EC4");
    if (!n) return;
    state.collections.push({ id: uid(), name: n.trim(), collapsed: false, requests: [] });
    persist();
    renderSidebar();
  };
  const ts = $("#toggleSide");
  if (ts) ts.onclick = () => {
    ui.sideCollapsed = !ui.sideCollapsed;
    $("#main").classList.toggle("collapsed", ui.sideCollapsed);
    persist();
  };
  const tb = $("#tabbar");
  if (tb) tb.addEventListener("scroll", updateTabFade);
  const lb = $("#layoutBtn");
  if (lb) lb.onclick = () => {
    ui.layout = ui.layout === "h" ? "v" : "h";
    applyLayout();
    persist();
  };
  const pb = $("#proxyBtn");
  if (pb) pb.onclick = () => {
    if (_panelMode2) {
      setStatus("\u9762\u677F\u6A21\u5F0F\uFF1A\u8BF7\u6C42\u6052\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF08\u65E0\u9700\u624B\u52A8\u5F00\u5173\uFF09", "ok");
      return;
    }
    ui.proxyOn = !ui.proxyOn;
    applyProxyBtn();
    persist();
    setStatus(ui.proxyOn ? "\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406 \xB7 \u8BF7\u6C42\u7ECF\u672C\u5730\u540E\u7AEF /__proxy \u8F6C\u53D1" : "\u5DF2\u5173\u95ED\u4EE3\u7406 \xB7 \u6D4F\u89C8\u5668\u76F4\u8FDE", "ok");
  };
  document.addEventListener("keydown", (e) => {
    if (currentView() !== "api") return;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveCurrent();
    }
  });
}
function applyProxyBtn() {
  const b = $("#proxyBtn");
  if (!b) return;
  b.innerHTML = _panelMode2 ? "\u{1F6E1} \u4EE3\u7406: \u5F00(\u5BBF\u4E3B)" : ui.proxyOn ? "\u{1F6E1} \u4EE3\u7406: \u5F00" : "\u{1F6E1} \u4EE3\u7406: \u5173";
  b.style.color = ui.proxyOn ? "var(--brand)" : "";
  b.style.borderColor = ui.proxyOn ? "var(--brand)" : "";
  b.disabled = _panelMode2;
}
function bindDividerDrag() {
  const div = $("#divider"), split = $("#split");
  if (!div || !split) return;
  let dragging = false;
  div.addEventListener("mousedown", (e) => {
    dragging = true;
    document.body.style.cursor = ui.layout === "h" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const r = split.getBoundingClientRect();
    if (ui.layout === "h") {
      const w = Math.max(160, Math.min(Math.max(60, r.width - 180), e.clientX - r.left));
      ui.reqW = w;
      split.style.setProperty("--reqW", w + "px");
    } else {
      const h = Math.max(80, Math.min(Math.max(80, r.height - 120), e.clientY - r.top));
      ui.reqH = h;
      split.style.setProperty("--reqH", h + "px");
    }
  });
  document.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persist();
    }
  });
}
function bindCellTooltip() {
  const tip = $("#cellTip");
  if (!tip) return;
  let on = false;
  const wantShow = (td) => {
    const full = td.getAttribute("data-full");
    if (full == null || full === "") return null;
    const truncated = td.scrollWidth > td.clientWidth + 1;
    return truncated || full.length > 56 ? full : null;
  };
  document.addEventListener("mouseover", (e) => {
    const x = e.target;
    if (!(x instanceof Element)) return;
    const td = x.closest("td[data-full]");
    if (!td) {
      if (on) {
        tip.classList.remove("show");
        on = false;
      }
      return;
    }
    const full = wantShow(td);
    if (full == null) {
      if (on) {
        tip.classList.remove("show");
        on = false;
      }
      return;
    }
    tip.textContent = full.length > 2e3 ? full.slice(0, 2e3) + "\u2026" : full;
    tip.classList.add("show");
    on = true;
  });
  document.addEventListener("mousemove", (e) => {
    if (!on) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  });
  document.addEventListener("mouseout", (e) => {
    const x = e.target;
    if (!(x instanceof Element)) return;
    if (x.closest("td[data-full]")) {
      tip.classList.remove("show");
      on = false;
    }
  });
}
function applyLayout() {
  const split = $("#split");
  if (!split) return;
  split.classList.toggle("h", ui.layout === "h");
  const defH = _panelMode2 ? 180 : 240, defW = _panelMode2 ? 320 : 520;
  split.style.setProperty("--reqH", (ui.reqH || defH) + "px");
  split.style.setProperty("--reqW", (ui.reqW || defW) + "px");
  const lb = $("#layoutBtn");
  if (lb) lb.innerHTML = ui.layout === "h" ? "\u21C5 \u4E0A\u4E0B" : "\u21C4 \u5DE6\u53F3";
}
function renderAll() {
  renderTabs();
  renderRequestBar();
  renderReqEditor();
  renderResponse();
  renderSidebar();
  renderEnv();
}
function initApi() {
  bindMethodMenu();
  bindTopEvents();
  bindImportExport();
  bindEvents();
  bindDividerDrag();
  bindCellTooltip();
  load();
  if (_panelMode2 && !localStorage.getItem(LS_UI)) ui.sideCollapsed = true;
  const main = $("#main");
  if (main) main.classList.toggle("collapsed", ui.sideCollapsed);
  applyLayout();
  applyProxyBtn();
  renderAll();
}

// src/panel.jsx
import { jsx } from "react/jsx-runtime";
var SPA_HTML = `
<div id="view">
  <div class="view app" id="viewApi">
  <header class="topbar">
    <button class="icon-btn" id="toggleSide" title="\u6298\u53E0/\u5C55\u5F00\u4FA7\u680F">\u2630</button>
    <div class="brand"><span class="dot"></span>API<small>\u8BF7\u6C42\u5BA2\u6237\u7AEF</small></div>
    <div class="spacer"></div>
    <div class="env-wrap">
      <button class="env-sel" id="envSel"><span class="ehex">\u2B21</span><span id="envName">\u65E0\u73AF\u5883</span><span class="car">\u25BC</span></button>
      <div class="env-menu" id="envMenu"></div>
    </div>
    <button class="top-act" id="curlImportBtn" title="\u7C98\u8D34 cURL \u5BFC\u5165\u4E3A\u8BF7\u6C42">\u2913 \u5BFC\u5165 cURL</button>
    <button class="top-act" id="layoutBtn" title="\u5207\u6362 \u4E0A\u4E0B/\u5DE6\u53F3 \u5E03\u5C40">\u21C4 \u5DE6\u53F3</button>
    <button class="top-act" id="proxyBtn" title="\u9762\u677F\u6A21\u5F0F\u6052\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u7ED5\u8FC7\u6D4F\u89C8\u5668 CORS \u4E0E\u6DF7\u5408\u5185\u5BB9\u9650\u5236\uFF08\u96F6\u672C\u5730\u670D\u52A1\uFF09">\u{1F6E1} \u4EE3\u7406: \u5F00(\u5BBF\u4E3B)</button>
    <div class="hint"><span><kbd>\u2318/Ctrl</kbd> <kbd>\u21B5</kbd> \u53D1\u9001</span><span><kbd>\u2318/Ctrl</kbd> <kbd>S</kbd> \u4FDD\u5B58</span></div>
  </header>

  <div class="main" id="main">
    <aside class="side">
      <div class="side-head">
        <span class="t">\u96C6\u5408 \xB7 COLLECTIONS</span>
        <button class="mini-btn" id="newGroup" title="\u65B0\u5EFA\u5206\u7EC4">\uFF0B</button>
        <button class="mini-btn" id="importBtn" title="\u5BFC\u5165\u96C6\u5408 JSON">\u21A7</button>
        <button class="mini-btn" id="exportBtn" title="\u5BFC\u51FA\u96C6\u5408 JSON">\u21A5</button>
      </div>
      <div class="side-search"><input id="search" placeholder="\u{1F50D}  \u641C\u7D22\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u2026" /></div>
      <div class="tree" id="tree"></div>
    </aside>

    <section class="work">
      <div class="tabbar" id="tabbar"></div>
      <div class="reqbar">
        <div class="method-wrap">
          <button class="method-sel" id="methodSel"><span id="methodLabel">GET</span><span class="car">\u25BC</span></button>
          <div class="method-menu" id="methodMenu"></div>
        </div>
        <div class="url-wrap">
          <input class="url-input" id="url" placeholder="\u8BF7\u6C42 URL\uFF0C\u652F\u6301 {{baseUrl}}/path\u3001{{\u53D8\u91CF}} \u5360\u4F4D" spellcheck="false" />
          <div class="url-resolved" id="urlResolved"></div>
        </div>
        <button class="btn primary" id="sendBtn">\u53D1\u9001 <span class="k">\u2318\u21B5</span></button>
        <button class="btn" id="saveBtn">\u4FDD\u5B58</button>
        <button class="btn icon ghost" id="curlBtn" title="\u590D\u5236\u4E3A cURL">cURL</button>
      </div>

      <div class="split" id="split">
        <div class="req-region">
          <div class="subtabs" id="reqSubtabs">
            <button class="subtab active" data-rt="params">Params<span class="badge" id="bParams"></span></button>
            <button class="subtab" data-rt="headers">Headers<span class="badge" id="bHeaders"></span></button>
            <button class="subtab" data-rt="body">Body<span class="badge" id="bBody"></span></button>
          </div>
          <div class="pane" id="reqPane"></div>
        </div>

        <div class="divider" id="divider" title="\u62D6\u52A8\u8C03\u6574\u5927\u5C0F"></div>

        <div class="res-region">
          <div class="res-status" id="resStatus" style="display:none"></div>
          <div class="subtabs" id="resSubtabs" style="display:none">
            <button class="subtab" data-rv="table">\u8868\u683C</button>
            <button class="subtab" data-rv="object">\u5BF9\u8C61</button>
            <button class="subtab" data-rv="raw">\u539F\u59CB</button>
            <button class="subtab" data-rv="preview">\u9884\u89C8</button>
            <button class="subtab" data-rv="headers">Headers<span class="badge" id="bResH"></span></button>
            <span class="sp"></span>
            <button class="tool" id="prettyBtn" title="\u7F8E\u5316\u5355\u5143\u683C\uFF1A\u56FE\u7247\u7F29\u7565\u56FE + \u65F6\u95F4\u6233\u8F6C\u53EF\u8BFB\u65F6\u95F4\uFF08\u518D\u6B21\u70B9\u51FB\u663E\u793A\u539F\u59CB\u503C\uFF09">\u2726 \u7F8E\u5316</button>
            <button class="tool" id="treeExpand" title="\u5C55\u5F00\u5168\u90E8\u8282\u70B9">\u229E \u5C55\u5F00</button>
            <button class="tool" id="treeCollapse" title="\u6298\u53E0\u5168\u90E8\u8282\u70B9">\u229F \u6298\u53E0</button>
            <button class="tool" id="wrapBtn" title="\u5207\u6362\u81EA\u52A8\u6362\u884C">\u2B90 \u6362\u884C</button>
            <button class="tool" id="copyResBtn" title="\u590D\u5236\u5F53\u524D\u6570\u636E">\u29C9 \u590D\u5236</button>
            <button class="tool" id="dlBtn" title="\u4E0B\u8F7D\u54CD\u5E94\u4F53">\u2193 \u4E0B\u8F7D</button>
          </div>
          <div class="res-tools" id="resTools" style="display:none"></div>
          <div class="pane" id="resPane">
            <div class="res-idle">
              <div class="big">\u51C6\u5907\u5C31\u7EEA</div>
              \u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002
              <div class="tips">
                \xB7 <b>\u591A tab</b>\uFF1A\u9876\u90E8 \uFF0B \u65B0\u5EFA\uFF0C\u53CC\u51FB\u6807\u7B7E\u53EF\u91CD\u547D\u540D<br>
                \xB7 <b>\u73AF\u5883\u53D8\u91CF</b>\uFF1A\u53F3\u4E0A\u89D2\u5207\u6362\u73AF\u5883\uFF0CURL \u91CC\u7528 <b>{{baseUrl}}</b><br>
                \xB7 <b>\u5BFC\u5165 cURL</b>\uFF1A\u53F3\u4E0A\u89D2\u7C98\u8D34 curl \u547D\u4EE4\u4E00\u952E\u89E3\u6790<br>
                \xB7 <b>\u67E5\u6570\u636E</b>\uFF1A\u54CD\u5E94\u533A\u300C\u8DEF\u5F84\u300D\u4E0B\u94BB\u3001\u300C\u8FC7\u6EE4\u300D\u7B5B\u9009\uFF0C\u591A\u89C6\u56FE\u5207\u6362<br>
                \xB7 <b>\u8DE8\u57DF</b>\uFF1A\u8BF7\u6C42\u6052\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u7ED5\u8FC7 CORS / \u6DF7\u5408\u5185\u5BB9 / \u7981\u53D1\u5934\u9650\u5236\uFF08\u96F6\u672C\u5730\u670D\u52A1\uFF09
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <footer class="statusbar">
    <span class="msg" id="statusMsg">\u5C31\u7EEA \xB7 \u8BF7\u6C42\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u65E0 CORS \u9650\u5236</span>
    <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span></span>
  </footer>
  </div>
</div>
<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="cell-tip" id="cellTip"></div>
`;
function RelayDevkitPanel({ pluginId, onSendToChat }) {
  const containerRef = useRef(null);
  const initializedRef = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || initializedRef.current) return;
    resetRouter();
    container.innerHTML = SPA_HTML;
    try {
      const style = document.createElement("style");
      style.setAttribute("data-relay-devkit", "");
      style.textContent = main_default;
      container.prepend(style);
    } catch (e) {
      console.warn("[RELAY DevKit] CSS injection failed:", e);
    }
    setRoot(container);
    setPanelMode(true);
    configureViewHost({ persist, rerender: renderRespBody });
    registerView({ id: "api", label: "API \u8BF7\u6C42", icon: "\u21C5" });
    setApiPanelMode(true);
    initApi();
    startRouter();
    initializedRef.current = true;
    return () => {
      container.innerHTML = "";
      setRoot(document);
      resetRouter();
      initializedRef.current = false;
    };
  }, []);
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: containerRef,
      className: "relay-devkit-panel",
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg, #16181e)",
        color: "var(--ink, #d8dae2)"
      }
    }
  );
}
export {
  RelayDevkitPanel as default
};
//# sourceMappingURL=panel.js.map
