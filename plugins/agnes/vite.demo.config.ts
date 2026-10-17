import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Demo 页配置：宿主为浏览器（模拟 hostInvoke），React 正常打包。 */
export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist-demo',
  },
  server: {
    port: 5174,
    open: true,
  },
})