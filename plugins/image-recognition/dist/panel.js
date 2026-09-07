// src/Panel.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var PLUGIN_ID = "image-recognition";
async function tauriInvoke(cmd, args = {}) {
  const internals = window.__TAURI_INTERNALS__;
  if (internals?.invoke) return internals.invoke(cmd, args);
  throw new Error("\u9700\u5728 Polaris \u684C\u9762\u73AF\u5883\u8FD0\u884C");
}
async function hostInvoke(cmd, args = {}) {
  const invoker = window.__POLARIS_HOST_INVOKE__;
  if (invoker) return invoker(cmd, args);
  throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF08\u9700\u5728 Polaris \u5185\u8FD0\u884C\uFF09");
}
async function loadConfigApi() {
  let cfg;
  try {
    cfg = await hostInvoke("plugin_get_config", { pluginId: PLUGIN_ID });
  } catch (_) {
    cfg = await tauriInvoke("plugin_get_config", { pluginId: PLUGIN_ID });
  }
  return {
    apiKey: cfg.apiKey || "",
    model: cfg.model || "glm-4v-flash",
    baseUrl: cfg.baseUrl || "https://open.bigmodel.cn/api/paas/v4"
  };
}
async function saveConfigApi(patch) {
  try {
    await hostInvoke("plugin_set_config", { pluginId: PLUGIN_ID, patch });
  } catch (_) {
    await tauriInvoke("plugin_set_config", { pluginId: PLUGIN_ID, patch });
  }
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25"));
    reader.readAsDataURL(file);
  });
}
async function callVision(cfg, imageUrl, prompt, maxTokens = 1e3) {
  if (!cfg.apiKey) throw new Error("\u672A\u914D\u7F6E API Key");
  const baseUrl = (cfg.baseUrl || "https://open.bigmodel.cn/api/paas/v4").trim().replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model || "glm-4v-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }],
      temperature: 0.2,
      stream: false,
      max_tokens: maxTokens
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      const e = JSON.parse(text);
      detail = e.error?.message || e.msg || detail;
    } catch (_) {
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return extractAnswer(content);
}
function extractAnswer(content) {
  if (typeof content !== "string") return JSON.stringify(content);
  const m = content.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (m) return m[1].trim();
  return content.replace(/workingUF[\s\S]*?(?=<answer|$)/gi, "").trim() || content;
}
function ImageRecognitionPanel({ pluginId: _pluginId }) {
  const [tab, setTab] = useState("config");
  const [config, setConfig] = useState({ apiKey: "", model: "glm-4v-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4" });
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  useEffect(() => {
    loadConfigApi().then((cfg) => {
      setConfig(cfg);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);
  const updateField = useCallback((field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }, []);
  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      await saveConfigApi({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2e3);
    } catch (e) {
      setSaveStatus("idle");
      alert(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e instanceof Error ? e.message : e}`);
    }
  }, [config]);
  if (!loaded) {
    return /* @__PURE__ */ jsx("div", { style: { ...containerStyle, justifyContent: "center", alignItems: "center", color: "#8b949e" }, children: "\u52A0\u8F7D\u914D\u7F6E\u4E2D..." });
  }
  return /* @__PURE__ */ jsxs("div", { style: containerStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { style: { margin: 0, fontSize: "17px", fontWeight: 600 }, children: "\u56FE\u7247\u8BC6\u522B" }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "11px", color: "#8b949e", marginTop: "3px" }, children: "\u667A\u8C31 GLM-4V \xB7 \u89C6\u89C9\u6A21\u578B" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "4px" }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setTab("config"),
            style: { ...tabBtnStyle, ...tab === "config" ? tabActiveStyle : {} },
            children: "\u914D\u7F6E"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setTab("recognize"),
            style: { ...tabBtnStyle, ...tab === "recognize" ? tabActiveStyle : {} },
            children: "\u8BC6\u522B"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "auto", minHeight: 0 }, children: tab === "config" ? /* @__PURE__ */ jsx(ConfigTab, { config, updateField, onSave: handleSave, saveStatus }) : /* @__PURE__ */ jsx(RecognizeTab, { config }) })
  ] });
}
function ConfigTab({ config, updateField, onSave, saveStatus }) {
  const [test, setTest] = useState({ status: "idle", message: "" });
  const handleTest = useCallback(async () => {
    if (!config.apiKey) {
      setTest({ status: "err", message: "\u8BF7\u5148\u586B\u5165 API Key" });
      return;
    }
    setTest({ status: "testing", message: "\u6B63\u5728\u6D4B\u8BD5\u8FDE\u63A5..." });
    const t0 = Date.now();
    try {
      const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model || "glm-4v-flash",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
          stream: false
        })
      });
      const latency = Date.now() - t0;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const content = data?.choices?.[0]?.message?.content;
        if (content !== void 0) {
          setTest({ status: "ok", message: `\u2713 \u8FDE\u63A5\u6210\u529F\uFF08${latency}ms\uFF09`, latency });
        } else {
          setTest({ status: "err", message: `\u2717 \u54CD\u5E94\u5F02\u5E38\uFF1A\u672A\u8FD4\u56DE content`, latency });
        }
      } else {
        const text = await res.text().catch(() => "");
        let detail = text.slice(0, 200);
        try {
          const e = JSON.parse(text);
          detail = e.error?.message || e.msg || detail;
        } catch (_) {
        }
        setTest({ status: "err", message: `\u2717 \u8FDE\u63A5\u5931\u8D25\uFF1AHTTP ${res.status} ${detail}`, latency });
      }
    } catch (e) {
      setTest({ status: "err", message: `\u2717 \u8FDE\u63A5\u5931\u8D25\uFF1A${e instanceof Error ? e.message : e}` });
    }
  }, [config]);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: [
    /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
      /* @__PURE__ */ jsxs("label", { style: labelStyle, children: [
        "API Key ",
        /* @__PURE__ */ jsx("span", { style: { color: "#f85149" }, children: "*" })
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "password",
          style: inputStyle,
          value: config.apiKey,
          onChange: (e) => updateField("apiKey", e.target.value),
          placeholder: "\u667A\u8C31\u5F00\u653E\u5E73\u53F0 API Key"
        }
      ),
      /* @__PURE__ */ jsx("div", { style: hintStyle, children: "\u5728 https://open.bigmodel.cn \u63A7\u5236\u53F0\u83B7\u53D6" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
      /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u6A21\u578B" }),
      /* @__PURE__ */ jsxs(
        "select",
        {
          style: inputStyle,
          value: config.model,
          onChange: (e) => updateField("model", e.target.value),
          children: [
            /* @__PURE__ */ jsx("option", { value: "glm-4v-flash", children: "GLM-4V-Flash\uFF08\u5FEB\u901F\uFF0C~5s\uFF09" }),
            /* @__PURE__ */ jsx("option", { value: "glm-4.1v-thinking-flash", children: "GLM-4.1V-Thinking-Flash\uFF08\u5E26\u63A8\u7406\uFF09" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
      /* @__PURE__ */ jsx("label", { style: labelStyle, children: "API \u7AEF\u70B9" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          style: inputStyle,
          value: config.baseUrl,
          onChange: (e) => updateField("baseUrl", e.target.value),
          placeholder: "https://open.bigmodel.cn/api/paas/v4"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px", marginTop: "4px" }, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleTest,
          disabled: test.status === "testing" || !config.apiKey,
          style: {
            ...btnStyle,
            background: "#1f6feb",
            color: "#fff",
            opacity: test.status === "testing" || !config.apiKey ? 0.5 : 1
          },
          children: test.status === "testing" ? "\u6D4B\u8BD5\u4E2D..." : "\u6D4B\u8BD5\u8FDE\u63A5"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: onSave,
          disabled: saveStatus === "saving",
          style: { ...btnStyle, background: "#238636", color: "#fff" },
          children: saveStatus === "saving" ? "\u4FDD\u5B58\u4E2D..." : saveStatus === "saved" ? "\u2713 \u5DF2\u4FDD\u5B58" : "\u4FDD\u5B58\u914D\u7F6E"
        }
      )
    ] }),
    test.status !== "idle" && /* @__PURE__ */ jsx("div", { style: {
      padding: "8px 12px",
      borderRadius: "6px",
      fontSize: "12px",
      background: test.status === "ok" ? "#0d2818" : test.status === "err" ? "#3d1f1f" : "#1c1c1c",
      border: `1px solid ${test.status === "ok" ? "#3fb950" : test.status === "err" ? "#f85149" : "#373e47"}`,
      color: test.status === "ok" ? "#3fb950" : test.status === "err" ? "#f85149" : "#8b949e",
      wordBreak: "break-all"
    }, children: test.message }),
    /* @__PURE__ */ jsxs("div", { style: {
      padding: "10px 12px",
      background: "#161b22",
      border: "1px solid #373e47",
      borderRadius: "6px",
      fontSize: "12px",
      color: "#8b949e",
      lineHeight: 1.6
    }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: "#c9d1d9", marginBottom: "6px" }, children: "\u4F7F\u7528\u8BF4\u660E" }),
      /* @__PURE__ */ jsxs("div", { children: [
        "\xB7 MCP \u5DE5\u5177 ",
        /* @__PURE__ */ jsx("code", { style: codeStyle, children: "recognize_image" }),
        " \u652F\u6301 AI \u76F4\u63A5\u8C03\u7528"
      ] }),
      /* @__PURE__ */ jsx("div", { children: "\xB7 \u672C\u5730\u56FE\u7247\u81EA\u52A8\u8F6C base64 \u4E0A\u4F20\uFF0C\u5355\u5F20\u7EA6\u6D88\u8017 2700 tokens" }),
      /* @__PURE__ */ jsx("div", { children: "\xB7 URL \u56FE\u7247\u76F4\u63A5\u900F\u4F20\uFF0C\u4E0D\u5360\u672C\u5730\u5E26\u5BBD" }),
      /* @__PURE__ */ jsxs("div", { children: [
        "\xB7 Thinking \u6A21\u578B\u4F1A\u8FC7\u6EE4\u63A8\u7406\u8FC7\u7A0B\uFF0C\u4EC5\u8FD4\u56DE ",
        /* @__PURE__ */ jsx("code", { style: codeStyle, children: "<answer>" }),
        " \u7ED3\u8BBA"
      ] })
    ] })
  ] });
}
function RecognizeTab({ config }) {
  const [preview, setPreview] = useState(null);
  const [dataUrl, setDataUrl] = useState(null);
  const [prompt, setPrompt] = useState("\u8BF7\u8BC6\u522B\u8FD9\u5F20\u56FE\u7247\uFF0C\u7B80\u8981\u63CF\u8FF0\u4E3B\u8981\u5185\u5BB9\u3002");
  const [result, setResult] = useState({ status: "idle", text: "" });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const handleFile = useCallback(async (file) => {
    if (!file.type.startsWith("image/")) {
      setResult({ status: "err", text: "\u8BF7\u9009\u62E9\u56FE\u7247\u6587\u4EF6" });
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setPreview(url);
      setDataUrl(url);
      setResult({ status: "idle", text: "" });
    } catch (e) {
      setResult({ status: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);
  const handleSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);
  const handleRecognize = useCallback(async () => {
    if (!dataUrl) {
      setResult({ status: "err", text: "\u8BF7\u5148\u9009\u62E9\u56FE\u7247" });
      return;
    }
    if (!config.apiKey) {
      setResult({ status: "err", text: "\u8BF7\u5148\u5728\u914D\u7F6E\u9875\u586B\u5165 API Key" });
      return;
    }
    setResult({ status: "running", text: "\u8BC6\u522B\u4E2D..." });
    const t0 = Date.now();
    try {
      const text = await callVision(config, dataUrl, prompt);
      setResult({ status: "ok", text, latency: Date.now() - t0 });
    } catch (e) {
      setResult({ status: "err", text: e instanceof Error ? e.message : String(e), latency: Date.now() - t0 });
    }
  }, [config, dataUrl, prompt]);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        onDrop: handleDrop,
        onDragOver: (e) => {
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: () => setDragOver(false),
        onClick: () => fileInputRef.current?.click(),
        style: {
          border: `2px dashed ${dragOver ? "#58a6ff" : "#373e47"}`,
          borderRadius: "8px",
          padding: "20px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "#161b22" : "transparent",
          transition: "all 0.2s",
          minHeight: preview ? "auto" : "120px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px"
        },
        children: [
          preview ? /* @__PURE__ */ jsx("img", { src: preview, alt: "\u9884\u89C8", style: { maxWidth: "100%", maxHeight: "240px", borderRadius: "6px", objectFit: "contain" } }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: "32px" }, children: "\u{1F5BC}" }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "13px", color: "#8b949e" }, children: "\u62D6\u62FD\u56FE\u7247\u5230\u6B64\u5904\uFF0C\u6216\u70B9\u51FB\u9009\u62E9" })
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: "image/*",
              onChange: handleSelect,
              style: { display: "none" }
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: fieldStyle, children: [
      /* @__PURE__ */ jsx("label", { style: labelStyle, children: "\u8BC6\u522B\u6307\u4EE4" }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          style: { ...inputStyle, minHeight: "60px", resize: "vertical", fontFamily: "system-ui" },
          value: prompt,
          onChange: (e) => setPrompt(e.target.value),
          placeholder: "\u8BF7\u8BC6\u522B\u8FD9\u5F20\u56FE\u7247\uFF0C\u7B80\u8981\u63CF\u8FF0\u4E3B\u8981\u5185\u5BB9\u3002"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleRecognize,
        disabled: result.status === "running" || !dataUrl || !config.apiKey,
        style: {
          ...btnStyle,
          background: "#238636",
          color: "#fff",
          opacity: result.status === "running" || !dataUrl || !config.apiKey ? 0.5 : 1
        },
        children: result.status === "running" ? "\u8BC6\u522B\u4E2D..." : "\u5F00\u59CB\u8BC6\u522B"
      }
    ),
    result.status !== "idle" && /* @__PURE__ */ jsxs("div", { style: {
      padding: "12px",
      borderRadius: "6px",
      background: result.status === "ok" ? "#0d2818" : result.status === "err" ? "#3d1f1f" : "#1c1c1c",
      border: `1px solid ${result.status === "ok" ? "#3fb950" : result.status === "err" ? "#f85149" : "#373e47"}`,
      fontSize: "13px",
      color: result.status === "ok" ? "#c9d1d9" : result.status === "err" ? "#f85149" : "#8b949e",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      lineHeight: 1.6
    }, children: [
      result.status === "running" && /* @__PURE__ */ jsx("span", { children: result.text }),
      result.status === "ok" && /* @__PURE__ */ jsxs(Fragment, { children: [
        result.latency && /* @__PURE__ */ jsxs("div", { style: { fontSize: "11px", color: "#3fb950", marginBottom: "6px" }, children: [
          "\u2713 \u8BC6\u522B\u5B8C\u6210\uFF08",
          result.latency,
          "ms\uFF09"
        ] }),
        result.text
      ] }),
      result.status === "err" && result.text
    ] })
  ] });
}
var containerStyle = {
  padding: "16px",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, sans-serif",
  fontSize: "14px",
  color: "#e1e4e8",
  background: "#0d1117"
};
var btnStyle = {
  padding: "7px 16px",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 500,
  background: "#373e47",
  color: "#e1e4e8"
};
var tabBtnStyle = {
  padding: "5px 12px",
  border: "1px solid #373e47",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 500,
  background: "#2d333b",
  color: "#8b949e"
};
var tabActiveStyle = {
  background: "#1f6feb",
  color: "#fff",
  borderColor: "#1f6feb"
};
var fieldStyle = { display: "flex", flexDirection: "column", gap: "5px" };
var labelStyle = {
  fontSize: "13px",
  fontWeight: 500,
  color: "#c9d1d9"
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
var hintStyle = {
  fontSize: "11px",
  color: "#6e7681"
};
var codeStyle = {
  padding: "1px 5px",
  background: "#2d333b",
  borderRadius: "3px",
  fontSize: "11px",
  fontFamily: "monospace",
  color: "#58a6ff"
};
export {
  ImageRecognitionPanel as default
};
