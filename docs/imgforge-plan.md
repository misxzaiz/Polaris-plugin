# 图片工坊（imgforge）v0.1.0 — 选型与实施方案

> 2026-11-01 · 主攻方向：技术工具 / 内容变换类。核心动作 =「变换了什么」（压缩/转格式/剥离隐私元数据），非「记录了什么」。
> 命名纪律：显示名直白功能名「图片工坊」，与 PDF 工坊/Excel 工坊/PPT 工坊 同族；id `imgforge`。

## 一、选型过程（先证明值得做，再动手）

### 1.1 候选池（全部过方向硬闸，台账/记录/生活类零进入）

| # | 候选 | 类别 | 淘汰/保留理由 |
|---|------|------|--------------|
| 1 | **本地批量图片工坊**（压缩/转格式/缩放/EXIF 剥离/目标体积） | 内容变换 | **保留，最终入选** |
| 2 | 仓库→AI 上下文打包器（gitingest 类） | 数据管道 | 淘汰：repomix/gitingest CLI 已成熟（15k+ star），本机 ZCode 工作流原生读文件，插件边际价值=GUI+手机侧，弱 |
| 3 | Prompt A/B 实验台（promptfoo 类） | AI 运行时 | 淘汰：深度耦合宿主 cap.ai.chat 流式语义，MVP 风险高；价值依赖「在 coding agent 之外调 prompt」的频率假设，未验证 |
| 4 | 接口沙箱（mock server + webhook 检查器） | 开发者工具 | 淘汰：relay-devkit 已占 API 客户端；webhook 收包对当前用户低频 |
| 5 | 重复文件猎人 | 诊断 | 淘汰：与 disk-radar 相邻，独立频率低 |
| 6 | 依赖体检（多项目 outdated/audit 聚合） | 诊断 | 淘汰：周级频率，且 `pnpm outdated` 已够 |
| 7 | Git 仓库体检 | 诊断 | 淘汰：ZCode 内原生做 |
| 8 | 日志工作台 | 诊断 | 淘汰：目标用户日志形态分散，MVP 难以聚焦 |
| 9 | 文档变换工厂（md→docx/pdf） | 内容变换 | 淘汰：qimu/gezhi/zhifang 已覆盖产出侧大头 |
| 10 | 网域哨兵（证书到期/DNS/whois） | 网络工具 | 淘汰：net-sentinel 相邻；个人域名证书监控低频 |
| 11 | 批量重命名/文件整理 | 文件变换 | 淘汰：PowerToys 已免费解决，技术想象力弱 |
| 12 | CSV/JSON/YAML 互转 | 数据变换 | 淘汰：relay-devkit JSON 工具 + gezhi 覆盖大半 |

### 1.2 加权评分（5 分制 × 权重，满分 100）

| 维度(权重) | 图片工坊 | 仓库打包 | Prompt台 | 接口沙箱 | 重复文件 | 依赖体检 |
|---|---|---|---|---|---|---|
| 痛点强度(20%) | 4 | 3 | 3 | 3 | 3 | 3 |
| 频率/人群(15%) | 4 | 2 | 3 | 2 | 2 | 2 |
| 现有方案缺口(15%) | 4 | 2 | 3 | 4 | 3 | 3 |
| 可验证差异化(15%) | 5 | 3 | 4 | 4 | 3 | 3 |
| 收益/价值(15%) | 4 | 3 | 3 | 3 | 3 | 2 |
| 形态适配(10%) | 5 | 4 | 3 | 4 | 4 | 4 |
| 技术可行(5%) | 5 | 4 | 3 | 4 | 4 | 4 |
| 开发/维护成本(5%) | 4 | 4 | 2 | 3 | 4 | 4 |
| **总分** | **86** | 58 | 62 | 66 | 61 | 58 |

关键分差来源：频率（图片操作跨开发/创作/家庭全人群，截图→上传→外发是周级甚至日级动作）、形态适配（拖拽面板 + 后台批处理 + MCP 三面天然贴合，zhifang 已验证同构范式）、差异化（60 插件生态零本地图片变换能力；agnes=AI 生成、image-recognition=AI 视觉，均不碰本地文件变换）。

### 1.3 市场证据（外部调研，2026-11-01）

1. **TinyPNG 类上传式工具持续被抱怨**：dev.to《I stopped using TinyPNG and never looked back》——第三方上传 + 批量节流；r/webdev「Best PNG Optimizer Other Than TinyPNG?」反复出现；2026 年仍有成批「no-upload / offline 替代品」文章与新产品（FileHop/Compresto/bulkpictools），说明**市场在主动寻找本地方案**。
2. **Squoosh（Google）CLI 已弃维护**：libSquoosh deprecated，gulp-squoosh 官方建议迁移 sharp/cwebp/oxipng；CLI 有灰度 PNG 双倍输出（#971）等未修 bug；IPX 维护者证实 wasm 慢到不适合按需转换——**用户被迫自建工作流**（如 macOS 用户自写 Finder Quick Action webp-automation-macos）。
3. **EXIF/GPS 隐私是真实且持续的担忧**：Consumer Reports「照片 EXIF 能暴露住址」；Proton 2025-08 专文；iNaturalist 用户请求内置去定位功能（自述手动剥离烦）；ExifCleaner 等离线批量剥离工具有稳定需求，HN Show 帖持续出现。
4. **批量是刚需而非尝鲜**：在线工具普遍 20 张/5MB 免费限额 + 节流；桌面替代品碎片化（每家只做一小块：只压缩/只转格式/只去 EXIF）。

结论：真实痛点 + 高频 + 现有方案各有明确缺口 + 本地化是公认的价值主张 + AI 编排是尚无人做的增量。

### 1.4 生态查重

60 个现存插件无任何本地图片变换能力。zhifang 引擎含「图片转 PDF」但只进不出；agnes/GLM-4V 是云 AI 能力。无撞车。

## 二、产品定义

- **名称**：图片工坊（id: `imgforge`）
- **一句话**：本地批量图片变换引擎——压缩、转格式（WebP/AVIF/JPEG/PNG/TIFF）、按最大宽高缩放、EXIF/GPS 隐私剥离（默认开启）、「压到目标体积」二分逼近；面板拖拽选目录，或对 AI 说一句话，全程不出本机。
- **目标用户**：开发者（CDN/博客图瘦身、格式转换）、内容创作者（平台体积限制）、普通用户（照片外发前抹 GPS）。
- **核心场景**：
  1. 「把 D:\shots 里所有 PNG 转成 WebP，单张超过 200KB 的压到 200KB 以内」——AI 一句话（MCP）完成并报告节省。
  2. 面板选目录 → 扫描 → 配管道 → 批量执行 → 前后体积对比报告。
  3. 手机照片外发前一键剥离 GPS/设备信息。
- **MVP 范围**：
  - 扫描：目录（递归可选）+ 单文件；格式/尺寸/体积/GPS 标记。
  - 变换：格式转换（keep/webp/jpeg/png/avif/tiff）、质量、最大宽/高缩放（fit inside 不放大）、EXIF 剥离（默认开，剥离前先按 EXIF orientation 回正）、目标体积二分（jpeg/webp/avif）。
  - 输出纪律（zhifang 同款）：输入永不修改/删除；输出永不覆盖（输出目录默认 `<输入目录>/imgforge-out/`，重名自动 -2/-3）。
  - 历史：cap.kv `imgforge.history.*` 环形（面板与 AI 共用同一份）。
  - MCP 四工具：`imgforge_scan` / `imgforge_info` / `imgforge_process` / `imgforge_jobs`。
  - 面板三 Tab：工作台 / 历史 / 设置。
- **明确不做（v1 边界，如实写进 README）**：水印、裁剪/旋转画布、动图 GIF 重编码（GIF 输入变换取首帧并明示）、OCR、HEIC（视宿主 libvips 实测支持为准，不承诺）、公共 CORS 代理/任何外网请求。
- **成功指标（MVP 可测）**：50 张 4K 截图 PNG→WebP q80 批处理总耗时 < 2 分钟；目标体积命中（≤目标 ±0 尺寸完整）率 100%（二分保底 q30+等比缩）；错误路径全部中文可读；EXIF 剥离后 GPS 100% 移除（测试断言）。

## 三、架构（复用 zhifang 已验证范式）

```
面板 (React bundle, blob 注入主窗口)
  ├─ 数据面: __POLARIS_HOST_INVOKE__('router_dispatch') → cap.kv imgforge.*
  └─ 字节面: fetch http://127.0.0.1:<meta.port>/api/... (X-Imgforge-Token)
服务 (node service/main.js, 宿主代管生命周期, 自动分配端口)
  ├─ sharp 引擎 (engine.js): scanDir / probeImage / runPipeline(并发池) / bisectTargetSize
  ├─ 心跳: cap.kv imgforge.meta {token,port,version,pid}
  └─ 历史/设置: cap.kv imgforge.history.* / imgforge.settings / imgforge.cmd(先删后做)
MCP (node mcp/server.js, stdio JSON-RPC)
  └─ 直接 require 同一 engine.js（口径不漂移），历史同写 imgforge.history.*
shared/core.js: 设置归一/魔数识别/输出命名/路径护栏/字节格式化（三端同源）
```

安全设计：
- 服务只绑 127.0.0.1 + token（cap.kv `imgforge.meta`，首启生成、重启不换）。
- 零外网请求：sharp 纯本地；kvclient 只连宿主回环桥。`permissions` 不声明 network。
- 路径护栏：输入路径必须绝对且存在；输出目录由输入目录/设置派生，MCP outputDir 参数须绝对路径。
- DoS 自护：单文件 ≤100MB、单批 ≤ settings.maxBatch（默认 300，MCP 默认 50 上限 200）、并发默认 3（可配 1-8）、请求体上限、扫描条数上限。
- 隐私默认：stripMetadata 默认 true（EXIF/XMP/IFD 全剥，orientation 先回正再剥）。

## 四、测试计划（四层，全部真实执行）

1. `core-verify.mjs`（node:test）：魔数识别、设置归一、输出命名冲突链、stem 消毒、路径护栏、字节格式化。
2. `engine-verify.mjs`（真 sharp）：造图 → scan 元信息断言 → 变换格式/尺寸/质量断言 → EXIF 注入→剥离断言（GPS 有→无）→ 目标体积二分断言（≤目标且尺寸不变）→ PNG palette 压缩 → 永不覆盖链 → GIF 首帧口径。
3. `mcp-verify.mjs`（spawn 真 stdio server）：initialize/tools/list（4 工具）→ scan/info/process 真实文件操作 → 产物断言 → 错误路径中文 isError（不存在/相对路径/非图片/超上限）→ 二次执行 -2 命名。
4. `render-verify.mjs`（esbuild SSR + 内存 kv mock）：三 Tab 关键 UI 与状态文案断言。
5. 构建：`npm run build`（esbuild，react external）+ `npm run typecheck`（tsc --noEmit）。
6. 打包：`node scripts/pack.js plugins/imgforge`（node_modules 随 zip 出货，win32-x64 原生 + wasm32 兜底）。

## 五、风险与止损

| 风险 | 概率 | 缓解/止损 |
|---|---|---|
| sharp 原生 DLL 在真宿主环境加载失败 | 低 | spike 已验证本机 require+处理成功；node_modules 同时随包 wasm32 兜底（`sharp-wasm32`）；再失败则项目终止并写复盘 |
| zip 体积大（node_modules ~30MB） | 确定 | 接受：本地局域网 CDN 安装；对比 zhifang（pdfjs vendor）量级相同；.pluginignore 裁剪 platform 不符二进制 |
| 用户使用频率不及预期 | 中 | 通用面广（开发/创作/家庭三场景）；后续观察 watchtower 用量计量再迭代 |
| AVIF 编码慢 | 确定 | 默认 effort 4 + 文档明示；avif 定位为可选输出 |

## 六、交付清单

plugin.json / update.json / README.md / shared/core(.js+.d.ts) / service/{main,engine,kvclient}.js / mcp/server.js / src/{index,Panel,WorkTab,HistoryTab,SettingsTab,host,model}.tsx|.ts / dist/panel.js / test/* / node_modules（随包）/ index.json 条目。
