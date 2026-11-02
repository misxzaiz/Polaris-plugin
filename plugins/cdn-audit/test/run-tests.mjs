// CDN 体检台核心单测：node test/run-tests.mjs（零依赖零外网，行为级断言）
import assert from 'node:assert'
import { createRequire } from 'node:module'
import zlib from 'node:zlib'
const require = createRequire(import.meta.url)
const core = require('../shared/cdn-core.js')
const { fenceUrl, isPrivateIp, isLoopbackHost, decodeBuffer } = require('../service/fetcher.js')
const { extractTarGz, normalizeEntryPath } = require('../service/tarball.js')

const results = []
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }) }
  catch (e) { results.push({ name, pass: false, detail: e.message }) }
}

/* ── URL 归一 ─────────────────────────────────────────────────────────────── */
t('normalize: 补协议/剥引号/协议相对', () => {
  assert.equal(core.normalizeUrlInput('cdn.jsdelivr.net/npm/a@1/b.js').url.toString(), 'https://cdn.jsdelivr.net/npm/a@1/b.js')
  assert.equal(core.normalizeUrlInput('//unpkg.com/x@1/y.js').url.toString(), 'https://unpkg.com/x@1/y.js')
  assert.equal(core.normalizeUrlInput(' "https://a.b/c" ').url.toString(), 'https://a.b/c')
})
t('normalize: 拒绝非 http(s) 与垃圾输入', () => {
  assert.equal(core.normalizeUrlInput('ftp://a/b').ok, false)
  assert.equal(core.normalizeUrlInput('随便什么').ok, false)
  assert.equal(core.normalizeUrlInput('').ok, false)
  assert.equal(core.normalizeUrlInput('javascript:alert(1)').ok, false)
})

/* ── CDN 识别 ─────────────────────────────────────────────────────────────── */
t('classify: jsDelivr npm（含 dist 路径与查询串剥离）', () => {
  const r = core.classifyResourceUrl('https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js?v=1#x')
  assert.equal(r.family, 'npm'); assert.equal(r.cdnId, 'jsdelivr')
  assert.equal(r.pkg, 'jquery'); assert.equal(r.ver, '3.7.1'); assert.equal(r.file, 'dist/jquery.min.js')
})
t('classify: jsDelivr 无 npm/ 前缀与无版本', () => {
  const r = core.classifyResourceUrl('https://cdn.jsdelivr.net/npm/vue/dist/vue.global.prod.js')
  assert.equal(r.family, 'npm'); assert.equal(r.pkg, 'vue'); assert.equal(r.ver, null)
  const r2 = core.classifyResourceUrl('https://gcore.jsdelivr.net/npm/vue@3.4.0/dist/vue.global.prod.js')
  assert.equal(r2.cdnId, 'jsdelivr-gcore'); assert.equal(r2.ver, '3.4.0')
})
t('classify: jsDelivr scoped 包', () => {
  const r = core.classifyResourceUrl('https://cdn.jsdelivr.net/npm/@babel/runtime@7.24.0/helpers/esm/arrayWithHoles.js')
  assert.equal(r.family, 'npm'); assert.equal(r.pkg, '@babel/runtime'); assert.equal(r.ver, '7.24.0')
  assert.equal(r.file, 'helpers/esm/arrayWithHoles.js')
})
t('classify: jsDelivr gh 形态归 gh 族', () => {
  const r = core.classifyResourceUrl('https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/x/plugin.json')
  assert.equal(r.family, 'gh'); assert.equal(r.ghUser, 'misxzaiz'); assert.equal(r.ghRepo, 'Polaris-plugin')
  assert.equal(r.ver, 'main'); assert.equal(r.file, 'plugins/x/plugin.json')
})
t('classify: unpkg 与 npmmirror files 形态', () => {
  const a = core.classifyResourceUrl('https://unpkg.com/react@18.3.1/umd/react.production.min.js')
  assert.equal(a.family, 'npm'); assert.equal(a.cdnId, 'unpkg'); assert.equal(a.file, 'umd/react.production.min.js')
  const b = core.classifyResourceUrl('https://registry.npmmirror.com/react/18.3.1/files/umd/react.production.min.js')
  assert.equal(b.family, 'npm'); assert.equal(b.cdnId, 'npmmirror'); assert.equal(b.ver, '18.3.1'); assert.equal(b.file, 'umd/react.production.min.js')
  const c = core.classifyResourceUrl('https://registry.npmmirror.com/@types/node/20.1.0/files/assert.d.ts')
  assert.equal(c.pkg, '@types/node'); assert.equal(c.file, 'assert.d.ts')
})
t('classify: cdnjs 系四家（含 staticfile 无前缀形态与 baomitu）', () => {
  const a = core.classifyResourceUrl('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js')
  assert.equal(a.family, 'cdnjs'); assert.equal(a.cdnId, 'cdnjs'); assert.equal(a.pkg, 'jquery'); assert.equal(a.file, 'jquery.min.js')
  const b = core.classifyResourceUrl('https://cdn.bootcdn.net/ajax/libs/bootstrap/5.3.3/js/bootstrap.min.js')
  assert.equal(b.cdnId, 'bootcdn')
  const c1 = core.classifyResourceUrl('https://cdn.staticfile.org/ajax/libs/vue/3.4.0/vue.global.prod.min.js')
  const c2 = core.classifyResourceUrl('https://cdn.staticfile.org/vue/3.4.0/vue.global.prod.min.js')
  assert.equal(c1.pkg, 'vue'); assert.equal(c2.pkg, 'vue')
  const d = core.classifyResourceUrl('https://libs.baomitu.com/jquery/3.7.1/jquery.min.js')
  assert.equal(d.cdnId, 'baomitu'); assert.equal(d.ver, '3.7.1')
})
t('classify: 未知主机如实归 unknown', () => {
  const r = core.classifyResourceUrl('https://evil-cdn.example.com/npm/jquery@3.7.1/dist/jquery.min.js')
  assert.equal(r.family, 'unknown'); assert.equal(r.host, 'evil-cdn.example.com')
})

/* ── 镜像 URL 互转 ────────────────────────────────────────────────────────── */
t('npmMirrorUrls: 6 个 npm 系镜像路径同构', () => {
  const urls = core.npmMirrorUrls({ family: 'npm', pkg: 'jquery', ver: '3.7.1', file: 'dist/jquery.min.js' })
  assert.equal(urls.length, 6)
  const byId = Object.fromEntries(urls.map((u) => [u.cdnId, u.url]))
  assert.equal(byId.jsdelivr, 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js')
  assert.equal(byId.unpkg, 'https://unpkg.com/jquery@3.7.1/dist/jquery.min.js')
  assert.equal(byId.npmmirror, 'https://registry.npmmirror.com/jquery/3.7.1/files/dist/jquery.min.js')
  assert.ok(byId['jsdelivr-gcore'].includes('gcore.jsdelivr.net'))
})
t('npmMirrorUrls: scoped 包不丢 scope', () => {
  const urls = core.npmMirrorUrls({ family: 'npm', pkg: '@babel/runtime', ver: '7.24.0', file: 'helpers/x.js' })
  const byId = Object.fromEntries(urls.map((u) => [u.cdnId, u.url]))
  assert.ok(byId.npmmirror.includes('@babel/runtime/7.24.0/files/helpers/x.js'))
})
t('cdnjsMirrorUrls: 前缀差异正确', () => {
  const urls = core.cdnjsMirrorUrls('jquery', '3.7.1', 'jquery.min.js')
  const byId = Object.fromEntries(urls.map((u) => [u.cdnId, u.url]))
  assert.equal(byId['cdnjs'], 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js')
  assert.equal(byId['baomitu'], 'https://libs.baomitu.com/jquery/3.7.1/jquery.min.js')
})

/* ── SRI ──────────────────────────────────────────────────────────────────── */
t('parseSri/compareSri: 三算法与错值', () => {
  assert.deepEqual(core.parseSri('sha384-abc+/='), { alg: 'sha384', digest: 'abc+/=' })
  assert.equal(core.parseSri('sha1-abc'), null)
  assert.equal(core.parseSri('garbage'), null)
  const digests = { sha384: 'AAA', sha512: 'BBB' }
  assert.equal(core.compareSri('sha384-AAA', digests), 'match')
  assert.equal(core.compareSri('sha384-BBB', digests), 'mismatch')
  assert.equal(core.compareSri('sha256-AAA', digests), 'unknown-alg')
  assert.equal(core.compareSri('bogus', digests), 'invalid')
})

/* ── HTML 提取 ────────────────────────────────────────────────────────────── */
t('extract: script/link 双引号单引号与 integrity/crossorigin', () => {
  const html = `<html><head>
  <script src="https://cdn.jsdelivr.net/npm/a@1.0.0/x.js" integrity="sha384-ABC" crossorigin="anonymous"></script>
  <link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/l/1.0/l.css'>
  <link rel="icon" href="https://cdn.example.com/favicon.ico">
  <script>inline()</script>
  <img src="https://cdn.example.com/pic.png">
  </head></html>`
  const r = core.extractExternalResources(html)
  assert.equal(r.resources.length, 2, JSON.stringify(r.resources))
  assert.equal(r.resources[0].tag, 'script')
  assert.equal(r.resources[0].integrity, 'sha384-ABC')
  assert.equal(r.resources[0].crossorigin, 'anonymous')
  assert.equal(r.resources[1].tag, 'link')
  assert.ok(r.resources[1].url.startsWith('https://cdnjs.cloudflare.com/'))
})
t('extract: 相对/同源/data URI 分类跳过（有 base 时相对并入同源）', () => {
  const html = `<script src="/local.js"></script>
  <script src="./also-local.js"></script>
  <script src="//cdn.jsdelivr.net/npm/a@1/b.js"></script>
  <script src="data:text/javascript;base64,AAAA"></script>
  <script src="https://same.example.com/x.js"></script>`
  const r = core.extractExternalResources(html, 'https://same.example.com/page')
  assert.equal(r.resources.length, 1, JSON.stringify(r.resources))
  assert.equal(r.resources[0].url, 'https://cdn.jsdelivr.net/npm/a@1/b.js')
  assert.equal(r.skipped.sameOrigin, 3, JSON.stringify(r.skipped))
  assert.equal(r.skipped.relative, 0)
  assert.equal(r.skipped.dataUri, 1)
})
t('extract: 无 base 时相对路径如实计数', () => {
  const html = `<script src="/local.js"></script><script src="https://cdn.jsdelivr.net/npm/a@1/b.js"></script>`
  const r = core.extractExternalResources(html)
  assert.equal(r.resources.length, 1)
  assert.equal(r.skipped.relative, 1)
})
t('extract: 去重同 URL 只保留一条', () => {
  const html = `<script src="https://cdn.jsdelivr.net/npm/a@1/x.js"></script><script src="https://cdn.jsdelivr.net/npm/a@1/x.js"></script>`
  assert.equal(core.extractExternalResources(html).resources.length, 1)
})
t('extract: preload/modulepreload 入选，icon/manifest 不选', () => {
  const html = `<link rel="preload" href="https://cdn.jsdelivr.net/npm/a@1/x.js" as="script">
  <link rel="modulepreload" href="https://cdn.jsdelivr.net/npm/a@1/y.js">
  <link rel="manifest" href="https://cdn.example.com/m.webmanifest">`
  const r = core.extractExternalResources(html)
  assert.equal(r.resources.length, 2, JSON.stringify(r.resources))
})

/* ── findings 与评分 ─────────────────────────────────────────────────────── */
t('score: red -30 黄 -12 同类三次封顶，下限 0', () => {
  const one = [core.F('red', 'integrity.mismatch', 'x'), core.F('yellow', 'sri.missing', 'y')]
  assert.equal(core.computeScore(one), 58)
  const many = Array.from({ length: 6 }, () => core.F('red', 'integrity.mismatch', 'x'))
  assert.equal(core.computeScore(many), 100 - 30 * 3)
  const lots = Array.from({ length: 20 }, () => core.F('yellow', 'sri.missing', 'y'))
  assert.equal(core.computeScore(lots), 100 - 12 * 3)
  assert.equal(core.computeScore([]), 100)
})
t('sortFindings: 红黄绿信息排序稳定', () => {
  const sorted = core.sortFindings([core.F('green', 'a'), core.F('red', 'b'), core.F('info', 'c'), core.F('yellow', 'd')])
  assert.deepEqual(sorted.map((f) => f.sev), ['red', 'yellow', 'info', 'green'])
})

/* ── SSRF 围栏 ───────────────────────────────────────────────────────────── */
t('fence: 拒绝回环/私网/内嵌凭据/非 http', () => {
  assert.equal(fenceUrl('http://127.0.0.1:1/x').ok, false)
  assert.equal(fenceUrl('http://localhost/x').ok, false)
  assert.equal(fenceUrl('http://10.0.0.1/x').ok, false)
  assert.equal(fenceUrl('http://169.254.169.254/latest/meta-data').ok, false)
  assert.equal(fenceUrl('http://user:pass@cdn.jsdelivr.net/x').ok, false)
  assert.equal(fenceUrl('file:///etc/passwd').ok, false)
  assert.equal(fenceUrl('https://cdn.jsdelivr.net/npm/a@1/b.js').ok, true)
})
t('fence: allowLoopback 仅放行回环（selftest 通道）', () => {
  assert.equal(fenceUrl('http://127.0.0.1:9/x', true).ok, true)
  assert.equal(fenceUrl('http://10.0.0.1/x', true).ok, false) // 私网仍拒
  assert.equal(fenceUrl('https://cdn.jsdelivr.net/x', true).ok, true)
})
t('isPrivateIp/isLoopbackHost 边界', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::5', 'fe80::1', '::ffff:10.0.0.1', '0.0.0.0']) {
    assert.equal(isPrivateIp(ip), true, ip)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700::1']) {
    assert.equal(isPrivateIp(ip), false, ip)
  }
  assert.equal(isLoopbackHost('localhost'), true)
  assert.equal(isLoopbackHost('127.0.0.1'), true)
  assert.equal(isLoopbackHost('cdn.jsdelivr.net'), false)
})

/* ── 字符集 ──────────────────────────────────────────────────────────────── */
t('decodeBuffer: UTF-8 严格优先，GBK 回退', () => {
  const utf = Buffer.from([0xe6, 0xb1, 0x89, 0xe5, 0xad, 0x97]) // 汉字
  assert.equal(decodeBuffer(utf).text, '汉字')
  const gbk = Buffer.from([0xba, 0xba, 0xd7, 0xd6]) // 汉字 GBK
  const r = decodeBuffer(gbk)
  assert.ok(r.text.includes('汉'), `GBK 解码结果：${r.text} (${r.charset})`)
  assert.equal(decodeBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf])).text, '汉字', 'BOM 剥离')
})

/* ── tar 解析 ────────────────────────────────────────────────────────────── */
function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0' }
function tarEntry(name, data, opts = {}) {
  const blocks = [];
  const h = Buffer.alloc(512, 0);
  h.write(name.slice(0, 100), 0, 'utf8');
  h.write(octal(data.length, 12), 124, 'utf8');
  h.write(opts.type || '0', 156, 'utf8');
  h.write('ustar\0', 257, 'utf8');
  h.write('00', 263, 'utf8');
  if (opts.prefix) h.write(opts.prefix, 345, 'utf8');
  blocks.push(h);
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512, 0);
  data.copy(padded);
  blocks.push(padded);
  return blocks;
}
t('tar: ustar 基本形态 + package/ 前缀剥离 + sha 匹配', () => {
  const f1 = Buffer.from('hello world\n');
  const f2 = Buffer.from('x'.repeat(700)); // 跨块
  const parts = [...tarEntry('package/dist/a.js', f1), ...tarEntry('package/dist/big.js', f2)];
  // 双零块结尾
  const raw = Buffer.concat([...parts, Buffer.alloc(1024, 0)]);
  const map = extractTarGz(zlib.gzipSync(raw), {});
  assert.equal(map.size, 2, [...map.keys()].join(','))
  assert.ok(map.get('dist/a.js').equals(f1))
  assert.ok(map.get('dist/big.js').equals(f2))
})
t('tar: GNU 长名（typeflag L）', () => {
  const longName = 'package/' + 'deep/'.repeat(22) + 'leaf.js';
  assert.ok(longName.length > 100)
  const data = Buffer.from('content\n');
  const parts = [...tarEntry('././@LongLink', Buffer.from(longName + '\0'), { type: 'L' }), ...tarEntry('truncated-name', data)];
  const raw = Buffer.concat([...parts, Buffer.alloc(1024, 0)]);
  const map = extractTarGz(zlib.gzipSync(raw), {});
  assert.ok(map.has(longName.slice('package/'.length)), [...map.keys()].join(','))
})
t('tar: PAX 头（typeflag x）path 覆盖（长度字段为真实记录长度）', () => {
  const paxPath = 'package/pax/nested/file.js';
  const body = ` path=${paxPath}\n`;
  const paxRec = Buffer.from(`${body.length + 2}${body}`); // 长度含自身两位数字与空格
  const data = Buffer.from('pax content\n');
  const parts = [...tarEntry('PaxHeader', paxRec, { type: 'x' }), ...tarEntry('short', data)];
  const raw = Buffer.concat([...parts, Buffer.alloc(1024, 0)]);
  const map = extractTarGz(zlib.gzipSync(raw), {});
  assert.ok(map.has('pax/nested/file.js'), [...map.keys()].join(','))
})
t('tar: 路径穿越拒绝与非 regular 跳过', () => {
  const evil = Buffer.from('evil\n');
  const parts = [...tarEntry('package/../evil.js', evil), ...tarEntry('package/dir/', Buffer.alloc(0), { type: '5' })];
  const raw = Buffer.concat([...parts, Buffer.alloc(1024, 0)]);
  const map = extractTarGz(zlib.gzipSync(raw), {});
  assert.equal(map.size, 0, [...map.keys()].join(','))
})
t('normalizeEntryPath', () => {
  assert.equal(normalizeEntryPath('package/a.js'), 'a.js')
  assert.equal(normalizeEntryPath('./a.js'), 'a.js')
  assert.equal(normalizeEntryPath('x/../y.js'), 'x/../y.js') // 拒绝逻辑在上层
})

/* ── verdict 文案 ────────────────────────────────────────────────────────── */
t('verdictBadge: 语义标记', () => {
  assert.ok(core.verdictBadge('match').includes('✅'))
  assert.ok(core.verdictBadge('mismatch').includes('🚨'))
  assert.ok(core.verdictBadge('unverifiable').includes('⚠️'))
  assert.ok(core.verdictBadge('unreachable').includes('🚫'))
})

/* ── 输出 ────────────────────────────────────────────────────────────────── */
let pass = 0
for (const r of results) {
  if (r.pass) { pass++; console.log(`  ✓ ${r.name}`) }
  else console.log(`  ✗ ${r.name}\n    ${r.detail}`)
}
console.log(`\n${pass}/${results.length} 通过`)
if (pass !== results.length) process.exit(1)
