// sync-vendor.mjs —— 把 @duckdb native 绑定同步到 service/vendor/duckdb（假 node_modules 结构）
//
// 结构：service/vendor/duckdb/node_modules/@duckdb/{node-api, node-bindings, node-bindings-win32-x64}
//   engine.js 经绝对路径 require node-api 包，其内部 require('@duckdb/node-bindings') /
//   require('@duckdb/node-bindings-<plat>-<arch>') 按标准 Node 解析算法在同层 node_modules 命中，
//   零 require-rewrite hack（面板 loader 盲重写的教训：改人手写的模块解析必炸）。
//
// 裁剪口径：只保留 package.json + 运行必需文件（.js/.d.ts 可选/.node/.dll/LICENSE），删 map/源码。
// 运行：node scripts/sync-vendor.mjs（先 npm install）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pluginRoot = path.join(import.meta.dirname, '..');

const PKGS = [
  '@duckdb/node-api',
  '@duckdb/node-bindings',
  `@duckdb/node-bindings-${process.platform}-${process.arch}`,
];
// 每个包内剔除的文件/目录（跑不起来的体积税）
const PRUNE = [/\.map$/, /README\.md$/i];

function resolvePkgDir(name) {
  return path.join(require.resolve(name + '/package.json', { paths: [pluginRoot] }), '..');
}

function copyPruned(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (PRUNE.some((re) => re.test(entry.name))) continue;
    if (entry.isDirectory()) copyPruned(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

const vendorRoot = path.join(pluginRoot, 'service', 'vendor', 'duckdb', 'node_modules');
fs.rmSync(vendorRoot, { recursive: true, force: true });
for (const name of PKGS) {
  const srcDir = resolvePkgDir(name);
  copyPruned(srcDir, path.join(vendorRoot, name)); // 保留 @duckdb/<pkg> 层级，供标准解析命中
  console.log(`vendored ${name}`);
}
const total = (function dirSize(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
})(path.join(pluginRoot, 'service', 'vendor', 'duckdb'));
console.log(`vendor total: ${(total / 1048576).toFixed(1)}MB`);
