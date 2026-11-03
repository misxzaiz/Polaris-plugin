/**
 * CSV 检查台面板 SSR 渲染断言
 *
 * 坑纪律（trace-lens / unicode-lens / regex-desk / text-triage 实证）：
 * - esbuild 必须 --external:react（bundle 内打 react 与测试进程双实例，hooks 全废）
 * - 测试 bundle 输出到插件目录内固定 .ssr-tmp/（tmpdir 会命中用户主目录杂散 react）
 * - mkdtemp 随机后缀 rm 失败即永久泄漏：固定目录 + 开跑先清残留 + 退出前 5×200ms 重试
 * - process.exit 不能在 try 块内（跳过 finally 清理）：退出码收集后 finally 外赋值
 */
import { build } from 'esbuild'
import { rmSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

const pluginRoot = resolve(process.cwd())
const SSR_TMP = resolve(pluginRoot, '.ssr-tmp')

let passed = 0
let failed = 0
const failures = []

function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(`${name}${extra ? ` :: ${extra}` : ''}`); console.log(`  ✗ ${name}${extra ? ` :: ${extra}` : ''}`) }
}

async function cleanup() {
  for (let i = 0; i < 5; i++) {
    try { rmSync(SSR_TMP, { recursive: true, force: true }); return } catch { await delay(200) }
  }
  console.error('警告: .ssr-tmp 清理失败（残留，可手动删除）')
}

async function main() {
  try {
    rmSync(SSR_TMP, { recursive: true, force: true }) // 开跑先清陈旧残留
    mkdirSync(SSR_TMP, { recursive: true })
    const outfile = resolve(SSR_TMP, 'panel-ssr.cjs')
    await build({
      entryPoints: [resolve(pluginRoot, 'src/index.tsx')],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react/jsx-runtime'],
      outfile,
      logLevel: 'silent',
    })
    const require = createRequire(import.meta.url)
    const React = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const mod = require(outfile)
    const Entry = mod.default || mod
    // 空状态渲染
    const emptyHtml = renderToStaticMarkup(React.createElement(Entry, {}))
    check('SSR 空状态渲染出面板根节点', emptyHtml.includes('cl-root'))
    check('标题渲染（CSV 检查台）', emptyHtml.includes('CSV 检查台'))
    check('输入区占位符含 CSV 示例', emptyHtml.includes('粘贴 CSV'))
    // 带 initialText 的完整渲染路径（走 parse → 页签 → 表格/诊断）
    const html = renderToStaticMarkup(React.createElement(Entry, { initialText: 'name,qty\n扳手,3\nab"c,2\n' }))
    check('四页签齐备', ['解析诊断', '类型推断', '转换', '规范化'].every((t) => html.includes(t)))
    check('统计行渲染（数据行/列数）', html.includes('数据行 2') && html.includes('列 2'))
    check('诊断问题渲染（裸引号）', html.includes('未加引号的字段'))
    check('预览表格渲染', html.includes('扳手'))
    check('无 react 双实例崩溃（hooks 正常）', html.length > 1000)
  } finally {
    await cleanup()
  }
  console.log(`\n面板 SSR: ${passed} 通过 / ${failed} 失败`)
  if (failures.length) { console.log('失败清单:'); failures.forEach((f) => console.log('  - ' + f)) }
  process.exitCode = failed > 0 ? 1 : 0
}

main().catch((e) => {
  console.error('SSR harness 异常:', e)
  cleanup().then(() => { process.exitCode = 1 })
})
