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
├── plugins/                    # 各插件源码 + 打包产物
│   └── hello-tool/
│       ├── plugin.json         # 插件 manifest（Polaris 规范）
│       ├── update.json         # 更新清单（供 checkPluginUpdate 拉取）
│       ├── mcp/server.js       # 插件实现
│       └── hello-tool.zip      # 安装包（由 scripts/pack 生成）
├── docs/                       # 商城使用与上架文档
├── scripts/                    # 索引校验 / 打包脚本
└── examples/                   # 各类插件模板
```

## 安装插件（终端用户）

### 方式 A：在 Polaris 设置 → 插件 → 远程安装
填入插件 zip 的 `downloadUrl`，例如：
```
https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/hello-tool/hello-tool.zip
```

### 方式 B：插件市场面板（规划中）
Polaris 读取本仓库 `index.json` 渲染可浏览列表，点击「安装」即调用 `installRemotePlugin`。

## 上架一个新插件

1. 在 `plugins/<your-plugin>/` 下创建 `plugin.json`（见 [插件规范](docs/SPEC.md)）
2. 实现插件逻辑（MCP server / 面板 / 聊天卡片）
3. 运行 `node scripts/pack.js plugins/<your-plugin>` 生成 zip
4. 在该插件目录下创建 `update.json`（内容与 `plugin.json` 一致，指向最新 zip）
5. 在 `index.json` 的 `plugins[]` 中追加一条记录（含 `manifestUrl` / `downloadUrl` / `updateUrl`）
6. 提交 PR

详见 [上架指南](docs/PUBLISHING.md)。

## 协议

- 索引格式：见 `schemas/index.schema.json`
- 兼容 Polaris 插件 manifest 规范（`plugin.json`）
- 安装包格式：`.zip`，解压后根目录须含 `plugin.json`

## License

MIT
