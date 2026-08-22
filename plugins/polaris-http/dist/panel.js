import{useEffect as Ft,useRef as it}from"react";var Ee=`/* polaris-http \u2014 RELAY \u8BBE\u8BA1\u7CFB\u7EDF\uFF08\u73CA\u745A\u6A59\u54C1\u724C + \u7CBE\u5BC6\u4EEA\u8868\u98CE\u683C\uFF09 */
.polaris-http-panel {
  --bg: #16181e; --bg-2: #1a1c24;
  --surface: #1e2028; --surface-2: #252830; --surface-3: #2c2f3a;
  --line: rgba(255,255,255,.10); --line-2: rgba(255,255,255,.18);
  --ink: #d8dae2; --dim: #a8acba; --dimmer: #6e7282;
  --brand: #ff7a59; --brand-hi: #ff926f; --brand-ink: #1c0c06;
  --brand-soft: rgba(255,122,89,.14);
  --brand-line: rgba(255,122,89,.4);
  --m-get: #3fb950; --m-post: #4493f8; --m-put: #d29922; --m-patch: #a371f7; --m-del: #f85149; --m-other: #8b949e;
  --ok: #3fb950; --warn: #d29922; --err: #f85149;
  --j-key: #79c0ff; --j-str: #a5d6a4; --j-num: #ffab70; --j-bool: #d2a8ff; --j-null: #8b949e;
  --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  --disp: 'Bricolage Grotesque', 'JetBrains Mono', system-ui, sans-serif;
  --r: 7px; --r-sm: 5px;
  font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  background: var(--bg); color: var(--ink);
}
.polaris-http-panel * { margin: 0; padding: 0; box-sizing: border-box; }
.polaris-http-panel::before {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(120% 60% at 80% -10%, rgba(255,122,89,.08), transparent 60%),
              radial-gradient(80% 50% at 0% 100%, rgba(68,147,248,.07), transparent 60%),
              var(--bg);
}
.polaris-http-panel::after {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: .45;
  background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
  background-size: 46px 46px;
}
.polaris-http-panel > * { position: relative; z-index: 1; }
.polaris-http-panel ::selection { background: var(--brand); color: var(--brand-ink); }
.polaris-http-panel ::-webkit-scrollbar { width: 10px; height: 10px; }
.polaris-http-panel ::-webkit-scrollbar-track { background: transparent; }
.polaris-http-panel ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
.polaris-http-panel ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.16); background-clip: padding-box; }
.polaris-http-panel button, .polaris-http-panel input, .polaris-http-panel select, .polaris-http-panel textarea { font-family: inherit; font-size: inherit; color: inherit; background: none; border: none; outline: none; }
.polaris-http-panel button { cursor: pointer; }
.polaris-http-panel input, .polaris-http-panel textarea { caret-color: var(--brand); }

/* ===== \u9876\u90E8\u680F ===== */
.polaris-http-panel .topbar {
  display: flex; align-items: center; gap: 14px; height: 42px; flex-shrink: 0;
  padding: 0 14px; border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,.03), transparent);
  backdrop-filter: blur(8px); position: relative; z-index: 50;
}
.polaris-http-panel .brand { display: flex; align-items: center; gap: 8px; font-family: var(--disp); font-weight: 800; font-size: 15px; color: var(--ink); letter-spacing: -.01em; }
.polaris-http-panel .brand .dot { width: 8px; height: 8px; border-radius: 2px; background: var(--brand); box-shadow: 0 0 12px var(--brand); transform: rotate(45deg); }
.polaris-http-panel .brand small { font-family: var(--mono); font-weight: 500; font-size: 9px; letter-spacing: .22em; color: var(--dimmer); }
.polaris-http-panel .tabbar { display: flex; align-items: center; gap: 2px; flex: 1; overflow-x: auto; min-width: 0; }
.polaris-http-panel .tabbar::-webkit-scrollbar { height: 0; }
.polaris-http-panel .rtab {
  display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 13px;
  border-radius: var(--r-sm); font-size: 12px; color: var(--dim);
  border: 1px solid transparent; cursor: pointer; transition: .14s; letter-spacing: .01em;
}
.polaris-http-panel .rtab:hover { color: var(--ink); background: var(--surface-2); }
.polaris-http-panel .rtab.active { color: var(--brand); background: var(--surface-2); border-color: var(--line-2); }
.polaris-http-panel .rtab .tm { font-weight: 700; font-size: 10px; }
.polaris-http-panel .rtab .dirty { color: var(--warn); font-size: 8px; }
.polaris-http-panel .rtab .tx { border: none; background: none; color: var(--dimmer); cursor: pointer; font-size: 14px; padding: 0 2px; border-radius: 3px; display: flex; align-items: center; }
.polaris-http-panel .rtab .tx:hover { color: var(--err); }
.polaris-http-panel .tab-add { color: var(--dim); font-size: 16px; padding: 4px 8px; cursor: pointer; flex-shrink: 0; border: none; background: transparent; display: flex; align-items: center; }
.polaris-http-panel .tab-add:hover { color: var(--brand); }
.polaris-http-panel .spacer { flex: 1; }
.polaris-http-panel .sp { flex: 1; }

/* \u73AF\u5883\u9009\u62E9 */
.polaris-http-panel .env-wrap { position: relative; }
.polaris-http-panel .env-sel {
  display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px;
  border-radius: var(--r-sm); border: 1px solid var(--line); font-size: 11.5px;
  color: var(--dim); cursor: pointer; background: var(--surface); position: relative;
}
.polaris-http-panel .env-sel:hover { border-color: var(--line-2); }
.polaris-http-panel .env-sel .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); flex-shrink: 0; }
.polaris-http-panel .env-sel .car { font-size: 9px; color: var(--dimmer); }
.polaris-http-panel .env-menu {
  position: absolute; top: 100%; right: 0; z-index: 200; min-width: 220px;
  background: var(--surface-2); border: 1px solid var(--line-2); border-radius: var(--r);
  box-shadow: 0 8px 24px rgba(0,0,0,.5); padding: 4px; margin-top: 4px; display: none;
}
.polaris-http-panel .env-menu.open { display: block; }
.polaris-http-panel .env-item { display: block; width: 100%; text-align: left; padding: 6px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; color: var(--dim); border: none; background: transparent; }
.polaris-http-panel .env-item:hover { background: var(--surface-3); color: var(--ink); }
.polaris-http-panel .env-item.on { color: var(--brand); font-weight: 600; }
.polaris-http-panel .env-item small { display: block; font-size: 9px; color: var(--dimmer); }
.polaris-http-panel .env-item.manage { border-top: 1px solid var(--line); margin-top: 4px; color: var(--brand); }

.polaris-http-panel .top-act {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px;
  border-radius: var(--r-sm); border: 1px solid var(--line); font-size: 11px;
  color: var(--dim); cursor: pointer; background: transparent; white-space: nowrap; transition: .12s;
}
.polaris-http-panel .top-act:hover { color: var(--ink); border-color: var(--line-2); background: var(--surface); }

/* ===== \u4E3B\u533A\u57DF ===== */
.polaris-http-panel .main { display: flex; flex: 1; min-height: 0; min-width: 0; }
.polaris-http-panel .side {
  width: 210px; flex-shrink: 0; display: flex; flex-direction: column;
  background: var(--bg-2); border-right: 1px solid var(--line); overflow: hidden;
}
.polaris-http-panel .side-head { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.polaris-http-panel .side-head .t { flex: 1; font-size: 10px; color: var(--dimmer); letter-spacing: .06em; }
.polaris-http-panel .mini-btn { height: 22px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface); color: var(--dim); border-radius: 4px; cursor: pointer; font-size: 11px; }
.polaris-http-panel .mini-btn:hover { color: var(--ink); border-color: var(--line-2); }
.polaris-http-panel .side-search { padding: 8px 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.polaris-http-panel .side-search input { width: 100%; height: 28px; padding: 0 8px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--ink); font-size: 12px; }
.polaris-http-panel .side-search input:focus { border-color: var(--brand-line); }
.polaris-http-panel .tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.polaris-http-panel .tree-empty { padding: 12px; color: var(--dimmer); font-size: 11px; text-align: center; }
.polaris-http-panel .group { margin-bottom: 1px; }
.polaris-http-panel .group-head { display: flex; align-items: center; gap: 4px; padding: 6px 10px; cursor: pointer; color: var(--dim); font-size: 11px; user-select: none; }
.polaris-http-panel .group-head:hover { background: var(--surface); color: var(--ink); }
.polaris-http-panel .group-head .caret { font-size: 9px; color: var(--dimmer); transition: transform .15s; }
.polaris-http-panel .group.collapsed .caret { transform: rotate(-90deg); }
.polaris-http-panel .group-head .gname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel .group-head .gcount { font-size: 10px; color: var(--dimmer); }
.polaris-http-panel .group.collapsed .reqs { display: none; }
.polaris-http-panel .req-item { display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 22px; cursor: pointer; color: var(--dim); font-size: 11px; }
.polaris-http-panel .req-item:hover { background: var(--surface); color: var(--ink); }
.polaris-http-panel .req-item.active { background: var(--brand-soft); color: var(--ink); }
.polaris-http-panel .req-item .mb { font-size: 9px; font-weight: 700; letter-spacing: .3px; min-width: 36px; }
.polaris-http-panel .req-item .rn { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel .work { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

/* ===== \u6A21\u5F0F\u5207\u6362\u680F ===== */
.polaris-http-panel .mode-bar {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  padding: 5px 10px; border-bottom: 1px solid var(--line); background: var(--bg-2);
}
.polaris-http-panel .mode-btn {
  height: 24px; padding: 0 12px; border: 1px solid var(--line); background: transparent;
  color: var(--dim); cursor: pointer; font-size: 10.5px; border-radius: var(--r-sm);
}
.polaris-http-panel .mode-btn:hover { color: var(--ink); background: var(--surface); }
.polaris-http-panel .mode-btn.active { color: var(--brand); border-color: var(--brand); background: rgba(255,122,89,.1); }
.polaris-http-panel .mode-lbl { font-size: 10px; color: var(--dimmer); white-space: nowrap; }
.polaris-http-panel .mode-select {
  height: 24px; padding: 0 8px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); color: var(--dim); font-size: 10.5px; max-width: 260px;
}
.polaris-http-panel .server-badge {
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 3px 8px; border-radius: 4px; background: rgba(68,147,248,.1);
  border: 1px solid rgba(68,147,248,.2); font-size: 10px; color: var(--m-post);
}

/* ===== \u8BF7\u6C42\u680F ===== */
.polaris-http-panel .reqbar {
  display: flex; align-items: center; gap: 6px; padding: 8px 10px;
  background: var(--bg-2); border-bottom: 1px solid var(--line); flex-shrink: 0;
}
.polaris-http-panel .method-wrap { position: relative; flex-shrink: 0; }
.polaris-http-panel .method-sel {
  display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 4px;
  border: 1px solid var(--line); font-weight: 700; font-size: 11px; min-width: 74px;
  cursor: pointer; background: transparent;
}
.polaris-http-panel .method-sel:hover { border-color: var(--line-2); background: var(--surface); }
.polaris-http-panel .method-sel .car { font-size: 9px; color: var(--dimmer); margin-left: 2px; }
.polaris-http-panel .method-menu {
  position: absolute; top: 100%; left: 0; z-index: 200; min-width: 100px;
  background: var(--surface-2); border: 1px solid var(--line-2); border-radius: var(--r);
  box-shadow: 0 8px 24px rgba(0,0,0,.5); padding: 4px; margin-top: 2px; display: none;
}
.polaris-http-panel .method-menu.open { display: block; }
.polaris-http-panel .method-menu button { display: block; width: 100%; padding: 5px 10px; border: none; background: none; text-align: left; cursor: pointer; border-radius: 4px; font-weight: 700; font-size: 11px; }
.polaris-http-panel .method-menu button:hover { background: var(--surface-3); }
.polaris-http-panel .url-wrap { flex: 1; position: relative; min-width: 0; }
.polaris-http-panel .url-input {
  width: 100%; height: 30px; padding: 0 10px; border-radius: 4px;
  border: 1px solid var(--line); background: var(--surface); font-size: 12px; color: var(--ink);
}
.polaris-http-panel .url-input:focus { border-color: var(--brand); }
.polaris-http-panel .url-resolved { display: none; margin-top: 2px; font-size: 10px; color: var(--dimmer); }
.polaris-http-panel .url-resolved b { color: var(--ok); }

.polaris-http-panel .btn {
  display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 14px;
  border-radius: 4px; border: 1px solid var(--line); font-size: 11.5px; color: var(--dim);
  cursor: pointer; background: transparent; white-space: nowrap; transition: .12s;
}
.polaris-http-panel .btn:hover { color: var(--ink); border-color: var(--line-2); background: var(--surface); }
.polaris-http-panel .btn.primary { color: var(--brand-ink); background: var(--brand); border-color: var(--brand); font-weight: 600; }
.polaris-http-panel .btn.primary:hover { background: var(--brand-hi); }
.polaris-http-panel .btn.primary:disabled { opacity: .7; pointer-events: none; }
.polaris-http-panel .btn.icon { padding: 0 10px; font-size: 12px; }
.polaris-http-panel .btn.ghost { background: transparent; }
.polaris-http-panel .btn.danger { color: var(--err); border-color: var(--line-2); }
.polaris-http-panel .btn.danger:hover { background: rgba(248,81,73,.1); }
.polaris-http-panel .btn .k { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); margin-left: 4px; }
.polaris-http-panel .btn.primary .k { color: rgba(255,255,255,.75); }

/* ===== \u5B9A\u5236\u6A21\u677F\u9762\u677F ===== */
.polaris-http-panel .custom-panel { border-bottom: 1px solid var(--line); background: var(--bg-2); flex-shrink: 0; }
.polaris-http-panel .custom-bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; }
.polaris-http-panel .template-form { border-top: 1px dashed var(--line); padding: 8px 10px; }
.polaris-http-panel .tf-title { font-size: 10px; color: var(--dimmer); margin-bottom: 6px; letter-spacing: .04em; }
.polaris-http-panel .tf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-height: 200px; overflow: auto; }
.polaris-http-panel .tf-field { margin-bottom: 4px; }
.polaris-http-panel .tf-field label { display: block; font-size: 10px; color: var(--dim); margin-bottom: 2px; }
.polaris-http-panel .tf-field .tf-req { color: var(--err); }
.polaris-http-panel .tf-field .tf-extra { color: var(--warn); font-size: 9px; }
.polaris-http-panel .tf-field input, .polaris-http-panel .tf-field textarea {
  width: 100%; padding: 4px 6px; border-radius: 3px; border: 1px solid var(--line);
  background: var(--bg); color: var(--ink); font-size: 11px; outline: none;
}
.polaris-http-panel .tf-field input:focus, .polaris-http-panel .tf-field textarea:focus { border-color: var(--brand-line); }
.polaris-http-panel .tf-field textarea { min-height: 36px; resize: vertical; }
.polaris-http-panel .custom-hint { padding: 4px 10px; font-size: 10px; color: var(--brand); background: rgba(255,122,89,.1); border-top: 1px solid var(--brand-line); }

/* ===== \u5185\u8054\u4EE3\u7801\u751F\u6210 ===== */
.polaris-http-panel .codegen-inline { border-bottom: 1px solid var(--line); background: var(--bg-2); flex-shrink: 0; }
.polaris-http-panel .codegen-hd { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-bottom: 1px solid var(--line); font-size: 11px; }
.polaris-http-panel .codegen-langs { display: flex; gap: 3px; }
.polaris-http-panel .lang-btn { height: 22px; padding: 0 8px; border: 1px solid var(--line); background: transparent; color: var(--dim); cursor: pointer; font-size: 10px; border-radius: 3px; }
.polaris-http-panel .lang-btn:hover { color: var(--ink); border-color: var(--line-2); }
.polaris-http-panel .lang-btn.active { color: var(--brand); border-color: var(--brand); background: rgba(255,122,89,.1); }
.polaris-http-panel .codegen-bd { position: relative; }
.polaris-http-panel .codegen-bd pre { padding: 10px; margin: 0; font-family: var(--mono); font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow: auto; color: var(--ink); }
.polaris-http-panel .codegen-copy { position: absolute; top: 6px; right: 6px; font-size: 10px; padding: 2px 8px; border-radius: 3px; border: 1px solid var(--line); cursor: pointer; color: var(--dimmer); background: var(--surface-2); }
.polaris-http-panel .codegen-copy:hover { color: var(--ink); }

/* ===== split \u5BB9\u5668 ===== */
.polaris-http-panel .split { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; position: relative; }
.polaris-http-panel .split.h { flex-direction: row; }
.polaris-http-panel .split .req-region { flex: 0 0 auto; height: var(--reqH, 220px); display: flex; flex-direction: column; min-height: 0; border-bottom: 1px solid var(--line); }
.polaris-http-panel .split.h .req-region { height: auto; width: var(--reqW, 480px); border-bottom: none; border-right: 1px solid var(--line); }
.polaris-http-panel .split .res-region { display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }
.polaris-http-panel .split.h .res-region { flex: 1; }
.polaris-http-panel .divider { flex: 0 0 6px; background: var(--surface-2); cursor: row-resize; flex-shrink: 0; position: relative; transition: .1s; }
.polaris-http-panel .divider::after { content: '\u22EF'; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); color: var(--dimmer); font-size: 10px; opacity: 0; transition: .1s; }
.polaris-http-panel .divider:hover::after { opacity: 1; }
.polaris-http-panel .divider:hover { background: var(--brand); }
.polaris-http-panel .split.h .divider { flex: 0 0 6px; width: 6px; cursor: col-resize; }

/* \u5B50\u6807\u7B7E\u9875 */
.polaris-http-panel .subtabs { display: flex; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.polaris-http-panel .subtab { padding: 5px 12px; font-size: 11px; color: var(--dim); border-bottom: 2px solid transparent; cursor: pointer; display: flex; align-items: center; gap: 4px; background: transparent; border-top: none; border-left: none; border-right: none; }
.polaris-http-panel .subtab:hover { color: var(--ink); }
.polaris-http-panel .subtab.active { color: var(--brand); border-bottom-color: var(--brand); }
.polaris-http-panel .pane { flex: 1; overflow: auto; min-height: 0; position: relative; }

/* ===== KV \u884C ===== */
.polaris-http-panel .kv { font-size: 11px; }
.polaris-http-panel .kv table { width: 100%; border-collapse: collapse; }
.polaris-http-panel .kv th { text-align: left; font-size: 10px; font-weight: 500; color: var(--dimmer); padding: 3px 6px; border-bottom: 1px solid var(--line); text-transform: uppercase; letter-spacing: .06em; }
.polaris-http-panel .kv td { padding: 2px 4px; border-bottom: 1px solid rgba(255,255,255,.04); }
.polaris-http-panel .kv input[type=text] { width: 100%; padding: 4px 6px; border-radius: 3px; background: transparent; border: none; color: var(--ink); font-size: 11px; outline: none; }
.polaris-http-panel .kv input[type=text]:focus { background: var(--surface); }
.polaris-http-panel .kv input[type=checkbox] { accent-color: var(--brand); }
.polaris-http-panel .kv-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.polaris-http-panel .kv-row.blank input { background: transparent; }
.polaris-http-panel .kv-row label.ck { display: flex; align-items: center; width: 16px; flex-shrink: 0; }
.polaris-http-panel .kv-row input.k, .polaris-http-panel .kv-row input.v {
  height: 26px; padding: 0 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; color: var(--ink); font-size: 11px; outline: none;
}
.polaris-http-panel .kv-row input.k { width: 38%; font-family: var(--mono); }
.polaris-http-panel .kv-row input.v { flex: 1; font-family: var(--mono); }
.polaris-http-panel .kv-row input:focus { border-color: var(--brand-line); }
.polaris-http-panel .kv-row .rm { width: 22px; height: 22px; border: none; background: none; color: var(--dimmer); cursor: pointer; border-radius: 4px; font-size: 12px; flex-shrink: 0; }
.polaris-http-panel .kv-row .rm:hover { color: var(--err); background: rgba(248,81,73,.1); }
.polaris-http-panel .suggest { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
.polaris-http-panel .chip { font-size: 10px; padding: 3px 8px; border-radius: 10px; border: 1px solid var(--line); color: var(--dim); cursor: pointer; background: transparent; }
.polaris-http-panel .chip:hover { color: var(--ink); border-color: var(--line-2); background: var(--surface); }
.polaris-http-panel .kv-add { font-size: 11px; color: var(--brand); padding: 4px 0; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none; }
.polaris-http-panel .kv-x { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-size: 10px; color: var(--dimmer); cursor: pointer; border: none; background: transparent; opacity: 0; }
.polaris-http-panel tr:hover .kv-x { opacity: 1; }
.polaris-http-panel .kv-x:hover { color: var(--err); background: rgba(248,81,73,.1); }

/* ===== Body \u7F16\u8F91 ===== */
.polaris-http-panel .body-bar { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.polaris-http-panel .body-bar .seg { display: flex; gap: 2px; background: var(--surface); border-radius: 5px; padding: 2px; }
.polaris-http-panel .body-bar .seg button { height: 24px; padding: 0 10px; border: none; background: none; color: var(--dim); cursor: pointer; font-size: 11px; border-radius: 4px; }
.polaris-http-panel .body-bar .seg button.on { background: var(--brand); color: var(--brand-ink); font-weight: 600; }
.polaris-http-panel .body-bar button.tool { height: 24px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface); color: var(--dim); border-radius: 4px; cursor: pointer; font-size: 11px; }
.polaris-http-panel .body-bar button.tool:hover { color: var(--ink); border-color: var(--line-2); }
.polaris-http-panel .body-none { padding: 14px; text-align: center; color: var(--dimmer); font-size: 11px; }
.polaris-http-panel textarea.code { font-family: var(--mono); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; }

/* ===== Auth \u9762\u677F ===== */
.polaris-http-panel .auth-panel { padding: 8px 10px; }
.polaris-http-panel .auth-panel .seg { display: flex; gap: 2px; background: var(--surface); border-radius: 5px; padding: 2px; margin-bottom: 8px; }
.polaris-http-panel .auth-panel .seg button { height: 24px; padding: 0 10px; border: none; background: none; color: var(--dim); cursor: pointer; font-size: 11px; border-radius: 4px; }
.polaris-http-panel .auth-panel .seg button.on { background: var(--brand); color: var(--brand-ink); font-weight: 600; }
.polaris-http-panel .auth-field { margin-bottom: 6px; }
.polaris-http-panel .auth-field label { display: block; font-size: 10px; color: var(--dimmer); margin-bottom: 2px; }
.polaris-http-panel .auth-field input { width: 100%; height: 28px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 12px; outline: none; }
.polaris-http-panel .auth-field input:focus { border-color: var(--brand-line); }
.polaris-http-panel .auth-hint { font-size: 10px; color: var(--dimmer); padding: 4px 0; }
.polaris-http-panel .gh-hint { font-size: 10px; color: var(--dimmer); padding: 6px 8px; border-bottom: 1px dashed var(--line); }

/* ===== \u54CD\u5E94\u533A ===== */
.polaris-http-panel .res-status { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--line); font-size: 11px; flex-shrink: 0; }
.polaris-http-panel .status-chip { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.polaris-http-panel .status-chip .dotc { width: 8px; height: 8px; border-radius: 50%; }
.polaris-http-panel .status-chip.s2 { color: var(--ok); } .polaris-http-panel .status-chip.s2 .dotc { background: var(--ok); }
.polaris-http-panel .status-chip.s3 { color: var(--warn); } .polaris-http-panel .status-chip.s3 .dotc { background: var(--warn); }
.polaris-http-panel .status-chip.s4, .polaris-http-panel .status-chip.s5 { color: var(--err); } .polaris-http-panel .status-chip.s4 .dotc, .polaris-http-panel .status-chip.s5 .dotc { background: var(--err); }
.polaris-http-panel .res-meta { display: flex; gap: 14px; color: var(--dimmer); font-size: 10px; }
.polaris-http-panel .res-meta b { color: var(--dim); font-weight: 500; }
.polaris-http-panel .res-status .tool { height: 22px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface); color: var(--dim); border-radius: 4px; cursor: pointer; font-size: 10px; }
.polaris-http-panel .res-status .tool:hover { color: var(--ink); border-color: var(--line-2); }

/* \u54CD\u5E94\u53CC\u89C6\u56FE\u6807\u7B7E */
.polaris-http-panel .res-tabs { display: flex; align-items: center; border-bottom: 1px solid var(--line); flex-shrink: 0; padding: 0 10px; background: var(--bg-2); }
.polaris-http-panel .res-tab { height: 28px; padding: 0 12px; border: none; background: none; color: var(--dim); cursor: pointer; font-size: 11px; border-bottom: 2px solid transparent; }
.polaris-http-panel .res-tab:hover { color: var(--ink); }
.polaris-http-panel .res-tab.active { color: var(--brand); border-bottom-color: var(--brand); }
.polaris-http-panel .res-tab-acts { display: flex; align-items: center; gap: 4px; margin-left: auto; padding: 3px 0; }
.polaris-http-panel .res-tab-acts .tbtn { height: 20px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface); color: var(--dimmer); cursor: pointer; font-size: 10px; border-radius: 3px; }
.polaris-http-panel .res-tab-acts .tbtn:hover { color: var(--ink); border-color: var(--line-2); }
.polaris-http-panel .font-sel { height: 20px; padding: 0 4px; border-radius: 3px; border: 1px solid var(--line); background: var(--surface); color: var(--dim); font-size: 10px; }

/* \u54CD\u5E94\u5DE5\u5177\u680F */
.polaris-http-panel .res-toolbar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; flex-wrap: wrap; }
.polaris-http-panel .res-views { display: flex; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.polaris-http-panel .res-views .rv { padding: 3px 10px; font-size: 11px; color: var(--dim); border-right: 1px solid var(--line); cursor: pointer; background: transparent; }
.polaris-http-panel .res-views .rv:last-child { border-right: none; }
.polaris-http-panel .res-views .rv:hover { color: var(--ink); background: var(--surface); }
.polaris-http-panel .res-views .rv.active { color: var(--brand); background: rgba(255,122,89,.1); }
.polaris-http-panel .res-views .rv.disabled { opacity: .35; cursor: default; }
.polaris-http-panel .path-input, .polaris-http-panel .filter-input { height: 22px; padding: 0 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; color: var(--ink); font-size: 11px; font-family: var(--mono); min-width: 120px; flex: 1; max-width: 200px; }
.polaris-http-panel .path-input:focus, .polaris-http-panel .filter-input:focus { border-color: var(--brand-line); }
.polaris-http-panel .res-toolbar .tbtn { height: 22px; padding: 0 8px; border: 1px solid var(--line); background: var(--surface); color: var(--dimmer); cursor: pointer; font-size: 10px; border-radius: 3px; }
.polaris-http-panel .res-toolbar .tbtn:hover { color: var(--ink); border-color: var(--line-2); }
.polaris-http-panel .res-idle { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 100%; color: var(--dimmer); text-align: center; padding: 20px; }
.polaris-http-panel .res-idle .big { font-size: 18px; font-weight: 700; color: var(--dim); letter-spacing: 1px; }
.polaris-http-panel .res-idle .tips { font-size: 11px; line-height: 1.9; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 16px; }
.polaris-http-panel .res-idle .tips b { color: var(--brand); }
.polaris-http-panel .res-loading { display: flex; align-items: center; justify-content: center; gap: 10px; height: 100%; color: var(--dim); }
.polaris-http-panel .spin { width: 16px; height: 16px; border: 2px solid var(--line-2); border-top-color: var(--brand); border-radius: 50%; animation: pspin .7s linear infinite; }
@keyframes pspin { to { transform: rotate(360deg); } }
.polaris-http-panel .res-err { display: flex; flex-direction: column; gap: 6px; padding: 20px; color: var(--err); font-size: 12px; }
.polaris-http-panel .res-err .ti { font-weight: 700; font-size: 14px; }
.polaris-http-panel .res-empty { padding: 16px; color: var(--dimmer); font-size: 11px; }
.polaris-http-panel .raw-view { padding: 10px 12px; font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; word-break: break-all; }
.polaris-http-panel .prev-frame { width: 100%; height: 100%; border: none; background: #fff; }
.polaris-http-panel .prev-img-wrap { display: flex; align-items: center; justify-content: center; height: 100%; padding: 12px; }
.polaris-http-panel .prev-img-wrap img { max-width: 100%; max-height: 100%; border-radius: 6px; }
.polaris-http-panel .prev-none { padding: 20px; color: var(--dimmer); text-align: center; }

/* ===== JSON \u6811 ===== */
.polaris-http-panel .jt { font-family: var(--mono); font-size: 12px; line-height: 1.8; }
.polaris-http-panel .jt-row { padding: 1px 0; display: flex; align-items: center; gap: 4px; }
.polaris-http-panel .jt-row:hover { background: var(--surface); border-radius: 4px; }
.polaris-http-panel .jt-k { color: var(--j-key); }
.polaris-http-panel .jt-str { color: var(--j-str); }
.polaris-http-panel .jt-num { color: var(--j-num); }
.polaris-http-panel .jt-bool { color: var(--j-bool); }
.polaris-http-panel .jt-null { color: var(--j-null); font-style: italic; }
.polaris-http-panel .jt-tog { cursor: pointer; color: var(--dimmer); user-select: none; }
.polaris-http-panel .jt-children { padding-left: 18px; border-left: 1px solid var(--line); margin-left: 4px; }
.polaris-http-panel .jt-key { color: var(--ink-2); white-space: nowrap; }
.polaris-http-panel .jt-mark { background: var(--warn); color: #000; border-radius: 2px; padding: 0 2px; }
.polaris-http-panel .jt-node { margin-left: 14px; }
.polaris-http-panel .jt-row.expandable { cursor: pointer; }
.polaris-http-panel .jt-prev { color: var(--dimmer); font-size: 10px; }

/* \u8868\u683C\u89C6\u56FE */
.polaris-http-panel .tbl-wrap { overflow: auto; }
.polaris-http-panel table.dt { width: 100%; border-collapse: collapse; font-size: 11px; }
.polaris-http-panel table.dt th { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line-2); color: var(--dim); font-size: 10px; font-weight: 500; position: sticky; top: 0; background: var(--bg); white-space: nowrap; user-select: none; }
.polaris-http-panel table.dt th.sortable { cursor: pointer; }
.polaris-http-panel table.dt th.sortable:hover { color: var(--ink); }
.polaris-http-panel table.dt td { padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,.05); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel table.dt tr:hover td { background: var(--surface); }
.polaris-http-panel .idx { color: var(--dimmer); font-size: 10px; width: 36px; text-align: right; }
.polaris-http-panel .tbl-note { font-size: 10px; color: var(--dimmer); padding: 6px 0; }

/* ===== \u72B6\u6001\u680F ===== */
.polaris-http-panel .statusbar { display: flex; align-items: center; height: 24px; padding: 0 10px; border-top: 1px solid var(--line); font-size: 10px; color: var(--dimmer); flex-shrink: 0; }
.polaris-http-panel .statusbar .msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel .statusbar .msg.ok { color: var(--ok); }
.polaris-http-panel .statusbar .msg.err { color: var(--err); }
.polaris-http-panel .statusbar .msg.warn { color: var(--warn); }
.polaris-http-panel .statusbar .seg-r { display: flex; gap: 12px; }
.polaris-http-panel .statusbar .seg-r span { white-space: nowrap; }
.polaris-http-panel .statusbar .seg-r b { color: var(--dim); }

/* ===== \u6A21\u6001\u6846 ===== */
.polaris-http-panel .modal-bg { display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.5); align-items: center; justify-content: center; }
.polaris-http-panel .modal-bg.open { display: flex; }
.polaris-http-panel .modal { width: 420px; max-width: 92vw; max-height: 82vh; overflow: auto; background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: 0 16px 48px rgba(0,0,0,.55); padding: 16px; }
.polaris-http-panel .modal.wide { width: 560px; }
.polaris-http-panel .modal h3 { font-size: 15px; color: var(--ink); margin-bottom: 4px; }
.polaris-http-panel .modal .sub { font-size: 12px; color: var(--dimmer); margin-bottom: 12px; line-height: 1.6; }
.polaris-http-panel .modal .field { margin-bottom: 10px; }
.polaris-http-panel .modal .field label { display: block; font-size: 11px; color: var(--dimmer); margin-bottom: 4px; }
.polaris-http-panel .modal .field input, .polaris-http-panel .modal .field select { width: 100%; height: 28px; padding: 0 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 5px; color: var(--ink); font-size: 12px; }
.polaris-http-panel .modal .field input:focus, .polaris-http-panel .modal .field select:focus { border-color: var(--brand-line); }
.polaris-http-panel .modal .field textarea.curl-ta { width: 100%; height: 100px; min-height: 80px; padding: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 5px; color: var(--ink); font-size: 12px; font-family: var(--mono); resize: vertical; }
.polaris-http-panel .modal .acts { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.polaris-http-panel .modal .acts .btn { height: 28px; padding: 0 14px; font-size: 12px; }
.polaris-http-panel .modal .acts .btn.primary { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }

/* env tabs */
.polaris-http-panel .env-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.polaris-http-panel .env-tab { height: 24px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface); color: var(--dim); border-radius: 5px; cursor: pointer; font-size: 11px; }
.polaris-http-panel .env-tab.on { border-color: var(--brand-line); background: rgba(255,122,89,.1); color: var(--brand); }
.polaris-http-panel .env-tab.add { border-style: dashed; color: var(--dimmer); }
.polaris-http-panel .env-tab.add:hover { color: var(--brand); }
.polaris-http-panel .env-vars { max-height: 180px; overflow-y: auto; }

/* ===== Toast / \u53F3\u952E\u83DC\u5355 / \u63D0\u793A ===== */
.polaris-http-panel .toast { display: none; position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 14px; font-size: 11px; color: var(--ink); z-index: 5000; box-shadow: 0 4px 12px rgba(0,0,0,.4); }
.polaris-http-panel .toast.show { display: block; animation: ftshow .15s ease; }
@keyframes ftshow { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
.polaris-http-panel .ctx-menu { display: none; position: fixed; z-index: 9999; min-width: 120px; background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.5); padding: 4px; font-size: 11px; }
.polaris-http-panel .ctx-menu .ctx-item { display: block; width: 100%; padding: 5px 12px; border-radius: 4px; cursor: pointer; color: var(--dim); border: none; background: transparent; text-align: left; }
.polaris-http-panel .ctx-menu .ctx-item:hover { background: var(--surface-3); color: var(--ink); }
.polaris-http-panel .ctx-menu .ctx-sep { height: 1px; background: var(--line); margin: 3px 0; }
.polaris-http-panel .cell-tip { display: none; position: fixed; z-index: 9000; max-width: 320px; padding: 5px 8px; background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 4px; font-size: 10px; color: var(--ink); box-shadow: 0 4px 12px rgba(0,0,0,.4); pointer-events: none; }

/* \u670D\u52A1\u5668\u7BA1\u7406 */
.polaris-http-panel .srv-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid var(--line); }
.polaris-http-panel .srv-input { height: 26px; padding: 0 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; color: var(--ink); font-size: 11px; outline: none; }
.polaris-http-panel .srv-input:focus { border-color: var(--brand-line); }`;var pe=document;function de(e){pe=e||document}function h(e,t){return(t||pe).querySelector(e)}function _(e,t){return(t||pe).querySelectorAll(e)}function O(){return"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}function k(e){if(e==null)return"";let t=document.createElement("div");return t.textContent=String(e),t.innerHTML}function d(e,t,n){let a=document.createElement(e);return t&&(a.className=t),n!=null&&(a.innerHTML=n),a}var ze=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"],lt={GET:"#3fb950",POST:"#4493f8",PUT:"#d29922",PATCH:"#a371f7",DELETE:"#f85149",HEAD:"#8b949e",OPTIONS:"#8b949e"};function ee(e){return lt[e]||"#8b949e"}function ce(e){return e==null?"\u2014":e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB"}function ue(e){return e==null?"\u2014":e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s"}function S(e,t){let n=h("#statusMsg");n&&(n.textContent=e,n.className=t?"msg "+t:"msg")}function re(e,t){navigator.clipboard.writeText(e).then(()=>{S(t||"\u5DF2\u590D\u5236","ok")}).catch(()=>{})}var C=()=>({id:O(),enabled:!0,key:"",value:""});function X(e,t){let n=d("div","kv");function a(){(!e.length||e[e.length-1].key||e[e.length-1].value)&&e.push(C())}function r(){n.innerHTML="",a(),e.forEach((o,s)=>{let l=d("div","kv-row"+(!o.key&&!o.value?" blank":"")),p=d("input");p.type="checkbox",p.checked=o.enabled!==!1,p.onchange=()=>{o.enabled=p.checked,t.onChange?.()};let c=d("input","k");c.type="text",c.placeholder=t.kPlace||"Key",c.value=o.key||"",c.spellcheck=!1;let v=d("input","v");v.type="text",v.placeholder=t.vPlace||"Value",v.value=o.value||"",v.spellcheck=!1;let f=()=>{if(o.key=c.value,o.value=v.value,l.classList.toggle("blank",!o.key&&!o.value),(o.key||o.value)&&s===e.length-1){e.push(C()),r(),t.onChange?.();return}t.onChange?.()};c.addEventListener("input",f),v.addEventListener("input",f);let i=d("button","rm","\u2715");i.onclick=()=>{e.splice(s,1),r(),t.onChange?.()};let u=d("label","ck");u.appendChild(p),l.append(u,c,v,i),n.appendChild(l)})}return r(),n}var _e={tabs:"polaris.http.tabs.v2",collections:"polaris.http.collections.v2",envs:"polaris.http.envs.v2",ui:"polaris.http.ui.v2",history:"polaris.http.history.v2",templates:"polaris.http.templates.v2",globalHeaders:"polaris.http.globalHeaders.v2",servers:"polaris.http.servers.v2"},B=e=>e===void 0?void 0:JSON.parse(JSON.stringify(e)),he=class{constructor(){this._listeners={},this._data={},this._loadAll()}_loadAll(){for(let[t,n]of Object.entries(_e))try{let a=localStorage.getItem(n);this._data[t]=a?JSON.parse(a):void 0}catch{this._data[t]=void 0}}get(t){return B(this._data[t])}set(t,n){this._data[t]=B(n);try{localStorage.setItem(_e[t],JSON.stringify(this._data[t]))}catch{}this._emit(t,B(n))}update(t,n){let a=this._data[t];a&&typeof a=="object"?this.set(t,{...a,...n}):this.set(t,n)}subscribe(t,n){return(this._listeners[t]||=[]).push(n),()=>{let a=this._listeners[t];a&&(this._listeners[t]=a.filter(r=>r!==n))}}_emit(t,n){(this._listeners[t]||[]).forEach(a=>{try{a(n)}catch(r){console.error("[polaris-http store]",r)}})}},be=new he;function Me(e){try{return{ok:!0,value:JSON.parse(e)}}catch{return{ok:!1}}}function He(e){return e==null?"\u2014":e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB"}function Ae(e){return e==null?"\u2014":e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s"}function P(e,t){return e==null||String(e).indexOf("{{")<0?e:String(e).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g,(n,a)=>{if(a.startsWith("$"))return pt(a);if(!t)return n;if(a==="baseUrl")return t.baseUrl||"";let r=(t.vars||[]).find(o=>o.enabled!==!1&&o.key===a);return r?r.value:n})}function pt(e){switch(e){case"$guid":case"$uuid":return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,t=>(t==="x"?Math.random()*16|0:Math.random()*16|0|8).toString(16));case"$timestamp":return String(Math.floor(Date.now()/1e3));case"$timestampMs":return String(Date.now());case"$isoTimestamp":return new Date().toISOString();case"$randomInt":return String(Math.floor(Math.random()*1e4));case"$randomFloat":return String(Math.random().toFixed(4));case"$localDate":return new Date().toISOString().slice(0,10);case"$localTime":return new Date().toTimeString().slice(0,8);default:return"{{"+e+"}}"}}function Be(e){let t=dt(e.trim());t[0]==="curl"&&t.shift();let n=[],a=null,r="",o=[],s=!1;for(let u=0;u<t.length;u++){let m=t[u],w=()=>t[++u]||"";if(m==="-X"||m==="--request")a=w()||"GET";else if(m.startsWith("-X")&&m.length>2)a=m.slice(2);else if(m==="-H"||m==="--header")Ue(n,w());else if(m.startsWith("-H")&&m.length>2)Ue(n,m.slice(2));else if(["-d","--data","--data-raw","--data-ascii","--data-binary","--data-urlencode"].includes(m))o.push(w());else if(m.startsWith("-d")&&m.length>2)o.push(m.slice(2));else if(m==="-u"||m==="--user")try{n.push({id:G(),enabled:!0,key:"Authorization",value:"Basic "+btoa(w())})}catch{}else m==="-b"||m==="--cookie"?n.push({id:G(),enabled:!0,key:"Cookie",value:w()}):m==="-A"||m==="--user-agent"?n.push({id:G(),enabled:!0,key:"User-Agent",value:w()}):m==="-e"||m==="--referer"?n.push({id:G(),enabled:!0,key:"Referer",value:w()}):m==="-G"||m==="--get"?s=!0:m==="--url"?r=w():["--compressed","-L","--location","-k","--insecure","-s","--silent","-S","--show-error","-i","--include","-v","--verbose","-f","--fail","-#","--progress-bar","-N","--no-buffer"].includes(m)||m.startsWith("-")||r||(r=m)}a||(a=o.length&&!s?"POST":"GET"),a=a.toUpperCase();let l=o.join("&");s&&l&&(r+=(r.includes("?")?"&":"?")+l,l="");let p=n.find(u=>u.key.toLowerCase()==="content-type"),c="none";if(l&&(p&&/json/i.test(p.value)||/^\s*[\[{]/.test(l)?c="json":c="text"),c==="json")try{l=JSON.stringify(JSON.parse(l),null,2)}catch{}let v=[],f=r,i=r.indexOf("?");return i>=0&&(f=r.slice(0,i),r.slice(i+1).split("&").forEach(u=>{if(!u)return;let m=u.indexOf("=");v.push({id:G(),enabled:!0,key:decodeURIComponent(m>=0?u.slice(0,m):u),value:decodeURIComponent(m>=0?u.slice(m+1):"")})})),v.push({id:G(),enabled:!0,key:"",value:""}),{method:a,url:f,headers:n,params:v,body:l,bodyType:c}}function dt(e){e=e.replace(/\\\r?\n/g," ");let t=[],n="",a=null,r=!1;for(let o=0;o<e.length;o++){let s=e[o];a?s===a?a=null:s==="\\"&&a==='"'?n+=e[++o]||"":n+=s:s==='"'||s==="'"?(a=s,r=!0):s===" "||s==="	"||s===`
`||s==="\r"?r&&(t.push(n),n="",r=!1):(n+=s,r=!0)}return r&&t.push(n),t}function Ue(e,t){let n=t.indexOf(":");if(n<0){e.push({id:G(),enabled:!0,key:t.trim(),value:""});return}e.push({id:G(),enabled:!0,key:t.slice(0,n).trim(),value:t.slice(n+1).trim()})}function G(){return"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}function fe(e,t){let n=p=>t?resolveVars(p,t):p,a=p=>"'"+String(p).replace(/'/g,"'\\''")+"'",r=n(e.url||"");/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(r)||(r="https://"+r);let o=["curl -X "+e.method+" "+a(r)],s={};e.headers&&e.headers.filter(p=>p.enabled!==!1&&p.key).forEach(p=>s[n(p.key)]=n(p.value));let l=null;return["GET","HEAD"].includes(e.method)||(e.bodyType==="json"?(l=n(e.body||""),Object.keys(s).some(p=>p.toLowerCase()==="content-type")||(s["Content-Type"]="application/json")):e.bodyType==="text"?l=n(e.body||""):e.bodyType==="form"&&Array.isArray(e.formBody)&&(l=e.formBody.filter(p=>p.enabled!==!1&&p.key).map(p=>encodeURIComponent(n(p.key))+"="+encodeURIComponent(n(p.value||""))).join("&"))),Object.entries(s).forEach(([p,c])=>o.push("-H "+a(p+": "+c))),l&&o.push("--data-raw "+a(l)),o.join(` \\
  `)}function Pe(e,t,n){let a=c=>n?resolveVars(c,n):c,r=a(e.url||"");/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(r)||(r="https://"+r);let o={};e.headers&&e.headers.filter(c=>c.enabled!==!1&&c.key).forEach(c=>o[a(c.key)]=a(c.value));let s=(e.method||"GET").toUpperCase(),l=null;["GET","HEAD"].includes(s)||(e.bodyType==="json"||e.bodyType==="text")&&(l=a(e.body||""));let p={curl:fe(e,n),python:`import requests

url = ${JSON.stringify(r)}
headers = ${JSON.stringify(o)}
response = requests.${s.toLowerCase()}(url, headers=headers${l?", json="+l:""})
print(response.json())`,js:`const response = await fetch(${JSON.stringify(r)}, {
  method: ${JSON.stringify(s)},
  headers: ${JSON.stringify(o)}
${l?",  body: "+JSON.stringify(l):""}
})
const data = await response.json()
console.log(data)`,go:`package main

import (
  "fmt"
  "io/ioutil"
  "net/http"
)

func main() {
  url := ${JSON.stringify(r)}
  req, _ := http.NewRequest(${JSON.stringify(s)}, url, nil)
  ${Object.entries(o).map(([c,v])=>`req.Header.Set(${JSON.stringify(c)}, ${JSON.stringify(v)})`).join(`
  `)}
  client := &http.Client{}
  resp, _ := client.Do(req)
  body, _ := ioutil.ReadAll(resp.Body)
  fmt.Println(string(body))
}`,rust:`use reqwest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let client = reqwest::Client::new();
  let resp = client.${s.toLowerCase()}(${JSON.stringify(r)})${Object.entries(o).map(([c,v])=>`
    .header(${JSON.stringify(c)}, ${JSON.stringify(v)})`).join("")}
    .send().await?;
  println!("{:#?}", resp.text().await?);
  Ok(())
}`};return p[t]||p.curl}function ge(e,t){if(!t)return{ok:!0,value:e};let n=t.split(/[.[\]]/).filter(Boolean),a=e;for(let r of n){if(a==null||!(r in a))return{ok:!1};a=a[r]}return{ok:!0,value:a}}function ye(e,t=""){let n=[{path:"",kind:typeof e=="object"?Array.isArray(e)?"array":"object":"scalar",count:Array.isArray(e)?e.length:e&&typeof e=="object"?Object.keys(e).length:0}];if(e&&typeof e=="object")for(let[a,r]of Object.entries(e)){let o=t?t+"."+a:a,s=Array.isArray(r)?"array":r&&typeof r=="object"?"object":"scalar",l=Array.isArray(r)?r.length:r&&typeof r=="object"?Object.keys(r).length:0;n.push({path:o,kind:s,count:l}),(s==="array"||s==="object")&&l>0&&l<100&&n.push(...ye(r,o))}return n}function ve(e,t,n){if(!t.length)return!0;let a=JSON.stringify(e||"");for(let r of t)if(r.type==="field"){let o=e[r.field];if(o==null||String(o)!==r.value&&!String(o).toLowerCase().includes(r.value.toLowerCase()))return!1}else if(r.type==="negate"){if(a.toLowerCase().includes(r.value.toLowerCase()))return!1}else if(!a.toLowerCase().includes(r.value.toLowerCase()))return!1;return!0}function me(e,t,n){if(e==null)return{kind:e===null?"null":"undefined",text:""};if(typeof e=="number")return{kind:"number",text:String(e)};if(typeof e=="boolean")return{kind:"bool",text:String(e)};if(typeof e=="object")return{kind:"object",text:JSON.stringify(e).slice(0,60)};if(n&&typeof e=="string"){if(/^https?:\/\/\S+\.(png|jpg|jpeg|gif|svg|webp)/i.test(e))return{kind:"image",url:e,text:e};if(/^https?:\/\//.test(e))return{kind:"link",url:e,text:e};if(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(e))return{kind:"time",date:new Date(e),raw:e,text:e}}return{kind:"string",text:e}}function xe(e){if(!e||isNaN(e.getTime()))return"";let t=n=>String(n).padStart(2,"0");return e.getFullYear()+"-"+t(e.getMonth()+1)+"-"+t(e.getDate())+" "+t(e.getHours())+":"+t(e.getMinutes())}function ct(e){try{return new URL(e).pathname.split("/").pop()||e}catch{return e}}function ut(e){let t=[];if(Array.isArray(e))e.length&&e.every(n=>n&&typeof n=="object"&&!Array.isArray(n))&&t.push({path:"__root",data:e,label:"(\u6839)",count:e.length}),t.push({path:"__self",data:e,label:"(\u503C\u5217\u8868)",count:e.length});else if(e&&typeof e=="object")for(let[n,a]of Object.entries(e))Array.isArray(a)&&a.length&&a.every(r=>r&&typeof r=="object"&&!Array.isArray(r))&&t.push({path:n,data:a,label:n,count:a.length});return t}function ke(e,t={}){let{depth:n=0,maxDepth:a=12,filterAst:r=[],plainText:o="",pretty:s=!1,expanded:l={}}=t;if(n>a)return'<span class="jt-deep">\u6DF1\u5EA6\u9650\u5236</span>';if(e===null)return'<span class="jt-null">null</span>';if(e===void 0)return'<span class="jt-null">\u2014</span>';if(typeof e!="object")return Ne(e,t);let p=Array.isArray(e),c=p?e.map((f,i)=>[i,f]):Object.entries(e),v='<div class="jt-node">';v+='<div class="jt-row expandable" onclick="window.__jtToggle(this)">',v+='<span class="jt-tog">\u25BE</span>',v+='<span class="jt-prev">'+(p?"[":"{")+(p?" "+c.length+" items":" "+c.length+" keys")+(p?"]":"}")+"</span>",v+='</div><div class="jt-children">';for(let[f,i]of c){let u='<span class="jt-key">'+L(String(f))+'</span><span class="jt-colon">: </span>';v+='<div class="jt-row">'+u,i!==null&&typeof i=="object"?v+=ke(i,{...t,depth:n+1}):v+=Ne(i,{...t,key:f}),v+="</div>"}return v+="</div></div>",v}function Ne(e,t={}){if(e===null)return'<span class="jt-null">null</span>';if(e===void 0)return'<span class="jt-null">\u2014</span>';let n=me(e,t.key,t.pretty);return n.kind==="null"?'<span class="jt-null">null</span>':n.kind==="image"?'<span class="jt-img"><img src="'+L(n.url)+'" alt="" loading="lazy" style="width:24px;height:24px;border-radius:50%;vertical-align:middle" /><span class="jt-imgn" style="font-size:10px;color:var(--dimmer);margin-left:4px">'+L(ct(n.url))+"</span></span>":n.kind==="link"?'<span class="jt-link" style="color:var(--brand);word-break:break-all">'+L(n.text)+"</span>":n.kind==="time"?'<span class="jt-ts" style="color:var(--m-put)">'+L(xe(n.date))+"</span>":n.kind==="number"?'<span class="jt-num">'+L(String(e))+"</span>":n.kind==="bool"?'<span class="jt-bool">'+L(String(e))+"</span>":(n.kind==="string",'<span class="jt-str">"'+L(String(e))+'"</span>')}function L(e){if(e==null)return"";let t=document.createElement("div");return t.textContent=String(e),t.innerHTML}function Re(e,t={}){let{ast:n,plainText:a,filterText:r,pretty:o,hiddenCols:s,colOrder:l,sort:p,tableSel:c}=t,v=ut(e),f=v.find(w=>w.path===c)||v[0];if(!f)return'<div class="res-empty">\u65E0\u53EF\u8868\u683C\u5316\u6570\u636E</div>';let i=f.data;if(Array.isArray(i)&&f.path!=="__self"){if(i.length&&i.every(T=>T&&typeof T=="object"&&!Array.isArray(T))){let T=[];i.forEach(z=>Object.keys(z).forEach(q=>{T.includes(q)||T.push(q)}));let J=s||{},W=T.filter(z=>!J[z]),N=i.filter(z=>ve(z,n,a)),H='<div class="tbl-wrap"><table class="dt"><thead><tr><th class="idx">#</th>';for(let z of W){let q="";p&&p.col===z&&(q=p.dir==="asc"?" \u25B2":" \u25BC"),H+='<th class="sortable" data-col="'+L(z)+'">'+L(z)+q+'<span class="col-grip"></span></th>'}H+="</tr></thead><tbody>";let le=N;p&&p.col&&(le=[...N].sort((z,q)=>{let R=z[p.col],U=q[p.col];return R==null&&U==null?0:R==null?1:U==null?-1:typeof R=="number"&&typeof U=="number"?p.dir==="asc"?R-U:U-R:p.dir==="asc"?String(R).localeCompare(String(U)):String(U).localeCompare(String(R))}));for(let z=0;z<le.length;z++){let q=le[z];H+='<tr oncontextmenu="window.__ctx(event)"><td class="idx">'+z+"</td>";for(let R of W){let U=q[R],F=me(U,R,o);F.kind==="null"?H+='<td><span class="jt-null">null</span></td>':F.kind==="image"?H+='<td><img src="'+L(F.url)+'" style="width:24px;height:24px;border-radius:50%" loading="lazy" /></td>':F.kind==="time"?H+='<td><span class="jt-ts">'+L(xe(F.date))+"</span></td>":F.kind==="number"?H+='<td><span class="jt-num">'+L(String(U))+"</span></td>":F.kind==="bool"?H+='<td><span class="jt-bool">'+L(String(U))+"</span></td>":F.kind==="object"?H+='<td><span class="jt-str">'+L(F.text)+"</span></td>":H+='<td><span class="jt-str">'+L(String(U||""))+"</span></td>"}H+="</tr>"}return H+='</tbody></table></div><div class="tbl-note">\u6570\u7EC4 '+N.length+"/"+i.length+" \u884C</div>",H}let j=i.filter(T=>ve({v:T},n,a)),E='<div class="tbl-wrap"><table class="dt"><thead><tr><th class="idx">#</th><th>value</th></tr></thead><tbody>';for(let T=0;T<j.length;T++)E+='<tr><td class="idx">'+T+"</td><td>"+L(String(j[T]))+"</td></tr>";return E+='</tbody></table></div><div class="tbl-note">\u6570\u7EC4 '+j.length+"/"+i.length+" \u9879</div>",E}let u=Object.entries(i).filter(([w,j])=>ve({[w]:j},n,a)),m='<div class="tbl-wrap"><table class="dt"><thead><tr><th>key</th><th>value</th></tr></thead><tbody>';for(let[w,j]of u){let E=me(j,w,o),T="";E.kind==="null"?T='<span class="jt-null">null</span>':E.kind==="image"?T='<img src="'+L(E.url)+'" style="width:24px;height:24px;border-radius:50%" loading="lazy" />':E.kind==="time"?T='<span class="jt-ts">'+L(xe(E.date))+"</span>":E.kind==="number"?T='<span class="jt-num">'+L(String(j))+"</span>":T='<span class="jt-str">'+L(String(j))+"</span>",m+='<tr><td class="jt-key">'+L(w)+"</td><td>"+T+"</td></tr>"}return m+='</tbody></table></div><div class="tbl-note">\u5BF9\u8C61 '+u.length+"/"+Object.keys(i).length+" \u5B57\u6BB5</div>",m}var Je="polaris.http.tabs.v2",qe="polaris.http.collections.v2",Fe="polaris.http.envs.v2",$e="polaris.http.ui.v2",De="polaris.http.servers.v2",Ge="polaris.http.templates.v2",b={tabs:[],activeTab:null,collections:[],envs:[],activeEnv:null},g={sideCollapsed:!1,layout:"h",reqW:480,reqH:220,proxyOn:!1,resFont:13,resTab:"data",fullscreen:!1,mode:"http",curLang:"curl"},I=[],V=[],ie=!1,Ve="http://127.0.0.1:9872";function We(e,t){ie=!!e,t&&(Ve=t),e&&(g.proxyOn=!0,x())}var oe=!1;function Y(e){return Object.assign({id:O(),name:"\u672A\u547D\u540D\u8BF7\u6C42",savedId:null,dirty:!1,method:"GET",url:"",params:[C()],headers:[C()],bodyType:"none",body:"",formBody:[C()],authType:"bearer",authToken:"",authUsername:"",authPassword:"",reqTab:"params",respView:"object",respPath:"",respFilter:"",tableSel:null,pretty:!0,response:null,_templateId:null,_formData:null},e||{})}var y=()=>b.tabs.find(e=>e.id===b.activeTab);function x(){let e=b.tabs.map(t=>{let n={...t};return delete n.response,n});try{localStorage.setItem(Je,JSON.stringify({tabs:e,activeTab:b.activeTab})),localStorage.setItem(qe,JSON.stringify(b.collections)),localStorage.setItem(Fe,JSON.stringify({envs:b.envs,activeEnv:b.activeEnv})),localStorage.setItem($e,JSON.stringify(g)),localStorage.setItem(De,JSON.stringify(I)),localStorage.setItem(Ge,JSON.stringify(V))}catch{S("\u672C\u5730\u4FDD\u5B58\u5931\u8D25","err")}}function ht(){try{let e=JSON.parse(localStorage.getItem(Je)||"null");e&&e.tabs&&e.tabs.length&&(b.tabs=e.tabs.map(t=>Y(t)),b.activeTab=e.activeTab)}catch{}try{let e=JSON.parse(localStorage.getItem(qe)||"null");Array.isArray(e)&&(b.collections=e)}catch{}try{let e=JSON.parse(localStorage.getItem(Fe)||"null");e&&(b.envs=e.envs||[],b.activeEnv=e.activeEnv||null)}catch{}try{let e=JSON.parse(localStorage.getItem($e)||"null");e&&(g=Object.assign(g,e))}catch{}try{let e=JSON.parse(localStorage.getItem(De)||"null");Array.isArray(e)&&(I=e)}catch{}try{let e=JSON.parse(localStorage.getItem(Ge)||"null");Array.isArray(e)&&(V=e)}catch{}if((!b.collections.length||!b.envs.length)&&bt(),!b.tabs.length){let e=Y();b.tabs=[e],b.activeTab=e.id}y()||(b.activeTab=b.tabs[0].id)}function bt(){if(!b.envs.length){let e={id:O(),name:"Demo",baseUrl:"https://jsonplaceholder.typicode.com",vars:[C()]},t={id:O(),name:"\u672C\u5730",baseUrl:"http://127.0.0.1:8080",vars:[C()]};b.envs=[e,t],b.activeEnv=e.id}b.collections.length||(b.collections=[{id:O(),name:"\u793A\u4F8B",collapsed:!1,requests:[we("\u7528\u6237\u5217\u8868","GET","{{baseUrl}}/users"),we("\u5355\u4E2A Todo","GET","{{baseUrl}}/todos/1"),we("\u65B0\u5EFA Post","POST","{{baseUrl}}/posts",{bodyType:"json",body:JSON.stringify({title:"hello",body:"world",userId:1},null,2),headers:[C()]})]}]),I.length||(I=[{id:O(),name:"\u751F\u4EA7\u73AF\u5883",url:"https://api.example.com"},{id:O(),name:"\u6D4B\u8BD5\u73AF\u5883",url:"https://test-api.example.com"},{id:O(),name:"\u672C\u5730\u5F00\u53D1",url:"http://localhost:8080"}]),V.length||(V=[{id:O(),name:"\u521B\u5EFA\u7528\u6237",method:"POST",url:"/api/users",bodyType:"json",bodyFields:[{name:"name",label:"\u7528\u6237\u540D",type:"text",required:!0},{name:"email",label:"\u90AE\u7BB1",type:"text",required:!0},{name:"age",label:"\u5E74\u9F84",type:"number",required:!1}]},{id:O(),name:"\u67E5\u8BE2\u7528\u6237",method:"GET",url:"/api/users/{id}",bodyType:"none",bodyFields:[{name:"id",label:"\u7528\u6237 ID",type:"number",required:!0}]}])}function we(e,t,n,a){return Object.assign({id:O(),name:e,method:t,url:n,params:[C()],headers:[C()],bodyType:"none",body:"",formBody:[C()]},a||{})}function A(){return b.envs.find(e=>e.id===b.activeEnv)}function ne(){let e=A();h("#envName").textContent=e?e.name:"\u65E0\u73AF\u5883",h("#envSel").title=e&&e.baseUrl?"baseUrl: "+e.baseUrl:"\u672A\u9009\u62E9\u73AF\u5883";let t=h("#envMenu");t.innerHTML="",b.envs.forEach(r=>{let o=d("button","env-item"+(r.id===b.activeEnv?" on":""),"<span>"+k(r.name)+"</span><small>"+k(r.baseUrl||"(\u65E0 baseUrl)")+"</small>");o.onclick=()=>{b.activeEnv=r.id,x(),ne(),$(),h("#envMenu").classList.remove("open"),S("\u5DF2\u5207\u6362\u73AF\u5883\uFF1A"+r.name,"ok")},t.appendChild(o)});let n=d("button","env-item"+(b.activeEnv?"":" on"),"<span>\u65E0\u73AF\u5883</span><small>\u4E0D\u89E3\u6790\u53D8\u91CF</small>");n.onclick=()=>{b.activeEnv=null,x(),ne(),$(),h("#envMenu").classList.remove("open")},t.appendChild(n);let a=d("button","env-item manage","<span>\u7BA1\u7406\u73AF\u5883...</span>");a.onclick=()=>{h("#envMenu").classList.remove("open"),ft()},t.appendChild(a)}function ft(){let e=h("#modalBg"),t=d("div","modal wide"),n=b.activeEnv||b.envs[0]&&b.envs[0].id;function a(){let o=b.envs.find(f=>f.id===n);t.innerHTML='<h3>\u73AF\u5883\u4E0E\u53D8\u91CF</h3><div class="sub">\u6BCF\u4E2A\u73AF\u5883\u542B baseUrl \u4E0E\u4E00\u7EC4\u53D8\u91CF\uFF1BURL \u4E2D\u7528 {{baseUrl}}\u3001{{\u53D8\u91CF\u540D}} \u5F15\u7528\u3002</div>';let s=d("div","env-tabs");b.envs.forEach(f=>{let i=d("button","env-tab"+(f.id===n?" on":""),k(f.name)+(f.id===b.activeEnv?" \u25CF":""));i.onclick=()=>{n=f.id,a()},s.appendChild(i)});let l=d("button","env-tab add","+ \u65B0\u5EFA\u73AF\u5883");if(l.onclick=()=>{let f={id:O(),name:"\u73AF\u5883 "+(b.envs.length+1),baseUrl:"",vars:[C()]};b.envs.push(f),n=f.id,a()},s.appendChild(l),t.appendChild(s),o){let f=d("div","field");f.innerHTML="<label>\u73AF\u5883\u540D\u79F0</label>";let i=d("input");i.value=o.name,i.oninput=()=>o.name=i.value,f.appendChild(i),t.appendChild(f);let u=d("div","field");u.innerHTML="<label>baseUrl</label>";let m=d("input");m.placeholder="http://127.0.0.1:8080",m.value=o.baseUrl||"",m.oninput=()=>o.baseUrl=m.value,u.appendChild(m),t.appendChild(u);let w=d("div","field");w.innerHTML="<label>\u53D8\u91CF</label>";let j=d("div","env-vars");o.vars||(o.vars=[C()]),j.appendChild(X(o.vars,{kPlace:"\u53D8\u91CF\u540D",vPlace:"\u503C",onChange:()=>{x()}})),w.appendChild(j),t.appendChild(w)}let p=d("div","acts");if(o){let f=d("button","btn ghost danger","\u5220\u9664");f.onclick=()=>{nt("\u5220\u9664\u73AF\u5883\u300C"+o.name+"\u300D\uFF1F",i=>{i&&(b.envs=b.envs.filter(u=>u.id!==o.id),b.activeEnv===o.id&&(b.activeEnv=b.envs[0]?b.envs[0].id:null),n=b.envs[0]&&b.envs[0].id,a())})},p.appendChild(f)}let c=d("div");if(c.style.flex="1",p.appendChild(c),o){let f=d("button","btn",o.id===b.activeEnv?"\u2713 \u5F53\u524D\u73AF\u5883":"\u8BBE\u4E3A\u5F53\u524D");f.onclick=()=>{b.activeEnv=n,x(),ne(),$(),a()},p.appendChild(f)}let v=d("button","btn primary","\u5B8C\u6210");v.onclick=r,p.appendChild(v),t.appendChild(p)}function r(){b.envs.forEach(o=>{o.vars&&(o.vars=o.vars.filter(s=>s.key||s.value))}),x(),ne(),$(),e.classList.remove("open"),e.innerHTML=""}e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=o=>{o.target===e&&r()},a()}function Se(){let e=h("#serverSelect");if(!e)return;e.innerHTML='<option value="">\u65E0</option>',I.forEach(n=>{let a=d("option");a.value=n.id,a.textContent=n.name+" ("+n.url+")",e.appendChild(a)});let t=d("option");t.value="__manage",t.textContent="\u2699 \u7BA1\u7406\u670D\u52A1\u5668...",e.appendChild(t)}function vt(e){if(e.value==="__manage"){e.value="",xt();return}let t=h("#serverBadge"),n=h("#serverBadgeText");if(e.value){let a=I.find(r=>r.id===e.value);if(a){n.textContent=a.name+": "+a.url,t.style.display="flex";let r=y();if(r&&r.url)try{let o=new URL(r.url.indexOf("{{")>=0?r.url.replace(/\{\{[^}]+\}\}/g,"x"):r.url),s=a.url+o.pathname+o.search+o.hash;r.url=s,h("#url").value=s,M(r),$(),x()}catch{}}}else t.style.display="none"}function mt(){let e=h("#serverSelect");if(!e.value)return;let t=I.find(a=>a.id===e.value);if(!t)return;let n=y();if(!(!n||!n.url))try{let a=new URL(n.url.indexOf("{{")>=0?n.url.replace(/\{\{[^}]+\}\}/g,"x"):n.url),r=t.url+a.pathname+a.search+a.hash;n.url=r,h("#url").value=r,M(n),$(),x(),S("\u5DF2\u66FF\u6362\u670D\u52A1\u5668 URL","ok")}catch{S("URL \u65E0\u6548","warn")}}function xt(){let e=h("#modalBg"),t=d("div","modal");t.innerHTML='<h3>\u7BA1\u7406\u670D\u52A1\u5668</h3><div class="sub">\u670D\u52A1\u5668\u5217\u8868\u7528\u4E8E\u5FEB\u901F\u66FF\u6362 URL \u57DF\u540D\u3002</div>';let n=d("div");n.style.cssText="max-height:240px;overflow:auto";function a(){n.innerHTML="",I.forEach((c,v)=>{let f=d("div","srv-row");f.innerHTML='<input class="srv-input" value="'+k(c.name)+'" placeholder="\u540D\u79F0" /><input class="srv-input" value="'+k(c.url)+'" placeholder="https://..." style="flex:1" /><button class="btn icon ghost" style="font-size:14px;color:var(--err)" onclick="window.__delSrv('+v+')">\xD7</button>';let i=f.querySelectorAll("input")[0],u=f.querySelectorAll("input")[1];i.oninput=()=>{c.name=i.value,x()},u.oninput=()=>{c.url=u.value,x()},n.appendChild(f)})}a(),t.appendChild(n);let r=d("div","acts"),o=d("div");o.style.flex="1";let s=d("button","btn","+ \u6DFB\u52A0\u670D\u52A1\u5668");s.onclick=()=>{I.push({id:O(),name:"\u65B0\u670D\u52A1\u5668",url:"https://"}),a(),x()};let l=d("button","btn primary","\u5B8C\u6210");l.onclick=p,r.append(s,o,l),t.appendChild(r),e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=c=>{c.target===e&&p()},window.__delSrv=c=>{I.splice(c,1),a(),x(),Se()};function p(){e.classList.remove("open"),e.innerHTML="",Se()}}function Ke(){let e=h("#templateSelect");e&&(e.innerHTML='<option value="">\u8BF7\u9009\u62E9...</option>',V.forEach(t=>{let n=d("option");n.value=t.id,n.textContent=t.name+" ("+t.method+" "+t.url+")",e.appendChild(n)}))}function gt(e){let t=y();if(!t)return;if(!e.value){h("#templateForm").style.display="none",h("#customHint").style.display="none";return}let n=V.find(a=>a.id===e.value);n&&(t._templateId&&t._formData,t._templateId=n.id,t.method=n.method,t.url=n.url,t.bodyType=n.bodyType||"none",kt(n,t._formData||{}),h("#customHint").style.display="block",M(t),x(),Oe(),D())}function yt(){let e=y();e&&se("\u4FDD\u5B58\u6A21\u677F","\u8F93\u5165\u6A21\u677F\u540D\u79F0\uFF1A",e.name+" \u6A21\u677F",t=>{if(!t)return;let n=[];if(e.bodyType==="json"&&e.body)try{Object.keys(JSON.parse(e.body)).forEach(r=>n.push({name:r,label:r,type:"text",required:!1}))}catch{}let a={id:O(),name:t,method:e.method,url:e.url,bodyType:e.bodyType,bodyFields:n.length?n:[{name:"param",label:"\u53C2\u6570",type:"text",required:!1}]};V.push(a),x(),Ke(),S("\u5DF2\u4FDD\u5B58\u6A21\u677F\u300C"+t+"\u300D","ok")})}function kt(e,t){let n=h("#templateFields");if(!n)return;n.innerHTML="";let a=e.bodyFields||[],r=new Set;if(e.bodyType==="json"){let o=y();if(o&&o.body)try{let s=JSON.parse(o.body);Object.keys(s).forEach(l=>{a.find(p=>p.name===l)||r.add(l)})}catch{}}a.forEach(o=>{let s=d("div","tf-field"),l=t[o.name]||"",p=o.required?' <span class="tf-req">*</span>':"";if(s.innerHTML="<label>"+k(o.label)+p+"</label>",o.type==="json"){let c=d("textarea");c.placeholder=o.name,c.value=l,c.oninput=()=>te(),s.appendChild(c)}else if(o.type==="number"){let c=d("input");c.type="number",c.placeholder=o.name,c.value=l,c.oninput=()=>te(),s.appendChild(c)}else if(o.type==="checkbox"){let c=d("label"),v=d("input");v.type="checkbox",v.checked=l===!0||l==="true",v.onchange=()=>te(),c.appendChild(v),c.appendChild(document.createTextNode(" "+k(o.label))),s.appendChild(c)}else{let c=d("input");c.type="text",c.placeholder=o.name,c.value=l,c.oninput=()=>te(),s.appendChild(c)}n.appendChild(s)}),r.forEach(o=>{let s=d("div","tf-field");s.innerHTML="<label>"+k(o)+' <span class="tf-extra">(\u989D\u5916)</span></label>';let l=d("input");l.type="text",l.placeholder=o,l.value=t[o]||"",l.oninput=()=>te(),s.appendChild(l),n.appendChild(s)}),h("#templateForm").style.display="block"}function te(){if(oe)return;let e=y();if(!e)return;let t=V.find(r=>r.id===e._templateId);if(!t)return;let n=t.bodyFields||[],a={};n.forEach(r=>{let o=document.getElementById("tf-"+r.name)||h("#templateFields").querySelector('input[placeholder="'+r.name+'"],textarea[placeholder="'+r.name+'"]');o&&(r.type==="number"?a[r.name]=o.value?Number(o.value):null:r.type==="checkbox"?a[r.name]=o.checked:a[r.name]=o.value)}),_("#templateFields .tf-field").forEach(r=>{let o=r.querySelector("label"),s=r.querySelector("input,textarea");if(o&&s&&o.textContent.includes("(\u989D\u5916)")){let l=o.textContent.replace(/\s*\(额外\)\s*/,"").trim();l&&!n.find(p=>p.name===l)&&(a[l]=s.value)}}),e._formData=a,e.bodyType==="json"&&(e.body=JSON.stringify(a,null,2),oe=!0,D(),oe=!1),M(e),x()}function Xe(){return be.get("globalHeaders")||[]}function wt(){let e=y();if(!e||e.reqTab!=="global")return;let t=h("#reqPane");t.innerHTML="";let n=d("div"),a=d("div","gh-hint","\u5168\u5C40 Headers \u81EA\u52A8\u5408\u5E76\u5230\u6240\u6709\u8BF7\u6C42\u3002\u82E5\u8BF7\u6C42\u4E2D\u5DF2\u6709\u540C\u540D Header\uFF0C\u4EE5\u8BF7\u6C42\u4E3A\u51C6\u3002");n.appendChild(a);let r=Xe(),o=B(r);(!o.length||o[o.length-1].key||o[o.length-1].value)&&o.push(C()),n.appendChild(X(o,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{let s=o.filter(l=>l.key);be.set("globalHeaders",s)}})),t.appendChild(n)}function Ze(){let e=y();if(!e||e.reqTab!=="auth")return;let t=h("#reqPane");t.innerHTML="";let n=d("div","auth-panel"),a=d("div","seg");if([["bearer","Bearer Token"],["basic","Basic Auth"]].forEach(([o,s])=>{let l=d("button",e.authType===o?"on":"",s);l.onclick=()=>{e.authType=o,M(e),x(),Ze()},a.appendChild(l)}),n.appendChild(a),e.authType==="bearer"){let o=d("div","auth-field");o.innerHTML="<label>Token</label>";let s=d("input");s.type="password",s.value=e.authToken||"",s.placeholder="eyJhbGciOiJIUzI1NiIs...",s.onfocus=()=>s.type="text",s.onblur=()=>{s.value||(s.type="password")},s.oninput=()=>{e.authToken=s.value,M(e),x()},o.appendChild(s),n.appendChild(o)}else{let o=d("div","auth-field");o.innerHTML="<label>\u7528\u6237\u540D</label>";let s=d("input");s.type="text",s.value=e.authUsername||"",s.placeholder="admin",s.oninput=()=>{e.authUsername=s.value,M(e),x()},o.appendChild(s),n.appendChild(o);let l=d("div","auth-field");l.innerHTML="<label>\u5BC6\u7801</label>";let p=d("input");p.type="password",p.value=e.authPassword||"",p.onfocus=()=>p.type="text",p.onblur=()=>{p.value||(p.type="password")},p.oninput=()=>{e.authPassword=p.value,M(e),x()},l.appendChild(p),n.appendChild(l)}let r=d("div","auth-hint","\u81EA\u52A8\u586B\u5145\u5230 Authorization \u5934");n.appendChild(r),t.appendChild(n)}function $(){let e=y(),t=h("#urlResolved");if(e&&e.url&&e.url.indexOf("{{")>=0){let n=A();t.innerHTML="\u2192 <b>"+k(P(e.url,n))+"</b>",t.style.display="block"}else t.style.display="none"}function Tt(){let e=h("#methodMenu");e&&ze.forEach(t=>{let n=d("button",ee(t),t);n.onclick=()=>{let a=y();a&&(a.method=t,M(a)),h("#methodMenu").classList.remove("open"),Oe(),D(),x()},e.appendChild(n)})}function St(){let e=h("#methodSel");e&&(e.onclick=n=>{n.stopPropagation(),h("#methodMenu").classList.toggle("open")});let t=h("#envSel");t&&(t.onclick=n=>{n.stopPropagation(),h("#envMenu").classList.toggle("open")}),document.addEventListener("click",()=>{let n=h("#methodMenu");n&&n.classList.remove("open");let a=h("#envMenu");a&&a.classList.remove("open")})}function ae(){let e=h("#tabbar");e.innerHTML="",b.tabs.forEach(n=>{let a=d("div","rtab"+(n.id===b.activeTab?" active":""));a.innerHTML='<span class="tm '+ee(n.method)+'">'+n.method+'</span><span class="tn">'+k(n.name)+"</span>",n.dirty&&a.appendChild(d("span","dirty","\u25CF"));let r=d("button","tx","\xD7");r.onclick=o=>{o.stopPropagation(),Mt(n)},a.appendChild(r),a.onclick=()=>{b.activeTab=n.id,K(),x()},a.querySelector(".tn").ondblclick=o=>{o.stopPropagation(),se("\u91CD\u547D\u540D Tab","\u8F93\u5165\u65B0\u540D\u79F0\uFF1A",n.name,s=>{s!=null&&(n.name=s.trim()||n.name,ae(),x())})},e.appendChild(a)});let t=d("button","tab-add","+");t.onclick=()=>{let n=Y();b.tabs.push(n),b.activeTab=n.id,K(),x()},e.appendChild(t),h("#stTabs").textContent=b.tabs.length}function Oe(){let e=y(),t=h("#methodLabel");t&&(t.textContent=e.method,t.className=ee(e.method));let n=h("#url");n&&document.activeElement!==n&&(n.value=e.url),$()}function D(){let e=y();_("#reqSubtabs .subtab").forEach(n=>n.classList.toggle("active",n.dataset.rt===e.reqTab));let t=h("#reqPane");if(t.innerHTML="",e.reqTab==="params")t.appendChild(X(e.params,{kPlace:"\u53C2\u6570\u540D",vPlace:"\u53C2\u6570\u503C",onChange:()=>{M(e),jt(e),x()}}));else if(e.reqTab==="headers"){let n=d("div");n.appendChild(X(e.headers,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{M(e),x()}}));let a=d("div","suggest");Object.entries({"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "}).forEach(([o,s])=>{let l=d("button","chip",o);l.onclick=()=>{e.headers.pop(),e.headers.push({id:O(),enabled:!0,key:o,value:s}),e.headers.push(C()),x(),D()},a.appendChild(l)}),n.appendChild(a),t.appendChild(n)}else e.reqTab==="body"?Ct(t,e):e.reqTab==="auth"?Ze():e.reqTab==="global"&&wt()}function Ct(e,t){let n=d("div","body-bar"),a=d("div","seg");if([["none","\u65E0"],["json","JSON"],["text","\u6587\u672C"],["form","Form"]].forEach(([r,o])=>{let s=d("button",t.bodyType===r?"on":"",o);s.onclick=()=>{t.bodyType=r,M(t),x(),D()},a.appendChild(s)}),n.appendChild(a),n.appendChild(d("div","sp")),t.bodyType==="json"){let r=d("button","tool","\u683C\u5F0F\u5316");r.onclick=()=>{try{t.body=JSON.stringify(JSON.parse(t.body),null,2),D(),x(),S("JSON \u5DF2\u683C\u5F0F\u5316","ok")}catch{S("JSON \u65E0\u6548","err")}},n.appendChild(r)}if(e.appendChild(n),t.bodyType==="none")e.appendChild(d("div","body-none","\u8BE5\u8BF7\u6C42\u6CA1\u6709 Body\u3002\u9009\u62E9 JSON / \u6587\u672C / Form \u4EE5\u7F16\u8F91\u3002"));else if(t.bodyType==="form"){let r=d("div");r.style.cssText="height:calc(100% - 49px);overflow:auto",r.appendChild(X(t.formBody||[C()],{kPlace:"\u5B57\u6BB5\u540D",vPlace:"\u5B57\u6BB5\u503C",onChange:()=>{M(t),x()}})),e.appendChild(r)}else{let r=d("textarea","code");r.spellcheck=!1,r.placeholder=t.bodyType==="json"?`{
  "key": "value"
}`:"\u539F\u59CB\u8BF7\u6C42\u4F53\u2026",r.value=t.body,r.style.cssText="width:100%;min-height:80px;padding:10px;border-radius:4px;background:var(--bg);border:1px solid var(--line);font-size:12px;color:var(--ink);resize:vertical;tab-size:2",r.addEventListener("input",()=>{t.body=r.value,M(t),x(),oe||(t._formData=null)}),r.addEventListener("keydown",o=>{if(o.key==="Tab"){o.preventDefault();let s=r.selectionStart,l=r.selectionEnd;r.value=r.value.slice(0,s)+"  "+r.value.slice(l),r.selectionStart=r.selectionEnd=s+2,t.body=r.value}}),e.appendChild(r)}}function Lt(e){let t=e.indexOf("?");return t<0?[e,""]:[e.slice(0,t),e.slice(t+1)]}function jt(e){let[t]=Lt(e.url),n=e.params.filter(r=>r.enabled!==!1&&r.key).map(r=>encodeURIComponent(r.key)+"="+encodeURIComponent(r.value)).join("&");e.url=n?t+"?"+n:t;let a=h("#url");document.activeElement!==a&&(a.value=e.url),$()}async function Te(){let e=y(),t=P(e.url.trim(),A());if(!t){S("\u8BF7\u5148\u8F93\u5165 URL","warn"),h("#url").focus();return}/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let n=t.indexOf("?"),a=n>=0?t.slice(0,n):t,r=(e.method||"GET").toUpperCase(),o={};if(e.headers&&e.headers.filter(i=>i.enabled!==!1&&i.key).forEach(i=>o[P(i.key,A())]=P(i.value,A())),Xe().filter(i=>i.enabled!==!1&&i.key).forEach(i=>{Object.keys(o).some(u=>u.toLowerCase()===i.key.toLowerCase())||(o[i.key]=i.value)}),e.authType==="bearer"&&e.authToken&&!Object.keys(o).some(i=>i.toLowerCase()==="authorization")?o.Authorization="Bearer "+e.authToken:e.authType==="basic"&&e.authUsername&&e.authPassword&&!Object.keys(o).some(i=>i.toLowerCase()==="authorization")&&(o.Authorization="Basic "+btoa(e.authUsername+":"+e.authPassword)),e.params){let i=e.params.filter(u=>u.enabled!==!1&&u.key).map(u=>encodeURIComponent(P(u.key,A()))+"="+encodeURIComponent(P(u.value||"",A()))).join("&");i&&(a+="?"+i)}let l;if(!["GET","HEAD"].includes(r)){if(e.bodyType==="json")l=P(e.body||"",A()),Object.keys(o).some(i=>i.toLowerCase()==="content-type")||(o["Content-Type"]="application/json");else if(e.bodyType==="text")l=P(e.body||"",A());else if(e.bodyType==="form"){let i=e.formBody||[];Array.isArray(i)&&(l=i.filter(u=>u.enabled!==!1&&u.key).map(u=>encodeURIComponent(P(u.key,A()))+"="+encodeURIComponent(P(u.value||"",A()))).join("&"),Object.keys(o).some(u=>u.toLowerCase()==="content-type")||(o["Content-Type"]="application/x-www-form-urlencoded"))}}let p=h("#sendBtn");p.disabled=!0,p.innerHTML="\u53D1\u9001\u4E2D\u2026",h("#resStatus").style.display="none",h("#resTabs").style.display="none",h("#resTools").style.display="none",h("#resPane").innerHTML='<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>',S(r+" "+a+(g.proxyOn?" \xB7 \u7ECF\u4EE3\u7406":"")+" \u2026");let c=a,v=o;g.proxyOn&&(v=Object.assign({},o,{"X-Polaris-Target":a}),c=ie?Ve+"/__proxy":"/__proxy");let f=performance.now();try{if(e.response&&e.response.blobUrl)try{URL.revokeObjectURL(e.response.blobUrl)}catch{}let i=await fetch(c,{method:r,headers:v,body:l,redirect:"follow"}),u=await i.blob(),m=performance.now(),w=i.headers.get("content-type")||"",j=/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-|gzip)/i.test(w),E="";j||(E=await u.text());let T={};i.headers.forEach((W,N)=>T[N]=W);let J=Me(E);e.response={status:i.status,statusText:i.statusText,ok:i.ok,timeMs:m-f,size:u.size,contentType:w,headers:T,text:E,isBinary:j,blobUrl:j?URL.createObjectURL(u):null,url:a,parsed:J.ok?J.value:void 0},e.respPath="",e.respFilter="",e.tableSel=null,e.respView=J.ok?Array.isArray(J.value)?"table":"object":(/text\/html/i.test(w),"raw"),Le(),S(r+" "+i.status+" "+i.statusText+" \xB7 "+ue(m-f)+" \xB7 "+ce(u.size),i.ok?"ok":"warn")}catch(i){let u=performance.now();e.response={error:i.message||String(i),timeMs:u-f,url:a},Le(),S("\u8BF7\u6C42\u5931\u8D25\uFF1A"+(i.message||i),"err")}finally{p.disabled=!1,p.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>'}}function Ce(e){let t=e.response,n=t&&!t.error?t.parsed:void 0,a=n;if(g.resTab==="data"&&n!==void 0){for(let s of["data","result","response","results","items","list"])if(n&&typeof n=="object"&&!Array.isArray(n)&&s in n){let l=ge(n,s);if(l.ok){a=l.value;break}}}if(e.respPath&&n!==void 0){let s=ge(n,e.respPath);s.ok?a=s.value:a=void 0}let r=a!==void 0,o=r&&(Array.isArray(a)||a&&typeof a=="object");return{data:a,hasJSON:r,canTable:o}}function Z(){let e=y();if(!e||!e.response||e.response.error)return;let t=Ce(e),n={table:t.canTable,object:t.hasJSON,raw:!0,headers:!0};n[e.respView]||(e.respView=t.hasJSON?"object":"raw"),_("#resViews .rv").forEach(r=>{let o=r.dataset.rv;r.classList.toggle("active",o===e.respView),r.classList.toggle("disabled",!n[o])});let a=h("#resPane");e.respView==="raw"?a.innerHTML='<pre class="raw-view">'+k(e.response.text||"")+"</pre>":e.respView==="object"?a.innerHTML=ke(t.data,{pretty:e.pretty}):e.respView==="table"?a.innerHTML=Re(t.data,{pretty:e.pretty}):e.respView==="headers"&&(a.innerHTML=Ot(e.response.headers)),a.style.fontSize=g.resFont+"px"}function Le(){let e=y(),t=e.response,n=h("#resPane"),a=h("#resTabs"),r=h("#resStatus"),o=h("#resTools");if(!t){a.style.display="none",r.style.display="none",o.style.display="none",n.innerHTML='<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div><div class="tips">\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002<br>\xB7 \u591A tab\uFF1A\u9876\u90E8 \uFF0B \u65B0\u5EFA\uFF0C\u53CC\u51FB\u6807\u7B7E\u53EF\u91CD\u547D\u540D<br>\xB7 \u73AF\u5883\u53D8\u91CF\uFF1A\u53F3\u4E0A\u89D2\u5207\u6362\uFF0CURL \u91CC\u7528 {{baseUrl}}<br>\xB7 \u5BFC\u5165 cURL\uFF1A\u53F3\u4E0A\u89D2\u7C98\u8D34 curl \u547D\u4EE4\u4E00\u952E\u89E3\u6790<br>\xB7 \u8DE8\u57DF\uFF1A\u9876\u680F\u300C\u4EE3\u7406\u300D\u5F00\u542F\u540E\u7ECF\u672C\u5730\u540E\u7AEF\u8F6C\u53D1</div></div>';return}if(t.error){a.style.display="none",r.style.display="none",o.style.display="none",n.innerHTML='<div class="res-err"><div class="ti">\u8BF7\u6C42\u5931\u8D25</div><div>'+k(t.error)+"</div></div>";return}r.style.display="flex",a.style.display="flex";let s=t.status>=500?"s5":t.status>=400?"s4":t.status>=300?"s3":"s2";if(r.innerHTML='<span class="status-chip '+s+'"><span class="dotc"></span>'+t.status+" "+k(t.statusText)+'</span><span class="res-meta"><span>\u8017\u65F6 <b>'+ue(t.timeMs)+"</b></span><span>\u5927\u5C0F <b>"+ce(t.size)+"</b></span>"+(t.contentType?"<span>\u7C7B\u578B <b>"+k(t.contentType.split(";")[0])+"</b></span>":"")+'</span><span class="sp"></span><button class="tool" onclick="window.__copyRes()">\u29C9 \u590D\u5236</button><button class="tool" onclick="window.__dlRes()">\u2193 \u4E0B\u8F7D</button><button class="tool" onclick="window.__exportCurl()">\u5BFC\u51FA cURL</button><button class="tool" onclick="window.__askAI()">\u2726 AI</button>',o.style.display="flex",t.parsed!==void 0){let c='<select class="path-select" onchange="window.__setPath(this.value)"><option value="">(\u6839)</option>'+ye(t.parsed).map(v=>'<option value="'+k(v.path)+'"'+(v.path===e.respPath?" selected":"")+">"+k(v.path||"(\u6839)")+"</option>").join("")+"</select>"}Z()}function Ot(e){if(!e||!Object.keys(e).length)return'<div class="res-empty">\u65E0\u54CD\u5E94\u5934</div>';let t='<div class="tbl-wrap"><table class="dt"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>';for(let[n,a]of Object.entries(e))t+='<tr><td class="jt-key">'+k(n)+"</td><td>"+k(a)+"</td></tr>";return t+="</tbody></table></div>",t}function Et(e){g.resFont=parseInt(e),x();let t=h("#resPane");t&&(t.style.fontSize=e+"px")}function zt(e){_(".jt-children").forEach(t=>{if(t.style.display="block",t.previousElementSibling){let n=t.previousElementSibling.querySelector(".jt-tog");n&&(n.textContent="\u25BE")}}),S("\u5DF2\u5C55\u5F00","ok")}function _t(){g.fullscreen=!g.fullscreen;let e=h("#resRegion")||h("#resPane")?.closest(".res-region");e&&(e.style.position=g.fullscreen?"fixed":"",e.style.inset=g.fullscreen?"0":"",e.style.zIndex=g.fullscreen?"100":"",e.style.background=g.fullscreen?"var(--bg)":"",S(g.fullscreen?"\u5168\u5C4F\u6A21\u5F0F":"\u9000\u51FA\u5168\u5C4F","ok"))}function M(e){e.dirty||(e.dirty=!0,ae())}function Mt(e){if(e.dirty&&(e.url||e.savedId)){nt("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F",n=>{n&&t()});return}t();function t(){let n=b.tabs.indexOf(e);if(b.tabs.splice(n,1),b.tabs.length)b.activeTab===e.id&&(b.activeTab=b.tabs[Math.max(0,n-1)].id);else{let a=Y();b.tabs.push(a),b.activeTab=a.id}K(),x()}}function Q(){let e=h("#tree");e.innerHTML="";let t=(h("#search").value||"").toLowerCase().trim(),n=0;b.collections.length||e.appendChild(d("div","tree-empty","\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u8BF7\u6C42\u3002")),b.collections.forEach(a=>{let r=t?a.requests.filter(p=>!t||p.name.toLowerCase().includes(t)||p.url.toLowerCase().includes(t)):a.requests;if(n+=a.requests.length,t&&!r.length&&!a.name.toLowerCase().includes(t))return;let o=d("div","group"+(a.collapsed&&!t?" collapsed":"")),s=d("div","group-head");s.innerHTML='<span class="caret">\u25BE</span><span class="gname">'+k(a.name)+'</span><span class="gcount">'+a.requests.length+"</span>",s.onclick=()=>{a.collapsed=!a.collapsed,x(),Q()},o.appendChild(s);let l=d("div","reqs");r.forEach(p=>{let c=d("div","req-item"+(y()&&y().savedId===p.id?" active":""));c.innerHTML='<span class="mb '+ee(p.method)+'">'+p.method+'</span><span class="rn">'+k(p.name)+"</span>",c.onclick=()=>Ht(p),l.appendChild(c)}),o.appendChild(l),e.appendChild(o)}),h("#stSaved").textContent=n}function Ht(e){let t=b.tabs.find(a=>a.savedId===e.id);if(t){b.activeTab=t.id,K();return}let n=Y({name:e.name,savedId:e.id,method:e.method,url:e.url,params:B(e.params||[C()]),headers:B(e.headers||[C()]),bodyType:e.bodyType||"none",body:e.body||"",formBody:B(e.formBody||[C()])});n.params.length||(n.params=[C()]),n.headers.length||(n.headers=[C()]),n.formBody.length||(n.formBody=[C()]),b.tabs.push(n),b.activeTab=n.id,K(),x()}function At(){let e=y();if(e.savedId){let r=Ut(e.savedId);if(r){Object.assign(r.r,Ie(e)),r.r.name=e.name,e.dirty=!1,x(),ae(),Q(),S("\u5DF2\u66F4\u65B0\u300C"+e.name+"\u300D","ok");return}}let t=b.collections.map(r=>'<option value="'+r.id+'">'+k(r.name)+"</option>").join("");function n(r,o){let s=b.collections.find(p=>p.id===o);if(!s)return;let l=Object.assign({id:O(),name:r.mName||"\u672A\u547D\u540D\u8BF7\u6C42"},Ie(e));s.requests.push(l),e.savedId=l.id,e.name=l.name,e.dirty=!1,x(),ae(),Q(),S("\u5DF2\u4FDD\u5B58\u5230\u300C"+s.name+"\u300D","ok")}function a(r){let o=r.mGroup;if(o==="__new"||!b.collections.length){se("\u65B0\u5EFA\u5206\u7EC4","\u8F93\u5165\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4",s=>{if(s){let l={id:O(),name:s,collapsed:!1,requests:[]};b.collections.push(l),o=l.id,n(r,o)}});return}n(r,o)}It("\u4FDD\u5B58\u8BF7\u6C42","\u628A\u5F53\u524D\u8BF7\u6C42\u5B58\u5165\u4E00\u4E2A\u5206\u7EC4",[{label:"\u540D\u79F0",id:"mName",type:"text",value:e.url?e.method+" "+Ye(e.url):"\u672A\u547D\u540D\u8BF7\u6C42"},{label:"\u5206\u7EC4",id:"mGroup",type:"select",html:t+'<option value="__new">+ \u65B0\u5EFA\u5206\u7EC4\u2026</option>'}],a)}function Ie(e){return{method:e.method,url:e.url,params:B(e.params),headers:B(e.headers),bodyType:e.bodyType,body:e.body,formBody:B(e.formBody)}}function Ut(e){for(let t of b.collections){let n=t.requests.find(a=>a.id===e);if(n)return{g:t,r:n}}return null}function Ye(e){try{let t=new URL(/^[a-z]+:\/\//i.test(e)?e:"https://"+e.replace(/^\{\{[^}]+\}\}/,"http://x"));return t.pathname&&t.pathname.length>1?t.pathname:t.hostname}catch{return String(e).slice(0,28)}}function Bt(){let e=h("#modalBg"),t=d("div","modal");t.innerHTML='<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\u3002</div>';let n=d("div","field");n.innerHTML="<label>cURL \u547D\u4EE4</label>";let a=d("textarea","curl-ta");a.placeholder="curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx'",n.appendChild(a),t.appendChild(n);let r=d("div","field");r.innerHTML='<label><input type="checkbox" id="curlOverwrite" checked /> \u8986\u76D6\u73B0\u6709\u53C2\u6570</label>',t.appendChild(r);let o=d("div","acts"),s=d("div");s.style.flex="1";let l=d("button","btn ghost","\u53D6\u6D88");l.onclick=c;let p=d("button","btn primary","\u89E3\u6790\u5E76\u65B0\u5EFA");p.onclick=()=>{let v=a.value.trim();if(!v){S("\u8BF7\u7C98\u8D34 curl \u547D\u4EE4","warn");return}try{let f=Be(v);if(!f.url){S("\u672A\u80FD\u89E3\u6790\u51FA URL","err");return}let i=Y({name:"cURL: "+Ye(f.url),method:f.method,url:f.url,bodyType:f.bodyType,body:f.body,headers:(f.headers.length?f.headers:[]).concat([C()])});b.tabs.push(i),b.activeTab=i.id,K(),x(),c(),S("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A"+f.method+" "+f.url,"ok")}catch(f){S("cURL \u89E3\u6790\u5931\u8D25\uFF1A"+f.message,"err")}},o.append(l,s,p),t.appendChild(o),e.innerHTML="",e.appendChild(t),e.classList.add("open"),a.focus(),e.onclick=v=>{v.target===e&&c()};function c(){e.classList.remove("open"),e.innerHTML=""}}function Qe(){let e=y();if(!e||!e.url){S("\u8BF7\u5148\u586B\u5199 URL","warn");return}let t=fe(e,A());re(t,"cURL \u5DF2\u590D\u5236")}function et(){let e=y(),t=e.response;if(!t||!je)return;let n=t.error?`\u8BF7\u6C42\u5931\u8D25\uFF1A${t.error}`:`\u72B6\u6001 ${t.status} ${t.statusText}\uFF0C\u8017\u65F6 ${Ae(t.timeMs)}\uFF0C\u5927\u5C0F ${He(t.size)}`,a=t.parsed!==void 0?JSON.stringify(t.parsed).slice(0,2e3):(t.text||"").slice(0,2e3),r=`\u5206\u6790\u4EE5\u4E0B API \u8BF7\u6C42\u4E0E\u54CD\u5E94\uFF0C\u7ED9\u51FA\u95EE\u9898\u8BCA\u65AD\u6216\u6570\u636E\u89E3\u8BFB\uFF1A

\u8BF7\u6C42\uFF1A${e.method} ${e.url}
\u54CD\u5E94\uFF1A${n}
\u54CD\u5E94\u4F53\u9884\u89C8\uFF1A
${a}`;je(r)}function Pt(){let e=h("#codeGenPanel");if(!e)return;let t=e.style.display!=="block";e.style.display=t?"block":"none",t&&tt()}function tt(){let e=y();if(!e||!e.url){h("#codeOutput").textContent="\u8BF7\u5148\u586B\u5199 URL";return}try{let t=Pe(e,g.curLang||"curl",A());h("#codeOutput").textContent=t||"\u4EE3\u7801\u751F\u6210\u5931\u8D25"}catch(t){h("#codeOutput").textContent="\u4EE3\u7801\u751F\u6210\u5931\u8D25\uFF1A"+t.message}}function Nt(e,t){g.curLang=t,x(),_("#codeGenPanel .lang-btn").forEach(n=>n.classList.toggle("active",n.dataset.lang===t)),tt()}function Rt(){let e=h("#codeOutput")?.textContent;e&&re(e,"\u4EE3\u7801\u5DF2\u590D\u5236")}function nt(e,t){let n=h("#modalBg"),a=d("div","modal");a.innerHTML='<h3>\u786E\u8BA4</h3><div class="sub">'+k(e)+"</div>";let r=d("div","acts"),o=d("div");o.style.flex="1";let s=d("button","btn ghost","\u53D6\u6D88");s.onclick=p;let l=d("button","btn primary danger","\u786E\u5B9A");l.onclick=()=>{p(),t(!0)},r.append(o,s,l),a.appendChild(r),n.innerHTML="",n.appendChild(a),n.classList.add("open"),a.querySelector("button.danger")?.focus(),a.addEventListener("keydown",c=>{c.key==="Escape"&&p()}),n.onclick=c=>{c.target===n&&p()};function p(){n.classList.remove("open"),n.innerHTML="",t(!1)}}function se(e,t,n,a){let r=h("#modalBg"),o=d("div","modal");o.innerHTML="<h3>"+k(e)+'</h3><div class="sub">'+k(t)+"</div>";let s=d("div","field"),l=d("input");l.type="text",l.value=n||"",s.appendChild(l),o.appendChild(s);let p=d("div","acts"),c=d("div");c.style.flex="1";let v=d("button","btn ghost","\u53D6\u6D88");v.onclick=i;let f=d("button","btn primary","\u786E\u5B9A");f.onclick=()=>{let u=l.value.trim();u&&(i(),a(u))},p.append(c,v,f),o.appendChild(p),r.innerHTML="",r.appendChild(o),r.classList.add("open"),l.focus(),l.select(),o.addEventListener("keydown",u=>{u.key==="Enter"&&l.value.trim()&&f.click(),u.key==="Escape"&&i()}),r.onclick=u=>{u.target===r&&i()};function i(){r.classList.remove("open"),r.innerHTML="",a(null)}}function It(e,t,n,a){let r=h("#modalBg"),o=d("div","modal");o.innerHTML="<h3>"+k(e)+"</h3>"+(t?'<div class="sub">'+k(t)+"</div>":""),n.forEach(i=>{let u=d("div","field");u.innerHTML="<label>"+k(i.label)+"</label>"+(i.type==="select"?'<select id="'+i.id+'">'+i.html+"</select>":'<input id="'+i.id+'" type="text" value="'+k(i.value||"")+'" />'),o.appendChild(u)});let s=d("div","acts"),l=d("div");l.style.flex="1";let p=d("button","btn ghost","\u53D6\u6D88");p.onclick=f;let c=d("button","btn primary","\u786E\u5B9A");c.onclick=()=>{let i={};n.forEach(u=>i[u.id]=h("#"+u.id,o).value),a(i)!==!1&&f()},s.append(l,p,c),o.appendChild(s),r.innerHTML="",r.appendChild(o),r.classList.add("open");let v=o.querySelector("input,select");v&&(v.focus(),v.select&&v.select()),o.addEventListener("keydown",i=>{i.key==="Enter"&&i.target.tagName!=="SELECT"&&c.click(),i.key==="Escape"&&f()}),r.onclick=i=>{i.target===r&&f()};function f(){r.classList.remove("open"),r.innerHTML=""}}function Jt(){window.__copyRes=()=>{let e=y(),t=Ce(e);re(t.hasJSON?JSON.stringify(t.data,null,2):e.response.text||"","\u5DF2\u590D\u5236")},window.__dlRes=()=>{let e=y(),t=e.response;if(!t||t.error)return;let n=Ce(e),a="response",r=n.hasJSON?JSON.stringify(n.data,null,2):t.text;try{a=new URL(t.url).pathname.split("/").pop()||"response"}catch{}/\./.test(a)||(a+=n.hasJSON?".json":/html/.test(t.contentType)?".html":".txt");let o=d("a");o.href=URL.createObjectURL(new Blob([r],{type:"text/plain"})),o.download=a,o.click()},window.__askAI=()=>et(),window.__setPath=e=>{let t=y();t.respPath=e,Z()},window.__setFilter=e=>{let t=y();t.respFilter=e,Z()},window.__togglePretty=()=>{let e=y();e.pretty=!e.pretty,Z()},window.__expandAll=()=>{_(".jt-children").forEach(e=>e.style.display="block")},window.__collapseAll=()=>{_(".jt-children").forEach(e=>e.style.display="none")},window.__jtToggle=e=>{let t=e.nextElementSibling;if(t){let n=t.style.display==="none";t.style.display=n?"block":"none",e.querySelector(".jt-tog").textContent=n?"\u25BE":"\u25B8"}},window.__ctx=e=>{e.preventDefault();let t=h("#ctxMenu"),n=e.target.closest("td"),a=n?.getAttribute("data-full")||n?.textContent||"";t.innerHTML=`<button class="ctx-item" onclick="navigator.clipboard.writeText('`+k(a)+`').then(()=>{$('#ctxMenu').style.display='none'})">\u590D\u5236\u503C</button><button class="ctx-item" onclick="navigator.clipboard.writeText('`+k(n?.textContent||"")+`').then(()=>{$('#ctxMenu').style.display='none'})">\u590D\u5236\u5355\u5143\u683C</button><div class="ctx-sep"></div><button class="ctx-item" onclick="$('#ctxMenu').style.display='none'">\u590D\u5236\u5217\u540D</button>`,t.style.display="block",t.style.left=e.clientX+10+"px",t.style.top=e.clientY+10+"px",document.addEventListener("click",()=>{t.style.display="none"},{once:!0})},window.__onServerChange=e=>vt(e),window.__replaceServerUrl=()=>mt(),window.__onTemplateSelect=e=>gt(e),window.__saveTemplate=()=>yt(),window.__copyCode=()=>Rt(),window.__changeFont=e=>Et(e),window.__expandLevel=e=>zt(e),window.__toggleFullscreen=()=>_t(),window.__exportCurl=()=>Qe()}var je=null;function at(e={}){je=e.onSendToChat||null,Tt(),St(),qt(),Jt(),ht(),rt(),ot(),Se(),Ke(),K()}function qt(){let e=h("#sendBtn");e&&(e.onclick=()=>Te());let t=h("#layoutBtn");t&&(t.onclick=()=>{g.layout=g.layout==="h"?"v":"h",x(),rt(),S("\u5E03\u5C40\u5DF2\u5207\u6362\u4E3A "+(g.layout==="h"?"\u5DE6\u53F3":"\u4E0A\u4E0B"),"ok")});let n=h("#proxyBtn");n&&(n.onclick=()=>{g.proxyOn=!g.proxyOn,x(),ot(),S(g.proxyOn?"\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406":"\u5DF2\u5173\u95ED\u8DE8\u57DF\u4EE3\u7406","ok")});let a=h("#curlImportBtn");a&&(a.onclick=()=>Bt());let r=h("#curlBtn");r&&(r.onclick=()=>Qe());let o=h("#codeGenBtn");o&&(o.onclick=()=>Pt());let s=h("#aiBtn");s&&(s.onclick=()=>et());let l=h("#saveBtn");l&&(l.onclick=()=>At());let p=h("#newGroup");p&&(p.onclick=()=>{se("\u65B0\u5EFA\u5206\u7EC4","\u8F93\u5165\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4",i=>{if(i){let u={id:O(),name:i,collapsed:!1,requests:[]};b.collections.push(u),x(),Q(),S("\u5DF2\u521B\u5EFA\u5206\u7EC4\u300C"+i+"\u300D","ok")}})});let c=h("#search");c&&(c.oninput=()=>Q()),_("#modeBar .mode-btn").forEach(i=>i.onclick=()=>{_("#modeBar .mode-btn").forEach(u=>u.classList.remove("active")),i.classList.add("active"),g.mode=i.dataset.mode,x(),h("#customPanel").style.display=g.mode==="custom"?"block":"none",g.mode==="custom"&&(h("#customHint").style.display="block")}),_("#reqSubtabs .subtab").forEach(i=>i.onclick=()=>{let u=y();u&&(u.reqTab=i.dataset.rt,x(),D())}),_("#resViews .rv").forEach(i=>i.onclick=()=>{let u=y();u&&u.response&&(u.respView=i.dataset.rv,Z())}),_("#resTabs .res-tab").forEach(i=>{i.dataset.rt&&(i.onclick=()=>{_("#resTabs .res-tab").forEach(u=>u.classList.remove("active")),i.classList.add("active"),g.resTab=i.dataset.rt,x(),y()?.response&&Z()})}),_("#codeGenPanel .lang-btn").forEach(i=>i.onclick=()=>Nt(i,i.dataset.lang));let v=h("#divider");v&&(v.onmousedown=i=>{i.preventDefault();let u=h("#split"),m=u.getBoundingClientRect(),w=g.layout==="h",j=!1,E=J=>{let W=w?J.clientX-m.left-130:J.clientY-m.top-30,N=Math.max(120,Math.min(w?u.clientWidth-260:u.clientHeight-160,W));w?(g.reqW=N,u.style.setProperty("--reqW",N+"px")):(g.reqH=N,u.style.setProperty("--reqH",N+"px")),j=!0},T=()=>{document.removeEventListener("mousemove",E),document.removeEventListener("mouseup",T),j&&x()};document.addEventListener("mousemove",E),document.addEventListener("mouseup",T)}),document.addEventListener("click",()=>{let i=h("#ctxMenu");i&&(i.style.display="none")});let f=h("#url");f&&(f.onkeydown=i=>{i.key==="Enter"&&(i.preventDefault(),Te())},f.oninput=()=>{let i=y(),u=f.value;i.url=u,$(),M(i),x()}),document.addEventListener("keydown",i=>{if((i.metaKey||i.ctrlKey)&&i.key==="Enter"&&(i.preventDefault(),Te()),(i.metaKey||i.ctrlKey)&&i.key==="s"){i.preventDefault();let u=y();if(u&&u.bodyType==="json")try{u.body=JSON.stringify(JSON.parse(u.body),null,2),D(),x(),S("JSON \u5DF2\u683C\u5F0F\u5316","ok")}catch{}}})}function K(){ae(),Oe(),D(),Le(),Q(),ne()}function rt(){let e=h("#split");if(!e)return;e.classList.toggle("h",g.layout==="h");let t=ie?180:220,n=ie?320:480;e.style.setProperty("--reqH",(g.reqH||t)+"px"),e.style.setProperty("--reqW",(g.reqW||n)+"px");let a=h("#layoutBtn");a&&(a.innerHTML=g.layout==="h"?"\u21C5 \u4E0A\u4E0B":"\u21C4 \u5DE6\u53F3");let r=h("#layoutStatus");r&&(r.textContent="\u5E03\u5C40: "+(g.layout==="h"?"\u5DE6\u53F3":"\u4E0A\u4E0B"))}function ot(){let e=h("#proxyBtn");if(!e)return;e.innerHTML=g.proxyOn?"\u4EE3\u7406: \u5F00":"\u4EE3\u7406: \u5173",e.style.color=g.proxyOn?"var(--brand)":"";let t=h("#proxyStatus");t&&(t.textContent="\u4EE3\u7406: "+(g.proxyOn?"\u5F00":"\u5173"))}import{jsx as Gt}from"react/jsx-runtime";var $t=`
<header class="topbar">
  <div class="brand"><span class="dot"></span>HTTP<small>CLIENT</small></div>
  <div class="tabbar" id="tabbar"></div>
  <div class="spacer"></div>
  <div class="env-wrap">
    <button class="env-sel" id="envSel"><span class="dot"></span><span id="envName">\u65E0\u73AF\u5883</span><span class="car">\u25BE</span></button>
    <div class="env-menu" id="envMenu"></div>
  </div>
  <button class="top-act" id="curlImportBtn" title="\u7C98\u8D34 cURL \u5BFC\u5165\u4E3A\u8BF7\u6C42">\u5BFC\u5165 cURL</button>
  <button class="top-act" id="layoutBtn" title="\u5207\u6362 \u4E0A\u4E0B/\u5DE6\u53F3 \u5E03\u5C40">\u21C5 \u4E0A\u4E0B</button>
  <button class="top-act" id="proxyBtn" title="\u8DE8\u57DF\u4EE3\u7406">\u4EE3\u7406:\u5173</button>
</header>

<div class="main" id="main">
  <aside class="side">
    <div class="side-head">
      <span class="t">\u96C6\u5408 \xB7 COLLECTIONS</span>
      <button class="mini-btn" id="saveBtn" title="\u4FDD\u5B58\u5F53\u524D\u8BF7\u6C42">\u4FDD\u5B58</button>
      <button class="mini-btn" id="newGroup" title="\u65B0\u5EFA\u5206\u7EC4">\uFF0B</button>
    </div>
    <div class="side-search"><input id="search" placeholder="\u641C\u7D22\u8BF7\u6C42\u2026" /></div>
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

    <!-- \u7F16\u8F91\u533A -->
    <div class="reqbar">
      <div class="method-wrap">
        <button class="method-sel" id="methodSel"><span id="methodLabel">GET</span><span class="car">\u25BE</span></button>
        <div class="method-menu" id="methodMenu"></div>
      </div>
      <div class="url-wrap">
        <input class="url-input" id="url" placeholder="\u8BF7\u6C42 URL\uFF0C\u652F\u6301 {{baseUrl}}/path\u3001{{\u53D8\u91CF}} \u5360\u4F4D" spellcheck="false" />
        <div class="url-resolved" id="urlResolved"></div>
      </div>
      <button class="btn primary" id="sendBtn">\u53D1\u9001 <span class="k">\u2318\u21B5</span></button>
      <button class="btn icon ghost" id="curlBtn" title="\u590D\u5236\u4E3A cURL">cURL</button>
      <button class="btn icon ghost" id="codeGenBtn" title="\u4EE3\u7801\u751F\u6210">\u2318</button>
      <button class="btn icon ghost" id="aiBtn" title="AI \u5206\u6790">AI</button>
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
      <div class="custom-hint" id="customHint" style="display:none">\u{1F4CB} \u5F53\u524D\u4E3A\u5B9A\u5236\u63A5\u53E3\u6A21\u5F0F\uFF0C\u8868\u5355\u4FEE\u6539\u81EA\u52A8\u540C\u6B65\u5230 Body</div>
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

      <div class="res-region" id="resRegion">
        <!-- \u54CD\u5E94\u72B6\u6001 -->
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
        <div class="res-toolbar" id="resTools" style="display:none">
          <div class="res-views" id="resViews">
            <button class="rv" data-rv="object">\u5BF9\u8C61</button>
            <button class="rv" data-rv="table">\u8868\u683C</button>
            <button class="rv" data-rv="raw">\u539F\u59CB</button>
            <button class="rv" data-rv="headers">Headers</button>
          </div>
          <span class="sp"></span>
          <input class="path-input" placeholder="\u8DEF\u5F84 data.items" id="resPathInput" oninput="window.__setPath(this.value)" />
          <input class="filter-input" placeholder="\u8FC7\u6EE4 name:\u503C" id="resFilterInput" oninput="window.__setFilter(this.value)" />
          <button class="tbtn" id="prettyBtn" onclick="window.__togglePretty()">\u7F8E\u5316</button>
        </div>
        <div class="pane" id="resPane" style="font-size:13px">
          <div class="res-idle">
            <div class="big">\u51C6\u5907\u5C31\u7EEA</div>
            \u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002
            <div class="tips">
              \xB7 <b>\u591A tab</b>\uFF1A\u9876\u90E8 \uFF0B \u65B0\u5EFA\uFF0C\u53CC\u51FB\u6807\u7B7E\u53EF\u91CD\u547D\u540D<br>
              \xB7 <b>\u73AF\u5883\u53D8\u91CF</b>\uFF1A\u53F3\u4E0A\u89D2\u5207\u6362\u73AF\u5883\uFF0CURL \u91CC\u7528 <b>{{baseUrl}}</b><br>
              \xB7 <b>\u5BFC\u5165 cURL</b>\uFF1A\u53F3\u4E0A\u89D2\u7C98\u8D34 curl \u547D\u4EE4\u4E00\u952E\u89E3\u6790<br>
              \xB7 <b>\u8DE8\u57DF</b>\uFF1A\u9876\u680F\u300C\u4EE3\u7406\u300D\u5F00\u542F\u540E\u7ECF\u672C\u5730\u540E\u7AEF\u8F6C\u53D1
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<footer class="statusbar">
  <span class="msg" id="statusMsg">\u5C31\u7EEA</span>
  <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span><span id="layoutStatus">\u5E03\u5C40: \u5DE6\u53F3</span><span id="proxyStatus">\u4EE3\u7406: \u5173</span></span>
</footer>

<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="ctx-menu" id="ctxMenu"></div>
<div class="cell-tip" id="cellTip"></div>
`;function Dt({pluginId:e,onSendToChat:t}){let n=it(null),a=it(!1);return Ft(()=>{let r=n.current;if(!(!r||a.current)){r.innerHTML=$t;try{let o=document.createElement("style");o.setAttribute("data-polaris-http",""),o.textContent=Ee,r.prepend(o)}catch(o){console.warn("[Polaris HTTP] CSS injection failed:",o)}return de(r),We(!0,"http://127.0.0.1:9872"),at({onSendToChat:t}),a.current=!0,()=>{r.innerHTML="",de(document),a.current=!1}}},[t]),Gt("div",{ref:n,className:"polaris-http-panel",style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg, #16181e)",color:"var(--ink, #d8dae2)"}})}export{Dt as default};
