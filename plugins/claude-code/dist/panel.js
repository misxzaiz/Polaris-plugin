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
var DEFAULT_RULES = {
  allow: [
    "Read file: Read files from the local file system",
    "Local operations: Execute local shell commands within project scope",
    "Tool execution: Run analysis tools, linters, and tests",
    "File creation: Create new files in the project directory",
    "File modification: Modify existing files in the project directory",
    "Glob search: Search for files using glob patterns",
    "Git operations: Run git status, diff, log and other read-only git commands"
  ],
  softDeny: [
    "Network access: Make external network requests and API calls",
    "Package installation: Install or update npm/pip/cargo packages",
    "Environment modification: Modify system environment variables",
    "Process management: Start or stop system processes",
    "Sensitive data: Read potentially sensitive files (credentials, configs)",
    "File deletion: Delete files or directories from the file system",
    "Git write operations: Git commit, push, branch operations"
  ]
};
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
  const [showDefaults, setShowDefaults] = useState(false);
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
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "section", children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: "section-header",
            style: { cursor: "pointer" },
            onClick: () => setShowDefaults(!showDefaults),
            children: [
              /* @__PURE__ */ jsx("span", { children: "\u9ED8\u8BA4\u89C4\u5219\uFF08\u5185\u7F6E\uFF0C\u4E0D\u53EF\u4FEE\u6539\uFF09" }),
              /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "var(--text-muted, #636366)" }, children: [
                showDefaults ? "\u6536\u8D77" : "\u5C55\u5F00",
                " \xB7 \u5141\u8BB8 ",
                DEFAULT_RULES.allow.length,
                " \u6761 \xB7 \u9700\u786E\u8BA4 ",
                DEFAULT_RULES.softDeny.length,
                " \u6761"
              ] })
            ]
          }
        ),
        showDefaults && /* @__PURE__ */ jsxs("div", { className: "section-body", children: [
          /* @__PURE__ */ jsxs("div", { style: { marginBottom: 8, fontSize: 11, fontWeight: 500, color: "var(--text-secondary, #b4b4b8)" }, children: [
            "\u5141\u8BB8\u89C4\u5219\uFF08",
            DEFAULT_RULES.allow.length,
            "\uFF09"
          ] }),
          DEFAULT_RULES.allow.map((rule, i) => /* @__PURE__ */ jsx("div", { className: "rule-row", children: /* @__PURE__ */ jsxs("span", { className: "rule-label", children: [
            /* @__PURE__ */ jsx("span", { className: "rule-dot allow" }),
            /* @__PURE__ */ jsx("span", { children: rule })
          ] }) }, `da-${i}`)),
          /* @__PURE__ */ jsxs("div", { style: { marginTop: 12, marginBottom: 8, fontSize: 11, fontWeight: 500, color: "var(--text-secondary, #b4b4b8)" }, children: [
            "\u9700\u786E\u8BA4\u89C4\u5219\uFF08",
            DEFAULT_RULES.softDeny.length,
            "\uFF09"
          ] }),
          DEFAULT_RULES.softDeny.map((rule, i) => /* @__PURE__ */ jsx("div", { className: "rule-row", children: /* @__PURE__ */ jsxs("span", { className: "rule-label", children: [
            /* @__PURE__ */ jsx("span", { className: "rule-dot deny" }),
            /* @__PURE__ */ jsx("span", { children: rule })
          ] }) }, `dd-${i}`))
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL1BhbmVsLnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBDbGF1ZGUgQ29kZSBcdTdCQTFcdTc0MDZcdTk3NjJcdTY3N0ZcbiAqXG4gKiBcdTk2RjZcdTY3MERcdTUyQTFcdThGREJcdTdBMEJcdUZGMUFcdTUxNjhcdTkwRThcdTY0Q0RcdTRGNUNcdTkwMUFcdThGQzcgd2luZG93Ll9fUE9MQVJJU19IT1NUX0lOVk9LRV9fIFx1OEMwM1x1NzUyOFx1NTQwRVx1N0FFRlx1NTQ3RFx1NEVFNFx1MzAwMlxuICogXHU2NUUwIE1DUCBzZXJ2ZXJcdTMwMDFcdTY1RTAgSFRUUCBcdTY3MERcdTUyQTFcdTMwMDFcdTY1RTBcdTYzMDFcdTRFNDVcdTUzMTZcdTVCNTBcdThGREJcdTdBMEJcdTMwMDJcbiAqL1xuXG5pbXBvcnQgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0LCB1c2VDYWxsYmFjayB9IGZyb20gJ3JlYWN0J1xuXG4vLyA9PT09PSBcdTU0MEVcdTdBRUZcdThDMDNcdTc1MjhcdTVDMDFcdTg4QzVcdUZGMDhcdTkwMUFcdThGQzdcdTVCQkZcdTRFM0JcdTY2QjRcdTk3MzJcdTc2ODQgaW52b2tlXHVGRjA5ID09PT09XG5jb25zdCBpbnZva2U6IDxUPihjbWQ6IHN0cmluZywgYXJncz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiBQcm9taXNlPFQ+ID1cbiAgKHdpbmRvdyBhcyBhbnkpLl9fUE9MQVJJU19IT1NUX0lOVk9LRV9fXG5cbmludGVyZmFjZSBDbGF1ZGVTZXR0aW5ncyB7XG4gIGF1dG9Nb2RlPzogeyBhbGxvdzogc3RyaW5nW107IHNvZnREZW55OiBzdHJpbmdbXSB9XG4gIHBlcm1pc3Npb25zPzogeyBhbGxvdz86IHN0cmluZ1tdOyBkZW55Pzogc3RyaW5nW107IGFzaz86IHN0cmluZ1tdOyBba2V5OiBzdHJpbmddOiB1bmtub3duIH1cbiAgbW9kZWw/OiBzdHJpbmdcbiAgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICBba2V5OiBzdHJpbmddOiB1bmtub3duXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRTZXR0aW5ncygpOiBQcm9taXNlPENsYXVkZVNldHRpbmdzPiB7XG4gIHJldHVybiBpbnZva2U8Q2xhdWRlU2V0dGluZ3M+KCdyZWFkX2NsYXVkZV9zZXR0aW5ncycpXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdyaXRlU2V0dGluZ3Moc2V0dGluZ3M6IENsYXVkZVNldHRpbmdzKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBpbnZva2UoJ3dyaXRlX2NsYXVkZV9zZXR0aW5ncycsIHsgc2V0dGluZ3MgfSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3NQYXRoKCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBpbnZva2U8c3RyaW5nPignZ2V0X2NsYXVkZV9zZXR0aW5nc19wYXRoJylcbn1cblxuLy8gPT09PT0gXHU2ODM3XHU1RjBGID09PT09XG5jb25zdCBzdHlsZXMgPSBgXG4uY2xhdWRlLWNvZGUtcGFuZWwge1xuICBwYWRkaW5nOiAxMnB4O1xuICBoZWlnaHQ6IDEwMCU7XG4gIG92ZXJmbG93LXk6IGF1dG87XG4gIGZvbnQtc2l6ZTogMTNweDtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSwgI2U0ZTRlNyk7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgaDIge1xuICBtYXJnaW46IDAgMCA0cHggMDtcbiAgZm9udC1zaXplOiAxNXB4O1xuICBmb250LXdlaWdodDogNjAwO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5zdWJ0aXRsZSB7XG4gIG1hcmdpbjogMCAwIDE2cHggMDtcbiAgZm9udC1zaXplOiAxMXB4O1xuICBjb2xvcjogdmFyKC0tdGV4dC10ZXJ0aWFyeSwgIzhlOGU5Myk7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnNlY3Rpb24ge1xuICBtYXJnaW4tYm90dG9tOiAxNnB4O1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItc3VidGxlLCAjM2YzZjQ2KTtcbiAgYm9yZGVyLXJhZGl1czogOHB4O1xuICBvdmVyZmxvdzogaGlkZGVuO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5zZWN0aW9uLWhlYWRlciB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgcGFkZGluZzogMTBweCAxMnB4O1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1zdWJ0bGUsICMzZjNmNDYpO1xuICBmb250LXNpemU6IDEycHg7XG4gIGZvbnQtd2VpZ2h0OiA1MDA7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnNlY3Rpb24tYm9keSB7XG4gIHBhZGRpbmc6IDhweCAxMnB4O1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLWVsZXZhdGVkLCAjMWMxYzFlKTtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1yb3cge1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gIHBhZGRpbmc6IDZweCAwO1xuICBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLXN1YnRsZSwgIzNmM2Y0Nik7XG4gIGZvbnQtc2l6ZTogMTJweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1yb3c6bGFzdC1jaGlsZCB7XG4gIGJvcmRlci1ib3R0b206IG5vbmU7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnJ1bGUtbGFiZWwge1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDZweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1kb3Qge1xuICB3aWR0aDogNnB4O1xuICBoZWlnaHQ6IDZweDtcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xuICBmbGV4LXNocmluazogMDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucnVsZS1kb3QuYWxsb3cgeyBiYWNrZ3JvdW5kOiAjMjJjNTVlOyB9XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnJ1bGUtZG90LmRlbnkgeyBiYWNrZ3JvdW5kOiAjZWFiMzA4OyB9XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmJ0biB7XG4gIHBhZGRpbmc6IDRweCAxMHB4O1xuICBib3JkZXItcmFkaXVzOiA2cHg7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1zdWJ0bGUsICMzZjNmNDYpO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5LCAjYjRiNGI4KTtcbiAgZm9udC1zaXplOiAxMXB4O1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmJ0bjpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtaG92ZXIsICMyZDJkMzMpO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5idG4tZGFuZ2VyIHtcbiAgYm9yZGVyLWNvbG9yOiByZ2JhKDIzOSwgNjgsIDY4LCAwLjMpO1xuICBjb2xvcjogI2VmNDQ0NDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuYnRuLWRhbmdlcjpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHJnYmEoMjM5LCA2OCwgNjgsIDAuMSk7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmJ0bi1zbSB7XG4gIHBhZGRpbmc6IDJweCA2cHg7XG4gIGZvbnQtc2l6ZTogMTBweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuZW1wdHktaGludCB7XG4gIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgcGFkZGluZzogMTJweCAwO1xuICBmb250LXNpemU6IDExcHg7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkLCAjNjM2MzY2KTtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucGF0aC1pbmZvIHtcbiAgZm9udC1zaXplOiAxMHB4O1xuICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCwgIzYzNjM2Nik7XG4gIG1hcmdpbi1ib3R0b206IDEycHg7XG4gIHdvcmQtYnJlYWs6IGJyZWFrLWFsbDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAucGF0aC1pbmZvIGNvZGUge1xuICBjb2xvcjogdmFyKC0tcHJpbWFyeSwgIzNiODJmNik7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgaW5wdXRbdHlwZT1cInRleHRcIl0ge1xuICB3aWR0aDogMTAwJTtcbiAgcGFkZGluZzogNnB4IDhweDtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLXN1YnRsZSwgIzNmM2Y0Nik7XG4gIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSwgI2U0ZTRlNyk7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCBpbnB1dFt0eXBlPVwidGV4dFwiXTpmb2N1cyB7XG4gIG91dGxpbmU6IG5vbmU7XG4gIGJvcmRlci1jb2xvcjogdmFyKC0tcHJpbWFyeSwgIzNiODJmNik7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLmFkZC1hcmVhIHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiA2cHg7XG4gIG1hcmdpbi10b3A6IDhweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuYWRkLWFyZWEgaW5wdXQge1xuICBmbGV4OiAxO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC50YWItYmFyIHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiA0cHg7XG4gIG1hcmdpbi1ib3R0b206IDEycHg7XG4gIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItc3VidGxlLCAjM2YzZjQ2KTtcbiAgcGFkZGluZy1ib3R0b206IDhweDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAudGFiIHtcbiAgcGFkZGluZzogNHB4IDEycHg7XG4gIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgZm9udC1zaXplOiAxMnB4O1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSwgI2I0YjRiOCk7XG4gIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG59XG4uY2xhdWRlLWNvZGUtcGFuZWwgLnRhYjpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtaG92ZXIsICMyZDJkMzMpO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC50YWIuYWN0aXZlIHtcbiAgYmFja2dyb3VuZDogcmdiYSg1OSwgMTMwLCAyNDYsIDAuMSk7XG4gIGNvbG9yOiB2YXIoLS1wcmltYXJ5LCAjM2I4MmY2KTtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuanNvbi1lZGl0b3Ige1xuICB3aWR0aDogMTAwJTtcbiAgbWluLWhlaWdodDogMjAwcHg7XG4gIHBhZGRpbmc6IDhweDtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLXN1YnRsZSwgIzNmM2Y0Nik7XG4gIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zdXJmYWNlLCAjMjUyNTJiKTtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSwgI2U0ZTRlNyk7XG4gIGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XG4gIGZvbnQtc2l6ZTogMTFweDtcbiAgcmVzaXplOiB2ZXJ0aWNhbDtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cbi5jbGF1ZGUtY29kZS1wYW5lbCAuanNvbi1lZGl0b3I6Zm9jdXMge1xuICBvdXRsaW5lOiBub25lO1xuICBib3JkZXItY29sb3I6IHZhcigtLXByaW1hcnksICMzYjgyZjYpO1xufVxuLmNsYXVkZS1jb2RlLXBhbmVsIC5hY3Rpb24tcm93IHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiA2cHg7XG4gIG1hcmdpbi10b3A6IDhweDtcbn1cbmBcblxuLy8gPT09PT0gQ2xhdWRlIENvZGUgXHU1MTg1XHU3RjZFXHU5RUQ4XHU4QkE0XHU4OUM0XHU1MjE5XHVGRjA4XHU3ODZDXHU3RjE2XHU3ODAxXHVGRjBDXHU5NkY2XHU4RkRCXHU3QTBCXHVGRjA5ID09PT09XG5jb25zdCBERUZBVUxUX1JVTEVTID0ge1xuICBhbGxvdzogW1xuICAgICdSZWFkIGZpbGU6IFJlYWQgZmlsZXMgZnJvbSB0aGUgbG9jYWwgZmlsZSBzeXN0ZW0nLFxuICAgICdMb2NhbCBvcGVyYXRpb25zOiBFeGVjdXRlIGxvY2FsIHNoZWxsIGNvbW1hbmRzIHdpdGhpbiBwcm9qZWN0IHNjb3BlJyxcbiAgICAnVG9vbCBleGVjdXRpb246IFJ1biBhbmFseXNpcyB0b29scywgbGludGVycywgYW5kIHRlc3RzJyxcbiAgICAnRmlsZSBjcmVhdGlvbjogQ3JlYXRlIG5ldyBmaWxlcyBpbiB0aGUgcHJvamVjdCBkaXJlY3RvcnknLFxuICAgICdGaWxlIG1vZGlmaWNhdGlvbjogTW9kaWZ5IGV4aXN0aW5nIGZpbGVzIGluIHRoZSBwcm9qZWN0IGRpcmVjdG9yeScsXG4gICAgJ0dsb2Igc2VhcmNoOiBTZWFyY2ggZm9yIGZpbGVzIHVzaW5nIGdsb2IgcGF0dGVybnMnLFxuICAgICdHaXQgb3BlcmF0aW9uczogUnVuIGdpdCBzdGF0dXMsIGRpZmYsIGxvZyBhbmQgb3RoZXIgcmVhZC1vbmx5IGdpdCBjb21tYW5kcycsXG4gIF0sXG4gIHNvZnREZW55OiBbXG4gICAgJ05ldHdvcmsgYWNjZXNzOiBNYWtlIGV4dGVybmFsIG5ldHdvcmsgcmVxdWVzdHMgYW5kIEFQSSBjYWxscycsXG4gICAgJ1BhY2thZ2UgaW5zdGFsbGF0aW9uOiBJbnN0YWxsIG9yIHVwZGF0ZSBucG0vcGlwL2NhcmdvIHBhY2thZ2VzJyxcbiAgICAnRW52aXJvbm1lbnQgbW9kaWZpY2F0aW9uOiBNb2RpZnkgc3lzdGVtIGVudmlyb25tZW50IHZhcmlhYmxlcycsXG4gICAgJ1Byb2Nlc3MgbWFuYWdlbWVudDogU3RhcnQgb3Igc3RvcCBzeXN0ZW0gcHJvY2Vzc2VzJyxcbiAgICAnU2Vuc2l0aXZlIGRhdGE6IFJlYWQgcG90ZW50aWFsbHkgc2Vuc2l0aXZlIGZpbGVzIChjcmVkZW50aWFscywgY29uZmlncyknLFxuICAgICdGaWxlIGRlbGV0aW9uOiBEZWxldGUgZmlsZXMgb3IgZGlyZWN0b3JpZXMgZnJvbSB0aGUgZmlsZSBzeXN0ZW0nLFxuICAgICdHaXQgd3JpdGUgb3BlcmF0aW9uczogR2l0IGNvbW1pdCwgcHVzaCwgYnJhbmNoIG9wZXJhdGlvbnMnLFxuICBdLFxufVxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQ2xhdWRlQ29kZVBhbmVsKCkge1xuICBjb25zdCBbdGFiLCBzZXRUYWJdID0gdXNlU3RhdGU8J3J1bGVzJyB8ICdqc29uJz4oJ3J1bGVzJylcbiAgY29uc3QgW3NldHRpbmdzLCBzZXRTZXR0aW5nc10gPSB1c2VTdGF0ZTxDbGF1ZGVTZXR0aW5ncyB8IG51bGw+KG51bGwpXG4gIGNvbnN0IFtzZXR0aW5nc1BhdGgsIHNldFNldHRpbmdzUGF0aF0gPSB1c2VTdGF0ZSgnJylcbiAgY29uc3QgW2xvYWRpbmcsIHNldExvYWRpbmddID0gdXNlU3RhdGUodHJ1ZSlcbiAgY29uc3QgW3NhdmluZywgc2V0U2F2aW5nXSA9IHVzZVN0YXRlKGZhbHNlKVxuICBjb25zdCBbZXJyb3IsIHNldEVycm9yXSA9IHVzZVN0YXRlPHN0cmluZyB8IG51bGw+KG51bGwpXG4gIGNvbnN0IFtqc29uRWRpdCwgc2V0SnNvbkVkaXRdID0gdXNlU3RhdGUoJycpXG4gIGNvbnN0IFtuZXdBbGxvdywgc2V0TmV3QWxsb3ddID0gdXNlU3RhdGUoJycpXG4gIGNvbnN0IFtuZXdEZW55LCBzZXROZXdEZW55XSA9IHVzZVN0YXRlKCcnKVxuICBjb25zdCBbc2hvd0FkZEFsbG93LCBzZXRTaG93QWRkQWxsb3ddID0gdXNlU3RhdGUoZmFsc2UpXG4gIGNvbnN0IFtzaG93QWRkRGVueSwgc2V0U2hvd0FkZERlbnldID0gdXNlU3RhdGUoZmFsc2UpXG4gIGNvbnN0IFtzaG93RGVmYXVsdHMsIHNldFNob3dEZWZhdWx0c10gPSB1c2VTdGF0ZShmYWxzZSlcblxuICBjb25zdCBsb2FkID0gdXNlQ2FsbGJhY2soYXN5bmMgKCkgPT4ge1xuICAgIHNldExvYWRpbmcodHJ1ZSlcbiAgICBzZXRFcnJvcihudWxsKVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBbcywgcF0gPSBhd2FpdCBQcm9taXNlLmFsbChbcmVhZFNldHRpbmdzKCksIGdldFNldHRpbmdzUGF0aCgpXSlcbiAgICAgIHNldFNldHRpbmdzKHMpXG4gICAgICBzZXRTZXR0aW5nc1BhdGgocClcbiAgICAgIHNldEpzb25FZGl0KEpTT04uc3RyaW5naWZ5KHMsIG51bGwsIDIpKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHNldEVycm9yKGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKSlcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0TG9hZGluZyhmYWxzZSlcbiAgICB9XG4gIH0sIFtdKVxuXG4gIHVzZUVmZmVjdCgoKSA9PiB7IGxvYWQoKSB9LCBbbG9hZF0pXG5cbiAgLy8gXHU1MjA3XHU2MzYyIHRhYiBcdTY1RjZcdTU0MENcdTZCNjUgSlNPTiBcdTUxODVcdTVCQjlcbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAodGFiID09PSAnanNvbicgJiYgc2V0dGluZ3MpIHtcbiAgICAgIHNldEpzb25FZGl0KEpTT04uc3RyaW5naWZ5KHNldHRpbmdzLCBudWxsLCAyKSlcbiAgICB9XG4gIH0sIFt0YWIsIHNldHRpbmdzXSlcblxuICBjb25zdCBoYW5kbGVTYXZlSnNvbiA9IGFzeW5jICgpID0+IHtcbiAgICBzZXRTYXZpbmcodHJ1ZSlcbiAgICBzZXRFcnJvcihudWxsKVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb25FZGl0KSBhcyBDbGF1ZGVTZXR0aW5nc1xuICAgICAgYXdhaXQgd3JpdGVTZXR0aW5ncyhwYXJzZWQpXG4gICAgICBzZXRTZXR0aW5ncyhwYXJzZWQpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgc2V0RXJyb3IoZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpKVxuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRTYXZpbmcoZmFsc2UpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgYWRkUnVsZSA9IGFzeW5jICh0eXBlOiAnYWxsb3cnIHwgJ3NvZnREZW55JywgdmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGlmICghdmFsdWUudHJpbSgpIHx8ICFzZXR0aW5ncykgcmV0dXJuXG4gICAgc2V0U2F2aW5nKHRydWUpXG4gICAgc2V0RXJyb3IobnVsbClcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXV0b01vZGUgPSBzZXR0aW5ncy5hdXRvTW9kZSA/PyB7IGFsbG93OiBbXSwgc29mdERlbnk6IFtdIH1cbiAgICAgIGNvbnN0IGtleSA9IHR5cGUgPT09ICdhbGxvdycgPyAnYWxsb3cnIDogJ3NvZnREZW55J1xuICAgICAgY29uc3QgbGlzdCA9IFsuLi5hdXRvTW9kZVtrZXldXVxuICAgICAgaWYgKCFsaXN0LmluY2x1ZGVzKHZhbHVlLnRyaW0oKSkpIHtcbiAgICAgICAgbGlzdC5wdXNoKHZhbHVlLnRyaW0oKSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IG5ld1NldHRpbmdzID0geyAuLi5zZXR0aW5ncywgYXV0b01vZGU6IHsgLi4uYXV0b01vZGUsIFtrZXldOiBsaXN0IH0gfVxuICAgICAgYXdhaXQgd3JpdGVTZXR0aW5ncyhuZXdTZXR0aW5ncylcbiAgICAgIHNldFNldHRpbmdzKG5ld1NldHRpbmdzKVxuICAgICAgaWYgKHR5cGUgPT09ICdhbGxvdycpIHsgc2V0TmV3QWxsb3coJycpOyBzZXRTaG93QWRkQWxsb3coZmFsc2UpIH1cbiAgICAgIGVsc2UgeyBzZXROZXdEZW55KCcnKTsgc2V0U2hvd0FkZERlbnkoZmFsc2UpIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBzZXRFcnJvcihlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldFNhdmluZyhmYWxzZSlcbiAgICB9XG4gIH1cblxuICBjb25zdCByZW1vdmVSdWxlID0gYXN5bmMgKHR5cGU6ICdhbGxvdycgfCAnc29mdERlbnknLCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgaWYgKCFzZXR0aW5ncykgcmV0dXJuXG4gICAgc2V0U2F2aW5nKHRydWUpXG4gICAgc2V0RXJyb3IobnVsbClcbiAgICB0cnkge1xuICAgICAgY29uc3QgYXV0b01vZGUgPSBzZXR0aW5ncy5hdXRvTW9kZSA/PyB7IGFsbG93OiBbXSwgc29mdERlbnk6IFtdIH1cbiAgICAgIGNvbnN0IGtleSA9IHR5cGUgPT09ICdhbGxvdycgPyAnYWxsb3cnIDogJ3NvZnREZW55J1xuICAgICAgY29uc3QgbGlzdCA9IFsuLi5hdXRvTW9kZVtrZXldXVxuICAgICAgbGlzdC5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICBjb25zdCBuZXdTZXR0aW5ncyA9IHsgLi4uc2V0dGluZ3MsIGF1dG9Nb2RlOiB7IC4uLmF1dG9Nb2RlLCBba2V5XTogbGlzdCB9IH1cbiAgICAgIGF3YWl0IHdyaXRlU2V0dGluZ3MobmV3U2V0dGluZ3MpXG4gICAgICBzZXRTZXR0aW5ncyhuZXdTZXR0aW5ncylcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBzZXRFcnJvcihlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldFNhdmluZyhmYWxzZSlcbiAgICB9XG4gIH1cblxuICBpZiAobG9hZGluZykge1xuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImNsYXVkZS1jb2RlLXBhbmVsXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktaGludFwiPlx1NTJBMFx1OEY3RFx1NEUyRC4uLjwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG5cbiAgY29uc3QgYWxsb3dSdWxlcyA9IHNldHRpbmdzPy5hdXRvTW9kZT8uYWxsb3cgPz8gW11cbiAgY29uc3QgZGVueVJ1bGVzID0gc2V0dGluZ3M/LmF1dG9Nb2RlPy5zb2Z0RGVueSA/PyBbXVxuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJjbGF1ZGUtY29kZS1wYW5lbFwiPlxuICAgICAgPHN0eWxlPntzdHlsZXN9PC9zdHlsZT5cblxuICAgICAgPGgyPkNsYXVkZSBDb2RlPC9oMj5cbiAgICAgIDxwIGNsYXNzTmFtZT1cInN1YnRpdGxlXCI+XHU3QkExXHU3NDA2IH4vLmNsYXVkZS9zZXR0aW5ncy5qc29uIFx1OTE0RFx1N0Y2RTwvcD5cblxuICAgICAge3NldHRpbmdzUGF0aCAmJiAoXG4gICAgICAgIDxwIGNsYXNzTmFtZT1cInBhdGgtaW5mb1wiPlxuICAgICAgICAgIFx1OERFRlx1NUY4NDogPGNvZGU+e3NldHRpbmdzUGF0aH08L2NvZGU+XG4gICAgICAgIDwvcD5cbiAgICAgICl9XG5cbiAgICAgIHtlcnJvciAmJiAoXG4gICAgICAgIDxkaXYgc3R5bGU9e3sgcGFkZGluZzogJzhweCAxMnB4JywgbWFyZ2luQm90dG9tOiAxMiwgYm9yZGVyUmFkaXVzOiA2LCBiYWNrZ3JvdW5kOiAncmdiYSgyMzksNjgsNjgsMC4xKScsIGNvbG9yOiAnI2VmNDQ0NCcsIGZvbnRTaXplOiAxMiB9fT5cbiAgICAgICAgICB7ZXJyb3J9XG4gICAgICAgIDwvZGl2PlxuICAgICAgKX1cblxuICAgICAgey8qIFRhYiBcdTUyMDdcdTYzNjIgKi99XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cInRhYi1iYXJcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9e2B0YWIke3RhYiA9PT0gJ3J1bGVzJyA/ICcgYWN0aXZlJyA6ICcnfWB9IG9uQ2xpY2s9eygpID0+IHNldFRhYigncnVsZXMnKX0+XG4gICAgICAgICAgXHU4OUM0XHU1MjE5XHU1MjE3XHU4ODY4XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YHRhYiR7dGFiID09PSAnanNvbicgPyAnIGFjdGl2ZScgOiAnJ31gfSBvbkNsaWNrPXsoKSA9PiBzZXRUYWIoJ2pzb24nKX0+XG4gICAgICAgICAgXHU5QUQ4XHU3RUE3XHU3RjE2XHU4RjkxXG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIHt0YWIgPT09ICdydWxlcycgPyAoXG4gICAgICAgIDw+XG4gICAgICAgICAgey8qIEFsbG93IFx1ODlDNFx1NTIxOSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgPHNwYW4+XHU1MTQxXHU4QkI4XHU4OUM0XHU1MjE5XHVGRjA4QWxsb3dcdUZGMDk8L3NwYW4+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1zbVwiIG9uQ2xpY2s9eygpID0+IHNldFNob3dBZGRBbGxvdyghc2hvd0FkZEFsbG93KX0+XG4gICAgICAgICAgICAgICAge3Nob3dBZGRBbGxvdyA/ICdcdTUzRDZcdTZEODgnIDogJysgXHU2REZCXHU1MkEwJ31cbiAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1ib2R5XCI+XG4gICAgICAgICAgICAgIHtzaG93QWRkQWxsb3cgJiYgKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWRkLWFyZWFcIj5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlPXtuZXdBbGxvd31cbiAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXROZXdBbGxvdyhlLnRhcmdldC52YWx1ZSl9XG4gICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiXHU4RjkzXHU1MTY1XHU4OUM0XHU1MjE5XHU1NDBEXHU3OUYwXCJcbiAgICAgICAgICAgICAgICAgICAgb25LZXlEb3duPXsoZSkgPT4gZS5rZXkgPT09ICdFbnRlcicgJiYgYWRkUnVsZSgnYWxsb3cnLCBuZXdBbGxvdyl9XG4gICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG5cIiBvbkNsaWNrPXsoKSA9PiBhZGRSdWxlKCdhbGxvdycsIG5ld0FsbG93KX0gZGlzYWJsZWQ9e3NhdmluZyB8fCAhbmV3QWxsb3cudHJpbSgpfT5cbiAgICAgICAgICAgICAgICAgICAgXHU2REZCXHU1MkEwXG4gICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAge2FsbG93UnVsZXMubGVuZ3RoID09PSAwID8gKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktaGludFwiPlx1NjY4Mlx1NjVFMFx1ODFFQVx1NUI5QVx1NEU0OVx1NTE0MVx1OEJCOFx1ODlDNFx1NTIxOTwvZGl2PlxuICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgIGFsbG93UnVsZXMubWFwKChydWxlOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gKFxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJydWxlLXJvd1wiIGtleT17aX0+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJ1bGUtbGFiZWxcIj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJydWxlLWRvdCBhbGxvd1wiIC8+XG4gICAgICAgICAgICAgICAgICAgICAge3J1bGV9XG4gICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYnRuLXNtIGJ0bi1kYW5nZXJcIiBvbkNsaWNrPXsoKSA9PiByZW1vdmVSdWxlKCdhbGxvdycsIGkpfSBkaXNhYmxlZD17c2F2aW5nfT5cbiAgICAgICAgICAgICAgICAgICAgICBcdTUyMjBcdTk2NjRcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApKVxuICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICB7LyogU29mdCBEZW55IFx1ODlDNFx1NTIxOSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgPHNwYW4+XHU5NzAwXHU3ODZFXHU4QkE0XHU4OUM0XHU1MjE5XHVGRjA4U29mdCBEZW55XHVGRjA5PC9zcGFuPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0biBidG4tc21cIiBvbkNsaWNrPXsoKSA9PiBzZXRTaG93QWRkRGVueSghc2hvd0FkZERlbnkpfT5cbiAgICAgICAgICAgICAgICB7c2hvd0FkZERlbnkgPyAnXHU1M0Q2XHU2RDg4JyA6ICcrIFx1NkRGQlx1NTJBMCd9XG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb24tYm9keVwiPlxuICAgICAgICAgICAgICB7c2hvd0FkZERlbnkgJiYgKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWRkLWFyZWFcIj5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlPXtuZXdEZW55fVxuICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldE5ld0RlbnkoZS50YXJnZXQudmFsdWUpfVxuICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIlx1OEY5M1x1NTE2NVx1ODlDNFx1NTIxOVx1NTQwRFx1NzlGMFwiXG4gICAgICAgICAgICAgICAgICAgIG9uS2V5RG93bj17KGUpID0+IGUua2V5ID09PSAnRW50ZXInICYmIGFkZFJ1bGUoJ3NvZnREZW55JywgbmV3RGVueSl9XG4gICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG5cIiBvbkNsaWNrPXsoKSA9PiBhZGRSdWxlKCdzb2Z0RGVueScsIG5ld0RlbnkpfSBkaXNhYmxlZD17c2F2aW5nIHx8ICFuZXdEZW55LnRyaW0oKX0+XG4gICAgICAgICAgICAgICAgICAgIFx1NkRGQlx1NTJBMFxuICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgIHtkZW55UnVsZXMubGVuZ3RoID09PSAwID8gKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZW1wdHktaGludFwiPlx1NjY4Mlx1NjVFMFx1ODFFQVx1NUI5QVx1NEU0OVx1OTcwMFx1Nzg2RVx1OEJBNFx1ODlDNFx1NTIxOTwvZGl2PlxuICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgIGRlbnlSdWxlcy5tYXAoKHJ1bGU6IHN0cmluZywgaTogbnVtYmVyKSA9PiAoXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJ1bGUtcm93XCIga2V5PXtpfT5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicnVsZS1sYWJlbFwiPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJ1bGUtZG90IGRlbnlcIiAvPlxuICAgICAgICAgICAgICAgICAgICAgIHtydWxlfVxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuIGJ0bi1zbSBidG4tZGFuZ2VyXCIgb25DbGljaz17KCkgPT4gcmVtb3ZlUnVsZSgnc29mdERlbnknLCBpKX0gZGlzYWJsZWQ9e3NhdmluZ30+XG4gICAgICAgICAgICAgICAgICAgICAgXHU1MjIwXHU5NjY0XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSlcbiAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgey8qIFx1OUVEOFx1OEJBNFx1ODlDNFx1NTIxOVx1RkYwOFx1NTNFRlx1NjI5OFx1NTNFMFx1RkYwOSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXZcbiAgICAgICAgICAgICAgY2xhc3NOYW1lPVwic2VjdGlvbi1oZWFkZXJcIlxuICAgICAgICAgICAgICBzdHlsZT17eyBjdXJzb3I6ICdwb2ludGVyJyB9fVxuICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBzZXRTaG93RGVmYXVsdHMoIXNob3dEZWZhdWx0cyl9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIDxzcGFuPlx1OUVEOFx1OEJBNFx1ODlDNFx1NTIxOVx1RkYwOFx1NTE4NVx1N0Y2RVx1RkYwQ1x1NEUwRFx1NTNFRlx1NEZFRVx1NjUzOVx1RkYwOTwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgZm9udFNpemU6IDEwLCBjb2xvcjogJ3ZhcigtLXRleHQtbXV0ZWQsICM2MzYzNjYpJyB9fT5cbiAgICAgICAgICAgICAgICB7c2hvd0RlZmF1bHRzID8gJ1x1NjUzNlx1OEQ3NycgOiAnXHU1QzU1XHU1RjAwJ30gXHUwMEI3IFx1NTE0MVx1OEJCOCB7REVGQVVMVF9SVUxFUy5hbGxvdy5sZW5ndGh9IFx1Njc2MSBcdTAwQjcgXHU5NzAwXHU3ODZFXHU4QkE0IHtERUZBVUxUX1JVTEVTLnNvZnREZW55Lmxlbmd0aH0gXHU2NzYxXG4gICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAge3Nob3dEZWZhdWx0cyAmJiAoXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic2VjdGlvbi1ib2R5XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT17eyBtYXJnaW5Cb3R0b206IDgsIGZvbnRTaXplOiAxMSwgZm9udFdlaWdodDogNTAwLCBjb2xvcjogJ3ZhcigtLXRleHQtc2Vjb25kYXJ5LCAjYjRiNGI4KScgfX0+XG4gICAgICAgICAgICAgICAgICBcdTUxNDFcdThCQjhcdTg5QzRcdTUyMTlcdUZGMDh7REVGQVVMVF9SVUxFUy5hbGxvdy5sZW5ndGh9XHVGRjA5XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAge0RFRkFVTFRfUlVMRVMuYWxsb3cubWFwKChydWxlOiBzdHJpbmcsIGk6IG51bWJlcikgPT4gKFxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJydWxlLXJvd1wiIGtleT17YGRhLSR7aX1gfT5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicnVsZS1sYWJlbFwiPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJ1bGUtZG90IGFsbG93XCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3Bhbj57cnVsZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9e3sgbWFyZ2luVG9wOiAxMiwgbWFyZ2luQm90dG9tOiA4LCBmb250U2l6ZTogMTEsIGZvbnRXZWlnaHQ6IDUwMCwgY29sb3I6ICd2YXIoLS10ZXh0LXNlY29uZGFyeSwgI2I0YjRiOCknIH19PlxuICAgICAgICAgICAgICAgICAgXHU5NzAwXHU3ODZFXHU4QkE0XHU4OUM0XHU1MjE5XHVGRjA4e0RFRkFVTFRfUlVMRVMuc29mdERlbnkubGVuZ3RofVx1RkYwOVxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIHtERUZBVUxUX1JVTEVTLnNvZnREZW55Lm1hcCgocnVsZTogc3RyaW5nLCBpOiBudW1iZXIpID0+IChcbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicnVsZS1yb3dcIiBrZXk9e2BkZC0ke2l9YH0+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInJ1bGUtbGFiZWxcIj5cbiAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJydWxlLWRvdCBkZW55XCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICA8c3Bhbj57cnVsZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICl9XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvPlxuICAgICAgKSA6IChcbiAgICAgICAgLyogSlNPTiBcdTlBRDhcdTdFQTdcdTdGMTZcdThGOTEgKi9cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZWN0aW9uXCI+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZWN0aW9uLWhlYWRlclwiPlxuICAgICAgICAgICAgPHNwYW4+c2V0dGluZ3MuanNvbiBcdTdGMTZcdThGOTE8L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzZWN0aW9uLWJvZHlcIj5cbiAgICAgICAgICAgIDx0ZXh0YXJlYVxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJqc29uLWVkaXRvclwiXG4gICAgICAgICAgICAgIHZhbHVlPXtqc29uRWRpdH1cbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRKc29uRWRpdChlLnRhcmdldC52YWx1ZSl9XG4gICAgICAgICAgICAgIHNwZWxsQ2hlY2s9e2ZhbHNlfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWN0aW9uLXJvd1wiPlxuICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0blwiIG9uQ2xpY2s9e2hhbmRsZVNhdmVKc29ufSBkaXNhYmxlZD17c2F2aW5nfT5cbiAgICAgICAgICAgICAgICB7c2F2aW5nID8gJ1x1NEZERFx1NUI1OFx1NEUyRC4uLicgOiAnXHU0RkREXHU1QjU4J31cbiAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuXCIgb25DbGljaz17KCkgPT4gc2V0dGluZ3MgJiYgc2V0SnNvbkVkaXQoSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3MsIG51bGwsIDIpKX0+XG4gICAgICAgICAgICAgICAgXHU5MUNEXHU3RjZFXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKX1cbiAgICA8L2Rpdj5cbiAgKVxufSJdLAogICJtYXBwaW5ncyI6ICI7QUFPQSxTQUFTLFVBQVUsV0FBVyxtQkFBbUI7QUEwVHpDLFNBc0NBLFVBdENBLEtBZ0JBLFlBaEJBO0FBdlRSLElBQU0sU0FDSCxP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
