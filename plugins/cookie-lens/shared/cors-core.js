/**
 * CORS 判定引擎（单一权威，MCP 与面板共用）—— 按 Fetch Standard 简单请求/预检语义判定。
 *
 * 零依赖纪律：不 require 任何 node 内置模块（同 cookie-core，见文件头注释）。
 *
 * 语义基准（实现严格对照，勿凭记忆改动）：
 * - 简单请求白名单：方法 GET/HEAD/POST（Fetch §HTTP-network fetch，大小写不敏感）；
 *   头 Accept / Accept-Language / Content-Language / Content-Type（值限三族：
 *   application/x-www-form-urlencoded、multipart/form-data、text/plain）。
 *   Authorization **不是**简单头——带它必触发预检（最高频误解之一）。
 * - Access-Control-Allow-Origin: * 与 credentials 组合 → 失败（Fetch §CORS check：
 *   credentials mode 为 include 时通配符无效，必须精确 echo origin）。
 * - Access-Control-Allow-Headers / -Methods 的 * 通配：credentials 请求下不再通配。
 * - CORS 失败的另一个形态：**重复响应头**（如两个 ACAO）→ 浏览器按失败处理，不合并。
 * - Access-Control-Allow-Origin: null 也是合法值（但危险，诊断 warn——origin 为
 *   "null" 的请求来自 sandboxed iframe/file://，echo null 等于对任何来源开门）。
 */
'use strict';

const SAFELIST_METHODS = ['GET', 'HEAD', 'POST'];
const SAFELIST_HEADERS = ['accept', 'accept-language', 'content-language'];
const SAFELIST_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const PREFLIGHT_EXPOSED = ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'access-control-max-age', 'access-control-allow-methods', 'access-control-allow-headers'];

/** 头名归一：小写去空白（HTTP 头名 ASCII 不区分大小写）。 */
function normName(n) { return String(n || '').trim().toLowerCase(); }

/** 把 [{name, value}] 或 {name: value} 归一为 [{name(小写), raw(原样), value}] 多值列表。raw 供诊断文案保留原始大小写。 */
function toHeaderList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .filter((h) => h && String(h.name || '').trim() !== '')
      .map((h) => ({ name: normName(h.name), raw: String(h.name).trim(), value: String(h.value ?? '') }));
  }
  return Object.entries(input).map(([k, v]) => ({ name: normName(k), raw: String(k).trim(), value: Array.isArray(v) ? String(v.join(', ')) : String(v ?? '') }));
}

/** 取多值头：全部值（重复头检测依赖它）。 */
function getAll(list, name) { return list.filter((h) => h.name === normName(name)).map((h) => h.value); }
function getFirst(list, name) {
  const all = getAll(list, name);
  return all.length ? all.join(', ') : null;
}

/** Fetch 标准 safelisted method 判定。 */
function isSafelistedMethod(m) { return SAFELIST_METHODS.includes(String(m || '').trim().toUpperCase()); }

/** Fetch 标准 safelisted header（CORS-safelisted request header）判定。 */
function isSafelistedHeader(name, value) {
  const n = normName(name);
  if (SAFELIST_HEADERS.includes(n)) return true;
  if (n === 'content-type') {
    const mime = String(value || '').split(';')[0].trim().toLowerCase();
    return SAFELIST_CONTENT_TYPES.includes(mime);
  }
  return false;
}

/** CORS response header 白名单暴露判定（前端 response.headers.get 只能看到这些 + Expose 列表）。 */
function isExposedResponseHeader(name, exposeList) {
  const n = normName(name);
  if (PREFLIGHT_EXPOSED.includes(n) || ['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma'].includes(n)) return true;
  return (exposeList || []).some((e) => normName(e) === n);
}

/**
 * 是否需要预检：非简单方法，或任一请求头不在 safelist。
 * 输入 {method, requestHeaders:[{name,value}]}
 */
function needsPreflight(method, requestHeaders) {
  if (!isSafelistedMethod(method)) return { needed: true, reason: `方法 ${method} 不在安全名单（GET/HEAD/POST）` };
  for (const h of requestHeaders) {
    if (!isSafelistedHeader(h.name, h.value)) return { needed: true, reason: `请求头 ${h.name} 不在安全名单${normName(h.name) === 'content-type' ? '（Content-Type 值限三族：urlencoded/multipart/text-plain）' : ''}` };
  }
  return { needed: false };
}

/**
 * CORS 判定主入口。
 * 输入 {origin, method='GET', requestHeaders=[], responseHeaders=[], withCredentials=false, preflight=false}
 * - preflight=true 强制按预检判定；缺省自动（非简单请求 → 预检语义）。
 * 返回 {ok, kind, verdict, checks:[{item, status, detail}], failReasons, hints, preflight}
 */
function judgeCors(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: '缺少输入对象' };
  const origin = String(input.origin ?? '').trim();
  const method = String(input.method || 'GET').trim() || 'GET';
  const reqHeaders = toHeaderList(input.requestHeaders);
  const resHeaders = toHeaderList(input.responseHeaders);
  const withCreds = !!input.withCredentials;
  if (!origin) return { ok: false, error: '缺少 origin（发起请求页面的来源，如 https://app.example.com）' };
  if (!/^https?:\/\/[^\s]+$/i.test(origin)) return { ok: false, error: `origin 形如 https://site.example，收到「${origin}」` };

  const pf = input.preflight === true ? { needed: true, reason: '显式指定按预检判定' } : needsPreflight(method, reqHeaders);
  const kind = pf.needed ? 'preflight' : 'simple';
  const checks = [];
  const failReasons = [];
  const hints = [];
  const add = (item, status, detail) => checks.push({ item, status, detail }); // status: pass|fail|warn|info

  // ── 第 1 关：Access-Control-Allow-Origin（两种 kind 都查）──
  const acaoAll = getAll(resHeaders, 'access-control-allow-origin');
  if (acaoAll.length === 0) {
    add('Access-Control-Allow-Origin', 'fail', '响应完全没有 ACAO——浏览器拦截响应，控制台报 "No Access-Control-Allow-Origin header"');
    failReasons.push('无 ACAO 头');
    hints.push('服务端给该接口加 Access-Control-Allow-Origin 响应头');
  } else if (acaoAll.length > 1) {
    add('Access-Control-Allow-Origin', 'fail', `ACAO 出现 ${acaoAll.length} 次（${acaoAll.map((v) => JSON.stringify(v)).join(' ')}）——CORS 检查按失败处理，**不会**合并；通常是网关/中间件+应用各写了一层`);
    failReasons.push('ACAO 重复');
    hints.push('排查重复写 ACAO 的层（Nginx add_header + 应用各一份是经典现场），只保留一处');
  } else {
    const acao = acaoAll[0].trim();
    if (acao === '*') {
      if (withCreds) {
        add('Access-Control-Allow-Origin', 'fail', 'ACAO=* 与 withCredentials 组合：Fetch 标准规定 credentials 模式下通配符无效，必须精确回显 origin');
        failReasons.push('credentials + 通配符');
        hints.push('改为动态回显 Access-Control-Allow-Origin: <请求 Origin>，并配 Vary: Origin 防缓存串味');
      } else {
        add('Access-Control-Allow-Origin', 'pass', 'ACAO=*（无凭证场景，通配有效）');
      }
    } else if (acao.toLowerCase() === origin.toLowerCase()) {
      add('Access-Control-Allow-Origin', 'pass', `ACAO 精确匹配 origin（${origin}）`);
      if (acao !== origin) add('Access-Control-Allow-Origin', 'info', '仅大小写差异命中——scheme/host 本就不区分大小写，成立');
    } else if (acao.toLowerCase() === 'null') {
      add('Access-Control-Allow-Origin', 'fail', `ACAO=null 不匹配 origin ${origin}`);
      failReasons.push('ACAO=null');
      hints.push('echo "null" 等于对 sandboxed iframe / file:// 全开门，属于高危配置——应精确回显真实 origin');
    } else {
      add('Access-Control-Allow-Origin', 'fail', `ACAO=${acao} 与 origin ${origin} 不匹配（子域也不行——http://a.example.com 不覆盖 http://b.example.com，更不覆盖 http://example.com 反向）`);
      failReasons.push('origin 不匹配');
      hints.push('CORS 是精确串匹配，不是「域后缀匹配」；把该 origin 加进白名单或动态回显 + Vary: Origin');
    }
  }

  // ── 第 2 关：credentials 才查 ACAC ──
  if (withCreds) {
    const acac = getFirst(resHeaders, 'access-control-allow-credentials');
    if (acac === null) {
      add('Access-Control-Allow-Credentials', 'fail', '带 cookie/凭证的请求要求 ACAC: true——缺失则浏览器拦截');
      failReasons.push('无 ACAC');
      hints.push('服务端加 Access-Control-Allow-Credentials: true');
    } else if (acac.trim().toLowerCase() !== 'true') {
      add('Access-Control-Allow-Credentials', 'fail', `ACAC 值须为字面量 "true"，收到「${acac.trim()}」`);
      failReasons.push('ACAC 非 true');
    } else add('Access-Control-Allow-Credentials', 'pass', 'ACAC: true');
  }

  // ── 第 3 关：预检专属（ACAM / ACAH）──
  if (kind === 'preflight') {
    add('触发预检', 'info', `预检原因：${pf.reason}——浏览器先发 OPTIONS ${'{url}'}（带 Access-Control-Request-Method/Header），本判定即预检响应须满足的条件`);

    const acam = getFirst(resHeaders, 'access-control-allow-methods');
    const mUp = method.toUpperCase();
    const wildcardOk = !withCreds; // 通配符只在无凭证请求下生效
    if (acam === null) {
      // 显式要求按预检判定（preflight:true）却在测预检语义：无 ACAM 就是过不了；自动判定且请求本可简单时才给 info 兜底
      if (input.preflight !== true && isSafelistedMethod(method) && reqHeaders.every((h) => isSafelistedHeader(h.name, h.value))) {
        add('Access-Control-Allow-Methods', 'info', '未返回 ACAM；方法/头皆 safelisted，若不是显式要求预检，实际可以不预检');
      } else {
        add('Access-Control-Allow-Methods', 'fail', '预检响应缺 ACAM——方法无法放行');
        failReasons.push('无 ACAM');
        hints.push(`加 Access-Control-Allow-Methods: ${mUp}`);
      }
    } else {
      const methods = acam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (methods.includes('*') && wildcardOk) add('Access-Control-Allow-Methods', 'pass', 'ACAM 含 *（无凭证，通配有效）');
      else if (methods.includes('*') && withCreds) {
        add('Access-Control-Allow-Methods', 'fail', 'credentials 请求下 ACAM:* 不再是通配符——须显式列出方法');
        failReasons.push('ACAM 通配 + credentials');
      } else if (methods.includes(mUp)) add('Access-Control-Allow-Methods', 'pass', `ACAM 含 ${mUp}`);
      else {
        add('Access-Control-Allow-Methods', 'fail', `ACAM 列表（${acam.trim()}）不含 ${mUp}——大小写不敏感比对后仍无命中`);
        failReasons.push(`方法 ${mUp} 未放行`);
      }
    }

    const acah = getFirst(resHeaders, 'access-control-allow-headers');
    const nonSafe = reqHeaders.filter((h) => !isSafelistedHeader(h.name, h.value));
    if (nonSafe.length > 0) {
      if (acah === null) {
        add('Access-Control-Allow-Headers', 'fail', `非安全头 ${nonSafe.map((h) => h.name).join(', ')} 但预检响应无 ACAH——逐头核对失败`);
        failReasons.push('无 ACAH');
        hints.push(`加 Access-Control-Allow-Headers: ${nonSafe.map((h) => h.name).join(', ')}`);
      } else {
        const allowed = acah.split(',').map((s) => normName(s)).filter(Boolean);
        const missing = [];
        for (const h of nonSafe) {
          if (allowed.includes(h.name)) continue;
          if (allowed.includes('*') && !withCreds) continue; // 无凭证时 * 通配全部
          // Fetch 标准：预检放行核对时会对头名做「不区分大小写 + 去空白」匹配，不做值匹配
          missing.push(h.raw || h.name); // 展示原始大小写（比对仍按小写 name）
        }
        if (missing.length === 0) add('Access-Control-Allow-Headers', 'pass', allowed.includes('*') ? `ACAH 覆盖（${withCreds ? '显式列表含全部非安全头' : '含 * 通配'}）` : `ACAH 含全部非安全头（${nonSafe.map((h) => h.name).join(', ')}）`);
        else {
          add('Access-Control-Allow-Headers', 'fail', `ACAH（${acah.trim()}）未放行：${missing.join(', ')}${allowed.includes('*') && withCreds ? '（credentials 下 * 不是通配符）' : ''}`);
          failReasons.push(`头未放行：${missing.join(', ')}`);
        }
      }
      // 高频真实坑：Authorization 被 ACAH 明确列出但网关先吃了 OPTIONS 的 Authorizaiton
      if (nonSafe.some((h) => h.name === 'authorization')) {
        add('Authorization 特例', 'warn', 'Authorization 头放行了预检还不够——不少网关/框架会校验 OPTIONS 请求上的 Authorization 而直接 401/403。预检请求按 Fetch 标准不携带凭证，正确做法是网关对 OPTIONS 放行');
      }
    } else if (acah !== null) {
      add('Access-Control-Allow-Headers', 'info', '无非安全头，ACAH 冗余（无害）');
    }
  }

  // ── 汇总判定 ──
  // 预检的 ACAM 「info 兜底」分支不算通过也不算失败：无 failReasons 即 pass。
  const verdict = failReasons.length === 0 ? 'pass' : 'fail';
  if (verdict === 'pass' && withCreds && kind === 'preflight') {
    hints.push('预检通过只是第一关——实际请求仍会按上面的 ACAO/ACAC 规则再核对一次（两段都过才放行）');
  }
  return { ok: true, kind, verdict, checks, failReasons, hints, preflightNeeded: pf.needed, preflightReason: pf.needed ? pf.reason : null };
}

/** 生成「这个请求要过 CORS，服务端响应头该长什么样」的建议（生成方向）。 */
function generateCorsAdvice(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: '缺少输入对象' };
  const origin = String(input.origin || '').trim();
  if (!origin) return { ok: false, error: '缺少 origin' };
  const method = String(input.method || 'GET').trim() || 'GET';
  const reqHeaders = toHeaderList(input.requestHeaders);
  const withCreds = !!input.withCredentials;
  const pf = needsPreflight(method, reqHeaders);

  const lines = [];
  const headers = [];
  headers.push(`Access-Control-Allow-Origin: ${withCreds ? origin : origin + '（或 * ）'}`);
  if (withCreds) headers.push('Access-Control-Allow-Credentials: true');
  headers.push('Vary: Origin（多 origin 白名单/动态回显时必配，防 CDN 缓存串味）');
  if (pf.needed) {
    headers.push(`Access-Control-Allow-Methods: ${method.toUpperCase()}`);
    const nonSafe = reqHeaders.filter((h) => !isSafelistedHeader(h.name, h.value));
    if (nonSafe.length) headers.push(`Access-Control-Allow-Headers: ${nonSafe.map((h) => h.raw || h.name).join(', ')}`);
    headers.push('Access-Control-Max-Age: 600（预检结果缓存秒数，省 OPTIONS）');
  }
  lines.push(`请求形态：${pf.needed ? '需要预检（' + pf.reason + '）' : '简单请求（无需预检，直接核对响应头）'}`);
  lines.push('服务端应答头建议：');
  for (const h of headers) lines.push(`  ${h}`);
  if (withCreds) lines.push('注意：credentials 下 ACAO 必须精确回显 origin，不能用 *（Fetch 标准）');
  return { ok: true, advice: lines.join('\n') };
}

/** 判定报告渲染（MCP 文本输出用）。 */
function renderCorsReport(r) {
  if (!r.ok) return `判定失败：${r.error}`;
  const mark = { pass: '[✓]', fail: '[✗]', warn: '[!]', info: '[·]' };
  const lines = [];
  lines.push(`判定：${r.verdict === 'pass' ? '通过——浏览器放行' : '失败——浏览器将拦截'}（${r.kind === 'preflight' ? '按预检语义' : '简单请求语义'}）`);
  for (const c of r.checks) lines.push(`  ${mark[c.status]} ${c.item}：${c.detail}`);
  if (r.hints && r.hints.length) {
    lines.push('修复建议：');
    for (const h of r.hints) lines.push(`  → ${h}`);
  }
  return lines.join('\n');
}

module.exports = {
  isSafelistedMethod, isSafelistedHeader, needsPreflight, isExposedResponseHeader,
  judgeCors, generateCorsAdvice, renderCorsReport, toHeaderList,
};
