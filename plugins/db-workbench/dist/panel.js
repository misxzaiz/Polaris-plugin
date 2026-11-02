// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect4, useRef as useRef2, useState as useState5 } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}
async function kvGet(key) {
  try {
    const res = await getHostInvoke()("router_dispatch", {
      req: { target: "cap.kv", payload: { action: "get", key } }
    });
    if (res && res.ok && res.result) return res.result.value !== void 0 ? res.result.value : null;
    return null;
  } catch (_) {
    return null;
  }
}

// src/model.ts
var KB = 1024;
var MAX_BODY = 8 * 1024 * 1024;
var SvcClient = class {
  constructor() {
    this.info = null;
  }
  get connected() {
    return this.info !== null;
  }
  /** 从 kv 拿 service 发现信息并 ping 健康检查 */
  async discover() {
    this.info = null;
    const svc = await kvGet("dbl.service");
    if (!svc || !svc.port || !svc.token) {
      return { ok: false, reason: "\u670D\u52A1\u672A\u5C31\u7EEA\uFF1A\u540E\u53F0\u670D\u52A1\u53EF\u80FD\u672A\u542F\u52A8\uFF0C\u7A0D\u5019\u91CD\u8BD5\u6216\u68C0\u67E5\u63D2\u4EF6\u670D\u52A1\u7BA1\u7406\u3002" };
    }
    try {
      const r = await this.raw("GET", "/__health");
      if (r && r.ok) {
        this.info = svc;
        return { ok: true, reason: "" };
      }
      return { ok: false, reason: "\u670D\u52A1\u5065\u5EB7\u68C0\u67E5\u5931\u8D25\uFF08\u7AEF\u53E3\u54CD\u5E94\u5F02\u5E38\uFF09\u3002" };
    } catch (_) {
      return {
        ok: false,
        reason: "\u65E0\u6CD5\u8FDE\u63A5\u672C\u673A\u670D\u52A1\uFF08127.0.0.1 \u76F4\u8FDE\u5931\u8D25\uFF09\u3002\u624B\u673A/Web \u8FDC\u7A0B\u7AEF v0.1 \u4EC5\u652F\u6301\u67E5\u770B\uFF0C\u8BF7\u5728\u684C\u9762\u7AEF\u4F7F\u7528\u5B8C\u6574\u529F\u80FD\u3002"
      };
    }
  }
  async raw(method, path, body) {
    if (!this.info) throw new Error("service \u672A\u8FDE\u63A5");
    const headers = { Authorization: `Bearer ${this.info.token}` };
    let payload;
    if (body !== void 0) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2e4);
    try {
      const res = await fetch(`http://127.0.0.1:${this.info.port}${path}`, {
        method,
        headers,
        body: payload,
        signal: ctrl.signal
      });
      const text = await res.text();
      if (text.length > MAX_BODY) throw new Error("\u54CD\u5E94\u8FC7\u5927");
      const json = JSON.parse(text);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }
  async call(method, path, body) {
    const r = await this.raw(method, path, body);
    return r;
  }
  async infoSvc() {
    return this.call("GET", "/api/info");
  }
  async profiles() {
    const r = await this.call("GET", "/api/profiles");
    return r.items || [];
  }
  async saveProfile(profile, password) {
    return this.call("POST", "/api/profiles", { profile, password });
  }
  async deleteProfile(id) {
    return this.call("POST", "/api/profiles/delete", { id });
  }
  async testProfile(id, password) {
    return this.call("POST", `/api/profiles/${encodeURIComponent(id)}/test`, { password });
  }
  async query(profileId, sql, opts) {
    return this.call("POST", "/api/query", { profileId, sql, ...opts });
  }
  async redis(profileId, command, args, opts) {
    return this.call("POST", "/api/redis", { profileId, command, args, ...opts });
  }
  async schemas(profileId) {
    const r = await this.call("GET", `/api/schemas?profileId=${encodeURIComponent(profileId)}`);
    return r.items || [];
  }
  async tables(profileId, schema) {
    const r = await this.call("GET", `/api/tables?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}`);
    return r.items || [];
  }
  async describe(profileId, schema, table) {
    return this.call("GET", `/api/describe?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`);
  }
  async preview(profileId, schema, table, limit) {
    return this.call("GET", `/api/preview?profileId=${encodeURIComponent(profileId)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}&limit=${limit}`);
  }
  async history() {
    const r = await this.call("GET", "/api/history");
    return r.items || [];
  }
  async clearHistory() {
    return this.call("POST", "/api/history/clear", {});
  }
  async selftest() {
    return this.call("POST", "/api/selftest", {});
  }
};
function fmtBytes(n) {
  if (n == null || !(n > 0)) return "";
  if (n < KB) return `${n}B`;
  if (n < KB * KB) return `${(n / KB).toFixed(1)}KB`;
  if (n < KB * KB * KB) return `${(n / KB / KB).toFixed(1)}MB`;
  return `${(n / KB / KB / KB).toFixed(2)}GB`;
}
function fmtTime(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function csvCell(v) {
  if (v == null) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (s.length > 4096) s = `${s.slice(0, 4096)}\u2026[\u622A\u65AD]`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(columns, rows, filename) {
  const lines = [columns.map(csvCell).join(",")].concat(rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))).join("\r\n");
  const blob = new Blob([`\uFEFF${lines}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5e3);
}
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5e3);
}

// src/ConnectionsTab.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var TYPE_META = {
  mysql: { label: "MySQL", color: "#00758F", defPort: 3306, userLabel: "\u7528\u6237\u540D", needDb: true },
  postgres: { label: "PostgreSQL", color: "#336791", defPort: 5432, userLabel: "\u7528\u6237\u540D", needDb: true },
  redis: { label: "Redis", color: "#DC382D", defPort: 6379, userLabel: "\u7528\u6237\u540D(ACL \u53EF\u7A7A)", needDb: false }
};
function blankForm(type) {
  return {
    type,
    name: "",
    host: "127.0.0.1",
    port: String(TYPE_META[type].defPort),
    username: type === "redis" ? "" : "root",
    database: "",
    password: "",
    readonly: true,
    allowWrite: false,
    rememberPass: false,
    note: ""
  };
}
function ConnectionsTab({ svc, profiles, reloadProfiles, selectedId, setSelectedId, showToast }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState("");
  const [testing, setTesting] = useState({});
  const startEdit = (p) => {
    setEditing({
      id: p.id,
      type: p.type,
      name: p.name,
      host: p.host,
      port: String(p.port),
      username: p.username,
      database: p.database,
      password: "",
      readonly: p.readonly,
      allowWrite: p.allowWrite,
      rememberPass: p.rememberPass,
      note: p.note
    });
  };
  const submit = async () => {
    if (!editing) return;
    const meta2 = TYPE_META[editing.type];
    if (!editing.name.trim()) {
      showToast("\u540D\u79F0\u5FC5\u586B", true);
      return;
    }
    if (!editing.host.trim()) {
      showToast("\u4E3B\u673A\u5FC5\u586B", true);
      return;
    }
    if (meta2.needDb && !editing.database.trim()) {
      showToast(`${meta2.label} \u9700\u8981\u586B\u5199 database`, true);
      return;
    }
    if (editing.type !== "redis" && !editing.username.trim()) {
      showToast(meta2.userLabel + " \u5FC5\u586B", true);
      return;
    }
    setBusy("save");
    try {
      const r = await svc.saveProfile(
        {
          id: editing.id,
          type: editing.type,
          name: editing.name.trim(),
          host: editing.host.trim(),
          port: parseInt(editing.port, 10) || meta2.defPort,
          username: editing.username.trim(),
          database: editing.database.trim(),
          readonly: editing.readonly,
          allowWrite: editing.allowWrite,
          rememberPass: editing.rememberPass,
          note: editing.note
        },
        editing.password || void 0
      );
      if (!r.ok) {
        showToast(r.error || "\u4FDD\u5B58\u5931\u8D25", true);
        return;
      }
      showToast(editing.id ? "\u5DF2\u4FDD\u5B58" : "\u8FDE\u63A5\u5DF2\u521B\u5EFA");
      await reloadProfiles();
      if (!editing.id && r.profile) setSelectedId(r.profile.id);
      setEditing(null);
    } catch (e) {
      showToast(e.message || "\u4FDD\u5B58\u5931\u8D25", true);
    } finally {
      setBusy("");
    }
  };
  const doTest = async (p) => {
    setTesting((m) => ({ ...m, [p.id]: { ok: false, msg: "\u6D4B\u8BD5\u4E2D\u2026" } }));
    try {
      const r = await svc.testProfile(p.id);
      setTesting((m) => ({ ...m, [p.id]: r.ok ? { ok: true, msg: `\u2713 ${r.serverVersion || "\u8FDE\u901A"}` } : { ok: false, msg: `\u2717 ${r.error || "\u5931\u8D25"}` } }));
    } catch (e) {
      setTesting((m) => ({ ...m, [p.id]: { ok: false, msg: `\u2717 ${e.message}` } }));
    }
  };
  const doDelete = (p) => {
    if (!window.confirm(`\u5220\u9664\u8FDE\u63A5\u300C${p.name}\u300D\uFF1F\uFF08\u672C\u673A\u4FDD\u5B58\u7684\u5BC6\u7801\u4E5F\u4F1A\u4E00\u5E76\u5220\u9664\uFF1B\u6570\u636E\u5E93\u672C\u8EAB\u4E0D\u53D7\u5F71\u54CD\uFF09`)) return;
    setBusy(p.id);
    svc.deleteProfile(p.id).then(async (r) => {
      if (!r.ok) {
        showToast(r.error || "\u5220\u9664\u5931\u8D25", true);
        return;
      }
      showToast("\u5DF2\u5220\u9664");
      if (selectedId === p.id) setSelectedId("");
      await reloadProfiles();
    }).catch((e) => showToast(e.message, true)).finally(() => setBusy(""));
  };
  const meta = editing ? TYPE_META[editing.type] : null;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "dbw-sec", children: [
      /* @__PURE__ */ jsx("div", { className: "dbw-bar" }),
      "\u8FDE\u63A5",
      /* @__PURE__ */ jsx("span", { className: "dbw-hint", children: "\u6570\u636E\u4E0D\u51FA\u672C\u673A\uFF1BAI \u901A\u9053\u6C38\u8FDC\u53EA\u8BFB" })
    ] }),
    profiles.length === 0 && /* @__PURE__ */ jsxs("div", { className: "dbw-empty", children: [
      "\u8FD8\u6CA1\u6709\u8FDE\u63A5\u3002",
      /* @__PURE__ */ jsx("br", {}),
      "\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u6DFB\u52A0 MySQL / PostgreSQL / Redis \u8FDE\u63A5\u3002"
    ] }),
    /* @__PURE__ */ jsx("div", { className: "dbw-card", children: profiles.map((p) => {
      const m = TYPE_META[p.type];
      const t = testing[p.id];
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `dbw-pcard ${selectedId === p.id ? "on" : ""}`,
          onClick: () => setSelectedId(p.id),
          children: [
            /* @__PURE__ */ jsx("div", { className: "dbw-picon", style: { background: m.color }, children: m.label[0] }),
            /* @__PURE__ */ jsxs("div", { className: "dbw-pinfo", children: [
              /* @__PURE__ */ jsxs("b", { children: [
                p.name,
                p.readonly ? /* @__PURE__ */ jsx("span", { className: "dbw-tag g", style: { marginLeft: 6 }, children: "\u53EA\u8BFB" }) : /* @__PURE__ */ jsx("span", { className: "dbw-tag y", style: { marginLeft: 6 }, children: "\u53EF\u5199" }),
                p.type === "redis" && /* @__PURE__ */ jsx("span", { className: "dbw-tag r", style: { marginLeft: 4 }, children: "Redis" })
              ] }),
              /* @__PURE__ */ jsxs("small", { children: [
                p.host,
                ":",
                p.port,
                p.database ? `/${p.database}` : "",
                " \xB7 ",
                p.hasStoredPass ? "\u5DF2\u5B58\u5BC6\u7801" : "\u65E0\u5B58\u5BC6\u7801",
                " \xB7 ",
                p.lastUsedAt ? `\u4E0A\u6B21\u4F7F\u7528 ${fmtTime(p.lastUsedAt)}` : "\u672A\u4F7F\u7528"
              ] }),
              t && /* @__PURE__ */ jsx("small", { style: { color: t.ok ? "#3FB950" : "#F85149" }, children: t.msg })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "dbw-row", onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsx("button", { className: "dbw-btn ghost sm", onClick: () => void doTest(p), children: "\u6D4B\u8BD5" }),
              /* @__PURE__ */ jsx("button", { className: "dbw-btn ghost sm", onClick: () => startEdit(p), children: "\u7F16\u8F91" }),
              /* @__PURE__ */ jsx("button", { className: "dbw-btn danger sm", disabled: busy === p.id, onClick: () => doDelete(p), children: "\u5220\u9664" })
            ] })
          ]
        },
        p.id
      );
    }) }),
    /* @__PURE__ */ jsx("div", { style: { padding: "2px 16px" }, children: /* @__PURE__ */ jsx("button", { className: "dbw-btn", onClick: () => setEditing(blankForm("mysql")), children: "+ \u65B0\u5EFA\u8FDE\u63A5" }) }),
    editing && meta && /* @__PURE__ */ jsx("div", { className: "dbw-modal", onClick: () => setEditing(null), children: /* @__PURE__ */ jsxs("div", { className: "dbw-modal-c", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsx("div", { className: "dbw-h3", children: editing.id ? "\u7F16\u8F91\u8FDE\u63A5" : "\u65B0\u5EFA\u8FDE\u63A5" }),
      /* @__PURE__ */ jsx("div", { className: "dbw-row", style: { marginBottom: 9 }, children: ["mysql", "postgres", "redis"].map((tp) => /* @__PURE__ */ jsx(
        "button",
        {
          className: `dbw-btn sm ${editing.type === tp ? "" : "ghost"}`,
          onClick: () => setEditing({ ...editing, type: tp, port: String(TYPE_META[tp].defPort), username: tp === "redis" ? "" : editing.username || "root", database: tp === "redis" ? "" : editing.database }),
          children: TYPE_META[tp].label
        },
        tp
      )) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: "\u540D\u79F0 *" }),
          /* @__PURE__ */ jsx("input", { className: "dbw-inp", value: editing.name, placeholder: "\u672C\u5730\u5F00\u53D1\u5E93", onChange: (e) => setEditing({ ...editing, name: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: "\u4E3B\u673A *" }),
          /* @__PURE__ */ jsx("input", { className: "dbw-inp", value: editing.host, onChange: (e) => setEditing({ ...editing, host: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: "\u7AEF\u53E3" }),
          /* @__PURE__ */ jsx("input", { className: "dbw-inp", value: editing.port, onChange: (e) => setEditing({ ...editing, port: e.target.value }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: editing.type === "redis" ? "DB \u7F16\u53F7(0-15,\u53EF\u7A7A)" : "Database *" }),
          /* @__PURE__ */ jsx("input", { className: "dbw-inp", value: editing.database, onChange: (e) => setEditing({ ...editing, database: e.target.value }), placeholder: editing.type === "redis" ? "0" : "dbname" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: meta.userLabel }),
          /* @__PURE__ */ jsx("input", { className: "dbw-inp", value: editing.username, onChange: (e) => setEditing({ ...editing, username: e.target.value }), placeholder: editing.type === "redis" ? "default" : "root" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: "\u5BC6\u7801" }),
          /* @__PURE__ */ jsx("input", { className: "dbw-inp", type: "password", value: editing.password, placeholder: editing.id ? "\u7559\u7A7A=\u6CBF\u7528\u5DF2\u5B58\u5BC6\u7801" : "\u672A\u586B\u5219\u6BCF\u6B21\u4F7F\u7528\u65F6\u8F93\u5165", onChange: (e) => setEditing({ ...editing, password: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { marginTop: 9, display: "flex", flexDirection: "column", gap: 6 }, children: [
        /* @__PURE__ */ jsxs("label", { className: "dbw-chk", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: editing.rememberPass, onChange: (e) => setEditing({ ...editing, rememberPass: e.target.checked }) }),
          "\u8BB0\u4F4F\u5BC6\u7801\uFF08\u5B58\u672C\u673A\u670D\u52A1\u4FA7\u6587\u4EF6\uFF0C\u4E0D\u8FDB kv / \u4E0D\u7ED9 AI\uFF09"
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "dbw-chk", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: editing.readonly, onChange: (e) => setEditing({ ...editing, readonly: e.target.checked, allowWrite: e.target.checked ? false : editing.allowWrite }) }),
          "\u53EA\u8BFB\u8FDE\u63A5\uFF08\u63A8\u8350\uFF1B\u5199\u8BED\u53E5\u4E00\u5F8B\u62E6\u622A\uFF09"
        ] }),
        !editing.readonly && /* @__PURE__ */ jsxs("label", { className: "dbw-chk", children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: editing.allowWrite, onChange: (e) => setEditing({ ...editing, allowWrite: e.target.checked }) }),
          "\u5141\u8BB8\u5199\u6A21\u5F0F\uFF08\u9762\u677F\u53EF\u4E34\u65F6\u5F00\u5199\uFF1BAI \u901A\u9053\u4ECD\u6C38\u8FDC\u53EA\u8BFB\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { marginTop: 9 }, children: [
        /* @__PURE__ */ jsx("div", { className: "dbw-lbl", children: "\u5907\u6CE8" }),
        /* @__PURE__ */ jsx("input", { className: "dbw-inp", value: editing.note, placeholder: "\u5982\uFF1A\u6D4B\u8BD5\u73AF\u5883\u53EA\u8BFB\u8D26\u53F7", onChange: (e) => setEditing({ ...editing, note: e.target.value }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "dbw-row", style: { marginTop: 13, justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ jsx("button", { className: "dbw-btn ghost", onClick: () => setEditing(null), children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx("button", { className: "dbw-btn", disabled: busy === "save", onClick: () => void submit(), children: busy === "save" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
      ] })
    ] }) })
  ] });
}

// src/QueryTab.tsx
import { useEffect, useRef, useState as useState2 } from "react";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function QueryTab({ svc, profiles, selectedId, setSelectedId, showToast }) {
  const sqlTypes = profiles.filter((p2) => p2.type !== "redis");
  const [profileId, setProfileId] = useState2(selectedId || sqlTypes[0] && sqlTypes[0].id || "");
  const [sql, setSql] = useState2("");
  const [result, setResult] = useState2(null);
  const [running, setRunning] = useState2(false);
  const [writeMode, setWriteMode] = useState2(false);
  const [hist, setHist] = useState2([]);
  const [showHist, setShowHist] = useState2(false);
  const [sessionPassword, setSessionPassword] = useState2("");
  const [needPassword, setNeedPassword] = useState2(false);
  const editorRef = useRef(null);
  useEffect(() => {
    if (selectedId && selectedId !== profileId) setProfileId(selectedId);
  }, [selectedId]);
  const refreshHist = () => {
    svc.history().then((items) => setHist(items)).catch(() => {
    });
  };
  useEffect(() => {
    refreshHist();
  }, []);
  const profile = sqlTypes.find((p2) => p2.id === profileId) || null;
  const canWrite = profile !== null && !profile.readonly && profile.allowWrite;
  const run = async (confirmOverride) => {
    if (!profile) {
      showToast("\u5148\u9009\u62E9\u4E00\u4E2A\u8FDE\u63A5", true);
      return;
    }
    if (!sql.trim()) {
      showToast("SQL \u4E3A\u7A7A", true);
      return;
    }
    setRunning(true);
    try {
      const r = await svc.query(profile.id, sql, {
        writeMode: writeMode && canWrite,
        confirm: confirmOverride === true,
        password: sessionPassword || void 0
      });
      setResult(r);
      if (r.ok) {
        setNeedPassword(false);
        refreshHist();
      } else if (r.error && /未保存密码|password/i.test(r.error)) {
        setNeedPassword(true);
      }
      if (r.needsConfirm) showToast("DROP/TRUNCATE \u9700\u8981\u786E\u8BA4\u540E\u91CD\u53D1", true);
    } catch (e) {
      setResult({ ok: false, error: e.message || String(e) });
    } finally {
      setRunning(false);
    }
  };
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
  };
  const p = result && result.ok ? result : null;
  return /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsxs2("div", { className: "dbw-sec", children: [
      /* @__PURE__ */ jsx2("div", { className: "dbw-bar" }),
      "\u67E5\u8BE2",
      /* @__PURE__ */ jsx2("span", { className: "dbw-hint", children: "Ctrl+Enter \u6267\u884C" })
    ] }),
    /* @__PURE__ */ jsx2("div", { className: "dbw-card", children: /* @__PURE__ */ jsxs2("div", { className: "dbw-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "dbw-row", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsxs2(
          "select",
          {
            className: "dbw-sel",
            value: profileId,
            onChange: (e) => {
              setProfileId(e.target.value);
              setSelectedId(e.target.value);
              setResult(null);
            },
            style: { minWidth: 150 },
            children: [
              sqlTypes.length === 0 && /* @__PURE__ */ jsx2("option", { value: "", children: "\uFF08\u65E0 SQL \u8FDE\u63A5\uFF09" }),
              sqlTypes.map((x) => /* @__PURE__ */ jsxs2("option", { value: x.id, children: [
                x.name,
                "\uFF08",
                x.readonly ? "\u53EA\u8BFB" : "\u53EF\u5F00\u5199",
                "\uFF09"
              ] }, x.id))
            ]
          }
        ),
        canWrite && /* @__PURE__ */ jsxs2("label", { className: "dbw-chk", title: "\u4EC5\u672C\u6B21\u4F1A\u8BDD\uFF1B\u6BCF\u6B21\u6267\u884C\u4ECD\u53D7\u62A4\u680F\u7EA6\u675F", children: [
          /* @__PURE__ */ jsx2("input", { type: "checkbox", checked: writeMode, onChange: (e) => setWriteMode(e.target.checked) }),
          "\u5199\u6A21\u5F0F"
        ] }),
        profile && !profile.readonly && !profile.allowWrite && /* @__PURE__ */ jsx2("span", { className: "dbw-tag y", children: "\u8FDE\u63A5\u672A\u5F00 allowWrite" }),
        profile && profile.readonly && /* @__PURE__ */ jsx2("span", { className: "dbw-tag g", children: "\u53EA\u8BFB\u8FDE\u63A5" }),
        /* @__PURE__ */ jsx2("div", { style: { marginLeft: "auto" }, children: /* @__PURE__ */ jsxs2("button", { className: "dbw-btn sm ghost", onClick: () => setShowHist((v) => !v), children: [
          "\u5386\u53F2(",
          hist.length,
          ")"
        ] }) })
      ] }),
      needPassword && /* @__PURE__ */ jsxs2("div", { className: "dbw-row", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx2("span", { className: "dbw-lbl", children: "\u8BE5\u8FDE\u63A5\u672A\u5B58\u5BC6\u7801\uFF0C\u672C\u6B21\u8F93\u5165\uFF1A" }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            className: "dbw-inp",
            type: "password",
            style: { maxWidth: 200 },
            value: sessionPassword,
            onChange: (e) => setSessionPassword(e.target.value),
            placeholder: "\u4F1A\u8BDD\u5185\u4F7F\u7528\uFF0C\u4E0D\u843D\u76D8"
          }
        )
      ] }),
      /* @__PURE__ */ jsx2(
        "textarea",
        {
          ref: editorRef,
          className: "dbw-editor",
          value: sql,
          onChange: (e) => setSql(e.target.value),
          onKeyDown,
          placeholder: "SELECT * FROM orders ORDER BY amount DESC LIMIT 20\n\n\u53EA\u8BFB\u8FDE\u63A5\u4EC5\u653E\u884C SELECT/SHOW/DESCRIBE/EXPLAIN\uFF1B\n\u5199\u6A21\u5F0F\u4ECD\u62D2\u7EDD\u65E0 WHERE \u7684 UPDATE/DELETE\u3002",
          spellCheck: false
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "dbw-row", style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx2("button", { className: "dbw-btn", disabled: running || !profile, onClick: () => void run(), children: running ? "\u6267\u884C\u4E2D\u2026" : "\u25B6 \u6267\u884C" }),
        /* @__PURE__ */ jsx2("button", { className: "dbw-btn ghost", disabled: !sql, onClick: () => {
          setSql("");
          setResult(null);
        }, children: "\u6E05\u7A7A" }),
        result && result.needsConfirm && /* @__PURE__ */ jsxs2("button", { className: "dbw-btn danger", onClick: () => void run(true), children: [
          "\u26A0 \u786E\u8BA4\u6267\u884C ",
          result.kind === "ddl" ? "DROP/TRUNCATE" : ""
        ] }),
        p && /* @__PURE__ */ jsxs2("span", { className: "dbw-hint", children: [
          p.rowCount,
          " \u884C \xB7 ",
          p.ms,
          "ms ",
          p.truncated ? " \xB7 \u5DF2\u622A\u65AD(\u8D85\u4E0A\u9650)" : ""
        ] })
      ] })
    ] }) }),
    showHist && /* @__PURE__ */ jsx2("div", { className: "dbw-card", children: /* @__PURE__ */ jsxs2("div", { className: "dbw-card-b", children: [
      /* @__PURE__ */ jsxs2("div", { className: "dbw-row", children: [
        /* @__PURE__ */ jsx2("b", { style: { fontSize: 12 }, children: "\u67E5\u8BE2\u5386\u53F2\uFF08\u65B0\u2192\u65E7\uFF09" }),
        /* @__PURE__ */ jsxs2("div", { style: { marginLeft: "auto", display: "flex", gap: 6 }, children: [
          /* @__PURE__ */ jsx2("button", { className: "dbw-btn ghost sm", onClick: () => {
            void svc.clearHistory().then(refreshHist);
          }, children: "\u6E05\u7A7A\u5386\u53F2" }),
          /* @__PURE__ */ jsx2("button", { className: "dbw-btn ghost sm", onClick: () => setShowHist(false), children: "\u6536\u8D77" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { marginTop: 6, maxHeight: 200, overflowY: "auto" }, children: [
        hist.length === 0 && /* @__PURE__ */ jsx2("div", { className: "dbw-sub", children: "\u6682\u65E0\u5386\u53F2\u3002" }),
        hist.map((h) => /* @__PURE__ */ jsxs2("div", { className: "dbw-tree-i", onClick: () => {
          setSql(h.sql);
          setShowHist(false);
        }, children: [
          /* @__PURE__ */ jsx2("span", { style: { color: h.ok ? "#3FB950" : "#F85149" }, children: h.ok ? "\u2713" : "\u2717" }),
          /* @__PURE__ */ jsx2("span", { className: "dbw-tag", children: h.kind }),
          /* @__PURE__ */ jsx2("span", { style: { fontSize: 11, color: "#c9d1d9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }, children: h.sql }),
          /* @__PURE__ */ jsx2("span", { className: "dbw-sub", style: { marginLeft: "auto" }, children: h.ok ? `${h.rows}\u884C ${h.ms}ms` : (h.error || "").slice(0, 40) })
        ] }, h.id))
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "dbw-sub", style: { marginTop: 4 }, children: "\u70B9\u51FB\u5386\u53F2\u6761\u76EE\u53EF\u56DE\u586B SQL\u3002" })
    ] }) }),
    result && !result.ok && /* @__PURE__ */ jsx2("div", { className: "dbw-card", children: /* @__PURE__ */ jsx2("div", { className: "dbw-err", style: { padding: 10 }, children: result.error }) }),
    p && p.rows && p.rows.length > 0 && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsxs2("div", { className: "dbw-sec", children: [
        /* @__PURE__ */ jsx2("div", { className: "dbw-bar" }),
        "\u7ED3\u679C",
        /* @__PURE__ */ jsxs2("div", { style: { marginLeft: "auto", display: "flex", gap: 6 }, children: [
          /* @__PURE__ */ jsx2("button", { className: "dbw-btn ghost sm", onClick: () => downloadCsv(p.columns || [], p.rows || [], `query-${Date.now()}.csv`), children: "\u5BFC\u51FA CSV" }),
          /* @__PURE__ */ jsx2("button", { className: "dbw-btn ghost sm", onClick: () => downloadJson(p.rows, `query-${Date.now()}.json`), children: "\u5BFC\u51FA JSON" })
        ] })
      ] }),
      /* @__PURE__ */ jsx2("div", { style: { margin: "0 16px 10px" }, children: /* @__PURE__ */ jsx2("div", { className: "dbw-tblwrap", children: /* @__PURE__ */ jsxs2("table", { className: "dbw-table", children: [
        /* @__PURE__ */ jsx2("thead", { children: /* @__PURE__ */ jsx2("tr", { children: (p.columns || []).map((c) => /* @__PURE__ */ jsx2("th", { children: c }, c)) }) }),
        /* @__PURE__ */ jsx2("tbody", { children: p.rows.map((row, i) => /* @__PURE__ */ jsx2("tr", { children: (p.columns || []).map((c) => {
          const v = row[c];
          return /* @__PURE__ */ jsx2("td", { className: v == null ? "dbw-null" : "", title: v == null ? "" : String(v), children: v == null ? "NULL" : String(v) }, c);
        }) }, i)) })
      ] }) }) })
    ] }),
    p && p.rows && p.rows.length === 0 && /* @__PURE__ */ jsx2("div", { className: "dbw-empty", children: "\u6267\u884C\u6210\u529F\uFF0C0 \u884C\u7ED3\u679C\u3002" })
  ] });
}

// src/SchemaTab.tsx
import { useCallback, useEffect as useEffect2, useState as useState3 } from "react";
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function SchemaTab({ svc, profiles, selectedId, setSelectedId, showToast }) {
  const sqlTypes = profiles.filter((p) => p.type !== "redis");
  const [profileId, setProfileId] = useState3(selectedId || sqlTypes[0] && sqlTypes[0].id || "");
  const [schemas, setSchemas] = useState3([]);
  const [schema, setSchema] = useState3("");
  const [tables, setTables] = useState3([]);
  const [table, setTable] = useState3("");
  const [desc, setDesc] = useState3(null);
  const [preview, setPreview] = useState3(null);
  const [loading, setLoading] = useState3("");
  const [filter, setFilter] = useState3("");
  useEffect2(() => {
    if (selectedId && selectedId !== profileId) setProfileId(selectedId);
  }, [selectedId]);
  const profile = sqlTypes.find((p) => p.id === profileId) || null;
  useEffect2(() => {
    if (!profile) {
      setSchemas([]);
      setSchema("");
      setTables([]);
      setTable("");
      setDesc(null);
      setPreview(null);
      return;
    }
    let alive = true;
    setLoading("schemas");
    svc.schemas(profile.id).then((items) => {
      if (!alive) return;
      setSchemas(items);
      const def = profile.type === "mysql" ? profile.database || items[0] || "" : items.includes("public") ? "public" : items[0] || "";
      setSchema(def);
    }).catch((e) => showToast(e.message, true)).finally(() => alive && setLoading(""));
    return () => {
      alive = false;
    };
  }, [profileId]);
  const loadTables = useCallback((sch) => {
    if (!profile || !sch) {
      setTables([]);
      return;
    }
    setLoading("tables");
    svc.tables(profile.id, sch).then((items) => setTables(items)).catch((e) => showToast(e.message, true)).finally(() => setLoading(""));
  }, [profile, svc, showToast]);
  useEffect2(() => {
    loadTables(schema);
  }, [schema, loadTables]);
  useEffect2(() => {
    if (!profile || !table) {
      setDesc(null);
      setPreview(null);
      return;
    }
    let alive = true;
    setLoading("desc");
    Promise.all([
      svc.describe(profile.id, schema, table),
      svc.preview(profile.id, schema, table, 50)
    ]).then(([d, pv]) => {
      if (!alive) return;
      setDesc(d);
      setPreview(pv.ok ? pv : { ok: false, error: pv.error });
    }).catch((e) => alive && showToast(e.message, true)).finally(() => alive && setLoading(""));
    return () => {
      alive = false;
    };
  }, [table, schema, profileId]);
  if (!sqlTypes.length) {
    return /* @__PURE__ */ jsxs3("div", { className: "dbw-empty", children: [
      "\u8FD8\u6CA1\u6709 MySQL / PostgreSQL \u8FDE\u63A5\u3002",
      /* @__PURE__ */ jsx3("br", {}),
      "\u5148\u5728\u300C\u8FDE\u63A5\u300D\u91CC\u521B\u5EFA\u3002"
    ] });
  }
  const shownTables = tables.filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));
  return /* @__PURE__ */ jsxs3("div", { children: [
    /* @__PURE__ */ jsxs3("div", { className: "dbw-sec", children: [
      /* @__PURE__ */ jsx3("div", { className: "dbw-bar" }),
      "\u7ED3\u6784",
      /* @__PURE__ */ jsx3("span", { className: "dbw-hint", children: "\u884C\u6570\u4E3A\u5F15\u64CE\u4F30\u7B97\u503C" })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "dbw-card", children: /* @__PURE__ */ jsx3("div", { className: "dbw-card-b", children: /* @__PURE__ */ jsxs3("div", { className: "dbw-row", children: [
      /* @__PURE__ */ jsx3("select", { className: "dbw-sel", value: profileId, onChange: (e) => {
        setProfileId(e.target.value);
        setSelectedId(e.target.value);
        setTable("");
      }, style: { minWidth: 140 }, children: sqlTypes.map((x) => /* @__PURE__ */ jsx3("option", { value: x.id, children: x.name }, x.id)) }),
      /* @__PURE__ */ jsx3("select", { className: "dbw-sel", value: schema, onChange: (e) => {
        setSchema(e.target.value);
        setTable("");
      }, style: { maxWidth: 160 }, children: schemas.map((s) => /* @__PURE__ */ jsx3("option", { value: s, children: s }, s)) }),
      /* @__PURE__ */ jsx3("input", { className: "dbw-inp", style: { maxWidth: 160 }, placeholder: "\u8FC7\u6EE4\u8868\u540D\u2026", value: filter, onChange: (e) => setFilter(e.target.value) }),
      loading && /* @__PURE__ */ jsx3("span", { className: "dbw-sub", children: "\u52A0\u8F7D\u4E2D\u2026" })
    ] }) }) }),
    shownTables.length > 0 && /* @__PURE__ */ jsx3("div", { className: "dbw-card", children: /* @__PURE__ */ jsx3("div", { className: "dbw-tree", style: { padding: "6px 4px", maxHeight: 260, overflowY: "auto" }, children: shownTables.map((t) => /* @__PURE__ */ jsxs3("div", { className: `dbw-tree-i ${table === t.name ? "on" : ""}`, onClick: () => setTable(t.name), children: [
      /* @__PURE__ */ jsx3("span", { className: "dbw-tag", style: { minWidth: 34, textAlign: "center" }, children: t.type === "VIEW" || t.type.includes("VIEW") ? "\u89C6\u56FE" : "\u8868" }),
      /* @__PURE__ */ jsx3("span", { style: { color: "#E6EAF2" }, children: t.name }),
      /* @__PURE__ */ jsxs3("span", { className: "dbw-sub", style: { marginLeft: "auto" }, children: [
        t.estRows != null ? `~${t.estRows}\u884C` : "",
        " ",
        fmtBytes(t.bytes)
      ] })
    ] }, t.name)) }) }),
    desc && /* @__PURE__ */ jsxs3(Fragment2, { children: [
      /* @__PURE__ */ jsxs3("div", { className: "dbw-sec", children: [
        /* @__PURE__ */ jsx3("div", { className: "dbw-bar" }),
        schema,
        ".",
        table,
        " \u7684\u5217 ",
        /* @__PURE__ */ jsxs3("span", { className: "dbw-hint", children: [
          desc.columns.length,
          " \u5217"
        ] })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { margin: "0 16px 10px" }, children: /* @__PURE__ */ jsx3("div", { className: "dbw-tblwrap", style: { maxHeight: 240 }, children: /* @__PURE__ */ jsxs3("table", { className: "dbw-table", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("th", { children: "\u5217" }),
          /* @__PURE__ */ jsx3("th", { children: "\u7C7B\u578B" }),
          /* @__PURE__ */ jsx3("th", { children: "\u53EF\u7A7A" }),
          /* @__PURE__ */ jsx3("th", { children: "\u9ED8\u8BA4" }),
          /* @__PURE__ */ jsx3("th", { children: "\u952E" }),
          /* @__PURE__ */ jsx3("th", { children: "\u6CE8\u91CA" })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: desc.columns.map((c) => /* @__PURE__ */ jsxs3("tr", { children: [
          /* @__PURE__ */ jsx3("td", { style: { color: "#E6EAF2" }, children: c.name }),
          /* @__PURE__ */ jsx3("td", { children: c.type }),
          /* @__PURE__ */ jsx3("td", { className: c.nullable ? "" : "dbw-null", children: c.nullable ? "YES" : "NO" }),
          /* @__PURE__ */ jsx3("td", { className: "dbw-null", children: c.defaultValue == null ? "NULL" : String(c.defaultValue) }),
          /* @__PURE__ */ jsx3("td", { children: c.key || "" }),
          /* @__PURE__ */ jsx3("td", { children: c.comment || "" })
        ] }, c.name)) })
      ] }) }) }),
      desc.indexes.length > 0 && /* @__PURE__ */ jsx3("div", { className: "dbw-card", children: /* @__PURE__ */ jsxs3("div", { className: "dbw-card-b", children: [
        /* @__PURE__ */ jsxs3("b", { style: { fontSize: 12 }, children: [
          "\u7D22\u5F15\uFF08",
          desc.indexes.length,
          "\uFF09"
        ] }),
        desc.indexes.map((i) => /* @__PURE__ */ jsxs3("div", { className: "dbw-sub", style: { marginTop: 3 }, children: [
          /* @__PURE__ */ jsx3("span", { className: "dbw-tag", style: { marginRight: 6 }, children: i.unique ? "UNIQUE" : "INDEX" }),
          /* @__PURE__ */ jsx3("span", { className: "dbw-kbd", children: i.ddl ? i.ddl : `${i.name}(${(i.columns || []).join(", ")})` })
        ] }, i.name))
      ] }) })
    ] }),
    preview && preview.ok && preview.rows && /* @__PURE__ */ jsxs3(Fragment2, { children: [
      /* @__PURE__ */ jsxs3("div", { className: "dbw-sec", children: [
        /* @__PURE__ */ jsx3("div", { className: "dbw-bar" }),
        "\u9884\u89C8\u524D ",
        preview.rowCount,
        " \u884C",
        /* @__PURE__ */ jsx3("div", { style: { marginLeft: "auto" }, children: /* @__PURE__ */ jsx3("button", { className: "dbw-btn ghost sm", onClick: () => downloadCsv(preview.columns || [], preview.rows || [], `${table}-preview.csv`), children: "\u5BFC\u51FA CSV" }) })
      ] }),
      /* @__PURE__ */ jsx3("div", { style: { margin: "0 16px 10px" }, children: /* @__PURE__ */ jsx3("div", { className: "dbw-tblwrap", children: /* @__PURE__ */ jsxs3("table", { className: "dbw-table", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsx3("tr", { children: (preview.columns || []).map((c) => /* @__PURE__ */ jsx3("th", { children: c }, c)) }) }),
        /* @__PURE__ */ jsx3("tbody", { children: preview.rows.map((row, i) => /* @__PURE__ */ jsx3("tr", { children: (preview.columns || []).map((c) => {
          const v = row[c];
          return /* @__PURE__ */ jsx3("td", { className: v == null ? "dbw-null" : "", title: v == null ? "" : String(v), children: v == null ? "NULL" : String(v) }, c);
        }) }, i)) })
      ] }) }) })
    ] }),
    table && !loading && (!preview || !preview.ok) && /* @__PURE__ */ jsx3("div", { className: "dbw-err", children: preview && !preview.ok ? preview.error : "\u9884\u89C8\u52A0\u8F7D\u5931\u8D25" })
  ] });
}

// src/RedisTab.tsx
import { useEffect as useEffect3, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var TYPE_COLORS = {
  string: "#3FB950",
  hash: "#A371F7",
  list: "#58A6FF",
  set: "#D29922",
  zset: "#F0883E",
  stream: "#F85149",
  none: "#5C6678"
};
async function redisCall(svc, profileId, command, args) {
  const r = await svc.redis(profileId, command, args);
  if (!r.ok) throw new Error(r.error || "\u547D\u4EE4\u5931\u8D25");
  return r.reply;
}
async function readValue(svc, profileId, key, type) {
  try {
    switch (type) {
      case "string": {
        const v = await redisCall(svc, profileId, "GET", [key]);
        return v == null ? null : String(v);
      }
      case "hash": {
        const v = await redisCall(svc, profileId, "HGETALL", [key]);
        if (Array.isArray(v)) {
          const pairs = [];
          for (let i = 0; i < v.length; i += 2) pairs.push(`${v[i]} = ${v[i + 1]}`);
          return pairs.join("\n");
        }
        return JSON.stringify(v);
      }
      case "list":
        return JSON.stringify(await redisCall(svc, profileId, "LRANGE", [key, "0", "49"]), null, 1);
      case "set": {
        const v = await redisCall(svc, profileId, "SMEMBERS", [key]);
        return Array.isArray(v) ? v.slice(0, 50).join("\n") : JSON.stringify(v);
      }
      case "zset":
        return JSON.stringify(await redisCall(svc, profileId, "ZRANGE", [key, "0", "49", "WITHSCORES"]), null, 1);
      case "stream":
        return JSON.stringify(await redisCall(svc, profileId, "XRANGE", [key, "-", "+", "COUNT", "10"]), null, 1);
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}
function RedisTab({ svc, profiles, selectedId, setSelectedId, showToast, pickProfile }) {
  const redisTypes = profiles.filter((p) => p.type === "redis");
  const [profileId, setProfileId] = useState4(selectedId || redisTypes[0] && redisTypes[0].id || "");
  const [pattern, setPattern] = useState4("*");
  const [cursor, setCursor] = useState4("0");
  const [keys, setKeys] = useState4([]);
  const [scanning, setScanning] = useState4(false);
  const [cmd, setCmd] = useState4("INFO");
  const [cmdArgs, setCmdArgs] = useState4("");
  const [cmdOut, setCmdOut] = useState4("");
  const [dbsize, setDbsize] = useState4(null);
  useEffect3(() => {
    if (selectedId) {
      const p = profiles.find((x) => x.id === selectedId);
      if (p && p.type === "redis" && p.id !== profileId) setProfileId(p.id);
    }
  }, [selectedId]);
  const profile = redisTypes.find((p) => p.id === profileId) || null;
  const scan = async (startCursor) => {
    if (!profile) {
      showToast("\u5148\u521B\u5EFA Redis \u8FDE\u63A5", true);
      return;
    }
    setScanning(true);
    try {
      const args = ["0".repeat(0) + startCursor, "MATCH", pattern, "COUNT", "200"];
      const reply = await redisCall(svc, profile.id, "SCAN", args);
      const nextCursor = Array.isArray(reply) ? String(reply[0]) : "0";
      const names = Array.isArray(reply) && Array.isArray(reply[1]) ? reply[1].map(String) : [];
      const rows = [];
      for (const k of names.slice(0, 60)) {
        let type = "none";
        try {
          type = String(await redisCall(svc, profile.id, "TYPE", [k]) || "none");
        } catch (_) {
        }
        let ttl = null;
        try {
          ttl = Number(await redisCall(svc, profile.id, "TTL", [k]));
        } catch (_) {
        }
        rows.push({ key: k, type, ttl, value: null });
      }
      setCursor(nextCursor);
      setKeys(nextCursor === "0" ? rows : keys.concat(rows));
      if (nextCursor === "0" && rows.length === 0) showToast("\u65E0\u5339\u914D\u952E");
    } catch (e) {
      showToast(e.message || "SCAN \u5931\u8D25", true);
    } finally {
      setScanning(false);
    }
  };
  const expand = async (row) => {
    if (!profile || row.value != null) return;
    const v = await readValue(svc, profile.id, row.key, row.type);
    setKeys((ks) => ks.map((k) => k.key === row.key ? { ...k, value: v } : k));
  };
  const refreshSize = async () => {
    if (!profile) return;
    try {
      const n = Number(await redisCall(svc, profile.id, "DBSIZE", []));
      setDbsize(Number.isFinite(n) ? n : null);
    } catch (_) {
      setDbsize(null);
    }
  };
  useEffect3(() => {
    if (profile) void refreshSize();
  }, [profileId]);
  const runCmd = async () => {
    if (!profile) return;
    const args = cmdArgs.trim() ? cmdArgs.trim().split(/\s+/) : [];
    try {
      const reply = await redisCall(svc, profile.id, cmd.trim(), args);
      let text;
      if (typeof reply === "string") text = reply;
      else if (reply == null) text = "(nil)";
      else if (typeof reply === "object") {
        text = JSON.stringify(reply, null, 2);
        if (typeof reply === "object" && Object.keys(reply).length === 0) text = "(\u7A7A)";
      } else text = String(reply);
      setCmdOut(text.length > 8e3 ? text.slice(0, 8e3) + "\u2026[\u622A\u65AD]" : text);
      void refreshSize();
    } catch (e) {
      setCmdOut(`\u2717 ${e.message}`);
    }
  };
  if (!redisTypes.length) {
    return /* @__PURE__ */ jsxs4("div", { className: "dbw-empty", children: [
      "\u8FD8\u6CA1\u6709 Redis \u8FDE\u63A5\u3002",
      /* @__PURE__ */ jsx4("br", {}),
      "\u5148\u5728\u300C\u8FDE\u63A5\u300D\u91CC\u521B\u5EFA\uFF08\u7C7B\u578B\u9009 Redis\uFF09\u3002"
    ] });
  }
  return /* @__PURE__ */ jsxs4("div", { children: [
    /* @__PURE__ */ jsxs4("div", { className: "dbw-sec", children: [
      /* @__PURE__ */ jsx4("div", { className: "dbw-bar" }),
      "Redis \u6D4F\u89C8",
      dbsize != null && /* @__PURE__ */ jsxs4("span", { className: "dbw-hint", children: [
        "DBSIZE ",
        dbsize
      ] })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dbw-card", children: /* @__PURE__ */ jsxs4("div", { className: "dbw-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "dbw-row", children: [
        /* @__PURE__ */ jsx4("select", { className: "dbw-sel", value: profileId, onChange: (e) => {
          setProfileId(e.target.value);
          setSelectedId(e.target.value);
          setKeys([]);
          setCursor("0");
        }, style: { minWidth: 130 }, children: redisTypes.map((x) => /* @__PURE__ */ jsx4("option", { value: x.id, children: x.name }, x.id)) }),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "dbw-inp",
            style: { maxWidth: 190 },
            value: pattern,
            placeholder: "\u5339\u914D\u6A21\u5F0F cache:*",
            onChange: (e) => setPattern(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx4("button", { className: "dbw-btn sm", disabled: scanning, onClick: () => {
          setKeys([]);
          setCursor("0");
          void scan("0");
        }, children: scanning ? "\u626B\u63CF\u4E2D\u2026" : "SCAN" }),
        cursor !== "0" && /* @__PURE__ */ jsxs4("button", { className: "dbw-btn ghost sm", disabled: scanning, onClick: () => void scan(cursor), children: [
          "\u66F4\u591A\uFF08\u6E38\u6807 ",
          cursor.slice(0, 8),
          "\u2026\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "dbw-sub", style: { marginTop: 5 }, children: "SCAN \u5F3A\u5236\u5E26 COUNT \u9632\u5927\u5E93\u963B\u585E\uFF1B\u5C55\u5F00\u952E\u8BFB\u53D6 TTL \u4E0E\u503C\uFF08\u53EA\u8BFB\u547D\u4EE4\uFF09\u3002" })
    ] }) }),
    keys.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "dbw-card", children: [
      /* @__PURE__ */ jsx4("div", { className: "dbw-tree", style: { padding: "6px 4px", maxHeight: 300, overflowY: "auto" }, children: keys.map((k) => /* @__PURE__ */ jsxs4("div", { className: "dbw-tree-i", onClick: () => void expand(k), title: "\u70B9\u51FB\u8BFB\u53D6\u503C", children: [
        /* @__PURE__ */ jsx4("span", { className: "dbw-tag", style: { color: TYPE_COLORS[k.type] || "#8B95A7", minWidth: 42, textAlign: "center" }, children: k.type }),
        /* @__PURE__ */ jsx4("span", { style: { fontFamily: "Consolas,Menlo,monospace", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }, children: k.key }),
        k.ttl != null && k.ttl >= 0 && /* @__PURE__ */ jsx4("span", { className: `dbw-tag ${k.ttl === -1 ? "g" : k.ttl < 60 ? "r" : "y"}`, children: k.ttl === -1 ? "\u6C38\u4E0D\u8FC7\u671F" : `${k.ttl}s` })
      ] }, k.key)) }),
      keys.some((k) => k.value != null) && /* @__PURE__ */ jsx4("div", { style: { padding: "8px 13px", borderTop: "1px solid #1d2330" }, children: keys.filter((k) => k.value != null).slice(-1).map((k) => /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsxs4("div", { className: "dbw-sub", style: { marginBottom: 3 }, children: [
          k.key,
          " \u7684\u503C\uFF1A"
        ] }),
        /* @__PURE__ */ jsx4("pre", { style: { margin: 0, background: "#0D1117", border: "1px solid #2a2f3a", borderRadius: 8, padding: 8, fontSize: 11, maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }, children: k.value })
      ] }, k.key)) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "dbw-sec", children: [
      /* @__PURE__ */ jsx4("div", { className: "dbw-bar" }),
      "\u547D\u4EE4"
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "dbw-card", children: /* @__PURE__ */ jsxs4("div", { className: "dbw-card-b", children: [
      /* @__PURE__ */ jsxs4("div", { className: "dbw-row", children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "dbw-inp",
            style: { maxWidth: 130, fontFamily: "Consolas,monospace" },
            value: cmd,
            placeholder: "GET",
            onChange: (e) => setCmd(e.target.value.toUpperCase())
          }
        ),
        /* @__PURE__ */ jsx4(
          "input",
          {
            className: "dbw-inp",
            style: { flex: 1, fontFamily: "Consolas,monospace" },
            value: cmdArgs,
            placeholder: "\u53C2\u6570\uFF08\u7A7A\u683C\u5206\u9694\uFF09\uFF0C\u5982 mykey \u6216 0 MATCH a:* COUNT 100",
            onChange: (e) => setCmdArgs(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") void runCmd();
            }
          }
        ),
        /* @__PURE__ */ jsx4("button", { className: "dbw-btn", onClick: () => void runCmd(), children: "\u6267\u884C" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "dbw-sub", style: { marginTop: 5 }, children: "\u53EA\u8BFB\u547D\u4EE4\u76F4\u63A5\u653E\u884C\uFF1B\u5199\u547D\u4EE4\u9700\u8981\u8FDE\u63A5\u5F00\u542F allowWrite\uFF1BFLUSHALL/CONFIG \u7B49\u670D\u52A1\u5668\u7EA7\u547D\u4EE4\u6C38\u4E45\u62D2\u7EDD\u3002" }),
      cmdOut && /* @__PURE__ */ jsx4("pre", { style: { margin: "8px 0 0", background: "#0D1117", border: "1px solid #2a2f3a", borderRadius: 8, padding: 9, fontSize: 11, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", color: cmdOut.startsWith("\u2717") ? "#F85149" : "#c9d1d9" }, children: cmdOut })
    ] }) })
  ] });
}

// src/Panel.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var css = `
.dbw-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.dbw-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.dbw-body{flex:1;overflow-y:auto;padding:0 0 24px}
.dbw-body::-webkit-scrollbar{width:9px;height:9px}
.dbw-body::-webkit-scrollbar-track{background:transparent}
.dbw-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.dbw-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.dbw-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#8957E5,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.dbw-tt{flex:1;min-width:0}
.dbw-tt b{font-size:15px;display:block}
.dbw-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px}
.dbw-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dbw-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.dbw-dot.down{background:#F85149}
.dbw-tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dbw-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.dbw-tab:hover{color:#E6EAF2}
.dbw-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.dbw-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.dbw-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#8957E5,#58A6FF);flex-shrink:0}
.dbw-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.dbw-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.dbw-card-b{padding:11px 13px}
.dbw-sub{font-size:10.5px;color:#8B95A7;line-height:1.6}
.dbw-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.dbw-tag.g{color:#3FB950;border-color:#1d4428}
.dbw-tag.y{color:#D29922;border-color:#4a3a12}
.dbw-tag.p{color:#A371F7;border-color:#3a2a5c}
.dbw-tag.r{color:#F85149;border-color:#54262c}
.dbw-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.dbw-btn:hover{filter:brightness(1.1)}
.dbw-btn:disabled{opacity:.45;cursor:not-allowed}
.dbw-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.dbw-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.dbw-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.dbw-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.dbw-inp:focus{outline:none;border-color:#2b6cb0}
.dbw-inp::placeholder{color:#4d5566}
.dbw-sel{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:6px 8px;font-size:12px}
.dbw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dbw-lbl{font-size:11px;color:#8B95A7;min-width:64px}
.dbw-empty{color:#8B95A7;font-size:12px;padding:26px 16px;text-align:center;line-height:1.9}
.dbw-err{color:#F85149;font-size:11.5px;padding:8px 16px;white-space:pre-wrap}
.dbw-ok{color:#3FB950;font-size:11.5px;padding:8px 16px}
.dbw-warn{color:#D29922;font-size:11.5px;padding:8px 16px}
.dbw-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1C2330;border:1px solid #2a2f3a;color:#E6EAF2;padding:8px 16px;border-radius:10px;font-size:12px;z-index:99;max-width:80%;box-shadow:0 6px 20px rgba(0,0,0,.5)}
.dbw-toast.err{border-color:#54262c;color:#F85149}

.dbw-pcard{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;border-bottom:1px solid #1d2330}
.dbw-pcard:last-child{border-bottom:none}
.dbw-pcard:hover{background:#1a2029}
.dbw-pcard.on{background:#1C2330}
.dbw-picon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;color:#fff}
.dbw-pinfo{flex:1;min-width:0}
.dbw-pinfo b{font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbw-pinfo small{color:#8B95A7;font-size:10.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.dbw-editor{width:100%;min-height:110px;background:#0D1117;border:1px solid #2a2f3a;border-radius:10px;color:#E6EAF2;font:12px/1.6 Consolas,Menlo,monospace;padding:10px;resize:vertical;tab-size:2}
.dbw-editor:focus{outline:none;border-color:#2b6cb0}
.dbw-tblwrap{overflow:auto;border:1px solid #242C3A;border-radius:10px;max-height:420px}
.dbw-table{border-collapse:collapse;font-size:11.5px;min-width:100%}
.dbw-table th{position:sticky;top:0;background:#1C2330;color:#8B95A7;font-weight:600;text-align:left;padding:6px 10px;border-bottom:1px solid #242C3A;white-space:nowrap;z-index:2}
.dbw-table td{padding:5px 10px;border-bottom:1px solid #1a2029;white-space:nowrap;max-width:340px;overflow:hidden;text-overflow:ellipsis;color:#c9d1d9;font-family:Consolas,Menlo,monospace;font-size:11px}
.dbw-table tr:hover td{background:#1a2029}
.dbw-null{color:#5C6678;font-style:italic}
.dbw-kbd{background:#0D1117;border:1px solid #2a2f3a;border-radius:5px;padding:1px 6px;font:10.5px Consolas,monospace;color:#A371F7}
.dbw-chk{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#8B95A7;cursor:pointer;user-select:none}
.dbw-chk input{accent-color:#8957E5}
.dbw-modal{position:fixed;inset:0;background:rgba(6,8,12,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:20px}
.dbw-modal-c{background:#161B22;border:1px solid #2a2f3a;border-radius:14px;max-width:460px;width:100%;max-height:82vh;overflow-y:auto;padding:16px}
.dbw-h3{font-size:13.5px;font-weight:700;margin:0 0 10px}
.dbw-tree{font-size:12px;user-select:none}
.dbw-tree-i{display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;white-space:nowrap}
.dbw-tree-i:hover{background:#1a2029}
.dbw-tree-i.on{background:#1C2330}
.dbw-tree-g{color:#8B95A7}
`;
var TABS = [
  { id: "conn", label: "\u8FDE\u63A5" },
  { id: "query", label: "\u67E5\u8BE2" },
  { id: "schema", label: "\u7ED3\u6784" },
  { id: "redis", label: "Redis" }
];
function DbWorkbenchPanel() {
  const [tab, setTab] = useState5("conn");
  const [svcOk, setSvcOk] = useState5(null);
  const [svcReason, setSvcReason] = useState5("");
  const [svcVersion, setSvcVersion] = useState5("");
  const [profiles, setProfiles] = useState5([]);
  const [selectedId, setSelectedId] = useState5("");
  const [toast, setToast] = useState5(null);
  const [reloadTick, setReloadTick] = useState5(0);
  const svcRef = useRef2(new SvcClient());
  const showToast = useCallback2((msg, isErr) => {
    setToast({ msg, err: isErr === true, at: Date.now() });
    setTimeout(() => setToast((t) => t && Date.now() - t.at >= 2600 ? null : t), 2800);
  }, []);
  const reloadProfiles = useCallback2(async () => {
    const svc = svcRef.current;
    try {
      const list = await svc.profiles();
      setProfiles(list);
      return list;
    } catch (_) {
      return [];
    }
  }, []);
  useEffect4(() => {
    let alive = true;
    (async () => {
      const d = await svcRef.current.discover();
      if (!alive) return;
      setSvcOk(d.ok);
      setSvcReason(d.reason);
      if (d.ok) {
        const info = await svcRef.current.infoSvc().catch(() => null);
        if (info && info.ok) setSvcVersion(info.version || "");
        await reloadProfiles();
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadProfiles, reloadTick]);
  const retry = useCallback2(() => setReloadTick((t) => t + 1), []);
  const selected = profiles.find((p) => p.id === selectedId) || null;
  const pickProfile = useCallback2(async () => {
    const list = profiles.length ? profiles : await reloadProfiles();
    return list.find((p) => p.id === selectedId) || null;
  }, [profiles, selectedId, reloadProfiles]);
  return /* @__PURE__ */ jsxs5("div", { className: "dbw-root", children: [
    /* @__PURE__ */ jsx5("style", { children: css }),
    /* @__PURE__ */ jsxs5("div", { className: "dbw-top", children: [
      /* @__PURE__ */ jsx5("div", { className: "dbw-logo", children: "\u{1F5C3}" }),
      /* @__PURE__ */ jsxs5("div", { className: "dbw-tt", children: [
        /* @__PURE__ */ jsx5("b", { children: "\u6570\u636E\u5E93\u5DE5\u4F5C\u53F0" }),
        /* @__PURE__ */ jsxs5("small", { children: [
          /* @__PURE__ */ jsx5("span", { className: `dbw-dot ${svcOk ? "ok" : "down"}` }),
          svcOk === null ? "\u8FDE\u63A5\u4E2D\u2026" : svcOk ? `\u670D\u52A1 v${svcVersion} \xB7 ${profiles.length} \u4E2A\u8FDE\u63A5` : "\u670D\u52A1\u672A\u8FDE\u63A5"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "dbw-tabs", children: TABS.map((t) => /* @__PURE__ */ jsx5("button", { className: `dbw-tab ${tab === t.id ? "on" : ""}`, onClick: () => setTab(t.id), children: t.label }, t.id)) })
    ] }),
    svcOk === false && /* @__PURE__ */ jsx5("div", { className: "dbw-card", children: /* @__PURE__ */ jsxs5("div", { className: "dbw-card-b", children: [
      /* @__PURE__ */ jsx5("div", { className: "dbw-err", style: { padding: 0 }, children: svcReason }),
      /* @__PURE__ */ jsx5("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx5("button", { className: "dbw-btn ghost sm", onClick: retry, children: "\u91CD\u8BD5" }) })
    ] }) }),
    svcOk && /* @__PURE__ */ jsxs5("div", { className: "dbw-body", children: [
      tab === "conn" && /* @__PURE__ */ jsx5(
        ConnectionsTab,
        {
          svc: svcRef.current,
          profiles,
          reloadProfiles,
          selectedId,
          setSelectedId,
          showToast
        }
      ),
      tab === "query" && /* @__PURE__ */ jsx5(
        QueryTab,
        {
          svc: svcRef.current,
          profiles,
          selectedId,
          setSelectedId,
          showToast
        }
      ),
      tab === "schema" && /* @__PURE__ */ jsx5(
        SchemaTab,
        {
          svc: svcRef.current,
          profiles,
          selectedId,
          setSelectedId,
          showToast
        }
      ),
      tab === "redis" && /* @__PURE__ */ jsx5(
        RedisTab,
        {
          svc: svcRef.current,
          profiles,
          selectedId,
          setSelectedId,
          showToast,
          pickProfile
        }
      )
    ] }),
    toast && /* @__PURE__ */ jsx5("div", { className: `dbw-toast ${toast.err ? "err" : ""}`, children: toast.msg })
  ] });
}

// src/index.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
function DbWorkbenchEntry() {
  return /* @__PURE__ */ jsx6(DbWorkbenchPanel, {});
}
export {
  DbWorkbenchEntry as default
};
