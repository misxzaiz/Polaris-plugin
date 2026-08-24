// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var invoke = window.__POLARIS_HOST_INVOKE__;
async function readSettings() {
  return invoke("read_claude_settings");
}
async function writeSettings(settings) {
  return invoke("write_claude_settings", { settings });
}
async function getSettingsPath() {
  return invoke("get_claude_settings_path");
}
var styles = `
.claude-code-panel {
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  font-size: 13px;
  color: var(--text-primary, #e4e4e7);
}
.claude-code-panel h2 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
}
.claude-code-panel .subtitle {
  margin: 0 0 16px 0;
  font-size: 11px;
  color: var(--text-tertiary, #8e8e93);
}
.claude-code-panel .section {
  margin-bottom: 16px;
  border: 1px solid var(--border-subtle, #3f3f46);
  border-radius: 8px;
  overflow: hidden;
}
.claude-code-panel .section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface, #25252b);
  border-bottom: 1px solid var(--border-subtle, #3f3f46);
  font-size: 12px;
  font-weight: 500;
}
.claude-code-panel .section-body {
  padding: 8px 12px;
  background: var(--background-elevated, #1c1c1e);
}
.claude-code-panel .rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-subtle, #3f3f46);
  font-size: 12px;
}
.claude-code-panel .rule-row:last-child {
  border-bottom: none;
}
.claude-code-panel .rule-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.claude-code-panel .rule-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.claude-code-panel .rule-dot.allow { background: #22c55e; }
.claude-code-panel .rule-dot.deny { background: #eab308; }
.claude-code-panel .btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle, #3f3f46);
  background: var(--surface, #25252b);
  color: var(--text-secondary, #b4b4b8);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}
.claude-code-panel .btn:hover {
  background: var(--background-hover, #2d2d33);
}
.claude-code-panel .btn-danger {
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.claude-code-panel .btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}
.claude-code-panel .btn-sm {
  padding: 2px 6px;
  font-size: 10px;
}
.claude-code-panel .empty-hint {
  text-align: center;
  padding: 12px 0;
  font-size: 11px;
  color: var(--text-muted, #636366);
}
.claude-code-panel .path-info {
  font-size: 10px;
  color: var(--text-muted, #636366);
  margin-bottom: 12px;
  word-break: break-all;
}
.claude-code-panel .path-info code {
  color: var(--primary, #3b82f6);
}
.claude-code-panel input[type="text"] {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-subtle, #3f3f46);
  border-radius: 6px;
  background: var(--background-surface, #25252b);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px;
  box-sizing: border-box;
}
.claude-code-panel input[type="text"]:focus {
  outline: none;
  border-color: var(--primary, #3b82f6);
}
.claude-code-panel .add-area {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.claude-code-panel .add-area input {
  flex: 1;
}
.claude-code-panel .tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle, #3f3f46);
  padding-bottom: 8px;
}
.claude-code-panel .tab {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, #b4b4b8);
  transition: background 0.15s;
}
.claude-code-panel .tab:hover {
  background: var(--background-hover, #2d2d33);
}
.claude-code-panel .tab.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--primary, #3b82f6);
}
.claude-code-panel .json-editor {
  width: 100%;
  min-height: 200px;
  padding: 8px;
  border: 1px solid var(--border-subtle, #3f3f46);
  border-radius: 6px;
  background: var(--background-surface, #25252b);
  color: var(--text-primary, #e4e4e7);
  font-family: monospace;
  font-size: 11px;
  resize: vertical;
  box-sizing: border-box;
}
.claude-code-panel .json-editor:focus {
  outline: none;
  border-color: var(--primary, #3b82f6);
}
.claude-code-panel .action-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
`;
function ClaudeCodePanel() {
  const [tab, setTab] = useState("rules");
  const [settings, setSettings] = useState(null);
  const [settingsPath, setSettingsPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [jsonEdit, setJsonEdit] = useState("");
  const [newAllow, setNewAllow] = useState("");
  const [newDeny, setNewDeny] = useState("");
  const [showAddAllow, setShowAddAllow] = useState(false);
  const [showAddDeny, setShowAddDeny] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([readSettings(), getSettingsPath()]);
      setSettings(s);
      setSettingsPath(p);
      setJsonEdit(JSON.stringify(s, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (tab === "json" && settings) {
      setJsonEdit(JSON.stringify(settings, null, 2));
    }
  }, [tab, settings]);
  const handleSaveJson = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(jsonEdit);
      await writeSettings(parsed);
      setSettings(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const addRule = async (type, value) => {
    if (!value.trim() || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const autoMode = settings.autoMode ?? { allow: [], softDeny: [] };
      const key = type === "allow" ? "allow" : "softDeny";
      const list = [...autoMode[key]];
      if (!list.includes(value.trim())) {
        list.push(value.trim());
      }
      const newSettings = { ...settings, autoMode: { ...autoMode, [key]: list } };
      await writeSettings(newSettings);
      setSettings(newSettings);
      if (type === "allow") {
        setNewAllow("");
        setShowAddAllow(false);
      } else {
        setNewDeny("");
        setShowAddDeny(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const removeRule = async (type, index) => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const autoMode = settings.autoMode ?? { allow: [], softDeny: [] };
      const key = type === "allow" ? "allow" : "softDeny";
      const list = [...autoMode[key]];
      list.splice(index, 1);
      const newSettings = { ...settings, autoMode: { ...autoMode, [key]: list } };
      await writeSettings(newSettings);
      setSettings(newSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "claude-code-panel", children: /* @__PURE__ */ jsx("div", { className: "empty-hint", children: "\u52A0\u8F7D\u4E2D..." }) });
  }
  const allowRules = settings?.autoMode?.allow ?? [];
  const denyRules = settings?.autoMode?.softDeny ?? [];
  return /* @__PURE__ */ jsxs("div", { className: "claude-code-panel", children: [
    /* @__PURE__ */ jsx("style", { children: styles }),
    /* @__PURE__ */ jsx("h2", { children: "Claude Code" }),
    /* @__PURE__ */ jsx("p", { className: "subtitle", children: "\u7BA1\u7406 ~/.claude/settings.json \u914D\u7F6E" }),
    settingsPath && /* @__PURE__ */ jsxs("p", { className: "path-info", children: [
      "\u8DEF\u5F84: ",
      /* @__PURE__ */ jsx("code", { children: settingsPath })
    ] }),
    error && /* @__PURE__ */ jsx("div", { style: { padding: "8px 12px", marginBottom: 12, borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 12 }, children: error }),
    /* @__PURE__ */ jsxs("div", { className: "tab-bar", children: [
      /* @__PURE__ */ jsx("div", { className: `tab${tab === "rules" ? " active" : ""}`, onClick: () => setTab("rules"), children: "\u89C4\u5219\u5217\u8868" }),
      /* @__PURE__ */ jsx("div", { className: `tab${tab === "json" ? " active" : ""}`, onClick: () => setTab("json"), children: "\u9AD8\u7EA7\u7F16\u8F91" })
    ] }),
    tab === "rules" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "section", children: [
        /* @__PURE__ */ jsxs("div", { className: "section-header", children: [
          /* @__PURE__ */ jsx("span", { children: "\u5141\u8BB8\u89C4\u5219\uFF08Allow\uFF09" }),
          /* @__PURE__ */ jsx("button", { className: "btn btn-sm", onClick: () => setShowAddAllow(!showAddAllow), children: showAddAllow ? "\u53D6\u6D88" : "+ \u6DFB\u52A0" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "section-body", children: [
          showAddAllow && /* @__PURE__ */ jsxs("div", { className: "add-area", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: newAllow,
                onChange: (e) => setNewAllow(e.target.value),
                placeholder: "\u8F93\u5165\u89C4\u5219\u540D\u79F0",
                onKeyDown: (e) => e.key === "Enter" && addRule("allow", newAllow)
              }
            ),
            /* @__PURE__ */ jsx("button", { className: "btn", onClick: () => addRule("allow", newAllow), disabled: saving || !newAllow.trim(), children: "\u6DFB\u52A0" })
          ] }),
          allowRules.length === 0 ? /* @__PURE__ */ jsx("div", { className: "empty-hint", children: "\u6682\u65E0\u81EA\u5B9A\u4E49\u5141\u8BB8\u89C4\u5219" }) : allowRules.map((rule, i) => /* @__PURE__ */ jsxs("div", { className: "rule-row", children: [
            /* @__PURE__ */ jsxs("span", { className: "rule-label", children: [
              /* @__PURE__ */ jsx("span", { className: "rule-dot allow" }),
              rule
            ] }),
            /* @__PURE__ */ jsx("button", { className: "btn btn-sm btn-danger", onClick: () => removeRule("allow", i), disabled: saving, children: "\u5220\u9664" })
          ] }, i))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "section", children: [
        /* @__PURE__ */ jsxs("div", { className: "section-header", children: [
          /* @__PURE__ */ jsx("span", { children: "\u9700\u786E\u8BA4\u89C4\u5219\uFF08Soft Deny\uFF09" }),
          /* @__PURE__ */ jsx("button", { className: "btn btn-sm", onClick: () => setShowAddDeny(!showAddDeny), children: showAddDeny ? "\u53D6\u6D88" : "+ \u6DFB\u52A0" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "section-body", children: [
          showAddDeny && /* @__PURE__ */ jsxs("div", { className: "add-area", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: newDeny,
                onChange: (e) => setNewDeny(e.target.value),
                placeholder: "\u8F93\u5165\u89C4\u5219\u540D\u79F0",
                onKeyDown: (e) => e.key === "Enter" && addRule("softDeny", newDeny)
              }
            ),
            /* @__PURE__ */ jsx("button", { className: "btn", onClick: () => addRule("softDeny", newDeny), disabled: saving || !newDeny.trim(), children: "\u6DFB\u52A0" })
          ] }),
          denyRules.length === 0 ? /* @__PURE__ */ jsx("div", { className: "empty-hint", children: "\u6682\u65E0\u81EA\u5B9A\u4E49\u9700\u786E\u8BA4\u89C4\u5219" }) : denyRules.map((rule, i) => /* @__PURE__ */ jsxs("div", { className: "rule-row", children: [
            /* @__PURE__ */ jsxs("span", { className: "rule-label", children: [
              /* @__PURE__ */ jsx("span", { className: "rule-dot deny" }),
              rule
            ] }),
            /* @__PURE__ */ jsx("button", { className: "btn btn-sm btn-danger", onClick: () => removeRule("softDeny", i), disabled: saving, children: "\u5220\u9664" })
          ] }, i))
        ] })
      ] })
    ] }) : (
      /* JSON 高级编辑 */
      /* @__PURE__ */ jsxs("div", { className: "section", children: [
        /* @__PURE__ */ jsx("div", { className: "section-header", children: /* @__PURE__ */ jsx("span", { children: "settings.json \u7F16\u8F91" }) }),
        /* @__PURE__ */ jsxs("div", { className: "section-body", children: [
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "json-editor",
              value: jsonEdit,
              onChange: (e) => setJsonEdit(e.target.value),
              spellCheck: false
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "action-row", children: [
            /* @__PURE__ */ jsx("button", { className: "btn", onClick: handleSaveJson, disabled: saving, children: saving ? "\u4FDD\u5B58\u4E2D..." : "\u4FDD\u5B58" }),
            /* @__PURE__ */ jsx("button", { className: "btn", onClick: () => settings && setJsonEdit(JSON.stringify(settings, null, 2)), children: "\u91CD\u7F6E" })
          ] })
        ] })
      ] })
    )
  ] });
}
export {
  ClaudeCodePanel as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL1BhbmVsLnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBDbGF1ZGUgQ29kZSBcdTdCQTFcdTc0MDZcdTk3NjJcdTY3N0ZcbiAqXG4gKiBcdTk2RjZcdTY3MERcdTUyQTFcdThGREJcdTdBMEJcdUZGMUFcdTUxNjhcdTkwRThcdTY0Q0RcdTRGNUNcdTkwMUFcdThGQzcgd2luZG93Ll9fUE9MQVJJU19IT1NUX0lOVk9LRV9fIFx1OEMwM1x1NzUyOFx1NTQwRVx1N0FFRlx1NTQ3RFx1NEVFNFx1MzAwMlxuICogXHU2NUUwIE1DUCBzZXJ2ZXJcdTMwMDFcdTY1RTAgSFRUUCBcdTY3MERcdTUyQTFcdTMwMDFcdTY1RTBcdTYzMDFcdTRFNDVcdTUzMTZcdTVCNTBcdThGREJcdTdBMEJcdTMwMDJcbiAqL1xuXG5pbXBvcnQgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0LCB1c2VDYWxsYmFjayB9IGZyb20gJ3JlYWN0J1xuXG4vLyA9PT09PSBcdTU0MEVcdTdBRUZcdThDMDNcdTc1MjhcdTVDMDFcdTg4QzVcdUZGMDhcdTkwMUFcdThGQzdcdTVCQkZcdTRFM0JcdTY2QjRcdTk3MzJcdTc2ODQgaW52b2tlXHVGRjA5ID09PT09XG5jb25zdCBpbnZva2U6IDxUPihjbWQ6IHN0cmluZywgYXJncz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiBQcm9taXNlPFQ+ID1cbiAgKHdpbmRvdyBhcyBhbnkpLl9fUE9MQVJJU19IT1NUX0lOVk9LRV9fXG5cbmludGVyZmFjZSBDbGF1ZGVTZXR0aW5ncyB7XG4gIGF1dG9Nb2RlPzogeyBhbGxvdzogc3RyaW5nW107IHNvZnREZW55OiBzdHJpbmdbXSB9XG4gIHBlcm1pc3Npb25zPzogeyBhbGxvdz86IHN0cmluZ1tdOyBkZW55Pzogc3RyaW5nW107IGFzaz86IHN0cmluZ1tdOyBba2V5OiBzdHJpbmddOiB1bmtub3duIH1cbiAgbW9kZWw/OiBzdHJpbmdcbiAgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICBba2V5OiBzdHJpbmddOiB1bmtub3duXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRTZXR0aW5ncygpOiBQcm9taXNlPENsYXVkZVNldHRpbmdzPiB7XG4gIHJldHVybiBpbnZva2U8Q2xhdWRlU2V0dGluZ3M+KCdyZWFkX2NsYXVkZV9zZXR0aW5ncycpXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdyaXRlU2V0dGluZ3Moc2V0dGluZ3M6IENsYXVkZVNldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBpbnZva2UoJ3dyaXRlX2NsYXVkZV9zZXR0aW5ncycsIHsgc2V0dGluZ3MgfSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3NQYXRoKCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBpbnZva2U8c3RyaW5nPignZ2V0X2NsYXVkZV9zZXR0aW5nc19wYXRoJylcbn1cblxuLy8gPT09PT0gXHU2ODM3XHU1RjBGID09PT09XG5jb25zdCBzdHlsZXMgPSBgXG4uY2xhdWRlLWNvZGUtcGFuZWwge1xuICBwYWRkaW5nOiAxMnB4O1xuICBoZWlnaHQ6IDEwMCU7XG4gIG92ZXJmbG93LXk6IGF1dG87XG4gIGZvbnQtc2l6ZTogMTNweDtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSwgI2U0ZTRlNyk7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgaDIge1xuICBtYXJnaW46IDAgMCA0cHggMDtcbiAgZm9udC1zaXplOiAxNXB4O1xuICBmb250LXdlaWdodDogNjAwO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5zdWJ0aXRsZSB7XG4gIG1hcmdpbjogMCAwIDE2cHggMDtcbiAgZm9udC1zaXplOiAxMXB4O1xuICBjb2xvcjogdmFyKC0tdGV4dC10ZXJ0aWFyeSwgIzhlOGU5Myk7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnNlY3Rpb24ge1xuICBtYXJnaW4tYm90dG9tOiAxNnB4O1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItc3VidGxlLCAjM2YzZjQ2KTtcbiAgYm9yZGVyLXJhZGl1czogOHB4O1xuICBvdmVyZmxvdzogaGlkZGVuO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5zZWN0aW9uLWhlYWRlciB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgcGFkZGluZzogMTBweCAxMnB4O1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1zdWJ0bGUsICMzZjNmNDYpO1xuICBmb250LXNpemU6IDEycHg7XG4gIGZvbnQtd2VpZ2h0OiA1MDA7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnNlY3Rpb24tYm9keSB7XG4gIHBhZGRpbmc6IDhweCAxMnB4O1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLWVsZXZhdGVkLCAjMWMxYzFlKTtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1yb3cge1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gIHBhZGRpbmc6IDZweCAwO1xuICBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLXN1YnRsZSwgIzNmM2Y0Nik7XG4gIGZvbnQtc2l6ZTogMTJweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1yb3c6bGFzdC1jaGlsZCB7XG4gIGJvcmRlci1ib3R0b206IG5vbmU7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnJ1bGUtbGFiZWwge1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDZweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1kb3Qge1xuICB3aWR0aDogNnB4O1xuICBoZWlnaHQ6IDZweDtcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xuICBmbGV4LXNocmluazogMDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1kb3QuYWxsb3cgeyBiYWNrZ3JvdW5kOiAjMjJjNTVlOyB9XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnJ1bGUtZG90LmRlbnkgeyBiYWNrZ3JvdW5kOiAjZWFiMzA4OyB9XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmJ0biB7XG4gIHBhZGRpbmc6IDRweCAxMHB4O1xuICBib3JkZXItcmFkaXVzOiA2cHg7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1zdWJ0bGUsICMzZjNmNDYpO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5LCAjYjRiNGI4KTtcbiAgZm9udC1zaXplOiAxMXB4O1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmJ0bjpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtaG92ZXIsICMyZDJkMzMpO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5idG4tZGFuZ2VyIHtcbiAgYm9yZGVyLWNvbG9yOiByZ2JhKDIzOSwgNjgsIDY4LCAwLjMpO1xuICBjb2xvcjogI2VmNDQ0NDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuYnRuLWRhbmdlcjpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHJnYmEoMjM5LCA2OCwgNjgsIDAuMSk7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmJ0bi1zbSB7XG4gIHBhZGRpbmc6IDJweCA2cHg7XG4gIGZvbnQtc2l6ZTogMTBweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuZW1wdHktaGludCB7XG4gIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgcGFkZGluZzogMTJweCAwO1xuICBmb250LXNpemU6IDExcHg7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkLCAjNjM2MzY2KTtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucGF0aC1pbmZvIHtcbiAgZm9udC1zaXplOiAxMHB4O1xuICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCwgIzYzNjM2Nik7XG4gIG1hcmdpbi1ib3R0b206IDEycHg7XG4gIHdvcmQtYnJlYWs6IGJyZWFrLWFsbDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucGF0aC1pbmZvIGNvZGUge1xuICBjb2xvcjogdmFyKC0tcHJpbWFyeSwgIzNiODJmNik7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgaW5wdXRbdHlwZT1cInRleHRcIl0ge1xuICB3aWR0aDogMTAwJTtcbiAgcGFkZGluZzogNnB4IDhweDtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLXN1YnRsZSwgIzNmM2Y0Nik7XG4gIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSwgI2U0ZTRlNyk7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXTpmb2N1cyB7XG4gIG91dGxpbmU6IG5vbmU7XG4gIGJvcmRlci1jb2xvcjogdmFyKC0tcHJpbWFyeSwgIzNiODJmNik7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmFkZC1hcmVhIHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiA2cHg7XG4gIG1hcmdpbi10b3A6IDhweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuYWRkLWFyZWEgaW5wdXQge1xuICBmbGV4OiAxO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC50YWItYmFyIHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiA0cHg7XG4gIG1hcmdpbi1ib3R0b206IDEycHg7XG4gIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItc3VidGxlLCAjM2YzZjQ2KTtcbiAgcGFkZGluZy1ib3R0b206IDhweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAudGFiIHtcbiAgcGFkZGluZzogNHB4IDEycHg7XG4gIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgZm9udC1zaXplOiAxMnB4O1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSwgI2I0YjRiOCk7XG4gIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnRhYjpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtaG92ZXIsICMyZDJkMzMpO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC50YWIuYWN0aXZlIHtcbiAgYmFja2dyb3VuZDogcmdiYSg1OSwgMTMwLCAyNDYsIDAuMSk7XG4gIGNvbG9yOiB2YXIoLS1wcmltYXJ5LCAjM2I4MmY2KTtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuanNvbi1lZGl0b3Ige1xuICB3aWR0aDogMTAwJTtcbiAgbWluLWhlaWdodDogMjAwcHg7XG4gIHBhZGRpbmc6IDhweDtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLXN1YnRsZSwgIzNmM2Y0Nik7XG4gIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSwgI2U0ZTRlNyk7XG4gIGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XG4gIGZvbnQtc2l6ZTogMTFweDtcbiAgcmVzaXplOiB2ZXJ0aWNhbDtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuanNvbi1lZGl0b3I6Zm9jdXMge1xuICBvdXRsaW5lOiBub25lO1xuICBib3JkZXItY29sb3I6IHZhcigtLXByaW1hcnksICMzYjgyZjYpO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5hY3Rpb24tcm93IHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiA2cHg7XG4gIG1hcmdpbi10b3A6IDhweDtcbn1cbmBcblxuLy8gPT09PT0gXHU0RTNCXHU5NzYyXHU2NzdGXHU3RUM0XHU0RUY2ID09PT09XG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBDbGF1ZGVDb2RlUGFuZWwoKSB7XG4gIGNvbnN0IFt0YWIsIHNldFRhYl0gPSB1c2VTdGF0ZTwncnVsZXMnIHwgJ2pzb24nPigncnVsZXMnKVxuICBjb25zdCBbc2V0dGluZ3MsIHNldFNldHRpbmdzXSA9IHVzZVN0YXRlPENsYXVkZVNldHRpbmdzIHwgbnVsbD4obnVsbClcbiAgY29uc3QgW3NldHRpbmdzUGF0aCwgc2V0U2V0dGluZ3NQYXRoXSA9IHVzZVN0YXRlKCcnKVxuICBjb25zdCBbbG9hZGluZywgc2V0TG9hZGluZ10gPSB1c2VTdGF0ZSh0cnVlKVxuICBjb25zdCBbc2F2aW5nLCBzZXRTYXZpbmddID0gdXNlU3RhdGUoZmFsc2UpXG4gIGNvbnN0IFtlcnJvciwgc2V0RXJyb3JdID0gdXNlU3RhdGU8c3RyaW5nIHwgbnVsbD4obnVsbClcbiAgY29uc3QgW2pzb25FZGl0LCBzZXRKc29uRWRpdF0gPSB1c2VTdGF0ZSgnJylcbiAgY29uc3QgW25ld0FsbG93LCBzZXROZXdBbGxvd10gPSB1c2VTdGF0ZSgnJylcbiAgY29uc3QgW25ld0RlbnksIHNldE5ld0RlbnldID0gdXNlU3RhdGUoJycpXG4gIGNvbnN0IFtzaG93QWRkQWxsb3csIHNldFNob3dBZGRBbGxvd10gPSB1c2VTdGF0ZShmYWxzZSlcbiAgY29uc3QgW3Nob3dBZGREZW55LCBzZXRTaG93QWRkRGVueV0gPSB1c2VTdGF0ZShmYWxzZSlcblxuICBjb25zdCBsb2FkID0gdXNlQ2FsbGJhY2soYXN5bmMgKCkgPT4ge1xuICAgIHNldExvYWRpbmcodHJ1ZSlcbiAgICBzZXRFcnJvcihudWxsKVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBbcywgcF0gPSBhd2FpdCBQcm9taXNlLmFsbChbcmVhZFNldHRpbmdzKCksIGdldFNldHRpbmdzUGF0aCgpXSlcbiAgICAgIHNldFNldHRpbmdzKHMpXG4gICAgICBzZXRTZXR0aW5nc1BhdGgocClcbiAgICAgIHNldEpzb25FZGl0KEpTT04uc3RyaW5naWZ5KHMsIG51bGwsIDIpKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHNldEVycm9yKGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKSlcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0TG9hZGluZyhmYWxzZSlcbiAgICB9XG4gIH0sIFtdKVxuXG4gIHVzZUVmZmVjdCgoKSA9PiB7IGxvYWQoKSB9LCBbbG9hZF0pXG5cbiAgLy8gXHU1MjA3XHU2MzYyIHRhYiBcdTY1RjZcdTU0MENcdTZCNjUgSlNPTiBcdTUxODVcdTVCQjlcbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAodGFiID09PSAnanNvbicgJiYgc2V0dGluZ3MpIHtcbiAgICAgIHNldEpzb25FZGl0KEpTT04uc3RyaW5naWZ5KHNldHRpbmdzLCBudWxsLCAyKSlcbiAgICB9XG4gIH0sIFt0YWIsIHNldHRpbmdzXSlcblxuICBjb25zdCBoYW5kbGVTYXZlSnNvbiA9IGFzeW5jICgpID0+IHtcbiAgICBzZXRTYXZpbmcodHJ1ZSlcbiAgICBzZXRFcnJvcihudWxsKVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb25FZGl0KSBhcyBDbGF1ZGVTZXR0aW5nc1xuICAgICAgYXdhaXQgd3JpdGVTZXR0aW5ncyhwYXJzZWQpXG4gICAgICBzZXRTZXR0aW5ncyhwYXJzZWQpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgc2V0RXJyb3IoZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpKVxuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRTYXZpbmcoZmFsc2UpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgYWRkUnVsZSA9IGFzeW5jICh0eXBlOiAnYWxsb3cnIHwgJ3NvZnREZW55JywgdmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGlmICghdmFsdWUudHJpbSgpIHx8ICFzZXR0aW5ncykgcmV0dXJuXG4gICAgc2V0U2F2aW5nKHRydWUpXG4gICAgc2V0RXJyb3IobnVsbClcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXV0b01vZGUgPSBzZXR0aW5ncy5hdXRvTW9kZSA/PyB7IGFsbG93OiBbXSwgc29mdERlbnk6IFtdIH1cbiAgICAgIGNvbnN0IGtleSA9IHR5cGUgPT09ICdhbGxvdycgPyAnYWxsb3cnIDogJ3NvZnREZW55J1xuICAgICAgY29uc3QgbGlzdCA9IFsuLi5hdXRvTW9kZVtrZXldXVxuICAgICAgaWYgKCFsaXN0LmluY2x1ZGVzKHZhbHVlLnRyaW0oKSkpIHtcbiAgICAgICAgbGlzdC5wdXNoKHZhbHVlLnRyaW0oKSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5ld1NldHRpbmdzID0geyAuLi5zZXR0aW5ncywgYXV0b01vZGU6IHsgLi4uYXV0b01vZGUsIFtrZXldOiBsaXN0IH0gfVxuICAgICAgYXdhaXQgd3JpdGVTZXR0aW5ncyhuZXdTZXR0aW5ncylcbiAgICAgIHNldFNldHRpbmdzKG5ld1NldHRpbmdzKVxuICAgICAgaWYgKHR5cGUgPT09ICdhbGxvdycpIHsgc2V0TmV3QWxsb3coJycpOyBzZXRTaG93QWRkQWxsb3coZmFsc2UpIH1cbiAgICAgIGVsc2UgeyBzZXROZXdEZW55KCcnKTsgc2V0U2hvd0FkZERlbnkoZmFsc2UpIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBzZXRFcnJvcihlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldFNhdmluZyhmYWxzZSlcbiAgICB9XG4gIH1cblxuICBjb25zdCByZW1vdmVSdWxlID0gYXN5bmMgKHR5cGU6ICdhbGxvdycgfCAnc29mdERlbnknLCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgaWYgKCFzZXR0aW5ncykgcmV0dXJuXG4gICAgc2V0U2F2aW5nKHRydWUpXG4gICAgc2V0RXJyb3IobnVsbClcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXV0b01vZGUgPSBzZXR0aW5ncy5hdXRvTW9kZSA/PyB7IGFsbG93OiBbXSwgc29mdERlbnk6IFtdIH1cbiAgICAgIGNvbnN0IGtleSA9IHR5cGUgPT09ICdhbGxvdycgPyAnYWxsb3cnIDogJ3NvZnREZW55J1xuICAgICAgY29uc3QgbGlzdCA9IFsuLi5hdXRvTW9kZVtrZXldXVxuICAgICAgbGlzdC5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBjb25zdCBuZXdTZXR0aW5ncyA9IHsgLi4uc2V0dGluZ3MsIGF1dG9Nb2RlOiB7IC4uLmF1dG9Nb2RlLCBba2V5XTogbGlzdCB9IH1cbiAgICAgIGF3YWl0IHdyaXRlU2V0dGluZ3MobmV3U2V0dGluZ3MpXG4gICAgICBzZXRTZXR0aW5ncyhuZXdTZXR0aW5ncylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBzZXRFcnJvcihlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldFNhdmluZyhmYWxzZSlcbiAgICB9XG4gIH1cblxuICBpZiAobG9hZGluZykge1xuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImNsYXVkZS1jb2RlLXBhbmVsXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktaGludFwiPlx1NTJBMFx1OEY3RFx1NEUyRC4uLjwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG5cbiAgY29uc3QgYWxsb3dSdWxlcyA9IHNldHRpbmdzPy5hdXRvTW9kZT8uYWxsb3cgPz8gW11cbiAgY29uc3QgZGVueVJ1bGVzID0gc2V0dGluZ3M/LmF1dG9Nb2RlPy5zb2Z0RGVueSA/PyBbXVxuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJjbGF1ZGUtY29kZS1wYW5lbFwiPlxuICAgICAgPHN0eWxlPntzdHlsZXN9PC9zdHlsZT5cblxuICAgICAgPGgyPkNsYXVkZSBDb2RlPC9oMj5cbiAgICAgIDxwIGNsYXNzTmFtZT1cInN1YnRpdGxlXCI+XHU3QkExXHU3NDA2IH4vLmNsYXVkZS9zZXR0aW5ncy5qc29uIFx1OTE0RFx1N0Y2RTwvcD5cblxuICAgICAge3NldHRpbmdzUGF0aCAmJiAoXG4gICAgICAgIDxwIGNsYXNzTmFtZT1cInBhdGgtaW5mb1wiPlxuICAgICAgICAgIFx1OERFRlx1NUY4NDogPGNvZGU+e3NldHRpbmdzUGF0aH08L2NvZGU+XG4gICAgICAgIDwvcD5cbiAgICAgICl9XG5cbiAgICAgIHtlcnJvciAmJiAoXG4gICAgICAgIDxkaXYgc3R5bGU9e3sgcGFkZGluZzogJzhweCAxMnB4JywgbWFyZ2luQm90dG9tOiAxMiwgYm9yZGVyUmFkaXVzOiA2LCBiYWNrZ3JvdW5kOiAncmdiYSgyMzksNjgsNjgsMC4xKScsIGNvbG9yOiAnI2VmNDQ0NCcsIGZvbnRTaXplOiAxMiB9fT5cbiAgICAgICAgICB7ZXJyb3J9XG4gICAgICAgIDwvZGl2PlxuICAgICAgKX1cblxuICAgICAgey8qIFRhYiBcdTUyMDdcdTYzNjIgKi99XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cInRhYi1iYXJcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9e2B0YWIke3RhYiA9PT0gJ3J1bGVzJyA/ICcgYWN0aXZlJyA6ICcnfWB9IG9uQ2xpY2s9eygpID0+IHNldFRhYigncnVsZXMnKX0+XG4gICAgICAgICAgXHU4OUM0XHU1MjE5XHU1MjE3XHU4ODY4XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YHRhYiR7dGFiID09PSAnanNvbicgPyAnIGFjdGl2ZScgOiAnJ31gfSBvbkNsaWNrPXsoKSA9PiBzZXRUYWIoJ2pzb24nKX0+XG4gICAgICAgICAgXHU5QUQ4XHU3RUE3XHU3RjE2XHU4RjkxXG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIHt0YWIgPT09ICdydWxlcycgPyAoXG4gICAgICAgIDw+XG4gICAgICAgICAgey8qIEFsbG93IFx1ODlDNFx1NTIxOSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgPHNwYW4+XHU1MTQxXHU4QkI4XHU4OUM0XHU1MjE5XHVGRjA4QWxsb3dcdUZGMDk8L3NwYW4+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1zbVwiIG9uQ2xpY2s9eygpID0+IHNldFNob3dBZGRBbGxvdyghc2hvd0FkZEFsbG93KX0+XG4gICAgICAgICAgICAgICAge3Nob3dBZGRBbGxvdyA/ICdcdTUzRDZcdTZEODgnIDogJysgXHU2REZCXHU1MkEwJ31cbiAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1ib2R5XCI+XG4gICAgICAgICAgICAgIHtzaG93QWRkQWxsb3cgJiYgKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWRkLWFyZWFcIj5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlPXtuZXdBbGxvd31cbiAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXROZXdBbGxvdyhlLnRhcmdldC52YWx1ZSl9XG4gICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiXHU4RjkzXHU1MTY1XHU4OUM0XHU1MjE5XHU1NDBEXHU3OUYwXCJcbiAgICAgICAgICAgICAgICAgICAgb25LZXlEb3duPXsoZSkgPT4gZS5rZXkgPT09ICdFbnRlcicgJiYgYWRkUnVsZSgnYWxsb3cnLCBuZXdBbGxvdyl9XG4gICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG5cIiBvbkNsaWNrPXsoKSA9PiBhZGRSdWxlKCdhbGxvdycsIG5ld0FsbG93KX0gZGlzYWJsZWQ9e3NhdmluZyB8fCAhbmV3QWxsb3cudHJpbSgpfT5cbiAgICAgICAgICAgICAgICAgICAgXHU2REZCXHU1MkEwXG4gICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAge2FsbG93UnVsZXMubGVuZ3RoID09PSAwID8gKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktaGludFwiPlx1NjY4Mlx1NjVFMFx1ODFFQVx1NUI5QVx1NEU0OVx1NTE0MVx1OEJCOFx1ODlDNFx1NTIxOTwvZGl2PlxuICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgIGFsbG93UnVsZXMubWFwKChydWxlOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gKFxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJydWxlLXJvd1wiIGtleT17aX0+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJ1bGUtbGFiZWxcIj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJydWxlLWRvdCBhbGxvd1wiIC8+XG4gICAgICAgICAgICAgICAgICAgICAge3J1bGV9XG4gICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXNtIGJ0bi1kYW5nZXJcIiBvbkNsaWNrPXsoKSA9PiByZW1vdmVSdWxlKCdhbGxvdycsIGkpfSBkaXNhYmxlZD17c2F2aW5nfT5cbiAgICAgICAgICAgICAgICAgICAgICBcdTUyMjBcdTk2NjRcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApKVxuICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICB7LyogU29mdCBEZW55IFx1ODlDNFx1NTIxOSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgPHNwYW4+XHU5NzAwXHU3ODZFXHU4QkE0XHU4OUM0XHU1MjE5XHVGRjA4U29mdCBEZW55XHVGRjA5PC9zcGFuPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0biBidG4tc21cIiBvbkNsaWNrPXsoKSA9PiBzZXRTaG93QWRkRGVueSghc2hvd0FkZERlbnkpfT5cbiAgICAgICAgICAgICAgICB7c2hvd0FkZERlbnkgPyAnXHU1M0Q2XHU2RDg4JyA6ICcrIFx1NkRGQlx1NTJBMCd9XG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb24tYm9keVwiPlxuICAgICAgICAgICAgICB7c2hvd0FkZERlbnkgJiYgKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWRkLWFyZWFcIj5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlPXtuZXdEZW55fVxuICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldE5ld0RlbnkoZS50YXJnZXQudmFsdWUpfVxuICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIlx1OEY5M1x1NTE2NVx1ODlDNFx1NTIxOVx1NTQwRFx1NzlGMFwiXG4gICAgICAgICAgICAgICAgICAgIG9uS2V5RG93bj17KGUpID0+IGUua2V5ID09PSAnRW50ZXInICYmIGFkZFJ1bGUoJ3NvZnREZW55JywgbmV3RGVueSl9XG4gICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG5cIiBvbkNsaWNrPXsoKSA9PiBhZGRSdWxlKCdzb2Z0RGVueScsIG5ld0RlbnkpfSBkaXNhYmxlZD17c2F2aW5nIHx8ICFuZXdEZW55LnRyaW0oKX0+XG4gICAgICAgICAgICAgICAgICAgIFx1NkRGQlx1NTJBMFxuICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgIHtkZW55UnVsZXMubGVuZ3RoID09PSAwID8gKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktaGludFwiPlx1NjY4Mlx1NjVFMFx1ODFFQVx1NUI5QVx1NEU0OVx1OTcwMFx1Nzg2RVx1OEJBNFx1ODlDNFx1NTIxOTwvZGl2PlxuICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgIGRlbnlSdWxlcy5tYXAoKHJ1bGU6IHN0cmluZywgaTogbnVtYmVyKSA9PiAoXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJ1bGUtcm93XCIga2V5PXtpfT5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicnVsZS1sYWJlbFwiPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJ1bGUtZG90IGRlbnlcIiAvPlxuICAgICAgICAgICAgICAgICAgICAgIHtydWxlfVxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1zbSBidG4tZGFuZ2VyXCIgb25DbGljaz17KCkgPT4gcmVtb3ZlUnVsZSgnc29mdERlbnknLCBpKX0gZGlzYWJsZWQ9e3NhdmluZ30+XG4gICAgICAgICAgICAgICAgICAgICAgXHU1MjIwXHU5NjY0XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSlcbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8Lz5cbiAgICAgICkgOiAoXG4gICAgICAgIC8qIEpTT04gXHU5QUQ4XHU3RUE3XHU3RjE2XHU4RjkxICovXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvblwiPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgIDxzcGFuPnNldHRpbmdzLmpzb24gXHU3RjE2XHU4RjkxPC9zcGFuPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1ib2R5XCI+XG4gICAgICAgICAgICA8dGV4dGFyZWFcbiAgICAgICAgICAgICAgY2xhc3NOYW1lPVwianNvbi1lZGl0b3JcIlxuICAgICAgICAgICAgICB2YWx1ZT17anNvbkVkaXR9XG4gICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4gc2V0SnNvbkVkaXQoZS50YXJnZXQudmFsdWUpfVxuICAgICAgICAgICAgICBzcGVsbENoZWNrPXtmYWxzZX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImFjdGlvbi1yb3dcIj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG5cIiBvbkNsaWNrPXtoYW5kbGVTYXZlSnNvbn0gZGlzYWJsZWQ9e3NhdmluZ30+XG4gICAgICAgICAgICAgICAge3NhdmluZyA/ICdcdTRGRERcdTVCNThcdTRFMkQuLi4nIDogJ1x1NEZERFx1NUI1OCd9XG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0blwiIG9uQ2xpY2s9eygpID0+IHNldHRpbmdzICYmIHNldEpzb25FZGl0KEpTT04uc3RyaW5naWZ5KHNldHRpbmdzLCBudWxsLCAyKSl9PlxuICAgICAgICAgICAgICAgIFx1OTFDRFx1N0Y2RVxuICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgICl9XG4gICAgPC9kaXY+XG4gIClcbn0iXSwKICAibWFwcGluZ3MiOiAiO0FBT0EsU0FBUyxVQUFVLFdBQVcsbUJBQW1CO0FBcVN6QyxTQXNDQSxVQXRDQSxLQWdCQSxZQWhCQTtBQWxTUixJQUFNLFNBQ0gsT0FBZTtBQVVsQixlQUFlLGVBQXdDO0FBQ3JELFNBQU8sT0FBdUIsc0JBQXNCO0FBQ3REO0FBRUEsZUFBZSxjQUFjLFVBQXlDO0FBQ3BFLFNBQU8sT0FBTyx5QkFBeUIsRUFBRSxTQUFTLENBQUM7QUFDckQ7QUFFQSxlQUFlLGtCQUFtQztBQUNoRCxTQUFPLE9BQWUsMEJBQTBCO0FBQ2xEO0FBR0EsSUFBTSxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTBLQSxTQUFSLGtCQUFtQztBQUN4QyxRQUFNLENBQUMsS0FBSyxNQUFNLElBQUksU0FBMkIsT0FBTztBQUN4RCxRQUFNLENBQUMsVUFBVSxXQUFXLElBQUksU0FBZ0MsSUFBSTtBQUNwRSxRQUFNLENBQUMsY0FBYyxlQUFlLElBQUksU0FBUyxFQUFFO0FBQ25ELFFBQU0sQ0FBQyxTQUFTLFVBQVUsSUFBSSxTQUFTLElBQUk7QUFDM0MsUUFBTSxDQUFDLFFBQVEsU0FBUyxJQUFJLFNBQVMsS0FBSztBQUMxQyxRQUFNLENBQUMsT0FBTyxRQUFRLElBQUksU0FBd0IsSUFBSTtBQUN0RCxRQUFNLENBQUMsVUFBVSxXQUFXLElBQUksU0FBUyxFQUFFO0FBQzNDLFFBQU0sQ0FBQyxVQUFVLFdBQVcsSUFBSSxTQUFTLEVBQUU7QUFDM0MsUUFBTSxDQUFDLFNBQVMsVUFBVSxJQUFJLFNBQVMsRUFBRTtBQUN6QyxRQUFNLENBQUMsY0FBYyxlQUFlLElBQUksU0FBUyxLQUFLO0FB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
