/**
 * fixtures.mjs —— 合成构建产物夹具（零 esbuild 依赖：用 core.buildMappings 手造 sourcemap）
 *
 * 目录形态（期望值全部显式计算，供各层测试断言）：
 *   app.js(+map)     —— 应用码 60B / lodash@4.17.21 100B / 中文多字节 65B / ×12 moment locale(各6B) / 无映射尾巴 28B
 *                      sourcesContent：main.tsx 2.5KB 唯一内容；lodash 源 3KB（与 vendor.js 里 lodash 源同内容 → 内容重复对）
 *   vendor.js(+map)  —— lodash@4.17.20 90B（与 4.17.21 构成版本冲突）/ lodash@4.17.21 同路径 40B（同源进 2 chunk）/ react 50B
 *   nomap.js         —— 无 map（30B，仅文件级）
 *   styles.css       —— 无 map（200B，CSS 扩展名也要被识别）
 *   sub/chunk2.js(+map) —— webpack:// 前缀源（应用 70B）+ react-dom 80B；验证子目录遍历 + scheme 剥离
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = require(path.join(__dirname, '..', 'shared', 'core.js'))

const rmRfForce = (p) => { try { fs.rmSync(p, { recursive: true, force: true }) } catch (_) { /* 忽略 */ } }

const CONTENT_APP = '// app unique content\n' + 'export const x = 1\n'.repeat(130) // ~2.5KB
const CONTENT_LODASH = '/* lodash shared content */\n' + 'module.exports = f\n'.repeat(150) // ~3KB

const PATH_LODASH_21 = 'node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js'
const PATH_LODASH_20 = 'node_modules/.pnpm/lodash@4.17.20/node_modules/lodash/lodash.js'
const PATH_REACT = 'node_modules/react/index.js'
const PATH_REACT_DOM = 'node_modules/react-dom/index.js'
const PATH_MAIN = 'src/main.tsx'
const PATH_LAZY = 'src/lazy.tsx'
const PATH_MOMENT = (i) => `node_modules/moment/locale/lo-${i}.js`

function buildFixtureDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-lens-fixture-'))
  const writeChunk = (rel, lines, sources, contents) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const content = lines.join('\n') + '\n'
    fs.writeFileSync(abs, content)
    const segs = []
    sources.forEach((_, i) => {
      const row = lines[i] != null ? i : -1
      if (row >= 0) segs[row] = [[0, i, i * 3, 0]]
    })
    for (let i = 0; i < lines.length; i++) if (!segs[i]) segs[i] = []
    fs.writeFileSync(`${abs}.map`, JSON.stringify({
      version: 3, file: rel, sources, sourcesContent: contents, names: [], mappings: core.buildMappings(segs),
    }))
    return Buffer.byteLength(content)
  }

  // ── app.js：0=app 60B，1=lodash21 3KB，2=zh-cn 65B，3..14=locale 各6B，15=tail 28B 无映射
  const appLine = '//'.repeat(30)
  const lod21Line = 'a'.repeat(3072) // 3KB，超过内容查重门槛 2KB
  const cjkLine = '中文测试'.repeat(5) + 'abcde' // 3*20+5 = 65
  const localeLines = Array.from({ length: 12 }, (_, i) => `/*L${i}*/`) // 各 6B
  const tailLine = 'unmapped-tail'.repeat(2)
  const appSources = [PATH_MAIN, PATH_LODASH_21, 'node_modules/moment/locale/zh-cn.js', ...Array.from({ length: 12 }, (_, i) => PATH_MOMENT(i))]
  const appContents = [CONTENT_APP, CONTENT_LODASH, ...Array.from({ length: 14 }, () => null)]
  const appBytes = writeChunk('app.js', [appLine, lod21Line, cjkLine, ...localeLines, tailLine], appSources, appContents)

  // ── vendor.js：0=lodash20 3KB（内容=lodash21 内容 → 内容重复对），1=lodash21(同路径) 40B，2=react 50B
  const vendorSources = [PATH_LODASH_20, PATH_LODASH_21, PATH_REACT]
  const vendorContents = [CONTENT_LODASH, null, null]
  const vendorBytes = writeChunk('vendor.js', ['b'.repeat(3072), 'c'.repeat(40), 'd'.repeat(50)], vendorSources, vendorContents)

  // ── sub/chunk2.js：webpack:// 前缀
  const subSources = [`webpack://my-app/./${PATH_LAZY}`, `webpack://my-app/${PATH_REACT_DOM}`]
  const subBytes = writeChunk(path.join('sub', 'chunk2.js'), ['e'.repeat(70), 'f'.repeat(80)], subSources, [null, null])

  // ── 无 map 文件
  const noMapJs = fs.writeFileSync(path.join(dir, 'nomap.js'), '// no map\n'.repeat(3))
  const noMapCss = fs.writeFileSync(path.join(dir, 'styles.css'), '.x{color:red}\n'.repeat(20))

  const expectations = {
    chunks: 5, // app.js / vendor.js / sub/chunk2.js / nomap.js / styles.css
    lodashBytes: 3072 + 40 + 3072, // 4.17.21(3KB+40B) + 4.17.20(3KB)
    momentBytes: 65 + 10 * 6 + 2 * 7, // zh-cn 行 + lo-0..9（6B）+ lo-10/11（/*L10*/=7B）
    reactBytes: 50,
    reactDomBytes: 80,
    appBytes: 60 + 70, // main.tsx + lazy.tsx
    noMapBytes: Buffer.byteLength('// no map\n'.repeat(3)) + Buffer.byteLength('.x{color:red}\n'.repeat(20)),
    totalBytes: appBytes + vendorBytes + subBytes + Buffer.byteLength('// no map\n'.repeat(3)) + Buffer.byteLength('.x{color:red}\n'.repeat(20)),
    appJsMapped: Buffer.byteLength(appLine) + Buffer.byteLength(lod21Line) + Buffer.byteLength(cjkLine) + 72,
    versionConflict: { name: 'lodash', versions: ['4.17.20', '4.17.21'] },
    chunkDupeSource: PATH_LODASH_21,
    contentDupeBytes: Buffer.byteLength(CONTENT_LODASH),
    momentLocaleCount: 13, // zh-cn + 12
  }
  return { dir, expectations, cleanup: () => rmRfForce(dir) }
}

export { buildFixtureDist, rmRfForce }
