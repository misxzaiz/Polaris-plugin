#!/usr/bin/env node
/**
 * whale-pet 静态资源服务 — 供活动栏面板加载 webm/png。
 *
 * 为什么需要：宿主面板 invoke 白名单（main.tsx HOST_INVOKE_ALLOWLIST）不放行
 * download_file_binary，面板无法直接读盘；插件服务进程不受该白名单限制，
 * 由它读文件、面板经 127.0.0.1 HTTP 拉取（animation-2d 同范式）。
 *
 * 端点：
 *   GET /__health                 健康检查
 *   GET /asset/<name>             assets/ 下文件（webm/png/wav/ttf；仅白名单扩展名，
 *                                 拒绝路径穿越；中文文件名需 URL 编码）
 *
 * 启动：node server.js <port> <pluginDir>
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.argv[2] || '0', 10);
const PLUGIN_DIR = process.argv[3] || path.resolve(__dirname);
const ASSETS_ROOT = path.join(PLUGIN_DIR, 'assets');

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

const server = http.createServer((req, res) => {
  cors(res);
  const urlPath = decodeURIComponent((req.url || '').split('?')[0]);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (urlPath === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, plugin: 'whale-pet' }));
    return;
  }

  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  if (urlPath.startsWith('/asset/')) {
    const name = urlPath.slice('/asset/'.length);
    // 二次解码（中文文件名可能被双重编码）
    let decoded = name;
    try { decoded = decodeURIComponent(name); } catch { /* 保持原样 */ }
    const target = path.resolve(ASSETS_ROOT, decoded);
    // 路径穿越防护：解析后必须仍在 assets/ 内
    if (!target.startsWith(path.resolve(ASSETS_ROOT) + path.sep) && target !== path.resolve(ASSETS_ROOT)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: '路径越界' }));
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const mime = EXT_MIME[ext];
    if (!mime) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: '不支持的扩展名: ' + ext }));
      return;
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '文件不存在: ' + decoded }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': data.length,
        'Cache-Control': 'public, max-age=86400', // 资源不可变（版本化安装目录），缓存一天
      });
      res.end(data);
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
