/**
 * realmap.test.mjs —— 真实工具链产物验证（esbuild 现场打包，非手造 map）
 *
 * 手造 fixture 验证的是「引擎语义」，这里验证「真实工具链兼容性」：
 * 用插件自带的 esbuild 对一个含多字节模块、嵌套 node_modules 依赖的迷你项目
 * 现场 --bundle --minify --sourcemap 打包，然后扫描产物：
 *   ① 真实 map 解析成功且映射覆盖率高（minify 产物行数极少、段密集）；
 *   ② mapped+unmapped 守恒；
 *   ③ 嵌套 node_modules 依赖被识别为包（嵌套解析路径）；
 *   ④ 多字节（中文）模块字节归因 > 0；
 *   ⑤ chunk 级 topPkgs 非空。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const core = require(path.join(ROOT, 'shared', 'core.js'))

function buildMiniProject() {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-lens-realmap-'))
  const src = path.join(proj, 'src')
  const vend = path.join(src, 'vendorish', 'node_modules', 'fakepkg')
  fs.mkdirSync(vend, { recursive: true })
  fs.writeFileSync(path.join(src, 'entry.ts'), `
import { hello } from './hello'
import { cjk } from './cjk'
// 相对路径引入嵌套 node_modules 包（esbuild 自入口向上解析，裸包名解析不到深层目录）
import { fake } from './vendorish/node_modules/fakepkg'
export const main = () => hello() + cjk() + fake()
`)
  fs.writeFileSync(path.join(src, 'hello.ts'), `export const hello = () => 'hello world ' + Math.random()\n`)
  fs.writeFileSync(path.join(src, 'cjk.ts'), `export const cjk = () => '中文模块：这次要测多字节归因，包体积透视台。'\n`)
  fs.writeFileSync(path.join(vend, 'index.js'), `export const fake = () => 'fakepkg-' + 'x'.repeat(50)\n`)
  fs.writeFileSync(path.join(vend, 'package.json'), JSON.stringify({ name: 'fakepkg', version: '1.0.0', main: 'index.js' }))
  return proj
}

test('esbuild 真实打包产物：归因/包识别/多字节全链路', async () => {
  const proj = buildMiniProject()
  try {
    const esbuildJs = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild')
    const outDir = path.join(proj, 'out')
    fs.mkdirSync(outDir, { recursive: true })
    const r = spawnSync(process.execPath, [
      esbuildJs,
      path.join(proj, 'src', 'entry.ts'),
      '--bundle', '--minify', '--sourcemap', '--format=esm',
      `--outfile=${path.join(outDir, 'main.js')}`,
    ], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 0, `esbuild 失败：${r.stderr}`)

    const report = await core.analyzeDist(outDir, {})
    assert.equal(report.totals.chunks, 1)
    const chunk = report.chunks[0]
    assert.equal(chunk.hasMap, true, 'esbuild 产物带 map')
    assert.ok(chunk.mappedBytes > 0, '归因到源')
    // 迷你 bundle 总字节极小，个别未映射片段（banner/尾行）即可拉低数个百分点，阈值取 0.8
    assert.ok(report.totals.mapCoverage > 0.8, `真实 map 覆盖率 ${report.totals.mapCoverage}`)
    assert.ok(report.totals.mappedBytes + report.totals.unmappedBytes >= report.totals.totalBytes, '守恒')
    // 嵌套 node_modules 依赖识别（esbuild 保留 node_modules 路径于 sources）
    const fake = report.packages.find((p) => p.name === 'fakepkg')
    assert.ok(fake, `fakepkg 应被识别为包，实际包：${report.packages.map((p) => p.name).join('、')}`)
    // 多字节模块归因 > 0
    const cjkMod = report.modules.find((m) => m.source.includes('cjk'))
    assert.ok(cjkMod && cjkMod.bytes > 0, `中文模块应归因到字节：${JSON.stringify(cjkMod)}`)
    assert.ok(chunk.topPkgs.length >= 1, 'chunk topPkgs 非空')
  } finally {
    try { fs.rmSync(proj, { recursive: true, force: true }) } catch (_) { /* 忽略 */ }
  }
})
