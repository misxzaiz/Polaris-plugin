# Battle Mode — AI 对话内开战(MCP)

Battle Mode 提供一组 **MCP 工具**,让 AI 在聊天里直接主持/参与一场对抗式辩论,无需打开面板。

## 工具一览

| 工具 | 作用 | 必先调用 |
|---|---|---|
| `battle_setup` | 立题 + 抽角色卡 A/B + 世界观跳伞,战局存入配置 | —(开战第一步) |
| `battle_roll` | 掷维度骰子 / 火力判定(重炮·冷枪) | battle_setup |
| `battle_prompt` | 生成主持人 / 辩手提示词,交给任意 AI 执行 | battle_setup |
| `battle_report` | 生成战报模板(学到的三件事 / 共识分歧) | battle_setup |
| `battle_status` | 查看当前战局快照 | — |

## 用法(给 AI 的指令示例)

```
用 Battle Mode 和我打一场:
1. battle_setup(topic: "SimpleAI 该不该学主流 harness 的并发模型?",
                sideA: "不该,轻量就该轻", sideB: "该,抄作业")
2. battle_roll(kind: "both")
3. battle_prompt(kind: "host")  — 你按生成的提示词当主持人
4. 主持 A 立论 → B 回应 → A 辩护 → 火力点评 + 血条
5. 结束后 battle_report 生成战报,填入学到的三件事
```

AI 拿到 `battle_prompt` 返回的提示词后,**直接把整段提示词作为指令发给任意模型**(或自己扮演),即可推进战斗。

## 状态与持久化

- 战局状态存于 `{appConfigDir}/config.json` 的 `plugins["battle-mode"].state`,与面板共用。
- `battle_status` 随时可查当前战局(角色/世界观/已掷维度/火力/轮数)。
- 面板的「发到聊天」把战报写入会话,天然持久化。

## 与面板的分工

- **面板**(活动栏 Battle):立题 → 抽卡 → 跳伞 → 掷骰的可视化操作台,适合人手动操作。
- **MCP**:AI 在对话里直接开战,适合「边聊边打」或自动化流程。
- 两者共用同一份战局状态,互不冲突。

## 技术说明

- `mcp/server.js`:纯 Node 实现,零依赖,stdio 传输,标准 MCP 协议(initialize / tools/list / tools/call)。
- 数据表(角色卡/世界观/维度/火力)与面板 `src/engine.ts` 保持同一套。
- 无需 API key,纯本地运行。
