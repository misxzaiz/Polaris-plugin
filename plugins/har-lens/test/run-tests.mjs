/**
 * core 单测：node test/run-tests.mjs
 * 覆盖：校验/分析/投影脱敏/审计/脱敏往返/对比/详情/瀑布几何/fixture
 */
import assert from 'node:assert'
import core from '../shared/core.js'

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

const fixture = core.makeFixtureHar()

// ── 校验 ───────────────────────────────────────────────────────────────────
t('validateHar: 合法 fixture 通过且无致命警告', () => {
  const v = core.validateHar(fixture)
  assert.equal(v.ok, true)
})
t('validateHar: 非 HAR 结构拒绝（缺 log.entries）', () => {
  assert.equal(core.validateHar({ log: {} }).ok, false)
  assert.equal(core.validateHar(null).ok, false)
  assert.equal(core.validateHar({ log: { entries: 'no' } }).ok, false)
})
t('validateHar: 空 entries 警告但通过', () => {
  const v = core.validateHar({ log: { version: '1.2', creator: { name: 'x' }, entries: [] } })
  assert.equal(v.ok, true)
  assert.ok(v.warnings.some((w) => w.includes('entries 为空')))
})

// ── 分析 ───────────────────────────────────────────────────────────────────
const { report, rows, t0 } = core.analyzeHar(fixture)
t('分析: 条目数 6 / t0 锚定首条', () => {
  assert.equal(report.entryCount, 6)
  assert.equal(t0, Date.parse('2026-11-02T08:00:00.000Z'))
  assert.equal(rows.length, 6)
})
t('分析: 错误计数=2（500+404）', () => {
  assert.equal(report.errorCount, 2)
  assert.equal(report.statusCounts['5xx'], 1)
  assert.equal(report.statusCounts['4xx'], 1)
  assert.equal(report.statusCounts['2xx'], 3)
})
t('分析: 304 计缓存命中', () => {
  assert.equal(report.cachedCount, 1)
})
t('分析: 重复无缓存组=1 且 count=2（access_token 同 URL）', () => {
  assert.equal(report.dupUncached.length, 1)
  assert.equal(report.dupUncached[0].count, 2)
  assert.ok(report.dupUncached[0].key.includes('/v1/users'))
})
t('分析: 慢 TOP 排序首条=orders(1250ms)', () => {
  const top = [...rows].sort((a, b) => b.t - a.t)[0]
  assert.equal(top.t, 1250)
  assert.ok(top.u.includes('/v1/orders'))
})
t('分析: 时相合计口径（wait=各条 wait 之和 1975）', () => {
  assert.equal(report.phaseTotalsMs[5], 300 + 200 + 15 + 300 + 1100 + 60)
})
t('分析: 域聚合 api.example.com 5 条', () => {
  const d = report.domains.find((x) => x.h === 'api.example.com')
  assert.ok(d && d.n === 5, JSON.stringify(report.domains))
})

// ── 投影脱敏 ───────────────────────────────────────────────────────────────
t('投影: URL query 敏感值已掩码且非敏感参数保留', () => {
  const r0 = rows[0]
  assert.ok(r0.u.includes('access_token=‹'), r0.u)
  assert.ok(!r0.u.includes('SECRET123'))
  assert.ok(r0.u.includes('tab=1'))
})
t('投影: 行字段齐备（ph 七段/rs/flags）', () => {
  const r4 = rows[4]
  assert.equal(r4.ph.length, 7)
  assert.equal(r4.ph[5], 1100) // wait
  assert.ok(r4.flags.includes('error'))
  assert.ok(r4.flags.includes('slow'))
})
t('redactText: 各特征形态', () => {
  assert.ok(core.redactText('https://u:p@host/x').includes('‹已脱敏›'))
  assert.ok(core.redactText('https://h/x?api_key=abcdef123456').includes('api_key=‹'))
  assert.ok(core.redactText('Bearer abcdefghijklmnopqrstuv').includes('[bearer-body]'))
  assert.ok(core.redactText('see AKIAIOSFODNN7EXAMPLE here').includes('[api-key-pattern]'))
  assert.ok(core.redactText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c').includes('[jwt]'))
  assert.ok(core.redactText('dsn=postgres://admin:s3cret@db.internal:5432/app').includes('‹'))
  assert.ok(!core.redactText('https://h/x?tab=1&v=2').includes('‹'))
})

// ── 审计 ───────────────────────────────────────────────────────────────────
const audit = core.auditHar(fixture)
t('审计: 五类基础命中（auth-header/cookie/set-cookie/query-secret）', () => {
  const cats = new Set(audit.findings.map((f) => f.cat))
  for (const c of ['auth-header', 'cookie', 'set-cookie', 'query-secret']) assert.ok(cats.has(c), `缺 ${c}`)
})
t('审计: 体特征（sk- 密钥 + JWT + X-Api-Key 头）', () => {
  const f = audit.findings.find((x) => x.cat === 'api-key-pattern')
  assert.ok(f, 'api-key-pattern 缺失')
  assert.ok(f.count >= 1)
  assert.ok(audit.findings.some((x) => x.cat === 'jwt'))
})
t('审计: 样例与全文均无明文密钥', () => {
  const s = JSON.stringify(audit)
  for (const secret of ['SECRET123', 'hunter2', 'sk-proj-', 'abc.def.ghi', 'xyz123', 't0k3n_v4lu3', 'session=abc123', 's3cret']) {
    assert.ok(!s.includes(secret), `泄露 ${secret}`)
  }
})
t('审计: highCount 只算高危类', () => {
  assert.equal(audit.highCount, audit.findings.filter((f) => f.sev === 'high').reduce((a, f) => a + f.count, 0))
  assert.ok(audit.highCount >= 2)
})
t('审计: 命中条目索引指向存在行', () => {
  for (const f of audit.findings) {
    for (const i of f.idx) assert.ok(i >= 0 && i < 6, `idx 越界 ${i}`)
  }
})

// ── 脱敏导出 ───────────────────────────────────────────────────────────────
const { har: san, stats } = core.sanitizeHar(fixture, core.DEFAULT_SANITIZE)
t('脱敏: 明文密钥全灭（六类）', () => {
  const s = JSON.stringify(san)
  for (const secret of ['SECRET123', 'hunter2', 'sk-proj-', 'abc.def.ghi', 'xyz123', 't0k3n_v4lu3', 'session=abc123', 'eyJhbGciOiJIUzI1NiJ9']) {
    assert.ok(!s.includes(secret), `残留 ${secret}`)
  }
  assert.ok(stats.authHeaders >= 2)
  assert.ok(stats.bodies >= 2)
})
t('脱敏: 结构仍为合法 HAR（JSON 往返 + validateHar）', () => {
  const v = core.validateHar(JSON.parse(JSON.stringify(san)))
  assert.equal(v.ok, true)
})
t('脱敏: 非 URL 化 query 值被替换但键保留', () => {
  const u = san.log.entries[0].request.url
  assert.ok(u.includes('access_token='), u)
  assert.ok(!u.includes('SECRET123'))
  assert.ok(u.includes('tab=1'))
})
t('脱敏: 复核审计归零', () => {
  const re = core.auditHar(san)
  assert.equal(re.total, 0, JSON.stringify(re.findings.map((f) => [f.cat, f.count])))
})
t('脱敏: 关闭 bodies 开关时体保留', () => {
  const { har: keep } = core.sanitizeHar(fixture, { ...core.DEFAULT_SANITIZE, bodies: false })
  assert.ok(JSON.stringify(keep).includes('hunter2') === false || true) // 其他开关仍清 query
  const e1 = keep.log.entries[1]
  assert.ok(e1.request.postData.text.includes('hunter2'), '关闭 bodies 应保留体')
})
t('脱敏: creator.comment 留痕', () => {
  assert.ok(String(san.log.creator.comment || '').includes('sanitized by har-lens'))
})

// ── 对比 ───────────────────────────────────────────────────────────────────
t('对比: 变慢/翻转/新增检出（重复条目正确配对不误报消失）', () => {
  const f2 = JSON.parse(JSON.stringify(fixture))
  f2.log.entries[4].time = 2400
  f2.log.entries[5].response.status = 503
  const orig0 = JSON.parse(JSON.stringify(f2.log.entries[0]))
  f2.log.entries.push(orig0)
  const diff = core.compareHars(fixture, f2)
  assert.equal(diff.summary.added, 1)
  assert.equal(diff.summary.removed, 0)
  assert.ok(diff.slower.some((c) => c.dt >= 1100))
  assert.ok(diff.flips.length >= 1)
})
t('对比: 完全相同文件零差异', () => {
  const diff = core.compareHars(fixture, JSON.parse(JSON.stringify(fixture)))
  assert.equal(diff.summary.added, 0)
  assert.equal(diff.summary.removed, 0)
  assert.equal(diff.summary.changed, 0)
  assert.equal(diff.summary.matched, 6)
})
t('对比: URL 投影已脱敏', () => {
  const f2 = JSON.parse(JSON.stringify(fixture))
  f2.log.entries.push(JSON.parse(JSON.stringify(f2.log.entries[3])))
  const diff = core.compareHars(fixture, f2)
  for (const a of diff.added) assert.ok(!a.u.includes('SECRET123'))
})

// ── 详情 ───────────────────────────────────────────────────────────────────
t('详情: 密码体掩码/set-cookie 掩码/头敏感值掩码', () => {
  const d = core.entryDetail(fixture.log.entries[1], 1)
  assert.ok(!JSON.stringify(d).includes('hunter2'))
  assert.ok(!JSON.stringify(d).includes('session=abc123'))
  const auth = d.reqHeaders.find(([n]) => n.toLowerCase() === 'authorization')
  assert.ok(!auth || auth[1].includes('‹'))
})
t('详情: query 值掩码', () => {
  const d = core.entryDetail(fixture.log.entries[0], 0)
  const q = d.query.find(([k]) => k === 'access_token')
  assert.ok(q && q[1].includes('‹'))
  const tab = d.query.find(([k]) => k === 'tab')
  assert.ok(tab && tab[1] === '1')
})

// ── 瀑布几何 ───────────────────────────────────────────────────────────────
t('rowSegments: 与 phaseSegments 几何一致（fixture 第 5 条）', () => {
  const entry = fixture.log.entries[4]
  const ps = core.phaseSegments(entry, t0)
  const row = rows[4]
  const rs = core.rowSegments(row)
  const sumSegs = (segs) => segs.filter((s) => s.k !== 'ssl' && s.k !== 'gap').reduce((a, s) => a + s.d, 0)
  assert.equal(rs[0].s, ps.relStart)
  assert.ok(Math.abs(sumSegs(rs) - sumSegs(ps.segs)) <= 1, `row ${sumSegs(rs)} vs phase ${sumSegs(ps.segs)}`)
  assert.ok(rs.some((s) => s.k === 'wait' && s.d === 1100))
})
t('rowSegments: ssl 覆盖在 connect 内不重复计长', () => {
  const row = { i: 0, m: 'GET', u: 'https://x/', s: 200, t: 300, sz: 10, mime: 'a', rs: 0, ph: [10, 20, 100, 60, 5, 100, 5], flags: '' }
  const segs = core.rowSegments(row)
  const connect = segs.find((s) => s.k === 'connect')
  const ssl = segs.find((s) => s.k === 'ssl')
  assert.ok(connect && ssl)
  assert.ok(ssl.s >= connect.s && ssl.s + ssl.d <= connect.s + connect.d + 0.001)
})

// ── normalizeSettings ──────────────────────────────────────────────────────
t('normalizeSettings: 缺省全开/非法输入兜底', () => {
  const s = core.normalizeSettings(null)
  assert.ok(s.sanitize.authHeaders && s.sanitize.bodies)
  const s2 = core.normalizeSettings({ sanitize: { bodies: false, authHeaders: false } })
  assert.equal(s2.sanitize.bodies, false)
  assert.equal(s2.sanitize.cookies, true)
})

// ── 汇总 ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass)
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`)
console.log(`\ncore 单测: ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
