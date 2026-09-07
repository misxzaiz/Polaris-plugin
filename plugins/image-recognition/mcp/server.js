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
const SERVER_VERSION = '0.1.1';
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
function callVisionApi(cfg, imageUrl, prompt, maxTokens = 1000) {
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

// ── MCP 工具处理 ──────────────────────────────────────────────────────────────

async function handleRecognizeImage(args) {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: '未配置 API Key，请在插件面板的「配置」页填入智谱 API Key' }) }],
      isError: true,
    };
  }

  const input = args.image;
  let imageUrl;
  try {
    if (isUrl(input)) {
      imageUrl = input;
    } else {
      imageUrl = fileToDataUrl(input);
    }
  } catch (e) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
      isError: true,
    };
  }

  const prompt = args.prompt || '请识别这张图片，简要描述主要内容。';
  const maxTokens = Math.min(Math.max(args.maxTokens || 1000, 100), 4000);

  try {
    const result = await callVisionApi(cfg, imageUrl, prompt, maxTokens);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          model: cfg.model,
          prompt,
          result,
        }, null, 2),
      }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
      isError: true,
    };
  }
}

// ── 工具定义 ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'recognize_image',
    description: '使用智谱 GLM-4V 视觉模型识别图片内容。支持本地图片文件路径和 HTTP/HTTPS URL。本地图片自动转 base64 编码上传。',
    inputSchema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          minLength: 1,
          description: '图片路径或 URL。本地路径如 C:/photos/cat.jpg；URL 如 https://example.com/image.jpg',
        },
        prompt: {
          type: 'string',
          description: '识别指令，默认「请识别这张图片，简要描述主要内容。」。可自定义如「识别图中文字」「描述图片风格」',
        },
        maxTokens: {
          type: 'number',
          description: '最大输出 token 数（100-4000，默认 1000）',
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
