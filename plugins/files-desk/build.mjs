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
  sourcemap: false,
  logLevel: 'info',
  plugins: [{
    name: 'host-alias',
    setup(b2) {
      b2.onResolve({ filter: /^@\// }, (args) => ({ path: join(root, 'src/deps.ts') }))
      b2.onResolve({ filter: /^react-i18next$/ }, (args) => ({ path: join(root, 'src/i18nShim.ts') }))
    },
  }],
})