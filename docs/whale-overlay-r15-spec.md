# whale-pet 悬浮窗 R1.5：原版效果对标（实施 spec）

> 目标（用户定案）：悬浮窗做到与 dsh-pet 原版一样的效果。素材 109 个已全部在本地。
> 范围：纯插件/宿主前端（`src/petOverlay/OverlayApp.tsx`），零 Rust 改动。
> 对标依据：dsh-pet 0.4.0 源码逐模块提取（见对话分析），物理/走位/睡觉/积分全按其不变量实现。

## 交互面（v0.5.0 全量）

| 能力 | 实现 | 对应原版模块 |
|---|---|---|
| 完整随机链 | idle/turn/80 类动作 + 权重（同步自 dsh config.jsonc） | next-animation |
| 点击 | 随机回应 + 手速积分（+1/+2 飘字）+ click-duck.wav 音效 | drag.clickScore / click-sound |
| 拖拽 | 越阈值 → 播「被鼠标拖拽悬空反馈」循环；位置由 OS 拖拽承担 | drag + drag-follow |
| 松手结算 | 低速=原地落地（squash 压扁回弹）；高速=抛飞 | drag-release |
| 抛飞物理 | 重力 1400/s²、边缘反弹 0.78、地面摩擦、落定 squash；速度取自 onMoved 轨迹 | flight |
| 自主走位 | moves 池三动作，窗口按**视频播放时间轴**平移（leadSec/tailSec 留头尾）；越界退回原地动作 | walk + move-action |
| 睡觉 | 23:00–07:00 触发 start→loop；点击唤醒播 end 回链；睡着每 60s 说梦话 | sleep-machine |
| 碎碎念 | 离线文案池每 5min 一句（人设：大肥鱼）；R2 换 AI | bubble |
| 右键菜单 | 声音开关 / 回屏幕中央 / 关闭 | menu-actions（精简） |

## 边界不变量（照抄原版纪律）

1. **单一运动**：同一时刻最多一条 rAF 运动（flight/walk 互斥）；新运动取消旧运动并世代号作废迟到帧。
2. **屏幕钳制**：恢复位置/走位目标/抛飞落点全部 clamp 在工作区内（原版 clampReachableBox + confineToScreen）。
3. **pointerup 兜底**：window 级 pointerup/blur 监听收尾，指针捕获丢失不残留拖拽态。
4. **单文件失败跳过**：非 idle 动画加载失败 → 直接回 idle 链不进错误态；idle 失败才显示错误。
5. **拖拽轨迹采样**：onMoved 记录最近 120ms 轨迹估算初速；kv 位置**拖拽结束写一次**（不再 400ms 防抖写）。
6. **循环段 ended 语义**：收到 ended 即前台被顶 → 重新点名 loop 而非重播（sleep/拖拽循环段）。

## 验收清单

- [ ] 点击：回应动画 + 飘分 + 音效（可开关）
- [ ] 慢拖慢放：挣扎动画 → 落地 squash → 回 idle
- [ ] 快甩：抛飞弹跳后落定；不飞出屏幕
- [ ] 走位：螃蟹走路等平移窗口，越界退回原地动作
- [ ] 夜间触发睡觉三连；点击唤醒；说梦话气泡
- [ ] 待机随机链涵盖 80 类动作
- [ ] 右键菜单三项可用
- [ ] 门槛：tsc --noEmit + eslint 0 errors；主仓提交
- [ ] 截屏验证待机/气泡；交互项由用户逐条确认
