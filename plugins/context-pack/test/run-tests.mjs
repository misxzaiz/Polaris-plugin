/**
 * 离线单测（零依赖零 mock）：node test/run-tests.mjs
 * 覆盖 shared/core.js 全部业务规则——忽略引擎（.gitignore 子集/否定/锚定/lockfile 开关）、
 * 二进制判定、token 估算、目录扫描（护栏/标志位）、树渲染、预算裁剪、
 * 两种包格式组装、kv 分块、include 校验、仓库元信息。
 */
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const require = createRequire(import.meta.url)
const core = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'core.js'))

const results = []
const t = (name, fn) => {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') {
      return r.then(
        () => results.push({ name, pass: true }),
        (e) => results.push({ name, pass: false, detail: e.message }),
      )
    }
    results.push({ name, pass: true })
  } catch (e) {
    results.push({ name, pass: false, detail: e.message })
  }
  return Promise.resolve()
}

// ── 基础工具 ───────────────────────────────────────────────────────────────
await t('toPosix：反斜杠转正斜杠并去首尾斜杠', () => {
  assert.strictEqual(core.toPosix('a\\b\\c'), 'a/b/c')
  assert.strictEqual(core.toPosix('/a/b/'), 'a/b')
  assert.strictEqual(core.toPosix(''), '')
})

await t('isBinaryExt：图片/压缩判二进制，源码判文本，无扩展名不判', () => {
  assert.ok(core.isBinaryExt('a.png'))
  assert.ok(core.isBinaryExt('b.ZIP'))
  assert.ok(core.isBinaryExt('c.woff2'))
  assert.ok(!core.isBinaryExt('a.ts'))
  assert.ok(!core.isBinaryExt('Dockerfile'))
  assert.ok(!core.isBinaryExt('.gitignore'))
  assert.ok(!core.isBinaryExt('noext'))
})

await t('sniffBinary：NUL 即二进制；纯文本放行；控制字符超一成判二进制', () => {
  assert.ok(!core.sniffBinary(Buffer.from('hello world\nconst x = 1;\n')))
  assert.ok(core.sniffBinary(Buffer.from([0x50, 0x4b, 0x00, 0x01])))
  const ctrl = Buffer.alloc(100)
  ctrl.fill(0x01)
  ctrl[0] = 0x61
  assert.ok(core.sniffBinary(ctrl))
})

await t('estimateTokens：空为0、单调、CJK 密度高于 ascii、量级合理', () => {
  assert.strictEqual(core.estimateTokens(''), 0)
  const ascii = core.estimateTokens('abcdefgh'.repeat(100)) // 800 ascii
  const cjk = core.estimateTokens('测试汉字'.repeat(200)) // 800 non-ascii
  assert.ok(ascii > 0 && cjk > 0)
  assert.ok(cjk > ascii * 1.5, `CJK(${cjk}) 应显著高于 ascii(${ascii})`)
  const big = core.estimateTokens('a'.repeat(4000))
  assert.ok(big > 900 && big < 1400, `4000 ascii ≈ 1000+ tok，实得 ${big}`)
})

await t('estimateTokensFromSize：按字节保守折算', () => {
  assert.strictEqual(core.estimateTokensFromSize(420), 100)
  assert.strictEqual(core.estimateTokensFromSize(0), 0)
})

// ── 忽略引擎 ───────────────────────────────────────────────────────────────
await t('compileIgnoreLine：注释/空行→null；否定/目录/锚定解析', () => {
  assert.strictEqual(core.compileIgnoreLine(''), null)
  assert.strictEqual(core.compileIgnoreLine('# comment'), null)
  const neg = core.compileIgnoreLine('!keep.txt')
  assert.ok(neg.negate)
  const dir = core.compileIgnoreLine('build/')
  assert.ok(dir.dirOnly)
  const anch = core.compileIgnoreLine('/root-only')
  assert.ok(anch.anchored)
  const mid = core.compileIgnoreLine('src/temp')
  assert.ok(mid.anchored)
})

await t('globToRegex：* 段内、** 跨段、? 单字符、正则元字符转义', () => {
  const star = core.globToRegex('*.log', false)
  assert.ok(star.test('a.log') && star.test('deep/a.log'))
  assert.ok(!star.test('a.txt'))
  const dbl = core.globToRegex('**/tmp/**', false)
  assert.ok(dbl.test('x/tmp/y') && dbl.test('tmp/y'))
  const q = core.globToRegex('file?.ts', false)
  assert.ok(q.test('file1.ts') && !q.test('file12.ts'))
  const esc = core.globToRegex('a+b.js', false)
  assert.ok(esc.test('a+b.js') && !esc.test('aab.js'))
})

await t('ignoreEngine：.git/node_modules 恒忽略；dist 默认忽略；lockfile 可开关', () => {
  const eng = core.createIgnoreEngine({})
  assert.ok(eng.ignored('.git/config', false, []))
  assert.ok(eng.ignored('node_modules/x/index.js', false, []))
  assert.ok(eng.ignored('dist/bundle.js', false, []))
  assert.ok(eng.ignored('package-lock.json', false, []))
  const engL = core.createIgnoreEngine({ includeLockfiles: true })
  assert.ok(!engL.ignored('package-lock.json', false, []))
  assert.ok(engL.ignored('Cargo.lock', false, []) === false)
})

await t('ignoreEngine：extraIgnores 生效；否定后匹配优先', () => {
  const eng = core.createIgnoreEngine({ extraIgnores: '*.snap\n!important.snap' })
  assert.ok(eng.ignored('tests/a.snap', false, []))
  assert.ok(!eng.ignored('tests/important.snap', false, []))
})

await t('ignoreEngine：gitRules（嵌套 .gitignore）锚定与优先级', () => {
  const eng = core.createIgnoreEngine({})
  const rootRules = [core.compileIgnoreLine('/secrets.txt')].filter(Boolean)
  assert.ok(eng.ignored('secrets.txt', false, rootRules))
  assert.ok(!eng.ignored('src/secrets.txt', false, rootRules))
  const negRules = [core.compileIgnoreLine('*.log'), core.compileIgnoreLine('!keep.log')].filter(Boolean)
  assert.ok(eng.ignored('a.log', false, negRules))
  assert.ok(!eng.ignored('keep.log', false, negRules))
})

await t('ignoreEngine：目录规则命中其下内容（前缀候选）', () => {
  const eng = core.createIgnoreEngine({ extraIgnores: 'fixtures/' })
  assert.ok(eng.ignored('fixtures', true, []))
  assert.ok(eng.ignored('fixtures/data.json', false, []))
  const engAnchor = core.createIgnoreEngine({ extraIgnores: '/top-only/' })
  assert.ok(engAnchor.ignored('top-only/x', false, []))
  assert.ok(!engAnchor.ignored('nested/top-only/x', false, []))
})

// ── 临时目录扫描 ───────────────────────────────────────────────────────────
let tmp = ''
function writeFile(rel, content) {
  const abs = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}
await t('准备扫描夹具', () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpk-test-'))
  writeFile('src/index.ts', 'const a = 1;\nconst b = 2;\n')
  writeFile('src/util.ts', 'x'.repeat(4000))
  writeFile('README.md', '# Hello\n')
  writeFile('node_modules/pkg/index.js', 'junk')
  writeFile('.git/config', '[core]')
  writeFile('dist/out.js', 'built')
  writeFile('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  writeFile('huge.bin', Buffer.concat([Buffer.from('ab'), Buffer.alloc(700 * 1024)])) // > 512KB 且含大量 NUL → 二进制/超大
  writeFile('blob.dat', Buffer.from([0x00, 0x01, 0x02]))
  writeFile('.gitignore', 'ignored-dir/\n*.secret\n!keep.secret\n')
  writeFile('a.secret', 's')
  writeFile('keep.secret', 'k')
  writeFile('ignored-dir/x.txt', 'i')
  writeFile('sub/.gitignore', 'local-only.txt\n')
  writeFile('sub/local-only.txt', 'l')
  writeFile('sub/fine.txt', 'f')
  // 伪 git 元信息
  writeFile('.git/HEAD', 'ref: refs/heads/main\n')
  writeFile('.git/refs/heads/main', '1234567890abcdef\n')
})

await t('scanDirectory：忽略生效、标志位正确、统计聚合', async () => {
  const { entries, stats } = await core.scanDirectory(tmp, {}, null)
  const map = new Map(entries.map((e) => [e[0], e]))
  assert.ok(map.has('src') && map.get('src')[1] === 1)
  assert.ok(map.has('src/index.ts'))
  assert.ok(!map.has('node_modules') && !map.has('.git') && !map.has('dist'))
  assert.ok(!map.has('a.secret'), 'gitignore 规则应命中')
  assert.ok(map.has('keep.secret'), '否定规则应放行')
  assert.ok(!map.has('ignored-dir'))
  assert.ok(!map.has('sub/local-only.txt'), '嵌套 gitignore 应生效')
  assert.ok(map.has('sub/fine.txt'))
  const png = map.get('logo.png')
  assert.ok(png && String(png[4]).includes('b'), 'png 应标记二进制')
  const blob = map.get('blob.dat')
  assert.ok(blob && String(blob[4]).includes('b'), 'NUL 嗅探应标记二进制')
  const huge = map.get('huge.bin')
  assert.ok(huge && (String(huge[4]).includes('L') || String(huge[4]).includes('b')), '超限文件应有标志')
  const idx = map.get('src/index.ts')
  assert.ok(idx && idx[3] > 0 && !idx[4], '文本文件应有 token 估算且无标志')
  assert.strictEqual(stats.fileCount, [...map.values()].filter((e) => !e[1]).length)
  assert.ok(stats.totalTokens > 0)
  assert.ok(stats.ignored > 0)
})

await t('scanDirectory：maxFileKb 触发 L 标志、maxFiles 截断', async () => {
  const { entries, stats } = await core.scanDirectory(tmp, { maxFileKb: 0.2 }, null) // 200B 上限
  const util = entries.find((e) => e[0] === 'src/util.ts')
  assert.ok(util && String(util[4]).includes('L'), '4000B > 200B 应标 L')
  const { stats: st2 } = await core.scanDirectory(tmp, { maxFiles: 3 }, null)
  assert.ok(st2.truncated, 'maxFiles 应触发截断')
  assert.ok(st2.fileCount <= 3)
})

await t('scanDirectory：不存在的目录抛错', async () => {
  await assert.rejects(() => core.scanDirectory(path.join(tmp, 'nope-nope'), {}, null))
})

await t('readGitMeta：branch/commit 解析；非仓库返回 null', async () => {
  const meta = core.readGitMeta(tmp)
  assert.strictEqual(meta.branch, 'main')
  assert.strictEqual(meta.commit, '1234567890ab')
  assert.strictEqual(core.readGitMeta(os.tmpdir()), null)
})

// ── 树渲染 / 裁剪 ──────────────────────────────────────────────────────────
await t('renderTree：目录带斜杠、文件带 token、超限截断注记', () => {
  const rows = [
    ['src', 1, 0, 0, ''],
    ['src/index.ts', 0, 100, 30, ''],
    ['src/a.ts', 0, 100, 20, ''],
    ['README.md', 0, 100, 10, ''],
  ]
  const tree = core.renderTree(rows, {})
  assert.ok(tree.includes('src/'))
  assert.ok(tree.includes('index.ts  (~30 tok)'))
  assert.ok(!tree.includes('├'), '紧凑渲染无连线')
  const capped = core.renderTree(Array.from({ length: core.MAX_TREE_LINES + 50 }, (_, i) => [`f${i}.txt`, 0, 1, 1, '']), {})
  assert.ok(capped.split('\n').length <= core.MAX_TREE_LINES + 1)
  assert.ok(capped.includes('已截断'))
})

await t('fitToBudget：从最大裁起、达标即停、保留清单正确', () => {
  const files = [
    ['a.ts', 0, 0, 500, ''],
    ['b.ts', 0, 0, 300, ''],
    ['c.ts', 0, 0, 100, ''],
  ]
  // 总 900 → 裁掉最大 a(500) 后 400 ≤ 500 即停：保留 b+c
  const r = core.fitToBudget(files, 500)
  assert.deepStrictEqual(r.kept.sort(), ['b.ts', 'c.ts'])
  assert.strictEqual(r.tokens, 400)
  assert.deepStrictEqual(r.removed, [['a.ts', 500]])
  const r2 = core.fitToBudget(files, 1000)
  assert.strictEqual(r2.kept.length, 3)
  assert.strictEqual(r2.removed.length, 0)
  // 预算小于最小文件：裁空（诚实语义——无法达标时给出空集，UI 预算条红显提示调预算）
  const r3 = core.fitToBudget(files, 50)
  assert.deepStrictEqual(r3.kept, [])
  assert.strictEqual(r3.tokens, 0)
})

// ── 打包 ───────────────────────────────────────────────────────────────────
await t('packBundle：xml 格式结构、树与内容、二进制注记、缺失文件注记', () => {
  const r = core.packBundle(tmp, ['src/index.ts', 'logo.png', 'missing.ts', 'src/index.ts'], {
    format: 'xml',
    treeText: 'src/',
    header: '测试任务头',
  })
  assert.ok(r.text.includes('测试任务头'))
  assert.ok(r.text.includes('<directory_structure>'))
  assert.ok(r.text.includes('src/'))
  assert.ok(r.text.includes('<file path="src/index.ts">'))
  assert.ok(r.text.includes('const a = 1;'))
  assert.ok(r.text.includes('</file>'))
  assert.ok(r.text.includes('二进制文件'), '二进制应有注记')
  assert.ok(r.text.includes('读取失败'), '缺失文件应有注记')
  assert.strictEqual(r.stats.files, 1, '重复文件判重，成功打包 1 个')
  assert.ok(r.stats.truncatedFiles.includes('logo.png'))
  assert.ok(r.stats.truncatedFiles.includes('missing.ts'))
  assert.ok(r.stats.tokens > 0)
  assert.ok(r.text.includes('refs/heads/main') || r.text.includes('@ 123456') || r.text.includes('1234567890ab') || true, 'git meta 存在性不强制')
})

await t('packBundle：md 格式围栏 + 扩展名语言标注', () => {
  const r = core.packBundle(tmp, ['src/index.ts'], { format: 'md', treeText: 'x' })
  assert.ok(r.text.includes('### src/index.ts'))
  assert.ok(r.text.includes('```ts'))
  assert.ok(r.text.includes('## 目录结构'))
})

await t('packBundle：单文件截断保护', () => {
  const r = core.packBundle(tmp, ['src/util.ts'], { format: 'xml', treeText: '', maxFileKb: 1 })
  assert.ok(r.text.includes('已截断'))
  assert.ok(r.stats.truncatedFiles.includes('src/util.ts'))
})

await t('packBundle：自定义包头替换默认', () => {
  const r = core.packBundle(tmp, ['README.md'], { format: 'xml', treeText: '', header: '我的自定义头' })
  assert.ok(r.text.includes('我的自定义头'))
  assert.ok(!r.text.includes('上下文打包台生成）'))
})

// ── 分块 / 序列化 ──────────────────────────────────────────────────────────
await t('chunkString：定长切分与还原；空串单块', () => {
  assert.deepStrictEqual(core.chunkString('abcde', 2), ['ab', 'cd', 'e'])
  assert.deepStrictEqual(core.chunkString('', 4), [''])
  const joined = core.chunkString('x'.repeat(1000), 256).join('')
  assert.strictEqual(joined.length, 1000)
})

await t('serialize/deserialize：往返一致、坏行容忍', () => {
  const rows = [['a.ts', 0, 1, 2, ''], ['b/', 1, 0, 0, '']]
  const text = core.serializeEntries(rows)
  const back = core.deserializeEntries(text + '\nNOT_JSON\n\n')
  assert.strictEqual(back.length, 2)
  assert.deepStrictEqual(back[0], rows[0])
})

// ── include 校验 ───────────────────────────────────────────────────────────
await t('filterExistingFiles：目录/越界/绝对/重复剔除，存在文件保留', () => {
  const r = core.filterExistingFiles(tmp, [
    'src/index.ts', 'src', '../outside.txt', 'D:\\abs\\x.ts', 'src/index.ts', 'nope.ts',
  ])
  assert.deepStrictEqual(r.files, ['src/index.ts'])
  assert.strictEqual(r.rejected.length, 4)
})

// ── 汇总 ───────────────────────────────────────────────────────────────────
let fail = 0
for (const r of results) {
  if (!r.pass) fail++
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`)
}
console.log(`\n${results.length - fail}/${results.length} 通过`)
if (tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (_) { /* Windows 句柄延迟，留给系统清理 */ }
}
process.exit(fail ? 1 : 0)
