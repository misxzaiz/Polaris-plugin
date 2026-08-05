# 扩展方案：插件面板双向通信（Panel Query API）

> 为 Polaris 插件面板添加 AI 双向通信能力，使面板可以发送消息给 AI 并接收回复。
> 同时支持模型选择、流式响应等高级功能。

---

## 1. 现状分析

### 1.1 当前通信架构

```
┌──────────────┐     onSendToChat(msg)     ┌──────────────────┐
│  插件面板      │ ──────────────────────▶  │  AI 聊天会话      │
│  (面板组件)    │                          │  (Conversation)   │
│              │                          │                   │
│              │       ◀─ 无回传通道 ────  │                   │
└──────────────┘                          └──────────────────┘
```

**当前问题：**
- `onSendToChat(message: string)` 是**单向 fire-and-forget**，面板无法知道 AI 回复了什么
- 面板发消息后，AI 回复出现在聊天区域，但面板不知道回复内容
- 面板无法指定用哪个模型处理请求
- 面板无法获取流式回复

### 1.2 关键代码路径

**App.tsx 中的 sendMessage：**
```typescript
const { sendMessage } = useActiveSessionActions()
// sendMessage 来自 ConversationStore，签名：
// sendMessage(content: string, workspaceDir?: string, attachments?, sendOptions?)
```

**ConversationStore.sendMessage 流程：**
1. 添加用户消息到 messages
2. 设置 isStreaming = true
3. 调用 `invoke('start_chat' | 'continue_chat', ...)` 发送给后端
4. 后端返回事件流（通过 eventHandler 处理）
5. AI 回复以流式方式追加到 currentMessage

**插件面板接收的 props（PluginPanelComponent）：**
```typescript
type PluginPanelComponent = ComponentType<{
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>  // 单向
}>
```

**聊天卡片的双向通信（interaction 模式）：**
```typescript
// PluginChatCardProps 中已有双向机制
respond?: (result: unknown) => Promise<void>  // 卡片提交回复
```
但这只适用聊天卡片，不适用于侧边栏面板。

### 1.3 已有模型选择能力

Polaris 已有完善的 ModelProfile 系统：
- `useModelProfileStore` 管理模型配置
- `getActiveModelProfile()` 获取当前激活的模型
- 支持不同引擎（claude / codex / simple-ai）
- 支持自定义 API 端点
- `sendMessage` 的 options 中已支持 `modelProfileId` 和 `model` 参数

---

## 2. 扩展方案

### 2.1 核心新增：Panel Query API

在 `PluginPanelProps` 中新增 `onPanelQuery` 属性，为面板提供**发送消息并等待回复**的能力。

#### 新增类型定义

```typescript
// ===== 新增：插件面板查询选项 =====
export interface PanelQueryOptions {
  /** 模型 Profile ID（覆盖当前会话默认模型） */
  modelProfileId?: string
  /** 模型名称（覆盖 Profile 中的默认模型） */
  model?: string
  /** 引擎 ID */
  engineId?: EngineId
  /** 温度等模型参数 */
  modelOptions?: Record<string, unknown>
  /** 系统提示词（额外追加） */
  systemPrompt?: string
  /** 是否启用流式回调 */
  stream?: boolean
  /** 超时（毫秒，默认 60000） */
  timeout?: number
}

// ===== 新增：面板查询结果 =====
export interface PanelQueryResult {
  /** AI 回复的文本内容 */
  content: string
  /** 回复中的工具调用（面板可选择忽略） */
  toolCalls?: ToolCallBlock[]
  /** 用量统计 */
  usage?: UsageStats
  /** 是否被中断 */
  interrupted: boolean
}

// ===== 新增：面板查询回调（流式） =====
export interface PanelQueryCallbacks {
  /** 流式文本块回调 */
  onChunk?: (chunk: string) => void
  /** 流式结束回调 */
  onDone?: (result: PanelQueryResult) => void
  /** 错误回调 */
  onError?: (error: Error) => void
}

// ===== 扩展：PluginPanelProps =====
export interface PluginPanelProps {
  pluginId: string
  /** 单向发送消息到聊天（现有，不变） */
  onSendToChat?: (message: string) => void | Promise<void>
  
  /** 
   * 双向：发送消息给 AI 并等待回复。
   * 面板调用此方法后，返回的 Promise 会在 AI 回复完成后 resolve。
   * 支持流式（通过 callbacks.onChunk）和一次性获取完整结果。
   */
  onPanelQuery?: (
    message: string,
    options?: PanelQueryOptions,
    callbacks?: PanelQueryCallbacks
  ) => Promise<PanelQueryResult>
  
  /** 获取可用模型列表（供面板 UI 选择） */
  getAvailableModels?: () => ModelProfile[]
}
```

### 2.2 实现方案

#### 方案 A：后端新建独立端点（推荐）

**思路：** 在 Polaris 后端（Rust）新增一个 `panel_query` 命令，它创建一个独立的、轻量的 AI 会话（非聊天会话），返回结果后自动销毁，不污染聊天历史。

**优点：**
- 不干扰聊天会话的上下文和历史
- 无需等待聊天会话的流式传输完成
- 性能更好，适合面板的"查询-响应"场景
- 不会在聊天区域显示面板的"中间消息"

**缺点：**
- 需要 Rust 后端改动
- 不能用已有的模型配置

**实现：**

**Rust 端（src-tauri/src/commands/）：**
```rust
#[derive(Deserialize)]
pub struct PanelQueryRequest {
    pub message: String,
    pub system_prompt: Option<String>,
    pub model_profile_id: Option<String>,
    pub model: Option<String>,
    pub engine_id: Option<String>,
}

#[derive(Serialize)]
pub struct PanelQueryResponse {
    pub content: String,
    pub usage: Option<UsageStats>,
}

#[tauri::command]
pub async fn panel_query(
    state: State<'_, AppState>,
    request: PanelQueryRequest,
) -> Result<PanelQueryResponse, String> {
    // 1. 解析模型 Profile
    let profile = resolve_model_profile(&state, request.model_profile_id, request.engine_id);
    
    // 2. 创建临时 AI 会话（非持久化）
    let session = state.ai_launcher.create_ephemeral_session(
        profile,
        request.system_prompt,
    );
    
    // 3. 发送消息，等待完整回复
    let response = session.send_message(&request.message).await.map_err(|e| e.to_string())?;
    
    Ok(PanelQueryResponse {
        content: response.text,
        usage: response.usage,
    })
}

// 流式版本
#[tauri::command]
pub async fn panel_query_stream(
    state: State<'_, AppState>,
    request: PanelQueryRequest,
    window: tauri::Window,
) -> Result<(), String> {
    // 类似但通过事件通道发送流式块
    // window.emit("panel_query_chunk", chunk)
    // window.emit("panel_query_done", result)
}
```

**前端（src/services/tauri/）：**
```typescript
// 新增：panelQueryService.ts

export async function panelQuery(
  message: string,
  options?: PanelQueryOptions
): Promise<PanelQueryResult> {
  return invoke('panel_query', {
    request: {
      message,
      system_prompt: options?.systemPrompt,
      model_profile_id: options?.modelProfileId,
      model: options?.model,
      engine_id: options?.engineId,
    }
  })
}

export async function panelQueryStream(
  message: string,
  options?: PanelQueryOptions,
  callbacks?: PanelQueryCallbacks
): Promise<PanelQueryResult> {
  // 监听流式事件
  const unlisten = await listen('panel_query_chunk', (event) => {
    callbacks?.onChunk?.(event.payload as string)
  })
  
  try {
    await invoke('panel_query_stream', {
      request: { message, ... }
    })
    // 等待 done 事件
    return new Promise((resolve, reject) => {
      const unlistenDone = await listen('panel_query_done', (event) => {
        resolve(event.payload as PanelQueryResult)
      })
    })
  } finally {
    unlisten()
  }
}
```

#### 方案 B：复用现有聊天会话（轻量）

**思路：** 利用已有的 `sendMessage` + `continueChat`，但添加一个"面板查询专用"的 Promise 包装器，监听 AI 回复完成事件。

**优点：**
- 不需要 Rust 后端改动
- 复用现有模型配置、权限、工具
- 对插件开发者来说调用更简单

**缺点：**
- 会污染聊天历史（面板的查询会出现在聊天中）
- 需要等待流式传输完成，耗时较长
- 与主聊天会话互相影响

**实现（前端纯方案）：**
```typescript
// 在 App.tsx 或独立的 hook 中实现

export function usePanelQuery() {
  const activeSessionId = useActiveSessionId()
  const { sendMessage } = useActiveSessionActions()
  
  const query = useCallback(async (
    message: string,
    options?: PanelQueryOptions,
    callbacks?: PanelQueryCallbacks
  ): Promise<PanelQueryResult> => {
    return new Promise((resolve, reject) => {
      // 1. 订阅当前会话的消息完成事件
      const unsub = useConversationStore.subscribe(
        (state) => state.messages,
        (messages, prevMessages) => {
          // 检测新完成的 assistant 消息
          if (messages.length > prevMessages.length) {
            const lastMsg = messages[messages.length - 1]
            if (lastMsg.type === 'assistant' && !lastMsg.isStreaming) {
              const text = lastMsg.blocks
                .filter(b => b.type === 'text')
                .map(b => b.content)
                .join('')
              resolve({ content: text, interrupted: false })
            }
          }
        }
      )
      
      // 2. 发送消息
      sendMessage(message)
    })
  }, [activeSessionId])
  
  return { query }
}
```

#### 推荐方案：方案 A（独立后端端点）

虽然方案 B 实现更简单，但方案 A 更适合我们的场景：

1. 面板查询和聊天不应该互相干扰
2. 面板查询需要更快的响应（不需要加载聊天历史）
3. 面板查询可以指定不同模型，而不改变当前会话设置
4. 未来可以扩展为"面板查询"有独立的用量统计

---

### 2.3 模型选择能力

面板可以通过 `onPanelQuery` 的 `options` 参数指定模型，也可以通过 `getAvailableModels` 获取模型列表供用户选择：

```typescript
// 在面板中获取可用模型
const models = await getAvailableModels()

// 用户选一个模型
const selectedModel = models.find(m => m.id === 'xxx')

// 用选定模型查询
const result = await onPanelQuery('分析这个输出', {
  modelProfileId: selectedModel?.id,
  // 或直接指定模型名
  model: 'claude-sonnet-5-20251001',
})
```

**前端实现：**
```typescript
// 在 App.tsx 中注入 getAvailableModels
const getAvailableModels = useCallback(() => {
  return useModelProfileStore.getState().profiles
}, [])

// 传给面板
<PluginPanelHost
  panelType={panelType}
  onSendToChat={sendMessage}
  onPanelQuery={panelQuery}
  getAvailableModels={getAvailableModels}
/>
```

---

## 3. 需要修改的文件

### Polaris 项目（核心）

| 文件 | 修改内容 | 复杂度 |
|------|---------|--------|
| `src/plugin-system/types.ts` | 新增 `PanelQueryOptions`、`PanelQueryResult`、`PanelQueryCallbacks` 接口；扩展 `PluginPanelComponent` props 类型 | 低 |
| `src/components/Plugins/PluginPanelHost.tsx` | 新增 `onPanelQuery` 和 `getAvailableModels` props，透传给面板组件 | 低 |
| `src/App.tsx` | 实现 `panelQuery` 回调，注入到 PluginPanelHost | 中 |
| `src/services/tauri/` | 新增 `panelQueryService.ts`（封装 invoke 调用） | 低 |
| `src-tauri/src/commands/` | 新增 `panel_query.rs`（Rust 端命令实现） | 高 |
| `src-tauri/src/lib.rs` | 注册新命令 | 低 |
| `src-tauri/src/ai/` | 可能需要新增 ephemeral session 创建方法 | 中 |

### Polaris-plugin 项目（终端插件）

| 文件 | 修改内容 |
|------|---------|
| `plugins/tern/plugin.json` | 插件 manifest |
| `plugins/tern/mcp/server.js` | MCP 工具（可选） |
| `plugins/tern/panel/` | React 面板组件（使用 onPanelQuery） |

---

## 4. 终端插件如何使用

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Polaris 工作区                                                   │
│                                                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  内置终端            │  │  Tern 智能面板                   │  │
│  │  (TerminalPanel)    │  │  (Polaris 插件面板)              │  │
│  │                     │  │                                  │  │
│  │  $ git log          │  │  ┌── 模型选择 ─────────────────┐ │  │
│  │  error: ...         │  │  │ [Claude Sonnet 5 ▼]        │ │  │
│  │                     │  │  └────────────────────────────┘ │  │
│  │                     │  │                                  │  │
│  │                     │  │  ┌── 输入 ─────────────────────┐ │  │
│  │                     │  │  │ 解释这个错误并给出修复方案    │ │  │
│  │                     │  │  └────────────────────────────┘ │  │
│  │                     │  │                                  │  │
│  │                     │  │  ┌── 回复 ─────────────────────┐ │  │
│  │                     │  │  │ 错误原因：xxx               │ │  │
│  │                     │  │  │ 修复命令：git reset ...     │ │  │
│  │                     │  │  │ [发送到终端 ▶] [复制]       │ │  │
│  │                     │  │  └────────────────────────────┘ │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 面板调用示例

```typescript
// TernPanel.tsx
function TernPanel({ onPanelQuery, onSendToChat, getAvailableModels }: PluginPanelProps) {
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string | undefined>()
  const models = getAvailableModels?.() ?? []

  const handleQuery = async () => {
    setLoading(true)
    setResponse('')
    try {
      const result = await onPanelQuery?.(input, {
        modelProfileId: selectedModel,
        systemPrompt: '你是一个终端助手。将用户自然语言转换为命令，并解释技术问题。回答简洁。',
      }, {
        onChunk: (chunk) => setResponse(prev => prev + chunk),
      })
      if (result) setResponse(result.content)
    } catch (e) {
      setResponse(`错误: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const sendToTerminal = (cmd: string) => {
    // 通过 Tauri 命令发送到终端
    invoke('plugin_terminal_write', { sessionId: '...', data: cmd + '\n' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 模型选择 */}
      <select value={selectedModel} onChange={...}>
        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      
      {/* 输入 */}
      <textarea value={input} onChange={...} />
      <button onClick={handleQuery} disabled={loading}>
        {loading ? '分析中...' : '查询'}
      </button>
      
      {/* 回复 */}
      <div>{response}</div>
      
      {/* 提取命令发送到终端 */}
      {extractedCommands(response).map(cmd => (
        <button onClick={() => sendToTerminal(cmd)}>
          ▶ 发送到终端: {cmd}
        </button>
      ))}
    </div>
  )
}
```

---

## 5. 分阶段实施计划

### Phase 1：核心双向通信（最小可行）

**目标：** 让面板能发送消息并等待回复，不污染聊天历史。

**改动：**
1. 新增 `src-tauri/src/commands/panel_query.rs` — 简单的 `panel_query` 命令
2. 扩展 `PluginPanelProps` 类型
3. `PluginPanelHost` 透传新 props
4. `App.tsx` 实现 `panelQuery` 回调

### Phase 2：模型选择

**目标：** 面板可以获取模型列表并指定模型。

**改动：**
1. `App.tsx` 注入 `getAvailableModels`
2. 面板端开发模型选择器 UI

### Phase 3：流式支持

**目标：** 面板可以接收流式回复。

**改动：**
1. Rust 端 `panel_query_stream` 命令，通过事件通道发送流式块
2. 前端 `panelQueryService.ts` 封装流式监听
3. `PanelQueryCallbacks` 中的 `onChunk` 回调

---

## 6. 风险与注意事项

| 风险 | 缓解 |
|------|------|
| **历史污染**：面板查询出现在聊天历史中 | 方案 A 使用独立 ephemeral session，不写入历史 |
| **并发冲突**：面板查询和用户聊天同时进行 | 独立 session 互不干扰；方案 B 需加锁 |
| **模型切换**：面板切换模型不影响当前会话 | 方案 A 的独立 session 可以指定不同模型 Profile |
| **Token 消耗**：面板查询消耗额外 Token | 显示用量统计，让用户感知 |
| **Rust 后端改动成本** | 从简单命令开始，逐步迭代 |

---

## 7. 总结

| 能力 | 当前状态 | 扩展后 |
|------|---------|--------|
| 面板发送消息给 AI | ✅ onSendToChat | ✅ 不变 |
| 面板接收 AI 回复 | ❌ | ✅ onPanelQuery |
| 面板指定模型 | ❌ | ✅ PanelQueryOptions.modelProfileId |
| 面板获取模型列表 | ❌ | ✅ getAvailableModels |
| 面板流式接收 | ❌ | ✅ PanelQueryCallbacks.onChunk |
| 不影响聊天历史 | ❌（消息会出现在聊天中） | ✅ 独立 ephemeral session |