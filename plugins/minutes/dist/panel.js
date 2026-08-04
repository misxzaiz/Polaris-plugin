// src/Panel.tsx
import { useState, useRef } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var TEMPLATES = [
  { type: "meeting", label: "\u4F1A\u8BAE\u7EAA\u8981" },
  { type: "weekly", label: "\u5468\u62A5" },
  { type: "standup", label: "\u7AD9\u4F1A" }
];
var SKELETONS = {
  meeting: `# \u4F1A\u8BAE\u7EAA\u8981

**\u65E5\u671F**: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}
**\u53C2\u4F1A**: 

## \u8BAE\u9898
1. 

## \u8BA8\u8BBA\u8981\u70B9
- 

## \u51B3\u8BAE
- 

## \u5F85\u529E\u4E8B\u9879
- [ ]  (@)

## \u4E0B\u6B21\u4F1A\u8BAE
- `,
  weekly: `# \u5468\u62A5

**\u5468\u671F**: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}
**\u8D1F\u8D23\u4EBA**: 

## \u672C\u5468\u5B8C\u6210
- 

## \u4E0B\u5468\u8BA1\u5212
- 

## \u98CE\u9669\u4E0E\u963B\u585E
- \u65E0

## \u6570\u636E\u6307\u6807
- `,
  standup: `# \u6BCF\u65E5\u7AD9\u4F1A

**\u65E5\u671F**: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}

## \u6628\u65E5\u5B8C\u6210
- 

## \u4ECA\u65E5\u8BA1\u5212
- 

## \u963B\u585E
- \u65E0`
};
function MinutesPanel({ pluginId, onSendToChat }) {
  const [input, setInput] = useState("");
  const [type, setType] = useState("meeting");
  const [output, setOutput] = useState(SKELETONS.meeting);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const inputRef = useRef(null);
  const applyTemplate = (t) => {
    setType(t);
    setOutput(SKELETONS[t] || SKELETONS.meeting);
    setActiveTab("edit");
  };
  const structureLocal = () => {
    if (!input.trim()) {
      setOutput(SKELETONS[type]);
      return;
    }
    const lines = input.split(/\r?\n|。|\.|；|;|！|!|\?|？/).map((s) => s.trim()).filter((s) => s.length > 2);
    const decisions = lines.filter((s) => /决定|同意|确认|通过|决议|敲定|确定/.test(s));
    const actions = lines.filter((s) => /负责|完成|跟进|处理|对接|安排|提交|发送|更新|修复|确认|推动|准备/i.test(s));
    if (type === "meeting") {
      setOutput(`# \u4F1A\u8BAE\u7EAA\u8981

**\u65E5\u671F**: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}
**\u53C2\u4F1A**: 

## \u8BAE\u9898
${lines.slice(0, 3).map((l) => `1. ${l}`).join("\n")}

## \u8BA8\u8BBA\u8981\u70B9
${lines.slice(0, 4).map((l) => `- ${l}`).join("\n")}

## \u51B3\u8BAE
${decisions.length ? decisions.map((l) => `- ${l}`).join("\n") : "- \uFF08\u5F85\u8865\u5145\uFF09"}

## \u5F85\u529E\u4E8B\u9879
${actions.length ? actions.map((l) => `- [ ] ${l.replace(/@([^\s,，。]+)/g, "")} @${(l.match(/@([^\s,，。]+)/) || [])[1] || ""}`).join("\n") : "- [ ] \uFF08\u5F85\u8865\u5145\uFF09 (@)"}

## \u4E0B\u6B21\u4F1A\u8BAE
- \u5F85\u5B9A`);
    } else if (type === "weekly") {
      setOutput(`# \u5468\u62A5

**\u5468\u671F**: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}
**\u8D1F\u8D23\u4EBA**: 

## \u672C\u5468\u5B8C\u6210
${lines.slice(0, 4).map((l) => `- ${l}`).join("\n")}

## \u4E0B\u5468\u8BA1\u5212
${lines.slice(2, 6).map((l) => `- ${l}`).join("\n")}

## \u98CE\u9669\u4E0E\u963B\u585E
${lines.filter((l) => /风险|阻塞|问题|担心|延期/.test(l)).map((l) => `- ${l}`).join("\n") || "- \u65E0"}

## \u6570\u636E\u6307\u6807
- `);
    } else {
      setOutput(`# \u6BCF\u65E5\u7AD9\u4F1A

**\u65E5\u671F**: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}

## \u6628\u65E5\u5B8C\u6210
${lines.slice(0, 3).map((l) => `- ${l}`).join("\n")}

## \u4ECA\u65E5\u8BA1\u5212
${lines.slice(2, 5).map((l) => `- ${l}`).join("\n")}

## \u963B\u585E
${lines.filter((l) => /阻塞|卡|等|依赖|需要/.test(l)).map((l) => `- ${l}`).join("\n") || "- \u65E0"}`);
    }
    setActiveTab("edit");
  };
  const copy = () => {
    navigator.clipboard?.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const exportMd = () => {
    const blob = new Blob([output], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.md`;
    a.click();
  };
  const askAI = () => {
    if (!input.trim()) return;
    onSendToChat?.(`\u8BF7\u7528 minutes-craft \u7684 structure_minutes \u5DE5\u5177\uFF0C\u6309\u300C${type}\u300D\u6A21\u677F\u7ED3\u6784\u5316\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u5E76\u5728\u5361\u7247\u4E2D\u6E32\u67D3\uFF1A

${input}`);
  };
  const renderMd = (md) => {
    return md.replace(/^# (.+)$/gm, '<h1 style="font-size:15px;margin:8px 0 4px">$1</h1>').replace(/^## (.+)$/gm, '<h2 style="font-size:13px;margin:10px 0 4px;color:#B4B4B8">$1</h2>').replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^- \[ \] (.+)$/gm, '<div style="margin-left:8px">\u2610 $1</div>').replace(/^- (.+)$/gm, '<div style="margin-left:8px">\u2022 $1</div>').replace(/\n/g, "<br/>");
  };
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid #3F3F46", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: "\u6A21\u677F:" }),
      TEMPLATES.map((t) => /* @__PURE__ */ jsx("button", { onClick: () => applyTemplate(t.type), style: type === t.type ? activeChip : chip, children: t.label }, t.type))
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          ref: inputRef,
          value: input,
          onChange: (e) => setInput(e.target.value),
          placeholder: "\u7C98\u8D34\u4F1A\u8BAE\u8F6C\u5199/\u7B14\u8BB0\u539F\u6587\u2026\uFF08\u6216\u76F4\u63A5\u5728\u4E0B\u65B9\u7F16\u8F91\u6A21\u677F\uFF09",
          style: { width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx("button", { onClick: structureLocal, style: btnStyle, children: "\u672C\u5730\u7ED3\u6784\u5316" }),
        /* @__PURE__ */ jsx("button", { onClick: askAI, disabled: !input.trim(), style: { ...btnStyle, opacity: input.trim() ? 1 : 0.4 }, children: "AI \u7CBE\u70BC" }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { onClick: () => setActiveTab("edit"), style: activeTab === "edit" ? activeChip : chip, children: "\u7F16\u8F91" }),
        /* @__PURE__ */ jsx("button", { onClick: () => setActiveTab("preview"), style: activeTab === "preview" ? activeChip : chip, children: "\u9884\u89C8" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }, children: activeTab === "edit" ? /* @__PURE__ */ jsx(
      "textarea",
      {
        value: output,
        onChange: (e) => setOutput(e.target.value),
        spellCheck: false,
        style: { flex: 1, padding: 10, fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#1F1F24", color: "#F8F8F8", border: "none", resize: "none", outline: "none", lineHeight: 1.5 }
      }
    ) : /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: 12 }, dangerouslySetInnerHTML: { __html: renderMd(output) } }) }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, padding: "8px 10px", borderTop: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: copy, style: btnStyle, children: copied ? "\u2713 \u5DF2\u590D\u5236" : "\u590D\u5236" }),
      /* @__PURE__ */ jsx("button", { onClick: exportMd, style: btnStyle, children: "\u5BFC\u51FA .md" })
    ] })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
var chip = { padding: "2px 8px", borderRadius: 10, border: "1px solid #3F3F46", background: "transparent", color: "#B4B4B8", fontSize: 10, cursor: "pointer" };
var activeChip = { ...chip, background: "#3B82F622", color: "#3B82F6", borderColor: "#3B82F6" };
export {
  MinutesPanel as default
};
