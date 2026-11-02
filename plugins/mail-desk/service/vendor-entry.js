'use strict';
/**
 * vendor-entry.js —— vendor 打包入口(esbuild 内联 npm 依赖,安装后零 npm i)
 * 产物 service/vendor.cjs 由 service/main.js require。
 */
module.exports = {
  SMTPServer: require('smtp-server').SMTPServer,
  simpleParser: require('mailparser').simpleParser,
};
