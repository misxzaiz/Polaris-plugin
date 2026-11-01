'use strict';
/**
 * scan-core.js —— 密钥扫描台纯函数核心（面板 / 服务 / MCP / 单测四方共用）
 *
 * 设计铁律：
 *   1. 零 IO、零依赖（不用 node:crypto —— 面板 esbuild 内联本文件也能跑）。
 *   2. 掩码不变量：任何经本模块输出的 finding（preview/ctx）【不包含完整密钥值】，
 *      cap.kv / MCP 返回 / 日志里永远只有掩码 + 指纹。完整值只存在于被扫文件本身。
 *   3. 降噪优先于召回：宁可漏一条真测试值，不可对占位符/lockfile 哈希狂吠。
 *      误报管理 = 占位符库 + 熵阈值 + 跳过清单 + 用户 ignore 表 四层。
 *   4. 指纹（fp）用 FNV-1a 64：仅作「同一密钥」的身份对齐（diff / ignore 用），
 *      非密码学哈希，不承担安全职责 —— 因为它哈希的对象本来就不会被存储。
 */

// ── 通用跳过策略（默认值；settings 可扩展） ─────────────────────────────────

const SKIP_DIRS = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '__pycache__', '.venv', 'venv', 'env', 'target', '.idea', '.gradle',
  'vendor', 'bower_components', '.terraform', '.pytest_cache', '.mypy_cache',
  '.tox', 'obj', 'bin', '.serverless', '.angular',
];

const SKIP_FILES = [
  'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock',
  'bun.lockb', 'bun.lock', 'deno.lock', 'cargo.lock', 'poetry.lock',
  'pipfile.lock', 'composer.lock', 'gemfile.lock', 'packages.lock',
];

const SKIP_EXT = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'avif', 'heic',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'ogg', 'm4a',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war', 'apk', 'ipa',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'msi', 'appimage', 'dmg', 'pkg', 'deb', 'rpm',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'class', 'pyd', 'pdb', 'lib', 'obj', 'o', 'a', 'wasm',
  'sqlite', 'db', 'db3', 'mdb', 'accdb',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'psd', 'ai', 'sketch', 'xd',
  'ds_store', 'pyc',
];

function isSkipDir(name) {
  return SKIP_DIRS.includes(String(name || '').toLowerCase());
}
function isSkipFile(name) {
  return SKIP_FILES.includes(String(name || '').toLowerCase());
}
function extOf(name) {
  const i = String(name || '').lastIndexOf('.');
  if (i <= 0) return '';
  return String(name).slice(i + 1).toLowerCase();
}
function isSkipExt(name) {
  return SKIP_EXT.includes(extOf(name));
}
/** 二进制嗅探：前 8KB 出现 NUL 字节视为二进制（够用、零依赖） */
function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// ── 熵与指纹 ────────────────────────────────────────────────────────────────

/** 香农熵（bit/字符）。真实随机密钥通常 ≥3.5；占位词/顺序串显著更低 */
function shannon(s) {
  if (!s) return 0;
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  const len = s.length;
  for (const c of freq.values()) {
    const p = c / len;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 100) / 100;
}

/**
 * FNV-1a 双通道 64bit 指纹（hex 16 位）：仅作「同一密钥」身份对齐（diff/ignore），
 * 非密码学哈希。JS 位运算是 32 位，用两个独立进化的 32 位通道拼出 64 位冲突面。
 */
function fnv1a64(str) {
  let h1 = 0x811c9dc5; // FNV-1a 32 offset basis
  let h2 = 0x84222325; // 自选第二基（不同质数通道，减少同构碰撞）
  const p1 = 0x01000193;
  const p2 = 0x01000193 ^ 0x9e3779b9; // 黄金比例异或，避免两通道同步进化
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, p1) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), p2 >>> 0) >>> 0;
  }
  h1 = (h1 ^ (h2 >>> 5)) >>> 0;
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}
const fingerprint = fnv1a64;

// ── 掩码 ────────────────────────────────────────────────────────────────────

/** 掩码单个密钥值：保留前 4 后 2（短值全掩码）。这是 kv 里唯一允许出现的「值」形态 */
function maskValue(v) {
  if (!v) return '«空»';
  if (v.length <= 6) return '*'.repeat(v.length);
  const head = v.slice(0, 4);
  const tail = v.length > 10 ? v.slice(-2) : '';
  return `${head}…${tail ? tail : '****'}`;
}

// ── 占位符 / 环境引用降噪 ───────────────────────────────────────────────────

const PLACEHOLDER_RE = new RegExp([
  '^(?:[xX*\\.\\-_=]{6,})$',              // xxxxxx / ****** / ------
  '^(?:test|example|sample|dummy|fake|placeholder|none|null|nil|true|false|empty|default|unset|tbd)$',
  '^(?:your|my)[-_]?(?:key|token|secret|api|password|apikey)?[-_a-z0-9]*$', // your-key / your_key_here / MYAPIKEY123
  '^(?:change|replace)[-_]?(?:me|it|this|with|_?your[_-]?key.*)$',
  '^(?:todo|fixme|tbd|xxxx?|asdf|qwerty|123456|12345678|letmein|admin|password|passwd|secret|token|apikey|key)',
  '^(?:sk|pk|rk)?[-_]?(?:xxx|test|example|sample|placeholder)', // sk-xxxx / pk_test_...
  '\\$\\{',                                   // ${VAR} 插值
  '%[A-Z0-9_]{1,60}%',                        // %VAR% Windows 插值
  '\\{\\{',                                   // {{ var }} 模板
  '<[A-Za-z][A-Za-z0-9_ -]{0,60}>',           // <your-key-here>
  '^\\$[A-Za-z0-9_]+$',                       // $VAR
  '^0+$',
].join('|'), 'i');

// 子串级占位词（真实随机密钥含这些完整词的概率可忽略；EXAMPLE 是各大云文档假值标配）
const PLACEHOLDER_SUBSTR_RE = /example|sample|placeholder|change[-_]?me|dummy|testkey|your[-_]?key|secret[-_]?here|key[-_]?here/i;
// 顺序串/键盘行（abcdefghijklmnop、0123456789、qwerty 行）——香农熵抓不住它们，单独抓
const SEQUENTIAL_RE = /0123456789|abcdefghi|ijklmnopq|qrstuvwxy|qwertyuiop|asdfghjkl|zxcvbnm/i;

function isPlaceholderValue(v) {
  if (!v) return true;
  const s = String(v).trim();
  return PLACEHOLDER_RE.test(s) || PLACEHOLDER_SUBSTR_RE.test(s) || SEQUENTIAL_RE.test(s);
}

/** 值是「环境变量读取」而非字面量（const K = process.env.X 等）——不是泄露 */
const ENV_REF_RE = /process\.env\.|process\.env\[|os\.environ|getenv\s*\(|import\.meta\.env|ENV\[['"]/;

// ── 规则库 ──────────────────────────────────────────────────────────────────
/**
 * 字段说明：
 *   id / sev / label   规则标识 / 严重度(critical|high|medium) / 中文名
 *   desc               给人看的说明 + 处置建议（MCP 报告与面板详情共用）
 *   res                正则数组（命中任一即候选）；valueGroup = 敏感值捕获组索引
 *   contextRe          行级附加条件（如「同 行出现 app_secret 字样」）
 *   entropyMin         值的最低香农熵（bit/char），不达即降噪跳过
 *   onlyBasename       仅对匹配 basename 的文件生效（如 .env*）
 *   valueRe            值的二次形态校验
 */
const RULES = [
  {
    id: 'aws-access-key', sev: 'critical', label: 'AWS 访问密钥 ID',
    desc: '形如 AKIA/ASIA 开头的 AWS 访问键 ID（常与 secret key 成对出现）。处置：立即到 AWS 控制台 IAM 停用并轮换，检查 CloudTrail 是否被滥用。',
    res: [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/], valueGroup: 0,
  },
  {
    id: 'aws-secret-key', sev: 'critical', label: 'AWS Secret 访问键',
    desc: 'AWS 上下文行中出现的 40 位 Base64 形态 Secret。处置：与配套 Access Key 一起在 IAM 轮换。',
    res: [/(?:aws|amazon)[^\n]{0,60}?['"]([A-Za-z0-9/+=]{40})['"]/i], valueGroup: 1,
    contextRe: /(?:aws|amazon)/i, entropyMin: 3.5,
  },
  {
    id: 'github-token', sev: 'critical', label: 'GitHub 令牌',
    desc: 'ghp_/gho_/ghu_/ghs_/ghr_ 或 github_pat_ 形态的 GitHub 令牌。处置：GitHub → Settings → Developer settings 立即 revoke；检查账号安全日志。',
    res: [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,251}\b/, /\bgithub_pat_[A-Za-z0-9_]{20,251}\b/], valueGroup: 0,
  },
  {
    id: 'openai-key', sev: 'critical', label: 'OpenAI API 密钥',
    desc: '含 T3BlbkFJ 特征段或 sk-proj-/sk-svcacct-/sk-admin- 形态的 OpenAI 密钥。处置：platform.openai.com 撤销并轮换，查用量账单是否有异常消耗。',
    res: [/\bsk-[A-Za-z0-9_-]{16,}T3BlbkFJ[A-Za-z0-9_-]{8,}\b/, /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}\b/], valueGroup: 0,
  },
  {
    id: 'anthropic-key', sev: 'critical', label: 'Anthropic API 密钥',
    desc: 'sk-ant- 形态的 Claude API 密钥。处置：console.anthropic.com 撤销轮换，核对用量。',
    res: [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/], valueGroup: 0,
  },
  {
    id: 'google-api-key', sev: 'critical', label: 'Google API 密钥',
    desc: 'AIza 形态的 Google API Key。处置：Google Cloud 控制台轮换；确认该 key 的 API 限制与配额告警。',
    res: [/\bAIza[0-9A-Za-z_-]{35}\b/], valueGroup: 0,
  },
  {
    id: 'stripe-live-key', sev: 'critical', label: 'Stripe 生产密钥',
    desc: 'sk_live_/rk_live_ 形态的 Stripe 生产环境密钥（pk_live 是公开键不算）。处置：Dashboard → Developers → API keys 轮换（roll）。',
    res: [/\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/], valueGroup: 0,
  },
  {
    id: 'sendgrid-key', sev: 'critical', label: 'SendGrid API 密钥',
    desc: 'SG. 开头三段式 SendGrid 密钥，泄露后常被用于发垃圾邮件。处置：立即删除并新建，检查发送活动记录。',
    res: [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/], valueGroup: 0,
  },
  {
    id: 'private-key-block', sev: 'critical', label: '私钥文件块',
    desc: '-----BEGIN ... PRIVATE KEY----- 私钥 PEM 块。处置：确认该私钥对应的公钥是否在生产使用，是则立即轮换证书/密钥对。',
    res: [/^-----BEGIN [A-Z0-9 ]{0,30}PRIVATE KEY(?: BLOCK)?-----\s*$/], valueGroup: 0,
    valueRe: /PRIVATE KEY/, noMask: true, // BEGIN 头是标准字面量非机密，掩码反而毁可读性
  },
  {
    id: 'aliyun-access-key', sev: 'high', label: '阿里云 AccessKey',
    desc: 'LTAI 开头的阿里云 AccessKey ID。处置：RAM 控制台禁用并新建；开启 ActionTrail 审计排查滥用。',
    res: [/\bLTAI[0-9A-Za-z]{12,30}\b/], valueGroup: 0,
  },
  {
    id: 'tencent-secret', sev: 'high', label: '腾讯云密钥',
    desc: 'AKID 开头的腾讯云 SecretId。处置：访问管理 CAM 控制台禁用轮换，查密钥 usage 记录。',
    res: [/\bAKID[0-9A-Za-z]{13,50}\b/], valueGroup: 0,
  },
  {
    id: 'zhipu-key', sev: 'high', label: '智谱 AI 密钥',
    desc: '「16 位 hex . 32 位字母数字」形态的智谱 GLM API Key。处置：开放平台重置 key。',
    res: [/\b[0-9a-f]{16}\.[A-Za-z0-9]{16,32}\b/], valueGroup: 0,
    entropyMin: 3.0,
  },
  {
    id: 'deepseek-key', sev: 'high', label: 'DeepSeek API 密钥',
    desc: 'sk- 加 32 位 hex 形态的 DeepSeek 密钥。处置：开放平台重置，查余额变动。',
    res: [/\bsk-[0-9a-f]{32}\b/], valueGroup: 0,
    entropyMin: 3.0,
  },
  {
    id: 'moonshot-key', sev: 'high', label: 'Moonshot/Kimi API 密钥',
    desc: 'sk- 加 48 位字母数字形态的 Moonshot 密钥。处置：平台.moonshot.cn 重置。注意与其他 sk- 密钥区分归属。',
    res: [/\bsk-[A-Za-z0-9]{48}\b/], valueGroup: 0,
    entropyMin: 3.5,
  },
  {
    id: 'slack-token', sev: 'high', label: 'Slack 令牌',
    desc: 'xoxb-/xoxp-/xoxa-/xoxr-/xoxs- 形态的 Slack 令牌。处置：Slack App 管理页 rotate，检查异常消息推送。',
    res: [/\bxox[bpars]-[0-9A-Za-z-]{10,}\b/], valueGroup: 0,
  },
  {
    id: 'wechat-appsecret', sev: 'high', label: '微信 AppSecret',
    desc: 'app_secret 上下文中的 32 位 hex 值。AppSecret 泄露可被用于伪造公众号/小程序接口调用。处置：微信公众平台重置并同步后端配置。',
    res: [/\b([0-9a-f]{32})\b/], valueGroup: 1,
    contextRe: /app[_-]?secret|secret/i, entropyMin: 2.8,
  },
  {
    id: 'db-connection-string', sev: 'high', label: '带凭证的数据库连接串',
    desc: 'postgres/mysql/mongodb/redis/mssql 等连接串中内嵌了用户名:密码@。处置：轮换该数据库口令，改用环境变量/密钥管理注入。',
    res: [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql):\/\/[^\s'"@/:]{1,64}:([^\s'"@/]{3,})@[^\s'"]+/], valueGroup: 1,
    entropyMin: 2.5,
  },
  {
    id: 'jwt-token', sev: 'medium', label: 'JWT 凭证',
    desc: '三段式 JWT（可能只是示例/过期样本，也可能是有生产权限的会话凭证）。处置：解 payload 确认签发方与 exp，生产凭证按泄露处理。',
    res: [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/], valueGroup: 0,
  },
  {
    id: 'generic-secret-assignment', sev: 'high', label: '可疑的密钥字面量赋值',
    desc: 'password/secret/api_key/token 等字段被赋了一个高熵字面量（不像占位符也不像环境变量引用）。处置：逐条确认，真实凭证立即轮换并改为从环境注入。',
    res: [/\b(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key(?:[_-]?secret)?|auth[_-]?token|client[_-]?secret|private[_-]?key|token)\b["']?\s*[:=]\s*["']([^"'\s\\]{8,160})["']/], valueGroup: 1,
    entropyMin: 3.4,
  },
  {
    id: 'env-real-value', sev: 'medium', label: '.env 文件中的密钥形态值',
    desc: '.env 类文件中 KEY/TOKEN/SECRET/PASSWORD 类字段被赋了真实形态的值。.env 本身用于本地没问题，但需确认：未被提交进仓库、未被打进镜像/分发包、未出现在聊天/网盘同步里。',
    res: [/^\s*(?:export\s+)?([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH)[A-Za-z0-9_]*)\s*=\s*["']?([^"'\s#]{6,200})["']?\s*(?:#.*)?$/], valueGroup: 2,
    onlyBasename: /^\.env(?:\..*)?$|^\.env$/i,
    entropyMin: 2.8,
  },
];

const RULE_MAP = new Map(RULES.map((r) => [r.id, r]));
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// ── 单文件文本扫描 ──────────────────────────────────────────────────────────

/**
 * scanText(text, opts) → findings[]
 * opts: { relFile, enabledRules?: Set<string> }
 * 输出为未聚合的候选（可能同 fp 多条），不做 IO。
 */
function scanText(text, opts) {
  const relFile = opts && opts.relFile ? String(opts.relFile).replace(/\\/g, '/') : '';
  const enabled = opts && opts.enabledRules ? opts.enabledRules : null;
  const base = relFile.split('/').pop() || '';
  const out = [];

  // .env 规则只对 .env* 文件生效；反之其余规则在 .env 文件里同样要跑
  const lines = String(text || '').split('\n');
  for (const rule of RULES) {
    if (enabled && !enabled.has(rule.id)) continue;
    if (rule.onlyBasename && !rule.onlyBasename.test(base)) continue;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (!line) continue;
      for (const re of rule.res) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          const value = m[rule.valueGroup || 0];
          if (!value || m[0].length === 0) { re.lastIndex = 0; break; }
          if (rule.contextRe && !rule.contextRe.test(line)) break;
          if (isPlaceholderValue(value)) { if (re.global) continue; break; }
          if (rule.entropyMin && shannon(value) < rule.entropyMin) { if (re.global) continue; break; }
          if (rule.valueRe && !rule.valueRe.test(m[0])) { if (re.global) continue; break; }
          if (rule.id === 'generic-secret-assignment' && ENV_REF_RE.test(line)) { if (re.global) continue; break; }
          out.push({
            fp: fingerprint(`${rule.id}|${value}`),
            rule: rule.id,
            sev: rule.sev,
            preview: rule.noMask ? m[0] : maskValue(value),
            ctx: rule.noMask ? line.slice(0, 240) : maskLine(line, re, rule.valueGroup || 0).slice(0, 240),
            file: relFile,
            line: li + 1,
          });
          if (!re.global) break;
          if (m.index === re.lastIndex) re.lastIndex++;
          if (out.length > 5000) return out; // 单文件异常防护
        }
      }
    }
  }
  return out;
}

/** 掩码一行：把该正则命中的敏感捕获组全部换成掩码（用于上下文行展示） */
function maskLine(line, re, valueGroup) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let masked = line;
  try {
    masked = line.replace(g, (...args) => {
      const groups = args.slice(0, -2); // match, p1..pn
      const full = args[0];
      const val = groups[valueGroup] !== undefined ? groups[valueGroup] : full;
      return String(full).replace(String(val), maskValue(String(val)));
    });
  } catch (_) {
    return '«上下文不可展示»';
  }
  return masked;
}

// ── 聚合 / diff / 过滤 ──────────────────────────────────────────────────────

/** 同 fp 聚合：一条密钥一份记录（occurrences 截前 5 处） */
function aggregateFindings(raw) {
  const map = new Map();
  for (const f of raw || []) {
    const ex = map.get(f.fp);
    if (ex) {
      ex.count++;
      if (ex.occurrences.length < 5) ex.occurrences.push({ file: f.file, line: f.line });
    } else {
      map.set(f.fp, {
        fp: f.fp, rule: f.rule, sev: f.sev, preview: f.preview, ctx: f.ctx,
        count: 1, occurrences: [{ file: f.file, line: f.line }], firstFile: f.file,
      });
    }
  }
  const list = [...map.values()];
  list.sort((a, b) => (SEV_ORDER[a.sev] - SEV_ORDER[b.sev]) || (a.rule < b.rule ? -1 : 1));
  return list;
}

/** 基线 diff：curr 中不在 prev 的 fp 集合 = 新增泄露 */
function diffFindings(currList, prevFps) {
  const prev = prevFps instanceof Set ? prevFps : new Set(prevFps || []);
  let newCount = 0, newCritical = 0, newHigh = 0;
  for (const f of currList || []) {
    if (prev.has(f.fp)) continue;
    newCount++;
    if (f.sev === 'critical') newCritical++;
    else if (f.sev === 'high') newHigh++;
  }
  return { newCount, newCritical, newHigh };
}

function countSeverities(list) {
  const c = { critical: 0, high: 0, medium: 0 };
  for (const f of list || []) if (c[f.sev] !== undefined) c[f.sev]++;
  return c;
}

/** 用户 ignore 表过滤：{fp, note, at}[] */
function applyIgnores(findings, ignoreList) {
  if (!Array.isArray(ignoreList) || !ignoreList.length) return findings;
  const ig = new Set(ignoreList.map((x) => x && x.fp).filter(Boolean));
  return (findings || []).filter((f) => !ig.has(f.fp));
}

function filterFindings(findings, q) {
  const { severity, ruleId, search } = q || {};
  let list = findings || [];
  if (severity && severity !== 'all') list = list.filter((f) => f.sev === severity);
  if (ruleId && ruleId !== 'all') list = list.filter((f) => f.rule === ruleId);
  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter((f) =>
      (f.file || '').toLowerCase().includes(s)
      || (f.ctx || '').toLowerCase().includes(s)
      || (f.preview || '').toLowerCase().includes(s));
  }
  return list;
}

// ── 默认设置 ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  root: '',
  maxFileKB: 1024,        // 单文件上限（超过跳过）
  maxFiles: 200000,       // 单次扫描文件数上限（诚实降级：标记 truncated）
  maxTotalMB: 1024,       // 单次扫描累计读取上限（MB）
  disabledRules: [],      // 关掉的规则 id
  ctxLines: 1,            // 上下文行数（预留，当前实现按行独立扫）
};

module.exports = {
  RULES, RULE_MAP, SEV_ORDER, DEFAULT_SETTINGS,
  SKIP_DIRS, SKIP_FILES, SKIP_EXT,
  shannon, maskValue, fingerprint,
  isSkipDir, isSkipFile, isSkipExt, extOf, looksBinary,
  isPlaceholderValue, ENV_REF_RE,
  scanText, maskLine, aggregateFindings, diffFindings,
  countSeverities, applyIgnores, filterFindings,
};
