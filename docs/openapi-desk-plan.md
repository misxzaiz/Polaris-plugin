# openapi-desk · OpenAPI 调试台 — Spec

> 2026-11-03 立项。选型文档见本文档「选型依据」节；生态 92 插件盘点后确认「合同驱动调试+校验+diff」空位。

## 一、产品定位

- **id / 显示名**:`openapi-desk` / 「OpenAPI 调试台」
- **一句话**:把 openapi.yaml/json 从「给人看的文档」变成「直接可调、可校验、可对比的活接口台」——拖入合同 30 秒发出第一个真实请求;响应与合同不符自动指出漂移;两个版本合同一比就知道升级会不会炸。
- **目标用户**:拿到 OpenAPI/Swagger 文档的前后端开发者、测试、集成工程师。
- **核心动作**:变换/诊断/自动化(合格口诀),非记录。

## 二、需求证据(外部可追溯)

1. Swagger UI 被实测定性「只是接口可视化展示工具,调试参数、保存用例、环境切换都不方便」(CSDN《基于Swagger的接口自动化测试》2024)。
2. Postman 强制登录引发迁移潮(V2EX t/997157);OpenAPI 导入 Postman 报错案例常见(掘金 6844904186610466829,该文推荐 Apifox——印证合同一体化需求真实)。
3. 响应校验/漂移检测是公认缺口:「Response validation exists, but coverage depends on setup and maintenance…cost moves to rollbacks, support tickets」(postman.com/alternatives/postman-vs-apidog);2026 工具指南确认 drift detection 仍在早期(blog.datatool.dev)。
4. 生态内空位:relay-devkit API 客户端不支持 OpenAPI 导入(仅 cURL);mock-server 只有 mock 侧的 OpenAPI 导入;无任何合同校验/diff 能力。

## 三、MVP 范围(做什么/不做什么)

**做**:
1. **导入**:粘贴 YAML/JSON 文本、拖入文件、URL 拉取(service 原生 fetch 免跨域)→ 解析 + 明确错误定位;支持 OpenAPI 3.0.x 为主(3.1/2.0 尽力解析并标注)。
2. **浏览**:端点树(tag 分组)→ 详情(参数表/请求体 schema/响应 schema/示例值);$ref 内部引用按需解析(循环安全,深度上限);外部文件 $ref 明确报「暂不支持」。
3. **调试**:环境(server baseUrl + auth:Bearer / API key(header|query) / Basic)→ 参数表单 → body 按 schema 生成示例(可编辑)→ service 代理发送 → 响应渲染 + **合同校验报告**(状态码不在合同/字段类型漂移/必填缺失/枚举越界,严重度分级)。
4. **对比**:任选两个已导入合同 → 端点增删/参数变化/必填变化/类型变化/响应码增删/security 变化,breaking 标红。
5. **AI MCP 5 工具**:`oadesk_specs` / `oadesk_endpoints` / `oadesk_call` / `oadesk_verify`(调用+校验,核心差异化) / `oadesk_diff`。
6. 调用历史(最近 60 条,掩码)与最近响应可回读。

**不做**:请求集合编排、自动化测试用例、mock 服务(已有 mock-server)、合同编辑器、3.1 完整 JSON Schema 语义、外部文件/URL $ref 解析、响应历史 diff。

## 四、架构(全部复用 house 配方)

- **service/main.js**(唯一执行权威):js-yaml 解析(bundle 进 `service/vendor/yaml-bundle.js`,zip 不带 node_modules)、$ref 规范化、请求构造与发送(node fetch)、schema 校验、diff;单槽信箱 `oadesk.cmd`→`oadesk.res`(TICK 500ms);健康端点 `/__health`;自落盘日志 512KB 轮转。
- **shared/openapi-core.js**(零依赖纯函数,面板/MCP 测试可共用):解析入口、端点提取、示例生成、schema 校验器(中文报告)、diff 规则引擎、掩码。
- **敏感边界**:auth token/密码只存服务内存 + 本地文件 `{{appConfigDir}}/openapi-desk/envs.json`(与宿主 config.json 同信任域);落 kv/日志/AI 返回全掩码(`****last4`)。
- **panel**(React,esbuild external react):四 Tab(合同库/接口浏览/调试/对比),纯 kv 读写(经宿主 invoke)天然跨端。
- **mcp/server.js**(stdio 零依赖):只投递命令并等回执,与面板共享 kv 事实库;AI 只能对已导入合同的端点发请求(不接受任意 URL);默认 timeout 上限护栏。

## 五、数据契约(kv 键空间,前缀 `oadesk.`)

`meta`(心跳) / `specs`(合同索引) / `spec.<id>`(规范化合同 JSON) / `envs`(环境掩码视图) / `latest`(最近响应+校验报告) / `history`(≤60) / `req.<id>`(≤30) / `cmd`/`res`(信箱)。

## 六、验收(可执行)

1. `node test/core-tests.mjs`:解析(3.0 yaml/json/2.0 兼容)/示例生成/校验器(类型漂移/必填缺失/枚举越界/nullable)/diff(新增 required 参数=breaking 等 ≥30 断言)。
2. `node test/service-tests.mjs`:信箱往返/spec 导入落库/请求构造正确性(URL 拼接/参数注入/auth header)/掩码不变量。
3. `node test/mcp-tests.mjs`:5 工具注册/调用回执/无合同引导文案。
4. `node test/panel-ssr.mjs`:面板 SSR 渲染不抛错(house 配方)。
5. `node test/smoke-real.mjs`:真桥冒烟(需宿主在跑):导入 petstore 3.0 官方 spec → 列端点 → 调用本地 mock 端点 → 校验报告产出 → 自清理键集。
6. `pnpm typecheck` + esbuild 构建成功;`node scripts/pack.js plugins/openapi-desk` 出 zip。
7. 发布五步链(zip/update.json/index.json @main/commit/push+purge+三验 200)。

## 七、风险与止损

- 真实 spec 千奇百怪(2.0 混 3.0 字段、非标 extensions):解析失败必须给出「哪一行哪个字段」的中文错误,绝不静默吞;若常见 spec 解析失败率 >10%,收缩为「OpenAPI 3.0 JSON/YAML + 内部 $ref」并如实标注。
- 响应校验噪音:严重度分级(breaking 红/告警黄/信息灰),宽松后端多字段只记 info。
- 并行会话纪律:只动 `plugins/openapi-desk` + 本文档 + index.json 自己条目。
