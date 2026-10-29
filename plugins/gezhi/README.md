# Excel 工坊 gezhi —— AI Excel 工厂

> 在对话里把数据、清单或资料，变成一套排版完整、**可继续编辑的真实 .xlsx 文件**。
> 面板无需 AI 也能用：粘贴 CSV/TSV → 自动识别 → 预览 → 本地构建下载。

## 一句话定位

原生 OOXML 直生引擎（非 CSV、非图片表格）：样式/列宽/数字格式/**真公式**/条件格式/冻结/筛选一次成型，零额度零会员，内容不出设备。

## 解决的真实问题

- **AI 给的 CSV 打开是乱码**：AI 工具导出的 UTF-8 CSV 在 Excel（默认按 GBK 解析）里中文即乱码——本插件直接产出 .xlsx，从根上不存在编码问题；面板打开 GBK 编码的 CSV 文件也能正确解码（`TextDecoder gb18030` 回退链）。
- **AI 输出的表格要手动搬**：复制粘贴丢格式、CF_HTML 粘贴错乱。对话里一句「帮我把这些数据做成 Excel」直接落盘真实文件。
- **在位者的额度墙**：云端 AI 表格工具按积分/会员收费；本插件构建全部本地完成，成本只是自己的 LLM token，且**面板侧零 token 也能用**。

## 核心能力

| 能力 | 说明 |
|---|---|
| 真实 .xlsx 交付 | 原生表头样式（5 主题）× 斑马纹 × 列宽按内容计算 × 数字格式（money/percent/date/int）× 冻结表头 × 筛选 |
| 真公式 | 行公式（`=B{r}*C{r}`，{r} 自动展开实际行号）+ 汇总行（`=SUM/AVERAGE/…`，改单元格自动重算）；`fullCalcOnLoad` 保证打开即重算 |
| 条件格式 | gt/lt/ge/le/eq/ne/contains × warn/good/bad 三色（expression 规则，Excel 原生持久化） |
| CSV/TSV 摄入 | RFC4180 状态机（引号转义/内嵌换行）、定界符自动探测（Tab/逗号/分号/竖线）、编码自动探测（UTF-8 → GB18030 → UTF-16LE/BOM）、列类型自动推断 |
| 公式注入防护 | 以 `= + - @` 开头的单元格文本强制按文本存储（richText），不会被 Excel 当公式执行 |
| 作品登记 | 面板与 AI 经 cap.kv 共享同一事实库（`gezhi.book.*`），路径复制/规格徽标 |

## 使用

### 对话（AI，5 个 MCP 工具）

```
xlsx_build   Sheet Spec → 真实 .xlsx 落盘 + 登记（arguments 即 spec，见 xlsx_guide）
xlsx_guide   spec 契约手册：字段/容量护栏/最小示例/台账配方
xlsx_recent  最近作品（标题/规格/路径/时间）
xlsx_reveal  在资源管理器中定位作品（仅限已登记路径；win/mac/linux 三平台）
xlsx_forget  删除登记（confirm=true；不删文件）
```

对话示例：「帮我把下面这些数据做成 Excel，按金额加合计行，大于 2000 的标黄」→ AI 组装 Sheet Spec → `xlsx_build` 落盘 →「用 xlsx_reveal 打开」定位。

### 面板（无需 AI）

1. **创作**：粘贴 CSV/TSV（或打开 CSV 文件）→ 自动识别行列与列类型 → 实时预览 → 「构建 .xlsx 并下载」（本地构建，浏览器下载）。
2. **作品**：对话生成与面板构建共享的登记列表。
3. **设置**：导出目录（与对话共享）、默认主题、隐私说明。

## Sheet Spec 契约（摘要）

```jsonc
{
  "title": "三月采购台账",          // ≤50 字，文件名与登记用
  "theme": "slate",                // slate/indigo/forest/crimson/plain
  "sheets": [{
    "name": "采购明细",             // ≤31 字符，禁 : \ / ? * [ ]
    "caption": "生成于 2026-10-29",
    "columns": [
      { "h": "品名", "type": "text" },
      { "h": "数量", "type": "int" },
      { "h": "单价", "type": "money" },
      { "h": "小计", "type": "money", "formula": "=B{r}*C{r}" }
    ],
    "rows": [["苹果", 12, 3.5]],
    "stats": [{ "label": "合计", "type": "sum", "cols": [1, 2, 3] }],
    "conditional": [{ "col": 3, "op": "gt", "value": 50, "style": "warn" }],
    "zebra": true, "freeze": true, "autofilter": true
  }]
}
```

容量护栏（超限报错引导拆分，绝不静默截断）：≤6 表 / ≤32 列 / ≤2000 行 / 单元格 ≤200 字 / 行公式 ≤120 字。

## 架构

```
shared/core.js    唯一计算权威（CJS 零依赖）：CSV 解析 / 类型推断 / spec 归一化 /
                  布局数学（列宽/区间/公式生成/条件 ref）/ 主题。面板与 MCP 共用，口径不漂移。
shared/render.js  渲染适配层：layout 输出 → exceljs Workbook（vendor UMD 单文件，零 npm 运行时依赖）
mcp/server.js     5 工具（stdio JSON-RPC）+ cap.kv 自发现（anchor→config→端口扫描）
src/              面板（React，esbuild bundle）：创作/作品/设置三 Tab + HTML 预览 + blob 下载
vendor/           exceljs 浏览器 UMD（node 与浏览器双端验证）
```

键空间：`gezhi.book.<id>`（作品登记）、`gezhi.settings`（导出目录/默认主题）。

## 安全与隐私

- 零外网请求、零后台服务、零遥测；xlsx 生成在本地进程/浏览器内完成。
- 文件只写用户设置的导出目录（缺省 桌面→下载→家目录探测），文件名净化防路径穿越。
- `xlsx_reveal` 只接受已登记作品路径（防任意目录弹窗），spawn 仅 explorer/open/xdg-open 三条白名单。
- 公式注入防护（`= + - @` 前缀文本强制 richText）。
- 删除仅删登记不删文件；冒烟/测试自清理、备份并恢复真实设置。

## 测试与验证（全部真实执行）

```
node --test test/run-tests.mjs   # 17 项：CSV/编码/推断/归一化/布局/文件名/列字母
                                 # + 产物级验收：spec→xlsx→python openpyxl 逐项断言
node test/mcp-verify.mjs         # 离线 MCP 全流程（mock cap.kv 桥）：8 组断言
node test/smoke-real.mjs         # 真桥冒烟（需宿主在跑）：自发现/落盘/登记/护栏/forget/清理
node test/harness-serve.mjs      # 面板 harness（真浏览器交互验证）
```

产物级验收覆盖：合并标题行、表头填充与字色、数字格式、日期/百分比类型、行公式、`=SUM` 汇总、双线上边框、冻结、筛选、条件格式规则与配色、列宽、**公式注入防护（`=危险公式` 存为文本）**、多 sheet、中文值。

## 已知边界

- 面板创作 Tab 单次一张表（多 sheet 工作簿走对话/AI）。
- 行公式只支持引用本行（跨行聚合请用 stats 汇总行）。
- 数字格式以 Excel numFmt 语法为准；`fmt` 非法字符（`"` `\`）会被拒。
- GB18030 解码依赖运行环境的完整 ICU（Node ≥14 默认带、Chrome/Firefox/Edge 均支持）。
