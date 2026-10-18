# 2D 手绘动画（animation-2d）

Polaris 内的 AI 2D 手绘逐帧动画插件：p5.brush 水墨风引擎（基于
[ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) 去品牌化自研），
让 Polaris 中运行的任何 AI 能渲染手绘风动画并用 GLM-4V 质检迭代。

## 原理

```
Polaris AI ──(MCP tools/call)──▶ animation-2d MCP server ──spawn──▶ render.mjs（headless Chrome + p5.brush）
                                                                        │
                                                        PNG/JPG/MP4 落盘 out/
活动栏面板 ──(services HTTP)──▶ server.js（渲染/预览/质检代理）
```

- 引擎：p5.brush 水墨笔触 + 纯 2D 手绘逐帧（boil 线稿、纸纹、墨晕）
- 质检：GLM-4V（复用 image-recognition 插件配置）

## MCP 工具

| 工具 | 说明 |
|---|---|
| `render_still` | 渲染指定时刻静帧 PNG |
| `render_contact_sheet` | 多帧联系方式图 JPG（快速检查节奏/构图） |
| `render_video` | 直出 MP4（单 worker，较慢） |
| `render_frames` | 并行渲染帧序列（出片最快路径） |
| `encode_video` | 帧序列 → MP4 |
| `vision_check` | GLM-4V 识图质检 |

## 前置条件

- Chrome（默认路径 `C:/Program Files/Google/Chrome/Application/chrome.exe`）
- ffmpeg（编码 MP4 用；`render_frames` 不需要）
- 图片识别插件（`image-recognition`）已配置 API Key（vision_check 用）

## 使用

1. 活动栏出现「2D 动画」图标 → 面板可触发渲染/预览/质检
2. 或直接让 AI 调用 MCP 工具：

```
渲染静帧检查： render_still(times="0,2.5,5") → vision_check(image=<最新帧>)
出片：        render_frames() → encode_video()
```

## 制作规则

`ANIMATION_GUIDE.md` 是完整的动画制作规则（纯 2D 手绘/无文字/每镜有事/时序）。
AI 创作前应通读；`src/` 为场景代码（`src/scenes/*.js` 定义各镜头，`src/config.js` 定义时长/节拍）。

## 已知注意事项

- 渲染是 CPU/GPU 密集任务：静帧约几百 ms/帧，出片建议用 `render_frames` 并行 + `encode_video`。
- `render.mjs` 的 `--clip` 单 worker 直出较慢，长片勿用。
- 面板预览通过渲染服务 `/file` 端点读取插件目录内图片（路径隔离，防任意文件读取）。
- 背景音乐可选（`--audio`），mimo-tts 语音合成就绪后可接入配音。
