// dev-toolbox 构建脚本：一个核心两份产物 + 样式同步
// 1) dist/panel.js  —— 面板 ESM bundle（react/jsx-runtime external，运行时用宿主注入的 React）
// 2) dist/core.cjs  —— 纯函数核心 CJS bundle（mcp/server.js 与离线单测共用同一实现，单一真相）
// 3) 样式同步：宿主不加载 dist/panel.css，官方机制是 manifest 的 contributes.styles[]（内联注入）。
//    src/styles.css 是唯一样式源，构建时同步进 plugin.json（target=global，类名全 dtb- 前缀防泄漏）。
import { buildSync } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'

buildSync({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/panel.js',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  logLevel: 'info',
})

buildSync({
  entryPoints: ['src/core/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/core.cjs',
  logLevel: 'info',
})

const css = readFileSync('src/styles.css', 'utf8')
const manifest = JSON.parse(readFileSync('plugin.json', 'utf8'))
manifest.contributes = manifest.contributes ?? {}
manifest.contributes.styles = [
  {
    id: 'panel',
    target: 'global',
    css,
    description: 'dev-toolbox 面板样式（dtb- 前缀防泄漏；由 build.mjs 从 src/styles.css 同步）',
  },
]
writeFileSync('plugin.json', JSON.stringify(manifest, null, 2) + '\n')
console.log('plugin.json contributes.styles 已同步（%d 字节 CSS）', css.length)
