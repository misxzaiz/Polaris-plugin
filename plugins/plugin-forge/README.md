# 插件工坊（plugin-forge）

> 治本「每次建插件都要重新分析项目」：把散落在官方文档（部分与代码矛盾）、六个已交付插件与历届踩坑实录里的插件开发知识，逐条代码级核实后收编成结构化知识库，配清单体检器与生产级脚手架。AI 收到「帮我创建插件」先拉 `forge_overview`，秒级拿到全部平台契约，不再考古。

## 面板（ActivityBar → ⚗️ 插件工坊）

- **知识库**：16 个主题全文（平台总览 / manifest 规范 / 面板 / 跨域治理三层 / 服务 / 服务自举 start / 单写者 / 键空间 / MCP / cap 速查 / 测试 / 发布 / UI / 生产级清单 / 实测坑总表 / AI 工作流）。支持全文搜索（与 MCP `forge_search` 同口径）。
- **体检**：粘贴或上传 plugin.json → 20+ 条实测规则（图标 18 白名单、服务健康检查、MCP 声明、permissions 已知集、发布 URL @tag 陷阱……），每条问题给修复建议。
- **脚手架**：填 id/名称/图标/服务/MCP 开关 → 生成 15 个文件的完整骨架（自发现桥 kvclient、服务 tick 骨架、MCP stdio、面板、单测、真实桥冒烟模板、README 键空间契约表），可预览/复制；落盘走 MCP 工具（面板无 fs，手机端复制自动回退手动弹窗）。

## AI 工具（MCP 5 个 `forge_*`）

| 工具 | 用途 |
|---|---|
| `forge_overview` | **建插件请求的第一个调用**：平台速览 + 16 主题目录 |
| `forge_search` | 全文检索（「cap.http 手机上能用吗」这类具体疑点秒答） |
| `forge_topic` | 读整个主题（含可照抄的代码契约） |
| `forge_lint` | 体检清单（传 json 字符串或文件路径） |
| `forge_scaffold` | 生成骨架；`dir + confirm:true` 直接落盘（只新建不覆盖，非空目录拒绝） |

## 架构

```
面板（React bundle；知识库/模板经 esbuild text loader 内联）
  └─ 纯本地：零服务、零外网；设置存 cap.kv forge.settings
MCP server（stdio；fs 读同一份 shared/ 文件 → 面板与 AI 永远同口径）
```

shared core 模式：体检规则引擎 `shared/forge-core.js` 面板与 MCP 共用，两边结论永远一致。

## 键空间契约（权威表）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `forge.settings` | 面板 | 面板 | 脚手架默认值（目标目录/图标/order），跨端一致 |

## 数据与隐私

纯本地：知识随插件分发，不联网、不采集。

## 开发

```bash
npm install
npm run typecheck
npm run build
node test/run-tests.mjs     # 离线单测（lint/搜索/模板/自洽）——24 条
node test/smoke-real.mjs    # 真实 MCP 全闭环 + 落盘守卫——12 条（自清理）
```

## 已知边界

- 知识库结论核实于 2026-10-27，主仓协议演进后以代码为准（体检器规则同步维护）。
- 脚手架只保证「连接层与骨架正确」，业务逻辑仍需按 workflow 主题实现与验证。
- 官方文档 `docs/plugin-development-guide.md` 存在与代码矛盾的条目（React 打包方式、环境变量注入、服务日志 API、ready 信令），以本库 `pitfalls` 主题为准。
