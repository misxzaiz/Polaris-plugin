#!/usr/bin/env node
'use strict';
/**
 * capability-runtime — MCP server 入口（stdio JSON-RPC 2024-11-05）
 *
 * 一句话：给 AI 一套「运行时热插拔能力」的元工具：
 *   1. AI 写一段 JS 并装进来 → 新工具立即出现在 tools/list（无需重启宿主/客户端）
 *   2. AI 可即时创建/更新/关闭桌面「输入悬浮窗」收集用户输入（input悬浮即此能力）
 *
 * 注意：module id 与目录解析、锁、安装、进程隔离见 mcp/registry.js；
 *       浮窗见 mcp/overlay-host.js。本文件只做协议与元工具编排。
 */

const path = require('path');
const fs = require('fs');

const { log, rpcWrite, safeParse, errorMessage, sha256, randomToken, sleep } = require('./util');
const { Registry } = require('./registry');
const { OverlayHost } = require('./overlay-host');

const SERVER_NAME = 'capability-runtime';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

// ── 启动参数 ─────────────────────────────────────────────────────────────────
// 用法: node mcp/server.js [--home <dir>] [--max-overlays <n>] [appConfigDir] [workspacePath] [pluginDir]
// home 解析顺序：--home > env CAP_RUNTIME_HOME > （结合 args 的启发式）
const CLI_ARGS = process.argv.slice(2);
let homeArg = null;
let maxOverlaysArg = null;
let positional = [];
for (let i = 0; i < CLI_ARGS.length; i++) {
  const a = CLI_ARGS[i];
  if (a === '--home') { homeArg = CLI_ARGS[++i] || null; continue; }
  if (a === '--max-overlays') { maxOverlaysArg = parseInt(CLI_ARGS[++i], 10) || null; continue; }
  positional.push(a);
}

function looksLikeDir(p) {
  try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

// Polaris 场景：argsTemplate = [appConfigDir] → 若首个位置参数是存在的 app 配置目录（含 config.json 或 web.json），
// home = <appConfigDir>/capability-runtime/<workspaceHash?>
let appConfigDir = null;
let workspacePath = null;
if (positional.length > 0 && looksLikeDir(positional[0])) {
  appConfigDir = path.resolve(positional[0]);
  if (positional[1] && looksLikeDir(positional[1])) workspacePath = path.resolve(positional[1]);
}
let HOME;
if (homeArg) {
  HOME = path.resolve(homeArg);
} else if (process.env.CAP_RUNTIME_HOME) {
  HOME = path.resolve(process.env.CAP_RUNTIME_HOME);
} else if (appConfigDir) {
  const wsKey = workspacePath ? sha256(workspacePath).slice(0, 10) : 'global';
  HOME = path.join(appConfigDir, 'capability-runtime', wsKey);
} else {
  // 独立/开发场景：显式优先，其次 cwd 下的固定目录（避免随 cwd 漂移的垃圾散落）
  HOME = path.resolve(process.cwd(), '.capability-runtime');
}

// ── 结构拼装 ─────────────────────────────────────────────────────────────────
const overlayHost = new OverlayHost({
  maxOverlays: maxOverlaysArg || undefined,
  profileTag: sha256(HOME).slice(0, 8),           // 临时 profile 命名空间 = home 指纹（多实例互不误清）
  onAudit: (e) => registry.auditExternal(e),      // overlay 事件入 audit.ndjson（与安全文档口径一致）
});
const registry = new Registry({
  home: HOME,
  overlayApi: null, // 注入在下方（避免循环依赖 property 指向）
  tag: homeArg || appConfigDir ? 'polaris-config' : 'standalone',
});
// overlayApi 注入（registry 用 module-level access）
const overlayApi = {
  moduleInput: (moduleId, spec) => overlayHost.create({ ...spec, mode: 'input' }, { owner: moduleId }),
  moduleShow: (moduleId, spec) => overlayHost.create({ ...spec, mode: 'show' }, { owner: moduleId }),
  update: (id, patch) => overlayHost.update(id, patch),
  close: (id) => overlayHost.close(id, 'module_close'),
  list: (opts) => ({ entities: overlayHost.list(opts || {}) }),
  activeCount: () => overlayHost.activeCount,
};
registry.overlayApi = overlayApi;
registry.onToolListChanged = sendToolListChanged;

// ── 模块作者指南（cap_docs 返回） ─────────────────────────────────────────────
const DOC_OVERVIEW = `【capability-runtime — AI 能力自拓展运行时】
本 server 给你（AI）两样能力：

1) 模块热插拔（无需重启宿主或客户端）
   - cap_module_install：提交一段 JS（代码里调 api.tools([...]) 注册工具），装完立即出现在 tools/list。
     若客户端未刷新工具列表，用 cap_module_invoke（万能入口，恒定可用）也能直接影响模块。
   - cap_module_list / cap_module_set_enabled / cap_module_remove：管理。
   - 模块持久化在磁盘，server/宿主重启后自动恢复。
   - 模块运行在独立子进程 + vm 沙箱中：崩溃被杀不牵连本 server；状态不走内存，走 ctx.store（磁盘 KV）。

2) 桌面输入悬浮窗
   - cap_overlay_input：弹一个置顶浮窗让用户输入，最长 300s，返回 {status:'submitted'|'closed'|'timeout', value}。
   - cap_overlay_show：展示内容（HTML/文本）；cap_overlay_update / cap_overlay_close / cap_overlay_list / cap_overlay_wait。
   - 模块代码里也可用 ctx.overlay（需声明 permissions.overlay）。

安全模型（诚实声明）：
   模块代码＝本地单用户协作模型下的高信任输入（相当于你给本机装了个 npm 包）。
   子进程 + vm 隔离防的是「意外响敌」：崩溃隔离、超时强杀、状态防误写；vm 不是恶意代码安全边界（__capCall.constructor 可逃逸到子进程权限）。修订语义见 cap_docs authoring。
   fetch 有 SSRF 过滤（默认禁环回/私网段）与响应上限；overlay 提交带权限标记。

最少用法（30 秒上手）：
   cap_module_install { id: "demo", code: "api.tools([{name:'roll', description:'掷骰子', inputSchema:{type:'object',properties:{sides:{type:'number',description:'面数,默认6'}}}, async handler(a){ return {result: Math.floor(Math.random()*((a.sides||6)|0))+1} } }])" }
   → 调用方式（二选一，进程有刷新就直接 tools/call，没有就 invoke）：
      tools/call  name="demo_roll" arguments={"sides":6}
      cap_module_invoke { module:"demo", tool:"roll", args:{"sides":6} }`;

const DOC_AUTHORING = `【模块编写规范】

模块是一个 JS 字符串（<= 256KB 字符），在沙箱里**同步**执行一次，必须调用一次 api.tools()：

api.tools([
  {
    name: 'tool_name',             // ^[a-z][a-z0-9_]{0,63}$，不要与模块 id 里可能相同——最终暴露名是 <模块id>_<工具名>
    description: '给 AI 看的工具说明（<=2000 字）',
    inputSchema: {                 // 必填 JSON Schema 对象（type:'object' 推荐）
      type: 'object',
      properties: { example: { type: 'string', description: '…' } },
      required: []
    },
    exampleArgs: { example: 'v' }, // 可选：给 AI 一个可直接抄的调用示例
    async handler(args, ctx) {
      // args: 调用参数（已 JSON 化）
      // ctx: 见下
      return { any: 'json-able 值' };  // return 的值会被 JSON 序列化后作为工具结果
    }
  }
]);

ctx（模块运行时可用 API，全部只经 JSON，禁止任何 require/process 访问）：
  ctx.fetch(url, opts)  → { status, text }    需要 manifest.permissions.network；默认拦截环回/私网段
                                          （private 网段放行需 permissions.allowPrivate=true，记审计）
                                          opts 支持 {method:'GET'|'HEAD'|'POST', body, headers}
  ctx.store             → JSON KV（容量 8MB/模块）：
      get(k) → 值 | null
      set(k, v)（v 可 JSON 序列化即可）
      del(k)
      keys() → string[]
  ctx.overlay           → 需要 manifest.permissions.overlay：
      input({title, reason, message, placeholder, preset, geometry:{x?,y?,w,h}, submitLabel?, keepOpen?, timeoutSec?})
        → {status:'submitted'|'closed'|'timeout', value}
      show({title, message, text?, html?, geometry, keepOpen?, timeoutSec?}) → {status:'created', id}
      update(id, {title?, message?, text?, html?, geometry?}) / close(id) / list() → {entities:[{id, yours,...}]}
  ctx.log(...values)    → 诊断日志（stderr + 审计）
  ctx.sleep(ms)         → ≤30s 休眠（模块内没有 setTimeout/setInterval —— 防失控循环）

约束：内存数据在超时强杀时会丢（进程被杀），一切要留下的状态走 ctx.store；
      一个模块 ≤16 个工具；单个调用默认 60s 超时（可 per-call timeoutMs ≤300s）；
      连续 3 次故障（崩溃/超时）→ 模块自动停用，cap_module_set_enabled 恢复。

模板（拷走改改就能装）：
api.tools([
  {
    name: 'hello',
    description: 'Say hello to someone',
    inputSchema: { type:'object', properties:{ name:{type:'string',description:'名字'} }, required:['name'] },
    exampleArgs: { name: '世界' },
    async handler(args, ctx) {
      const seen = (await ctx.store.get('seen')) || 0;
      await ctx.store.set('seen', seen + 1);
      const greeting = '你好, ' + String(args.name).slice(0, 100) + '（第 ' + (seen + 1) + ' 次）';
      await ctx.log('hello called');
      return { hello: greeting, seen: seen + 1 };
    }
  }
]);`;

const DOC_SECURITY = `【安全模型（写给用户与 AI）】

信任基线：本插件的服务对象是「本地单用户 + 该用户的 AI 助手」。模块安装由 AI 直接完成，
没有逐次人工审批（可通过策略回滚与审计兜底）。

真实边界：
  1) 进程隔离：每个模块一个子进程，崩溃/超时（默认 60s，可放宽到 300s）只死自己，
     主进程与其它模块毫发无伤（taskkill /T /F 连池树）。
  2) 子进程内 vm：防手滑 —— 模块代码误触 require/process/require 运行时会报 undefined，
     不得读写任意文件系统或直接发网络请求；一切重复行为必须显式走 ctx.fetch/store/overlay。
     ⚠ vm 非安全边界：恶意模块可 __capCall.constructor 逃逸至子进程权限（= 用户权限）。
     请把安装来源 trust 当作「装了个本地 npm 包」级别的决定。
  3) 权限面：network=false 模块无法发请求；overlay=false 不能开窗；allowPrivate 环回/私网
     网段默认捆绑（SSRF：访问 127.0.0.1 的 Polaris 端口 / 内网设备需要显式 allowPrivate=true）。
     响应 >8MB 即断流（防内存打爆）。
  4) 状态：store 是唯一持久面，8MB 上限 + 原子写 + .bak 降级 + 坏文件自动隔离（quarantine）。
  5) 浮窗：页面固定「Polaris AI 浮窗 · AI 生成」横幅与 reason（AI 必须说明为什么需要用户输入），
     禁 password 输入框；HTTP 仅 127.0.0.1 + Host 校验 + Bearer，外站伪造输入失败（no-cors 无法自定义头）。
  6) 审计：install/remove/enable/fault/overlay 全部写 home/audit/audit.ndjson（含 code sha256，
     触规轮转），出问题可追溯是哪一次装了什么。

用户控制：
  - 关停：cap_module_set_enabled(false)，或直接 cap_module_remove；
  - 停掉整个运行能力：宿主禁用本插件（MCP server 退出）；
  - 数据位置：cap_status 可查 home 目录，删除该目录 = 全部摸清（模块、状态、审计）。
  本地部署建议定期看 audit.ndjson。`;

const DOCS = [
  { key: 'overview', title: '概览（30 秒上手）', body: DOC_OVERVIEW },
  { key: 'authoring', title: '模块编写规范', body: DOC_AUTHORING },
  { key: 'security', title: '安全模型', body: DOC_SECURITY },
];

// ── meta 工具定义 ────────────────────────────────────────────────────────────
const OBJ = { type: 'object', properties: {}, required: [] };

const TOOLS = [
  {
    name: 'cap_status',
    description: '运行时状态：home 目录、模块数、可用工具数、浮窗数、实例 pid。排查问题时先调这个。',
    inputSchema: OBJ,
    handler: async () => ({
      server: { name: SERVER_NAME, version: SERVER_VERSION, pid: process.pid, uptimeS: Math.round(process.uptime()) },
      runtime: registry.runtimeStatus(),
      overlays: overlayHost.list(),
    }),
  },
  {
    name: 'cap_docs',
    description: '获取模块编写/能力使用文档。section: overview（概览，推荐先读）| authoring（写模块）| security（安全模型）。写模块前必读 authoring+overview。',
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', description: 'overview | authoring | security，默认 overview' } },
    },
    handler: async (args) => {
      const key = String((args && args.section) || 'overview');
      const doc = DOCS.find((d) => d.key === key) || DOCS[0];
      return { title: doc.title, body: doc.body, allSections: DOCS.map((d) => d.key) };
    },
  },
  {
    name: 'cap_module_list',
    description: '列出已安装模块：id、启停、健康、权限、每个工具的名字/描述/inputSchema/可直接抄的 invokeHint。安装新模块前先调用避免 id 冲突。',
    inputSchema: OBJ,
    handler: async () => ({ modules: registry.listModules(), note: '若本列表与客户端 tools/list 不一致（客户端只在建连时拉列表），用 cap_module_invoke 直接调用即可，恒定可用。' }),
  },
  {
    name: 'cap_module_install',
    description:
      '【核心】安装一个能力模块（AI 自写 JS，装完立即生效、持久化，重启自动恢复）。code 里必须 api.tools([{name, description, inputSchema, handler(args,ctx)}...]) 同步注册工具。写码前建议先 cap_docs section=authoring。一模 id 重装需先 remove。安装完成返回值内含可直接抄的 cap_module_invoke 调用示例。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '模块 id：^[a-z0-9][a-z0-9-]{0,31}$（如 weather-tools）。最终工具名 = <id>_<工具名>。' },
        name: { type: 'string', description: '显示名' },
        description: { type: 'string', description: '模块说明' },
        version: { type: 'string', description: '可选语义化版本' },
        permissions: {
          type: 'object',
          description: '权限：{ network?: bool（允许 ctx.fetch）, allowPrivate?: bool（放行环回/私网段，慎用）, overlay?: bool（允许开浮窗） }',
          properties: {
            network: { type: 'boolean' },
            allowPrivate: { type: 'boolean' },
            overlay: { type: 'boolean' },
          },
        },
        code: { type: 'string', description: '模块 JS 源码（≤256KB，同步执行，api.tools([...]) 注册）' },
      },
      required: ['id', 'code'],
    },
    handler: async (args) => registry.install(args),
  },
  {
    name: 'cap_module_invoke',
    description:
      '【万能入口，恒定可用】直接调用模块工具 {module, tool, args}。当 tools/list 尚未刷新、或工具名不确定时用它；tools/call 直接可用时优先直接调。module=cap_module_list 可得，tool=模块里的原名（不带 <id>_ 前缀）。',
    inputSchema: {
      type: 'object',
      properties: {
        module: { type: 'string', description: '模块 id' },
        tool: { type: 'string', description: '模块内工具名（不带模块前缀）' },
        args: { type: 'object', description: '工具参数' },
        timeoutMs: { type: 'number', description: '可选，超时（1000-300000，默认 60000）' },
      },
      required: ['module', 'tool'],
    },
    handler: async (args) => {
      // 兼容 AI 传字符串 args（宽容纠错一次）
      let toolArgs = args.args;
      if (typeof toolArgs === 'string') {
        toolArgs = safeParse(toolArgs, null);
        if (toolArgs === null) {
          throw capErr('cap_bad_args', 'args 必须是 JSON 对象（你传了不可解析的字符串）。示例：cap_module_invoke {module:"demo", tool:"roll", args:{"sides":6}}');
        }
      }
      const r = await registry.invoke(String(args.module), String(args.tool), toolArgs || {}, { timeoutMs: args.timeoutMs });
      return r;
    },
  },
  {
    name: 'cap_module_set_enabled',
    description: '启用/停用模块。停用进程即杀（状态文件保留）。连续故障自动停用的模块用它恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        module: { type: 'string', description: '模块 id' },
        enabled: { type: 'boolean', description: 'true=启用' },
      },
      required: ['module', 'enabled'],
    },
    handler: async (args) => registry.setEnabled(String(args.module), !!args.enabled),
  },
  {
    name: 'cap_module_remove',
    description: '卸载模块：进程被杀、目录移入 .trash、状态一并消失。不可恢复。',
    inputSchema: { type: 'object', properties: { module: { type: 'string', description: '模块 id' } }, required: ['module'] },
    handler: async (args) => registry.remove(String(args.module)),
  },
  {
    name: 'cap_overlay_input',
    description:
      '【输入悬浮】即时创建置顶浮窗让用户输入并等待提交。参数：title / reason（为什么需要输入，必填，用户可见） / message（正文，可选） / placeholder / preset（预填） / submitLabel / geometry{x?,y?,w,h}（逻辑 px） / timeoutSec（5-300，默认 120） / keepOpen（true=提交后不自动关窗，可继续 wait）。返回 {status:"submitted"|"closed"|"timeout", value}。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '浮窗标题' },
        reason: { type: 'string', description: '为什么需要用户输入（必填，显示在窗内）' },
        message: { type: 'string', description: '正文/问题' },
        placeholder: { type: 'string' },
        preset: { type: 'string', description: '预填值' },
        submitLabel: { type: 'string' },
        geometry: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
        timeoutSec: { type: 'number', description: '5-300，默认 120' },
        keepOpen: { type: 'boolean', description: '提交后是否保留浮窗' },
      },
      required: ['title', 'reason'],
    },
    handler: async (args) => overlayHost.create({ ...args, mode: 'input' }, { owner: 'host' }),
  },
  {
    name: 'cap_overlay_show',
    description:
      '创建展示型浮窗（持久显示，直到 timeoutSec 自动关闭或用户点关闭/手动 close）。带 text（纯文本）或 html（只读展示源码，防 XSS 全 textContent 渲染）。返回 {status:"created", id}，随后可 cap_overlay_update / close。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '标题（默认「提示」）' },
        reason: { type: 'string', description: '为什么开窗（显示在横幅副标题）' },
        message: { type: 'string', description: '正文（与 text 二选一或叠加）' },
        text: { type: 'string', description: '主体内容（纯文本大文本，推荐）' },
        html: { type: 'string', description: 'HTML 源码（只读展示，不做可执行渲染）' },
        geometry: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
        timeoutSec: { type: 'number', description: '5-300 自动关闭（默认 60）；传 keepOpen=true 可常驻' },
        keepOpen: { type: 'boolean' },
      },
    },
    handler: async (args) => overlayHost.create({ ...args, mode: 'show' }, { owner: 'host' }),
  },
  {
    name: 'cap_overlay_update',
    description: '更新浮窗：title / message / text / html / preset(input 模式) / geometry（改位置大小）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '浮窗 id（cap_overlay_list 可得）' },
        title: { type: 'string' },
        message: { type: 'string' },
        text: { type: 'string' },
        html: { type: 'string' },
        preset: { type: 'string' },
        geometry: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
      },
      required: ['id'],
    },
    handler: async (args) => overlayHost.update(String(args.id), args),
  },
  {
    name: 'cap_overlay_close',
    description: '关闭浮窗（自己的浮窗 id 见 cap_overlay_list）。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (args) => overlayHost.close(String(args.id), 'explicit_close'),
  },
  {
    name: 'cap_overlay_list',
    description: '列出全部活动浮窗（id/mode/title/owner/geometry/最近输入预览）。',
    inputSchema: OBJ,
    handler: async () => ({ entities: overlayHost.list() }),
  },
  {
    name: 'cap_overlay_wait',
    description:
      '对已有浮窗等待下一次输入（keepOpen 的多轮输入场景）。{id, timeoutSec(5-300,默认120)}。晚到的提交自动补投（lateDelivered 标记）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, timeoutSec: { type: 'number' } },
      required: ['id'],
    },
    handler: async (args) => overlayHost.wait(String(args.id), { timeoutSec: args.timeoutSec }),
  },
];

// ── JSON-RPC 循环 ─────────────────────────────────────────────────────────────
function protocolError(id, code, message) {
  rpcWrite({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function sendToolListChanged() {
  // MCP 通知：工具列表已变化（支持 listChanged 的客户端会重新拉取）
  rpcWrite({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
}

function capabilitiesTools() {
  const list = [];
  for (const t of TOOLS) {
    list.push({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    });
  }
  // 模块工具并入
  for (const m of registry.listModules()) {
    if (!m.enabled) continue;
    for (const t of m.tools) {
      list.push({
        name: t.name,
        description: `[模块:${m.id}] ${t.description}`,
        inputSchema: t.inputSchema,
      });
    }
  }
  return list;
}

function findModuleToolCall(name) {
  // 最终暴露名 = <moduleId>_<tool>；模块 id 无下划线（^[a-z0-9][a-z0-9-]{0,31}$）
  const idx = name.indexOf('_');
  if (idx <= 0) return null;
  const moduleId = name.slice(0, idx);
  const tool = name.slice(idx + 1);
  for (const m of registry.listModules()) {
    if (m.id === moduleId) {
      const exists = m.tools.some((t) => t.name === `${moduleId}_${tool}`);
      return exists ? { moduleId, tool, publishedName: `${moduleId}_${tool}` } : null;
    }
  }
  return null;
}

async function handleCall(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (tool) {
    const result = await tool.handler(args || {});
    // registry.invoke/cap_module_invoke 已返回 MCP 工具结果形状，别再包一层
    return isToolResult(result) ? result : jtext(result);
  }
  // 模块工具直调（tools/call name=<id>_<tool>）
  const sub = findModuleToolCall(name);
  if (sub) {
    return registry.invoke(sub.moduleId, sub.tool, args || {}, {}, { toolFullName: sub.publishedName });
  }
  // 未知工具 → 结构化 isError（不在 RPC 层 -32602，AI 可顺着指引走通）
  const known = TOOLS.map((t) => t.name);
  const modTools = registry
    .listModules()
    .filter((m) => m.enabled)
    .flatMap((m) => m.tools.map((t) => t.name));
  throw capErr(
    'unknown_tool',
    `未知工具: ${name}。当前可用：${known.join(', ')}${modTools.length ? '；模块工具：' + modTools.join(', ') : ''}。` +
    `（提示：若模块刚安装而客户端工具表未刷新，用 cap_module_invoke {module,tool,args} 直接调用，恒定可用）`
  );
}

function jtext(v) {
  let text;
  try {
    text = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  } catch (e) {
    text = `<序列化失败: ${e.message}>`;
  }
  return { content: [{ type: 'text', text }], isError: false };
}

function capErr(capCode, message) {
  const e = new Error(message);
  e.capCode = capCode;
  return e;
}

function isToolResult(v) {
  return !!(v && Array.isArray(v.content) && 'isError' in v);
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return rpcWrite({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            'capability-runtime: 运行时热插拔 AI 能力。cap_docs section=overview 起步；' +
            'cap_module_install 装 JS 工具模组（装完即用，重启恢复）；cap_overlay_input 弹桌面输入浮窗收用户输入。',
        },
      });
    case 'notifications/initialized':
      return; // 通知，不响应
    case 'notifications/cancelled':
      // 单请求取消：主入口标记 withdrawn，剩余回收由注册处超时机制兜底
      markCancelled(params && params.requestId);
      return;
    case 'tools/list':
      return rpcWrite({ jsonrpc: '2.0', id, result: { tools: capabilitiesTools() } });
    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const callId = typeof id === 'number' ? id : null;
      const wasCancelled = () => callId !== null && pendingCancelled.has(callId);
      try {
        const result = await handleCall(String(name), args);
        if (wasCancelled()) { pendingCancelled.delete(callId); return; }
        return rpcWrite({ jsonrpc: '2.0', id, result });
      } catch (e) {
        if (wasCancelled()) {
          pendingCancelled.delete(callId);
          return; // 已取消，不回
        }
        const payload = {
          content: [{ type: 'text', text: `失败（${e.capCode || 'error'}）：${errorMessage(e)}` }],
          isError: true,
        };
        return rpcWrite({ jsonrpc: '2.0', id, result: payload });
      }
    }
    case 'ping':
      return rpcWrite({ jsonrpc: '2.0', id, result: {} });
    default:
      return protocolError(id, -32601, `不支持的方法: ${method}`);
  }
}

// 取消标记：requestId → 收到标记的时间戳（Map 定期清扫，防宿主风暴式 cancel 撑爆内存；P2-10）
const pendingCancelled = new Map();
const CANCELLED_TTL_MS = 5 * 60 * 1000;
function markCancelled(rid) {
  try { pendingCancelled.set(rid, Date.now()); } catch (_) { /* 忽略 */ }
  if (pendingCancelled.size > 1000) sweepCancelled();
}
function sweepCancelled() {
  const now = Date.now();
  for (const [k, ts] of pendingCancelled) {
    if (now - ts > CANCELLED_TTL_MS) pendingCancelled.delete(k);
  }
}
const _cancelSweeper = setInterval(sweepCancelled, 90 * 1000);
if (typeof _cancelSweeper.unref === 'function') _cancelSweeper.unref();

// ── 启动序列 ─────────────────────────────────────────────────────────────────
async function main() {
  log(`capability-runtime v${SERVER_VERSION} 启动 (home=${HOME}, pid=${process.pid})`);
  if (process.platform === 'win32') {
    log('浮窗能力：Windows + Edge/Chrome app 模式 + PowerShell 窗口控制器（首次创建浮窗时初始化）');
  }
  await registry.init();
  await overlayHost.start();

  let buffer = '';
  let stdinClosed = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    // 总量硬帽：持续无换行的输入流不得撑爆内存（正常 MCP 帧都有 \n，32MB 已远超一切合法帧）（P2-14）
    if (buffer.length > 32 * 1024 * 1024) {
      log(`stdin 累积超 32MB 未见完整帧，丢弃全部 ${buffer.length} 字符`);
      buffer = '';
      return;
    }
    // 行上限：16MB（超限丢弃整行，保持流健康）
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      if (buffer.length > idx + 1) buffer = buffer.slice(idx + 1);
      else buffer = '';
      if (line.length > 16 * 1024 * 1024) {
        log(`丢弃超长输入行 ${line.length} 字符`);
        continue;
      }
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }
      // 批量数组帧不支持：按 spec 明确回 -32600，而不是静默吞掉（P2-14）
      if (Array.isArray(msg)) {
        protocolError(null, -32600, '批量请求（数组帧）不受支持');
        continue;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
        if (msg && typeof msg === 'object' && msg.id !== undefined) {
          protocolError(msg.id, -32600, '无效请求（缺少 method）');
        }
        continue;
      }
      // 并发处理（响应按完成序号独立 write，主循环不串行）
      handleMessage(msg).catch((e) => {
        log(`handleMessage 异常: ${errorMessage(e)}`);
        if (msg.id !== undefined) protocolError(msg.id, -32603, 'internal error');
      });
    }
  });
  process.stdin.on('error', (e) => log(`stdin error: ${errorMessage(e)}`));
  process.stdin.on('end', async () => {
    stdinClosed = true;
    log('stdin 关闭（宿主断连）→ 清理退出');
    await shutdown('stdin_eof');
  });
  process.on('SIGINT', () => shutdown('sigint'));
  process.on('SIGTERM', () => shutdown('sigterm'));

  // 崩溃防线：uncaughtException → 崩干净（让宿主重启语义一次到位）
  process.on('uncaughtException', (e) => {
    log(`uncaughtException: ${errorMessage(e)}\n${(e && e.stack) || ''}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (e) => {
    log(`unhandledRejection: ${errorMessage(e)}`);
  });

  // 就绪信号：stderr 一行（便于排障）
  log('就绪（tools/list 可用）');
  if (process.env.CAP_DEBUG_HOME) log(`CAP_DEBUG_HOME=${process.env.CAP_DEBUG_HOME}`);
}

let _shutdown = false;
async function shutdown(reason) {
  if (_shutdown) return;
  _shutdown = true;
  log(`关闭（${reason}）`);
  try { await registry.stop(); } catch (_) { /* 忽略 */ }
  try { await overlayHost.stop(); } catch (_) { /* 忽略 */ }
  process.exit(0);
}

main().catch((e) => {
  // 启动即失败：明确退出码让宿主重启语义清晰
  log(`启动失败: ${errorMessage(e)}\n${(e && e.stack) || ''}`);
  process.exit(4);
});
