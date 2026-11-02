# daw-studio（AI 乐谱工作台）选型与设计文档

> 2026-11-02 · 生产级插件交付选型记录。选型方法同 stream-desk：先过方向硬闸，再以真实市场证据评分，最后以生态空白校验。本文同时是实施蓝图（schema/MCP 签名/meta 契约/护栏/分阶段清单以本文为准）。

## 一、需求证据（可追溯）

### 1.1 方向：AI 可驱动的乐谱工作台（谱写→演奏→导出→管理）

**定位**：不是「网页玩具 DAW」（用户提供的 Mini DAW 原型即为该档位的典型实现），而是**让 AI 用严格 schema 的乐谱数据自动演奏与作曲**的插件。AI 经 MCP 工具写谱/改谱/分析自查，用户在面板（含 Android app 端）试听、微调、导出 WAV/MIDI。

**痛点一（AI 出声链路断裂）**：通用 LLM 想让用户听到一段旋律，现状只有三条烂路——
1. 生成 ABCnotation/MIDI 文本让用户自己找工具打开（门槛外溢）
2. Web Speech API / TTS 语音合成（mimo-tts 已占，且那是说话不是音乐）
3. 前端合成器原型（用户 Mini DAW）**没有 AI 入口**：16 步 × 12 音 × 手点格子，AI 无法表达，也无法持久化

**痛点二（浏览器的结构性限制）**：`AudioContext` 必须用户手势 resume（自动播放策略）；`rAF` 步进调度在移动端切后台/掉帧必漂——原型 `if(ts-lastStepTime>=interval)` 每帧最多 1 步不 catch-up，「AI 谱面→精确演奏」不可信。这些限制决定了：**谱写（AI 可做）与演奏（必须面板做）必须分离**，正好与插件平台的 service/MCP/panel 三件套同构。

**痛点三（无持久化与移动端缺位）**：原型状态全在内存（`drumPatterns`/`TRACKS.notes`），刷新即失；导出只有 WAV 且 `getChannelData(0)` 丢立体声。「生成旋律→保存→明天再改」这个基本闭环不存在。

### 1.2 生态空白校验（82 插件全量盘点）

2026-11-02 对 `index.json` + `plugins/` 目录全量盘点 + grep `daw|music|synth|piano|audio`：**零音乐创作占位**。唯二音频相关：

| 插件 | 功能 | 为何不撞车 |
|---|---|---|
| mimo-tts | 语音合成（文本→说话人声） | 语音 ≠ 音乐；无音符/调式/节奏概念 |
| douyin-publish | ffprobe 提取音频**元数据**归档 | 只读分析，不生成 |

音乐创作（音符级谱写/演奏/导出）是生态内真实空白。

### 1.3 竞品格局

| 现状 | 缺陷 |
|---|---|
| 网页 Mini DAW（开源原型一抓一把） | 无 AI 入口、无持久化、无移动端、调度不精确 |
| FL Studio / Ableton / Cubase | 桌面重器，无 AI 对话式谱写，学习成本极高 |
| ChatGPT/豆包「生成 MIDI」 | 输出文本让用户自己找播放器，链路断裂 |
| Suno 等云端 AI 音乐 | 外发整首歌、不可编辑谱面、不可本地化、无音符级控制 |
| 本生态 82 插件 | 零占位 |

### 1.4 目标用户与场景

- **AI 对话作曲**：「来一段 City Pop 风格的 8 小节循环」→ AI 产谱 → 用户手机上点开试听 → 微调 → 导出
- **乐理学习**：AI 写一条 Am 琶音练习，学生改两个音，`score_analyze` 告诉你改出调了
- **素材生产**：给短视频/播客找 4 小节 loop，导出 WAV 拖进剪映

## 二、评分与定位（对齐 stream-desk 评分维度）

| 维度 | 分 | 依据 |
|---|---|---|
| 痛点 20% | 3.5 | 真实但偏长尾（非人人都写歌）；AI 创作浪潮在涨 |
| 频率 15% | 3 | 创作类天然低频，但 loop 素材需求偏中频 |
| 缺口 15% | **5** | 生态零占位；平台三件套与音频分工天然同构 |
| 差异化 15% | **4.5** | 「AI 谱面级驱动」而非「AI 出 mp3」；骨架+确定性展开保证可听性 |
| 收益 15% | 4 | 娱乐+学习+素材三场景 |
| 适配 10% | **5** | service/MCP/panel 分工与谱写/演奏分离完美对齐 |
| 可行 5% | 4.5 | 无网络依赖、无重依赖；Web Audio 成熟 |
| 成本 5% | 4 | 单插件标准三件套，无二进制 vendor |
| **总分** | **83** | 过线（对标 stream-desk 89.5 的长尾类，靠缺口+差异化+适配拉起） |

## 三、关键假设与 MVP 验证方式

| 假设 | 验证方式 | 状态 |
|---|---|---|
| 严格 validator 能拦截 AI 幻觉越界值 | 单测：pitch>127/step 越界/len 0/未知字段 → 结构化人话错误 | ✅ core 单测 9 例 |
| 「骨架+确定性展开」产出可听旋律 | core 单测：固定种子展开，断言音符全在调上、bass<lead 声部不交叠 | ✅ 五 style 全过+可复现断言 |
| AI 写→analyze→自纠闭环成立 | MCP stdio 集成：score_write 幻觉值 → isError 人话呈现；score_analyze 报出 | ✅ mcp.test 6 例 |
| lookahead 调度精确还原节奏 | 面板侧 engine.ts（AudioContext 时钟+catch-up while 循环）；单测覆盖 swing 排程公式 | ✅（真机听感待人工验收） |
| Android 端经同一面板通路试听 | 真桥冒烟 + 手机端人工验收 | ⏳ 待真宿主验收 |

**止损线**：若真宿主验收发现 Android webview 的 Web Audio 存在不可绕过的兼容问题（不太可能——WebView 45+ 支持），则 app 端降级为「查看+管理谱库+导出」，演奏仅在桌面，如实报告。

## 四、技术设计

### 4.1 架构（stream-desk/dep-probe 已验证范式）

```
AI ──MCP stdio──▶ mcp/server.js ──kv 读 dawstudio.meta{port,token}──▶ 127.0.0.1 直连──▶ service
面板(桌面+Android) ──invoke(cap.kv 读 meta)──▶ 127.0.0.1 直连 + Bearer token ──▶ service
service：曲谱 CRUD + validator + 谱面分析 + kv 投影 + WAV 渲染(v0.2)
panel：Web Audio 演奏（lookahead 调度）+ 钢琴卷帘 + WAV 导出(OfflineAudioContext)
存储：appConfigDir/daw-studio/scores/*.json（全文）+ cap.kv 瘦身索引
```

三件套职责（对齐 dep-probe manifest 结构）：

| 角色 | 职责 | 明确不做 |
|---|---|---|
| service | 曲谱 CRUD/校验/分析/索引投影 | 不碰音频设备、零出网 |
| mcp/server.js | 七工具 AI 面 | 不直接控制播放 |
| panel | 演奏/编辑/导出/试听 | 不落盘（全经 service） |

### 4.2 跨域与安全（stream-desk 范式逐条照抄）

- service 仅监听 **127.0.0.1**，端口用 manifest 固定值 + `{{port}}` 注入（避 weibian 自选端口防抖坑）
- token：128bit 随机（`crypto.randomBytes(24)`），持久化进 kv meta，重启不换；除 `/__health` 外全量 `Authorization: Bearer` + timingSafeEqual（stream-desk `main.js:599-610` 同款）
- CORS：面板 iframe 跨源必须显式头（`ACAO:*` + Allow-Headers 含 Authorization）——token 随机使 `*` 安全（stream-desk 实证注释）
- meta 心跳 60s：`dawstudio.meta = {port, token, pid, version, startedAt, live}`
- 面板带服务重启自救：`cap.pluginServiceManager restart`（mcp-probe 契约）
- app 端：Android 上 service 由宿主本机拉起，面板通路与桌面完全一致，**零额外跨域工作**（marketplace 手机端修复已实证该通路）

### 4.3 乐谱 schema（AI 的工作界面）

```jsonc
{
  "meta": {
    "title": "City Pop Loop",     // 1-64 字符
    "bpm": 96,                     // 40-240 整数
    "key": "Am",                   // 调式：12 音 × {maj, min}
    "bars": 4,                     // 1-16 小节
    "style": "arpeggio",           // 可选：骨架展开风格提示
    "swing": 0                     // 0-60 摆动百分比
  },
  "tracks": [
    {
      "name": "Lead",              // 1-24 字符，谱内唯一
      "type": "synth",             // synth | drum
      "wave": "sawtooth",          // synth: sine|square|sawtooth|triangle
      "vol": 0.3,                  // 0-1
      "cutoff": 2000,              // 200-12000 Hz（低通）
      "octaveShift": 0,            // -2..2
      "notes": [
        { "step": 0, "pitch": 60, "len": 2, "vel": 0.8 }
        // step: 0-255（16 步/小节 × bars 上限）；pitch: MIDI 21-108；
        // len: 1-32 步；vel: 0.1-1
      ]
    },
    {
      "name": "Drums", "type": "drum",
      "pattern": { "kick": [0,4,8,12], "snare": [4,12], "hat": "every2", "clap": [] }
      // 或离散步数组；hat 支持 "every2"/"every4" 快捷
    }
  ]
}
```

设计决策与理由：

1. **pitch 用 MIDI 号而非原型的 0-11 半音**——大模型对 MIDI 编号 + 调式约束的掌握远好于自定义枚举，AI 写谱准确率高一个量级。21-108 对应真实钢琴域，同时截掉极端值。
2. **validator 双重把关**（`shared/core` strict 校验，service 落库前 + MCP 写入前）：逐字段类型/范围/上限校验，错误信息人话化（哪个字段、错在哪、合法范围），AI 幻觉值被拦截为可读错误而非播放引擎崩溃。单谱上限：16 轨 × 512 音符；step 必须 < bars×16。
3. **swing 放 meta**：确定性展开层与面板调度共用同一摆动算法，保证「谱面即真理」——AI 写的节奏型被精确还原。
4. **鼓轨模式化**（`pattern` 而非音符数组）：AI 写鼓的真实习惯就是「几小节 loop + 偶尔过门」，模式化表达比 512 个音符事件省 token 且更可靠。

### 4.4 AI 驱动的两条路径

**路径 A：乐谱自动演奏**（AI 当记谱员）
- AI 经 `score_write` 写完整谱（或改既有谱），kv 索引标记 `updatedAt` 即可，面板打开谱库自然看到
- **AI 永不直接出声**：面板试听永远由用户手势触发（既是移动端自动播放策略硬约束，也是产品礼仪）
- 可选 `style` 提示驱动展开（见路径 B 引擎）

**路径 B：生成全新旋律**（AI 当作曲家）——分层生成，这是本插件的核心差异化
1. AI 产出结构骨架：调式、BPM、和弦进行（如 `["Am","F","C","G"]`）、乐句意图
2. **service 内置算法旋律引擎**（确定性、固定种子可复现）：
   - 和弦音栅格化：强拍落和弦音、弱拍允许级进经过音
   - 节奏栅格：按 style 预设（`arpeggio`/`walkbass`/`pad`/`melody`/`riff`）套节奏型模板
   - 动机约束：第一小节动机在后续小节移调/倒影重现（保证「像一段音乐」而非随机音符汤）
   - 约束求解保证：输出 100% 在调上、无同小节声部冲突
3. AI 再做命名/描述/按需微调（「把第 3 小节改得更明亮」→ AI 定位到 step 区间改 pitch）

路径 B 的价值：纯 LLM 逐音生成必翻车（轨外音、无节奏逻辑）；「骨架+确定性展开」让 AI 产出 100% 可听，且展开是确定性函数——同骨架同结果，可测试。

### 4.5 MCP 工具面（七工具）

| 工具 | 签名要点 | 说明 |
|---|---|---|
| `score_create` | `{title, bpm?, key?, bars?, style?, progression?}` | 骨架→引擎展开→落库，返回完整谱 |
| `score_write` | `{score}` 全量写 | validator 把关；幂等 upsert by title（同名带 `-v2` 提示） |
| `score_get` | `{id \| title}` | 返回完整谱 JSON |
| `score_list` | `{}` | 索引投影（id/标题/调式/BPM/小节/时长估算/updatedAt） |
| `score_analyze` | `{id}` | AI 可读分析：调式外音清单、节奏密度、声部冲突、建议——自查闭环入口 |
| `score_delete` | `{id}` | 删除（索引同步清理） |
| `score_export` | `{id, format: "midi"\|"json"}` | v0.1 返回 MIDI base64 / 谱 JSON；v0.2 加 `wav`（service 渲染） |

**analyze 自查闭环**是「AI 可驱动」区别于「AI 能调 API」的本质：AI 编辑后自查「我的改动听起来对不对」（谱面数学：音阶比对/冲突检测），形成 写→析→纠 循环。所有工具为一参一义（坑清单 MCP 纪律）。

### 4.6 演奏引擎（panel 侧，修原型三处缺陷）

1. **lookahead 调度器替换 rAF 步进**：`setInterval(25ms)` + lookahead 0.1s，以 `ac.currentTime` 精确排程 16 分音符事件（Web Audio 官方推荐范式）。AI 谱面节奏被精确还原，这是「演奏可信」的硬前提。swing 在排程时应用：偶数步不动，奇数步 +`stepDur×swing%`。
2. **多八度钢琴卷帘**：pitch 用 MIDI 号后渲染 C2-C6 滚动视窗，当前轨高亮列游标（原型缺当前步高亮，死代码 `var cells=...` 一并清除）。
3. **触摸修正**：`touch-action:none` 只加网格容器，range slider 放开；iOS 切后台 `visibilitychange` 时 pause+回前台 resume。
4. **voice cap ~16**：同刻最多 16 个发声，超出按 vel 优先级截断（低端 Android webview 护栏）。
5. **WAV 导出**：`OfflineAudioContext` 离线渲染（原型方案保留）+ 修原型缺陷：采样率 44.1k 双声道导出（不再 `getChannelData(0)` 丢声道）。
6. **MIDI 导出**：`score_export` 的 MIDI 路径 + 面板下载按钮——用户拖进 FL/Cubase，「玩具→工具」跳板，成本几十行。

### 4.7 存储

- 全文：`appConfigDir/daw-studio/scores/<id>.json`（原子写：tmp+rename），单文件上限 ~64KB
- kv 索引：`dawstudio.scores` = `[{id,title,key,bpm,bars,dur,updatedAt}]`（条目 ~120B，上限 200 份，超限拒新建并提示清理）
- 设置：`dawstudio.settings`（默认 BPM/音色偏好）
- meta：`dawstudio.meta`（心跳 60s）
- Windows 编码纪律：Node fs + UTF-8 无 BOM（坑清单）

### 4.8 护栏清单

- 网络：**零出站**，manifest 不开 `network` 权限
- service 仅 127.0.0.1；全量 Bearer token（除 `/__health`）；请求体 256KB 上限
- validator：pitch 21-108 / step < bars×16 / len 1-32 / vel 0.1-1 / 16 轨 / 512 音符
- 渲染（v0.2）：时长 ≤ 2 分钟；MCP `score_export` 无时长阻塞风险（MIDI 是纯编码）
- 存储：200 份轮换上限；索引与文件一致性由启动 sweep 保证（stream-desk 孤儿清理同款）
- 移动端：播放永不自动出声（用户手势门禁）；voice cap

## 五、分阶段实施

| 阶段 | 内容 | 验证 |
|---|---|---|
| P1 core | schema validator + 旋律引擎 + analyze（纯函数，`shared/core`） | 离线单测（validator 拦截/展开可听性断言/analyze 报出） |
| P2 service+MCP | REST CRUD + 七工具 + meta 心跳 + token | 假桥集成 + MCP stdio 全链路 + 真桥冒烟 |
| P3 panel | 演奏引擎（lookahead）+ 钢琴卷帘 + 谱库管理 + WAV/MIDI 导出 | tsc strict + esbuild + 手机端人工验收 |
| P4 发布 | pack + validate_manifest + index.json 三步同步 | sha256 对齐（relay-devkit/paper-radar SOP） |

**v0.2 候选**（不进 v0.1）：service 侧纯 JS DSP 离线渲染 WAV（让 AI 经 MCP 独立拿到音频产物做静音检测）；多小节编曲结构（intro/verse）；MIDI 导入。

## 六、风险与边界

| 风险 | 程度 | 对策 |
|---|---|---|
| Android webview 音频性能 | 中 | voice cap 16 + Pad 单振荡器 + 真机验收止损线（§三） |
| AI 写谱越调式 | 低 | 引擎展开兜底 + analyze 自查闭环 |
| 与 mimo-tts 概念混淆 | 低 | README 开篇即写「语音合成 ≠ 音乐创作」边界 |
| 创作类低频 | 中 | 定位为「AI 创作浪潮的基础设施」而非日用工具；评分已如实反映（83 分） |
| kv 双层包裹 | 已知 | kvclient 照 stream-desk 生产同款逐字节拷贝（`value in m ? m.value : m` 双解包） |

## 七、验证门槛（对齐坑清单）

- 前端：`npx tsc --noEmit`（strict）+ esbuild 打包
- core/service：独立 CLI harness + 临时数据根（各插件 test/ 现成 harness 模式）
- MCP：stdio JSON-RPC 全链路（stderr 日志纪律）
- 真桥冒烟：真实宿主 kv + 真实服务子进程 + 自清理
- 发布：`node scripts/pack.js plugins/daw-studio` + validate_manifest + index.json 条目 sha256 入库
