#!/usr/bin/env node
'use strict';
/**
 * encoding-lens MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。检测/修复/转换引擎见 shared/encoding-core.js
 * （单一权威，零 node 依赖）。纯本地计算，不依赖 cap.kv/宿主——无宿主时工具照常可用。
 *
 * 四工具（前缀 elens_）：
 *   detect       字节级编码识别（文件/hex/base64 入口）：BOM + 多候选评分 + 置信度
 *   fix          mojibake 乱码修复：六条误读链尝试 + 四条终验不变式，不过不输出半成品
 *   fingerprint  乱码指纹扫描：锟斤拷/烫烫烫/â€œ 型等已知模式 + 根因解释
 *   convert      编码转换：文本→目标编码字节（hex/base64）或字节→文本（strict，不降级）
 */
const fs = require('fs');
const core = require('../shared/encoding-core');

const SERVER_NAME = 'encoding-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

const FILE_CAP = 2 * 1024 * 1024; // 2MB：字节级检测对象（编码表构建在首用时惰性，几 MB 内秒级）

/** 读文件为字节（detect/convert 字节入口用；fix/fingerprint 需先经解码层） */
function loadBytes(args) {
  if (typeof args.filePath === 'string' && args.filePath) {
    const p = String(args.filePath);
    let st;
    try { st = fs.statSync(p); } catch (_) { return { error: `文件不存在或不可读：${p}` }; }
    if (st.size > FILE_CAP) return { error: `文件过大（${st.size} 字节 > ${FILE_CAP}），请检查是否指错文件或分段处理` };
    try { return { bytes: new Uint8Array(fs.readFileSync(p)), source: p }; }
    catch (e) { return { error: `读取失败：${e.message}` }; }
  }
  if (typeof args.hex === 'string' && args.hex) {
    const b = core.hexToBytes(args.hex);
    if (!b) return { error: 'hex 无效：需为偶数长度十六进制串（空白/逗号/0x 分隔可接受）' };
    return { bytes: b, source: '内联 hex' };
  }
  if (typeof args.base64 === 'string' && args.base64) {
    const b = core.base64Decode(args.base64);
    if (!b) return { error: 'base64 无效：字母表外的字符或长度错误' };
    return { bytes: b, source: '内联 base64' };
  }
  return { error: '缺少 filePath / hex / base64 之一（字节源）' };
}

/** 统一取文本：优先内联文本，其次文件路径（node 侧按 UTF-8 读取）。 */
function loadText(args, field = 'text', pathField = 'filePath') {
  if (typeof args[field] === 'string' && args[field]) {
    return { text: args[field], source: `内联 ${field}` };
  }
  if (typeof args[pathField] === 'string' && args[pathField]) {
    const p = String(args[pathField]);
    let st;
    try { st = fs.statSync(p); } catch (_) { return { error: `文件不存在或不可读：${p}` }; }
    if (st.size > FILE_CAP) return { error: `文件过大（${st.size} 字节 > ${FILE_CAP}），请检查是否指错文件或分段处理` };
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { return { error: `读取失败：${e.message}` }; }
    return { text, source: p };
  }
  return { error: `缺少 ${field}（内联文本）或 ${pathField}（文件路径）之一` };
}

const tools = [
  {
    name: 'elens_detect',
    description: '字节级编码识别：给定文件路径或 hex/base64 字节流，判定真实编码（UTF-8/GBK/Big5/Shift_JIS/EUC-KR/UTF-16/Latin-1/Windows-1252 等），输出 BOM 检测、多候选评分排序、置信度与依据。识别引擎：UTF-8 严格校验 + 多字节族可读性评分 + EUC 系码域结构检查 + 环境先验。AI 在读取非 UTF-8 文件得到乱码前，先用本工具确认编码。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '待检测文件路径（与 hex/base64 三选一）' },
        hex: { type: 'string', description: '待检测字节流（十六进制串，与 filePath/base64 三选一）' },
        base64: { type: 'string', description: '待检测字节流（base64 串，与 filePath/hex 三选一）' },
      },
    },
    async call(args) {
      const src = loadBytes(args);
      if (src.error) return err(src.error);
      let det;
      try { det = core.detectEncoding(src.bytes); } catch (e) { return err(`检测失败：${e.message}`); }
      return ok(`${core.renderDetectReport(det)}\n\n（字节源：${src.source}）`);
    },
  },
  {
    name: 'elens_fix',
    description: 'mojibake 乱码修复：对「UTF-8 字节被按 GBK/Latin-1/CP1252/Big5/Shift_JIS/EUC-KR 误读」产生的乱码文本自动还原。六条误读链逐一尝试（重编码回字节→按正确编码解码），四条终验不变式全过才报修复成功（无 U+FFFD、无 C1 控制、可读分显著提升、round-trip 自洽），不过就如实报 uncertain/unrepairable，绝不输出半成品。也支持文件入口：自动先做字节级编码识别再修复。修复器无法处理含 U+FFFD 的不可逆损坏（会如实说明）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '乱码文本（内联，与 filePath 二选一）' },
        filePath: { type: 'string', description: '乱码文件路径（与 text 二选一；先做字节级识别再修复）' },
        outPath: { type: 'string', description: '修复结果写出路径（可选；覆盖已有文件须 overwrite=true）' },
        overwrite: { type: 'boolean', description: 'outPath 已存在时是否覆盖（默认 false）' },
      },
    },
    async call(args) {
      let report;
      const src = loadText(args);
      if (src.error) return err(src.error);
      if (src.text.length > FILE_CAP) return err('文本超 2MB，请分段修复');
      try {
        if (typeof args.filePath === 'string' && args.filePath) {
          // 文件入口：读原始字节走全链路体检（真实编码识别 → 解码 → 修复），比文本入口信息更全
          const st = fs.statSync(String(args.filePath));
          if (st.size > FILE_CAP) return err(`文件过大（${st.size} 字节 > ${FILE_CAP}）`);
          const bytes = new Uint8Array(fs.readFileSync(String(args.filePath)));
          report = core.renderInspectReport(core.inspectBytes(bytes));
        } else {
          report = core.renderFixReport(core.fixMojibake(src.text));
        }
      } catch (e) { return err(`修复失败：${e.message}`); }
      // 落盘（覆盖守护：已存在且未 overwrite 时拒绝）
      if (typeof args.outPath === 'string' && args.outPath) {
        const fix = typeof args.filePath === 'string' && args.filePath ? core.inspectBytes(new Uint8Array(fs.readFileSync(String(args.filePath)))).fix : core.fixMojibake(src.text);
        if (!fix.best || (fix.status !== 'fixed' && fix.status !== 'uncertain')) return err(report + '\n\n（未落盘：没有可写出的修复结果）');
        const out = String(args.outPath);
        let exists = false;
        try { exists = fs.existsSync(out); } catch (_) { /* ignore */ }
        if (exists && args.overwrite !== true) return err(`outPath 已存在：${out}（覆盖须 overwrite=true）`);
        try { fs.writeFileSync(out, fix.best.fixed, 'utf8'); } catch (e) { return err(`写出失败：${e.message}`); }
        report += `\n\n（修复结果已写出：${out}）`;
      }
      return ok(report + `\n\n（文本源：${src.source}）`);
    },
  },
  {
    name: 'elens_fingerprint',
    description: '乱码指纹扫描（纯诊断，不修复）：对文本扫描已知乱码模式——锟斤拷（U+FFFD 被反复转码）、烫烫烫/屯屯屯（MSVC 未初始化内存）、ä¸­æ/å¤§ç± 型（UTF-8 被按 Latin-1/GBK 误读）、â€œ 型弯引号乱码——并给出根因解释与处置建议（可自动修复 / 需回源头重取 / 非编码问题去查内存）。含特征统计（汉字/Latin 扩展/C1 控制/U+FFFD 计数与可读分）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待扫描文本（内联，与 filePath 二选一）' },
        filePath: { type: 'string', description: '待扫描文件路径（与 text 二选一；按 UTF-8 读取）' },
      },
    },
    async call(args) {
      const src = loadText(args);
      if (src.error) return err(src.error);
      if (src.text.length > FILE_CAP) return err('文本超 2MB，请分段扫描');
      let fp;
      try { fp = core.analyzeText(src.text); } catch (e) { return err(`扫描失败：${e.message}`); }
      return ok(`${core.renderFingerprintReport(fp)}\n\n（扫描源：${src.source}）`);
    },
  },
  {
    name: 'elens_convert',
    description: '编码转换（strict，不降级）：① textToBytes——把文本按目标编码编码为字节（UTF-8/GBK/Big5/Shift_JIS/EUC-KR/Latin-1/Windows-1252/UTF-16LE），输出 hex 与 base64 两种形态，无法编码的字符如实列出绝不静默替换；② bytesToText——把 hex/base64 字节流按来源编码严格解码为文本，解码失败如实报错并建议先跑 elens_detect。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['textToBytes', 'bytesToText'], description: '转换方向' },
        text: { type: 'string', description: 'mode=textToBytes 时的源文本' },
        hex: { type: 'string', description: 'mode=bytesToText 时的字节流（与 base64 二选一）' },
        base64: { type: 'string', description: 'mode=bytesToText 时的字节流（与 hex 二选一）' },
        charset: { type: 'string', description: '目标/来源编码名：utf-8/gbk/gb18030/big5/shift_jis/euc-kr/latin1/windows-1252/utf-16le（大小写与常见别名均可）' },
      },
    },
    async call(args) {
      const cs = core.normalizeCharset(args.charset);
      const KNOWN = ['utf-8', 'gbk', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'euc-jp', 'latin1', 'windows-1252', 'utf-16le'];
      if (!KNOWN.includes(cs)) return err(`不支持的编码：${args.charset}（可用：${KNOWN.join(', ')}）`);
      try {
        if (args.mode === 'textToBytes') {
          if (typeof args.text !== 'string' || !args.text) return err('textToBytes 需要 text');
          if (args.text.length > FILE_CAP) return err('文本超 2MB，请分段转换');
          const enc = core.encodeText(args.text, cs);
          if (!enc.bytes) return err(`编码 ${cs} 不支持编码方向`);
          const lines = [`## 转换结果：文本 → ${cs}`];
          lines.push(`- 字节数：${enc.bytes.length}`);
          if (enc.unsupported.length > 0) {
            const uniq = [...new Set(enc.unsupported)];
            lines.push(`- ⚠️ ${enc.unsupported.length} 处字符无 ${cs} 编码（已如实列出，未静默替换）：${uniq.slice(0, 20).join(' ')}${uniq.length > 20 ? ` 等 ${uniq.length} 种` : ''}`);
          } else {
            lines.push('- 全部字符编码成功');
          }
          lines.push(`- hex：${core.bytesToHex(enc.bytes).slice(0, 2000)}${enc.bytes.length > 666 ? '…（截断）' : ''}`);
          lines.push(`- base64：${core.base64Encode(enc.bytes).slice(0, 2000)}${enc.bytes.length > 1500 ? '…（截断）' : ''}`);
          return ok(lines.join('\n'));
        }
        if (args.mode === 'bytesToText') {
          const src = loadBytes({ hex: args.hex, base64: args.base64 });
          if (src.error) return err(src.error);
          const dec = core.strictDecode(src.bytes, cs);
          if (!dec.ok) return err(`按 ${cs} 严格解码失败（${dec.error}）——字节流可能不是 ${cs}，先跑 elens_detect 确认编码`);
          const shown = dec.text.length > 4096 ? dec.text.slice(0, 4096) + `…（其余 ${dec.text.length - 4096} 字符省略）` : dec.text;
          return ok(`## 转换结果：${src.source}（${src.bytes.length} 字节）→ ${cs} → 文本\n\n${shown}`);
        }
        return err('mode 必须是 textToBytes 或 bytesToText');
      } catch (e) { return err(`转换失败：${e.message}`); }
    },
  },
];

/* ------------------------------ stdio JSON-RPC 主循环 ------------------------------ */

let buf = '';
process.stdout.setEncoding('utf8');
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    if (msg.method && msg.method.startsWith('notifications/')) continue; // 通知不回包（exec-sandbox 实证：等通知回包会永久挂起）
    if (msg.method === 'initialize') {
      write({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
      continue;
    }
    if (msg.method === 'ping') { write({ jsonrpc: '2.0', id: msg.id, result: {} }); continue; }
    if (msg.method === 'tools/list') {
      write({ jsonrpc: '2.0', id: msg.id, result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
      continue;
    }
    if (msg.method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const tool = tools.find((t) => t.name === name);
      if (!tool) { write({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${String(name)}`) }); continue; }
      Promise.resolve()
        .then(() => tool.call(args))
        .then((r) => write({ jsonrpc: '2.0', id: msg.id, result: r }))
        .catch((e) => {
          log('error', `tools/call ${name}: ${e && e.stack ? e.stack : e}`);
          write({ jsonrpc: '2.0', id: msg.id, result: err(`工具执行异常：${e && e.message ? e.message : String(e)}`) });
        });
      continue;
    }
    write({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在：${String(msg.method)}` } });
  }
});
process.stdin.on('end', () => process.exit(0));

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

log('info', 'encoding-lens MCP server started (stdio)');
