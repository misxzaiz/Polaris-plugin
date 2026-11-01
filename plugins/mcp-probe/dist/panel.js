var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/probe-core.js
var require_probe_core = __commonJS({
  "shared/probe-core.js"(exports, module) {
    "use strict";
    function newId(prefix) {
      const t = Date.now().toString(36);
      const r = Math.random().toString(36).slice(2, 7);
      return `${prefix || "id"}-${t}${r}`;
    }
    function stableStringify(value) {
      if (value === null || typeof value !== "object") return JSON.stringify(value);
      if (Array.isArray(value)) {
        const items = value.map((v) => v === void 0 ? "null" : stableStringify(v));
        return `[${items.join(",")}]`;
      }
      const keys = Object.keys(value).filter((k) => value[k] !== void 0).sort();
      const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
      return `{${parts.join(",")}}`;
    }
    function deriveFormModel2(schema) {
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return { mode: "json", fields: [], placeholder: "{}" };
      }
      if (schema.type !== "object" || !schema.properties || typeof schema.properties !== "object") {
        return { mode: "json", fields: [], placeholder: sampleJson(schema) };
      }
      const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
      const fields = [];
      for (const [name, prop] of Object.entries(schema.properties)) {
        const p = prop && typeof prop === "object" && !Array.isArray(prop) ? prop : {};
        let type = typeof p.type === "string" ? p.type : "";
        if (Array.isArray(p.type)) {
          const nonNull = p.type.filter((t) => t !== "null");
          type = nonNull.length === 1 ? nonNull[0] : "json";
        }
        if (!type && Array.isArray(p.enum) && p.enum.length) type = "string";
        if (!type || type === "object" || type === "array" || type === "null") type = "json";
        const isEnum = Array.isArray(p.enum) && p.enum.length > 0;
        fields.push({
          name,
          path: name,
          type: isEnum ? "enum" : type,
          required: requiredSet.has(name),
          enum: isEnum ? p.enum : void 0,
          default: p.default,
          description: typeof p.description === "string" ? p.description : "",
          placeholder: type === "json" ? sampleJson(p) : ""
        });
      }
      return { mode: "fields", fields };
    }
    function sampleJson(schema) {
      if (!schema || typeof schema !== "object") return "";
      if (schema.default !== void 0) {
        try {
          return JSON.stringify(schema.default, null, 2);
        } catch (_) {
        }
      }
      if (Array.isArray(schema.enum) && schema.enum.length) {
        try {
          return JSON.stringify(schema.enum[0], null, 2);
        } catch (_) {
        }
      }
      switch (schema.type) {
        case "array":
          return "[]";
        case "object":
          return "{}";
        case "string":
          return '""';
        case "number":
        case "integer":
          return "0";
        case "boolean":
          return "false";
        default:
          return "";
      }
    }
    function diffToolsets(a, b) {
      const mapA = toolMap(a);
      const mapB = toolMap(b);
      const added = [];
      const removed = [];
      const changed = [];
      let unchangedCount = 0;
      for (const [name, ta] of mapA) {
        const tb = mapB.get(name);
        if (!tb) {
          removed.push(name);
          continue;
        }
        const fields = [];
        if ((ta.description || "") !== (tb.description || "")) fields.push("description");
        if (stableStringify(ta.inputSchema || null) !== stableStringify(tb.inputSchema || null)) fields.push("schema");
        if (fields.length) changed.push({ name, fields });
        else unchangedCount += 1;
      }
      for (const name of mapB.keys()) {
        if (!mapA.has(name)) added.push(name);
      }
      added.sort();
      removed.sort();
      changed.sort((x, y) => x.name < y.name ? -1 : 1);
      return { added, removed, changed, unchangedCount };
    }
    function toolMap(list) {
      const map = /* @__PURE__ */ new Map();
      for (const t of Array.isArray(list) ? list : []) {
        if (t && typeof t.name === "string") map.set(t.name, t);
      }
      return map;
    }
    function assessToolset(tools) {
      const issues = [];
      const list = Array.isArray(tools) ? tools : [];
      const seen = /* @__PURE__ */ new Map();
      for (const t of list) {
        const name = t && typeof t.name === "string" ? t.name : "";
        if (!name) {
          issues.push({ tool: "(\u672A\u77E5\u540D\u5DE5\u5177)", level: "error", msg: "\u5DE5\u5177\u7F3A\u5C11 name \u6216 name \u975E\u5B57\u7B26\u4E32" });
          continue;
        }
        if (seen.has(name)) {
          issues.push({ tool: name, level: "error", msg: `\u5DE5\u5177\u91CD\u540D\uFF08\u7B2C ${seen.get(name) + 1}\u3001${list.indexOf(t) + 1} \u9879\u540C\u540D\uFF09` });
        } else {
          seen.set(name, list.indexOf(t));
        }
        const desc = typeof t.description === "string" ? t.description.trim() : "";
        if (!desc) {
          issues.push({ tool: name, level: "warn", msg: "\u7F3A\u5C11 description\u2014\u2014\u6A21\u578B\u53EA\u80FD\u9760\u5DE5\u5177\u540D\u731C\u7528\u9014\uFF0C\u5EFA\u8BAE\u8865\u300C\u9002\u7528\uFF1A\u7528\u6237\u8BF4\u2026\u300D\u89E6\u53D1\u8BED" });
        } else if (desc.length < 8) {
          issues.push({ tool: name, level: "warn", msg: `description \u8FC7\u77ED\uFF08${desc.length} \u5B57\u7B26\uFF09\u2014\u2014\u6A21\u578B\u96BE\u4EE5\u5224\u65AD\u4F55\u65F6\u9009\u7528` });
        }
        const schema = t.inputSchema;
        if (schema === void 0 || schema === null) {
          issues.push({ tool: name, level: "warn", msg: "\u7F3A\u5C11 inputSchema\u2014\u2014\u5BA2\u6237\u7AEF\u65E0\u6CD5\u751F\u6210\u53C2\u6570\u8868\u5355\uFF0C\u6A21\u578B\u53EA\u80FD\u76F2\u4F20" });
        } else if (typeof schema !== "object" || Array.isArray(schema)) {
          issues.push({ tool: name, level: "error", msg: "inputSchema \u4E0D\u662F\u5BF9\u8C61\uFF08\u5E94\u4E3A JSON Schema object\uFF09" });
        } else if (schema.type !== "object" && !(schema.properties && typeof schema.properties === "object") && !schema.$ref) {
          issues.push({ tool: name, level: "warn", msg: 'inputSchema \u7F3A\u5C11 type:"object" \u4E14\u65E0 properties\u2014\u2014\u591A\u6570\u5BA2\u6237\u7AEF\u6309\u7A7A\u53C2\u6570\u5904\u7406' });
        }
      }
      return issues;
    }
    function parseSseMessages(text) {
      const out = [];
      const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const events = normalized.split("\n\n");
      for (const evt of events) {
        const dataLines = [];
        for (const line of evt.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).startsWith(" ") ? line.slice(6) : line.slice(5));
          }
        }
        if (!dataLines.length) continue;
        const data = dataLines.join("\n");
        try {
          out.push(JSON.parse(data));
        } catch (_) {
          out.push({ raw: data });
        }
      }
      return out;
    }
    var CMD_SHIMS = /* @__PURE__ */ new Set(["npx", "npm", "pnpm", "yarn", "uvx", "bunx", "pnmx", "tnpx"]);
    function buildSpawnPlan(command, args, platform) {
      const cmd = String(command || "").trim();
      const argList = (Array.isArray(args) ? args : []).map((a) => String(a));
      if (!cmd) return { mode: "direct", file: "", args: argList };
      if (platform !== "win32") return { mode: "direct", file: cmd, args: argList };
      const base = cmd.split(/[\\/]/).pop().toLowerCase();
      if (base.endsWith(".cmd") || base.endsWith(".bat")) {
        return { mode: "shell", commandline: joinWinCommandline(cmd, argList) };
      }
      const stem = base.replace(/\.(exe|com)$/, "");
      if (CMD_SHIMS.has(stem)) {
        return { mode: "shell", commandline: joinWinCommandline(cmd, argList) };
      }
      return { mode: "direct", file: cmd, args: argList };
    }
    function quoteWinArg(s) {
      const str = String(s);
      if (str === "") return '""';
      if (/^[A-Za-z0-9_\-.,:=/\\@%+]+$/.test(str)) return str;
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    function joinWinCommandline(command, args) {
      return [command, ...args].map(quoteWinArg).join(" ");
    }
    function parseClaudeConfig(text, sourcePath) {
      const result = { servers: [], skipped: [] };
      let root;
      try {
        root = JSON.parse(String(text || ""));
      } catch (e) {
        result.skipped.push({ name: "(\u6574\u6587\u4EF6)", reason: `JSON \u89E3\u6790\u5931\u8D25: ${e.message}` });
        return result;
      }
      if (!root || typeof root !== "object" || Array.isArray(root)) {
        result.skipped.push({ name: "(\u6574\u6587\u4EF6)", reason: "\u9876\u5C42\u4E0D\u662F JSON \u5BF9\u8C61" });
        return result;
      }
      const map = root.mcpServers && typeof root.mcpServers === "object" && !Array.isArray(root.mcpServers) ? root.mcpServers : root;
      for (const [name, raw] of Object.entries(map)) {
        const cand = normalizeServerEntry(name, raw, sourcePath);
        if (cand.error) result.skipped.push({ name, reason: cand.error });
        else result.servers.push(cand);
      }
      return result;
    }
    function normalizeServerEntry(name, raw, sourcePath) {
      const key = `${sourcePath || "manual"}#${name}`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { error: "\u6761\u76EE\u4E0D\u662F\u5BF9\u8C61" };
      }
      const type = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
      if (typeof raw.url === "string" && raw.url) {
        if (raw.command || raw.args) return { error: "\u540C\u65F6\u542B url \u4E0E command\uFF0C\u65E0\u6CD5\u5224\u65AD\u4F20\u8F93\u7C7B\u578B" };
        const transport = "http";
        const legacy = type === "sse";
        if (!/^https?:\/\//i.test(raw.url)) return { error: `url \u975E\u6CD5\uFF08\u4EC5\u652F\u6301 http/https\uFF09: ${raw.url}` };
        return {
          key,
          name,
          transport,
          legacy,
          url: raw.url,
          headers: plainObject(raw.headers),
          command: "",
          args: [],
          env: {}
        };
      }
      if (typeof raw.command === "string" && raw.command.trim()) {
        return {
          key,
          name,
          transport: "stdio",
          legacy: false,
          command: raw.command.trim(),
          args: Array.isArray(raw.args) ? raw.args.map(String) : [],
          env: plainObject(raw.env),
          url: "",
          headers: {}
        };
      }
      return { error: type ? `type "${type}" \u6761\u76EE\u7F3A\u5C11 url/command` : "\u6761\u76EE\u7F3A\u5C11 url \u4E0E command" };
    }
    function plainObject(v) {
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
          out[k] = String(val);
        }
      }
      return out;
    }
    var SECRET_KEY_RE = /(token|secret|password|passwd|api[-_]?key|apikey|authorization|credential|cookie|session[-_]?id)/i;
    function isSecretKey(k) {
      return SECRET_KEY_RE.test(String(k || ""));
    }
    function redactValue(obj) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = isSecretKey(k) && typeof v === "string" && v ? "******" : v;
      }
      return out;
    }
    function capList(list, max) {
      const arr = Array.isArray(list) ? list : [];
      return arr.length <= max ? arr : arr.slice(0, max);
    }
    module.exports = {
      newId,
      stableStringify,
      deriveFormModel: deriveFormModel2,
      sampleJson,
      diffToolsets,
      assessToolset,
      parseSseMessages,
      CMD_SHIMS,
      buildSpawnPlan,
      quoteWinArg,
      parseClaudeConfig,
      isSecretKey,
      redactValue,
      capList
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect as useEffect4, useRef as useRef2, useState as useState5 } from "react";

// src/host.ts
function getHostInvoke() {
  const fn = typeof window !== "undefined" ? window.__POLARIS_HOST_INVOKE__ : void 0;
  if (!fn) throw new Error("\u672A\u68C0\u6D4B\u5230 Polaris \u5BBF\u4E3B\u6865\uFF08__POLARIS_HOST_INVOKE__\uFF09\u2014\u2014\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528");
  return fn;
}
async function dispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res?.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result || {};
}
async function kvGet(key) {
  const r = await dispatch("cap.kv", { action: "get", key });
  return r.value !== void 0 ? r.value : null;
}
function workspacePath() {
  const w = typeof window !== "undefined" ? window.__POLARIS_HOST_WORKSPACE__ : void 0;
  if (!w) return "";
  if (typeof w === "string") return w;
  return typeof w.path === "string" ? w.path : "";
}
async function readServiceInfo() {
  try {
    const meta = await kvGet("probe.meta");
    if (meta && typeof meta.port === "number" && typeof meta.token === "string" && meta.token) {
      return meta;
    }
  } catch (_) {
  }
  return null;
}
var SvcError = class extends Error {
  constructor(message, offline) {
    super(message);
    this.offline = offline;
  }
};
async function svcApi(info, method, route, body) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${info.token}`,
        ...body !== void 0 ? { "Content-Type": "application/json" } : {}
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
  } catch (e) {
    throw new SvcError(`\u8C03\u8BD5\u53F0\u670D\u52A1\u4E0D\u53EF\u8FBE\uFF08127.0.0.1:${info.port}\uFF09\uFF1A${e instanceof Error ? e.message : String(e)}`, true);
  }
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new SvcError(`\u670D\u52A1\u8FD4\u56DE\u975E JSON\uFF08HTTP ${res.status}\uFF09`, res.status === 404);
  }
  if (res.status === 401) throw new SvcError("\u670D\u52A1 token \u4E0D\u5339\u914D\uFF08\u670D\u52A1\u53EF\u80FD\u521A\u91CD\u542F\uFF09\u2014\u2014\u5237\u65B0\u9762\u677F\u91CD\u8BD5", true);
  if (res.status !== 200 || parsed.ok !== true) {
    throw new SvcError(String(parsed.error || `HTTP ${res.status}`), false);
  }
  return parsed;
}
async function restartOwnService() {
  await dispatch("cap.pluginServiceManager", { action: "restart", pluginId: "mcp-probe", serviceId: "probe-service" });
}

// src/model.ts
var TABS = [
  { key: "servers", label: "\u670D\u52A1\u5668" },
  { key: "workbench", label: "\u8C03\u8BD5" },
  { key: "health", label: "\u4F53\u68C0" },
  { key: "history", label: "\u5386\u53F2" }
];
function timeAgo(iso) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "?";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1e3));
  if (s < 60) return `${s} \u79D2\u524D`;
  if (s < 3600) return `${Math.floor(s / 60)} \u5206\u949F\u524D`;
  if (s < 86400) return `${Math.floor(s / 3600)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(s / 86400)} \u5929\u524D`;
}
function prettyMs(ms) {
  if (ms == null) return "?";
  if (ms < 1e3) return `${ms}ms`;
  return `${(ms / 1e3).toFixed(2)}s`;
}

// src/ServersTab.tsx
import { useState } from "react";

// src/ui.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Btn(props) {
  const cls = ["mp-btn"];
  if (props.kind && props.kind !== "primary") cls.push(props.kind);
  if (props.sm) cls.push("sm");
  return /* @__PURE__ */ jsx(
    "button",
    {
      className: cls.join(" "),
      onClick: props.onClick,
      disabled: props.disabled,
      title: props.title,
      type: "button",
      children: props.children
    }
  );
}
function Dot({ status }) {
  return /* @__PURE__ */ jsx("span", { className: `mp-dot ${status}` });
}
function Badge({ tone, children }) {
  return /* @__PURE__ */ jsx("span", { className: `mp-badge ${tone}`, children });
}
function Section({ title, hint, children, actions }) {
  return /* @__PURE__ */ jsxs("div", { className: "mp-sec-wrap", children: [
    /* @__PURE__ */ jsxs("div", { className: "mp-sec", children: [
      /* @__PURE__ */ jsx("div", { className: "mp-sec-bar" }),
      /* @__PURE__ */ jsx("span", { className: "mp-sec-t", children: title }),
      hint ? /* @__PURE__ */ jsx("span", { className: "mp-hint", children: hint }) : null,
      actions ? /* @__PURE__ */ jsx("span", { className: "mp-sec-actions", children: actions }) : null
    ] }),
    children
  ] });
}
function JsonView({ text, maxH }) {
  return /* @__PURE__ */ jsx("pre", { className: "mp-json", style: maxH ? { maxHeight: maxH } : void 0, children: text });
}
function Field({ label, children, hint }) {
  return /* @__PURE__ */ jsxs("label", { className: "mp-field", children: [
    /* @__PURE__ */ jsxs("span", { className: "mp-field-l", children: [
      label,
      hint ? /* @__PURE__ */ jsx("i", { className: "mp-field-h", children: hint }) : null
    ] }),
    children
  ] });
}
function Empty({ children }) {
  return /* @__PURE__ */ jsx("div", { className: "mp-empty", children });
}
function ErrorNote({ children }) {
  return /* @__PURE__ */ jsx("div", { className: "mp-err", children });
}
function statusDot(status, poisoned) {
  if (poisoned) return "bad";
  switch (status) {
    case "ready":
      return "ok";
    case "connecting":
      return "warn";
    case "error":
      return "bad";
    default:
      return "idle";
  }
}

// src/ServersTab.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var EMPTY_DRAFT = {
  name: "",
  transport: "stdio",
  command: "",
  argsText: "",
  envText: "",
  url: "",
  headersText: "",
  timeoutMs: "30000"
};
function linesToMap(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}
function mapToLines(m) {
  if (!m) return "";
  return Object.entries(m).map(([k, v]) => `${k}=${v}`).join("\n");
}
function ServersTab({ state, hostServers, api, gotoWorkbench, workspace }) {
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  const [scan, setScan] = useState(null);
  const [wsPath, setWsPath] = useState(workspace);
  const [checked, setChecked] = useState(/* @__PURE__ */ new Set());
  const poolById = new Map((state?.pool || []).map((p) => [p.serverId, p]));
  function editProfile(id) {
    const p = state?.profiles.find((x) => x.id === id);
    if (!p) return;
    setErr("");
    setDraft({
      id: p.id,
      name: p.name,
      transport: p.transport,
      command: p.command,
      argsText: (p.args || []).join("\n"),
      envText: mapToLines(p.env),
      url: p.url,
      headersText: mapToLines(p.headers),
      timeoutMs: String(p.timeoutMs || 3e4)
    });
  }
  async function saveDraft() {
    if (!draft) return;
    setErr("");
    const body = {
      id: draft.id,
      name: draft.name.trim(),
      transport: draft.transport,
      command: draft.command.trim(),
      url: draft.url.trim(),
      args: draft.argsText.split("\n").map((s) => s.trim()).filter(Boolean),
      env: linesToMap(draft.envText),
      headers: linesToMap(draft.headersText),
      timeoutMs: parseInt(draft.timeoutMs, 10) || 3e4
    };
    try {
      await api("POST", "/api/profiles/save", body);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function removeProfile(id) {
    setBusyId(id);
    setErr("");
    try {
      await api("POST", "/api/profiles/delete", { id });
      if (draft?.id === id) setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId("");
    }
  }
  async function connectProfile(id) {
    setBusyId(id);
    setErr("");
    try {
      await api("POST", "/api/connect", { serverId: id, force: false });
      gotoWorkbench(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId("");
    }
  }
  async function runScan(apply, keys) {
    setErr("");
    try {
      const r = await api("POST", "/api/profiles/import-claude", {
        workspace: wsPath.trim(),
        apply,
        keys
      });
      setScan({ found: r.found || [], files: r.files || [] });
      if (apply) setChecked(/* @__PURE__ */ new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx2(Section, { title: "\u5BBF\u4E3B\u63D2\u4EF6 MCP", hint: "\u7ECF cap.mcp \u76F4\u67E5\u6CE8\u518C\u8868\uFF0C\u96F6\u91CD\u590D spawn", children: hostServers.length === 0 ? /* @__PURE__ */ jsx2(Empty, { children: "\u5BBF\u4E3B\u672A\u6CE8\u518C\u4EFB\u4F55\u63D2\u4EF6 MCP \u5DE5\u5177\uFF08\u542F\u7528\u5E26 MCP \u7684\u63D2\u4EF6\u540E\u51FA\u73B0\uFF09" }) : hostServers.map((s) => {
      const sid = `host:${s.server || s.pluginId}`;
      return /* @__PURE__ */ jsx2("div", { className: "mp-card", children: /* @__PURE__ */ jsxs2("div", { className: "mp-card-b", children: [
        /* @__PURE__ */ jsxs2("div", { className: "mp-row", children: [
          /* @__PURE__ */ jsx2(Dot, { status: "ok" }),
          /* @__PURE__ */ jsx2("b", { className: "mp-grow", style: { fontSize: 12.5 }, children: s.server || s.pluginId }),
          /* @__PURE__ */ jsx2("span", { className: "mp-tag", children: s.pluginId }),
          /* @__PURE__ */ jsxs2("span", { className: "mp-tag", children: [
            s.tools.length,
            " \u5DE5\u5177"
          ] }),
          s.injected ? /* @__PURE__ */ jsx2("span", { className: "mp-tag", children: s.injected }) : null,
          /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", onClick: () => gotoWorkbench(sid), children: "\u8C03\u8BD5" })
        ] }),
        s.tools.length ? /* @__PURE__ */ jsxs2("div", { className: "mp-sub", style: { marginTop: 5 }, children: [
          s.tools.slice(0, 6).map((t) => t.name).join(" \xB7 "),
          s.tools.length > 6 ? ` \xB7 \u2026\u5171 ${s.tools.length}` : ""
        ] }) : null
      ] }) }, sid);
    }) }),
    /* @__PURE__ */ jsxs2(
      Section,
      {
        title: "\u5916\u90E8\u670D\u52A1\u5668\u6863\u6848",
        hint: "stdio / streamable HTTP\uFF0C\u8FDE\u63A5\u552F\u4E00\u6240\u6709\u8005\u662F\u540E\u53F0\u670D\u52A1",
        actions: /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", onClick: () => {
            setErr("");
            setDraft({ ...EMPTY_DRAFT });
          }, children: "+ \u65B0\u5EFA" }),
          /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", onClick: () => runScan(false), children: "\u626B\u63CF Claude \u914D\u7F6E" })
        ] }),
        children: [
          !state || state.profiles.length === 0 ? /* @__PURE__ */ jsx2(Empty, { children: "\u6682\u65E0\u5916\u90E8\u6863\u6848\u3002\u65B0\u5EFA\u4E00\u4E2A\uFF0C\u6216\u300C\u626B\u63CF Claude \u914D\u7F6E\u300D\u4E00\u952E\u5BFC\u5165 ~/.claude\u3001.mcp.json \u91CC\u7684 MCP \u670D\u52A1\u5668\u3002" }) : state.profiles.map((p) => {
            const pool = poolById.get(p.id);
            return /* @__PURE__ */ jsx2("div", { className: "mp-card", children: /* @__PURE__ */ jsxs2("div", { className: "mp-card-b", children: [
              /* @__PURE__ */ jsxs2("div", { className: "mp-row", children: [
                /* @__PURE__ */ jsx2(Dot, { status: statusDot(pool?.status, pool?.poisoned) }),
                /* @__PURE__ */ jsx2("b", { className: "mp-grow", style: { fontSize: 12.5 }, children: p.name }),
                /* @__PURE__ */ jsx2("span", { className: "mp-tag", children: p.transport }),
                p.legacy ? /* @__PURE__ */ jsx2("span", { className: "mp-tag", children: "legacy-sse" }) : null,
                pool?.status === "ready" ? /* @__PURE__ */ jsxs2("span", { className: "mp-tag", children: [
                  pool.toolCount,
                  " \u5DE5\u5177"
                ] }) : null,
                p.origin !== "manual" ? /* @__PURE__ */ jsx2("span", { className: "mp-tag", children: p.origin }) : null
              ] }),
              /* @__PURE__ */ jsx2("div", { className: "mp-sub", style: { marginTop: 4 }, children: p.transport === "stdio" ? `${p.command} ${(p.args || []).join(" ")}`.slice(0, 160) : p.url }),
              pool?.lastError ? /* @__PURE__ */ jsx2(ErrorNote, { children: pool.lastError }) : null,
              /* @__PURE__ */ jsxs2("div", { className: "mp-row", style: { marginTop: 7 }, children: [
                /* @__PURE__ */ jsx2(Btn, { sm: true, disabled: busyId === p.id, onClick: () => connectProfile(p.id), children: "\u8FDE\u63A5" }),
                pool && pool.status !== "closed" ? /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", disabled: busyId === p.id, onClick: async () => {
                  setBusyId(p.id);
                  try {
                    await api("POST", "/api/disconnect", { serverId: p.id });
                  } finally {
                    setBusyId("");
                  }
                }, children: "\u65AD\u5F00" }) : null,
                /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", onClick: () => editProfile(p.id), children: "\u7F16\u8F91" }),
                /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "danger", disabled: busyId === p.id, onClick: () => removeProfile(p.id), children: "\u5220\u9664" })
              ] })
            ] }) }, p.id);
          }),
          draft ? /* @__PURE__ */ jsx2("div", { className: "mp-card", style: { borderColor: "#2b6cb0" }, children: /* @__PURE__ */ jsxs2("div", { className: "mp-card-b", children: [
            /* @__PURE__ */ jsx2(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ jsx2("input", { className: "mp-inp", value: draft.name, onChange: (e) => setDraft({ ...draft, name: e.target.value }), placeholder: "\u6211\u7684 MCP \u670D\u52A1\u5668" }) }),
            /* @__PURE__ */ jsx2(Field, { label: "\u4F20\u8F93\u7C7B\u578B", children: /* @__PURE__ */ jsxs2("select", { className: "mp-inp", value: draft.transport, onChange: (e) => setDraft({ ...draft, transport: e.target.value }), children: [
              /* @__PURE__ */ jsx2("option", { value: "stdio", children: "stdio\uFF08\u672C\u5730\u547D\u4EE4\uFF09" }),
              /* @__PURE__ */ jsx2("option", { value: "http", children: "streamable HTTP\uFF08\u8FDC\u7A0B\u7AEF\u70B9\uFF09" })
            ] }) }),
            draft.transport === "stdio" ? /* @__PURE__ */ jsxs2(Fragment, { children: [
              /* @__PURE__ */ jsx2(Field, { label: "\u547D\u4EE4", hint: "npx/uvx \u7B49\u5DF2\u505A Windows \u517C\u5BB9", children: /* @__PURE__ */ jsx2("input", { className: "mp-inp mono", value: draft.command, onChange: (e) => setDraft({ ...draft, command: e.target.value }), placeholder: "npx -y @modelcontextprotocol/server-everything \u62C6\u6210\u547D\u4EE4\u4E0E\u53C2\u6570\u586B" }) }),
              /* @__PURE__ */ jsx2(Field, { label: "\u53C2\u6570", hint: "\u6BCF\u884C\u4E00\u4E2A", children: /* @__PURE__ */ jsx2("textarea", { className: "mp-inp mono", value: draft.argsText, onChange: (e) => setDraft({ ...draft, argsText: e.target.value }), placeholder: "-y\n@modelcontextprotocol/server-everything" }) }),
              /* @__PURE__ */ jsx2(Field, { label: "\u73AF\u5883\u53D8\u91CF", hint: "KEY=value \u6BCF\u884C\u4E00\u6761\uFF1B\u542B token/key \u7684\u503C\u5C55\u793A\u65F6\u8131\u654F", children: /* @__PURE__ */ jsx2("textarea", { className: "mp-inp mono", value: draft.envText, onChange: (e) => setDraft({ ...draft, envText: e.target.value }), placeholder: "API_KEY=xxx" }) })
            ] }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
              /* @__PURE__ */ jsx2(Field, { label: "URL", hint: "streamable HTTP \u7AEF\u70B9", children: /* @__PURE__ */ jsx2("input", { className: "mp-inp mono", value: draft.url, onChange: (e) => setDraft({ ...draft, url: e.target.value }), placeholder: "https://example.com/mcp" }) }),
              /* @__PURE__ */ jsx2(Field, { label: "\u8BF7\u6C42\u5934", hint: "KEY=value \u6BCF\u884C\u4E00\u6761\uFF08\u5982 Authorization=Bearer xxx\uFF0C\u5C55\u793A\u65F6\u8131\u654F\uFF09", children: /* @__PURE__ */ jsx2("textarea", { className: "mp-inp mono", value: draft.headersText, onChange: (e) => setDraft({ ...draft, headersText: e.target.value }), placeholder: "Authorization=Bearer xxx" }) })
            ] }),
            /* @__PURE__ */ jsx2(Field, { label: "\u8C03\u7528\u8D85\u65F6", hint: "\u6BEB\u79D2\uFF083s~300s\uFF09", children: /* @__PURE__ */ jsx2("input", { className: "mp-inp", value: draft.timeoutMs, onChange: (e) => setDraft({ ...draft, timeoutMs: e.target.value }) }) }),
            err ? /* @__PURE__ */ jsx2(ErrorNote, { children: err }) : null,
            /* @__PURE__ */ jsxs2("div", { className: "mp-row", children: [
              /* @__PURE__ */ jsx2(Btn, { onClick: saveDraft, disabled: !draft.name.trim(), children: "\u4FDD\u5B58" }),
              /* @__PURE__ */ jsx2(Btn, { kind: "ghost", onClick: () => {
                setDraft(null);
                setErr("");
              }, children: "\u53D6\u6D88" })
            ] })
          ] }) }) : null,
          scan ? /* @__PURE__ */ jsx2("div", { className: "mp-card", style: { borderColor: "#5a4316" }, children: /* @__PURE__ */ jsxs2("div", { className: "mp-card-b", children: [
            /* @__PURE__ */ jsx2("b", { style: { fontSize: 12.5 }, children: "Claude \u914D\u7F6E\u626B\u63CF\u7ED3\u679C" }),
            /* @__PURE__ */ jsx2(Field, { label: "\u5DE5\u4F5C\u533A\u8DEF\u5F84", hint: "\u7559\u7A7A\u53EA\u626B\u5168\u5C40\uFF08~/.claude\uFF09", children: /* @__PURE__ */ jsx2("input", { className: "mp-inp mono", value: wsPath, onChange: (e) => setWsPath(e.target.value), placeholder: "D:\\\\path\\\\to\\\\workspace" }) }),
            scan.found.length === 0 ? /* @__PURE__ */ jsx2(Empty, { children: "\u672A\u53D1\u73B0\u53EF\u5BFC\u5165\u7684\u670D\u52A1\u5668" }) : scan.found.map((c) => /* @__PURE__ */ jsxs2("label", { className: "mp-row", style: { padding: "4px 2px", cursor: "pointer" }, children: [
              /* @__PURE__ */ jsx2(
                "input",
                {
                  type: "checkbox",
                  checked: checked.has(c.key),
                  onChange: (e) => {
                    const next = new Set(checked);
                    if (e.target.checked) next.add(c.key);
                    else next.delete(c.key);
                    setChecked(next);
                  }
                }
              ),
              /* @__PURE__ */ jsxs2("span", { className: "mp-grow mp-sub", children: [
                /* @__PURE__ */ jsx2("b", { style: { color: "#E6EAF2" }, children: c.name }),
                " [",
                c.scope,
                "] ",
                c.transport,
                c.legacy ? " (legacy-sse)" : "",
                " \u2014 ",
                c.transport === "stdio" ? `${c.command} ${(c.args || []).join(" ")}` : c.url
              ] })
            ] }, c.key)),
            scan.files.filter((f) => f.error).map((f) => /* @__PURE__ */ jsxs2("div", { className: "mp-sub", style: { color: "#D29922" }, children: [
              "! ",
              f.path,
              ": ",
              f.error
            ] }, `${f.path}:${f.error}`)),
            /* @__PURE__ */ jsxs2("div", { className: "mp-row", style: { marginTop: 8 }, children: [
              /* @__PURE__ */ jsxs2(
                Btn,
                {
                  sm: true,
                  disabled: scan.found.length === 0,
                  onClick: () => runScan(true, checked.size ? Array.from(checked) : void 0),
                  children: [
                    "\u5BFC\u5165",
                    checked.size ? `\u6240\u9009 ${checked.size} \u9879` : "\u5168\u90E8"
                  ]
                }
              ),
              /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", onClick: () => runScan(false), children: "\u91CD\u65B0\u626B\u63CF" }),
              /* @__PURE__ */ jsx2(Btn, { sm: true, kind: "ghost", onClick: () => setScan(null), children: "\u5173\u95ED" })
            ] })
          ] }) }) : null
        ]
      }
    )
  ] });
}

// src/WorkbenchTab.tsx
var import_probe_core = __toESM(require_probe_core());
import { useEffect, useMemo, useRef, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function initialArgsState(schema) {
  const model = (0, import_probe_core.deriveFormModel)(schema);
  if (model.mode === "json") {
    return { mode: "json", values: {}, jsonText: model.placeholder || "{}" };
  }
  const values = {};
  for (const f of model.fields) {
    if (f.default !== void 0) {
      values[f.name] = typeof f.default === "string" ? f.default : JSON.stringify(f.default);
    } else if (f.type === "boolean") values[f.name] = "false";
    else if (f.type === "enum" && f.enum && f.enum.length) values[f.name] = String(f.enum[0]);
  }
  return { mode: "form", values, jsonText: "{}" };
}
function argsToPayload(st, schema) {
  if (st.mode === "json") {
    try {
      return { ok: true, value: st.jsonText.trim() ? JSON.parse(st.jsonText) : {} };
    } catch (e) {
      return { ok: false, error: `\u53C2\u6570 JSON \u89E3\u6790\u5931\u8D25: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const model = (0, import_probe_core.deriveFormModel)(schema);
  const out = {};
  for (const f of model.fields) {
    const raw = (st.values[f.name] || "").trim();
    if (!raw) {
      if (f.required) return { ok: false, error: `\u7F3A\u5C11\u5FC5\u586B\u53C2\u6570: ${f.name}` };
      continue;
    }
    try {
      if (f.type === "json") out[f.name] = JSON.parse(raw);
      else if (f.type === "number" || f.type === "integer") out[f.name] = Number(raw);
      else if (f.type === "boolean") out[f.name] = raw === "true" || raw === "1";
      else out[f.name] = raw;
    } catch (e) {
      return { ok: false, error: `\u53C2\u6570 ${f.name} \u89E3\u6790\u5931\u8D25: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { ok: true, value: out };
}
function FieldInput({ f, value, onChange }) {
  if (f.type === "enum" && f.enum) {
    return /* @__PURE__ */ jsx3("select", { className: "mp-inp", value, onChange: (e) => onChange(e.target.value), children: f.enum.map((opt) => /* @__PURE__ */ jsx3("option", { value: String(opt), children: String(opt) }, String(opt))) });
  }
  if (f.type === "boolean") {
    return /* @__PURE__ */ jsxs3("select", { className: "mp-inp", value: value || "false", onChange: (e) => onChange(e.target.value), children: [
      /* @__PURE__ */ jsx3("option", { value: "false", children: "false" }),
      /* @__PURE__ */ jsx3("option", { value: "true", children: "true" })
    ] });
  }
  if (f.type === "json") {
    return /* @__PURE__ */ jsx3(
      "textarea",
      {
        className: "mp-inp mono",
        value,
        placeholder: f.placeholder || "{}",
        onChange: (e) => onChange(e.target.value)
      }
    );
  }
  return /* @__PURE__ */ jsx3(
    "input",
    {
      className: "mp-inp",
      type: f.type === "number" || f.type === "integer" ? "number" : "text",
      value,
      onChange: (e) => onChange(e.target.value)
    }
  );
}
function WorkbenchTab({ state, hostServers, api, prefill, onPrefillConsumed }) {
  const profiles = state?.profiles || [];
  const [serverId, setServerId] = useState2("");
  const [info, setInfo] = useState2(null);
  const [hostTools, setHostTools] = useState2(null);
  const [connecting, setConnecting] = useState2(false);
  const [err, setErr] = useState2("");
  const [search, setSearch] = useState2("");
  const [toolName, setToolName] = useState2("");
  const [argsStates, setArgsStates] = useState2({});
  const [argMode, setArgMode] = useState2("form");
  const [result, setResult] = useState2(null);
  const [calling, setCalling] = useState2(false);
  const consumedPrefillRef = useRef(null);
  const tools = info?.tools || hostTools || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => `${t.name} ${t.description || ""}`.toLowerCase().includes(q));
  }, [tools, search]);
  const currentTool = tools.find((t) => t.name === toolName) || null;
  const argsState = argsStates[toolName] || initialArgsState(currentTool?.inputSchema);
  function updateArgs(next) {
    setArgsStates((m) => ({ ...m, [toolName]: next }));
  }
  async function connect(sid, force = false) {
    if (!sid) return;
    setConnecting(true);
    setErr("");
    setInfo(null);
    setHostTools(null);
    setToolName("");
    setResult(null);
    try {
      const r = await api(
        "POST",
        "/api/connect",
        { serverId: sid, force }
      );
      if (r.source === "host") {
        setHostTools(r.tools || []);
      } else {
        setInfo(r.info || null);
      }
      setServerId(sid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }
  useEffect(() => {
    if (prefill && prefill !== consumedPrefillRef.current) {
      consumedPrefillRef.current = prefill;
      onPrefillConsumed();
      if (prefill.serverId !== serverId) {
        connect(prefill.serverId).then(() => {
          if (prefill.tool) {
            const toolName2 = prefill.tool;
            setToolName(toolName2);
            if (prefill.argsText) {
              setArgsStates((m) => ({
                ...m,
                [toolName2]: { mode: "json", values: {}, jsonText: prefill.argsText }
              }));
              setArgMode("json");
            }
          }
        });
      } else if (prefill.tool) {
        const toolName2 = prefill.tool;
        setToolName(toolName2);
        if (prefill.argsText) {
          setArgsStates((m) => ({
            ...m,
            [toolName2]: { mode: "json", values: {}, jsonText: prefill.argsText }
          }));
          setArgMode("json");
        }
      }
    } else if (!serverId && !connecting && !err) {
      const first = hostServers[0];
      if (first) {
        const sid = `host:${first.server || first.pluginId}`;
        consumedPrefillRef.current = null;
        setServerId(sid);
        setHostTools(first.tools);
      }
    }
  }, [prefill, hostServers.length, profiles.length]);
  async function call() {
    if (!currentTool || !serverId) return;
    setErr("");
    const payload = argsToPayload(argMode === "json" ? argsStates[toolName] || initialArgsState(currentTool.inputSchema) : argsStates[toolName] || initialArgsState(currentTool.inputSchema), currentTool.inputSchema);
    if (!payload.ok) {
      setErr(payload.error);
      return;
    }
    setCalling(true);
    setResult(null);
    try {
      const r = await api("POST", "/api/call", {
        serverId,
        tool: currentTool.name,
        arguments: payload.value,
        via: "panel"
      });
      if (r.resultJson !== void 0 && r.result === void 0) {
        setResult({ isError: false, durationMs: r.durationMs, text: String(r.resultJson), source: "host" });
      } else {
        setResult({
          isError: !!r.isError,
          durationMs: r.durationMs,
          text: JSON.stringify(r.result, null, 2),
          source: "external"
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCalling(false);
    }
  }
  function selectTool(name) {
    setToolName(name);
    setResult(null);
    setErr("");
    const t = tools.find((x) => x.name === name);
    if (t && !argsStates[name]) {
      const init = initialArgsState(t.inputSchema);
      setArgsStates((m) => ({ ...m, [name]: init }));
      setArgMode(init.mode);
    } else if (argsStates[name]) {
      setArgMode(argsStates[name].mode);
    }
  }
  const model = currentTool ? (0, import_probe_core.deriveFormModel)(currentTool.inputSchema) : null;
  const effectiveState = argsStates[toolName] || initialArgsState(currentTool?.inputSchema);
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsx3("div", { className: "mp-sec-wrap", children: /* @__PURE__ */ jsx3("div", { className: "mp-card", children: /* @__PURE__ */ jsxs3("div", { className: "mp-card-b", children: [
      /* @__PURE__ */ jsxs3("div", { className: "mp-row", children: [
        /* @__PURE__ */ jsxs3(
          "select",
          {
            className: "mp-inp mp-grow",
            value: serverId,
            onChange: (e) => connect(e.target.value),
            children: [
              /* @__PURE__ */ jsx3("option", { value: "", children: "\u2014 \u9009\u62E9\u8981\u8C03\u8BD5\u7684\u670D\u52A1\u5668 \u2014" }),
              /* @__PURE__ */ jsx3("optgroup", { label: "\u5BBF\u4E3B\u63D2\u4EF6 MCP", children: hostServers.map((s) => {
                const sid = `host:${s.server || s.pluginId}`;
                return /* @__PURE__ */ jsxs3("option", { value: sid, children: [
                  s.server || s.pluginId,
                  "\uFF08",
                  s.tools.length,
                  " \u5DE5\u5177\uFF09"
                ] }, sid);
              }) }),
              /* @__PURE__ */ jsx3("optgroup", { label: "\u5916\u90E8\u6863\u6848", children: profiles.map((p) => /* @__PURE__ */ jsxs3("option", { value: p.id, children: [
                p.name,
                "\uFF08",
                p.transport,
                "\uFF09"
              ] }, p.id)) })
            ]
          }
        ),
        info ? /* @__PURE__ */ jsxs3(Fragment2, { children: [
          /* @__PURE__ */ jsxs3(Badge, { tone: "good", children: [
            "\u5DF2\u8FDE\u63A5 ",
            prettyMs(info.initLatencyMs)
          ] }),
          /* @__PURE__ */ jsx3(Badge, { tone: "mute", children: info.protocolVersion || "?" })
        ] }) : null,
        hostTools ? /* @__PURE__ */ jsx3(Badge, { tone: "good", children: "\u6CE8\u518C\u8868\u76F4\u67E5" }) : null,
        serverId && (info || hostTools) ? /* @__PURE__ */ jsx3(Btn, { sm: true, kind: "ghost", disabled: connecting, onClick: () => connect(serverId, true), children: "\u91CD\u8FDE" }) : null
      ] }),
      info ? /* @__PURE__ */ jsxs3("div", { className: "mp-sub", style: { marginTop: 5 }, children: [
        "serverInfo: ",
        info.serverInfo ? `${info.serverInfo.name || "?"}${info.serverInfo.version ? `@${info.serverInfo.version}` : ""}` : "?",
        "\xB7 tools ",
        info.tools.length,
        " \xB7 resources ",
        info.resources.length,
        " \xB7 prompts ",
        info.prompts.length
      ] }) : null
    ] }) }) }),
    err ? /* @__PURE__ */ jsx3("div", { style: { margin: "0 16px" }, children: /* @__PURE__ */ jsx3(ErrorNote, { children: err }) }) : null,
    !serverId ? /* @__PURE__ */ jsx3("div", { style: { margin: "0 16px" }, children: /* @__PURE__ */ jsx3(Empty, { children: "\u5148\u5728\u4E0A\u65B9\u9009\u62E9\u670D\u52A1\u5668\uFF08\u5BBF\u4E3B\u63D2\u4EF6\u76F4\u67E5\u6CE8\u518C\u8868\uFF1B\u5916\u90E8\u6863\u6848\u7531\u670D\u52A1\u5EFA\u7ACB\u8FDE\u63A5\uFF09" }) }) : /* @__PURE__ */ jsx3("div", { className: "mp-sec-wrap", children: /* @__PURE__ */ jsxs3("div", { className: "mp-split", children: [
      /* @__PURE__ */ jsxs3("div", { className: "mp-left", children: [
        /* @__PURE__ */ jsx3("input", { className: "mp-inp", placeholder: "\u641C\u7D22\u5DE5\u5177\u2026", value: search, onChange: (e) => setSearch(e.target.value) }),
        /* @__PURE__ */ jsxs3("div", { className: "mp-tools", style: { marginTop: 6 }, children: [
          connecting ? /* @__PURE__ */ jsx3(Empty, { children: "\u8FDE\u63A5\u4E2D\u2026" }) : null,
          !connecting && filtered.length === 0 ? /* @__PURE__ */ jsx3(Empty, { children: tools.length ? "\u65E0\u5339\u914D\u5DE5\u5177" : "\u8BE5\u670D\u52A1\u5668\u6CA1\u6709\u5DE5\u5177" }) : null,
          filtered.map((t) => /* @__PURE__ */ jsxs3("div", { className: `mp-tool ${toolName === t.name ? "on" : ""}`, onClick: () => selectTool(t.name), children: [
            /* @__PURE__ */ jsx3("b", { children: t.name }),
            /* @__PURE__ */ jsx3("span", { children: (t.description || "").replace(/\s+/g, " ").slice(0, 80) })
          ] }, t.name))
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "mp-right", children: !currentTool ? /* @__PURE__ */ jsx3(Empty, { children: "\u5DE6\u4FA7\u9009\u62E9\u4E00\u4E2A\u5DE5\u5177" }) : /* @__PURE__ */ jsx3("div", { className: "mp-card", children: /* @__PURE__ */ jsxs3("div", { className: "mp-card-b", children: [
        /* @__PURE__ */ jsx3("b", { style: { fontFamily: "ui-monospace,Consolas,monospace", fontSize: 13 }, children: currentTool.name }),
        currentTool.description ? /* @__PURE__ */ jsx3("div", { className: "mp-sub", style: { marginTop: 4 }, children: currentTool.description }) : /* @__PURE__ */ jsx3("div", { className: "mp-sub", style: { marginTop: 4, color: "#D29922" }, children: "\u26A0 \u8BE5\u5DE5\u5177\u6CA1\u6709 description\u2014\u2014\u6A21\u578B\u96BE\u4EE5\u5224\u65AD\u4F55\u65F6\u9009\u7528\uFF08\u4F53\u68C0\u4F1A\u6807\u8BB0\uFF09" }),
        /* @__PURE__ */ jsxs3("div", { className: "mp-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx3(Btn, { sm: true, kind: argMode === "form" ? "primary" : "ghost", onClick: () => setArgMode("form"), disabled: model?.mode !== "fields", children: "\u8868\u5355" }),
          /* @__PURE__ */ jsx3(Btn, { sm: true, kind: argMode === "json" ? "primary" : "ghost", onClick: () => {
            if (argMode === "form" && model?.mode === "fields") {
              const payload = argsToPayload(effectiveState, currentTool.inputSchema);
              updateArgs({ ...effectiveState, mode: "json", jsonText: payload.ok ? JSON.stringify(payload.value, null, 2) : effectiveState.jsonText || "{}" });
            }
            setArgMode("json");
          }, children: "JSON" }),
          /* @__PURE__ */ jsx3("span", { className: "mp-hint", children: model?.mode === "fields" ? `${model.fields.length} \u4E2A\u53C2\u6570` : "\u590D\u6742 schema\uFF0C\u7528 JSON \u7F16\u8F91" })
        ] }),
        argMode === "form" && model?.mode === "fields" ? /* @__PURE__ */ jsx3("div", { style: { marginTop: 8 }, children: model.fields.map((f) => /* @__PURE__ */ jsx3(Field, { label: `${f.name}${f.required ? " *" : ""}`, hint: `${f.type}${f.description ? ` \xB7 ${f.description.slice(0, 60)}` : ""}`, children: /* @__PURE__ */ jsx3(
          FieldInput,
          {
            f,
            value: effectiveState.values[f.name] || "",
            onChange: (v) => updateArgs({ ...effectiveState, values: { ...effectiveState.values, [f.name]: v } })
          }
        ) }, f.name)) }) : /* @__PURE__ */ jsx3("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx3(
          "textarea",
          {
            className: "mp-inp mono",
            style: { minHeight: 110 },
            value: effectiveState.jsonText,
            onChange: (e) => updateArgs({ ...effectiveState, mode: argMode, jsonText: e.target.value }),
            placeholder: "{}"
          }
        ) }),
        /* @__PURE__ */ jsxs3("div", { className: "mp-row", style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx3(Btn, { onClick: call, disabled: calling || connecting, children: calling ? "\u8C03\u7528\u4E2D\u2026" : "\u8C03\u7528" }),
          /* @__PURE__ */ jsx3("span", { className: "mp-hint", children: "\u8C03\u7528\u4F1A\u8BB0\u5165\u5386\u53F2\uFF08\u53EF\u91CD\u653E\uFF09" })
        ] }),
        result ? /* @__PURE__ */ jsxs3("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsxs3("div", { className: "mp-row", children: [
            /* @__PURE__ */ jsx3(Badge, { tone: result.isError ? "bad" : "good", children: result.isError ? "isError" : "\u6210\u529F" }),
            /* @__PURE__ */ jsx3(Badge, { tone: "mute", children: prettyMs(result.durationMs) }),
            /* @__PURE__ */ jsx3(Badge, { tone: "mute", children: result.source === "host" ? "cap.mcp \u805A\u5408\u6587\u672C" : "\u539F\u59CB\u7ED3\u679C" })
          ] }),
          /* @__PURE__ */ jsx3(JsonView, { text: result.text, maxH: 420 })
        ] }) : null
      ] }) }) })
    ] }) })
  ] });
}

// src/HealthTab.tsx
import { useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function HealthTab({ state, hostServers, api, poolById, gotoWorkbench }) {
  const [reports, setReports] = useState3([]);
  const [snapshots, setSnapshots] = useState3([]);
  const [busy, setBusy] = useState3("");
  const [err, setErr] = useState3("");
  const [diffServerId, setDiffServerId] = useState3("");
  const [diff, setDiff] = useState3(null);
  async function loadLists() {
    try {
      const [r, s] = await Promise.all([
        api("GET", "/api/reports"),
        api("GET", "/api/snapshots")
      ]);
      setReports(r.reports || []);
      setSnapshots(s.snapshots || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect2(() => {
    loadLists();
  }, []);
  async function check(serverId) {
    setBusy(serverId || "_all");
    setErr("");
    try {
      await api("POST", "/api/health-check", serverId ? { serverId } : {});
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function snapshot(serverId) {
    setBusy(serverId);
    setErr("");
    try {
      await api("POST", "/api/snapshot", { serverId });
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function runDiff(serverId) {
    setBusy(serverId);
    setErr("");
    setDiff(null);
    try {
      const r = await api("POST", "/api/diff", { serverId });
      setDiff(r);
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  const externalIds = (state?.profiles || []).map((p) => ({ id: p.id, name: p.name }));
  const hostIds = hostServers.map((s) => ({ id: `host:${s.server || s.pluginId}`, name: s.server || s.pluginId }));
  const allServers = [...hostIds, ...externalIds];
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4(
      Section,
      {
        title: "\u4F53\u68C0",
        hint: "\u63E1\u624B/\u6E05\u5355\u5EF6\u8FDF + schema \u536B\u751F\u68C0\u67E5\uFF0C\u7EDD\u4E0D\u8C03\u7528\u5DE5\u5177",
        actions: /* @__PURE__ */ jsx4(Btn, { sm: true, disabled: busy !== "" || externalIds.length === 0, onClick: () => check(), children: "\u4F53\u68C0\u5168\u90E8\u5916\u90E8\u6863\u6848" }),
        children: [
          allServers.length === 0 ? /* @__PURE__ */ jsx4(Empty, { children: "\u6CA1\u6709\u53EF\u4F53\u68C0\u7684\u670D\u52A1\u5668" }) : /* @__PURE__ */ jsx4("div", { className: "mp-card", children: /* @__PURE__ */ jsx4("div", { className: "mp-card-b", children: allServers.map((s) => /* @__PURE__ */ jsxs4("div", { className: "mp-row", style: { padding: "4px 0" }, children: [
            /* @__PURE__ */ jsxs4("span", { className: "mp-grow mp-sub", children: [
              /* @__PURE__ */ jsx4("b", { style: { color: "#E6EAF2" }, children: s.name }),
              " ",
              s.id.startsWith("host:") ? "[\u5BBF\u4E3B]" : ""
            ] }),
            s.id.startsWith("host:") ? /* @__PURE__ */ jsx4(Btn, { sm: true, kind: "ghost", disabled: busy !== "", onClick: () => check(s.id), children: "\u4F53\u68C0" }) : /* @__PURE__ */ jsxs4(Fragment3, { children: [
              /* @__PURE__ */ jsx4(Btn, { sm: true, kind: "ghost", disabled: busy !== "", onClick: () => check(s.id), children: "\u4F53\u68C0" }),
              /* @__PURE__ */ jsx4(Btn, { sm: true, kind: "ghost", disabled: busy !== "", onClick: () => snapshot(s.id), children: "\u62CD\u5FEB\u7167" }),
              /* @__PURE__ */ jsx4(Btn, { sm: true, disabled: busy !== "", onClick: () => runDiff(s.id), children: "\u5BF9\u6BD4\u6F02\u79FB" })
            ] })
          ] }, s.id)) }) }),
          err ? /* @__PURE__ */ jsx4(ErrorNote, { children: err }) : null,
          diff ? /* @__PURE__ */ jsx4("div", { className: "mp-card", style: { borderColor: diff.added.length + diff.removed.length + diff.changed.length > 0 ? "#5a4316" : void 0 }, children: /* @__PURE__ */ jsxs4("div", { className: "mp-card-b", children: [
            /* @__PURE__ */ jsxs4("div", { className: "mp-row", children: [
              /* @__PURE__ */ jsx4("b", { style: { fontSize: 12.5 }, children: "\u6F02\u79FB\u5BF9\u6BD4\u7ED3\u679C" }),
              diff.baseAt ? /* @__PURE__ */ jsxs4(Badge, { tone: "mute", children: [
                "\u57FA\u51C6 ",
                timeAgo(diff.baseAt)
              ] }) : null,
              /* @__PURE__ */ jsxs4(Badge, { tone: diff.added.length + diff.removed.length + diff.changed.length ? "warn" : "good", children: [
                "+",
                diff.added.length,
                " / -",
                diff.removed.length,
                " / ~",
                diff.changed.length,
                " / = ",
                diff.unchangedCount
              ] })
            ] }),
            diff.added.length ? /* @__PURE__ */ jsxs4("div", { className: "mp-sub", style: { marginTop: 5 }, children: [
              "\u65B0\u589E: ",
              diff.added.join(", ")
            ] }) : null,
            diff.removed.length ? /* @__PURE__ */ jsxs4("div", { className: "mp-sub", style: { marginTop: 3 }, children: [
              "\u79FB\u9664: ",
              diff.removed.join(", ")
            ] }) : null,
            diff.changed.map((c) => /* @__PURE__ */ jsxs4("div", { className: "mp-sub", style: { marginTop: 3 }, children: [
              "\u53D8\u66F4: ",
              /* @__PURE__ */ jsx4("b", { style: { color: "#D29922" }, children: c.name }),
              "\uFF08",
              c.fields.join(" + "),
              "\uFF09"
            ] }, c.name)),
            diff.note ? /* @__PURE__ */ jsx4("div", { className: "mp-sub", style: { marginTop: 5 }, children: diff.note }) : null
          ] }) }) : null
        ]
      }
    ),
    /* @__PURE__ */ jsx4(Section, { title: "\u4F53\u68C0\u62A5\u544A", hint: `\u4FDD\u5B58\u6700\u8FD1 ${reports.length} \u4EFD`, children: reports.length === 0 ? /* @__PURE__ */ jsx4(Empty, { children: "\u5C1A\u672A\u4F53\u68C0\u3002\u4F53\u68C0\u53EA\u8BFB\u5143\u6570\u636E\uFF0C\u4E0D\u4F1A\u6267\u884C\u4EFB\u4F55\u5DE5\u5177\u3002" }) : reports.map((rep) => /* @__PURE__ */ jsx4("div", { className: "mp-card", children: /* @__PURE__ */ jsxs4("div", { className: "mp-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "mp-row", children: [
        /* @__PURE__ */ jsx4(Dot, { status: rep.ok ? "ok" : "bad" }),
        /* @__PURE__ */ jsx4("b", { className: "mp-grow", style: { fontSize: 12.5 }, children: rep.serverName }),
        /* @__PURE__ */ jsx4(Badge, { tone: "mute", children: rep.kind === "host" ? "\u5BBF\u4E3B" : "\u5916\u90E8" }),
        /* @__PURE__ */ jsx4("span", { className: "mp-tag", children: timeAgo(rep.at) })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "mp-sub", style: { marginTop: 4 }, children: rep.error ? `\u8FDE\u63A5\u5931\u8D25: ${rep.error}` : /* @__PURE__ */ jsxs4(Fragment3, { children: [
        "\u5DE5\u5177 ",
        rep.toolCount,
        " \u4E2A",
        rep.kind === "host" ? ` \xB7 cap.mcp \u5F80\u8FD4 ${prettyMs(rep.roundtripMs)}` : ` \xB7 \u63E1\u624B ${prettyMs(rep.initLatencyMs)} \xB7 \u6E05\u5355 ${prettyMs(rep.listLatencyMs)} \xB7 \u534F\u8BAE ${rep.protocolVersion || "?"}`,
        rep.reusedConnection ? " \xB7 \u590D\u7528\u8FDE\u63A5" : ""
      ] }) }),
      rep.issues.length ? /* @__PURE__ */ jsx4("div", { className: "mp-issues", children: rep.issues.map((i, idx) => /* @__PURE__ */ jsxs4("div", { className: `mp-issue ${i.level}`, children: [
        "[",
        i.level,
        "] ",
        i.tool,
        ": ",
        i.msg
      ] }, `${i.tool}:${idx}`)) }) : null,
      rep.note ? /* @__PURE__ */ jsx4("div", { className: "mp-sub", style: { marginTop: 5 }, children: rep.note }) : null
    ] }) }, rep.id)) }),
    /* @__PURE__ */ jsx4(Section, { title: "\u5FEB\u7167", hint: "\u5DE5\u5177\u6E05\u5355\u7559\u6863\uFF0C\u4F9B\u6F02\u79FB\u5BF9\u6BD4", children: snapshots.length === 0 ? /* @__PURE__ */ jsx4(Empty, { children: "\u5C1A\u65E0\u5FEB\u7167\u3002\u5BF9\u5916\u90E8\u6863\u6848\u300C\u62CD\u5FEB\u7167\u300D\u6216\u300C\u5BF9\u6BD4\u6F02\u79FB\u300D\u540E\u751F\u6210\u3002" }) : /* @__PURE__ */ jsx4("div", { className: "mp-card", children: /* @__PURE__ */ jsx4("div", { className: "mp-card-b", children: snapshots.map((s) => /* @__PURE__ */ jsxs4("div", { className: "mp-row", style: { padding: "4px 0" }, children: [
      /* @__PURE__ */ jsxs4("span", { className: "mp-grow mp-sub", children: [
        /* @__PURE__ */ jsx4("b", { style: { color: "#E6EAF2" }, children: s.serverName }),
        " \xB7 ",
        s.toolCount,
        " \u5DE5\u5177",
        s.truncated ? "\uFF08schema \u5DF2\u622A\u65AD\uFF09" : "",
        " \xB7 ",
        timeAgo(s.at),
        " \xB7 via ",
        s.via
      ] }),
      /* @__PURE__ */ jsx4(Btn, { sm: true, kind: "ghost", onClick: () => gotoWorkbench(s.serverId), children: "\u8C03\u8BD5" })
    ] }, s.id)) }) }) })
  ] });
}

// src/HistoryTab.tsx
import { useEffect as useEffect3, useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function HistoryTab({ api, state, gotoWorkbench }) {
  const [calls, setCalls] = useState4([]);
  const [total, setTotal] = useState4(0);
  const [serverId, setServerId] = useState4("");
  const [tool, setTool] = useState4("");
  const [openId, setOpenId] = useState4("");
  const [err, setErr] = useState4("");
  const [busy, setBusy] = useState4(false);
  async function load() {
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (serverId) qs.set("serverId", serverId);
      if (tool.trim()) qs.set("tool", tool.trim());
      qs.set("limit", "200");
      const r = await api("GET", `/api/history?${qs.toString()}`);
      setCalls(r.calls || []);
      setTotal(r.total || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect3(() => {
    load();
  }, [serverId]);
  async function clearAll() {
    if (!window.confirm(`\u6E05\u7A7A\u5168\u90E8 ${total} \u6761\u8C03\u7528\u5386\u53F2\uFF1F\uFF08\u5FEB\u7167\u4E0E\u4F53\u68C0\u62A5\u544A\u4E0D\u53D7\u5F71\u54CD\uFF09`)) return;
    setBusy(true);
    try {
      await api("POST", "/api/history/clear", {});
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const serverNames = /* @__PURE__ */ new Map();
  for (const c of calls) serverNames.set(c.serverId, c.serverName);
  return /* @__PURE__ */ jsx5("div", { children: /* @__PURE__ */ jsxs5(
    Section,
    {
      title: "\u8C03\u7528\u5386\u53F2",
      hint: `${calls.length}/${total} \u6761\uFF08\u4E0A\u9650 200\uFF0C\u5148\u8FDB\u5148\u51FA\uFF09`,
      actions: /* @__PURE__ */ jsxs5(Fragment4, { children: [
        /* @__PURE__ */ jsx5(Btn, { sm: true, kind: "ghost", onClick: load, children: "\u5237\u65B0" }),
        /* @__PURE__ */ jsx5(Btn, { sm: true, kind: "danger", disabled: busy || total === 0, onClick: clearAll, children: "\u6E05\u7A7A" })
      ] }),
      children: [
        /* @__PURE__ */ jsx5("div", { className: "mp-card", children: /* @__PURE__ */ jsx5("div", { className: "mp-card-b", children: /* @__PURE__ */ jsxs5("div", { className: "mp-row", children: [
          /* @__PURE__ */ jsxs5("select", { className: "mp-inp", style: { maxWidth: 240 }, value: serverId, onChange: (e) => setServerId(e.target.value), children: [
            /* @__PURE__ */ jsx5("option", { value: "", children: "\u5168\u90E8\u670D\u52A1\u5668" }),
            Array.from(serverNames.entries()).map(([sid, name]) => /* @__PURE__ */ jsx5("option", { value: sid, children: name }, sid))
          ] }),
          /* @__PURE__ */ jsx5(
            "input",
            {
              className: "mp-inp mono",
              style: { maxWidth: 200 },
              placeholder: "\u6309\u5DE5\u5177\u540D\u8FC7\u6EE4",
              value: tool,
              onChange: (e) => setTool(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") load();
              }
            }
          ),
          /* @__PURE__ */ jsx5(Btn, { sm: true, kind: "ghost", onClick: load, children: "\u8FC7\u6EE4" })
        ] }) }) }),
        err ? /* @__PURE__ */ jsx5(ErrorNote, { children: err }) : null,
        calls.length === 0 ? /* @__PURE__ */ jsx5(Empty, { children: "\u6682\u65E0\u8C03\u7528\u8BB0\u5F55\u3002\u5728\u300C\u8C03\u8BD5\u300D\u9875\u8C03\u7528\u5DE5\u5177\uFF0C\u6216\u8BA9 AI \u7528 probe_call_tool \u8C03\u7528\u540E\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }) : calls.map((c) => /* @__PURE__ */ jsx5("div", { className: "mp-card", children: /* @__PURE__ */ jsxs5("div", { className: "mp-card-b", onClick: () => setOpenId(openId === c.id ? "" : c.id), style: { cursor: "pointer" }, children: [
          /* @__PURE__ */ jsxs5("div", { className: "mp-row", children: [
            /* @__PURE__ */ jsx5(Badge, { tone: c.isError ? "bad" : "good", children: c.isError ? "\u2717 \u5931\u8D25" : "\u2713 \u6210\u529F" }),
            /* @__PURE__ */ jsx5("b", { style: { fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }, children: c.tool }),
            /* @__PURE__ */ jsx5("span", { className: "mp-sub mp-grow", children: c.serverName }),
            /* @__PURE__ */ jsxs5(Badge, { tone: "mute", children: [
              c.durationMs,
              "ms"
            ] }),
            /* @__PURE__ */ jsx5(Badge, { tone: "mute", children: c.via === "ai" ? "AI" : "\u9762\u677F" }),
            /* @__PURE__ */ jsx5("span", { className: "mp-tag", children: timeAgo(c.at) })
          ] }),
          /* @__PURE__ */ jsxs5("div", { className: "mp-sub mono", style: { marginTop: 4, fontFamily: "ui-monospace,Consolas,monospace" }, children: [
            "args: ",
            c.argsText.slice(0, 120)
          ] }),
          openId === c.id ? /* @__PURE__ */ jsxs5("div", { onClick: (e) => e.stopPropagation(), children: [
            /* @__PURE__ */ jsxs5("div", { className: "mp-row", style: { marginTop: 8 }, children: [
              /* @__PURE__ */ jsx5(Btn, { sm: true, onClick: () => gotoWorkbench(c.serverId, c.tool, c.argsText), children: "\u91CD\u653E\u8FDB\u8C03\u8BD5\u53F0" }),
              /* @__PURE__ */ jsx5(Btn, { sm: true, kind: "ghost", onClick: () => navigator.clipboard?.writeText(c.resultText), children: "\u590D\u5236\u7ED3\u679C" })
            ] }),
            /* @__PURE__ */ jsx5(JsonView, { text: c.resultText, maxH: 360 })
          ] }) : null
        ] }) }, c.id))
      ]
    }
  ) });
}

// src/Panel.tsx
import { Fragment as Fragment5, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var css = `
.mp-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.mp-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mp-body{flex:1;overflow-y:auto;padding:0 0 24px}
.mp-body::-webkit-scrollbar{width:9px;height:9px}
.mp-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.mp-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.mp-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3FB950,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0}
.mp-tt{flex:1;min-width:0}
.mp-tt b{font-size:15px;display:block}
.mp-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.mp-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.mp-dot.warn{background:#D29922}
.mp-dot.bad{background:#F85149}
.mp-dot.idle{background:#4d5566}
.mp-tabs{display:flex;gap:4px;overflow-x:auto;max-width:62%}
.mp-tabs::-webkit-scrollbar{display:none}
.mp-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative;white-space:nowrap;flex-shrink:0}
.mp-tab:hover{color:#E6EAF2}
.mp-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.mp-banner{margin:0 16px 10px;border:1px solid #5a4316;background:rgba(210,153,34,.08);color:#D29922;border-radius:11px;padding:10px 12px;font-size:12px;line-height:1.6}
.mp-banner .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

.mp-sec-wrap{margin:0 16px 10px}
.mp-sec{display:flex;align-items:center;gap:8px;padding:8px 2px 6px;font-size:13px;font-weight:700}
.mp-sec-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3FB950,#58A6FF);flex-shrink:0}
.mp-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.mp-sec-actions{margin-left:auto;display:flex;gap:6px}
.mp-sec + .mp-hint{margin-left:0}
.mp-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin-bottom:8px;overflow:hidden;min-width:0}
.mp-card-b{padding:11px 13px}
.mp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mp-grow{flex:1;min-width:0}
.mp-sub{font-size:10.5px;color:#8B95A7;line-height:1.6;word-break:break-all}
.mp-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.mp-badge{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.mp-badge.good{background:rgba(63,185,80,.1);color:#3FB950;border-color:#2a5a38}
.mp-badge.warn{background:rgba(210,153,34,.12);color:#D29922;border-color:#5a4316}
.mp-badge.bad{background:rgba(248,81,73,.1);color:#F85149;border-color:#54262c}
.mp-badge.mute{background:#1C2330;color:#8B95A7;border-color:#242C3A}

.mp-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.mp-btn:hover{filter:brightness(1.1)}
.mp-btn:disabled{opacity:.45;cursor:not-allowed}
.mp-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.mp-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.mp-btn.amber{background:#3a2d12;color:#D29922;border:1px solid #5a4316}
.mp-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.mp-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.mp-inp:focus{outline:none;border-color:#2b6cb0}
.mp-inp::placeholder{color:#4d5566}
.mp-inp.mono{font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
textarea.mp-inp{resize:vertical;min-height:64px}
select.mp-inp{appearance:auto}
.mp-field{display:block;margin-bottom:9px}
.mp-field-l{display:flex;align-items:baseline;gap:6px;font-size:11px;color:#8B95A7;margin-bottom:4px}
.mp-field-h{font-style:normal;color:#4d5566;font-size:10px}

.mp-json{background:#0D1117;border:1px solid #21283a;border-radius:9px;padding:9px 11px;font:11px/1.5 ui-monospace,Consolas,monospace;color:#C9D1D9;overflow:auto;max-height:320px;margin:6px 0 0;white-space:pre-wrap;word-break:break-all}
.mp-empty{color:#5C6678;font-size:12px;text-align:center;padding:18px 10px;border:1px dashed #2a2f3a;border-radius:11px;margin:0 2px}
.mp-err{background:rgba(248,81,73,.08);border:1px solid #54262c;color:#F85149;border-radius:9px;padding:8px 11px;font-size:11.5px;margin:6px 0;word-break:break-all}

.mp-tools{display:flex;flex-direction:column;gap:4px}
.mp-tool{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;border:1px solid transparent;cursor:pointer;min-width:0}
.mp-tool:hover{background:#1A2029}
.mp-tool.on{background:#1C2330;border-color:#2b6cb0}
.mp-tool b{font-size:12px;font-family:ui-monospace,Consolas,monospace;flex-shrink:0}
.mp-tool span{font-size:10.5px;color:#8B95A7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-split{display:flex;gap:10px;align-items:flex-start}
.mp-left{width:260px;flex-shrink:0}
.mp-right{flex:1;min-width:0}
@media (max-width:720px){.mp-split{flex-direction:column}.mp-left{width:100%}}
.mp-issues{display:flex;flex-direction:column;gap:5px;margin-top:6px}
.mp-issue{font-size:11.5px;padding:6px 9px;border-radius:8px;line-height:1.5}
.mp-issue.warn{background:rgba(210,153,34,.1);color:#D29922}
.mp-issue.error{background:rgba(248,81,73,.08);color:#F85149}
.mp-kv{font-size:11px;color:#8B95A7}
.mp-kv b{color:#E6EAF2;font-weight:600}
`;
function Panel() {
  const [svc, setSvc] = useState5(null);
  const [svcErr, setSvcErr] = useState5("");
  const [booting, setBooting] = useState5(true);
  const [state, setState] = useState5(null);
  const [hostServers, setHostServers] = useState5([]);
  const [hostErr, setHostErr] = useState5("");
  const [tab, setTab] = useState5("servers");
  const [prefill, setPrefill] = useState5(null);
  const [busy, setBusy] = useState5(false);
  const aliveRef = useRef2(true);
  const loadAll = useCallback(async (info) => {
    try {
      const s = await svcApi(info, "GET", "/api/state");
      setState(s);
      setSvcErr("");
    } catch (e) {
      if (e instanceof SvcError && e.offline) {
        setSvc(null);
        setSvcErr(e.message);
        return;
      }
      setSvcErr(e instanceof Error ? e.message : String(e));
    }
    try {
      const h = await svcApi(info, "GET", "/api/host/tools");
      setHostServers(h.servers || []);
      setHostErr("");
    } catch (e) {
      setHostErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect4(() => {
    aliveRef.current = true;
    let tries = 0;
    let timer = null;
    const attempt = async () => {
      if (!aliveRef.current) return;
      const info = await readServiceInfo();
      if (info) {
        setSvc(info);
        setBooting(false);
        await loadAll(info);
        return;
      }
      tries += 1;
      if (tries >= 5) {
        setBooting(false);
        return;
      }
      timer = setTimeout(attempt, 2400);
    };
    attempt();
    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [loadAll]);
  useEffect4(() => {
    if (!svc) return void 0;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadAll(svc);
    }, 8e3);
    return () => clearInterval(t);
  }, [svc, loadAll]);
  const api = useCallback(async (method, route, body) => {
    if (!svc) throw new SvcError("\u8C03\u8BD5\u53F0\u670D\u52A1\u672A\u8FDE\u63A5", true);
    const r = await svcApi(svc, method, route, body);
    loadAll(svc);
    return r;
  }, [svc, loadAll]);
  const gotoWorkbench = useCallback((p) => {
    setPrefill(p);
    setTab("workbench");
  }, []);
  const gotoWorkbenchFromTab = useCallback((serverId, tool, argsText) => {
    setPrefill({ serverId, tool, argsText });
    setTab("workbench");
  }, []);
  async function onRestartService() {
    setBusy(true);
    try {
      await restartOwnService();
      setSvcErr("");
      setBooting(true);
      let tries = 0;
      const attempt = async () => {
        const info = await readServiceInfo();
        if (info) {
          setSvc(info);
          setBooting(false);
          await loadAll(info);
          return;
        }
        tries += 1;
        if (tries < 5) setTimeout(attempt, 2400);
        else setBooting(false);
      };
      setTimeout(attempt, 2e3);
    } catch (e) {
      setSvcErr(`\u91CD\u542F\u670D\u52A1\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}\u2014\u2014\u8BF7\u5230 \u8BBE\u7F6E\u2192\u63D2\u4EF6 \u91CC\u624B\u52A8\u542F\u52A8\u300CMCP \u8C03\u8BD5\u53F0\u300D\u7684\u670D\u52A1`);
    } finally {
      setBusy(false);
    }
  }
  const poolById = new Map((state?.pool || []).map((p) => [p.serverId, p]));
  const degraded = !!state?.degraded;
  return /* @__PURE__ */ jsxs6("div", { className: "mp-root", children: [
    /* @__PURE__ */ jsx6("style", { children: css }),
    /* @__PURE__ */ jsxs6("div", { className: "mp-top", children: [
      /* @__PURE__ */ jsx6("div", { className: "mp-logo", children: "MCP" }),
      /* @__PURE__ */ jsxs6("div", { className: "mp-tt", children: [
        /* @__PURE__ */ jsx6("b", { children: "MCP \u8C03\u8BD5\u53F0" }),
        /* @__PURE__ */ jsxs6("small", { children: [
          booting ? "\u6B63\u5728\u8FDE\u63A5\u8C03\u8BD5\u53F0\u670D\u52A1\u2026" : svc ? /* @__PURE__ */ jsxs6(Fragment5, { children: [
            /* @__PURE__ */ jsx6(Dot, { status: degraded ? "warn" : "ok" }),
            "\u670D\u52A1 v",
            svc.version,
            "\xB7pid ",
            svc.pid,
            state ? `\xB7\u6863\u6848 ${state.profiles.length}\xB7\u5386\u53F2 ${state.counts.history}` : ""
          ] }) : /* @__PURE__ */ jsx6(Dot, { status: "bad" }),
          !booting && !svc ? "\u670D\u52A1\u79BB\u7EBF" : "",
          degraded ? "\xB7kv \u964D\u7EA7\uFF08\u5185\u5B58\u6001\uFF09" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "mp-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx6("button", { type: "button", className: `mp-tab ${tab === t.key ? "on" : ""}`, onClick: () => setTab(t.key), children: t.label }, t.key)) })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "mp-body", children: [
      !booting && !svc ? /* @__PURE__ */ jsxs6("div", { className: "mp-banner", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u8C03\u8BD5\u53F0\u670D\u52A1\u672A\u8FD0\u884C\u3002" }),
        /* @__PURE__ */ jsx6("div", { className: "mp-sub", children: "\u670D\u52A1\u8D1F\u8D23\u8FDE\u63A5\u6C60\u4E0E MCP \u5BA2\u6237\u7AEF\uFF08\u9762\u677F\u4E0E AI \u5DE5\u5177\u90FD\u59D4\u6258\u5B83\uFF09\u3002\u5B89\u88C5\u540E\u9996\u6B21\u542F\u52A8\u7EA6\u9700\u6570\u79D2\u3002" }),
        /* @__PURE__ */ jsxs6("div", { className: "row", style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsx6(Btn, { onClick: onRestartService, disabled: busy, children: "\u91CD\u542F\u670D\u52A1" }),
          /* @__PURE__ */ jsx6("span", { className: "mp-sub", children: svcErr || "\u82E5\u91CD\u542F\u65E0\u6548\uFF0C\u8BF7\u5230 \u8BBE\u7F6E\u2192\u63D2\u4EF6 \u786E\u8BA4\u63D2\u4EF6\u5DF2\u542F\u7528" })
        ] })
      ] }) : null,
      svc && degraded ? /* @__PURE__ */ jsxs6("div", { className: "mp-banner", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u5BBF\u4E3B kv \u6682\u4E0D\u53EF\u8FBE" }),
        /* @__PURE__ */ jsx6("div", { className: "mp-sub", children: "\u6863\u6848/\u5386\u53F2\u6765\u81EA\u670D\u52A1\u542F\u52A8\u65F6\u7684\u5185\u5B58\u526F\u672C\uFF0C\u671F\u95F4\u7684\u4FEE\u6539\u4E0D\u4F1A\u6301\u4E45\u5316\u3002\u6062\u590D\u540E\u81EA\u52A8\u56DE\u5230\u843D\u5E93\u6A21\u5F0F\u3002" })
      ] }) : null,
      hostErr ? /* @__PURE__ */ jsxs6("div", { className: "mp-banner", children: [
        /* @__PURE__ */ jsx6("b", { children: "\u5BBF\u4E3B\u63D2\u4EF6\u5DE5\u5177\u6E05\u5355\u8BFB\u53D6\u5931\u8D25" }),
        /* @__PURE__ */ jsx6("div", { className: "mp-sub", children: hostErr })
      ] }) : null,
      tab === "servers" ? /* @__PURE__ */ jsx6(
        ServersTab,
        {
          state,
          hostServers,
          api,
          gotoWorkbench: gotoWorkbenchFromTab,
          workspace: workspacePath()
        }
      ) : null,
      tab === "workbench" ? /* @__PURE__ */ jsx6(
        WorkbenchTab,
        {
          state,
          hostServers,
          api,
          prefill,
          onPrefillConsumed: () => setPrefill(null)
        }
      ) : null,
      tab === "health" ? /* @__PURE__ */ jsx6(
        HealthTab,
        {
          state,
          hostServers,
          api,
          poolById,
          gotoWorkbench: gotoWorkbenchFromTab
        }
      ) : null,
      tab === "history" ? /* @__PURE__ */ jsx6(HistoryTab, { api, state, gotoWorkbench: gotoWorkbenchFromTab }) : null,
      tab === "servers" && state ? /* @__PURE__ */ jsx6("div", { style: { margin: "2px 16px" }, children: /* @__PURE__ */ jsxs6(Badge, { tone: "mute", children: [
        "\u8FDE\u63A5\u6C60 ",
        state.pool.length,
        " \xB7 \u5FEB\u7167 ",
        state.counts.snapshots,
        " \xB7 \u4F53\u68C0\u62A5\u544A ",
        state.counts.reports
      ] }) }) : null
    ] })
  ] });
}

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
