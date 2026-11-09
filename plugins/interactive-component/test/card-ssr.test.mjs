/**
 * 卡片 SSR 渲染冒烟（renderToString）
 *
 * 为什么存在：2026-11-08 真机事故——card.tsx 重写时 frameRef 声明丢失，
 * JSX 渲染期求值抛 ReferenceError，但 esbuild 不查未声明标识符、服务端
 * 测试又只覆盖 server.js 不碰卡片 → 构建全绿照样炸。本文件把「卡片渲染
 * 路径」锁进测试：任何渲染期抛错（未声明变量/空指针/协议分支炸）直接红。
 *
 * v2：卡片不再依赖任何 polaris-host/* 桥，esbuild 无需 stub alias。
 * 形态矩阵：完整 html / 闪造来源 / 仅 sourcePath / 脏数据 / 非字符串 previewId。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, '.tmp', 'card-ssr.bundle.mjs');
mkdirSync(dirname(bundlePath), { recursive: true });

await esbuild.build({
  entryPoints: [join(here, 'card-ssr-entry.tsx')],
  bundle: true,
  format: 'esm',
  outfile: bundlePath,
  jsx: 'automatic',
});

// Windows 坑：ESM 动态 import 绝对路径必须 file:// URL
const { renderCard } = await import(pathToFileURL(bundlePath).href);

test('SSR：完整 html 形态渲染出标题与 iframe', () => {
  const html = renderCard({
    previewId: 'pv-1234567890',
    title: '颜色选择器',
    html: '<h1>hello</h1>',
  });
  assert.ok(html.includes('颜色选择器'), '标题应上屏');
  assert.ok(html.includes('<iframe'), '应有沙箱 iframe');
});

test('SSR：iframe 具备音效与 pointer-lock 权限（闪造对齐）', () => {
  const html = renderCard({ previewId: 'pv-audio', html: '<p>x</p>' });
  assert.ok(html.includes('autoplay'), '应有 allow="autoplay"（不透明 origin 下音效必需）');
  assert.ok(html.includes('allow-pointer-lock'), '应有 pointer-lock sandbox token');
});

test('SSR：闪造来源渲染来源徽标且收紧 sandbox', () => {
  const html = renderCard({
    previewId: 'pv-ff',
    title: '贪吃蛇',
    html: '<canvas></canvas>',
    source: 'flashforge',
  });
  assert.ok(html.includes('闪造应用'), '来源徽标应上屏');
  assert.ok(!html.includes('allow-popups'), '闪造档位不应放宽弹窗权限');
});

test('SSR：仅 sourcePath（投影形态）渲染提示不抛', () => {
  const html = renderCard({ sourcePath: 'ws/.polaris/interactive/abc/index.html' });
  assert.ok(html.includes('交互面板已生成'), '应显示已生成提示');
});

test('SSR：脏数据（字符串/undefined）优雅兜底不抛', () => {
  const a = renderCard('raw string data');
  const b = renderCard(undefined);
  assert.ok(a.includes('数据解析失败'), '字符串 data 应回解析失败兜底');
  assert.ok(b.includes('数据解析失败'), 'undefined data 应回解析失败兜底');
});

test('SSR：previewId 非字符串真值不炸（2026-11-08 防御回归锁）', () => {
  const html = renderCard({
    sourcePath: 'ws/x/index.html',
    previewId: 12345678,
  });
  assert.ok(typeof html === 'string' && html.length > 0, '应正常渲染');
});
