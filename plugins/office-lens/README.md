# Office 文档透视台（office-lens）

把本机 **docx / pptx / xlsx** 提取为 Markdown：面板拖拽即转，对话里的 AI 可直接用 MCP 工具读取 Office 文档。全程本地纯 JS 引擎，**零依赖、零外联、零 kv**，文件不出机器。

## 为什么需要它

- 把 Word/PPT/Excel 内容喂给 AI（问答、翻译、摘要、改写）是高频动作，但 AI 读不了 Office 二进制，手工复制粘贴会丢表格与层级（[microsoft/markitdown](https://github.com/microsoft/markitdown) ~50k stars 的存在证明该需求真实且巨大）。
- markitdown 是 Python CLI（要装环境）、在线转换器要上传文件（隐私风险）、pandoc 面向文档工程（参数恐惧）。本插件 = **零安装 + 全本地 + 与宿主 AI 原生集成**。

## 使用

**面板**：活动栏打开「Office 文档透视台」→ 拖入文件（或点击选择）→ 得到 Markdown + 统计 + 警告 → 复制 Markdown / CSV（xlsx）/ 发送到对话。xlsx 多工作表用标签页切换。

**AI 工具**（对话里直接说）：
- `olens_extract`：提取全文。参数 `filePath`（绝对路径，支持 `file://` 与 `~`）；xlsx 可选 `sheet`（名称或 1 起序号）与 `csv`（true 输出 CSV）。
- `olens_outline`：概览不产全文——docx 标题树 / pptx 每页标题 / xlsx 工作表清单（行列数+首行预览）。先 outline 再整提更稳。

## 提取能力

| 格式 | 支持 | 明确不支持（会进警告而非静默丢弃） |
|---|---|---|
| docx | 标题（outlineLvl/样式名双通道，中文样式名兼容）、粗斜体删除线、超链接（外链+锚点）、多级编号列表（decimal/letter/roman/bullet，含 startOverride 与层级复位）、表格（gridSpan 补空、vMerge 隐藏续格）、引用样式、脚注引用+定义配对、图片占位 | 图片内容（OCR）、图表/SmartArt、修订展开、嵌入 OLE、页眉页脚（有意跳过） |
| pptx | 按 presentation.xml 顺序、每页标题/正文/子标题、项目符号与自动编号层级、表格、演讲者备注、页码/日期/页脚占位符跳过 | 图片内容、动画/转场、母版继承样式 |
| xlsx | sharedStrings/inlineStr、布尔/错误值、日期（内置+自定义 numFmt，1900/1904 双历元，1900 闰年 bug 处理）、公式显示缓存值、合并单元格（值留左上）、稀疏行补空、27 列（AA）以上、多工作表、CSV 输出 | 图表、数据透视表、条件格式、超 128MB 单部件 |

旧版二进制格式（.doc/.xls/.ppt，OLE 复合文档）与 PDF **明确拒绝**并指引（PDF 用纸坊/表格提取台），不假装能读。

## 架构

```
plugins/office-lens/
├── shared/core.js      单一权威引擎（零依赖 CJS，面板/MCP 同源）
│   ├── zip 读取器        EOCD/中央目录/本地头；store+deflate；ZIP64 拒绝
│   ├── XML 拉解析器      实体白名单（自定义实体不展开）、节点/深度/文本上限
│   └── 三引擎            docx / xlsx / pptx → Markdown
├── mcp/server.js       stdio MCP（JSON-RPC 2024-11-05），两工具
├── src/Panel.tsx       拖拽 → 统计/警告/sheet 标签 → 复制/发送到对话
└── test/               fixtures（手写 OOXML zip）+ node:test 矩阵 + MCP 真桥
```

面板在浏览器内用 `DecompressionStream('deflate-raw')` 解压（Node 侧退级 `zlib`，经 `process.getBuiltinModule` 动态取用，保证 esbuild 浏览器打包无残留 require）。

## 安全姿态

- 解压总量 512MB / 单条 128MB / 条目数 2 万三重上限（zip 炸弹）；不解压落盘 → 无 zip-slip 面。
- XML 只解析预定义+数字实体，自定义实体按字面保留（billion laughs 失效）；节点数 40 万/深度 400 上限。
- 输入 ≤100MB；MCP 输出 ≤40 万字符（超限截断并声明，不撑爆上下文）。
- 零网络、零 kv、零磁盘写；`enabledByDefault` 但仅 `aiToolAccess` 权限。

## 测试

```bash
node --test test/run-tests.mjs   # 引擎矩阵（zip/XML/三引擎/嗅探/错误路径）
node test/mcp-verify.mjs         # MCP 真桥（spawn stdio 全链路 + filePath 分支）
```

## 已知限制

- 极端边角 OOXML 变体（第三方生成器产出的怪异 numbering/样式）可能进警告回退；核心 Word/Excel/PPT 产物已覆盖。
- `.docm/.xlsm`（宏文档）按同格式解析（宏部分自然忽略）。
- 图片仅占位计数，不做 OCR。
