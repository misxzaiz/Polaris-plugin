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

## 发布前自检清单（daw-studio v0.1.0→v0.1.1 三坑沉淀，逐项打勾）

- [ ] **版本号四处同步**：`plugin.json` / `update.json` / `package.json` 之外，**源码里的 `VERSION` 硬编码常量也要改**（service/mcp 的 `const VERSION = 'x.y.z'`）——它只影响 meta/health 显示口径，不挡更新检查，最易漏（daw-studio 实证：装完 0.1.1 health 仍报 0.1.0 才发现）。发版前 `grep -rn "0\.1\.0" plugins/<id>/{service,mcp,src}/` 旧版本号应零命中。
- [ ] **tag 钉住的内容不可再变**：tag 一旦 push，重指向会让 jsdelivr 吐旧缓存包（sha256 与 index 不一致，≤12h 才自愈）——发 tag 前把源码修完，别「先发再补」。
- [ ] **zip 文件数核对**：首版打包 200+ 文件 = 忘建 `.pluginignore`（照抄 dep-probe 的即可），正确应为个位数到十几文件。
- [ ] **`npm test` + `tsc --noEmit` 全绿后再打包**；`publish-plugin.mjs` 只更新已存在条目，**新插件首版要手工加 index.json 条目 + 建 update.json**（validate.js 会查两文件同在）。
- [ ] **发布验证**：钉 tag URL 下载 zip 实算 sha256 与 index.json 比对一致（`curl -sL <tagged zip> | sha256sum`）。

## 面板服务可达性（桌面/手机全端范式）

面板访问自家 127.0.0.1 服务**禁止直连 fetch**，一律经宿主转发（needs/data-query/daw-studio v0.1.1 三方实证）：

```
面板 ──router_dispatch──▶ cap.http(request) ──宿主进程发出──▶ 127.0.0.1:<meta.port>
```

- **手机/Web webview 里 `127.0.0.1` 指手机自身**——直连桌面服务必 `Failed to fetch`，桌面测试全绿也发现不了，必须按此范式实现
- 服务 `{port, token}` 自 kv `<plugin>.meta` 读（宿主通道，全端可达）；正式数据根 config 已有 `cap.http source=remote → allow`（P1-h 沉淀），手机端放行
- 面板自救按钮勿裸调 `restart`——**热安装插件在下次 discover（autostart）前未注册，restart 必报 not registered**；正确降级：restart 失败 → `cap.pluginServiceManager autostart` 重扫
- 演奏/画布等纯前端能力不经数据面，天然全端可用

## 本地安装/更新可靠路径（绕 `@main` 缓存）

`apply_update` 依赖 `@main` update.json——jsdelivr 12h 缓存期内会下载到旧包、版本比对失败。手动装新版：

```bash
# 1. 钉 tag 下载 + 校验
curl -sL "https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@<tag>/plugins/<id>/<id>.zip" -o <id>.zip
# sha256 与 index.json 比对

# 2. 经总线换包（曲谱/kv 数据在 appConfigDir，与插件目录分离，卸载无损）
#    cap.pluginServiceManager: stop_for_plugin {pluginId}
#    cap.pluginDiscovery: uninstall_local {installPath}
#    cap.pluginDiscovery: install_package {packagePath}
#    cap.pluginServiceManager: autostart   # 重扫注册新装服务
```

## 分类建议（category）

| 值 | 说明 |
|----|------|
| `utility` | 通用工具 |
| `mcp` | 纯 MCP 工具集 |
| `panel` | 面板类 |
| `media` | 多媒体生成 |
| `dev` | 开发辅助 |
| `productivity` | 效率工具 |
