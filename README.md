# Polaris Plugin Marketplace

> Polaris 插件中心索引仓库 —— 为 [Polaris](https://github.com/misxzaiz/Polaris) 提供插件发现、安装与更新服务。

[![Status](https://img.shields.io/badge/status-WIP-yellow)]()

## 这是什么

Polaris 客户端已内置完整的插件系统（MCP 工具 / 活动栏面板 / 聊天卡片 / 后台服务），支持通过 `installRemotePlugin(sourceUrl)` 从 URL 安装 zip 包，并通过 manifest `origin.updateUrl` / `origin.downloadUrl` 检查与应用更新。

但客户端**没有中心化的插件发现渠道**——用户必须手动填写 sourceUrl。本仓库补齐这一环：

| 角色 | 职责 |
|------|------|
| **本仓库** | 维护插件索引 `index.json` + 每个插件的 `plugin.json` / `update.json` / zip 包 |
| **Polaris 客户端** | 拉取索引 → 浏览 → 调用 `installRemotePlugin(downloadUrl)` 一键安装 → 后续 `checkPluginUpdate` 自动比对 `updateUrl` |

协议与 Polaris 现有接口**零侵入兼容**——客户端无需改动即可消费本仓库。

## 仓库结构

```
Polaris-plugin/
├── index.json                  # 顶层插件索引（商城列表）
├── schemas/
│   └── index.schema.json       # 索引 JSON Schema
├── plugins/                    # 插件源码 + 打包产物
│   └── marketplace/            # 插件商城插件本身
│       ├── plugin.json         # 插件 manifest（Polaris 规范）
│       ├── update.json         # 更新清单（供 checkPluginUpdate 拉取）
│       ├── mcp/server.js       # 插件实现
│       ├── src/ + dist/        # 面板源码与构建产物
│       └── marketplace.zip     # 安装包（由 scripts/pack 生成）
├── docs/                       # 商城使用与上架文档
│   ├── SPEC.md                # 插件规范
│   ├── PUBLISHING.md           # 上架指南
│   └── plugin-development-guide.md  # Polaris 插件开发指南（完整）
├── scripts/                    # 索引校验 / 打包脚本
└── examples/                   # 各类插件模板
```

## 安装插件（终端用户）

### 方式 A：在 Polaris 设置 → 插件 → 远程安装
填入插件 zip 的 `downloadUrl`，例如：
```
https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/marketplace/marketplace.zip
```

### 方式 B：插件市场面板（默认）
Polaris 读取本仓库 `index.json` 渲染可浏览列表，点击「安装」即调用 `installRemotePlugin`。

## 上架一个新插件

1. 在 `plugins/<your-plugin>/` 下创建 `plugin.json`（见 [插件规范](docs/SPEC.md)）
2. 实现插件逻辑（MCP server / 面板 / 聊天卡片）
3. 运行 `node scripts/pack.js plugins/<your-plugin>` 生成 zip
4. 在该插件目录下创建 `update.json`（内容与 `plugin.json` 一致，指向最新 zip）
5. 在 `index.json` 的 `plugins[]` 中追加一条记录（含 `manifestUrl` / `downloadUrl` / `updateUrl`）
6. 提交 PR

详见 [上架指南](docs/PUBLISHING.md)。

## 开发文档

完整的 Polaris 插件开发指南已收录在本仓库：

📖 **[Polaris 插件开发指南](docs/plugin-development-guide.md)**

内容覆盖：
- 快速开始（最简 MCP 工具插件）
- `plugin.json` 规范与字段约束
- MCP Server 开发（JSON-RPC 2.0、模板占位符、返回格式）
- 可视化 React 面板开发（组件规范、esbuild 打包）
- 插件服务管理（HTTP / stdio / worker 后台服务、健康检查、自动重启）
- 安装与调试技巧
- 内置插件开发（`src/plugins/` + `builtinPlugins.ts` 注册）
- 常见问题排查（Invalid hook call / MCP 启动失败 / 服务重启等）

> 该文档源自 [Polaris](https://github.com/misxzaiz/Polaris) 项目 `docs/plugins/plugin-development-guide.md`，在本仓库作为上架参考。

## 协议

- 索引格式：见 `schemas/index.schema.json`
- 兼容 Polaris 插件 manifest 规范（`plugin.json`）
- 安装包格式：`.zip`，解压后根目录须含 `plugin.json`

## License

MIT
