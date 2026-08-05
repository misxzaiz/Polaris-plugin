# Tern · 终端助手插件

> 不是终端模拟器，而是终端的"智能副驾"。
> 解决终端用户最痛的 5 个问题。

---

## 一、真实用户痛点（来自社区调研）

### 痛点 1：命令历史搜索是上个世纪的产物

> "Ctrl+R 的反向搜索是 1970 年代的设计"
> "根本就没有模糊搜索，每次都要精确匹配"
> "搜出来的结果没有上下文，不知道当时在哪个目录"

**本质：** 搜索历史命令时，你不知道那条命令当时在哪个目录、跑的结果是什么。

### 痛点 2：输出是"信息瀑布"，错误被淹没

> "几百行输出滚过去，中间的 error 瞬间就没了"
> "想回头看看，得手动翻，或者重新跑一遍加 grep"

**本质：** 终端输出只有纯文本，没有结构化。JSON、表格、文件路径全是平铺的，找东西靠眼睛扫。

### 痛点 3：报错→修复的流程是断裂的

> "报错 → 复制 → 切到浏览器 → 搜索 → 切回来"
> "这个流程每天重复 N 次"

**本质：** 终端不会帮你分析错误，你得自己复制粘贴去搜。

### 痛点 4：复杂命令记不住

> "`find . -type f -name '*.log' | xargs grep -l 'error' | wc -l`"
> "每次都要翻 man page 或者问 AI，记不住"

**本质：** 想做的事和对应的命令之间有一道"翻译"门槛。

### 痛点 5：没有会话概念

> "关掉终端就什么都没了"
> "想回顾上周跑过的命令？靠记忆"

**本质：** 终端的历史是扁平的，没有按项目/任务组织的会话概念。

### 痛点 6：Git 操作是终端的"高频噩梦"

> "`git rebase -i HEAD~3` 每次都要现查参数"
> "`fatal: Not possible to fast-forward`——这到底什么意思？"
> "想找到谁改了这个 bug，得拼凑 git blame + git log + git show"
> "不小心 rebase 错了，怎么恢复？"

**本质：** Git 是终端最高频操作之一，但命令复杂、报错晦涩、操作不可逆的心理负担重。用户真正想做的（"把这个提交移到另一个分支"）和实际要打的命令（`git cherry-pick`）之间有翻译成本。

---

## 二、产品定位

### 一句话

Tern 是一个**终端助手面板**，不是终端模拟器。它解决的是"终端本身解决不了的问题"，而不是替换终端。

### 怎么用

```
Polaris 工作区
┌─────────────────┐  ┌──────────────────────────────┐
│  内置终端         │  │  Tern 助手面板                │
│                  │  │                              │
│  $ git log       │  │  ┌── 输入 ────────────────┐  │
│  error: fatal    │  │  │ 解释这个报错             │  │
│                  │  │  └────────────────────────┘  │
│                  │  │                              │
│                  │  │  🤖 错误原因：分支冲突...    │
│                  │  │  git merge --abort           │
│                  │  │  [复制] [发送到终端 ▶]       │
│                  │  └──────────────────────────────┘  │
└─────────────────┘  └──────────────────────────────┘
```

### 和已有终端的关系

| 对比 | 内置终端 | Tern 助手 |
|------|---------|-----------|
| 做什么 | 执行命令 | 帮你写命令、分析输出、搜历史 |
| 交互方式 | 键盘输入 | 自然语言对话 |
| 数据持久 | 关掉就没了 | 对话历史自动保存 |
| AI 能力 | 无 | 自包含 OpenAI 兼容 API |

---

## 三、核心功能

### F1：命令翻译机（解决痛点 4）

用户说人话，Tern 翻译成 shell 命令。

```
用户输入: "找所有大于 100MB 的日志文件，按大小排序"
  → Tern 调用 AI → 返回:
      find . -type f -name "*.log" -size +100M | sort -rh
      [复制] [发送到终端 ▶]
```

### F2：错误分析器（解决痛点 3）

用户粘贴报错，Tern 分析原因并给出修复方案。

```
用户输入: "git: fatal: refusing to merge unrelated histories"
  → Tern 调用 AI → 返回:
      原因：两个仓库没有共同的祖先提交
      修复：git merge --allow-unrelated-histories
      [复制] [发送到终端 ▶]
```

### F3：输出格式化（解决痛点 2）

用户粘贴混乱的输出，Tern 格式化后展示。

```
用户输入: (粘贴一坨 JSON 日志)
  → Tern 自动识别 → 格式化展示:
      { "level": "error", "message": "连接超时", "time": "2026-08-05T10:00:00Z" }
      → 关键行高亮：error 级别
```

### F4：命令历史搜索（解决痛点 1）

用自然语言描述你想找的命令。

```
用户输入: "上次我改 nginx 配置的那条命令"
  → Tern 分析本地历史 → 返回:
      sed -i 's/worker_connections 1024/worker_connections 2048/' /etc/nginx/nginx.conf
      [复制] [发送到终端 ▶]
```

**注意：** F4 需要访问 shell 历史文件（`~/.bash_history` 等），是 Phase 2 的增强功能。

### F5：Git 场景中心（解决痛点 6）

Git 是终端最高频操作，Tern 专门覆盖常用 Git 场景：

**场景 1：自然语言 → Git 命令**
```
用户输入: "把 commit abc123 移到 main 分支"
  → Tern 调用 AI → 返回:
      git cherry-pick abc123
      [复制] [发送到终端 ▶]

用户输入: "修改最近 3 个提交中的第二个"
  → Tern 调用 AI → 返回:
      git rebase -i HEAD~3
      # 然后把第二个提交的 pick 改为 edit
      [复制] [发送到终端 ▶]
```

**场景 2：Git 报错分析**
```
用户输入: "fatal: Not possible to fast-forward, aborting."
  → Tern 调用 AI → 返回:
      原因：你尝试 git pull，但本地有未推送的提交，
      且远程分支已经前进了，无法快进合并。
      修复：git pull --rebase   # 用 rebase 方式拉取
      或：git pull --no-ff      # 创建合并提交
      [复制] [发送到终端 ▶]
```

**场景 3：仓库诊断**
```
用户输入: "这个仓库的分支情况怎么样？"
  → Tern 调用 AI → 返回:
      # 查看分支拓扑
      git log --graph --oneline --all --decorate
      # 查看各分支相对于 main 的差异
      git branch -v
      # 查看未合并的分支
      git branch --no-merged
      [复制] [全部发送到终端 ▶]

用户输入: "这个 bug 是谁引入的？"
  → Tern 调用 AI → 返回:
      # 找到指定行的责任人
      git blame src/main.ts -L 42,50
      # 查看该 commit 的详细信息
      git show abc123
      [复制] [发送到终端 ▶]
```

**场景 4：操作撤销/恢复**
```
用户输入: "rebase 完了发现不对，想回到之前的状态"
  → Tern 调用 AI → 返回:
      # 查看 reflog 找到 rebase 前的状态
      git reflog
      # 恢复到 rebase 前的那个提交
      git reset --hard HEAD@{1}
      [复制] [发送到终端 ▶]
```

**Git 场景的提示词策略：**
系统提示词中专门加入 Git 领域的规则，让 AI 的回复更精准（见"提示词管理"章节）。

---

## 四、技术方案

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  Tern Panel (React, esbuild bundle)                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  对话列表                                        │  │
│  │  ┌───────────────────────────────────────────┐  │  │
│  │  │ 💬 找所有大于 100MB 的日志文件            │  │  │
│  │  │ 🤖 find . -type f -name "*.log" -size... │  │  │
│  │  │    [复制]                                 │  │  │
│  │  └───────────────────────────────────────────┘  │  │
│  │  ┌───────────────────────────────────────────┐  │  │
│  │  │ 💬 解释这个报错                           │  │  │
│  │  │ 🤖 原因：xxx，修复：yyy                  │  │  │
│  │  │    [复制] [发送到终端 ▶]                  │  │  │
│  │  └───────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌── 输入 ─────────────────────────────────────────┐  │
│  │  [  输入自然语言或粘贴报错...  ]  [发送]        │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌── 状态栏 ───────────────────────────────────────┐  │
│  │  ● GPT-4o  |  历史 12 条  |  [⚙️ 配置]        │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │
         │ fetch() (SSE 流式)
         ▼
┌─────────────────────────────────┐
│  OpenAI 兼容 API                │
│  (OpenAI / DeepSeek / Groq 等)  │
└─────────────────────────────────┘
```

### 4.2 AI 集成方式

**Phase 1：无 AI，纯 UI 原型**
- 对话列表硬编码示例数据
- 验证插件结构、打包、发布流程

**Phase 2：自包含 AI（OpenAI 兼容协议）**
- 面板直接 `fetch()` 调用 OpenAI 兼容 API
- 支持流式响应（SSE → 打字机效果）
- 用户配置 API Base URL / Key / Model
- 配置存 localStorage

**Phase 3（可选）：通过 Polaris 引擎**
- 等 Polaris 核心扩展 `onPanelQuery` 实现后迁移
- 使用 Polaris 的模型配置，无需手动输入 API Key

### 4.3 提示词管理（不写死）

提示词是插件的核心"智商"来源，不能写死在代码里。采用**三级体系**：

#### 第一级：内置默认提示词（代码内置 fallback）

插件自带一组默认提示词，开箱即用。但用户完全可以不使用它。

```typescript
// src/prompts/defaults.ts
export const DEFAULT_SYSTEM_PROMPT = `你是一个终端助手，特别擅长 Git 操作。

## 通用规则
1. 用户说人话，你翻译成 shell 命令，用 \`\`\` 代码块包裹
2. 用户粘贴报错，你解释原因并给出修复命令
3. 每次回复同时给出解释和命令
4. 不确定时说明你的假设

## Git 专有规则
1. 涉及破坏性操作（reset --hard、push --force）时，增加 ⚠️ 警告
2. 复杂操作（rebase、cherry-pick）给出分步说明
3. 先解释当前状态，再给出操作命令
4. git 报错分析时，同时给出原因和修复方案`
```

#### 第二级：用户自定义（配置文件覆盖）

用户可以在配置界面中自由编辑提示词，覆盖默认值。

**配置界面：**
```
┌─────────────────────────────────┐
│  ⚙️ Tern 设置                    │
│                                 │
│  API Base URL  [______________] │
│  API Key       [______________] │
│  Model         [______________] │
│                                 │
│  ┌── 系统提示词 ──────────────┐ │
│  │  [  多行编辑框              │ │
│  │    用户可以自由编辑...      │ │
│  │    点击「恢复默认」还原    ] │ │
│  └─────────────────────────────┘ │
│                                 │
│  [恢复默认]        [保存]       │
└─────────────────────────────────┘
```

**配置存储：**
```typescript
interface TernConfig {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string  // 用户自定义，为空则使用默认值
}
```

**提示词解析逻辑：**
```typescript
function getEffectivePrompt(config: TernConfig): string {
  // 用户自定义了 → 用用户的
  if (config.systemPrompt.trim()) return config.systemPrompt
  // 否则用内置默认
  return DEFAULT_SYSTEM_PROMPT
}
```

#### 第三级：场景预设快速切换（可选增强）

进阶功能：提供多个预设提示词，用户一键切换场景。

```
┌── 场景预设 ──────────────────┐
│  ● 通用终端助手（默认）      │
│  ○ Git 专家                  │
│  ○ Docker/K8s 运维           │
│  ○ 正则表达式助手            │
│  ○ Python 脚本助手           │
│  ○ 用户自定义...             │
└──────────────────────────────┘
```

每个预设是一段提示词模板，切换后复制到编辑框中，用户可再微调。

```typescript
// src/prompts/presets.ts
export const PROMPT_PRESETS = {
  'general': {
    name: '通用终端助手',
    prompt: '你是一个终端助手...'  // 同 DEFAULT_SYSTEM_PROMPT
  },
  'git-expert': {
    name: 'Git 专家',
    prompt: `你是一个 Git 专家，精通 Git 的底层原理和高级操作。

规则：
1. 用户说 Git 操作，你给出精确的命令，用 \`\`\` 包裹
2. 涉及破坏性操作（reset --hard、push --force、rebase）时：
   - 先解释操作的风险
   - 建议先备份（git branch backup-xxx）
   - 给出回退方法（git reflog）
3. 复杂操作（rebase 冲突解决、submodule）给出分步指引
4. 报错分析时，先解释原因再给修复方案
5. 用户问"怎么恢复"时，优先用 git reflog`
  },
  'docker-ops': {
    name: 'Docker/K8s 运维',
    prompt: '你是一个 Docker 和 Kubernetes 运维专家...'
  },
  // 更多预设可后续添加
}
```

**预设的管理方式：**
- 预设是代码内置的模板，但**不强制使用**
- 用户选择预设 = 把预设内容填入编辑框，用户可随意修改
- 用户也可以自己写提示词，完全不受预设限制
- 预设通过更新插件版本迭代，不影响用户自定义内容

#### 设计原则总结

| 原则 | 说明 |
|------|------|
| **默认可用** | 开箱即用，无需配置提示词 |
| **用户可控** | 用户可以查看、编辑、替换提示词 |
| **不锁定** | 用户自定义内容不受插件更新影响 |
| **场景化** | 预设提供快速切换，但用户可自由修改 |

### 4.4 为什么不用插件后台服务？

不需要。面板直接 `fetch()` 调用 API 已经足够：
- Tauri webview 没有 CORS 限制
- 不需要额外的 Node.js 进程
- 架构简单，易于调试

API Key 存 localStorage 的风险可控——这是用户自愿配置的，且 Polaris 本身也是本地桌面应用。

---

## 五、分阶段实施

### Phase 1：纯 UI 原型（无 AI）

**目标：** 验证插件结构，走通打包发布流程。

**交付物：**
```
plugins/tern/
├── plugin.json
├── update.json
├── .pluginignore
├── package.json
├── src/
│   └── Panel.tsx        # 面板主组件
├── dist/
│   └── panel.js         # esbuild 构建产物
└── tern.zip
```

**面板组件：**
- 对话列表（硬编码示例数据，演示 F1+F2 的效果）
- 输入框（可输入，但回复是预设的）
- 空状态欢迎页
- 状态栏占位

**验收标准：**
- [ ] 面板在 ActivityBar 中显示 Terminal 图标
- [ ] 点击打开面板，显示欢迎页
- [ ] 输入文字后展示预设对话
- [ ] 复制按钮可点击
- [ ] 打包产物结构正确
- [ ] `index.json` 配置正确

### Phase 2：AI 集成

**目标：** AI 能力跑起来，实现 F1（命令翻译）+ F2（错误分析）+ F3（输出格式化）。

**新增文件：**
| 文件 | 说明 |
|------|------|
| `src/ai.ts` | AI 客户端（fetch + SSE 流式解析） |
| `src/config.ts` | 配置管理（localStorage 读写） |

**修改文件：**
| 文件 | 说明 |
|------|------|
| `src/Panel.tsx` | 集成 AI 调用、流式展示、配置弹窗 |
| `plugin.json` | 新增 `"network": true` 权限 |

**AI 客户端核心接口：**
```typescript
// src/ai.ts
interface AIConfig {
  baseUrl: string     // 默认 https://api.openai.com/v1
  apiKey: string
  model: string       // 默认 gpt-4o
  systemPrompt: string
}

// 流式调用，逐块返回
async function chatStream(
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void
): Promise<string>
```

**系统提示词：** 不写死，采用层级式提示词管理体系（见"提示词管理"章节）。

**支持的 API 端点：**

| 提供商 | Base URL | 模型 |
|--------|----------|------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b` |
| 任意兼容端点 | 用户自定义 | 用户指定 |

**状态处理：**

| 状态 | 表现 |
|------|------|
| API 未配置 | 显示配置引导，禁用发送按钮 |
| 发送中 | 按钮 loading，输入框禁用 |
| 流式接收中 | 打字机效果实时展示 |
| 流式完成 | 检测命令块，显示操作按钮 |
| API 错误 | 区分认证/网络/超时，显示具体提示 |
| 配置保存失败 | 提示 localStorage 问题 |

### Phase 3：增强（可选，根据反馈迭代）

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 发送到内置终端 | 通过 Tauri 命令写入终端会话 | 中 |
| 对话历史持久化 | 用 localStorage 保存对话 | 高 |
| 命令收藏 | 收藏常用命令快速复用 | 中 |
| 历史文件分析 | 读取 `~/.bash_history` 做自然语言搜索 | 低 |
| 迁移到 Polaris AI 引擎 | 等 `onPanelQuery` 就绪后切换 | 低 |

---

## 六、为什么这个方案与众不同

| 对比维度 | 市面上的方案 | Tern 的做法 |
|---------|------------|------------|
| **Warp 终端** | 完整的终端模拟器 + AI | 不做终端，只做助手面板 |
| **Atuin** | 命令行历史搜索工具 | 对话式交互，不只搜历史 |
| **ChatGPT 网页** | 通用对话，不关心终端上下文 | 专用系统提示词，输出格式化为命令 |
| **VS Code 终端** | 终端 + 基本 UI | 不替代终端，补充 AI 能力 |

**核心差异：** Tern 不是"又一个 AI 聊天框"，而是**专门为终端场景优化、尤其擅长 Git 的窄 AI 助手**。它知道你在终端里会遇到什么问题（特别是 Git 的那些坑），并给出针对性的帮助。

**为什么 Git 是核心差异点？**
- 通用 AI 聊天工具（ChatGPT、Claude 网页版）能回答 Git 问题，但需要你**复制粘贴**上下文
- 终端内置 AI（Warp）能帮你写命令，但**不专门优化 Git 场景**
- Tern 的提示词专门针对 Git 优化，回复更精准、更安全（破坏性操作有警告）
- Git 是开发者的"每日痛"，覆盖这个场景让插件真正有用，而不是"锦上添花"

---

## 七、文件清单

### 仓库新增

| 文件 | 阶段 | 说明 |
|------|------|------|
| `plugins/tern/plugin.json` | P1 | 插件清单 |
| `plugins/tern/update.json` | P1 | 更新清单 |
| `plugins/tern/.pluginignore` | P1 | 打包排除 |
| `plugins/tern/package.json` | P1 | esbuild 构建 |
| `plugins/tern/src/Panel.tsx` | P1 | 面板主组件 |
| `plugins/tern/src/ai.ts` | P2 | AI 客户端 |
| `plugins/tern/src/config.ts` | P2 | 配置管理 |
| `plugins/tern/dist/panel.js` | P1 | 构建产物 |
| `plugins/tern/tern.zip` | P1 | 打包产物 |

### 仓库修改

| 文件 | 说明 |
|------|------|
| `index.json` | 追加 tern 插件条目 |

---

## 八、开始开发

### Phase 1 第一步：创建插件目录和 plugin.json

```bash
mkdir -p plugins/tern/src plugins/tern/dist
```

### plugin.json

```json
{
  "id": "polaris.tern",
  "name": "Tern — 终端助手",
  "version": "1.0.0",
  "description": "终端助手：自然语言转命令、错误分析、输出格式化。",
  "enabledByDefault": true,
  "contributes": {
    "views": [{
      "id": "tern.panel",
      "area": "activityBar",
      "panelType": "tern",
      "icon": "Terminal",
      "labelKey": "plugins.tern",
      "labelDefault": "Tern",
      "order": 85
    }],
    "panel": {
      "entry": "./dist/panel.js",
      "supportsFullscreen": true
    }
  },
  "permissions": {
    "aiToolAccess": true
  }
}
```

### 构建命令

```bash
cd plugins/tern
npx esbuild src/Panel.tsx --bundle --format=esm \
  --outfile=dist/panel.js \
  --jsx=automatic --external:react --external:react/jsx-runtime
```

### 打包命令

```bash
cd ../..
node scripts/pack.js plugins/tern
```