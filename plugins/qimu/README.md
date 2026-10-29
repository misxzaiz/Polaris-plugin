# PPT 工坊 qimu —— AI PPT 工厂

> 大纲进，可编辑 PPTX 出。在对话里把主题、大纲或资料变成真实可编辑的 .pptx 文件。

## 解决什么问题

AI 生成 PPT 是被验证到极致的赛道（Gamma：7000 万用户 / 60 万付费 / $1 亿 ARR），但现有产品有四个反复被抱怨的点（什么值得买/知乎/SegmentFault 横评）：

| 现有产品的坑 | PPT 工坊的做法 |
|---|---|
| 导出可编辑 PPTX 要会员（免费只给 PDF） | 零额度零会员：本地直出，成本只是你自己的 LLM token |
| 网页画布转换导出 → **排版崩坏、二次编辑成本高** | 布局引擎**直接产出原生 OOXML**——版式是确定性数学，不是画布截图转换 |
| 免费生成额度少 | 无 |
| 内容要上传第三方云端 | 内容不出设备（只经你自己配置的 LLM 通道） |

## 能力

- **对话式**（5 个 MCP 工具 `ppt_*`）：聊天里说「把这份材料做成 PPT」「这套数据出 8 页汇报」→ AI 读 `ppt_guide` 版式规则 → `ppt_build` 生成真实 .pptx **落盘桌面**并登记 →「打开它」→ `ppt_reveal` 在资源管理器定位。
- **7 类版式**：封面 / 章节 / 要点（含小标题+说明）/ 双栏对比 / 引言 / 图表（柱/线/饼，原生可编辑图表对象）/ 表格（斑马纹）；外加结尾页。
- **5 套主题**：午夜蓝 / 鎏金墨 / 烬红（深）、晴空 / 纸本（浅），每套 8 色 token + 字体对。
- **容量护栏（防崩版的核心）**：每类版式有硬性容量上限（要点≤6/页、图表≤8 类别×3 系列、表格≤6×8、字数上限），超限**报错要求拆页**，绝不缩字硬塞。
- **面板不依赖 AI 也能用**：内置大纲语法（`#` 章节、`##` 页、`-` 要点、`[L]/[R]` 双栏、`>` 引言、`%bar/line/pie` 图表、`|` 表格、`===` 结束语）→ 实时逐页预览（与成品同一几何模型）→ **本地构建浏览器下载**。
- **作品登记**：AI 构建与面板构建同库可见（标题/页数/主题/路径/时间），跨端一致。

## 与其他插件/宿主的边界

- **图片类（agnes/image-recognition）**：PPT 工坊不生成位图；图表是原生 OOXML 图表对象，可在 PowerPoint 里直接改数据。
- **animation-3d/2d**：那是动画/建模工作流；PPT 工坊交付的是标准演示文稿文件。
- **宿主快捷片段/文档**：无关。

## 架构

```
qimu/
├── plugin.json              # manifest（ActivityBar 面板 Film 图标 + MCP stdio）
├── shared/core.js           # 单一权威：Deck Spec 归一化（容量护栏）→ 几何布局（确定性数学）→ 主题 token + 大纲 DSL
├── shared/core.d.ts         # 面板严格类型
├── vendor/pptxgen.full.cjs  # pptxgenjs+jszip esbuild 自包含 bundle（零 npm 运行时依赖）
├── mcp/render.js            # 渲染适配层：几何盒 → pptxgenjs（node buffer / 浏览器 blob 双端）
├── mcp/server.js            # 5 个 ppt_* 工具（自发现 anchor→config→端口扫描）
├── src/                     # 面板（创作/作品/设置 三 Tab）
└── test/
    ├── run-tests.mjs        # core 逻辑单测（归一化/护栏/DSL/布局/文件名净化）
    ├── render-verify.mjs    # 产物级验收：5 主题全版式渲染 → python zipfile + python-pptx 结构断言
    ├── mcp-verify.mjs       # MCP 协议离线验证（无宿主 graceful + 有宿主自清理）
    ├── smoke-real.mjs       # 真桥端到端（临时导出目录，不污染桌面；--reveal 才真弹窗）
    └── harness.tsx/.html    # 面板浏览器 harness（内联 React + 内存宿主桥）
```

**预览≈成品的保证**：面板预览与 MCP 渲染消费同一个 `core.layout()` 几何输出（位置/字号/颜色/数据全部由 core 计算），渲染器只做映射不做计算——口径不漂移。

## 数据契约（cap.kv `qimu.` 键空间）

```
qimu.deck.<id>  → { id, file, title, theme, slideCount, path, ts, source('ai'|'panel') }
qimu.settings   → { schemaVersion, exportDir('' = 桌面自动探测), theme(默认主题) }
```

文件命名：`qimu-YYYYMMDD-HHmm-{净化标题}.pptx`（剥路径分隔符/非法字符/连续点，防目录穿越）。

## 安全与隐私

- 零外网请求、零后台常驻服务（MCP 按需 stdio）。
- 文件只写到用户配置/自动探测的导出目录；文件名净化防目录穿越。
- `ppt_reveal` 仅 spawn 白名单命令（explorer /select、open -R、xdg-open），参数为单一路径。
- `ppt_forget` 只删登记不删文件（破坏面最小）；`ppt_build` 只创建不覆盖非同名文件（时间戳前缀）。

## 开发与验证

```bash
cd plugins/qimu
npm install
npm run build        # esbuild 打包面板 → dist/panel.js（含渲染器）
npm run typecheck    # tsc --noEmit
node --test test/run-tests.mjs      # core 单测
node test/render-verify.mjs         # 产物级验收（需 python + python-pptx）
node test/mcp-verify.mjs            # MCP 协议验证（无宿主 graceful，有宿主自清理）
node test/smoke-real.mjs            # 真桥冒烟（需本机 Polaris 运行中；--reveal 真弹资源管理器）
npx esbuild test/harness.tsx --bundle --outfile=test/harness.built.js --jsx=automatic --platform=browser --external:node:*
# 然后打开 test/harness.html（静态服务）可交互验收面板
node ../../scripts/pack.js plugins/qimu   # 打 zip
```

重建 vendor（升级 pptxgenjs 时）：在任一安装了 pptxgenjs 的目录
`npx esbuild -e "module.exports=require('pptxgenjs')" --bundle --platform=browser --format=cjs --external:node:* --define:global=globalThis --outfile=vendor/pptxgen.full.cjs`

## 已知边界与未完成验证

- **面板 UI 的浏览器交互验证未在交付环境完成**（本会话内嵌浏览器 webview 不可用）：面板代码已过 tsc、复用 20+ 既有插件的面板范式、且 `harness.tsx` 工具链已就位（一条命令构建后即可交互复验）。预览的 HTML 近似渲染（图表/表格）与真实 PowerPoint 渲染存在合理差异，以 OOXML 产物为准。
- 字体依赖目标机器（默认微软雅黑；Mac/WPS 会自动回退，不会缺字崩版）。
- 不支持图片素材页、母版级品牌规范、动画（后续迭代方向）；`python-pptx` 仅用于验收不随插件分发。
- Windows 桌面偶发文件句柄占用（Defender/索引器）：测试脚本已做韧性删除；对真实用户无影响（插件不删用户文件）。
