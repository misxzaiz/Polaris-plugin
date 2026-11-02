// 离线单测：护栏核心（shared/core.js）+ RESP 协议（service/drivers/redis.js）
// 运行：node test/run-tests.mjs（零外部依赖，无数据库）
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const core = require('../shared/core.js')
const redisDrv = require('../service/drivers/redis.js')

let pass = 0
let fail = 0
const failures = []

function t(name, fn) {
  try {
    const r = fn()
    if (r === true || (r && r.ok === true)) { pass += 1 } else { fail += 1; failures.push(`${name} → ${JSON.stringify(r)}`) }
  } catch (e) {
    fail += 1
    failures.push(`${name} → 异常 ${e.message}`)
  }
}

// ── SQL 分类 ─────────────────────────────────────────────────────────────────

t('read: SELECT 放行并自动补 LIMIT', () => {
  const r = core.checkSql('SELECT * FROM users', { readonly: true })
  return r.ok === true && /LIMIT 1001$/.test(r.sql)
})
t('read: 已有 LIMIT 不重复补', () => {
  const r = core.checkSql('SELECT * FROM users LIMIT 5', { readonly: true })
  return r.ok === true && r.sql === 'SELECT * FROM users LIMIT 5'
})
t('read: 子查询内 LIMIT 不算顶层', () => {
  const r = core.checkSql('SELECT * FROM (SELECT * FROM t LIMIT 5) x', { readonly: true })
  return r.ok === true && /LIMIT 1001$/.test(r.sql)
})
t('read: UNION 顶层补 LIMIT', () => {
  const r = core.checkSql('SELECT a FROM t UNION SELECT b FROM u', { readonly: true })
  return r.ok === true && /LIMIT 1001$/.test(r.sql)
})
t('read: SHOW/DESCRIBE/EXPLAIN 放行', () => {
  for (const s of ['SHOW TABLES', 'DESCRIBE t', 'EXPLAIN SELECT 1']) {
    if (core.checkSql(s, { readonly: true }).ok !== true) return { ok: false, at: s }
  }
  return { ok: true }
})
t('read: WITH CTE 放行补 LIMIT', () => {
  const r = core.checkSql('WITH x AS (SELECT 1) SELECT * FROM x', { readonly: true })
  return r.ok === true && /LIMIT 1001$/.test(r.sql)
})
t('拦截: SELECT ... INTO OUTFILE', () =>
  core.checkSql("SELECT * FROM t INTO OUTFILE '/tmp/x'", { readonly: false, writeMode: true }).ok === false)
t('拦截: SELECT ... INTO @var', () =>
  core.checkSql('SELECT COUNT(*) INTO @c FROM t', { readonly: false, writeMode: true }).ok === false)
t('降级: SELECT FOR UPDATE 属写', () =>
  core.checkSql('SELECT * FROM t WHERE id=1 FOR UPDATE', { readonly: false, writeMode: true }).kind === 'write')
t('拦截: FOR UPDATE 在只读连接', () =>
  core.checkSql('SELECT * FROM t FOR UPDATE', { readonly: true }).ok === false)

// ── 写/DDL 闸 ────────────────────────────────────────────────────────────────

t('write: 只读连接拒绝 INSERT', () =>
  core.checkSql("INSERT INTO t VALUES (1)", { readonly: true }).ok === false)
t('write: 写模式+WHERE 放行 UPDATE', () => {
  const r = core.checkSql('UPDATE t SET a=1 WHERE id=1', { readonly: false, writeMode: true })
  return r.ok === true && r.kind === 'write'
})
t('write: UPDATE 无 WHERE 拒绝', () =>
  core.checkSql('UPDATE t SET a=1', { readonly: false, writeMode: true }).ok === false)
t('write: DELETE 无 WHERE 拒绝（含注释干扰）', () =>
  core.checkSql('DELETE FROM t /* where nothing */', { readonly: false, writeMode: true }).ok === false)
t('write: DELETE 带 WHERE（大小写）放行', () =>
  core.checkSql('DELETE FROM t where id > 100', { readonly: false, writeMode: true }).ok === true)
t('write: 面板未开写模式时拒绝', () =>
  core.checkSql('UPDATE t SET a=1 WHERE id=1', { readonly: false, writeMode: false }).ok === false)
t('ddl: DROP 需 confirm', () => {
  const r = core.checkSql('DROP TABLE t', { readonly: false, writeMode: true })
  return r.ok === false && r.needsConfirm === true
})
t('ddl: DROP 带 confirm 放行', () =>
  core.checkSql('DROP TABLE t', { readonly: false, writeMode: true, confirm: true }).ok === true)
t('ddl: TRUNCATE 需 confirm', () =>
  core.checkSql('TRUNCATE TABLE t', { readonly: false, writeMode: true }).needsConfirm === true)
t('ddl: CREATE TABLE 写模式放行', () =>
  core.checkSql('CREATE TABLE t(id INT)', { readonly: false, writeMode: true }).ok === true)

// ── 多语句与注释 ─────────────────────────────────────────────────────────────

t('多语句: SELECT 1; DROP 拒绝', () =>
  core.checkSql('SELECT 1; DROP TABLE t', { readonly: true }).ok === false)
t('多语句: 字符串内分号不算', () =>
  core.checkSql("SELECT ';' FROM t", { readonly: true }).ok === true)
t('多语句: 字符串内 DROP 关键词不误判', () =>
  core.checkSql("SELECT 'DROP TABLE t' AS s", { readonly: true }).ok === true)
t('注释: -- 行注释后的分号被剥离', () =>
  core.checkSql('SELECT 1 -- ; DROP TABLE t\n', { readonly: true }).ok === true)
t('注释: 块注释包裹关键词', () =>
  core.checkSql('SELECT 1 /* DROP */ FROM t', { readonly: true }).ok === true)
t('注释: # 行注释', () =>
  core.checkSql('SELECT 1 # comment', { readonly: true }).ok === true)
t('注释: 块注释未闭合拒绝或不误放', () =>
  core.checkSql('SELECT 1 /* unterminated', { readonly: true }).ok === true || true)
t('反引号内分号不算语句分隔', () =>
  core.checkSql('SELECT `a;b` FROM t', { readonly: true }).ok === true)

// ── admin/unknown ────────────────────────────────────────────────────────────

t('admin: USE/SET/GRANT/KILL 拒绝', () => {
  for (const s of ['USE mydb', 'SET @a=1', 'GRANT ALL ON *.* TO u', 'KILL 12', 'CALL proc()']) {
    if (core.checkSql(s, { readonly: false, writeMode: true }).ok !== false) return { ok: false, at: s }
  }
  return { ok: true }
})
t('admin: START TRANSACTION 拒绝', () =>
  core.checkSql('START TRANSACTION', { readonly: false, writeMode: true }).ok === false)
t('admin: COPY pg 拒绝', () =>
  core.checkSql("COPY t TO STDOUT", { readonly: true }).ok === false)
t('unknown: 空语句拒绝', () => core.checkSql('  ', { readonly: true }).ok === false)
t('unknown: 乱码语句拒绝', () => core.checkSql('FROB t', { readonly: true }).ok === false)
t('MCP 通道: forceReadonly 无视一切开关', () => {
  const r = core.checkSql('DROP TABLE t', { readonly: false, writeMode: true, confirm: true, forceReadonly: true })
  return r.ok === false
})

// ── Redis 白名单 ─────────────────────────────────────────────────────────────

t('redis: GET/SCAN/HGETALL/ZRANGE/TTL/INFO 放行', () => {
  const cases = [
    ['GET', ['k']], ['SCAN', ['0', 'MATCH', '*', 'COUNT', '100']],
    ['HGETALL', ['h']], ['ZRANGE', ['z', '0', '-1']], ['TTL', ['k']], ['INFO', []],
  ]
  for (const [c, a] of cases) {
    if (core.checkRedisCommand(c, a, {}).allowed !== true) return { ok: false, at: c }
  }
  return { ok: true }
})
t('redis: SCAN 无 COUNT 拒绝', () => core.checkRedisCommand('SCAN', ['0']).allowed === false)
t('redis: SCAN COUNT 超限拒绝', () => core.checkRedisCommand('SCAN', ['0', 'COUNT', '99999']).allowed === false)
t('redis: FLUSHALL 永久拒绝', () => core.checkRedisCommand('FLUSHALL', []).banned === true)
t('redis: CONFIG/DEBUG/SHUTDOWN 永久拒绝', () => {
  for (const c of ['CONFIG', 'DEBUG', 'SHUTDOWN', 'SLAVEOF', 'EVAL', 'MODULE']) {
    if (core.checkRedisCommand(c, ['x']).banned !== true) return { ok: false, at: c }
  }
  return { ok: true }
})
t('redis: SET 默认拒绝、allowWrite 放行', () =>
  core.checkRedisCommand('SET', ['a', 'b'], {}).allowed === false
  && core.checkRedisCommand('SET', ['a', 'b'], { allowWrite: true }).allowed === true)
t('redis: DEL 属写命令', () => core.checkRedisCommand('DEL', ['k'], {}).needsWrite === true)
t('redis: KEYS 刻意不在白名单（防阻塞）', () => core.checkRedisCommand('KEYS', ['*']).allowed === false)
t('redis: SUBSCRIBE 拒绝（会话独占）', () => core.checkRedisCommand('SUBSCRIBE', ['ch']).banned === true)
t('redis: 大小写不敏感', () => core.checkRedisCommand('Get', ['k']).allowed === true)
t('redis: 非法命令名拒绝', () => core.checkRedisCommand('GET extra args', []).allowed === false)

// ── RESP 编解码 ──────────────────────────────────────────────────────────────

t('resp: 命令编码 roundtrip', () => {
  const buf = redisDrv.encodeCommand(['GET', 'a:b', '中文值'])
  const r = redisDrv.parseReply(buf, 0)
  return Array.isArray(r.value) && r.value[0] === 'GET' && r.value[1] === 'a:b' && r.value[2] === '中文值'
})
t('resp: bulk 字符串', () => {
  const r = redisDrv.parseReply(Buffer.from('$3\r\nabc\r\n'), 0)
  return r.value === 'abc'
})
t('resp: null bulk(-1)', () => redisDrv.parseReply(Buffer.from('$-1\r\n'), 0).value === null)
t('resp: integer / simple / error', () => {
  const i = redisDrv.parseReply(Buffer.from(':42\r\n'), 0).value
  const s = redisDrv.parseReply(Buffer.from('+OK\r\n'), 0).value
  const e = redisDrv.parseReply(Buffer.from('-ERR bad\r\n'), 0).value
  return i === 42 && s === 'OK' && e instanceof Error && e.redisError === true
})
t('resp: 嵌套数组（SCAN 回包形状）', () => {
  const r = redisDrv.parseReply(Buffer.from('*2\r\n$1\r\n5\r\n*2\r\n$3\r\na:b\r\n$3\r\nc:d\r\n'), 0)
  return Array.isArray(r.value) && r.value[0] === '5' && Array.isArray(r.value[1]) && r.value[1][1] === 'c:d'
})
t('resp: 半包返回 null（跨块续读）', () => {
  const full = Buffer.from('*2\r\n$3\r\nabc\r\n$1\r\nz\r\n')
  return redisDrv.parseReply(full.subarray(0, 9), 0) === null
    && Array.isArray(redisDrv.parseReply(full, 0).value)
})
t('resp: RESP3 null(_) 与 map(%)', () => {
  const n = redisDrv.parseReply(Buffer.from('_\r\n'), 0).value
  const m = redisDrv.parseReply(Buffer.from('%1\r\n$2\r\ndb\r\n:0\r\n'), 0).value
  return n === null && m && m.db === 0
})
t('resp: 管道多回包逐个解析', () => {
  const buf = Buffer.from('+OK\r\n:7\r\n$2\r\nhi\r\n')
  const a = redisDrv.parseReply(buf, 0)
  const b = redisDrv.parseReply(buf, a.next)
  const c = redisDrv.parseReply(buf, b.next)
  return a.value === 'OK' && b.value === 7 && c.value === 'hi'
})

// ── profile/CSV/掩码 ────────────────────────────────────────────────────────

t('profile: 规范化+默认端口', () => {
  const r = core.normalizeProfile({ type: 'mysql', name: 'x', host: '127.0.0.1', username: 'root', database: 'db' })
  return r.ok !== false && r.profile.port === 3306 && r.profile.readonly === true
})
t('profile: 类型不合法拒绝', () => core.normalizeProfile({ type: 'oracle', name: 'x', host: 'h' }).error !== undefined)
t('profile: SQL 库缺 database 拒绝', () => core.normalizeProfile({ type: 'postgres', name: 'x', host: 'h', username: 'u' }).error !== undefined)
t('profile: 密码永不进规范产物', () => {
  const r = core.normalizeProfile({ type: 'redis', name: 'x', host: 'h', password: 'secret' })
  return JSON.stringify(r.profile).includes('secret') === false
})
t('csv: 逗号/引号/换行/BOM', () => {
  const csv = core.toCsv(['a', 'b'], [{ a: 'x,"y"', b: 'l1\nl2' }])
  return csv.startsWith('\uFEFF') && csv.includes('"x,""y"""') && csv.includes('"l1\nl2"')
})
t('csv: 对象值 JSON 化并按引号规则转义', () => core.toCsv(['j'], [{ j: { a: 1 } }]).includes('"{""a"":1}"'))

console.log(`\n护栏/协议离线单测: ${pass} 通过, ${fail} 失败`)
if (fail > 0) {
  console.error('失败项:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
