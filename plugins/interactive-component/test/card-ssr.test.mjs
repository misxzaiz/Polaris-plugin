/**
 * 卡片 SSR 渲染冒烟（renderToString）
 *
 * 为什么存在：2026-11-08 真机事故——card.tsx 重写时 frameRef 声明丢失，
 * JSX 渲染期求值抛 ReferenceError，但 esbuild 不查未声明标识符、服务端
 * 测试又只覆盖 server.js 不碰卡片 → 构建全绿照样炸。本文件把「卡片渲染
 * 路径」锁进测试：任何渲染期抛错（未声明变量/空指针/协议分支炸）直接红。
 *
 * 形态矩阵：完整 html / html+form 契约 / 仅 sourcePath（投影）/ 脏数据。
 * 桥成员在 SSR 下不会执行（useEffect 跳过），stub 只需存在（见 host-bridge-stubs）。
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

// 1. 打包：src/card.tsx + renderToString 入口；三个 polaris-host 桥 alias 到 stub
await esbuild.build({
  entryPoints: [join(here, 'card-ssr-entry.tsx')],
  bundle: true,
  format: 'esm',
  outfile: bundlePath,
  jsx: 'automatic',
  alias: {
    'polaris-host/artifact': join(here, 'host-bridge-stubs.ts'),
    'polaris-host/form': join(here, 'host-bridge-stubs.ts'),
    'polaris-host/cap': join(here, 'host-bridge-stubs.ts'),
  },
});

// 2. 渲染四种形态，断言关键标记 + 不抛
// Windows 坑：ESM 动态 import 绝对路径必须 file:// URL（裸盘符路径 ERR_UNSUPPORTED_ESM_URL_SCHEME）
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

test('SSR：form 契约形态渲染回传徽标与提交提示', () => {
  const html = renderCard({
    previewId: 'pv-form',
    title: '表单组件',
    html: '<button>提交</button>',
    form: { formId: 'f-1', read: 'full', submitLabel: '提交' },
  });
  assert.ok(html.includes('表单回传'), 'read=full 徽标应上屏');
  assert.ok(html.includes('私密提交'), '私密提交复选应上屏');
});

test('SSR：read=none 形态渲染私密徽标且无私密提交复选', () => {
  const html = renderCard({
    previewId: 'pv-none',
    title: '私密组件',
    html: '<input/>',
    form: { formId: 'f-2', read: 'none' },
  });
  assert.ok(html.includes('私密回传'), 'read=none 徽标应上屏');
  assert.ok(!html.includes('私密提交（本次值不回传）'), '不应出现私密复选');
});

test('SSR：仅 sourcePath（投影形态）渲染加载态不抛', () => {
  const html = renderCard({ sourcePath: 'ws/.polaris/previews/abc/index.html' });
  assert.ok(html.includes('加载组件'), '应显示加载态');
});

test('SSR：脏数据（字符串/undefined）优雅兜底不抛', () => {
  const a = renderCard('raw string data');
  const b = renderCard(undefined);
  assert.ok(a.includes('数据解析失败'), '字符串 data 应回解析失败兜底');
  assert.ok(b.includes('数据解析失败'), 'undefined data 应回解析失败兜底');
});

test('SSR：previewId 非字符串真值不炸（2026-11-08 防御回归锁）', () => {
  // 投影形态 + 数字 previewId：旧实现 .slice(0,8) 在此抛 TypeError
  const html = renderCard({
    sourcePath: 'ws/x/index.html',
    previewId: 12345678,
  });
  assert.ok(typeof html === 'string' && html.length > 0, '应正常渲染');
});
