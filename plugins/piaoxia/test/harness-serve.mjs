'use strict';
/**
 * harness-serve.mjs —— 静态服务 harness.html + harness.js 供浏览器目检
 * 用法：node test/harness-serve.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || '9833', 10);

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>票匣 harness</title>
<style>body{margin:0;background:#0d1117}#root{max-width:980px;margin:0 auto}</style>
</head><body><div id="root"></div><script src="./harness.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(HTML);
    return;
  }
  if (p === '/harness.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(HERE, 'harness.js')));
    return;
  }
  res.writeHead(404); res.end('nope');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('harness: http://127.0.0.1:' + PORT + '/');
});
