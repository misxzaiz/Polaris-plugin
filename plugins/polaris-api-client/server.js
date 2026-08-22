#!/usr/bin/env node
// Polaris API Client 代理服务入口：/__proxy 跨域代理。
// 用法: node server.js [port]   默认 9861
import http from 'node:http';
import { createHandler } from './relay_server/index.js';

const PORT = Number(process.argv[2]) || 9861;
const handle = createHandler();

// 包一层请求日志到 stderr（对应 Python 的 log_message）；被测时直接用 createHandler，不带此日志。
const server = http.createServer((req, res) => {
  res.on('finish', () => process.stderr.write(`${req.socket.remoteAddress} "${req.method} ${req.url}" ${res.statusCode}\n`));
  handle(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Polaris API Client proxy → http://localhost:${PORT}`);
  console.log(`   远程访问 → http://<本机IP>:${PORT}   （放行防火墙 / 安全组）`);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
