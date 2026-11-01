#!/usr/bin/env node
'use strict';
/**
 * 闪造 FlashForge MCP Server —— AI 应用作坊工具层（零依赖 stdio，无状态透传）
 *
 * 职责：把 AI「造一个小应用」的意图落为 cap.kv 的 ff.* 键写入；全部限额/扫描/
 * 分块/索引/成绩口径走 shared/forge-core.js（与面板同一权威）。
 * 纯本地：无网络请求、无 shell、无 fs 写入（只经宿主 router_dispatch 落 kv）。
 *
 * 工具一览（七）：
 *   ff_create   扫描+入库 v1（title/kind/html）
 *   ff_iterate  追加 v(n+1)，head 前移（版本只增不改）
 *   ff_source   装配+sha 校验返回整份源码（新会话续作前读）
 *   ff_list     索引清单（含最高分；绝不调 cap.kv list）
 *   ff_push     标记 pushedAt，手机端「新造好」徽标
 *   ff_score    读榜/清榜（clear 需 confirm=id）
 *   ff_delete   删应用+全部版本+成绩（confirm=id）
 *
 * 连接方式与 xintu / pocket-ledger 相同：env → anchor.json → config.json → 端口扫描。
 */
const http = require('http');
const crypto = require('crypto');
const { createKvClient } = require('./kvclient.js');
const core = require('../shared/forge-core.js');

const SERVER_NAME = 'flashforge';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

async function kvGet(key) {
  const r = await kv.dispatchOk('cap.kv', { action: 'get', key });
  return r && r.value !== undefined ? r.value : null;
}
async function kvSet(key, value) {
  await kv.dispatchOk('cap.kv', { action: 'set', key, value: value === undefined ? null : value });
  return true;
}
async function kvDel(key) {
  await kv.dispatchOk('cap.kv', { action: 'delete', key });
  return true;
}

// ⚠️ 绝不调用 cap.kv 的 list 动作（实测大数据根上会拖垮宿主）。清单一律走 ff.apps 索引键。

// ── 数据访问 ───────────────────────────────────────────────────────────────

async function loadIndex() {
  const raw = await kvGet(core.K.INDEX).catch(() => null);
  return core.sanitizeIndex(raw);
}

async function saveIndex(index) {
  await kvSet(core.K.INDEX, index);
}

/** 读-合并-写：把本进程刚改出的条目与宿主最新索引合并后回写（抗双端并发） */
async function commitIndex(localIndex, changedId) {
  const remote = await loadIndex();
  const entry = localIndex.find((x) => x.id === changedId) || null;
  const merged = entry ? core.upsertIndex(remote, entry) : core.removeIndex(remote, changedId);
  await saveIndex(merged);
  return merged;
}

async function loadApp(id) {
  if (!core.validId(id)) return null;
  const index = await loadIndex();
  return index.find((x) => x.id === id) || null;
}

/** 装配指定版本源码并校验 sha256（Node crypto） */
async function loadVersionSource(app, v) {
  const ver = app.versions.find((x) => x.v === v);
  if (!ver) return { error: `版本 v${v} 不存在。` };
  const first = await kvGet(core.K.verPart(app.id, v, 0)).catch(() => null);
  if (first === null) return { error: `版本 v${v} 源码块缺失（可能被外部清理）。` };
  const parts = [first];
  // 块数无法从清单直接得出（按体积推算），逐块读到空为止；
  // 上限 = ceil(MAX_SOURCE_BYTES/CHUNK)+1 防失控。
  const maxParts = Math.ceil(core.LIMITS.MAX_SOURCE_BYTES / core.LIMITS.CHUNK_CHARS) + 2;
  for (let i = 1; i < maxParts; i++) {
    // eslint-disable-next-line no-await-in-loop
    const p = await kvGet(core.K.verPart(app.id, v, i)).catch(() => null);
    if (p === null || p === undefined) break;
    parts.push(p);
  }
  const html = core.assembleParts(parts);
  if (html === null) return { error: `版本 v${v} 源码块损坏。` };
  const actual = crypto.createHash('sha256').update(Buffer.from(html, 'utf8')).digest('hex');
  if (actual !== ver.sha256) {
    return { error: `版本 v${v} 完整性校验失败（sha256 不符，expected=${ver.sha256.slice(0, 12)}… actual=${actual.slice(0, 12)}…）。数据可能被外部改动，拒绝使用。` };
  }
  return { html, ver };
}

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
const fmtSize = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`);

async function bestScoreOf(id) {
  const raw = await kvGet(core.K.score(id)).catch(() => null);
  const top = core.topScores(core.sanitizeScores(raw), 1);
  return top.length ? top[0] : null;
}

// ── 创作契约（写进工具 description，AI 每次可见） ────────────────────────────
const CONTRACT = [
  '创作契约（违反会被扫描拒绝或无法运行）：',
  '1) html 必须是自包含单 HTML：样式 <style>、逻辑 <script> 全部内联；不引用任何外部资源（无 CDN/图片外链/字体外链）；不用 fetch/XHR/WebSocket/import（扫描到即拒绝入库）。',
  `2) 总体积 ≤200KB；必须含 <!DOCTYPE html> 与 <meta name="viewport" content="width=device-width, initial-scale=1">（手机可玩）；输入要三路绑定 ['pointerdown','mousedown','touchstart']（同一按压会连发，用 300ms 时间戳去重——部分 WebView 只派发其中一种）；布局适配竖屏。`,
  '3) 运行在无同源沙箱 iframe：不要用 localStorage/sessionStorage/alert/confirm（会抛错或静默失效）——状态放内存变量。',
  `4) 游戏类在「一局结束」时上报成绩：parent.postMessage({ __ff: 1, type: 'score', score: <数值> }, '*')。`,
  '5) 代码要健壮：不依赖网络时间；requestAnimationFrame 驱动主循环；避免死循环（AI 生成代码常见退化为 while 无退出）。',
].join('\n');

// ── 工具 ───────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'ff_create',
    description: [
      '闪造·新建应用：把一份自包含单 HTML 小应用（游戏/微工具/教具）登记入库并立即可玩。用户说「给我造一个…」「写个小游戏」「做个小工具」时用。',
      CONTRACT,
      'kind：game=可玩小游戏 / tool=日用微工具 / teach=互动教具。成功后面板（活动栏「闪造应用作坊」）与手机端立即可见，告诉用户「打开闪造面板即可玩」。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: `应用名（≤${core.LIMITS.MAX_TITLE} 字，如「霓虹贪吃蛇」）` },
        kind: { type: 'string', enum: core.KINDS, description: '应用类型' },
        html: { type: 'string', description: '自包含单 HTML 源码（≤200KB，见创作契约）' },
        changelog: { type: 'string', description: `版本说明（≤${core.LIMITS.MAX_CHANGELOG} 字，可省略=「初版」）` },
        tags: { type: 'array', items: { type: 'string' }, description: `标签（≤${core.LIMITS.MAX_TAGS} 个，每个≤${core.LIMITS.MAX_TAG_LEN} 字）` },
      },
      required: ['title', 'kind', 'html'],
    },
    async call(args) {
      const index = await loadIndex();
      if (index.length >= core.LIMITS.MAX_APPS) {
        return err(`应用数已达上限 ${core.LIMITS.MAX_APPS}，请先整理（ff_delete 删旧应用）。`);
      }
      // 先扫描（未通过即拒绝，不产生任何写入）
      const report = core.scanSource(args.html);
      if (!report.ok) {
        return err(`扫描未通过，未入库（请修正后整体重发）：\n${core.scanReportText(report)}`);
      }
      const sha = crypto.createHash('sha256').update(Buffer.from(args.html, 'utf8')).digest('hex');
      let built = core.newApp({ ...args, sha256: sha });
      if (built.error) return err(built.error);
      if (await loadApp(built.app.id)) {
        // id 碰撞（10 位 base36 概率≈1/3.6e15，仍换种子重试一次）
        let seed = (Date.now() % 100000) + 7;
        built = core.newApp({ ...args, sha256: sha }, {
          rand: () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; },
        });
        if (built.error) return err(built.error);
      }
      const app = built.app;
      // 两步写：先源码块，再索引（中途失败残留孤儿块无害，索引不引用即不可见）
      for (let i = 0; i < built.parts.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await kvSet(core.K.verPart(app.id, 1, i), built.parts[i]);
      }
      await commitIndex([app], app.id);
      const warns = report.warnings.length
        ? `\n扫描提醒：\n${report.warnings.map((w) => `- ${w.rule}：${w.hint}`).join('\n')}`
        : '';
      return ok([
        `已入库《${app.title}》（id=${app.id}，game/tool/teach=${app.kind}，v1，${fmtSize(app.size)}）${warns}`,
        `用户现在就能玩：桌面/手机打开活动栏「闪造应用作坊」→ 应用架 → 点击运行；游戏结束成绩会自动上跨端高分榜。`,
        `迭代请用 ff_iterate（传 id=${app.id}）；继续造下一个用 ff_create。`,
      ].join('\n'));
    },
  },
  {
    name: 'ff_iterate',
    description: [
      '闪造·迭代应用：给已有应用追加新版本（版本只增不改，可随时回退）。用户说「加个音效」「改一下难度」「换个皮肤」时用。',
      `流程建议：本会话内你已有源码语境可直接整份重写提交；新会话先 ff_source 读当前版再改。整份 html 重发（不做局部补丁）。`,
      CONTRACT,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '应用 id（ff_list 获得）' },
        html: { type: 'string', description: '新版完整源码（≤200KB）' },
        changelog: { type: 'string', description: `本次改动说明（≤${core.LIMITS.MAX_CHANGELOG} 字，如「加音效与暂停键」）` },
      },
      required: ['id', 'html'],
    },
    async call(args) {
      const app = await loadApp(args.id);
      if (!app) return err(`应用不存在或已删除：${args.id}（ff_list 查看现有应用）`);
      const report = core.scanSource(args.html);
      if (!report.ok) {
        return err(`扫描未通过，未入库（请修正后整体重发）：\n${core.scanReportText(report)}`);
      }
      const sha = crypto.createHash('sha256').update(Buffer.from(args.html, 'utf8')).digest('hex');
      const built = core.appendVersion(app, { html: args.html, changelog: args.changelog, sha256: sha, warnCount: report.warnings.length });
      if (built.error) return err(built.error);
      for (let i = 0; i < built.parts.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await kvSet(core.K.verPart(app.id, built.version.v, i), built.parts[i]);
      }
      const merged = await commitIndex([built.app], app.id);
      const delta = built.version.size - app.size;
      const warns = report.warnings.length
        ? `\n扫描提醒：\n${report.warnings.map((w) => `- ${w.rule}：${w.hint}`).join('\n')}`
        : '';
      return ok([
        `《${built.app.title}》已更新到 v${built.version.v}（${fmtSize(built.version.size)}，${delta >= 0 ? '+' : ''}${fmtSize(Math.abs(delta))} vs 上一版）${warns}`,
        `现共 ${built.app.versions.length} 个版本，head=v${built.app.head}；旧版本可在面板详情里回退（回退=复制为新版本，不覆盖历史）。`,
      ].join('\n'));
    },
  },
  {
    name: 'ff_source',
    description: '闪造·读应用源码：返回指定版本（默认 head）的完整 HTML（sha256 校验通过才返回）。用于新会话续作迭代前了解当前实现；本会话刚 ff_create/ff_iterate 过则不必再读。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '应用 id' },
        v: { type: 'number', description: '版本号（省略=head 当前版）' },
      },
      required: ['id'],
    },
    async call(args) {
      const app = await loadApp(args.id);
      if (!app) return err(`应用不存在或已删除：${args.id}`);
      const v = args.v === undefined ? app.head : Number(args.v);
      if (!Number.isInteger(v)) return err('v 必须是整数版本号。');
      const r = await loadVersionSource(app, v);
      if (r.error) return err(r.error);
      return ok(`《${app.title}》 v${v}（${fmtSize(r.ver.size)}，${r.ver.changelog}）：\n${r.html}`);
    },
  },
  {
    name: 'ff_list',
    description: '闪造·列出全部应用（id、类型、当前版本、体积、更新时间、最高分）。用户说「我造过哪些」「打开上次那个」时先 list。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: core.KINDS, description: '按类型筛选（省略=全部）' },
      },
    },
    async call(args) {
      const index = await loadIndex();
      const list = core.KINDS.includes(args.kind) ? index.filter((x) => x.kind === args.kind) : index;
      if (!list.length) {
        return ok('应用架还是空的。对用户说「想要什么小应用/小游戏，一句话我来造」，然后 ff_create。');
      }
      const lines = [];
      for (const a of list) {
        // eslint-disable-next-line no-await-in-loop
        const best = await bestScoreOf(a.id);
        const scoreTxt = best ? ` · 最高 ${best.score}（${best.player || '匿名'}）` : '';
        lines.push(`[${a.id}] 《${a.title}》 ${core.KIND_LABELS[a.kind]} · v${a.head}（共${a.versions.length}版） · ${fmtSize(a.size)} · 更新 ${fmtTime(a.updatedAt)}${scoreTxt}`);
      }
      return ok(`共 ${list.length} 个应用：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'ff_push',
    description: '闪造·推送到手机：把应用标记为「新造好」，手机端应用架顶部出现徽标，打开即玩（数据经宿主跨端同步，无需传输）。造完/迭代完一个游戏想让人在手机上玩时用。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '应用 id' } },
      required: ['id'],
    },
    async call(args) {
      const app = await loadApp(args.id);
      if (!app) return err(`应用不存在或已删除：${args.id}`);
      const marked = { ...app, pushedAt: Date.now() };
      await commitIndex([marked], app.id);
      return ok(`《${app.title}》已推送到手机。手机上打开 Polaris → 活动栏「闪造应用作坊」→ 应用架顶部「新造好」即可玩；高分榜与桌面同榜。`);
    },
  },
  {
    name: 'ff_score',
    description: '闪造·成绩榜：list=读某应用的跨端高分榜（桌面/手机同榜）；clear=清空某应用全部成绩（不可恢复，需 confirm=id）。用户问「最高多少分」「谁玩得最好」时用 list。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'clear'], description: 'list 读榜 / clear 清榜' },
        id: { type: 'string', description: '应用 id' },
        limit: { type: 'number', description: 'list 返回条数（默认 10，≤200）' },
        confirm: { type: 'string', description: 'clear 时必须与应用 id 完全一致' },
      },
      required: ['action', 'id'],
    },
    async call(args) {
      const app = await loadApp(args.id);
      if (!app) return err(`应用不存在或已删除：${args.id}`);
      if (args.action === 'clear') {
        if (args.confirm !== args.id) {
          return err(`为防误删，clear 需 confirm 参数=应用 id 本身（"${args.id}"）。确认请带 confirm="${args.id}" 重新调用。`);
        }
        await kvDel(core.K.score(args.id));
        return ok(`已清空《${app.title}》的全部成绩。`);
      }
      const raw = await kvGet(core.K.score(args.id)).catch(() => null);
      const top = core.topScores(core.sanitizeScores(raw), args.limit);
      if (!top.length) return ok(`《${app.title}》还没有成绩记录——玩一局就有了。`);
      const lines = top.map((s, i) => `${i + 1}. ${s.score} —— ${s.player || '匿名'}${s.device ? `（${s.device}）` : ''} · ${fmtTime(s.ts)}`);
      return ok(`《${app.title}》高分榜前 ${top.length}：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'ff_delete',
    description: '闪造·删除应用（连同全部版本与成绩，不可恢复）。为防误删，confirm 必须传应用 id 本身。删除前可建议用户先 ff_source 留底。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '应用 id' },
        confirm: { type: 'string', description: '必须与 id 完全一致，确认删除' },
      },
      required: ['id'],
    },
    async call(args) {
      if (args.confirm !== args.id) {
        return err(`为防误删，confirm 参数必须传应用 id 本身（"${args.id}"）。确认请带 confirm="${args.id}" 重新调用。`);
      }
      const app = await loadApp(args.id);
      if (!app) return err(`应用不存在或已删除：${args.id}`);
      let freed = 0;
      for (const ver of app.versions) {
        // 块数按体积推算，逐块删到空；上限护栏防失控
        const maxParts = Math.ceil(core.LIMITS.MAX_SOURCE_BYTES / core.LIMITS.CHUNK_CHARS) + 2;
        for (let i = 0; i < maxParts; i++) {
          // eslint-disable-next-line no-await-in-loop
          const p = await kvGet(core.K.verPart(app.id, ver.v, i)).catch(() => null);
          if (p === null || p === undefined) break;
          freed += typeof p === 'string' ? p.length : 0;
          // eslint-disable-next-line no-await-in-loop
          await kvDel(core.K.verPart(app.id, ver.v, i));
        }
      }
      await kvDel(core.K.score(args.id));
      await commitIndex([], app.id);
      return ok(`已删除《${app.title}》（${app.versions.length} 个版本，释放约 ${fmtSize(freed)} 及全部成绩）。`);
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
