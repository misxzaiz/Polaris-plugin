/**
 * harness 静态服务（node test/harness-serve.mjs）→ http://127.0.0.1:9899
 * 注意：目录守卫用 fileURLToPath（guanzhi 版的 URL.pathname 正斜杠与
 * path.join 反斜杠不一致，startsWith 守卫在 Windows 恒 false → 恒 404）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const file = url === '/' ? 'harness.html' : url.replace(/^\//, '');
  const full = path.join(here, file);
  if (!full.startsWith(here) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(9899, '127.0.0.1', () => {
  console.log('harness → http://127.0.0.1:9899');
});
