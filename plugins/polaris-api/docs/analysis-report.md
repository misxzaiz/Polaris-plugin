# polaris-api 重构分析报告

## 1. 现状问题（源代码逐项审计）

### 1.1 emoji 滥用（P0 —— 用户明确禁止）
用户明令禁止使用 emoji 作为 UI 元素。但 polaris-api 几乎所有按钮/标签都使用了 emoji：

| 位置 | 文件:行 | emoji | 应替换为 |
|------|---------|-------|---------|
| 集合/历史/AI 切换 | MainPanel.jsx:105-118 | 📁 🕐 ✦ | 纯文本"集合 历史 AI" + 几何符号 |
| 代理按钮 | MainPanel.jsx:123 | 🛡 | "代理"文本按钮 |
| 布局切换 | MainPanel.jsx:127 | ⇅ ⇄ | "上下""左右" 文本 |
| 侧栏折叠 | MainPanel.jsx:129 | ☰ ✕ | Unicode 几何符号 ☰ ✕ 或文本 |
| 导入 cURL | RequestEditor.jsx:219 | ⤓ | 文本"导入 cURL" |
| 复制 cURL | RequestEditor.jsx:222 | ⎘ | 文本"复制" |
| 工具栏操作 | ResponseViewer.jsx:123/287/288 | ⇄ ⊟ ⊞ | 文本"对比""折叠""展开" |
| 响应 Tab 标签 | 多处 | 🕐 📥 📊 | 纯文本 |
| AI 面板 | AIChat.jsx:87/89/159/160/165 | ✦ 🗑 ⚙ | 纯文本图标/按钮 |
| 空状态 | ResponseViewer.jsx:73 | ⇅ | 纯文本说明 |
| 错误提示 | 多处 | ⚠ ❌ ✅ 👉 | 纯文本/几何符号 |
| 集合搜索 | CollectionPanel.jsx:183 | 🔍 | 几何符号或纯文本 |
| 导入按钮 | CollectionPanel.jsx:214 | 📥 | 文本"导入" |
| 重命名 | CollectionPanel.jsx:251 | ✎ | 文本"重命名"或几何符号 |
| 历史状态 | 多处 | 🚫 ❌ | 纯文本状态颜色 |

### 1.2 阻塞式原生对话框（P0）
- `alert()` 在 `RequestEditor.jsx:108`（cURL 解析失败）、`AIChat.jsx:301/323/`（连接测试/错误）
- `prompt()` 在 `CollectionPanel.jsx:67/83`（新建/重命名文件夹）
- `confirm()` 在 `api.js` 中保存/删除分组
- 这些在 Polaris 侧栏面板中显得突兀，且阻塞 UX

### 1.3 React state 变异反模式（P1）
- `ParamsEditor`、`HeadersEditor`、`FormEditor` 使用浅拷贝 `rows = [...params]` 后直接变异嵌套对象
- `rows.splice`/`rows[idx].key = value` 直接修改 store 引用共享的对象
- 后果：`store.set` 获得的 state 已被变异，`prev` 与 `current` 引用相同，undo/redo 栈捕捉的是同一对象引用，undo 无法恢复

### 1.4 URL 参数重复 bug（P1）
- `RequestEditor.handleUrlChange` 在 URL 输入时自动解析 `?a=1&b=2` 到 params
- `sendRequest(http.js)` 发送时再把 params 重新编码追加到 URL
- 如果用户不手动清除 params 中的旧值，最终 URL 变成 `?a=1&b=2&a=1&b=2`
- 更严重：用户只编辑 params 表格（不碰 URL 输入框），URL 字符串里的旧 query 残留 → 永远重复

### 1.5 历史记录不可还原（P1）
- history 只存 `method/url/status/timeMs`，`loadFromHistory` 重建时 params/headers/body 全空
- 点击历史记录无法真正还原原请求（尤其带 body/header 的 POST/PUT）
- 对比 RELAY 每个 tab 保存完整请求快照

### 1.6 localStorage 性能问题（P2）
- `store.set` 每次击键对整个 state 做 `JSON.stringify` 同步写 localStorage
- `ai.conversations` 可能巨大（每个对话包含完整消息历史）
- undo 栈每个 entry clone 整棵子树，50 个 undo 条目 × 大 state 可能数 MB

### 1.7 XSS 风险（P2）
- `AIChat.jsx:200` 使用 `dangerouslySetInnerHTML` 渲染 AI 回复
- `renderMarkdown` 在 `client.js:177-199` 对 HTML 做了基本转义（`<`→`&lt;`等），但 `code` 块内二次转义，安全
- `ResponseViewer.jsx:406` iframe 使用了 `sandbox` 属性，安全

### 1.8 缺失的关键功能（P1）
- **多 tab**：RELAY 支持多 tab 请求，polaris-api 只有单请求
- **请求历史（完整可还原）**：当前 history 是只读日志
- **保存到集合的明确入口**：埋藏在侧栏"集合"视图的文件夹操作中
- **Dirty 状态指示**：编辑后未保存没有视觉提示
- **集合操作**：无导入/导出集合 JSON
- **响应过滤**：无增强过滤语法（field:value/id>1 语法）
- **表格列操作**：无列宽拖拽、列显隐、排序
- **智能单元格**：无图片缩略图、时间戳转时间、链接自动识别
- **单元格复制**：响应无法右键复制值
- **下载响应**：无下载按钮
- **GraphQL 支持**：无
- **WebSocket 支持**：无

## 2. RELAY DevKit 可借鉴的架构模式

### 2.1 架构亮点
1. **DOM 作用域隔离**：`setRoot(container)` 将所有 DOM 查询限定在面板容器内，避免与宿主冲突
2. **面板模式控制反转**：`configureViewHost({persist, rerender})` 避免 core→app 反向依赖
3. **事件绑定与初始化分离**：`initApi()` 在 DOM 就绪后绑定事件，支持热更新
4. **localStorage 分键持久化**：`relay.tabs.v2`、`relay.collections.v2`、`relay.envs.v2`、`relay.ui.v2` 四个独立键
5. **无外部依赖**：纯原生 JS + DOM API，无 React 组件（打包时宿主 external 提供 React）

### 2.2 功能亮点
1. **多 tab**：每个 tab 独立请求，支持创建/关闭/重命名/dirty 跟踪
2. **URL ↔ params 双向同步**：编辑 URL 自动更新 params 表，编辑 params 表自动更新 URL
3. **增强过滤语法**：`field:value`、`id>1`、`role:true`、`-否定`、`regex`
4. **智能单元格**：图片缩略图、时间戳转时间、链接
5. **列操作**：多表格候选、列宽拖拽、列显隐、排序、自定义列序
6. **表格/对象树/原始/预览/Headers 多视图**：智能默认视图选择
7. **路径下钻**：自动识别可下钻路径、下拉选择、手动输入、增强过滤集成
8. **导出/导入集合**：JSON 导出导入
9. **cURL 导入导出**：完整支持
10. **状态栏**：TABS/SAVED 计数
11. **分隔条拖拽**：上下/左右布局自适应

## 3. 用户痛点调研（2026 年社区反馈）

### 3.1 用户选择 API 客户端的核心诉求
1. **轻量快速**：Postman 臃肿（~900MB 内存），用户渴望 <100MB 的轻量替代
2. **本地优先**：无强制登录、无云端同步、离线可用
3. **Git 友好**：集合以文本形式存库，可 diff/review
4. **多协议**：REST + GraphQL + WebSocket 是 2026 年标配
5. **环境变量**：{{baseUrl}} {{token}} 变量替换
6. **响应智能渲染**：JSON 树、表格、智能单元格（图片/时间戳）
7. **请求历史**：可点击回放
8. **集合管理**：分组/搜索/导入导出

### 3.2 竞品功能矩阵

| 功能 | polaris-api | RELAY | Bruno | Hoppscotch | 必要性 |
|------|------------|-------|-------|------------|--------|
| 多 tab | ✗ | ✓ | ✓ | ✓ | 必修 |
| 请求历史(可还原) | ✗(只读) | ✓(不完整) | ✓ | ✓ | 必修 |
| 环境变量 | ✓ | ✓ | ✓ | ✓ | 必修 |
| 集合管理 | ✓(基础) | ✓ | ✓ | ✓ | 必修 |
| 集合导入/导出 | ✓(部分) | ✓ | ✓ | ✓ | 应有 |
| cURL 导入/导出 | ✓ | ✓ | ✓ | ✓ | 必修 |
| 智能响应视图 | ✓(基础) | ✓(完整) | ✓ | ✓ | 必修 |
| 增强过滤语法 | ✗ | ✓ | ✓ | ✓ | 应有 |
| 多协议(GraphQL/WS) | ✗ | ✗ | ✓(部分) | ✓ | 可选 |
| 代码生成 | ✓ | ✗ | ✓ | ✗ | 应有 |
| AI 助手 | ✓ | ✓ | ✗ | ✗ | 可选(差异化) |
| 单元格智能渲染 | ✗ | ✓ | ✓ | ✓ | 应有 |
| 列操作(拖拽/排序) | ✗ | ✓ | ✓ | ✓ | 应有 |
| 键盘快捷键 | ✓(部分) | ✓ | ✓ | ✓ | 必修 |
| 主题/自定义 | ✗ | ✓(CSS变量) | ✓ | ✓ | 可选 |
| 多 tab 保存 | ✗ | ✓ | ✓ | ✓ | 必修 |
| 响应下载 | ✗ | ✓ | ✓ | ✓ | 应有 |
| 响应对比 | ✗(骨架) | ✗ | ✗ | ✗ | 可选(差异化) |

## 4. 重构目标

### 4.1 架构决策（关键修正）

**AI 协同：砍掉独立 AI，复用宿主 Polaris AI + MCP**

原 polaris-api 自带完整 OpenAI 客户端（ai/client.js + ai/tools.js + ai/prompts.js + AIChat.jsx 的 AIConfigPanel），需自配 endpoint/apiKey/模型/代理——这是"独立一个 AI"，与用户诉求冲突。

新架构：通过插件面板标准 prop `onSendToChat(message: string)` 把带上下文的提示词注入主聊天，由宿主 Polaris AI（已接入 MCP 工具链）处理。面板是"上下文注入器 + 结果展示器"，不是独立 AI。

证据（主仓库 `src/plugin-system/types.ts:360-363` + `PluginPanelHost.tsx:73`）：
- `PluginPanelComponent` 标准签名 `{ pluginId, onSendToChat? }`
- `onSendToChat` 把消息送入主聊天流，宿主 AI 接管，MCP 工具可调用
- DemoPluginPanel/AgnesPanel/TranslatePanel 均用此通道

具体协同点：
1. **AI 分析响应**：面板按钮"用 AI 分析此响应" → 构造提示词（含请求+响应摘要）→ `onSendToChat` → 宿主 AI 分析
2. **AI 生成请求**：用户描述 → `onSendToChat("根据描述生成 API 请求...")` → 宿主 AI 可调用 MCP 工具生成
3. **AI 修 cURL/代码**：当前请求 → `onSendToChat("把此请求转成 Python 代码: <请求快照>")` → 宿主 AI 生成
4. 删除：ai/client.js、ai/tools.js、ai/prompts.js、AIChat 的 AIConfigPanel、AI SSE/代理逻辑
5. 保留：构造上下文提示词的工具函数（纯前端，无网络）

好处：
- 无需用户配置 API Key/模型/endpoint
- 复用宿主已接入的 MCP 工具（polaris-git/polaris-ph/dispatch 等）
- 统一在主聊天查看 AI 回复，不分裂注意力
- zip 体积大幅下降（删除 ~1.2k 行 AI 代码）

### 4.2 原则
1. **轻量**：zip ≤ 50KB，无外部运行时依赖，esbuild 打包
2. **零 emoji**：所有 UI 元素使用文本标签、几何符号或 CSS 图标
3. **生产级可用**：无 alert/prompt/confirm
4. **本地优先**：纯 localStorage 持久化，无需登录
5. **React 非变异**：immutable state 更新，防止 undo/redo 损坏
6. **AI 协同**：通过 onSendToChat 复用宿主 AI+MCP，不内置独立 AI

### 4.2 功能范围（必修/应有/可选）

**必修（P0，必须实现）**：
- 单 tab 请求编辑 → 升级为多 tab（类似 RELAY
- 响应查看器：对象树/表格/原始/Headers/预览 + 增强过滤 + 路径下钻
- 智能单元格：图片缩略图、时间戳转时间、链接
- 环境变量：{{baseUrl}}/{{var}} 替换 + 管理模态
- 集合管理：树形分组 + 搜索 + 保存/载入
- 请求历史（可点击还原完整请求）
- cURL 导入/导出
- 键盘快捷键（Ctrl+Enter 发送，Ctrl+S 保存）
- 跨域代理（复用现有 server.js）

**应有（P1，应实现）**：
- 增强过滤语法（field:value/id>1/!否定）
- 列操作（多表格候选、列宽拖拽、列显隐、排序）
- 集合导入/导出 JSON
- 下载响应
- 代码生成（cURL/Python/JavaScript）
- 响应对比
- 美化模式（pretty 单元格切换）
- 状态栏（TABS/SAVED 计数）

**可选（P2，差异化）**：
- AI 助手（保留，但必须重写——纯文本 UI，无 emoji
- Dark 主题（CSS 变量，已有）
- GraphQL 支持
- WebSocket 支持