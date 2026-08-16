// src/Panel.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
async function tauriInvoke(cmd, args = {}) {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals?.invoke) {
    throw new Error("\u9700\u5728 Polaris \u684C\u9762\u73AF\u5883\u8FD0\u884C");
  }
  return internals.invoke(cmd, args);
}
var STATUS_META = {
  added: { label: "A", color: "#3fb950" },
  modified: { label: "M", color: "#d29922" },
  deleted: { label: "D", color: "#f85149" },
  renamed: { label: "R", color: "#58a6ff" },
  untracked: { label: "?", color: "#8b949e" }
};
function renderUnifiedDiff(oldContent, newContent) {
  const oldLines = (oldContent ?? "").split("\n");
  const newLines = (newContent ?? "").split("\n");
  const max = Math.max(oldLines.length, newLines.length);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    const changed = oldLine !== newLine;
    if (oldLine === void 0) {
      rows.push(/* @__PURE__ */ jsxs("div", { className: "dline added", children: [
        /* @__PURE__ */ jsx("span", { className: "op", children: "+" }),
        newLine
      ] }, i));
    } else if (newLine === void 0) {
      rows.push(/* @__PURE__ */ jsxs("div", { className: "dline removed", children: [
        /* @__PURE__ */ jsx("span", { className: "op", children: "-" }),
        oldLine
      ] }, i));
    } else if (changed) {
      rows.push(/* @__PURE__ */ jsxs("div", { className: "dline modified", children: [
        /* @__PURE__ */ jsx("span", { className: "op", children: "-" }),
        oldLine
      ] }, i));
      rows.push(/* @__PURE__ */ jsxs("div", { className: "dline modified", children: [
        /* @__PURE__ */ jsx("span", { className: "op", children: "+" }),
        newLine
      ] }, i));
    } else {
      rows.push(/* @__PURE__ */ jsxs("div", { className: "dline context", children: [
        /* @__PURE__ */ jsx("span", { className: "op", children: " " }),
        oldLine
      ] }, i));
    }
  }
  return /* @__PURE__ */ jsx("div", { className: "unified-diff", children: rows });
}
function GitPanel({ onSendToChat }) {
  const [workspacePath, setWorkspacePath] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [stagedMode, setStagedMode] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commits, setCommits] = useState([]);
  const refresh = useCallback(async (path) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const s = await tauriInvoke("git_get_status", { workspacePath: path });
      setStatus(s);
      setWorkspacePath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initWorkspace = async () => {
      const hostWs = window.__POLARIS_HOST_WORKSPACE__;
      if (hostWs) {
        setWorkspacePath(hostWs);
        void refresh(hostWs);
        return;
      }
      try {
        const cwd = await tauriInvoke("get_current_dir");
        setWorkspacePath(cwd);
        void refresh(cwd);
      } catch {
      }
    };
    void initWorkspace();
  }, [refresh]);
  const loadDiff = useCallback(async (filePath) => {
    setSelectedFile(filePath);
    try {
      const diff = await tauriInvoke(
        stagedMode ? "git_get_index_file_diff" : "git_get_worktree_file_diff",
        { workspacePath, filePath }
      );
      setSelectedDiff(diff);
    } catch (e) {
      setSelectedDiff(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workspacePath, stagedMode]);
  const loadLog = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const result = await tauriInvoke("git_get_log", { workspacePath });
      setCommits(result.map((c) => ({
        hash: String(c.hash || c.sha || "").slice(0, 7),
        author: String(c.author || ""),
        date: String(c.date || c.timestamp || ""),
        message: String(c.message || c.subject || "")
      })));
    } catch {
    }
  }, [workspacePath]);
  const stageFile = useCallback(async (path) => {
    await tauriInvoke("git_stage_file", { workspacePath, filePath: path });
    void refresh(workspacePath);
  }, [workspacePath, refresh]);
  const commit = useCallback(async () => {
    if (!commitMsg.trim() || !workspacePath) return;
    setCommitting(true);
    try {
      const result = await tauriInvoke("git_commit_changes", {
        workspacePath,
        message: commitMsg.trim(),
        // git_commit_changes 参数：可能要求 stagedOnly / options，尽力适配
        options: {}
      });
      setCommitMsg("");
      setError(result.error ?? null);
      void refresh(workspacePath);
      void loadLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [commitMsg, workspacePath, refresh, loadLog]);
  useEffect(() => {
    void loadLog();
  }, [loadLog]);
  const allChanges = useMemo(() => {
    if (!status) return [];
    return [
      ...status.staged.map((f) => ({ ...f, _staged: true })),
      ...status.unstaged.map((f) => ({ ...f, _staged: false })),
      ...status.untracked.map((p) => ({ path: p, status: "untracked", _staged: false }))
    ];
  }, [status]);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", fontSize: 12 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: 8, borderBottom: "1px solid #3F3F46", display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: workspacePath,
          onChange: (e) => setWorkspacePath(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && refresh(workspacePath),
          placeholder: "Git \u4ED3\u5E93\u8DEF\u5F84\uFF08\u56DE\u8F66\u52A0\u8F7D\uFF09",
          style: { flex: 1, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#1E1E24", color: "#F0F0F0" }
        }
      ),
      /* @__PURE__ */ jsx("button", { onClick: () => refresh(workspacePath), style: { padding: "4px 10px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#CCC" }, children: "\u52A0\u8F7D" })
    ] }),
    status?.exists && /* @__PURE__ */ jsxs("div", { style: { padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #28282E", background: "#1A1A20" }, children: [
      /* @__PURE__ */ jsx("span", { style: { color: "#3fb950", fontWeight: 600 }, children: status.branch }),
      /* @__PURE__ */ jsx("span", { style: { color: "#8B949E", fontSize: 11 }, children: status.shortCommit }),
      status.ahead > 0 && /* @__PURE__ */ jsxs("span", { style: { color: "#3fb950", fontSize: 11 }, children: [
        "\u2191",
        status.ahead
      ] }),
      status.behind > 0 && /* @__PURE__ */ jsxs("span", { style: { color: "#d29922", fontSize: 11 }, children: [
        "\u2193",
        status.behind
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { marginLeft: "auto", color: "#8B949E", fontSize: 11 }, children: [
        status.staged.length + status.unstaged.length + status.untracked.length,
        " \u53D8\u66F4"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, padding: "6px 12px", borderBottom: "1px solid #28282E" }, children: ["\u5DE5\u4F5C\u533A", "\u6682\u5B58\u533A"].map((label, i) => /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => {
          setStagedMode(i === 1);
          setSelectedFile(null);
          setSelectedDiff(null);
        },
        style: {
          padding: "2px 10px",
          borderRadius: 4,
          fontSize: 11,
          border: `1px solid ${i === (stagedMode ? 1 : 0) ? "#3B82F6" : "#3F3F46"}`,
          background: i === (stagedMode ? 1 : 0) ? "#3B82F620" : "transparent",
          color: i === (stagedMode ? 1 : 0) ? "#3B82F6" : "#999",
          cursor: "pointer"
        },
        children: label
      },
      label
    )) }),
    error && /* @__PURE__ */ jsx("div", { style: { padding: 8, color: "#f85149" }, children: error }),
    loading && /* @__PURE__ */ jsx("div", { style: { padding: 8, color: "#8B949E" }, children: "\u52A0\u8F7D\u4E2D\u2026" }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", flex: 1, minHeight: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { width: "42%", overflowY: "auto", borderRight: "1px solid #28282E" }, children: [
        allChanges.map((f) => {
          const meta = STATUS_META[f.status] ?? STATUS_META.untracked;
          const selected = selectedFile === f.path;
          return /* @__PURE__ */ jsxs(
            "div",
            {
              onClick: () => loadDiff(f.path),
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                cursor: "pointer",
                background: selected ? "#1F6FEB22" : "transparent"
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.background = selected ? "#1F6FEB22" : "#28282E22";
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.background = selected ? "#1F6FEB22" : "transparent";
              },
              children: [
                /* @__PURE__ */ jsx("span", { style: { width: 16, textAlign: "center", color: meta.color, fontWeight: 700 }, children: meta.label }),
                /* @__PURE__ */ jsx("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#DDD" }, children: f.path.split("/").pop() }),
                /* @__PURE__ */ jsx("span", { style: { color: "#8B949E", fontSize: 10, cursor: "pointer" }, title: f.path, children: f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : "" }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      void stageFile(f.path);
                    },
                    title: f._staged ? "\u5DF2\u6682\u5B58" : "\u6682\u5B58",
                    style: { background: "transparent", border: "none", color: f._staged ? "#3fb950" : "#8B949E", cursor: "pointer", fontSize: 11 },
                    children: f._staged ? "\u2713" : "+"
                  }
                )
              ]
            },
            `${f._staged ? "s" : "u"}-${f.path}`
          );
        }),
        allChanges.length === 0 && !loading && /* @__PURE__ */ jsx("div", { style: { padding: 20, textAlign: "center", color: "#8B949E" }, children: "\u5DE5\u4F5C\u533A\u5E72\u51C0 \u2728" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "auto", padding: 8, fontFamily: "monospace", fontSize: 11 }, children: selectedDiff ? renderUnifiedDiff(selectedDiff.old_content, selectedDiff.new_content) : /* @__PURE__ */ jsx("div", { style: { color: "#8B949E", textAlign: "center", paddingTop: 30 }, children: selectedFile ? "\u52A0\u8F7D diff\u2026" : "\u9009\u62E9\u5DE6\u4FA7\u6587\u4EF6\u67E5\u770B diff" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #28282E", padding: 8, display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          value: commitMsg,
          onChange: (e) => setCommitMsg(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && !e.shiftKey && commit(),
          placeholder: "\u63D0\u4EA4\u4FE1\u606F\uFF08Conventional Commits\uFF09",
          style: { flex: 1, padding: "5px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#1E1E24", color: "#F0F0F0" }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => commit(),
          disabled: committing || !commitMsg.trim(),
          style: {
            padding: "5px 14px",
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
            background: committing || !commitMsg.trim() ? "#3B82F640" : "#3B82F6",
            color: "#fff"
          },
          children: "\u63D0\u4EA4"
        }
      ),
      onSendToChat && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => onSendToChat(`\u8BF7\u5E2E\u6211\u751F\u6210\u4E00\u6761 Conventional Commits \u63D0\u4EA4\u4FE1\u606F\u3002\u5F53\u524D\u5DE5\u4F5C\u533A\uFF1A${workspacePath}

\u5F53\u524D\u6682\u5B58\u53D8\u66F4\uFF1A
${(status?.staged ?? []).map((f) => `- ${f.status}: ${f.path}`).join("\n")}`),
          title: "\u8BA9 AI \u751F\u6210\u63D0\u4EA4\u4FE1\u606F",
          style: { padding: "5px 10px", borderRadius: 4, border: "1px solid #3F3F46", background: "#2D2D33", color: "#A78BFA", cursor: "pointer" },
          children: "AI \u2728"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { borderTop: "1px solid #28282E", padding: "8px 12px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { color: "#8B949E", fontSize: 11, marginBottom: 4 }, children: [
        "\u63D0\u4EA4\u5386\u53F2\uFF08\u6700\u8FD1 ",
        commits.length,
        "\uFF09"
      ] }),
      commits.map((c) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, padding: "2px 0", fontSize: 11 }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "#58a6ff", fontFamily: "monospace" }, children: c.hash }),
        /* @__PURE__ */ jsx("span", { style: { color: "#DDD", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: c.message }),
        /* @__PURE__ */ jsx("span", { style: { color: "#8B949E" }, children: c.author })
      ] }, c.hash))
    ] })
  ] });
}
export {
  GitPanel as default
};
