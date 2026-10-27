# {{PLUGIN_NAME}}（{{PLUGIN_ID}}）

> 一句话：TODO（是什么 + 杀手锏 + 数据面）。

## 功能

- TODO

## 架构

```
面板（React bundle，宿主 invoke 通道）
  └─ cap.kv {{PREFIX}}.* 键空间 ←→ 后台服务（tick 循环，原生 fetch，无跨域限制）
                                  └─ MCP server（AI 工具层，stdio）
```

## 键空间契约（权威表——三方一致，改动须同步）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `{{PREFIX}}.settings` | 面板/MCP | 服务 | 全局设置（服务 30s 热读） |
| `{{PREFIX}}.meta` | 服务 | 面板/MCP | 服务心跳（60s） |
| `{{PREFIX}}.cmd.<op>.<nonce>` | 面板/MCP | 服务（消费） | 命令键：服务先删后做（幂等） |
| `{{PREFIX}}.result.<nonce>` | 服务 | 面板/MCP | 命令结果 |
| TODO | | | |

## 数据与隐私

- 数据全部在本地 cap.kv（Polaris 数据根），不出设备。
- TODO：涉及外网抓取/上传的如实说明。

## 开发

```bash
npm install
npm run typecheck
npm run build          # esbuild → dist/panel.js
node test/run-tests.mjs        # 离线单测（shared/core.js）
node test/smoke-real.mjs       # 真实桥冒烟（需本机 Polaris 运行中；自清理）
```

## 服务日志（排障入口）

`<appConfigDir>/{{PLUGIN_ID}}.log`（Windows 一般为 `%APPDATA%/Polaris/`；512KB 轮转 `.old`）。

## 已知边界

- TODO（不采集什么/不支持什么，如实写）
