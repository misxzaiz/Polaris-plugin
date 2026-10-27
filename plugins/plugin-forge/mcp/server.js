#!/usr/bin/env node
'use strict';
/**
 * 插件工坊 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 职责：让 AI「先拉知识再动手」，不再每次建插件都重新考古项目。
 * 知识库与脚手架模板经 fs 从 ../shared/ 读取（与面板 bundle 内联同一份文件）。
 *
 * 工具：
 *   forge_overview  平台速览 + 主题目录（建插件请求的第一个调用）
 *   forge_search    全文检索知识库（带命中片段）
 *   forge_topic     读整个主题正文
 *   forge_lint      体检 plugin.json（传 json 字符串或文件路径）
 *   forge_scaffold  生成生产级骨架（返回文件集；dir+confirm 落盘，守卫见下）
 *
 * 落盘守卫：dir 必须绝对路径；目标插件目录存在且非空 → 拒绝；
 * confirm !== true → 拒绝；只新建，绝不覆盖已有文件。
 */
const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.join(__dirname, '..', 'shared');
const forgeCore = require(path.join(SHARED_DIR, 'forge-core.js'));

const SERVER_NAME = 'plugin-forge';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
void process.argv[2]; // {{appConfigDir}} 预留：工坊目前零 kv 依赖

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── 知识库加载（fs 版；面板版经 esbuild 内联，同一份文件）──────────────────
const kbIndex = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, 'kb-index.json'), 'utf8'));
const kbBodyCache = new Map();
function kbBody(id) {
  if (!kbBodyCache.has(id)) {
    const p = path.join(SHARED_DIR, 'kb', `${id}.md`);
    kbBodyCache.set(id, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  }
  return kbBodyCache.get(id);
}

// ── 脚手架模板加载 ──────────────────────────────────────────────────────────
const tplManifest = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, 'scaffold', 'manifest.json'), 'utf8'));
const TPL_MAP = tplManifest.map || {};
function loadTemplates() {
  const dir = path.join(SHARED_DIR, 'scaffold');
  const out = { 'plugin.json': null }; // plugin.json 由 buildManifest 程序化生成
  for (const tplName of Object.keys(TPL_MAP)) {
    out[tplName] = fs.readFileSync(path.join(dir, tplName), 'utf8');
  }
  return out;
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

function topicListText() {
  return kbIndex.topics.map((t) => `- ${t.id}｜${t.title}\n  ${t.summary}`).join('\n');
}

const tools = [
  {
    name: 'forge_overview',
    description: 'Polaris 插件平台速览 + 知识库主题目录。用户让你「创建插件/写个插件/给 Polaris 加功能」时，第一个调用就是这个——先拿平台速览和主题目录，再按需 forge_topic 拉细节，不要通读主仓源码重新考古。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const body = kbBody('overview');
      return ok(`【Polaris 插件平台速览（${kbIndex.updatedAt} 核实，与官方文档冲突处以本库为准）】\n\n${body}\n\n【主题目录（forge_topic <id> 读全文）】\n${topicListText()}\n\n【推荐流程】读 forge_topic workflow → forge_scaffold 生成骨架 → 按主题实现与验证。`);
    },
  },
  {
    name: 'forge_search',
    description: '检索插件平台知识库（跨域/服务/单写者/冒烟/发布/UI/坑……16 主题全文）。适用：怀疑某个具体行为（「cap.http 手机上能用吗」「kv list 是全局的吗」）时先查这里，答案都是代码级核实的。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词（空格分词，支持中文子串）' },
        limit: { type: 'integer', description: '最多返回几条（默认 5）' },
      },
      required: ['query'],
    },
    async call(args) {
      const q = String(args.query || '').trim();
      if (!q) return err('query 不能为空');
      const hits = forgeCore.searchTopics(kbIndex.topics, Object.fromEntries(kbIndex.topics.map((t) => [t.id, kbBody(t.id)])), q);
      if (!hits.length) return ok(`知识库无「${q}」命中。可换关键词，或 forge_topic 浏览相近主题（目录：${kbIndex.topics.map((t) => t.id).join(', ')}）。`);
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const lines = hits.slice(0, limit).map((h) => {
        const snip = forgeCore.snippetFor(kbBody(h.meta.id), q, 220).replace(/\n+/g, ' ');
        return `- [${h.meta.id}] ${h.meta.title}（score ${h.score}）\n  ${snip}`;
      });
      return ok(`「${q}」命中 ${hits.length} 个主题（显示 ${Math.min(limit, hits.length)}）。\n${lines.join('\n')}\n用 forge_topic <id> 读全文。`);
    },
  },
  {
    name: 'forge_topic',
    description: '读一个知识库主题的全文（带可直接照抄的代码契约与清单）。id 见 forge_overview 的主题目录，如 cross-origin / single-writer / testing / publishing / pitfalls / workflow。',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '主题 id' } }, required: ['id'] },
    async call(args) {
      const id = String(args.id || '').trim();
      const meta = kbIndex.topics.find((t) => t.id === id);
      if (!meta) return err(`未知主题 ${id}。可用：${kbIndex.topics.map((t) => t.id).join(', ')}`);
      return ok(`# ${meta.title}\n\n${kbBody(id)}`);
    },
  },
  {
    name: 'forge_lint',
    description: '体检一份 Polaris 插件清单（plugin.json）：必填项、图标 18 白名单、视图区、服务健康检查、MCP 声明、permissions 已知集、发布 URL @tag 陷阱等 20+ 条实测规则，每条问题给修复建议。适用：写完/改完 plugin.json 后、安装被拒排查时。',
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'string', description: 'plugin.json 的 JSON 字符串' },
        path: { type: 'string', description: '或：plugin.json 的绝对路径（本进程有 fs 权限，优先用这个）' },
      },
    },
    async call(args) {
      let raw = args.json;
      if (!raw && args.path) {
        try { raw = fs.readFileSync(String(args.path), 'utf8'); } catch (e) { return err(`读取 ${args.path} 失败：${e.message}`); }
      }
      if (!raw) return err('传 json（清单字符串）或 path（清单文件路径）之一');
      const r = forgeCore.lintManifest(raw);
      const fmt = (list) => list.map((it) => `- [${it.rule}] ${it.msg}\n  → ${it.fix}`).join('\n');
      const lines = [
        `检查 ${r.checked} 项：错误 ${r.errors.length} / 警告 ${r.warns.length} / 提示 ${r.infos.length}`,
        r.errors.length ? `\n【错误】\n${fmt(r.errors)}` : '',
        r.warns.length ? `\n【警告】\n${fmt(r.warns)}` : '',
        r.infos.length ? `\n【提示】\n${fmt(r.infos)}` : '',
        r.ok ? '\n结论：✅ 通过（无错误）。警告项都是踩过真实坑的，建议照修。' : '\n结论：❌ 有错误，修完再发。',
      ].filter(Boolean);
      return ok(lines.join('\n'));
    },
  },
  {
    name: 'forge_scaffold',
    description: '生成生产级插件骨架（连接层/服务 tick/MCP/面板/单测/真实桥冒烟/README 全套，全部按已验证样板）。两用法：不传 dir → 返回文件内容供 AI 逐个创建；传 dir+confirm:true → 直接落盘（目录必须不存在或为空，绝不覆盖）。生成后照 forge_topic workflow 继续。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '插件 id（kebab-case，如 my-plugin）' },
        name: { type: 'string', description: '中文名（如「网页哨兵」）' },
        prefix: { type: 'string', description: 'kv 键空间前缀（默认取 id 的 camelCase）' },
        icon: { type: 'string', description: '图标，18 白名单之一（默认 Beaker）' },
        order: { type: 'integer', description: 'ActivityBar 排序（默认 80）' },
        withService: { type: 'boolean', description: '生成后台服务（要外网抓取/定时任务时 true）' },
        withMcp: { type: 'boolean', description: '生成 MCP server（要 AI 工具时 true）' },
        description: { type: 'string', description: '一句话描述（进 plugin.json）' },
        dir: { type: 'string', description: '落盘目标目录（绝对路径，如 D:\\space\\base\\Polaris-plugin\\plugins\\my-plugin）；不传只返回内容' },
        confirm: { type: 'boolean', description: '落盘必须 true（面板预览不需要）' },
      },
      required: ['id', 'name'],
    },
    async call(args) {
      const id = String(args.id || '').trim();
      const name = String(args.name || '').trim();
      if (!/^[a-z][a-z0-9-]*$/.test(id)) return err(`id 不合规：${id}（小写字母开头，仅小写字母/数字/连字符）`);
      if (!name) return err('name（中文名）必填');
      const spec = {
        id,
        name,
        prefix: args.prefix ? String(args.prefix) : id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
        icon: args.icon && forgeCore.VALID_PLUGIN_ICONS.includes(args.icon) ? args.icon : 'Beaker',
        order: Number.isFinite(Number(args.order)) ? Number(args.order) : 80,
        withService: args.withService !== false,
        withMcp: args.withMcp !== false,
        description: String(args.description || ''),
        panelType: id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
        labelKey: `plugins.${id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
      };
      const manifest = forgeCore.buildManifest(spec);
      const templates = loadTemplates();
      templates['plugin.json'] = JSON.stringify(manifest, null, 2);
      const built = forgeCore.buildScaffold(templates, spec);
      const files = built.files.map((f) => ({
        path: f.path === 'plugin.json' ? 'plugin.json' : (TPL_MAP[f.path] || f.path),
        content: f.content,
      }));

      // 落盘路径
      if (args.dir) {
        if (args.confirm !== true) {
          return err('落盘需要 confirm:true（生成操作会创建多份文件，请先与用户确认目标目录）。不落盘可不传 dir，只返回内容。');
        }
        const target = path.resolve(String(args.dir));
        if (!path.isAbsolute(String(args.dir))) return err('dir 必须是绝对路径');
        if (fs.existsSync(target)) {
          const entries = fs.readdirSync(target);
          if (entries.length > 0) return err(`目标目录已存在且非空（${entries.length} 个条目）：${target}。骨架只新建不覆盖——请换目录或清空后重试。`);
        } else {
          fs.mkdirSync(target, { recursive: true });
        }
        for (const f of files) {
          const fp = path.join(target, f.path);
          fs.mkdirSync(path.dirname(fp), { recursive: true });
          fs.writeFileSync(fp, f.content, 'utf8');
        }
        log('info', `scaffold 落盘 ${files.length} 文件 → ${target}`);
        return ok(`已在 ${target} 生成 ${files.length} 个文件：\n${files.map((f) => `- ${f.path}`).join('\n')}\n\n下一步（forge_topic workflow 有全文）：\n1. cd ${target} && npm install\n2. 填 shared/core.js 业务逻辑 + test/run-tests.mjs 用例\n3. npm run typecheck && npm run build\n4. node test/smoke-real.mjs（真实桥冒烟，需 Polaris 运行中）\n5. 按 publishing 主题发 index.json（先重读现文件防并发覆盖！）`);
      }

      // 只返回内容（分段列出，AI 可直接创建文件）
      const blocks = files.map((f) => `=== FILE: ${f.path} ===\n${f.content}`);
      return ok(`插件「${name}」(${id}) 骨架，共 ${files.length} 个文件。要落盘请重调本工具并传 dir（绝对路径）+ confirm:true。\n\n${blocks.join('\n\n')}`);
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
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (shared=${SHARED_DIR})`);
