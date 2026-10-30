# needs/ — 需求库公约（唯一权威）

> 一库两端：白天 Polaris 记录（插件 `plugins/needs`），夜里 ZCode 消化（闲时/定时巡逻）。
> 本文件是状态机与字段定义的**唯一权威**——插件代码与所有提示词模板只引用本文件，不复制枚举。

## 目录

```
needs/
├── README.md               # 本公约
├── template.md             # 条目模板（手工建档时复制；插件 needs_add 按同一结构生成）
├── prompts/                # 夜班提示词模板（工艺，渲染发生在消费时）
│   ├── analyze.md          #   idea → analyzed
│   ├── write-spec.md       #   analyzed → specd（spec 落主仓 plans/）
│   ├── build-plugin.md     #   approved → delivered（仅人工拍板过的条目）
│   └── platform-constraints.md  # 公共 include：插件平台坑清单（夜班复盘须回写）
└── NNN-slug.md             # 条目，一需求一文件
```

## 状态机

`idea → analyzed → specd → approved → building → delivered → published`，旁路 `shelved`（搁置/否决，决策记录写原因）。

| status | 含义 | 谁有权设置 |
|---|---|---|
| idea | 已记录，未分析 | 人 / Polaris 插件 |
| analyzed | 已补全 brief，可能有待澄清问题 | 夜班 |
| specd | spec 已写（主仓 plans/），待拍板 | 夜班 |
| approved | 已拍板，允许实施 | **仅人** |
| building | 实施中 | 夜班 |
| delivered | 已交付已本地提交（delivered 回填 commit） | 夜班 |
| published | 已上架（index.json + tag 已推） | 人 |
| shelved | 搁置/否决 | 人 / 夜班建议 |

## frontmatter 字段定义

```yaml
id: "001"          # = 文件名序号，永不改（改名断历史链接）
title: xxx         # 短标题
status: idea       # 上述枚举
priority: high     # high | medium | low
tags: [a, b]       # 小写短词
origin: polaris-chat  # polaris-chat | manual | zcode
created: 2026-10-30   # YYYY-MM-DD
updated: 2026-10-30
spec: ""           # 主仓 plans/ spec 路径（相对或绝对），夜班回填
delivered: ""      # commit hash / tag，夜班回填
```

正文固定节：`## 一句话`、`## 目标（做什么）`、`## 边界（明确不做什么）`、`## 验收（怎么算完成）`、`## 待澄清`、`## 决策记录`。

## 硬规则

1. **公开仓红线**：本仓库经 GitHub + jsdelivr CDN 公开。条目与模板中**禁止**出现 token、密钥、内网地址、私人信息。
2. **id 永不改名**。序号 = 扫描现有最大号 +1（三位零填充），写入用排他创建，撞号递增重试。
3. **编码**：一律 UTF-8 无 BOM，用 Node fs 读写；禁止经 PowerShell 中转（GBK 碎中文）。
4. **写入原子**：tmp + rename，禁止半截文件（工具已保证；手改文件保存即原子）。
5. **并发**：程序化更新必须带 `expectedMtimeMs` 乐观锁（needs_show / needs_list 返回）；冲突即拒绝重读。
6. **单一权威**：状态枚举、字段名以本文件为准。发现代码/提示词与本文件不一致，以本文件为准并修代码。
7. **文件即真相**：两端均不建影子副本，每次现扫描。人手编辑与程序写入地位相同。

## 两端职责

- **Polaris 插件**（`plugins/needs`）：记录、查询、更新、渲染开工提示词。不 commit 不 push。
- **ZCode 夜班**：分析、写 spec、实施。**禁区**：不 push、不 tag、不改 `index.json`、不改 delivered/published 条目、每夜最多实施 1 个 approved 条目、本地 commit 允许（`chore(needs): ...` 风格）、不碰 needs/ 与 plans/ 之外的业务代码。

## 工具一览（两端共用同一 server.js）

`needs_config`（读/设根目录）· `needs_add` · `needs_list` · `needs_show` · `needs_update`（乐观锁）· `needs_handoff`（渲染 prompts/ 模板为完整开工提示词）
