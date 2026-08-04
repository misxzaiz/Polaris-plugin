#!/usr/bin/env node
/**
 * 插件打包脚本：将 plugins/<name> 目录打成 <name>.zip
 * 用法： node scripts/pack.js plugins/<name>
 *
 * 行为：
 *  - 读取 plugin.json 校验 id/version
 *  - 若存在 .pluginignore，按其规则排除（支持目录/后缀/精确文件）
 *  - 将剩余文件复制到临时目录再压缩，保证 zip 根目录直接含 plugin.json
 *  - 输出 sha256
 * 依赖：无外部依赖（Node 内置 fs + PowerShell Compress-Archive / zip）
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const crypto = require('crypto')

const target = process.argv[2]
if (!target) {
  console.error('用法: node scripts/pack.js plugins/<name>')
  process.exit(1)
}

const pluginDir = path.resolve(target)
const manifestPath = path.join(pluginDir, 'plugin.json')
if (!fs.existsSync(manifestPath)) {
  console.error(`✗ 未找到 plugin.json: ${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (!manifest.id || !manifest.version) {
  console.error('✗ plugin.json 缺少 id/version')
  process.exit(1)
}

const dirName = path.basename(pluginDir)
const zipName = `${dirName}.zip`
const zipPath = path.join(pluginDir, zipName)

// 读取 .pluginignore
const ignorePath = path.join(pluginDir, '.pluginignore')
const ignoreRules = fs.existsSync(ignorePath)
  ? fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  : []

function isIgnored(relPath) {
  const normalized = relPath.replace(/\\/g, '/')
  return ignoreRules.some(rule => {
    if (rule.endsWith('/')) return normalized.startsWith(rule) || normalized === rule.slice(0, -1)
    if (rule.startsWith('*.')) return normalized.endsWith(rule.slice(1))
    return normalized === rule || normalized.startsWith(rule + '/')
  })
}

// 收集要打包的文件（相对路径）
const filesToPack = []
function walk(dir, relBase = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name
    if (entry.name === zipName) continue
    if (isIgnored(rel)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, rel)
    } else if (entry.isFile()) {
      filesToPack.push(rel)
    }
  }
}
walk(pluginDir)

if (filesToPack.length === 0) {
  console.error('✗ 没有可打包的文件（检查 .pluginignore）')
  process.exit(1)
}

// 复制到临时目录再压缩
const tmpDir = path.join(pluginDir, '.tmp-pack-' + Date.now())
fs.mkdirSync(tmpDir, { recursive: true })
try {
  for (const rel of filesToPack) {
    const src = path.join(pluginDir, rel)
    const dst = path.join(tmpDir, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
  }

  // 删除旧 zip
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)

  // 压缩：在 tmpDir 内打 zip，保证根目录结构
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${tmpDir}${path.sep}*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' })
  } else {
    execSync(`cd "${tmpDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' })
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

// 计算 sha256
const buf = fs.readFileSync(zipPath)
const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

console.log(`✓ 已打包: ${zipPath}`)
console.log(`  version: ${manifest.version}`)
console.log(`  files:   ${filesToPack.length}`)
console.log(`  sha256:  ${sha256}`)
console.log(`  downloadUrl: https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/${dirName}/${zipName}`)
