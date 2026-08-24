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

复制 `plugin.json` 为 `update.json`。

### 4. CDN 地址策略（重要）

`updateUrl` 和 `downloadUrl` 使用不同的 CDN 引用策略：

| URL | 策略 | 原因 |
|-----|------|------|
| `updateUrl` | `@main` | 版本比较必须动态指向最新，每次检查更新时返回最新版本号 |
| `downloadUrl` | `@vX.Y.Z` tag | **zip 二进制文件在 jsdelivr CDN 中缓存难以清除**，用 git tag 固定后不可变，彻底绕过缓存 |
| `manifestUrl` | `@main` | JSON 文本，缓存问题小，指向最新即可 |

**正确示例（v0.1.2）：**

```json
{
  "updateUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/zen/update.json",
  "downloadUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@v0.1.2/plugins/zen/zen.zip"
}
```

```jsonc
// index.json 中该条目的 URL
"manifestUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/<your-plugin>/plugin.json",
"downloadUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@v0.1.2/plugins/<your-plugin>/<your-plugin>.zip",
"updateUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/<your-plugin>/update.json",
```

> ⚠️ 不要用 commit hash 做 `updateUrl`，否则用户永远收不到后续更新！
> ⚠️ 不要用 `@main` 做 `downloadUrl`，CDN 缓存会导致旧版 zip 被反复下载！

### 5. 注册到 index.json

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
  "manifestUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/<your-plugin>/plugin.json",
  "downloadUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/<your-plugin>/<your-plugin>.zip",
  "updateUrl": "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/<your-plugin>/update.json",
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
3. 同步 `update.json` 的 `version`，并更新 `origin.downloadUrl` 中的 tag 版本号（如 `@v0.1.2` → `@v0.1.3`）
4. 重新打包 zip（`pack.js`）
5. 更新 `index.json` 中该条目的 `version`、`sha256`、`downloadUrl` tag
6. **维护 `versions` 数组**：在 `index.json` 该插件的 `versions` 数组头部追加新版本条目（按版本号降序排列），确保旧版本 zip 保留在 CDN 上（通过 git tag）
7. 提交并打 tag：

```bash
git add plugins/<your-plugin>/ index.json
git commit -m "release: <your-plugin> v0.1.3"
git tag v0.1.3
git push origin main --tags
```

> ⚠️ 每次发版必须 push 新 tag，否则 downloadUrl 指向旧版本 zip！
> ⚠️ `plugin.json` 与 `update.json` 的版本号必须同步更新，否则更新检查失败。
> ⚠️ `versions` 数组中的每个 `downloadUrl` 必须使用对应的 git tag（如 `@v0.1.2`），不可变，否则历史版本安装会失效。

## 分类建议（category）

| 值 | 说明 |
|----|------|
| `utility` | 通用工具 |
| `mcp` | 纯 MCP 工具集 |
| `panel` | 面板类 |
| `media` | 多媒体生成 |
| `dev` | 开发辅助 |
| `productivity` | 效率工具 |
