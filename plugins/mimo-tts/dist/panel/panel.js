// src/panel/Panel.tsx
import { useEffect, useState, useCallback } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var PLUGIN_ID = "mimo-tts";
var LOCAL_AUDIO_BASE = "http://127.0.0.1:9861";
var PRESET_VOICES = [
  { value: "\u51B0\u7CD6", label: "\u51B0\u7CD6\uFF08\u4E2D\u6587\u5973\u58F0\uFF09" },
  { value: "\u8309\u8389", label: "\u8309\u8389\uFF08\u4E2D\u6587\u5973\u58F0\uFF09" },
  { value: "\u82CF\u6253", label: "\u82CF\u6253\uFF08\u4E2D\u6587\u7537\u58F0\uFF09" },
  { value: "\u767D\u6866", label: "\u767D\u6866\uFF08\u4E2D\u6587\u7537\u58F0\uFF09" },
  { value: "Mia", label: "Mia\uFF08\u82F1\u6587\u5973\u58F0\uFF09" },
  { value: "Chloe", label: "Chloe\uFF08\u82F1\u6587\u5973\u58F0\uFF09" },
  { value: "Milo", label: "Milo\uFF08\u82F1\u6587\u7537\u58F0\uFF09" },
  { value: "Dean", label: "Dean\uFF08\u82F1\u6587\u7537\u58F0\uFF09" }
];
async function hostInvoke(cmd, args = {}) {
  const invoker = window.__POLARIS_HOST_INVOKE__;
  if (invoker) return invoker(cmd, args);
  const internals = window.__TAURI_INTERNALS__;
  if (internals?.invoke) return internals.invoke(cmd, args);
  throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF08\u9700\u5728 Polaris \u5185\u8FD0\u884C\uFF09");
}
async function loadConfig() {
  const cfg = await hostInvoke("plugin_get_config", { pluginId: PLUGIN_ID });
  return {
    apiKey: cfg.apiKey || "",
    baseUrl: cfg.baseUrl || "https://api.xiaomimimo.com/v1",
    defaultVoice: cfg.defaultVoice || "\u51B0\u7CD6",
    outputMode: cfg.outputMode || "file"
  };
}
async function saveConfig(patch) {
  await hostInvoke("plugin_set_config", { pluginId: PLUGIN_ID, patch });
}
async function capHttpRequest(opts) {
  const res = await hostInvoke(
    "router_dispatch",
    {
      req: {
        target: "cap.http",
        payload: {
          action: "request",
          method: opts.method,
          url: opts.url,
          headers: opts.headers || {},
          body: opts.body || "",
          bodyType: opts.bodyType || "text",
          timeoutMs: opts.timeoutMs || 12e4
        }
      }
    }
  );
  if (!res || !res.ok) throw new Error(res && res.error || "cap.http \u8F6C\u53D1\u5931\u8D25");
  const result = res.result || {};
  return {
    status: Number(result.status) || 0,
    ok: !!result.ok,
    body: String(result.body ?? "")
  };
}
async function callTts(cfg, model, messages, audio) {
  if (!cfg.apiKey) throw new Error("\u672A\u914D\u7F6E API Key\uFF0C\u8BF7\u5148\u5728\u300C\u914D\u7F6E\u300D\u9875\u586B\u5199");
  const baseUrl = (cfg.baseUrl || "https://api.xiaomimimo.com/v1").trim().replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${cfg.apiKey}`
  };
  const body = JSON.stringify({ model, messages, audio: { format: "wav", ...audio }, stream: false });
  let fallbackToFetch = false;
  try {
    const r = await capHttpRequest({ method: "POST", url, headers, body, bodyType: "json" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data2 = JSON.parse(r.body || "{}");
    const audioData2 = data2.choices?.[0]?.message?.audio;
    if (!audioData2?.data) throw new Error("\u54CD\u5E94\u7F3A\u5C11 audio.data");
    return {
      audioBase64: audioData2.data,
      transcript: audioData2.transcript || "",
      usage: data2.usage
    };
  } catch (e) {
    const msg = String(e?.message || "");
    fallbackToFetch = !/^HTTP \d+/.test(msg);
    if (!fallbackToFetch) throw e;
  }
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err.error) msg += `: ${typeof err.error === "string" ? err.error : err.error.message || JSON.stringify(err.error)}`;
    } catch (_) {
    }
    throw new Error(`MiMo API \u8C03\u7528\u5931\u8D25: ${msg}`);
  }
  const data = await res.json();
  const audioData = data.choices?.[0]?.message?.audio;
  if (!audioData?.data) throw new Error("\u54CD\u5E94\u7F3A\u5C11 audio.data");
  return {
    audioBase64: audioData.data,
    transcript: audioData.transcript || "",
    usage: data.usage
  };
}
var styles = {
  container: { padding: 14, display: "flex", flexDirection: "column", height: "100%", gap: 10, overflow: "auto" },
  tabs: { display: "flex", gap: 6, borderBottom: "1px solid #3F3F46", paddingBottom: 8 },
  tab: (active) => ({
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid #3F3F46",
    background: active ? "#3B82F6" : "#2D2D33",
    color: active ? "#fff" : "#B4B4B8"
  }),
  label: { fontSize: 11, color: "#8E8E93", marginBottom: 4 },
  input: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 90, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" },
  select: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12 },
  btn: (primary = false) => ({
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    background: primary ? "#3B82F6" : "#2D2D33",
    color: primary ? "#fff" : "#B4B4B8",
    border: primary ? "none" : "1px solid #3F3F46"
  }),
  card: { padding: 10, borderRadius: 8, border: "1px solid #3F3F46", background: "#25252B", display: "flex", flexDirection: "column", gap: 8 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  statusOk: { fontSize: 12, color: "#4ADE80", padding: 4 },
  statusErr: { fontSize: 12, color: "#F87171", padding: 4 },
  badge: { fontSize: 11, color: "#FBBF24", border: "1px solid #FBBF24", borderRadius: 4, padding: "2px 8px", display: "inline-block" }
};
function Field({ label, children }) {
  return /* @__PURE__ */ jsxs("div", { style: styles.field, children: [
    /* @__PURE__ */ jsx("div", { style: styles.label, children: label }),
    children
  ] });
}
function Player({ url, label }) {
  return /* @__PURE__ */ jsxs("div", { style: styles.row, children: [
    /* @__PURE__ */ jsx("audio", { controls: true, src: url, style: { height: 32, flex: 1, minWidth: 0 } }),
    label && /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: label })
  ] });
}
function MimoTtsPanel({ pluginId }) {
  const [tab, setTab] = useState("config");
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState(null);
  const [synthText, setSynthText] = useState("");
  const [synthVoice, setSynthVoice] = useState("\u51B0\u7CD6");
  const [synthStyle, setSynthStyle] = useState("");
  const [synthBusy, setSynthBusy] = useState(false);
  const [synthUrl, setSynthUrl] = useState("");
  const [synthErr, setSynthErr] = useState("");
  const [designDesc, setDesignDesc] = useState("");
  const [designText, setDesignText] = useState("");
  const [designBusy, setDesignBusy] = useState(false);
  const [designUrl, setDesignUrl] = useState("");
  const [designErr, setDesignErr] = useState("");
  const [cloneSampleName, setCloneSampleName] = useState("");
  const [cloneSampleB64, setCloneSampleB64] = useState("");
  const [cloneText, setCloneText] = useState("");
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneErr, setCloneErr] = useState("");
  const [history, setHistory] = useState([]);
  const [historyMsg, setHistoryMsg] = useState("");
  useEffect(() => {
    loadConfig().then((c) => {
      setCfg(c);
      setSynthVoice(c.defaultVoice || "\u51B0\u7CD6");
    }).catch((e) => setCfgMsg({ ok: false, text: `\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25: ${e}` }));
  }, []);
  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`${LOCAL_AUDIO_BASE}/audio/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      setHistory(items);
      setHistoryMsg("");
    } catch (e) {
      setHistoryMsg(`\u65E0\u6CD5\u8FDE\u63A5\u672C\u5730\u97F3\u9891\u670D\u52A1\uFF08${e}\uFF09\u3002\u8BF7\u786E\u8BA4\u63D2\u4EF6\u670D\u52A1\u300Cmimo-tts-audio\u300D\u5DF2\u542F\u52A8\u3002`);
    }
  }, []);
  useEffect(() => {
    if (tab === "history") refreshHistory();
  }, [tab, refreshHistory]);
  async function handleSaveCfg() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveConfig({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        defaultVoice: cfg.defaultVoice,
        outputMode: cfg.outputMode
      });
      setCfgMsg({ ok: true, text: "\u914D\u7F6E\u5DF2\u4FDD\u5B58" });
    } catch (e) {
      setCfgMsg({ ok: false, text: `\u4FDD\u5B58\u5931\u8D25: ${e}` });
    } finally {
      setSaving(false);
    }
  }
  async function handleTest() {
    if (!cfg) return;
    setCfgMsg(null);
    setSaving(true);
    try {
      const r = await callTts(cfg, "mimo-v2.5-tts", [
        { role: "user", content: "\u5E73\u9759\u81EA\u7136\u7684\u8BED\u6C14" },
        { role: "assistant", content: "\u8BED\u97F3\u8FDE\u63A5\u6D4B\u8BD5\u6210\u529F\u3002" }
      ], { voice: cfg.defaultVoice || "\u51B0\u7CD6" });
      setCfgMsg({ ok: true, text: `\u8FDE\u63A5\u6210\u529F\uFF0C\u751F\u6210\u97F3\u9891 ${Math.round(r.audioBase64.length * 3 / 4 / 1024)} KB\uFF08\u9650\u65F6\u514D\u8D39\uFF09` });
    } catch (e) {
      setCfgMsg({ ok: false, text: `${e}` });
    } finally {
      setSaving(false);
    }
  }
  async function handleSynth() {
    if (!cfg) return;
    if (!synthText.trim()) {
      setSynthErr("\u8BF7\u8F93\u5165\u5F85\u5408\u6210\u6587\u672C");
      return;
    }
    setSynthBusy(true);
    setSynthErr("");
    setSynthUrl("");
    try {
      const messages = [];
      if (synthStyle.trim()) messages.push({ role: "user", content: synthStyle.trim() });
      messages.push({ role: "assistant", content: synthText.trim() });
      const r = await callTts(cfg, "mimo-v2.5-tts", messages, { voice: synthVoice });
      setSynthUrl(`data:audio/wav;base64,${r.audioBase64}`);
    } catch (e) {
      setSynthErr(`${e}`);
    } finally {
      setSynthBusy(false);
    }
  }
  async function handleDesign() {
    if (!cfg) return;
    if (!designDesc.trim() || !designText.trim()) {
      setDesignErr("\u97F3\u8272\u63CF\u8FF0\u4E0E\u5408\u6210\u6587\u672C\u90FD\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    setDesignBusy(true);
    setDesignErr("");
    setDesignUrl("");
    try {
      const r = await callTts(cfg, "mimo-v2.5-tts-voicedesign", [
        { role: "user", content: designDesc.trim() },
        { role: "assistant", content: designText.trim() }
      ], { optimize_text_preview: true });
      setDesignUrl(`data:audio/wav;base64,${r.audioBase64}`);
    } catch (e) {
      setDesignErr(`${e}`);
    } finally {
      setDesignBusy(false);
    }
  }
  function handleCloneFile(file) {
    if (!file) return;
    if (!/\.(mp3|wav)$/i.test(file.name)) {
      setCloneErr("\u4EC5\u652F\u6301 mp3 / wav \u683C\u5F0F");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCloneErr("\u6837\u672C\u4E0D\u80FD\u8D85\u8FC7 10MB\uFF08base64 \u4E0A\u9650\uFF09");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setCloneSampleB64(dataUrl);
      setCloneSampleName(file.name);
      setCloneErr("");
    };
    reader.onerror = () => setCloneErr("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25");
    reader.readAsDataURL(file);
  }
  async function handleClone() {
    if (!cfg) return;
    if (!cloneSampleB64) {
      setCloneErr("\u8BF7\u5148\u9009\u62E9\u97F3\u9891\u6837\u672C");
      return;
    }
    if (!cloneText.trim()) {
      setCloneErr("\u8BF7\u8F93\u5165\u5408\u6210\u6587\u672C");
      return;
    }
    setCloneBusy(true);
    setCloneErr("");
    setCloneUrl("");
    try {
      const r = await callTts(cfg, "mimo-v2.5-tts-voiceclone", [
        { role: "user", content: "" },
        { role: "assistant", content: cloneText.trim() }
      ], { voice: cloneSampleB64 });
      setCloneUrl(`data:audio/wav;base64,${r.audioBase64}`);
    } catch (e) {
      setCloneErr(`${e}`);
    } finally {
      setCloneBusy(false);
    }
  }
  if (!cfg) {
    return /* @__PURE__ */ jsx("div", { style: styles.container, children: /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "#8E8E93" }, children: [
      "\u52A0\u8F7D\u914D\u7F6E\u4E2D\u2026\uFF08\u63D2\u4EF6 ",
      pluginId,
      "\uFF09"
    ] }) });
  }
  return /* @__PURE__ */ jsxs("div", { style: styles.container, children: [
    /* @__PURE__ */ jsxs("div", { style: styles.row, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: 14, fontWeight: 600, color: "#F8F8F8" }, children: "MiMo \u8BED\u97F3\u5408\u6210" }),
      /* @__PURE__ */ jsx("span", { style: styles.badge, children: "\u{1F381} \u9650\u65F6\u514D\u8D39" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: styles.tabs, children: ["config", "synth", "workshop", "history"].map((t) => /* @__PURE__ */ jsx("button", { style: styles.tab(tab === t), onClick: () => setTab(t), children: { config: "\u914D\u7F6E", synth: "\u5408\u6210", workshop: "\u97F3\u8272\u5DE5\u574A", history: "\u5386\u53F2" }[t] }, t)) }),
    tab === "config" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ jsx(Field, { label: "API Key\uFF08https://mimo.mi.com \u83B7\u53D6\uFF09", children: /* @__PURE__ */ jsx(
        "input",
        {
          style: styles.input,
          type: "password",
          value: cfg.apiKey,
          placeholder: "sk-\u2026",
          onChange: (e) => setCfg({ ...cfg, apiKey: e.target.value })
        }
      ) }),
      /* @__PURE__ */ jsx(Field, { label: "API \u7AEF\u70B9", children: /* @__PURE__ */ jsx(
        "input",
        {
          style: styles.input,
          value: cfg.baseUrl,
          placeholder: "https://api.xiaomimimo.com/v1",
          onChange: (e) => setCfg({ ...cfg, baseUrl: e.target.value })
        }
      ) }),
      /* @__PURE__ */ jsx(Field, { label: "\u9ED8\u8BA4\u97F3\u8272", children: /* @__PURE__ */ jsx("select", { style: styles.select, value: cfg.defaultVoice, onChange: (e) => setCfg({ ...cfg, defaultVoice: e.target.value }), children: PRESET_VOICES.map((v) => /* @__PURE__ */ jsx("option", { value: v.value, children: v.label }, v.value)) }) }),
      /* @__PURE__ */ jsx(Field, { label: "\u97F3\u9891\u8F93\u51FA\u65B9\u5F0F", children: /* @__PURE__ */ jsxs("select", { style: styles.select, value: cfg.outputMode, onChange: (e) => setCfg({ ...cfg, outputMode: e.target.value }), children: [
        /* @__PURE__ */ jsx("option", { value: "file", children: "\u4FDD\u5B58\u6587\u4EF6\u5E76\u8FD4\u56DE\u8DEF\u5F84\uFF08\u63A8\u8350\uFF0C\u804A\u5929\u5361\u7247\u53EF\u64AD\u653E\uFF09" }),
        /* @__PURE__ */ jsx("option", { value: "base64", children: "\u8FD4\u56DE base64 \u5185\u8054" })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { style: styles.row, children: [
        /* @__PURE__ */ jsx("button", { style: styles.btn(true), onClick: handleSaveCfg, disabled: saving, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u914D\u7F6E" }),
        /* @__PURE__ */ jsx("button", { style: styles.btn(), onClick: handleTest, disabled: saving, children: "\u6D4B\u8BD5\u8FDE\u63A5" })
      ] }),
      cfgMsg && /* @__PURE__ */ jsx("div", { style: cfgMsg.ok ? styles.statusOk : styles.statusErr, children: cfgMsg.text })
    ] }),
    tab === "synth" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ jsx(Field, { label: "\u97F3\u8272", children: /* @__PURE__ */ jsx("select", { style: styles.select, value: synthVoice, onChange: (e) => setSynthVoice(e.target.value), children: PRESET_VOICES.map((v) => /* @__PURE__ */ jsx("option", { value: v.value, children: v.label }, v.value)) }) }),
      /* @__PURE__ */ jsx(Field, { label: "\u98CE\u683C\u6307\u4EE4\uFF08\u53EF\u9009\uFF0C\u5982\u300C\u5F00\u5FC3\u96C0\u8DC3\u300D\u300C\u4F4E\u6C89\u5A01\u4E25\u300D\uFF1B\u4E5F\u53EF\u5728\u6587\u672C\u4E2D\u7528 (\u6175\u61D2)[\u7D27\u5F20] \u6807\u7B7E\uFF09", children: /* @__PURE__ */ jsx(
        "input",
        {
          style: styles.input,
          value: synthStyle,
          placeholder: "\u6E29\u67D4\u8212\u7F13\u7684\u8BED\u6C14\uFF0C\u50CF\u5728\u54C4\u4EBA\u7761\u89C9",
          onChange: (e) => setSynthStyle(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsx(Field, { label: "\u5F85\u5408\u6210\u6587\u672C", children: /* @__PURE__ */ jsx(
        "textarea",
        {
          style: styles.textarea,
          value: synthText,
          placeholder: "\u8F93\u5165\u8981\u5408\u6210\u8BED\u97F3\u7684\u6587\u672C\u2026",
          onChange: (e) => setSynthText(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsx("div", { style: styles.row, children: /* @__PURE__ */ jsx("button", { style: styles.btn(true), onClick: handleSynth, disabled: synthBusy, children: synthBusy ? "\u5408\u6210\u4E2D\u2026\uFF08\u7EA65-10\u79D2\uFF09" : "\u5408\u6210\u8BED\u97F3" }) }),
      synthErr && /* @__PURE__ */ jsx("div", { style: styles.statusErr, children: synthErr }),
      synthUrl && /* @__PURE__ */ jsx(Player, { url: synthUrl, label: "\u8BD5\u542C" })
    ] }),
    tab === "workshop" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
      /* @__PURE__ */ jsxs("div", { style: styles.card, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 600, color: "#F8F8F8" }, children: "\u2460 \u6587\u672C\u8BBE\u8BA1\u97F3\u8272\uFF08voicedesign\uFF09" }),
        /* @__PURE__ */ jsx(Field, { label: "\u97F3\u8272\u63CF\u8FF0\uFF081-4\u53E5\uFF1A\u6027\u522B\u5E74\u9F84/\u8D28\u611F/\u60C5\u7EEA/\u8BED\u901F\uFF09", children: /* @__PURE__ */ jsx(
          "textarea",
          {
            style: styles.textarea,
            value: designDesc,
            placeholder: "\u4E00\u4F4D\u4E94\u5341\u591A\u5C81\u7684\u4E2D\u5E74\u7537\u6027\uFF0C\u55D3\u97F3\u7565\u5E26\u6C99\u54D1\u6CA7\u6851\uFF0C\u8BED\u901F\u7F13\u6162\u6C89\u7A33",
            onChange: (e) => setDesignDesc(e.target.value)
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { label: "\u5408\u6210\u6587\u672C", children: /* @__PURE__ */ jsx(
          "textarea",
          {
            style: styles.textarea,
            value: designText,
            placeholder: "\u8001\u8BDD\u8BF4\u5F97\u597D\uFF0C\u65E5\u5B50\u8981\u6162\u6162\u8FC7\u2026",
            onChange: (e) => setDesignText(e.target.value)
          }
        ) }),
        /* @__PURE__ */ jsx("div", { style: styles.row, children: /* @__PURE__ */ jsx("button", { style: styles.btn(true), onClick: handleDesign, disabled: designBusy, children: designBusy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u97F3\u8272\u5E76\u5408\u6210" }) }),
        designErr && /* @__PURE__ */ jsx("div", { style: styles.statusErr, children: designErr }),
        designUrl && /* @__PURE__ */ jsx(Player, { url: designUrl, label: "\u8BD5\u542C" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.card, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: 13, fontWeight: 600, color: "#F8F8F8" }, children: "\u2461 \u97F3\u8272\u514B\u9686\uFF08voiceclone\uFF09" }),
        /* @__PURE__ */ jsxs(Field, { label: "\u97F3\u9891\u6837\u672C\uFF08mp3/wav\uFF0C\u226410MB\uFF09", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              style: styles.input,
              type: "file",
              accept: ".mp3,.wav,audio/mpeg,audio/wav",
              onChange: (e) => {
                const f = e.target.files?.[0];
                if (f) handleCloneFile(f);
              }
            }
          ),
          cloneSampleName && /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#4ADE80" }, children: [
            "\u5DF2\u9009\u62E9: ",
            cloneSampleName
          ] })
        ] }),
        /* @__PURE__ */ jsx(Field, { label: "\u5408\u6210\u6587\u672C", children: /* @__PURE__ */ jsx(
          "textarea",
          {
            style: styles.textarea,
            value: cloneText,
            placeholder: "\u7528\u514B\u9686\u97F3\u8272\u8BF4\u51FA\u7684\u8BDD\u2026",
            onChange: (e) => setCloneText(e.target.value)
          }
        ) }),
        /* @__PURE__ */ jsx("div", { style: styles.row, children: /* @__PURE__ */ jsx("button", { style: styles.btn(true), onClick: handleClone, disabled: cloneBusy || !cloneSampleB64, children: cloneBusy ? "\u514B\u9686\u4E2D\u2026\uFF08\u7EA610-20\u79D2\uFF09" : "\u514B\u9686\u97F3\u8272\u5E76\u5408\u6210" }) }),
        cloneErr && /* @__PURE__ */ jsx("div", { style: styles.statusErr, children: cloneErr }),
        cloneUrl && /* @__PURE__ */ jsx(Player, { url: cloneUrl, label: "\u8BD5\u542C" })
      ] })
    ] }),
    tab === "history" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsxs("div", { style: styles.row, children: [
        /* @__PURE__ */ jsx("button", { style: styles.btn(), onClick: refreshHistory, children: "\u5237\u65B0" }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#8E8E93" }, children: "\u6765\u81EA MCP \u5408\u6210\u4E0E\u672C\u5730\u751F\u6210\u7684\u97F3\u9891\uFF08audio/ \u76EE\u5F55\uFF09" })
      ] }),
      historyMsg && /* @__PURE__ */ jsx("div", { style: styles.statusErr, children: historyMsg }),
      history.length === 0 && !historyMsg && /* @__PURE__ */ jsx("div", { style: { fontSize: 12, color: "#8E8E93", padding: 8 }, children: "\u6682\u65E0\u97F3\u9891\u3002\u7528 AI \u8C03\u7528 mimo_tts_synthesize \u6216\u5728\u6B64\u9762\u677F\u5408\u6210\u540E\uFF0C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }),
      history.map((item) => /* @__PURE__ */ jsxs("div", { style: styles.card, children: [
        /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#8E8E93" }, children: [
          item.name,
          "\uFF08",
          Math.round(item.size / 1024),
          " KB\uFF09"
        ] }),
        /* @__PURE__ */ jsx(Player, { url: item.url }),
        /* @__PURE__ */ jsx("div", { style: styles.row, children: /* @__PURE__ */ jsx("button", { style: styles.btn(), onClick: () => window.open(item.url, "_blank"), children: "\u6253\u5F00" }) })
      ] }, item.name))
    ] })
  ] });
}
export {
  MimoTtsPanel as default
};
