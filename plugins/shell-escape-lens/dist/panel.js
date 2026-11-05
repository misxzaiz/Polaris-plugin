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

// shared/escape-core.js
var require_escape_core = __commonJS({
  "shared/escape-core.js"(exports, module) {
    "use strict";
    var SHELLS = ["bash", "powershell", "cmd"];
    function quoteBash(text) {
      const s = String(text == null ? "" : text);
      return "'" + s.replace(/'/g, "'\\''") + "'";
    }
    var BASH_DQ_SPECIAL = '$`"\\';
    function quoteBashDouble(text) {
      const s = String(text == null ? "" : text);
      return '"' + s.replace(/[$`"\\]/g, "\\$&") + '"';
    }
    function quotePowerShell(text) {
      const s = String(text == null ? "" : text);
      return "'" + s.replace(/'/g, "''") + "'";
    }
    function quotePowerShellDouble(text) {
      const s = String(text == null ? "" : text);
      return '"' + s.replace(/[$`"]/g, "`$&") + '"';
    }
    function quoteCmd(text) {
      const s = String(text == null ? "" : text);
      if (s.includes('"')) {
        return { text: '"' + s.replace(/"/g, '""') + '"', caveat: 'cmd \u5185\u90E8\u53CC\u5F15\u53F7\u65E0\u5E72\u51C0\u8F6C\u4E49\uFF1A"" \u5F62\u6001\u5728\u591A\u6570\u8C03\u7528\u65B9\u53EF\u884C\uFF0C\u4F46\u4E0D\u540C\u7A0B\u5E8F\u89E3\u6790\u4E0D\u4E00\u2014\u2014\u5EFA\u8BAE\u6539\u5199\u907F\u514D\u53CC\u5F15\u53F7' };
      }
      return { text: '"' + s + '"', caveat: "" };
    }
    var BT = "`";
    function specialCharTable(text) {
      const s = String(text == null ? "" : text);
      const chars = ["$" + BT + `"\\'!%|&;<>()^*`, " ", "	", "\n"];
      const notes = {
        "$": { bash: "\u53CC\u5F15\u53F7\u5185\u53D8\u91CF\u5C55\u5F00\uFF08\u5355\u5F15\u53F7\u5B89\u5168\uFF09", powershell: "\u53CC\u5F15\u53F7\u5185\u53D8\u91CF\u5C55\u5F00", cmd: "\u4EC5 %VAR% \u5F62\u5F0F\u5C55\u5F00" },
        [BT]: { bash: "\u53CC\u5F15\u53F7\u5185\u547D\u4EE4\u66FF\u6362", powershell: "\u8F6C\u4E49\u7B26\uFF08\u517C\u53CC\u5F15\u53F7\u8F6C\u4E49\u524D\u7F00\uFF09", cmd: "\u65E0\u7279\u6B8A\u4E49" },
        '"': { bash: "\u53CC\u5F15\u53F7\u5B9A\u754C\uFF08\u5185\u9700\u53CD\u659C\u6760\u8F6C\u4E49\uFF09", powershell: "\u53CC\u5F15\u53F7\u5B9A\u754C\uFF08\u5185\u9700\u53CD\u5F15\u53F7\u8F6C\u4E49\uFF09", cmd: "\u5B9A\u754C\u7B26\u2014\u2014\u5185\u90E8\u8F6C\u4E49\u6A21\u7CCA\u533A" },
        "'": { bash: "\u5355\u5F15\u53F7\u5B9A\u754C\uFF08\u95ED\u5408\u7EED\u63A5\u8F6C\u4E49\uFF09", powershell: "\u5355\u5F15\u53F7\u5B9A\u754C\uFF08'' \u7FFB\u500D\uFF09", cmd: "\u65E0\u7279\u6B8A\u4E49" },
        "\\": { bash: "\u53CC\u5F15\u53F7\u5185\u8F6C\u4E49\u524D\u7F00", powershell: "\u65E0\u7279\u6B8A\u4E49\uFF08\u9664\u8DEF\u5F84\u5C3E\uFF09", cmd: "\u53CC\u91CD\u5904\u7406\uFF0C\u8DEF\u5F84\u614E\u7528" },
        "!": { bash: "\u4EA4\u4E92 shell \u5386\u53F2\u5C55\u5F00\uFF08\u811A\u672C\u5B89\u5168\uFF09", powershell: "\u65E0\u7279\u6B8A\u4E49", cmd: "\u65E0\u7279\u6B8A\u4E49" },
        "%": { bash: "\u65E0\u7279\u6B8A\u4E49", powershell: "\u65E0\u7279\u6B8A\u4E49", cmd: "%VAR% \u53D8\u91CF\u5C55\u5F00" },
        "|": { bash: "\u7BA1\u9053\uFF08\u5F15\u53F7\u5916\uFF09", powershell: "\u7BA1\u9053\uFF08\u5F15\u53F7\u5916\uFF09", cmd: "\u7BA1\u9053\uFF08^| \u8F6C\u4E49\uFF09" },
        "&": { bash: "\u540E\u53F0/\u987A\u5E8F\uFF08\u5F15\u53F7\u5916\uFF09", powershell: "\u8C03\u7528\u8FD0\u7B97\u7B26", cmd: "\u987A\u5E8F\u6267\u884C\uFF08^& \u8F6C\u4E49\uFF09" },
        ";": { bash: "\u547D\u4EE4\u5206\u9694", powershell: "\u547D\u4EE4\u5206\u9694", cmd: "\u65E0\u5206\u9694\u4E49" },
        "<": { bash: "\u91CD\u5B9A\u5411", powershell: "\u4FDD\u7559\uFF08\u672A\u5B9E\u73B0\u91CD\u5B9A\u5411\uFF09", cmd: "\u91CD\u5B9A\u5411\uFF08^< \u8F6C\u4E49\uFF09" },
        ">": { bash: "\u91CD\u5B9A\u5411", powershell: "\u91CD\u5B9A\u5411", cmd: "\u91CD\u5B9A\u5411\uFF08^> \u8F6C\u4E49\uFF09" },
        "(": { bash: "\u5B50 shell", powershell: "\u8868\u8FBE\u5F0F", cmd: "\u5206\u7EC4\uFF08^( \u8F6C\u4E49\uFF09" },
        ")": { bash: "\u5B50 shell", powershell: "\u8868\u8FBE\u5F0F", cmd: "\u5206\u7EC4\uFF08^) \u8F6C\u4E49\uFF09" },
        "^": { bash: "\u65E0\u7279\u6B8A\u4E49", powershell: "\u8F6C\u4E49\u5B57\u7B26", cmd: "\u8F6C\u4E49\u5B57\u7B26" },
        " ": { bash: "\u53C2\u6570\u5206\u9694\uFF08\u5F15\u53F7\u5305\u88F9\uFF09", powershell: "\u53C2\u6570\u5206\u9694", cmd: "\u53C2\u6570\u5206\u9694" },
        "	": { bash: "\u5206\u9694\uFF08\u5F15\u53F7\u5305\u88F9\uFF09", powershell: "\u5206\u9694", cmd: "\u5206\u9694" },
        "\n": { bash: "\u547D\u4EE4\u7ED3\u675F\uFF08\u5355\u5F15\u53F7\u5185\u5B89\u5168\uFF09", powershell: "\u547D\u4EE4\u7ED3\u675F", cmd: "\u547D\u4EE4\u7ED3\u675F\uFF08\u65E0\u6CD5\u5F15\u7528\uFF09" }
      };
      const found = [];
      const seen = /* @__PURE__ */ new Set();
      for (const ch of s) {
        if (notes[ch] && !seen.has(ch)) {
          seen.add(ch);
          found.push({ char: ch === " " ? "(\u7A7A\u683C)" : ch === "	" ? "(\u5236\u8868\u7B26)" : ch === "\n" ? "(\u6362\u884C)" : ch, ...notes[ch] });
        }
      }
      return found;
    }
    function quoteAll2(text) {
      const bash = quoteBash(text);
      const pwsh = quotePowerShell(text);
      const cmdRes = quoteCmd(text);
      return {
        bash,
        bashDouble: quoteBashDouble(text),
        powershell: pwsh,
        powershellDouble: quotePowerShellDouble(text),
        cmd: typeof cmdRes === "string" ? cmdRes : cmdRes.text,
        cmdCaveat: typeof cmdRes === "string" ? "" : cmdRes.caveat,
        specials: specialCharTable(text)
      };
    }
    function parseBash(line) {
      const s = String(line == null ? "" : line);
      const argv = [];
      let cur = "";
      let hasCur = false;
      let i = 0;
      let inSingle = false;
      let inDouble = false;
      while (i < s.length) {
        const ch = s[i];
        if (inSingle) {
          if (ch === "'") {
            inSingle = false;
          } else {
            cur += ch;
            hasCur = true;
          }
          i++;
          continue;
        }
        if (inDouble) {
          if (ch === '"') {
            inDouble = false;
            i++;
            continue;
          }
          if (ch === "\\" && BASH_DQ_SPECIAL.includes(s[i + 1])) {
            cur += s[i + 1];
            hasCur = true;
            i += 2;
            continue;
          }
          cur += ch;
          hasCur = true;
          i++;
          continue;
        }
        if (ch === "'") {
          inSingle = true;
          i++;
          continue;
        }
        if (ch === '"') {
          inDouble = true;
          i++;
          continue;
        }
        if (ch === "\\") {
          if (i + 1 < s.length) {
            cur += s[i + 1];
            hasCur = true;
            i += 2;
            continue;
          }
          i++;
          continue;
        }
        if (ch === " " || ch === "	" || ch === "\n") {
          if (hasCur) {
            argv.push(cur);
            cur = "";
            hasCur = false;
          }
          i++;
          continue;
        }
        if (ch === "#" && !hasCur) break;
        cur += ch;
        hasCur = true;
        i++;
      }
      if (inSingle || inDouble) return { ok: false, error: `\u672A\u95ED\u5408\u7684 ${inSingle ? "\u5355\u5F15\u53F7" : "\u53CC\u5F15\u53F7"}\u5B57\u7B26\u4E32` };
      if (hasCur) argv.push(cur);
      return { ok: true, argv };
    }
    function parsePowerShell(line) {
      const s = String(line == null ? "" : line);
      const argv = [];
      let cur = "";
      let hasCur = false;
      let i = 0;
      let inSingle = false;
      let inDouble = false;
      while (i < s.length) {
        const ch = s[i];
        if (inSingle) {
          if (ch === "'" && s[i + 1] === "'") {
            cur += "'";
            hasCur = true;
            i += 2;
            continue;
          }
          if (ch === "'") {
            inSingle = false;
            i++;
            continue;
          }
          cur += ch;
          hasCur = true;
          i++;
          continue;
        }
        if (inDouble) {
          if (ch === BT && i + 1 < s.length) {
            cur += s[i + 1];
            hasCur = true;
            i += 2;
            continue;
          }
          if (ch === '"') {
            if (s[i + 1] === '"') {
              cur += '"';
              hasCur = true;
              i += 2;
              continue;
            }
            inDouble = false;
            i++;
            continue;
          }
          cur += ch;
          hasCur = true;
          i++;
          continue;
        }
        if (ch === "'") {
          inSingle = true;
          i++;
          continue;
        }
        if (ch === '"') {
          inDouble = true;
          i++;
          continue;
        }
        if (ch === " " || ch === "	" || ch === "\n") {
          if (hasCur) {
            argv.push(cur);
            cur = "";
            hasCur = false;
          }
          i++;
          continue;
        }
        if (ch === "#" && !hasCur) break;
        cur += ch;
        hasCur = true;
        i++;
      }
      if (inSingle || inDouble) return { ok: false, error: `\u672A\u95ED\u5408\u7684 ${inSingle ? "\u5355\u5F15\u53F7" : "\u53CC\u5F15\u53F7"}\u5B57\u7B26\u4E32` };
      if (hasCur) argv.push(cur);
      return { ok: true, argv };
    }
    function parseCmd(line) {
      const s = String(line == null ? "" : line);
      const argv = [];
      let cur = "";
      let hasCur = false;
      let i = 0;
      let inDouble = false;
      while (i < s.length) {
        const ch = s[i];
        if (inDouble) {
          if (ch === '"') {
            inDouble = false;
            i++;
            continue;
          }
          cur += ch;
          hasCur = true;
          i++;
          continue;
        }
        if (ch === '"') {
          inDouble = true;
          i++;
          continue;
        }
        if (ch === "^" && i + 1 < s.length) {
          cur += s[i + 1];
          hasCur = true;
          i += 2;
          continue;
        }
        if (ch === " " || ch === "	") {
          if (hasCur) {
            argv.push(cur);
            cur = "";
            hasCur = false;
          }
          i++;
          continue;
        }
        cur += ch;
        hasCur = true;
        i++;
      }
      if (inDouble) return { ok: false, error: "\u672A\u95ED\u5408\u7684\u53CC\u5F15\u53F7\u5B57\u7B26\u4E32" };
      if (hasCur) argv.push(cur);
      return { ok: true, argv };
    }
    var PARSERS2 = { bash: parseBash, powershell: parsePowerShell, cmd: parseCmd };
    function renderQuoteReport(text) {
      const q = quoteAll2(text);
      const lines = ["\u4E09 shell \u5B89\u5168\u5F15\u7528\u5BF9\u7167\uFF1A", `  bash:       ${q.bash}`];
      if (q.bashDouble !== q.bash) lines.push(`  bash(\u53CC\u5F15\u53F7): ${q.bashDouble}  \uFF08$ \` " \\ \u9700\u8F6C\u4E49\uFF09`);
      lines.push(`  powershell: ${q.powershell}`, `  cmd:        ${q.cmd}`);
      if (q.cmdCaveat) lines.push(`  \u26A0 cmd: ${q.cmdCaveat}`);
      if (q.specials.length) {
        lines.push("\u6587\u672C\u4E2D\u7684\u7279\u6B8A\u5B57\u7B26\u8BED\u4E49\uFF1A");
        for (const sp of q.specials) {
          lines.push(`  ${sp.char}  bash=${sp.bash} \xB7 powershell=${sp.powershell} \xB7 cmd=${sp.cmd}`);
        }
      }
      return lines.join("\n");
    }
    function pwshSafe(q) {
      return q.powershell;
    }
    module.exports = {
      SHELLS,
      quoteBash,
      quoteBashDouble,
      quotePowerShell,
      quotePowerShellDouble,
      quoteCmd,
      specialCharTable,
      quoteAll: quoteAll2,
      renderQuoteReport,
      pwshSafe,
      parseBash,
      parsePowerShell,
      parseCmd,
      PARSERS: PARSERS2
    };
  }
});

// src/Panel.tsx
var core = __toESM(require_escape_core());
import { useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.se-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.se-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.se-head b{font-size:13px}
.se-head .sub{color:#5C6678;font-size:11px}
.se-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.se-area{width:100%;min-height:110px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.se-area:focus{border-color:#4fd1a0}
.se-row{display:flex;gap:8px;align-items:center}
.se-input{flex:1;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;outline:none}
.se-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer}
.se-btn:disabled{opacity:.5;cursor:not-allowed}
.se-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.se-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.se-quote{padding:8px 12px;font:12px/1.7 ui-monospace,Consolas,monospace;word-break:break-all}
.se-quote .lbl{color:#8B94A9;margin-right:8px}
.se-caveat{padding:6px 12px;color:#f3b377;font-size:11.5px}
.se-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.se-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333}
.se-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.se-argv{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.8 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#8ce0b0}
.se-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function ShellEscapeLensPanel(_props) {
  const [text, setText] = useState("");
  const [line, setLine] = useState("");
  const [shell, setShell] = useState("bash");
  const [quoted, setQuoted] = useState(null);
  const [parsed, setParsed] = useState(null);
  const quoteResult = useMemo(() => {
    if (quoted === null) return null;
    return core.quoteAll(quoted);
  }, [quoted]);
  const parseResult = useMemo(() => {
    if (parsed === null) return null;
    const parsers = core.PARSERS;
    const parser = parsers[shell];
    return parser(parsed);
  }, [parsed, shell]);
  return /* @__PURE__ */ jsxs("div", { className: "se-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "se-head", children: [
      /* @__PURE__ */ jsx("b", { children: "Shell \u8F6C\u4E49\u5BF9\u7167\u53F0" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "bash/cmd/powershell \u5F15\u7528\u5BF9\u7167 \xB7 argv \u8FD8\u539F \xB7 bash round-trip \u5B9E\u6D4B\u951A\u5B9A" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "se-body", children: [
      /* @__PURE__ */ jsx("div", { className: "se-label", style: { color: "#8B94A9", fontSize: 11 }, children: "\u5F85\u5F15\u7528\u6587\u672C" }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "se-area",
          placeholder: 'say $HOME `id` "quoted" | stop',
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "se-btn", style: { alignSelf: "flex-start" }, onClick: () => setQuoted(text), disabled: !text.trim(), children: "\u5BF9\u7167" }),
      quoteResult && /* @__PURE__ */ jsxs("div", { className: "se-card", children: [
        /* @__PURE__ */ jsx("h3", { children: "\u4E09 shell \u5B89\u5168\u5F15\u7528\u5BF9\u7167" }),
        /* @__PURE__ */ jsxs("div", { className: "se-quote", children: [
          /* @__PURE__ */ jsx("span", { className: "lbl", children: "bash:" }),
          quoteResult.bash
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "se-quote", children: [
          /* @__PURE__ */ jsx("span", { className: "lbl", children: "powershell:" }),
          quoteResult.powershell
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "se-quote", children: [
          /* @__PURE__ */ jsx("span", { className: "lbl", children: "cmd:" }),
          quoteResult.cmd
        ] }),
        quoteResult.cmdCaveat && /* @__PURE__ */ jsxs("div", { className: "se-caveat", children: [
          "\u26A0 cmd: ",
          quoteResult.cmdCaveat
        ] }),
        quoteResult.specials.length > 0 && /* @__PURE__ */ jsxs("table", { className: "se-tbl", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { children: "\u5B57\u7B26" }),
            /* @__PURE__ */ jsx("th", { children: "bash" }),
            /* @__PURE__ */ jsx("th", { children: "powershell" }),
            /* @__PURE__ */ jsx("th", { children: "cmd" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: quoteResult.specials.map((sp, i) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { children: sp.char }),
            /* @__PURE__ */ jsx("td", { children: sp.bash }),
            /* @__PURE__ */ jsx("td", { children: sp.powershell }),
            /* @__PURE__ */ jsx("td", { children: sp.cmd })
          ] }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "se-label", style: { color: "#8B94A9", fontSize: 11 }, children: "\u53CD\u5411\u89E3\u6790\uFF1A\u547D\u4EE4\u884C \u2192 argv\uFF08\u770B\u5B9E\u9645\u53C2\u6570\uFF09" }),
      /* @__PURE__ */ jsxs("div", { className: "se-row", children: [
        /* @__PURE__ */ jsx("input", { className: "se-input", value: line, onChange: (e) => setLine(e.target.value), placeholder: 'echo "hello world" plain' }),
        /* @__PURE__ */ jsxs("select", { className: "se-input", style: { width: 130 }, value: shell, onChange: (e) => setShell(e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "bash", children: "bash" }),
          /* @__PURE__ */ jsx("option", { value: "powershell", children: "powershell" }),
          /* @__PURE__ */ jsx("option", { value: "cmd", children: "cmd" })
        ] }),
        /* @__PURE__ */ jsx("button", { className: "se-btn", onClick: () => setParsed(line), disabled: !line.trim(), children: "\u89E3\u6790" })
      ] }),
      parseResult && (parseResult.ok ? /* @__PURE__ */ jsx("div", { className: "se-argv", children: (parseResult.argv ?? []).map((a, i) => `[${i}] ${a}`).join("\n") }) : /* @__PURE__ */ jsx("div", { className: "se-verdict", style: { background: "#2b1215", border: "1px solid #e03131", borderRadius: 8, padding: "8px 13px", color: "#f1a0a0" }, children: parseResult.error })),
      /* @__PURE__ */ jsx("div", { className: "se-note", children: "\u8BED\u4E49\u8FB9\u754C\uFF08\u5982\u5B9E\uFF09\uFF1Abash \u5355\u5F15\u53F7 POSIX \u5B89\u5168\u7B56\u7565\uFF08\u5185\u90E8\u65E0\u8F6C\u4E49\uFF0C' \u95ED\u5408\u7EED\u63A5\uFF09\uFF1Bpowershell \u5355\u5F15\u53F7\u7FFB\u500D\uFF1Bcmd \u5185\u90E8\u53CC\u5F15\u53F7\u65E0\u5E72\u51C0\u8F6C\u4E49\uFF08\u6A21\u7CCA\u533A\u5982\u5B9E\u6807\u6CE8\uFF09\uFF1B parse \u4E3A\u5E38\u7528\u5B50\u96C6\uFF08\u53D8\u91CF/\u547D\u4EE4\u66FF\u6362\u4E0D\u5C55\u5F00\uFF0C\u770B\u5B57\u9762\u53C2\u6570\uFF09\u3002bash \u5F15\u7528\u4EA7\u7269\u5DF2\u7528\u672C\u673A bash round-trip \u5B9E\u6D4B\u951A\u5B9A\uFF0812 \u7EC4\u5371\u9669\u6837\u672C\u5168\u5BF9\u9F50\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function ShellEscapeLensEntry(props) {
  return /* @__PURE__ */ jsx2(ShellEscapeLensPanel, { ...props });
}
export {
  ShellEscapeLensEntry as default
};
