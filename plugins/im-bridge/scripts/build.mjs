#!/usr/bin/env node
/**
 * build.mjs —— im-bridge 构建脚本（对齐 browser-desk 范式）
 * 1. esbuild bundle src/index.tsx → dist/panel.js（react 外部宿主 shim）
 * 2. 按 styles[].id 幂等覆盖 plugin.json 的内联 CSS
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

const panelCss = readFileSync(join(pluginRoot, 'src/styles.css'), 'utf8');
const byId = { panel: panelCss };

for (const filename of ['plugin.json']) {
  const manifestPath = join(pluginRoot, filename);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const styles = manifest?.contributes?.styles;
  if (!Array.isArray(styles)) throw new Error(`${filename}: contributes.styles 缺失`);
  const seen = new Set();
  for (const style of styles) {
    if (typeof style?.id !== 'string') continue;
    if (Object.prototype.hasOwnProperty.call(byId, style.id)) {
      style.css = byId[style.id];
      seen.add(style.id);
    }
  }
  for (const id of Object.keys(byId)) {
    if (!seen.has(id)) throw new Error(`${filename}: 未找到 styles[].id="${id}"，拒绝静默不同步`);
  }
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  JSON.parse(next);
  writeFileSync(manifestPath, next);
}
console.log('build ok: dist/panel.js + plugin.json styles 同步完成');
