// src/Panel.tsx
import { useState, useCallback, useRef, useEffect } from "react";

// src/ai.ts
var AIError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "AIError";
  }
};
async function chatCompleteStream(config, messages, onChunk, options = {}) {
  const { temperature = 0.7, maxTokens = 4096, timeout = 6e4 } = options;
  const body = {
    model: config.model,
    messages: buildMessages(config, messages),
    temperature,
    max_tokens: maxTokens,
    stream: true
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw parseError(res.status, await res.text().catch(() => ""));
    }
    const reader = res.body?.getReader();
    if (!reader) throw new AIError("\u54CD\u5E94\u4F53\u4E0D\u53EF\u8BFB", "network");
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const content = data.choices?.[0]?.delta?.content ?? "";
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch {
          }
        }
      }
    }
    return fullText.trim();
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new AIError("\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216 API \u7AEF\u70B9", "timeout");
    }
    throw new AIError(
      e instanceof Error ? e.message : "\u672A\u77E5\u7F51\u7EDC\u9519\u8BEF",
      "network"
    );
  }
}
function buildMessages(config, messages) {
  const result = [];
  if (config.systemPrompt.trim()) {
    result.push({ role: "system", content: config.systemPrompt });
  }
  result.push(...messages);
  return result;
}
function parseError(status, body) {
  let errorMsg = body;
  try {
    const parsed = JSON.parse(body);
    errorMsg = parsed.error?.message ?? parsed.error ?? body;
  } catch {
  }
  switch (status) {
    case 401:
      return new AIError(`\u8BA4\u8BC1\u5931\u8D25\uFF1A${errorMsg}\u3002\u8BF7\u68C0\u67E5 API Key \u662F\u5426\u6B63\u786E`, "auth");
    case 429:
      return new AIError(`\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF1A${errorMsg}`, "rate_limit");
    case 404:
      return new AIError(`\u6A21\u578B\u672A\u627E\u5230\uFF1A${errorMsg}\u3002\u8BF7\u68C0\u67E5 Model \u540D\u79F0\u662F\u5426\u6B63\u786E`, "model");
    default:
      return new AIError(`API \u9519\u8BEF (${status})\uFF1A${errorMsg}`, "unknown");
  }
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var DEFAULT_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  systemPrompt: `\u4F60\u662F\u4E00\u4E2A\u7EC8\u7AEF\u52A9\u624B\uFF0C\u7279\u522B\u64C5\u957F Git \u64CD\u4F5C\u3002

## \u901A\u7528\u89C4\u5219
1. \u7528\u6237\u8BF4\u4EBA\u8BDD\uFF0C\u4F60\u7FFB\u8BD1\u6210 shell \u547D\u4EE4\uFF0C\u7528 \`\`\` \u4EE3\u7801\u5757\u5305\u88F9
2. \u7528\u6237\u7C98\u8D34\u62A5\u9519\uFF0C\u4F60\u89E3\u91CA\u539F\u56E0\u5E76\u7ED9\u51FA\u4FEE\u590D\u547D\u4EE4
3. \u6BCF\u6B21\u56DE\u590D\u540C\u65F6\u7ED9\u51FA\u89E3\u91CA\u548C\u547D\u4EE4
4. \u4E0D\u786E\u5B9A\u65F6\u8BF4\u660E\u4F60\u7684\u5047\u8BBE

## Git \u4E13\u6709\u89C4\u5219
1. \u6D89\u53CA\u7834\u574F\u6027\u64CD\u4F5C\uFF08reset --hard\u3001push --force\uFF09\u65F6\uFF0C\u589E\u52A0 \u26A0\uFE0F \u8B66\u544A
2. \u590D\u6742\u64CD\u4F5C\uFF08rebase\u3001cherry-pick\uFF09\u7ED9\u51FA\u5206\u6B65\u8BF4\u660E
3. \u5148\u89E3\u91CA\u5F53\u524D\u72B6\u6001\uFF0C\u518D\u7ED9\u51FA\u64CD\u4F5C\u547D\u4EE4
4. git \u62A5\u9519\u5206\u6790\u65F6\uFF0C\u540C\u65F6\u7ED9\u51FA\u539F\u56E0\u548C\u4FEE\u590D\u65B9\u6848`
};
var DEFAULT_SYSTEM_PROMPT = DEFAULT_CONFIG.systemPrompt;
var DEMO_MESSAGES = [
  {
    id: "demo-1",
    role: "user",
    content: "\u627E\u51FA\u6240\u6709\u5927\u4E8E 100MB \u7684\u65E5\u5FD7\u6587\u4EF6\uFF0C\u6309\u5927\u5C0F\u6392\u5E8F",
    timestamp: Date.now() - 12e4
  },
  {
    id: "demo-2",
    role: "assistant",
    content: `\`\`\`bash
find . -type f -name "*.log" -size +100M | sort -rh
\`\`\`

\u8FD9\u4E2A\u547D\u4EE4\u4F1A\uFF1A
1. \`find\` \u9012\u5F52\u67E5\u627E\u6240\u6709 \`*.log\` \u6587\u4EF6\uFF0C\u5927\u5C0F\u8D85\u8FC7 100MB
2. \`sort -rh\` \u6309\u4EBA\u7C7B\u53EF\u8BFB\u7684\u5927\u5C0F\u53CD\u5411\u6392\u5E8F\uFF08\u6700\u5927\u7684\u5728\u524D\uFF09

\u5982\u679C\u4F60\u53EA\u60F3\u770B\u524D 10 \u4E2A\uFF0C\u53EF\u4EE5\u52A0\u4E0A \`| head -10\``,
    commands: ['find . -type f -name "*.log" -size +100M | sort -rh'],
    timestamp: Date.now() - 115e3
  },
  {
    id: "demo-3",
    role: "user",
    content: "fatal: refusing to merge unrelated histories",
    timestamp: Date.now() - 6e4
  },
  {
    id: "demo-4",
    role: "assistant",
    content: `## \u9519\u8BEF\u539F\u56E0

\u4E24\u4E2A Git \u4ED3\u5E93\u6CA1\u6709\u5171\u540C\u7684\u7956\u5148\u63D0\u4EA4\uFF0CGit \u9ED8\u8BA4\u62D2\u7EDD\u5408\u5E76\u65E0\u5173\u5386\u53F2\u3002

## \u4FEE\u590D\u65B9\u6848

\u5982\u679C\u4F60\u786E\u5B9A\u8981\u5408\u5E76\uFF0C\u4F7F\u7528 \`--allow-unrelated-histories\` \u6807\u5FD7\uFF1A

\`\`\`bash
git merge --allow-unrelated-histories
\`\`\`

### \u6CE8\u610F\u4E8B\u9879
\u26A0\uFE0F \u8FD9\u53EF\u80FD\u4F1A\u4EA7\u751F\u5927\u91CF\u51B2\u7A81\uFF0C\u5EFA\u8BAE\u5148\u5907\u4EFD\u5F53\u524D\u5206\u652F\uFF1A

\`\`\`bash
git branch backup-before-merge
\`\`\``,
    commands: ["git merge --allow-unrelated-histories", "git branch backup-before-merge"],
    timestamp: Date.now() - 55e3
  },
  {
    id: "demo-5",
    role: "user",
    content: "\u628A\u8FD9\u4E2A commit abc123 \u79FB\u5230 main \u5206\u652F",
    timestamp: Date.now() - 3e4
  },
  {
    id: "demo-6",
    role: "assistant",
    content: `\u4F7F\u7528 \`git cherry-pick\` \u5C06\u6307\u5B9A\u63D0\u4EA4\u5E94\u7528\u5230 \`main\` \u5206\u652F\uFF1A

\`\`\`bash
# 1. \u5207\u6362\u5230 main \u5206\u652F
git checkout main

# 2. \u62C9\u53D6\u6700\u65B0\u4EE3\u7801
git pull origin main

# 3. Cherry-pick \u6307\u5B9A\u63D0\u4EA4
git cherry-pick abc123
\`\`\`

### \u5982\u679C\u9047\u5230\u51B2\u7A81
1. \u624B\u52A8\u89E3\u51B3\u51B2\u7A81\u6587\u4EF6
2. \`git add <\u51B2\u7A81\u6587\u4EF6>\`
3. \`git cherry-pick --continue\`

### \u64A4\u9500 cherry-pick
\`\`\`bash
git cherry-pick --abort
\`\`\``,
    commands: ["git checkout main", "git pull origin main", "git cherry-pick abc123"],
    timestamp: Date.now() - 25e3
  }
];
function loadConfig() {
  try {
    const raw = localStorage.getItem("tern-config");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
  }
  return { ...DEFAULT_CONFIG };
}
function saveConfig(config) {
  try {
    localStorage.setItem("tern-config", JSON.stringify(config));
  } catch {
  }
}
function extractCommands(text) {
  const cmds = [];
  const regex = /```(?:bash|shell|sh)?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const lines = match[1].trim().split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    cmds.push(...lines);
  }
  return cmds;
}
function formatTime(ts) {
  const d = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 6e4) return "\u521A\u521A";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} \u5206\u949F\u524D`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)} \u5C0F\u65F6\u524D`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
var S = {
  container: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#0D0D12",
    color: "#E8E8ED",
    fontSize: 13,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid #2A2A35",
    flexShrink: 0,
    minHeight: 44
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10
  },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: "linear-gradient(135deg, #6C6CFF, #FF6B9D)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600
  },
  headerSub: {
    fontSize: 10,
    color: "#6B6B80",
    marginTop: 1
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: "none",
    background: "#1E1E28",
    color: "#8E8E9E",
    fontSize: 15,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.12s"
  },
  // 对话区
  conversationArea: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
    minHeight: 0
  },
  // 空状态
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "40px 24px",
    textAlign: "center"
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#E8E8ED",
    marginBottom: 8
  },
  emptyDesc: {
    fontSize: 12,
    color: "#6B6B80",
    lineHeight: 1.6,
    maxWidth: 280
  },
  emptyExamples: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 20,
    width: "100%",
    maxWidth: 300
  },
  exampleChip: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #2A2A35",
    background: "#1A1A24",
    color: "#8E8E9E",
    fontSize: 11,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.12s"
  },
  // 对话气泡
  bubbleGroup: {
    padding: "0 14px",
    marginBottom: 4
  },
  bubbleUser: {
    padding: "8px 12px",
    borderRadius: "10px 10px 4px 10px",
    background: "#2A2A40",
    color: "#E8E8ED",
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "90%",
    marginLeft: "auto",
    marginBottom: 2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  bubbleAssistant: {
    padding: "8px 12px",
    borderRadius: "10px 10px 10px 4px",
    background: "#1A1A28",
    color: "#D0D0DC",
    fontSize: 13,
    lineHeight: 1.6,
    maxWidth: "100%",
    marginRight: "auto",
    marginBottom: 2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  bubbleMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 4px",
    marginBottom: 6
  },
  bubbleRole: {
    fontSize: 10,
    color: "#6B6B80",
    fontWeight: 500
  },
  bubbleTime: {
    fontSize: 10,
    color: "#4A4A5A"
  },
  // 命令块
  commandBlock: {
    margin: "6px 0",
    borderRadius: 6,
    border: "1px solid #2A2A40",
    overflow: "hidden"
  },
  commandHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px",
    background: "#1E1E2C",
    borderBottom: "1px solid #2A2A40",
    fontSize: 10,
    color: "#6B6B80"
  },
  commandCode: {
    padding: "8px 10px",
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 12,
    color: "#A8E6CF",
    background: "#12121E",
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre"
  },
  commandActions: {
    display: "flex",
    gap: 4,
    borderTop: "1px solid #2A2A40",
    padding: "4px 8px",
    background: "#1E1E2C"
  },
  cmdBtn: {
    padding: "3px 8px",
    borderRadius: 4,
    border: "none",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    transition: "all 0.12s"
  },
  // 输入区
  inputArea: {
    borderTop: "1px solid #2A2A35",
    padding: "8px 14px",
    flexShrink: 0,
    background: "#0D0D12"
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end"
  },
  inputBox: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2A2A35",
    background: "#1A1A24",
    color: "#E8E8ED",
    fontSize: 12,
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    lineHeight: 1.5
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #6C6CFF, #FF6B9D)",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  },
  sendBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed"
  },
  statusBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 14px",
    borderTop: "1px solid #2A2A35",
    background: "#0A0A0F",
    flexShrink: 0
  },
  statusLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 10,
    color: "#4A4A5A"
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4A4A5A"
  },
  // 快捷命令
  quickActions: {
    display: "flex",
    gap: 6,
    padding: "0 14px 8px",
    flexWrap: "wrap",
    flexShrink: 0
  },
  quickChip: {
    padding: "4px 10px",
    borderRadius: 12,
    border: "1px solid #2A2A35",
    background: "#1A1A24",
    color: "#8E8E9E",
    fontSize: 10,
    cursor: "pointer",
    transition: "all 0.12s"
  },
  // 加载状态
  loadingDots: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "8px 12px"
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#6C6CFF",
    animation: "none"
  },
  // 错误提示
  errorBar: {
    padding: "8px 14px",
    background: "#3D1A1A",
    borderBottom: "1px solid #5A2A2A",
    color: "#FF8A8A",
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  // 配置弹窗
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 1e3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(4px)"
  },
  modal: {
    width: "90%",
    maxWidth: 420,
    maxHeight: "85vh",
    background: "#1A1A24",
    borderRadius: 12,
    border: "1px solid #2A2A40",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #2A2A35"
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: 600
  },
  modalBody: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid #2A2A35"
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  fieldLabel: {
    fontSize: 11,
    color: "#8E8E9E",
    fontWeight: 500
  },
  fieldInput: {
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid #2A2A35",
    background: "#12121E",
    color: "#E8E8ED",
    fontSize: 12,
    outline: "none",
    fontFamily: "inherit"
  },
  textareaField: {
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid #2A2A35",
    background: "#12121E",
    color: "#E8E8ED",
    fontSize: 11,
    fontFamily: '"SF Mono", "Fira Code", monospace',
    lineHeight: 1.5,
    resize: "vertical",
    minHeight: 100,
    outline: "none"
  },
  primaryBtn: {
    padding: "7px 16px",
    borderRadius: 6,
    border: "none",
    background: "linear-gradient(135deg, #6C6CFF, #FF6B9D)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer"
  },
  secondaryBtn: {
    padding: "7px 16px",
    borderRadius: 6,
    border: "1px solid #2A2A35",
    background: "#1E1E28",
    color: "#8E8E9E",
    fontSize: 12,
    cursor: "pointer"
  },
  // 代码块样式（Markdown 渲染用）
  codeBlock: {
    display: "block",
    padding: "8px 10px",
    margin: "6px 0",
    borderRadius: 6,
    background: "#12121E",
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 11.5,
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre",
    color: "#C8E6C9",
    border: "1px solid #2A2A40"
  },
  inlineCode: {
    padding: "1px 4px",
    borderRadius: 3,
    background: "#1E1E2C",
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 12,
    color: "#A8E6CF"
  }
};
function TernPanel({ pluginId: _pluginId }) {
  const [messages, setMessages] = useState(DEMO_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(loadConfig);
  const [configForm, setConfigForm] = useState({ ...config });
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const conversationRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }, []);
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowQuickActions(false);
    setError(null);
    if (!config.apiKey.trim()) {
      setIsLoading(true);
      setTimeout(() => {
        const assistantMsg = {
          id: `msg-${Date.now()}-reply`,
          role: "assistant",
          content: `\u8BF7\u5148\u70B9\u51FB\u53F3\u4E0A\u89D2 \u2699\uFE0F \u914D\u7F6E API Key \u548C\u6A21\u578B\uFF0C\u5373\u53EF\u4F7F\u7528 AI \u80FD\u529B\u3002

\u652F\u6301 OpenAI\u3001DeepSeek\u3001Groq \u7B49\u4EFB\u610F\u517C\u5BB9 API\u3002`,
          commands: [],
          timestamp: Date.now()
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsLoading(false);
      }, 500);
      return;
    }
    const assistantId = `msg-${Date.now()}-reply`;
    setIsLoading(true);
    const chatMessages = messages.filter((m) => !m.id.startsWith("demo-") && m.id !== assistantId).map((m) => ({
      role: m.role,
      content: m.content
    }));
    chatMessages.push({ role: "user", content: text });
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      commands: [],
      timestamp: Date.now()
    }]);
    let fullContent = "";
    try {
      await chatCompleteStream(
        config,
        chatMessages,
        (chunk) => {
          fullContent += chunk;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              content: fullContent,
              commands: extractCommands(fullContent)
            };
            return updated;
          });
        },
        { timeout: 6e4 }
      );
    } catch (e) {
      const errorMsg = e instanceof AIError ? e.message : "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5";
      setError(errorMsg);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          content: `\u274C ${errorMsg}`,
          commands: []
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, config, messages]);
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);
  const handleCopy = useCallback(async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
    }
  }, []);
  const handleExampleClick = useCallback((text) => {
    setInput(text);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  const handleQuickAction = useCallback((text) => {
    setInput(text);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  const handleSaveConfig = useCallback(() => {
    setConfig({ ...configForm });
    saveConfig(configForm);
    setShowSettings(false);
  }, [configForm]);
  const handleResetConfig = useCallback(() => {
    setConfigForm({ ...DEFAULT_CONFIG });
  }, []);
  const handleClear = useCallback(() => {
    if (messages.length === 0 || !confirm("\u786E\u8BA4\u6E05\u7A7A\u6240\u6709\u5BF9\u8BDD\uFF1F")) return;
    setMessages([]);
    setShowQuickActions(true);
    setError(null);
  }, [messages]);
  const handleSendToTerminal = useCallback((cmd) => {
    alert(`\u53D1\u9001\u5230\u7EC8\u7AEF: ${cmd}
\uFF08Phase 3 \u5B9E\u73B0\uFF09`);
  }, []);
  const hasConfig = config.apiKey.trim().length > 0;
  const isEmpty = messages.length === 0;
  return /* @__PURE__ */ jsxs("div", { style: S.container, children: [
    /* @__PURE__ */ jsxs("div", { style: S.header, children: [
      /* @__PURE__ */ jsxs("div", { style: S.headerLeft, children: [
        /* @__PURE__ */ jsx("div", { style: S.headerIcon, children: "\u2318" }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { style: S.headerTitle, children: "Tern" }),
          /* @__PURE__ */ jsxs("div", { style: S.headerSub, children: [
            "\u7EC8\u7AEF\u52A9\u624B",
            hasConfig ? ` \xB7 ${config.model}` : " \xB7 \u672A\u914D\u7F6E"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4 }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleClear,
            title: "\u6E05\u7A7A\u5BF9\u8BDD",
            style: { ...S.iconBtn, fontSize: 12, opacity: isEmpty ? 0.3 : 1 },
            disabled: isEmpty,
            children: "\u{1F5D1}"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              setConfigForm({ ...config });
              setShowSettings(true);
            },
            title: "\u8BBE\u7F6E",
            style: S.iconBtn,
            children: "\u2699"
          }
        )
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs("div", { style: S.errorBar, children: [
      /* @__PURE__ */ jsx("span", { children: "\u26A0" }),
      /* @__PURE__ */ jsx("span", { children: error }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setError(null),
          style: { marginLeft: "auto", background: "none", border: "none", color: "#FF8A8A", cursor: "pointer", fontSize: 14 },
          children: "\u2715"
        }
      )
    ] }),
    showQuickActions && isEmpty && /* @__PURE__ */ jsxs("div", { style: S.quickActions, children: [
      /* @__PURE__ */ jsx("button", { style: S.quickChip, onClick: () => handleQuickAction("\u67E5\u770B Git \u5206\u652F\u60C5\u51B5"), children: "\u2387 Git \u5206\u652F" }),
      /* @__PURE__ */ jsx("button", { style: S.quickChip, onClick: () => handleQuickAction("\u627E\u51FA\u6240\u6709\u5927\u6587\u4EF6"), children: "\u{1F4C1} \u5927\u6587\u4EF6" }),
      /* @__PURE__ */ jsx("button", { style: S.quickChip, onClick: () => handleQuickAction("\u67E5\u770B\u7AEF\u53E3\u5360\u7528"), children: "\u{1F50C} \u7AEF\u53E3" }),
      /* @__PURE__ */ jsx("button", { style: S.quickChip, onClick: () => handleQuickAction("\u89E3\u91CA\u8FD9\u4E2A\u62A5\u9519: "), children: "\u274C \u5206\u6790\u62A5\u9519" }),
      /* @__PURE__ */ jsx("button", { style: S.quickChip, onClick: () => handleQuickAction("\u5982\u4F55\u64A4\u9500\u4E0A\u6B21 commit"), children: "\u21A9 \u64A4\u9500 commit" })
    ] }),
    /* @__PURE__ */ jsx("div", { ref: conversationRef, style: S.conversationArea, children: isEmpty ? /* @__PURE__ */ jsxs("div", { style: S.emptyState, children: [
      /* @__PURE__ */ jsx("div", { style: S.emptyIcon, children: "\u2328" }),
      /* @__PURE__ */ jsx("div", { style: S.emptyTitle, children: "\u7EC8\u7AEF\u52A9\u624B" }),
      /* @__PURE__ */ jsxs("div", { style: S.emptyDesc, children: [
        "\u8BF4\u4EBA\u8BDD\uFF0CTern \u5E2E\u4F60\u7FFB\u8BD1\u6210\u7EC8\u7AEF\u547D\u4EE4\u3002",
        /* @__PURE__ */ jsx("br", {}),
        "\u652F\u6301 Git \u64CD\u4F5C\u3001\u9519\u8BEF\u5206\u6790\u3001\u547D\u4EE4\u67E5\u8BE2\u3002"
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.emptyExamples, children: [
        /* @__PURE__ */ jsx("button", { style: S.exampleChip, onClick: () => handleExampleClick("\u628A commit abc123 \u79FB\u5230 main \u5206\u652F"), children: "\u300C\u628A commit abc123 \u79FB\u5230 main \u5206\u652F\u300D" }),
        /* @__PURE__ */ jsx("button", { style: S.exampleChip, onClick: () => handleExampleClick("fatal: refusing to merge unrelated histories"), children: "\u300Cfatal: refusing to merge unrelated histories\u300D" }),
        /* @__PURE__ */ jsx("button", { style: S.exampleChip, onClick: () => handleExampleClick("\u627E\u51FA\u6240\u6709\u5927\u4E8E 100MB \u7684\u65E5\u5FD7\u6587\u4EF6"), children: "\u300C\u627E\u51FA\u6240\u6709\u5927\u4E8E 100MB \u7684\u65E5\u5FD7\u6587\u4EF6\u300D" })
      ] }),
      !hasConfig && /* @__PURE__ */ jsx("div", { style: { marginTop: 20, padding: "8px 14px", borderRadius: 8, background: "#2A2A4022", border: "1px solid #2A2A40", fontSize: 11, color: "#8E8E9E" }, children: "\u70B9\u51FB\u53F3\u4E0A\u89D2 \u2699\uFE0F \u914D\u7F6E API Key \u542F\u7528 AI \u80FD\u529B" })
    ] }) : /* @__PURE__ */ jsxs("div", { style: { paddingBottom: 8 }, children: [
      messages.map((msg) => /* @__PURE__ */ jsxs("div", { style: S.bubbleGroup, children: [
        /* @__PURE__ */ jsxs("div", { style: S.bubbleMeta, children: [
          /* @__PURE__ */ jsx("span", { style: S.bubbleRole, children: msg.role === "user" ? "\u{1F4AC} \u4F60" : "\u{1F916} Tern" }),
          /* @__PURE__ */ jsx("span", { style: S.bubbleTime, children: formatTime(msg.timestamp) })
        ] }),
        /* @__PURE__ */ jsx("div", { style: msg.role === "user" ? S.bubbleUser : S.bubbleAssistant, children: /* @__PURE__ */ jsx(MarkdownContent, { text: msg.content }) }),
        msg.commands && msg.commands.length > 0 && msg.role === "assistant" && /* @__PURE__ */ jsx("div", { style: { paddingLeft: 4, paddingRight: 4 }, children: msg.commands.map((cmd, i) => {
          const cmdId = `${msg.id}-cmd-${i}`;
          const copied = copiedId === cmdId;
          return /* @__PURE__ */ jsxs("div", { style: S.commandBlock, children: [
            /* @__PURE__ */ jsxs("div", { style: S.commandHeader, children: [
              /* @__PURE__ */ jsx("span", { children: "$ \u547D\u4EE4" }),
              /* @__PURE__ */ jsx("span", { style: { fontSize: 9, color: "#4A4A5A" }, children: cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd })
            ] }),
            /* @__PURE__ */ jsx("div", { style: S.commandCode, children: cmd }),
            /* @__PURE__ */ jsxs("div", { style: S.commandActions, children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  style: { ...S.cmdBtn, background: copied ? "#10B98122" : "#2A2A40", color: copied ? "#10B981" : "#8E8E9E" },
                  onClick: () => handleCopy(cmd, cmdId),
                  children: copied ? "\u2713 \u5DF2\u590D\u5236" : "\u{1F4CB} \u590D\u5236"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  style: { ...S.cmdBtn, background: "#6C6CFF22", color: "#8E8EFF" },
                  onClick: () => handleSendToTerminal(cmd),
                  children: "\u25B6 \u53D1\u9001\u5230\u7EC8\u7AEF"
                }
              )
            ] })
          ] }, cmdId);
        }) })
      ] }, msg.id)),
      isLoading && /* @__PURE__ */ jsxs("div", { style: S.bubbleGroup, children: [
        /* @__PURE__ */ jsxs("div", { style: S.bubbleMeta, children: [
          /* @__PURE__ */ jsx("span", { style: S.bubbleRole, children: "\u{1F916} Tern" }),
          /* @__PURE__ */ jsx("span", { style: S.bubbleTime, children: "\u601D\u8003\u4E2D..." })
        ] }),
        /* @__PURE__ */ jsx("div", { style: S.bubbleAssistant, children: /* @__PURE__ */ jsxs("div", { style: S.loadingDots, children: [
          /* @__PURE__ */ jsx("div", { style: { ...S.dot, animation: "tern-bounce 1.2s infinite" } }),
          /* @__PURE__ */ jsx("div", { style: { ...S.dot, animation: "tern-bounce 1.2s infinite 0.2s" } }),
          /* @__PURE__ */ jsx("div", { style: { ...S.dot, animation: "tern-bounce 1.2s infinite 0.4s" } })
        ] }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { style: S.inputArea, children: [
      !hasConfig && messages.length > 0 && /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#6B6B80", marginBottom: 6, textAlign: "center" }, children: "\u672A\u914D\u7F6E API\uFF0C\u56DE\u590D\u4E3A\u9884\u8BBE\u6F14\u793A\u6570\u636E\u3002\u70B9\u51FB \u2699\uFE0F \u914D\u7F6E" }),
      /* @__PURE__ */ jsxs("div", { style: S.inputRow, children: [
        /* @__PURE__ */ jsx(
          "textarea",
          {
            ref: inputRef,
            value: input,
            onChange: handleInputChange,
            onKeyDown: handleKeyDown,
            placeholder: "\u8F93\u5165\u81EA\u7136\u8BED\u8A00\u6216\u7C98\u8D34\u62A5\u9519...",
            rows: 1,
            style: S.inputBox,
            disabled: isLoading
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleSend,
            disabled: !input.trim() || isLoading,
            style: { ...S.sendBtn, ...!input.trim() || isLoading ? S.sendBtnDisabled : {} },
            children: isLoading ? "\u22EF" : "\u2192"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: S.statusBar, children: [
      /* @__PURE__ */ jsxs("div", { style: S.statusLeft, children: [
        /* @__PURE__ */ jsx("div", { style: { ...S.statusDot, background: hasConfig ? "#10B981" : "#4A4A5A" } }),
        /* @__PURE__ */ jsx("span", { children: hasConfig ? `\u5DF2\u8FDE\u63A5 ${config.model}` : "\u672A\u914D\u7F6E API" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#4A4A5A" }, children: [
        messages.length,
        " \u6761\u6D88\u606F"
      ] })
    ] }),
    showSettings && /* @__PURE__ */ jsx("div", { style: S.overlay, onClick: () => setShowSettings(false), children: /* @__PURE__ */ jsxs("div", { style: S.modal, onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { style: S.modalHeader, children: [
        /* @__PURE__ */ jsx("span", { style: S.modalTitle, children: "\u2699\uFE0F Tern \u8BBE\u7F6E" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setShowSettings(false),
            style: { background: "none", border: "none", color: "#8E8E9E", fontSize: 18, cursor: "pointer" },
            children: "\u2715"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.modalBody, children: [
        /* @__PURE__ */ jsxs("div", { style: S.fieldGroup, children: [
          /* @__PURE__ */ jsx("label", { style: S.fieldLabel, children: "API Base URL" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              value: configForm.baseUrl,
              onChange: (e) => setConfigForm((prev) => ({ ...prev, baseUrl: e.target.value })),
              placeholder: "https://api.openai.com/v1",
              style: S.fieldInput
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { fontSize: 9, color: "#4A4A5A" }, children: "\u652F\u6301 OpenAI \u517C\u5BB9 API\uFF08OpenAI\u3001DeepSeek\u3001Groq \u7B49\uFF09" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: S.fieldGroup, children: [
          /* @__PURE__ */ jsx("label", { style: S.fieldLabel, children: "API Key" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              value: configForm.apiKey,
              onChange: (e) => setConfigForm((prev) => ({ ...prev, apiKey: e.target.value })),
              placeholder: "sk-...",
              type: "password",
              style: S.fieldInput
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: S.fieldGroup, children: [
          /* @__PURE__ */ jsx("label", { style: S.fieldLabel, children: "Model" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              value: configForm.model,
              onChange: (e) => setConfigForm((prev) => ({ ...prev, model: e.target.value })),
              placeholder: "gpt-4o",
              style: S.fieldInput
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: S.fieldGroup, children: [
          /* @__PURE__ */ jsx("label", { style: S.fieldLabel, children: "\u7CFB\u7EDF\u63D0\u793A\u8BCD" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: configForm.systemPrompt,
              onChange: (e) => setConfigForm((prev) => ({ ...prev, systemPrompt: e.target.value })),
              style: S.textareaField,
              rows: 8
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleResetConfig,
              style: { ...S.cmdBtn, alignSelf: "flex-start", marginTop: 4, background: "#2A2A40", color: "#8E8E9E" },
              children: "\u6062\u590D\u9ED8\u8BA4\u63D0\u793A\u8BCD"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: S.modalFooter, children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setShowSettings(false), style: S.secondaryBtn, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("button", { onClick: handleSaveConfig, style: S.primaryBtn, children: "\u4FDD\u5B58" })
      ] })
    ] }) })
  ] });
}
function MarkdownContent({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let inCodeBlock = false;
  let codeContent = "";
  let codeLang = "";
  let paragraphLines = [];
  function flushParagraph() {
    if (paragraphLines.length > 0) {
      const content = paragraphLines.join("\n");
      elements.push(
        /* @__PURE__ */ jsx("div", { style: { marginBottom: 4, lineHeight: 1.6 }, children: /* @__PURE__ */ jsx(InlineText, { text: content }) }, `p-${elements.length}`)
      );
      paragraphLines = [];
    }
  }
  for (const line of lines) {
    if (line.startsWith("```") && !inCodeBlock) {
      flushParagraph();
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      codeContent = "";
      continue;
    }
    if (line.startsWith("```") && inCodeBlock) {
      inCodeBlock = false;
      elements.push(
        /* @__PURE__ */ jsx("pre", { style: S.codeBlock, children: codeContent }, `code-${elements.length}`)
      );
      codeContent = "";
      continue;
    }
    if (inCodeBlock) {
      codeContent += (codeContent ? "\n" : "") + line;
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      elements.push(
        /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: 14, marginTop: 10, marginBottom: 4, color: "#E8E8ED" }, children: line.slice(3) }, `h2-${elements.length}`)
      );
      continue;
    }
    if (line.startsWith("---")) {
      flushParagraph();
      elements.push(
        /* @__PURE__ */ jsx("div", { style: { borderTop: "1px solid #2A2A35", margin: "8px 0" } }, `hr-${elements.length}`)
      );
      continue;
    }
    paragraphLines.push(line);
  }
  flushParagraph();
  if (inCodeBlock) {
    elements.push(
      /* @__PURE__ */ jsx("pre", { style: S.codeBlock, children: codeContent }, `code-${elements.length}`)
    );
  }
  return /* @__PURE__ */ jsx(Fragment, { children: elements });
}
function InlineText({ text }) {
  const parts = text.split(/(`[^`]+`)/g);
  return /* @__PURE__ */ jsx(Fragment, { children: parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return /* @__PURE__ */ jsx("code", { style: S.inlineCode, children: part.slice(1, -1) }, i);
    }
    if (part.startsWith("- ")) {
      return /* @__PURE__ */ jsxs("span", { style: { display: "block", paddingLeft: 12, color: "#B0B0BC" }, children: [
        "\u2022 ",
        part.slice(2)
      ] }, i);
    }
    if (part.startsWith("\u26A0\uFE0F")) {
      return /* @__PURE__ */ jsx("span", { style: { display: "block", color: "#FFA726", margin: "2px 0" }, children: part }, i);
    }
    return /* @__PURE__ */ jsx("span", { children: part }, i);
  }) });
}
export {
  TernPanel as default
};
