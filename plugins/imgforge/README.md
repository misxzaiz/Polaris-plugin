# 图片工坊（imgforge）

本地批量图片变换引擎：**压缩、转格式（WebP/AVIF/JPEG/PNG/TIFF）、限宽高缩放、EXIF/GPS 隐私剥离、「压到目标体积」二分逼近**。

面板里选个目录批量执行，或者直接对 AI 说一句话。文件全程不出本机。

## 为什么

- **TinyPNG 类在线工具**：图片要上传到别人的服务器（隐私焦虑）、免费版 20 张/5MB 限额 + 批量节流。
- **Squoosh**：质量最好的网页工具，但一次只能处理一张；CLI 已被 Google 弃维护且带未修 bug。
- **桌面工具**：碎片化——压缩一个、转格式一个、去 EXIF 又一个。
- **AI 时代的新诉求**：处理图片这件事应该像说一句话一样自然——「把下载目录里超过 200KB 的截图压到 200KB 以内」。

图片工坊把以上收进一个本地引擎：**批量 + 全格式 + 目标体积 + 隐私剥离 + AI 编排**。

## 核心动作（变换，不是记录）

| 能力 | 说明 |
|---|---|
| 批量压缩 | JPEG（mozjpeg）/WebP/PNG（调色板量化）/AVIF/TIFF，按质量滑杆 |
| 目标体积 | 「压到 200KB 以内」——自动二分质量逼近；质量到底仍超标时按比例降尺寸并如实注明 |
| 转格式 | 保持原格式 或 显式转 WebP/JPEG/PNG/AVIF/TIFF |
| 缩放 | 最大宽/高限制，等比缩小、绝不放大 |
| 隐私剥离 | EXIF/GPS 定位/设备信息默认剥离（先按 EXIF orientation 回正再剥）；显式可保留 |
| 目录扫描 | 数量/格式分布/总大小/GPS 计数/最大文件 Top——先看清再动手 |

## 使用

### 面板（工作台）

1. 填目录（或点「填入桌面」）→ 扫描 → 看概览（格式分布、GPS 计数）。
2. 勾选文件（全选/只选含 GPS）。
3. 配管道（格式/质量/最大宽高/目标体积/EXIF 策略）→ 开始变换。
4. 进度条 → 报告（前后体积对比、节省百分比、失败原因）→ 可一键发到聊天。

### AI（MCP 四工具）

| 工具 | 干什么 | 适用句式 |
|---|---|---|
| `imgforge_scan` | 目录概览（只读） | 「看看这个文件夹里有多少图片/多大」「有没有带位置信息的照片」 |
| `imgforge_info` | 单图元信息（只读） | 「这张图多大/什么格式」「这张照片有没有位置隐私」 |
| `imgforge_process` | 批量变换落盘 | 「把这个文件夹的 PNG 全转 WebP」「这批截图压到 200KB 以内」「这些照片抹掉位置信息」 |
| `imgforge_jobs` | 最近任务历史 | 「刚才处理了多少张/省了多少」 |

## 安全与隐私

- 服务只绑 `127.0.0.1` + token（cap.kv `imgforge.meta`），**零外网请求**（sharp 纯本地处理）。
- **输入永不修改/删除**；**输出永不覆盖**——输出目录默认 `<输入目录>/imgforge-out/`，重名自动 `-2/-3`。
- 权限仅 `appConfigRead`（定位宿主桥）+ `aiToolAccess`，不声明 network。
- 单文件 ≤100MB、单批 ≤300 张（可调）、并发 1-8（默认 3）——防误操作拖垮机器。

## 边界（如实说明，不做假装能做到的事）

- **不动图**：GIF 变换按首帧输出静态图；不做动图重编码。
- **无 OCR**：图片里的文字读不出来（PDF 工坊同样不做 OCR）。
- **无水印/裁剪**：v0.1 不含，在路线图上。
- **AVIF 较慢**：libvips effort=4，大批量建议 WebP。
- **SVG 变换** = 渲染成位图；**BMP 无编码器**（会明确报错并建议 PNG/WebP）。
- **GPS 检测覆盖** JPEG/PNG/WebP/TIFF 的 EXIF；AVIF/GIF/BMP/SVG 显示「未知」（容器不携带可解析 EXIF），但**剥离动作仍然执行**（重新编码天然丢元数据）。
- HEIC 解码视宿主 libvips 编译情况，不承诺。

## 架构

```
面板 (React, dist/panel.js)
  ├─ 数据面: __POLARIS_HOST_INVOKE__ → cap.kv imgforge.*（设置/历史/meta）
  └─ 字节面: POST http://127.0.0.1:<port>/api/*（token）
服务 (service/main.js, 宿主托管): /api/scan /api/process /api/job /api/probe /api/ping /__health
  └─ engine.js: sharp 扫描/探测/并发管线/目标体积二分
MCP (mcp/server.js, stdio): 四工具直连同一 engine.js（口径不漂移）
shared/core.js: 魔数识别/EXIF-GPS 解析/设置与管道归一/永不覆盖命名（三端同源）
```

历史台账：cap.kv `imgforge.history.*`（环形，面板可清空）。

## 开发

```bash
npm install            # sharp 会拉取平台原生二进制（win32-x64 + wasm32 兜底）
npm run build          # esbuild → dist/panel.js（react 走宿主 shim）
npm run typecheck      # tsc --noEmit
node test/run-tests.mjs  # 五层验证：core/engine/mcp/service/render
node test/smoke-real.mjs # 真宿主桥冒烟（需本机 Polaris 运行中；全绿自清理 imgforge.* 键）
```

打包前 `npm prune --omit=dev`（node_modules 随 zip 出货，devDeps 裁掉）。注意：prune 之后 render 层测试会缺 esbuild，需 `npm install` 恢复后再跑测试。
