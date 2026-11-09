import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 外部插件构建配置（与 plugins/agnes 同一范式）：
 * react / react-dom / react/jsx-runtime external——宿主 pluginModuleLoader shim 注入。
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
