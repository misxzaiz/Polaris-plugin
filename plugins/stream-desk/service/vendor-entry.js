'use strict';
// ws 打包入口：esbuild 打成单文件 CJS（vendor/ws.cjs），运行时零 node_modules 依赖。
// bufferutil / utf-8-validate 必须保持 external：ws 对它们是可选增强，
// 打包时若尝试解析会直接构建失败；运行时 ws 自己 try-require 失败即降级纯 JS。
const WebSocket = require('ws');
module.exports = WebSocket;
module.exports.default = WebSocket;
