var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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

// src/host.ts
function getHostInvoke() {
  const fn = window.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") {
    throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  }
  return fn;
}
var init_host = __esm({
  "src/host.ts"() {
    "use strict";
  }
});

// src/model.ts
var model_exports = {};
__export(model_exports, {
  PLUGIN_ID: () => PLUGIN_ID,
  SERVICE_ID: () => SERVICE_ID,
  kvDel: () => kvDel,
  kvGet: () => kvGet,
  kvKeys: () => kvKeys,
  kvSet: () => kvSet,
  loadFindings: () => loadFindings,
  loadIgnore: () => loadIgnore,
  loadPanelData: () => loadPanelData,
  loadScanRecord: () => loadScanRecord,
  purgeOwnKeys: () => purgeOwnKeys,
  requestScan: () => requestScan,
  saveIgnore: () => saveIgnore,
  saveSettings: () => saveSettings,
  serviceAction: () => serviceAction,
  serviceStart: () => serviceStart,
  serviceStatus: () => serviceStatus
});
async function capDispatch(target, payload) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", {
    req: { target, payload }
  });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" });
  return r.keys ?? [];
}
async function loadPanelData() {
  const [meta, latest, history, ignore, settings] = await Promise.all([
    kvGet(K.meta),
    kvGet(K.latest),
    kvGet(K.history),
    kvGet(K.ignore),
    kvGet(K.settings)
  ]);
  return { meta, latest, history: history ?? [], ignore: ignore ?? [], settings: settings ?? {} };
}
async function loadScanRecord(id) {
  return kvGet(K.scan(id));
}
async function loadFindings(id, maxChunks = 400) {
  const out = [];
  for (let n = 0; n < maxChunks; n++) {
    const chunk = await kvGet(K.find(id, n));
    if (!chunk || !Array.isArray(chunk) || !chunk.length) break;
    out.push(...chunk);
    if (out.length > 2e4) break;
  }
  return out;
}
async function loadIgnore() {
  const v = await kvGet(K.ignore);
  return Array.isArray(v) ? v : [];
}
function nonce() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
async function requestScan(root, onTick) {
  const target = root.trim();
  if (!target) return { ok: false, error: "\u8BF7\u5148\u586B\u4E00\u4E2A\u8981\u626B\u63CF\u7684\u76EE\u5F55\u8DEF\u5F84\u3002" };
  const n = nonce();
  await kvSet(K.cmdScan(n), { root: target, at: Date.now(), from: "panel" });
  const deadline = Date.now() + 15 * 60 * 1e3;
  let scanId = "";
  let saidWaiting = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    if (!scanId) {
      const done = await kvGet(K.result(n));
      if (done && (done.ok || done.error)) {
        await kvDel(K.result(n)).catch(() => {
        });
        if (done.ok) {
          return {
            ok: true,
            scanId: done.scanId,
            counts: done.counts,
            new: done.new,
            findingCount: done.findingCount,
            files: done.files,
            durationMs: done.durationMs,
            truncated: done.truncated
          };
        }
        return { ok: false, error: done.error || "\u626B\u63CF\u5931\u8D25" };
      }
      const meta = await kvGet(K.meta);
      if (meta?.scanning && meta.scanning.nonce === n) {
        scanId = meta.scanning.id;
        continue;
      }
      if (!saidWaiting) {
        onTick?.("\u547D\u4EE4\u5DF2\u6295\u9012\uFF0C\u7B49\u5F85\u540E\u53F0\u670D\u52A1\u63A5\u53D7\uFF08\u82E5\u670D\u52A1\u672A\u8FD0\u884C\uFF0C\u8BF7\u5230\u300C\u8BBE\u7F6E\u300D\u542F\u52A8\uFF09\u2026");
        saidWaiting = true;
      }
      continue;
    }
    const rec = await loadScanRecord(scanId);
    if (!rec) continue;
    if (rec.status === "done") {
      await kvDel(K.result(n)).catch(() => {
      });
      return {
        ok: true,
        scanId: rec.id,
        counts: rec.counts,
        new: rec.new,
        findingCount: rec.findingCount,
        files: rec.files,
        durationMs: rec.durationMs,
        truncated: rec.truncated
      };
    }
    if (rec.status === "failed") {
      await kvDel(K.result(n)).catch(() => {
      });
      return { ok: false, error: rec.error || "\u626B\u63CF\u5931\u8D25" };
    }
    onTick?.(`\u626B\u63CF\u8FDB\u884C\u4E2D\uFF1A\u5DF2\u904D\u5386 ${rec.progress?.files ?? 0} \u4E2A\u6587\u4EF6\uFF0C\u5019\u9009 ${rec.progress?.findings ?? 0}\u2026`);
  }
  return { ok: false, error: "\u7B49\u5F85\u8D85\u65F6\uFF1A\u626B\u63CF\u53EF\u80FD\u4ECD\u5728\u8FDB\u884C\uFF0C\u7A0D\u540E\u5230\u300C\u53D1\u73B0\u300D\u6216\u300C\u5386\u53F2\u300DTab \u67E5\u770B\u7ED3\u679C\u3002" };
}
async function saveSettings(s) {
  await kvSet(K.settings, s);
}
async function saveIgnore(list) {
  await kvSet(K.ignore, list);
}
async function purgeOwnKeys() {
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith("keyscan."));
  for (const k of mine) await kvDel(k).catch(() => {
  });
  return mine.length;
}
async function serviceStatus() {
  try {
    const list = await capDispatch("cap.pluginServiceManager", { action: "list_status" });
    const arr = Array.isArray(list) ? list : [];
    return arr.find((s) => s.pluginId === PLUGIN_ID && s.serviceId === SERVICE_ID) ?? null;
  } catch (_) {
    return null;
  }
}
async function serviceStart() {
  const disc = await capDispatch(
    "cap.pluginDiscovery",
    { action: "discover" }
  );
  const self = (disc.plugins ?? []).find((p) => p.id === PLUGIN_ID);
  const svc = self?.contributes?.services?.find((s) => s.id === SERVICE_ID);
  if (!self || !svc) throw new Error("\u63D2\u4EF6\u53D1\u73B0\u7ED3\u679C\u91CC\u627E\u4E0D\u5230\u672C\u63D2\u4EF6\u7684\u670D\u52A1\u8D21\u732E\u2014\u2014\u5C1D\u8BD5\u91CD\u542F Polaris \u540E\u518D\u8BD5\u3002");
  await capDispatch("cap.pluginServiceManager", {
    action: "start",
    pluginId: PLUGIN_ID,
    installPath: self.installPath,
    contribution: {
      id: svc.id,
      type: svc.type ?? svc.serviceType,
      command: svc.command,
      argsTemplate: Array.isArray(svc.argsTemplate) ? svc.argsTemplate : [],
      port: svc.port ?? null,
      healthCheck: svc.healthCheck ?? null,
      healthCheckTimeout: svc.healthCheckTimeout ?? null,
      autoStart: svc.autoStart ?? true,
      restartOnFailure: svc.restartOnFailure ?? true,
      maxRestarts: svc.maxRestarts ?? 3,
      description: svc.description ?? null
    }
  });
}
async function serviceAction(action) {
  await capDispatch("cap.pluginServiceManager", { action, pluginId: PLUGIN_ID, serviceId: SERVICE_ID });
}
var PLUGIN_ID, SERVICE_ID, K;
var init_model = __esm({
  "src/model.ts"() {
    "use strict";
    init_host();
    PLUGIN_ID = "keyscan";
    SERVICE_ID = "keyscan-service";
    K = {
      settings: "keyscan.settings",
      meta: "keyscan.meta",
      latest: "keyscan.latest",
      history: "keyscan.history",
      ignore: "keyscan.ignore",
      scan: (id) => `keyscan.scan.${id}`,
      find: (id, n) => `keyscan.find.${id}.${n}`,
      cmdScan: (nonce2) => `keyscan.cmd.scan.${nonce2}`,
      result: (nonce2) => `keyscan.result.${nonce2}`
    };
  }
});

// shared/scan-core.js
var require_scan_core = __commonJS({
  "shared/scan-core.js"(exports, module) {
    "use strict";
    var SKIP_DIRS = [
      "node_modules",
      ".git",
      ".svn",
      ".hg",
      "dist",
      "build",
      "out",
      ".next",
      ".nuxt",
      "coverage",
      "__pycache__",
      ".venv",
      "venv",
      "env",
      "target",
      ".idea",
      ".gradle",
      "vendor",
      "bower_components",
      ".terraform",
      ".pytest_cache",
      ".mypy_cache",
      ".tox",
      "obj",
      "bin",
      ".serverless",
      ".angular"
    ];
    var SKIP_FILES = [
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lockb",
      "bun.lock",
      "deno.lock",
      "cargo.lock",
      "poetry.lock",
      "pipfile.lock",
      "composer.lock",
      "gemfile.lock",
      "packages.lock"
    ];
    var SKIP_EXT = [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "bmp",
      "ico",
      "tif",
      "tiff",
      "avif",
      "heic",
      "mp4",
      "mov",
      "avi",
      "mkv",
      "webm",
      "mp3",
      "wav",
      "flac",
      "ogg",
      "m4a",
      "zip",
      "gz",
      "tgz",
      "bz2",
      "xz",
      "7z",
      "rar",
      "jar",
      "war",
      "apk",
      "ipa",
      "exe",
      "dll",
      "so",
      "dylib",
      "bin",
      "iso",
      "msi",
      "appimage",
      "dmg",
      "pkg",
      "deb",
      "rpm",
      "woff",
      "woff2",
      "ttf",
      "otf",
      "eot",
      "class",
      "pyd",
      "pdb",
      "lib",
      "obj",
      "o",
      "a",
      "wasm",
      "sqlite",
      "db",
      "db3",
      "mdb",
      "accdb",
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "psd",
      "ai",
      "sketch",
      "xd",
      "ds_store",
      "pyc"
    ];
    function isSkipDir(name) {
      return SKIP_DIRS.includes(String(name || "").toLowerCase());
    }
    function isSkipFile(name) {
      return SKIP_FILES.includes(String(name || "").toLowerCase());
    }
    function extOf(name) {
      const i = String(name || "").lastIndexOf(".");
      if (i <= 0) return "";
      return String(name).slice(i + 1).toLowerCase();
    }
    function isSkipExt(name) {
      return SKIP_EXT.includes(extOf(name));
    }
    function looksBinary(buf) {
      const n = Math.min(buf.length, 8192);
      for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
      return false;
    }
    function shannon(s) {
      if (!s) return 0;
      const freq = /* @__PURE__ */ new Map();
      for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
      let h = 0;
      const len = s.length;
      for (const c of freq.values()) {
        const p = c / len;
        h -= p * Math.log2(p);
      }
      return Math.round(h * 100) / 100;
    }
    function fnv1a64(str) {
      let h1 = 2166136261;
      let h2 = 2216829733;
      const p1 = 16777619;
      const p2 = 16777619 ^ 2654435769;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, p1) >>> 0;
        h2 = Math.imul(h2 ^ c + i, p2 >>> 0) >>> 0;
      }
      h1 = (h1 ^ h2 >>> 5) >>> 0;
      const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
      return hex(h1) + hex(h2);
    }
    var fingerprint = fnv1a64;
    function maskValue(v) {
      if (!v) return "\xAB\u7A7A\xBB";
      if (v.length <= 6) return "*".repeat(v.length);
      const head = v.slice(0, 4);
      const tail = v.length > 10 ? v.slice(-2) : "";
      return `${head}\u2026${tail ? tail : "****"}`;
    }
    var PLACEHOLDER_RE = new RegExp([
      "^(?:[xX*\\.\\-_=]{6,})$",
      // xxxxxx / ****** / ------
      "^(?:test|example|sample|dummy|fake|placeholder|none|null|nil|true|false|empty|default|unset|tbd)$",
      "^(?:your|my)[-_]?(?:key|token|secret|api|password|apikey)?[-_a-z0-9]*$",
      // your-key / your_key_here / MYAPIKEY123
      "^(?:change|replace)[-_]?(?:me|it|this|with|_?your[_-]?key.*)$",
      "^(?:todo|fixme|tbd|xxxx?|asdf|qwerty|123456|12345678|letmein|admin|password|passwd|secret|token|apikey|key)",
      "^(?:sk|pk|rk)?[-_]?(?:xxx|test|example|sample|placeholder)",
      // sk-xxxx / pk_test_...
      "\\$\\{",
      // ${VAR} 插值
      "%[A-Z0-9_]{1,60}%",
      // %VAR% Windows 插值
      "\\{\\{",
      // {{ var }} 模板
      "<[A-Za-z][A-Za-z0-9_ -]{0,60}>",
      // <your-key-here>
      "^\\$[A-Za-z0-9_]+$",
      // $VAR
      "^0+$"
    ].join("|"), "i");
    var PLACEHOLDER_SUBSTR_RE = /example|sample|placeholder|change[-_]?me|dummy|testkey|your[-_]?key|secret[-_]?here|key[-_]?here/i;
    var SEQUENTIAL_RE = /0123456789|abcdefghi|ijklmnopq|qrstuvwxy|qwertyuiop|asdfghjkl|zxcvbnm/i;
    function isPlaceholderValue(v) {
      if (!v) return true;
      const s = String(v).trim();
      return PLACEHOLDER_RE.test(s) || PLACEHOLDER_SUBSTR_RE.test(s) || SEQUENTIAL_RE.test(s);
    }
    var ENV_REF_RE = /process\.env\.|process\.env\[|os\.environ|getenv\s*\(|import\.meta\.env|ENV\[['"]/;
    var RULES2 = [
      {
        id: "aws-access-key",
        sev: "critical",
        label: "AWS \u8BBF\u95EE\u5BC6\u94A5 ID",
        desc: "\u5F62\u5982 AKIA/ASIA \u5F00\u5934\u7684 AWS \u8BBF\u95EE\u952E ID\uFF08\u5E38\u4E0E secret key \u6210\u5BF9\u51FA\u73B0\uFF09\u3002\u5904\u7F6E\uFF1A\u7ACB\u5373\u5230 AWS \u63A7\u5236\u53F0 IAM \u505C\u7528\u5E76\u8F6E\u6362\uFF0C\u68C0\u67E5 CloudTrail \u662F\u5426\u88AB\u6EE5\u7528\u3002",
        res: [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
        valueGroup: 0
      },
      {
        id: "aws-secret-key",
        sev: "critical",
        label: "AWS Secret \u8BBF\u95EE\u952E",
        desc: "AWS \u4E0A\u4E0B\u6587\u884C\u4E2D\u51FA\u73B0\u7684 40 \u4F4D Base64 \u5F62\u6001 Secret\u3002\u5904\u7F6E\uFF1A\u4E0E\u914D\u5957 Access Key \u4E00\u8D77\u5728 IAM \u8F6E\u6362\u3002",
        res: [/(?:aws|amazon)[^\n]{0,60}?['"]([A-Za-z0-9/+=]{40})['"]/i],
        valueGroup: 1,
        contextRe: /(?:aws|amazon)/i,
        entropyMin: 3.5
      },
      {
        id: "github-token",
        sev: "critical",
        label: "GitHub \u4EE4\u724C",
        desc: "ghp_/gho_/ghu_/ghs_/ghr_ \u6216 github_pat_ \u5F62\u6001\u7684 GitHub \u4EE4\u724C\u3002\u5904\u7F6E\uFF1AGitHub \u2192 Settings \u2192 Developer settings \u7ACB\u5373 revoke\uFF1B\u68C0\u67E5\u8D26\u53F7\u5B89\u5168\u65E5\u5FD7\u3002",
        res: [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,251}\b/, /\bgithub_pat_[A-Za-z0-9_]{20,251}\b/],
        valueGroup: 0
      },
      {
        id: "openai-key",
        sev: "critical",
        label: "OpenAI API \u5BC6\u94A5",
        desc: "\u542B T3BlbkFJ \u7279\u5F81\u6BB5\u6216 sk-proj-/sk-svcacct-/sk-admin- \u5F62\u6001\u7684 OpenAI \u5BC6\u94A5\u3002\u5904\u7F6E\uFF1Aplatform.openai.com \u64A4\u9500\u5E76\u8F6E\u6362\uFF0C\u67E5\u7528\u91CF\u8D26\u5355\u662F\u5426\u6709\u5F02\u5E38\u6D88\u8017\u3002",
        res: [/\bsk-[A-Za-z0-9_-]{16,}T3BlbkFJ[A-Za-z0-9_-]{8,}\b/, /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}\b/],
        valueGroup: 0
      },
      {
        id: "anthropic-key",
        sev: "critical",
        label: "Anthropic API \u5BC6\u94A5",
        desc: "sk-ant- \u5F62\u6001\u7684 Claude API \u5BC6\u94A5\u3002\u5904\u7F6E\uFF1Aconsole.anthropic.com \u64A4\u9500\u8F6E\u6362\uFF0C\u6838\u5BF9\u7528\u91CF\u3002",
        res: [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
        valueGroup: 0
      },
      {
        id: "google-api-key",
        sev: "critical",
        label: "Google API \u5BC6\u94A5",
        desc: "AIza \u5F62\u6001\u7684 Google API Key\u3002\u5904\u7F6E\uFF1AGoogle Cloud \u63A7\u5236\u53F0\u8F6E\u6362\uFF1B\u786E\u8BA4\u8BE5 key \u7684 API \u9650\u5236\u4E0E\u914D\u989D\u544A\u8B66\u3002",
        res: [/\bAIza[0-9A-Za-z_-]{35}\b/],
        valueGroup: 0
      },
      {
        id: "stripe-live-key",
        sev: "critical",
        label: "Stripe \u751F\u4EA7\u5BC6\u94A5",
        desc: "sk_live_/rk_live_ \u5F62\u6001\u7684 Stripe \u751F\u4EA7\u73AF\u5883\u5BC6\u94A5\uFF08pk_live \u662F\u516C\u5F00\u952E\u4E0D\u7B97\uFF09\u3002\u5904\u7F6E\uFF1ADashboard \u2192 Developers \u2192 API keys \u8F6E\u6362\uFF08roll\uFF09\u3002",
        res: [/\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/],
        valueGroup: 0
      },
      {
        id: "sendgrid-key",
        sev: "critical",
        label: "SendGrid API \u5BC6\u94A5",
        desc: "SG. \u5F00\u5934\u4E09\u6BB5\u5F0F SendGrid \u5BC6\u94A5\uFF0C\u6CC4\u9732\u540E\u5E38\u88AB\u7528\u4E8E\u53D1\u5783\u573E\u90AE\u4EF6\u3002\u5904\u7F6E\uFF1A\u7ACB\u5373\u5220\u9664\u5E76\u65B0\u5EFA\uFF0C\u68C0\u67E5\u53D1\u9001\u6D3B\u52A8\u8BB0\u5F55\u3002",
        res: [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/],
        valueGroup: 0
      },
      {
        id: "private-key-block",
        sev: "critical",
        label: "\u79C1\u94A5\u6587\u4EF6\u5757",
        desc: "-----BEGIN ... PRIVATE KEY----- \u79C1\u94A5 PEM \u5757\u3002\u5904\u7F6E\uFF1A\u786E\u8BA4\u8BE5\u79C1\u94A5\u5BF9\u5E94\u7684\u516C\u94A5\u662F\u5426\u5728\u751F\u4EA7\u4F7F\u7528\uFF0C\u662F\u5219\u7ACB\u5373\u8F6E\u6362\u8BC1\u4E66/\u5BC6\u94A5\u5BF9\u3002",
        res: [/^-----BEGIN [A-Z0-9 ]{0,30}PRIVATE KEY(?: BLOCK)?-----\s*$/],
        valueGroup: 0,
        valueRe: /PRIVATE KEY/,
        noMask: true
        // BEGIN 头是标准字面量非机密，掩码反而毁可读性
      },
      {
        id: "aliyun-access-key",
        sev: "high",
        label: "\u963F\u91CC\u4E91 AccessKey",
        desc: "LTAI \u5F00\u5934\u7684\u963F\u91CC\u4E91 AccessKey ID\u3002\u5904\u7F6E\uFF1ARAM \u63A7\u5236\u53F0\u7981\u7528\u5E76\u65B0\u5EFA\uFF1B\u5F00\u542F ActionTrail \u5BA1\u8BA1\u6392\u67E5\u6EE5\u7528\u3002",
        res: [/\bLTAI[0-9A-Za-z]{12,30}\b/],
        valueGroup: 0
      },
      {
        id: "tencent-secret",
        sev: "high",
        label: "\u817E\u8BAF\u4E91\u5BC6\u94A5",
        desc: "AKID \u5F00\u5934\u7684\u817E\u8BAF\u4E91 SecretId\u3002\u5904\u7F6E\uFF1A\u8BBF\u95EE\u7BA1\u7406 CAM \u63A7\u5236\u53F0\u7981\u7528\u8F6E\u6362\uFF0C\u67E5\u5BC6\u94A5 usage \u8BB0\u5F55\u3002",
        res: [/\bAKID[0-9A-Za-z]{13,50}\b/],
        valueGroup: 0
      },
      {
        id: "zhipu-key",
        sev: "high",
        label: "\u667A\u8C31 AI \u5BC6\u94A5",
        desc: "\u300C16 \u4F4D hex . 32 \u4F4D\u5B57\u6BCD\u6570\u5B57\u300D\u5F62\u6001\u7684\u667A\u8C31 GLM API Key\u3002\u5904\u7F6E\uFF1A\u5F00\u653E\u5E73\u53F0\u91CD\u7F6E key\u3002",
        res: [/\b[0-9a-f]{16}\.[A-Za-z0-9]{16,32}\b/],
        valueGroup: 0,
        entropyMin: 3
      },
      {
        id: "deepseek-key",
        sev: "high",
        label: "DeepSeek API \u5BC6\u94A5",
        desc: "sk- \u52A0 32 \u4F4D hex \u5F62\u6001\u7684 DeepSeek \u5BC6\u94A5\u3002\u5904\u7F6E\uFF1A\u5F00\u653E\u5E73\u53F0\u91CD\u7F6E\uFF0C\u67E5\u4F59\u989D\u53D8\u52A8\u3002",
        res: [/\bsk-[0-9a-f]{32}\b/],
        valueGroup: 0,
        entropyMin: 3
      },
      {
        id: "moonshot-key",
        sev: "high",
        label: "Moonshot/Kimi API \u5BC6\u94A5",
        desc: "sk- \u52A0 48 \u4F4D\u5B57\u6BCD\u6570\u5B57\u5F62\u6001\u7684 Moonshot \u5BC6\u94A5\u3002\u5904\u7F6E\uFF1A\u5E73\u53F0.moonshot.cn \u91CD\u7F6E\u3002\u6CE8\u610F\u4E0E\u5176\u4ED6 sk- \u5BC6\u94A5\u533A\u5206\u5F52\u5C5E\u3002",
        res: [/\bsk-[A-Za-z0-9]{48}\b/],
        valueGroup: 0,
        entropyMin: 3.5
      },
      {
        id: "slack-token",
        sev: "high",
        label: "Slack \u4EE4\u724C",
        desc: "xoxb-/xoxp-/xoxa-/xoxr-/xoxs- \u5F62\u6001\u7684 Slack \u4EE4\u724C\u3002\u5904\u7F6E\uFF1ASlack App \u7BA1\u7406\u9875 rotate\uFF0C\u68C0\u67E5\u5F02\u5E38\u6D88\u606F\u63A8\u9001\u3002",
        res: [/\bxox[bpars]-[0-9A-Za-z-]{10,}\b/],
        valueGroup: 0
      },
      {
        id: "wechat-appsecret",
        sev: "high",
        label: "\u5FAE\u4FE1 AppSecret",
        desc: "app_secret \u4E0A\u4E0B\u6587\u4E2D\u7684 32 \u4F4D hex \u503C\u3002AppSecret \u6CC4\u9732\u53EF\u88AB\u7528\u4E8E\u4F2A\u9020\u516C\u4F17\u53F7/\u5C0F\u7A0B\u5E8F\u63A5\u53E3\u8C03\u7528\u3002\u5904\u7F6E\uFF1A\u5FAE\u4FE1\u516C\u4F17\u5E73\u53F0\u91CD\u7F6E\u5E76\u540C\u6B65\u540E\u7AEF\u914D\u7F6E\u3002",
        res: [/\b([0-9a-f]{32})\b/],
        valueGroup: 1,
        contextRe: /app[_-]?secret|secret/i,
        entropyMin: 2.8
      },
      {
        id: "db-connection-string",
        sev: "high",
        label: "\u5E26\u51ED\u8BC1\u7684\u6570\u636E\u5E93\u8FDE\u63A5\u4E32",
        desc: "postgres/mysql/mongodb/redis/mssql \u7B49\u8FDE\u63A5\u4E32\u4E2D\u5185\u5D4C\u4E86\u7528\u6237\u540D:\u5BC6\u7801@\u3002\u5904\u7F6E\uFF1A\u8F6E\u6362\u8BE5\u6570\u636E\u5E93\u53E3\u4EE4\uFF0C\u6539\u7528\u73AF\u5883\u53D8\u91CF/\u5BC6\u94A5\u7BA1\u7406\u6CE8\u5165\u3002",
        res: [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql):\/\/[^\s'"@/:]{1,64}:([^\s'"@/]{3,})@[^\s'"]+/],
        valueGroup: 1,
        entropyMin: 2.5
      },
      {
        id: "jwt-token",
        sev: "medium",
        label: "JWT \u51ED\u8BC1",
        desc: "\u4E09\u6BB5\u5F0F JWT\uFF08\u53EF\u80FD\u53EA\u662F\u793A\u4F8B/\u8FC7\u671F\u6837\u672C\uFF0C\u4E5F\u53EF\u80FD\u662F\u6709\u751F\u4EA7\u6743\u9650\u7684\u4F1A\u8BDD\u51ED\u8BC1\uFF09\u3002\u5904\u7F6E\uFF1A\u89E3 payload \u786E\u8BA4\u7B7E\u53D1\u65B9\u4E0E exp\uFF0C\u751F\u4EA7\u51ED\u8BC1\u6309\u6CC4\u9732\u5904\u7406\u3002",
        res: [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
        valueGroup: 0
      },
      {
        id: "generic-secret-assignment",
        sev: "high",
        label: "\u53EF\u7591\u7684\u5BC6\u94A5\u5B57\u9762\u91CF\u8D4B\u503C",
        desc: "password/secret/api_key/token \u7B49\u5B57\u6BB5\u88AB\u8D4B\u4E86\u4E00\u4E2A\u9AD8\u71B5\u5B57\u9762\u91CF\uFF08\u4E0D\u50CF\u5360\u4F4D\u7B26\u4E5F\u4E0D\u50CF\u73AF\u5883\u53D8\u91CF\u5F15\u7528\uFF09\u3002\u5904\u7F6E\uFF1A\u9010\u6761\u786E\u8BA4\uFF0C\u771F\u5B9E\u51ED\u8BC1\u7ACB\u5373\u8F6E\u6362\u5E76\u6539\u4E3A\u4ECE\u73AF\u5883\u6CE8\u5165\u3002",
        res: [/\b(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key(?:[_-]?secret)?|auth[_-]?token|client[_-]?secret|private[_-]?key|token)\b["']?\s*[:=]\s*["']([^"'\s\\]{8,160})["']/],
        valueGroup: 1,
        entropyMin: 3.4
      },
      {
        id: "env-real-value",
        sev: "medium",
        label: ".env \u6587\u4EF6\u4E2D\u7684\u5BC6\u94A5\u5F62\u6001\u503C",
        desc: ".env \u7C7B\u6587\u4EF6\u4E2D KEY/TOKEN/SECRET/PASSWORD \u7C7B\u5B57\u6BB5\u88AB\u8D4B\u4E86\u771F\u5B9E\u5F62\u6001\u7684\u503C\u3002.env \u672C\u8EAB\u7528\u4E8E\u672C\u5730\u6CA1\u95EE\u9898\uFF0C\u4F46\u9700\u786E\u8BA4\uFF1A\u672A\u88AB\u63D0\u4EA4\u8FDB\u4ED3\u5E93\u3001\u672A\u88AB\u6253\u8FDB\u955C\u50CF/\u5206\u53D1\u5305\u3001\u672A\u51FA\u73B0\u5728\u804A\u5929/\u7F51\u76D8\u540C\u6B65\u91CC\u3002",
        res: [/^\s*(?:export\s+)?([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH)[A-Za-z0-9_]*)\s*=\s*["']?([^"'\s#]{6,200})["']?\s*(?:#.*)?$/],
        valueGroup: 2,
        onlyBasename: /^\.env(?:\..*)?$|^\.env$/i,
        entropyMin: 2.8
      }
    ];
    var RULE_MAP = new Map(RULES2.map((r) => [r.id, r]));
    var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    function scanText(text, opts) {
      const relFile = opts && opts.relFile ? String(opts.relFile).replace(/\\/g, "/") : "";
      const enabled = opts && opts.enabledRules ? opts.enabledRules : null;
      const base = relFile.split("/").pop() || "";
      const out = [];
      const lines = String(text || "").split("\n");
      for (const rule of RULES2) {
        if (enabled && !enabled.has(rule.id)) continue;
        if (rule.onlyBasename && !rule.onlyBasename.test(base)) continue;
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          if (!line) continue;
          for (const re of rule.res) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(line)) !== null) {
              const value = m[rule.valueGroup || 0];
              if (!value || m[0].length === 0) {
                re.lastIndex = 0;
                break;
              }
              if (rule.contextRe && !rule.contextRe.test(line)) break;
              if (isPlaceholderValue(value)) {
                if (re.global) continue;
                break;
              }
              if (rule.entropyMin && shannon(value) < rule.entropyMin) {
                if (re.global) continue;
                break;
              }
              if (rule.valueRe && !rule.valueRe.test(m[0])) {
                if (re.global) continue;
                break;
              }
              if (rule.id === "generic-secret-assignment" && ENV_REF_RE.test(line)) {
                if (re.global) continue;
                break;
              }
              out.push({
                fp: fingerprint(`${rule.id}|${value}`),
                rule: rule.id,
                sev: rule.sev,
                preview: rule.noMask ? m[0] : maskValue(value),
                ctx: rule.noMask ? line.slice(0, 240) : maskLine(line, re, rule.valueGroup || 0).slice(0, 240),
                file: relFile,
                line: li + 1
              });
              if (!re.global) break;
              if (m.index === re.lastIndex) re.lastIndex++;
              if (out.length > 5e3) return out;
            }
          }
        }
      }
      return out;
    }
    function maskLine(line, re, valueGroup) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let masked = line;
      try {
        masked = line.replace(g, (...args) => {
          const groups = args.slice(0, -2);
          const full = args[0];
          const val = groups[valueGroup] !== void 0 ? groups[valueGroup] : full;
          return String(full).replace(String(val), maskValue(String(val)));
        });
      } catch (_) {
        return "\xAB\u4E0A\u4E0B\u6587\u4E0D\u53EF\u5C55\u793A\xBB";
      }
      return masked;
    }
    function aggregateFindings(raw) {
      const map = /* @__PURE__ */ new Map();
      for (const f of raw || []) {
        const ex = map.get(f.fp);
        if (ex) {
          ex.count++;
          if (ex.occurrences.length < 5) ex.occurrences.push({ file: f.file, line: f.line });
        } else {
          map.set(f.fp, {
            fp: f.fp,
            rule: f.rule,
            sev: f.sev,
            preview: f.preview,
            ctx: f.ctx,
            count: 1,
            occurrences: [{ file: f.file, line: f.line }],
            firstFile: f.file
          });
        }
      }
      const list = [...map.values()];
      list.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || (a.rule < b.rule ? -1 : 1));
      return list;
    }
    function diffFindings(currList, prevFps) {
      const prev = prevFps instanceof Set ? prevFps : new Set(prevFps || []);
      let newCount = 0, newCritical = 0, newHigh = 0;
      for (const f of currList || []) {
        if (prev.has(f.fp)) continue;
        newCount++;
        if (f.sev === "critical") newCritical++;
        else if (f.sev === "high") newHigh++;
      }
      return { newCount, newCritical, newHigh };
    }
    function countSeverities(list) {
      const c = { critical: 0, high: 0, medium: 0 };
      for (const f of list || []) if (c[f.sev] !== void 0) c[f.sev]++;
      return c;
    }
    function applyIgnores(findings, ignoreList) {
      if (!Array.isArray(ignoreList) || !ignoreList.length) return findings;
      const ig = new Set(ignoreList.map((x) => x && x.fp).filter(Boolean));
      return (findings || []).filter((f) => !ig.has(f.fp));
    }
    function filterFindings(findings, q) {
      const { severity, ruleId, search } = q || {};
      let list = findings || [];
      if (severity && severity !== "all") list = list.filter((f) => f.sev === severity);
      if (ruleId && ruleId !== "all") list = list.filter((f) => f.rule === ruleId);
      if (search) {
        const s = String(search).toLowerCase();
        list = list.filter((f) => (f.file || "").toLowerCase().includes(s) || (f.ctx || "").toLowerCase().includes(s) || (f.preview || "").toLowerCase().includes(s));
      }
      return list;
    }
    var DEFAULT_SETTINGS = {
      root: "",
      maxFileKB: 1024,
      // 单文件上限（超过跳过）
      maxFiles: 2e5,
      // 单次扫描文件数上限（诚实降级：标记 truncated）
      maxTotalMB: 1024,
      // 单次扫描累计读取上限（MB）
      disabledRules: [],
      // 关掉的规则 id
      ctxLines: 1
      // 上下文行数（预留，当前实现按行独立扫）
    };
    module.exports = {
      RULES: RULES2,
      RULE_MAP,
      SEV_ORDER,
      DEFAULT_SETTINGS,
      SKIP_DIRS,
      SKIP_FILES,
      SKIP_EXT,
      shannon,
      maskValue,
      fingerprint,
      isSkipDir,
      isSkipFile,
      isSkipExt,
      extOf,
      looksBinary,
      isPlaceholderValue,
      ENV_REF_RE,
      scanText,
      maskLine,
      aggregateFindings,
      diffFindings,
      countSeverities,
      applyIgnores,
      filterFindings
    };
  }
});

// src/Panel.tsx
init_model();
import { useCallback as useCallback5, useEffect as useEffect5, useState as useState5 } from "react";

// src/ScanTab.tsx
init_model();
import { useCallback, useEffect, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var LAST_ROOT_KEY = "keyscan.ui.lastRoot";
function ScanTab({ head, onChanged, onGoFindings }) {
  const [root, setRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    kvGet(LAST_ROOT_KEY).then((v) => {
      if (v) setRoot(v);
    });
    kvSet("keyscan.ui.loaded", true).catch(() => {
    });
  }, []);
  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    setResult(null);
    setTick("");
    void kvSet(LAST_ROOT_KEY, root.trim());
    try {
      const out = await requestScan(root, (info) => setTick(info));
      if (out.ok) {
        const c = out.counts ?? { critical: 0, high: 0, medium: 0 };
        const nw = out.new ?? { newCount: 0, newCritical: 0, newHigh: 0 };
        setResult(
          `\u53D1\u73B0 ${out.findingCount ?? 0} \u5904\u7591\u4F3C\u5BC6\u94A5\uFF08\u{1F534}${c.critical} \u{1F7E0}${c.high} \u{1F7E1}${c.medium}\uFF09\uFF0C\u65B0\u589E ${nw.newCount}\uFF08\u{1F534}${nw.newCritical} \u{1F7E0}${nw.newHigh}\uFF09\uFF0C\u6587\u4EF6 ${out.files ?? 0} \u4E2A\uFF0C\u7528\u65F6 ${Math.round((out.durationMs ?? 0) / 1e3)}s` + (out.truncated ? "\uFF08\u5DF2\u8FBE\u4E0A\u9650\uFF0C\u672A\u626B\u5168\uFF09" : "")
        );
        onChanged();
      } else {
        setErr(out.error || "\u626B\u63CF\u5931\u8D25");
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
      setTick("");
    }
  }, [busy, root, onChanged]);
  const saveDefaultRoot = useCallback(async () => {
    const s = {};
    try {
      const cur = await Promise.resolve().then(() => (init_model(), model_exports)).then((m) => m.kvGet("keyscan.settings"));
      Object.assign(s, cur ?? {});
    } catch (_) {
    }
    s.root = root.trim();
    await saveSettings(s);
    setTick("\u5DF2\u8BBE\u4E3A\u9ED8\u8BA4\u626B\u63CF\u6839\uFF08\u8BBE\u7F6E\u91CC\u53EF\u6539\uFF09");
  }, [root]);
  const scanning = head.meta?.scanning;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "ks-bar" }),
      "\u53D1\u8D77\u626B\u63CF",
      /* @__PURE__ */ jsx("span", { className: "ks-hint", children: "\u53EA\u8BFB \xB7 \u96F6\u5916\u7F51 \xB7 \u62A5\u544A\u5168\u63A9\u7801" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ks-card", children: /* @__PURE__ */ jsxs("div", { className: "ks-card-b", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "ks-inp ks-mono",
          placeholder: "\u8981\u626B\u63CF\u7684\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\\\work\\\\my-project",
          value: root,
          onChange: (e) => setRoot(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !busy) void start();
          }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginTop: 9 }, children: [
        /* @__PURE__ */ jsx("button", { className: "ks-btn", disabled: busy || !root.trim(), onClick: () => void start(), children: busy ? "\u626B\u63CF\u4E2D\u2026" : "\u5F00\u59CB\u626B\u63CF" }),
        /* @__PURE__ */ jsx("button", { className: "ks-btn ghost", disabled: busy || !root.trim(), onClick: () => void saveDefaultRoot(), children: "\u8BBE\u4E3A\u9ED8\u8BA4" })
      ] }),
      tick && /* @__PURE__ */ jsx("div", { className: "ks-sub", style: { marginTop: 8 }, children: tick }),
      err && /* @__PURE__ */ jsx("div", { className: "ks-err", style: { paddingLeft: 0, marginTop: 6 }, children: err }),
      scanning && /* @__PURE__ */ jsx("div", { className: "ks-sub", style: { marginTop: 8 }, children: /* @__PURE__ */ jsxs("span", { className: "ks-pulse", children: [
        "\u25CF \u670D\u52A1\u6B63\u5728\u626B\u63CF\uFF1A",
        scanning.root
      ] }) })
    ] }) }),
    result && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "ks-sec", children: [
        /* @__PURE__ */ jsx("span", { className: "ks-bar" }),
        "\u626B\u63CF\u7ED3\u679C"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "ks-card", children: /* @__PURE__ */ jsxs("div", { className: "ks-card-b", children: [
        /* @__PURE__ */ jsx("div", { className: "ks-sub", style: { fontSize: 11.5, color: "#C9D1D9" }, children: result }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: /* @__PURE__ */ jsx("button", { className: "ks-btn ghost", onClick: onGoFindings, children: "\u67E5\u770B\u53D1\u73B0\u660E\u7EC6 \u2192" }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "ks-bar" }),
      "\u6700\u8FD1\u4E00\u6B21\u626B\u63CF"
    ] }),
    /* @__PURE__ */ jsx(SummaryCard, { latest: head.latest, meta: head.meta, onGoFindings }),
    /* @__PURE__ */ jsxs("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx("span", { className: "ks-bar" }),
      "\u600E\u4E48\u7528"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ks-card", children: /* @__PURE__ */ jsx("div", { className: "ks-card-b", children: /* @__PURE__ */ jsxs("div", { className: "ks-sub", children: [
      "\xB7 push / \u53D1\u5E03\u524D\uFF0C\u628A\u9879\u76EE\u76EE\u5F55\u4E22\u8FDB\u6765\u626B\u4E00\u904D\uFF1B",
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u63A5\u624B\u964C\u751F\u4ED3\u5E93\u5148\u626B\u4E00\u904D\u518D\u88C5\u4F9D\u8D56\u8DD1\u4EE3\u7801\uFF1B",
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u5F00\u300C\u5386\u53F2\u300DTab \u770B\u4E24\u6B21\u626B\u63CF\u4E4B\u95F4\u7684",
      /* @__PURE__ */ jsx("strong", { className: "ks-new", children: "\u65B0\u589E\u6CC4\u9732" }),
      "\uFF1B",
      /* @__PURE__ */ jsx("br", {}),
      "\xB7 \u6216\u76F4\u63A5\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u626B\u4E00\u4E0B D:\\\\work\\\\xxx \u6709\u6CA1\u6709\u6CC4\u9732\u5BC6\u94A5\u300D\u3002"
    ] }) }) })
  ] });
}
function SummaryCard({ latest, meta, onGoFindings }) {
  if (!latest) {
    return /* @__PURE__ */ jsx("div", { className: "ks-card", children: /* @__PURE__ */ jsxs("div", { className: "ks-empty", children: [
      "\u8FD8\u6CA1\u6709\u626B\u63CF\u8BB0\u5F55\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u586B\u4E0A\u9762\u8DEF\u5F84\u70B9\u300C\u5F00\u59CB\u626B\u63CF\u300D\uFF0C\u6216\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u626B\u4E00\u4E0B\u67D0\u76EE\u5F55\u6709\u6CA1\u6709\u6CC4\u9732\u5BC6\u94A5\u300D\u3002"
    ] }) });
  }
  const c = latest.counts ?? { critical: 0, high: 0, medium: 0 };
  const nw = latest.new ?? { newCount: 0, newCritical: 0, newHigh: 0 };
  return /* @__PURE__ */ jsx("div", { className: "ks-card", children: /* @__PURE__ */ jsxs("div", { className: "ks-card-b", children: [
    /* @__PURE__ */ jsxs("div", { className: "ks-sum", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("b", { className: "ks-crit", children: c.critical }),
        /* @__PURE__ */ jsx("small", { children: "\u{1F534} \u4E25\u91CD" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("b", { className: "ks-high", children: c.high }),
        /* @__PURE__ */ jsx("small", { children: "\u{1F7E0} \u9AD8\u5371" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("b", { className: "ks-med", children: c.medium }),
        /* @__PURE__ */ jsx("small", { children: "\u{1F7E1} \u4E2D\u5371" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("b", { className: nw.newCount > 0 ? "ks-new" : "", children: nw.newCount }),
        /* @__PURE__ */ jsx("small", { children: "\u65B0\u589E vs \u57FA\u7EBF" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ks-sub", children: [
      latest.root,
      " \xB7 ",
      new Date(latest.at).toLocaleString(),
      " \xB7 ",
      latest.files ?? "?",
      " \u6587\u4EF6 \xB7 ",
      Math.round((latest.durationMs ?? 0) / 1e3),
      "s",
      meta?.degraded ? " \xB7 \u26A0 \u6865\u964D\u7EA7" : ""
    ] }),
    (latest.findingCount ?? 0) > 0 && /* @__PURE__ */ jsx("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx("button", { className: "ks-btn ghost sm", onClick: onGoFindings, children: "\u67E5\u770B\u53D1\u73B0\u660E\u7EC6 \u2192" }) })
  ] }) });
}

// src/FindingsTab.tsx
init_model();
import { useCallback as useCallback2, useEffect as useEffect2, useMemo, useState as useState2 } from "react";
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SEVS = ["all", "critical", "high", "medium"];
var SEV_CN = { all: "\u5168\u90E8", critical: "\u{1F534} \u4E25\u91CD", high: "\u{1F7E0} \u9AD8\u5371", medium: "\u{1F7E1} \u4E2D\u5371" };
var PAGE = 50;
function FindingsTab({ head }) {
  const [scanId, setScanId] = useState2("");
  const [record, setRecord] = useState2(null);
  const [findings, setFindings] = useState2([]);
  const [ignore, setIgnore] = useState2([]);
  const [sev, setSev] = useState2("all");
  const [search, setSearch] = useState2("");
  const [limit, setLimit] = useState2(PAGE);
  const [loading, setLoading] = useState2(false);
  const [err, setErr] = useState2("");
  const [running, setRunning] = useState2(false);
  useEffect2(() => {
    const mid = head.meta?.scanning?.id;
    if (mid) {
      setScanId(mid);
      setRunning(true);
    } else {
      setRunning(false);
      setScanId((cur) => cur && head.meta?.scanning ? cur : head.latest?.id ?? cur);
    }
  }, [head.meta?.scanning?.id, head.latest?.id]);
  const load = useCallback2(async (id) => {
    if (!id) {
      setRecord(null);
      setFindings([]);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const [rec, list, ig] = await Promise.all([loadScanRecord(id), loadFindings(id), loadIgnore()]);
      setRecord(rec);
      setFindings(list);
      setIgnore(ig);
      if (!rec) setErr(`\u626B\u63CF\u8BB0\u5F55 ${id} \u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u6E05\u7406\uFF0C\u53EA\u4FDD\u7559\u6700\u8FD1 5 \u4EFD\uFF09\u3002`);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect2(() => {
    if (scanId) void load(scanId);
    else {
      setRecord(null);
      setFindings([]);
    }
  }, [scanId, load]);
  useEffect2(() => {
    if (!running || !scanId) return;
    const t = setInterval(() => void load(scanId), 3e3);
    return () => clearInterval(t);
  }, [running, scanId, load]);
  const filtered = useMemo(() => {
    let list = findings;
    if (sev !== "all") list = list.filter((f) => f.sev === sev);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((f) => (f.occurrences[0]?.file ?? "").toLowerCase().includes(s) || f.ctx.toLowerCase().includes(s) || f.rule.includes(s));
    }
    return list;
  }, [findings, sev, search]);
  const ignoreFp = useCallback2(async (fp) => {
    const next = [...ignore, { fp, note: "\u9762\u677F\u6807\u8BB0\u8BEF\u62A5", at: Date.now() }];
    setIgnore(next);
    await saveIgnore(next);
    setFindings((cur) => cur.filter((f) => f.fp !== fp));
  }, [ignore]);
  const unignoreFp = useCallback2(async (fp) => {
    const next = ignore.filter((x) => x.fp !== fp);
    setIgnore(next);
    await saveIgnore(next);
    void load(scanId);
  }, [ignore, scanId]);
  const ignoredSet = useMemo(() => new Set(ignore.map((x) => x.fp)), [ignore]);
  const c = record?.counts;
  const nw = record?.new;
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx2("span", { className: "ks-bar" }),
      "\u53D1\u73B0\u660E\u7EC6",
      /* @__PURE__ */ jsx2("span", { className: "ks-hint", children: record?.status === "running" ? "\u626B\u63CF\u8FDB\u884C\u4E2D\u2026" : record ? `${filtered.length}/${findings.length} \u6761` : "" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "ks-card", children: /* @__PURE__ */ jsxs2("div", { className: "ks-card-b", children: [
      record && /* @__PURE__ */ jsxs2("div", { className: "ks-sub", style: { marginBottom: 8 }, children: [
        record.root,
        " \xB7 ",
        record.status === "running" ? /* @__PURE__ */ jsxs2("span", { className: "ks-pulse", children: [
          "\u5DF2\u904D\u5386 ",
          record.progress?.files ?? 0,
          " \u6587\u4EF6\uFF0C\u5019\u9009 ",
          record.progress?.findings ?? 0
        ] }) : /* @__PURE__ */ jsxs2(Fragment2, { children: [
          "\u6587\u4EF6 ",
          record.files ?? "?",
          " \xB7 \u7528\u65F6 ",
          Math.round((record.durationMs ?? 0) / 1e3),
          "s",
          record.truncated ? ` \xB7 \u26A0 \u622A\u65AD\uFF08${record.truncatedReason}\uFF09` : "",
          record.ignoredCount ? ` \xB7 \u5FFD\u7565\u8868\u6EE4\u6389 ${record.ignoredCount} \u6761` : ""
        ] })
      ] }),
      c && record?.status === "done" && /* @__PURE__ */ jsxs2("div", { className: "ks-sum", children: [
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: "ks-crit", children: c.critical }),
          /* @__PURE__ */ jsx2("small", { children: "\u{1F534} \u4E25\u91CD" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: "ks-high", children: c.high }),
          /* @__PURE__ */ jsx2("small", { children: "\u{1F7E0} \u9AD8\u5371" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: "ks-med", children: c.medium }),
          /* @__PURE__ */ jsx2("small", { children: "\u{1F7E1} \u4E2D\u5371" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("b", { className: (nw?.newCount ?? 0) > 0 ? "ks-new" : "", children: nw?.newCount ?? 0 }),
          /* @__PURE__ */ jsx2("small", { children: "\u65B0\u589E" })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }, children: SEVS.map((s) => /* @__PURE__ */ jsx2("button", { className: `ks-tab ${sev === s ? "on" : ""}`, style: { background: sev === s ? "#1C2330" : "transparent" }, onClick: () => setSev(s), children: SEV_CN[s] }, s)) }),
      /* @__PURE__ */ jsx2("input", { className: "ks-inp", placeholder: "\u6309\u6587\u4EF6\u8DEF\u5F84 / \u4E0A\u4E0B\u6587 / \u89C4\u5219\u540D\u8FC7\u6EE4\u2026", value: search, onChange: (e) => setSearch(e.target.value) }),
      record?.status === "failed" && /* @__PURE__ */ jsxs2("div", { className: "ks-err", style: { paddingLeft: 0, marginTop: 6 }, children: [
        "\u626B\u63CF\u5931\u8D25\uFF1A",
        record.error
      ] }),
      err && /* @__PURE__ */ jsx2("div", { className: "ks-err", style: { paddingLeft: 0, marginTop: 6 }, children: err }),
      loading && /* @__PURE__ */ jsx2("div", { className: "ks-sub", style: { marginTop: 6 }, children: "\u52A0\u8F7D\u4E2D\u2026" })
    ] }) }),
    !record && !loading && /* @__PURE__ */ jsx2("div", { className: "ks-card", children: /* @__PURE__ */ jsxs2("div", { className: "ks-empty", children: [
      "\u8FD8\u6CA1\u6709\u53EF\u770B\u7684\u626B\u63CF\u3002",
      /* @__PURE__ */ jsx2("br", {}),
      "\u53BB\u300C\u626B\u63CF\u300DTab \u53D1\u8D77\u4E00\u6B21\uFF0C\u6216\u5BF9 AI \u8BF4\u300C\u5E2E\u6211\u626B\u4E00\u4E0B\u67D0\u76EE\u5F55\u300D\u3002"
    ] }) }),
    filtered.slice(0, limit).map((f) => {
      const rule = f.rule;
      const occ0 = f.occurrences[0];
      return /* @__PURE__ */ jsx2("div", { className: "ks-card", style: { margin: "0 16px 8px" }, children: /* @__PURE__ */ jsxs2("div", { className: "ks-row", style: { border: "none" }, children: [
        /* @__PURE__ */ jsxs2("div", { className: "ks-row-h", children: [
          /* @__PURE__ */ jsx2("span", { className: `ks-sev ${f.sev}`, children: SEV_CN[f.sev] ?? f.sev }),
          /* @__PURE__ */ jsx2("b", { style: { fontSize: 12 }, children: rule }),
          f.count > 1 && /* @__PURE__ */ jsxs2("span", { className: "ks-tag", children: [
            "\u51FA\u73B0 ",
            f.count,
            " \u6B21"
          ] }),
          /* @__PURE__ */ jsxs2("span", { className: "ks-muted", style: { marginLeft: "auto", fontSize: 9.5 }, children: [
            "\u6307\u7EB9 ",
            f.fp
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "ks-row-file ks-mono", style: { marginTop: 4 }, children: [
          occ0?.file,
          ":",
          occ0?.line,
          f.count > 1 && f.occurrences.slice(1, 3).map((o, i) => ` \xB7 ${o.file}:${o.line}`),
          f.count > 3 ? ` \u7B49 ${f.count} \u5904` : ""
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "ks-ctx", children: f.ctx }),
        /* @__PURE__ */ jsxs2("div", { className: "ks-sub", style: { marginTop: 5 }, children: [
          "\u9884\u89C8 ",
          /* @__PURE__ */ jsx2("span", { className: "ks-mono", children: f.preview }),
          "\uFF08\u5B8C\u6574\u503C\u5728\u88AB\u626B\u6587\u4EF6\u91CC\uFF09"
        ] }),
        /* @__PURE__ */ jsx2("div", { style: { display: "flex", gap: 8, marginTop: 7 }, children: ignoredSet.has(f.fp) ? /* @__PURE__ */ jsx2("button", { className: "ks-btn ghost sm", onClick: () => void unignoreFp(f.fp), children: "\u5DF2\u5FFD\u7565 \xB7 \u6062\u590D\u62A5\u544A" }) : /* @__PURE__ */ jsx2("button", { className: "ks-btn ghost sm", onClick: () => void ignoreFp(f.fp), children: "\u8BEF\u62A5\uFF0C\u5FFD\u7565\u8FD9\u6761" }) })
      ] }) }, f.fp);
    }),
    filtered.length > limit && /* @__PURE__ */ jsx2("div", { style: { textAlign: "center", paddingBottom: 10 }, children: /* @__PURE__ */ jsxs2("button", { className: "ks-btn ghost sm", onClick: () => setLimit((l) => l + PAGE), children: [
      "\u52A0\u8F7D\u66F4\u591A\uFF08\u5269 ",
      filtered.length - limit,
      " \u6761\uFF09"
    ] }) }),
    record?.status === "done" && filtered.length === 0 && findings.length > 0 && /* @__PURE__ */ jsx2("div", { className: "ks-empty", children: "\u8FC7\u6EE4\u540E 0 \u6761\u2014\u2014\u653E\u5BBD\u4E25\u91CD\u5EA6/\u641C\u7D22\u6761\u4EF6\u8BD5\u8BD5\u3002" }),
    record?.status === "done" && findings.length === 0 && /* @__PURE__ */ jsx2("div", { className: "ks-card", children: /* @__PURE__ */ jsxs2("div", { className: "ks-empty", children: [
      "\u8FD9\u6B21\u626B\u63CF\u6CA1\u6709\u53D1\u73B0\u7591\u4F3C\u5BC6\u94A5 \u{1F389}",
      /* @__PURE__ */ jsx2("br", {}),
      "\u4FDD\u6301\u4E60\u60EF\uFF1A\u6BCF\u6B21 push \u524D\u626B\u4E00\u904D\u3002"
    ] }) })
  ] });
}

// src/HistoryTab.tsx
init_model();
import { useCallback as useCallback3, useEffect as useEffect3, useState as useState3 } from "react";
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function HistoryTab({ onGoFindings }) {
  const [history, setHistory] = useState3([]);
  const [loading, setLoading] = useState3(true);
  const [err, setErr] = useState3("");
  const load = useCallback3(async () => {
    setLoading(true);
    try {
      const d = await loadPanelData();
      setHistory(d.history);
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect3(() => {
    void load();
  }, [load]);
  const maxFindings = Math.max(1, ...history.map((h) => h.findingCount ?? 0));
  return /* @__PURE__ */ jsxs3(Fragment3, { children: [
    /* @__PURE__ */ jsxs3("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx3("span", { className: "ks-bar" }),
      "\u626B\u63CF\u5386\u53F2",
      /* @__PURE__ */ jsxs3("span", { className: "ks-hint", children: [
        "\u6700\u8FD1 ",
        history.length,
        " \u6B21"
      ] })
    ] }),
    history.length >= 2 && /* @__PURE__ */ jsx3("div", { className: "ks-card", children: /* @__PURE__ */ jsxs3("div", { className: "ks-card-b", children: [
      /* @__PURE__ */ jsx3("div", { className: "ks-sub", style: { marginBottom: 6 }, children: "\u53D1\u73B0\u6570\u8D8B\u52BF\uFF08\u67F1\u9AD8=\u8BE5\u6B21\u53D1\u73B0\u603B\u6570\uFF0C\u7EA2\u6BB5=\u65B0\u589E\uFF09" }),
      /* @__PURE__ */ jsx3(TrendChart, { history: history.slice(0, 12).reverse(), max: maxFindings })
    ] }) }),
    loading && /* @__PURE__ */ jsx3("div", { className: "ks-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }),
    err && /* @__PURE__ */ jsx3("div", { className: "ks-err", children: err }),
    !loading && !err && history.length === 0 && /* @__PURE__ */ jsx3("div", { className: "ks-card", children: /* @__PURE__ */ jsxs3("div", { className: "ks-empty", children: [
      "\u8FD8\u6CA1\u6709\u626B\u63CF\u5386\u53F2\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u53BB\u300C\u626B\u63CF\u300DTab \u53D1\u8D77\u7B2C\u4E00\u6B21\u5B89\u68C0\u3002"
    ] }) }),
    history.map((h) => {
      const c = h.counts ?? { critical: 0, high: 0, medium: 0 };
      const nw = h.new ?? { newCount: 0, newCritical: 0, newHigh: 0 };
      return /* @__PURE__ */ jsx3("div", { className: "ks-card", style: { margin: "0 16px 8px" }, children: /* @__PURE__ */ jsxs3("div", { className: "ks-card-b", style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs3("div", { style: { flex: 1, minWidth: 180 }, children: [
          /* @__PURE__ */ jsxs3("div", { style: { fontSize: 11.5 }, children: [
            /* @__PURE__ */ jsx3("b", { children: new Date(h.at).toLocaleString() }),
            nw.newCount > 0 && /* @__PURE__ */ jsxs3("span", { className: "ks-sev critical", style: { marginLeft: 6 }, children: [
              "\u65B0\u589E ",
              nw.newCount
            ] }),
            h.truncated && /* @__PURE__ */ jsx3("span", { className: "ks-tag", style: { marginLeft: 6 }, children: "\u622A\u65AD" })
          ] }),
          /* @__PURE__ */ jsx3("div", { className: "ks-sub ks-mono", style: { marginTop: 2, wordBreak: "break-all" }, children: h.root }),
          /* @__PURE__ */ jsxs3("div", { className: "ks-sub", style: { marginTop: 2 }, children: [
            h.files ?? "?",
            " \u6587\u4EF6 \xB7 ",
            Math.round((h.durationMs ?? 0) / 1e3),
            "s \xB7 \u{1F534}",
            c.critical,
            " \u{1F7E0}",
            c.high,
            " \u{1F7E1}",
            c.medium,
            " \xB7 \u5171 ",
            h.findingCount ?? 0,
            " \u6761"
          ] })
        ] }),
        /* @__PURE__ */ jsx3("button", { className: "ks-btn ghost sm", onClick: onGoFindings, children: "\u770B\u660E\u7EC6" })
      ] }) }, h.id);
    })
  ] });
}
function TrendChart({ history, max }) {
  const W = 100;
  const H = 56;
  const n = history.length;
  const bw = n ? W / n * 0.62 : 0;
  return /* @__PURE__ */ jsx3("svg", { viewBox: `0 0 ${W} ${H + 10}`, style: { width: "100%", display: "block" }, preserveAspectRatio: "none", children: history.map((h, i) => {
    const total = h.findingCount ?? 0;
    const fresh = h.new?.newCount ?? 0;
    const base = total / max * H;
    const freshH = Math.min(base, fresh / max * H);
    const x = n > 1 ? i * W / (n - 1) - bw / 2 : W / 2 - bw / 2;
    return /* @__PURE__ */ jsxs3("g", { children: [
      /* @__PURE__ */ jsx3("rect", { x, y: H - base, width: bw, height: Math.max(base, 0.8), rx: 1.2, fill: "#2b6cb0" }),
      fresh > 0 && base > 0 && /* @__PURE__ */ jsx3("rect", { x, y: H - base, width: bw, height: Math.max(freshH, 0.8), rx: 1.2, fill: "#F85149" }),
      /* @__PURE__ */ jsx3("text", { x: x + bw / 2, y: H + 8, fontSize: 5, fill: "#5C6678", textAnchor: "middle", children: new Date(h.at).toLocaleDateString().slice(5) })
    ] }, h.id);
  }) });
}

// src/SettingsTab.tsx
init_model();
var import_scan_core = __toESM(require_scan_core());
import { useCallback as useCallback4, useEffect as useEffect4, useState as useState4 } from "react";
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function SettingsTab({ head, onChanged }) {
  const [settings, setSettings] = useState4({});
  const [ignore, setIgnore] = useState4([]);
  const [svc, setSvc] = useState4(null);
  const [busy, setBusy] = useState4("");
  const [msg, setMsg] = useState4("");
  const [confirmPurge, setConfirmPurge] = useState4(false);
  useEffect4(() => {
    kvGet("keyscan.settings").then((s) => setSettings(s ?? {}));
    kvGet("keyscan.ignore").then((s) => setIgnore(s ?? []));
  }, []);
  const refreshSvc = useCallback4(async () => {
    const { serviceStatus: serviceStatus2 } = await Promise.resolve().then(() => (init_model(), model_exports));
    setSvc(await serviceStatus2());
  }, []);
  useEffect4(() => {
    void refreshSvc();
  }, [refreshSvc, head.meta?.lastTickAt]);
  const patch = useCallback4((p) => {
    setSettings((cur) => ({ ...cur, ...p }));
  }, []);
  const persist = useCallback4(async (s) => {
    await saveSettings(s);
    setMsg("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u4E00\u6B21\u626B\u63CF\u751F\u6548");
    setTimeout(() => setMsg(""), 2500);
  }, []);
  const toggleRule = useCallback4((id) => {
    setSettings((cur) => {
      const off = new Set(cur.disabledRules ?? []);
      if (off.has(id)) off.delete(id);
      else off.add(id);
      const next = { ...cur, disabledRules: [...off] };
      void saveSettings(next);
      return next;
    });
  }, []);
  const doSvc = useCallback4(async (action) => {
    setBusy(action);
    setMsg("");
    try {
      if (action === "start") await serviceStart();
      else await serviceAction(action);
      setMsg(action === "start" ? "\u542F\u52A8\u547D\u4EE4\u5DF2\u53D1\u51FA\uFF0C\u51E0\u79D2\u540E\u770B\u5FC3\u8DF3\u72B6\u6001" : "\u547D\u4EE4\u5DF2\u6267\u884C");
      setTimeout(() => {
        void refreshSvc();
        onChanged();
      }, 2500);
    } catch (e) {
      setMsg(`\u5931\u8D25\uFF1A${String(e.message || e)}`);
    } finally {
      setBusy("");
    }
  }, [refreshSvc, onChanged]);
  const doPurge = useCallback4(async () => {
    if (!confirmPurge) {
      setConfirmPurge(true);
      setTimeout(() => setConfirmPurge(false), 4e3);
      return;
    }
    const n = await purgeOwnKeys();
    setMsg(`\u5DF2\u6E05\u7A7A ${n} \u4E2A keyscan.* \u952E\uFF08\u626B\u63CF\u5386\u53F2\u4E0E\u53D1\u73B0\u4E00\u5E76\u6E05\u9664\uFF09`);
    setConfirmPurge(false);
    onChanged();
  }, [confirmPurge, onChanged]);
  const meta = head.meta;
  const svcRunning = !!meta?.lastTickAt && Date.now() - meta.lastTickAt < 13e4;
  return /* @__PURE__ */ jsxs4(Fragment4, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ks-bar" }),
      "\u540E\u53F0\u670D\u52A1"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ks-card", children: /* @__PURE__ */ jsxs4("div", { className: "ks-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ks-sub", children: [
        "\u72B6\u6001\uFF1A",
        /* @__PURE__ */ jsx4("b", { style: { color: svcRunning ? "#3FB950" : "#F85149" }, children: svcRunning ? "\u8FD0\u884C\u4E2D" : svc?.status ?? "\u672A\u8FD0\u884C" }),
        meta?.pid ? ` \xB7 PID ${meta.pid}` : "",
        meta?.version ? ` \xB7 v${meta.version}` : "",
        svc?.lastError ? /* @__PURE__ */ jsxs4(Fragment4, { children: [
          /* @__PURE__ */ jsx4("br", {}),
          "\u6700\u8FD1\u9519\u8BEF\uFF1A",
          svc.lastError
        ] }) : null,
        /* @__PURE__ */ jsx4("br", {}),
        "\u65E5\u5FD7\uFF1A\u5E94\u7528\u914D\u7F6E\u76EE\u5F55\u4E0B keyscan.log\uFF08\u5BBF\u4E3B\u4E0D\u6536\u96C6\u670D\u52A1 stdout\uFF0C\u6392\u969C\u770B\u8FD9\u91CC\uFF09"
      ] }),
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx4("button", { className: "ks-btn", disabled: busy !== "", onClick: () => void doSvc("start"), children: busy === "start" ? "\u542F\u52A8\u4E2D\u2026" : "\u542F\u52A8" }),
        /* @__PURE__ */ jsx4("button", { className: "ks-btn ghost", disabled: busy !== "" || !svcRunning, onClick: () => void doSvc("restart"), children: "\u91CD\u542F" }),
        /* @__PURE__ */ jsx4("button", { className: "ks-btn ghost", disabled: busy !== "" || !svcRunning, onClick: () => void doSvc("stop"), children: "\u505C\u6B62" })
      ] }),
      msg && /* @__PURE__ */ jsx4("div", { className: "ks-sub", style: { marginTop: 7 }, children: msg })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ks-bar" }),
      "\u626B\u63CF\u53C2\u6570"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ks-card", children: /* @__PURE__ */ jsxs4("div", { className: "ks-card-b", children: [
      /* @__PURE__ */ jsx4("label", { className: "ks-sub", style: { display: "block", marginBottom: 4 }, children: "\u9ED8\u8BA4\u626B\u63CF\u6839\uFF08\u9762\u677F\u300C\u626B\u63CF\u300DTab \u9884\u586B\uFF09" }),
      /* @__PURE__ */ jsx4("input", { className: "ks-inp ks-mono", value: settings.root ?? "", placeholder: "\u5982 D:\\\\work", onChange: (e) => patch({ root: e.target.value }) }),
      /* @__PURE__ */ jsxs4("div", { style: { display: "flex", gap: 10, marginTop: 9, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxs4("div", { style: { flex: 1, minWidth: 130 }, children: [
          /* @__PURE__ */ jsx4("label", { className: "ks-sub", children: "\u5355\u6587\u4EF6\u4E0A\u9650 KB" }),
          /* @__PURE__ */ jsx4("input", { className: "ks-inp", type: "number", min: 16, max: 10240, value: settings.maxFileKB ?? 1024, onChange: (e) => patch({ maxFileKB: Number(e.target.value) || 1024 }) })
        ] }),
        /* @__PURE__ */ jsxs4("div", { style: { flex: 1, minWidth: 130 }, children: [
          /* @__PURE__ */ jsx4("label", { className: "ks-sub", children: "\u6587\u4EF6\u6570\u4E0A\u9650" }),
          /* @__PURE__ */ jsx4("input", { className: "ks-inp", type: "number", min: 1e3, max: 1e6, value: settings.maxFiles ?? 2e5, onChange: (e) => patch({ maxFiles: Number(e.target.value) || 2e5 }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("label", { className: "ks-sub", style: { display: "block", margin: "9px 0 4px" }, children: "\u989D\u5916\u8DF3\u8FC7\u7684\u76EE\u5F55\u540D\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF0C\u5185\u7F6E\u5DF2\u542B node_modules/.git/dist \u7B49\uFF09" }),
      /* @__PURE__ */ jsx4(
        "textarea",
        {
          className: "ks-inp",
          rows: 3,
          value: (settings.skipDirs ?? []).join("\n"),
          onChange: (e) => patch({ skipDirs: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
        }
      ),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx4("button", { className: "ks-btn", onClick: () => void persist(settings), children: "\u4FDD\u5B58\u8BBE\u7F6E" }) })
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ks-bar" }),
      "\u89C4\u5219\u5F00\u5173",
      /* @__PURE__ */ jsx4("span", { className: "ks-hint", children: (settings.disabledRules ?? []).length ? `\u5DF2\u5173 ${(settings.disabledRules ?? []).length} \u6761` : "\u5168\u90E8\u542F\u7528" })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ks-card", children: /* @__PURE__ */ jsx4("div", { className: "ks-card-b", children: import_scan_core.RULES.map((r) => {
      const off = (settings.disabledRules ?? []).includes(r.id);
      return /* @__PURE__ */ jsxs4("label", { style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 12 }, children: [
        /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: !off, onChange: () => toggleRule(r.id) }),
        /* @__PURE__ */ jsx4("span", { className: `ks-sev ${r.sev}`, children: r.sev === "critical" ? "\u{1F534}" : r.sev === "high" ? "\u{1F7E0}" : "\u{1F7E1}" }),
        /* @__PURE__ */ jsxs4("span", { style: { flex: 1 }, children: [
          r.label,
          " ",
          /* @__PURE__ */ jsx4("span", { className: "ks-muted ks-mono", style: { fontSize: 10 }, children: r.id })
        ] })
      ] }, r.id);
    }) }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ks-bar" }),
      "\u5FFD\u7565\u8868",
      /* @__PURE__ */ jsxs4("span", { className: "ks-hint", children: [
        ignore.length,
        " \u6761\u8BEF\u62A5\u6307\u7EB9"
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ks-card", children: /* @__PURE__ */ jsxs4("div", { className: "ks-card-b", children: [
      ignore.length === 0 && /* @__PURE__ */ jsx4("div", { className: "ks-sub", children: "\u7A7A\u2014\u2014\u5728\u300C\u53D1\u73B0\u300D\u91CC\u628A\u786E\u8BA4\u4E3A\u793A\u4F8B\u503C/\u6D4B\u8BD5\u503C\u7684\u6761\u76EE\u6807\u8BB0\u4E3A\u8BEF\u62A5\uFF0C\u4F1A\u8BB0\u5728\u8FD9\u91CC\u3002" }),
      ignore.map((x) => /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }, children: [
        /* @__PURE__ */ jsxs4("span", { className: "ks-mono ks-sub", style: { flex: 1 }, children: [
          x.fp,
          x.note ? ` \xB7 ${x.note}` : ""
        ] }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            className: "ks-btn ghost sm",
            onClick: () => {
              const next = ignore.filter((y) => y.fp !== x.fp);
              setIgnore(next);
              void kvSet("keyscan.ignore", next);
            },
            children: "\u79FB\u9664"
          }
        )
      ] }, x.fp))
    ] }) }),
    /* @__PURE__ */ jsxs4("div", { className: "ks-sec", children: [
      /* @__PURE__ */ jsx4("span", { className: "ks-bar" }),
      "\u6570\u636E\u7BA1\u7406"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "ks-card", children: /* @__PURE__ */ jsxs4("div", { className: "ks-card-b", children: [
      /* @__PURE__ */ jsx4("div", { className: "ks-sub", children: "\u672C\u63D2\u4EF6\u6240\u6709\u6570\u636E\u5B58\u4E8E cap.kv \u7684 keyscan.* \u524D\u7F00\uFF08\u63A9\u7801\u5F62\u6001\uFF09\uFF0C\u6E05\u9664\u540E\u626B\u63CF\u5386\u53F2/\u53D1\u73B0/\u5FFD\u7565\u8868\u5168\u90E8\u4E22\u5931\uFF0C\u88AB\u626B\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\u3002" }),
      /* @__PURE__ */ jsx4("div", { style: { marginTop: 9 }, children: /* @__PURE__ */ jsx4("button", { className: "ks-btn danger", onClick: () => void doPurge(), children: confirmPurge ? "\u518D\u70B9\u4E00\u6B21\u786E\u8BA4\u6E05\u7A7A" : "\u6E05\u7A7A\u672C\u63D2\u4EF6\u6570\u636E" }) })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.ks-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ks-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ks-body{flex:1;overflow-y:auto;padding:0 0 24px}
.ks-body::-webkit-scrollbar{width:9px;height:9px}
.ks-body::-webkit-scrollbar-track{background:transparent}
.ks-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.ks-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.ks-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#E3B341,#F85149);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.ks-tt{flex:1;min-width:0}
.ks-tt b{font-size:15px;display:block}
.ks-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.ks-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.ks-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.ks-dot.stale{background:#D29922}
.ks-dot.down{background:#F85149}
.ks-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.ks-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative}
.ks-tab:hover{color:#E6EAF2}
.ks-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.ks-badge{position:absolute;top:0;right:1px;background:#F85149;color:#fff;font-size:9px;min-width:15px;height:15px;line-height:15px;border-radius:8px;text-align:center;padding:0 3px;font-weight:700}

.ks-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.ks-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#E3B341,#F85149);flex-shrink:0}
.ks-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.ks-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.ks-card-b{padding:11px 13px}
.ks-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.ks-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.ks-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.ks-btn:hover{filter:brightness(1.1)}
.ks-btn:disabled{opacity:.45;cursor:not-allowed}
.ks-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.ks-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.ks-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.ks-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.ks-inp:focus{outline:none;border-color:#2b6cb0}
.ks-inp::placeholder{color:#4d5566}
.ks-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.ks-err{color:#F85149;font-size:11.5px;padding:8px 16px}
.ks-mono{font-family:Consolas,Menlo,monospace}

/* \u4E25\u91CD\u5EA6\u8272 */
.ks-sev{display:inline-block;border-radius:5px;padding:0 6px;font-size:9.5px;font-weight:700;white-space:nowrap}
.ks-sev.critical{background:#3d1218;color:#FF8A9A;border:1px solid #67252e}
.ks-sev.high{background:#3a2a10;color:#E3B341;border:1px solid #5c4517}
.ks-sev.medium{background:#33300f;color:#d8c94a;border:1px solid #4d4916}

/* \u6458\u8981\u5927\u6570\u5B57 */
.ks-sum{display:flex;gap:8px;margin:2px 0 8px;flex-wrap:wrap}
.ks-sum>div{flex:1;min-width:76px;background:#12151c;border:1px solid #242C3A;border-radius:10px;padding:9px 10px;text-align:center}
.ks-sum b{font-size:19px;display:block;line-height:1.2}
.ks-sum small{color:#8B95A7;font-size:9.5px}
.ks-crit{color:#FF8A9A}.ks-high{color:#E3B341}.ks-med{color:#d8c94a}.ks-new{color:#F85149}

/* \u53D1\u73B0\u884C */
.ks-row{padding:9px 13px;border-top:1px solid #1d2330}
.ks-row:hover{background:#12151c}
.ks-row-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.ks-row-file{color:#C9D1D9;font-size:11px;word-break:break-all}
.ks-ctx{margin-top:4px;background:#0d1017;border:1px solid #1d2330;border-radius:7px;padding:5px 8px;font-size:10.5px;color:#8B95A7;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace}
.ks-muted{color:#5C6678}

/* \u8FDB\u5EA6\u6761 */
.ks-prog{height:5px;background:#12151c;border-radius:3px;overflow:hidden;margin:8px 16px}
.ks-prog>div{height:100%;background:linear-gradient(90deg,#E3B341,#F85149);border-radius:3px;transition:width .6s}
@keyframes ksPulse{0%,100%{opacity:1}50%{opacity:.45}}
.ks-pulse{animation:ksPulse 1.4s infinite}
`;
function heartbeatState(meta) {
  if (!meta || !meta.lastTickAt) return { cls: "down", label: "\u670D\u52A1\u672A\u8FD0\u884C" };
  const age = Date.now() - meta.lastTickAt;
  if (meta.degraded) return { cls: "stale", label: `\u6865\u964D\u7EA7(${meta.lastBridgeErr ? "\u89C1\u65E5\u5FD7" : "?"})` };
  if (age > 130 * 1e3) return { cls: "stale", label: `\u5FC3\u8DF3\u505C\u6EDE ${Math.round(age / 1e3)}s` };
  return { cls: "ok", label: meta.scanning ? "\u626B\u63CF\u4E2D" : "\u670D\u52A1\u6B63\u5E38" };
}
function Panel(_props) {
  const [tab, setTab] = useState5("scan");
  const [head, setHead] = useState5({ meta: null, latest: null });
  const [visible, setVisible] = useState5(true);
  const refreshHead = useCallback5(async () => {
    try {
      const d = await loadPanelData();
      setHead({ meta: d.meta, latest: d.latest });
    } catch (_) {
    }
  }, []);
  useEffect5(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    setVisible(document.visibilityState === "visible");
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect5(() => {
    if (!visible) return;
    refreshHead();
    const t = setInterval(refreshHead, 5e3);
    return () => clearInterval(t);
  }, [visible, refreshHead]);
  const hb = heartbeatState(head.meta);
  const latest = head.latest;
  const badgeCount = latest && latest.new ? latest.new.newCount : 0;
  return /* @__PURE__ */ jsxs5("div", { className: "ks-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "ks-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "ks-logo", children: "\u{1F511}" }),
      /* @__PURE__ */ jsxs5("div", { className: "ks-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u5BC6\u94A5\u626B\u63CF\u53F0" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("span", { className: `ks-dot ${hb.cls}` }),
          hb.label,
          head.meta?.scanning ? ` \xB7 ${head.meta.scanning.root}` : latest ? ` \xB7 \u4E0A\u6B21 ${latest.findingCount ?? 0} \u5904` : " \xB7 \u5C1A\u672A\u626B\u63CF"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "ks-tabs", children: [
        ["scan", "\u626B\u63CF"],
        ["findings", "\u53D1\u73B0"],
        ["history", "\u5386\u53F2"],
        ["settings", "\u8BBE\u7F6E"]
      ].map(([id, label]) => /* @__PURE__ */ jsxs5("button", { className: `ks-tab ${tab === id ? "on" : ""}`, onClick: () => setTab(id), children: [
        label,
        id === "findings" && badgeCount > 0 && /* @__PURE__ */ jsx5("span", { className: "ks-badge", children: badgeCount })
      ] }, id)) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "ks-body", children: [
      tab === "scan" && /* @__PURE__ */ jsx5(ScanTab, { head, onChanged: refreshHead, onGoFindings: () => setTab("findings") }),
      tab === "findings" && /* @__PURE__ */ jsx5(FindingsTab, { head }),
      tab === "history" && /* @__PURE__ */ jsx5(HistoryTab, { onGoFindings: () => setTab("findings") }),
      tab === "settings" && /* @__PURE__ */ jsx5(SettingsTab, { head, onChanged: refreshHead })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function KeyscanEntry(props) {
  return /* @__PURE__ */ jsx6(Panel, { pluginId: props.pluginId, onSendToChat: props.onSendToChat });
}
export {
  KeyscanEntry as default
};
