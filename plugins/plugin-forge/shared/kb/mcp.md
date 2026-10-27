# MCP server 最小实现与工具设计

MCP server 是独立 node 进程（stdio JSON-RPC），把 AI 的 tools/call 翻译成对 cap.kv / 本地资源的操作。宿主经 manifest 的 `contributes.mcpServers` 拉起，AI 侧要重连/重启应用后才能看到新工具。

## 协议最小实现（2024-11-05，零依赖，全部已验证）

```js
// stdin 按行读 JSON-RPC，stdout 写响应（协议数据只走 stdout，日志全走 stderr）
// 必须处理三个 method：
initialize            → { protocolVersion, capabilities:{tools:{}}, serverInfo:{name, version} }
notifications/initialized → 无响应
tools/list            → { tools: [{ name, description, inputSchema }] }
tools/call            → { content: [{ type:'text', text }], isError }   // ok/err 两包装
// 未知 method（带 id）→ error { code: -32601 }
```

进程参数：`node mcp/server.js {{appConfigDir}}`（arg[2] 是 appConfigDir，自发现桥/日志兜底都要它）。

## 工具设计（决定 AI 用不用你的工具的是 description）

1. **description 写「适用句式」**：用户会说什么 → 用哪个工具。clip-relay 范例：「适用：把这个链接发到我手机上」「记个口令到接力板」。AI 靠这个匹配用户意图。
2. **中文写工具描述**（宿主用户是中文），inputSchema 属性逐个加中文 description。
3. **危险操作强制 confirm**：入参加 `confirm: { type:'boolean' }` + `required`，`args.confirm !== true` 直接返回 isError 提示「危险操作，请先与用户确认」（clip-relay relay_clear / pocket-host kill 四层护栏同款）。
4. **返回文本面向 AI**：给结构化、可继续推理的中文文本（列表带 id 方便后续按 id 操作）；单行截断（`oneLine(s, 120)`）防撑爆上下文，read 类工具给全文。
5. **工具数量 4~7 个**为佳，按动词命名：`<前缀>_<动作>`（`relay_push`、`dig_import`）。
6. 错误分类：`isError:true` 的业务失败 vs 抛异常的进程错误——前者 AI 能读并自纠，后者只会看到 -32603。
7. MCP 进程同样要走 kvclient 自发现桥（复用 service/kvclient.js），日志走 stderr 且**绝不污染 stdout**。

## 主仓侧注意

改的是主仓内建 MCP（ask_mcp_server 等）schema 时才需要 `cargo build --bin polaris-mcp` 重编 bin——插件自带 MCP server 不需要；但插件工具列表更新后 AI 侧要重连 MCP 才可见。
