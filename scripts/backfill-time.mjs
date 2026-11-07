#!/usr/bin/env node
/**
 * 一次性回填脚本：给 index.json 每个插件补 createdAt / updatedAt。
 *   - createdAt = 该插件首次正式发布时间
 *   - updatedAt = 该插件最近发版时间
 *
 * 两档数据源（优先级递减）：
 *   1. git tag 时间（命名 <pluginId>-v<version>）——最接近"正式发布"语义
 *   2. 插件目录 git 提交历史兜底——首次提交=createdAt，最近修改=updatedAt
 *   3. 两档均无（目录未被 git 跟踪）：留空，前端兜底归入"未知"区
 *
 * 时间统一转 UTC ISO 字符串写入 index.json
 * 用法： node scripts/backfill-time.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = join(root, 'index.json')

const dry = process.argv.includes('--dry')

// 1. 采集全部 tag：<iso-strict>|<tagname>
const raw = execSync(
  `git for-each-ref --format="%(creatordate:iso-strict)|%(refname:short)" "refs/tags/*"`,
  { cwd: root, encoding: 'utf-8' }
).trim()

// 2. 按 pluginId 分组：解析 <pluginId>-v<version>
//    pluginId 可能含点（polaris.marketplace），tag 中保留原 id
const byPlugin = new Map() // pluginId -> [{ version, iso }]
for (const line of raw.split('\n')) {
  if (!line) continue
  const [iso, tag] = line.split('|')
  if (!iso || !tag) continue
  // 匹配 <pluginId>-v<version>；pluginId 取到最后一个 -v 之前
  const m = tag.match(/^(.+)-v(\d[^]*)$/)
  if (!m) continue
  const [, pid, version] = m
  if (!byPlugin.has(pid)) byPlugin.set(pid, [])
  byPlugin.get(pid).push({ version, iso })
}

const toUtcIso = (iso) => {
  // git iso-strict 形如 2026-10-26T12:41:31+08:00 → Date → toISOString()
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 取某插件目录的首次 / 最近提交时间（兜底数据源） */
function gitDirTimes(dirName) {
  const dir = `plugins/${dirName}`
  try {
    // 首次提交（--reverse 取首行）；%cI = committer date ISO 8601
    const first = execSync(
      `git log --reverse --format=%cI -- "${dir}"`,
      { cwd: root, encoding: 'utf-8' }
    ).trim().split('\n')[0]
    // 最近提交（默认 reverse，取首行）
    const last = execSync(
      `git log --format=%cI -- "${dir}"`,
      { cwd: root, encoding: 'utf-8' }
    ).trim().split('\n')[0]
    return [first, last].filter(Boolean).map(toUtcIso)
  } catch { return [] }
}

/** 从 manifestUrl 解析插件目录名（与 validate.js 一致） */
function dirNameOf(p) {
  const m = p.manifestUrl?.match(/\/plugins\/([^/]+)\/plugin\.json/)
  return m ? m[1] : p.id.split('.').pop()
}

// 3. 读 index.json，按 id 匹配补字段
const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
let filled = 0, untouched = 0
const missing = []

for (const p of index.plugins) {
  const tags = byPlugin.get(p.id) || []
  const tagTimes = tags.map(t => toUtcIso(t.iso)).filter(Boolean).sort()

  // 优先 tag；无 tag 则回退插件目录 git 提交
  let times = tagTimes
  let source = 'tag'
  if (times.length === 0) {
    const dirTimes = gitDirTimes(dirNameOf(p))
    if (dirTimes.length === 2) { times = dirTimes.sort(); source = 'git' }
  }

  if (times.length === 0) {
    missing.push(p.id)
    untouched++
    continue
  }
  const createdAt = times[0]
  const updatedAt = times[times.length - 1]
  // 仅当字段缺失或为空时写入，避免覆盖已有更精确的值
  if (!p.createdAt) p.createdAt = createdAt
  if (!p.updatedAt) p.updatedAt = updatedAt
  filled++
  if (dry) console.log(`  ${source.padEnd(3)} ${p.id.padEnd(28)} created ${createdAt.slice(0,10)}  updated ${updatedAt.slice(0,10)}`)
}

console.log(`✓ 回填 ${filled} 个插件（tag 优先，git 兜底）`)
console.log(`• 无数据留空: ${untouched} 个 → ${missing.join(', ') || '(无)'}`)

if (dry) {
  console.log('\n[dry] 未写入。')
  process.exit(0)
}

// 4. 写回（保持 2 空格缩进 + 末尾换行，与 publish-plugin.mjs 一致）
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8')
console.log(`✓ index.json 已更新`)
