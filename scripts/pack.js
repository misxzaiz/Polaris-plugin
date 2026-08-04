#!/usr/bin/env node
/**
 * 插件打包脚本：将 plugins/<name> 目录打成 <name>.zip
 * 用法： node scripts/pack.js plugins/<name>
 * 依赖：无外部依赖（使用 Node 内置模块；zip 用命令行 zip 或 archiver）
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

// 输出 zip 名：使用目录名而非 id，便于路径一致
const dirName = path.basename(pluginDir)
const zipName = `${dirName}.zip`
const zipPath = path.join(pluginDir, zipName)

// 删除旧 zip
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)

// 打包：进入插件目录打 zip，保证根目录含 plugin.json
// Windows 可能无 zip 命令；优先使用 PowerShell Compress-Archive
try {
  if (process.platform === 'win32') {
    // 在插件目录内打包，保证 zip 根目录直接含 plugin.json（无外层目录）
    const files = fs.readdirSync(pluginDir).filter(f => f !== zipName)
    const fileList = files.join(',')
    // 用 PowerShell 在插件目录内 Compress-Archive，Source 用 * 保证根目录结构
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${dirName}${path.sep}*' -DestinationPath '${dirName}${path.sep}${zipName}' -Force"`, { cwd: path.dirname(pluginDir), stdio: 'inherit' })
  } else {
    execSync(`cd "${pluginDir}" && zip -r "${zipName}" . -x "${zipName}"`, { stdio: 'inherit' })
  }
} catch (e) {
  console.error('✗ 打包失败，尝试安装 archiver: npm i -g archiver', e.message)
  process.exit(1)
}

// 计算 sha256
const buf = fs.readFileSync(zipPath)
const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

console.log(`✓ 已打包: ${zipPath}`)
console.log(`  version: ${manifest.version}`)
console.log(`  sha256:  ${sha256}`)
console.log(`  downloadUrl 提示: https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/${dirName}/${zipName}`)
