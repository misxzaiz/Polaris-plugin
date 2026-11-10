#!/usr/bin/env node
/**
 * 交互面板 MCP Server（stdio，零依赖）
 *
 * v2 去 PRD 化（由原预览 server 泛化，不再兼容 v1 数据目录）：
 * - render_component：渲染自包含交互面板（iframe 沙箱 + 全屏 + 音效 + pointer-lock）
 * - preview_html：兼容别名（等价 render_component）
 * - read_preview / list_previews：读取 / 列出落盘产物
 * - 数据落 `<workspace>/.polaris/interactive`
 *
 * 闪造配合是**可选增强**：AI 可先用 ff_source 读应用源码，再以
 * source='flashforge' 传给本工具（切到闪造的 iframe 权限档位）。本插件
 * 不依赖闪造、不读 ff.* 键空间，未安装时完全独立可用。
 *
 * 安全：入库前静态扫描拦联网/逃逸代码；运行时 iframe 为不透明 origin
 * 沙箱（无 allow-same-origin），是隔离 AI 生成 HTML 的硬边界。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARTIFACT_TYPE = 'polaris.interactive';
/** 用户 HTML 输入上限（libs 注入前；spec: plans/interactive-threejs-games-spec.md §2.2） */
const MAX_HTML_BYTES = 2 * 1024 * 1024;
/** 落盘产物（可能已内联 vendor 库，~820KB）读取上限：2MB 用户代码 + 库体积 */
const MAX_STORED_HTML_BYTES = 4 * 1024 * 1024;
const PREVIEW_DIR = '.polaris/interactive';

/**
 * 白名单库 → vendor 产物（esbuild IIFE，构建期产出；spec §2.1）。
 * 产物无 import()、不联网；scanHtml 只扫用户 HTML——three 源码含 fetch 实现
 * （FileLoader），与注入产物合并扫描必误伤。
 */
const VENDOR_LIBS = {
  three: path.join(__dirname, '..', 'dist', 'vendor', 'three.iife.js'),
};

// argv[2]=appConfigDir argv[3]=workspacePath
const configDir = process.argv[2] || '.';
const workspacePath = (process.argv[3] || '').trim();

const rootBase = workspacePath || path.join(configDir, 'interactive-workspace');
const root = path.join(rootBase, ...PREVIEW_DIR.split('/'));

// ── 工具函数 ────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function fileModifiedIso(p) {
  try {
    return new Date(fs.statSync(p).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function isSafePreviewId(value) {
  return (
    !!value &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    !value.includes('..')
  );
}

function requireStr(args, key) {
  const raw = args && args[key];
  if (typeof raw !== 'string') {
    throw new Error(`缺少字符串参数: ${key}，请重新调用并传入完整 ${key}`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`参数 ${key} 为空，请传入非空内容`);
  }
  return trimmed;
}

function optionalTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function validateHtmlSize(html) {
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_HTML_BYTES) {
    throw new Error(`HTML 过大，当前 ${bytes} bytes，最大允许 ${MAX_HTML_BYTES} bytes。请精简或分段传入`);
  }
}

/** 落盘产物读取上限：用户代码上限 + vendor 库体积（three 注入后 ~2.8MB） */
function validateStoredHtmlSize(html) {
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_STORED_HTML_BYTES) {
    throw new Error(`交互面板 HTML 过大，当前 ${bytes} bytes，最大允许 ${MAX_STORED_HTML_BYTES} bytes`);
  }
}

/** 入库闸：拦联网与逃逸面（与闪造 BLOCK 口径对齐；沙箱是第二道硬边界）。
 * 只作用于用户 HTML——vendor 注入产物发生在扫描之后。 */
const BLOCK_RULES = [
  { re: /\bfetch\s*\(/, hint: '禁止 fetch()' },
  { re: /\bXMLHttpRequest\b/, hint: '禁止 XMLHttpRequest' },
  { re: /\bWebSocket\b/, hint: '禁止 WebSocket' },
  { re: /\bEventSource\b/, hint: '禁止 EventSource' },
  { re: /\bnavigator\.sendBeacon\b/, hint: '禁止 sendBeacon' },
  { re: /\bserviceWorker\b/, hint: '禁止 serviceWorker' },
  { re: /\bimport\s*\(/, hint: '禁止动态 import()' },
  { re: /\bwindow\.open\s*\(/, hint: '禁止 window.open' },
  { re: /\btop\.location\b|\bparent\.location\b/, hint: '禁止顶层导航' },
  { re: /\bdocument\.domain\b/, hint: '禁止 document.domain' },
  // 2026-11-10 补缺口（spec §4.4）：此前 <script src="https://..."> 不在拦截面，
  // AI 可借 CDN 外链绕过「不联网」意图；三维库走 libs 参数（本地内联）。
  { re: /<script[^>]*\bsrc\s*=\s*(['"])(?!data:)/i, hint: '禁止外链 <script src>（不联网；三维库请传 libs:["three"]）' },
];

function scanHtml(html) {
  const blocked = BLOCK_RULES.filter((r) => r.re.test(html)).map((r) => r.hint);
  if (blocked.length) {
    throw new Error(`HTML 静态扫描未通过：${blocked.join('；')}。请改为纯本地实现（无外网请求、无顶层导航）。`);
  }
}

function previewDir(previewId) {
  if (!isSafePreviewId(previewId)) throw new Error('previewId 不合法');
  return path.join(root, previewId);
}

function indexPath(previewId) {
  return path.join(previewDir(previewId), 'index.html');
}

function metadataPath(previewId) {
  return path.join(previewDir(previewId), 'metadata.json');
}

function writeMetadata(metadata) {
  fs.mkdirSync(path.dirname(metadataPath(metadata.previewId)), { recursive: true });
  fs.writeFileSync(metadataPath(metadata.previewId), JSON.stringify(metadata, null, 2), 'utf8');
}

function readMetadata(previewId) {
  const p = metadataPath(previewId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`解析交互面板元数据失败: ${e.message}`);
  }
}

function fallbackMetadata(previewId, idxPath) {
  return {
    artifactType: ARTIFACT_TYPE,
    previewId,
    title: '交互面板',
    contentType: 'html',
    sourcePath: idxPath,
    createdAt: fileModifiedIso(idxPath) || nowIso(),
    version: 1,
    versionLabel: 'v1',
    requirementId: null,
    description: null,
  };
}

function nextVersion(requirementId) {
  if (!requirementId || !fs.existsSync(root)) return 1;
  let maxVersion = 0;
  for (const name of safeReadDir(root)) {
    if (!isSafePreviewId(name)) continue;
    const meta = readMetadata(name);
    if (meta && meta.requirementId === requirementId) {
      maxVersion = Math.max(maxVersion, Number(meta.version) || 0);
    }
  }
  return maxVersion + 1;
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function newPreviewId() {
  return crypto.randomUUID();
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

/** 校验并归一 libs 参数（可选；重复去重；白名单外报错并给出可用值） */
function parseLibs(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error('libs 必须是字符串数组');
  }
  const libs = [...new Set(value.map((s) => s.trim()).filter(Boolean))];
  const unknown = libs.filter((l) => !VENDOR_LIBS[l]);
  if (unknown.length) {
    throw new Error(`不支持的库: ${unknown.join(', ')}。当前可用: ${Object.keys(VENDOR_LIBS).join(', ')}`);
  }
  return libs;
}

/** 读 vendor 产物（构建期 esbuild IIFE）；缺失提示先 build */
function loadVendorScript(lib) {
  try {
    const code = fs.readFileSync(VENDOR_LIBS[lib], 'utf8');
    return `<script>/* polaris-interactive vendor:${lib} */${code}</script>`;
  } catch (e) {
    throw new Error(`库 ${lib} 的 vendor 产物缺失（${VENDOR_LIBS[lib]}）。请在插件目录执行 pnpm build 后重试`);
  }
}

/** 注入 vendor <script>：完整文档插 <head> 开头，片段直接前置
 * （卡片端 buildSrcDoc 会为片段补文档壳；主题注入插在 <head> 首位，
 * 与 lib 顺序无依赖冲突）。无 libs 时原样返回——旧调用行为不变。 */
function injectLibs(html, libs) {
  if (!libs.length) return html;
  const scripts = libs.map(loadVendorScript).join('');
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + scripts);
  }
  return scripts + html;
}

function execRenderComponent(args) {
  const html = requireStr(args, 'html');
  validateHtmlSize(html);
  scanHtml(html);
  const libs = parseLibs(args.libs);
  // 注入在扫描之后：产物自包含且不被自己的扫描闸误伤
  const finalHtml = injectLibs(html, libs);
  const title = optionalTrimmedString(args.title) || '交互面板';
  const requirementId = optionalTrimmedString(args.requirementId);
  const description = optionalTrimmedString(args.description);
  const source = args.source === 'flashforge' ? 'flashforge' : 'inline';

  // 校验全部前置，从这里开始才触碰文件系统，失败不留脏目录
  const version = nextVersion(requirementId);
  const versionLabel = optionalTrimmedString(args.versionLabel) || `v${version}`;
  const createdAt = nowIso();
  const previewId = newPreviewId();
  const dir = previewDir(previewId);
  const idxPath = path.join(dir, 'index.html');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(idxPath, finalHtml, 'utf8');

  const metadata = {
    artifactType: ARTIFACT_TYPE,
    previewId,
    title,
    contentType: 'html',
    sourcePath: idxPath,
    createdAt,
    version,
    versionLabel,
    requirementId,
    description,
    libs,
  };
  writeMetadata(metadata);

  const artifact = { ...metadata, html: finalHtml, source };
  return artifactResult(artifact, `已创建交互面板: ${title}`);
}

function execReadPreview(args) {
  const previewId = requireStr(args, 'previewId');
  const p = indexPath(previewId);
  if (!fs.existsSync(p)) throw new Error(`读取交互面板失败: 不存在（${previewId}）`);
  const html = fs.readFileSync(p, 'utf8');
  validateStoredHtmlSize(html);
  const metadata = readMetadata(previewId) || fallbackMetadata(previewId, p);
  const artifact = { ...metadata, sourcePath: p, html };
  return artifactResult(artifact, '已读取交互面板');
}

function execListPreviews(args) {
  let limit = 20;
  if (args && typeof args.limit === 'number' && Number.isFinite(args.limit)) {
    limit = Math.min(50, Math.max(1, Math.trunc(args.limit)));
  }
  const previews = [];
  if (fs.existsSync(root)) {
    for (const name of safeReadDir(root)) {
      const dir = path.join(root, name);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      if (!isSafePreviewId(name)) continue;
      const idx = path.join(dir, 'index.html');
      if (fs.existsSync(idx)) {
        previews.push(readMetadata(name) || fallbackMetadata(name, idx));
      }
    }
  }
  const total = previews.length;
  previews.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const returned = previews.slice(0, limit);
  return {
    structuredContent: { previews: returned, total },
    content: [{ type: 'text', text: `共 ${total} 个交互面板，返回最近 ${returned.length} 个` }],
  };
}

function artifactResult(artifact, message) {
  const artifactJson = JSON.stringify(artifact);
  return {
    structuredContent: artifact,
    content: [{ type: 'text', text: `${message}\n\`\`\`json\n${artifactJson}\n\`\`\`` }],
  };
}

// ── 工具清单 ────────────────────────────────────────────────────────────────

const htmlProps = {
  title: { type: 'string', description: '面板标题' },
  html: {
    type: 'string',
    minLength: 1,
    description:
      '完整 HTML 文档或可独立渲染的片段，内联 CSS/JS。可包含音效（AudioContext / <audio>）、游戏循环（requestAnimationFrame）、动画、WebGL；卡片支持全屏、静音与 pointer-lock（点击画布 requestPointerLock 可做 FPS 视角）。禁止 fetch/XHR/WebSocket/动态 import/外链 <script src> 等联网调用与顶层导航（入库前静态扫描会拒绝）。沙箱 iframe 无 localStorage/indexedDB（进度存内存）；模型/贴图用 base64 DataURL。',
  },
  libs: {
    type: 'array',
    items: { type: 'string', enum: ['three'] },
    maxItems: 8,
    description:
      '可选，注入预打包的本地三维库。["three"] = 内联 three.js r187（全局 THREE 与 THREE_ADDONS.OrbitControls / THREE_ADDONS.GLTFLoader），适合三维建模展示与 3D 小游戏。用全局 THREE 直接写代码，不写 import、不引 CDN、不传 CDN script；GLTF 模型以 base64 DataURL 内嵌后用 loader.parse()。',
  },
  requirementId: { type: 'string', description: '可选，关联的需求 ID；同一需求下版本号会递增' },
  description: { type: 'string', description: '可选，面板说明或本版本变更摘要' },
  versionLabel: { type: 'string', description: '可选，展示版本名；未传时自动生成 v1/v2...' },
  source: {
    type: 'string',
    enum: ['inline', 'flashforge'],
    description:
      "可选，内容来源。'inline'（默认）= AI 直接产出；'flashforge' = 先用闪造 ff_source 读应用源码再传入（沿用闪造沙箱档位）。闪造未安装时忽略本字段，插件独立可用。",
  },
};

const TOOLS = [
  {
    name: 'render_component',
    description:
      '渲染一个自包含交互面板（任意 HTML+CSS+JS）。适合小游戏、可玩原型、三维建模展示、带音效的教具、图表与工具类页面：可写 AudioContext 音效、requestAnimationFrame 游戏循环、requestPointerLock 鼠标锁定；三维场景传 libs:["three"] 后用全局 THREE / THREE_ADDONS 编写（WebGL2，60fps 实测）；卡片提供全屏、静音、展开。html 必须自包含、不引用本地任意路径、不联网（外链 <script src> 会被拒绝）。可选闪造配合：先调 ff_source 取应用源码，再以 source="flashforge" 传入；不需要闪造也能独立使用。',
    inputSchema: {
      type: 'object',
      required: ['html'],
      properties: { ...htmlProps },
      additionalProperties: false,
    },
  },
  {
    name: 'preview_html',
    description:
      '创建一个自包含 HTML 交互面板（render_component 的兼容别名，schema 相同）。可含音效与动画，卡片支持全屏与静音。',
    inputSchema: { type: 'object', required: ['html'], properties: htmlProps, additionalProperties: false },
  },
  {
    name: 'read_preview',
    description: '读取之前创建的交互面板 HTML 源码（按 previewId）。',
    inputSchema: {
      type: 'object',
      required: ['previewId'],
      properties: { previewId: { type: 'string', minLength: 1 } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_previews',
    description: '列出当前工作区最近保存的交互面板（含真实总数）。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
];

// ── stdio JSON-RPC 主循环（换行分帧） ──────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function err(message) {
  return { content: [{ type: 'text', text: `错误：${message}` }], isError: true };
}

function callTool(name, args) {
  switch (name) {
    case 'render_component':
      return execRenderComponent(args);
    case 'preview_html':
      return execRenderComponent(args);
    case 'read_preview':
      return execReadPreview(args);
    case 'list_previews':
      return execListPreviews(args);
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handleMessage(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

function handleMessage(msg) {
  try {
    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'interactive-mcp', version: '2.1.0' },
        },
      });
      return;
    }
    if (msg.method === 'notifications/initialized') return;
    if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
      return;
    }
    if (msg.method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      try {
        send({ jsonrpc: '2.0', id: msg.id, result: callTool(name, args) });
      } catch (e) {
        send({ jsonrpc: '2.0', id: msg.id, result: err(e.message || '工具执行失败') });
      }
      return;
    }
    if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
      return;
    }
    if (msg.id != null) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在：${msg.method}` } });
    }
  } catch (e) {
    if (msg && msg.id != null) send({ jsonrpc: '2.0', id: msg.id, result: err(`内部错误：${e.message}`) });
  }
}
