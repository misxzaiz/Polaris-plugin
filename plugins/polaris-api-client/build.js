// build.js — esbuild 打包脚本：将 SPA 打包为 Polaris 面板 bundle。
// React 设为 external（由 Polaris 宿主提供），所有 SPA 模块打包进来。
import { build } from 'esbuild'

const isProd = process.argv.includes('--minify')

try {
  await build({
    entryPoints: ['src/panel.jsx'],
    bundle: true,
    outfile: 'dist/panel.js',
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    // React 由 Polaris 宿主提供，不打包进来（避免 "Invalid hook call"）
    external: ['react', 'react-dom'],
    // CSS 作为文本导入（import cssText from './main.css'），运行时注入 <style> 标签
    loader: { '.css': 'text' },
    // 生产环境压缩
    minify: isProd,
    // 保留可读性（开发模式）
    sourcemap: !isProd,
    // 目标现代浏览器（Polaris 基于 WebView/Chromium）
    target: 'es2022',
  })
  console.log('✓ Panel bundle built: dist/panel.js')
} catch (e) {
  console.error('✗ Build failed:', e)
  process.exit(1)
}
