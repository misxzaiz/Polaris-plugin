// SSR 渲染验证（house 范式，对齐 api-bench/domain-probe）：esbuild 打包 render-entry → react-dom/server 渲染 → 断言
// 依赖 npm run build 之后的产物无需参与；本脚本自包含构建
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = mkdtempSync(join(tmpdir(), 'dtb-render-'))

buildSync({
  entryPoints: [join(ROOT, 'test', 'render-entry.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  outfile: join(tmp, 'render.cjs'),
  logLevel: 'silent',
})

const require2 = createRequire(import.meta.url)
const { renderPanel } = require2(join(tmp, 'render.cjs'))

let html
try {
  html = renderPanel()
} finally {
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {}
}

const text = html.replaceAll('<!-- -->', '')

let bad = 0
const t = (name, fn) => {
  try {
    fn()
    console.log(`  ✔ ${name}`)
  } catch (e) {
    bad++
    console.log(`  ✖ ${name}\n    ${e.message}`)
  }
}

console.log('dev-toolbox SSR 渲染验证')

t('渲染非空且体积合理（>3KB）', () => {
  if (html.length < 3000) throw new Error(`渲染结果过小：${html.length}`)
})

t('13 个工具名全部渲染进侧栏', () => {
  const names = ['JWT 解码', '哈希计算', 'UUID 生成', 'Base64 编解码', 'URL 编解码与解析', 'JSON 格式化', 'YAML 与 JSON 互转', '正则测试', '命名风格互转', '时间戳转换', 'Cron 解析', '进制转换', '颜色转换']
  for (const n of names) if (!text.includes(n)) throw new Error(`缺少工具：${n}`)
})

t('6 个分类标签全部渲染', () => {
  for (const c of ['令牌与加密', '编解码', '格式', '文本', '时间', '数值与颜色']) {
    if (!text.includes(c)) throw new Error(`缺少分类：${c}`)
  }
})

t('默认激活第一个工具（JWT 解码）且描述可见', () => {
  if (!text.includes('JWT 解码')) throw new Error('默认工具未激活')
  if (!text.includes('解析 JWT 三段结构')) throw new Error('工具描述缺失')
})

t('搜索框与隐私声明渲染', () => {
  if (!text.includes('搜索工具')) throw new Error('搜索框缺失')
  if (!text.includes('所有计算在本地完成')) throw new Error('隐私声明缺失')
  if (!text.includes('不写入任何存储')) throw new Error('隐私声明不完整')
})

t('默认工具的输入区与提示渲染（SSR 无宿主通道不崩溃）', () => {
  if (!text.includes('placeholder')) throw new Error('输入区未渲染')
  if (!text.includes('只在本地解码')) throw new Error('JWT 输入提示缺失')
})

t('13 个工具齐全（计数）', () => {
  const btns = text.match(/dtb-toolbtn/g) || []
  // 每个按钮类名出现在 class 字符串中（含激活态），至少 13
  if (btns.length < 13) throw new Error(`工具按钮仅 ${btns.length} 个`)
})

if (bad > 0) {
  console.log(`\n${bad} 项失败`)
  process.exit(1)
} else {
  console.log('\n全部通过')
}
