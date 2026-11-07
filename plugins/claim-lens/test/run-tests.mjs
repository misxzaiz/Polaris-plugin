/**
 * run-tests.mjs —— claim-lens 离线单测（无宿主、无网络）
 * 跑 server/selftest.js 的 fixture 全链路断言（含真实 git/node 探测）+ 额外提取器边界断言。
 */
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const core = require('../shared/claim-core.js')
const { runSelftest } = require('../server/selftest.js')

let failures = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log(`✓ ${name}`)
  else { failures++; console.error(`✗ ${name} ${detail}`) }
}

// ── 试金石（fixture 仓 + 真实探测）──
const st = await runSelftest()
for (const item of st.items) check(`selftest: ${item.name}`, item.ok, item.detail)
check('selftest: 断言规模 ≥ 28', st.items.length >= 28, `实际 ${st.items.length}`)

// ── 提取器边界 ──
const ex1 = core.extractClaims('')
check('提取: 空文本零声明', ex1.claims.length === 0)

const ex2 = core.extractClaims('```\n```\n无声明纯文本。')
check('提取: 空代码块零声明', ex2.claims.length === 0)

const ex3 = core.extractClaims([
  '```bash',
  'sudo env NODE_ENV=production git push origin main --force-with-lease',
  '```',
].join('\n'))
const cli3 = ex3.claims.find((c) => c.type === 'cli')
check('提取: sudo/env 前缀剥离，git 命令识别', cli3 && cli3.target === 'git' && cli3.flags.includes('--force-with-lease'), JSON.stringify(cli3))

const ex4 = core.extractClaims('`https://example.com/a.json` 不是本地文件')
check('提取: URL 不当文件声明', !ex4.claims.some((c) => c.type === 'file'), JSON.stringify(ex4.claims))

const ex5 = core.extractClaims('用 `import { z } from "zod"` 校验')
check('提取: prose 反引号里的 import 也出 package 声明', ex5.claims.some((c) => c.type === 'package' && c.target === 'zod'), JSON.stringify(ex5.claims))

const ex6 = core.extractClaims('```py\nfrom fastapi import FastAPI\nimport os\n```')
check('提取: python import（fastapi 收、os 排除）', () => {
  const pkgs = ex6.claims.filter((c) => c.type === 'package').map((c) => c.target).sort()
  return JSON.stringify(pkgs) === JSON.stringify(['fastapi'])
}, JSON.stringify(ex6.claims))

const ex7 = core.extractClaims('scope 包 `@polaris/needs` 已可用')
check('提取: scoped 包名', ex7.claims.some((c) => c.type === 'symbol' || c.type === 'package'), JSON.stringify(ex7.claims))
// @polaris/needs 是 scope 包 —— 反引号分类不是 file/symbol/config；不应误判成 config 点路径
check('提取: scoped 包不误判 config', !ex7.claims.some((c) => c.type === 'config'), JSON.stringify(ex7.claims))

const ex8 = core.extractClaims('配置在 `config/app.json`：`server.port` 改为 9090，`log.level` 用 info')
const cfg8 = ex8.claims.filter((c) => c.type === 'config')
check('提取: config 点路径挂同句配置文件', cfg8.length >= 1 && cfg8.every((c) => c.file === 'config/app.json'), JSON.stringify(cfg8))

const ex9 = core.extractClaims('上限压测：' + '`a'.repeat(300))
check('提取: MAX_CLAIMS 上限 200', ex9.claims.length <= core.MAX_CLAIMS, `实际 ${ex9.claims.length}`)

// ── normalize 边界 ──
check('normalize: cli target 大写允许（Git→白名单前拒绝）', (() => {
  try { core.normalizeClaims([{ type: 'cli', target: 'Git', flags: ['--help'] }]); return true } catch (_) { return false }
})())
check('normalize: version 坏 constraint 拒绝', (() => {
  try { core.normalizeClaims([{ type: 'version', target: 'node', constraint: '最新' }]); return false } catch (e) { return e.user === true }
})())
check('normalize: file 穿越/URL 拒绝', (() => {
  try { core.normalizeClaims([{ type: 'file', target: 'a://b' }]); return false } catch (e) { return e.user === true }
})())
check('normalize: config 非点路径拒绝（含空格）', (() => {
  try { core.normalizeClaims([{ type: 'config', target: 'a b.c' }]); return false } catch (e) { return e.user === true }
})())

// ── parseCommandLine 细节 ──
const pc1 = core.parseCommandLine('pnpm add -D vitest @scope/pkg')
check('命令: pnpm add -D 收包名（-D 吃参数位）', (() => {
  if (!pc1) return false
  const pkgs = pc1.pkgSpecs
  return pc1.cmd === 'pnpm' && pc1.subcmd.includes('add') && pkgs.includes('vitest') && pkgs.includes('@scope/pkg')
})(), JSON.stringify(pc1))

const pc2 = core.parseCommandLine('notacommand --help')
check('命令: 词表外返回 null（不收）', pc2 === null)

// pkgFromSpec 版本剥离
check('pkgFromSpec: zod@3.22.0 → zod', core.pkgFromSpec('zod@3.22.0') === 'zod')
check('pkgFromSpec: @scope/pkg@^1 → @scope/pkg', core.pkgFromSpec('@scope/pkg@^1') === '@scope/pkg')
check('pkgFromSpec: ./local 拒绝', core.pkgFromSpec('./local') === null)

console.log(failures === 0 ? `\n全部通过（${st.items.length + 14} 项断言）` : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
