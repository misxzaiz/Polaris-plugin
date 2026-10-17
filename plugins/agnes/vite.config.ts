import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 外部插件构建配置
 *
 * 关键：react / react-dom / react/jsx-runtime 声明为 external——
 * 宿主聊天/Panel webview 由 pluginModuleLoader shim 注入 React 全局
 * （window.__POLARIS_HOST_REACT__ 与 __POLARIS_HOST_REACT_JSX__），
 * 插件打包产物不内嵌 React，避免版本冲突与体积膨胀。
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