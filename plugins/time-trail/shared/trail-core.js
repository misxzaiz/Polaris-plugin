'use strict';
/**
 * trail-core.js —— 刻漏纯函数核心（键构造 / 分类规则引擎 / 归集 / 聚合）
 *
 * 三方共用权威（与主仓 plans/time-trail-plugin-spec.md 键空间契约一致）：
 *   - service/trail.js   归集引擎（唯一写者）
 *   - mcp/server.js      AI 工具读数
 *   - src/model.ts       面板（类型镜像 + 少量展示辅助重复实现，勿在此加宿主依赖）
 *
 * 设计要点（spec §2/§5）：
 *   - 分类是视图不是数据：落库原始 appKey，规则读取时套用，改规则对历史即时生效
 *   - 归因上限 90s：休眠/采集器死亡不产生幽灵时间
 *   - 天记录全量覆写（服务内存权威副本），重启从 kv 装载续记，不双记
 */

const VERSION = '0.1.0';

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  snapshot: 'timetrail.snapshot',
  meta: 'timetrail.meta',
  settings: 'timetrail.settings',
  cats: 'timetrail.cats',
  day: (dateKey) => `timetrail.day.${dateKey}`,
  dayPrefix: 'timetrail.day.',
  cmd: (nonce) => `timetrail.cmd.${nonce}`,
  cmdPrefix: 'timetrail.cmd.',
  result: (nonce) => `timetrail.result.${nonce}`,
  resultPrefix: 'timetrail.result.',
};

// ── 常量 ───────────────────────────────────────────────────────────────────
const GAP_CAP_SECONDS = 90;        // 两行之间最大归因秒数（超过视为断流丢弃）
const HEARTBEAT_SEC = 60;          // 采集器无变化时的心跳输出周期
const TITLE_MAX = 80;              // 单标题截断（隐私边界）
const TITLES_PER_APP = 40;         // 单应用每日保留标题数
const APPKEY_MAX = 24;             // UWP 标题回退 appKey 截断

// ── 七类（固定集合，AI 归类也只允许落在这里）────────────────────────────────
const CATEGORIES = {
  dev:    { label: '开发', color: '#58A6FF', emoji: '⌨️' },
  create: { label: '创作', color: '#BC8CFF', emoji: '🎨' },
  meet:   { label: '沟通', color: '#3FB950', emoji: '💬' },
  browse: { label: '浏览', color: '#D29922', emoji: '🌐' },
  media:  { label: '影音', color: '#F778BA', emoji: '🎬' },
  play:   { label: '娱乐', color: '#F85149', emoji: '🎮' },
  other:  { label: '其他', color: '#8B95A7', emoji: '📦' },
};
const CAT_IDS = Object.keys(CATEGORIES);

// ── 内置默认规则（exact，命中 appKey 小写全等；用户规则优先于内置）────────────
const DEFAULT_RULES = {
  dev: [
    'code', 'devenv', 'idea64', 'idea', 'webstorm64', 'pycharm64', 'goland64',
    'rider64', 'clion64', 'datagrip64', 'phpstorm64', 'rider', 'fleet',
    'windowsterminal', 'wt', 'cmd', 'conhost', 'powershell', 'pwsh', 'hyper',
    'alacritty', 'wezterm', 'mintty', 'putty', 'mobaxterm', 'files',
    'gitkraken', 'fork', 'sourcetree', 'sublime_text', 'nvim', 'vim', 'emacs',
    'cursor', 'windsurf', 'trae', 'docker', 'postman', 'insomnia', 'dnspy',
  ],
  browse: [
    'chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'librewolf',
    '360se', '360chrome', 'qqbrowser', 'sogouexplorer', 'maxthon', 'arc',
  ],
  meet: [
    'wechat', 'weixin', 'qq', 'tim', 'dingtalk', 'dinglauncher', 'feishu',
    'lark', 'telegram', 'teams', 'slack', 'discord', 'zoom', 'wemeetapp',
    'outlook', 'thunderbird', 'foxmail', 'mailmaster', 'dingtalklauncher',
  ],
  create: [
    'photoshop', 'illustrator', 'indesign', 'premierepro', 'afterfx',
    'lightroom', 'lightroomclassic', 'blender', 'maya', 'c4d', 'cinema4d',
    'figma', 'sketch', 'affinityphoto', 'designer', 'gimp', 'krita',
    'winword', 'excel', 'powerpnt', 'onenote', 'onenotem', 'notepad',
    'notepad++', 'obs64', 'obs27', 'audacity', 'audition', 'typora',
    'obsidian', 'wps', 'et', 'wpp', 'snipaste', 'sharex',
  ],
  media: [
    'cloudmusic', 'netease_cloudmusic', 'qqmusic', 'kugou', 'kuwo', 'spotify',
    'potplayer', 'vlc', 'mpv', 'mpc-hc64', 'mpc-hc', 'wmplayer', 'foobar2000',
    'bilibili', 'iqiyi', 'youku', 'tencentdl', 'cloudmusicreporter',
  ],
  play: [
    'steam', 'steamwebhelper', 'epicgameslauncher', 'riotclientservices',
    'javaw', 'minecraft', 'leagueclient', 'league of legends', 'yuanshen',
    'genshinimpact', 'starfield', 'cloudgames', 'wegame', 'battlenet',
    'agent_4.0', 'minecraftlauncher', 'prismlauncher',
  ],
  other: [
    'explorer', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost',
    'taskmgr', 'msmpeng', 'securityhealthservice', 'control', 'systemsettings',
    'applicationframehost', 'runtimebroker', 'textinputhost', 'widgets',
  ],
};

// ── 展示名（builtin 常见进程 → 友好名；未命中用 appKey 原样/首字母大写）────────
const DISPLAY_NAMES = {
  code: 'VS Code', devenv: 'Visual Studio', windowsterminal: '终端', wt: '终端',
  cmd: '命令行', powershell: 'PowerShell', pwsh: 'PowerShell', conhost: '控制台',
  msedge: 'Edge', chrome: 'Chrome', firefox: 'Firefox', brave: 'Brave',
  wechat: '微信', weixin: '微信', qq: 'QQ', tim: 'TIM', dingtalk: '钉钉',
  feishu: '飞书', lark: '飞书', telegram: 'Telegram', teams: 'Teams',
  slack: 'Slack', discord: 'Discord', outlook: 'Outlook', foxmail: 'Foxmail',
  cloudmusic: '网易云音乐', qqmusic: 'QQ音乐', spotify: 'Spotify',
  potplayer: 'PotPlayer', vlc: 'VLC', mpv: 'mpv', bilibili: '哔哩哔哩',
  winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', onenote: 'OneNote',
  wps: 'WPS 文字', et: 'WPS 表格', wpp: 'WPS 演示', notepad: '记事本',
  'notepad++': 'Notepad++', typora: 'Typora', obsidian: 'Obsidian',
  photoshop: 'Photoshop', illustrator: 'Illustrator', premierepro: 'Premiere',
  afterfx: 'After Effects', blender: 'Blender', figma: 'Figma',
  steam: 'Steam', epicgameslauncher: 'Epic', wegame: 'WeGame', javaw: 'Minecraft',
  explorer: '文件资源管理器', taskmgr: '任务管理器', systemsettings: '系统设置',
  searchhost: '搜索', startmenuexperiencehost: '开始菜单', snipaste: 'Snipaste',
  sharex: 'ShareX', obs64: 'OBS', idea64: 'IntelliJ IDEA', pycharm64: 'PyCharm',
  applicationframehost: 'UWP 应用',
};

// ── 分类规则引擎 ───────────────────────────────────────────────────────────
/** 规则归一化：接受 {rules:[…]} 或裸数组；项可为 {match,cat}，非法丢弃 */
function normalizeRules(raw) {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray(raw.rules) ? raw.rules : []);
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const match = String(r.match || '').trim().toLowerCase();
    const kind = r.kind === 'prefix' ? 'prefix' : 'exact';
    const cat = String(r.cat || '');
    if (!match || !CAT_IDS.includes(cat)) continue;
    out.push({ match, kind, cat });
  }
  return out;
}

/** 精确命中优先（用户规则→内置默认），再前缀（最长前缀赢），兜底 other */
function classifyApp(appKey, userRulesRaw) {
  const key = String(appKey || '').toLowerCase();
  if (!key) return 'other';
  const user = normalizeRules(userRulesRaw);
  for (const r of user) if (r.kind === 'exact' && r.match === key) return r.cat;
  for (const cat of CAT_IDS) {
    if (DEFAULT_RULES[cat] && DEFAULT_RULES[cat].includes(key)) return cat;
  }
  let best = null;
  for (const r of user) {
    if (r.kind !== 'prefix' || !key.startsWith(r.match)) continue;
    if (!best || r.match.length > best.match.length) best = r;
  }
  return best ? best.cat : 'other';
}

/** appKey 是否已有归属（用户规则或内置默认） */
function isKnownApp(appKey, userRulesRaw) {
  const key = String(appKey || '').toLowerCase();
  if (!key) return true;
  for (const r of normalizeRules(userRulesRaw)) {
    if (r.kind === 'exact' && r.match === key) return true;
    if (r.kind === 'prefix' && key.startsWith(r.match)) return true;
  }
  for (const cat of CAT_IDS) {
    if (DEFAULT_RULES[cat] && DEFAULT_RULES[cat].includes(key)) return true;
  }
  return false;
}

/** UWP 宿主回退：ApplicationFrameHost 用标题作 appKey（截断），否则小写进程名去 .exe */
function appKeyOf(procName, title) {
  let name = String(procName || '').toLowerCase().replace(/\.exe$/, '').trim();
  if (name === 'applicationframehost') {
    const t = String(title || '').trim();
    if (t) return t.slice(0, APPKEY_MAX).toLowerCase();
  }
  return name || 'unknown';
}

// ── 归因 ───────────────────────────────────────────────────────────────────
/** 两行间的归因秒数：ms 差换算为秒并按 GAP_CAP_SECONDS 截断（≤0 无归因） */
function attributionSec(prevTs, curTs) {
  const ms = Number(curTs) - Number(prevTs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms / 1000, GAP_CAP_SECONDS);
}

// ── 天记录 ─────────────────────────────────────────────────────────────────
/** 本地日键 YYYY-MM-DD（与 service/dateKeyOf 同源） */
function dateKeyOf(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本地小时 0-23 */
function hourOf(ts) {
  return new Date(ts).getHours();
}

function emptyDay(dateKey) {
  return { v1: 1, date: dateKey, apps: {}, idleSec: 0, hours: {}, titles: {}, switches: 0, firstAt: 0, lastAt: 0 };
}

/** 归集一条间隙（就地修改 day；idle=true 归 idle 桶；跨小时归起始小时，≤60s 偏差见 spec） */
function dayAdd(day, { ts, sec, app, title, idle }) {
  if (!(sec > 0)) return day;
  const h = hourOf(ts);
  if (idle) {
    day.idleSec += sec;
    if (!day.hours[h]) day.hours[h] = {};
    day.hours[h]._idle = (day.hours[h]._idle || 0) + sec;
  } else if (app) {
    day.apps[app] = (day.apps[app] || 0) + sec;
    if (!day.hours[h]) day.hours[h] = {};
    day.hours[h][app] = (day.hours[h][app] || 0) + sec;
    if (title) {
      if (!day.titles[app]) day.titles[app] = {};
      const t = String(title).slice(0, TITLE_MAX);
      day.titles[app][t] = (day.titles[app][t] || 0) + sec;
    }
  }
  if (!day.firstAt || ts < day.firstAt) day.firstAt = ts;
  if (ts > day.lastAt) day.lastAt = ts;
  return day;
}

/** 标题削顶：每应用保留 top TITLES_PER_APP（防单应用标题爆炸） */
function capTitles(day, perApp = TITLES_PER_APP) {
  const apps = day && day.titles ? Object.keys(day.titles) : [];
  for (const a of apps) {
    const entries = Object.entries(day.titles[a]);
    if (entries.length <= perApp) continue;
    entries.sort((x, y) => y[1] - x[1]);
    day.titles[a] = Object.fromEntries(entries.slice(0, perApp));
  }
  return day;
}

/** 把 src 的累计量并进 target（add 语义；flush 合并与零点结转共用） */
function mergeDayInto(target, src) {
  if (!src) return target;
  for (const [app, sec] of Object.entries(src.apps || {})) {
    target.apps[app] = (target.apps[app] || 0) + (Number(sec) || 0);
  }
  target.idleSec += Number(src.idleSec) || 0;
  target.switches += Number(src.switches) || 0;
  for (const [h, bucket] of Object.entries(src.hours || {})) {
    if (!target.hours[h]) target.hours[h] = {};
    for (const [app, sec] of Object.entries(bucket)) {
      target.hours[h][app] = (target.hours[h][app] || 0) + (Number(sec) || 0);
    }
  }
  for (const [app, titles] of Object.entries(src.titles || {})) {
    if (!target.titles[app]) target.titles[app] = {};
    for (const [t, sec] of Object.entries(titles)) {
      target.titles[app][t] = (target.titles[app][t] || 0) + (Number(sec) || 0);
    }
  }
  if (src.firstAt && (!target.firstAt || src.firstAt < target.firstAt)) target.firstAt = src.firstAt;
  if (src.lastAt > target.lastAt) target.lastAt = src.lastAt;
  return target;
}

/** 天记录是否有任何内容（空缓冲跳过落盘） */
function hasDayContent(d) {
  if (!d) return false;
  if (Object.keys(d.apps || {}).length > 0) return true;
  if ((Number(d.idleSec) || 0) > 0) return true;
  if ((Number(d.switches) || 0) > 0) return true;
  for (const bucket of Object.values(d.hours || {})) {
    if (Object.keys(bucket).length > 0) return true;
  }
  return false;
}

/** kv 读回的天记录兜底（字段缺失补零；非法丢弃返回空天） */
function hydrateDay(raw, dateKey) {
  if (!raw || typeof raw !== 'object' || !raw.apps || typeof raw.apps !== 'object') return emptyDay(dateKey);
  return {
    v1: 1,
    date: typeof raw.date === 'string' ? raw.date : dateKey,
    apps: raw.apps,
    idleSec: Number(raw.idleSec) || 0,
    hours: raw.hours && typeof raw.hours === 'object' ? raw.hours : {},
    titles: raw.titles && typeof raw.titles === 'object' ? raw.titles : {},
    switches: Number(raw.switches) || 0,
    firstAt: Number(raw.firstAt) || 0,
    lastAt: Number(raw.lastAt) || 0,
  };
}

// ── 聚合（读取时套分类规则，改规则历史即时生效）──────────────────────────────
/**
 * @param days {Array<dayRecord>}
 * @param opts {{app?: string, cat?: string, rules?: raw, includeIdle?: boolean}}
 * @returns {{totalSec, idleSec, switches, byCat:{}, byApp:{}, byDay:{date:{totalSec, byCat:{}}}}}
 *   cat 过滤时 totalSec/byApp 只含该类；includeIdle 默认 false（idle 不计入应用总量）
 */
function aggregateDays(days, opts = {}) {
  const rules = opts.rules || {};
  const byCat = {};
  const byApp = {};
  const byDay = {};
  let totalSec = 0;
  let idleSec = 0;
  let switches = 0;
  for (const day of days || []) {
    if (!day || typeof day !== 'object') continue;
    idleSec += Number(day.idleSec) || 0;
    switches += Number(day.switches) || 0;
    let dayTotal = 0;
    const dayByCat = {};
    for (const [app, sec0] of Object.entries(day.apps || {})) {
      const sec = Number(sec0) || 0;
      if (sec <= 0) continue;
      const cat = classifyApp(app, rules);
      if (opts.cat && cat !== opts.cat) continue;
      if (opts.app && app !== String(opts.app).toLowerCase()) continue;
      totalSec += sec;
      dayTotal += sec;
      byApp[app] = (byApp[app] || 0) + sec;
      byCat[cat] = (byCat[cat] || 0) + sec;
      dayByCat[cat] = (dayByCat[cat] || 0) + sec;
    }
    if (day.date) byDay[day.date] = { totalSec: dayTotal, byCat: dayByCat, idleSec: Number(day.idleSec) || 0 };
  }
  return { totalSec, idleSec, switches, byCat, byApp, byDay };
}

/** 未知应用清单（按累计时长降序）：AI 归类的工作面 */
function unknownApps(days, rulesRaw, limit = 40) {
  const agg = aggregateDays(days, { rules: rulesRaw });
  return Object.entries(agg.byApp)
    .filter(([app]) => !isKnownApp(app, rulesRaw))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([app, sec]) => ({ app, sec }));
}

/** 分类条数据（今日/区间）：按类降序 */
function categoryBars(agg) {
  return Object.entries(agg.byCat)
    .map(([cat, sec]) => ({ cat, sec, ...(CATEGORIES[cat] || CATEGORIES.other) }))
    .sort((a, b) => b.sec - a.sec);
}

// ── 设置与清理 ─────────────────────────────────────────────────────────────
const SETTINGS_BOUNDS = {
  tickSec: [2, 15, 3],
  idleSec: [30, 1800, 180],
  retentionDays: [7, 365, 90],
};

function clamp(v, lo, hi, dft) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dft;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    tickSec: clamp(r.tickSec, ...SETTINGS_BOUNDS.tickSec),
    idleSec: clamp(r.idleSec, ...SETTINGS_BOUNDS.idleSec),
    retentionDays: clamp(r.retentionDays, ...SETTINGS_BOUNDS.retentionDays),
    captureTitles: r.captureTitles === true,
    paused: r.paused === true,
  };
}

/** 天键是否超出保留期（严格早于最早保留日） */
function isPrunable(dateKey, retentionDays, todayKey) {
  const t = new Date(`${todayKey}T00:00:00`);
  const earliest = new Date(t.getTime() - (retentionDays - 1) * 86400000);
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  return d < earliest;
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${s % 60 ? `${s % 60}秒` : ''}`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60 ? `${m % 60}分` : ''}`;
}

function displayName(appKey) {
  const k = String(appKey || '');
  if (DISPLAY_NAMES[k]) return DISPLAY_NAMES[k];
  if (!k) return k;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

module.exports = {
  VERSION, K, GAP_CAP_SECONDS, HEARTBEAT_SEC, TITLE_MAX, TITLES_PER_APP, APPKEY_MAX,
  CATEGORIES, CAT_IDS, DEFAULT_RULES, DISPLAY_NAMES, SETTINGS_BOUNDS,
  normalizeRules, classifyApp, isKnownApp, appKeyOf, attributionSec,
  dateKeyOf, hourOf, emptyDay, dayAdd, capTitles, hydrateDay, mergeDayInto, hasDayContent,
  aggregateDays, unknownApps, categoryBars,
  normalizeSettings, isPrunable, fmtDur, displayName,
};
