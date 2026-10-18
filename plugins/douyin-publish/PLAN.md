# douyin-publish 插件 — 规划 v1

> 状态：Proposed ｜ 创建：2026-10-18 ｜ 前置分析：`plans/douyin-auto-publish-plan.md`（Polaris 仓库）
> 目标：把「内置浏览器 + 原生文件对话框注入 + 页面自动化」的抖音发布流程固化为 **Polaris 插件**（MCP 工具），并集成**声音信息收集**作为后续扩展。
> 位置：`Polaris-plugin/plugins/douyin-publish/`

---

## 1. 背景

2026-10-18 手工发布 `duyu.mp4`（29M / 24.0s / 1920x1080）到抖音成功（`create_v2` 200，管理页确认「已发布」）。
前一轮已产出分析 spec（`plans/douyin-auto-publish-plan.md`），本文件是**插件实现规约**：把发布流程做成 AI 可调用、可断点恢复、带幂等记录的 MCP 工具集。

## 2. 插件形态与归属

```
Polaris-plugin/plugins/douyin-publish/
├── plugin.json          # manifest（mcpServers + configSchema + permissions）
├── update.json          # 更新清单（同最新 plugin.json）
├── mcp/
│   ├── server.js        # MCP server：发布编排 + 状态幂等 + 声音收集（stdio JSON-RPC 2.0）
│   └── scripts/
│       ├── pick_file.ps1        # 参数化原生文件对话框注入（取代 temp/ 下的硬编码脚本）
│       ├── enum_dialog.ps1      # 枚举 #32770 对话框结构（诊断用）
│       └── analyze_audio.ps1    # ffprobe 音频元数据提取（声音信息收集）
├── README.md            # 使用文档（playbook 要点 + 声音收集说明）
└── .pluginignore        # 排除 src/node_modules 等
```

- **MCP server 归属**：stdio，`node {{pluginDir}}/mcp/server.js {{appConfigDir}} {{pluginDir}}`（对齐 mimo-tts 范式）。
- **发布动作仍由 AI 通过 Polaris 内置浏览器执行**（browser_click/fill/evaluate_script），插件提供：
  - `douyin_prepare_publish`：登记视频文件（校验存在性/时长/大小，写状态机）
  - `douyin_pick_file`：调用 `pick_file.ps1` 注入原生文件对话框（替代硬编码脚本）
  - `douyin_publish_status`：查询/恢复上次发布状态（断点续跑）
  - `douyin_record_result`：发布确认后登记 item_id/URL/状态 → 幂等
  - `douyin_collect_audio`：**声音信息收集** —— ffprobe 提取音频流元数据（有/无音轨、编码、时长、响度），归档到发布记录
  - `douyin_list_published`：列出已发布记录
- **状态所有权**：`{{pluginDir}}/state/publish.json` 单点写入（AGENTS.md §2.2 唯一权威）。

## 3. 状态机（对齐 plans/douyin-auto-publish-plan.md §6）

```
file → [douyin_prepare_publish] → pending
  → [douyin_pick_file] 注入对话框 → uploading
  → AI 等 isUploading false → filling（AI 填标题/描述/话题）
  → 人工确认 → AI browser 点发布 → publishing
  → 管理页 reload 确认 → [douyin_record_result] → published ✅
  → [douyin_collect_audio] 附加声音元数据 → audio_collected（可选）
```

幂等：`publish.json` 按文件 sha256 索引；`published` 状态直接跳过。

## 4. 声音信息收集（本期实现部分）

在发布记录中附带音频元数据，**满足动画流水线后续复用**（配音/BGM/旁白一致）：

| 字段 | 来源 | 用途 |
|---|---|---|
| `hasAudioTrack` | ffprobe streams 判断 | 视频是否有声音 |
| `audioCodec` / `audioBitrate` | ffprobe | 编码信息 |
| `audioDuration` | ffprobe | 音轨时长 |
| `loudness`（可选） | ffmpeg ebur128（有 ffmpeg 时） | 响度 |
| `audioSource` | AI 填写（tts/voiceclone/bgm/人工） | 素材溯源 |
| `voiceId` | AI 填写（冰糖/白桦/克隆 id） | 音色一致性 |

> 后续扩展（README 注明，不本期实现）：声音素材库（配音文本+TTS 参数归档）、语音样本采集（mimo-tts 克隆样本库）。

## 5. 验收标准

- [ ] `tools/list` 返回 6 个工具
- [ ] `douyin_prepare_publish` 对 `out/duyu.mp4` 登记成功（幂等去重）
- [ ] `douyin_collect_audio` 实测返回 duyu.mp4 的音频元数据（hasAudioTrack=true）
- [ ] `douyin_pick_file` 生成的 ps1 参数化（hwnd 实时枚举，非硬编码）
- [ ] README 含「声音信息收集」说明与后续扩展
