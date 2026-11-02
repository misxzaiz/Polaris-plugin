# dev-toolbox 开发者工具箱 —— 选型与产品方案

> 2026-11-03 立项。方向硬约束（2026-11-01 用户定案）：禁台账/记录/生活类；主攻工具/技术/变换/诊断/自动化。
> 核心动作判定：本插件全部能力均为「**变换 / 生成 / 诊断**」（编码、哈希、解析、转换、生成），零记录零台账，合格。

## 一、市场证据（外部可追溯）

「离线开发者工具箱（多合一小工具集）」这一产品形态被三个独立产品反复验证：

| 产品 | 形态 | 证据 |
|---|---|---|
| [it-tools](https://github.com/CorentinTh/it-tools) | 开源 Web 工具集 100+ | **41.1k GitHub stars / 5.5k forks**（2026-11 检索），可自托管 |
| [He3](https://www.producthunt.com/products/he3-app) | 桌面免费增值工具箱 200+ | YC 孵化，上架 Microsoft Store / Scoop |
| [DevUtils](https://devutils.com) | 桌面付费工具箱 47+ | 一次性买断收费且持续经营（[Show HN 讨论](https://news.ycombinator.com/item?id=29077933)），盈利验证 |

共同信号：开发者每天多次遇到「小而高频」的工具需求（解码一段 base64、算一个哈希、解一个 JWT、看 cron 下次执行时间），现有解法是开网页 / 装独立应用 / 让 AI 手算（不可靠）。

**Polaris 生态空白**：`index.json` 82 个上架插件中无任何工具箱形态插件（逐一核对插件清单）。

## 二、差异化（竞品做不到的）

1. **MCP 工具化——给宿主 AI 用，不只是给人用**。LLM 无法自行计算哈希（会幻觉出看似合理的值）、无法保证 UUID 唯一性、cron 日期推算不可靠。本插件把这些确定性运算暴露为 `mcp__dev-toolbox__*` 工具，AI 在会话里直接调用获得**真实计算结果**。it-tools/he3/devutils 均无 agent 可调用形态。
2. **工作台内零切换**：面板常驻 Polaris ActivityBar，不用切窗口/开新标签。
3. **纯本地计算，隐私默认**：JWT、密钥、哈希原语等敏感输入不经过任何网络（面板无服务端、无 cap.http 外呼），且**不持久化任何工具输入**（kv 只存收藏的工具 id 与最后使用项）。
4. **sendToChat 联动**：工具结果一键送入当前 AI 会话继续分析。

## 三、候选池与淘汰记录（12 个）

| 候选 | 处置 | 理由 |
|---|---|---|
| 开发者工具箱 | **入选** | 见上 |
| OpenAPI 契约台 | 备选 74 分 | 受众较窄；openapi-typescript/Swagger UI 成熟；mock-server 插件已占相邻场景 |
| 正则工作台 | 并入工具箱 | regex101 极强，独立形态差异化不足 |
| md↔docx 文档变换台 | 淘汰 66 分 | pandoc 缺口真实，但 md→docx 的样式/表格保真难达生产级，质量风险高 |
| SQL 工坊 | 淘汰 62 分 | sqlite-lens 相邻覆盖；受众窄 |
| 接口 Mock 台 | 淘汰（重复） | 生态已有 mock-server |
| 文本 Diff 台 | 淘汰（重复） | 生态已有 diff-desk |
| 证书巡检 / 进程端口诊断 | 淘汰（重复） | domain-probe / net-sentinel 已覆盖 |
| cron 台 / 进制台 / 编码台 | 并入工具箱 | 单独立项过窄，作为工具箱成员 |
| 数据清洗台 | 淘汰 | 与 csv/表格类既有能力重叠 |

## 四、加权评分（86/100）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4 | 小工具需求每日多次，现解法=切网页/装应用/AI 手算（幻觉风险） |
| 频率与覆盖 | 15% | 5 | 三产品独立验证人群与频率（41k★/YC/收费盈利） |
| 现有方案缺口 | 15% | 4 | 网页方案首载需联网、独立应用需安装管理；Polaris 生态空白；网页无法被 agent 调用 |
| 可验证差异化 | 15% | 4 | MCP 工具化（AI 调哈希/UUID/JWT）为独有；sendToChat 联动 |
| 收益与价值 | 15% | 4 | 秒级完成高频小任务；AI 调用消除哈希/UUID 幻觉 |
| 平台适配 | 10% | 5 | 纯前端变换 + 零依赖 stdio MCP，无网络/无服务进程/无跨域问题，完美匹配插件架构 |
| 技术可行性 | 5% | 5 | 全部纯函数，RFC 向量 + node:crypto 交叉验证可测 |
| 开发维护成本 | 5% | 4 | 13 个小工具一次成型工作量中等；彼此独立可增量维护 |

## 五、MVP 范围

### 面板 13 工具（分类导航 + 搜索 + 收藏）
- **令牌与加密**：JWT 解码（claims/过期态/HS256* 验签）、哈希（MD5/SHA1/SHA256/384/512/HMAC）、UUID（v4/v7/批量）
- **编解码**：Base64（含 URL-safe）、URL 编解码与解析（重复参数 getAll）
- **格式**：JSON（格式化/压缩/校验定位/键排序）、YAML↔JSON
- **文本**：正则测试（实时高亮/捕获组/替换预览）、命名风格互转
- **时间**：时间戳互转（自动识别 s/ms/相对时间/实时时钟）、Cron 解析（字段表/中文描述/未来 5 次执行）
- **数值与颜色**：进制转换（BigInt 任意进制）、颜色转换（HEX/RGB/HSL + 预览）

### MCP 11 工具（stdio，`mcp__dev-toolbox__*`）
`hash_text`、`uuid_generate`、`base64_encode`、`base64_decode`、`jwt_decode`、`cron_next_runs`、`timestamp_to_iso`、`iso_to_timestamp`、`yaml_convert`、`regex_test`、`url_parse`

### 暂不支持（明确边界）
- RS/ES 系 JWT 验签（需公钥 JWK，v0.2 候选）；TOTP；QR 码生成；CSV 清洗；文本 diff（生态已有 diff-desk，不做重复）

## 六、架构

```
src/core/*.ts   纯函数核心（TS strict，单测对象）
   ├─ esbuild → dist/panel.js  （面板 bundle，external:react 用宿主实例）
   └─ esbuild → dist/core.cjs  （MCP 与测试共用同一实现，单一真相）
mcp/server.js   零依赖 stdio JSON-RPC（require ../dist/core.cjs）
test/           node --test：core.test.mjs（RFC 向量 + node:crypto 交叉验证）
                        mcp.test.mjs（spawn 子进程走真协议）
                        render-verify.mjs（SSR 渲染断言）
                        realbridge.test.mjs（DEVTB_REAL=1 门控真桥）
```

依赖仅两个运行时库（构建期打进产物）：js-yaml ^4（YAML 互转）、cron-parser ^4（Cron 解析）。MD5/UUIDv7/大小写/进制等自实现并测试。基线：宿主 node ≥18（globalThis.crypto）。

## 七、风险与止损

- **风险 1**：与 it-tools 同质 → 缓解：差异化在 MCP/AI 集成与宿主内嵌；若 MCP 调用数据证明无人用，面板价值仍独立成立。
- **风险 2**：工具太多稀释质量 → 缓解：每个工具纯函数 + 测试向量先行；MVP 砍到 13 个，宁少勿滥。
- **止损**：若首版真桥冒烟发现宿主面板管线不兼容（Blob import 限制），停在 commit 并如实报告，不强推发布。
