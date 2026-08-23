// src/panel.jsx
import { useEffect, useRef } from "react";

// styles/main.css
var main_default = "/* ============================================================\n   RELAY \u2014 \u8BBE\u8BA1\u7CFB\u7EDF \xB7 \u7CBE\u5BC6\u4EEA\u8868 / obsidian + signal-coral\n   ============================================================ */\n:root{\n  --bg:#16181e; --bg-2:#1a1c24;\n  --surface:#1e2028; --surface-2:#252830; --surface-3:#2c2f3a;\n  --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.18);\n  --ink:#d8dae2; --dim:#a8acba; --dimmer:#6e7282;\n  --brand:#ff7a59; --brand-hi:#ff926f; --brand-ink:#1c0c06;\n  --brand-glow:0 0 0 1px rgba(255,122,89,.5), 0 0 22px -8px rgba(255,122,89,.7);\n  --brand-line:rgba(255,122,89,.4);\n  --m-get:#3fb950; --m-post:#4493f8; --m-put:#d29922; --m-patch:#a371f7; --m-del:#f85149; --m-other:#8b949e;\n  --s2:#3fb950; --s3:#58a6ff; --s4:#d29922; --s5:#f85149;\n  --ok:#3fb950; --warn:#d29922; --err:#f85149;\n  --j-key:#79c0ff; --j-str:#a5d6a4; --j-num:#ffab70; --j-bool:#d2a8ff; --j-null:#8b949e;\n  --mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;\n  --disp:'Bricolage Grotesque','JetBrains Mono',system-ui,sans-serif;\n  --r:7px; --r-sm:5px; --topbar:48px; --statusbar:26px; --tabsbar:38px; --side:266px;\n}\n*{margin:0;padding:0;box-sizing:border-box}\n/* \u72EC\u7ACB\u6A21\u5F0F\uFF08\u6D4F\u89C8\u5668\u6253\u5F00 index.html\uFF09\u4FDD\u7559 html/body \u5168\u5C4F\uFF1B\n   \u9762\u677F\u6A21\u5F0F\u4E0B\u4E0D\u4FEE\u6539\u5BBF\u4E3B html/body\uFF08panel.jsx \u8BBE\u7F6E :host \u5BB9\u5668\u4E3A .polaris-api-client-panel\uFF09\u3002 */\nbody:not(.relay-host) html,body:not(.relay-host){height:100%}\n/* \u5BB9\u5668\u67E5\u8BE2\uFF1A\u72EC\u7ACB\u6A21\u5F0F body \u4E3A\u5BB9\u5668\uFF0C\u9762\u677F\u6A21\u5F0F .polaris-api-client-panel \u4E3A\u5BB9\u5668\u3002\n   @container \u57FA\u4E8E\u300C\u5BB9\u5668\u81EA\u8EAB\u5BBD\u5EA6\u300D\u89E6\u53D1\uFF0C\u800C\u975E\u89C6\u53E3\uFF0C\u4F7F\u7A84\u9762\u677F\u81EA\u52A8\u7D27\u51D1\u5E03\u5C40\u3002 */\nbody:not(.relay-host){container-type:inline-size}\n.polaris-api-client-panel{container-type:inline-size;position:relative}\n/* \u9762\u677F\u6839\u5BB9\u5668\u5185\u90E8\u5E03\u5C40\uFF08\u907F\u514D\u6C61\u67D3\u5BBF\u4E3B body\uFF09 */\n.polaris-api-client-panel{background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}\nbody:not(.relay-host){background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}\n/* \u80CC\u666F\u88C5\u9970 \u2014 \u72EC\u7ACB\u6A21\u5F0F fixed \u5728\u89C6\u53E3\u3001\u9762\u677F\u6A21\u5F0F absolute \u9650\u5236\u5728\u5BB9\u5668\u5185 */\nbody:not(.relay-host)::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;\n  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}\nbody:not(.relay-host)::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.45;\n  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}\n.polaris-api-client-panel::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;\n  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}\n.polaris-api-client-panel::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.45;\n  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}\n.polaris-api-client-panel > *{position:relative;z-index:1}\n::selection{background:var(--brand);color:var(--brand-ink)}\n::-webkit-scrollbar{width:10px;height:10px}\n::-webkit-scrollbar-track{background:transparent}\n::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:6px;border:2px solid transparent;background-clip:padding-box}\n::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.16);background-clip:padding-box}\nbutton,input,select,textarea{font-family:inherit;font-size:inherit;color:inherit;background:none;border:none;outline:none}\nbutton{cursor:pointer}\ninput,textarea{caret-color:var(--brand)}\n\n.app{grid-template-rows:var(--topbar) 1fr var(--statusbar)}\n\n/* ===== \u5916\u58F3\uFF1A\u9876\u90E8\u5BFC\u822A + \u89C6\u56FE\u8DEF\u7531 ===== */\n.navbar{display:flex;align-items:center;gap:14px;height:42px;flex:none;padding:0 14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.03),transparent);backdrop-filter:blur(8px);position:relative;z-index:50}\n.nav-brand{display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:15px;color:var(--ink)}\n.nav-brand .dot{width:8px;height:8px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}\n.nav-brand small{font-family:var(--mono);font-weight:500;font-size:9px;letter-spacing:.22em;color:var(--dimmer)}\n.nav-tabs{display:flex;gap:2px;overflow-x:auto;overflow-y:hidden;max-width:100%}\n.nav-tabs::-webkit-scrollbar{height:0}\n.nav-tab{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 13px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);border:1px solid transparent;transition:.14s;letter-spacing:.01em}\n.nav-tab:hover{color:var(--ink);background:var(--surface-2)}\n.nav-tab.on{color:var(--brand);background:var(--surface-2);border-color:var(--line-2)}\n.nav-tab .tcn{font-size:13px;font-family:var(--disp)}\n.nav-sp{flex:1}\n.nav-hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em}\n#view{flex:1;min-height:0;position:relative}\n.view{position:absolute;inset:0;display:none;min-height:0}\n.view.on{display:flex;flex-direction:column}\n#viewApi.on{display:grid}\n\n/* ===== \u9996\u9875 ===== */\n.home{position:absolute;inset:0;overflow:auto;padding:54px 40px}\n.home-inner{max-width:1080px;margin:0 auto}\n.home-hero{margin-bottom:34px}\n.home-hero .eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--brand);margin-bottom:12px}\n.home-hero h1{font-family:var(--disp);font-weight:800;font-size:36px;letter-spacing:-.02em;margin-bottom:12px;line-height:1.1}\n.home-hero p{color:var(--dim);font-size:14px;max-width:640px;line-height:1.75}\n.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}\n.tool-card{display:flex;flex-direction:column;gap:11px;padding:20px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));cursor:pointer;transition:.16s;position:relative;overflow:hidden;text-align:left}\n.tool-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent,var(--brand));opacity:0;transition:.16s}\n.tool-card:hover{border-color:var(--line-2);transform:translateY(-2px);box-shadow:0 20px 44px -24px rgba(0,0,0,.85)}\n.tool-card:hover::before{opacity:1}\n.tool-card .ic{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;font-family:var(--disp);font-weight:700;background:color-mix(in srgb,var(--accent,var(--brand)) 15%,transparent);color:var(--accent,var(--brand))}\n.tool-card .nm{font-family:var(--disp);font-weight:700;font-size:16px;color:var(--ink)}\n.tool-card .ds{font-size:12px;color:var(--dim);line-height:1.65}\n.tool-card .go{margin-top:auto;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer);transition:.14s}\n.tool-card:hover .go{color:var(--accent,var(--brand))}\n\n/* ===== \u901A\u7528\u5DE5\u5177\u9762\u677F\uFF08JSON / SQL / \u65F6\u95F4\u6233\u5171\u7528\uFF09 ===== */\n.tool-pane{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}\n.t-bar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}\n.t-bar .t-title{font-family:var(--disp);font-weight:700;font-size:13px;margin-right:6px;display:flex;align-items:center;gap:7px}\n.t-bar .t-title .tg{color:var(--brand)}\n.t-bar .sp{flex:1}\n.t-btn{font-size:11.5px;color:var(--dim);padding:6px 11px;border:1px solid var(--line);border-radius:var(--r-sm);transition:.14s;white-space:nowrap}\n.t-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}\n.t-btn.on{color:var(--brand);border-color:var(--brand)}\n.t-btn.primary{color:var(--brand-ink);background:var(--brand);border-color:var(--brand);font-weight:700}\n.t-btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}\n.t-status{font-size:11px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}\n.t-status.ok{color:var(--ok)} .t-status.err{color:var(--err)}\n.t-seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}\n.t-seg button{padding:6px 13px;font-size:11.5px;color:var(--dim);transition:.13s}\n.t-seg button:hover{color:var(--ink);background:var(--surface)}\n.t-seg button.on{background:var(--surface-3);color:var(--ink)}\n\n/* JSON \u5DE5\u5177\uFF1A\u5DE6\u8F93\u5165 / \u53F3\u89C6\u56FE */\n.jsplit{flex:1;display:flex;min-height:0}\n.jspane-l{width:42%;min-width:180px;max-width:64%;display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0;position:relative}\n.jspane-r{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}\n.jspane-l textarea{flex:1;width:100%;resize:none;padding:13px;font-size:12.5px;line-height:1.65;background:transparent;color:var(--ink);white-space:pre;tab-size:2;min-height:0}\n.jspane-l textarea::placeholder{color:var(--dimmer)}\n.jdiv{width:7px;cursor:col-resize;flex:none;position:relative}\n.jdiv::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--line);transition:.15s}\n.jdiv:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}\n\n/* SQL / \u65F6\u95F4\u6233\uFF1A\u5355\u5217\u5185\u5BB9 */\n.t-body{flex:1;min-height:0;overflow:auto;padding:16px}\n.t-field{margin-bottom:14px}\n.t-field label{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);margin-bottom:7px}\n.t-ta{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:12px 13px;font-size:12.5px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word;tab-size:2;resize:vertical;min-height:64px;font-family:var(--mono)}\n.t-ta:focus{border-color:var(--brand)}\n.t-in{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:14px;color:var(--ink);font-family:var(--mono)}\n.t-in:focus{border-color:var(--brand)}\n.t-out{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:13px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--ink);min-height:42px}\n.t-note{font-size:11px;color:var(--dimmer);margin-top:7px;line-height:1.6}\n.t-note.err{color:var(--err)} .t-note.ok{color:var(--ok)}\n.t-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}\n@container (max-width:760px){.t-grid{grid-template-columns:1fr}}\n.t-card{border:1px solid var(--line);border-radius:11px;padding:16px;background:var(--surface)}\n.t-card h4{font-family:var(--disp);font-weight:700;font-size:13px;margin-bottom:12px;color:var(--ink)}\n.kvline{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}\n.kvline:last-child{border-bottom:0}\n.kvline .kk{font-size:11px;color:var(--dim);width:92px;flex:none;letter-spacing:.04em}\n.kvline .vv{flex:1;font-size:13px;color:var(--ink);word-break:break-all;font-variant-numeric:tabular-nums}\n.kvline .cp{font-size:10.5px;color:var(--dimmer);border:1px solid var(--line);border-radius:4px;padding:2px 8px;flex:none;transition:.13s}\n.kvline .cp:hover{color:var(--brand);border-color:var(--brand)}\n.t-now{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:13px 16px;border:1px solid var(--line);border-radius:11px;background:var(--bg-2);margin-bottom:16px}\n.t-now .lab{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer)}\n.t-now .clk{font-family:var(--mono);font-size:15px;color:var(--brand);font-variant-numeric:tabular-nums}\n\n/* \u9876\u680F */\n.topbar{display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--line);\n  background:linear-gradient(180deg,rgba(255,255,255,.022),transparent);backdrop-filter:blur(8px);z-index:30}\n.brand{display:flex;align-items:center;gap:9px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:16px}\n.brand .dot{width:9px;height:9px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}\n.brand small{font-family:var(--mono);font-weight:500;font-size:10px;letter-spacing:.22em;color:var(--dimmer);text-transform:uppercase;margin-left:2px}\n.topbar .spacer{flex:1}\n.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:var(--r-sm);color:var(--dim);border:1px solid transparent;transition:.16s}\n.icon-btn:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line)}\n.top-act{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--r-sm);color:var(--dim);border:1px solid var(--line);font-size:11.5px;letter-spacing:.02em;transition:.15s;white-space:nowrap}\n.top-act:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line-2)}\n.hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em;display:flex;gap:14px}\n.hint kbd{font-family:var(--mono);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--dim);font-size:10px}\n\n/* \u73AF\u5883\u5207\u6362 */\n.env-wrap{position:relative}\n.env-sel{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--surface);transition:.15s;max-width:230px}\n.env-sel:hover{border-color:var(--dim)}\n.env-sel .ehex{color:var(--brand);font-size:13px}\n.env-sel #envName{font-size:12px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.env-sel .car{font-size:8px;color:var(--dim)}\n.env-menu{position:absolute;top:36px;right:0;min-width:230px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;z-index:80;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}\n.env-menu.open{display:block}\n.env-item{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:7px 10px;border-radius:var(--r-sm);transition:.12s}\n.env-item:hover{background:var(--surface-3)}\n.env-item.on{box-shadow:inset 2px 0 0 var(--brand)}\n.env-item span{font-size:12px;color:var(--ink)}\n.env-item small{font-size:10px;color:var(--dimmer)}\n.env-item.manage{border-top:1px solid var(--line);margin-top:4px;padding-top:9px;color:var(--dim)}\n.env-item.manage span,.env-item.manage{color:var(--dim);font-size:11.5px}\n\n.main{display:grid;grid-template-columns:var(--side) 1fr;min-height:0;overflow:hidden}\n.main.collapsed{grid-template-columns:0 1fr}\n\n/* \u4FA7\u680F */\n.side{border-right:1px solid var(--line);background:var(--bg-2);display:flex;flex-direction:column;min-height:0;overflow:hidden}\n.side-head{display:flex;align-items:center;gap:6px;padding:11px 12px;border-bottom:1px solid var(--line)}\n.side-head .t{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);font-weight:600;flex:1}\n.side-head .mini-btn{width:26px;height:26px;border-radius:var(--r-sm);color:var(--dim);display:inline-flex;align-items:center;justify-content:center;transition:.15s;border:1px solid transparent;font-size:13px}\n.side-head .mini-btn:hover{color:var(--brand);background:var(--surface);border-color:var(--line)}\n.side-search{padding:8px 10px;border-bottom:1px solid var(--line)}\n.side-search input{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 10px;font-size:12px;color:var(--ink);transition:.15s}\n.side-search input:focus{border-color:var(--line-2);background:var(--surface-2)}\n.side-search input::placeholder{color:var(--dimmer)}\n.tree{flex:1;overflow-y:auto;padding:6px 6px 40px}\n.group{margin-bottom:2px}\n.group-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;color:var(--dim);transition:.12s;user-select:none}\n.group-head:hover{background:var(--surface)}\n.group-head .caret{width:12px;font-size:9px;color:var(--dimmer);transition:transform .15s;flex:none;text-align:center}\n.group.collapsed .caret{transform:rotate(-90deg)}\n.group-head .gname{flex:1;font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.group-head .gcount{font-size:10px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:1px 7px}\n.group-head .gact{display:none;gap:2px}\n.group-head:hover .gact{display:flex}\n.group-head:hover .gcount{display:none}\n.gact .x{width:20px;height:20px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}\n.gact .x:hover{color:var(--brand);background:var(--surface-2)}\n.group.collapsed .reqs{display:none}\n.reqs{padding:2px 0 4px 8px}\n.req-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;position:relative}\n.req-item:hover{background:var(--surface)}\n.req-item.active{background:var(--surface-2);box-shadow:inset 2px 0 0 var(--brand)}\n.req-item .mb{flex:none;font-size:9px;font-weight:700;letter-spacing:.03em;width:38px;text-align:right}\n.req-item .rn{flex:1;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.req-item .rx{display:none;width:18px;height:18px;border-radius:4px;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}\n.req-item:hover .rx{display:inline-flex}\n.req-item .rx:hover{color:var(--err);background:var(--surface-2)}\n.tree-empty{padding:24px 14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.8}\n.m-GET{color:var(--m-get)} .m-POST{color:var(--m-post)} .m-PUT{color:var(--m-put)}\n.m-PATCH{color:var(--m-patch)} .m-DELETE{color:var(--m-del)} .m-HEAD,.m-OPTIONS{color:var(--m-other)}\n\n/* \u5DE5\u4F5C\u533A */\n.work{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}\n.tabbar{display:flex;align-items:stretch;height:var(--tabsbar);min-height:var(--tabsbar);border-bottom:1px solid var(--line);background:var(--bg-2);overflow-x:auto;overflow-y:hidden}\n.tabbar::-webkit-scrollbar{height:0}\n.rtab{display:flex;align-items:center;gap:8px;padding:0 12px;border-right:1px solid var(--line);cursor:pointer;color:var(--dim);transition:.14s;white-space:nowrap;max-width:240px;position:relative;flex:none}\n.rtab:hover{background:var(--surface);color:var(--ink)}\n.rtab.active{background:var(--surface-2);color:var(--ink)}\n.rtab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand)}\n.rtab .tm{font-size:9px;font-weight:700;flex:none}\n.rtab .tn{font-size:12px;max-width:138px;overflow:hidden;text-overflow:ellipsis}\n.rtab .dirty{width:6px;height:6px;border-radius:50%;background:var(--brand);flex:none}\n.rtab .tx{width:16px;height:16px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:var(--dimmer);flex:none}\n.rtab .tx:hover{color:var(--ink);background:var(--surface-3)}\n.tab-add{flex:none;width:38px;display:inline-flex;align-items:center;justify-content:center;color:var(--dim);font-size:18px;border-right:1px solid var(--line)}\n.tab-add:hover{color:var(--brand);background:var(--surface)}\n\n.reqbar{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);align-items:center}\n.method-wrap{position:relative;flex:none}\n.method-sel{display:flex;align-items:center;gap:7px;padding:0 12px;height:36px;border:1px solid var(--line-2);border-radius:var(--r);background:var(--surface);font-weight:700;font-size:12.5px;letter-spacing:.04em;min-width:104px;justify-content:space-between;transition:.15s}\n.method-sel:hover{border-color:var(--dim)}\n.method-sel .car{font-size:9px;color:var(--dim)}\n.method-menu{position:absolute;top:42px;left:0;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);z-index:60;min-width:130px;padding:5px;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);display:none}\n.method-menu.open{display:block}\n.method-menu button{display:flex;width:100%;padding:7px 10px;border-radius:var(--r-sm);font-weight:700;font-size:12px;letter-spacing:.04em}\n.method-menu button:hover{background:var(--surface-3)}\n.url-wrap{flex:1;min-width:0;position:relative;display:flex;flex-direction:column}\n.url-input{height:36px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:0 14px;font-size:13px;color:var(--ink);transition:.15s;width:100%}\n.url-input:focus{border-color:var(--line-2);background:var(--surface-2)}\n.url-input::placeholder{color:var(--dimmer)}\n.url-resolved{position:absolute;top:38px;left:2px;font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none}\n.url-resolved b{color:var(--m-post)}\n.btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:var(--r);font-weight:600;font-size:12.5px;letter-spacing:.02em;border:1px solid var(--line-2);color:var(--ink);background:var(--surface);transition:.16s;white-space:nowrap}\n.btn:hover{border-color:var(--dim);background:var(--surface-2)}\n.btn.primary{background:var(--brand);color:var(--brand-ink);border-color:var(--brand);font-weight:700}\n.btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}\n.btn.primary:disabled{opacity:.55;cursor:wait}\n.btn .k{font-size:9.5px;opacity:.6;font-weight:500}\n.btn.ghost{background:transparent}\n.btn.icon{padding:0 11px}\n.btn.danger{color:var(--err);border-color:rgba(248,81,73,.4)}\n.btn.danger:hover{background:rgba(248,81,73,.12)}\n\n/* \u8BF7\u6C42/\u54CD\u5E94\u5206\u9694 */\n.split{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}\n.split.h{flex-direction:row}\n.req-region{flex:none;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}\n.split:not(.h) .req-region{height:var(--reqH,240px)}\n.split.h .req-region{width:var(--reqW,520px)}\n.divider{flex:none;position:relative;background:transparent;z-index:5}\n.split:not(.h) .divider{height:8px;cursor:row-resize}\n.split.h .divider{width:8px;cursor:col-resize}\n.divider::before{content:'';position:absolute;background:var(--line);transition:.15s}\n.split:not(.h) .divider::before{left:0;right:0;top:50%;height:1px}\n.split.h .divider::before{top:0;bottom:0;left:50%;width:1px}\n.split:not(.h) .divider:hover::before{background:var(--brand);height:2px;box-shadow:0 0 10px var(--brand)}\n.split.h .divider:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}\n.res-region{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}\n\n.subtabs{display:flex;align-items:center;gap:2px;padding:6px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap}\n.subtab{padding:5px 12px;border-radius:var(--r-sm);font-size:11.5px;color:var(--dim);letter-spacing:.03em;transition:.13s;white-space:nowrap}\n.subtab:hover{color:var(--ink);background:var(--surface)}\n.subtab.active{color:var(--brand);background:var(--surface-2)}\n.subtab.disabled{color:var(--dimmer);opacity:.45;pointer-events:none}\n.subtab .badge{font-size:9px;color:var(--dimmer);margin-left:5px}\n.subtab.active .badge{color:var(--brand)}\n.subtabs .sp{flex:1}\n.subtabs .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.14s}\n.subtabs .tool:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}\n.pane{flex:1;overflow:auto;min-height:0}\n\n/* key-value \u7F16\u8F91\u5668 */\n.kv{width:100%}\n.kv .kv-row{display:grid;grid-template-columns:30px 1fr 1fr 30px;align-items:center;border-bottom:1px solid var(--line)}\n.kv .kv-row:hover{background:rgba(255,255,255,.014)}\n.kv input[type=text]{width:100%;padding:8px 10px;font-size:12px;background:transparent;color:var(--ink)}\n.kv input[type=text]::placeholder{color:var(--dimmer)}\n.kv input.k{color:var(--brand-hi);border-right:1px solid var(--line)}\n.kv .ck{display:flex;align-items:center;justify-content:center}\n.kv .ck input{accent-color:var(--brand);width:13px;height:13px;cursor:pointer}\n.kv .rm{display:flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:13px;height:100%}\n.kv .rm:hover{color:var(--err)}\n.kv-row.blank input.k{color:var(--dim)}\n.kv-row.blank .ck,.kv-row.blank .rm{opacity:.3}\n\n.body-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}\n.seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}\n.seg button{padding:5px 11px;font-size:11px;color:var(--dim);transition:.13s}\n.seg button:hover{color:var(--ink);background:var(--surface)}\n.seg button.on{background:var(--surface-3);color:var(--ink)}\n.body-bar .sp{flex:1}\n.body-bar .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border:1px solid var(--line);border-radius:var(--r-sm)}\n.body-bar .tool:hover{color:var(--ink);border-color:var(--line-2)}\ntextarea.code{width:100%;height:100%;min-height:110px;resize:none;padding:12px;font-size:12.5px;line-height:1.6;background:transparent;color:var(--ink);white-space:pre;tab-size:2}\n.body-none{padding:30px;text-align:center;color:var(--dimmer);font-size:12px;line-height:1.9}\n\n/* \u54CD\u5E94\u5934\u6761 + \u5DE5\u5177 */\n.res-status{display:flex;align-items:center;gap:14px;padding:8px 12px;border-bottom:1px solid var(--line);flex:none;font-size:12px;flex-wrap:wrap}\n.status-chip{display:inline-flex;align-items:center;gap:7px;font-weight:700;letter-spacing:.02em}\n.status-chip .dotc{width:8px;height:8px;border-radius:50%}\n.res-meta{color:var(--dim);display:flex;gap:14px;flex-wrap:wrap}\n.res-meta b{color:var(--ink);font-weight:600}\n.res-tools{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--line);flex:none}\n.res-tools .ti{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 9px;height:28px}\n.res-tools .ti .lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer)}\n.res-tools .ti input{width:100%;font-size:12px;color:var(--ink);background:transparent;padding:5px 0}\n.res-tools .ti.path{flex:1.2;min-width:120px}\n.res-tools .ti.filter{flex:1;min-width:100px}\n.res-tools .ti input::placeholder{color:var(--dimmer)}\n.res-tools .ti.path{flex:none;min-width:0}\n.res-tools .ti.path .lbl{color:var(--m-post)}\n.res-tools .ti.manual{flex:1;min-width:130px}\n/* \u589E\u5F3A\u8FC7\u6EE4\u680F */\n.fb-bar{position:relative;display:flex;align-items:center;flex:1;min-width:100px;gap:0;flex-wrap:wrap}\n.fb-edit{border:none;background:transparent;color:var(--ink);font-size:12px;flex:1;min-width:60px;padding:5px 0;outline:none}\n.fb-edit::placeholder{color:var(--dimmer)}\n.fb-tokens{display:none;flex-wrap:wrap;gap:4px;margin-right:4px;align-items:center}\n.ftk{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:10.5px;white-space:nowrap;border:1px solid var(--line);background:rgba(255,255,255,.03);line-height:1.6}\n.ftk .ftk-field{color:var(--j-key);font-weight:600}\n.ftk .ftk-op{color:var(--dimmer);font-size:10px}\n.ftk .ftk-val{color:var(--j-str)}\n.ftk .ftk-num{color:var(--j-num)}\n.ftk .ftk-bool{color:var(--j-bool)}\n.ftk .ftk-null{color:var(--j-null);font-style:italic}\n.ftk .ftk-neg{color:var(--err);font-weight:700}\n.fb-ac{position:absolute;top:100%;left:0;z-index:90;min-width:160px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:5px;display:none;margin-top:2px}\n.fb-ac.open{display:block}\n.fb-ac-item{display:block;width:100%;text-align:left;padding:5px 9px;border-radius:var(--r-sm);font-size:11.5px;color:var(--ink)}\n.fb-ac-item:hover{background:var(--surface-3);color:var(--brand)}\n.pathdd{position:relative}\n.pathdd-btn{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 4px 0 2px;background:transparent;color:var(--ink);font-size:11.5px;max-width:210px}\n.pathdd-btn>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:176px}\n.pathdd-btn .pcar{color:var(--dim);font-size:8px;flex:none}\n.pathdd-btn:hover{color:var(--brand)}\n.path-menu{position:absolute;top:34px;left:0;z-index:90;width:320px;max-width:80vw;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:7px;display:none}\n.path-menu.open{display:block}\n.path-filter{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 9px;font-size:12px;color:var(--ink);margin-bottom:6px}\n.path-filter:focus{border-color:var(--line-2);background:var(--surface-3)}\n.path-list{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:1px}\n.path-opt{display:flex;align-items:center;gap:8px;width:100%;padding:6px 9px;border-radius:var(--r-sm);text-align:left;transition:.1s}\n.path-opt:hover{background:var(--surface-3)}\n.path-opt.on{box-shadow:inset 2px 0 0 var(--brand);background:var(--surface-3)}\n.path-opt .pp{flex:1;font-size:11.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.path-opt .pk{flex:none;font-size:10px;color:var(--dimmer);font-variant-numeric:tabular-nums}\n.path-opt .pk.array{color:var(--j-num)} .path-opt .pk.object{color:var(--j-key)}\n.path-empty{padding:14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.7}\n.cell-tip{position:fixed;z-index:200;max-width:480px;max-height:60vh;overflow:hidden;background:var(--surface-3);border:1px solid var(--line-2);border-radius:6px;padding:8px 11px;font:12px/1.55 var(--mono);color:var(--ink);white-space:pre-wrap;word-break:break-word;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);pointer-events:none;opacity:0;transition:opacity .1s;left:0;top:0}\n.cell-tip.show{opacity:1}\n\n.res-idle{padding:36px 22px;text-align:center;color:var(--dimmer);font-size:12.5px;line-height:1.95}\n.res-idle .big{font-family:var(--disp);font-size:16px;color:var(--dim);margin-bottom:6px}\n.res-idle .tips{margin-top:14px;display:inline-block;text-align:left;font-size:11.5px;color:var(--dimmer);line-height:2}\n.res-idle .tips b{color:var(--dim)}\n.res-loading{display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--dim);font-size:12.5px}\n.spin{width:16px;height:16px;border:2px solid var(--line-2);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}\n@keyframes spin{to{transform:rotate(360deg)}}\n.res-err{padding:22px;color:var(--err);font-size:12.5px;line-height:1.7}\n.res-err .ti{font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px}\n.res-err .hintbox{margin-top:12px;padding:11px 13px;background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.25);border-radius:var(--r);color:var(--dim);font-size:11.5px}\n.prev-none,.dimnote{padding:30px;text-align:center;color:var(--dimmer);font-size:12.5px}\n.dimnote{padding:16px;text-align:left}\n\npre.raw{padding:14px;font-size:12.5px;line-height:1.65;white-space:pre;overflow:auto;tab-size:2}\npre.raw.wrap{white-space:pre-wrap;word-break:break-word}\n.tok-key{color:var(--j-key)} .tok-str{color:var(--j-str)} .tok-num{color:var(--j-num)} .tok-bool{color:var(--j-bool)} .tok-null{color:var(--j-null)} .tok-id{color:var(--m-get);font-weight:500}\n\n.jtree{padding:12px;font-size:12.5px;line-height:1.6}\n.jt-node{padding-left:15px;position:relative}\n.jt-row{display:flex;align-items:flex-start;gap:5px;padding:.5px 0;border-radius:3px}\n.jt-row.expandable{cursor:pointer}\n.jt-row.expandable:hover{background:rgba(255,255,255,.025)}\n.jt-tog{position:absolute;left:1px;color:var(--dimmer);font-size:9px;width:12px;text-align:center;user-select:none;top:3px}\n.jt-key{color:var(--j-key)} .jt-colon{color:var(--dimmer)}\n.jt-str{color:var(--j-str)} .jt-num{color:var(--j-num)} .jt-bool{color:var(--j-bool)} .jt-null{color:var(--j-null)}\n.jt-prev{color:var(--dimmer);font-style:italic}\n.jt-children.hide{display:none}\n.jt-act{margin-left:8px;opacity:0;font-size:10px;transition:.12s;display:inline-flex;gap:8px}\n.jt-row:hover .jt-act{opacity:1}\n.jt-act b{color:var(--dimmer);cursor:pointer}\n.jt-act b:hover{color:var(--brand)}\n.hl{background:rgba(255,122,89,.28);border-radius:2px;color:#fff}\n\n.tbl-cands{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--bg-2)}\n.tbl-cands .lab{font-size:10px;color:var(--dimmer);letter-spacing:.1em;text-transform:uppercase;align-self:center;margin-right:2px}\n.tcand{font-size:11px;color:var(--dim);padding:4px 10px;border:1px solid var(--line);border-radius:20px;transition:.13s;display:inline-flex;gap:6px;align-items:center}\n.tcand:hover{color:var(--ink);border-color:var(--line-2)}\n.tcand.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}\n.tcand em{font-style:normal;color:var(--dimmer);font-size:10px}\n.tcand.on em{color:var(--brand)}\n/* \u5217\u9009\u62E9\u5668 */\n.col-picker{display:flex;flex-wrap:wrap;padding:4px 12px;border-bottom:1px solid var(--line);background:var(--bg-2);align-items:center;gap:5px}\n.col-picker.collapsed{flex-wrap:nowrap}\n.col-toggle{font-size:11px;color:var(--dim);padding:3px 10px;border:1px solid var(--line);border-radius:20px;cursor:pointer;white-space:nowrap;transition:.13s}\n.col-toggle:hover{color:var(--ink);border-color:var(--line-2)}\n.col-body{display:flex;gap:5px;flex-wrap:wrap;align-items:center}\n.col-picker.collapsed .col-body{display:none}\n.col-q{font-size:10px;color:var(--dimmer);padding:3px 9px;border:1px solid var(--line);border-radius:var(--r-sm);margin-right:4px}\n.col-q:hover{color:var(--ink);border-color:var(--line-2)}\n.col-chip{font-size:11px;padding:3px 10px;border:1px solid var(--line);border-radius:20px;color:var(--dim);transition:.13s;cursor:grab}\n.col-chip:hover{color:var(--ink);border-color:var(--line-2)}\n.col-chip.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}\n.col-chip.dragging{opacity:.35}\n.col-chip.drag-over{border-color:var(--brand);box-shadow:0 0 0 2px rgba(255,122,89,.25)}\n.tbl-host{display:flex;flex-direction:column;height:100%;min-height:0}\n.tbl-wrap{flex:1;min-height:0;overflow:auto}\ntable.dt{border-collapse:separate;border-spacing:0;font-size:12px;width:auto;min-width:100%}\ntable.dt th,table.dt td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 11px;text-align:left;vertical-align:middle;max-width:340px;min-width:54px}\ntable.dt th:first-child,table.dt td:first-child{border-left:1px solid var(--line)}\ntable.dt thead th{border-top:1px solid var(--line)}\ntable.dt th{position:sticky;top:0;background:var(--surface-2);color:var(--ink);font-weight:600;letter-spacing:.01em;font-size:11px;white-space:nowrap;z-index:2;user-select:none}\ntable.dt th.sortable{cursor:pointer}\ntable.dt th.sortable:hover{color:var(--brand)}\ntable.dt th.sort-asc::after{content:' \u25B2';font-size:9px;color:var(--brand)}\ntable.dt th.sort-desc::after{content:' \u25BC';font-size:9px;color:var(--brand)}\ntable.dt th.idx{left:0;z-index:4}\ntable.dt td{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\ntable.dt tr:hover td{background:rgba(255,255,255,.022)}\ntable.dt tr:hover td.idx{background:var(--surface)}\ntable.dt td.idx{color:var(--dimmer);text-align:right;font-variant-numeric:tabular-nums;background:var(--bg-2);position:sticky;left:0;z-index:1;min-width:42px}\ntable.dt .cobj{color:var(--j-key);cursor:default}\n.cell-num{color:var(--j-num)} .cell-bool{color:var(--j-bool)} .cell-null{color:var(--j-null);font-style:italic} .cell-str{color:var(--ink)}\n.cell-img{height:30px;width:30px;object-fit:cover;border-radius:5px;border:1px solid var(--line-2);vertical-align:middle;background:repeating-conic-gradient(#1a1d24 0 25%,#14161b 0 50%) 50%/10px 10px}\n.cell-imn{color:var(--dim);margin-left:7px;font-size:11px}\n.cell-ts{color:var(--j-num);background:rgba(255,171,112,.09);border:1px solid rgba(255,171,112,.2);border-radius:4px;padding:1px 7px;font-size:11px;white-space:nowrap}\n.col-grip{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;z-index:5}\n.col-grip:hover{background:linear-gradient(90deg,transparent,var(--brand))}\n.col-grip:active{background:var(--brand)}\n.tbl-note{padding:6px 12px;font-size:10.5px;color:var(--dimmer);border-bottom:1px solid var(--line);background:var(--bg-2);flex:none}\n.prev-frame{width:100%;height:100%;border:0;background:#fff}\n.prev-img-wrap{padding:18px;display:flex;align-items:flex-start;justify-content:center;height:100%;overflow:auto}\n.prev-img-wrap img{max-width:100%;background:repeating-conic-gradient(#1a1d24 0% 25%, #14161b 0% 50%) 50%/18px 18px;border:1px solid var(--line)}\n\n.statusbar{display:flex;align-items:center;gap:16px;padding:0 14px;border-top:1px solid var(--line);background:var(--bg-2);font-size:10.5px;color:var(--dimmer);letter-spacing:.03em}\n.statusbar .msg{flex:1;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}\n.statusbar .msg.ok{color:var(--ok)} .statusbar .msg.err{color:var(--err)} .statusbar .msg.warn{color:var(--warn)}\n.statusbar .seg-r{display:flex;gap:16px}\n.statusbar b{color:var(--dim);font-weight:600}\n\n.modal-bg{position:fixed;inset:0;background:rgba(5,6,9,.66);backdrop-filter:blur(3px);z-index:100;display:none;align-items:center;justify-content:center}\n.modal-bg.open{display:flex}\n.modal{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;width:min(460px,92cqw);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);overflow:hidden;animation:pop .16s ease;max-height:88vh;overflow-y:auto}\n.modal.wide{width:min(620px,94cqw)}\n@keyframes pop{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}\n.modal h3{font-family:var(--disp);font-weight:700;font-size:16px;padding:16px 18px 4px}\n.modal .sub{padding:0 18px 14px;color:var(--dim);font-size:11.5px;line-height:1.6}\n.modal .field{padding:0 18px 12px}\n.modal label{display:block;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dimmer);margin-bottom:6px}\n.modal input,.modal select{width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink)}\n.modal input:focus,.modal select:focus{border-color:var(--brand)}\n.modal .acts{display:flex;align-items:center;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line);margin-top:6px}\n.curl-ta{width:100%;min-height:150px;resize:vertical;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word}\n.env-tabs{display:flex;gap:5px;flex-wrap:wrap;padding:0 18px 12px}\n.env-tab{font-size:11.5px;color:var(--dim);padding:5px 11px;border:1px solid var(--line);border-radius:20px;transition:.13s}\n.env-tab:hover{color:var(--ink);border-color:var(--line-2)}\n.env-tab.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}\n.env-tab.add{color:var(--dimmer)}\n.env-vars{border:1px solid var(--line);border-radius:var(--r);overflow:hidden}\n\n.toast{position:fixed;bottom:38px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;background:var(--surface-3);border:1px solid var(--line-2);color:var(--ink);padding:9px 16px;border-radius:30px;font-size:12px;z-index:120;transition:.22s;pointer-events:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.6)}\n.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}\n.toast b{color:var(--brand)}\n\n/* ===== \u5BB9\u5668\u67E5\u8BE2\uFF1A\u7A84\u9762\u677F\u7D27\u51D1\u5E03\u5C40 ===== */\n@container (max-width:880px){\n  :root{--side:0px}\n  .hint{display:none}\n  .nav-hint{display:none}\n  .split.h .req-region{width:46%}\n  .reqbar{flex-wrap:wrap}\n  .topbar{flex-wrap:wrap;height:auto;min-height:var(--topbar);padding:6px 10px}\n  .env-sel{max-width:150px}\n  .db-side{width:168px}\n  .cm{min-height:280px}\n}\n@container (max-width:560px){\n  .nav-tabs .nav-tab{padding:0 9px;font-size:11px}\n  .nav-tabs .nav-tab .tcn{font-size:12px}\n  .brand small{display:none}\n  .env-sel{max-width:110px}\n  .top-act{padding:0 8px;font-size:11px}\n  .db-side{display:none}\n  .cm-list{width:120px}\n  .cm{min-height:240px}\n  .db-conn{padding:18px 14px}\n  .db-conn .db-card{padding:16px 16px}\n}\n\n/* ===== \u6570\u636E\u5E93\u5DE5\u5177 ===== */\n.db-conn{position:absolute;inset:0;overflow:auto;padding:30px 28px}\n.db-conn .db-card{max-width:560px;margin:0 auto;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));padding:22px 24px}\n.db-conn h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:12px}\n.db-conn .sub{color:var(--dim);font-size:11.5px;line-height:1.7;margin-bottom:16px}\n.db-row{display:flex;gap:10px;align-items:center;margin-bottom:11px}\n.db-row label{width:104px;flex:none;font-size:11px;color:var(--dim);letter-spacing:.04em;text-align:right}\n.db-row .t-in{font-size:13px;padding:9px 12px}\n.db-row.inline{justify-content:flex-start;gap:14px}\n.db-row.inline .ckbox{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}\n.db-row.inline .ckbox input{accent-color:var(--brand);width:14px;height:14px}\n.db-acts{display:flex;gap:9px;margin-top:6px;padding-left:114px}\n@container (max-width:620px){ .db-row{flex-direction:column;align-items:stretch} .db-row label{width:auto;text-align:left} .db-acts{padding-left:0} }\n\n.db-main{flex:1;display:flex;min-height:0}\n.db-side{width:218px;flex:none;border-right:1px solid var(--line);overflow:hidden;padding:0;background:var(--bg-2);display:flex;flex-direction:column}\n.db-side .db-side-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:8px 8px 6px;display:flex;align-items:center;gap:6px;flex-shrink:0;border-bottom:1px solid var(--line)}\n.db-side .db-side-h .db-sel-btn{width:20px;height:20px;border-radius:var(--r-sm);color:var(--dimmer);font-size:11px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}\n.db-side .db-side-h .db-sel-btn:hover{color:var(--brand);background:var(--surface)}\n.db-side-search{padding:6px 8px;flex-shrink:0}\n.db-side-search .t-in{font-size:11.5px;padding:6px 9px;background:var(--surface)}\n.db-side-tabs{display:flex;gap:0;padding:0 8px;flex-shrink:0;border-bottom:1px solid var(--line)}\n.db-side-tab{flex:1;padding:5px 0;font-size:11px;text-align:center;color:var(--dimmer);border-bottom:2px solid transparent;cursor:pointer;transition:.12s}\n.db-side-tab:hover{color:var(--dim)}\n.db-side-tab.on{color:var(--brand);border-bottom-color:var(--brand)}\n.db-side-scroll{flex:1;min-height:0;overflow:auto;padding:0 8px 8px}\n.dbt{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 9px;border-radius:var(--r-sm);color:var(--dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.dbt:hover{background:var(--surface);color:var(--ink)}\n.dbt.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}\n.dbt .dbt-n{flex:1;overflow:hidden;text-overflow:ellipsis}\n.dbt .dbt-pk{font-size:9px;color:var(--j-num)}\n.dbt .dbt-cols{font-size:9px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:0 6px;min-width:18px;text-align:center;line-height:1.6}\n.dbt.dbt-db .dbt-icon{font-size:13px;flex:none}\n.dbt.dbt-db .dbt-n{color:var(--ink);font-weight:500}\n.dbt-hist{position:relative;align-items:flex-start;white-space:normal}\n.dbt-hist .dbt-sql{flex:1;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--ink);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal}\n.dbt-hist .dbt-meta{font-size:9px;color:var(--dimmer);white-space:nowrap;flex:none;margin-top:2px}\n.dbt-hist .dbt-acts{display:none;gap:3px;position:absolute;right:4px;top:3px}\n.dbt-hist:hover .dbt-acts{display:flex}\n.dbt-hist:hover .dbt-meta{display:none}\n.dbt-hist-act{width:20px;height:20px;border-radius:3px;color:var(--dimmer);font-size:10px;display:inline-flex;align-items:center;justify-content:center}\n.dbt-hist-act:hover{background:var(--surface-2);color:var(--ink)}\n.hist-empty{color:var(--dimmer);font-size:11px;padding:20px 8px;text-align:center}\n.db-ctx{position:fixed;z-index:90;min-width:170px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .16s ease}\n.db-ctx-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);text-align:left;transition:.1s;white-space:nowrap}\n.db-ctx-item:hover{background:var(--surface-3);color:var(--ink)}\n.db-ctx-sep{height:1px;background:var(--line);margin:4px 6px}\n/* \u81EA\u52A8\u8865\u5168\u6D6E\u5C42 */\n.db-ac{position:fixed;z-index:95;max-width:340px;max-height:260px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:3px 0;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .12s ease;font-size:12px}\n.db-ac-item{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:5px 10px;font-size:12px;color:var(--dim);transition:.1s;white-space:nowrap;cursor:pointer;border-radius:var(--r-sm)}\n.db-ac-item:hover{background:var(--surface);color:var(--ink)}\n.db-ac-item.on{background:var(--surface);box-shadow:inset 2px 0 0 var(--brand);color:var(--ink)}\n.db-ac-item small{font-size:10px;color:var(--dimmer);margin-left:auto;padding-left:8px}\n.db-ac-badge{flex:none;font-size:9px;font-weight:700;letter-spacing:.04em;padding:1px 5px;border-radius:3px;margin-right:6px;line-height:1.4}\n.db-ac-keyword .db-ac-badge{color:var(--j-key);background:rgba(121,192,255,.12)}\n.db-ac-table .db-ac-badge{color:var(--j-num);background:rgba(255,171,112,.12)}\n.db-ac-column .db-ac-badge{color:var(--j-str);background:rgba(165,214,164,.12)}\n.db-right{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}\n.db-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line);flex:none}\n.db-toolbar-left{display:flex;align-items:center;gap:8px}\n.db-toolbar-center{flex:1}\n.db-toolbar-right{display:flex;align-items:center;gap:5px}\n.db-schema-sel{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:var(--r-sm);background:var(--surface);font-size:11px;color:var(--dim);cursor:pointer;border:1px solid var(--line);transition:.12s}\n.db-schema-sel:hover{border-color:var(--line-2);color:var(--ink)}\n.db-editor{flex:none;position:relative;border-bottom:none;overflow:hidden}\n/* \u884C\u53F7 + \u9AD8\u4EAE + textarea \u5BB9\u5668 */\n.db-editor-inner{display:flex;min-height:100%}\n.db-gutter{flex:none;width:42px;padding:8px 6px 8px 0;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--dimmer);text-align:right;user-select:none;pointer-events:none;overflow:hidden;background:transparent;white-space:pre}\n.db-gutter b{color:var(--dim);font-weight:400}\n.db-editor-text{flex:1;position:relative;min-width:0}\n.db-overlay{position:absolute;inset:0;margin:0;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:transparent;pointer-events:none;white-space:pre;overflow:hidden;background:transparent}\n.db-editor textarea{width:100%;display:block;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--ink);background:transparent;height:100%;box-sizing:border-box;white-space:pre;overflow-wrap:normal;overflow-x:auto}\n.db-editor textarea::placeholder{color:var(--dimmer)}\n.db-editor textarea:focus{background:rgba(255,122,89,.02)}\n.db-splitter{height:3px;background:var(--line);cursor:row-resize;flex:none;transition:background .15s;position:relative}\n.db-splitter:hover,.db-splitter.active{background:var(--brand)}\n.db-splitter::before{content:'';position:absolute;top:-3px;bottom:-3px;left:0;right:0}\n.db-result{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}\n.db-result-bar{display:flex;align-items:center;padding:4px 10px;border-bottom:1px solid var(--line);flex:none;gap:8px}\n.db-result-bar .note{flex:1;font-size:11px;color:var(--dim)}\n.db-result-bar .note strong{color:var(--j-num);font-weight:600}\n.db-export-btn{padding:3px 8px;border-radius:var(--r-sm);color:var(--dimmer);font-size:10px;cursor:pointer;border:1px solid var(--line);transition:.12s}\n.db-export-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}\n.db-sb-row{display:flex;gap:8px;padding:6px 10px}\n.db-sb-row .t-in{font-size:12px;padding:6px 10px}\n.db-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim);white-space:nowrap}\n.db-chip .dotc{width:8px;height:8px;border-radius:50%;background:var(--ok)}\n.db-prev{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--ink);max-height:42vh;overflow:auto;font-family:var(--mono);transition:border-color .2s}\n.db-prev:not(:empty){border-color:var(--warn);background:rgba(210,153,34,.04)}\n.db-kv{display:flex;gap:10px;align-items:center;margin-bottom:9px}\n.db-kv label{width:140px;flex:none;font-size:11px;color:var(--j-key);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.db-kv label small{color:var(--dimmer)}\n.db-kv .t-in{font-size:12.5px;padding:8px 11px}\n\n/* ===== \u8FDE\u63A5\u7BA1\u7406\u5668 ===== */\n.cm{display:flex;height:100%;min-height:280px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));overflow:hidden}\n.cm-list{width:200px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--bg-2)}\n.cm-list-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:10px 10px 6px}\n.cm-list-items{flex:1;overflow:auto;padding:0 4px 4px}\n.cm-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;font-size:12px}\n.cm-item:hover{background:var(--surface)}\n.cm-item.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}\n.cm-dot{width:8px;height:8px;border-radius:50%;flex:none}\n.cm-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.cm-item-host{font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}\n.cm-item-del{width:18px;height:18px;border-radius:3px;color:var(--dimmer);font-size:10px;display:none;align-items:center;justify-content:center}\n.cm-item:hover .cm-item-del{display:inline-flex}\n.cm-item-del:hover{background:var(--surface);color:var(--err)}\n.cm-add{margin:6px;padding:6px 10px;border-radius:var(--r-sm);color:var(--dim);font-size:11px;border:1px dashed var(--line);text-align:center;transition:.12s;cursor:pointer}\n.cm-add:hover{color:var(--brand);border-color:var(--brand)}\n.cm-form{flex:1;padding:16px 20px;overflow:auto}\n.cm-form h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:14px}\n.cm-colors{display:flex;gap:6px;flex:1}\n.cm-color{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:.12s}\n.cm-color:hover{transform:scale(1.2)}\n.cm-color.on{border-color:var(--ink);box-shadow:0 0 8px rgba(255,255,255,.2)}\n.cm-remember{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dim);padding-left:114px;margin-bottom:8px}\n.cm-remember input{accent-color:var(--brand);width:14px;height:14px}\n.cm-sec{font-size:10.5px;color:var(--dimmer);padding-left:114px;margin-top:6px;line-height:1.5}\n.cm-acts{display:flex;gap:8px;margin-top:10px;padding-left:114px}\n.cm-btn-danger{color:var(--err);font-size:11px}\n.cm-btn-danger:hover{text-decoration:underline}\n@container (max-width:640px){ .cm{flex-direction:column} .cm-list{width:100%;max-height:150px;border-right:none;border-bottom:1px solid var(--line)} .cm-remember,.cm-acts,.cm-sec{padding-left:0} }\n\n/* ============================================================\n   AI \u52A9\u624B \u2014 \u72EC\u7ACB\u9875\u9762 + \u6D6E\u7A97 + \u914D\u7F6E\u9762\u677F\n   ============================================================ */\n\n/* ===== AI \u72EC\u7ACB\u9875\u9762 ===== */\n.ai-page{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}\n.ai-topbar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}\n.ai-cfg-sel{position:relative}\n.ai-cfg-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--r-sm);border:1px solid var(--line);font-size:12px;color:var(--ink);background:var(--surface);cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ai-cfg-btn:hover{border-color:var(--line-2)}\n.ai-cfg-menu{position:absolute;top:34px;left:0;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:90;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}\n.ai-cfg-menu.open{display:block}\n.ai-cfg-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--ink);transition:.12s}\n.ai-cfg-item:hover{background:var(--surface-3)}\n.ai-cfg-item.on{box-shadow:inset 2px 0 0 var(--brand)}\n.ai-cfg-dot{width:8px;height:8px;border-radius:50%;flex:none}\n.ai-ctx-toggle{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dim);cursor:pointer}\n.ai-ctx-toggle input{accent-color:var(--brand);width:13px;height:13px}\n\n.ai-main{flex:1;display:flex;min-height:0;overflow:hidden}\n.ai-sidebar{width:220px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}\n.ai-side-head{padding:10px 12px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}\n.ai-side-list{flex:1;overflow-y:auto;padding:4px}\n.ai-convo-item{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--dim);transition:.12s}\n.ai-convo-item:hover{background:var(--surface-2);color:var(--ink)}\n.ai-convo-item.on{background:var(--surface-3);color:var(--ink);box-shadow:inset 2px 0 0 var(--brand)}\n.ai-convo-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ai-convo-del{opacity:0;font-size:10px;color:var(--dimmer);padding:2px 4px;border-radius:3px;transition:.12s}\n.ai-convo-item:hover .ai-convo-del{opacity:1}\n.ai-convo-del:hover{color:var(--err)}\n\n.ai-chat{flex:1;display:flex;flex-direction:column;min-height:0}\n.ai-ctx-bar{padding:6px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}\n.ai-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}\n.ai-empty{padding:40px 20px;text-align:center;color:var(--dimmer);font-size:13px;line-height:1.8}\n\n/* Messages */\n.ai-msg{padding:10px 14px;border-radius:var(--r);max-width:88%;animation:aiMsgIn .2s ease}\n.ai-msg.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}\n.ai-msg.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}\n.ai-msg.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}\n.ai-msg.error{align-self:flex-start;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:var(--err);font-size:12px}\n.ai-msg-role{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--dimmer);margin-bottom:4px;text-transform:uppercase}\n.ai-msg.user .ai-msg-role{color:rgba(0,0,0,.4)}\n.ai-msg-body{font-size:13px;line-height:1.65;word-break:break-word}\n.ai-msg-body p{margin:0 0 8px}\n.ai-msg-body p:last-child{margin-bottom:0}\n.ai-msg-body ul{margin:4px 0;padding-left:20px}\n.ai-msg-body li{margin:2px 0}\n.ai-msg-body strong{color:var(--ink)}\n@keyframes aiMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}\n\n/* Code blocks in AI messages */\n.ai-code-block{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;margin:6px 0;overflow-x:auto;font-size:12px;line-height:1.6;white-space:pre}\n.ai-code-inline{background:var(--surface-3);padding:1px 5px;border-radius:3px;font-size:12px;color:var(--j-str)}\n\n/* Input bar */\n.ai-input-bar{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line);flex:none}\n.ai-input{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink);resize:none;min-height:38px;max-height:120px;line-height:1.5}\n.ai-input:focus{border-color:var(--brand)}\n.ai-input::placeholder{color:var(--dimmer)}\n\n/* ===== AI Config Modal ===== */\n.ai-cfg-body{display:flex;gap:0;min-height:360px}\n.ai-cfg-list{width:180px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column}\n.ai-cfg-list-head{padding:10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}\n.ai-cfg-list-items{flex:1;overflow-y:auto;padding:4px}\n.ai-cfg-form{flex:1;padding:12px 16px;overflow-y:auto}\n\n/* ===== AI \u6D6E\u7A97 ===== */\n#aiFloatHost{position:fixed;z-index:110;pointer-events:none;inset:0}\n.ai-fab{position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(255,122,89,.4);transition:.18s;z-index:110;pointer-events:auto;border:none}\n.ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(255,122,89,.55)}\n\n.ai-float{position:fixed;right:24px;bottom:80px;width:420px;height:520px;background:var(--surface);border:1px solid var(--line-2);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 24px 60px -16px rgba(0,0,0,.8);z-index:111;pointer-events:auto;animation:aiFloatIn .2s ease;overflow:hidden}\n@keyframes aiFloatIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}\n.ai-float-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);cursor:move;user-select:none}\n.ai-float-title{font-family:var(--disp);font-weight:700;font-size:13px;color:var(--ink)}\n.ai-float-cfg{font-size:11px;color:var(--dim);cursor:pointer;padding:3px 8px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.12s}\n.ai-float-cfg:hover{border-color:var(--line-2);color:var(--ink)}\n.ai-float-act{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);color:var(--dim);font-size:12px;cursor:pointer;transition:.12s}\n.ai-float-act:hover{background:var(--surface-2);color:var(--ink)}\n.ai-float-ctx{padding:5px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}\n.ai-float-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}\n.ai-float-empty{padding:30px 10px;text-align:center;color:var(--dimmer);font-size:12px}\n.ai-fm{padding:8px 11px;border-radius:var(--r);max-width:90%;font-size:12.5px;line-height:1.55;word-break:break-word;animation:aiMsgIn .2s ease}\n.ai-fm.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}\n.ai-fm.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}\n.ai-fm.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}\n.ai-fm.error{align-self:flex-start;color:var(--err);font-size:11px}\n.ai-fm pre{margin:0;white-space:pre-wrap;font-size:11px}\n\n.ai-float-input{display:flex;align-items:flex-end;gap:6px;padding:8px 10px;border-top:1px solid var(--line);flex:none}\n.ai-float-ctx-btn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);font-size:14px;cursor:pointer;transition:.12s;flex:none;border:none}\n.ai-float-ctx-btn:hover{background:var(--surface-2)}\n.ai-float-text{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:7px 10px;font-size:12.5px;color:var(--ink);resize:none;min-height:32px;max-height:80px;line-height:1.4}\n.ai-float-text:focus{border-color:var(--brand)}\n.ai-float-text::placeholder{color:var(--dimmer)}\n\n.ai-float-cfg-menu{position:absolute;top:38px;left:0;min-width:180px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:120;box-shadow:0 16px 40px -12px rgba(0,0,0,.7)}\n\n/* ============================================================\n   \u9762\u677F\u6A21\u5F0F\u8986\u76D6\uFF1A\u628A\u6240\u6709 fixed \u6D6E\u5C42\u9650\u5236\u5728\u9762\u677F\u5BB9\u5668\u5185\uFF0C\u907F\u514D\u6EA2\u51FA\u5BBF\u4E3B UI\u3002\n   panel.jsx \u901A\u8FC7 setPanelMode(true) \u5728\u5BB9\u5668\u6DFB\u52A0 data-panel-mode \u5C5E\u6027\u3002\n   ============================================================ */\n.polaris-api-client-panel .cell-tip,\n.polaris-api-client-panel .modal-bg,\n.polaris-api-client-panel .toast,\n.polaris-api-client-panel .db-ctx,\n.polaris-api-client-panel .db-ac,\n.polaris-api-client-panel #aiFloatHost,\n.polaris-api-client-panel .ai-fab,\n.polaris-api-client-panel .ai-float{position:absolute}\n.polaris-api-client-panel .ai-fab{right:14px;bottom:14px}\n.polaris-api-client-panel .ai-float{right:14px;bottom:60px;width:min(420px, calc(100% - 28px));max-height:calc(100% - 80px);height:auto}\n\n/* ===== \u6A21\u5F0F\u5207\u6362\u680F ===== */\n.polaris-api-client-panel .mode-bar{display:flex;align-items:center;gap:8px;flex-shrink:0;padding:5px 10px;border-bottom:1px solid var(--line);background:var(--bg-2)}\n.polaris-api-client-panel .mode-btn{height:24px;padding:0 12px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer;font-size:10.5px;border-radius:var(--r-sm)}\n.polaris-api-client-panel .mode-btn:hover{color:var(--ink);background:var(--surface)}\n.polaris-api-client-panel .mode-btn.active{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.1)}\n.polaris-api-client-panel .mode-lbl{font-size:10px;color:var(--dimmer);white-space:nowrap}\n.polaris-api-client-panel .mode-select{height:24px;padding:0 8px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);color:var(--dim);font-size:10.5px;max-width:260px}\n.polaris-api-client-panel .server-badge{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:3px 8px;border-radius:4px;background:rgba(68,147,248,.1);border:1px solid rgba(68,147,248,.2);font-size:10px;color:var(--m-post)}\n\n/* ===== \u5B9A\u5236\u6A21\u677F\u9762\u677F ===== */\n.polaris-api-client-panel .custom-panel{border-bottom:1px solid var(--line);background:var(--bg-2);flex-shrink:0}\n.polaris-api-client-panel .custom-bar{display:flex;align-items:center;gap:8px;padding:5px 10px}\n.polaris-api-client-panel .template-form{border-top:1px dashed var(--line);padding:8px 10px}\n.polaris-api-client-panel .tf-title{font-size:10px;color:var(--dimmer);margin-bottom:6px;letter-spacing:.04em}\n.polaris-api-client-panel .tf-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:200px;overflow:auto}\n.polaris-api-client-panel .tf-field{margin-bottom:4px}\n.polaris-api-client-panel .tf-field label{display:block;font-size:10px;color:var(--dim);margin-bottom:2px}\n.polaris-api-client-panel .tf-field .tf-req{color:var(--err)}\n.polaris-api-client-panel .tf-field .tf-extra{color:var(--warn);font-size:9px}\n.polaris-api-client-panel .tf-field input,.polaris-api-client-panel .tf-field textarea{width:100%;padding:4px 6px;border-radius:3px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:11px;outline:none}\n.polaris-api-client-panel .tf-field input:focus,.polaris-api-client-panel .tf-field textarea:focus{border-color:var(--brand-line)}\n.polaris-api-client-panel .tf-field textarea{min-height:36px;resize:vertical}\n.polaris-api-client-panel .custom-hint{padding:4px 10px;font-size:10px;color:var(--brand);background:rgba(255,122,89,.1);border-top:1px solid var(--brand-line)}\n\n/* ===== \u5185\u8054\u4EE3\u7801\u751F\u6210 ===== */\n.polaris-api-client-panel .codegen-inline{border-bottom:1px solid var(--line);background:var(--bg-2);flex-shrink:0}\n.polaris-api-client-panel .codegen-hd{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--line);font-size:11px}\n.polaris-api-client-panel .codegen-langs{display:flex;gap:3px}\n.polaris-api-client-panel .lang-btn{height:22px;padding:0 8px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer;font-size:10px;border-radius:3px}\n.polaris-api-client-panel .lang-btn:hover{color:var(--ink);border-color:var(--line-2)}\n.polaris-api-client-panel .lang-btn.active{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.1)}\n.polaris-api-client-panel .codegen-bd{position:relative}\n.polaris-api-client-panel .codegen-bd pre{padding:10px;margin:0;font-family:var(--mono);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow:auto;color:var(--ink)}\n.polaris-api-client-panel .codegen-copy{position:absolute;top:6px;right:6px;font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--line);cursor:pointer;color:var(--dimmer);background:var(--surface-2)}\n.polaris-api-client-panel .codegen-copy:hover{color:var(--ink)}\n\n/* ===== Auth \u9762\u677F ===== */\n.polaris-api-client-panel .auth-panel{padding:8px 10px}\n.polaris-api-client-panel .auth-panel .seg{display:flex;gap:2px;background:var(--surface);border-radius:5px;padding:2px;margin-bottom:8px}\n.polaris-api-client-panel .auth-panel .seg button{height:24px;padding:0 10px;border:none;background:none;color:var(--dim);cursor:pointer;font-size:11px;border-radius:4px}\n.polaris-api-client-panel .auth-panel .seg button.on{background:var(--brand);color:var(--brand-ink);font-weight:600}\n.polaris-api-client-panel .auth-field{margin-bottom:6px}\n.polaris-api-client-panel .auth-field label{display:block;font-size:10px;color:var(--dimmer);margin-bottom:2px}\n.polaris-api-client-panel .auth-field input{width:100%;height:28px;padding:0 8px;border-radius:4px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:12px;outline:none}\n.polaris-api-client-panel .auth-field input:focus{border-color:var(--brand-line)}\n.polaris-api-client-panel .auth-hint{font-size:10px;color:var(--dimmer);padding:4px 0}\n.polaris-api-client-panel .gh-hint{font-size:10px;color:var(--dimmer);padding:6px 8px;border-bottom:1px dashed var(--line)}\n\n/* ===== \u54CD\u5E94\u53CC\u89C6\u56FE\u6807\u7B7E ===== */\n.polaris-api-client-panel .res-tabs{display:flex;align-items:center;border-bottom:1px solid var(--line);flex-shrink:0;padding:0 10px;background:var(--bg-2)}\n.polaris-api-client-panel .res-tab{height:28px;padding:0 12px;border:none;background:none;color:var(--dim);cursor:pointer;font-size:11px;border-bottom:2px solid transparent}\n.polaris-api-client-panel .res-tab:hover{color:var(--ink)}\n.polaris-api-client-panel .res-tab.active{color:var(--brand);border-bottom-color:var(--brand)}\n.polaris-api-client-panel .res-tab-acts{display:flex;align-items:center;gap:4px;margin-left:auto;padding:3px 0}\n.polaris-api-client-panel .res-tab-acts .tbtn{height:20px;padding:0 8px;border:1px solid var(--line);background:var(--surface);color:var(--dimmer);cursor:pointer;font-size:10px;border-radius:3px}\n.polaris-api-client-panel .res-tab-acts .tbtn:hover{color:var(--ink);border-color:var(--line-2)}\n.polaris-api-client-panel .font-sel{height:20px;padding:0 4px;border-radius:3px;border:1px solid var(--line);background:var(--surface);color:var(--dim);font-size:10px}\n\n/* ===== \u670D\u52A1\u5668\u7BA1\u7406 ===== */\n.polaris-api-client-panel .srv-row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line)}\n.polaris-api-client-panel .srv-input{height:26px;padding:0 6px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink);font-size:11px;outline:none}\n.polaris-api-client-panel .srv-input:focus{border-color:var(--brand-line)}\n";

// src/core/dom.js
var _root = document;
function setRoot(el2) {
  _root = el2 || document;
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

// src/core/http.js
var BINARY = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;
function tryJSON(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false };
  }
}

// src/core/json-view.js
var _persist = () => {
};
var _rerender = () => {
};
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
    document.body.appendChild(menu);
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

// src/core/parser.js
function parseCurl(text) {
  const toks = tokenizeCurl(text.trim());
  if (toks[0] === "curl") toks.shift();
  const headers = [];
  let method = null, url = "";
  const dataArgs = [];
  let getFlag = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const nx = () => toks[++i] || "";
    if (t === "-X" || t === "--request") method = nx() || "GET";
    else if (t.startsWith("-X") && t.length > 2) method = t.slice(2);
    else if (t === "-H" || t === "--header") addHeader(headers, nx());
    else if (t.startsWith("-H") && t.length > 2) addHeader(headers, t.slice(2));
    else if (["-d", "--data", "--data-raw", "--data-ascii", "--data-binary", "--data-urlencode"].includes(t)) dataArgs.push(nx());
    else if (t.startsWith("-d") && t.length > 2) dataArgs.push(t.slice(2));
    else if (t === "-u" || t === "--user") {
      try {
        headers.push({ id: uid2(), enabled: true, key: "Authorization", value: "Basic " + btoa(nx()) });
      } catch (e) {
      }
    } else if (t === "-b" || t === "--cookie") headers.push({ id: uid2(), enabled: true, key: "Cookie", value: nx() });
    else if (t === "-A" || t === "--user-agent") headers.push({ id: uid2(), enabled: true, key: "User-Agent", value: nx() });
    else if (t === "-e" || t === "--referer") headers.push({ id: uid2(), enabled: true, key: "Referer", value: nx() });
    else if (t === "-G" || t === "--get") getFlag = true;
    else if (t === "--url") url = nx();
    else if (["--compressed", "-L", "--location", "-k", "--insecure", "-s", "--silent", "-S", "--show-error", "-i", "--include", "-v", "--verbose", "-f", "--fail", "-#", "--progress-bar", "-N", "--no-buffer"].includes(t)) {
    } else if (t.startsWith("-")) {
    } else if (!url) url = t;
  }
  if (!method) method = dataArgs.length && !getFlag ? "POST" : "GET";
  method = method.toUpperCase();
  let body = dataArgs.join("&");
  if (getFlag && body) {
    url += (url.includes("?") ? "&" : "?") + body;
    body = "";
  }
  const ct = headers.find((h) => h.key.toLowerCase() === "content-type");
  let bodyType = "none";
  if (body) {
    if (ct && /json/i.test(ct.value)) bodyType = "json";
    else if (/^\s*[\[{]/.test(body)) bodyType = "json";
    else bodyType = "text";
  }
  if (bodyType === "json") {
    try {
      body = JSON.stringify(JSON.parse(body), null, 2);
    } catch (e) {
    }
  }
  const params = [];
  let urlWithoutQuery = url;
  const qIdx = url.indexOf("?");
  if (qIdx >= 0) {
    urlWithoutQuery = url.slice(0, qIdx);
    url.slice(qIdx + 1).split("&").forEach((p) => {
      if (!p) return;
      const eq = p.indexOf("=");
      params.push({ id: uid2(), enabled: true, key: decodeURIComponent(eq >= 0 ? p.slice(0, eq) : p), value: decodeURIComponent(eq >= 0 ? p.slice(eq + 1) : "") });
    });
  }
  params.push({ id: uid2(), enabled: true, key: "", value: "" });
  return { method, url: urlWithoutQuery, headers, params, body, bodyType };
}
function tokenizeCurl(s) {
  s = s.replace(/\\\r?\n/g, " ");
  const out = [];
  let cur = "", q = null, started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"') {
        cur += s[++i] || "";
      } else cur += c;
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
function addHeader(headers, val) {
  const i = val.indexOf(":");
  if (i < 0) {
    headers.push({ id: uid2(), enabled: true, key: val.trim(), value: "" });
    return;
  }
  headers.push({ id: uid2(), enabled: true, key: val.slice(0, i).trim(), value: val.slice(i + 1).trim() });
}
function uid2() {
  return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function toCurl(request, env) {
  const rv = (s) => env ? resolveVars(s, env) : s;
  const Q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  let url = rv(request.url || "");
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = "https://" + url;
  const parts = ["curl -X " + request.method + " " + Q(url)];
  const headers = {};
  if (request.headers) request.headers.filter((h) => (h.enabled !== false || h.on !== false) && (h.key || h.k)).forEach((h) => headers[rv(h.key || h.k)] = rv(h.value || h.v || ""));
  let body = null;
  if (!["GET", "HEAD"].includes(request.method)) {
    if (request.bodyType === "json") {
      body = rv(request.body || "");
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    } else if (request.bodyType === "text") body = rv(request.body || "");
    else if (request.bodyType === "form" && Array.isArray(request.formBody)) body = request.formBody.filter((f) => (f.enabled !== false || f.on !== false) && (f.key || f.k)).map((f) => encodeURIComponent(rv(f.key || f.k)) + "=" + encodeURIComponent(rv(f.value || f.v || ""))).join("&");
  }
  Object.entries(headers).forEach(([k, v]) => parts.push("-H " + Q(k + ": " + v)));
  if (body) parts.push("--data-raw " + Q(body));
  return parts.join(" \\\n  ");
}
function generateCode(request, language, env) {
  const rv = (s) => env ? resolveVars(s, env) : s;
  let url = rv(request.url || "");
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = "https://" + url;
  const headers = {};
  if (request.headers) request.headers.filter((h) => (h.enabled !== false || h.on !== false) && (h.key || h.k)).forEach((h) => headers[rv(h.key || h.k)] = rv(h.value || h.v || ""));
  const method = (request.method || "GET").toUpperCase();
  let body = null;
  if (!["GET", "HEAD"].includes(method)) {
    if (request.bodyType === "json") body = rv(request.body || "");
    else if (request.bodyType === "text") body = rv(request.body || "");
  }
  const codes = {
    curl: toCurl(request, env),
    python: `import requests

url = ${JSON.stringify(url)}
headers = ${JSON.stringify(headers)}
response = requests.${method.toLowerCase()}(url, headers=headers${body ? ", json=" + body : ""})
print(response.json())`,
    js: `const response = await fetch(${JSON.stringify(url)}, {
  method: ${JSON.stringify(method)},
  headers: ${JSON.stringify(headers)}
${body ? ",  body: " + JSON.stringify(body) : ""}
})
const data = await response.json()
console.log(data)`,
    go: `package main

import (
  "fmt"
  "io/ioutil"
  "net/http"
)

func main() {
  url := ${JSON.stringify(url)}
  req, _ := http.NewRequest(${JSON.stringify(method)}, url, nil)
  ${Object.entries(headers).map(([k, v]) => `req.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join("\n  ")}
  client := &http.Client{}
  resp, _ := client.Do(req)
  body, _ := ioutil.ReadAll(resp.Body)
  fmt.Println(string(body))
}`,
    rust: `use reqwest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let client = reqwest::Client::new();
  let resp = client.${method.toLowerCase()}(${JSON.stringify(url)})${Object.entries(headers).map(([k, v]) => `
    .header(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join("")}
    .send().await?;
  println!("{:#?}", resp.text().await?);
  Ok(())
}`
  };
  return codes[language] || codes.curl;
}

// src/core/store.js
var KEYS = {
  tabs: "polaris.http.tabs.v2",
  collections: "polaris.http.collections.v2",
  envs: "polaris.http.envs.v2",
  ui: "polaris.http.ui.v2",
  history: "polaris.http.history.v2",
  templates: "polaris.http.templates.v2",
  globalHeaders: "polaris.http.globalHeaders.v2",
  servers: "polaris.http.servers.v2"
};
var clone = (o) => o === void 0 ? void 0 : JSON.parse(JSON.stringify(o));
var Store = class {
  constructor() {
    this._listeners = {};
    this._data = {};
    this._loadAll();
  }
  _loadAll() {
    for (const [key, lsKey] of Object.entries(KEYS)) {
      try {
        const raw = localStorage.getItem(lsKey);
        this._data[key] = raw ? JSON.parse(raw) : void 0;
      } catch (e) {
        this._data[key] = void 0;
      }
    }
  }
  get(key) {
    return clone(this._data[key]);
  }
  set(key, value) {
    this._data[key] = clone(value);
    try {
      localStorage.setItem(KEYS[key], JSON.stringify(this._data[key]));
    } catch (e) {
    }
    this._emit(key, clone(value));
  }
  update(key, patch) {
    const cur = this._data[key];
    if (cur && typeof cur === "object") this.set(key, { ...cur, ...patch });
    else this.set(key, patch);
  }
  subscribe(key, fn) {
    ;
    (this._listeners[key] ||= []).push(fn);
    return () => {
      const list = this._listeners[key];
      if (list) this._listeners[key] = list.filter((f) => f !== fn);
    };
  }
  _emit(key, value) {
    ;
    (this._listeners[key] || []).forEach((fn) => {
      try {
        fn(value);
      } catch (e) {
        console.error("[polaris-http store]", e);
      }
    });
  }
};
var store = new Store();

// src/tools/api.js
var LS_TABS = "pac.tabs.v2";
var LS_COL = "pac.collections.v2";
var LS_ENV = "pac.envs.v2";
var LS_UI = "pac.ui.v2";
var LS_SRV = "pac.servers.v2";
var LS_TMPL = "pac.templates.v2";
var state = { tabs: [], activeTab: null, collections: [], envs: [], activeEnv: null };
var ui = { sideCollapsed: false, layout: "v", reqH: 240, reqW: 520, proxyOn: false, resFont: 13, resTab: "data", mode: "http", curLang: "curl", fullscreen: false };
var servers = [];
var templates = [];
var _panelMode = false;
var _proxyBase = "http://127.0.0.1:9861";
var _syncingForm = false;
var onSendToChat = null;
function setApiPanelMode(on, proxyBase) {
  _panelMode = !!on;
  if (proxyBase) _proxyBase = proxyBase;
  if (on) ui.proxyOn = true;
}
var blankRow = () => ({ id: uid(), on: true, k: "", v: "" });
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
    authType: "bearer",
    authToken: "",
    authUsername: "",
    authPassword: "",
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
    response: null,
    _templateId: null,
    _formData: null
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
    localStorage.setItem(LS_SRV, JSON.stringify(servers));
    localStorage.setItem(LS_TMPL, JSON.stringify(templates));
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
  try {
    const s = JSON.parse(localStorage.getItem(LS_SRV) || "null");
    if (Array.isArray(s)) servers = s;
  } catch (e) {
  }
  try {
    const t = JSON.parse(localStorage.getItem(LS_TMPL) || "null");
    if (Array.isArray(t)) templates = t;
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
    const local = { id: uid(), name: "\u672C\u5730 Local", baseUrl: "http://127.0.0.1:8080", vars: [blankRow()] };
    state.envs = [demo, local];
    state.activeEnv = demo.id;
  }
  if (!state.collections.length) {
    state.collections = [{
      id: uid(),
      name: "\u793A\u4F8B \xB7 DEMO",
      collapsed: false,
      requests: [
        sreq("\u7528\u6237\u5217\u8868", "GET", "{{baseUrl}}/users"),
        sreq("\u5355\u4E2A Todo", "GET", "{{baseUrl}}/todos/1"),
        sreq("\u65B0\u5EFA Post", "POST", "{{baseUrl}}/posts", { bodyType: "json", body: JSON.stringify({ title: "hello", body: "world", userId: 1 }, null, 2), headers: [{ id: uid(), on: true, k: "Authorization", v: "Bearer {{token}}" }, blankRow()] })
      ]
    }];
  }
  if (!servers.length) {
    servers = [
      { id: uid(), name: "\u751F\u4EA7\u73AF\u5883", url: "https://api.example.com" },
      { id: uid(), name: "\u6D4B\u8BD5\u73AF\u5883", url: "https://test-api.example.com" },
      { id: uid(), name: "\u672C\u5730\u5F00\u53D1", url: "http://localhost:8080" }
    ];
  }
  if (!templates.length) {
    templates = [
      { id: uid(), name: "\u521B\u5EFA\u7528\u6237", method: "POST", url: "/api/users", bodyType: "json", bodyFields: [{ name: "name", label: "\u7528\u6237\u540D", type: "text", required: true }, { name: "email", label: "\u90AE\u7BB1", type: "text", required: true }, { name: "age", label: "\u5E74\u9F84", type: "number", required: false }] },
      { id: uid(), name: "\u67E5\u8BE2\u7528\u6237", method: "GET", url: "/api/users/{id}", bodyType: "none", bodyFields: [{ name: "id", label: "\u7528\u6237 ID", type: "number", required: true }] }
    ];
  }
}
function curEnv() {
  return state.envs.find((e) => e.id === state.activeEnv);
}
function resolveVars2(str) {
  if (str == null || String(str).indexOf("{{") < 0) return str;
  const env = curEnv();
  return String(str).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g, (m, key) => {
    if (key.startsWith("$")) return resolveDynamic(key);
    if (!env) return m;
    if (key === "baseUrl") return env.baseUrl || "";
    const v = (env.vars || []).find((r) => r.on && r.k === key);
    return v ? v.v : m;
  });
}
function resolveDynamic(key) {
  switch (key) {
    case "$guid":
    case "$uuid":
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => (c === "x" ? Math.random() * 16 | 0 : Math.random() * 16 | 0 & 3 | 8).toString(16));
    case "$timestamp":
      return String(Math.floor(Date.now() / 1e3));
    case "$timestampMs":
      return String(Date.now());
    case "$isoTimestamp":
      return (/* @__PURE__ */ new Date()).toISOString();
    case "$randomInt":
      return String(Math.floor(Math.random() * 1e4));
    case "$randomFloat":
      return String(Math.random().toFixed(4));
    case "$localDate":
      return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    case "$localTime":
      return (/* @__PURE__ */ new Date()).toTimeString().slice(0, 8);
    default:
      return "{{" + key + "}}";
  }
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
        confirmModal("\u5220\u9664\u73AF\u5883\u300C" + env.name + "\u300D\uFF1F", (ok2) => {
          if (ok2) {
            state.envs = state.envs.filter((e) => e.id !== env.id);
            if (state.activeEnv === env.id) state.activeEnv = state.envs[0] ? state.envs[0].id : null;
            selId = state.envs[0] && state.envs[0].id;
            render();
          }
        });
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
function renderServers() {
  const sel = $("#serverSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">\u65E0</option>';
  servers.forEach((s) => {
    const o = el("option");
    o.value = s.id;
    o.textContent = s.name + " (" + s.url + ")";
    sel.appendChild(o);
  });
  const add = el("option");
  add.value = "__manage";
  add.textContent = "\u2699 \u7BA1\u7406\u670D\u52A1\u5668...";
  sel.appendChild(add);
}
function onServerChange(sel) {
  if (sel.value === "__manage") {
    sel.value = "";
    openServerManager();
    return;
  }
  const badge = $("#serverBadge"), text = $("#serverBadgeText");
  if (sel.value) {
    const srv = servers.find((s) => s.id === sel.value);
    if (srv) {
      text.textContent = srv.name + ": " + srv.url;
      badge.style.display = "flex";
      const t = activeTab();
      if (t && t.url) {
        try {
          const u = new URL(t.url.indexOf("{{") >= 0 ? t.url.replace(/\{\{[^}]+\}\}/g, "x") : t.url);
          const newUrl = srv.url + u.pathname + u.search + u.hash;
          t.url = newUrl;
          $("#url").value = newUrl;
          markDirty(t);
          updateResolvedPreview();
          persist();
        } catch (e) {
        }
      }
    }
  } else {
    badge.style.display = "none";
  }
}
function replaceServerUrl() {
  const sel = $("#serverSelect");
  if (!sel.value) return;
  const srv = servers.find((s) => s.id === sel.value);
  if (!srv) return;
  const t = activeTab();
  if (!t || !t.url) return;
  try {
    const u = new URL(t.url.indexOf("{{") >= 0 ? t.url.replace(/\{\{[^}]+\}\}/g, "x") : t.url);
    const newUrl = srv.url + u.pathname + u.search + u.hash;
    t.url = newUrl;
    $("#url").value = newUrl;
    markDirty(t);
    updateResolvedPreview();
    persist();
    setStatus("\u5DF2\u66FF\u6362\u670D\u52A1\u5668 URL", "ok");
  } catch (e) {
    setStatus("URL \u65E0\u6548", "warn");
  }
}
function openServerManager() {
  const bg = $("#modalBg");
  const m = el("div", "modal");
  m.innerHTML = '<h3>\u7BA1\u7406\u670D\u52A1\u5668</h3><div class="sub">\u670D\u52A1\u5668\u5217\u8868\u7528\u4E8E\u5FEB\u901F\u66FF\u6362 URL \u57DF\u540D\u3002</div>';
  const list = el("div");
  list.style.cssText = "max-height:240px;overflow:auto";
  function renderList() {
    list.innerHTML = "";
    servers.forEach((s, i) => {
      const row = el("div", "srv-row");
      row.innerHTML = '<input class="srv-input" value="' + esc(s.name) + '" placeholder="\u540D\u79F0" /><input class="srv-input" value="' + esc(s.url) + '" placeholder="https://..." style="flex:1" /><button class="btn icon ghost" style="font-size:14px;color:var(--err)" onclick="window.__delSrv(' + i + ')">\xD7</button>';
      const ni = row.querySelectorAll("input")[0], ui2 = row.querySelectorAll("input")[1];
      ni.oninput = () => {
        s.name = ni.value;
        persist();
      };
      ui2.oninput = () => {
        s.url = ui2.value;
        persist();
      };
      list.appendChild(row);
    });
  }
  renderList();
  m.appendChild(list);
  const acts = el("div", "acts");
  const sp = el("div");
  sp.style.flex = "1";
  const add = el("button", "btn", "+ \u6DFB\u52A0\u670D\u52A1\u5668");
  add.onclick = () => {
    servers.push({ id: uid(), name: "\u65B0\u670D\u52A1\u5668", url: "https://" });
    renderList();
    persist();
  };
  const done = el("button", "btn primary", "\u5B8C\u6210");
  done.onclick = close;
  acts.append(add, sp, done);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  window.__delSrv = (i) => {
    servers.splice(i, 1);
    renderList();
    persist();
    renderServers();
  };
  function close() {
    bg.classList.remove("open");
    bg.innerHTML = "";
    renderServers();
  }
}
function renderTemplates() {
  const sel = $("#templateSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">\u8BF7\u9009\u62E9...</option>';
  templates.forEach((t) => {
    const o = el("option");
    o.value = t.id;
    o.textContent = t.name + " (" + t.method + " " + t.url + ")";
    sel.appendChild(o);
  });
}
function onTemplateSelect(sel) {
  const t = activeTab();
  if (!t) return;
  if (!sel.value) {
    $("#templateForm").style.display = "none";
    $("#customHint").style.display = "none";
    return;
  }
  const tmpl = templates.find((x) => x.id === sel.value);
  if (!tmpl) return;
  t._templateId = tmpl.id;
  t.method = tmpl.method;
  t.url = tmpl.url;
  t.bodyType = tmpl.bodyType || "none";
  generateTemplateForm(tmpl, t._formData || {});
  $("#customHint").style.display = "block";
  markDirty(t);
  persist();
  renderRequestBar();
  renderReqEditor();
}
function saveTemplate() {
  const t = activeTab();
  if (!t) return;
  promptModal("\u4FDD\u5B58\u6A21\u677F", "\u8F93\u5165\u6A21\u677F\u540D\u79F0\uFF1A", t.name + " \u6A21\u677F", (name) => {
    if (!name) return;
    const fields = [];
    if (t.bodyType === "json" && t.body) {
      try {
        Object.keys(JSON.parse(t.body)).forEach((k) => fields.push({ name: k, label: k, type: "text", required: false }));
      } catch (e) {
      }
    }
    const tmpl = { id: uid(), name, method: t.method, url: t.url, bodyType: t.bodyType, bodyFields: fields.length ? fields : [{ name: "param", label: "\u53C2\u6570", type: "text", required: false }] };
    templates.push(tmpl);
    persist();
    renderTemplates();
    setStatus("\u5DF2\u4FDD\u5B58\u6A21\u677F\u300C" + name + "\u300D", "ok");
  });
}
function generateTemplateForm(tmpl, savedData) {
  const form = $("#templateFields");
  if (!form) return;
  form.innerHTML = "";
  const allFields = tmpl.bodyFields || [];
  const extraKeys = /* @__PURE__ */ new Set();
  if (tmpl.bodyType === "json") {
    const t = activeTab();
    if (t && t.body) {
      try {
        Object.keys(JSON.parse(t.body)).forEach((k) => {
          if (!allFields.find((f) => f.name === k)) extraKeys.add(k);
        });
      } catch (e) {
      }
    }
  }
  allFields.forEach((f) => {
    const div = el("div", "tf-field");
    const val = savedData[f.name] || "";
    const req = f.required ? ' <span class="tf-req">*</span>' : "";
    div.innerHTML = "<label>" + esc(f.label) + req + "</label>";
    if (f.type === "json") {
      const ta = el("textarea");
      ta.placeholder = f.name;
      ta.value = val;
      ta.oninput = () => syncFormToBody();
      div.appendChild(ta);
    } else if (f.type === "number") {
      const inp = el("input");
      inp.type = "number";
      inp.placeholder = f.name;
      inp.value = val;
      inp.oninput = () => syncFormToBody();
      div.appendChild(inp);
    } else if (f.type === "checkbox") {
      const lb = el("label");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = val === true || val === "true";
      cb.onchange = () => syncFormToBody();
      lb.appendChild(cb);
      lb.appendChild(document.createTextNode(" " + esc(f.label)));
      div.appendChild(lb);
    } else {
      const inp = el("input");
      inp.type = "text";
      inp.placeholder = f.name;
      inp.value = val;
      inp.oninput = () => syncFormToBody();
      div.appendChild(inp);
    }
    form.appendChild(div);
  });
  extraKeys.forEach((k) => {
    const div = el("div", "tf-field");
    div.innerHTML = "<label>" + esc(k) + ' <span class="tf-extra">(\u989D\u5916)</span></label>';
    const inp = el("input");
    inp.type = "text";
    inp.placeholder = k;
    inp.value = savedData[k] || "";
    inp.oninput = () => syncFormToBody();
    div.appendChild(inp);
    form.appendChild(div);
  });
  $("#templateForm").style.display = "block";
}
function syncFormToBody() {
  if (_syncingForm) return;
  const t = activeTab();
  if (!t) return;
  const tmpl = templates.find((x) => x.id === t._templateId);
  if (!tmpl) return;
  const fields = tmpl.bodyFields || [];
  const data = {};
  fields.forEach((f) => {
    const inp = $("#templateFields").querySelector('input[placeholder="' + f.name + '"],textarea[placeholder="' + f.name + '"]');
    if (inp) {
      if (f.type === "number") data[f.name] = inp.value ? Number(inp.value) : null;
      else if (f.type === "checkbox") data[f.name] = inp.checked;
      else data[f.name] = inp.value;
    }
  });
  $$("#templateFields .tf-field").forEach((fd) => {
    const lbl = fd.querySelector("label");
    const inp = fd.querySelector("input,textarea");
    if (lbl && inp && lbl.textContent.includes("(\u989D\u5916)")) {
      const key = lbl.textContent.replace(/\s*\(额外\)\s*/, "").trim();
      if (key && !fields.find((f) => f.name === key)) data[key] = inp.value;
    }
  });
  t._formData = data;
  if (t.bodyType === "json") {
    t.body = JSON.stringify(data, null, 2);
    _syncingForm = true;
    renderReqEditor();
    _syncingForm = false;
  }
  markDirty(t);
  persist();
}
function getGlobalHeaders() {
  return store.get("globalHeaders") || [];
}
function renderGlobalHeadersPane() {
  const t = activeTab();
  if (!t || t.reqTab !== "global") return;
  const pane = $("#reqPane");
  pane.innerHTML = "";
  const wrap = el("div");
  const hint = el("div", "gh-hint", "\u5168\u5C40 Headers \u81EA\u52A8\u5408\u5E76\u5230\u6240\u6709\u8BF7\u6C42\u3002\u82E5\u8BF7\u6C42\u4E2D\u5DF2\u6709\u540C\u540D Header\uFF0C\u4EE5\u8BF7\u6C42\u4E3A\u51C6\u3002");
  wrap.appendChild(hint);
  const headers = getGlobalHeaders();
  const rows = clone(headers);
  if (!rows.length || rows[rows.length - 1].k || rows[rows.length - 1].v) rows.push(blankRow());
  wrap.appendChild(kvEditor(rows, { kPlace: "Header \u540D", vPlace: "Header \u503C", onChange: () => {
    const cleaned = rows.filter((r) => r.k);
    store.set("globalHeaders", cleaned);
  } }));
  pane.appendChild(wrap);
}
function renderAuthPane() {
  const t = activeTab();
  if (!t || t.reqTab !== "auth") return;
  const pane = $("#reqPane");
  pane.innerHTML = "";
  const wrap = el("div", "auth-panel");
  const seg = el("div", "seg");
  [["bearer", "Bearer Token"], ["basic", "Basic Auth"]].forEach(([v, l]) => {
    const b = el("button", t.authType === v ? "on" : "", l);
    b.onclick = () => {
      t.authType = v;
      markDirty(t);
      persist();
      renderAuthPane();
    };
    seg.appendChild(b);
  });
  wrap.appendChild(seg);
  if (t.authType === "bearer") {
    const f = el("div", "auth-field");
    f.innerHTML = "<label>Token</label>";
    const inp = el("input");
    inp.type = "password";
    inp.value = t.authToken || "";
    inp.placeholder = "eyJhbGciOiJIUzI1NiIs...";
    inp.onfocus = () => inp.type = "text";
    inp.onblur = () => {
      if (!inp.value) inp.type = "password";
    };
    inp.oninput = () => {
      t.authToken = inp.value;
      markDirty(t);
      persist();
    };
    f.appendChild(inp);
    wrap.appendChild(f);
  } else {
    const f1 = el("div", "auth-field");
    f1.innerHTML = "<label>\u7528\u6237\u540D</label>";
    const i1 = el("input");
    i1.type = "text";
    i1.value = t.authUsername || "";
    i1.placeholder = "admin";
    i1.oninput = () => {
      t.authUsername = i1.value;
      markDirty(t);
      persist();
    };
    f1.appendChild(i1);
    wrap.appendChild(f1);
    const f2 = el("div", "auth-field");
    f2.innerHTML = "<label>\u5BC6\u7801</label>";
    const i2 = el("input");
    i2.type = "password";
    i2.value = t.authPassword || "";
    i2.onfocus = () => i2.type = "text";
    i2.onblur = () => {
      if (!i2.value) i2.type = "password";
    };
    i2.oninput = () => {
      t.authPassword = i2.value;
      markDirty(t);
      persist();
    };
    f2.appendChild(i2);
    wrap.appendChild(f2);
  }
  const hint = el("div", "auth-hint", "\u81EA\u52A8\u586B\u5145\u5230 Authorization \u5934");
  wrap.appendChild(hint);
  pane.appendChild(wrap);
}
function renderTabs() {
  const bar = $("#tabbar");
  bar.innerHTML = "";
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
    tab.querySelector(".tn").ondblclick = (e) => {
      e.stopPropagation();
      promptModal("\u91CD\u547D\u540D Tab", "\u8F93\u5165\u65B0\u540D\u79F0\uFF1A", t.name, (v) => {
        if (v) {
          t.name = v.trim() || t.name;
          renderTabs();
          persist();
        }
      });
    };
    bar.appendChild(tab);
  });
  const add = el("button", "tab-add", "+");
  add.title = "\u65B0\u5EFA\u8BF7\u6C42 tab";
  add.onclick = () => {
    const nt = newTab();
    state.tabs.push(nt);
    state.activeTab = nt.id;
    renderAll();
    persist();
  };
  bar.appendChild(add);
  $("#stTabs").textContent = state.tabs.length;
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
    const r = resolveVars2(t.url);
    box.innerHTML = "\u2192 <b>" + esc(r) + "</b>";
  } else box.innerHTML = "";
}
function renderReqEditor() {
  const t = activeTab();
  $$("#reqSubtabs .subtab").forEach((b) => b.classList.toggle("active", b.dataset.rt === t.reqTab));
  const pane = $("#reqPane");
  pane.innerHTML = "";
  if (t.reqTab === "params") {
    pane.appendChild(kvEditor(t.params, { kPlace: "\u53C2\u6570\u540D", vPlace: "\u53C2\u6570\u503C", onChange: () => {
      markDirty(t);
      syncParamsToUrl(t);
      persist();
    } }));
  } else if (t.reqTab === "headers") {
    pane.appendChild(kvEditor(t.headers, { kPlace: "Header \u540D", vPlace: "Header \u503C", onChange: () => {
      markDirty(t);
      persist();
    } }));
  } else if (t.reqTab === "body") {
    renderBodyEditor(pane, t);
  } else if (t.reqTab === "auth") {
    renderAuthPane();
  } else if (t.reqTab === "global") {
    renderGlobalHeadersPane();
  }
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
      if (!_syncingForm) t._formData = null;
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
  let url = resolveVars2(t.url.trim());
  if (!url) {
    setStatus("\u8BF7\u5148\u8F93\u5165 URL", "warn");
    $("#url").focus();
    return;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) url = "https://" + url;
  const headers = {};
  t.headers.filter((r) => r.on && r.k).forEach((r) => headers[resolveVars2(r.k)] = resolveVars2(r.v));
  const globalHeaders = getGlobalHeaders();
  globalHeaders.filter((h) => h.on !== false && h.k).forEach((h) => {
    if (!Object.keys(headers).some((k) => k.toLowerCase() === h.k.toLowerCase())) headers[h.k] = h.v;
  });
  if (t.authType === "bearer" && t.authToken && !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")) headers["Authorization"] = "Bearer " + t.authToken;
  else if (t.authType === "basic" && t.authUsername && t.authPassword && !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")) {
    headers["Authorization"] = "Basic " + btoa(t.authUsername + ":" + t.authPassword);
  }
  let body;
  const method = t.method;
  if (!["GET", "HEAD"].includes(method)) {
    if (t.bodyType === "json") {
      body = resolveVars2(t.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    } else if (t.bodyType === "text") {
      body = resolveVars2(t.body);
    } else if (t.bodyType === "form") {
      body = t.formBody.filter((r) => r.on && r.k).map((r) => encodeURIComponent(resolveVars2(r.k)) + "=" + encodeURIComponent(resolveVars2(r.v))).join("&");
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }
  const btn = $("#sendBtn");
  btn.disabled = true;
  btn.innerHTML = "\u53D1\u9001\u4E2D\u2026";
  $("#resTabs").style.display = "none";
  $("#resStatus").style.display = "none";
  $("#resTools").style.display = "none";
  $("#resPane").innerHTML = '<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>';
  setStatus(method + " " + url + (ui.proxyOn ? " \xB7 \u7ECF\u4EE3\u7406" : "") + " \u2026");
  let fetchUrl = url, fetchHeaders = headers;
  if (ui.proxyOn) {
    fetchHeaders = Object.assign({}, headers, { "X-Polaris-Target": url });
    fetchUrl = _panelMode ? _proxyBase + "/__proxy" : "/__proxy";
  }
  const t0 = performance.now();
  try {
    if (t.response && t.response.blobUrl) {
      try {
        URL.revokeObjectURL(t.response.blobUrl);
      } catch (e) {
      }
    }
    const res = await fetch(fetchUrl, { method, headers: fetchHeaders, body, redirect: "follow" });
    const blob = await res.blob();
    const t1 = performance.now();
    const ct = res.headers.get("content-type") || "";
    const isBin = BINARY.test(ct);
    let text = "";
    if (!isBin) text = await blob.text();
    const resHeaders = {};
    res.headers.forEach((v, k) => resHeaders[k] = v);
    const parsed = tryJSON(text);
    t.response = {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      timeMs: t1 - t0,
      size: blob.size,
      contentType: ct,
      headers: resHeaders,
      text,
      isBinary: isBin,
      blobUrl: isBin ? URL.createObjectURL(blob) : null,
      url,
      parsed: parsed.ok ? parsed.value : void 0
    };
    t.respPath = "";
    t.respFilter = "";
    t.tableSel = null;
    t.colW = {};
    t.treeOpen = "auto";
    t.hiddenCols = {};
    t.sort = {};
    t.respView = parsed.ok ? Array.isArray(parsed.value) ? "table" : "object" : /text\/html/i.test(ct) ? "preview" : isBin && /^image\//i.test(ct) ? "preview" : "raw";
    renderResponse();
    setStatus(method + " " + res.status + " " + res.statusText + " \xB7 " + ms(t1 - t0) + " \xB7 " + bytes(blob.size), res.ok ? "ok" : "warn");
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
  if (ui.resTab === "data" && root !== void 0 && !t.respPath) {
    for (const key of ["data", "result", "response", "results", "items", "list"]) {
      if (root && typeof root === "object" && !Array.isArray(root) && key in root) {
        const g = getByPath(root, key);
        if (g.ok) {
          data = g.value;
          break;
        }
      }
    }
  }
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
  const pane = $("#resPane"), tabs = $("#resTabs"), sb = $("#resStatus"), tools = $("#resTools");
  if (!r) {
    tabs.style.display = "none";
    sb.style.display = "none";
    tools.style.display = "none";
    pane.innerHTML = '<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div>\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002</div>';
    return;
  }
  if (r.error) {
    tabs.style.display = "none";
    sb.style.display = "none";
    tools.style.display = "none";
    const corsHint = /Failed to fetch|NetworkError|load failed/i.test(r.error);
    pane.innerHTML = `<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u5931\u8D25</div><div>${esc(r.error)}</div>` + (corsHint ? `<div class="hintbox"><b>\u53EF\u80FD\u539F\u56E0\uFF1A</b>\u8DE8\u57DF CORS\u3001\u76EE\u6807\u65E0\u54CD\u5E94\u3001\u6DF7\u5408\u5185\u5BB9(HTTP/HTTPS)\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002` + (ui.proxyOn ? `<br>\u4EE3\u7406\u5DF2\u5F00\u542F\uFF0C\u8BF7\u786E\u4FDD\u5DF2\u8FD0\u884C\u670D\u52A1\u7AEF\u3002` : `<br>\u{1F449} \u70B9\u9876\u680F\u300C\u4EE3\u7406\u300D\u5F00\u542F\u4E2D\u7EE7\u4EE3\u7406\uFF0C\u53EF\u7ED5\u8FC7 CORS \u9650\u5236\u3002`) + `</div>` : "") + `<div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u8017\u65F6 ${ms(r.timeMs)} \xB7 ${esc(r.url)}</div></div>`;
    return;
  }
  sb.style.display = "flex";
  tabs.style.display = "flex";
  const cls = r.status >= 500 ? "s5" : r.status >= 400 ? "s4" : r.status >= 300 ? "s3" : "s2";
  const color = `var(--${cls})`;
  sb.innerHTML = `<span class="status-chip" style="color:${color}"><span class="dotc" style="background:${color}"></span>${r.status} ${esc(r.statusText)}</span><span class="res-meta"><span>\u8017\u65F6 <b>${ms(r.timeMs)}</b></span><span>\u5927\u5C0F <b>${bytes(r.size)}</b></span>${r.contentType ? `<span>\u7C7B\u578B <b>${esc(r.contentType.split(";")[0])}</b></span>` : ""}</span><span class="sp"></span><button class="tool" onclick="window.__copyRes()">\u29C9 \u590D\u5236</button><button class="tool" onclick="window.__dlRes()">\u2193 \u4E0B\u8F7D</button><button class="tool" onclick="window.__exportCurl()">cURL \u5BFC\u51FA</button><button class="tool" onclick="window.__askAI()">\u2726 AI</button>`;
  const baseHasJSON = r.parsed !== void 0;
  if (baseHasJSON) {
    tools.style.display = "flex";
    tools.innerHTML = "";
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
    const pi = el("input");
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
  renderRespBody();
}
function renderRespBody() {
  const t = activeTab();
  const r = t.response;
  if (!r || r.error) return;
  const d = getDrilled(t);
  const caps = { table: d.canTable, object: d.hasJSON, raw: true, preview: d.canPrev, headers: true };
  if (!caps[t.respView]) t.respView = d.hasJSON ? "object" : d.canPrev ? "preview" : "raw";
  const isT = t.respView === "table", isO = t.respView === "object", isR = t.respView === "raw";
  const pretty = t.prettyCells !== false;
  const pane = $("#resPane");
  pane.innerHTML = "";
  pane.style.fontSize = ui.resFont + "px";
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
function openCurlImport() {
  const bg = $("#modalBg");
  const m = el("div", "modal");
  m.innerHTML = '<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\u3002</div>';
  const f = el("div", "field");
  f.innerHTML = "<label>cURL \u547D\u4EE4</label>";
  const ta = el("textarea", "curl-ta");
  ta.placeholder = "curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx'";
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
        setStatus("\u672A\u80FD\u89E3\u6790\u51FA URL", "err");
        return;
      }
      const nt = newTab({
        name: "cURL: " + shortUrl(p.url),
        method: p.method,
        url: p.url,
        bodyType: p.bodyType,
        body: p.body,
        headers: (p.headers.length ? p.headers.map((h) => ({ id: uid(), on: true, k: h.key || h.k, v: h.value || h.v })) : []).concat([blankRow()])
      });
      syncUrlToParams(nt);
      nt.dirty = true;
      state.tabs.push(nt);
      state.activeTab = nt.id;
      renderAll();
      persist();
      close();
      setStatus("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A" + p.method + " " + p.url, "ok");
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
      promptModal("\u65B0\u5EFA\u5206\u7EC4", "\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A", "\u65B0\u5206\u7EC4", (gn) => {
        if (gn) {
          const g = { id: uid(), name: gn, collapsed: false, requests: [] };
          state.collections.push(g);
          gid = g.id;
          doSave(vals, gid);
        }
      });
      return;
    }
    doSave(vals, gid);
  });
  function doSave(vals, gid) {
    const g = state.collections.find((x) => x.id === gid);
    if (!g) return;
    const r = Object.assign({ id: uid(), name: vals.mName || "\u672A\u547D\u540D\u8BF7\u6C42" }, snapshot(t));
    g.requests.push(r);
    t.savedId = r.id;
    t.name = r.name;
    t.dirty = false;
    persist();
    renderTabs();
    renderSidebar();
    setStatus("\u5DF2\u4FDD\u5B58\u5230\u300C" + g.name + "\u300D", "ok");
  }
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
  state.tabs.push(t);
  state.activeTab = t.id;
  renderAll();
  persist();
  setStatus("\u5DF2\u8F7D\u5165\u300C" + r.name + "\u300D");
}
function deleteSaved(g, r) {
  confirmModal("\u5220\u9664\u5DF2\u4FDD\u5B58\u7684\u8BF7\u6C42\u300C" + r.name + "\u300D\uFF1F", (ok2) => {
    if (!ok2) return;
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
  });
}
function renameGroup(g) {
  promptModal("\u91CD\u547D\u540D\u5206\u7EC4", "\u5206\u7EC4\u540D\u79F0\uFF1A", g.name, (n) => {
    if (n) {
      g.name = n.trim() || g.name;
      persist();
      renderSidebar();
    }
  });
}
function deleteGroup(g) {
  confirmModal("\u5220\u9664\u5206\u7EC4\u300C" + g.name + "\u300D\u53CA\u5176\u4E2D " + g.requests.length + " \u4E2A\u8BF7\u6C42\uFF1F", (ok2) => {
    if (!ok2) return;
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
  });
}
function closeTab(t) {
  if (t.dirty && (t.url || t.savedId)) {
    confirmModal("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F", (ok2) => {
      if (ok2) doClose();
    });
    return;
  }
  doClose();
  function doClose() {
    const i = state.tabs.indexOf(t);
    state.tabs.splice(i, 1);
    if (!state.tabs.length) {
      const nt = newTab();
      state.tabs.push(nt);
      state.activeTab = nt.id;
    } else if (state.activeTab === t.id) state.activeTab = state.tabs[Math.max(0, i - 1)].id;
    renderAll();
    persist();
  }
}
function confirmModal(msg, onOk) {
  const bg = $("#modalBg");
  const m = el("div", "modal");
  m.innerHTML = '<h3>\u786E\u8BA4</h3><div class="sub">' + esc(msg) + "</div>";
  const acts = el("div", "acts");
  const sp = el("div");
  sp.style.flex = "1";
  const cancel = el("button", "btn ghost", "\u53D6\u6D88");
  cancel.onclick = close;
  const ok = el("button", "btn primary danger", "\u786E\u5B9A");
  ok.onclick = () => {
    close();
    onOk(true);
  };
  acts.append(sp, cancel, ok);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  m.querySelector("button.danger")?.focus();
  m.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  function close() {
    bg.classList.remove("open");
    bg.innerHTML = "";
    onOk(false);
  }
}
function promptModal(title, label, defaultValue, onOk) {
  const bg = $("#modalBg");
  const m = el("div", "modal");
  m.innerHTML = "<h3>" + esc(title) + '</h3><div class="sub">' + esc(label) + "</div>";
  const f = el("div", "field");
  const input = el("input");
  input.type = "text";
  input.value = defaultValue || "";
  f.appendChild(input);
  m.appendChild(f);
  const acts = el("div", "acts");
  const sp = el("div");
  sp.style.flex = "1";
  const cancel = el("button", "btn ghost", "\u53D6\u6D88");
  cancel.onclick = close;
  const ok = el("button", "btn primary", "\u786E\u5B9A");
  ok.onclick = () => {
    const v = input.value.trim();
    if (v) {
      close();
      onOk(v);
    }
  };
  acts.append(sp, cancel, ok);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  input.focus();
  input.select();
  m.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      ok.click();
    }
    ;
    if (e.key === "Escape") close();
  });
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  function close() {
    bg.classList.remove("open");
    bg.innerHTML = "";
    onOk(null);
  }
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
    const data = JSON.stringify({ version: 2, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), collections: state.collections, envs: state.envs }, null, 2);
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = "pac-export.json";
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
function askAI() {
  const t = activeTab();
  const r = t.response;
  if (!r || !onSendToChat) return;
  const summary = r.error ? `\u8BF7\u6C42\u5931\u8D25\uFF1A${r.error}` : `\u72B6\u6001 ${r.status} ${r.statusText}\uFF0C\u8017\u65F6 ${ms(r.timeMs)}\uFF0C\u5927\u5C0F ${bytes(r.size)}`;
  const bodyPreview = r.parsed !== void 0 ? JSON.stringify(r.parsed).slice(0, 2e3) : (r.text || "").slice(0, 2e3);
  const prompt = `\u5206\u6790\u4EE5\u4E0B API \u8BF7\u6C42\u4E0E\u54CD\u5E94\uFF0C\u7ED9\u51FA\u95EE\u9898\u8BCA\u65AD\u6216\u6570\u636E\u89E3\u8BFB\uFF1A

\u8BF7\u6C42\uFF1A${t.method} ${t.url}
\u54CD\u5E94\uFF1A${summary}
\u54CD\u5E94\u4F53\u9884\u89C8\uFF1A
${bodyPreview}`;
  onSendToChat(prompt);
}
function exportCurl() {
  const t = activeTab();
  if (!t || !t.url) {
    setStatus("\u8BF7\u5148\u586B\u5199 URL", "warn");
    return;
  }
  const curl = toCurl(t, curEnv());
  copy(curl, "cURL \u5DF2\u590D\u5236");
}
function toggleCodeGen() {
  const panel = $("#codeGenPanel");
  if (!panel) return;
  const open = panel.style.display !== "block";
  panel.style.display = open ? "block" : "none";
  if (open) generateCodeGen();
}
function generateCodeGen() {
  const t = activeTab();
  if (!t || !t.url) {
    $("#codeOutput").textContent = "\u8BF7\u5148\u586B\u5199 URL";
    return;
  }
  try {
    const code = generateCode(t, ui.curLang || "curl", curEnv());
    $("#codeOutput").textContent = code || "\u4EE3\u7801\u751F\u6210\u5931\u8D25";
  } catch (e) {
    $("#codeOutput").textContent = "\u4EE3\u7801\u751F\u6210\u5931\u8D25\uFF1A" + e.message;
  }
}
function switchLang(btn, lang) {
  ui.curLang = lang;
  persist();
  $$("#codeGenPanel .lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  generateCodeGen();
}
function copyCode() {
  const code = $("#codeOutput")?.textContent;
  if (code) copy(code, "\u4EE3\u7801\u5DF2\u590D\u5236");
}
function changeFont(v) {
  ui.resFont = parseInt(v);
  persist();
  const p = $("#resPane");
  if (p) p.style.fontSize = v + "px";
}
function expandLevel(n) {
  $$(".jt-children").forEach((c) => {
    c.style.display = "block";
    if (c.previousElementSibling) {
      const tog = c.previousElementSibling.querySelector(".jt-tog");
      if (tog) tog.textContent = "\u25BE";
    }
  });
  setStatus("\u5DF2\u5C55\u5F00", "ok");
}
function toggleFullscreen() {
  ui.fullscreen = !ui.fullscreen;
  const r = $("#resRegion") || $("#resPane")?.closest(".res-region");
  if (r) {
    r.style.position = ui.fullscreen ? "fixed" : "";
    r.style.inset = ui.fullscreen ? "0" : "";
    r.style.zIndex = ui.fullscreen ? "100" : "";
    r.style.background = ui.fullscreen ? "var(--bg)" : "";
    setStatus(ui.fullscreen ? "\u5168\u5C4F\u6A21\u5F0F" : "\u9000\u51FA\u5168\u5C4F", "ok");
  }
}
function setupGlobal() {
  window.__copyRes = () => {
    const t = activeTab();
    const d = getDrilled(t);
    if (!t.response || t.response.error) return;
    copy(d.hasJSON ? JSON.stringify(d.data, null, 2) : t.response.text || "", "\u5DF2\u590D\u5236");
  };
  window.__dlRes = () => downloadResp();
  window.__exportCurl = () => exportCurl();
  window.__askAI = () => askAI();
  window.__setPath = (p) => {
    const t = activeTab();
    t.respPath = p;
    renderRespBody();
  };
  window.__setFilter = (f) => {
    const t = activeTab();
    t.respFilter = f;
    renderRespBody();
  };
  window.__togglePretty = () => {
    const t = activeTab();
    t.prettyCells = t.prettyCells === false;
    persist();
    renderRespBody();
  };
  window.__expandAll = () => {
    $$(".jt-children").forEach((c) => c.style.display = "block");
  };
  window.__collapseAll = () => {
    $$(".jt-children").forEach((c) => c.style.display = "none");
  };
  window.__jtToggle = (el2) => {
    const next = el2.nextElementSibling;
    if (next) {
      const h = next.style.display === "none";
      next.style.display = h ? "block" : "none";
      el2.querySelector(".jt-tog").textContent = h ? "\u25BE" : "\u25B8";
    }
  };
  window.__onServerChange = (sel) => onServerChange(sel);
  window.__replaceServerUrl = () => replaceServerUrl();
  window.__onTemplateSelect = (sel) => onTemplateSelect(sel);
  window.__saveTemplate = () => saveTemplate();
  window.__copyCode = () => copyCode();
  window.__changeFont = (v) => changeFont(v);
  window.__expandLevel = (n) => expandLevel(n);
  window.__toggleFullscreen = () => toggleFullscreen();
}
function bindEvents() {
  $("#sendBtn").onclick = send;
  $("#saveBtn").onclick = saveCurrent;
  $("#curlBtn").onclick = () => copy(toCurl(activeTab(), curEnv()), "cURL \u5DF2\u590D\u5236");
  $("#curlImportBtn").onclick = openCurlImport;
  $("#codeGenBtn").onclick = toggleCodeGen;
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
      if (e.key === "Enter") send();
    });
  }
  $$("#reqSubtabs .subtab").forEach((b) => b.onclick = () => {
    activeTab().reqTab = b.dataset.rt;
    renderReqEditor();
    persist();
  });
  $$("#modeBar .mode-btn").forEach((b) => b.onclick = () => {
    $$("#modeBar .mode-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    ui.mode = b.dataset.mode;
    persist();
    $("#customPanel").style.display = ui.mode === "custom" ? "block" : "none";
    if (ui.mode === "custom") $("#customHint").style.display = "block";
  });
  $$("#resTabs .res-tab").forEach((b) => {
    if (b.dataset.rt) b.onclick = () => {
      $$("#resTabs .res-tab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      ui.resTab = b.dataset.rt;
      persist();
      if (activeTab()?.response) renderRespBody();
    };
  });
  $$("#codeGenPanel .lang-btn").forEach((b) => b.onclick = () => switchLang(b, b.dataset.lang));
  const srch = $("#search");
  if (srch) srch.addEventListener("input", renderSidebar);
  const ng = $("#newGroup");
  if (ng) ng.onclick = () => {
    promptModal("\u65B0\u5EFA\u5206\u7EC4", "\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A", "\u65B0\u5206\u7EC4", (n) => {
      if (n) {
        state.collections.push({ id: uid(), name: n.trim(), collapsed: false, requests: [] });
        persist();
        renderSidebar();
      }
    });
  };
  const lb = $("#layoutBtn");
  if (lb) lb.onclick = () => {
    ui.layout = ui.layout === "h" ? "v" : "h";
    applyLayout();
    persist();
  };
  const pb = $("#proxyBtn");
  if (pb) pb.onclick = () => {
    ui.proxyOn = !ui.proxyOn;
    applyProxyBtn();
    persist();
    setStatus(ui.proxyOn ? "\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406" : "\u5DF2\u5173\u95ED\u4EE3\u7406 \xB7 \u6D4F\u89C8\u5668\u76F4\u8FDE", "ok");
  };
  document.addEventListener("keydown", (e) => {
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
  b.innerHTML = ui.proxyOn ? "\u{1F6E1} \u4EE3\u7406:\u5F00" : "\u{1F6E1} \u4EE3\u7406:\u5173";
  b.style.color = ui.proxyOn ? "var(--brand)" : "";
  b.style.borderColor = ui.proxyOn ? "var(--brand)" : "";
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
  const defH = _panelMode ? 180 : 240, defW = _panelMode ? 320 : 520;
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
function initApi(options = {}) {
  onSendToChat = options.onSendToChat || null;
  bindMethodMenu();
  bindTopEvents();
  bindImportExport();
  bindEvents();
  bindDividerDrag();
  bindCellTooltip();
  setupGlobal();
  load();
  if (_panelMode) {
    ui.layout = "v";
    ui.sideCollapsed = true;
  }
  const main = $("#main");
  if (main) main.classList.toggle("collapsed", ui.sideCollapsed);
  applyLayout();
  applyProxyBtn();
  renderServers();
  renderTemplates();
  renderAll();
}

// src/panel.jsx
import { jsx } from "react/jsx-runtime";
var SPA_HTML = `
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
`;
function PolarisApiClientPanel({ pluginId, onSendToChat: onSendToChat2 }) {
  const containerRef = useRef(null);
  const initializedRef = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || initializedRef.current) return;
    container.innerHTML = SPA_HTML;
    try {
      const style = document.createElement("style");
      style.setAttribute("data-polaris-api-client", "");
      style.textContent = main_default;
      container.prepend(style);
    } catch (e) {
      console.warn("[Polaris API Client] CSS injection failed:", e);
    }
    setRoot(container);
    setApiPanelMode(true, "http://127.0.0.1:9861");
    initApi({ onSendToChat: onSendToChat2 });
    initializedRef.current = true;
    return () => {
      container.innerHTML = "";
      setRoot(document);
      initializedRef.current = false;
    };
  }, [onSendToChat2]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: containerRef,
      className: "polaris-api-client-panel",
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
  PolarisApiClientPanel as default
};
//# sourceMappingURL=panel.js.map
