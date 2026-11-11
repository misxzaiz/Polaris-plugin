#!/usr/bin/env node
/**
 * terminal-desk 构建脚本：
 * 1. esbuild bundle src/index.tsx → dist/panel.js（react 外部宿主 shim）
 * 2. 按 styles[].id 覆盖 plugin.json / update.json 的内联 CSS
 *
 * 修复（v0.3）：旧实现只做 __*_CSS_PLACEHOLDER__ 一次性替换，manifest 首次
 * 构建写入真实 CSS 后再改 src/styles.css 就再也不会同步——样式改动「看起来
 * 提交了但线上不生效」。改为按 id 幂等覆盖，并做逐字一致性自检。
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

const xtermCss = readFileSync(
  join(pluginRoot, 'node_modules/@xterm/xterm/css/xterm.css'),
  'utf8',
);
const panelCss = readFileSync(join(pluginRoot, 'src/styles.css'), 'utf8');
const byId = { xterm: xtermCss, panel: panelCss };

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

// 一致性自检：源码 / 两份 manifest 逐字相同，避免再次出现「改了不生效」
for (const filename of ['plugin.json', 'update.json']) {
  const styles = JSON.parse(readFileSync(join(pluginRoot, filename), 'utf8')).contributes.styles;
  for (const id of Object.keys(byId)) {
    const inline = styles.find((s) => s.id === id)?.css;
    if (inline !== byId[id]) throw new Error(`${filename}: styles[${id}] 与源文件不一致`);
  }
}
console.log('[terminal-desk] build: dist/panel.js + styles synced & verified (plugin.json + update.json)');
