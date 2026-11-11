/**
 * 骨架契约自检（node --test，零依赖）
 *
 * 把 B1-6 发布链踩过的四个坑固化成回归用例：
 *   ① .gitignore 忽略 zip → tag 无包，CDN downloadUrl 404
 *   ② origin.updateUrl 误指 plugin.json（应指 update.json）
 *   ③ downloadUrl 用 @main（应用发布 tag）
 *   ④ manifest 多写未知顶层字段 author → 宿主 deny_unknown_fields 拒绝安装
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const readText = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// 严格对齐宿主 src-tauri/src/models/plugin.rs::PluginManifestFile
const MANIFEST_TOP_LEVEL_FIELDS = new Set([
  'id', 'name', 'version', 'description', 'enabledByDefault', 'core',
  'manifestVersion', 'contributes', 'permissions', 'origin', 'compat',
])

test('plugin.json / update.json 契约一致且无宿主未知顶层字段', () => {
  const m = readJson('plugin.json')
  const u = readJson('update.json')
  assert.equal(m.id, 'radio-broadcast')
  assert.equal(u.id, m.id)
  assert.equal(u.version, m.version)
  for (const [label, obj] of [['plugin.json', m], ['update.json', u]]) {
    for (const key of Object.keys(obj)) {
      assert.ok(
        MANIFEST_TOP_LEVEL_FIELDS.has(key),
        `${label} 未知顶层字段 "${key}"（宿主 deny_unknown_fields 会拒绝安装）`,
      )
    }
  }
})

test('panel 贡献点与主仓原 view 契约一致（摘壳后不漂移）', () => {
  const m = readJson('plugin.json')
  assert.equal(m.contributes.panel.entry, './dist/panel.js')
  assert.ok(
    fs.existsSync(path.join(root, m.contributes.panel.entry)),
    'dist/panel.js 必须已构建（npm run build）',
  )
  const v = m.contributes.views[0]
  assert.deepEqual(
    {
      id: v.id, area: v.area, panelType: v.panelType, icon: v.icon,
      labelKey: v.labelKey, order: v.order,
    },
    {
      id: 'radio-broadcast.panel', area: 'activityBar', panelType: 'radio-broadcast',
      icon: 'BookOpen', labelKey: 'labels.radioBroadcastPanel', order: 96,
    },
  )
  assert.equal(m.enabledByDefault, false, '骨架阶段禁止默认启用（占位面板）')
})

test('面板产物为 ESM 且 react 保持 external（宿主 shim 需要重写 import）', () => {
  const code = readText('dist/panel.js')
  assert.ok(
    /export\s+default|export\s*\{[^}]*\bdefault\b/.test(code),
    '产物必须导出 default 面板组件',
  )
  assert.match(code, /from\s*["']react["']/, 'react 必须 external')
  assert.match(code, /from\s*["']react\/jsx-runtime["']/, 'react/jsx-runtime 必须 external（宿主 shim 提供 jsx/jsxs）')
  assert.doesNotMatch(code, /\brequire\s*\(/, '不应出现 CJS require')
  assert.match(code, /router_dispatch|health_check/, '宿主桥调用应被打进产物')
})

test('发布链三个 URL / 打包坑已预先规避', () => {
  const m = readJson('plugin.json')
  assert.ok(
    m.origin.updateUrl.endsWith('/plugins/radio-broadcast/update.json'),
    'origin.updateUrl 必须指向 update.json',
  )
  assert.match(m.origin.downloadUrl, /@radio-broadcast-v1\.0\.0\//, 'downloadUrl 必须用发布 tag')
  assert.doesNotMatch(m.origin.downloadUrl, /@main/, 'downloadUrl 不能用 @main')
  assert.match(readText('.gitignore'), /!radio-broadcast\.zip/, '.gitignore 必须放行 zip 入库')
  assert.match(readText('.pluginignore'), /\*\.zip/, 'zip 不能套进 zip')
})
