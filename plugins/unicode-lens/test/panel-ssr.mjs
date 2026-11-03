/**
 * unicode-lens 面板 SSR 渲染冒烟（node test/panel-ssr.mjs）
 *
 * 交付 bundle（dist/panel.js）是 ESM 而插件 package.json 为 commonjs（宿主 blob
 * loader 自行处理，env-drift 同构），node 直 import 会按 CJS 解析报错。
 * 因此本测试用 esbuild JS API 现场构建 CJS 测试包（同入口 src/index.tsx），
 * renderToString 挂载默认导出组件——捕捉面板 JSX 路径的 undefined 崩溃
 * （cdn-audit 实证：SSR 渲染断言是面板最低渲染门槛）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import esbuild from 'esbuild'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(HERE, '..')
const SSR_BUNDLE = path.join(APP_ROOT, 'dist', '.panel-ssr.cjs')

await esbuild.build({
  entryPoints: [path.join(APP_ROOT, 'src', 'index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  outfile: SSR_BUNDLE,
  logLevel: 'silent',
})

let exitCode = 0
try {
  const requireCjs = createRequire(import.meta.url)
  const Comp = requireCjs(SSR_BUNDLE).default
  if (typeof Comp !== 'function') {
    console.error('  ✖ SSR bundle 默认导出不是组件函数')
    exitCode = 1
  } else {
    const React = (await import('react')).default
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(React.createElement(Comp, { pluginId: 'unicode-lens', onSendToChat: () => {} }))

    const results = []
    const check = (name, cond, detail = '') => {
      results.push({ name, pass: !!cond })
      console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`)
    }

    check('SSR 输出含面板标题', html.includes('Unicode 检查台'))
    check('SSR 输出含输入框占位文案', html.includes('粘贴待检文本'))
    check('SSR 输出含扫描按钮', html.includes('扫描'))
    check('SSR 输出含检测域说明', html.includes('Trojan Source'))
    check('SSR 输出含一键清洗', html.includes('一键清洗'))
    check('SSR 无渲染错误标记', !html.includes('Error') && !html.includes('undefined'), html.slice(0, 200))

    console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`)
    exitCode = results.every((r) => r.pass) ? 0 : 1
  }
} finally {
  fs.rmSync(SSR_BUNDLE, { force: true }) // 清理临时测试包——不能在 try 内 process.exit（跳过 finally 导致产物泄漏进提交）
}
process.exit(exitCode)
