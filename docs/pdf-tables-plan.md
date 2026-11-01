# 表格提取台（pdf-tables）选型与设计

> 2026-11-02 立项。方向硬约束自查：核心动作是「变换了什么」（PDF 表格 → Excel/CSV 数据），不是记录台账；非家庭生活类，合规。
> 命名纪律自查：显示名「表格提取台」为直白功能名；id `pdf-tables`。

## 一、候选池与筛选

已占域核对（71 插件全量 plugin.json 扫描 + 并行会话 WIP）：API 客户端/JSON/SQL/MySQL 管理（relay-devkit v1.5.1，其中数据库管理是**在线 mysql2 连接**而非本地文件分析）、日志诊断（log-lens，并行 WIP）、LLM 接口体检（llm-probe，并行 WIP）、MCP 调试（mcp-probe）、Webhook（webhook-station）、网络质量（net-sentinel）、主机监控（pocket-host）、磁盘空间（disk-radar）、文档检索（weibian）、密钥扫描（keyscan）、上下文打包（context-pack）、PDF 页级操作（zhifang：合并/拆分/旋转/取文字，**无表格提取**）、Excel 生成（gezhi：AI 造 xlsx，非 PDF 解析）。

| # | 候选 | 结论 | 关键原因 |
|---|---|---|---|
| 1 | **PDF 表格提取→Excel/CSV（全本地）** | ✅ **选定** | 商业验证最强（$16K/月 SaaS、$19-79/月定价带）、云端上传隐私痛点真实、本地无门槛方案缺位、生态零重叠、zhifang/gezhi 双先例技术路线现成 |
| 2 | docx 报告工厂 | ❌ 淘汰 | 证据弱于 #1（python-docx 模板模式已是成熟普及方案，无支付级痛点实证）；与 qimu/gezhi 同范式但需求频次更低 |
| 3 | 文件自动化管道（watch→规则→动作） | ❌ 淘汰 | 痛点真实但部署信任门槛高、调试成本高；log-lens 候选池已评 65 分未过线 |
| 4 | 本地数据 SQL 工坊（CSV/JSON→SQL） | ❌ 淘汰 | relay-devkit 的「SQL 工具/数据库管理」占位描述直接覆盖，前两届 plan 均判已占用，.adjacency 风险高 |
| 5 | 图表工坊（CSV→图表） | ❌ 淘汰 | 与 Excel/gezhi 场景重叠，独立价值薄 |
| 6 | 正则/编解码工具箱 | ❌ 淘汰 | 低痛感（59.5 分先例），relay-devkit 已含时间戳/JSON |
| 7 | 音频转写台 | ❌ 淘汰 | 依赖云 API key + 花费模型，本机离线场景不成立 |
| 8 | OpenAPI 工坊 | ❌ 淘汰 | swagger-ui/redoc 免费成熟，差异化薄 |

## 二、需求证据（可追溯，外部）

1. **手工抄录是常态且量化的痛**：r/productivity「Every month I have to copy PDF information to Excel」（每月 4 份对账单手工摘录）；r/AccountingDepartment 会计群体讨论对账单转 Excel 还是人工核对；Tofu 测算手工转换一份对账单 30+ 分钟。
2. **商业验证（付费意愿）**：对账单转换 SaaS 赛道——DocuClipper $39-79/月、CapyParse $29/月、StatementDesk $19/月、EasyBankConvert $49-159/月；r/SaaS 实证帖：一款 converter 月入 **$16K**，另一款 $12.5K-30K/月；免费层普遍限 5-50 页/月（页数焦虑即付费钩子）。
3. **隐私痛点真实**：iLovePDF 专门发文「Are my files safe using iLovePDF?」安抚上传焦虑——银行流水上传第三方服务器是用户真实顾虑；上述 SaaS 全部云端解析。
4. **本地开源方案门槛高**：Tabula 需 Java（官方公认痛点）；camelot/pdfplumber 需 Python + CLI/脚本能力；camelot 官方文档直言同类工具「nice output or fail miserably」且需手工选 flavor/area（SO 74429395 实例）。
5. **中文场景放大**：银行流水/对账单/报销单/政府报表以 PDF 交付是常态；WPS 把 PDF 转 Excel 做成会员付费点（大厂定价即需求背书）。

**内部适配证据**：本仓 zhifang 已验证 pdfjs 服务端文本抽取全链路（vendor + node stub + 真桥冒烟）；gezhi 已验证 exceljs.min.js（1.0MB）生成真 xlsx；piaoxia 已验证数电票解析需求真实存在——但它是**数电票专用**结构化解析，任意 PDF 表格仍是空白。

## 三、评分（0-5 × 权重 → 满分 100）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 痛点强度 | 20% | 4.5 | 30 分钟/份手工抄录；出错即对账事故；SaaS 定价带证明痛感 |
| 频率/覆盖 | 15% | 4 | 月频（对账周期）+ 报销季/审计季脉冲；财务/会计/小微/普通用户全覆盖 |
| 现有方案缺口 | 15% | 4.5 | 云端有但涉隐私+页数限制；本地开源要 Java/Python；GUI 一键本地方案缺位 |
| 差异化优势 | 15% | 4.5 | 全本地零上传（银行流水隐私）+ AI 一句话提取落盘 + 逐页预览勾选 + Polaris 常驻 |
| 收益 | 15% | 4.5 | 30 分钟→10 秒；xlsx 直接可求和（数字列自动转数值）；CSV/JSON 供管道 |
| 平台适配 | 10% | 5 | zhifang 同构（service 127.0.0.1+token / cap.kv / MCP stdio）；面板拖拽即用 |
| 可行性 | 5% | 4 | pdfjs 坐标级文本项 + 列对齐算法，纯 JS 零原生依赖；表格启发式有固有失准面（如实标注） |
| 成本 | 5% | 4 | 引擎维护集中单文件；启发式调参需真实语料迭代（列入已知限制） |
| **加权** | | **88.3** | |

## 四、产品定义

- **名称**：表格提取台（id `pdf-tables`）
- **一句话**：把 PDF 里的表格（银行流水/对账单/报表/论文附表）变成真正可求和的 Excel/CSV 数据——纯本地坐标级提取，逐页预览勾选，AI 一句话落盘，数据不出本机。
- **目标用户**：每月从网银/支付平台下载 PDF 流水再手工抄进 Excel 的个人与小微；收 PDF 报表要二次计算的办公者；让 AI 代劳数据搬运的 Polaris 用户。
- **MVP 范围**：拖入 PDF → 逐页表格检测与预览 → 勾选页 → 导出 xlsx（数字列自动转数值+表头样式+列宽）/ CSV（UTF-8 BOM）/ JSON；跨页续表合并（同构去重表头）；AI 三工具（info/extract/preview）；任务历史。
- **暂不做（如实边界）**：扫描件/图片型 PDF（无文字层明示拒绝，不做 OCR）；加密 PDF（拒绝，不破解）；横排双栏并置表格的分离（按单表格模型检出，预览可见人工判断）；线格（lattice）专属策略（对齐流式策略已覆盖绝大多数数字生成的表格）。
- **成功指标**：检测+提取典型 5 页流水 < 5 秒；导出的 xlsx 在 Excel/WPS 打开无修复提示、数字列可直接 SUM；无文字层文件 100% 得到明确中文拒绝而非空结果。

## 五、架构（复用 zhifang 全套家规模式）

```
面板（React，blob 注入）
  ├─ 数据面：cap.kv pdf-tables.*（宿主 invoke → router-dispatch）
  └─ 字节面：<input type=file> → base64 → POST http://127.0.0.1:<meta.port>/api/op（token）
服务（node，http 型 + /__health）：table-engine（pdfjs 坐标文本项 → 行聚类 → 列对齐 → 网格；
  exceljs 写 xlsx）→ 落盘输出目录 → 登记 history
MCP（stdio）：pdf_tables_info / pdf_tables_extract / pdf_tables_preview → 同一 table-engine
```

- **引擎双 op**：`detect`（只读分析，返回逐页表格候选：行列数/表头/前 5 行预览/填充率）；`extract`（按页勾选 + 格式落盘，永不覆盖）。
- **列对齐算法（stream 策略）**：pdfjs `getTextContent` 取坐标文本项 → 旋转归一 → y 聚类成行 → 行内项分段 → 跨行段起点聚类成列 → 行-列匹配（含窄列续行合并）→ 连续块取主表 → 质量指标（填充率）。
- **数值归一**：`1,234.56`/`-12.00`/`¥3,000` 形态在 xlsx 写为数值（可 SUM），CSV 保留原文；日期一律保留原文（格式动物园不猜）。
- **安全底线（与 zhifang 同三条）**：文件不出本机（127.0.0.1+token，零外网）；输入永不修改；输出永不覆盖（-2/-3）。kv 键空间 `pdf-tables.*`（settings 仅面板写 / meta 仅服务写 / history 仅服务+MCP 写）。

## 六、验收口径

1. 离线单测（core 纯函数）+ 引擎产物级验收（自造带真实坐标的表格 PDF fixture：等宽流水表/无格线对齐表/跨页续表/无表格页/扫描件模拟，断言网格内容与 xlsx 字节可被 exceljs 回读）。
2. MCP 内存桥全流程 + jsdom 渲染断言 + 真桥冒烟（真 kv + 真 HTTP + 快照式清理）。
3. tsc strict + esbuild 构建 + pack 出 zip。
