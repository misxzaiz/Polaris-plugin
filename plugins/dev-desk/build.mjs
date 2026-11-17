#!/usr/bin/env node
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
