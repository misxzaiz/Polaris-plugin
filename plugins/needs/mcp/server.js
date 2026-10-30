#!/usr/bin/env node
'use strict';
/**
 * needs MCP Server —— 需求库的 AI 工具层（零依赖 stdio，宿主无关）
 *
 * 一库两端：Polaris（plugin.json 引用本文件）与 ZCode（.zcode/config.json 指向同一文件）
 * 共用同一套语义；逻辑核在 ../shared/core.js（与面板 http 服务共用，本文件只是协议壳）。
 *
 * 工具一览（前缀 needs_，公约见需求库根目录 README.md）：
 *   needs_config   读/设需求库根目录 {root?}（安装副本用；设目录会自动创建）
 *   needs_add      新建条目 {title, oneLiner?, goal?, boundary?, acceptance?, tags?, slug?, priority?, origin?}
 *   needs_list     列条目 {status?, tag?, q?}（含 mtimeMs 供乐观锁）
 *   needs_show     读全文 {id}（含 mtimeMs）
 *   needs_update   更新 {id, fields?, append?, expectedMtimeMs?}——mtime 不符即拒绝（防并发丢写）
 *   needs_handoff  渲染开工提示词 {id, stage: analyze|write-spec|build-plugin}
 */
const { createCore, STATUSES, PRIORITIES, STAGES } = require('../shared/core');

const SERVER_NAME = 'needs';
const SERVER_VERSION = '0.2.0';
const PROTOCOL_VERSION = '2024-11-05';

const argv = process.argv.slice(2);
let appConfigDir = '';
let rootArg = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--needs-root') { rootArg = argv[i + 1] || ''; i++; }
  else if (!appConfigDir) appConfigDir = argv[i];
}

const core = createCore({ rootArg, appConfigDir });

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── 工具实现（逻辑在 core，这里只做文本编排）────────────────────────────────
function toolConfig(args) {
  if (args && args.root) {
    const { root } = core.configSet(args.root);
    return ok(`需求库根目录已设置并创建：${root}\n（写入 ${appConfigDir ? appConfigDir + '\\needs-root.json' : 'needs-root.json'}，5 秒内生效）`);
  }
  const c = core.configGet();
  return ok([
    `根目录：${c.root}`,
    `来源：${c.source === 'arg' ? '--needs-root 参数' : c.source === 'config' ? 'needs-root.json 配置' : '源码仓缺省探测'}`,
    `条目数：${c.entryCount}${c.hasReadme ? '' : '（警告：根目录缺 README.md 公约，建议核对根目录是否指对）'}`,
  ].join('\n'));
}

function toolAdd(args) {
  const r = core.add(args);
  return ok(`已记录 #${r.id}：${r.file}\n标题：${r.title}\n状态：idea（四节正文有空位，夜班分析会补全）\nmtimeMs=${r.mtimeMs}`);
}

function toolList(args) {
  const { root, rows } = core.list(args || {});
  if (!rows.length) {
    if (!core.list({}).rows.length) return ok(`根目录：${root}\n暂无条目（用 needs_add 记录第一条）。`);
    return ok(`没有命中（status=${(args && args.status) || '-'} tag=${(args && args.tag) || '-'} q=${(args && args.q) || '-'}）。\n提示：needs_list 不带参数看全部。`);
  }
  const lines = rows.map((r) =>
    `${r.id} | ${r.status} | ${r.priority} | ${r.title} | updated=${r.updated} | mtimeMs=${r.mtimeMs} | ${r.file}`);
  return ok(`共 ${rows.length} 条（id | 状态 | 优先级 | 标题 | 更新日 | 乐观锁 mtimeMs | 文件）：\n${lines.join('\n')}`);
}

function toolShow(args) {
  const r = core.show(args.id);
  return ok(`文件：${r.root}\\${r.file}\n标题：${r.title}\nmtimeMs=${r.mtimeMs}\n──────────\n${r.raw}`);
}

function toolUpdate(args) {
  const r = core.update(args.id, args);
  return ok(`已更新 ${r.file}：${r.done}\n新 mtimeMs=${r.mtimeMs}`);
}

function toolHandoff(args) {
  const r = core.handoff(args.id, args.stage);
  return ok(`已渲染开工提示词（stage=${r.stage}，条目 ${r.file}）。以下全文可直接交给执行 agent：\n\n════════ 提示词开始 ════════\n\n${r.text}\n\n════════ 提示词结束 ════════`);
}

// ── 工具注册 ─────────────────────────────────────────────────────────────────
const tools = [
  {
    name: 'needs_config',
    description: '需求库·读/设需求库根目录。不带参数=查看当前根目录、来源与条目数；传 root=设置根目录（自动创建；仅 Polaris 安装副本需要，源码模式用 --needs-root 参数）。',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string', description: '要设置的需求库根目录绝对路径；缺省=只读查看' } },
    },
  },
  {
    name: 'needs_add',
    description: '需求库·记录新需求：一句话即可，自动分配序号、套模板、登记为 idea。边界/验收可留空由夜班分析补全。双端并发撞号自动递增重试。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '短标题（必填）' },
        oneLiner: { type: 'string', description: '一段话说清是什么、给谁用、解决什么痛点' },
        goal: { type: 'string', description: '目标（做什么）' },
        boundary: { type: 'string', description: '边界（明确不做什么）' },
        acceptance: { type: 'string', description: '验收（可执行冒烟步骤/可断言结果）' },
        tags: { type: 'array', items: { type: 'string' }, description: '小写短词标签' },
        slug: { type: 'string', description: '文件名 slug（小写字母数字连字符）；缺省从 title 提取，纯中文标题回落 need' },
        priority: { type: 'string', enum: PRIORITIES },
        origin: { type: 'string', enum: ['polaris-chat', 'manual', 'zcode'], description: '记录来源，缺省 polaris-chat' },
      },
      required: ['title'],
    },
  },
  {
    name: 'needs_list',
    description: '需求库·列条目（id | 状态 | 优先级 | 标题 | mtimeMs）。按状态/标签/关键词过滤；用户问"需求库有什么/做到哪了/有什么要我澄清的"时先调这个。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUSES },
        tag: { type: 'string' },
        q: { type: 'string', description: '标题/全文关键词' },
      },
    },
  },
  {
    name: 'needs_show',
    description: '需求库·读条目全文（含 frontmatter 与 mtimeMs，更新前先 show 拿乐观锁）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '条目序号，如 "001"' } },
      required: ['id'],
    },
  },
  {
    name: 'needs_update',
    description: '需求库·更新条目：改 frontmatter 字段（fields）与/或向正文节追加文字（append，如回答待澄清问题、补决策记录）。必须带 expectedMtimeMs（来自 needs_show/needs_list）防并发覆盖；冲突会拒绝并提示重读。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        fields: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: { type: 'string', enum: STATUSES },
            priority: { type: 'string', enum: PRIORITIES },
            tags: { type: 'array', items: { type: 'string' } },
            spec: { type: 'string' },
            delivered: { type: 'string' },
          },
          description: '要改的 frontmatter 字段；status=approved 只能由人工拍板设置',
        },
        append: {
          type: 'object',
          properties: {
            section: { type: 'string', description: '正文节名，如 待澄清 / 决策记录' },
            text: { type: 'string' },
          },
        },
        expectedMtimeMs: { type: 'number', description: '读取时拿到的 mtimeMs（乐观锁）' },
      },
      required: ['id'],
    },
  },
  {
    name: 'needs_handoff',
    description: '需求库·渲染开工提示词：按阶段（analyze=需求分析 / write-spec=写spec / build-plugin=实施插件）把 prompts/ 模板与条目内容合成为完整任务书，交给执行 agent 即可开工。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        stage: { type: 'string', enum: STAGES },
      },
      required: ['id', 'stage'],
    },
  },
];

const HANDLERS = {
  needs_config: toolConfig,
  needs_add: toolAdd,
  needs_list: toolList,
  needs_show: toolShow,
  needs_update: toolUpdate,
  needs_handoff: toolHandoff,
};

// ── stdio JSON-RPC 主循环 ────────────────────────────────────────────────────
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
    try { msg = JSON.parse(line); } catch (e) { log('warn', `非 JSON 行：${e.message}`); continue; }
    handleMessage(msg).catch((e) => {
      log('error', `处理异常：${e.stack || e.message}`);
      if (msg && msg.id != null) send({ jsonrpc: '2.0', id: msg.id, result: err(`内部错误：${e.message}`) });
    });
  }
});
process.stdin.on('end', () => process.exit(0));

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
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const fn = HANDLERS[name];
    if (!fn) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const r = await fn(args);
      send({ jsonrpc: '2.0', id: msg.id, result: r });
    } catch (e) {
      log('error', `工具 ${name} 失败：${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(e.message || '工具执行失败') });
    }
    return;
  }
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.id != null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在：${msg.method}` } });
}

const boot = core.rootInfo();
log('info', `needs mcp server v${SERVER_VERSION} ready (root=${boot.root} source=${boot.source} appConfigDir=${appConfigDir || '未提供'})`);
