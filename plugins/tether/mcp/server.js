#!/usr/bin/env node
'use strict';
/**
 * tether MCP Server —— 故人的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的记人/记往来/立诺/查简报意图翻译为 cap.kv 的 tether.* 读写；
 * 全部计算逻辑走 shared/tether-core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无网络请求——人脉是最私人的数据，不出设备。
 *
 * 工具一览（12 个）：
 *   ren_overview       今日人情速览（对话入口）
 *   ren_person_save    建档 / 更新档案
 *   ren_person_list    检索档案
 *   ren_person_remove  删档（级联承诺+往来，须 confirm）
 *   ren_log            记一笔往来（联系/便签/人情）
 *   ren_journal        查往来流水
 *   ren_promises       承诺全操作（list/add/close/cancel/reopen）
 *   ren_drift          失联预警榜
 *   ren_birthdays      未来 N 天生日
 *   ren_prep           见面简报
 *   ren_stats          人情透视
 *   ren_settings       节奏参数读写
 *
 * 连接方式与 pocket-ledger / page-sentinel 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/tether-core.js');

const SERVER_NAME = 'tether';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 pocket-ledger）──────────────────────────────────
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

// ── 数据访问 ───────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await kvGet(core.K.settings).catch(() => null);
  const n = core.normalizeSettings(s && typeof s === 'object' ? s : null);
  return n.settings || core.DEFAULT_SETTINGS;
}

async function loadPeople() {
  const v = await kvGet(core.K.people).catch(() => null);
  if (v && typeof v === 'object' && v.byId && typeof v.byId === 'object') {
    return { order: Array.isArray(v.order) ? v.order : [], byId: v.byId };
  }
  return { order: [], byId: {} };
}

async function loadPromises() {
  const v = await kvGet(core.K.promises).catch(() => null);
  if (v && typeof v === 'object' && v.byId && typeof v.byId === 'object') {
    return { byId: v.byId };
  }
  return { byId: {} };
}

async function loadJournal() {
  const v = await kvGet(core.K.journal).catch(() => null);
  if (v && typeof v === 'object' && Array.isArray(v.events)) return { events: v.events };
  return { events: [] };
}

/** 人称解析：personId 直取；否则按 name 模糊找；失败带澄清线索 */
async function resolvePersonInput(args, people) {
  if (args.personId) {
    const p = people.byId[String(args.personId)];
    return p ? { person: p } : { error: `personId ${args.personId} 不存在（ren_person_list 查证）` };
  }
  if (args.name) {
    const r = core.findPerson(args.name, people.byId);
    if (r && r.person) return { person: r.person };
    if (r && r.ambiguous) {
      return { error: `「${args.name}」命中多人，用 personId 指定：${r.ambiguous.map((p) => `${p.name}[${p.id}]`).join('、')}` };
    }
    return { error: `找不到「${args.name}」（ren_person_list 检索，或先 ren_person_save 建档）` };
  }
  return { error: '需要 personId 或 name' };
}

function fmtEventLine(e, peopleById) {
  const who = peopleById[e.personId] ? peopleById[e.personId].name : '（已删除）';
  const tag = e.type === 'contact' ? (e.channel || '联系') : e.type === 'favor' ? (e.direction === 'gave' ? '帮了他' : '他帮我') : '便签';
  return `[${e.id}] ${core.dayKeyOf(e.at)} ${who} · ${tag} · ${e.text}`;
}

function fmtPromiseLine(p, now, settings) {
  const dir = p.direction === 'iowe' ? '我许的' : '我等的';
  const st = p.status === 'open' ? core.dueState(p.due, now, settings.dueWarnDays) : null;
  const dueTxt = p.status === 'open' ? st.label : (p.status === 'done' ? '已闭环' : '已取消');
  return `[${p.id}] ${dir} · ${p.text} · ${dueTxt}`;
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'ren_overview',
    description: '故人·今日人情速览（对话入口）：逾期/临期承诺、未来生日、失联预警 top3、档案汇总。用户问「有什么人情上的事」「该联系谁」时先调这个。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const [settings, people, promises, journal] = await Promise.all([loadSettings(), loadPeople(), loadPromises(), loadJournal()]);
      const now = Date.now();
      const board = core.promiseBoard(promises.byId, people.byId, now, settings);
      const birthdays = core.birthdayUpcoming(people.byId, settings.birthdayDays, now);
      const drift = core.driftList(people.byId, journal.events, settings, now).filter((d) => d.level !== 'ok');
      const active = Object.values(people.byId).filter((p) => p && !p.archivedAt);
      const lines = [];
      lines.push(`故人 ${active.length} 人（归档 ${Object.values(people.byId).length - active.length}）· 待闭环承诺 ${board.overdue.length + board.dueSoon.length + board.scheduled.length + board.openNoDue.length} 条 · 失联预警 ${drift.length} 人`);
      if (board.overdue.length) {
        lines.push(`⛔ 逾期承诺 ${board.overdue.length} 条：`);
        for (const p of board.overdue.slice(0, 5)) lines.push(`  ${fmtPromiseLine(p, now, settings)} · 对象 ${p.personName}`);
      }
      if (board.dueSoon.length) {
        lines.push(`⏳ 临期承诺（${settings.dueWarnDays} 天内）${board.dueSoon.length} 条：`);
        for (const p of board.dueSoon.slice(0, 5)) lines.push(`  ${fmtPromiseLine(p, now, settings)} · 对象 ${p.personName}`);
      }
      if (birthdays.length) {
        lines.push('🎂 生日：');
        for (const b of birthdays.slice(0, 5)) {
          const age = b.turningAge != null ? `，将满 ${b.turningAge}` : '';
          lines.push(`  ${b.name} ${b.daysUntil === 0 ? '今天！' : `${b.daysUntil} 天后`}（${b.date}${age}）`);
        }
      }
      if (drift.length) {
        lines.push('📉 失联预警 top3：');
        for (const d of drift.slice(0, 3)) lines.push(`  ${d.name} · ${d.text}（${d.level === 'lost' ? '红榜' : '黄榜'}）`);
      }
      if (!board.overdue.length && !board.dueSoon.length && !birthdays.length && !drift.length) {
        lines.push('眼下没有逾期承诺、临期生日或失联预警，人情账面干净。');
      } else {
        lines.push('（记往来用 ren_log；闭环承诺用 ren_promises close；见人前用 ren_prep 出简报）');
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ren_person_save',
    description: '故人·建档/更新档案。传 id 或与现有精确同名=更新（缺的字段保持原值），否则新建。字段：name、alias（称呼）、relation（家人/伴侣/朋友/同事/客户/导师/同学/其他）、tags、howMet（怎么认识）、birthday（MM-DD 或 YYYY-MM-DD，仅阳历）、contacts{phone,wechat,email,other}、cadenceDays（想多久联系一次，7..365）、note。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '更新时传（ren_person_list 拿到的 id）；新建缺省' },
        name: { type: 'string', description: '姓名（必填）' },
        alias: { type: 'string', description: '称呼/别名（如 老张、张总）' },
        relation: { type: 'string', enum: core.RELATIONS },
        tags: { type: 'array', items: { type: 'string' }, description: '标签（≤8 个）' },
        howMet: { type: 'string', description: '怎么认识的' },
        birthday: { type: 'string', description: 'MM-DD 或 YYYY-MM-DD（仅阳历）' },
        contacts: {
          type: 'object',
          properties: {
            phone: { type: 'string' }, wechat: { type: 'string' }, email: { type: 'string' }, other: { type: 'string' },
          },
        },
        cadenceDays: { type: 'integer', description: '联系节奏（天），7..365；缺省用全局默认' },
        note: { type: 'string', description: '备注（喜好/忌讳/家人情况等）' },
      },
      required: ['name'],
    },
    async call(args) {
      const people = await loadPeople();
      const now = Date.now();
      let target = null;
      let targetId = null;
      if (args.id) {
        targetId = String(args.id);
        target = people.byId[targetId];
        if (!target) return err(`personId ${args.id} 不存在（ren_person_list 查证）`);
      } else {
        const r = core.findPerson(args.name, people.byId);
        if (r && r.person && r.person.name === String(args.name).trim()) {
          target = r.person;
          targetId = r.person.id;
        } else if (r && r.ambiguous) {
          return err(`「${args.name}」命中多人，更新请用 id：${r.ambiguous.map((p) => `${p.name}[${p.id}]`).join('、')}`);
        }
      }
      const merged = { ...(target || {}), ...args, createdAt: target ? target.createdAt : now, updatedAt: now };
      const norm = core.normalizePerson(merged);
      if (norm.error) return err(norm.error);
      const person = norm.person;
      if (!target) {
        const activeCount = Object.values(people.byId).filter((p) => p && !p.archivedAt).length;
        if (activeCount >= core.MAX_PEOPLE) return err(`档案已达上限 ${core.MAX_PEOPLE} 人，先归档或删除再建`);
      }
      people.byId[person.id] = person;
      if (!people.order.includes(person.id)) people.order.push(person.id);
      await kvSet(core.K.people, { v: 1, order: people.order, byId: people.byId });
      return ok(`${target ? '已更新' : '已建档'}：${person.name}${person.alias && person.alias !== person.name ? `（${person.alias}）` : ''} · ${person.relation} · [${person.id}]\n记往来用 ren_log，立诺用 ren_promises add。`);
    },
  },
  {
    name: 'ren_person_list',
    description: '故人·检索档案。支持关键词（名/别名/标签/备注）、关系、标签过滤；默认排除已归档。返回 id、关系、最近联系与失联态——提人前先查这里。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词（名/别名/标签/备注模糊）' },
        relation: { type: 'string', enum: core.RELATIONS },
        tag: { type: 'string' },
        archived: { type: 'string', enum: core.ARCHIVED_FILTERS, description: "no=仅在册（默认）/ only=仅归档 / include=全部" },
        limit: { type: 'integer', description: '最多返回条数（默认 30，上限 100）' },
      },
    },
    async call(args) {
      const [settings, people, journal] = await Promise.all([loadSettings(), loadPeople(), loadJournal()]);
      const now = Date.now();
      const drift = core.driftList(people.byId, journal.events, settings, now);
      const driftById = new Map(drift.map((d) => [d.personId, d]));
      const q = String(args.query || '').trim().toLowerCase();
      const archived = core.ARCHIVED_FILTERS.includes(args.archived) ? args.archived : 'no';
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 30));
      let list = Object.values(people.byId).filter((p) => {
        if (!p) return false;
        const isArchived = !!p.archivedAt;
        if (archived === 'no' && isArchived) return false;
        if (archived === 'only' && !isArchived) return false;
        if (args.relation && p.relation !== args.relation) return false;
        if (args.tag && !(p.tags || []).includes(args.tag)) return false;
        if (q) {
          const hay = [p.name, p.alias, p.howMet, p.note, ...(p.tags || [])].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name, 'zh'));
      const total = list.length;
      list = list.slice(0, limit);
      if (!total) return ok('没有符合条件的人物档案（新建用 ren_person_save）。');
      const lines = [`共 ${total} 人${total > limit ? `（显示前 ${limit}）` : ''}：`];
      for (const p of list) {
        const d = driftById.get(p.id);
        const mark = p.archivedAt ? ' [已归档]' : d && d.level === 'lost' ? ' ⚠️红' : d && d.level === 'warn' ? ' ⚠️黄' : '';
        const alias = p.alias && p.alias !== p.name ? `（${p.alias}）` : '';
        const rel = p.relation === '其他' ? '' : ` ${p.relation}`;
        lines.push(`  [${p.id}] ${p.name}${alias}${rel}${mark} · ${d ? d.text : ''}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ren_person_remove',
    description: '故人·删除档案（连同其全部往来记录与承诺，不可恢复）。必须 confirm:true 才执行；不确定时先 ren_person_list 查证。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '人物 id（与 name 二选一）' },
        name: { type: 'string', description: '姓名（模糊找，多人命中会要求用 id）' },
        confirm: { type: 'boolean', description: '必须显式 true' },
      },
    },
    async call(args) {
      if (args.confirm !== true) return err('删除档案会连带往来与承诺，须 confirm:true 显式确认');
      const [people, promises, journal] = await Promise.all([loadPeople(), loadPromises(), loadJournal()]);
      const r = await resolvePersonInput(args, people);
      if (r.error) return err(r.error);
      const person = r.person;
      delete people.byId[person.id];
      people.order = people.order.filter((id) => id !== person.id);
      const pIds = Object.keys(promises.byId).filter((id) => promises.byId[id] && promises.byId[id].personId === person.id);
      for (const id of pIds) delete promises.byId[id];
      const evBefore = journal.events.length;
      journal.events = journal.events.filter((e) => e && e.personId !== person.id);
      await kvSet(core.K.people, { v: 1, order: people.order, byId: people.byId });
      await kvSet(core.K.promises, { v: 1, byId: promises.byId });
      await kvSet(core.K.journal, { v: 1, events: journal.events });
      return ok(`已删除 ${person.name}[${person.id}]：连带承诺 ${pIds.length} 条、往来 ${evBefore - journal.events.length} 条。`);
    },
  },
  {
    name: 'ren_log',
    description: '故人·记一笔往来。type=contact（联系，channel：见面/电话/微信/视频/邮件/其他）、note（便签，如对方的喜好/重要信息）、favor（人情，direction：gave=我帮了他/got=他帮了我）。date 支持 today/yesterday/YYYY-MM-DD 补记。「昨天和张三吃饭聊了孩子上学」→ contact+见面。',
    inputSchema: {
      type: 'object',
      properties: {
        personId: { type: 'string', description: '与 name 二选一' },
        name: { type: 'string', description: '姓名（模糊找）' },
        type: { type: 'string', enum: core.EVENT_TYPES, description: '缺省 contact' },
        channel: { type: 'string', enum: core.CHANNELS, description: 'contact 时的联系方式' },
        direction: { type: 'string', enum: core.FAVOR_DIRECTIONS, description: 'favor 必填' },
        text: { type: 'string', description: '内容（聊了什么/帮了什么，一句话即可）' },
        date: { type: 'string', description: 'today / yesterday / YYYY-MM-DD，缺省今天' },
      },
      required: ['text'],
    },
    async call(args) {
      const [people, journal] = await Promise.all([loadPeople(), loadJournal()]);
      const r = await resolvePersonInput(args, people);
      if (r.error) return err(r.error);
      const now = Date.now();
      const at = core.resolveDateInput(args.date, now);
      if (at == null) return err('date 格式应为 today / yesterday / YYYY-MM-DD');
      const norm = core.normalizeEvent({ ...args, personId: r.person.id, at });
      if (norm.error) return err(norm.error);
      const events = core.appendEvents(journal.events, [norm.event]);
      await kvSet(core.K.journal, { v: 1, events });
      const daysSince = Math.floor((now - at) / core.DAY_MS);
      return ok(`已记：${r.person.name} · ${norm.event.type === 'contact' ? (norm.event.channel || '联系') : norm.event.type === 'favor' ? (norm.event.direction === 'gave' ? '帮了他' : '他帮我') : '便签'} · ${norm.event.text}${daysSince > 0 ? `（${core.dayKeyOf(at)}）` : ''}`);
    },
  },
  {
    name: 'ren_journal',
    description: '故人·查往来流水。按人/关键词/类型/最近 N 天过滤，倒序返回。「上周和王总聊了啥」「我帮过他什么」用这个。',
    inputSchema: {
      type: 'object',
      properties: {
        personId: { type: 'string', description: '与 name 二选一' },
        name: { type: 'string' },
        keyword: { type: 'string', description: '在内容里模糊匹配' },
        type: { type: 'string', enum: core.EVENT_TYPES },
        days: { type: 'integer', description: '只看最近 N 天（默认不限）' },
        limit: { type: 'integer', description: '最多返回条数（默认 20，上限 100）' },
      },
    },
    async call(args) {
      const [people, journal] = await Promise.all([loadPeople(), loadJournal()]);
      let personId = args.personId || null;
      let personName = null;
      if (!personId && args.name) {
        const r = await resolvePersonInput({ name: args.name }, people);
        if (r.error) return err(r.error);
        personId = r.person.id;
        personName = r.person.name;
      }
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
      const since = Number.isFinite(Number(args.days)) && Number(args.days) > 0 ? Date.now() - Number(args.days) * core.DAY_MS : null;
      let list = journal.events.filter((e) => {
        if (!e) return false;
        if (personId && e.personId !== personId) return false;
        if (args.type && e.type !== args.type) return false;
        if (since && e.at < since) return false;
        if (args.keyword && !String(e.text).toLowerCase().includes(String(args.keyword).toLowerCase())) return false;
        return true;
      });
      list.sort((a, b) => b.at - a.at);
      const total = list.length;
      list = list.slice(0, limit);
      if (!total) return ok('没有符合条件的往来记录。');
      const scope = personName || (personId ? '该人物' : '');
      const head = `${scope ? `${scope} 的 ` : ''}往来 ${total} 条${total > limit ? `（显示最近 ${limit} 条）` : ''}：`;
      return ok([head, ...list.map((e) => `  ${fmtEventLine(e, people.byId)}`)].join('\n'));
    },
  },
  {
    name: 'ren_promises',
    description: '故人·承诺（双向）操作。add：{personId/name, direction:iowe我许的|owedme我等的, text, due?(YYYY-MM-DD)}；close：{id, note?} 闭环兑现；cancel：{id} 作废；reopen：{id} 重开；list：{direction?, status?:open|done|cancelled|all}。「我答应小张周五给方案」→ add iowe；「小张欠我一个答复」→ add owedme。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'close', 'cancel', 'reopen'], description: '缺省 list' },
        id: { type: 'string', description: 'close/cancel/reopen 的承诺 id' },
        personId: { type: 'string', description: 'add 时与 name 二选一' },
        name: { type: 'string', description: 'add 时姓名' },
        direction: { type: 'string', enum: core.PROMISE_DIRECTIONS },
        text: { type: 'string', description: '承诺内容' },
        due: { type: 'string', description: 'YYYY-MM-DD，可无期限' },
        note: { type: 'string', description: 'close 时的收尾备注' },
        status: { type: 'string', enum: ['open', 'done', 'cancelled', 'all'], description: 'list 过滤，默认 open' },
      },
    },
    async call(args) {
      const [settings, people, promises] = await Promise.all([loadSettings(), loadPeople(), loadPromises()]);
      const now = Date.now();
      const action = args.action || 'list';
      if (action === 'list') {
        const status = args.status || 'open';
        const board = core.promiseBoard(promises.byId, people.byId, now, settings);
        const groups = status === 'all'
          ? [['逾期', board.overdue], ['临期', board.dueSoon], ['有期限', board.scheduled], ['无期限', board.openNoDue], ['已闭环', board.closed]]
          : status === 'open'
            ? [['逾期', board.overdue], ['临期', board.dueSoon], ['有期限', board.scheduled], ['无期限', board.openNoDue]]
            : [[status === 'done' ? '已闭环' : '已取消', board.closed]];
        const lines = [];
        for (const [label, arr] of groups) {
          if (!arr.length) continue;
          lines.push(`${label} ${arr.length} 条：`);
          for (const p of arr.slice(0, 20)) {
            lines.push(`  ${fmtPromiseLine(p, now, settings)} · 对象 ${p.personName}${p.closeNote ? ` · ${p.closeNote}` : ''}`);
          }
        }
        return ok(lines.length ? lines.join('\n') : '没有符合条件状态的承诺。');
      }
      if (action === 'add') {
        const r = await resolvePersonInput(args, people);
        if (r.error) return err(r.error);
        const openCount = Object.values(promises.byId).filter((p) => p && p.status === 'open').length;
        if (openCount >= core.MAX_OPEN_PROMISES) return err(`未闭环承诺已达上限 ${core.MAX_OPEN_PROMISES} 条，先闭环或取消一些`);
        const norm = core.normalizePromise({ ...args, personId: r.person.id, status: 'open' });
        if (norm.error) return err(norm.error);
        promises.byId[norm.promise.id] = norm.promise;
        await kvSet(core.K.promises, { v: 1, byId: promises.byId });
        const st = core.dueState(norm.promise.due, now, settings.dueWarnDays);
        return ok(`立此存照：${norm.promise.direction === 'iowe' ? '我许的' : '我等的'} · ${norm.promise.text} · ${st.label} · 对象 ${r.person.name} · [${norm.promise.id}]`);
      }
      // close / cancel / reopen
      if (!args.id) return err(`${action} 需要 id（ren_promises list 拿）`);
      const p = promises.byId[String(args.id)];
      if (!p) return err(`承诺 ${args.id} 不存在`);
      if (action === 'reopen') {
        if (p.status === 'open') return err('该承诺本就未闭环');
        p.status = 'open';
        delete p.closedAt;
        delete p.closeNote;
        await kvSet(core.K.promises, { v: 1, byId: core.trimClosedPromises(promises.byId) });
        return ok(`已重开：${p.text}（${p.direction === 'iowe' ? '我许的' : '我等的'}）[${p.id}]`);
      }
      if (p.status !== 'open') return err(`该承诺已${p.status === 'done' ? '闭环' : '取消'}（重开用 reopen）`);
      p.status = action === 'close' ? 'done' : 'cancelled';
      p.closedAt = now;
      const note = String(args.note || '').trim().slice(0, 200);
      if (note) p.closeNote = note;
      const trimmed = core.trimClosedPromises(promises.byId);
      await kvSet(core.K.promises, { v: 1, byId: trimmed });
      return ok(action === 'close'
        ? `已闭环：${p.text}（${p.direction === 'iowe' ? '我许的' : '我等的'}）${p.closeNote ? ` · ${p.closeNote}` : ''}`
        : `已取消：${p.text}`);
    },
  },
  {
    name: 'ren_drift',
    description: '故人·失联预警榜：每个人按自己的节奏（cadenceDays 或全局默认）算「N 天未联系 vs 节奏 M 天」，超节奏进黄榜、超宽限进红榜。用户问「谁好久没联系了」用这个。',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['warn', 'lost', 'all'], description: '默认 all（黄+红）' },
        limit: { type: 'integer', description: '最多返回条数（默认 15）' },
      },
    },
    async call(args) {
      const [settings, people, journal] = await Promise.all([loadSettings(), loadPeople(), loadJournal()]);
      const drift = core.driftList(people.byId, journal.events, settings, Date.now());
      const level = ['warn', 'lost'].includes(args.level) ? args.level : 'all';
      const filtered = level === 'all' ? drift.filter((d) => d.level !== 'ok') : drift.filter((d) => d.level === level);
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 15));
      if (!filtered.length) return ok('没有失联预警——联系节奏都在轨道上。');
      const lines = [`失联预警 ${filtered.length} 人：`];
      for (const d of filtered.slice(0, limit)) {
        const mark = d.level === 'lost' ? '🔴' : '🟡';
        lines.push(`  ${mark} ${d.name}（${d.relation}）· ${d.text}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ren_birthdays',
    description: '故人·未来 N 天生日（默认设置里的 birthdayDays 窗口，含今天）。带年份的算年龄；平年 02-29 按 03-01 过。仅阳历——用户说农历生日时如实告知暂不支持阳历换算。',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', description: '窗口天数（默认设置的 birthdayDays）' } },
    },
    async call(args) {
      const [settings, people] = await Promise.all([loadSettings(), loadPeople()]);
      const days = Math.min(365, Math.max(1, Number(args.days) || settings.birthdayDays));
      const list = core.birthdayUpcoming(people.byId, days, Date.now());
      if (!list.length) return ok(`${days} 天内没有生日。`);
      const lines = [`${days} 天内的生日 ${list.length} 个：`];
      for (const b of list) {
        const age = b.turningAge != null ? `，将满 ${b.turningAge}` : '';
        lines.push(`  ${b.name} · ${b.daysUntil === 0 ? '今天！🎂' : `${b.daysUntil} 天后`}（${b.date}${age}）`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ren_prep',
    description: '故人·见面简报：见人前一份上下文包——档案（怎么认识/渠道/生日临近）、最近 5 笔往来（上次聊到哪）、未闭环承诺（别答应重复的事）、人情天平、联系状态。用户说「明天见张总」「要给妈妈打电话」时调。',
    inputSchema: {
      type: 'object',
      properties: {
        personId: { type: 'string', description: '与 name 二选一' },
        name: { type: 'string' },
      },
    },
    async call(args) {
      const [settings, people, promises, journal] = await Promise.all([loadSettings(), loadPeople(), loadPromises(), loadJournal()]);
      const r = await resolvePersonInput(args, people);
      if (r.error) return err(r.error);
      return ok(core.personPack(r.person, journal.events, promises.byId, Date.now(), settings));
    },
  },
  {
    name: 'ren_stats',
    description: '故人·人情透视：按关系分组的人数与失联态、近 12 个月联系趋势、人情天平 top、承诺构成。用户问「我的人脉面怎么样」用这个。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const [settings, people, promises, journal] = await Promise.all([loadSettings(), loadPeople(), loadPromises(), loadJournal()]);
      const now = Date.now();
      const drift = core.driftList(people.byId, journal.events, settings, now);
      const byId = new Map(drift.map((d) => [d.personId, d]));
      const active = Object.values(people.byId).filter((p) => p && !p.archivedAt);
      const byRelation = new Map();
      for (const p of active) {
        const rec = byRelation.get(p.relation) || { count: 0, lost: 0, warn: 0, daysSum: 0, daysN: 0 };
        rec.count += 1;
        const d = byId.get(p.id);
        if (d) {
          if (d.level === 'lost') rec.lost += 1;
          else if (d.level === 'warn') rec.warn += 1;
          rec.daysSum += d.daysSince;
          rec.daysN += 1;
        }
        byRelation.set(p.relation, rec);
      }
      const lines = [];
      lines.push(`在册 ${active.length} 人（归档 ${Object.values(people.byId).length - active.length}）`);
      const relRows = [...byRelation.entries()].sort((a, b) => b[1].count - a[1].count);
      for (const [rel, rec] of relRows) {
        const avg = rec.daysN ? Math.round(rec.daysSum / rec.daysN) : 0;
        lines.push(`  ${rel} ${rec.count} 人 · 平均 ${avg} 天前联系${rec.warn ? ` · 黄榜 ${rec.warn}` : ''}${rec.lost ? ` · 红榜 ${rec.lost}` : ''}`);
      }
      const trend = core.contactTrend(journal.events, 12, now);
      const nonZero = trend.filter((t) => t.count > 0);
      if (nonZero.length) {
        lines.push(`近 12 个月联系 ${trend.reduce((s, t) => s + t.count, 0)} 次，最勤的月份：${nonZero.sort((a, b) => b.count - a.count).slice(0, 3).map((t) => `${t.month}（${t.count}）`).join('、')}`);
      } else {
        lines.push('近 12 个月还没有联系记录。');
      }
      const bal = core.favorBalance(journal.events);
      const balRows = Object.entries(bal)
        .map(([pid, b]) => ({ name: (people.byId[pid] || {}).name || '（已删除）', ...b, diff: b.gave - b.got }))
        .filter((b) => b.gave + b.got > 0)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      if (balRows.length) {
        lines.push('人情天平（帮了他/他帮我，中性记录）：');
        for (const b of balRows.slice(0, 8)) lines.push(`  ${b.name}：${b.gave} / ${b.got}${b.diff ? (b.diff > 0 ? '（我多付出）' : '（我多受惠）') : ''}`);
      }
      const allP = Object.values(promises.byId);
      const open = allP.filter((p) => p && p.status === 'open');
      lines.push(`承诺：未闭环 ${open.length}（我许的 ${open.filter((p) => p.direction === 'iowe').length} / 我等的 ${open.filter((p) => p.direction === 'owedme').length}）· 闭环 ${allP.filter((p) => p && p.status === 'done').length}`);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'ren_settings',
    description: '故人·节奏参数：defaultCadenceDays（默认联系节奏 7..365）、driftGraceDays（超节奏宽限天数 3..90）、birthdayDays（生日预告窗口 1..90）、dueWarnDays（承诺临期窗口 1..30）。action=get 查看 / update 修改。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'update'], description: '缺省 get' },
        defaultCadenceDays: { type: 'integer' },
        driftGraceDays: { type: 'integer' },
        birthdayDays: { type: 'integer' },
        dueWarnDays: { type: 'integer' },
      },
    },
    async call(args) {
      const cur = await loadSettings();
      if ((args.action || 'get') === 'get') {
        return ok([
          `默认联系节奏 ${cur.defaultCadenceDays} 天`,
          `失联宽限 ${cur.driftGraceDays} 天（超节奏这么久进红榜）`,
          `生日预告 ${cur.birthdayDays} 天`,
          `承诺临期 ${cur.dueWarnDays} 天`,
        ].join('\n'));
      }
      const n = core.normalizeSettings({ ...cur, ...args });
      if (n.error) return err(n.error);
      await kvSet(core.K.settings, n.settings);
      return ok([
        '已更新：',
        `默认联系节奏 ${n.settings.defaultCadenceDays} 天`,
        `失联宽限 ${n.settings.driftGraceDays} 天`,
        `生日预告 ${n.settings.birthdayDays} 天`,
        `承诺临期 ${n.settings.dueWarnDays} 天`,
      ].join('\n'));
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
