# 装修台账（zhuangxiu）产品与工程方案

> 2026-11-01 · v0.1.0 · 生态第 60 插件选型（59 插件饱和盘点 → 4 候选 → 加权评分 90 胜出）

## 一、选型依据（市场证据）

**候选与评分**（权重×分数，满分 100；证据见括号）：

| 候选 | 痛点强度 20% | 频率 15% | 现有缺口 15% | 差异化 15% | 收益 15% | 平台适配 10% | 可行 5% | 成本 5% | 总分 |
|---|---|---|---|---|---|---|---|---|---|
| **装修台账** | 5 | 3 | 4 | 5 | 5 | 5 | 5 | 4 | **90** |
| 宠物档案 | 4 | 5 | 2 | 3 | 4 | 5 | 5 | 4 | 77 |
| 健身日志 | 3 | 4 | 2 | 2 | 4 | 5 | 5 | 3 | 66 |
| 旅行规划 | 3 | 2 | 3 | 3 | 3 | 4 | 4 | 3 | 60 |

- 落选理由：宠物（爪记 Zoji 已覆盖疫苗/驱虫/体重/共享，缺口弱）；健身（练就获 App Store 编辑推荐、奔湃等成熟，无显著优势）；旅行（无地图 API 硬伤、Wanderlog/Notion 模板拥挤）。
- **装修需求证据**：
  - 千库网 13368 个装修记账 Excel 模板可供下载；Reddit r/kitchenremodel 主动求模板——PC 侧无好工具，Excel 手工维护是主流。
  - 新华网：低价签约后增项致预算超支 30%+；知乎：报价单故意漏项清单（拆改/垃圾清运/包立管/过门石/美缝/防水），后期「合同里没包含」加钱。
  - 豆瓣「相见恨晚的记账神器+自动预算表」：有效方法论 = **逐项报价预算表 + 每笔当天入账 + 与合同报价比对盯增项**——正是本插件的三个核心能力。
  - 现有专用 App（装修预算表/装修记账）小众且手机端为主；通用记账（随手记等）装修分类要自建、无预算对比/增项/供应商维度；团团记账有闪退与收费投诉。
- **关键不确定性**：装修是低频生命周期事件（单项目 3-12 个月），项目结束使用归零。对冲：项目期内日频价值 + 金额大（数十万）+ 与泉府（贷一次管 30 年）同一价值形态。MVP 验证假设 = 「预算 vs 实际对比 + 增项合计」是否被持续使用；不成立则止损（插件不扩展多项目/报价对比等深度功能）。

## 二、产品定义

- **显示名**：装修台账（直白功能名，对齐 3ec0325 命名口径）；id/kv 前缀/工具前缀：`zhuangxiu` / `zhuangxiu.` / `zx_`
- **一句话**：把「装修公司的报价单、记不全的每笔开销、总在涨的增项、说不清的工期节点」变成一本可对话、会对比预算、能盯住增项的家庭装修账。
- **目标用户**：正在/即将装修的家庭（决策人 + 出资人）；次 要：翻新/局部改造。
- **MVP 范围**：单项目；科目预算 vs 实际支出对比（红/黄/绿）；增项识别与合计；供应商档案；工期节点红黄榜；常见漏项检查；对账小结。
- **明确不做**：多项目、报价单 OCR/文件导入、账单分摊、施工图、与装修公司系统对接、支付对接（纯手工/AI 录入）、提醒推送（面板红黄榜 + AI 查询承担）。

## 三、架构（复用 maian 已验证三件套模式）

```
面板(4Tab) ──__POLARIS_HOST_INVOKE__→ router_dispatch → cap.kv ─┐
MCP server(stdio,零依赖) ──kvclient 自发现桥──→ cap.kv ──────────┤
shared/core.js 纯函数唯一口径（normalize×4 · budgetCompare · extraDigest ·
  missingCheck · milestoneLevel · buildSummary · TEMPLATE）← 双方同源 ─┘
```

- **键空间契约**（每记录一键，单命令原子写，无数组读改写/无跨日迁移）：
  - `zhuangxiu.project` 单项目对象 `{id,name,house?,totalBudget?,status,startDate?,…}`
  - `zhuangxiu.cat.<id>` 科目 `{id,name,group,budget?,isExtra,order,…}`
  - `zhuangxiu.exp.<id>` 支出 `{id,catId,amount,ts,vendorId?,payMethod?,note?,src,…}`
  - `zhuangxiu.ven.<id>` 供应商 `{id,name,role?,phone?,contractAmount?,note?,…}`
  - `zhuangxiu.mile.<id>` 节点 `{id,title,date,done,note?,…}`
- **科目组**（固定 10）：前期/拆改/水电/泥瓦/木工/油漆/主材/家具家电/软装/其他。
- **标准模板** 25 科目（内嵌反漏项清单：垃圾清运/包立管/防水/过门石/美缝/物业押金管理费/开荒保洁……），`zx_category action=template` 一键采用；`missingCheck` 对照 COMMON_MISS 提示预算单缺了哪些常被漏掉的科目。
- **增项口径（唯一）**：科目 `isExtra=true` ⇒ 其全部支出计入增项合计。`zx_record` 科目不存在时拒单并引导建增项科目；`asExtra:true` 一步建增项科目并记账。
- **标色口径（唯一）**：spent>budget 红；spent≥90% 黄；budget 未定灰；其余绿。节点：过期未完红；3 天内黄；已完成绿。

## 四、MCP 工具（8 个）

| 工具 | 用途 | 关键约定 |
|---|---|---|
| `zx_record` | 记支出（科目按名解析，vendor 按名自动建档；id 幂等覆盖） | 返回该科目预算执行快照 + 增项提示 |
| `zx_category` | add/set/remove/list/**template**（一键标准模板）/project（项目档案与总预算） | remove 有支出拒单；remove 需 confirm |
| `zx_query` | budget/recent/extra/vendors/milestones/**missing** 六视图 | 只查不建 |
| `zx_vendor` | add/set/list | — |
| `zx_milestone` | add/set/done/list | — |
| `zx_update` | 按 id 改支出（科目可迁移） | — |
| `zx_delete` | 删支出/科目/供应商/节点（confirm 门） | — |
| `zx_summary` | 对账小结 markdown（总执行/超支榜/增项/供应商/节点/漏项提示） | 只查不建 |

## 五、验收

1. `node test/run-tests.mjs` 纯函数单测全绿（normalize 边界/标色/增项/漏项/节点/小结形状）。
2. `node test/mcp-bridge.mjs` stub 宿主 + 真 server.js 全链路（template→record→幂等→asExtra→六视图→改/删 confirm→小结→非法入参拒绝）。
3. `node test/harness-run.mjs` jsdom 真 bundle 渲染冒烟（四 Tab + 记一笔写库 + 编辑弹窗）。
4. `node test/smoke-real.mjs` 真宿主（9829）冒烟自清理；`npm run typecheck` strict 通过。
5. `node scripts/pack.js plugins/zhuangxiu` 产 zip + sha256；index.json 插条目（留工作区，防并行会话冲突）。

## 六、安全与边界

- 零外网请求、零服务进程、数据不出本机（cap.kv）；电话号码等供应商信息仅本地存储。
- 写幂等（id upsert）；删除一律 confirm 门；科目有支出不可删（防断链）。
- 工具描述明确：不提供造价咨询与合同法律建议，对账结果用于家庭自查。
