#!/usr/bin/env node
/**
 * model-desk 构建脚本：esbuild bundle src/index.tsx → dist/panel.js
 * - react / react-dom external（宿主 shim 同实例）
 * - react-i18next → 本地 i18nShim（转发宿主 i18n 实例；宿主页面裸说明符不可解析，
 *   与 chat-desk 的 shims/i18n.ts 同策略）
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [join(root, 'src/index.tsx')],
  bundle: true,
  format: 'esm',
  outfile: join(root, 'dist/panel.js'),
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  alias: {
    'react-i18next': join(root, 'src/i18nShim.ts'),
  },
  sourcemap: false,
  logLevel: 'info',
})
