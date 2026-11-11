#!/usr/bin/env node
/**
 * polaris-git 构建脚本：
 * 1. esbuild bundle src/index.tsx → dist/panel.js（react 外部宿主 shim）
 * 2. 面板 CSS 以 JSON 方式同步进 plugin.json / update.json 的 styles[].css
 *    （terminal-desk 用占位符文本替换，二次构建 CSS 变更不会生效——这里改为
 *    JSON.parse → 字段赋值 → stringify，幂等且恒为新值）
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
for (const filename of ['plugin.json', 'update.json']) {
  const manifestPath = join(pluginRoot, filename);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.contributes?.styles) || manifest.contributes.styles.length === 0) {
    throw new Error(`${filename} 缺少 contributes.styles 声明`);
  }
  const style = manifest.contributes.styles.find((s) => s.id === 'panel');
  if (!style) throw new Error(`${filename} 缺少 id=panel 的样式条目`);
  if (style.css !== panelCss) {
    style.css = panelCss;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
}
console.log('[polaris-git] build: dist/panel.js + styles synced (plugin.json + update.json)');
