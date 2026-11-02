'use strict';
// vendor-entry.js —— 打包入口：service/vendor/vendor.cjs 由 build-vendor.js 生成
module.exports = {
  mysql2: require('mysql2/promise'),
  pg: require('pg'),
};
