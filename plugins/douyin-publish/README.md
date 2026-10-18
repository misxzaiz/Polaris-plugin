# douyin-publish — 抖音自动发布插件

抖音视频自动发布流水线的辅助编排层（MCP 工具），配合 **Polaris 内置浏览器**由 AI 执行完整发布流程。
附带**声音信息收集**：ffprobe 提取每个视频的音频元数据，归档进发布记录，服务后续配音/BGM 一致性。

## 能力

| MCP 工具 | 作用 |
|---|---|
| `douyin_prepare_publish` | 登记待发布视频（校验文件 + sha256 + 状态机，**幂等**：同文件已发布自动跳过） |
| `douyin_pick_file` | 注入原生文件对话框（参数化 ps1，实时枚举 `#32770`，无硬编码 hwnd） |
| `douyin_publish_status` | 查询/恢复发布状态（**断点续跑**：中断后先查状态再继续） |
| `douyin_record_result` | 发布确认后登记 item_id/url/状态（published 必须带 itemId/url，防误标） |
| `douyin_collect_audio` | **声音信息收集**：有无音轨/编码/采样率/时长/分辨率/EBU R128 响度 + 来源/音色溯源 |
| `douyin_list_published` | 列出发布记录（倒序，可按状态过滤） |

## 使用（AI 执行视角）

1. **准备**：AI 打开 `https://creator.douyin.com/creator-micro/content/upload`（已登录态）
2. **登记**：`douyin_prepare_publish { file, title, description?, topics? }`
3. **上传**：AI 点「上传视频」→ `douyin_pick_file { file }`（自动注入原生对话框）
4. **等待**：AI 轮询浏览器控制台出现 `isUploading false` + 文件名（超时 120s）
5. **填写**：AI `browser_fill` 标题/描述/话题（沿用手工流程 F7）
6. **发布**：人工确认 → AI `scrollIntoView` + JS `element.click()`（沿用 F5/F6）
7. **确认**：管理页 `browser_reload` → 找到标题 → 抓 item_id/url → `douyin_record_result { file, status:"published", itemId, url }`
8. **声音收集**（可选）：`douyin_collect_audio { file, audioSource:"tts|voiceclone|bgm|人工", voiceId:"冰糖|白桦|克隆ID" }`

> 断点续跑：若中途中断，先 `douyin_publish_status { file }` 查状态——
> `uploading` → 直接到步骤 5；`pending` → 从步骤 3 重来；`published` → 已发布，跳过。

## 声音信息收集

每次发布可选附加**声音元数据**，写入发布记录 `audio` 字段：

| 字段 | 说明 |
|---|---|
| `hasAudioTrack` | 视频是否含音轨（实测 duyu/sprout 均为 **false**——纯画面动画，提示需配音） |
| `audioCodec` / `audioBitrateKbps` / `audioSampleRateHz` | 音轨编码信息 |
| `audioDurationSec` / `formatDurationSec` | 音轨时长 / 总时长 |
| `videoResolution` | 分辨率 |
| `loudnessLufs` | EBU R128 集成响度（需 ffmpeg，缺 ebur128 时静默降级） |
| `audioSource` / `voiceId` | 声音来源 / 音色标识（配音一致性追踪） |

### 后续扩展（已规划，本期未实现）
- **声音素材库**：归档每次配音文本 + TTS 参数（音色/语速/风格），建成可检索、可复用的声音资产库
- **语音样本采集**：录制/上传语音样本，供 mimo-tts 音色克隆，保证系列旁白音色一致

## 配置

插件配置（面板「抖音自动发布」或 `config.json → plugins["douyin-publish"]`）：

| key | 默认 | 说明 |
|---|---|---|
| `ffprobePath` | `ffprobe` | ffprobe 路径（PATH 或绝对路径） |
| `ffmpegPath` | `ffmpeg` | ffmpeg 路径（可选，用于响度） |
| `douyinHomeUrl` | `https://creator.douyin.com/creator-micro/content/upload` | 上传页 |

## 数据与状态

- 状态文件：`<pluginDir>/state/publish.json`（按 sha256 索引，单点写入）
- 发布动作仍由 AI + 内置浏览器执行（本插件不做无人值守静默发布，保留人工确认点）

## 开发

```bash
node --check mcp/server.js          # 语法检查
node smoke-test.js                  # MCP 协议冒烟（tools/list + 全工具链路 + 幂等）
```
