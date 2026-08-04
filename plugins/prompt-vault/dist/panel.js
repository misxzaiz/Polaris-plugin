// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function PromptVaultPanel({ pluginId, onSendToChat }) {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState("");
  const [vars, setVars] = useState({});
  const [rendered, setRendered] = useState("");
  const [diff, setDiff] = useState(null);
  const [msg, setMsg] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.promptvault.list");
      if (raw) setList(JSON.parse(raw));
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persistList = (next) => {
    setList(next);
    localStorage.setItem("polaris.promptvault.list", JSON.stringify(next));
  };
  const persistDetail = (name, versions, tags) => {
    const d = { name, tags, versions };
    setDetail(d);
    localStorage.setItem("polaris.promptvault." + name, JSON.stringify(d));
  };
  const loadDetail = (name) => {
    try {
      const raw = localStorage.getItem("polaris.promptvault." + name);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const select = (name) => {
    setSelected(name);
    const d = loadDetail(name);
    if (d) {
      setDetail(d);
      const latest = d.versions[d.versions.length - 1];
      setEditing(latest.template);
      setVars({});
      setRendered("");
      setDiff(null);
    } else {
      setDetail(null);
      setEditing("");
    }
    setMsg(null);
  };
  const extractVars = (t) => {
    const set = /* @__PURE__ */ new Set();
    const re = /\{\{\s*([\w.]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(t)) !== null) set.add(m[1]);
    return [...set];
  };
  const doRender = () => {
    let out = editing;
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.]/g, "\\.")}\\s*\\}\\}`, "g"), v);
    }
    setRendered(out);
  };
  const save = () => {
    if (!selected) return;
    const d = loadDetail(selected) || { name: selected, tags: [], versions: [] };
    const ver = d.versions.length + 1;
    d.versions.push({ version: ver, template: editing, ts: Date.now(), tags: d.tags });
    persistDetail(selected, d.versions, d.tags);
    const next = list.some((p) => p.name === selected) ? list.map((p) => p.name === selected ? { ...p, versions: d.versions.length, vars: extractVars(editing) } : p) : [...list, { name: selected, tags: d.tags, versions: d.versions.length, vars: extractVars(editing) }];
    persistList(next);
    setMsg(`\u2713 \u5DF2\u4FDD\u5B58 ${selected} v${ver}`);
  };
  const newPrompt = () => {
    const name = prompt("\u65B0 prompt \u540D\u79F0\uFF08\u5982 summarizer\uFF09");
    if (!name) return;
    if (list.some((p) => p.name === name)) {
      setMsg("\u5DF2\u5B58\u5728");
      return;
    }
    persistList([...list, { name, tags: [], versions: 0, vars: [] }]);
    persistDetail(name, [], []);
    select(name);
  };
  const askAISave = () => {
    if (!selected || !editing) return;
    onSendToChat?.(`\u8BF7\u7528 prompt-vault \u7684 save_prompt \u5DE5\u5177\u4FDD\u5B58\uFF1Aname="${selected}", template=
${editing}`);
  };
  const askAIRender = () => {
    if (!selected) return;
    onSendToChat?.(`\u8BF7\u7528 prompt-vault \u7684 render_prompt \u5DE5\u5177\u6E32\u67D3 "${selected}"\uFF0C\u53D8\u91CF: ${JSON.stringify(vars)}`);
  };
  const showDiff = () => {
    if (!detail || detail.versions.length < 2) {
      setMsg("\u9700\u81F3\u5C11 2 \u7248\u672C");
      return;
    }
    const v1 = detail.versions[detail.versions.length - 2];
    const v2 = detail.versions[detail.versions.length - 1];
    const la = v1.template.split(/\r?\n/);
    const lb = v2.template.split(/\r?\n/);
    const out = [];
    const max = Math.max(la.length, lb.length);
    for (let i = 0; i < max; i++) {
      if (la[i] === lb[i]) out.push(`  ${la[i] || ""}`);
      else {
        if (la[i] !== void 0) out.push(`- ${la[i]}`);
        if (lb[i] !== void 0) out.push(`+ ${lb[i]}`);
      }
    }
    setDiff(out.join("\n"));
  };
  const varList = extractVars(editing);
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { width: 200, borderRight: "1px solid #3F3F46", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: "Prompt \u5E93" }),
        /* @__PURE__ */ jsx("button", { onClick: newPrompt, style: btnStyle, children: "+" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto" }, children: list.length === 0 ? /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "#8E8E93", fontSize: 11 }, children: "\u6682\u65E0\uFF0C\u70B9 + \u65B0\u5EFA" }) : list.map((p) => /* @__PURE__ */ jsxs("div", { onClick: () => select(p.name), style: { padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid #2A2A30", background: selected === p.name ? "#2D2D33" : "transparent" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 12, fontWeight: 500 }, children: p.name }),
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#6B7280" }, children: [
          "v",
          p.versions,
          " \xB7 ",
          p.vars.length,
          " \u53D8\u91CF"
        ] })
      ] }, p.name)) })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }, children: !selected ? /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8E8E93" }, children: "\u9009\u62E9\u6216\u65B0\u5EFA\u4E00\u4E2A prompt" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46", display: "flex", gap: 6, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: selected }),
        /* @__PURE__ */ jsxs("span", { style: { fontSize: 10, color: "#6B7280" }, children: [
          "v",
          detail?.versions.length || 0
        ] }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
        /* @__PURE__ */ jsx("button", { onClick: save, style: btnStyle, children: "\u5B58\u7248\u672C" }),
        /* @__PURE__ */ jsx("button", { onClick: showDiff, style: btnStyle, children: "\u5BF9\u6BD4\u4E0A\u7248" }),
        /* @__PURE__ */ jsx("button", { onClick: askAISave, style: btnStyle, children: "AI \u6301\u4E45\u5316" })
      ] }),
      msg && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflowY: "auto", padding: 10 }, children: [
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: editing,
            onChange: (e) => setEditing(e.target.value),
            placeholder: "prompt \u6A21\u677F\uFF0C\u7528 {{variable}} \u5360\u4F4D\u7B26\u2026",
            style: { width: "100%", minHeight: 120, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, fontFamily: "ui-monospace, monospace", resize: "vertical", outline: "none", boxSizing: "border-box" }
          }
        ),
        varList.length > 0 && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginBottom: 6 }, children: "\u53D8\u91CF" }),
          varList.map((v) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }, children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#3B82F6", width: 100, fontFamily: "monospace" }, children: "{{" + v + "}}" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                value: vars[v] || "",
                onChange: (e) => setVars((prev) => ({ ...prev, [v]: e.target.value })),
                placeholder: `\u503C for ${v}`,
                style: { flex: 1, padding: "4px 8px", borderRadius: 4, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 11, outline: "none" }
              }
            )
          ] }, v)),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
            /* @__PURE__ */ jsx("button", { onClick: doRender, style: btnStyle, children: "\u672C\u5730\u6E32\u67D3" }),
            /* @__PURE__ */ jsx("button", { onClick: askAIRender, style: btnStyle, children: "AI \u6E32\u67D3" })
          ] })
        ] }),
        rendered && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginBottom: 4 }, children: "\u6E32\u67D3\u7ED3\u679C" }),
          /* @__PURE__ */ jsx("pre", { style: { margin: 0, padding: 8, borderRadius: 6, background: "#1F2A1F", border: "1px solid #10B98144", fontSize: 12, color: "#10B981", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" }, children: rendered })
        ] }),
        diff && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#8E8E93", marginBottom: 4 }, children: "\u7248\u672C\u5BF9\u6BD4" }),
          /* @__PURE__ */ jsx("pre", { style: { margin: 0, padding: 8, borderRadius: 6, background: "#25252B", border: "1px solid #3F3F46", fontSize: 11, color: "#B4B4B8", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" }, children: diff })
        ] })
      ] })
    ] }) })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
export {
  PromptVaultPanel as default
};
