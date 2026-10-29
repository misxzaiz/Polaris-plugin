#!/usr/bin/env node
'use strict';
/**
 * pocket-ledger MCP Server —— 日常记账的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的记账/查账意图翻译为 cap.kv 的 ledger.* 读写；
 * 全部计算逻辑走 shared/ledger-core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无网络请求——纯本地账本。
 *
 * 工具一览：
 *   ledger_add          记一笔（AI 从对话里提取金额/分类/备注）
 *   ledger_query        查账单（月/日/分类/关键词）
 *   ledger_stats        月度统计与预算
 *   ledger_delete       删除一笔
 *   ledger_categories   查看/增删自定义分类
 *   ledger_attach_save  保存附件（返回 id 供 ledger_add 引用）
 *   ledger_attach_get   读取附件主体（默认不拉图，按需取）
 *   ledger_attach_delete 删除附件
 *   ledger_exclude      设置"不参与汇总"分类（如工资）
 *
 * 连接方式与 page-sentinel / news-curator 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/ledger-core.js');

const SERVER_NAME = 'pocket-ledger';
const SERVER_VERSION = '0.2.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 page-sentinel / news-curator）──────────────────
const APP_CONFIG_DIR = process.argv[2] || '';
const ENV_HOST = process.env.POLARIS_HOST || '';
const ENV_PORT = parseInt(process.env.POLARIS_PORT || '', 10);
const ENV_TOKEN = process.env.POLARIS_TOKEN || '';

function configCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过 */ }
  }
  if (APP_CONFIG_DIR) cands.push(path.join(APP_CONFIG_DIR, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number') return { host: web.host || '', port: web.port, token: web.token || '' };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/api/health', timeout: 1200 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _ep = null;
function resolveEndpoint() {
  if (!_ep) {
    _ep = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await healthCheck(host, basePort + i)) return { host, port: basePort + i, token };
      }
      return { host, port: basePort, token };
    })();
  }
  return _ep;
}

function polarisIpc(command, args = {}, { retries = 2, retryDelay = 300, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      resolveEndpoint().then((ep) => {
        const data = JSON.stringify(args);
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (ep.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
        const req = http.request(
          { hostname: ep.host, port: ep.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(body); } });
          },
        );
        req.on('error', (e) => {
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error(`Polaris IPC ${command} 失败: ${e.message}`));
        });
        req.on('timeout', () => {
          req.destroy();
          if (n < retries) setTimeout(() => attempt(n + 1), retryDelay * Math.pow(2, n));
          else reject(new Error('Polaris IPC timeout'));
        });
        req.write(data);
        req.end();
      }).catch(reject);
    };
    attempt(0);
  });
}

async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv get 失败');
  return res.result && res.result.value !== undefined ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv set 失败');
  return true;
}
async function kvDel(key) {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv delete 失败');
  return true;
}
async function kvKeys() {
  const res = await polarisIpc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
  if (!res || res.ok === false) throw new Error((res && res.error) || 'cap.kv list 失败');
  return (res.result && Array.isArray(res.result.keys)) ? res.result.keys : [];
}

// ── 账本数据访问 ───────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  return { ...core.DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

function validCategories(settings) {
  return [...new Set([...(settings.categories || []), ...(settings.incomeCategories || [])])];
}

/** 读取某月的全部账单（扁平，按 ts 排序）与其日键映射 */
async function loadMonth(month) {
  const keys = await kvKeys();
  const prefix = core.K.dayPrefixOf(month);
  const dayKeys = keys.filter((k) => k.startsWith(prefix)).sort();
  const byDay = new Map();
  const all = [];
  for (const dk of dayKeys) {
    // eslint-disable-next-line no-await-in-loop
    const arr = await kvGet(dk);
    if (!Array.isArray(arr)) continue;
    byDay.set(dk, arr);
    for (const b of arr) if (b && typeof b === 'object') all.push(b);
  }
  all.sort((a, b) => a.ts - b.ts);
  return { dayKeys, byDay, all };
}

function parseMonth(input) {
  if (!input || input === 'current' || input === 'this') return core.currentMonth();
  if (input === 'last' || input === 'prev') return core.shiftMonth(core.currentMonth(), -1);
  const s = String(input);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return core.currentMonth();
}

/** 'today'|'yesterday'|'YYYY-MM-DD' → epoch ms（保留当前时分秒便于排序展示） */
function resolveDate(input, now) {
  if (!input || input === 'today' || input === '今天') return now;
  if (input === 'yesterday' || input === '昨天') return now - 24 * 3600 * 1000;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input).trim());
  if (m) {
    const d = new Date(now);
    const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), d.getHours(), d.getMinutes(), d.getSeconds());
    if (Number.isNaN(target.getTime())) return null;
    return target.getTime();
  }
  return null;
}

function fmtBillLine(b, symbol) {
  const time = new Date(b.ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const sign = b.type === 'income' ? '+' : '-';
  return `[${b.id}] ${time} ${sign}${core.fmtMoney(b.amount, symbol)} ${b.category}${b.note ? ` · ${b.note}` : ''}${b.attachmentId ? ' · 📎' : ''}`;
}

/** 附件键读取：ledger.att.<id> → Attachment | null（不含校验，调用方负责） */
async function loadAttachment(id) {
  if (!id) return null;
  const v = await kvGet(core.K.att(id));
  return v && typeof v === 'object' && typeof v.data === 'string' ? v : null;
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'ledger_attach_save',
    description: '日常记账·保存附件（小票/截图/PDF/文本），返回附件 id 供 ledger_add 的 attachmentId 引用。data 为 base64（不含 data: 前缀）；单张上限 2MB；默认不拉图，仅记账/查询返回引用，需 ledger_attach_get 才取主体。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '文件名（含扩展名，如 receipt.png）' },
        mime: { type: 'string', description: 'MIME，如 image/png / application/pdf' },
        data: { type: 'string', description: '文件内容 base64（不含 data: 前缀）' },
      },
      required: ['name', 'data'],
    },
    async call(args) {
      const data = String(args.data || '');
      if (!data) return err('需要 data（base64）');
      // 从 base64 长度反推字节数（data 应为纯 base64）
      const padded = data.replace(/[^A-Za-z0-9+/=]/g, '');
      const approxBytes = Math.floor(padded.length * 3 / 4) - (padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0);
      const norm = core.normalizeAttachment({ name: args.name, mime: args.mime, size: approxBytes });
      if (norm.error) return err(norm.error);
      const att = norm.att;
      await kvSet(core.K.att(att.id), { ...att, data });
      return ok(`附件已保存：${att.name}（${att.id}，${Math.round(att.size / 1024)}KB）\n用 ledger_add 记这笔账时传 attachmentId="${att.id}"`);
    },
  },
  {
    name: 'ledger_attach_get',
    description: '日常记账·读取附件主体（base64 + 元数据）。默认不查询图片，仅在有需要（如向用户展示小票）时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '附件 id（ledger_query 的账单带 📎 即有 attachmentId）' },
      },
      required: ['id'],
    },
    async call(args) {
      const att = await loadAttachment(args.id);
      if (!att) return err(`附件 ${args.id} 不存在或已清理`);
      return ok([
        `附件 ${att.id}：${att.name}（${att.mime}，${Math.round(att.size / 1024)}KB，${new Date(att.ts).toLocaleString('zh-CN')}）`,
        `DATA_B64_LEN=${att.data.length}`,
      ].join('\n'));
    },
  },
  {
    name: 'ledger_attach_delete',
    description: '日常记账·删除附件（脱离账单引用后清理；记账删除账单时也会级联删附件）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '附件 id' },
      },
      required: ['id'],
    },
    async call(args) {
      await kvDel(core.K.att(args.id));
      return ok(`已删除附件 ${args.id}`);
    },
  },
  {
    name: 'ledger_exclude',
    description: '日常记账·设置"不参与汇总"分类（如工资）：账单照记、明细照见，但统计/结余/排行/逐日不计入。on=true 排除，false 恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '分类名（支出或收入分类均可）' },
        on: { type: 'boolean', description: 'true=排除出汇总，false=恢复参与，缺省 true' },
      },
      required: ['category'],
    },
    async call(args) {
      const settings = await loadSettings();
      const cat = String(args.category || '').trim();
      if (!cat) return err('需要 category');
      const valid = validCategories(settings);
      if (!valid.includes(cat)) return err(`未知分类「${cat}」，可用：${valid.join('/')}`);
      const cur = settings.excludeFromStats || [];
      const on = args.on !== false;
      const next = on ? [...new Set([...cur, cat])] : cur.filter((c) => c !== cat);
      await kvSet(core.K.settings, { ...settings, excludeFromStats: next });
      return ok(on
        ? `「${cat}」已设为不参与汇总（账单照记，统计/结余/排行排除）`
        : `「${cat}」已恢复参与汇总`);
    },
  },
  {
    name: 'ledger_add',
    description: '日常记账·记一笔。从对话中提取金额/分类/备注后调用。amount 为正数；type 缺省 expense（支出），income 为收入；category 从账本分类中选（月度预算超额会得到提示）。date 支持 "today"/"yesterday"/"YYYY-MM-DD"（补记），缺省今天。',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: '金额（正数）' },
        type: { type: 'string', enum: ['expense', 'income'], description: '支出/收入，缺省支出' },
        category: { type: 'string', description: '分类，缺省"其他"；建议从 ledger_categories 结果中选' },
        note: { type: 'string', description: '备注（如"午饭""打车"）' },
        date: { type: 'string', description: 'today / yesterday / YYYY-MM-DD，缺省 today' },
        source: { type: 'string', enum: ['ai', 'panel'], description: '来源标记，AI 调用保持缺省' },
        attachmentId: { type: 'string', description: '附件引用（ledger_attach_save 返回的 id，可选）' },
      },
      required: ['amount'],
    },
    async call(args) {
      const settings = await loadSettings();
      const now = Date.now();
      const ts = resolveDate(args.date, now);
      if (ts === null) return err('date 格式应为 today / yesterday / YYYY-MM-DD');
      const norm = core.normalizeBill({ ...args, ts, source: args.source || 'ai' }, validCategories(settings));
      if (norm.error) return err(norm.error);
      const bill = norm.bill;
      // 附件：若带了 attachmentId，确认存在（AI 先经 ledger_attach_save 存，再引用）
      if (args.attachmentId) {
        const att = await loadAttachment(args.attachmentId);
        if (!att) return err(`附件 ${args.attachmentId} 不存在或已清理（需先 ledger_attach_save）`);
        bill.attachmentId = args.attachmentId;
      }
      const dk = core.K.day(core.dayKeyOf(bill.ts));
      const existing = await kvGet(dk);
      const merged = core.appendBills(Array.isArray(existing) ? existing : [], [bill]);
      await kvSet(dk, merged);
      // 入账即反馈预算状态（排除汇总分类已由 computeStats 处理）
      const monthBills = (await loadMonth(core.monthOf(bill.ts))).all;
      const stats = core.computeStats(monthBills, settings, core.monthOf(bill.ts));
      const hint = core.budgetHint(stats);
      const todayExpense = merged.filter((b) => b.type === 'expense').reduce((s, b) => s + b.amount, 0);
      return ok([
        `已记录：${bill.type === 'income' ? '收入' : '支出'} ${core.fmtMoney(bill.amount, settings.currencySymbol)}「${bill.category}」${bill.note ? `（${bill.note}）` : ''}${bill.attachmentId ? ' 📎' : ''} · ${core.dayKeyOf(bill.ts)}`,
        `本${bill.type === 'income' ? '日收入' : '日支出小计'} ${core.fmtMoney(todayExpense, settings.currencySymbol)}`,
        `本月：支出 ${core.fmtMoney(stats.expense, settings.currencySymbol)} / 收入 ${core.fmtMoney(stats.income, settings.currencySymbol)}${stats.excludedSum ? `（另有 ${core.fmtMoney(stats.excludedSum, settings.currencySymbol)} 不参与汇总）` : ''}`,
        hint,
      ].filter(Boolean).join('\n'));
    },
  },
  {
    name: 'ledger_query',
    description: '日常记账·查账单。可按月/日/分类/收支类型/关键词过滤，返回账单列表与小计。适合"上个月咖啡花了多少""这周打车支出"这类问题。',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM / "current" / "last"，缺省本月' },
        category: { type: 'string' },
        type: { type: 'string', enum: ['expense', 'income'] },
        keyword: { type: 'string', description: '在备注与分类里模糊匹配' },
        limit: { type: 'integer', description: '最多返回条数（默认 30，上限 100）' },
      },
    },
    async call(args) {
      const settings = await loadSettings();
      const month = parseMonth(args.month);
      const { all } = await loadMonth(month);
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 30));
      const filtered = core.filterBills(all, args).sort((a, b) => b.ts - a.ts);
      if (!filtered.length) return ok(`${month} 没有符合条件的账单。`);
      const sum = filtered.reduce((s, b) => s + (b.type === 'income' ? b.amount : -b.amount), 0);
      const head = filtered.slice(0, limit).map((b) => fmtBillLine(b, settings.currencySymbol));
      return ok([
        `${month} 符合条件 ${filtered.length} 笔${filtered.length > limit ? `（显示最近 ${limit} 笔）` : ''}，净额 ${sum >= 0 ? '+' : ''}${core.fmtMoney(sum, settings.currencySymbol)}：`,
        ...head,
      ].join('\n'));
    },
  },
  {
    name: 'ledger_stats',
    description: '日常记账·月度统计：总收入/总支出/结余、分类排行（含预算使用率）、日趋势要点。适合"这个月花得怎么样""哪个分类超预算了"。',
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'YYYY-MM / "current" / "last"，缺省本月' } },
    },
    async call(args) {
      const settings = await loadSettings();
      const month = parseMonth(args.month);
      const { all } = await loadMonth(month);
      if (!all.length) return ok(`${month} 还没有账单。`);
      const s = core.computeStats(all, settings, month);
      const lines = [
        `${month} 统计（${s.count} 笔）：`,
        `支出 ${core.fmtMoney(s.expense, '¥')} · 收入 ${core.fmtMoney(s.income, '¥')} · 结余 ${core.fmtMoney(s.balance, '¥')}${s.excludedSum ? `（另有 ${core.fmtMoney(s.excludedSum, '¥')} 不参与汇总）` : ''}`,
      ];
      if (s.totalBudgetUsed != null) {
        const pct = Math.round(s.totalBudgetUsed * 100);
        lines.push(`总预算：${pct}%（${core.fmtMoney(s.expense, '¥')} / ${core.fmtMoney(s.totalBudget, '¥')}）${pct >= 100 ? '⚠️ 已超支' : pct >= 90 ? '⚠️ 接近上限' : ''}`);
      }
      const withBudget = s.byCategory.filter((c) => c.type === 'expense');
      if (withBudget.length) {
        lines.push('支出分类排行：');
        for (const c of withBudget.slice(0, 10)) {
          const budgetTxt = c.budget != null ? `（预算 ${core.fmtMoney(c.budget, '¥')}，已用 ${Math.round((c.sum / c.budget) * 100)}%）` : '';
          lines.push(`  ${c.category} ${core.fmtMoney(c.sum, '¥')} ×${c.count}${budgetTxt}`);
        }
      }
      const peak = s.byDay.slice().sort((a, b) => b.expense - a.expense)[0];
      if (peak && peak.expense > 0) lines.push(`单日最高：${peak.date} 花 ${core.fmtMoney(peak.expense, '¥')}`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ledger_delete',
    description: '日常记账·删除一笔账单（按 id，列表见 ledger_query）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '账单 id' },
        month: { type: 'string', description: 'YYYY-MM，缺省本月（id 所在月不确定时建议先 query 确认）' },
      },
      required: ['id'],
    },
    async call(args) {
      const month = parseMonth(args.month);
      const { byDay } = await loadMonth(month);
      for (const [dk, arr] of byDay) {
        const target = arr.find((b) => b && b.id === args.id);
        const { arr: next, removed } = core.removeBill(arr, args.id);
        if (removed) {
          await kvSet(dk, next);
          if (target && target.attachmentId) await kvDel(core.K.att(target.attachmentId));
          return ok(`已删除账单 ${args.id}（${dk}）${target && target.attachmentId ? '，附件已级联清理' : ''}。`);
        }
      }
      return err(`本月未找到账单 ${args.id}（可尝试指定 month，或用 ledger_query 确认 id）。`);
    },
  },
  {
    name: 'ledger_categories',
    description: '日常记账·分类管理：list 查看全部分类与预算；add/remove 增删自定义分类（写入设置，立即对记账校验生效）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove'], description: '缺省 list' },
        name: { type: 'string', description: 'add/remove 时的分类名' },
        type: { type: 'string', enum: ['expense', 'income'], description: 'add 时指定收入/支出类，缺省支出' },
      },
    },
    async call(args) {
      const settings = await loadSettings();
      const action = args.action || 'list';
      if (action === 'list') {
        const budgets = settings.budgets || {};
        const exp = (settings.categories || []).map((c) => `${c}${budgets[c] != null ? `（月预算 ${core.fmtMoney(budgets[c], '¥')}）` : ''}`);
        return ok([
          '支出分类：' + exp.join(' / '),
          '收入分类：' + (settings.incomeCategories || []).join(' / '),
        ].join('\n'));
      }
      const name = String(args.name || '').trim();
      if (!name) return err('需要 name');
      if (action === 'add') {
        const key = args.type === 'income' ? 'incomeCategories' : 'categories';
        const list = settings[key] || [];
        if (list.includes(name)) return err(`分类「${name}」已存在`);
        settings[key] = [...list, name];
      } else {
        const base = [...core.DEFAULT_CATEGORIES, ...core.INCOME_CATEGORIES];
        if (base.includes(name)) return err(`「${name}」是内置分类，不可删除`);
        settings.categories = (settings.categories || []).filter((c) => c !== name);
        settings.incomeCategories = (settings.incomeCategories || []).filter((c) => c !== name);
      }
      await kvSet(core.K.settings, settings);
      return ok(action === 'add'
        ? `已添加${args.type === 'income' ? '收入' : '支出'}分类「${name}」。`
        : `已删除分类「${name}」。`);
    },
  },
];

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── JSON-RPC 2.0 over stdio ────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) { send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) }); return; }
    try {
      send({ jsonrpc: '2.0', id: msg.id, result: await tool.call(args) });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
