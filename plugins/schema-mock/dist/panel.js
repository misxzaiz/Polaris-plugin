var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../schema-check/shared/schema-core.js
var require_schema_core = __commonJS({
  "../schema-check/shared/schema-core.js"(exports, module) {
    "use strict";
    var SUPPORTED_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
    var FORMATS = {
      "date-time": /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/,
      date: /^\d{4}-\d{2}-\d{2}$/,
      time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?$/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      uri: /^[a-z][a-z0-9+.-]*:\S+/i,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
      ipv6: /^[0-9a-f:]{2,45}$/i,
      hostname: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i
    };
    function jsonType(v) {
      if (v === null) return "null";
      if (Array.isArray(v)) return "array";
      const t = typeof v;
      if (t === "number") return Number.isInteger(v) ? "integer" : "number";
      return t;
    }
    function typeMatch(v, expected) {
      const actual = jsonType(v);
      if (Array.isArray(expected)) return expected.some((e) => typeMatch(v, e));
      if (expected === "number") return actual === "number" || actual === "integer";
      if (expected === "integer") return actual === "integer";
      return actual === expected;
    }
    function validate(data, schema, pointer = "") {
      const errors = [];
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return { valid: false, errors: [{ pointer, keyword: "schema", message: "schema \u672C\u8EAB\u5FC5\u987B\u662F\u5BF9\u8C61" }] };
      }
      if ("$ref" in schema) {
        errors.push({ pointer, keyword: "$ref", message: "\u672C\u5B9E\u73B0\u4E0D\u652F\u6301 $ref \u5F15\u7528\uFF08\u8FB9\u754C\u89C1\u5DE5\u5177\u63CF\u8FF0\uFF09\uFF0C\u8BF7\u5C06 schema \u5185\u8054\u5C55\u5F00\u540E\u518D\u6821\u9A8C" });
        return { valid: errors.length === 0, errors };
      }
      const push = (keyword, message) => errors.push({ pointer: pointer || "/", keyword, message });
      if (schema.type !== void 0) {
        if (!typeMatch(data, schema.type)) {
          push("type", `\u7C7B\u578B\u5E94\u4E3A ${Array.isArray(schema.type) ? schema.type.join("|") : schema.type}\uFF0C\u5B9E\u9645 ${jsonType(data)}`);
        }
      }
      if (schema.const !== void 0 && JSON.stringify(data) !== JSON.stringify(schema.const)) {
        push("const", `\u5E94\u4E3A\u5E38\u91CF ${JSON.stringify(schema.const)}\uFF0C\u5B9E\u9645 ${JSON.stringify(data).slice(0, 60)}`);
      }
      if (Array.isArray(schema.enum) && !schema.enum.some((v) => JSON.stringify(v) === JSON.stringify(data))) {
        push("enum", `\u4E0D\u5728\u679A\u4E3E ${JSON.stringify(schema.enum).slice(0, 120)} \u5185\uFF0C\u5B9E\u9645 ${JSON.stringify(data).slice(0, 60)}`);
      }
      if (Array.isArray(schema.allOf)) {
        for (let i = 0; i < schema.allOf.length; i++) {
          for (const e of validate(data, schema.allOf[i], pointer).errors) errors.push(e);
        }
      }
      if (Array.isArray(schema.anyOf)) {
        const attempts = schema.anyOf.map((sub) => validate(data, sub, pointer));
        if (!attempts.some((a) => a.valid)) {
          push("anyOf", `\u4E0D\u6EE1\u8DB3 anyOf \u4EFB\u4E00\u5206\u652F\uFF08${attempts.length} \u4E2A\u5206\u652F\u5168\u90E8\u5931\u8D25\uFF09`);
        }
      }
      if (Array.isArray(schema.oneOf)) {
        const okCount = schema.oneOf.filter((sub) => validate(data, sub, pointer).valid).length;
        if (okCount !== 1) push("oneOf", `\u5E94\u6070\u597D\u5339\u914D oneOf \u4E00\u4E2A\u5206\u652F\uFF0C\u5B9E\u9645\u5339\u914D ${okCount} \u4E2A`);
      }
      if (schema.not) {
        if (validate(data, schema.not, pointer).valid) push("not", "\u4E0D\u5E94\u5339\u914D not \u5206\u652F\uFF0C\u4F46\u5339\u914D\u4E86");
      }
      if (typeof data === "string") {
        if (schema.minLength !== void 0 && data.length < schema.minLength) push("minLength", `\u957F\u5EA6 ${data.length} < \u6700\u5C0F ${schema.minLength}`);
        if (schema.maxLength !== void 0 && data.length > schema.maxLength) push("maxLength", `\u957F\u5EA6 ${data.length} > \u6700\u5927 ${schema.maxLength}`);
        if (schema.pattern !== void 0) {
          try {
            if (!new RegExp(schema.pattern).test(data)) push("pattern", `\u4E0D\u5339\u914D pattern ${schema.pattern}`);
          } catch (_) {
            push("pattern", `pattern \u975E\u6CD5\u6B63\u5219\uFF1A${schema.pattern}`);
          }
        }
        if (schema.format && FORMATS[schema.format]) {
          if (!FORMATS[schema.format].test(data)) push("format", `\u4E0D\u7B26\u5408 ${schema.format} \u683C\u5F0F\uFF1A${data.slice(0, 60)}`);
        }
      }
      if (jsonType(data) === "number" || jsonType(data) === "integer") {
        if (schema.minimum !== void 0 && data < schema.minimum) push("minimum", `${data} < \u6700\u5C0F\u503C ${schema.minimum}`);
        if (schema.maximum !== void 0 && data > schema.maximum) push("maximum", `${data} > \u6700\u5927\u503C ${schema.maximum}`);
        if (schema.exclusiveMinimum !== void 0 && data <= schema.exclusiveMinimum) push("exclusiveMinimum", `${data} \u2264 \u6392\u4ED6\u4E0B\u754C ${schema.exclusiveMinimum}`);
        if (schema.exclusiveMaximum !== void 0 && data >= schema.exclusiveMaximum) push("exclusiveMaximum", `${data} \u2265 \u6392\u4ED6\u4E0A\u754C ${schema.exclusiveMaximum}`);
        if (schema.multipleOf !== void 0 && schema.multipleOf > 0) {
          const q = data / schema.multipleOf;
          if (Math.abs(q - Math.round(q)) > 1e-9) push("multipleOf", `${data} \u4E0D\u662F ${schema.multipleOf} \u7684\u6574\u6570\u500D`);
        }
      }
      if (Array.isArray(data)) {
        if (schema.minItems !== void 0 && data.length < schema.minItems) push("minItems", `\u5143\u7D20\u6570 ${data.length} < \u6700\u5C0F ${schema.minItems}`);
        if (schema.maxItems !== void 0 && data.length > schema.maxItems) push("maxItems", `\u5143\u7D20\u6570 ${data.length} > \u6700\u5927 ${schema.maxItems}`);
        if (schema.uniqueItems === true) {
          const seen = new Set(data.map((x) => JSON.stringify(x)));
          if (seen.size !== data.length) push("uniqueItems", "\u5B58\u5728\u91CD\u590D\u5143\u7D20");
        }
        if (schema.items !== void 0 && typeof schema.items === "object" && !Array.isArray(schema.items)) {
          data.forEach((item, i) => {
            for (const e of validate(item, schema.items, `${pointer}/${i}`).errors) errors.push(e);
          });
        }
      }
      if (data !== null && typeof data === "object" && !Array.isArray(data)) {
        const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
        const required = Array.isArray(schema.required) ? schema.required : [];
        for (const key of required) {
          if (!(key in data)) push("required", `\u7F3A\u5C11\u5FC5\u586B\u5C5E\u6027 "${key}"`);
        }
        for (const key of Object.keys(data)) {
          if (key in props) {
            for (const e of validate(data[key], props[key], `${pointer}/${escapePointer(key)}`).errors) errors.push(e);
          } else {
            const ap = schema.additionalProperties;
            if (ap === false) {
              push("additionalProperties", `\u591A\u4F59\u5C5E\u6027 "${key}"\uFF08additionalProperties=false\uFF09`);
            } else if (ap && typeof ap === "object") {
              for (const e of validate(data[key], ap, `${pointer}/${escapePointer(key)}`).errors) errors.push(e);
            }
          }
        }
      }
      return { valid: errors.length === 0, errors };
    }
    function escapePointer(token) {
      return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
    }
    function explainSchema(schema) {
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return "schema \u672C\u8EAB\u5FC5\u987B\u662F\u5BF9\u8C61";
      }
      const lines = [];
      walk(schema, "", 0);
      return lines.join("\n");
      function walk(node, path, depth) {
        if (depth > 6 || !node || typeof node !== "object" || Array.isArray(node)) return;
        const label = path || "(root)";
        const type = Array.isArray(node.type) ? node.type.join("|") : node.type || (node.properties ? "object" : node.items ? "array" : "\u672A\u58F0\u660E");
        const bits = [`\u7C7B\u578B ${type}`];
        if (Array.isArray(node.required) && node.required.length) bits.push(`\u5FC5\u586B [${node.required.join(", ")}]`);
        if (node.enum) bits.push(`\u679A\u4E3E ${JSON.stringify(node.enum).slice(0, 80)}`);
        if (node.const !== void 0) bits.push(`\u5E38\u91CF ${JSON.stringify(node.const).slice(0, 60)}`);
        if (node.minimum !== void 0 || node.maximum !== void 0) bits.push(`\u8303\u56F4 ${node.minimum ?? "-\u221E"} ~ ${node.maximum ?? "+\u221E"}`);
        if (node.minLength !== void 0 || node.maxLength !== void 0) bits.push(`\u957F\u5EA6 ${node.minLength ?? 0} ~ ${node.maxLength ?? "\u221E"}`);
        if (node.pattern) bits.push(`pattern ${node.pattern}`);
        if (node.format) bits.push(`format ${node.format}`);
        if (node.description) bits.push(String(node.description).slice(0, 80));
        lines.push(`${"  ".repeat(depth)}${label}: ${bits.join(" \xB7 ")}`);
        if (node.properties) {
          for (const [k, sub] of Object.entries(node.properties)) {
            walk(sub, path ? `${path}/${k}` : `/${k}`, depth + 1);
          }
        }
        if (node.items && typeof node.items === "object" && !Array.isArray(node.items)) {
          walk(node.items, path ? `${path}[]` : "[]", depth + 1);
        }
      }
    }
    module.exports = { validate, explainSchema, escapePointer, jsonType, typeMatch, FORMATS, SUPPORTED_TYPES };
  }
});

// shared/mock-core.js
var require_mock_core = __commonJS({
  "shared/mock-core.js"(exports, module) {
    "use strict";
    var MOCK_STRINGS = ["alpha", "beta", "gamma", "delta", "omega", "kappa", "sigma", "zeta"];
    var MOCK_WORDS = ["core", "edge", "node", "mesh", "flow", "spark", "drift", "orbit"];
    function makeRng(seed) {
      let a = (Number.isFinite(Number(seed)) && Number(seed) > 0 ? Number(seed) : 49734321) >>> 0;
      return function rng() {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    var MockError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "MockError";
      }
    };
    function generate(schema, opts = {}) {
      const rng = makeRng(opts.seed);
      const ctx = { rng, depth: 0, maxDepth: 8 };
      return gen(schema, ctx);
    }
    function gen(schema, ctx) {
      if (ctx.depth > ctx.maxDepth) throw new MockError(`\u5D4C\u5957\u6DF1\u5EA6\u8D85\u8FC7 ${ctx.maxDepth}\uFF08schema \u5D4C\u5957\u8FC7\u6DF1\u6216\u5B58\u5728\u81EA\u5F15\u7528\u5F62\u6001\uFF09`);
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        throw new MockError("schema \u672C\u8EAB\u5FC5\u987B\u662F\u5BF9\u8C61");
      }
      if ("$ref" in schema) throw new MockError("\u672C\u5B9E\u73B0\u4E0D\u652F\u6301 $ref\uFF08\u8FB9\u754C\u89C1\u5DE5\u5177\u63CF\u8FF0\uFF09\uFF0C\u8BF7\u5185\u8054\u5C55\u5F00 schema");
      ctx.depth++;
      try {
        if (schema.const !== void 0) return schema.const;
        if (Array.isArray(schema.enum) && schema.enum.length) {
          return schema.enum[Math.floor(ctx.rng() * schema.enum.length)];
        }
        if (Array.isArray(schema.allOf) && schema.allOf.length) {
          const merged = { ...schema };
          delete merged.allOf;
          for (const sub of schema.allOf) {
            Object.assign(merged, sub, { properties: { ...merged.properties || {}, ...sub.properties || {} } });
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
          for (let i = 0; i < 10; i++) {
            const cand = gen({ type: ["string", "integer", "boolean"][i % 3] }, ctx);
            try {
              const { validate } = lazySchemaCheck();
              if (!validate(cand, schema.not).valid) return cand;
            } catch (_) {
            }
            return cand;
          }
          throw new MockError("not \u5206\u652F\u751F\u6210\u5931\u8D25\uFF0810 \u6B21\u5C1D\u8BD5\u5747\u88AB\u6392\u9664\uFF09");
        }
        let type = schema.type;
        if (Array.isArray(type)) type = type[Math.floor(ctx.rng() * type.length)];
        if (!type) type = schema.properties ? "object" : schema.items ? "array" : pickDefaultType(ctx);
        switch (type) {
          case "string":
            return genString(schema, ctx);
          case "integer":
            return genNumber(schema, ctx, true);
          case "number":
            return genNumber(schema, ctx, false);
          case "boolean":
            return ctx.rng() < 0.5;
          case "null":
            return null;
          case "array":
            return genArray(schema, ctx);
          case "object":
            return genObject(schema, ctx);
          default:
            throw new MockError(`\u4E0D\u652F\u6301\u7684 type: ${type}`);
        }
      } finally {
        ctx.depth--;
      }
    }
    function pickDefaultType(ctx) {
      return ["string", "integer", "boolean"][Math.floor(ctx.rng() * 3)];
    }
    function genString(schema, ctx) {
      const min = Number.isFinite(schema.minLength) ? schema.minLength : 1;
      const maxRaw = Number.isFinite(schema.maxLength) ? schema.maxLength : Infinity;
      if (maxRaw < min) throw new MockError(`\u957F\u5EA6\u7EA6\u675F\u77DB\u76FE\uFF1AminLength=${min} > maxLength=${maxRaw}\uFF0C\u4EFB\u4F55\u503C\u90FD\u4E0D\u53EF\u80FD\u6EE1\u8DB3`);
      const max = maxRaw === Infinity ? Math.max(min, 8) : maxRaw;
      const pool = MOCK_STRINGS.concat(MOCK_WORDS);
      const base = () => pool[Math.floor(ctx.rng() * pool.length)] + "-" + Math.floor(ctx.rng() * 1e4);
      let s = base();
      let guard = 0;
      while (s.length < min && guard++ < 50) s += "-" + base();
      if (s.length > max) s = s.slice(0, max);
      if (s.length < min) throw new MockError(`minLength=${min} \u8D85\u51FA\u5B57\u7B26\u4E32\u53EF\u751F\u6210\u8303\u56F4`);
      if (schema.pattern) {
        let re;
        try {
          re = new RegExp(schema.pattern);
        } catch (e) {
          throw new MockError(`pattern \u975E\u6CD5\u6B63\u5219\uFF1A${schema.pattern}`);
        }
        const literals = String(schema.pattern).replace(/\[[^\]]*\]/g, "").match(/[a-zA-Z][a-zA-Z]+/g) || [];
        const seedWord = literals.find((w) => w.length >= 2);
        guard = 0;
        while (!re.test(s) && guard++ < 20) {
          const candidate = seedWord ? seedWord + "-" + Math.floor(ctx.rng() * 1e4) : base();
          s = candidate.slice(0, max);
        }
        if (!re.test(s)) {
          throw new MockError(`pattern ${schema.pattern} \u6709\u9650\u91CD\u8BD5\uFF0820 \u6B21\uFF09\u5185\u65E0\u6CD5\u968F\u673A\u6EE1\u8DB3\u2014\u2014\u6B63\u5411\u6B63\u5219\u751F\u6210\u4E0D\u5728\u652F\u6301\u8303\u56F4\uFF0C\u8BF7\u6539\u7528\u65E0 pattern schema \u6216\u63D0\u4F9B const/enum`);
        }
      }
      if (schema.format === "uuid") return "3f2b1a4c-8d9e-4f0a-b1c2-d3e4f5a6b7c8".slice(0, 36);
      if (schema.format === "date") return "2026-11-04";
      if (schema.format === "date-time") return "2026-11-04T10:30:00Z";
      if (schema.format === "email") return "mock-user@example.com";
      return s;
    }
    function genNumber(schema, ctx, integer) {
      let min = schema.minimum !== void 0 ? schema.minimum : schema.exclusiveMinimum !== void 0 ? schema.exclusiveMinimum + (integer ? 1 : 0.1) : 0;
      let max = schema.maximum !== void 0 ? schema.maximum : schema.exclusiveMaximum !== void 0 ? schema.exclusiveMaximum - (integer ? 1 : 0.1) : min + 100;
      if (min > max) {
        if (schema.minimum !== void 0 && schema.maximum !== void 0 && schema.minimum === schema.maximum) return schema.minimum;
        throw new MockError(`\u6570\u503C\u8303\u56F4\u975E\u6CD5\uFF1Amin=${min} > max=${max}`);
      }
      const span = max - min;
      let v = min + ctx.rng() * span;
      if (schema.multipleOf !== void 0 && schema.multipleOf > 0) {
        const m = schema.multipleOf;
        const kMin = Math.ceil(min / m);
        const kMax = Math.floor(max / m);
        if (kMin > kMax) throw new MockError(`\u8303\u56F4 [${min}, ${max}] \u5185\u4E0D\u5B58\u5728 ${m} \u7684\u500D\u6570`);
        v = (kMin + Math.floor(ctx.rng() * (kMax - kMin + 1))) * m;
      }
      if (integer) v = Math.round(v);
      return v;
    }
    function genArray(schema, ctx) {
      const min = Number.isFinite(schema.minItems) ? schema.minItems : 1;
      const max = Number.isFinite(schema.maxItems) ? Math.max(schema.maxItems, min) : Math.max(min, 3);
      const count = min + Math.floor(ctx.rng() * (max - min + 1));
      const items = [];
      for (let i = 0; i < count; i++) {
        if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
          items.push(gen(schema.items, ctx));
        } else {
          items.push(pickDefaultType(ctx) === "string" ? genString({}, ctx) : genNumber({}, ctx, false));
        }
      }
      if (schema.uniqueItems === true) {
        const seen = /* @__PURE__ */ new Set();
        let guard = 0;
        for (let i = 0; i < items.length && guard++ < 100; i++) {
          let s = JSON.stringify(items[i]);
          while (seen.has(s) && guard++ < 100) {
            items[i] = gen(schema.items && typeof schema.items === "object" ? schema.items : {}, ctx);
            s = JSON.stringify(items[i]);
          }
          seen.add(s);
        }
        if (new Set(items.map((x) => JSON.stringify(x))).size !== items.length) {
          throw new MockError("uniqueItems=true \u65F6\u6709\u9650\u5C1D\u8BD5\u5185\u65E0\u6CD5\u751F\u6210\u4E92\u5F02\u6570\u7EC4\uFF08items \u503C\u7A7A\u95F4\u8FC7\u5C0F\uFF09");
        }
      }
      return items;
    }
    function genObject(schema, ctx) {
      const out = {};
      const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (key in props) out[key] = gen(props[key], ctx);
        else out[key] = genString({}, ctx);
      }
      for (const [key, sub] of Object.entries(props)) {
        if (key in out) continue;
        if (ctx.rng() < 0.5) out[key] = gen(sub, ctx);
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        if (ctx.rng() < 0.3) out["extra_field"] = gen(schema.additionalProperties, ctx);
      }
      return out;
    }
    var schemaCheckModule = null;
    function lazySchemaCheck() {
      if (schemaCheckModule) return schemaCheckModule;
      try {
        schemaCheckModule = require_schema_core();
      } catch (_) {
        schemaCheckModule = null;
      }
      return schemaCheckModule;
    }
    function generateBatch2(schema, opts = {}) {
      const count = Math.max(1, Math.min(50, Number.isFinite(Number(opts.count)) ? Number(opts.count) : 3));
      const seed = opts.seed;
      const out = [];
      for (let i = 0; i < count; i++) {
        const item = generate(schema, { seed: seed !== void 0 ? Number(seed) + i * 7919 : void 0 });
        const sc = lazySchemaCheck();
        if (sc) {
          const v = sc.validate(item, schema);
          if (!v.valid) {
            throw new MockError(`\u95ED\u73AF\u81EA\u68C0\u5931\u8D25\uFF08\u751F\u6210\u5668 bug\uFF0C\u5982\u5B9E\u62A5\u9519\uFF09\uFF1A\u7B2C ${i + 1} \u7EC4\u672A\u901A\u8FC7 schema \u6821\u9A8C\uFF1A${JSON.stringify(v.errors.slice(0, 3))}`);
          }
        }
        out.push(item);
      }
      return out;
    }
    module.exports = { generate, generateBatch: generateBatch2, makeRng, MockError };
  }
});

// src/Panel.tsx
var core = __toESM(require_mock_core());
import { useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.sm-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.sm-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sm-head b{font-size:13px}
.sm-head .sub{color:#5C6678;font-size:11px}
.sm-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.sm-label{color:#8B94A9;font-size:11px}
.sm-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.sm-area:focus{border-color:#4fd1a0}
.sm-row{display:flex;gap:8px;align-items:center}
.sm-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;width:130px;outline:none}
.sm-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.sm-btn:disabled{opacity:.5;cursor:not-allowed}
.sm-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.sm-out{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#8ce0b0}
.sm-note{color:#5C6678;font-size:11px;line-height:1.6}
`;
function SchemaMockPanel(_props) {
  const [schemaText, setSchemaText] = useState("");
  const [seed, setSeed] = useState("42");
  const [count, setCount] = useState("3");
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState(null);
  const result = useMemo(() => {
    if (!submitted) return null;
    try {
      const schema = JSON.parse(submitted.s);
      const items = core.generateBatch(schema, { seed: submitted.seed, count: submitted.count });
      return { items, ok: true };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }, [submitted]);
  const run = () => {
    setError(null);
    if (!schemaText.trim()) return;
    try {
      JSON.parse(schemaText);
    } catch (e) {
      setError(`schema JSON \u89E3\u6790\u5931\u8D25\uFF1A${e.message.slice(0, 120)}`);
      return;
    }
    const seedNum = seed.trim() !== "" && Number.isFinite(Number(seed)) ? Number(seed) : void 0;
    const countNum = Number.isFinite(Number(count)) ? Math.max(1, Math.min(50, Number(count))) : 3;
    setSubmitted({ s: schemaText, seed: seedNum, count: countNum });
  };
  return /* @__PURE__ */ jsxs("div", { className: "sm-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "sm-head", children: [
      /* @__PURE__ */ jsx("b", { children: "Mock \u6570\u636E\u751F\u6210\u5668" }),
      /* @__PURE__ */ jsx("span", { className: "sub", children: "\u6309 JSON Schema \u53CD\u5411\u751F\u6210 \xB7 seed \u53EF\u590D\u73B0 \xB7 \u95ED\u73AF\u81EA\u68C0" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sm-body", children: [
      /* @__PURE__ */ jsx("div", { className: "sm-label", children: "JSON Schema\uFF08Draft-07 \u9AD8\u9891\u5B50\u96C6\uFF09" }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "sm-area",
          placeholder: '{"type":"object","required":["id"],"properties":{"id":{"type":"integer","minimum":1},"name":{"type":"string"}}}',
          value: schemaText,
          onChange: (e) => setSchemaText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "sm-row", children: [
        /* @__PURE__ */ jsx("span", { className: "sm-label", children: "seed" }),
        /* @__PURE__ */ jsx("input", { className: "sm-input", value: seed, onChange: (e) => setSeed(e.target.value), placeholder: "42" }),
        /* @__PURE__ */ jsx("span", { className: "sm-label", children: "count" }),
        /* @__PURE__ */ jsx("input", { className: "sm-input", value: count, onChange: (e) => setCount(e.target.value), placeholder: "3" }),
        /* @__PURE__ */ jsx("button", { className: "sm-btn", onClick: run, disabled: !schemaText.trim(), children: "\u751F\u6210" })
      ] }),
      error && /* @__PURE__ */ jsx("div", { className: "sm-err", children: error }),
      result && "error" in result && /* @__PURE__ */ jsx("div", { className: "sm-err", children: result.error }),
      result && "items" in result && /* @__PURE__ */ jsx("div", { className: "sm-out", children: JSON.stringify(result.items, null, 2) }),
      /* @__PURE__ */ jsxs("div", { className: "sm-note", children: [
        "\u652F\u6301\uFF08Draft-07 \u9AD8\u9891\u5B50\u96C6\uFF09\uFF1Atype / enum / const / required / properties / items / \u6570\u503C\u8303\u56F4\uFF08\u542B exclusive/multipleOf\uFF09/ \u5B57\u7B26\u4E32\u957F\u5EA6 / array \u7EA6\u675F / additionalProperties / oneOf\xB7anyOf\xB7allOf\u3002 pattern \u6709\u754C\u91CD\u8BD5\u81EA\u68C0\uFF08\u65E0\u6CD5\u6EE1\u8DB3\u5982\u5B9E\u62A5\u9519\uFF09\uFF1B",
        /* @__PURE__ */ jsx("b", { children: "\u4E0D\u652F\u6301 $ref" }),
        "\uFF08\u5982\u5B9E\u62A5\u9519\uFF09\u3002seed \u76F8\u540C\u751F\u6210\u5E8F\u5217\u76F8\u540C\uFF08\u786E\u5B9A\u6027 PRNG\uFF09\u3002 \u751F\u6210\u7269\u4E0E schema-check\uFF08036\uFF09\u7EC4\u6210\u5DE5\u5177\u94FE\uFF1Amock \u2192 validate\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function SchemaMockEntry(props) {
  return /* @__PURE__ */ jsx2(SchemaMockPanel, { ...props });
}
export {
  SchemaMockEntry as default
};
