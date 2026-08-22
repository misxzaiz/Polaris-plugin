import{useEffect as qn,useRef as Ht}from"react";var Ue=`/* ============================================================
   RELAY \u2014 \u8BBE\u8BA1\u7CFB\u7EDF \xB7 \u7CBE\u5BC6\u4EEA\u8868 / obsidian + signal-coral
   ============================================================ */
:root{
  --bg:#16181e; --bg-2:#1a1c24;
  --surface:#1e2028; --surface-2:#252830; --surface-3:#2c2f3a;
  --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.18);
  --ink:#d8dae2; --dim:#a8acba; --dimmer:#6e7282;
  --brand:#ff7a59; --brand-hi:#ff926f; --brand-ink:#1c0c06;
  --brand-glow:0 0 0 1px rgba(255,122,89,.5), 0 0 22px -8px rgba(255,122,89,.7);
  --brand-line:rgba(255,122,89,.4);
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
   \u9762\u677F\u6A21\u5F0F\u4E0B\u4E0D\u4FEE\u6539\u5BBF\u4E3B html/body\uFF08panel.jsx \u8BBE\u7F6E :host \u5BB9\u5668\u4E3A .polaris-api-client-panel\uFF09\u3002 */
body:not(.relay-host) html,body:not(.relay-host){height:100%}
/* \u5BB9\u5668\u67E5\u8BE2\uFF1A\u72EC\u7ACB\u6A21\u5F0F body \u4E3A\u5BB9\u5668\uFF0C\u9762\u677F\u6A21\u5F0F .polaris-api-client-panel \u4E3A\u5BB9\u5668\u3002
   @container \u57FA\u4E8E\u300C\u5BB9\u5668\u81EA\u8EAB\u5BBD\u5EA6\u300D\u89E6\u53D1\uFF0C\u800C\u975E\u89C6\u53E3\uFF0C\u4F7F\u7A84\u9762\u677F\u81EA\u52A8\u7D27\u51D1\u5E03\u5C40\u3002 */
body:not(.relay-host){container-type:inline-size}
.polaris-api-client-panel{container-type:inline-size;position:relative}
/* \u9762\u677F\u6839\u5BB9\u5668\u5185\u90E8\u5E03\u5C40\uFF08\u907F\u514D\u6C61\u67D3\u5BBF\u4E3B body\uFF09 */
.polaris-api-client-panel{background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}
body:not(.relay-host){background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}
/* \u80CC\u666F\u88C5\u9970 \u2014 \u72EC\u7ACB\u6A21\u5F0F fixed \u5728\u89C6\u53E3\u3001\u9762\u677F\u6A21\u5F0F absolute \u9650\u5236\u5728\u5BB9\u5668\u5185 */
body:not(.relay-host)::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;
  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}
body:not(.relay-host)::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.45;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}
.polaris-api-client-panel::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}
.polaris-api-client-panel::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.45;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}
.polaris-api-client-panel > *{position:relative;z-index:1}
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
.polaris-api-client-panel .cell-tip,
.polaris-api-client-panel .modal-bg,
.polaris-api-client-panel .toast,
.polaris-api-client-panel .db-ctx,
.polaris-api-client-panel .db-ac,
.polaris-api-client-panel #aiFloatHost,
.polaris-api-client-panel .ai-fab,
.polaris-api-client-panel .ai-float{position:absolute}
.polaris-api-client-panel .ai-fab{right:14px;bottom:14px}
.polaris-api-client-panel .ai-float{right:14px;bottom:60px;width:min(420px, calc(100% - 28px));max-height:calc(100% - 80px);height:auto}

/* ===== \u6A21\u5F0F\u5207\u6362\u680F ===== */
.polaris-api-client-panel .mode-bar{display:flex;align-items:center;gap:8px;flex-shrink:0;padding:5px 10px;border-bottom:1px solid var(--line);background:var(--bg-2)}
.polaris-api-client-panel .mode-btn{height:24px;padding:0 12px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer;font-size:10.5px;border-radius:var(--r-sm)}
.polaris-api-client-panel .mode-btn:hover{color:var(--ink);background:var(--surface)}
.polaris-api-client-panel .mode-btn.active{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.1)}
.polaris-api-client-panel .mode-lbl{font-size:10px;color:var(--dimmer);white-space:nowrap}
.polaris-api-client-panel .mode-select{height:24px;padding:0 8px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);color:var(--dim);font-size:10.5px;max-width:260px}
.polaris-api-client-panel .server-badge{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:3px 8px;border-radius:4px;background:rgba(68,147,248,.1);border:1px solid rgba(68,147,248,.2);font-size:10px;color:var(--m-post)}

/* ===== \u5B9A\u5236\u6A21\u677F\u9762\u677F ===== */
.polaris-api-client-panel .custom-panel{border-bottom:1px solid var(--line);background:var(--bg-2);flex-shrink:0}
.polaris-api-client-panel .custom-bar{display:flex;align-items:center;gap:8px;padding:5px 10px}
.polaris-api-client-panel .template-form{border-top:1px dashed var(--line);padding:8px 10px}
.polaris-api-client-panel .tf-title{font-size:10px;color:var(--dimmer);margin-bottom:6px;letter-spacing:.04em}
.polaris-api-client-panel .tf-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:200px;overflow:auto}
.polaris-api-client-panel .tf-field{margin-bottom:4px}
.polaris-api-client-panel .tf-field label{display:block;font-size:10px;color:var(--dim);margin-bottom:2px}
.polaris-api-client-panel .tf-field .tf-req{color:var(--err)}
.polaris-api-client-panel .tf-field .tf-extra{color:var(--warn);font-size:9px}
.polaris-api-client-panel .tf-field input,.polaris-api-client-panel .tf-field textarea{width:100%;padding:4px 6px;border-radius:3px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:11px;outline:none}
.polaris-api-client-panel .tf-field input:focus,.polaris-api-client-panel .tf-field textarea:focus{border-color:var(--brand-line)}
.polaris-api-client-panel .tf-field textarea{min-height:36px;resize:vertical}
.polaris-api-client-panel .custom-hint{padding:4px 10px;font-size:10px;color:var(--brand);background:rgba(255,122,89,.1);border-top:1px solid var(--brand-line)}

/* ===== \u5185\u8054\u4EE3\u7801\u751F\u6210 ===== */
.polaris-api-client-panel .codegen-inline{border-bottom:1px solid var(--line);background:var(--bg-2);flex-shrink:0}
.polaris-api-client-panel .codegen-hd{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--line);font-size:11px}
.polaris-api-client-panel .codegen-langs{display:flex;gap:3px}
.polaris-api-client-panel .lang-btn{height:22px;padding:0 8px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer;font-size:10px;border-radius:3px}
.polaris-api-client-panel .lang-btn:hover{color:var(--ink);border-color:var(--line-2)}
.polaris-api-client-panel .lang-btn.active{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.1)}
.polaris-api-client-panel .codegen-bd{position:relative}
.polaris-api-client-panel .codegen-bd pre{padding:10px;margin:0;font-family:var(--mono);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow:auto;color:var(--ink)}
.polaris-api-client-panel .codegen-copy{position:absolute;top:6px;right:6px;font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--line);cursor:pointer;color:var(--dimmer);background:var(--surface-2)}
.polaris-api-client-panel .codegen-copy:hover{color:var(--ink)}

/* ===== Auth \u9762\u677F ===== */
.polaris-api-client-panel .auth-panel{padding:8px 10px}
.polaris-api-client-panel .auth-panel .seg{display:flex;gap:2px;background:var(--surface);border-radius:5px;padding:2px;margin-bottom:8px}
.polaris-api-client-panel .auth-panel .seg button{height:24px;padding:0 10px;border:none;background:none;color:var(--dim);cursor:pointer;font-size:11px;border-radius:4px}
.polaris-api-client-panel .auth-panel .seg button.on{background:var(--brand);color:var(--brand-ink);font-weight:600}
.polaris-api-client-panel .auth-field{margin-bottom:6px}
.polaris-api-client-panel .auth-field label{display:block;font-size:10px;color:var(--dimmer);margin-bottom:2px}
.polaris-api-client-panel .auth-field input{width:100%;height:28px;padding:0 8px;border-radius:4px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:12px;outline:none}
.polaris-api-client-panel .auth-field input:focus{border-color:var(--brand-line)}
.polaris-api-client-panel .auth-hint{font-size:10px;color:var(--dimmer);padding:4px 0}
.polaris-api-client-panel .gh-hint{font-size:10px;color:var(--dimmer);padding:6px 8px;border-bottom:1px dashed var(--line)}

/* ===== \u54CD\u5E94\u53CC\u89C6\u56FE\u6807\u7B7E ===== */
.polaris-api-client-panel .res-tabs{display:flex;align-items:center;border-bottom:1px solid var(--line);flex-shrink:0;padding:0 10px;background:var(--bg-2)}
.polaris-api-client-panel .res-tab{height:28px;padding:0 12px;border:none;background:none;color:var(--dim);cursor:pointer;font-size:11px;border-bottom:2px solid transparent}
.polaris-api-client-panel .res-tab:hover{color:var(--ink)}
.polaris-api-client-panel .res-tab.active{color:var(--brand);border-bottom-color:var(--brand)}
.polaris-api-client-panel .res-tab-acts{display:flex;align-items:center;gap:4px;margin-left:auto;padding:3px 0}
.polaris-api-client-panel .res-tab-acts .tbtn{height:20px;padding:0 8px;border:1px solid var(--line);background:var(--surface);color:var(--dimmer);cursor:pointer;font-size:10px;border-radius:3px}
.polaris-api-client-panel .res-tab-acts .tbtn:hover{color:var(--ink);border-color:var(--line-2)}
.polaris-api-client-panel .font-sel{height:20px;padding:0 4px;border-radius:3px;border:1px solid var(--line);background:var(--surface);color:var(--dim);font-size:10px}

/* ===== \u670D\u52A1\u5668\u7BA1\u7406 ===== */
.polaris-api-client-panel .srv-row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line)}
.polaris-api-client-panel .srv-input{height:26px;padding:0 6px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink);font-size:11px;outline:none}
.polaris-api-client-panel .srv-input:focus{border-color:var(--brand-line)}
`;var je=document;function Oe(e){je=e||document}var x=(e,t=je)=>t.querySelector(e),U=(e,t=je)=>[...t.querySelectorAll(e)],_=()=>"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7),v=e=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),d=(e,t,n)=>{let o=document.createElement(e);return t&&(o.className=t),n!=null&&(o.innerHTML=n),o},Je=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"],ae=e=>e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB",le=e=>e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s",de=e=>"m-"+e,Be=null;function $(e,t){let n=x("#statusMsg");n&&(n.textContent=e,n.className="msg"+(t?" "+t:""),clearTimeout(Be),t&&(Be=setTimeout(()=>{n.className="msg",n.textContent="\u5C31\u7EEA \xB7 \u7EAF\u524D\u7AEF\u8FD0\u884C\uFF0C\u8DE8\u57DF\u8BF7\u6C42\u53D7\u6D4F\u89C8\u5668 CORS \u7B56\u7565\u9650\u5236"},4500)))}function Pt(e){let t=x("#toast");t&&(t.innerHTML=e,t.classList.add("show"),clearTimeout(t._t),t._t=setTimeout(()=>t.classList.remove("show"),1500))}async function D(e,t){try{await navigator.clipboard.writeText(e)}catch{let o=d("textarea");o.value=e,document.body.appendChild(o),o.select();try{document.execCommand("copy")}catch{}o.remove()}Pt((t||"\u5DF2\u590D\u5236")+" <b>\u2713</b>")}function ye(e){let t=n=>String(n).padStart(2,"0");return e.getFullYear()+"-"+t(e.getMonth()+1)+"-"+t(e.getDate())+" "+t(e.getHours())+":"+t(e.getMinutes())+":"+t(e.getSeconds())}var Fe=/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;function De(e){try{return{ok:!0,value:JSON.parse(e)}}catch{return{ok:!1}}}var we=()=>{},Ee=()=>{};var ke=null;function pe(){ke&&(ke.remove(),ke=null),document.removeEventListener("click",pe),document.removeEventListener("keydown",Ve)}function Ve(e){e.key==="Escape"&&pe()}function Me(e,t){if(!t||!t.trim())return{ok:!0,value:e};let n=t.replace(/\[(\w+)\]/g,".$1").split(".").map(a=>a.trim()).filter(a=>a!==""),o=e;for(let a of n){if(o==null)return{ok:!1};if(Array.isArray(o)){let r=Number(a);if(!Number.isInteger(r)||r<0||r>=o.length)return{ok:!1};o=o[r]}else if(typeof o=="object"){if(!(a in o))return{ok:!1};o=o[a]}else return{ok:!1}}return{ok:!0,value:o}}function Ge(e){let t=[],n=new Set,o=(r,i)=>{if(n.has(r))return;n.add(r);let s="value",l;Array.isArray(i)?(s="array",l=i.length):i&&typeof i=="object"&&(s="object",l=Object.keys(i).length),t.push({path:r,kind:s,count:l})},a=(r,i,s)=>{if(!(t.length>250)){if(Array.isArray(r)){if(r.length){let l=i?i+"[0]":"[0]";o(l,r[0]),r[0]&&typeof r[0]=="object"&&s<4&&a(r[0],l,s+1)}}else if(r&&typeof r=="object")for(let l of Object.keys(r)){let p=i?i+"."+l:l;o(p,r[l]),r[l]&&typeof r[l]=="object"&&s<4&&a(r[l],p,s+1)}}};return o("",e),a(e,"",0),t}var qt=!1;function Ye(e,t){let n;return t!==void 0?n=Rt(JSON.stringify(t,null,2)):e.isBinary?n=v(`[\u4E8C\u8FDB\u5236\u5185\u5BB9 \xB7 ${e.contentType} \xB7 ${ae(e.size)}]`):n=v(e.text),d("pre","raw"+(qt?" wrap":""),n)}function Rt(e){return v(e).replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+\.?\d*(?:[eE][+\-]?\d+)?)/g,(t,n,o,a,r)=>n!=null?`<span class="${o?"tok-key":"tok-str"}">${n}</span>${o||""}`:a!=null?`<span class="tok-bool">${a}</span>`:r!=null?`<span class="tok-num">${r}</span>`:'<span class="tok-null">null</span>')}function He(e){if(!e||!e.trim())return{ast:[],plainText:""};let t=[],n=null,o=[],a="",r=!1,i="";for(let p=0;p<e.length;p++){let c=e[p];r?c===i?r=!1:a+=c:c==='"'||c==="'"?(r=!0,i=c):c===" "?a&&(o.push(a),a=""):a+=c}a&&o.push(a);let s=/^(-?)([*\w.一-鿿-]+)(:|=|==|~|>=|>|<=|<)([\s\S]*)$/;for(let p of o){let c=p.match(s);if(!c){p.startsWith("-")&&p.length>1?t.push({type:"text",value:p.slice(1),negated:!0}):(t.push({type:"text",value:p,negated:!1}),n=n===null?p:n+" "+p);continue}let[h,m,f,u,b]=c,y=m==="-";if(u===":"&&b.startsWith("/")&&b.endsWith("/")&&b.length>1){try{let k=new RegExp(b.slice(1,-1),"i");t.push({type:"field",field:f,op:"~",regex:k,negated:y})}catch{t.push({type:"text",value:p,negated:!1})}continue}if(u==="~"){try{let k=b.startsWith("/")&&b.endsWith("/")?b.slice(1,-1):b,z=new RegExp(k,"i");t.push({type:"field",field:f,op:"~",regex:z,negated:y})}catch{t.push({type:"text",value:p,negated:!1})}continue}if(u===">"||u===">="||u==="<"||u==="<="){let k=Number(b);if(!isNaN(k)){t.push({type:"field",field:f,op:u,numValue:k,negated:y});continue}t.push({type:"text",value:p,negated:!1}),n=n===null?p:n+" "+p;continue}if(u==="="||u==="=="){if(b==="true")t.push({type:"field",field:f,op:"=",boolValue:!0,negated:y});else if(b==="false")t.push({type:"field",field:f,op:"=",boolValue:!1,negated:y});else if(b==="null")t.push({type:"field",field:f,op:"=",nullValue:!0,negated:y});else{let k=Number(b);!isNaN(k)&&String(k)===b?t.push({type:"field",field:f,op:"=",numValue:k,negated:y}):t.push({type:"field",field:f,op:"=",value:b,negated:y})}continue}if(u===":"){b.startsWith("-")&&b.length>1?t.push({type:"field",field:f,op:":",value:b.slice(1),negated:!0}):f==="*"?t.push({type:"wildcard",op:":",value:b,negated:y}):t.push({type:"field",field:f,op:":",value:b,negated:y});continue}}return t.some(p=>p.type==="field"||p.type==="wildcard")&&(n=null),{ast:t,plainText:n||null}}function X(e,t){if(t.type==="text"){let i=String(e==null?"":typeof e=="object"?JSON.stringify(e):e).toLowerCase().includes(t.value.toLowerCase());return t.negated?!i:i}if(t.type==="wildcard"){if(e&&typeof e=="object"){let l=(Array.isArray(e),Object.values(e)).some(p=>String(p==null?"":typeof p=="object"?JSON.stringify(p):p).toLowerCase().includes(t.value.toLowerCase()));return t.negated?!l:l}let i=String(e??"").toLowerCase().includes(t.value.toLowerCase());return t.negated?!i:i}let{field:n,op:o,negated:a}=t,r=e;if(o===":"){let i=String(r==null?"":typeof r=="object"?JSON.stringify(r):r).toLowerCase().includes(t.value.toLowerCase());return a?!i:i}if(o==="="){if(t.boolValue!==void 0){let s=r===!0||r===!1?r===t.boolValue:String(r).toLowerCase()===""+t.boolValue;return a?!s:s}if(t.nullValue){let s=r===null;return a?!s:s}if(t.numValue!==void 0){let s=typeof r=="number"?r===t.numValue:Number(r)===t.numValue;return a?!s:s}let i=String(r??"")===t.value;return a?!i:i}if(o==="~")try{let i=t.regex.test(String(r??""));return a?!i:i}catch{return!1}if(o===">"||o===">="||o==="<"||o==="<="){let i=typeof r=="number"?r:Number(r);if(isNaN(i))return!1;let s;return o===">"?s=i>t.numValue:o===">="?s=i>=t.numValue:o==="<"?s=i<t.numValue:s=i<=t.numValue,a?!s:s}return!0}function It(e,t,n){if(!t.length)return!0;for(let o of t){if(o.type==="text"||o.type==="wildcard"){if(!X(e,o))return!1;continue}if(o.type==="field"){let a=e&&typeof e=="object"&&!Array.isArray(e)?e[o.field]:void 0;if(a===void 0){if(!X(e,o))return!1}else if(!X(a,o))return!1}}return!0}function Ut(e,t,n){if(!n.length)return!0;for(let o of n){if(o.type==="text"){if(Le(e,t,o.value,o.negated))continue;return!1}if(o.type==="wildcard"){if(Xe(e,t,o.value,o.negated))continue;return!1}if(o.type==="field"){if(Ke(e,t,o))continue;return!1}}return!0}function Le(e,t,n,o){let a=n.toLowerCase(),r=!1;return e!=null&&String(e).toLowerCase().includes(a)&&(r=!0),r||(t&&typeof t=="object"?r=(Array.isArray(t)?t.map((s,l)=>[l,s]):Object.entries(t)).some(([s,l])=>Le(s,l,n,!1)):r=String(t??"").toLowerCase().includes(a)),o?!r:r}function Xe(e,t,n,o){let a=n.toLowerCase(),r=!1;return t&&typeof t=="object"?r=(Array.isArray(t)?t.map((s,l)=>[l,s]):Object.entries(t)).some(([s,l])=>String(l==null?"":typeof l=="object"?JSON.stringify(l):l).toLowerCase().includes(a)?!0:l&&typeof l=="object"?Xe(s,l,n,!1):!1):r=String(t??"").toLowerCase().includes(a),o?!r:r}function Ke(e,t,n){let{field:o,op:a,negated:r}=n;return e!=null&&String(e).toLowerCase()===o.toLowerCase()&&X(t,n)?!0:t&&typeof t=="object"?(Array.isArray(t)?t.map((s,l)=>[l,s]):Object.entries(t)).some(([s,l])=>Ke(s,l,n)):!1}function Ze(e){let t=[];for(let n of e)(n.type==="text"||n.type==="wildcard"||n.type==="field"&&n.op===":"||n.type==="field"&&n.op==="="&&n.value)&&t.push(n.value);return t}function ce(e,t){if(!t.length)return v(e);let n=v(e),o=n.toLowerCase(),a=[...t].sort((s,l)=>l.length-s.length),r=[];for(let s of a){let l=s.toLowerCase(),p=0;for(;;){let c=o.indexOf(l,p);if(c<0)break;r.push({s:c,e:c+l.length}),p=c+l.length}}if(!r.length)return n;r.sort((s,l)=>s.s-l.s);let i=[r[0]];for(let s=1;s<r.length;s++){let l=i[i.length-1];r[s].s<=l.e?l.e=Math.max(l.e,r[s].e):i.push(r[s])}for(let s=i.length-1;s>=0;s--){let{s:l,e:p}=i[s];n=n.slice(0,l)+'<span class="hl">'+n.slice(l,p)+"</span>"+n.slice(p)}return n}function Bt(e,t,n,o){let a=new Set(Object.keys(t||{})),r=e.filter(f=>!a.has(f)).length,i=!!n,s=d("div","col-picker"+(i?"":" collapsed")),l=()=>i?"\u25BE":"\u25B8",p=d("button","col-toggle");p.type="button",p.textContent=`\u5217 \xB7 ${r}/${e.length} ${l()}`,p.onclick=()=>{let f=!s.classList.contains("collapsed");s.classList.toggle("collapsed",f),p.textContent=`\u5217 \xB7 ${r}/${e.length} ${f?"\u25B8":"\u25BE"}`,o._saveOpen&&o._saveOpen(!f)},s.appendChild(p);let c=d("div","col-body"),h=d("button","col-q","\u5168\u9009");h.type="button";let m=d("button","col-q","\u5168\u4E0D\u9009");return m.type="button",h.onclick=()=>o({}),m.onclick=()=>{let f={};e.forEach(u=>f[u]=!0),o(f)},c.append(h,m),e.forEach(f=>{let u=!a.has(f),b=d("button","col-chip"+(u?" on":""));b.type="button",b.textContent=f,b.draggable=!0,b.onclick=()=>{let y={...t||{}};y[f]?delete y[f]:y[f]=!0,o(y)},b.addEventListener("dragstart",y=>{y.dataTransfer.setData("text/plain",f),y.dataTransfer.effectAllowed="move",b.classList.add("dragging")}),b.addEventListener("dragend",()=>b.classList.remove("dragging")),b.addEventListener("dragover",y=>{y.preventDefault(),y.dataTransfer.dropEffect="move",b.classList.add("drag-over")}),b.addEventListener("dragleave",()=>b.classList.remove("drag-over")),b.addEventListener("drop",y=>{y.preventDefault(),b.classList.remove("drag-over");let k=y.dataTransfer.getData("text/plain");if(!k||k===f)return;let z=[...e];z.splice(z.indexOf(k),1),z.splice(z.indexOf(f),0,k),o({...t||{}},z)}),c.appendChild(b)}),s.appendChild(c),s}function Qe(e,t){let n=d("div","jtree");if(e===void 0)return n.innerHTML='<span class="dimnote">\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u65E0\u6CD5\u4EE5\u5BF9\u8C61\u6811\u5C55\u793A\u3002\u8BF7\u5207\u5230\u300C\u539F\u59CB\u300D\u3002</span>',n;let o=(t.respFilter||"").trim(),{ast:a,plainText:r}=He(o),i=r!==null?r.toLowerCase():o?o.toLowerCase():"",s=Ze(a),l={q:i,ast:a,hlTerms:s,pretty:t.prettyCells!==!1,openAll:t.treeOpen||"auto"},p=tt(null,e,0,l);return p?n.appendChild(p):n.innerHTML='<div class="dimnote">\u65E0\u5339\u914D\u300C'+v(i)+"\u300D\u7684\u5B57\u6BB5\u3002</div>",n}function et(e,t,n){return!n||e!=null&&String(e).toLowerCase().includes(n)?!0:t&&typeof t=="object"?(Array.isArray(t)?t.map((a,r)=>[r,a]):Object.entries(t)).some(([a,r])=>et(a,r,n)):String(t).toLowerCase().includes(n)}function ue(e,t){if(e=v(e),!t)return e;let n=e.toLowerCase().indexOf(t);return n<0?e:e.slice(0,n)+'<span class="hl">'+e.slice(n,n+t.length)+"</span>"+e.slice(n+t.length)}function Jt(e,t,n,o,a){if(e===null)return'<span class="jt-null">null</span>';let r=typeof e;if(o&&r==="string"&&nt(e))return`<img class="cell-img" src="${v(e)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('\u{1F5BC}'))"><span class="cell-imn">${v(ot(e))}</span>`;if(o){let i=rt(n,e);if(i)return`<span class="cell-ts">\u{1F553} ${v(ye(i.date))}</span> <span class="jt-prev">(${v(at(e))})</span>`}return r==="string"?`<span class="jt-str">"${a&&a.length?ce(e,a):ue(e,t)}"</span>`:r==="number"?`<span class="jt-num">${a&&a.length?ce(String(e),a):ue(String(e),t)}</span>`:r==="boolean"?`<span class="jt-bool">${e}</span>`:v(String(e))}function tt(e,t,n,o){let a=o.q,r=o.ast;if(r&&r.length){if(!Ut(e,t,r))return null}else if(a&&!et(e,t,a))return null;let i=d("div","jt-node"),s=t&&typeof t=="object",l=o.hlTerms,p=e!=null?`<span class="jt-key">${l&&l.length?ce(String(e),l):ue(String(e),a)}</span><span class="jt-colon">: </span>`:"";if(!s){let O=d("div","jt-row");return O.innerHTML=p+Jt(t,a,e,o.pretty,l)+'<span class="jt-act"><b data-act="copy">copy</b></span>',O.querySelector("[data-act=copy]").onclick=()=>D(typeof t=="string"?t:JSON.stringify(t),"\u5DF2\u590D\u5236"),i.appendChild(O),i}let c=Array.isArray(t),h=c?t.map((O,C)=>[C,O]):Object.entries(t),m=o.openAll==="all"?!0:o.openAll==="none"?!1:a?!0:n<1,f=c?`[\u2026] ${h.length} \u9879`:`{\u2026} ${h.length} \u952E`,u=d("div","jt-row expandable");u.innerHTML=`<span class="jt-tog">${m?"\u25BE":"\u25B8"}</span>${p}<span class="jt-prev">${c?"[":"{"}</span><span class="jt-prev" data-prev>${m?"":" "+f+" "}</span><span class="jt-act"><b data-act="copy">copy</b></span>`;let b=d("div","jt-children"+(m?"":" hide"));h.forEach(([O,C])=>{let T=tt(O,C,n+1,o);T&&b.appendChild(T)});let y=d("div","jt-row");y.innerHTML=`<span class="jt-prev" style="padding-left:0">${c?"]":"}"}</span>`,b.appendChild(y);let k=u.querySelector(".jt-tog"),z=u.querySelector("[data-prev]");return u.addEventListener("click",O=>{if(O.target.dataset.act)return;let C=b.classList.toggle("hide");k.textContent=C?"\u25B8":"\u25BE",z.textContent=C?" "+f+" ":""}),u.querySelector("[data-act=copy]").onclick=O=>{O.stopPropagation(),D(JSON.stringify(t,null,2),"\u8282\u70B9\u5DF2\u590D\u5236")},i.append(u,b),i}var Ft=/^(?:https?:)?\/\/[^\s'"]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#][^\s'"]*)?$/i;function nt(e){return typeof e!="string"?!1:(e=e.trim(),/^data:image\//i.test(e)||Ft.test(e))}function We(e){return e==null?!1:/(_at\b|\bat$|date|time|timestamp|\bts\b|created|updated|modified|expire|publish|issued|deleted|lastseen|lastlogin|epoch)/i.test(String(e))}function rt(e,t){if(typeof t=="string"){let n=t.trim();if(/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+\-]\d{2}:?\d{2})?)?$/.test(n)){let o=new Date(n);if(!isNaN(+o))return{date:o}}if(We(e)&&/^\d{10}$|^\d{13}$/.test(n)){let o=Number(n),a=new Date(n.length===13?o:o*1e3);if(!isNaN(+a))return{date:a}}return null}if(typeof t=="number"&&We(e)&&isFinite(t)){if(t>=1e12&&t<4e12)return{date:new Date(t)};if(t>=1e9&&t<4e9)return{date:new Date(t*1e3)}}return null}function ot(e){if(/^data:/i.test(e))return"\u5185\u5D4C\u56FE\u7247";try{let t=new URL(e,location.href);return decodeURIComponent(t.pathname.split("/").pop()||e).slice(0,42)}catch{return String(e).split(/[?#]/)[0].split("/").pop().slice(0,42)}}function at(e){return e===null?"null":e===void 0?"":typeof e=="object"?JSON.stringify(e):String(e)}function Dt(e,t,n,o,a){let r=at(e);if(e===null)return{html:'<span class="cell-null">null</span>',full:r};if(e===void 0)return{html:'<span class="cell-null">\u2014</span>',full:""};if(typeof e=="object"){let s=JSON.stringify(e);return{html:`<span class="cobj">${v(s)}</span>`,full:s}}if(o&&typeof e=="string"&&nt(e))return{html:`<img class="cell-img" src="${v(e)}" alt="" loading="lazy" onerror="this.style.display='none'"><span class="cell-imn">${v(ot(e))}</span>`,full:e};if(o){let s=rt(n,e);if(s)return{html:`<span class="cell-ts">\u{1F553} ${v(ye(s.date))}</span>`,full:r+"  \xB7  "+ye(s.date)}}let i=a&&a.length?ce(String(e),a):ue(String(e),t);return typeof e=="number"?{html:`<span class="cell-num">${i}</span>`,full:r}:typeof e=="boolean"?{html:`<span class="cell-bool">${e}</span>`,full:r}:{html:`<span class="cell-str">${i}</span>`,full:r}}function Wt(e){let t=[];if(Array.isArray(e))return t.push({label:"\u6839\u6570\u7EC4",path:"",data:e,count:e.length}),t;if(e&&typeof e=="object"){let n=(o,a,r)=>{for(let[i,s]of Object.entries(o)){let l=a?a+"."+i:i;Array.isArray(s)?t.push({label:l,path:l,data:s,count:s.length}):s&&typeof s=="object"&&r<1&&n(s,l,r+1)}};n(e,"",0),t.push({label:"\u5BF9\u8C61\u672C\u8EAB(\u952E\u503C)",path:"__self",data:e,count:Object.keys(e).length})}return t}function Vt(e,t){return t?Object.values(e).some(n=>String(typeof n=="object"?JSON.stringify(n):n).toLowerCase().includes(t)):!0}function Gt(e,t,n){return!t.length&&!n?!0:t.length?It(e,t):Vt(e,n)}function it(e,t){let n=d("div","tbl-host"),o=Wt(e),a=o.find(C=>C.path===t.tableSel)||o[0];if(o.length>1){let C=d("div","tbl-cands");C.appendChild(d("span","lab","\u8868\u683C")),o.forEach(T=>{let E=d("button","tcand"+(T===a?" on":""),`${v(T.label)} <em>${T.count}</em>`);E.onclick=()=>{t.tableSel=T.path,we(),(t.rerender||Ee)()},C.appendChild(E)}),n.appendChild(C)}if(!a)return n.appendChild(d("div","prev-none","\u65E0\u53EF\u8868\u683C\u5316\u7684\u6570\u636E\u3002")),n;let r=(t.respFilter||"").trim(),{ast:i,plainText:s}=He(r),l=s!==null?s.toLowerCase():r.toLowerCase(),p=Ze(i),c=t.prettyCells!==!1,h=a.path||"__root",m=d("div","tbl-wrap"),f=a.data,u=d("table","dt"),b=d("thead"),y=d("tbody"),k=(C,T)=>{let E=Dt(C,l,T,c,p);return`<td data-full="${v(E.full)}">${E.html}</td>`},z=t.sort&&t.sort[h]||null,O="";if(Array.isArray(f)&&a.path!=="__self")if(f.length&&f.every(T=>T&&typeof T=="object"&&!Array.isArray(T))){let T=[];f.forEach(M=>Object.keys(M).forEach(A=>{T.includes(A)||T.push(A)}));let E=t.colOrder&&t.colOrder[h]||[];if(E.length){let M=E.filter(P=>T.includes(P)),A=T.filter(P=>!E.includes(P));T=M.concat(A)}let N=t.hiddenCols&&t.hiddenCols[h]||{},H=T.filter(M=>!N[M]);if(T.length>=4){let M=!!(t._pickerOpen&&t._pickerOpen[h]),A=(P,I)=>{t.hiddenCols||(t.hiddenCols={}),t.hiddenCols[h]=P,I&&(t.colOrder||(t.colOrder={}),t.colOrder[h]=I),we(),(t.rerender||Ee)()};A._saveOpen=P=>{t._pickerOpen||(t._pickerOpen={}),t._pickerOpen[h]=P},n.appendChild(Bt(T,N,M,A))}let R=[];f.forEach((M,A)=>{Gt(M,i,l)&&R.push({o:M,i:A})});let S=R;if(z&&z.col){let{col:M,dir:A}=z;S=[...R].sort((P,I)=>{let J=P.o[M],Y=I.o[M];if(J==null&&Y==null)return 0;if(J==null)return 1;if(Y==null)return-1;if(typeof J=="number"&&typeof Y=="number")return A==="asc"?J-Y:Y-J;let F=String(J).localeCompare(String(Y));return A==="asc"?F:-F})}b.innerHTML='<tr><th class="idx">#</th>'+H.map(M=>{let A="",P="";return z&&z.col===M&&(A=z.dir==="asc"?" sort-asc":" sort-desc",P=z.dir==="asc"?" \u25B2":" \u25BC"),`<th class="sortable${A}" data-col="${v(M)}">${v(M)}${P}</th>`}).join("")+"</tr>",b.addEventListener("click",M=>{let A=M.target.closest("th[data-col]");if(!A)return;let P=A.dataset.col;t.sort||(t.sort={});let I=t.sort[h],J="asc";I&&I.col===P&&(J=I.dir==="asc"?"desc":I.dir==="desc"?null:"asc"),J?t.sort[h]={col:P,dir:J}:delete t.sort[h],we(),(t.rerender||Ee)()}),S.forEach(({o:M,i:A})=>{let P=d("tr");P.innerHTML=`<td class="idx">${A}</td>`+H.map(I=>k(M[I],I)).join(""),y.appendChild(P)});let G=H.length;O=`\u6570\u7EC4 \xB7 ${S.length}/${f.length} \u884C \xD7 ${G} \u5217`,(l||r)&&(O+=` \xB7 \u8FC7\u6EE4\u300C${v(r)}\u300D`),z&&z.col&&(O+=` \xB7 \u6309 ${z.col} ${z.dir==="asc"?"\u5347\u5E8F":"\u964D\u5E8F"}`),H.length<T.length&&(O+=` \xB7 \u9690\u85CF ${T.length-H.length} \u5217`)}else{b.innerHTML='<tr><th class="idx">#</th><th>value</th></tr>';let T=0;f.forEach((E,N)=>{let H=String(typeof E=="object"?JSON.stringify(E):E).toLowerCase(),R=!0;if(i.length?R=X(E,i[0])&&i.slice(1).every(G=>X(E,G)):l&&!H.includes(l)&&(R=!1),!R)return;T++;let S=d("tr");S.innerHTML=`<td class="idx">${N}</td>`+k(E,null),y.appendChild(S)}),O=`\u6570\u7EC4 \xB7 ${T}/${f.length} \u9879\uFF08\u57FA\u7840/\u6DF7\u5408\u7C7B\u578B\uFF09`}else{b.innerHTML="<tr><th>key</th><th>value</th></tr>";let C=0,T=0;Object.entries(f).forEach(([E,N])=>{T++;let H=!0;if(i.length){for(let S of i)if(S.type==="field"){if(String(E).toLowerCase()===(S.field||"").toLowerCase()){if(!X(N,S)){H=!1;break}}else if(!X(N,S)&&!Le(E,N,S.type==="text"?S.value:S.value||"",S.negated)){H=!1;break}}else if(!Le(E,N,S.type==="text"?S.value:S.value||"",S.negated)){H=!1;break}}else l&&!(E.toLowerCase().includes(l)||String(typeof N=="object"?JSON.stringify(N):N).toLowerCase().includes(l))&&(H=!1);if(!H)return;C++;let R=d("tr");R.innerHTML=`<td style="color:var(--j-key)">${p&&p.length?ce(E,p):ue(E,l)}</td>`+k(N,E),y.appendChild(R)}),O=`\u5BF9\u8C61 \xB7 ${C}/${T} \u4E2A\u5B57\u6BB5`}return u.append(b,y),Yt(u,t,h),u.addEventListener("contextmenu",C=>{let T=C.target.closest("td");if(!T||T.classList.contains("idx"))return;C.preventDefault(),pe();let E=x("#cellTip");E&&E.classList.remove("show");let N=d("div","db-ctx");ke=N;function H($t,_t){let Ie=d("button","db-ctx-item",$t);Ie.onclick=Nt=>{Nt.stopPropagation(),pe(),_t()},N.appendChild(Ie)}function R(){N.appendChild(d("div","db-ctx-sep"))}let S=T.dataset.full!=null?T.dataset.full:T.textContent;H("\u590D\u5236\u503C",()=>D(S,"\u5DF2\u590D\u5236"));let G=T.cellIndex,M=b.rows[0],A=M&&M.cells[G];A&&A.dataset.col&&(R(),H("\u590D\u5236\u5217\u540D",()=>D(A.dataset.col,"\u5DF2\u590D\u5236\u5217\u540D"))),document.body.appendChild(N),requestAnimationFrame(()=>{document.addEventListener("click",pe),document.addEventListener("keydown",Ve)});let P=N.offsetWidth,I=N.offsetHeight,J=innerWidth,Y=innerHeight,F=6;N.style.left=(C.clientX+P+F>J?Math.max(F,C.clientX-P-F):C.clientX+F)+"px",N.style.top=(C.clientY+I+F>Y?Math.max(F,C.clientY-I-F):C.clientY+F)+"px"}),O&&n.appendChild(d("div","tbl-note",O)),m.appendChild(u),n.appendChild(m),n}function Yt(e,t,n){t.colW||(t.colW={});let o=e.tHead;if(!o||!o.rows.length)return;let a=[...o.rows[0].cells],r=d("colgroup");a.forEach(()=>r.appendChild(d("col"))),e.insertBefore(r,o);let i=[...r.children],s=t.colW[n];s&&(e.style.tableLayout="fixed",a.forEach((l,p)=>{s[p]!=null&&(i[p].style.width=s[p]+"px")})),a.forEach((l,p)=>{let c=d("span","col-grip");c.title="\u62D6\u52A8\u8C03\u6574\u5217\u5BBD",l.appendChild(c),c.addEventListener("mousedown",h=>{h.preventDefault(),h.stopPropagation(),e.style.tableLayout!=="fixed"&&(a.forEach((y,k)=>i[k].style.width=y.getBoundingClientRect().width+"px"),e.style.tableLayout="fixed");let m=h.clientX,f=l.getBoundingClientRect().width,u=y=>{i[p].style.width=Math.max(46,Math.min(1600,f+(y.clientX-m)))+"px"},b=()=>{document.removeEventListener("mousemove",u),document.removeEventListener("mouseup",b),document.body.style.cursor="",document.body.style.userSelect="";let y=t.colW[n]||(t.colW[n]={});a.forEach((k,z)=>y[z]=Math.round(k.getBoundingClientRect().width)),we()};document.body.style.cursor="col-resize",document.body.style.userSelect="none",document.addEventListener("mousemove",u),document.addEventListener("mouseup",b)})})}function st(e,t,n){let o=d("div","ti filter");o.innerHTML='<span class="lbl">\u8FC7\u6EE4</span>';let a=d("div","fb-bar"),r=d("input","fb-edit");r.type="text",r.placeholder="\u7B5B\u9009\u884C/\u5B57\u6BB5\u2026 \u652F\u6301 name:\u503C id>1 role:true",r.value=e.respFilter||"",r.spellcheck=!1;let i=d("div","fb-tokens"),s=d("div","fb-ac"),l=!1;function p(){l=!1,s.classList.remove("open"),s.innerHTML=""}function c(m){if(!m.length){p();return}s.innerHTML="",m.slice(0,12).forEach(f=>{let u=d("button","fb-ac-item");u.type="button",u.textContent=f,u.onclick=()=>{r.value+=f,r.focus(),p(),t()},s.appendChild(u)}),s.classList.add("open"),l=!0}function h(){i.innerHTML="";let m=(r.value||"").trim();if(!m){i.style.display="none";return}i.style.display="flex";let{ast:f}=He(m);for(let u of f){let b=d("span","ftk");if(u.type==="text")u.negated?b.innerHTML='<span class="ftk-neg">-</span><span class="ftk-val">'+v(u.value)+"</span>":b.innerHTML='<span class="ftk-val">'+v(u.value)+"</span>";else if(u.type==="wildcard")b.innerHTML='<span class="ftk-field">*</span><span class="ftk-op">:</span><span class="ftk-val">'+v(u.value)+"</span>";else if(u.type==="field"){let y="ftk-val",k=v(u.value||"");u.numValue!==void 0?(y="ftk-num",k=v(String(u.numValue))):u.boolValue!==void 0?(y="ftk-bool",k=v(String(u.boolValue))):u.nullValue?(y="ftk-null",k="null"):u.regex&&(y="ftk-val",k="/"+v(u.regex.source)+"/");let z=u.negated?'<span class="ftk-neg">-</span>':"";b.innerHTML=z+'<span class="ftk-field">'+v(u.field)+'</span><span class="ftk-op">'+v(u.op)+'</span><span class="'+y+'">'+k+"</span>"}i.appendChild(b)}}return r.addEventListener("input",()=>{e.respFilter=r.value,h();let m=r.value,f=r.selectionStart;if(n&&n.length){let u=m.slice(0,f),b=u.lastIndexOf(" "),k=u.slice(b+1).match(/^(-?)([\w.一-鿿-]*)$/);if(k&&k[2].length>0){let z=k[2].toLowerCase(),O=n.filter(C=>C.toLowerCase().startsWith(z)&&C.toLowerCase()!==z);O.length?c(O):p()}else p()}t()}),r.addEventListener("keydown",m=>{m.key==="Escape"&&p(),m.key==="Enter"&&(m.preventDefault(),p(),t())}),a.addEventListener("click",m=>{(m.target===a||m.target===i)&&r.focus()}),document.addEventListener("click",m=>{a.contains(m.target)||p()}),h(),a.append(i,r,s),o.appendChild(a),o}function dt(e){let t=Xt(e.trim());t[0]==="curl"&&t.shift();let n=[],o=null,a="",r=[],i=!1;for(let f=0;f<t.length;f++){let u=t[f],b=()=>t[++f]||"";if(u==="-X"||u==="--request")o=b()||"GET";else if(u.startsWith("-X")&&u.length>2)o=u.slice(2);else if(u==="-H"||u==="--header")lt(n,b());else if(u.startsWith("-H")&&u.length>2)lt(n,u.slice(2));else if(["-d","--data","--data-raw","--data-ascii","--data-binary","--data-urlencode"].includes(u))r.push(b());else if(u.startsWith("-d")&&u.length>2)r.push(u.slice(2));else if(u==="-u"||u==="--user")try{n.push({id:K(),enabled:!0,key:"Authorization",value:"Basic "+btoa(b())})}catch{}else u==="-b"||u==="--cookie"?n.push({id:K(),enabled:!0,key:"Cookie",value:b()}):u==="-A"||u==="--user-agent"?n.push({id:K(),enabled:!0,key:"User-Agent",value:b()}):u==="-e"||u==="--referer"?n.push({id:K(),enabled:!0,key:"Referer",value:b()}):u==="-G"||u==="--get"?i=!0:u==="--url"?a=b():["--compressed","-L","--location","-k","--insecure","-s","--silent","-S","--show-error","-i","--include","-v","--verbose","-f","--fail","-#","--progress-bar","-N","--no-buffer"].includes(u)||u.startsWith("-")||a||(a=u)}o||(o=r.length&&!i?"POST":"GET"),o=o.toUpperCase();let s=r.join("&");i&&s&&(a+=(a.includes("?")?"&":"?")+s,s="");let l=n.find(f=>f.key.toLowerCase()==="content-type"),p="none";if(s&&(l&&/json/i.test(l.value)||/^\s*[\[{]/.test(s)?p="json":p="text"),p==="json")try{s=JSON.stringify(JSON.parse(s),null,2)}catch{}let c=[],h=a,m=a.indexOf("?");return m>=0&&(h=a.slice(0,m),a.slice(m+1).split("&").forEach(f=>{if(!f)return;let u=f.indexOf("=");c.push({id:K(),enabled:!0,key:decodeURIComponent(u>=0?f.slice(0,u):f),value:decodeURIComponent(u>=0?f.slice(u+1):"")})})),c.push({id:K(),enabled:!0,key:"",value:""}),{method:o,url:h,headers:n,params:c,body:s,bodyType:p}}function Xt(e){e=e.replace(/\\\r?\n/g," ");let t=[],n="",o=null,a=!1;for(let r=0;r<e.length;r++){let i=e[r];o?i===o?o=null:i==="\\"&&o==='"'?n+=e[++r]||"":n+=i:i==='"'||i==="'"?(o=i,a=!0):i===" "||i==="	"||i===`
`||i==="\r"?a&&(t.push(n),n="",a=!1):(n+=i,a=!0)}return a&&t.push(n),t}function lt(e,t){let n=t.indexOf(":");if(n<0){e.push({id:K(),enabled:!0,key:t.trim(),value:""});return}e.push({id:K(),enabled:!0,key:t.slice(0,n).trim(),value:t.slice(n+1).trim()})}function K(){return"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}function Te(e,t){let n=l=>t?resolveVars(l,t):l,o=l=>"'"+String(l).replace(/'/g,"'\\''")+"'",a=n(e.url||"");/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(a)||(a="https://"+a);let r=["curl -X "+e.method+" "+o(a)],i={};e.headers&&e.headers.filter(l=>l.enabled!==!1&&l.key).forEach(l=>i[n(l.key)]=n(l.value));let s=null;return["GET","HEAD"].includes(e.method)||(e.bodyType==="json"?(s=n(e.body||""),Object.keys(i).some(l=>l.toLowerCase()==="content-type")||(i["Content-Type"]="application/json")):e.bodyType==="text"?s=n(e.body||""):e.bodyType==="form"&&Array.isArray(e.formBody)&&(s=e.formBody.filter(l=>l.enabled!==!1&&l.key).map(l=>encodeURIComponent(n(l.key))+"="+encodeURIComponent(n(l.value||""))).join("&"))),Object.entries(i).forEach(([l,p])=>r.push("-H "+o(l+": "+p))),s&&r.push("--data-raw "+o(s)),r.join(` \\
  `)}function pt(e,t,n){let o=p=>n?resolveVars(p,n):p,a=o(e.url||"");/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(a)||(a="https://"+a);let r={};e.headers&&e.headers.filter(p=>p.enabled!==!1&&p.key).forEach(p=>r[o(p.key)]=o(p.value));let i=(e.method||"GET").toUpperCase(),s=null;["GET","HEAD"].includes(i)||(e.bodyType==="json"||e.bodyType==="text")&&(s=o(e.body||""));let l={curl:Te(e,n),python:`import requests

url = ${JSON.stringify(a)}
headers = ${JSON.stringify(r)}
response = requests.${i.toLowerCase()}(url, headers=headers${s?", json="+s:""})
print(response.json())`,js:`const response = await fetch(${JSON.stringify(a)}, {
  method: ${JSON.stringify(i)},
  headers: ${JSON.stringify(r)}
${s?",  body: "+JSON.stringify(s):""}
})
const data = await response.json()
console.log(data)`,go:`package main

import (
  "fmt"
  "io/ioutil"
  "net/http"
)

func main() {
  url := ${JSON.stringify(a)}
  req, _ := http.NewRequest(${JSON.stringify(i)}, url, nil)
  ${Object.entries(r).map(([p,c])=>`req.Header.Set(${JSON.stringify(p)}, ${JSON.stringify(c)})`).join(`
  `)}
  client := &http.Client{}
  resp, _ := client.Do(req)
  body, _ := ioutil.ReadAll(resp.Body)
  fmt.Println(string(body))
}`,rust:`use reqwest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let client = reqwest::Client::new();
  let resp = client.${i.toLowerCase()}(${JSON.stringify(a)})${Object.entries(r).map(([p,c])=>`
    .header(${JSON.stringify(p)}, ${JSON.stringify(c)})`).join("")}
    .send().await?;
  println!("{:#?}", resp.text().await?);
  Ok(())
}`};return l[t]||l.curl}var ct={tabs:"polaris.http.tabs.v2",collections:"polaris.http.collections.v2",envs:"polaris.http.envs.v2",ui:"polaris.http.ui.v2",history:"polaris.http.history.v2",templates:"polaris.http.templates.v2",globalHeaders:"polaris.http.globalHeaders.v2",servers:"polaris.http.servers.v2"},fe=e=>e===void 0?void 0:JSON.parse(JSON.stringify(e)),$e=class{constructor(){this._listeners={},this._data={},this._loadAll()}_loadAll(){for(let[t,n]of Object.entries(ct))try{let o=localStorage.getItem(n);this._data[t]=o?JSON.parse(o):void 0}catch{this._data[t]=void 0}}get(t){return fe(this._data[t])}set(t,n){this._data[t]=fe(n);try{localStorage.setItem(ct[t],JSON.stringify(this._data[t]))}catch{}this._emit(t,fe(n))}update(t,n){let o=this._data[t];o&&typeof o=="object"?this.set(t,{...o,...n}):this.set(t,n)}subscribe(t,n){return(this._listeners[t]||=[]).push(n),()=>{let o=this._listeners[t];o&&(this._listeners[t]=o.filter(a=>a!==n))}}_emit(t,n){(this._listeners[t]||[]).forEach(o=>{try{o(n)}catch(a){console.error("[polaris-http store]",a)}})}},_e=new $e;var bt="pac.tabs.v2",xt="pac.collections.v2",ht="pac.envs.v2",mt="pac.ui.v2",gt="pac.servers.v2",vt="pac.templates.v2",g={tabs:[],activeTab:null,collections:[],envs:[],activeEnv:null},L={sideCollapsed:!1,layout:"v",reqH:240,reqW:520,proxyOn:!1,resFont:13,resTab:"data",mode:"http",curLang:"curl",fullscreen:!1},W=[],ee=[],xe=!1,yt="http://127.0.0.1:9861",Ce=!1,Pe=null;function wt(e,t){xe=!!e,t&&(yt=t),e&&(L.proxyOn=!0)}var q=()=>({id:_(),on:!0,k:"",v:""});function ie(e){return Object.assign({id:_(),name:"\u672A\u547D\u540D\u8BF7\u6C42",savedId:null,dirty:!1,method:"GET",url:"",params:[q()],headers:[q()],bodyType:"none",body:"",formBody:[q()],authType:"bearer",authToken:"",authUsername:"",authPassword:"",reqTab:"params",respView:"object",respPath:"",respFilter:"",tableSel:null,prettyCells:!0,colW:{},treeOpen:"auto",hiddenCols:{},sort:{},colOrder:{},response:null,_templateId:null,_formData:null},e||{})}var j=()=>g.tabs.find(e=>e.id===g.activeTab);function w(){let e=g.tabs.map(t=>{let n={...t};return delete n.response,n});try{localStorage.setItem(bt,JSON.stringify({tabs:e,activeTab:g.activeTab})),localStorage.setItem(xt,JSON.stringify(g.collections)),localStorage.setItem(ht,JSON.stringify({envs:g.envs,activeEnv:g.activeEnv})),localStorage.setItem(mt,JSON.stringify(L)),localStorage.setItem(gt,JSON.stringify(W)),localStorage.setItem(vt,JSON.stringify(ee))}catch(t){$("\u672C\u5730\u4FDD\u5B58\u5931\u8D25\uFF1A"+t.message,"err")}}function Kt(){try{let e=JSON.parse(localStorage.getItem(bt)||"null");e&&e.tabs&&e.tabs.length&&(g.tabs=e.tabs.map(t=>ie(t)),g.activeTab=e.activeTab)}catch{}try{let e=JSON.parse(localStorage.getItem(xt)||"null");Array.isArray(e)&&(g.collections=e)}catch{}try{let e=JSON.parse(localStorage.getItem(ht)||"null");e&&(g.envs=e.envs||[],g.activeEnv=e.activeEnv||null)}catch{}try{let e=JSON.parse(localStorage.getItem(mt)||"null");e&&(L=Object.assign(L,e))}catch{}try{let e=JSON.parse(localStorage.getItem(gt)||"null");Array.isArray(e)&&(W=e)}catch{}try{let e=JSON.parse(localStorage.getItem(vt)||"null");Array.isArray(e)&&(ee=e)}catch{}if((!g.collections.length||!g.envs.length)&&Zt(),!g.tabs.length){let e=ie();g.tabs=[e],g.activeTab=e.id}j()||(g.activeTab=g.tabs[0].id)}function Ne(e,t,n,o){return Object.assign({id:_(),name:e,method:t,url:n,params:[q()],headers:[q()],bodyType:"none",body:"",formBody:[q()]},o||{})}function Zt(){if(!g.envs.length){let e={id:_(),name:"Demo \xB7 jsonplaceholder",baseUrl:"https://jsonplaceholder.typicode.com",vars:[{id:_(),on:!0,k:"token",v:"demo-token-123"}]},t={id:_(),name:"\u672C\u5730 Local",baseUrl:"http://127.0.0.1:8080",vars:[q()]};g.envs=[e,t],g.activeEnv=e.id}g.collections.length||(g.collections=[{id:_(),name:"\u793A\u4F8B \xB7 DEMO",collapsed:!1,requests:[Ne("\u7528\u6237\u5217\u8868","GET","{{baseUrl}}/users"),Ne("\u5355\u4E2A Todo","GET","{{baseUrl}}/todos/1"),Ne("\u65B0\u5EFA Post","POST","{{baseUrl}}/posts",{bodyType:"json",body:JSON.stringify({title:"hello",body:"world",userId:1},null,2),headers:[{id:_(),on:!0,k:"Authorization",v:"Bearer {{token}}"},q()]})]}]),W.length||(W=[{id:_(),name:"\u751F\u4EA7\u73AF\u5883",url:"https://api.example.com"},{id:_(),name:"\u6D4B\u8BD5\u73AF\u5883",url:"https://test-api.example.com"},{id:_(),name:"\u672C\u5730\u5F00\u53D1",url:"http://localhost:8080"}]),ee.length||(ee=[{id:_(),name:"\u521B\u5EFA\u7528\u6237",method:"POST",url:"/api/users",bodyType:"json",bodyFields:[{name:"name",label:"\u7528\u6237\u540D",type:"text",required:!0},{name:"email",label:"\u90AE\u7BB1",type:"text",required:!0},{name:"age",label:"\u5E74\u9F84",type:"number",required:!1}]},{id:_(),name:"\u67E5\u8BE2\u7528\u6237",method:"GET",url:"/api/users/{id}",bodyType:"none",bodyFields:[{name:"id",label:"\u7528\u6237 ID",type:"number",required:!0}]}])}function me(){return g.envs.find(e=>e.id===g.activeEnv)}function Z(e){if(e==null||String(e).indexOf("{{")<0)return e;let t=me();return String(e).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g,(n,o)=>{if(o.startsWith("$"))return Qt(o);if(!t)return n;if(o==="baseUrl")return t.baseUrl||"";let a=(t.vars||[]).find(r=>r.on&&r.k===o);return a?a.v:n})}function Qt(e){switch(e){case"$guid":case"$uuid":return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,t=>(t==="x"?Math.random()*16|0:Math.random()*16|0|8).toString(16));case"$timestamp":return String(Math.floor(Date.now()/1e3));case"$timestampMs":return String(Date.now());case"$isoTimestamp":return new Date().toISOString();case"$randomInt":return String(Math.floor(Math.random()*1e4));case"$randomFloat":return String(Math.random().toFixed(4));case"$localDate":return new Date().toISOString().slice(0,10);case"$localTime":return new Date().toTimeString().slice(0,8);default:return"{{"+e+"}}"}}function en(){let e=x("#methodMenu");e&&Je.forEach(t=>{let n=d("button",de(t),t);n.onclick=()=>{let o=j();o.method=t,B(o),x("#methodMenu").classList.remove("open"),re(),te(),w()},e.appendChild(n)})}function tn(){let e=x("#methodSel");e&&(e.onclick=n=>{n.stopPropagation(),x("#methodMenu").classList.toggle("open")});let t=x("#envSel");t&&(t.onclick=n=>{n.stopPropagation(),x("#envMenu").classList.toggle("open")}),document.addEventListener("click",()=>{let n=x("#methodMenu");n&&n.classList.remove("open");let o=x("#envMenu");o&&o.classList.remove("open"),U(".path-menu").forEach(a=>a.classList.remove("open"))})}function V(){let e=x("#tree");e.innerHTML="";let t=(x("#search").value||"").toLowerCase().trim(),n=0,o=0;g.collections.length||e.appendChild(d("div","tree-empty","\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5206\u7EC4\u3002<br>\u70B9\u51FB\u53F3\u4E0A\u89D2 \uFF0B \u65B0\u5EFA\u4E00\u4E2A\u3002")),g.collections.forEach(a=>{let r=a.requests.filter(f=>!t||f.name.toLowerCase().includes(t)||f.url.toLowerCase().includes(t));if(n+=a.requests.length,t&&!r.length&&!a.name.toLowerCase().includes(t))return;let i=t?r:a.requests;o+=i.length;let s=d("div","group"+(a.collapsed&&!t?" collapsed":"")),l=d("div","group-head");l.innerHTML=`<span class="caret">\u25BC</span><span class="gname">${v(a.name)}</span><span class="gcount">${a.requests.length}</span>`;let p=d("span","gact"),c=d("button","x","\u270E");c.title="\u91CD\u547D\u540D",c.onclick=f=>{f.stopPropagation(),yn(a)};let h=d("button","x","\u{1F5D1}");h.title="\u5220\u9664\u5206\u7EC4",h.onclick=f=>{f.stopPropagation(),wn(a)},p.append(c,h),l.appendChild(p),l.onclick=()=>{a.collapsed=!a.collapsed,w(),V()},s.appendChild(l);let m=d("div","reqs");i.forEach(f=>{let u=d("div","req-item"+(j()&&j().savedId===f.id?" active":""));u.innerHTML=`<span class="mb ${de(f.method)}">${f.method}</span><span class="rn">${v(f.name)}</span>`;let b=d("button","rx","\u2715");b.title="\u5220\u9664",b.onclick=y=>{y.stopPropagation(),vn(a,f)},u.appendChild(b),u.onclick=()=>gn(f),m.appendChild(u)}),s.appendChild(m),e.appendChild(s)}),t&&o===0&&e.appendChild(d("div","tree-empty","\u6CA1\u6709\u5339\u914D\u300C"+v(t)+"\u300D\u7684\u8BF7\u6C42\u3002")),x("#stSaved").textContent=n}function se(){let e=me();x("#envName").textContent=e?e.name:"\u65E0\u73AF\u5883",x("#envSel").title=e&&e.baseUrl?"baseUrl: "+e.baseUrl:"\u672A\u9009\u62E9\u73AF\u5883";let t=x("#envMenu");t.innerHTML="",g.envs.forEach(a=>{let r=d("button","env-item"+(a.id===g.activeEnv?" on":""),`<span>${v(a.name)}</span><small>${v(a.baseUrl||"(\u65E0 baseUrl)")}</small>`);r.onclick=()=>{g.activeEnv=a.id,w(),se(),re(),x("#envMenu").classList.remove("open"),$("\u5DF2\u5207\u6362\u73AF\u5883\uFF1A"+a.name,"ok")},t.appendChild(r)});let n=d("button","env-item"+(g.activeEnv?"":" on"),"<span>\u65E0\u73AF\u5883</span><small>\u4E0D\u89E3\u6790\u53D8\u91CF</small>");n.onclick=()=>{g.activeEnv=null,w(),se(),re(),x("#envMenu").classList.remove("open")},t.appendChild(n);let o=d("button","env-item manage","<span>\u2699 \u7BA1\u7406\u73AF\u5883\u4E0E\u53D8\u91CF\u2026</span>");o.onclick=()=>{x("#envMenu").classList.remove("open"),nn()},t.appendChild(o)}function nn(){let e=x("#modalBg"),t=d("div","modal wide"),n=g.activeEnv||g.envs[0]&&g.envs[0].id;function o(){let r=g.envs.find(h=>h.id===n);t.innerHTML='<h3>\u73AF\u5883\u4E0E\u53D8\u91CF</h3><div class="sub">\u6BCF\u4E2A\u73AF\u5883\u542B\u4E00\u4E2A\u8BF7\u6C42\u670D\u52A1 <b>baseUrl</b>(ip+\u7AEF\u53E3) \u4E0E\u4E00\u7EC4\u53D8\u91CF\uFF1B\u5728 URL / Header / Body \u4E2D\u7528 <b>{{baseUrl}}</b>\u3001<b>{{\u53D8\u91CF\u540D}}</b> \u5F15\u7528\uFF0C\u53D1\u9001\u65F6\u89E3\u6790\u3002</div>';let i=d("div","env-tabs");g.envs.forEach(h=>{let m=d("button","env-tab"+(h.id===n?" on":""),v(h.name)+(h.id===g.activeEnv?" \u25CF":""));m.onclick=()=>{n=h.id,o()},i.appendChild(m)});let s=d("button","env-tab add","\uFF0B \u65B0\u5EFA\u73AF\u5883");if(s.onclick=()=>{let h={id:_(),name:"\u73AF\u5883 "+(g.envs.length+1),baseUrl:"",vars:[q()]};g.envs.push(h),n=h.id,o()},i.appendChild(s),t.appendChild(i),r){let h=d("div","field");h.innerHTML="<label>\u73AF\u5883\u540D\u79F0</label>";let m=d("input");m.value=r.name,m.oninput=()=>r.name=m.value,h.appendChild(m),t.appendChild(h);let f=d("div","field");f.innerHTML="<label>\u8BF7\u6C42\u670D\u52A1 baseUrl\uFF08ip + \u7AEF\u53E3\uFF09</label>";let u=d("input");u.placeholder="http://127.0.0.1:8080",u.value=r.baseUrl||"",u.oninput=()=>r.baseUrl=u.value,f.appendChild(u),t.appendChild(f);let b=d("div","field");b.innerHTML="<label>\u53D8\u91CF</label>";let y=d("div","env-vars");r.vars||(r.vars=[q()]),y.appendChild(he(r.vars,{kPlace:"\u53D8\u91CF\u540D",vPlace:"\u503C",onChange:()=>{}})),b.appendChild(y),t.appendChild(b)}else t.appendChild(d("div","field","\u8FD8\u6CA1\u6709\u73AF\u5883\uFF0C\u70B9\u300C\uFF0B \u65B0\u5EFA\u73AF\u5883\u300D\u3002"));let l=d("div","acts");if(r){let h=d("button","btn ghost danger","\u5220\u9664");h.onclick=()=>{Se("\u5220\u9664\u73AF\u5883\u300C"+r.name+"\u300D\uFF1F",m=>{m&&(g.envs=g.envs.filter(f=>f.id!==r.id),g.activeEnv===r.id&&(g.activeEnv=g.envs[0]?g.envs[0].id:null),n=g.envs[0]&&g.envs[0].id,o())})},l.appendChild(h)}let p=d("div");if(p.style.flex="1",l.appendChild(p),r){let h=d("button","btn",r.id===g.activeEnv?"\u2713 \u5F53\u524D\u73AF\u5883":"\u8BBE\u4E3A\u5F53\u524D");h.onclick=()=>{g.activeEnv=n,w(),se(),re(),o()},l.appendChild(h)}let c=d("button","btn primary","\u5B8C\u6210");c.onclick=a,l.appendChild(c),t.appendChild(l)}function a(){g.envs.forEach(r=>{r.vars&&(r.vars=r.vars.filter(i=>i.k||i.v))}),w(),se(),re(),e.classList.remove("open"),e.innerHTML=""}e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=r=>{r.target===e&&a()},o()}function qe(){let e=x("#serverSelect");if(!e)return;e.innerHTML='<option value="">\u65E0</option>',W.forEach(n=>{let o=d("option");o.value=n.id,o.textContent=n.name+" ("+n.url+")",e.appendChild(o)});let t=d("option");t.value="__manage",t.textContent="\u2699 \u7BA1\u7406\u670D\u52A1\u5668...",e.appendChild(t)}function rn(e){if(e.value==="__manage"){e.value="",an();return}let t=x("#serverBadge"),n=x("#serverBadgeText");if(e.value){let o=W.find(a=>a.id===e.value);if(o){n.textContent=o.name+": "+o.url,t.style.display="flex";let a=j();if(a&&a.url)try{let r=new URL(a.url.indexOf("{{")>=0?a.url.replace(/\{\{[^}]+\}\}/g,"x"):a.url),i=o.url+r.pathname+r.search+r.hash;a.url=i,x("#url").value=i,B(a),ge(),w()}catch{}}}else t.style.display="none"}function on(){let e=x("#serverSelect");if(!e.value)return;let t=W.find(o=>o.id===e.value);if(!t)return;let n=j();if(!(!n||!n.url))try{let o=new URL(n.url.indexOf("{{")>=0?n.url.replace(/\{\{[^}]+\}\}/g,"x"):n.url),a=t.url+o.pathname+o.search+o.hash;n.url=a,x("#url").value=a,B(n),ge(),w(),$("\u5DF2\u66FF\u6362\u670D\u52A1\u5668 URL","ok")}catch{$("URL \u65E0\u6548","warn")}}function an(){let e=x("#modalBg"),t=d("div","modal");t.innerHTML='<h3>\u7BA1\u7406\u670D\u52A1\u5668</h3><div class="sub">\u670D\u52A1\u5668\u5217\u8868\u7528\u4E8E\u5FEB\u901F\u66FF\u6362 URL \u57DF\u540D\u3002</div>';let n=d("div");n.style.cssText="max-height:240px;overflow:auto";function o(){n.innerHTML="",W.forEach((p,c)=>{let h=d("div","srv-row");h.innerHTML='<input class="srv-input" value="'+v(p.name)+'" placeholder="\u540D\u79F0" /><input class="srv-input" value="'+v(p.url)+'" placeholder="https://..." style="flex:1" /><button class="btn icon ghost" style="font-size:14px;color:var(--err)" onclick="window.__delSrv('+c+')">\xD7</button>';let m=h.querySelectorAll("input")[0],f=h.querySelectorAll("input")[1];m.oninput=()=>{p.name=m.value,w()},f.oninput=()=>{p.url=f.value,w()},n.appendChild(h)})}o(),t.appendChild(n);let a=d("div","acts"),r=d("div");r.style.flex="1";let i=d("button","btn","+ \u6DFB\u52A0\u670D\u52A1\u5668");i.onclick=()=>{W.push({id:_(),name:"\u65B0\u670D\u52A1\u5668",url:"https://"}),o(),w()};let s=d("button","btn primary","\u5B8C\u6210");s.onclick=l,a.append(i,r,s),t.appendChild(a),e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=p=>{p.target===e&&l()},window.__delSrv=p=>{W.splice(p,1),o(),w(),qe()};function l(){e.classList.remove("open"),e.innerHTML="",qe()}}function kt(){let e=x("#templateSelect");e&&(e.innerHTML='<option value="">\u8BF7\u9009\u62E9...</option>',ee.forEach(t=>{let n=d("option");n.value=t.id,n.textContent=t.name+" ("+t.method+" "+t.url+")",e.appendChild(n)}))}function sn(e){let t=j();if(!t)return;if(!e.value){x("#templateForm").style.display="none",x("#customHint").style.display="none";return}let n=ee.find(o=>o.id===e.value);n&&(t._templateId=n.id,t.method=n.method,t.url=n.url,t.bodyType=n.bodyType||"none",dn(n,t._formData||{}),x("#customHint").style.display="block",B(t),w(),re(),te())}function ln(){let e=j();e&&ve("\u4FDD\u5B58\u6A21\u677F","\u8F93\u5165\u6A21\u677F\u540D\u79F0\uFF1A",e.name+" \u6A21\u677F",t=>{if(!t)return;let n=[];if(e.bodyType==="json"&&e.body)try{Object.keys(JSON.parse(e.body)).forEach(a=>n.push({name:a,label:a,type:"text",required:!1}))}catch{}let o={id:_(),name:t,method:e.method,url:e.url,bodyType:e.bodyType,bodyFields:n.length?n:[{name:"param",label:"\u53C2\u6570",type:"text",required:!1}]};ee.push(o),w(),kt(),$("\u5DF2\u4FDD\u5B58\u6A21\u677F\u300C"+t+"\u300D","ok")})}function dn(e,t){let n=x("#templateFields");if(!n)return;n.innerHTML="";let o=e.bodyFields||[],a=new Set;if(e.bodyType==="json"){let r=j();if(r&&r.body)try{Object.keys(JSON.parse(r.body)).forEach(i=>{o.find(s=>s.name===i)||a.add(i)})}catch{}}o.forEach(r=>{let i=d("div","tf-field"),s=t[r.name]||"",l=r.required?' <span class="tf-req">*</span>':"";if(i.innerHTML="<label>"+v(r.label)+l+"</label>",r.type==="json"){let p=d("textarea");p.placeholder=r.name,p.value=s,p.oninput=()=>be(),i.appendChild(p)}else if(r.type==="number"){let p=d("input");p.type="number",p.placeholder=r.name,p.value=s,p.oninput=()=>be(),i.appendChild(p)}else if(r.type==="checkbox"){let p=d("label"),c=d("input");c.type="checkbox",c.checked=s===!0||s==="true",c.onchange=()=>be(),p.appendChild(c),p.appendChild(document.createTextNode(" "+v(r.label))),i.appendChild(p)}else{let p=d("input");p.type="text",p.placeholder=r.name,p.value=s,p.oninput=()=>be(),i.appendChild(p)}n.appendChild(i)}),a.forEach(r=>{let i=d("div","tf-field");i.innerHTML="<label>"+v(r)+' <span class="tf-extra">(\u989D\u5916)</span></label>';let s=d("input");s.type="text",s.placeholder=r,s.value=t[r]||"",s.oninput=()=>be(),i.appendChild(s),n.appendChild(i)}),x("#templateForm").style.display="block"}function be(){if(Ce)return;let e=j();if(!e)return;let t=ee.find(a=>a.id===e._templateId);if(!t)return;let n=t.bodyFields||[],o={};n.forEach(a=>{let r=x("#templateFields").querySelector('input[placeholder="'+a.name+'"],textarea[placeholder="'+a.name+'"]');r&&(a.type==="number"?o[a.name]=r.value?Number(r.value):null:a.type==="checkbox"?o[a.name]=r.checked:o[a.name]=r.value)}),U("#templateFields .tf-field").forEach(a=>{let r=a.querySelector("label"),i=a.querySelector("input,textarea");if(r&&i&&r.textContent.includes("(\u989D\u5916)")){let s=r.textContent.replace(/\s*\(额外\)\s*/,"").trim();s&&!n.find(l=>l.name===s)&&(o[s]=i.value)}}),e._formData=o,e.bodyType==="json"&&(e.body=JSON.stringify(o,null,2),Ce=!0,te(),Ce=!1),B(e),w()}function Lt(){return _e.get("globalHeaders")||[]}function pn(){let e=j();if(!e||e.reqTab!=="global")return;let t=x("#reqPane");t.innerHTML="";let n=d("div"),o=d("div","gh-hint","\u5168\u5C40 Headers \u81EA\u52A8\u5408\u5E76\u5230\u6240\u6709\u8BF7\u6C42\u3002\u82E5\u8BF7\u6C42\u4E2D\u5DF2\u6709\u540C\u540D Header\uFF0C\u4EE5\u8BF7\u6C42\u4E3A\u51C6\u3002");n.appendChild(o);let a=Lt(),r=fe(a);(!r.length||r[r.length-1].k||r[r.length-1].v)&&r.push(q()),n.appendChild(he(r,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{let i=r.filter(s=>s.k);_e.set("globalHeaders",i)}})),t.appendChild(n)}function Tt(){let e=j();if(!e||e.reqTab!=="auth")return;let t=x("#reqPane");t.innerHTML="";let n=d("div","auth-panel"),o=d("div","seg");if([["bearer","Bearer Token"],["basic","Basic Auth"]].forEach(([r,i])=>{let s=d("button",e.authType===r?"on":"",i);s.onclick=()=>{e.authType=r,B(e),w(),Tt()},o.appendChild(s)}),n.appendChild(o),e.authType==="bearer"){let r=d("div","auth-field");r.innerHTML="<label>Token</label>";let i=d("input");i.type="password",i.value=e.authToken||"",i.placeholder="eyJhbGciOiJIUzI1NiIs...",i.onfocus=()=>i.type="text",i.onblur=()=>{i.value||(i.type="password")},i.oninput=()=>{e.authToken=i.value,B(e),w()},r.appendChild(i),n.appendChild(r)}else{let r=d("div","auth-field");r.innerHTML="<label>\u7528\u6237\u540D</label>";let i=d("input");i.type="text",i.value=e.authUsername||"",i.placeholder="admin",i.oninput=()=>{e.authUsername=i.value,B(e),w()},r.appendChild(i),n.appendChild(r);let s=d("div","auth-field");s.innerHTML="<label>\u5BC6\u7801</label>";let l=d("input");l.type="password",l.value=e.authPassword||"",l.onfocus=()=>l.type="text",l.onblur=()=>{l.value||(l.type="password")},l.oninput=()=>{e.authPassword=l.value,B(e),w()},s.appendChild(l),n.appendChild(s)}let a=d("div","auth-hint","\u81EA\u52A8\u586B\u5145\u5230 Authorization \u5934");n.appendChild(a),t.appendChild(n)}function ne(){let e=x("#tabbar");e.innerHTML="",g.tabs.forEach(n=>{let o=d("div","rtab"+(n.id===g.activeTab?" active":""));o.innerHTML=`<span class="tm ${de(n.method)}">${n.method}</span><span class="tn">${v(n.name)}</span>`,n.dirty&&o.appendChild(d("span","dirty"));let a=d("button","tx","\xD7");a.title="\u5173\u95ED",a.onclick=r=>{r.stopPropagation(),kn(n)},o.appendChild(a),o.onclick=()=>{g.activeTab=n.id,oe(),w()},o.querySelector(".tn").ondblclick=r=>{r.stopPropagation(),ve("\u91CD\u547D\u540D Tab","\u8F93\u5165\u65B0\u540D\u79F0\uFF1A",n.name,i=>{i&&(n.name=i.trim()||n.name,ne(),w())})},e.appendChild(o)});let t=d("button","tab-add","+");t.title="\u65B0\u5EFA\u8BF7\u6C42 tab",t.onclick=()=>{let n=ie();g.tabs.push(n),g.activeTab=n.id,oe(),w()},e.appendChild(t),x("#stTabs").textContent=g.tabs.length}function re(){let e=j(),t=x("#methodLabel");t.textContent=e.method,t.className=de(e.method);let n=x("#url");document.activeElement!==n&&(n.value=e.url),ge()}function ge(){let e=j(),t=x("#urlResolved");if(e.url&&e.url.indexOf("{{")>=0){let n=Z(e.url);t.innerHTML="\u2192 <b>"+v(n)+"</b>"}else t.innerHTML=""}function te(){let e=j();U("#reqSubtabs .subtab").forEach(n=>n.classList.toggle("active",n.dataset.rt===e.reqTab));let t=x("#reqPane");t.innerHTML="",e.reqTab==="params"?t.appendChild(he(e.params,{kPlace:"\u53C2\u6570\u540D",vPlace:"\u53C2\u6570\u503C",onChange:()=>{B(e),un(e),w()}})):e.reqTab==="headers"?t.appendChild(he(e.headers,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{B(e),w()}})):e.reqTab==="body"?cn(t,e):e.reqTab==="auth"?Tt():e.reqTab==="global"&&pn()}function he(e,t){let n=d("div","kv");function o(){(!e.length||e[e.length-1].k||e[e.length-1].v)&&e.push(q())}function a(i){let s=()=>e[e.length-1]===i,l=d("div","kv-row"+(!i.k&&!i.v?" blank":"")),p=d("label","ck"),c=d("input");c.type="checkbox",c.checked=i.on,c.onchange=()=>{i.on=c.checked,t.onChange()},p.appendChild(c);let h=d("input","k");h.type="text",h.placeholder=t.kPlace,h.value=i.k,h.spellcheck=!1;let m=d("input","v");m.type="text",m.placeholder=t.vPlace,m.value=i.v,m.spellcheck=!1;let f=()=>{if(i.k=h.value,i.v=m.value,l.classList.toggle("blank",!i.k&&!i.v),(i.k||i.v)&&s()){let b=q();e.push(b),n.appendChild(a(b))}t.onChange()};h.addEventListener("input",f),m.addEventListener("input",f);let u=d("button","rm","\u2715");return u.title="\u5220\u9664\u8BE5\u884C",u.onclick=()=>{let b=e.indexOf(i);b>-1&&e.splice(b,1),r(),t.onChange()},l.append(p,h,m,u),l}function r(){n.innerHTML="",o(),e.forEach(i=>n.appendChild(a(i)))}return r(),n}function cn(e,t){let n=d("div","body-bar"),o=d("div","seg");if([["none","\u65E0"],["json","JSON"],["text","\u6587\u672C"],["form","Form"]].forEach(([a,r])=>{let i=d("button",t.bodyType===a?"on":"",r);i.onclick=()=>{t.bodyType=a,B(t),w(),te()},o.appendChild(i)}),n.appendChild(o),n.appendChild(d("div","sp")),t.bodyType==="json"){let a=d("button","tool","\u683C\u5F0F\u5316");a.onclick=()=>{try{t.body=JSON.stringify(JSON.parse(t.body),null,2),te(),w(),$("JSON \u5DF2\u683C\u5F0F\u5316","ok")}catch(r){$("JSON \u65E0\u6548\uFF1A"+r.message,"err")}},n.appendChild(a)}if(e.appendChild(n),t.bodyType==="none")e.appendChild(d("div","body-none","\u8BE5\u8BF7\u6C42\u6CA1\u6709 Body\u3002<br>\u9009\u62E9 JSON / \u6587\u672C / Form \u4EE5\u7F16\u8F91\u8BF7\u6C42\u4F53\u3002"));else if(t.bodyType==="form"){let a=d("div");a.style.cssText="height:calc(100% - 49px);overflow:auto",a.appendChild(he(t.formBody,{kPlace:"\u5B57\u6BB5\u540D",vPlace:"\u5B57\u6BB5\u503C",onChange:()=>{B(t),w()}})),e.appendChild(a)}else{let a=d("textarea","code");a.spellcheck=!1,a.placeholder=t.bodyType==="json"?`{
  "key": "value"
}`:"\u539F\u59CB\u8BF7\u6C42\u4F53\u2026",a.value=t.body,a.style.height="calc(100% - 49px)",a.addEventListener("input",()=>{t.body=a.value,B(t),w(),Ce||(t._formData=null)}),a.addEventListener("keydown",r=>{if(r.key==="Tab"){r.preventDefault();let i=a.selectionStart,s=a.selectionEnd;a.value=a.value.slice(0,i)+"  "+a.value.slice(s),a.selectionStart=a.selectionEnd=i+2,t.body=a.value}}),e.appendChild(a)}}function Ct(e){let t=e.indexOf("?");return t<0?[e,""]:[e.slice(0,t),e.slice(t+1)]}function un(e){let[t]=Ct(e.url),n=e.params.filter(a=>a.on&&a.k).map(a=>encodeURIComponent(a.k)+"="+encodeURIComponent(a.v)).join("&");e.url=n?t+"?"+n:t;let o=x("#url");document.activeElement!==o&&(o.value=e.url),ge()}function zt(e){let[,t]=Ct(e.url),n=[];t&&t.split("&").forEach(o=>{if(!o)return;let[a,...r]=o.split("=");n.push({id:_(),on:!0,k:decodeURIComponent(a||""),v:decodeURIComponent((r.join("=")||"").replace(/\+/g," "))})}),n.push(q()),e.params=n}async function Ae(){let e=j(),t=Z(e.url.trim());if(!t){$("\u8BF7\u5148\u8F93\u5165 URL","warn"),x("#url").focus();return}/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let n={};e.headers.filter(c=>c.on&&c.k).forEach(c=>n[Z(c.k)]=Z(c.v)),Lt().filter(c=>c.on!==!1&&c.k).forEach(c=>{Object.keys(n).some(h=>h.toLowerCase()===c.k.toLowerCase())||(n[c.k]=c.v)}),e.authType==="bearer"&&e.authToken&&!Object.keys(n).some(c=>c.toLowerCase()==="authorization")?n.Authorization="Bearer "+e.authToken:e.authType==="basic"&&e.authUsername&&e.authPassword&&!Object.keys(n).some(c=>c.toLowerCase()==="authorization")&&(n.Authorization="Basic "+btoa(e.authUsername+":"+e.authPassword));let a,r=e.method;["GET","HEAD"].includes(r)||(e.bodyType==="json"?(a=Z(e.body),Object.keys(n).some(c=>c.toLowerCase()==="content-type")||(n["Content-Type"]="application/json")):e.bodyType==="text"?a=Z(e.body):e.bodyType==="form"&&(a=e.formBody.filter(c=>c.on&&c.k).map(c=>encodeURIComponent(Z(c.k))+"="+encodeURIComponent(Z(c.v))).join("&"),Object.keys(n).some(c=>c.toLowerCase()==="content-type")||(n["Content-Type"]="application/x-www-form-urlencoded")));let i=x("#sendBtn");i.disabled=!0,i.innerHTML="\u53D1\u9001\u4E2D\u2026",x("#resTabs").style.display="none",x("#resStatus").style.display="none",x("#resTools").style.display="none",x("#resPane").innerHTML='<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>',$(r+" "+t+(L.proxyOn?" \xB7 \u7ECF\u4EE3\u7406":"")+" \u2026");let s=t,l=n;L.proxyOn&&(l=Object.assign({},n,{"X-Polaris-Target":t}),s=xe?yt+"/__proxy":"/__proxy");let p=performance.now();try{if(e.response&&e.response.blobUrl)try{URL.revokeObjectURL(e.response.blobUrl)}catch{}let c=await fetch(s,{method:r,headers:l,body:a,redirect:"follow"}),h=await c.blob(),m=performance.now(),f=c.headers.get("content-type")||"",u=Fe.test(f),b="";u||(b=await h.text());let y={};c.headers.forEach((z,O)=>y[O]=z);let k=De(b);e.response={status:c.status,statusText:c.statusText,ok:c.ok,timeMs:m-p,size:h.size,contentType:f,headers:y,text:b,isBinary:u,blobUrl:u?URL.createObjectURL(h):null,url:t,parsed:k.ok?k.value:void 0},e.respPath="",e.respFilter="",e.tableSel=null,e.colW={},e.treeOpen="auto",e.hiddenCols={},e.sort={},e.respView=k.ok?Array.isArray(k.value)?"table":"object":/text\/html/i.test(f)||u&&/^image\//i.test(f)?"preview":"raw",Re(),$(r+" "+c.status+" "+c.statusText+" \xB7 "+le(m-p)+" \xB7 "+ae(h.size),c.ok?"ok":"warn")}catch(c){let h=performance.now();e.response={error:c.message||String(c),timeMs:h-p,url:t},Re(),$("\u8BF7\u6C42\u5931\u8D25\uFF1A"+(c.message||c),"err")}finally{i.disabled=!1,i.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>'}}function ze(e){let t=e.response,n=t&&!t.error?t.parsed:void 0,o=n,a=!1;if(L.resTab==="data"&&n!==void 0&&!e.respPath){for(let l of["data","result","response","results","items","list"])if(n&&typeof n=="object"&&!Array.isArray(n)&&l in n){let p=Me(n,l);if(p.ok){o=p.value;break}}}if(e.respPath&&n!==void 0){let l=Me(n,e.respPath);l.ok?o=l.value:(a=!0,o=void 0)}let r=o!==void 0,i=r&&(Array.isArray(o)||o&&typeof o=="object"),s=!!t&&!e.respPath&&(/text\/html/i.test(t.contentType)||/^image\//i.test(t.contentType));return{data:o,drillErr:a,hasJSON:r,canTable:i,canPrev:s}}function fn(e){return e?Array.isArray(e)&&e.length&&e[0]&&typeof e[0]=="object"&&!Array.isArray(e[0])?Object.keys(e[0]):e&&typeof e=="object"&&!Array.isArray(e)?Object.keys(e):[]:[]}function Re(){let e=j(),t=e.response,n=x("#resPane"),o=x("#resTabs"),a=x("#resStatus"),r=x("#resTools");if(!t){o.style.display="none",a.style.display="none",r.style.display="none",n.innerHTML='<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div>\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002</div>';return}if(t.error){o.style.display="none",a.style.display="none",r.style.display="none";let p=/Failed to fetch|NetworkError|load failed/i.test(t.error);n.innerHTML=`<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u5931\u8D25</div><div>${v(t.error)}</div>`+(p?'<div class="hintbox"><b>\u53EF\u80FD\u539F\u56E0\uFF1A</b>\u8DE8\u57DF CORS\u3001\u76EE\u6807\u65E0\u54CD\u5E94\u3001\u6DF7\u5408\u5185\u5BB9(HTTP/HTTPS)\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002'+(L.proxyOn?"<br>\u4EE3\u7406\u5DF2\u5F00\u542F\uFF0C\u8BF7\u786E\u4FDD\u5DF2\u8FD0\u884C\u670D\u52A1\u7AEF\u3002":"<br>\u{1F449} \u70B9\u9876\u680F\u300C\u4EE3\u7406\u300D\u5F00\u542F\u4E2D\u7EE7\u4EE3\u7406\uFF0C\u53EF\u7ED5\u8FC7 CORS \u9650\u5236\u3002")+"</div>":"")+`<div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u8017\u65F6 ${le(t.timeMs)} \xB7 ${v(t.url)}</div></div>`;return}a.style.display="flex",o.style.display="flex";let s=`var(--${t.status>=500?"s5":t.status>=400?"s4":t.status>=300?"s3":"s2"})`;if(a.innerHTML=`<span class="status-chip" style="color:${s}"><span class="dotc" style="background:${s}"></span>${t.status} ${v(t.statusText)}</span><span class="res-meta"><span>\u8017\u65F6 <b>${le(t.timeMs)}</b></span><span>\u5927\u5C0F <b>${ae(t.size)}</b></span>${t.contentType?`<span>\u7C7B\u578B <b>${v(t.contentType.split(";")[0])}</b></span>`:""}</span><span class="sp"></span><button class="tool" onclick="window.__copyRes()">\u29C9 \u590D\u5236</button><button class="tool" onclick="window.__dlRes()">\u2193 \u4E0B\u8F7D</button><button class="tool" onclick="window.__exportCurl()">cURL \u5BFC\u51FA</button><button class="tool" onclick="window.__askAI()">\u2726 AI</button>`,t.parsed!==void 0){r.style.display="flex",r.innerHTML="";let p=Ge(t.parsed),c=d("div","ti path");c.innerHTML='<span class="lbl">\u8DEF\u5F84</span>';let h=d("div","pathdd"),m=d("button","pathdd-btn");m.type="button";let f=()=>{m.innerHTML=`<span>${e.respPath?v(e.respPath):"\u9009\u62E9\u8DEF\u5F84"}</span><span class="pcar">\u25BC</span>`};f();let u=d("div","path-menu"),b=d("input","path-filter");b.placeholder="\u8FC7\u6EE4\u8DEF\u5F84 / \u8F93\u5165\u540E\u56DE\u8F66\u5E94\u7528",b.spellcheck=!1;let y=d("div","path-list"),k=H=>{e.respPath=H,w(),f(),u.classList.remove("open"),Q()},z=()=>{y.innerHTML="";let H=b.value.toLowerCase().trim(),R=0;p.forEach(S=>{if(R>=200)return;let G=S.path===""?"(\u6839)":S.path;if(H&&!G.toLowerCase().includes(H))return;R++;let M=d("button","path-opt"+(S.path===e.respPath?" on":""));M.type="button",M.innerHTML=`<span class="pp">${v(G)}</span><span class="pk ${S.kind}">${S.kind==="array"?"[ ] "+S.count:S.kind==="object"?"{ } "+S.count:"\xB7"}</span>`,M.onclick=()=>k(S.path),y.appendChild(M)}),R||(y.innerHTML='<div class="path-empty">\u65E0\u5339\u914D\u8DEF\u5F84\u3002<br>\u56DE\u8F66\u53EF\u76F4\u63A5\u5E94\u7528\u8F93\u5165\u7684\u8DEF\u5F84\u3002</div>')};b.addEventListener("input",z),b.addEventListener("keydown",H=>{H.key==="Enter"&&k(b.value.trim()),H.key==="Escape"&&u.classList.remove("open")}),m.onclick=H=>{H.stopPropagation();let R=!u.classList.contains("open");U(".path-menu").forEach(S=>S.classList.remove("open")),x("#methodMenu").classList.remove("open"),x("#envMenu").classList.remove("open"),R&&(u.classList.add("open"),b.value="",z(),setTimeout(()=>b.focus(),0))},u.addEventListener("click",H=>H.stopPropagation()),u.append(b,y),h.append(m,u),c.appendChild(h);let O=d("div","ti manual");O.innerHTML='<span class="lbl">\u624B\u52A8</span>';let C=d("input");C.id="respPathIn",C.placeholder="\u5982 data.items[0].name",C.value=e.respPath||"",C.spellcheck=!1,C.addEventListener("input",()=>{e.respPath=C.value,w(),f(),Q()}),O.appendChild(C);let T=ze(e),E=fn(T.data),N=st(e,()=>{w(),Q()},E);r.append(c,O,N)}else r.style.display="none";Q()}function Q(){let e=j(),t=e.response;if(!t||t.error)return;let n=ze(e);({table:n.canTable,object:n.hasJSON,raw:!0,preview:n.canPrev,headers:!0})[e.respView]||(e.respView=n.hasJSON?"object":n.canPrev?"preview":"raw");let a=e.respView==="table",r=e.respView==="object",i=e.respView==="raw",s=e.prettyCells!==!1,l=x("#resPane");if(l.innerHTML="",l.style.fontSize=L.resFont+"px",n.drillErr){l.innerHTML='<div class="prev-none">\u8DEF\u5F84 <b>'+v(e.respPath)+"</b> \u5728\u54CD\u5E94\u4E2D\u4E0D\u5B58\u5728\u3002</div>";return}let p=e.respView;p==="raw"?l.appendChild(Ye(t,n.data)):p==="object"?l.appendChild(Qe(n.data,e)):p==="table"?l.appendChild(it(n.data,e)):p==="preview"?l.appendChild(bn(t)):l.appendChild(xn(t))}function bn(e){if(/^image\//i.test(e.contentType)&&e.blobUrl){let t=d("div","prev-img-wrap"),n=d("img");return n.src=e.blobUrl,t.appendChild(n),t}if(/text\/html/i.test(e.contentType)){let t=d("iframe","prev-frame");return t.sandbox="",t.srcdoc=e.text,t}return d("div","prev-none","\u65E0\u53EF\u9884\u89C8\u5185\u5BB9\uFF08\u4EC5\u652F\u6301 HTML \u4E0E\u56FE\u7247\u9884\u89C8\uFF09\u3002")}function xn(e){let t=d("div","tbl-wrap"),n=d("table","dt"),o=Object.keys(e.headers||{});n.innerHTML="<thead><tr><th>Header</th><th>Value</th></tr></thead>";let a=d("tbody");return o.length||(a.innerHTML='<tr><td colspan="2" style="color:var(--dimmer)">\uFF08\u65E0\u53EF\u89C1\u54CD\u5E94\u5934 \u2014 \u6D4F\u89C8\u5668\u53EF\u80FD\u9650\u5236\u4E86\u90E8\u5206\u5934\uFF09</td></tr>'),o.forEach(r=>{let i=d("tr");i.innerHTML=`<td style="color:var(--j-key);white-space:nowrap">${v(r)}</td><td>${v(e.headers[r])}</td>`,a.appendChild(i)}),n.appendChild(a),t.appendChild(n),t}function hn(){let e=x("#modalBg"),t=d("div","modal");t.innerHTML='<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\u3002</div>';let n=d("div","field");n.innerHTML="<label>cURL \u547D\u4EE4</label>";let o=d("textarea","curl-ta");o.placeholder="curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx'",n.appendChild(o),t.appendChild(n);let a=d("div","acts"),r=d("div");r.style.flex="1";let i=d("button","btn ghost","\u53D6\u6D88");i.onclick=l;let s=d("button","btn primary","\u89E3\u6790\u5E76\u65B0\u5EFA");s.onclick=()=>{let p=o.value.trim();if(!p){$("\u8BF7\u7C98\u8D34 curl \u547D\u4EE4","warn");return}try{let c=dt(p);if(!c.url){$("\u672A\u80FD\u89E3\u6790\u51FA URL","err");return}let h=ie({name:"cURL: "+St(c.url),method:c.method,url:c.url,bodyType:c.bodyType,body:c.body,headers:(c.headers.length?c.headers.map(m=>({id:_(),on:!0,k:m.k,v:m.v})):[]).concat([q()])});zt(h),h.dirty=!0,g.tabs.push(h),g.activeTab=h.id,oe(),w(),l(),$("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A"+c.method+" "+c.url,"ok")}catch(c){$("cURL \u89E3\u6790\u5931\u8D25\uFF1A"+c.message,"err")}},a.append(i,r,s),t.appendChild(a),e.innerHTML="",e.appendChild(t),e.classList.add("open"),o.focus(),e.onclick=p=>{p.target===e&&l()};function l(){e.classList.remove("open"),e.innerHTML=""}}function B(e){e.dirty||(e.dirty=!0,ne())}function mn(e){for(let t of g.collections){let n=t.requests.find(o=>o.id===e);if(n)return{g:t,r:n}}return null}function ut(e){return{method:e.method,url:e.url,params:JSON.parse(JSON.stringify(e.params)),headers:JSON.parse(JSON.stringify(e.headers)),bodyType:e.bodyType,body:e.body,formBody:JSON.parse(JSON.stringify(e.formBody))}}function St(e){try{let t=new URL(/^[a-z]+:\/\//i.test(e)?e:"https://"+e.replace(/^\{\{[^}]+\}\}/,"http://x"));return t.pathname&&t.pathname.length>1?t.pathname:t.hostname}catch{return String(e).slice(0,28)}}function ft(){let e=j();if(e.savedId){let o=mn(e.savedId);if(o){Object.assign(o.r,ut(e)),o.r.name=e.name,e.dirty=!1,w(),ne(),V(),$("\u5DF2\u66F4\u65B0\u300C"+e.name+"\u300D","ok");return}}let t=g.collections.map(o=>`<option value="${o.id}">${v(o.name)}</option>`).join("");Ln("\u4FDD\u5B58\u8BF7\u6C42","\u628A\u5F53\u524D\u8BF7\u6C42\u5B58\u5165\u4E00\u4E2A\u5206\u7EC4",[{label:"\u540D\u79F0",id:"mName",type:"text",value:e.url?e.method+" "+St(e.url):"\u672A\u547D\u540D\u8BF7\u6C42"},{label:"\u5206\u7EC4",id:"mGroup",type:"select",html:t+'<option value="__new">\uFF0B \u65B0\u5EFA\u5206\u7EC4\u2026</option>'}],o=>{let a=o.mGroup;if(a==="__new"||!g.collections.length){ve("\u65B0\u5EFA\u5206\u7EC4","\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4",r=>{if(r){let i={id:_(),name:r,collapsed:!1,requests:[]};g.collections.push(i),a=i.id,n(o,a)}});return}n(o,a)});function n(o,a){let r=g.collections.find(s=>s.id===a);if(!r)return;let i=Object.assign({id:_(),name:o.mName||"\u672A\u547D\u540D\u8BF7\u6C42"},ut(e));r.requests.push(i),e.savedId=i.id,e.name=i.name,e.dirty=!1,w(),ne(),V(),$("\u5DF2\u4FDD\u5B58\u5230\u300C"+r.name+"\u300D","ok")}}function gn(e){let t=g.tabs.find(o=>o.savedId===e.id);if(t){g.activeTab=t.id,oe();return}let n=ie({name:e.name,savedId:e.id,method:e.method,url:e.url,params:JSON.parse(JSON.stringify(e.params||[q()])),headers:JSON.parse(JSON.stringify(e.headers||[q()])),bodyType:e.bodyType||"none",body:e.body||"",formBody:JSON.parse(JSON.stringify(e.formBody||[q()]))});n.params.length||(n.params=[q()]),n.headers.length||(n.headers=[q()]),n.formBody.length||(n.formBody=[q()]),g.tabs.push(n),g.activeTab=n.id,oe(),w(),$("\u5DF2\u8F7D\u5165\u300C"+e.name+"\u300D")}function vn(e,t){Se("\u5220\u9664\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u300C"+t.name+"\u300D\uFF1F",n=>{n&&(e.requests=e.requests.filter(o=>o.id!==t.id),g.tabs.forEach(o=>{o.savedId===t.id&&(o.savedId=null,o.dirty=!0)}),w(),V(),ne())})}function yn(e){ve("\u91CD\u547D\u540D\u5206\u7EC4","\u5206\u7EC4\u540D\u79F0\uFF1A",e.name,t=>{t&&(e.name=t.trim()||e.name,w(),V())})}function wn(e){Se("\u5220\u9664\u5206\u7EC4\u300C"+e.name+"\u300D\u53CA\u5176\u4E2D "+e.requests.length+" \u4E2A\u8BF7\u6C42\uFF1F",t=>{if(!t)return;let n=e.requests.map(o=>o.id);g.collections=g.collections.filter(o=>o.id!==e.id),g.tabs.forEach(o=>{n.includes(o.savedId)&&(o.savedId=null,o.dirty=!0)}),w(),V(),ne()})}function kn(e){if(e.dirty&&(e.url||e.savedId)){Se("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F",n=>{n&&t()});return}t();function t(){let n=g.tabs.indexOf(e);if(g.tabs.splice(n,1),g.tabs.length)g.activeTab===e.id&&(g.activeTab=g.tabs[Math.max(0,n-1)].id);else{let o=ie();g.tabs.push(o),g.activeTab=o.id}oe(),w()}}function Se(e,t){let n=x("#modalBg"),o=d("div","modal");o.innerHTML='<h3>\u786E\u8BA4</h3><div class="sub">'+v(e)+"</div>";let a=d("div","acts"),r=d("div");r.style.flex="1";let i=d("button","btn ghost","\u53D6\u6D88");i.onclick=l;let s=d("button","btn primary danger","\u786E\u5B9A");s.onclick=()=>{l(),t(!0)},a.append(r,i,s),o.appendChild(a),n.innerHTML="",n.appendChild(o),n.classList.add("open"),o.querySelector("button.danger")?.focus(),o.addEventListener("keydown",p=>{p.key==="Escape"&&l()}),n.onclick=p=>{p.target===n&&l()};function l(){n.classList.remove("open"),n.innerHTML="",t(!1)}}function ve(e,t,n,o){let a=x("#modalBg"),r=d("div","modal");r.innerHTML="<h3>"+v(e)+'</h3><div class="sub">'+v(t)+"</div>";let i=d("div","field"),s=d("input");s.type="text",s.value=n||"",i.appendChild(s),r.appendChild(i);let l=d("div","acts"),p=d("div");p.style.flex="1";let c=d("button","btn ghost","\u53D6\u6D88");c.onclick=m;let h=d("button","btn primary","\u786E\u5B9A");h.onclick=()=>{let f=s.value.trim();f&&(m(),o(f))},l.append(p,c,h),r.appendChild(l),a.innerHTML="",a.appendChild(r),a.classList.add("open"),s.focus(),s.select(),r.addEventListener("keydown",f=>{f.key==="Enter"&&s.value.trim()&&h.click(),f.key==="Escape"&&m()}),a.onclick=f=>{f.target===a&&m()};function m(){a.classList.remove("open"),a.innerHTML="",o(null)}}function Ln(e,t,n,o){let a=x("#modalBg"),r=d("div","modal");r.innerHTML=`<h3>${v(e)}</h3>${t?`<div class="sub">${v(t)}</div>`:""}`,n.forEach(m=>{let f=d("div","field");f.innerHTML=`<label>${v(m.label)}</label>`+(m.type==="select"?`<select id="${m.id}">${m.html}</select>`:`<input id="${m.id}" type="text" value="${v(m.value||"")}" />`),r.appendChild(f)});let i=d("div","acts"),s=d("div");s.style.flex="1";let l=d("button","btn ghost","\u53D6\u6D88");l.onclick=h;let p=d("button","btn primary","\u786E\u5B9A");p.onclick=()=>{let m={};n.forEach(f=>m[f.id]=x("#"+f.id,r).value),o(m)!==!1&&h()},i.append(s,l,p),r.appendChild(i),a.innerHTML="",a.appendChild(r),a.classList.add("open");let c=r.querySelector("input,select");c&&(c.focus(),c.select&&c.select()),r.addEventListener("keydown",m=>{m.key==="Enter"&&m.target.tagName!=="SELECT"&&p.click(),m.key==="Escape"&&h()}),a.onclick=m=>{m.target===a&&h()};function h(){a.classList.remove("open"),a.innerHTML=""}}function Tn(){let e=x("#exportBtn");e&&(e.onclick=()=>{let o=JSON.stringify({version:2,exportedAt:new Date().toISOString(),collections:g.collections,envs:g.envs},null,2),a=d("a");a.href=URL.createObjectURL(new Blob([o],{type:"application/json"})),a.download="pac-export.json",a.click(),$("\u5DF2\u5BFC\u51FA\u96C6\u5408\u4E0E\u73AF\u5883","ok")});let t=x("#importBtn");t&&(t.onclick=()=>x("#fileInput").click());let n=x("#fileInput");n&&(n.onchange=o=>{let a=o.target.files[0];if(!a)return;let r=new FileReader;r.onload=()=>{try{let i=JSON.parse(r.result),s=Array.isArray(i)?i:i.collections;if(!Array.isArray(s))throw new Error("\u683C\u5F0F\u4E0D\u7B26");s.forEach(l=>{l.id=_(),(l.requests||[]).forEach(p=>p.id=_())}),g.collections=g.collections.concat(s),i.envs&&Array.isArray(i.envs)&&(i.envs.forEach(l=>{l.id=_()}),g.envs=g.envs.concat(i.envs),se()),w(),V(),$("\u5DF2\u5BFC\u5165 "+s.length+" \u4E2A\u5206\u7EC4","ok")}catch(i){$("\u5BFC\u5165\u5931\u8D25\uFF1A"+i.message,"err")}x("#fileInput").value=""},r.readAsText(a)})}function Cn(){let e=j(),t=e.response;if(!t||t.error)return;let n=ze(e),o="response";try{o=new URL(t.url).pathname.split("/").pop()||"response"}catch{}let a,r=!1;if(t.isBinary&&t.blobUrl&&!e.respPath)a=t.blobUrl;else{let s=n.hasJSON?JSON.stringify(n.data,null,2):t.text;/\./.test(o)||(o+=n.hasJSON?".json":/html/.test(t.contentType)?".html":".txt"),a=URL.createObjectURL(new Blob([s],{type:t.contentType||"text/plain"})),r=!0}let i=d("a");i.href=a,i.download=o,i.click(),r&&setTimeout(()=>URL.revokeObjectURL(a),1e3),$("\u5DF2\u4E0B\u8F7D "+o,"ok")}function zn(){let e=j(),t=e.response;if(!t||!Pe)return;let n=t.error?`\u8BF7\u6C42\u5931\u8D25\uFF1A${t.error}`:`\u72B6\u6001 ${t.status} ${t.statusText}\uFF0C\u8017\u65F6 ${le(t.timeMs)}\uFF0C\u5927\u5C0F ${ae(t.size)}`,o=t.parsed!==void 0?JSON.stringify(t.parsed).slice(0,2e3):(t.text||"").slice(0,2e3),a=`\u5206\u6790\u4EE5\u4E0B API \u8BF7\u6C42\u4E0E\u54CD\u5E94\uFF0C\u7ED9\u51FA\u95EE\u9898\u8BCA\u65AD\u6216\u6570\u636E\u89E3\u8BFB\uFF1A

\u8BF7\u6C42\uFF1A${e.method} ${e.url}
\u54CD\u5E94\uFF1A${n}
\u54CD\u5E94\u4F53\u9884\u89C8\uFF1A
${o}`;Pe(a)}function Sn(){let e=j();if(!e||!e.url){$("\u8BF7\u5148\u586B\u5199 URL","warn");return}let t=Te(e,me());D(t,"cURL \u5DF2\u590D\u5236")}function jn(){let e=x("#codeGenPanel");if(!e)return;let t=e.style.display!=="block";e.style.display=t?"block":"none",t&&jt()}function jt(){let e=j();if(!e||!e.url){x("#codeOutput").textContent="\u8BF7\u5148\u586B\u5199 URL";return}try{let t=pt(e,L.curLang||"curl",me());x("#codeOutput").textContent=t||"\u4EE3\u7801\u751F\u6210\u5931\u8D25"}catch(t){x("#codeOutput").textContent="\u4EE3\u7801\u751F\u6210\u5931\u8D25\uFF1A"+t.message}}function On(e,t){L.curLang=t,w(),U("#codeGenPanel .lang-btn").forEach(n=>n.classList.toggle("active",n.dataset.lang===t)),jt()}function En(){let e=x("#codeOutput")?.textContent;e&&D(e,"\u4EE3\u7801\u5DF2\u590D\u5236")}function Mn(e){L.resFont=parseInt(e),w();let t=x("#resPane");t&&(t.style.fontSize=e+"px")}function Hn(e){U(".jt-children").forEach(t=>{if(t.style.display="block",t.previousElementSibling){let n=t.previousElementSibling.querySelector(".jt-tog");n&&(n.textContent="\u25BE")}}),$("\u5DF2\u5C55\u5F00","ok")}function $n(){L.fullscreen=!L.fullscreen;let e=x("#resRegion")||x("#resPane")?.closest(".res-region");e&&(e.style.position=L.fullscreen?"fixed":"",e.style.inset=L.fullscreen?"0":"",e.style.zIndex=L.fullscreen?"100":"",e.style.background=L.fullscreen?"var(--bg)":"",$(L.fullscreen?"\u5168\u5C4F\u6A21\u5F0F":"\u9000\u51FA\u5168\u5C4F","ok"))}function _n(){window.__copyRes=()=>{let e=j(),t=ze(e);!e.response||e.response.error||D(t.hasJSON?JSON.stringify(t.data,null,2):e.response.text||"","\u5DF2\u590D\u5236")},window.__dlRes=()=>Cn(),window.__exportCurl=()=>Sn(),window.__askAI=()=>zn(),window.__setPath=e=>{let t=j();t.respPath=e,Q()},window.__setFilter=e=>{let t=j();t.respFilter=e,Q()},window.__togglePretty=()=>{let e=j();e.prettyCells=e.prettyCells===!1,w(),Q()},window.__expandAll=()=>{U(".jt-children").forEach(e=>e.style.display="block")},window.__collapseAll=()=>{U(".jt-children").forEach(e=>e.style.display="none")},window.__jtToggle=e=>{let t=e.nextElementSibling;if(t){let n=t.style.display==="none";t.style.display=n?"block":"none",e.querySelector(".jt-tog").textContent=n?"\u25BE":"\u25B8"}},window.__onServerChange=e=>rn(e),window.__replaceServerUrl=()=>on(),window.__onTemplateSelect=e=>sn(e),window.__saveTemplate=()=>ln(),window.__copyCode=()=>En(),window.__changeFont=e=>Mn(e),window.__expandLevel=e=>Hn(e),window.__toggleFullscreen=()=>$n()}function Nn(){x("#sendBtn").onclick=Ae,x("#saveBtn").onclick=ft,x("#curlBtn").onclick=()=>D(Te(j(),me()),"cURL \u5DF2\u590D\u5236"),x("#curlImportBtn").onclick=hn,x("#codeGenBtn").onclick=jn;let e=x("#url");e&&(e.addEventListener("input",r=>{let i=j();i.url=r.target.value,B(i),ge()}),e.addEventListener("change",r=>{let i=j();i.url=r.target.value,zt(i),i.reqTab==="params"&&te(),w()}),e.addEventListener("keydown",r=>{r.key==="Enter"&&Ae()})),U("#reqSubtabs .subtab").forEach(r=>r.onclick=()=>{j().reqTab=r.dataset.rt,te(),w()}),U("#modeBar .mode-btn").forEach(r=>r.onclick=()=>{U("#modeBar .mode-btn").forEach(i=>i.classList.remove("active")),r.classList.add("active"),L.mode=r.dataset.mode,w(),x("#customPanel").style.display=L.mode==="custom"?"block":"none",L.mode==="custom"&&(x("#customHint").style.display="block")}),U("#resTabs .res-tab").forEach(r=>{r.dataset.rt&&(r.onclick=()=>{U("#resTabs .res-tab").forEach(i=>i.classList.remove("active")),r.classList.add("active"),L.resTab=r.dataset.rt,w(),j()?.response&&Q()})}),U("#codeGenPanel .lang-btn").forEach(r=>r.onclick=()=>On(r,r.dataset.lang));let t=x("#search");t&&t.addEventListener("input",V);let n=x("#newGroup");n&&(n.onclick=()=>{ve("\u65B0\u5EFA\u5206\u7EC4","\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4",r=>{r&&(g.collections.push({id:_(),name:r.trim(),collapsed:!1,requests:[]}),w(),V())})});let o=x("#layoutBtn");o&&(o.onclick=()=>{L.layout=L.layout==="h"?"v":"h",Et(),w()});let a=x("#proxyBtn");a&&(a.onclick=()=>{L.proxyOn=!L.proxyOn,Ot(),w(),$(L.proxyOn?"\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406":"\u5DF2\u5173\u95ED\u4EE3\u7406 \xB7 \u6D4F\u89C8\u5668\u76F4\u8FDE","ok")}),document.addEventListener("keydown",r=>{(r.metaKey||r.ctrlKey)&&r.key==="Enter"&&(r.preventDefault(),Ae()),(r.metaKey||r.ctrlKey)&&(r.key==="s"||r.key==="S")&&(r.preventDefault(),ft())})}function Ot(){let e=x("#proxyBtn");e&&(e.innerHTML=L.proxyOn?"\u{1F6E1} \u4EE3\u7406:\u5F00":"\u{1F6E1} \u4EE3\u7406:\u5173",e.style.color=L.proxyOn?"var(--brand)":"",e.style.borderColor=L.proxyOn?"var(--brand)":"")}function An(){let e=x("#divider"),t=x("#split");if(!e||!t)return;let n=!1;e.addEventListener("mousedown",o=>{n=!0,document.body.style.cursor=L.layout==="h"?"col-resize":"row-resize",document.body.style.userSelect="none",o.preventDefault()}),document.addEventListener("mousemove",o=>{if(!n)return;let a=t.getBoundingClientRect();if(L.layout==="h"){let r=Math.max(160,Math.min(Math.max(60,a.width-180),o.clientX-a.left));L.reqW=r,t.style.setProperty("--reqW",r+"px")}else{let r=Math.max(80,Math.min(Math.max(80,a.height-120),o.clientY-a.top));L.reqH=r,t.style.setProperty("--reqH",r+"px")}}),document.addEventListener("mouseup",()=>{n&&(n=!1,document.body.style.cursor="",document.body.style.userSelect="",w())})}function Pn(){let e=x("#cellTip");if(!e)return;let t=!1,n=o=>{let a=o.getAttribute("data-full");return a==null||a===""?null:o.scrollWidth>o.clientWidth+1||a.length>56?a:null};document.addEventListener("mouseover",o=>{let a=o.target;if(!(a instanceof Element))return;let r=a.closest("td[data-full]");if(!r){t&&(e.classList.remove("show"),t=!1);return}let i=n(r);if(i==null){t&&(e.classList.remove("show"),t=!1);return}e.textContent=i.length>2e3?i.slice(0,2e3)+"\u2026":i,e.classList.add("show"),t=!0}),document.addEventListener("mousemove",o=>{if(!t)return;let a=14,r=e.offsetWidth,i=e.offsetHeight,s=o.clientX+a,l=o.clientY+a;s+r>innerWidth-8&&(s=o.clientX-r-a),l+i>innerHeight-8&&(l=o.clientY-i-a),e.style.left=Math.max(8,s)+"px",e.style.top=Math.max(8,l)+"px"}),document.addEventListener("mouseout",o=>{let a=o.target;a instanceof Element&&a.closest("td[data-full]")&&(e.classList.remove("show"),t=!1)})}function Et(){let e=x("#split");if(!e)return;e.classList.toggle("h",L.layout==="h");let t=xe?180:240,n=xe?320:520;e.style.setProperty("--reqH",(L.reqH||t)+"px"),e.style.setProperty("--reqW",(L.reqW||n)+"px");let o=x("#layoutBtn");o&&(o.innerHTML=L.layout==="h"?"\u21C5 \u4E0A\u4E0B":"\u21C4 \u5DE6\u53F3")}function oe(){ne(),re(),te(),Re(),V(),se()}function Mt(e={}){Pe=e.onSendToChat||null,en(),tn(),Tn(),Nn(),An(),Pn(),_n(),Kt(),xe&&(L.layout="v",L.sideCollapsed=!0);let t=x("#main");t&&t.classList.toggle("collapsed",L.sideCollapsed),Et(),Ot(),qe(),kt(),oe()}import{jsx as Un}from"react/jsx-runtime";var Rn=`
<header class="topbar">
  <div class="brand"><span class="dot"></span>API<small>CLIENT</small></div>
  <div class="tabbar" id="tabbar"></div>
  <div class="spacer"></div>
  <div class="env-wrap">
    <button class="env-sel" id="envSel"><span class="dot"></span><span id="envName">\u65E0\u73AF\u5883</span><span class="car">\u25BC</span></button>
    <div class="env-menu" id="envMenu"></div>
  </div>
  <button class="top-act" id="curlImportBtn" title="\u7C98\u8D34 cURL \u5BFC\u5165\u4E3A\u8BF7\u6C42">\u2913 \u5BFC\u5165 cURL</button>
  <button class="top-act" id="layoutBtn" title="\u5207\u6362 \u4E0A\u4E0B/\u5DE6\u53F3 \u5E03\u5C40">\u21C4 \u5DE6\u53F3</button>
  <button class="top-act" id="proxyBtn" title="\u8DE8\u57DF\u4EE3\u7406">\u{1F6E1} \u4EE3\u7406:\u5173</button>
</header>

<div class="main" id="main">
  <aside class="side">
    <div class="side-head">
      <span class="t">\u96C6\u5408 \xB7 COLLECTIONS</span>
      <button class="mini-btn" id="newGroup" title="\u65B0\u5EFA\u5206\u7EC4">\uFF0B</button>
      <button class="mini-btn" id="importBtn" title="\u5BFC\u5165\u96C6\u5408 JSON">\u21A7</button>
      <button class="mini-btn" id="exportBtn" title="\u5BFC\u51FA\u96C6\u5408 JSON">\u21A5</button>
    </div>
    <div class="side-search"><input id="search" placeholder="\u641C\u7D22\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u2026" /></div>
    <div class="tree" id="tree"></div>
  </aside>

  <section class="work">
    <!-- \u6A21\u5F0F\u5207\u6362\u680F + \u670D\u52A1\u5668\u9009\u62E9\u5668 -->
    <div class="mode-bar" id="modeBar">
      <button class="mode-btn active" data-mode="http">\u901A\u7528 HTTP \u8BF7\u6C42</button>
      <button class="mode-btn" data-mode="custom">\u5B9A\u5236\u63A5\u53E3\u6A21\u677F</button>
      <span class="sp"></span>
      <span class="mode-lbl">\u670D\u52A1\u5668:</span>
      <select class="mode-select" id="serverSelect" onchange="window.__onServerChange(this)">
        <option value="">\u65E0</option>
      </select>
      <div class="server-badge" id="serverBadge" style="display:none">
        <span id="serverBadgeText"></span>
        <button class="btn icon" style="height:20px;font-size:9px;padding:0 6px" onclick="window.__replaceServerUrl()">\u66FF\u6362</button>
      </div>
    </div>

    <!-- \u8BF7\u6C42\u680F -->
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
      <button class="btn icon ghost" id="codeGenBtn" title="\u4EE3\u7801\u751F\u6210">\u2318</button>
    </div>

    <!-- \u5B9A\u5236\u6A21\u677F\u9762\u677F -->
    <div class="custom-panel" id="customPanel" style="display:none">
      <div class="custom-bar">
        <span class="mode-lbl">\u9009\u62E9\u6A21\u677F:</span>
        <select class="mode-select" id="templateSelect" onchange="window.__onTemplateSelect(this)">
          <option value="">\u8BF7\u9009\u62E9...</option>
        </select>
        <button class="top-act" style="height:22px;font-size:10px" onclick="window.__saveTemplate()">\u4FDD\u5B58\u5F53\u524D</button>
      </div>
      <div class="template-form" id="templateForm" style="display:none">
        <div class="tf-title">\u63A5\u53E3\u5B57\u6BB5</div>
        <div class="tf-grid" id="templateFields"></div>
      </div>
      <div class="custom-hint" id="customHint" style="display:none">\u5F53\u524D\u4E3A\u5B9A\u5236\u63A5\u53E3\u6A21\u5F0F\uFF0C\u8868\u5355\u4FEE\u6539\u81EA\u52A8\u540C\u6B65\u5230 Body</div>
    </div>

    <!-- \u4EE3\u7801\u751F\u6210\u5185\u8054\u9762\u677F -->
    <div class="codegen-inline" id="codeGenPanel" style="display:none">
      <div class="codegen-hd">
        <span>\u4EE3\u7801\u751F\u6210</span>
        <span class="sp"></span>
        <div class="codegen-langs">
          <button class="lang-btn active" data-lang="curl">cURL</button>
          <button class="lang-btn" data-lang="python">Python</button>
          <button class="lang-btn" data-lang="js">JS</button>
          <button class="lang-btn" data-lang="go">Go</button>
          <button class="lang-btn" data-lang="rust">Rust</button>
        </div>
      </div>
      <div class="codegen-bd">
        <pre id="codeOutput">curl -X GET 'https://api.example.com'</pre>
        <button class="codegen-copy" onclick="window.__copyCode()">\u590D\u5236</button>
      </div>
    </div>

    <div class="split" id="split">
      <div class="req-region">
        <div class="subtabs" id="reqSubtabs">
          <button class="subtab active" data-rt="params">Params</button>
          <button class="subtab" data-rt="headers">Headers</button>
          <button class="subtab" data-rt="body">Body</button>
          <button class="subtab" data-rt="auth">Auth</button>
          <button class="subtab" data-rt="global">\u5168\u5C40H</button>
        </div>
        <div class="pane" id="reqPane"></div>
      </div>

      <div class="divider" id="divider" title="\u62D6\u52A8\u8C03\u6574\u5927\u5C0F"></div>

      <div class="res-region">
        <div class="res-status" id="resStatus" style="display:none"></div>
        <!-- \u54CD\u5E94\u53CC\u89C6\u56FE\u6807\u7B7E -->
        <div class="res-tabs" id="resTabs" style="display:none">
          <button class="res-tab active" data-rt="data">\u4E1A\u52A1\u6570\u636E</button>
          <button class="res-tab" data-rt="full">\u5B8C\u6574\u54CD\u5E94</button>
          <div class="res-tab-acts">
            <span class="mode-lbl">\u5B57\u4F53:</span>
            <select class="font-sel" id="resFontSel" onchange="window.__changeFont(this.value)">
              <option value="12">12</option><option value="13" selected>13</option><option value="14">14</option><option value="16">16</option><option value="18">18</option>
            </select>
            <button class="tbtn" onclick="window.__expandLevel(2)">\u5C55\u5F002\u5C42</button>
            <button class="tbtn" onclick="window.__expandLevel(3)">\u5C55\u5F003\u5C42</button>
            <button class="tbtn" onclick="window.__collapseAll()">\u6298\u53E0</button>
            <button class="tbtn" onclick="window.__toggleFullscreen()">\u5168\u5C4F</button>
          </div>
        </div>
        <!-- \u54CD\u5E94\u89C6\u56FE\u5207\u6362 -->
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
              \xB7 <b>\u8DE8\u57DF</b>\uFF1A\u9876\u680F\u300C\u4EE3\u7406\u300D\u5F00\u542F\u540E\u7ECF\u672C\u5730\u540E\u7AEF\u8F6C\u53D1
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<footer class="statusbar">
  <span class="msg" id="statusMsg">\u5C31\u7EEA \xB7 \u7EAF\u524D\u7AEF\u8FD0\u884C\uFF0C\u8DE8\u57DF\u8BF7\u6C42\u53D7\u6D4F\u89C8\u5668 CORS \u7B56\u7565\u9650\u5236</span>
  <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span></span>
</footer>

<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="ctx-menu" id="ctxMenu"></div>
<div class="cell-tip" id="cellTip"></div>
`;function In({pluginId:e,onSendToChat:t}){let n=Ht(null),o=Ht(!1);return qn(()=>{let a=n.current;if(!(!a||o.current)){a.innerHTML=Rn;try{let r=document.createElement("style");r.setAttribute("data-polaris-api-client",""),r.textContent=Ue,a.prepend(r)}catch(r){console.warn("[Polaris API Client] CSS injection failed:",r)}return Oe(a),wt(!0,"http://127.0.0.1:9861"),Mt({onSendToChat:t}),o.current=!0,()=>{a.innerHTML="",Oe(document),o.current=!1}}},[t]),Un("div",{ref:n,className:"polaris-api-client-panel",style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg, #16181e)",color:"var(--ink, #d8dae2)"}})}export{In as default};
