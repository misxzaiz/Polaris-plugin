import{useEffect as za,useRef as Mt}from"react";var Ne=`/* ============================================================
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
.relay-devkit-panel .tabbar{display:flex;align-items:stretch;height:var(--tabsbar);min-height:var(--tabsbar);border-bottom:1px solid var(--line);background:var(--bg-2);overflow-x:auto;overflow-y:hidden}
.relay-devkit-panel .tabbar::-webkit-scrollbar{height:0}
.relay-devkit-panel .rtab{display:flex;align-items:center;gap:8px;padding:0 12px;border-right:1px solid var(--line);cursor:pointer;color:var(--dim);transition:.14s;white-space:nowrap;max-width:240px;position:relative;flex:none}
.relay-devkit-panel .rtab:hover{background:var(--surface);color:var(--ink)}
.relay-devkit-panel .rtab.active{background:var(--surface-2);color:var(--ink)}
.relay-devkit-panel .rtab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand)}
.relay-devkit-panel .rtab .tm{font-size:9px;font-weight:700;flex:none}
.relay-devkit-panel .rtab .tn{font-size:12px;max-width:138px;overflow:hidden;text-overflow:ellipsis}
.relay-devkit-panel .rtab .dirty{width:6px;height:6px;border-radius:50%;background:var(--brand);flex:none}
.relay-devkit-panel .rtab .tx{width:16px;height:16px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:var(--dimmer);flex:none}
.relay-devkit-panel .rtab .tx:hover{color:var(--ink);background:var(--surface-3)}
.relay-devkit-panel .tab-add{flex:none;width:38px;display:inline-flex;align-items:center;justify-content:center;color:var(--dim);font-size:18px;border-right:1px solid var(--line)}
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
`;var fe=document;function Te(e){fe=e||document}function ue(){return fe}var b=(e,t=fe)=>t.querySelector(e),Y=(e,t=fe)=>[...t.querySelectorAll(e)],U=()=>"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7),g=e=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),c=(e,t,a)=>{let i=document.createElement(e);return t&&(i.className=t),a!=null&&(i.innerHTML=a),i},Pe=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"],le=e=>e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB",be=e=>e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s",se=e=>"m-"+e,Be=null;function $(e,t){let a=b("#statusMsg");a&&(a.textContent=e,a.className="msg"+(t?" "+t:""),clearTimeout(Be),t&&(Be=setTimeout(()=>{a.className="msg",a.textContent="\u5C31\u7EEA \xB7 \u7EAF\u524D\u7AEF\u8FD0\u884C\uFF0C\u8DE8\u57DF\u8BF7\u6C42\u53D7\u6D4F\u89C8\u5668 CORS \u7B56\u7565\u9650\u5236"},4500)))}function Nt(e){let t=b("#toast");t&&(t.innerHTML=e,t.classList.add("show"),clearTimeout(t._t),t._t=setTimeout(()=>t.classList.remove("show"),1500))}async function W(e,t){try{await navigator.clipboard.writeText(e)}catch{let i=c("textarea");i.value=e,document.body.appendChild(i),i.select();try{document.execCommand("copy")}catch{}i.remove()}Nt((t||"\u5DF2\u590D\u5236")+" <b>\u2713</b>")}function xe(e){let t=a=>String(a).padStart(2,"0");return e.getFullYear()+"-"+t(e.getMonth()+1)+"-"+t(e.getDate())+" "+t(e.getHours())+":"+t(e.getMinutes())+":"+t(e.getSeconds())}var te=[];function qe(e){let t=te.findIndex(i=>i.id===e.id),a=Object.assign({inited:!1},e);t>=0?te[t]=a:te.push(a)}function ze(){te.length=0,Se=null,Ie="#/api",Je=null}var Se=null,je=!1,Ie="#/api",Je=null;function _e(){return Se}function Ve(e,t){je=!!e,Je=t||null}function Bt(e){return"#view"+e.charAt(0).toUpperCase()+e.slice(1)}function Ue(){let t=((je?Ie:location.hash).match(/^#\/(\w+)/)||[])[1]||"api";te.some(r=>r.id===t)||(t="api"),Se=t,Y("#view > .view").forEach(r=>r.classList.remove("on"));let a=b(Bt(t));a&&a.classList.add("on");let i=te.find(r=>r.id===t);i&&i.init&&!i.inited&&(i.init(),i.inited=!0)}function De(){je||window.addEventListener("hashchange",Ue),Ue()}var de=()=>{},he=()=>{};function Fe(e){e&&e.persist&&(de=e.persist),e&&e.rerender&&(he=e.rerender)}var me=null;function pe(){me&&(me.remove(),me=null),document.removeEventListener("click",pe),document.removeEventListener("keydown",Ge)}function Ge(e){e.key==="Escape"&&pe()}function Ye(e,t){if(!t||!t.trim())return{ok:!0,value:e};let a=t.replace(/\[(\w+)\]/g,".$1").split(".").map(r=>r.trim()).filter(r=>r!==""),i=e;for(let r of a){if(i==null)return{ok:!1};if(Array.isArray(i)){let n=Number(r);if(!Number.isInteger(n)||n<0||n>=i.length)return{ok:!1};i=i[n]}else if(typeof i=="object"){if(!(r in i))return{ok:!1};i=i[r]}else return{ok:!1}}return{ok:!0,value:i}}function Xe(e){let t=[],a=new Set,i=(n,o)=>{if(a.has(n))return;a.add(n);let l="value",s;Array.isArray(o)?(l="array",s=o.length):o&&typeof o=="object"&&(l="object",s=Object.keys(o).length),t.push({path:n,kind:l,count:s})},r=(n,o,l)=>{if(!(t.length>250)){if(Array.isArray(n)){if(n.length){let s=o?o+"[0]":"[0]";i(s,n[0]),n[0]&&typeof n[0]=="object"&&l<4&&r(n[0],s,l+1)}}else if(n&&typeof n=="object")for(let s of Object.keys(n)){let p=o?o+"."+s:s;i(p,n[s]),n[s]&&typeof n[s]=="object"&&l<4&&r(n[s],p,l+1)}}};return i("",e),r(e,"",0),t}var ye=!1;function Ke(){return ye=!ye,ye}function Ze(e,t){let a;return t!==void 0?a=Pt(JSON.stringify(t,null,2)):e.isBinary?a=g(`[\u4E8C\u8FDB\u5236\u5185\u5BB9 \xB7 ${e.contentType} \xB7 ${le(e.size)}]`):a=g(e.text),c("pre","raw"+(ye?" wrap":""),a)}function Pt(e){return g(e).replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+\.?\d*(?:[eE][+\-]?\d+)?)/g,(t,a,i,r,n)=>a!=null?`<span class="${i?"tok-key":"tok-str"}">${a}</span>${i||""}`:r!=null?`<span class="tok-bool">${r}</span>`:n!=null?`<span class="tok-num">${n}</span>`:'<span class="tok-null">null</span>')}function Ee(e){if(!e||!e.trim())return{ast:[],plainText:""};let t=[],a=null,i=[],r="",n=!1,o="";for(let p=0;p<e.length;p++){let y=e[p];n?y===o?n=!1:r+=y:y==='"'||y==="'"?(n=!0,o=y):y===" "?r&&(i.push(r),r=""):r+=y}r&&i.push(r);let l=/^(-?)([*\w.一-鿿-]+)(:|=|==|~|>=|>|<=|<)([\s\S]*)$/;for(let p of i){let y=p.match(l);if(!y){p.startsWith("-")&&p.length>1?t.push({type:"text",value:p.slice(1),negated:!0}):(t.push({type:"text",value:p,negated:!1}),a=a===null?p:a+" "+p);continue}let[m,f,d,x,h]=y,v=f==="-";if(x===":"&&h.startsWith("/")&&h.endsWith("/")&&h.length>1){try{let k=new RegExp(h.slice(1,-1),"i");t.push({type:"field",field:d,op:"~",regex:k,negated:v})}catch{t.push({type:"text",value:p,negated:!1})}continue}if(x==="~"){try{let k=h.startsWith("/")&&h.endsWith("/")?h.slice(1,-1):h,C=new RegExp(k,"i");t.push({type:"field",field:d,op:"~",regex:C,negated:v})}catch{t.push({type:"text",value:p,negated:!1})}continue}if(x===">"||x===">="||x==="<"||x==="<="){let k=Number(h);if(!isNaN(k)){t.push({type:"field",field:d,op:x,numValue:k,negated:v});continue}t.push({type:"text",value:p,negated:!1}),a=a===null?p:a+" "+p;continue}if(x==="="||x==="=="){if(h==="true")t.push({type:"field",field:d,op:"=",boolValue:!0,negated:v});else if(h==="false")t.push({type:"field",field:d,op:"=",boolValue:!1,negated:v});else if(h==="null")t.push({type:"field",field:d,op:"=",nullValue:!0,negated:v});else{let k=Number(h);!isNaN(k)&&String(k)===h?t.push({type:"field",field:d,op:"=",numValue:k,negated:v}):t.push({type:"field",field:d,op:"=",value:h,negated:v})}continue}if(x===":"){h.startsWith("-")&&h.length>1?t.push({type:"field",field:d,op:":",value:h.slice(1),negated:!0}):d==="*"?t.push({type:"wildcard",op:":",value:h,negated:v}):t.push({type:"field",field:d,op:":",value:h,negated:v});continue}}return t.some(p=>p.type==="field"||p.type==="wildcard")&&(a=null),{ast:t,plainText:a||null}}function Z(e,t){if(t.type==="text"){let o=String(e==null?"":typeof e=="object"?JSON.stringify(e):e).toLowerCase().includes(t.value.toLowerCase());return t.negated?!o:o}if(t.type==="wildcard"){if(e&&typeof e=="object"){let s=(Array.isArray(e),Object.values(e)).some(p=>String(p==null?"":typeof p=="object"?JSON.stringify(p):p).toLowerCase().includes(t.value.toLowerCase()));return t.negated?!s:s}let o=String(e??"").toLowerCase().includes(t.value.toLowerCase());return t.negated?!o:o}let{field:a,op:i,negated:r}=t,n=e;if(i===":"){let o=String(n==null?"":typeof n=="object"?JSON.stringify(n):n).toLowerCase().includes(t.value.toLowerCase());return r?!o:o}if(i==="="){if(t.boolValue!==void 0){let l=n===!0||n===!1?n===t.boolValue:String(n).toLowerCase()===""+t.boolValue;return r?!l:l}if(t.nullValue){let l=n===null;return r?!l:l}if(t.numValue!==void 0){let l=typeof n=="number"?n===t.numValue:Number(n)===t.numValue;return r?!l:l}let o=String(n??"")===t.value;return r?!o:o}if(i==="~")try{let o=t.regex.test(String(n??""));return r?!o:o}catch{return!1}if(i===">"||i===">="||i==="<"||i==="<="){let o=typeof n=="number"?n:Number(n);if(isNaN(o))return!1;let l;return i===">"?l=o>t.numValue:i===">="?l=o>=t.numValue:i==="<"?l=o<t.numValue:l=o<=t.numValue,r?!l:l}return!0}function Ut(e,t,a){if(!t.length)return!0;for(let i of t){if(i.type==="text"||i.type==="wildcard"){if(!Z(e,i))return!1;continue}if(i.type==="field"){let r=e&&typeof e=="object"&&!Array.isArray(e)?e[i.field]:void 0;if(r===void 0){if(!Z(e,i))return!1}else if(!Z(r,i))return!1}}return!0}function qt(e,t,a){if(!a.length)return!0;for(let i of a){if(i.type==="text"){if(ge(e,t,i.value,i.negated))continue;return!1}if(i.type==="wildcard"){if(Qe(e,t,i.value,i.negated))continue;return!1}if(i.type==="field"){if(et(e,t,i))continue;return!1}}return!0}function ge(e,t,a,i){let r=a.toLowerCase(),n=!1;return e!=null&&String(e).toLowerCase().includes(r)&&(n=!0),n||(t&&typeof t=="object"?n=(Array.isArray(t)?t.map((l,s)=>[s,l]):Object.entries(t)).some(([l,s])=>ge(l,s,a,!1)):n=String(t??"").toLowerCase().includes(r)),i?!n:n}function Qe(e,t,a,i){let r=a.toLowerCase(),n=!1;return t&&typeof t=="object"?n=(Array.isArray(t)?t.map((l,s)=>[s,l]):Object.entries(t)).some(([l,s])=>String(s==null?"":typeof s=="object"?JSON.stringify(s):s).toLowerCase().includes(r)?!0:s&&typeof s=="object"?Qe(l,s,a,!1):!1):n=String(t??"").toLowerCase().includes(r),i?!n:n}function et(e,t,a){let{field:i,op:r,negated:n}=a;return e!=null&&String(e).toLowerCase()===i.toLowerCase()&&Z(t,a)?!0:t&&typeof t=="object"?(Array.isArray(t)?t.map((l,s)=>[s,l]):Object.entries(t)).some(([l,s])=>et(l,s,a)):!1}function tt(e){let t=[];for(let a of e)(a.type==="text"||a.type==="wildcard"||a.type==="field"&&a.op===":"||a.type==="field"&&a.op==="="&&a.value)&&t.push(a.value);return t}function ce(e,t){if(!t.length)return g(e);let a=g(e),i=a.toLowerCase(),r=[...t].sort((l,s)=>s.length-l.length),n=[];for(let l of r){let s=l.toLowerCase(),p=0;for(;;){let y=i.indexOf(s,p);if(y<0)break;n.push({s:y,e:y+s.length}),p=y+s.length}}if(!n.length)return a;n.sort((l,s)=>l.s-s.s);let o=[n[0]];for(let l=1;l<n.length;l++){let s=o[o.length-1];n[l].s<=s.e?s.e=Math.max(s.e,n[l].e):o.push(n[l])}for(let l=o.length-1;l>=0;l--){let{s,e:p}=o[l];a=a.slice(0,s)+'<span class="hl">'+a.slice(s,p)+"</span>"+a.slice(p)}return a}function It(e,t,a,i){let r=new Set(Object.keys(t||{})),n=e.filter(d=>!r.has(d)).length,o=!!a,l=c("div","col-picker"+(o?"":" collapsed")),s=()=>o?"\u25BE":"\u25B8",p=c("button","col-toggle");p.type="button",p.textContent=`\u5217 \xB7 ${n}/${e.length} ${s()}`,p.onclick=()=>{let d=!l.classList.contains("collapsed");l.classList.toggle("collapsed",d),p.textContent=`\u5217 \xB7 ${n}/${e.length} ${d?"\u25B8":"\u25BE"}`,i._saveOpen&&i._saveOpen(!d)},l.appendChild(p);let y=c("div","col-body"),m=c("button","col-q","\u5168\u9009");m.type="button";let f=c("button","col-q","\u5168\u4E0D\u9009");return f.type="button",m.onclick=()=>i({}),f.onclick=()=>{let d={};e.forEach(x=>d[x]=!0),i(d)},y.append(m,f),e.forEach(d=>{let x=!r.has(d),h=c("button","col-chip"+(x?" on":""));h.type="button",h.textContent=d,h.draggable=!0,h.onclick=()=>{let v={...t||{}};v[d]?delete v[d]:v[d]=!0,i(v)},h.addEventListener("dragstart",v=>{v.dataTransfer.setData("text/plain",d),v.dataTransfer.effectAllowed="move",h.classList.add("dragging")}),h.addEventListener("dragend",()=>h.classList.remove("dragging")),h.addEventListener("dragover",v=>{v.preventDefault(),v.dataTransfer.dropEffect="move",h.classList.add("drag-over")}),h.addEventListener("dragleave",()=>h.classList.remove("drag-over")),h.addEventListener("drop",v=>{v.preventDefault(),h.classList.remove("drag-over");let k=v.dataTransfer.getData("text/plain");if(!k||k===d)return;let C=[...e];C.splice(C.indexOf(k),1),C.splice(C.indexOf(d),0,k),i({...t||{}},C)}),y.appendChild(h)}),l.appendChild(y),l}function at(e,t){let a=c("div","jtree");if(e===void 0)return a.innerHTML='<span class="dimnote">\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u65E0\u6CD5\u4EE5\u5BF9\u8C61\u6811\u5C55\u793A\u3002\u8BF7\u5207\u5230\u300C\u539F\u59CB\u300D\u3002</span>',a;let i=(t.respFilter||"").trim(),{ast:r,plainText:n}=Ee(i),o=n!==null?n.toLowerCase():i?i.toLowerCase():"",l=tt(r),s={q:o,ast:r,hlTerms:l,pretty:t.prettyCells!==!1,openAll:t.treeOpen||"auto"},p=nt(null,e,0,s);return p?a.appendChild(p):a.innerHTML='<div class="dimnote">\u65E0\u5339\u914D\u300C'+g(o)+"\u300D\u7684\u5B57\u6BB5\u3002</div>",a}function rt(e,t,a){return!a||e!=null&&String(e).toLowerCase().includes(a)?!0:t&&typeof t=="object"?(Array.isArray(t)?t.map((r,n)=>[n,r]):Object.entries(t)).some(([r,n])=>rt(r,n,a)):String(t).toLowerCase().includes(a)}function ve(e,t){if(e=g(e),!t)return e;let a=e.toLowerCase().indexOf(t);return a<0?e:e.slice(0,a)+'<span class="hl">'+e.slice(a,a+t.length)+"</span>"+e.slice(a+t.length)}function Jt(e,t,a,i,r){if(e===null)return'<span class="jt-null">null</span>';let n=typeof e;if(i&&n==="string"&&it(e))return`<img class="cell-img" src="${g(e)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('\u{1F5BC}'))"><span class="cell-imn">${g(lt(e))}</span>`;if(i){let o=ot(a,e);if(o)return`<span class="cell-ts">\u{1F553} ${g(xe(o.date))}</span> <span class="jt-prev">(${g(st(e))})</span>`}return n==="string"?`<span class="jt-str">"${r&&r.length?ce(e,r):ve(e,t)}"</span>`:n==="number"?`<span class="jt-num">${r&&r.length?ce(String(e),r):ve(String(e),t)}</span>`:n==="boolean"?`<span class="jt-bool">${e}</span>`:g(String(e))}function nt(e,t,a,i){let r=i.q,n=i.ast;if(n&&n.length){if(!qt(e,t,n))return null}else if(r&&!rt(e,t,r))return null;let o=c("div","jt-node"),l=t&&typeof t=="object",s=i.hlTerms,p=e!=null?`<span class="jt-key">${s&&s.length?ce(String(e),s):ve(String(e),r)}</span><span class="jt-colon">: </span>`:"";if(!l){let S=c("div","jt-row");return S.innerHTML=p+Jt(t,r,e,i.pretty,s)+'<span class="jt-act"><b data-act="copy">copy</b></span>',S.querySelector("[data-act=copy]").onclick=()=>W(typeof t=="string"?t:JSON.stringify(t),"\u5DF2\u590D\u5236"),o.appendChild(S),o}let y=Array.isArray(t),m=y?t.map((S,T)=>[T,S]):Object.entries(t),f=i.openAll==="all"?!0:i.openAll==="none"?!1:r?!0:a<1,d=y?`[\u2026] ${m.length} \u9879`:`{\u2026} ${m.length} \u952E`,x=c("div","jt-row expandable");x.innerHTML=`<span class="jt-tog">${f?"\u25BE":"\u25B8"}</span>${p}<span class="jt-prev">${y?"[":"{"}</span><span class="jt-prev" data-prev>${f?"":" "+d+" "}</span><span class="jt-act"><b data-act="copy">copy</b></span>`;let h=c("div","jt-children"+(f?"":" hide"));m.forEach(([S,T])=>{let L=nt(S,T,a+1,i);L&&h.appendChild(L)});let v=c("div","jt-row");v.innerHTML=`<span class="jt-prev" style="padding-left:0">${y?"]":"}"}</span>`,h.appendChild(v);let k=x.querySelector(".jt-tog"),C=x.querySelector("[data-prev]");return x.addEventListener("click",S=>{if(S.target.dataset.act)return;let T=h.classList.toggle("hide");k.textContent=T?"\u25B8":"\u25BE",C.textContent=T?" "+d+" ":""}),x.querySelector("[data-act=copy]").onclick=S=>{S.stopPropagation(),W(JSON.stringify(t,null,2),"\u8282\u70B9\u5DF2\u590D\u5236")},o.append(x,h),o}var _t=/^(?:https?:)?\/\/[^\s'"]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#][^\s'"]*)?$/i;function it(e){return typeof e!="string"?!1:(e=e.trim(),/^data:image\//i.test(e)||_t.test(e))}function We(e){return e==null?!1:/(_at\b|\bat$|date|time|timestamp|\bts\b|created|updated|modified|expire|publish|issued|deleted|lastseen|lastlogin|epoch)/i.test(String(e))}function ot(e,t){if(typeof t=="string"){let a=t.trim();if(/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(a)){let i=new Date(a);if(!isNaN(+i))return{date:i}}if(We(e)&&/^\d{10}$|^\d{13}$/.test(a)){let i=Number(a),r=new Date(a.length===13?i:i*1e3);if(!isNaN(+r))return{date:r}}return null}if(typeof t=="number"&&We(e)&&isFinite(t)){if(t>=1e12&&t<4e12)return{date:new Date(t)};if(t>=1e9&&t<4e9)return{date:new Date(t*1e3)}}return null}function lt(e){if(/^data:/i.test(e))return"\u5185\u5D4C\u56FE\u7247";try{let t=new URL(e,location.href);return decodeURIComponent(t.pathname.split("/").pop()||e).slice(0,42)}catch{return String(e).split(/[?#]/)[0].split("/").pop().slice(0,42)}}function st(e){return e===null?"null":e===void 0?"":typeof e=="object"?JSON.stringify(e):String(e)}function Vt(e,t,a,i,r){let n=st(e);if(e===null)return{html:'<span class="cell-null">null</span>',full:n};if(e===void 0)return{html:'<span class="cell-null">\u2014</span>',full:""};if(typeof e=="object"){let l=JSON.stringify(e);return{html:`<span class="cobj">${g(l)}</span>`,full:l}}if(i&&typeof e=="string"&&it(e))return{html:`<img class="cell-img" src="${g(e)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="cell-imn">${g(lt(e))}</span>`,full:e};if(i){let l=ot(a,e);if(l)return{html:`<span class="cell-ts">\u{1F553} ${g(xe(l.date))}</span>`,full:n+"  \xB7  "+xe(l.date)}}let o=r&&r.length?ce(String(e),r):ve(String(e),t);return typeof e=="number"?{html:`<span class="cell-num">${o}</span>`,full:n}:typeof e=="boolean"?{html:`<span class="cell-bool">${e}</span>`,full:n}:{html:`<span class="cell-str">${o}</span>`,full:n}}function Dt(e){let t=[];if(Array.isArray(e))return t.push({label:"\u6839\u6570\u7EC4",path:"",data:e,count:e.length}),t;if(e&&typeof e=="object"){let a=(i,r,n)=>{for(let[o,l]of Object.entries(i)){let s=r?r+"."+o:o;Array.isArray(l)?t.push({label:s,path:s,data:l,count:l.length}):l&&typeof l=="object"&&n<1&&a(l,s,n+1)}};a(e,"",0),t.push({label:"\u5BF9\u8C61\u672C\u8EAB(\u952E\u503C)",path:"__self",data:e,count:Object.keys(e).length})}return t}function Wt(e,t){return t?Object.values(e).some(a=>String(typeof a=="object"?JSON.stringify(a):a).toLowerCase().includes(t)):!0}function Ft(e,t,a){return!t.length&&!a?!0:t.length?Ut(e,t):Wt(e,a)}function dt(e,t){let a=c("div","tbl-host"),i=Dt(e),r=i.find(T=>T.path===t.tableSel)||i[0];if(i.length>1){let T=c("div","tbl-cands");T.appendChild(c("span","lab","\u8868\u683C")),i.forEach(L=>{let E=c("button","tcand"+(L===r?" on":""),`${g(L.label)} <em>${L.count}</em>`);E.onclick=()=>{t.tableSel=L.path,de(),(t.rerender||he)()},T.appendChild(E)}),a.appendChild(T)}if(!r)return a.appendChild(c("div","prev-none","\u65E0\u53EF\u8868\u683C\u5316\u7684\u6570\u636E\u3002")),a;let n=(t.respFilter||"").trim(),{ast:o,plainText:l}=Ee(n),s=l!==null?l.toLowerCase():n.toLowerCase(),p=tt(o),y=t.prettyCells!==!1,m=r.path||"__root",f=c("div","tbl-wrap"),d=r.data,x=c("table","dt"),h=c("thead"),v=c("tbody"),k=(T,L)=>{let E=Vt(T,s,L,y,p);return`<td data-full="${g(E.full)}">${E.html}</td>`},C=t.sort&&t.sort[m]||null,S="";if(Array.isArray(d)&&r.path!=="__self")if(d.length&&d.every(L=>L&&typeof L=="object"&&!Array.isArray(L))){let L=[];d.forEach(M=>Object.keys(M).forEach(R=>{L.includes(R)||L.push(R)}));let E=t.colOrder&&t.colOrder[m]||[];if(E.length){let M=E.filter(A=>L.includes(A)),R=L.filter(A=>!E.includes(A));L=M.concat(R)}let H=t.hiddenCols&&t.hiddenCols[m]||{},O=L.filter(M=>!H[M]);if(L.length>=4){let M=!!(t._pickerOpen&&t._pickerOpen[m]),R=(A,q)=>{t.hiddenCols||(t.hiddenCols={}),t.hiddenCols[m]=A,q&&(t.colOrder||(t.colOrder={}),t.colOrder[m]=q),de(),(t.rerender||he)()};R._saveOpen=A=>{t._pickerOpen||(t._pickerOpen={}),t._pickerOpen[m]=A},a.appendChild(It(L,H,M,R))}let P=[];d.forEach((M,R)=>{Ft(M,o,s)&&P.push({o:M,i:R})});let z=P;if(C&&C.col){let{col:M,dir:R}=C;z=[...P].sort((A,q)=>{let J=A.o[M],K=q.o[M];if(J==null&&K==null)return 0;if(J==null)return 1;if(K==null)return-1;if(typeof J=="number"&&typeof K=="number")return R==="asc"?J-K:K-J;let _=String(J).localeCompare(String(K));return R==="asc"?_:-_})}h.innerHTML='<tr><th class="idx">#</th>'+O.map(M=>{let R="",A="";return C&&C.col===M&&(R=C.dir==="asc"?" sort-asc":" sort-desc",A=C.dir==="asc"?" \u25B2":" \u25BC"),`<th class="sortable${R}" data-col="${g(M)}">${g(M)}${A}</th>`}).join("")+"</tr>",h.addEventListener("click",M=>{let R=M.target.closest("th[data-col]");if(!R)return;let A=R.dataset.col;t.sort||(t.sort={});let q=t.sort[m],J="asc";q&&q.col===A&&(J=q.dir==="asc"?"desc":q.dir==="desc"?null:"asc"),J?t.sort[m]={col:A,dir:J}:delete t.sort[m],de(),(t.rerender||he)()}),z.forEach(({o:M,i:R})=>{let A=c("tr");A.innerHTML=`<td class="idx">${R}</td>`+O.map(q=>k(M[q],q)).join(""),v.appendChild(A)});let X=O.length;S=`\u6570\u7EC4 \xB7 ${z.length}/${d.length} \u884C \xD7 ${X} \u5217`,(s||n)&&(S+=` \xB7 \u8FC7\u6EE4\u300C${g(n)}\u300D`),C&&C.col&&(S+=` \xB7 \u6309 ${C.col} ${C.dir==="asc"?"\u5347\u5E8F":"\u964D\u5E8F"}`),O.length<L.length&&(S+=` \xB7 \u9690\u85CF ${L.length-O.length} \u5217`)}else{h.innerHTML='<tr><th class="idx">#</th><th>value</th></tr>';let L=0;d.forEach((E,H)=>{let O=String(typeof E=="object"?JSON.stringify(E):E).toLowerCase(),P=!0;if(o.length?P=Z(E,o[0])&&o.slice(1).every(X=>Z(E,X)):s&&!O.includes(s)&&(P=!1),!P)return;L++;let z=c("tr");z.innerHTML=`<td class="idx">${H}</td>`+k(E,null),v.appendChild(z)}),S=`\u6570\u7EC4 \xB7 ${L}/${d.length} \u9879\uFF08\u57FA\u7840/\u6DF7\u5408\u7C7B\u578B\uFF09`}else{h.innerHTML="<tr><th>key</th><th>value</th></tr>";let T=0,L=0;Object.entries(d).forEach(([E,H])=>{L++;let O=!0;if(o.length){for(let z of o)if(z.type==="field"){if(String(E).toLowerCase()===(z.field||"").toLowerCase()){if(!Z(H,z)){O=!1;break}}else if(!Z(H,z)&&!ge(E,H,z.type==="text"?z.value:z.value||"",z.negated)){O=!1;break}}else if(!ge(E,H,z.type==="text"?z.value:z.value||"",z.negated)){O=!1;break}}else s&&!(E.toLowerCase().includes(s)||String(typeof H=="object"?JSON.stringify(H):H).toLowerCase().includes(s))&&(O=!1);if(!O)return;T++;let P=c("tr");P.innerHTML=`<td style="color:var(--j-key)">${p&&p.length?ce(E,p):ve(E,s)}</td>`+k(H,E),v.appendChild(P)}),S=`\u5BF9\u8C61 \xB7 ${T}/${L} \u4E2A\u5B57\u6BB5`}return x.append(h,v),Gt(x,t,m),x.addEventListener("contextmenu",T=>{let L=T.target.closest("td");if(!L||L.classList.contains("idx"))return;T.preventDefault(),pe();let E=b("#cellTip");E&&E.classList.remove("show");let H=c("div","db-ctx");me=H;function O(Ht,Rt){let Ae=c("button","db-ctx-item",Ht);Ae.onclick=$t=>{$t.stopPropagation(),pe(),Rt()},H.appendChild(Ae)}function P(){H.appendChild(c("div","db-ctx-sep"))}let z=L.dataset.full!=null?L.dataset.full:L.textContent;O("\u590D\u5236\u503C",()=>W(z,"\u5DF2\u590D\u5236"));let X=L.cellIndex,M=h.rows[0],R=M&&M.cells[X];R&&R.dataset.col&&(P(),O("\u590D\u5236\u5217\u540D",()=>W(R.dataset.col,"\u5DF2\u590D\u5236\u5217\u540D"))),ue().appendChild(H),requestAnimationFrame(()=>{document.addEventListener("click",pe),document.addEventListener("keydown",Ge)});let A=H.offsetWidth,q=H.offsetHeight,J=innerWidth,K=innerHeight,_=6;H.style.left=(T.clientX+A+_>J?Math.max(_,T.clientX-A-_):T.clientX+_)+"px",H.style.top=(T.clientY+q+_>K?Math.max(_,T.clientY-q-_):T.clientY+_)+"px"}),S&&a.appendChild(c("div","tbl-note",S)),f.appendChild(x),a.appendChild(f),a}function Gt(e,t,a){t.colW||(t.colW={});let i=e.tHead;if(!i||!i.rows.length)return;let r=[...i.rows[0].cells],n=c("colgroup");r.forEach(()=>n.appendChild(c("col"))),e.insertBefore(n,i);let o=[...n.children],l=t.colW[a];l&&(e.style.tableLayout="fixed",r.forEach((s,p)=>{l[p]!=null&&(o[p].style.width=l[p]+"px")})),r.forEach((s,p)=>{let y=c("span","col-grip");y.title="\u62D6\u52A8\u8C03\u6574\u5217\u5BBD",s.appendChild(y),y.addEventListener("mousedown",m=>{m.preventDefault(),m.stopPropagation(),e.style.tableLayout!=="fixed"&&(r.forEach((v,k)=>o[k].style.width=v.getBoundingClientRect().width+"px"),e.style.tableLayout="fixed");let f=m.clientX,d=s.getBoundingClientRect().width,x=v=>{o[p].style.width=Math.max(46,Math.min(1600,d+(v.clientX-f)))+"px"},h=()=>{document.removeEventListener("mousemove",x),document.removeEventListener("mouseup",h),document.body.style.cursor="",document.body.style.userSelect="";let v=t.colW[a]||(t.colW[a]={});r.forEach((k,C)=>v[C]=Math.round(k.getBoundingClientRect().width)),de()};document.body.style.cursor="col-resize",document.body.style.userSelect="none",document.addEventListener("mousemove",x),document.addEventListener("mouseup",h)})})}function pt(e,t,a){let i=c("div","ti filter");i.innerHTML='<span class="lbl">\u8FC7\u6EE4</span>';let r=c("div","fb-bar"),n=c("input","fb-edit");n.type="text",n.placeholder="\u7B5B\u9009\u884C/\u5B57\u6BB5\u2026 \u652F\u6301 name:\u503C id>1 role:true",n.value=e.respFilter||"",n.spellcheck=!1;let o=c("div","fb-tokens"),l=c("div","fb-ac"),s=!1;function p(){s=!1,l.classList.remove("open"),l.innerHTML=""}function y(f){if(!f.length){p();return}l.innerHTML="",f.slice(0,12).forEach(d=>{let x=c("button","fb-ac-item");x.type="button",x.textContent=d,x.onclick=()=>{n.value+=d,n.focus(),p(),t()},l.appendChild(x)}),l.classList.add("open"),s=!0}function m(){o.innerHTML="";let f=(n.value||"").trim();if(!f){o.style.display="none";return}o.style.display="flex";let{ast:d}=Ee(f);for(let x of d){let h=c("span","ftk");if(x.type==="text")x.negated?h.innerHTML='<span class="ftk-neg">-</span><span class="ftk-val">'+g(x.value)+"</span>":h.innerHTML='<span class="ftk-val">'+g(x.value)+"</span>";else if(x.type==="wildcard")h.innerHTML='<span class="ftk-field">*</span><span class="ftk-op">:</span><span class="ftk-val">'+g(x.value)+"</span>";else if(x.type==="field"){let v="ftk-val",k=g(x.value||"");x.numValue!==void 0?(v="ftk-num",k=g(String(x.numValue))):x.boolValue!==void 0?(v="ftk-bool",k=g(String(x.boolValue))):x.nullValue?(v="ftk-null",k="null"):x.regex&&(v="ftk-val",k="/"+g(x.regex.source)+"/");let C=x.negated?'<span class="ftk-neg">-</span>':"";h.innerHTML=C+'<span class="ftk-field">'+g(x.field)+'</span><span class="ftk-op">'+g(x.op)+'</span><span class="'+v+'">'+k+"</span>"}o.appendChild(h)}}return n.addEventListener("input",()=>{e.respFilter=n.value,m();let f=n.value,d=n.selectionStart;if(a&&a.length){let x=f.slice(0,d),h=x.lastIndexOf(" "),k=x.slice(h+1).match(/^(-?)([\w.一-鿿-]*)$/);if(k&&k[2].length>0){let C=k[2].toLowerCase(),S=a.filter(T=>T.toLowerCase().startsWith(C)&&T.toLowerCase()!==C);S.length?y(S):p()}else p()}t()}),n.addEventListener("keydown",f=>{f.key==="Escape"&&p(),f.key==="Enter"&&(f.preventDefault(),p(),t())}),r.addEventListener("click",f=>{(f.target===r||f.target===o)&&n.focus()}),document.addEventListener("click",f=>{r.contains(f.target)||p()}),m(),r.append(o,n,l),i.appendChild(r),i}var ct=/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;function vt(e){try{return{ok:!0,value:JSON.parse(e)}}catch{return{ok:!1}}}async function Yt(e,t){let a=(window.__TAURI_INTERNALS__||{}).invoke;if(!a)throw new Error("Tauri invoke \u4E0D\u53EF\u7528\uFF08\u975E Polaris \u5BBF\u4E3B\u73AF\u5883\uFF09");return a(e,t)}async function ft({method:e,url:t,headers:a,body:i,bodyType:r,timeoutMs:n}){let o=await Yt("router_dispatch",{req:{target:"cap.http",payload:{action:"request",method:e,url:t,headers:a||{},body:i||"",bodyType:r||"text",timeoutMs:n||15e3}}});if(!o||!o.ok)throw new Error(o&&o.error||"cap.http \u8BF7\u6C42\u5931\u8D25");return o.result||{}}function ut(){return!!(window.__TAURI_INTERNALS__&&window.__TAURI_INTERNALS__.invoke)}async function Xt(e,t){let a=atob(e),i=new Uint8Array(a.length);for(let n=0;n<a.length;n++)i[n]=a.charCodeAt(n);let r=new Blob([i],{type:t||"application/octet-stream"});return URL.createObjectURL(r)}async function bt(e,t){let a=e.contentType||"",i=e.isBase64||!1,r=e.body||"",n=i||/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i.test(a);return{status:e.status,statusText:e.statusText||"",ok:!!e.ok,timeMs:e.timeMs||0,size:n?r.length:new Blob([r]).size,contentType:a,headers:e.headers||{},text:n?"":r,isBinary:n,blobUrl:n?await Xt(r,a):null,url:e.url||t,parsed:(()=>{if(!n)try{return JSON.parse(r)}catch{return}})()}}var mt="relay.tabs.v2",yt="relay.collections.v2",gt="relay.envs.v2",Re="relay.ui.v2",u={tabs:[],activeTab:null,collections:[],envs:[],activeEnv:null},j={sideCollapsed:!1,layout:"v",reqH:240,reqW:520,proxyOn:!1},D=!1;function kt(e){D=!!e,e&&(j.proxyOn=!0)}var B=()=>({id:U(),on:!0,k:"",v:""}),Me=/^(cookie|cookie2|user-agent|referer|origin|host|date|dnt|set-cookie|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*|accept-encoding|content-length)$/i;function re(e){return Object.assign({id:U(),name:"\u672A\u547D\u540D\u8BF7\u6C42",savedId:null,dirty:!1,method:"GET",url:"",params:[B()],headers:[B()],bodyType:"none",body:"",formBody:[B()],reqTab:"params",respView:"object",respPath:"",respFilter:"",tableSel:null,prettyCells:!0,colW:{},treeOpen:"auto",hiddenCols:{},sort:{},colOrder:{},response:null},e||{})}var N=()=>u.tabs.find(e=>e.id===u.activeTab);function w(){let e=u.tabs.map(t=>{let a={...t};return delete a.response,a});try{localStorage.setItem(mt,JSON.stringify({tabs:e,activeTab:u.activeTab})),localStorage.setItem(yt,JSON.stringify(u.collections)),localStorage.setItem(gt,JSON.stringify({envs:u.envs,activeEnv:u.activeEnv})),localStorage.setItem(Re,JSON.stringify(j))}catch(t){$("\u672C\u5730\u4FDD\u5B58\u5931\u8D25\uFF1A"+t.message,"err")}}function Kt(){try{let e=JSON.parse(localStorage.getItem(mt)||"null");e&&e.tabs&&e.tabs.length&&(u.tabs=e.tabs.map(t=>re(t)),u.activeTab=e.activeTab)}catch{}try{let e=JSON.parse(localStorage.getItem(yt)||"null");Array.isArray(e)&&(u.collections=e)}catch{}try{let e=JSON.parse(localStorage.getItem(gt)||"null");e&&(u.envs=e.envs||[],u.activeEnv=e.activeEnv||null)}catch{}try{let e=JSON.parse(localStorage.getItem(Re)||"null");e&&(j=Object.assign(j,e))}catch{}if((!u.collections.length||!u.envs.length)&&Zt(),!u.tabs.length){let e=re();u.tabs=[e],u.activeTab=e.id}N()||(u.activeTab=u.tabs[0].id)}function ae(e,t,a,i){return Object.assign({id:U(),name:e,method:t,url:a,params:[B()],headers:[B()],bodyType:"none",body:"",formBody:[B()]},i||{})}function Zt(){if(!u.envs.length){let e={id:U(),name:"Demo \xB7 jsonplaceholder",baseUrl:"https://jsonplaceholder.typicode.com",vars:[{id:U(),on:!0,k:"token",v:"demo-token-123"}]},t={id:U(),name:"Demo \xB7 httpbin",baseUrl:"https://httpbin.org",vars:[B()]};u.envs=[e,t],u.activeEnv=e.id}if(!u.collections.length){let e={id:U(),name:"\u793A\u4F8B \xB7 DEMO",collapsed:!1,requests:[ae("\u7528\u6237\u5217\u8868(\u6570\u7EC4\u2192\u8868\u683C)","GET","https://jsonplaceholder.typicode.com/users"),ae("\u7528\u6237\u5217\u8868 {{baseUrl}}","GET","{{baseUrl}}/users"),ae("\u5355\u4E2A Todo(\u5BF9\u8C61)","GET","{{baseUrl}}/todos/1"),ae("\u5D4C\u5957/\u65F6\u95F4(\u5BF9\u8C61\u6811\u6F14\u793A)","GET","https://httpbin.org/json"),ae("\u5A92\u4F53/\u56FE\u7247(\u4E8C\u8FDB\u5236\u6F14\u793A)","GET","https://picsum.photos/300/200"),ae("\u65B0\u5EFA Post","POST","{{baseUrl}}/posts",{bodyType:"json",body:JSON.stringify({title:"relay",body:"hello",userId:1},null,2),headers:[{id:U(),on:!0,k:"Authorization",v:"Bearer {{token}}"},B()]})]};u.collections=[e]}}function wt(){return u.envs.find(e=>e.id===u.activeEnv)}function I(e){if(e==null||String(e).indexOf("{{")<0)return e;let t=wt();return String(e).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g,(a,i)=>{if(!t)return a;if(i==="baseUrl")return t.baseUrl||"";let r=(t.vars||[]).find(n=>n.on&&n.k===i);return r?r.v:a})}function Qt(){let e=b("#methodMenu");e&&Pe.forEach(t=>{let a=c("button",se(t),t);a.onclick=()=>{let i=N();i.method=t,ee(i),b("#methodMenu").classList.remove("open"),ie(),oe(),w()},e.appendChild(a)})}function ea(){let e=b("#methodSel");e&&(e.onclick=a=>{a.stopPropagation(),b("#methodMenu").classList.toggle("open")});let t=b("#envSel");t&&(t.onclick=a=>{a.stopPropagation(),b("#envMenu").classList.toggle("open")}),document.addEventListener("click",()=>{let a=b("#methodMenu");a&&a.classList.remove("open");let i=b("#envMenu");i&&i.classList.remove("open"),Y(".path-menu").forEach(r=>r.classList.remove("open"))})}function F(){let e=b("#tree");e.innerHTML="";let t=(b("#search").value||"").toLowerCase().trim(),a=0,i=0;u.collections.length||e.appendChild(c("div","tree-empty","\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5206\u7EC4\u3002<br>\u70B9\u51FB\u53F3\u4E0A\u89D2 \uFF0B \u65B0\u5EFA\u4E00\u4E2A\u3002")),u.collections.forEach(r=>{let n=r.requests.filter(d=>!t||d.name.toLowerCase().includes(t)||d.url.toLowerCase().includes(t));if(a+=r.requests.length,t&&!n.length&&!r.name.toLowerCase().includes(t))return;let o=t?n:r.requests;i+=o.length;let l=c("div","group"+(r.collapsed&&!t?" collapsed":"")),s=c("div","group-head");s.innerHTML=`<span class="caret">\u25BC</span><span class="gname">${g(r.name)}</span><span class="gcount">${r.requests.length}</span>`;let p=c("span","gact"),y=c("button","x","\u270E");y.title="\u91CD\u547D\u540D",y.onclick=d=>{d.stopPropagation(),fa(r)};let m=c("button","x","\u{1F5D1}");m.title="\u5220\u9664\u5206\u7EC4",m.onclick=d=>{d.stopPropagation(),ua(r)},p.append(y,m),s.appendChild(p),s.onclick=()=>{r.collapsed=!r.collapsed,w(),F()},l.appendChild(s);let f=c("div","reqs");o.forEach(d=>{let x=c("div","req-item"+(N()&&N().savedId===d.id?" active":""));x.innerHTML=`<span class="mb ${se(d.method)}">${d.method}</span><span class="rn">${g(d.name)}</span>`;let h=c("button","rx","\u2715");h.title="\u5220\u9664",h.onclick=v=>{v.stopPropagation(),va(r,d)},x.appendChild(h),x.onclick=()=>ca(d),f.appendChild(x)}),l.appendChild(f),e.appendChild(l)}),t&&i===0&&e.appendChild(c("div","tree-empty","\u6CA1\u6709\u5339\u914D\u300C"+g(t)+"\u300D\u7684\u8BF7\u6C42\u3002")),b("#stSaved").textContent=a}function ne(){let e=wt();b("#envName").textContent=e?e.name:"\u65E0\u73AF\u5883",b("#envSel").title=e&&e.baseUrl?"baseUrl: "+e.baseUrl:"\u672A\u9009\u62E9\u73AF\u5883";let t=b("#envMenu");t.innerHTML="",u.envs.forEach(r=>{let n=c("button","env-item"+(r.id===u.activeEnv?" on":""),`<span>${g(r.name)}</span><small>${g(r.baseUrl||"(\u65E0 baseUrl)")}</small>`);n.onclick=()=>{u.activeEnv=r.id,w(),ne(),ie(),b("#envMenu").classList.remove("open"),$("\u5DF2\u5207\u6362\u73AF\u5883\uFF1A"+r.name,"ok")},t.appendChild(n)});let a=c("button","env-item"+(u.activeEnv?"":" on"),"<span>\u65E0\u73AF\u5883</span><small>\u4E0D\u89E3\u6790\u53D8\u91CF</small>");a.onclick=()=>{u.activeEnv=null,w(),ne(),ie(),b("#envMenu").classList.remove("open")},t.appendChild(a);let i=c("button","env-item manage","<span>\u2699 \u7BA1\u7406\u73AF\u5883\u4E0E\u53D8\u91CF\u2026</span>");i.onclick=()=>{b("#envMenu").classList.remove("open"),ta()},t.appendChild(i)}function ta(){let e=b("#modalBg"),t=c("div","modal wide"),a=u.activeEnv||u.envs[0]&&u.envs[0].id;function i(){let n=u.envs.find(m=>m.id===a);t.innerHTML='<h3>\u73AF\u5883\u4E0E\u53D8\u91CF</h3><div class="sub">\u6BCF\u4E2A\u73AF\u5883\u542B\u4E00\u4E2A\u8BF7\u6C42\u670D\u52A1 <b>baseUrl</b>(ip+\u7AEF\u53E3) \u4E0E\u4E00\u7EC4\u53D8\u91CF\uFF1B\u5728 URL / Header / Body \u4E2D\u7528 <b>{{baseUrl}}</b>\u3001<b>{{\u53D8\u91CF\u540D}}</b> \u5F15\u7528\uFF0C\u53D1\u9001\u65F6\u89E3\u6790\u3002</div>';let o=c("div","env-tabs");u.envs.forEach(m=>{let f=c("button","env-tab"+(m.id===a?" on":""),g(m.name)+(m.id===u.activeEnv?" \u25CF":""));f.onclick=()=>{a=m.id,i()},o.appendChild(f)});let l=c("button","env-tab add","\uFF0B \u65B0\u5EFA\u73AF\u5883");if(l.onclick=()=>{let m={id:U(),name:"\u73AF\u5883 "+(u.envs.length+1),baseUrl:"",vars:[B()]};u.envs.push(m),a=m.id,i()},o.appendChild(l),t.appendChild(o),n){let m=c("div","field");m.innerHTML="<label>\u73AF\u5883\u540D\u79F0</label>";let f=c("input");f.value=n.name,f.oninput=()=>n.name=f.value,m.appendChild(f),t.appendChild(m);let d=c("div","field");d.innerHTML="<label>\u8BF7\u6C42\u670D\u52A1 baseUrl\uFF08ip + \u7AEF\u53E3\uFF09</label>";let x=c("input");x.placeholder="http://127.0.0.1:8080",x.value=n.baseUrl||"",x.oninput=()=>n.baseUrl=x.value,d.appendChild(x),t.appendChild(d);let h=c("div","field");h.innerHTML="<label>\u53D8\u91CF</label>";let v=c("div","env-vars");n.vars||(n.vars=[B()]),v.appendChild(Le(n.vars,{kPlace:"\u53D8\u91CF\u540D",vPlace:"\u503C",onChange:()=>{}})),h.appendChild(v),t.appendChild(h)}else t.appendChild(c("div","field","\u8FD8\u6CA1\u6709\u73AF\u5883\uFF0C\u70B9\u300C\uFF0B \u65B0\u5EFA\u73AF\u5883\u300D\u3002"));let s=c("div","acts");if(n){let m=c("button","btn ghost danger","\u5220\u9664");m.onclick=()=>{confirm("\u5220\u9664\u73AF\u5883\u300C"+n.name+"\u300D\uFF1F")&&(u.envs=u.envs.filter(f=>f.id!==n.id),u.activeEnv===n.id&&(u.activeEnv=u.envs[0]?u.envs[0].id:null),a=u.envs[0]&&u.envs[0].id,i())},s.appendChild(m)}let p=c("div");if(p.style.flex="1",s.appendChild(p),n){let m=c("button","btn",n.id===u.activeEnv?"\u2713 \u5F53\u524D\u73AF\u5883":"\u8BBE\u4E3A\u5F53\u524D");m.onclick=()=>{u.activeEnv=a,w(),ne(),ie(),i()},s.appendChild(m)}let y=c("button","btn primary","\u5B8C\u6210");y.onclick=r,s.appendChild(y),t.appendChild(s)}function r(){u.envs.forEach(n=>{n.vars&&(n.vars=n.vars.filter(o=>o.k||o.v))}),w(),ne(),ie(),e.classList.remove("open"),e.innerHTML=""}e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=n=>{n.target===e&&r()},i()}function Q(){let e=b("#tabbar");e.innerHTML="",u.tabs.forEach(a=>{let i=c("div","rtab"+(a.id===u.activeTab?" active":""));i.innerHTML=`<span class="tm ${se(a.method)}">${a.method}</span><span class="tn">${g(a.name)}</span>`,a.dirty&&i.appendChild(c("span","dirty"));let r=c("button","tx","\xD7");r.title="\u5173\u95ED",r.onclick=n=>{n.stopPropagation(),St(a)},i.appendChild(r),i.onclick=()=>{u.activeTab=a.id,G(),w()},i.oncontextmenu=n=>{n.preventDefault(),n.stopPropagation(),ya(n,a)},i.querySelector(".tn").ondblclick=n=>{n.stopPropagation();let o=prompt("\u91CD\u547D\u540D tab\uFF1A",a.name);o!=null&&(a.name=o.trim()||a.name,Q(),w())},e.appendChild(i)});let t=c("button","tab-add","+");t.title="\u65B0\u5EFA\u8BF7\u6C42 tab",t.onclick=()=>{let a=re();u.tabs.push(a),u.activeTab=a.id,G(),w()},e.appendChild(t),b("#stTabs").textContent=u.tabs.length}function ie(){let e=N(),t=b("#methodLabel");t.textContent=e.method,t.className=se(e.method);let a=b("#url");document.activeElement!==a&&(a.value=e.url),$e()}function $e(){let e=N(),t=b("#urlResolved");if(e.url&&e.url.indexOf("{{")>=0){let a=I(e.url);t.innerHTML="\u2192 <b>"+g(a)+"</b>"}else t.innerHTML=""}var ke=e=>e.filter(t=>t.on&&(t.k||t.v)).length;function oe(){let e=N();Y("#reqSubtabs .subtab").forEach(a=>a.classList.toggle("active",a.dataset.rt===e.reqTab)),b("#bParams").textContent=ke(e.params)||"",b("#bHeaders").textContent=ke(e.headers)||"",b("#bBody").textContent=e.bodyType!=="none"?"\u2022":"";let t=b("#reqPane");t.innerHTML="",e.reqTab==="params"?t.appendChild(Le(e.params,{kPlace:"\u53C2\u6570\u540D",vPlace:"\u53C2\u6570\u503C",onChange:()=>{ee(e),ra(e),b("#bParams").textContent=ke(e.params)||"",w()}})):e.reqTab==="headers"?t.appendChild(Le(e.headers,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{ee(e),b("#bHeaders").textContent=ke(e.headers)||"",w()}})):aa(t,e)}function Le(e,t){let a=c("div","kv");function i(){(!e.length||e[e.length-1].k||e[e.length-1].v)&&e.push(B())}function r(o){let l=()=>e[e.length-1]===o,s=c("div","kv-row"+(!o.k&&!o.v?" blank":"")),p=c("label","ck"),y=c("input");y.type="checkbox",y.checked=o.on,y.onchange=()=>{o.on=y.checked,t.onChange()},p.appendChild(y);let m=c("input","k");m.type="text",m.placeholder=t.kPlace,m.value=o.k,m.spellcheck=!1;let f=c("input","v");f.type="text",f.placeholder=t.vPlace,f.value=o.v,f.spellcheck=!1;let d=()=>{if(o.k=m.value,o.v=f.value,s.classList.toggle("blank",!o.k&&!o.v),(o.k||o.v)&&l()){let h=B();e.push(h),a.appendChild(r(h))}t.onChange()};m.addEventListener("input",d),f.addEventListener("input",d);let x=c("button","rm","\u2715");return x.title="\u5220\u9664\u8BE5\u884C",x.onclick=()=>{let h=e.indexOf(o);h>-1&&e.splice(h,1),n(),t.onChange()},s.append(p,m,f,x),s}function n(){a.innerHTML="",i(),e.forEach(o=>a.appendChild(r(o)))}return n(),a}function aa(e,t){let a=c("div","body-bar"),i=c("div","seg");if([["none","\u65E0"],["json","JSON"],["text","\u6587\u672C"],["form","Form"]].forEach(([r,n])=>{let o=c("button",t.bodyType===r?"on":"",n);o.onclick=()=>{t.bodyType=r,ee(t),w(),oe()},i.appendChild(o)}),a.appendChild(i),a.appendChild(c("div","sp")),t.bodyType==="json"){let r=c("button","tool","\u683C\u5F0F\u5316");r.onclick=()=>{try{t.body=JSON.stringify(JSON.parse(t.body),null,2),oe(),w(),$("JSON \u5DF2\u683C\u5F0F\u5316","ok")}catch(n){$("JSON \u65E0\u6548\uFF1A"+n.message,"err")}},a.appendChild(r)}if(e.appendChild(a),t.bodyType==="none")e.appendChild(c("div","body-none","\u8BE5\u8BF7\u6C42\u6CA1\u6709 Body\u3002<br>\u9009\u62E9 JSON / \u6587\u672C / Form \u4EE5\u7F16\u8F91\u8BF7\u6C42\u4F53\u3002"));else if(t.bodyType==="form"){let r=c("div");r.style.cssText="height:calc(100% - 49px);overflow:auto",r.appendChild(Le(t.formBody,{kPlace:"\u5B57\u6BB5\u540D",vPlace:"\u5B57\u6BB5\u503C",onChange:()=>{ee(t),w()}})),e.appendChild(r)}else{let r=c("textarea","code");r.spellcheck=!1,r.placeholder=t.bodyType==="json"?`{
  "key": "value"
}`:"\u539F\u59CB\u8BF7\u6C42\u4F53\u2026",r.value=t.body,r.style.height="calc(100% - 49px)",r.addEventListener("input",()=>{t.body=r.value,ee(t),w()}),r.addEventListener("keydown",n=>{if(n.key==="Tab"){n.preventDefault();let o=r.selectionStart,l=r.selectionEnd;r.value=r.value.slice(0,o)+"  "+r.value.slice(l),r.selectionStart=r.selectionEnd=o+2,t.body=r.value}}),e.appendChild(r)}}function Lt(e){let t=e.indexOf("?");return t<0?[e,""]:[e.slice(0,t),e.slice(t+1)]}function ra(e){let[t]=Lt(e.url),a=e.params.filter(r=>r.on&&r.k).map(r=>encodeURIComponent(r.k)+"="+encodeURIComponent(r.v)).join("&");e.url=a?t+"?"+a:t;let i=b("#url");document.activeElement!==i&&(i.value=e.url),$e()}function Ct(e){let[,t]=Lt(e.url),a=[];t&&t.split("&").forEach(i=>{if(!i)return;let[r,...n]=i.split("=");a.push({id:U(),on:!0,k:decodeURIComponent(r||""),v:decodeURIComponent((n.join("=")||"").replace(/\+/g," "))})}),a.push(B()),e.params=a}async function Oe(){let e=N(),t=I(e.url.trim());if(!t){$("\u8BF7\u5148\u8F93\u5165 URL","warn"),b("#url").focus();return}/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let a={};if(e.headers.filter(l=>l.on&&l.k).forEach(l=>a[I(l.k)]=I(l.v)),!D&&!j.proxyOn){let l=Object.keys(a).filter(s=>Me.test(s));if(l.length){let s=l.map(y=>`<code>${g(y)}</code>`).join("\u3001");b("#resSubtabs").style.display="none",b("#resStatus").style.display="none",b("#resTools").style.display="none",b("#resPane").innerHTML=`<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u88AB\u62E6\u622A\uFF1A\u6D4F\u89C8\u5668\u7981\u53D1\u5934</div><div>\u5F53\u524D\u4E3A<code>\u76F4\u8FDE</code>\u6A21\u5F0F\uFF0C\u4EE5\u4E0B\u5934\u4F1A\u88AB\u6D4F\u89C8\u5668\u9759\u9ED8\u5265\u79BB\u3001\u65E0\u6CD5\u53D1\u9001\uFF1A<b>${s}</b>\u3002\u76EE\u6807\u670D\u52A1\u5668\u6536\u5230\u7F3A\u5C11\u8FD9\u4E9B\u5934\u7684\u8BF7\u6C42\uFF0C\u901A\u5E38\u4F1A\u8FD4\u56DE<span style="color:var(--warn)">\u767B\u5F55\u5931\u6548 / 403 / \u8DE8\u57DF\u9519\u8BEF</span>\u3002</div><div class="hintbox">\u{1F449} \u70B9\u51FB\u9876\u680F <b>\u300C\u{1F6E1} \u4EE3\u7406\u300D</b> \u5F00\u542F\u8DE8\u57DF\u4EE3\u7406\u540E\u91CD\u53D1\u3002\u4EE3\u7406\u4F1A\u7531\u672C\u5730\u540E\u7AEF\u628A Cookie/UA/Referer \u7B49\u5934\u5B8C\u6574\u8FD8\u539F\u5E76\u8F6C\u53D1\uFF0C\u4E0E cURL \u53D1\u9001\u7B49\u6548\u3002</div><div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u88AB\u62E6\u622A\u5934\uFF1A${g(l.join(", "))}</div></div>`;let p=b("#sendBtn");p.disabled=!1,p.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>';return}}let i,r=e.method;["GET","HEAD"].includes(r)||(e.bodyType==="json"?(i=I(e.body),Object.keys(a).some(l=>l.toLowerCase()==="content-type")||(a["Content-Type"]="application/json")):e.bodyType==="text"?i=I(e.body):e.bodyType==="form"&&(i=e.formBody.filter(l=>l.on&&l.k).map(l=>encodeURIComponent(I(l.k))+"="+encodeURIComponent(I(l.v))).join("&"),Object.keys(a).some(l=>l.toLowerCase()==="content-type")||(a["Content-Type"]="application/x-www-form-urlencoded")));let n=b("#sendBtn");n.disabled=!0,n.innerHTML="\u53D1\u9001\u4E2D\u2026",b("#resSubtabs").style.display="none",b("#resStatus").style.display="none",b("#resTools").style.display="none",b("#resPane").innerHTML='<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>';let o=performance.now();try{if(D){if(!ut())throw new Error("cap.http \u4E0D\u53EF\u7528\uFF08\u9700 Polaris \u5BBF\u4E3B\u73AF\u5883\uFF09");$(r+" "+t+" \xB7 \u7ECF\u5BBF\u4E3B\u8F6C\u53D1 \u2026");let s=await ft({method:r,url:t,headers:a,body:i||"",bodyType:e.bodyType||"text",timeoutMs:15e3}),p=performance.now();e.response=await bt(s,t),e.response.timeMs=p-o}else{$(r+" "+t+(j.proxyOn?" \xB7 \u7ECF\u4EE3\u7406":"")+" \u2026");let s=t,p=a;if(j.proxyOn){p={};for(let[C,S]of Object.entries(a))Me.test(C)?p["X-Relay-H-"+C]=S:p[C]=S;p["X-Relay-Target"]=t,s="/__proxy"}let y=await fetch(s,{method:r,headers:p,body:i,redirect:"follow"}),m=await y.blob(),f=performance.now(),d=y.headers.get("content-type")||"",x=ct.test(d),h="";x||(h=await m.text());let v={};y.headers.forEach((C,S)=>v[S]=C);let k=vt(h);e.response={status:y.status,statusText:y.statusText,ok:y.ok,timeMs:f-o,size:m.size,contentType:d,headers:v,text:h,isBinary:x,blobUrl:x?URL.createObjectURL(m):null,url:t,parsed:k.ok?k.value:void 0}}let l=e.response.contentType||"";e.respPath="",e.respFilter="",e.tableSel=null,e.colW={},e.treeOpen="auto",e.hiddenCols={},e.sort={},e.respView=e.response.parsed!==void 0?Array.isArray(e.response.parsed)?"table":"object":/text\/html/i.test(l)||e.response.isBinary&&/^image\//i.test(l)?"preview":"raw",He(),$(r+" "+e.response.status+" "+e.response.statusText+" \xB7 "+be(e.response.timeMs)+" \xB7 "+le(e.response.size||0),e.response.ok?"ok":"warn")}catch(l){let s=performance.now();e.response={error:l.message||String(l),timeMs:s-o,url:t},He(),$("\u8BF7\u6C42\u5931\u8D25\uFF1A"+(l.message||l),"err")}finally{n.disabled=!1,n.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>'}}function Ce(e){let t=e.response,a=t&&!t.error?t.parsed:void 0,i=a,r=!1;if(e.respPath&&a!==void 0){let s=Ye(a,e.respPath);s.ok?i=s.value:(r=!0,i=void 0)}let n=i!==void 0,o=n&&(Array.isArray(i)||i&&typeof i=="object"),l=!!t&&!e.respPath&&(/text\/html/i.test(t.contentType)||/^image\//i.test(t.contentType));return{data:i,drillErr:r,hasJSON:n,canTable:o,canPrev:l}}function na(e){return e?Array.isArray(e)&&e.length&&e[0]&&typeof e[0]=="object"&&!Array.isArray(e[0])?Object.keys(e[0]):e&&typeof e=="object"&&!Array.isArray(e)?Object.keys(e):[]:[]}function He(){let e=N(),t=e.response,a=b("#resPane"),i=b("#resSubtabs"),r=b("#resStatus"),n=b("#resTools");if(!t){i.style.display="none",r.style.display="none",n.style.display="none",a.innerHTML='<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div>\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002</div>';return}if(t.error){i.style.display="none",r.style.display="none",n.style.display="none";let p=/Failed to fetch|NetworkError|load failed/i.test(t.error);a.innerHTML=`<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u5931\u8D25</div><div>${g(t.error)}</div>`+(p?'<div class="hintbox"><b>\u53EF\u80FD\u539F\u56E0\uFF1A</b>\u8DE8\u57DF CORS\u3001\u76EE\u6807\u65E0\u54CD\u5E94\u3001\u6DF7\u5408\u5185\u5BB9(HTTP/HTTPS)\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002'+(D?"<br>\u9762\u677F\u6A21\u5F0F\uFF1A\u8BF7\u6C42\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u4ECD\u5931\u8D25\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\u3001\u88AB SSRF \u62E6\u622A\uFF08\u5185\u7F51/\u4E91\u5143\u6570\u636E/\u5185\u90E8\u57DF\u540D\u7981\u53D1\uFF1Blocalhost/127.0.0.1 \u5DF2\u653E\u884C\uFF09\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002":j.proxyOn?"<br>\u4EE3\u7406\u5DF2\u5F00\u542F\u4ECD\u5931\u8D25\uFF1A\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\uFF0C\u6216\u540E\u7AEF\u672A\u8FD0\u884C\u6700\u65B0 server.js\u3002":"<br>\u{1F449} \u70B9\u9876\u680F\u300C\u{1F6E1} \u4EE3\u7406\u300D\u5F00\u542F\u672C\u5730\u540E\u7AEF\u8F6C\u53D1\uFF0C\u53EF\u7ED5\u8FC7 CORS \u4E0E\u6DF7\u5408\u5185\u5BB9\u9650\u5236\u3002")+"</div>":"")+`<div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u8017\u65F6 ${be(t.timeMs)} \xB7 ${g(t.url)}</div></div>`;return}r.style.display="flex";let l=`var(--${t.status>=500?"s5":t.status>=400?"s4":t.status>=300?"s3":"s2"})`;if(r.innerHTML=`<span class="status-chip" style="color:${l}"><span class="dotc" style="background:${l}"></span>${t.status} ${g(t.statusText)}</span><span class="res-meta"><span>\u8017\u65F6 <b>${be(t.timeMs)}</b></span><span>\u5927\u5C0F <b>${le(t.size)}</b></span>`+(t.contentType?`<span>\u7C7B\u578B <b>${g(t.contentType.split(";")[0])}</b></span>`:"")+"</span>",i.style.display="flex",t.parsed!==void 0){n.style.display="flex",n.innerHTML="";let p=null,y=Xe(t.parsed),m=c("div","ti path");m.innerHTML='<span class="lbl">\u8DEF\u5F84</span>';let f=c("div","pathdd"),d=c("button","pathdd-btn");d.type="button";let x=()=>{d.innerHTML=`<span>${e.respPath?g(e.respPath):"\u9009\u62E9\u8DEF\u5F84"}</span><span class="pcar">\u25BC</span>`};x();let h=c("div","path-menu"),v=c("input","path-filter");v.placeholder="\u8FC7\u6EE4\u8DEF\u5F84 / \u8F93\u5165\u540E\u56DE\u8F66\u5E94\u7528",v.spellcheck=!1;let k=c("div","path-list"),C=O=>{e.respPath=O,p&&(p.value=O),w(),x(),h.classList.remove("open"),V()},S=()=>{k.innerHTML="";let O=v.value.toLowerCase().trim(),P=0;y.forEach(z=>{if(P>=200)return;let X=z.path===""?"(\u6839)":z.path;if(O&&!X.toLowerCase().includes(O))return;P++;let M=c("button","path-opt"+(z.path===e.respPath?" on":""));M.type="button",M.innerHTML=`<span class="pp">${g(X)}</span><span class="pk ${z.kind}">${z.kind==="array"?"[ ] "+z.count:z.kind==="object"?"{ } "+z.count:"\xB7"}</span>`,M.onclick=()=>C(z.path),k.appendChild(M)}),P||(k.innerHTML='<div class="path-empty">\u65E0\u5339\u914D\u8DEF\u5F84\u3002<br>\u56DE\u8F66\u53EF\u76F4\u63A5\u5E94\u7528\u8F93\u5165\u7684\u8DEF\u5F84\u3002</div>')};v.addEventListener("input",S),v.addEventListener("keydown",O=>{O.key==="Enter"&&C(v.value.trim()),O.key==="Escape"&&h.classList.remove("open")}),d.onclick=O=>{O.stopPropagation();let P=!h.classList.contains("open");Y(".path-menu").forEach(z=>z.classList.remove("open")),b("#methodMenu").classList.remove("open"),b("#envMenu").classList.remove("open"),P&&(h.classList.add("open"),v.value="",S(),setTimeout(()=>v.focus(),0))},h.addEventListener("click",O=>O.stopPropagation()),h.append(v,k),f.append(d,h),m.appendChild(f);let T=c("div","ti manual");T.innerHTML='<span class="lbl">\u624B\u52A8</span>',p=c("input"),p.id="respPathIn",p.placeholder="\u5982 data.items[0].name",p.value=e.respPath||"",p.spellcheck=!1,p.addEventListener("input",()=>{e.respPath=p.value,w(),x(),V()}),T.appendChild(p);let L=Ce(e),E=na(L.data),H=pt(e,()=>{w(),V()},E);n.append(m,T,H)}else n.style.display="none";b("#bResH").textContent=Object.keys(t.headers||{}).length||"",V()}function V(){let e=N(),t=e.response;if(!t||t.error)return;let a=Ce(e),i={table:a.canTable,object:a.hasJSON,raw:!0,preview:a.canPrev,headers:!0};i[e.respView]||(e.respView=a.hasJSON?"object":a.canPrev?"preview":"raw"),Y("#resSubtabs .subtab").forEach(y=>{let m=y.dataset.rv;y.classList.toggle("active",m===e.respView),y.classList.toggle("disabled",!i[m]),m==="preview"&&(y.style.display=a.canPrev?"":"none")});let r=e.respView==="table",n=e.respView==="object",o=e.respView==="raw",l=e.prettyCells!==!1;b("#prettyBtn").style.display=r||n?"":"none",b("#prettyBtn").style.color=l?"var(--brand)":"",b("#prettyBtn").innerHTML=l?"\u2726 \u7F8E\u5316":"\u2726 \u539F\u59CB",b("#treeExpand").style.display=n?"":"none",b("#treeCollapse").style.display=n?"":"none",b("#wrapBtn").style.display=o?"":"none";let s=b("#resPane");if(s.innerHTML="",a.drillErr){s.innerHTML='<div class="prev-none">\u8DEF\u5F84 <b>'+g(e.respPath)+"</b> \u5728\u54CD\u5E94\u4E2D\u4E0D\u5B58\u5728\u3002</div>";return}let p=e.respView;p==="raw"?s.appendChild(Ze(t,a.data)):p==="object"?s.appendChild(at(a.data,e)):p==="table"?s.appendChild(dt(a.data,e)):p==="preview"?s.appendChild(ia(t)):s.appendChild(oa(t))}function ia(e){if(/^image\//i.test(e.contentType)&&e.blobUrl){let t=c("div","prev-img-wrap"),a=c("img");return a.src=e.blobUrl,t.appendChild(a),t}if(/text\/html/i.test(e.contentType)){let t=c("iframe","prev-frame");return t.sandbox="",t.srcdoc=e.text,t}return c("div","prev-none","\u65E0\u53EF\u9884\u89C8\u5185\u5BB9\uFF08\u4EC5\u652F\u6301 HTML \u4E0E\u56FE\u7247\u9884\u89C8\uFF09\u3002")}function oa(e){let t=c("div","tbl-wrap"),a=c("table","dt"),i=Object.keys(e.headers||{});a.innerHTML="<thead><tr><th>Header</th><th>Value</th></tr></thead>";let r=c("tbody");return i.length||(r.innerHTML='<tr><td colspan="2" style="color:var(--dimmer)">\uFF08\u65E0\u53EF\u89C1\u54CD\u5E94\u5934 \u2014 \u6D4F\u89C8\u5668\u53EF\u80FD\u9650\u5236\u4E86\u90E8\u5206\u5934\uFF09</td></tr>'),i.forEach(n=>{let o=c("tr");o.innerHTML=`<td style="color:var(--j-key);white-space:nowrap">${g(n)}</td><td>${g(e.headers[n])}</td>`,r.appendChild(o)}),a.appendChild(r),t.appendChild(a),t}function la(e){e=e.replace(/\\\r?\n/g," ");let t=[],a="",i=null,r=!1;for(let n=0;n<e.length;n++){let o=e[n];i?o==="\\"&&i==='"'?a+=e[++n]||"":o===i?i=null:a+=o:o==='"'||o==="'"?(i=o,r=!0):o===" "||o==="	"||o===`
`||o==="\r"?r&&(t.push(a),a="",r=!1):(a+=o,r=!0)}return r&&t.push(a),t}function sa(e){let t=la(e.trim());t.length&&/^curl(\.exe)?$/i.test(t[0])&&(t=t.slice(1));let a=[];for(let f of t){if(f.startsWith("--")||/^-[A-Za-z]/.test(f)&&f.length>2){let d=f.indexOf("=");if(d>0){a.push(f.slice(0,d)),a.push(f.slice(d+1));continue}}a.push(f)}t=a;let i=[],r=[],n=null,o="",l=!1,s=f=>{let d=f.indexOf(":");if(d<0){i.push({on:!0,k:f.trim(),v:""});return}i.push({on:!0,k:f.slice(0,d).trim(),v:f.slice(d+1).trim()})};for(let f=0;f<t.length;f++){let d=t[f],x=()=>t[++f];if(d==="-X"||d==="--request")n=x();else if(d.startsWith("-X")&&d.length>2)n=d.slice(2);else if(d==="-H"||d==="--header")s(x());else if(d.startsWith("-H")&&d.length>2)s(d.slice(2));else if(d==="-d"||d==="--data"||d==="--data-raw"||d==="--data-ascii"||d==="--data-binary"||d==="--data-urlencode")r.push(x());else if(d.startsWith("-d")&&d.length>2)r.push(d.slice(2));else if(d==="--json")r.push(x()),i.some(h=>h.k.toLowerCase()==="content-type")||i.push({on:!0,k:"Content-Type",v:"application/json"});else if(d==="-u"||d==="--user")try{i.push({on:!0,k:"Authorization",v:"Basic "+btoa(x())})}catch{}else d==="-b"||d==="--cookie"?i.push({on:!0,k:"Cookie",v:x()}):d==="-A"||d==="--user-agent"?i.push({on:!0,k:"User-Agent",v:x()}):d==="-e"||d==="--referer"?i.push({on:!0,k:"Referer",v:x()}):d==="-G"||d==="--get"?l=!0:d==="--url"?o=x():["--compressed","-L","--location","-k","--insecure","-s","--silent","-S","--show-error","-i","--include","-v","--verbose","-f","--fail","-#","--progress-bar"].includes(d)||d.startsWith("-")||o||(o=d)}n||(n=r.length&&!l?"POST":"GET"),n=n.toUpperCase();let p=r.join("&");l&&p&&(o+=(o.includes("?")?"&":"?")+p,p="");let y=i.find(f=>f.k.toLowerCase()==="content-type"),m="none";if(p&&(y&&/json/i.test(y.v)||/^\s*[\[{]/.test(p)?m="json":m="text"),m==="json")try{p=JSON.stringify(JSON.parse(p),null,2)}catch{}return{method:n,url:o,headers:i,body:p,bodyType:m}}function da(){let e=b("#modalBg"),t=c("div","modal");t.innerHTML='<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\uFF08\u652F\u6301 -X -H -d --data-raw -u -b -G --json\u3001--flag=value \u7B49\u53F7\u5199\u6CD5\u3001curl.exe \u524D\u7F00\uFF09\u3002</div>';let a=c("div","field");a.innerHTML="<label>cURL \u547D\u4EE4</label>";let i=c("textarea","curl-ta");i.placeholder=`curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx' -H 'Content-Type: application/json' --data-raw '{"a":1}'`,a.appendChild(i),t.appendChild(a);let r=c("div","acts"),n=c("div");n.style.flex="1";let o=c("button","btn ghost","\u53D6\u6D88");o.onclick=s;let l=c("button","btn primary","\u89E3\u6790\u5E76\u65B0\u5EFA");l.onclick=()=>{let p=i.value.trim();if(!p){$("\u8BF7\u7C98\u8D34 curl \u547D\u4EE4","warn");return}try{let y=sa(p);if(!y.url){$("\u672A\u80FD\u4ECE\u547D\u4EE4\u4E2D\u89E3\u6790\u51FA URL","err");return}let m=re({name:"cURL: "+zt(y.url),method:y.method,url:y.url,bodyType:y.bodyType,body:y.body,headers:(y.headers.length?y.headers.map(d=>({id:U(),on:!0,k:d.k,v:d.v})):[]).concat([B()])});Ct(m),m.dirty=!0,u.tabs.push(m),u.activeTab=m.id,G(),w(),s(),$("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A"+y.method+" "+y.url,"ok");let f=y.headers.filter(d=>Me.test(d.k));f.length&&!D&&($("\u26A0 \u5BFC\u5165\u542B\u6D4F\u89C8\u5668\u7981\u53D1\u5934\uFF08"+f.map(d=>d.k).join(", ")+"\uFF09\u2014\u2014\u53D1\u9001\u65F6\u9700\u5F00\u542F\u300C\u{1F6E1} \u4EE3\u7406\u300D\uFF0C\u5426\u5219\u8FD9\u4E9B\u5934\u4F1A\u88AB\u5265\u79BB","warn"),j.proxyOn||setTimeout(()=>{let d=b("#proxyBtn");d&&(d.classList.add("pulse-hint"),d.scrollIntoView({behavior:"smooth",block:"center"}),setTimeout(()=>d.classList.remove("pulse-hint"),2400))},300))}catch(y){$("cURL \u89E3\u6790\u5931\u8D25\uFF1A"+y.message,"err")}},r.append(o,n,l),t.appendChild(r),e.innerHTML="",e.appendChild(t),e.classList.add("open"),i.focus(),e.onclick=p=>{p.target===e&&s()};function s(){e.classList.remove("open"),e.innerHTML=""}}function Tt(e){let t=I(e.url.trim());/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let a=o=>"'"+String(o).replace(/'/g,"'\\''")+"'",i=["curl -X "+e.method+" "+a(t)],r={};e.headers.filter(o=>o.on&&o.k).forEach(o=>r[I(o.k)]=I(o.v));let n=null;return["GET","HEAD"].includes(e.method)||(e.bodyType==="json"?(n=I(e.body),Object.keys(r).some(o=>o.toLowerCase()==="content-type")||(r["Content-Type"]="application/json")):e.bodyType==="text"?n=I(e.body):e.bodyType==="form"&&(n=e.formBody.filter(o=>o.on&&o.k).map(o=>encodeURIComponent(I(o.k))+"="+encodeURIComponent(I(o.v))).join("&"),Object.keys(r).some(o=>o.toLowerCase()==="content-type")||(r["Content-Type"]="application/x-www-form-urlencoded"))),Object.entries(r).forEach(([o,l])=>i.push("-H "+a(o+": "+l))),n&&i.push("--data-raw "+a(n)),i.join(` \\
  `)}function ee(e){e.dirty||(e.dirty=!0,Q())}function pa(e){for(let t of u.collections){let a=t.requests.find(i=>i.id===e);if(a)return{g:t,r:a}}return null}function xt(e){return{method:e.method,url:e.url,params:JSON.parse(JSON.stringify(e.params)),headers:JSON.parse(JSON.stringify(e.headers)),bodyType:e.bodyType,body:e.body,formBody:JSON.parse(JSON.stringify(e.formBody))}}function zt(e){try{let t=new URL(/^[a-z]+:\/\//i.test(e)?e:"https://"+e.replace(/^\{\{[^}]+\}\}/,"http://x"));return t.pathname&&t.pathname.length>1?t.pathname:t.hostname}catch{return String(e).slice(0,28)}}function ht(){let e=N();if(e.savedId){let a=pa(e.savedId);if(a){Object.assign(a.r,xt(e)),a.r.name=e.name,e.dirty=!1,w(),Q(),F(),$("\u5DF2\u66F4\u65B0\u300C"+e.name+"\u300D","ok");return}}let t=u.collections.map(a=>`<option value="${a.id}">${g(a.name)}</option>`).join("");ga("\u4FDD\u5B58\u8BF7\u6C42","\u628A\u5F53\u524D\u8BF7\u6C42\u5B58\u5165\u4E00\u4E2A\u5206\u7EC4",[{label:"\u540D\u79F0",id:"mName",type:"text",value:e.url?e.method+" "+zt(e.url):"\u672A\u547D\u540D\u8BF7\u6C42"},{label:"\u5206\u7EC4",id:"mGroup",type:"select",html:t+'<option value="__new">\uFF0B \u65B0\u5EFA\u5206\u7EC4\u2026</option>'}],a=>{let i=a.mGroup;if(i==="__new"||!u.collections.length){let o=prompt("\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4");if(!o)return!1;let l={id:U(),name:o,collapsed:!1,requests:[]};u.collections.push(l),i=l.id}let r=u.collections.find(o=>o.id===i),n=Object.assign({id:U(),name:a.mName||"\u672A\u547D\u540D\u8BF7\u6C42"},xt(e));r.requests.push(n),e.savedId=n.id,e.name=n.name,e.dirty=!1,w(),Q(),F(),$("\u5DF2\u4FDD\u5B58\u5230\u300C"+r.name+"\u300D","ok")})}function ca(e){let t=u.tabs.find(i=>i.savedId===e.id);if(t){u.activeTab=t.id,G();return}let a=re({name:e.name,savedId:e.id,method:e.method,url:e.url,params:JSON.parse(JSON.stringify(e.params||[B()])),headers:JSON.parse(JSON.stringify(e.headers||[B()])),bodyType:e.bodyType||"none",body:e.body||"",formBody:JSON.parse(JSON.stringify(e.formBody||[B()]))});a.params.length||(a.params=[B()]),a.headers.length||(a.headers=[B()]),a.formBody.length||(a.formBody=[B()]),u.tabs.push(a),u.activeTab=a.id,G(),w(),$("\u5DF2\u8F7D\u5165\u300C"+e.name+"\u300D")}function va(e,t){confirm("\u5220\u9664\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u300C"+t.name+"\u300D\uFF1F")&&(e.requests=e.requests.filter(a=>a.id!==t.id),u.tabs.forEach(a=>{a.savedId===t.id&&(a.savedId=null,a.dirty=!0)}),w(),F(),Q())}function fa(e){let t=prompt("\u5206\u7EC4\u540D\u79F0\uFF1A",e.name);t!=null&&(e.name=t.trim()||e.name,w(),F())}function ua(e){if(!confirm("\u5220\u9664\u5206\u7EC4\u300C"+e.name+"\u300D\u53CA\u5176\u4E2D "+e.requests.length+" \u4E2A\u8BF7\u6C42\uFF1F"))return;let t=e.requests.map(a=>a.id);u.collections=u.collections.filter(a=>a.id!==e.id),u.tabs.forEach(a=>{t.includes(a.savedId)&&(a.savedId=null,a.dirty=!0)}),w(),F(),Q()}function St(e){if(e.dirty&&(e.url||e.savedId)&&!confirm("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F"))return;let t=u.tabs.indexOf(e);if(u.tabs.splice(t,1),u.tabs.length)u.activeTab===e.id&&(u.activeTab=u.tabs[Math.max(0,t-1)].id);else{let a=re();u.tabs.push(a),u.activeTab=a.id}G(),w()}function ba(e){u.tabs=u.tabs.filter(t=>t===e),u.activeTab=e.id,G(),w()}function xa(e){let t=u.tabs.indexOf(e);u.tabs=u.tabs.slice(0,t+1),u.activeTab=e.id,G(),w()}function ha(e){let t=u.tabs.indexOf(e);u.tabs=u.tabs.slice(t),u.activeTab=e.id,G(),w()}var ma=null,we=null;function ya(e,t){e.preventDefault(),e.stopPropagation(),ma=t,we&&we();let a=c("div","ctx-menu");a.style.cssText="position:fixed;z-index:10001;background:var(--bg-2, #1e1f26);border:1px solid var(--line, #2a2b32);border-radius:8px;padding:4px 0;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.4)",a.style.left=Math.min(e.clientX,innerWidth-180)+"px",a.style.top=Math.min(e.clientY,innerHeight-8)+"px",ue().appendChild(a),a.style.top=Math.min(e.clientY,innerHeight-a.offsetHeight-8)+"px",[{label:"\u2715 \u5173\u95ED",action:()=>{St(t),r()}},{label:"\u5173\u95ED\u5176\u4ED6",action:()=>{ba(t),r()}},{label:"\u5173\u95ED\u53F3\u4FA7",action:()=>{xa(t),r()}},{label:"\u5173\u95ED\u5DE6\u4FA7",action:()=>{ha(t),r()}},{sep:!0},{label:"\u270E \u91CD\u547D\u540D",action:()=>{let l=prompt("\u91CD\u547D\u540D tab\uFF1A",t.name);l!=null&&(t.name=l.trim()||t.name,Q(),w()),r()}},{label:"\u{1F4CB} \u590D\u5236 URL",action:()=>{W(t.url||"","URL \u5DF2\u590D\u5236"),r()}},{label:"cURL \u590D\u5236",action:()=>{W(Tt(t),"cURL \u5DF2\u590D\u5236"),r()}}].forEach(l=>{if(l.sep){let p=c("div");p.style.cssText="height:1px;background:var(--line,#2a2b32);margin:4px 0",a.appendChild(p);return}let s=c("button");s.textContent=l.label,s.style.cssText="display:block;width:100%;padding:6px 14px;text-align:left;font-size:12px;color:var(--ink,#d8dae2);background:none;border:none;cursor:pointer;white-space:nowrap",s.onmouseenter=()=>s.style.background="var(--surface,#262830)",s.onmouseleave=()=>s.style.background="none",s.onclick=l.action,a.appendChild(s)});function r(){a.remove(),we=null,document.removeEventListener("keydown",n),document.removeEventListener("mousedown",o)}we=r;function n(l){l.key==="Escape"&&r()}function o(l){a.contains(l.target)||r()}setTimeout(()=>{document.addEventListener("keydown",n),document.addEventListener("mousedown",o)},0)}function ga(e,t,a,i){let r=b("#modalBg"),n=c("div","modal");n.innerHTML=`<h3>${g(e)}</h3>${t?`<div class="sub">${g(t)}</div>`:""}`,a.forEach(f=>{let d=c("div","field");d.innerHTML=`<label>${g(f.label)}</label>`+(f.type==="select"?`<select id="${f.id}">${f.html}</select>`:`<input id="${f.id}" type="text" value="${g(f.value||"")}" />`),n.appendChild(d)});let o=c("div","acts"),l=c("div");l.style.flex="1";let s=c("button","btn ghost","\u53D6\u6D88");s.onclick=m;let p=c("button","btn primary","\u786E\u5B9A");p.onclick=()=>{let f={};a.forEach(d=>f[d.id]=b("#"+d.id,n).value),i(f)!==!1&&m()},o.append(l,s,p),n.appendChild(o),r.innerHTML="",r.appendChild(n),r.classList.add("open");let y=n.querySelector("input,select");y&&(y.focus(),y.select&&y.select()),n.addEventListener("keydown",f=>{f.key==="Enter"&&f.target.tagName!=="SELECT"&&p.click(),f.key==="Escape"&&m()}),r.onclick=f=>{f.target===r&&m()};function m(){r.classList.remove("open"),r.innerHTML=""}}function ka(){let e=b("#exportBtn");e&&(e.onclick=()=>{let i=JSON.stringify({relay:2,exportedAt:new Date().toISOString(),collections:u.collections,envs:u.envs},null,2),r=c("a");r.href=URL.createObjectURL(new Blob([i],{type:"application/json"})),r.download="relay-export.json",r.click(),$("\u5DF2\u5BFC\u51FA\u96C6\u5408\u4E0E\u73AF\u5883","ok")});let t=b("#importBtn");t&&(t.onclick=()=>b("#fileInput").click());let a=b("#fileInput");a&&(a.onchange=i=>{let r=i.target.files[0];if(!r)return;let n=new FileReader;n.onload=()=>{try{let o=JSON.parse(n.result),l=Array.isArray(o)?o:o.collections;if(!Array.isArray(l))throw new Error("\u683C\u5F0F\u4E0D\u7B26");l.forEach(s=>{s.id=U(),(s.requests||[]).forEach(p=>p.id=U())}),u.collections=u.collections.concat(l),o.envs&&Array.isArray(o.envs)&&(o.envs.forEach(s=>{s.id=U()}),u.envs=u.envs.concat(o.envs),ne()),w(),F(),$("\u5DF2\u5BFC\u5165 "+l.length+" \u4E2A\u5206\u7EC4","ok")}catch(o){$("\u5BFC\u5165\u5931\u8D25\uFF1A"+o.message,"err")}b("#fileInput").value=""},n.readAsText(r)})}function wa(){let e=N(),t=e.response;if(!t||t.error)return;let a=Ce(e),i="response";try{i=new URL(t.url).pathname.split("/").pop()||"response"}catch{}let r,n=!1;if(t.isBinary&&t.blobUrl&&!e.respPath)r=t.blobUrl;else{let l=a.hasJSON?JSON.stringify(a.data,null,2):t.text;/\./.test(i)||(i+=a.hasJSON?".json":/html/.test(t.contentType)?".html":".txt"),r=URL.createObjectURL(new Blob([l],{type:t.contentType||"text/plain"})),n=!0}let o=c("a");o.href=r,o.download=i,o.click(),n&&setTimeout(()=>URL.revokeObjectURL(r),1e3),$("\u5DF2\u4E0B\u8F7D "+i,"ok")}function La(){let e=b("#sendBtn");e&&(e.onclick=Oe);let t=b("#saveBtn");t&&(t.onclick=ht);let a=b("#curlBtn");a&&(a.onclick=()=>W(Tt(N()),"cURL \u5DF2\u590D\u5236"));let i=b("#curlImportBtn");i&&(i.onclick=da);let r=b("#copyResBtn");r&&(r.onclick=()=>{let v=N(),k=Ce(v);!v.response||v.response.error||W(k.hasJSON?JSON.stringify(k.data,null,2):v.response.text||"","\u5DF2\u590D\u5236")});let n=b("#dlBtn");n&&(n.onclick=wa);let o=b("#wrapBtn");o&&(o.onclick=()=>{let v=Ke();b("#wrapBtn").style.color=v?"var(--brand)":"",V()});let l=b("#prettyBtn");l&&(l.onclick=()=>{let v=N();v.prettyCells=v.prettyCells===!1,w(),V()});let s=b("#treeExpand");s&&(s.onclick=()=>{N().treeOpen="all",V()});let p=b("#treeCollapse");p&&(p.onclick=()=>{N().treeOpen="none",V()});let y=b("#url");y&&(y.addEventListener("input",v=>{let k=N();k.url=v.target.value,ee(k),$e()}),y.addEventListener("change",v=>{let k=N();k.url=v.target.value,Ct(k),k.reqTab==="params"&&oe(),w()}),y.addEventListener("keydown",v=>{(v.metaKey||v.ctrlKey)&&v.key==="Enter"&&Oe()})),Y("#reqSubtabs .subtab").forEach(v=>v.onclick=()=>{N().reqTab=v.dataset.rt,oe(),w()}),Y("#resSubtabs .subtab").forEach(v=>v.onclick=()=>{v.classList.contains("disabled")||(N().respView=v.dataset.rv,V(),w())});let m=b("#search");m&&m.addEventListener("input",F);let f=b("#newGroup");f&&(f.onclick=()=>{let v=prompt("\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4");v&&(u.collections.push({id:U(),name:v.trim(),collapsed:!1,requests:[]}),w(),F())});let d=b("#toggleSide");d&&(d.onclick=()=>{j.sideCollapsed=!j.sideCollapsed,b("#main").classList.toggle("collapsed",j.sideCollapsed),w()});let x=b("#layoutBtn");x&&(x.onclick=()=>{j.layout=j.layout==="h"?"v":"h",Et(),w()});let h=b("#proxyBtn");h&&(h.onclick=()=>{if(D){$("\u9762\u677F\u6A21\u5F0F\uFF1A\u8BF7\u6C42\u6052\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF08\u65E0\u9700\u624B\u52A8\u5F00\u5173\uFF09","ok");return}j.proxyOn=!j.proxyOn,jt(),w(),$(j.proxyOn?"\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406 \xB7 \u8BF7\u6C42\u7ECF\u672C\u5730\u540E\u7AEF /__proxy \u8F6C\u53D1":"\u5DF2\u5173\u95ED\u4EE3\u7406 \xB7 \u6D4F\u89C8\u5668\u76F4\u8FDE","ok")}),document.addEventListener("keydown",v=>{_e()==="api"&&((v.metaKey||v.ctrlKey)&&v.key==="Enter"&&(v.preventDefault(),Oe()),(v.metaKey||v.ctrlKey)&&(v.key==="s"||v.key==="S")&&(v.preventDefault(),ht()))})}function jt(){let e=b("#proxyBtn");e&&(e.innerHTML=D?"\u{1F6E1} \u4EE3\u7406: \u5F00(\u5BBF\u4E3B)":j.proxyOn?"\u{1F6E1} \u4EE3\u7406: \u5F00":"\u{1F6E1} \u4EE3\u7406: \u5173",e.style.color=j.proxyOn?"var(--brand)":"",e.style.borderColor=j.proxyOn?"var(--brand)":"",e.disabled=D)}function Ca(){let e=b("#divider"),t=b("#split");if(!e||!t)return;let a=!1;e.addEventListener("mousedown",i=>{a=!0,document.body.style.cursor=j.layout==="h"?"col-resize":"row-resize",document.body.style.userSelect="none",i.preventDefault()}),document.addEventListener("mousemove",i=>{if(!a)return;let r=t.getBoundingClientRect();if(j.layout==="h"){let n=Math.max(160,Math.min(Math.max(60,r.width-180),i.clientX-r.left));j.reqW=n,t.style.setProperty("--reqW",n+"px")}else{let n=Math.max(80,Math.min(Math.max(80,r.height-120),i.clientY-r.top));j.reqH=n,t.style.setProperty("--reqH",n+"px")}}),document.addEventListener("mouseup",()=>{a&&(a=!1,document.body.style.cursor="",document.body.style.userSelect="",w())})}function Ta(){let e=b("#cellTip");if(!e)return;let t=!1,a=i=>{let r=i.getAttribute("data-full");return r==null||r===""?null:i.scrollWidth>i.clientWidth+1||r.length>56?r:null};document.addEventListener("mouseover",i=>{let r=i.target;if(!(r instanceof Element))return;let n=r.closest("td[data-full]");if(!n){t&&(e.classList.remove("show"),t=!1);return}let o=a(n);if(o==null){t&&(e.classList.remove("show"),t=!1);return}e.textContent=o.length>2e3?o.slice(0,2e3)+"\u2026":o,e.classList.add("show"),t=!0}),document.addEventListener("mousemove",i=>{if(!t)return;let r=14,n=e.offsetWidth,o=e.offsetHeight,l=i.clientX+r,s=i.clientY+r;l+n>innerWidth-8&&(l=i.clientX-n-r),s+o>innerHeight-8&&(s=i.clientY-o-r),e.style.left=Math.max(8,l)+"px",e.style.top=Math.max(8,s)+"px"}),document.addEventListener("mouseout",i=>{let r=i.target;r instanceof Element&&r.closest("td[data-full]")&&(e.classList.remove("show"),t=!1)})}function Et(){let e=b("#split");if(!e)return;e.classList.toggle("h",j.layout==="h");let t=D?180:240,a=D?320:520;e.style.setProperty("--reqH",(j.reqH||t)+"px"),e.style.setProperty("--reqW",(j.reqW||a)+"px");let i=b("#layoutBtn");i&&(i.innerHTML=j.layout==="h"?"\u21C5 \u4E0A\u4E0B":"\u21C4 \u5DE6\u53F3")}function G(){Q(),ie(),oe(),He(),F(),ne()}function Ot(){Qt(),ea(),ka(),La(),Ca(),Ta(),Kt(),D&&!localStorage.getItem(Re)&&(j.sideCollapsed=!0);let e=b("#main");e&&e.classList.toggle("collapsed",j.sideCollapsed),Et(),jt(),G()}import{jsx as Ea}from"react/jsx-runtime";var Sa=`
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
`;function ja({pluginId:e,onSendToChat:t}){let a=Mt(null),i=Mt(!1);return za(()=>{let r=a.current;if(!(!r||i.current)){ze(),r.innerHTML=Sa;try{let n=document.createElement("style");n.setAttribute("data-relay-devkit",""),n.textContent=Ne,r.prepend(n)}catch(n){console.warn("[RELAY DevKit] CSS injection failed:",n)}return Te(r),Ve(!0),Fe({persist:w,rerender:V}),qe({id:"api",label:"API \u8BF7\u6C42",icon:"\u21C5"}),kt(!0),Ot(),De(),i.current=!0,()=>{r.innerHTML="",Te(document),ze(),i.current=!1}}},[]),Ea("div",{ref:a,className:"relay-devkit-panel",style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg, #16181e)",color:"var(--ink, #d8dae2)"}})}export{ja as default};
