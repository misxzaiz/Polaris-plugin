#!/usr/bin/env node
'use strict';
/**
 * server-src.js —— 多语言键同步台 MCP Server（源码；esbuild 打成 mcp/server.js，
 * js-yaml + kvclient + shared 引擎一并 bundle，零 node_modules 依赖）。
 *
 * 五工具（前缀 i18n_，中文 description 写「适用句式」）：
 *   i18n_status   目录体检概览（缺失/空值/疑似未翻译/占位符不一致计数）
 *   i18n_missing  某语言待翻译工作表（带术语表 + 应用指引）
 *   i18n_apply    落盘翻译（confirm 必填；占位符校验门；写前快照）
 *   i18n_undo     撤销最近一批应用（confirm 必填）
 *   i18n_glossary 术语表管理（get/set/clear；存 cap.kv，桥不可达时降级为进程内）
 *
 * 协议：stdio JSON-RPC 2024-11-05；协议数据只走 stdout，日志走 stderr。
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const core = require('../shared/i18n-core');
const engine = require('../shared/scan-engine');
const { applyTranslations, KEY_UNDO_INDEX } = require('../shared/apply-engine');
const { createKvClient } = require('./kvclient');

const SERVER_NAME = 'i18n-sync';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// kv：桥不可达时降级为进程内 Map（术语表至少在本会话内可用）
const kvFallback = new Map();
let kvRemote = null;
try { kvRemote = createKvClient({ appConfigDir: APP_CONFIG_DIR }); } catch (_) { kvRemote = null; }

async function kvGet(key) {
  if (kvRemote) {
    try { const v = await kvRemote.kvGet(key); return v; } catch (e) { log('warn', `kv 降级（${e.message}）`); }
  }
  return kvFallback.has(key) ? kvFallback.get(key) : null;
}
async function kvSet(key, value) {
  kvFallback.set(key, value);
  if (kvRemote) {
    try { await kvRemote.kvSet(key, value); return; } catch (e) { log('warn', `kv 降级（${e.message}）`); }
  }
}

function resolveDir(raw) {
  const p = String(raw || '').trim();
  if (!p) throw new Error('缺少 dir（locale 根目录绝对路径）');
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) throw new Error(`目录不存在：${resolved}`);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`不是目录：${resolved}`);
  return resolved;
}

async function loadBaseLocaleSetting() {
  const s = await kvGet('i18n.settings');
  return s && typeof s === 'object' && typeof s.baseLocale === 'string' ? s.baseLocale : undefined;
}

async function loadGlossary() {
  const g = await kvGet('i18n.glossary');
  if (g && typeof g === 'object' && g.terms && typeof g.terms === 'object') return g.terms;
  return {};
}

// ────────────────────────── 工具定义 ──────────────────────────

const tools = [
  {
    name: 'i18n_status',
    description: '适用：「检查一下这个项目的多语言文件齐不齐」「en 缺了哪些键」「体检 locales 目录」。扫描 locale 目录（JSON/JSONC/YAML），返回布局、语言清单、每语言缺失/空值/疑似未翻译/占位符不一致计数与首批缺失键样例。',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'locale 根目录绝对路径（如 D:\\proj\\web\\src\\locales）' },
        baseLocale: { type: 'string', description: '基准语言（翻译源，如 zh-cn）；缺省用设置或自动推断（zh*>en>字母序）' },
      },
      required: ['dir'],
    },
    async call(args) {
      const dir = resolveDir(args.dir);
      const baseLocale = args.baseLocale || await loadBaseLocaleSetting();
      const scan = engine.scanDir(dir, { baseLocale, yaml });
      return ok(core.renderStatusReport(scan.root, scan.baseLocale, scan.layout, scan.nsList, scan.locales, scan.matrix, scan.totals, scan.ambiguous));
    },
  },
  {
    name: 'i18n_missing',
    description: '适用：「把 en 缺的键列出来我来翻译」「生成 ja 的待翻译清单」。返回指定语言的待翻译工作表（键 + 基准语言源文案，缺失→空值→疑似未翻译排序），自动附术语表。翻译完成后用 i18n_apply 落盘。',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'locale 根目录绝对路径' },
        locale: { type: 'string', description: '目标语言（如 en、ja、zh-tw）' },
        ns: { type: 'string', description: '命名空间过滤（dir-per-locale 布局的文件名）；缺省=全部 ns' },
        baseLocale: { type: 'string', description: '基准语言覆盖；缺省用设置或自动推断' },
        limit: { type: 'number', description: '最多返回多少项（默认 200，上限 500）' },
        includeSame: { type: 'boolean', description: '是否包含「疑似未翻译」（与基准完全相同）的键，默认 false' },
      },
      required: ['dir', 'locale'],
    },
    async call(args) {
      const dir = resolveDir(args.dir);
      const locale = core.normalizeLocaleTag(args.locale);
      if (!locale) return err('缺少 locale（目标语言，如 en）');
      const baseLocale = args.baseLocale || await loadBaseLocaleSetting();
      const scan = engine.scanDir(dir, { baseLocale, yaml });
      if (locale === scan.baseLocale) return err(`locale 不能等于基准语言（${scan.baseLocale}）；基准语言是翻译源`);
      const nsFilter = typeof args.ns === 'string' && args.ns ? args.ns : null;
      if (nsFilter && !scan.nsList.includes(nsFilter)) {
        return err(`ns "${nsFilter}" 不存在。现有 ns：${scan.nsList.join(', ') || '（无）'}`);
      }
      // 汇总目标语言全部 (ns) 的 parity
      const glossary = await loadGlossary();
      const allItems = [];
      let skipped = 0;
      const perNs = [];
      for (const ns of scan.nsList) {
        if (nsFilter && ns !== nsFilter) continue;
        const cell = scan.matrix[ns] && scan.matrix[ns][locale];
        if (!cell || cell._parseError) { perNs.push({ ns, note: '解析失败或无此语言' }); continue; }
        const ws = core.buildWorksheet(cell, { limit: core.MAX_WORKSHEET_ITEMS, includeSame: !!args.includeSame });
        skipped += ws.skipped;
        for (const it of ws.items) allItems.push({ ...it, ns });
        perNs.push({ ns, missing: cell.missing.length, empty: cell.emptyValues.length, same: args.includeSame ? cell.sameAsBase.length : undefined });
      }
      const limit = Math.max(1, Math.min(Number(args.limit) || 200, core.MAX_WORKSHEET_ITEMS));
      let truncated = 0;
      let items = allItems;
      if (items.length > limit) { truncated = items.length - limit; items = items.slice(0, limit); }
      const lines = [];
      lines.push(`待翻译工作表：${scan.baseLocale} → ${locale}（${nsFilter ? `ns=${nsFilter}` : `全部 ns：${scan.nsList.join(', ') || '无'}`}）`);
      lines.push(`本批 ${items.length} 项${truncated ? `（截断 ${truncated}，工作表总池 ${allItems.length + skipped} 项，可分批）` : ''}${skipped ? `（另有非字符串值跳过 ${skipped} 项）` : ''}`);
      for (const p of perNs) lines.push(`  [${p.ns}] 缺失 ${p.missing ?? '-'} · 空值 ${p.empty ?? '-'}${p.same !== undefined ? ` · 疑似未翻译 ${p.same}` : ''}${p.note ? `（${p.note}）` : ''}`);
      if (Object.keys(glossary).length) {
        lines.push('术语表（译文必须遵守）：');
        for (const [k, v] of Object.entries(glossary).slice(0, 50)) lines.push(`  ${k} → ${v}`);
        if (Object.keys(glossary).length > 50) lines.push(`  …共 ${Object.keys(glossary).length} 条`);
      } else {
        lines.push('术语表：未设置（i18n_glossary action=set 可配置）');
      }
      lines.push('```json');
      lines.push(JSON.stringify(items.map(({ k, v }) => ({ k, v }))));
      lines.push('```');
      lines.push(`翻译要求：目标语言=${locale}；占位符（{name}、{{name}}、{0}、%s、%1$s 等）必须原样保留且数量一致；键名不得改动，不要发明清单之外的键。`);
      lines.push(`完成后调用 i18n_apply：dir="${scan.root}", locale="${locale}"${nsFilter ? `, ns="${nsFilter}"` : ''}, translations={<key>: <译文>}, confirm=true`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'i18n_apply',
    description: '适用：翻译清单完成后把译文写入目标语言文件。强制校验：占位符一致性、幻觉键拒绝、跨 ns 键要求消歧；写前自动快照（可用 i18n_undo 撤销）。confirm=true 才执行。',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'locale 根目录绝对路径' },
        locale: { type: 'string', description: '目标语言（与 i18n_missing 一致）' },
        translations: { type: 'object', description: '{ 键: 译文 } 对象（键名保持工作表中的 k 原样）' },
        ns: { type: 'string', description: '命名空间过滤；同一键出现在多个 ns 时必传' },
        mode: { type: 'string', enum: ['preserve', 'mirror'], description: 'preserve=新键追加到父级末尾（默认，最小 diff）；mirror=按基准语言键序重排整文件' },
        stripComments: { type: 'boolean', description: '目标文件含注释时，接受序列化丢失注释（默认 false=拒绝并提示）' },
        force: { type: 'boolean', description: '接受占位符等校验错误强制写入（不推荐）' },
        baseLocale: { type: 'string', description: '覆盖基准语言' },
        confirm: { type: 'boolean', description: '必须显式传 true 才会写盘' },
      },
      required: ['dir', 'locale', 'translations', 'confirm'],
    },
    async call(args) {
      if (args.confirm !== true) {
        return err('这是写盘操作。请先与用户确认译文内容，然后携带 confirm:true 重新调用。');
      }
      try {
        const r = await applyTranslations({
          dir: args.dir,
          locale: args.locale,
          translations: args.translations,
          ns: args.ns,
          mode: args.mode,
          stripComments: args.stripComments,
          force: args.force,
          baseLocale: args.baseLocale,
          yaml,
          appConfigDir: APP_CONFIG_DIR,
          kv: { kvGet: (k) => kvGet(k), kvSet: (k, v) => kvSet(k, v) },
          log,
        });
        if (!r.ok) {
          const lines = [`❌ 全部拒绝，未写盘（${r.errors.length} 项问题）：`];
          for (const e of r.errors) lines.push(`  - ${e.key}: ${e.reason}`);
          lines.push(r.hint || '');
          return ok(lines.join('\n'));
        }
        if (r.noop) return ok(`✅ ${r.message || '没有需要写入的变更'}`);
        const lines = [`✅ 已写入（batchId=${r.batchId}，可用 i18n_undo 撤销）：`];
        for (const a of r.applied) lines.push(`  [${a.ns}] ${a.file}：新增 ${a.insert} · 更新 ${a.update} · 无变化 ${a.noop}`);
        for (const w of r.warnings || []) lines.push(`⚠ ${w}`);
        return ok(lines.join('\n'));
      } catch (e) {
        return err(String(e.message || e));
      }
    },
  },
  {
    name: 'i18n_undo',
    description: '适用：「撤销刚才那次翻译落盘」「写错了恢复原样」。按快照恢复文件原文本（文件在应用后又被人工改过时会拒绝盲目恢复）。confirm=true 才执行。',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: { type: 'string', description: '要撤销的批次 id；缺省=最近一批' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('撤销会覆盖已写入的文件内容。确认后携带 confirm:true 重新调用。');
      try {
        let batchId = args.batchId;
        if (!batchId) {
          const idx = await kvGet(KEY_UNDO_INDEX);
          if (Array.isArray(idx) && idx.length) batchId = idx[0].batchId;
        }
        if (!batchId) return err('没有可撤销的批次（undo 索引为空，或桥不可达且未知 batchId）');
        const r = engine.restoreSnapshot(APP_CONFIG_DIR, batchId);
        const lines = [`✅ 撤销 batch=${r.batchId}：`];
        for (const it of r.results) lines.push(`  ${it.ok ? '✓' : '✗'} ${it.file}${it.ok ? '' : `（${it.error}）`}`);
        return ok(lines.join('\n'));
      } catch (e) {
        return err(String(e.message || e));
      }
    },
  },
  {
    name: 'i18n_glossary',
    description: '适用：「设置术语表：checkout 翻成结算」「看看现在的术语表」「清空术语表」。术语表会在 i18n_missing 输出中注入，约束 AI 翻译用词一致。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'clear'], description: 'get=查看；set=整体替换（terms 传 {源词: 译词}）；clear=清空' },
        terms: { type: 'object', description: 'action=set 时必填：{源词: 译词}，最多 200 条' },
      },
      required: ['action'],
    },
    async call(args) {
      if (args.action === 'get') {
        const terms = await loadGlossary();
        const keys = Object.keys(terms);
        if (!keys.length) return ok('术语表为空。用 action=set 配置 {源词: 译词}，翻译时自动注入约束。');
        const lines = [`术语表（${keys.length} 条）：`];
        for (const [k, v] of Object.entries(terms)) lines.push(`  ${k} → ${v}`);
        return ok(lines.join('\n'));
      }
      if (args.action === 'clear') {
        await kvSet('i18n.glossary', { terms: {}, updatedAt: new Date().toISOString() });
        return ok('术语表已清空。');
      }
      if (args.action === 'set') {
        const terms = args.terms;
        if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return err('action=set 需要 terms 对象 {源词: 译词}');
        const entries = Object.entries(terms).filter(([k]) => String(k).trim());
        if (!entries.length) return err('terms 为空；如需清空请用 action=clear');
        if (entries.length > 200) return err(`术语最多 200 条（收到 ${entries.length}）`);
        const clean = {};
        for (const [k, v] of entries) clean[String(k).trim()] = String(v);
        await kvSet('i18n.glossary', { terms: clean, updatedAt: new Date().toISOString() });
        return ok(`术语表已更新（${Object.keys(clean).length} 条）：\n${Object.entries(clean).map(([k, v]) => `  ${k} → ${v}`).join('\n')}`);
      }
      return err(`未知 action：${args.action}`);
    },
  },
];

// ────────────────────────── stdio JSON-RPC ──────────────────────────

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { log('warn', '非 JSON 行: ' + e.message); continue; }
    handleMessage(msg).catch((e) => {
      log('error', 'handleMessage: ' + (e && e.stack || e));
      if (msg && msg.id !== undefined && msg.id !== null) replyError(msg.id, -32603, String(e.message || e));
    });
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }
  if (method === 'notifications/initialized') return; // 无响应
  if (method === 'tools/list') {
    return reply(id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const tool = tools.find((t) => t.name === name);
    if (!tool) return replyError(id, -32602, `未知工具：${name}`);
    try {
      const result = await tool.call((params && params.arguments) || {});
      return reply(id, result);
    } catch (e) {
      log('error', `tools/call ${name}: ` + (e && e.stack || e));
      return reply(id, err('执行失败：' + String(e.message || e)));
    }
  }
  if (id !== undefined && id !== null) return replyError(id, -32601, `未知方法：${method}`);
}

log('info', `started (v${SERVER_VERSION}, appConfigDir=${APP_CONFIG_DIR || '(未提供)'})`);
