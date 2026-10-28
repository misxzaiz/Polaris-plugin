#!/usr/bin/env node
/** 静态服务 harness.html + harness.js（node test/harness-serve.mjs [port]） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 9898;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

http.createServer((req, res) => {
  const name = req.url === '/' || req.url.startsWith('/index') ? 'harness.html' : req.url.slice(1).split('?')[0];
  const file = path.join(here, name);
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`harness at http://127.0.0.1:${port}`));
