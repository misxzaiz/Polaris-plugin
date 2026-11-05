'use strict';
/**
 * hex-core.js —— 文件魔数透视台共享核心（单一权威，零依赖纯函数、零 node 内置 require）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 识别语义（如实）：
 *   - 魔数表为「确定性头部签名」——识别到即置信；仅凭扩展名反推不产出（宁缺毋滥）
 *   - 伪装扩展名检测：魔数类型与扩展名期望不符 → warn（不判恶意，只报不一致）
 *   - 熵：Shannon 熵按字节分布，8.0 为理论上限；>7.2 提示已压缩/加密（非判定）
 *   - 边界：短于签名的文件按「不足判定」处理；纯文本回退提示（可看 ASCII）
 */

// ── 魔数表（确定性头部签名）────────────────────────────────────────────────

/** 每条 { name, ext: 期望扩展名数组, magic: 十六进制串, offset: 签名起始偏移 } */
const MAGIC_TABLE = [
  { name: 'PNG 图像', ext: ['png'], magic: '89504e470d0a1a0a', offset: 0 },
  { name: 'JPEG 图像', ext: ['jpg', 'jpeg'], magic: 'ffd8ff', offset: 0 },
  { name: 'GIF 图像', ext: ['gif'], magic: '47494638', offset: 0 }, // GIF8
  { name: 'WebP 图像', ext: ['webp'], magic: '52494646?? ?? ?? ??57454250', offset: 0 }, // RIFF....WEBP
  { name: 'BMP 图像', ext: ['bmp'], magic: '424d', offset: 0 },
  { name: 'PDF 文档', ext: ['pdf'], magic: '25504446', offset: 0 }, // %PDF
  { name: 'ZIP 压缩包（含 docx/xlsx/apk/jar 容器）', ext: ['zip', 'docx', 'xlsx', 'pptx', 'apk', 'jar', 'epub'], magic: '504b0304', offset: 0 },
  { name: 'ZIP 空归档', ext: ['zip'], magic: '504b0506', offset: 0 },
  { name: 'GZIP 压缩', ext: ['gz', 'tgz'], magic: '1f8b', offset: 0 },
  { name: 'ZSTD 压缩', ext: ['zst'], magic: '28b52ffd', offset: 0 },
  { name: 'XZ 压缩', ext: ['xz'], magic: 'fd377a585a00', offset: 0 },
  { name: '7-Zip 压缩包', ext: ['7z'], magic: '377abcaf271c', offset: 0 },
  { name: 'RAR 压缩包', ext: ['rar'], magic: '526172211a07', offset: 0 },
  { name: 'TAR 归档', ext: ['tar'], magic: '7573746172', offset: 257 }, // ustar@257
  { name: 'ELF 可执行（Linux）', ext: ['so', 'elf', 'o'], magic: '7f454c46', offset: 0 },
  { name: 'PE 可执行（Windows EXE/DLL）', ext: ['exe', 'dll'], magic: '4d5a', offset: 0 }, // MZ
  { name: 'Mach-O 可执行（macOS）', ext: ['dylib'], magic: 'cffaedfe', offset: 0 },
  { name: 'Mach-O 可执行（macOS，大端）', ext: ['dylib'], magic: 'feedface', offset: 0 },
  { name: 'Java class', ext: ['class'], magic: 'cafebabe', offset: 0 },
  { name: 'MP4/MOV 容器', ext: ['mp4', 'mov', 'm4a'], magic: '????????66747970', offset: 0 }, // ....ftyp
  { name: 'MP3 音频（ID3）', ext: ['mp3'], magic: '494433', offset: 0 },
  { name: 'FLAC 音频', ext: ['flac'], magic: '664c6143', offset: 0 }, // fLaC
  { name: 'OGG 容器', ext: ['ogg'], magic: '4f676753', offset: 0 }, // OggS
  { name: 'WAV 音频', ext: ['wav'], magic: '52494646?? ?? ?? ??57415645', offset: 0 }, // RIFF....WAVE
  { name: 'SQLite 数据库', ext: ['db', 'sqlite', 'sqlite3'], magic: '53514c69746520666f726d6174203300', offset: 0 },
  { name: 'Windows 注册表巢', ext: ['hive'], magic: '72656766', offset: 0 }, // regf
  { name: 'LLVM 位码', ext: ['bc'], magic: '4243c0de', offset: 0 },
  { name: 'UTF-8 with BOM 文本', ext: ['txt', 'md', 'json'], magic: 'efbbbf', offset: 0 },
  { name: 'UTF-16 LE with BOM 文本', ext: ['txt'], magic: 'ffe­ff', offset: 0 },
];
// 修正两条易错的 magic（上面 LLVM/UTF16LE 为占位，重写为准确值）
MAGIC_TABLE[27].magic = '4243c0de';
MAGIC_TABLE[28].magic = 'fffe';

// ── 魔数匹配 ───────────────────────────────────────────────────────────────

function hexOf(buf) {
  return Buffer ? Buffer.from(buf).toString('hex') : [...buf].map((b) => Number(b).toString(16).padStart(2, '0')).join('');
}

/**
 * 按魔数表识别（零依赖、可入 bundle——buf 为 Uint8Array/Buffer 均可）。
 * @param {Uint8Array|Buffer} buf 文件头部字节
 * @returns {Array<{ name: string, ext: string[], magic: string, offset: number, matchedAt: number }>} 命中列表（可能多条）
 */
function identifyMagic(buf) {
  const headHex = hexOf(buf);
  const headStr = headHex.toLowerCase();
  const hits = [];
  for (const entry of MAGIC_TABLE) {
    const magic = entry.magic.toLowerCase().replace(/\?\?/g, '??');
    // 模板：?? 为任意字节通配；把模板转成逐字节比对
    const target = entry.offset;
    const clean = magic.replace(/\s+/g, '');
    if (clean.length % 2 !== 0) continue; // 防御：奇数长度跳过
    const byteLen = clean.length / 2;
    if (buf.length < target + byteLen) continue;
    let matched = true;
    for (let i = 0; i < byteLen; i++) {
      const pat = clean.slice(i * 2, i * 2 + 2);
      if (pat === '??') continue;
      const want = parseInt(pat, 16);
      const have = buf[target + i];
      if (have !== want) { matched = false; break; }
    }
    if (matched) hits.push({ name: entry.name, ext: entry.ext, magic: entry.magic, offset: entry.offset, matchedAt: target });
  }
  return hits;
}

/**
 * 从扩展名猜期望类型（查表反推：该扩展名在表内的期望名称集合）。
 */
function expectFromExt(ext) {
  const e = String(ext || '').replace(/^\./, '').toLowerCase();
  return MAGIC_TABLE.filter((m) => m.ext.includes(e)).map((m) => m.name);
}

/**
 * 伪装扩展名检测。
 * @param {Array} hits identifyMagic 产物
 * @param {string} filename 文件名（取扩展名比对）
 * @returns {{ consistent: boolean, expected: string[], warning: string|null }}
 */
function extConsistency(hits, filename) {
  const m = String(filename || '').match(/\.([A-Za-z0-9]+)$/);
  const ext = m ? m[1] : '';
  if (!hits.length || !ext) return { consistent: true, expected: [], warning: null };
  const expected = expectFromExt(ext);
  const hitNames = hits.map((h) => h.name);
  const ok = expected.some((name) => hitNames.includes(name)) || hits.some((h) => h.ext.includes(ext.toLowerCase()));
  if (ok) return { consistent: true, expected, warning: null };
  return {
    consistent: false,
    expected,
    warning: `扩展名 .${ext} 与实际魔数类型「${hitNames[0]}」不符——文件可能是伪装扩展名或被错误重命名`,
  };
}

// ── 熵 ─────────────────────────────────────────────────────────────────────

/** Shannon 熵（字节分布，0-8 bit/字节上限） */
function shannonEntropy(buf) {
  if (!buf || !buf.length) return 0;
  const freq = new Array(256).fill(0);
  for (const b of buf) freq[b]++;
  let h = 0;
  for (const f of freq) {
    if (!f) continue;
    const p = f / buf.length;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 100) / 100;
}

// ── hex dump ───────────────────────────────────────────────────────────────

/**
 * hex dump 视图（xxd 风格：偏移 + HEX×16 + ASCII 侧栏）。
 * @param {Uint8Array|Buffer} buf 切片后的字节
 * @param {number} baseOffset 原文件中的起始偏移（用于显示偏移列）
 * @returns {string} 多行 dump
 */
function hexDump(buf, baseOffset = 0) {
  const lines = [];
  for (let off = 0; off < buf.length; off += 16) {
    const chunk = buf.slice(off, Math.min(off + 16, buf.length));
    const hexParts = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      if (i < chunk.length) {
        hexParts.push(Number(chunk[i]).toString(16).padStart(2, '0'));
        const b = chunk[i];
        ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·';
      } else {
        hexParts.push('  ');
        ascii += ' ';
      }
      if (i === 7) hexParts.push(''); // 中缝
    }
    const offset = (baseOffset + off).toString(16).padStart(8, '0');
    lines.push(`${offset}  ${hexParts.join(' ').padEnd(50)}  |${ascii}|`);
  }
  return lines.join('\n');
}

/** 切片（边界夹紧） */
function slice(buf, offset, length) {
  const start = Math.max(0, Math.min(Number(offset) || 0, buf.length));
  const len = Math.max(0, Math.min(Number(length) || 0, buf.length - start));
  return buf.slice(start, start + len);
}

/** 识别报告渲染（MCP/面板共用口径） */
function renderInspectReport(r) {
  const lines = [];
  lines.push(`文件：${r.filename}`);
  lines.push(`大小：${r.size} 字节 · 头部读取 ${r.readBytes} 字节 · 熵 ${r.entropy} / 8.00${r.entropy > 7.2 ? '（高熵：已压缩或加密的典型特征）' : ''}`);
  if (r.hits.length) {
    lines.push(`魔数识别：${r.hits.map((h) => `${h.name}（签名 @${h.matchedAt}）`).join('；')}`);
  } else if (r.isTextLike) {
    lines.push('魔数识别：无已知签名——内容像纯文本（可按文本查看）');
  } else {
    lines.push('魔数识别：无已知签名（未知二进制格式）');
  }
  if (r.extWarning) lines.push(`⚠ ${r.extWarning}`);
  if (r.headDump) lines.push('', '头部 hex dump：', r.headDump);
  return lines.join('\n');
}

module.exports = {
  MAGIC_TABLE, identifyMagic, expectFromExt, extConsistency,
  shannonEntropy, hexDump, slice, renderInspectReport, hexOf,
};
