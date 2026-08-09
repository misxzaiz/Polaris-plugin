// src/Panel.tsx
import { createElement, useState, useEffect } from "react";
function BlenderPanel({ pluginId, onSendToChat }) {
  const [blenderFound, setBlenderFound] = useState(null);
  const [recentModels, setRecentModels] = useState([]);
  const [serverStatus, setServerStatus] = useState("checking");
  useEffect(() => {
    checkBlender();
    loadRecentModels();
  }, []);
  async function checkBlender() {
    try {
      const res = await fetch("/api/system/which?name=blender");
      const data = await res.json();
      setBlenderFound(data.found || false);
    } catch {
      setBlenderFound(null);
    }
    setServerStatus("ready");
  }
  function loadRecentModels() {
    setRecentModels([]);
  }
  function handleQuickModel(scriptName) {
    if (onSendToChat) {
      onSendToChat(`/blender ${scriptName}`);
    }
  }
  return createElement(
    "div",
    {
      className: "flex flex-col h-full overflow-hidden"
    },
    // 头部
    createElement(
      "div",
      {
        className: "px-4 py-3 border-b border-border shrink-0"
      },
      createElement("h2", { className: "text-sm font-bold text-text" }, "3D \u5EFA\u6A21"),
      createElement("p", { className: "text-xs text-text-muted mt-0.5" }, "AI \u9A71\u52A8\u7684 Blender \u5EFA\u6A21\u5DE5\u5177")
    ),
    // 状态
    createElement(
      "div",
      {
        className: "px-4 py-2 border-b border-border shrink-0"
      },
      createElement(
        "div",
        { className: "flex items-center gap-2 text-xs" },
        serverStatus === "checking" ? createElement("span", { className: "text-text-muted" }, "\u68C0\u67E5 Blender \u8FDE\u63A5...") : createElement(
          "span",
          { className: "text-text-muted" },
          "MCP Server: ",
          createElement("span", { className: "text-green-400" }, "\u2705 \u5728\u7EBF")
        )
      ),
      createElement(
        "div",
        { className: "flex items-center gap-2 text-xs mt-1" },
        blenderFound === null ? createElement("span", { className: "text-text-muted" }, "Blender: \u672A\u68C0\u6D4B") : blenderFound ? createElement("span", { className: "text-green-400" }, "\u2705 Blender \u5DF2\u5C31\u7EEA") : createElement("span", { className: "text-yellow-400" }, "\u26A0\uFE0F Blender \u672A\u5B89\u88C5\u6216\u4E0D\u5728 PATH")
      )
    ),
    // 快速建模
    createElement(
      "div",
      {
        className: "flex-1 overflow-y-auto px-4 py-3"
      },
      createElement("h3", { className: "text-xs font-medium text-text-muted mb-2" }, "\u5FEB\u901F\u5EFA\u6A21"),
      // 木鱼
      createElement(
        "button",
        {
          onClick: () => handleQuickModel("muyu"),
          className: "w-full text-left px-3 py-2 rounded-lg border border-border bg-background-elevated hover:bg-accent/5 transition-colors mb-2"
        },
        createElement("div", { className: "text-xs font-medium text-text" }, "\u{1FAB5} \u6728\u9C7C"),
        createElement("div", { className: "text-[10px] text-text-muted mt-0.5" }, "\u4F20\u7EDF\u6728\u9C7C\u6CD5\u5668\uFF0C\u542B\u5E95\u5EA7\u3001\u6728\u9C7C\u69CC")
      ),
      // Q 版角色（预留）
      createElement(
        "button",
        {
          onClick: () => handleQuickModel("qbox_character"),
          className: "w-full text-left px-3 py-2 rounded-lg border border-border bg-background-elevated hover:bg-accent/5 transition-colors mb-2 opacity-50 cursor-not-allowed"
        },
        createElement("div", { className: "text-xs font-medium text-text" }, "\u{1F9F8} Q \u7248\u89D2\u8272"),
        createElement("div", { className: "text-[10px] text-text-muted mt-0.5" }, "\u565C\u565C\u98CE\u683C\u5361\u901A\u89D2\u8272\uFF08\u5F00\u53D1\u4E2D\uFF09")
      ),
      // 分隔
      createElement("div", { className: "my-3 border-t border-border" }),
      // 使用说明
      createElement("h3", { className: "text-xs font-medium text-text-muted mb-2" }, "\u4F7F\u7528\u65B9\u5F0F"),
      createElement(
        "div",
        { className: "text-[10px] text-text-muted space-y-1" },
        createElement("p", {}, "\u5728\u804A\u5929\u4E2D\u901A\u8FC7 AI \u5BF9\u8BDD\u5EFA\u6A21\uFF1A"),
        createElement("p", {}, '\u2022 "\u5E2E\u6211\u5EFA\u4E00\u4E2A\u6728\u9C7C"'),
        createElement("p", {}, '\u2022 "\u751F\u6210\u4E00\u4E2A\u5706\u6DA6\u7684\u6728\u5934\u9C7C\uFF0C\u989C\u8272\u6DF1\u4E00\u70B9"'),
        createElement("p", {}, '\u2022 "\u6362\u4E00\u4E2A\u6728\u7EB9\u7EB9\u7406"'),
        createElement("p", { className: "mt-2 italic" }, "AI \u4F1A\u81EA\u52A8\u8C03\u7528 Blender \u5E76\u5C55\u793A\u9884\u89C8")
      ),
      // 历史模型（Phase 2）
      recentModels.length > 0 && createElement(
        "div",
        { className: "mt-4" },
        createElement("h3", { className: "text-xs font-medium text-text-muted mb-2" }, "\u6700\u8FD1\u6A21\u578B"),
        createElement(
          "div",
          { className: "space-y-1" },
          ...recentModels.map(
            (m, i) => createElement("div", { key: i, className: "text-xs text-text-muted" }, m.name)
          )
        )
      )
    )
  );
}
var Panel_default = BlenderPanel;
export {
  Panel_default as default
};
