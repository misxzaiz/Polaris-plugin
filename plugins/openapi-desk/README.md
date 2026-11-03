# OpenAPI 调试台（openapi-desk）

把 `openapi.yaml / openapi.json` 从「给人看的文档」变成「直接可调、可校验、可对比的活接口台」：

- **拖入合同 30 秒发出第一个真实请求**——参数表单化、请求体按 schema 自动生成示例，不用再手工抄文档。
- **响应与合同逐字段校验**——状态码不在合同、类型漂移、必填缺失、枚举越界、格式问题，自动产出 breaking/告警/信息三级中文报告。
- **两版合同结构化对比**——端点增删、参数变化、必填收紧、类型变更、枚举收缩、响应码增删、鉴权变化，breaking 逐条标红并说明对调用方的影响。
- **AI 自动联调**——AI 经 MCP 五工具读合同、按合同调用、校验响应漂移、对比版本，把「帮我把这些接口验收一遍」变成一句话。

## 为什么是它

| 场景 | 常见做法 | 本插件 |
|---|---|---|
| 拿到 openapi.yaml 想试接口 | 打开 Swagger UI 手展参数 / 导入 Postman（要登录） | 拖入合同 → 点端点即调 |
| 怀疑接口返回和文档不一致 | 肉眼比对 JSON | 自动逐字段校验，三级报告 |
| API 升级评估影响 | 人工翻 changelog / 装 oasdiff CLI | 新旧各导一次，breaking 清单直接出 |
| 让 AI 帮忙联调 | AI 瞎猜参数 | AI 按合同构造请求，响应按合同校验 |

## 使用

1. **导入**：合同库页粘贴 YAML/JSON 文本、选择本地文件，或给 URL（由本机服务拉取，天然无跨域限制）。
2. **调试**：选合同 → 选端点（参数/请求体/示例一目了然）→ 填服务器地址与鉴权（Bearer / API Key / Basic，只存本机）→ 发送 → 看响应 + 合同校验报告。
3. **对比**：新旧两版合同各导入一次（同名不同版本会自动共存）→ 对比页选择 A→B → 看 breaking 清单。
4. **AI 联调**：对 Polaris AI 说「用 SmokeFixture 合同调一下 GET /pets 看返回和文档一致吗」——AI 会用 `oadesk_verify` 完成并发回漂移报告。

### MCP 工具（5 个）

| 工具 | 用途 |
|---|---|
| `oadesk_specs` | 列出已导入合同（名称/版本/端点数/服务器） |
| `oadesk_endpoints` | 列出某合同全部端点与参数概要 |
| `oadesk_call` | 按合同构造并发送真实请求 |
| `oadesk_verify` | 调用 + 按合同逐字段校验（漂移报告，核心工具） |
| `oadesk_diff` | 两版合同结构化对比，breaking 标红 |

## 安全与隐私

- 鉴权值（token / API key / 密码）只存在于服务内存与本机档案文件（`{{appConfigDir}}/openapi-desk/envs.json`），落 kv / 进日志 / 返回 AI 的一切均为 `****last4` 掩码。
- AI 通道护栏：只能对已导入合同的端点发请求（不接受任意 URL）；POST/PUT/PATCH/DELETE 等非安全方法必须用户确认（`confirm:true`）才发送。
- 请求重定向不静默跟随（`redirect: manual`）——301/302 与 Location 直接可见。
- 合同文本 ≤ 4MB，响应体落库截断 64KB；数据不出本机。

## 支持范围

- OpenAPI 3.0.x 完整支持；3.1 尽力解析（type 数组等降级处理）；Swagger 2.0 基础兼容（`in:body` → requestBody、`host+basePath` → servers）。
- `$ref` 支持文档内部引用（`#/...`，循环引用安全）；外部文件/URL 引用暂不支持（导入时明确列出）。

## 架构

```
plugins/openapi-desk/
├── src/          面板（React，三 Tab：合同/调试/对比；纯 kv 读写，跨端可用）
├── service/      执行引擎（YAML 解析[js-yaml 内置 vendor]/$ref 规范化/发送/校验/diff；
│                 单槽信箱 oadesk.cmd→oadesk.res，面板与 MCP 共享同一事实库）
├── shared/       openapi-core.js 纯函数核心（零依赖，core-tests 30 断言）
├── mcp/          AI 工具层（stdio，只投递命令不执行）
└── test/         core / service(假桥+mock上游) / mcp(三方) / panel-ssr / smoke-real(真桥)
```

## 测试

```bash
node --test test/core-tests.mjs     # 30 断言：解析/示例/构造/校验/diff
node test/service-tests.mjs         # 19 断言：信箱全链路+AI 护栏+重启恢复
node test/mcp-tests.mjs             # 12 断言：五工具+护栏文案
node test/panel-ssr.mjs             # 面板 SSR 渲染冒烟
node test/smoke-real.mjs            # 真桥冒烟（需宿主在跑）
```

## 已知限制

- 外部文件 `$ref` 不解析（导入时列出受影响位置）。
- 请求体示例对极复杂 allOf/oneOf 组合取第一个可行分支，可能需手改。
- 合同落库上限 2MB（超大型单体合同请拆分导入）。
- `oneOf` 校验失败时只展示第一个候选的偏差摘要，完整分支差异见面板。
