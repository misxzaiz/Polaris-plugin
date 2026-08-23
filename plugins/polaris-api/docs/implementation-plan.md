# Polaris HTTP Client v2 — 实施规划

## 总体架构

```
插件名: polaris-http（全新插件，独立于 polaris-api 和 relay-devkit）
构建: esbuild（不改，与现有插件一致）
框架: 原生 DOM（RELAY 模式，非 React 组件）
面板: Polaris 标准面板接口（export default function Panel({pluginId, onSendToChat})）
```

## 文件结构

```
plugins/polaris-http/
├── src/
│   ├── core/
│   │   ├── dom.js              ← RELAY 移植（DOM 工具、setRoot、esc、toast）
│   │   ├── http.js             ← polaris-api 移植（发送请求、代理、URL 不重复、变量解析）
│   │   ├── json-view.js        ← RELAY 移植（对象树/表格/路径下钻/过滤/智能单元格/右键/tooltip）
│   │   ├── parser.js           ← polaris-api 移植（cURL 解析/Postman/OpenAPI/HAR + 代码生成）
│   │   ├── router.js           ← RELAY 移植（视图路由、面板模式）
│   │   ├── store.js            ← polaris-api 移植（不可变、分键持久化）
│   │   └── template.js         ← invoke 移植（模板系统、服务器选择、全局 Headers）
│   ├── panel.jsx               ← 面板入口（SPA_HTML + init）
│   ├── server.js               ← polaris-api 移植（代理服务）
│   └── styles/
│       └── main.css            ← RELAY 样式 + polaris-api 样式 + invoke 样式合并
├── dist/                       ← 构建产物
├── build.js                    ← esbuild 配置
├── plugin.json
├── package.json
└── docs/
    └── architecture.md
```

## 实施步骤（共 10 步）

### Phase 1: 骨架搭建（3 步）

**步骤 1: 创建插件目录 + 基础文件**
- 创建 `plugins/polaris-http/` 目录
- 复制 `build.js`、`package.json`、`plugin.json` 模板
- 编辑 `plugin.json`：id=polaris-http, name=Polaris HTTP, version=1.0.0
- 复制 `server.js`（polaris-api 的代理服务，含 CORS 修复）

**步骤 2: 移植核心层（core/）**
- `core/dom.js` ← RELAY `src/core/dom.js`（$、$$、el、esc、uid、METHODS、methodColor、bytes、ms、setStatus、copy、BINARY）
- `core/http.js` ← polaris-api `src/core/http.js`（sendRequest、resolveVars、formatBytes、formatMs、tryJSON、BINARY_TYPES）
- `core/parser.js` ← polaris-api `src/core/parser.js`（parseCurl、toCurl、importCurl、generateCode、detectImportType、parsePostmanCollection、parseOpenAPI、parseHAR）
- `core/store.js` ← polaris-api `src/core/store.js`（分键持久化、不可变、事件订阅）
- `core/router.js` ← RELAY `src/core/router.js`（registerView、setPanelMode、startRouter、resetRouter、currentView）
- `core/json-view.js` ← RELAY `src/core/json-view.js`（getByPath、collectPaths、parseFilter、astHighlightTerms、rowMatchesAST、cellMeta、fmtDate、tableCandidates、responseFields、viewRaw、viewObject、viewTable、filterBar、toggleRawWrap）
- `core/template.js` ← invoke 移植（模板数据模型、服务器选择器、全局 Headers 管理）

**步骤 3: 移植工具层（tools/）**
- `tools/api.js` ← RELAY `src/tools/api.js` 的 API 客户端核心
  - 多 tab、集合管理、环境变量、cURL 导入导出
  - 请求编辑（params/headers/body）
  - 响应渲染（调用 json-view）
  - 双模式架构（通用 HTTP + 定制接口模板）
  - 代码生成器入口（调用 parser.js 的 generateCode）
  - AI 协同入口（通过 onSendToChat）

### Phase 2: 核心功能（4 步）

**步骤 4: 面板入口（panel.jsx）**
- 基于 RELAY `src/panel.jsx` 模板
- SPA_HTML 骨架（只包含 API 客户端视图，去掉 JSON/SQL/Time/DB/AI 视图）
- 布局：split 容器（req-region + divider + res-region）
- 默认 split 类名 `h`（左右布局）
- 注册唯一视图 `api`（API 请求客户端）
- 侧栏：集合管理 + 工具入口（模板管理、设置）
- 顶栏：环境选择器、cURL 导入、布局切换（上下/左右）、代理开关

**步骤 5: 请求编辑器（api.js 前半部分）**
- 多 tab（新建/关闭/重命名/dirty 跟踪）
- 方法选择器（GET/POST/PUT/PATCH/DELETE）
- URL 输入 + 变量预览（{{baseUrl}}/{{var}}）
- 子 tab：Params / Headers / Body / Auth / 全局H
- 代码：生成面板（⌘ 按钮 → curl/py/js/go/rust）
- 双模式：通用 HTTP 请求 / 定制接口模板
- 服务器选择器 + 徽章 + URL 替换

**步骤 6: 响应渲染（api.js 后半部分 + json-view.js）**
- 响应状态栏（状态码/耗时/大小/类型）
- 响应双视图：业务数据 / 完整响应
- 增强工具栏：路径下钻（下拉+手动+过滤）、增强过滤（field:value）、美化
- 4 种视图：表格（列宽拖拽/排序/显隐/列选择器）、对象树（展开/折叠/过滤）、原始、Headers
- 智能单元格：图片缩略图、时间戳转时间、链接
- 单元格右键菜单（复制值/复制单元格/复制列名/隐藏此列）
- 单元格 tooltip
- 展开层数控制（2层/3层/折叠）
- 字体大小选择
- 全屏切换
- 复制/下载/导出 cURL

**步骤 7: 模板系统 + 定制接口（template.js）**
- 模板数据模型：
  ```json
  {
    "id": "createUser",
    "name": "创建用户",
    "method": "POST",
    "path": "/api/users",
    "headers": { "Content-Type": "application/json" },
    "query": { "page": "1" },
    "bodyFields": [
      { "name": "name", "label": "用户名", "type": "text", "required": true },
      { "name": "email", "label": "邮箱", "type": "text", "required": true },
      { "name": "age", "label": "年龄", "type": "number", "required": false },
      { "name": "metadata", "label": "扩展信息", "type": "json", "required": false }
    ]
  }
  ```
- 选择模板 → 自动填充 method/path/headers/query + 生成动态表单
- 表单字段 ↔ Body 编辑器双向同步（debounce 500ms）
- 模板保存/加载（localStorage 持久化）
- 侧栏"模板管理"入口 → 独立管理页面
- 侧栏"设置"入口 → 服务器配置管理页面

### Phase 3: 集成与优化（3 步）

**步骤 8: 样式合并**
- 从 RELAY `styles/main.css` 提取 API 客户端相关样式
- 合并 polaris-api 的样式补充
- 添加 invoke 模板系统样式
- 统一 CSS 变量命名（`--` 前缀）
- 确保窄面板兼容（Polaris 侧栏宽度）

**步骤 9: 端到端测试**
- 本地静态服务器（9899）测试面板渲染
- 测试代理服务（9870）转发
- 测试所有交互：
  - 布局切换（上下/左右）
  - 环境切换
  - 请求发送 + 响应渲染
  - 多 tab
  - 右键菜单
  - 拖拽分隔条
  - 列宽拖拽
  - 模板选择 + 表单同步
  - 服务器选择器
  - 代码生成
  - AI 协同

**步骤 10: 发布**
- `publish-plugin.mjs polaris-http --push`
- CDN 缓存刷新
- 更新 index.json

## 布局默认值

| 配置 | 默认值 |
|------|--------|
| split 布局 | `h`（左右） |
| 侧栏 | 展开 |
| 代理 | 关 |
| 环境 | 第一个环境或无 |
| 请求区宽度 | 480px |
| 响应字体 | 13px |

## 工作量估算

| 步骤 | 内容 | 估算 |
|------|------|------|
| 1 | 创建目录 + 基础文件 | 0.5h |
| 2 | 移植 core/ 层 | 2h |
| 3 | 移植 tools/api.js | 3h |
| 4 | 面板入口 panel.jsx | 1h |
| 5 | 请求编辑器 | 2h |
| 6 | 响应渲染 | 2h |
| 7 | 模板系统 | 2h |
| 8 | 样式合并 | 1h |
| 9 | 端到端测试 | 1h |
| 10 | 发布 | 0.5h |
| **合计** | | **~15h** |

## 关键决策

1. **默认布局 = 左右（h）**：首屏就在一个视图内同时看到请求和响应
2. **原生 DOM 非 React**：RELAY 模式更轻量，后端服务由 server.js 提供
3. **双模式并置**：通用 HTTP 和定制接口模板通过顶栏 radio 切换，不互相排斥
4. **模板持久化 localStorage**：先本地存储，后续可扩展 SQLite
5. **AI 协同入口**：通过 `onSendToChat` 注入主聊天，无独立 AI 客户端
6. **代码生成面板**：请求栏旁 ⌘ 按钮展开，不占用额外空间
7. **全局 Headers 独立 tab**：与 Params/Headers/Body/Auth 并列，存取即生效
8. **服务器选择器只影响 URL 域名替换**：不影响 method/headers/body，与模板配合使用