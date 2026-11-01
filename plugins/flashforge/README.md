# 闪造 FlashForge —— 私人 AI 应用作坊

> 聊天里一句话，AI 现场造出一个**真的能玩/能用**的小应用（游戏 / 微工具 / 教具），
> 存进你的随身应用花园：桌面手机随时打开玩，版本可回退，家人同玩一张高分榜。

## 为什么

Claude Artifacts 累计产生了 5 亿+ 个 AI 生成的小应用，但用户最大的抱怨恰好是：
**没有整理（社区自建排序扩展）、产物会丢、没有可靠导出、还占用用量限额**——
这些全是云端方案的结构性缺陷。闪造把「AI 应用花园」搬回本机：

| | 云端 Artifacts / Bolt | 闪造 |
|---|---|---|
| 所有权 | 平台托管，会没 | cap.kv 本机数据根，导出 .html 双击即开 |
| 整理 | 平铺/文件夹靠扩展 | 应用架：类型筛选+搜索+标签+版本树 |
| 跨端 | 再开一个网页 | 推送到手机「新造好」徽标，打开即玩 |
| 用量 | 每个产物吃订阅额度 | 本机 AI 引擎，零额外限额 |

## 用法

**AI 侧（MCP 七工具）**

- 「给我造一个贪吃蛇，要能记分」→ `ff_create`（扫描→入库 v1）
- 「加个音效和暂停键」→ `ff_iterate`（追加 v2，旧版保留）
- 「我造过哪些」→ `ff_list`；「上次那个的代码」→ `ff_source`（新会话续作前读）
- 「推到手机给娃玩」→ `ff_push`；「最高多少分」→ `ff_score list`
- 「删掉它」→ `ff_delete`（confirm=id 两步确认）

**人侧（活动栏「闪造应用作坊」面板）**

- 应用架：类型筛选 / 搜索 / 「新造好」徽标 / 最高分一览；空态有一句话引导
- 详情：版本时间线（扫描结果徽标）、运行、查看源码、导出 .html、回退、删除
- 运行：沙箱覆盖层，游戏结束成绩自动上榜；设置里配上榜昵称与设备名
- 手机：打开 Polaris → 闪造面板 → 同一座花园（数据经宿主跨端同步）

## 安全模型

1. **沙箱是硬边界**：应用运行在 `sandbox="allow-scripts allow-pointer-lock"` 的
   srcdoc iframe——不透明 origin（无 Cookie / localStorage / 同源访问）、无弹窗、
   无顶层导航。成绩经 `parent.postMessage({__ff:1, type:'score', score})` 上报，
   面板校验来源（event.source）与形状后落库。
2. **静态扫描是入库闸**：联网（fetch/XHR/WS/ES/beacon/serviceWorker/import）、
   外链资源、逃逸（window.open / document.domain / top.location / http 跳转）一律
   拒绝入库；localStorage 等沙箱必抛 API 与缺 viewport 给 WARN 提醒。
3. **版本只增不改**：回退=复制旧版为新版本；删除是唯一不可逆路径（双端两步确认）。
4. **完整性**：每版本存 sha256（UTF-8），装配时校验，篡改即拒用。

**诚实边界（残余风险）**：静态扫描按字面量匹配，混淆代码（如字符串拼接构造
`fetch`）理论上可绕过扫描——此时沙箱（不透明 origin、无弹窗、无顶层导航）仍
是硬边界，但不透明 origin 下 `fetch` 到 `Access-Control-Allow-Origin: *` 的公开
端点在浏览器层不被禁止。信任模型=作者是你自己的 AI（合作作者，按创作契约生成），
不是对抗场景；不建议把不可信来源的 HTML 粘贴进 `ff_create`。

## 数据与隐私

- 全部落宿主 cap.kv（`ff.*` 键空间，索引 `ff.apps` 唯一权威），数据不出本机
- 零外网请求、零账号、零后台服务；删除应用=版本块+成绩+索引条目全部清空
- 全程不调用 cap.kv list（实测大数据根上会拖垮宿主），清单一律走索引键

## 已知限制

- 单应用 ≤200KB 单文件 HTML（无构建、无 npm 依赖、无外部资源）
- 双端同时写索引按 per-app updatedAt 新者胜（合并窗口毫秒级，极端并发可能丢一侧新增）
- 高分榜保留最近 200 条；应用上限 60 个
- 沙箱内不能用 localStorage/alert（设计使然，扫描会提醒作者改内存变量）

## 测试

```bash
node --test test/run-tests.mjs   # 22 项：扫描矩阵/分块回环/索引合并/成绩/限额
node test/smoke-real.mjs         # 真宿主 12 步冒烟（需 Polaris 运行中）
```

沙箱运行时已浏览器实测：srcdoc 应用可运行、postMessage 跨沙箱可达（来源校验通过）、
localStorage 确抛 SecurityError、成绩协议计分上链（`test/sandbox-harness.html`）。

## 设计文档

- 方案与市场证据：[`docs/flashforge-plan.md`](../../docs/flashforge-plan.md)
