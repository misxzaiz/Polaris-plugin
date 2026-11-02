# stack-lens 堆栈还原台 —— 选型与产品设计（2026-11-03）

## 一、选型过程（候选池 20 → 三强 → 定案 1）

### 方向硬约束过滤（2026-11-01 用户定案）
台账/记录/CRUD/生活管理类一律不入池。以下全部候选均为「变换/诊断/自动化」类。

### 初始候选池（生态饱和盘点后建立）
生态已有 89 个已交付插件（index.json 实测），技术工具带高度饱和：mock-server、diff-desk、
keyscan（并行会话刚交付）、data-query/flow-pipeline/process-desk（在建）。以下候选已剔除撞车项：

| # | 候选 | 处置 | 依据 |
|---|---|---|---|
| 1 | Mock 接口台 | ❌ 撞车 | plugins/mock-server 已由并行会话交付 v0.1.0 |
| 2 | Diff 对比台 | ❌ 撞车 | diff-desk 已交付（0c19fc7） |
| 3 | git 历史大文件透视 | ❌ 已覆盖 | repo-lens 八维体检含「历史大对象」 |
| 4 | 本地文件 SQL 台 | ❌ 撞车在建 | data-query（工作区在建，DuckDB） |
| 5 | 通用自动化流水线 | ❌ 撞车在建 | flow-pipeline（在建）+ task-runner 已有 |
| 6 | JWT/正则/Cron/时间戳小工具 | ❌ 已覆盖 | dev-toolbox 13 面板 |
| 7 | 数据库 Schema Diff | 落选 | 需活库、受众窄于三强 |
| 8 | OpenAPI 破坏性变更检测 | 落选 | 受众窄、触发频率=每次发版 |
| 9 | 依赖 license 合规扫描 | 落选 | 企业向，个人开发者弱需求 |
| 10 | 字体子集化 | 落选 | niche |
| 11 | 二维码工坊 | 落选 | 在线工具泛滥、差异化弱 |
| 12 | TLS 证书哨兵 | 落选 | domain-probe 近邻覆盖大半 |
| 13 | 接口响应断言台 | 落选 | api-bench/mock-server 近邻 |
| 14 | ReDoS 检测台 | 72 分 | 好方向但痛点触发频率低、正确实现偏研究级 |
| 15 | i18n 体检台 | 69 分 | 受众限于活跃 i18n 项目、JSX 解析误报维护重 |
| 16 | .env 漂移台 | 71.5 分 | dotenv-linter CLI 已良好覆盖 |
| 17 | 归档乱码修复台 | 75.5 分 | 真痛点（GBK zip）但 7-Zip 已可手动解决 |
| 18 | 数据脱敏台 | 82 分 | 强方向，列为第二备选（见下） |
| 19 | 编码诊断台（乱码修复） | 84.5 分 | 强方向，列为第一备选（见下） |
| 20 | **堆栈还原台 stack-lens** | **85 分** | **定案** |

### 三强加权评分（权重：痛点20/频率15/缺口15/差异15/收益15/适配10/可行5/成本5）

**堆栈还原台（85.0）**：痛点 4.5（线上事故排障被 `app.8f2a.js:1:88423` 卡住，每帧都是猜）；
频率×人群 3.5（所有发过 minified 前端产物的团队，每次排障触发）；缺口 4（Sentry 类服务要
把 map 传第三方云端，dev.to 有专文讲「不暴露给第三方」的本地还原需求；现成方案是自写
SourceMapConsumer 脚本或 sourcemaptools.com 网页版——map 是源码，贴网页=泄露）；差异化 4
（离线 + 目录扫描自动配对 + MCP 让 AI 分析报错时自己还原——平台独有）；收益 4.5（一帧
还原常直接定位根因，30 分钟猜→秒级）；适配 5（纯计算+fs 读，零端口出站、零外部服务）；
可行 4.5（bundle-lens 已验证 VLQ/mappings/sections/sourcesContent 全链路）；成本 4.5。

**编码诊断台（84.5）**：ftfy（Python）长期流行+被 Fedora/Arch 收包证明市场；Node/GUI 侧
空白；本仓多会话亲历 GBK 坑（记忆 ≥5 次）。落选原因：痛点强度低于还原台（困扰 vs 卡死），
且「正确修复」对不可逆乱码有边界，容易给用户错误安全感。

**数据脱敏台（82.0）**：GDPR/PIPL 需求真实、企业市场（DATPROF/Informatica/K2view）存在
证明付费意愿；离线是硬要求（不能贴 PII 上网）。落选原因：PII 检测召回做不好=负价值，
且 data-query（在建）已占据「本地数据文件」心智位。

### 为什么选堆栈还原台（决策记录）
1. **痛点强度最高档**：minified 栈不是「麻烦」是「卡死」——无法下手的排障。
2. **平台自证最强**：Polaris 主仓自己就是 sourcemap 重度产物仓库（每次构建 dist/ 多份
   .map）；宿主开发者自己就是目标用户，可真实自用验收（bundle-lens 的 realmap 测试已证
   实本仓 map 可解析）。
3. **实现风险最低**：bundle-lens 的 VLQ 解码/段式 map/sourcesContent/UTF-16 列处理代码
   可直接移植，坑已踩平（记忆 bundle-lens-plugin-delivered）。
4. **MCP 差异化独有**：AI 在会话中分析报错日志时，可自己调 stack_resolve 还原后再分析
   ——「AI 自助还原」是独立应用给不了的平台特性。
5. **隐私角度有据**：sourcemap 含完整源码，第三方网页工具=泄露面；本地离线是正当卖点
   （dev.to「without third-party exposure」、reddit sourcemaptools 帖均以此为痛点）。

### 最大不确定性与止损
- **不确定性**：用户手上是否有 .map（没有 map 的用户无感）。缓解：目录扫描（CI 产物/
  dist 目录普遍保留 map）+ 拖拽 + 粘贴 + URL 抓取四入口把门槛压到最低；README 明示前提。
- **止损**：若自用冒烟发现主流格式（Chrome/Node 栈 × esbuild/webpack map）还原正确率
  低于预期且不可修，停止交付，如实报告（不降低验收标准凑数）。

## 二、产品规格

- **名称**：堆栈还原台（id: stack-lens，端口 9890，kv 前缀 `stacklens.`）
- **一句话**：把「app.8f2a.js:1:88423」变回「src/api/user.ts:42:10」——粘贴错误栈 +
  指定 map 来源，秒级还原成可读源码位置与代码帧，全程离线、栈不落盘。
- **目标用户**：发过 minified 前端/Node 产物的开发者；不用错误监控服务或不愿把 map 传
  第三方的团队；排查用户上报日志/客服工单里压缩栈的人。
- **MVP 范围**：栈解析（Chrome/Node/Safari/Firefox 格式）、sourcemap v3（含段式 index
  map）、四种 map 来源（目录扫描含 sourceMappingURL 注释提取/拖拽上传/粘贴 JSON/URL
  抓取带上限）、逐帧还原+代码帧、map 体检（结构校验+覆盖率）、6 个 MCP 工具。
- **暂不做**：运行历史持久化（栈含敏感信息，明确不落盘）、监控告警、自动上传 map、
  minify 前后双向 diff、非 JS 栈格式。
- **成功标准**：标准格式栈解析 100%（夹具测试）；esbuild/terser 真实产物还原位置与
  已知基准一致；60MB map 秒级；真桥冒烟全绿。
