/**
 * fixtures.mjs —— 合成构建产物夹具（零 esbuild 依赖：手写 VLQ 编码器造 sourcemap）
 *
 * 目录形态（期望值全部显式计算，供各层测试断言）：
 *   app.min.js + app.min.js.map —— 3 行生成文件；sourcesContent 齐 + names 有「boom」
 *   vendor.min.js + vendor.min.js.map —— 无 sourcesContent，但磁盘源文件存在（考磁盘回退）
 *   lazy.min.js —— 仅 sourceMappingURL 注释（无同目录 .map 文件名直配），map 在 maps/ 子目录
 *   src/app.ts / src/vendor.ts —— 磁盘源（vendor map 的 sourcesContent 缺失 → 磁盘读）
 *   node_modules/noise/x.map —— 应被目录扫描忽略（node_modules 排除）
 *   中文目录/中文源名 —— 考 CJK 路径
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function encodeVlq(value) {
  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1
  let out = ''
  do {
    let digit = vlq & 31
    vlq >>>= 5
    if (vlq > 0) digit |= 32
    out += B64[digit]
  } while (vlq > 0)
  return out
}

/** lines: [ [ [genCol, srcIdx, srcLine, srcCol, nameIdx?], ... ], ... ] → mappings 串 */
export function buildMappings(lines) {
  let ps = 0; let pl = 0; let pc = 0; let pn = 0
  return lines.map((segs) => {
    let prevCol = 0
    return segs.map((s) => {
      let out = encodeVlq(s[0] - prevCol)
      prevCol = s[0]
      out += encodeVlq(s[1] - ps); ps = s[1]
      out += encodeVlq(s[2] - pl); pl = s[2]
      out += encodeVlq(s[3] - pc); pc = s[3]
      if (s.length > 4) { out += encodeVlq(s[4] - pn); pn = s[4] }
      return out
    }).join(',')
  }).join(';')
}

const rmRfForce = (p) => { try { fs.rmSync(p, { recursive: true, force: true }) } catch (_) { /* 忽略 */ } }

// app.ts 源（8 行）：行号即断言锚点
export const APP_TS = [
  'export function greet(name: string): string {',
  '  return `hi, ${name}`;',
  '}',
  '',
  '// boom 在第 6 行（1-based）',
  'export function boom(): string {',
  '  return greet(undefined as unknown as string).trim();',
  '}',
].join('\n')

// vendor.ts 源（4 行）
export const VENDOR_TS = [
  'export function vendorAdd(a: number, b: number): number {',
  '  return a + b;',
  '}',
  'export const VENDOR_TAG = "vendor-v1";',
].join('\n')

export function buildFixtureDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-lens-fixture-'))

  // ── app.min.js：3 行 + 尾部 sourceMappingURL ─────────────────────────────
  // 行1: greet 压缩体 → app.ts 行1:1（函数名 greet）
  // 行2: boom 调用体 → app.ts 行7:3，nameIdx 指向 "boom"
  // 行3: 入口调用 → app.ts 行1:1（无 name）
  const appGen = [
    'function greet(n){return`hi, ${n}`}',
    'function boom(){return greet(void 0).trim()}',
    'boom();',
  ].join('\n') + '\n'
  const appMap = {
    version: 3,
    file: 'app.min.js',
    sources: ['src/app.ts'],
    sourcesContent: [APP_TS],
    names: ['greet', 'boom'],
    mappings: buildMappings([
      [[0, 0, 0, 0, 0]],          // 行1 col0 → src0 行0 列0 name0
      [[0, 0, 6, 2, 1]],          // 行2 col0 → src0 行6 列2 name1
      [[0, 0, 0, 0]],             // 行3 col0 → src0 行0 列0
    ]),
  }
  fs.writeFileSync(path.join(dir, 'app.min.js'), appGen + '//# sourceMappingURL=app.min.js.map\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'app.min.js.map'), JSON.stringify(appMap), 'utf8')

  // ── vendor.min.js + map（无 sourcesContent；磁盘源在 src/vendor.ts）───────
  const vendorGen = 'function vendorAdd(a,b){return a+b}\nconst TAG="vendor-v1";\n'
  const vendorMap = {
    version: 3,
    file: 'vendor.min.js',
    sources: ['src/vendor.ts'],
    sourcesContent: null,
    names: [],
    mappings: buildMappings([
      [[0, 0, 0, 0]],
      [[0, 0, 3, 12]],
    ]),
  }
  fs.writeFileSync(path.join(dir, 'vendor.min.js'), vendorGen, 'utf8')
  fs.writeFileSync(path.join(dir, 'vendor.min.js.map'), JSON.stringify(vendorMap), 'utf8')

  // ── 磁盘源文件 ──────────────────────────────────────────────────────────
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'app.ts'), APP_TS, 'utf8')
  fs.writeFileSync(path.join(dir, 'src', 'vendor.ts'), VENDOR_TS, 'utf8')

  // ── lazy.min.js：map 藏在 maps/ 子目录，仅 sourceMappingURL 指过去 ─────────
  const lazyGen = 'export{default}from"./lazy-chunk";\nconsole.log("lazy");\n'
  const lazyMap = {
    version: 3,
    file: 'lazy.min.js',
    sources: ['webpack://app/./src/lazy.tsx'],
    sourcesContent: ['export default function Lazy() {\n  return "lazy-here";\n}\n'],
    names: [],
    mappings: buildMappings([
      [[0, 0, 0, 0]],
      [[0, 0, 0, 0]],
    ]),
  }
  fs.mkdirSync(path.join(dir, 'maps'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lazy.min.js'), lazyGen + '//# sourceMappingURL=maps/lazy.min.js.map\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'maps', 'lazy.min.js.map'), JSON.stringify(lazyMap), 'utf8')

  // ── node_modules 噪音（扫描应忽略）───────────────────────────────────────
  fs.mkdirSync(path.join(dir, 'node_modules', 'noise'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'node_modules', 'noise', 'x.map'), '{"version":3,"sources":[],"mappings":""}', 'utf8')

  // ── 中文路径源（CJK 回归）───────────────────────────────────────────────
  fs.mkdirSync(path.join(dir, '模块'), { recursive: true })
  fs.writeFileSync(path.join(dir, '模块', '中文.min.js'), 'const 中文="值";\n', 'utf8')

  return { dir, cleanup: () => rmRfForce(dir), appMap, vendorMap, lazyMap, APP_TS, VENDOR_TS }
}

/** 真实浏览器风格的 minified 栈（指向夹具 app.min.js） */
export function appStack(dir) {
  const js = path.join(dir, 'app.min.js').replace(/\\/g, '/')
  return [
    'TypeError: Cannot read properties of undefined (reading \'trim\')',
    `    at boom (${js}:2:32)`,
    `    at Object.<anonymous> (${js}:3:1)`,
    '    at node:internal/process/task_queues:95:5',
  ].join('\n')
}
