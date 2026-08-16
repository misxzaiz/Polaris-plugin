// build.js — esbuild 打包 polaris-api 面板
import * as esbuild from 'esbuild'
import fs from 'fs'

const isProd = process.argv.includes('--minify')

async function build() {
  // 构建面板入口
  await esbuild.build({
    entryPoints: ['src/panel.jsx'],
    outfile: 'dist/panel.js',
    bundle: true,
    format: 'esm',
    target: 'es2020',
    jsx: 'automatic',
    loader: {
      '.css': 'text',
    },
    external: ['react'],
    minify: isProd,
    sourcemap: !isProd,
  })

  // 复制 server.js
  if (fs.existsSync('server.js')) {
    fs.copyFileSync('server.js', 'dist/server.js')
  }

  console.log(`✓ build ${isProd ? '(production)' : '(development)'}`)
}

build().catch(e => { console.error(e); process.exit(1) })