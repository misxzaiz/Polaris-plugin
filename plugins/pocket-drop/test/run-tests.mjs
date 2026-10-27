import assert from 'node:assert'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const core = require('../shared/core.js')
const { buildMobilePage } = require('../service/mobile-page.js')
const qrcode = require('../shared/qr.js')

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}
const ta = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

// ── normalizeSettings ───────────────────────────────────────────────────────
t('设置: null → 默认值', () => {
  const s = core.normalizeSettings(null)
  assert.strictEqual(s.ttlHours, 72)
  assert.strictEqual(s.maxSizeMb, 2048)
  assert.strictEqual(s.totalCapMb, 10240)
  assert.strictEqual(s.pin, '')
})
t('设置: 越界值被夹紧', () => {
  const s = core.normalizeSettings({ ttlHours: 99999, maxSizeMb: -5, totalCapMb: 1 })
  assert.strictEqual(s.ttlHours, 720)
  assert.strictEqual(s.maxSizeMb, 1)
  assert.strictEqual(s.totalCapMb, 256)
})
t('设置: 非法 pin 被拒、合法 pin 保留', () => {
  assert.strictEqual(core.normalizeSettings({ pin: 'abc' }).pin, '')
  assert.strictEqual(core.normalizeSettings({ pin: '12345' }).pin, '12345')
  assert.strictEqual(core.normalizeSettings({ pin: '123456789' }).pin, '')
})
t('设置: 非数字回落默认', () => {
  const s = core.normalizeSettings({ ttlHours: 'abc', maxSizeMb: NaN })
  assert.strictEqual(s.ttlHours, 72)
  assert.strictEqual(s.maxSizeMb, 2048)
})
t('PIN 格式校验', () => {
  assert.ok(core.isValidPin('1234'))
  assert.ok(core.isValidPin('123456'))
  assert.ok(!core.isValidPin('123'))
  assert.ok(!core.isValidPin('123456789'))
  assert.ok(!core.isValidPin('12a456'))
  assert.ok(!core.isValidPin(123456))
})

// ── 文件名清洗（路径注入是安全红线）─────────────────────────────────────────
t('文件名: 路径穿越被剥离', () => {
  assert.strictEqual(core.sanitizeFilename('../../etc/passwd'), 'passwd')
  assert.strictEqual(core.sanitizeFilename('..\\..\\win\\system32\\evil.dll'), 'evil.dll')
  assert.strictEqual(core.sanitizeFilename('C:\\Users\\test\\a.png'), 'a.png')
  assert.strictEqual(core.sanitizeFilename('/var/log/app.log'), 'app.log')
})
t('文件名: 控制字符与首尾点被清理', () => {
  assert.strictEqual(core.sanitizeFilename('a\x00b\x1fc.txt'), 'abc.txt')
  assert.strictEqual(core.sanitizeFilename('  name . '), 'name')
  assert.strictEqual(core.sanitizeFilename('name...'), 'name')
})
t('文件名: Windows 保留名加前缀', () => {
  assert.strictEqual(core.sanitizeFilename('CON'), '_CON')
  assert.strictEqual(core.sanitizeFilename('com1.txt'), '_com1.txt')
  assert.ok(!core.sanitizeFilename('NUL.docx').startsWith('NUL'))
})
t('文件名: 超长截断保留扩展名', () => {
  const long = 'x'.repeat(200) + '.png'
  const out = core.sanitizeFilename(long)
  assert.ok(out.length <= 180)
  assert.ok(out.endsWith('.png'))
})
t('文件名: 空输入给兜底名', () => {
  assert.strictEqual(core.sanitizeFilename(''), '未命名文件')
  assert.strictEqual(core.sanitizeFilename('..'), '未命名文件')
  assert.strictEqual(core.sanitizeFilename(null), '未命名文件')
})
t('文件名: 同名去重', () => {
  assert.strictEqual(core.dedupeName([], 'a.txt'), 'a.txt')
  assert.strictEqual(core.dedupeName(['a.txt'], 'a.txt'), 'a (2).txt')
  assert.strictEqual(core.dedupeName(['a.txt', 'a (2).txt'], 'a.txt'), 'a (3).txt')
  assert.strictEqual(core.dedupeName(['README'], 'README'), 'README (2)')
})

// ── 投递准入（单写者的核心判定）────────────────────────────────────────────
t('准入: 正常追加且不改入参', () => {
  const base = [{ id: 'a', name: 'a', size: 10 }]
  const r = core.addItem(base, { id: 'b', name: 'b', size: 5 }, {})
  assert.ok(r.ok)
  assert.strictEqual(r.items.length, 2)
  assert.strictEqual(base.length, 1)
})
t('准入: 重复 id 幂等（不重复插入）', () => {
  const base = [{ id: 'a', name: 'a', size: 10 }]
  const r = core.addItem(base, { id: 'a', name: 'a', size: 10 }, {})
  assert.ok(r.ok)
  assert.strictEqual(r.items.length, 1)
  assert.strictEqual(r.reason, 'duplicate_id')
})
t('准入: 条目数上限', () => {
  const base = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: 'n', size: 1 }))
  const r = core.addItem(base, { id: 'x', name: 'n', size: 1 }, {})
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.reason, 'too_many_items')
})
t('准入: 总容量上限', () => {
  const base = [{ id: 'a', name: 'a', size: 900 }]
  const r = core.addItem(base, { id: 'b', name: 'b', size: 200 }, { totalCapBytes: 1000 })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.reason, 'capacity')
})
t('准入: 非法条目拒绝', () => {
  assert.strictEqual(core.addItem([], null, {}).ok, false)
  assert.strictEqual(core.addItem([], {}, {}).ok, false)
})
t('移除: 按 id 删除', () => {
  const items = [{ id: 'a' }, { id: 'b' }]
  assert.deepStrictEqual(core.removeItem(items, 'a'), [{ id: 'b' }])
  assert.strictEqual(core.removeItem(items, 'zz').length, 2)
})
t('总字节: 求和且忽略脏数据', () => {
  assert.strictEqual(core.totalBytes([{ size: 10 }, { size: '5' }, {}, null]), 15)
})

// ── TTL 清扫与事件修剪 ──────────────────────────────────────────────────────
t('清扫: 过期边界 expiresAt<=now', () => {
  const now = 1000
  const items = [
    { id: 'old', expiresAt: 999 },
    { id: 'edge', expiresAt: 1000 },
    { id: 'new', expiresAt: 1001 },
    { id: 'forever' },
  ]
  const { expired, keep } = core.planSweep(items, now)
  assert.deepStrictEqual(expired.map((x) => x.id), ['old', 'edge'])
  assert.deepStrictEqual(keep.map((x) => x.id), ['new', 'forever'])
})
t('事件: 修剪保留最新 N 条（按 at 降序）', () => {
  const events = [{ at: 1 }, { at: 5 }, { at: 3 }, null, { at: 4 }]
  const out = core.pruneEvents(events, 3)
  assert.deepStrictEqual(out.map((e) => e.at), [5, 4, 3])
})

// ── 局域网地址优选 ──────────────────────────────────────────────────────────
t('LAN: 192.168 优先于 10.x 与 172.x', () => {
  const ifs = [
    { name: 'v', address: '10.0.0.5', internal: false, family: 'IPv4' },
    { name: 'e', address: '172.20.0.5', internal: false, family: 'IPv4' },
    { name: 'w', address: '192.168.1.5', internal: false, family: 'IPv4' },
  ]
  assert.strictEqual(core.pickLanUrl(ifs, 9867), 'http://192.168.1.5:9867')
})
t('LAN: 拒绝 internal/IPv6/链路本地/环回', () => {
  const ifs = [
    { name: 'lo', address: '127.0.0.1', internal: true, family: 'IPv4' },
    { name: 'v6', address: 'fe80::1', internal: false, family: 'IPv6' },
    { name: 'll', address: '169.254.3.4', internal: false, family: 'IPv4' },
  ]
  assert.strictEqual(core.pickLanUrl(ifs, 9867), '')
})
t('LAN: 端口非法返回空串', () => {
  assert.strictEqual(core.pickLanUrl([{ address: '192.168.1.1', internal: false, family: 'IPv4' }], 0), '')
})

// ── PIN 限频器（限频键=IP 维度）─────────────────────────────────────────────
t('限频: 5 次失败触发锁定', () => {
  const rl = core.createRateLimiter({ maxFails: 5, windowMs: 60000, lockMs: 60000 })
  const base = 1_000_000
  for (let i = 0; i < 4; i++) rl.fail('ip1', base + i * 1000)
  assert.ok(rl.allow('ip1', base + 5000))
  rl.fail('ip1', base + 6000) // 第 5 次 → 锁
  assert.ok(!rl.allow('ip1', base + 7000))
  assert.ok(rl.retryAfterSec('ip1', base + 7000) > 0)
  assert.ok(rl.allow('ip2', base + 7000)) // 其他 IP 不受影响
})
t('限频: 锁定到期自动恢复', () => {
  const rl = core.createRateLimiter({ maxFails: 2, windowMs: 60000, lockMs: 10000 })
  const base = 2_000_000
  rl.fail('ip1', base)
  rl.fail('ip1', base + 1000)
  assert.ok(!rl.allow('ip1', base + 2000))
  assert.ok(rl.allow('ip1', base + 11000))
})
t('限频: 滑动窗口内旧失败衰减', () => {
  const rl = core.createRateLimiter({ maxFails: 3, windowMs: 5000, lockMs: 60000 })
  const base = 3_000_000
  rl.fail('ip1', base)
  rl.fail('ip1', base + 6000) // 第一次已滑出窗口
  rl.fail('ip1', base + 7000)
  assert.ok(rl.allow('ip1', base + 8000)) // 仅 2 次在窗内，未锁
})

// ── 展示口径 ────────────────────────────────────────────────────────────────
t('字节格式化', () => {
  assert.strictEqual(core.formatBytes(0), '0 B')
  assert.strictEqual(core.formatBytes(1023), '1023 B')
  assert.strictEqual(core.formatBytes(1024), '1.0 KB')
  assert.strictEqual(core.formatBytes(1536), '1.5 KB')
  assert.strictEqual(core.formatBytes(5 * 1024 * 1024), '5.0 MB')
})
t('TTL 文案: 过期为空串', () => {
  assert.strictEqual(core.ttlLabel(500, 1000), '')
  assert.ok(core.ttlLabel(Date.now() + 3600_000, Date.now()).includes('小时'))
})

// ── 保存路径校验 ────────────────────────────────────────────────────────────
t('路径: 绝对路径放行、相对路径拒绝', () => {
  assert.ok(core.validateDestPath('D:\\dir\\file.png').ok)
  assert.ok(core.validateDestPath('/home/u/file.png').ok)
  assert.ok(core.validateDestPath('\\\\nas\\share\\f.bin').ok)
  assert.ok(!core.validateDestPath('relative/file.png').ok)
  assert.ok(!core.validateDestPath('').ok)
  assert.ok(!core.validateDestPath('C:\\bad\x01name').ok)
})

// ── MIME / 预览判定 ─────────────────────────────────────────────────────────
t('MIME: 图片可预览、未知走下载', () => {
  assert.strictEqual(core.mimeFor('a.PNG'), 'image/png')
  assert.ok(core.isPreviewable('photo.jpg'))
  assert.ok(!core.isPreviewable('archive.zip'))
  assert.strictEqual(core.mimeFor('noext'), 'application/octet-stream')
})

// ── id 生成 ─────────────────────────────────────────────────────────────────
t('id: 12 位 hex、rng 可注入', () => {
  let n = 0
  const id = core.newItemId(() => (n++ % 16) / 16)
  assert.ok(/^[0-9a-f]{12}$/.test(id))
  assert.strictEqual(core.newItemId(() => 0), '000000000000')
})

// ── 手机页与 QR 健全性 ──────────────────────────────────────────────────────
ta('手机页: 关键端点与门禁元素齐备、无模板残留', async () => {
  const html = buildMobilePage({ version: '0.1.0' })
  assert.ok(html.includes('/api/info'))
  assert.ok(html.includes("'/u?pin='"))
  assert.ok(html.includes('/__health') === false) // 健康端点不暴露给页面
  assert.ok(!html.includes('{{'))
  assert.ok(html.includes('capture="environment"')) // 拍照即传
  assert.ok(html.includes('localStorage'))
})
t('QR: 生成矩阵含定位图案（四角 finder）', () => {
  const qr = qrcode(0, 'M')
  qr.addData('http://192.168.1.5:9867/?pin=123456')
  qr.make()
  const n = qr.getModuleCount()
  assert.ok(n >= 21 && n <= 57)
  // 三个定位图案的角落模块必为暗
  assert.ok(qr.isDark(0, 0) && qr.isDark(0, n - 1) && qr.isDark(n - 1, 0))
})
t('QR: 中文 URL 内容也能编码', () => {
  const qr = qrcode(0, 'M')
  qr.addData('http://192.168.1.5:9867/?pin=123456&note=快传')
  qr.make()
  assert.ok(qr.getModuleCount() >= 21)
})

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
process.exit(bad.length ? 1 : 0)
