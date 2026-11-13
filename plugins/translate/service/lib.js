'use strict';
/**
 * translate 纯函数核（service/main.js 与 test 共用；零副作用可 require）
 */

const BAIDU_URL = 'https://fanyi-api.baidu.com/api/trans/vip/translate';

function md5Hex(s) {
  // node:crypto 延迟引入，保持本模块可被任意入口复用
  // eslint-disable-next-line global-require
  const { createHash } = require('node:crypto');
  return createHash('md5').update(s).digest('hex');
}

/**
 * 百度签名：md5(appId + text + salt + secretKey)（与原 Rust commands/translate.rs 一致）
 */
function baiduSign(appId, text, salt, secretKey) {
  return md5Hex(`${appId}${text}${salt}${secretKey}`);
}

function buildBaiduParams(text, appId, salt, sign, target) {
  return new URLSearchParams({
    q: text,
    from: 'auto',
    to: target,
    appid: appId,
    salt,
    sign,
  }).toString();
}

/**
 * 调百度上游并归一化结果：{ success, result, error }
 * fetch 由调用方注入（生产=全局 fetch；测试=mock）。
 */
async function translateViaBaidu({ text, appId, secretKey, to, fetchImpl }) {
  const doFetch = fetchImpl || global.fetch;
  const salt = String(Date.now());
  const sign = baiduSign(appId, text, salt, secretKey);
  const target = to || 'en';
  const url = `${BAIDU_URL}?${buildBaiduParams(text, appId, salt, sign, target)}`;
  try {
    const data = await doFetch(url, { method: 'POST' }).then((r) => r.json());
    if (data && data.trans_result && data.trans_result[0] && data.trans_result[0].dst) {
      return { success: true, result: data.trans_result[0].dst, error: null };
    }
    const code = data && data.error_code ? data.error_code : 'unknown';
    const msg = data && data.error_msg ? data.error_msg : 'no trans_result';
    return { success: false, result: null, error: `百度翻译失败[${code}]: ${msg}` };
  } catch (e) {
    return { success: false, result: null, error: `请求异常: ${e.message}` };
  }
}

module.exports = { BAIDU_URL, baiduSign, buildBaiduParams, translateViaBaidu };
