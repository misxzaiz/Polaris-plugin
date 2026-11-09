#!/usr/bin/env node
/**
 * terminal-desk 构建脚本：
 * 1. esbuild bundle src/index.tsx → dist/panel.js（react 外部宿主 shim）
 * 2. 同步 xterm.css 与面板 CSS 到 plugin.json 的 styles[].css（内联清单，同 dev-toolbox 先例）
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL(import.meta.url)));
const pluginRoot = dirname(root);

await build({
  entryPoints: [join(pluginRoot, 'src/index.tsx')],
  bundle: true,
  format: 'esm',
  outfile: join(pluginRoot, 'dist/panel.js'),
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  sourcemap: false,
  logLevel: 'info',
});

// 同步 CSS 到 manifest 与 update.json（占位符替换；样式校验 256KB 上限，
// xterm.css ~4KB 远低于限。update.json 是更新协议载体，必须携带真实样式）
const xtermCss = readFileSync(
  join(pluginRoot, 'node_modules/@xterm/xterm/css/xterm.css'),
  'utf8',
);
const panelCss = readFileSync(join(pluginRoot, 'src/styles.css'), 'utf8');
// JSON 字符串转义（去首尾引号）：CSS 含换行/引号，裸注入会破坏 JSON 语法
const escapeJsonBody = (css) => JSON.stringify(css).slice(1, -1);
for (const filename of ['plugin.json', 'update.json']) {
  const manifestPath = join(pluginRoot, filename);
  const manifest = readFileSync(manifestPath, 'utf8');
  const next = manifest
    .replace('__XTERM_CSS_PLACEHOLDER__', () => escapeJsonBody(xtermCss))
    .replace('__PANEL_CSS_PLACEHOLDER__', () => escapeJsonBody(panelCss));
  if (next === manifest && manifest.includes('__XTERM_CSS_PLACEHOLDER__')) {
    throw new Error(`${filename} CSS 占位符替换失败`);
  }
  JSON.parse(next); // 替换后必须仍是合法 JSON
  writeFileSync(manifestPath, next);
}
console.log('[terminal-desk] build: dist/panel.js + styles synced (plugin.json + update.json)');
