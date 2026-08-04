# 上架指南 (PUBLISHING)

## 前置条件

- 一个 Polaris 插件（含 `plugin.json`，遵循 [SPEC.md](./SPEC.md)）
- 插件实现文件（MCP server / 面板 bundle 等）
- Node.js ≥ 18（用于打包脚本）

## 步骤

### 1. 创建插件目录

```
plugins/<your-plugin>/
├── plugin.json
├── mcp/server.js          # 或其它实现
└── README.md
```

### 2. 打包 zip

```bash
node scripts/pack.js plugins/<your-plugin>
```

脚本会：
- 校验 `plugin.json` 合法性
- 将插件目录打成 `<your-plugin>.zip`（根目录含 `plugin.json`）
- 计算 sha256（输出到 `index.json`）

### 3. 生成 update.json

复制 `plugin.json` 为 `update.json`，确保 `origin.updateUrl` / `origin.downloadUrl` 指向本仓库 raw 文件地址：

```
https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/<your-plugin>/update.json
https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/<your-plugin>/<your-plugin>.zip
```

> ⚠️ 每次 bump 版本号时，`plugin.json` 与 `update.json` 必须同步更新。

### 4. 注册到 index.json

在 `index.json` 的 `plugins[]` 数组追加：

```jsonc
{
  "id": "your.plugin.id",
  "name": "Your Plugin",
  "version": "1.0.0",
  "description": "...",
  "author": "you",
  "category": "utility",
  "tags": ["mcp"],
  "manifestUrl": "https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/<your-plugin>/plugin.json",
  "downloadUrl": "https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/<your-plugin>/<your-plugin>.zip",
  "updateUrl": "https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/plugins/<your-plugin>/update.json",
  "sha256": "<由 pack.js 输出>",
  "permissions": { "aiToolAccess": true },
  "readme": "# Your Plugin\n..."
}
```

### 5. 本地校验

```bash
node scripts/validate.js        # 校验 index.json + 所有 plugin.json
```

### 6. 提交 PR

- 提交信息：`add: <your-plugin> v1.0.0`
- PR 描述：插件功能、权限说明、截图（如有）

## 版本更新流程

1. 修改插件实现
2. bump `plugin.json` 的 `version`
3. 同步 `update.json`
4. 重新打包 zip（`pack.js`）
5. 更新 `index.json` 中该条目的 `version` 与 `sha256`
6. PR

## 分类建议（category）

| 值 | 说明 |
|----|------|
| `utility` | 通用工具 |
| `mcp` | 纯 MCP 工具集 |
| `panel` | 面板类 |
| `media` | 多媒体生成 |
| `dev` | 开发辅助 |
| `productivity` | 效率工具 |
