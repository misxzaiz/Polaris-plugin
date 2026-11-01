'use strict';
// 构建 service/vendor/ws.cjs（api-bench 的 autocannon vendor 同款思路）。
// bufferutil / utf-8-validate 必须 external：ws 对它们是可选增强，
// 运行时 ws 自己 try-require 失败即降级纯 JS，不影响功能。
// 用法：npm run build:vendor （仅开发机需要；产物随仓出货，装完即用）
const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: ['service/vendor-entry.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'service/vendor/ws.cjs',
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});
console.log('vendor/ws.cjs 构建完成');
