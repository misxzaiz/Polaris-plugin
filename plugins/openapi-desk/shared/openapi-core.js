'use strict';
/**
 * openapi-core.js —— OpenAPI 调试台核心纯函数（零依赖，node/浏览器通用）
 *
 * 职责：合同规范化（$ref 按需现场解析，仅内部引用、循环安全）、端点提取、
 * schema 示例生成、请求构造、响应合同校验（中文漂移报告，breaking/告警/信息
 * 三级）、两版合同结构化 diff（breaking 判定对齐 oasdiff 口径）、敏感值掩码。
 *
 * 设计不变量：
 *   - 本文件不解析 YAML（js-yaml 在 service 侧），输入一律是已解析的 JS 对象；
 *   - 绝不抛异常：所有失败以 {ok:false, error} 返回，错误信息面向用户可读（中文、含定位）；
 *   - $ref 只支持「#/」开头的内部引用；外部文件/URL 引用收集进 externalRefs 并明确报不支持；
 *   - 递归一律带深度上限 + 在途 $ref 栈，循环引用不炸栈；
 *   - 校验报告 severity：breaking（红，客户端会挂）/ warn（黄，大概率有问题）/ info（灰，仅提示）。
 */

const VERSION = '0.1.0';
const MAX_REF_DEPTH = 12;        // schema 递归深度上限
const MAX_EXTERNAL_REFS = 20;    // 外部引用收集上限
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// ── 掩码 ────────────────────────────────────────────────────────────────────
function maskSecret(s) {
  const str = String(s || '');
  if (!str) return '（空）';
  if (str.length <= 4) return '****';
  return '****' + str.slice(-4);
}

// ── $ref 解析（仅内部引用，现场解析，循环安全）───────────────────────────────
/** 解析 '#/components/schemas/Foo' 形式的内部引用；外部引用返回 {ok:false, external:true} */
function resolveRef(root, ref) {
  const r = String(ref || '').trim();
  if (!r) return { ok: false, error: '空 $ref' };
  if (!r.startsWith('#/')) return { ok: false, error: `外部引用（暂不支持）：${r}`, external: true };
  const parts = r.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) {
      return { ok: false, error: `$ref 指向不存在：${r}` };
    }
    cur = cur[p];
  }
  return { ok: true, value: cur };
}

/** schema 当前实际生效对象：是 $ref 就解一层（循环由调用方深度控制） */
function derefSchema(root, schema, depth, visiting) {
  if (!schema || typeof schema !== 'object') return { ok: true, value: schema };
  if (!schema.$ref) return { ok: true, value: schema };
  const r = resolveRef(root, schema.$ref);
  if (!r.ok) return r;
  // 循环防护：同一 $ref 在在途栈中出现 → 返回空对象占位（深度上限兜底）
  if (visiting && visiting.has(schema.$ref)) return { ok: true, value: {}, cyclic: true };
  return { ok: true, value: r.value, ref: schema.$ref };
}

// ── 类型工具 ────────────────────────────────────────────────────────────────
function schemaType(root, schema, depth) {
  if (!schema || typeof schema !== 'object') return null;
  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.filter((t) => t !== 'null');
    return nonNull[0] || 'null';
  }
  if (schema.type) return String(schema.type);
  const d = derefSchema(root, schema, depth, null);
  if (d.ok && d.value && d.value.type) {
    return Array.isArray(d.value.type) ? (d.value.type.filter((t) => t !== 'null')[0] || 'null') : String(d.value.type);
  }
  // 无 type 但有 properties/items → 推断
  const v = d.ok ? d.value : schema;
  if (v && typeof v === 'object') {
    if (v.properties || v.additionalProperties !== undefined && typeof v.additionalProperties === 'object') return 'object';
    if (v.items) return 'array';
    if (v.enum) return typeof v.enum[0];
  }
  return null;
}

function isNullable(root, schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.nullable === true) return true;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  if (schema.$ref) {
    const d = derefSchema(root, schema, 0, null);
    if (d.ok && d.value) return isNullable(root, d.value);
  }
  return false;
}

// ── 外部引用收集 ────────────────────────────────────────────────────────────
function collectExternalRefs(doc) {
  const out = [];
  const seen = new Set();
  const walk = (node, depth) => {
    if (out.length >= MAX_EXTERNAL_REFS || depth > MAX_REF_DEPTH || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
    if (typeof node === 'object') {
      if (typeof node.$ref === 'string' && !node.$ref.startsWith('#/') && !seen.has(node.$ref)) {
        seen.add(node.$ref);
        out.push(node.$ref);
      }
      for (const k of Object.keys(node)) walk(node[k], depth + 1);
    }
  };
  walk(doc, 0);
  return out;
}

// ── 合同规范化：解析校验 + 端点提取 ─────────────────────────────────────────
/**
 * @param doc 已解析（JSON.parse / yaml.load）的合同对象
 * @param meta {name, source, sourceDetail}
 * @returns {ok:true, spec} | {ok:false, error, hints?}
 */
function normalizeSpec(doc, meta) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: '合同不是 JSON/YAML 对象（顶层必须是映射）' };
  }
  const hints = [];
  let specVersion = '';
  if (typeof doc.openapi === 'string' && doc.openapi.trim()) {
    specVersion = doc.openapi.trim().startsWith('3.1') ? '3.1' : '3.0';
    if (doc.openapi.trim().startsWith('3.1')) hints.push('OpenAPI 3.1 检测到：按 3.0 语义尽力解析（JSON Schema 2020-12 的 type 数组/prefixItems 做降级处理）');
  } else if (doc.swagger === '2.0') {
    specVersion = '2.0';
    hints.push('Swagger 2.0 检测到：做基础兼容（in:body 参数 → requestBody，host+basePath → servers）');
  } else {
    return { ok: false, error: '缺少 openapi（3.x）或 swagger（2.0）版本字段——这不像一份 OpenAPI/Swagger 合同', hints: ['若内容是 JSON Schema 单个模型，本台不适用；请导入完整的 API 描述文档'] };
  }
  if (!doc.paths || typeof doc.paths !== 'object' || Array.isArray(doc.paths)) {
    return { ok: false, error: '缺少 paths 定义（无端点的合同没有可调试对象）' };
  }

  const externalRefs = collectExternalRefs(doc);

  // servers：3.x 取 servers[]；2.0 由 host+basePath 拼
  let servers = [];
  if (specVersion === '2.0') {
    const host = typeof doc.host === 'string' && doc.host ? doc.host : '';
    const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
    if (host) servers.push({ url: `http://${host}${basePath || ''}`, description: '由 swagger 2.0 host+basePath 推导' });
  } else if (Array.isArray(doc.servers)) {
    for (const s of doc.servers) {
      if (s && typeof s.url === 'string' && s.url) servers.push({ url: s.url, description: s.description || '' });
    }
  }

  // 全局 security
  const securityReqs = Array.isArray(doc.security) ? doc.security : [];

  const endpoints = [];
  let pathCount = 0;
  for (const rawPath of Object.keys(doc.paths)) {
    const pathItem = doc.paths[rawPath];
    if (!pathItem || typeof pathItem !== 'object') continue;
    pathCount += 1;
    const pathLevelParams = collectParams(doc, pathItem.parameters);
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;
      const opParams = collectParams(doc, op.parameters);
      const merged = mergeParams(pathLevelParams, opParams);
      // requestBody（3.x）或 2.0 in:body 参数
      let requestBody = op.requestBody || null;
      let bodyParam2 = null;
      if (specVersion === '2.0') {
        bodyParam2 = merged.find((p) => p.__raw && p.__raw.in === 'body') || null;
        if (bodyParam2) requestBody = {
          required: !!bodyParam2.__raw.required,
          content: { 'application/json': { schema: bodyParam2.__raw.schema } },
        };
      }
      const endpoint = {
        id: `${method.toUpperCase()} ${rawPath}`,
        method,
        path: rawPath,
        operationId: typeof op.operationId === 'string' ? op.operationId : '',
        summary: typeof op.summary === 'string' ? op.summary : '',
        description: typeof op.description === 'string' ? op.description : '',
        tags: Array.isArray(op.tags) ? op.tags.map(String) : [],
        deprecated: op.deprecated === true,
        parameters: merged.filter((p) => !p.__raw || p.__raw.in !== 'body').map((p) => ({
          name: p.name, in: p.in, required: !!p.required,
          description: p.description || '',
          schema: p.schema || null,
          example: p.example !== undefined ? p.example : (p.__raw && p.__raw.example),
        })),
        hasRequestBody: !!requestBody,
        requestBodyRequired: !!(requestBody && requestBody.required === true),
        requestBodyContentTypes: requestBody && requestBody.content ? Object.keys(requestBody.content) : [],
        requestBodySchema: requestBody && requestBody.content ? pickSchemaFromContent(requestBody.content) : null,
        responses: extractResponses(doc, op.responses),
        securityReqs: Array.isArray(op.security) ? op.security : null, // null = 继承全局
        needsAuth: (Array.isArray(op.security) ? op.security : securityReqs).length > 0,
      };
      endpoints.push(endpoint);
    }
  }

  if (!endpoints.length) {
    return { ok: false, error: 'paths 里没有任何可识别的 HTTP 操作（get/post/put/…）', hints };
  }

  const info = doc.info && typeof doc.info === 'object' ? doc.info : {};
  const spec = {
    id: '',
    name: String(meta && meta.name) || String(info.title || '') || '未命名合同',
    source: (meta && meta.source) || 'text',
    sourceDetail: String((meta && meta.sourceDetail) || ''),
    importedAt: new Date().toISOString(),
    specVersion,
    openapiVersion: String(doc.openapi || doc.swagger || ''),
    title: String(info.title || ''),
    infoDescription: String(info.description || ''),
    version: String(info.version || ''),
    servers,
    securityReqs,
    tags: Array.isArray(doc.tags) ? doc.tags.map((t) => (t && t.name ? String(t.name) : null)).filter(Boolean) : [],
    pathCount,
    endpoints,
    externalRefs,
    hints,
    // raw 文档完整保留（校验/示例生成时 $ref 需要根）
    raw: doc,
  };
  return { ok: true, spec };
}

function collectParams(doc, rawParams) {
  const out = [];
  if (!Array.isArray(rawParams)) return out;
  for (const rp of rawParams) {
    if (!rp || typeof rp !== 'object') continue;
    let p = rp;
    if (typeof rp.$ref === 'string') {
      const r = resolveRef(doc, rp.$ref);
      if (!r.ok) continue;
      p = r.value;
      if (!p || typeof p !== 'object') continue;
    }
    if (typeof p.name !== 'string' || !p.name) continue;
    out.push({
      name: p.name,
      in: ['path', 'query', 'header', 'cookie'].includes(p.in) ? p.in : 'query',
      required: p.required === true || p.in === 'path',
      description: typeof p.description === 'string' ? p.description : '',
      schema: p.schema || (p.type ? inferSchemaFromParam2(p) : null),
      example: p.example,
      __raw: p,
    });
  }
  return out;
}

/** swagger 2.0 参数无 schema 字段，类型信息直接在参数上 */
function inferSchemaFromParam2(p) {
  const s = { type: p.type };
  if (p.format) s.format = p.format;
  if (Array.isArray(p.enum)) s.enum = p.enum;
  if (p.items) s.items = p.items;
  if (p.minimum !== undefined) s.minimum = p.minimum;
  if (p.maximum !== undefined) s.maximum = p.maximum;
  return s;
}

function mergeParams(pathLevel, opLevel) {
  const out = [...opLevel];
  for (const pp of pathLevel) {
    if (!out.some((x) => x.name === pp.name && x.in === pp.in)) out.push(pp);
  }
  return out;
}

function pickSchemaFromContent(content) {
  // 优先 json，其次 */json 变体，再取第一个
  if (content['application/json']) return { mediaType: 'application/json', schema: content['application/json'].schema || null };
  const jsonKey = Object.keys(content).find((k) => /json/i.test(k));
  if (jsonKey) return { mediaType: jsonKey, schema: content[jsonKey].schema || null };
  const first = Object.keys(content)[0];
  if (first) return { mediaType: first, schema: content[first].schema || null };
  return null;
}

function extractResponses(doc, rawResponses) {
  const out = {};
  if (!rawResponses || typeof rawResponses !== 'object') return out;
  for (const code of Object.keys(rawResponses)) {
    const r = rawResponses[code];
    if (!r || typeof r !== 'object') continue;
    let resolved = r;
    if (typeof r.$ref === 'string') {
      const rr = resolveRef(doc, r.$ref);
      if (!rr.ok) continue;
      resolved = rr.value;
    }
    const entry = { code, description: typeof resolved.description === 'string' ? resolved.description : '' };
    if (resolved.content && typeof resolved.content === 'object') {
      entry.contentTypes = Object.keys(resolved.content);
      const picked = pickSchemaFromContent(resolved.content);
      if (picked) { entry.mediaType = picked.mediaType; entry.schema = picked.schema; }
    } else if (resolved.schema) {
      // swagger 2.0：schema 直接在 response 上
      entry.contentTypes = ['application/json'];
      entry.mediaType = 'application/json';
      entry.schema = resolved.schema;
    }
    out[code] = entry;
  }
  return out;
}

// ── 示例生成 ────────────────────────────────────────────────────────────────
/**
 * 按 schema 生成示例值：example > examples.default > default > enum[0] > 按 type 造。
 * 循环引用处理：同一个 $ref 在祖先链上最多出现 1 次（计数 >1 截断）——
 * 展示一层循环元素形态（friends:[{…}]），再深截断（friends:[{friends:[]}]），
 * 无环结构不受影响，绝不产生指数体积。
 */
const MAX_SAME_REF = 1;
function exampleFromSchema(root, schema, depth = 0, visiting) {
  const seen = visiting || new Map();
  if (depth > MAX_REF_DEPTH) return undefined;
  if (!schema || typeof schema !== 'object') return null;
  if (schema.$ref) {
    if ((seen.get(schema.$ref) || 0) > MAX_SAME_REF) return undefined; // 循环：该引用已展开过一层
    const d = derefSchema(root, schema, depth, null);
    if (!d.ok) return undefined;
    if (d.cyclic) return undefined;
    const nextSeen = new Map(seen);
    nextSeen.set(schema.$ref, (seen.get(schema.$ref) || 0) + 1);
    return exampleFromSchema(root, d.value, depth + 1, nextSeen);
  }
  if (schema.example !== undefined) return cloneValue(schema.example);
  if (schema.examples) {
    const ex = Array.isArray(schema.examples) ? schema.examples[0] : schema.examples.default;
    if (ex !== undefined && ex !== null && typeof ex === 'object' && 'value' in ex) return cloneValue(ex.value);
    if (ex !== undefined) return cloneValue(ex);
  }
  if (schema.default !== undefined) return cloneValue(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return cloneValue(schema.enum[0]);
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged = {};
    let got = false;
    for (const sub of schema.allOf) {
      const v = exampleFromSchema(root, sub, depth + 1, seen);
      if (v && typeof v === 'object' && !Array.isArray(v)) { Object.assign(merged, v); got = true; }
    }
    if (got) return merged;
  }
  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length) {
    return exampleFromSchema(root, schema.oneOf[0], depth + 1, seen);
  }
  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length) {
    return exampleFromSchema(root, schema.anyOf[0], depth + 1, seen);
  }
  const t = schemaType(root, schema, depth);
  switch (t) {
    case 'object': {
      const out = {};
      const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
      for (const k of Object.keys(props).slice(0, 30)) {
        const v = exampleFromSchema(root, props[k], depth + 1, seen);
        out[k] = v === undefined ? null : v; // 循环截断的子树保留键、值置 null
      }
      if (!Object.keys(out).length && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const v = exampleFromSchema(root, schema.additionalProperties, depth + 1, seen);
        out.key1 = v === undefined ? null : v;
      }
      return out;
    }
    case 'array': {
      const item = exampleFromSchema(root, schema.items, depth + 1, seen);
      return item === undefined ? [] : [item]; // 循环截断→空数组（层级到此为止）
    }
    case 'string': return exampleString(schema);
    case 'number': case 'integer': {
      let v = schema.minimum !== undefined ? Number(schema.minimum) : 0;
      if (!Number.isFinite(v)) v = 0;
      return t === 'integer' ? Math.round(v) : v;
    }
    case 'boolean': return false;
    case 'null': return null;
    default: {
      // 无 type：有 properties 当对象，有 items 当数组
      if (schema.properties) return exampleFromSchema(root, { ...schema, type: 'object' }, depth + 1);
      if (schema.items) return exampleFromSchema(root, { ...schema, type: 'array' }, depth + 1);
      return null;
    }
  }
}

function exampleString(schema) {
  if (schema.format) {
    switch (schema.format) {
      case 'date-time': return new Date().toISOString();
      case 'date': return new Date().toISOString().slice(0, 10);
      case 'time': return '12:30:00';
      case 'email': return 'user@example.com';
      case 'uuid': return '550e8400-e29b-41d4-a716-446655440000';
      case 'uri': case 'url': case 'uri-reference': return 'https://example.com/path';
      case 'ipv4': return '127.0.0.1';
      case 'ipv6': return '::1';
      case 'binary': return '<binary>';
      case 'int32': case 'int64': case 'float': case 'double': return '0';
      default: break;
    }
  }
  return 'string';
}

function cloneValue(v) {
  if (v === null || typeof v !== 'object') return v;
  try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; }
}

/** 为某个端点生成请求体示例（返回 {mediaType, value} 或 null） */
function exampleBodyForEndpoint(root, endpoint) {
  if (!endpoint.requestBodySchema) return null;
  return {
    mediaType: endpoint.requestBodySchema.mediaType || 'application/json',
    value: exampleFromSchema(root, endpoint.requestBodySchema.schema, 0),
  };
}

// ── 请求构造 ────────────────────────────────────────────────────────────────
/**
 * @param args {root, endpoint, baseUrl, values:{path,query,header}, bodyText, auth, contentType}
 * @returns {ok:true, url, headers, bodyText, maskedHeaders} | {ok:false, error}
 */
function buildRequest(args) {
  const { root, endpoint, baseUrl, values, bodyText, auth } = args;
  const vals = values && typeof values === 'object' ? values : {};
  const pathVals = vals.path && typeof vals.path === 'object' ? vals.path : {};
  const queryVals = vals.query && typeof vals.query === 'object' ? vals.query : {};
  const headerVals = vals.header && typeof vals.header === 'object' ? vals.header : {};

  // 1. baseUrl：显式传入 > 合同 servers[0]；服务器变量 {var} 替换
  let base = String(baseUrl || '').trim();
  if (!base) {
    const rootServers = root && Array.isArray(root.servers) ? root.servers : [];
    base = rootServers.length && rootServers[0] && rootServers[0].url ? String(rootServers[0].url) : '';
  }
  if (!base) return { ok: false, error: '没有可用的服务器地址：合同未声明 servers，请在调试页填写 baseUrl' };
  const serverVars = rootServersVars(root);
  for (const [k, v] of serverVars) {
    base = base.split(`{${k}}`).join(encodeURIComponent(v));
  }
  base = base.replace(/\/+$/, '');

  // 2. path 参数替换；缺必填直接拦
  let path = endpoint.path;
  const pathParamNames = [...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  for (const name of pathParamNames) {
    const v = pathVals[name];
    if (v === undefined || v === null || String(v) === '') {
      return { ok: false, error: `路径参数 {${name}} 未填（路径参数必填）` };
    }
    path = path.split(`{${name}}`).join(encodeURIComponent(String(v)));
  }

  // 3. query 参数（auth 的 apiKey-in-query 会再追加，故 URL 在 auth 之后生成）
  const qs = new URLSearchParams();
  for (const p of endpoint.parameters) {
    if (p.in !== 'query') continue;
    const raw = queryVals[p.name];
    if (raw === undefined || raw === null || String(raw) === '') {
      if (p.required) return { ok: false, error: `必填 query 参数缺失：${p.name}` };
      continue;
    }
    const text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    for (const piece of text.split(',')) qs.append(p.name, piece); // form 风格（数组逗号拆分）
  }

  // 4. headers
  const headers = {};
  const accept = pickAccept(endpoint);
  if (accept) headers['Accept'] = accept;
  for (const p of endpoint.parameters) {
    if (p.in !== 'header') continue;
    const raw = headerVals[p.name];
    if (raw === undefined || raw === null || String(raw) === '') {
      if (p.required) return { ok: false, error: `必填 header 参数缺失：${p.name}` };
      continue;
    }
    headers[p.name] = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  }

  // 5. auth（鉴权端点裸发在此拦截；apiKey in query 在 URL 生成前追加进 qs）
  const sec = effectiveSecurity(root, endpoint);
  const authErr = applyAuth(headers, qs, auth, sec);
  if (authErr) return { ok: false, error: authErr };

  const queryString = qs.toString();
  const url = `${base}${path}${queryString ? `?${queryString}` : ''}`;

  // 6. body
  let finalBody = '';
  const ct = String(args.contentType || (endpoint.requestBodySchema && endpoint.requestBodySchema.mediaType) || 'application/json');
  if (endpoint.hasRequestBody && bodyText != null && String(bodyText).trim() !== '') {
    headers['Content-Type'] = ct;
    finalBody = String(bodyText);
    if (/json/i.test(ct) && !/urlencoded/i.test(ct)) {
      try { JSON.parse(finalBody); } catch (e) { return { ok: false, error: `请求体不是合法 JSON：${(e && e.message) || e}` }; }
    }
  }

  const maskedHeaders = { ...headers };
  for (const k of Object.keys(maskedHeaders)) {
    if (/authorization|api-?key|token|secret|cookie/i.test(k)) maskedHeaders[k] = maskSecret(maskedHeaders[k]);
  }
  if (/^GET|HEAD$/i.test(endpoint.method) && !finalBody) {
    // GET/HEAD 一般无体；用户在 body 框填了内容也带上（尊重显式操作）
  }
  return { ok: true, url, method: endpoint.method.toUpperCase(), headers, bodyText: finalBody, maskedHeaders, securityReqs: sec };
}

function rootServersVars(root) {
  const out = new Map();
  const servers = root && Array.isArray(root.servers) ? root.servers : [];
  const vars = servers.length && servers[0] && servers[0].variables && typeof servers[0].variables === 'object' ? servers[0].variables : {};
  for (const k of Object.keys(vars)) {
    const v = vars[k];
    out.set(k, v && typeof v === 'object' && v.default !== undefined ? String(v.default) : '');
  }
  return out;
}

function pickAccept(endpoint) {
  const codes = Object.keys(endpoint.responses || {});
  const okCode = codes.find((c) => /^2/.test(c)) || codes[0];
  if (okCode && endpoint.responses[okCode] && Array.isArray(endpoint.responses[okCode].contentTypes) && endpoint.responses[okCode].contentTypes.length) {
    return endpoint.responses[okCode].contentTypes[0];
  }
  return null;
}

/** 端点生效的 security（operation 覆盖全局；[] = 显式免鉴权） */
function effectiveSecurity(root, endpoint) {
  if (endpoint.securityReqs !== null) return endpoint.securityReqs;
  return (root && Array.isArray(root.security)) ? root.security : [];
}

/**
 * 把 auth 配置应用到 headers/qs。
 * auth: null | {type:'bearer',token} | {type:'apiKey',in,name,value} | {type:'basic',username,password}
 * 无 auth 但合同要求 security → 返回错误（防裸发）。
 */
function applyAuth(headers, qs, auth, securityReqs) {
  const needsAuth = Array.isArray(securityReqs) && securityReqs.length > 0;
  const a = auth && typeof auth === 'object' ? auth : null;
  const hasAuthValue = a && (
    (a.type === 'bearer' && String(a.token || '').trim()) ||
    (a.type === 'apiKey' && String(a.value || '').trim() !== '') ||
    (a.type === 'basic' && String(a.username || '') !== '')
  );
  if (a && hasAuthValue) {
    if (a.type === 'bearer') headers['Authorization'] = `Bearer ${String(a.token).trim()}`;
    else if (a.type === 'basic') headers['Authorization'] = `Basic ${Buffer ? Buffer.from(`${a.username}:${a.password || ''}`).toString('base64') : btoa(`${a.username}:${a.password || ''}`)}`;
    else if (a.type === 'apiKey') {
      if (a.in === 'query') qs.append(String(a.name || 'api_key'), String(a.value));
      else headers[String(a.name || 'X-Api-Key')] = String(a.value);
    }
    return null;
  }
  if (needsAuth) {
    const names = securityReqs.map((s) => Object.keys(s || {}).join('+')).filter(Boolean).join(' / ');
    return `该端点在合同中要求鉴权（${names || 'security'}），请在调试页配置 token/API key 后再发送`;
  }
  return null;
}

// ── 响应合同校验 ────────────────────────────────────────────────────────────
/**
 * @returns {statusInContract, matchedSchema|null, drifts:[{jsonPath, kind, severity, expected, actual, hint}], summary:{breaking,warn,info}}
 */
function validateResponse(root, endpoint, params) {
  const status = Number(params.status || 0);
  const bodyText = String(params.bodyText || '');
  const drifts = [];
  const responses = endpoint.responses || {};
  const codeKeys = Object.keys(responses);
  const statusInContract = codeKeys.some((c) => {
    if (/^\d{3}$/.test(c)) return Number(c) === status;
    if (c === 'default') return true;
    // 区间如 '2XX'
    const m = /^(\d)XX$/i.exec(c);
    if (m) return Math.floor(status / 100) === Number(m[1]);
    return false;
  });
  if (!statusInContract) {
    drifts.push({
      jsonPath: '$.status', kind: 'unknown-status', severity: 'breaking',
      expected: `合同声明的状态码：${codeKeys.join(', ') || '（无）'}`,
      actual: `HTTP ${status || '网络失败'}`,
      hint: '响应状态码不在合同内——客户端按合同写的分支处理可能全部落空',
    });
    return { statusInContract: false, matchedSchema: null, drifts, summarize: summarizeDrifts(drifts), summary: summarizeDrifts(drifts) };
  }

  // 选 schema：精确码优先，其次区间，其次 default
  const matchKey = codeKeys.find((c) => /^\d{3}$/.test(c) && Number(c) === status)
    || codeKeys.find((c) => { const m = /^(\d)XX$/i.exec(c); return m && Math.floor(status / 100) === Number(m[1]); })
    || (codeKeys.includes('default') ? 'default' : null);
  const respEntry = matchKey ? responses[matchKey] : null;
  const schema = respEntry && respEntry.schema;

  let parsed = undefined;
  let parseErr = null;
  if (bodyText.trim()) {
    try { parsed = JSON.parse(bodyText); } catch (e) { parseErr = e; }
  }

  if (!schema) {
    // 该状态码合同未声明响应体 schema：只报 info（有体但合同没描述）
    if (bodyText.trim()) {
      drifts.push({ jsonPath: '$', kind: 'undescribed-body', severity: 'info', expected: '合同未描述该状态码的响应体', actual: `返回了 ${bodyText.length} 字符的体`, hint: '合同信息不完整，不阻塞但值得同步给后端' });
    }
    return { statusInContract: true, matchedSchema: null, drifts, summary: summarizeDrifts(drifts) };
  }
  if (parseErr) {
    drifts.push({
      jsonPath: '$', kind: 'unparseable-body', severity: 'breaking',
      expected: `schema 声明的 ${describeRootType(root, schema)}`,
      actual: `响应体不是合法 JSON（${(parseErr && parseErr.message) || '解析失败'}）`,
      hint: '可能是 HTML 错误页、空体或截断',
    });
    return { statusInContract: true, matchedSchema: schema, drifts, summary: summarizeDrifts(drifts) };
  }
  if (parsed === undefined && bodyText.trim()) parsed = null;

  validateValue(root, parsed, schema, '$', drifts, 0, new Set());
  return { statusInContract: true, matchedSchema: schema, drifts, summary: summarizeDrifts(drifts) };
}

function summarizeDrifts(drifts) {
  const breaking = drifts.filter((d) => d.severity === 'breaking').length;
  const warn = drifts.filter((d) => d.severity === 'warn').length;
  const info = drifts.filter((d) => d.severity === 'info').length;
  return { breaking, warn, info, total: drifts.length };
}

function describeRootType(root, schema) {
  const t = schemaType(root, schema, 0);
  return t || '未声明类型';
}

/**
 * 递归校验一个值与 schema 的偏差（累积进 drifts）。
 * containerRefs 用于 allOf/oneOf 内 $ref 去重防循环。
 */
function validateValue(root, value, schema, path, drifts, depth, containerRefs) {
  if (depth > MAX_REF_DEPTH) return;
  if (!schema || typeof schema !== 'object') return;

  if (schema.$ref) {
    const d = derefSchema(root, schema, depth, containerRefs);
    if (!d.ok) {
      drifts.push({ jsonPath: path, kind: 'broken-ref', severity: 'warn', expected: d.error, actual: '校验器无法跟进该引用', hint: '合同里有个坏 $ref，顺手告诉后端' });
      return;
    }
    if (d.cyclic) return; // 循环引用处不再深入（该节点结构已在别处校验）
    validateValue(root, value, d.value, path, drifts, depth + 1, containerRefs);
    return;
  }

  // 组合器
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    for (const sub of schema.allOf) validateValue(root, value, sub, path, drifts, depth + 1, containerRefs);
    // allOf 里可能有 sibling required 对本层 properties 的补充
    const merged = mergeAllOf(root, schema.allOf, depth, containerRefs);
    if (merged) {
      checkObjectBody(root, value, merged, path, drifts, depth, containerRefs);
    }
    return;
  }
  const combinators = schema.oneOf ? ['oneOf', schema.oneOf] : (schema.anyOf ? ['anyOf', schema.anyOf] : null);
  if (combinators) {
    const [kind, subs] = combinators;
    const subDriftLists = subs.map((sub) => {
      const list = [];
      validateValue(root, value, sub, path, list, depth + 1, containerRefs);
      return list.filter((d) => d.severity === 'breaking');
    });
    if (!subDriftLists.some((l) => l.length === 0)) {
      drifts.push({
        jsonPath: path, kind: `${kind}-no-match`, severity: 'breaking',
        expected: `与 ${kind} 的 ${subs.length} 个候选 schema 之一相符`,
        actual: '与所有候选都不符',
        hint: `第一个候选的偏差：${subDriftLists[0].slice(0, 3).map((d) => `${d.jsonPath} ${d.kind}`).join('；') || '（结构不符）'}`,
      });
    }
    return;
  }
  if (Array.isArray(schema.enum)) {
    const raw = value === undefined ? null : value;
    if (!schema.enum.some((x) => JSON.stringify(x) === JSON.stringify(raw))) {
      drifts.push({ jsonPath: path, kind: 'enum-violation', severity: 'breaking', expected: `枚举之一：${schema.enum.map((x) => JSON.stringify(x)).join(' / ')}`, actual: JSON.stringify(raw), hint: '实际值不在合同枚举内' });
    }
    return;
  }

  // nullable
  if ((value === null) && !isNullable(root, schema)) {
    if (schemaType(root, schema, depth) && schemaType(root, schema, depth) !== 'null') {
      drifts.push({ jsonPath: path, kind: 'null-not-allowed', severity: 'breaking', expected: describeRootType(root, schema), actual: 'null', hint: '合同未声明 nullable' });
    }
    return;
  }
  if (value === undefined || value === null) return; // 缺失由 required 检查负责

  const t = schemaType(root, schema, depth);
  switch (t) {
    case 'object': checkObjectBody(root, value, schema, path, drifts, depth, containerRefs); break;
    case 'array': checkArrayBody(root, value, schema, path, drifts, depth, containerRefs); break;
    case 'string': checkStringBody(value, schema, path, drifts); break;
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        drifts.push({ jsonPath: path, kind: 'type-mismatch', severity: 'breaking', expected: 'integer', actual: `${JSON.stringify(value)}（${describeJs(value)}）`, hint: '' });
        break;
      }
      checkNumberRange(value, schema, path, drifts);
      break;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        drifts.push({ jsonPath: path, kind: 'type-mismatch', severity: 'breaking', expected: 'number', actual: `${JSON.stringify(value)}（${describeJs(value)}）`, hint: '' });
        break;
      }
      checkNumberRange(value, schema, path, drifts);
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        drifts.push({ jsonPath: path, kind: 'type-mismatch', severity: 'breaking', expected: 'boolean', actual: `${JSON.stringify(value)}（${describeJs(value)}）`, hint: '常见坑：后端把布尔序列化成了 "true"/0/1' });
      }
      break;
    }
    default: break; // 未声明类型不校验
  }
}

function describeJs(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function mergeAllOf(root, subs, depth, containerRefs) {
  const merged = { properties: {}, required: [] };
  let hasAny = false;
  for (const sub of subs) {
    let s = sub;
    if (s && s.$ref) {
      const d = derefSchema(root, s, depth, containerRefs);
      if (!d.ok || d.cyclic) continue;
      s = d.value;
    }
    if (!s || typeof s !== 'object') continue;
    if (s.properties) {
      Object.assign(merged.properties, s.properties);
      hasAny = true;
    }
    if (Array.isArray(s.required)) {
      merged.required.push(...s.required.filter((r) => !merged.required.includes(r)));
      hasAny = true;
    }
  }
  return hasAny ? merged : null;
}

function checkObjectBody(root, value, schema, path, drifts, depth, containerRefs) {
  if (typeof value !== 'object' || Array.isArray(value)) {
    drifts.push({ jsonPath: path, kind: 'type-mismatch', severity: 'breaking', expected: 'object', actual: `${JSON.stringify(value).slice(0, 60)}（${describeJs(value)}）`, hint: '' });
    return;
  }
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const name of required) {
    if (!(name in value) || value[name] === undefined) {
      drifts.push({ jsonPath: `${path}.${name}`, kind: 'missing-required', severity: 'breaking', expected: '必填字段存在', actual: '缺失', hint: props[name] && props[name].description ? `字段说明：${String(props[name].description).slice(0, 80)}` : '' });
    }
  }
  const propNames = Object.keys(props);
  const checked = new Set();
  for (const name of propNames) {
    if (name in value) {
      checked.add(name);
      validateValue(root, value[name], props[name], `${path}.${name}`, drifts, depth + 1, containerRefs);
    }
  }
  // 值里有但合同没声明的字段
  const extras = Object.keys(value).filter((k) => !checked.has(k));
  if (extras.length) {
    const ap = schema.additionalProperties;
    if (ap === false) {
      drifts.push({ jsonPath: path, kind: 'additional-forbidden', severity: 'warn', expected: 'additionalProperties:false', actual: `多出字段 ${extras.slice(0, 5).join(', ')}${extras.length > 5 ? ' 等' : ''}`, hint: '合同禁止额外字段（多数字端实现并不报错，标注 warn）' });
    } else {
      drifts.push({ jsonPath: path, kind: 'undeclared-fields', severity: 'info', expected: '合同未声明的字段', actual: extras.slice(0, 8).join(', ') + (extras.length > 8 ? ' 等' : ''), hint: '后端比合同多给了字段——常见且通常无害，但合同已过时' });
    }
  }
}

function checkArrayBody(root, value, schema, path, drifts, depth, containerRefs) {
  if (!Array.isArray(value)) {
    drifts.push({ jsonPath: path, kind: 'type-mismatch', severity: 'breaking', expected: 'array', actual: `${JSON.stringify(value).slice(0, 60)}（${describeJs(value)}）`, hint: '常见坑：空结果时后端返回 {} 而非 []' });
    return;
  }
  if (schema.minItems !== undefined && value.length < Number(schema.minItems)) {
    drifts.push({ jsonPath: path, kind: 'min-items', severity: 'breaking', expected: `至少 ${schema.minItems} 项`, actual: `${value.length} 项`, hint: '' });
  }
  if (schema.maxItems !== undefined && value.length > Number(schema.maxItems)) {
    drifts.push({ jsonPath: path, kind: 'max-items', severity: 'breaking', expected: `至多 ${schema.maxItems} 项`, actual: `${value.length} 项`, hint: '' });
  }
  if (schema.items) {
    const limit = Math.min(value.length, 20); // 大数组只查前 20 项，避免报告爆炸
    for (let i = 0; i < limit; i++) validateValue(root, value[i], schema.items, `${path}[${i}]`, drifts, depth + 1, containerRefs);
  }
}

function checkStringBody(value, schema, path, drifts) {
  if (typeof value !== 'string') {
    drifts.push({ jsonPath: path, kind: 'type-mismatch', severity: 'breaking', expected: 'string', actual: `${JSON.stringify(value).slice(0, 60)}（${describeJs(value)}）`, hint: '常见坑：数字被序列化成字符串或反之' });
    return;
  }
  if (schema.pattern) {
    try {
      if (!new RegExp(schema.pattern).test(value)) {
        drifts.push({ jsonPath: path, kind: 'pattern-violation', severity: 'breaking', expected: `匹配 /${schema.pattern}/`, actual: String(value).slice(0, 80), hint: '' });
      }
    } catch (_) { /* 非法 pattern 跳过 */ }
  }
  if (schema.minLength !== undefined && value.length < Number(schema.minLength)) {
    drifts.push({ jsonPath: path, kind: 'min-length', severity: 'breaking', expected: `长度 ≥ ${schema.minLength}`, actual: `长度 ${value.length}`, hint: '' });
  }
  if (schema.maxLength !== undefined && value.length > Number(schema.maxLength)) {
    drifts.push({ jsonPath: path, kind: 'max-length', severity: 'breaking', expected: `长度 ≤ ${schema.maxLength}`, actual: `长度 ${value.length}`, hint: '' });
  }
  if (schema.format) {
    const fmt = checkFormat(schema.format, value);
    if (fmt) drifts.push({ jsonPath: path, kind: 'format-violation', severity: 'warn', expected: `format: ${schema.format}`, actual: String(value).slice(0, 80), hint: fmt });
  }
}

function checkFormat(format, v) {
  switch (format) {
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : '不是合法邮箱形态';
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : '应为 YYYY-MM-DD';
    case 'date-time': return /^\d{4}-\d{2}-\d{2}[Tt]/.test(v) ? null : '应为 ISO 8601 日期时间';
    case 'uuid': return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v) ? null : '不是合法 UUID';
    case 'uri': case 'url': try { return new URL(v) ? null : '不是合法 URL'; } catch (_) { return '不是合法 URL'; }
    case 'ipv4': return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? null : '不是合法 IPv4';
    default: return null;
  }
}

function checkNumberRange(v, schema, path, drifts) {
  if (schema.minimum !== undefined && v < Number(schema.minimum)) {
    drifts.push({ jsonPath: path, kind: 'min-violation', severity: 'breaking', expected: `≥ ${schema.minimum}`, actual: String(v), hint: '' });
  }
  if (schema.maximum !== undefined && v > Number(schema.maximum)) {
    drifts.push({ jsonPath: path, kind: 'max-violation', severity: 'breaking', expected: `≤ ${schema.maximum}`, actual: String(v), hint: '' });
  }
  if (schema.exclusiveMinimum !== undefined && !(v > Number(schema.exclusiveMinimum))) {
    drifts.push({ jsonPath: path, kind: 'min-violation', severity: 'breaking', expected: `> ${schema.exclusiveMinimum}（不含）`, actual: String(v), hint: '' });
  }
  if (schema.exclusiveMaximum !== undefined && !(v < Number(schema.exclusiveMaximum))) {
    drifts.push({ jsonPath: path, kind: 'max-violation', severity: 'breaking', expected: `< ${schema.exclusiveMaximum}（不含）`, actual: String(v), hint: '' });
  }
}

// ── 合同 diff ───────────────────────────────────────────────────────────────
/**
 * 结构化对比两份规范化合同。键 = METHOD path。
 * @returns {changes:[{kind, breaking, path, method?, detail, expected?, actual?}], summary:{breaking, warn, info, total}}
 */
function diffSpecs(specA, specB) {
  const changes = [];
  const epsA = indexEndpoints(specA);
  const epsB = indexEndpoints(specB);

  for (const key of Object.keys(epsA)) {
    if (!epsB[key]) {
      changes.push({ kind: 'endpoint-removed', breaking: true, path: epsA[key].path, method: epsA[key].method, detail: '端点被移除——现有调用方将得到 404' });
      continue;
    }
    diffEndpoint(specA, epsA[key], specB, epsB[key], changes);
  }
  for (const key of Object.keys(epsB)) {
    if (!epsA[key]) {
      changes.push({ kind: 'endpoint-added', breaking: false, path: epsB[key].path, method: epsB[key].method, detail: '新增端点' });
    }
  }

  // 全局 security 变化（只对两端都存在的端点在 diffEndpoint 里已对比 operation 级；这里补全局）
  const secA = JSON.stringify(specA.securityReqs || []);
  const secB = JSON.stringify(specB.securityReqs || []);
  if (secA !== secB) {
    const fromNone = !(specA.securityReqs || []).length;
    changes.push({ kind: 'global-security-changed', breaking: fromNone, path: '(全局)', detail: fromNone ? '合同从「无需鉴权」变为要求鉴权——所有未带凭证的现有调用会 401' : '全局 security 要求变化', expected: secA, actual: secB });
  }
  // servers 变化
  const urlsA = (specA.servers || []).map((s) => s.url).sort().join('|');
  const urlsB = (specB.servers || []).map((s) => s.url).sort().join('|');
  if (urlsA !== urlsB) {
    changes.push({ kind: 'servers-changed', breaking: false, path: '(全局)', detail: '服务器地址列表变化', expected: urlsA || '（无）', actual: urlsB || '（无）' });
  }

  const order = { breaking: 0, warn: 1, info: 2 };
  changes.sort((x, y) => (order[x.breaking ? 'breaking' : 'warn'] - order[y.breaking ? 'breaking' : 'warn']));
  const summary = { breaking: changes.filter((c) => c.breaking).length, warn: changes.filter((c) => !c.breaking && c.severity === 'warn').length, info: changes.filter((c) => !c.breaking && c.severity !== 'warn').length, total: changes.length };
  // 重算 warn/info：breaking 布尔之外，非 breaking 全按 info 展示，kind 级细分放 detail
  summary.warn = changes.filter((c) => !c.breaking && /removed|changed|tightened|deprecated/.test(c.kind)).length;
  summary.info = summary.total - summary.breaking - summary.warn;
  return { changes, summary };
}

function indexEndpoints(spec) {
  const out = {};
  for (const e of (spec && spec.endpoints) || []) out[`${e.method.toUpperCase()} ${e.path}`] = e;
  return out;
}

function diffEndpoint(specA, a, specB, b, changes) {
  const where = `${b.method.toUpperCase()} ${b.path}`;
  // $ref 解析的根必须是原始文档（spec 外壳上没有 components）
  const rootA = (specA && specA.raw) || specA;
  const rootB = (specB && specB.raw) || specB;

  // deprecated
  if (!a.deprecated && b.deprecated) {
    changes.push({ kind: 'deprecated-added', breaking: false, severity: 'warn', path: b.path, method: b.method, detail: '端点被标记为 deprecated——计划迁移，但当前仍可用' });
  }

  // 参数对比（按 in+name）
  const paramsA = indexParams(a);
  const paramsB = indexParams(b);
  for (const pk of Object.keys(paramsA)) {
    const pa = paramsA[pk];
    const pb = paramsB[pk];
    if (!pb) {
      changes.push({
        kind: 'param-removed', breaking: pa.in === 'path', severity: pa.in === 'path' ? undefined : 'warn',
        path: b.path, method: b.method,
        detail: pa.in === 'path' ? `路径参数 ${pa.name} 被移除——URL 形态变了，现有调用全部失效` : `参数 ${pa.name}（${pa.in}）不再声明——服务端多半忽略它，调用方可以清理`,
      });
      continue;
    }
    if (!pa.required && pb.required) {
      changes.push({ kind: 'param-required-tightened', breaking: true, path: b.path, method: b.method, detail: `参数 ${pa.name}（${pa.in}）从可选变为必填——未传该参数的调用将失败` });
    }
    const ta = describeSchemaType(rootA, pa.schema);
    const tb = describeSchemaType(rootB, pb.schema);
    if (ta && tb && ta !== tb) {
      changes.push({ kind: 'param-type-changed', breaking: true, path: b.path, method: b.method, detail: `参数 ${pa.name}（${pa.in}）类型从 ${ta} 变为 ${tb}` });
    }
    diffEnum(rootA, pa.schema, rootB, pb.schema, (kindOfChange, removedItems, addedItems) => {
      if (kindOfChange === 'narrowed') changes.push({ kind: 'param-enum-narrowed', breaking: true, path: b.path, method: b.method, detail: `参数 ${pa.name}（${pa.in}）枚举收缩：移除了 ${removedItems.join('/')}` });
      else if (kindOfChange === 'widened') changes.push({ kind: 'param-enum-widened', breaking: false, severity: 'info', path: b.path, method: b.method, detail: `参数 ${pa.name}（${pa.in}）枚举扩大：新增 ${addedItems.join('/')}` });
    });
  }
  for (const pk of Object.keys(paramsB)) {
    if (!paramsA[pk]) {
      const pb = paramsB[pk];
      changes.push({
        kind: 'param-added', breaking: !!pb.required,
        path: b.path, method: b.method,
        detail: pb.required ? `新增必填参数 ${pb.name}（${pb.in}）——未升级的调用方将失败` : `新增可选参数 ${pb.name}（${pb.in}）`,
      });
    }
  }

  // requestBody 对比
  if (!a.hasRequestBody && b.hasRequestBody) {
    changes.push({ kind: 'body-added', breaking: b.requestBodyRequired, path: b.path, method: b.method, detail: b.requestBodyRequired ? '端点从无请求体变为要求请求体——现有调用将失败' : '新增可选请求体' });
  } else if (a.hasRequestBody && !b.hasRequestBody) {
    changes.push({ kind: 'body-removed', breaking: false, severity: 'warn', path: b.path, method: b.method, detail: '端点不再声明请求体（放宽）' });
  } else if (a.hasRequestBody && b.hasRequestBody) {
    if (!a.requestBodyRequired && b.requestBodyRequired) {
      changes.push({ kind: 'body-required-tightened', breaking: true, path: b.path, method: b.method, detail: '请求体从可选变为必填' });
    }
    const ctsA = a.requestBodyContentTypes.sort().join(',');
    const ctsB = b.requestBodyContentTypes.sort().join(',');
    if (ctsA !== ctsB) {
      changes.push({ kind: 'body-content-type-changed', breaking: false, severity: 'warn', path: b.path, method: b.method, detail: `请求体媒体类型变化：${ctsA} → ${ctsB}` });
    }
    diffSchemaStructures(rootA, a.requestBodySchema && a.requestBodySchema.schema, rootB, b.requestBodySchema && b.requestBodySchema.schema, (c) => {
      changes.push({ ...c, path: b.path, method: b.method, where: '请求体' });
    });
  }

  // responses 对比
  const codesA = Object.keys(a.responses || {});
  const codesB = Object.keys(b.responses || {});
  for (const code of codesA) {
    if (!codesB.includes(code)) {
      changes.push({ kind: 'response-removed', breaking: /^2/.test(code), path: b.path, method: b.method, detail: `响应码 ${code} 从合同移除——依赖该分支的调用方处理逻辑将落空` });
      continue;
    }
    const ra = a.responses[code];
    const rb = b.responses[code];
    diffSchemaStructures(rootA, ra.schema, rootB, rb.schema, (c) => {
      changes.push({ ...c, path: b.path, method: b.method, where: `响应 ${code}` });
    });
  }
  for (const code of codesB) {
    if (!codesA.includes(code)) {
      changes.push({ kind: 'response-added', breaking: false, severity: 'info', path: b.path, method: b.method, detail: `新增响应码 ${code}` });
    }
  }

  // operation 级 security 变化
  const secA = JSON.stringify(a.securityReqs === null ? (specA.securityReqs || []) : a.securityReqs);
  const secB = JSON.stringify(b.securityReqs === null ? (specB.securityReqs || []) : b.securityReqs);
  if (secA !== secB) {
    const hadNone = secA === '[]';
    changes.push({ kind: 'security-changed', breaking: hadNone, path: b.path, method: b.method, detail: hadNone ? '端点从免鉴权变为要求鉴权——裸调会 401' : '端点鉴权要求变化' });
  }
}

function indexParams(endpoint) {
  const out = {};
  for (const p of endpoint.parameters || []) out[`${p.in}·${p.name}`] = p;
  return out;
}

function describeSchemaType(root, schema) {
  if (!schema) return null;
  if (schema.$ref) {
    if (!root) return null; // 无根文档无法解引用：宁缺毋错（brief 里不给类型即可）
    const d = derefSchema(root, schema, 0, null);
    if (d.ok && d.value) return describeSchemaType(root, d.value);
    return null;
  }
  const t = schemaType(root, schema, 0);
  if (t === 'string' && Array.isArray(schema.enum)) return 'enum-string';
  return t;
}

function diffEnum(rootA, schemaA, rootB, schemaB, report) {
  const ea = resolvedEnum(rootA, schemaA);
  const eb = resolvedEnum(rootB, schemaB);
  if (!ea || !eb) return;
  const setA = new Set(ea.map((x) => JSON.stringify(x)));
  const setB = new Set(eb.map((x) => JSON.stringify(x)));
  const removed = ea.filter((x) => !setB.has(JSON.stringify(x)));
  const added = eb.filter((x) => !setA.has(JSON.stringify(x)));
  if (removed.length && !added.length) report('narrowed', removed.map((x) => JSON.stringify(x)), []);
  else if (added.length && !removed.length) report('widened', [], added.map((x) => JSON.stringify(x)));
  else if (added.length && removed.length) report('narrowed', removed.map((x) => JSON.stringify(x)), []);
}

function directEnum(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (Array.isArray(schema.enum)) return schema.enum;
  return null;
}

/** enum 取值跟进一层 $ref（diffEnum 用；$ref 链上深处的 enum 不追，够用） */
function resolvedEnum(root, schema) {
  const direct = directEnum(schema);
  if (direct) return direct;
  if (schema && schema.$ref && root) {
    const d = derefSchema(root, schema, 0, null);
    if (d.ok && d.value) return directEnum(d.value);
  }
  return null;
}

/**
 * 把两个 schema 拍平成 {jsonPath → {type, required}} 做结构对比，
 * 报告：字段移除（breaking）/类型变化（breaking）/必填新增（breaking）/字段新增（info）。
 */
function diffSchemaStructures(rootA, schemaA, rootB, schemaB, report) {
  if (!schemaA || !schemaB) return;
  const flatA = {};
  const flatB = {};
  flattenSchema(rootA, schemaA, '$', flatA, 0);
  flattenSchema(rootB, schemaB, '$', flatB, 0);
  for (const p of Object.keys(flatA)) {
    const fa = flatA[p];
    const fb = flatB[p];
    if (!fb) {
      report({ kind: 'schema-field-removed', breaking: true, detail: `${fa.required ? '必填' : ''}字段 ${p} 从合同消失——依赖它的客户端将拿到 undefined` });
      continue;
    }
    if (fa.type && fb.type && fa.type !== fb.type) {
      report({ kind: 'schema-field-type-changed', breaking: true, detail: `字段 ${p} 类型从 ${fa.type} 变为 ${fb.type}` });
    }
    if (!fa.required && fb.required) {
      report({ kind: 'schema-required-added', breaking: true, detail: `字段 ${p}（请求体）从可选变为必填` });
    }
  }
  const added = Object.keys(flatB).filter((p) => !flatA[p]);
  if (added.length) {
    report({ kind: 'schema-field-added', breaking: false, severity: 'info', detail: `新增字段：${added.slice(0, 6).join(', ')}${added.length > 6 ? ' 等' : ''}` });
  }
}

/** 拍平 schema 结构（properties/required/items），$ref 现场解析，循环安全 */
function flattenSchema(root, schema, prefix, out, depth) {
  if (depth > 6 || !schema || typeof schema !== 'object') return;
  if (schema.$ref) {
    const d = derefSchema(root, schema, depth, null);
    if (!d.ok || d.cyclic) return;
    flattenSchema(root, d.value, prefix, out, depth + 1);
    return;
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) flattenSchema(root, sub, prefix, out, depth + 1);
    return;
  }
  if (schema.oneOf || schema.anyOf) {
    const subs = schema.oneOf || schema.anyOf;
    (subs || []).forEach((sub, i) => flattenSchema(root, sub, `${prefix}⟨变体${i + 1}⟩`, out, depth + 1));
    return;
  }
  const t = schemaType(root, schema, depth);
  out[prefix] = { type: t || 'any', required: false };
  if (t === 'object' && schema.properties && typeof schema.properties === 'object') {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const k of Object.keys(schema.properties).slice(0, 40)) {
      out[`${prefix}.${k}`] = { type: describeSchemaType(root, schema.properties[k]) || 'any', required: required.includes(k) };
      flattenSchema(root, schema.properties[k], `${prefix}.${k}`, out, depth + 1);
    }
  } else if (t === 'array' && schema.items) {
    flattenSchema(root, schema.items, `${prefix}[]`, out, depth + 1);
  }
}

// ── 环境掩码 ────────────────────────────────────────────────────────────────
/** 环境配置落 kv 前打掩码（token/password 只存服务内存 + 本地文件） */
function sanitizeEnvForKv(env) {
  const e = env && typeof env === 'object' ? env : {};
  const out = {
    baseUrl: String(e.baseUrl || ''),
    auth: null,
    savedAt: new Date().toISOString(),
  };
  if (e.auth && typeof e.auth === 'object') {
    out.auth = {
      type: String(e.auth.type || ''),
      name: String(e.auth.name || ''),
      in: String(e.auth.in || ''),
      // 值全掩码
      masked: true,
      tokenMask: maskSecret(e.auth.token),
      valueMask: maskSecret(e.auth.value),
      username: String(e.auth.username || ''),
    };
  }
  return out;
}

/** AI/日志用的端点安全视图（无任何 schema raw 引用） */
function endpointBrief(endpoint) {
  return {
    id: endpoint.id, method: endpoint.method.toUpperCase(), path: endpoint.path,
    summary: endpoint.summary, tags: endpoint.tags, deprecated: endpoint.deprecated,
    parameters: (endpoint.parameters || []).map((p) => ({
      name: p.name, in: p.in, required: p.required,
      type: p.schema ? describeSchemaType(null, p.schema) : null,
      description: p.description,
    })),
    hasRequestBody: endpoint.hasRequestBody,
    requestBodyRequired: endpoint.requestBodyRequired,
    requestBodyContentTypes: endpoint.requestBodyContentTypes,
    responseCodes: Object.keys(endpoint.responses || {}),
    needsAuth: endpoint.needsAuth === true,
  };
}

module.exports = {
  VERSION, HTTP_METHODS, MAX_REF_DEPTH,
  maskSecret, resolveRef, derefSchema, collectExternalRefs,
  normalizeSpec, exampleFromSchema, exampleBodyForEndpoint,
  buildRequest, effectiveSecurity,
  validateResponse, summarizeDrifts,
  diffSpecs, flattenSchema, describeSchemaType,
  sanitizeEnvForKv, endpointBrief,
};
