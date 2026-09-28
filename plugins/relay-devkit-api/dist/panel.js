import{useEffect as Sr,useRef as Ht}from"react";var Ie=`/* ============================================================
   RELAY \u2014 \u8BBE\u8BA1\u7CFB\u7EDF \xB7 \u7CBE\u5BC6\u4EEA\u8868 / obsidian + signal-coral
   ============================================================ */
:root{
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
}
*{margin:0;padding:0;box-sizing:border-box}
/* \u72EC\u7ACB\u6A21\u5F0F\uFF08\u6D4F\u89C8\u5668\u6253\u5F00 index.html\uFF09\u4FDD\u7559 html/body \u5168\u5C4F\uFF1B
   \u9762\u677F\u6A21\u5F0F\u4E0B\u4E0D\u4FEE\u6539\u5BBF\u4E3B html/body\uFF08panel.jsx \u8BBE\u7F6E :host \u5BB9\u5668\u4E3A .relay-devkit-panel\uFF09\u3002 */
body:not(.relay-host) html,body:not(.relay-host){height:100%}
/* \u5BB9\u5668\u67E5\u8BE2\uFF1A\u72EC\u7ACB\u6A21\u5F0F body \u4E3A\u5BB9\u5668\uFF0C\u9762\u677F\u6A21\u5F0F .relay-devkit-panel \u4E3A\u5BB9\u5668\u3002
   @container \u57FA\u4E8E\u300C\u5BB9\u5668\u81EA\u8EAB\u5BBD\u5EA6\u300D\u89E6\u53D1\uFF0C\u800C\u975E\u89C6\u53E3\uFF0C\u4F7F\u7A84\u9762\u677F\u81EA\u52A8\u7D27\u51D1\u5E03\u5C40\u3002 */
body:not(.relay-host){container-type:inline-size}
.relay-devkit-panel{container-type:inline-size;position:relative}
/* \u9762\u677F\u6839\u5BB9\u5668\u5185\u90E8\u5E03\u5C40\uFF08\u907F\u514D\u6C61\u67D3\u5BBF\u4E3B body\uFF09 */
.relay-devkit-panel{background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}
body:not(.relay-host){background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}
/* \u80CC\u666F\u88C5\u9970 \u2014 \u72EC\u7ACB\u6A21\u5F0F fixed \u5728\u89C6\u53E3\u3001\u9762\u677F\u6A21\u5F0F absolute \u9650\u5236\u5728\u5BB9\u5668\u5185 */
body:not(.relay-host)::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;
  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}
body:not(.relay-host)::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.45;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}
.relay-devkit-panel::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}
.relay-devkit-panel::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.45;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}
.relay-devkit-panel > *{position:relative;z-index:1}
::selection{background:var(--brand);color:var(--brand-ink)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:6px;border:2px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.16);background-clip:padding-box}
button,input,select,textarea{font-family:inherit;font-size:inherit;color:inherit;background:none;border:none;outline:none}
button{cursor:pointer}
input,textarea{caret-color:var(--brand)}

.app{grid-template-rows:var(--topbar) 1fr var(--statusbar)}

/* ===== \u5916\u58F3\uFF1A\u9876\u90E8\u5BFC\u822A + \u89C6\u56FE\u8DEF\u7531 ===== */
.navbar{display:flex;align-items:center;gap:14px;height:42px;flex:none;padding:0 14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.03),transparent);backdrop-filter:blur(8px);position:relative;z-index:50}
.nav-brand{display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:15px;color:var(--ink)}
.nav-brand .dot{width:8px;height:8px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}
.nav-brand small{font-family:var(--mono);font-weight:500;font-size:9px;letter-spacing:.22em;color:var(--dimmer)}
.nav-tabs{display:flex;gap:2px;overflow-x:auto;overflow-y:hidden;max-width:100%}
.nav-tabs::-webkit-scrollbar{height:0}
.nav-tab{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 13px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);border:1px solid transparent;transition:.14s;letter-spacing:.01em}
.nav-tab:hover{color:var(--ink);background:var(--surface-2)}
.nav-tab.on{color:var(--brand);background:var(--surface-2);border-color:var(--line-2)}
.nav-tab .tcn{font-size:13px;font-family:var(--disp)}
.nav-sp{flex:1}
.nav-hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em}
#view{flex:1;min-height:0;position:relative}
.view{position:absolute;inset:0;display:none;min-height:0}
.view.on{display:flex;flex-direction:column}
#viewApi.on{display:grid}

/* ===== \u9996\u9875 ===== */
.home{position:absolute;inset:0;overflow:auto;padding:54px 40px}
.home-inner{max-width:1080px;margin:0 auto}
.home-hero{margin-bottom:34px}
.home-hero .eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--brand);margin-bottom:12px}
.home-hero h1{font-family:var(--disp);font-weight:800;font-size:36px;letter-spacing:-.02em;margin-bottom:12px;line-height:1.1}
.home-hero p{color:var(--dim);font-size:14px;max-width:640px;line-height:1.75}
.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.tool-card{display:flex;flex-direction:column;gap:11px;padding:20px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));cursor:pointer;transition:.16s;position:relative;overflow:hidden;text-align:left}
.tool-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent,var(--brand));opacity:0;transition:.16s}
.tool-card:hover{border-color:var(--line-2);transform:translateY(-2px);box-shadow:0 20px 44px -24px rgba(0,0,0,.85)}
.tool-card:hover::before{opacity:1}
.tool-card .ic{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;font-family:var(--disp);font-weight:700;background:color-mix(in srgb,var(--accent,var(--brand)) 15%,transparent);color:var(--accent,var(--brand))}
.tool-card .nm{font-family:var(--disp);font-weight:700;font-size:16px;color:var(--ink)}
.tool-card .ds{font-size:12px;color:var(--dim);line-height:1.65}
.tool-card .go{margin-top:auto;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer);transition:.14s}
.tool-card:hover .go{color:var(--accent,var(--brand))}

/* ===== \u901A\u7528\u5DE5\u5177\u9762\u677F\uFF08JSON / SQL / \u65F6\u95F4\u6233\u5171\u7528\uFF09 ===== */
.tool-pane{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.t-bar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}
.t-bar .t-title{font-family:var(--disp);font-weight:700;font-size:13px;margin-right:6px;display:flex;align-items:center;gap:7px}
.t-bar .t-title .tg{color:var(--brand)}
.t-bar .sp{flex:1}
.t-btn{font-size:11.5px;color:var(--dim);padding:6px 11px;border:1px solid var(--line);border-radius:var(--r-sm);transition:.14s;white-space:nowrap}
.t-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}
.t-btn.on{color:var(--brand);border-color:var(--brand)}
.t-btn.primary{color:var(--brand-ink);background:var(--brand);border-color:var(--brand);font-weight:700}
.t-btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}
.t-status{font-size:11px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.t-status.ok{color:var(--ok)} .t-status.err{color:var(--err)}
.t-seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}
.t-seg button{padding:6px 13px;font-size:11.5px;color:var(--dim);transition:.13s}
.t-seg button:hover{color:var(--ink);background:var(--surface)}
.t-seg button.on{background:var(--surface-3);color:var(--ink)}

/* JSON \u5DE5\u5177\uFF1A\u5DE6\u8F93\u5165 / \u53F3\u89C6\u56FE */
.jsplit{flex:1;display:flex;min-height:0}
.jspane-l{width:42%;min-width:180px;max-width:64%;display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0;position:relative}
.jspane-r{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.jspane-l textarea{flex:1;width:100%;resize:none;padding:13px;font-size:12.5px;line-height:1.65;background:transparent;color:var(--ink);white-space:pre;tab-size:2;min-height:0}
.jspane-l textarea::placeholder{color:var(--dimmer)}
.jdiv{width:7px;cursor:col-resize;flex:none;position:relative}
.jdiv::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--line);transition:.15s}
.jdiv:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}

/* SQL / \u65F6\u95F4\u6233\uFF1A\u5355\u5217\u5185\u5BB9 */
.t-body{flex:1;min-height:0;overflow:auto;padding:16px}
.t-field{margin-bottom:14px}
.t-field label{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);margin-bottom:7px}
.t-ta{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:12px 13px;font-size:12.5px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word;tab-size:2;resize:vertical;min-height:64px;font-family:var(--mono)}
.t-ta:focus{border-color:var(--brand)}
.t-in{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:14px;color:var(--ink);font-family:var(--mono)}
.t-in:focus{border-color:var(--brand)}
.t-out{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:13px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--ink);min-height:42px}
.t-note{font-size:11px;color:var(--dimmer);margin-top:7px;line-height:1.6}
.t-note.err{color:var(--err)} .t-note.ok{color:var(--ok)}
.t-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@container (max-width:760px){.t-grid{grid-template-columns:1fr}}
.t-card{border:1px solid var(--line);border-radius:11px;padding:16px;background:var(--surface)}
.t-card h4{font-family:var(--disp);font-weight:700;font-size:13px;margin-bottom:12px;color:var(--ink)}
.kvline{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}
.kvline:last-child{border-bottom:0}
.kvline .kk{font-size:11px;color:var(--dim);width:92px;flex:none;letter-spacing:.04em}
.kvline .vv{flex:1;font-size:13px;color:var(--ink);word-break:break-all;font-variant-numeric:tabular-nums}
.kvline .cp{font-size:10.5px;color:var(--dimmer);border:1px solid var(--line);border-radius:4px;padding:2px 8px;flex:none;transition:.13s}
.kvline .cp:hover{color:var(--brand);border-color:var(--brand)}
.t-now{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:13px 16px;border:1px solid var(--line);border-radius:11px;background:var(--bg-2);margin-bottom:16px}
.t-now .lab{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer)}
.t-now .clk{font-family:var(--mono);font-size:15px;color:var(--brand);font-variant-numeric:tabular-nums}

/* \u9876\u680F */
.topbar{display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--line);
  background:linear-gradient(180deg,rgba(255,255,255,.022),transparent);backdrop-filter:blur(8px);z-index:30}
.brand{display:flex;align-items:center;gap:9px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:16px}
.brand .dot{width:9px;height:9px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}
.brand small{font-family:var(--mono);font-weight:500;font-size:10px;letter-spacing:.22em;color:var(--dimmer);text-transform:uppercase;margin-left:2px}
.topbar .spacer{flex:1}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:var(--r-sm);color:var(--dim);border:1px solid transparent;transition:.16s}
.icon-btn:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line)}
.top-act{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--r-sm);color:var(--dim);border:1px solid var(--line);font-size:11.5px;letter-spacing:.02em;transition:.15s;white-space:nowrap}
.top-act:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line-2)}
/* \u7981\u53D1\u5934\u63D0\u793A\uFF1A\u4EE3\u7406\u6309\u94AE\u8109\u52A8\u5F15\u5BFC\u5F00\u4EE3\u7406 */
.top-act.pulse-hint{animation:relayPulse 1.2s ease-in-out 2;border-color:var(--warn);color:var(--warn)}
@keyframes relayPulse{0%,100%{transform:scale(1);box-shadow:none}50%{transform:scale(1.06);box-shadow:0 0 0 4px rgba(245,158,11,.22)}}
.hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em;display:flex;gap:14px}
.hint kbd{font-family:var(--mono);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--dim);font-size:10px}

/* \u73AF\u5883\u5207\u6362 */
.env-wrap{position:relative}
.env-sel{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--surface);transition:.15s;max-width:230px}
.env-sel:hover{border-color:var(--dim)}
.env-sel .ehex{color:var(--brand);font-size:13px}
.env-sel #envName{font-size:12px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.env-sel .car{font-size:8px;color:var(--dim)}
.env-menu{position:absolute;top:36px;right:0;min-width:230px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;z-index:80;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}
.env-menu.open{display:block}
.env-item{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:7px 10px;border-radius:var(--r-sm);transition:.12s}
.env-item:hover{background:var(--surface-3)}
.env-item.on{box-shadow:inset 2px 0 0 var(--brand)}
.env-item span{font-size:12px;color:var(--ink)}
.env-item small{font-size:10px;color:var(--dimmer)}
.env-item.manage{border-top:1px solid var(--line);margin-top:4px;padding-top:9px;color:var(--dim)}
.env-item.manage span,.env-item.manage{color:var(--dim);font-size:11.5px}

.main{display:grid;grid-template-columns:var(--side) 1fr;min-height:0;overflow:hidden}
.main.collapsed{grid-template-columns:0 1fr}

/* \u4FA7\u680F */
.side{border-right:1px solid var(--line);background:var(--bg-2);display:flex;flex-direction:column;min-height:0;overflow:hidden}
.side-head{display:flex;align-items:center;gap:6px;padding:11px 12px;border-bottom:1px solid var(--line)}
.side-head .t{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);font-weight:600;flex:1}
.side-head .mini-btn{width:26px;height:26px;border-radius:var(--r-sm);color:var(--dim);display:inline-flex;align-items:center;justify-content:center;transition:.15s;border:1px solid transparent;font-size:13px}
.side-head .mini-btn:hover{color:var(--brand);background:var(--surface);border-color:var(--line)}
.side-search{padding:8px 10px;border-bottom:1px solid var(--line)}
.side-search input{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 10px;font-size:12px;color:var(--ink);transition:.15s}
.side-search input:focus{border-color:var(--line-2);background:var(--surface-2)}
.side-search input::placeholder{color:var(--dimmer)}
.tree{flex:1;overflow-y:auto;padding:6px 6px 40px}
.group{margin-bottom:2px}
.group-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;color:var(--dim);transition:.12s;user-select:none}
.group-head:hover{background:var(--surface)}
.group-head .caret{width:12px;font-size:9px;color:var(--dimmer);transition:transform .15s;flex:none;text-align:center}
.group.collapsed .caret{transform:rotate(-90deg)}
.group-head .gname{flex:1;font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.group-head .gcount{font-size:10px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:1px 7px}
.group-head .gact{display:none;gap:2px}
.group-head:hover .gact{display:flex}
.group-head:hover .gcount{display:none}
.gact .x{width:20px;height:20px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}
.gact .x:hover{color:var(--brand);background:var(--surface-2)}
.group.collapsed .reqs{display:none}
.reqs{padding:2px 0 4px 8px}
.req-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;position:relative}
.req-item:hover{background:var(--surface)}
.req-item.active{background:var(--surface-2);box-shadow:inset 2px 0 0 var(--brand)}
.req-item .mb{flex:none;font-size:9px;font-weight:700;letter-spacing:.03em;width:38px;text-align:right}
.req-item .rn{flex:1;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.req-item .rx{display:none;width:18px;height:18px;border-radius:4px;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}
.req-item:hover .rx{display:inline-flex}
.req-item .rx:hover{color:var(--err);background:var(--surface-2)}
.tree-empty{padding:24px 14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.8}
.m-GET{color:var(--m-get)} .m-POST{color:var(--m-post)} .m-PUT{color:var(--m-put)}
.m-PATCH{color:var(--m-patch)} .m-DELETE{color:var(--m-del)} .m-HEAD,.m-OPTIONS{color:var(--m-other)}

/* \u5DE5\u4F5C\u533A */
.work{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.tabbar{display:flex;align-items:stretch;height:var(--tabsbar);min-height:var(--tabsbar);border-bottom:1px solid var(--line);background:var(--bg-2);overflow-x:auto;overflow-y:hidden}
.tabbar::-webkit-scrollbar{height:0}
.rtab{display:flex;align-items:center;gap:8px;padding:0 12px;border-right:1px solid var(--line);cursor:pointer;color:var(--dim);transition:.14s;white-space:nowrap;max-width:240px;position:relative;flex:none}
.rtab:hover{background:var(--surface);color:var(--ink)}
.rtab.active{background:var(--surface-2);color:var(--ink)}
.rtab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand)}
.rtab .tm{font-size:9px;font-weight:700;flex:none}
.rtab .tn{font-size:12px;max-width:138px;overflow:hidden;text-overflow:ellipsis}
.rtab .dirty{width:6px;height:6px;border-radius:50%;background:var(--brand);flex:none}
.rtab .tx{width:16px;height:16px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:var(--dimmer);flex:none}
.rtab .tx:hover{color:var(--ink);background:var(--surface-3)}
.tab-add{flex:none;width:38px;display:inline-flex;align-items:center;justify-content:center;color:var(--dim);font-size:18px;border-right:1px solid var(--line)}
.tab-add:hover{color:var(--brand);background:var(--surface)}

.reqbar{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);align-items:center}
.method-wrap{position:relative;flex:none}
.method-sel{display:flex;align-items:center;gap:7px;padding:0 12px;height:36px;border:1px solid var(--line-2);border-radius:var(--r);background:var(--surface);font-weight:700;font-size:12.5px;letter-spacing:.04em;min-width:104px;justify-content:space-between;transition:.15s}
.method-sel:hover{border-color:var(--dim)}
.method-sel .car{font-size:9px;color:var(--dim)}
.method-menu{position:absolute;top:42px;left:0;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);z-index:60;min-width:130px;padding:5px;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);display:none}
.method-menu.open{display:block}
.method-menu button{display:flex;width:100%;padding:7px 10px;border-radius:var(--r-sm);font-weight:700;font-size:12px;letter-spacing:.04em}
.method-menu button:hover{background:var(--surface-3)}
.url-wrap{flex:1;min-width:0;position:relative;display:flex;flex-direction:column}
.url-input{height:36px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:0 14px;font-size:13px;color:var(--ink);transition:.15s;width:100%}
.url-input:focus{border-color:var(--line-2);background:var(--surface-2)}
.url-input::placeholder{color:var(--dimmer)}
.url-resolved{position:absolute;top:38px;left:2px;font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none}
.url-resolved b{color:var(--m-post)}
.btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:var(--r);font-weight:600;font-size:12.5px;letter-spacing:.02em;border:1px solid var(--line-2);color:var(--ink);background:var(--surface);transition:.16s;white-space:nowrap}
.btn:hover{border-color:var(--dim);background:var(--surface-2)}
.btn.primary{background:var(--brand);color:var(--brand-ink);border-color:var(--brand);font-weight:700}
.btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}
.btn.primary:disabled{opacity:.55;cursor:wait}
.btn .k{font-size:9.5px;opacity:.6;font-weight:500}
.btn.ghost{background:transparent}
.btn.icon{padding:0 11px}
.btn.danger{color:var(--err);border-color:rgba(248,81,73,.4)}
.btn.danger:hover{background:rgba(248,81,73,.12)}

/* \u8BF7\u6C42/\u54CD\u5E94\u5206\u9694 */
.split{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}
.split.h{flex-direction:row}
.req-region{flex:none;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
.split:not(.h) .req-region{height:var(--reqH,240px)}
.split.h .req-region{width:var(--reqW,520px)}
.divider{flex:none;position:relative;background:transparent;z-index:5}
.split:not(.h) .divider{height:8px;cursor:row-resize}
.split.h .divider{width:8px;cursor:col-resize}
.divider::before{content:'';position:absolute;background:var(--line);transition:.15s}
.split:not(.h) .divider::before{left:0;right:0;top:50%;height:1px}
.split.h .divider::before{top:0;bottom:0;left:50%;width:1px}
.split:not(.h) .divider:hover::before{background:var(--brand);height:2px;box-shadow:0 0 10px var(--brand)}
.split.h .divider:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}
.res-region{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}

.subtabs{display:flex;align-items:center;gap:2px;padding:6px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap}
.subtab{padding:5px 12px;border-radius:var(--r-sm);font-size:11.5px;color:var(--dim);letter-spacing:.03em;transition:.13s;white-space:nowrap}
.subtab:hover{color:var(--ink);background:var(--surface)}
.subtab.active{color:var(--brand);background:var(--surface-2)}
.subtab.disabled{color:var(--dimmer);opacity:.45;pointer-events:none}
.subtab .badge{font-size:9px;color:var(--dimmer);margin-left:5px}
.subtab.active .badge{color:var(--brand)}
.subtabs .sp{flex:1}
.subtabs .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.14s}
.subtabs .tool:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}
.pane{flex:1;overflow:auto;min-height:0}

/* key-value \u7F16\u8F91\u5668 */
.kv{width:100%}
.kv .kv-row{display:grid;grid-template-columns:30px 1fr 1fr 30px;align-items:center;border-bottom:1px solid var(--line)}
.kv .kv-row:hover{background:rgba(255,255,255,.014)}
.kv input[type=text]{width:100%;padding:8px 10px;font-size:12px;background:transparent;color:var(--ink)}
.kv input[type=text]::placeholder{color:var(--dimmer)}
.kv input.k{color:var(--brand-hi);border-right:1px solid var(--line)}
.kv .ck{display:flex;align-items:center;justify-content:center}
.kv .ck input{accent-color:var(--brand);width:13px;height:13px;cursor:pointer}
.kv .rm{display:flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:13px;height:100%}
.kv .rm:hover{color:var(--err)}
.kv-row.blank input.k{color:var(--dim)}
.kv-row.blank .ck,.kv-row.blank .rm{opacity:.3}

.body-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}
.seg button{padding:5px 11px;font-size:11px;color:var(--dim);transition:.13s}
.seg button:hover{color:var(--ink);background:var(--surface)}
.seg button.on{background:var(--surface-3);color:var(--ink)}
.body-bar .sp{flex:1}
.body-bar .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border:1px solid var(--line);border-radius:var(--r-sm)}
.body-bar .tool:hover{color:var(--ink);border-color:var(--line-2)}
textarea.code{width:100%;height:100%;min-height:110px;resize:none;padding:12px;font-size:12.5px;line-height:1.6;background:transparent;color:var(--ink);white-space:pre;tab-size:2}
.body-none{padding:30px;text-align:center;color:var(--dimmer);font-size:12px;line-height:1.9}

/* \u54CD\u5E94\u5934\u6761 + \u5DE5\u5177 */
.res-status{display:flex;align-items:center;gap:14px;padding:8px 12px;border-bottom:1px solid var(--line);flex:none;font-size:12px;flex-wrap:wrap}
.status-chip{display:inline-flex;align-items:center;gap:7px;font-weight:700;letter-spacing:.02em}
.status-chip .dotc{width:8px;height:8px;border-radius:50%}
.res-meta{color:var(--dim);display:flex;gap:14px;flex-wrap:wrap}
.res-meta b{color:var(--ink);font-weight:600}
.res-tools{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--line);flex:none}
.res-tools .ti{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 9px;height:28px}
.res-tools .ti .lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer)}
.res-tools .ti input{width:100%;font-size:12px;color:var(--ink);background:transparent;padding:5px 0}
.res-tools .ti.path{flex:1.2;min-width:120px}
.res-tools .ti.filter{flex:1;min-width:100px}
.res-tools .ti input::placeholder{color:var(--dimmer)}
.res-tools .ti.path{flex:none;min-width:0}
.res-tools .ti.path .lbl{color:var(--m-post)}
.res-tools .ti.manual{flex:1;min-width:130px}
/* \u589E\u5F3A\u8FC7\u6EE4\u680F */
.fb-bar{position:relative;display:flex;align-items:center;flex:1;min-width:100px;gap:0;flex-wrap:wrap}
.fb-edit{border:none;background:transparent;color:var(--ink);font-size:12px;flex:1;min-width:60px;padding:5px 0;outline:none}
.fb-edit::placeholder{color:var(--dimmer)}
.fb-tokens{display:none;flex-wrap:wrap;gap:4px;margin-right:4px;align-items:center}
.ftk{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:10.5px;white-space:nowrap;border:1px solid var(--line);background:rgba(255,255,255,.03);line-height:1.6}
.ftk .ftk-field{color:var(--j-key);font-weight:600}
.ftk .ftk-op{color:var(--dimmer);font-size:10px}
.ftk .ftk-val{color:var(--j-str)}
.ftk .ftk-num{color:var(--j-num)}
.ftk .ftk-bool{color:var(--j-bool)}
.ftk .ftk-null{color:var(--j-null);font-style:italic}
.ftk .ftk-neg{color:var(--err);font-weight:700}
.fb-ac{position:absolute;top:100%;left:0;z-index:90;min-width:160px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:5px;display:none;margin-top:2px}
.fb-ac.open{display:block}
.fb-ac-item{display:block;width:100%;text-align:left;padding:5px 9px;border-radius:var(--r-sm);font-size:11.5px;color:var(--ink)}
.fb-ac-item:hover{background:var(--surface-3);color:var(--brand)}
.pathdd{position:relative}
.pathdd-btn{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 4px 0 2px;background:transparent;color:var(--ink);font-size:11.5px;max-width:210px}
.pathdd-btn>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:176px}
.pathdd-btn .pcar{color:var(--dim);font-size:8px;flex:none}
.pathdd-btn:hover{color:var(--brand)}
.path-menu{position:absolute;top:34px;left:0;z-index:90;width:320px;max-width:80vw;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:7px;display:none}
.path-menu.open{display:block}
.path-filter{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 9px;font-size:12px;color:var(--ink);margin-bottom:6px}
.path-filter:focus{border-color:var(--line-2);background:var(--surface-3)}
.path-list{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:1px}
.path-opt{display:flex;align-items:center;gap:8px;width:100%;padding:6px 9px;border-radius:var(--r-sm);text-align:left;transition:.1s}
.path-opt:hover{background:var(--surface-3)}
.path-opt.on{box-shadow:inset 2px 0 0 var(--brand);background:var(--surface-3)}
.path-opt .pp{flex:1;font-size:11.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.path-opt .pk{flex:none;font-size:10px;color:var(--dimmer);font-variant-numeric:tabular-nums}
.path-opt .pk.array{color:var(--j-num)} .path-opt .pk.object{color:var(--j-key)}
.path-empty{padding:14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.7}
.cell-tip{position:fixed;z-index:200;max-width:480px;max-height:60vh;overflow:hidden;background:var(--surface-3);border:1px solid var(--line-2);border-radius:6px;padding:8px 11px;font:12px/1.55 var(--mono);color:var(--ink);white-space:pre-wrap;word-break:break-word;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);pointer-events:none;opacity:0;transition:opacity .1s;left:0;top:0}
.cell-tip.show{opacity:1}

.res-idle{padding:36px 22px;text-align:center;color:var(--dimmer);font-size:12.5px;line-height:1.95}
.res-idle .big{font-family:var(--disp);font-size:16px;color:var(--dim);margin-bottom:6px}
.res-idle .tips{margin-top:14px;display:inline-block;text-align:left;font-size:11.5px;color:var(--dimmer);line-height:2}
.res-idle .tips b{color:var(--dim)}
.res-loading{display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--dim);font-size:12.5px}
.spin{width:16px;height:16px;border:2px solid var(--line-2);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.res-err{padding:22px;color:var(--err);font-size:12.5px;line-height:1.7}
.res-err .ti{font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.res-err .hintbox{margin-top:12px;padding:11px 13px;background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.25);border-radius:var(--r);color:var(--dim);font-size:11.5px}
.prev-none,.dimnote{padding:30px;text-align:center;color:var(--dimmer);font-size:12.5px}
.dimnote{padding:16px;text-align:left}

pre.raw{padding:14px;font-size:12.5px;line-height:1.65;white-space:pre;overflow:auto;tab-size:2}
pre.raw.wrap{white-space:pre-wrap;word-break:break-word}
.tok-key{color:var(--j-key)} .tok-str{color:var(--j-str)} .tok-num{color:var(--j-num)} .tok-bool{color:var(--j-bool)} .tok-null{color:var(--j-null)} .tok-id{color:var(--m-get);font-weight:500}

.jtree{padding:12px;font-size:12.5px;line-height:1.6}
.jt-node{padding-left:15px;position:relative}
.jt-row{display:flex;align-items:flex-start;gap:5px;padding:.5px 0;border-radius:3px}
.jt-row.expandable{cursor:pointer}
.jt-row.expandable:hover{background:rgba(255,255,255,.025)}
.jt-tog{position:absolute;left:1px;color:var(--dimmer);font-size:9px;width:12px;text-align:center;user-select:none;top:3px}
.jt-key{color:var(--j-key)} .jt-colon{color:var(--dimmer)}
.jt-str{color:var(--j-str)} .jt-num{color:var(--j-num)} .jt-bool{color:var(--j-bool)} .jt-null{color:var(--j-null)}
.jt-prev{color:var(--dimmer);font-style:italic}
.jt-children.hide{display:none}
.jt-act{margin-left:8px;opacity:0;font-size:10px;transition:.12s;display:inline-flex;gap:8px}
.jt-row:hover .jt-act{opacity:1}
.jt-act b{color:var(--dimmer);cursor:pointer}
.jt-act b:hover{color:var(--brand)}
.hl{background:rgba(255,122,89,.28);border-radius:2px;color:#fff}

.tbl-cands{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--bg-2)}
.tbl-cands .lab{font-size:10px;color:var(--dimmer);letter-spacing:.1em;text-transform:uppercase;align-self:center;margin-right:2px}
.tcand{font-size:11px;color:var(--dim);padding:4px 10px;border:1px solid var(--line);border-radius:20px;transition:.13s;display:inline-flex;gap:6px;align-items:center}
.tcand:hover{color:var(--ink);border-color:var(--line-2)}
.tcand.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}
.tcand em{font-style:normal;color:var(--dimmer);font-size:10px}
.tcand.on em{color:var(--brand)}
/* \u5217\u9009\u62E9\u5668 */
.col-picker{display:flex;flex-wrap:wrap;padding:4px 12px;border-bottom:1px solid var(--line);background:var(--bg-2);align-items:center;gap:5px}
.col-picker.collapsed{flex-wrap:nowrap}
.col-toggle{font-size:11px;color:var(--dim);padding:3px 10px;border:1px solid var(--line);border-radius:20px;cursor:pointer;white-space:nowrap;transition:.13s}
.col-toggle:hover{color:var(--ink);border-color:var(--line-2)}
.col-body{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.col-picker.collapsed .col-body{display:none}
.col-q{font-size:10px;color:var(--dimmer);padding:3px 9px;border:1px solid var(--line);border-radius:var(--r-sm);margin-right:4px}
.col-q:hover{color:var(--ink);border-color:var(--line-2)}
.col-chip{font-size:11px;padding:3px 10px;border:1px solid var(--line);border-radius:20px;color:var(--dim);transition:.13s;cursor:grab}
.col-chip:hover{color:var(--ink);border-color:var(--line-2)}
.col-chip.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}
.col-chip.dragging{opacity:.35}
.col-chip.drag-over{border-color:var(--brand);box-shadow:0 0 0 2px rgba(255,122,89,.25)}
.tbl-host{display:flex;flex-direction:column;height:100%;min-height:0}
.tbl-wrap{flex:1;min-height:0;overflow:auto}
table.dt{border-collapse:separate;border-spacing:0;font-size:12px;width:auto;min-width:100%}
table.dt th,table.dt td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 11px;text-align:left;vertical-align:middle;max-width:340px;min-width:54px}
table.dt th:first-child,table.dt td:first-child{border-left:1px solid var(--line)}
table.dt thead th{border-top:1px solid var(--line)}
table.dt th{position:sticky;top:0;background:var(--surface-2);color:var(--ink);font-weight:600;letter-spacing:.01em;font-size:11px;white-space:nowrap;z-index:2;user-select:none}
table.dt th.sortable{cursor:pointer}
table.dt th.sortable:hover{color:var(--brand)}
table.dt th.sort-asc::after{content:' \u25B2';font-size:9px;color:var(--brand)}
table.dt th.sort-desc::after{content:' \u25BC';font-size:9px;color:var(--brand)}
table.dt th.idx{left:0;z-index:4}
table.dt td{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
table.dt tr:hover td{background:rgba(255,255,255,.022)}
table.dt tr:hover td.idx{background:var(--surface)}
table.dt td.idx{color:var(--dimmer);text-align:right;font-variant-numeric:tabular-nums;background:var(--bg-2);position:sticky;left:0;z-index:1;min-width:42px}
table.dt .cobj{color:var(--j-key);cursor:default}
.cell-num{color:var(--j-num)} .cell-bool{color:var(--j-bool)} .cell-null{color:var(--j-null);font-style:italic} .cell-str{color:var(--ink)}
.cell-img{height:30px;width:30px;object-fit:cover;border-radius:5px;border:1px solid var(--line-2);vertical-align:middle;background:repeating-conic-gradient(#1a1d24 0 25%,#14161b 0 50%) 50%/10px 10px}
.cell-imn{color:var(--dim);margin-left:7px;font-size:11px}
.cell-ts{color:var(--j-num);background:rgba(255,171,112,.09);border:1px solid rgba(255,171,112,.2);border-radius:4px;padding:1px 7px;font-size:11px;white-space:nowrap}
.col-grip{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;z-index:5}
.col-grip:hover{background:linear-gradient(90deg,transparent,var(--brand))}
.col-grip:active{background:var(--brand)}
.tbl-note{padding:6px 12px;font-size:10.5px;color:var(--dimmer);border-bottom:1px solid var(--line);background:var(--bg-2);flex:none}
.prev-frame{width:100%;height:100%;border:0;background:#fff}
.prev-img-wrap{padding:18px;display:flex;align-items:flex-start;justify-content:center;height:100%;overflow:auto}
.prev-img-wrap img{max-width:100%;background:repeating-conic-gradient(#1a1d24 0% 25%, #14161b 0% 50%) 50%/18px 18px;border:1px solid var(--line)}

.statusbar{display:flex;align-items:center;gap:16px;padding:0 14px;border-top:1px solid var(--line);background:var(--bg-2);font-size:10.5px;color:var(--dimmer);letter-spacing:.03em}
.statusbar .msg{flex:1;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.statusbar .msg.ok{color:var(--ok)} .statusbar .msg.err{color:var(--err)} .statusbar .msg.warn{color:var(--warn)}
.statusbar .seg-r{display:flex;gap:16px}
.statusbar b{color:var(--dim);font-weight:600}

.modal-bg{position:fixed;inset:0;background:rgba(5,6,9,.66);backdrop-filter:blur(3px);z-index:100;display:none;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;width:min(460px,92cqw);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);overflow:hidden;animation:pop .16s ease;max-height:88vh;overflow-y:auto}
.modal.wide{width:min(620px,94cqw)}
@keyframes pop{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.modal h3{font-family:var(--disp);font-weight:700;font-size:16px;padding:16px 18px 4px}
.modal .sub{padding:0 18px 14px;color:var(--dim);font-size:11.5px;line-height:1.6}
.modal .field{padding:0 18px 12px}
.modal label{display:block;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dimmer);margin-bottom:6px}
.modal input,.modal select{width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink)}
.modal input:focus,.modal select:focus{border-color:var(--brand)}
.modal .acts{display:flex;align-items:center;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line);margin-top:6px}
.curl-ta{width:100%;min-height:150px;resize:vertical;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word}
.env-tabs{display:flex;gap:5px;flex-wrap:wrap;padding:0 18px 12px}
.env-tab{font-size:11.5px;color:var(--dim);padding:5px 11px;border:1px solid var(--line);border-radius:20px;transition:.13s}
.env-tab:hover{color:var(--ink);border-color:var(--line-2)}
.env-tab.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}
.env-tab.add{color:var(--dimmer)}
.env-vars{border:1px solid var(--line);border-radius:var(--r);overflow:hidden}

.toast{position:fixed;bottom:38px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;background:var(--surface-3);border:1px solid var(--line-2);color:var(--ink);padding:9px 16px;border-radius:30px;font-size:12px;z-index:120;transition:.22s;pointer-events:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.6)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast b{color:var(--brand)}

/* ===== \u5BB9\u5668\u67E5\u8BE2\uFF1A\u7A84\u9762\u677F\u7D27\u51D1\u5E03\u5C40 ===== */
@container (max-width:880px){
  :root{--side:0px}
  .hint{display:none}
  .nav-hint{display:none}
  .split.h .req-region{width:46%}
  .reqbar{flex-wrap:wrap}
  .topbar{flex-wrap:wrap;height:auto;min-height:var(--topbar);padding:6px 10px}
  .env-sel{max-width:150px}
  .db-side{width:168px}
  .cm{min-height:280px}
}
@container (max-width:560px){
  .nav-tabs .nav-tab{padding:0 9px;font-size:11px}
  .nav-tabs .nav-tab .tcn{font-size:12px}
  .brand small{display:none}
  .env-sel{max-width:110px}
  .top-act{padding:0 8px;font-size:11px}
  .db-side{display:none}
  .cm-list{width:120px}
  .cm{min-height:240px}
  .db-conn{padding:18px 14px}
  .db-conn .db-card{padding:16px 16px}
}

/* ===== \u6570\u636E\u5E93\u5DE5\u5177 ===== */
.db-conn{position:absolute;inset:0;overflow:auto;padding:30px 28px}
.db-conn .db-card{max-width:560px;margin:0 auto;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));padding:22px 24px}
.db-conn h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:12px}
.db-conn .sub{color:var(--dim);font-size:11.5px;line-height:1.7;margin-bottom:16px}
.db-row{display:flex;gap:10px;align-items:center;margin-bottom:11px}
.db-row label{width:104px;flex:none;font-size:11px;color:var(--dim);letter-spacing:.04em;text-align:right}
.db-row .t-in{font-size:13px;padding:9px 12px}
.db-row.inline{justify-content:flex-start;gap:14px}
.db-row.inline .ckbox{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}
.db-row.inline .ckbox input{accent-color:var(--brand);width:14px;height:14px}
.db-acts{display:flex;gap:9px;margin-top:6px;padding-left:114px}
@container (max-width:620px){ .db-row{flex-direction:column;align-items:stretch} .db-row label{width:auto;text-align:left} .db-acts{padding-left:0} }

.db-main{flex:1;display:flex;min-height:0}
.db-side{width:218px;flex:none;border-right:1px solid var(--line);overflow:hidden;padding:0;background:var(--bg-2);display:flex;flex-direction:column}
.db-side .db-side-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:8px 8px 6px;display:flex;align-items:center;gap:6px;flex-shrink:0;border-bottom:1px solid var(--line)}
.db-side .db-side-h .db-sel-btn{width:20px;height:20px;border-radius:var(--r-sm);color:var(--dimmer);font-size:11px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.db-side .db-side-h .db-sel-btn:hover{color:var(--brand);background:var(--surface)}
.db-side-search{padding:6px 8px;flex-shrink:0}
.db-side-search .t-in{font-size:11.5px;padding:6px 9px;background:var(--surface)}
.db-side-tabs{display:flex;gap:0;padding:0 8px;flex-shrink:0;border-bottom:1px solid var(--line)}
.db-side-tab{flex:1;padding:5px 0;font-size:11px;text-align:center;color:var(--dimmer);border-bottom:2px solid transparent;cursor:pointer;transition:.12s}
.db-side-tab:hover{color:var(--dim)}
.db-side-tab.on{color:var(--brand);border-bottom-color:var(--brand)}
.db-side-scroll{flex:1;min-height:0;overflow:auto;padding:0 8px 8px}
.dbt{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 9px;border-radius:var(--r-sm);color:var(--dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbt:hover{background:var(--surface);color:var(--ink)}
.dbt.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}
.dbt .dbt-n{flex:1;overflow:hidden;text-overflow:ellipsis}
.dbt .dbt-pk{font-size:9px;color:var(--j-num)}
.dbt .dbt-cols{font-size:9px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:0 6px;min-width:18px;text-align:center;line-height:1.6}
.dbt.dbt-db .dbt-icon{font-size:13px;flex:none}
.dbt.dbt-db .dbt-n{color:var(--ink);font-weight:500}
.dbt-hist{position:relative;align-items:flex-start;white-space:normal}
.dbt-hist .dbt-sql{flex:1;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--ink);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal}
.dbt-hist .dbt-meta{font-size:9px;color:var(--dimmer);white-space:nowrap;flex:none;margin-top:2px}
.dbt-hist .dbt-acts{display:none;gap:3px;position:absolute;right:4px;top:3px}
.dbt-hist:hover .dbt-acts{display:flex}
.dbt-hist:hover .dbt-meta{display:none}
.dbt-hist-act{width:20px;height:20px;border-radius:3px;color:var(--dimmer);font-size:10px;display:inline-flex;align-items:center;justify-content:center}
.dbt-hist-act:hover{background:var(--surface-2);color:var(--ink)}
.hist-empty{color:var(--dimmer);font-size:11px;padding:20px 8px;text-align:center}
.db-ctx{position:fixed;z-index:90;min-width:170px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .16s ease}
.db-ctx-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);text-align:left;transition:.1s;white-space:nowrap}
.db-ctx-item:hover{background:var(--surface-3);color:var(--ink)}
.db-ctx-sep{height:1px;background:var(--line);margin:4px 6px}
/* \u81EA\u52A8\u8865\u5168\u6D6E\u5C42 */
.db-ac{position:fixed;z-index:95;max-width:340px;max-height:260px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:3px 0;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .12s ease;font-size:12px}
.db-ac-item{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:5px 10px;font-size:12px;color:var(--dim);transition:.1s;white-space:nowrap;cursor:pointer;border-radius:var(--r-sm)}
.db-ac-item:hover{background:var(--surface);color:var(--ink)}
.db-ac-item.on{background:var(--surface);box-shadow:inset 2px 0 0 var(--brand);color:var(--ink)}
.db-ac-item small{font-size:10px;color:var(--dimmer);margin-left:auto;padding-left:8px}
.db-ac-badge{flex:none;font-size:9px;font-weight:700;letter-spacing:.04em;padding:1px 5px;border-radius:3px;margin-right:6px;line-height:1.4}
.db-ac-keyword .db-ac-badge{color:var(--j-key);background:rgba(121,192,255,.12)}
.db-ac-table .db-ac-badge{color:var(--j-num);background:rgba(255,171,112,.12)}
.db-ac-column .db-ac-badge{color:var(--j-str);background:rgba(165,214,164,.12)}
.db-right{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.db-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line);flex:none}
.db-toolbar-left{display:flex;align-items:center;gap:8px}
.db-toolbar-center{flex:1}
.db-toolbar-right{display:flex;align-items:center;gap:5px}
.db-schema-sel{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:var(--r-sm);background:var(--surface);font-size:11px;color:var(--dim);cursor:pointer;border:1px solid var(--line);transition:.12s}
.db-schema-sel:hover{border-color:var(--line-2);color:var(--ink)}
.db-editor{flex:none;position:relative;border-bottom:none;overflow:hidden}
/* \u884C\u53F7 + \u9AD8\u4EAE + textarea \u5BB9\u5668 */
.db-editor-inner{display:flex;min-height:100%}
.db-gutter{flex:none;width:42px;padding:8px 6px 8px 0;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--dimmer);text-align:right;user-select:none;pointer-events:none;overflow:hidden;background:transparent;white-space:pre}
.db-gutter b{color:var(--dim);font-weight:400}
.db-editor-text{flex:1;position:relative;min-width:0}
.db-overlay{position:absolute;inset:0;margin:0;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:transparent;pointer-events:none;white-space:pre;overflow:hidden;background:transparent}
.db-editor textarea{width:100%;display:block;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--ink);background:transparent;height:100%;box-sizing:border-box;white-space:pre;overflow-wrap:normal;overflow-x:auto}
.db-editor textarea::placeholder{color:var(--dimmer)}
.db-editor textarea:focus{background:rgba(255,122,89,.02)}
.db-splitter{height:3px;background:var(--line);cursor:row-resize;flex:none;transition:background .15s;position:relative}
.db-splitter:hover,.db-splitter.active{background:var(--brand)}
.db-splitter::before{content:'';position:absolute;top:-3px;bottom:-3px;left:0;right:0}
.db-result{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.db-result-bar{display:flex;align-items:center;padding:4px 10px;border-bottom:1px solid var(--line);flex:none;gap:8px}
.db-result-bar .note{flex:1;font-size:11px;color:var(--dim)}
.db-result-bar .note strong{color:var(--j-num);font-weight:600}
.db-export-btn{padding:3px 8px;border-radius:var(--r-sm);color:var(--dimmer);font-size:10px;cursor:pointer;border:1px solid var(--line);transition:.12s}
.db-export-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}
.db-sb-row{display:flex;gap:8px;padding:6px 10px}
.db-sb-row .t-in{font-size:12px;padding:6px 10px}
.db-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim);white-space:nowrap}
.db-chip .dotc{width:8px;height:8px;border-radius:50%;background:var(--ok)}
.db-prev{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--ink);max-height:42vh;overflow:auto;font-family:var(--mono);transition:border-color .2s}
.db-prev:not(:empty){border-color:var(--warn);background:rgba(210,153,34,.04)}
.db-kv{display:flex;gap:10px;align-items:center;margin-bottom:9px}
.db-kv label{width:140px;flex:none;font-size:11px;color:var(--j-key);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.db-kv label small{color:var(--dimmer)}
.db-kv .t-in{font-size:12.5px;padding:8px 11px}

/* ===== \u8FDE\u63A5\u7BA1\u7406\u5668 ===== */
.cm{display:flex;height:100%;min-height:280px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));overflow:hidden}
.cm-list{width:200px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--bg-2)}
.cm-list-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:10px 10px 6px}
.cm-list-items{flex:1;overflow:auto;padding:0 4px 4px}
.cm-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;font-size:12px}
.cm-item:hover{background:var(--surface)}
.cm-item.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}
.cm-dot{width:8px;height:8px;border-radius:50%;flex:none}
.cm-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-item-host{font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}
.cm-item-del{width:18px;height:18px;border-radius:3px;color:var(--dimmer);font-size:10px;display:none;align-items:center;justify-content:center}
.cm-item:hover .cm-item-del{display:inline-flex}
.cm-item-del:hover{background:var(--surface);color:var(--err)}
.cm-add{margin:6px;padding:6px 10px;border-radius:var(--r-sm);color:var(--dim);font-size:11px;border:1px dashed var(--line);text-align:center;transition:.12s;cursor:pointer}
.cm-add:hover{color:var(--brand);border-color:var(--brand)}
.cm-form{flex:1;padding:16px 20px;overflow:auto}
.cm-form h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:14px}
.cm-colors{display:flex;gap:6px;flex:1}
.cm-color{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:.12s}
.cm-color:hover{transform:scale(1.2)}
.cm-color.on{border-color:var(--ink);box-shadow:0 0 8px rgba(255,255,255,.2)}
.cm-remember{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dim);padding-left:114px;margin-bottom:8px}
.cm-remember input{accent-color:var(--brand);width:14px;height:14px}
.cm-sec{font-size:10.5px;color:var(--dimmer);padding-left:114px;margin-top:6px;line-height:1.5}
.cm-acts{display:flex;gap:8px;margin-top:10px;padding-left:114px}
.cm-btn-danger{color:var(--err);font-size:11px}
.cm-btn-danger:hover{text-decoration:underline}
@container (max-width:640px){ .cm{flex-direction:column} .cm-list{width:100%;max-height:150px;border-right:none;border-bottom:1px solid var(--line)} .cm-remember,.cm-acts,.cm-sec{padding-left:0} }

/* ============================================================
   AI \u52A9\u624B \u2014 \u72EC\u7ACB\u9875\u9762 + \u6D6E\u7A97 + \u914D\u7F6E\u9762\u677F
   ============================================================ */

/* ===== AI \u72EC\u7ACB\u9875\u9762 ===== */
.ai-page{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.ai-topbar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}
.ai-cfg-sel{position:relative}
.ai-cfg-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--r-sm);border:1px solid var(--line);font-size:12px;color:var(--ink);background:var(--surface);cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai-cfg-btn:hover{border-color:var(--line-2)}
.ai-cfg-menu{position:absolute;top:34px;left:0;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:90;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}
.ai-cfg-menu.open{display:block}
.ai-cfg-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--ink);transition:.12s}
.ai-cfg-item:hover{background:var(--surface-3)}
.ai-cfg-item.on{box-shadow:inset 2px 0 0 var(--brand)}
.ai-cfg-dot{width:8px;height:8px;border-radius:50%;flex:none}
.ai-ctx-toggle{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dim);cursor:pointer}
.ai-ctx-toggle input{accent-color:var(--brand);width:13px;height:13px}

.ai-main{flex:1;display:flex;min-height:0;overflow:hidden}
.ai-sidebar{width:220px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.ai-side-head{padding:10px 12px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}
.ai-side-list{flex:1;overflow-y:auto;padding:4px}
.ai-convo-item{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--dim);transition:.12s}
.ai-convo-item:hover{background:var(--surface-2);color:var(--ink)}
.ai-convo-item.on{background:var(--surface-3);color:var(--ink);box-shadow:inset 2px 0 0 var(--brand)}
.ai-convo-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai-convo-del{opacity:0;font-size:10px;color:var(--dimmer);padding:2px 4px;border-radius:3px;transition:.12s}
.ai-convo-item:hover .ai-convo-del{opacity:1}
.ai-convo-del:hover{color:var(--err)}

.ai-chat{flex:1;display:flex;flex-direction:column;min-height:0}
.ai-ctx-bar{padding:6px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
.ai-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.ai-empty{padding:40px 20px;text-align:center;color:var(--dimmer);font-size:13px;line-height:1.8}

/* Messages */
.ai-msg{padding:10px 14px;border-radius:var(--r);max-width:88%;animation:aiMsgIn .2s ease}
.ai-msg.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}
.ai-msg.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}
.ai-msg.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}
.ai-msg.error{align-self:flex-start;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:var(--err);font-size:12px}
.ai-msg-role{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--dimmer);margin-bottom:4px;text-transform:uppercase}
.ai-msg.user .ai-msg-role{color:rgba(0,0,0,.4)}
.ai-msg-body{font-size:13px;line-height:1.65;word-break:break-word}
.ai-msg-body p{margin:0 0 8px}
.ai-msg-body p:last-child{margin-bottom:0}
.ai-msg-body ul{margin:4px 0;padding-left:20px}
.ai-msg-body li{margin:2px 0}
.ai-msg-body strong{color:var(--ink)}
@keyframes aiMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* Code blocks in AI messages */
.ai-code-block{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;margin:6px 0;overflow-x:auto;font-size:12px;line-height:1.6;white-space:pre}
.ai-code-inline{background:var(--surface-3);padding:1px 5px;border-radius:3px;font-size:12px;color:var(--j-str)}

/* Input bar */
.ai-input-bar{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line);flex:none}
.ai-input{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink);resize:none;min-height:38px;max-height:120px;line-height:1.5}
.ai-input:focus{border-color:var(--brand)}
.ai-input::placeholder{color:var(--dimmer)}

/* ===== AI Config Modal ===== */
.ai-cfg-body{display:flex;gap:0;min-height:360px}
.ai-cfg-list{width:180px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column}
.ai-cfg-list-head{padding:10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}
.ai-cfg-list-items{flex:1;overflow-y:auto;padding:4px}
.ai-cfg-form{flex:1;padding:12px 16px;overflow-y:auto}

/* ===== AI \u6D6E\u7A97 ===== */
#aiFloatHost{position:fixed;z-index:110;pointer-events:none;inset:0}
.ai-fab{position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(255,122,89,.4);transition:.18s;z-index:110;pointer-events:auto;border:none}
.ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(255,122,89,.55)}

.ai-float{position:fixed;right:24px;bottom:80px;width:420px;height:520px;background:var(--surface);border:1px solid var(--line-2);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 24px 60px -16px rgba(0,0,0,.8);z-index:111;pointer-events:auto;animation:aiFloatIn .2s ease;overflow:hidden}
@keyframes aiFloatIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.ai-float-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);cursor:move;user-select:none}
.ai-float-title{font-family:var(--disp);font-weight:700;font-size:13px;color:var(--ink)}
.ai-float-cfg{font-size:11px;color:var(--dim);cursor:pointer;padding:3px 8px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.12s}
.ai-float-cfg:hover{border-color:var(--line-2);color:var(--ink)}
.ai-float-act{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);color:var(--dim);font-size:12px;cursor:pointer;transition:.12s}
.ai-float-act:hover{background:var(--surface-2);color:var(--ink)}
.ai-float-ctx{padding:5px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
.ai-float-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.ai-float-empty{padding:30px 10px;text-align:center;color:var(--dimmer);font-size:12px}
.ai-fm{padding:8px 11px;border-radius:var(--r);max-width:90%;font-size:12.5px;line-height:1.55;word-break:break-word;animation:aiMsgIn .2s ease}
.ai-fm.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}
.ai-fm.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}
.ai-fm.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}
.ai-fm.error{align-self:flex-start;color:var(--err);font-size:11px}
.ai-fm pre{margin:0;white-space:pre-wrap;font-size:11px}

.ai-float-input{display:flex;align-items:flex-end;gap:6px;padding:8px 10px;border-top:1px solid var(--line);flex:none}
.ai-float-ctx-btn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);font-size:14px;cursor:pointer;transition:.12s;flex:none;border:none}
.ai-float-ctx-btn:hover{background:var(--surface-2)}
.ai-float-text{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:7px 10px;font-size:12.5px;color:var(--ink);resize:none;min-height:32px;max-height:80px;line-height:1.4}
.ai-float-text:focus{border-color:var(--brand)}
.ai-float-text::placeholder{color:var(--dimmer)}

.ai-float-cfg-menu{position:absolute;top:38px;left:0;min-width:180px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:120;box-shadow:0 16px 40px -12px rgba(0,0,0,.7)}

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
`;var Ce=document;function je(e){Ce=e||document}var b=(e,t=Ce)=>t.querySelector(e),Y=(e,t=Ce)=>[...t.querySelectorAll(e)],U=()=>"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7),y=e=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),p=(e,t,r)=>{let o=document.createElement(e);return t&&(o.className=t),r!=null&&(o.innerHTML=r),o},Je=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"],se=e=>e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB",ue=e=>e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s",le=e=>"m-"+e,qe=null;function $(e,t){let r=b("#statusMsg");r&&(r.textContent=e,r.className="msg"+(t?" "+t:""),clearTimeout(qe),t&&(qe=setTimeout(()=>{r.className="msg",r.textContent="\u5C31\u7EEA \xB7 \u7EAF\u524D\u7AEF\u8FD0\u884C\uFF0C\u8DE8\u57DF\u8BF7\u6C42\u53D7\u6D4F\u89C8\u5668 CORS \u7B56\u7565\u9650\u5236"},4500)))}function Bt(e){let t=b("#toast");t&&(t.innerHTML=e,t.classList.add("show"),clearTimeout(t._t),t._t=setTimeout(()=>t.classList.remove("show"),1500))}async function W(e,t){try{await navigator.clipboard.writeText(e)}catch{let o=p("textarea");o.value=e,document.body.appendChild(o),o.select();try{document.execCommand("copy")}catch{}o.remove()}Bt((t||"\u5DF2\u590D\u5236")+" <b>\u2713</b>")}function be(e){let t=r=>String(r).padStart(2,"0");return e.getFullYear()+"-"+t(e.getMonth()+1)+"-"+t(e.getDate())+" "+t(e.getHours())+":"+t(e.getMinutes())+":"+t(e.getSeconds())}var Z=[];function Ee(e){let t=Z.findIndex(o=>o.id===e.id),r=Object.assign({inited:!1},e);t>=0?Z[t]=r:Z.push(r)}function Oe(){Z.length=0,he=null,Me="#/home",xe=null}var he=null,ve=!1,Me="#/home",xe=null;function _e(){return he}function Ve(e,t){ve=!!e,xe=t||null}function He(e){ve?(Me="#/"+e,Se(),xe&&xe(e)):location.hash="#/"+e}function Pt(e){return"#view"+e.charAt(0).toUpperCase()+e.slice(1)}function De(){let e=b("#navTabs");e&&(e.innerHTML="",Z.forEach(t=>{let r=p("button","nav-tab"+(t.id===he?" on":""),`<span class="tcn">${t.icon}</span>${y(t.label)}`);r.onclick=()=>He(t.id),e.appendChild(r)}))}function Ut(){let e=b("#viewHome");e.innerHTML='<div class="home"><div class="home-inner"><div class="home-hero"><div class="eyebrow">RELAY DEVKIT</div><h1>\u5F00\u53D1\u8005\u5DE5\u5177\u7BB1</h1><p>\u96F6\u4F9D\u8D56\u3001\u7EAF\u524D\u7AEF\u3001\u53EF\u79BB\u7EBF\u8FD0\u884C\u7684\u4E00\u7EC4\u63A5\u53E3\u4E0E\u6570\u636E\u5C0F\u5DE5\u5177\u3002\u6311\u4E00\u4E2A\u5F00\u59CB\uFF1A</p></div><div class="tool-grid" id="toolGrid"></div></div></div>';let t=b("#toolGrid");Z.filter(r=>r.card).forEach(r=>{let o=p("button","tool-card");o.style.setProperty("--accent",r.card.accent),o.innerHTML=`<div class="ic">${r.card.icon||r.icon}</div><div class="nm">${y(r.card.name||r.label)}</div><div class="ds">${y(r.card.desc)}</div><div class="go">\u6253\u5F00 \u2192</div>`,o.onclick=()=>He(r.id),t.appendChild(o)})}function Se(){let t=((ve?Me:location.hash).match(/^#\/(\w+)/)||[])[1]||"home";Z.some(n=>n.id===t)||(t="home"),he=t,Y("#view > .view").forEach(n=>n.classList.remove("on"));let r=b(Pt(t));r&&r.classList.add("on"),De();let o=Z.find(n=>n.id===t);t==="home"?Ut():o&&o.init&&!o.inited&&(o.init(),o.inited=!0)}function We(){ve||window.addEventListener("hashchange",Se);let e=b("#navBrand");e&&(e.onclick=()=>He("home")),De(),Se()}var de=()=>{},me=()=>{};function Ge(e){e&&e.persist&&(de=e.persist),e&&e.rerender&&(me=e.rerender)}var ge=null;function pe(){ge&&(ge.remove(),ge=null),document.removeEventListener("click",pe),document.removeEventListener("keydown",Ye)}function Ye(e){e.key==="Escape"&&pe()}function Xe(e,t){if(!t||!t.trim())return{ok:!0,value:e};let r=t.replace(/\[(\w+)\]/g,".$1").split(".").map(n=>n.trim()).filter(n=>n!==""),o=e;for(let n of r){if(o==null)return{ok:!1};if(Array.isArray(o)){let a=Number(n);if(!Number.isInteger(a)||a<0||a>=o.length)return{ok:!1};o=o[a]}else if(typeof o=="object"){if(!(n in o))return{ok:!1};o=o[n]}else return{ok:!1}}return{ok:!0,value:o}}function Ke(e){let t=[],r=new Set,o=(a,i)=>{if(r.has(a))return;r.add(a);let s="value",l;Array.isArray(i)?(s="array",l=i.length):i&&typeof i=="object"&&(s="object",l=Object.keys(i).length),t.push({path:a,kind:s,count:l})},n=(a,i,s)=>{if(!(t.length>250)){if(Array.isArray(a)){if(a.length){let l=i?i+"[0]":"[0]";o(l,a[0]),a[0]&&typeof a[0]=="object"&&s<4&&n(a[0],l,s+1)}}else if(a&&typeof a=="object")for(let l of Object.keys(a)){let c=i?i+"."+l:l;o(c,a[l]),a[l]&&typeof a[l]=="object"&&s<4&&n(a[l],c,s+1)}}};return o("",e),n(e,"",0),t}var ye=!1;function Ze(){return ye=!ye,ye}function Qe(e,t){let r;return t!==void 0?r=It(JSON.stringify(t,null,2)):e.isBinary?r=y(`[\u4E8C\u8FDB\u5236\u5185\u5BB9 \xB7 ${e.contentType} \xB7 ${se(e.size)}]`):r=y(e.text),p("pre","raw"+(ye?" wrap":""),r)}function It(e){return y(e).replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+\.?\d*(?:[eE][+\-]?\d+)?)/g,(t,r,o,n,a)=>r!=null?`<span class="${o?"tok-key":"tok-str"}">${r}</span>${o||""}`:n!=null?`<span class="tok-bool">${n}</span>`:a!=null?`<span class="tok-num">${a}</span>`:'<span class="tok-null">null</span>')}function Re(e){if(!e||!e.trim())return{ast:[],plainText:""};let t=[],r=null,o=[],n="",a=!1,i="";for(let c=0;c<e.length;c++){let g=e[c];a?g===i?a=!1:n+=g:g==='"'||g==="'"?(a=!0,i=g):g===" "?n&&(o.push(n),n=""):n+=g}n&&o.push(n);let s=/^(-?)([*\w.一-鿿-]+)(:|=|==|~|>=|>|<=|<)([\s\S]*)$/;for(let c of o){let g=c.match(s);if(!g){c.startsWith("-")&&c.length>1?t.push({type:"text",value:c.slice(1),negated:!0}):(t.push({type:"text",value:c,negated:!1}),r=r===null?c:r+" "+c);continue}let[m,u,d,h,v]=g,f=u==="-";if(h===":"&&v.startsWith("/")&&v.endsWith("/")&&v.length>1){try{let w=new RegExp(v.slice(1,-1),"i");t.push({type:"field",field:d,op:"~",regex:w,negated:f})}catch{t.push({type:"text",value:c,negated:!1})}continue}if(h==="~"){try{let w=v.startsWith("/")&&v.endsWith("/")?v.slice(1,-1):v,z=new RegExp(w,"i");t.push({type:"field",field:d,op:"~",regex:z,negated:f})}catch{t.push({type:"text",value:c,negated:!1})}continue}if(h===">"||h===">="||h==="<"||h==="<="){let w=Number(v);if(!isNaN(w)){t.push({type:"field",field:d,op:h,numValue:w,negated:f});continue}t.push({type:"text",value:c,negated:!1}),r=r===null?c:r+" "+c;continue}if(h==="="||h==="=="){if(v==="true")t.push({type:"field",field:d,op:"=",boolValue:!0,negated:f});else if(v==="false")t.push({type:"field",field:d,op:"=",boolValue:!1,negated:f});else if(v==="null")t.push({type:"field",field:d,op:"=",nullValue:!0,negated:f});else{let w=Number(v);!isNaN(w)&&String(w)===v?t.push({type:"field",field:d,op:"=",numValue:w,negated:f}):t.push({type:"field",field:d,op:"=",value:v,negated:f})}continue}if(h===":"){v.startsWith("-")&&v.length>1?t.push({type:"field",field:d,op:":",value:v.slice(1),negated:!0}):d==="*"?t.push({type:"wildcard",op:":",value:v,negated:f}):t.push({type:"field",field:d,op:":",value:v,negated:f});continue}}return t.some(c=>c.type==="field"||c.type==="wildcard")&&(r=null),{ast:t,plainText:r||null}}function Q(e,t){if(t.type==="text"){let i=String(e==null?"":typeof e=="object"?JSON.stringify(e):e).toLowerCase().includes(t.value.toLowerCase());return t.negated?!i:i}if(t.type==="wildcard"){if(e&&typeof e=="object"){let l=(Array.isArray(e),Object.values(e)).some(c=>String(c==null?"":typeof c=="object"?JSON.stringify(c):c).toLowerCase().includes(t.value.toLowerCase()));return t.negated?!l:l}let i=String(e??"").toLowerCase().includes(t.value.toLowerCase());return t.negated?!i:i}let{field:r,op:o,negated:n}=t,a=e;if(o===":"){let i=String(a==null?"":typeof a=="object"?JSON.stringify(a):a).toLowerCase().includes(t.value.toLowerCase());return n?!i:i}if(o==="="){if(t.boolValue!==void 0){let s=a===!0||a===!1?a===t.boolValue:String(a).toLowerCase()===""+t.boolValue;return n?!s:s}if(t.nullValue){let s=a===null;return n?!s:s}if(t.numValue!==void 0){let s=typeof a=="number"?a===t.numValue:Number(a)===t.numValue;return n?!s:s}let i=String(a??"")===t.value;return n?!i:i}if(o==="~")try{let i=t.regex.test(String(a??""));return n?!i:i}catch{return!1}if(o===">"||o===">="||o==="<"||o==="<="){let i=typeof a=="number"?a:Number(a);if(isNaN(i))return!1;let s;return o===">"?s=i>t.numValue:o===">="?s=i>=t.numValue:o==="<"?s=i<t.numValue:s=i<=t.numValue,n?!s:s}return!0}function qt(e,t,r){if(!t.length)return!0;for(let o of t){if(o.type==="text"||o.type==="wildcard"){if(!Q(e,o))return!1;continue}if(o.type==="field"){let n=e&&typeof e=="object"&&!Array.isArray(e)?e[o.field]:void 0;if(n===void 0){if(!Q(e,o))return!1}else if(!Q(n,o))return!1}}return!0}function Jt(e,t,r){if(!r.length)return!0;for(let o of r){if(o.type==="text"){if(we(e,t,o.value,o.negated))continue;return!1}if(o.type==="wildcard"){if(et(e,t,o.value,o.negated))continue;return!1}if(o.type==="field"){if(tt(e,t,o))continue;return!1}}return!0}function we(e,t,r,o){let n=r.toLowerCase(),a=!1;return e!=null&&String(e).toLowerCase().includes(n)&&(a=!0),a||(t&&typeof t=="object"?a=(Array.isArray(t)?t.map((s,l)=>[l,s]):Object.entries(t)).some(([s,l])=>we(s,l,r,!1)):a=String(t??"").toLowerCase().includes(n)),o?!a:a}function et(e,t,r,o){let n=r.toLowerCase(),a=!1;return t&&typeof t=="object"?a=(Array.isArray(t)?t.map((s,l)=>[l,s]):Object.entries(t)).some(([s,l])=>String(l==null?"":typeof l=="object"?JSON.stringify(l):l).toLowerCase().includes(n)?!0:l&&typeof l=="object"?et(s,l,r,!1):!1):a=String(t??"").toLowerCase().includes(n),o?!a:a}function tt(e,t,r){let{field:o,op:n,negated:a}=r;return e!=null&&String(e).toLowerCase()===o.toLowerCase()&&Q(t,r)?!0:t&&typeof t=="object"?(Array.isArray(t)?t.map((s,l)=>[l,s]):Object.entries(t)).some(([s,l])=>tt(s,l,r)):!1}function rt(e){let t=[];for(let r of e)(r.type==="text"||r.type==="wildcard"||r.type==="field"&&r.op===":"||r.type==="field"&&r.op==="="&&r.value)&&t.push(r.value);return t}function ce(e,t){if(!t.length)return y(e);let r=y(e),o=r.toLowerCase(),n=[...t].sort((s,l)=>l.length-s.length),a=[];for(let s of n){let l=s.toLowerCase(),c=0;for(;;){let g=o.indexOf(l,c);if(g<0)break;a.push({s:g,e:g+l.length}),c=g+l.length}}if(!a.length)return r;a.sort((s,l)=>s.s-l.s);let i=[a[0]];for(let s=1;s<a.length;s++){let l=i[i.length-1];a[s].s<=l.e?l.e=Math.max(l.e,a[s].e):i.push(a[s])}for(let s=i.length-1;s>=0;s--){let{s:l,e:c}=i[s];r=r.slice(0,l)+'<span class="hl">'+r.slice(l,c)+"</span>"+r.slice(c)}return r}function _t(e,t,r,o){let n=new Set(Object.keys(t||{})),a=e.filter(d=>!n.has(d)).length,i=!!r,s=p("div","col-picker"+(i?"":" collapsed")),l=()=>i?"\u25BE":"\u25B8",c=p("button","col-toggle");c.type="button",c.textContent=`\u5217 \xB7 ${a}/${e.length} ${l()}`,c.onclick=()=>{let d=!s.classList.contains("collapsed");s.classList.toggle("collapsed",d),c.textContent=`\u5217 \xB7 ${a}/${e.length} ${d?"\u25B8":"\u25BE"}`,o._saveOpen&&o._saveOpen(!d)},s.appendChild(c);let g=p("div","col-body"),m=p("button","col-q","\u5168\u9009");m.type="button";let u=p("button","col-q","\u5168\u4E0D\u9009");return u.type="button",m.onclick=()=>o({}),u.onclick=()=>{let d={};e.forEach(h=>d[h]=!0),o(d)},g.append(m,u),e.forEach(d=>{let h=!n.has(d),v=p("button","col-chip"+(h?" on":""));v.type="button",v.textContent=d,v.draggable=!0,v.onclick=()=>{let f={...t||{}};f[d]?delete f[d]:f[d]=!0,o(f)},v.addEventListener("dragstart",f=>{f.dataTransfer.setData("text/plain",d),f.dataTransfer.effectAllowed="move",v.classList.add("dragging")}),v.addEventListener("dragend",()=>v.classList.remove("dragging")),v.addEventListener("dragover",f=>{f.preventDefault(),f.dataTransfer.dropEffect="move",v.classList.add("drag-over")}),v.addEventListener("dragleave",()=>v.classList.remove("drag-over")),v.addEventListener("drop",f=>{f.preventDefault(),v.classList.remove("drag-over");let w=f.dataTransfer.getData("text/plain");if(!w||w===d)return;let z=[...e];z.splice(z.indexOf(w),1),z.splice(z.indexOf(d),0,w),o({...t||{}},z)}),g.appendChild(v)}),s.appendChild(g),s}function nt(e,t){let r=p("div","jtree");if(e===void 0)return r.innerHTML='<span class="dimnote">\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u65E0\u6CD5\u4EE5\u5BF9\u8C61\u6811\u5C55\u793A\u3002\u8BF7\u5207\u5230\u300C\u539F\u59CB\u300D\u3002</span>',r;let o=(t.respFilter||"").trim(),{ast:n,plainText:a}=Re(o),i=a!==null?a.toLowerCase():o?o.toLowerCase():"",s=rt(n),l={q:i,ast:n,hlTerms:s,pretty:t.prettyCells!==!1,openAll:t.treeOpen||"auto"},c=at(null,e,0,l);return c?r.appendChild(c):r.innerHTML='<div class="dimnote">\u65E0\u5339\u914D\u300C'+y(i)+"\u300D\u7684\u5B57\u6BB5\u3002</div>",r}function ot(e,t,r){return!r||e!=null&&String(e).toLowerCase().includes(r)?!0:t&&typeof t=="object"?(Array.isArray(t)?t.map((n,a)=>[a,n]):Object.entries(t)).some(([n,a])=>ot(n,a,r)):String(t).toLowerCase().includes(r)}function fe(e,t){if(e=y(e),!t)return e;let r=e.toLowerCase().indexOf(t);return r<0?e:e.slice(0,r)+'<span class="hl">'+e.slice(r,r+t.length)+"</span>"+e.slice(r+t.length)}function Vt(e,t,r,o,n){if(e===null)return'<span class="jt-null">null</span>';let a=typeof e;if(o&&a==="string"&&it(e))return`<img class="cell-img" src="${y(e)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('\u{1F5BC}'))"><span class="cell-imn">${y(lt(e))}</span>`;if(o){let i=st(r,e);if(i)return`<span class="cell-ts">\u{1F553} ${y(be(i.date))}</span> <span class="jt-prev">(${y(dt(e))})</span>`}return a==="string"?`<span class="jt-str">"${n&&n.length?ce(e,n):fe(e,t)}"</span>`:a==="number"?`<span class="jt-num">${n&&n.length?ce(String(e),n):fe(String(e),t)}</span>`:a==="boolean"?`<span class="jt-bool">${e}</span>`:y(String(e))}function at(e,t,r,o){let n=o.q,a=o.ast;if(a&&a.length){if(!Jt(e,t,a))return null}else if(n&&!ot(e,t,n))return null;let i=p("div","jt-node"),s=t&&typeof t=="object",l=o.hlTerms,c=e!=null?`<span class="jt-key">${l&&l.length?ce(String(e),l):fe(String(e),n)}</span><span class="jt-colon">: </span>`:"";if(!s){let j=p("div","jt-row");return j.innerHTML=c+Vt(t,n,e,o.pretty,l)+'<span class="jt-act"><b data-act="copy">copy</b></span>',j.querySelector("[data-act=copy]").onclick=()=>W(typeof t=="string"?t:JSON.stringify(t),"\u5DF2\u590D\u5236"),i.appendChild(j),i}let g=Array.isArray(t),m=g?t.map((j,T)=>[T,j]):Object.entries(t),u=o.openAll==="all"?!0:o.openAll==="none"?!1:n?!0:r<1,d=g?`[\u2026] ${m.length} \u9879`:`{\u2026} ${m.length} \u952E`,h=p("div","jt-row expandable");h.innerHTML=`<span class="jt-tog">${u?"\u25BE":"\u25B8"}</span>${c}<span class="jt-prev">${g?"[":"{"}</span><span class="jt-prev" data-prev>${u?"":" "+d+" "}</span><span class="jt-act"><b data-act="copy">copy</b></span>`;let v=p("div","jt-children"+(u?"":" hide"));m.forEach(([j,T])=>{let L=at(j,T,r+1,o);L&&v.appendChild(L)});let f=p("div","jt-row");f.innerHTML=`<span class="jt-prev" style="padding-left:0">${g?"]":"}"}</span>`,v.appendChild(f);let w=h.querySelector(".jt-tog"),z=h.querySelector("[data-prev]");return h.addEventListener("click",j=>{if(j.target.dataset.act)return;let T=v.classList.toggle("hide");w.textContent=T?"\u25B8":"\u25BE",z.textContent=T?" "+d+" ":""}),h.querySelector("[data-act=copy]").onclick=j=>{j.stopPropagation(),W(JSON.stringify(t,null,2),"\u8282\u70B9\u5DF2\u590D\u5236")},i.append(h,v),i}var Dt=/^(?:https?:)?\/\/[^\s'"]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#][^\s'"]*)?$/i;function it(e){return typeof e!="string"?!1:(e=e.trim(),/^data:image\//i.test(e)||Dt.test(e))}function Fe(e){return e==null?!1:/(_at\b|\bat$|date|time|timestamp|\bts\b|created|updated|modified|expire|publish|issued|deleted|lastseen|lastlogin|epoch)/i.test(String(e))}function st(e,t){if(typeof t=="string"){let r=t.trim();if(/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(r)){let o=new Date(r);if(!isNaN(+o))return{date:o}}if(Fe(e)&&/^\d{10}$|^\d{13}$/.test(r)){let o=Number(r),n=new Date(r.length===13?o:o*1e3);if(!isNaN(+n))return{date:n}}return null}if(typeof t=="number"&&Fe(e)&&isFinite(t)){if(t>=1e12&&t<4e12)return{date:new Date(t)};if(t>=1e9&&t<4e9)return{date:new Date(t*1e3)}}return null}function lt(e){if(/^data:/i.test(e))return"\u5185\u5D4C\u56FE\u7247";try{let t=new URL(e,location.href);return decodeURIComponent(t.pathname.split("/").pop()||e).slice(0,42)}catch{return String(e).split(/[?#]/)[0].split("/").pop().slice(0,42)}}function dt(e){return e===null?"null":e===void 0?"":typeof e=="object"?JSON.stringify(e):String(e)}function Wt(e,t,r,o,n){let a=dt(e);if(e===null)return{html:'<span class="cell-null">null</span>',full:a};if(e===void 0)return{html:'<span class="cell-null">\u2014</span>',full:""};if(typeof e=="object"){let s=JSON.stringify(e);return{html:`<span class="cobj">${y(s)}</span>`,full:s}}if(o&&typeof e=="string"&&it(e))return{html:`<img class="cell-img" src="${y(e)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="cell-imn">${y(lt(e))}</span>`,full:e};if(o){let s=st(r,e);if(s)return{html:`<span class="cell-ts">\u{1F553} ${y(be(s.date))}</span>`,full:a+"  \xB7  "+be(s.date)}}let i=n&&n.length?ce(String(e),n):fe(String(e),t);return typeof e=="number"?{html:`<span class="cell-num">${i}</span>`,full:a}:typeof e=="boolean"?{html:`<span class="cell-bool">${e}</span>`,full:a}:{html:`<span class="cell-str">${i}</span>`,full:a}}function Ft(e){let t=[];if(Array.isArray(e))return t.push({label:"\u6839\u6570\u7EC4",path:"",data:e,count:e.length}),t;if(e&&typeof e=="object"){let r=(o,n,a)=>{for(let[i,s]of Object.entries(o)){let l=n?n+"."+i:i;Array.isArray(s)?t.push({label:l,path:l,data:s,count:s.length}):s&&typeof s=="object"&&a<1&&r(s,l,a+1)}};r(e,"",0),t.push({label:"\u5BF9\u8C61\u672C\u8EAB(\u952E\u503C)",path:"__self",data:e,count:Object.keys(e).length})}return t}function Gt(e,t){return t?Object.values(e).some(r=>String(typeof r=="object"?JSON.stringify(r):r).toLowerCase().includes(t)):!0}function Yt(e,t,r){return!t.length&&!r?!0:t.length?qt(e,t):Gt(e,r)}function pt(e,t){let r=p("div","tbl-host"),o=Ft(e),n=o.find(T=>T.path===t.tableSel)||o[0];if(o.length>1){let T=p("div","tbl-cands");T.appendChild(p("span","lab","\u8868\u683C")),o.forEach(L=>{let E=p("button","tcand"+(L===n?" on":""),`${y(L.label)} <em>${L.count}</em>`);E.onclick=()=>{t.tableSel=L.path,de(),(t.rerender||me)()},T.appendChild(E)}),r.appendChild(T)}if(!n)return r.appendChild(p("div","prev-none","\u65E0\u53EF\u8868\u683C\u5316\u7684\u6570\u636E\u3002")),r;let a=(t.respFilter||"").trim(),{ast:i,plainText:s}=Re(a),l=s!==null?s.toLowerCase():a.toLowerCase(),c=rt(i),g=t.prettyCells!==!1,m=n.path||"__root",u=p("div","tbl-wrap"),d=n.data,h=p("table","dt"),v=p("thead"),f=p("tbody"),w=(T,L)=>{let E=Wt(T,l,L,g,c);return`<td data-full="${y(E.full)}">${E.html}</td>`},z=t.sort&&t.sort[m]||null,j="";if(Array.isArray(d)&&n.path!=="__self")if(d.length&&d.every(L=>L&&typeof L=="object"&&!Array.isArray(L))){let L=[];d.forEach(M=>Object.keys(M).forEach(R=>{L.includes(R)||L.push(R)}));let E=t.colOrder&&t.colOrder[m]||[];if(E.length){let M=E.filter(A=>L.includes(A)),R=L.filter(A=>!E.includes(A));L=M.concat(R)}let H=t.hiddenCols&&t.hiddenCols[m]||{},O=L.filter(M=>!H[M]);if(L.length>=4){let M=!!(t._pickerOpen&&t._pickerOpen[m]),R=(A,I)=>{t.hiddenCols||(t.hiddenCols={}),t.hiddenCols[m]=A,I&&(t.colOrder||(t.colOrder={}),t.colOrder[m]=I),de(),(t.rerender||me)()};R._saveOpen=A=>{t._pickerOpen||(t._pickerOpen={}),t._pickerOpen[m]=A},r.appendChild(_t(L,H,M,R))}let P=[];d.forEach((M,R)=>{Yt(M,i,l)&&P.push({o:M,i:R})});let C=P;if(z&&z.col){let{col:M,dir:R}=z;C=[...P].sort((A,I)=>{let J=A.o[M],K=I.o[M];if(J==null&&K==null)return 0;if(J==null)return 1;if(K==null)return-1;if(typeof J=="number"&&typeof K=="number")return R==="asc"?J-K:K-J;let _=String(J).localeCompare(String(K));return R==="asc"?_:-_})}v.innerHTML='<tr><th class="idx">#</th>'+O.map(M=>{let R="",A="";return z&&z.col===M&&(R=z.dir==="asc"?" sort-asc":" sort-desc",A=z.dir==="asc"?" \u25B2":" \u25BC"),`<th class="sortable${R}" data-col="${y(M)}">${y(M)}${A}</th>`}).join("")+"</tr>",v.addEventListener("click",M=>{let R=M.target.closest("th[data-col]");if(!R)return;let A=R.dataset.col;t.sort||(t.sort={});let I=t.sort[m],J="asc";I&&I.col===A&&(J=I.dir==="asc"?"desc":I.dir==="desc"?null:"asc"),J?t.sort[m]={col:A,dir:J}:delete t.sort[m],de(),(t.rerender||me)()}),C.forEach(({o:M,i:R})=>{let A=p("tr");A.innerHTML=`<td class="idx">${R}</td>`+O.map(I=>w(M[I],I)).join(""),f.appendChild(A)});let X=O.length;j=`\u6570\u7EC4 \xB7 ${C.length}/${d.length} \u884C \xD7 ${X} \u5217`,(l||a)&&(j+=` \xB7 \u8FC7\u6EE4\u300C${y(a)}\u300D`),z&&z.col&&(j+=` \xB7 \u6309 ${z.col} ${z.dir==="asc"?"\u5347\u5E8F":"\u964D\u5E8F"}`),O.length<L.length&&(j+=` \xB7 \u9690\u85CF ${L.length-O.length} \u5217`)}else{v.innerHTML='<tr><th class="idx">#</th><th>value</th></tr>';let L=0;d.forEach((E,H)=>{let O=String(typeof E=="object"?JSON.stringify(E):E).toLowerCase(),P=!0;if(i.length?P=Q(E,i[0])&&i.slice(1).every(X=>Q(E,X)):l&&!O.includes(l)&&(P=!1),!P)return;L++;let C=p("tr");C.innerHTML=`<td class="idx">${H}</td>`+w(E,null),f.appendChild(C)}),j=`\u6570\u7EC4 \xB7 ${L}/${d.length} \u9879\uFF08\u57FA\u7840/\u6DF7\u5408\u7C7B\u578B\uFF09`}else{v.innerHTML="<tr><th>key</th><th>value</th></tr>";let T=0,L=0;Object.entries(d).forEach(([E,H])=>{L++;let O=!0;if(i.length){for(let C of i)if(C.type==="field"){if(String(E).toLowerCase()===(C.field||"").toLowerCase()){if(!Q(H,C)){O=!1;break}}else if(!Q(H,C)&&!we(E,H,C.type==="text"?C.value:C.value||"",C.negated)){O=!1;break}}else if(!we(E,H,C.type==="text"?C.value:C.value||"",C.negated)){O=!1;break}}else l&&!(E.toLowerCase().includes(l)||String(typeof H=="object"?JSON.stringify(H):H).toLowerCase().includes(l))&&(O=!1);if(!O)return;T++;let P=p("tr");P.innerHTML=`<td style="color:var(--j-key)">${c&&c.length?ce(E,c):fe(E,l)}</td>`+w(H,E),f.appendChild(P)}),j=`\u5BF9\u8C61 \xB7 ${T}/${L} \u4E2A\u5B57\u6BB5`}return h.append(v,f),Xt(h,t,m),h.addEventListener("contextmenu",T=>{let L=T.target.closest("td");if(!L||L.classList.contains("idx"))return;T.preventDefault(),pe();let E=b("#cellTip");E&&E.classList.remove("show");let H=p("div","db-ctx");ge=H;function O(Rt,$t){let Ue=p("button","db-ctx-item",Rt);Ue.onclick=At=>{At.stopPropagation(),pe(),$t()},H.appendChild(Ue)}function P(){H.appendChild(p("div","db-ctx-sep"))}let C=L.dataset.full!=null?L.dataset.full:L.textContent;O("\u590D\u5236\u503C",()=>W(C,"\u5DF2\u590D\u5236"));let X=L.cellIndex,M=v.rows[0],R=M&&M.cells[X];R&&R.dataset.col&&(P(),O("\u590D\u5236\u5217\u540D",()=>W(R.dataset.col,"\u5DF2\u590D\u5236\u5217\u540D"))),document.body.appendChild(H),requestAnimationFrame(()=>{document.addEventListener("click",pe),document.addEventListener("keydown",Ye)});let A=H.offsetWidth,I=H.offsetHeight,J=innerWidth,K=innerHeight,_=6;H.style.left=(T.clientX+A+_>J?Math.max(_,T.clientX-A-_):T.clientX+_)+"px",H.style.top=(T.clientY+I+_>K?Math.max(_,T.clientY-I-_):T.clientY+_)+"px"}),j&&r.appendChild(p("div","tbl-note",j)),u.appendChild(h),r.appendChild(u),r}function Xt(e,t,r){t.colW||(t.colW={});let o=e.tHead;if(!o||!o.rows.length)return;let n=[...o.rows[0].cells],a=p("colgroup");n.forEach(()=>a.appendChild(p("col"))),e.insertBefore(a,o);let i=[...a.children],s=t.colW[r];s&&(e.style.tableLayout="fixed",n.forEach((l,c)=>{s[c]!=null&&(i[c].style.width=s[c]+"px")})),n.forEach((l,c)=>{let g=p("span","col-grip");g.title="\u62D6\u52A8\u8C03\u6574\u5217\u5BBD",l.appendChild(g),g.addEventListener("mousedown",m=>{m.preventDefault(),m.stopPropagation(),e.style.tableLayout!=="fixed"&&(n.forEach((f,w)=>i[w].style.width=f.getBoundingClientRect().width+"px"),e.style.tableLayout="fixed");let u=m.clientX,d=l.getBoundingClientRect().width,h=f=>{i[c].style.width=Math.max(46,Math.min(1600,d+(f.clientX-u)))+"px"},v=()=>{document.removeEventListener("mousemove",h),document.removeEventListener("mouseup",v),document.body.style.cursor="",document.body.style.userSelect="";let f=t.colW[r]||(t.colW[r]={});n.forEach((w,z)=>f[z]=Math.round(w.getBoundingClientRect().width)),de()};document.body.style.cursor="col-resize",document.body.style.userSelect="none",document.addEventListener("mousemove",h),document.addEventListener("mouseup",v)})})}function ct(e,t,r){let o=p("div","ti filter");o.innerHTML='<span class="lbl">\u8FC7\u6EE4</span>';let n=p("div","fb-bar"),a=p("input","fb-edit");a.type="text",a.placeholder="\u7B5B\u9009\u884C/\u5B57\u6BB5\u2026 \u652F\u6301 name:\u503C id>1 role:true",a.value=e.respFilter||"",a.spellcheck=!1;let i=p("div","fb-tokens"),s=p("div","fb-ac"),l=!1;function c(){l=!1,s.classList.remove("open"),s.innerHTML=""}function g(u){if(!u.length){c();return}s.innerHTML="",u.slice(0,12).forEach(d=>{let h=p("button","fb-ac-item");h.type="button",h.textContent=d,h.onclick=()=>{a.value+=d,a.focus(),c(),t()},s.appendChild(h)}),s.classList.add("open"),l=!0}function m(){i.innerHTML="";let u=(a.value||"").trim();if(!u){i.style.display="none";return}i.style.display="flex";let{ast:d}=Re(u);for(let h of d){let v=p("span","ftk");if(h.type==="text")h.negated?v.innerHTML='<span class="ftk-neg">-</span><span class="ftk-val">'+y(h.value)+"</span>":v.innerHTML='<span class="ftk-val">'+y(h.value)+"</span>";else if(h.type==="wildcard")v.innerHTML='<span class="ftk-field">*</span><span class="ftk-op">:</span><span class="ftk-val">'+y(h.value)+"</span>";else if(h.type==="field"){let f="ftk-val",w=y(h.value||"");h.numValue!==void 0?(f="ftk-num",w=y(String(h.numValue))):h.boolValue!==void 0?(f="ftk-bool",w=y(String(h.boolValue))):h.nullValue?(f="ftk-null",w="null"):h.regex&&(f="ftk-val",w="/"+y(h.regex.source)+"/");let z=h.negated?'<span class="ftk-neg">-</span>':"";v.innerHTML=z+'<span class="ftk-field">'+y(h.field)+'</span><span class="ftk-op">'+y(h.op)+'</span><span class="'+f+'">'+w+"</span>"}i.appendChild(v)}}return a.addEventListener("input",()=>{e.respFilter=a.value,m();let u=a.value,d=a.selectionStart;if(r&&r.length){let h=u.slice(0,d),v=h.lastIndexOf(" "),w=h.slice(v+1).match(/^(-?)([\w.一-鿿-]*)$/);if(w&&w[2].length>0){let z=w[2].toLowerCase(),j=r.filter(T=>T.toLowerCase().startsWith(z)&&T.toLowerCase()!==z);j.length?g(j):c()}else c()}t()}),a.addEventListener("keydown",u=>{u.key==="Escape"&&c(),u.key==="Enter"&&(u.preventDefault(),c(),t())}),n.addEventListener("click",u=>{(u.target===n||u.target===i)&&a.focus()}),document.addEventListener("click",u=>{n.contains(u.target)||c()}),m(),n.append(i,a,s),o.appendChild(n),o}var ft=/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;function ut(e){try{return{ok:!0,value:JSON.parse(e)}}catch{return{ok:!1}}}async function Kt(e,t){let r=(window.__TAURI_INTERNALS__||{}).invoke;if(!r)throw new Error("Tauri invoke \u4E0D\u53EF\u7528\uFF08\u975E Polaris \u5BBF\u4E3B\u73AF\u5883\uFF09");return r(e,t)}async function bt({method:e,url:t,headers:r,body:o,bodyType:n,timeoutMs:a}){let i=await Kt("router_dispatch",{req:{target:"cap.http",payload:{action:"request",method:e,url:t,headers:r||{},body:o||"",bodyType:n||"text",timeoutMs:a||15e3}}});if(!i||!i.ok)throw new Error(i&&i.error||"cap.http \u8BF7\u6C42\u5931\u8D25");return i.result||{}}function xt(){return!!(window.__TAURI_INTERNALS__&&window.__TAURI_INTERNALS__.invoke)}async function Zt(e,t){let r=atob(e),o=new Uint8Array(r.length);for(let a=0;a<r.length;a++)o[a]=r.charCodeAt(a);let n=new Blob([o],{type:t||"application/octet-stream"});return URL.createObjectURL(n)}async function ht(e,t){let r=e.contentType||"",o=e.isBase64||!1,n=e.body||"",a=o||/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i.test(r);return{status:e.status,statusText:e.statusText||"",ok:!!e.ok,timeMs:e.timeMs||0,size:a?n.length:new Blob([n]).size,contentType:r,headers:e.headers||{},text:a?"":n,isBinary:a,blobUrl:a?await Zt(n,r):null,url:e.url||t,parsed:(()=>{if(!a)try{return JSON.parse(n)}catch{return}})()}}var gt="relay.tabs.v2",yt="relay.collections.v2",wt="relay.envs.v2",Be="relay.ui.v2",x={tabs:[],activeTab:null,collections:[],envs:[],activeEnv:null},S={sideCollapsed:!1,layout:"v",reqH:240,reqW:520,proxyOn:!1},D=!1;function kt(e){D=!!e,e&&(S.proxyOn=!0)}var B=()=>({id:U(),on:!0,k:"",v:""}),Ae=/^(cookie|cookie2|user-agent|referer|origin|host|date|dnt|set-cookie|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*|accept-encoding|content-length)$/i;function ne(e){return Object.assign({id:U(),name:"\u672A\u547D\u540D\u8BF7\u6C42",savedId:null,dirty:!1,method:"GET",url:"",params:[B()],headers:[B()],bodyType:"none",body:"",formBody:[B()],reqTab:"params",respView:"object",respPath:"",respFilter:"",tableSel:null,prettyCells:!0,colW:{},treeOpen:"auto",hiddenCols:{},sort:{},colOrder:{},response:null},e||{})}var N=()=>x.tabs.find(e=>e.id===x.activeTab);function k(){let e=x.tabs.map(t=>{let r={...t};return delete r.response,r});try{localStorage.setItem(gt,JSON.stringify({tabs:e,activeTab:x.activeTab})),localStorage.setItem(yt,JSON.stringify(x.collections)),localStorage.setItem(wt,JSON.stringify({envs:x.envs,activeEnv:x.activeEnv})),localStorage.setItem(Be,JSON.stringify(S))}catch(t){$("\u672C\u5730\u4FDD\u5B58\u5931\u8D25\uFF1A"+t.message,"err")}}function Qt(){try{let e=JSON.parse(localStorage.getItem(gt)||"null");e&&e.tabs&&e.tabs.length&&(x.tabs=e.tabs.map(t=>ne(t)),x.activeTab=e.activeTab)}catch{}try{let e=JSON.parse(localStorage.getItem(yt)||"null");Array.isArray(e)&&(x.collections=e)}catch{}try{let e=JSON.parse(localStorage.getItem(wt)||"null");e&&(x.envs=e.envs||[],x.activeEnv=e.activeEnv||null)}catch{}try{let e=JSON.parse(localStorage.getItem(Be)||"null");e&&(S=Object.assign(S,e))}catch{}if((!x.collections.length||!x.envs.length)&&er(),!x.tabs.length){let e=ne();x.tabs=[e],x.activeTab=e.id}N()||(x.activeTab=x.tabs[0].id)}function re(e,t,r,o){return Object.assign({id:U(),name:e,method:t,url:r,params:[B()],headers:[B()],bodyType:"none",body:"",formBody:[B()]},o||{})}function er(){if(!x.envs.length){let e={id:U(),name:"Demo \xB7 jsonplaceholder",baseUrl:"https://jsonplaceholder.typicode.com",vars:[{id:U(),on:!0,k:"token",v:"demo-token-123"}]},t={id:U(),name:"Demo \xB7 httpbin",baseUrl:"https://httpbin.org",vars:[B()]};x.envs=[e,t],x.activeEnv=e.id}if(!x.collections.length){let e={id:U(),name:"\u793A\u4F8B \xB7 DEMO",collapsed:!1,requests:[re("\u7528\u6237\u5217\u8868(\u6570\u7EC4\u2192\u8868\u683C)","GET","https://jsonplaceholder.typicode.com/users"),re("\u7528\u6237\u5217\u8868 {{baseUrl}}","GET","{{baseUrl}}/users"),re("\u5355\u4E2A Todo(\u5BF9\u8C61)","GET","{{baseUrl}}/todos/1"),re("\u5D4C\u5957/\u65F6\u95F4(\u5BF9\u8C61\u6811\u6F14\u793A)","GET","https://httpbin.org/json"),re("\u5A92\u4F53/\u56FE\u7247(\u4E8C\u8FDB\u5236\u6F14\u793A)","GET","https://picsum.photos/300/200"),re("\u65B0\u5EFA Post","POST","{{baseUrl}}/posts",{bodyType:"json",body:JSON.stringify({title:"relay",body:"hello",userId:1},null,2),headers:[{id:U(),on:!0,k:"Authorization",v:"Bearer {{token}}"},B()]})]};x.collections=[e]}}function Lt(){return x.envs.find(e=>e.id===x.activeEnv)}function q(e){if(e==null||String(e).indexOf("{{")<0)return e;let t=Lt();return String(e).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g,(r,o)=>{if(!t)return r;if(o==="baseUrl")return t.baseUrl||"";let n=(t.vars||[]).find(a=>a.on&&a.k===o);return n?n.v:r})}function tr(){let e=b("#methodMenu");e&&Je.forEach(t=>{let r=p("button",le(t),t);r.onclick=()=>{let o=N();o.method=t,te(o),b("#methodMenu").classList.remove("open"),ae(),ie(),k()},e.appendChild(r)})}function rr(){let e=b("#methodSel");e&&(e.onclick=r=>{r.stopPropagation(),b("#methodMenu").classList.toggle("open")});let t=b("#envSel");t&&(t.onclick=r=>{r.stopPropagation(),b("#envMenu").classList.toggle("open")}),document.addEventListener("click",()=>{let r=b("#methodMenu");r&&r.classList.remove("open");let o=b("#envMenu");o&&o.classList.remove("open"),Y(".path-menu").forEach(n=>n.classList.remove("open"))})}function F(){let e=b("#tree");e.innerHTML="";let t=(b("#search").value||"").toLowerCase().trim(),r=0,o=0;x.collections.length||e.appendChild(p("div","tree-empty","\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5206\u7EC4\u3002<br>\u70B9\u51FB\u53F3\u4E0A\u89D2 \uFF0B \u65B0\u5EFA\u4E00\u4E2A\u3002")),x.collections.forEach(n=>{let a=n.requests.filter(d=>!t||d.name.toLowerCase().includes(t)||d.url.toLowerCase().includes(t));if(r+=n.requests.length,t&&!a.length&&!n.name.toLowerCase().includes(t))return;let i=t?a:n.requests;o+=i.length;let s=p("div","group"+(n.collapsed&&!t?" collapsed":"")),l=p("div","group-head");l.innerHTML=`<span class="caret">\u25BC</span><span class="gname">${y(n.name)}</span><span class="gcount">${n.requests.length}</span>`;let c=p("span","gact"),g=p("button","x","\u270E");g.title="\u91CD\u547D\u540D",g.onclick=d=>{d.stopPropagation(),xr(n)};let m=p("button","x","\u{1F5D1}");m.title="\u5220\u9664\u5206\u7EC4",m.onclick=d=>{d.stopPropagation(),hr(n)},c.append(g,m),l.appendChild(c),l.onclick=()=>{n.collapsed=!n.collapsed,k(),F()},s.appendChild(l);let u=p("div","reqs");i.forEach(d=>{let h=p("div","req-item"+(N()&&N().savedId===d.id?" active":""));h.innerHTML=`<span class="mb ${le(d.method)}">${d.method}</span><span class="rn">${y(d.name)}</span>`;let v=p("button","rx","\u2715");v.title="\u5220\u9664",v.onclick=f=>{f.stopPropagation(),br(n,d)},h.appendChild(v),h.onclick=()=>ur(d),u.appendChild(h)}),s.appendChild(u),e.appendChild(s)}),t&&o===0&&e.appendChild(p("div","tree-empty","\u6CA1\u6709\u5339\u914D\u300C"+y(t)+"\u300D\u7684\u8BF7\u6C42\u3002")),b("#stSaved").textContent=r}function oe(){let e=Lt();b("#envName").textContent=e?e.name:"\u65E0\u73AF\u5883",b("#envSel").title=e&&e.baseUrl?"baseUrl: "+e.baseUrl:"\u672A\u9009\u62E9\u73AF\u5883";let t=b("#envMenu");t.innerHTML="",x.envs.forEach(n=>{let a=p("button","env-item"+(n.id===x.activeEnv?" on":""),`<span>${y(n.name)}</span><small>${y(n.baseUrl||"(\u65E0 baseUrl)")}</small>`);a.onclick=()=>{x.activeEnv=n.id,k(),oe(),ae(),b("#envMenu").classList.remove("open"),$("\u5DF2\u5207\u6362\u73AF\u5883\uFF1A"+n.name,"ok")},t.appendChild(a)});let r=p("button","env-item"+(x.activeEnv?"":" on"),"<span>\u65E0\u73AF\u5883</span><small>\u4E0D\u89E3\u6790\u53D8\u91CF</small>");r.onclick=()=>{x.activeEnv=null,k(),oe(),ae(),b("#envMenu").classList.remove("open")},t.appendChild(r);let o=p("button","env-item manage","<span>\u2699 \u7BA1\u7406\u73AF\u5883\u4E0E\u53D8\u91CF\u2026</span>");o.onclick=()=>{b("#envMenu").classList.remove("open"),nr()},t.appendChild(o)}function nr(){let e=b("#modalBg"),t=p("div","modal wide"),r=x.activeEnv||x.envs[0]&&x.envs[0].id;function o(){let a=x.envs.find(m=>m.id===r);t.innerHTML='<h3>\u73AF\u5883\u4E0E\u53D8\u91CF</h3><div class="sub">\u6BCF\u4E2A\u73AF\u5883\u542B\u4E00\u4E2A\u8BF7\u6C42\u670D\u52A1 <b>baseUrl</b>(ip+\u7AEF\u53E3) \u4E0E\u4E00\u7EC4\u53D8\u91CF\uFF1B\u5728 URL / Header / Body \u4E2D\u7528 <b>{{baseUrl}}</b>\u3001<b>{{\u53D8\u91CF\u540D}}</b> \u5F15\u7528\uFF0C\u53D1\u9001\u65F6\u89E3\u6790\u3002</div>';let i=p("div","env-tabs");x.envs.forEach(m=>{let u=p("button","env-tab"+(m.id===r?" on":""),y(m.name)+(m.id===x.activeEnv?" \u25CF":""));u.onclick=()=>{r=m.id,o()},i.appendChild(u)});let s=p("button","env-tab add","\uFF0B \u65B0\u5EFA\u73AF\u5883");if(s.onclick=()=>{let m={id:U(),name:"\u73AF\u5883 "+(x.envs.length+1),baseUrl:"",vars:[B()]};x.envs.push(m),r=m.id,o()},i.appendChild(s),t.appendChild(i),a){let m=p("div","field");m.innerHTML="<label>\u73AF\u5883\u540D\u79F0</label>";let u=p("input");u.value=a.name,u.oninput=()=>a.name=u.value,m.appendChild(u),t.appendChild(m);let d=p("div","field");d.innerHTML="<label>\u8BF7\u6C42\u670D\u52A1 baseUrl\uFF08ip + \u7AEF\u53E3\uFF09</label>";let h=p("input");h.placeholder="http://127.0.0.1:8080",h.value=a.baseUrl||"",h.oninput=()=>a.baseUrl=h.value,d.appendChild(h),t.appendChild(d);let v=p("div","field");v.innerHTML="<label>\u53D8\u91CF</label>";let f=p("div","env-vars");a.vars||(a.vars=[B()]),f.appendChild(ze(a.vars,{kPlace:"\u53D8\u91CF\u540D",vPlace:"\u503C",onChange:()=>{}})),v.appendChild(f),t.appendChild(v)}else t.appendChild(p("div","field","\u8FD8\u6CA1\u6709\u73AF\u5883\uFF0C\u70B9\u300C\uFF0B \u65B0\u5EFA\u73AF\u5883\u300D\u3002"));let l=p("div","acts");if(a){let m=p("button","btn ghost danger","\u5220\u9664");m.onclick=()=>{confirm("\u5220\u9664\u73AF\u5883\u300C"+a.name+"\u300D\uFF1F")&&(x.envs=x.envs.filter(u=>u.id!==a.id),x.activeEnv===a.id&&(x.activeEnv=x.envs[0]?x.envs[0].id:null),r=x.envs[0]&&x.envs[0].id,o())},l.appendChild(m)}let c=p("div");if(c.style.flex="1",l.appendChild(c),a){let m=p("button","btn",a.id===x.activeEnv?"\u2713 \u5F53\u524D\u73AF\u5883":"\u8BBE\u4E3A\u5F53\u524D");m.onclick=()=>{x.activeEnv=r,k(),oe(),ae(),o()},l.appendChild(m)}let g=p("button","btn primary","\u5B8C\u6210");g.onclick=n,l.appendChild(g),t.appendChild(l)}function n(){x.envs.forEach(a=>{a.vars&&(a.vars=a.vars.filter(i=>i.k||i.v))}),k(),oe(),ae(),e.classList.remove("open"),e.innerHTML=""}e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=a=>{a.target===e&&n()},o()}function ee(){let e=b("#tabbar");e.innerHTML="",x.tabs.forEach(r=>{let o=p("div","rtab"+(r.id===x.activeTab?" active":""));o.innerHTML=`<span class="tm ${le(r.method)}">${r.method}</span><span class="tn">${y(r.name)}</span>`,r.dirty&&o.appendChild(p("span","dirty"));let n=p("button","tx","\xD7");n.title="\u5173\u95ED",n.onclick=a=>{a.stopPropagation(),St(r)},o.appendChild(n),o.onclick=()=>{x.activeTab=r.id,G(),k()},o.oncontextmenu=a=>{a.preventDefault(),a.stopPropagation(),wr(a,r)},o.querySelector(".tn").ondblclick=a=>{a.stopPropagation();let i=prompt("\u91CD\u547D\u540D tab\uFF1A",r.name);i!=null&&(r.name=i.trim()||r.name,ee(),k())},e.appendChild(o)});let t=p("button","tab-add","+");t.title="\u65B0\u5EFA\u8BF7\u6C42 tab",t.onclick=()=>{let r=ne();x.tabs.push(r),x.activeTab=r.id,G(),k()},e.appendChild(t),b("#stTabs").textContent=x.tabs.length}function ae(){let e=N(),t=b("#methodLabel");t.textContent=e.method,t.className=le(e.method);let r=b("#url");document.activeElement!==r&&(r.value=e.url),Pe()}function Pe(){let e=N(),t=b("#urlResolved");if(e.url&&e.url.indexOf("{{")>=0){let r=q(e.url);t.innerHTML="\u2192 <b>"+y(r)+"</b>"}else t.innerHTML=""}var ke=e=>e.filter(t=>t.on&&(t.k||t.v)).length;function ie(){let e=N();Y("#reqSubtabs .subtab").forEach(r=>r.classList.toggle("active",r.dataset.rt===e.reqTab)),b("#bParams").textContent=ke(e.params)||"",b("#bHeaders").textContent=ke(e.headers)||"",b("#bBody").textContent=e.bodyType!=="none"?"\u2022":"";let t=b("#reqPane");t.innerHTML="",e.reqTab==="params"?t.appendChild(ze(e.params,{kPlace:"\u53C2\u6570\u540D",vPlace:"\u53C2\u6570\u503C",onChange:()=>{te(e),ar(e),b("#bParams").textContent=ke(e.params)||"",k()}})):e.reqTab==="headers"?t.appendChild(ze(e.headers,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{te(e),b("#bHeaders").textContent=ke(e.headers)||"",k()}})):or(t,e)}function ze(e,t){let r=p("div","kv");function o(){(!e.length||e[e.length-1].k||e[e.length-1].v)&&e.push(B())}function n(i){let s=()=>e[e.length-1]===i,l=p("div","kv-row"+(!i.k&&!i.v?" blank":"")),c=p("label","ck"),g=p("input");g.type="checkbox",g.checked=i.on,g.onchange=()=>{i.on=g.checked,t.onChange()},c.appendChild(g);let m=p("input","k");m.type="text",m.placeholder=t.kPlace,m.value=i.k,m.spellcheck=!1;let u=p("input","v");u.type="text",u.placeholder=t.vPlace,u.value=i.v,u.spellcheck=!1;let d=()=>{if(i.k=m.value,i.v=u.value,l.classList.toggle("blank",!i.k&&!i.v),(i.k||i.v)&&s()){let v=B();e.push(v),r.appendChild(n(v))}t.onChange()};m.addEventListener("input",d),u.addEventListener("input",d);let h=p("button","rm","\u2715");return h.title="\u5220\u9664\u8BE5\u884C",h.onclick=()=>{let v=e.indexOf(i);v>-1&&e.splice(v,1),a(),t.onChange()},l.append(c,m,u,h),l}function a(){r.innerHTML="",o(),e.forEach(i=>r.appendChild(n(i)))}return a(),r}function or(e,t){let r=p("div","body-bar"),o=p("div","seg");if([["none","\u65E0"],["json","JSON"],["text","\u6587\u672C"],["form","Form"]].forEach(([n,a])=>{let i=p("button",t.bodyType===n?"on":"",a);i.onclick=()=>{t.bodyType=n,te(t),k(),ie()},o.appendChild(i)}),r.appendChild(o),r.appendChild(p("div","sp")),t.bodyType==="json"){let n=p("button","tool","\u683C\u5F0F\u5316");n.onclick=()=>{try{t.body=JSON.stringify(JSON.parse(t.body),null,2),ie(),k(),$("JSON \u5DF2\u683C\u5F0F\u5316","ok")}catch(a){$("JSON \u65E0\u6548\uFF1A"+a.message,"err")}},r.appendChild(n)}if(e.appendChild(r),t.bodyType==="none")e.appendChild(p("div","body-none","\u8BE5\u8BF7\u6C42\u6CA1\u6709 Body\u3002<br>\u9009\u62E9 JSON / \u6587\u672C / Form \u4EE5\u7F16\u8F91\u8BF7\u6C42\u4F53\u3002"));else if(t.bodyType==="form"){let n=p("div");n.style.cssText="height:calc(100% - 49px);overflow:auto",n.appendChild(ze(t.formBody,{kPlace:"\u5B57\u6BB5\u540D",vPlace:"\u5B57\u6BB5\u503C",onChange:()=>{te(t),k()}})),e.appendChild(n)}else{let n=p("textarea","code");n.spellcheck=!1,n.placeholder=t.bodyType==="json"?`{
  "key": "value"
}`:"\u539F\u59CB\u8BF7\u6C42\u4F53\u2026",n.value=t.body,n.style.height="calc(100% - 49px)",n.addEventListener("input",()=>{t.body=n.value,te(t),k()}),n.addEventListener("keydown",a=>{if(a.key==="Tab"){a.preventDefault();let i=n.selectionStart,s=n.selectionEnd;n.value=n.value.slice(0,i)+"  "+n.value.slice(s),n.selectionStart=n.selectionEnd=i+2,t.body=n.value}}),e.appendChild(n)}}function zt(e){let t=e.indexOf("?");return t<0?[e,""]:[e.slice(0,t),e.slice(t+1)]}function ar(e){let[t]=zt(e.url),r=e.params.filter(n=>n.on&&n.k).map(n=>encodeURIComponent(n.k)+"="+encodeURIComponent(n.v)).join("&");e.url=r?t+"?"+r:t;let o=b("#url");document.activeElement!==o&&(o.value=e.url),Pe()}function Tt(e){let[,t]=zt(e.url),r=[];t&&t.split("&").forEach(o=>{if(!o)return;let[n,...a]=o.split("=");r.push({id:U(),on:!0,k:decodeURIComponent(n||""),v:decodeURIComponent((a.join("=")||"").replace(/\+/g," "))})}),r.push(B()),e.params=r}async function $e(){let e=N(),t=q(e.url.trim());if(!t){$("\u8BF7\u5148\u8F93\u5165 URL","warn"),b("#url").focus();return}/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let r={};if(e.headers.filter(s=>s.on&&s.k).forEach(s=>r[q(s.k)]=q(s.v)),!D&&!S.proxyOn){let s=Object.keys(r).filter(l=>Ae.test(l));if(s.length){let l=s.map(g=>`<code>${y(g)}</code>`).join("\u3001");b("#resSubtabs").style.display="none",b("#resStatus").style.display="none",b("#resTools").style.display="none",b("#resPane").innerHTML=`<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u88AB\u62E6\u622A\uFF1A\u6D4F\u89C8\u5668\u7981\u53D1\u5934</div><div>\u5F53\u524D\u4E3A<code>\u76F4\u8FDE</code>\u6A21\u5F0F\uFF0C\u4EE5\u4E0B\u5934\u4F1A\u88AB\u6D4F\u89C8\u5668\u9759\u9ED8\u5265\u79BB\u3001\u65E0\u6CD5\u53D1\u9001\uFF1A<b>${l}</b>\u3002\u76EE\u6807\u670D\u52A1\u5668\u6536\u5230\u7F3A\u5C11\u8FD9\u4E9B\u5934\u7684\u8BF7\u6C42\uFF0C\u901A\u5E38\u4F1A\u8FD4\u56DE<span style="color:var(--warn)">\u767B\u5F55\u5931\u6548 / 403 / \u8DE8\u57DF\u9519\u8BEF</span>\u3002</div><div class="hintbox">\u{1F449} \u70B9\u51FB\u9876\u680F <b>\u300C\u{1F6E1} \u4EE3\u7406\u300D</b> \u5F00\u542F\u8DE8\u57DF\u4EE3\u7406\u540E\u91CD\u53D1\u3002\u4EE3\u7406\u4F1A\u7531\u672C\u5730\u540E\u7AEF\u628A Cookie/UA/Referer \u7B49\u5934\u5B8C\u6574\u8FD8\u539F\u5E76\u8F6C\u53D1\uFF0C\u4E0E cURL \u53D1\u9001\u7B49\u6548\u3002</div><div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u88AB\u62E6\u622A\u5934\uFF1A${y(s.join(", "))}</div></div>`;let c=b("#sendBtn");c.disabled=!1,c.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>';return}}let o,n=e.method;["GET","HEAD"].includes(n)||(e.bodyType==="json"?(o=q(e.body),Object.keys(r).some(s=>s.toLowerCase()==="content-type")||(r["Content-Type"]="application/json")):e.bodyType==="text"?o=q(e.body):e.bodyType==="form"&&(o=e.formBody.filter(s=>s.on&&s.k).map(s=>encodeURIComponent(q(s.k))+"="+encodeURIComponent(q(s.v))).join("&"),Object.keys(r).some(s=>s.toLowerCase()==="content-type")||(r["Content-Type"]="application/x-www-form-urlencoded")));let a=b("#sendBtn");a.disabled=!0,a.innerHTML="\u53D1\u9001\u4E2D\u2026",b("#resSubtabs").style.display="none",b("#resStatus").style.display="none",b("#resTools").style.display="none",b("#resPane").innerHTML='<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>';let i=performance.now();try{if(D){if(!xt())throw new Error("cap.http \u4E0D\u53EF\u7528\uFF08\u9700 Polaris \u5BBF\u4E3B\u73AF\u5883\uFF09");$(n+" "+t+" \xB7 \u7ECF\u5BBF\u4E3B\u8F6C\u53D1 \u2026");let l=await bt({method:n,url:t,headers:r,body:o||"",bodyType:e.bodyType||"text",timeoutMs:15e3}),c=performance.now();e.response=await ht(l,t),e.response.timeMs=c-i}else{$(n+" "+t+(S.proxyOn?" \xB7 \u7ECF\u4EE3\u7406":"")+" \u2026");let l=t,c=r;if(S.proxyOn){c={};for(let[z,j]of Object.entries(r))Ae.test(z)?c["X-Relay-H-"+z]=j:c[z]=j;c["X-Relay-Target"]=t,l="/__proxy"}let g=await fetch(l,{method:n,headers:c,body:o,redirect:"follow"}),m=await g.blob(),u=performance.now(),d=g.headers.get("content-type")||"",h=ft.test(d),v="";h||(v=await m.text());let f={};g.headers.forEach((z,j)=>f[j]=z);let w=ut(v);e.response={status:g.status,statusText:g.statusText,ok:g.ok,timeMs:u-i,size:m.size,contentType:d,headers:f,text:v,isBinary:h,blobUrl:h?URL.createObjectURL(m):null,url:t,parsed:w.ok?w.value:void 0}}let s=e.response.contentType||"";e.respPath="",e.respFilter="",e.tableSel=null,e.colW={},e.treeOpen="auto",e.hiddenCols={},e.sort={},e.respView=e.response.parsed!==void 0?Array.isArray(e.response.parsed)?"table":"object":/text\/html/i.test(s)||e.response.isBinary&&/^image\//i.test(s)?"preview":"raw",Ne(),$(n+" "+e.response.status+" "+e.response.statusText+" \xB7 "+ue(e.response.timeMs)+" \xB7 "+se(e.response.size||0),e.response.ok?"ok":"warn")}catch(s){let l=performance.now();e.response={error:s.message||String(s),timeMs:l-i,url:t},Ne(),$("\u8BF7\u6C42\u5931\u8D25\uFF1A"+(s.message||s),"err")}finally{a.disabled=!1,a.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>'}}function Te(e){let t=e.response,r=t&&!t.error?t.parsed:void 0,o=r,n=!1;if(e.respPath&&r!==void 0){let l=Xe(r,e.respPath);l.ok?o=l.value:(n=!0,o=void 0)}let a=o!==void 0,i=a&&(Array.isArray(o)||o&&typeof o=="object"),s=!!t&&!e.respPath&&(/text\/html/i.test(t.contentType)||/^image\//i.test(t.contentType));return{data:o,drillErr:n,hasJSON:a,canTable:i,canPrev:s}}function ir(e){return e?Array.isArray(e)&&e.length&&e[0]&&typeof e[0]=="object"&&!Array.isArray(e[0])?Object.keys(e[0]):e&&typeof e=="object"&&!Array.isArray(e)?Object.keys(e):[]:[]}function Ne(){let e=N(),t=e.response,r=b("#resPane"),o=b("#resSubtabs"),n=b("#resStatus"),a=b("#resTools");if(!t){o.style.display="none",n.style.display="none",a.style.display="none",r.innerHTML='<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div>\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002</div>';return}if(t.error){o.style.display="none",n.style.display="none",a.style.display="none";let c=/Failed to fetch|NetworkError|load failed/i.test(t.error);r.innerHTML=`<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u5931\u8D25</div><div>${y(t.error)}</div>`+(c?'<div class="hintbox"><b>\u53EF\u80FD\u539F\u56E0\uFF1A</b>\u8DE8\u57DF CORS\u3001\u76EE\u6807\u65E0\u54CD\u5E94\u3001\u6DF7\u5408\u5185\u5BB9(HTTP/HTTPS)\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002'+(D?"<br>\u9762\u677F\u6A21\u5F0F\uFF1A\u8BF7\u6C42\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF0C\u4ECD\u5931\u8D25\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\u3001\u88AB SSRF \u62E6\u622A\uFF08\u5185\u7F51/localhost/\u5143\u6570\u636E\u5730\u5740\u7981\u53D1\uFF09\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002":S.proxyOn?"<br>\u4EE3\u7406\u5DF2\u5F00\u542F\u4ECD\u5931\u8D25\uFF1A\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\uFF0C\u6216\u540E\u7AEF\u672A\u8FD0\u884C\u6700\u65B0 server.js\u3002":"<br>\u{1F449} \u70B9\u9876\u680F\u300C\u{1F6E1} \u4EE3\u7406\u300D\u5F00\u542F\u672C\u5730\u540E\u7AEF\u8F6C\u53D1\uFF0C\u53EF\u7ED5\u8FC7 CORS \u4E0E\u6DF7\u5408\u5185\u5BB9\u9650\u5236\u3002")+"</div>":"")+`<div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u8017\u65F6 ${ue(t.timeMs)} \xB7 ${y(t.url)}</div></div>`;return}n.style.display="flex";let s=`var(--${t.status>=500?"s5":t.status>=400?"s4":t.status>=300?"s3":"s2"})`;if(n.innerHTML=`<span class="status-chip" style="color:${s}"><span class="dotc" style="background:${s}"></span>${t.status} ${y(t.statusText)}</span><span class="res-meta"><span>\u8017\u65F6 <b>${ue(t.timeMs)}</b></span><span>\u5927\u5C0F <b>${se(t.size)}</b></span>`+(t.contentType?`<span>\u7C7B\u578B <b>${y(t.contentType.split(";")[0])}</b></span>`:"")+"</span>",o.style.display="flex",t.parsed!==void 0){a.style.display="flex",a.innerHTML="";let c=null,g=Ke(t.parsed),m=p("div","ti path");m.innerHTML='<span class="lbl">\u8DEF\u5F84</span>';let u=p("div","pathdd"),d=p("button","pathdd-btn");d.type="button";let h=()=>{d.innerHTML=`<span>${e.respPath?y(e.respPath):"\u9009\u62E9\u8DEF\u5F84"}</span><span class="pcar">\u25BC</span>`};h();let v=p("div","path-menu"),f=p("input","path-filter");f.placeholder="\u8FC7\u6EE4\u8DEF\u5F84 / \u8F93\u5165\u540E\u56DE\u8F66\u5E94\u7528",f.spellcheck=!1;let w=p("div","path-list"),z=O=>{e.respPath=O,c&&(c.value=O),k(),h(),v.classList.remove("open"),V()},j=()=>{w.innerHTML="";let O=f.value.toLowerCase().trim(),P=0;g.forEach(C=>{if(P>=200)return;let X=C.path===""?"(\u6839)":C.path;if(O&&!X.toLowerCase().includes(O))return;P++;let M=p("button","path-opt"+(C.path===e.respPath?" on":""));M.type="button",M.innerHTML=`<span class="pp">${y(X)}</span><span class="pk ${C.kind}">${C.kind==="array"?"[ ] "+C.count:C.kind==="object"?"{ } "+C.count:"\xB7"}</span>`,M.onclick=()=>z(C.path),w.appendChild(M)}),P||(w.innerHTML='<div class="path-empty">\u65E0\u5339\u914D\u8DEF\u5F84\u3002<br>\u56DE\u8F66\u53EF\u76F4\u63A5\u5E94\u7528\u8F93\u5165\u7684\u8DEF\u5F84\u3002</div>')};f.addEventListener("input",j),f.addEventListener("keydown",O=>{O.key==="Enter"&&z(f.value.trim()),O.key==="Escape"&&v.classList.remove("open")}),d.onclick=O=>{O.stopPropagation();let P=!v.classList.contains("open");Y(".path-menu").forEach(C=>C.classList.remove("open")),b("#methodMenu").classList.remove("open"),b("#envMenu").classList.remove("open"),P&&(v.classList.add("open"),f.value="",j(),setTimeout(()=>f.focus(),0))},v.addEventListener("click",O=>O.stopPropagation()),v.append(f,w),u.append(d,v),m.appendChild(u);let T=p("div","ti manual");T.innerHTML='<span class="lbl">\u624B\u52A8</span>',c=p("input"),c.id="respPathIn",c.placeholder="\u5982 data.items[0].name",c.value=e.respPath||"",c.spellcheck=!1,c.addEventListener("input",()=>{e.respPath=c.value,k(),h(),V()}),T.appendChild(c);let L=Te(e),E=ir(L.data),H=ct(e,()=>{k(),V()},E);a.append(m,T,H)}else a.style.display="none";b("#bResH").textContent=Object.keys(t.headers||{}).length||"",V()}function V(){let e=N(),t=e.response;if(!t||t.error)return;let r=Te(e),o={table:r.canTable,object:r.hasJSON,raw:!0,preview:r.canPrev,headers:!0};o[e.respView]||(e.respView=r.hasJSON?"object":r.canPrev?"preview":"raw"),Y("#resSubtabs .subtab").forEach(g=>{let m=g.dataset.rv;g.classList.toggle("active",m===e.respView),g.classList.toggle("disabled",!o[m]),m==="preview"&&(g.style.display=r.canPrev?"":"none")});let n=e.respView==="table",a=e.respView==="object",i=e.respView==="raw",s=e.prettyCells!==!1;b("#prettyBtn").style.display=n||a?"":"none",b("#prettyBtn").style.color=s?"var(--brand)":"",b("#prettyBtn").innerHTML=s?"\u2726 \u7F8E\u5316":"\u2726 \u539F\u59CB",b("#treeExpand").style.display=a?"":"none",b("#treeCollapse").style.display=a?"":"none",b("#wrapBtn").style.display=i?"":"none";let l=b("#resPane");if(l.innerHTML="",r.drillErr){l.innerHTML='<div class="prev-none">\u8DEF\u5F84 <b>'+y(e.respPath)+"</b> \u5728\u54CD\u5E94\u4E2D\u4E0D\u5B58\u5728\u3002</div>";return}let c=e.respView;c==="raw"?l.appendChild(Qe(t,r.data)):c==="object"?l.appendChild(nt(r.data,e)):c==="table"?l.appendChild(pt(r.data,e)):c==="preview"?l.appendChild(sr(t)):l.appendChild(lr(t))}function sr(e){if(/^image\//i.test(e.contentType)&&e.blobUrl){let t=p("div","prev-img-wrap"),r=p("img");return r.src=e.blobUrl,t.appendChild(r),t}if(/text\/html/i.test(e.contentType)){let t=p("iframe","prev-frame");return t.sandbox="",t.srcdoc=e.text,t}return p("div","prev-none","\u65E0\u53EF\u9884\u89C8\u5185\u5BB9\uFF08\u4EC5\u652F\u6301 HTML \u4E0E\u56FE\u7247\u9884\u89C8\uFF09\u3002")}function lr(e){let t=p("div","tbl-wrap"),r=p("table","dt"),o=Object.keys(e.headers||{});r.innerHTML="<thead><tr><th>Header</th><th>Value</th></tr></thead>";let n=p("tbody");return o.length||(n.innerHTML='<tr><td colspan="2" style="color:var(--dimmer)">\uFF08\u65E0\u53EF\u89C1\u54CD\u5E94\u5934 \u2014 \u6D4F\u89C8\u5668\u53EF\u80FD\u9650\u5236\u4E86\u90E8\u5206\u5934\uFF09</td></tr>'),o.forEach(a=>{let i=p("tr");i.innerHTML=`<td style="color:var(--j-key);white-space:nowrap">${y(a)}</td><td>${y(e.headers[a])}</td>`,n.appendChild(i)}),r.appendChild(n),t.appendChild(r),t}function dr(e){e=e.replace(/\\\r?\n/g," ");let t=[],r="",o=null,n=!1;for(let a=0;a<e.length;a++){let i=e[a];o?i==="\\"&&o==='"'?r+=e[++a]||"":i===o?o=null:r+=i:i==='"'||i==="'"?(o=i,n=!0):i===" "||i==="	"||i===`
`||i==="\r"?n&&(t.push(r),r="",n=!1):(r+=i,n=!0)}return n&&t.push(r),t}function pr(e){let t=dr(e.trim());t.length&&/^curl(\.exe)?$/i.test(t[0])&&(t=t.slice(1));let r=[];for(let u of t){if(u.startsWith("--")||/^-[A-Za-z]/.test(u)&&u.length>2){let d=u.indexOf("=");if(d>0){r.push(u.slice(0,d)),r.push(u.slice(d+1));continue}}r.push(u)}t=r;let o=[],n=[],a=null,i="",s=!1,l=u=>{let d=u.indexOf(":");if(d<0){o.push({on:!0,k:u.trim(),v:""});return}o.push({on:!0,k:u.slice(0,d).trim(),v:u.slice(d+1).trim()})};for(let u=0;u<t.length;u++){let d=t[u],h=()=>t[++u];if(d==="-X"||d==="--request")a=h();else if(d.startsWith("-X")&&d.length>2)a=d.slice(2);else if(d==="-H"||d==="--header")l(h());else if(d.startsWith("-H")&&d.length>2)l(d.slice(2));else if(d==="-d"||d==="--data"||d==="--data-raw"||d==="--data-ascii"||d==="--data-binary"||d==="--data-urlencode")n.push(h());else if(d.startsWith("-d")&&d.length>2)n.push(d.slice(2));else if(d==="--json")n.push(h()),o.some(v=>v.k.toLowerCase()==="content-type")||o.push({on:!0,k:"Content-Type",v:"application/json"});else if(d==="-u"||d==="--user")try{o.push({on:!0,k:"Authorization",v:"Basic "+btoa(h())})}catch{}else d==="-b"||d==="--cookie"?o.push({on:!0,k:"Cookie",v:h()}):d==="-A"||d==="--user-agent"?o.push({on:!0,k:"User-Agent",v:h()}):d==="-e"||d==="--referer"?o.push({on:!0,k:"Referer",v:h()}):d==="-G"||d==="--get"?s=!0:d==="--url"?i=h():["--compressed","-L","--location","-k","--insecure","-s","--silent","-S","--show-error","-i","--include","-v","--verbose","-f","--fail","-#","--progress-bar"].includes(d)||d.startsWith("-")||i||(i=d)}a||(a=n.length&&!s?"POST":"GET"),a=a.toUpperCase();let c=n.join("&");s&&c&&(i+=(i.includes("?")?"&":"?")+c,c="");let g=o.find(u=>u.k.toLowerCase()==="content-type"),m="none";if(c&&(g&&/json/i.test(g.v)||/^\s*[\[{]/.test(c)?m="json":m="text"),m==="json")try{c=JSON.stringify(JSON.parse(c),null,2)}catch{}return{method:a,url:i,headers:o,body:c,bodyType:m}}function cr(){let e=b("#modalBg"),t=p("div","modal");t.innerHTML='<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\uFF08\u652F\u6301 -X -H -d --data-raw -u -b -G --json\u3001--flag=value \u7B49\u53F7\u5199\u6CD5\u3001curl.exe \u524D\u7F00\uFF09\u3002</div>';let r=p("div","field");r.innerHTML="<label>cURL \u547D\u4EE4</label>";let o=p("textarea","curl-ta");o.placeholder=`curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx' -H 'Content-Type: application/json' --data-raw '{"a":1}'`,r.appendChild(o),t.appendChild(r);let n=p("div","acts"),a=p("div");a.style.flex="1";let i=p("button","btn ghost","\u53D6\u6D88");i.onclick=l;let s=p("button","btn primary","\u89E3\u6790\u5E76\u65B0\u5EFA");s.onclick=()=>{let c=o.value.trim();if(!c){$("\u8BF7\u7C98\u8D34 curl \u547D\u4EE4","warn");return}try{let g=pr(c);if(!g.url){$("\u672A\u80FD\u4ECE\u547D\u4EE4\u4E2D\u89E3\u6790\u51FA URL","err");return}let m=ne({name:"cURL: "+jt(g.url),method:g.method,url:g.url,bodyType:g.bodyType,body:g.body,headers:(g.headers.length?g.headers.map(d=>({id:U(),on:!0,k:d.k,v:d.v})):[]).concat([B()])});Tt(m),m.dirty=!0,x.tabs.push(m),x.activeTab=m.id,G(),k(),l(),$("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A"+g.method+" "+g.url,"ok");let u=g.headers.filter(d=>Ae.test(d.k));u.length&&!D&&($("\u26A0 \u5BFC\u5165\u542B\u6D4F\u89C8\u5668\u7981\u53D1\u5934\uFF08"+u.map(d=>d.k).join(", ")+"\uFF09\u2014\u2014\u53D1\u9001\u65F6\u9700\u5F00\u542F\u300C\u{1F6E1} \u4EE3\u7406\u300D\uFF0C\u5426\u5219\u8FD9\u4E9B\u5934\u4F1A\u88AB\u5265\u79BB","warn"),S.proxyOn||setTimeout(()=>{let d=b("#proxyBtn");d&&(d.classList.add("pulse-hint"),d.scrollIntoView({behavior:"smooth",block:"center"}),setTimeout(()=>d.classList.remove("pulse-hint"),2400))},300))}catch(g){$("cURL \u89E3\u6790\u5931\u8D25\uFF1A"+g.message,"err")}},n.append(i,a,s),t.appendChild(n),e.innerHTML="",e.appendChild(t),e.classList.add("open"),o.focus(),e.onclick=c=>{c.target===e&&l()};function l(){e.classList.remove("open"),e.innerHTML=""}}function Ct(e){let t=q(e.url.trim());/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let r=i=>"'"+String(i).replace(/'/g,"'\\''")+"'",o=["curl -X "+e.method+" "+r(t)],n={};e.headers.filter(i=>i.on&&i.k).forEach(i=>n[q(i.k)]=q(i.v));let a=null;return["GET","HEAD"].includes(e.method)||(e.bodyType==="json"?(a=q(e.body),Object.keys(n).some(i=>i.toLowerCase()==="content-type")||(n["Content-Type"]="application/json")):e.bodyType==="text"?a=q(e.body):e.bodyType==="form"&&(a=e.formBody.filter(i=>i.on&&i.k).map(i=>encodeURIComponent(q(i.k))+"="+encodeURIComponent(q(i.v))).join("&"),Object.keys(n).some(i=>i.toLowerCase()==="content-type")||(n["Content-Type"]="application/x-www-form-urlencoded"))),Object.entries(n).forEach(([i,s])=>o.push("-H "+r(i+": "+s))),a&&o.push("--data-raw "+r(a)),o.join(` \\
  `)}function te(e){e.dirty||(e.dirty=!0,ee())}function fr(e){for(let t of x.collections){let r=t.requests.find(o=>o.id===e);if(r)return{g:t,r}}return null}function vt(e){return{method:e.method,url:e.url,params:JSON.parse(JSON.stringify(e.params)),headers:JSON.parse(JSON.stringify(e.headers)),bodyType:e.bodyType,body:e.body,formBody:JSON.parse(JSON.stringify(e.formBody))}}function jt(e){try{let t=new URL(/^[a-z]+:\/\//i.test(e)?e:"https://"+e.replace(/^\{\{[^}]+\}\}/,"http://x"));return t.pathname&&t.pathname.length>1?t.pathname:t.hostname}catch{return String(e).slice(0,28)}}function mt(){let e=N();if(e.savedId){let r=fr(e.savedId);if(r){Object.assign(r.r,vt(e)),r.r.name=e.name,e.dirty=!1,k(),ee(),F(),$("\u5DF2\u66F4\u65B0\u300C"+e.name+"\u300D","ok");return}}let t=x.collections.map(r=>`<option value="${r.id}">${y(r.name)}</option>`).join("");kr("\u4FDD\u5B58\u8BF7\u6C42","\u628A\u5F53\u524D\u8BF7\u6C42\u5B58\u5165\u4E00\u4E2A\u5206\u7EC4",[{label:"\u540D\u79F0",id:"mName",type:"text",value:e.url?e.method+" "+jt(e.url):"\u672A\u547D\u540D\u8BF7\u6C42"},{label:"\u5206\u7EC4",id:"mGroup",type:"select",html:t+'<option value="__new">\uFF0B \u65B0\u5EFA\u5206\u7EC4\u2026</option>'}],r=>{let o=r.mGroup;if(o==="__new"||!x.collections.length){let i=prompt("\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4");if(!i)return!1;let s={id:U(),name:i,collapsed:!1,requests:[]};x.collections.push(s),o=s.id}let n=x.collections.find(i=>i.id===o),a=Object.assign({id:U(),name:r.mName||"\u672A\u547D\u540D\u8BF7\u6C42"},vt(e));n.requests.push(a),e.savedId=a.id,e.name=a.name,e.dirty=!1,k(),ee(),F(),$("\u5DF2\u4FDD\u5B58\u5230\u300C"+n.name+"\u300D","ok")})}function ur(e){let t=x.tabs.find(o=>o.savedId===e.id);if(t){x.activeTab=t.id,G();return}let r=ne({name:e.name,savedId:e.id,method:e.method,url:e.url,params:JSON.parse(JSON.stringify(e.params||[B()])),headers:JSON.parse(JSON.stringify(e.headers||[B()])),bodyType:e.bodyType||"none",body:e.body||"",formBody:JSON.parse(JSON.stringify(e.formBody||[B()]))});r.params.length||(r.params=[B()]),r.headers.length||(r.headers=[B()]),r.formBody.length||(r.formBody=[B()]),x.tabs.push(r),x.activeTab=r.id,G(),k(),$("\u5DF2\u8F7D\u5165\u300C"+e.name+"\u300D")}function br(e,t){confirm("\u5220\u9664\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u300C"+t.name+"\u300D\uFF1F")&&(e.requests=e.requests.filter(r=>r.id!==t.id),x.tabs.forEach(r=>{r.savedId===t.id&&(r.savedId=null,r.dirty=!0)}),k(),F(),ee())}function xr(e){let t=prompt("\u5206\u7EC4\u540D\u79F0\uFF1A",e.name);t!=null&&(e.name=t.trim()||e.name,k(),F())}function hr(e){if(!confirm("\u5220\u9664\u5206\u7EC4\u300C"+e.name+"\u300D\u53CA\u5176\u4E2D "+e.requests.length+" \u4E2A\u8BF7\u6C42\uFF1F"))return;let t=e.requests.map(r=>r.id);x.collections=x.collections.filter(r=>r.id!==e.id),x.tabs.forEach(r=>{t.includes(r.savedId)&&(r.savedId=null,r.dirty=!0)}),k(),F(),ee()}function St(e){if(e.dirty&&(e.url||e.savedId)&&!confirm("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F"))return;let t=x.tabs.indexOf(e);if(x.tabs.splice(t,1),x.tabs.length)x.activeTab===e.id&&(x.activeTab=x.tabs[Math.max(0,t-1)].id);else{let r=ne();x.tabs.push(r),x.activeTab=r.id}G(),k()}function vr(e){x.tabs=x.tabs.filter(t=>t===e),x.activeTab=e.id,G(),k()}function mr(e){let t=x.tabs.indexOf(e);x.tabs=x.tabs.slice(0,t+1),x.activeTab=e.id,G(),k()}function gr(e){let t=x.tabs.indexOf(e);x.tabs=x.tabs.slice(t),x.activeTab=e.id,G(),k()}var yr=null,Le=null;function wr(e,t){e.preventDefault(),e.stopPropagation(),yr=t,Le&&Le();let r=p("div","ctx-menu");r.style.cssText="position:fixed;z-index:10001;background:var(--bg-2, #1e1f26);border:1px solid var(--line, #2a2b32);border-radius:8px;padding:4px 0;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.4)",r.style.left=Math.min(e.clientX,innerWidth-180)+"px",r.style.top=Math.min(e.clientY,innerHeight-8)+"px",document.body.appendChild(r),r.style.top=Math.min(e.clientY,innerHeight-r.offsetHeight-8)+"px",[{label:"\u2715 \u5173\u95ED",action:()=>{St(t),n()}},{label:"\u5173\u95ED\u5176\u4ED6",action:()=>{vr(t),n()}},{label:"\u5173\u95ED\u53F3\u4FA7",action:()=>{mr(t),n()}},{label:"\u5173\u95ED\u5DE6\u4FA7",action:()=>{gr(t),n()}},{sep:!0},{label:"\u270E \u91CD\u547D\u540D",action:()=>{let s=prompt("\u91CD\u547D\u540D tab\uFF1A",t.name);s!=null&&(t.name=s.trim()||t.name,ee(),k()),n()}},{label:"\u{1F4CB} \u590D\u5236 URL",action:()=>{W(t.url||"","URL \u5DF2\u590D\u5236"),n()}},{label:"cURL \u590D\u5236",action:()=>{W(Ct(t),"cURL \u5DF2\u590D\u5236"),n()}}].forEach(s=>{if(s.sep){let c=p("div");c.style.cssText="height:1px;background:var(--line,#2a2b32);margin:4px 0",r.appendChild(c);return}let l=p("button");l.textContent=s.label,l.style.cssText="display:block;width:100%;padding:6px 14px;text-align:left;font-size:12px;color:var(--ink,#d8dae2);background:none;border:none;cursor:pointer;white-space:nowrap",l.onmouseenter=()=>l.style.background="var(--surface,#262830)",l.onmouseleave=()=>l.style.background="none",l.onclick=s.action,r.appendChild(l)});function n(){r.remove(),Le=null,document.removeEventListener("keydown",a),document.removeEventListener("mousedown",i)}Le=n;function a(s){s.key==="Escape"&&n()}function i(s){r.contains(s.target)||n()}setTimeout(()=>{document.addEventListener("keydown",a),document.addEventListener("mousedown",i)},0)}function kr(e,t,r,o){let n=b("#modalBg"),a=p("div","modal");a.innerHTML=`<h3>${y(e)}</h3>${t?`<div class="sub">${y(t)}</div>`:""}`,r.forEach(u=>{let d=p("div","field");d.innerHTML=`<label>${y(u.label)}</label>`+(u.type==="select"?`<select id="${u.id}">${u.html}</select>`:`<input id="${u.id}" type="text" value="${y(u.value||"")}" />`),a.appendChild(d)});let i=p("div","acts"),s=p("div");s.style.flex="1";let l=p("button","btn ghost","\u53D6\u6D88");l.onclick=m;let c=p("button","btn primary","\u786E\u5B9A");c.onclick=()=>{let u={};r.forEach(d=>u[d.id]=b("#"+d.id,a).value),o(u)!==!1&&m()},i.append(s,l,c),a.appendChild(i),n.innerHTML="",n.appendChild(a),n.classList.add("open");let g=a.querySelector("input,select");g&&(g.focus(),g.select&&g.select()),a.addEventListener("keydown",u=>{u.key==="Enter"&&u.target.tagName!=="SELECT"&&c.click(),u.key==="Escape"&&m()}),n.onclick=u=>{u.target===n&&m()};function m(){n.classList.remove("open"),n.innerHTML=""}}function Lr(){let e=b("#exportBtn");e&&(e.onclick=()=>{let o=JSON.stringify({relay:2,exportedAt:new Date().toISOString(),collections:x.collections,envs:x.envs},null,2),n=p("a");n.href=URL.createObjectURL(new Blob([o],{type:"application/json"})),n.download="relay-export.json",n.click(),$("\u5DF2\u5BFC\u51FA\u96C6\u5408\u4E0E\u73AF\u5883","ok")});let t=b("#importBtn");t&&(t.onclick=()=>b("#fileInput").click());let r=b("#fileInput");r&&(r.onchange=o=>{let n=o.target.files[0];if(!n)return;let a=new FileReader;a.onload=()=>{try{let i=JSON.parse(a.result),s=Array.isArray(i)?i:i.collections;if(!Array.isArray(s))throw new Error("\u683C\u5F0F\u4E0D\u7B26");s.forEach(l=>{l.id=U(),(l.requests||[]).forEach(c=>c.id=U())}),x.collections=x.collections.concat(s),i.envs&&Array.isArray(i.envs)&&(i.envs.forEach(l=>{l.id=U()}),x.envs=x.envs.concat(i.envs),oe()),k(),F(),$("\u5DF2\u5BFC\u5165 "+s.length+" \u4E2A\u5206\u7EC4","ok")}catch(i){$("\u5BFC\u5165\u5931\u8D25\uFF1A"+i.message,"err")}b("#fileInput").value=""},a.readAsText(n)})}function zr(){let e=N(),t=e.response;if(!t||t.error)return;let r=Te(e),o="response";try{o=new URL(t.url).pathname.split("/").pop()||"response"}catch{}let n,a=!1;if(t.isBinary&&t.blobUrl&&!e.respPath)n=t.blobUrl;else{let s=r.hasJSON?JSON.stringify(r.data,null,2):t.text;/\./.test(o)||(o+=r.hasJSON?".json":/html/.test(t.contentType)?".html":".txt"),n=URL.createObjectURL(new Blob([s],{type:t.contentType||"text/plain"})),a=!0}let i=p("a");i.href=n,i.download=o,i.click(),a&&setTimeout(()=>URL.revokeObjectURL(n),1e3),$("\u5DF2\u4E0B\u8F7D "+o,"ok")}function Tr(){let e=b("#sendBtn");e&&(e.onclick=$e);let t=b("#saveBtn");t&&(t.onclick=mt);let r=b("#curlBtn");r&&(r.onclick=()=>W(Ct(N()),"cURL \u5DF2\u590D\u5236"));let o=b("#curlImportBtn");o&&(o.onclick=cr);let n=b("#copyResBtn");n&&(n.onclick=()=>{let f=N(),w=Te(f);!f.response||f.response.error||W(w.hasJSON?JSON.stringify(w.data,null,2):f.response.text||"","\u5DF2\u590D\u5236")});let a=b("#dlBtn");a&&(a.onclick=zr);let i=b("#wrapBtn");i&&(i.onclick=()=>{let f=Ze();b("#wrapBtn").style.color=f?"var(--brand)":"",V()});let s=b("#prettyBtn");s&&(s.onclick=()=>{let f=N();f.prettyCells=f.prettyCells===!1,k(),V()});let l=b("#treeExpand");l&&(l.onclick=()=>{N().treeOpen="all",V()});let c=b("#treeCollapse");c&&(c.onclick=()=>{N().treeOpen="none",V()});let g=b("#url");g&&(g.addEventListener("input",f=>{let w=N();w.url=f.target.value,te(w),Pe()}),g.addEventListener("change",f=>{let w=N();w.url=f.target.value,Tt(w),w.reqTab==="params"&&ie(),k()}),g.addEventListener("keydown",f=>{(f.metaKey||f.ctrlKey)&&f.key==="Enter"&&$e()})),Y("#reqSubtabs .subtab").forEach(f=>f.onclick=()=>{N().reqTab=f.dataset.rt,ie(),k()}),Y("#resSubtabs .subtab").forEach(f=>f.onclick=()=>{f.classList.contains("disabled")||(N().respView=f.dataset.rv,V(),k())});let m=b("#search");m&&m.addEventListener("input",F);let u=b("#newGroup");u&&(u.onclick=()=>{let f=prompt("\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4");f&&(x.collections.push({id:U(),name:f.trim(),collapsed:!1,requests:[]}),k(),F())});let d=b("#toggleSide");d&&(d.onclick=()=>{S.sideCollapsed=!S.sideCollapsed,b("#main").classList.toggle("collapsed",S.sideCollapsed),k()});let h=b("#layoutBtn");h&&(h.onclick=()=>{S.layout=S.layout==="h"?"v":"h",Ot(),k()});let v=b("#proxyBtn");v&&(v.onclick=()=>{if(D){$("\u9762\u677F\u6A21\u5F0F\uFF1A\u8BF7\u6C42\u6052\u7ECF\u5BBF\u4E3B cap.http \u8F6C\u53D1\uFF08\u65E0\u9700\u624B\u52A8\u5F00\u5173\uFF09","ok");return}S.proxyOn=!S.proxyOn,Et(),k(),$(S.proxyOn?"\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406 \xB7 \u8BF7\u6C42\u7ECF\u672C\u5730\u540E\u7AEF /__proxy \u8F6C\u53D1":"\u5DF2\u5173\u95ED\u4EE3\u7406 \xB7 \u6D4F\u89C8\u5668\u76F4\u8FDE","ok")}),document.addEventListener("keydown",f=>{_e()==="api"&&((f.metaKey||f.ctrlKey)&&f.key==="Enter"&&(f.preventDefault(),$e()),(f.metaKey||f.ctrlKey)&&(f.key==="s"||f.key==="S")&&(f.preventDefault(),mt()))})}function Et(){let e=b("#proxyBtn");e&&(e.innerHTML=D?"\u{1F6E1} \u4EE3\u7406: \u5F00(\u5BBF\u4E3B)":S.proxyOn?"\u{1F6E1} \u4EE3\u7406: \u5F00":"\u{1F6E1} \u4EE3\u7406: \u5173",e.style.color=S.proxyOn?"var(--brand)":"",e.style.borderColor=S.proxyOn?"var(--brand)":"",e.disabled=D)}function Cr(){let e=b("#divider"),t=b("#split");if(!e||!t)return;let r=!1;e.addEventListener("mousedown",o=>{r=!0,document.body.style.cursor=S.layout==="h"?"col-resize":"row-resize",document.body.style.userSelect="none",o.preventDefault()}),document.addEventListener("mousemove",o=>{if(!r)return;let n=t.getBoundingClientRect();if(S.layout==="h"){let a=Math.max(160,Math.min(Math.max(60,n.width-180),o.clientX-n.left));S.reqW=a,t.style.setProperty("--reqW",a+"px")}else{let a=Math.max(80,Math.min(Math.max(80,n.height-120),o.clientY-n.top));S.reqH=a,t.style.setProperty("--reqH",a+"px")}}),document.addEventListener("mouseup",()=>{r&&(r=!1,document.body.style.cursor="",document.body.style.userSelect="",k())})}function jr(){let e=b("#cellTip");if(!e)return;let t=!1,r=o=>{let n=o.getAttribute("data-full");return n==null||n===""?null:o.scrollWidth>o.clientWidth+1||n.length>56?n:null};document.addEventListener("mouseover",o=>{let n=o.target;if(!(n instanceof Element))return;let a=n.closest("td[data-full]");if(!a){t&&(e.classList.remove("show"),t=!1);return}let i=r(a);if(i==null){t&&(e.classList.remove("show"),t=!1);return}e.textContent=i.length>2e3?i.slice(0,2e3)+"\u2026":i,e.classList.add("show"),t=!0}),document.addEventListener("mousemove",o=>{if(!t)return;let n=14,a=e.offsetWidth,i=e.offsetHeight,s=o.clientX+n,l=o.clientY+n;s+a>innerWidth-8&&(s=o.clientX-a-n),l+i>innerHeight-8&&(l=o.clientY-i-n),e.style.left=Math.max(8,s)+"px",e.style.top=Math.max(8,l)+"px"}),document.addEventListener("mouseout",o=>{let n=o.target;n instanceof Element&&n.closest("td[data-full]")&&(e.classList.remove("show"),t=!1)})}function Ot(){let e=b("#split");if(!e)return;e.classList.toggle("h",S.layout==="h");let t=D?180:240,r=D?320:520;e.style.setProperty("--reqH",(S.reqH||t)+"px"),e.style.setProperty("--reqW",(S.reqW||r)+"px");let o=b("#layoutBtn");o&&(o.innerHTML=S.layout==="h"?"\u21C5 \u4E0A\u4E0B":"\u21C4 \u5DE6\u53F3")}function G(){ee(),ae(),ie(),Ne(),F(),oe()}function Mt(){tr(),rr(),Lr(),Tr(),Cr(),jr(),Qt(),D&&!localStorage.getItem(Be)&&(S.sideCollapsed=!0);let e=b("#main");e&&e.classList.toggle("collapsed",S.sideCollapsed),Ot(),Et(),G()}import{jsx as Mr}from"react/jsx-runtime";var Er=`
<nav class="navbar" id="navbar">
  <button class="nav-brand" id="navBrand"><span class="dot"></span>RELAY<small>DEVKIT</small></button>
  <div class="nav-tabs" id="navTabs"></div>
  <div class="nav-sp"></div>
  <span class="nav-hint">\u96F6\u4F9D\u8D56 \xB7 \u672C\u5730\u5F00\u53D1\u8005\u5DE5\u5177\u7BB1</span>
</nav>
<div id="view">
  <div class="view" id="viewHome"></div>
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
`;function Or({pluginId:e,onSendToChat:t}){let r=Ht(null),o=Ht(!1);return Sr(()=>{let n=r.current;if(!(!n||o.current)){Oe(),n.innerHTML=Er;try{let a=document.createElement("style");a.setAttribute("data-relay-devkit",""),a.textContent=Ie,n.prepend(a)}catch(a){console.warn("[RELAY DevKit] CSS injection failed:",a)}return je(n),Ve(!0),Ge({persist:k,rerender:V}),Ee({id:"home",label:"\u9996\u9875",icon:"\u2302"}),Ee({id:"api",label:"API \u8BF7\u6C42",icon:"\u21C5",card:{name:"API \u8BF7\u6C42",icon:"\u21C5",accent:"var(--brand)",desc:"\u591A tab\u3001\u73AF\u5883\u53D8\u91CF\u3001cURL \u5BFC\u5165\u3001\u5BBF\u4E3B cap.http \u8DE8\u57DF\u8F6C\u53D1\uFF1B\u54CD\u5E94\u652F\u6301\u8868\u683C / \u5BF9\u8C61\u6811 / \u8DEF\u5F84\u4E0B\u94BB\u4E0E\u7B5B\u9009\u3002"}}),kt(!0),Mt(),We(),o.current=!0,()=>{n.innerHTML="",je(document),Oe(),o.current=!1}}},[]),Mr("div",{ref:r,className:"relay-devkit-panel",style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg, #16181e)",color:"var(--ink, #d8dae2)"}})}export{Or as default};
