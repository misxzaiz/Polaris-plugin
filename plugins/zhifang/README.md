# 纸坊 zhifang —— 本地 PDF 工坊

> 把「合并、抽页/重排、拆分、旋转、删页、图片转 PDF、提取文字」这些最高频 PDF 操作，变成 AI 对话里的一句话 + 面板里的拖拽。**文件全程不出本机。**

## 为什么是它

- 「merge PDF」是全网最高频的工具类搜索词之一，但主流在线方案（iLovePDF/Smallpdf）必须把文件**上传到别人服务器**，合同/简历/账单类文件即隐私泄露面；免费版还有每日次数限制与广告。
- 桌面免费方案（PDF24）要另装独立软件；自托管方案（Stirling-PDF）要 Docker。纸坊长在你已经开着的 Polaris 里：零账号、零上传、零次数限制。
- 竞品全部没有「对话式操作」：对 AI 说「把桌面上这三份合同按顺序合并，输出到桌面」，一句话落盘完成。
- **明确不做假功能**：压缩（纯本地方案无法真实重压图片，宁缺毋滥）、OCR（扫描件无文字层时明示）、密码破解（加密 PDF 直接拒绝）。

## 功能

| 操作 | 面板 | AI（MCP） | 说明 |
|---|---|---|---|
| 合并 | ≥2 个 PDF 拖入，可 ▲▼ 调序 | `zhifang_merge` | 按给定顺序；输出 `<第一个文件名>-合并.pdf` |
| 抽页 / 重排 | 页码规格（`1-3,5` / `3-end` / `3,1,2` 重排） | `zhifang_pages action=extract` | 输出为新文档，**不携带原文档元数据**（去痕迹分享天然成立） |
| 拆分 | 每 N 页一份 | `zhifang_pages action=split` | `part01-of-03` 零填充编号，文件管理器排序正确 |
| 旋转 | 90/180/270/逆 90 | `zhifang_pages action=rotate` | 累计生效（在现角度上叠加） |
| 删页 | 页码规格 | `zhifang_pages action=delete` | 重建文档，剩余页内容完好 |
| 图片转 PDF | JPG/PNG 按序合成 | `zhifang_images2pdf` | 每图一页，页尺寸=图片尺寸+可选边距；HEIC/WebP 请先转格式 |
| 提取文字 | 预览前 2000 字 + 可落盘 txt | `zhifang_text` | 文本直接回给 AI 续答/总结；扫描件明示「需 OCR，本工具不做」 |
| 信息 | 只读卡片 | `zhifang_info` | 页数/尺寸/元数据；AI 先查页数再操作的好习惯 |

## 安全与隐私（三条硬底线）

1. **文件不出本机**：服务只监听 `127.0.0.1` + 自生成 token（自定义头触发预检，CSRF 免疫）；零外网请求；引擎全本地（pdf-lib + pdfjs，随插件分发）。
2. **输入永不修改/删除**：所有操作读入内存 → 另存新文件。
3. **输出永不覆盖**：同名自动 `-2/-3` 递增；输出名经消毒（Windows 保留名/非法字符/路径成分全拦截）。

加密 PDF 会得到明确中文报错（本工具不破解）。服务健康检查、token、任务历史都写 `cap.kv`，手机端可看历史与设置；**上传处理需在桌面端**（手机浏览器拿不到电脑文件，如实提示不做假跨端）。

## 架构

```
面板（React，blob 注入）
  ├─ 数据面：cap.kv zhifang.*（宿主 invoke → router_dispatch）
  └─ 字节面：<input type=file> → base64 → POST http://127.0.0.1:<meta.port>/api/op（token）
服务（node，http 型 + /__health）：pdf-engine（vendor pdf-lib/pdfjs）→ 落盘输出目录 → 登记 history
MCP（stdio）：5 个 zhifang_* 工具 → 同一 pdf-engine → 落盘 → 登记 history
```

面板与 AI 共用同一引擎（`service/pdf-engine.js`）与同一份任务台账，口径不漂移。输出目录优先级：MCP 参数 `outputDir` > 面板设置 `outDir` > 源文件目录 > 桌面（探测链含 OneDrive 重定向）。

## 键空间契约（权威表）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `zhifang.settings` | **仅面板** | 服务/MCP（每 op 热读） | `{outDir, maxUploadMB, historyCap}` |
| `zhifang.meta` | **仅服务** | 面板（端口/token）、MCP | `{token, port, version, pid, startedAt, lastTickAt, bridge}` |
| `zhifang.history.<ts-rand>` | **仅服务/MCP 工具层** | 面板只读 | 任务台账，环形 cap 200（`{id,at,op,source,inputs,outputs,pages,ms,ok,error?}`） |
| `zhifang.cmd` | 面板写 | 服务消费（先删后做） | `{action:'clearHistory'}` |

## 开发

```bash
npm install
npm run typecheck && npm run build     # tsc strict + esbuild 面板
node --test test/run-tests.mjs         # core 离线单测（14）
node test/engine-verify.mjs            # 引擎产物级验收（15，自造 PDF/PNG/JPG fixture）
node test/mcp-verify.mjs               # MCP stdio 全流程（19 步，无需宿主）
node test/render-verify.mjs            # 面板 SSR 断言（19 项）
node test/smoke-real.mjs               # 真实宿主冒烟（9 步，需宿主运行中）
node test/harness-serve.mjs            # 浏览器 harness → http://127.0.0.1:9899
```

## 已知边界

- **不做压缩**：纯 JS 引擎无法真实重压图片；`useObjectStreams` 重存有轻微瘦身但不承诺。若后续引入外部引擎探测（Ghostscript/qpdf 在 PATH 时启用），将单独发版。
- **不做 OCR**：扫描件/图片型 PDF 无文字层，工具会明示而非输出空文本。
- **加密 PDF 拒绝**（也不破解）；极老的无 ToUnicode 映射字型 PDF 文字抽取可能乱码（如实报错或给出乱码，不静默）。
- 面板在真实宿主 webview 内的 127.0.0.1 直连通道与 pocket-drop 同款（已验证）；`zhifang` 装入宿主后的面板级端到端建议装后点检一次。
