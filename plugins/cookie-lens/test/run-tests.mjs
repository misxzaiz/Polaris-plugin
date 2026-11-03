/**
 * Cookie & CORS 调试台 core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零依赖。覆盖：Set-Cookie 解析 / 拒收级判定（SameSite=None 无 Secure、
 * __Host-/__Secure- 前缀、Domain 父域）/ Max-Age 优先级 / 默认路径 /
 * domain-match + path-match + Secure 通道匹配 / 请求 Cookie 头解析 /
 * 生成 round-trip / CORS 简单请求与预检判定（credentials 通配符失效、重复 ACAO）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cookies from '../shared/cookie-core.js'
import * as cors from '../shared/cors-core.js'

// ── cookie-core：Set-Cookie 解析 ───────────────────────────────────────────

test('parseSetCookie: 完整规范头解析 + scope', () => {
  const r = cookies.parseSetCookie('sid=abc123; Path=/; Domain=.example.com; Secure; HttpOnly; SameSite=None', 'https://api.example.com/v1/login')
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.cookie.name, 'sid')
  assert.equal(r.cookie.value, 'abc123')
  assert.equal(r.cookie.domain, 'example.com') // 前导点剥掉
  assert.equal(r.cookie.sameSite, 'None')
  assert.equal(r.verdict, 'accepted')
  assert.equal(r.scope.domain, 'example.com')
  assert.equal(r.scope.path, '/')
  assert.equal(r.scope.secure, true)
})

test('parseSetCookie: 值含 = 时首个 = 切分', () => {
  const r = cookies.parseSetCookie('token=a=b:c', 'https://x.com/')
  assert.ok(r.ok)
  assert.equal(r.cookie.name, 'token')
  assert.equal(r.cookie.value, 'a=b:c')
})

test('parseSetCookie: Set-Cookie: 前缀剥离', () => {
  const r = cookies.parseSetCookie('Set-Cookie: a=1', 'https://x.com/')
  assert.ok(r.ok)
  assert.equal(r.cookie.name, 'a')
})

test('parseSetCookie: SameSite=None 无 Secure → 拒收（Chrome M80 头号坑）', () => {
  const r = cookies.parseSetCookie('sid=abc; SameSite=None', 'https://api.example.com/')
  assert.ok(r.ok)
  assert.equal(r.verdict, 'rejected')
  const codes = r.findings.map((f) => f.code)
  assert.ok(codes.includes('SAMESITE_NONE_NO_SECURE'))
})

test('parseSetCookie: __Host- 前缀三连违规各自拒收', () => {
  const noSecure = cookies.parseSetCookie('__Host-sid=abc; Path=/', 'https://x.com/')
  assert.equal(noSecure.verdict, 'rejected')
  assert.ok(noSecure.findings.some((f) => f.code === 'HOST_PREFIX_NO_SECURE'))

  const withDomain = cookies.parseSetCookie('__Host-sid=abc; Path=/; Secure; Domain=x.com', 'https://x.com/')
  assert.equal(withDomain.verdict, 'rejected')
  assert.ok(withDomain.findings.some((f) => f.code === 'HOST_PREFIX_HAS_DOMAIN'))

  const badPath = cookies.parseSetCookie('__Host-sid=abc; Path=/app; Secure', 'https://x.com/')
  assert.equal(badPath.verdict, 'rejected')
  assert.ok(badPath.findings.some((f) => f.code === 'HOST_PREFIX_PATH'))

  const good = cookies.parseSetCookie('__Host-sid=abc; Path=/; Secure', 'https://x.com/')
  assert.equal(good.verdict, 'accepted')
})

test('parseSetCookie: __Secure- 前缀必须 Secure', () => {
  const bad = cookies.parseSetCookie('__Secure-sid=abc; Path=/', 'https://x.com/')
  assert.ok(bad.ok)
  assert.equal(bad.verdict, 'rejected')
  const good = cookies.parseSetCookie('__Secure-sid=abc; Path=/; Secure', 'https://x.com/')
  assert.equal(good.verdict, 'accepted')
})

test('parseSetCookie: Domain 非 host 父域 → 拒收（§5.3 step 6）', () => {
  const r = cookies.parseSetCookie('a=1; Domain=other.com', 'https://api.example.com/')
  assert.equal(r.verdict, 'rejected')
  assert.ok(r.findings.some((f) => f.code === 'DOMAIN_MISMATCH'))
  // 父域合法
  const ok1 = cookies.parseSetCookie('a=1; Domain=example.com', 'https://api.example.com/')
  assert.equal(ok1.verdict, 'accepted')
  // 后缀形似不是父域（evilexample.com ≠ example.com 的合法父域场景）
  const ok2 = cookies.parseSetCookie('a=1; Domain=evilexample.com', 'https://api.evilexample.com/')
  assert.equal(ok2.verdict, 'accepted')
})

test('parseSetCookie: 名称非法 token 字符 → 拒收', () => {
  const r = cookies.parseSetCookie('na me=1', 'https://x.com/')
  assert.equal(r.verdict, 'rejected')
  assert.ok(r.findings.some((f) => f.code === 'NAME_INVALID'))
})

test('parseSetCookie: Max-Age 优先于 Expires + 非法值整属性忽略', () => {
  const both = cookies.parseSetCookie('a=1; Max-Age=60; Expires=Wed, 21 Oct 2031 07:28:00 GMT', 'https://x.com/')
  assert.ok(both.findings.some((f) => f.code === 'MAX_AGE_WINS'))
  const bad = cookies.parseSetCookie('a=1; Max-Age=abc', 'https://x.com/')
  assert.ok(bad.findings.some((f) => f.code === 'MAX_AGE_INVALID'))
  assert.equal(bad.cookie.maxAge, null) // 整属性忽略，退化为会话 cookie
  assert.ok(bad.findings.some((f) => f.code === 'SESSION_COOKIE'))
})

test('parseSetCookie: 已过期 Expires → 删除语义 info', () => {
  const r = cookies.parseSetCookie('a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT', 'https://x.com/')
  assert.ok(r.findings.some((f) => f.code === 'EXPIRED'))
})

test('parseSetCookie: 默认路径 = 请求路径去末段', () => {
  const r = cookies.parseSetCookie('a=1', 'https://x.com/v1/users/42')
  assert.equal(r.scope.path, '/v1/users')
  const r2 = cookies.parseSetCookie('a=1', 'https://x.com/')
  assert.equal(r2.scope.path, '/')
})

test('parseSetCookie: Secure 在 http（非 localhost）下警告 + localhost 豁免', () => {
  const prod = cookies.parseSetCookie('a=1; Secure', 'http://api.example.com/')
  assert.ok(prod.findings.some((f) => f.code === 'SECURE_ON_HTTP'))
  assert.equal(prod.verdict, 'accepted') // 警告级不拒收（trustworthy 判定按浏览器实际）
  const dev = cookies.parseSetCookie('a=1; Secure', 'http://localhost:3000/')
  assert.ok(dev.findings.some((f) => f.code === 'SECURE_ON_LOCALHOST'))
  assert.ok(!dev.findings.some((f) => f.code === 'SECURE_ON_HTTP'))
})

test('parseSetCookie: 值含逗号历史坑 warn', () => {
  const r = cookies.parseSetCookie('a=1,2', 'https://x.com/')
  assert.ok(r.findings.some((f) => f.code === 'VALUE_COMMA'))
})

test('parseSetCookie: 非法输入如实报错', () => {
  assert.equal(cookies.parseSetCookie('', 'https://x.com/').ok, false)
  assert.equal(cookies.parseSetCookie('novalue', 'https://x.com/').ok, false)
  assert.equal(cookies.parseSetCookie('=leading', 'https://x.com/').ok, false)
  assert.equal(cookies.parseSetCookie('a=1', 'not-a-url').ok, false)
  assert.equal(cookies.parseSetCookie('a=1', '').ok, false)
})

test('parseSetCookie: 重复属性取首个 + 未知属性忽略', () => {
  const r = cookies.parseSetCookie('a=1; Path=/x; Path=/y; Unknown=zz', 'https://x.com/')
  assert.equal(r.cookie.path, '/x')
  assert.ok(r.findings.some((f) => f.code === 'ATTR_DUP'))
  assert.ok(r.findings.some((f) => f.code === 'ATTR_UNKNOWN'))
  assert.equal(r.verdict, 'accepted') // 未知属性不拒收
})

// ── cookie-core：匹配算法 ──────────────────────────────────────────────────

test('domainMatch: 精确/子域/后缀形似/IP', () => {
  assert.equal(cookies.domainMatch('example.com', 'example.com'), true)
  assert.equal(cookies.domainMatch('a.example.com', 'example.com'), true)
  assert.equal(cookies.domainMatch('a.b.example.com', 'example.com'), true)
  assert.equal(cookies.domainMatch('evilexample.com', 'example.com'), false)
  assert.equal(cookies.domainMatch('1example.com', 'example.com'), false)
  assert.equal(cookies.domainMatch('1.2.3.4', '2.3.4'), false) // IP 不做 domain-match
  assert.equal(cookies.domainMatch('a.example.com', 'other.com'), false)
})

test('pathMatch: 目录边界（/v1 不匹配 /v1x）', () => {
  assert.equal(cookies.pathMatch('/v1/users', '/v1'), true)
  assert.equal(cookies.pathMatch('/v1', '/v1'), true)
  assert.equal(cookies.pathMatch('/v1x', '/v1'), false)
  assert.equal(cookies.pathMatch('/', '/'), true)
  assert.equal(cookies.pathMatch('/anything', '/'), true)
  assert.equal(cookies.pathMatch('/a/b', '/a/b/'), false) // cookiePath 带尾斜杠要求目录形式
})

test('cookieMatchesUrl: 综合（域+路径+Secure 通道）', () => {
  const parsed = cookies.parseSetCookie('a=1; Domain=example.com; Path=/v1; Secure', 'https://api.example.com/v1/login')
  assert.ok(parsed.ok)
  const cookie = { scope: parsed.scope }
  assert.equal(cookies.cookieMatchesUrl(cookie, 'https://api.example.com/v1/orders').matches, true)
  assert.equal(cookies.cookieMatchesUrl(cookie, 'https://other.com/v1/orders').matches, false) // 域
  assert.equal(cookies.cookieMatchesUrl(cookie, 'https://api.example.com/v2/orders').matches, false) // 路径
  const noReasons = cookies.cookieMatchesUrl(cookie, 'http://api.example.com/v1/orders')
  assert.equal(noReasons.matches, false)
  assert.ok(noReasons.reasons.some((s) => s.includes('Secure')))
  // localhost 豁免
  const lh = cookies.parseSetCookie('a=1; Secure', 'http://localhost:3000/')
  assert.equal(cookies.cookieMatchesUrl({ scope: lh.scope }, 'http://localhost:3000/x').matches, true)
})

// ── cookie-core：请求 Cookie 头解析 ────────────────────────────────────────

test('parseRequestCookie: 多键展开 + 重复键诊断', () => {
  const r = cookies.parseRequestCookie('sid=abc; theme=dark; sid=xyz')
  assert.ok(r.ok)
  assert.equal(r.items.length, 3)
  assert.deepEqual(r.items.map((i) => i.name), ['sid', 'theme', 'sid'])
  assert.ok(r.findings.some((f) => f.code === 'DUP_NAME' && f.message.includes('sid')))
})

test('parseRequestCookie: 裸片段 / 空段 / Cookie: 前缀', () => {
  const r = cookies.parseRequestCookie('Cookie: a=1;; b; c=2')
  assert.ok(r.ok)
  assert.deepEqual(r.items, [{ name: 'a', value: '1' }, { name: 'c', value: '2' }])
  assert.ok(r.findings.some((f) => f.code === 'NO_EQUALS'))
  assert.ok(r.findings.some((f) => f.code === 'EMPTY_SEGMENT'))
})

// ── cookie-core：生成 round-trip ───────────────────────────────────────────

test('generateSetCookie: 基础生成 + round-trip 结构一致', () => {
  const r = cookies.generateSetCookie({
    name: 'sid', value: 'abc', domain: 'example.com', path: '/app',
    maxAge: 3600, secure: true, httpOnly: true, sameSite: 'Lax',
    requestUrl: 'https://api.example.com/app/login',
  })
  assert.ok(r.ok, JSON.stringify(r))
  assert.ok(r.header.includes('sid=abc'))
  assert.ok(r.header.includes('Max-Age=3600'))
  assert.ok(r.header.includes('Path=/app'))
  assert.ok(r.header.includes('Secure'))
  assert.ok(r.header.includes('HttpOnly'))
  assert.ok(r.header.includes('SameSite=Lax'))
  // round-trip：重解析产物逐字段一致
  const back = cookies.parseSetCookie(r.header, 'https://api.example.com/app/login')
  assert.ok(back.ok)
  assert.equal(back.cookie.name, 'sid')
  assert.equal(back.cookie.value, 'abc')
  assert.equal(back.cookie.domain, 'example.com')
  assert.equal(back.cookie.path, '/app')
  assert.equal(back.cookie.maxAge, 3600)
  assert.equal(back.verdict, 'accepted')
})

test('generateSetCookie: SameSite=None 缺省自动补 Secure（防手滑拒收）', () => {
  const r = cookies.generateSetCookie({ name: 'a', value: 'b', sameSite: 'None', requestUrl: 'https://x.com/' })
  assert.ok(r.ok)
  assert.ok(r.header.includes('SameSite=None'))
  assert.ok(r.header.includes('Secure'))
})

test('generateSetCookie: 非法输入如实报错（不静默修）', () => {
  assert.equal(cookies.generateSetCookie({ name: '', value: 'v' }).ok, false)
  assert.equal(cookies.generateSetCookie({ name: 'a b', value: 'v' }).ok, false)
  assert.equal(cookies.generateSetCookie({ name: 'a', value: 'x y' }).ok, false)
  assert.equal(cookies.generateSetCookie({ name: 'a', value: 'v', maxAge: 1.5 }).ok, false)
  assert.equal(cookies.generateSetCookie({ name: 'a', value: 'v', sameSite: 'AUTO' }).ok, false)
  assert.equal(cookies.generateSetCookie({ name: 'a', value: 'v', expires: 'tomorrow-ish' }).ok, false)
})

test('generateSetCookie: 删除 cookie 形态（Max-Age=0）', () => {
  const r = cookies.generateSetCookie({ name: 'sid', value: '', maxAge: 0, requestUrl: 'https://x.com/' })
  assert.ok(r.ok)
  assert.ok(r.header.includes('Max-Age=0'))
})

test('renderSetCookieReport: 拒收报告含拒收字样与诊断码', () => {
  const r = cookies.parseSetCookie('a=1; SameSite=None', 'https://x.com/')
  const text = cookies.renderSetCookieReport(r)
  assert.ok(text.includes('拒收'))
  assert.ok(text.includes('SAMESITE_NONE_NO_SECURE'))
  assert.ok(text.includes('生效范围'))
})

// ── cors-core ──────────────────────────────────────────────────────────────

const RES_OK = [{ name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' }]

test('judgeCors: 简单请求精确匹配 → pass', () => {
  const r = cors.judgeCors({ origin: 'https://app.example.com', method: 'GET', responseHeaders: RES_OK })
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.kind, 'simple')
  assert.equal(r.verdict, 'pass')
})

test('judgeCors: 无 ACAO → fail', () => {
  const r = cors.judgeCors({ origin: 'https://app.example.com', responseHeaders: [{ name: 'Content-Type', value: 'application/json' }] })
  assert.equal(r.verdict, 'fail')
  assert.ok(r.hints.some((h) => h.includes('Access-Control-Allow-Origin')))
})

test('judgeCors: ACAO=* 通配——无凭证过、带凭证挂（Fetch 标准）', () => {
  const anon = cors.judgeCors({ origin: 'https://app.example.com', responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] })
  assert.equal(anon.verdict, 'pass')
  const cred = cors.judgeCors({ origin: 'https://app.example.com', responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Credentials', value: 'true' }], withCredentials: true })
  assert.equal(cred.verdict, 'fail')
  assert.ok(cred.failReasons.some((s) => s.includes('通配符')))
})

test('judgeCors: origin 不匹配——子域不算、大小写不敏感命中', () => {
  const r = cors.judgeCors({ origin: 'https://api.example.com', responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' }] })
  assert.equal(r.verdict, 'fail')
  assert.ok(r.hints.some((h) => h.includes('精确串匹配')))
  const caseHit = cors.judgeCors({ origin: 'https://APP.example.com', responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' }] })
  assert.equal(caseHit.verdict, 'pass')
})

test('judgeCors: 重复 ACAO 按失败处理（网关+应用双写经典现场）', () => {
  const r = cors.judgeCors({
    origin: 'https://app.example.com',
    responseHeaders: [
      { name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' },
      { name: 'Access-Control-Allow-Origin', value: '*' },
    ],
  })
  assert.equal(r.verdict, 'fail')
  assert.ok(r.checks.some((c) => c.detail.includes('不会') && c.detail.includes('合并')))
})

test('judgeCors: ACAO=null 高危配置', () => {
  const r = cors.judgeCors({ origin: 'https://app.example.com', responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: 'null' }] })
  assert.equal(r.verdict, 'fail')
  assert.ok(r.hints.some((h) => h.includes('高危')))
})

test('needsPreflight: Authorization/JSON Content-Type 触发，text/plain 不触发', () => {
  assert.equal(cors.needsPreflight('GET', [{ name: 'Authorization', value: 'Bearer x' }]).needed, true)
  assert.equal(cors.needsPreflight('GET', [{ name: 'Content-Type', value: 'application/json' }]).needed, true)
  assert.equal(cors.needsPreflight('POST', [{ name: 'Content-Type', value: 'text/plain' }]).needed, false)
  assert.equal(cors.needsPreflight('PUT', []).needed, true)
  assert.equal(cors.needsPreflight('get', []).needed, false)
})

test('judgeCors: 预检 ACAM/ACAH 逐项核对 + credentials 通配失效', () => {
  const putOk = cors.judgeCors({
    origin: 'https://app.example.com', method: 'PUT',
    responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT' }],
  })
  assert.equal(putOk.kind, 'preflight')
  assert.equal(putOk.verdict, 'pass')

  const putBad = cors.judgeCors({
    origin: 'https://app.example.com', method: 'DELETE',
    responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST' }],
  })
  assert.equal(putBad.verdict, 'fail')
  assert.ok(putBad.failReasons.some((s) => s.includes('DELETE')))

  // credentials 下 ACAH:* 不通配
  const authHdr = [{ name: 'Authorization', value: 'Bearer x' }]
  const starCred = cors.judgeCors({
    origin: 'https://app.example.com', method: 'POST', requestHeaders: authHdr, withCredentials: true,
    responseHeaders: [
      { name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' },
      { name: 'Access-Control-Allow-Credentials', value: 'true' },
      { name: 'Access-Control-Allow-Methods', value: 'POST' },
      { name: 'Access-Control-Allow-Headers', value: '*' },
    ],
  })
  assert.equal(starCred.verdict, 'fail')
  assert.ok(starCred.failReasons.some((s) => s.includes('Authorization')))

  // 无凭证 ACAH:* 通配有效
  const starAnon = cors.judgeCors({
    origin: 'https://app.example.com', method: 'POST', requestHeaders: authHdr,
    responseHeaders: [
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Methods', value: 'POST' },
      { name: 'Access-Control-Allow-Headers', value: '*' },
    ],
  })
  assert.equal(starAnon.verdict, 'pass')
})

test('judgeCors: 预检显式指定时缺 ACAM 判 fail', () => {
  const r = cors.judgeCors({ origin: 'https://app.example.com', method: 'PUT', preflight: true, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] })
  assert.equal(r.verdict, 'fail')
  assert.ok(r.failReasons.includes('无 ACAM'))
})

test('judgeCors: credentials 全套通过', () => {
  const r = cors.judgeCors({
    origin: 'https://app.example.com', withCredentials: true,
    responseHeaders: [
      { name: 'Access-Control-Allow-Origin', value: 'https://app.example.com' },
      { name: 'Access-Control-Allow-Credentials', value: 'true' },
    ],
  })
  assert.equal(r.verdict, 'pass')
})

test('judgeCors: 非法输入如实报错', () => {
  assert.equal(cors.judgeCors({}).ok, false)
  assert.equal(cors.judgeCors({ origin: 'not-a-origin', responseHeaders: [] }).ok, false)
  assert.equal(cors.judgeCors(null).ok, false)
})

test('generateCorsAdvice: 预检场景给全 ACAM/ACAH + Vary', () => {
  const r = cors.generateCorsAdvice({
    origin: 'https://app.example.com', method: 'PATCH',
    requestHeaders: [{ name: 'Authorization', value: 'Bearer x' }, { name: 'X-Trace', value: '1' }],
  })
  assert.ok(r.ok)
  assert.ok(r.advice.includes('Access-Control-Allow-Methods: PATCH'))
  assert.ok(r.advice.includes('Authorization, X-Trace'))
  assert.ok(r.advice.includes('Vary: Origin'))
  const simple = cors.generateCorsAdvice({ origin: 'https://app.example.com' })
  assert.ok(simple.advice.includes('简单请求'))
})

test('renderCorsReport: 失败报告含检查表与建议', () => {
  const r = cors.judgeCors({ origin: 'https://app.example.com', responseHeaders: [] })
  const text = cors.renderCorsReport(r)
  assert.ok(text.includes('拦截'))
  assert.ok(text.includes('修复建议'))
})

// ── 面板 SSR 渲染断言 ──────────────────────────────────────────────────────
// 纪律（坑清单实证）：esbuild 必须 --external:react 防双实例；测试 bundle 输出到
// 插件目录内 .ssr-tmp/（不能落系统 tmpdir——require('react') 会向上命中杂散
// node_modules 双实例）；清理用固定目录名 + 顶部级重试（EPERM 窗口）。

test('面板 SSR 渲染：三页签与判定产物可渲染', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const pluginRoot = path.join(here, '..')
  const ssrDir = path.join(pluginRoot, '.ssr-tmp')
  fs.rmSync(ssrDir, { recursive: true, force: true })
  fs.mkdirSync(ssrDir, { recursive: true })
  try {
    const { build } = await import('esbuild')
    const outPath = path.join(ssrDir, 'panel.cjs')
    await build({
      entryPoints: [path.join(pluginRoot, 'src', 'index.tsx')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: outPath,
      jsx: 'automatic',
      external: ['react', 'react/jsx-runtime'],
      logLevel: 'silent',
    })
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const React = require('react')
    const { renderToString } = require('react-dom/server')
    const mod = require(outPath)
    const html = renderToString(React.createElement(mod.default, {}))
    assert.ok(html.includes('Cookie'), '标题缺失')
    assert.ok(html.includes('Set-Cookie 解析'), '页签 1 缺失')
    assert.ok(html.includes('CORS 判定'), '页签 3 缺失')
    assert.ok(html.includes('解析诊断'), '动作按钮缺失')
  } finally {
    // 固定目录名 + 重试清理（Windows 刚写入文件句柄秒级延迟，force 只豁免 ENOENT）
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(ssrDir, { recursive: true, force: true }); break } catch (_) { await new Promise((r) => setTimeout(r, 200)) }
    }
  }
})
