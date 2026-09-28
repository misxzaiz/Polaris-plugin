// core/cap-http.js — 经 Polaris 宿主 cap.http 能力发起 HTTP 请求（替代本地 node 中继）
//
// 面板模式（relay-devkit-api）：请求改道宿主 RouterBus → cap.http → 宿主 reqwest 转发，
// 不受浏览器 CORS / 混合内容 / 禁发头（Cookie/UA/Referer）限制，与原生 cURL 等效。
// 不再需要本地 server.js / /__proxy —— 插件零服务。
//
// 调用链：本模块 → invoke('router_dispatch') → cap.http → reqwest → 目标 API
//   payload: { action:'request', method, url, headers, body, bodyType, timeoutMs }
//   return : { status, statusText, ok, contentType, headers, body, isBase64, url, timeMs }
//
// 二进制响应（image/* 等）由宿主 base64 编码返回（isBase64:true），此处解码出 Blob URL。
// 本模块同时保留独立窗口模式（非 Tauri 宿主）的 __proxy 直连后端，供纯浏览器调试。

/** Tauri invoke（插件面板零依赖通道，与 Polaris marketplace 面板同款） */
async function tauriInvoke(cmd, args) {
  const internals = (window.__TAURI_INTERNALS__ || {}).invoke
  if (!internals) throw new Error('Tauri invoke 不可用（非 Polaris 宿主环境）')
  return internals(cmd, args)
}

/**
 * 经 cap.http 发起请求（面板模式）。
 * @param {{method:string,url:string,headers?:object,body?:string,bodyType?:string,timeoutMs?:number}} req
 * @returns {Promise<{status:number,statusText:string,ok:boolean,contentType:string,headers:object,body:string,isBase64:boolean,url:string,timeMs:number}>}
 */
export async function capHttpRequest({ method, url, headers, body, bodyType, timeoutMs }) {
  const res = await tauriInvoke('router_dispatch', {
    req: {
      target: 'cap.http',
      payload: {
        action: 'request',
        method,
        url,
        headers: headers || {},
        body: body || '',
        bodyType: bodyType || 'text',
        timeoutMs: timeoutMs || 15000,
      },
    },
  })
  if (!res || !res.ok) {
    throw new Error((res && res.error) || 'cap.http 请求失败')
  }
  return res.result || {}
}

/** 探测宿主 cap.http 是否可用（面板模式）。非 Tauri 环境返回 false。 */
export function hostCapHttpAvailable() {
  return !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
}

/**
 * base64 → Blob URL（cap.http 二进制响应解码）。
 * @param {string} b64 base64 字符串
 * @param {string} contentType MIME 类型（如 'image/png'）
 * @returns {Promise<string>} object URL
 */
export async function b64ToBlobUrl(b64, contentType) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * cap.http 响应 → relay-devkit t.response 结构（api.js send() 消费）。
 * 兼容：status / statusText / ok / timeMs / size / contentType / headers /
 *       text / isBinary / blobUrl / url / parsed
 */
export async function capHttpResponseToRelay(r, url) {
  const contentType = r.contentType || ''
  const isBinary = r.isBase64 || false
  const body = r.body || ''
  const isBin = isBinary || /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|x-)/i.test(contentType)
  return {
    status: r.status,
    statusText: r.statusText || '',
    ok: !!r.ok,
    timeMs: r.timeMs || 0,
    size: isBin ? body.length : new Blob([body]).size,
    contentType,
    headers: r.headers || {},
    text: isBin ? '' : body,
    isBinary: isBin,
    blobUrl: isBin ? await b64ToBlobUrl(body, contentType) : null,
    url: r.url || url,
    parsed: (() => { if (isBin) return undefined; try { return JSON.parse(body) } catch { return undefined } })(),
  }
}
