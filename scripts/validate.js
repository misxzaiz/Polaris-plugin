#!/usr/bin/env node
/**
 * 索引校验脚本：
 *  - 校验 index.json 符合 schema
 *  - 校验 plugins[] 中每条记录的 manifestUrl/downloadUrl/updateUrl 字段存在
 *  - 校验对应插件目录下 plugin.json / update.json 存在且 id/version 一致
 * 用法： node scripts/validate.js
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const indexPath = path.join(root, 'index.json')
if (!fs.existsSync(indexPath)) {
  console.error('✗ 未找到 index.json')
  process.exit(1)
}

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
let errors = 0

function err(msg) { console.error(`✗ ${msg}`); errors++ }

if (!Array.isArray(index.plugins)) {
  err('index.plugins 必须为数组')
  process.exit(1)
}

const seenIds = new Set()
for (const p of index.plugins) {
  const required = ['id', 'name', 'version', 'manifestUrl', 'downloadUrl', 'updateUrl']
  for (const f of required) {
    if (!p[f]) err(`插件 ${p.id ?? '<unknown>'} 缺少字段 ${f}`)
  }
  if (seenIds.has(p.id)) err(`插件 id 重复: ${p.id}`)
  seenIds.add(p.id)

  // 校验对应插件目录：从 manifestUrl 解析（最可靠）
  let pluginDir
  const urlMatch = p.manifestUrl.match(/\/plugins\/([^/]+)\/plugin\.json/)
  if (urlMatch) {
    pluginDir = path.join(root, 'plugins', urlMatch[1])
  } else {
    pluginDir = path.join(root, 'plugins', p.id.split('.').pop())
  }
  const pluginJsonPath = path.join(pluginDir, 'plugin.json')
  const updateJsonPath = path.join(pluginDir, 'update.json')

  if (!fs.existsSync(pluginJsonPath)) {
    err(`${dirName}/plugin.json 不存在`)
  } else {
    try {
      const m = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'))
      if (m.id !== p.id) err(`${dirName}: plugin.json id(${m.id}) ≠ index.id(${p.id})`)
      if (m.version !== p.version) err(`${dirName}: plugin.json version(${m.version}) ≠ index.version(${p.version})`)
    } catch (e) { err(`${dirName}: plugin.json 解析失败: ${e.message}`) }
  }

  if (!fs.existsSync(updateJsonPath)) {
    err(`${dirName}/update.json 不存在`)
  } else {
    try {
      const u = JSON.parse(fs.readFileSync(updateJsonPath, 'utf8'))
      if (u.id !== p.id) err(`${dirName}: update.json id(${u.id}) ≠ index.id(${p.id})`)
      if (u.version !== p.version) err(`${dirName}: update.json version(${u.version}) ≠ index.version(${p.version})`)
    } catch (e) { err(`${dirName}: update.json 解析失败: ${e.message}`) }
  }
}

if (errors === 0) {
  console.log(`✓ 校验通过，共 ${index.plugins.length} 个插件`)
} else {
  console.error(`\n校验失败，共 ${errors} 个错误`)
  process.exit(1)
}
