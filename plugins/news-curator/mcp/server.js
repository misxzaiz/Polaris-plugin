#!/usr/bin/env node
/**
 * news-curator MCP Server — AI 每日刊物的写入层
 *
 * 职责（仅数据读写，不抓取、不启服务）：
 *   - 读：用户偏好画像 / 已发布日报 / 已注册定时任务
 *   - 写：偏好（强制 reason + 可撤销）/ 日报（核心）/ 阅读反馈 / 定时任务规范
 *   - 播：news_brief 把日报章节转播报稿（宿主 AI 另调 mimo-tts 合成音频）
 *
 * 数据读写经 Polaris IPC bridge 的 router_dispatch（target=cap.kv）透传，
 * 与本插件面板共享同一份事实库（SqliteStorage domain=kv）。
 *
 * 连接方式（与 sim-paper-trading / polaris-scheduler 一致）：
 *   1. 环境变量 POLARIS_HOST + POLARIS_PORT + POLARIS_TOKEN（推荐）
 *   2. config.json（web.port/token，经 anchor 定位数据根）
 *   3. 默认 127.0.0.1:3000（无认证）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SERVER_NAME = 'news-curator';
const SERVER_VERSION = '0.2.0';
const PROTOCOL_VERSION = '2024-11-05';

// cap.kv 键空间（news.*，与面板共享）
const K = {
  prefs: 'news.prefs',
  prefsLog: 'news.prefsLog',
  progress: 'news.progress',
  sourcesLast: 'news.sources.last',
};

// 默认偏好（首启）
function defaultPrefs() {
  return {
    directions: {
      creative: true,   // 创意项目
      fund: true,       // 基金投资
      tech: true,       // AI 技术
      news: true,       // 时事
      learn: true,      // 学习（专业+通识）
    },
    watchlist: ['005844', '017811', '002910', '013835', '011369', '013840'],
    dailyTarget: 90,    // 每日目标分钟
    voice: { voice: '冰糖', speed: 1.0, autoAudio: false },
    learn: { proStage: 'L2', weeklyDays: 5, genTopics: [] },
    updatedAt: null,
  };
}

// ── Polaris IPC 自发现（同 sim-paper-trading）──────────────────────────────
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
      if (typeof web.port === 'number') {
        return { host: web.host || '', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* 跳过不可读的候选 */ }
  }
  return null;
}
function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/api/health', timeout: 1200 },
      (res) => { res.resume(); resolve(res.statusCode === 200); }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
let _endpointPromise = null;
function resolveEndpoint() {
  if (!_endpointPromise) {
    _endpointPromise = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) {
        return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      }
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        if (await healthCheck(host, basePort + i)) {
          return { host, port: basePort + i, token };
        }
      }
      return { host, port: basePort, token };
    })();
  }
  return _endpointPromise;
}

// ── 调用 Polaris IPC Bridge（router_dispatch） ──────────────────────────────
function polarisIpc(command, args = {}) {
  return new Promise((resolve, reject) => {
    resolveEndpoint()
      .then((ep) => {
        const data = JSON.stringify(args);
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        };
        if (ep.token) {
          headers['Authorization'] = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
        }
        const options = {
          hostname: ep.host,
          port: ep.port,
          path: `/api/${command.replace(/_/g, '-')}`,
          method: 'POST',
          headers,
          timeout: 30000,
        };
        const req = http.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => (responseData += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(responseData));
            } catch (e) {
              resolve(responseData);
            }
          });
        });
        req.on('error', (e) => reject(new Error(`Polaris IPC ${command} 失败: ${e.message}`)));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Polaris IPC timeout'));
        });
        req.write(data);
        req.end();
      })
      .catch((e) => reject(e));
  });
}

// ── cap.kv 读写（经 router_dispatch） ────────────────────────────────────────
async function kvGet(key) {
  const res = await polarisIpc('router_dispatch', {
    req: { target: 'cap.kv', payload: { action: 'get', key } },
  });
  if (!res || res.ok === false) {
    throw new Error(res && res.error ? res.error : 'cap.kv get 失败');
  }
  return res.result && res.result.value !== null && res.result.value !== undefined ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await polarisIpc('router_dispatch', {
    req: { target: 'cap.kv', payload: { action: 'set', key, value } },
  });
  if (!res || res.ok === false) {
    throw new Error(res && res.error ? res.error : 'cap.kv set 失败');
  }
  return res.result;
}

// ── 领域模型 ────────────────────────────────────────────────────────────────
async function readPrefs() {
  const p = await kvGet(K.prefs).catch(() => null);
  return p && typeof p === 'object' ? p : defaultPrefs();
}
async function readPrefsLog() {
  const l = await kvGet(K.prefsLog).catch(() => null);
  return Array.isArray(l) ? l : [];
}
/** 追加一条 AI 改动日志（撤销依据） */
async function appendPrefsLog(entry) {
  const log = await readPrefsLog();
  log.push({ ts: new Date().toISOString(), undone: false, ...entry });
  await kvSet(K.prefsLog, log.slice(-200));
  return log;
}

// ── MCP 工具处理 ────────────────────────────────────────────────────────────
function text(content, isError = false) {
  const c = Array.isArray(content)
    ? content.map((x) => ({ type: 'text', text: String(x) }))
    : [{ type: 'text', text: String(content) }];
  return { content: c, ...(isError ? { isError: true } : {}) };
}
function fail(err) {
  return text(`错误：${err.message || err}`, true);
}

// news_get_profile：读用户偏好画像（AI 决定日报权重）
async function handleGetProfile() {
  try {
    const [prefs, progress] = await Promise.all([readPrefs(), kvGet(K.progress).catch(() => null)]);
    return text(JSON.stringify({ prefs, progress }));
  } catch (e) {
    return fail(e);
  }
}

// news_set_prefs：AI 回写偏好（强制 reason，写入 prefsLog 可撤销）
async function handleSetPrefs(args) {
  try {
    const reason = String(args.reason || '').trim();
    if (!reason) return text('请提供 reason（为什么改偏好，AI 必须说明依据）', true);
    const patch = args.patch || {};
    if (typeof patch !== 'object' || Array.isArray(patch)) return text('patch 必须是对象', true);
    const cur = await readPrefs();
    // 合并（深层合并 directions 与 voice/learn 顶层覆盖）
    const next = { ...cur, ...patch, directions: { ...(cur.directions || {}), ...(patch.directions || {}) } };
    next.updatedAt = new Date().toISOString();
    await kvSet(K.prefs, next);
    const log = await appendPrefsLog({ tool: 'news_set_prefs', what: JSON.stringify(patch), reason });
    return text(JSON.stringify({ ok: true, prefs: next, logId: log[log.length - 1].ts }));
  } catch (e) {
    return fail(e);
  }
}

// news_undo_prefs：撤销最近一次（或指定 ts 的）AI 偏好改动
async function handleUndoPrefs(args) {
  try {
    const log = await readPrefsLog();
    const idx = args.ts
      ? log.findIndex((l) => l.ts === String(args.ts))
      : log.length - 1;
    if (idx < 0) return text('没有可撤销的改动', true);
    const entry = log[idx];
    if (entry.undone) return text('该改动已撤销过', true);
    // 重建撤销前的偏好：回放该条目之前的日志（方向做反相、其余还原 by diff）
    const replay = [];
    for (const l of log.slice(0, idx)) {
      if (!l.undone) replay.push(l);
    }
    // 从默认偏好开始回放
    let prefs = defaultPrefs();
    // 回放时还原 prefsLog 记录的最终值：直接回读当前值不可行，改为从快照回放
    // 简化：把该条改动前的所有已生效改动合并回放（正向应用）
    // 由于日志只存 patch，正向回放即可重建"撤销点"的偏好
    // —— 但注意当前 prefs 可能含用户手动改动；这里采用保守策略：
    //   仅还原该条目涉及的字段（what 里的 keys），其它保留现状。
    const cur = await readPrefs();
    const what = entry.what || '{}';
    let patchedKeys = [];
    try { patchedKeys = Object.keys(JSON.parse(what)); } catch (_) { /* 忽略 */ }
    const next = { ...cur };
    for (const key of patchedKeys) {
      delete next[key];
    }
    if (patchedKeys.includes('directions')) {
      // directions 的还原：把该条目里被打开的方向关闭、被关闭的打开（近似反转）
      const p = entry.patch || {};
      const dirPatch = p.directions || {};
      const dirs = { ...(cur.directions || {}) };
      for (const k of Object.keys(dirPatch)) {
        if (k in dirs) dirs[k] = !dirPatch[k];
      }
      next.directions = dirs;
    }
    next.updatedAt = new Date().toISOString();
    await kvSet(K.prefs, next);
    entry.undone = true;
    await kvSet(K.prefsLog, log);
    return text(JSON.stringify({ ok: true, undone: { ts: entry.ts, what: entry.what, reason: entry.reason }, prefs: next }));
  } catch (e) {
    return fail(e);
  }
}

// news_register_schedule：把「每天定时抓取并 publish」写成宿主 scheduler 任务
// （透传 scheduler_create_task IPC + chat 类型执行器，见 §3 规划）
async function handleRegisterSchedule(args) {
  try {
    const name = String(args.name || '每日刊物').trim();
    const cron = String(args.cron || '0 30 8 * * *').trim();
    const prompt = String(args.prompt || '')
      .trim() || '用内置浏览器抓取今日信息（基金/技术/时事/创意），按 news_* 工具规范生成并发布每日刊物';
    const res = await polarisIpc('scheduler_create_task', {
      name,
      triggerType: 'cron',
      triggerValue: cron,
      executorType: 'chat',
      executorParams: { prompt },
      tags: ['news-curator'],
    });
    return text(JSON.stringify({ ok: true, scheduler: res }));
  } catch (e) {
    return fail(e);
  }
}

// news_list_schedules：列出本插件已注册的定时任务（透传 scheduler_list_tasks）
async function handleListSchedules() {
  try {
    const res = await polarisIpc('scheduler_list_tasks', {});
    const list = (res && res.result) || res || [];
    const mine = Array.isArray(list) ? list.filter((t) => t && (t.tags || []).includes('news-curator')) : [];
    return text(JSON.stringify({ schedules: mine.length ? mine : list }));
  } catch (e) {
    return fail(e);
  }
}

// news_get_daily：读某天已发布日报
async function handleGetDaily(args) {
  try {
    const date = String(args.date || new Date().toISOString().slice(0, 10));
    const daily = await kvGet(`news.daily.${date}`).catch(() => null);
    if (!daily) return text(JSON.stringify({ date, daily: null, message: `暂无 ${date} 的日报，请先用 news_publish_daily 生成` }));
    return text(JSON.stringify({ date, daily }));
  } catch (e) {
    return fail(e);
  }
}

// 日报 schema 校验（轻量，publish 前防御）
const SECTION_TYPES = ['summary', 'fund', 'tech', 'news', 'creative', 'learn'];
function validateDaily(daily) {
  if (!daily || typeof daily !== 'object') return '日报必须是对象';
  if (!daily.date || typeof daily.date !== 'string') return '缺少 date';
  if (!Array.isArray(daily.sections)) return 'sections 必须是数组';
  for (const s of daily.sections) {
    if (!s || typeof s !== 'object') return 'section 必须是对象';
    if (!SECTION_TYPES.includes(s.type)) return `未知 section type: ${s.type}`;
    if (!s.title) return 'section 缺少 title';
  }
  return null;
}

// news_publish_daily：核心写入 —— 校验后写 cap.kv news.daily.<date>
async function handlePublishDaily(args) {
  try {
    const daily = args.daily;
    const err = validateDaily(daily);
    if (err) return text(`校验失败：${err}`, true);
    const existing = await kvGet(`news.daily.${daily.date}`).catch(() => null);
    await kvSet(`news.daily.${daily.date}`, daily);
    // 更新最近抓取 hash（供 AI 去重）
    if (args.sources && typeof args.sources === 'object') {
      await kvSet(K.sourcesLast, { ...(await kvGet(K.sourcesLast).catch(() => ({}))), ...args.sources, date: daily.date });
    }
    return text(JSON.stringify({
      ok: true,
      date: daily.date,
      sections: daily.sections.length,
      totalMinutes: daily.totalMinutes || null,
      overwritten: !!existing,
    }));
  } catch (e) {
    return fail(e);
  }
}

// news_record_review：记录阅读反馈（收藏/读完/跳读/测验）→ 回流偏好
async function handleRecordReview(args) {
  try {
    const date = String(args.date || new Date().toISOString().slice(0, 10));
    const month = date.slice(0, 7);
    const review = {
      ts: new Date().toISOString(),
      date,
      kind: String(args.kind || 'read'), // read | favorite | quiz | checkin | skip
      itemId: args.itemId ? String(args.itemId) : null,
      detail: args.detail ? String(args.detail) : '',
      score: args.score != null ? Number(args.score) : null,
    };
    const monthKey = `news.reviews.${month}`;
    const list = await kvGet(monthKey).catch(() => null);
    const next = Array.isArray(list) ? list : [];
    next.push(review);
    await kvSet(monthKey, next.slice(-1000));
    // 同时维护进度摘要（面板读）
    const progress = await kvGet(K.progress).catch(() => null);
    const prog = progress && typeof progress === 'object' ? progress : { streak: 0, lastRead: null, learned: { pro: [], gen: [] }, favorites: [] };
    if (review.kind === 'checkin') {
      prog.streak = (prog.streak || 0) + 1;
      prog.lastRead = date;
    }
    if (review.kind === 'favorite' && review.itemId) {
      const favs = Array.isArray(prog.favorites) ? prog.favorites : [];
      if (!favs.includes(review.itemId)) favs.push(review.itemId);
      prog.favorites = favs.slice(-100);
    }
    await kvSet(K.progress, prog);
    return text(JSON.stringify({ ok: true, review, progress: prog }));
  } catch (e) {
    return fail(e);
  }
}

// news_brief：把日报某章转成播报稿（宿主 AI 再调 mimo_tts_synthesize 合成音频）
async function handleBrief(args) {
  try {
    const date = String(args.date || new Date().toISOString().slice(0, 10));
    const sectionType = String(args.section || 'summary');
    const daily = await kvGet(`news.daily.${date}`).catch(() => null);
    if (!daily) return text(JSON.stringify({ date, brief: null, message: `暂无 ${date} 的日报` }));
    const section = (daily.sections || []).find((s) => s.type === sectionType);
    if (!section) return text(JSON.stringify({ date, brief: null, message: `日报里没有 ${sectionType} 章节` }));
    // 播报稿：标题 + 条目要点（AI 可再润色；文本供 mimo-tts 直接合成）
    const items = Array.isArray(section.items) ? section.items : [];
    const lines = [`【${section.title}】`];
    for (const it of items) {
      lines.push(`- ${it.title || it.name || ''}${it.brief ? '：' + it.brief : ''}`);
    }
    const brief = lines.join('\n');
    return text(JSON.stringify({ date, section: sectionType, brief, hint: '把 brief 交给 mimo_tts_synthesize 合成音频，返回 data URL 内联 <audio> 展示' }));
  } catch (e) {
    return fail(e);
  }
}

// news_save_voice：AI 合成音频后把结果存到缓存（面板读 news.voice.<date>.<section> 真播放）
// 存两种形态：dataUrl（data:audio/...，base64 内联，app/桌面通用）或 url（file 托管）
async function handleSaveVoice(args) {
  try {
    const date = String(args.date || new Date().toISOString().slice(0, 10));
    const section = String(args.section || 'summary');
    if (!['summary', 'fund', 'tech', 'news', 'creative', 'learn'].includes(section)) {
      return text(`section 无效：${section}`, true);
    }
    const dataUrl = args.dataUrl ? String(args.dataUrl) : '';
    const url = args.url ? String(args.url) : '';
    const durationSec = args.durationSec != null ? Number(args.durationSec) : null;
    if (!dataUrl && !url) return text('dataUrl 与 url 至少传一个（mimo_tts_synthesize 的返回）', true);
    const voice = {
      section,
      dataUrl,
      url,
      durationSec,
      title: args.title ? String(args.title) : '',
      createdAt: new Date().toISOString(),
    };
    await kvSet(`news.voice.${date}.${section}`, voice);
    return text(JSON.stringify({ ok: true, key: `news.voice.${date}.${section}`, voice }));
  } catch (e) {
    return fail(e);
  }
}

// news_list_daily：枚举已发布的日报日期（cap.kv list 过滤 news.daily.* 前缀）
async function handleListDaily() {
  try {
    const res = await polarisIpc('router_dispatch', {
      req: { target: 'cap.kv', payload: { action: 'list' } },
    });
    const keys = Array.isArray(res && res.result && res.result.keys) ? res.result.keys : [];
    const dates = keys
      .filter((k) => typeof k === 'string' && k.startsWith('news.daily.'))
      .map((k) => k.slice('news.daily.'.length))
      .sort()
      .reverse();
    return text(JSON.stringify({ dates }));
  } catch (e) {
    return fail(e);
  }
}

// ── 工具注册表（8 + 1 撤销 = 9） ────────────────────────────────────────────
const TOOLS = [
  {
    name: 'news_get_profile',
    description:
      '读取用户偏好画像：关注方向开关（创意/基金/AI技术/时事/学习）+ 基金自选池 + 每日目标分钟 + 语音设置 + 弱信号（收藏/完读/打卡）。AI 据此决定日报各板块权重。',
    inputSchema: { type: 'object', properties: {} },
    handler: handleGetProfile,
  },
  {
    name: 'news_set_prefs',
    description:
      'AI 回写用户偏好（如发现用户常收藏基金类 → 提高基金权重）。必须提供 reason（改动依据），改动记入 news.prefsLog 且可在面板撤销。',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: '改动依据（必填，可撤销的依据）' },
        patch: {
          type: 'object',
          description: '要改的字段，如 { directions: { fund: true }, dailyTarget: 120 }',
        },
      },
      required: ['reason', 'patch'],
    },
    handler: handleSetPrefs,
  },
  {
    name: 'news_undo_prefs',
    description: '撤销最近一次（或指定 ts 的）AI 偏好改动，还原偏好并标记日志已撤销。',
    inputSchema: {
      type: 'object',
      properties: { ts: { type: 'string', description: '指定日志 ts；不传则撤销最近一条' } },
    },
    handler: handleUndoPrefs,
  },
  {
    name: 'news_register_schedule',
    description:
      '把「每天定时抓取并发布刊物」写成宿主 scheduler 任务（透传 scheduler_create_task + chat 执行器；SchedulerDaemon 到期创建 AI 会话执行 prompt）。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '任务名，默认「每日刊物」' },
        cron: { type: 'string', description: 'cron 表达式，默认 "0 30 8 * * *"（每天 08:30）' },
        prompt: { type: 'string', description: 'chat 执行器的提示词（含抓取 + publish 规范）' },
      },
    },
    handler: handleRegisterSchedule,
  },
  {
    name: 'news_list_schedules',
    description: '列出本插件已注册的定时任务（透传 scheduler_list_tasks）。',
    inputSchema: { type: 'object', properties: {} },
    handler: handleListSchedules,
  },
  {
    name: 'news_get_daily',
    description: '读取某天的已发布日报（date=YYYY-MM-DD，缺省今天）。返回完整 sections，供 AI 复盘/摘要/语音。',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' } },
    },
    handler: handleGetDaily,
  },
  {
    name: 'news_publish_daily',
    description:
      '核心写入：发布每日刊物。daily 需含 date + sections（type 枚举 summary/fund/tech/news/creative/learn，每 section 有 title 与 items）+ totalMinutes。校验通过后写 cap.kv news.daily.<date>；可选传 sources 记录抓取 hash 供去重。',
    inputSchema: {
      type: 'object',
      properties: {
        daily: {
          type: 'object',
          description: '{ date, totalMinutes, summary, sections: [{type,title,items:[{title|name,brief,url?,meta?}]}], quiz? }',
        },
        sources: { type: 'object', description: '可选：{ 源id: hash } 供 AI 下次去重' },
      },
      required: ['daily'],
    },
    handler: handlePublishDaily,
  },
  {
    name: 'news_record_review',
    description:
      '记录阅读反馈（kind: read/favorite/quiz/checkin/skip）到 news.reviews.<月>，并汇总进 news.progress（打卡连击/收藏列表）。面板阅读行为回流给 AI 调整权重。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
        kind: { type: 'string', enum: ['read', 'favorite', 'quiz', 'checkin', 'skip'] },
        itemId: { type: 'string' },
        detail: { type: 'string' },
        score: { type: 'number' },
      },
      required: ['kind'],
    },
    handler: handleRecordReview,
  },
  {
    name: 'news_brief',
    description:
      '把日报某章转成播报稿文本（section: summary/fund/tech/news/creative/learn）。宿主 AI 把返回的 brief 交给 mimo_tts_synthesize 合成音频，面板用 <audio> 内联播放。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
        section: { type: 'string', description: '章节类型，默认 summary' },
      },
    },
    handler: handleBrief,
  },
  {
    name: 'news_save_voice',
    description:
      'AI 把 mimo_tts_synthesize 合成的章节音频存入面板缓存（news.voice.<date>.<section>），面板「语音」页即可直接 <audio> 播放，无需再走聊天。dataUrl（base64 内联）与 url（file 托管）二选一至少传一个。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
        section: { type: 'string', enum: ['summary', 'fund', 'tech', 'news', 'creative', 'learn'] },
        dataUrl: { type: 'string', description: '音频 data URL（mimo_tts_synthesize 返回，outputMode=base64）' },
        url: { type: 'string', description: '音频托管 url（mimo_tts_synthesize 返回，outputMode=file）' },
        title: { type: 'string', description: '章节标题，可选' },
        durationSec: { type: 'number', description: '音频时长秒，可选' },
      },
    },
    handler: handleSaveVoice,
  },
  {
    name: 'news_list_daily',
    description: '枚举已发布日报的日期列表（按日期倒序），供面板/历史页回看任意一天。',
    inputSchema: { type: 'object', properties: {} },
    handler: handleListDaily,
  },
];

// ── JSON-RPC 主循环（同 sim-paper-trading） ─────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      continue;
    }
    handleMessage(msg).catch((e) => {
      send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: String(e) } });
    });
  }
});

async function handleMessage(msg) {
  const { id, method } = msg;
  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
  }
  if (method === 'notifications/initialized') return; // no-op
  if (method === 'tools/list') {
    return send({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS.map(({ inputSchema, ...t }) => ({ ...t, inputSchema })) },
    });
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === (msg.params && msg.params.name));
    if (!tool) {
      return send({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `未知工具: ${msg.params && msg.params.name}` },
      });
    }
    const args = (msg.params && msg.params.arguments) || {};
    const result = await tool.handler(args);
    return send({ jsonrpc: '2.0', id, result });
  }
  if (method === 'ping') {
    return send({ jsonrpc: '2.0', id, result: {} });
  }
  return send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `不支持的方法: ${method}` },
  });
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
