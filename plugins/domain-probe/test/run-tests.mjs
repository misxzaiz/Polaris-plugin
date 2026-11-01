// 域名诊断台核心单测：node test/run-tests.mjs（零依赖零 mock，行为级断言）
import assert from 'node:assert'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const core = require('../shared/domain-core.js')

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) }
  catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

// ── 域名规范化 ───────────────────────────────────────────────────────────────
t('normalize: 去 scheme/路径/端口/末尾点/大写', () => {
  assert.equal(core.normalizeDomain('HTTPS://Example.COM/path?q=1#x').domain, 'example.com')
  assert.equal(core.normalizeDomain('example.com.:8443').domain, 'example.com')
  assert.equal(core.normalizeDomain('user@mail.example.com').domain, 'mail.example.com')
})
t('normalize: 非法输入给出人话 reason', () => {
  assert.equal(core.normalizeDomain('').ok, false)
  assert.equal(core.normalizeDomain('例 子.com').ok, false)
  assert.equal(core.normalizeDomain('中文域名.cn').ok, false)  // v0.1 诚实不支持，要求 punycode
  assert.equal(core.normalizeDomain('a..b.com').ok, false)
  assert.equal(core.normalizeDomain('-bad.com').ok, false)
})
t('normalize: 单标签主机名给 warn 但放行', () => {
  const r = core.normalizeDomain('myserver')
  assert.equal(r.ok, true)
  assert.ok(r.warn.includes('完整域名'))
})

// ── 安全守卫 ────────────────────────────────────────────────────────────────
t('guard: 拒绝环回/IP字面量/内网后缀', () => {
  assert.equal(core.isDiagnosticsSafeHost('localhost').ok, false)
  assert.equal(core.isDiagnosticsSafeHost('192.168.1.1').ok, false)
  assert.equal(core.isDiagnosticsSafeHost('::1').ok, false)
  assert.equal(core.isDiagnosticsSafeHost('nas.local').ok, false)
  assert.equal(core.isDiagnosticsSafeHost('metadata.google.internal').ok, false)
  assert.equal(core.isDiagnosticsSafeHost('example.com').ok, true)
})
t('guard: isPrivateAnswerIp 覆盖私网/CGNAT/元数据/映射v6', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.9', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1']) {
    assert.equal(core.isPrivateAnswerIp(ip), true, ip)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1', '172.32.0.1', '100.128.0.1']) {
    assert.equal(core.isPrivateAnswerIp(ip), false, ip)
  }
})

// ── DoH 归一 ────────────────────────────────────────────────────────────────
t('parseDoh: alidns 形态 A 记录', () => {
  const p = core.parseDohResponse({
    Status: 0, AD: false,
    Answer: [
      { name: 'example.com.', TTL: 246, type: 1, data: '104.20.23.154' },
      { name: 'example.com.', TTL: 246, type: 1, data: '172.66.147.243' },
    ],
  })
  assert.equal(p.status, 0)
  assert.deepEqual(core.answerSet(p, 'A'), ['104.20.23.154', '172.66.147.243'])
})
t('parseDoh: TXT 分段拼接去引号 + MX 尾点归一 + CAA 保留原文', () => {
  const p = core.parseDohResponse({
    Status: 0,
    Answer: [
      { name: 'x.com.', type: 16, TTL: 60, data: '"v=spf1 " "include:_spf.x.com " "~all"' },
      { name: 'x.com.', type: 15, TTL: 600, data: '10 mxbiz1.qq.com.' },
      { name: 'x.com.', type: 257, TTL: 3600, data: '0 issue "letsencrypt.org"' },
    ],
  })
  assert.equal(p.answers[0].data, 'v=spf1 include:_spf.x.com ~all')
  assert.equal(p.answers[1].data, 'mxbiz1.qq.com')
  assert.equal(p.answers[2].raw, '0 issue "letsencrypt.org"')
  assert.equal(p.answers[2].type, 257)
})
t('parseDoh: 缺 Status 抛错；NXDOMAIN 中文语义', () => {
  assert.throws(() => core.parseDohResponse({ Answer: [] }))
  const p = core.parseDohResponse({ Status: 3 })
  assert.ok(p.statusCn.includes('NXDOMAIN'))
})
t('resolveType: 字符串/数字/大小写/非法', () => {
  assert.deepEqual(core.resolveType('mx'), { num: 15, name: 'MX' })
  assert.deepEqual(core.resolveType(257), { num: 257, name: 'CAA' })
  assert.deepEqual(core.resolveType('txt'), { num: 16, name: 'TXT' })
  assert.equal(core.resolveType('BOGUS'), null)
  assert.equal(core.resolveType(null).name, 'A')
})

// ── SPF 解析与计数 ──────────────────────────────────────────────────────────
t('findSpf: 识别多条 SPF', () => {
  const recs = core.findSpfRecords(['v=spf1 -all', 'v=spf1 include:x.com ~all', 'v=DMARC1; p=none', 'hello'])
  assert.equal(recs.length, 2)
})
t('parseSpf: 限定符/机制/修饰符结构', () => {
  const p = core.parseSpfRecord('v=spf1 ip4:1.2.3.0/24 ip6:2001:db8::/32 include:_spf.google.com ~all redirect=_spf2.x.com exp=explain.x.com')
  assert.equal(p.ok, true)
  const names = p.terms.map((t) => `${t.kind === 'modifier' ? '' : t.qualifier}${t.name}`)
  assert.deepEqual(names, ['+ip4', '+ip6', '+include', '~all', 'redirect', 'exp'])
})
t('parseSpf: 语法错误（坏 ip4/未知机制/缺参数/all 带参数）', () => {
  const p = core.parseSpfRecord('v=spf1 ip4:999.1.2.3 include bogus:thing all:x unknown=1 ~all')
  assert.equal(p.ok, false)
  assert.ok(p.errors.some((e) => e.includes('ip4')))
  assert.ok(p.errors.some((e) => e.includes('include')))
  assert.ok(p.errors.some((e) => e.includes('all')))
})
t('parseSpf: 空记录警告（等价 +all）', () => {
  const p = core.parseSpfRecord('v=spf1')
  assert.equal(p.ok, true)
  assert.ok(p.warnings[0].includes('+all'))
})
t('spfLookup: RFC 7208 §4.6.4 计数（include/a/mx/ptr/exists/redirect 各 1）', () => {
  const terms = []
  for (const m of ['include:_a.com', 'a', 'mx:mx.com', 'ptr', 'exists:hop.com']) terms.push({ kind: 'mechanism', qualifier: '+', name: m.split(':')[0], value: m.split(':')[1] || '', raw: m })
  terms.push({ kind: 'modifier', qualifier: '', name: 'redirect', value: '_x.com', raw: 'redirect=_x.com' })
  const lk = core.spfLookupCount(terms)
  assert.equal(lk.count, 6)
  assert.equal(lk.overLimit, false)
})
t('spfLookup: 超 10 次与恰好 10 次分级', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'mechanism', qualifier: '+', name: 'include', value: `x${i}.com`, raw: `include:x${i}.com` }))
  assert.equal(core.spfLookupCount(mk(11)).overLimit, true)
  assert.equal(core.spfLookupCount(mk(10)).atLimit, true)
  assert.equal(core.spfLookupCount(mk(9)).overLimit, false)
})
t('spfFindings: 有 MX 无 SPF=黄 / 有 A 无 SPF=info / 全无=info', () => {
  assert.equal(core.spfFindings({ records: [], mxPresent: true, hasA: true, parse: null })[0].sev, 'yellow')
  assert.equal(core.spfFindings({ records: [], mxPresent: false, hasA: true, parse: null })[0].sev, 'info')
  assert.equal(core.spfFindings({ records: [], mxPresent: false, hasA: false, parse: null })[0].sev, 'info')
})
t('spfFindings: 多条记录=红 / 无 all=红 / +all=红 / ?all=黄 / ~all=info / -all=绿', () => {
  const multi = core.spfFindings({ records: ['v=spf1 -all', 'v=spf1 ~all'], parse: core.parseSpfRecord('v=spf1 -all') })
  assert.ok(multi.some((f) => f.code === 'spf.multiple' && f.sev === 'red'))
  const mk = (rec) => core.spfFindings({ records: [rec], parse: core.parseSpfRecord(rec) })
  assert.ok(mk('v=spf1 ip4:1.2.3.4').some((f) => f.code === 'spf.no-all' && f.sev === 'red'))
  assert.ok(mk('v=spf1 +all').some((f) => f.code === 'spf.plus-all' && f.sev === 'red'))
  assert.ok(mk('v=spf1 ?all').some((f) => f.code === 'spf.neutral-all' && f.sev === 'yellow'))
  assert.ok(mk('v=spf1 ~all').some((f) => f.code === 'spf.softfail' && f.sev === 'info'))
  assert.ok(mk('v=spf1 -all').some((f) => f.code === 'spf.strict' && f.sev === 'green'))
})
t('spfFindings: 超/达上限与 ptr/redirect 组合提示', () => {
  const heavy = Array.from({ length: 11 }, (_, i) => `include:x${i}.com`).join(' ')
  const p = core.parseSpfRecord(`v=spf1 ${heavy} ptr redirect=_y.com -all`)
  const fs = core.spfFindings({ records: [heavy], parse: p })
  assert.ok(fs.some((f) => f.code === 'spf.lookup-over' && f.sev === 'red'))
  assert.ok(fs.some((f) => f.code === 'spf.ptr' && f.sev === 'info'))
  assert.ok(fs.some((f) => f.code === 'spf.redirect-shortcut' && f.sev === 'info'))
})

// ── DMARC ───────────────────────────────────────────────────────────────────
t('parseDmarc: 标准记录 / 未知标签 / 重复标签 / 坏 pct', () => {
  const ok = core.parseDmarcRecord('v=DMARC1; p=quarantine; rua=mailto:a@x.com; adkim=s; pct=50')
  assert.equal(ok.tags.p, 'quarantine')
  assert.deepEqual(ok.unknown, [])
  const bad = core.parseDmarcRecord('v=DMARC1; p=none; p=reject; pct=200; foo=1; badtag')
  assert.ok(bad.errors.some((e) => e.includes('重复')))
  assert.ok(bad.errors.some((e) => e.includes('pct')))
  assert.ok(bad.unknown.includes('foo'))
  assert.ok(bad.errors.some((e) => e.includes('badtag')))
  // 裸 v=DMARC1（无 p）是「可解析但不合法」的记录——交给 findings 层报 no-p 红
  const bare = core.parseDmarcRecord('v=DMARC1')
  assert.equal(bare.tags.v, 'DMARC1')
  assert.ok(core.dmarcFindings({ record: bare, isSubdomain: false }).some((f) => f.code === 'dmarc.no-p' && f.sev === 'red'))
})
t('parseDmarc: 非 DMARC1 返回 null', () => {
  assert.equal(core.parseDmarcRecord('v=spf1 -all'), null)
})
t('dmarcFindings: 缺记录黄 / p=none 黄 / quarantine·reject 绿 / 无 rua 黄 / 子域继承 info', () => {
  assert.equal(core.dmarcFindings({ record: null, isSubdomain: false })[0].sev, 'yellow')
  const none = core.dmarcFindings({ record: core.parseDmarcRecord('v=DMARC1; p=none'), isSubdomain: false })
  assert.ok(none.some((f) => f.code === 'dmarc.p-none' && f.sev === 'yellow'))
  assert.ok(none.some((f) => f.code === 'dmarc.no-rua' && f.sev === 'yellow'))
  const q = core.dmarcFindings({ record: core.parseDmarcRecord('v=DMARC1; p=quarantine; rua=mailto:a@x.com'), isSubdomain: false })
  assert.ok(q.some((f) => f.code === 'dmarc.p-quarantine' && f.sev === 'green'))
  const r = core.dmarcFindings({ record: core.parseDmarcRecord('v=DMARC1; p=reject; rua=mailto:a@x.com'), isSubdomain: false })
  assert.ok(r.some((f) => f.code === 'dmarc.p-reject' && f.sev === 'green'))
  const inh = core.dmarcFindings({ record: null, isSubdomain: true, orgRecord: { tags: { p: 'reject' } } })
  assert.equal(inh[0].sev, 'info')
})

// ── DKIM ────────────────────────────────────────────────────────────────────
t('parseDkim: 有效/撤销/缺 p', () => {
  const ok = core.parseDkimRecord('v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQ')
  assert.equal(ok.hasPubKey, true)
  const rev = core.parseDkimRecord('v=DKIM1; p=')
  assert.equal(rev.revoked, true)
  const broken = core.parseDkimRecord('v=DKIM1; k=rsa')
  assert.ok(broken.errors.length >= 1)
})
t('dkimFindings: 全未找到=info / 找到=绿 / 撤销与残缺=黄', () => {
  assert.equal(core.dkimFindings([{ selector: 'google', found: false }])[0].sev, 'info')
  const fs = core.dkimFindings([
    { selector: 'google', found: true, record: core.parseDkimRecord('v=DKIM1; p=AAAa+/=') },
    { selector: 'k1', found: true, record: core.parseDkimRecord('v=DKIM1; p=') },
    { selector: 's1', found: true, record: core.parseDkimRecord('v=DKIM1; k=rsa') },
  ])
  assert.ok(fs.some((f) => f.code === 'dkim.found' && f.sev === 'green'))
  assert.ok(fs.some((f) => f.code === 'dkim.revoked' && f.sev === 'yellow'))
  assert.ok(fs.some((f) => f.code === 'dkim.record-broken' && f.sev === 'yellow'))
})
t('dkimFindings: 通配撤销声明（example.com 实测模式）收成单条 info 不刷 18 黄', () => {
  const revokedRecord = core.parseDkimRecord('v=DKIM1; p=')
  const probed = ['google', 'default', 'selector1', '20230601'].map((sel) => ({ selector: sel, found: true, record: revokedRecord }))
  const fs = core.dkimFindings(probed)
  assert.equal(fs.length, 1, `应只收一条，实际 ${fs.length}`)
  assert.equal(fs[0].code, 'dkim.wildcard-revoked')
  assert.equal(fs[0].sev, 'info')
  assert.ok(fs[0].title.includes('4 个'))
  // 混合形态（有有效有撤销）不适用通配归并，逐条报
  const mixed = core.dkimFindings([
    { selector: 'google', found: true, record: core.parseDkimRecord('v=DKIM1; p=AAAa') },
    { selector: 'k1', found: true, record: core.parseDkimRecord('v=DKIM1; p=') },
    { selector: 's1', found: true, record: core.parseDkimRecord('v=DKIM1; p=') },
  ])
  assert.ok(mixed.some((f) => f.code === 'dkim.revoked' && f.sev === 'yellow'))
  assert.ok(mixed.some((f) => f.code === 'dkim.found' && f.sev === 'green'))
})

// ── MX ──────────────────────────────────────────────────────────────────────
t('mxFindings: null MX 优先 / 无MX+A=info / IP字面量=红 / 重复=info', () => {
  const nm = core.mxFindings({ answers: [{ data: '.', ttl: 60 }], hasA: false })
  assert.ok(nm.some((f) => f.code === 'mx.null' && f.sev === 'green'))
  assert.equal(core.mxFindings({ answers: [], hasA: true })[0].code, 'mx.fallback-a')
  assert.equal(core.mxFindings({ answers: [], hasA: false })[0].code, 'mx.none')
  const ip = core.mxFindings({ answers: [{ data: '10.0.0.1', ttl: 60 }], hasA: false })
  assert.ok(ip.some((f) => f.code === 'mx.ip-literal' && f.sev === 'red'))
  const dup = core.mxFindings({ answers: [{ data: 'mx1.x.com' }, { data: 'mx1.x.com' }], hasA: false })
  assert.ok(dup.some((f) => f.code === 'mx.dup' && f.sev === 'info'))
})

// ── 证书 ────────────────────────────────────────────────────────────────────
const DAY = 86400000
function fakeCert(daysLeft, { cn = 'example.com', sans, selfSign = false, authErr = '', chain = 2 } = {}) {
  const to = new Date(Date.now() + daysLeft * DAY)
  const from = new Date(Date.now() - 30 * DAY)
  const issuerCn = selfSign ? cn : 'R3'
  const effChain = selfSign ? 1 : chain
  return {
    subject: { CN: cn }, issuer: { CN: issuerCn },
    valid_from: from.toUTCString(), valid_to: to.toUTCString(),
    subjectaltname: sans ? sans.map((s) => `DNS:${s}`).join(', ') : `DNS:${cn}`,
    issuerCertificate: effChain > 1 ? { fingerprint: 'aa', subject: { CN: 'ISRG Root X1' } } : undefined,
    fingerprint: 'ff',
  }
}
t('shapeCert: 字段整形/SAN通配覆盖/天数', () => {
  const c = core.shapeCertInfo(fakeCert(60, { sans: ['*.example.com', 'example.org'] }), 'www.example.com', 'TLSv1.3', '')
  assert.equal(c.daysLeft >= 59 && c.daysLeft <= 61, true)
  assert.equal(c.coversDomain, true)
  assert.equal(c.chainLength, 2)
  assert.equal(c.selfSigned, false)
})
t('certFindings: 过期红/13天红/30天黄/90天绿', () => {
  assert.ok(core.certFindings(core.shapeCertInfo(fakeCert(-1), 'example.com', 'TLSv1.2', ''), 'example.com').some((f) => f.code === 'cert.expired'))
  assert.ok(core.certFindings(core.shapeCertInfo(fakeCert(10), 'example.com', 'TLSv1.2', ''), 'example.com').some((f) => f.code === 'cert.expire-soon'))
  assert.ok(core.certFindings(core.shapeCertInfo(fakeCert(25), 'example.com', 'TLSv1.2', ''), 'example.com').some((f) => f.code === 'cert.expire-window'))
  assert.ok(core.certFindings(core.shapeCertInfo(fakeCert(90), 'example.com', 'TLSv1.2', ''), 'example.com').some((f) => f.code === 'cert.valid' && f.sev === 'green'))
})
t('certFindings: SAN 不含=红 / 自签=红 / 链校验失败=黄', () => {
  const c1 = core.shapeCertInfo(fakeCert(90, { sans: ['other.com'] }), 'example.com', 'TLSv1.2', '')
  assert.ok(core.certFindings(c1, 'example.com').some((f) => f.code === 'cert.san-mismatch' && f.sev === 'red'))
  const c2 = core.shapeCertInfo(fakeCert(90, { selfSign: true }), 'example.com', 'TLSv1.2', '')
  assert.ok(core.certFindings(c2, 'example.com').some((f) => f.code === 'cert.self-signed' && f.sev === 'red'))
  const c3 = core.shapeCertInfo(fakeCert(90, { authErr: 'SELF_SIGNED_CERT_IN_CHAIN' }), 'example.com', 'TLSv1.2', 'SELF_SIGNED_CERT_IN_CHAIN')
  assert.ok(core.certFindings(c3, 'example.com').some((f) => f.code === 'cert.verify-fail' && f.sev === 'yellow'))
})

// ── CAA / DNSSEC / NS / 地址 ────────────────────────────────────────────────
t('caa/dnssec/nssoa/apex 各档位', () => {
  assert.equal(core.caaFindings([])[0].sev, 'info')
  assert.equal(core.caaFindings([{ raw: '0 issue "letsencrypt.org"', type: 257, data: '' }])[0].sev, 'green')
  assert.equal(core.dnssecFindings({ answers: [{ type: 43, data: '2371 13 2 ABC', raw: '2371 13 2 ABC' }] })[0].sev, 'green')
  assert.equal(core.dnssecFindings({ answers: [] })[0].sev, 'info')
  assert.ok(core.nsSoaFindings({ status: 3, statusCn: 'NXDOMAIN（域名不存在）', answers: [] }, null).some((f) => f.code === 'dns.no-ns' && f.sev === 'red'))
  assert.ok(core.nsSoaFindings({ status: 0, answers: [{ data: 'a.ns.cloudflare.com', type: 2 }] }, { status: 0, answers: [] }).some((f) => f.code === 'dns.no-soa' && f.sev === 'yellow'))
  const apex = core.apexAddressFindings({ answers: [] }, { answers: [] })
  assert.ok(apex.findings[0].sev === 'yellow' && apex.hasA === false)
  const apex2 = core.apexAddressFindings({ answers: [{ type: 1, data: '1.2.3.4' }] }, { answers: [] })
  assert.equal(apex2.hasA, true)
})

// ── 评分与 diff ─────────────────────────────────────────────────────────────
t('computeScore: 红黄扣分/下限0/档位话术', () => {
  const fs = [core.F('red', 'a', 'x', '', ''), core.F('red', 'b', 'x', '', ''), core.F('yellow', 'c', 'x', '', '')]
  const s = core.computeScore(fs)
  assert.equal(s.total, 100 - 28 - 5)
  assert.equal(core.computeScore(Array(10).fill(0).map((_, i) => core.F('red', `r${i}`, 'x', '', ''))).total, 0)
  assert.ok(core.verdictOf(90).tone === 'good')
  assert.ok(core.verdictOf(75).tone === 'ok')
  assert.ok(core.verdictOf(55).tone === 'warn')
  assert.ok(core.verdictOf(10).tone === 'bad')
})
t('sortFindings: red 在前 / diffResolvers: 一致/分歧/不可达', () => {
  const sorted = core.sortFindings([core.F('green', 'g', '', '', ''), core.F('red', 'r', '', '', ''), core.F('yellow', 'y', '', '', '')])
  assert.deepEqual(sorted.map((f) => f.sev), ['red', 'yellow', 'green'])
  const per = (answers) => answers.map((a) => ({ resolver: a.id, ok: true, status: 0, answers: a.ans }))
  const same = core.diffResolvers(per([
    { id: 'alidns', ans: [{ typeName: 'A', data: '1.2.3.4', ttl: 60 }] },
    { id: 'google', ans: [{ typeName: 'A', data: '1.2.3.4', ttl: 120 }] },
  ]))
  assert.equal(same.consistent, true)
  const split = core.diffResolvers(per([
    { id: 'alidns', ans: [{ typeName: 'A', data: '1.2.3.4', ttl: 60 }] },
    { id: 'google', ans: [{ typeName: 'A', data: '5.6.7.8', ttl: 120 }] },
  ]))
  assert.equal(split.consistent, false)
  assert.equal(split.groups.length, 2)
  const down = core.diffResolvers([{ resolver: 'google', ok: false, error: 'timeout' }, { resolver: 'alidns', ok: true, status: 0, answers: [{ typeName: 'A', data: '1.2.3.4' }] }])
  assert.equal(down.consistent, true)
  assert.deepEqual(down.unreachable, [{ id: 'google', error: 'timeout' }])
})
t('summarizeReport: 单行含分与色计数', () => {
  const rep = { kind: 'full', domain: 'example.com', score: { total: 72 }, counts: { red: 1, yellow: 2, info: 0, green: 5 }, finishedAt: '2026-11-02T10:00:00Z' }
  const line = core.summarizeReport(rep)
  assert.ok(line.includes('example.com') && line.includes('72分') && line.includes('红1'))
})

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
process.exit(bad.length ? 1 : 0)
