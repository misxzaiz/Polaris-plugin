# 二维码工作台 qr-desk

> 生成 / 解码 / 载荷解读 / 批量出码，3 秒本地闭环。WiFi 密码、2FA 密钥这类敏感载荷不再贴给联网生成器。

## 核心能力

| 能力 | 说明 |
|---|---|
| 生成 | 文本 / URL / WiFi（转义自动处理）/ vCard 3.0 / otpauth（TOTP·HOTP）模板 → PNG + SVG + 终端预览；纠错级别 L/M/Q/H、静区、像素缩放可调；可落盘（同名永不覆盖，`-2` 递增） |
| 解码 | 拖图 / 点击选图 / Ctrl+V 粘贴截图 / 文件路径 → 原始载荷 + 类型识别 + 逐字段解读；PNG/JPEG，≤10MB、≤4096²，自动反色 |
| 载荷感知 | WiFi（转义还原）/ vCard（折行 unfold）/ otpauth（参数 + **TOTP 实时码预览**）/ URL / MECARD / mailto / tel / sms / geo |
| 迁移码 | **Google Authenticator 迁移 QR（otpauth-migration://）protobuf 逐账户解码**：名称/签发方/类型/算法/位数/计数 + Base32 密钥 + 当前码 |
| 批量 | CSV（RFC 4180 子集）或 JSON 行 + `{列名}` 模板 → 一组 PNG 落盘，同名递增，≤500 行，异步任务进度可查 |
| 体检 | 试金石 12 项自检：RFC 4226/6238 OTP 金标向量、全链路生成→PNG→解码 round-trip、护栏拒绝、CSV/批量命名 |

## 与 AI 的对话约定（MCP 五工具）

| 工具 | 用途 |
|---|---|
| `qr_generate` | 文本或结构化模板生成，可落盘返回路径 |
| `qr_decode` | 图片路径 → 载荷 + 解读（含迁移码逐账户 + TOTP 当前码） |
| `qr_inspect` | 载荷文本 → 类型 + 字段 + OTP 实时码 |
| `qr_batch` | CSV/JSON 批量出码到指定目录 |
| `qr_selftest` | 12 项自检报告 |

## 隐私口径

- 全程本地计算，**零外联**；服务只绑 127.0.0.1 + token 鉴权。
- 载荷与解码结果**不落 kv、不进日志**（日志只记类型/尺寸/数量）；kv 仅存「默认输出目录」一项设置。
- 密钥类载荷只在生成/解码请求的内存与响应里存在。

## 开发与验证

```bash
npm install
npm run build        # esbuild：service/main.js + mcp/server.js + dist/panel.js（运行时零 node_modules）
npm run typecheck    # tsc --noEmit（strict）
npm test             # run-tests（37 断言：RFC 金标 + round-trip + 护栏）
                     # + mcp-verify（stdio 子进程全工具）
                     # + service-verify（随机端口真服务：401/400/超限/job 轮询）
```

## 已知边界

- 解码仅支持 PNG/JPEG（GIF/WebP/HEIC 明确提示转格式）；不做摄像头实时扫码。
- 迁移码 protobuf 实现为 wire-format 子集（Google Authenticator 导出格式）；遇到未知字段按 protobuf 规范跳过。
- OTP 预览只在解析当下计算一次（面板重新解码即刷新），不做后台倒计时。
