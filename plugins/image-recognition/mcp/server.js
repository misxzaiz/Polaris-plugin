#!/usr/bin/env node
/**
 * image-recognition MCP Server
 *
 * 智谱 GLM-4V 视觉模型图片识别工具。
 * 协议：JSON-RPC 2.0 over stdio（MCP 2024-11-05）。
 *
 * 启动参数：
 *   node server.js [appConfigDir]
 *
 * 配置来源：读取 Polaris config.json 的 plugins["image-recognition"] 命名空间。
 * 优先读 {{appConfigDir}}，缺失时兜底探测「数据存储」（DataRoot）目录，解决
 * 桌面 Tauri 注入目录与 ConfigStore 落盘目录不一致导致的配置写读分离。
 * 字段：apiKey（必填）、model（默认 glm-4v-flash）、baseUrl（默认智谱官方端点）。
 * 每次调用时读取（非启动缓存），面板保存后无需重启即生效。
 *
 * 图片输入两种方式：
 *   1. 本地文件路径 → 读字节流 → base64 → data:image/...;base64, 前缀
 *   2. URL → 直接透传
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SERVER_NAME = 'image-recognition-mcp';
const SERVER_VERSION = '0.1.3';
const PROTOCOL_VERSION = '2024-11-05';

// ── 配置读取 ──────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'image-recognition';
const APP_CONFIG_DIR = process.argv[2] || '';

// 兜底候选目录：除 {{appConfigDir}} 外，再探测 Polaris「数据存储」根目录，
// 避免桌面 Tauri 注入目录与 ConfigStore 落盘目录不一致导致的「配置写读分离」。
// 优先级：MCP 注入目录（APP_CONFIG_DIR） > DataRoot 目录 > 默认值。
const FALLBACK_CANDIDATES = [
  // 新版 DataRoot：%APPDATA%/Polaris（Windows）
  path.join(process.env.APPDATA || '', 'Polaris'),
  // 小写 polaris 目录（历史迁移残留）
  path.join(process.env.APPDATA || '', 'polaris'),
].filter(Boolean);

/** 默认配置 */
function defaultConfig() {
  return {
    apiKey: '',
    model: 'glm-4v-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  };
}

/**
 * 从单个 config.json 读取 plugins[PLUGIN_ID] 命名空间。
 * @param {string} dir 配置目录
 * @returns {object|null} 插件配置；文件不存在或解析失败返回 null
 */
function readPluginConfigFrom(dir) {
  if (!dir) return null;
  try {
    const cfgPath = path.join(dir, 'config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const root = JSON.parse(raw);
    return (root.plugins && root.plugins[PLUGIN_ID]) || null;
  } catch (e) {
    console.error(`[image-recognition] 读取配置失败 ${dir}: ${e.message}`);
    return null;
  }
}

/**
 * 从 Polaris config.json 读取插件配置（多候选目录合并）。
 * config.json 结构：{ ..., "plugins": { "image-recognition": { apiKey, model, baseUrl } } }
 *
 * 每次调用时读取（非启动缓存），确保面板保存后无需重启 MCP server 即生效。
 *
 * MCP server spawn 时不注入环境变量（session.rs 用空 env），
 * 故通过 {{appConfigDir}} 占位符拿到配置目录，直接读文件。
 */
function loadConfig() {
  const defaults = defaultConfig();

  // 候选目录：按优先级从低到高排列，后面的覆盖前面的（非空值才覆盖）。
  // DataRoot/历史目录兜底在前，{{appConfigDir}} 注入目录最后，确保注入目录优先；
  // 但注入目录中的空字符串不会覆盖低优先级目录里的有效值（如某目录残留空 apiKey）。
  const candidates = [...FALLBACK_CANDIDATES, APP_CONFIG_DIR]
    .filter((d, i, arr) => d && arr.indexOf(d) === i);

  const found = {};
  for (const dir of candidates) {
    const cfg = readPluginConfigFrom(dir);
    if (!cfg) continue;
    for (const key of Object.keys(cfg)) {
      const val = cfg[key];
      if (typeof val === 'string' && val.trim() !== '') found[key] = val;
      else if (typeof val !== 'string') found[key] = val;
    }
  }

  return {
    apiKey: found.apiKey || defaults.apiKey,
    model: found.model || defaults.model,
    baseUrl: found.baseUrl || defaults.baseUrl,
  };
}

// ── 图片处理 ──────────────────────────────────────────────────────────────────

/** 文件扩展名 → MIME 映射。 */
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
};

/**
 * 将本地图片转为 data URL（base64 编码）。
 * @param {string} filePath 图片绝对或相对路径
 * @returns {string} data:image/xxx;base64,...
 */
function fileToDataUrl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`图片文件不存在: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * 判断输入是本地文件路径还是 URL。
 * URL 形如 http:// 或 https://；其余视为本地路径。
 */
function isUrl(input) {
  return /^https?:\/\//i.test(input);
}

// ── 智谱 API 调用 ─────────────────────────────────────────────────────────────

/**
 * 调用智谱 GLM-4V chat/completions 端点。
 *
 * 请求体关键差异：messages[].content 必须是数组，同时放 text 和 image_url 两个元素。
 * 本地图片需 data:image/...;base64, 前缀；URL 直接透传。
 *
 * @param {object} cfg { apiKey, model, baseUrl }
 * @param {string} imageUrl data URL 或 http(s) URL
 * @param {string} prompt 识别指令
 * @param {number} maxTokens 最大输出 token
 * @returns {Promise<string>} 识别结果文本
 */
function callVisionApi(cfg, imageUrl, prompt, maxTokens = 3000) {
  return new Promise((resolve, reject) => {
    if (!cfg.apiKey) {
      reject(new Error('未配置 API Key，请在插件面板填入智谱 API Key'));
      return;
    }
    const baseUrl = (cfg.baseUrl || 'https://open.bigmodel.cn/api/paas/v4')
      .trim().replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    const body = JSON.stringify({
      model: cfg.model || 'glm-4v-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt || '请识别这张图片，简要描述主要内容。' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
      temperature: 0.2,
      stream: false,
      max_tokens: maxTokens,
    });

    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errMsg = `HTTP ${res.statusCode}`;
          try {
            const errObj = JSON.parse(data);
            if (errObj.error) errMsg += `: ${errObj.error.message || errObj.error}`;
            else if (errObj.msg) errMsg += `: ${errObj.msg}`;
          } catch (_) { if (data) errMsg += `: ${data.slice(0, 200)}`; }
          reject(new Error(`智谱 API 调用失败: ${errMsg}`));
          return;
        }
        try {
          const result = JSON.parse(data);
          const content = result.choices?.[0]?.message?.content || '';
          resolve(extractAnswer(content));
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('智谱 API 请求超时（60s）')); });
    req.write(body);
    req.end();
  });
}

/**
 * 从模型输出中提取最终答案。
 *
 * glm-4.1v-thinking-flash 会输出 workingUF 推理过程 + <answer> 结论。
 * 过滤 workingUF 段，只取 <answer> 标签内内容（或全文）。
 */
function extractAnswer(content) {
  if (typeof content !== 'string') return JSON.stringify(content);
  // 优先取 <answer>...</answer> 标签内容
  const answerMatch = content.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (answerMatch) return answerMatch[1].trim();
  // 过滤 workingUF 段（thinking 模型特有）
  const filtered = content.replace(/workingUF[\s\S]*?(?=<answer|$)/gi, '').trim();
  return filtered || content;
}

/**
 * 保头保尾截断：超长文本保留头部与尾部，中段以省略标记代替。
 *
 * 纯头部截断（slice 前 N 字符）会让长文分析的结尾总结/结论全丢；
 * 保头+保尾保证关键结论即使超长也留在返回文本中，供 AI 完整理解。
 *
 * @param {string} text 原始文本
 * @param {number} headCap 保留的头部字符数
 * @param {number} tailCap 保留的尾部字符数
 * @returns {string} 截断后的文本（未超长时原样返回）
 */
function truncateHeadTail(text, headCap, tailCap) {
  if (typeof text !== 'string') return text;
  if (text.length <= headCap + tailCap) return text;
  const head = text.slice(0, headCap);
  const tail = text.slice(text.length - tailCap);
  return `${head}\n…[truncated, total ${text.length} chars]\n${tail}`;
}

// ── MCP 工具处理 ──────────────────────────────────────────────────────────────

/**
 * 单张图片转 data URL / URL。
 * @param {string} input 图片路径或 URL
 * @returns {string} 可直接传给智谱的 image_url
 */
function toImageUrl(input) {
  if (isUrl(input)) return input;
  return fileToDataUrl(input);
}

/**
 * 识别单张图片，返回结构化结果（保头保尾截断）。
 * @param {object} cfg 插件配置 { apiKey, model, baseUrl }
 * @param {string} input 图片路径或 URL
 * @param {string} prompt 识别指令
 * @param {number} maxTokens 每张输出预算
 * @returns {Promise<{ok: boolean, file?: string, result?: string, error?: string}>}
 */
async function recognizeOne(cfg, input, prompt, maxTokens) {
  try {
    const imageUrl = toImageUrl(input);
    const result = await callVisionApi(cfg, imageUrl, prompt, maxTokens);
    const safeResult = truncateHeadTail(result, 6000, 2000);
    return { ok: true, file: input, result: safeResult };
  } catch (e) {
    return { ok: false, file: input, error: e.message };
  }
}

/** 目录中可识别的图片扩展名（小写，去点）。 */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

/**
 * 扫描目录下图片文件（按文件名排序，稳定输出）。
 * @param {string} dir 目录绝对路径
 * @param {string[]} exts 允许的扩展名（小写无点）
 * @param {boolean} recursive 是否递归子目录
 * @param {number} limit 最多返回的图片数
 * @returns {{files: string[], skipped: number}} 图片绝对路径列表 + 因 limit 跳过的数量
 */
function scanImageFiles(dir, exts, recursive, limit) {
  const out = [];
  let skipped = 0;
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      return; // 无权限等跳过
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!exts.includes(ext)) continue;
        if (out.length >= limit) { skipped++; continue; }
        out.push(full);
      }
    }
  };
  walk(dir);
  return { files: out, skipped };
}

/** 批量识别（串行，单张失败不中断整批）。 */
async function recognizeBatch(cfg, inputs, prompt, maxTokens) {
  const results = [];
  for (const input of inputs) {
    results.push(await recognizeOne(cfg, input, prompt, maxTokens));
  }
  return results;
}

/** 钳制输出预算：默认 3000，下限 500，上限 8000。 */
function clampMaxTokens(value) {
  return Math.min(Math.max(value || 3000, 500), 8000);
}

async function handleRecognizeImage(args) {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: '未配置 API Key，请在插件面板的「配置」页填入智谱 API Key' }) }],
      isError: true,
    };
  }

  // 支持单张 image 字段与多图 images 数组（多图批量逐张识别）。
  const inputs = args.images && Array.isArray(args.images) && args.images.length > 0
    ? args.images
    : (args.image ? [args.image] : []);
  if (inputs.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: '缺少 image（或 images 数组）参数' }) }],
      isError: true,
    };
  }

  const prompt = args.prompt || '请识别这张图片，简要描述主要内容。';
  const maxTokens = clampMaxTokens(args.maxTokens);

  const batch = await recognizeBatch(cfg, inputs, prompt, maxTokens);
  const okList = batch.filter(r => r.ok);
  if (batch.length === 1) {
    const r = batch[0];
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(r.ok
          ? { success: true, model: cfg.model, prompt, result: r.result }
          : { error: r.error }, null, 2),
      }],
    };
  }
  // 多图：返回逐张结构化结果，单张失败标记 error 不中断。
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: okList.length > 0,
        model: cfg.model,
        prompt,
        count: batch.length,
        okCount: okList.length,
        results: batch.map(r => ({ file: r.file, status: r.ok ? 'ok' : 'error', ...(r.ok ? { result: r.result } : { error: r.error }) })),
      }, null, 2),
    }],
  };
}

async function handleRecognizeImageDir(args) {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: '未配置 API Key，请在插件面板的「配置」页填入智谱 API Key' }) }],
      isError: true,
    };
  }

  const dir = args.dir;
  if (!dir || typeof dir !== 'string' || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `目录不存在或不是文件夹: ${dir || '(空)'}` }) }],
      isError: true,
    };
  }

  const exts = (args.extensions || '.png,.jpg,.jpeg,.webp')
    .split(',').map(s => s.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  const limit = Math.min(Math.max(args.limit || 8, 1), 50);
  const recursive = !!args.recursive;
  const prompt = args.prompt || '请识别这张图片，简要描述主要内容。';
  const maxTokens = clampMaxTokens(args.maxTokens);

  const { files, skipped } = scanImageFiles(dir, exts, recursive, limit);
  if (files.length === 0) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `目录中没有可识别的图片（${dir}）` }) }],
      isError: true,
    };
  }

  const batch = await recognizeBatch(cfg, files, prompt, maxTokens);
  const okCount = batch.filter(r => r.ok).length;

  let summary = `已识别 ${dir} 下 ${batch.length} 张图片`;
  if (skipped > 0) summary += `（另有 ${skipped} 张因 limit=${limit} 未识别）`;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: okCount > 0,
        dir,
        model: cfg.model,
        prompt,
        count: batch.length,
        okCount,
        skipped,
        results: batch.map(r => ({ file: r.file, status: r.ok ? 'ok' : 'error', ...(r.ok ? { result: r.result } : { error: r.error }) })),
        summary,
      }, null, 2),
    }],
  };
}

// ── 工具定义 ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'recognize_image',
    description: '使用智谱 GLM-4V 视觉模型识别图片内容。支持本地图片文件路径、HTTP/HTTPS URL，以及多图数组（images）。本地图片自动转 base64 编码上传。',
    inputSchema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          minLength: 1,
          description: '单张图片路径或 URL。本地路径如 C:/photos/cat.jpg；URL 如 https://example.com/image.jpg',
        },
        images: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: '多张图片路径或 URL 数组（与 image 二选一，传数组时逐张识别并合并结果）',
        },
        prompt: {
          type: 'string',
          description: '识别指令，默认「请识别这张图片，简要描述主要内容。」。可自定义如「识别图中文字」「描述图片风格」',
        },
        maxTokens: {
          type: 'number',
          description: '每张的最大输出 token 数（500-8000，默认 3000）。长文分析建议 3000+，过低会被模型输出预算腰斩',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'recognize_image_dir',
    description: '批量识别本地目录下的全部图片（逐张调用 GLM-4V，单张失败不中断整批）。适合检查建模渲染帧、动画静帧等成组图片。',
    inputSchema: {
      type: 'object',
      required: ['dir'],
      properties: {
        dir: {
          type: 'string',
          minLength: 1,
          description: '本地目录绝对路径，如 D:/space/base/Polaris/temp/claude-animation-base/out/stills_tw',
        },
        prompt: {
          type: 'string',
          description: '识别指令，默认「请识别这张图片，简要描述主要内容。」。可自定义如「逐条指出画面问题」',
        },
        maxTokens: {
          type: 'number',
          description: '每张的最大输出 token 数（500-8000，默认 3000）',
        },
        extensions: {
          type: 'string',
          description: '逗号分隔的扩展名（默认 .png,.jpg,.jpeg,.webp）',
        },
        limit: {
          type: 'number',
          description: '最多识别的图片数（1-50，默认 8，防止批量爆炸）',
        },
        recursive: {
          type: 'boolean',
          description: '是否递归子目录（默认 false）',
        },
      },
      additionalProperties: false,
    },
  },
];

// ── JSON-RPC ──────────────────────────────────────────────────────────────────

function handleInitialize() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  };
}

function handleToolsList() {
  return { tools: TOOLS };
}

function sendResponse(id, result, error) {
  const msg = { jsonrpc: '2.0', id };
  if (error) msg.error = { code: -32000, message: error };
  else msg.result = result;
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleRequest(request) {
  if (request.jsonrpc !== '2.0') return sendResponse(request.id, null, 'Invalid Request');
  if (request.id === undefined || request.id === null) return;
  try {
    switch (request.method) {
      case 'initialize': return sendResponse(request.id, handleInitialize());
      case 'notifications/initialized': return sendResponse(request.id, {});
      case 'ping': return sendResponse(request.id, {});
      case 'tools/list': return sendResponse(request.id, handleToolsList());
      case 'tools/call': {
        const name = request.params.name;
        const args = request.params.arguments || {};
        let result;
        switch (name) {
          case 'recognize_image': result = await handleRecognizeImage(args); break;
          case 'recognize_image_dir': result = await handleRecognizeImageDir(args); break;
          default:
            result = {
              content: [{ type: 'text', text: JSON.stringify({ error: `未知工具: ${name}` }) }],
              isError: true,
            };
        }
        return sendResponse(request.id, result);
      }
      default: return sendResponse(request.id, null, `Unsupported method: ${request.method}`);
    }
  } catch (e) {
    return sendResponse(request.id, null, e.message);
  }
}

// ── 启动 ──────────────────────────────────────────────────────────────────────

console.error(`[image-recognition] MCP server 已启动，configDir=${APP_CONFIG_DIR || '(未提供)'}`);

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  try { handleRequest(JSON.parse(t)); }
  catch (e) { /* 忽略非 JSON 行 */ }
});
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
