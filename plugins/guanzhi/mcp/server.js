#!/usr/bin/env node
'use strict';
/**
 * guanzhi MCP Server —— 观止（书影音消费账本）的 AI 工具层（无状态透传，零依赖）
 *
 * 职责：把 AI 的「记录/查询/推荐」意图翻译为 cap.kv 的 guanzhi.* 读写；
 * 全部计算逻辑走 shared/guanzhi-core.js（与面板同一权威，口径不漂移）。
 * 无后台服务、无网络请求——纯本地账本，数据不出设备。
 *
 * 工具一览：
 *   guanzhi_log       记一笔（同体裁同名自动判重 → 更新状态或新建）
 *   guanzhi_search    查记录（关键词/体裁/状态/心头好过滤）
 *   guanzhi_stats     问账（台账透视 + 年度报告）
 *   guanzhi_recommend 今晚看/读/玩什么（从想看清单与进行中给确定性推荐）
 *   guanzhi_update    改字段（部分补丁；评分传 null 清除）
 *   guanzhi_delete    彻底删除（需 confirm=true）
 *   guanzhi_import    批量导入（AI 批量入账 / 观止 JSON dump，≤500 条）
 *
 * 连接方式与 changqi / pocket-ledger 相同：
 *   env POLARIS_HOST/PORT/TOKEN → anchor.json → config.json → 端口扫描
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/guanzhi-core.js');

const SERVER_NAME = 'guanzhi';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 changqi / pocket-ledger）─────────────────────
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

// ── 数据访问 ───────────────────────────────────────────────────────────────
async function loadWorks() {
  const keys = await kvKeys();
  const workKeys = keys.filter((k) => k.startsWith(core.K.workPrefix)).sort();
  const works = [];
  for (const wk of workKeys) {
    // eslint-disable-next-line no-await-in-loop
    const v = await kvGet(wk);
    if (v && typeof v === 'object' && v.id) works.push(v);
  }
  return works;
}

async function loadWork(id) {
  if (!id || typeof id !== 'string') return null;
  const v = await kvGet(core.K.work(id));
  return v && typeof v === 'object' && v.id ? v : null;
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/** 解析日期参数：today/tomorrow/YYYY-MM-DD → 'YYYY-MM-DD' */
function resolveDayStr(input, now) {
  if (!input || input === 'today' || input === '今天') return core.todayStr(now);
  if (input === 'tomorrow' || input === '明天') return core.todayStr(now + 86400000);
  const s = String(input).trim();
  if (core.parseYMD(s)) return s;
  return null;
}

/** 剥离 undefined（applyPatch 只跳过 undefined，显式 null 有「清除」语义需保留） */
function stripUndefined(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'guanzhi_log',
    description: '观止·记一笔书影音。用户提到看/读完或想看某部作品时调用（"昨晚看完《流浪地球2》打9分"→ title=流浪地球2 kind=movie status=done rating=9；"想看《沙丘3》"→ status=wish；"开始读《三体》"→ status=active）。kind 必填（book/movie/tv/anime/music/game/podcast/other）；status 缺省 done；评分 0-10。同体裁同名记录已存在则自动更新状态/评分（如从想看改为看完）。AI 可凭常识补全 year/creator（作品年份、作者/导演/开发组）与 genre，用户没说的不要编造评分和短评。返回会带账本上下文（今年第几部）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '作品名（如"三体"）' },
        kind: { type: 'string', enum: core.KINDS, description: '体裁：book 书 / movie 电影 / tv 剧集 / anime 动画 / music 音乐 / game 游戏 / podcast 播客 / other' },
        status: { type: 'string', enum: core.STATUSES, description: 'wish 想看 / active 在看 / done 看完（缺省）/ dropped 弃了' },
        rating: { type: 'number', description: '用户评分 0-10（用户没打分就不传）' },
        note: { type: 'string', description: '用户的一句短评（≤500 字，用户原话，勿代写）' },
        finishDate: { type: 'string', description: '完成日 today/YYYY-MM-DD，缺省今天；看了一半开个头用 startDate' },
        startDate: { type: 'string', description: '开始日 today/YYYY-MM-DD（status=active 时缺省今天）' },
        year: { type: 'integer', description: '作品发行年份（1900-2100，可凭常识补全）' },
        creator: { type: 'string', description: '作者/导演/开发组/歌手（≤60 字）' },
        genre: { type: 'string', description: '类型标签（如"科幻/悬疑"）' },
        link: { type: 'string', description: '相关链接（豆瓣/Bangumi 等，http(s)://）' },
        favorite: { type: 'boolean', description: '标为心头好（年度十佳之外的私心偏爱）' },
      },
      required: ['title', 'kind'],
    },
    async call(args) {
      const now = Date.now();
      const today = core.todayStr(now);
      if (args.startDate != null && args.startDate !== '') {
        const s = resolveDayStr(args.startDate, now);
        if (!s) return err('startDate 格式应为 today/YYYY-MM-DD');
        args.startDate = s;
      }
      if (args.finishDate != null && args.finishDate !== '') {
        const f = resolveDayStr(args.finishDate, now);
        if (!f) return err('finishDate 格式应为 today/YYYY-MM-DD');
        args.finishDate = f;
      }
      if (args.startDate && args.finishDate && core.diffDays(args.startDate, args.finishDate) < 0) {
        return err('finishDate 不能早于 startDate');
      }
      const works = await loadWorks();
      const existing = core.findSameWork(works, args.kind, args.title);
      if (existing) {
        const patch = stripUndefined({ ...args });
        delete patch.title;
        delete patch.kind;
        const merged = core.applyPatch(existing, patch, now);
        if (merged.error) return err(merged.error);
        await kvSet(core.K.work(existing.id), merged.work);
        const fromLabel = core.statusLabel(existing.kind, existing.status);
        const toLabel = core.statusLabel(merged.work.kind, merged.work.status);
        return ok([
          fromLabel === toLabel
            ? `已更新已有记录：${core.fmtWorkLine(merged.work, today)}`
            : `已有记录状态已更新：${fromLabel} → ${toLabel}\n${core.fmtWorkLine(merged.work, today)}`,
          existing.id !== merged.work.id ? '' : `（记录 id：${existing.id}）`,
        ].filter(Boolean).join('\n'));
      }
      const norm = core.normalizeWork(args, now);
      if (norm.error) return err(norm.error);
      const work = norm.work;
      await kvSet(core.K.work(work.id), work);
      const ctx = [];
      if (work.status === 'done' && work.finishDate) {
        const sameKindThisYear = works.filter((w) => w.status === 'done' && w.kind === work.kind
          && (w.finishDate || '').slice(0, 4) === work.finishDate.slice(0, 4)).length;
        ctx.push(`这是你今年${core.KIND_LABELS[work.kind] || work.kind}账上的第 ${sameKindThisYear + 1} 部`);
      }
      if (work.status === 'wish') ctx.push(`心愿清单现有 ${works.filter((w) => w.status === 'wish').length + 1} 部，AI 随时可帮你挑今晚的`);
      return ok([`已记账：${core.fmtWorkLine(work, today)}`, ...ctx].join('\n'));
    },
  },
  {
    name: 'guanzhi_search',
    description: '观止·查记录。按关键词（标题/作者/类型/短评模糊）与体裁/状态/心头好过滤，按最近更新排序。适合"我看过什么科幻""上次给《X》打几分""我的想看清单""心头好有哪些"。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词（标题/作者/类型/短评模糊匹配）' },
        kind: { type: 'string', enum: core.KINDS, description: '体裁过滤' },
        status: { type: 'string', enum: core.STATUSES, description: 'wish 想看 / active 在看 / done 看完 / dropped 弃了' },
        favorite: { type: 'boolean', description: 'true=只看心头好' },
        limit: { type: 'integer', description: '返回条数上限（缺省 30，≤200）' },
      },
    },
    async call(args) {
      const today = core.todayStr();
      const works = await loadWorks();
      const list = core.searchWorks(works, args);
      if (!list.length) return ok('没有符合条件的记录。');
      return ok([`共 ${list.length} 条：`, ...list.map((w) => core.fmtWorkLine(w, today))].join('\n'));
    },
  },
  {
    name: 'guanzhi_stats',
    description: '观止·问账。台账透视（总数/想看/进行中/今年本月完成/评分均值/体裁分布/评分档）+ 指定年份的年度报告（完成数/分体裁/十佳/心头好/月度分布）。适合"我今年看了多少电影""我的平均分""2025 年度报告""什么类型我看得最多"。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '年报年份（缺省当前年）' },
      },
    },
    async call(args) {
      const today = core.todayStr();
      const works = await loadWorks();
      if (!works.length) return ok('账本还是空的——聊天里说「看完《××》打9分」即可记第一笔。');
      const ov = core.computeOverview(works, today);
      const lines = [
        `账本共 ${ov.total} 条：想看 ${ov.byStatus.wish} · 在进行 ${ov.byStatus.active} · 完成 ${ov.byStatus.done} · 弃 ${ov.byStatus.dropped}（心头好 ${ov.favoriteCount}）`,
        `今年已完成 ${ov.thisYearDone} 部，本月 ${ov.thisMonthDone} 部`,
      ];
      if (ov.avgRating != null) lines.push(`评分均值 ${ov.avgRating} 分（已评 ${ov.ratedCount} 条）`);
      if (ov.avgByKind.length) {
        lines.push(`分体裁：${ov.avgByKind.slice(0, 6).map((k) => `${k.label} ×${k.count}（均 ${k.avg}）`).join('、')}`);
      }
      if (ov.activeList.length) {
        lines.push(`正在进行 ${ov.activeList.length} 项：${ov.activeList.slice(0, 3).map((w) => `《${w.title}》`).join('、')}${ov.activeList.length > 3 ? ' 等' : ''}`);
      }
      const year = Math.floor(Number(args.year)) || Number(today.slice(0, 4));
      const yr = core.computeYearReport(works, year);
      lines.push(`—— ${year} 年报 ——`);
      lines.push(`完成 ${yr.doneCount} 部${yr.avgRating != null ? `，均分 ${yr.avgRating}` : ''}${yr.wishCarryover ? `；清单里还压着 ${yr.wishCarryover} 项从更早年份留到现在的` : ''}`);
      if (yr.perKind.length) {
        lines.push(`分体裁：${yr.perKind.slice(0, 6).map((k) => `${k.label} ×${k.count}`).join('、')}`);
      }
      if (yr.top.length) {
        lines.push(`年度十佳：${yr.top.slice(0, 10).map((w) => `《${w.title}》${w.rating}分`).join('、')}`);
      }
      if (yr.favorites.length) {
        lines.push(`心头好：${yr.favorites.map((w) => `《${w.title}》`).join('、')}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'guanzhi_recommend',
    description: '观止·今晚看/读/玩什么。从想看清单（躺得越久越优先+逐日轮换）与进行中项（先收尾）给确定性推荐，附用户口味画像（分体裁均分/高频类型）。适合"今晚看什么""推荐一部电影""接下来读什么"。kind 传体裁可定向推荐。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: core.KINDS, description: '定向体裁（不传=全池）' },
        count: { type: 'integer', description: '推荐条数（缺省 3，≤10）' },
      },
    },
    async call(args) {
      const today = core.todayStr();
      const works = await loadWorks();
      if (!works.length) return ok('账本还是空的——先记几笔，推荐才有口味依据。');
      const rec = core.recommend(works, today, args);
      const lines = [];
      if (rec.continueList.length) {
        lines.push('先收尾：');
        for (const c of rec.continueList) {
          lines.push(`  《${c.title}》（${core.KIND_LABELS[c.kind] || c.kind}）${c.daysOpen != null ? `开 ${c.daysOpen} 天了` : '进行中'}`);
        }
      }
      if (rec.picks.length) {
        lines.push(`${rec.kind ? `${core.KIND_LABELS[rec.kind]}推荐` : '心愿清单轮换'}：`);
        for (const p of rec.picks) {
          lines.push(`  《${p.title}》${p.year ? `（${p.year}${p.creator ? `，${p.creator}` : ''}）` : ''} — ${p.reason}`);
        }
      } else if (!rec.continueList.length) {
        lines.push(rec.kind ? `想${core.KIND_VERBS[rec.kind] || '看'}清单里还没有${core.KIND_LABELS[rec.kind]}——记一笔心愿就有了。` : '想看清单是空的——聊天里说「想看《××》」即可加入。');
      }
      if (rec.taste.avgByKind.length) {
        lines.push(`口味参考：${rec.taste.avgByKind.slice(0, 4).map((k) => `${k.label}均 ${k.avg}×${k.count}`).join('、')}`);
      }
      if (rec.taste.topGenres.length) {
        lines.push(`高频类型：${rec.taste.topGenres.map((g) => `${g.genre}×${g.count}`).join('、')}`);
      }
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'guanzhi_update',
    description: '观止·修改记录字段（部分补丁）。可改 title/kind/status/rating/startDate/finishDate/year/creator/genre/note/link/favorite；rating 传 null 清除评分；status 改为 wish 会清掉日期、改为 done 缺完成日会记今天。先 guanzhi_search 拿 id 再调用。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '记录 id（guanzhi_search 里方括号内）' },
        title: { type: 'string' },
        kind: { type: 'string', enum: core.KINDS },
        status: { type: 'string', enum: core.STATUSES },
        rating: { type: ['number', 'null'], description: '0-10；null=清除评分' },
        note: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        finishDate: { type: 'string', description: 'YYYY-MM-DD' },
        year: { type: 'integer' },
        creator: { type: 'string' },
        genre: { type: 'string' },
        link: { type: 'string' },
        favorite: { type: 'boolean' },
      },
      required: ['id'],
    },
    async call(args) {
      const work = await loadWork(args.id);
      if (!work) return err(`未找到记录 ${args.id}（用 guanzhi_search 确认 id）`);
      const now = Date.now();
      const patch = stripUndefined({ ...args });
      delete patch.id;
      if (patch.startDate != null && patch.startDate !== '') {
        const s = resolveDayStr(patch.startDate, now);
        if (!s) return err('startDate 格式应为 YYYY-MM-DD');
        patch.startDate = s;
      }
      if (patch.finishDate != null && patch.finishDate !== '') {
        const f = resolveDayStr(patch.finishDate, now);
        if (!f) return err('finishDate 格式应为 YYYY-MM-DD');
        patch.finishDate = f;
      }
      const merged = core.applyPatch(work, patch, now);
      if (merged.error) return err(merged.error);
      await kvSet(core.K.work(work.id), merged.work);
      return ok(`已更新：${core.fmtWorkLine(merged.work, core.todayStr(now))}`);
    },
  },
  {
    name: 'guanzhi_delete',
    description: '观止·彻底删除记录（不可恢复）。必须 confirm=true 才执行；一般改错状态/评分请用 guanzhi_update。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '记录 id' },
        confirm: { type: 'boolean', description: '必须显式传 true' },
      },
      required: ['id', 'confirm'],
    },
    async call(args) {
      if (args.confirm !== true) return err('删除不可恢复，需显式 confirm=true（改字段请用 guanzhi_update）');
      const work = await loadWork(args.id);
      if (!work) return err(`未找到记录 ${args.id}`);
      await kvDel(core.K.work(args.id));
      return ok(`已删除《${work.title}》的记录（${args.id}）。`);
    },
  },
  {
    name: 'guanzhi_import',
    description: '观止·批量导入。AI 把一批作品（如用户贴来的豆瓣导出、自己整理的清单）整理成 works 数组后一次写入；也接受观止设置页导出的 JSON dump。同体裁同名同年份判重跳过，逐条校验并回报拒绝原因。单次 ≤500 条。',
    inputSchema: {
      type: 'object',
      properties: {
        works: {
          type: 'array',
          description: '记录数组，每条 {title, kind, status?, rating?, finishDate?, startDate?, year?, creator?, genre?, note?, favorite?}',
          items: { type: 'object' },
        },
      },
      required: ['works'],
    },
    async call(args) {
      const norm = core.normalizeImport(args.works, await loadWorks());
      if (norm.error) return err(norm.error);
      for (const w of norm.accepted) {
        // eslint-disable-next-line no-await-in-loop
        await kvSet(core.K.work(w.id), w);
      }
      const lines = [`导入 ${norm.accepted.length} 条${norm.duplicates ? `，判重跳过 ${norm.duplicates} 条` : ''}${norm.rejected.length ? `，拒绝 ${norm.rejected.length} 条` : ''}。`];
      if (norm.rejected.length) {
        for (const r of norm.rejected.slice(0, 5)) lines.push(`  第 ${r.index + 1} 条被拒：${r.error}`);
        if (norm.rejected.length > 5) lines.push(`  …另有 ${norm.rejected.length - 5} 条`);
      }
      return ok(lines.join('\n'));
    },
  },
];

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
