# AI 建插件推荐流程（先读我）

**给 AI 的 SOP**：用户说「帮我创建一个插件」「给 Polaris 写个 xxx」时，按这个流程走，每步引用对应主题拿细节。目标是一次交付生产级，不返工。

## 0. 拉知识（1 次工具调用，别重新考古项目）

```
forge_overview → 平台速览 + 全部主题目录
```

有具体疑点再 `forge_search`/`forge_topic`（如「服务怎么自举 start」→ forge_topic service-start）。**不要再通读主仓/样板插件源码**——本库已逐条核实并标注与官方文档的冲突处。

## 1. 定案（跟用户对齐，30 秒）

- 解决什么问题、数据放哪（kv 键空间前缀）、要不要服务（要外网/定时→要）、要不要 MCP（AI 操作→要）
- 用 `forge_scaffold`（MCP 工具）生成骨架并落盘：`{ id, name, prefix, icon, withService, withMcp, dir, confirm: true }`

## 2. 定契约（写代码前，防返工）

- 键空间契约表（keyspace 主题模板）→ 直接写进 README
- 数据模型与单写者边界（谁写哪些键，其他人怎么发令）→ single-writer
- 跨域路径：面板绝不 fetch；抓取下沉服务；cap.http 只当桌面加速 → cross-origin

## 3. 实现（推荐顺序）

1. `shared/<x>-core.js` 纯函数核心（解析/规范化/业务规则）——**先写它并配单测**，坑在这里暴露最便宜
2. 服务进程（kvclient 抄脚手架，tick 循环 + 命令消费 + 心跳）→ `service`
3. 面板（Panel + Tabs；服务管理卡要自举 start → service-start；UI 坑 → ui-ux）
4. MCP server（工具 description 写「适用句式」→ mcp）

## 4. 验证（三层全绿才算完成）→ testing

- `node test/run-tests.mjs`（离线单测）
- `npm run typecheck && npm run build`
- `node test/smoke-real.mjs`（真实桥冒烟：护栏检查 → 起真服务真 MCP → 真实外网用例 → 自清理 → N/N 报告）
- 生产级对照 → production-checklist（逐条过）

## 5. 发布（三坑在前面等你）→ publishing

手动加 index.json 条目（先重读现文件！并发覆盖事故两次实录）→ pack → sha 写回 → update.json 同步 → validate.js

## 常见跑偏

- ❌ 一上来通读主仓源码半天 → 库里已有结论，forge_topic 秒拿
- ❌ 面板直接 fetch 外网「先跑通再说」→ CORS 白屏，回头重做
- ❌ 一键一实体写 kv → list 全局变慢，返工分块
- ❌ 先写 UI 后写核心 → 单测没处挂，坑全在联调期爆
- ❌ 没跑冒烟就说「已完成」→ 用户按 AGENTS.md 要求如实报告验证结果
