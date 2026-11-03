# text-triage 文本分流台

把非结构化文本（日志行 / 告警 / 错误报告）确定性地跑成三段结论：

```
文本 → ①分类（按序规则首中即决） → ②抽取（结构化字段 + 类型归一） → ③决策（verdict/severity/route）
                └────────────── 全程 trace 证据链，每步判定可回放 ──────────────┘
```

## 分流模板

一份模板（pipeline）= 三张表：

- **classes**：分类规则，按序首中即决。每条 `anyOf` 多模式命中其一即中；模式 `"re:<source>"` 为 JS 正则（大小写敏感），其他为字面子串（不区分大小写）。未命中落「未分类」。
- **extract**：按类别 id 或 `*`（共享层）定义字段抽取。`pattern` 同上；`group` 指定捕获组（默认第 1 组，无捕获组取整段）；`type` 归一为 `string/int/float/bool/duration(→ms)/bytes(→B)/date(→ISO)`；抽取失败出警示不致命，`default` 兜底。
- **decide**：按类别 id 或 `*` 的条件规则表，首中即决。算子 `exists/missing/eq/ne/gt/gte/lt/lte/contains/matches/in`；产出 `{verdict, severity?, label?, route?, note?}`。类别规则 → `*` 规则 → `fallback` 三级回落。

## 使用

- **面板**：内置预设（log-triage / latency-triage / disk-triage）一键载入，改 JSON → 粘文本 → 运行；模板存宿主 kv 三端共享。
- **MCP 七工具**（`text_triage_*`）：`run`（内联模板即跑）/ `test`（跑已存模板）/ `save` / `get` / `delete` / `list` / `builtin`。模糊分类判断交给 AI（选模板、调规则），可复跑的抽取与决策交给引擎。

## 边界

- 不做 LLM 调用（引擎纯确定性，冒烟离线可复跑）；不做文件批量处理与多步编排（那是 flow-pipeline 的领地）。
- 正则无内联 flags；无时区字样的日期按本机时区解释并注明；duration/bytes 裸数字分别按毫秒/字节。
- 持久化走 cap.kv 自建索引键，**零 `list` 动作**（宿主高危接口）。

## 测试

```bash
npm test   # core 单测 79 + MCP 假桥 28 + SSR 渲染 8 = 115 断言
```
