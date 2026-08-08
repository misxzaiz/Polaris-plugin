// src/panel.jsx
import { useEffect, useRef } from "react";

// styles/main.css
var main_default = "/* ============================================================\n   RELAY \u2014 \u8BBE\u8BA1\u7CFB\u7EDF \xB7 \u7CBE\u5BC6\u4EEA\u8868 / obsidian + signal-coral\n   ============================================================ */\n:root{\n  --bg:#16181e; --bg-2:#1a1c24;\n  --surface:#1e2028; --surface-2:#252830; --surface-3:#2c2f3a;\n  --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.18);\n  --ink:#d8dae2; --dim:#a8acba; --dimmer:#6e7282;\n  --brand:#ff7a59; --brand-hi:#ff926f; --brand-ink:#1c0c06;\n  --brand-glow:0 0 0 1px rgba(255,122,89,.5), 0 0 22px -8px rgba(255,122,89,.7);\n  --m-get:#3fb950; --m-post:#4493f8; --m-put:#d29922; --m-patch:#a371f7; --m-del:#f85149; --m-other:#8b949e;\n  --s2:#3fb950; --s3:#58a6ff; --s4:#d29922; --s5:#f85149;\n  --ok:#3fb950; --warn:#d29922; --err:#f85149;\n  --j-key:#79c0ff; --j-str:#a5d6a4; --j-num:#ffab70; --j-bool:#d2a8ff; --j-null:#8b949e;\n  --mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;\n  --disp:'Bricolage Grotesque','JetBrains Mono',system-ui,sans-serif;\n  --r:7px; --r-sm:5px; --topbar:48px; --statusbar:26px; --tabsbar:38px; --side:266px;\n}\n*{margin:0;padding:0;box-sizing:border-box}\n/* \u72EC\u7ACB\u6A21\u5F0F\uFF08\u6D4F\u89C8\u5668\u6253\u5F00 index.html\uFF09\u4FDD\u7559 html/body \u5168\u5C4F\uFF1B\n   \u9762\u677F\u6A21\u5F0F\u4E0B\u4E0D\u4FEE\u6539\u5BBF\u4E3B html/body\uFF08panel.jsx \u8BBE\u7F6E :host \u5BB9\u5668\u4E3A .relay-devkit-panel\uFF09\u3002 */\nbody:not(.relay-host) html,body:not(.relay-host){height:100%}\n/* \u5BB9\u5668\u67E5\u8BE2\uFF1A\u72EC\u7ACB\u6A21\u5F0F body \u4E3A\u5BB9\u5668\uFF0C\u9762\u677F\u6A21\u5F0F .relay-devkit-panel \u4E3A\u5BB9\u5668\u3002\n   @container \u57FA\u4E8E\u300C\u5BB9\u5668\u81EA\u8EAB\u5BBD\u5EA6\u300D\u89E6\u53D1\uFF0C\u800C\u975E\u89C6\u53E3\uFF0C\u4F7F\u7A84\u9762\u677F\u81EA\u52A8\u7D27\u51D1\u5E03\u5C40\u3002 */\nbody:not(.relay-host){container-type:inline-size}\n.relay-devkit-panel{container-type:inline-size;position:relative}\n/* \u9762\u677F\u6839\u5BB9\u5668\u5185\u90E8\u5E03\u5C40\uFF08\u907F\u514D\u6C61\u67D3\u5BBF\u4E3B body\uFF09 */\n.relay-devkit-panel{background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}\nbody:not(.relay-host){background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column}\n/* \u80CC\u666F\u88C5\u9970 \u2014 \u72EC\u7ACB\u6A21\u5F0F fixed \u5728\u89C6\u53E3\u3001\u9762\u677F\u6A21\u5F0F absolute \u9650\u5236\u5728\u5BB9\u5668\u5185 */\nbody:not(.relay-host)::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;\n  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}\nbody:not(.relay-host)::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.45;\n  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}\n.relay-devkit-panel::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;\n  background:radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),var(--bg)}\n.relay-devkit-panel::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.45;\n  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:46px 46px}\n.relay-devkit-panel > *{position:relative;z-index:1}\n::selection{background:var(--brand);color:var(--brand-ink)}\n::-webkit-scrollbar{width:10px;height:10px}\n::-webkit-scrollbar-track{background:transparent}\n::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:6px;border:2px solid transparent;background-clip:padding-box}\n::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.16);background-clip:padding-box}\nbutton,input,select,textarea{font-family:inherit;font-size:inherit;color:inherit;background:none;border:none;outline:none}\nbutton{cursor:pointer}\ninput,textarea{caret-color:var(--brand)}\n\n.app{grid-template-rows:var(--topbar) 1fr var(--statusbar)}\n\n/* ===== \u5916\u58F3\uFF1A\u9876\u90E8\u5BFC\u822A + \u89C6\u56FE\u8DEF\u7531 ===== */\n.navbar{display:flex;align-items:center;gap:14px;height:42px;flex:none;padding:0 14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.03),transparent);backdrop-filter:blur(8px);position:relative;z-index:50}\n.nav-brand{display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:15px;color:var(--ink)}\n.nav-brand .dot{width:8px;height:8px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}\n.nav-brand small{font-family:var(--mono);font-weight:500;font-size:9px;letter-spacing:.22em;color:var(--dimmer)}\n.nav-tabs{display:flex;gap:2px;overflow-x:auto;overflow-y:hidden;max-width:100%}\n.nav-tabs::-webkit-scrollbar{height:0}\n.nav-tab{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 13px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);border:1px solid transparent;transition:.14s;letter-spacing:.01em}\n.nav-tab:hover{color:var(--ink);background:var(--surface-2)}\n.nav-tab.on{color:var(--brand);background:var(--surface-2);border-color:var(--line-2)}\n.nav-tab .tcn{font-size:13px;font-family:var(--disp)}\n.nav-sp{flex:1}\n.nav-hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em}\n#view{flex:1;min-height:0;position:relative}\n.view{position:absolute;inset:0;display:none;min-height:0}\n.view.on{display:flex;flex-direction:column}\n#viewApi.on{display:grid}\n\n/* ===== \u9996\u9875 ===== */\n.home{position:absolute;inset:0;overflow:auto;padding:54px 40px}\n.home-inner{max-width:1080px;margin:0 auto}\n.home-hero{margin-bottom:34px}\n.home-hero .eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--brand);margin-bottom:12px}\n.home-hero h1{font-family:var(--disp);font-weight:800;font-size:36px;letter-spacing:-.02em;margin-bottom:12px;line-height:1.1}\n.home-hero p{color:var(--dim);font-size:14px;max-width:640px;line-height:1.75}\n.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}\n.tool-card{display:flex;flex-direction:column;gap:11px;padding:20px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));cursor:pointer;transition:.16s;position:relative;overflow:hidden;text-align:left}\n.tool-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent,var(--brand));opacity:0;transition:.16s}\n.tool-card:hover{border-color:var(--line-2);transform:translateY(-2px);box-shadow:0 20px 44px -24px rgba(0,0,0,.85)}\n.tool-card:hover::before{opacity:1}\n.tool-card .ic{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;font-family:var(--disp);font-weight:700;background:color-mix(in srgb,var(--accent,var(--brand)) 15%,transparent);color:var(--accent,var(--brand))}\n.tool-card .nm{font-family:var(--disp);font-weight:700;font-size:16px;color:var(--ink)}\n.tool-card .ds{font-size:12px;color:var(--dim);line-height:1.65}\n.tool-card .go{margin-top:auto;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer);transition:.14s}\n.tool-card:hover .go{color:var(--accent,var(--brand))}\n\n/* ===== \u901A\u7528\u5DE5\u5177\u9762\u677F\uFF08JSON / SQL / \u65F6\u95F4\u6233\u5171\u7528\uFF09 ===== */\n.tool-pane{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}\n.t-bar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}\n.t-bar .t-title{font-family:var(--disp);font-weight:700;font-size:13px;margin-right:6px;display:flex;align-items:center;gap:7px}\n.t-bar .t-title .tg{color:var(--brand)}\n.t-bar .sp{flex:1}\n.t-btn{font-size:11.5px;color:var(--dim);padding:6px 11px;border:1px solid var(--line);border-radius:var(--r-sm);transition:.14s;white-space:nowrap}\n.t-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}\n.t-btn.on{color:var(--brand);border-color:var(--brand)}\n.t-btn.primary{color:var(--brand-ink);background:var(--brand);border-color:var(--brand);font-weight:700}\n.t-btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}\n.t-status{font-size:11px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}\n.t-status.ok{color:var(--ok)} .t-status.err{color:var(--err)}\n.t-seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}\n.t-seg button{padding:6px 13px;font-size:11.5px;color:var(--dim);transition:.13s}\n.t-seg button:hover{color:var(--ink);background:var(--surface)}\n.t-seg button.on{background:var(--surface-3);color:var(--ink)}\n\n/* JSON \u5DE5\u5177\uFF1A\u5DE6\u8F93\u5165 / \u53F3\u89C6\u56FE */\n.jsplit{flex:1;display:flex;min-height:0}\n.jspane-l{width:42%;min-width:180px;max-width:64%;display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0;position:relative}\n.jspane-r{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}\n.jspane-l textarea{flex:1;width:100%;resize:none;padding:13px;font-size:12.5px;line-height:1.65;background:transparent;color:var(--ink);white-space:pre;tab-size:2;min-height:0}\n.jspane-l textarea::placeholder{color:var(--dimmer)}\n.jdiv{width:7px;cursor:col-resize;flex:none;position:relative}\n.jdiv::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--line);transition:.15s}\n.jdiv:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}\n\n/* SQL / \u65F6\u95F4\u6233\uFF1A\u5355\u5217\u5185\u5BB9 */\n.t-body{flex:1;min-height:0;overflow:auto;padding:16px}\n.t-field{margin-bottom:14px}\n.t-field label{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);margin-bottom:7px}\n.t-ta{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:12px 13px;font-size:12.5px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word;tab-size:2;resize:vertical;min-height:64px;font-family:var(--mono)}\n.t-ta:focus{border-color:var(--brand)}\n.t-in{width:100%;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:14px;color:var(--ink);font-family:var(--mono)}\n.t-in:focus{border-color:var(--brand)}\n.t-out{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:13px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--ink);min-height:42px}\n.t-note{font-size:11px;color:var(--dimmer);margin-top:7px;line-height:1.6}\n.t-note.err{color:var(--err)} .t-note.ok{color:var(--ok)}\n.t-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}\n@container (max-width:760px){.t-grid{grid-template-columns:1fr}}\n.t-card{border:1px solid var(--line);border-radius:11px;padding:16px;background:var(--surface)}\n.t-card h4{font-family:var(--disp);font-weight:700;font-size:13px;margin-bottom:12px;color:var(--ink)}\n.kvline{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}\n.kvline:last-child{border-bottom:0}\n.kvline .kk{font-size:11px;color:var(--dim);width:92px;flex:none;letter-spacing:.04em}\n.kvline .vv{flex:1;font-size:13px;color:var(--ink);word-break:break-all;font-variant-numeric:tabular-nums}\n.kvline .cp{font-size:10.5px;color:var(--dimmer);border:1px solid var(--line);border-radius:4px;padding:2px 8px;flex:none;transition:.13s}\n.kvline .cp:hover{color:var(--brand);border-color:var(--brand)}\n.t-now{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:13px 16px;border:1px solid var(--line);border-radius:11px;background:var(--bg-2);margin-bottom:16px}\n.t-now .lab{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer)}\n.t-now .clk{font-family:var(--mono);font-size:15px;color:var(--brand);font-variant-numeric:tabular-nums}\n\n/* \u9876\u680F */\n.topbar{display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--line);\n  background:linear-gradient(180deg,rgba(255,255,255,.022),transparent);backdrop-filter:blur(8px);z-index:30}\n.brand{display:flex;align-items:center;gap:9px;font-family:var(--disp);font-weight:800;letter-spacing:-.01em;font-size:16px}\n.brand .dot{width:9px;height:9px;border-radius:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);transform:rotate(45deg)}\n.brand small{font-family:var(--mono);font-weight:500;font-size:10px;letter-spacing:.22em;color:var(--dimmer);text-transform:uppercase;margin-left:2px}\n.topbar .spacer{flex:1}\n.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:var(--r-sm);color:var(--dim);border:1px solid transparent;transition:.16s}\n.icon-btn:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line)}\n.top-act{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--r-sm);color:var(--dim);border:1px solid var(--line);font-size:11.5px;letter-spacing:.02em;transition:.15s;white-space:nowrap}\n.top-act:hover{color:var(--ink);background:var(--surface-2);border-color:var(--line-2)}\n.hint{font-size:10.5px;color:var(--dimmer);letter-spacing:.04em;display:flex;gap:14px}\n.hint kbd{font-family:var(--mono);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--dim);font-size:10px}\n\n/* \u73AF\u5883\u5207\u6362 */\n.env-wrap{position:relative}\n.env-sel{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--surface);transition:.15s;max-width:230px}\n.env-sel:hover{border-color:var(--dim)}\n.env-sel .ehex{color:var(--brand);font-size:13px}\n.env-sel #envName{font-size:12px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.env-sel .car{font-size:8px;color:var(--dim)}\n.env-menu{position:absolute;top:36px;right:0;min-width:230px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;z-index:80;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}\n.env-menu.open{display:block}\n.env-item{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:7px 10px;border-radius:var(--r-sm);transition:.12s}\n.env-item:hover{background:var(--surface-3)}\n.env-item.on{box-shadow:inset 2px 0 0 var(--brand)}\n.env-item span{font-size:12px;color:var(--ink)}\n.env-item small{font-size:10px;color:var(--dimmer)}\n.env-item.manage{border-top:1px solid var(--line);margin-top:4px;padding-top:9px;color:var(--dim)}\n.env-item.manage span,.env-item.manage{color:var(--dim);font-size:11.5px}\n\n.main{display:grid;grid-template-columns:var(--side) 1fr;min-height:0;overflow:hidden}\n.main.collapsed{grid-template-columns:0 1fr}\n\n/* \u4FA7\u680F */\n.side{border-right:1px solid var(--line);background:var(--bg-2);display:flex;flex-direction:column;min-height:0;overflow:hidden}\n.side-head{display:flex;align-items:center;gap:6px;padding:11px 12px;border-bottom:1px solid var(--line)}\n.side-head .t{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);font-weight:600;flex:1}\n.side-head .mini-btn{width:26px;height:26px;border-radius:var(--r-sm);color:var(--dim);display:inline-flex;align-items:center;justify-content:center;transition:.15s;border:1px solid transparent;font-size:13px}\n.side-head .mini-btn:hover{color:var(--brand);background:var(--surface);border-color:var(--line)}\n.side-search{padding:8px 10px;border-bottom:1px solid var(--line)}\n.side-search input{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 10px;font-size:12px;color:var(--ink);transition:.15s}\n.side-search input:focus{border-color:var(--line-2);background:var(--surface-2)}\n.side-search input::placeholder{color:var(--dimmer)}\n.tree{flex:1;overflow-y:auto;padding:6px 6px 40px}\n.group{margin-bottom:2px}\n.group-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;color:var(--dim);transition:.12s;user-select:none}\n.group-head:hover{background:var(--surface)}\n.group-head .caret{width:12px;font-size:9px;color:var(--dimmer);transition:transform .15s;flex:none;text-align:center}\n.group.collapsed .caret{transform:rotate(-90deg)}\n.group-head .gname{flex:1;font-size:12px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.group-head .gcount{font-size:10px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:1px 7px}\n.group-head .gact{display:none;gap:2px}\n.group-head:hover .gact{display:flex}\n.group-head:hover .gcount{display:none}\n.gact .x{width:20px;height:20px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}\n.gact .x:hover{color:var(--brand);background:var(--surface-2)}\n.group.collapsed .reqs{display:none}\n.reqs{padding:2px 0 4px 8px}\n.req-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;position:relative}\n.req-item:hover{background:var(--surface)}\n.req-item.active{background:var(--surface-2);box-shadow:inset 2px 0 0 var(--brand)}\n.req-item .mb{flex:none;font-size:9px;font-weight:700;letter-spacing:.03em;width:38px;text-align:right}\n.req-item .rn{flex:1;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.req-item .rx{display:none;width:18px;height:18px;border-radius:4px;align-items:center;justify-content:center;color:var(--dimmer);font-size:12px}\n.req-item:hover .rx{display:inline-flex}\n.req-item .rx:hover{color:var(--err);background:var(--surface-2)}\n.tree-empty{padding:24px 14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.8}\n.m-GET{color:var(--m-get)} .m-POST{color:var(--m-post)} .m-PUT{color:var(--m-put)}\n.m-PATCH{color:var(--m-patch)} .m-DELETE{color:var(--m-del)} .m-HEAD,.m-OPTIONS{color:var(--m-other)}\n\n/* \u5DE5\u4F5C\u533A */\n.work{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}\n.tabbar{display:flex;align-items:stretch;height:var(--tabsbar);min-height:var(--tabsbar);border-bottom:1px solid var(--line);background:var(--bg-2);overflow-x:auto;overflow-y:hidden}\n.tabbar::-webkit-scrollbar{height:0}\n.rtab{display:flex;align-items:center;gap:8px;padding:0 12px;border-right:1px solid var(--line);cursor:pointer;color:var(--dim);transition:.14s;white-space:nowrap;max-width:240px;position:relative;flex:none}\n.rtab:hover{background:var(--surface);color:var(--ink)}\n.rtab.active{background:var(--surface-2);color:var(--ink)}\n.rtab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--brand)}\n.rtab .tm{font-size:9px;font-weight:700;flex:none}\n.rtab .tn{font-size:12px;max-width:138px;overflow:hidden;text-overflow:ellipsis}\n.rtab .dirty{width:6px;height:6px;border-radius:50%;background:var(--brand);flex:none}\n.rtab .tx{width:16px;height:16px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:var(--dimmer);flex:none}\n.rtab .tx:hover{color:var(--ink);background:var(--surface-3)}\n.tab-add{flex:none;width:38px;display:inline-flex;align-items:center;justify-content:center;color:var(--dim);font-size:18px;border-right:1px solid var(--line)}\n.tab-add:hover{color:var(--brand);background:var(--surface)}\n\n.reqbar{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);align-items:center}\n.method-wrap{position:relative;flex:none}\n.method-sel{display:flex;align-items:center;gap:7px;padding:0 12px;height:36px;border:1px solid var(--line-2);border-radius:var(--r);background:var(--surface);font-weight:700;font-size:12.5px;letter-spacing:.04em;min-width:104px;justify-content:space-between;transition:.15s}\n.method-sel:hover{border-color:var(--dim)}\n.method-sel .car{font-size:9px;color:var(--dim)}\n.method-menu{position:absolute;top:42px;left:0;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);z-index:60;min-width:130px;padding:5px;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);display:none}\n.method-menu.open{display:block}\n.method-menu button{display:flex;width:100%;padding:7px 10px;border-radius:var(--r-sm);font-weight:700;font-size:12px;letter-spacing:.04em}\n.method-menu button:hover{background:var(--surface-3)}\n.url-wrap{flex:1;min-width:0;position:relative;display:flex;flex-direction:column}\n.url-input{height:36px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:0 14px;font-size:13px;color:var(--ink);transition:.15s;width:100%}\n.url-input:focus{border-color:var(--line-2);background:var(--surface-2)}\n.url-input::placeholder{color:var(--dimmer)}\n.url-resolved{position:absolute;top:38px;left:2px;font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none}\n.url-resolved b{color:var(--m-post)}\n.btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:var(--r);font-weight:600;font-size:12.5px;letter-spacing:.02em;border:1px solid var(--line-2);color:var(--ink);background:var(--surface);transition:.16s;white-space:nowrap}\n.btn:hover{border-color:var(--dim);background:var(--surface-2)}\n.btn.primary{background:var(--brand);color:var(--brand-ink);border-color:var(--brand);font-weight:700}\n.btn.primary:hover{background:var(--brand-hi);box-shadow:var(--brand-glow)}\n.btn.primary:disabled{opacity:.55;cursor:wait}\n.btn .k{font-size:9.5px;opacity:.6;font-weight:500}\n.btn.ghost{background:transparent}\n.btn.icon{padding:0 11px}\n.btn.danger{color:var(--err);border-color:rgba(248,81,73,.4)}\n.btn.danger:hover{background:rgba(248,81,73,.12)}\n\n/* \u8BF7\u6C42/\u54CD\u5E94\u5206\u9694 */\n.split{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}\n.split.h{flex-direction:row}\n.req-region{flex:none;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}\n.split:not(.h) .req-region{height:var(--reqH,240px)}\n.split.h .req-region{width:var(--reqW,520px)}\n.divider{flex:none;position:relative;background:transparent;z-index:5}\n.split:not(.h) .divider{height:8px;cursor:row-resize}\n.split.h .divider{width:8px;cursor:col-resize}\n.divider::before{content:'';position:absolute;background:var(--line);transition:.15s}\n.split:not(.h) .divider::before{left:0;right:0;top:50%;height:1px}\n.split.h .divider::before{top:0;bottom:0;left:50%;width:1px}\n.split:not(.h) .divider:hover::before{background:var(--brand);height:2px;box-shadow:0 0 10px var(--brand)}\n.split.h .divider:hover::before{background:var(--brand);width:2px;box-shadow:0 0 10px var(--brand)}\n.res-region{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}\n\n.subtabs{display:flex;align-items:center;gap:2px;padding:6px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap}\n.subtab{padding:5px 12px;border-radius:var(--r-sm);font-size:11.5px;color:var(--dim);letter-spacing:.03em;transition:.13s;white-space:nowrap}\n.subtab:hover{color:var(--ink);background:var(--surface)}\n.subtab.active{color:var(--brand);background:var(--surface-2)}\n.subtab.disabled{color:var(--dimmer);opacity:.45;pointer-events:none}\n.subtab .badge{font-size:9px;color:var(--dimmer);margin-left:5px}\n.subtab.active .badge{color:var(--brand)}\n.subtabs .sp{flex:1}\n.subtabs .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.14s}\n.subtabs .tool:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}\n.pane{flex:1;overflow:auto;min-height:0}\n\n/* key-value \u7F16\u8F91\u5668 */\n.kv{width:100%}\n.kv .kv-row{display:grid;grid-template-columns:30px 1fr 1fr 30px;align-items:center;border-bottom:1px solid var(--line)}\n.kv .kv-row:hover{background:rgba(255,255,255,.014)}\n.kv input[type=text]{width:100%;padding:8px 10px;font-size:12px;background:transparent;color:var(--ink)}\n.kv input[type=text]::placeholder{color:var(--dimmer)}\n.kv input.k{color:var(--brand-hi);border-right:1px solid var(--line)}\n.kv .ck{display:flex;align-items:center;justify-content:center}\n.kv .ck input{accent-color:var(--brand);width:13px;height:13px;cursor:pointer}\n.kv .rm{display:flex;align-items:center;justify-content:center;color:var(--dimmer);font-size:13px;height:100%}\n.kv .rm:hover{color:var(--err)}\n.kv-row.blank input.k{color:var(--dim)}\n.kv-row.blank .ck,.kv-row.blank .rm{opacity:.3}\n\n.body-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}\n.seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}\n.seg button{padding:5px 11px;font-size:11px;color:var(--dim);transition:.13s}\n.seg button:hover{color:var(--ink);background:var(--surface)}\n.seg button.on{background:var(--surface-3);color:var(--ink)}\n.body-bar .sp{flex:1}\n.body-bar .tool{font-size:10.5px;color:var(--dim);padding:4px 9px;border:1px solid var(--line);border-radius:var(--r-sm)}\n.body-bar .tool:hover{color:var(--ink);border-color:var(--line-2)}\ntextarea.code{width:100%;height:100%;min-height:110px;resize:none;padding:12px;font-size:12.5px;line-height:1.6;background:transparent;color:var(--ink);white-space:pre;tab-size:2}\n.body-none{padding:30px;text-align:center;color:var(--dimmer);font-size:12px;line-height:1.9}\n\n/* \u54CD\u5E94\u5934\u6761 + \u5DE5\u5177 */\n.res-status{display:flex;align-items:center;gap:14px;padding:8px 12px;border-bottom:1px solid var(--line);flex:none;font-size:12px;flex-wrap:wrap}\n.status-chip{display:inline-flex;align-items:center;gap:7px;font-weight:700;letter-spacing:.02em}\n.status-chip .dotc{width:8px;height:8px;border-radius:50%}\n.res-meta{color:var(--dim);display:flex;gap:14px;flex-wrap:wrap}\n.res-meta b{color:var(--ink);font-weight:600}\n.res-tools{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--line);flex:none}\n.res-tools .ti{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 9px;height:28px}\n.res-tools .ti .lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer)}\n.res-tools .ti input{width:100%;font-size:12px;color:var(--ink);background:transparent;padding:5px 0}\n.res-tools .ti.path{flex:1.2;min-width:120px}\n.res-tools .ti.filter{flex:1;min-width:100px}\n.res-tools .ti input::placeholder{color:var(--dimmer)}\n.res-tools .ti.path{flex:none;min-width:0}\n.res-tools .ti.path .lbl{color:var(--m-post)}\n.res-tools .ti.manual{flex:1;min-width:130px}\n/* \u589E\u5F3A\u8FC7\u6EE4\u680F */\n.fb-bar{position:relative;display:flex;align-items:center;flex:1;min-width:100px;gap:0;flex-wrap:wrap}\n.fb-edit{border:none;background:transparent;color:var(--ink);font-size:12px;flex:1;min-width:60px;padding:5px 0;outline:none}\n.fb-edit::placeholder{color:var(--dimmer)}\n.fb-tokens{display:none;flex-wrap:wrap;gap:4px;margin-right:4px;align-items:center}\n.ftk{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:10.5px;white-space:nowrap;border:1px solid var(--line);background:rgba(255,255,255,.03);line-height:1.6}\n.ftk .ftk-field{color:var(--j-key);font-weight:600}\n.ftk .ftk-op{color:var(--dimmer);font-size:10px}\n.ftk .ftk-val{color:var(--j-str)}\n.ftk .ftk-num{color:var(--j-num)}\n.ftk .ftk-bool{color:var(--j-bool)}\n.ftk .ftk-null{color:var(--j-null);font-style:italic}\n.ftk .ftk-neg{color:var(--err);font-weight:700}\n.fb-ac{position:absolute;top:100%;left:0;z-index:90;min-width:160px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:5px;display:none;margin-top:2px}\n.fb-ac.open{display:block}\n.fb-ac-item{display:block;width:100%;text-align:left;padding:5px 9px;border-radius:var(--r-sm);font-size:11.5px;color:var(--ink)}\n.fb-ac-item:hover{background:var(--surface-3);color:var(--brand)}\n.pathdd{position:relative}\n.pathdd-btn{display:inline-flex;align-items:center;gap:8px;height:28px;padding:0 4px 0 2px;background:transparent;color:var(--ink);font-size:11.5px;max-width:210px}\n.pathdd-btn>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:176px}\n.pathdd-btn .pcar{color:var(--dim);font-size:8px;flex:none}\n.pathdd-btn:hover{color:var(--brand)}\n.path-menu{position:absolute;top:34px;left:0;z-index:90;width:320px;max-width:80vw;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:0 22px 50px -16px rgba(0,0,0,.78);padding:7px;display:none}\n.path-menu.open{display:block}\n.path-filter{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 9px;font-size:12px;color:var(--ink);margin-bottom:6px}\n.path-filter:focus{border-color:var(--line-2);background:var(--surface-3)}\n.path-list{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:1px}\n.path-opt{display:flex;align-items:center;gap:8px;width:100%;padding:6px 9px;border-radius:var(--r-sm);text-align:left;transition:.1s}\n.path-opt:hover{background:var(--surface-3)}\n.path-opt.on{box-shadow:inset 2px 0 0 var(--brand);background:var(--surface-3)}\n.path-opt .pp{flex:1;font-size:11.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.path-opt .pk{flex:none;font-size:10px;color:var(--dimmer);font-variant-numeric:tabular-nums}\n.path-opt .pk.array{color:var(--j-num)} .path-opt .pk.object{color:var(--j-key)}\n.path-empty{padding:14px;text-align:center;color:var(--dimmer);font-size:11.5px;line-height:1.7}\n.cell-tip{position:fixed;z-index:200;max-width:480px;max-height:60vh;overflow:hidden;background:var(--surface-3);border:1px solid var(--line-2);border-radius:6px;padding:8px 11px;font:12px/1.55 var(--mono);color:var(--ink);white-space:pre-wrap;word-break:break-word;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);pointer-events:none;opacity:0;transition:opacity .1s;left:0;top:0}\n.cell-tip.show{opacity:1}\n\n.res-idle{padding:36px 22px;text-align:center;color:var(--dimmer);font-size:12.5px;line-height:1.95}\n.res-idle .big{font-family:var(--disp);font-size:16px;color:var(--dim);margin-bottom:6px}\n.res-idle .tips{margin-top:14px;display:inline-block;text-align:left;font-size:11.5px;color:var(--dimmer);line-height:2}\n.res-idle .tips b{color:var(--dim)}\n.res-loading{display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--dim);font-size:12.5px}\n.spin{width:16px;height:16px;border:2px solid var(--line-2);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}\n@keyframes spin{to{transform:rotate(360deg)}}\n.res-err{padding:22px;color:var(--err);font-size:12.5px;line-height:1.7}\n.res-err .ti{font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px}\n.res-err .hintbox{margin-top:12px;padding:11px 13px;background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.25);border-radius:var(--r);color:var(--dim);font-size:11.5px}\n.prev-none,.dimnote{padding:30px;text-align:center;color:var(--dimmer);font-size:12.5px}\n.dimnote{padding:16px;text-align:left}\n\npre.raw{padding:14px;font-size:12.5px;line-height:1.65;white-space:pre;overflow:auto;tab-size:2}\npre.raw.wrap{white-space:pre-wrap;word-break:break-word}\n.tok-key{color:var(--j-key)} .tok-str{color:var(--j-str)} .tok-num{color:var(--j-num)} .tok-bool{color:var(--j-bool)} .tok-null{color:var(--j-null)} .tok-id{color:var(--m-get);font-weight:500}\n\n.jtree{padding:12px;font-size:12.5px;line-height:1.6}\n.jt-node{padding-left:15px;position:relative}\n.jt-row{display:flex;align-items:flex-start;gap:5px;padding:.5px 0;border-radius:3px}\n.jt-row.expandable{cursor:pointer}\n.jt-row.expandable:hover{background:rgba(255,255,255,.025)}\n.jt-tog{position:absolute;left:1px;color:var(--dimmer);font-size:9px;width:12px;text-align:center;user-select:none;top:3px}\n.jt-key{color:var(--j-key)} .jt-colon{color:var(--dimmer)}\n.jt-str{color:var(--j-str)} .jt-num{color:var(--j-num)} .jt-bool{color:var(--j-bool)} .jt-null{color:var(--j-null)}\n.jt-prev{color:var(--dimmer);font-style:italic}\n.jt-children.hide{display:none}\n.jt-act{margin-left:8px;opacity:0;font-size:10px;transition:.12s;display:inline-flex;gap:8px}\n.jt-row:hover .jt-act{opacity:1}\n.jt-act b{color:var(--dimmer);cursor:pointer}\n.jt-act b:hover{color:var(--brand)}\n.hl{background:rgba(255,122,89,.28);border-radius:2px;color:#fff}\n\n.tbl-cands{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--bg-2)}\n.tbl-cands .lab{font-size:10px;color:var(--dimmer);letter-spacing:.1em;text-transform:uppercase;align-self:center;margin-right:2px}\n.tcand{font-size:11px;color:var(--dim);padding:4px 10px;border:1px solid var(--line);border-radius:20px;transition:.13s;display:inline-flex;gap:6px;align-items:center}\n.tcand:hover{color:var(--ink);border-color:var(--line-2)}\n.tcand.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}\n.tcand em{font-style:normal;color:var(--dimmer);font-size:10px}\n.tcand.on em{color:var(--brand)}\n/* \u5217\u9009\u62E9\u5668 */\n.col-picker{display:flex;flex-wrap:wrap;padding:4px 12px;border-bottom:1px solid var(--line);background:var(--bg-2);align-items:center;gap:5px}\n.col-picker.collapsed{flex-wrap:nowrap}\n.col-toggle{font-size:11px;color:var(--dim);padding:3px 10px;border:1px solid var(--line);border-radius:20px;cursor:pointer;white-space:nowrap;transition:.13s}\n.col-toggle:hover{color:var(--ink);border-color:var(--line-2)}\n.col-body{display:flex;gap:5px;flex-wrap:wrap;align-items:center}\n.col-picker.collapsed .col-body{display:none}\n.col-q{font-size:10px;color:var(--dimmer);padding:3px 9px;border:1px solid var(--line);border-radius:var(--r-sm);margin-right:4px}\n.col-q:hover{color:var(--ink);border-color:var(--line-2)}\n.col-chip{font-size:11px;padding:3px 10px;border:1px solid var(--line);border-radius:20px;color:var(--dim);transition:.13s;cursor:grab}\n.col-chip:hover{color:var(--ink);border-color:var(--line-2)}\n.col-chip.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}\n.col-chip.dragging{opacity:.35}\n.col-chip.drag-over{border-color:var(--brand);box-shadow:0 0 0 2px rgba(255,122,89,.25)}\n.tbl-host{display:flex;flex-direction:column;height:100%;min-height:0}\n.tbl-wrap{flex:1;min-height:0;overflow:auto}\ntable.dt{border-collapse:separate;border-spacing:0;font-size:12px;width:auto;min-width:100%}\ntable.dt th,table.dt td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 11px;text-align:left;vertical-align:middle;max-width:340px;min-width:54px}\ntable.dt th:first-child,table.dt td:first-child{border-left:1px solid var(--line)}\ntable.dt thead th{border-top:1px solid var(--line)}\ntable.dt th{position:sticky;top:0;background:var(--surface-2);color:var(--ink);font-weight:600;letter-spacing:.01em;font-size:11px;white-space:nowrap;z-index:2;user-select:none}\ntable.dt th.sortable{cursor:pointer}\ntable.dt th.sortable:hover{color:var(--brand)}\ntable.dt th.sort-asc::after{content:' \u25B2';font-size:9px;color:var(--brand)}\ntable.dt th.sort-desc::after{content:' \u25BC';font-size:9px;color:var(--brand)}\ntable.dt th.idx{left:0;z-index:4}\ntable.dt td{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\ntable.dt tr:hover td{background:rgba(255,255,255,.022)}\ntable.dt tr:hover td.idx{background:var(--surface)}\ntable.dt td.idx{color:var(--dimmer);text-align:right;font-variant-numeric:tabular-nums;background:var(--bg-2);position:sticky;left:0;z-index:1;min-width:42px}\ntable.dt .cobj{color:var(--j-key);cursor:default}\n.cell-num{color:var(--j-num)} .cell-bool{color:var(--j-bool)} .cell-null{color:var(--j-null);font-style:italic} .cell-str{color:var(--ink)}\n.cell-img{height:30px;width:30px;object-fit:cover;border-radius:5px;border:1px solid var(--line-2);vertical-align:middle;background:repeating-conic-gradient(#1a1d24 0 25%,#14161b 0 50%) 50%/10px 10px}\n.cell-imn{color:var(--dim);margin-left:7px;font-size:11px}\n.cell-ts{color:var(--j-num);background:rgba(255,171,112,.09);border:1px solid rgba(255,171,112,.2);border-radius:4px;padding:1px 7px;font-size:11px;white-space:nowrap}\n.col-grip{position:absolute;top:0;right:0;width:7px;height:100%;cursor:col-resize;z-index:5}\n.col-grip:hover{background:linear-gradient(90deg,transparent,var(--brand))}\n.col-grip:active{background:var(--brand)}\n.tbl-note{padding:6px 12px;font-size:10.5px;color:var(--dimmer);border-bottom:1px solid var(--line);background:var(--bg-2);flex:none}\n.prev-frame{width:100%;height:100%;border:0;background:#fff}\n.prev-img-wrap{padding:18px;display:flex;align-items:flex-start;justify-content:center;height:100%;overflow:auto}\n.prev-img-wrap img{max-width:100%;background:repeating-conic-gradient(#1a1d24 0% 25%, #14161b 0% 50%) 50%/18px 18px;border:1px solid var(--line)}\n\n.statusbar{display:flex;align-items:center;gap:16px;padding:0 14px;border-top:1px solid var(--line);background:var(--bg-2);font-size:10.5px;color:var(--dimmer);letter-spacing:.03em}\n.statusbar .msg{flex:1;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}\n.statusbar .msg.ok{color:var(--ok)} .statusbar .msg.err{color:var(--err)} .statusbar .msg.warn{color:var(--warn)}\n.statusbar .seg-r{display:flex;gap:16px}\n.statusbar b{color:var(--dim);font-weight:600}\n\n.modal-bg{position:fixed;inset:0;background:rgba(5,6,9,.66);backdrop-filter:blur(3px);z-index:100;display:none;align-items:center;justify-content:center}\n.modal-bg.open{display:flex}\n.modal{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;width:min(460px,92cqw);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);overflow:hidden;animation:pop .16s ease;max-height:88vh;overflow-y:auto}\n.modal.wide{width:min(620px,94cqw)}\n@keyframes pop{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}\n.modal h3{font-family:var(--disp);font-weight:700;font-size:16px;padding:16px 18px 4px}\n.modal .sub{padding:0 18px 14px;color:var(--dim);font-size:11.5px;line-height:1.6}\n.modal .field{padding:0 18px 12px}\n.modal label{display:block;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dimmer);margin-bottom:6px}\n.modal input,.modal select{width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink)}\n.modal input:focus,.modal select:focus{border-color:var(--brand)}\n.modal .acts{display:flex;align-items:center;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line);margin-top:6px}\n.curl-ta{width:100%;min-height:150px;resize:vertical;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;color:var(--ink);white-space:pre-wrap;word-break:break-word}\n.env-tabs{display:flex;gap:5px;flex-wrap:wrap;padding:0 18px 12px}\n.env-tab{font-size:11.5px;color:var(--dim);padding:5px 11px;border:1px solid var(--line);border-radius:20px;transition:.13s}\n.env-tab:hover{color:var(--ink);border-color:var(--line-2)}\n.env-tab.on{color:var(--brand);border-color:var(--brand);background:rgba(255,122,89,.08)}\n.env-tab.add{color:var(--dimmer)}\n.env-vars{border:1px solid var(--line);border-radius:var(--r);overflow:hidden}\n\n.toast{position:fixed;bottom:38px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;background:var(--surface-3);border:1px solid var(--line-2);color:var(--ink);padding:9px 16px;border-radius:30px;font-size:12px;z-index:120;transition:.22s;pointer-events:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.6)}\n.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}\n.toast b{color:var(--brand)}\n\n/* ===== \u5BB9\u5668\u67E5\u8BE2\uFF1A\u7A84\u9762\u677F\u7D27\u51D1\u5E03\u5C40 ===== */\n@container (max-width:880px){\n  :root{--side:0px}\n  .hint{display:none}\n  .nav-hint{display:none}\n  .split.h .req-region{width:46%}\n  .reqbar{flex-wrap:wrap}\n  .topbar{flex-wrap:wrap;height:auto;min-height:var(--topbar);padding:6px 10px}\n  .env-sel{max-width:150px}\n  .db-side{width:168px}\n  .cm{min-height:280px}\n}\n@container (max-width:560px){\n  .nav-tabs .nav-tab{padding:0 9px;font-size:11px}\n  .nav-tabs .nav-tab .tcn{font-size:12px}\n  .brand small{display:none}\n  .env-sel{max-width:110px}\n  .top-act{padding:0 8px;font-size:11px}\n  .db-side{display:none}\n  .cm-list{width:120px}\n  .cm{min-height:240px}\n  .db-conn{padding:18px 14px}\n  .db-conn .db-card{padding:16px 16px}\n}\n\n/* ===== \u6570\u636E\u5E93\u5DE5\u5177 ===== */\n.db-conn{position:absolute;inset:0;overflow:auto;padding:30px 28px}\n.db-conn .db-card{max-width:560px;margin:0 auto;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));padding:22px 24px}\n.db-conn h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:12px}\n.db-conn .sub{color:var(--dim);font-size:11.5px;line-height:1.7;margin-bottom:16px}\n.db-row{display:flex;gap:10px;align-items:center;margin-bottom:11px}\n.db-row label{width:104px;flex:none;font-size:11px;color:var(--dim);letter-spacing:.04em;text-align:right}\n.db-row .t-in{font-size:13px;padding:9px 12px}\n.db-row.inline{justify-content:flex-start;gap:14px}\n.db-row.inline .ckbox{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}\n.db-row.inline .ckbox input{accent-color:var(--brand);width:14px;height:14px}\n.db-acts{display:flex;gap:9px;margin-top:6px;padding-left:114px}\n@container (max-width:620px){ .db-row{flex-direction:column;align-items:stretch} .db-row label{width:auto;text-align:left} .db-acts{padding-left:0} }\n\n.db-main{flex:1;display:flex;min-height:0}\n.db-side{width:218px;flex:none;border-right:1px solid var(--line);overflow:hidden;padding:0;background:var(--bg-2);display:flex;flex-direction:column}\n.db-side .db-side-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:8px 8px 6px;display:flex;align-items:center;gap:6px;flex-shrink:0;border-bottom:1px solid var(--line)}\n.db-side .db-side-h .db-sel-btn{width:20px;height:20px;border-radius:var(--r-sm);color:var(--dimmer);font-size:11px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}\n.db-side .db-side-h .db-sel-btn:hover{color:var(--brand);background:var(--surface)}\n.db-side-search{padding:6px 8px;flex-shrink:0}\n.db-side-search .t-in{font-size:11.5px;padding:6px 9px;background:var(--surface)}\n.db-side-tabs{display:flex;gap:0;padding:0 8px;flex-shrink:0;border-bottom:1px solid var(--line)}\n.db-side-tab{flex:1;padding:5px 0;font-size:11px;text-align:center;color:var(--dimmer);border-bottom:2px solid transparent;cursor:pointer;transition:.12s}\n.db-side-tab:hover{color:var(--dim)}\n.db-side-tab.on{color:var(--brand);border-bottom-color:var(--brand)}\n.db-side-scroll{flex:1;min-height:0;overflow:auto;padding:0 8px 8px}\n.dbt{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 9px;border-radius:var(--r-sm);color:var(--dim);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.dbt:hover{background:var(--surface);color:var(--ink)}\n.dbt.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}\n.dbt .dbt-n{flex:1;overflow:hidden;text-overflow:ellipsis}\n.dbt .dbt-pk{font-size:9px;color:var(--j-num)}\n.dbt .dbt-cols{font-size:9px;color:var(--dimmer);background:var(--surface-2);border-radius:20px;padding:0 6px;min-width:18px;text-align:center;line-height:1.6}\n.dbt.dbt-db .dbt-icon{font-size:13px;flex:none}\n.dbt.dbt-db .dbt-n{color:var(--ink);font-weight:500}\n.dbt-hist{position:relative;align-items:flex-start;white-space:normal}\n.dbt-hist .dbt-sql{flex:1;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--ink);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal}\n.dbt-hist .dbt-meta{font-size:9px;color:var(--dimmer);white-space:nowrap;flex:none;margin-top:2px}\n.dbt-hist .dbt-acts{display:none;gap:3px;position:absolute;right:4px;top:3px}\n.dbt-hist:hover .dbt-acts{display:flex}\n.dbt-hist:hover .dbt-meta{display:none}\n.dbt-hist-act{width:20px;height:20px;border-radius:3px;color:var(--dimmer);font-size:10px;display:inline-flex;align-items:center;justify-content:center}\n.dbt-hist-act:hover{background:var(--surface-2);color:var(--ink)}\n.hist-empty{color:var(--dimmer);font-size:11px;padding:20px 8px;text-align:center}\n.db-ctx{position:fixed;z-index:90;min-width:170px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .16s ease}\n.db-ctx-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;border-radius:var(--r-sm);font-size:12px;color:var(--dim);text-align:left;transition:.1s;white-space:nowrap}\n.db-ctx-item:hover{background:var(--surface-3);color:var(--ink)}\n.db-ctx-sep{height:1px;background:var(--line);margin:4px 6px}\n/* \u81EA\u52A8\u8865\u5168\u6D6E\u5C42 */\n.db-ac{position:fixed;z-index:95;max-width:340px;max-height:260px;overflow:auto;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:3px 0;box-shadow:0 22px 50px -16px rgba(0,0,0,.78);animation:pop .12s ease;font-size:12px}\n.db-ac-item{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:5px 10px;font-size:12px;color:var(--dim);transition:.1s;white-space:nowrap;cursor:pointer;border-radius:var(--r-sm)}\n.db-ac-item:hover{background:var(--surface);color:var(--ink)}\n.db-ac-item.on{background:var(--surface);box-shadow:inset 2px 0 0 var(--brand);color:var(--ink)}\n.db-ac-item small{font-size:10px;color:var(--dimmer);margin-left:auto;padding-left:8px}\n.db-ac-badge{flex:none;font-size:9px;font-weight:700;letter-spacing:.04em;padding:1px 5px;border-radius:3px;margin-right:6px;line-height:1.4}\n.db-ac-keyword .db-ac-badge{color:var(--j-key);background:rgba(121,192,255,.12)}\n.db-ac-table .db-ac-badge{color:var(--j-num);background:rgba(255,171,112,.12)}\n.db-ac-column .db-ac-badge{color:var(--j-str);background:rgba(165,214,164,.12)}\n.db-right{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}\n.db-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line);flex:none}\n.db-toolbar-left{display:flex;align-items:center;gap:8px}\n.db-toolbar-center{flex:1}\n.db-toolbar-right{display:flex;align-items:center;gap:5px}\n.db-schema-sel{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:var(--r-sm);background:var(--surface);font-size:11px;color:var(--dim);cursor:pointer;border:1px solid var(--line);transition:.12s}\n.db-schema-sel:hover{border-color:var(--line-2);color:var(--ink)}\n.db-editor{flex:none;position:relative;border-bottom:none;overflow:hidden}\n/* \u884C\u53F7 + \u9AD8\u4EAE + textarea \u5BB9\u5668 */\n.db-editor-inner{display:flex;min-height:100%}\n.db-gutter{flex:none;width:42px;padding:8px 6px 8px 0;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--dimmer);text-align:right;user-select:none;pointer-events:none;overflow:hidden;background:transparent;white-space:pre}\n.db-gutter b{color:var(--dim);font-weight:400}\n.db-editor-text{flex:1;position:relative;min-width:0}\n.db-overlay{position:absolute;inset:0;margin:0;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:transparent;pointer-events:none;white-space:pre;overflow:hidden;background:transparent}\n.db-editor textarea{width:100%;display:block;padding:8px 12px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:var(--ink);background:transparent;height:100%;box-sizing:border-box;white-space:pre;overflow-wrap:normal;overflow-x:auto}\n.db-editor textarea::placeholder{color:var(--dimmer)}\n.db-editor textarea:focus{background:rgba(255,122,89,.02)}\n.db-splitter{height:3px;background:var(--line);cursor:row-resize;flex:none;transition:background .15s;position:relative}\n.db-splitter:hover,.db-splitter.active{background:var(--brand)}\n.db-splitter::before{content:'';position:absolute;top:-3px;bottom:-3px;left:0;right:0}\n.db-result{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}\n.db-result-bar{display:flex;align-items:center;padding:4px 10px;border-bottom:1px solid var(--line);flex:none;gap:8px}\n.db-result-bar .note{flex:1;font-size:11px;color:var(--dim)}\n.db-result-bar .note strong{color:var(--j-num);font-weight:600}\n.db-export-btn{padding:3px 8px;border-radius:var(--r-sm);color:var(--dimmer);font-size:10px;cursor:pointer;border:1px solid var(--line);transition:.12s}\n.db-export-btn:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface)}\n.db-sb-row{display:flex;gap:8px;padding:6px 10px}\n.db-sb-row .t-in{font-size:12px;padding:6px 10px}\n.db-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim);white-space:nowrap}\n.db-chip .dotc{width:8px;height:8px;border-radius:50%;background:var(--ok)}\n.db-prev{background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:11px 13px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--ink);max-height:42vh;overflow:auto;font-family:var(--mono);transition:border-color .2s}\n.db-prev:not(:empty){border-color:var(--warn);background:rgba(210,153,34,.04)}\n.db-kv{display:flex;gap:10px;align-items:center;margin-bottom:9px}\n.db-kv label{width:140px;flex:none;font-size:11px;color:var(--j-key);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.db-kv label small{color:var(--dimmer)}\n.db-kv .t-in{font-size:12.5px;padding:8px 11px}\n\n/* ===== \u8FDE\u63A5\u7BA1\u7406\u5668 ===== */\n.cm{display:flex;height:100%;min-height:280px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,var(--surface),var(--bg-2));overflow:hidden}\n.cm-list{width:200px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--bg-2)}\n.cm-list-h{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);padding:10px 10px 6px}\n.cm-list-items{flex:1;overflow:auto;padding:0 4px 4px}\n.cm-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s;font-size:12px}\n.cm-item:hover{background:var(--surface)}\n.cm-item.on{background:var(--surface-2);color:var(--brand);box-shadow:inset 2px 0 0 var(--brand)}\n.cm-dot{width:8px;height:8px;border-radius:50%;flex:none}\n.cm-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.cm-item-host{font-size:10px;color:var(--dimmer);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}\n.cm-item-del{width:18px;height:18px;border-radius:3px;color:var(--dimmer);font-size:10px;display:none;align-items:center;justify-content:center}\n.cm-item:hover .cm-item-del{display:inline-flex}\n.cm-item-del:hover{background:var(--surface);color:var(--err)}\n.cm-add{margin:6px;padding:6px 10px;border-radius:var(--r-sm);color:var(--dim);font-size:11px;border:1px dashed var(--line);text-align:center;transition:.12s;cursor:pointer}\n.cm-add:hover{color:var(--brand);border-color:var(--brand)}\n.cm-form{flex:1;padding:16px 20px;overflow:auto}\n.cm-form h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:14px}\n.cm-colors{display:flex;gap:6px;flex:1}\n.cm-color{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:.12s}\n.cm-color:hover{transform:scale(1.2)}\n.cm-color.on{border-color:var(--ink);box-shadow:0 0 8px rgba(255,255,255,.2)}\n.cm-remember{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dim);padding-left:114px;margin-bottom:8px}\n.cm-remember input{accent-color:var(--brand);width:14px;height:14px}\n.cm-sec{font-size:10.5px;color:var(--dimmer);padding-left:114px;margin-top:6px;line-height:1.5}\n.cm-acts{display:flex;gap:8px;margin-top:10px;padding-left:114px}\n.cm-btn-danger{color:var(--err);font-size:11px}\n.cm-btn-danger:hover{text-decoration:underline}\n@container (max-width:640px){ .cm{flex-direction:column} .cm-list{width:100%;max-height:150px;border-right:none;border-bottom:1px solid var(--line)} .cm-remember,.cm-acts,.cm-sec{padding-left:0} }\n\n/* ============================================================\n   AI \u52A9\u624B \u2014 \u72EC\u7ACB\u9875\u9762 + \u6D6E\u7A97 + \u914D\u7F6E\u9762\u677F\n   ============================================================ */\n\n/* ===== AI \u72EC\u7ACB\u9875\u9762 ===== */\n.ai-page{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}\n.ai-topbar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)}\n.ai-cfg-sel{position:relative}\n.ai-cfg-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--r-sm);border:1px solid var(--line);font-size:12px;color:var(--ink);background:var(--surface);cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ai-cfg-btn:hover{border-color:var(--line-2)}\n.ai-cfg-menu{position:absolute;top:34px;left:0;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:90;box-shadow:0 20px 44px -14px rgba(0,0,0,.75);display:none}\n.ai-cfg-menu.open{display:block}\n.ai-cfg-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--ink);transition:.12s}\n.ai-cfg-item:hover{background:var(--surface-3)}\n.ai-cfg-item.on{box-shadow:inset 2px 0 0 var(--brand)}\n.ai-cfg-dot{width:8px;height:8px;border-radius:50%;flex:none}\n.ai-ctx-toggle{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dim);cursor:pointer}\n.ai-ctx-toggle input{accent-color:var(--brand);width:13px;height:13px}\n\n.ai-main{flex:1;display:flex;min-height:0;overflow:hidden}\n.ai-sidebar{width:220px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}\n.ai-side-head{padding:10px 12px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}\n.ai-side-list{flex:1;overflow-y:auto;padding:4px}\n.ai-convo-item{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--r-sm);cursor:pointer;font-size:12px;color:var(--dim);transition:.12s}\n.ai-convo-item:hover{background:var(--surface-2);color:var(--ink)}\n.ai-convo-item.on{background:var(--surface-3);color:var(--ink);box-shadow:inset 2px 0 0 var(--brand)}\n.ai-convo-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ai-convo-del{opacity:0;font-size:10px;color:var(--dimmer);padding:2px 4px;border-radius:3px;transition:.12s}\n.ai-convo-item:hover .ai-convo-del{opacity:1}\n.ai-convo-del:hover{color:var(--err)}\n\n.ai-chat{flex:1;display:flex;flex-direction:column;min-height:0}\n.ai-ctx-bar{padding:6px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}\n.ai-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}\n.ai-empty{padding:40px 20px;text-align:center;color:var(--dimmer);font-size:13px;line-height:1.8}\n\n/* Messages */\n.ai-msg{padding:10px 14px;border-radius:var(--r);max-width:88%;animation:aiMsgIn .2s ease}\n.ai-msg.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}\n.ai-msg.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}\n.ai-msg.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}\n.ai-msg.error{align-self:flex-start;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:var(--err);font-size:12px}\n.ai-msg-role{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--dimmer);margin-bottom:4px;text-transform:uppercase}\n.ai-msg.user .ai-msg-role{color:rgba(0,0,0,.4)}\n.ai-msg-body{font-size:13px;line-height:1.65;word-break:break-word}\n.ai-msg-body p{margin:0 0 8px}\n.ai-msg-body p:last-child{margin-bottom:0}\n.ai-msg-body ul{margin:4px 0;padding-left:20px}\n.ai-msg-body li{margin:2px 0}\n.ai-msg-body strong{color:var(--ink)}\n@keyframes aiMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}\n\n/* Code blocks in AI messages */\n.ai-code-block{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;margin:6px 0;overflow-x:auto;font-size:12px;line-height:1.6;white-space:pre}\n.ai-code-inline{background:var(--surface-3);padding:1px 5px;border-radius:3px;font-size:12px;color:var(--j-str)}\n\n/* Input bar */\n.ai-input-bar{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line);flex:none}\n.ai-input{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:9px 12px;font-size:13px;color:var(--ink);resize:none;min-height:38px;max-height:120px;line-height:1.5}\n.ai-input:focus{border-color:var(--brand)}\n.ai-input::placeholder{color:var(--dimmer)}\n\n/* ===== AI Config Modal ===== */\n.ai-cfg-body{display:flex;gap:0;min-height:360px}\n.ai-cfg-list{width:180px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column}\n.ai-cfg-list-head{padding:10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dimmer);border-bottom:1px solid var(--line)}\n.ai-cfg-list-items{flex:1;overflow-y:auto;padding:4px}\n.ai-cfg-form{flex:1;padding:12px 16px;overflow-y:auto}\n\n/* ===== AI \u6D6E\u7A97 ===== */\n#aiFloatHost{position:fixed;z-index:110;pointer-events:none;inset:0}\n.ai-fab{position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(255,122,89,.4);transition:.18s;z-index:110;pointer-events:auto;border:none}\n.ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(255,122,89,.55)}\n\n.ai-float{position:fixed;right:24px;bottom:80px;width:420px;height:520px;background:var(--surface);border:1px solid var(--line-2);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 24px 60px -16px rgba(0,0,0,.8);z-index:111;pointer-events:auto;animation:aiFloatIn .2s ease;overflow:hidden}\n@keyframes aiFloatIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}\n.ai-float-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);cursor:move;user-select:none}\n.ai-float-title{font-family:var(--disp);font-weight:700;font-size:13px;color:var(--ink)}\n.ai-float-cfg{font-size:11px;color:var(--dim);cursor:pointer;padding:3px 8px;border-radius:var(--r-sm);border:1px solid var(--line);transition:.12s}\n.ai-float-cfg:hover{border-color:var(--line-2);color:var(--ink)}\n.ai-float-act{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);color:var(--dim);font-size:12px;cursor:pointer;transition:.12s}\n.ai-float-act:hover{background:var(--surface-2);color:var(--ink)}\n.ai-float-ctx{padding:5px 12px;font-size:11px;color:var(--dim);border-bottom:1px solid var(--line);background:var(--bg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}\n.ai-float-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}\n.ai-float-empty{padding:30px 10px;text-align:center;color:var(--dimmer);font-size:12px}\n.ai-fm{padding:8px 11px;border-radius:var(--r);max-width:90%;font-size:12.5px;line-height:1.55;word-break:break-word;animation:aiMsgIn .2s ease}\n.ai-fm.user{align-self:flex-end;background:var(--brand);color:var(--brand-ink);border-bottom-right-radius:2px}\n.ai-fm.assistant{align-self:flex-start;background:var(--surface-2);border:1px solid var(--line);border-bottom-left-radius:2px}\n.ai-fm.tool{align-self:flex-start;background:var(--surface-3);border:1px solid var(--line);font-size:11px;max-width:95%}\n.ai-fm.error{align-self:flex-start;color:var(--err);font-size:11px}\n.ai-fm pre{margin:0;white-space:pre-wrap;font-size:11px}\n\n.ai-float-input{display:flex;align-items:flex-end;gap:6px;padding:8px 10px;border-top:1px solid var(--line);flex:none}\n.ai-float-ctx-btn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);font-size:14px;cursor:pointer;transition:.12s;flex:none;border:none}\n.ai-float-ctx-btn:hover{background:var(--surface-2)}\n.ai-float-text{flex:1;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:7px 10px;font-size:12.5px;color:var(--ink);resize:none;min-height:32px;max-height:80px;line-height:1.4}\n.ai-float-text:focus{border-color:var(--brand)}\n.ai-float-text::placeholder{color:var(--dimmer)}\n\n.ai-float-cfg-menu{position:absolute;top:38px;left:0;min-width:180px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r);padding:4px;z-index:120;box-shadow:0 16px 40px -12px rgba(0,0,0,.7)}\n\n/* ============================================================\n   \u9762\u677F\u6A21\u5F0F\u8986\u76D6\uFF1A\u628A\u6240\u6709 fixed \u6D6E\u5C42\u9650\u5236\u5728\u9762\u677F\u5BB9\u5668\u5185\uFF0C\u907F\u514D\u6EA2\u51FA\u5BBF\u4E3B UI\u3002\n   panel.jsx \u901A\u8FC7 setPanelMode(true) \u5728\u5BB9\u5668\u6DFB\u52A0 data-panel-mode \u5C5E\u6027\u3002\n   ============================================================ */\n.relay-devkit-panel .cell-tip,\n.relay-devkit-panel .modal-bg,\n.relay-devkit-panel .toast,\n.relay-devkit-panel .db-ctx,\n.relay-devkit-panel .db-ac,\n.relay-devkit-panel #aiFloatHost,\n.relay-devkit-panel .ai-fab,\n.relay-devkit-panel .ai-float{position:absolute}\n.relay-devkit-panel .ai-fab{right:14px;bottom:14px}\n.relay-devkit-panel .ai-float{right:14px;bottom:60px;width:min(420px, calc(100% - 28px));max-height:calc(100% - 80px);height:auto}\n";

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
function store(ns) {
  const key = "relay.tool." + ns;
  return { get() {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }, set(v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
    }
  } };
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
  _panelHash = "#/home";
  _panelChangeCb = null;
}
var _cur = null;
var _panelMode = false;
var _panelHash = "#/home";
var _panelChangeCb = null;
function currentView() {
  return _cur;
}
function setPanelMode(on, onChange) {
  _panelMode = !!on;
  _panelChangeCb = onChange || null;
}
function goView(id) {
  if (_panelMode) {
    _panelHash = "#/" + id;
    applyRoute();
    if (_panelChangeCb) _panelChangeCb(id);
  } else {
    location.hash = "#/" + id;
  }
}
function viewElId(id) {
  return "#view" + id.charAt(0).toUpperCase() + id.slice(1);
}
function renderNav() {
  const tabs = $("#navTabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  _views.forEach((v) => {
    const b = el("button", "nav-tab" + (v.id === _cur ? " on" : ""), `<span class="tcn">${v.icon}</span>${esc(v.label)}`);
    b.onclick = () => goView(v.id);
    tabs.appendChild(b);
  });
}
function renderHome() {
  const h = $("#viewHome");
  h.innerHTML = `<div class="home"><div class="home-inner"><div class="home-hero"><div class="eyebrow">RELAY DEVKIT</div><h1>\u5F00\u53D1\u8005\u5DE5\u5177\u7BB1</h1><p>\u96F6\u4F9D\u8D56\u3001\u7EAF\u524D\u7AEF\u3001\u53EF\u79BB\u7EBF\u8FD0\u884C\u7684\u4E00\u7EC4\u63A5\u53E3\u4E0E\u6570\u636E\u5C0F\u5DE5\u5177\u3002\u6311\u4E00\u4E2A\u5F00\u59CB\uFF1A</p></div><div class="tool-grid" id="toolGrid"></div></div></div>`;
  const g = $("#toolGrid");
  _views.filter((v) => v.card).forEach((c) => {
    const card = el("button", "tool-card");
    card.style.setProperty("--accent", c.card.accent);
    card.innerHTML = `<div class="ic">${c.card.icon || c.icon}</div><div class="nm">${esc(c.card.name || c.label)}</div><div class="ds">${esc(c.card.desc)}</div><div class="go">\u6253\u5F00 \u2192</div>`;
    card.onclick = () => goView(c.id);
    g.appendChild(card);
  });
}
function applyRoute() {
  let hash = _panelMode ? _panelHash : location.hash;
  let id = (hash.match(/^#\/(\w+)/) || [])[1] || "home";
  if (!_views.some((v2) => v2.id === id)) id = "home";
  _cur = id;
  $$("#view > .view").forEach((x) => x.classList.remove("on"));
  const elx = $(viewElId(id));
  if (elx) elx.classList.add("on");
  renderNav();
  const v = _views.find((x) => x.id === id);
  if (id === "home") renderHome();
  else if (v && v.init && !v.inited) {
    v.init();
    v.inited = true;
  }
}
function startRouter() {
  if (!_panelMode) {
    window.addEventListener("hashchange", applyRoute);
  }
  const nb = $("#navBrand");
  if (nb) nb.onclick = () => goView("home");
  renderNav();
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

// src/core/http.js
var BINARY = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i;
function tryJSON(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false };
  }
}

// src/tools/api.js
var LS_TABS = "relay.tabs.v2";
var LS_COL = "relay.collections.v2";
var LS_ENV = "relay.envs.v2";
var LS_UI = "relay.ui.v2";
var state = { tabs: [], activeTab: null, collections: [], envs: [], activeEnv: null };
var ui = { sideCollapsed: false, layout: "v", reqH: 240, reqW: 520, proxyOn: false };
var _panelMode2 = false;
var _proxyBase = "http://127.0.0.1:9860";
function setApiPanelMode(on, proxyBase) {
  _panelMode2 = !!on;
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
    const local = { id: uid(), name: "\u672C\u5730 Local", baseUrl: "http://127.0.0.1:8080", vars: [blankRow()] };
    state.envs = [demo, local];
    state.activeEnv = demo.id;
  }
  if (!state.collections.length) {
    const g = { id: uid(), name: "\u793A\u4F8B \xB7 DEMO", collapsed: false, requests: [
      sreq("\u672C\u5730\u7528\u6237(\u6570\u7EC4\u2192\u8868\u683C,\u79BB\u7EBF\u53EF\u7528)", "GET", "http://localhost:9860/users.json"),
      sreq("\u7528\u6237\u5217\u8868 {{baseUrl}}", "GET", "{{baseUrl}}/users"),
      sreq("\u5355\u4E2A Todo(\u5BF9\u8C61)", "GET", "{{baseUrl}}/todos/1"),
      sreq("\u5D4C\u5957\u6570\u636E(\u591A\u8868\u683C\u6F14\u793A)", "GET", "http://localhost:9860/nested.json"),
      sreq("\u5A92\u4F53/\u65F6\u95F4(\u56FE\u7247+\u65F6\u95F4\u6233\u6F14\u793A)", "GET", "http://localhost:9860/media.json"),
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
      const n = prompt("\u91CD\u547D\u540D tab\uFF1A", t.name);
      if (n != null) {
        t.name = n.trim() || t.name;
        renderTabs();
        persist();
      }
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
  setStatus(method + " " + url + (ui.proxyOn ? " \xB7 \u7ECF\u4EE3\u7406" : "") + " \u2026");
  let fetchUrl = url, fetchHeaders = headers;
  if (ui.proxyOn) {
    fetchHeaders = Object.assign({}, headers, { "X-Relay-Target": url });
    fetchUrl = _panelMode2 ? _proxyBase + "/__proxy" : "/__proxy";
  }
  const t0 = performance.now();
  try {
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
    t.response = { status: res.status, statusText: res.statusText, ok: res.ok, timeMs: t1 - t0, size: blob.size, contentType: ct, headers: resHeaders, text, isBinary: isBin, blobUrl: isBin ? URL.createObjectURL(blob) : null, url, parsed: parsed.ok ? parsed.value : void 0 };
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
    pane.innerHTML = `<div class="res-err"><div class="ti">\u26A0 \u8BF7\u6C42\u5931\u8D25</div><div>${esc(r.error)}</div>` + (corsHint ? `<div class="hintbox"><b>\u53EF\u80FD\u539F\u56E0\uFF1A</b>\u8DE8\u57DF CORS\u3001\u76EE\u6807\u65E0\u54CD\u5E94\u3001\u6DF7\u5408\u5185\u5BB9(HTTP/HTTPS)\u3001\u6216\u7F51\u7EDC\u4E0D\u53EF\u8FBE\u3002` + (ui.proxyOn ? _panelMode2 ? `<br>\u4EE3\u7406\u5DF2\u5F00\u542F\uFF08\u6307\u5411 ${esc(_proxyBase)}\uFF09\uFF0C\u8BF7\u786E\u4FDD\u5DF2\u8FD0\u884C <code>node server.js</code> \u542F\u52A8\u4E2D\u7EE7\u540E\u7AEF\u3002` : `<br>\u4EE3\u7406\u5DF2\u5F00\u542F\u4ECD\u5931\u8D25\uFF1A\u591A\u534A\u662F\u76EE\u6807\u5730\u5740\u4E0D\u53EF\u8FBE\uFF0C\u6216\u540E\u7AEF\u672A\u8FD0\u884C\u6700\u65B0 server.js\u3002` : _panelMode2 ? `<br>\u{1F449} \u70B9\u9876\u680F\u300C\u{1F6E1} \u4EE3\u7406\u300D\u5F00\u542F\u4E2D\u7EE7\u4EE3\u7406\uFF08\u9700\u5148\u8FD0\u884C <code>node server.js</code>\uFF09\uFF0C\u53EF\u7ED5\u8FC7 CORS \u9650\u5236\u3002` : `<br>\u{1F449} \u70B9\u9876\u680F\u300C\u{1F6E1} \u4EE3\u7406\u300D\u5F00\u542F\u672C\u5730\u540E\u7AEF\u8F6C\u53D1\uFF0C\u53EF\u7ED5\u8FC7 CORS \u4E0E\u6DF7\u5408\u5185\u5BB9\u9650\u5236\u3002`) + `</div>` : "") + `<div style="margin-top:10px;color:var(--dimmer);font-size:11px">\u8017\u65F6 ${ms(r.timeMs)} \xB7 ${esc(r.url)}</div></div>`;
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
function parseCurl(text) {
  let toks = tokenizeCurl(text.trim());
  if (toks[0] === "curl") toks = toks.slice(1);
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
    else if (t === "-u" || t === "--user") {
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
  m.innerHTML = '<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\uFF08\u652F\u6301 -X -H -d --data-raw -u -b -G \u7B49\uFF09\u3002</div>';
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
  state.tabs.push(t);
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
    state.tabs.push(nt);
    state.activeTab = nt.id;
  } else if (state.activeTab === t.id) state.activeTab = state.tabs[Math.max(0, i - 1)].id;
  renderAll();
  persist();
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
  b.innerHTML = ui.proxyOn ? _panelMode2 ? "\u{1F6E1} \u4EE3\u7406: \u5F00(\u4E2D\u7EE7)" : "\u{1F6E1} \u4EE3\u7406: \u5F00" : "\u{1F6E1} \u4EE3\u7406: \u5173";
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
  if (_panelMode2) {
    ui.layout = "v";
    ui.sideCollapsed = true;
  }
  const main = $("#main");
  if (main) main.classList.toggle("collapsed", ui.sideCollapsed);
  applyLayout();
  applyProxyBtn();
  renderAll();
}

// src/tools/json.js
var jstate = { respView: "object", userPickedView: false, respPath: "", respFilter: "", tableSel: null, prettyCells: true, colW: {}, treeOpen: "auto", hiddenCols: {}, sort: {}, data: void 0 };
var jstore = store("json");
var JSON_SAMPLE = { ok: true, total: 2, generatedAt: 17176032e5, users: [
  { id: 1, name: "Leanne", role: "admin", active: true, createdAt: 17e8, avatar: "https://i.pravatar.cc/64?img=1" },
  { id: 2, name: "Ervin", role: "user", active: false, createdAt: "2024-07-20T13:05:00Z", avatar: "https://i.pravatar.cc/64?img=5" }
], meta: { page: 1, size: 20, tags: ["a", "b", "c"] } };
function typeLabel(v) {
  if (Array.isArray(v)) return "\u6570\u7EC4 (" + v.length + " \u9879)";
  if (v && typeof v === "object") return "\u5BF9\u8C61 (" + Object.keys(v).length + " \u952E)";
  return typeof v;
}
function jsonErrPos(txt, e) {
  const m = /position (\d+)/i.exec(e.message);
  if (m) {
    const p = Math.min(+m[1], txt.length);
    const before = txt.slice(0, p);
    const line = before.split("\n").length;
    const col = p - before.lastIndexOf("\n");
    return { line, col };
  }
  const lc = /line (\d+) column (\d+)/i.exec(e.message);
  if (lc) return { line: +lc[1], col: +lc[2] };
  return null;
}
function pathDropdown(stateObj, paths, onApply) {
  const ddWrap = el("div", "ti path");
  ddWrap.innerHTML = '<span class="lbl">\u8DEF\u5F84</span>';
  const dd = el("div", "pathdd");
  const ddBtn = el("button", "pathdd-btn");
  ddBtn.type = "button";
  const setLbl = () => {
    ddBtn.innerHTML = `<span>${stateObj.respPath ? esc(stateObj.respPath) : "\u9009\u62E9\u8DEF\u5F84"}</span><span class="pcar">\u25BC</span>`;
  };
  setLbl();
  const menu = el("div", "path-menu");
  const fbox = el("input", "path-filter");
  fbox.placeholder = "\u8FC7\u6EE4\u8DEF\u5F84 / \u56DE\u8F66\u5E94\u7528";
  fbox.spellcheck = false;
  const list = el("div", "path-list");
  const apply = (p) => {
    stateObj.respPath = p;
    setLbl();
    menu.classList.remove("open");
    onApply();
  };
  const fill = () => {
    list.innerHTML = "";
    const kw = fbox.value.toLowerCase().trim();
    let n = 0;
    paths.forEach((p) => {
      if (n >= 200) return;
      const lab = p.path === "" ? "(\u6839)" : p.path;
      if (kw && !lab.toLowerCase().includes(kw)) return;
      n++;
      const o = el("button", "path-opt" + (p.path === stateObj.respPath ? " on" : ""));
      o.type = "button";
      o.innerHTML = `<span class="pp">${esc(lab)}</span><span class="pk ${p.kind}">${p.kind === "array" ? "[ ] " + p.count : p.kind === "object" ? "{ } " + p.count : "\xB7"}</span>`;
      o.onclick = () => apply(p.path);
      list.appendChild(o);
    });
    if (!n) list.innerHTML = '<div class="path-empty">\u65E0\u5339\u914D\u8DEF\u5F84\u3002<br>\u56DE\u8F66\u53EF\u76F4\u63A5\u5E94\u7528\u8F93\u5165\u3002</div>';
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
  return ddWrap;
}
function initJsonTool() {
  const v = $("#viewJson");
  v.innerHTML = `
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">{ }</span> JSON \u5DE5\u5177</span>
      <button class="t-btn primary" data-ja="format">\u2726 \u683C\u5F0F\u5316</button>
      <button class="t-btn" data-ja="min">\u538B\u7F29</button>
      <button class="t-btn" data-ja="validate">\u6821\u9A8C</button>
      <button class="t-btn" data-ja="escape">\u8F6C\u4E49</button>
      <button class="t-btn" data-ja="unescape">\u53BB\u8F6C\u4E49</button>
      <button class="t-btn" data-ja="sample">\u793A\u4F8B</button>
      <button class="t-btn" data-ja="clear">\u6E05\u7A7A</button>
      <span class="sp"></span>
      <span class="t-status" id="jsonStatus">\u7B49\u5F85\u8F93\u5165\u2026</span>
    </div>
    <div class="jsplit">
      <div class="jspane-l"><textarea id="jsonInput" spellcheck="false" placeholder='\u5728\u6B64\u7C98\u8D34 JSON\uFF0C\u4F8B\u5982\uFF1A&#10;{&#10;  "name": "relay",&#10;  "items": [1, 2, 3]&#10;}'></textarea></div>
      <div class="jdiv" id="jsonDiv"></div>
      <div class="jspane-r">
        <div class="subtabs" id="jsonSubtabs">
          <button class="subtab active" data-jv="object">\u5BF9\u8C61</button>
          <button class="subtab" data-jv="table">\u8868\u683C</button>
          <button class="subtab" data-jv="raw">\u539F\u59CB</button>
          <span class="sp"></span>
          <button class="tool" data-ja="pretty" id="jsonPretty" title="\u7F8E\u5316\u5355\u5143\u683C\uFF1A\u56FE\u7247\u7F29\u7565\u56FE + \u65F6\u95F4\u6233\u8F6C\u53EF\u8BFB\u65F6\u95F4">\u2726 \u7F8E\u5316</button>
          <button class="tool" data-ja="expand" id="jsonExpand">\u229E \u5C55\u5F00</button>
          <button class="tool" data-ja="collapse" id="jsonCollapse">\u229F \u6298\u53E0</button>
          <button class="tool" data-ja="copy">\u29C9 \u590D\u5236</button>
        </div>
        <div class="res-tools" id="jsonTools" style="display:none"></div>
        <div class="pane" id="jsonPane"><div class="res-idle"><div class="big">\u7C98\u8D34 JSON</div>\u5DE6\u4FA7\u8F93\u5165\uFF0C\u53F3\u4FA7\u81EA\u52A8\u6E32\u67D3\u4E3A\u5BF9\u8C61\u6811 / \u8868\u683C / \u539F\u59CB\u3002<br>\u652F\u6301\u8DEF\u5F84\u4E0B\u94BB\u3001\u5B57\u6BB5\u7B5B\u9009\u3001\u5217\u5BBD\u62D6\u62FD\u3001\u56FE\u7247\u4E0E\u65F6\u95F4\u6233\u8BC6\u522B\u3002</div></div>
      </div>
    </div>
  </div>`;
  const ta = $("#jsonInput");
  const saved = jstore.get();
  if (saved && saved.text) ta.value = saved.text;
  ta.addEventListener("input", () => {
    jstore.set({ text: ta.value });
    jsonRender();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + 2;
      jstore.set({ text: ta.value });
      jsonRender();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      jsonAction("format");
    }
  });
  v.querySelectorAll("[data-ja]").forEach((b) => b.onclick = () => jsonAction(b.dataset.ja));
  $$("#jsonSubtabs .subtab").forEach((b) => b.onclick = () => {
    if (b.classList.contains("disabled")) return;
    jstate.respView = b.dataset.jv;
    jstate.userPickedView = true;
    jsonRenderBody();
  });
  (function() {
    const d = $("#jsonDiv"), sp = d.parentElement, l = v.querySelector(".jspane-l");
    let drag = false;
    d.addEventListener("mousedown", (e) => {
      drag = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const r = sp.getBoundingClientRect();
      const w = Math.max(200, Math.min(r.width - 260, e.clientX - r.left));
      l.style.width = w + "px";
    });
    document.addEventListener("mouseup", () => {
      if (drag) {
        drag = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
  })();
  jstate.rerender = jsonRenderBody;
  jsonRender();
}
function jsonAction(a) {
  const ta = $("#jsonInput");
  if (!ta) return;
  if (a === "clear") {
    ta.value = "";
    jstate.respPath = "";
    jstate.tableSel = null;
    jstore.set({ text: "" });
    jsonRender();
    ta.focus();
    return;
  }
  if (a === "sample") {
    ta.value = JSON.stringify(JSON_SAMPLE, null, 2);
    jstate.respPath = "";
    jstate.tableSel = null;
    jstate.userPickedView = false;
    jstore.set({ text: ta.value });
    jsonRender();
    return;
  }
  if (a === "format" || a === "min") {
    try {
      const val = JSON.parse(ta.value);
      ta.value = JSON.stringify(val, null, a === "format" ? 2 : 0);
      jstore.set({ text: ta.value });
      jsonRender();
      setStatus(a === "format" ? "JSON \u5DF2\u683C\u5F0F\u5316" : "JSON \u5DF2\u538B\u7F29", "ok");
    } catch (e) {
      jsonRender();
      setStatus("JSON \u65E0\u6548\uFF1A" + e.message, "err");
    }
    return;
  }
  if (a === "validate") {
    jsonRender();
    return;
  }
  if (a === "escape") {
    ta.value = JSON.stringify(ta.value);
    jstate.respPath = "";
    jstore.set({ text: ta.value });
    jsonRender();
    return;
  }
  if (a === "unescape") {
    try {
      const val = JSON.parse(ta.value);
      if (typeof val === "string") {
        ta.value = val;
        jstate.respPath = "";
        jstore.set({ text: ta.value });
        jsonRender();
      } else setStatus("\u5F53\u524D\u4E0D\u662F JSON \u5B57\u7B26\u4E32\uFF0C\u65E0\u6CD5\u53BB\u8F6C\u4E49", "warn");
    } catch (e) {
      setStatus("\u53BB\u8F6C\u4E49\u5931\u8D25\uFF1A" + e.message, "err");
    }
    return;
  }
  if (a === "copy") {
    const d = jsonDrilled();
    copy(d !== void 0 ? JSON.stringify(d, null, 2) : ta.value, "\u5DF2\u590D\u5236");
    return;
  }
  if (a === "pretty") {
    jstate.prettyCells = !jstate.prettyCells;
    jsonRenderBody();
    return;
  }
  if (a === "expand") {
    jstate.treeOpen = "all";
    jsonRenderBody();
    return;
  }
  if (a === "collapse") {
    jstate.treeOpen = "none";
    jsonRenderBody();
    return;
  }
}
function jsonRender() {
  const ta = $("#jsonInput"), st = $("#jsonStatus"), tools = $("#jsonTools"), pane = $("#jsonPane");
  if (!ta) return;
  const txt = ta.value;
  if (!txt.trim()) {
    jstate.data = void 0;
    st.textContent = "\u7B49\u5F85\u8F93\u5165\u2026";
    st.className = "t-status";
    tools.style.display = "none";
    pane.innerHTML = '<div class="res-idle"><div class="big">\u7C98\u8D34 JSON</div>\u5DE6\u4FA7\u8F93\u5165\uFF0C\u53F3\u4FA7\u81EA\u52A8\u6E32\u67D3\u3002</div>';
    return;
  }
  let val;
  try {
    val = JSON.parse(txt);
  } catch (e) {
    jstate.data = void 0;
    const p = jsonErrPos(txt, e);
    st.textContent = "\u2717 \u975E\u6CD5 JSON" + (p ? " \xB7 \u884C " + p.line + " \u5217 " + p.col : "");
    st.className = "t-status err";
    tools.style.display = "none";
    pane.innerHTML = '<div class="res-err"><div class="ti">\u26A0 JSON \u89E3\u6790\u5931\u8D25</div><div>' + esc(e.message) + "</div>" + (p ? '<div class="hintbox">\u5B9A\u4F4D\uFF1A\u7B2C ' + p.line + " \u884C\uFF0C\u7B2C " + p.col + " \u5217</div>" : "") + "</div>";
    return;
  }
  jstate.data = val;
  st.textContent = "\u2713 \u5408\u6CD5 \xB7 " + typeLabel(val) + " \xB7 " + bytes(new Blob([txt]).size);
  st.className = "t-status ok";
  if (!jstate.userPickedView) jstate.respView = Array.isArray(val) ? "table" : val && typeof val === "object" ? "object" : "raw";
  jsonRenderTools();
  jsonRenderBody();
}
function jsonRenderTools() {
  const tools = $("#jsonTools");
  tools.style.display = "flex";
  tools.innerHTML = "";
  const paths = collectPaths(jstate.data);
  tools.appendChild(pathDropdown(jstate, paths, () => jsonRenderBody()));
  const fields = jsonFields(jstate.data, jstate.respPath);
  tools.appendChild(filterBar(jstate, () => jsonRenderBody(), fields));
}
function jsonFields(data, path) {
  if (!data) return [];
  let d = data;
  if (path) {
    const g = getByPath(data, path);
    if (g.ok) d = g.value;
  }
  if (Array.isArray(d) && d.length && d[0] && typeof d[0] === "object" && !Array.isArray(d[0])) return Object.keys(d[0]);
  if (d && typeof d === "object" && !Array.isArray(d)) return Object.keys(d);
  return [];
}
function jsonDrilled() {
  const data = jstate.data;
  if (data === void 0) return void 0;
  if (jstate.respPath) {
    const g = getByPath(data, jstate.respPath);
    return g.ok ? g.value : void 0;
  }
  return data;
}
function jsonRenderBody() {
  const pane = $("#jsonPane");
  if (!pane) return;
  const data = jstate.data;
  let d = data, drillErr = false;
  if (jstate.respPath && data !== void 0) {
    const g = getByPath(data, jstate.respPath);
    if (g.ok) d = g.value;
    else {
      drillErr = true;
      d = void 0;
    }
  }
  const hasJSON = d !== void 0;
  const canTable = hasJSON && (Array.isArray(d) || d && typeof d === "object");
  const caps = { object: hasJSON, table: canTable, raw: true };
  if (!caps[jstate.respView]) jstate.respView = hasJSON ? "object" : "raw";
  const isT = jstate.respView === "table", isO = jstate.respView === "object", isR = jstate.respView === "raw";
  $$("#jsonSubtabs .subtab").forEach((b) => {
    const x = b.dataset.jv;
    b.classList.toggle("active", x === jstate.respView);
    b.classList.toggle("disabled", !caps[x]);
  });
  const pBtn = $("#jsonPretty");
  pBtn.style.display = isT || isO ? "" : "none";
  pBtn.style.color = jstate.prettyCells ? "var(--brand)" : "";
  pBtn.innerHTML = jstate.prettyCells ? "\u2726 \u7F8E\u5316" : "\u2726 \u539F\u59CB";
  $("#jsonExpand").style.display = isO ? "" : "none";
  $("#jsonCollapse").style.display = isO ? "" : "none";
  pane.innerHTML = "";
  if (drillErr) {
    pane.innerHTML = '<div class="prev-none">\u8DEF\u5F84 <b>' + esc(jstate.respPath) + "</b> \u4E0D\u5B58\u5728\u3002</div>";
    return;
  }
  if (isR) pane.appendChild(viewRaw({}, d));
  else if (isO) pane.appendChild(viewObject(d, jstate));
  else pane.appendChild(viewTable(d, jstate));
}

// src/tools/sql.js
var sqlMode = "tpl";
var sqlstore = store("sql");
function initSqlTool() {
  const v = $("#viewSql");
  v.innerHTML = `
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">\u2261</span> SQL \u6A21\u677F\u586B\u5145</span>
      <div class="t-seg" id="sqlSeg"><button data-m="tpl" class="on">? + \u53C2\u6570</button><button data-m="log">MyBatis \u65E5\u5FD7</button></div>
      <button class="t-btn primary" data-sa="run">\u25B6 \u751F\u6210 SQL</button>
      <button class="t-btn" data-sa="sample">\u793A\u4F8B</button>
      <button class="t-btn" data-sa="clear">\u6E05\u7A7A</button>
      <span class="sp"></span>
      <button class="t-btn" data-sa="copy">\u29C9 \u590D\u5236\u7ED3\u679C</button>
    </div>
    <div class="t-body">
      <div id="sqlTplBox">
        <div class="t-field"><label>\u9884\u7F16\u8BD1 SQL + \u53C2\u6570\uFF08\u4E00\u6BB5\u7C98\u8D34\uFF0C\u7528 ::: \u5206\u9694\uFF1B\u53C2\u6570\u4E2D\u62EC\u53F7 [ ] \u53EF\u7701\u7565\uFF1B\u81EA\u52A8\u6E05\u6D17 \u201C*/ \u201D \u65E5\u5FD7\u524D\u7F00\uFF09</label><textarea class="t-ta" id="sqlTpl" spellcheck="false" style="min-height:170px" placeholder="SELECT * FROM user WHERE id = ? AND status = ? ::: [1, active]"></textarea></div>
      </div>
      <div id="sqlLogBox" style="display:none">
        <div class="t-field"><label>MyBatis \u65E5\u5FD7\uFF08\u542B Preparing \u4E0E Parameters \u884C\uFF09</label><textarea class="t-ta" id="sqlLog" spellcheck="false" style="min-height:150px" placeholder="==>  Preparing: SELECT * FROM user WHERE id = ? AND name = ?&#10;==> Parameters: 1(Integer), relay(String)"></textarea></div>
      </div>
      <div class="t-field"><label>\u7ED3\u679C</label><pre class="t-out" id="sqlOut"></pre><div class="t-note" id="sqlNote"></div></div>
    </div>
  </div>`;
  $$("#sqlSeg button").forEach((b) => b.onclick = () => {
    sqlMode = b.dataset.m;
    $$("#sqlSeg button").forEach((x) => x.classList.toggle("on", x === b));
    $("#sqlTplBox").style.display = sqlMode === "tpl" ? "" : "none";
    $("#sqlLogBox").style.display = sqlMode === "log" ? "" : "none";
    sqlPersist();
    sqlRun();
  });
  v.querySelectorAll("[data-sa]").forEach((b) => b.onclick = () => sqlAction(b.dataset.sa));
  ["sqlTpl", "sqlLog"].forEach((id) => {
    const t = $("#" + id);
    t.addEventListener("input", () => {
      sqlPersist();
      sqlRun();
    });
    t.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        sqlRun();
      }
    });
  });
  const sv = sqlstore.get();
  if (sv) {
    if (sv.tpl != null) $("#sqlTpl").value = sv.tpl;
    if (sv.log != null) $("#sqlLog").value = sv.log;
    if (sv.mode) {
      sqlMode = sv.mode;
      $$("#sqlSeg button").forEach((x) => x.classList.toggle("on", x.dataset.m === sqlMode));
      $("#sqlTplBox").style.display = sqlMode === "tpl" ? "" : "none";
      $("#sqlLogBox").style.display = sqlMode === "log" ? "" : "none";
    }
  }
  sqlRun();
}
function sqlPersist() {
  sqlstore.set({ mode: sqlMode, tpl: ($("#sqlTpl") || {}).value || "", log: ($("#sqlLog") || {}).value || "" });
}
function sqlAction(a) {
  if (a === "clear") {
    if (sqlMode === "tpl") $("#sqlTpl").value = "";
    else $("#sqlLog").value = "";
    sqlPersist();
    sqlRun();
    return;
  }
  if (a === "sample") {
    if (sqlMode === "tpl") {
      $("#sqlTpl").value = "SELECT id, name, status FROM user WHERE dept_id = ? AND status = ? AND name LIKE ? AND deleted = ? ::: [10, active, %relay%, false]";
    } else {
      $("#sqlLog").value = "2026-06-06 10:00:00 DEBUG c.m.U.find ==>  Preparing: SELECT * FROM user WHERE id = ? AND name = ? AND created_at > ?\n2026-06-06 10:00:00 DEBUG c.m.U.find ==> Parameters: 1(Long), O'Brien(String), 2025-01-01 00:00:00(Timestamp)";
    }
    sqlPersist();
    sqlRun();
    return;
  }
  if (a === "copy") {
    const out = $("#sqlOut").textContent;
    if (out.trim()) copy(out, "SQL \u5DF2\u590D\u5236");
    return;
  }
  if (a === "run") {
    sqlRun();
    return;
  }
}
function sqlRun() {
  const out = $("#sqlOut"), note = $("#sqlNote");
  if (!out) return;
  let sql, params, res;
  if (sqlMode === "tpl") {
    const input = stripSqlPrefix($("#sqlTpl").value);
    if (!input.trim()) {
      out.innerHTML = "";
      note.textContent = "";
      note.className = "t-note";
      return;
    }
    const idx = input.indexOf(":::");
    sql = (idx >= 0 ? input.slice(0, idx) : input).trim();
    params = parseParamList(idx >= 0 ? input.slice(idx + 3) : "");
    res = fillSql(sql, params.map(sqlLit));
  } else {
    const log = $("#sqlLog").value;
    if (!log.trim()) {
      out.innerHTML = "";
      note.textContent = "";
      note.className = "t-note";
      return;
    }
    const mb = parseMyBatis(log);
    if (!mb) {
      out.innerHTML = "";
      note.textContent = "\u672A\u8BC6\u522B\u5230 Preparing \u884C\uFF08\u9700\u5305\u542B \u201CPreparing: \u2026\u201D\uFF09\u3002";
      note.className = "t-note err";
      return;
    }
    sql = mb.sql;
    params = mb.params;
    res = fillSql(sql, params);
  }
  out.innerHTML = hlSQL(res.sql);
  const qn = res.holes, pn = params.length;
  if (res.missing > 0) {
    note.textContent = "\u26A0 \u5360\u4F4D\u7B26 " + qn + " \u4E2A \xB7 \u53C2\u6570 " + pn + " \u4E2A\uFF1A\u7F3A " + res.missing + " \u4E2A\uFF08\u5DF2\u4FDD\u7559 ?\uFF09";
    note.className = "t-note err";
  } else if (pn > qn) {
    note.textContent = "\u26A0 \u5360\u4F4D\u7B26 " + qn + " \u4E2A \xB7 \u53C2\u6570 " + pn + " \u4E2A\uFF1A\u591A\u51FA " + (pn - qn) + " \u4E2A\uFF08\u5DF2\u5FFD\u7565\uFF09";
    note.className = "t-note";
  } else {
    note.textContent = "\u2713 \u5360\u4F4D\u7B26 " + qn + " \u4E2A \xB7 \u53C2\u6570 " + pn + " \u4E2A \xB7 \u5DF2\u5168\u90E8\u586B\u5145";
    note.className = "t-note ok";
  }
}
function stripSqlPrefix(s) {
  const i = s.indexOf("*/ ");
  return i !== -1 ? s.slice(i + 3) : s;
}
function parseParamList(raw) {
  let s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const parts = s.indexOf("\n") >= 0 ? s.split("\n") : s.split(",");
  return parts.map((x) => x.trim()).filter((x) => x !== "");
}
function sqlLit(tok) {
  const s = String(tok).trim();
  if (s === "") return "''";
  if (/^null$/i.test(s)) return "NULL";
  if (/^true$/i.test(s)) return "TRUE";
  if (/^false$/i.test(s)) return "FALSE";
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (s.startsWith("'") && s.endsWith("'") && s.length > 1 || s.startsWith('"') && s.endsWith('"') && s.length > 1) return "'" + s.slice(1, -1).replace(/'/g, "''") + "'";
  return "'" + s.replace(/'/g, "''") + "'";
}
function fillSql(sql, lits) {
  let out = "", i = 0, holes = 0, inS = false, sc = "", inLine = false, inBlk = false;
  for (let p = 0; p < sql.length; p++) {
    const c = sql[p], n = sql[p + 1];
    if (inLine) {
      out += c;
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlk) {
      out += c;
      if (c === "*" && n === "/") {
        out += n;
        p++;
        inBlk = false;
      }
      continue;
    }
    if (inS) {
      out += c;
      if (c === sc) {
        if (sql[p + 1] === sc) {
          out += sql[++p];
        } else inS = false;
      }
      continue;
    }
    if (c === "-" && n === "-") {
      inLine = true;
      out += c;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlk = true;
      out += c;
      continue;
    }
    if (c === "'" || c === '"') {
      inS = true;
      sc = c;
      out += c;
      continue;
    }
    if (c === "?") {
      holes++;
      if (i < lits.length) out += lits[i++];
      else out += "?";
      continue;
    }
    out += c;
  }
  return { sql: out, holes, used: i, missing: Math.max(0, holes - lits.length) };
}
function parseMyBatis(log) {
  const pm = /Preparing:\s*(.+?)\s*$/im.exec(log);
  if (!pm) return null;
  const sql = pm[1].trim();
  const am = /Parameters:\s*(.*)$/im.exec(log);
  let lits = [];
  if (am) {
    const raw = am[1].trim();
    if (raw) {
      lits = splitMyBatisParams(raw).map((tok) => {
        tok = tok.trim();
        if (tok === "" || /^null$/i.test(tok)) return /^null$/i.test(tok) ? "NULL" : "''";
        const m = /^([\s\S]*)\(([A-Za-z]+)\)$/.exec(tok);
        if (m) return mybatisLit(m[1], m[2]);
        return sqlLit(tok);
      });
    }
  }
  return { sql, params: lits };
}
function splitMyBatisParams(raw) {
  const parts = [];
  let cur = "", depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "(") depth++, cur += c;
    else if (c === ")") depth--, cur += c;
    else if (c === "," && depth <= 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}
function mybatisLit(val, type) {
  const t = type.toLowerCase();
  val = val.trim();
  if (/^(integer|int|long|short|byte|double|float|bigdecimal|decimal|number)$/.test(t)) return val === "" ? "NULL" : val;
  if (/^bool/.test(t)) return /^true$/i.test(val) ? "TRUE" : "FALSE";
  return "'" + val.replace(/'/g, "''") + "'";
}
var SQL_KW_SET = new Set("SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER LIMIT OFFSET HAVING AS IN IS NULL LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX ASC DESC UNION ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE".split(" "));
function hlSQL(sql) {
  let out = "", i = 0;
  const push = (cls, txt) => {
    out += cls ? '<span class="' + cls + '">' + esc(txt) + "</span>" : esc(txt);
  };
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      let j = i + 1, s = "'";
      while (j < sql.length) {
        s += sql[j];
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            s += "'";
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      push("tok-str", s);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) && !/[A-Za-z_]/.test(sql[i - 1] || "")) {
      let j = i, s = "";
      while (j < sql.length && /[0-9.]/.test(sql[j])) {
        s += sql[j];
        j++;
      }
      push("tok-num", s);
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i, s = "";
      while (j < sql.length && /[A-Za-z_0-9]/.test(sql[j])) {
        s += sql[j];
        j++;
      }
      push(SQL_KW_SET.has(s.toUpperCase()) ? "tok-key" : "", s);
      i = j;
      continue;
    }
    push("", c);
    i++;
  }
  return out;
}

// src/tools/time.js
var tzState = { utc: false };
var timeClock = null;
function initTimeTool() {
  const v = $("#viewTime");
  v.innerHTML = `
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">\u25F7</span> \u65F6\u95F4\u6233\u8F6C\u6362</span>
      <button class="t-btn" data-tnow="1">\u27F3 \u7528\u5F53\u524D\u65F6\u95F4</button>
      <div class="t-seg" id="tzSeg"><button data-tz="local" class="on">\u672C\u5730\u65F6\u533A</button><button data-tz="utc">UTC</button></div>
      <span class="sp"></span>
    </div>
    <div class="t-body">
      <div class="t-now"><span class="lab">\u73B0\u5728</span><span class="clk" id="timeNow"></span><button class="cp" data-tcp="nowsec">\u590D\u5236\u79D2</button><button class="cp" data-tcp="nowms">\u590D\u5236\u6BEB\u79D2</button></div>
      <div class="t-grid">
        <div class="t-card"><h4>\u65F6\u95F4\u6233 \u2192 \u65F6\u95F4</h4><input class="t-in" id="tsIn" spellcheck="false" placeholder="\u8F93\u5165 epoch\uFF1A\u79D2 / \u6BEB\u79D2 / \u5FAE\u79D2\uFF0C\u81EA\u52A8\u8BC6\u522B"><div id="tsOut" style="margin-top:12px"></div></div>
        <div class="t-card"><h4>\u65F6\u95F4 \u2192 \u65F6\u95F4\u6233</h4><input class="t-in" id="dtIn" spellcheck="false" placeholder="\u5982 2025-12-01 08:30:00 \u6216 2025-12-01T08:30:00Z"><div id="dtOut" style="margin-top:12px"></div></div>
      </div>
    </div>
  </div>`;
  $("#tsIn").addEventListener("input", timeRenderTs);
  $("#dtIn").addEventListener("input", timeRenderDt);
  $$("#tzSeg button").forEach((b) => b.onclick = () => {
    tzState.utc = b.dataset.tz === "utc";
    $$("#tzSeg button").forEach((x) => x.classList.toggle("on", x === b));
    timeRenderTs();
    timeRenderDt();
  });
  v.querySelectorAll("[data-tnow]").forEach((b) => b.onclick = () => {
    $("#tsIn").value = String(Date.now());
    timeRenderTs();
  });
  v.querySelectorAll("[data-tcp]").forEach((b) => b.onclick = () => {
    const now = Date.now();
    copy(b.dataset.tcp === "nowsec" ? String(Math.floor(now / 1e3)) : String(now), "\u5DF2\u590D\u5236");
  });
  timeTick();
  if (timeClock) clearInterval(timeClock);
  timeClock = setInterval(timeTick, 1e3);
  timeRenderTs();
  timeRenderDt();
}
function timeTick() {
  const e = $("#timeNow");
  if (!e) return;
  const d = /* @__PURE__ */ new Date();
  e.textContent = (tzState.utc ? fmtUTC(d) : fmtDate(d)) + "  \xB7  " + Math.floor(Date.now() / 1e3) + " s";
}
function kvRow(k, val) {
  return '<div class="kvline"><span class="kk">' + esc(k) + '</span><span class="vv">' + esc(val) + '</span><button class="cp" data-cv="' + esc(val) + '">\u590D\u5236</button></div>';
}
function bindCopies(host) {
  host.querySelectorAll("[data-cv]").forEach((b) => b.onclick = () => copy(b.dataset.cv, "\u5DF2\u590D\u5236"));
}
function tsToDate(raw) {
  const s = String(raw).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const digits = s.replace("-", "").length;
  const n = Number(s);
  if (!isFinite(n)) return null;
  let date, unit;
  if (digits <= 10) {
    date = new Date(n * 1e3);
    unit = "\u79D2";
  } else if (digits <= 13) {
    date = new Date(n);
    unit = "\u6BEB\u79D2";
  } else if (digits <= 16) {
    date = new Date(Math.round(n / 1e3));
    unit = "\u5FAE\u79D2";
  } else {
    date = new Date(Math.round(n / 1e6));
    unit = "\u7EB3\u79D2";
  }
  return isNaN(+date) ? null : { date, unit };
}
function fmtUTC(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds());
}
function relTime(d) {
  const diff = Date.now() - +d, a = Math.abs(diff), f = diff >= 0;
  const u = [["\u5E74", 31536e6], ["\u5929", 864e5], ["\u5C0F\u65F6", 36e5], ["\u5206\u949F", 6e4], ["\u79D2", 1e3]];
  for (const [name, ms2] of u) {
    if (a >= ms2) {
      const val = Math.floor(a / ms2);
      return val + name + (f ? "\u524D" : "\u540E");
    }
  }
  return "\u521A\u521A";
}
function timeRenderTs() {
  const inp = $("#tsIn");
  if (!inp) return;
  const raw = inp.value.trim();
  const host = $("#tsOut");
  if (!raw) {
    host.innerHTML = '<div class="t-note">\u8F93\u5165\u6570\u5B57\u65F6\u95F4\u6233\u2026</div>';
    return;
  }
  const r = tsToDate(raw);
  if (!r) {
    host.innerHTML = '<div class="t-note err">\u4E0D\u662F\u5408\u6CD5\u7684\u6570\u5B57\u65F6\u95F4\u6233\u3002</div>';
    return;
  }
  const d = r.date;
  host.innerHTML = kvRow("\u8BC6\u522B\u4E3A", r.unit + "\uFF08" + raw.replace("-", "").length + " \u4F4D\uFF09") + kvRow(tzState.utc ? "UTC \u65F6\u95F4" : "\u672C\u5730\u65F6\u95F4", tzState.utc ? fmtUTC(d) : fmtDate(d)) + kvRow(tzState.utc ? "\u672C\u5730\u65F6\u95F4" : "UTC \u65F6\u95F4", tzState.utc ? fmtDate(d) : fmtUTC(d)) + kvRow("ISO 8601", d.toISOString()) + kvRow("\u76F8\u5BF9", relTime(d)) + kvRow("\u79D2", String(Math.floor(+d / 1e3))) + kvRow("\u6BEB\u79D2", String(+d));
  bindCopies(host);
}
function timeRenderDt() {
  const inp = $("#dtIn");
  if (!inp) return;
  const raw = inp.value.trim();
  const host = $("#dtOut");
  if (!raw) {
    host.innerHTML = '<div class="t-note">\u8F93\u5165\u65E5\u671F\u65F6\u95F4\u5B57\u7B26\u4E32\u2026</div>';
    return;
  }
  let d = new Date(raw);
  if (isNaN(+d)) d = new Date(raw.replace(" ", "T"));
  if (isNaN(+d)) {
    host.innerHTML = '<div class="t-note err">\u65E0\u6CD5\u89E3\u6790\u8BE5\u65E5\u671F\u3002\u8BD5\u8BD5 2025-12-01 08:30:00 \u6216\u5E26 Z \u7684 ISO \u4E32\u3002</div>';
    return;
  }
  host.innerHTML = kvRow("\u79D2 epoch", String(Math.floor(+d / 1e3))) + kvRow("\u6BEB\u79D2 epoch", String(+d)) + kvRow("\u672C\u5730\u65F6\u95F4", fmtDate(d)) + kvRow("UTC \u65F6\u95F4", fmtUTC(d)) + kvRow("ISO 8601", d.toISOString()) + kvRow("\u76F8\u5BF9", relTime(d));
  bindCopies(host);
}

// src/tools/db.js
var dbstore = store("db");
var connStore = store("db.conns");
var historyStore = store("db.history");
var COLORS = ["#3fb950", "#4493f8", "#a371f7", "#d29922", "#f85149", "#8b949e"];
var MAX_HISTORY = 100;
var _panelMode3 = false;
var _dbBase = "http://127.0.0.1:9860";
function setDbPanelMode(on, base) {
  _panelMode3 = !!on;
  if (base) _dbBase = base;
}
function availH() {
  return _panelMode3 ? ($("#viewDb") || document.body).clientHeight : window.innerHeight;
}
function availW() {
  return _panelMode3 ? ($("#viewDb") || document.body).clientWidth : window.innerWidth;
}
var SQL_KW_LIST = "SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER LIMIT OFFSET HAVING AS IN IS NULL LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX ASC DESC UNION ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE".split(" ");
var dbstate = {
  driver: "mysql",
  my: { host: "127.0.0.1", port: "3306", user: "root", password: "", database: "", dbToken: "", token: null, version: null, columns: {}, tables: [] },
  sb: { url: "", key: "", proxy: false, connected: false, schema: {}, tables: [] },
  curTable: null,
  result: null,
  activeConnId: null,
  sideTab: "tables",
  sqlText: null,
  view: { respView: "table", tableSel: null, respFilter: "", prettyCells: true, colW: {}, treeOpen: "auto", colOrder: {}, rerender: null }
};
function save() {
  dbstore.set({
    driver: dbstate.driver,
    my: { host: dbstate.my.host, port: dbstate.my.port, user: dbstate.my.user, database: dbstate.my.database, dbToken: dbstate.my.dbToken },
    sb: { url: dbstate.sb.url, proxy: dbstate.sb.proxy },
    activeConnId: dbstate.activeConnId,
    curTable: dbstate.curTable
  });
}
function loadConns() {
  return connStore.get() || [];
}
function saveConns(conns) {
  connStore.set(conns);
}
function getConn(id) {
  return loadConns().find((c) => c.id === id) || null;
}
function upsertConn(c) {
  const conns = loadConns();
  const idx = conns.findIndex((x) => x.id === c.id);
  if (idx >= 0) conns[idx] = c;
  else conns.push(c);
  saveConns(conns);
}
function removeConn(id) {
  saveConns(loadConns().filter((c) => c.id !== id));
}
function connected() {
  return dbstate.driver === "mysql" ? !!dbstate.my.token : dbstate.sb.connected;
}
function coerce(v) {
  const s = String(v);
  if (s === "") return "";
  if (/^null$/i.test(s)) return null;
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function saveEditorContent() {
  const ta = $("#dbSql");
  if (ta) dbstate.sqlText = ta.value;
}
function pushHistory(sql, rows, ms2, affected) {
  if (!sql || dbstate.driver !== "mysql") return;
  const hist = historyStore.get() || [];
  hist.unshift({ sql, ts: Date.now(), rows: rows || 0, ms: ms2 || 0, affected: affected || null });
  if (hist.length > MAX_HISTORY) hist.length = MAX_HISTORY;
  historyStore.set(hist);
}
function loadHistory() {
  return historyStore.get() || [];
}
function relTime2(ts) {
  const d = Date.now() - ts;
  if (d < 6e4) return "\u521A\u521A";
  if (d < 36e5) return Math.floor(d / 6e4) + "\u5206\u949F\u524D";
  if (d < 864e5) return Math.floor(d / 36e5) + "\u5C0F\u65F6\u524D";
  const dt = new Date(ts);
  return dt.getMonth() + 1 + "/" + dt.getDate() + " " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
}
async function dbReq(route, payload) {
  let res;
  const headers = { "Content-Type": "application/json" };
  if (dbstate.my.dbToken) headers["X-Relay-DB-Token"] = dbstate.my.dbToken;
  const base = _panelMode3 ? _dbBase : "";
  try {
    res = await fetch(base + "/__db/" + route, { method: "POST", headers, body: JSON.stringify(payload) });
  } catch (e) {
    return { ok: false, error: "\u65E0\u6CD5\u8FDE\u63A5\u672C\u5730\u540E\u7AEF\uFF1A" + e.message, hint: "\u786E\u8BA4\u672C\u5730\u540E\u7AEF\u6B63\u5728\u8FD0\u884C\uFF1Anpm start\uFF08node server.js\uFF09\uFF0C\u6216 bash serve.sh" };
  }
  try {
    return await res.json();
  } catch (e) {
    return { ok: false, error: "\u540E\u7AEF\u8FD4\u56DE\u975E JSON\uFF08HTTP " + res.status + "\uFF09" };
  }
}
async function sbFetch(pathQuery, opts = {}) {
  const b = dbstate.sb;
  const full = b.url.replace(/\/+$/, "") + pathQuery;
  const headers = Object.assign({ apikey: b.key, Authorization: "Bearer " + b.key }, opts.headers || {});
  let url = full;
  if (b.proxy) {
    headers["X-Relay-Target"] = full;
    url = (_panelMode3 ? _dbBase : "") + "/__proxy";
  }
  return fetch(url, { method: opts.method || "GET", headers, body: opts.body });
}
function initDbTool() {
  const sv = dbstore.get();
  if (sv) {
    if (sv.driver) dbstate.driver = sv.driver;
    if (sv.my) Object.assign(dbstate.my, { host: sv.my.host ?? dbstate.my.host, port: sv.my.port ?? dbstate.my.port, user: sv.my.user ?? dbstate.my.user, database: sv.my.database ?? dbstate.my.database, dbToken: sv.my.dbToken ?? "" });
    if (sv.sb) Object.assign(dbstate.sb, { url: sv.sb.url ?? "", proxy: !!sv.sb.proxy });
    if (sv.activeConnId) dbstate.activeConnId = sv.activeConnId;
    if (sv.curTable) dbstate.curTable = sv.curTable;
  }
  if (dbstate.activeConnId) {
    const c = getConn(dbstate.activeConnId);
    if (c && c.rememberPwd && c.encPwd) dbstate.my.password = atob(c.encPwd);
  }
  dbstate.view.rerender = () => renderResult(dbstate.result);
  const v = $("#viewDb");
  v.innerHTML = `
  <div class="tool-pane">
    <div class="t-bar">
      <span class="t-title"><span class="tg">\u26C1</span> \u6570\u636E\u5E93</span>
      <div class="t-seg" id="dbSeg"><button data-d="mysql">MySQL</button><button data-d="supabase">Supabase</button></div>
      <span class="db-chip" id="dbStatus" style="display:none"></span>
      <span class="sp"></span>
      <span class="t-status" id="dbMsg"></span>
      <button class="t-btn" id="dbDisc" style="display:none">\u65AD\u5F00</button>
    </div>
    <div id="dbBody" style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column"></div>
  </div>`;
  $$("#dbSeg button").forEach((b) => b.onclick = () => {
    if (connected()) return;
    setDriver(b.dataset.d);
  });
  $("#dbDisc").onclick = disconnect;
  $$("#dbSeg button").forEach((x) => x.classList.toggle("on", x.dataset.d === dbstate.driver));
  if (dbstate.driver === "mysql" && dbstate.activeConnId) {
    const c = getConn(dbstate.activeConnId);
    if (c && c.rememberPwd && c.encPwd) {
      tryAutoReconnect(c);
      return;
    }
  }
  setDriver(dbstate.driver);
}
function setDriver(d) {
  dbstate.driver = d;
  save();
  $$("#dbSeg button").forEach((x) => x.classList.toggle("on", x.dataset.d === d));
  renderBody();
}
function dbMsg(t, kind) {
  const m = $("#dbMsg");
  if (!m) return;
  m.textContent = t || "";
  m.className = "t-status" + (kind ? " " + kind : "");
}
function renderBody() {
  const seg = $$("#dbSeg button");
  seg.forEach((x) => {
    x.disabled = connected();
    x.style.opacity = connected() ? ".5" : "";
  });
  if (connected()) renderWorkspace();
  else renderConn();
}
function renderConn() {
  $("#dbStatus").style.display = "none";
  $("#dbDisc").style.display = "none";
  const body = $("#dbBody");
  if (dbstate.driver === "mysql") {
    const conns = loadConns().filter((c) => c.driver === "mysql");
    body.innerHTML = `<div class="db-conn"><div class="cm">
      <div class="cm-list">
        <div class="cm-list-h">\u5DF2\u4FDD\u5B58\u7684\u8FDE\u63A5</div>
        <div class="cm-list-items" id="cmList"></div>
        <button class="cm-add" id="cmAdd">+ \u65B0\u589E\u8FDE\u63A5</button>
      </div>
      <div class="cm-form" id="cmForm"></div>
    </div></div>`;
    renderConnList(conns);
    $("#cmAdd").onclick = () => {
      const id = "c" + Date.now();
      const c = { id, name: "\u65B0\u8FDE\u63A5", driver: "mysql", host: "127.0.0.1", port: "3306", user: "root", database: "", color: COLORS[conns.length % COLORS.length], rememberPwd: false, encPwd: "" };
      upsertConn(c);
      dbstate.activeConnId = id;
      save();
      renderConn();
    };
  } else {
    const b = dbstate.sb;
    body.innerHTML = `<div class="db-conn"><div class="db-card">
      <h3>\u8FDE\u63A5 Supabase</h3>
      <div class="sub">Supabase \u63D0\u4F9B\u6D4F\u89C8\u5668\u539F\u751F\u7684 <b>PostgREST</b> \u63A5\u53E3\uFF0C\u524D\u7AEF\u76F4\u63A5\u4EE5 <b>apikey</b> \u8C03\u7528\u3002CORS \u53D7\u9650\u65F6\u53EF\u52FE\u9009\u300C\u7ECF\u672C\u5730\u4EE3\u7406\u300D\u8D70 /__proxy \u8F6C\u53D1\u3002Key \u53EA\u5728\u5185\u5B58\u3001\u4E0D\u4FDD\u5B58\u3002</div>
      <div class="db-row"><label>Project URL</label><input class="t-in" id="sbUrl" spellcheck="false" value="${esc(b.url)}" placeholder="https://xxxx.supabase.co"></div>
      <div class="db-row"><label>API Key</label><input class="t-in" id="sbKey" type="password" spellcheck="false" value="" placeholder="anon \u6216 service_role key"></div>
      <div class="db-row inline"><label></label><label class="ckbox"><input type="checkbox" id="sbProxy" ${b.proxy ? "checked" : ""}> \u7ECF\u672C\u5730\u4EE3\u7406 /__proxy\uFF08\u7ED5\u8FC7 CORS\uFF09</label></div>
      <div class="db-acts"><button class="t-btn primary" id="sbConn">\u8FDE\u63A5</button></div>
    </div></div>`;
    $("#sbConn").onclick = async () => {
      const b2 = dbstate.sb;
      b2.url = $("#sbUrl").value.trim();
      b2.key = $("#sbKey").value.trim();
      b2.proxy = $("#sbProxy").checked;
      save();
      if (!b2.url || !b2.key) {
        dbMsg("\u8BF7\u586B\u5199 URL \u4E0E API Key", "err");
        return;
      }
      dbMsg("\u8FDE\u63A5\u4E2D\u2026");
      const r = await loadTablesSupabase();
      if (!r.ok) {
        dbMsg("\u2717 " + r.error, "err");
        setStatus("Supabase \u8FDE\u63A5\u5931\u8D25\uFF1A" + r.error, "err");
        return;
      }
      dbstate.sb.connected = true;
      renderBody();
      setStatus("\u5DF2\u8FDE\u63A5 Supabase \xB7 " + dbstate.sb.tables.length + " \u5F20\u8868/\u89C6\u56FE", "ok");
    };
  }
}
function renderConnList(conns) {
  const list = $("#cmList");
  if (!list) return;
  const aid = dbstate.activeConnId;
  list.innerHTML = conns.map((c) => `
    <div class="cm-item${c.id === aid ? " on" : ""}" data-id="${c.id}">
      <span class="cm-dot" style="background:${c.color}"></span>
      <span class="cm-item-name">${esc(c.name)}</span>
      <span class="cm-item-host">${esc(c.host)}</span>
      <span class="cm-item-del" data-del="${c.id}" title="\u5220\u9664">\xD7</span>
    </div>`).join("");
  list.querySelectorAll(".cm-item").forEach((el2) => {
    el2.onclick = (e) => {
      if (e.target.dataset.del) {
        const c = getConn(e.target.dataset.del);
        if (c && confirm("\u786E\u5B9A\u5220\u9664\u300C" + c.name + "\u300D\uFF1F")) {
          removeConn(e.target.dataset.del);
          if (dbstate.activeConnId === e.target.dataset.del) dbstate.activeConnId = null;
          save();
          renderConn();
        }
        return;
      }
      dbstate.activeConnId = el2.dataset.id;
      save();
      renderConnForm();
      list.querySelectorAll(".cm-item").forEach((x) => x.classList.toggle("on", x.dataset.id === el2.dataset.id));
    };
  });
  renderConnForm();
}
function renderConnForm() {
  const form = $("#cmForm");
  if (!form) return;
  const c = dbstate.activeConnId ? getConn(dbstate.activeConnId) : null;
  if (!c) {
    form.innerHTML = '<h3>\u9009\u62E9\u6216\u65B0\u589E\u8FDE\u63A5</h3><div style="color:var(--dim);font-size:12px;margin-top:8px">\u70B9\u51FB\u5DE6\u4FA7\u8FDE\u63A5\u9879\u7F16\u8F91\uFF0C\u6216\u70B9\u51FB\u300C+ \u65B0\u589E\u8FDE\u63A5\u300D</div>';
    return;
  }
  form.innerHTML = `
    <h3>${esc(c.name)}</h3>
    <div class="db-row"><label>\u540D\u79F0</label><input class="t-in" id="cmName" spellcheck="false" value="${esc(c.name)}"></div>
    <div class="db-row"><label>\u989C\u8272</label>
      <div class="cm-colors">${COLORS.map((cl) => `<div class="cm-color${cl === c.color ? " on" : ""}" style="background:${cl}" data-color="${cl}"></div>`).join("")}</div>
    </div>
    <div class="db-row"><label>\u4E3B\u673A host</label><input class="t-in" id="cmHost" spellcheck="false" value="${esc(c.host)}"></div>
    <div class="db-row"><label>\u7AEF\u53E3 port</label><input class="t-in" id="cmPort" spellcheck="false" value="${esc(c.port)}"></div>
    <div class="db-row"><label>\u7528\u6237 user</label><input class="t-in" id="cmUser" spellcheck="false" value="${esc(c.user)}"></div>
    <div class="db-row"><label>\u5BC6\u7801 password</label><input class="t-in" id="cmPwd" type="password" spellcheck="false" value="${c.rememberPwd && c.encPwd ? atob(c.encPwd) : ""}"></div>
    <div class="cm-remember"><input type="checkbox" id="cmRemember" ${c.rememberPwd ? "checked" : ""}> \u8BB0\u4F4F\u5BC6\u7801\uFF08Base64 \u7F16\u7801\u5B58\u50A8\u5230\u672C\u5730\uFF09</div>
    <div class="db-row"><label>\u6570\u636E\u5E93</label><input class="t-in" id="cmDb" spellcheck="false" value="${esc(c.database)}" placeholder="\u53EF\u7559\u7A7A\uFF08\u8FDE\u63A5\u540E\u518D\u9009\u5E93\uFF09"></div>
    <div class="db-row"><label>\u8BBF\u95EE\u4EE4\u724C</label><input class="t-in" id="cmToken" type="password" spellcheck="false" value="" placeholder="\u4EC5\u5F53\u540E\u7AEF\u8BBE\u7F6E\u4E86 RELAY_DB_TOKEN \u65F6\u586B\u5199"></div>
    <div class="cm-sec">\u26A0 \u8BB0\u4F4F\u7684\u5BC6\u7801\u4E3A Base64 \u7F16\u7801\uFF08\u975E\u52A0\u5BC6\uFF09\uFF0C\u4EC5\u9002\u7528\u4E8E\u672C\u673A\u5F00\u53D1\u73AF\u5883</div>
    <div class="cm-acts">
      <button class="t-btn cm-btn-danger" id="cmDel">\u5220\u9664\u8FDE\u63A5</button>
      <span style="flex:1"></span>
      <button class="t-btn" id="cmTest">\u6D4B\u8BD5\u8FDE\u63A5</button>
      <button class="t-btn primary" id="cmConn">\u8FDE\u63A5</button>
    </div>`;
  form.querySelectorAll(".cm-color").forEach((el2) => {
    el2.onclick = () => {
      c.color = el2.dataset.color;
      upsertConn(c);
      renderConnForm();
    };
  });
  const fields = { cmName: "name", cmHost: "host", cmPort: "port", cmUser: "user", cmDb: "database" };
  Object.entries(fields).forEach(([elId, key]) => {
    const inp = $("#" + elId);
    if (!inp) return;
    inp.oninput = () => {
      c[key] = inp.value;
      upsertConn(c);
      if (key === "name") form.querySelector("h3").textContent = inp.value;
    };
  });
  $("#cmRemember").onchange = (e) => {
    c.rememberPwd = e.target.checked;
    upsertConn(c);
  };
  $("#cmDel").onclick = () => {
    if (confirm("\u786E\u5B9A\u5220\u9664\u300C" + c.name + "\u300D\uFF1F")) {
      removeConn(c.id);
      dbstate.activeConnId = null;
      save();
      renderConn();
    }
  };
  const grab = () => {
    c.name = $("#cmName").value.trim();
    c.host = $("#cmHost").value.trim();
    c.port = $("#cmPort").value.trim();
    c.user = $("#cmUser").value.trim();
    c.database = $("#cmDb").value.trim();
    c.rememberPwd = $("#cmRemember").checked;
    const pwd = $("#cmPwd").value;
    c.encPwd = c.rememberPwd && pwd ? btoa(pwd) : "";
    upsertConn(c);
    Object.assign(dbstate.my, { host: c.host, port: c.port, user: c.user, password: pwd, database: c.database, dbToken: $("#cmToken").value });
    save();
  };
  $("#cmTest").onclick = async () => {
    grab();
    dbMsg("\u6D4B\u8BD5\u4E2D\u2026");
    const r = await dbReq("test", { driver: "mysql", conn: connMysql() });
    if (r.ok) {
      dbMsg("\u2713 \u53EF\u8FDE\u63A5 \xB7 MySQL " + (r.serverVersion || ""), "ok");
      setStatus("MySQL \u8FDE\u63A5\u6D4B\u8BD5\u6210\u529F", "ok");
    } else {
      dbMsg("\u2717 " + r.error, "err");
      setStatus("MySQL \u6D4B\u8BD5\u5931\u8D25\uFF1A" + r.error + (r.hint ? "\uFF08" + r.hint + "\uFF09" : ""), "err");
    }
  };
  $("#cmConn").onclick = async () => {
    grab();
    dbMsg("\u8FDE\u63A5\u4E2D\u2026");
    const r = await dbReq("connect", { driver: "mysql", conn: connMysql() });
    if (!r.ok) {
      dbMsg("\u2717 " + r.error, "err");
      setStatus("\u8FDE\u63A5\u5931\u8D25\uFF1A" + r.error + (r.hint ? "\uFF08" + r.hint + "\uFF09" : ""), "err");
      return;
    }
    dbstate.my.token = r.token;
    dbstate.my.version = r.serverVersion;
    dbstate.my.database = r.database || dbstate.my.database;
    dbstate.activeConnId = c.id;
    save();
    await loadSchemaMysql();
    renderBody();
    setStatus("\u5DF2\u8FDE\u63A5 MySQL " + (r.serverVersion || ""), "ok");
  };
}
function connMysql() {
  const m = dbstate.my;
  return { host: m.host, port: m.port, user: m.user, password: m.password, database: m.database };
}
async function loadSchemaMysql() {
  const r = await dbReq("schema", { token: dbstate.my.token, database: dbstate.my.database });
  if (r.ok) {
    dbstate.my.tables = r.tables || [];
    dbstate.my.columns = r.columns || {};
    if (r.database) dbstate.my.database = r.database;
  } else setStatus("\u8BFB\u53D6\u8868\u7ED3\u6784\u5931\u8D25\uFF1A" + r.error, "err");
}
async function loadDatabasesMysql() {
  const r = await dbReq("databases", { token: dbstate.my.token });
  if (r.ok) return r.databases || [];
  setStatus("\u8BFB\u53D6\u6570\u636E\u5E93\u5217\u8868\u5931\u8D25\uFF1A" + r.error, "err");
  return [];
}
async function useDatabase(name) {
  const r = await dbReq("use", { token: dbstate.my.token, database: name });
  if (!r.ok) {
    setStatus("\u5207\u6362\u6570\u636E\u5E93\u5931\u8D25\uFF1A" + r.error, "err");
    return;
  }
  dbstate.my.database = name;
  await loadSchemaMysql();
  dbstate.curTable = null;
  dbstate.result = null;
  save();
  renderWorkspace();
  setStatus("\u5DF2\u5207\u6362\u5230 " + name, "ok");
}
async function loadTablesSupabase() {
  let res;
  try {
    res = await sbFetch("/rest/v1/");
  } catch (e) {
    return { ok: false, error: "\u8BF7\u6C42\u5931\u8D25\uFF1A" + e.message + "\uFF08CORS\uFF1F\u53EF\u52FE\u9009\u7ECF\u672C\u5730\u4EE3\u7406\uFF09" };
  }
  let spec;
  try {
    spec = await res.json();
  } catch (e) {
    return { ok: false, error: "\u8FD4\u56DE\u975E JSON\uFF08HTTP " + res.status + "\uFF09" };
  }
  if (!res.ok) return { ok: false, error: spec && (spec.message || spec.error) || "HTTP " + res.status };
  const defs = spec.definitions || spec.components && spec.components.schemas || {};
  const schema = {};
  Object.keys(defs).forEach((name) => {
    const props = defs[name] && defs[name].properties || {};
    schema[name] = Object.keys(props).map((c) => ({ name: c, type: props[c].format || props[c].type || "", pk: /primary key/i.test(props[c].description || "") }));
  });
  dbstate.sb.schema = schema;
  dbstate.sb.tables = Object.keys(schema);
  return { ok: true };
}
function disconnect() {
  if (dbstate.driver === "mysql" && dbstate.my.token) {
    dbReq("disconnect", { token: dbstate.my.token });
    dbstate.my.token = null;
  }
  dbstate.sb.connected = false;
  dbstate.sb.key = "";
  dbstate.my.password = "";
  dbstate.curTable = null;
  dbstate.result = null;
  save();
  dbMsg("");
  renderBody();
  setStatus("\u5DF2\u65AD\u5F00\u6570\u636E\u5E93\u8FDE\u63A5", "ok");
}
async function tryAutoReconnect(c) {
  const password = atob(c.encPwd);
  Object.assign(dbstate.my, { host: c.host, port: c.port, user: c.user, password });
  if (!dbstate.my.database && c.database) dbstate.my.database = c.database;
  const body = $("#dbBody");
  body.innerHTML = '<div class="res-loading" style="flex:1;display:flex;align-items:center;justify-content:center"><span class="spin"></span> <span style="margin-left:8px">\u6B63\u5728\u6062\u590D\u8FDE\u63A5\u2026</span></div>';
  dbMsg("\u6062\u590D\u8FDE\u63A5\u4E2D\u2026");
  try {
    const r = await dbReq("connect", { driver: "mysql", conn: connMysql() });
    if (!r.ok) throw new Error(r.error);
    dbstate.my.token = r.token;
    dbstate.my.version = r.serverVersion;
    dbstate.my.database = r.database || dbstate.my.database;
    save();
    await loadSchemaMysql();
    renderBody();
    if (dbstate.curTable) {
      if (curTables().includes(dbstate.curTable)) {
        selectTable(dbstate.curTable);
      } else {
        dbstate.curTable = null;
        save();
      }
    }
    setStatus("\u5DF2\u6062\u590D\u8FDE\u63A5 \xB7 MySQL " + (r.serverVersion || ""), "ok");
  } catch (e) {
    dbstate.my.token = null;
    renderBody();
    dbMsg("\u81EA\u52A8\u6062\u590D\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u8FDE\u63A5", "warn");
  }
}
function curTables() {
  return dbstate.driver === "mysql" ? dbstate.my.tables : dbstate.sb.tables;
}
function curCols(table) {
  return (dbstate.driver === "mysql" ? dbstate.my.columns : dbstate.sb.schema)[table] || [];
}
function pkOf(table) {
  const c = curCols(table).find((x) => x.pk);
  return c ? c.name : curCols(table)[0] && curCols(table)[0].name || "id";
}
function renderWorkspace() {
  saveEditorContent();
  const chip = $("#dbStatus");
  chip.style.display = "inline-flex";
  $("#dbDisc").style.display = "";
  const conn = dbstate.activeConnId ? getConn(dbstate.activeConnId) : null;
  const connColor = conn ? conn.color : "";
  const colorDot = connColor ? `<span class="cm-dot" style="background:${connColor};width:8px;height:8px;border-radius:50%;flex:none"></span>` : "";
  chip.innerHTML = `<span class="dotc"></span>${colorDot}` + (dbstate.driver === "mysql" ? "MySQL " + esc(dbstate.my.version || "") + (dbstate.my.database ? " \xB7 " + esc(dbstate.my.database) : "") : "Supabase" + (dbstate.sb.proxy ? " \xB7 \u4EE3\u7406" : ""));
  const sideLabel = dbstate.driver === "mysql" && dbstate.my.database ? esc(dbstate.my.database) + " \xB7 \u8868 / \u89C6\u56FE \xB7 " + curTables().length : "\u8868 / \u89C6\u56FE \xB7 " + curTables().length;
  const switchBtn = dbstate.driver === "mysql" ? '<button class="db-sel-btn" id="dbSelBtn" title="\u5207\u6362\u6570\u636E\u5E93">\u26C1</button>' : "";
  $("#dbBody").innerHTML = `<div class="db-main">
      <div class="db-side">
        <div class="db-side-h"><span id="dbSideLabel">${sideLabel}</span>${switchBtn}</div>
        ${dbstate.driver === "mysql" ? '<div class="db-side-tabs"><button class="db-side-tab on" id="tabTables">\u8868</button><button class="db-side-tab" id="tabHistory">\u5386\u53F2</button></div>' : ""}
        <div class="db-side-search"><input class="t-in" id="dbTableSearch" placeholder="\u641C\u7D22\u8868\u540D\u2026" spellcheck="false"></div>
        <div class="db-side-scroll"><div id="dbTables"></div><div id="dbHistory" style="display:none"></div></div>
      </div>
      <div class="db-right">
        <div class="db-toolbar" id="dbToolbar"></div>
        <div class="db-editor" id="dbEditor"></div>
        <div class="db-splitter" id="dbSplitter"></div>
        <div class="db-result" id="dbResult"><div class="res-idle"><div class="big">\u9009\u62E9\u4E00\u5F20\u8868</div>\u5DE6\u4FA7\u70B9\u9009\u8868\u540D\u67E5\u770B\u6570\u636E\uFF0C\u6216\u5728\u4E0A\u65B9\u7F16\u8F91\u67E5\u8BE2\u3002</div></div>
      </div>
    </div>`;
  renderTables();
  renderToolbar();
  renderEditor();
  const searchIn = $("#dbTableSearch");
  if (searchIn) searchIn.oninput = dbstate.sideTab === "history" ? filterHistory : filterTables;
  const tabT = $("#tabTables"), tabH = $("#tabHistory");
  if (tabT) tabT.onclick = () => switchSideTab("tables");
  if (tabH) tabH.onclick = () => switchSideTab("history");
  if (dbstate.sideTab === "history") switchSideTab("history");
  const selBtn = $("#dbSelBtn");
  if (selBtn) selBtn.onclick = () => {
    dbstate.my.database = "";
    dbstate.curTable = null;
    dbstate.result = null;
    renderWorkspace();
  };
  initSplitter();
}
function renderTables() {
  const host = $("#dbTables");
  host.innerHTML = "";
  if (dbstate.driver === "mysql" && !dbstate.my.database) {
    host.innerHTML = '<div class="res-loading"><span class="spin"></span> \u52A0\u8F7D\u4E2D\u2026</div>';
    loadDatabasesMysql().then((dbs) => {
      host.innerHTML = "";
      if (!dbs.length) {
        host.innerHTML = '<div class="path-empty">\u672A\u627E\u5230\u6570\u636E\u5E93</div>';
        return;
      }
      dbs.forEach((db) => {
        const b = el("button", "dbt dbt-db");
        b.innerHTML = '<span class="dbt-icon">\u{1F5C4}</span><span class="dbt-n">' + esc(db) + "</span>";
        b.onclick = () => useDatabase(db);
        host.appendChild(b);
      });
    });
    return;
  }
  filterTables();
}
function filterTables() {
  const host = $("#dbTables");
  if (!host) return;
  if (dbstate.driver === "mysql" && !dbstate.my.database) return;
  const q = ($("#dbTableSearch") ? $("#dbTableSearch").value : "").trim().toLowerCase();
  const tbls = curTables();
  const filtered = q ? tbls.filter((t) => t.toLowerCase().includes(q)) : tbls;
  host.innerHTML = "";
  if (!filtered.length) {
    host.innerHTML = '<div class="path-empty">' + (q ? "\u6CA1\u6709\u5339\u914D\u7684\u8868" : "\u65E0\u8868\u3002") + "</div>";
    return;
  }
  filtered.forEach((t) => {
    const cols = curCols(t);
    const pk = cols.some((c) => c.pk);
    const b = el("button", "dbt" + (t === dbstate.curTable ? " on" : ""));
    b.title = t + " \xB7 " + cols.length + " \u5217";
    b.innerHTML = `<span class="dbt-n">${esc(t)}</span>` + (cols.length ? `<span class="dbt-cols">${cols.length}</span>` : "") + (pk ? '<span class="dbt-pk">PK</span>' : "");
    b.onclick = () => selectTable(t);
    b.oncontextmenu = (e) => {
      e.preventDefault();
      tableContextMenu(t, e.clientX, e.clientY);
    };
    host.appendChild(b);
  });
}
function renderToolbar() {
  const bar = $("#dbToolbar");
  if (!bar) return;
  bar.innerHTML = "";
  const left = el("div", "db-toolbar-left");
  const center = el("div", "db-toolbar-center");
  const right = el("div", "db-toolbar-right");
  if (dbstate.driver === "mysql") {
    const run = el("button", "t-btn primary", "\u25B6 \u8FD0\u884C");
    run.onclick = runRead;
    left.appendChild(run);
    if (dbstate.my.database) {
      const sel = el("span", "db-schema-sel", "\u{1F5C4} " + esc(dbstate.my.database) + " \u25BE");
      sel.title = "\u70B9\u51FB\u5207\u6362\u6570\u636E\u5E93";
      sel.style.cursor = "pointer";
      sel.onclick = () => {
        dbstate.my.database = "";
        dbstate.curTable = null;
        dbstate.result = null;
        renderWorkspace();
      };
      left.appendChild(sel);
    }
  } else {
    const run = el("button", "t-btn primary", "\u25B6 \u67E5\u8BE2");
    run.onclick = runRead;
    left.appendChild(run);
  }
  const add = el("button", "t-btn", "\uFF0B \u65B0\u589E");
  add.onclick = () => {
    if (!dbstate.curTable) {
      setStatus("\u8BF7\u5148\u9009\u62E9\u4E00\u5F20\u8868", "warn");
      return;
    }
    openCrud("insert");
  };
  const edt = el("button", "t-btn", "\u270E \u6539");
  edt.onclick = () => {
    if (!dbstate.curTable) {
      setStatus("\u8BF7\u5148\u9009\u62E9\u4E00\u5F20\u8868", "warn");
      return;
    }
    openCrud("update");
  };
  const del = el("button", "t-btn danger", "\u{1F5D1} \u5220");
  del.onclick = () => {
    if (!dbstate.curTable) {
      setStatus("\u8BF7\u5148\u9009\u62E9\u4E00\u5F20\u8868", "warn");
      return;
    }
    openCrud("delete");
  };
  right.append(add, edt, del);
  bar.append(left, center, right);
}
function renderEditor() {
  const wrap = $("#dbEditor");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (dbstate.driver === "mysql") {
    let hlSQL3 = function(sql) {
      let out = "", i = 0;
      const push = (cls, txt) => {
        out += cls ? '<span class="' + cls + '">' + esc(txt) + "</span>" : esc(txt);
      };
      while (i < sql.length) {
        const c = sql[i];
        if (c === "'") {
          let j = i + 1, s = "'";
          while (j < sql.length) {
            s += sql[j];
            if (sql[j] === "'") {
              if (sql[j + 1] === "'") {
                s += "'";
                j += 2;
                continue;
              }
              j++;
              break;
            }
            j++;
          }
          push("tok-str", s);
          i = j;
          continue;
        }
        if (c === "`") {
          let j = i + 1, s = "`";
          while (j < sql.length && sql[j] !== "`") {
            s += sql[j];
            j++;
          }
          if (j < sql.length) {
            s += "`";
            j++;
          }
          push("tok-id", s);
          i = j;
          continue;
        }
        if (/[0-9]/.test(c) && !/[A-Za-z_]/.test(sql[i - 1] || "")) {
          let j = i, s = "";
          while (j < sql.length && /[0-9.]/.test(sql[j])) {
            s += sql[j];
            j++;
          }
          push("tok-num", s);
          i = j;
          continue;
        }
        if (/[A-Za-z_]/.test(c)) {
          let j = i, s = "";
          while (j < sql.length && /[A-Za-z_0-9]/.test(sql[j])) {
            s += sql[j];
            j++;
          }
          push(SQL_KW_SET2.has(s.toUpperCase()) ? "tok-key" : "", s);
          i = j;
          continue;
        }
        if (c === "-" && sql[i + 1] === "-") {
          let j = i;
          while (j < sql.length && sql[j] !== "\n") {
            j++;
          }
          push("", sql.substring(i, j));
          i = j;
          continue;
        }
        if (c === "/" && sql[i + 1] === "*") {
          let j = i + 2;
          while (j < sql.length && !(sql[j] === "*" && sql[j + 1] === "/")) {
            j++;
          }
          j += 2;
          push("", sql.substring(i, j));
          i = j;
          continue;
        }
        push("", c);
        i++;
      }
      return out;
    };
    var hlSQL2 = hlSQL3;
    const gutter = el("pre", "db-gutter");
    const overlay = el("pre", "db-overlay");
    const ta = el("textarea", "");
    ta.id = "dbSql";
    ta.spellcheck = false;
    ta.placeholder = "SELECT \u2026 \uFF08\u53C2\u6570\u7528 %s\uFF1BCtrl+Enter \u6267\u884C\uFF09";
    ta.value = dbstate.sqlText != null ? dbstate.sqlText : dbstate.curTable ? "SELECT * FROM `" + dbstate.curTable + "` LIMIT 20" : "";
    dbstate.sqlText = null;
    const updateGutter = () => {
      const lines = ta.value.split("\n").length;
      const cur = ta.value.substring(0, ta.selectionStart).split("\n").length;
      let html = "";
      for (let i = 1; i <= lines; i++) {
        html += (i === cur ? "<b>" : "") + i + (i === cur ? "" : "") + "\n";
      }
      gutter.innerHTML = html;
    };
    const SQL_KW_SET2 = new Set("SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER LIMIT OFFSET HAVING AS IN IS NULL LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX ASC DESC UNION ALL EXISTS CASE WHEN THEN ELSE END TRUE FALSE".split(" "));
    const updateHighlight = () => {
      overlay.innerHTML = hlSQL3(ta.value) + "\n";
    };
    const autoResize = () => {
      ta.style.height = "auto";
      const contentH = ta.scrollHeight;
      ta.style.height = "";
      const desiredH = Math.max(200, contentH + 4);
      const curH = wrap.offsetHeight || 0;
      if (!wrap.style.height || desiredH > curH) {
        wrap.style.height = Math.min(availH() * 0.6, desiredH) + "px";
      }
    };
    const update = () => {
      updateGutter();
      updateHighlight();
      autoResize();
    };
    ta.addEventListener("input", update);
    ta.addEventListener("scroll", () => {
      gutter.scrollTop = ta.scrollTop;
      overlay.scrollTop = ta.scrollTop;
    });
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "r")) {
        e.preventDefault();
        runRead();
        closeAutocomplete();
        return;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + "  " + ta.value.substring(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        update();
        closeAutocomplete();
        return;
      }
      const pairs = { "(": ")", "{": "}", "[": "]" };
      if (pairs[e.key] && ta.selectionStart === ta.selectionEnd) {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.substring(0, s) + e.key + pairs[e.key] + ta.value.substring(s);
        ta.selectionStart = ta.selectionEnd = s + 1;
        update();
        closeAutocomplete();
        return;
      }
      if (_acOpen && e.key === "ArrowDown") {
        e.preventDefault();
        _acSelected = Math.min(_acSelected + 1, _acList.length - 1);
        updateAcSelection();
        return;
      }
      if (_acOpen && e.key === "ArrowUp") {
        e.preventDefault();
        _acSelected = Math.max(_acSelected - 1, 0);
        updateAcSelection();
        return;
      }
      if (_acOpen && e.key === "Enter") {
        e.preventDefault();
        acceptAc(_acSelected);
        return;
      }
      if (e.key === "Escape") {
        closeAutocomplete();
        return;
      }
      if (_acOpen && !["Backspace", "Delete"].includes(e.key) && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      } else if (_acOpen && ["Backspace", "Delete"].includes(e.key)) {
      } else {
        closeAutocomplete();
      }
    });
    ta.addEventListener("keyup", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Shift", "Control", "Meta", "Alt", "Tab", "Escape", "Enter"].includes(e.key)) return;
      renderAutocomplete();
    });
    requestAnimationFrame(() => {
      ta.style.height = "auto";
      const contentH = ta.scrollHeight;
      ta.style.height = "";
      const desiredH = Math.max(200, contentH + 4);
      wrap.style.height = Math.min(window.innerHeight * 0.6, desiredH) + "px";
      updateGutter();
      updateHighlight();
    });
    const editorInner = el("div", "db-editor-inner");
    editorInner.appendChild(gutter);
    const editorText = el("div", "db-editor-text");
    editorText.appendChild(overlay);
    editorText.appendChild(ta);
    editorInner.appendChild(editorText);
    wrap.appendChild(editorInner);
  } else {
    const row = el("div", "db-sb-row");
    const flt = el("input", "t-in");
    flt.id = "sbFilter";
    flt.spellcheck = false;
    flt.placeholder = "PostgREST \u8FC7\u6EE4\uFF0C\u5982 id=eq.1\uFF08\u53EF\u7A7A\uFF09";
    flt.style.flex = "1";
    const lim = el("input", "t-in");
    lim.id = "sbLimit";
    lim.style.width = "80px";
    lim.value = "20";
    lim.title = "limit";
    row.append(flt, lim);
    wrap.appendChild(row);
  }
}
var _acOpen = false;
var _acSelected = -1;
var _acList = [];
var _acEl = null;
var _acDocClick = null;
var _acDocKey = null;
function closeAutocomplete() {
  if (_acEl) {
    _acEl.remove();
    _acEl = null;
  }
  if (_acDocClick) {
    document.removeEventListener("click", _acDocClick);
    _acDocClick = null;
  }
  if (_acDocKey) {
    document.removeEventListener("keydown", _acDocKey);
    _acDocKey = null;
  }
  _acOpen = false;
  _acList = [];
  _acSelected = -1;
}
function renderAutocomplete() {
  if (!connected() || dbstate.driver !== "mysql") return;
  const ta = $("#dbSql");
  if (!ta) return;
  const pos = ta.selectionStart;
  const text = ta.value;
  let tokenStart = pos - 1;
  while (tokenStart >= 0 && /[\w`.]/.test(text[tokenStart])) tokenStart--;
  tokenStart++;
  const token = text.substring(tokenStart, pos);
  if (!token || /^\s*$/.test(token)) {
    closeAutocomplete();
    return;
  }
  const charAfter = text[pos] || "";
  if (/[\s\n]/.test(charAfter) && SQL_KW_LIST.some((k) => k === token.toUpperCase())) {
    closeAutocomplete();
    return;
  }
  const textBefore = text.substring(0, tokenStart);
  let ctxWord = "";
  const ctxMatch = textBefore.match(/(\w+)\s*$/);
  if (ctxMatch) ctxWord = ctxMatch[1].toUpperCase();
  const wantTables = /^(FROM|JOIN|INNER|LEFT|RIGHT|OUTER|CROSS|FULL|INTO)$/i.test(ctxWord);
  const wantColumns = /^(SELECT|WHERE|AND|OR|NOT|ON|SET|ORDER|GROUP|BY|HAVING|LIKE|BETWEEN|IN|AS|DISTINCT)$/i.test(ctxWord) || /\.$/.test(token);
  let tablePart = "", columnPrefix = "";
  if (token.includes(".")) {
    const dotIdx = token.lastIndexOf(".");
    tablePart = token.substring(0, dotIdx).replace(/^`|`$/g, "");
    columnPrefix = token.substring(dotIdx + 1).replace(/^`|`$/g, "");
  }
  const tokenLower = token.toLowerCase().replace(/^`|`$/g, "");
  const matchPrefix = tablePart ? columnPrefix : tokenLower;
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  if (tablePart) {
    const tableCols = dbstate.my.columns[tablePart] || [];
    tableCols.forEach((c) => {
      if (c.name.toLowerCase().startsWith(matchPrefix.toLowerCase())) {
        seen.add(c.name.toUpperCase());
        candidates.push({ label: c.name, type: "column", detail: c.type + (c.pk ? " PK" : "") });
      }
    });
    if (!candidates.length) {
      (dbstate.my.tables || []).forEach((t) => {
        if (t.toLowerCase().startsWith(tokenLower)) {
          seen.add(t.toUpperCase());
          candidates.push({ label: "`" + t + "`", type: "table" });
        }
      });
    }
  } else {
    if (wantColumns && dbstate.curTable) {
      (dbstate.my.columns[dbstate.curTable] || []).forEach((c) => {
        if (c.name.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(c.name.toUpperCase())) {
          seen.add(c.name.toUpperCase());
          candidates.push({ label: c.name, type: "column", detail: c.type + (c.pk ? " PK" : "") });
        }
      });
    }
    if (wantTables) {
      (dbstate.my.tables || []).forEach((t) => {
        if (t.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(t.toUpperCase())) {
          seen.add(t.toUpperCase());
          candidates.push({ label: "`" + t + "`", type: "table" });
        }
      });
    }
    if (!tablePart) {
      SQL_KW_LIST.forEach((kw) => {
        if (kw.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(kw.toUpperCase())) {
          seen.add(kw.toUpperCase());
          candidates.push({ label: kw, type: "keyword" });
        }
      });
    }
    if (!wantTables) {
      (dbstate.my.tables || []).forEach((t) => {
        if (t.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(t.toUpperCase())) {
          seen.add(t.toUpperCase());
          candidates.push({ label: "`" + t + "`", type: "table" });
        }
      });
    }
    if (!wantColumns && dbstate.curTable) {
      (dbstate.my.columns[dbstate.curTable] || []).forEach((c) => {
        if (c.name.toLowerCase().startsWith(matchPrefix.toLowerCase()) && !seen.has(c.name.toUpperCase())) {
          seen.add(c.name.toUpperCase());
          candidates.push({ label: c.name, type: "column", detail: c.type + (c.pk ? " PK" : "") });
        }
      });
    }
    if (token.startsWith("`") && !tablePart) {
      const afterBt = token.slice(1).replace(/`$/, "");
      (dbstate.my.tables || []).forEach((t) => {
        (dbstate.my.columns[t] || []).forEach((c) => {
          if (c.name.toLowerCase().startsWith(afterBt.toLowerCase()) && !seen.has(c.name.toUpperCase())) {
            seen.add(c.name.toUpperCase());
            candidates.push({ label: c.name, type: "column", detail: c.type + " (" + t + ")" });
          }
        });
      });
    }
  }
  if (!candidates.length) {
    closeAutocomplete();
    return;
  }
  closeAutocomplete();
  _acList = candidates;
  _acSelected = 0;
  _acOpen = true;
  const ac = document.createElement("div");
  ac.className = "db-ac";
  ac.innerHTML = candidates.slice(0, 20).map((c, i) => {
    const badge = c.type === "keyword" ? "KW" : c.type === "table" ? "TB" : "CL";
    return `<button class="db-ac-item${i === 0 ? " on" : ""}" data-idx="${i}"><span class="db-ac-badge db-ac-${c.type}">${badge}</span>${esc(c.label)}${c.detail ? " <small>" + esc(c.detail) + "</small>" : ""}</button>`;
  }).join("");
  document.body.appendChild(ac);
  _acEl = ac;
  const rect = ta.getBoundingClientRect();
  const cursorText = text.substring(0, pos);
  const lineNum = (cursorText.match(/\n/g) || []).length;
  const lastNL = cursorText.lastIndexOf("\n");
  const lineText = cursorText.substring(lastNL + 1);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = getComputedStyle(ta).font;
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  const cursorX = 42 + 12 + ctx.measureText(lineText).width;
  const cursorY = 8 + lineNum * lh - ta.scrollTop;
  let left = rect.left + cursorX;
  let top = rect.top + cursorY + lh;
  requestAnimationFrame(() => {
    const mw = ac.offsetWidth, mh = ac.offsetHeight;
    const vw = availW(), vh = availH();
    if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8);
    if (top + mh > vh - 8) top = Math.max(8, rect.top + cursorY - mh);
    ac.style.left = left + "px";
    ac.style.top = Math.max(0, top) + "px";
  });
  ac.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const btn = e.target.closest(".db-ac-item");
    if (btn) {
      _acSelected = +btn.dataset.idx;
      acceptAc(_acSelected);
    }
  });
  _acDocClick = (e) => {
    if (_acEl && !_acEl.contains(e.target) && e.target !== ta) closeAutocomplete();
  };
  document.addEventListener("click", _acDocClick);
}
function updateAcSelection() {
  if (!_acEl) return;
  const items = _acEl.querySelectorAll(".db-ac-item");
  items.forEach((el2, i) => el2.classList.toggle("on", i === _acSelected));
  if (_acSelected >= 0 && items[_acSelected]) items[_acSelected].scrollIntoView({ block: "nearest" });
}
function acceptAc(idx) {
  if (idx < 0 || idx >= _acList.length) return;
  const ta = $("#dbSql");
  if (!ta) return;
  const item = _acList[idx];
  const pos = ta.selectionStart;
  let start = pos - 1;
  while (start >= 0 && /[\w`.]/.test(ta.value[start])) start--;
  start++;
  let end = pos;
  while (end < ta.value.length && /[\w`.]/.test(ta.value[end])) end++;
  const fullToken = ta.value.substring(start, end);
  if (item.type === "column" && fullToken.includes(".")) {
    const dotIdx = fullToken.lastIndexOf(".");
    const tablePrefix = fullToken.substring(0, dotIdx + 1);
    ta.value = ta.value.substring(0, start) + tablePrefix + item.label + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + tablePrefix.length + item.label.length;
  } else {
    ta.value = ta.value.substring(0, start) + item.label + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + item.label.length;
  }
  closeAutocomplete();
  ta.dispatchEvent(new Event("input"));
  ta.focus();
}
function initSplitter() {
  const splitter = $("#dbSplitter");
  if (!splitter) return;
  const editor = $("#dbEditor");
  if (!editor) return;
  splitter.onmousedown = function(e) {
    e.preventDefault();
    splitter.classList.add("active");
    document.body.style.userSelect = "none";
    const startY = e.clientY;
    const startH = editor.offsetHeight;
    document.onmousemove = function(e2) {
      const dy = e2.clientY - startY;
      const newH = Math.max(60, Math.min(availH() * 0.6, startH + dy));
      editor.style.height = newH + "px";
    };
    document.onmouseup = function() {
      document.onmousemove = null;
      document.onmouseup = null;
      splitter.classList.remove("active");
      document.body.style.userSelect = "";
    };
  };
}
function exportCSV(rows) {
  if (!rows || !rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.map((k) => '"' + k.replace(/"/g, '""') + '"').join(",");
  const body = rows.map((r) => keys.map((k) => {
    const v = r[k];
    if (v == null) return "";
    const s = String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  }).join(",")).join("\n");
  return header + "\n" + body;
}
var _activeCtx = null;
function closeCtxMenu() {
  if (_activeCtx) {
    _activeCtx.remove();
    _activeCtx = null;
  }
  document.removeEventListener("click", closeCtxMenu);
  document.removeEventListener("keydown", ctxEsc);
}
function ctxEsc(e) {
  if (e.key === "Escape") closeCtxMenu();
}
function tableContextMenu(table, x, y) {
  closeCtxMenu();
  const menu = el("div", "db-ctx");
  _activeCtx = menu;
  requestAnimationFrame(() => {
    document.addEventListener("click", closeCtxMenu);
    document.addEventListener("keydown", ctxEsc);
  });
  function item(label, action) {
    const b = el("button", "db-ctx-item", label);
    b.onclick = (e) => {
      e.stopPropagation();
      closeCtxMenu();
      action();
    };
    menu.appendChild(b);
  }
  function sep() {
    menu.appendChild(el("div", "db-ctx-sep"));
  }
  item("\u25B6 SELECT * \u67E5\u8BE2", () => {
    selectTable(table);
  });
  item("\u2317 \u67E5\u770B\u7ED3\u6784", () => showTableStruct(table));
  if (dbstate.driver === "mysql") {
    item("\u2B21 \u5EFA\u8868\u8BED\u53E5", () => showCreateTable(table));
  }
  sep();
  item("\u{1F4CB} \u590D\u5236\u8868\u540D", () => copy(table, "\u5DF2\u590D\u5236\u8868\u540D"));
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight, vw = innerWidth, vh = innerHeight, pad = 6;
  const left = x + mw + pad > vw ? Math.max(pad, x - mw - pad) : x + pad;
  const top = y + mh + pad > vh ? Math.max(pad, y - mh - pad) : y + pad;
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  menu.addEventListener("click", (e) => e.stopPropagation());
}
async function showTableStruct(table) {
  if (dbstate.driver === "mysql") {
    renderLoading();
    const r = await dbReq("query", { token: dbstate.my.token, sql: "SHOW FULL COLUMNS FROM `" + table + "`", maxRows: 200 });
    if (!r.ok) {
      renderResult({ error: r.error, hint: r.hint });
      setStatus("\u67E5\u770B\u8868\u7ED3\u6784\u5931\u8D25\uFF1A" + r.error, "err");
      return;
    }
    const rows = (r.rows || []).map((r2) => ({
      \u5217\u540D: r2.Field,
      \u7C7B\u578B: r2.Type,
      \u6392\u5E8F\u89C4\u5219: r2.Collation || "",
      \u53EF\u7A7A: r2.Null === "YES" ? "\u2713" : "",
      \u952E: r2.Key || "\u2014",
      \u9ED8\u8BA4\u503C: r2.Default != null ? String(r2.Default) : "NULL",
      Extra: r2.Extra || "",
      \u6CE8\u91CA: r2.Comment || ""
    }));
    renderResult({ rows, note: "SHOW FULL COLUMNS FROM `" + table + "` \xB7 " + rows.length + " \u5217 \xB7 " + r.elapsedMs + " ms" });
    setStatus("\u8868\u7ED3\u6784 \xB7 " + table + " \xB7 " + rows.length + " \u5217", "ok");
  } else {
    const cols = curCols(table);
    if (!cols.length) {
      setStatus("\u65E0\u8BE5\u8868\u7684\u5217\u4FE1\u606F\uFF0C\u8BF7\u5148\u5237\u65B0", "warn");
      return;
    }
    const rows = cols.map((c) => ({ \u5217\u540D: c.name, \u7C7B\u578B: c.type || "\u2014", \u4E3B\u952E: c.pk ? "\u2713" : "" }));
    renderResult({ rows, note: table + " \xB7 " + rows.length + " \u5217\uFF08\u6765\u81EA OpenAPI schema\uFF09" });
    setStatus("\u8868\u7ED3\u6784 \xB7 " + table + " \xB7 " + rows.length + " \u5217", "ok");
  }
}
async function showCreateTable(table) {
  renderLoading();
  const r = await dbReq("query", { token: dbstate.my.token, sql: "SHOW CREATE TABLE `" + table + "`", maxRows: 1 });
  if (!r.ok) {
    renderResult({ error: r.error, hint: r.hint });
    setStatus("\u67E5\u770B\u5EFA\u8868\u8BED\u53E5\u5931\u8D25\uFF1A" + r.error, "err");
    return;
  }
  const row = (r.rows || [])[0];
  if (!row) {
    renderResult({ error: "\u65E0\u7ED3\u679C" });
    return;
  }
  const ddl = Object.values(row).find((_, i) => i === 1) || "";
  const note = "SHOW CREATE TABLE `" + table + "` \xB7 " + r.elapsedMs + " ms";
  renderResult({ rows: [{ "\u5EFA\u8868\u8BED\u53E5": ddl }], note });
  setStatus("\u5EFA\u8868\u8BED\u53E5 \xB7 " + table, "ok");
}
function selectTable(t) {
  const prevTable = dbstate.curTable;
  dbstate.curTable = t;
  save();
  renderTables();
  renderToolbar();
  const ta = $("#dbSql");
  if (ta) {
    const prevTpl = prevTable ? "SELECT * FROM `" + prevTable + "` LIMIT 20" : "";
    if (!ta.value.trim() || ta.value === prevTpl) {
      ta.value = "SELECT * FROM `" + t + "` LIMIT 20";
      ta.dispatchEvent(new Event("input"));
      runRead();
    }
  }
}
function switchSideTab(tab) {
  dbstate.sideTab = tab;
  const tEl = $("#tabTables"), hEl = $("#tabHistory");
  const tables = $("#dbTables"), hist = $("#dbHistory");
  const search = $("#dbTableSearch");
  if (tEl) tEl.classList.toggle("on", tab === "tables");
  if (hEl) hEl.classList.toggle("on", tab === "history");
  if (tables) tables.style.display = tab === "tables" ? "" : "none";
  if (hist) hist.style.display = tab === "history" ? "" : "none";
  if (search) {
    search.placeholder = tab === "history" ? "\u641C\u7D22\u5386\u53F2 SQL\u2026" : "\u641C\u7D22\u8868\u540D\u2026";
    search.value = "";
    search.oninput = tab === "history" ? filterHistory : filterTables;
  }
  if (tab === "history") renderHistory();
}
function renderHistory() {
  const host = $("#dbHistory");
  if (!host) return;
  const hist = loadHistory();
  const q = ($("#dbTableSearch") ? $("#dbTableSearch").value : "").trim().toLowerCase();
  const filtered = q ? hist.filter((h) => h.sql.toLowerCase().includes(q)) : hist;
  if (!filtered.length) {
    host.innerHTML = '<div class="hist-empty">' + (q ? "\u6CA1\u6709\u5339\u914D\u7684\u5386\u53F2" : "\u6682\u65E0\u6267\u884C\u8BB0\u5F55") + "</div>";
    return;
  }
  host.innerHTML = filtered.map((h, i) => `
    <div class="dbt dbt-hist" data-idx="${i}">
      <span class="dbt-sql">${esc(h.sql.replace(/\n/g, " "))}</span>
      <span class="dbt-meta">${relTime2(h.ts)} \xB7 ${h.ms}ms${h.affected != null ? " \xB7 " + h.affected + "\u884C" : " \xB7 " + h.rows + "\u884C"}</span>
      <span class="dbt-acts">
        <span class="dbt-hist-act" data-act="copy" title="\u590D\u5236 SQL">\u{1F4CB}</span>
        <span class="dbt-hist-act" data-act="use" title="\u5207\u5165\u7F16\u8F91\u5668">\u2197</span>
        <span class="dbt-hist-act" data-act="del" title="\u5220\u9664">\u2715</span>
      </span>
    </div>`).join("");
  host.querySelectorAll(".dbt-hist").forEach((el2) => {
    const idx = +el2.dataset.idx;
    const h = filtered[idx];
    if (!h) return;
    el2.onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === "copy") {
        copy(h.sql, "SQL");
        return;
      }
      if (act === "del") {
        const all = loadHistory();
        const origIdx = all.findIndex((x) => x.ts === h.ts && x.sql === h.sql);
        if (origIdx >= 0) {
          all.splice(origIdx, 1);
          historyStore.set(all);
          renderHistory();
        }
        return;
      }
      useHistorySql(h.sql);
    };
  });
}
function filterHistory() {
  if (dbstate.sideTab !== "history") return;
  renderHistory();
}
function useHistorySql(sql) {
  const ta = $("#dbSql");
  if (!ta) return;
  ta.value = sql;
  const wrap = $("#dbEditor");
  if (wrap) {
    ta.style.height = "auto";
    const h = Math.min(availH() * 0.6, Math.max(200, ta.scrollHeight + 4));
    ta.style.height = "";
    wrap.style.height = h + "px";
  }
  ta.focus();
  setStatus("\u5DF2\u5207\u5165\u7F16\u8F91\u5668", "ok");
}
async function runRead() {
  if (dbstate.driver === "mysql") {
    const ta = $("#dbSql");
    let sql = ta && ta.value ? ta.value.trim() : "";
    if (ta && ta.selectionStart !== ta.selectionEnd) {
      sql = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
    }
    if (!sql) {
      setStatus("\u8BF7\u8F93\u5165 SQL", "warn");
      return;
    }
    renderLoading();
    const r = await dbReq("query", { token: dbstate.my.token, sql, maxRows: 20 });
    if (!r.ok) {
      renderResult({ error: r.error, hint: r.hint });
      if (r.code === "NO_SESSION") {
        dbstate.my.token = null;
        renderBody();
      }
      setStatus("\u67E5\u8BE2\u5931\u8D25\uFF1A" + r.error, "err");
      return;
    }
    if (r.columns && r.columns.length === 0 && r.affectedRows != null) {
      renderResult({ rows: [], note: "\u975E\u67E5\u8BE2\u8BED\u53E5 \xB7 \u5F71\u54CD " + r.affectedRows + " \u884C" });
      pushHistory(sql, 0, r.elapsedMs, r.affectedRows);
      setStatus("\u5DF2\u6267\u884C \xB7 \u5F71\u54CD " + r.affectedRows + " \u884C", "ok");
      return;
    }
    renderResult({ rows: r.rows || [], note: "\u5171 " + r.rowCount + " \u884C" + (r.truncated ? "\uFF08\u5DF2\u622A\u65AD\u81F3 " + r.maxRows + "\uFF09" : "") + " \xB7 " + r.elapsedMs + " ms" });
    pushHistory(sql, r.rowCount, r.elapsedMs);
    setStatus("\u67E5\u8BE2\u6210\u529F \xB7 " + r.rowCount + " \u884C \xB7 " + r.elapsedMs + " ms", "ok");
    if (dbstate.sideTab === "history") renderHistory();
  } else {
    const table = dbstate.curTable;
    if (!table) {
      setStatus("\u8BF7\u5148\u9009\u62E9\u4E00\u5F20\u8868", "warn");
      return;
    }
    const filter = ($("#sbFilter") && $("#sbFilter").value || "").trim();
    const limit = ($("#sbLimit") && $("#sbLimit").value || "20").trim();
    renderLoading();
    try {
      let q = "/rest/v1/" + encodeURIComponent(table) + "?select=*";
      if (filter) q += "&" + filter;
      q += "&limit=" + (limit || 200);
      const res = await sbFetch(q);
      const rows = await res.json();
      if (!res.ok) {
        renderResult({ error: rows && (rows.message || rows.hint) || "HTTP " + res.status });
        setStatus("\u67E5\u8BE2\u5931\u8D25", "err");
        return;
      }
      renderResult({ rows: Array.isArray(rows) ? rows : [rows], note: "\u5171 " + (Array.isArray(rows) ? rows.length : 1) + " \u884C" });
      setStatus("\u67E5\u8BE2\u6210\u529F \xB7 " + (Array.isArray(rows) ? rows.length : 1) + " \u884C", "ok");
    } catch (e) {
      renderResult({ error: e.message, hint: "CORS\uFF1F\u53EF\u5728\u8FDE\u63A5\u65F6\u52FE\u9009\u300C\u7ECF\u672C\u5730\u4EE3\u7406\u300D" });
      setStatus("\u67E5\u8BE2\u5931\u8D25\uFF1A" + e.message, "err");
    }
  }
}
function renderLoading() {
  const h = $("#dbResult");
  if (h) h.innerHTML = '<div class="res-loading"><span class="spin"></span> \u6267\u884C\u4E2D\u2026</div>';
}
function renderResult(res) {
  const host = $("#dbResult");
  if (!host) return;
  dbstate.result = res;
  host.innerHTML = "";
  if (!res) {
    host.innerHTML = '<div class="res-idle"><div class="big">\u65E0\u7ED3\u679C</div></div>';
    return;
  }
  if (res.error) {
    host.innerHTML = '<div class="res-err"><div class="ti">\u26A0 \u6267\u884C\u5931\u8D25</div><div>' + esc(res.error) + "</div>" + (res.hint ? '<div class="hintbox">' + esc(res.hint) + "</div>" : "") + "</div>";
    return;
  }
  if (res.note || res.rows) {
    const bar = el("div", "db-result-bar");
    const note = el("span", "note");
    note.innerHTML = res.note ? res.note.replace(/(\d+)\s*(行|ms)/g, "<strong>$1</strong> $2") : "";
    bar.appendChild(note);
    if (res.rows && res.rows.length) {
      const btnJson = el("button", "db-export-btn", "\u590D\u5236 JSON");
      btnJson.onclick = () => {
        copy(JSON.stringify(res.rows, null, 2), "JSON");
      };
      const btnCsv = el("button", "db-export-btn", "\u590D\u5236 CSV");
      btnCsv.onclick = () => {
        copy(exportCSV(res.rows), "CSV");
      };
      bar.append(btnJson, btnCsv);
    }
    host.appendChild(bar);
  }
  dbstate.view.tableSel = null;
  host.appendChild(viewTable(res.rows || [], dbstate.view));
}
async function openCrud(mode) {
  const table = dbstate.curTable, cols = curCols(table), pk = pkOf(table);
  if ((mode === "update" || mode === "delete") && !cols.some((c) => c.pk) && dbstate.driver === "mysql")
    setStatus("\u8BE5\u8868\u65E0\u4E3B\u952E\uFF0C\u6539/\u5220\u8BF7\u8C28\u614E\uFF08\u5C06\u7528\u9996\u5217 " + pk + " \u4F5C\u4E3A\u6761\u4EF6\uFF09", "warn");
  const bodyEl = el("div");
  let row = null;
  if (mode === "insert") {
    const form = el("div");
    cols.forEach((c) => {
      const rowEl = el("div", "db-kv");
      rowEl.innerHTML = `<label title="${esc(c.name)}">${esc(c.name)} <small>${esc(c.type || "")}${c.pk ? " \xB7 PK" : ""}</small></label>`;
      const inp = el("input", "t-in");
      inp.dataset.col = c.name;
      inp.placeholder = c.pk ? "(\u81EA\u589E\u53EF\u7559\u7A7A)" : "\u503C\uFF1BNULL/true/false/\u6570\u5B57\u4F1A\u81EA\u52A8\u8BC6\u522B";
      rowEl.appendChild(inp);
      form.appendChild(rowEl);
    });
    bodyEl.appendChild(form);
    bodyEl.appendChild(el("div", "t-note", "\u7559\u7A7A\u7684\u5217\uFF1A\u65B0\u589E\u65F6\u5FFD\u7565\u3002\u8F93\u5165 NULL \u7F6E\u7A7A\u3002"));
  }
  if (mode === "update" || mode === "delete") {
    const pkWrap = el("div", "db-kv");
    pkWrap.innerHTML = `<label>${esc(pk)} <small>\u4E3B\u952E</small></label>`;
    const pkInp = el("input", "t-in");
    pkInp.id = "dbPkInput";
    pkInp.placeholder = "\u8F93\u5165 " + pk + " \u7684\u503C";
    pkWrap.appendChild(pkInp);
    bodyEl.appendChild(pkWrap);
  }
  const prevArea = el("div", "db-prev", "");
  prevArea.id = "dbPrev";
  bodyEl.appendChild(prevArea);
  dbModal({ insert: "\u65B0\u589E\u884C", update: "\u4FEE\u6539\u884C", delete: "\u5220\u9664\u884C" }[mode] + " \xB7 " + table, bodyEl, mode === "delete" ? "\u5220\u9664" : "\u9884\u89C8", async (modal, setOk) => {
    const pkInput = $("#dbPkInput", modal);
    if ((mode === "update" || mode === "delete") && !row) {
      const pkv = pkInput ? (pkInput.value || "").trim() : null;
      if (!pkv) {
        setStatus("\u8BF7\u8F93\u5165\u4E3B\u952E " + pk + " \u7684\u503C", "warn");
        return false;
      }
      row = await fetchRow(table, pk, pkv);
      if (!row) {
        setStatus("\u672A\u627E\u5230 " + pk + "=" + pkv + " \u7684\u8BB0\u5F55", "err");
        return false;
      }
      row.__pkval = pkv;
      if (mode === "update") {
        const form = el("div");
        cols.forEach((c) => {
          const rowEl = el("div", "db-kv");
          rowEl.innerHTML = `<label title="${esc(c.name)}">${esc(c.name)} <small>${esc(c.type || "")}${c.pk ? " \xB7 PK" : ""}</small></label>`;
          const inp = el("input", "t-in");
          inp.dataset.col = c.name;
          inp.value = fmtCell(row[c.name]);
          inp.placeholder = c.pk ? "(\u81EA\u589E\u53EF\u7559\u7A7A)" : "\u503C\uFF1BNULL/true/false/\u6570\u5B57\u4F1A\u81EA\u52A8\u8BC6\u522B";
          rowEl.appendChild(inp);
          form.appendChild(rowEl);
        });
        bodyEl.insertBefore(form, prevArea);
        bodyEl.insertBefore(el("div", "t-note", "\u7559\u7A7A\u7684\u5217\uFF1A\u65B0\u589E\u65F6\u5FFD\u7565\uFF1B\u4FEE\u6539\u65F6\u8BBE\u4E3A\u7A7A\u4E32\u3002\u8F93\u5165 NULL \u7F6E\u7A7A\u3002"), prevArea);
      }
      const built2 = buildWrite(mode, table, cols, pk, bodyEl, row);
      if (built2.error) {
        setStatus(built2.error, "err");
        return false;
      }
      prevArea.textContent = built2.preview;
      if (mode === "delete") {
        setOk("\u786E\u8BA4\u5220\u9664");
        setStatus("\u8BF7\u6838\u5BF9\u9884\u89C8\u540E\u518D\u6B21\u70B9\u51FB\u6267\u884C", "warn");
        return false;
      }
    }
    const built = buildWrite(mode, table, cols, pk, bodyEl, row);
    if (built.error) {
      setStatus(built.error, "err");
      return false;
    }
    const prev = $("#dbPrev", modal);
    prev.textContent = built.preview;
    if (modal._confirmed !== built.preview) {
      modal._confirmed = built.preview;
      setOk(mode === "delete" ? "\u786E\u8BA4\u5220\u9664" : "\u786E\u8BA4\u6267\u884C");
      setStatus("\u8BF7\u6838\u5BF9\u9884\u89C8\u540E\u518D\u6B21\u70B9\u51FB\u6267\u884C", "warn");
      return false;
    }
    const r = await execWrite(mode, table, pk, built);
    if (!r.ok) {
      setStatus((mode === "delete" ? "\u5220\u9664" : mode === "insert" ? "\u65B0\u589E" : "\u4FEE\u6539") + "\u5931\u8D25\uFF1A" + r.error, "err");
      return false;
    }
    setStatus("\u2713 " + (mode === "delete" ? "\u5DF2\u5220\u9664" : mode === "insert" ? "\u5DF2\u65B0\u589E" : "\u5DF2\u4FEE\u6539") + (r.affectedRows != null ? " \xB7 \u5F71\u54CD " + r.affectedRows + " \u884C" : ""), "ok");
    runRead();
    return true;
  });
  if (mode === "delete") {
    const built = buildWrite("delete", table, cols, pk, bodyEl, row);
    $("#dbPrev").textContent = built.preview;
  }
}
async function fetchRow(table, pk, pkv) {
  if (dbstate.driver === "mysql") {
    const r = await dbReq("query", { token: dbstate.my.token, sql: "SELECT * FROM `" + table + "` WHERE `" + pk + "`=%s LIMIT 1", params: [coerce(pkv)] });
    return r.ok && r.rows && r.rows[0] || null;
  }
  try {
    const res = await sbFetch("/rest/v1/" + encodeURIComponent(table) + "?select=*&" + encodeURIComponent(pk) + "=eq." + encodeURIComponent(pkv) + "&limit=1");
    const j = await res.json();
    return Array.isArray(j) && j[0] || null;
  } catch (e) {
    return null;
  }
}
function fmtCell(v) {
  return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}
function collectForm(bodyEl, mode) {
  const out = {};
  $$("input[data-col]", bodyEl).forEach((inp) => {
    const c = inp.dataset.col, raw = inp.value;
    if (mode === "insert" && raw === "") return;
    out[c] = coerce(raw);
  });
  return out;
}
function buildWrite(mode, table, cols, pk, bodyEl, row) {
  const my = dbstate.driver === "mysql";
  if (mode === "delete") {
    const pkv2 = coerce(row.__pkval);
    if (my) return { sql: "DELETE FROM `" + table + "` WHERE `" + pk + "`=%s", params: [pkv2], preview: "DELETE FROM `" + table + "` WHERE `" + pk + "` = " + JSON.stringify(pkv2) };
    return { method: "DELETE", path: "/rest/v1/" + encodeURIComponent(table) + "?" + encodeURIComponent(pk) + "=eq." + encodeURIComponent(row.__pkval), preview: "DELETE " + table + " WHERE " + pk + " = " + JSON.stringify(row.__pkval) };
  }
  const data = collectForm(bodyEl, mode);
  const keys = Object.keys(data);
  if (!keys.length) return { error: "\u6CA1\u6709\u8981\u5199\u5165\u7684\u5217" };
  if (mode === "insert") {
    if (my) {
      const ph = keys.map(() => "%s");
      return { sql: "INSERT INTO `" + table + "` (" + keys.map((k) => "`" + k + "`").join(",") + ") VALUES (" + ph.join(",") + ")", params: keys.map((k) => data[k]), preview: "INSERT INTO `" + table + "` (" + keys.join(", ") + ")\nVALUES (" + keys.map((k) => JSON.stringify(data[k])).join(", ") + ")" };
    }
    return { method: "POST", path: "/rest/v1/" + encodeURIComponent(table), body: data, preview: "POST /rest/v1/" + table + "\n" + JSON.stringify(data, null, 2) };
  }
  const pkv = coerce(row.__pkval);
  const setKeys = keys.filter((k) => k !== pk);
  if (!setKeys.length) return { error: "\u6CA1\u6709\u53EF\u4FEE\u6539\u7684\u5217\uFF08\u9664\u4E3B\u952E\u5916\uFF09" };
  if (my) {
    return { sql: "UPDATE `" + table + "` SET " + setKeys.map((k) => "`" + k + "`=%s").join(", ") + " WHERE `" + pk + "`=%s", params: setKeys.map((k) => data[k]).concat([pkv]), preview: "UPDATE `" + table + "` SET\n  " + setKeys.map((k) => "`" + k + "` = " + JSON.stringify(data[k])).join(",\n  ") + "\nWHERE `" + pk + "` = " + JSON.stringify(pkv) };
  }
  const bodyObj = {};
  setKeys.forEach((k) => bodyObj[k] = data[k]);
  return { method: "PATCH", path: "/rest/v1/" + encodeURIComponent(table) + "?" + encodeURIComponent(pk) + "=eq." + encodeURIComponent(row.__pkval), body: bodyObj, preview: "PATCH /rest/v1/" + table + "?" + pk + "=eq." + row.__pkval + "\n" + JSON.stringify(bodyObj, null, 2) };
}
async function execWrite(mode, table, pk, built) {
  if (dbstate.driver === "mysql") {
    return dbReq("exec", { token: dbstate.my.token, sql: built.sql, params: built.params });
  }
  try {
    const res = await sbFetch(built.path, { method: built.method, headers: { "Content-Type": "application/json", "Prefer": "return=representation" }, body: built.body != null ? JSON.stringify(built.body) : void 0 });
    const txt = await res.text();
    let j;
    try {
      j = txt ? JSON.parse(txt) : null;
    } catch (e) {
      j = txt;
    }
    if (!res.ok) return { ok: false, error: j && (j.message || j.hint) || "HTTP " + res.status };
    return { ok: true, affectedRows: Array.isArray(j) ? j.length : void 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function dbModal(title, bodyEl, okLabel, onOk) {
  const bg = $("#modalBg");
  const m = el("div", "modal wide");
  m.innerHTML = `<h3>${esc(title)}</h3>`;
  const wrap = el("div", "field");
  wrap.appendChild(bodyEl);
  m.appendChild(wrap);
  const acts = el("div", "acts");
  const sp = el("div");
  sp.style.flex = "1";
  const cancel = el("button", "btn ghost", "\u53D6\u6D88");
  cancel.onclick = close;
  const ok = el("button", "btn primary", okLabel);
  ok.onclick = async () => {
    const keep = await onOk(m, (lbl) => ok.textContent = lbl);
    if (keep !== false) close();
  };
  acts.append(sp, cancel, ok);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  bg.onkeydown = (e) => {
    if (e.key === "Escape") close();
  };
  function close() {
    bg.classList.remove("open");
    bg.innerHTML = "";
    bg.onkeydown = null;
  }
}
function getDbState() {
  return dbstate;
}

// src/core/ai-store.js
var cfgStore = store("ai.configs");
var activeStore = store("ai.active");
var histStore = store("ai.history");
var COLORS2 = ["#4493f8", "#a371f7", "#3fb950", "#d29922", "#f85149", "#79c0ff", "#ff7a59", "#2dd4bf"];
function getConfigs() {
  return cfgStore.get() || [];
}
function saveConfigs(configs) {
  cfgStore.set(configs);
}
function getConfig(id) {
  return getConfigs().find((c) => c.id === id) || null;
}
function getActive() {
  const id = activeStore.get();
  if (!id) return getConfigs()[0] || null;
  return getConfig(id) || getConfigs()[0] || null;
}
function getActiveId() {
  const a = getActive();
  return a ? a.id : null;
}
function addConfig(partial = {}) {
  const configs = getConfigs();
  const cfg = {
    id: uid(),
    name: partial.name || "\u65B0\u914D\u7F6E",
    endpoint: partial.endpoint || "",
    // Base URL，如 https://api.deepseek.com/v1
    apiKey: partial.apiKey || "",
    model: partial.model || "",
    temperature: partial.temperature ?? 0.7,
    maxTokens: partial.maxTokens || 4096,
    systemPrompt: partial.systemPrompt || "",
    color: partial.color || COLORS2[configs.length % COLORS2.length],
    proxy: partial.proxy || false,
    createdAt: Date.now()
  };
  configs.push(cfg);
  saveConfigs(configs);
  if (configs.length === 1) switchConfig(cfg.id);
  return cfg;
}
function updateConfig(id, patch) {
  const configs = getConfigs();
  const idx = configs.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  Object.assign(configs[idx], patch);
  saveConfigs(configs);
  return configs[idx];
}
function removeConfig(id) {
  let configs = getConfigs();
  configs = configs.filter((c) => c.id !== id);
  saveConfigs(configs);
  if (activeStore.get() === id) {
    activeStore.set(configs.length ? configs[0].id : null);
  }
  return configs;
}
function switchConfig(id) {
  activeStore.set(id);
}
function chatUrl(baseEndpoint) {
  let base = (baseEndpoint || "").replace(/\/+$/, "");
  if (!base) return "";
  if (base.endsWith("/chat/completions")) return base;
  return base + "/chat/completions";
}
function maskKey(key) {
  if (!key || key.length <= 12) return key ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "";
  return key.slice(0, 4) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + key.slice(-4);
}

// src/core/ai-context.js
var MAX_CONTEXT_ROWS = 10;
function getUserSelection() {
  const sel = window.getSelection();
  return sel && sel.toString().trim() ? sel.toString().trim() : null;
}
function buildApiContext() {
  const tab = activeTab();
  if (!tab) return null;
  const parts = [];
  parts.push("\u5F53\u524D\u5DE5\u5177\uFF1AAPI \u8BF7\u6C42");
  parts.push("\u8BF7\u6C42\u65B9\u6CD5\uFF1A" + (tab.method || "GET"));
  if (tab.url) parts.push("\u8BF7\u6C42 URL\uFF1A" + tab.url);
  if (tab.bodyType !== "none" && tab.body) {
    const bodyStr = typeof tab.body === "string" ? tab.body : JSON.stringify(tab.body);
    parts.push("\u8BF7\u6C42\u4F53\uFF1A" + bodyStr.slice(0, 2e3));
  }
  if (tab.response) {
    if (tab.response.error) {
      parts.push("\u54CD\u5E94\u9519\u8BEF\uFF1A" + tab.response.error);
    } else {
      parts.push("\u54CD\u5E94\u72B6\u6001\uFF1A" + (tab.response.status || "\u672A\u77E5"));
      if (tab.response.text) {
        parts.push("\u54CD\u5E94\u4F53\uFF08\u524D 2000 \u5B57\u7B26\uFF09\uFF1A" + String(tab.response.text).slice(0, 2e3));
      }
    }
  }
  return parts.join("\n");
}
function buildDbContext() {
  const dbs = getDbState();
  if (!dbs) return null;
  const parts = [];
  parts.push("\u5F53\u524D\u5DE5\u5177\uFF1A\u6570\u636E\u5E93");
  if (dbs.driver === "mysql") {
    parts.push("\u9A71\u52A8\uFF1AMySQL");
    if (dbs.my.version) parts.push("\u7248\u672C\uFF1AMySQL " + dbs.my.version);
    if (dbs.my.database) parts.push("\u5F53\u524D\u6570\u636E\u5E93\uFF1A" + dbs.my.database);
    if (dbs.my.tables && dbs.my.tables.length) {
      parts.push("\u53EF\u7528\u8868\uFF08" + dbs.my.tables.length + " \u5F20\uFF09\uFF1A" + dbs.my.tables.slice(0, 30).join(", ") + (dbs.my.tables.length > 30 ? " \u2026" : ""));
    }
    if (dbs.curTable) {
      parts.push("\u5F53\u524D\u9009\u4E2D\u8868\uFF1A" + dbs.curTable);
      const cols = dbs.my.columns && dbs.my.columns[dbs.curTable] || [];
      if (cols.length) {
        const colSummary = cols.map((c) => c.name + " " + (c.type || "") + (c.pk ? " PK" : "")).join(", ");
        parts.push("\u8868\u7ED3\u6784\uFF1A" + colSummary);
      }
    }
    const sqlEl = $("#dbSql");
    if (sqlEl && sqlEl.value.trim()) {
      parts.push("\u7F16\u8F91\u5668 SQL\uFF1A" + sqlEl.value.trim().slice(0, 500));
    }
    if (dbs.result) {
      if (dbs.result.error) {
        parts.push("\u4E0A\u6B21\u6267\u884C\u9519\u8BEF\uFF1A" + dbs.result.error);
      } else if (dbs.result.rows && dbs.result.rows.length) {
        const preview = dbs.result.rows.slice(0, MAX_CONTEXT_ROWS);
        parts.push("\u4E0A\u6B21\u67E5\u8BE2\u7ED3\u679C\uFF08\u524D " + preview.length + " \u884C\uFF09\uFF1A" + JSON.stringify(preview));
      }
      if (dbs.result.note) parts.push("\u4E0A\u6B21\u7ED3\u679C\u4FE1\u606F\uFF1A" + dbs.result.note);
    }
  } else if (dbs.driver === "supabase") {
    parts.push("\u9A71\u52A8\uFF1ASupabase");
    if (dbs.sb.tables && dbs.sb.tables.length) parts.push("\u53EF\u7528\u8868\uFF1A" + dbs.sb.tables.join(", "));
  }
  return parts.join("\n");
}
var BASE_SYSTEM_PROMPT = `\u4F60\u662F RELAY DevKit \u7684 AI \u52A9\u624B\uFF0C\u4E00\u4E2A\u4E13\u4E1A\u7684\u5F00\u53D1\u8C03\u8BD5\u5DE5\u5177\u3002\u4F60\u53EF\u4EE5\u5E2E\u52A9\u7528\u6237\uFF1A

1. **API \u8C03\u8BD5** \u2014 \u5206\u6790 HTTP \u8BF7\u6C42/\u54CD\u5E94\u9519\u8BEF\uFF0C\u63D0\u4F9B\u89E3\u51B3\u65B9\u6848
2. **SQL \u4F18\u5316** \u2014 \u5206\u6790 SQL \u67E5\u8BE2\u6027\u80FD\uFF0C\u63D0\u4F9B\u4F18\u5316\u5EFA\u8BAE\u548C\u7D22\u5F15\u5EFA\u8BAE
3. **SQL \u7F16\u5199** \u2014 \u6839\u636E\u7528\u6237\u9700\u6C42\u751F\u6210 SQL \u67E5\u8BE2\u8BED\u53E5
4. **\u6570\u636E\u5E93\u4EA4\u4E92** \u2014 \u901A\u8FC7\u5DE5\u5177\u6267\u884C SQL\u3001\u67E5\u770B\u8868\u7ED3\u6784\u3001\u5206\u6790\u6267\u884C\u8BA1\u5212
5. **\u6570\u636E\u5206\u6790** \u2014 \u6267\u884C\u805A\u5408\u67E5\u8BE2\uFF0C\u751F\u6210\u6570\u636E\u6458\u8981

\u89C4\u5219\uFF1A
- \u56DE\u590D\u4F7F\u7528\u4E2D\u6587\uFF0C\u4EE3\u7801\u548C\u6280\u672F\u672F\u8BED\u4FDD\u6301\u82F1\u6587
- \u751F\u6210\u7684 SQL \u4F7F\u7528\u6807\u51C6 MySQL \u8BED\u6CD5
- \u5199\u64CD\u4F5C\uFF08INSERT/UPDATE/DELETE/DROP/ALTER\uFF09\u5FC5\u987B\u5148\u5411\u7528\u6237\u8BF4\u660E\u610F\u56FE
- \u4F18\u5148\u4F7F\u7528 SELECT \u9A8C\u8BC1\u6570\u636E\u540E\u518D\u5EFA\u8BAE\u5199\u64CD\u4F5C
- \u5982\u679C\u4E0A\u4E0B\u6587\u4FE1\u606F\u4E0D\u8DB3\u4EE5\u56DE\u7B54\uFF0C\u4E3B\u52A8\u8BE2\u95EE\u8865\u5145`;
function buildSystemPrompt() {
  const parts = [BASE_SYSTEM_PROMPT];
  const view = currentView();
  let context = null;
  if (view === "api") context = buildApiContext();
  else if (view === "db") context = buildDbContext();
  if (context) parts.push("\n--- \u5F53\u524D\u7528\u6237\u4E0A\u4E0B\u6587 ---\n" + context);
  const selection = getUserSelection();
  if (selection) parts.push("\n\u7528\u6237\u9009\u4E2D\u7684\u6587\u672C\uFF1A" + selection.slice(0, 1e3));
  return parts.join("\n");
}
function buildContextSummary() {
  const view = currentView();
  const parts = [];
  if (view === "api") {
    const tab = activeTab();
    if (tab) {
      parts.push("API");
      if (tab.method && tab.url) parts.push(tab.method + " " + (tab.url.length > 40 ? tab.url.slice(0, 40) + "\u2026" : tab.url));
      if (tab.response) parts.push(tab.response.error ? "\u6709\u9519\u8BEF" : "\u72B6\u6001 " + (tab.response.status || "?"));
    }
  } else if (view === "db") {
    const dbs = getDbState();
    if (dbs) {
      parts.push(dbs.driver === "mysql" && dbs.my.database ? "\u6570\u636E\u5E93 \xB7 " + dbs.my.database : "\u6570\u636E\u5E93");
      if (dbs.curTable) parts.push(dbs.curTable);
    }
  } else {
    parts.push(view || "\u9996\u9875");
  }
  return parts.join(" \xB7 ") || "\u65E0\u4E0A\u4E0B\u6587";
}
function buildTools() {
  const dbs = getDbState();
  const connected2 = dbs && dbs.driver === "mysql" && !!dbs.my.token;
  if (!connected2) return [];
  return [
    { type: "function", function: { name: "execute_sql", description: "\u5728\u5F53\u524D MySQL \u8FDE\u63A5\u4E0A\u6267\u884C SQL \u67E5\u8BE2\u5E76\u8FD4\u56DE\u7ED3\u679C\u3002", parameters: { type: "object", properties: { sql: { type: "string", description: "\u8981\u6267\u884C\u7684 SQL \u8BED\u53E5" }, max_rows: { type: "number", description: "\u6700\u5927\u8FD4\u56DE\u884C\u6570\uFF0C\u9ED8\u8BA4 50", default: 50 } }, required: ["sql"] } } },
    { type: "function", function: { name: "explain_sql", description: "\u5BF9 SQL \u8BED\u53E5\u6267\u884C EXPLAIN \u5206\u6790\uFF0C\u8FD4\u56DE\u6267\u884C\u8BA1\u5212\u4FE1\u606F\u3002", parameters: { type: "object", properties: { sql: { type: "string", description: "\u8981\u5206\u6790\u7684 SQL \u8BED\u53E5" } }, required: ["sql"] } } },
    { type: "function", function: { name: "get_table_schema", description: "\u83B7\u53D6\u6307\u5B9A\u8868\u7684\u5B8C\u6574\u7ED3\u6784\u4FE1\u606F\uFF0C\u5305\u62EC\u5EFA\u8868 DDL \u548C\u5217\u5B9A\u4E49\u3002", parameters: { type: "object", properties: { table: { type: "string", description: "\u8868\u540D" } }, required: ["table"] } } },
    { type: "function", function: { name: "list_tables", description: "\u5217\u51FA\u5F53\u524D\u6570\u636E\u5E93\u7684\u6240\u6709\u8868\u540D\u3002", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "get_databases", description: "\u5217\u51FA MySQL \u670D\u52A1\u5668\u4E0A\u6240\u6709\u53EF\u7528\u7684\u6570\u636E\u5E93\u3002", parameters: { type: "object", properties: {} } } }
  ];
}
async function executeToolCall(name, args) {
  const dbs = getDbState();
  if (!dbs || dbs.driver !== "mysql" || !dbs.my.token) return JSON.stringify({ error: "MySQL \u672A\u8FDE\u63A5" });
  const isWrite = /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|RENAME)/i.test((args.sql || "").trim());
  if (isWrite && name === "execute_sql") {
    const confirmed = window.confirm("AI \u8BF7\u6C42\u6267\u884C\u5199\u64CD\u4F5C\n\n" + args.sql + "\n\n\u662F\u5426\u5141\u8BB8\u6267\u884C\uFF1F");
    if (!confirmed) return JSON.stringify({ error: "\u7528\u6237\u53D6\u6D88\u4E86\u64CD\u4F5C" });
  }
  try {
    switch (name) {
      case "execute_sql": {
        const maxRows = Math.min(args.max_rows || 50, 200);
        const r = await dbReq("query", { token: dbs.my.token, sql: args.sql, maxRows });
        if (!r.ok) return JSON.stringify({ error: r.error });
        const preview = (r.rows || []).slice(0, MAX_CONTEXT_ROWS);
        return JSON.stringify({ rows: preview, totalRows: r.rowCount, truncated: r.truncated, elapsedMs: r.elapsedMs, columns: r.columns, affectedRows: r.affectedRows });
      }
      case "explain_sql": {
        const r = await dbReq("query", { token: dbs.my.token, sql: "EXPLAIN " + args.sql, maxRows: 50 });
        if (!r.ok) return JSON.stringify({ error: r.error });
        return JSON.stringify({ explain: r.rows || [], elapsedMs: r.elapsedMs });
      }
      case "get_table_schema": {
        const ddlR = await dbReq("query", { token: dbs.my.token, sql: "SHOW CREATE TABLE " + String.fromCharCode(96) + args.table + String.fromCharCode(96), maxRows: 1 });
        const colsR = await dbReq("query", { token: dbs.my.token, sql: "SHOW FULL COLUMNS FROM " + String.fromCharCode(96) + args.table + String.fromCharCode(96), maxRows: 200 });
        const ddl = ddlR.ok && ddlR.rows && ddlR.rows[0] ? Object.values(ddlR.rows[0]).find(function(_, i) {
          return i === 1;
        }) || "" : "";
        const cols = colsR.ok ? (colsR.rows || []).map(function(c) {
          return { name: c.Field, type: c.Type, key: c.Key, nullable: c.Null, default: c.Default, extra: c.Extra, comment: c.Comment };
        }) : [];
        return JSON.stringify({ table: args.table, ddl, columns: cols, error: ddlR.error || colsR.error });
      }
      case "list_tables":
        return JSON.stringify({ tables: dbs.my.tables || [], database: dbs.my.database });
      case "get_databases": {
        const r = await dbReq("databases", { token: dbs.my.token });
        if (!r.ok) return JSON.stringify({ error: r.error });
        return JSON.stringify({ databases: r.databases || [] });
      }
      default:
        return JSON.stringify({ error: "\u672A\u77E5\u5DE5\u5177: " + name });
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// src/core/ai-client.js
var MAX_TOOL_ROUNDS = 5;
function createSSEParser() {
  let buffer = "";
  return {
    feed(chunk) {
      buffer += chunk;
      const results = [];
      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx < 0) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            results.push({ done: true });
            continue;
          }
          try {
            const json = JSON.parse(data);
            results.push(json);
          } catch (e) {
          }
        }
      }
      return results;
    },
    reset() {
      buffer = "";
    }
  };
}
async function chat(opts) {
  const config = getActive();
  if (!config || !config.endpoint || !config.apiKey) {
    if (opts.onError) opts.onError("\u8BF7\u5148\u914D\u7F6E AI\uFF08\u70B9\u51FB\u53F3\u4E0A\u89D2\u8BBE\u7F6E\u6216 /#/ai\uFF09");
    return;
  }
  const url = chatUrl(config.endpoint);
  const tools = buildTools();
  const systemPrompt = opts.useContext !== false ? buildSystemPrompt() : "\u4F60\u662F RELAY DevKit \u7684 AI \u52A9\u624B\u3002";
  const allMessages = [{ role: "system", content: systemPrompt }, ...opts.messages];
  const body = {
    model: config.model || "gpt-3.5-turbo",
    messages: allMessages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 4096,
    stream: true
  };
  if (tools.length) body.tools = tools;
  if (config.systemPrompt && config.systemPrompt.trim()) {
    allMessages[0].content += "\n\n" + config.systemPrompt.trim();
  }
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    body.messages = allMessages;
    let fullText = "";
    let toolCalls = [];
    try {
      const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey };
      let fetchUrl = url;
      if (config.proxy) {
        headers["X-Relay-Target"] = url;
        fetchUrl = "/__proxy";
      }
      const resp = await fetch(fetchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: opts.signal
      });
      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try {
          const errData = await resp.json();
          errMsg = errData.error?.message || errData.message || errMsg;
        } catch (e) {
        }
        if (opts.onError) opts.onError(errMsg);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSSEParser();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunks = parser.feed(decoder.decode(value, { stream: true }));
        for (const chunk of chunks) {
          if (chunk.done) continue;
          const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          if (!delta) continue;
          if (delta.content) {
            fullText += delta.content;
            if (opts.onDelta) opts.onDelta(delta.content);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index || 0;
              if (!toolCalls[idx]) toolCalls[idx] = { id: "", name: "", arguments: "" };
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function) {
                if (tc.function.name) toolCalls[idx].name += tc.function.name;
                if (tc.function.arguments) toolCalls[idx].arguments += tc.function.arguments;
              }
            }
          }
        }
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      if (opts.onError) opts.onError("\u8BF7\u6C42\u5931\u8D25\uFF1A" + e.message);
      return;
    }
    if (!toolCalls.length) {
      if (opts.onComplete) opts.onComplete(fullText);
      return;
    }
    allMessages.push({ role: "assistant", content: fullText || null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      if (opts.onToolCall) opts.onToolCall(tc.name, tc.arguments);
      let args = {};
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch (e) {
      }
      const result = await executeToolCall(tc.name, args);
      if (opts.onToolResult) opts.onToolResult(tc.name, result);
      allMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
  if (opts.onComplete) opts.onComplete("");
}
function renderMarkdown(text) {
  if (!text) return "";
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre class="ai-code-block"><code' + (lang ? ' class="lang-' + lang + '"' : "") + ">" + code + "</code></pre>";
  });
  html = html.replace(/`([^`]+)`/g, '<code class="ai-code-inline">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/^\d+\.\s(.+)$/gm, "<li>$1</li>");
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p><\/p>/g, "");
  return html;
}

// src/tools/ai.js
var histStore2 = store("ai.convos");
var conversations = histStore2.get() || [];
var activeConvoId = null;
var abortCtrl = null;
var useCtx = true;
function saveConvos() {
  histStore2.set(conversations);
}
function activeConvo() {
  return conversations.find((c) => c.id === activeConvoId) || null;
}
function newConvo(title) {
  const c = { id: uid(), title: title || "New Chat", messages: [], createdAt: Date.now() };
  conversations.unshift(c);
  if (conversations.length > 50) conversations.length = 50;
  activeConvoId = c.id;
  saveConvos();
  return c;
}
function initAiTool() {
  var v = $("#viewAi");
  var cfg = getActive();
  var cfgName = cfg ? esc(cfg.name) : "";
  var ctxSummary = buildContextSummary();
  var page = document.createElement("div");
  page.className = "ai-page";
  page.innerHTML = [
    "<div class=" + String.fromCharCode(34) + "ai-topbar" + String.fromCharCode(34) + ">",
    "  <span class=" + String.fromCharCode(34) + "t-title" + String.fromCharCode(34) + "><span class=" + String.fromCharCode(34) + "tg" + String.fromCharCode(34) + ">\u2726</span> AI \u52A9\u624B</span>",
    "  <button class=" + String.fromCharCode(34) + "t-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCfgBtn" + String.fromCharCode(34) + ">\u2699 \u914D\u7F6E\u7BA1\u7406</button>",
    "  <div class=" + String.fromCharCode(34) + "ai-cfg-sel" + String.fromCharCode(34) + "><button class=" + String.fromCharCode(34) + "ai-cfg-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCfgDropdown" + String.fromCharCode(34) + ">" + cfgName + " \u25BE</button><div class=" + String.fromCharCode(34) + "ai-cfg-menu" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCfgMenu" + String.fromCharCode(34) + "></div></div>",
    "  <button class=" + String.fromCharCode(34) + "t-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiNewConvo" + String.fromCharCode(34) + ">+ \u65B0\u5BF9\u8BDD</button>",
    "  <span class=" + String.fromCharCode(34) + "sp" + String.fromCharCode(34) + "></span>",
    "  <label class=" + String.fromCharCode(34) + "ai-ctx-toggle" + String.fromCharCode(34) + "><input type=" + String.fromCharCode(34) + "checkbox" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCtxToggle" + String.fromCharCode(34) + " checked> \u9644\u5E26\u4E0A\u6587</label>",
    "</div>",
    "<div class=" + String.fromCharCode(34) + "ai-main" + String.fromCharCode(34) + ">",
    "  <div class=" + String.fromCharCode(34) + "ai-sidebar" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiSidebar" + String.fromCharCode(34) + ">",
    "    <div class=" + String.fromCharCode(34) + "ai-side-head" + String.fromCharCode(34) + ">\u5BF9\u8BDD\u5386\u53F2</div>",
    "    <div class=" + String.fromCharCode(34) + "ai-side-list" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiConvoList" + String.fromCharCode(34) + "></div>",
    "  </div>",
    "  <div class=" + String.fromCharCode(34) + "ai-chat" + String.fromCharCode(34) + ">",
    "    <div class=" + String.fromCharCode(34) + "ai-ctx-bar" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiCtxBar" + String.fromCharCode(34) + "></div>",
    "    <div class=" + String.fromCharCode(34) + "ai-messages" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiMessages" + String.fromCharCode(34) + "></div>",
    "    <div class=" + String.fromCharCode(34) + "ai-input-bar" + String.fromCharCode(34) + ">",
    "      <textarea class=" + String.fromCharCode(34) + "ai-input" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiInput" + String.fromCharCode(34) + " placeholder=" + String.fromCharCode(34) + "\u8F93\u5165\u6D88\u606F... (Enter \u53D1\u9001, Shift+Enter \u6362\u884C)" + String.fromCharCode(34) + " rows=" + String.fromCharCode(34) + "2" + String.fromCharCode(34) + "></textarea>",
    "      <button class=" + String.fromCharCode(34) + "t-btn primary" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiSendBtn" + String.fromCharCode(34) + ">\u53D1\u9001</button>",
    "      <button class=" + String.fromCharCode(34) + "t-btn" + String.fromCharCode(34) + " id=" + String.fromCharCode(34) + "aiStopBtn" + String.fromCharCode(34) + " style=" + String.fromCharCode(34) + "display:none" + String.fromCharCode(34) + ">\u505C\u6B62</button>",
    "    </div>",
    "  </div>",
    "</div>"
  ].join("");
  v.appendChild(page);
  $("#aiCtxBar").innerHTML = "\u{1F4CA} " + esc(ctxSummary);
  $("#aiCfgBtn").onclick = showConfigModal;
  $("#aiNewConvo").onclick = function() {
    newConvo("\u65B0\u5BF9\u8BDD");
    renderConvoList();
    renderMessages();
  };
  $("#aiSendBtn").onclick = sendMessage;
  $("#aiStopBtn").onclick = stopChat;
  $("#aiCfgDropdown").onclick = toggleCfgMenu;
  $("#aiCtxToggle").onchange = function(e) {
    useCtx = e.target.checked;
  };
  $("#aiInput").addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $("#aiInput").addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });
  if (!conversations.length) newConvo("\u65B0\u5BF9\u8BDD");
  else if (!activeConvo()) activeConvoId = conversations[0].id;
  renderConvoList();
  renderMessages();
  renderCfgMenu();
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
  menu.querySelectorAll(".ai-cfg-item").forEach(function(el2) {
    el2.onclick = function() {
      switchConfig(el2.dataset.id);
      var cfg = getActive();
      var btn = $("aiCfgDropdown");
      if (btn && cfg) btn.textContent = cfg.name + " \u25BE";
      menu.classList.remove("open");
    };
  });
}
function renderConvoList() {
  var host = $("aiConvoList");
  if (!host) return;
  host.innerHTML = conversations.map(function(c, i) {
    var isOn = c.id === activeConvoId;
    return "<div class=" + String.fromCharCode(34) + "ai-convo-item" + (isOn ? " on" : "") + String.fromCharCode(34) + " data-idx=" + String.fromCharCode(34) + i + String.fromCharCode(34) + "><span class=" + String.fromCharCode(34) + "ai-convo-title" + String.fromCharCode(34) + ">" + esc(c.title) + "</span><span class=" + String.fromCharCode(34) + "ai-convo-del" + String.fromCharCode(34) + " data-del=" + String.fromCharCode(34) + i + String.fromCharCode(34) + ">\u2715</span></div>";
  }).join("");
  host.querySelectorAll(".ai-convo-item").forEach(function(el2) {
    el2.onclick = function(e) {
      if (e.target.dataset.del !== void 0) {
        var idx = +e.target.dataset.del;
        conversations.splice(idx, 1);
        saveConvos();
        if (conversations.length === 0) newConvo("\u65B0\u5BF9\u8BDD");
        else if (!activeConvo()) activeConvoId = conversations[0].id;
        renderConvoList();
        renderMessages();
        return;
      }
      activeConvoId = conversations[+el2.dataset.idx].id;
      renderConvoList();
      renderMessages();
    };
  });
}
function renderMessages() {
  var host = $("aiMessages");
  if (!host) return;
  var convo = activeConvo();
  if (!convo || !convo.messages.length) {
    host.innerHTML = '<div class="ai-empty">\u5F00\u59CB\u65B0\u5BF9\u8BDD\u3002\u6211\u53EF\u4EE5\u5E2E\u4F60\u5206\u6790 API \u9519\u8BEF\u3001\u4F18\u5316 SQL\u3001\u7F16\u5199\u67E5\u8BE2\u8BED\u53E5\u7B49\u3002</div>';
    return;
  }
  host.innerHTML = convo.messages.map(function(m) {
    if (m.role === "user") return '<div class="ai-msg user"><div class="ai-msg-role">\u4F60</div><div class="ai-msg-body">' + esc(m.content) + "</div></div>";
    if (m.role === "assistant") return '<div class="ai-msg assistant"><div class="ai-msg-role">AI</div><div class="ai-msg-body">' + renderMarkdown(m.content || "") + "</div></div>";
    if (m.role === "tool") return '<div class="ai-msg tool"><div class="ai-msg-role">\u{1F527} \u5DE5\u5177</div><div class="ai-msg-body"><pre>' + esc(m.content) + "</pre></div></div>";
    return "";
  }).join("");
  host.scrollTop = host.scrollHeight;
  var ctxBar = $("aiCtxBar");
  if (ctxBar) ctxBar.innerHTML = "\u{1F4CA} " + esc(buildContextSummary());
}
async function sendMessage() {
  var input = $("aiInput");
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  var convo = activeConvo();
  if (!convo) {
    convo = newConvo(text.slice(0, 30));
    renderConvoList();
  }
  convo.messages.push({ role: "user", content: text });
  if (convo.messages.length === 1) convo.title = text.slice(0, 30);
  input.value = "";
  input.style.height = "auto";
  renderMessages();
  var host = $("aiMessages");
  var loadingEl = document.createElement("div");
  loadingEl.className = "ai-msg assistant";
  loadingEl.id = "aiLoading";
  loadingEl.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-body"><span class="spin"></span> \u601D\u8003\u4E2D...</div>';
  host.appendChild(loadingEl);
  host.scrollTop = host.scrollHeight;
  $("aiSendBtn").style.display = "none";
  $("aiStopBtn").style.display = "";
  var chatMessages = convo.messages.filter(function(m) {
    return m.role !== "tool";
  }).map(function(m) {
    return { role: m.role, content: m.content };
  });
  abortCtrl = new AbortController();
  var aiContent = "";
  var aiEl = null;
  await chat({
    messages: chatMessages,
    signal: abortCtrl.signal,
    useContext: useCtx,
    onDelta: function(delta) {
      aiContent += delta;
      var ld = $("aiLoading");
      if (ld) ld.remove();
      if (!aiEl) {
        aiEl = document.createElement("div");
        aiEl.className = "ai-msg assistant";
        aiEl.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-body"></div>';
        host.appendChild(aiEl);
      }
      aiEl.querySelector(".ai-msg-body").innerHTML = renderMarkdown(aiContent);
      host.scrollTop = host.scrollHeight;
    },
    onToolCall: function(name, args) {
      var ld = $("aiLoading");
      if (ld) ld.remove();
      if (!aiEl) {
        aiEl = document.createElement("div");
        aiEl.className = "ai-msg assistant";
        aiEl.innerHTML = '<div class="ai-msg-role">AI</div><div class="ai-msg-body"></div>';
        host.appendChild(aiEl);
      }
      var toolEl = document.createElement("div");
      toolEl.className = "ai-msg tool";
      toolEl.innerHTML = '<div class="ai-msg-role">\u{1F527} \u5DE5\u5177</div><div class="ai-msg-body"><span class="spin"></span> \u6267\u884C\u4E2D: ' + esc(name) + "</div>";
      host.appendChild(toolEl);
      host.scrollTop = host.scrollHeight;
    },
    onToolResult: function() {
    },
    onComplete: function(fullText) {
      if (fullText) convo.messages.push({ role: "assistant", content: fullText });
      saveConvos();
      renderMessages();
      $("aiSendBtn").style.display = "";
      $("aiStopBtn").style.display = "none";
    },
    onError: function(err) {
      var ld = $("aiLoading");
      if (ld) ld.remove();
      var errEl = document.createElement("div");
      errEl.className = "ai-msg error";
      errEl.innerHTML = '<div class="ai-msg-role">\u26A0</div><div class="ai-msg-body">\u9519\u8BEF: ' + esc(err) + "</div>";
      host.appendChild(errEl);
      host.scrollTop = host.scrollHeight;
      $("aiSendBtn").style.display = "";
      $("aiStopBtn").style.display = "none";
    }
  });
}
function stopChat() {
  if (abortCtrl) {
    abortCtrl.abort();
    abortCtrl = null;
  }
  $("aiSendBtn").style.display = "";
  $("aiStopBtn").style.display = "none";
}
function showConfigModal() {
  var bg = $("modalBg");
  var m = el("div", "modal wide");
  var configs = getConfigs();
  var aid = getActiveId();
  m.innerHTML = "";
  m.appendChild(el("h3", "", "AI \u914D\u7F6E\u7BA1\u7406"));
  var sub = el("div", "sub");
  sub.textContent = "\u652F\u6301 OpenAI \u534F\u8BAE\u517C\u5BB9\u7684 AI \u670D\u52A1\uFF08DeepSeek\u3001Qwen\u3001Ollama \u7B49\uFF09\u3002Endpoint \u586B Base URL\uFF0C\u7CFB\u7EDF\u81EA\u52A8\u62FC\u63A5 /chat/completions\u3002";
  m.appendChild(sub);
  var body = el("div", "ai-cfg-body");
  var listWrap = el("div", "ai-cfg-list");
  listWrap.innerHTML = '<div class="ai-cfg-list-head">\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E</div><div class="ai-cfg-list-items" id="aiCfgListItems"></div><button class="cm-add" id="aiCfgAdd">+ \u65B0\u589E\u914D\u7F6E</button>';
  body.appendChild(listWrap);
  var formWrap = el("div", "ai-cfg-form");
  formWrap.id = "aiCfgForm";
  body.appendChild(formWrap);
  var fieldWrap = el("div", "field");
  fieldWrap.appendChild(body);
  m.appendChild(fieldWrap);
  var acts = el("div", "acts");
  var sp = el("div");
  sp.style.flex = "1";
  var closeBtn = el("button", "btn ghost", "\u5173\u95ED");
  acts.append(sp, closeBtn);
  m.appendChild(acts);
  bg.innerHTML = "";
  bg.appendChild(m);
  bg.classList.add("open");
  bg.onclick = function(e) {
    if (e.target === bg) closeModal();
  };
  bg.onkeydown = function(e) {
    if (e.key === "Escape") closeModal();
  };
  closeBtn.onclick = closeModal;
  function closeModal() {
    bg.classList.remove("open");
    bg.innerHTML = "";
    bg.onkeydown = null;
  }
  var editingId = aid;
  renderCfgList();
  if (editingId) renderCfgForm(editingId);
  $("aiCfgAdd").onclick = function() {
    var cfg = addConfig({ name: "\u65B0\u914D\u7F6E" });
    editingId = cfg.id;
    renderCfgList();
    renderCfgForm(cfg.id);
  };
  function renderCfgList() {
    var list = $("aiCfgListItems");
    var cfgs = getConfigs();
    list.innerHTML = cfgs.map(function(c) {
      return '<div class="cm-item' + (c.id === editingId ? " on" : "") + '" data-id="' + c.id + '"><span class="cm-dot" style="background:' + c.color + '"></span><span class="cm-item-name">' + esc(c.name) + '</span><span class="cm-item-del" data-del="' + c.id + '">\xD7</span></div>';
    }).join("");
    list.querySelectorAll(".cm-item").forEach(function(el2) {
      el2.onclick = function(e) {
        if (e.target.dataset.del) {
          if (confirm("\u786E\u5B9A\u5220\u9664\u8BE5\u914D\u7F6E\uFF1F")) {
            removeConfig(e.target.dataset.del);
            editingId = getActiveId();
            renderCfgList();
            renderCfgForm(editingId);
            renderCfgMenu();
          }
          return;
        }
        editingId = el2.dataset.id;
        renderCfgList();
        renderCfgForm(editingId);
      };
    });
  }
  function renderCfgForm(id) {
    var form = $("aiCfgForm");
    if (!form) return;
    var c = getConfigs().find(function(x) {
      return x.id === id;
    });
    if (!c) {
      form.innerHTML = '<h3>\u9009\u62E9\u6216\u65B0\u589E\u914D\u7F6E</h3><div style="color:var(--dim);font-size:12px;margin-top:8px">\u70B9\u51FB\u5DE6\u4FA7\u914D\u7F6E\u9879\u7F16\u8F91</div>';
      return;
    }
    form.innerHTML = "<h3>" + esc(c.name) + "</h3>" + mkField("\u540D\u79F0", "cfgName", c.name) + mkColor(c.color) + mkField("Base URL", "cfgEndpoint", c.endpoint, "https://api.deepseek.com/v1") + mkField("API Key", "cfgApiKey", c.apiKey ? maskKey(c.apiKey) : "", "sk-xxx", true) + mkField("\u6A21\u578B", "cfgModel", c.model, "deepseek-chat") + mkRange("\u6E29\u5EA6", "cfgTemp", c.temperature ?? 0.7, 0, 2, 0.1) + mkField("\u6700\u5927 Token", "cfgMaxTokens", c.maxTokens || 4096) + mkArea("\u81EA\u5B9A\u4E49\u7CFB\u7EDF\u63D0\u793A\u8BCD", "cfgSysPrompt", c.systemPrompt, "\u53EF\u9009\uFF0C\u8FFD\u52A0\u5230\u9ED8\u8BA4\u63D0\u793A\u8BCD\u540E") + mkProxy(c.proxy) + '<div class="cm-acts"><button class="t-btn cm-btn-danger" id="cfgDel">\u5220\u9664</button><span style="flex:1"></span><button class="t-btn" id="cfgTest">\u6D4B\u8BD5\u8FDE\u63A5</button><button class="t-btn primary" id="cfgSave">\u4FDD\u5B58</button></div>';
    form.querySelectorAll(".cm-color").forEach(function(el2) {
      el2.onclick = function() {
        c.color = el2.dataset.color;
        updateConfig(c.id, { color: c.color });
        renderCfgForm(c.id);
      };
    });
    $("cfgDel").onclick = function() {
      if (confirm("\u786E\u5B9A\u5220\u9664\uFF1F")) {
        removeConfig(c.id);
        editingId = getActiveId();
        renderCfgList();
        renderCfgForm(editingId);
        renderCfgMenu();
      }
    };
    $("cfgSave").onclick = function() {
      c.name = $("cfgName").value.trim() || "\u672A\u547D\u540D";
      c.endpoint = $("cfgEndpoint").value.trim();
      var rawKey = $("cfgApiKey").value.trim();
      if (rawKey && !rawKey.startsWith("sk-") && rawKey.includes("\u2022")) {
      } else {
        c.apiKey = rawKey;
      }
      c.model = $("cfgModel").value.trim();
      c.temperature = parseFloat($("cfgTemp").value) || 0.7;
      c.maxTokens = parseInt($("cfgMaxTokens").value) || 4096;
      c.systemPrompt = $("cfgSysPrompt").value;
      var px = $("cfgProxy");
      c.proxy = px ? px.checked : false;
      updateConfig(c.id, c);
      renderCfgList();
      renderCfgForm(c.id);
      renderCfgMenu();
      var btn = $("aiCfgDropdown");
      if (btn) {
        var a = getActive();
        btn.textContent = (a ? a.name : "") + " \u25BE";
      }
      setStatus("\u914D\u7F6E\u5DF2\u4FDD\u5B58", "ok");
    };
    $("cfgTest").onclick = async function() {
      var ep = $("cfgEndpoint").value.trim();
      var key = $("cfgApiKey").value.trim();
      if (!ep || !key) {
        setStatus("\u8BF7\u586B\u5199 Endpoint \u548C API Key", "warn");
        return;
      }
      setStatus("\u6D4B\u8BD5\u8FDE\u63A5\u4E2D...");
      try {
        var url = chatUrl(ep);
        var hdrs = { "Content-Type": "application/json", "Authorization": "Bearer " + key };
        var fu = url;
        var px2 = $("cfgProxy");
        if (px2 && px2.checked) {
          hdrs["X-Relay-Target"] = url;
          fu = "/__proxy";
        }
        var resp = await fetch(fu, { method: "POST", headers: hdrs, body: JSON.stringify({ model: $("cfgModel").value.trim() || "gpt-3.5-turbo", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }) });
        if (resp.ok) setStatus("\u2713 \u8FDE\u63A5\u6210\u529F", "ok");
        else {
          var t = await resp.text();
          setStatus("\u2717 \u8FDE\u63A5\u5931\u8D25: HTTP " + resp.status + " " + t.slice(0, 100), "err");
        }
      } catch (e) {
        setStatus("\u2717 \u8FDE\u63A5\u5931\u8D25: " + e.message, "err");
      }
    };
  }
}
function mkField(label, id, value, placeholder, isPassword) {
  var tp = isPassword ? "password" : "text";
  return '<div class="db-row"><label>' + label + '</label><input class="t-in" type="' + tp + '" id="' + id + '" spellcheck="false" value="' + esc(value || "") + '" placeholder="' + esc(placeholder || "") + '"></div>';
}
function mkColor(current) {
  return '<div class="db-row"><label>\u989C\u8272</label><div class="cm-colors">' + COLORS2.map(function(cl) {
    return '<div class="cm-color' + (cl === current ? " on" : "") + '" style="background:' + cl + '" data-color="' + cl + '"></div>';
  }).join("") + "</div></div>";
}
function mkRange(label, id, value, min, max, step) {
  return '<div class="db-row"><label>' + label + ': <strong id="' + id + 'Val">' + value + '</strong></label><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" style="width:100%"></div>';
}
function mkArea(label, id, value, placeholder) {
  return '<div class="db-row"><label>' + label + '</label><textarea class="t-ta" id="' + id + '" rows="3" spellcheck="false" placeholder="' + esc(placeholder || "") + '">' + esc(value || "") + "</textarea></div>";
}
function mkProxy(checked) {
  return '<div class="cm-remember"><input type="checkbox" id="cfgProxy"' + (checked ? " checked" : "") + "> \u7ECF\u672C\u5730\u4EE3\u7406 /__proxy \u8F6C\u53D1\uFF08\u7ED5\u8FC7 CORS\uFF09</div>";
}

// src/panel.jsx
import { jsx } from "react/jsx-runtime";
var SPA_HTML = `
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
    <button class="top-act" id="proxyBtn" title="\u7ECF\u672C\u5730\u540E\u7AEF /__proxy \u8F6C\u53D1\uFF0C\u7ED5\u8FC7\u6D4F\u89C8\u5668 CORS \u4E0E\u6DF7\u5408\u5185\u5BB9\u9650\u5236\uFF08\u9700\u8FD0\u884C server.py\uFF09">\u{1F6E1} \u4EE3\u7406: \u5173</button>
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
                \xB7 <b>\u8DE8\u57DF</b>\uFF1A\u9876\u680F\u300C\u{1F6E1} \u4EE3\u7406\u300D\u5F00\u542F\u540E\u7ECF\u672C\u5730\u540E\u7AEF\u8F6C\u53D1\uFF0C\u7ED5\u8FC7 CORS / \u6DF7\u5408\u5185\u5BB9
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <footer class="statusbar">
    <span class="msg" id="statusMsg">\u5C31\u7EEA \xB7 \u7EAF\u524D\u7AEF\u8FD0\u884C\uFF0C\u8DE8\u57DF\u8BF7\u6C42\u53D7\u6D4F\u89C8\u5668 CORS \u7B56\u7565\u9650\u5236</span>
    <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span><span>:9860</span></span>
  </footer>
  </div>
  <div class="view" id="viewJson"></div>
  <div class="view" id="viewSql"></div>
  <div class="view" id="viewTime"></div>
  <div class="view" id="viewDb"></div>
  <div class="view" id="viewAi"></div>
</div>
<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="cell-tip" id="cellTip"></div>
<div id="aiFloatHost"></div>
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
    registerView({ id: "home", label: "\u9996\u9875", icon: "\u2302" });
    registerView({
      id: "api",
      label: "API \u8BF7\u6C42",
      icon: "\u21C5",
      card: { name: "API \u8BF7\u6C42", icon: "\u21C5", accent: "var(--brand)", desc: "\u591A tab\u3001\u73AF\u5883\u53D8\u91CF\u3001cURL \u5BFC\u5165\u3001\u8DE8\u57DF\u4EE3\u7406\uFF1B\u54CD\u5E94\u652F\u6301\u8868\u683C / \u5BF9\u8C61\u6811 / \u8DEF\u5F84\u4E0B\u94BB\u4E0E\u7B5B\u9009\u3002" }
    });
    registerView({
      id: "json",
      label: "JSON",
      icon: "{ }",
      init: initJsonTool,
      card: { name: "JSON \u5DE5\u5177", icon: "{ }", accent: "var(--m-post)", desc: "\u7C98\u8D34\u5373\u7528\uFF1A\u683C\u5F0F\u5316 / \u538B\u7F29 / \u6821\u9A8C / \u8F6C\u4E49\uFF1B\u5BF9\u8C61\u6811\u3001\u8868\u683C\u3001\u8DEF\u5F84\u4E0B\u94BB\u3001\u5B57\u6BB5\u7B5B\u9009\uFF0C\u8BC6\u522B\u56FE\u7247\u4E0E\u65F6\u95F4\u6233\u3002" }
    });
    registerView({
      id: "sql",
      label: "SQL",
      icon: "\u2261",
      init: initSqlTool,
      card: { name: "SQL \u6A21\u677F\u586B\u5145", icon: "\u2261", accent: "var(--m-put)", desc: "\u9884\u7F16\u8BD1 ? + \u53C2\u6570\u8FD8\u539F\u4E3A\u53EF\u6267\u884C SQL\uFF1B\u81EA\u52A8\u5224\u65AD\u7C7B\u578B\u3001\u8F6C\u4E49\u5F15\u53F7\uFF1B\u652F\u6301 MyBatis \u65E5\u5FD7 Preparing/Parameters \u89E3\u6790\u3002" }
    });
    registerView({
      id: "time",
      label: "\u65F6\u95F4\u6233",
      icon: "\u25F7",
      init: initTimeTool,
      card: { name: "\u65F6\u95F4\u6233\u8F6C\u6362", icon: "\u25F7", accent: "var(--m-patch)", desc: "\u79D2 / \u6BEB\u79D2 / \u5FAE\u79D2\u81EA\u52A8\u8BC6\u522B\uFF0Cepoch \u2194 \u672C\u5730 / UTC / ISO / \u76F8\u5BF9\u65F6\u95F4\uFF0C\u53CC\u5411\u4E92\u8F6C\uFF0C\u4E00\u952E\u590D\u5236\u3002" }
    });
    registerView({
      id: "db",
      label: "\u6570\u636E\u5E93",
      icon: "\u26C1",
      init: initDbTool,
      card: { name: "\u6570\u636E\u5E93", icon: "\u26C1", accent: "#2dd4bf", desc: "MySQL\uFF08\u7ECF\u540E\u7AEF\u6865\u63A5\uFF09\u4E0E Supabase\uFF08\u6D4F\u89C8\u5668\u539F\u751F REST\uFF09\u7EDF\u4E00\u4E00\u5904\uFF1B\u8868\u6D4F\u89C8\u3001SQL/\u8FC7\u6EE4\u67E5\u8BE2\u3001\u5168 CRUD \u8D70\u9884\u89C8-\u786E\u8BA4-\u6267\u884C\u3002" }
    });
    registerView({
      id: "ai",
      label: "AI",
      icon: "\u2726",
      init: initAiTool,
      card: { name: "AI \u52A9\u624B", icon: "\u2726", accent: "var(--m-patch)", desc: "\u63A5\u5165 OpenAI \u534F\u8BAE AI\uFF0C\u5206\u6790 API \u9519\u8BEF\u3001\u4F18\u5316 SQL\u3001\u751F\u6210\u67E5\u8BE2\uFF0C\u6D6E\u7A97\u968F\u65F6\u5524\u51FA\u3002" }
    });
    setApiPanelMode(true);
    setDbPanelMode(true);
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
