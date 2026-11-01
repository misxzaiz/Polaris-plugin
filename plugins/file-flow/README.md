# 文件管家（file-flow）

把「下载文件夹永远乱糟糟」变成会自己收拾的工作台：规则常驻后台盯文件夹，动手前先预览、动手后可撤销、**永不删除**。

## 它解决什么

- 下载文件夹堆满安装包/压缩包/文档/图片，永远来不及收拾；
- 现有自动整理工具（Hazel 仅 Mac / File Juggler 收费 / DropIt 停滞）要么贵要么老，且都不敢让程序动文件；
- 本插件的答案：**dry-run 计划先行 + 批次撤销日志 + 新文件护栏**，把「不敢自动化」变「敢自动化」。

## 核心能力

| 能力 | 说明 |
|---|---|
| 规则引擎 | 扩展名/名称正则/大小/年龄/子目录匹配；动作 move/recycle/dedupe/rename；目的目录支持 `{yyyy}-{mm}` 等变量 |
| 预置起步包 | 「下载夹起步包」一键载入：重复下载收走 → 安装包/压缩包/文档/图片/媒体归档 → 30 天旧文件冷存（幂等） |
| dry-run 先行 | 「立即整理」先出逐文件计划预览，确认才执行；自动模式只处理新到文件 |
| 批次撤销 | 每次执行留批次日志（from→to），撤销逐文件回移，冲突/已再移动的如实报告、绝不覆盖 |
| 安全模型 | 永不删除（回收=移入 `<root>/_FileFlow回收站/`）；目的默认限根内，根外需显式开启且仅手动确认执行；新文件护栏（默认 5 分钟）；占用文件（EBUSY）自动跳过记录；跨盘 copy+校验+删源 |
| AI 对话 | MCP 七工具：`flow_status` / `flow_roots` / `flow_rules` / `flow_dryrun` / `flow_apply` / `flow_undo` / `flow_history`——一句话生成规则、预览、执行、撤销 |
| 三端面板 | 总览（根卡片+立即整理+计划预览弹层）/ 规则（编辑器+启停+起步包）/ 历史（批次+撤销）/ 设置 |

## 架构

```
plugins/file-flow/
  plugin.json          Files 图标；service + mcpServers(stdio) + panel
  service/
    lib.js             纯逻辑层（规范化/模板/匹配/计划/去重/撤销/清扫）——fs-free，离线可测
    fsutil.js          fs 工具层（walk 排除/内容指纹/移动含 EXDEV 回退）——真实临时目录可测
    kvclient.js        宿主桥自发现（env → anchor → config → 扫描），与全仓库同一协议
    flow.js            服务主循环：tick 消费命令（先删后做）/ fs.watch 监听 /
                       自动模式（auto=off|new|all）/ 计划执行 / fileflow.* kv 单写者
  mcp/server.js        AI 工具层（stdio，零依赖）：读快照+投命令并等结果，不自行动文件
  src/                 面板（React+esbuild）：零网络请求，经宿主 invoke→cap.kv 三端同源
  test/run-tests.mjs   离线单测（lib 32 断言 + fsutil 真实临时目录 + 端到端组装）
  test/smoke-real.mjs  真桥冒烟（需宿主运行）：临时根目录全生命周期 24 断言
```

**键空间契约**（`fileflow.*`，唯一写者=后台服务）：
`meta` 心跳 / `roots` `rules` `settings` 状态 / `snapshot` 总览 / `stats` 累计 / `plan.<id>` 计划（24h）/ `batch.<id>` 批次日志（60 批）/ `cmd.<nonce>` `result.<nonce>` 命令信箱（先删后做）。

## 验证

```bash
node test/run-tests.mjs     # 离线单测（无宿主依赖）
pnpm run typecheck && pnpm run build   # 面板 tsc + esbuild → dist/panel.js
node test/smoke-real.mjs    # 真桥冒烟（需 Polaris 宿主在运行）
```

实测（2026-11-02，本机 Windows 11 + 宿主 9820 桥）：单测 32/32，冒烟 24/24（含真实移动/撤销/护栏/confirm 门/幂等），MCP stdio 协议 initialize/tools/list/flow_status 实测通过。

## 已知边界

- 去重指纹 = size + 首/尾 64KB md5，非全文件 hash（GB 级文件的工程折衷；误判需同前缀+同长度，概率极低）；
- 自动模式（`auto=new|all`）不执行根外目的 op——这些动作只在手动「立即整理」确认后执行；
- 撤销不保证跨后续批次（文件被再整理后撤销该步会如实报 gone，不回滚链）；
- 递归深度 ≤6、单根遍历上限 8000 条目、单批动作上限可配（默认 500）。
