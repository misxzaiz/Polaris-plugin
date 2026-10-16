// core/cap-http.js — 经 Polaris 宿主 cap.http 能力发起 HTTP 请求（面板模式专用）
//
// 面板模式：请求改道宿主 RouterBus → cap.http → 宿主 reqwest 转发，
// 不受浏览器 CORS / 混合内容 / 禁发头（Cookie/UA/Referer）限制。
// 与 relay-devkit-api 的 cap-http.js 同范式，此处收敛到 relay-devkit 使用。
//
// 调用链：本模块 → invoke('router_dispatch') → cap.http → reqwest → 目标
//   payload: { action:'request', method, url, headers, body, bodyType, timeoutMs }
//   return : { status, statusText, ok, contentType, headers, body, isBase64, url, timeMs }
//
// 本模块同时保留“独立窗口模式”回退：非宿主环境（纯浏览器调试）返回 false，
// 调用方回退到原 fetch 直连路径。

/** Tauri invoke（插件面板零依赖通道，与 Polaris marketplace 面板同款） */
async function tauriInvoke(cmd, args) {
  const internals = (window.__TAURI_INTERNALS__ || {}).invoke
  if (!internals) throw new Error('Tauri invoke 不可用（非 Polaris 宿主环境）')
  return internals(cmd, args)
}

/**
 * 探测宿主 cap.http 是否可用（面板模式）。非 Tauri 环境返回 false。
 */
export function hostCapHttpAvailable() {
  return !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
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
        timeoutMs: timeoutMs || 20000,
      },
    },
  })
  if (!res || !res.ok) {
    throw new Error((res && res.error) || 'cap.http 请求失败')
  }
  return res.result || {}
}