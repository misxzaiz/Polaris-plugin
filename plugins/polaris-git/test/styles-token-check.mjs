/**
 * styles-token-check —— 静态守护（terminal-desk O1 同款纪律）：
 * styles.css 中出现的每个 var(--c-*) / var(--radius-*) / var(--font-*) 名
 * 必须 ∈ 宿主 src/index.css 已定义集合（v1 曾误用不存在的 --c-bg-subtle /
 * --c-danger / --c-success 导致颜色静默失效=「样式丑」病根之一）。
 * 白名单取自主仓 src/index.css :root（light/spiderman 同名动态注入）。
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rawCss = readFileSync(join(root, 'src/styles.css'), 'utf8');
// 剥离注释后再扫描：头部注释中的反面示例 token 名（--c-bg-subtle 等）不应参与校验
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** 宿主 src/index.css :root 定义的全部自定义属性（2026-11-12 核对） */
const HOST_VARS = new Set([
  'window-opacity',
  // primary 家族
  'c-primary', 'c-primary-hover', 'c-primary-50', 'c-primary-100', 'c-primary-200', 'c-primary-300',
  'c-primary-400', 'c-primary-500', 'c-primary-600', 'c-primary-700',
  // background
  'c-bg-base', 'c-bg-elevated', 'c-bg-surface', 'c-bg-hover', 'c-bg-active', 'c-bg-tertiary', 'c-bg-secondary',
  'c-border',
  // text
  'c-text-primary', 'c-text-secondary', 'c-text-tertiary', 'c-text-muted',
  // status
  'c-status-warning', 'c-status-success', 'c-status-danger', 'c-status-info',
  'c-status-done', 'c-status-failed', 'c-status-neutral',
  // priority
  'c-priority-low', 'c-priority-normal', 'c-priority-high', 'c-priority-urgent',
  // accent
  'c-accent-ai', 'c-accent-prototype', 'c-accent-workspace',
  // misc
  'c-overlay', 'c-on-primary', 'c-canvas', 'c-tag-bg', 'c-shadow',
  // 排版
  'font-sans', 'font-mono', 'font-size-base', 'font-weight-normal', 'font-weight-medium',
  'font-weight-semibold', 'letter-spacing',
  // 形状
  'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-full', 'chat-bubble-radius',
  'border-width', 'border-style', 'chat-bubble-padding-x', 'chat-bubble-padding-y',
]);

let n = 0;
const used = [...css.matchAll(/var\(--([a-z0-9-]*[a-z0-9])/gi)].map((m) => m[1]);
const uniq = [...new Set(used)];
for (const name of uniq) {
  assert.ok(
    HOST_VARS.has(name),
    `styles.css 使用了宿主未定义的 token：--${name}（v1 的 --c-bg-subtle/--c-danger 同款错误）`,
  );
  n++;
}

// 禁全强度边框：--c-border 必须带 alpha（terminal-desk S2 病）
const plainBorder = /rgb\(\s*var\(--c-border\)\s*\)/.test(css);
assert.ok(!plainBorder, '--c-border 必须以 rgb(var(--c-border) / alpha) 使用，禁止全强度白边');

console.log(`✓ styles-token-check.mjs ${n} 个 token 名全部在宿主定义集内，边框 alpha 纪律通过`);
