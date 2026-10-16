// make-zip.cjs — relay-devkit 打包脚本（零依赖，按 .pluginignore 过滤，deflate 压缩）。
// 用法: node make-zip.cjs   产出 ./relay-devkit.zip，并打印 sha256（供 index.json 使用）。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'relay-devkit.zip');

const IGNORE = fs.existsSync('.pluginignore')
  ? fs.readFileSync('.pluginignore', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : [];

// gitignore 式规则：按顺序逐条判定，最后匹配的规则生效（支持 ! 否定）。
// 例：node_modules/ 排除全部，!relay_server/vendor/node_modules/ 豁免 vendor 内依赖树；
// 之后 *.d.ts 又排除 vendor 内依赖的类型声明（顺序覆盖白名单）。
function matchGlob(str, pat) {
  const re = new RegExp('^' + pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '(.*/)?')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]') + '$');
  return re.test(str);
}

/**
 * gitignore 式单条判定：rel 是否命中 pat（pat 已去尾斜杠）。
 * - 含中间路径（如 relay_server/vendor/node_modules）→ 锚定完整前缀匹配整棵子树；
 * - 纯段名（如 node_modules、src）→ 任一目录段名匹配即命中（子树排除）；
 * - 含通配（*.d.ts 等）→ glob 匹配相对路径或段名。
 */
function ruleMatch(rel, core) {
  const parts = rel.split('/');
  const base = parts[parts.length - 1];
  // 前导 / 表示锚定插件根（如 /package.json 只匹配根，不匹配 vendor 内同名）
  if (core.startsWith('/')) {
    const anchored = core.slice(1);
    return rel === anchored;
  }
  if (core.includes('/')) {
    return rel === core || rel.startsWith(core + '/');
  }
  if (rel === core || base === core) return true;
  if (core.includes('*') || core.includes('?')) {
    if (matchGlob(rel, core) || matchGlob(base, core)) return true;
    return false;
  }
  return parts.some(p => p === core);
}

function ignored(rel) {
  let decision = false;
  for (const pat of IGNORE) {
    const neg = pat.startsWith('!');
    const core = (neg ? pat.slice(1) : pat).replace(/\/+$/, '');
    if (!core) continue;
    if (ruleMatch(rel, core)) decision = !neg;   // 最后匹配者生效
  }
  return decision;
}

function crc32(data) {
  if (!crc32.table) {
    crc32.table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = crc32.table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// --- ZIP 组装 ---
function main() {
  if (fs.existsSync(OUTPUT)) fs.unlinkSync(OUTPUT);

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && !ignored(rel)) files.push({ rel, full });
    }
  })(ROOT);

  const chunks = [];
  let offset = 0;
  for (const f of files) {
    const data = fs.readFileSync(f.full);
    const crc = crc32(data);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(f.rel, 'utf8');
    const hdr = Buffer.alloc(30 + nameBuf.length);
    hdr.writeUInt32LE(0x04034b50, 0);
    hdr.writeUInt16LE(20, 4);
    hdr.writeUInt16LE(0, 6);
    hdr.writeUInt16LE(8, 8);          // deflate
    hdr.writeUInt16LE(0, 10);
    hdr.writeUInt16LE(0, 12);
    hdr.writeUInt32LE(crc, 14);
    hdr.writeUInt32LE(comp.length, 18);
    hdr.writeUInt32LE(data.length, 22);
    hdr.writeUInt16LE(nameBuf.length, 26);
    hdr.writeUInt16LE(0, 28);
    nameBuf.copy(hdr, 30);
    chunks.push({ hdr, comp, name: f.rel, crc, uncomp: data.length, localOffset: offset });
    offset += hdr.length + comp.length;
  }

  const centrals = [];
  let centralSize = 0;
  for (const c of chunks) {
    const nameBuf = Buffer.from(c.name, 'utf8');
    const h = Buffer.alloc(46 + nameBuf.length);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0, 8);
    h.writeUInt16LE(8, 10);           // deflate
    h.writeUInt16LE(0, 12);
    h.writeUInt16LE(0, 14);
    h.writeUInt32LE(c.crc, 16);
    h.writeUInt32LE(c.comp.length, 20);
    h.writeUInt32LE(c.uncomp, 24);
    h.writeUInt16LE(nameBuf.length, 28);
    h.writeUInt16LE(0, 30);
    h.writeUInt16LE(0, 32);
    h.writeUInt16LE(0, 34);
    h.writeUInt16LE(0, 36);
    h.writeUInt32LE(c.localOffset, 42);
    nameBuf.copy(h, 46);
    centrals.push(h);
    centralSize += h.length;
  }

  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(chunks.length, 8);
  eocd.writeUInt16LE(chunks.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const out = fs.openSync(OUTPUT, 'w');
  for (const c of chunks) { fs.writeSync(out, c.hdr); fs.writeSync(out, c.comp); }
  for (const h of centrals) fs.writeSync(out, h);
  fs.writeSync(out, eocd);
  fs.closeSync(out);

  const buf = fs.readFileSync(OUTPUT);
  console.log(`Packed ${chunks.length} files → ${OUTPUT} (${buf.length} bytes)`);
  console.log('sha256: ' + crypto.createHash('sha256').update(buf).digest('hex'));
  console.log('--- 文件清单 ---');
  chunks.forEach((c, i) => console.log(String(i + 1).padStart(2), c.name));
}

main();