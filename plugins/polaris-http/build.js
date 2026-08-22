import * as esbuild from 'esbuild'
import { readFileSync } from 'fs'

const isProd = process.argv.includes('--minify')

esbuild.build({
  entryPoints: ['src/panel.jsx'],
  outfile: 'dist/panel.js',
  bundle: true,
  format: 'esm',
  minify: isProd,
  sourcemap: isProd ? false : 'inline',
  target: 'es2022',
  external: ['react', 'react-dom'],
  loader: {
    '.css': 'text',
    '.html': 'text',
    '.js': 'jsx',
  },
  jsx: 'automatic',
  jsxImportSource: 'react',
  plugins: [{
    name: 'ensure-dist',
    setup(build) {
      build.onEnd(() => {
        console.log(isProd ? '✓ build (production)' : '✓ build (development)')
      })
    },
  }],
}).catch(() => process.exit(1))