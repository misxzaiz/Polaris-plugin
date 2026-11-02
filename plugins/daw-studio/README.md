# AI 乐谱工作台（daw-studio）

让 AI 用乐谱数据自动作曲与记谱，用户在面板（桌面 + 手机）试听、微调、导出。

> 语音合成 ≠ 音乐创作：mimo-tts 是「文本→说话人声」；这里是**音符级作曲**（调式/和弦/节奏/多轨）。

## 能什么

- **AI 骨架生成**（`score_create`）：给 `key/bpm/bars/style`（可选和弦进行），确定性旋律引擎展开成 100% 在调上的乐谱——同骨架同结果，可复现可测试
- **AI 精确记谱**（`score_write`）：AI 直接写完整谱 JSON，strict validator 逐字段把关，AI 幻觉出的越界值被拦截为人话错误（哪个字段、错在哪、合法范围），不会让播放引擎崩掉
- **AI 自查闭环**（`score_analyze`）：调式外音清单（含最近替换建议）、同轨同拍叠音、每小节节奏密度、留白提示——写→析→纠
- **面板演奏**：lookahead 调度（25ms lookahead + AudioContext 时钟精确排程 16 分音符），swing 摆动、波形/低通/八度、多八度钢琴卷帘（C2-C6）、当前步游标高亮
- **导出**：WAV（44.1k 双声道离线渲染）/ MIDI（SMF，拖进 FL Studio/Cubase/剪映）
- **保存管理**：曲谱全文落 `appConfigDir/daw-studio/scores/*.json`（原子写），kv 只存瘦身索引，上限 200 份

## MCP 七工具

| 工具 | 说明 |
|---|---|
| `score_create` | 骨架→引擎展开→落库（title/key 必填；bpm/bars/style/progression 可选） |
| `score_write` | 全量写/覆盖谱（validator 把关；pitch 用 MIDI 21-108 或音名 "C4"） |
| `score_get` / `score_list` | 读谱 / 曲库索引 |
| `score_analyze` | 谱面分析（自查闭环入口） |
| `score_delete` | 删除 |
| `score_export` | 导出 midi（base64）/ json；播放与 WAV 在面板手动触发 |

**AI 永不直接出声**：播放由用户在面板手动触发（既是移动端自动播放策略硬约束，也是产品礼仪）。

## 架构

```
AI ──MCP stdio──▶ mcp/server.js ──kv 读 dawstudio.meta{port,token}──▶ 127.0.0.1 直连──▶ service
面板 ──invoke(cap.kv 读 meta)──▶ 127.0.0.1 直连 + Bearer token ──▶ service
service：CRUD + validator + analyze + kv 索引（零出网，不碰音频设备）
panel：Web Audio 演奏（lookahead）+ 钢琴卷帘 + WAV 导出
存储：appConfigDir/daw-studio/scores/*.json（全文）+ cap.kv 瘦身索引
```

- 安全：仅监听 127.0.0.1；除 `/__health` 外全量 Bearer token（timingSafe 比对，128bit 随机持久化）；请求体 256KB 上限；谱 id 白名单 + 存储根边界校验
- schema 细节见 `docs/daw-studio-plan.md`（选型依据与护栏清单）

## 乐谱 schema（AI 的工作界面）

```jsonc
{
  "meta": { "title": "City Pop", "bpm": 96, "key": "Am", "bars": 4, "style": "melody", "swing": 0 },
  "tracks": [
    { "name": "Lead", "type": "synth", "wave": "sawtooth", "vol": 0.3, "cutoff": 2400, "octaveShift": 0,
      "notes": [{ "step": 0, "pitch": 60, "len": 2, "vel": 0.8 }] },   // step: 每 16 步一小节
    { "name": "Drums", "type": "drum", "vol": 0.5,
      "pattern": { "kick": [0,4,8,12], "snare": [4,12], "hat": "every2", "clap": [] } }
  ]
}
```

上限：16 轨 / 512 音符 / 16 小节 / BPM 40-240 / 音符长 ≤32 步。

## 验证

- `npm test`：34/34 全绿（core 单测 20 + 服务集成 8（假桥+真实子进程：CRUD/validator 呈现/幂等覆盖/路径注入拒绝/selftest）+ MCP stdio 全链路 6（生产发现链 kv→meta→直连、七工具闭环、MIDI SMF 头校验））
- `npx tsc --noEmit`：strict 0 错误
- `npm run build`：dist/panel.js 62KB（external react；shared/core 打包进 bundle 与 service 同口径）

## 已知边界

- Web(https) 部署模式下浏览器拦 `http://127.0.0.1` 混合内容——桌面/手机 WebView 正常（stream-desk/api-bench 同款边界）
- MIDI 导出只含音符与鼓（波形/滤波是合成器概念，SMF 表达不了）
- 低端设备同刻发声上限 16 voice（超出按序截断）
