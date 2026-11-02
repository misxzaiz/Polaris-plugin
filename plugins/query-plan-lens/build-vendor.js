'use strict';
/**
 * build-vendor.js —— 把 mysql2/pg 打成单文件 CJS（运行时 service 只带 vendor.cjs，
 * 不带 node_modules；与 db-workbench / stream-desk 同一打包纪律）。
 * 用法：node build-vendor.js（需要已 pnpm install 本目录）
 */
const esbuild = require('esbuild');
const path = require('path');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'service', 'vendor-entry.js')],
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  outfile: path.join(__dirname, 'service', 'vendor', 'vendor.cjs'),
  // pg 的可选原生绑定（libpq）不存在也不允许进 bundle
  external: ['pg-native'],
  minify: true,
  logLevel: 'warning',
});
console.log('vendor.cjs written');
