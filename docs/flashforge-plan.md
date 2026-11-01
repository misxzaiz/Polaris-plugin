# 闪造 FlashForge —— 生产级实施方案

> 状态：已评审定案（2026-11-01）。所有者：插件仓 plugins/flashforge。
> 定位：**你的私人 AI 应用作坊** —— 聊天里一句话，AI 现场造出一个能跑的小应用；
> 存进随身应用花园，桌面手机随时打开玩，版本可回退，家人同玩一张高分榜。
> 形态：零后台服务插件（cap.kv 数据面 + MCP 七工具 + React 面板沙箱运行时）。

---

## 一、机会与市场证据（为什么值得做）

### 1.1 候选筛选记录

本轮共评估 12 个候选方向（记录类方向已被用户在 2026-10-28 明确否决：决策日志、
习惯、周报候选全被否，要求「创造模式或更强的」，此处仅列未否决项）：

| 候选 | 一句话 | 淘汰/保留原因 |
|---|---|---|
| **闪造 FlashForge** | AI 一句话造小应用+随身应用花园 | **保留，主项目** |
| AI 播客工厂（NotebookLM 式） | 长文→双人对谈音频 | 保留但落选：强依赖 mimo-tts 外部插件 API 稳定性、长合成时延；news-curator 已有语音播报先例，平台适配弱（得分 71.5/100） |
| AI 网站构建器（Lovable-lite） | 多页真网站 | 淘汰：与 Bolt/Lovable 云端巨头正面竞争无胜算、发布/托管故事缺失、超出插件体量（54/100） |
| GitHub Release 雷达 | 依赖更新影响分析 | 淘汰：page-sentinel 已支持盯 GitHub release 页面变化（缺口已被占） |
| 汇率/单位工具箱 | it-tools 式 | 淘汰：relay-devkit 已占开发者工具箱生态位 |
| 周报工坊 / 情绪日记 / 习惯打卡 / 装修管家 / 宠物管家 / 存钱目标 | 记录类 | 淘汰：用户明确否决记录类方向；且 pocket-ledger/duzhi/sundial 等已大量覆盖 |

### 1.2 加权评分（选定项：FlashForge 85.5/100）

| 维度 | 权重 | 得分 | 证据/理由 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 4 | 「给我一个专属小工具/小游戏」是 AI 用户高频诉求；Claude Artifacts 产物 **5 亿+**（2025-06 TechCrunch）；用户抱怨产物丢失「a dozen amazing Artifacts…all gone」 |
| 需求频率与覆盖 | 15% | 4 | 创作可反复发生（造→玩→改→再造）；覆盖开发者+非开发者（Lovable **60% 用户是非开发者**，约 800 万 vibe coder）+ 家庭场景（跨端游戏/教具） |
| 现有方案缺口 | 15% | 4.5 | Artifacts 四大公开抱怨：①无整理（用户自建扩展 Claude-Artifact-Sort）②产物丢失 ③无可靠导出 ④占用用量限额；全部是云端方案结构性缺陷 |
| 可验证差异化 | 15% | 4 | 本地所有权（cap.kv 数据不出设备）+ 版本树只增不改 + 推送到手机 + 跨端高分榜；每项可冒烟断言 |
| 用户收益 | 15% | 4 | 从「AI 给我一个文件然后弄丢」到「随身应用花园」；零云订阅、零用量限额、秒开 |
| 平台适配 | 10% | 5 | 零外部 API、零后台服务、零跨域面（面板数据走宿主通道）；运行环境 CSP=null 已实测确认 srcdoc 沙箱可行 |
| 技术可行性 | 5% | 5 | 交互原型已验证（srcdoc+sandbox 构造法、懒注入）；工作量 ≈ bookmark-dig 的 80%，范式有 xintu/pocket-ledger 三个成熟参照 |
| 开发与维护成本 | 5% | 5 | 无外部服务成本；维护面=静态扫描规则+版本逻辑，均有单测保护 |

主项目竞争优势（最重要的一条）：**本地所有权 + 跨端随身** —— 云端竞品做不到
（它们的核心商业模式就是云托管），本地脚本方案做不到（无面板/无跨端/无版本管理）。

### 1.3 关键假设与止损

| 假设 | 验证方式 | 不成立的止损 |
|---|---|---|
| A1 沙箱 iframe 能跑 AI 生成的游戏/工具 | 原型已验证 + 冒烟真实运行贪吃蛇 | 降级为「源码工坊」（只存导出，无运行时） |
| A2 静态扫描能拦住 AI 生成的联网代码 | 扫描规则单测矩阵 + AI 是合作作者 | 收紧为「仅白名单标签」模式 |
| A3 用户会持续回来玩（而不是造完即弃） | 高分榜使用率、版本迭代次数 | 增强教具/工具类模板，弱化游戏叙事 |

---

## 二、产品定义

- **名称**：闪造 FlashForge（manifest name「闪造应用作坊」）
- **一句话**：聊天里一句话，AI 造出一个真的能玩/能用的小应用，存进你的随身应用花园。
- **目标用户**：Polaris 用户本人（AI 重度用户）及其家庭成员（手机端打开就玩）。
- **核心场景**：
  1. 「给我造一个贪吃蛇，要能记分」→ AI 写码 → ff_create 入库 → 面板/手机开玩 → 高分上榜；
  2. 「给上周那个贪吃蛇加个音效和暂停键」→ ff_iterate 出 v2，旧版可回退；
  3. 「把这个.Push 到手机，娃放学玩」→ ff_push → 手机端「新造好」徽标 → 同一张高分榜。
- **MVP 范围**：七 MCP 工具 + 面板三态（应用架/详情/设置）+ 沙箱运行时 + 分块存储 + 静态扫描 + 跨端高分榜。
- **暂不做**：应用间跳转、分享到 Polaris 之外、多文件工程、npm 依赖、云同步到第三方、AI 自动评分、皮肤市场。
- **成功指标**（可断言）：从指令到可玩 ≤2 轮对话；单应用 ≤200KB；版本回退无损；桌面/手机同榜一致。

## 三、数据模型（cap.kv `ff.*` 键空间，索引即真相）

**纪律：绝不调用 cap.kv list**（实测大数据根上会拖垮宿主，xintu 2026-10-30 实证）。
清单一律走 `ff.apps` 索引键（安全 get/set），索引由 create/iterate/delete 维护、读时愈合。

| 键 | 内容 | 写入方 |
|---|---|---|
| `ff.apps` | 应用索引数组：`[{id,title,kind,tags,head,versions[],createdAt,updatedAt,size,pushedAt}]`（唯一权威，含每版本 scan 报告摘要） | MCP create/iterate/push/delete；面板 push/delete |
| `ff.ver.<id>.<v>.p.<i>` | 第 v 版源码第 i 块（≤24576 字符） | create/iterate |
| `ff.score.<id>` | 成绩数组 `[{score,player,device,ts}]`（追加截尾 ≤200） | 面板（沙箱 postMessage 协议） |
| `ff.settings` | `{nickname, deviceName}` | 面板设置页 |

- 版本号 v 从 1 递增，**只增不改**；「回退」= 把旧版源码复制为新 v(n+1)（changelog 注明「回退自 vN」），head 永远指向最大 v。
- 写路径两步：先写全部源码块，再重写 `ff.apps`（中途失败残留孤儿块无害，读时按 versions 清单取块）。
- 双端并发写 `ff.apps`：读-合并-写（`mergeIndex` 按 per-app updatedAt 新者胜），把丢失窗口压到毫秒级；跨端数据面唯一权威仍是宿主 cap.kv。
- id 形如 `f<10位base36小写>`；`ff.apps` 上限 60 应用（超限拒绝并引导整理）。

## 四、安全模型（静态扫描 + 沙箱 + 只增版本）

1. **沙箱运行时（硬边界）**：面板以 `<iframe sandbox="allow-scripts allow-pointer-lock" srcdoc=…>` 运行——
   无 allow-same-origin（不透明 origin，无 localStorage/Cookie/同源访问）、无 allow-popups、
   无 allow-top-navigation。宿主 CSP=null（tauri.conf.json 实测），srcdoc 不受 CSP 继承限制。
2. **静态扫描（入库闸）** `core.scanSource(html)`：
   - **BLOCK**（拒绝入库）：`fetch(`、`XMLHttpRequest`、`new WebSocket`、`EventSource`、`sendBeacon`、
     `serviceWorker`、`import(`、`importScripts`、外链 `src|href|action="http(s)://`、`url(http…`、`@import http`、
     `.src="http…` 动态赋值、`window.open`、`document.domain`、`top|parent.location=`、`location.assign/replace("http…`)。
   - **WARN**（入库但报告）：`localStorage|sessionStorage|indexedDB|document.cookie`（不透明 origin 下必抛
     SecurityError，引导改内存变量+成绩协议）、`alert|confirm|prompt`（沙箱内静默失效）。
   - 诚实边界：扫描是逐字面量 best-effort，混淆代码（字符串拼接 `this['fe'+'tch']`）理论上可绕过扫描——
     沙箱仍是硬边界；且作者=宿主 AI（合作作者，按工具说明规范生成），非对抗场景。残余风险写入 README。
3. **体量闸**：单版源码 ≤200KB；title ≤60 字；changelog ≤500 字；tags ≤5×12 字。
4. **破坏性操作**：删除需 confirm=id（MCP 与面板双确认）；高分清空同需 confirm；版本永不覆盖，删除是唯一不可逆路径。
5. **完整性**：每版本存 sha256（UTF-8 字节），装配时校验，不符报告损坏并拒绝运行。

## 五、MCP 七工具（AI 面向的接口）

| 工具 | 入参 | 语义 |
|---|---|---|
| `ff_create` | `{title, kind, html, changelog?, tags?}` | 扫描→入库 v1；kind ∈ game/tool/teach |
| `ff_iterate` | `{id, html, changelog?}` | 扫描→追加 v(n+1)，head 前移 |
| `ff_source` | `{id, v?}` | 装配+sha 校验，返回整份源码（新会话续作前读） |
| `ff_list` | `{kind?}` | 索引清单（含最高分），按更新时间倒序 |
| `ff_push` | `{id}` | 标记 pushedAt，手机端「新造好」徽标 + 打开指引 |
| `ff_score` | `{action:'list'|'clear', id, limit?, confirm?}` | 读榜/清榜（clear 需 confirm=id） |
| `ff_delete` | `{id, confirm}` | 删应用+全部版本+成绩（confirm=id） |

**创作契约**（写进工具 description，AI 每次可见）：
- 应用=自包含单 HTML（≤200KB），无网络、无外链资源；样式/逻辑全内联。
- 必须 `<!DOCTYPE html>` + `<meta name="viewport" content="width=device-width, initial-scale=1">`（手机可玩）；
  交互要兼容触屏（pointer/touch 事件），布局自适应竖屏。
- 状态用内存变量；**不要用** localStorage/alert（沙箱会抛错/静默失效）。
- 上报成绩协议：`parent.postMessage({ __ff: 1, type: 'score', score: <number> }, '*')`（游戏结束时调用；
  面板校验来源与形状后入榜）。

## 六、面板（三态，无路由）

- **应用架**：搜索 + 类型筛选（全部/游戏/工具/教具）+ 卡片网格（类型图标、版本、体积、更新时间、最高分、
  「新造好」徽标）；空态给「对 AI 说」引导话术。
- **详情抽屉**：版本时间线（vN·时间·changelog·体积·扫描结果徽标）、运行、查看源码（装配+校验后只读展示+复制）、
  导出 .html（blob 下载，真实所有权）、回退到旧版、删除（两步）、高分榜（player/device/时间）、清空成绩（两步）。
- **运行覆盖层**：懒注入 iframe（打开才建 srcdoc，关即卸载省 CPU）+ 顶栏（标题/版本/关闭）+ 成绩 toast。
- **设置**：昵称（上榜名）、设备名（默认桌面/手机自动）。
- 跨端：桌面与手机浏览器读同一 `ff.*` 键空间；面板自身零网络请求（数据走宿主 invoke 通道）。

## 七、目录与实现分工

```
plugins/flashforge/
├── plugin.json / update.json / package.json / tsconfig.json / .pluginignore / README.md
├── shared/forge-core.js     # 唯一计算权威：LIMITS/键空间/scanSource/chunk+assemble/
│                            # newApp/appendVersion/mergeIndex/scoreOps（CJS 零依赖）
├── mcp/
│   ├── kvclient.js          # 端点自发现桥（xintu 同款：anchor→config→扫端口，md5 Bearer）
│   └── server.js            # JSON-RPC 2.0 stdio，七工具，无状态透传
├── src/                     # 面板（esbuild ESM，external:react）
│   ├── index.tsx / Panel.tsx / AppGrid.tsx / AppDetail.tsx / AppRunner.tsx / Settings.tsx
│   ├── model.ts             # cap.kv 访问（宿主 __POLARIS_HOST_INVOKE__ 双重解包）+ sha(subtle)
│   └── host.ts
└── test/
    ├── run-tests.mjs        # node --test：扫描矩阵/分块回环/索引合并/版本/成绩/限额
    └── smoke-real.mjs       # 真宿主九步冒烟（create→list→source→iterate→push→score→delete）
```

## 八、验收清单

- [ ] 单测全绿（node --test）：扫描矩阵（每条 BLOCK/WARN 各有正反例）、分块回环（ASCII/CJK/恰好一块/2.5 块/sha 失配）、
      mergeIndex 并发语义、版本追加/回退、成绩截尾、全部限额。
- [ ] `tsc --noEmit` 通过；esbuild 面板构建通过。
- [ ] 真宿主冒烟九步全绿（只清理本次产生的键，全程不调 cap.kv list）。
- [ ] 沙箱真实运行验证：生成的贪吃蛇可玩、成绩经 postMessage 入榜、localStorage 尝试按 WARN 报告。
- [ ] pack 产 zip；index.json/update.json 上架条目；README 与实现一致。

## 九、参考来源

- TechCrunch（2025-06）：Claude Artifacts 扩展为 AI 应用创建平台；Artifacts 累计 5 亿+（Anthropic 官方口径转引）。
- r/ClaudeAI：「Organizing and sharing artifacts」「How do you guys store/organise your artifacts?」；
  社区自建 Claude-Artifact-Sort 扩展 —— 整理/持久化缺口实证。
- DemandSage/Taskade/Forbes（2025）：vibe coding 市场约 $6.2B；Lovable 8 个月 $100M ARR、60% 用户为非开发者。
- NotebookLM Audio Overview：免费档每日 3 次生成限额（需求强但平台适配弱于本方向，作落选对照）。
