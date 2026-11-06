# 选型文档：Office 文档透视台（office-lens）

> 2026-11-06 · 第 15 轮热点发现。方向硬约束（2026-11-01 用户定案）：台账/记录/家庭生活类一律不进候选池；主攻工具/技术/调试诊断/自动化执行/内容变换。
> 核心动作判定：本插件的动作是「**变换**」——把 docx/pptx/xlsx 二进制文档变换为可读、可复制、可喂 AI 的 Markdown，不是「记录」——过闸。

## 一、生态饱和度盘点（先内后外）

Polaris-plugin 现 118 条目（index.json 实测），另有并行会话 WIP：data-mask（数据脱敏）、process-desk（进程台）——已避开。

| 既有插件 | 覆盖 | 与本选型关系 |
|---|---|---|
| zhifang 纸坊（用户 tier 9/10） | 本地 PDF **操作**（合并/拆分/旋转等） | 处理对象不同（PDF 变换 vs Office **提取**）；且 9 分证明「文档处理」车道成立 |
| pdftables 表格提取台 | PDF → 表格提取 | 仅 PDF；Office 三件套零覆盖 |
| data-query 数据查询台（tier 10/10） | CSV/TSV/JSON/JSONL/Parquet SQL | **不支持 xlsx**（plugin.json 描述实测确认） |
| context-pack 上下文打包台 | 仓库 → LLM 上下文包 | 面向源码目录，不解析 Office 二进制 |
| relay-devkit / dev-toolbox | 文本/JSON/时间戳小工具 | 无任何文档解析能力 |
| markdown-lens | Markdown 结构检查 | 输出侧质检，与输入侧提取互补 |

**结论：docx/pptx 的内容提取在 118 个条目里零覆盖；xlsx 提取同样空白（data-query 不支持）。**

## 二、候选池（≥10，全部过方向硬闸，全部查重后淘汰/入围）

| # | 候选 | 判定 | 依据 |
|---|---|---|---|
| 1 | **Office 文档透视台（office-lens）**——docx/pptx/xlsx → Markdown 提取，面板拖拽即转 + MCP 两工具让 AI 直接读本地 Office 文档 | ✅ **入围** | markitdown 50k stars 实证需求；生态空白；AI 工作流强耦合；纯零依赖可测；详见下文 |
| 2 | 二进制文件透视台（hex-lens：魔数/熵/chunk/嵌入数据） | ✅ 入围但让位 | 需求真实（binwalk 11k stars）但受众偏安全/取证，频次低于 Office 文档；可作为下一轮候选 |
| 3 | 数据库结构对比台（schema-diff） | ❌ 淘汰 | db-workbench 用户 tier 仅 2/10——数据库通用工具在此生态被验证低价值 |
| 4 | Docker 镜像层分析台（dive-lite） | ❌ 淘汰 | 依赖本机 Docker 工作流，docker-desk 已占容器视角；受众窄 |
| 5 | 字幕工具台（srt/vtt 调轴/转换） | ❌ 淘汰 | 频次不稳定（追番/做视频时才用）；媒体类与工具主线偏离 |
| 6 | EML 钓鱼体检台 | ❌ 淘汰 | mail-desk 已占邮件域；.eml 文件分析频次低 |
| 7 | npm 装前体检台（包体积预估） | ❌ 淘汰 | bundlephobia/dep-probe 覆盖大半；增量价值薄 |
| 8 | QR/条码工坊 | ❌ 淘汰 | 泛工具箱式小功能集合——dev-toolbox（tier 2/10）证明此类低分 |
| 9 | 危险模式代码扫描台（安全 preset） | ❌ 淘汰 | keyscan（密钥）+ deadcode-lens（死代码）+ repo-lens（卫生）已三面覆盖 |
| 10 | XML/XPath 调试台 | ❌ 淘汰 | XML 在本生态用户技术栈（Web/AI）中衰退；fontoxpath 集成增量小 |
| 11 | jq/JMESPath 变换台 | ❌ 淘汰 | data-query（SQL over JSON，tier 10）+ relay-devkit JSON 工具覆盖主场景 |
| 12 | TLS/SSL 证书诊断台 | ❌ 淘汰 | domain-probe 已含证书过期检查；data-mask 选型文档亦已否决深挖方向 |
| 13 | a11y 无障碍审计台 | ❌ 淘汰 | axe-core 大量规则需真实渲染引擎，jsdom 静态分析假阳性风险高，生产级不可达 |

## 三、需求证据（外部，可追溯）

1. **Microsoft markitdown**（[github.com/microsoft/markitdown](https://github.com/microsoft/markitdown)）：微软 2024 末发布，把 PDF/DOCX/PPTX/XLSX 转 Markdown **专为 LLM/RAG 管道**，~50k stars，微软增长最快的 Python 工具之一；社区已复刻 [Go 版 conductor-oss/markitdown](https://github.com/conductor-oss/markitdown)（12 格式转换器）、VS Code 扩展、教程文章——整个模式在被反复复制，需求真实性由微软下场背书。
2. **Word ↔ AI 聊天复制粘贴丢格式是持续性社区痛点**：[r/ClaudeAI 热帖「Why does Claude destroy the text formatting when pasting」](https://www.reddit.com/r/ClaudeAI/comments/1gh3wtv/why_does_claude_destroy_the_text_formatting_when)、[OpenAI 社区「ChatGPT's Copy-Paste Is BROKEN Again」](https://community.openai.com/t/redux-chatgpt-s-copy-paste-is-broken-again-why-isn-t-this-being-fixed/1404609)、[「How To Fix Messy ChatGPT Tables In Word」](https://officetoai.com/blog/why-chatgpt-output-looks-terrible-in-word)——正反两个方向（Word→AI、AI→Word）的格式搬运都是高频摩擦。
3. **docx 以难程序化处理著称**：[「Why Claude Can't Format Your Word Doc」](https://www.laurajg.com/ai-field-notes-from-a-gc/claude-for-word-the-plugin)指出 docx 是最难程序化处理的格式之一；mammoth.js（docx→HTML，5k+ stars）、pandoc（50k+ stars）的长青也证明提取侧需求。生态内旁证：ZCode 官方自带 documents:docx skill——AI harness 层面同样承认该缺口。

## 四、竞争格局

| 竞品 | 形态 | 缺陷（为何用户仍不满意） |
|---|---|---|
| markitdown | Python CLI/库 | 需 pip/uv 环境；独立进程，无法进 Polaris 对话；MCP 集成需自建 |
| pandoc | CLI | 参数恐惧；默认输出非面向 LLM 优化；无表格/幻灯片语义 |
| mammoth.js | JS 库 | docx→HTML 还需再转 md；无 pptx/xlsx；面向 HTML 语义不面向 AI |
| 在线转换器（smallpdf 等） | 网页 | **文件上传隐私风险**；批量/自动化不可能 |
| 手工复制粘贴 | 人肉 | 表格/层级/列表全丢，长文档不可行 |

**差异化定位**：① 零安装零依赖（插件即装即用，纯 JS 引擎）；② **MCP 工具让 Polaris 对话里的 AI 直接读本地 Office 文档**（竞品全部做不到与宿主 AI 的原生集成）；③ 全程本地，文件不出机器；④ 面板拖拽 3 秒出可复制 Markdown。优势可持续性：引擎为自研 OOXML 解析器，贴合宿主 AI 工作流是生态位壁垒。

## 五、评分（加权满分 100）

| 维度 | 权重 | 分 | 依据 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4 | AI 时代「把 Office 文档给 AI」是高频刚需动作；复制粘贴丢格式痛点有社区级实证（证据 2）；未到 5 分：有 markitdown 等可用替代，非无解之痛 |
| 频率与覆盖人群 | 15% | 5 | Office 三件套在中文办公环境无处不在；AI 重度用户每次拿到 docx/pptx 都会需要 |
| 现有方案缺口 | 15% | 4 | 竞品需环境/上传/手工；生态内零覆盖；但「能凑合」（装个 markitdown）故 4 |
| 可验证差异化优势 | 15% | 5 | 与宿主 AI 原生集成（MCP extract/outline）是竞品结构性做不到的；全本地隐私 |
| 用户收益与使用价值 | 15% | 4 | 拖拽即转 + AI 直接读文档，节省手工转换/粘贴修复时间；量化目标见 §6 |
| 插件形态适配 | 10% | 5 | 纯 JS 引擎零依赖、无服务无端口、MCP+面板双端标准形态，与 markdown-lens 同构 |
| 技术可行性 | 5% | 4 | OOXML=ZIP+XML，自研解析器风险点集中在列表编号/日期格式，有确定性测试护栏；4 分因 pptx rels 与 docx numbering 边角多 |
| 开发维护成本 | 5% | 4 | 一次性引擎成本可控；OOXML 规范面大，需克制范围（不支持项明确声明） |

**加权总分：86/100**（4×0.2+5×0.15+4×0.15+5×0.15+4×0.15+5×0.1+4×0.05+4×0.05 = 0.8+0.75+0.6+0.75+0.6+0.5+0.2+0.2 = 4.4 → 88 分制换算 88）。取整 **86~88 区间，远超交付线**。

## 六、MVP 范围

**做**：docx（标题 outlineLvl/样式名双通道、粗斜体删除线、行内代码、超链接、有序/无序列表含多级编号、表格含 gridSpan/vMerge 降级、引用块、脚注计数、图片占位+计数）；pptx（幻灯片标题/正文/演讲者备注/表格，按 presentation.xml 顺序）；xlsx（sharedStrings/inlineStr、日期 1900/1904 双历元+内置与自定义 numFmt 识别、公式显示缓存值+计数、多 sheet 选择、合并单元格降级、CSV 导出）；魔数嗅探（扩展名错误自纠）；旧版二进制格式（.doc/.xls/.ppt OLE）明确拒绝并指引另存；zip 炸弹/实体膨胀护栏；MCP `office_extract` + `office_outline`；面板拖拽/选择→统计+警告+复制。

**不做**（明确声明）：图片 OCR、图表/SmartArt 内容提取（计数进警告）、嵌入 OLE 对象、修订追踪展开、旧版二进制格式、密码保护文档、PDF（zhifang/pdftables 已覆盖）。

**成功指标**：断言矩阵 ≥100 全绿；MCP 真桥 13 类调用全通；拖拽→Markdown ≤3s（≤10MB 文档）；AI 经 office_extract 能回答文档内容问题（真宿主冒烟）；无假绿。

**最大不确定性**：真实 Word/PPT 生成的边角 OOXML 变体覆盖度。止损：MVP 只承诺「文本/表格/列表核心保真」，未覆盖项进警告而非静默丢弃；引擎模块化，后续增量补。
