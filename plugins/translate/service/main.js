'use strict';
/**
 * translate service —— 百度翻译 REST 代理（原 src-tauri/commands/translate.rs 语义等价搬移）
 *
 * POST /translate { text, to?, appId?, secretKey? } → { success, result, error }
 * POST /config { appId, secretKey }（宿主 configSchema 注入回写）
 * 凭证优先级：请求体 > /config 回写 > env POLARIS_TRANSLATE_APP_ID/SECRET_KEY。
 * 签名与归一化在 service/lib.js（纯函数，可测）。
 */
const http = require('node:http');
const { translateViaBaidu } = require('./lib');

const PLUGIN_VERSION = '1.0.0';

let config = { appId: '', secretKey: '' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.method === 'GET' && req.url.startsWith('/__health')) {
      return send(200, { ok: true, status: 'ok', version: PLUGIN_VERSION });
    }
    if (req.method === 'POST' && req.url.startsWith('/config')) {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (body.appId !== undefined) config.appId = String(body.appId || '');
      if (body.secretKey !== undefined) config.secretKey = String(body.secretKey || '');
      return send(200, { ok: true });
    }
    if (req.method === 'POST' && req.url.startsWith('/translate')) {
      const body = JSON.parse((await readBody(req)) || '{}');
      const text = String(body.text || '');
      const appId = body.appId || config.appId || process.env.POLARIS_TRANSLATE_APP_ID || '';
      const secretKey = body.secretKey || config.secretKey || process.env.POLARIS_TRANSLATE_SECRET_KEY || '';
      if (!text.trim()) return send(200, { success: false, result: null, error: 'text 为空' });
      if (!appId || !secretKey) {
        return send(200, { success: false, result: null, error: '百度翻译未配置（插件设置里填 App ID 与密钥）' });
      }
      const out = await translateViaBaidu({ text, appId, secretKey, to: body.to });
      return send(200, out);
    }
    return send(404, { ok: false, error: `未知道路: ${req.method} ${req.url}` });
  } catch (e) {
    return send(500, { ok: false, error: e.message });
  }
});

const PORT = Number(process.argv[2] || 0) || 9891;
server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[translate] service v${PLUGIN_VERSION} listening on 127.0.0.1:${PORT}\n`);
});
