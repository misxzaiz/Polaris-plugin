/**
 * harness 静态服务（node test/harness-serve.mjs）→ http://127.0.0.1:9898
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
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
}).listen(9898, '127.0.0.1', () => {
  console.log('harness → http://127.0.0.1:9898');
});
