// src/Panel.tsx
import { useEffect, useState, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var POLARIS_URL = window.__POLARIS_WEB_URL__ || "http://127.0.0.1:3000";
async function tauriInvoke(cmd, args = {}) {
  const internals = window.__TAURI_INTERNALS__;
  if (internals?.invoke) return internals.invoke(cmd, args);
  throw new Error("\u9700\u5728 Polaris \u684C\u9762\u73AF\u5883\u8FD0\u884C");
}
async function ipcCall(command, args = {}) {
  const path = `/api/${command.replace(/_/g, "-")}`;
  const res = await fetch(`${POLARIS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}
async function listTasksApi() {
  try {
    return await ipcCall("scheduler_list_tasks", {});
  } catch (_) {
    return tauriInvoke("scheduler_list_tasks", {});
  }
}
async function createTaskApi(params) {
  try {
    await ipcCall("scheduler_create_task", { params });
  } catch (_) {
    await tauriInvoke("scheduler_create_task", { params });
  }
}
async function updateTaskApi(task) {
  try {
    await ipcCall("scheduler_update_task", { task });
  } catch (_) {
    await tauriInvoke("scheduler_update_task", { task });
  }
}
async function deleteTaskApi(id) {
  try {
    await ipcCall("scheduler_delete_task", { id });
  } catch (_) {
    await tauriInvoke("scheduler_delete_task", { id });
  }
}
async function toggleTaskApi(id, enabled) {
  try {
    await ipcCall("scheduler_toggle_task", { id, enabled });
  } catch (_) {
    await tauriInvoke("scheduler_toggle_task", { id, enabled });
  }
}
async function getStatusApi() {
  try {
    return await ipcCall("scheduler_get_status", {});
  } catch (_) {
    try {
      return await tauriInvoke("scheduler_get_status", {});
    } catch (_2) {
      return null;
    }
  }
}
async function executeTask(task) {
  await fetch(`${POLARIS_URL}/api/chat/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: task.prompt,
      workDir: task.workDir || void 0,
      engineId: task.engineId || void 0,
      contextId: `scheduler-${task.id}`,
      enableMcpTools: true
    })
  });
}
function formatTime(ts) {
  if (!ts) return "-";
  return new Date(ts * 1e3).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function triggerTypeLabel(t) {
  return { once: "\u4E00\u6B21\u6027", cron: "Cron", interval: "\u95F4\u9694", after_completion: "\u5B8C\u6210\u540E" }[t] || t;
}
function SchedulerPanel({ pluginId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [daemonStatus, setDaemonStatus] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formName, setFormName] = useState("");
  const [formTriggerType, setFormTriggerType] = useState("interval");
  const [formTriggerValue, setFormTriggerValue] = useState("1h");
  const [formEngineId, setFormEngineId] = useState("claude-code");
  const [formPrompt, setFormPrompt] = useState("");
  const [formWorkDir, setFormWorkDir] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listTasksApi();
      setTasks(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "\u52A0\u8F7D\u5931\u8D25");
    }
    setLoading(false);
  }, []);
  const loadStatus = useCallback(async () => {
    const s = await getStatusApi();
    if (s) setDaemonStatus(s);
  }, []);
  useEffect(() => {
    loadTasks();
    loadStatus();
    const interval = setInterval(loadStatus, 1e4);
    return () => clearInterval(interval);
  }, [loadTasks, loadStatus]);
  const openCreateEditor = () => {
    setEditingTask(null);
    setFormName("");
    setFormTriggerType("interval");
    setFormTriggerValue("1h");
    setFormEngineId("claude-code");
    setFormPrompt("");
    setFormWorkDir("");
    setFormDescription("");
    setShowEditor(true);
  };
  const openEditEditor = (task) => {
    setEditingTask(task);
    setFormName(task.name);
    setFormTriggerType(task.triggerType);
    setFormTriggerValue(task.triggerValue);
    setFormEngineId(task.engineId);
    setFormPrompt(task.prompt);
    setFormWorkDir(task.workDir || "");
    setFormDescription(task.description || "");
    setShowEditor(true);
  };
  const handleSave = async () => {
    if (!formName.trim()) return;
    setError(null);
    try {
      const body = {
        id: editingTask?.id,
        name: formName.trim(),
        enabled: true,
        triggerType: formTriggerType,
        triggerValue: formTriggerValue.trim(),
        engineId: formEngineId.trim(),
        prompt: formPrompt.trim(),
        workDir: formWorkDir.trim() || null,
        description: formDescription.trim() || null,
        mode: editingTask?.mode || "simple",
        category: editingTask?.category || "development",
        currentRuns: editingTask?.currentRuns || 0,
        retryCount: editingTask?.retryCount || 0,
        notifyOnComplete: editingTask?.notifyOnComplete ?? true
      };
      if (editingTask) {
        await updateTaskApi({ ...editingTask, ...body });
      } else {
        await createTaskApi(body);
      }
      setShowEditor(false);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "\u4FDD\u5B58\u5931\u8D25");
    }
  };
  const handleDelete = async (id) => {
    try {
      await deleteTaskApi(id);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "\u5220\u9664\u5931\u8D25");
    }
  };
  const handleToggle = async (id, enabled) => {
    try {
      await toggleTaskApi(id, enabled);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "\u5207\u6362\u5931\u8D25");
    }
  };
  const handleRun = async (task) => {
    try {
      await executeTask(task);
      loadTasks();
    } catch (e) {
      setError("\u6267\u884C\u5931\u8D25");
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: {
    padding: "16px",
    height: "100%",
    overflow: "auto",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    color: "#e1e4e8",
    background: "#1c2128"
  }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { style: { margin: 0, fontSize: "18px", fontWeight: 600 }, children: "\u5B9A\u65F6\u4EFB\u52A1" }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: "12px", color: "#8b949e", marginTop: "4px" }, children: [
          "\u8C03\u5EA6\u5668: ",
          daemonStatus ? daemonStatus.isRunning ? "\u{1F7E2} \u8FD0\u884C\u4E2D" : "\u{1F534} \u5DF2\u505C\u6B62" : "\u23F3 \u52A0\u8F7D\u4E2D",
          " \xB7 \u5171 ",
          tasks.length,
          " \u4EFB\u52A1"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
        /* @__PURE__ */ jsx("button", { onClick: loadTasks, style: btnStyle, title: "\u5237\u65B0", children: "\u{1F504}" }),
        /* @__PURE__ */ jsx("button", { onClick: openCreateEditor, style: { ...btnStyle, background: "#238636", color: "#fff" }, children: "+ \u65B0\u5EFA" })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { style: { padding: "8px 12px", background: "#3d1f1f", border: "1px solid #f85149", borderRadius: "6px", marginBottom: "12px", fontSize: "13px" }, children: [
      error,
      /* @__PURE__ */ jsx("button", { onClick: () => setError(null), style: { float: "right", background: "none", border: "none", color: "#f85149", cursor: "pointer" }, children: "\u2715" })
    ] }),
    showEditor && /* @__PURE__ */ jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1e3 }, children: /* @__PURE__ */ jsxs("div", { style: { background: "#1c2128", borderRadius: "8px", padding: "24px", width: "520px", maxHeight: "80vh", overflow: "auto", border: "1px solid #373e47" }, children: [
      /* @__PURE__ */ jsx("h3", { style: { margin: "0 0 16px", fontSize: "16px" }, children: editingTask ? "\u7F16\u8F91\u4EFB\u52A1" : "\u65B0\u5EFA\u4EFB\u52A1" }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u4EFB\u52A1\u540D\u79F0 *" }),
        /* @__PURE__ */ jsx("input", { value: formName, onChange: (e) => setFormName(e.target.value), style: inputStyle, placeholder: "\u8F93\u5165\u4EFB\u52A1\u540D\u79F0" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u89E6\u53D1\u7C7B\u578B" }),
        /* @__PURE__ */ jsxs("select", { value: formTriggerType, onChange: (e) => setFormTriggerType(e.target.value), style: inputStyle, children: [
          /* @__PURE__ */ jsx("option", { value: "interval", children: "\u95F4\u9694 (interval)" }),
          /* @__PURE__ */ jsx("option", { value: "cron", children: "Cron \u8868\u8FBE\u5F0F" }),
          /* @__PURE__ */ jsx("option", { value: "once", children: "\u4E00\u6B21\u6027" }),
          /* @__PURE__ */ jsx("option", { value: "after_completion", children: "\u5B8C\u6210\u540E\u95F4\u9694" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u89E6\u53D1\u503C *" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: formTriggerValue,
            onChange: (e) => setFormTriggerValue(e.target.value),
            style: inputStyle,
            placeholder: formTriggerType === "interval" ? "1h, 30m, 1d" : formTriggerType === "cron" ? "0 9 * * 1-5" : "2024-12-31T23:59:00Z"
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: "11px", color: "#8b949e", marginTop: "4px" }, children: [
          formTriggerType === "interval" ? "\u652F\u6301: s(\u79D2), m(\u5206), h(\u65F6), d(\u5929)" : "",
          formTriggerType === "cron" ? "5\u5B57\u6BB5 cron \u8868\u8FBE\u5F0F: \u5206 \u65F6 \u65E5 \u6708 \u5468" : "",
          formTriggerType === "once" ? "ISO 8601 \u65F6\u95F4\u6233" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u5F15\u64CE ID *" }),
        /* @__PURE__ */ jsx("input", { value: formEngineId, onChange: (e) => setFormEngineId(e.target.value), style: inputStyle, placeholder: "claude-code" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u63D0\u793A\u8BCD *" }),
        /* @__PURE__ */ jsx("textarea", { value: formPrompt, onChange: (e) => setFormPrompt(e.target.value), style: { ...inputStyle, minHeight: "80px", resize: "vertical" }, placeholder: "AI \u6267\u884C\u4EFB\u52A1\u65F6\u7684\u63D0\u793A\u8BCD\u5185\u5BB9" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u5DE5\u4F5C\u76EE\u5F55" }),
        /* @__PURE__ */ jsx("input", { value: formWorkDir, onChange: (e) => setFormWorkDir(e.target.value), style: inputStyle, placeholder: "\u53EF\u9009\uFF0C\u9ED8\u8BA4\u5F53\u524D\u5DE5\u4F5C\u533A" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
        /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u63CF\u8FF0" }),
        /* @__PURE__ */ jsx("input", { value: formDescription, onChange: (e) => setFormDescription(e.target.value), style: inputStyle, placeholder: "\u53EF\u9009\uFF0C\u4EFB\u52A1\u63CF\u8FF0" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }, children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setShowEditor(false), style: { ...btnStyle, background: "#373e47" }, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("button", { onClick: handleSave, style: { ...btnStyle, background: "#238636", color: "#fff" }, disabled: !formName.trim(), children: "\u4FDD\u5B58" })
      ] })
    ] }) }),
    loading ? /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "40px", color: "#8b949e" }, children: "\u52A0\u8F7D\u4E2D..." }) : tasks.length === 0 ? /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", padding: "40px", color: "#8b949e" }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "40px", marginBottom: "12px" }, children: "\u23F0" }),
      /* @__PURE__ */ jsx("div", { children: "\u6682\u65E0\u5B9A\u65F6\u4EFB\u52A1" }),
      /* @__PURE__ */ jsx("button", { onClick: openCreateEditor, style: { ...btnStyle, marginTop: "12px", background: "#238636", color: "#fff" }, children: "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u4EFB\u52A1" })
    ] }) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: tasks.map((task) => /* @__PURE__ */ jsx("div", { style: {
      padding: "12px",
      background: "#22272e",
      border: "1px solid #373e47",
      borderRadius: "6px",
      opacity: task.enabled ? 1 : 0.5
    }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontWeight: 600, fontSize: "15px", marginBottom: "4px" }, children: [
          task.name,
          task.lastRunStatus === "running" && /* @__PURE__ */ jsx("span", { style: { marginLeft: "8px", fontSize: "11px", color: "#58a6ff" }, children: "\u26A1 \u6267\u884C\u4E2D" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: "12px", color: "#8b949e", display: "flex", gap: "12px", flexWrap: "wrap" }, children: [
          /* @__PURE__ */ jsxs("span", { children: [
            triggerTypeLabel(task.triggerType),
            ": ",
            task.triggerValue
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u5F15\u64CE: ",
            task.engineId
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u4E0A\u6B21: ",
            formatTime(task.lastRunAt)
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u4E0B\u6B21: ",
            formatTime(task.nextRunAt)
          ] }),
          task.lastRunStatus && task.lastRunStatus !== "running" && /* @__PURE__ */ jsx("span", { style: { color: task.lastRunStatus === "success" ? "#3fb950" : "#f85149" }, children: task.lastRunStatus === "success" ? "\u2713 \u6210\u529F" : "\u2717 \u5931\u8D25" })
        ] }),
        task.description && /* @__PURE__ */ jsx("div", { style: { fontSize: "12px", color: "#6e7681", marginTop: "4px" }, children: task.description })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "4px", flexShrink: 0, marginLeft: "12px" }, children: [
        /* @__PURE__ */ jsx("button", { onClick: () => handleRun(task), style: iconBtnStyle, title: "\u624B\u52A8\u6267\u884C", disabled: task.lastRunStatus === "running", children: "\u25B6" }),
        /* @__PURE__ */ jsx("button", { onClick: () => handleToggle(task.id, !task.enabled), style: iconBtnStyle, title: task.enabled ? "\u7981\u7528" : "\u542F\u7528", children: task.enabled ? "\u23F8" : "\u25B6" }),
        /* @__PURE__ */ jsx("button", { onClick: () => openEditEditor(task), style: iconBtnStyle, title: "\u7F16\u8F91", children: "\u270F" }),
        /* @__PURE__ */ jsx("button", { onClick: () => handleDelete(task.id), style: iconBtnStyle, title: "\u5220\u9664", children: "\u{1F5D1}" })
      ] })
    ] }) }, task.id)) })
  ] });
}
var btnStyle = {
  padding: "6px 14px",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 500,
  background: "#373e47",
  color: "#e1e4e8"
};
var iconBtnStyle = {
  width: "30px",
  height: "30px",
  padding: 0,
  border: "1px solid #373e47",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "14px",
  background: "#2d333b",
  color: "#e1e4e8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};
var fieldStyle = { marginBottom: "12px" };
var labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  marginBottom: "4px",
  color: "#8b949e"
};
var inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #373e47",
  borderRadius: "6px",
  fontSize: "13px",
  background: "#2d333b",
  color: "#e1e4e8",
  boxSizing: "border-box",
  outline: "none"
};
export {
  SchedulerPanel as default
};
