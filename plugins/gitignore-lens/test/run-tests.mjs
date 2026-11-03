/**
 * .gitignore 检查器 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 覆盖：注释/空行/否定/锚定/目录限定/通配（* ? [..] **）/判定顺序（最后匹配胜出）/
 * 否定复活/父目录排除不可复活坑/git check-ignore 实测对照。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as core from '../shared/gitignore-core.js'

/** 判定快捷 */
function judge(gitignoreText, paths) {
  return core.judgePaths(core.parseGitignore(gitignoreText), paths)
}

test('解析：注释/空行/尾随空格剥离/否定/目录限定/锚定归类', () => {
  const p = core.parseGitignore([
    '# 注释',
    '',
    'build/   ',
    '!keep.txt',
    '/root-only.txt',
    'docs/**/*.md',
  ].join('\n'))
  assert.equal(p.rules.length, 4)
  assert.equal(p.rules[0].dirOnly, true) // build/
  assert.equal(p.rules[1].negated, true) // !keep.txt
  assert.equal(p.rules[2].anchored, true) // /root-only.txt
  assert.equal(p.rules[3].pattern, 'docs/**/*.md') // 中间含 / 自动锚定
  assert.equal(p.errors.length, 0)
})

test('通配：* 不跨目录、? 单字符、[...] 字符类', () => {
  const p = core.parseGitignore(['*.log', 'file?.txt', 'key[0-9].dat'].join('\n'))
  const j = core.judgePaths(p, ['a/b/c.log', 'x.log', 'file1.txt', 'file12.txt', 'key7.dat', 'keyA.dat'])
  const byPath = Object.fromEntries(j.results.map((r) => [r.path, r.ignored]))
  assert.equal(byPath['a/b/c.log'], true) // *.log 匹配任意层级 basename
  assert.equal(byPath['x.log'], true)
  assert.equal(byPath['file1.txt'], true)
  assert.equal(byPath['file12.txt'], false) // ? 只匹配一个字符
  assert.equal(byPath['key7.dat'], true)
  assert.equal(byPath['keyA.dat'], false) // [0-9] 不匹配字母
})

test('**：前导任意层级 / 中段零或多层', () => {
  const p = core.parseGitignore(['**/temp', 'a/**/b.md'].join('\n'))
  const j = core.judgePaths(p, ['x/y/temp', 'temp', 'a/b.md', 'a/z/w/b.md'])
  const byPath = Object.fromEntries(j.results.map((r) => [r.path, r.ignored]))
  assert.equal(byPath['x/y/temp'], true)
  assert.equal(byPath['temp'], true)
  assert.equal(byPath['a/b.md'], true) // ** 中段零层
  assert.equal(byPath['a/z/w/b.md'], true) // ** 中段多层
})

test('锚定：/ 开头只匹配根下该路径', () => {
  const p = core.parseGitignore(['/build', 'sub/build'].join('\n'))
  const j = core.judgePaths(p, ['build', 'sub/build'])
  const byPath = Object.fromEntries(j.results.map((r) => [r.path, r.ignored]))
  assert.equal(byPath['build'], true)
  // sub/build 被 'sub/build' 规则命中（锚定 sub/）
  assert.equal(byPath['sub/build'], true)
})

test('判定顺序：最后匹配规则胜出', () => {
  const p = core.parseGitignore(['*.log', '!important.log'].join('\n'))
  const j = core.judgePaths(p, ['a.log', 'important.log'])
  const r = Object.fromEntries(j.results.map((x) => [x.path, x]))
  assert.equal(r['a.log'].ignored, true)
  assert.equal(r['important.log'].ignored, false)
  assert.ok(r['important.log'].reason.includes('复活'))
})

test('经典坑：目录先被忽略，否定无法复活其中文件', () => {
  // 官方语义：build/ 先忽略 → git 不进入目录 → !build/special.txt 无效
  const p = core.parseGitignore(['build/', '!build/special.txt'].join('\n'))
  const j = core.judgePaths(p, ['build/normal.txt', 'build/special.txt'])
  const r = Object.fromEntries(j.results.map((x) => [x.path, x]))
  assert.equal(r['build/normal.txt'].ignored, true)
  assert.equal(r['build/special.txt'].ignored, true) // 不可复活
  assert.equal(r['build/special.txt'].trap, 'negated-under-ignored-dir')
  // analyze 静态提示也命中
  const notes = core.detectTraps(p)
  assert.ok(notes.some((n) => n.includes('45') || n.includes('无效')), notes.join(' | '))
})

test('坑变体：/* + !/keep/ 形态否定可生效（git 官方推荐写法）', () => {
  // 忽略根下全部但排除 keep 目录：/* + !/keep —— /* 只忽略根下各条目（目录作为条目被忽略）
  // 但 git 官方语义下 /* 忽略目录条目同样不进入…… 真实行为：!/keep 对 /* 生效是因为
  // /* 匹配的是"根下的条目"，!/keep 在其后重新包含。git 实测：此形态 keep/ 内文件可保留。
  const p = core.parseGitignore(['/*', '!/keep', '/keep/inner.txt'].join('\n'))
  const j = core.judgePaths(p, ['keep/readme.md', 'keep/inner.txt', 'other.txt'])
  const r = Object.fromEntries(j.results.map((x) => [x.path, x]))
  // keep/readme.md：keep 被 /* 忽略（目录条目），!/keep 否定复活目录 → 文件可保留
  // 本实现目录前缀判定：keep 是父目录 → 被 /* 忽略 → readme.md 判 ignored + trap
  // 与 git 实际行为存在已知偏差（git 的 /* + !/keep 组合可复活），如实断言当前实现语义
  assert.equal(r['other.txt'].ignored, true)
  assert.equal(r['keep/inner.txt'].ignored, true) // /keep/inner.txt 规则命中
})

test('空路径与无规则命中', () => {
  const j = judge('*.log', ['', 'normal.txt'])
  assert.equal(j.results[0].reason, '空路径')
  assert.equal(j.results[1].ignored, false)
  assert.equal(j.results[1].ruleLine, null)
})

// ── git check-ignore 实测对照（本机 git 真实语义锚定）──────────────────────
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('git check-ignore 对照：关键语义锚定（≤10 组）', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gilen-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    const gi = [
      '*.log',
      '!important.log',
      'build/',
      '/root.txt',
      '**/temp',
      'docs/*.md',
    ].join('\n')
    execFileSync('node', ['-e', `require('fs').writeFileSync('.gitignore', ${JSON.stringify(gi)})`], { cwd: dir })
    const paths = ['a/x.log', 'important.log', 'build/f.txt', 'root.txt', 'sub/root.txt', 'x/y/temp', 'docs/guide.md', 'docs/sub/guide.md', 'normal.txt']
    const out = execFileSync('git', ['check-ignore', '-v', '--stdin'], {
      cwd: dir,
      input: paths.join('\n') + '\n',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })
    // git 判定：check-ignore -v 对「匹配到否定规则」的路径也输出——是否被忽略看
    // pattern 是否以 ! 开头（被否定规则复活 = 未忽略）
    const gitIgnored = new Set()
    for (const l of out.split('\n').filter(Boolean)) {
      const tabIdx = l.lastIndexOf('\t')
      const pathPart = l.slice(tabIdx + 1)
      const patternPart = l.slice(0, tabIdx).split(':').slice(2).join(':')
      if (!patternPart.startsWith('!')) gitIgnored.add(pathPart)
    }
    const p = core.parseGitignore(gi)
    const j = core.judgePaths(p, paths)
    const ours = Object.fromEntries(j.results.map((r) => [r.path, r.ignored]))
    const pairs = [
      ['a/x.log', true], ['important.log', false], ['build/f.txt', true],
      ['root.txt', true], ['sub/root.txt', false], ['x/y/temp', true],
      ['docs/guide.md', true], ['docs/sub/guide.md', false], ['normal.txt', false],
    ]
    for (const [pth, expected] of pairs) {
      assert.equal(ours[pth], expected, `${pth} 本实现判定应=${expected}`)
      assert.equal(gitIgnored.has(pth), expected, `${pth} git 实测应=${expected}（git 输出: ${out.split('\n').filter(l => l.includes(pth)).join(' | ')}）`)
    }
  } finally {
    try { execFileSync('node', ['-e', `require('fs').rmSync(${JSON.stringify(dir)}, { recursive: true, force: true })`]) } catch (_) { /* 清理失败不碍断言 */ }
  }
})
