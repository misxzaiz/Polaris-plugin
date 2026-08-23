# 复审检查与下一步规划

## 复审检查结果

### 已修复并发布
- **P1: 路径下钻菜单外部点击不关闭** — ResponseViewer.jsx 缺少 document click 监听，菜单粘在屏幕上。已修复并发布 v1.1.0（commit 78098e8）。
- **P1: CollectionPanel 文件导入闭包陷阱** — fileReader.onload 闭包中 store.get('collections') 可能已 stale。已修复：改用展开符 `[...cols, ...importedCols]` 确保始终基于最新 state。
- **P3: 状态栏 toast 多源竞争** — 未直接修复，但非阻塞（最后一条 wins）。

### 已验证通过的质量门
- 零 emoji（grep 确认）
- 零原生对话框（alert/prompt/confirm）
- AI 独立代码已删除，协同宿主 AI+MCP
- React 非变异（所有更新用展开符/immutable）
- URL 参数重复 bug 修复（params 唯一 query 来源）
- 历史快照可还原完整请求
- 端到端验证全绿（面板渲染、请求发送、响应渲染、AI 协同）

### 无需修复的低优先级项
- **handleSend stale activeTab 闭包**：setTabs 用 callback 形式，闭包只影响 sending 标识，无实际 bug
- **envs 初始化类型**：store.set('activeEnv', ...) 第二个参数未加 ?.id，但实际值总是有 id

---

## 下一步规划

### 第 1 步：publish-plugin.mjs 入库（立即）
`scripts/publish-plugin.mjs` 是上次开发的发布脚本，已在工作树但未提交。应入库以便他人使用。

### 第 2 步：polaris-api 后续迭代（P0-P2 功能）

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | GraphQL 支持 | 对 GraphQL endpoint 发送 POST 查询，解析响应。与 REST 共用请求编辑/响应渲染 |
| P1 | WebSocket 测试 | 连接/断开/消息收发，侧栏面板 |
| P1 | 集合分组折叠记忆 | 从 localStorage 恢复折叠状态 |
| P1 | 单元格右键复制 | 表格单元格右键菜单（复制值/复制列名） |
| P2 | 请求/响应时间线 | 在历史中标注请求耗时走势 |
| P2 | cURL 智能粘贴检测 | 粘贴板检测到 curl 命令时自动弹出导入提示 |

### 第 3 步：主仓库关联修复

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 确认 panel 容器 `onSendToChat` 透传 | 主仓库 `PluginPanelHost.tsx` 是否已正确透传 prop（已验证通过） |
| P1 | 更新 polaris-api 占位图标的 name/size | 非必要，但可提升一致性 |

### 第 4 步：其他插件审查

| 插件 | 当前版本 | 建议 |
|------|---------|------|
| relay-devkit | v1.0.0 | 检查是否可升级（与 polaris-api 共享 json-view 核心） |
| omp-engine / dsh-engine | v1.1.0 / v0.1.0 | 引擎插件，检查是否与主仓库最新 engine 注册兼容 |
| marketpalce | v1.1.0 | 商城插件，检查是否引用 polaris-api 的 downloadUrl 变 v1.1.0 |

### 第 5 步：发布流程改进

| 优先级 | 改进 |
|--------|------|
| P1 | publish-plugin.mjs 入库后，在插件 README 添加发布说明 |
| P2 | 自动从 git tag 派生版本号（避免手动改 plugin.json 版本） |
| P2 | CI 集成：PR 合并时自动发布 affected 插件 |