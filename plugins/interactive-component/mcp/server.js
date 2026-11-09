#!/usr/bin/env node
/**
 * 交互组件 MCP Server（stdio，零依赖）
 *
 * 由主仓 `prd_preview_mcp_server.rs`（557 行）等价移植并泛化：
 * - render_component：自由交互组件（= preview_html 超集，可选 form 回传契约）
 * - preview_html：兼容别名（历史对话/提示词不断链，spec [N-1]）
 * - read_preview / list_previews：原样
 *
 * 金标对齐（行为等价清单，见 plugins/docs/interactive-component-implementation-plan.md §2.3）：
 * - 落盘：`<workspace>/.polaris/previews/<previewId>/index.html` + metadata.json
 *   （无 workspace 时落 `<configDir>/previews-workspace/.polaris/previews`）
 * - 版本：同 requirementId 下 version 递增，versionLabel 缺省自动 v1/v2…
 * - 上限：HTML ≤ 2MB（超限报错，不留脏目录——校验全部前置）
 * - 返回信封：{ structuredContent, content:[{type:'text',text}] }，artifactType 恒 "polaris.preview"
 *
 * form 回传契约（v2 新增）：marker 顶层可选 `form: { formId, read, secretKeys?, submitLabel? }`。
 * 登记与提交的信任边界在宿主（cap.ai.chat component_register / form_submit + form_core），
 * 本 server 只透传 AI 声明，不做任何信任判断（spec [S-7]：AI 的 HTML 声明不构成信任）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARTIFACT_TYPE = 'polaris.preview';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const PREVIEW_DIR = '.polaris/previews';

// ── 参数解析：argv[2]=appConfigDir argv[3]=workspacePath（与 Rust 版一致） ──
const configDir = process.argv[2] || '.';
const workspacePath = (process.argv[3] || '').trim();

const rootBase = workspacePath || path.join(configDir, 'previews-workspace');
const root = path.join(rootBase, ...PREVIEW_DIR.split('/'));

// ── 工具函数（与 Rust 版逐条对齐） ─────────────────────────────────────────

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, (m) => m); // 保留毫秒 + Z（RFC3339 millis）
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
    throw new Error(`解析预览元数据失败: ${e.message}`);
  }
}

function fallbackMetadata(previewId, idxPath) {
  return {
    artifactType: ARTIFACT_TYPE,
    previewId,
    title: 'PRD Prototype',
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

function normalizeFormDecl(args) {
  const f = args && args.form;
  if (f == null) return null;
  if (typeof f !== 'object') throw new Error('form 契约必须是对象: { formId, read, secretKeys?, submitLabel? }');
  const formId = optionalTrimmedString(f.formId);
  if (!formId) throw new Error('form.formId 必填（非空字符串）');
  const read = f.read === 'none' ? 'none' : f.read === 'full' ? 'full' : null;
  if (!read) throw new Error('form.read 仅支持 full|none');
  const secretKeys = Array.isArray(f.secretKeys)
    ? f.secretKeys.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()).slice(0, 64)
    : [];
  const submitLabel = optionalTrimmedString(f.submitLabel);
  const decl = { formId, read, secretKeys };
  if (submitLabel) decl.submitLabel = submitLabel;
  return decl;
}

function execPreviewHtml(args, { toolName }) {
  const html = requireStr(args, 'html');
  validateHtmlSize(html);
  const title =
    optionalTrimmedString(args.title) || 'PRD Prototype';
  const requirementId = optionalTrimmedString(args.requirementId);
  const description = optionalTrimmedString(args.description);
  const form = normalizeFormDecl(args);
  // caps 声明（spec [S-8]）：组件内脚本可调用的 cap 目标白名单（服务端三重门控
  // 的第三重；deny 清单不可声明）。透传登记，不做信任判断。
  let caps = null;
  if (Array.isArray(args.caps)) {
    caps = args.caps.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()).slice(0, 16);
  }

  // 所有可能失败的计算（版本号、目录解析）都已在上面完成；从这里开始才触碰
  // 文件系统，且校验已前置，失败不再留下脏目录（金标行为）。
  const version = nextVersion(requirementId);
  const versionLabel = optionalTrimmedString(args.versionLabel) || `v${version}`;
  const createdAt = nowIso();
  const previewId = newPreviewId();
  const dir = previewDir(previewId);
  const idxPath = path.join(dir, 'index.html');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(idxPath, html, 'utf8');

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
  };
  writeMetadata(metadata);

  const artifact = {
    ...metadata,
    html,
  };
  if (form) artifact.form = form;
  if (caps) artifact.caps = caps;
  return artifactResult(artifact, `已创建预览: ${title}`);
}

function execReadPreview(args) {
  const previewId = requireStr(args, 'previewId');
  const p = indexPath(previewId);
  if (!fs.existsSync(p)) throw new Error(`读取预览失败: 预览不存在（${previewId}）`);
  const html = fs.readFileSync(p, 'utf8');
  validateHtmlSize(html);
  const metadata = readMetadata(previewId) || fallbackMetadata(previewId, p);
  const artifact = { ...metadata, sourcePath: p, html };
  return artifactResult(artifact, '已读取预览');
}

function execListPreviews(args) {
  let limit = 20;
  if (args && typeof args.limit === 'number' && Number.isFinite(args.limit)) {
    limit = Math.min(50, Math.max(1, Math.trunc(args.limit)));
  }
  // total 必须取截断前的真实数量：工作区预览已达数百个，而 schema limit
  // 上限 50；旧实现先截断数组再用 previews.length 报数，文案恒等于 limit，
  // 调用方既拿不到总数、也误以为没有更多。
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
    content: [{ type: 'text', text: `共 ${total} 个预览，返回最近 ${returned.length} 个` }],
  };
}

function artifactResult(artifact, message) {
  const artifactJson = JSON.stringify(artifact);
  return {
    structuredContent: artifact,
    content: [{ type: 'text', text: `${message}\n\`\`\`json\n${artifactJson}\n\`\`\`` }],
  };
}

// ── 工具清单（schema 与 Rust 版逐字段对齐；render_component 为超集） ────────

const htmlProps = {
  title: { type: 'string', description: '预览标题' },
  html: { type: 'string', minLength: 1, description: '完整 HTML 源码，建议内联 CSS/JS' },
  requirementId: { type: 'string', description: '可选，关联的需求 ID；同一需求下版本号会递增' },
  description: { type: 'string', description: '可选，预览说明或本版本变更摘要' },
  versionLabel: { type: 'string', description: '可选，展示版本名；未传时自动生成 v1/v2...' },
};

const TOOLS = [
  {
    name: 'render_component',
    description:
      '渲染一个自包含的交互组件（任意 HTML+CSS+JS）。html 必须是完整 HTML 文档或可独立渲染的片段；不要引用本地任意路径。返回内容会在 Polaris 聊天中渲染为沙箱 iframe。可选 form 契约：声明后用户在组件内的表单提交会回喂给你（read=none 时字段值对你隐藏）。不要把秘密输入声明为 read=full。页面内提交约定：脚本调 parent.postMessage({ __polarisComponent: 1, formId: 「你声明的formId」, values: {字段: 值} }, "*")，宿主校验后走系统表单管线，回执随下一条消息注入你的上下文。',
    inputSchema: {
      type: 'object',
      required: ['html'],
      properties: {
        ...htmlProps,
        caps: { type: 'array', items: { type: 'string' }, description: '可选，组件内脚本可调用的 cap 目标白名单（如 cap.kv）；敏感能力（bash/fs 写等）在宿主 deny 清单中不可声明' },
        form: {
          type: 'object',
          description:
            '可选，表单回传契约。formId 全局唯一；read="none" 时用户提交值不进入你的上下文（只见字段名）；secretKeys 列出的键值恒定掩码。submitLabel 为提交按钮文案（缺省「提交」）。',
          required: ['formId', 'read'],
          properties: {
            formId: { type: 'string', minLength: 1, description: '回传契约 id（唯一）' },
            read: { type: 'string', enum: ['full', 'none'], description: 'AI 读取模式；服务端强制，不信任 HTML 内声明' },
            secretKeys: { type: 'array', items: { type: 'string' }, description: '恒定掩码的键名列表' },
            submitLabel: { type: 'string', description: '提交按钮文案（可选）' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'preview_html',
    description:
      '创建一个自包含 HTML 原型预览。html 必须是完整 HTML 文档或可独立渲染的片段；不要引用本地任意路径。返回内容会在 Polaris 聊天中渲染为 artifact_preview。（兼容别名 = render_component 无 form）',
    inputSchema: { type: 'object', required: ['html'], properties: htmlProps, additionalProperties: false },
  },
  {
    name: 'read_preview',
    description: '读取之前创建的 HTML 预览源码。',
    inputSchema: {
      type: 'object',
      required: ['previewId'],
      properties: { previewId: { type: 'string', minLength: 1 } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_previews',
    description: '列出当前工作区最近保存的 Polaris HTML 预览。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
];

// ── stdio JSON-RPC 主循环（换行分帧，与 needs/prompt-matrix 同构） ──────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function err(message) {
  return { content: [{ type: 'text', text: `错误：${message}` }], isError: true };
}

function callTool(name, args) {
  switch (name) {
    case 'render_component':
      return execPreviewHtml(args, { toolName: name });
    case 'preview_html':
      return execPreviewHtml(args, { toolName: name });
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
          serverInfo: { name: 'interactive-component-mcp', version: '1.1.2' },
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
