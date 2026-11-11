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

// 插件 manifest 顶层字段白名单：严格对齐宿主 src-tauri/src/models/plugin.rs 的
// PluginManifestFile（#[serde(deny_unknown_fields)]）。2026-11-11 B1-6 首发包多写
// 了一个 author 字段，宿主 read_manifest 会直接报「manifest 格式错误」导致装不上；
// 这里把契约前移到发布门禁，避免同类问题再进 CDN。全量扫描 plugins/ 目录，
// 未上架插件也可能经 dev-link 安装，同样要过。
const MANIFEST_TOP_LEVEL_FIELDS = new Set([
  'id', 'name', 'version', 'description', 'enabledByDefault', 'core',
  'manifestVersion', 'contributes', 'permissions', 'origin', 'compat',
])

const seenIds = new Set()
for (const p of index.plugins) {
  const required = ['id', 'name', 'version', 'manifestUrl', 'downloadUrl', 'updateUrl']
  for (const f of required) {
    if (!p[f]) err(`插件 ${p.id ?? '<unknown>'} 缺少字段 ${f}`)
  }
  if (seenIds.has(p.id)) err(`插件 id 重复: ${p.id}`)
  seenIds.add(p.id)

  // 校验 versions 数组
  if (Array.isArray(p.versions)) {
    if (p.versions.length === 0) err(`${p.id}: versions 数组不能为空`)
    const seenVersions = new Set()
    for (let i = 0; i < p.versions.length; i++) {
      const v = p.versions[i]
      if (!v.version || !v.downloadUrl) err(`${p.id}: versions[${i}] 缺少 version 或 downloadUrl`)
      if (seenVersions.has(v.version)) err(`${p.id}: versions 版本重复: ${v.version}`)
      seenVersions.add(v.version)
      // 第一个版本应与顶层 version 一致
      if (i === 0 && v.version !== p.version) err(`${p.id}: versions[0].version(${v.version}) ≠ index.version(${p.version})`)
    }
  } else {
    err(`${p.id}: 缺少 versions 字段`)
  }

  // 校验对应插件目录：从 manifestUrl 解析（最可靠）
  const dirName = (() => {
    const urlMatch = p.manifestUrl.match(/\/plugins\/([^/]+)\/plugin\.json/)
    return urlMatch ? urlMatch[1] : p.id.split('.').pop()
  })()
  const pluginDir = path.join(root, 'plugins', dirName)
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

// 全量 manifest 顶层字段门禁（含未上架插件）
const pluginsDir = path.join(root, 'plugins')
for (const dirName of fs.readdirSync(pluginsDir)) {
  const manifestPath = path.join(pluginsDir, dirName, 'plugin.json')
  if (!fs.existsSync(manifestPath)) continue
  let m
  try {
    m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    err(`${dirName}/plugin.json 解析失败: ${e.message}`)
    continue
  }
  for (const key of Object.keys(m)) {
    if (!MANIFEST_TOP_LEVEL_FIELDS.has(key)) {
      err(`${dirName}/plugin.json 未知顶层字段 "${key}"（宿主 deny_unknown_fields 会拒绝安装）`)
    }
  }
}

if (errors === 0) {
  console.log(`✓ 校验通过，共 ${index.plugins.length} 个插件`)
} else {
  console.error(`\n校验失败，共 ${errors} 个错误`)
  process.exit(1)
}
