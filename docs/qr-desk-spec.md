# qr-desk 二维码工作台 spec（v0.1.0）

## 定位
把「生成/解读一个二维码」从联网生成器（要贴 WiFi 密码、2FA 密钥给第三方网页）和手机扫码 guessing，变成 Polaris 内 3 秒本地闭环：生成（PNG/SVG，本地落盘）、解码（拖图进面板，原始载荷 + 结构化字段）、载荷感知（WiFi/vCard/otpauth/迁移码自动识别逐字段解读 + TOTP 实时码）、批量（CSV/JSON → 一组 PNG）。

- **目标用户**：开发者（联调扫码登录/支付/DeepLink、造测试码）+ 普通用户（分享 WiFi、跨设备传文本/链接、迁移 2FA）。
- **核心动作**：变换/生成/解码 —— 非记录类，合规。
- **差异化**：①全程零外联，密钥类载荷不出本机（offline-qr→KeyTools 项目存在性证明此需求）②载荷结构感知（WiFi 转义、otpauth 参数、**Google Authenticator 迁移码 protobuf 解码**为竞品真空）③批量生成 ④MCP 五工具，AI 一句话生成/解码/解读。

## 边界（明确不做）
- 不做摄像头实时扫码（webview 相册/摄像头权限复杂，MVP 裁掉）。
- 不做二维码美化/logo 嵌入/艺术码；不做条形码（Code128/EAN）。
- 不做解码历史台账（禁令：不记录；kv 只存设置，解码结果含密钥不落盘不进日志）。
- 不写用户未指定的目录；输出永不覆盖（冲突 -2 递增）。

## 架构
- `shared/core.js`（纯函数，三端同源）：载荷模板构建（WiFi/vCard/otpauth/text/url，转义规则）、classify + 逐字段解析、HOTP/TOTP（RFC 4226/6238）、otpauth-migration protobuf 手解、CSV 解析、批量计划。
- `shared/render.js`：qrcode.create 矩阵 → SVG 字符串 / PNG（pngjs）/ 终端块字符。`shared/image.js`：PNG（pngjs）/JPEG（jpeg-js）→ RGBA，魔数识别，尺寸护栏（≤4096²、≤10MB）。
- `service/main-src.js`（bundle→main.js）：127.0.0.1:9865，token 鉴权（cap.kv `qr-desk.meta`），`/api/generate|decode|inspect|batch|selftest` + `/__health`；日志落盘轮转，**不落任何载荷内容**。
- `mcp/server-src.js`（bundle→server.js，stdio）：qr_generate / qr_decode / qr_inspect / qr_batch / qr_selftest。
- Panel：生成（类型切换表单+SVG 预览）/解码（拖拽+粘贴+路径）/批量/体检（自检报告）。
- 依赖全 esbuild 进 bundle，运行时零 node_modules；qrcode/jsqr/pngjs/jpeg-js 全纯 JS。

## 验收（可执行）
1. `npm test` = run-tests（core：RFC 6238 SHA1/256/512 金标向量、HOTP RFC 4226 向量、WiFi 转义 round-trip、迁移码手构字节向量、CSV 引号边界、PNG/JPEG 解码路径、批量冲突不覆盖、护栏）+ mcp-verify（stdio 起 server 全工具调用）+ service-verify（随机端口起服务全端点+401/400/超大拒绝）。
2. `pnpm typecheck` 通过（插件 tsconfig）。
3. 真桥冒烟：服务起、生成→PNG 落盘→解码 round-trip 相等。
4. 发布链五步全走（pack/update/index@main/commit/push+purge 双 200）。
