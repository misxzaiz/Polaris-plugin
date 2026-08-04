# 插件规范 (SPEC)

本仓库遵循 Polaris 客户端的插件 manifest 规范，并扩展商城索引字段。

## 1. plugin.json（插件清单）

每个插件根目录必须有 `plugin.json`，字段如下：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 全局唯一，小写字母/数字/`.`/`-`，建议 `namespace.name` |
| `name` | ✅ | 显示名称 |
| `version` | ✅ | 语义化版本 `x.y.z` |
| `description` | | 描述 |
| `enabledByDefault` | | 默认是否启用 |
| `contributes` | | 功能贡献点 |
| `contributes.mcpServers[]` | | MCP 工具服务器 |
| `contributes.views[]` | | ActivityBar 视图入口 |
| `contributes.panel` | | 可视化面板入口 |
| `contributes.chatCards[]` | | 聊天卡片渲染 |
| `contributes.services[]` | | 后台服务 |
| `permissions` | | 权限声明 |
| `origin` | | 来源元数据（远程安装/更新必填） |

### contributes.mcpServers[]

```jsonc
{
  "id": "my-server",          // 插件内唯一
  "transport": "stdio",        // 目前仅支持 stdio
  "command": "node",
  "argsTemplate": ["{{pluginDir}}/mcp/server.js"]
}
```

模板变量（由 Polaris 在加载时展开）：
- `{{pluginDir}}` —— 插件安装目录
- `{{appConfigDir}}` —— 应用配置目录
- `{{workspacePath}}` —— 当前工作区路径

### origin（远程安装/更新关键字段）

```jsonc
{
  "origin": {
    "repository": "https://github.com/user/repo",
    "homepage": "https://example.com",
    "updateUrl": "https://example.com/update.json",   // 指向最新 manifest（供版本检查）
    "downloadUrl": "https://example.com/plugin.zip"     // 指向 zip 安装包
  }
}
```

> Polaris 的更新流程：读取已安装插件的 `origin.updateUrl` → GET 获取最新 manifest → 比较 `version` → 若有新版则用其中的 `origin.downloadUrl` 下载 zip 并替换。因此 `update.json` 的内容应与最新 `plugin.json` 一致。

## 2. update.json（更新清单）

`updateUrl` 指向的文件。内容 = 一份完整的 `plugin.json`（含最新版本号与最新 `downloadUrl`）。

## 3. zip 安装包

- 格式：`.zip`
- 解压后根目录**必须**包含 `plugin.json`
- Polaris 的 `installRemotePlugin(downloadUrl)` 会下载、解压、校验、安装到 user/project scope

## 4. 商城索引（index.json）

顶层索引，列出所有可上架插件。每条记录需包含：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 与 `plugin.json.id` 一致 |
| `name` / `version` / `description` | ✅ | 列表展示 |
| `manifestUrl` | ✅ | 指向 `plugin.json`（发现/校验用） |
| `downloadUrl` | ✅ | 指向 zip（安装用，与 `plugin.json.origin.downloadUrl` 一致） |
| `updateUrl` | ✅ | 指向 `update.json`（更新检查用） |
| `author` / `category` / `tags` / `icon` | | 元数据 |
| `sha256` | | zip 完整性校验（推荐） |
| `permissions` | | 权限摘要（供用户安装前预览） |
| `screenshots` / `readme` | | 展示素材 |
