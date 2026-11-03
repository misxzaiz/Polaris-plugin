/**
 * 执行沙箱 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零宿主依赖。覆盖：
 *  - sandboxRoot / workspaceDir 定位
 *  - isInsideRoot / resolveSafeWritePath 边界校验（../ 逃逸 / 前缀撞名 / 盘符）
 *  - normalizeWorkspace 脏数据防御
 *  - isExpired / newWorkspaceMeta / touchMeta TTL 语义
 *  - clampTimeoutSec / tailBytes / requireConfirm
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import * as core from '../shared/sandbox-core.js'

const ROOT = path.resolve('C:/tmp/sbx-root') // 造一个规范形根（Windows 形状）
const WS = 'wsabc123'

test('makeWorkspaceId: 形状（ws 前缀 + base36）', () => {
  const id = core.makeWorkspaceId(1000)
  assert.ok(id.startsWith('ws'))
  assert.ok(id.length > 8)
})

test('isInsideRoot: 纯比对语义（根内 true；../ 逃逸/盘符越界 false）', () => {
  const join = (...p) => path.resolve(...p) // 复现 server 侧 path.join+resolve
  assert.equal(core.isInsideRoot(ROOT, join(ROOT, WS, 'a.js')), true)
  assert.equal(core.isInsideRoot(ROOT, ROOT), true)
  assert.equal(core.isInsideRoot(ROOT, join(ROOT, WS, '..', '..', 'evil.js')), false)
  assert.equal(core.isInsideRoot(ROOT, 'C:/Windows/system32/config'), false)
})

test('resolveSafeWritePath 等价行为：resolve(wsDir, rel) 后 isInsideRoot 比对（server 侧组合逻辑）', () => {
  const wsDir = path.resolve(ROOT, WS)
  const chk = (rel) => {
    if (!rel || typeof rel !== 'string') return { ok: false }
    const target = path.resolve(wsDir, rel)
    return target !== wsDir && !core.isInsideRoot(wsDir, target) ? { ok: false } : { ok: true, target }
  }
  assert.equal(chk('src/main.js').ok, true)
  assert.equal(chk('../evil.js').ok, false)
  assert.equal(chk('C:/evil/x.js').ok, false)
  assert.equal(chk('').ok, false)
  assert.equal(chk(null).ok, false)
  // 撞名目录（wsabc123-evil 在 ROOT 内但在 WS 外）
  assert.equal(chk('../' + WS + '-evil/x.js').ok, false)
})

test('normalizeWorkspace: 合法归一；缺 id/非对象返回 null', () => {
  const meta = core.normalizeWorkspace({
    v: 1, workspaceId: WS, label: 'x'.repeat(200), dir: 'D:/d',
    createdAt: 100, expiresAt: 200, lastActivityAt: 150,
  })
  assert.ok(meta)
  assert.equal(meta.label.length, 100) // 截尾
  assert.equal(meta.createdAt, 100)
  assert.equal(core.normalizeWorkspace(null), null)
  assert.equal(core.normalizeWorkspace({ dir: 'x' }), null) // 缺 workspaceId
  assert.equal(core.normalizeWorkspace({ workspaceId: '' }), null)
})

test('isExpired: expiresAt<=now 过期；无 expiresAt 永不过期', () => {
  assert.equal(core.isExpired({ expiresAt: 100 }, 100), true)
  assert.equal(core.isExpired({ expiresAt: 100 }, 101), true)
  assert.equal(core.isExpired({ expiresAt: 100 }, 99), false)
  assert.equal(core.isExpired({}, 999), false)
  assert.equal(core.isExpired(null, 999), false)
})

test('newWorkspaceMeta / touchMeta: TTL 从创建起算；touch 不续期', () => {
  const meta = core.newWorkspaceMeta(WS, 'D:/d', 'test', 1000, 5000)
  assert.equal(meta.createdAt, 1000)
  assert.equal(meta.expiresAt, 6000)
  const touched = core.touchMeta(meta, 4000)
  assert.equal(touched.lastActivityAt, 4000)
  assert.equal(touched.expiresAt, 6000) // 不续期
})

test('clampTimeoutSec: 夹紧 [1,120]；非数字默认 120s', () => {
  assert.equal(core.clampTimeoutSec(0.2), 1000)
  assert.equal(core.clampTimeoutSec(5), 5000)
  assert.equal(core.clampTimeoutSec(999), 120000)
  assert.equal(core.clampTimeoutSec('abc'), 120000)
})

test('tailBytes: 短文本原样；超长截尾带省略号', () => {
  assert.equal(core.tailBytes('abc', 10), 'abc')
  const long = 'x'.repeat(20)
  const t = core.tailBytes(long, 10)
  assert.equal(t.length, 10)
  assert.ok(t.startsWith('…'))
})

test('requireConfirm: 显式 true 才过闸', () => {
  assert.equal(core.requireConfirm({ confirm: true }), true)
  assert.equal(core.requireConfirm({ confirm: false }), false)
  assert.equal(core.requireConfirm({}), false)
  assert.equal(core.requireConfirm(null), false)
})
