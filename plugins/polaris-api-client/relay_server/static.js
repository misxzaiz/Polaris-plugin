// relay_server/static.js — 静态文件服务（替代 Python SimpleHTTPRequestHandler + os.chdir）。
// Node 无内置静态服务，这是本次重构唯一"新增代码面"：content-type / 防路径穿越 / 目录→index / HEAD。
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};
function contentType(p) { return TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream'; }

// 把 URL 路径解析为 root 内的绝对路径；非法编码 / 逃逸 root → 返回 null。
export function resolveStaticPath(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); }
  catch { return null; }                 // 非法 % 编码
  if (p.includes('\0')) return null;
  const abs = path.join(root, p);         // join 会规整 ../
  const rel = path.relative(root, abs);
  if (rel === '') return abs;             // 命中 root 本身
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null; // 逃逸
  return abs;
}

function sendText(res, code, msg, isHead) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(Buffer.byteLength(msg)) });
  res.end(isHead ? undefined : msg);
}

// 处理 GET/HEAD 静态请求。
export function serveStatic(req, res, root) {
  const isHead = req.method === 'HEAD';
  const abs0 = resolveStaticPath(root, req.url);
  if (abs0 === null) return sendText(res, 403, 'Forbidden', isHead);

  let abs = abs0, st;
  try { st = fs.statSync(abs); }
  catch { return sendText(res, 404, 'Not Found', isHead); }
  if (st.isDirectory()) {                 // 目录 → index.html
    abs = path.join(abs, 'index.html');
    try { st = fs.statSync(abs); }
    catch { return sendText(res, 404, 'Not Found', isHead); }
  }
  res.writeHead(200, { 'Content-Type': contentType(abs), 'Content-Length': String(st.size) });
  if (isHead) return res.end();
  fs.createReadStream(abs).pipe(res);
}
