# 三方分析报告：RELAY DevKit vs polaris-api vs invoke

## 1. RELAY 布局语义（指正）

RELAY 的布局语义是：
- `layout='v'`（vertical）= **上下排列**（flex-column，侧栏在上，工作区在下）
- `layout='h'`（horizontal）= **左右排列**（flex-row，侧栏在左，工作区在右）

按钮文案 `ui.layout==='h'?'⇅ 上下':'⇄ 左右'` 显示的是**切换后的目标布局**，但 `h` 的语义是"左右"（horizontal=flex-row=左右），文案"⇅ 上下" = 点击后变成上下（vertical/flex-column）。语义链自洽。

polaris-api 的错误：`vertical` 对应了 flex-row（左右），`horizontal` 对应了 flex-column（上下），正好反了。按钮文案也反了。

---

## 2. 三方优势矩阵

### RELAY DevKit — 优势

| 维度 | 具体能力 | 来源 |
|------|---------|------|
| **外壳交互成熟度** | 可拖拽分隔条、列宽拖拽、单元格右键菜单、tooltip、分组折叠、列选择器、多表格候选 | `tools/api.js` + `core/json-view.js` |
| **环境管理** | 顶栏环境选择器（显眼位置）、管理模态、环境变量 baseUrl+自定义变量 | `tools/api.js:126-167` |
| **cURL 导入** | 顶栏显眼按钮、导入即新建 tab | `tools/api.js:450-467` |
| **响应渲染** | 对象树、表格（列宽拖拽/排序/显隐/列序）、原始（语法高亮/换行）、预览、Headers、路径下钻（下拉+手动+过滤）、增强过滤（field:value/id>1/!否定）、智能单元格（图片/时间戳/链接）、右键复制 | `core/json-view.js` 全部 |
| **架构** | 纯原生 DOM 无依赖、setRoot 面板隔离、configureViewHost 控制反转、分键持久化、面板模式 | `core/dom.js`、`core/router.js` |
| **多工具集成** | 首页 + API + JSON + SQL + 时间戳 + 数据库 + AI 一体化 | `main.js` |

### polaris-api — 优势

| 维度 | 具体能力 | 来源 |
|------|---------|------|
| **代码生成** | curl/Python/JavaScript/Go/Rust 五语言代码生成 | `core/parser.js` `generateCode()` |
| **AI 协同** | 通过 `onSendToChat` 复用宿主 AI+MCP，非独立 AI | 架构设计 |
| **React 非变异** | 所有更新用展开符产生新引用，undo/redo 可靠 | `store.js` / 组件架构 |
| **零 emoji 生产级** | 全文本+几何符号，零原生对话框 | 全仓 |
| **URL 参数修复** | URL query 与 params 分离，params 唯一 query 来源，杜绝重复 | `http.js:45-46` |
| **历史快照可还原** | 完整请求快照持久化，点击历史可还原完整请求 | `MainPanel.jsx:83-84` |
| **打包体积** | minify 后 90KB（含全部功能） | 构建产物 |

### invoke — 优势（定制化最强）

| 维度 | 具体能力 | 来源 |
|------|---------|------|
| **双模式请求** | 通用 HTTP 模式 + 定制接口模板模式，一个页面解决两种场景 | `curl.html:74-83`，`curl.js:276-304` |
| **模板系统（核心差异化）** | 基于 SQLite 的完整模板管理：服务器模板（protocol/ip/port）+ 接口模板（path/method/headers/query/bodyFields） | `storage/templateManager.js` + `server.js` |
| **定制接口表单** | 选择模板后动态生成表单（text/number/json/checkbox），表单 ↔ Body 编辑器双向同步（debounce 500ms） | `curl.js:603-722` |
| **服务器选择器** | 选择服务器配置（protocol/ip/port），自动替换 URL 域名，徽章显示当前服务器 | `curl.js:740-833` |
| **全局 Headers** | 持久化到 localStorage，自动合并到所有请求，可管理/导入 | `curl.js:1044-1105` |
| **后端代理** | Express + axios 代理，支持大响应、错误处理、超时 | `server.js` |
| **响应增强** | 展开层数控制（2/3层一键）、字体大小调整、数据视图/完整响应双视图 | `curl.html:232-248` |
| **模板保存/加载** | 保存当前请求为模板、加载模板、搜索模板 | `curl.js:98-217` |
| **SQLite 持久化** | 模板数据持久化到 SQLite，5 分钟缓存 | `storage/databaseManager.js` |

---

## 3. 关键差异化功能比较

| 功能 | RELAY | polaris-api | invoke |
|------|-------|-------------|--------|
| 布局语义 | ✅ 自洽 | ❌ 反了 | ❌ 固定 |
| 可拖拽分隔条 | ✅ | ❌ | ✅ |
| 顶栏环境选择器 | ✅ | ❌（埋底部） | ❌（侧栏服务器选择） |
| 顶栏 cURL 导入 | ✅ 显眼 | ❌ 隐藏 | ✅ 侧栏按钮 |
| 多 Tab | ✅ | ✅ | ❌ 单请求 |
| 代码生成 | ❌ | ✅ curl/py/js/go/rust | ❌ 仅导出 curl |
| AI 协同 | ❌ 独立浮窗 | ✅ 宿主协同 | ❌ |
| 模板系统 | ❌ | ❌ | ✅ SQLite 完整 |
| 定制接口表单 | ❌ | ❌ | ✅ 动态表单双向同步 |
| 服务器选择器 | ❌ | ❌ | ✅ 域名替换 |
| 全局 Headers | ❌ | ❌ | ✅ 持久化 |
| 集合管理 | ✅ 分组/保存/载入 | ✅ 分组/保存/载入 | ❌ |
| 环境变量 | ✅ | ✅ | ❌ |
| 单元格右键 | ✅ | ❌ | ❌ |
| 列宽拖拽 | ✅ | ❌ | ❌ |
| 智能单元格 | ✅ 图片/时间戳 | ✅ 图片/时间戳 | ❌ |
| 增强过滤 | ✅ field:value | ✅ field:value | ❌ |
| 路径下钻 | ✅ 下拉+手动+过滤 | ✅ 下拉+手动+过滤 | ✅ 下拉+手动 |
| 历史快照还原 | ✅ | ✅ | ❌ |
| 零 emoji | ❌（emoji 图标） | ✅ | ❌（emoji 图标） |
| 零原生对话框 | ❌ alert/prompt/confirm | ✅ | ❌ confirm |
| 不可变 state | ❌ 直接变异 | ✅ 展开符 | N/A 原生 DOM |
| 持久化 | localStorage 分键 | localStorage 分键 | SQLite + localStorage |
| 面板隔离 | ✅ setRoot | ✅ React 容器 | N/A 独立页面 |

---

## 4. 整合建议：路径 B 详细方案

### 总体策略
**以 RELAY DevKit 的 API 客户端为骨架，嫁接 polaris-api 的加分项，再整合 invoke 的定制化能力。**

### 实施步骤

#### Phase 1：抽取 RELAY API 客户端为独立插件
- 从 `relay-devkit/src/tools/api.js` 抽取 API 客户端核心（多 tab、集合、环境、cURL、请求/响应渲染）
- 从 `relay-devkit/src/core/json-view.js` 抽取智能渲染核心
- 从 `relay-devkit/src/core/dom.js` 抽取 DOM 工具
- 抽取对应 CSS 样式
- 适配 Polaris 插件面板接口（`export default function Panel({pluginId, onSendToChat})`）
- 保留 RELAY 的：布局语义（v=上下，h=左右）、可拖拽分隔条、顶栏环境选择器、顶栏 cURL 导入、单元格右键、列宽拖拽、tooltip、分组折叠、列选择器

#### Phase 2：嫁接 polaris-api 加分项
- **代码生成**：移植 `core/parser.js` 的 `generateCode` 函数，支持 curl/py/js/go/rust
- **AI 协同**：通过 `onSendToChat` 注入上下文，支持"AI 分析响应"和"AI 生成请求"
- **不可变状态**：用 `store.js` 的分键持久化取代 RELAY 的直接变异
- **历史快照**：保留完整请求快照的可还原性
- **零 emoji**：替换所有 emoji 为文本标签/几何符号
- **零原生对话框**：替换所有 alert/prompt/confirm 为内联模态

#### Phase 3：整合 invoke 定制化能力
- **双模式请求架构**：通用 HTTP 模式 + 定制接口模板模式
  - 通用模式 = 当前 RELAY/polaris-api 的请求编辑
  - 定制模式 = 选择模板 → 动态生成表单 → 表单与 Body 双向同步
- **模板系统**：移植 `storage/templateManager.js` + `databaseManager.js` 的 SQLite 模板持久化
  - 服务器模板：name + protocol + ip + port
  - 接口模板：name + method + path + headers + query + bodyFields（字段定义/类型/校验/默认值）
  - 模板选择 → 自动填充 method/path/headers/query + 生成表单
- **服务器选择器**：顶栏下拉选择服务器 → 自动替换 URL 域名 + 徽章显示
- **全局 Headers**：持久化 + 自动合并
- **后端代理**：复用现有 `server.js`（polaris-api-proxy），保持兼容

#### Phase 4：优化与超越
- **保留 polaris-api 的 React 非变异架构**（RELAY 的原生 DOM 直接变异在复杂场景下有问题）
- **保留 RELAY 的 setRoot 面板隔离**（非 React 场景回退）
- **新增 invoke 没有的**：多 tab、集合管理、环境变量、代码生成、AI 协同、智能单元格、增强过滤、历史快照

### 技术路线图

```
┌─────────────────────────────────────────────────────┐
│              Polaris HTTP Client (v2)                │
├─────────────────────────────────────────────────────┤
│  RELAY 骨架（外壳交互）  │  polaris-api 加分项        │
│  ─────────────────────  │  ─────────────────────    │
│  · 多 Tab + 集合管理     │  · 代码生成 5 语言         │
│  · 可拖拽分隔条          │  · AI 协同（宿主 AI+MCP）  │
│  · 顶栏环境选择器        │  · 不可变状态              │
│  · 顶栏 cURL 导入        │  · 历史快照可还原          │
│  · 单元格右键/tooltip    │  · 零 emoji               │
│  · 列宽拖拽/排序/显隐    │  · 零原生对话框            │
│  · 智能单元格(图片/时间)  │                          │
│  · 增强过滤(field:值)    │  invoke 定制化             │
│  · 路径下钻(下拉+手动)    │  ─────────────────────    │
│  · 对象树/表格/预览       │  · 双模式请求(通用+定制)   │
│  · 分组折叠               │  · 模板系统(SQLite)       │
│  · 状态栏计数             │  · 动态表单双向同步        │
│                         │  · 服务器选择器            │
│                         │  · 全局 Headers           │
└─────────────────────────────────────────────────────┘
```

### 文件结构建议

```
plugins/polaris-http/
├── src/
│   ├── core/
│   │   ├── dom.js          ← RELAY 移植（DOM 工具）
│   │   ├── store.js         ← polaris-api 移植（不可变持久化）
│   │   ├── http.js          ← polaris-api 移植（发送+代理，URL 不重复）
│   │   ├── json-view.js     ← RELAY 移植（智能渲染）
│   │   ├── parser.js        ← polaris-api 移植（cURL/Postman/OpenAPI/代码生成）
│   │   ├── router.js        ← RELAY 移植（视图路由）
│   │   └── template.js      ← invoke 移植（模板系统）
│   ├── components/
│   │   ├── Panel.jsx        ← 新（React 面板包装）
│   │   ├── MainPanel.jsx    ← RELAY api.js 改编（多 tab + 双模式）
│   │   ├── RequestEditor.jsx← RELAY 改编（请求编辑 + 定制表单）
│   │   ├── ResponseViewer.jsx← RELAY json-view 改编（响应渲染）
│   │   ├── CollectionPanel.jsx← polaris-api 移植（集合管理）
│   │   └── TemplateManager.jsx← invoke 移植（模板管理 + 表单）
│   ├── server.js            ← polaris-api 移植（代理服务）
│   └── styles/
│       └── main.css
├── plugin.json
├── package.json
├── build.js
└── docs/
```

### 工作量估算

| Phase | 内容 | 估算人日 |
|-------|------|---------|
| 1 | 抽取 RELAY API 骨架 | 2 |
| 2 | 嫁接 polaris-api 加分项 | 1 |
| 3 | 整合 invoke 定制化 | 3 |
| 4 | 端到端测试+发布 | 1 |
| **合计** | | **~7 人日** |