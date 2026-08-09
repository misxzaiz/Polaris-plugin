# 禅房视觉升级待办

> 基于 PolarisDemo 中的动画参考（anime.js + Three.js + Canvas 2D）对禅房插件进行视觉增强。
> 关联插件：`polaris.zen`（`plugins/zen/`）

---

## 阶段目标

将当前基于字符表情和 CSS 的 UI 升级为 Canvas 2D + CSS 动画的沉浸式视觉体验。

---

## P0：小僧动画（替代字符表情 `( -_- )`）

**参考**：`/d/PolarisDemo/projects/pixel-battle/` 的 Canvas 精灵渲染

**现状**：`getMonkFace()` 返回 `( -_- )`、`( ^_^ )`、`( -_-)zzz`、`( ^o^ )` 四个字符表情

**目标**：用 Canvas 2D 绘制一个像素风格小和尚

| 状态 | 动画 | 实现方式 |
|------|------|----------|
| idle | 闭眼、轻微呼吸（上下浮动 2px） | `requestAnimationFrame` + 正弦波 |
| content | 睁眼微笑、身体微微前倾 | Canvas 重绘 |
| sleepy | 头一点一点、眼睛半闭 | Canvas 重绘 + 定时器触发点头 |
| happy | 眼睛弯成月牙、小幅跳跃 | Canvas 重绘 + 弹簧缓动 |

**实现提示**：
- 用 Canvas 2D 绘制，不要用图片资源
- 绘制要素：圆头（肤色圆）、僧衣（灰色梯形）、眼睛（两条短线/弧线）
- 用 `requestAnimationFrame` 驱动动画循环，仅在面板激活时运行
- 参考 `pixel-battle` 的精灵渲染循环

---

## P1：木鱼渲染（替代 `ˇ ˇ`）

**参考**：`/d/PolarisDemo/10_three_animations.html` 的缓动效果

**现状**：两个字符 `ˇ ˇ` 作为按钮文字

**目标**：用 CSS 绘制木鱼 + 敲击动画

| 效果 | 触发 | 实现 |
|------|------|------|
| 木鱼绘制 | 静态 | CSS 圆形 + 鱼形简笔轮廓（`border-radius: 50%` + `::before/after` 伪元素） |
| 敲击脉冲 | 点击/空格 | `transform: scale(0.95) → 1.05 → 1` + 阴影脉冲 |
| 音波扩散 | 点击 | CSS `@keyframes`：从圆心向外扩散的环形波纹（`box-shadow` 动画或 `radial-gradient` 过渡） |
| 连击加速 | 点击间隔 < 500ms | 敲击动画速度随连击数加快（`animation-duration: 300ms → 150ms`） |

**音效**：保持现有 Web Audio API 实现，三音色（木鱼/钵/磬）

---

## P2：抽签动画

**参考**：anime.js 弹簧缓动效果

**现状**：按钮 `animate-pulse` + 文字直接显示

**目标**：签筒摇晃 + 签条滑出

| 效果 | 实现 |
|------|------|
| 签筒摇晃 | CSS 3D `rotate` 动画（`@keyframes shake: 0deg → 8deg → -8deg → 0deg`） |
| 签条滑出 | `transform: translateY(-20px) → 0` + `opacity: 0 → 1` |
| 运签颜色 | 保持不变（大吉粉/凶红等），但背景渐变色随运签变化 |
| 签文打字机 | 签文逐字显示（`setInterval` 每 50ms 显示一个字） |

---

## P3：答案之书翻页动画

**参考**：`/d/PolarisDemo/10_three_animations.html`，Three.js 翻页

**现状**：纯文字显示，无翻页效果

**目标**：CSS 3D 翻页透视

| 效果 | 实现 |
|------|------|
| 书本封面 | CSS 3D 封面（`perspective: 1000px` + `rotateY` 过渡） |
| 翻页 | 封面 `rotateY(0deg) → rotateY(-180deg)` 过渡 |
| 内页显示 | 封面翻完后显示内容，带纸张纹理（`linear-gradient` 模拟） |
| 追问按钮 | 翻页完成后再显示，保持 UX 流程 |

---

## P4：日记时间线视觉增强

**现状**：纯文本列表

**目标**：时间线样式

| 效果 | 实现 |
|------|------|
| 时间线竖线 | `::before` 伪元素绘制左侧竖线 |
| 时间点圆点 | 每个条目左侧小圆点，颜色按类型区分（敲击=蓝、抽签=金、翻书=绿） |
| 统计卡片 | 顶部统计用卡片样式（`border-radius + border`） |

---

## 实现优先级

| 优先级 | 内容 | 预估工作量 | 依赖 |
|--------|------|-----------|------|
| P0 | 小僧 Canvas 动画 | 2 人日 | 无 |
| P1 | 木鱼 CSS 绘制 + 敲击动画 | 1.5 人日 | 无 |
| P2 | 抽签动画 | 1 人日 | 无 |
| P3 | 翻页动画 | 2 人日 | 无 |
| P4 | 日记时间线 | 0.5 人日 | 无 |

**总计**：约 7 人日

---

## 技术参考

- `/d/PolarisDemo/10_three_animations.html` — 10 种 3D 动画效果（anime.js）
- `/d/PolarisDemo/test_anime.html` / `test_anime2.html` — anime.js 对 Three.js 对象的动画测试
- `/d/PolarisDemo/test_anime3.html` / `test_anime4.html` — 更多动画测试
- `/d/PolarisDemo/projects/pixel-battle/` — Canvas 2D 精灵渲染
- `/d/PolarisDemo/yulong-voxel*.html` — 体素渲染参考

所有动画应使用纯 CSS + Canvas 2D，不引入额外依赖（现有 anime.js 资源仅作参考，不直接依赖）。