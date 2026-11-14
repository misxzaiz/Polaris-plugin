#!/usr/bin/env node
/**
 * chat-desk 构建脚本（P2 骨架）：
 * 1. esbuild bundle src/index.tsx → dist/panel.js（react/react-dom external → 宿主 shim）
 * 2. 按 styles[].id 覆盖 plugin.json / update.json 的内联 CSS（对齐 terminal-desk 纪律）
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
  // react/react-dom external：由宿主 loader 的 shim（P1.4）提供宿主实例
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  sourcemap: false,
  logLevel: 'info',
});

const panelCss = readFileSync(join(pluginRoot, 'src/styles.css'), 'utf8');
const byId = { panel: panelCss };

for (const filename of ['plugin.json', 'update.json']) {
  const manifestPath = join(pluginRoot, filename);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const styles = manifest?.contributes?.styles;
  if (!Array.isArray(styles) || styles.length === 0) {
    throw new Error(`${filename}: contributes.styles 缺失，无法同步 CSS`);
  }
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
  JSON.parse(next); // 序列化后仍须是合法 JSON
  writeFileSync(manifestPath, next);
}

// 一致性自检：两份 manifest 的 panel CSS 逐字相同
const p = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf8'));
const u = JSON.parse(readFileSync(join(pluginRoot, 'update.json'), 'utf8'));
const pc = p.contributes.styles.find((s) => s.id === 'panel').css;
const uc = u.contributes.styles.find((s) => s.id === 'panel').css;
if (pc !== uc) throw new Error('plugin.json 与 update.json 的 panel CSS 不一致');

console.log('[chat-desk] build ok: dist/panel.js + styles synced');
