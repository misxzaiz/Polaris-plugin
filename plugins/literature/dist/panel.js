// src/Panel.tsx
import { useState, useEffect, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function LiteraturePanel({ pluginId, onSendToChat }) {
  const [papers, setPapers] = useState([]);
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [input, setInput] = useState("");
  const [citation, setCitation] = useState("");
  const [msg, setMsg] = useState(null);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem("polaris.literature.papers");
      if (raw) setPapers(JSON.parse(raw));
    } catch {
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const persist = (next) => {
    setPapers(next);
    localStorage.setItem("polaris.literature.papers", JSON.stringify(next));
  };
  const addLocal = () => {
    if (!input.trim()) return;
    const p = {
      id: "p" + Date.now().toString().slice(-6),
      title: input.split(/\r?\n/)[0].slice(0, 60),
      authors: (input.match(/(?:作者|by|authors?)[:\s]*([^\n。,，]{2,40})/i)?.[1] || "\uFF08\u5F85\u8865\uFF09").trim(),
      year: input.match(/(19|20)\d{2}/)?.[0] || "\uFF08\u5F85\u8865\uFF09",
      method: "\uFF08\u5F85\u8865\uFF09",
      sample: "\uFF08\u5F85\u8865\uFF09",
      conclusion: input.slice(-80),
      limitation: "\uFF08\u5F85\u8865\uFF09",
      note: "",
      ts: Date.now()
    };
    persist([...papers, p]);
    setInput("");
    setMsg(`\u2713 \u672C\u5730\u4FDD\u5B58 ${p.id}\uFF08\u5EFA\u8BAE\u7528 AI \u63D0\u53D6\u66F4\u51C6\uFF09`);
  };
  const askAIExtract = () => {
    if (!input.trim()) return;
    onSendToChat?.(`\u8BF7\u7528 literature-matrix \u7684 save_paper \u5DE5\u5177\u4FDD\u5B58\u5E76\u63D0\u53D6\u8FD9\u7BC7\u8BBA\u6587\u7684\u7ED3\u6784\u5316\u5B57\u6BB5\uFF1A

${input}`);
  };
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const askAICompare = () => {
    const ids = [...selected];
    if (ids.length < 2) {
      setMsg("\u9009\u81F3\u5C11 2 \u7BC7");
      return;
    }
    onSendToChat?.(`\u8BF7\u7528 literature-matrix \u7684 compare_papers \u5DE5\u5177\u5BF9\u6BD4\u8FD9\u4E9B\u8BBA\u6587\uFF1A${JSON.stringify(ids)}`);
  };
  const askCitation = (style) => {
    if (selected.size !== 1) {
      setMsg("\u9009 1 \u7BC7");
      return;
    }
    onSendToChat?.(`\u8BF7\u7528 literature-matrix \u7684 format_citation \u5DE5\u5177\u683C\u5F0F\u5316\u5F15\u7528\uFF1Aid="${[...selected][0]}", style="${style}"`);
    const p = papers.find((x) => x.id === [...selected][0]);
    if (p) {
      const c = style === "IEEE" ? `[1] ${p.authors}, "${p.title}," ${p.year}.` : style === "GB-T7714" ? `${p.authors}. ${p.title}[J]. ${p.year}.` : `${p.authors} (${p.year}). ${p.title}.`;
      setCitation(c);
    }
  };
  const del = (id) => persist(papers.filter((p) => p.id !== id));
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", background: "#1A1A1F", color: "#F8F8F8", fontSize: 13 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderBottom: "1px solid #3F3F46" }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: input,
          onChange: (e) => setInput(e.target.value),
          placeholder: "\u7C98\u8D34\u8BBA\u6587\u6458\u8981/\u7B14\u8BB0\u2026",
          style: { width: "100%", minHeight: 50, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx("button", { onClick: addLocal, style: btnStyle, children: "\u672C\u5730\u4FDD\u5B58" }),
        /* @__PURE__ */ jsx("button", { onClick: askAIExtract, disabled: !input.trim(), style: { ...btnStyle, opacity: input.trim() ? 1 : 0.4 }, children: "AI \u63D0\u53D6" })
      ] })
    ] }),
    msg && /* @__PURE__ */ jsx("div", { style: { padding: "4px 10px", color: msg.startsWith("\u2713") ? "#10B981" : "#EF4444", fontSize: 11 }, children: msg }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 10px" }, children: papers.length === 0 ? /* @__PURE__ */ jsx("div", { style: { color: "#8E8E93", textAlign: "center", padding: 24, fontSize: 11 }, children: "\u6682\u65E0\u6587\u732E" }) : papers.map((p) => /* @__PURE__ */ jsxs("div", { style: { padding: 10, marginBottom: 8, borderRadius: 8, background: selected.has(p.id) ? "#2D2D33" : "#25252B", border: `1px solid ${selected.has(p.id) ? "#3B82F6" : "#3F3F46"}` }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: selected.has(p.id), onChange: () => toggle(p.id), style: { cursor: "pointer" } }),
        /* @__PURE__ */ jsx("div", { style: { flex: 1, fontWeight: 500, fontSize: 12 }, children: p.title }),
        /* @__PURE__ */ jsx("button", { onClick: () => del(p.id), style: { ...btnStyle, padding: "2px 6px", fontSize: 10 }, children: "\u2715" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 10, color: "#8E8E93", marginTop: 4 }, children: [
        p.authors,
        " \xB7 ",
        p.year,
        " \xB7 ",
        p.id
      ] })
    ] }, p.id)) }),
    selected.size >= 2 && /* @__PURE__ */ jsx("div", { style: { padding: "8px 10px", borderTop: "1px solid #3F3F46" }, children: /* @__PURE__ */ jsxs("button", { onClick: askAICompare, style: { ...btnStyle, width: "100%" }, children: [
      "\u751F\u6210\u5BF9\u6BD4\u77E9\u9635 (",
      selected.size,
      ")"
    ] }) }),
    /* @__PURE__ */ jsxs("div", { style: { padding: "8px 10px", borderTop: "1px solid #3F3F46", display: "flex", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => askCitation("APA"), style: btnStyle, children: "APA" }),
      /* @__PURE__ */ jsx("button", { onClick: () => askCitation("IEEE"), style: btnStyle, children: "IEEE" }),
      /* @__PURE__ */ jsx("button", { onClick: () => askCitation("GB-T7714"), style: btnStyle, children: "GB-T7714" }),
      citation && /* @__PURE__ */ jsx("div", { style: { flexBasis: "100%", fontSize: 11, color: "#10B981", marginTop: 4, fontFamily: "monospace" }, children: citation })
    ] })
  ] });
}
var btnStyle = { padding: "4px 10px", borderRadius: 6, border: "1px solid #3F3F46", background: "#2D2D33", color: "#F8F8F8", fontSize: 11, cursor: "pointer" };
export {
  LiteraturePanel as default
};
