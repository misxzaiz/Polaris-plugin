import{useEffect as kt,useRef as Ve}from"react";var ke=`/* polaris-http \u2014 \u6DF1\u8272 HTTP \u8C03\u8BD5\u5668\u6837\u5F0F\uFF08RELAY \u4E3B\u9898\u98CE\u683C\uFF09 */

.polaris-http-panel {
  --brand: #4493f8;
  --brand-soft: rgba(68, 147, 248, .14);
  --brand-line: rgba(68, 147, 248, .4);
  --bg: #16181e;
  --bg2: #1b1f27;
  --bg3: #22262f;
  --bg4: #2a2f3a;
  --ink: #d8dae2;
  --ink-2: #9aa0ab;
  --ink-3: #6b7280;
  --line: #2c313d;
  --line-2: #353b49;
  --ok: #3fb950;
  --warn: #d29922;
  --err: #f85149;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: "SF Mono", "Cascadia Code", Consolas, "JetBrains Mono", monospace;
  --radius: 8px;
  --radius-sm: 6px;
  font-size: 12.5px;
}

.polaris-http-panel * { box-sizing: border-box; margin: 0; padding: 0; }

/* ===== \u9AA8\u67B6 ===== */
.polaris-http-panel .topbar {
  display: flex; align-items: center; gap: 8px;
  height: 42px; padding: 0 10px;
  background: var(--bg2); border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.polaris-http-panel .brand {
  display: flex; align-items: center; gap: 6px;
  font-weight: 700; color: var(--ink); letter-spacing: .2px; white-space: nowrap;
}
.polaris-http-panel .brand .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 8px var(--brand); }
.polaris-http-panel .brand small { font-weight: 400; color: var(--ink-3); font-size: 10px; letter-spacing: 1px; }

.polaris-http-panel .tabbar { display: flex; align-items: center; gap: 4px; flex: 1; overflow-x: auto; min-width: 0; scrollbar-width: thin; }
.polaris-http-panel .rtab {
  display: flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 8px; border-radius: 5px;
  background: var(--bg3); border: 1px solid transparent; cursor: pointer;
  white-space: nowrap; color: var(--ink-2); font-size: 12px;
}
.polaris-http-panel .rtab:hover { background: var(--bg4); color: var(--ink); }
.polaris-http-panel .rtab.active { background: var(--brand-soft); border-color: var(--brand-line); color: var(--ink); }
.polaris-http-panel .rtab .tm { font-weight: 700; font-size: 10.5px; }
.polaris-http-panel .rtab .dirty { color: var(--warn); font-size: 8px; }
.polaris-http-panel .rtab .tx { border: none; background: none; color: var(--ink-3); cursor: pointer; font-size: 12px; padding: 0 2px; border-radius: 3px; }
.polaris-http-panel .rtab .tx:hover { color: var(--err); background: var(--bg4); }
.polaris-http-panel .tab-add { height: 24px; min-width: 28px; border: 1px dashed var(--line-2); border-radius: 5px; background: none; color: var(--ink-3); cursor: pointer; font-size: 14px; }
.polaris-http-panel .tab-add:hover { color: var(--brand); border-color: var(--brand-line); }

.polaris-http-panel .spacer { flex: 1; }
.polaris-http-panel .sp { flex: 1; }

/* \u9876\u90E8\u6309\u94AE */
.polaris-http-panel .env-wrap { position: relative; }
.polaris-http-panel .env-sel {
  display: flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 8px; border-radius: 5px;
  background: var(--bg3); border: 1px solid var(--line); color: var(--ink-2); cursor: pointer; font-size: 12px;
}
.polaris-http-panel .env-sel:hover { border-color: var(--brand-line); color: var(--ink); }
.polaris-http-panel .env-sel .ehex { color: var(--brand); }
.polaris-http-panel .env-sel .car { font-size: 9px; color: var(--ink-3); }
.polaris-http-panel .env-menu {
  display: none; position: absolute; top: 29px; right: 0; z-index: 100;
  min-width: 220px; background: var(--bg3); border: 1px solid var(--line-2); border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,.4); overflow: hidden; padding: 4px;
}
.polaris-http-panel .env-menu.open { display: block; }
.polaris-http-panel .env-item {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  width: 100%; padding: 7px 8px; border: none; background: none; color: var(--ink); cursor: pointer;
  text-align: left; border-radius: 4px; font-size: 12px;
}
.polaris-http-panel .env-item:hover { background: var(--brand-soft); }
.polaris-http-panel .env-item.on { background: var(--brand-soft); }
.polaris-http-panel .env-item.on span { color: var(--brand); }
.polaris-http-panel .env-item small { color: var(--ink-3); font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel .env-item.manage { border-top: 1px solid var(--line); margin-top: 4px; color: var(--brand); }

.polaris-http-panel .top-act {
  display: flex; align-items: center; gap: 4px;
  height: 26px; padding: 0 10px; border-radius: 5px;
  background: var(--bg3); border: 1px solid var(--line); color: var(--ink-2);
  cursor: pointer; font-size: 12px; white-space: nowrap;
}
.polaris-http-panel .top-act:hover { border-color: var(--line-2); color: var(--ink); background: var(--bg4); }

.polaris-http-panel .method-menu {
  display: none; position: absolute; top: 100%; left: 0; z-index: 100;
  background: var(--bg3); border: 1px solid var(--line-2); border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,.4); overflow: hidden; min-width: 96px; padding: 3px;
}
.polaris-http-panel .method-menu.open { display: block; }
.polaris-http-panel .method-menu button { display: block; width: 100%; padding: 6px 10px; border: none; background: none; text-align: left; cursor: pointer; border-radius: 4px; font-weight: 700; }
.polaris-http-panel .method-menu button:hover { background: var(--bg4); }

/* ===== \u4E3B\u533A\u57DF ===== */
.polaris-http-panel .main {
  display: flex; flex: 1; min-height: 0; min-width: 0;
}
.polaris-http-panel .side {
  width: 210px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background: var(--bg2); border-right: 1px solid var(--line);
  overflow: hidden;
}
.polaris-http-panel .side.side-collapsed { display: none; }
.polaris-http-panel .side-head {
  display: flex; align-items: center; gap: 4px;
  height: 34px; padding: 0 10px; border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.polaris-http-panel .side-head .t { flex: 1; font-size: 10.5px; letter-spacing: 1px; color: var(--ink-3); font-weight: 600; }
.polaris-http-panel .mini-btn {
  height: 20px; padding: 0 7px; border: 1px solid var(--line); background: var(--bg3);
  color: var(--ink-2); border-radius: 4px; cursor: pointer; font-size: 11px;
}
.polaris-http-panel .mini-btn:hover { color: var(--ink); border-color: var(--line-2); }
.polaris-http-panel .side-search { padding: 8px 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.polaris-http-panel .side-search input {
  width: 100%; height: 26px; padding: 0 8px;
  background: var(--bg3); border: 1px solid var(--line); border-radius: 5px;
  color: var(--ink); font-size: 12px;
}
.polaris-http-panel .side-search input:focus { outline: none; border-color: var(--brand-line); }
.polaris-http-panel .tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.polaris-http-panel .tree-empty { padding: 12px; color: var(--ink-3); font-size: 12px; }

.polaris-http-panel .group { margin-bottom: 1px; }
.polaris-http-panel .group-head {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; cursor: pointer; color: var(--ink-2);
  font-size: 12px; user-select: none;
}
.polaris-http-panel .group-head:hover { background: var(--bg3); color: var(--ink); }
.polaris-http-panel .group-head .caret { font-size: 9px; color: var(--ink-3); transition: transform .15s; }
.polaris-http-panel .group.collapsed .caret { transform: rotate(-90deg); }
.polaris-http-panel .group-head .gname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel .group-head .gcount { font-size: 10.5px; color: var(--ink-3); }
.polaris-http-panel .group.collapsed .reqs { display: none; }
.polaris-http-panel .req-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px 5px 22px; cursor: pointer; border-radius: 0;
  color: var(--ink-2); font-size: 12px;
}
.polaris-http-panel .req-item:hover { background: var(--bg3); color: var(--ink); }
.polaris-http-panel .req-item.active { background: var(--brand-soft); color: var(--ink); }
.polaris-http-panel .req-item .mb { font-size: 9.5px; font-weight: 700; letter-spacing: .3px; min-width: 38px; }
.polaris-http-panel .req-item .rn { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.polaris-http-panel .work { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

/* ===== \u8BF7\u6C42\u680F ===== */
.polaris-http-panel .reqbar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; background: var(--bg2); border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.polaris-http-panel .method-wrap { position: relative; }
.polaris-http-panel .method-sel {
  display: flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 10px; border-radius: 6px;
  background: var(--bg3); border: 1px solid var(--line); color: var(--ink);
  cursor: pointer; font-weight: 700; font-size: 12.5px; min-width: 74px;
}
.polaris-http-panel .method-sel:hover { border-color: var(--line-2); }
.polaris-http-panel .method-sel .car { font-size: 9px; color: var(--ink-3); margin-left: 2px; }
.polaris-http-panel .url-wrap { flex: 1; position: relative; min-width: 0; }
.polaris-http-panel .url-input {
  width: 100%; height: 30px; padding: 0 10px;
  background: var(--bg3); border: 1px solid var(--line); border-radius: 6px;
  color: var(--ink); font-size: 12.5px; font-family: var(--mono);
}
.polaris-http-panel .url-input:focus { outline: none; border-color: var(--brand-line); }
.polaris-http-panel .url-resolved {
  display: none; margin-top: 4px; font-size: 11px; color: var(--ink-3);
  font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.polaris-http-panel .url-resolved b { color: var(--brand); }

.polaris-http-panel .btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 14px; border-radius: 6px;
  background: var(--bg3); border: 1px solid var(--line); color: var(--ink);
  cursor: pointer; font-size: 12.5px; white-space: nowrap;
}
.polaris-http-panel .btn:hover { border-color: var(--line-2); background: var(--bg4); }
.polaris-http-panel .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 600; }
.polaris-http-panel .btn.primary:hover { background: #3a86e8; }
.polaris-http-panel .btn.primary:disabled { opacity: .55; cursor: default; }
.polaris-http-panel .btn.icon { padding: 0 9px; }
.polaris-http-panel .btn.ghost { background: none; }
.polaris-http-panel .btn.danger { color: var(--err); border-color: var(--line-2); }
.polaris-http-panel .btn.danger:hover { background: rgba(248,81,73,.1); }
.polaris-http-panel .btn .k { font-size: 10px; color: var(--ink-3); font-family: var(--mono); border: 1px solid var(--line-2); border-radius: 3px; padding: 1px 4px; }
.polaris-http-panel .btn.primary .k { color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.3); }

/* ===== split \u5BB9\u5668\uFF08G \u5E03\u5C40\uFF1Aflex column\uFF1BH \u5E03\u5C40\uFF1Aflex row\uFF09===== */
.polaris-http-panel .split {
  flex: 1; min-height: 0; min-width: 0;
  display: flex; flex-direction: column; position: relative;
}
.polaris-http-panel .split.h { flex-direction: row; }
.polaris-http-panel .split .req-region {
  flex: 0 0 auto;
  height: var(--reqH, 220px);
  display: flex; flex-direction: column; min-height: 0;
  border-bottom: 1px solid var(--line); background: var(--bg);
}
.polaris-http-panel .split.h .req-region {
  height: auto; width: var(--reqW, 480px);
  border-bottom: none; border-right: 1px solid var(--line);
}
.polaris-http-panel .split .res-region {
  display: flex; flex-direction: column; min-width: 0; min-height: 0;
  position: relative; background: var(--bg);
}
.polaris-http-panel .split.h .res-region { flex: 1; }
.polaris-http-panel .divider {
  flex: 0 0 3px; background: var(--line); cursor: row-resize; position: relative; z-index: 2;
}
.polaris-http-panel .split.h .divider { flex: none; width: 3px; cursor: col-resize; }
.polaris-http-panel .divider:hover { background: var(--brand-line); }

/* \u5B50\u6807\u7B7E\u9875 */
.polaris-http-panel .subtabs {
  display: flex; align-items: center; gap: 2px;
  height: 32px; padding: 0 8px; border-bottom: 1px solid var(--line);
  flex-shrink: 0; overflow-x: auto;
}
.polaris-http-panel .subtab {
  height: 24px; padding: 0 10px; border: none; background: none;
  color: var(--ink-3); cursor: pointer; font-size: 12px;
  border-bottom: 2px solid transparent;
}
.polaris-http-panel .subtab:hover { color: var(--ink-2); }
.polaris-http-panel .subtab.active { color: var(--brand); border-bottom-color: var(--brand); font-weight: 600; }
.polaris-http-panel .subtab.disabled { opacity: .35; cursor: default; }

.polaris-http-panel .pane { flex: 1; overflow: auto; min-height: 0; position: relative; }

/* ===== KV \u884C ===== */
.polaris-http-panel .kv { padding: 6px 8px; }
.polaris-http-panel .kv-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.polaris-http-panel .kv-row:last-child { margin-bottom: 0; }
.polaris-http-panel .kv-row.blank input { background: transparent; }
.polaris-http-panel .kv-row label.ck { display: flex; align-items: center; width: 16px; flex-shrink: 0; }
.polaris-http-panel .kv-row input[type="checkbox"] { accent-color: var(--brand); }
.polaris-http-panel .kv-row input.k, .polaris-http-panel .kv-row input.v {
  height: 26px; padding: 0 8px;
  background: var(--bg3); border: 1px solid var(--line); border-radius: 5px;
  color: var(--ink); font-size: 12px;
}
.polaris-http-panel .kv-row input.k { width: 38%; font-family: var(--mono); }
.polaris-http-panel .kv-row input.v { flex: 1; font-family: var(--mono); }
.polaris-http-panel .kv-row input:focus { outline: none; border-color: var(--brand-line); }
.polaris-http-panel .kv-row input.k::placeholder, .polaris-http-panel .kv-row input.v::placeholder { color: var(--ink-3); }
.polaris-http-panel .kv-row .rm {
  width: 22px; height: 22px; border: none; background: none;
  color: var(--ink-3); cursor: pointer; border-radius: 4px; font-size: 12px; flex-shrink: 0;
}
.polaris-http-panel .kv-row .rm:hover { color: var(--err); background: rgba(248,81,73,.1); }

.polaris-http-panel .suggest { display: flex; flex-wrap: wrap; gap: 5px; padding: 4px 8px 8px; border-top: 1px dashed var(--line); margin-top: 6px; }
.polaris-http-panel .suggest .lbl { color: var(--ink-3); font-size: 10.5px; padding-top: 3px; width: 100%; }
.polaris-http-panel .chip {
  height: 22px; padding: 0 8px; border-radius: 4px; border: 1px solid var(--line);
  background: var(--bg3); color: var(--ink-2); cursor: pointer; font-size: 11px;
}
.polaris-http-panel .chip:hover { border-color: var(--brand-line); color: var(--brand); }

/* ===== Body \u7F16\u8F91 ===== */
.polaris-http-panel .body-bar { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px; border-bottom: 1px solid var(--line); }
.polaris-http-panel .body-bar .seg { display: flex; gap: 2px; background: var(--bg3); border-radius: 5px; padding: 2px; }
.polaris-http-panel .body-bar .seg button { height: 24px; padding: 0 10px; border: none; background: none; color: var(--ink-3); cursor: pointer; font-size: 12px; border-radius: 4px; }
.polaris-http-panel .body-bar .seg button.on { background: var(--brand); color: #fff; font-weight: 600; }
.polaris-http-panel .body-bar button.tool {
  height: 24px; padding: 0 8px; border: 1px solid var(--line); background: var(--bg3);
  color: var(--ink-2); border-radius: 4px; cursor: pointer; font-size: 11px;
}
.polaris-http-panel .body-bar button.tool:hover { border-color: var(--brand-line); color: var(--brand); }
.polaris-http-panel .body-none { padding: 14px; color: var(--ink-3); font-size: 12px; }

.polaris-http-panel textarea.code {
  font-family: var(--mono); background: var(--bg); color: var(--ink);
  border: 1px solid var(--line); border-radius: 6px;
}

/* ===== \u54CD\u5E94 ===== */
.polaris-http-panel .res-status {
  display: flex; align-items: center; gap: 12px;
  padding: 6px 10px; background: var(--bg2); border-bottom: 1px solid var(--line);
  flex-shrink: 0; font-size: 12px;
}
.polaris-http-panel .status-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 700; font-family: var(--mono);
}
.polaris-http-panel .status-chip .dotc { width: 7px; height: 7px; border-radius: 50%; }
.polaris-http-panel .status-chip.s2 .dotc { background: var(--ok); }
.polaris-http-panel .status-chip.s3 .dotc { background: var(--warn); }
.polaris-http-panel .status-chip.s4 .dotc { background: var(--err); }
.polaris-http-panel .status-chip.s5 .dotc { background: var(--err); }
.polaris-http-panel .status-chip.s2 { color: var(--ok); }
.polaris-http-panel .status-chip.s3 { color: var(--warn); }
.polaris-http-panel .status-chip.s4, .polaris-http-panel .status-chip.s5 { color: var(--err); }
.polaris-http-panel .res-meta { display: flex; gap: 14px; color: var(--ink-3); font-size: 11.5px; }
.polaris-http-panel .res-meta b { color: var(--ink-2); font-weight: 600; }
.polaris-http-panel .res-status .tool {
  height: 22px; padding: 0 8px; border: 1px solid var(--line); background: var(--bg3);
  color: var(--ink-2); border-radius: 4px; cursor: pointer; font-size: 11px;
}
.polaris-http-panel .res-status .tool:hover { border-color: var(--brand-line); color: var(--brand); }

.polaris-http-panel .res-tools {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; flex-wrap: wrap;
}
.polaris-http-panel .res-tools .lbl { font-size: 10.5px; color: var(--ink-3); letter-spacing: .5px; }
.polaris-http-panel .res-tools .path-select {
  max-width: 220px; height: 24px; background: var(--bg3); border: 1px solid var(--line);
  border-radius: 4px; color: var(--ink-2); font-size: 11.5px; font-family: var(--mono);
}
.polaris-http-panel .res-tools .path-input, .polaris-http-panel .res-tools .filter-input {
  height: 24px; padding: 0 8px; background: var(--bg3); border: 1px solid var(--line);
  border-radius: 4px; color: var(--ink); font-size: 11.5px; font-family: var(--mono); min-width: 160px; flex: 1; max-width: 280px;
}
.polaris-http-panel .res-tools input:focus, .polaris-http-panel .res-tools select:focus { outline: none; border-color: var(--brand-line); }
.polaris-http-panel .res-tools .tool {
  height: 22px; padding: 0 8px; border: 1px solid var(--line); background: var(--bg3);
  color: var(--ink-2); border-radius: 4px; cursor: pointer; font-size: 11px;
}
.polaris-http-panel .res-tools .tool:hover { border-color: var(--brand-line); color: var(--brand); }

.polaris-http-panel .res-idle {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; height: 100%; color: var(--ink-3); text-align: center; padding: 20px;
}
.polaris-http-panel .res-idle .big { font-size: 18px; font-weight: 700; color: var(--ink-2); letter-spacing: 1px; }
.polaris-http-panel .res-idle .tips { font-size: 11.5px; line-height: 1.9; text-align: left; background: var(--bg2); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 16px; }
.polaris-http-panel .res-idle .tips b { color: var(--brand); }

.polaris-http-panel .res-loading { display: flex; align-items: center; justify-content: center; gap: 10px; height: 100%; color: var(--ink-2); }
.polaris-http-panel .spin { width: 16px; height: 16px; border: 2px solid var(--line-2); border-top-color: var(--brand); border-radius: 50%; animation: pspin .7s linear infinite; }
@keyframes pspin { to { transform: rotate(360deg); } }

.polaris-http-panel .res-err { display: flex; flex-direction: column; gap: 6px; padding: 20px; color: var(--err); font-size: 12.5px; }
.polaris-http-panel .res-err .ti { font-weight: 700; font-size: 14px; }
.polaris-http-panel .res-empty { padding: 16px; color: var(--ink-3); font-size: 12px; }

.polaris-http-panel .raw-view {
  padding: 10px 12px; font-family: var(--mono); font-size: 12px; line-height: 1.6;
  color: var(--ink); white-space: pre-wrap; word-break: break-all;
}
.polaris-http-panel .prev-frame { width: 100%; height: 100%; border: none; background: #fff; }
.polaris-http-panel .prev-img-wrap { display: flex; align-items: center; justify-content: center; height: 100%; padding: 12px; }
.polaris-http-panel .prev-img-wrap img { max-width: 100%; max-height: 100%; border-radius: 6px; }
.polaris-http-panel .prev-none { padding: 20px; color: var(--ink-3); text-align: center; }

/* ===== JSON \u6811 ===== */
.polaris-http-panel .jt { font-family: var(--mono); font-size: 12px; padding: 8px 12px; }
.polaris-http-panel .jt-row { padding: 1px 0; }
.polaris-http-panel .jt-row:hover { background: var(--bg2); border-radius: 4px; }
.polaris-http-panel .jt-k { color: #7dd3fc; }
.polaris-http-panel .jt-str { color: #a5d6a7; }
.polaris-http-panel .jt-num { color: #ffd28f; }
.polaris-http-panel .jt-bool { color: #c792ea; }
.polaris-http-panel .jt-null { color: var(--ink-3); font-style: italic; }
.polaris-http-panel .jt-tog { cursor: pointer; color: var(--ink-3); user-select: none; }
.polaris-http-panel .jt-children { padding-left: 18px; }
.polaris-http-panel .jt-key { color: var(--ink-2); white-space: nowrap; }
.polaris-http-panel .jt-mark { background: var(--warn); color: #000; border-radius: 2px; padding: 0 2px; }

/* \u8868\u683C\u89C6\u56FE */
.polaris-http-panel .tbl-wrap { overflow: auto; padding: 6px; }
.polaris-http-panel table.dt { border-collapse: collapse; width: 100%; font-size: 12px; }
.polaris-http-panel table.dt th {
  text-align: left; padding: 6px 10px; background: var(--bg3); color: var(--ink-2);
  font-weight: 600; border: 1px solid var(--line); position: sticky; top: 0; z-index: 2;
  cursor: pointer; white-space: nowrap; user-select: none;
}
.polaris-http-panel table.dt th.sort-asc::after { content: ' \u25B2'; font-size: 9px; }
.polaris-http-panel table.dt th.sort-desc::after { content: ' \u25BC'; font-size: 9px; }
.polaris-http-panel table.dt td { padding: 5px 10px; border: 1px solid var(--line); color: var(--ink-2); vertical-align: top; }
.polaris-http-panel table.dt td.jt-key { color: var(--ink-2); white-space: nowrap; }
.polaris-http-panel table.dt tbody tr:nth-child(even) { background: var(--bg2); }
.polaris-http-panel table.dt tbody tr:hover { background: var(--brand-soft); }

/* ===== \u72B6\u6001\u680F ===== */
.polaris-http-panel .statusbar {
  display: flex; align-items: center; gap: 10px;
  height: 22px; padding: 0 10px;
  background: var(--bg2); border-top: 1px solid var(--line);
  flex-shrink: 0; font-size: 11px; color: var(--ink-3);
}
.polaris-http-panel .statusbar .msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.polaris-http-panel .statusbar .msg.ok { color: var(--ok); }
.polaris-http-panel .statusbar .msg.err { color: var(--err); }
.polaris-http-panel .statusbar .msg.warn { color: var(--warn); }
.polaris-http-panel .statusbar .seg-r { display: flex; gap: 12px; }
.polaris-http-panel .statusbar .seg-r span { white-space: nowrap; }
.polaris-http-panel .statusbar .seg-r b { color: var(--ink-2); }

/* ===== \u6A21\u6001\u6846 ===== */
.polaris-http-panel .modal-bg {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.5); align-items: center; justify-content: center;
}
.polaris-http-panel .modal-bg.open { display: flex; }
.polaris-http-panel .modal {
  width: 420px; max-width: 92vw; max-height: 82vh; overflow: auto;
  background: var(--bg2); border: 1px solid var(--line-2); border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,.55); padding: 16px;
}
.polaris-http-panel .modal.wide { width: 560px; }
.polaris-http-panel .modal h3 { font-size: 15px; color: var(--ink); margin-bottom: 4px; }
.polaris-http-panel .modal .sub { font-size: 12px; color: var(--ink-3); margin-bottom: 12px; line-height: 1.6; }
.polaris-http-panel .modal .field { margin-bottom: 10px; }
.polaris-http-panel .modal .field label { display: block; font-size: 11px; color: var(--ink-3); margin-bottom: 4px; letter-spacing: .3px; }
.polaris-http-panel .modal .field input, .polaris-http-panel .modal .field select {
  width: 100%; height: 28px; padding: 0 8px;
  background: var(--bg3); border: 1px solid var(--line); border-radius: 5px;
  color: var(--ink); font-size: 12px;
}
.polaris-http-panel .modal .field input:focus, .polaris-http-panel .modal .field select:focus { outline: none; border-color: var(--brand-line); }
.polaris-http-panel .modal .field textarea.curl-ta {
  width: 100%; height: 100px; min-height: 80px; padding: 8px;
  background: var(--bg3); border: 1px solid var(--line); border-radius: 5px;
  color: var(--ink); font-size: 12px; font-family: var(--mono); resize: vertical;
}
.polaris-http-panel .modal .acts { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.polaris-http-panel .modal .acts .btn { height: 28px; padding: 0 14px; font-size: 12px; }
.polaris-http-panel .modal .acts .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }

/* env tabs */
.polaris-http-panel .env-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.polaris-http-panel .env-tab {
  height: 24px; padding: 0 10px; border: 1px solid var(--line); background: var(--bg3);
  color: var(--ink-2); border-radius: 5px; cursor: pointer; font-size: 12px;
}
.polaris-http-panel .env-tab.on { border-color: var(--brand-line); background: var(--brand-soft); color: var(--brand); }
.polaris-http-panel .env-tab.add { border-style: dashed; color: var(--ink-3); }
.polaris-http-panel .env-tab.add:hover { color: var(--brand); }
.polaris-http-panel .env-vars { max-height: 180px; overflow-y: auto; }

/* ===== Toast / \u53F3\u952E\u83DC\u5355 / \u63D0\u793A ===== */
.polaris-http-panel .toast {
  display: none; position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
  background: var(--bg3); border: 1px solid var(--line-2); color: var(--ink);
  padding: 8px 16px; border-radius: 6px; font-size: 12px; z-index: 2000;
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.polaris-http-panel .toast.show { display: block; animation: ftshow .15s ease; }
@keyframes ftshow { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }

.polaris-http-panel .ctx-menu {
  display: none; position: fixed; z-index: 1500; min-width: 140px;
  background: var(--bg3); border: 1px solid var(--line-2); border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); padding: 4px; font-size: 12px;
}
.polaris-http-panel .ctx-menu .ctx-item {
  display: block; width: 100%; padding: 6px 8px; border: none; background: none;
  color: var(--ink); text-align: left; cursor: pointer; border-radius: 4px; font-size: 12px;
}
.polaris-http-panel .ctx-menu .ctx-item:hover { background: var(--brand-soft); color: var(--brand); }
.polaris-http-panel .ctx-menu .ctx-sep { height: 1px; background: var(--line); margin: 4px 0; }

.polaris-http-panel .cell-tip {
  display: none; position: fixed; z-index: 1600;
  max-width: 360px; padding: 6px 10px;
  background: var(--bg3); border: 1px solid var(--brand-line); border-radius: 5px;
  color: var(--ink); font-size: 12px; font-family: var(--mono);
  box-shadow: 0 8px 24px rgba(0,0,0,.5); white-space: pre-wrap; word-break: break-all;
}

/* \u4EE3\u7801\u751F\u6210\u6A21\u6001\u6846 */
.polaris-http-panel .code-modal { width: 520px; }
.polaris-http-panel .code-langs {
  display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;
  background: var(--bg3); border-radius: 6px; padding: 3px;
}
.polaris-http-panel .code-langs button {
  height: 24px; padding: 0 12px; border: none; background: none;
  color: var(--ink-3); cursor: pointer; font-size: 12px; border-radius: 4px;
}
.polaris-http-panel .code-langs button:hover { color: var(--ink); }
.polaris-http-panel .code-langs button.on { background: var(--brand); color: #fff; font-weight: 600; }
.polaris-http-panel .code-output {
  max-height: 340px; overflow: auto; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--ink);
  white-space: pre; word-break: break-all; tab-size: 2;
}

/* \u6EDA\u52A8\u6761 */
.polaris-http-panel ::-webkit-scrollbar { width: 8px; height: 8px; }
.polaris-http-panel ::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 4px; }
.polaris-http-panel ::-webkit-scrollbar-thumb:hover { background: var(--ink-3); }
.polaris-http-panel ::-webkit-scrollbar-track { background: transparent; }`;var oe=document;function ae(e){oe=e||document}function v(e,t){return(t||oe).querySelector(e)}function $(e,t){return(t||oe).querySelectorAll(e)}function z(){return"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}function m(e){if(e==null)return"";let t=document.createElement("div");return t.textContent=String(e),t.innerHTML}function p(e,t,n){let r=document.createElement(e);return t&&(r.className=t),n!=null&&(r.innerHTML=n),r}var we=["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"],Ke={GET:"#3fb950",POST:"#4493f8",PUT:"#d29922",PATCH:"#a371f7",DELETE:"#f85149",HEAD:"#8b949e",OPTIONS:"#8b949e"};function Y(e){return Ke[e]||"#8b949e"}function se(e){return e==null?"\u2014":e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB"}function ie(e){return e==null?"\u2014":e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s"}function j(e,t){let n=v("#statusMsg");n&&(n.textContent=e,n.className=t?"msg "+t:"msg")}function le(e,t){navigator.clipboard.writeText(e).then(()=>{j(t||"\u5DF2\u590D\u5236","ok")}).catch(()=>{})}var w=()=>({id:z(),enabled:!0,key:"",value:""});function F(e,t){let n=p("div","kv");function r(){(!e.length||e[e.length-1].key||e[e.length-1].value)&&e.push(w())}function o(){n.innerHTML="",r(),e.forEach((a,i)=>{let d=p("div","kv-row"+(!a.key&&!a.value?" blank":"")),l=p("input");l.type="checkbox",l.checked=a.enabled!==!1,l.onchange=()=>{a.enabled=l.checked,t.onChange?.()};let b=p("input","k");b.type="text",b.placeholder=t.kPlace||"Key",b.value=a.key||"",b.spellcheck=!1;let f=p("input","v");f.type="text",f.placeholder=t.vPlace||"Value",f.value=a.value||"",f.spellcheck=!1;let c=()=>{if(a.key=b.value,a.value=f.value,d.classList.toggle("blank",!a.key&&!a.value),(a.key||a.value)&&i===e.length-1){e.push(w()),o(),t.onChange?.();return}t.onChange?.()};b.addEventListener("input",c),f.addEventListener("input",c);let s=p("button","rm","\u2715");s.onclick=()=>{e.splice(i,1),o(),t.onChange?.()};let h=p("label","ck");h.appendChild(l),d.append(h,b,f,s),n.appendChild(d)})}return o(),n}var Te={tabs:"polaris.http.tabs.v2",collections:"polaris.http.collections.v2",envs:"polaris.http.envs.v2",ui:"polaris.http.ui.v2",history:"polaris.http.history.v2",templates:"polaris.http.templates.v2",globalHeaders:"polaris.http.globalHeaders.v2",servers:"polaris.http.servers.v2"},_=e=>e===void 0?void 0:JSON.parse(JSON.stringify(e)),pe=class{constructor(){this._listeners={},this._data={},this._loadAll()}_loadAll(){for(let[t,n]of Object.entries(Te))try{let r=localStorage.getItem(n);this._data[t]=r?JSON.parse(r):void 0}catch{this._data[t]=void 0}}get(t){return _(this._data[t])}set(t,n){this._data[t]=_(n);try{localStorage.setItem(Te[t],JSON.stringify(this._data[t]))}catch{}this._emit(t,_(n))}update(t,n){let r=this._data[t];r&&typeof r=="object"?this.set(t,{...r,...n}):this.set(t,n)}subscribe(t,n){return(this._listeners[t]||=[]).push(n),()=>{let r=this._listeners[t];r&&(this._listeners[t]=r.filter(o=>o!==n))}}_emit(t,n){(this._listeners[t]||[]).forEach(r=>{try{r(n)}catch(o){console.error("[polaris-http store]",o)}})}},te=new pe;function Se(e){try{return{ok:!0,value:JSON.parse(e)}}catch{return{ok:!1}}}function Ce(e){return e==null?"\u2014":e<1024?e+" B":e<1048576?(e/1024).toFixed(1)+" KB":(e/1048576).toFixed(2)+" MB"}function Le(e){return e==null?"\u2014":e<1e3?Math.round(e)+" ms":(e/1e3).toFixed(2)+" s"}function U(e,t){return e==null||String(e).indexOf("{{")<0?e:String(e).replace(/\{\{\s*([\w.\-$]+)\s*\}\}/g,(n,r)=>{if(r.startsWith("$"))return Xe(r);if(!t)return n;if(r==="baseUrl")return t.baseUrl||"";let o=(t.vars||[]).find(a=>a.enabled!==!1&&a.key===r);return o?o.value:n})}function Xe(e){switch(e){case"$guid":case"$uuid":return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,t=>(t==="x"?Math.random()*16|0:Math.random()*16|0|8).toString(16));case"$timestamp":return String(Math.floor(Date.now()/1e3));case"$timestampMs":return String(Date.now());case"$isoTimestamp":return new Date().toISOString();case"$randomInt":return String(Math.floor(Math.random()*1e4));case"$randomFloat":return String(Math.random().toFixed(4));case"$localDate":return new Date().toISOString().slice(0,10);case"$localTime":return new Date().toTimeString().slice(0,8);default:return"{{"+e+"}}"}}function Ee(e){let t=Ye(e.trim());t[0]==="curl"&&t.shift();let n=[],r="GET",o="",a=[],i=!1;for(let h=0;h<t.length;h++){let g=t[h],x=()=>t[++h]||"";if(g==="-X"||g==="--request")r=x()||"GET";else if(g.startsWith("-X")&&g.length>2)r=g.slice(2);else if(g==="-H"||g==="--header")je(n,x());else if(g.startsWith("-H")&&g.length>2)je(n,g.slice(2));else if(["-d","--data","--data-raw","--data-ascii","--data-binary","--data-urlencode"].includes(g))a.push(x());else if(g.startsWith("-d")&&g.length>2)a.push(g.slice(2));else if(g==="-u"||g==="--user")try{n.push({id:J(),enabled:!0,key:"Authorization",value:"Basic "+btoa(x())})}catch{}else g==="-b"||g==="--cookie"?n.push({id:J(),enabled:!0,key:"Cookie",value:x()}):g==="-A"||g==="--user-agent"?n.push({id:J(),enabled:!0,key:"User-Agent",value:x()}):g==="-e"||g==="--referer"?n.push({id:J(),enabled:!0,key:"Referer",value:x()}):g==="-G"||g==="--get"?i=!0:g==="--url"?o=x():["--compressed","-L","--location","-k","--insecure","-s","--silent","-S","--show-error","-i","--include","-v","--verbose","-f","--fail","-#","--progress-bar","-N","--no-buffer"].includes(g)||g.startsWith("-")||o||(o=g)}r||(r=a.length&&!i?"POST":"GET"),r=r.toUpperCase();let d=a.join("&");i&&d&&(o+=(o.includes("?")?"&":"?")+d,d="");let l=n.find(h=>h.key.toLowerCase()==="content-type"),b="none";if(d&&(l&&/json/i.test(l.value)||/^\s*[\[{]/.test(d)?b="json":b="text"),b==="json")try{d=JSON.stringify(JSON.parse(d),null,2)}catch{}let f=[],c=o,s=o.indexOf("?");return s>=0&&(c=o.slice(0,s),o.slice(s+1).split("&").forEach(h=>{if(!h)return;let g=h.indexOf("=");f.push({id:J(),enabled:!0,key:decodeURIComponent(g>=0?h.slice(0,g):h),value:decodeURIComponent(g>=0?h.slice(g+1):"")})})),f.push({id:J(),enabled:!0,key:"",value:""}),{method:r,url:c,headers:n,params:f,body:d,bodyType:b}}function Ye(e){e=e.replace(/\\\r?\n/g," ");let t=[],n="",r=null,o=!1;for(let a=0;a<e.length;a++){let i=e[a];r?i===r?r=null:i==="\\"&&r==='"'?n+=e[++a]||"":n+=i:i==='"'||i==="'"?(r=i,o=!0):i===" "||i==="	"||i===`
`||i==="\r"?o&&(t.push(n),n="",o=!1):(n+=i,o=!0)}return o&&t.push(n),t}function je(e,t){let n=t.indexOf(":");if(n<0){e.push({id:J(),enabled:!0,key:t.trim(),value:""});return}e.push({id:J(),enabled:!0,key:t.slice(0,n).trim(),value:t.slice(n+1).trim()})}function J(){return"id"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}function Ze(e,t){let n=l=>t?resolveVars(l,t):l,r=l=>"'"+String(l).replace(/'/g,"'\\''")+"'",o=n(e.url||"");/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(o)||(o="https://"+o);let a=["curl -X "+e.method+" "+r(o)],i={};e.headers&&e.headers.filter(l=>l.enabled!==!1&&l.key).forEach(l=>i[n(l.key)]=n(l.value));let d=null;return["GET","HEAD"].includes(e.method)||(e.bodyType==="json"?(d=n(e.body||""),Object.keys(i).some(l=>l.toLowerCase()==="content-type")||(i["Content-Type"]="application/json")):e.bodyType==="text"?d=n(e.body||""):e.bodyType==="form"&&Array.isArray(e.formBody)&&(d=e.formBody.filter(l=>l.enabled!==!1&&l.key).map(l=>encodeURIComponent(n(l.key))+"="+encodeURIComponent(n(l.value||""))).join("&"))),Object.entries(i).forEach(([l,b])=>a.push("-H "+r(l+": "+b))),d&&a.push("--data-raw "+r(d)),a.join(` \\
  `)}function Me(e,t,n){let r=b=>n?resolveVars(b,n):b,o=r(e.url||"");/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(o)||(o="https://"+o);let a={};e.headers&&e.headers.filter(b=>b.enabled!==!1&&b.key).forEach(b=>a[r(b.key)]=r(b.value));let i=(e.method||"GET").toUpperCase(),d=null;["GET","HEAD"].includes(i)||(e.bodyType==="json"||e.bodyType==="text")&&(d=r(e.body||""));let l={curl:Ze(e,n),python:`import requests

url = ${JSON.stringify(o)}
headers = ${JSON.stringify(a)}
response = requests.${i.toLowerCase()}(url, headers=headers${d?", json="+d:""})
print(response.json())`,js:`const response = await fetch(${JSON.stringify(o)}, {
  method: ${JSON.stringify(i)},
  headers: ${JSON.stringify(a)}
${d?",  body: "+JSON.stringify(d):""}
})
const data = await response.json()
console.log(data)`,go:`package main

import (
  "fmt"
  "io/ioutil"
  "net/http"
)

func main() {
  url := ${JSON.stringify(o)}
  req, _ := http.NewRequest(${JSON.stringify(i)}, url, nil)
  ${Object.entries(a).map(([b,f])=>`req.Header.Set(${JSON.stringify(b)}, ${JSON.stringify(f)})`).join(`
  `)}
  client := &http.Client{}
  resp, _ := client.Do(req)
  body, _ := ioutil.ReadAll(resp.Body)
  fmt.Println(string(body))
}`,rust:`use reqwest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let client = reqwest::Client::new();
  let resp = client.${i.toLowerCase()}(${JSON.stringify(o)})${Object.entries(a).map(([b,f])=>`
    .header(${JSON.stringify(b)}, ${JSON.stringify(f)})`).join("")}
    .send().await?;
  println!("{:#?}", resp.text().await?);
  Ok(())
}`};return l[t]||l.curl}function He(e,t){if(!t)return{ok:!0,value:e};let n=t.split(/[.[\]]/).filter(Boolean),r=e;for(let o of n){if(r==null||!(o in r))return{ok:!1};r=r[o]}return{ok:!0,value:r}}function he(e,t=""){let n=[{path:"",kind:typeof e=="object"?Array.isArray(e)?"array":"object":"scalar",count:Array.isArray(e)?e.length:e&&typeof e=="object"?Object.keys(e).length:0}];if(e&&typeof e=="object")for(let[r,o]of Object.entries(e)){let a=t?t+"."+r:r,i=Array.isArray(o)?"array":o&&typeof o=="object"?"object":"scalar",d=Array.isArray(o)?o.length:o&&typeof o=="object"?Object.keys(o).length:0;n.push({path:a,kind:i,count:d}),(i==="array"||i==="object")&&d>0&&d<100&&n.push(...he(o,a))}return n}function de(e,t,n){if(!t.length)return!0;let r=JSON.stringify(e||"");for(let o of t)if(o.type==="field"){let a=e[o.field];if(a==null||String(a)!==o.value&&!String(a).toLowerCase().includes(o.value.toLowerCase()))return!1}else if(o.type==="negate"){if(r.toLowerCase().includes(o.value.toLowerCase()))return!1}else if(!r.toLowerCase().includes(o.value.toLowerCase()))return!1;return!0}function ce(e,t,n){if(e==null)return{kind:e===null?"null":"undefined",text:""};if(typeof e=="number")return{kind:"number",text:String(e)};if(typeof e=="boolean")return{kind:"bool",text:String(e)};if(typeof e=="object")return{kind:"object",text:JSON.stringify(e).slice(0,60)};if(n&&typeof e=="string"){if(/^https?:\/\/\S+\.(png|jpg|jpeg|gif|svg|webp)/i.test(e))return{kind:"image",url:e,text:e};if(/^https?:\/\//.test(e))return{kind:"link",url:e,text:e};if(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(e))return{kind:"time",date:new Date(e),raw:e,text:e}}return{kind:"string",text:e}}function ue(e){if(!e||isNaN(e.getTime()))return"";let t=n=>String(n).padStart(2,"0");return e.getFullYear()+"-"+t(e.getMonth()+1)+"-"+t(e.getDate())+" "+t(e.getHours())+":"+t(e.getMinutes())}function Qe(e){try{return new URL(e).pathname.split("/").pop()||e}catch{return e}}function et(e){let t=[];if(Array.isArray(e))e.length&&e.every(n=>n&&typeof n=="object"&&!Array.isArray(n))&&t.push({path:"__root",data:e,label:"(\u6839)",count:e.length}),t.push({path:"__self",data:e,label:"(\u503C\u5217\u8868)",count:e.length});else if(e&&typeof e=="object")for(let[n,r]of Object.entries(e))Array.isArray(r)&&r.length&&r.every(o=>o&&typeof o=="object"&&!Array.isArray(o))&&t.push({path:n,data:r,label:n,count:r.length});return t}function be(e,t={}){let{depth:n=0,maxDepth:r=12,filterAst:o=[],plainText:a="",pretty:i=!1,expanded:d={}}=t;if(n>r)return'<span class="jt-deep">\u6DF1\u5EA6\u9650\u5236</span>';if(e===null)return'<span class="jt-null">null</span>';if(e===void 0)return'<span class="jt-null">\u2014</span>';if(typeof e!="object")return Oe(e,t);let l=Array.isArray(e),b=l?e.map((c,s)=>[s,c]):Object.entries(e),f='<div class="jt-node">';f+='<div class="jt-row expandable" onclick="window.__jtToggle(this)">',f+='<span class="jt-tog">\u25BE</span>',f+='<span class="jt-prev">'+(l?"[":"{")+(l?" "+b.length+" items":" "+b.length+" keys")+(l?"]":"}")+"</span>",f+='</div><div class="jt-children">';for(let[c,s]of b){let h='<span class="jt-key">'+T(String(c))+'</span><span class="jt-colon">: </span>';f+='<div class="jt-row">'+h,s!==null&&typeof s=="object"?f+=be(s,{...t,depth:n+1}):f+=Oe(s,{...t,key:c}),f+="</div>"}return f+="</div></div>",f}function Oe(e,t={}){if(e===null)return'<span class="jt-null">null</span>';if(e===void 0)return'<span class="jt-null">\u2014</span>';let n=ce(e,t.key,t.pretty);return n.kind==="null"?'<span class="jt-null">null</span>':n.kind==="image"?'<span class="jt-img"><img src="'+T(n.url)+'" alt="" loading="lazy" style="width:24px;height:24px;border-radius:50%;vertical-align:middle" /><span class="jt-imgn" style="font-size:10px;color:var(--dimmer);margin-left:4px">'+T(Qe(n.url))+"</span></span>":n.kind==="link"?'<span class="jt-link" style="color:var(--brand);word-break:break-all">'+T(n.text)+"</span>":n.kind==="time"?'<span class="jt-ts" style="color:var(--m-put)">'+T(ue(n.date))+"</span>":n.kind==="number"?'<span class="jt-num">'+T(String(e))+"</span>":n.kind==="bool"?'<span class="jt-bool">'+T(String(e))+"</span>":(n.kind==="string",'<span class="jt-str">"'+T(String(e))+'"</span>')}function T(e){if(e==null)return"";let t=document.createElement("div");return t.textContent=String(e),t.innerHTML}function ze(e,t={}){let{ast:n,plainText:r,filterText:o,pretty:a,hiddenCols:i,colOrder:d,sort:l,tableSel:b}=t,f=et(e),c=f.find(x=>x.path===b)||f[0];if(!c)return'<div class="res-empty">\u65E0\u53EF\u8868\u683C\u5316\u6570\u636E</div>';let s=c.data;if(Array.isArray(s)&&c.path!=="__self"){if(s.length&&s.every(k=>k&&typeof k=="object"&&!Array.isArray(k))){let k=[];s.forEach(M=>Object.keys(M).forEach(P=>{k.includes(P)||k.push(P)}));let I=i||{},B=k.filter(M=>!I[M]),X=s.filter(M=>de(M,n,r)),O='<div class="tbl-wrap"><table class="dt"><thead><tr><th class="idx">#</th>';for(let M of B){let P="";l&&l.col===M&&(P=l.dir==="asc"?" \u25B2":" \u25BC"),O+='<th class="sortable" data-col="'+T(M)+'">'+T(M)+P+'<span class="col-grip"></span></th>'}O+="</tr></thead><tbody>";let re=X;l&&l.col&&(re=[...X].sort((M,P)=>{let N=M[l.col],H=P[l.col];return N==null&&H==null?0:N==null?1:H==null?-1:typeof N=="number"&&typeof H=="number"?l.dir==="asc"?N-H:H-N:l.dir==="asc"?String(N).localeCompare(String(H)):String(H).localeCompare(String(N))}));for(let M=0;M<re.length;M++){let P=re[M];O+='<tr oncontextmenu="window.__ctx(event)"><td class="idx">'+M+"</td>";for(let N of B){let H=P[N],R=ce(H,N,a);R.kind==="null"?O+='<td><span class="jt-null">null</span></td>':R.kind==="image"?O+='<td><img src="'+T(R.url)+'" style="width:24px;height:24px;border-radius:50%" loading="lazy" /></td>':R.kind==="time"?O+='<td><span class="jt-ts">'+T(ue(R.date))+"</span></td>":R.kind==="number"?O+='<td><span class="jt-num">'+T(String(H))+"</span></td>":R.kind==="bool"?O+='<td><span class="jt-bool">'+T(String(H))+"</span></td>":R.kind==="object"?O+='<td><span class="jt-str">'+T(R.text)+"</span></td>":O+='<td><span class="jt-str">'+T(String(H||""))+"</span></td>"}O+="</tr>"}return O+='</tbody></table></div><div class="tbl-note">\u6570\u7EC4 '+X.length+"/"+s.length+" \u884C</div>",O}let S=s.filter(k=>de({v:k},n,r)),E='<div class="tbl-wrap"><table class="dt"><thead><tr><th class="idx">#</th><th>value</th></tr></thead><tbody>';for(let k=0;k<S.length;k++)E+='<tr><td class="idx">'+k+"</td><td>"+T(String(S[k]))+"</td></tr>";return E+='</tbody></table></div><div class="tbl-note">\u6570\u7EC4 '+S.length+"/"+s.length+" \u9879</div>",E}let h=Object.entries(s).filter(([x,S])=>de({[x]:S},n,r)),g='<div class="tbl-wrap"><table class="dt"><thead><tr><th>key</th><th>value</th></tr></thead><tbody>';for(let[x,S]of h){let E=ce(S,x,a),k="";E.kind==="null"?k='<span class="jt-null">null</span>':E.kind==="image"?k='<img src="'+T(E.url)+'" style="width:24px;height:24px;border-radius:50%" loading="lazy" />':E.kind==="time"?k='<span class="jt-ts">'+T(ue(E.date))+"</span>":E.kind==="number"?k='<span class="jt-num">'+T(String(S))+"</span>":k='<span class="jt-str">'+T(String(S))+"</span>",g+='<tr><td class="jt-key">'+T(x)+"</td><td>"+k+"</td></tr>"}return g+='</tbody></table></div><div class="tbl-note">\u5BF9\u8C61 '+h.length+"/"+Object.keys(s).length+" \u5B57\u6BB5</div>",g}var _e="polaris.http.tabs.v2",Ue="polaris.http.collections.v2",Be="polaris.http.envs.v2",Ne="polaris.http.ui.v2",u={tabs:[],activeTab:null,collections:[],envs:[],activeEnv:null},C={sideCollapsed:!1,layout:"h",reqW:480,reqH:220,proxyOn:!1,resFont:13},ne=!1,Pe="http://127.0.0.1:9872";function Re(e,t){ne=!!e,t&&(Pe=t),e&&(C.proxyOn=!0,y())}function V(e){return Object.assign({id:z(),name:"\u672A\u547D\u540D\u8BF7\u6C42",savedId:null,dirty:!1,method:"GET",url:"",params:[w()],headers:[w()],bodyType:"none",body:"",formBody:[w()],reqTab:"params",respView:"object",respPath:"",respFilter:"",tableSel:null,pretty:!0,response:null},e||{})}var L=()=>u.tabs.find(e=>e.id===u.activeTab);function y(){let e=u.tabs.map(t=>{let n={...t};return delete n.response,n});try{localStorage.setItem(_e,JSON.stringify({tabs:e,activeTab:u.activeTab})),localStorage.setItem(Ue,JSON.stringify(u.collections)),localStorage.setItem(Be,JSON.stringify({envs:u.envs,activeEnv:u.activeEnv})),localStorage.setItem(Ne,JSON.stringify(C))}catch{j("\u672C\u5730\u4FDD\u5B58\u5931\u8D25","err")}}function tt(){try{let e=JSON.parse(localStorage.getItem(_e)||"null");e&&e.tabs&&e.tabs.length&&(u.tabs=e.tabs.map(t=>V(t)),u.activeTab=e.activeTab)}catch{}try{let e=JSON.parse(localStorage.getItem(Ue)||"null");Array.isArray(e)&&(u.collections=e)}catch{}try{let e=JSON.parse(localStorage.getItem(Be)||"null");e&&(u.envs=e.envs||[],u.activeEnv=e.activeEnv||null)}catch{}try{let e=JSON.parse(localStorage.getItem(Ne)||"null");e&&(C=Object.assign(C,e))}catch{}if((!u.collections.length||!u.envs.length)&&nt(),!u.tabs.length){let e=V();u.tabs=[e],u.activeTab=e.id}L()||(u.activeTab=u.tabs[0].id)}function nt(){if(!u.envs.length){let e={id:z(),name:"Demo",baseUrl:"https://jsonplaceholder.typicode.com",vars:[w()]},t={id:z(),name:"\u672C\u5730",baseUrl:"http://127.0.0.1:8080",vars:[w()]};u.envs=[e,t],u.activeEnv=e.id}u.collections.length||(u.collections=[{id:z(),name:"\u793A\u4F8B",collapsed:!1,requests:[fe("\u7528\u6237\u5217\u8868","GET","{{baseUrl}}/users"),fe("\u5355\u4E2A Todo","GET","{{baseUrl}}/todos/1"),fe("\u65B0\u5EFA Post","POST","{{baseUrl}}/posts",{bodyType:"json",body:JSON.stringify({title:"hello",body:"world",userId:1},null,2),headers:[w()]})]}])}function fe(e,t,n,r){return Object.assign({id:z(),name:e,method:t,url:n,params:[w()],headers:[w()],bodyType:"none",body:"",formBody:[w()]},r||{})}function A(){return u.envs.find(e=>e.id===u.activeEnv)}function Q(){let e=A();v("#envName").textContent=e?e.name:"\u65E0\u73AF\u5883",v("#envSel").title=e&&e.baseUrl?"baseUrl: "+e.baseUrl:"\u672A\u9009\u62E9\u73AF\u5883";let t=v("#envMenu");t.innerHTML="",u.envs.forEach(a=>{let i=p("button","env-item"+(a.id===u.activeEnv?" on":""),"<span>"+m(a.name)+"</span><small>"+m(a.baseUrl||"(\u65E0 baseUrl)")+"</small>");i.onclick=()=>{u.activeEnv=a.id,y(),Q(),D(),v("#envMenu").classList.remove("open"),j("\u5DF2\u5207\u6362\u73AF\u5883\uFF1A"+a.name,"ok")},t.appendChild(i)});let n=p("button","env-item"+(u.activeEnv?"":" on"),"<span>\u65E0\u73AF\u5883</span><small>\u4E0D\u89E3\u6790\u53D8\u91CF</small>");n.onclick=()=>{u.activeEnv=null,y(),Q(),D(),v("#envMenu").classList.remove("open")},t.appendChild(n);let r=p("button","env-item manage","<span>\u7BA1\u7406\u73AF\u5883...</span>");r.onclick=()=>{v("#envMenu").classList.remove("open"),rt()},t.appendChild(r);let o=p("button","env-item manage","<span>\u5168\u5C40 Headers...</span>");o.onclick=()=>{v("#envMenu").classList.remove("open"),ot()},t.appendChild(o)}function rt(){let e=v("#modalBg"),t=p("div","modal wide"),n=u.activeEnv||u.envs[0]&&u.envs[0].id;function r(){let a=u.envs.find(c=>c.id===n);t.innerHTML='<h3>\u73AF\u5883\u4E0E\u53D8\u91CF</h3><div class="sub">\u6BCF\u4E2A\u73AF\u5883\u542B baseUrl \u4E0E\u4E00\u7EC4\u53D8\u91CF\uFF1BURL \u4E2D\u7528 {{baseUrl}}\u3001{{\u53D8\u91CF\u540D}} \u5F15\u7528\u3002</div>';let i=p("div","env-tabs");u.envs.forEach(c=>{let s=p("button","env-tab"+(c.id===n?" on":""),m(c.name)+(c.id===u.activeEnv?" \u25CF":""));s.onclick=()=>{n=c.id,r()},i.appendChild(s)});let d=p("button","env-tab add","+ \u65B0\u5EFA\u73AF\u5883");if(d.onclick=()=>{let c={id:z(),name:"\u73AF\u5883 "+(u.envs.length+1),baseUrl:"",vars:[w()]};u.envs.push(c),n=c.id,r()},i.appendChild(d),t.appendChild(i),a){let c=p("div","field");c.innerHTML="<label>\u73AF\u5883\u540D\u79F0</label>";let s=p("input");s.value=a.name,s.oninput=()=>a.name=s.value,c.appendChild(s),t.appendChild(c);let h=p("div","field");h.innerHTML="<label>baseUrl\uFF08IP + \u7AEF\u53E3\uFF09</label>";let g=p("input");g.placeholder="http://127.0.0.1:8080",g.value=a.baseUrl||"",g.oninput=()=>a.baseUrl=g.value,h.appendChild(g),t.appendChild(h);let x=p("div","field");x.innerHTML="<label>\u53D8\u91CF</label>";let S=p("div","env-vars");a.vars||(a.vars=[w()]),S.appendChild(F(a.vars,{kPlace:"\u53D8\u91CF\u540D",vPlace:"\u503C",onChange:()=>{y()}})),x.appendChild(S),t.appendChild(x)}let l=p("div","acts");if(a){let c=p("button","btn ghost danger","\u5220\u9664");c.onclick=()=>{qe("\u5220\u9664\u73AF\u5883\u300C"+a.name+"\u300D\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",s=>{s&&(u.envs=u.envs.filter(h=>h.id!==a.id),u.activeEnv===a.id&&(u.activeEnv=u.envs[0]?u.envs[0].id:null),n=u.envs[0]&&u.envs[0].id,r())})},l.appendChild(c)}let b=p("div");if(b.style.flex="1",l.appendChild(b),a){let c=p("button","btn",a.id===u.activeEnv?"\u2713 \u5F53\u524D\u73AF\u5883":"\u8BBE\u4E3A\u5F53\u524D");c.onclick=()=>{u.activeEnv=n,y(),Q(),D(),r()},l.appendChild(c)}let f=p("button","btn primary","\u5B8C\u6210");f.onclick=o,l.appendChild(f),t.appendChild(l)}function o(){u.envs.forEach(a=>{a.vars&&(a.vars=a.vars.filter(i=>i.key||i.value))}),y(),Q(),D(),e.classList.remove("open"),e.innerHTML=""}e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=a=>{a.target===e&&o()},r()}function ot(){let e=v("#modalBg"),t=p("div","modal wide"),n=te.get("globalHeaders")||[];function r(){t.innerHTML='<h3>\u5168\u5C40 Headers</h3><div class="sub">\u5168\u5C40\u8BF7\u6C42\u5934\u5C06\u81EA\u52A8\u9644\u52A0\u5230\u6BCF\u4E00\u4E2A\u8BF7\u6C42\u3002\u82E5\u8BF7\u6C42\u4E2D\u5DF2\u5B58\u5728\u540C\u540D Header\uFF0C\u7531\u5168\u5C40\u81EA\u52A8\u6DFB\u52A0\u3002</div>';let a=p("div");a.style.cssText="max-height:340px;overflow:auto";let i=_(n);(!i.length||i[i.length-1].key||i[i.length-1].value)&&i.push(w()),a.appendChild(F(i,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{let f=i.filter(c=>c.key);te.set("globalHeaders",f)}})),t.appendChild(a);let d=p("div","acts"),l=p("div");l.style.flex="1";let b=p("button","btn primary","\u5B8C\u6210");b.onclick=o,d.append(l,b),t.appendChild(d)}function o(){e.classList.remove("open"),e.innerHTML=""}e.innerHTML="",e.appendChild(t),e.classList.add("open"),e.onclick=a=>{a.target===e&&o()},r()}function D(){let e=L(),t=v("#urlResolved");if(e&&e.url&&e.url.indexOf("{{")>=0){let n=A();t.innerHTML="\u2192 <b>"+m(U(e.url,n))+"</b>",t.style.display="block"}else t.style.display="none"}function at(){let e=v("#methodMenu");e&&we.forEach(t=>{let n=p("button",Y(t),t);n.onclick=()=>{let r=L();r&&(r.method=t,q(r)),v("#methodMenu").classList.remove("open"),Ie(),W(),y()},e.appendChild(n)})}function st(){let e=v("#methodSel");e&&(e.onclick=n=>{n.stopPropagation(),v("#methodMenu").classList.toggle("open")});let t=v("#envSel");t&&(t.onclick=n=>{n.stopPropagation(),v("#envMenu").classList.toggle("open")}),document.addEventListener("click",()=>{let n=v("#methodMenu");n&&n.classList.remove("open");let r=v("#envMenu");r&&r.classList.remove("open")})}function ee(){let e=v("#tabbar");e.innerHTML="",u.tabs.forEach(n=>{let r=p("div","rtab"+(n.id===u.activeTab?" active":""));r.innerHTML='<span class="tm '+Y(n.method)+'">'+n.method+'</span><span class="tn">'+m(n.name)+"</span>",n.dirty&&r.appendChild(p("span","dirty","\u25CF"));let o=p("button","tx","\xD7");o.onclick=a=>{a.stopPropagation(),ut(n)},r.appendChild(o),r.onclick=()=>{u.activeTab=n.id,G(),y()},r.querySelector(".tn").ondblclick=a=>{a.stopPropagation(),ye("\u91CD\u547D\u540D Tab","\u8F93\u5165\u65B0\u540D\u79F0\uFF1A",n.name,i=>{i!=null&&(n.name=i.trim()||n.name,ee(),y())})},e.appendChild(r)});let t=p("button","tab-add","+");t.onclick=()=>{let n=V();u.tabs.push(n),u.activeTab=n.id,G(),y()},e.appendChild(t),v("#stTabs").textContent=u.tabs.length}function Ie(){let e=L(),t=v("#methodLabel");t&&(t.textContent=e.method,t.className=Y(e.method));let n=v("#url");n&&document.activeElement!==n&&(n.value=e.url),D()}function W(){let e=L();$("#reqSubtabs .subtab").forEach(n=>n.classList.toggle("active",n.dataset.rt===e.reqTab));let t=v("#reqPane");if(t.innerHTML="",e.reqTab==="params")t.appendChild(F(e.params,{kPlace:"\u53C2\u6570\u540D",vPlace:"\u53C2\u6570\u503C",onChange:()=>{q(e),pt(e),y()}}));else if(e.reqTab==="headers"){let n=p("div");n.appendChild(F(e.headers,{kPlace:"Header \u540D",vPlace:"Header \u503C",onChange:()=>{q(e),y()}}));let r=p("div","suggest");Object.entries({"Content-Type":"application/json",Accept:"application/json",Authorization:"Bearer "}).forEach(([a,i])=>{let d=p("button","chip",a);d.onclick=()=>{e.headers.pop(),e.headers.push({id:z(),enabled:!0,key:a,value:i}),e.headers.push(w()),y(),W()},r.appendChild(d)}),n.appendChild(r),t.appendChild(n)}else e.reqTab==="body"&&it(t,e)}function it(e,t){let n=p("div","body-bar"),r=p("div","seg");if([["none","\u65E0"],["json","JSON"],["text","\u6587\u672C"],["form","Form"]].forEach(([o,a])=>{let i=p("button",t.bodyType===o?"on":"",a);i.onclick=()=>{t.bodyType=o,q(t),y(),W()},r.appendChild(i)}),n.appendChild(r),n.appendChild(p("div","sp")),t.bodyType==="json"){let o=p("button","tool","\u683C\u5F0F\u5316");o.onclick=()=>{try{t.body=JSON.stringify(JSON.parse(t.body),null,2),W(),y(),j("JSON \u5DF2\u683C\u5F0F\u5316","ok")}catch{j("JSON \u65E0\u6548","err")}},n.appendChild(o)}if(e.appendChild(n),t.bodyType==="none")e.appendChild(p("div","body-none","\u8BE5\u8BF7\u6C42\u6CA1\u6709 Body\u3002\u9009\u62E9 JSON / \u6587\u672C / Form \u4EE5\u7F16\u8F91\u3002"));else if(t.bodyType==="form"){let o=p("div");o.style.cssText="height:calc(100% - 49px);overflow:auto",o.appendChild(F(t.formBody||[w()],{kPlace:"\u5B57\u6BB5\u540D",vPlace:"\u5B57\u6BB5\u503C",onChange:()=>{q(t),y()}})),e.appendChild(o)}else{let o=p("textarea","code");o.spellcheck=!1,o.placeholder=t.bodyType==="json"?`{
  "key": "value"
}`:"\u539F\u59CB\u8BF7\u6C42\u4F53\u2026",o.value=t.body,o.style.cssText="width:100%;min-height:80px;padding:10px;border-radius:4px;background:var(--bg);border:1px solid var(--line);font-size:12px;color:var(--ink);resize:vertical;tab-size:2",o.addEventListener("input",()=>{t.body=o.value,q(t),y()}),o.addEventListener("keydown",a=>{if(a.key==="Tab"){a.preventDefault();let i=o.selectionStart,d=o.selectionEnd;o.value=o.value.slice(0,i)+"  "+o.value.slice(d),o.selectionStart=o.selectionEnd=i+2,t.body=o.value}}),e.appendChild(o)}}function lt(e){let t=e.indexOf("?");return t<0?[e,""]:[e.slice(0,t),e.slice(t+1)]}function pt(e){let[t]=lt(e.url),n=e.params.filter(o=>o.enabled!==!1&&o.key).map(o=>encodeURIComponent(o.key)+"="+encodeURIComponent(o.value)).join("&");e.url=n?t+"?"+n:t;let r=v("#url");document.activeElement!==r&&(r.value=e.url),D()}async function ve(){let e=L(),t=U(e.url.trim(),A());if(!t){j("\u8BF7\u5148\u8F93\u5165 URL","warn"),v("#url").focus();return}/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(t)||(t="https://"+t);let n=t.indexOf("?"),r=n>=0?t.slice(0,n):t,o=(e.method||"GET").toUpperCase(),a={};if(e.headers&&e.headers.filter(s=>s.enabled!==!1&&s.key).forEach(s=>a[U(s.key,A())]=U(s.value,A())),(te.get("globalHeaders")||[]).filter(s=>s.enabled!==!1&&s.key).forEach(s=>{Object.keys(a).some(h=>h.toLowerCase()===s.key.toLowerCase())||(a[s.key]=s.value)}),e.params){let s=e.params.filter(h=>h.enabled!==!1&&h.key).map(h=>encodeURIComponent(U(h.key,A()))+"="+encodeURIComponent(U(h.value||"",A()))).join("&");s&&(r+="?"+s)}let d;if(!["GET","HEAD"].includes(o)){if(e.bodyType==="json")d=U(e.body||"",A()),Object.keys(a).some(s=>s.toLowerCase()==="content-type")||(a["Content-Type"]="application/json");else if(e.bodyType==="text")d=U(e.body||"",A());else if(e.bodyType==="form"){let s=e.formBody||[];Array.isArray(s)&&(d=s.filter(h=>h.enabled!==!1&&h.key).map(h=>encodeURIComponent(U(h.key,A()))+"="+encodeURIComponent(U(h.value||"",A()))).join("&"),Object.keys(a).some(h=>h.toLowerCase()==="content-type")||(a["Content-Type"]="application/x-www-form-urlencoded"))}}let l=v("#sendBtn");l.disabled=!0,l.innerHTML="\u53D1\u9001\u4E2D\u2026",v("#resStatus").style.display="none",v("#resPane").innerHTML='<div class="res-loading"><span class="spin"></span> \u8BF7\u6C42\u53D1\u9001\u4E2D\u2026</div>',j(o+" "+r+(C.proxyOn?" \xB7 \u7ECF\u4EE3\u7406":"")+" \u2026");let b=r,f=a;C.proxyOn&&(f=Object.assign({},a,{"X-Polaris-Target":r}),b=ne?Pe+"/__proxy":"/__proxy");let c=performance.now();try{if(e.response&&e.response.blobUrl)try{URL.revokeObjectURL(e.response.blobUrl)}catch{}let s=await fetch(b,{method:o,headers:f,body:d,redirect:"follow"}),h=await s.blob(),g=performance.now(),x=s.headers.get("content-type")||"",S=/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-|gzip)/i.test(x),E="";S||(E=await h.text());let k={};s.headers.forEach((B,X)=>k[X]=B);let I=Se(E);e.response={status:s.status,statusText:s.statusText,ok:s.ok,timeMs:g-c,size:h.size,contentType:x,headers:k,text:E,isBinary:S,blobUrl:S?URL.createObjectURL(h):null,url:r,parsed:I.ok?I.value:void 0},e.respPath="",e.respFilter="",e.tableSel=null,e.respView=I.ok?Array.isArray(I.value)?"table":"object":/text\/html/i.test(x)||S&&/^image\//i.test(x)?"preview":"raw",xe(),j(o+" "+s.status+" "+s.statusText+" \xB7 "+ie(g-c)+" \xB7 "+se(h.size),s.ok?"ok":"warn")}catch(s){let h=performance.now();e.response={error:s.message||String(s),timeMs:h-c,url:r},xe(),j("\u8BF7\u6C42\u5931\u8D25\uFF1A"+(s.message||s),"err")}finally{l.disabled=!1,l.innerHTML='\u53D1\u9001 <span class="k">\u2318\u21B5</span>'}}function ge(e){let t=e.response,n=t&&!t.error?t.parsed:void 0,r=n;if(e.respPath&&n!==void 0){let i=He(n,e.respPath);i.ok?r=i.value:r=void 0}let o=r!==void 0,a=o&&(Array.isArray(r)||r&&typeof r=="object");return{data:r,hasJSON:o,canTable:a}}function Z(){let e=L();if(!e||!e.response||e.response.error)return;let t=ge(e),n={table:t.canTable,object:t.hasJSON,raw:!0,preview:!e.respPath&&(/text\/html/i.test(e.response.contentType)||/^image\//i.test(e.response.contentType)),headers:!0};n[e.respView]||(e.respView=t.hasJSON?"object":"raw"),$("#resSubtabs .subtab").forEach(o=>{let a=o.dataset.rv;o.classList.toggle("active",a===e.respView),o.classList.toggle("disabled",!n[a])});let r=v("#resPane");e.respView==="raw"?r.innerHTML='<pre class="raw-view">'+m(e.response.text||"")+"</pre>":e.respView==="object"?r.innerHTML=be(t.data,{pretty:e.pretty}):e.respView==="table"?r.innerHTML=ze(t.data,{pretty:e.pretty}):e.respView==="preview"?r.innerHTML=dt(e.response):e.respView==="headers"&&(r.innerHTML=ct(e.response.headers))}function xe(){let e=L(),t=e.response,n=v("#resPane"),r=v("#resSubtabs"),o=v("#resStatus"),a=v("#resTools");if(!t){r.style.display="none",o.style.display="none",a.style.display="none",n.innerHTML='<div class="res-idle"><div class="big">\u51C6\u5907\u5C31\u7EEA</div><div class="tips">\u8F93\u5165 URL \u70B9\u300C\u53D1\u9001\u300D\uFF0C\u6216\u4ECE\u5DE6\u4FA7\u96C6\u5408\u8F7D\u5165\u4E00\u4E2A\u8BF7\u6C42\u3002<br>\xB7 \u591A tab\uFF1A\u9876\u90E8 \uFF0B \u65B0\u5EFA\uFF0C\u53CC\u51FB\u6807\u7B7E\u53EF\u91CD\u547D\u540D<br>\xB7 \u73AF\u5883\u53D8\u91CF\uFF1A\u53F3\u4E0A\u89D2\u5207\u6362\uFF0CURL \u91CC\u7528 {{baseUrl}}<br>\xB7 \u5BFC\u5165 cURL\uFF1A\u53F3\u4E0A\u89D2\u7C98\u8D34 curl \u547D\u4EE4\u4E00\u952E\u89E3\u6790<br>\xB7 \u8DE8\u57DF\uFF1A\u9876\u680F\u300C\u4EE3\u7406\u300D\u5F00\u542F\u540E\u7ECF\u672C\u5730\u540E\u7AEF\u8F6C\u53D1</div></div>';return}if(t.error){r.style.display="none",o.style.display="none",a.style.display="none",n.innerHTML='<div class="res-err"><div class="ti">\u8BF7\u6C42\u5931\u8D25</div><div>'+m(t.error)+"</div></div>";return}o.style.display="flex";let i=t.status>=500?"s5":t.status>=400?"s4":t.status>=300?"s3":"s2";if(o.innerHTML='<span class="status-chip '+i+'"><span class="dotc"></span>'+t.status+" "+m(t.statusText)+'</span><span class="res-meta"><span>\u8017\u65F6 <b>'+ie(t.timeMs)+"</b></span><span>\u5927\u5C0F <b>"+se(t.size)+"</b></span>"+(t.contentType?"<span>\u7C7B\u578B <b>"+m(t.contentType.split(";")[0])+"</b></span>":"")+'</span><span class="sp"></span><button class="tool" onclick="window.__copyRes()">\u29C9 \u590D\u5236</button><button class="tool" onclick="window.__dlRes()">\u2193 \u4E0B\u8F7D</button><button class="tool" onclick="window.__askAI()">\u2726 AI</button>',r.style.display="flex",t.parsed!==void 0){a.style.display="flex";let l=he(t.parsed);a.innerHTML='<span class="lbl">\u8DEF\u5F84</span><select class="path-select" onchange="window.__setPath(this.value)"><option value="">(\u6839)</option>'+l.map(b=>'<option value="'+m(b.path)+'"'+(b.path===e.respPath?" selected":"")+">"+m(b.path||"(\u6839)")+"</option>").join("")+'</select><input class="path-input" placeholder="\u5982 data.items[0].name" value="'+m(e.respPath||"")+'" oninput="window.__setPath(this.value)" /><input class="filter-input" placeholder="\u8FC7\u6EE4 name:\u503C id>1" value="'+m(e.respFilter||"")+'" oninput="window.__setFilter(this.value)" /><button class="tool" onclick="window.__togglePretty()">'+(e.pretty?"\u2726 \u7F8E\u5316":"\u2726 \u539F\u59CB")+'</button><button class="tool" onclick="window.__expandAll()">\u229E \u5C55\u5F00</button><button class="tool" onclick="window.__collapseAll()">\u229F \u6298\u53E0</button>'}else a.style.display="none";Z()}function dt(e){return e.isBinary&&e.blobUrl?/^image\//i.test(e.contentType)?'<div class="prev-img-wrap"><img src="'+e.blobUrl+'" /></div>':'<div class="prev-none">\u4E8C\u8FDB\u5236\u54CD\u5E94</div>':/text\/html/i.test(e.contentType)?'<iframe class="prev-frame" sandbox="" srcdoc="'+m(e.text)+'"></iframe>':'<div class="prev-none">\u65E0\u53EF\u9884\u89C8\u5185\u5BB9</div>'}function ct(e){if(!e||!Object.keys(e).length)return'<div class="res-empty">\u65E0\u54CD\u5E94\u5934</div>';let t='<div class="tbl-wrap"><table class="dt"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>';for(let[n,r]of Object.entries(e))t+='<tr><td class="jt-key">'+m(n)+"</td><td>"+m(r)+"</td></tr>";return t+="</tbody></table></div>",t}function q(e){e.dirty||(e.dirty=!0,ee())}function ut(e){if(e.dirty&&(e.url||e.savedId)){qe("\u8BE5 tab \u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u4ECD\u8981\u5173\u95ED\uFF1F",n=>{n&&t()});return}t();function t(){let n=u.tabs.indexOf(e);if(u.tabs.splice(n,1),u.tabs.length)u.activeTab===e.id&&(u.activeTab=u.tabs[Math.max(0,n-1)].id);else{let r=V();u.tabs.push(r),u.activeTab=r.id}G(),y()}}function K(){let e=v("#tree");e.innerHTML="";let t=(v("#search").value||"").toLowerCase().trim(),n=0;u.collections.length||e.appendChild(p("div","tree-empty","\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u8BF7\u6C42\u3002")),u.collections.forEach(r=>{let o=t?r.requests.filter(l=>!t||l.name.toLowerCase().includes(t)||l.url.toLowerCase().includes(t)):r.requests;if(n+=r.requests.length,t&&!o.length&&!r.name.toLowerCase().includes(t))return;let a=p("div","group"+(r.collapsed&&!t?" collapsed":"")),i=p("div","group-head");i.innerHTML='<span class="caret">\u25BE</span><span class="gname">'+m(r.name)+'</span><span class="gcount">'+r.requests.length+"</span>",i.onclick=()=>{r.collapsed=!r.collapsed,y(),K()},a.appendChild(i);let d=p("div","reqs");o.forEach(l=>{let b=p("div","req-item"+(L()&&L().savedId===l.id?" active":""));b.innerHTML='<span class="mb '+Y(l.method)+'">'+l.method+'</span><span class="rn">'+m(l.name)+"</span>",b.onclick=()=>ht(l),d.appendChild(b)}),a.appendChild(d),e.appendChild(a)}),v("#stSaved").textContent=n}function ht(e){let t=u.tabs.find(r=>r.savedId===e.id);if(t){u.activeTab=t.id,G();return}let n=V({name:e.name,savedId:e.id,method:e.method,url:e.url,params:_(e.params||[w()]),headers:_(e.headers||[w()]),bodyType:e.bodyType||"none",body:e.body||"",formBody:_(e.formBody||[w()])});n.params.length||(n.params=[w()]),n.headers.length||(n.headers=[w()]),n.formBody.length||(n.formBody=[w()]),u.tabs.push(n),u.activeTab=n.id,G(),y()}function bt(){let e=L();if(e.savedId){let o=ft(e.savedId);if(o){Object.assign(o.r,Ae(e)),o.r.name=e.name,e.dirty=!1,y(),ee(),K(),j("\u5DF2\u66F4\u65B0\u300C"+e.name+"\u300D","ok");return}}let t=u.collections.map(o=>'<option value="'+o.id+'">'+m(o.name)+"</option>").join("");function n(o,a){let i=u.collections.find(l=>l.id===a);if(!i)return;let d=Object.assign({id:z(),name:o.mName||"\u672A\u547D\u540D\u8BF7\u6C42"},Ae(e));i.requests.push(d),e.savedId=d.id,e.name=d.name,e.dirty=!1,y(),ee(),K(),j("\u5DF2\u4FDD\u5B58\u5230\u300C"+i.name+"\u300D","ok")}function r(o){let a=o.mGroup;if(a==="__new"||!u.collections.length){ye("\u65B0\u5EFA\u5206\u7EC4","\u8F93\u5165\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4",i=>{if(i){let d={id:z(),name:i,collapsed:!1,requests:[]};u.collections.push(d),a=d.id,n(o,a)}});return}n(o,a)}xt("\u4FDD\u5B58\u8BF7\u6C42","\u628A\u5F53\u524D\u8BF7\u6C42\u5B58\u5165\u4E00\u4E2A\u5206\u7EC4",[{label:"\u540D\u79F0",id:"mName",type:"text",value:e.url?e.method+" "+Je(e.url):"\u672A\u547D\u540D\u8BF7\u6C42"},{label:"\u5206\u7EC4",id:"mGroup",type:"select",html:t+'<option value="__new">+ \u65B0\u5EFA\u5206\u7EC4\u2026</option>'}],r)}function Ae(e){return{method:e.method,url:e.url,params:_(e.params),headers:_(e.headers),bodyType:e.bodyType,body:e.body,formBody:_(e.formBody)}}function ft(e){for(let t of u.collections){let n=t.requests.find(r=>r.id===e);if(n)return{g:t,r:n}}return null}function Je(e){try{let t=new URL(/^[a-z]+:\/\//i.test(e)?e:"https://"+e.replace(/^\{\{[^}]+\}\}/,"http://x"));return t.pathname&&t.pathname.length>1?t.pathname:t.hostname}catch{return String(e).slice(0,28)}}function vt(){let e=v("#modalBg"),t=p("div","modal");t.innerHTML='<h3>\u5BFC\u5165 cURL</h3><div class="sub">\u7C98\u8D34\u4E00\u6761 curl \u547D\u4EE4\uFF0C\u89E3\u6790\u4E3A\u65B0\u7684\u8BF7\u6C42 tab\u3002</div>';let n=p("div","field");n.innerHTML="<label>cURL \u547D\u4EE4</label>";let r=p("textarea","curl-ta");r.placeholder="curl 'https://api.example.com/users' -H 'Authorization: Bearer xxx'",n.appendChild(r),t.appendChild(n);let o=p("div","acts"),a=p("div");a.style.flex="1";let i=p("button","btn ghost","\u53D6\u6D88");i.onclick=l;let d=p("button","btn primary","\u89E3\u6790\u5E76\u65B0\u5EFA");d.onclick=()=>{let b=r.value.trim();if(!b){j("\u8BF7\u7C98\u8D34 curl \u547D\u4EE4","warn");return}try{let f=Ee(b);if(!f.url){j("\u672A\u80FD\u89E3\u6790\u51FA URL","err");return}let c=V({name:"cURL: "+Je(f.url),method:f.method,url:f.url,bodyType:f.bodyType,body:f.body,headers:(f.headers.length?f.headers:[]).concat([w()])});u.tabs.push(c),u.activeTab=c.id,G(),y(),l(),j("\u5DF2\u4ECE cURL \u5BFC\u5165\uFF1A"+f.method+" "+f.url,"ok")}catch(f){j("cURL \u89E3\u6790\u5931\u8D25\uFF1A"+f.message,"err")}},o.append(i,a,d),t.appendChild(o),e.innerHTML="",e.appendChild(t),e.classList.add("open"),r.focus(),e.onclick=b=>{b.target===e&&l()};function l(){e.classList.remove("open"),e.innerHTML=""}}function $e(){let e=L(),t=e.response;if(!t||!me)return;let n=t.error?`\u8BF7\u6C42\u5931\u8D25\uFF1A${t.error}`:`\u72B6\u6001 ${t.status} ${t.statusText}\uFF0C\u8017\u65F6 ${Le(t.timeMs)}\uFF0C\u5927\u5C0F ${Ce(t.size)}`,r=t.parsed!==void 0?JSON.stringify(t.parsed).slice(0,2e3):(t.text||"").slice(0,2e3),o=`\u5206\u6790\u4EE5\u4E0B API \u8BF7\u6C42\u4E0E\u54CD\u5E94\uFF0C\u7ED9\u51FA\u95EE\u9898\u8BCA\u65AD\u6216\u6570\u636E\u89E3\u8BFB\uFF1A

\u8BF7\u6C42\uFF1A${e.method} ${e.url}
\u54CD\u5E94\uFF1A${n}
\u54CD\u5E94\u4F53\u9884\u89C8\uFF1A
${r}`;me(o)}function gt(){let e=L();if(!e||!e.url){j("\u8BF7\u5148\u586B\u5199 URL","warn");return}let t=v("#modalBg"),n=p("div","modal code-modal"),r=[["curl","cURL"],["python","Python"],["js","JavaScript"],["go","Go"],["rust","Rust"]],o="python";function a(){n.innerHTML='<h3>\u4EE3\u7801\u751F\u6210</h3><div class="sub">\u57FA\u4E8E\u5F53\u524D\u8BF7\u6C42\u751F\u6210\u4EE3\u7801\u6BB5\uFF0C\u70B9\u51FB\u590D\u5236\u3002</div>';let d=p("div","code-langs");r.forEach(([h,g])=>{let x=p("button",o===h?"on":"",g);x.onclick=()=>{o=h,a()},d.appendChild(x)}),n.appendChild(d);let l=p("pre","code-output");try{let h=Me(e,o,A());l.textContent=h}catch(h){l.textContent="\u4EE3\u7801\u751F\u6210\u5931\u8D25\uFF1A"+h.message}n.appendChild(l);let b=p("div","acts"),f=p("div");f.style.flex="1";let c=p("button","btn primary","\u590D\u5236\u4EE3\u7801");c.onclick=()=>{le(l.textContent,"\u4EE3\u7801\u5DF2\u590D\u5236"),i()};let s=p("button","btn ghost","\u5173\u95ED");s.onclick=i,b.append(f,c,s),n.appendChild(b)}function i(){t.classList.remove("open"),t.innerHTML=""}t.innerHTML="",t.appendChild(n),t.classList.add("open"),t.onclick=d=>{d.target===t&&i()},a()}function qe(e,t){let n=v("#modalBg"),r=p("div","modal");r.innerHTML='<h3>\u786E\u8BA4</h3><div class="sub">'+m(e)+"</div>";let o=p("div","acts"),a=p("div");a.style.flex="1";let i=p("button","btn ghost","\u53D6\u6D88");i.onclick=l;let d=p("button","btn primary danger","\u786E\u5B9A");d.onclick=()=>{l(),t(!0)},o.append(a,i,d),r.appendChild(o),n.innerHTML="",n.appendChild(r),n.classList.add("open"),r.querySelector("button.danger")?.focus(),r.addEventListener("keydown",b=>{b.key==="Escape"&&l()}),n.onclick=b=>{b.target===n&&l()};function l(){n.classList.remove("open"),n.innerHTML="",t(!1)}}function ye(e,t,n,r){let o=v("#modalBg"),a=p("div","modal");a.innerHTML="<h3>"+m(e)+'</h3><div class="sub">'+m(t)+"</div>";let i=p("div","field"),d=p("input");d.type="text",d.value=n||"",i.appendChild(d),a.appendChild(i);let l=p("div","acts"),b=p("div");b.style.flex="1";let f=p("button","btn ghost","\u53D6\u6D88");f.onclick=s;let c=p("button","btn primary","\u786E\u5B9A");c.onclick=()=>{let h=d.value.trim();h&&(s(),r(h))},l.append(b,f,c),a.appendChild(l),o.innerHTML="",o.appendChild(a),o.classList.add("open"),d.focus(),d.select(),a.addEventListener("keydown",h=>{h.key==="Enter"&&d.value.trim()&&c.click(),h.key==="Escape"&&s()}),o.onclick=h=>{h.target===o&&s()};function s(){o.classList.remove("open"),o.innerHTML="",r(null)}}function xt(e,t,n,r){let o=v("#modalBg"),a=p("div","modal");a.innerHTML="<h3>"+m(e)+"</h3>"+(t?'<div class="sub">'+m(t)+"</div>":""),n.forEach(s=>{let h=p("div","field");h.innerHTML="<label>"+m(s.label)+"</label>"+(s.type==="select"?'<select id="'+s.id+'">'+s.html+"</select>":'<input id="'+s.id+'" type="text" value="'+m(s.value||"")+'" />'),a.appendChild(h)});let i=p("div","acts"),d=p("div");d.style.flex="1";let l=p("button","btn ghost","\u53D6\u6D88");l.onclick=c;let b=p("button","btn primary","\u786E\u5B9A");b.onclick=()=>{let s={};n.forEach(h=>s[h.id]=v("#"+h.id,a).value),r(s)!==!1&&c()},i.append(d,l,b),a.appendChild(i),o.innerHTML="",o.appendChild(a),o.classList.add("open");let f=a.querySelector("input,select");f&&(f.focus(),f.select&&f.select()),a.addEventListener("keydown",s=>{s.key==="Enter"&&s.target.tagName!=="SELECT"&&b.click(),s.key==="Escape"&&c()}),o.onclick=s=>{s.target===o&&c()};function c(){o.classList.remove("open"),o.innerHTML=""}}function mt(){window.__copyRes=()=>{let e=L(),t=ge(e);le(t.hasJSON?JSON.stringify(t.data,null,2):e.response.text||"","\u5DF2\u590D\u5236")},window.__dlRes=()=>{let e=L(),t=e.response;if(!t||t.error)return;let n=ge(e),r="response",o=n.hasJSON?JSON.stringify(n.data,null,2):t.text;try{r=new URL(t.url).pathname.split("/").pop()||"response"}catch{}/\./.test(r)||(r+=n.hasJSON?".json":/html/.test(t.contentType)?".html":".txt");let a=p("a");a.href=URL.createObjectURL(new Blob([o],{type:"text/plain"})),a.download=r,a.click()},window.__askAI=()=>$e(),window.__setPath=e=>{let t=L();t.respPath=e,Z()},window.__setFilter=e=>{let t=L();t.respFilter=e,Z()},window.__togglePretty=()=>{let e=L();e.pretty=!e.pretty,Z()},window.__expandAll=()=>{$(".jt-children").forEach(e=>e.style.display="block")},window.__collapseAll=()=>{$(".jt-children").forEach(e=>e.style.display="none")},window.__jtToggle=e=>{let t=e.nextElementSibling;if(t){let n=t.style.display==="none";t.style.display=n?"block":"none",e.querySelector(".jt-tog").textContent=n?"\u25BE":"\u25B8"}},window.__ctx=e=>{e.preventDefault();let t=v("#ctxMenu"),n=e.target.closest("td"),r=n?.getAttribute("data-full")||n?.textContent||"";t.innerHTML=`<button class="ctx-item" onclick="navigator.clipboard.writeText('`+m(r)+`').then(()=>{$('#ctxMenu').style.display='none'})">\u590D\u5236\u503C</button><button class="ctx-item" onclick="navigator.clipboard.writeText('`+m(n?.textContent||"")+`').then(()=>{$('#ctxMenu').style.display='none'})">\u590D\u5236\u5355\u5143\u683C</button><div class="ctx-sep"></div><button class="ctx-item" onclick="$('#ctxMenu').style.display='none'">\u590D\u5236\u5217\u540D</button>`,t.style.display="block",t.style.left=e.clientX+10+"px",t.style.top=e.clientY+10+"px",document.addEventListener("click",()=>{t.style.display="none"},{once:!0})}}var me=null;function De(e={}){me=e.onSendToChat||null,at(),st(),yt(),mt(),tt(),Ge(),Fe(),G()}function yt(){let e=v("#sendBtn");e&&(e.onclick=()=>ve());let t=v("#layoutBtn");t&&(t.onclick=()=>{C.layout=C.layout==="h"?"v":"h",y(),Ge(),j("\u5E03\u5C40\u5DF2\u5207\u6362\u4E3A "+(C.layout==="h"?"\u5DE6\u53F3":"\u4E0A\u4E0B"),"ok")});let n=v("#proxyBtn");n&&(n.onclick=()=>{C.proxyOn=!C.proxyOn,y(),Fe(),j(C.proxyOn?"\u5DF2\u5F00\u542F\u8DE8\u57DF\u4EE3\u7406":"\u5DF2\u5173\u95ED\u8DE8\u57DF\u4EE3\u7406","ok")});let r=v("#curlImportBtn");r&&(r.onclick=()=>vt());let o=v("#codeGenBtn");o&&(o.onclick=()=>gt());let a=v("#aiBtn");a&&(a.onclick=()=>$e());let i=v("#saveBtn");i&&(i.onclick=()=>bt());let d=v("#newGroup");d&&(d.onclick=()=>{ye("\u65B0\u5EFA\u5206\u7EC4","\u8F93\u5165\u65B0\u5206\u7EC4\u540D\u79F0\uFF1A","\u65B0\u5206\u7EC4",c=>{if(c){let s={id:z(),name:c,collapsed:!1,requests:[]};u.collections.push(s),y(),K(),j("\u5DF2\u521B\u5EFA\u5206\u7EC4\u300C"+c+"\u300D","ok")}})});let l=v("#search");l&&(l.oninput=()=>K()),$("#reqSubtabs .subtab").forEach(c=>c.onclick=()=>{let s=L();s&&(s.reqTab=c.dataset.rt,y(),W())}),$("#resSubtabs .subtab").forEach(c=>c.onclick=()=>{let s=L();s&&s.response&&(s.respView=c.dataset.rv,Z())});let b=v("#divider");b&&(b.onmousedown=c=>{c.preventDefault();let s=v("#split"),h=s.getBoundingClientRect(),g=C.layout==="h",x=!1,S=k=>{let I=g?k.clientX-h.left-130:k.clientY-h.top-30,B=Math.max(120,Math.min(g?s.clientWidth-260:s.clientHeight-160,I));g?(C.reqW=B,s.style.setProperty("--reqW",B+"px")):(C.reqH=B,s.style.setProperty("--reqH",B+"px")),x=!0},E=()=>{document.removeEventListener("mousemove",S),document.removeEventListener("mouseup",E),x&&y()};document.addEventListener("mousemove",S),document.addEventListener("mouseup",E)}),document.addEventListener("click",()=>{let c=v("#ctxMenu");c&&(c.style.display="none")});let f=v("#url");f&&(f.onkeydown=c=>{c.key==="Enter"&&(c.preventDefault(),ve())},f.oninput=()=>{let c=L(),s=f.value;c.url=s,D(),q(c),y()}),document.addEventListener("keydown",c=>{(c.metaKey||c.ctrlKey)&&c.key==="Enter"&&(c.preventDefault(),ve())})}function G(){ee(),Ie(),W(),xe(),K(),Q()}function Ge(){let e=v("#split");if(!e)return;e.classList.toggle("h",C.layout==="h");let t=ne?180:220,n=ne?320:480;e.style.setProperty("--reqH",(C.reqH||t)+"px"),e.style.setProperty("--reqW",(C.reqW||n)+"px");let r=v("#layoutBtn");r&&(r.innerHTML=C.layout==="h"?"\u21C5 \u4E0A\u4E0B":"\u21C4 \u5DE6\u53F3")}function Fe(){let e=v("#proxyBtn");e&&(e.innerHTML=C.proxyOn?"\u{1F6E1} \u4EE3\u7406: \u5F00":"\u{1F6E1} \u4EE3\u7406: \u5173",e.style.color=C.proxyOn?"var(--brand)":"")}import{jsx as St}from"react/jsx-runtime";var wt=`
<header class="topbar">
  <div class="brand"><span class="dot"></span>HTTP<small>CLIENT</small></div>
  <div class="tabbar" id="tabbar"></div>
  <div class="spacer"></div>
  <div class="env-wrap">
    <button class="env-sel" id="envSel"><span class="ehex">\u2B21</span><span id="envName">\u65E0\u73AF\u5883</span><span class="car">\u25BE</span></button>
    <div class="env-menu" id="envMenu"></div>
  </div>
  <button class="top-act" id="curlImportBtn" title="\u7C98\u8D34 cURL \u5BFC\u5165\u4E3A\u8BF7\u6C42">\u5BFC\u5165 cURL</button>
  <button class="top-act" id="layoutBtn" title="\u5207\u6362 \u4E0A\u4E0B/\u5DE6\u53F3 \u5E03\u5C40">\u21C5 \u4E0A\u4E0B</button>
  <button class="top-act" id="proxyBtn" title="\u8DE8\u57DF\u4EE3\u7406">\u4EE3\u7406:\u5173</button>
  <button class="top-act" id="codeGenBtn" title="\u590D\u5236\u4E3A\u4EE3\u7801">\u2318 \u4EE3\u7801</button>
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
      <button class="btn icon ghost" id="aiBtn" title="AI \u5206\u6790">AI</button>
    </div>

    <div class="split" id="split">
      <div class="req-region">
        <div class="subtabs" id="reqSubtabs">
          <button class="subtab active" data-rt="params">Params</button>
          <button class="subtab" data-rt="headers">Headers</button>
          <button class="subtab" data-rt="body">Body</button>
        </div>
        <div class="pane" id="reqPane"></div>
      </div>

      <div class="divider" id="divider" title="\u62D6\u52A8\u8C03\u6574\u5927\u5C0F"></div>

      <div class="res-region">
        <div class="res-status" id="resStatus" style="display:none"></div>
        <div class="subtabs" id="resSubtabs" style="display:none">
          <button class="subtab" data-rv="object">\u5BF9\u8C61</button>
          <button class="subtab" data-rv="table">\u8868\u683C</button>
          <button class="subtab" data-rv="raw">\u539F\u59CB</button>
          <button class="subtab" data-rv="preview">\u9884\u89C8</button>
          <button class="subtab" data-rv="headers">Headers</button>
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
  <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span></span>
</footer>

<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="ctx-menu" id="ctxMenu"></div>
<div class="cell-tip" id="cellTip"></div>
`;function Tt({pluginId:e,onSendToChat:t}){let n=Ve(null),r=Ve(!1);return kt(()=>{let o=n.current;if(!(!o||r.current)){o.innerHTML=wt;try{let a=document.createElement("style");a.setAttribute("data-polaris-http",""),a.textContent=ke,o.prepend(a)}catch(a){console.warn("[Polaris HTTP] CSS injection failed:",a)}return ae(o),Re(!0,"http://127.0.0.1:9872"),De({onSendToChat:t}),r.current=!0,()=>{o.innerHTML="",ae(document),r.current=!1}}},[t]),St("div",{ref:n,className:"polaris-http-panel",style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg, #16181e)",color:"var(--ink, #d8dae2)"}})}export{Tt as default};
