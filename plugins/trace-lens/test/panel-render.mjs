#!/usr/bin/env node
'use strict';
/**
 * panel-render.mjs —— 面板渲染断言（SSR 首屏骨架）
 *
 * esbuild 把 src/index.tsx 打成 CJS（react 本体随包，宿主 loader 加载的是
 * dist/panel.js 的 ESM external 形态，此处只验证渲染逻辑），renderToStaticMarkup
 * 输出断言标题/骨架文案/底部隐私行。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const TMP = path.join(PLUGIN, 'test', '.render-tmp');
fs.mkdirSync(TMP, { recursive: true });

const bundle = path.join(TMP, 'panel.cjs');
const r = spawnSync(process.execPath, [
  path.join(PLUGIN, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  path.join(PLUGIN, 'src', 'index.tsx'),
  '--bundle', '--format=cjs', '--platform=node', '--jsx=automatic',
  // react 必须 external：bundle 内打一份 react 会与测试进程 require 的 react 形成
  // 双实例，hooks 全部失效（Invalid hook call 实证）
  '--external:react', '--external:react/jsx-runtime', '--external:react-dom',
  `--outfile=${bundle}`,
], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(1);
}

const React = (await import(pathToFileURL(path.join(PLUGIN, 'node_modules', 'react', 'index.js')).href)).default;
const { renderToStaticMarkup } = await import(pathToFileURL(path.join(PLUGIN, 'node_modules', 'react-dom', 'server.js')).href);
const mod = await import(pathToFileURL(bundle).href);
// CJS 互操作：ESM import .cjs 时 default 可能再包一层 default
const Entry = mod.default && mod.default.default ? mod.default.default : mod.default;

const html = renderToStaticMarkup(React.createElement(Entry, { pluginId: 'trace-lens' }));
const checks = [
  ['标题', '链路追踪台'],
  ['读取骨架', '读取数据中'],
  ['隐私行', '数据只存本机'],
];
let pass = 0;
let fail = 0;
for (const [name, expect] of checks) {
  if (html.includes(expect)) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}（缺「${expect}」）`); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n面板渲染: ${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
