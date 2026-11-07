'use strict';
/**
 * mask-core.js —— 数据脱敏台纯函数核心（面板 / 服务 / MCP / 单测四方共用）
 *
 * 设计铁律（与 keyscan scan-core 同款纪律）：
 *   1. 零 IO、零依赖（面板 esbuild 内联本文件也能跑）。
 *   2. 不泄露不变量：maskText 的输出【不含任何被检测到的原值】——每个命中都被替换，
 *      且替换值 ≠ 原值（假名碰撞自动回退 label）。映射台账（original→out）永不进
 *      输出/日志/MCP 返回；displayPreview 是原值在任何通道里唯一允许的形态（前2后2）。
 *   3. 确定性：同一 (type, 原值, salt) → 永远同一替换值。跨文件、跨批次、跨会话
 *      「同原值同假名」，AI 分析多份数据时人物/账户关联性不散架。
 *   4. 校验位优先：身份证 ISO 7064 MOD 11-2、银行卡 Luhn、手机号段表、统一社会
 *      信用代码 GB 32100 —— 用校验位把值级检测的误报压到近零，而非裸正则乱抓。
 *   5. 大数精度安全：全程不 JSON.parse —— 结构感知靠「原始文本上的键正则」，
 *      18 位身份证数字永不经过 JS Number（2^53 精度陷阱）。
 *   6. 可逆边界：partial（部分打码）天然不可还原；fake（确定性假名）/ label（占位
 *      标签）的映射进台账，可在面板还原。台账含原值，只存本机 kv，重置即销毁。
 *      服务与 MCP 永不提供还原。
 */

// ── 哈希与随机（确定性来源）──────────────────────────────────────────────────

/** FNV-1a 双通道 64bit 指纹（hex 16 位）：台账身份对齐用，非密码学哈希 */
function fnv1a64(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  const p1 = 0x01000193;
  const p2 = (0x01000193 ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, p1) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), p2) >>> 0;
  }
  h1 = (h1 ^ (h2 >>> 5)) >>> 0;
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}

/** 32bit 种子（假名生成器的确定性输入） */
function seedOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** mulberry32：确定性伪随机流（同种子同序列，零依赖） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 新台账盐（面板/服务生成一次存 kv；重置台账时更换 → 全部假名换血） */
function genSalt() {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 16; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

// ── 校验器 ──────────────────────────────────────────────────────────────────

/** 银行卡 Luhn 校验 */
function luhnValid(digits) {
  const s = String(digits);
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** 身份证：省份码 + 出生日期 + ISO 7064 MOD 11-2 校验 */
const IDCARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const IDCARD_CHECK = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
const PROVINCE_CODES = new Set([
  '11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35',
  '36', '37', '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54',
  '61', '62', '63', '64', '65', '71', '81', '82',
]);
function idcardValid(s) {
  const v = String(s).toUpperCase();
  if (!/^\d{17}[0-9X]$/.test(v)) return false;
  if (!PROVINCE_CODES.has(v.slice(0, 2))) return false;
  const y = +v.slice(6, 10), m = +v.slice(10, 12), d = +v.slice(12, 14);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (+v[i]) * IDCARD_WEIGHTS[i];
  return IDCARD_CHECK[sum % 11] === v[17];
}

/** 手机号段表（工信部现网号段） */
const PHONE_SEGMENTS = [
  '130', '131', '132', '133', '134', '135', '136', '137', '138', '139',
  '145', '146', '147', '148', '149',
  '150', '151', '152', '153', '155', '156', '157', '158', '159',
  '162', '165', '166', '167',
  '170', '171', '172', '173', '174', '175', '176', '177', '178',
  '180', '181', '182', '183', '184', '185', '186', '187', '188', '189',
  '190', '191', '192', '193', '195', '196', '197', '198', '199',
];
const PHONE_SEG_SET = new Set(PHONE_SEGMENTS);
function phoneValid(s) {
  return /^1\d{10}$/.test(s) && PHONE_SEG_SET.has(s.slice(0, 3));
}

/** 统一社会信用代码 GB 32100-2015 校验（字符集去 I/O/Z/S/V） */
const USCC_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
function usccValid(s) {
  const v = String(s).toUpperCase();
  if (!/^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += USCC_CHARS.indexOf(v[i]) * USCC_WEIGHTS[i];
  return USCC_CHARS[(31 - (sum % 31)) % 31] === v[17];
}

/** IPv4 形态与私有/保留段判定 */
function ipv4Valid(s) {
  const p = String(s).split('.');
  if (p.length !== 4) return false;
  return p.every((x) => /^\d{1,3}$/.test(x) && +x >= 0 && +x <= 255);
}
function ipv4Private(s) {
  const p = String(s).split('.').map(Number);
  if (p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  return false;
}

/** 车牌（大陆普通+新能源） */
const PLATE_RE = /[京津沪渝冀晋蒙辽吉黑苏浙皖闽赣鲁豫鄂湘粤桂琼川贵云藏陕甘青宁新使领][A-HJ-NP-Z][·•]?[A-HJ-NP-Z0-9]{5,6}(?![A-HJ-NP-Z0-9])/;
function plateValid(s) {
  const body = String(s).replace(/[·•]/g, '').slice(2);
  if (body.length === 5) return /^[A-HJ-NP-Z0-9]{5}$/.test(body);
  if (body.length === 6) return /[DF]/.test(body) || /[A-HJ-NP-Z]/.test(body.slice(1));
  return false;
}

// ── 假名生成（确定性、保格式、保校验）───────────────────────────────────────

const FAKE_REGIONS = [
  '110101', '110105', '310104', '310115', '440305', '440304', '330102', '330106',
  '510107', '510104', '420102', '420111', '320102', '320105', '610102', '610113',
  '120101', '120104', '500103', '500105', '370202', '370212', '430104', '430111',
  '140105', '410105', '220104', '230103', '340111', '350102', '360103', '450103',
  '530102', '520102', '620102', '460105', '150102', '210102', '650102', '540102',
];
const SURNAME_LIST = [
  '王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '肖', '田', '董', '潘', '袁', '蔡', '蒋', '余',
  '于', '杜', '叶', '程', '苏', '魏', '吕', '丁', '任', '卢', '姚', '沈', '钟', '姜', '崔', '谭', '陆', '范', '汪', '廖',
  '石', '金', '韦', '贾', '夏', '付', '方', '邹', '熊', '白', '孟', '秦', '邱', '侯', '江', '尹', '薛', '闫', '段', '雷',
  '龙', '黎', '史', '陶', '贺', '毛', '郝', '顾', '龚', '邵', '万', '钱', '严', '覃', '武', '戴', '莫', '孔', '向', '汤',
];
const COMPOUND_SURNAMES = ['欧阳', '上官', '司马', '诸葛', '东方', '皇甫', '司徒', '长孙', '慕容', '尉迟'];
const GIVEN_CHARS = '伟芳娜敏静磊军洋勇艳杰娟涛明超秀兰霞平刚桂英华健文斌丽强峰鑫昊晨悦佳怡欣子轩浩宇思远雨桐梦琪淑德福贵'.split('');
const GIVEN_PAIRS = ['建国', '志强', '秀兰', '桂英', '建军', '淑华', '国庆', '德华', '俊杰', '欣怡', '子轩', '雨桐', '梦琪', '思远', '浩宇', '晓东', '文博', '雅静', '海燕', '春花'];

function fakeName(salt, original) {
  const rnd = mulberry32(seedOf(salt + '|cname|' + original));
  const len = original.length;
  if (len <= 2) {
    return SURNAME_LIST[Math.floor(rnd() * SURNAME_LIST.length)]
      + GIVEN_CHARS[Math.floor(rnd() * GIVEN_CHARS.length)];
  }
  if (len >= 4 && rnd() < 0.25) {
    return COMPOUND_SURNAMES[Math.floor(rnd() * COMPOUND_SURNAMES.length)]
      + GIVEN_CHARS[Math.floor(rnd() * GIVEN_CHARS.length)]
      + GIVEN_CHARS[Math.floor(rnd() * GIVEN_CHARS.length)];
  }
  return SURNAME_LIST[Math.floor(rnd() * SURNAME_LIST.length)]
    + GIVEN_PAIRS[Math.floor(rnd() * GIVEN_PAIRS.length)];
}

function fakePhone(salt, original) {
  const rnd = mulberry32(seedOf(salt + '|phone|' + original));
  // 国内测试数据惯例：13x + 0000 中段 + 随机 4 位。README 注明：仍可能撞号，仅供测试。
  const seg = '13' + Math.floor(rnd() * 10);
  const tail = String(Math.floor(rnd() * 10000)).padStart(4, '0');
  return seg + '0000' + tail;
}

function fakeIdcard(salt, original) {
  const rnd = mulberry32(seedOf(salt + '|idcard|' + original));
  const region = FAKE_REGIONS[Math.floor(rnd() * FAKE_REGIONS.length)];
  const y = 1960 + Math.floor(rnd() * 46);
  const m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * 28);
  const birth = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  const seq = String(Math.floor(rnd() * 1000)).padStart(3, '0');
  const body = region + birth + seq;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (+body[i]) * IDCARD_WEIGHTS[i];
  return body + IDCARD_CHECK[sum % 11];
}

function fakeBankcard(salt, original) {
  const rnd = mulberry32(seedOf(salt + '|bankcard|' + original));
  const len = Math.min(19, Math.max(13, original.replace(/\D/g, '').length));
  const head = original.replace(/\D/g, '').startsWith('4') ? '45' : '62';
  let body = head;
  while (body.length < len - 1) body += Math.floor(rnd() * 10);
  body = body.slice(0, len - 1);
  let sum = 0, alt = true; // 补 Luhn 校验位
  for (let i = body.length - 1; i >= 0; i--) {
    let d = body.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return body + ((10 - (sum % 10)) % 10);
}

function fakeEmail(salt, original) {
  return 'u' + fnv1a64(salt + '|email|' + original).slice(0, 6) + '@example.com';
}
function fakeIpv4(salt, original) {
  // RFC 5737 TEST-NET-3（203.0.113.0/24）专用于文档/示例，不撞真实主机
  const rnd = mulberry32(seedOf(salt + '|ipv4|' + original));
  return '203.0.113.' + (1 + Math.floor(rnd() * 253));
}
function fakePlate(salt, original) {
  const rnd = mulberry32(seedOf(salt + '|plate|' + original));
  const prov = '京津沪渝冀晋蒙辽吉黑苏浙皖闽赣鲁豫鄂湘粤桂琼川贵云藏陕甘青宁新'[Math.floor(rnd() * 31)];
  const letters = 'ABCDEFGHJKLMNP';
  const city = letters[Math.floor(rnd() * letters.length)];
  const tail = String(Math.floor(rnd() * 100000)).padStart(5, '0');
  return prov + city + tail;
}
function fakeUscc(salt, original) {
  const rnd = mulberry32(seedOf(salt + '|uscc|' + original));
  let body = '9111000';
  while (body.length < 17) body += USCC_CHARS[Math.floor(rnd() * USCC_CHARS.length)];
  body = body.slice(0, 17);
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += USCC_CHARS.indexOf(body[i]) * USCC_WEIGHTS[i];
  return body + USCC_CHARS[(31 - (sum % 31)) % 31];
}

// ── 部分打码（保格式、保可读性、天然不可还原）───────────────────────────────

const stars = (n) => '*'.repeat(Math.max(0, n));
function partialPhone(s) { return s.slice(0, 3) + stars(4) + s.slice(7); }               // 138****5678
function partialIdcard(s) { return s.slice(0, 3) + stars(s.length - 7) + s.slice(-4); }  // 110***********012X
function partialBankcard(s, spaced) {
  const digits = s.replace(/\D/g, '');
  if (spaced) { // 保留分组空格布局，仅掩码中间数字
    let i = 0;
    return s.replace(/\d/g, (d) => (++i > 4 && i <= digits.length - 4 ? '*' : d));
  }
  return s.slice(0, 4) + stars(s.length - 8) + s.slice(-4);
}
function partialEmail(s) {
  const at = s.indexOf('@');
  if (at <= 0) return '〔邮箱〕';
  return s.slice(0, 1) + stars(Math.max(3, at - 1)) + s.slice(at);
}
function partialIpv4(s) {
  const p = s.split('.');
  return p[0] + '.' + p[1] + '.*.*';
}
function partialPlate(s) { return s.slice(0, 2) + stars(s.length - 4) + s.slice(-2); }
function partialUscc(s) { return s.slice(0, 4) + stars(s.length - 8) + s.slice(-4); }
function partialCname(s) { return s[0] + stars(s.length - 1); }

// ── 类型定义 ────────────────────────────────────────────────────────────────

/**
 * TYPES：检测类型目录。
 *   priority      重叠裁决（大者胜）
 *   defaultMode   默认模式（partial/fake/label）
 *   confirm       姓名类需人工复核（面板显著标注）
 *   structuralOnly仅结构感知（键驱动）可用，自由文本不检测
 */
const TYPES = {
  email: {
    label: '邮箱', priority: 90, defaultMode: 'partial', confirm: false,
    detect: (s) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(s) && s.length <= 254,
    partial: (s) => partialEmail(s), fake: (salt, s) => fakeEmail(salt, s),
  },
  idcard: {
    label: '身份证号', priority: 88, defaultMode: 'partial', confirm: false,
    detect: (s) => idcardValid(s),
    partial: (s) => partialIdcard(s), fake: (salt, s) => fakeIdcard(salt, s),
  },
  uscc: {
    label: '统一社会信用代码', priority: 86, defaultMode: 'partial', confirm: false,
    detect: (s) => usccValid(s),
    partial: (s) => partialUscc(s), fake: (salt, s) => fakeUscc(salt, s),
  },
  bankcard: {
    label: '银行卡号', priority: 84, defaultMode: 'partial', confirm: false,
    detect: (s) => luhnValid(s),
    partial: (s, spaced) => partialBankcard(s, spaced), fake: (salt, s) => fakeBankcard(salt, s),
  },
  ipv4: {
    label: 'IP 地址', priority: 72, defaultMode: 'partial', confirm: false,
    detect: (s) => ipv4Valid(s),
    partial: (s) => partialIpv4(s), fake: (salt, s) => fakeIpv4(salt, s),
  },
  plate: {
    label: '车牌号', priority: 70, defaultMode: 'partial', confirm: false,
    detect: (s) => plateValid(s),
    partial: (s) => partialPlate(s), fake: (salt, s) => fakePlate(salt, s),
  },
  phone: {
    label: '手机号', priority: 60, defaultMode: 'partial', confirm: false,
    detect: (s) => phoneValid(s),
    partial: (s) => partialPhone(s), fake: (salt, s) => fakePhone(salt, s),
  },
  cname: {
    label: '中文姓名', priority: 50, defaultMode: 'label', confirm: true,
    detect: () => false, // 自由文本姓名只靠上下文模式（见 CNAME_PATTERNS）
    partial: (s) => partialCname(s), fake: (salt, s) => fakeName(salt, s),
  },
  // 以下仅结构感知（键名驱动），自由文本不检测 —— 近零误报
  address: {
    label: '地址', priority: 94, defaultMode: 'label', confirm: false, structuralOnly: true,
    detect: () => false,
    partial: () => '〔地址〕', fake: () => '〔地址〕',
  },
  birthday: {
    label: '出生日期', priority: 94, defaultMode: 'label', confirm: false, structuralOnly: true,
    detect: () => false,
    partial: () => '〔出生日期〕', fake: () => '〔出生日期〕',
  },
};
const MAX_HITS = 100000; // 单文本命中上限（1MB 高密度日志可含 1 万+ PII，不可提前熔断）
const TYPE_ORDER = Object.keys(TYPES);
const MODES = ['partial', 'fake', 'label'];

// ── 中文姓名上下文模式（非激进，结构性信号）─────────────────────────────────

const CN = '[\\u4e00-\\u9fa5]';
const SURNAME_CLASS = '[王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蔡蒋余于杜叶程苏魏吕丁任卢姚沈钟姜崔谭陆范汪廖石金韦贾夏付方邹熊白孟秦邱侯江尹薛闫段雷龙黎史陶贺毛郝顾龚邵万钱严覃武戴莫孔向汤]';
const COMPOUND_CLASS = '(?:欧阳|上官|司马|诸葛|东方|皇甫|司徒|长孙|慕容|尉迟)';
const NAME_BODY = `(?:${COMPOUND_CLASS}${CN}{0,2}|${SURNAME_CLASS}${CN}{1,3})`;
const NAME_ROLE_RE = '姓名|联系人|负责人|患者|客户|会员|员工|申请人|经办人|收款人|付款人|领款人|户名|车主|司机|家属|监护人|收件人|寄件人|报告人|签名人|法人|医生|护士|教师|学生|房东|租户|投保人|被保险人|受益人|家长|考生|本人';
const NAME_SUFFIX_RE = '先生|女士|小姐|同学|老师|医生|经理|主任|教授|总监|工程师|工|总';

/** 姓名前允许的引导字（是/为/叫等；否则「汇报人是李建国先生」会被汉字前缀挡住） */
const PRE_ALLOWED = '是为了叫和与跟向对请给把将找喊替帮读写派让';
const PRE_OK = `(?:(?<!${CN})|(?<=[${PRE_ALLOWED}]))`;

/** 非激进姓名模式（误报低；命中标 confirm=true 供人工复核） */
const CNAME_PATTERNS = [
  // 角色词：姓名/联系人：张三
  { re: new RegExp(`(?:${NAME_ROLE_RE})[^\\S\\n]*[:：][^\\S\\n]*(${NAME_BODY})(?!${CN})`, 'g'), prio: 52 },
  // 姓名+称谓后缀：张三先生 / 李医生 / 王总
  { re: new RegExp(`${PRE_OK}(${NAME_BODY})(?:${NAME_SUFFIX_RE})(?!${CN})`, 'g'), prio: 50 },
];
/**
 * 激进模式（可选，默认关）：姓氏开头且前后都不是汉字的 2-4 字词——
 * 只可靠命中列表/表格/标点分隔场景（「王五、张三」），连续中文叙述里的
 * 姓名属于分词问题，如实不做（噪声换不来召回）。
 */
const CNAME_AGGRESSIVE_RE = new RegExp(`(?<!${CN})((?:${COMPOUND_CLASS}|${SURNAME_CLASS})${CN}{1,3})(?!${CN})`, 'g');

// ── 结构感知：键名字典（原始文本正则，不做 JSON.parse）──────────────────────

/** 字段名 → 类型（顺序敏感：具体键在前，泛 name 兜底在后） */
const KEY_FIELDS = [
  { keys: ['idcard', 'id_card', 'idCard', 'id-number', 'idNumber', 'id_no', 'idNum', 'identity', '证件号码', '身份证号', '身份证'], type: 'idcard' },
  { keys: ['phone', 'mobile', 'tel_phone', 'cellphone', 'phone_number', 'phoneNumber', '手机', '手机号', '电话号码'], type: 'phone' },
  { keys: ['email', 'mail', '电子邮箱', '邮箱'], type: 'email' },
  { keys: ['bank_card', 'bankCard', 'bankcard', 'card_no', 'cardNo', 'bank_account', 'bankAccount', '卡号', '银行卡号'], type: 'bankcard' },
  { keys: ['uscc', 'credit_code', 'creditCode', '统一社会信用代码', '信用代码'], type: 'uscc' },
  { keys: ['plate', 'plate_no', 'plateNo', 'car_no', 'carNo', 'license_plate', 'licensePlate', '车牌', '车牌号'], type: 'plate' },
  { keys: ['real_name', 'realName', 'user_name', 'userName', 'fullname', 'fullName', 'customer_name', 'customerName', 'patient_name', 'patientName', '姓名', '联系人', '客户名称', '患者姓名'], type: 'cname' },
  { keys: ['name'], type: 'cname' }, // 泛 name 兜底（有值形态门槛）
  { keys: ['address', 'home_address', 'homeAddress', 'shipping_address', 'shippingAddress', '地址', '住址'], type: 'address' },
  { keys: ['birthday', 'birth_date', 'birthDate', 'dob', '出生日期', '生日'], type: 'birthday' },
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const KEY_ALTERNATION = KEY_FIELDS.map((f) => f.keys.map(escapeRe).join('|')).join('|');

/** 值形态门槛：键说是 PII、值也得像 —— 把「键宽泛值不像」的误报挡在门外 */
const VALUE_GATES = {
  idcard: (v) => /^\d{15}(\d{2}[0-9Xx])?$/.test(v),
  phone: (v) => /^\d{11}$/.test(v) && phoneValid(v),
  email: (v) => /^[^@\s]{1,64}@[^@\s]{1,255}$/.test(v),
  bankcard: (v) => /^\d{13,19}$/.test(v.replace(/ /g, '')),
  uscc: (v) => /^[0-9A-HJ-NPQRTUWXY]{18}$/i.test(v),
  plate: (v) => plateValid(v),
  ipv4: (v) => ipv4Valid(v),
  cname: (v) => /^[\u4e00-\u9fa5·]{2,4}$/.test(v) || /^[A-Za-z][A-Za-z-]+ [A-Za-z][A-Za-z-]+$/.test(v),
  address: (v) => v.length >= 4 && v.length <= 60 && !/["{}[\]<>\n]/.test(v),
  birthday: (v) => /^(19|20)\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?$/.test(v) || /^(19|20)\d{8}$/.test(v),
};

/** JSON 形态："key": "value"（值支持转义；不跨引号） */
const JSON_KEY_VALUE_RE = new RegExp(
  `(["']?)((?:${KEY_ALTERNATION}))\\1\\s*:\\s*(["'])((?:\\\\.|(?!\\3)[^"\\\\]){1,100}?)\\3`, 'g');
/** JSON/YAML 数值形态："key": 13800138000（无引号 —— 18 位身份证必须走文本正则） */
const JSON_KEY_NUMBER_RE = new RegExp(
  `(["']?)((?:${KEY_ALTERNATION}))\\1\\s*:\\s*(\\d{6,24})(?!\\d|[.eE])`, 'g');
/**
 * ENV/properties 形态：USER_PHONE=13800138000
 * ⚠ 回溯安全：变量名整体用一个贪婪捕获组拿到（到 = 为止），字段词归属在 JS 里
 * 分类——绝不能写成 `前缀*?(字段词)后缀*` 的无界回溯形态（1MB 长行会 O(n²) 卡死）。
 */
const ENV_KEY_VALUE_RE = /^([^\S\n]*)(?:export\s+)?([A-Za-z0-9_.]+)\s*=\s*["']?([^"'\n\r]{1,120}?)["']?\s*(?:#.*)?$/gm;

// ── CSV（引号感知最小实现，记录单元格内容起点）────────────────────────────

/**
 * 拆一行 CSV → [{text(内芯), quoted(是否带引号), start(内芯在 line 中的起点)}]
 * 保留原行形态：掩码按内芯 span 进行，外层引号/逗号原样保留。
 */
function splitCsvLine(line) {
  const cells = [];
  let cur = '', curStart = -1, quoted = false, inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '""'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') { inQ = true; quoted = true; if (curStart < 0) curStart = i + 1; }
    else if (ch === ',') {
      cells.push({ text: cur, quoted, start: curStart < 0 ? i - cur.length : curStart });
      cur = ''; quoted = false; curStart = -1;
    } else {
      if (curStart < 0) curStart = i;
      cur += ch;
    }
  }
  cells.push({ text: cur, quoted, start: curStart < 0 ? Math.max(0, line.length - cur.length) : curStart });
  return cells;
}

function detectCsvHeader(lines) {
  if (!lines.length) return null;
  const head = splitCsvLine(lines[0]).map((c) => c.text.trim().toLowerCase());
  if (head.length < 2) return null;
  const colType = new Map();
  for (const f of KEY_FIELDS) {
    for (const k of f.keys) {
      if (!/^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_-]*$/.test(k)) continue;
      const idx = head.indexOf(k.toLowerCase());
      if (idx >= 0 && !colType.has(idx)) colType.set(idx, f.type);
    }
  }
  return colType.size ? colType : null;
}

// ── 值级检测器（自由文本；校验位复核）───────────────────────────────────────

const VALUE_DETECTORS = [
  { type: 'idcard', re: /(?<!\d)\d{17}[0-9Xx](?!\d)/g, validate: idcardValid },
  { type: 'uscc', re: /(?<![0-9A-HJ-NPQRTUWXY])[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}(?![0-9A-HJ-NPQRTUWXY])/g, validate: usccValid },
  { type: 'bankcard', re: /(?<!\d)(?:\d{4} \d{4} \d{4}[\d ]{0,15}\d|\d{13,19})(?!\d)/g, validate: (s) => luhnValid(s.replace(/ /g, '')) },
  { type: 'ipv4', re: /(?<![\d.])\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?![\d.])/g, validate: ipv4Valid },
  { type: 'phone', re: /(?<!\d)1\d{10}(?!\d)/g, validate: phoneValid },
  { type: 'plate', re: new RegExp(PLATE_RE.source, 'g'), validate: plateValid },
];

/**
 * 邮箱扫描 —— 手写线性扫描器而非正则。
 * 根因：`[A-Za-z0-9._%+-]+@` 形态的正则在 1MB 级无 @ 文本上每个位置贪婪吞到底
 * 再逐字符回溯，O(n²) 灾难回溯（实测卡死 120s+）。indexOf('@') 定位后向两侧
 * 扩边界，全程 O(n)。
 */
function scanEmailSpans(text) {
  const hits = [];
  if (!text || text.indexOf('@') < 0) return hits;
  const isLocal = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
    || c === 46 || c === 95 || c === 37 || c === 43 || c === 45; // ._%+-
  const isDomChar = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 46;
  let at = text.indexOf('@');
  while (at >= 0) {
    let s = at - 1;
    while (s >= 0 && isLocal(text.charCodeAt(s))) s--;
    s += 1;
    // 域名：[A-Za-z0-9-]+(.[A-Za-z0-9-]+)+ —— 手工解析并校验至少一个点分标签
    let e = at + 1;
    let labels = 0, labelLen = 0, lastDot = -2;
    while (e < text.length) {
      const c = text.charCodeAt(e);
      if (c === 46) { // '.'
        if (labelLen === 0) break; // 连续点/点前空标签
        labels++; labelLen = 0; lastDot = e; e++;
      } else if (isDomChar(c) && c !== 46) { labelLen++; e++; }
      else break;
    }
    if (labelLen > 0 && labels >= 1) { // 末标签非空且至少一个点
      const local = text.slice(s, at);
      const domain = text.slice(at + 1, e);
      if (local.length >= 1 && local.length <= 64 && domain.length <= 253
        && !domain.startsWith('-') && !domain.endsWith('-')
        && /^[A-Za-z]{2,}$/.test(text.slice(lastDot + 1, e))) {
        hits.push({ type: 'email', start: s, end: e, original: text.slice(s, e), priority: TYPES.email.priority, confirm: false, spaced: false });
      }
    }
    at = text.indexOf('@', Math.max(at + 1, e > at + 1 ? e : at + 1));
  }
  return hits;
}

// ── 主扫描 ──────────────────────────────────────────────────────────────────

/**
 * scanText(text, opts) → hits[]（按位置排序、重叠已裁决）
 * hit: {type, key?, start, end, original, priority, confirm, spaced?}
 */
function scanText(text, opts) {
  const o = opts || {};
  const types = o.types || {};
  const on = (t) => !(types[t] && types[t].on === false);
  const hits = [];
  const push = (h) => { hits.push(h); return hits.length < MAX_HITS; };

  // 1) 值级检测器（邮箱走手写线性扫描器，防 O(n²) 回溯；其余为有界正则）
  if (on('email')) {
    for (const h of scanEmailSpans(text)) {
      if (!push(h)) return dedupe(hits);
    }
  }
  for (const det of VALUE_DETECTORS) {
    if (!on(det.type)) continue;
    if (det.type === 'ipv4' && o.ipv4KeepPrivate !== false) {
      det.re.lastIndex = 0;
      let m;
      while ((m = det.re.exec(text)) !== null) {
        const v = m[0];
        if (ipv4Valid(v) && !ipv4Private(v)) {
          if (!push({ type: 'ipv4', start: m.index, end: m.index + v.length, original: v, priority: TYPES.ipv4.priority, confirm: false })) return dedupe(hits);
        }
        if (m.index === det.re.lastIndex) det.re.lastIndex++;
      }
      continue;
    }
    det.re.lastIndex = 0;
    let m;
    while ((m = det.re.exec(text)) !== null) {
      const raw = m[0];
      const spaced = det.type === 'bankcard' && raw.includes(' ');
      const value = spaced ? raw.replace(/ /g, '') : raw;
      if (!det.validate || det.validate(value)) {
        if (!push({ type: det.type, start: m.index, end: m.index + raw.length, original: raw, priority: TYPES[det.type].priority, confirm: false, spaced })) return dedupe(hits);
      }
      if (m.index === det.re.lastIndex) det.re.lastIndex++;
    }
  }

  // 2) 中文姓名（上下文模式；激进模式可选）
  if (on('cname')) {
    for (const p of CNAME_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text)) !== null) {
        const g = m[1];
        if (g) {
          // 姓名是捕获组而非整个匹配（角色词模式 m.index 指向角色词）——span 必须定位到 g 本身
          const start = m.index + m[0].indexOf(g);
          if (!push({ type: 'cname', start, end: start + g.length, original: g, priority: p.prio, confirm: true })) return dedupe(hits);
        }
        if (m.index === p.re.lastIndex) p.re.lastIndex++;
      }
    }
    if (o.cnameAggressive) {
      CNAME_AGGRESSIVE_RE.lastIndex = 0;
      let m;
      while ((m = CNAME_AGGRESSIVE_RE.exec(text)) !== null) {
        if (!push({ type: 'cname', start: m.index, end: m.index + m[0].length, original: m[0], priority: 30, confirm: true })) return dedupe(hits);
        if (m.index === CNAME_AGGRESSIVE_RE.lastIndex) CNAME_AGGRESSIVE_RE.lastIndex++;
      }
    }
  }

  // 3) 结构感知（键驱动，raw 文本正则 —— 全程不做 JSON.parse）
  if (o.structural !== false) {
    // 3a. 键: "字符串值"
    JSON_KEY_VALUE_RE.lastIndex = 0;
    let m;
    while ((m = JSON_KEY_VALUE_RE.exec(text)) !== null) {
      const key = m[2], value = m[4];
      const f = key ? keyTypeOf(key) : null;
      if (f && on(f.type) && (VALUE_GATES[f.type] || (() => true))(value)) {
        const vStart = m.index + m[0].lastIndexOf(value);
        if (!push({ type: f.type, key, start: vStart, end: vStart + value.length, original: value, priority: 96, confirm: TYPES[f.type].confirm, spaced: false })) return dedupe(hits);
      }
      if (m.index === JSON_KEY_VALUE_RE.lastIndex) JSON_KEY_VALUE_RE.lastIndex++;
    }
    // 3b. 键: 裸数字（18 位身份证作为 JSON 数字 —— 精度安全关键路径）
    JSON_KEY_NUMBER_RE.lastIndex = 0;
    while ((m = JSON_KEY_NUMBER_RE.exec(text)) !== null) {
      const key = m[2], value = m[3];
      const f = key ? keyTypeOf(key) : null;
      if (f && on(f.type) && (VALUE_GATES[f.type] || (() => true))(value)) {
        const vStart = m.index + m[0].lastIndexOf(value);
        if (!push({ type: f.type, key, start: vStart, end: vStart + value.length, original: value, priority: 96, confirm: TYPES[f.type].confirm, spaced: false })) return dedupe(hits);
      }
      if (m.index === JSON_KEY_NUMBER_RE.lastIndex) JSON_KEY_NUMBER_RE.lastIndex++;
    }
    // 3c. ENV / properties：USER_PHONE=138...（变量名整体捕获 + JS 分类，无回溯面）
    ENV_KEY_VALUE_RE.lastIndex = 0;
    while ((m = ENV_KEY_VALUE_RE.exec(text)) !== null) {
      const varName = m[2], value = m[3];
      const f = envKeyTypeOf(varName);
      if (f && on(f.type) && value && (VALUE_GATES[f.type] || (() => true))(value)) {
        const vStart = m.index + m[0].lastIndexOf(value);
        if (!push({ type: f.type, key: varName, start: vStart, end: vStart + value.length, original: value, priority: 96, confirm: TYPES[f.type].confirm, spaced: false })) return dedupe(hits);
      }
      if (m.index === ENV_KEY_VALUE_RE.lastIndex) ENV_KEY_VALUE_RE.lastIndex++;
    }
    // 3d. CSV 列驱动（补纯键驱动类型：cname/address/birthday；强类型若值级已覆盖则跳过）
    if (o.csv !== false) {
      const lines = text.split('\n');
      const colType = detectCsvHeader(lines);
      if (colType) {
        let offset = lines[0].length + 1;
        for (let li = 1; li < lines.length; li++) {
          const line = lines[li];
          if (line.trim()) {
            const cells = splitCsvLine(line);
            for (const [idx, type] of colType) {
              const cell = cells[idx];
              if (!cell || !cell.text) continue;
              const v = cell.text.replace(/\r$/, '');
              if (!v.trim()) continue;
              const needsKeyDriven = type === 'cname' || type === 'address' || type === 'birthday'
                || (type === 'phone' && !phoneValid(v))
                || (type === 'idcard' && !idcardValid(v))
                || (type === 'bankcard' && !luhnValid(v.replace(/ /g, '')))
                || (type === 'email' && !TYPES.email.detect(v));
              if (!needsKeyDriven) continue;
              const start = offset + cell.start;
              if (!push({ type, key: 'csv:' + idx, start, end: start + v.length, original: v, priority: 96, confirm: TYPES[type].confirm, spaced: false })) return dedupe(hits);
            }
          }
          offset += line.length + 1;
        }
      }
    }
  }

  return dedupe(hits);
}

/** 重叠裁决：start 升序、priority 降序；贪心接受不重叠者 */
function dedupe(hits) {
  hits.sort((a, b) => (a.start - b.start) || (b.priority - a.priority));
  const accepted = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start < lastEnd) continue;
    accepted.push(h);
    lastEnd = h.end;
  }
  return accepted;
}

function keyTypeOf(key) {
  const k = String(key || '').trim().toLowerCase();
  for (const f of KEY_FIELDS) {
    for (const kk of f.keys) if (k === kk.toLowerCase()) return f;
  }
  return null;
}
function envKeyTypeOf(varName) {
  // 变量名 → 字段归属：精确等值优先；否则「包含最长字段词」胜（USER_PHONE → phone）
  const name = String(varName || '').toLowerCase();
  if (!name) return null;
  let best = null, bestLen = 0;
  for (const f of KEY_FIELDS) {
    for (const kk of f.keys) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(kk)) continue;
      const k = kk.toLowerCase();
      if (name === k) return f;
      if (k.length > bestLen && name.includes(k)) { best = f; bestLen = k.length; }
    }
  }
  return best;
}

// ── 应用替换（mask + 台账）──────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  types: {},              // { phone: {on:true, mode:'partial'}, ... }
  salt: '',               // 台账盐（假名确定性来源）
  structural: true,
  csv: true,
  cnameAggressive: false,
  ipv4KeepPrivate: true,
  customRules: [],        // [{name, pattern, flags?, replacement?}]
  exposeOriginal: false,  // ⚠ 仅面板本地 diff 用；service/MCP 一律 false
  maxLen: 1024 * 1024,
};

function modeOf(type, typesCfg) {
  const c = typesCfg && typesCfg[type];
  return c && MODES.includes(c.mode) ? c.mode : TYPES[type].defaultMode;
}

function replacementFor(type, mode, original, spaced, salt, seq) {
  const t = TYPES[type];
  try {
    if (mode === 'partial') return t.partial(original, spaced) || `〔${t.label}${seq}〕`;
    if (mode === 'fake') return t.fake(salt, original) || `〔${t.label}${seq}〕`;
  } catch (_) { /* 假名/打码异常 → 回退 label，不中断 */ }
  return `〔${t.label}${seq}〕`;
}

/**
 * maskText(text, opts) →
 * { output, stats:{type:count}, hits:[{type,key,start,end,preview,mode,confirm,original?}],
 *   newEntries:[{fp,type,original,out,mode,seq,count}], truncated }
 *
 * ledger（映射台账）：调用方持有的 Map（fp → entry）。本函数原地合并本次命中的
 * 映射并返回「本次新建/更新」的条目快照，调用方负责持久化（面板/服务写 kv）。
 */
function maskText(text, opts) {
  const o = { ...DEFAULT_OPTIONS, ...(opts || {}) };
  const src = String(text || '');
  const truncated = src.length > o.maxLen;
  const input = truncated ? src.slice(0, o.maxLen) : src;
  const hits = scanText(input, o);

  const ledger = o.ledger instanceof Map ? o.ledger : new Map(Object.entries(o.ledger || {}));
  const salt = o.salt || 'nosalt';
  let maxSeq = 0;
  for (const v of ledger.values()) if (v && typeof v.seq === 'number' && v.seq > maxSeq) maxSeq = v.seq;

  const stats = {};
  const outHits = [];
  const touched = new Set();
  let output = '';
  let pos = 0;

  for (const h of hits) {
    const t = TYPES[h.type];
    if (!t) continue;
    const mode = modeOf(h.type, o.types);
    const fp = fnv1a64(h.type + '|' + h.original);
    let entry = ledger.get(fp);
    if (!entry) {
      entry = { type: h.type, original: h.original, mode, out: '', seq: ++maxSeq, count: 0, firstAt: Date.now() };
      entry.out = replacementFor(h.type, mode, h.original, h.spaced, salt, entry.seq);
      ledger.set(fp, entry);
    } else if (entry.mode !== mode) {
      entry.mode = mode;
      entry.out = replacementFor(h.type, mode, h.original, h.spaced, salt, entry.seq);
    }
    entry.count += 1;
    touched.add(fp);
    // 铁律：替换值绝不等于原值（假名碰撞/退化即回退 label）
    if (entry.out === h.original) {
      entry.mode = 'label';
      entry.out = `〔${t.label}${entry.seq}〕`;
    }
    output += input.slice(pos, h.start) + entry.out;
    pos = h.end;
    stats[h.type] = (stats[h.type] || 0) + 1;
    outHits.push({
      type: h.type, key: h.key || '', start: h.start, end: h.end,
      mode, confirm: !!h.confirm, preview: displayPreview(h.original, h.type),
      ...(o.exposeOriginal ? { original: h.original } : {}),
    });
  }
  output += input.slice(pos);

  // 自定义规则（最后跑；用户显式声明，优先于内置结果展示）
  for (const rule of o.customRules || []) {
    if (!rule || !rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, rule.flags && rule.flags.includes('g') ? rule.flags : (rule.flags || '') + 'g');
      output = output.replace(re, rule.replacement || `〔${rule.name || '自定义'}〕`);
    } catch (_) { /* 非法正则跳过，不毁主流程 */ }
  }

  const newEntries = [...touched].map((fp) => ({ fp, ...ledger.get(fp) }));
  return { output, stats, hits: outHits, newEntries, truncated };
}

/** 展示用预览：原值在任何通道（kv/日志/MCP）里唯一允许的形态（前2后2/邮箱首字符+域尾） */
function displayPreview(original, type) {
  const s = String(original);
  if (type === 'email') {
    const at = s.indexOf('@');
    if (at > 0) return s.slice(0, 1) + '***' + (s.length - at > 12 ? s.slice(s.length - 12) : s.slice(at));
  }
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '***' + s.slice(-2);
}

// ── 还原（仅面板；服务与 MCP 永不提供还原）─────────────────────────────────

/**
 * restoreText(text, entries) → { output, replaced }
 * 仅 fake / label 模式可还原；partial 天然不可逆。
 * entries: [{fp, type, original, out, mode, seq}]
 */
function restoreText(text, entries) {
  const list = (entries || []).filter((e) => e && e.out && e.original && e.mode !== 'partial' && e.out !== e.original);
  list.sort((a, b) => b.out.length - a.out.length); // 长替换串优先，防短串破坏长串
  let output = String(text || '');
  let replaced = 0;
  for (const e of list) {
    const parts = output.split(e.out);
    if (parts.length > 1) {
      replaced += parts.length - 1;
      output = parts.join(e.original);
    }
  }
  return { output, replaced };
}

// ── 默认设置（落 kv 形态）──────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  types: {},
  structural: true,
  csv: true,
  cnameAggressive: false,
  ipv4KeepPrivate: true,
  customRules: [],
  maxFileKB: 2048,
  outDirMode: 'sibling',
};

module.exports = {
  TYPES, TYPE_ORDER, MODES, DEFAULT_OPTIONS, DEFAULT_SETTINGS,
  KEY_FIELDS, VALUE_GATES, CNAME_PATTERNS, CNAME_AGGRESSIVE_RE,
  PHONE_SEGMENTS, SURNAME_LIST, COMPOUND_SURNAMES, FAKE_REGIONS,
  luhnValid, idcardValid, phoneValid, usccValid, ipv4Valid, ipv4Private, plateValid,
  fnv1a64, seedOf, mulberry32, genSalt,
  scanText, maskText, restoreText, displayPreview, keyTypeOf, splitCsvLine, detectCsvHeader,
  scanEmailSpans,
};
