#!/usr/bin/env node
/**
 * 样式门禁：防止 v0.2.2 的两类回归再次进入发布包。
 *  1. 引用宿主不存在的 CSS 变量（整条声明静默失效 → 背景透明/颜色丢失）
 *  2. 不带 alpha 使用 border 变量（纯白描边），或内联硬编码色值
 *  3. src/styles.css 未同步进 plugin.json / update.json 的内联样式
 * 宿主 token 表从主仓 src/index.css 读取；主仓不可达时降级为本地规则检查。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL(import.meta.url)));
const pluginRoot = dirname(root);
const css = readFileSync(join(pluginRoot, 'src/styles.css'), 'utf8');
const hostCssPath = join(pluginRoot, '../../../Polaris/src/index.css');
const errors = [];

// 去掉注释，避免说明文字里的示例被当成实际声明
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

// 1) 变量引用必须可解析
const hostDefined = new Set();
if (existsSync(hostCssPath)) {
  const hostCss = readFileSync(hostCssPath, 'utf8');
  for (const m of hostCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)) hostDefined.add(m[1]);
}
const localDefined = new Set([...code.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
const refs = new Set([...code.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]));
for (const ref of refs) {
  if (localDefined.has(ref)) continue;
  if (hostDefined.size === 0) continue; // 主仓不可达，跳过跨仓对照
  if (!hostDefined.has(ref)) errors.push(`引用宿主不存在的变量: ${ref}`);
}

// 2) border 变量必须带 alpha；禁止硬编码色值
const bareBorder = [...code.matchAll(/rgb\(\s*var\(\s*--c-border\s*\)\s*\)/gi)];
if (bareBorder.length > 0) errors.push(`border 变量未带 alpha 的写法 ${bareBorder.length} 处`);
const hex = [...code.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
if (hex.length > 0) errors.push(`硬编码 HEX 色值: ${[...new Set(hex)].join(', ')}`);
const rgba = [...code.matchAll(/\brgba?\s*\(\s*\d/gi)];
if (rgba.length > 0) errors.push(`硬编码 rgb/rgba 色值 ${rgba.length} 处`);

// 3) 内联样式同步
for (const filename of ['plugin.json', 'update.json']) {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, filename), 'utf8'));
  const inline = manifest?.contributes?.styles?.find((s) => s.id === 'panel')?.css;
  if (inline !== css) errors.push(`${filename}: styles[panel].css 与 src/styles.css 不一致（请运行 npm run build）`);
}

// 4) 排版/形状/透明度必须走宿主设计 token。
//    旧版自带 Consolas + 私有 sans 栈 + 5/6/7/10px 自由圆角 + 不复合窗口透明度，
//    与旁边宿主面板接缝明显，是「土」的结构性来源，禁止回退。
for (const token of ['var(--font-sans,', 'var(--font-mono,']) {
  if (!code.includes(token)) errors.push(`未继承宿主排版 token: ${token.slice(0, -1)}`);
}
if (!code.includes('--window-opacity')) errors.push('背景未复合宿主 --window-opacity（半透明窗口下会变成不透明补丁）');
const freeRadius = [...code.matchAll(/border-radius:\s*\d+px/g)].map((m) => m[0]);
if (freeRadius.length > 0) errors.push(`自由圆角 ${freeRadius.length} 处（应走 --radius-* token）: ${[...new Set(freeRadius)].join(', ')}`);

if (errors.length > 0) {
  console.error('✗ 样式门禁失败：');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `[terminal-desk] styles OK: ${refs.size} 个变量引用、${hostDefined.size ? '宿主 token 表已对照' : '本地规则（主仓不可达）'}、两份 manifest 已同步`,
);
