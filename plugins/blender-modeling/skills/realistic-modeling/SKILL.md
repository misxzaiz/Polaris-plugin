# 真实三维建模

当用户要求用自然语言生成一个真实感的 3D 建筑/物件（尤其老房子、中式/乡土建筑、
带材质和做旧效果）时，调用 `blender_generate_3d` 工具（由 polaris-blender MCP
server 提供的 script 入口）。

## 调用约定

工具全名：`blender_generate_3d`
必传参数：`script`（要跑的建模脚本名）、`params`（该脚本的 params_schema 字段，
按 user 描述传）。

### 两个建模脚本

- `realistic_house`：几何骨架白模（4 面墙+坡屋顶+门窗洞+瓦+椽檩+屋脊+烟囱台基）。
  默认 120s 内出结果，适合快速验证结构/参数。
- `bake_house`：在 realistic_house 白模上做 PolyHaven PBR 贴图 + Cycles 三图 bake
  + 顶点色做旧 mask。完整 bake 实测约 1135s，**必须传 `timeout >= 1200000`**（默认
  600s 会提前杀进程，这是已知踩坑）。

如果用户没有明确说"只要白模"，默认走 `bake_house` 出带材质的成品。

### 传参原则

只传 user-facing 参数（如 realistic_house 的门窗数量/开间进深、bake_house 的
`write_masks`/`seed`/`skip_bake`）。分辨率（resolution_main/secondary）、采样数
（ao_samples）、bake 边距（bake_margin）等工程参数**不要改**，保留脚本默认值。

不要自己写 geometry/bpy 代码，脚本已覆盖结构；用户要改细节只调 params。

## 失败处理

- 报 "超时/timeout"：提升 timeout 重试（bake_house 用 1200000）。
- 报 "mask 全白/整栋土黄"：该版本脚本已修，重跑即可，不用排查 shader。
- 报 "bake 图整体过暗"：已修，重跑即可。

## 输出

工具返回自包含 GLB（JPEG 内嵌 8 材质 PBR + 顶点色做旧），预览页会自动以 3D 卡片
渲染，AI 上下文只见到 token，不必自己搬运 base64。