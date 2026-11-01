'use strict';
/**
 * domain-core.js —— 域名诊断台纯函数核心（零依赖，node/browser 通用）
 *
 * 全部诊断语义都在这里：域名规范化与安全守卫、DoH 响应归一、SPF 解析与
 * RFC 7208 §4.6.4 DNS 查询计数、DMARC 标签 lint、DKIM 记录解析、MX 体检、
 * 证书信息整形、findings 引擎与评分、多解析器一致性 diff。
 *
 * 设计纪律：
 *  - 不知道用户意图就不亮红（如「无 MX 但有 A」可能是纯展示站）——info/yellow 优先；
 *  - 红只给无歧义错误（语法错 / 过期证书 / 多重 SPF / 超查询上限 / NXDOMAIN）；
 *  - 每个 finding 都带 fix（人话修复建议），没有 fix 的不配出现。
 */

const VERSION = '0.1.0';

// ── 解析器清单（端点固定白名单，不接受任意 URL）───────────────────────────────
const RESOLVERS = [
  { id: 'alidns', label: '阿里 DNS', endpoint: 'https://dns.alidns.com/resolve', region: 'cn' },
  { id: 'dnspod', label: 'DNSPod(腾讯)', endpoint: 'https://doh.pub/dns-query', region: 'cn' },
  { id: 'cloudflare', label: 'Cloudflare', endpoint: 'https://cloudflare-dns.com/dns-query', region: 'global' },
  { id: 'google', label: 'Google', endpoint: 'https://dns.google/resolve', region: 'global' },
];
const DEFAULT_PRIMARY = 'alidns';

const DNS_TYPES = {
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, DS: 43, CAA: 257,
};
const TYPE_NAMES = Object.fromEntries(Object.entries(DNS_TYPES).map(([k, v]) => [v, k]));

const RCODE_CN = {
  0: 'NOERROR（正常）', 1: 'FORMERR（请求格式错误）', 2: 'SERVFAIL（服务器失败）',
  3: 'NXDOMAIN（域名不存在）', 4: 'NOTIMP（不支持）', 5: 'REFUSED（拒绝）',
};

// 常用 DKIM selector（v0.1 诚实探测清单，非穷举）。20230601/20210112 是 Gmail
// 当前公开使用的日期型 selector（真实 DNS 实测，会随 Google 轮换，过期即自然落空）
const COMMON_DKIM_SELECTORS = [
  'google', 'default', 'selector1', 'selector2', 's1', 's2', 'k1', 'fm1', 'fm2',
  'mail', 'smtp', 'dkim', 'mandrill', 'mailgun', 'zoho', 'protonmail',
  '20230601', '20210112',
];

// ── findings 基元 ───────────────────────────────────────────────────────────
/** sev: red(扣分) > yellow(扣分) > info(中性) > green(正常) */
function F(sev, code, title, detail, fix) {
  return { sev, code, title, detail: detail || '', fix: fix || '' };
}
const SEV_ORDER = { red: 0, yellow: 1, info: 2, green: 3 };

/** 排序：red → yellow → info → green */
function sortFindings(list) {
  return [...list].sort((a, b) => (SEV_ORDER[a.sev] - SEV_ORDER[b.sev]) || String(a.code).localeCompare(String(b.code)));
}

function countFindings(findings) {
  const c = { red: 0, yellow: 0, info: 0, green: 0 };
  for (const f of findings) c[f.sev] = (c[f.sev] || 0) + 1;
  return c;
}

/** 评分：100 - 14×red - 5×yellow，下限 0。green/info 不加分也不扣分（它们是「正常」不是「奖励」） */
function computeScore(findings) {
  const c = countFindings(findings);
  const total = Math.max(0, Math.min(100, 100 - c.red * 14 - c.yellow * 5));
  return { total, verdict: verdictOf(total), counts: c };
}

function verdictOf(total) {
  if (total >= 85) return { cn: '优秀：没有发现需要处理的问题', tone: 'good' };
  if (total >= 70) return { cn: '良好：有小问题，建议按黄项处理', tone: 'ok' };
  if (total >= 50) return { cn: '需要关注：存在影响可用性的配置问题', tone: 'warn' };
  return { cn: '有明确问题：红项会实际影响收信/访问/安全', tone: 'bad' };
}

// ── 域名规范化与安全守卫 ─────────────────────────────────────────────────────
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.?$/;

/**
 * 任意输入 → 规范化域名（小写、去 scheme/路径/端口/末尾点）。
 * 返回 { ok, domain, warn? } —— ok=false 时 domain 为空，reason 给人话。
 */
function normalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return { ok: false, reason: '请输入域名' };
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');   // scheme://
  s = s.split('/')[0].split('?')[0].split('#')[0]; // path/query/hash
  s = s.split('@').pop();                          // user@host 形态
  s = s.split(':')[0];                             // 端口
  s = s.replace(/\.+$/, '');
  if (!s) return { ok: false, reason: '请输入域名' };
  if (/[^\x20-\x7e]/.test(s)) return { ok: false, reason: '暂不支持中文/非 ASCII 域名，请先转成 punycode（如 xn--…）再试' };
  if (/\s/.test(s)) return { ok: false, reason: '域名不能含空格' };
  if (s.length > 253) return { ok: false, reason: '域名总长超过 253 字符' };
  if (!DOMAIN_RE.test(s)) return { ok: false, reason: '域名格式不正确（只允许字母/数字/连字符/点）' };
  const labels = s.split('.');
  if (labels.some((l) => l.length > 63)) return { ok: false, reason: '存在超过 63 字符的标签' };
  const warn = labels.length < 2 ? '单标签主机名，绝大多数查询会失败，建议输入完整域名（如 example.com）' : '';
  return { ok: true, domain: s, warn };
}

const UNSAFE_SUFFIXES = ['.local', '.internal', '.home.arpa', '.lan', '.home', '.corp', '.localdomain'];

/**
 * 诊断安全守卫：拒绝环回/私网/链路本地/云元数据等不该被探测的目标。
 * 证书探测（tls.connect）前必须先过这里，且由调用方再做一次 DoH 解析 IP 复核。
 */
function isDiagnosticsSafeHost(domain) {
  const d = String(domain || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!d) return { ok: false, reason: '目标为空' };
  if (d === 'localhost' || d.endsWith('.localhost')) return { ok: false, reason: '拒绝环回地址' };
  if (net_isIPv4(d) || net_isIPv6(d)) return { ok: false, reason: '不支持对 IP 字面量探测（请输入域名）' };
  for (const suf of UNSAFE_SUFFIXES) if (d.endsWith(suf)) return { ok: false, reason: `拒绝内网/保留后缀 ${suf}` };
  return { ok: true };
}

function net_isIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}
function net_isIPv6(s) { return s.includes(':') && /^[0-9a-f:.]+$/i.test(s); }

/** DoH 答案里的 IP 是否属于不该触碰的网段（证书探测前的二次复核） */
function isPrivateAnswerIp(ip) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ''));
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;   // 链路本地/云元数据
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const low = String(ip || '').toLowerCase();
  if (low === '::1' || low === '::' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
  if (low.startsWith('::ffff:')) return isPrivateAnswerIp(low.slice(7));
  return false;
}

// ── DoH 响应归一 ────────────────────────────────────────────────────────────
/** 解析 type 入参：'A'|'mx'|257 均可 → {num, name}；未知返回 null */
function resolveType(type) {
  if (type == null || type === '') return { num: 1, name: 'A' };
  if (typeof type === 'number') return TYPE_NAMES[type] ? { num: type, name: TYPE_NAMES[type] } : null;
  const up = String(type).trim().toUpperCase();
  if (DNS_TYPES[up] != null) return { num: DNS_TYPES[up], name: up };
  const n = Number(up);
  if (Number.isInteger(n) && TYPE_NAMES[n]) return { num: n, name: TYPE_NAMES[n] };
  return null;
}

function canonName(s) {
  return String(s || '').trim().toLowerCase().replace(/\.+$/, '');
}

/** TXT data 归一：去引号、拼接分段（"part1" "part2" → part1part2）、解 \ 转义 */
function unquoteTxt(data) {
  const parts = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  let matched = false;
  while ((m = re.exec(String(data || ''))) !== null) { matched = true; parts.push(m[1]); }
  const raw = matched ? parts.join('') : String(data || '');
  return raw.replace(/\\([\\"])/g, '$1');
}

/** DoH JSON → { status, statusCn, ad, answers:[{name,ttl,type,typeName,data}] }；异常抛错 */
function parseDohResponse(json) {
  if (!json || typeof json !== 'object' || typeof json.Status !== 'number') {
    throw new Error('DoH 响应格式不符（缺 Status 字段）');
  }
  const answers = Array.isArray(json.Answer)
    ? json.Answer.filter((a) => a && a.data != null).map((a) => {
        const num = Number(a.type);
        const typeName = TYPE_NAMES[num] || String(num);
        const raw = String(a.data);
        // MX rdata 形如「10 mail.x.com.」——优先级与主机名拆开存，data 只留主机名
        const mxMatch = typeName === 'MX' ? /^(\d+)\s+(.+)$/.exec(raw.trim()) : null;
        const data = typeName === 'TXT' ? unquoteTxt(raw)
          : typeName === 'MX' ? (mxMatch ? canonName(mxMatch[2]) : canonName(raw))
          : typeName === 'CAA' ? raw
          : (canonName(raw) || raw);
        return { name: canonName(a.name), ttl: Number(a.TTL) || 0, type: num, typeName, raw, pref: mxMatch ? Number(mxMatch[1]) : null, data };
      })
    : [];
  return {
    status: json.Status,
    statusCn: RCODE_CN[json.Status] || `RCODE ${json.Status}`,
    ad: json.AD === true,
    answers,
  };
}

/** 按类型取规范化答案集合（小写排序去重），供 diff/对比 */
function answerSet(parsed, typeName) {
  const t = resolveType(typeName);
  return parsed.answers
    .filter((a) => (t ? a.type === t.num : true))
    .map((a) => a.data)
    .sort();
}

// ── SPF（RFC 7208）──────────────────────────────────────────────────────────
/** 从 TXT 答案集里找 SPF 记录；返回 { records: string[], hasMxLike: bool } */
function findSpfRecords(txtAnswers) {
  const records = (txtAnswers || []).filter((t) => /^v=spf1(\s|$)/i.test(t));
  return records;
}

/**
 * 解析单条 SPF 记录。返回：
 * { ok, version, terms:[{kind,qualifier,name,value,raw}], errors:[], warnings:[] }
 * kind: mechanism | modifier；qualifier: '+'|'-'|'~'|'?'|''
 */
function parseSpfRecord(txt) {
  const res = { ok: true, version: '', terms: [], errors: [], warnings: [] };
  const raw = String(txt || '').trim();
  const m = /^v=spf1(\s+(.*))?$/i.exec(raw);
  if (!m) { res.ok = false; res.errors.push('不是以 v=spf1 开头的记录'); return res; }
  res.version = 'spf1';
  const rest = (m[2] || '').trim();
  if (!rest) { res.warnings.push('记录为空（等价于 +all，不限制任何发信方）'); return res; }
  for (const term of rest.split(/\s+/)) {
    if (!term) continue;
    const eq = term.indexOf('=');
    const colon = term.indexOf(':');
    const isModifier = /^[a-z][a-z0-9._-]*=/i.test(term);
    if (isModifier) {
      const name = term.slice(0, eq).toLowerCase();
      const value = term.slice(eq + 1);
      if (name === 'redirect' || name === 'exp') {
        if (!value) res.errors.push(`${name}= 缺少值`);
        res.terms.push({ kind: 'modifier', qualifier: '', name, value, raw: term });
      } else {
        res.warnings.push(`未知的修饰符 ${name}=（将被忽略）`);
        res.terms.push({ kind: 'modifier', qualifier: '', name, value, raw: term, unknown: true });
      }
      continue;
    }
    let q = '';
    let body = term;
    if (/^[+\-~?]/.test(term)) { q = term[0]; body = term.slice(1); }
    const c = body.indexOf(':');
    const name = (c >= 0 ? body.slice(0, c) : body).toLowerCase();
    const value = c >= 0 ? body.slice(c + 1) : '';
    switch (name) {
      case 'ip4': {
        if (!value) { res.errors.push(`ip4 缺少地址：${term}`); break; }
        const vm = /^([\d.]+)(\/(\d{1,2}))?$/.exec(value);
        if (!vm || !net_isIPv4(vm[1]) || (vm[3] != null && Number(vm[3]) > 32)) {
          res.errors.push(`ip4 地址或前缀不合法：${term}`);
        }
        break;
      }
      case 'ip6': {
        if (!value) { res.errors.push(`ip6 缺少地址：${term}`); break; }
        const vm = /^([0-9a-f:.]+)(\/(\d{1,3}))?$/i.exec(value);
        if (!vm || !vm[1].includes(':') || (vm[3] != null && Number(vm[3]) > 128)) {
          res.errors.push(`ip6 地址或前缀不合法：${term}`);
        }
        break;
      }
      case 'include': case 'exists':
        if (!value) res.errors.push(`${name} 缺少域名参数：${term}`);
        break;
      case 'a': case 'mx':
        // domain-spec 与 CIDR 均可选，语法上允许无参数
        if (value && !/^[a-z0-9._\-*/]+$/i.test(value)) res.warnings.push(`${name} 的参数形态少见：${term}`);
        break;
      case 'ptr': break; // 参数可选
      case 'all':
        if (value) res.errors.push(`all 不接受参数：${term}`);
        break;
      default:
        res.errors.push(`未知机制：${term}`);
    }
    res.terms.push({ kind: 'mechanism', qualifier: q || '+', name, value, raw: term });
  }
  if (res.errors.length) res.ok = false;
  return res;
}

/**
 * RFC 7208 §4.6.4 静态 DNS 查询计数：
 * include/a/mx/ptr/exists 每出现一次计 1，redirect 计 1。
 * 注意：这是静态分析，不是完整求值（求值结果依赖收件方视角）。
 */
function spfLookupCount(terms) {
  const counting = ['include', 'a', 'mx', 'ptr', 'exists'];
  const items = [];
  let count = 0;
  for (const t of terms || []) {
    if (t.kind === 'mechanism' && counting.includes(t.name)) {
      count += 1;
      items.push({ term: t.raw, cost: 1 });
    } else if (t.kind === 'modifier' && t.name === 'redirect') {
      count += 1;
      items.push({ term: 'redirect', cost: 1 });
    }
  }
  return { count, items, overLimit: count > 10, atLimit: count === 10 };
}

/** SPF findings 组装（record 可为 null=无记录） */
function spfFindings(ctx) {
  const out = [];
  const { records, mxPresent, hasA, parse } = ctx;
  if (!records.length) {
    if (mxPresent) {
      out.push(F('yellow', 'spf.missing', '有收信主机（MX）但未发布 SPF',
        '没有 SPF 时，收件方无法验证「哪些服务器有权替你发信」，伪造你的域名发信不会被拦。',
        '添加 TXT 记录（按实际发信服务调整）：v=spf1 include:<你的邮件服务商> -all'));
    } else if (hasA) {
      out.push(F('info', 'spf.none-a', '未发布 SPF',
        '本域当前未见 MX；如果这台域名还要发邮件（网站发通知信也算），同样需要 SPF。',
        '如需发信，添加 TXT：v=spf1 include:<你的邮件服务商> -all'));
    } else {
      out.push(F('info', 'spf.none', '未发布 SPF（本域未见收信配置）',
        '若本域只作网站/跳转用途且不发邮件，可以保持现状。', ''));
    }
    return out;
  }
  if (records.length > 1) {
    out.push(F('red', 'spf.multiple', `发现 ${records.length} 条 SPF 记录（RFC 7208 要求恰好一条）`,
      '多条 v=spf1 记录时 RFC 规定按 permerror 处理，等于 SPF 完全失效。',
      '把多条记录合并成一条（include 并入），删除多余的 v=spf1 TXT 记录'));
  }
  const p = parse || parseSpfRecord(records[0]);
  for (const e of p.errors) out.push(F('red', 'spf.syntax', `SPF 语法错误：${e}`, '语法错误的记录会被按 permerror 处理，保护失效。', '修正记录语法后保存'));
  const lk = spfLookupCount(p.terms);
  if (lk.overLimit) {
    out.push(F('red', 'spf.lookup-over', `SPF DNS 查询次数 ${lk.count} 次超过上限 10 次（RFC 7208 §4.6.4）`,
      '收件方在超过 10 次时必须按 permerror 处理，你的 SPF 可能整体失效。',
      '精简 include（去掉用不到的服务商）、把分段 IP 直接写成 ip4: 段、或对 include 的域名做 SPF 扁平化'));
  } else if (lk.atLimit) {
    out.push(F('yellow', 'spf.lookup-at', 'SPF DNS 查询次数恰好 10 次（达到上限）',
      '任何上游 include 变更都可能让你突破上限触发 permerror。', '预留余量：精简 1-2 个 include 或扁平化'));
  }
  const allTerm = p.terms.find((t) => t.kind === 'mechanism' && t.name === 'all');
  if (!allTerm) {
    out.push(F('red', 'spf.no-all', 'SPF 末尾没有 all 机制（默认按 +all 处理）',
      '缺省即「允许全世界冒充你的域名发信」，等于没有防护。', '在记录末尾补上 -all（严格）或 ~all（软失败）'));
  } else {
    const q = allTerm.qualifier;
    if (q === '+') out.push(F('red', 'spf.plus-all', 'SPF 以 +all 结尾', '+all 明确允许任何服务器冒充你发信，等同于裸奔。', '改成 -all'));
    else if (q === '?') out.push(F('yellow', 'spf.neutral-all', 'SPF 以 ?all 结尾（中性）', '中性限定对伪造邮件不设防，防伪效果接近没有。', '改成 -all 或 ~all'));
    else if (q === '~') out.push(F('info', 'spf.softfail', 'SPF 以 ~all 结尾（软失败）', '常见且可用的选择：伪造邮件会被标记但不必然拒收。要求严格的场景可换 -all。', ''));
    else out.push(F('green', 'spf.strict', 'SPF 以 -all 结尾（严格）', '非授权来源发信将被拒收。', ''));
  }
  if (p.terms.some((t) => t.kind === 'mechanism' && t.name === 'ptr')) {
    out.push(F('info', 'spf.ptr', 'SPF 使用了 ptr 机制', 'RFC 7208 不建议使用，不少收件方会跳过它，徒增查询次数。', '如条件允许改用 ip4:/include: 明确列出'));
  }
  if (p.terms.some((t) => t.kind === 'modifier' && t.name === 'redirect')
    && p.terms.some((t) => t.kind === 'mechanism' && t.name === 'all')) {
    out.push(F('info', 'spf.redirect-shortcut', 'redirect= 与 all 同时存在', '求值到 all 即终止，redirect 不会生效，二者留一个即可。', ''));
  }
  for (const w of p.warnings) out.push(F('info', 'spf.warn', `SPF 提示：${w}`, '', ''));
  return out;
}

// ── DMARC（RFC 7489）───────────────────────────────────────────────────────
/** 解析 DMARC 记录文本；非 v=DMARC1 返回 null */
function parseDmarcRecord(txt) {
  const raw = String(txt || '').trim();
  if (!/^v\s*=\s*DMARC1(\s*;|$)/i.test(raw)) return null;
  const res = { raw, tags: {}, unknown: [], errors: [], warnings: [], duplicates: [] };
  const seen = new Set();
  for (const part of raw.split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq < 0) { res.errors.push(`无法解析的片段「${seg}」（缺 =）`); continue; }
    const key = seg.slice(0, eq).trim().toLowerCase();
    const value = seg.slice(eq + 1).trim();
    if (seen.has(key)) { res.duplicates.push(key); continue; }
    seen.add(key);
    res.tags[key] = value;
  }
  if (res.duplicates.length) res.errors.push(`重复标签：${res.duplicates.join(', ')}`);
  if ((res.tags.v || '').toUpperCase() !== 'DMARC1') res.errors.push('v 标签必须是 DMARC1');
  const KNOWN = ['v', 'p', 'sp', 'pct', 'rua', 'ruf', 'adkim', 'aspf', 'fo', 'rf', 'ri'];
  for (const k of Object.keys(res.tags)) if (!KNOWN.includes(k)) res.unknown.push(k);
  if (res.tags.p && !['none', 'quarantine', 'reject'].includes(res.tags.p.toLowerCase())) {
    res.errors.push(`p 值不合法：${res.tags.p}（只能 none/quarantine/reject）`);
  }
  if (res.tags.pct != null && !/^\d+$/.test(res.tags.pct)) res.errors.push(`pct 必须是整数：${res.tags.pct}`);
  else if (res.tags.pct != null && (Number(res.tags.pct) < 0 || Number(res.tags.pct) > 100)) res.errors.push('pct 必须在 0-100');
  if (res.tags.adkim && !['r', 's'].includes(res.tags.adkim.toLowerCase())) res.errors.push('adkim 只能 r/s');
  if (res.tags.aspf && !['r', 's'].includes(res.tags.aspf.toLowerCase())) res.errors.push('aspf 只能 r/s');
  return res;
}

/** DMARC findings。ctx: { record(解析结果|null), orgRecord(父域解析结果|null), isSubdomain } */
function dmarcFindings(ctx) {
  const out = [];
  const { record, orgRecord, isSubdomain } = ctx;
  if (!record && isSubdomain && orgRecord) {
    out.push(F('info', 'dmarc.inherit', '子域未发布 DMARC，将继承主域策略',
      `父域策略 p=${(orgRecord.tags && orgRecord.tags.p) || '?'} 会作用到本子域。`, ''));
    return out;
  }
  if (!record) {
    out.push(F('yellow', 'dmarc.missing', '未发布 DMARC 记录',
      'Gmail/Yahoo/Outlook 已把 DMARC 列入发件人要求（批量发件人强制）；没有它，冒充你域名的邮件难以被识别和处置。',
      '添加 TXT（主机名 _dmarc）：v=DMARC1; p=quarantine; rua=mailto:你@域名'));
    return out;
  }
  for (const e of record.errors) out.push(F('red', 'dmarc.syntax', `DMARC 语法错误：${e}`, '语法错误的记录会被收件方忽略。', '修正 _dmarc TXT 记录'));
  const p = (record.tags.p || '').toLowerCase();
  if (!record.tags.p) {
    out.push(F('red', 'dmarc.no-p', 'DMARC 缺少 p 标签（必填）', '缺 p 的记录不合法，等于没有。', '补上 p=quarantine 或 p=reject'));
  } else if (p === 'none') {
    out.push(F('yellow', 'dmarc.p-none', 'DMARC 策略为 p=none（仅监控，不处置）',
      '冒充邮件会被记录进报告但不会被隔离/拒收。建议先观察 rua 报告，再逐步收紧。',
      '确认合法来源都通过对齐后，把 p 提升为 quarantine 或 reject'));
  } else if (p === 'quarantine') {
    out.push(F('green', 'dmarc.p-quarantine', 'DMARC 策略为 p=quarantine', '未通过验证的邮件会被收进垃圾箱。', ''));
  } else if (p === 'reject') {
    out.push(F('green', 'dmarc.p-reject', 'DMARC 策略为 p=reject', '最强处置：未通过验证的冒充邮件直接拒收。', ''));
  }
  if (!record.tags.rua) {
    out.push(F('yellow', 'dmarc.no-rua', '未配置 rua 聚合报告地址',
      '没有 rua 就收不到「谁在以你的域名发信」的每日报告，收紧策略前无从判断影响面。',
      '加 rua=mailto:你@域名（可先用免费报告解析服务生成可读报表）'));
  }
  if (record.tags.pct != null && Number(record.tags.pct) < 100) {
    out.push(F('info', 'dmarc.pct', `策略仅作用于 ${record.tags.pct}% 的邮件（pct）`, '灰度发布用；确认稳定后记得调回 100。', ''));
  }
  if (record.tags.sp) {
    out.push(F('info', 'dmarc.sp', `子域策略 sp=${record.tags.sp}`, '仅对「直接从子域发信且子域无自己的 DMARC」生效。', ''));
  }
  for (const k of record.unknown) out.push(F('info', 'dmarc.unknown-tag', `未知的 DMARC 标签 ${k}=（被忽略）`, '', ''));
  return out;
}

// ── DKIM ───────────────────────────────────────────────────────────────────
/** 解析 DKIM key 记录（selector._domainkey 的 TXT） */
function parseDkimRecord(txt) {
  const raw = String(txt || '').trim();
  if (!raw) return null;
  const res = { raw, version: '', keyType: 'rsa', hasPubKey: false, revoked: false, flags: [], errors: [], services: [], hashAlgos: [] };
  for (const part of raw.split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq < 0) { res.errors.push(`无法解析片段「${seg}」`); continue; }
    const k = seg.slice(0, eq).trim().toLowerCase();
    const v = seg.slice(eq + 1).trim();
    if (k === 'v') res.version = v.toUpperCase();
    else if (k === 'k') res.keyType = v.toLowerCase();
    else if (k === 'p') {
      if (v === '') res.revoked = true;
      else if (/^[A-Za-z0-9+/=]+$/.test(v)) res.hasPubKey = true;
      else res.errors.push('p= 不是合法 base64');
    } else if (k === 't') res.flags = v.split(':').map((s) => s.trim()).filter(Boolean);
    else if (k === 'h') res.hashAlgos = v.split(':').map((s) => s.trim()).filter(Boolean);
    else if (k === 's') res.services = v.split(':').map((s) => s.trim()).filter(Boolean);
  }
  if (!res.revoked && !res.hasPubKey && !res.errors.length) res.errors.push('缺少 p= 公钥字段');
  return res;
}

/** DKIM findings：probed=[{selector, found, record}] */
function dkimFindings(probed) {
  const out = [];
  const found = (probed || []).filter((x) => x.found);
  if (!probed || !probed.length) {
    out.push(F('info', 'dkim.skipped', '未执行 DKIM selector 探测', '', ''));
    return out;
  }
  if (!found.length) {
    out.push(F('info', 'dkim.not-found', `未在 ${probed.length} 个常见 selector 中发现 DKIM 记录`,
      'DKIM 的 selector 是自定义的，找不到 ≠ 没配置；常见服务商 selector：google、selector1/2（微软）、k1、s1/2、default、fm1 等。',
      '若知道自己的 selector，可在「设置」里补充后重新体检；或直接在聊天里告诉 AI selector 名'));
    return out;
  }
  const revoked = found.filter((x) => x.record && x.record.revoked);
  const broken = found.filter((x) => x.record && x.record.errors.length);
  const valid = found.filter((x) => x.record && x.record.hasPubKey && !x.record.errors.length);
  // 通配撤销声明模式：命中的全部是同一份 revoked 记录（v=DKIM1; p=），无任何有效公钥。
  // 这是域名所有者主动声明「本域不用 DKIM」的防御性发布（example.com 等保留域实测存在），
  // 不是 N 条配置错误——收成一条 info，避免 18 条黄淹没报告。
  const allRevokedSame = valid.length === 0 && broken.length === 0
    && revoked.length > 0 && revoked.every((x) => x.record.raw === revoked[0].record.raw);
  if (allRevokedSame) {
    out.push(F('info', 'dkim.wildcard-revoked',
      `检测到通配撤销声明（${revoked.length} 个 selector 返回同一份空公钥记录 v=DKIM1; p=）`,
      '这是域名所有者主动声明「本域不使用 DKIM」的防御性发布，不是配置错误。',
      '若你本应在此域配置 DKIM，请核对 selector 名称与记录内容'));
    return out;
  }
  for (const x of broken) out.push(F('yellow', 'dkim.record-broken', `DKIM 记录疑似不完整（selector=${x.selector}）`, (x.record.errors || []).join('；'), '检查该 selector 的 TXT 记录是否复制完整'));
  for (const x of revoked) out.push(F('yellow', 'dkim.revoked', `DKIM 公钥已撤销（selector=${x.selector}）`, 'p= 为空表示该密钥已停用，若仍在用它签名会全部验证失败。', '确认发信服务已换用其他 selector'));
  const selNames = found.map((x) => x.selector);
  const selText = selNames.length > 6 ? `${selNames.slice(0, 6).join(', ')} 等 ${selNames.length} 个` : selNames.join(', ');
  out.push(F('green', 'dkim.found', `发现 ${found.length} 条 DKIM 记录（selector：${selText}）`,
    '签发方会用自己的 selector 签名；配合 SPF/DMARC 构成完整邮件身份。', ''));
  return out;
}

// ── MX ─────────────────────────────────────────────────────────────────────
/**
 * MX findings。ctx: { answers:[{data,ttl,pref?}], hasA, aAnswers }
 * 约定：answers.data 已是 canonName；对 null MX（RFC 7506）优先识别。
 */
function mxFindings(ctx) {
  const out = [];
  const answers = ctx.answers || [];
  const isNullMx = answers.length === 1 && (answers[0].data === '' || answers[0].data === '.');
  if (isNullMx) {
    out.push(F('green', 'mx.null', '本域声明不收邮件（null MX，RFC 7506）', '明确的「拒收」声明，比让发件方超时更礼貌高效。', ''));
    return out;
  }
  if (!answers.length) {
    if (ctx.hasA) {
      out.push(F('info', 'mx.fallback-a', '无 MX 记录，收件方会尝试投递到 A 记录主机',
        '部分现代收件方已不再接受这种回退，且没有备份通路。若本域需要收信建议补 MX；若永不收信可发布 null MX 让投递快速终止。',
        '收信：添加 MX 记录指向邮件服务商；不收信：添加一条 MX（优先级 0，目标 .）'));
    } else {
      out.push(F('info', 'mx.none', '无 MX 记录（本域未见收信路径）', '若本域需要收信才需要处理。', ''));
    }
    return out;
  }
  // 目标体检
  const seen = new Map();
  for (const a of answers) {
    const target = canonName(a.data);
    if (!target) { out.push(F('yellow', 'mx.empty', '存在空的 MX 目标', '该记录无法投递。', '删除或修正这条 MX')); continue; }
    if (net_isIPv4(target) || net_isIPv6(target)) {
      out.push(F('red', 'mx.ip-literal', `MX 目标是 IP 字面量（${target}）`, 'RFC 5321 明确禁止 MX 指向 IP，部分收件方会直接拒信。', '把 MX 改指到主机名，并给主机名配 A/AAAA'));
    }
    if (seen.has(target)) seen.set(target, seen.get(target) + 1);
    else seen.set(target, 1);
  }
  for (const [t, n] of seen) if (n > 1) out.push(F('info', 'mx.dup', `MX 目标重复：${t}（${n} 条）`, '通常没必要，可能是一次误操作残留。', '确认后删掉多余的一条'));
  if (seen.size === 1 && answers.length > 1) {
    out.push(F('info', 'mx.single-host', '所有 MX 指向同一主机', '没有备份通路；主机故障期间来信会退信。多数邮件服务商已用多主机 + 备援，无需处理。', ''));
  }
  return out;
}

// ── 证书 ───────────────────────────────────────────────────────────────────
/**
 * 整形 node tls.getPeerCertificate(true) 输出 → 报告形态。
 * 只取需要的字段，时间统一 ISO，daysLeft 由 validTo 计算（本地时钟）。
 */
function shapeCertInfo(raw, domain, tlsVersion, authorizationError) {
  if (!raw || !raw.valid_to) return null;
  const validTo = new Date(raw.valid_to);
  const validFrom = new Date(raw.valid_from);
  const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86400000);
  const sans = [];
  if (raw.subjectaltname) {
    for (const part of String(raw.subjectaltname).split(',')) {
      const seg = part.trim();
      if (/^DNS:/i.test(seg)) sans.push(canonName(seg.slice(4)));
    }
  }
  const chainKeys = raw.issuerCertificate ? Object.keys(collectChain(raw)).length : 1;
  const cn = (raw.subject && raw.subject.CN) || '';
  const issuerCn = (raw.issuer && raw.issuer.CN) || (raw.issuer && raw.issuer.O) || '';
  return {
    domain,
    subjectCn: cn,
    issuer: issuerCn,
    validFrom: isNaN(validFrom.getTime()) ? String(raw.valid_from) : validFrom.toISOString(),
    validTo: isNaN(validTo.getTime()) ? String(raw.valid_to) : validTo.toISOString(),
    daysLeft,
    sans,
    coversDomain: sans.includes(canonName(domain)) || sans.some((s) => s.startsWith('*.') && canonName(domain).endsWith(s.slice(1))),
    selfSigned: !!cn && !!issuerCn && cn === issuerCn && chainKeys <= 1,
    chainLength: chainKeys,
    tlsVersion: tlsVersion || '',
    authorizationError: authorizationError ? String(authorizationError) : '',
  };
}

function collectChain(cert, acc = {}, depth = 0) {
  if (!cert || depth > 10 || acc[cert.fingerprint]) return acc;
  acc[cert.fingerprint] = { subject: cert.subject && cert.subject.CN, issuer: cert.issuer && cert.issuer.CN };
  if (cert.issuerCertificate) collectChain(cert.issuerCertificate, acc, depth + 1);
  return acc;
}

function certFindings(cert, domain) {
  if (!cert) return [F('yellow', 'cert.unavailable', '未取到证书信息', '443 端口未开放或连接失败。若该域名不提供 HTTPS，此项可忽略。', '')];
  const out = [];
  if (cert.daysLeft < 0) {
    out.push(F('red', 'cert.expired', `证书已过期（${cert.validTo.slice(0, 10)}）`, '访问者会看到安全警告，API 调用会失败。', '立即续签证书并重新部署'));
  } else if (cert.daysLeft <= 13) {
    out.push(F('red', 'cert.expire-soon', `证书 ${cert.daysLeft} 天后过期（${cert.validTo.slice(0, 10)}）`, '过期后站点/API 直接不可用。', '确认自动续签（如 Let\'s Encrypt 定时任务）正常，或手动续签'));
  } else if (cert.daysLeft <= 30) {
    out.push(F('yellow', 'cert.expire-window', `证书 ${cert.daysLeft} 天后过期`, '建议确认自动续签链路健在。', '检查续签自动化'));
  } else {
    out.push(F('green', 'cert.valid', `证书有效期至 ${cert.validTo.slice(0, 10)}（剩 ${cert.daysLeft} 天）`, '', ''));
  }
  if (!cert.coversDomain) {
    out.push(F('red', 'cert.san-mismatch', '证书 SAN 不包含该域名', `证书覆盖：${cert.sans.slice(0, 8).join(', ') || '（无 SAN）'}`, '签发覆盖本域的新证书，或访问时使用证书实际覆盖的域名'));
  }
  if (cert.selfSigned) {
    out.push(F('red', 'cert.self-signed', '证书是自签发的', '访客与 API 调用方都会校验失败。', '改用受信任 CA 签发（Let\'s Encrypt 免费即可）'));
  } else if (cert.authorizationError) {
    out.push(F('yellow', 'cert.verify-fail', `证书链校验未通过：${cert.authorizationError}`, '部分客户端能容忍，多数会拒绝。常见于链不完整或系统时钟偏差。', '部署完整证书链（fullchain），或校准本机时间'));
  } else {
    out.push(F('green', 'cert.chain-ok', '证书链校验通过', '', ''));
  }
  return out;
}

// ── CAA / DNSSEC / NS-SOA ──────────────────────────────────────────────────
function caaFindings(answers) {
  if (!answers.length) {
    return [F('info', 'caa.none', '未设置 CAA 记录', '可选项目：用于限定哪些 CA 可以为本域签发证书，防误签。', '如需收紧，添加 CAA 0 issue "letsencrypt.org"（按你的 CA 调整）')];
  }
  const issueCAs = answers.map((a) => (/\b(issue|issuewild)\s+"([^"]*)"/.exec(a.raw) ? RegExp.$2 : '')).filter(Boolean);
  return [F('green', 'caa.present', `已设置 CAA（${issueCAs.join(', ') || answers.length + ' 条'}）`, '只有列出的 CA 可以为本域签发证书。', '')];
}

function dnssecFindings(dsParsed) {
  if (dsParsed && dsParsed.answers.some((a) => a.type === DNS_TYPES.DS)) {
    return [F('green', 'dnssec.on', '已启用 DNSSEC（存在 DS 记录）', '解析结果可被链式验证，防劫持。', '')];
  }
  return [F('info', 'dnssec.off', '未检测到 DS 记录（DNSSEC 未启用或查询路径未返回）',
    '可选项目：防 DNS 劫持的签名链。需注册商与托管商双侧支持。', '如需启用：先在 DNS 托管商开签名，再在注册商处提交 DS')];
}

function nsSoaFindings(nsParsed, soaParsed) {
  const out = [];
  if (!nsParsed || nsParsed.status === 3 || !nsParsed.answers.length) {
    out.push(F('red', 'dns.no-ns', '无法获取 NS 记录（域名未注册/未设置 DNS/NXDOMAIN）',
      nsParsed ? `解析器返回：${nsParsed.statusCn}` : '', '确认域名已注册且 DNS 托管已配置'));
  } else {
    out.push(F('green', 'dns.ns', `权威 NS：${nsParsed.answers.map((a) => a.data).join(', ')}`, '', ''));
  }
  if (soaParsed && !soaParsed.answers.length && (!nsParsed || nsParsed.status === 0)) {
    out.push(F('yellow', 'dns.no-soa', '未见 SOA 记录', 'SOA 是区域的起始授权记录，缺失通常意味着区域未正确加载。', '检查 DNS 托管商的区域配置'));
  }
  return out;
}

function apexAddressFindings(aParsed, aaaaParsed) {
  const hasA = aParsed && aParsed.answers.some((x) => x.type === 1);
  const hasAAAA = aaaaParsed && aaaaParsed.answers.some((x) => x.type === 28);
  const out = [];
  if (!hasA && !hasAAAA) {
    out.push(F('yellow', 'dns.no-address', '主域（@）没有 A/AAAA 记录',
      '常见于只用 www 子域或 CNAME 扁平化托管；若本应可访问则会打不开。', '确认是否需要给 @ 添加解析'));
  } else {
    out.push(F('green', 'dns.address', `主域解析：${[hasA ? 'A' : '', hasAAAA ? 'AAAA' : ''].filter(Boolean).join(' + ')}`, '', ''));
  }
  return { findings: out, hasA, hasAAAA };
}

// ── 多解析器一致性 diff ─────────────────────────────────────────────────────
/**
 * per: [{resolver, ok, status, ad, answers:[{type,typeName,data,ttl}], error}]
 * → { consistent, groups:[{answerKey, resolvers:[id], ttls}], unreachable:[{id,error}] }
 */
function diffResolvers(per) {
  const ok = (per || []).filter((x) => x.ok);
  const unreachable = (per || []).filter((x) => !x.ok).map((x) => ({ id: x.resolver, error: x.error || '查询失败' }));
  const groups = [];
  const byKey = new Map();
  for (const x of ok) {
    const key = JSON.stringify((x.answers || []).map((a) => `${a.typeName}:${a.data}`));
    if (!byKey.has(key)) {
      const g = { answerKey: key, answers: x.answers || [], resolvers: [], ttls: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    const g = byKey.get(key);
    g.resolvers.push(x.resolver);
    g.ttls.push(...(x.answers || []).map((a) => a.ttl));
  }
  return { consistent: ok.length > 0 && groups.length === 1, groups, unreachable, okCount: ok.length };
}

// ── 报告摘要（MCP/历史单行）────────────────────────────────────────────────
function summarizeReport(rep) {
  if (!rep) return '';
  const c = rep.counts || countFindings(rep.findings || []);
  const sc = rep.score ? `${rep.score.total}分` : '';
  const kindCn = { full: '全面体检', email: '邮件身份', cert: '证书', lookup: '单查询' }[rep.kind] || rep.kind;
  return `[${kindCn}] ${rep.domain} ${sc} 红${c.red} 黄${c.yellow}（${String(rep.finishedAt || '').replace('T', ' ').slice(0, 16)}）`;
}

module.exports = {
  VERSION,
  RESOLVERS, DEFAULT_PRIMARY, COMMON_DKIM_SELECTORS, DNS_TYPES, TYPE_NAMES, RCODE_CN,
  F, sortFindings, countFindings, computeScore, verdictOf,
  normalizeDomain, isDiagnosticsSafeHost, isPrivateAnswerIp,
  resolveType, canonName, unquoteTxt, parseDohResponse, answerSet,
  findSpfRecords, parseSpfRecord, spfLookupCount, spfFindings,
  parseDmarcRecord, dmarcFindings,
  parseDkimRecord, dkimFindings,
  mxFindings,
  shapeCertInfo, certFindings,
  caaFindings, dnssecFindings, nsSoaFindings, apexAddressFindings,
  diffResolvers, summarizeReport,
};
