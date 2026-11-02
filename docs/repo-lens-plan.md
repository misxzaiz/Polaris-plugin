# repo-lens 仓库体检台 · 选型与实现方案

> 2026-11-02 定案。候选池 14 个（全部通过方向硬闸：核心动作=诊断/变换/自动化，零台账类），加权评分后主选本方向。

## 1. 产品定位

- **名称**：仓库体检台（id `repo-lens`）
- **一句话**：把「这个仓库哪里最该重构、哪里最危险、AI 改哪里容易翻车」从手搓 git 命令变成一次 60 秒的本地体检。
- **目标用户**：接手陌生代码库的开发者、重构决策者、用 AI 写码需要风险基线的个人团队。
- **核心场景**：
  1. 接手/审计陌生仓库 → 先看热点地图与巴士因子，判断「雷在哪、谁懂这里」；
  2. 重构排期 → 用 churn×复杂度证据定位投入产出最高的文件；
  3. AI 改码基线 → AI 高频改动的复杂文件是回归重灾区，先体检再放手让 AI 改。

## 2. 需求证据（外部调研，2026-11-02）

- **手搓仪式普遍化**：r/softwarecrafters 专帖《The Git Commands I Run Before Reading Any Code》——`git log` 统计最常改动的 20 个文件是开发者读码前标准动作；SO「Code churn for git repository」同问法。
- **方法论成熟**：churn × complexity = hotspot（Adam Tornhill《Your Code as a Crime Scene》、understandlegacycode.com 教程）；arXiv 2026 评测论文引用「Forensic Technical Debt Analyzer（stench × churn）」。
- **付费意愿被证实**：CodeScene（同一方法论的商业实现）面向中小团队收费持续经营；G2 有完整评测条目。
- **供给端真空**：code-maat（Clojure，实际停更，SourceForge 2025-07 才有镜像活动）→ CodeCharta 可视化仍依赖它 + SonarScanner 多工具管线；git-quick-stats 只有数字无复杂度联结；SonarQube 要服务器且默认无历史维度。**调研结论原话：不存在一个维护良好的 code-maat 替代品。**
- **AI 时代新增动机**：2025-2026 多篇文章（CodeAnt、Smonic、Hivel 等）把「AI 评审前先建立热点/风险基线」列为标准动作——本插件是这一步的零配置落地。

## 3. 竞争格局与差异化

| 方案 | 缺陷 |
|---|---|
| code-maat | Clojure 运行时门槛、只出 CSV、无可视化、停更 |
| CodeCharta | code-maat + SonarScanner 多工具管线，配置重 |
| CodeScene | 商业收费；桌面/云部署重 |
| git-quick-stats | 纯统计数字，无复杂度/耦合/重复 |
| 手搓 git 命令 | 每次重写管道，无沉淀、无钻取、无 AI 接口 |

**差异化**：零配置（给路径即出报告）+ 可视化钻取（气泡图/文件下钻）+ 时间耦合（共变文件对=隐藏依赖，竞品管线里最易被忽略的维度）+ MCP 七工具对话式考古（「这仓库最该重构哪三个文件？」）+ 报告落 kv 三端可看。本插件核心动作是**诊断**（输入仓库路径，输出可解释证据），非记录。

## 4. 落选候选（备查）

- CSV/编码清洗台（72）：iconv/utf-8-sig 解法知识已普及，痛感被稀释。
- OpenAPI 契约检查台（70）：oasdiff 活跃维护且商业化（778 规则），正面追赶护城河弱。
- 端口/进程诊断台（66）：pocket-host 已覆盖按端口杀进程，范围撑不起独立插件。
- 假数据/脱敏台（65）、JSON Schema 台（63）、编解码军刀（60）、其余 ≤58。

## 5. 架构（dep-probe / stream-desk 已验证三方范式）

```
面板 ──(127.0.0.1 直连 + Bearer，轮询进度)──▶ 服务(node，spawn git 只读)
MCP  ──(kv 读 repolens.meta 拿 port/token → 127.0.0.1 直连)──▶ 服务
服务 ──(kvclient → 宿主 router_dispatch → cap.kv)──▶ 宿主
```

- `shared/core.js`（CJS 同构纯函数）：numstat 解析（含 rename/二进制）、近似复杂度（分支关键词+嵌套深度，按语言族）、churn 归并、热点评分（churn×complexity 线性归一混合）、时间耦合对、重复代码块（归一化行哈希窗口）、提交卫生、巴士因子、健康分、kv 投影截断、离线自检 fixture。**无任何 IO。**
- `service/main.js`：127.0.0.1:9879 + Bearer（timingSafe）；git 子进程白名单（log/ls-files/rev-list/cat-file --batch-check/for-each-ref，全只读，`-c core.quotepath=false`）；扫描单飞行；meta 心跳 60s；kv 投影；degraded 模式（宿主不可达照常扫描）。
- `mcp/server.js`：stdio JSON-RPC 八工具（repo_scan/report/hotspots/file/couples/hygiene/runs/selftest），经 `repolens.meta` 直连；env `REPOLENS_SERVICE_URL/TOKEN` 测试钩子。
- `src/`：React 面板（扫描/总览/热点/体检/历史五 Tab；SVG 气泡图 x=churn y=复杂度 r=LOC；文件下钻含周粒度变更时间线）。

## 6. 分析维度与口径（v1）

1. **热点**：churn（提交数+增删行）× 近似复杂度（分支 token 计数 + 最大嵌套深度启发式，标注为近似）→ 0-100 混合分（0.25·churnN + 0.25·cxN + 0.5·√(churnN·cxN)）。
2. **时间耦合**：同提交共现对，`coCount/min(degA,degB) ≥ 0.5 且 coCount ≥ 3` 入选（"一起改 = 假装独立"的隐藏依赖）。
3. **重复代码**：归一化行（剥注释/折叠空白）6 行窗口哈希，跨文件/同文件远距 ≥2 处入选，合并重叠窗口。
4. **历史大对象**：`rev-list --objects --all` + `cat-file --batch-check` top 30。
5. **提交卫生**：conventional commits 遵循率、草率消息（wip/tmp/过短）、巨提交（≥20 文件）占比。
6. **巴士因子**：贡献 50% 提交的作者数（全局）+ 热点文件 top 作者占比。
7. **陈旧分支**：for-each-ref 按 committerdate，>30 天算陈旧。
8. **健康分**：热点集中度 25% + 重复率 20% + 提交卫生 25% + 巴士因子 15% + 历史大对象 15%，各分量 0-100 加权。

## 7. 安全模型

- git 子命令白名单，全只读，不接受任何传入 git 参数；spawn 无 shell；`windowsHide`。
- 服务仅 127.0.0.1；`/__health` 外全 Bearer token（timingSafe）；零外网出站。
- 唯一写盘 = kv 投影（经宿主）；不写仓库任何文件。
- 路径为用户显式输入；扫描上限（文件 3000/总字节 30MB/提交 2 万/单文件 1MB）防失控。
- 复杂度为启发式近似，报告与 README 明示口径，不冒充精确圈复杂度。

## 8. 里程碑与止损

- M1 core.js + 离线单测全绿；M2 服务 + fixture 仓集成测试；M3 MCP 全链路；M4 面板 + typecheck + esbuild；M5 真桥冒烟（Polaris 本仓实测）+ 五步发布链。
- **止损**：若 Polaris 本仓（约 2.5k 文件）扫描不能 <60s 出可解释报告，收缩为 churn-only + 卫生体检。
- **成功标准**：核心流程（填路径→出报告→下钻→AI 解读）全程无错误；单测/typecheck/构建/真桥四层全绿；报告字段可被人工抽查复核（与 `git log --numstat` 手算对账）。
