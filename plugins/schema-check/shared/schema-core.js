'use strict';
/**
 * schema-core.js —— JSON Schema 校验器共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 覆盖面（Draft-07 高频子集，如实声明）：
 *   支持：type（含数组形态）/ required / properties / items / enum / const /
 *         minimum & maximum（含 exclusive）/ minLength & maxLength / pattern /
 *         minItems & maxItems / uniqueItems / additionalProperties /
 *         multipleOf / oneOf / anyOf / allOf / not /
 *         format（date-time / date / time / email / uri / uuid / ipv4 / ipv6 / hostname）
 *   不支持：$ref / $defs（遇 $ref 如实报错，不静默跳过——静默=假绿）；
 *           if/then/else、dependentRequired、unevaluatedProperties 等 2019-12+ 关键字
 *
 * 错误定位：JSON Pointer（RFC 6901，/a/b/0 形态）。错误不短路——一次报全。
 */

const SUPPORTED_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

const FORMATS = {
  'date-time': /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[a-z][a-z0-9+.-]*:\S+/i,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
  ipv6: /^[0-9a-f:]{2,45}$/i,
  hostname: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
};

/** JSON 类型判定（array→array；null→null；integer 是 number 子类型） */
function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return t; // string / boolean / object / undefined(不存在)
}

/** jsonType(v) 是否满足 schema.type 声明（integer 接受整数 number） */
function typeMatch(v, expected) {
  const actual = jsonType(v);
  if (Array.isArray(expected)) return expected.some((e) => typeMatch(v, e));
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

/**
 * 校验数据（纯函数，单测覆盖）。错误不短路，一次报全。
 * @param {unknown} data 待校验数据
 * @param {object} schema JSON Schema（Draft-07 子集）
 * @param {string} [pointer] 递归内部用：当前 JSON Pointer
 * @returns {{ valid: boolean, errors: Array<{ pointer: string, keyword: string, message: string }> }}
 */
function validate(data, schema, pointer = '') {
  const errors = [];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, errors: [{ pointer, keyword: 'schema', message: 'schema 本身必须是对象' }] };
  }
  // $ref 明确不支持——静默跳过会假绿，必须如实报错
  if ('$ref' in schema) {
    errors.push({ pointer, keyword: '$ref', message: '本实现不支持 $ref 引用（边界见工具描述），请将 schema 内联展开后再校验' });
    return { valid: errors.length === 0, errors };
  }
  const push = (keyword, message) => errors.push({ pointer: pointer || '/', keyword, message });

  // type
  if (schema.type !== undefined) {
    if (!typeMatch(data, schema.type)) {
      push('type', `类型应为 ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}，实际 ${jsonType(data)}`);
    }
  }
  // const / enum
  if (schema.const !== undefined && JSON.stringify(data) !== JSON.stringify(schema.const)) {
    push('const', `应为常量 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(data).slice(0, 60)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(data))) {
    push('enum', `不在枚举 ${JSON.stringify(schema.enum).slice(0, 120)} 内，实际 ${JSON.stringify(data).slice(0, 60)}`);
  }
  // 组合关键字：oneOf / anyOf / allOf / not
  if (Array.isArray(schema.allOf)) {
    for (let i = 0; i < schema.allOf.length; i++) {
      for (const e of validate(data, schema.allOf[i], pointer).errors) errors.push(e);
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const attempts = schema.anyOf.map((sub) => validate(data, sub, pointer));
    if (!attempts.some((a) => a.valid)) {
      push('anyOf', `不满足 anyOf 任一分支（${attempts.length} 个分支全部失败）`);
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const okCount = schema.oneOf.filter((sub) => validate(data, sub, pointer).valid).length;
    if (okCount !== 1) push('oneOf', `应恰好匹配 oneOf 一个分支，实际匹配 ${okCount} 个`);
  }
  if (schema.not) {
    if (validate(data, schema.not, pointer).valid) push('not', '不应匹配 not 分支，但匹配了');
  }

  // string 约束
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) push('minLength', `长度 ${data.length} < 最小 ${schema.minLength}`);
    if (schema.maxLength !== undefined && data.length > schema.maxLength) push('maxLength', `长度 ${data.length} > 最大 ${schema.maxLength}`);
    if (schema.pattern !== undefined) {
      try { if (!(new RegExp(schema.pattern).test(data))) push('pattern', `不匹配 pattern ${schema.pattern}`); }
      catch (_) { push('pattern', `pattern 非法正则：${schema.pattern}`); }
    }
    if (schema.format && FORMATS[schema.format]) {
      if (!FORMATS[schema.format].test(data)) push('format', `不符合 ${schema.format} 格式：${data.slice(0, 60)}`);
    }
  }
  // number 约束
  if (jsonType(data) === 'number' || jsonType(data) === 'integer') {
    if (schema.minimum !== undefined && data < schema.minimum) push('minimum', `${data} < 最小值 ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) push('maximum', `${data} > 最大值 ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) push('exclusiveMinimum', `${data} ≤ 排他下界 ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) push('exclusiveMaximum', `${data} ≥ 排他上界 ${schema.exclusiveMaximum}`);
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      const q = data / schema.multipleOf;
      if (Math.abs(q - Math.round(q)) > 1e-9) push('multipleOf', `${data} 不是 ${schema.multipleOf} 的整数倍`);
    }
  }
  // array 约束
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) push('minItems', `元素数 ${data.length} < 最小 ${schema.minItems}`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) push('maxItems', `元素数 ${data.length} > 最大 ${schema.maxItems}`);
    if (schema.uniqueItems === true) {
      const seen = new Set(data.map((x) => JSON.stringify(x)));
      if (seen.size !== data.length) push('uniqueItems', '存在重复元素');
    }
    if (schema.items !== undefined && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      data.forEach((item, i) => {
        for (const e of validate(item, schema.items, `${pointer}/${i}`).errors) errors.push(e);
      });
    }
  }
  // object 约束
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in data)) push('required', `缺少必填属性 "${key}"`);
    }
    for (const key of Object.keys(data)) {
      if (key in props) {
        for (const e of validate(data[key], props[key], `${pointer}/${escapePointer(key)}`).errors) errors.push(e);
      } else {
        // additionalProperties：false 拒绝 / schema 校验 / 缺省放行
        const ap = schema.additionalProperties;
        if (ap === false) {
          push('additionalProperties', `多余属性 "${key}"（additionalProperties=false）`);
        } else if (ap && typeof ap === 'object') {
          for (const e of validate(data[key], ap, `${pointer}/${escapePointer(key)}`).errors) errors.push(e);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** JSON Pointer 转义（RFC 6901：~ → ~0，/ → ~1） */
function escapePointer(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * schema 结构摘要（供 explain 工具：帮 AI/用户理解 schema 要什么）。
 * @returns {string} 多行摘要
 */
function explainSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return 'schema 本身必须是对象';
  }
  const lines = [];
  walk(schema, '', 0);
  return lines.join('\n');

  function walk(node, path, depth) {
    if (depth > 6 || !node || typeof node !== 'object' || Array.isArray(node)) return;
    const label = path || '(root)';
    const type = Array.isArray(node.type) ? node.type.join('|') : node.type || (node.properties ? 'object' : node.items ? 'array' : '未声明');
    const bits = [`类型 ${type}`];
    if (Array.isArray(node.required) && node.required.length) bits.push(`必填 [${node.required.join(', ')}]`);
    if (node.enum) bits.push(`枚举 ${JSON.stringify(node.enum).slice(0, 80)}`);
    if (node.const !== undefined) bits.push(`常量 ${JSON.stringify(node.const).slice(0, 60)}`);
    if (node.minimum !== undefined || node.maximum !== undefined) bits.push(`范围 ${node.minimum ?? '-∞'} ~ ${node.maximum ?? '+∞'}`);
    if (node.minLength !== undefined || node.maxLength !== undefined) bits.push(`长度 ${node.minLength ?? 0} ~ ${node.maxLength ?? '∞'}`);
    if (node.pattern) bits.push(`pattern ${node.pattern}`);
    if (node.format) bits.push(`format ${node.format}`);
    if (node.description) bits.push(String(node.description).slice(0, 80));
    lines.push(`${'  '.repeat(depth)}${label}: ${bits.join(' · ')}`);
    if (node.properties) {
      for (const [k, sub] of Object.entries(node.properties)) {
        walk(sub, path ? `${path}/${k}` : `/${k}`, depth + 1);
      }
    }
    if (node.items && typeof node.items === 'object' && !Array.isArray(node.items)) {
      walk(node.items, path ? `${path}[]` : '[]', depth + 1);
    }
  }
}

module.exports = { validate, explainSchema, escapePointer, jsonType, typeMatch, FORMATS, SUPPORTED_TYPES };
