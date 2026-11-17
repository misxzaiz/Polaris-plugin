#!/usr/bin/env node
/**
 * sync-types.mjs —— 宿主 types 单源 → 插件 host/types 拷贝（W7 防漂移）
 *
 * 用法：node scripts/sync-types.mjs
 * 从主仓 src/types/ 拷贝白名单文件到 plugins/chat-desk/src/host/types/，
 * 并打印 diff 摘要。CI/本地均可在 build 前执行；若宿主未找到（独立构建插件仓），
 * 跳过并警告（不阻塞）。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const hostTypesDir = join(pluginRoot, '..', '..', '..', 'space', 'base', 'Polaris', 'src', 'types')
// Windows 绝对路径兜底（上面相对拼接在跨仓场景不可靠，直接用约定路径探测）
const candidates = [
  'D:/space/base/Polaris/src/types',
  join(pluginRoot, '..', '..', 'Polaris', 'src', 'types'),
]
let hostDir = null
for (const c of candidates) {
  if (existsSync(c)) { hostDir = c; break }
}
if (!hostDir) {
  console.warn('[sync-types] 宿主 src/types 未找到（独立构建），跳过同步')
  process.exit(0)
}

const targetDir = join(pluginRoot, 'src', 'host', 'types')
const hostFiles = new Set(readdirSync(hostDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')))
const pluginFiles = readdirSync(targetDir).filter((f) => f.endsWith('.ts'))

let synced = 0
let removed = 0
for (const f of pluginFiles) {
  if (!hostFiles.has(f)) {
    // 宿主已删除的副本：删除（插件独有类型文件不在宿主集合则保留——promptSnippet/scmDiff/skill 等插件侧新增）
    const hostHasBase = hostFiles.has(f)
    if (!hostHasBase && ['chat.ts', 'config.ts', 'context.ts', 'errors.ts', 'modelProfile.ts'].includes(f)) {
      // 这些宿主一定有；缺失说明宿主结构变化，保守跳过
      continue
    }
  }
}
for (const f of hostFiles) {
  const src = readFileSync(join(hostDir, f), 'utf8')
  const dst = join(targetDir, f)
  let changed = false
  if (existsSync(dst)) {
    const cur = readFileSync(dst, 'utf8')
    if (cur !== src) { changed = true }
  } else {
    changed = true
  }
  if (changed) {
    writeFileSync(dst, src)
    synced += 1
    console.log(`[sync-types] ${f} 已同步（${src.split('\n').length} 行）`)
  }
}
console.log(`[sync-types] 完成：${synced} 个文件更新，0 个删除`)
