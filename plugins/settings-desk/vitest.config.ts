import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const src = resolve(root, 'src')

// settings-desk 测试配置：与 build.mjs 的 alias 语义一致。
// 测试触达面目前仅 SettingsSidebar（纯 UI + platform 工具），alias 只列必要项。
export default defineConfig({
  resolve: {
    alias: [
      { find: 'react-i18next', replacement: resolve(src, 'i18nShim.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    server: {
      deps: {
        inline: ['react-i18next', 'i18next'],
      },
    },
  },
})
