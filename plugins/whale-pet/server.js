#!/usr/bin/env node
/**
 * ds大肥鱼 静态资源服务 — 供活动栏面板加载 webm/png。
 *
 * 为什么需要：宿主面板 invoke 白名单（main.tsx HOST_INVOKE_ALLOWLIST）不放行
 * download_file_binary，面板无法直接读盘；插件服务进程不受该白名单限制，
 * 由它读文件、面板经 127.0.0.1 HTTP 拉取（animation-2d 同范式）。
 *
 * 资源来源（两级）：
 *   1. 本地 assets/（dev 或完整安装时直接读盘）
 *   2. CDN 回退（发布 zip 不含 webm 以规避 jsdelivr 50MB 单包上限——109 个 webm
 *      合计 60MB 超限，拆到独立 tag `whale-pet-assets-vX.Y.Z`，单文件均 <2MB，
 *      逐文件从 jsdelivr 拉，走插件服务代理，手机端 localhost 同样可达）
 *
 * 端点：
 *   GET /__health                 健康检查
 *   GET /asset/<name>             assets/ 下文件（webm/png/wav/ttf；仅白名单扩展名，
 *                                 拒绝路径穿越；中文文件名需 URL 编码）
 *   GET /cdn/<name>               从 jsdelivr 独立 assets tag 拉单个文件（webm/png）
 *
 * 启动：node server.js <port> <pluginDir>
 */
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.argv[2] || '0', 10);
const PLUGIN_DIR = process.argv[3] || path.resolve(__dirname);
const ASSETS_ROOT = path.join(PLUGIN_DIR, 'assets');

// 发布时 webm 拆到独立 tag（见 README 发布说明）；本地开发时资源在 assets/ 直读
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@whale-pet-assets-v0.3.2/plugins/whale-pet/assets';
// 本地缓存目录：CDN 拉过即落盘，后续直读（减少 CDN 往返）
const CACHE_ROOT = path.join(PLUGIN_DIR, '.asset-cache');

// 只允许这些扩展名（本插件资源形态：webm 动画 / png 图 / wav 音效 / ttf 字体）
const EXT_MIME = {
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * 解析 asset 名 → 安全相对路径（防路径穿越）。
 * 允许最多「子目录/文件」两段（面板/悬浮窗走 /asset/webm/<名>.webm，
 * 文件实际存于 assets/webm/ 子目录）；逐段校验，拒绝反斜杠与 ..
 * （v0.4.0 修的真 bug：单段 safeName 会把 'webm/<名>' 整个拒掉 → 全量 403）。
 */
function safeName(raw) {
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* 保持原样 */ }
  if (decoded.includes('\\') || decoded.includes('..')) return null;
  const segs = decoded.split('/');
  if (segs.length > 2) return null;
  if (segs.some((s) => !s || s.includes('\\') || s.includes('..'))) return null;
  return decoded;
}

/** 从 CDN 拉单个文件，返回 Buffer（失败 null） */
function fetchCdn(filePath, mime) {
  return new Promise((resolve) => {
    const url = `${CDN_BASE}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => { chunks.push(c); size += c.length; });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), size }));
    }).on('error', () => resolve(null));
  });
}

function sendFile(res, mime, data) {
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': data.length,
    'Cache-Control': 'public, max-age=86400',
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  cors(res);
  const urlPath = decodeURIComponent((req.url || '').split('?')[0]);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (urlPath === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, plugin: 'whale-pet', cdn: CDN_BASE }));
    return;
  }

  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  // /asset/<name>：本地优先
  if (urlPath.startsWith('/asset/')) {
    const name = safeName(urlPath.slice('/asset/'.length));
    if (!name) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: '非法文件名' })); return; }
    const ext = path.extname(name).toLowerCase();
    const mime = EXT_MIME[ext];
    if (!mime) { res.writeHead(415, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: '不支持的扩展名: ' + ext })); return; }
    const target = path.resolve(ASSETS_ROOT, name);
    if (target.startsWith(path.resolve(ASSETS_ROOT) + path.sep)) {
      fs.readFile(target, (err, data) => {
        if (!err) { sendFile(res, mime, data); return; }
        // 本地缺 → CDN 回退（发布形态资源不在本地 zip）
        fetchCdn(name, mime).then((r) => {
          if (!r) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: '文件不存在: ' + name })); return; }
          // 写本地缓存（best-effort）
          try {
            fs.mkdirSync(CACHE_ROOT, { recursive: true });
            fs.writeFileSync(path.join(CACHE_ROOT, name), r.buf);
          } catch { /* 缓存失败忽略 */ }
          sendFile(res, mime, r.buf);
        });
      });
      return;
    }
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: '路径越界' }));
    return;
  }

  // /cdn/<name>：强制走 CDN（面板/后续版本用）
  if (urlPath.startsWith('/cdn/')) {
    const name = safeName(urlPath.slice('/cdn/'.length));
    if (!name) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: '非法文件名' })); return; }
    const ext = path.extname(name).toLowerCase();
    const mime = EXT_MIME[ext];
    if (!mime) { res.writeHead(415, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: '不支持的扩展名: ' + ext })); return; }
    // 缓存优先
    const cachePath = path.join(CACHE_ROOT, name);
    if (fs.existsSync(cachePath)) { sendFile(res, mime, fs.readFileSync(cachePath)); return; }
    fetchCdn(name, mime).then((r) => {
      if (!r) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'CDN 拉取失败: ' + name })); return; }
      try { fs.mkdirSync(CACHE_ROOT, { recursive: true }); fs.writeFileSync(cachePath, r.buf); } catch { /* 忽略 */ }
      sendFile(res, mime, r.buf);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, () => {
  // 不指定 host = 监听全部接口（含 127.0.0.1 与 ::1）——localhost 在部分环境解析为
  // IPv6 ::1，只绑 127.0.0.1 会让 WebView fetch localhost 连不上；本机服务无暴露面扩大
  // 之虞（Windows 防火墙默认拦外网入站 Node 监听，且插件服务先例 animation-2d 同形态）。
  process.stdout?.write?.(`[whale-pet] assets 服务就绪 http://localhost:${PORT}\n`);
});
