'use strict';
/**
 * core.js —— 消费账单的纯函数核心（零依赖；面板 / MCP / 测试三方同源）
 *
 * 职责：官方账单（微信支付 CSV / 支付宝交易流水 CSV，zip 或裸 CSV）→
 * 规范化交易 → cap.kv 月桶（分片）归并 → 消费透视与分类。
 *
 * 硬口径（与 mcp/server.js、面板两方一致，权威描述见 README）：
 *   1. 金额一律「分」（整数）存储与计算，杜绝浮点钱；
 *   2. dir=in/out/neutral：中性交易（充值、理财互转等不计收支）不进收支合计；
 *   3. 退款单列：alipay 用「成功退款」列；wechat 用交易类型含「退款」的行——
 *      都不算收入也不算支出，net = 收入 − 支出 + 退款；
 *   4. 交易 id = sha256(src|tradeNo|amountFen|date|dir) 前 16 位（三方一致，
 *      重复导入天然幂等；src 参与哈希保证双平台同单号不撞）；
 *   5. 月桶分片每片 ≤ SHARD_CAP 笔：router-dispatch HTTP body 上限 1MB，
 *      中文 JSON 转义膨胀 ~3 倍，500 笔 ≈ 300KB 留足余量。
 */
const { sha256Hex } = require('./sha256');

// ── 常量 ─────────────────────────────────────────────────────────────────────
const SHARD_CAP = 500;
const MONTH_PREFIX = 'duzhi.month.';
const IMPORT_PREFIX = 'duzhi.import.';
const CAT_PREFIX = 'duzhi.cat.';
const RULES_KEY = 'duzhi.rules';
const MAX_FIELD = 120;          // 单字段截断，约束月桶体积
const MAX_FILE_BYTES = 64 * 1024 * 1024;

const DIRS = ['in', 'out', 'neutral'];
const DIR_NAMES = { in: '收入', out: '支出', neutral: '中性' };

// ── crc32 / ZipCrypto（PKWARE 传统加密；微信/支付宝账单 zip 均为此类） ────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32Update(crc, byte) {
  return (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
}
function crc32Of(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = crc32Update(c, bytes[i]);
  return (c ^ -1) >>> 0;
}

/** ZipCrypto 三密钥流解密（就地返回明文 Uint8Array） */
function zipCryptoDecrypt(data, password) {
  const pw = [];
  const p = String(password || '');
  for (let i = 0; i < p.length; i++) {
    const c = p.charCodeAt(i);
    if (c < 0x80) pw.push(c);
    else pw.push(c & 0xff, (c >> 8) & 0xff); // 粗粒度多字节兜底；中文密码以平台实际导出为准
  }
  const keys = [0x12345678, 0x23456789, 0x34567890];
  const upd = (b) => {
    keys[0] = (keys[0] >>> 8) ^ CRC_TABLE[(keys[0] ^ b) & 0xff];
    keys[1] = (keys[1] + (keys[0] & 0xff)) >>> 0;
    keys[1] = (Math.imul(keys[1], 134775813) + 1) >>> 0;
    keys[2] = (keys[2] >>> 8) ^ CRC_TABLE[(keys[2] ^ (keys[1] >>> 24)) & 0xff];
  };
  const dec = (c) => {
    const t = (keys[2] | 2) & 0xffff;
    return c ^ (((t * (t ^ 1)) >>> 8) & 0xff);
  };
  for (let i = 0; i < pw.length; i++) upd(pw[i]);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const plain = dec(data[i]) & 0xff;
    upd(plain);
    out[i] = plain;
  }
  return out;
}

// ── zip 解包（store / deflate / ZipCrypto；AES 拒绝并给出指引） ──────────────
const SIG_LOCAL = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function u16(b, i) { return b[i] | (b[i + 1] << 8); }
function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }

function decodeZipName(bytes) {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!/\uFFFD/.test(utf8)) return utf8;
  } catch (_) { /* 落 GBK */ }
  try { return new TextDecoder('gbk').decode(bytes); } catch (_) { return ''; }
}

/** 解压单条 deflate；Node 走 zlib（运行时 getBuiltinModule，防打包器静态解析），浏览器走 DecompressionStream */
async function inflateRawAsync(bytes) {
  const zlib = (typeof process !== 'undefined' && process.getBuiltinModule)
    ? process.getBuiltinModule('zlib')
    : null;
  if (zlib) {
    const out = zlib.inflateRawSync(bytes);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error('当前环境不支持 deflate 解压：请在系统里手动解压 zip，把里面的 CSV 拖进来即可');
}

/**
 * 解析 zip → [{name, bytes}]。
 * 只支持单磁盘、无 zip64（账单 zip 都是小文件）；method 99（AES）明确拒绝。
 */
async function unzip(bytes, { password } = {}) {
  if (bytes.length < 22) throw new Error('文件太小，不是合法 zip');
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 zip 中央目录结尾（EOCD），文件可能损坏或不是 zip');
  const totalEntries = u16(bytes, eocd + 10);
  const cdSize = u32(bytes, eocd + 12);
  const cdOffset = u32(bytes, eocd + 16);
  if (totalEntries === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('不支持 zip64 格式的压缩包（账单压缩包不会出现；请手动解压后拖入 CSV）');
  }
  const out = [];
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  for (let n = 0; n < totalEntries && p + 46 <= cdEnd; n++) {
    if (u32(bytes, p) !== SIG_CD) break;
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const modTime = u16(bytes, p + 12);
    const crc = u32(bytes, p + 16);
    const compSize = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const localOffset = u32(bytes, p + 42);
    const name = decodeZipName(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (method === 99) {
      throw new Error(`「${name}」使用 AES 加密，本插件不支持：请用解压软件手动解压后，把 CSV 拖进来`);
    }
    if (method !== 0 && method !== 8) {
      throw new Error(`「${name}」使用了不支持的压缩算法（method=${method}）：请手动解压后拖入 CSV`);
    }
    // 本地头：本地 extra 长度可能与中央目录不同，必须按本地头实际值跳过
    if (u32(bytes, localOffset) !== SIG_LOCAL) throw new Error(`「${name}」本地头损坏`);
    const lNameLen = u16(bytes, localOffset + 26);
    const lExtraLen = u16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    let data = bytes.slice(dataStart, dataStart + compSize);
    if (flags & 0x1) {
      if (!password) {
        throw new Error(`「${name}」已加密：请输入导出时得到的解压密码（微信支付的通知消息 / 支付宝邮件里可查）`);
      }
      const plain = zipCryptoDecrypt(data, password);
      const check = plain[11];
      if (check !== ((crc >>> 24) & 0xff) && check !== ((modTime >>> 8) & 0xff)) {
        throw new Error('解压密码不对（微信账单密码在「微信支付」通知消息里；支付宝密码在你申请导出时设置）');
      }
      data = plain.slice(12);
    }
    if (method === 8) data = await inflateRawAsync(data);
    out.push({ name, bytes: data, encrypted: !!(flags & 0x1) });
  }
  if (!out.length) throw new Error('压缩包里没有可读取的条目');
  return out;
}

// ── 文本解码（strict UTF-8 → GBK 回退） ─────────────────────────────────────
function tryDecode(bytes, enc, fatal) {
  try {
    const t = new TextDecoder(enc, { fatal }).decode(bytes);
    return fatal && /\uFFFD/.test(t) ? null : t;
  } catch (_) {
    return null;
  }
}

/**
 * 账单文本解码：两个候选都试，能被 detectSource 认出的优先——
 * GBK 字节偶有恰好合法的 UTF-8 序列，单凭 strict 解码不够稳。
 */
function decodeBillText(bytes) {
  const utf8 = tryDecode(bytes, 'utf-8', true);
  const gbk = utf8 === null ? tryDecode(bytes, 'gbk', false) : null;
  const cands = [];
  if (utf8 !== null) cands.push(utf8);
  if (gbk !== null && gbk !== utf8) cands.push(gbk);
  if (!cands.length) {
    throw new Error('无法解码文件（不是 UTF-8 也不是 GBK 文本）：请用记事本另存为 UTF-8 后重试');
  }
  for (const t of cands) {
    if (detectSource(t)) return t;
  }
  return cands[0]; // 让 detectSource 报出更贴切的错误
}

// ── CSV（RFC4180：引号、双引转义、\r\n） ────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

const normCell = (s) => String(s || '').trim().replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');

/** 在 rows 里找表头行：mustHave 的列名（归一后）都在该行出现；返回整行列名→下标映射（全部列可取） */
function findHeaderRow(rows, mustHave) {
  for (let i = 0; i < rows.length; i++) {
    const normed = rows[i].map(normCell);
    let hit = 0;
    for (const want of mustHave) {
      if (normed.includes(want)) hit++;
    }
    if (hit === mustHave.length) {
      const col = {};
      normed.forEach((name, at) => {
        if (name && !(name in col)) col[name] = at;
      });
      return { headerIdx: i, col };
    }
  }
  return null;
}

// ── 金额（分） ───────────────────────────────────────────────────────────────
/** "¥35.00"/"1,234.56"/"0.05" → 整数分；负数/非法/空 → null。全程字符串拆解，不碰浮点。 */
function moneyToFen(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[¥￥\s,，]/g, '').trim();
  if (!s || s.startsWith('-') || s.startsWith('+')) return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const yuan = m[1];
  const cents = (m[2] || '').padEnd(2, '0');
  const v = Number(yuan) * 100 + Number(cents);
  if (!Number.isSafeInteger(v)) return null;
  return v;
}
function fenToYuan(fen) {
  const n = Number(fen) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// ── 时间 ────────────────────────────────────────────────────────────────────
/** '2025-10-01 12:30:45' / '2025/10/1 12:30' → 'YYYY-MM-DD HH:mm:ss'；认不出 → null */
function normDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace('T', ' ').replace(/\//g, '-');
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const pad = (x) => String(Number(x)).padStart(2, '0');
  const d = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if (Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return null;
  return `${d} ${pad(m[4] || 0)}:${pad(m[5] || 0)}:${pad(m[6] || 0)}`;
}
const monthKeyOf = (date) => (date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : '');
const dayOf = (date) => (date ? date.slice(0, 10) : '');

// ── 来源识别 ────────────────────────────────────────────────────────────────
function detectSource(text) {
  if (!text) return null;
  const head = text.slice(0, 4000);
  if (head.includes('微信支付账单明细') || head.includes('微信支付交易明细证明')) return 'wechat';
  if (head.includes('支付宝') && (head.includes('交易记录明细') || head.includes('交易流水') || head.includes('交易号'))) return 'alipay';
  return null;
}

// ── 微信解析（UTF-8；金额带 ¥；收/支：收入/支出/中性交易） ────────────────────
const WECHAT_COLS = ['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)', '交易单号'];
function parseWechatCsv(text) {
  const rows = parseCsv(text);
  const found = findHeaderRow(rows, WECHAT_COLS);
  if (!found) throw new Error('不像微信账单 CSV：找不到「交易时间/金额/交易单号」表头行');
  const c = found.col;
  const out = [];
  for (let i = found.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normDate(r[c['交易时间']]);
    const amountFen = moneyToFen(r[c['金额(元)']]);
    if (!date || amountFen === null || amountFen <= 0) continue;
    const dirRaw = normCell(r[c['收/支']]);
    const type = cut(r[c['交易类型']]);
    let dir = 'neutral';
    if (dirRaw === '收入') dir = 'in';
    else if (dirRaw === '支出') dir = 'out';
    out.push({
      src: 'wechat', date, dir,
      type,
      name: cut(r[c['交易对方']]),
      item: cut(r[c['商品']]),
      amountFen,
      refundFen: 0,
      status: cut(r[c['当前状态']] || ''),
      method: cut(r[c['支付方式']] || ''),
      tradeNo: cut(r[c['交易单号']] || ''),
      mOrderNo: cut(r[c['商户单号']] || ''),
      note: cut(r[c['备注']] || ''),
    });
  }
  return out;
}

// ── 支付宝解析（GBK；逗号或 | 分隔；有「成功退款」列） ────────────────────────
const ALIPAY_COLS = ['交易号', '交易创建时间', '交易对方', '金额(元)', '收/支', '交易状态'];
function parseAlipayCsv(text) {
  let rows = parseCsv(text);
  let found = findHeaderRow(rows, ALIPAY_COLS);
  if (!found) {
    // 官方某些版本用 | 分隔的 txt
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    rows = lines.map((l) => l.split('|'));
    found = findHeaderRow(rows, ALIPAY_COLS);
    if (!found) throw new Error('不像支付宝账单 CSV：找不到「交易号/金额/交易状态」表头行');
  }
  const c = found.col;
  const colAt = (name) => (c[name] !== undefined ? c[name] : -1);
  const iPay = colAt('付款时间');
  const iCreate = colAt('交易创建时间');
  const iType = colAt('类型');
  const iItem = colAt('商品名称');
  const iMethod = colAt('收/付款方式') >= 0 ? colAt('收/付款方式')
    : (colAt('付款方式') >= 0 ? colAt('付款方式') : -1);
  const iRefund = colAt('成功退款(元)');
  const iOrder = colAt('商家订单号');
  const iNote = colAt('备注');
  const out = [];
  for (let i = found.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const date = normDate((iPay >= 0 && r[iPay]) || (iCreate >= 0 ? r[iCreate] : ''));
    const amountFen = moneyToFen(c['金额(元)'] !== undefined ? r[c['金额(元)']] : '');
    if (!date || amountFen === null || amountFen <= 0) continue;
    const status = cut(r[c['交易状态']] || '');
    const dirRaw = normCell(r[c['收/支']]);
    let dir = 'neutral';
    if (dirRaw === '收入') dir = 'in';
    else if (dirRaw === '支出') dir = 'out';
    // 交易关闭/失败 = 钱没动过；退款成功的净额行为由 refundFen 表达
    if (/关闭|失败/.test(status)) dir = 'neutral';
    const refundFen = iRefund >= 0 ? (moneyToFen(r[iRefund]) || 0) : 0;
    out.push({
      src: 'alipay', date, dir,
      type: cut(iType >= 0 ? r[iType] : ''),
      name: cut(r[c['交易对方']]),
      item: cut(iItem >= 0 ? r[iItem] : ''),
      amountFen,
      refundFen: Math.max(0, refundFen),
      status,
      method: cut(iMethod >= 0 ? r[iMethod] : ''),
      tradeNo: cut(r[c['交易号']] || ''),
      mOrderNo: cut(iOrder >= 0 ? r[iOrder] : ''),
      note: cut(iNote >= 0 ? r[iNote] : ''),
    });
  }
  return out;
}

function cut(s) {
  const t = String(s || '').trim();
  return t.length > MAX_FIELD ? t.slice(0, MAX_FIELD) : t;
}

/** 批次 id：sha256 随机源前 12 位（同一次导入动作一个批次；重导产生新批次） */
function newImportId(seed) {
  return sha256Hex(`duzhi-import|${seed || ''}|${Date.now()}|${Math.random()}`).slice(0, 12);
}

// ── 交易规范化与 id ──────────────────────────────────────────────────────────
/**
 * 微信退款行的收/支列不可靠（不同版本口径不一）：统一以「交易类型含退款」为准，
 * 记为退款行（amount 计入 refundFen 通道，不进收支）。
 */
function isRefundRow(t) {
  return t.src === 'wechat' && /退款/.test(t.type || '');
}
function txnIdOf(t) {
  return sha256Hex(`${t.src}|${t.tradeNo}|${t.amountFen}|${t.date}|${t.dir}`).slice(0, 16);
}
function buildTxns(rawRows, source, importId, at) {  const txns = [];
  for (const r of rawRows) {
    const t = {
      id: '',
      src: r.src || source,
      tradeNo: r.tradeNo || '',
      mOrderNo: r.mOrderNo || '',
      date: r.date,
      name: r.name || '',
      item: r.item || '',
      type: r.type || '',
      dir: DIRS.includes(r.dir) ? r.dir : 'neutral',
      amountFen: r.amountFen,
      refundFen: r.refundFen || 0,
      status: r.status || '',
      method: r.method || '',
      note: r.note || '',
      importId,
      at,
    };
    if (isRefundRow(t)) t.refundFen = t.amountFen;
    t.id = txnIdOf(t);
    txns.push(t);
  }
  return txns;
}

// ── 顶层入口：文件字节 → {source, rows, csvName} ────────────────────────────
function looksZip(bytes) {
  return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
}
/**
 * 解析账单文件字节。zip（可带密码）→ 取包内最大的 .csv/.txt；裸 CSV 直接解码。
 * 返回 {source:'wechat'|'alipay', rows:RawTxn[], csvName}；认不出账单头时抛带指引的错误。
 */
async function parseBillFile(bytes, { password } = {}) {
  if (!bytes || !bytes.length) throw new Error('文件是空的');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('文件超过 64MB 上限，疑似拿错文件');
  let text;
  let csvName = '';
  if (looksZip(bytes)) {
    const entries = await unzip(bytes, { password });
    const csvs = entries.filter((e) => /\.(csv|txt)$/i.test(e.name));
    if (!csvs.length) {
      throw new Error(`压缩包里没有 CSV/TXT 账单（只有：${entries.slice(0, 3).map((e) => e.name).join('、')}…）：请检查是否拿对了文件`);
    }
    csvs.sort((a, b) => b.bytes.length - a.bytes.length);
    csvName = csvs[0].name;
    text = decodeBillText(csvs[0].bytes);
  } else {
    text = decodeBillText(bytes);
  }
  const source = detectSource(text);
  if (!source) {
    throw new Error('认不出这是微信还是支付宝账单（没有账单抬头）：请确认导出的是「微信支付账单明细」或「支付宝交易记录明细」的 CSV');
  }
  const rows = source === 'wechat' ? parseWechatCsv(text) : parseAlipayCsv(text);
  if (!rows.length) {
    throw new Error(`账单头认出来了（${source === 'wechat' ? '微信' : '支付宝'}），但没有解析出任何一笔交易：文件可能只有说明页`);
  }
  return { source, rows, csvName };
}

// ── 月桶（分片）──────────────────────────────────────────────────────────────
const monthKeyBase = (ym) => `${MONTH_PREFIX}${ym}`;
const monthShardKey = (ym, part) => (part <= 1 ? monthKeyBase(ym) : `${MONTH_PREFIX}${ym}#${part}`);
/** 从全部键里挑出某月所有分片键，按 part 升序 */
function monthShardKeys(allKeys, ym) {
  const base = monthKeyBase(ym);
  const withPrefix = allKeys
    .filter((k) => k === base || k.startsWith(`${base}#`))
    .map((k) => {
      const n = k === base ? 1 : Number(k.slice(base.length + 1));
      return { k, part: Number.isFinite(n) ? n : 1 };
    });
  withPrefix.sort((a, b) => a.part - b.part);
  return withPrefix.map((x) => x.k);
}
/** 全量交易按月分组：[{ym, txns}]，月升序 */
function groupByMonth(txns) {
  const map = new Map();
  for (const t of txns) {
    const ym = monthKeyOf(t.date);
    if (!ym) continue;
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym).push(t);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ym, list]) => ({ ym, txns: list }));
}
/** union by id（保持既有在前），返回 {all, added, dup} —— 重复导入天然幂等 */
function mergeTxns(existing, incoming) {
  const seen = new Set(existing.map((t) => t.id));
  const added = [];
  for (const t of incoming) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    added.push(t);
  }
  return { all: existing.concat(added), added, dup: incoming.length - added.length };
}
/** 整月按 SHARD_CAP 切片：[{part, txns}]（part 从 1 起） */
function packShards(txns) {
  const parts = [];
  for (let i = 0; i < txns.length; i += SHARD_CAP) {
    parts.push({ part: parts.length + 1, txns: txns.slice(i, i + SHARD_CAP) });
  }
  if (!parts.length) parts.push({ part: 1, txns: [] });
  return parts;
}
/** 按 importId 摘除批次交易（撤销导入） */
function removeByImport(txns, importId) {
  const keep = txns.filter((t) => t.importId !== importId);
  return { keep, removed: txns.length - keep.length };
}

// ── 分类规则 ────────────────────────────────────────────────────────────────
/** 内置默认规则（用户规则优先于内置；同组内首个命中生效） */
const DEFAULT_RULES = [
  { kw: '瑞幸', cat: '咖啡奶茶' }, { kw: '星巴克', cat: '咖啡奶茶' }, { kw: '蜜雪', cat: '咖啡奶茶' },
  { kw: '喜茶', cat: '咖啡奶茶' }, { kw: '库迪', cat: '咖啡奶茶' }, { kw: '咖啡', cat: '咖啡奶茶' },
  { kw: '外卖', cat: '餐饮' }, { kw: '美团', cat: '餐饮' }, { kw: '饿了么', cat: '餐饮' },
  { kw: '餐厅', cat: '餐饮' }, { kw: '饭店', cat: '餐饮' }, { kw: '小吃', cat: '餐饮' }, { kw: '烧烤', cat: '餐饮' },
  { kw: '盒马', cat: '买菜' }, { kw: '叮咚', cat: '买菜' }, { kw: '菜市场', cat: '买菜' },
  { kw: '生鲜', cat: '买菜' }, { kw: '超市', cat: '买菜' },
  { kw: '滴滴', cat: '交通' }, { kw: '打车', cat: '交通' }, { kw: '地铁', cat: '交通' }, { kw: '公交', cat: '交通' },
  { kw: '12306', cat: '交通' }, { kw: '铁路', cat: '交通' }, { kw: '机票', cat: '交通' }, { kw: '航空', cat: '交通' },
  { kw: '加油', cat: '交通' }, { kw: '停车', cat: '交通' }, { kw: '单车', cat: '交通' },
  { kw: '淘宝', cat: '网购' }, { kw: '天猫', cat: '网购' }, { kw: '京东', cat: '网购' },
  { kw: '拼多多', cat: '网购' }, { kw: '唯品会', cat: '网购' },
  { kw: '话费', cat: '通讯' }, { kw: '宽带', cat: '通讯' }, { kw: '联通', cat: '通讯' }, { kw: '电信', cat: '通讯' },
  { kw: '水费', cat: '居家水电' }, { kw: '电费', cat: '居家水电' }, { kw: '燃气', cat: '居家水电' },
  { kw: '物业', cat: '居家水电' }, { kw: '房租', cat: '居家水电' },
  { kw: '医院', cat: '医疗' }, { kw: '药店', cat: '医疗' }, { kw: '药房', cat: '医疗' }, { kw: '挂号', cat: '医疗' },
  { kw: '电影', cat: '文娱' }, { kw: '游戏', cat: '文娱' }, { kw: '视频会员', cat: '文娱' },
  { kw: '音乐', cat: '文娱' }, { kw: 'KTV', cat: '文娱' },
  { kw: '课程', cat: '学习' }, { kw: '学费', cat: '学习' }, { kw: '培训', cat: '学习' }, { kw: '书店', cat: '学习' },
  { kw: '红包', cat: '人情往来' }, { kw: '转账', cat: '人情往来' }, { kw: '亲属卡', cat: '人情往来' },
  { kw: '余额宝', cat: '理财' }, { kw: '零钱通', cat: '理财' }, { kw: '基金', cat: '理财' }, { kw: '理财', cat: '理财' },
];
function normalizeRules(raw) {
  const src = raw && Array.isArray(raw.rules) ? raw.rules : [];
  const seen = new Set();
  const rules = [];
  for (const r of src) {
    if (!r || typeof r !== 'object') continue;
    const kw = cut(r.kw);
    const cat = cut(r.cat);
    if (!kw || !cat || seen.has(kw)) continue;
    seen.add(kw);
    rules.push({ kw, cat });
  }
  return { rules: rules.slice(0, 200) };
}
function matchRule(t, rules) {
  const hay = `${t.name}\n${t.item}\n${t.type}`;
  for (const r of rules) {
    if (hay.includes(r.kw)) return r.cat;
  }
  return null;
}
function categorize(t, userRules, overrides) {
  const ov = overrides && typeof overrides === 'object' ? overrides[t.id] : null;
  if (ov && typeof ov.cat === 'string' && ov.cat) return ov.cat;
  const u = matchRule(t, userRules || []);
  if (u) return u;
  const d = matchRule(t, DEFAULT_RULES);
  return d || '其他';
}

// ── 透视 ────────────────────────────────────────────────────────────────────
/**
 * 汇总透视。dir=out 且非退款行的计入支出分类；
 * 退款行（wechat 类型含退款 / alipay refundFen）单列不计收支。
 * 返回 {months, categories, merchants, totals, neutralCount}
 */
function aggregate(txns, { userRules, overrides, limitMerchants = 8 } = {}) {
  const monthMap = new Map();
  const catMap = new Map();
  const merMap = new Map();
  const totals = { inFen: 0, outFen: 0, refundFen: 0, netFen: 0, count: txns.length };
  let neutralCount = 0;
  for (const t of txns) {
    const ym = monthKeyOf(t.date);
    const refund = isRefundRow(t) ? t.amountFen : (t.refundFen || 0);
    const outPart = t.dir === 'out' && !isRefundRow(t) ? t.amountFen : 0;
    const inPart = t.dir === 'in' && !isRefundRow(t) ? t.amountFen : 0;
    if (t.dir === 'neutral' && !isRefundRow(t)) neutralCount++;
    if (ym) {
      if (!monthMap.has(ym)) monthMap.set(ym, { ym, inFen: 0, outFen: 0, refundFen: 0, netFen: 0, count: 0 });
      const m = monthMap.get(ym);
      m.inFen += inPart;
      m.outFen += outPart;
      m.refundFen += refund;
      m.netFen = m.inFen - m.outFen + m.refundFen;
      m.count++;
    }
    totals.inFen += inPart;
    totals.outFen += outPart;
    totals.refundFen += refund;
    if (outPart > 0) {
      const cat = categorize(t, userRules, overrides);
      if (!catMap.has(cat)) catMap.set(cat, { cat, outFen: 0, count: 0 });
      const c = catMap.get(cat);
      c.outFen += outPart;
      c.count++;
      const mer = t.name || '(未知商户)';
      if (!merMap.has(mer)) merMap.set(mer, { name: mer, outFen: 0, count: 0 });
      const m = merMap.get(mer);
      m.outFen += outPart;
      m.count++;
    }
  }
  totals.netFen = totals.inFen - totals.outFen + totals.refundFen;
  const months = [...monthMap.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1));
  const categories = [...catMap.values()].sort((a, b) => b.outFen - a.outFen);
  const merchants = [...merMap.values()].sort((a, b) => b.outFen - a.outFen).slice(0, limitMerchants);
  return { months, categories, merchants, totals, neutralCount };
}

/** 通用筛选（面板明细 + duzhi_query 共用口径） */
function filterTxns(txns, q) {
  const kw = (q.keyword || '').trim().toLowerCase();
  const min = Number.isFinite(q.minFen) ? q.minFen : null;
  const max = Number.isFinite(q.maxFen) ? q.maxFen : null;
  const from = dayOf(q.from || '');
  const to = dayOf(q.to || '');
  return txns.filter((t) => {
    if (q.dir && DIRS.includes(q.dir) && t.dir !== q.dir) return false;
    if (q.month && monthKeyOf(t.date) !== q.month) return false;
    if (from && dayOf(t.date) < from) return false;
    if (to && dayOf(t.date) > to) return false;
    if (q.category) {
      if (categorize(t, q.userRules, q.overrides) !== q.category) return false;
    }
    if (min !== null && t.amountFen < min) return false;
    if (max !== null && t.amountFen > max) return false;
    if (kw) {
      const hay = `${t.name}\n${t.item}\n${t.type}\n${t.note}\n${t.method}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ── 导出 ────────────────────────────────────────────────────────────────────
const CSV_COLS = ['date', 'dir', 'amountFen', 'category', 'name', 'item', 'type', 'status', 'method', 'src', 'tradeNo', 'note'];
function csvEscape(s) {
  const t = String(s ?? '');
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function exportCsv(txns, userRules, overrides) {
  const head = ['时间', '方向', '金额(元)', '分类', '交易对方', '商品', '类型', '状态', '支付方式', '来源', '单号', '备注'];
  const lines = [head.join(',')];
  for (const t of txns) {
    const row = {
      date: t.date, dir: DIR_NAMES[t.dir] || t.dir, amountFen: fenToYuan(t.amountFen),
      category: categorize(t, userRules, overrides), name: t.name, item: t.item, type: t.type,
      status: t.status, method: t.method, src: t.src, tradeNo: t.tradeNo, note: t.note,
    };
    lines.push(CSV_COLS.map((k) => csvEscape(row[k])).join(','));
  }
  return lines.join('\r\n');
}

module.exports = {
  SHARD_CAP, MONTH_PREFIX, IMPORT_PREFIX, CAT_PREFIX, RULES_KEY,
  DIRS, DIR_NAMES, DEFAULT_RULES, MAX_FILE_BYTES,
  crc32Of, zipCryptoDecrypt, unzip, inflateRawAsync,
  decodeBillText, parseCsv, findHeaderRow, detectSource,
  moneyToFen, fenToYuan, normDate, monthKeyOf, dayOf, newImportId,
  parseWechatCsv, parseAlipayCsv, parseBillFile, isRefundRow,
  buildTxns, txnIdOf, groupByMonth, mergeTxns, packShards,
  monthShardKeys, monthKeyBase, monthShardKey, removeByImport,
  normalizeRules, categorize, matchRule, aggregate, filterTxns,
  exportCsv, csvEscape,
};
