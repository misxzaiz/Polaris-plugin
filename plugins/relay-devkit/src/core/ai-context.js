// core/ai-context.js - context collector: auto-grab API/DB state based on current view
// 让 AI 知道用户在干什么，无需手动复制粘贴。

import { currentView } from "./router.js";
import { $ } from "./dom.js";
import { getDbState, dbReq } from "../tools/db.js";
import { getApiState, getActiveTab } from "../tools/api.js";

const MAX_CONTEXT_ROWS = 10;

function getUserSelection() {
  const sel = window.getSelection();
  return sel && sel.toString().trim() ? sel.toString().trim() : null;
}

function buildApiContext() {
  const tab = getActiveTab();
  if (!tab) return null;
  const parts = [];
  parts.push("当前工具：API 请求");
  parts.push("请求方法：" + (tab.method || "GET"));
  if (tab.url) parts.push("请求 URL：" + tab.url);
  if (tab.bodyType !== "none" && tab.body) {
    const bodyStr = typeof tab.body === "string" ? tab.body : JSON.stringify(tab.body);
    parts.push("请求体：" + bodyStr.slice(0, 2000));
  }
  if (tab.response) {
    if (tab.response.error) {
      parts.push("响应错误：" + tab.response.error);
    } else {
      parts.push("响应状态：" + (tab.response.status || "未知"));
      if (tab.response.text) {
        parts.push("响应体（前 2000 字符）：" + String(tab.response.text).slice(0, 2000));
      }
    }
  }
  return parts.join("\n");
}

function buildDbContext() {
  const dbs = getDbState();
  if (!dbs) return null;
  const parts = [];
  parts.push("当前工具：数据库");
  if (dbs.driver === "mysql") {
    parts.push("驱动：MySQL");
    if (dbs.my.version) parts.push("版本：MySQL " + dbs.my.version);
    if (dbs.my.database) parts.push("当前数据库：" + dbs.my.database);
    if (dbs.my.tables && dbs.my.tables.length) {
      parts.push("可用表（" + dbs.my.tables.length + " 张）：" + dbs.my.tables.slice(0, 30).join(", ") + (dbs.my.tables.length > 30 ? " …" : ""));
    }
    if (dbs.curTable) {
      parts.push("当前选中表：" + dbs.curTable);
      const cols = (dbs.my.columns && dbs.my.columns[dbs.curTable]) || [];
      if (cols.length) {
        const colSummary = cols.map(c => c.name + " " + (c.type || "") + (c.pk ? " PK" : "")).join(", ");
        parts.push("表结构：" + colSummary);
      }
    }
    const sqlEl = $("#dbSql");
    if (sqlEl && sqlEl.value.trim()) {
      parts.push("编辑器 SQL：" + sqlEl.value.trim().slice(0, 500));
    }
    if (dbs.result) {
      if (dbs.result.error) {
        parts.push("上次执行错误：" + dbs.result.error);
      } else if (dbs.result.rows && dbs.result.rows.length) {
        const preview = dbs.result.rows.slice(0, MAX_CONTEXT_ROWS);
        parts.push("上次查询结果（前 " + preview.length + " 行）：" + JSON.stringify(preview));
      }
      if (dbs.result.note) parts.push("上次结果信息：" + dbs.result.note);
    }
  } else if (dbs.driver === "supabase") {
    parts.push("驱动：Supabase");
    if (dbs.sb.tables && dbs.sb.tables.length) parts.push("可用表：" + dbs.sb.tables.join(", "));
  }
  return parts.join("\n");
}

var BASE_SYSTEM_PROMPT = `你是 RELAY DevKit 的 AI 助手，一个专业的开发调试工具。你可以帮助用户：

1. **API 调试** — 分析 HTTP 请求/响应错误，提供解决方案
2. **SQL 优化** — 分析 SQL 查询性能，提供优化建议和索引建议
3. **SQL 编写** — 根据用户需求生成 SQL 查询语句
4. **数据库交互** — 通过工具执行 SQL、查看表结构、分析执行计划
5. **数据分析** — 执行聚合查询，生成数据摘要

规则：
- 回复使用中文，代码和技术术语保持英文
- 生成的 SQL 使用标准 MySQL 语法
- 写操作（INSERT/UPDATE/DELETE/DROP/ALTER）必须先向用户说明意图
- 优先使用 SELECT 验证数据后再建议写操作
- 如果上下文信息不足以回答，主动询问补充`;

export function buildSystemPrompt() {
  const parts = [BASE_SYSTEM_PROMPT];
  const view = currentView();
  let context = null;
  if (view === "api") context = buildApiContext();
  else if (view === "db") context = buildDbContext();
  if (context) parts.push("\n--- 当前用户上下文 ---\n" + context);
  const selection = getUserSelection();
  if (selection) parts.push("\n用户选中的文本：" + selection.slice(0, 1000));
  return parts.join("\n");
}

export function buildContextSummary() {
  const view = currentView();
  const parts = [];
  if (view === "api") {
    const tab = getActiveTab();
    if (tab) {
      parts.push("API");
      if (tab.method && tab.url) parts.push(tab.method + " " + (tab.url.length > 40 ? tab.url.slice(0, 40) + "…" : tab.url));
      if (tab.response) parts.push(tab.response.error ? "有错误" : "状态 " + (tab.response.status || "?"));
    }
  } else if (view === "db") {
    const dbs = getDbState();
    if (dbs) {
      parts.push(dbs.driver === "mysql" && dbs.my.database ? "数据库 · " + dbs.my.database : "数据库");
      if (dbs.curTable) parts.push(dbs.curTable);
    }
  } else {
    parts.push(view || "首页");
  }
  return parts.join(" · ") || "无上下文";
}

export function buildTools() {
  const dbs = getDbState();
  const connected = dbs && dbs.driver === "mysql" && !!dbs.my.token;
  if (!connected) return [];
  return [
    { type:"function", function:{ name:"execute_sql", description:"在当前 MySQL 连接上执行 SQL 查询并返回结果。", parameters:{ type:"object", properties:{ sql:{ type:"string", description:"要执行的 SQL 语句" }, max_rows:{ type:"number", description:"最大返回行数，默认 50", default:50 } }, required:["sql"] } } },
    { type:"function", function:{ name:"explain_sql", description:"对 SQL 语句执行 EXPLAIN 分析，返回执行计划信息。", parameters:{ type:"object", properties:{ sql:{ type:"string", description:"要分析的 SQL 语句" } }, required:["sql"] } } },
    { type:"function", function:{ name:"get_table_schema", description:"获取指定表的完整结构信息，包括建表 DDL 和列定义。", parameters:{ type:"object", properties:{ table:{ type:"string", description:"表名" } }, required:["table"] } } },
    { type:"function", function:{ name:"list_tables", description:"列出当前数据库的所有表名。", parameters:{ type:"object", properties:{} } } },
    { type:"function", function:{ name:"get_databases", description:"列出 MySQL 服务器上所有可用的数据库。", parameters:{ type:"object", properties:{} } } },
  ];
}

export async function executeToolCall(name, args) {
  const dbs = getDbState();
  if (!dbs || dbs.driver !== "mysql" || !dbs.my.token) return JSON.stringify({ error:"MySQL 未连接" });
  const isWrite = /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|RENAME)/i.test((args.sql||"").trim());
  if (isWrite && name === "execute_sql") {
    const confirmed = window.confirm("AI 请求执行写操作\n\n" + args.sql + "\n\n是否允许执行？");
    if (!confirmed) return JSON.stringify({ error:"用户取消了操作" });
  }
  try {
    switch (name) {
      case "execute_sql": {
        const maxRows = Math.min(args.max_rows||50, 200);
        const r = await dbReq("query", { token:dbs.my.token, sql:args.sql, maxRows });
        if (!r.ok) return JSON.stringify({ error:r.error });
        const preview = (r.rows||[]).slice(0, MAX_CONTEXT_ROWS);
        return JSON.stringify({ rows:preview, totalRows:r.rowCount, truncated:r.truncated, elapsedMs:r.elapsedMs, columns:r.columns, affectedRows:r.affectedRows });
      }
      case "explain_sql": {
        const r = await dbReq("query", { token:dbs.my.token, sql:"EXPLAIN "+args.sql, maxRows:50 });
        if (!r.ok) return JSON.stringify({ error:r.error });
        return JSON.stringify({ explain:r.rows||[], elapsedMs:r.elapsedMs });
      }
      case "get_table_schema": {
        const ddlR = await dbReq("query", { token:dbs.my.token, sql:"SHOW CREATE TABLE " + String.fromCharCode(96) + args.table + String.fromCharCode(96), maxRows:1 });
        const colsR = await dbReq("query", { token:dbs.my.token, sql:"SHOW FULL COLUMNS FROM " + String.fromCharCode(96) + args.table + String.fromCharCode(96), maxRows:200 });
        const ddl = ddlR.ok && ddlR.rows && ddlR.rows[0] ? Object.values(ddlR.rows[0]).find(function(_,i){return i===1;})||"" : "";
        const cols = colsR.ok ? (colsR.rows||[]).map(function(c){ return { name:c.Field, type:c.Type, key:c.Key, nullable:c.Null, default:c.Default, extra:c.Extra, comment:c.Comment }; }) : [];
        return JSON.stringify({ table:args.table, ddl:ddl, columns:cols, error:ddlR.error||colsR.error });
      }
      case "list_tables": return JSON.stringify({ tables:dbs.my.tables||[], database:dbs.my.database });
      case "get_databases": {
        const r = await dbReq("databases", { token:dbs.my.token });
        if (!r.ok) return JSON.stringify({ error:r.error });
        return JSON.stringify({ databases:r.databases||[] });
      }
      default: return JSON.stringify({ error:"未知工具: "+name });
    }
  } catch(e) { return JSON.stringify({ error:e.message }); }
}
