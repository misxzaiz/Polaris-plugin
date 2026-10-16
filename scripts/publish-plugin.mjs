#!/usr/bin/env node
/**
 * publish-plugin.mjs — 一键打包发布插件
 *
 * 用法:
 *   node scripts/publish-plugin.mjs <plugin-id>           # 仅打包 + 更新 index.json
 *   node scripts/publish-plugin.mjs <plugin-id> --push     # 打包 + commit + tag + push
 *
 * 流程:
 *   1. cd plugins/<id> && node build.js（如果有 build.js 或 npm run build）
 *   2. 按 .pluginignore 排除规则拷贝文件到临时目录
 *   3. 从临时目录打包 zip
 *   4. 计算 sha256 → 更新 index.json
 *   5. (--push) git add → commit → tag(pluginId-v<version>) → push
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, cpSync, rmSync } from 'fs'
import { resolve, join, relative, sep } from 'path'

const REPO_DIR = resolve(import.meta.dirname, '..')
const PLUGINS_DIR = join(REPO_DIR, 'plugins')
const INDEX_JSON = join(REPO_DIR, 'index.json')

// ── helpers ──────────────────────────────────────────────────────────

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function runCapture(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8' }).trim()
}

/**
 * gitignore 式路径匹配（与 make-zip.cjs 保持一致）：
 * - 规则含中间路径（如 relay_server/vendor/node_modules/）→ 锚定完整前缀匹配整棵子树；
 * - 纯段名（如 node_modules/、src/）→ 任一目录段名匹配即排除；
 * - *.ext / 通配 → glob 匹配（相对路径或段名）。
 */
function matchRule(rel, core) {
  const parts = rel.split('/')
  const base = parts[parts.length - 1]
  // 前导 / 表示锚定插件根（如 /package.json 只匹配根，不匹配 vendor 内同名）
  if (core.startsWith('/')) {
    return rel === core.slice(1)
  }
  if (core.includes('/')) {
    return rel === core || rel.startsWith(core + '/')
  }
  if (core === rel || core === base) return true
  if (core.includes('*') || core.includes('?')) {
    const re = new RegExp('^' + core
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '(.*/)?')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]') + '$')
    return re.test(rel) || re.test(base)
  }
  return parts.some(p => p === core)
}

/** 收集符合排除规则的文件列表（相对路径）。gitignore 式顺序判定：最后匹配的规则生效（支持 ! 否定）。 */
function collectFiles(pluginDir, ignorePatterns) {
  const files = []
  function excluded(rel) {
    let decision = false
    for (const pat of ignorePatterns) {
      const neg = pat.startsWith('!')
      const core = (neg ? pat.slice(1) : pat).replace(/\/+$/, '')
      if (!core) continue
      if (matchRule(rel, core)) decision = !neg
    }
    return decision
  }

  function walk(dir, relativeDir) {
    const names = readdirSync(dir)
    for (const name of names) {
      const full = join(dir, name)
      const rel = (relativeDir ? join(relativeDir, name) : name).replace(/\\/g, '/') // 统一正斜杠
      const stat = statSync(full)
      if (excluded(rel)) continue
      if (stat.isDirectory()) {
        walk(full, rel)
      } else {
        files.push(rel)
      }
    }
  }

  walk(pluginDir, '')
  return files
}

/** 计算文件 sha256 摘要 */
function sha256sum(filePath) {
  // 跨平台兼容: Windows 下用 certutil 或 powershell
  const isWin = process.platform === 'win32'
  if (isWin) {
    const result = execSync(
      `certutil -hashfile "${filePath}" SHA256`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    // 输出格式: "SHA256 哈希 of <path>:\n<hex>\n<blank>"
    const lines = result.split('\n').map(l => l.trim())
    // 找第一个纯 hex 行
    for (const line of lines) {
      if (/^[0-9a-fA-F]{64}$/.test(line)) return line.toLowerCase()
    }
    throw new Error('无法从 certutil 输出提取 sha256')
  }
  return execSync(`sha256sum "${filePath}"`, { encoding: 'utf-8' }).split(/\s+/)[0]
}

/**
 * 更新 index.json 中指定插件的 sha256 + version + downloadUrl + versions。
 * downloadUrl 形如 https://cdn.jsdelivr.net/gh/<repo>@<tag>/plugins/<id>/<id>.zip
 * 由 manifest 的 version 生成 tag：<pluginId>-v<version>（与 --push 的 tag 命名保持一致）。
 */
function updateIndexJson(pluginId, sha256) {
  const index = JSON.parse(readFileSync(INDEX_JSON, 'utf-8'))
  const plugin = index.plugins.find(p => p.id === pluginId)
  if (!plugin) {
    console.error(`   ⚠  index.json 中未找到插件 "${pluginId}"，跳过 sha256 更新`)
    return false
  }
  const manifestPath = join(PLUGINS_DIR, pluginId, 'plugin.json')
  let version = plugin.version || '1.0.0'
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      version = manifest.version || version
    } catch {}
  }
  const tagName = `${pluginId}-v${version}`
  const base = `https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@${tagName}/plugins/${pluginId}/${pluginId}.zip`
  plugin.version = version
  plugin.sha256 = sha256
  plugin.downloadUrl = base
  // versions 数组去重后插到头部（避免重复发布同版本时堆积重复项）
  plugin.versions = plugin.versions || []
  plugin.versions = plugin.versions.filter(v => v.version !== version)
  plugin.versions.unshift({ version, downloadUrl: base })
  writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + '\n', 'utf-8')
  console.log(`   ✓ index.json 已同步: version=${version}, sha256=${sha256}`)
  console.log(`   ✓ downloadUrl=${base}`)
  return true
}

// ── main ─────────────────────────────────────────────────────────────

const pluginId = process.argv[2]
const doPush = process.argv.includes('--push')

if (!pluginId) {
  console.error('用法: node scripts/publish-plugin.mjs <plugin-id> [--push]')
  console.error('  示例: node scripts/publish-plugin.mjs polaris-api --push')
  process.exit(1)
}

const pluginDir = resolve(PLUGINS_DIR, pluginId)
if (!existsSync(pluginDir)) {
  console.error(`✗ 插件目录不存在: ${pluginDir}`)
  process.exit(1)
}

const zipName = `${pluginId}.zip`
const zipPath = join(pluginDir, zipName)
const buildJs = join(pluginDir, 'build.js')
const pkgJson = join(pluginDir, 'package.json')
const pluginIgnore = join(pluginDir, '.pluginignore')

console.log(`\n📦 ${pluginId}`)
console.log(`   目录: ${pluginDir}`)

// ── 1. 构建（优先 prod 模式） ─────────────────────────────────────────

if (existsSync(pkgJson)) {
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'))
  if (pkg.scripts?.['build:prod']) {
    console.log('  🔨 npm run build:prod')
    run('npm run build:prod', pluginDir)
  } else if (pkg.scripts?.build) {
    console.log('  🔨 npm run build')
    run('npm run build', pluginDir)
  } else if (existsSync(buildJs)) {
    console.log('  🔨 node build.js --minify')
    run('node build.js --minify', pluginDir)
  }
} else if (existsSync(buildJs)) {
  console.log('  🔨 node build.js')
  run('node build.js', pluginDir)
}

// ── 2. 读取 .pluginignore 排除规则 ────────────────────────────────────

const ignorePatterns = []
if (existsSync(pluginIgnore)) {
  const raw = readFileSync(pluginIgnore, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      ignorePatterns.push(trimmed)
    }
  }
}
// 强制排除 zip 自身（避免循环包含）
if (!ignorePatterns.includes(zipName)) ignorePatterns.push(zipName)

console.log(`  📋 排除: ${ignorePatterns.join(', ') || '(无)'}`)

// ── 3. 收集文件 → 拷贝到临时目录 → 打包 zip ──────────────────────────

const files = collectFiles(pluginDir, ignorePatterns)

const tmpDir = join(pluginDir, `.tmp-pack-${pluginId}`)
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })

console.log(`  📦 打包 ${files.length} 个文件 → ${zipName}`)

// 拷贝文件到临时目录（保持相对路径）
for (const file of files) {
  const src = join(pluginDir, file)
  const dst = join(tmpDir, file)
  const dstDir = resolve(dst, '..')
  if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true })
  cpSync(src, dst)
}

// 从临时目录打包 zip（使用 Node.js 原生方式或系统 zip）
// 用 powershell Compress-Archive 跨平台兼容
const isWin = process.platform === 'win32'
if (isWin) {
  // 删除旧 zip 避免 Compress-Archive 追加
  if (existsSync(zipPath)) rmSync(zipPath)
  // PowerShell: Compress-Archive 需要完整路径
  run(
    `powershell -NoProfile -Command "Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    REPO_DIR
  )
} else {
  run(`cd "${tmpDir}" && zip -r "${zipPath}" .`, REPO_DIR)
}

// 清理临时目录
rmSync(tmpDir, { recursive: true })

// 验证 zip 非空
const zipStat = statSync(zipPath)
if (zipStat.size === 0) {
  console.error('✗ 打包后的 zip 为空文件，中止')
  process.exit(1)
}
console.log(`  ✓ zip 大小: ${(zipStat.size / 1024).toFixed(1)} KB`)

// ── 4. 计算 sha256 → 更新 index.json ─────────────────────────────────

const sha256 = sha256sum(zipPath)
console.log(`  🔑 sha256: ${sha256}`)
updateIndexJson(pluginId, sha256)

// ── 5. 可选：git commit + tag + push ─────────────────────────────────

if (doPush) {
  console.log('\n🚀 提交并推送...')

  // 从 plugin.json 读取版本
  const manifestPath = join(pluginDir, 'plugin.json')
  let version = '1.0.0'
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      version = manifest.version || version
    } catch {}
  }

  const tagName = `${pluginId}-v${version}`

  // git add
  run(`git add plugins/${pluginId}/ index.json`, REPO_DIR)

  // 检查是否有改动
  const status = runCapture('git status --porcelain', REPO_DIR)
  if (!status.trim()) {
    console.log('  ℹ  无改动，跳过提交')
  } else {
    // commit
    run(`git commit -m "fix(${pluginId}): 发布 v${version}"`, REPO_DIR)
    // tag
    try {
      run(`git tag "${tagName}"`, REPO_DIR)
    } catch (e) {
      console.log(`  ℹ  tag ${tagName} 已存在，跳过`)
    }
    // push
    run('git push origin main', REPO_DIR)
    try {
      run(`git push origin "${tagName}"`, REPO_DIR)
    } catch (e) {
      console.log(`  ℹ  tag push 跳过`)
    }
    console.log(`\n✅ ${pluginId} v${version} 发布完成`)
  }
} else {
  console.log('\n💡 使用 --push 参数自动 commit + tag + push')
  console.log(`   node scripts/publish-plugin.mjs ${pluginId} --push`)
}