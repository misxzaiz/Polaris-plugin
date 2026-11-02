/**
 * fixtures.mjs —— 构建真实 git 仓库夹具（bridge/mcp 集成测试共用）
 *
 * 精心设计的形态，让每个分析维度都有可断言的确定性结果：
 *   - src/util.ts + src/parser.ts 在 3 个提交里总是被一起改（时间耦合对，co=3）
 *   - src/dupA.ts / src/dupB.ts 各含一段完全相同的 10 行函数（重复检测命中）
 *   - parser.ts 在第 5 个提交被 git mv 到 src/core/parser.ts（rename 归因）
 *   - assets/logo.png 二进制内容（binaryCommits）
 *   - big/blob.bin 2MB（历史大对象 Top1）
 *   - feature/stale 分支停在 40 天前（陈旧分支）
 *   - 提交消息混 conventional / wip / 巨提交（卫生画像）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const DUP_SNIPPET = [
  'function calcInvoiceTotal(items, taxRate) {',
  '  let subtotal = 0;',
  '  for (const item of items) {',
  '    if (!item.price || !item.count) continue;',
  '    subtotal += item.price * item.count;',
  '  }',
  '  const tax = subtotal * taxRate;',
  '  const shipping = subtotal > 100 ? 0 : 12;',
  '  return { subtotal, tax, shipping, total: subtotal + tax + shipping };',
  '}',
].join('\n')

const UTIL_V1 = [
  'export function parseScale(raw) {',
  '  if (!raw) return 1;',
  '  const n = Number(raw);',
  '  if (Number.isNaN(n)) return 1;',
  '  if (n <= 0) return 1;',
  '  return n;',
  '}',
].join('\n')

const UTIL_V2 = [
  'export function parseScale(raw, fallback = 1) {',
  '  if (!raw) return fallback;',
  '  const n = Number(raw);',
  '  if (Number.isNaN(n)) return fallback;',
  '  if (n <= 0) return fallback;',
  '  return n;',
  '}',
  '',
  'export function clampScale(n, min, max) {',
  '  if (n < min) return min;',
  '  if (n > max) return max;',
  '  return n;',
  '}',
].join('\n')

const PARSER_V1 = [
  'export class ChunkParser {',
  '  constructor(sep) { this.sep = sep; this.buf = ""; }',
  '  push(text) {',
  '    this.buf += text;',
  '    const out = [];',
  '    let idx = this.buf.indexOf(this.sep);',
  '    while (idx >= 0) {',
  '      out.push(this.buf.slice(0, idx));',
  '      this.buf = this.buf.slice(idx + this.sep.length);',
  '      idx = this.buf.indexOf(this.sep);',
  '    }',
  '    return out;',
  '  }',
  '}',
].join('\n')

const PARSER_V2 = PARSER_V1.replace('push(text) {', 'push(text, limit = 0) {')
  .replace('    const out = [];', '    const out = [];\n    if (limit && out.length >= limit) return out;')

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' +0000')
}

/**
 * 构建夹具仓库。commits: [{days, files:{rel:content|null}, msg, move?, binary?}]
 * 返回 {dir, commits: string[]}
 */
export function buildFixtureRepo(baseDir) {
  const dir = baseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'repo-lens-fixture-'))
  const g = (args, env) => {
    const r = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], {
      cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8',
    })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${r.stderr || r.stdout || '无输出'}`)
    return r
  }
  const wf = (rel, content) => {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  const commit = (msg, days, env = {}) => g(['commit', '-m', msg, '--allow-empty'], {
    ...env,
    GIT_AUTHOR_DATE: daysAgoIso(days),
    GIT_COMMITTER_DATE: daysAgoIso(days),
    GIT_AUTHOR_NAME: env.ANAME || '张三',
    GIT_AUTHOR_EMAIL: 'z@fixture.test',
    GIT_COMMITTER_NAME: env.ANAME || '张三',
    GIT_COMMITTER_EMAIL: 'z@fixture.test',
  })

  g(['init', '-b', 'main'])
  g(['config', 'user.name', '张三'])
  g(['config', 'user.email', 'z@fixture.test'])

  // c1 (40d)：初始文件；李四提交（第二作者）
  wf('src/util.ts', UTIL_V1)
  wf('src/parser.ts', PARSER_V1)
  wf('docs/readme.md', '# fixture\n\n测试夹具仓库。\n')
  wf('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03, 0x00, 0x04]))
  g(['add', '-A'])
  commit('feat: 初始骨架', 40, { ANAME: '李四' })

  // c2 (30d)：util+parser 一起改（共变 1/3）
  wf('src/util.ts', UTIL_V2)
  wf('src/parser.ts', PARSER_V2)
  g(['add', '-A'])
  commit('fix(parser): 限流与 scale 边界', 30)

  // 陈旧分支：指向 30 天前的 c2，此后不再动
  g(['branch', 'feature/stale'])

  // c3 (25d)：util+parser 再次一起改（共变 2/3）
  wf('src/util.ts', UTIL_V2 + '\nexport const SCALE_MAX = 8;\n')
  wf('src/parser.ts', PARSER_V2.replace('this.sep = sep;', 'this.sep = sep; this.count = 0;'))
  g(['add', '-A'])
  commit('refactor(core): 抽出 SCALE_MAX', 25)

  // c4 (20d)：util+parser + 重复代码入库（共变 3/3）
  wf('src/util.ts', UTIL_V2.replace('return n;', 'return clampScale(n, 0.1, SCALE_MAX);'))
  wf('src/parser.ts', PARSER_V2 + '\n')
  wf('src/dupA.ts', DUP_SNIPPET + '\nexport const A = 1;\n')
  wf('src/dupB.ts', '// 独立模块，但函数体复制自 dupA\n' + DUP_SNIPPET + '\nexport const B = 2;\n')
  g(['add', '-A'])
  commit('feat(core): 金额计算与钳制', 20)

  // c5 (10d)：git mv rename + 大对象（王五提交）
  fs.mkdirSync(path.join(dir, 'src', 'core'), { recursive: true })
  g(['mv', 'src/parser.ts', 'src/core/parser.ts'])
  wf('src/core/parser.ts', PARSER_V2.replace('class ChunkParser', 'class StreamParser'))
  wf('big/blob.bin', Buffer.alloc(2 * 1024 * 1024, 0x7f))
  g(['add', '-A'])
  commit('chore(core): parser 改名并入 core，附 2MB 资产', 10, { ANAME: '王五' })

  // c6 (2d)：草率消息 + 巨提交（一次改 20+ 文件 → 触发 big commit）
  for (let i = 0; i < 22; i++) wf(`gen/out-${i}.txt`, `#${i} 生成产物，用来触发巨提交\n内容行 ${i}\n`)
  wf('src/util.ts', UTIL_V2.replace('export const SCALE_MAX = 8;', 'export const SCALE_MAX = 16;'))
  g(['add', '-A'])
  commit('wip', 2)

  return { dir }
}

/** 清理夹具目录（bridge/mcp after 钩子用） */
export function rmRfForce(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }) } catch (_) { /* Windows 句柄延迟，尽力清理 */ }
}
