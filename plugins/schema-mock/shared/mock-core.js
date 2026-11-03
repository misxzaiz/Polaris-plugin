'use strict';
/**
 * mock-core.js —— Mock 数据生成器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 生成语义（Draft-07 高频子集反向生成，与 schema-check 036 约束语义镜像）：
 *   - 支持：type（含数组形态）/ required / properties / items / enum / const /
 *     minimum & maximum（含 exclusive）/ minLength & maxLength / pattern（有限
 *     重试自检，不保证）/ minItems & maxItems / uniqueItems / additionalProperties /
 *     multipleOf / oneOf / anyOf / allOf（全分支合并生成）/ not（从假数据池取不匹配值）
 *   - 不支持：$ref（遇即如实报错）；if/then/else 等 2019-12+ 关键字
 *   - 不变式：生成物必须能过 schema-check 校验——闭环断言即生成器正确性定义
 *   - 确定性：mulberry32 PRNG（seed 相同→序列相同，测试与复现友好）
 */

const MOCK_STRINGS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'kappa', 'sigma', 'zeta'];
const MOCK_WORDS = ['core', 'edge', 'node', 'mesh', 'flow', 'spark', 'drift', 'orbit'];

/** mulberry32 确定性 PRNG：seed → () => [0,1) 浮点 */
function makeRng(seed) {
  let a = (Number.isFinite(Number(seed)) && Number(seed) > 0 ? Number(seed) : 0x2f6e2b1) >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class MockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MockError';
  }
}

/**
 * 按 schema 生成一个假数据实例（纯函数）。
 * @param {object} schema JSON Schema（Draft-07 高频子集）
 * @param {object} [opts] { seed?: number, depth?: number（内部递归） }
 * @returns {unknown} 假数据
 * @throws MockError $ref / 重试上限内无法满足 pattern 等不可生成场景（如实报错不假绿）
 */
function generate(schema, opts = {}) {
  const rng = makeRng(opts.seed);
  const ctx = { rng, depth: 0, maxDepth: 8 };
  return gen(schema, ctx);
}

function gen(schema, ctx) {
  if (ctx.depth > ctx.maxDepth) throw new MockError(`嵌套深度超过 ${ctx.maxDepth}（schema 嵌套过深或存在自引用形态）`);
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new MockError('schema 本身必须是对象');
  }
  if ('$ref' in schema) throw new MockError('本实现不支持 $ref（边界见工具描述），请内联展开 schema');
  ctx.depth++;
  try {
    // const/enum 优先
    if (schema.const !== undefined) return schema.const;
    if (Array.isArray(schema.enum) && schema.enum.length) {
      return schema.enum[Math.floor(ctx.rng() * schema.enum.length)];
    }
    // 组合关键字：allOf 逐层合成（浅合并顶层约束再生成——不深拷贝，够用即可）
    if (Array.isArray(schema.allOf) && schema.allOf.length) {
      const merged = { ...schema };
      delete merged.allOf;
      for (const sub of schema.allOf) {
        Object.assign(merged, sub, { properties: { ...(merged.properties || {}), ...(sub.properties || {}) } });
      }
      return gen(merged, ctx);
    }
    if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
      return gen(schema.anyOf[Math.floor(ctx.rng() * schema.anyOf.length)], ctx);
    }
    if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
      return gen(schema.oneOf[Math.floor(ctx.rng() * schema.oneOf.length)], ctx);
    }
    if (schema.not) {
      // not：从样本池取一个不匹配 not 分支的值（有限尝试）
      for (let i = 0; i < 10; i++) {
        const cand = gen({ type: ['string', 'integer', 'boolean'][i % 3] }, ctx);
        try {
          const { validate } = lazySchemaCheck();
          if (!validate(cand, schema.not).valid) return cand;
        } catch (_) { /* schema-check 不可用（独立部署）→ 取异型值兜底 */ }
        return cand;
      }
      throw new MockError('not 分支生成失败（10 次尝试均被排除）');
    }
    // type（数组形态随机选一）
    let type = schema.type;
    if (Array.isArray(type)) type = type[Math.floor(ctx.rng() * type.length)];
    if (!type) type = schema.properties ? 'object' : schema.items ? 'array' : pickDefaultType(ctx);
    switch (type) {
      case 'string': return genString(schema, ctx);
      case 'integer': return genNumber(schema, ctx, true);
      case 'number': return genNumber(schema, ctx, false);
      case 'boolean': return ctx.rng() < 0.5;
      case 'null': return null;
      case 'array': return genArray(schema, ctx);
      case 'object': return genObject(schema, ctx);
      default: throw new MockError(`不支持的 type: ${type}`);
    }
  } finally {
    ctx.depth--;
  }
}

function pickDefaultType(ctx) {
  return ['string', 'integer', 'boolean'][Math.floor(ctx.rng() * 3)];
}

/** 字符串生成：长度约束 + pattern 有限重试自检（不保证满足 pattern——如实降级） */
function genString(schema, ctx) {
  const min = Number.isFinite(schema.minLength) ? schema.minLength : 1;
  const maxRaw = Number.isFinite(schema.maxLength) ? schema.maxLength : Infinity;
  // 矛盾约束如实报错：min > max 时任何值都不可能同时满足——静默"抬上限"会生成
  // 只满足 minLength 的值被校验器拒绝 = 假绿（闭环自检会抓，但错误应前移到根因）
  if (maxRaw < min) throw new MockError(`长度约束矛盾：minLength=${min} > maxLength=${maxRaw}，任何值都不可能满足`);
  const max = maxRaw === Infinity ? Math.max(min, 8) : maxRaw;
  const pool = MOCK_STRINGS.concat(MOCK_WORDS);
  const base = () => pool[Math.floor(ctx.rng() * pool.length)] + '-' + Math.floor(ctx.rng() * 10000);
  let s = base();
  let guard = 0;
  while (s.length < min && guard++ < 50) s += '-' + base();
  if (s.length > max) s = s.slice(0, max);
  if (s.length < min) throw new MockError(`minLength=${min} 超出字符串可生成范围`);
  // pattern：有限重试自检（正向正则生成不实现——不匹配时如实报错，不静默交付假绿）
  if (schema.pattern) {
    let re;
    try { re = new RegExp(schema.pattern); } catch (e) { throw new MockError(`pattern 非法正则：${schema.pattern}`); }
    // 启发式：从 pattern 源提取字面词（≥2 连续字母，剥除字符类/量词的干扰）作候选种子——
    // 字面前缀类 pattern（^mock、^cmd- 等）从此可满足；纯元语法 pattern 仍靠随机+重试
    const literals = String(schema.pattern).replace(/\[[^\]]*\]/g, '').match(/[a-zA-Z][a-zA-Z]+/g) || [];
    const seedWord = literals.find((w) => w.length >= 2);
    guard = 0;
    while (!re.test(s) && guard++ < 20) {
      const candidate = seedWord ? seedWord + '-' + Math.floor(ctx.rng() * 10000) : base();
      s = candidate.slice(0, max);
    }
    if (!re.test(s)) {
      throw new MockError(`pattern ${schema.pattern} 有限重试（20 次）内无法随机满足——正向正则生成不在支持范围，请改用无 pattern schema 或提供 const/enum`);
    }
  }
  if (schema.format === 'uuid') return '3f2b1a4c-8d9e-4f0a-b1c2-d3e4f5a6b7c8'.slice(0, 36);
  if (schema.format === 'date') return '2026-11-04';
  if (schema.format === 'date-time') return '2026-11-04T10:30:00Z';
  if (schema.format === 'email') return 'mock-user@example.com';
  return s;
}

/** 数值生成：范围 + multipleOf + exclusive + integer 化 */
function genNumber(schema, ctx, integer) {
  let min = schema.minimum !== undefined ? schema.minimum : (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + (integer ? 1 : 0.1) : 0);
  let max = schema.maximum !== undefined ? schema.maximum : (schema.exclusiveMaximum !== undefined ? schema.exclusiveMaximum - (integer ? 1 : 0.1) : min + 100);
  if (min > max) {
    // 范围过窄（如 minimum=maximum）：取该值本身
    if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum === schema.maximum) return schema.minimum;
    throw new MockError(`数值范围非法：min=${min} > max=${max}`);
  }
  const span = max - min;
  let v = min + ctx.rng() * span;
  if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
    const m = schema.multipleOf;
    const kMin = Math.ceil(min / m);
    const kMax = Math.floor(max / m);
    if (kMin > kMax) throw new MockError(`范围 [${min}, ${max}] 内不存在 ${m} 的倍数`);
    v = (kMin + Math.floor(ctx.rng() * (kMax - kMin + 1))) * m;
  }
  if (integer) v = Math.round(v);
  return v;
}

/** 数组生成：minItems~maxItems 随机 + items 逐个 + uniqueItems 有限重试 */
function genArray(schema, ctx) {
  const min = Number.isFinite(schema.minItems) ? schema.minItems : 1;
  const max = Number.isFinite(schema.maxItems) ? Math.max(schema.maxItems, min) : Math.max(min, 3);
  const count = min + Math.floor(ctx.rng() * (max - min + 1));
  const items = [];
  for (let i = 0; i < count; i++) {
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      items.push(gen(schema.items, ctx));
    } else {
      items.push(pickDefaultType(ctx) === 'string' ? genString({}, ctx) : genNumber({}, ctx, false));
    }
  }
  if (schema.uniqueItems === true) {
    const seen = new Set();
    let guard = 0;
    for (let i = 0; i < items.length && guard++ < 100; i++) {
      let s = JSON.stringify(items[i]);
      while (seen.has(s) && guard++ < 100) {
        items[i] = gen(schema.items && typeof schema.items === 'object' ? schema.items : {}, ctx);
        s = JSON.stringify(items[i]);
      }
      seen.add(s);
    }
    if (new Set(items.map((x) => JSON.stringify(x))).size !== items.length) {
      throw new MockError('uniqueItems=true 时有限尝试内无法生成互异数组（items 值空间过小）');
    }
  }
  return items;
}

/** 对象生成：required 必生成 + properties + additionalProperties=false 不加多余键 */
function genObject(schema, ctx) {
  const out = {};
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (key in props) out[key] = gen(props[key], ctx);
    else out[key] = genString({}, ctx); // required 但无 property 定义 → 占位字符串
  }
  // 非必填属性随机生成一半（假数据要有多样性但不臃肿）
  for (const [key, sub] of Object.entries(props)) {
    if (key in out) continue;
    if (ctx.rng() < 0.5) out[key] = gen(sub, ctx);
  }
  // additionalProperties 为 schema：加一个额外键演示形态（false 时绝不加）
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    if (ctx.rng() < 0.3) out['extra_field'] = gen(schema.additionalProperties, ctx);
  }
  return out;
}

/** 懒加载 schema-check（同仓相邻插件；独立部署时优雅降级） */
let schemaCheckModule = null;
function lazySchemaCheck() {
  if (schemaCheckModule) return schemaCheckModule;
  try {
    // 相对 require 同仓相邻插件的 shared core（json-repair → schema-check 先例）
    schemaCheckModule = require('../../schema-check/shared/schema-core.js');
  } catch (_) {
    schemaCheckModule = null;
  }
  return schemaCheckModule;
}

/**
 * 批量生成 + 闭环自检（生成物过 schema-check，不过=生成器 bug 如实抛出）。
 * @param {object} schema
 * @param {object} [opts] { seed?: number, count?: number }
 * @returns {Array<unknown>} count 个假数据（各用 seed+i 保证多样且整体可复现）
 */
function generateBatch(schema, opts = {}) {
  const count = Math.max(1, Math.min(50, Number.isFinite(Number(opts.count)) ? Number(opts.count) : 3));
  const seed = opts.seed;
  const out = [];
  for (let i = 0; i < count; i++) {
    const item = generate(schema, { seed: seed !== undefined ? Number(seed) + i * 7919 : undefined });
    const sc = lazySchemaCheck();
    if (sc) {
      const v = sc.validate(item, schema);
      if (!v.valid) {
        throw new MockError(`闭环自检失败（生成器 bug，如实报错）：第 ${i + 1} 组未通过 schema 校验：${JSON.stringify(v.errors.slice(0, 3))}`);
      }
    }
    out.push(item);
  }
  return out;
}

module.exports = { generate, generateBatch, makeRng, MockError };
