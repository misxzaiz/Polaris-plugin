'use strict';
/**
 * version-core.js —— semver 版本范围检查器共享核心（单一权威，零依赖纯函数、零 node 内置模块）。
 * 被 MCP server（CJS require）与面板（esbuild 打进 browser bundle）共用。
 *
 * 语义以 node-semver 7.x（npm 实际行为）为权威参照，自研实现 + 测试中差分对拍：
 *  - 严格版本解析：v 前缀容忍、build 元数据解析（比较时忽略）、prerelease 点分标识符
 *    （数字标识符按数值、字母按 ASCII、数字小于字母、先到先判、前缀全等则多者大）
 *  - 范围：'||' 并集、空格 AND、连字符区间、波浪线与插入符全形态（含 0.x 特例）、
 *    x 通配（x/X/*）、部分版本跳段语义（>1.2 等价于 >=1.3.0）、上界以「-0」精确排他
 *    （如 <2.0.0-0：既排除 2.0.0 也排除其全部预发布）
 *  - 预发布门控（npm 默认行为）：带预发布的候选版本只有当某个交集组里存在
 *    「同 M.m.p 且带预发布」的比较器时才可能被匹配——星号/空范围也装不到 beta
 *  - 坑检测：0.x 插入符锁定次版本、0.0.x 锁定补丁、预发布门控、部分版本跳段、
 *    空交集组、等号部分版本并非精确等于、构建元数据被忽略
 *
 * 边界（如实声明）：不做 registry 网络查询；不支持 loose 宽松解析（前导零等严格报错）；
 * 不支持 node-semver 的 includePrerelease 等 options 变体。
 */

const VERSION_RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
// 严格 prerelease 标识符：纯数字（无前导零）或至少含一个字母/连字符
const PRERELEASE_ID_RE = /^(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)$/;

/** 解析单个完整版本（允许 v 前缀；不允许 x 通配——通配在比较器层处理） */
function parseVersion(input) {
  const raw = String(input == null ? '' : input).trim();
  if (raw === '') return { ok: false, error: '版本号为空', raw };
  const m = VERSION_RE.exec(raw);
  if (!m) return { ok: false, error: `不是合法的 semver 版本（应为 major.minor.patch[-prerelease][+build]）：「${raw}」`, raw };
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  const preRaw = m[4];
  let prerelease = [];
  if (preRaw !== undefined) {
    prerelease = preRaw.split('.');
    const bad = prerelease.find((id) => !PRERELEASE_ID_RE.test(id));
    if (bad !== undefined) return { ok: false, error: `prerelease 标识符「${bad}」不合法（数字标识符不能有前导零）`, raw };
  }
  return {
    ok: true,
    version: { major, minor, patch, prerelease, build: m[5] !== undefined ? m[5] : null, raw: raw.replace(/^v/, '') },
  };
}

function isNumericId(id) { return /^\d+$/.test(id); }

/** 比较（build 元数据忽略）；数字标识符无前导零时长度即大小，避开超大数精度丢失 */
function compareParsed(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (ap.length === 0 && bp.length === 0) return 0;
  if (ap.length === 0) return 1;   // 正式版高于一切预发布
  if (bp.length === 0) return -1;
  const n = Math.min(ap.length, bp.length);
  for (let i = 0; i < n; i++) {
    const x = ap[i];
    const y = bp[i];
    if (x === y) continue;
    const xn = isNumericId(x);
    const yn = isNumericId(y);
    if (xn && yn) {
      if (x.length !== y.length) return x.length < y.length ? -1 : 1;
      return x < y ? -1 : 1;
    }
    if (xn) return -1;           // 数字标识符 < 字母标识符
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  if (ap.length === bp.length) return 0;
  return ap.length < bp.length ? -1 : 1; // 前缀全等：标识符多者大
}

/** 单比较器判定：v 是否满足 op + 完整版本 c */
function cmpOk(v, c) {
  const d = compareParsed(v, c.version);
  switch (c.op) {
    case '=': return d === 0;
    case '>': return d > 0;
    case '>=': return d >= 0;
    case '<': return d < 0;
    case '<=': return d <= 0;
    default: return d === 0;
  }
}

// ---------- 范围解析 ----------
// x 段正则（含通配），严格数字段
const NUM = '(?:0|[1-9]\\d*)';
const XR = `(?:${NUM}|x|X|\\*)`;
const PARTIAL_RE = new RegExp(
  `^v?(${XR})(?:\\.(${XR})(?:\\.(${XR})` +
  `(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?` +
  `(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?)?)?$`
);

function isX(t) { return t === undefined || t === 'x' || t === 'X' || t === '*'; }
function numOr(t, dft) { return isX(t) ? dft : Number(t); }

/**
 * 解析一个比较器原子（op + 版本/通配）→ { op, version }[]（部分版本展开为 1~2 个比较器）
 * pitfall: 展开中发现的形态坑就地收集
 */
function expandAtom(opRaw, verText, out, pitfalls, rawAtom) {
  const op = opRaw === '' || opRaw === '=' ? '=' : opRaw;
  if (isX(verText.trim())) {
    // 纯 * / x 配比较符：npm 把 >* 与 <* 都编译为恒假比较器 <0.0.0-0（不存在更小版本）
    if (op === '>' || op === '<') {
      pitfalls.push({ type: 'any-with-cmp', message: `「${rawAtom}」对任意版本做 ${op} 比较恒为假（npm 编译为 <0.0.0-0），该比较器永不匹配` });
      out.push({ op: '<', version: { major: 0, minor: 0, patch: 0, prerelease: ['0'], raw: '0.0.0-0' }, raw: rawAtom });
      return;
    }
    return; // any：不产生比较器（空 set 即任意；预发布仍被门控拦截）
  }
  const m = PARTIAL_RE.exec(verText);
  if (!m) throw new Error(`无法解析版本/通配「${verText}」`);
  const M = m[1];
  const mi = m[2];
  const pa = m[3];
  const pre = m[4];
  const build = m[5];

  if (isX(M)) {
    // *.x / x.2 这类高位通配低位具体：npm 视同任意（*）
    if (!isX(mi) || !isX(pa)) {
      pitfalls.push({ type: 'wildcard-major', message: `「${verText}」高位通配低位具体，npm 视同任意版本（*）` });
    }
    return;
  }
  if (build !== undefined && op !== '') {
    pitfalls.push({ type: 'build-ignored', message: `构建元数据（+${build}）在比较中被忽略` });
  }

  const fullM = Number(M);
  if (isX(mi)) {
    // 1 / 1.x / 1.x.x
    applyPartial(op, fullM, null, null, null, out, pitfalls, rawAtom);
    return;
  }
  if (isX(pa)) {
    // 1.2 / 1.2.x
    applyPartial(op, fullM, Number(mi), null, null, out, pitfalls, rawAtom);
    return;
  }
  // 完整版本
  const v = { major: fullM, minor: Number(mi), patch: Number(pa), prerelease: pre ? pre.split('.') : [], build: build !== undefined ? build : null, raw: `${fullM}.${Number(mi)}.${Number(pa)}${pre ? '-' + pre : ''}` };
  applyFull(op, v, out, rawAtom, pitfalls);
}

/** mk：比较器构造。synthetic=true 表示该「-0」上界是插入符/波浪线/部分版本的展开产物（非用户显式书写），仅用于区分 prerelease-gate 提示口径 */
function mk(op, major, minor, patch, prerelease, raw, synthetic) {
  return { op, version: { major, minor, patch, prerelease: prerelease || [], raw }, raw, synthetic: !!synthetic };
}

/** 完整版本 + 比较符 → 1 个比较器（插入符/波浪线展开为区间） */
function applyFull(op, v, out, rawAtom, pitfalls) {
  if (op === '~' || op === '^') {
    out.push(mk('>=', v.major, v.minor, v.patch, v.prerelease, `>=${v.raw}`));
    if (op === '~') {
      // 波浪线：锁定到次版本（~1.2.3 → >=1.2.3 <1.3.0-0）
      out.push(mk('<', v.major, v.minor + 1, 0, ['0'], `<${v.major}.${v.minor + 1}.0-0`, true));
    } else {
      // 插入符：锁定左起第一个非零成分；全零向上取缺省位下一位
      let hi;
      if (v.major > 0) hi = { major: v.major + 1, minor: 0, patch: 0 };
      else if (v.minor > 0) hi = { major: 0, minor: v.minor + 1, patch: 0 };
      else hi = { major: 0, minor: 0, patch: v.patch + 1 };
      out.push(mk('<', hi.major, hi.minor, hi.patch, ['0'], `<${hi.major}.${hi.minor}.${hi.patch}-0`, true));
      // 0.x 插入符锁定坑：0 阶段小版本可能含破坏性变更，与多数人「^0.x 即 <1.0.0」直觉相反
      if (v.major === 0 && v.minor === 0) {
        pitfalls.push({ type: 'zero-zero-caret', message: `「${rawAtom}」的插入符只允许 0.0.z 补丁级变化（上限 <0.${0}.${v.patch + 1}），不是 <1.0.0` });
      } else if (v.major === 0) {
        pitfalls.push({ type: 'zero-major-caret', message: `「${rawAtom}」的插入符锁定次版本：只允许补丁级变化（上限 <0.${v.minor + 1}.0），不是 <1.0.0——0.x 阶段小版本可能包含破坏性变更` });
      }
    }
    return;
  }
  out.push(mk(op === '' ? '=' : op, v.major, v.minor, v.patch, v.prerelease, `${op === '' ? '' : op}${v.raw}`));
}

/** 部分版本（缺 minor 或 patch）+ op → 展开比较器（跳段语义） */
function applyPartial(op, M, m, p, pre, out, pitfalls, rawAtom) {
  const hasMinor = m !== null;
  switch (op) {
    case '=':
    case '':
      // =1.2 不是精确等于：是 1.2.x 整段（高频坑）
      if (hasMinor) {
        out.push(mk('>=', M, m, 0, null, `>=${M}.${m}.0`));
        out.push(mk('<', M, m + 1, 0, ['0'], `<${M}.${m + 1}.0-0`, true));
        pitfalls.push({ type: 'eq-partial', message: `「${rawAtom}」不是精确等于 ${M}.${m}.0，而是整个 ${M}.${m}.x 段（>=${M}.${m}.0 且 <${M}.${m + 1}.0）` });
      } else {
        out.push(mk('>=', M, 0, 0, null, `>=${M}.0.0`));
        out.push(mk('<', M + 1, 0, 0, ['0'], `<${M + 1}.0.0-0`, true));
        pitfalls.push({ type: 'eq-partial', message: `「${rawAtom}」不是精确等于 ${M}.0.0，而是整个 ${M}.x 段（>=${M}.0.0 且 <${M + 1}.0.0）` });
      }
      return;
    case '>':
      // >1.2 → >=1.3.0（跳过整个 1.2.x）；>1 → >=2.0.0
      if (hasMinor) {
        out.push(mk('>=', M, m + 1, 0, null, `>=${M}.${m + 1}.0`));
        pitfalls.push({ type: 'gt-partial', message: `「> ${M}.${m}」按 npm 语义跳过整个 ${M}.${m}.x 段，等价于 >=${M}.${m + 1}.0` });
      } else {
        out.push(mk('>=', M + 1, 0, 0, null, `>=${M + 1}.0.0`));
        pitfalls.push({ type: 'gt-partial', message: `「> ${M}」跳过整个 ${M}.x.x 段，等价于 >=${M + 1}.0.0` });
      }
      return;
    case '>=':
      if (hasMinor) out.push(mk('>=', M, m, 0, null, `>=${M}.${m}.0`));
      else out.push(mk('>=', M, 0, 0, null, `>=${M}.0.0`));
      return;
    case '<':
      if (hasMinor) out.push(mk('<', M, m, 0, ['0'], `<${M}.${m}.0-0`, true));
      else out.push(mk('<', M, 0, 0, ['0'], `<${M}.0.0-0`, true));
      return;
    case '<=':
      // <=1.2 含 1.2.x 全部 → <1.3.0
      if (hasMinor) out.push(mk('<', M, m + 1, 0, ['0'], `<${M}.${m + 1}.0-0`, true));
      else out.push(mk('<', M + 1, 0, 0, ['0'], `<${M + 1}.0.0-0`, true));
      return;
    case '~': {
      // ~1.2.3 / ~1.2 → <1.3.0；~1 → <2.0.0
      const upMinor = hasMinor ? m + 1 : 0;
      const upMajor = hasMinor ? M : M + 1;
      out.push(mk('>=', M, hasMinor ? m : 0, 0, null, `>=${M}.${hasMinor ? m : 0}.0`));
      out.push(mk('<', upMajor, upMinor, 0, ['0'], `<${upMajor}.${upMinor}.0-0`, true));
      return;
    }
    case '^': {
      // 插入符缺省位：^1.2 → <2.0.0；^0.0 → <0.1.0；^0 → <1.0.0
      let hi;
      if (M > 0) hi = { M: M + 1, m: 0, p: 0 };
      else if (!hasMinor) hi = { M: 1, m: 0, p: 0 };
      else if (m > 0) hi = { M: 0, m: m + 1, p: 0 };
      else hi = { M: 0, m: 1, p: 0 }; // ^0.0 / ^0.0.x
      out.push(mk('>=', M, hasMinor ? m : 0, 0, null, `>=${M}.${hasMinor ? m : 0}.0`));
      out.push(mk('<', hi.M, hi.m, hi.p, ['0'], `<${hi.M}.${hi.m}.${hi.p}-0`, true));
      if (M === 0) {
        if (hasMinor && m === 0) {
          pitfalls.push({ type: 'zero-zero-caret', message: `「^0.0.x」的插入符只允许 0.0.z 的补丁级变化（上限 <0.1.0），不是 <1.0.0` });
        } else if (hasMinor) {
          pitfalls.push({ type: 'zero-major-caret', message: `「^0.${m}.x」的插入符锁定次版本：只允许补丁级变化（上限 <0.${m + 1}.0），不是 <1.0.0——0.x 阶段小版本可能包含破坏性变更` });
        } else {
          pitfalls.push({ type: 'zero-major-caret', message: `「^0.x」的插入符上限是 <1.0.0（0 阶段允许全部 0.y.z），这是插入符在 0 段的唯一宽形态` });
        }
      }
      return;
    }
    default:
      throw new Error(`未知操作符「${op}」`);
  }
}

/** 解析一个交集组（无 '||'）→ { raw, comparators, any } */
function parseSet(text, rangeRaw) {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '*' || trimmed === 'x' || trimmed === 'X') {
    return { raw: rangeRaw, comparators: [], any: true };
  }
  const comparators = [];
  const pitfalls = [];
  // 连字符区间：空格包围的 ' - '（node-semver HYPHENRANGE）
  const hyphen = /(^|\s)([^\s]+)\s+-\s+([^\s]+)(\s|$)/.exec(trimmed);
  if (hyphen) {
    const loText = hyphen[2];
    const hiText = hyphen[3];
    const rest = (trimmed.slice(0, hyphen.index) + ' ' + trimmed.slice(hyphen.index + hyphen[0].length)).replace(/\s+/g, ' ').trim();
    if (rest !== '') throw new Error(`连字符区间「${loText} - ${hiText}」必须是该交集组的唯一内容（其余比较器请用空格 AND 分开或分组）`);
    expandHyphen(loText, hiText, comparators, pitfalls);
    return { raw: rangeRaw, comparators, any: false, pitfalls };
  }
  // 常规：按空白切原子；操作符与版本间允许空格（>= 1.2.3）→ 先归一
  const norm = trimmed.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1');
  const atoms = norm.split(/\s+/);
  for (const atom of atoms) {
    const am = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(atom);
    if (!am || am[2] === '') throw new Error(`无法解析比较器「${atom}」`);
    expandAtom(am[1] || '', am[2], comparators, pitfalls, atom);
  }
  return { raw: rangeRaw, comparators, any: false, pitfalls };
}

/** 连字符区间展开（两端独立做部分版本语义） */
function expandHyphen(loText, hiText, out, pitfalls) {
  const lo = PARTIAL_RE.exec(loText);
  const hi = PARTIAL_RE.exec(hiText);
  if (!lo) throw new Error(`区间下界「${loText}」无法解析`);
  if (!hi) throw new Error(`区间上界「${hiText}」无法解析`);
  if (isX(lo[1])) throw new Error(`区间下界「${loText}」不能是通配`);
  // 下界：已知位补 0
  const loM = Number(lo[1]);
  if (isX(lo[2])) out.push(mk('>=', loM, 0, 0, null, `>=${loM}.0.0`));
  else if (isX(lo[3])) out.push(mk('>=', loM, Number(lo[2]), 0, null, `>=${loM}.${Number(lo[2])}.0`));
  else {
    const pre = lo[4] ? lo[4].split('.') : [];
    out.push(mk('>=', loM, Number(lo[2]), Number(lo[3]), pre, `>=${loM}.${Number(lo[2])}.${Number(lo[3])}${lo[4] ? '-' + lo[4] : ''}`));
  }
  // 上界：部分版本取整段上界
  if (isX(hi[1])) {
    pitfalls.push({ type: 'wildcard-hyphen-hi', message: `区间上界「${hiText}」是通配，视同无上界` });
    return;
  }
  const hiM = Number(hi[1]);
  if (isX(hi[2])) out.push(mk('<', hiM + 1, 0, 0, ['0'], `<${hiM + 1}.0.0-0`, true));
  else if (isX(hi[3])) out.push(mk('<', hiM, Number(hi[2]) + 1, 0, ['0'], `<${hiM}.${Number(hi[2]) + 1}.0-0`, true));
  else out.push(mk('<=', hiM, Number(hi[2]), Number(hi[3]), hi[4] ? hi[4].split('.') : [], `<=${hiM}.${Number(hi[2])}.${Number(hi[3])}${hi[4] ? '-' + hi[4] : ''}`));
}

/**
 * parseRange(text) →
 *   ok: { ok:true, raw, sets:[{raw, comparators, any, pitfalls}], pitfalls }
 *   fail: { ok:false, error, raw }
 */
function parseRange(text) {
  const raw = String(text == null ? '' : text).trim();
  const sets = [];
  const parts = raw.split('||');
  for (const part of parts) {
    try {
      sets.push(parseSet(part, part.trim()));
    } catch (e) {
      return { ok: false, error: e.message, raw };
    }
  }
  const pitfalls = [];
  for (const s of sets) for (const p of s.pitfalls || []) pitfalls.push(p);
  // 空交集组检测（区间数学）：lo 上界收 max、hi 下界收 min
  for (const s of sets) {
    if (s.any || s.comparators.length === 0) continue;
    if (isEmptySet(s.comparators)) {
      pitfalls.push({ type: 'empty-set', message: `交集组「${s.raw}」为空（下界不低于上界），该组永远不会匹配任何版本` });
    }
  }
  // 预发布门控全局提示：整份范围没有任何「用户显式书写」的预发布比较器
  //（synthetic 标记排除展开产物 <M+1.0.0-0 这类哨兵上界——它们不是用户意图）
  const anyPre = sets.some((s) => (s.comparators || []).some((c) => !c.synthetic && c.version.prerelease && c.version.prerelease.length > 0));
  if (!anyPre) {
    pitfalls.push({ type: 'prerelease-gate', message: '该范围没有显式包含预发布（如 1.2.3-beta.2）的比较器：一切带预发布后缀的版本（beta/rc/next）都不会被匹配，即使版本号落在区间内——这是「为什么装不上 beta」的最高频根因（npm 默认行为）' });
  }
  return { ok: true, raw, sets, pitfalls };
}

/** 交集是否为空（保守区间数学；边界 -0 形态按开区间处理） */
function isEmptySet(comparators) {
  let lo = null; // { v, exclusive }
  let hi = null;
  for (const c of comparators) {
    const vv = c.version;
    if (c.op === '=' || c.op === '') {
      // 精确点必须落在现有区间内
      if (lo && (compareParsed(vv, lo.v) < 0 || (compareParsed(vv, lo.v) === 0 && lo.exclusive))) return true;
      if (hi && (compareParsed(vv, hi.v) > 0 || (compareParsed(vv, hi.v) === 0 && hi.exclusive))) return true;
      lo = { v: vv, exclusive: false };
      hi = { v: vv, exclusive: false };
      continue;
    }
    if (c.op === '>=' || c.op === '>') {
      const d = lo ? compareParsed(vv, lo.v) : 1;
      if (d > 0 || (d === 0 && c.op === '>' && !lo.exclusive)) lo = { v: vv, exclusive: c.op === '>' };
    } else if (c.op === '<=' || c.op === '<') {
      const d = hi ? compareParsed(vv, hi.v) : -1;
      if (d < 0 || (d === 0 && c.op === '<' && !hi.exclusive)) hi = { v: vv, exclusive: c.op === '<' };
    }
  }
  if (!lo || !hi) return false;
  const d = compareParsed(lo.v, hi.v);
  if (d > 0) return true;
  if (d === 0 && (lo.exclusive || hi.exclusive)) return true;
  return false;
}

/**
 * satisfiesRange(vParsed, rangeParsed) →
 *   { match, viaSet, rejectedBy, gateBlocked }
 * viaSet/rejectedBy/gateBlocked 为命中的交集组 / 首个拒绝比较器 / 被门控拦下的组
 */
function satisfiesRange(v, range) {
  let rejectedBy = null;
  let gateBlocked = null;
  for (const s of range.sets) {
    let ok = true;
    for (const c of s.comparators) {
      if (!cmpOk(v, c)) { ok = false; rejectedBy = { set: s.raw, comparator: c.raw, line: null }; break; }
    }
    if (!ok) continue;
    // 预发布门控：候选带预发布时，组内须存在同 M.m.p 且带预发布的比较器
    if (v.prerelease.length > 0) {
      const allows = s.comparators.some((c) => c.version.prerelease.length > 0 && c.version.major === v.major && c.version.minor === v.minor && c.version.patch === v.patch);
      if (!allows) { gateBlocked = { set: s.raw }; continue; }
    }
    return { match: true, viaSet: s.raw, rejectedBy: null, gateBlocked: null };
  }
  return { match: false, viaSet: null, rejectedBy, gateBlocked };
}

/**
 * explainRange(rangeParsed) → 双端共用的解释结构
 * { sets: [{ raw, any, comparators: [{ raw, op, version, text }], empty }], pitfalls }
 */
function explainRange(range) {
  const sets = range.sets.map((s) => ({
    raw: s.raw,
    any: !!s.any,
    comparators: (s.comparators || []).map((c) => ({
      raw: c.raw,
      op: c.op,
      version: c.version.raw,
      text: describeComparator(c),
    })),
    empty: !s.any && s.comparators.length > 0 && isEmptySet(s.comparators),
  }));
  return { sets, pitfalls: range.pitfalls };
}

function describeComparator(c) {
  const v = c.version.raw;
  const isCeil = c.version.prerelease.length === 1 && c.version.prerelease[0] === '0' && c.op === '<';
  switch (c.op) {
    case '>=': return `大于等于 ${v}`;
    case '>': return `大于 ${v}`;
    case '<=': return `小于等于 ${v}`;
    case '<': return isCeil ? `小于 ${v}（精确上界：排除 ${v.major}.${v.minor}.${v.patch} 及其一切预发布）` : `小于 ${v}`;
    case '=': return `等于 ${v}`;
    default: return v;
  }
}

/** 排序：versions → { sorted:[{raw, parsed, index}], invalid:[{raw, error}] }（稳定排序，保留原序号） */
function sortVersions(list) {
  const items = [];
  const invalid = [];
  (Array.isArray(list) ? list : []).forEach((s, i) => {
    const r = parseVersion(s);
    if (r.ok) items.push({ raw: r.version.raw, input: String(s).trim(), parsed: r.version, index: i });
    else invalid.push({ raw: String(s), error: r.error });
  });
  const sorted = items.slice().sort((a, b) => {
    const d = compareParsed(a.parsed, b.parsed);
    return d !== 0 ? d : a.index - b.index; // 相等版本保持原相对顺序
  });
  return { sorted, invalid };
}

/**
 * buildCheckRows(rangeInput, versionList) —— 逐版本判定 + 中文原因（MCP 与面板共用的单一权威）
 * → { ok:false, error } | { ok:true, rows, pitfalls }
 * row: { input, valid:true, version, match, kind: 'match'|'gate'|'reject', reason } | { input, valid:false, error }
 */
function buildCheckRows(rangeInput, versionList) {
  const parsed = parseRange(rangeInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const rows = [];
  for (const v of Array.isArray(versionList) ? versionList : []) {
    const vp = parseVersion(String(v).trim());
    if (!vp.ok) { rows.push({ input: String(v), valid: false, error: vp.error }); continue; }
    const r = satisfiesRange(vp.version, parsed);
    let kind;
    let reason;
    if (r.match) {
      kind = 'match';
      reason = `放行交集组：${r.viaSet}`;
      if (vp.version.prerelease.length > 0) reason += '；范围含同号预发布比较器，未被门控拦截';
    } else if (r.gateBlocked) {
      kind = 'gate';
      reason = '版本号落在区间内，但被预发布门控拦截：范围未显式包含同 M.m.p 的预发布比较器（如 >=1.2.3-beta）';
    } else if (r.rejectedBy) {
      kind = 'reject';
      reason = `首个拒绝比较器：${r.rejectedBy.comparator}（交集组 ${r.rejectedBy.set}）`;
      // 预发布低于同号正式版（semver 规则）容易被误读为「1.2.3-beta.4 应该 >= 1.2.3」，单独点明
      if (vp.version.prerelease.length > 0 && (r.rejectedBy.comparator.startsWith('>=') || r.rejectedBy.comparator.startsWith('>'))) {
        reason += '；预发布版本低于同号正式版（1.2.3-beta.4 < 1.2.3）';
      }
    } else {
      kind = 'reject';
      reason = '不匹配';
    }
    rows.push({ input: String(v), valid: true, version: vp.version, match: r.match, kind, reason });
  }
  return { ok: true, rows, pitfalls: parsed.pitfalls };
}

module.exports = {
  parseVersion,
  compareParsed,
  parseRange,
  satisfiesRange,
  explainRange,
  sortVersions,
  buildCheckRows,
  cmpOk,
};
