import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Battle Mode 插件构建配置
 *
 * 与 agnes 同一范式：react 系列 external——
 * 宿主 panel webview 由 pluginModuleLoader shim 注入 React 全局，
 * 插件产物不内嵌 React，避免版本冲突。
 */

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'panel.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react/jsx-runtime': 'ReactJSXRuntime' },
      },
    },
    minify: true,
    sourcemap: false,
    target: 'es2020',
  },
})
