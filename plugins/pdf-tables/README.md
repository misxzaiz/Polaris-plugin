# 表格提取台 pdf-tables —— PDF 表格 → Excel/CSV（全本地）

> 把 PDF 里的表格（银行流水/对账单/报表/论文附表）变成**真正可求和的 Excel 数据**：纯本地坐标级提取，逐页预览勾选，AI 一句话落盘，数据不出本机。

## 为什么是它

- 「每月把 PDF 流水抄进 Excel」是会计/小微/普通用户的常态痛点（手工一份 30+ 分钟）；对账单转换 SaaS（DocuClipper $39/月、CapyParse $29/月等）全部**云端解析**——银行流水上传第三方服务器即隐私泄露面，免费层还限页数。
- 本地开源方案（Tabula 需 Java、camelot/pdfplumber 需 Python）对普通用户门槛高。表格提取台长在你已经开着的 Polaris 里：零账号、零上传、零次数限制、零 Java/Python。
- 竞品没有「对话式提取」：对 AI 说「把桌面上这份流水的表格提取成 Excel」，一句话落盘完成。

## 功能

| 能力 | 面板 | AI（MCP） | 说明 |
|---|---|---|---|
| 表格检测 | 拖入即检，逐页预览网格（表头+前 5 行+填充率） | `pdf_tables_info` | 只读不产生文件；无表格页如实标注 |
| 提取落盘 | 勾选页 → xlsx/csv/json/all | `pdf_tables_extract` | xlsx 表头冻结加粗+列宽自适应；**数字列自动转数值（1,234.56 → 1234.56，可直接 SUM）** |
| 读数给 AI | — | `pdf_tables_preview` | markdown/tsv 返回（跨页合并），AI 直接核对金额 |

**跨页续表合并**：按页导出的流水（每页重复表头）自动拼成一张完整表（同构表头去重）；关掉开关则逐页独立输出（sheet 名带页号）。

**ID 形态护栏**：≥11 位无分隔符纯数字（手机号/账号/流水号）不转数值——避免 Excel 科学计数法毁显示；金额口径（千分位/小数点）正常转。

## 安全与隐私（三条硬底线）

1. **文件不出本机**：服务只监听 `127.0.0.1` + 自生成 token；零外网请求；引擎全本地（pdfjs + exceljs，随插件分发，含 GB 系 cmap）。
2. **输入永不修改/删除**：所有操作读入内存 → 另存新文件。
3. **输出永不覆盖**：同名自动 `-2/-3` 递增；输出名经消毒（Windows 保留名/非法字符/路径成分全拦截）。

## 能力边界（明确不做假功能）

- **扫描件/图片型 PDF**：无文字层时明确拒绝（不做 OCR）。
- **加密 PDF**：直接拒绝（不破解）。
- **线格(lattice)专用策略**：采用文本对齐策略（stream），已覆盖数字生成的表格（流水/对账单/报表导出）；纯扫描+无对齐列的复杂版面会如实报「未检出表格」。
- **横排双栏并置表格**：按同一网格模型检出（预览可见），不做分栏拆分。

## 架构

```
面板（React，blob 注入）
  ├─ 数据面：cap.kv pdf-tables.*（宿主 invoke → router_dispatch）
  └─ 字节面：<input type=file> → base64 → POST http://127.0.0.1:<meta.port>/api/op（token）
服务（node，http 型 + /__health）：table-engine（pdfjs 坐标文本项 → 行聚类 →
  区间重叠列聚类 → 续行合并 → 连续块取表；exceljs 写 xlsx）→ 落盘输出目录 → 登记 history
MCP（stdio）：3 个 pdf_tables_* 工具 → 同一 table-engine → 落盘 → 登记 history
```

面板与 AI 共用同一引擎（`service/table-engine.js`）与同一份任务台账，口径不漂移。输出目录优先级：MCP 参数 `outputDir` > 面板设置 `outDir` > 源文件目录 > 桌面（探测链含 OneDrive 重定向）。

## 键空间契约（权威表）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `pdf-tables.settings` | **仅面板** | 服务/MCP（每 op 热读） | `{outDir, maxUploadMB, historyCap, format, mergePages}` |
| `pdf-tables.meta` | **仅服务** | 面板（端口/token）、MCP | `{token, port, version, pid, startedAt, lastTickAt, bridge}` |
| `pdf-tables.history.<ts-rand>` | **仅服务/MCP 工具层** | 面板只读 | 任务台账，环形 cap（`{id,at,op,source,inputs,outputs,tables,rows,ms,ok,error?}`） |
| `pdf-tables.cmd` | 面板写 | 服务消费（先删后做） | `{action:'clearHistory'}` |

## 开发

```bash
npm install
npm run typecheck && npm run build     # tsc strict + esbuild 面板
node --test test/run-tests.mjs         # core 离线单测（17）
node test/engine-verify.mjs            # 引擎产物级验收（22，pdf-lib+等线字体自造中文流水 fixture → exceljs 回读）
node test/mcp-verify.mjs               # MCP stdio 全流程（16，桥降级路径）
node test/render-verify.mjs            # 面板 SSR 渲染断言（24）
node test/smoke-real.mjs               # 真宿主冒烟（10，需 Polaris 运行中；不可达时如实 skipped）
node test/real-pdf-check.mjs <pdf路径> # 真实 PDF 抽查（只读，开发辅助）
```

## 已知限制

- 表格检测是启发式（文本对齐策略）：极不规则排版/图片混排的「表格」可能检不出或列错位——面板预览即所见即所得，检出质量以预览为准。
- 金额/日期不做语义猜测：`1,234.56` 转数值，`2026-01-02` 保留原文（日期格式动物园不猜）。
- 中文 CID 字形映射依赖 vendor/cmaps（GB 系 18 个）；未内嵌 ToUnicode 且用日韩 cmap 的 PDF 不在覆盖范围。
