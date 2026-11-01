# ocr-bench 文字识别台 · 选型与实施计划

> 2026-11-02 定案。方向硬约束对齐（工具/技术/变换类，非台账）。
> 一句话：把「图片/扫描版 PDF 里的文字」变成可复制、可搜索、可交给 AI 继续加工的文本——**全本地零上传、批量作业、AI 可直呼**。

## 一、产品定位

- **产品名称**：文字识别台（id: `ocr-bench`，命名纪律：直白功能名）
- **目标用户**：手里有扫描版 PDF/图片需要取文字的人——整理考试/技术资料的学生与研究员、处理扫描单据的办公者、想把截图里报错/代码取出来的开发者。
- **核心场景**：
  1. 一整个文件夹的扫描版 PDF → 批量识别出 txt；
  2. 中英混排截图/照片 → 一次性取文，直接粘贴或发给 AI 整理；
  3. 「这个 PDF 是扫描件还是文字版」——自动检测文本层，文字版直接抽取不浪费 OCR。
- **目前怎么解决**：
  - 在线 OCR 站（SmallPDF/iLovePDF 等）：上传隐私 + 页数/次数限制 + 水印 + 高清收费；
  - OCRmyPDF（~35k★）：能力最强但 Python CLI，Windows 普通用户门槛高；
  - 微信/PowerToys 截图 OCR：只覆盖单图应急，无批量、无文件输出、无 AI 管道；
  - 国产桌面软件（极光 PDF 等）：免费档限次数，完整能力收费。
- **独特价值**：本地 Tesseract（零上传）+ 批量 + 扫描 PDF 整卷处理 + 结果直接进 AI 对话（「把这份扫描件整理成 Excel」→ OCR 台提取 → 格致出表）。生态内 70+ 插件零 OCR 占位（image-recognition 是云 GLM-4V 看图说话，非精确文本提取）。
- **MVP 暂不做**：手写体/复杂版面重建/可搜索 PDF 回写（OCRmyPDF 高级形态）/表格结构还原（原生 PDF 表格已有 pdf-tables）。
- **成功指标**：清晰印刷体识别 confidence ≥80；单个 10 页扫描 PDF 全流程 ≤2 分钟；在线工具五步（注册→上传→等→下载→删）压缩成本地一步。

## 二、需求证据（可追溯）

| 证据 | 来源 |
|---|---|
| OCRmyPDF ~35,000 GitHub stars（本地 Tesseract 扫描 PDF OCR 的大规模需求实证），Python CLI 门槛即 GUI 空间 | github.com/ocrmypdf/OCRmyPDF |
| 免费 OCR 攻略类文章反复总结在线站三坑：水印/页数次数限制/高清收费；免费无限制路线一致推荐 OCRmyPDF+Tesseract（CLI 摩擦） | blog.csdn.net、zhuanlan.zhihu.com/p/512608524、cnblogs.com/pcdoctor/p/23450750 |
| 知乎「扫描版 PDF 转 Word」类问题持续高热度，推荐答案要么收费软件要么在线站 | zhuanlan.zhihu.com/p/74007195 等 |
| 本插件生态 70+ 插件零 OCR；pdf-tables 明确拒绝扫描件（其 README/边界声明），缺口有官方背书 | Polaris-plugin 生态盘点 |
| tesseract.js npm 长青（纯 JS WASM 移植，100+ 语言）本地 OCR 是 Node 生态标准答案 | npmjs.com/package/tesseract.js |

**关键假设与止损**：
- 假设 1：清晰印刷体识别质量可接受 → 尖峰实测 conf 87~89、中英全对（已验证）；若用户材料质量差（拍照倾斜/手写），confidence 会如实暴露并由 AI 工具明示，不虚报。
- 假设 2：扫描 PDF 可纯 JS 解码 → 尖峰 DCTDecode 路径实测通过；CCITT/JBIG2 依赖 pdfjs 内建解码器（同代码路径）。
- 止损：若真宿主冒烟发现引擎不稳，降级为「仅图片输入」仍成立；方向本身不依赖 PDF 分支。

## 三、候选池与评分（加权满分 100）

硬约束过滤后全部为工具/技术类。评分维度：痛点20/频率15/缺口15/差异化15/价值15/平台适配10/可行性5/成本5。

| 候选 | 得分 | 简评 |
|---|---:|---|
| **本地 OCR 台** | **81.5** | 频率高（资料/单据/截图常态化）、缺口明确（生态零占位+CLI摩擦）、尖峰全绿、平台适配完美（本地服务零跨域） |
| 代码热点透视（git churn×复杂度） | 77.0 | CodeScene €18-27/作者/月商业验证，但频率低（按重构周期），本轮备选 |
| PDF 表单批量填充 | 69.0 | 真实商业场景，但 AcroForm 覆盖率不可控、受众窄 |
| 编码修复台 | 62.5 | 7-Zip/convmv/Notepad++ 已覆盖大半，差异化弱 |
| SQLite 工作台 | 61.0 | DB Browser 免费成熟，仅剩 AI 语义差异 |
| 依赖体检台 | 60.5 | npm audit 免费标准品 |
| 域名/DNS/证书台 | 58.5 | mxtoolbox 免费，频率低 |
| 构建产物分析台 | 56.5 | 需 sourcemap 配合，受众内卷 |
| Mock API 台 | 55.0 | Mockoon 成熟开源 |
| jq/JSON 管道 | 52.0 | jq CLI 已是习惯 |

## 四、架构（对齐 house 范式：api-bench 服务 + pdf-tables vendor）

```
用户 → 面板(dist/panel.js) → 127.0.0.1+token → service/main.js（单写者）
                     └→ MCP(mcp/server.js) → kv 信箱 → 同一引擎同一报告库
service ─ require → shared/core.js（纯逻辑：发现器/像素变换/任务机，可单测）
        ─ vendor → tesseract.js7 + core wasm（simd-lstm×2 变体裁剪）
                 → pdfjs.min.js（页图提取 + 文本层检测，含 pdf.worker.js 同目录）
                 → tessdata/{chi_sim,eng}.traineddata.gz（内置 fast 档 ~3.7MB）
kv（ocr-bench.* 单写者）：meta（端口/token）/ jobs（任务态）/ history（报告环形40条）
语言包按需下载：service 直接 https jsdelivr tessdata_fast → gzip 落 appConfigDir/ocr-bench/langs
  （唯一外网流量=模型文件本身，图像数据永不外发——架构级保证）
```

- **像素管线**：pdfjs `getOperatorList` → `paintImageXObject` → kind 1(1bpp)/2(RGB)/3(RGBA) → RGBA → 纯 JS PNG 编码器（zlib+crc32）→ tesseract；页 /Rotate 90/270 → 像素转置校正。
- **文本层检测**：`getTextContent` 字符计数，>30 字符/页判文字版直接抽取（快速路径，不烧 CPU）。
- **并发**：两个 tesseract worker（createScheduler）串行分页分发；单任务互斥、可中止。
- **护栏**：单任务≤200 文件、PDF≤500 页、单图≤50MB、无定时任务、输出目录根边界校验（weibian 先例）、文件名/路径不入日志明文（截断脱敏）。
- **跨端**：报告落 kv，手机/Web 可读历史摘要；发起仅桌面（图片选择本地语义）。

## 五、验证口径（五层 + 真桥）

1. core 单测：PNG 编码器往返、1bpp/旋转转换、发现器（扩展名/去重/排序）、文本层阈值判定、任务状态机（互斥/中止/失败归因）、语言包清单解析；
2. SSR 渲染：三 Tab/护栏文案/离线态/结果卡断言；
3. 假桥集成：真实引擎跑真实 fixture（中英图文 PNG + DCT/Flate 扫描 PDF）逐项断言；
4. MCP 协议：六工具 initialize/tools/list/tools/call 全链路；
5. 真桥冒烟：真实 kv 落 meta → 真实识别 fixture → MCP 真子进程 → 全绿自清理。

fixture 生成：PowerShell System.Drawing 渲染中英文本（已验证 tesseract 识别全对），DCT/Flate 扫描 PDF 用最小 PDF 构造器生成（尖峰已验证解析）。
