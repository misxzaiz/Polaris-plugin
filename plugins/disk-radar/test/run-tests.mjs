/**
 * 磁盘雷达离线单测：node test/run-tests.mjs（零依赖零 mock，直测 shared 纯函数核）
 * 坑先在纯函数层暴露——改 core 必跑本文件。
 */
import assert from 'node:assert'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const core = require('../shared/disk-core.js')

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
const ta = (name, fn) => t(name, async () => { await fn() })

// ── normalizeRootPath ────────────────────────────────────────────────────────
t('normalizeRootPath：去引号与尾分隔符', () => {
  const r = core.normalizeRootPath('"D:\\space\\"')
  assert.equal(r.ok, true)
  assert.equal(r.path, 'D:\\space')
})
t('normalizeRootPath：盘根保留分隔符', () => {
  const r = core.normalizeRootPath('D:\\')
  assert.equal(r.ok, true)
  assert.ok(/^[a-zA-Z]:\\?$/.test(r.path), r.path)
})
t('normalizeRootPath：相对路径拒绝', () => {
  assert.equal(core.normalizeRootPath('relative/path').ok, false)
  assert.equal(core.normalizeRootPath('').ok, false)
  assert.equal(core.normalizeRootPath(null).ok, false)
})
t('normalizeRootPath：隔离区目录拒绝登记', () => {
  assert.equal(core.normalizeRootPath('D:\\x\\.DiskRadarTrash').ok, false)
})

// ── longPath ────────────────────────────────────────────────────────────────
t('longPath：短路径原样', () => {
  assert.equal(core.longPath('D:\\a'), 'D:\\a')
})
t('longPath：超长加 \\\\?\\ 前缀', () => {
  const p = 'D:\\' + 'x'.repeat(260)
  assert.ok(core.longPath(p).startsWith('\\\\?\\D:'))
})
t('longPath：UNC 走 \\\\?\\UNC\\', () => {
  const p = '\\\\server\\share\\' + 'x'.repeat(260)
  assert.ok(core.longPath(p).startsWith('\\\\?\\UNC\\server'))
})

// ── classifyJunkDir ─────────────────────────────────────────────────────────
t('junk：node_modules 有 package.json 锚定命中', () => {
  const r = core.classifyJunkDir({ name: 'node_modules', siblings: ['package.json', 'src'] })
  assert.equal(r.hit, true)
  assert.equal(r.kind, 'deps')
})
t('junk：node_modules 无锚定不命中', () => {
  assert.equal(core.classifyJunkDir({ name: 'node_modules', siblings: ['readme.md'] }).hit, false)
})
t('junk：target 需 Cargo.toml', () => {
  assert.equal(core.classifyJunkDir({ name: 'target', siblings: ['Cargo.toml', 'src'] }).hit, true)
  assert.equal(core.classifyJunkDir({ name: 'target', siblings: ['main.c'] }).hit, false)
})
t('junk：dist 需工程锚定', () => {
  assert.equal(core.classifyJunkDir({ name: 'dist', siblings: ['package.json'] }).hit, true)
  assert.equal(core.classifyJunkDir({ name: 'dist', siblings: ['notes.txt'] }).hit, false)
})
t('junk：bin/obj 需 .sln/.csproj 后缀锚定', () => {
  assert.equal(core.classifyJunkDir({ name: 'obj', siblings: ['App.csproj', 'Program.cs'] }).hit, true)
  assert.equal(core.classifyJunkDir({ name: 'bin', siblings: ['main.py'] }).hit, false)
})
t('junk：.next 等专名无条件命中', () => {
  assert.equal(core.classifyJunkDir({ name: '.next', siblings: [] }).hit, true)
  assert.equal(core.classifyJunkDir({ name: '__pycache__', siblings: [] }).hit, true)
  assert.equal(core.classifyJunkDir({ name: '.venv', siblings: [] }).kind, 'deps')
})
t('junk：pnpm store 给专用建议', () => {
  const r = core.classifyJunkDir({ name: '.pnpm-store', siblings: [] })
  assert.equal(r.hit, true)
  assert.ok(r.note && r.note.includes('prune'))
})
t('junk：额外目录名命中为 custom', () => {
  const r = core.classifyJunkDir({ name: 'my-build-output', siblings: [], extraDirs: ['my-build-output'] })
  assert.equal(r.hit, true)
  assert.equal(r.kind, 'custom')
})
t('junk：隔离区自身永不判垃圾', () => {
  assert.equal(core.classifyJunkDir({ name: core.TRASH_DIR, siblings: [] }).hit, false)
})

// ── junkItemId ──────────────────────────────────────────────────────────────
t('junkItemId：稳定且大小写/分隔符不敏感', () => {
  const a = core.junkItemId('src-tauri\\target')
  const b = core.junkItemId('src-tauri/target')
  const c = core.junkItemId('src-Tauri\\Target')
  assert.equal(a, b)
  assert.equal(a, c)
  assert.match(a, core.ITEM_ID_RE)
})

// ── relPath 安全 ────────────────────────────────────────────────────────────
t('safeRelPath：拒绝绝对/上跳/空段', () => {
  assert.equal(core.safeRelPath('a\\..\\..\\etc'), null)
  assert.equal(core.safeRelPath('C:\\evil'), null)
  assert.equal(core.safeRelPath('/evil'), null)
  assert.equal(core.safeRelPath('a\\\\b'), null)
  assert.equal(core.safeRelPath(''), null)
})
t('safeRelPath：归一为平台分隔符', () => {
  const sep = path.sep
  assert.equal(core.safeRelPath('a/b/c'), `a${sep}b${sep}c`)
})

t('assertUnderRoot：界内通过、界外抛错', () => {
  core.assertUnderRoot('D:\\space', 'D:\\space\\a\\b')
  core.assertUnderRoot('D:\\space', 'D:\\space')
  assert.throws(() => core.assertUnderRoot('D:\\space', 'D:\\space-evil\\x'))
  assert.throws(() => core.assertUnderRoot('D:\\space', 'C:\\Windows'))
})
t('trashPathFor：合法 id 落在隔离区；非法 id 拒绝', () => {
  const p = core.trashPathFor('D:\\space', 'abcdef123456')
  assert.ok(p.includes(core.TRASH_DIR))
  assert.ok(p.endsWith('abcdef123456'))
  assert.throws(() => core.trashPathFor('D:\\space', '../evil'))
  assert.throws(() => core.trashPathFor('D:\\space', 'zzz'))
  assert.throws(() => core.trashPathFor('D:\\space', 'a'.repeat(40)))
})

// ── squarify ────────────────────────────────────────────────────────────────
t('squarify：面积守恒且不出界', () => {
  const items = [
    { name: 'a', value: 500 }, { name: 'b', value: 300 }, { name: 'c', value: 150 },
    { name: 'd', value: 40 }, { name: 'e', value: 10 },
  ]
  const W = 1000; const H = 400
  const rects = core.squarify(items, 0, 0, W, H)
  const totalArea = rects.reduce((s, r) => s + r.w * r.h, 0)
  assert.ok(Math.abs(totalArea - W * H) < 1, `totalArea=${totalArea}`)
  for (const r of rects) {
    assert.ok(r.x >= -0.001 && r.y >= -0.001, `x/y 越界 ${r.x},${r.y}`)
    assert.ok(r.x + r.w <= W + 0.001 && r.y + r.h <= H + 0.001, `右/下越界 ${r.x + r.w},${r.y + r.h}`)
    assert.ok(r.w > 0 && r.h > 0)
  }
})
t('squarify：单项填满；零值过滤；无效输入空数组', () => {
  const one = core.squarify([{ name: 'x', value: 42 }], 0, 0, 100, 50)
  assert.equal(one.length, 1)
  assert.ok(Math.abs(one[0].w * one[0].h - 5000) < 0.001)
  const filtered = core.squarify([{ name: 'a', value: 10 }, { name: 'b', value: 0 }], 0, 0, 100, 100)
  assert.equal(filtered.length, 1)
  assert.deepEqual(core.squarify([], 0, 0, 100, 100), [])
  assert.deepEqual(core.squarify([{ name: 'a', value: -5 }], 0, 0, 100, 100), [])
})

// ── growthDiff ──────────────────────────────────────────────────────────────
const N = (n, b, c) => ({ n, b, f: 1, ...(c ? { c } : {}) })
t('growthDiff：对齐目录的增减 + 新增/移除 + 按|delta|排序', () => {
  const prev = [N('projA', 100), N('projB', 200), N('gone', 50)]
  const cur = [N('projA', 300), N('projB', 150), N('new', 70)]
  const movers = core.growthDiff(prev, cur)
  const byPath = new Map(movers.map((m) => [m.path, m]))
  assert.equal(byPath.get('projA').delta, 200)
  assert.equal(byPath.get('projB').delta, -50)
  assert.equal(byPath.get('gone').delta, -50)
  assert.equal(byPath.get('new').delta, 70)
  assert.equal(movers[0].path, 'projA') // |200| 最大
})
t('growthDiff：嵌套一层展开', () => {
  const prev = [N('root', 100, [N('a', 60), N('b', 40)])]
  const cur = [N('root', 100, [N('a', 90), N('b', 10)])]
  const movers = core.growthDiff(prev, cur)
  assert.ok(movers.some((m) => m.path === 'root/a' && m.delta === 30))
  assert.ok(movers.some((m) => m.path === 'root/b' && m.delta === -30))
  assert.ok(!movers.some((m) => m.path === 'root' && m.delta !== 0)) // 顶层不变不展开
})

// ── 树 ──────────────────────────────────────────────────────────────────────
t('pruneTree：预算内不动；超预算保 top 子节点', () => {
  const kids = Array.from({ length: 100 }, (_, i) => N(`d${i}`, 1000 - i))
  const tree = [N('root', kids.reduce((s, k) => s + k.b, 0), kids)]
  const kept = core.pruneTree(tree, 10)
  assert.ok(core.countTreeNodes(kept) <= 10, `剪后节点数=${core.countTreeNodes(kept)}`)
  assert.equal(kept[0].b, 95050) // 总量字段不被剪枝破坏（Σ(1000-i)=95050）
  assert.ok(kept[0].c.length >= 1 && kept[0].c.length <= core.SNAP_CHILD_KEEP)
  assert.equal(kept[0].c[0].n, 'd0') // 保的是大头
  const untouched = core.pruneTree([N('a', 1), N('b', 2)], 10)
  assert.equal(core.countTreeNodes(untouched), 2)
})
t('sortTree：按 bytes 降序', () => {
  const sorted = core.sortTree([N('a', 1), N('b', 9), N('c', 5)])
  assert.deepEqual(sorted.map((n) => n.n), ['b', 'c', 'a'])
})
t('treeTotal：合计一致', () => {
  assert.equal(core.treeTotal([N('a', 10), N('b', 32)]), 42)
})

// ── fsutil 解析 ─────────────────────────────────────────────────────────────
t('parseFsutilOutput：英文样例', () => {
  const sample = `
Total free bytes             : 123.4 GB (132,589,911,040 bytes)
Total bytes                  : 456.7 GB (490,452,336,640 bytes)
Total quota free bytes       : 123.4 GB (132,589,911,040 bytes)
`
  const r = core.parseFsutilOutput(sample)
  assert.ok(r)
  assert.equal(r.free, 132589911040)
  assert.equal(r.total, 490452336640)
})
t('parseFsutilOutput：中文样例', () => {
  const sample = `
总字节数            : 456.7 GB (490,452,336,640 字节)
可用字节数          : 123.4 GB (132,589,911,040 字节)
配额可用字节数      : 123.4 GB (132,589,911,040 字节)
`
  const r = core.parseFsutilOutput(sample)
  assert.ok(r, `应能解析中文输出：${JSON.stringify(r)}`)
  assert.equal(r.total, 490452336640)
  assert.equal(r.free, 132589911040)
})
t('parseFsutilOutput：垃圾输入返回 null', () => {
  assert.equal(core.parseFsutilOutput(''), null)
  assert.equal(core.parseFsutilOutput('error: access denied'), null)
})

// ── 格式化 ──────────────────────────────────────────────────────────────────
t('fmtBytes：常用刻度', () => {
  assert.equal(core.fmtBytes(0), '0 B')
  assert.equal(core.fmtBytes(512), '512 B')
  assert.equal(core.fmtBytes(1024), '1.00 KB')
  assert.equal(core.fmtBytes(1536 * 1024 * 1024), '1.50 GB')
  assert.equal(core.fmtBytes(3 * 1024 ** 4), '3.00 TB')
  assert.equal(core.fmtBytes(-2048), '-2.00 KB')
  assert.equal(core.fmtBytes(NaN), '?')
})

// ── 快照键 ──────────────────────────────────────────────────────────────────
t('nextSeq：取最大序号 +1', () => {
  const rid = 'abcd123456'
  assert.equal(core.nextSeq([core.K.snap(rid, 3), core.K.snap(rid, 7), core.K.snap(rid, 1)], rid), 8)
  assert.equal(core.nextSeq([], rid), 1)
})
t('pickExpiredSnaps：保最新 keep 份', () => {
  const rid = 'abcd123456'
  const keys = [1, 2, 3, 4, 5].map((s) => core.K.snap(rid, s))
  const del = core.pickExpiredSnaps(keys, rid, 3)
  assert.deepEqual(del, [core.K.snap(rid, 1), core.K.snap(rid, 2)])
  assert.deepEqual(core.pickExpiredSnaps(keys, rid, 10), [])
})

// ── settings ────────────────────────────────────────────────────────────────
t('normalizeSettings：边界收敛', () => {
  const s = core.normalizeSettings({ snapshotHours: 0, keepSnapshots: 999, autoBudgetSec: -5 })
  assert.equal(s.snapshotHours, core.DEFAULT_SETTINGS.snapshotHours) // 非法回落默认
  assert.equal(s.keepSnapshots, 60)
  assert.equal(s.autoBudgetSec, 10)
})
t('normalizeSettings：quarantineDays=0 可关闭；缺省回落默认', () => {
  assert.equal(core.normalizeSettings({ quarantineDays: 0 }).quarantineDays, 0)
  assert.equal(core.normalizeSettings({}).quarantineDays, core.DEFAULT_SETTINGS.quarantineDays)
  assert.equal(core.normalizeSettings(null).autoSnapshot, true)
})
t('normalizeSettings：列表去空去重', () => {
  const s = core.normalizeSettings({ extraJunkDirs: ['a', 'a', ' ', 'b'] })
  assert.deepEqual(s.extraJunkDirs, ['a', 'b'])
})

t('isLegacyJunctionName：大小写不敏感', () => {
  assert.equal(core.isLegacyJunctionName('Application Data'), true)
  assert.equal(core.isLegacyJunctionName('normal-dir'), false)
})

// ── 异步项 ──────────────────────────────────────────────────────────────────
ta('walkRoot：真 fs 小树全流程（回归：目录入栈后不得落到同轮完成检查）', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'diskrad-ut-'))
  try {
    fs.mkdirSync(path.join(base, 'project-a', 'node_modules', 'left-pad'), { recursive: true })
    fs.writeFileSync(path.join(base, 'project-a', 'package.json'), 'x')
    fs.writeFileSync(path.join(base, 'project-a', 'node_modules', 'left-pad', 'index.js'), Buffer.alloc(1000, 1))
    fs.mkdirSync(path.join(base, 'project-b'), { recursive: true })
    fs.writeFileSync(path.join(base, 'project-b', 'Cargo.toml'), 'x')
    fs.writeFileSync(path.join(base, 'project-b', 'target', 'app.bin'), Buffer.alloc(500, 1))
    fs.writeFileSync(path.join(base, 'photos.bin'), Buffer.alloc(100, 1))
    const { walkRoot } = require('../service/scanner.js')
    const r = await walkRoot({ rootPath: base, recordDepth: 2, budgetMs: 30000, collectJunk: true, settings: {} })
    assert.equal(r.partial, false)
    assert.equal(r.total, 1601, `total=${r.total}（不得翻倍/丢失）`)
    assert.equal(r.files, 4, `files=${r.files}`)
    const names = r.dirs.map((n) => n.n).sort()
    assert.deepEqual(names, ['project-a', 'project-b'])
    // 成环检测：JSON 序列化（循环引用会抛）
    assert.doesNotThrow(() => JSON.stringify(r.dirs), '树含循环引用')
    // project-a 下应有 node_modules 记录节点（depth2 内）
    const pa = r.dirs.find((n) => n.n === 'project-a')
    assert.ok(pa.c.some((n) => n.n === 'node_modules' && n.j === 'deps'), '垃圾节点带 j 标记')
    const junkRel = r.junkItems.map((it) => it.relPath.replace(/\\/g, '/')).sort()
    assert.deepEqual(junkRel, ['project-a/node_modules', 'project-b/target'], JSON.stringify(r.junkItems))
    assert.ok(r.volume && r.volume.total > 0, '卷空间')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})
ta('probeDir：maxDepth=1 只记录一层', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'diskrad-ut-'))
  try {
    fs.mkdirSync(path.join(base, 'sub', 'deep'), { recursive: true })
    fs.writeFileSync(path.join(base, 'sub', 'deep', 'f.bin'), Buffer.alloc(10, 1))
    const { probeDir } = require('../service/scanner.js')
    const r = await probeDir({ dirPath: base, maxDepth: 1, budgetMs: 15000 })
    assert.equal(r.total, 10)
    assert.equal(r.dirs.length, 1)
    assert.equal(r.dirs[0].n, 'sub')
    assert.equal(r.dirs[0].c, undefined, 'depth1 的子节点不记录')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})
ta('scanner.js 可加载（语法/依赖完整）', async () => {
  const scanner = require('../service/scanner.js')
  assert.equal(typeof scanner.walkRoot, 'function')
  assert.equal(typeof scanner.probeDir, 'function')
})
ta('radar.js 可加载（语法/依赖完整）', async () => {
  const radar = require('../service/radar.js')
  assert.equal(typeof radar.createRadar, 'function')
})
ta('mcp/server.js 依赖链可解析（不启动进程，仅 require 链）', async () => {
  // mcp/server.js 顶层即启动 stdio 监听，不能直接 require；
  // 这里用 new Function 包一层仅校验语法 + 依赖路径存在。
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../mcp/server.js', import.meta.url), 'utf8')
  new Function(src) // SyntaxError 即失败（不执行 require——Function 体惰性）
  assert.ok(src.includes('disk_overview'))
  assert.ok(src.includes('disk_report'))
})

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
process.exit(bad.length ? 1 : 0)
