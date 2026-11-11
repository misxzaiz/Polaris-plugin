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

// shared/engine.js
var require_engine = __commonJS({
  "shared/engine.js"(exports, module) {
    "use strict";
    function parseInterval(value) {
      if (typeof value !== "string") return null;
      const v = value.trim();
      if (!v) return null;
      const numStr = v.slice(0, -1);
      const unit = v.slice(-1).toLowerCase();
      if (!/^-?\d+$/.test(numStr)) return null;
      const n = parseInt(numStr, 10);
      const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
      if (mult === void 0) return null;
      return n * mult;
    }
    function parseFieldPart(part, min, max, names) {
      const set = /* @__PURE__ */ new Set();
      for (const piece of part.split(",")) {
        let body = piece;
        let step = 1;
        const slash = body.indexOf("/");
        if (slash !== -1) {
          step = parseInt(body.slice(slash + 1), 10);
          if (!Number.isInteger(step) || step <= 0) return null;
          body = body.slice(0, slash);
        }
        let lo, hi;
        if (body === "*" || body === "?") {
          lo = min;
          hi = max;
        } else if (body.includes("-")) {
          const [a, b] = body.split("-");
          lo = resolveVal(a, names);
          hi = resolveVal(b, names);
          if (lo === null || hi === null) return null;
        } else {
          const v = resolveVal(body, names);
          if (v === null) return null;
          if (slash !== -1) {
            lo = v;
            hi = max;
          } else {
            lo = v;
            hi = v;
          }
        }
        if (lo < min || hi > max || lo > hi) return null;
        for (let i = lo; i <= hi; i += step) set.add(i);
      }
      return set.size ? set : null;
    }
    function resolveVal(s, names) {
      const t2 = s.trim();
      if (names && names[t2.toUpperCase()] !== void 0) return names[t2.toUpperCase()];
      if (!/^\d+$/.test(t2)) return null;
      return parseInt(t2, 10);
    }
    var DOW_NAMES = { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 };
    var MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
    function parseCron(expr) {
      if (typeof expr !== "string") return null;
      let e = expr.trim();
      const MACROS = {
        "@yearly": "0 0 0 1 1 *",
        "@monthly": "0 0 0 1 * *",
        "@weekly": "0 0 0 * * SUN",
        "@daily": "0 0 0 * * *",
        "@hourly": "0 0 * * * *"
      };
      if (MACROS[e]) e = MACROS[e];
      const parts = e.split(/\s+/);
      if (parts.length < 6 || parts.length > 7) return null;
      const sec = parseFieldPart(parts[0], 0, 59);
      const min = parseFieldPart(parts[1], 0, 59);
      const hour = parseFieldPart(parts[2], 0, 23);
      const dom = parseFieldPart(parts[3], 1, 31);
      const mon = parseFieldPart(parts[4], 1, 12, MONTH_NAMES);
      const dow = parseFieldPart(parts[5], 1, 7, DOW_NAMES);
      let years = null;
      if (parts.length === 7) {
        years = parseFieldPart(parts[6], 1970, 2999);
        if (!years) return null;
      }
      if (!sec || !min || !hour || !dom || !mon || !dow) return null;
      return { sec, min, hour, dom, mon, dow, years };
    }
    function jsDowToCron(jsDow) {
      return jsDow + 1;
    }
    function cronNext(expr, nowSec) {
      const p = parseCron(expr);
      if (!p) return null;
      const base = (nowSec === void 0 ? Date.now() / 1e3 : nowSec) * 1e3;
      const t2 = new Date(Math.floor(base / 1e3) * 1e3 + 1e3);
      const limitMs = base + 4 * 366 * 86400 * 1e3;
      for (let guard = 0; guard < 4e6; guard++) {
        if (t2.getTime() > limitMs) return null;
        const year = t2.getUTCFullYear();
        if (p.years && !p.years.has(year)) {
          t2.setUTCFullYear(year + 1, 0, 1);
          t2.setUTCHours(0, 0, 0, 0);
          continue;
        }
        if (!p.mon.has(t2.getUTCMonth() + 1)) {
          t2.setUTCMonth(t2.getUTCMonth() + 1, 1);
          t2.setUTCHours(0, 0, 0, 0);
          continue;
        }
        if (!p.dom.has(t2.getUTCDate()) || !p.dow.has(jsDowToCron(t2.getUTCDay()))) {
          t2.setUTCDate(t2.getUTCDate() + 1);
          t2.setUTCHours(0, 0, 0, 0);
          continue;
        }
        if (!p.hour.has(t2.getUTCHours())) {
          t2.setUTCHours(t2.getUTCHours() + 1, 0, 0, 0);
          continue;
        }
        if (!p.min.has(t2.getUTCMinutes())) {
          t2.setUTCMinutes(t2.getUTCMinutes() + 1, 0, 0);
          continue;
        }
        if (!p.sec.has(t2.getUTCSeconds())) {
          t2.setUTCSeconds(t2.getUTCSeconds() + 1);
          continue;
        }
        return Math.floor(t2.getTime() / 1e3);
      }
      return null;
    }
    function parseRfc3339Ts(v) {
      const ms = Date.parse(String(v));
      return Number.isFinite(ms) ? Math.floor(ms / 1e3) : null;
    }
    function calculateNextRun4(triggerType, triggerValue, now) {
      switch (triggerType) {
        case "once": {
          const ts = parseRfc3339Ts(triggerValue);
          return ts !== null && ts > now ? ts : null;
        }
        case "cron":
          return cronNext(triggerValue);
        case "interval":
        case "after_completion": {
          const secs = parseInterval(triggerValue);
          return secs !== null ? now + secs : null;
        }
        default:
          return null;
      }
    }
    function weekdayNameCn(jsDow) {
      return ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"][jsDow];
    }
    function pad2(n) {
      return String(n).padStart(2, "0");
    }
    function applyTemplate2(template, taskName, userPrompt, nowMs) {
      const now = nowMs === void 0 ? /* @__PURE__ */ new Date() : new Date(nowMs);
      const date = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
      const time = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
      return String(template).replace(/\{\{prompt\}\}/g, userPrompt).replace(/\{\{taskName\}\}/g, taskName).replace(/\{\{date\}\}/g, date).replace(/\{\{time\}\}/g, time).replace(/\{\{datetime\}\}/g, `${date} ${time}`).replace(/\{\{weekday\}\}/g, weekdayNameCn(now.getUTCDay()));
    }
    function recalcNextOnUpdate2(task, updatedAt, explicitNext) {
      if (explicitNext !== void 0 && explicitNext !== null) return explicitNext;
      const running = task.lastRunStatus === "running";
      if (task.triggerType === "after_completion" && running) return null;
      return calculateNextRun4(task.triggerType, task.triggerValue, updatedAt);
    }
    function recalcNextOnStatus(task, now, status) {
      if (task.triggerType === "after_completion" && status === "running") return null;
      return calculateNextRun4(task.triggerType, task.triggerValue, now);
    }
    var STALE_RUNNING_SECS = 30 * 60;
    function isDue(task, now) {
      if (!task.enabled) return false;
      if (task.lastRunStatus === "running") {
        if (task.lastRunAt !== null && task.lastRunAt !== void 0) {
          const stale = task.timeoutMinutes ? task.timeoutMinutes * 60 : STALE_RUNNING_SECS;
          if (now - task.lastRunAt > stale) return "stale";
        }
        return false;
      }
      if (task.nextRunAt === null || task.nextRunAt === void 0) return false;
      return task.nextRunAt <= now;
    }
    module.exports = {
      parseInterval,
      parseCron,
      cronNext,
      calculateNextRun: calculateNextRun4,
      applyTemplate: applyTemplate2,
      recalcNextOnUpdate: recalcNextOnUpdate2,
      recalcNextOnStatus,
      isDue,
      STALE_RUNNING_SECS,
      parseRfc3339Ts,
      weekdayNameCn,
      jsDowToCron
    };
  }
});

// shared/builtin-templates.js
var require_builtin_templates = __commonJS({
  "shared/builtin-templates.js"(exports, module) {
    "use strict";
    function builtin(nowSec) {
      const t2 = nowSec === void 0 ? Math.floor(Date.now() / 1e3) : nowSec;
      const base = { builtin: true, promptTemplate: null, customSections: null, enabled: true, createdAt: t2, updatedAt: t2 };
      return [
        {
          ...base,
          id: "dev-feature",
          name: "\u529F\u80FD\u5F00\u53D1",
          description: "\u7528\u4E8E\u6301\u7EED\u5F00\u53D1\u65B0\u529F\u80FD\u7684\u4EFB\u52A1\u6A21\u677F\uFF0C\u5305\u542B\u9700\u6C42\u5206\u6790\u3001\u5B9E\u73B0\u3001\u6D4B\u8BD5\u7B49\u9636\u6BB5",
          category: "development",
          protocolConfig: {
            missionTemplate: "\u5E2E\u6211\u5F00\u53D1\u4EE5\u4E0B\u529F\u80FD\uFF1A\n\n{mission}\n\n\u8BF7\u6309\u7167\u4EE5\u4E0B\u6B65\u9AA4\u6267\u884C\uFF1A\n1. \u5206\u6790\u9700\u6C42\u548C\u73B0\u6709\u4EE3\u7801\u7ED3\u6784\n2. \u8BBE\u8BA1\u5B9E\u73B0\u65B9\u6848\n3. \u7F16\u5199\u4EE3\u7801\u5B9E\u73B0\n4. \u7F16\u5199\u6D4B\u8BD5\u7528\u4F8B\n5. \u8FDB\u884C\u4EE3\u7801\u5BA1\u67E5\u548C\u4F18\u5316",
            executionRules: "### 1. \u68C0\u67E5\u7528\u6237\u8865\u5145\n- \u8BFB\u53D6\u7528\u6237\u8865\u5145\u6587\u4EF6\n- \u5982\u6709\u65B0\u5185\u5BB9\uFF0C\u4F18\u5148\u5904\u7406\u5E76\u5F52\u6863\n\n### 2. \u63A8\u8FDB\u4E3B\u4EFB\u52A1\n- \u8BFB\u53D6\u8BB0\u5FC6\u7D22\u5F15\u4E86\u89E3\u5F53\u524D\u8FDB\u5EA6\n- \u9009\u62E9\u4E0B\u4E00\u4E2A\u5F85\u529E\u4E8B\u9879\u6267\u884C\n- \u5B8C\u6210\u540E\u66F4\u65B0\u8BB0\u5FC6\n\n### 3. \u8BB0\u5FC6\u66F4\u65B0\n- \u65B0\u6210\u679C\u5199\u5165\u8BB0\u5FC6\u6587\u4EF6\n- \u5F85\u529E\u4EFB\u52A1\u5199\u5165\u4EFB\u52A1\u6587\u4EF6",
            memoryRules: "## \u6210\u679C\u5B9A\u4E49\n\n\u6709\u4EF7\u503C\u7684\u5DE5\u4F5C\uFF1A\n- \u5B8C\u6210\u5177\u4F53\u529F\u80FD\u5B9E\u73B0\n- \u4FEE\u590D\u5DF2\u77E5\u95EE\u9898\n- \u4F18\u5316\u4EE3\u7801\u8D28\u91CF\n- \u4EA7\u51FA\u53EF\u590D\u7528\u8D44\u4EA7\n\n\u907F\u514D\uFF1A\n- \u65E0\u4EA7\u51FA\u7684\u63A2\u7D22\n- \u91CD\u590D\u6027\u5DE5\u4F5C"
          },
          params: [
            { key: "mission", label: "\u4EFB\u52A1\u76EE\u6807", paramType: "textarea", required: true, defaultValue: null, placeholder: "\u63CF\u8FF0\u8981\u5F00\u53D1\u7684\u529F\u80FD...", options: null }
          ],
          defaultTriggerType: "interval",
          defaultTriggerValue: "1h",
          defaultEngineId: "claude-code",
          defaultMaxRuns: null,
          defaultTimeoutMinutes: null
        },
        {
          ...base,
          id: "protocol-assist",
          name: "\u534F\u8BAE\u534F\u52A9\u6A21\u5F0F",
          description: "\u5B8C\u6574\u7684\u534F\u8BAE\u4EFB\u52A1\u6A21\u677F\uFF0C\u652F\u6301\u4EFB\u52A1\u76EE\u6807\u548C\u7528\u6237\u8865\u5145\u5185\u5BB9",
          category: "development",
          protocolConfig: {
            missionTemplate: "{mission}",
            executionRules: "### 1. \u68C0\u67E5\u7528\u6237\u8865\u5145\n- \u8BFB\u53D6 `.polaris/tasks/{taskId}/supplement.md`\n- \u5982\u6709\u65B0\u5185\u5BB9\uFF0C\u4F18\u5148\u5904\u7406\u5E76\u5F52\u6863\n\n### 2. \u63A8\u8FDB\u4E3B\u4EFB\u52A1\n- \u8BFB\u53D6 `memory/index.md` \u4E86\u89E3\u5F53\u524D\u8FDB\u5EA6\n- \u9009\u62E9\u4E0B\u4E00\u4E2A\u5F85\u529E\u4E8B\u9879\u6267\u884C\n- \u5B8C\u6210\u540E\u66F4\u65B0\u8BB0\u5FC6\n\n### 3. \u8BB0\u5FC6\u66F4\u65B0\n- \u65B0\u6210\u679C\u5199\u5165 `memory/index.md`\n- \u5F85\u529E\u4EFB\u52A1\u5199\u5165 `memory/tasks.md`\n\n### 4. \u6587\u6863\u5907\u4EFD\n- \u7528\u6237\u8865\u5145\u5904\u7406\u5B8C\u6210\u540E\u8FC1\u79FB\u5230 `supplement-history/`\n- \u6587\u6863\u8D85\u8FC7 800 \u884C\u65F6\u603B\u7ED3\u540E\u5907\u4EFD",
            memoryRules: "## \u6210\u679C\u5B9A\u4E49\n\n\u6709\u4EF7\u503C\u7684\u5DE5\u4F5C\uFF1A\n- \u5B8C\u6210\u5177\u4F53\u529F\u80FD\u5B9E\u73B0\n- \u4FEE\u590D\u5DF2\u77E5\u95EE\u9898\n- \u4F18\u5316\u4EE3\u7801\u8D28\u91CF\n- \u4EA7\u51FA\u53EF\u590D\u7528\u8D44\u4EA7\n\n\u907F\u514D\uFF1A\n- \u65E0\u4EA7\u51FA\u7684\u63A2\u7D22\n- \u91CD\u590D\u6027\u5DE5\u4F5C"
          },
          params: [
            { key: "mission", label: "\u4EFB\u52A1\u76EE\u6807", paramType: "textarea", required: true, defaultValue: null, placeholder: "\u63CF\u8FF0\u4EFB\u52A1\u76EE\u6807...", options: null }
          ],
          defaultTriggerType: "interval",
          defaultTriggerValue: "1h",
          defaultEngineId: "claude-code",
          defaultMaxRuns: null,
          defaultTimeoutMinutes: null
        },
        {
          ...base,
          id: "review-code",
          name: "\u4EE3\u7801\u5BA1\u67E5",
          description: "\u7528\u4E8E\u5B9A\u671F\u5BA1\u67E5\u4EE3\u7801\u8D28\u91CF\u7684\u4EFB\u52A1\u6A21\u677F",
          category: "review",
          protocolConfig: {
            missionTemplate: "\u5BA1\u67E5\u4EE5\u4E0B\u4EE3\u7801\uFF1A\n\n{mission}\n\n\u5BA1\u67E5\u8981\u70B9\uFF1A\n- \u4EE3\u7801\u8D28\u91CF\n- \u5B89\u5168\u95EE\u9898\n- \u6027\u80FD\u95EE\u9898\n- \u6D4B\u8BD5\u8986\u76D6",
            executionRules: "### 1. \u6536\u96C6\u4FE1\u606F\n- \u83B7\u53D6\u5F85\u5BA1\u67E5\u7684\u4EE3\u7801\u53D8\u66F4\n- \u5206\u6790\u4EE3\u7801\u7ED3\u6784\n\n### 2. \u6267\u884C\u5BA1\u67E5\n- \u68C0\u67E5\u4EE3\u7801\u8D28\u91CF\n- \u5206\u6790\u6F5C\u5728\u95EE\u9898\n- \u63D0\u51FA\u6539\u8FDB\u5EFA\u8BAE\n\n### 3. \u6C47\u62A5\u7ED3\u679C\n- \u603B\u7ED3\u5BA1\u67E5\u53D1\u73B0\n- \u63D0\u4F9B\u6539\u8FDB\u5EFA\u8BAE",
            memoryRules: "## \u5BA1\u67E5\u6E05\u5355\n\n- [ ] \u4EE3\u7801\u8D28\u91CF\n- [ ] \u5B89\u5168\u95EE\u9898\n- [ ] \u6027\u80FD\u95EE\u9898\n- [ ] \u6D4B\u8BD5\u8986\u76D6\n- [ ] \u6587\u6863\u5B8C\u6574"
          },
          params: [
            { key: "mission", label: "\u5BA1\u67E5\u8303\u56F4", paramType: "textarea", required: true, defaultValue: null, placeholder: "\u63CF\u8FF0\u8981\u5BA1\u67E5\u7684\u4EE3\u7801\u8303\u56F4...", options: null }
          ],
          defaultTriggerType: "interval",
          defaultTriggerValue: "6h",
          defaultEngineId: "claude-code",
          defaultMaxRuns: null,
          defaultTimeoutMinutes: 30
        },
        {
          ...base,
          id: "news-search",
          name: "\u65B0\u95FB\u641C\u7D22",
          description: "\u7528\u4E8E\u641C\u7D22\u548C\u603B\u7ED3\u65B0\u95FB\u7684\u4EFB\u52A1\u6A21\u677F",
          category: "news",
          protocolConfig: {
            missionTemplate: "\u641C\u7D22\u4EE5\u4E0B\u5173\u952E\u8BCD\u7684\u65B0\u95FB\uFF1A\n\n{keywords}\n\n\u65F6\u95F4\u8303\u56F4\uFF1A{timeRange}",
            executionRules: "### 1. \u641C\u7D22\u65B0\u95FB\n- \u4F7F\u7528\u6307\u5B9A\u5173\u952E\u8BCD\u641C\u7D22\n- \u7B5B\u9009\u76F8\u5173\u65B0\u95FB\n- \u8BB0\u5F55\u6765\u6E90\n\n### 2. \u603B\u7ED3\u8981\u70B9\n- \u63D0\u53D6\u5173\u952E\u4FE1\u606F\n- \u5206\u7C7B\u6574\u7406\n- \u751F\u6210\u6458\u8981\n\n### 3. \u6C47\u62A5\u7ED3\u679C\n- \u6C47\u603B\u65B0\u95FB\u8981\u70B9\n- \u63D0\u4F9B\u539F\u6587\u94FE\u63A5",
            memoryRules: "## \u641C\u7D22\u8303\u56F4\n\n- \u5173\u952E\u8BCD: {keywords}\n- \u65F6\u95F4\u8303\u56F4: {timeRange}\n- \u6765\u6E90\u9650\u5236: {sources}"
          },
          params: [
            { key: "keywords", label: "\u641C\u7D22\u5173\u952E\u8BCD", paramType: "text", required: true, defaultValue: null, placeholder: "\u8F93\u5165\u641C\u7D22\u5173\u952E\u8BCD...", options: null },
            { key: "timeRange", label: "\u65F6\u95F4\u8303\u56F4", paramType: "select", required: true, defaultValue: "1d", placeholder: null, options: [
              { value: "1d", label: "\u6700\u8FD1\u4E00\u5929" },
              { value: "3d", label: "\u6700\u8FD1\u4E09\u5929" },
              { value: "1w", label: "\u6700\u8FD1\u4E00\u5468" },
              { value: "1m", label: "\u6700\u8FD1\u4E00\u6708" }
            ] },
            { key: "sources", label: "\u6765\u6E90\u9650\u5236", paramType: "text", required: false, defaultValue: null, placeholder: "\u53EF\u9009\uFF0C\u9650\u5236\u65B0\u95FB\u6765\u6E90", options: null }
          ],
          defaultTriggerType: "interval",
          defaultTriggerValue: "12h",
          defaultEngineId: "claude-code",
          defaultMaxRuns: null,
          defaultTimeoutMinutes: 15
        },
        {
          ...base,
          id: "monitor-service",
          name: "\u670D\u52A1\u76D1\u63A7",
          description: "\u7528\u4E8E\u76D1\u63A7\u670D\u52A1\u72B6\u6001\u7684\u4EFB\u52A1\u6A21\u677F",
          category: "monitor",
          protocolConfig: {
            missionTemplate: "\u76D1\u63A7\u4EE5\u4E0B\u670D\u52A1\uFF1A\n\n{service}\n\n\u76D1\u63A7\u9879\uFF1A\n- \u670D\u52A1\u53EF\u7528\u6027\n- \u54CD\u5E94\u65F6\u95F4\n- \u9519\u8BEF\u7387",
            executionRules: "### 1. \u68C0\u67E5\u72B6\u6001\n- \u83B7\u53D6\u670D\u52A1\u72B6\u6001\n- \u68C0\u67E5\u5173\u952E\u6307\u6807\n- \u8BB0\u5F55\u6570\u636E\n\n### 2. \u5206\u6790\u95EE\u9898\n- \u68C0\u6D4B\u5F02\u5E38\n- \u5206\u6790\u539F\u56E0\n- \u8BC4\u4F30\u5F71\u54CD\n\n### 3. \u6C47\u62A5\u7ED3\u679C\n- \u72B6\u6001\u6458\u8981\n- \u95EE\u9898\u62A5\u544A\n- \u5EFA\u8BAE\u63AA\u65BD",
            memoryRules: "## \u76D1\u63A7\u6307\u6807\n\n- \u670D\u52A1\u540D\u79F0: {service}\n- \u68C0\u67E5\u9891\u7387: {interval}\n- \u544A\u8B66\u9608\u503C: {threshold}"
          },
          params: [
            { key: "service", label: "\u670D\u52A1\u540D\u79F0", paramType: "text", required: true, defaultValue: null, placeholder: "\u8F93\u5165\u670D\u52A1\u540D\u79F0...", options: null },
            { key: "interval", label: "\u68C0\u67E5\u95F4\u9694", paramType: "select", required: true, defaultValue: "5m", placeholder: null, options: [
              { value: "1m", label: "1 \u5206\u949F" },
              { value: "5m", label: "5 \u5206\u949F" },
              { value: "15m", label: "15 \u5206\u949F" },
              { value: "30m", label: "30 \u5206\u949F" }
            ] },
            { key: "threshold", label: "\u544A\u8B66\u9608\u503C", paramType: "text", required: false, defaultValue: "\u54CD\u5E94\u65F6\u95F4 > 5s \u6216 \u9519\u8BEF\u7387 > 5%", placeholder: null, options: null }
          ],
          defaultTriggerType: "interval",
          defaultTriggerValue: "5m",
          defaultEngineId: "claude-code",
          defaultMaxRuns: null,
          defaultTimeoutMinutes: 5
        }
      ];
    }
    module.exports = { builtinTemplates: builtin };
  }
});

// src/Panel.tsx
import { useMemo as useMemo4, useState as useState6 } from "react";

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement } from "react";

// node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/lucide-react/dist/esm/Icon.js
var Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/circle-check.js
var CircleCheck = createLucideIcon("CircleCheck", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
]);

// node_modules/lucide-react/dist/esm/icons/circle-x.js
var CircleX = createLucideIcon("CircleX", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
]);

// node_modules/lucide-react/dist/esm/icons/clock.js
var Clock = createLucideIcon("Clock", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["polyline", { points: "12 6 12 12 16 14", key: "68esgv" }]
]);

// node_modules/lucide-react/dist/esm/icons/eye.js
var Eye = createLucideIcon("Eye", [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      key: "1nclc0"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
]);

// node_modules/lucide-react/dist/esm/icons/file-text.js
var FileText = createLucideIcon("FileText", [
  ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", key: "1rqfz7" }],
  ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }]
]);

// node_modules/lucide-react/dist/esm/icons/globe.js
var Globe = createLucideIcon("Globe", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", key: "13o1zl" }],
  ["path", { d: "M2 12h20", key: "9i4pu4" }]
]);

// node_modules/lucide-react/dist/esm/icons/history.js
var History = createLucideIcon("History", [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ["path", { d: "M12 7v5l4 2", key: "1fdv2h" }]
]);

// node_modules/lucide-react/dist/esm/icons/loader-circle.js
var LoaderCircle = createLucideIcon("LoaderCircle", [
  ["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]
]);

// node_modules/lucide-react/dist/esm/icons/message-square.js
var MessageSquare = createLucideIcon("MessageSquare", [
  ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", key: "1lielz" }]
]);

// node_modules/lucide-react/dist/esm/icons/pause.js
var Pause = createLucideIcon("Pause", [
  ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
  ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }]
]);

// node_modules/lucide-react/dist/esm/icons/pencil.js
var Pencil = createLucideIcon("Pencil", [
  [
    "path",
    {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      key: "1a8usu"
    }
  ],
  ["path", { d: "m15 5 4 4", key: "1mk7zo" }]
]);

// node_modules/lucide-react/dist/esm/icons/play.js
var Play = createLucideIcon("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]
]);

// node_modules/lucide-react/dist/esm/icons/plus.js
var Plus = createLucideIcon("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);

// node_modules/lucide-react/dist/esm/icons/refresh-cw.js
var RefreshCw = createLucideIcon("RefreshCw", [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
]);

// node_modules/lucide-react/dist/esm/icons/terminal.js
var Terminal = createLucideIcon("Terminal", [
  ["polyline", { points: "4 17 10 11 4 5", key: "akl6gq" }],
  ["line", { x1: "12", x2: "20", y1: "19", y2: "19", key: "q2wloq" }]
]);

// node_modules/lucide-react/dist/esm/icons/trash-2.js
var Trash2 = createLucideIcon("Trash2", [
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", key: "4alrt4" }],
  ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", key: "v07s0e" }],
  ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }],
  ["line", { x1: "14", x2: "14", y1: "11", y2: "17", key: "xtxkd" }]
]);

// node_modules/lucide-react/dist/esm/icons/x.js
var X = createLucideIcon("X", [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
]);

// src/store.ts
import { useSyncExternalStore } from "react";

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

// src/store.ts
var import_engine = __toESM(require_engine());
var import_builtin_templates = __toESM(require_builtin_templates());

// src/types.ts
function formatDateTimeForTemplate() {
  const now = /* @__PURE__ */ new Date();
  return now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function formatDateForTemplate() {
  const now = /* @__PURE__ */ new Date();
  return now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}
function formatTimeForTemplate() {
  const now = /* @__PURE__ */ new Date();
  return now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
function renderProtocolTemplate(template, params) {
  let result = template;
  result = result.replace(/{dateTime}/g, formatDateTimeForTemplate());
  result = result.replace(/{date}/g, formatDateForTemplate());
  result = result.replace(/{time}/g, formatTimeForTemplate());
  Object.entries(params).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    result = result.split(placeholder).join(value || "");
  });
  return result;
}
function generateProtocolDocument(template, params) {
  const now = /* @__PURE__ */ new Date();
  const dateTime = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const mission = renderProtocolTemplate(template.protocolConfig.missionTemplate, params);
  let doc = `# \u4EFB\u52A1\u534F\u8BAE

> \u4EFB\u52A1ID: {taskId}
> \u521B\u5EFA\u65F6\u95F4: ${dateTime}
> \u6A21\u677F\u7C7B\u578B: ${template.category}
> \u7248\u672C: 1.0.0

---

## \u4EFB\u52A1\u76EE\u6807

${mission}

---

## \u5DE5\u4F5C\u533A

\`\`\`
{workspacePath}
\`\`\`

---

## \u6267\u884C\u89C4\u5219

${template.protocolConfig.executionRules || "\u6309\u9700\u6267\u884C\u4EFB\u52A1"}
`;
  if (template.protocolConfig.customSections) {
    for (const section of template.protocolConfig.customSections) {
      const content = renderProtocolTemplate(section.template, params);
      doc += `
---

## ${section.title}

${content}
`;
    }
  }
  if (template.protocolConfig.memoryRules) {
    const rules = renderProtocolTemplate(template.protocolConfig.memoryRules, params);
    doc += `
---

${rules}
`;
  }
  doc += `
---

## \u8865\u5145

> \u7528\u4E8E\u4E34\u65F6\u8C03\u6574\u4EFB\u52A1\u65B9\u5411\u6216\u8865\u5145\u8981\u6C42
`;
  doc += `
---

## \u534F\u8BAE\u66F4\u65B0

\u53EF\u4FEE\u6539\u672C\u534F\u8BAE\uFF0C\u4FEE\u6539\u65F6\u8BB0\u5F55\uFF1A
- \u4FEE\u6539\u5185\u5BB9
- \u4FEE\u6539\u539F\u56E0
- \u9884\u671F\u6548\u679C
`;
  return doc;
}

// src/store.ts
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key }).catch(() => null);
  return (r && r.value) ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key }).catch(() => {
  });
}
async function kvKeys() {
  const r = await capDispatch("cap.kv", { action: "list" }).catch(() => null);
  return r && Array.isArray(r.keys) ? r.keys : [];
}
var K = {
  taskPrefix: "aisched.task.",
  statePrefix: "aisched.state.",
  histIdx: "aisched.hist.idx",
  histPrefix: "aisched.hist.",
  cmdRunPrefix: "aisched.cmd.run.",
  cmdProtoPrefix: "aisched.cmd.proto.",
  resultPrefix: "aisched.result.",
  meta: "aisched.meta",
  tmplPrefix: "aisched.tmpl.",
  ptmplPrefix: "aisched.ptmpl."
};
var HIST_CHUNK = 25;
var HIST_POLL_LIMIT = 200;
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeTask(raw) {
  const t2 = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(t2.id || genId("task")),
    name: String(t2.name || "").trim(),
    enabled: t2.enabled !== false,
    triggerType: ["once", "cron", "interval", "after_completion"].includes(t2.triggerType) ? t2.triggerType : "once",
    triggerValue: String(t2.triggerValue || "").trim(),
    engineId: String(t2.engineId || "").trim(),
    prompt: String(t2.prompt || ""),
    workDir: t2.workDir ?? null,
    description: t2.description ?? null,
    workspacePath: t2.workspacePath ?? null,
    workspaceName: t2.workspaceName ?? null,
    mode: t2.mode === "protocol" ? "protocol" : "simple",
    category: t2.category || "other",
    mission: t2.mission ?? null,
    taskPath: t2.taskPath ?? null,
    templateId: t2.templateId ?? null,
    templateParams: t2.templateParams ?? null,
    maxRuns: t2.maxRuns === void 0 || t2.maxRuns === null ? null : Number(t2.maxRuns),
    maxRetries: t2.maxRetries === void 0 || t2.maxRetries === null ? null : Number(t2.maxRetries),
    retryInterval: t2.retryInterval ?? null,
    timeoutMinutes: t2.timeoutMinutes === void 0 || t2.timeoutMinutes === null ? null : Number(t2.timeoutMinutes),
    group: t2.group ?? null,
    notifyOnComplete: t2.notifyOnComplete !== false,
    executorType: String(t2.executorType || ""),
    executorParams: t2.executorParams ?? null,
    createdAt: Number(t2.createdAt) || Math.floor(Date.now() / 1e3),
    updatedAt: Number(t2.updatedAt) || Math.floor(Date.now() / 1e3),
    unsupportedExecutor: !!t2.unsupportedExecutor
  };
}
function mergeView(task, state) {
  const s = state || {};
  return {
    ...task,
    lastRunAt: s.lastRunAt !== void 0 ? s.lastRunAt : null,
    lastRunStatus: s.lastRunStatus !== void 0 ? s.lastRunStatus : null,
    nextRunAt: s.nextRunAt !== void 0 ? s.nextRunAt : null,
    runCount: s.runCount || 0,
    retryCount: s.retryCount || 0,
    lastError: s.lastError || null,
    lastSessionId: s.lastSessionId || null
  };
}
function normalizeProtocolTemplate(raw, builtin) {
  if (!raw || typeof raw !== "object") return null;
  const t2 = raw;
  const cfg = t2.protocolConfig && typeof t2.protocolConfig === "object" ? t2.protocolConfig : {};
  const rawParams = Array.isArray(t2.params) ? t2.params : [];
  const params = rawParams.map((p) => {
    const o = p && typeof p === "object" ? p : {};
    return {
      key: String(o.key || ""),
      label: String(o.label || ""),
      type: o.type || o.paramType || "text",
      required: !!o.required,
      defaultValue: o.defaultValue === void 0 || o.defaultValue === null ? void 0 : String(o.defaultValue),
      placeholder: o.placeholder === void 0 || o.placeholder === null ? void 0 : String(o.placeholder),
      options: Array.isArray(o.options) ? o.options : void 0
    };
  });
  return {
    id: String(t2.id || ""),
    name: String(t2.name || ""),
    description: t2.description === void 0 || t2.description === null ? void 0 : String(t2.description),
    category: t2.category || "custom",
    builtin,
    protocolConfig: {
      missionTemplate: String(cfg.missionTemplate || ""),
      executionRules: cfg.executionRules === void 0 || cfg.executionRules === null ? void 0 : String(cfg.executionRules),
      memoryRules: cfg.memoryRules === void 0 || cfg.memoryRules === null ? void 0 : String(cfg.memoryRules),
      customSections: Array.isArray(cfg.customSections) ? cfg.customSections : void 0
    },
    promptTemplate: t2.promptTemplate === void 0 || t2.promptTemplate === null ? void 0 : String(t2.promptTemplate),
    params,
    defaultTriggerType: t2.defaultTriggerType,
    defaultTriggerValue: t2.defaultTriggerValue === void 0 || t2.defaultTriggerValue === null ? void 0 : String(t2.defaultTriggerValue),
    defaultEngineId: t2.defaultEngineId === void 0 || t2.defaultEngineId === null ? void 0 : String(t2.defaultEngineId),
    defaultMaxRuns: t2.defaultMaxRuns === void 0 || t2.defaultMaxRuns === null ? void 0 : Number(t2.defaultMaxRuns),
    defaultTimeoutMinutes: t2.defaultTimeoutMinutes === void 0 || t2.defaultTimeoutMinutes === null ? void 0 : Number(t2.defaultTimeoutMinutes),
    enabled: t2.enabled !== false,
    createdAt: Number(t2.createdAt) || 0,
    updatedAt: Number(t2.updatedAt) || 0
  };
}
function normalizePromptTemplate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const t2 = raw;
  if (!t2.id) return null;
  return {
    id: String(t2.id),
    name: String(t2.name || ""),
    description: t2.description === void 0 || t2.description === null ? void 0 : String(t2.description),
    content: String(t2.content || ""),
    enabled: t2.enabled !== false,
    createdAt: Number(t2.createdAt) || 0,
    updatedAt: Number(t2.updatedAt) || 0
  };
}
async function protoCommand(op, payload, waitMs = 15e3) {
  const nonce = `proto_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(K.cmdProtoPrefix + nonce, { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + waitMs;
  for (; ; ) {
    const r = await kvGet(K.resultPrefix + nonce);
    if (r && typeof r === "object" && ("ok" in r || "error" in r)) {
      kvDel(K.resultPrefix + nonce);
      return { ok: !!r.ok, data: r.data, error: r.error };
    }
    if (Date.now() > deadline) {
      return { ok: false, error: "\u670D\u52A1\u672A\u56DE\u6267\uFF08\u53EF\u80FD\u672A\u8FD0\u884C\uFF09\u2014\u2014\u8BF7\u68C0\u67E5\u8C03\u5EA6\u670D\u52A1\u72B6\u6001" };
    }
    await sleep(800);
  }
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
async function buildTemplateContent(taskId, params) {
  if (!params.templateId) return void 0;
  const all = await listProtocolTemplates();
  const tmpl = all.find((p) => p.id === params.templateId);
  if (!tmpl) return void 0;
  const doc = generateProtocolDocument(tmpl, params.templateParams || {});
  return doc.replace(/\{taskId\}/g, taskId).replace(/\{workspacePath\}/g, params.workDir || "");
}
async function createTask(params) {
  const now = Math.floor(Date.now() / 1e3);
  const id = genId("task");
  const task = normalizeTask({ ...params, id, createdAt: now, updatedAt: now });
  if (task.mode === "protocol" && task.workDir) {
    try {
      const templateContent = await buildTemplateContent(id, params);
      const r = await protoCommand("createStructure", {
        workDir: task.workDir,
        taskId: id,
        mission: task.mission || "",
        templateContent
      });
      if (r.ok && typeof r.data === "string") {
        task.taskPath = r.data;
      }
    } catch {
    }
  }
  await kvSet(K.taskPrefix + id, task);
  await kvSet(K.statePrefix + id, {
    lastRunAt: null,
    lastRunStatus: null,
    runCount: 0,
    retryCount: 0,
    nextRunAt: (0, import_engine.calculateNextRun)(task.triggerType, task.triggerValue, now)
  });
  await refresh();
  return task;
}
async function updateTask(task) {
  const now = Math.floor(Date.now() / 1e3);
  const merged = normalizeTask({ ...task, updatedAt: now });
  await kvSet(K.taskPrefix + merged.id, merged);
  const state = await kvGet(K.statePrefix + merged.id) || { lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0 };
  state.nextRunAt = (0, import_engine.recalcNextOnUpdate)(
    { ...merged, lastRunStatus: state.lastRunStatus ?? null },
    now,
    void 0
  );
  await kvSet(K.statePrefix + merged.id, state);
  await refresh();
}
async function deleteTask(id) {
  await kvDel(K.taskPrefix + id);
  await kvDel(K.statePrefix + id);
  await refresh();
}
async function toggleTask(id, enabled) {
  const raw = await kvGet(K.taskPrefix + id);
  if (!raw) throw new Error(`\u4EFB\u52A1\u4E0D\u5B58\u5728: ${id}`);
  const task = normalizeTask({ ...raw, enabled });
  await kvSet(K.taskPrefix + id, task);
  const state = await kvGet(K.statePrefix + id) || { lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0 };
  state.nextRunAt = (0, import_engine.recalcNextOnUpdate)(
    { ...task, lastRunStatus: state.lastRunStatus ?? null },
    Math.floor(Date.now() / 1e3),
    void 0
  );
  await kvSet(K.statePrefix + id, state);
  await refresh();
}
async function loadTasks() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.taskPrefix)).map((k) => k.slice(K.taskPrefix.length));
  const out = [];
  for (const id of ids) {
    const raw = await kvGet(K.taskPrefix + id);
    if (!raw) continue;
    const state = await kvGet(K.statePrefix + id);
    out.push(mergeView(normalizeTask(raw), state));
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}
async function runTask(id) {
  const nonce = `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(K.cmdRunPrefix + nonce, { taskId: id, nonce, at: Date.now() });
  const deadline = Date.now() + 3e3;
  for (; ; ) {
    const r = await kvGet(K.resultPrefix + nonce);
    if (r && typeof r === "object" && ("ok" in r || "error" in r)) {
      kvDel(K.resultPrefix + nonce);
      return { ok: !!r.ok, error: r.error };
    }
    if (Date.now() > deadline) {
      return { ok: false, timedOut: true, error: "\u670D\u52A1\u672A\u5728 3s \u5185\u56DE\u6267" };
    }
    await sleep(600);
  }
}
async function loadHist(limit = HIST_POLL_LIMIT) {
  const idx = await kvGet(K.histIdx);
  const count = idx && typeof idx.count === "number" ? idx.count : 0;
  if (count === 0) return [];
  const max = Math.min(limit, count);
  const out = [];
  let n = Math.floor((count - 1) / HIST_CHUNK);
  while (out.length < max && n >= 0) {
    const chunk = await kvGet(K.histPrefix + n);
    if (Array.isArray(chunk)) {
      for (const e of chunk) {
        if (out.length < max && e && typeof e === "object") out.push(e);
      }
    }
    n -= 1;
  }
  return out;
}
async function loadMeta() {
  return kvGet(K.meta);
}
function metaAlive(meta) {
  if (!meta || !meta.beatAt) return "down";
  return Date.now() / 1e3 - meta.beatAt < 60 ? "ok" : "stale";
}
async function loadTemplates() {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.tmplPrefix)).map((k) => k.slice(K.tmplPrefix.length));
  const out = [];
  for (const id of ids) {
    const t2 = normalizePromptTemplate(await kvGet(K.tmplPrefix + id));
    if (t2) out.push(t2);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}
async function createTemplate(params) {
  const now = Math.floor(Date.now() / 1e3);
  const tmpl = {
    id: genId("tmpl"),
    name: params.name,
    description: params.description,
    content: params.content,
    enabled: params.enabled !== false,
    createdAt: now,
    updatedAt: now
  };
  await kvSet(K.tmplPrefix + tmpl.id, tmpl);
  await refresh();
  return tmpl;
}
async function updateTemplate(template) {
  const next = { ...template, updatedAt: Math.floor(Date.now() / 1e3) };
  await kvSet(K.tmplPrefix + next.id, next);
  await refresh();
  return next;
}
async function deleteTemplate(id) {
  await kvDel(K.tmplPrefix + id);
  await refresh();
}
async function listProtocolTemplates() {
  const builtin = (0, import_builtin_templates.builtinTemplates)().map((t2) => normalizeProtocolTemplate(t2, true)).filter((t2) => !!t2);
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.ptmplPrefix)).map((k) => k.slice(K.ptmplPrefix.length));
  const custom = [];
  for (const id of ids) {
    const t2 = normalizeProtocolTemplate(await kvGet(K.ptmplPrefix + id), false);
    if (t2) custom.push(t2);
  }
  custom.sort((a, b) => b.createdAt - a.createdAt);
  return [...builtin, ...custom];
}
function templateToStore(t2) {
  return {
    ...t2,
    params: t2.params.map((p) => ({ ...p, paramType: p.type }))
  };
}
async function createProtocolTemplate(params) {
  const now = Math.floor(Date.now() / 1e3);
  const tmpl = normalizeProtocolTemplate(templateToStore({
    id: genId("ptmpl"),
    name: params.name,
    description: params.description,
    category: params.category,
    builtin: false,
    protocolConfig: params.protocolConfig,
    promptTemplate: params.promptTemplate,
    params: params.params || [],
    defaultTriggerType: params.defaultTriggerType,
    defaultTriggerValue: params.defaultTriggerValue,
    defaultEngineId: params.defaultEngineId,
    defaultMaxRuns: params.defaultMaxRuns,
    defaultTimeoutMinutes: params.defaultTimeoutMinutes,
    enabled: params.enabled !== false,
    createdAt: now,
    updatedAt: now
  }), false);
  if (!tmpl) throw new Error("\u534F\u8BAE\u6A21\u677F\u5F52\u4E00\u5316\u5931\u8D25");
  await kvSet(K.ptmplPrefix + tmpl.id, templateToStore(tmpl));
  await refresh();
  return tmpl;
}
async function deleteProtocolTemplate(id) {
  const keys = await kvKeys();
  if (!keys.includes(K.ptmplPrefix + id)) return false;
  await kvDel(K.ptmplPrefix + id);
  await refresh();
  return true;
}
var POLL_MS = 5e3;
var cache = {
  tasks: [],
  hist: [],
  meta: null,
  templates: [],
  protocolTemplates: [],
  loading: true,
  error: null
};
var subs = /* @__PURE__ */ new Set();
var timer = null;
var pollBusy = false;
function setCache(patch) {
  cache = { ...cache, ...patch };
  for (const fn of subs) fn();
}
async function refresh() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const [tasks, hist, meta, templates, protocolTemplates] = await Promise.all([
      loadTasks(),
      loadHist(),
      loadMeta(),
      loadTemplates(),
      listProtocolTemplates()
    ]);
    setCache({ tasks, hist, meta, templates, protocolTemplates, loading: false, error: null });
  } catch (e) {
    setCache({ loading: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    pollBusy = false;
  }
}
function ensurePolling() {
  if (timer !== null) return;
  void refresh();
  timer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void refresh();
  }, POLL_MS);
}
function stopPolling() {
  if (timer !== null && subs.size === 0) {
    window.clearInterval(timer);
    timer = null;
  }
}
function subscribe(fn) {
  subs.add(fn);
  ensurePolling();
  return () => {
    subs.delete(fn);
    stopPolling();
  };
}
function useAiSchedulerData() {
  return useSyncExternalStore(subscribe, () => cache, () => cache);
}

// src/i18n.ts
var dict = {
  title: "\u5B9A\u65F6\u4EFB\u52A1",
  loading: "\u52A0\u8F7D\u4E2D...",
  empty: "\u6682\u65E0\u5B9A\u65F6\u4EFB\u52A1\uFF0C\u70B9\u51FB\u53F3\u4E0A\u89D2\u6309\u94AE\u521B\u5EFA",
  noMatch: "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1",
  taskCount: "{{count}} \u4E2A\u4EFB\u52A1",
  newTask: "\u65B0\u5EFA\u4EFB\u52A1",
  more: "\u66F4\u591A",
  status: {
    idle: "\u7B49\u5F85\u4E2D",
    running: "\u6267\u884C\u4E2D",
    success: "\u6210\u529F",
    failed: "\u5931\u8D25",
    notExecuted: "\u672A\u6267\u884C"
  },
  triggerTypes: {
    once: "\u5355\u6B21\u6267\u884C",
    cron: "Cron \u8868\u8FBE\u5F0F",
    interval: "\u95F4\u9694\u6267\u884C",
    after_completion: "\u5B8C\u6210\u540E\u95F4\u9694"
  },
  taskMode: {
    simple: "\u7B80\u5355\u6A21\u5F0F",
    protocol: "\u534F\u8BAE\u6A21\u5F0F"
  },
  taskCategory: {
    development: "\u5F00\u53D1\u4EFB\u52A1",
    review: "\u5BA1\u67E5\u4EFB\u52A1",
    news: "\u65B0\u95FB\u641C\u7D22",
    monitor: "\u76D1\u63A7\u4EFB\u52A1",
    custom: "\u81EA\u5B9A\u4E49",
    other: "\u5176\u4ED6"
  },
  control: {
    running: "\u8C03\u5EA6\u5668\u8FD0\u884C\u4E2D",
    stopped: "\u8C03\u5EA6\u5668\u5DF2\u505C\u6B62",
    starting: "\u542F\u52A8\u4E2D",
    lockedByOther: "\u5176\u4ED6\u5B9E\u4F8B\u6B63\u5728\u8FD0\u884C",
    scheduler: "\u8C03\u5EA6\u5668",
    start: "\u542F\u52A8",
    stop: "\u505C\u6B62",
    tryAcquire: "\u5C1D\u8BD5\u83B7\u53D6\u63A7\u5236\u6743",
    refresh: "\u5237\u65B0\u72B6\u6001",
    startSuccess: "\u8C03\u5EA6\u5668\u5DF2\u542F\u52A8",
    startFailed: "\u542F\u52A8\u5931\u8D25\uFF0C\u5176\u4ED6\u5B9E\u4F8B\u5360\u7528",
    stopSuccess: "\u8C03\u5EA6\u5668\u5DF2\u505C\u6B62",
    acquireSuccess: "\u5DF2\u83B7\u53D6\u63A7\u5236\u6743",
    acquireFailed: "\u65E0\u6CD5\u83B7\u53D6\u63A7\u5236\u6743",
    conflictWarning: "\u5176\u4ED6\u5B9E\u4F8B\u6B63\u5728\u8FD0\u884C\u8C03\u5EA6\u5668\uFF0C\u4EFB\u52A1\u5C06\u4E0D\u4F1A\u81EA\u52A8\u6267\u884C"
  },
  // 新增：调度服务只读状态（生命周期归宿主 Supervisor，面板无启停）
  service: {
    running: "\u8C03\u5EA6\u670D\u52A1\u8FD0\u884C\u4E2D",
    degraded: "\u670D\u52A1\u964D\u7EA7\uFF08\u5199\u5FC3\u8DF3\u5931\u8D25\uFF09",
    stale: "\u670D\u52A1\u5FC3\u8DF3\u8D85\u65F6",
    down: "\u670D\u52A1\u672A\u8FD0\u884C",
    wsUp: "WS \u5DF2\u8FDE\u63A5",
    wsDown: "WS \u65AD\u5F00",
    queue: "\u961F\u5217",
    version: "\u7248\u672C"
  },
  card: {
    trigger: "\u89E6\u53D1",
    engine: "\u5F15\u64CE",
    nextRun: "\u4E0B\u6B21",
    run: "\u7ACB\u5373\u6267\u884C",
    running: "\u6267\u884C\u4E2D",
    runHint: "\u6267\u884C\u4EFB\u52A1",
    subscribe: "\u67E5\u770B\u65E5\u5FD7",
    subscribed: "\u5DF2\u8BA2\u9605",
    subscribeHint: "\u67E5\u770B\u6B63\u5728\u6267\u884C\u7684\u4EFB\u52A1\u65E5\u5FD7",
    subscribeDisabled: "\u4EFB\u52A1\u672A\u5728\u6267\u884C",
    edit: "\u7F16\u8F91",
    copy: "\u590D\u5236",
    delete: "\u5220\u9664",
    enable: "\u542F\u7528",
    disable: "\u7981\u7528",
    disabled: "\u5DF2\u7981\u7528",
    mode: "\u6A21\u5F0F",
    category: "\u5206\u7C7B",
    viewProtocol: "\u534F\u8BAE\u6587\u6863",
    viewProtocolHint: "\u67E5\u770B\u534F\u8BAE\u6587\u6863",
    afterCompletion: "\u5B8C\u6210\u540E {{value}}",
    afterCompletionPending: "\u8FD0\u884C\u4E2D \xB7 \u5B8C\u6210\u540E {{value}}",
    afterCompletionHint: "\u8BE5\u4EFB\u52A1\u5728\u4E0A\u4E00\u8F6E\u6267\u884C\u7ED3\u675F\u540E\u518D\u8BA1\u65F6\uFF0C\u8FD0\u884C\u671F\u95F4\u4E0D\u663E\u793A\u5177\u4F53\u65F6\u95F4\u70B9"
  },
  filter: {
    search: "\u641C\u7D22\u4EFB\u52A1...",
    allStatus: "\u5168\u90E8\u72B6\u6001",
    enabled: "\u5DF2\u542F\u7528",
    disabled: "\u5DF2\u7981\u7528",
    allTriggers: "\u5168\u90E8\u89E6\u53D1",
    allEngines: "\u5168\u90E8\u5F15\u64CE",
    clear: "\u6E05\u9664\u7B5B\u9009"
  },
  sort: {
    createdAt: "\u521B\u5EFA\u65F6\u95F4",
    updatedAt: "\u66F4\u65B0\u65F6\u95F4",
    name: "\u4EFB\u52A1\u540D\u79F0",
    lastRunAt: "\u4E0A\u6B21\u6267\u884C",
    nextRunAt: "\u4E0B\u6B21\u6267\u884C",
    ascending: "\u5347\u5E8F",
    descending: "\u964D\u5E8F"
  },
  trigger: {
    cronHelp: '\u793A\u4F8B: "0 9 * * 1-5" \u8868\u793A\u5DE5\u4F5C\u65E5\u65E99\u70B9\uFF0C\u683C\u5F0F\u4E3A\uFF1A\u5206 \u65F6 \u65E5 \u6708 \u5468'
  },
  editor: {
    newTask: "\u65B0\u5EFA\u4EFB\u52A1",
    editTask: "\u7F16\u8F91\u4EFB\u52A1",
    copyTask: "\u590D\u5236\u4EFB\u52A1",
    copySuffix: "\u526F\u672C",
    name: "\u4EFB\u52A1\u540D\u79F0",
    namePlaceholder: "\u4F8B\u5982\uFF1A\u6BCF\u65E5\u65E5\u62A5\u751F\u6210",
    nameRequired: "\u8BF7\u586B\u5199\u4EFB\u52A1\u540D\u79F0",
    description: "\u63CF\u8FF0",
    descriptionPlaceholder: "\u4EFB\u52A1\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
    mode: "\u4EFB\u52A1\u6A21\u5F0F",
    category: "\u4EFB\u52A1\u5206\u7C7B",
    protocolConfig: "\u534F\u8BAE\u6A21\u5F0F\u914D\u7F6E",
    mission: "\u4EFB\u52A1\u76EE\u6807",
    missionPlaceholder: "\u63CF\u8FF0\u4EFB\u52A1\u7684\u4E3B\u8981\u76EE\u6807\uFF0CAI \u5C06\u6839\u636E\u6B64\u76EE\u6807\u6301\u7EED\u6267\u884C...",
    missionRequired: "\u534F\u8BAE\u6A21\u5F0F\u9700\u8981\u586B\u5199\u4EFB\u52A1\u76EE\u6807",
    group: "\u5206\u7EC4",
    groupPlaceholder: "\u7528\u4E8E\u5206\u7EC4\u7BA1\u7406\uFF0C\u53EF\u9009",
    maxRuns: "\u6700\u5927\u6267\u884C\u6B21\u6570",
    maxRunsPlaceholder: "\u5982\uFF1A10",
    maxRetries: "\u6700\u5927\u91CD\u8BD5\u6B21\u6570",
    maxRetriesPlaceholder: "\u5982\uFF1A3",
    retryInterval: "\u91CD\u8BD5\u95F4\u9694",
    retryIntervalPlaceholder: "\u5982\uFF1A5m\uFF085\u5206\u949F\uFF09",
    timeoutMinutes: "\u8D85\u65F6\u65F6\u95F4\uFF08\u5206\u949F\uFF09",
    timeoutMinutesPlaceholder: "\u5982\uFF1A30",
    trigger: "\u89E6\u53D1\u914D\u7F6E",
    engine: "AI \u5F15\u64CE",
    workDir: "\u5DE5\u4F5C\u76EE\u5F55",
    workDirPlaceholder: "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55",
    prompt: "\u63D0\u793A\u8BCD",
    promptPlaceholder: "\u8F93\u5165 AI \u8981\u6267\u884C\u7684\u63D0\u793A\u8BCD...",
    promptPlaceholderProtocol: "\u53EF\u9009\uFF1A\u989D\u5916\u7684\u63D0\u793A\u8BCD\u8865\u5145\uFF08\u534F\u8BAE\u6A21\u5F0F\u4E3B\u8981\u4F7F\u7528\u4EFB\u52A1\u76EE\u6807\uFF09",
    promptHintProtocol: "\u534F\u8BAE\u6A21\u5F0F\u4E0B\uFF0C\u63D0\u793A\u8BCD\u4E3A\u53EF\u9009\u8865\u5145\uFF0CAI \u4E3B\u8981\u6839\u636E\u4EFB\u52A1\u76EE\u6807\u6267\u884C",
    promptRequired: "\u8BF7\u586B\u5199\u63D0\u793A\u8BCD",
    promptTemplate: "\u63D0\u793A\u8BCD\u6A21\u677F",
    noTemplate: "\u4E0D\u4F7F\u7528\u6A21\u677F",
    templatePreview: "\u6A21\u677F\u9884\u89C8",
    templateVariables: "\u53EF\u7528\u53D8\u91CF",
    promptPreviewPlaceholder: "\u7528\u6237\u63D0\u793A\u8BCD",
    taskNamePlaceholder: "\u4EFB\u52A1\u540D\u79F0",
    cancel: "\u53D6\u6D88",
    save: "\u4FDD\u5B58",
    selectProvider: "\u9009\u62E9 Provider",
    model: "\u6A21\u578B",
    noProvider: "\u672A\u914D\u7F6E",
    noProviderConfigured: "\u672A\u914D\u7F6E OpenAI Provider",
    providerInvalid: "\u5F53\u524D\u4EFB\u52A1\u7684 Provider \u5DF2\u5931\u6548\u6216\u88AB\u7981\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u64CE",
    goConfig: "\u53BB\u914D\u7F6E",
    protocolTemplate: "\u534F\u8BAE\u6A21\u677F",
    templateParams: "\u6A21\u677F\u53C2\u6570",
    executorType: "\u6267\u884C\u5668",
    executorTypeHint: "\u4EFB\u52A1\u5982\u4F55\u6267\u884C\uFF08\u9ED8\u8BA4\uFF1AAI \u5BF9\u8BDD\uFF09",
    executorTypes: {
      chat: "AI \u4F1A\u8BDD",
      command: "CLI \u547D\u4EE4",
      http: "HTTP \u8BF7\u6C42"
    },
    executorUnsupported: "\u4E0D\u652F\u6301\uFF08\u968F\u4E3B\u4ED3\u51FA\u4ED3\uFF09",
    executorChatPrompt: "\u63D0\u793A\u8BCD",
    executorChatEngine: "AI \u5F15\u64CE",
    executorCommandLine: "\u547D\u4EE4",
    executorCommandLinePlaceholder: "\u5982\uFF1Anpm run lint",
    executorCommandArgs: "\u53C2\u6570",
    executorCommandArgsPlaceholder: "\u7A7A\u683C\u5206\u9694\u7684\u53C2\u6570\uFF08\u53EF\u9009\uFF09",
    executorCwd: "\u5DE5\u4F5C\u76EE\u5F55",
    executorHttpUrl: "URL",
    executorHttpUrlPlaceholder: "\u5982\uFF1Ahttps://api.example.com/webhook",
    executorHttpMethod: "\u65B9\u6CD5",
    executorHttpBody: "\u8BF7\u6C42\u4F53",
    executorHttpBodyPlaceholder: "JSON \u8BF7\u6C42\u4F53\uFF08\u53EF\u9009\uFF09"
  },
  template: {
    title: "\u6A21\u677F\u7BA1\u7406",
    newTemplate: "\u65B0\u5EFA\u6A21\u677F",
    editTemplate: "\u7F16\u8F91\u6A21\u677F",
    deleteConfirm: "\u786E\u5B9A\u8981\u5220\u9664\u6B64\u6A21\u677F\u5417\uFF1F",
    createSuccess: "\u6A21\u677F\u521B\u5EFA\u6210\u529F",
    updateSuccess: "\u6A21\u677F\u66F4\u65B0\u6210\u529F",
    deleteSuccess: "\u6A21\u677F\u5220\u9664\u6210\u529F",
    name: "\u6A21\u677F\u540D\u79F0",
    namePlaceholder: "\u4F8B\u5982\uFF1A\u6BCF\u65E5\u62A5\u544A\u6A21\u677F",
    nameRequired: "\u8BF7\u586B\u5199\u6A21\u677F\u540D\u79F0",
    description: "\u63CF\u8FF0",
    descriptionPlaceholder: "\u6A21\u677F\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
    content: "\u6A21\u677F\u5185\u5BB9",
    contentPlaceholder: "\u8F93\u5165\u6A21\u677F\u5185\u5BB9\uFF0C\u4F7F\u7528 {{prompt}} \u4EE3\u8868\u7528\u6237\u63D0\u793A\u8BCD...",
    contentRequired: "\u8BF7\u586B\u5199\u6A21\u677F\u5185\u5BB9",
    variables: "\u53EF\u7528\u53D8\u91CF",
    promptVar: "\u7528\u6237\u63D0\u793A\u8BCD",
    taskNameVar: "\u4EFB\u52A1\u540D\u79F0",
    dateVar: "\u5F53\u524D\u65E5\u671F",
    timeVar: "\u5F53\u524D\u65F6\u95F4",
    datetimeVar: "\u65E5\u671F\u65F6\u95F4",
    weekdayVar: "\u661F\u671F\u51E0",
    insertVar: "\u63D2\u5165\u53D8\u91CF",
    preview: "\u9884\u89C8",
    enabled: "\u542F\u7528",
    disabled: "\u7981\u7528",
    noTemplates: "\u6682\u65E0\u6A21\u677F",
    createFirst: "\u70B9\u51FB\u4E0A\u65B9\u6309\u94AE\u521B\u5EFA\u7B2C\u4E00\u4E2A\u6A21\u677F"
  },
  confirm: {
    deleteTitle: "\u786E\u8BA4\u5220\u9664",
    deleteMessage: "\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u4EFB\u52A1\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002"
  },
  toast: {
    createSuccess: "\u521B\u5EFA\u6210\u529F",
    createFailed: "\u521B\u5EFA\u5931\u8D25",
    updateSuccess: "\u66F4\u65B0\u6210\u529F",
    updateFailed: "\u66F4\u65B0\u5931\u8D25",
    deleteSuccess: "\u5220\u9664\u6210\u529F",
    deleteFailed: "\u5220\u9664\u5931\u8D25",
    copySuccess: "\u590D\u5236\u6210\u529F",
    copyFailed: "\u590D\u5236\u5931\u8D25",
    runTriggered: "\u5DF2\u89E6\u53D1\u6267\u884C",
    runQueued: "\u6267\u884C\u547D\u4EE4\u5DF2\u5165\u961F\uFF0C\u7B49\u5F85\u8C03\u5EA6\u670D\u52A1\u6D88\u8D39\uFF08\u7ED3\u679C\u7A0D\u540E\u5728\u6267\u884C\u5386\u53F2\u67E5\u770B\uFF09",
    runFailed: "\u6267\u884C\u5931\u8D25",
    notRunning: "\u4EFB\u52A1\u672A\u5728\u6267\u884C",
    subscribeSuccess: "\u5DF2\u8BA2\u9605\u65E5\u5FD7",
    subscribeFailed: "\u8BA2\u9605\u5931\u8D25",
    pleaseWait: "\u8BF7\u7B49\u5F85",
    taskDue: "\u4EFB\u52A1\u5230\u671F",
    executing: "\u6B63\u5728\u6267\u884C: {{name}}",
    executeFailed: "\u6267\u884C\u5931\u8D25"
  },
  time: {
    expired: "\u5DF2\u8FC7\u671F",
    secondsLater: "{{count}} \u79D2\u540E",
    minutesLater: "{{count}} \u5206\u949F\u540E",
    hoursLater: "{{count}} \u5C0F\u65F6\u540E",
    daysLater: "{{count}} \u5929\u540E"
  },
  drawer: {
    title: "\u6267\u884C\u65E5\u5FD7",
    historyTitle: "\u6267\u884C\u5386\u53F2",
    runningCount: "{{count}} \u4E2A\u6267\u884C\u4E2D",
    collapse: "\u6536\u8D77",
    expand: "\u5C55\u5F00",
    duration: "\u7528\u65F6",
    autoScroll: "\u81EA\u52A8\u6EDA\u52A8",
    manualScroll: "\u624B\u52A8\u6EDA\u52A8",
    clear: "\u6E05\u7A7A",
    waitingOutput: "\u7B49\u5F85\u4EFB\u52A1\u8F93\u51FA...",
    noTaskSelected: "\u8BF7\u9009\u62E9\u4EFB\u52A1\u67E5\u770B\u65E5\u5FD7",
    empty: "\u6682\u65E0\u6267\u884C\u5386\u53F2"
  },
  protocolTemplate: {
    title: "\u534F\u8BAE\u6A21\u677F",
    loading: "\u52A0\u8F7D\u4E2D...",
    noTemplate: "\u4E0D\u4F7F\u7528\u6A21\u677F",
    builtin: "\u5185\u7F6E",
    custom: "\u81EA\u5B9A\u4E49",
    params: "\u53C2\u6570",
    noParams: "\u6B64\u6A21\u677F\u65E0\u9700\u914D\u7F6E\u53C2\u6570",
    selectPlaceholder: "\u8BF7\u9009\u62E9",
    createSuccess: "\u534F\u8BAE\u6A21\u677F\u521B\u5EFA\u6210\u529F",
    updateSuccess: "\u534F\u8BAE\u6A21\u677F\u66F4\u65B0\u6210\u529F",
    deleteSuccess: "\u534F\u8BAE\u6A21\u677F\u5220\u9664\u6210\u529F",
    deleteConfirm: "\u786E\u5B9A\u8981\u5220\u9664\u6B64\u534F\u8BAE\u6A21\u677F\u5417\uFF1F",
    name: "\u6A21\u677F\u540D\u79F0",
    namePlaceholder: "\u4F8B\u5982\uFF1A\u529F\u80FD\u5F00\u53D1\u6A21\u677F",
    nameRequired: "\u8BF7\u586B\u5199\u6A21\u677F\u540D\u79F0",
    description: "\u63CF\u8FF0",
    descriptionPlaceholder: "\u6A21\u677F\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
    category: "\u5206\u7C7B",
    missionTemplate: "\u4EFB\u52A1\u76EE\u6807\u6A21\u677F",
    missionTemplatePlaceholder: "\u8F93\u5165\u4EFB\u52A1\u76EE\u6807\u6A21\u677F\uFF0C\u4F7F\u7528 {paramName} \u4F5C\u4E3A\u53C2\u6570\u5360\u4F4D\u7B26...",
    executionRules: "\u6267\u884C\u89C4\u5219",
    executionRulesPlaceholder: "\u6267\u884C\u89C4\u5219\u6A21\u677F\uFF08\u53EF\u9009\uFF09",
    memoryRules: "\u8BB0\u5FC6\u89C4\u5219",
    memoryRulesPlaceholder: "\u8BB0\u5FC6\u89C4\u5219\u6A21\u677F\uFF08\u53EF\u9009\uFF09",
    promptTemplate: "\u63D0\u793A\u8BCD\u6A21\u677F",
    promptTemplatePlaceholder: "\u63D0\u793A\u8BCD\u6A21\u677F\uFF08\u53EF\u9009\uFF09",
    defaultTriggerType: "\u9ED8\u8BA4\u89E6\u53D1\u7C7B\u578B",
    defaultTriggerValue: "\u9ED8\u8BA4\u89E6\u53D1\u503C",
    defaultEngineId: "\u9ED8\u8BA4\u5F15\u64CE",
    defaultMaxRuns: "\u9ED8\u8BA4\u6700\u5927\u6267\u884C\u6B21\u6570",
    defaultTimeoutMinutes: "\u9ED8\u8BA4\u8D85\u65F6\u65F6\u95F4\uFF08\u5206\u949F\uFF09",
    enabled: "\u542F\u7528",
    disabled: "\u7981\u7528",
    noTemplates: "\u6682\u65E0\u534F\u8BAE\u6A21\u677F",
    createFirst: "\u70B9\u51FB\u4E0A\u65B9\u6309\u94AE\u521B\u5EFA\u7B2C\u4E00\u4E2A\u534F\u8BAE\u6A21\u677F",
    paramKey: "\u53C2\u6570\u952E",
    paramKeyPlaceholder: "\u4F8B\u5982\uFF1AfeatureName",
    paramLabel: "\u663E\u793A\u540D\u79F0",
    paramLabelPlaceholder: "\u4F8B\u5982\uFF1A\u529F\u80FD\u540D\u79F0",
    paramType: "\u53C2\u6570\u7C7B\u578B",
    paramRequired: "\u662F\u5426\u5FC5\u586B",
    paramDefaultValue: "\u9ED8\u8BA4\u503C",
    paramPlaceholder: "\u5360\u4F4D\u63D0\u793A",
    paramOptions: "\u9009\u9879\uFF08select \u7C7B\u578B\uFF09",
    addParam: "\u6DFB\u52A0\u53C2\u6570",
    removeParam: "\u5220\u9664\u53C2\u6570",
    textType: "\u6587\u672C",
    textareaType: "\u591A\u884C\u6587\u672C",
    selectType: "\u4E0B\u62C9\u9009\u62E9",
    numberType: "\u6570\u5B57",
    dateType: "\u65E5\u671F",
    missionTemplateRequired: "\u8BF7\u586B\u5199\u4EFB\u52A1\u76EE\u6807\u6A21\u677F",
    paramKeyRequired: "\u53C2\u6570\u952E\u4E0D\u80FD\u4E3A\u7A7A",
    paramLabelRequired: "\u53C2\u6570\u663E\u793A\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A",
    cannotEditBuiltin: "\u5185\u7F6E\u6A21\u677F\u4E0D\u53EF\u7F16\u8F91",
    cannotDeleteBuiltin: "\u5185\u7F6E\u6A21\u677F\u4E0D\u53EF\u5220\u9664",
    builtinReadOnly: "\u5185\u7F6E\u6A21\u677F\u53EA\u8BFB",
    previewToggle: "\u9884\u89C8\u751F\u6210\u7684\u534F\u8BAE\u6587\u6863",
    previewParams: "\u9884\u89C8\u53C2\u6570\u503C",
    previewDocument: "\u534F\u8BAE\u6587\u6863\u9884\u89C8"
  },
  protocolDoc: {
    title: "\u534F\u8BAE\u6587\u6863",
    loading: "\u52A0\u8F7D\u4E2D...",
    protocol: "\u534F\u8BAE\u6587\u6863",
    supplement: "\u7528\u6237\u8865\u5145",
    memory: "\u8BB0\u5FC6\u7D22\u5F15",
    tasks: "\u4EFB\u52A1\u961F\u5217",
    noTaskPath: "\u6B64\u4EFB\u52A1\u4E0D\u662F\u534F\u8BAE\u6A21\u5F0F\u6216\u6CA1\u6709\u5173\u8054\u7684\u6587\u6863\u8DEF\u5F84",
    empty: "\u6682\u65E0\u5185\u5BB9",
    loadFailed: "\u52A0\u8F7D\u534F\u8BAE\u6587\u6863\u5931\u8D25",
    edit: "\u7F16\u8F91",
    editPlaceholder: "\u7F16\u8F91\u6587\u6863\u5185\u5BB9...",
    saveSuccess: "\u4FDD\u5B58\u6210\u529F",
    saveFailed: "\u4FDD\u5B58\u5931\u8D25",
    saving: "\u4FDD\u5B58\u4E2D...",
    clearSupplement: "\u6E05\u7A7A\u8865\u5145",
    clearSuccess: "\u5DF2\u6E05\u7A7A\u7528\u6237\u8865\u5145",
    clearFailed: "\u6E05\u7A7A\u5931\u8D25",
    backup: "\u5907\u4EFD",
    backupSuccess: "\u5907\u4EFD\u6210\u529F",
    backupFailed: "\u5907\u4EFD\u5931\u8D25",
    supplementPlaceholder: "\u8F93\u5165\u7528\u6237\u8865\u5145\u5185\u5BB9\uFF0C\u4FDD\u5B58\u540E\u751F\u6548..."
  },
  errors: {
    taskNotFound: "\u4EFB\u52A1\u4E0D\u5B58\u5728",
    taskNameEmpty: "\u4EFB\u52A1\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A",
    triggerValueEmpty: "\u89E6\u53D1\u8868\u8FBE\u5F0F\u4E0D\u80FD\u4E3A\u7A7A",
    intervalEmpty: "\u95F4\u9694\u65F6\u95F4\u4E0D\u80FD\u4E3A\u7A7A",
    intervalFormatInvalid: "\u95F4\u9694\u65F6\u95F4\u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u4F7F\u7528\u5982 '1h', '30m', '1d' \u7684\u683C\u5F0F",
    intervalNumberInvalid: "\u95F4\u9694\u65F6\u95F4\u6570\u5B57\u90E8\u5206\u65E0\u6548",
    intervalZero: "\u95F4\u9694\u65F6\u95F4\u4E0D\u80FD\u4E3A\u96F6",
    intervalUnitInvalid: "\u95F4\u9694\u65F6\u95F4\u5355\u4F4D\u65E0\u6548\uFF0C\u8BF7\u4F7F\u7528 s(\u79D2), m(\u5206), h(\u65F6), d(\u5929), w(\u5468)",
    cronEmpty: "Cron \u8868\u8FBE\u5F0F\u4E0D\u80FD\u4E3A\u7A7A",
    cronFormatInvalid: "Cron \u8868\u8FBE\u5F0F\u683C\u5F0F\u65E0\u6548\uFF0C\u5E94\u4E3A 5 \u6216 6 \u4E2A\u5B57\u6BB5",
    triggerTimeEmpty: "\u89E6\u53D1\u65F6\u95F4\u4E0D\u80FD\u4E3A\u7A7A",
    templateNotFound: "\u6A21\u677F\u4E0D\u5B58\u5728",
    templateNameEmpty: "\u6A21\u677F\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A",
    templateContentEmpty: "\u6A21\u677F\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A",
    templateDisabled: "\u6A21\u677F\u5DF2\u7981\u7528",
    builtinTemplateCannotModify: "\u5185\u7F6E\u6A21\u677F\u4E0D\u80FD\u4FEE\u6539",
    builtinTemplateCannotDelete: "\u5185\u7F6E\u6A21\u677F\u4E0D\u80FD\u5220\u9664",
    builtinTemplateCannotDisable: "\u5185\u7F6E\u6A21\u677F\u4E0D\u80FD\u7981\u7528",
    missionTemplateEmpty: "\u4EFB\u52A1\u76EE\u6807\u6A21\u677F\u4E0D\u80FD\u4E3A\u7A7A",
    protocolError: "\u534F\u8BAE\u9519\u8BEF",
    loadTasksFailed: "\u52A0\u8F7D\u4EFB\u52A1\u5217\u8868\u5931\u8D25",
    createTaskFailed: "\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25",
    updateTaskFailed: "\u66F4\u65B0\u4EFB\u52A1\u5931\u8D25",
    deleteTaskFailed: "\u5220\u9664\u4EFB\u52A1\u5931\u8D25",
    toggleTaskFailed: "\u5207\u6362\u4EFB\u52A1\u72B6\u6001\u5931\u8D25",
    loadTemplatesFailed: "\u52A0\u8F7D\u6A21\u677F\u5217\u8868\u5931\u8D25",
    createTemplateFailed: "\u521B\u5EFA\u6A21\u677F\u5931\u8D25",
    updateTemplateFailed: "\u66F4\u65B0\u6A21\u677F\u5931\u8D25",
    deleteTemplateFailed: "\u5220\u9664\u6A21\u677F\u5931\u8D25",
    loadProtocolTemplatesFailed: "\u52A0\u8F7D\u534F\u8BAE\u6A21\u677F\u5931\u8D25",
    createProtocolTemplateFailed: "\u521B\u5EFA\u534F\u8BAE\u6A21\u677F\u5931\u8D25",
    updateProtocolTemplateFailed: "\u66F4\u65B0\u534F\u8BAE\u6A21\u677F\u5931\u8D25",
    deleteProtocolTemplateFailed: "\u5220\u9664\u534F\u8BAE\u6A21\u677F\u5931\u8D25"
  }
};
function lookup(path) {
  const parts = path.split(".");
  let node = dict;
  for (const p of parts) {
    if (node && typeof node === "object") {
      node = node[p];
    } else {
      return void 0;
    }
  }
  return typeof node === "string" ? node : void 0;
}
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(
    /\{\{(\w+)\}\}/g,
    (m, key) => params[key] !== void 0 ? String(params[key]) : m
  );
}
function t(key, fallback, params) {
  let realParams = params;
  let realFallback;
  if (typeof fallback === "string") {
    realFallback = fallback;
  } else if (fallback && typeof fallback === "object") {
    realParams = fallback;
  }
  const hit = lookup(key);
  if (hit !== void 0) return interpolate(hit, realParams);
  if (realFallback !== void 0) return interpolate(realFallback, realParams);
  return key;
}

// src/toast.tsx
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var items = [];
var listeners = /* @__PURE__ */ new Set();
var seq = 0;
var timers = /* @__PURE__ */ new Map();
function emit() {
  for (const fn of listeners) fn(items);
}
function push(kind, text, detail) {
  const id = ++seq;
  const item = { id, kind, text, detail };
  items = [...items.slice(-3), item];
  emit();
  const ttl = kind === "error" ? 6e3 : 3200;
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), ttl)
  );
}
function dismiss(id) {
  if (timers.has(id)) {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
  }
  items = items.filter((t2) => t2.id !== id);
  emit();
}
var toast = {
  success: (text, detail) => push("success", text, detail),
  error: (text, detail) => push("error", text, detail),
  info: (text, detail) => push("info", text, detail),
  warning: (text, detail) => push("warning", text, detail)
};
var KIND_CLASS = {
  success: "sc-toast ok",
  error: "sc-toast err",
  warning: "sc-toast warn",
  info: "sc-toast info"
};
function ToastHost() {
  const [list, setList] = useState(items);
  useEffect(() => {
    const fn = (next) => setList(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  if (list.length === 0) return null;
  return /* @__PURE__ */ jsx("div", { className: "sc-toasts", children: list.map((t2) => /* @__PURE__ */ jsxs(
    "div",
    {
      className: KIND_CLASS[t2.kind],
      onClick: () => dismiss(t2.id),
      role: "status",
      children: [
        /* @__PURE__ */ jsx("b", { children: t2.text }),
        t2.detail ? /* @__PURE__ */ jsx("small", { className: "sc-toast-detail", children: t2.detail }) : null
      ]
    },
    t2.id
  )) });
}

// src/TaskCard.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function formatTime(sec) {
  if (sec === null || sec === void 0) return "-";
  const d = new Date(sec * 1e3);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function statusColor(status) {
  switch (status) {
    case "running":
      return "bg-primary/15 text-primary";
    case "success":
      return "bg-success/15 text-success";
    case "failed":
      return "bg-danger/15 text-danger";
    default:
      return "bg-background-hover text-text-tertiary";
  }
}
function executorIcon(task) {
  const et = task.executorType || "chat";
  if (et === "command" || et === "cli") return /* @__PURE__ */ jsx2(Terminal, { size: 11 });
  if (et === "http" || et === "webhook") return /* @__PURE__ */ jsx2(Globe, { size: 11 });
  return /* @__PURE__ */ jsx2(MessageSquare, { size: 11 });
}
function TaskCard({ task, running, onRun, onToggle, onEdit, onDelete, onShowLog }) {
  const lastStatus = task.lastRunStatus ?? null;
  const statusLabel = lastStatus ? t(`status.${lastStatus}`, lastStatus) : t("status.notExecuted", "\u672A\u6267\u884C");
  return /* @__PURE__ */ jsxs2("div", { className: "px-2.5 py-2 rounded-lg bg-background-base border border-border hover:border-border-strong transition-colors", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-1.5 flex-wrap", children: [
          /* @__PURE__ */ jsx2("span", { className: `flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 text-text-tertiary`, children: executorIcon(task) }),
          /* @__PURE__ */ jsx2("span", { className: `text-xs font-medium truncate ${task.enabled ? "text-text-primary" : "text-text-tertiary line-through"}`, children: task.name }),
          /* @__PURE__ */ jsx2("span", { className: `text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusColor(lastStatus)}`, children: statusLabel }),
          task.mode === "protocol" && /* @__PURE__ */ jsxs2("span", { className: "text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent shrink-0", children: [
            /* @__PURE__ */ jsx2(FileText, { size: 10, className: "inline mr-0.5" }),
            t("taskMode.protocol", "\u534F\u8BAE\u6A21\u5F0F")
          ] }),
          task.unsupportedExecutor && /* @__PURE__ */ jsx2("span", { className: "text-[10px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger shrink-0", children: t("editor.executorUnsupported", "\u4E0D\u652F\u6301") })
        ] }),
        task.description && /* @__PURE__ */ jsx2("div", { className: "text-[11px] text-text-tertiary truncate mt-0.5", children: task.description }),
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3 text-[10px] text-text-tertiary mt-1", children: [
          /* @__PURE__ */ jsxs2("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx2(Clock, { size: 10 }),
            t(`triggerTypes.${task.triggerType}`, task.triggerType),
            " \xB7 ",
            task.triggerValue
          ] }),
          /* @__PURE__ */ jsxs2("span", { children: [
            t("card.nextRun", "\u4E0B\u6B21"),
            ": ",
            formatTime(task.nextRunAt)
          ] }),
          /* @__PURE__ */ jsxs2("span", { children: [
            t("card.lastRun", "\u4E0A\u6B21"),
            ": ",
            formatTime(task.lastRunAt)
          ] }),
          (task.runCount ?? 0) > 0 && /* @__PURE__ */ jsx2("span", { children: t("card.runCount", "{{count}} \u6B21", { count: task.runCount ?? 0 }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-0.5 shrink-0", children: [
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: onRun,
            disabled: running || task.unsupportedExecutor,
            className: "p-1 rounded-md hover:bg-background-hover text-text-tertiary hover:text-primary disabled:opacity-40",
            title: t("card.run", "\u7ACB\u5373\u6267\u884C"),
            children: /* @__PURE__ */ jsx2(Play, { size: 13 })
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: onToggle,
            className: `p-1 rounded-md hover:bg-background-hover ${task.enabled ? "text-text-tertiary" : "text-success"}`,
            title: task.enabled ? t("card.disable", "\u7981\u7528") : t("card.enable", "\u542F\u7528"),
            children: task.enabled ? /* @__PURE__ */ jsx2(Pause, { size: 13 }) : /* @__PURE__ */ jsx2(Play, { size: 13 })
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: onShowLog,
            className: "p-1 rounded-md hover:bg-background-hover text-text-tertiary",
            title: t("card.log", "\u6267\u884C\u65E5\u5FD7"),
            children: /* @__PURE__ */ jsx2(Clock, { size: 13 })
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: onEdit,
            className: "p-1 rounded-md hover:bg-background-hover text-text-tertiary",
            title: t("card.edit", "\u7F16\u8F91"),
            children: /* @__PURE__ */ jsx2(Pencil, { size: 13 })
          }
        ),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: onDelete,
            className: "p-1 rounded-md hover:bg-background-hover text-text-tertiary hover:text-danger",
            title: t("card.delete", "\u5220\u9664"),
            children: /* @__PURE__ */ jsx2(Trash2, { size: 13 })
          }
        )
      ] })
    ] }),
    task.lastError && /* @__PURE__ */ jsxs2("div", { className: "mt-1.5 text-[10px] text-danger truncate px-1", title: task.lastError, children: [
      t("card.lastError", "\u4E0A\u6B21\u9519\u8BEF"),
      ": ",
      task.lastError
    ] })
  ] });
}

// src/TaskEditor.tsx
import { useEffect as useEffect2, useMemo, useState as useState2 } from "react";
var import_engine3 = __toESM(require_engine());

// src/TriggerConfig.tsx
var import_engine2 = __toESM(require_engine());
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var PRESETS = [
  { label: "1m", type: "interval", value: "1m" },
  { label: "5m", type: "interval", value: "5m" },
  { label: "1h", type: "interval", value: "1h" },
  { label: "1d", type: "interval", value: "1d" }
];
function TriggerConfig({ value, onChange }) {
  const validate = (type, raw) => {
    const v = raw.trim();
    if (!v) return t("trigger.empty", "\u89E6\u53D1\u8868\u8FBE\u5F0F\u4E0D\u80FD\u4E3A\u7A7A");
    const next = (0, import_engine2.calculateNextRun)(type, v, Math.floor(Date.now() / 1e3));
    if (next === null) {
      return t("trigger.invalid", "\u8868\u8FBE\u5F0F\u65E0\u6548\uFF1A") + invalidHint(type);
    }
    return null;
  };
  const invalidHint = (type) => {
    switch (type) {
      case "interval":
      case "after_completion":
        return t("trigger.intervalHint", "\u95F4\u9694\u9700\u4E3A 30s / 5m / 2h / 1d \u5F62\u5F0F");
      case "cron":
        return t("trigger.cronHint", "Cron \u9700\u4E3A 6 \u5B57\u6BB5\uFF08\u79D2 \u5206 \u65F6 \u65E5 \u6708 \u5468\uFF09");
      default:
        return t("trigger.onceHint", "\u5355\u6B21\u9700\u4E3A RFC3339 \u65F6\u95F4\uFF082026-11-11T09:00:00Z\uFF09");
    }
  };
  const err = validate(value.triggerType, value.triggerValue);
  return /* @__PURE__ */ jsxs3("div", { className: "flex flex-col gap-1.5", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxs3(
        "select",
        {
          value: value.triggerType,
          onChange: (e) => onChange({ ...value, triggerType: e.target.value }),
          className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs shrink-0",
          children: [
            /* @__PURE__ */ jsx3("option", { value: "interval", children: t("triggerTypes.interval", "\u95F4\u9694\u6267\u884C") }),
            /* @__PURE__ */ jsx3("option", { value: "cron", children: t("triggerTypes.cron", "Cron \u8868\u8FBE\u5F0F") }),
            /* @__PURE__ */ jsx3("option", { value: "once", children: t("triggerTypes.once", "\u5355\u6B21\u6267\u884C") }),
            /* @__PURE__ */ jsx3("option", { value: "after_completion", children: t("triggerTypes.after_completion", "\u5B8C\u6210\u540E\u95F4\u9694") })
          ]
        }
      ),
      /* @__PURE__ */ jsx3(
        "input",
        {
          value: value.triggerValue,
          onChange: (e) => onChange({ ...value, triggerValue: e.target.value }),
          placeholder: placeholderOf(value.triggerType),
          className: "flex-1 min-w-0 px-2 py-1.5 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong"
        }
      )
    ] }),
    value.triggerType === "interval" && /* @__PURE__ */ jsx3("div", { className: "flex gap-1", children: PRESETS.map((p) => /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        onClick: () => onChange({ triggerType: p.type, triggerValue: p.value }),
        className: "px-1.5 py-0.5 rounded text-[10px] bg-background-hover hover:bg-border text-text-tertiary",
        children: p.label
      },
      p.value
    )) }),
    err ? /* @__PURE__ */ jsx3("div", { className: "text-[10px] text-danger", children: err }) : /* @__PURE__ */ jsxs3("div", { className: "text-[10px] text-text-tertiary", children: [
      t("trigger.nextRunPreview", "\u4E0B\u6B21\u6267\u884C"),
      ": ",
      preview(value.triggerType, value.triggerValue)
    ] })
  ] });
}
function placeholderOf(type) {
  switch (type) {
    case "cron":
      return "0 0 9 * * *";
    case "once":
      return "2026-11-11T09:00:00Z";
    case "after_completion":
      return "30m";
    default:
      return "5m / 2h / 1d";
  }
}
function preview(type, raw) {
  const next = (0, import_engine2.calculateNextRun)(type, raw.trim(), Math.floor(Date.now() / 1e3));
  if (next === null) return "-";
  const d = new Date(next * 1e3);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// src/TaskEditor.tsx
import { Fragment, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var EXECUTORS = [
  { value: "", label: "AI \u4F1A\u8BDD\uFF08chat\uFF09" },
  { value: "command", label: "CLI \u547D\u4EE4\uFF08command\uFF09" },
  { value: "http", label: "HTTP \u8BF7\u6C42\uFF08http\uFF09" }
];
function TaskEditor({ task, templates, protocolTemplates, onClose }) {
  const editing = task !== null;
  const [name, setName] = useState2(task?.name || "");
  const [description, setDescription] = useState2(task?.description || "");
  const [enabled, setEnabled] = useState2(task?.enabled !== false);
  const [mode, setMode] = useState2(task?.mode === "protocol" ? "protocol" : "simple");
  const [trigger, setTrigger] = useState2({
    triggerType: task?.triggerType || "interval",
    triggerValue: task?.triggerValue || "1h"
  });
  const [engineId, setEngineId] = useState2(task?.engineId || "claude-code");
  const [prompt, setPrompt] = useState2(task?.prompt || "");
  const [workDir, setWorkDir] = useState2(task?.workDir || "");
  const [templateId, setTemplateId] = useState2(task?.templateId || "");
  const [mission, setMission] = useState2(task?.mission || "");
  const [category, setCategory] = useState2(task?.category || "other");
  const [group, setGroup] = useState2(task?.group || "");
  const [timeoutMinutes, setTimeoutMinutes] = useState2(task?.timeoutMinutes ? String(task.timeoutMinutes) : "");
  const [executorType, setExecutorType] = useState2(task?.executorType || "");
  const [executorParamsJson, setExecutorParamsJson] = useState2(
    task?.executorParams ? JSON.stringify(task.executorParams, null, 2) : ""
  );
  const [saving, setSaving] = useState2(false);
  const [protocolTemplateId, setProtocolTemplateId] = useState2("");
  useEffect2(() => {
    if (mode === "protocol" && protocolTemplateId) {
      const tpl = protocolTemplates.find((x) => x.id === protocolTemplateId);
      if (tpl) {
        setTrigger({
          triggerType: tpl.defaultTriggerType || "interval",
          triggerValue: tpl.defaultTriggerValue || "1h"
        });
        if (tpl.defaultEngineId) setEngineId(tpl.defaultEngineId);
        if (tpl.defaultTimeoutMinutes) setTimeoutMinutes(String(tpl.defaultTimeoutMinutes));
        if (tpl.category) setCategory(tpl.category);
      }
    }
  }, [protocolTemplateId, mode, protocolTemplates]);
  const selectedTpl = useMemo(
    () => protocolTemplates.find((x) => x.id === protocolTemplateId) || null,
    [protocolTemplates, protocolTemplateId]
  );
  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (!engineId.trim()) return false;
    if (executorType === "" && !prompt.trim() && mode === "simple" && !templateId) return false;
    if (mode === "protocol" && !mission.trim()) return false;
    return (0, import_engine3.calculateNextRun)(trigger.triggerType, trigger.triggerValue.trim(), Math.floor(Date.now() / 1e3)) !== null;
  }, [name, engineId, prompt, mode, templateId, mission, trigger]);
  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let executorParams = null;
      if (executorType && executorParamsJson.trim()) {
        try {
          executorParams = JSON.parse(executorParamsJson);
        } catch {
          throw new Error(t("editor.paramsInvalid", "\u6267\u884C\u5668\u53C2\u6570\u4E0D\u662F\u5408\u6CD5 JSON"));
        }
      }
      const base = {
        name: name.trim(),
        description: description.trim() || null,
        enabled,
        mode,
        triggerType: trigger.triggerType,
        triggerValue: trigger.triggerValue.trim(),
        engineId: engineId.trim(),
        prompt,
        workDir: workDir.trim() || null,
        templateId: templateId || null,
        mission: mode === "protocol" ? mission.trim() : null,
        category,
        group: group.trim() || null,
        timeoutMinutes: timeoutMinutes ? Number(timeoutMinutes) : null,
        executorType,
        executorParams
      };
      if (editing && task) {
        await updateTask({ ...task, ...base });
        toast.success(t("toast.updated", "\u5DF2\u66F4\u65B0"));
      } else {
        await createTask(base);
        toast.success(t("toast.created", "\u5DF2\u521B\u5EFA"));
      }
      onClose();
    } catch (e) {
      toast.error(t("toast.saveFailed", "\u4FDD\u5B58\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [
    /* @__PURE__ */ jsx4("div", { className: "absolute inset-0 bg-black/40", onClick: onClose }),
    /* @__PURE__ */ jsxs4("div", { className: "relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl bg-background-base border border-border shadow-xl p-4 flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center", children: [
        /* @__PURE__ */ jsx4("span", { className: "text-sm font-medium text-text-primary flex-1", children: editing ? t("editor.edit", "\u7F16\u8F91\u4EFB\u52A1") : t("editor.new", "\u65B0\u5EFA\u4EFB\u52A1") }),
        /* @__PURE__ */ jsx4("button", { type: "button", onClick: onClose, className: "p-1 rounded hover:bg-background-hover text-text-tertiary", children: /* @__PURE__ */ jsx4(X, { size: 15 }) })
      ] }),
      /* @__PURE__ */ jsx4("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: t("editor.name", "\u4EFB\u52A1\u540D\u79F0"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" }),
      /* @__PURE__ */ jsx4("input", { value: description, onChange: (e) => setDescription(e.target.value), placeholder: t("editor.description", "\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" }),
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxs4("label", { className: "flex items-center gap-1 text-xs text-text-secondary", children: [
          /* @__PURE__ */ jsx4("input", { type: "radio", checked: mode === "simple", onChange: () => setMode("simple") }),
          t("taskMode.simple", "\u7B80\u5355\u6A21\u5F0F")
        ] }),
        /* @__PURE__ */ jsxs4("label", { className: "flex items-center gap-1 text-xs text-text-secondary", children: [
          /* @__PURE__ */ jsx4("input", { type: "radio", checked: mode === "protocol", onChange: () => setMode("protocol") }),
          t("taskMode.protocol", "\u534F\u8BAE\u6A21\u5F0F")
        ] }),
        /* @__PURE__ */ jsxs4("label", { className: "flex items-center gap-1 text-xs text-text-secondary ml-auto", children: [
          /* @__PURE__ */ jsx4("input", { type: "checkbox", checked: enabled, onChange: (e) => setEnabled(e.target.checked) }),
          t("editor.enabled", "\u521B\u5EFA\u540E\u7ACB\u5373\u542F\u7528")
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsx4("div", { className: "text-[10px] text-text-tertiary mb-1", children: t("editor.trigger", "\u89E6\u53D1\u914D\u7F6E") }),
        /* @__PURE__ */ jsx4(TriggerConfig, { value: trigger, onChange: setTrigger })
      ] }),
      mode === "protocol" && /* @__PURE__ */ jsxs4("div", { className: "flex flex-col gap-2 p-2.5 rounded-lg bg-background-hover/50 border border-border", children: [
        /* @__PURE__ */ jsxs4(
          "select",
          {
            value: protocolTemplateId,
            onChange: (e) => setProtocolTemplateId(e.target.value),
            className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs",
            children: [
              /* @__PURE__ */ jsx4("option", { value: "", children: t("editor.noProtocolTemplate", "\u4E0D\u4F7F\u7528\u534F\u8BAE\u6A21\u677F") }),
              protocolTemplates.map((x) => /* @__PURE__ */ jsxs4("option", { value: x.id, children: [
                x.name,
                x.builtin ? `\uFF08${t("editor.builtin", "\u5185\u7F6E")}\uFF09` : ""
              ] }, x.id))
            ]
          }
        ),
        /* @__PURE__ */ jsx4(
          "textarea",
          {
            value: mission,
            onChange: (e) => setMission(e.target.value),
            rows: 2,
            placeholder: t("editor.mission", "\u4EFB\u52A1\u76EE\u6807\uFF08\u534F\u8BAE\u6A21\u5F0F\u5FC5\u586B\uFF0C\u5199\u5165\u534F\u8BAE\u6587\u6863\uFF09"),
            className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong resize-y"
          }
        ),
        /* @__PURE__ */ jsx4(
          "input",
          {
            value: workDir,
            onChange: (e) => setWorkDir(e.target.value),
            placeholder: t("editor.workDir", "\u5DE5\u4F5C\u76EE\u5F55\uFF08\u534F\u8BAE\u6587\u6863\u843D\u76D8\u4F4D\u7F6E\uFF0C\u5982 D:/projects/myapp\uFF09"),
            className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong"
          }
        ),
        selectedTpl && selectedTpl.params.length > 0 && /* @__PURE__ */ jsx4("div", { className: "text-[10px] text-text-tertiary", children: t("editor.protocolParamsHint", "\u6A21\u677F\u53C2\u6570\u5728\u6267\u884C\u65F6\u6309\u5F53\u524D\u8F93\u5165\u6E32\u67D3\uFF0C\u4EFB\u52A1\u521B\u5EFA\u540E\u53EF\u5728\u9762\u677F\u4E2D\u67E5\u770B\u534F\u8BAE\u6587\u6863") })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx4(
          "select",
          {
            value: executorType,
            onChange: (e) => setExecutorType(e.target.value),
            className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs",
            children: EXECUTORS.map((x) => /* @__PURE__ */ jsx4("option", { value: x.value, children: x.label }, x.value))
          }
        ),
        executorType === "" ? /* @__PURE__ */ jsxs4("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsx4("input", { value: engineId, onChange: (e) => setEngineId(e.target.value), placeholder: t("editor.engineId", "\u5F15\u64CE ID\uFF08\u5982 claude-code\uFF09"), className: "px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" }),
          mode === "simple" && /* @__PURE__ */ jsxs4(Fragment, { children: [
            /* @__PURE__ */ jsxs4(
              "select",
              {
                value: templateId,
                onChange: (e) => setTemplateId(e.target.value),
                className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs",
                children: [
                  /* @__PURE__ */ jsx4("option", { value: "", children: t("editor.noTemplate", "\u4E0D\u4F7F\u7528\u63D0\u793A\u8BCD\u6A21\u677F") }),
                  templates.map((x) => /* @__PURE__ */ jsx4("option", { value: x.id, children: x.name }, x.id))
                ]
              }
            ),
            /* @__PURE__ */ jsx4(
              "textarea",
              {
                value: prompt,
                onChange: (e) => setPrompt(e.target.value),
                rows: 3,
                placeholder: templateId ? t("editor.promptWithTemplate", "\u63D0\u793A\u8BCD\uFF08\u5C06\u5957\u7528\u6A21\u677F {{prompt}} \u53D8\u91CF\uFF09") : t("editor.prompt", "\u63D0\u793A\u8BCD"),
                className: "px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong resize-y"
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsx4(
          "textarea",
          {
            value: executorParamsJson,
            onChange: (e) => setExecutorParamsJson(e.target.value),
            rows: 4,
            placeholder: executorType === "command" ? '{ "command": "pnpm test", "cwd": "D:/repo", "timeoutSecs": 300 }' : '{ "url": "https://example.com/health", "method": "GET", "timeoutSecs": 60 }',
            className: "px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs font-mono outline-none focus:border-border-strong resize-y"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs4("details", { className: "text-xs", children: [
        /* @__PURE__ */ jsx4("summary", { className: "cursor-pointer text-text-tertiary", children: t("editor.advanced", "\u9AD8\u7EA7") }),
        /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-2 gap-2 mt-2", children: [
          /* @__PURE__ */ jsx4("select", { value: category, onChange: (e) => setCategory(e.target.value), className: "px-2 py-1.5 rounded-md bg-background-base border border-border text-xs", children: ["development", "review", "news", "monitor", "custom", "other"].map((c) => /* @__PURE__ */ jsx4("option", { value: c, children: t(`taskCategory.${c}`, c) }, c)) }),
          /* @__PURE__ */ jsx4("input", { value: group, onChange: (e) => setGroup(e.target.value), placeholder: t("editor.group", "\u5206\u7EC4\uFF08\u53EF\u9009\uFF09"), className: "px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" }),
          /* @__PURE__ */ jsx4("input", { value: timeoutMinutes, onChange: (e) => setTimeoutMinutes(e.target.value), type: "number", placeholder: t("editor.timeout", "\u8D85\u65F6\uFF08\u5206\u949F\uFF0C\u9ED8\u8BA4 30\uFF09"), className: "px-2 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "flex justify-end gap-2 pt-1", children: [
        /* @__PURE__ */ jsx4("button", { type: "button", onClick: onClose, className: "px-3 py-1.5 rounded-md text-xs bg-background-hover hover:bg-border text-text-secondary", children: t("editor.cancel", "\u53D6\u6D88") }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            type: "button",
            onClick: handleSave,
            disabled: !canSave || saving,
            className: "px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40",
            children: saving ? t("editor.saving", "\u4FDD\u5B58\u4E2D...") : t("editor.save", "\u4FDD\u5B58")
          }
        )
      ] })
    ] })
  ] });
}

// src/ExecutionLogDrawer.tsx
import { useEffect as useEffect3, useRef, useState as useState3 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function statusIcon(status) {
  if (status === "success") return /* @__PURE__ */ jsx5(CircleCheck, { size: 12, className: "text-success shrink-0 mt-0.5" });
  if (status === "running") return /* @__PURE__ */ jsx5(LoaderCircle, { size: 12, className: "text-primary shrink-0 mt-0.5 animate-spin" });
  return /* @__PURE__ */ jsx5(CircleX, { size: 12, className: "text-danger shrink-0 mt-0.5" });
}
function fmt(sec) {
  const d = new Date(sec * 1e3);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function ExecutionLogDrawer({ open, task, hist, onClose }) {
  const [height, setHeight] = useState3(240);
  const dragging = useRef(false);
  useEffect3(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const h = window.innerHeight - e.clientY;
      setHeight(Math.max(140, Math.min(window.innerHeight - 80, h)));
    };
    const up = () => {
      dragging.current = false;
    };
    if (open) {
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [open]);
  if (!open) return null;
  const entries = task ? hist.filter((h) => h.taskId === task.id) : hist;
  return /* @__PURE__ */ jsxs5("div", { className: "fixed inset-0 z-50 flex flex-col justify-end", style: { pointerEvents: "none" }, children: [
    /* @__PURE__ */ jsx5("div", { className: "absolute inset-0", onClick: onClose }),
    /* @__PURE__ */ jsxs5(
      "div",
      {
        className: "relative bg-background-base border-t border-border shadow-lg flex flex-col",
        style: { height, pointerEvents: "auto" },
        children: [
          /* @__PURE__ */ jsxs5(
            "div",
            {
              className: "flex items-center gap-2 px-3 h-8 border-b border-border cursor-ns-resize shrink-0",
              onMouseDown: () => {
                dragging.current = true;
              },
              children: [
                /* @__PURE__ */ jsx5("span", { className: "text-xs font-medium text-text-primary truncate flex-1", children: task ? `${t("drawer.historyTitle", "\u6267\u884C\u65E5\u5FD7")} \xB7 ${task.name}` : t("drawer.allHistory", "\u5168\u90E8\u6267\u884C\u65E5\u5FD7") }),
                /* @__PURE__ */ jsx5("button", { type: "button", onClick: onClose, className: "p-1 rounded hover:bg-background-hover text-text-tertiary", children: /* @__PURE__ */ jsx5(X, { size: 14 }) })
              ]
            }
          ),
          /* @__PURE__ */ jsx5("div", { className: "flex-1 overflow-y-auto px-3 py-2", children: entries.length === 0 ? /* @__PURE__ */ jsx5("div", { className: "py-6 text-center text-xs text-text-tertiary", children: t("drawer.empty", "\u6682\u65E0\u6267\u884C\u8BB0\u5F55") }) : /* @__PURE__ */ jsx5("div", { className: "flex flex-col gap-2", children: entries.map((e) => /* @__PURE__ */ jsx5("div", { className: "text-[11px] leading-relaxed", children: /* @__PURE__ */ jsxs5("div", { className: "flex items-start gap-1.5", children: [
            statusIcon(e.status),
            /* @__PURE__ */ jsxs5("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxs5("div", { className: "flex items-center gap-2 text-text-tertiary", children: [
                /* @__PURE__ */ jsx5("span", { className: "tabular-nums", children: fmt(e.startedAt) }),
                e.durationMs !== void 0 && e.durationMs > 0 && /* @__PURE__ */ jsxs5("span", { children: [
                  (e.durationMs / 1e3).toFixed(1),
                  "s"
                ] }),
                /* @__PURE__ */ jsx5("span", { className: "text-text-tertiary/70", children: e.trigger })
              ] }),
              e.summary && /* @__PURE__ */ jsx5("div", { className: "text-text-secondary break-all mt-0.5", children: e.summary }),
              e.excerpt && /* @__PURE__ */ jsx5("pre", { className: "mt-1 p-1.5 rounded bg-background-hover text-[10px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto", children: e.excerpt })
            ] })
          ] }) }, e.id)) }) })
        ]
      }
    )
  ] });
}

// src/TemplateManager.tsx
import { useMemo as useMemo2, useState as useState4 } from "react";
var import_engine4 = __toESM(require_engine());
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var SAMPLE = { taskName: "\u793A\u4F8B\u4EFB\u52A1", prompt: "\u5199\u4E00\u4EFD\u65E5\u62A5" };
function TemplateManager({ templates, onClose }) {
  const [editing, setEditing] = useState4(null);
  const [creating, setCreating] = useState4(false);
  const [name, setName] = useState4("");
  const [content, setContent] = useState4("");
  const [preview2, setPreview] = useState4(true);
  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setName("");
    setContent("");
  };
  const startEdit = (tpl) => {
    setCreating(false);
    setEditing(tpl);
    setName(tpl.name);
    setContent(tpl.content);
  };
  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      toast.error(t("tmpl.required", "\u540D\u79F0\u4E0E\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A"));
      return;
    }
    try {
      if (editing) await updateTemplate({ ...editing, name: name.trim(), content });
      else await createTemplate({ name: name.trim(), content });
      toast.success(t("toast.saved", "\u5DF2\u4FDD\u5B58"));
      setCreating(false);
      setEditing(null);
    } catch (e) {
      toast.error(t("toast.saveFailed", "\u4FDD\u5B58\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    }
  };
  const handleDelete = async (tpl) => {
    if (!window.confirm(t("tmpl.confirmDelete", `\u786E\u5B9A\u5220\u9664\u6A21\u677F\u300C${tpl.name}\u300D\uFF1F`))) return;
    try {
      await deleteTemplate(tpl.id);
      toast.success(t("toast.deleted", "\u5DF2\u5220\u9664"));
    } catch (e) {
      toast.error(t("toast.deleteFailed", "\u5220\u9664\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    }
  };
  const rendered = useMemo2(
    () => preview2 && content ? (0, import_engine4.applyTemplate)(content, SAMPLE.taskName, SAMPLE.prompt) : "",
    [preview2, content]
  );
  return /* @__PURE__ */ jsxs6("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [
    /* @__PURE__ */ jsx6("div", { className: "absolute inset-0 bg-black/40", onClick: onClose }),
    /* @__PURE__ */ jsxs6("div", { className: "relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-background-base border border-border shadow-xl p-4 flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxs6("div", { className: "flex items-center", children: [
        /* @__PURE__ */ jsx6("span", { className: "text-sm font-medium text-text-primary flex-1", children: t("tmpl.title", "\u63D0\u793A\u8BCD\u6A21\u677F") }),
        /* @__PURE__ */ jsxs6("button", { type: "button", onClick: startCreate, className: "flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 mr-2", children: [
          /* @__PURE__ */ jsx6(Plus, { size: 12 }),
          t("tmpl.new", "\u65B0\u5EFA")
        ] }),
        /* @__PURE__ */ jsx6("button", { type: "button", onClick: onClose, className: "p-1 rounded hover:bg-background-hover text-text-tertiary", children: /* @__PURE__ */ jsx6(X, { size: 15 }) })
      ] }),
      !creating && !editing && /* @__PURE__ */ jsx6("div", { className: "flex flex-col gap-1.5", children: templates.length === 0 ? /* @__PURE__ */ jsx6("div", { className: "py-6 text-center text-xs text-text-tertiary", children: t("tmpl.empty", "\u6682\u65E0\u6A21\u677F") }) : templates.map((tpl) => /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background-hover/50 border border-border", children: [
        /* @__PURE__ */ jsxs6("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsx6("div", { className: "text-xs font-medium text-text-primary truncate", children: tpl.name }),
          /* @__PURE__ */ jsx6("div", { className: "text-[10px] text-text-tertiary truncate", children: tpl.content })
        ] }),
        /* @__PURE__ */ jsx6("button", { type: "button", onClick: () => startEdit(tpl), className: "p-1 rounded hover:bg-background-hover text-text-tertiary", title: t("card.edit", "\u7F16\u8F91"), children: /* @__PURE__ */ jsx6(Pencil, { size: 12 }) }),
        /* @__PURE__ */ jsx6("button", { type: "button", onClick: () => handleDelete(tpl), className: "p-1 rounded hover:bg-background-hover text-text-tertiary hover:text-danger", title: t("card.delete", "\u5220\u9664"), children: /* @__PURE__ */ jsx6(Trash2, { size: 12 }) })
      ] }, tpl.id)) }),
      (creating || editing) && /* @__PURE__ */ jsxs6("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx6("div", { className: "text-xs text-text-tertiary", children: t("tmpl.vars", "\u53EF\u7528\u53D8\u91CF\uFF1A{{prompt}} {{taskName}} {{date}} {{time}} {{datetime}} {{weekday}}") }),
        /* @__PURE__ */ jsx6("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: t("tmpl.name", "\u6A21\u677F\u540D\u79F0"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong" }),
        /* @__PURE__ */ jsx6(
          "textarea",
          {
            value: content,
            onChange: (e) => setContent(e.target.value),
            rows: 6,
            placeholder: t("tmpl.content", "\u6A21\u677F\u5185\u5BB9\uFF0C\u7528 {{prompt}} \u5F15\u7528\u4EFB\u52A1\u63D0\u793A\u8BCD"),
            className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none focus:border-border-strong resize-y font-mono"
          }
        ),
        /* @__PURE__ */ jsxs6("label", { className: "flex items-center gap-1 text-[11px] text-text-secondary", children: [
          /* @__PURE__ */ jsx6("input", { type: "checkbox", checked: preview2, onChange: (e) => setPreview(e.target.checked) }),
          t("tmpl.preview", "\u6E32\u67D3\u9884\u89C8\uFF08\u793A\u4F8B\u53D8\u91CF\uFF09")
        ] }),
        rendered && /* @__PURE__ */ jsx6("pre", { className: "p-2 rounded-md bg-background-hover border border-border text-[10px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto", children: rendered }),
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx6("button", { type: "button", onClick: () => {
            setCreating(false);
            setEditing(null);
          }, className: "px-3 py-1.5 rounded-md text-xs bg-background-hover hover:bg-border text-text-secondary", children: t("editor.cancel", "\u53D6\u6D88") }),
          /* @__PURE__ */ jsx6("button", { type: "button", onClick: handleSave, className: "px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90", children: t("editor.save", "\u4FDD\u5B58") })
        ] })
      ] })
    ] })
  ] });
}

// src/ProtocolTemplateManager.tsx
import { useMemo as useMemo3, useState as useState5 } from "react";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var EMPTY_CONFIG = {
  missionTemplate: "{mission}",
  executionRules: "### 1. \u63A8\u8FDB\u4EFB\u52A1\n- \u8BFB\u53D6\u8BB0\u5FC6\u4E86\u89E3\u8FDB\u5EA6\n- \u6267\u884C\u4E0B\u4E00\u6B65\n\n### 2. \u66F4\u65B0\u8BB0\u5FC6\n- \u5B8C\u6210\u540E\u66F4\u65B0\u8BB0\u5FC6\u6587\u4EF6",
  memoryRules: "",
  customSections: void 0
};
function ProtocolTemplateManager({ templates, onClose }) {
  const [selected, setSelected] = useState5(null);
  const [creating, setCreating] = useState5(false);
  const [form, setForm] = useState5({
    name: "",
    description: "",
    category: "custom",
    mission: ""
  });
  const [config, setConfig] = useState5(EMPTY_CONFIG);
  const [paramsDraft, setParamsDraft] = useState5("");
  const [docPreview, setDocPreview] = useState5("");
  const startCreate = () => {
    setSelected(null);
    setCreating(true);
    setForm({ name: "", description: "", category: "custom", mission: "\u793A\u4F8B\u4EFB\u52A1\u76EE\u6807" });
    setConfig(EMPTY_CONFIG);
    setParamsDraft("mission|\u4EFB\u52A1\u76EE\u6807|textarea|true\nkeywords|\u5173\u952E\u8BCD|text|false");
  };
  const startView = (tpl) => {
    setSelected(tpl);
    setCreating(false);
    setDocPreview(generateProtocolDocument(tpl, { mission: "\u793A\u4F8B\u4EFB\u52A1\u76EE\u6807" }));
  };
  const parseParams = () => {
    return paramsDraft.split("\n").filter((l) => l.trim()).map((line, i) => {
      const [key = "", label = "", type = "text", required = "false"] = line.split("|").map((x) => x.trim());
      return { key: key || `p${i}`, label: label || key, type: type || "text", required: required === "true" };
    });
  };
  const handleCreate = async () => {
    if (!form.name.trim() || !config.missionTemplate.trim()) {
      toast.error(t("ptmpl.required", "\u540D\u79F0\u4E0E\u4EFB\u52A1\u76EE\u6807\u6A21\u677F\u4E0D\u80FD\u4E3A\u7A7A"));
      return;
    }
    try {
      await createProtocolTemplate({
        name: form.name.trim(),
        description: form.description.trim() || void 0,
        category: form.category,
        params: parseParams(),
        protocolConfig: config,
        defaultTriggerType: "interval",
        defaultTriggerValue: "1h",
        defaultEngineId: "claude-code",
        enabled: true
      });
      toast.success(t("toast.created", "\u5DF2\u521B\u5EFA"));
      setCreating(false);
    } catch (e) {
      toast.error(t("toast.saveFailed", "\u4FDD\u5B58\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    }
  };
  const handleDelete = async (tpl) => {
    if (tpl.builtin) {
      toast.error(t("ptmpl.builtinNoDelete", "\u5185\u7F6E\u6A21\u677F\u4E0D\u53EF\u5220\u9664"));
      return;
    }
    if (!window.confirm(t("ptmpl.confirmDelete", `\u786E\u5B9A\u5220\u9664\u6A21\u677F\u300C${tpl.name}\u300D\uFF1F`))) return;
    try {
      await deleteProtocolTemplate(tpl.id);
      if (selected?.id === tpl.id) setSelected(null);
      toast.success(t("toast.deleted", "\u5DF2\u5220\u9664"));
    } catch (e) {
      toast.error(t("toast.deleteFailed", "\u5220\u9664\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    }
  };
  const grouped = useMemo3(() => {
    const map = /* @__PURE__ */ new Map();
    for (const tpl of templates) {
      const k = tpl.category || "other";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(tpl);
    }
    return map;
  }, [templates]);
  return /* @__PURE__ */ jsxs7("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [
    /* @__PURE__ */ jsx7("div", { className: "absolute inset-0 bg-black/40", onClick: onClose }),
    /* @__PURE__ */ jsxs7("div", { className: "relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-background-base border border-border shadow-xl p-4 flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center", children: [
        /* @__PURE__ */ jsx7("span", { className: "text-sm font-medium text-text-primary flex-1", children: t("ptmpl.title", "\u534F\u8BAE\u6A21\u677F") }),
        /* @__PURE__ */ jsxs7("button", { type: "button", onClick: startCreate, className: "flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 mr-2", children: [
          /* @__PURE__ */ jsx7(Plus, { size: 12 }),
          t("ptmpl.new", "\u65B0\u5EFA")
        ] }),
        /* @__PURE__ */ jsx7("button", { type: "button", onClick: onClose, className: "p-1 rounded hover:bg-background-hover text-text-tertiary", children: /* @__PURE__ */ jsx7(X, { size: 15 }) })
      ] }),
      !creating && !selected && /* @__PURE__ */ jsxs7("div", { className: "flex flex-col gap-3", children: [
        [...grouped.entries()].map(([cat, list]) => /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx7("div", { className: "text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1", children: t(`taskCategory.${cat}`, cat) }),
          /* @__PURE__ */ jsx7("div", { className: "flex flex-col gap-1.5", children: list.map((tpl) => /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background-hover/50 border border-border", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxs7("div", { className: "text-xs font-medium text-text-primary truncate", children: [
                tpl.name,
                tpl.builtin && /* @__PURE__ */ jsx7("span", { className: "ml-1.5 text-[9px] px-1 rounded bg-accent/15 text-accent", children: t("editor.builtin", "\u5185\u7F6E") })
              ] }),
              tpl.description && /* @__PURE__ */ jsx7("div", { className: "text-[10px] text-text-tertiary truncate", children: tpl.description })
            ] }),
            /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => startView(tpl), className: "p-1 rounded hover:bg-background-hover text-text-tertiary", title: t("ptmpl.preview", "\u9884\u89C8\u534F\u8BAE\u6587\u6863"), children: /* @__PURE__ */ jsx7(Eye, { size: 12 }) }),
            !tpl.builtin && /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => handleDelete(tpl), className: "p-1 rounded hover:bg-background-hover text-text-tertiary hover:text-danger", title: t("card.delete", "\u5220\u9664"), children: /* @__PURE__ */ jsx7(Trash2, { size: 12 }) })
          ] }, tpl.id)) })
        ] }, cat)),
        templates.length === 0 && /* @__PURE__ */ jsx7("div", { className: "py-6 text-center text-xs text-text-tertiary", children: t("ptmpl.empty", "\u6682\u65E0\u534F\u8BAE\u6A21\u677F") })
      ] }),
      selected && !creating && /* @__PURE__ */ jsxs7("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx7("span", { className: "text-xs font-medium text-text-primary flex-1", children: selected.name }),
          /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => setSelected(null), className: "px-2 py-1 rounded-md text-[11px] bg-background-hover hover:bg-border text-text-secondary", children: t("ptmpl.back", "\u8FD4\u56DE\u5217\u8868") })
        ] }),
        /* @__PURE__ */ jsx7("pre", { className: "p-2.5 rounded-md bg-background-hover border border-border text-[10px] leading-relaxed whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto", children: docPreview }),
        selected.params.length > 0 && /* @__PURE__ */ jsxs7("div", { className: "text-[10px] text-text-tertiary", children: [
          t("ptmpl.params", "\u4EFB\u52A1\u521B\u5EFA\u65F6\u6309\u53C2\u6570\u6E32\u67D3\uFF1A"),
          selected.params.map((p) => ` ${p.label}(${p.key})`).join(" \xB7")
        ] })
      ] }),
      creating && /* @__PURE__ */ jsxs7("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx7("input", { value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: t("ptmpl.name", "\u6A21\u677F\u540D\u79F0"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" }),
        /* @__PURE__ */ jsx7("input", { value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }), placeholder: t("ptmpl.description", "\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none" }),
        /* @__PURE__ */ jsx7("textarea", { value: config.missionTemplate, onChange: (e) => setConfig({ ...config, missionTemplate: e.target.value }), rows: 2, placeholder: t("ptmpl.mission", "\u4EFB\u52A1\u76EE\u6807\u6A21\u677F\uFF08{mission} \u5F15\u7528\u53C2\u6570\uFF09"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none resize-y font-mono" }),
        /* @__PURE__ */ jsx7("textarea", { value: config.executionRules || "", onChange: (e) => setConfig({ ...config, executionRules: e.target.value }), rows: 4, placeholder: t("ptmpl.executionRules", "\u6267\u884C\u89C4\u5219\uFF08Markdown\uFF09"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none resize-y font-mono" }),
        /* @__PURE__ */ jsx7("textarea", { value: config.memoryRules || "", onChange: (e) => setConfig({ ...config, memoryRules: e.target.value }), rows: 3, placeholder: t("ptmpl.memoryRules", "\u8BB0\u5FC6\u89C4\u5219\uFF08Markdown\uFF0C\u53EF\u9009\uFF09"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-xs outline-none resize-y font-mono" }),
        /* @__PURE__ */ jsx7("textarea", { value: paramsDraft, onChange: (e) => setParamsDraft(e.target.value), rows: 3, placeholder: t("ptmpl.paramsDraft", "\u53C2\u6570\u6BCF\u884C\u4E00\u6761\uFF1Akey|\u6807\u7B7E|text/textarea/select|\u662F\u5426\u5FC5\u586B"), className: "px-2.5 py-1.5 rounded-md bg-background-hover border border-border text-[11px] outline-none resize-y font-mono" }),
        /* @__PURE__ */ jsxs7("div", { className: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsx7("button", { type: "button", onClick: () => setCreating(false), className: "px-3 py-1.5 rounded-md text-xs bg-background-hover hover:bg-border text-text-secondary", children: t("editor.cancel", "\u53D6\u6D88") }),
          /* @__PURE__ */ jsx7("button", { type: "button", onClick: handleCreate, className: "px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90", children: t("editor.save", "\u4FDD\u5B58") })
        ] })
      ] })
    ] })
  ] });
}

// src/Panel.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function Panel() {
  const data = useAiSchedulerData();
  const { tasks, hist, meta, loading, error } = data;
  const [filterStatus, setFilterStatus] = useState6("all");
  const [search, setSearch] = useState6("");
  const [sortKey, setSortKey] = useState6("created");
  const [showEditor, setShowEditor] = useState6(false);
  const [editingTask, setEditingTask] = useState6(null);
  const [showTemplates, setShowTemplates] = useState6(false);
  const [showProtocolTemplates, setShowProtocolTemplates] = useState6(false);
  const [drawerOpen, setDrawerOpen] = useState6(false);
  const [drawerTask, setDrawerTask] = useState6(null);
  const [running, setRunning] = useState6(null);
  const serviceState = metaAlive(meta);
  const filtered = useMemo4(() => {
    let list = tasks;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (x) => x.name.toLowerCase().includes(q) || (x.description || "").toLowerCase().includes(q)
      );
    }
    switch (filterStatus) {
      case "enabled":
        list = list.filter((x) => x.enabled);
        break;
      case "disabled":
        list = list.filter((x) => !x.enabled);
        break;
      case "running":
        list = list.filter((x) => x.lastRunStatus === "running");
        break;
      case "success":
        list = list.filter((x) => x.lastRunStatus === "success");
        break;
      case "failed":
        list = list.filter((x) => x.lastRunStatus === "failed");
        break;
    }
    const sorted = [...list];
    switch (sortKey) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "nextRun":
        sorted.sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity));
        break;
      case "lastRun":
        sorted.sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0));
        break;
      default:
        sorted.sort((a, b) => b.createdAt - a.createdAt);
    }
    return sorted;
  }, [tasks, filterStatus, search, sortKey]);
  const handleRun = async (task) => {
    if (task.unsupportedExecutor) {
      toast.error(t("editor.executorUnsupported", "\u8BE5\u6267\u884C\u5668\u7C7B\u578B\u968F\u4E3B\u4ED3\u51FA\u4ED3\uFF0C\u672C\u63D2\u4EF6 v1 \u4E0D\u652F\u6301"));
      return;
    }
    setRunning(task.id);
    try {
      const r = await runTask(task.id);
      if (r.ok) toast.success(t("toast.runQueued", "\u5DF2\u63D0\u4EA4\u6267\u884C\uFF08\u670D\u52A1\u8FDB\u7A0B\u5C06\u89E6\u53D1\uFF09"));
      else toast.error(t("toast.runFailed", "\u6267\u884C\u5931\u8D25"), r.error || "");
    } catch (e) {
      toast.error(t("toast.runFailed", "\u6267\u884C\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };
  const handleToggle = async (task) => {
    try {
      await toggleTask(task.id, !task.enabled);
      toast.success(task.enabled ? t("toast.disabled", "\u5DF2\u7981\u7528") : t("toast.enabled", "\u5DF2\u542F\u7528"));
    } catch (e) {
      toast.error(t("toast.toggleFailed", "\u64CD\u4F5C\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    }
  };
  const handleDelete = async (task) => {
    if (!window.confirm(t("confirmDelete", `\u786E\u5B9A\u5220\u9664\u4EFB\u52A1\u300C${task.name}\u300D\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002`, { name: task.name }))) return;
    try {
      await deleteTask(task.id);
      toast.success(t("toast.deleted", "\u5DF2\u5220\u9664"));
    } catch (e) {
      toast.error(t("toast.deleteFailed", "\u5220\u9664\u5931\u8D25"), e instanceof Error ? e.message : String(e));
    }
  };
  return /* @__PURE__ */ jsxs8("div", { className: "flex flex-col h-full overflow-hidden", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-border shrink-0", children: [
      /* @__PURE__ */ jsx8(Clock, { size: 15, className: "text-text-tertiary shrink-0" }),
      /* @__PURE__ */ jsx8("span", { className: "text-sm font-medium text-text-primary", children: t("title", "\u5B9A\u65F6\u4EFB\u52A1") }),
      /* @__PURE__ */ jsx8(
        "span",
        {
          className: `text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${serviceState === "ok" ? "bg-success/15 text-success" : serviceState === "stale" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger"}`,
          title: serviceState === "ok" ? t("service.ok", "\u8C03\u5EA6\u670D\u52A1\u8FD0\u884C\u4E2D") : serviceState === "stale" ? t("service.stale", "\u8C03\u5EA6\u670D\u52A1\u5FC3\u8DF3\u8D85\u65F6") : t("service.down", "\u8C03\u5EA6\u670D\u52A1\u672A\u8FD0\u884C"),
          children: serviceState === "ok" ? t("service.okBadge", "\u8FD0\u884C\u4E2D") : t("service.downBadge", "\u79BB\u7EBF")
        }
      ),
      /* @__PURE__ */ jsx8("div", { className: "flex-1" }),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          onClick: () => setShowProtocolTemplates(true),
          className: "p-1.5 rounded-md hover:bg-background-hover text-text-tertiary",
          title: t("protocolTemplates", "\u534F\u8BAE\u6A21\u677F\u7BA1\u7406"),
          children: /* @__PURE__ */ jsx8(FileText, { size: 14 })
        }
      ),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          onClick: () => setShowTemplates(true),
          className: "p-1.5 rounded-md hover:bg-background-hover text-text-tertiary",
          title: t("templates", "\u63D0\u793A\u8BCD\u6A21\u677F\u7BA1\u7406"),
          children: /* @__PURE__ */ jsx8(History, { size: 14 })
        }
      ),
      /* @__PURE__ */ jsx8(
        "button",
        {
          type: "button",
          onClick: () => setDrawerOpen(true),
          className: "p-1.5 rounded-md hover:bg-background-hover text-text-tertiary",
          title: t("history", "\u6267\u884C\u65E5\u5FD7"),
          children: /* @__PURE__ */ jsx8(RefreshCw, { size: 14 })
        }
      ),
      /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          onClick: () => {
            setEditingTask(null);
            setShowEditor(true);
          },
          className: "flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90",
          children: [
            /* @__PURE__ */ jsx8(Plus, { size: 13 }),
            t("newTask", "\u65B0\u5EFA\u4EFB\u52A1")
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-1.5 px-3 py-1.5 border-b border-border text-xs shrink-0", children: [
      /* @__PURE__ */ jsx8(
        "input",
        {
          value: search,
          onChange: (e) => setSearch(e.target.value),
          placeholder: t("search", "\u641C\u7D22\u4EFB\u52A1..."),
          className: "flex-1 min-w-0 px-2 py-1 rounded-md bg-background-base border border-border text-xs outline-none focus:border-border-strong"
        }
      ),
      /* @__PURE__ */ jsxs8(
        "select",
        {
          value: filterStatus,
          onChange: (e) => setFilterStatus(e.target.value),
          className: "px-1.5 py-1 rounded-md bg-background-base border border-border text-xs",
          children: [
            /* @__PURE__ */ jsx8("option", { value: "all", children: t("filter.all", "\u5168\u90E8") }),
            /* @__PURE__ */ jsx8("option", { value: "enabled", children: t("filter.enabled", "\u5DF2\u542F\u7528") }),
            /* @__PURE__ */ jsx8("option", { value: "disabled", children: t("filter.disabled", "\u5DF2\u7981\u7528") }),
            /* @__PURE__ */ jsx8("option", { value: "running", children: t("status.running", "\u6267\u884C\u4E2D") }),
            /* @__PURE__ */ jsx8("option", { value: "success", children: t("status.success", "\u6210\u529F") }),
            /* @__PURE__ */ jsx8("option", { value: "failed", children: t("status.failed", "\u5931\u8D25") })
          ]
        }
      ),
      /* @__PURE__ */ jsxs8(
        "select",
        {
          value: sortKey,
          onChange: (e) => setSortKey(e.target.value),
          className: "px-1.5 py-1 rounded-md bg-background-base border border-border text-xs",
          children: [
            /* @__PURE__ */ jsx8("option", { value: "created", children: t("sort.created", "\u521B\u5EFA\u65F6\u95F4") }),
            /* @__PURE__ */ jsx8("option", { value: "name", children: t("sort.name", "\u540D\u79F0") }),
            /* @__PURE__ */ jsx8("option", { value: "nextRun", children: t("sort.nextRun", "\u4E0B\u6B21\u6267\u884C") }),
            /* @__PURE__ */ jsx8("option", { value: "lastRun", children: t("sort.lastRun", "\u4E0A\u6B21\u6267\u884C") })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx8("div", { className: "flex-1 overflow-y-auto", children: loading ? /* @__PURE__ */ jsx8("div", { className: "px-4 py-8 text-center text-xs text-text-tertiary", children: t("loading", "\u52A0\u8F7D\u4E2D...") }) : error ? /* @__PURE__ */ jsx8("div", { className: "px-4 py-8 text-center text-xs text-danger", children: error }) : filtered.length === 0 ? /* @__PURE__ */ jsx8("div", { className: "px-4 py-8 text-center text-xs text-text-tertiary", children: tasks.length === 0 ? t("empty", "\u6682\u65E0\u5B9A\u65F6\u4EFB\u52A1") : t("noMatch", "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1") }) : /* @__PURE__ */ jsx8("div", { className: "flex flex-col gap-1.5 px-2 py-2", children: filtered.map((task) => /* @__PURE__ */ jsx8(
      TaskCard,
      {
        task,
        running: running === task.id,
        onRun: () => handleRun(task),
        onToggle: () => handleToggle(task),
        onEdit: () => {
          setEditingTask(task);
          setShowEditor(true);
        },
        onDelete: () => handleDelete(task),
        onShowLog: () => {
          setDrawerTask(task);
          setDrawerOpen(true);
        }
      },
      task.id
    )) }) }),
    showEditor && /* @__PURE__ */ jsx8(
      TaskEditor,
      {
        task: editingTask,
        templates: data.templates,
        protocolTemplates: data.protocolTemplates,
        onClose: () => setShowEditor(false)
      }
    ),
    showTemplates && /* @__PURE__ */ jsx8(TemplateManager, { templates: data.templates, onClose: () => setShowTemplates(false) }),
    showProtocolTemplates && /* @__PURE__ */ jsx8(
      ProtocolTemplateManager,
      {
        templates: data.protocolTemplates,
        onClose: () => setShowProtocolTemplates(false)
      }
    ),
    /* @__PURE__ */ jsx8(
      ExecutionLogDrawer,
      {
        open: drawerOpen,
        task: drawerTask,
        hist,
        onClose: () => {
          setDrawerOpen(false);
          setDrawerTask(null);
        }
      }
    ),
    /* @__PURE__ */ jsx8(ToastHost, {})
  ] });
}

// src/index.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
function AiSchedulerPanel() {
  return /* @__PURE__ */ jsx9(Panel, {});
}
export {
  Panel,
  AiSchedulerPanel as default
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/defaultAttributes.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/Icon.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/createLucideIcon.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-check.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/circle-x.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/clock.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/eye.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/file-text.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/globe.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/history.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/loader-circle.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/message-square.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/pause.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/pencil.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/play.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/plus.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/refresh-cw.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/terminal.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/trash-2.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/icons/x.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.462.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
