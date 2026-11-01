# 文字识别台（ocr-bench）

把「图片/扫描版 PDF 里的文字」变成可复制、可搜索、可交给 AI 继续加工的文本——**全本地识别，图像数据永不外发**。

## 它解决什么

- 扫描版 PDF/图片要取文字：在线 OCR 站有上传隐私、页数/次数限制、水印与收费；OCRmyPDF（~35k★）能力最强但需要 Python CLI；微信截图 OCR 只覆盖单图应急。
- 本插件把 Tesseract 内核（纯 WASM，零原生依赖）装进 Polaris：文件夹批量、扫描 PDF 整卷、结果直接落 txt 或进对话继续加工（「把这份扫描件整理成 Excel」→ 识别 → 格致出表）。
- **文字层直读**：文字版 PDF 自动检测（≥30 字符/页）直接抽取文本，不烧 OCR、不损精度；扫描页才走识别。

## 核心能力

| 能力 | 说明 |
|---|---|
| 输入 | png/jpg/jpeg/bmp/webp/tiff/pnm 图片 + PDF（目录递归收集，≤200 文件/任务） |
| 扫描 PDF | pdfjs 提取页面嵌入图像（DCTDecode/FlateDecode/1bpp 传真形态）→ 识别；页 `/Rotate 90/270` 自动转正 |
| 语言 | 内置简体中文+英语（tessdata_fast，离线即用）；另有 14 种语言在「语言包」按需下载（唯一外网流量=模型文件本身） |
| 版面切分 | PSM 3 自动（默认）/6 统一块/4 单列/11 稀疏/7 单行 |
| 输出 | 面板文本预览/复制、可选导出同名 txt（UTF-8）、报告落 kv 跨端可读 |
| AI 工具 | `ocr_scan`（一句话识别）/`ocr_status`/`ocr_stop`/`ocr_result`（full 取单文件全文）/`ocr_history`/`ocr_langs` |

## 护栏（生产边界）

- 单任务互斥、可中止；正在识别的页会完成，后续文件跳过。
- 上限：200 文件/任务、PDF ≤500 页、单图 ≤50MB、长边 ≤5000px（超限自动缩放）、单页识别 120s 超时。
- 输出目录必须在输入文件目录或应用数据目录之内（根边界校验，含 `..` 逃逸拒绝）。
- kv 报告瘦身：单文件只保留 16KB 文本头（总预算 256KB），全文在服务内存/导出 txt，AI 用 `ocr_result full=true` 按文件取。
- 语言包下载带 30s 超时与内容校验；下载失败给可操作中文指引，不影响内置双语言。

## 已知边界（如实）

- 手写体、严重倾斜/模糊的拍照件不在可靠识别范围内（置信度会如实暴露，<60 逐页标注）。
- 复杂版面（多栏/表格线）不做版面重建，输出为流式纯文本；原生 PDF 表格请用表格提取台（pdf-tables）。
- 加密 PDF 拒绝识别（先解密）；超出 500 页的 PDF 请拆分。
- 模型为 tessdata_fast 档：速度快体积小，对低质量扫描精度一般；本机 CPU 识别（10 页扫描 PDF 约 1~2 分钟）。

## 架构

```
面板(dist/panel.js) ─127.0.0.1+token→ service/main.js（单写者：ocr-bench.* 键空间）
      │                                  ├─ ocr-engine.js：tesseract.js(worker×2) + pdfjs 页图提取 + 文本层判定
      └→ cap.kv（宿主桥）                 ├─ pixel.js：kind1/2/3→RGBA→PNG（纯 JS 编码器）+ 旋转/缩放
MCP(mcp/server.js) ─kv 信箱(cmd/res)──── ┘
语言缓存：{{appConfigDir}}/ocr-bench/cache/*.traineddata（内置 gz 首用解压；下载语言直写）
```

## 验证（五层，全绿）

| 层 | 内容 | 结果 |
|---|---|---|
| 1 | core+pixel 纯逻辑单测（发现器/路径边界/1bpp/旋转/PNG 编码器 CRC 回读…） | 19/19 |
| 2 | 引擎产物级（真实 fixture：中英 PNG、DCT/Flate/1bpp 扫描 PDF、旋转页、native、mixed、corrupt） | 10/10 |
| 3 | SSR 渲染断言（三 Tab/护栏文案/报告卡/离线态） | 6/6 |
| 4 | 假桥集成（真实 service 子进程 + 内存 kv 桥：识别任务/互斥中止/鉴权/信箱/设置归一） | 8/8 |
| 5 | MCP 协议（initialize/list/未知工具/无服务指引/真识别全链路） | 12/12 |
| 6 | 真桥冒烟（真实宿主 kv + 真实识别 + MCP 真子进程 + 全绿自清理） | 4/4 |

```bash
node test/run-tests.mjs       # 层1（秒级）
node test/engine-tests.mjs    # 层2（~30s，真实 Tesseract）
node test/render-verify.mjs   # 层3
node test/service-tests.mjs   # 层4
node test/mcp-tests.mjs       # 层5
node test/smoke-real.mjs      # 层6（需本机 Polaris 在线；离线自动跳过）
```

夹具：`test/fixtures/render-images.ps1`（System.Drawing 渲染中英文图片，Windows）+ `gen-pdfs.mjs`（纯 Node 构造 DCT/Flate/1bpp/旋转/文字版/混合/损坏 PDF），产物随仓库提交，可幂等重建。

## 隐私声明

- 识别全程本机 CPU 执行（Tesseract WASM），图像与文本数据**没有任何上传路径**。
- 唯一外网行为：可选语言包的模型文件下载（jsdelivr 的 tessdata_fast 仓库），与用户数据无关，且在「语言包」页显式发起。

## 依赖说明

`node_modules` 随包出货（tesseract.js 运行时必需），已裁剪：非 relaxedsimd 的 wasm 变体（LSTM fast 模型本就无 legacy 档）、嵌入式 `.wasm.js`、文档/测试媒体；面板构建工具链（typescript/esbuild/react）不随包。Node ≥ 18（需全局 fetch 与 relaxed SIMD）。
