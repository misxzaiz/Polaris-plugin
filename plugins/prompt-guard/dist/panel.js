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

// shared/injection-core.js
var require_injection_core = __commonJS({
  "shared/injection-core.js"(exports, module) {
    "use strict";
    var RULES = [
      {
        id: "override",
        category: "\u6307\u4EE4\u8986\u76D6",
        weight: 3,
        pattern: /(?:ignore|disregard|forget)[\s\S]{0,30}(?:previous|prior|above|earlier|all)[\s\S]{0,20}(?:instruction|prompt|rule|direction)|忽略(?:之前|以上|上述|前面)[\s\S]{0,6}(?:指令|提示|规则|内容)|无视(?:上述|以上|之前|系统)|把?(?:之前|以上|上述)(?:的)?(?:指令|规则|设定)[\s\S]{0,6}(?:忽略|无视|清除)/i,
        desc: "\u8981\u6C42\u6A21\u578B\u65E0\u89C6\u5148\u524D\u6307\u4EE4\u2014\u2014prompt injection \u6700\u5178\u578B\u5F00\u573A"
      },
      {
        id: "role-hijack",
        category: "\u89D2\u8272\u52AB\u6301",
        weight: 3,
        pattern: /(?:you are now|from now on you are|act as|pretend to be|new persona)[\s\S]{0,40}(?:a|an|the)?[\s\S]{0,30}(?:different|new|unrestricted|jailbreak|DAN)|从现在起你是|你现在是一个|请扮演|假装你是|换个身份/i,
        desc: "\u8BD5\u56FE\u6539\u5199\u6A21\u578B\u89D2\u8272\u8BBE\u5B9A"
      },
      {
        id: "system-probe",
        category: "\u7CFB\u7EDF\u63D0\u793A\u8BCD\u63A2\u6D4B",
        weight: 3,
        // 探测类不做语序假设：「系统提示词」词组与「输出类动词」同文即算（词组本身出现已值得标记）
        pattern: /(?:reveal|print|show|repeat|output|display)[\s\S]{0,25}(?:your )?(?:system prompt|initial instruction|hidden prompt|rules above)|系统提示词?[\s\S]{0,12}(?:输出|打印|显示|复述|重复|泄露|原样|给我看|发我)|泄露(?:你的)?(?:系统提示|设定)|你的(?:初始指令|隐藏指令|系统设定)/i,
        desc: "\u63A2\u6D4B/\u5957\u53D6\u7CFB\u7EDF\u63D0\u793A\u8BCD"
      },
      {
        id: "tool-induction",
        category: "\u5DE5\u5177\u8C03\u7528\u8BF1\u5BFC",
        weight: 2,
        pattern: /(?:call|invoke|use|run|execute)[\s\S]{0,30}(?:the )?[\w-]*tool|调用(?:工具|函数)|执行(?:命令|以下命令|该命令)|运行(?:此|该|以下)(?:命令|脚本)/i,
        desc: "\u8BF1\u5BFC\u6A21\u578B\u8C03\u7528\u5DE5\u5177/\u6267\u884C\u547D\u4EE4"
      },
      {
        id: "exfil-instruction",
        category: "\u6570\u636E\u5916\u6CC4\u6307\u4EE4",
        weight: 3,
        pattern: /(?:send|post|upload|export|forward|email)[\s\S]{0,40}(?:https?:\/\/|to\s+[\w.-]+@)|(?:发送|上传|导出|转发)(?:到|至|给)[\s\S]{0,30}(?:https?:\/\/|网址|邮箱|服务器)|访问.{0,20}https?:\/\/[\w.-]+\.[a-z]{2,}\/\?[\w=]/i,
        desc: "\u6307\u793A\u628A\u4E0A\u4E0B\u6587/\u6570\u636E\u53D1\u5F80\u5916\u90E8\u5730\u5740"
      },
      {
        id: "jailbreak",
        category: "\u8D8A\u72F1\u6A21\u5F0F",
        weight: 3,
        pattern: /\bDAN\b|developer mode[\s\S]{0,20}(?:enabled|on|activated)|jailbreak|AIM:|OpenAI.{0,10}policy.{0,20}(?:ignore|bypass)|越狱|开发者模式(?:已|已启用|开启)/i,
        desc: "\u77E5\u540D\u8D8A\u72F1\u6846\u67B6/\u5F00\u53D1\u8005\u6A21\u5F0F\u4F2A\u9020"
      },
      {
        id: "tag-injection",
        category: "\u6807\u7B7E/\u5206\u9694\u7B26\u6CE8\u5165",
        weight: 2,
        pattern: /<\/?(?:system|assistant|user|tool|function[_-]results?)>|\[SYSTEM\]|\[INST\]|^#{2,5}\s*(?:system|instructions?|rules?)\s*$|\b={3,}\b[\s\S]{0,40}(?:instruction|rule|命令|规则)/im,
        desc: "\u4F2A\u9020\u7CFB\u7EDF/\u5BF9\u8BDD\u6807\u7B7E\u6216\u5206\u9694\u7B26\u5757"
      },
      {
        id: "fake-system",
        category: "System \u5192\u5145",
        weight: 2,
        pattern: /(?:^|\n)\s*(?:System|SYSTEM|系统)\s*[:：]|<\|?(?:im_start|im_end|system)\|?>/m,
        desc: "\u5192\u5145 System \u6D88\u606F\u8FB9\u754C"
      },
      {
        id: "context-drain",
        category: "\u4E0A\u4E0B\u6587\u7A83\u53D6",
        weight: 2,
        // 双向语序：动词在前（Summarize everything above）与宾语在前（把以上内容复述）都覆盖
        pattern: /(?:summarize|repeat|output|paste|copy)[\s\S]{0,30}(?:everything|all text|the entire|whole conversation|above)|把?以上(?:全部)?[\s\S]{0,6}(?:内容|对话|文本|说的)[\s\S]{0,10}(?:复述|总结|输出|粘贴|重复)|(?:复述|总结|输出|粘贴)(?:一遍)?(?:我们刚才|以上|上面)(?:说|聊)?(?:的)?(?:全部)?(?:内容|对话)/i,
        desc: "\u8BF1\u5BFC\u503E\u5012\u5168\u90E8\u4E0A\u4E0B\u6587"
      },
      {
        id: "step-chain",
        category: "\u591A\u6B65\u8BF1\u5BFC\u94FE",
        weight: 2,
        pattern: /(?:step\s*1|first)[\s\S]{0,60}(?:ignore|disregard|bypass)[\s\S]{0,60}(?:step\s*2|then|next)|(?:首先|第一步)[\s\S]{0,40}(?:忽略|无视|绕过)[\s\S]{0,40}(?:然后|第二步|接着)/i,
        desc: "\u5206\u6B65\u5FFD\u7565-\u6267\u884C\u8BF1\u5BFC\u94FE"
      },
      {
        id: "sensitive-cmd",
        category: "\u5371\u9669\u64CD\u4F5C\u8BF1\u5BFC",
        weight: 2,
        pattern: /(?:delete|remove|format|wipe|shutdown|disable)[\s\S]{0,25}(?:all files|disk|firewall|database|folder)|(?:删除|格式化|清空|关闭|停用)(?:所有文件|磁盘|防火墙|数据库|全部数据|系统)/i,
        desc: "\u8BF1\u5BFC\u751F\u6210\u5371\u9669\u7CFB\u7EDF\u64CD\u4F5C"
      },
      {
        id: "codefence-escape",
        category: "\u4EE3\u7801\u5757\u9003\u9038",
        weight: 1,
        pattern: /```[\s\S]{0,200}```\s*(?:[^`\n]{0,20}(?:instruction|ignore|execute|run|调用|执行|忽略))/i,
        desc: "\u4EE3\u7801\u5757\u95ED\u5408\u540E\u7D27\u8DDF\u6307\u4EE4"
      },
      {
        id: "policy-poke",
        category: "\u653F\u7B56\u8BD5\u63A2",
        weight: 1,
        pattern: /(?:what are your|list your)[\s\S]{0,20}(?:rules|restrictions|limitations|policies)|你(?:有)?(?:什么)?(?:限制|规则|底线|原则)/i,
        desc: "\u8BD5\u63A2\u6A21\u578B\u9650\u5236\u8FB9\u754C\uFF08\u5F31\u4FE1\u53F7\uFF09"
      },
      {
        id: "payload-b64",
        category: "\u7F16\u7801\u8F7D\u8377",
        weight: 2,
        pattern: /[A-Za-z0-9+/=]{60,}(?:\.[A-Za-z0-9+/=]{20,})?/,
        desc: "\u957F base64/hex \u5757\u2014\u2014\u53EF\u7591\u7F16\u7801\u8F7D\u8377\uFF08\u9700\u7ED3\u5408\u4E0A\u4E0B\u6587\u5224\u65AD\uFF09"
      },
      {
        id: "invisible-chars",
        category: "\u4E0D\u53EF\u89C1\u5B57\u7B26",
        weight: 2,
        pattern: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/,
        desc: "\u96F6\u5BBD/\u53CC\u5411\u63A7\u5236\u5B57\u7B26\u2014\u2014\u9690\u85CF\u6307\u4EE4\u4E0E\u6587\u672C\u6DF7\u6DC6\u5E38\u7528\u8F7D\u4F53"
      }
    ];
    var LEVELS = { clean: 0, suspicious: 1, dangerous: 3 };
    var PREVIEW_CAP = 60;
    function checkText2(text) {
      const raw = String(text == null ? "" : text);
      const findings = [];
      let score = 0;
      for (const rule of RULES) {
        let count = 0;
        let first = "";
        if (rule.id === "invisible-chars") {
          const matches = raw.match(new RegExp(rule.pattern.source, "g")) || [];
          count = matches.length;
          if (count > 0) first = matches.slice(0, 5).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
        } else {
          const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
          const matches = raw.match(re);
          count = matches ? matches.length : 0;
          if (count > 0) first = matches[0];
        }
        if (count > 0) {
          score += rule.weight * Math.min(count, 3);
          findings.push({
            ruleId: rule.id,
            category: rule.category,
            weight: rule.weight,
            count,
            preview: truncate(String(first).replace(/\s+/g, " ").trim(), PREVIEW_CAP)
          });
        }
      }
      findings.sort((a, b) => b.weight * b.count - a.weight * a.count);
      const level = score >= LEVELS.dangerous ? "dangerous" : score >= LEVELS.suspicious ? "suspicious" : "clean";
      return { level, score, findings, ruleCount: RULES.length };
    }
    function listRules2() {
      return RULES.map((r) => ({ id: r.id, category: r.category, weight: r.weight, desc: r.desc }));
    }
    function truncate(s, cap) {
      return s.length <= cap ? s : s.slice(0, cap) + "\u2026";
    }
    function levelLabel2(level) {
      return level === "dangerous" ? "\u5371\u9669" : level === "suspicious" ? "\u53EF\u7591" : "\u5E72\u51C0";
    }
    module.exports = {
      RULES,
      LEVELS,
      PREVIEW_CAP,
      checkText: checkText2,
      listRules: listRules2,
      truncate,
      levelLabel: levelLabel2
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_injection_core());
import { useMemo, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.pg-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pg-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pg-head b{font-size:13px}
.pg-head .sub{color:#5C6678;font-size:11px}
.pg-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.pg-tabs{display:flex;gap:6px}
.pg-tab{background:#20263A;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.pg-tab.on{background:#2b3348;color:#E6EAF2;border-color:#3a4358}
.pg-area{width:100%;min-height:160px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.pg-area:focus{border-color:#4fd1a0}
.pg-meta{display:flex;gap:12px;color:#5C6678;font-size:11px}
.pg-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.pg-verdict.clean{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.pg-verdict.suspicious{background:#2b2413;border-color:#e8590c;color:#f3b377}
.pg-verdict.dangerous{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.pg-verdict b{font-size:13px}
.pg-finds{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.pg-finds table{width:100%;border-collapse:collapse;font-size:11.5px}
.pg-finds th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:6px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.pg-finds td{padding:7px 10px;border-bottom:1px solid #161c2a;vertical-align:top}
.pg-finds tr:last-child td{border-bottom:none}
.pg-prev{font-family:ui-monospace,Consolas,monospace;color:#c9cede;word-break:break-all}
.pg-rule{padding:7px 10px;border-bottom:1px solid #161c2a;font-size:11.5px;display:flex;gap:8px;align-items:baseline}
.pg-rule:last-child{border-bottom:none}
.pg-w{color:#9f9aF0;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.pg-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function PromptGuardPanel(_props) {
  const [tab, setTab] = useState("test");
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(null);
  const result = useMemo(() => checked !== null ? core.checkText(checked) : null, [checked]);
  const run = () => setChecked(text);
  const rules = useMemo(() => core.listRules(), []);
  return /* @__PURE__ */ jsxs("div", { className: "pg-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "pg-head", children: [
      /* @__PURE__ */ jsx("b", { children: "\u9632\u6CE8\u5165\u68C0\u67E5\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "Prompt injection \u98CE\u9669\u68C0\u6D4B \xB7 \u7EAF\u672C\u5730 \xB7 \u6587\u672C\u4E0D\u51FA\u672C\u673A" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "pg-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "pg-tabs", children: [
        /* @__PURE__ */ jsx("button", { className: `pg-tab ${tab === "test" ? "on" : ""}`, onClick: () => setTab("test"), children: "\u68C0\u6D4B" }),
        /* @__PURE__ */ jsxs("button", { className: `pg-tab ${tab === "rules" ? "on" : ""}`, onClick: () => setTab("rules"), children: [
          "\u89C4\u5219\uFF08",
          rules.length,
          "\uFF09"
        ] })
      ] }),
      tab === "test" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          "textarea",
          {
            className: "pg-area",
            placeholder: "\u7C98\u8D34\u5F85\u68C0\u6587\u672C\uFF1A\u7F51\u9875\u6293\u53D6\u5185\u5BB9 / \u6587\u4EF6\u5185\u5BB9 / \u4EFB\u4F55\u5C06\u5582\u7ED9 AI \u7684\u5916\u90E8\u6587\u672C\u2026\u2026",
            value: text,
            onChange: (e) => setText(e.target.value)
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "pg-meta", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            text.length,
            " \u5B57\u7B26"
          ] }),
          /* @__PURE__ */ jsxs("span", { children: [
            "\u89C4\u5219 ",
            rules.length,
            " \u6761"
          ] }),
          /* @__PURE__ */ jsx("span", { children: "\u7EAF\u672C\u5730\u6B63\u5219+\u542F\u53D1\u5F0F\uFF0C\u65E0\u6A21\u578B\u8C03\u7528" })
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "pg-tab on",
            style: { alignSelf: "flex-start", padding: "6px 18px" },
            onClick: run,
            disabled: !text.trim(),
            children: "\u68C0\u6D4B"
          }
        ),
        result && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: `pg-verdict ${result.level}`, children: [
            /* @__PURE__ */ jsx("b", { children: core.levelLabel(result.level) }),
            "\uFF08",
            result.level,
            "\uFF09\xB7 \u98CE\u9669\u5206 ",
            result.score,
            " \xB7 ",
            "\u547D\u4E2D ",
            result.findings.length,
            " \u6761\u89C4\u5219",
            result.level === "dangerous" && " \u2014\u2014 \u5EFA\u8BAE\u4E0D\u8981\u76F4\u63A5\u5582\u7ED9\u4E3B\u5BF9\u8BDD\u6A21\u578B"
          ] }),
          result.findings.length > 0 && /* @__PURE__ */ jsx("div", { className: "pg-finds", children: /* @__PURE__ */ jsxs("table", { children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { children: "\u7C7B\u522B" }),
              /* @__PURE__ */ jsx("th", { children: "\u89C4\u5219" }),
              /* @__PURE__ */ jsx("th", { className: "num", children: "\u6743\u91CD\xD7\u6B21\u6570" }),
              /* @__PURE__ */ jsx("th", { children: "\u547D\u4E2D\u7247\u6BB5\uFF08\u8131\u654F\u622A\u65AD\uFF09" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: result.findings.map((f) => /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { children: f.category }),
              /* @__PURE__ */ jsx("td", { children: f.ruleId }),
              /* @__PURE__ */ jsxs("td", { className: "num", children: [
                f.weight,
                "\xD7",
                f.count
              ] }),
              /* @__PURE__ */ jsx("td", { className: "pg-prev", children: f.preview })
            ] }, f.ruleId)) })
          ] }) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "pg-note", children: "\u5C40\u9650\uFF08\u5982\u5B9E\uFF09\uFF1A\u7EAF\u89C4\u5219+\u542F\u53D1\u5F0F\u80FD\u62E6\u5E38\u89C1\u5DF2\u77E5\u6A21\u5F0F\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u8BED\u4E49\u7EA7\u5224\u65AD\uFF1B\u5206\u6570\u9AD8\u2260\u5FC5\u7136\u653B\u51FB\uFF0C\u5206\u6570\u4F4E\u2260\u7EDD\u5BF9\u5B89\u5168\u3002\u9AD8\u98CE\u9669\u6765\u6E90\uFF08\u7F51\u9875/\u964C\u751F\u6587\u4EF6\uFF09\u5EFA\u8BAE\u7ED3\u5408\u4EBA\u5DE5\u590D\u6838\u3002" })
      ] }),
      tab === "rules" && /* @__PURE__ */ jsx("div", { className: "pg-finds", children: rules.map((r) => /* @__PURE__ */ jsxs("div", { className: "pg-rule", children: [
        /* @__PURE__ */ jsxs("span", { className: "pg-w", children: [
          "w",
          r.weight
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("b", { children: r.id }),
          "\uFF08",
          r.category,
          "\uFF09\u2014\u2014 ",
          r.desc
        ] })
      ] }, r.id)) })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function PromptGuardEntry(props) {
  return /* @__PURE__ */ jsx2(PromptGuardPanel, { ...props });
}
export {
  PromptGuardEntry as default
};
