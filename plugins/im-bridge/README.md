# im-bridge —— IM 机器人接入插件

外部 IM 平台（QQ Bot / 飞书 / 钉钉）接入：多实例管理、消息收发、AI 自动回复。
迁移自宿主内置 `integrations/` 域（`plans/im-integration-extraction-spec.md`）。

## 架构

```
IM 平台 ←—WS/长连接—→ service/main.js（常驻 Node）
                          ├─ platforms/{qqbot,feishu,dingtalk}.js  协议适配
                          ├─ commands.js    /命令解析（/stop /status /resume…）
                          ├─ ai.js          cap.ai.chat 驱动 + 回复聚合
                          ├─ state.js       会话/实例状态（cap.kv 持久化）
                          └─ HTTP :port     /__health（Supervisor）+ /dispatch（面板）
面板 dist/panel.js ──cap.pluginServiceManager.request──→ service /dispatch
MCP server（stdio）── cap.kv 信箱（im-bridge:send-mailbox）──→ service 消费发送
```

## MCP 工具

| 工具 | 说明 |
|---|---|
| `im_send` | 发送 IM 消息（platform + conversationId + text） |
| `im_status` | 查询三平台连接状态 |
| `im_instances` | 列出已配置实例 |

## 命令（IM 内）

`/claude [提示词]` `/simple-ai` 切换引擎 · `/stop` 中断 · `/status` 状态 ·
`/path <dir>` 工作目录 · `/resume` 恢复会话 · `/restart` 重启 · `/clear` 清上下文 ·
`/preset list` 预设 · `/help` 帮助

## 配置迁移

插件首次启动从宿主 `config.json` 的 `qqbot/feishu/dingtalk` 段一次性导入实例
（spec D3），之后以插件内 `cap.kv`（`im-bridge:instances`）为准。

## 已知边界

- 飞书 pbbp2 帧、QQ Bot op 协议、钉钉 Stream 协议与主仓 integrations 逐字对齐。
- 媒体下载：QQ 直链 GET；飞书走 resources API；钉钉不支持（与主仓一致）。
- AI 回复经 `cap.ai.chat`（contextId 前缀 `im-bridge:`），流式增量仅面板可见，
  IM 侧整段发送（与主仓 manager 语义一致）。
