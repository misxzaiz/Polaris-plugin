# 开发者工具箱（dev-toolbox）

把 13 个每天都要用的开发小工具装进 Polaris：**JWT 解码、哈希、UUID、Base64、URL、JSON、YAML、正则、命名风格、时间戳、Cron、进制、颜色**。
同时把其中 11 个确定性运算暴露为 MCP 工具（`mcp__dev-toolbox__*`），让宿主 AI **直接调用真实计算结果**——语言模型无法自行计算哈希、无法保证 UUID 唯一、cron 推算不可靠，这些都必须走工具。

选型依据见 `docs/dev-toolbox-plan.md`（it-tools 41.1k★ / He3 / DevUtils 三方验证的产品形态；Polaris 生态 82 个上架插件中首个工具箱）。

## 工具清单

| 分类 | 工具 | 说明 |
|---|---|---|
| 令牌与加密 | JWT 解码 | 结构/claims/过期态；HS256/384/512 验签（RS/ES 暂不支持） |
| | 哈希计算 | MD5 / SHA-1 / 256 / 384 / 512 / HMAC，一次全算 |
| | UUID 生成 | v4（密码学随机）、v7（时间有序单调），批量 + 解析 |
| 编解码 | Base64 | UTF-8 安全；URL-safe 变体；解码容错并报告非法字节 |
| | URL | 严格（RFC 3986）与表单两种解码口径；组件与参数拆解（重复参数不丢） |
| 格式 | JSON | 格式化/压缩/校验（错误定位行列）/深度键排序 |
| | YAML↔JSON | js-yaml 4，YAML 1.2 core 口径明示 |
| 文本 | 正则测试 | 实时高亮/捕获组/替换预览（JS 方言，`.` 不匹配换行等语义如实呈现） |
| | 命名风格互转 | camel/pascal/snake/constant/kebab/train/dot/title 等 10 种 |
| 时间 | 时间戳转换 | 自动识别 s/ms/μs/ns；相对时间；实时时钟；双向 |
| | Cron 解析 | 字段表 + 中文描述 + 未来 5 次执行（5 段与 6 段含秒） |
| 数值与颜色 | 进制转换 | 2-36 任意进制，BigInt 超大整数精确 |
| | 颜色转换 | HEX/RGB/HSL 三向 + 对比文字色预览 |

### MCP 工具（11 个，AI 可调用）

`hash_text`、`uuid_generate`、`base64_encode`、`base64_decode`、`jwt_decode`、`cron_next_runs`、`timestamp_to_iso`、`iso_to_timestamp`、`yaml_convert`、`regex_test`、`url_parse`

工具描述按「适用句式」写给 AI（例如：需要哈希值时必须调用本工具，模型自行给出的哈希一定是错的）。

## 架构

```
src/core/*.ts    纯函数核心（TS strict，单一真相）
  ├─ esbuild → dist/panel.js   面板（react external，宿主提供实例）
  └─ esbuild → dist/core.cjs   MCP 与单测共用同一实现
mcp/server.js    stdio JSON-RPC，零依赖（require ../dist/core.cjs）
test/            core.test.mjs（RFC 向量 + node:crypto 交叉验证）
                 mcp.test.mjs（spawn 真子进程走 JSON-RPC）
                 render-verify.mjs（SSR 渲染断言）
                 realbridge.test.mjs（DEVTB_REAL=1 门控真桥）
```

运行时依赖仅 js-yaml + cron-parser（构建期打进产物，安装后零外部依赖）。基线 node ≥18（globalThis.crypto）。

## 键空间契约（cap.kv）

| 键 | 内容 |
|---|---|
| `devtoolbox.favs` | 收藏的工具 id 数组 |
| `devtoolbox.last` | 最后使用的工具 id |

**隐私纪律：只存这两个非敏感键。** 工具输入（JWT/密钥/哈希原文）一律不持久化、不上网；面板全部计算在本地完成。

## 验证口径

```bash
npm install
npm run typecheck   # tsc --noEmit，0 错误
npm run build       # esbuild → dist/panel.js + dist/core.cjs
npm test            # core 24 项 + mcp 6 项（真子进程协议）+ SSR 渲染 7 项
# 真桥冒烟（需宿主已运行：pnpm tauri:dev:web）
DEVTB_REAL=1 node --test test/realbridge.test.mjs
```

- MD5/SHA/HMAC 与 `node:crypto` 全量交叉验证；MD5 的 RFC 1321 "abc" 向量以 node:crypto 为准（RFC 印刷版该向量系文档勘误）。
- Base64 与 RFC 4648 向量 + node:crypto 200 例随机对齐；HMAC 与 RFC 4231 对齐。

## 已知边界

- JWT 验签仅 HS256/384/512（RS/ES 需公钥 JWK，v0.2 候选）；解码不做网络请求。
- YAML 为 YAML 1.2 core schema（`yes` 是字符串不是布尔）。
- v7 同一毫秒内用 12bit 序列号保证单调；跨毫秒不保证严格递增（规范语义即如此）。
- HSL 往返存在 8-bit 量化 ±1 漂移（CSS 规范算法固有）。
- 正则扫描列表始终展示全部潜在匹配（便于验证模式），替换预览严格遵循所勾选的标志。
- 移动端（Remote）面板可用性未实测：面板走宿主 React shim 与 cap.kv，无 Tauri 专属桥依赖，理论可达，待真机验证。
