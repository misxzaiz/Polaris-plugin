# animation-3d 插件 — 第一步：方案分析与定位记录

> 创建日期：2026-10-22
> 状态：可行性验证进行中（第一步：Blender 3D 闭环）
> 仓库：`Polaris-plugin/plugins/animation-3d/`

> 2026-10-22 实施记录：
> - 确认 `plugins/animation-3d/` 已存在（含 PLAN.md / plugin.json / verify_teapot.py / out/verify_teapot.png）
> - 识图确认 `out/verify_teapot.png` 为有效 3D 渲染（低多边形猴子头 + 地面 + 阴影），说明验证脚本本身可跑通
> - 但当前环境 Blender 实际未安装（winget 查不到、程序目录无 Blender Foundation）→ 重新安装中
> - 识图技巧沉淀：GLM-4V 可配 maxTokens；复杂画面分块多次识图，避免返回被截断

> **2026-10-22 实施完成（第一步可行性验证：Blender 3D 闭环 ✅）**：
> 1. ✅ 安装 Blender 4.2.16 LTS（winget 一次性成功，路径 `C:/Program Files/Blender Foundation/Blender 4.2/blender.exe`）
> 2. ✅ MCP server 可用：`uvx mcp-for-blender` 启动成功，v1.30.0，9 个工具齐全（execute_blender_code / look / get_scene_info / generate_3d / search_assets / import_asset 等）
> 3. ✅ 跑通 `scripts/verify_teapot.py`（Blender 4.2 适配：EEVEE 枚举名改为 `BLENDER_EEVEE_NEXT`，已修）
> 4. ✅ 渲染成功 `out/verify_teapot.png`（960x540 EEVEE 64 samples，28s）
> 5. ✅ GLM-4V 识图复核（maxTokens=4000）：识别出"低多边形立体物 + 浅棕哑光材质 + 浅灰地面 + 真实阴影 + 明确3D渲染" → **"建模→渲染→识图"闭环成立**
> 6. 踩坑沉淀：Blender 4.2 EEVEE 枚举改名（与 mcp-for-blender 文档"别硬编码枚举"建议一致）；winget 后台异步装 + 前台装更容易成功
>
> **✅ 2026-10-22 实时链路最终验证（AI → MCP → Blender 建模 → 截图 → 识图）**：
> - `ping` → `execute_code` 建模（Suzanne 猴子头 + 地面 + 相机 + 光）→ `get_viewport_screenshot` 截图（offscreen 渲染 800×434）全部成功
> - 识图确认：卡通头部 + 浅棕哑光 + 浅灰地面 + 光影阴影 + 3D渲染 → **完整实时闭环成立**
> - 关键踩坑：⚠️ execute_code 里不要用 `bpy.ops.wm.read_factory_settings()`（重置场景会连带搞崩 addon server，需重启 Blender）；用选择性删 Cube 代替；`get_viewport_screenshot` 必须传 `filepath`；Blender GUI 须保持前台运行（后台任务方式会退出）
>
> **插件 A 剩余**：在 Polaris 中正式启用 animation-3d 插件（plugin.json 已声明 blender MCP），让 Polaris 内 AI 能直接调 mcp-for-blender 工具建模型。

## 0. 一句话定位

**Polaris 内的 AI 动画工作室**：让 Polaris 中运行的任何 AI（不限于 Claude）能产出两类可用产出物——
2D 手绘逐帧动画（p5.brush 水墨风）与 3D 建模（Blender），并用识图（GLM-4V / Blender `look`）
自检迭代，未来接入语音生成（`mimo-tts` 已另有人在维护）闭环。

## 1. 双管线拆分（核心决策）

| | 插件 A：Blender 3D 建模 | 插件 B：2D 手绘动画 |
|---|---|---|
| 形态 | **接现有方案（不重造）** | **自研（2D 无现成 MCP）** |
| 基础资产 | `ahujasid/mcp-for-blender`（31.4k⭐） | `JohnHeibel/ClaudeAnimationBase`（1.2k⭐）+ 滕王阁/翠花改造 |
| 核心能力 | AI 控制 Blender：建/改/材质/渲染 + `look` 多视角自检 | p5.brush 水墨逐帧动画：场景→渲染→GLM-4V 质检 |
| 本仓库内现状 | 未安装 Blender（需装） | 未搬运（依赖 temp/claude-animation-base） |

**理由**：3D 建模是通用需求，社区已有成熟 MCP 标准方案，直接接入成本最低；
2D p5.brush 手绘动画是极窄审美方向（GitHub 几乎无 MCP 化），是自己的护城河，值得自研沉淀。

## 2. Blender 侧（插件 A）调研结论

`mcp-for-blender` 关键能力与本插件目标完全对口：

- `execute_blender_code`：AI 直接写 bpy → 建/改模型（"3D 建模后让识图去看"）
- `look`：多视角/线框/渲染/动画帧自检（**结构自检闭环，AI 自己看图**）
- `generate_3d`：Hunyuan3D / Tripo / Hyper3D 一句话生成模型
- `search_assets / import_asset`：Poly Haven / Sketchfab / Poly Pizza 资产库免建模
- 架构：Blender 内 addon（socket 服务）↔ 独立 MCP server（uvx 启动）

本机环境（2026-10-22 实测）：
- `uvx` ✅ 已装（`C:\Users\28409\.local\bin\uvx.exe`）
- Blender ❌ 未装（winget 后台安装中）
- GPU：AMD 集显 2GB + 两个虚拟显示适配器（OrayIddDriver/Todesk）→ 渲染建议 EEVEE

**分工**：Blender `look` 负责几何/结构自检；美术/风格（水墨感、比例、美感）仍需 GLM-4V 识图评审。

## 3. 2D 侧（插件 B）调研结论

GitHub 搜索 `hand drawn animation mcp` 仅 3 个小项目（最大 92⭐），**无 p5.brush 风格现成方案** → 自研。

可沉淀资产（来自 temp/claude-animation-base，滕王阁已验证）：
- 渲染管线 `render.mjs`（headless Chrome + `--frames` 落盘 + ffmpeg 编码）
- 水墨词库 `src/tengwang.js`（远山/涟漪/旗幡/竖排书法/印章/墨晕/墨色调色板）
- 人物骨架 `src/clawd.js`（已验证可换皮肤成翠花）
- 制作规则 `ANIMATION_GUIDE.md`（纯2D/boil线稿/无文字/每镜有事/时序）
- 识图质检 `vision_check.mjs`（GLM-4V 断言式提问模板）
- 踩坑清单（ffmpeg symlink、后台任务超时、NaN 顶点崩溃、飞檐被覆盖、`--frames` 落盘）

**去品牌化**：引擎与 Claude 解耦（参考 flynn-eye/DeepSeekAnimationBase 已证明可行）。

## 4. 协作流水线（含语音未来时）

```
一句话需求 → [B] 2D手绘动画 → GLM-4V 质检 → 出片
           → [A] Blender 3D 建模 → look 自检 → GLM-4V 风格评审 → 出片
           →（未来）mimo-tts 语音 → 配音/口型/音画同步
```
共用：vision_check 质检模板、帧→ffmpeg→mp4 编码、Polaris 商城分发。

## 5. 现成项目清单

| 项目 | 星数 | 用途 | 采纳 |
|---|---|---|---|
| `ahujasid/mcp-for-blender` | 31.4k | Blender MCP 标准方案 | ✅ 直接接入 |
| `JohnHeibel/ClaudeAnimationBase` | 1.2k | p5.brush 手绘动画起点 | ✅ 引擎基座+去品牌化 |
| `flynn-eye/DeepSeekAnimationBase` | 新 | 换皮去品牌化可行性证明 | ✅ 参考 |
| `excalimate/excalimate` | 92 | Excalidraw 草图动画 MCP | ⚪ 参考 |
| `HoldMyBeer-gg/blenderwright` | 173 | Blender MCP 191 工具 | ⚪ 备选 |
| `sandraschi/blender-mcp` | 61 | Headless Blender 自动化 | ⚪ 备选 |

## 6. 下一步（当前进行中）

**第一步可行性验证（Blender 闭环）**：
1. ✅ 安装 Blender 4.2.16（winget 一次性成功）
2. ✅ 创建插件目录 `plugins/animation-3d/`（含 PLAN.md / plugin.json / 验证脚本）
3. ✅ `plugin.json` 已声明 blender MCP 封装入口（`plugins/animation-3d/plugin.json`）
4. ✅ 实时链路验证：启动 Blender + mcp-for-blender → `execute_code` 建模 Suzanne 猴子头 → `get_viewport_screenshot` 出图
5. ✅ GLM-4V 识图确认 3D 渲染（建模→识图→迭代闭环成立）
6. ✅ 验证结果已回写本文档（见顶部实施记录）

**剩余待办**：在 Polaris 中正式启用 animation-3d 插件，让 Polaris 内 AI 能直接调 mcp-for-blender 工具（工具层已就绪，只差插件加载/权限配置）。

**后续**：插件 B（2D 去品牌化自研）单独推进，语音接入等 `mimo-tts` 就绪。